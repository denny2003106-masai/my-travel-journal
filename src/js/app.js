/* ==========================================================================
   Travel Journal - Main Application Controller
   ========================================================================== */

import '../style.css'; // 載入 Glassmorphism 樣式
import JSZip from 'jszip';
import { authState, login, logout, isTokenValid, initGoogleAuth, updateClientId } from './auth.js';
import { 
  findOrCreateFolder, 
  findFileInFolder, 
  downloadTextFile, 
  updateFileContent, 
  uploadFile, 
  deleteFile, 
  getDirectFileUrl,
  downloadBlobFile 
} from './drive.js';
import { getPhotoLocation, getPlaceNameFromGPS, compressImage, clusterPhotos, selectDiversePhotos } from './gps.js';
import { startRecording, stopRecording, isSpeechSupported } from './audio.js';
import { searchInspirationPhotos, searchKeys, updateSearchKeys } from './search.js';
import { filterJournalData, exportToHtmlFile, exportToMarkdownZip, exportToPdf } from './export.js';
import { generateSinglePageHtml } from './templates.js';

// 全域狀態
let tripsData = { trips: [] };
let driveFolderId = null;
let tripsJsonFileId = null;
let currentTripId = null;
let editingSpotId = null; // null 表示新增，有值表示編輯中
let currentSpotPhotos = []; // 編輯中的臨時相片資料 [{ id, file, driveFileId, comment, audioFileId }]
let activeMediaRecorderState = 'idle'; // 'idle' | 'recording'
let theme = localStorage.getItem('tj_theme') || 'dark';
let isAdjustingOrder = false;
let draggedItemIndex = null;
let activeToastTimeout = null;

// 頁面加載時註冊 Service Worker 且支援更新自動重整
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('偵測到新版本【旅遊手札】，即將自動重新整理網頁！');
                showSuccessToast('系統已下載最新更新，即將為您重新整理網頁...');
                setTimeout(() => {
                  window.location.reload();
                }, 1500);
              }
            });
          }
        });
      })
      .catch(err => {
        console.warn('ServiceWorker 註冊失敗: ', err);
      });
  });
}

// 主初始化程序
window.addEventListener('DOMContentLoaded', () => {
  // 檢查是否為分享查看模式
  const urlParams = new URLSearchParams(window.location.search);
  const shareId = urlParams.get('share');
  if (shareId) {
    // 1. 顯示精美載入中畫面
    document.body.innerHTML = `
      <div id="share-loader" style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#0f172a;color:#ffffff;display:flex;flex-direction:column;justify-content:center;align-items:center;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
        <div style="width:50px;height:50px;border:5px solid #1e293b;border-top:5px solid #ff4b2b;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:16px;"></div>
        <div style="font-size:1.1rem;font-weight:bold;margin-bottom:8px;">正在載入旅跡手札...</div>
        <div style="font-size:0.85rem;color:#64748b;">請稍候，正在讀取成果資料與音樂設定</div>
        <style>
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </div>
    `;

    // 2. 拉取 API 數據並渲染
    fetch(`/api/share?id=${shareId}`)
      .then(res => {
        if (!res.ok) throw new Error('無法取得分享資料');
        return res.json();
      })
      .then(data => {
        const { trip, spots, theme: selectedTheme } = data;
        const html = generateSinglePageHtml(trip, spots, selectedTheme || 'youth');

        // 3. 建立網頁頂部宣傳橫幅 (Viral Call to Action)
        const bannerHtml = `
          <div id="shared-page-banner" style="background: linear-gradient(135deg, #2563eb, #7c3aed); color: #ffffff; text-align: center; padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.85rem; font-weight: bold; position: relative; z-index: 99999999; box-shadow: 0 4px 15px rgba(0,0,0,0.25); display: flex; justify-content: center; align-items: center; gap: 12px; flex-wrap: wrap;">
            <span>✨ 這是您的朋友分享給您的【旅跡手札】！您也可以隨時記錄屬於自己的旅遊軌跡。</span>
            <a href="/" target="_blank" style="background: #ffffff; color: #1e1b4b; text-decoration: none; padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: bold; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">立即免費建立</a>
          </div>
        `;

        // 4. 重寫頁面文檔
        document.open();
        document.write(html);
        document.close();

        // 5. 插入導航條橫幅
        const div = document.createElement('div');
        div.innerHTML = bannerHtml;
        document.body.insertBefore(div.firstElementChild, document.body.firstChild);
      })
      .catch(err => {
        document.getElementById('share-loader').innerHTML = `
          <div style="text-align:center;padding:24px;max-width:400px;font-family:sans-serif;">
            <div style="font-size:3rem;margin-bottom:16px;">⚠️</div>
            <div style="font-size:1.2rem;font-weight:bold;margin-bottom:8px;color:#ef4444;">載入分享失敗</div>
            <p style="font-size:0.85rem;color:#94a3b8;line-height:1.6;margin-bottom:16px;">該行程可能已被作者取消分享或刪除，或該分享設定已失效。</p>
            <a href="/" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:8px 20px;border-radius:20px;font-size:0.85rem;font-weight:bold;box-shadow:0 4px 10px rgba(37,99,235,0.3);display:inline-block;">建立我自己的手札</a>
          </div>
        `;
      });
    return; // 終止後續的登入與 appShell 初始化
  }

  // 套用主題
  document.documentElement.setAttribute('data-theme', theme);
  
  // 初始化渲染
  renderAppShell();
  
  // 嘗試載入 Google API 憑證
  setTimeout(() => {
    initGoogleAuth(
      (auth) => {
        showSuccessToast('Google API 初始化成功！');
        if (isTokenValid()) {
          syncWithGoogleDrive();
        }
      },
      (err) => {
        console.warn('Google 登入套件初始化失敗，需自訂 Client ID：', err);
      }
    );
  }, 1000);

  // 監聽視窗重新獲得焦點：防止登入彈出視窗關閉或取消後 loader 狀態卡死
  window.addEventListener('focus', () => {
    const loaderText = document.getElementById('loader-text');
    const fullLoader = document.getElementById('full-loader');
    if (fullLoader && fullLoader.style.display === 'flex' && loaderText && loaderText.innerText.includes('正在登入 Google')) {
      // 延遲 1.5 秒以避免與正常登入成功的回呼產生 race condition 衝突
      setTimeout(() => {
        if (fullLoader.style.display === 'flex' && loaderText.innerText.includes('正在登入 Google') && !isTokenValid()) {
          hideLoader();
          showErrorToast('已取消登入或登入視窗已關閉，返回起始畫面');
        }
      }, 1500);
    }
  });
});

/* ==========================================================================
   UI 核心渲染模組 (App Shell)
   ========================================================================== */

function renderAppShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <!-- 全域載入狀態 -->
    <div id="full-loader" class="full-loader" style="display: none;">
      <div class="spinner"></div>
      <div id="loader-text" style="color: var(--text-primary);">正在載入...</div>
    </div>

    <!-- Toast 訊息通知 -->
    <div id="toast-msg" style="position: fixed; bottom: 85px; left: 50%; transform: translateX(-50%) translateY(100px); background: var(--accent-secondary); color: white; padding: 12px 24px; border-radius: 30px; font-size: 0.9rem; z-index: 1000; box-shadow: 0 4px 20px rgba(0,0,0,0.3); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease; opacity: 0; font-weight: 500; pointer-events: none; text-align: center;"></div>

    <!-- 主頁面容器 -->
    <div id="view-container" style="width: 100%; height: 100%; display: flex; flex-direction: column;"></div>

    <!-- 抽屜 Modal 覆蓋層 -->
    <div id="modal-overlay" class="modal-overlay" onclick="closeActiveModal(event)">
      <div id="modal-sheet" class="modal-sheet" onclick="event.stopPropagation()">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <h2 id="modal-title">標題</h2>
          <button class="btn btn-icon" onclick="hideModal()"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="modal-body" class="modal-body"></div>
      </div>
    </div>
  `;

  // 根據登入狀態決定渲染 Onboarding 還是 Dashboard
  if (isTokenValid()) {
    syncWithGoogleDrive();
  } else {
    renderOnboardingView();
  }
}

/**
 * 顯示 Onboarding 畫面
 */
function renderOnboardingView() {
  const container = document.getElementById('view-container');
  container.innerHTML = `
    <div class="scrollable">
      <div class="onboarding-container">
        <div class="logo-animation">
          <i class="fa-solid fa-map-location-dot" style="color: #0b0914;"></i>
        </div>
        <h2 class="onboarding-title">旅遊手札</h2>
        <p class="onboarding-desc">您專屬的無伺服器、零資料庫相片與語音手札。資料 100% 儲存在您自己的 Google 雲端硬碟中，安全無虞。</p>
        
        <div class="features-list">
          <div class="feature-item">
            <div class="feature-icon"><i class="fa-solid fa-camera"></i></div>
            <div class="feature-text">
              <h4>照片自動擷取定位</h4>
              <p>拍攝或上傳照片，自動讀取 GPS 地點，一鍵帶入景點名。</p>
            </div>
          </div>
          <div class="feature-item">
            <div class="feature-icon"><i class="fa-solid fa-microphone"></i></div>
            <div class="feature-text">
              <h4>語音與隨筆感受記錄</h4>
              <p>到景點隨手錄音或輸入文字，事後自動將語音轉為文字。</p>
            </div>
          </div>
          <div class="feature-item">
            <div class="feature-icon"><i class="fa-solid fa-cloud-arrow-up"></i></div>
            <div class="feature-text">
              <h4>無資料庫雲端同步</h4>
              <p>登入個人 Google 帳戶，直接同步讀寫雲端硬碟，零負擔。</p>
            </div>
          </div>
          <div class="feature-item">
            <div class="feature-icon"><i class="fa-solid fa-file-export"></i></div>
            <div class="feature-text">
              <h4>一鍵生成旅遊網頁</h4>
              <p>匯出 Markdown 文件或可嵌入 Google 協作平台的單頁 HTML。</p>
            </div>
          </div>
        </div>

        <div style="width: 100%; max-width: 340px; display: flex; flex-direction: column; gap: 12px; align-items: center;">
          <button id="btn-login" class="btn btn-primary" style="padding: 14px 20px; font-size: 1.05rem; width: 100%;">
            <i class="fa-brands fa-google"></i> 使用 Google 帳戶登入
          </button>
          
          <button id="btn-user-manual" class="btn btn-secondary" style="padding: 10px; font-size: 0.85rem; width: 100%; margin-top: 8px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-glass);">
            <i class="fa-regular fa-compass"></i> 📖 第一次使用？看這篇簡單說明書
          </button>

          <button id="btn-help-client-id" class="btn btn-secondary" style="padding: 10px; font-size: 0.85rem; width: 100%; margin-top: 4px; background: rgba(255,255,255,0.05); border: 1px dashed var(--border-glass);">
            <i class="fa-regular fa-circle-question"></i> 如何查詢 Client ID？
          </button>

          <button id="btn-help-pin-desktop" class="btn btn-secondary" style="padding: 10px; font-size: 0.85rem; width: 100%; margin-top: 4px; background: rgba(255,255,255,0.05); border: 1px dashed var(--border-glass);">
            <i class="fa-solid fa-mobile-screen-button"></i> 📌 釘選手機桌面教學 (像 App 一樣使用)
          </button>

          <span id="btn-open-settings" style="font-size: 0.75rem; color: var(--text-secondary); cursor: pointer; text-decoration: underline; opacity: 0.5; margin-top: 16px; transition: opacity 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=0.5">
            進階設定 (自訂 Client ID)
          </span>
        </div>
      </div>
    </div>
  `;

  // 綁定事件
  document.getElementById('btn-login').addEventListener('click', handleLogin);
  document.getElementById('btn-open-settings').addEventListener('click', showSettingsModal);
  document.getElementById('btn-help-client-id').addEventListener('click', showClientIdHelpModal);
  document.getElementById('btn-user-manual').addEventListener('click', showUserManualModal);
  document.getElementById('btn-help-pin-desktop').addEventListener('click', showPinToDesktopModal);
}

/**
 * 顯示 Dashboard 畫面
 */
function renderDashboardView() {
  const container = document.getElementById('view-container');
  container.innerHTML = `
    <header>
      <h1>旅遊手札</h1>
      <div class="header-actions">
        <button class="btn btn-icon" onclick="window.toggleThemeGlobal()" title="切換主題"><i class="fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}"></i></button>
        <button class="btn btn-icon" id="btn-dashboard-manual" title="使用說明書"><i class="fa-regular fa-compass"></i></button>
        <button class="btn btn-icon" id="btn-export-all" title="匯出成果"><i class="fa-solid fa-file-export"></i></button>
        <button class="btn btn-icon" id="btn-settings" title="設定"><i class="fa-solid fa-gears"></i></button>
        <button class="btn btn-icon" id="btn-logout" title="登出"><i class="fa-solid fa-right-from-bracket"></i></button>
      </div>
    </header>
    
    <div class="scrollable">
      <div style="margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <h2 style="font-size: 1.3rem; font-weight: 700;">我的行程</h2>
          <p style="font-size: 0.8rem; color: var(--text-secondary);">已連接雲端：${authState.userEmail}</p>
        </div>
      </div>

      <div id="trips-list-container">
        <!-- 行程清單將在此渲染 -->
      </div>
    </div>

    <!-- 浮動新增按鈕 (FAB) -->
    <button class="fab" id="fab-add-trip" title="新增行程"><i class="fa-solid fa-plus"></i></button>
  `;

  // 全域綁定主題切換以便 HTML 使用
  window.toggleThemeGlobal = () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tj_theme', theme);
    const themeIcon = document.querySelector('.header-actions .fa-sun, .header-actions .fa-moon');
    if (themeIcon) {
      themeIcon.className = `fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`;
    }
  };

  // 綁定事件
  document.getElementById('fab-add-trip').addEventListener('click', showAddTripModal);
  document.getElementById('btn-logout').addEventListener('click', handleLogout);
  document.getElementById('btn-settings').addEventListener('click', showSettingsModal);
  document.getElementById('btn-export-all').addEventListener('click', showExportModal);
  document.getElementById('btn-dashboard-manual').addEventListener('click', showUserManualModal);

  renderTripsList();
}

/**
 * 顯示行程細節畫面 (代替 Dashboard 或覆蓋其上)
 */
function renderTripDetailsView(tripId) {
  currentTripId = tripId;
  const trip = tripsData.trips.find(t => t.id === tripId);
  if (!trip) {
    showErrorToast('找不到此行程');
    renderDashboardView();
    return;
  }

  const container = document.getElementById('view-container');
  container.innerHTML = `
    <header>
      <div style="display: flex; align-items: center; gap: 12px;">
        <button class="btn btn-icon" id="btn-back-dashboard"><i class="fa-solid fa-arrow-left"></i></button>
        <div>
          <h1 style="font-size: 1.15rem; margin-bottom: 2px;">${trip.name}</h1>
          <p style="font-size: 0.75rem; color: var(--text-secondary);"><i class="fa-solid fa-map-location-dot"></i> ${trip.region || '未設定區域'}</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn btn-icon" id="btn-trip-export" title="匯出此行程"><i class="fa-solid fa-file-export"></i></button>
        <button class="btn btn-icon text-danger" id="btn-delete-trip" title="刪除行程"><i class="fa-solid fa-trash"></i></button>
      </div>
    </header>

    <div class="scrollable">
      <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.85rem; color: var(--text-secondary);"><i class="fa-regular fa-calendar-days"></i> ${trip.startDate || ''} ~ ${trip.endDate || ''}</span>
        <div style="display:flex; gap:8px;">
          ${isAdjustingOrder ? '' : `
            <button class="btn btn-secondary" id="btn-bulk-import" style="padding: 6px 12px; font-size: 0.8rem;"><i class="fa-solid fa-images"></i> 批次匯入</button>
          `}
          <button class="btn ${isAdjustingOrder ? 'btn-primary' : 'btn-secondary'}" id="btn-adjust-order" style="padding: 6px 12px; font-size: 0.8rem;">
            ${isAdjustingOrder ? '<i class="fa-solid fa-check"></i> 確認順序' : '<i class="fa-solid fa-up-down-left-right"></i> 調整順序'}
          </button>
          <button class="btn btn-secondary" id="btn-edit-trip-meta" style="padding: 6px 12px; font-size: 0.8rem;"><i class="fa-solid fa-pen"></i> 編輯</button>
        </div>
      </div>

      <div id="spots-timeline-container" class="timeline">
        <!-- 景點時間軸將在此渲染 -->
      </div>
    </div>

    <!-- 浮動新增景點按鈕 -->
    ${isAdjustingOrder ? '' : `<button class="fab" id="fab-add-spot" title="新增景點"><i class="fa-solid fa-location-arrow"></i></button>`}
  `;

  // 綁定事件
  document.getElementById('btn-back-dashboard').addEventListener('click', () => {
    isAdjustingOrder = false; // 重置順序編輯狀態
    renderDashboardView();
  });
  if (!isAdjustingOrder) {
    document.getElementById('fab-add-spot').addEventListener('click', () => showSpotEditorModal(null));
    document.getElementById('btn-bulk-import').addEventListener('click', handleBulkImportTrigger);
  }
  document.getElementById('btn-delete-trip').addEventListener('click', () => handleDeleteTrip(tripId));
  document.getElementById('btn-edit-trip-meta').addEventListener('click', () => showEditTripMetaModal(trip));
  document.getElementById('btn-trip-export').addEventListener('click', () => showExportModal(tripId));
  
  document.getElementById('btn-adjust-order').addEventListener('click', async () => {
    if (isAdjustingOrder) {
      isAdjustingOrder = false;
      await saveTripsToCloud();
      renderTripDetailsView(tripId);
    } else {
      isAdjustingOrder = true;
      renderTripDetailsView(tripId);
    }
  });

  renderSpotsTimeline(trip);
}

/* ==========================================================================
   清單元件渲染子模組
   ========================================================================== */

function renderTripsList() {
  const container = document.getElementById('trips-list-container');
  if (!tripsData.trips || tripsData.trips.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 24px; color: var(--text-secondary);">
        <i class="fa-solid fa-mountain-sun" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 16px; display: block;"></i>
        <p style="font-weight: 500; margin-bottom: 6px;">目前尚無行程</p>
        <p style="font-size: 0.8rem; color: var(--text-muted);">點擊右下角的「+」按鈕，開啟您的一趟精彩旅程！</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  tripsData.trips.forEach(trip => {
    const card = document.createElement('div');
    card.className = 'card trip-card';
    card.style.cursor = 'pointer';
    
    // 計算該行程總景點數與照片數
    const spotCount = trip.spots ? trip.spots.length : 0;
    let photoCount = 0;
    if (trip.spots) {
      trip.spots.forEach(s => { photoCount += s.photos ? s.photos.length : 0; });
    }

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; width: 100%;">
        <h3 class="trip-title" style="margin-right:12px; flex:1;">${trip.name}</h3>
        <button class="btn btn-icon btn-delete-trip-card" data-id="${trip.id}" title="刪除此旅程" style="padding:4px; font-size:0.95rem; background:none; border:none; color:var(--danger); cursor:pointer; min-width:32px; height:32px;">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
      <div class="trip-meta">
        <span><i class="fa-solid fa-map-location-dot"></i> ${trip.region || '未填寫'}</span>
        <span><i class="fa-regular fa-calendar-days"></i> ${trip.startDate || ''} ~ ${trip.endDate || ''}</span>
        <span><i class="fa-solid fa-location-dot"></i> ${spotCount} 個景點</span>
        <span><i class="fa-solid fa-camera"></i> ${photoCount} 張相片</span>
      </div>
    `;

    card.addEventListener('click', (e) => {
      // 點擊垃圾桶時阻斷事件氣泡傳遞，避免點進旅程頁面
      if (e.target.closest('.btn-delete-trip-card')) {
        e.stopPropagation();
        const tripId = e.target.closest('.btn-delete-trip-card').dataset.id;
        handleDeleteTrip(tripId);
        return;
      }
      renderTripDetailsView(trip.id);
    });
    container.appendChild(card);
  });
}

function renderSpotsTimeline(trip) {
  const container = document.getElementById('spots-timeline-container');
  if (!trip.spots || trip.spots.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 24px; color: var(--text-secondary);">
        <i class="fa-solid fa-map-pin" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 16px; display: block;"></i>
        <p style="font-weight: 500; margin-bottom: 6px;">尚未記錄景點</p>
        <p style="font-size: 0.8rem; color: var(--text-muted);">每到一處景點，請點擊右下角「記錄此處」！</p>
      </div>
    `;
    return;
  }

  // 預設以照片的日期與時間為原則排序景點，如果沒有照片，使用景點造訪日期
  if (!isAdjustingOrder) {
    trip.spots.sort((a, b) => {
      const getSpotTimestamp = (spot) => {
        if (spot.photos && spot.photos.length > 0) {
          const timestamps = spot.photos.map(p => p.timestamp).filter(t => typeof t === 'number' && !isNaN(t));
          if (timestamps.length > 0) return Math.min(...timestamps);
        }
        if (spot.date) {
          const t = new Date(spot.date).getTime();
          if (!isNaN(t)) return t;
        }
        return 0; // 找不到有效時間則排在最前面
      };
      return getSpotTimestamp(a) - getSpotTimestamp(b);
    });
  }

  // 拖曳事件處理器
  const handleDragStart = function(e) {
    draggedItemIndex = parseInt(this.dataset.index, 10);
    this.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDrop = function(e) {
    e.preventDefault();
    const targetIndex = parseInt(this.dataset.index, 10);
    if (draggedItemIndex !== null && draggedItemIndex !== targetIndex) {
      const draggedSpot = trip.spots[draggedItemIndex];
      trip.spots.splice(draggedItemIndex, 1);
      trip.spots.splice(targetIndex, 0, draggedSpot);
      renderSpotsTimeline(trip);
    }
  };
  const handleDragEnd = function() {
    this.style.opacity = '1';
    draggedItemIndex = null;
  };

  container.innerHTML = '';
  
  trip.spots.forEach((spot, idx) => {
    const item = document.createElement('div');
    item.className = 'spot-item';

    if (isAdjustingOrder) {
      item.setAttribute('draggable', 'true');
      item.style.cursor = 'grab';
      item.dataset.index = idx;
      item.innerHTML = `
        <div class="spot-timeline">
          <div class="spot-marker" style="background:var(--accent-secondary);"><i class="fa-solid fa-grip-lines" style="color:#0b0914;"></i></div>
          <div class="spot-line"></div>
        </div>
        <div class="spot-content" style="flex:1; margin-bottom: 16px; border: 1px dashed var(--accent-primary); background: rgba(0, 242, 254, 0.04);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h4 style="font-weight: 700; font-size:1.05rem;"><i class="fa-solid fa-bars" style="margin-right:8px; color:var(--accent-primary);"></i> ${spot.name}</h4>
            <span style="font-size:0.75rem; color:var(--text-muted);">${spot.date}</span>
          </div>
        </div>
      `;
      item.addEventListener('dragstart', handleDragStart);
      item.addEventListener('dragover', handleDragOver);
      item.addEventListener('drop', handleDrop);
      item.addEventListener('dragend', handleDragEnd);
      container.appendChild(item);
      return;
    }

    // 建立照片幻燈片 HTML
    let photosHtml = '';
    if (spot.photos && spot.photos.length > 0) {
      photosHtml = `<div style="display: flex; gap: 8px; overflow-x: auto; margin-top: 12px; padding-bottom: 4px;">`;
      spot.photos.forEach(p => {
        const url = getDirectFileUrl(p.driveFileId);
        photosHtml += `
          <div style="width: 80px; height: 80px; border-radius: 8px; overflow:hidden; flex-shrink: 0; border: 1px solid var(--border-glass);">
            <img src="${url}" style="width:100%; height:100%; object-fit:cover;" onclick="window.previewSpotPhoto('${url}', '${p.comment || ''}')"/>
          </div>
        `;
      });
      photosHtml += `</div>`;
    }

    // 語音播放器 HTML
    let audioHtml = '';
    if (spot.photos) {
      // 找出有語音備份的照片
      const voicePhotos = spot.photos.filter(p => p.audioFileId);
      if (voicePhotos.length > 0) {
        audioHtml = `<div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">`;
        voicePhotos.forEach(p => {
          audioHtml += `
            <div class="audio-player" style="margin-bottom:0;">
              <button onclick="window.playAudioFile('${p.audioFileId}', this)"><i class="fa-solid fa-play"></i></button>
              <div class="audio-info">語音感想 (${p.originalName || '照片'})</div>
            </div>
          `;
        });
        audioHtml += `</div>`;
      }
    }

    const locText = spot.location && spot.location.address ? `
      <div style="font-size:0.75rem; color:var(--text-secondary); margin-top: 4px; display:flex; align-items:center; gap:4px;">
        <i class="fa-solid fa-location-dot" style="color:var(--accent-primary);"></i> ${spot.location.address}
      </div>
    ` : '';

    item.innerHTML = `
      <div class="spot-timeline">
        <div class="spot-marker">${idx + 1}</div>
        <div class="spot-line"></div>
      </div>
      <div class="spot-content" style="flex:1; margin-bottom: 16px; cursor: pointer;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <h4 style="font-weight: 700; font-size:1.05rem;">${spot.name}</h4>
          <span style="font-size:0.75rem; color:var(--text-muted);">${spot.date}</span>
        </div>
        ${locText}
        <p style="font-size: 0.9rem; margin-top: 8px; white-space: pre-wrap; color: var(--text-primary);">${spot.description || '點擊以編輯此景點的感受隨筆...'}</p>
        ${photosHtml}
        ${audioHtml}
      </div>
    `;

    // 點擊景點卡片即可進行編輯 (排除點擊圖片和播放按鈕的事件)
    item.querySelector('.spot-content').addEventListener('click', (e) => {
      if (e.target.tagName !== 'IMG' && e.target.tagName !== 'I' && e.target.tagName !== 'BUTTON') {
        showSpotEditorModal(spot.id);
      }
    });

    container.appendChild(item);
  });

  // 全域綁定照片預覽功能
  window.previewSpotPhoto = (url, comment) => {
    showModal('照片檢視', `
      <div style="text-align:center;">
        <img src="${url}" style="max-width:100%; max-height:400px; border-radius:12px; border: 1px solid var(--border-glass);" />
        ${comment ? `<p style="margin-top: 12px; font-size: 0.95rem; color: var(--text-primary); text-align: left; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">${comment}</p>` : ''}
      </div>
    `);
  };

  // 全域語音播放控制 (利用 downloadBlobFile 以 Bearer Token 安全下載後在本機使用 Blob URL 播放，繞過 Google Drive 的 CORS 與下載阻擋限制)
  let currentAudio = null;
  window.playAudioFile = async (driveFileId, btn) => {
    if (currentAudio && !currentAudio.paused) {
      currentAudio.pause();
      btn.innerHTML = '<i class="fa-solid fa-play"></i>';
      if (btn.dataset.playing === 'true') {
        btn.dataset.playing = 'false';
        currentAudio = null;
        return;
      }
    }

    // 重置所有播放按鈕狀態
    document.querySelectorAll('.audio-player button').forEach(b => {
      b.innerHTML = '<i class="fa-solid fa-play"></i>';
      b.dataset.playing = 'false';
    });

    try {
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      const blob = await downloadBlobFile(driveFileId);
      const blobUrl = URL.createObjectURL(blob);
      
      const audio = new Audio(blobUrl);
      audio.play();
      currentAudio = audio;
      btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
      btn.dataset.playing = 'true';
      
      audio.onended = () => {
        btn.innerHTML = '<i class="fa-solid fa-play"></i>';
        btn.dataset.playing = 'false';
        currentAudio = null;
        URL.revokeObjectURL(blobUrl);
      };
    } catch (err) {
      console.error('播放錄音檔失敗:', err);
      showErrorToast('無法下載並播放該錄音檔！');
      btn.innerHTML = '<i class="fa-solid fa-play"></i>';
      btn.dataset.playing = 'false';
    }
  };
}

/* ==========================================================================
   使用者事件處理 (Login, Logout, Sync)
   ========================================================================== */

function handleLogin() {
  showLoader('正在登入 Google 帳戶並授權...');
  login(
    (auth) => {
      showSuccessToast(`歡迎回來，${auth.userName}！`);
      syncWithGoogleDrive();
    },
    (err) => {
      hideLoader();
      showModal('登入錯誤', `
        <div style="text-align: center;">
          <p style="color: var(--danger); font-weight: 500; margin-bottom: 12px;">${err}</p>
          <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; text-align: left; margin-bottom: 16px;">
            提示：如果您在本地測試 (localhost)，請確保在 Google Cloud Developer Console 建立了正確的 OAuth Client ID，並將當前網址設為授權重新導向網址。
          </p>
          <button class="btn btn-secondary" onclick="window.openSettingsDrawer()">開啟進階設定</button>
        </div>
      `);
    }
  );
}

// 提供一個全域彈出設定的方法
window.openSettingsDrawer = () => {
  hideModal();
  showSettingsModal();
};

function handleLogout() {
  logout();
  tripsData = { trips: [] };
  driveFolderId = null;
  tripsJsonFileId = null;
  showSuccessToast('已安全登出');
  renderOnboardingView();
}

/**
 * 與 Google 雲端硬碟同步，下載或建立 trips.json
 */
async function syncWithGoogleDrive() {
  showLoader('正在與 Google 雲端硬碟同步資料...');
  try {
    // 1. 尋找或建立主資料夾
    driveFolderId = await findOrCreateFolder('MyTravelJournal');
    
    // 2. 尋找 trips.json
    tripsJsonFileId = await findFileInFolder(driveFolderId, 'trips.json');
    
    if (tripsJsonFileId) {
      // 3. 檔案存在，讀取載入
      const content = await downloadTextFile(tripsJsonFileId);
      try {
        tripsData = JSON.parse(content);
        if (!tripsData.trips) tripsData.trips = [];
      } catch (e) {
        console.warn('解析 trips.json 失敗，初始化為空結構：', e);
        tripsData = { trips: [] };
      }
    } else {
      // 4. 檔案不存在，建立新檔案
      tripsData = { trips: [] };
      const res = await uploadFile(
        driveFolderId,
        'trips.json',
        new Blob([JSON.stringify(tripsData)], { type: 'application/json' }),
        'application/json'
      );
      tripsJsonFileId = res;
    }
    
    hideLoader();
    renderDashboardView();
  } catch (err) {
    console.error('同步 Google Drive 失敗：', err);
    hideLoader();
    showErrorToast(`同步失敗: ${err.message}`);
    // 如果 Token 過期，重回登入頁
    handleLogout();
  }
}

/**
 * 將目前記憶體中的 tripsData 同步寫入雲端
 */
async function saveTripsToCloud() {
  showLoader('雲端硬碟存檔同步中...');
  try {
    if (!tripsJsonFileId) {
      tripsJsonFileId = await uploadFile(
        driveFolderId,
        'trips.json',
        new Blob([JSON.stringify(tripsData)], { type: 'application/json' }),
        'application/json'
      );
    } else {
      await updateFileContent(
        tripsJsonFileId,
        JSON.stringify(tripsData),
        'application/json'
      );
    }
    hideLoader();
    showSuccessToast('存檔已成功同步至雲端硬碟');
  } catch (err) {
    console.error('儲存至雲端失敗：', err);
    hideLoader();
    showErrorToast(`雲端存檔失敗：${err.message}`);
  }
}

/* ==========================================================================
   行程管理彈出框 (Trips Handlers)
   ========================================================================== */

function showAddTripModal() {
  showModal('新增旅程', `
    <form id="form-add-trip">
      <div class="form-group">
        <label for="new-trip-name">旅程名稱 <span style="color:var(--danger)">*</span></label>
        <input type="text" id="new-trip-name" class="form-control" placeholder="例如：九州賞櫻之旅" required />
      </div>
      <div class="form-group">
        <label for="new-trip-region">造訪地區/區域</label>
        <input type="text" id="new-trip-region" class="form-control" placeholder="例如：日本九州熊本地區" />
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div class="form-group">
          <label for="new-trip-start">出發日期</label>
          <input type="date" id="new-trip-start" class="form-control" />
        </div>
        <div class="form-group">
          <label for="new-trip-end">結束日期</label>
          <input type="date" id="new-trip-end" class="form-control" />
        </div>
      </div>
      <div style="display: flex; gap: 12px; margin-top: 16px;">
        <button type="button" class="btn btn-secondary" onclick="hideModal()" style="flex:1;">取消</button>
        <button type="submit" class="btn btn-primary" style="flex:1;">建立行程</button>
      </div>
    </form>
  `);

  document.getElementById('form-add-trip').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('new-trip-name').value;
    const region = document.getElementById('new-trip-region').value || '未填寫區域';
    const startDate = document.getElementById('new-trip-start').value || '';
    const endDate = document.getElementById('new-trip-end').value || '';

    const newTrip = {
      id: 'trip-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      name,
      region,
      startDate,
      endDate,
      spots: []
    };

    tripsData.trips.push(newTrip);
    hideModal();
    saveTripsToCloud().then(() => {
      renderTripsList();
    });
  });
}

function showEditTripMetaModal(trip) {
  showModal('編輯行程資料', `
    <form id="form-edit-trip">
      <div class="form-group">
        <label for="edit-trip-name">旅程名稱 <span style="color:var(--danger)">*</span></label>
        <input type="text" id="edit-trip-name" class="form-control" value="${trip.name}" required />
      </div>
      <div class="form-group">
        <label for="edit-trip-region">造訪地區/區域</label>
        <input type="text" id="edit-trip-region" class="form-control" value="${trip.region || ''}" />
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div class="form-group">
          <label for="edit-trip-start">出發日期</label>
          <input type="date" id="edit-trip-start" class="form-control" value="${trip.startDate || ''}" />
        </div>
        <div class="form-group">
          <label for="edit-trip-end">結束日期</label>
          <input type="date" id="edit-trip-end" class="form-control" value="${trip.endDate || ''}" />
        </div>
      </div>
      <div style="display: flex; gap: 12px; margin-top: 16px;">
        <button type="button" class="btn btn-secondary" onclick="hideModal()" style="flex:1;">取消</button>
        <button type="submit" class="btn btn-primary" style="flex:1;">保存</button>
      </div>
    </form>
  `);

  document.getElementById('form-edit-trip').addEventListener('submit', (e) => {
    e.preventDefault();
    trip.name = document.getElementById('edit-trip-name').value;
    trip.region = document.getElementById('edit-trip-region').value;
    trip.startDate = document.getElementById('edit-trip-start').value;
    trip.endDate = document.getElementById('edit-trip-end').value;

    hideModal();
    saveTripsToCloud().then(() => {
      renderTripDetailsView(trip.id);
    });
  });
}

function handleDeleteTrip(tripId) {
  const trip = tripsData.trips.find(t => t.id === tripId);
  const tripName = trip ? trip.name : '此旅程';
  const warningText = `⚠️【危險操作 - 刪除行程】⚠️\n\n您確定要刪除整個旅程「${tripName}」嗎？\n這將會清除此旅程內所有景點記錄與照片資訊！此動作「無法復原」！\n\n（註：存在 Google 雲端上的原始照片與錄音檔案將保留以保障您的資料安全，但本系統的行程項目將被徹底移除）\n\n確定請點擊「確定」進行刪除。`;
  
  if (confirm(warningText)) {
    const idx = tripsData.trips.findIndex(t => t.id === tripId);
    if (idx !== -1) {
      tripsData.trips.splice(idx, 1);
      saveTripsToCloud().then(() => {
        renderDashboardView();
      });
    }
  }
}

/* ==========================================================================
   景點管理與編輯器模組 (Spot Editor & Location & Audio)
   ========================================================================== */

/**
 * 顯示景點編輯彈出框
 * @param {string|null} spotId null 表示新增景點，否則為編輯已存在景點
 */
function showSpotEditorModal(spotId) {
  editingSpotId = spotId;
  const trip = tripsData.trips.find(t => t.id === currentTripId);
  const spot = spotId ? trip.spots.find(s => s.id === spotId) : null;

  // 初始化臨時上傳檔案清單
  currentSpotPhotos = spot ? [...(spot.photos || [])] : [];

  const title = spot ? '編輯景點記錄' : '新增景點記錄';
  const name = spot ? spot.name : '';
  const date = spot ? spot.date : new Date().toISOString().split('T')[0];
  const desc = spot ? spot.description : '';
  const lat = spot && spot.location ? spot.location.lat : '';
  const lng = spot && spot.location ? spot.location.lng : '';
  const address = spot && spot.location ? spot.location.address : '';

  showModal(title, `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <!-- 照片上傳區與縮圖 (移動到最上方) -->
      <div>
        <label style="display:block; font-size:0.85rem; font-weight:500; color:var(--text-secondary); margin-bottom:6px;">照片記錄 (1 ~ 8 張)</label>
        
        <div class="photo-uploader" onclick="document.getElementById('photo-file-input').click()">
          <i class="fa-solid fa-images"></i>
          <span>拍照或上傳照片</span>
          <span style="font-size:0.75rem; color:var(--text-muted);">支援擷取相片 GPS 定位與前端壓縮</span>
        </div>
        <input type="file" id="photo-file-input" multiple accept="image/*" style="display:none;" />
        
        <!-- 相片預覽網格 -->
        <div id="editor-photos-grid" class="photos-grid"></div>
      </div>

      <!-- 基本資料 (景點名稱) -->
      <div class="form-group">
        <label for="spot-name">景點名稱 <span style="color:var(--danger)">*</span></label>
        <input type="text" id="spot-name" class="form-control" value="${name}" placeholder="自動抓取照片資訊，或手動輸入，例如：熊本城" required />
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label for="spot-date">造訪日期</label>
          <input type="date" id="spot-date" class="form-control" value="${date}" />
        </div>
        <div class="form-group">
          <label>GPS 定位</label>
          <button class="btn btn-secondary" id="btn-fetch-gps" style="width:100%; font-size:0.8rem; padding:10px 6px;">
            <i class="fa-solid fa-location-crosshairs"></i> <span id="gps-status-text">${lat && lng ? '已定位' : '擷取目前定位'}</span>
          </button>
          <input type="hidden" id="spot-lat" value="${lat}" />
          <input type="hidden" id="spot-lng" value="${lng}" />
        </div>
      </div>

      <div class="form-group" style="margin-bottom:8px;">
        <label for="spot-address">景點詳細地址</label>
        <input type="text" id="spot-address" class="form-control" value="${address}" placeholder="自動解析定位或手動輸入..." />
      </div>

      <!-- 語音隨筆錄音區 -->
      <div class="audio-recorder-section">
        <label style="display:block; font-size:0.85rem; font-weight:500; color:var(--text-secondary);">錄音留言 (即時轉寫，並儲存錄音檔為備份)</label>
        <div class="record-btn-row">
          <button class="btn btn-danger" id="btn-record-toggle" style="width:50px; height:50px; border-radius:50%; padding:0; display:flex; align-items:center; justify-content:center;">
            <i class="fa-solid fa-microphone"></i>
          </button>
          
          <div class="record-visualizer">
            <div id="recording-wave" class="voice-wave">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
            <span id="recording-status-text" style="font-size:0.8rem; color:var(--text-secondary); margin-left:12px;">準備就緒</span>
          </div>
        </div>
      </div>

      <!-- 景點感受描述 -->
      <div class="form-group">
        <label for="spot-desc">在此處的整體感受隨筆</label>
        <textarea id="spot-desc" class="form-control" rows="3" placeholder="寫下當下最真實的感動與感受..." style="resize:none;">${desc}</textarea>
      </div>

      <!-- 送出與控制按鈕 -->
      <div style="display:flex; gap:12px; margin-top: 12px;">
        ${spotId ? `<button type="button" class="btn btn-danger" id="btn-delete-spot" style="flex:1;">刪除景點</button>` : ''}
        <button type="button" class="btn btn-secondary" onclick="hideModal()" style="flex:1;">取消</button>
        <button type="button" class="btn btn-primary" id="btn-save-spot" style="flex:2;">儲存記錄</button>
      </div>
    </div>
  `);

  // 綁定編輯器中各種動態渲染與監聽
  renderEditorPhotos();

  document.getElementById('photo-file-input').addEventListener('change', handlePhotoUpload);
  document.getElementById('btn-fetch-gps').addEventListener('click', handleCurrentGPSFetch);
  document.getElementById('btn-record-toggle').addEventListener('click', handleRecordToggle);
  document.getElementById('btn-save-spot').addEventListener('click', handleSaveSpot);
  
  if (spotId) {
    document.getElementById('btn-delete-spot').addEventListener('click', () => handleDeleteSpot(spotId));
  }
}

/**
 * 渲染編輯器中的照片清單與新增說明按鈕
 */
function renderEditorPhotos() {
  const grid = document.getElementById('editor-photos-grid');
  grid.innerHTML = '';
  
  if (currentSpotPhotos.length === 0) {
    grid.style.display = 'none';
    return;
  }
  grid.style.display = 'grid';

  currentSpotPhotos.forEach((photo, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'photo-wrapper';
    
    // 優先使用本地 ObjectURL 或 Google Drive 預覽網址
    const imgUrl = photo.localUrl || getDirectFileUrl(photo.driveFileId);

    wrapper.innerHTML = `
      <img src="${imgUrl}" />
      <button class="btn-delete-photo" onclick="window.removeEditorPhoto(${idx})"><i class="fa-solid fa-xmark"></i></button>
      <div class="photo-comment-badge" onclick="window.editPhotoComment(${idx})">
        ${photo.comment ? photo.comment : '<i class="fa-solid fa-pen"></i> 感想備註'}
      </div>
    `;
    grid.appendChild(wrapper);
  });

  // 全域註冊相片操作
  window.removeEditorPhoto = (idx) => {
    // 若已上傳雲端，稍後在 JSON 更新時會丟棄關聯 (暫不刪除雲端實體檔案以免誤刪，可供垃圾清理)
    currentSpotPhotos.splice(idx, 1);
    renderEditorPhotos();
  };

  window.editPhotoComment = (idx) => {
    const photo = currentSpotPhotos[idx];
    const comment = prompt('請輸入此張照片的即時感受與備註：', photo.comment || '');
    if (comment !== null) {
      photo.comment = comment;
      renderEditorPhotos();
    }
  };
}

/**
 * 處理照片上傳與 EXIF 解析 + 前端壓縮
 */
async function handlePhotoUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  if (currentSpotPhotos.length + files.length > 8) {
    showErrorToast('每個景點最多隻能上傳 8 張照片！');
    return;
  }

  showLoader('正在處理照片並分析 EXIF 資訊...');
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    try {
      // 1. 解析 GPS EXIF 資訊
      const gps = await getPhotoLocation(file);
      
      // 2. 在前端進行 Canvas 圖片壓縮
      const compressedBlob = await compressImage(file, 2048);
      const localUrl = URL.createObjectURL(compressedBlob);

      // 如果有讀到 EXIF 資訊，自動套用定位與日期！
      if (gps) {
        if (gps.lat !== null && gps.lng !== null) {
          document.getElementById('spot-lat').value = gps.lat;
          document.getElementById('spot-lng').value = gps.lng;
          document.getElementById('gps-status-text').innerText = 'EXIF 定位';
          
          // 異步解析地名
          getPlaceNameFromGPS(gps.lat, gps.lng).then(locObj => {
            document.getElementById('spot-address').value = locObj.address;
            // 景點名稱顯示最可能的景點名 (locObj.name)
            const nameInput = document.getElementById('spot-name');
            if (nameInput && nameInput.value.trim() === '') {
              nameInput.value = locObj.name;
            }
          });
        }
        
        if (gps.date) {
          document.getElementById('spot-date').value = gps.date;
        }
      }

      // 3. 上傳檔案到 Google Drive
      // 先建立一個隨機的獨特檔案名稱
      const cloudFilename = `photo-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.jpg`;
      const driveFileId = await uploadFile(driveFolderId, cloudFilename, compressedBlob, 'image/jpeg');

      currentSpotPhotos.push({
        id: 'photo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        driveFileId,
        originalName: file.name,
        localUrl,
        comment: '',
        timestamp: (gps && gps.timestamp) ? gps.timestamp : (file.lastModified || Date.now())
      });
      
    } catch (err) {
      console.error(err);
      showErrorToast(`照片處理失敗: ${file.name}`);
    }
  }

  hideLoader();
  renderEditorPhotos();
  if (files.length > 0) {
    showSuccessToast('照片上傳成功！');
  }
}

/**
 * 獲取當前手機定位 (HTML5 Geolocation)
 */
function handleCurrentGPSFetch() {
  const statusText = document.getElementById('gps-status-text');
  statusText.innerText = '正在定位中...';

  if (!navigator.geolocation) {
    showErrorToast('您的瀏覽器不支援 HTML5 定位。');
    statusText.innerText = '擷取目前定位';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      
      document.getElementById('spot-lat').value = lat;
      document.getElementById('spot-lng').value = lng;
      statusText.innerText = '定位成功';

      showLoader('正在解碼地址中...');
      const locObj = await getPlaceNameFromGPS(lat, lng);
      document.getElementById('spot-address').value = locObj.address;
      
      const nameInput = document.getElementById('spot-name');
      if (nameInput && nameInput.value.trim() === '') {
        nameInput.value = locObj.name;
      }
      hideLoader();
    },
    (err) => {
      console.warn(err);
      showErrorToast('無法取得 GPS 定位，請確認手機定位權限已開啟。');
      statusText.innerText = '定位失敗';
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

/**
 * 處理錄音切換 (MediaRecorder 與 Web Speech API)
 */
async function handleRecordToggle() {
  const btn = document.getElementById('btn-record-toggle');
  const statusText = document.getElementById('recording-status-text');
  const wave = document.getElementById('recording-wave');

  if (activeMediaRecorderState === 'idle') {
    // 啟動錄音
    activeMediaRecorderState = 'recording';
    btn.innerHTML = '<i class="fa-solid fa-stop"></i>';
    btn.style.background = 'var(--success)';
    statusText.innerText = '錄音辨識中，請說話...';
    wave.classList.add('recording');

    startRecording({
      onTranscript: (text, isFinal) => {
        // 即時將說話的字句顯示在狀態列上，避免直接覆寫整體感受框
        const statusText = document.getElementById('recording-status-text');
        if (statusText) statusText.innerText = '辨識中: ' + text;
      },
      onError: (err) => {
        showErrorToast(err);
        resetRecordUI();
      }
    });

  } else {
    // 停止錄音
    showLoader('語音處理與備份同步中...');
    const result = await stopRecording();
    resetRecordUI();

    if (result.audioBlob) {
      try {
        // 將語音檔案上傳至 Google Drive 備份
        const audioFilename = `audio-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.webm`;
        const audioFileId = await uploadFile(driveFolderId, audioFilename, result.audioBlob, result.audioBlob.type);
        
        // 綁定到最後一張照片上，或是記錄在 spot.photos 最新的項目上，以便事後下載或轉寫
        if (currentSpotPhotos.length > 0) {
          // 綁定到最新上傳的照片中
          currentSpotPhotos[currentSpotPhotos.length - 1].audioFileId = audioFileId;
          showSuccessToast('錄音備份成功！已綁定至最後一張照片。');
        } else {
          // 沒有相片時，在隨筆文字描述加註 metadata
          // 這裡我們暫時建立一個空相片項目作為語音載體
          currentSpotPhotos.push({
            id: 'photo-audio-' + Date.now(),
            driveFileId: '', // 無相片，僅語音
            audioFileId,
            originalName: '語音手札',
            comment: result.text || '語音備忘'
          });
          showSuccessToast('語音備份成功！已獨立存檔。');
        }

        // 把轉寫文字追加到景點描述中 (僅在錄音停止後一次性追加，且處理原本已有文字的情況)
        if (result.text) {
          const descTextarea = document.getElementById('spot-desc');
          if (descTextarea.value.trim()) {
            descTextarea.value = descTextarea.value + '\n' + result.text;
          } else {
            descTextarea.value = result.text;
          }
        }
      } catch (err) {
        console.error(err);
        showErrorToast('語音檔上傳至雲端失敗！');
      }
    }
    hideLoader();
  }
}

function resetRecordUI() {
  activeMediaRecorderState = 'idle';
  const btn = document.getElementById('btn-record-toggle');
  const statusText = document.getElementById('recording-status-text');
  const wave = document.getElementById('recording-wave');

  btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
  btn.style.background = 'var(--danger)';
  statusText.innerText = '錄音結束';
  wave.classList.remove('recording');
}

/**
 * 模仿美照搜尋
 */
async function handleInspirationSearch() {
  let query = document.getElementById('spot-name').value;
  if (!query) {
    query = document.getElementById('spot-address').value;
  }

  if (!query || query.trim() === '') {
    showErrorToast('請輸入景點名稱或地址以利搜尋美照建議！');
    return;
  }

  const drawer = document.getElementById('inspiration-drawer');
  const grid = document.getElementById('inspiration-photos-grid');
  
  drawer.style.display = 'block';
  grid.innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';

  try {
    const photos = await searchInspirationPhotos(query);
    grid.innerHTML = '';
    
    photos.forEach(p => {
      const card = document.createElement('div');
      card.className = 'inspiration-card';
      card.innerHTML = `
        <img src="${p.url}" />
        <div class="author-badge" onclick="window.open('${p.link}', '_blank')">
          ${p.author} (${p.source})
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (err) {
    grid.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted);">搜尋時發生錯誤</div>';
  }
}

/**
 * 儲存景點
 */
async function handleSaveSpot() {
  const name = document.getElementById('spot-name').value;
  const date = document.getElementById('spot-date').value;
  const description = document.getElementById('spot-desc').value;
  const lat = parseFloat(document.getElementById('spot-lat').value) || 0;
  const lng = parseFloat(document.getElementById('spot-lng').value) || 0;
  const address = document.getElementById('spot-address').value;

  if (!name || name.trim() === '') {
    showErrorToast('請填寫景點名稱！');
    return;
  }

  const trip = tripsData.trips.find(t => t.id === currentTripId);
  if (!trip) return;

  const spotData = {
    id: editingSpotId || 'spot-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    name,
    date,
    description,
    location: { lat, lng, address },
    photos: currentSpotPhotos.map(p => ({
      id: p.id,
      driveFileId: p.driveFileId,
      originalName: p.originalName,
      comment: p.comment,
      audioFileId: p.audioFileId || '',
      timestamp: typeof p.timestamp === 'number' && !isNaN(p.timestamp) ? p.timestamp : null
    }))
  };

  if (editingSpotId) {
    // 編輯現有
    const idx = trip.spots.findIndex(s => s.id === editingSpotId);
    if (idx !== -1) {
      trip.spots[idx] = spotData;
    }
  } else {
    // 新增
    if (!trip.spots) trip.spots = [];
    trip.spots.push(spotData);
  }

  // 保存到雲端前，預設以照片的日期與時間順序進行升冪排序，若無照片則以造訪日期排序 (以防寫入 Google Drive 的 JSON 本身是亂序)
  trip.spots.sort((a, b) => {
    const getSpotTimestamp = (spot) => {
      if (spot.photos && spot.photos.length > 0) {
        const timestamps = spot.photos.map(p => p.timestamp).filter(t => typeof t === 'number' && !isNaN(t) && t > 0);
        if (timestamps.length > 0) return Math.min(...timestamps);
      }
      if (spot.date) {
        const t = new Date(spot.date).getTime();
        if (!isNaN(t)) return t;
      }
      return 0; // 找不到時間則排最前面
    };
    return getSpotTimestamp(a) - getSpotTimestamp(b);
  });

  hideModal();
  await saveTripsToCloud();
  renderTripDetailsView(currentTripId);
}

async function handleDeleteSpot(spotId) {
  if (confirm('確認要刪除此景點記錄嗎？(雲端上的相片與錄音不會被同步清理)')) {
    const trip = tripsData.trips.find(t => t.id === currentTripId);
    if (trip) {
      const idx = trip.spots.findIndex(s => s.id === spotId);
      if (idx !== -1) {
        trip.spots.splice(idx, 1);
        hideModal();
        await saveTripsToCloud();
        renderTripDetailsView(currentTripId);
      }
    }
  }
}

/* ==========================================================================
   匯出模組彈出框 (Export UI Handlers)
   ========================================================================== */

/**
 * 顯示匯出彈出框
 * @param {string|null} preselectedTripId 預設選取的行程 ID (若在細節頁點擊匯出)
 */
function showExportModal(preselectedTripId = null) {
  let optionsHtml = '';
  
  if (tripsData.trips.length === 0) {
    showErrorToast('尚無任何行程資料可匯出！');
    return;
  }

  // 1. 生成行程下拉選單
  let tripsDropdown = `<select id="export-select-trip" class="form-control">`;
  tripsData.trips.forEach(t => {
    const selected = (t.id === preselectedTripId || t.id === currentTripId) ? 'selected' : '';
    tripsDropdown += `<option value="${t.id}" ${selected}>${t.name}</option>`;
  });
  tripsDropdown += `</select>`;

  // 2. 收集所有不重複的日期與區域
  const datesSet = new Set();
  const regionsSet = new Set();
  tripsData.trips.forEach(t => {
    if (t.region) regionsSet.add(t.region);
    if (t.spots) {
      t.spots.forEach(s => { if (s.date) datesSet.add(s.date); });
    }
  });

  let datesDropdown = `<select id="export-select-date" class="form-control" disabled>`;
  datesSet.forEach(d => { datesDropdown += `<option value="${d}">${d}</option>`; });
  datesDropdown += `</select>`;

  let regionsDropdown = `<select id="export-select-region" class="form-control" disabled>`;
  regionsSet.forEach(r => { regionsDropdown += `<option value="${r}">${r}</option>`; });
  regionsDropdown += `</select>`;

  showModal('匯出旅遊手札', `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <!-- 篩選方式 -->
      <div class="form-group">
        <label>1. 選擇匯出範圍：</label>
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
          <label style="display:inline-flex; align-items:center; gap:8px; font-weight:normal;">
            <input type="radio" name="export-filter" value="trip" checked /> 依【整個行程】匯出
          </label>
          <label style="display:inline-flex; align-items:center; gap:8px; font-weight:normal;">
            <input type="radio" name="export-filter" value="date" /> 依【選擇日期】匯出
          </label>
          <label style="display:inline-flex; align-items:center; gap:8px; font-weight:normal;">
            <input type="radio" name="export-filter" value="region" /> 依【選擇區域】匯出
          </label>
        </div>
      </div>

      <!-- 下拉選單區 -->
      <div class="form-group" id="group-export-trip">
        <label>選擇行程</label>
        ${tripsDropdown}
      </div>
      
      <div class="form-group" id="group-export-date">
        <label>選擇日期</label>
        ${datesDropdown}
      </div>

      <div class="form-group" id="group-export-region">
        <label>選擇區域 (例如：日本九州熊本地區)</label>
        ${regionsDropdown}
      </div>

      <!-- 風格與音樂主題選擇 (僅成果網頁有效) -->
      <div class="form-group" id="group-export-theme" style="border-top:1px solid var(--border-glass); padding-top:12px; margin-top:8px;">
        <label for="export-select-theme">2. 成果網頁風格與音樂主題：</label>
        <select id="export-select-theme" class="form-control">
          <option value="youth">青春 (德布西：《月光》)</option>
          <option value="hotblood">熱血 (蕭邦：《夜曲 Op.9 No.2》)</option>
          <option value="natural">自然 (蕭邦：《雨滴前奏曲》)</option>
          <option value="foodie">美食 (巴哈：《郭德堡變奏曲 - 詠嘆調》)</option>
          <option value="shopping">SHOPPING (貝多芬：《月光奏鳴曲 - 第一樂章》)</option>
          <option value="healing">療癒放空 (薩提：《第一號琴諾佩第》)</option>
        </select>
      </div>

      <div style="border-top:1px solid var(--border-glass); padding-top:12px; margin-top:8px;">
        <div style="display:flex; flex-direction:column; gap:12px;">
          <button class="btn btn-secondary" id="btn-do-export-share" style="background: linear-gradient(135deg, #2563eb, #7c3aed); color: white; border: none; font-weight: bold;">
            <i class="fa-solid fa-share-nodes"></i> 一鍵生成線上分享網址 (任何人免登入瀏覽)
          </button>

          <button class="btn btn-primary" id="btn-do-export-html">
            <i class="fa-solid fa-code"></i> 產生個人成果網頁 (HTML 單頁，適合嵌入 Google 協作平台)
          </button>
          
          <button class="btn btn-secondary" id="btn-do-export-md">
            <i class="fa-solid fa-file-zipper"></i> 匯出為 Markdown 打包檔 (.zip)
          </button>
        </div>
      </div>
    </div>
  `);

  // 綁定 Filter Radio 切換
  const radios = document.getElementsByName('export-filter');
  radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const val = e.target.value;
      document.getElementById('export-select-trip').disabled = val !== 'trip';
      document.getElementById('export-select-date').disabled = val !== 'date';
      document.getElementById('export-select-region').disabled = val !== 'region';
    });
  });

  document.getElementById('btn-do-export-share').addEventListener('click', () => handleExportAction('share'));
  document.getElementById('btn-do-export-html').addEventListener('click', () => handleExportAction('html'));
  document.getElementById('btn-do-export-md').addEventListener('click', () => handleExportAction('md'));
}

/**
 * 執行匯出核心程序
 */
async function handleExportAction(format) {
  const filterType = document.querySelector('input[name="export-filter"]:checked').value;
  let filterValue = '';
  
  if (filterType === 'trip') {
    filterValue = document.getElementById('export-select-trip').value;
  } else if (filterType === 'date') {
    filterValue = document.getElementById('export-select-date').value;
  } else if (filterType === 'region') {
    filterValue = document.getElementById('export-select-region').value;
  }

  // 取得篩選結果
  const exportItems = filterJournalData(tripsData, filterType, filterValue);
  
  if (exportItems.length === 0) {
    showErrorToast('找不到符合篩選條件的景點資料！');
    return;
  }

  // 為了簡化，如果跨行程匯出，我們以第一個匹配的行程元資料作為主體
  const mainTrip = exportItems[0].trip;
  
  // 合併所有符合的景點
  let allSpots = [];
  exportItems.forEach(item => {
    allSpots = [...allSpots, ...item.spots];
  });

  hideModal();

  if (format === 'html') {
    showLoader('正在產生個人旅遊成果單網頁...');
    try {
      const themeVal = document.getElementById('export-select-theme').value;
      exportToHtmlFile(mainTrip, allSpots, themeVal);
      showSuccessToast('網頁已成功生成並開始下載！');
    } catch (e) {
      showErrorToast(`網頁生成失敗: ${e.message}`);
    }
    hideLoader();
  } else if (format === 'pdf') {
    showLoader('正在準備產生 PDF 下載檔...');
    const themeVal = document.getElementById('export-select-theme').value;
    exportToPdf(
      mainTrip, 
      allSpots, 
      themeVal,
      (status) => {
        document.getElementById('loader-text').innerText = status;
      },
      () => {
        hideLoader();
        showSuccessToast('PDF 下載已成功開始！');
      },
      (err) => {
        hideLoader();
        showErrorToast(`PDF 產生失敗: ${err.message}`);
      }
    );
  } else if (format === 'share') {
    // 檢查是否有登入
    if (!authState.accessToken || !driveFolderId) {
      showErrorToast('請先登入 Google 雲端硬碟以執行雲端分享！');
      return;
    }

    showLoader('正在為您產生線上公開分享連結...');
    try {
      const themeVal = document.getElementById('export-select-theme').value;
      const shareData = {
        trip: mainTrip,
        spots: allSpots,
        theme: themeVal
      };

      // 產生一個唯一且能代表該匯出內容的檔案名稱
      let cleanFilterVal = filterValue.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
      const filename = `share_${filterType}_${cleanFilterVal}.json`;

      // 1. 尋找是否已有此檔，無則建立，有則更新 (獨立 try-catch 防止意外報錯阻斷)
      let shareFileId = null;
      try {
        shareFileId = await findFileInFolder(driveFolderId, filename);
      } catch (findErr) {
        console.warn('尋找舊分享檔失敗，將嘗試新建上傳:', findErr);
      }

      const jsonContent = JSON.stringify(shareData);

      if (shareFileId) {
        // 更新檔案內容
        await updateFileContent(shareFileId, jsonContent, 'application/json');
      } else {
        // 新增上傳檔案
        const blob = new Blob([jsonContent], { type: 'application/json' });
        shareFileId = await uploadFile(driveFolderId, filename, blob, 'application/json');
      }

      // 2. 確保權限為公開任何人可讀 (獨立 try-catch，防範 G Suite 組織政策或跨域等問題阻斷生成網址)
      try {
        await makeFilePublic(shareFileId);
      } catch (pubErr) {
        console.warn('設定檔案公開權限失敗，將繼續生成連結:', pubErr);
      }

      // 3. 拼裝網址並複製到剪貼簿
      const shareUrl = `${window.location.origin}/?share=${shareFileId}`;
      
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareUrl);
          showSuccessToast('線上分享網址已成功生成並複製到您的剪貼簿！');
        }
      } catch (clipErr) {
        console.warn('自動寫入剪貼簿被瀏覽器阻擋，改由對話框引導複製:', clipErr);
      }
      
      hideLoader();
      
      // 彈出成功提示與連結
      showModal('分享成功！', `
        <div style="text-align:center; padding:16px;">
          <div style="font-size:3.5rem; margin-bottom:16px; color:#10b981;">🎉</div>
          <p style="font-size:0.95rem; line-height:1.6; margin-bottom:16px; color:var(--text-primary);">您的旅遊手札已成功線上化！任何人都可以直接透過此連結免登入瀏覽您的手札成果。</p>
          <div style="background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:8px; padding:12px; font-family:monospace; font-size:0.85rem; word-break:break-all; user-select:all; margin-bottom:16px; color:var(--text-secondary); font-weight: bold;">${shareUrl}</div>
          <p style="font-size:0.8rem; color:#64748b; margin-top:-8px; margin-bottom:16px;">(提示：長按上方區塊可全選網址，複製後傳給 LINE 朋友吧！)</p>
          <button class="btn btn-primary" onclick="if(navigator.clipboard){navigator.clipboard.writeText('${shareUrl}').then(() => alert('已複製連結到剪貼簿！')).catch(() => alert('請手動複製上方網址！'))}else{alert('請直接手動選取上方網址並複製！')}">複製連結網址</button>
        </div>
      `);
    } catch (err) {
      hideLoader();
      showErrorToast(`生成分享網址失敗: ${err.message}`);
    }
    } else {
    showLoader('正在下載相片並打包 Markdown Zip 壓縮檔中...');
    try {
      await exportToMarkdownZip(mainTrip, allSpots, (progress) => {
        document.getElementById('loader-text').innerText = `正在下載打包相片... ${progress}%`;
      });
      showSuccessToast('Markdown Zip 已打包並開始下載！');
    } catch (err) {
      showErrorToast(`打包失敗: ${err.message}`);
    }
    hideLoader();
  }
}

/* ==========================================================================
   系統設定彈出框 (Settings Modal)
   ========================================================================== */

function showSettingsModal() {
  showModal('自訂 Client ID 設定', `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <!-- Google Client ID -->
      <div class="form-group">
        <label for="settings-client-id">Google API Client ID (更換後需重新登入)</label>
        <input type="text" id="settings-client-id" class="form-control" value="${authState.clientId}" placeholder="輸入自訂的 Client ID" />
        <span style="font-size:0.7rem; color:var(--text-muted); display:block; margin-top:4px;">
          * 若預設 Client ID 授權因網址域名受限，請在此貼上您自己建立的 Google Cloud Client ID。
        </span>
      </div>

      <div style="display:flex; gap:12px; margin-top:16px;">
        <button class="btn btn-secondary" onclick="hideModal()" style="flex:1;">取消</button>
        <button class="btn btn-primary" id="btn-save-settings" style="flex:1;">儲存設定</button>
      </div>
    </div>
  `);

  document.getElementById('btn-save-settings').addEventListener('click', () => {
    const newClientId = document.getElementById('settings-client-id').value.trim();
    const clientIdChanged = newClientId !== authState.clientId;

    updateClientId(newClientId);

    hideModal();
    showSuccessToast('設定已成功儲存！');

    if (clientIdChanged) {
      showSuccessToast('偵測到 Client ID 變更，請重新登入！');
      handleLogout();
    }
  });
}

/**
 * 彈出如何查詢 Client ID 的教學說明
 */
function showClientIdHelpModal() {
  showModal('如何獲取 Google API Client ID', `
    <div style="font-size:0.85rem; line-height:1.6; display:flex; flex-direction:column; gap:12px; color:var(--text-primary); text-align: left;">
      <p>請跟著以下簡單步驟獲取您個人專屬的 Google Client ID，以保護您的隱私：</p>
      <ol style="padding-left:20px; display:flex; flex-direction:column; gap:8px;">
        <li>前往並登入 <a href="https://console.cloud.google.com/" target="_blank" style="color:var(--accent-primary); text-decoration:underline;">Google Cloud Console 平台</a>。</li>
        <li>建立新專案，或選取已有專案。</li>
        <li>在左側選單中，選取「API 和服務」 ➔ 「OAuth 同意畫面」，設定為「外部 (External)」，並在測試用戶中新增您自己的 Gmail。</li>
        <li>點選「憑證」 ➔ 「建立憑證」 ➔ 「OAuth 用戶端 ID」。</li>
        <li>應用程式類型選擇「網頁應用程式」。</li>
        <li>在「已授權的 JavaScript 來源」中加入您的網址：
          <ul style="padding-left:16px; margin-top:4px;">
            <li>雲端部署：<code>https://my-travel-journal-dusky.vercel.app</code> (尾端不要加斜線)</li>
          </ul>
        </li>
        <li>點選建立，您便能複製所產生的「用戶端 ID (Client ID)」，貼回手札的設定欄位中即可！</li>
      </ol>
      <div style="display:flex; justify-content:center; margin-top:12px;">
        <button class="btn btn-primary" onclick="hideModal()" style="width:100%;">我知道了</button>
      </div>
    </div>
  `);
}

/**
 * 顯示新手友善的旅遊手札使用說明書
 */
function showUserManualModal() {
  showModal('📖 旅遊手札使用說明書 (新手簡單上手指南)', `
    <div style="font-size:0.85rem; line-height:1.6; display:flex; flex-direction:column; gap:16px; color:var(--text-primary); text-align: left; max-height:420px; overflow-y:auto; padding-right:8px;">
      
      <div style="background: rgba(0, 242, 254, 0.05); border-left: 4px solid var(--accent-primary); padding: 10px; border-radius: 4px; line-height:1.5;">
        🌸 <strong>別擔心！這只是一個專屬您的個人日記本</strong><br>
        本程式是「無伺服器、零資料庫」設計，絕不會收集您的個人隱私或照片。您記錄的所有照片和日記，都會原封不動存在您自己的 Google 雲端硬碟裡，只有您自己看得到，請安心使用！
      </div>

      <div>
        <h4 style="color:var(--accent-primary); margin-bottom:4px;"><i class="fa-brands fa-google"></i> 第一步：Google 帳戶登入</h4>
        <p>直接點選<strong>【使用 Google 帳戶登入】</strong>按鈕，選取您的 Gmail 帳號並允許授權。手札就會自動在您的 Google 雲端硬碟裡建立一個名為 <code>MyTravelJournal</code> 的隱私資料夾，用來同步您的日記檔案。系統已內置預設金鑰，初學者完全不需要做任何繁雜設定！</p>
      </div>

      <div>
        <h4 style="color:var(--accent-primary); margin-bottom:4px;"><i class="fa-solid fa-folder-plus"></i> 第二步：建立新旅程</h4>
        <p>登入成功後，點選畫面右下角的<strong>【大加號 +】</strong>按鈕，輸入您的旅程名稱（例如：北海道之旅），就像是拿出一本嶄新的空白筆記本準備書寫。</p>
      </div>

      <div>
        <h4 style="color:var(--accent-primary); margin-bottom:4px;"><i class="fa-solid fa-map-pin"></i> 第三步：新增景點與魔術照片</h4>
        <p>點進旅程後，點選右下角<strong>【箭頭發送紐】</strong>即可開始記錄新景點：</p>
        <ul style="padding-left:18px; margin-top:4px;">
          <li><strong>神奇拍照上傳</strong>：系統會自動讀取照片的「拍照日期」與「GPS 拍照地點」，並自動填好名稱與地址，您完全不用手動打字！</li>
          <li><strong>說說話記錄感受</strong>：點選麥克風按鈕對著手機說話，系統會自動把您的聲音變成文字，省去繁瑣的手機打字時間！</li>
        </ul>
      </div>

      <div>
        <h4 style="color:var(--accent-primary); margin-bottom:4px;"><i class="fa-solid fa-file-export"></i> 第四步：分享成果給親友</h4>
        <p>點選旅程右上角的<strong>【匯出】</strong>按鈕，選擇您喜歡的視覺主題（如：青春、療癒放空）與自動搭配的背景輕音樂，系統會產生一個精美的單網頁。您可以直接將網頁檔案傳送到 LINE 群組分享給親朋好友，讓他們聽著輕音樂欣賞您的旅遊足跡！</p>
      </div>

      <div>
        <h4 style="color:var(--accent-primary); margin-bottom:4px;"><i class="fa-solid fa-trash-can"></i> 其他功能與備註</h4>
        <p>如果景點順序不對，點選<strong>【調整順序】</strong>即可用手指上下拖曳更改；如果不小心寫錯，可以在首頁卡片右上角點選<strong>【紅色垃圾桶】</strong>將整本行程刪除。若您想使用自己註冊的 Google Cloud 用戶端憑證，可點選起始畫面最下方的<strong>【進階設定 (自訂 Client ID)】</strong>腳註連結進行更換。</p>
      </div>

      <div style="text-align:center; margin-top:12px; margin-bottom: 4px;">
        <button class="btn btn-primary" onclick="hideModal()" style="width:100%;">我知道了，開始體驗！</button>
      </div>
    </div>
  `);
}

/**
 * 顯示釘選桌面至手機主畫面教學 Modal (iOS 捷徑版 與 Android Chrome 版)
 */
function showPinToDesktopModal() {
  showModal('📌 釘選手機桌面教學', `
    <div style="font-size:0.85rem; display:flex; flex-direction:column; gap:12px; color:var(--text-primary);">
      <p style="color:var(--text-secondary); margin-bottom: 4px; line-height:1.5;">
        💡 將旅遊手札釘選在手機桌面上，使用起來就像下載的手機 App 一樣，可以全螢幕快速記錄！
      </p>

      <!-- 頁籤按鈕切換區 -->
      <div style="display:flex; border-bottom:1px solid var(--border-glass); margin-bottom:8px; gap:8px;">
        <button id="tab-pin-ios" style="flex:1; padding:8px; border:none; background:none; color:var(--text-primary); border-bottom: 2px solid var(--accent-primary); cursor:pointer; font-weight:600; font-size:0.85rem;">
          📱 iPhone (iOS 捷徑)
        </button>
        <button id="tab-pin-android" style="flex:1; padding:8px; border:none; background:none; color:var(--text-secondary); border-bottom: 2px solid transparent; cursor:pointer; font-size:0.85rem;">
          🤖 Android (安卓 Chrome)
        </button>
      </div>

      <!-- iPhone (iOS) 教學內容 -->
      <div id="content-pin-ios" style="display:block; text-align:left; max-height:300px; overflow-y:auto; padding-right:4px;">
        <ol style="padding-left:20px; display:flex; flex-direction:column; gap:8px; line-height:1.6;">
          <li>打開您 iPhone 桌面內建的 **「捷徑」** App 📱。</li>
          <li>點選右上角的 **「+」** 按鈕以新增一個捷徑。</li>
          <li>點選中間的 **「加入動作」**，在搜尋框輸入 <code style="background:rgba(255,255,255,0.08); padding:2px 4px; border-radius:4px;">打開 URL</code>，並在搜尋結果中選取該動作。</li>
          <li>點選動作中的 'URL' 輸入框，貼入本手札網址：<br><code style="background:rgba(255,255,255,0.08); padding:2px 4px; border-radius:4px; font-size:0.75rem; word-break:break-all;">https://my-travel-journal-dusky.vercel.app/</code></li>
          <li>點選上方捷徑名稱，選取 **「重新命名」**，輸入 '旅遊手札'，並點選「完成」儲存捷徑。</li>
          <li>回到所有捷徑畫面，長按剛剛做好的捷徑，選擇 **「分享」➔「加入主畫面」**。</li>
          <li>您可以點選下方的圖標，拍照或從相簿選擇一張您喜歡的相片作為手札圖標（Icon），最後點選右上角的「新增」即可！</li>
        </ol>
      </div>

      <!-- Android 教學內容 -->
      <div id="content-pin-android" style="display:none; text-align:left; max-height:300px; overflow-y:auto; padding-right:4px;">
        <ol style="padding-left:20px; display:flex; flex-direction:column; gap:8px; line-height:1.6;">
          <li>使用 Android 手機的 **Google Chrome** 瀏覽器開啟手札網址：<br><code style="background:rgba(255,255,255,0.08); padding:2px 4px; border-radius:4px; font-size:0.75rem; word-break:break-all;">https://my-travel-journal-dusky.vercel.app/</code></li>
          <li>點選網址列最右邊的 **「三個點 (更多選項)」** 選單。</li>
          <li>在選單中點選 **「安裝應用程式」** 或 **「加入主畫面」**。</li>
          <li>在彈出的視窗中確認點選 '安裝' 或 '新增' 即可！</li>
        </ol>
      </div>

      <div style="display:flex; justify-content:center; margin-top:12px;">
        <button class="btn btn-primary" onclick="hideModal()" style="width:100%;">我知道了，去設定！</button>
      </div>
    </div>
  `);

  // 實作 Tab 切換功能
  const tabIos = document.getElementById('tab-pin-ios');
  const tabAndroid = document.getElementById('tab-pin-android');
  const contentIos = document.getElementById('content-pin-ios');
  const contentAndroid = document.getElementById('content-pin-android');

  tabIos.addEventListener('click', () => {
    tabIos.style.color = 'var(--text-primary)';
    tabIos.style.borderBottom = '2px solid var(--accent-primary)';
    tabIos.style.fontWeight = '600';

    tabAndroid.style.color = 'var(--text-secondary)';
    tabAndroid.style.borderBottom = '2px solid transparent';
    tabAndroid.style.fontWeight = 'normal';

    contentIos.style.display = 'block';
    contentAndroid.style.display = 'none';
  });

  tabAndroid.addEventListener('click', () => {
    tabAndroid.style.color = 'var(--text-primary)';
    tabAndroid.style.borderBottom = '2px solid var(--accent-primary)';
    tabAndroid.style.fontWeight = '600';

    tabIos.style.color = 'var(--text-secondary)';
    tabIos.style.borderBottom = '2px solid transparent';
    tabIos.style.fontWeight = 'normal';

    contentIos.style.display = 'none';
    contentAndroid.style.display = 'block';
  });
}

/* ==========================================================================
   大批照片批次匯入管理模組 (Bulk Photo Import Module)
   ========================================================================== */

/**
 * 解壓縮 ZIP 檔案並篩選出支援的相片 Blob，限制大小為 500MB
 */
async function unzipAndExtractPhotos(zipFile) {
  if (zipFile.size > 500 * 1024 * 1024) {
    throw new Error('ZIP 壓縮檔大小不能超過 500MB！');
  }

  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(zipFile);
  const photoFiles = [];
  const promises = [];

  loadedZip.forEach((relativePath, fileEntry) => {
    // 排除資料夾與系統/隱藏檔案 (e.g. __MACOSX, .DS_Store)
    if (fileEntry.dir) return;
    if (relativePath.includes('__MACOSX') || relativePath.split('/').some(part => part.startsWith('.'))) return;

    // 篩選 jpg, jpeg, png, webp 格式
    const isImage = /\.(jpe?g|png|webp)$/i.test(relativePath);
    if (!isImage) return;

    const p = fileEntry.async('blob').then(blob => {
      const filename = relativePath.split('/').pop();
      // 包裝 Blob 為類似 File 的物件，模擬 name 與 lastModified
      blob.name = filename;
      blob.lastModified = fileEntry.date ? fileEntry.date.getTime() : Date.now();
      photoFiles.push(blob);
    });
    promises.push(p);
  });

  await Promise.all(promises);
  return photoFiles;
}

/**
 * 觸發批次選擇相片 (支援普通相片與 .zip 壓縮檔)
 */
function handleBulkImportTrigger() {
  let input = document.getElementById('bulk-photo-file-input');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'bulk-photo-file-input';
    input.multiple = true;
    input.accept = 'image/*,.zip';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', handleBulkPhotoUpload);
  }
  input.value = ''; // 重置
  input.click();
}

/**
 * 處理批次選擇相片後的 EXIF 解析與 1km 距離分組
 */
async function handleBulkPhotoUpload(e) {
  let files = Array.from(e.target.files);
  if (files.length === 0) return;

  // 判斷是否為上傳單個 ZIP 壓縮檔
  if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
    const zipFile = files[0];
    showLoader('正在解壓縮 ZIP 檔案中...');
    try {
      files = await unzipAndExtractPhotos(zipFile);
      if (files.length === 0) {
        showErrorToast('ZIP 壓縮檔內沒有找到支援的圖片格式 (JPG/PNG/WEBP)！');
        hideLoader();
        return;
      }
      showSuccessToast(`成功解壓縮 ${files.length} 張照片！`);
    } catch (err) {
      console.error('解壓 ZIP 失敗:', err);
      showErrorToast(`ZIP 檔案解析失敗: ${err.message}`);
      hideLoader();
      return;
    }
  }

  showLoader('正在分析批次照片資訊與 EXIF 座標中...');
  
  const parsedPhotos = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      showLoader(`正在讀取第 ${i + 1} / ${files.length} 張照片中...`);
      
      const gps = await getPhotoLocation(file);
      parsedPhotos.push({
        file,
        name: file.name,
        lat: gps ? gps.lat : null,
        lng: gps ? gps.lng : null,
        date: gps ? gps.date : new Date(file.lastModified).toISOString().split('T')[0],
        timestamp: (gps && gps.timestamp) ? gps.timestamp : (file.lastModified || Date.now())
      });
    }
  } catch (err) {
    console.error('批次相片讀取失敗:', err);
    showErrorToast('部分照片讀取失敗，請重新嘗試！');
    hideLoader();
    return;
  }

  // 1. 執行 1公里球面距離聚類
  const clusters = clusterPhotos(parsedPhotos, 1.0);

  // 2. 對每個聚類進行多樣性發散挑選，同一景點最多保留 8 張
  clusters.forEach(cluster => {
    cluster.selectedPhotos = selectDiversePhotos(cluster.photos, 8);
    // 統計被篩除的冗餘張數
    cluster.filteredCount = cluster.photos.length - cluster.selectedPhotos.length;
    cluster.suggestedName = ''; // 稍後非同步解析寫入
    cluster.address = '';
  });

  hideLoader();

  // 顯示批次預覽 Modal
  showBulkImportPreviewModal(clusters);
}

/**
 * 渲染大批匯入的景點預覽彈出視窗
 */
function showBulkImportPreviewModal(clusters) {
  let clustersHtml = '';
  
  clusters.forEach((cluster, idx) => {
    // 建立前幾張相片之縮圖 HTML
    let imgThumbnails = '';
    cluster.selectedPhotos.forEach(p => {
      const localUrl = URL.createObjectURL(p.file);
      imgThumbnails += `
        <div style="width: 52px; height: 52px; border-radius: 6px; overflow:hidden; flex-shrink: 0; border: 1px solid var(--border-glass);">
          <img src="${localUrl}" style="width:100%; height:100%; object-fit:cover;" />
        </div>
      `;
    });

    const filterBadge = cluster.filteredCount > 0 
      ? `<span style="font-size:0.7rem; color:var(--accent-secondary); background:rgba(0, 242, 254, 0.1); padding:2px 6px; border-radius:4px;">
           已自動發散篩除 ${cluster.filteredCount} 張相近相片
         </span>` 
      : '';

    clustersHtml += `
      <div class="bulk-preview-item" data-idx="${idx}" style="border: 1px solid var(--border-glass); border-radius:12px; padding:12px; background:rgba(255,255,255,0.02); display:flex; flex-direction:column; gap:10px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:0.85rem; color:var(--accent-primary);"><i class="fa-solid fa-map-pin"></i> 景點群組 ${idx + 1} (${cluster.isNoGps ? '無定位' : 'GPS 範圍 1km'})</strong>
          ${filterBadge}
        </div>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:0.75rem; color:var(--text-secondary);">景點名稱</label>
            <input type="text" class="form-control bulk-spot-name" value="讀取中..." style="padding:6px; font-size:0.8rem;" required />
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:0.75rem; color:var(--text-secondary);">造訪日期</label>
            <input type="date" class="form-control bulk-spot-date" value="${cluster.date}" style="padding:6px; font-size:0.8rem;" />
          </div>
        </div>

        <div class="form-group" style="margin-bottom:0;">
          <label style="font-size:0.75rem; color:var(--text-secondary);">景點詳細地址</label>
          <input type="text" class="form-control bulk-spot-address" value="地理定位解碼中..." style="padding:6px; font-size:0.8rem;" />
        </div>

        <div>
          <label style="font-size:0.75rem; display:block; margin-bottom:4px; color:var(--text-secondary);">包含相片 (${cluster.selectedPhotos.length} 張)：</label>
          <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:4px;">
            ${imgThumbnails}
          </div>
        </div>
      </div>
    `;
  });

  showModal('大批匯入 - 景點聚類預覽', `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <p style="font-size:0.8rem; color:var(--text-secondary); line-height:1.5;">
        💡 系統已自動將您上傳的相片，以「1公里半徑距離」與「GPS發散去重最多8張」完成景點群組分類。下方正在解析景點地標 POI 建議名稱與地址，您可隨時手動進行編輯。
      </p>
      
      <div id="bulk-preview-list" style="display:flex; flex-direction:column; max-height:360px; overflow-y:auto; padding-right:4px;">
        ${clustersHtml}
      </div>

      <div style="display:flex; gap:12px; margin-top:8px;">
        <button class="btn btn-secondary" onclick="hideModal()" style="flex:1;">取消</button>
        <button class="btn btn-primary" id="btn-do-bulk-upload" style="flex:2;">確認無誤，開始上傳雲端</button>
      </div>
    </div>
  `);

  // 開始進行非同步地名解析 (每 1.2 秒排隊一個，避免 Nominatim API 鎖 IP)
  resolveClusterNames(clusters);

  // 綁定最後的上傳動作
  document.getElementById('btn-do-bulk-upload').addEventListener('click', () => handleDoBulkUpload(clusters));
}

/**
 * 佇列逐一解析群聚地名
 */
async function resolveClusterNames(clusters) {
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    if (cluster.isNoGps || cluster.lat === null || cluster.lng === null) {
      cluster.suggestedName = `無定位景點 - ${cluster.date}`;
      cluster.address = '無定位座標，請手動命名與輸入詳細地址';
      updateBulkPreviewItemUI(i, cluster.suggestedName, cluster.address);
      continue;
    }

    try {
      // Nominatim API 請求間隔 1.2 秒
      if (i > 0) {
        await new Promise(r => setTimeout(r, 1200));
      }
      
      const locObj = await getPlaceNameFromGPS(cluster.lat, cluster.lng);
      cluster.suggestedName = locObj.name;
      cluster.address = locObj.address;
      updateBulkPreviewItemUI(i, cluster.suggestedName, cluster.address);
    } catch (e) {
      console.warn('地名解析失敗:', e);
      cluster.suggestedName = `未命名景點 - ${i + 1}`;
      cluster.address = `經度: ${cluster.lng.toFixed(5)}, 緯度: ${cluster.lat.toFixed(5)}`;
      updateBulkPreviewItemUI(i, cluster.suggestedName, cluster.address);
    }
  }
}

/**
 * 即時更新 UI 欄位內容
 */
function updateBulkPreviewItemUI(idx, name, address) {
  const items = document.querySelectorAll('.bulk-preview-item');
  if (items && items[idx]) {
    const nameInput = items[idx].querySelector('.bulk-spot-name');
    const addressInput = items[idx].querySelector('.bulk-spot-address');
    if (nameInput) nameInput.value = name;
    if (addressInput) addressInput.value = address;
  }
}

/**
 * 執行批次壓縮與雲端同步上傳
 */
async function handleDoBulkUpload(clusters) {
  const items = document.querySelectorAll('.bulk-preview-item');
  const trip = tripsData.trips.find(t => t.id === currentTripId);
  if (!trip) return;

  hideModal();
  showLoader('準備開始批次壓縮與上傳相片...');

  // 統計總上傳相片數
  let totalPhotos = 0;
  clusters.forEach(c => totalPhotos += c.selectedPhotos.length);
  let uploadedCount = 0;

  try {
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const name = items[i].querySelector('.bulk-spot-name').value.trim() || `未命名景點 - ${i + 1}`;
      const date = items[i].querySelector('.bulk-spot-date').value;
      const address = items[i].querySelector('.bulk-spot-address').value;

      const spotPhotos = [];

      // 逐步上傳該群聚的所有照片
      for (const p of cluster.selectedPhotos) {
        uploadedCount++;
        showLoader(`正在進行批次上傳 (${uploadedCount} / ${totalPhotos} 張照片)...`);

        // 前端壓縮
        const compressedBlob = await compressImage(p.file, 2048);
        
        // 雲端檔名
        const cloudFilename = `photo-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.jpg`;
        const driveFileId = await uploadFile(driveFolderId, cloudFilename, compressedBlob, 'image/jpeg');

        spotPhotos.push({
          id: 'photo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          driveFileId,
          originalName: p.file.name,
          comment: '',
          audioFileId: '',
          timestamp: p.timestamp
        });
      }

      // 建立景點物件
      const spotData = {
        id: 'spot-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        name,
        date,
        description: '', // 批次匯入時整體感受隨筆預設空白
        location: {
          lat: cluster.lat || 0,
          lng: cluster.lng || 0,
          address
        },
        photos: spotPhotos
      };

      if (!trip.spots) trip.spots = [];
      trip.spots.push(spotData);
    }

    // 保存前進行時間軸 chronological 排序
    trip.spots.sort((a, b) => {
      const getSpotTimestamp = (spot) => {
        if (spot.photos && spot.photos.length > 0) {
          const timestamps = spot.photos.map(p => p.timestamp).filter(t => typeof t === 'number' && !isNaN(t) && t > 0);
          if (timestamps.length > 0) return Math.min(...timestamps);
        }
        if (spot.date) {
          const t = new Date(spot.date).getTime();
          if (!isNaN(t)) return t;
        }
        return 0;
      };
      return getSpotTimestamp(a) - getSpotTimestamp(b);
    });

    showLoader('正在同步寫入 Google Drive 旅程檔...');
    await saveTripsToCloud();
    hideLoader();
    showSuccessToast(`成功匯入 ${clusters.length} 個景點，共上傳 ${totalPhotos} 張照片！`);
    
    // 刷新景點列表細節畫面
    renderTripDetailsView(currentTripId);

  } catch (err) {
    console.error('批次上傳錯誤:', err);
    hideLoader();
    showErrorToast(`批次上傳發生錯誤: ${err.message}`);
  }
}

/* ==========================================================================
   全域通用 UI 控制器 (Loader, Toast, Modal)
   ========================================================================== */

function showLoader(text = '處理中...') {
  document.getElementById('loader-text').innerText = text;
  document.getElementById('full-loader').style.display = 'flex';
}

function hideLoader() {
  document.getElementById('full-loader').style.display = 'none';
}

function showSuccessToast(msg) {
  const toast = document.getElementById('toast-msg');
  toast.innerText = msg;
  toast.style.background = 'var(--success)';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  toast.style.opacity = '1';
  
  if (activeToastTimeout) clearTimeout(activeToastTimeout);
  
  activeToastTimeout = setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(100px)';
    toast.style.opacity = '0';
    activeToastTimeout = null;
  }, 3000); // 修正成過三秒鐘之後會自動消失
}

function showErrorToast(msg) {
  const toast = document.getElementById('toast-msg');
  toast.innerText = msg;
  toast.style.background = 'var(--danger)';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  toast.style.opacity = '1';
  
  if (activeToastTimeout) clearTimeout(activeToastTimeout);
  
  activeToastTimeout = setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(100px)';
    toast.style.opacity = '0';
    activeToastTimeout = null;
  }, 3000); // 修正成過三秒鐘之後會自動消失
}

function showModal(title, contentHtml) {
  document.getElementById('modal-title').innerText = title;
  const body = document.getElementById('modal-body');
  body.innerHTML = contentHtml;
  body.scrollTop = 0; // 每次彈出皆滾動回最上方，以看見「拍照或上傳照片」按鈕
  document.getElementById('modal-overlay').classList.add('active');
}

function hideModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  // 停止可能的錄音
  if (activeMediaRecorderState === 'recording') {
    stopRecording();
    resetRecordUI();
  }
}

// 綁定通用 Modal 控制函數至 window，解決 ES6 Module 無法被 HTML inline click 呼叫的問題
window.hideModal = hideModal;
window.closeActiveModal = (e) => {
  hideModal();
};
