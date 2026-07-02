/* ==========================================================================
   Travel Journal - Export Module (Markdown & HTML Single Page)
   ========================================================================== */

import JSZip from 'jszip';
import { generateSinglePageHtml } from './templates.js';
import { downloadBlobFile } from './drive.js';

/**
 * 依條件篩選景點資料
 * @param {Object} tripsData 完整的行程資料 (trips.json 結構)
 * @param {string} filterType 'trip' | 'date' | 'region'
 * @param {string} filterValue 篩選的對應 ID 或名稱
 * @returns {Array<{trip: Object, spots: Array<Object>}>} 篩選後的行程與景點清單
 */
export function filterJournalData(tripsData, filterType, filterValue) {
  if (!tripsData || !tripsData.trips) return [];

  const results = [];

  tripsData.trips.forEach(trip => {
    let matchedSpots = [];

    if (filterType === 'trip' && trip.id === filterValue) {
      matchedSpots = [...trip.spots];
    } else if (filterType === 'date') {
      matchedSpots = trip.spots.filter(spot => spot.date === filterValue);
    } else if (filterType === 'region' && trip.region && trip.region.includes(filterValue)) {
      matchedSpots = [...trip.spots];
    } else if (!filterType) {
      // 預設無篩選，載入全部
      matchedSpots = [...trip.spots];
    }

    if (matchedSpots.length > 0) {
      // 依日期排序景點
      matchedSpots.sort((a, b) => new Date(a.date) - new Date(b.date));
      results.push({
        trip,
        spots: matchedSpots
      });
    }
  });

  return results;
}

/**
 * 產生 Markdown 字串
 * @param {Object} trip 行程資料
 * @param {Array<Object>} spots 景點清單
 * @param {boolean} relativeImagePaths 是否採用相對照片路徑 (用於 Zip 打包)
 * @returns {string} Markdown 字串
 */
export function generateMarkdown(trip, spots, relativeImagePaths = true) {
  let md = `# 旅遊手札：${trip.name || '未命名行程'}\n\n`;
  md += `- **旅遊區域**：${trip.region || '未分類區域'}\n`;
  md += `- **旅遊日期**：${trip.startDate || ''} ~ ${trip.endDate || ''}\n`;
  md += `- **記錄人**：${localStorage.getItem('tj_user_name') || '我'}\n\n`;
  md += `---\n\n`;

  spots.forEach((spot, idx) => {
    md += `## ${idx + 1}. ${spot.name || '未知景點'}\n\n`;
    md += `- **造訪日期**：${spot.date || '未記錄'}\n`;
    if (spot.location && spot.location.address) {
      md += `- **景點位置**：[${spot.location.address}](https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.location.address)})\n`;
    }
    md += `\n`;
    md += `### 景點感受\n`;
    md += `${spot.description || '在此處留下了美好的回憶...'}\n\n`;

    if (spot.photos && spot.photos.length > 0) {
      md += `### 照片與隨筆\n\n`;
      spot.photos.forEach((photo, pIdx) => {
        // 設定照片連結
        let photoPath = '';
        if (relativeImagePaths) {
          photoPath = `photos/${photo.driveFileId}.jpg`;
        } else {
          // 若不打包圖片，使用 Google Drive 直連圖片的網址
          photoPath = `https://drive.google.com/thumbnail?id=${photo.driveFileId}&sz=w800`;
        }

        md += `#### 照片 ${pIdx + 1} (${photo.originalName || '照片'})\n`;
        md += `![${photo.originalName || '照片'}](${photoPath})\n\n`;
        if (photo.comment) {
          md += `> **隨筆感想**：${photo.comment}\n\n`;
        }
        md += `---\n\n`;
      });
    }
    md += `\n`;
  });

  return md;
}

/**
 * 下載 HTML 成果網頁至瀏覽器
 */
export function exportToHtmlFile(trip, spots, theme = 'youth') {
  const htmlString = generateSinglePageHtml(trip, spots, theme);
  const blob = new Blob([htmlString], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${trip.name || 'travel-journal'}_成果分享.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 產生 HTML 成果網頁並直接觸發 PDF 下載至瀏覽器
 */
export function exportToPdf(trip, spots, theme = 'youth', onStatusUpdate = null, onComplete = null, onError = null) {
  const htmlString = generateSinglePageHtml(trip, spots, theme);
  
  // 注入 PDF 專屬樣式：隱藏音樂控制與 CD、強制背景為白色、文字改為暗色以利列印與導出
  const pdfStyle = `
    <style>
      #music-control-btn, .music-disc-container, .cd-disc, .cd-arm { display: none !important; }
      body {
        background: #ffffff !important;
        background-image: none !important;
        color: #1e293b !important;
        padding: 20px !important;
      }
      .journal-container {
        max-width: 100% !important;
        margin: 0 !important;
        box-shadow: none !important;
        background: #ffffff !important;
      }
      .timeline::before {
        background-color: #cbd5e1 !important;
      }
      .spot-card {
        background: #f8fafc !important;
        border: 1px solid #e2e8f0 !important;
        box-shadow: none !important;
        color: #1e293b !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        margin-bottom: 24px !important;
      }
      .spot-title {
        color: #0f172a !important;
      }
      .spot-desc, .photo-caption {
        color: #334155 !important;
      }
      .spot-date, .spot-location {
        color: #64748b !important;
      }
      .photo-card {
        background: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        box-shadow: none !important;
      }
      .audio-badge {
        background: #f8fafc !important;
        border: 1px solid #e2e8f0 !important;
        color: #64748b !important;
      }
      .voice-transcript {
        background: #f1f5f9 !important;
        border-left: 3px solid var(--accent-color) !important;
        color: #475569 !important;
      }
      .journal-header h1 {
        color: #0f172a !important;
      }
      .journal-header p {
        color: #475569 !important;
      }
    </style>
  `;
  
  let styledHtml = htmlString;
  if (htmlString.includes('</head>')) {
    styledHtml = htmlString.replace('</head>', pdfStyle + '</head>');
  } else {
    styledHtml = pdfStyle + htmlString;
  }

  // 1. 建立隱藏的 iframe 進行獨立渲染
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.width = '1024px'; // 模擬電腦版寬度，使 PDF 排版整齊
  iframe.style.height = '768px';
  iframe.style.visibility = 'hidden';
  iframe.style.left = '-9999px';
  document.body.appendChild(iframe);

  // 2. 寫入內容
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(styledHtml);
  iframeDoc.close();

  if (onStatusUpdate) onStatusUpdate('正在載入 PDF 核心元件...');

  // 3. 動態加載 html2pdf.js
  const loadLibrary = (callback) => {
    if (window.html2pdf) {
      callback(window.html2pdf);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => callback(window.html2pdf);
    script.onerror = () => {
      document.body.removeChild(iframe);
      if (onError) onError(new Error('下載 PDF 核心元件失敗，請確認網路連線！'));
    };
    document.body.appendChild(script);
  };

  loadLibrary((html2pdf) => {
    if (onStatusUpdate) onStatusUpdate('正在下載並轉換相片為本機 Data...');

    // 4. 下載圖片並轉換為 Base64 Data URL (以徹底繞過 html2canvas 的 CORS 限制)
    const convertImagesToBase64 = async () => {
      const imgs = iframeDoc.querySelectorAll('img');
      if (imgs.length === 0) return;

      const promises = Array.from(imgs).map(async (img) => {
        const originalSrc = img.getAttribute('src');
        if (!originalSrc || originalSrc.startsWith('data:')) return;
        
        try {
          // 發起 CORS fetch 請求圖片二進位 blob
          const res = await fetch(originalSrc);
          if (!res.ok) throw new Error(`HTTP status ${res.status}`);
          const blob = await res.blob();
          
          // 轉為 Data URL (Base64)
          const base64Url = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          
          img.src = base64Url;
          console.log('相片成功轉換為 Base64:', originalSrc.substring(0, 50));
        } catch (err) {
          console.warn('相片轉換 Base64 失敗 (採用原 URL 回退):', originalSrc, err);
        }
      });

      // 限制 8 秒內必須全部跑完，防卡死
      const timeoutPromise = new Promise(resolve => setTimeout(resolve, 8000));
      await Promise.race([
        Promise.all(promises),
        timeoutPromise
      ]);
    };

    convertImagesToBase64().then(() => {
      // 給予瀏覽器微小時間開始載入 iframe 中的資源
      setTimeout(() => {
        const imgs = iframeDoc.querySelectorAll('img');
        
        const generatePDF = () => {
          if (onStatusUpdate) onStatusUpdate('相片載入完成，正在渲染 PDF 排版檔...');
          
          setTimeout(() => {
            const opt = {
              margin:       [10, 10, 10, 10], // A4 頁邊距 (單位: mm)
              filename:     `${trip.name || 'travel-journal'}_旅遊手札.pdf`,
              image:        { type: 'jpeg', quality: 0.98 },
              html2canvas:  { 
                scale: 2, 
                useCORS: true, 
                logging: false,
                allowTaint: true
              },
              jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
              pagebreak:    { mode: ['css', 'legacy'] }
            };

            if (onStatusUpdate) onStatusUpdate('相片排版完成，正在產生並下載 PDF...');

            html2pdf().set(opt).from(iframeDoc.body).save().then(() => {
              document.body.removeChild(iframe);
              if (onComplete) onComplete();
            }).catch(err => {
              document.body.removeChild(iframe);
              if (onError) onError(err);
            });
          }, 1200); // 給予足夠的繪圖緩衝時間
        };

        if (imgs.length === 0) {
          generatePDF();
          return;
        }

        // 等待所有圖片載入完畢，並附帶安全超時機制
        const promises = Array.from(imgs).map(img => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise(resolve => {
            const timeout = setTimeout(() => {
              console.warn('圖片加載超時安全閥啟動:', img.src);
              resolve(); // 超時直接解析，防止卡死
            }, 5000);

            img.onload = () => {
              clearTimeout(timeout);
              resolve();
            };
            img.onerror = () => {
              clearTimeout(timeout);
              resolve();
            };
          });
        });

        Promise.all(promises).then(generatePDF);
      }, 200);
    });
  });
}

/**
 * 匯出並下載打包的 Markdown 壓縮檔案 (包含 .md 文件與照片子資料夾)
 * @param {Object} trip 行程資料
 * @param {Array<Object>} spots 景點清單
 * @param {Function} onProgress 進度回報回呼函數 (0 ~ 100)
 */
export async function exportToMarkdownZip(trip, spots, onProgress = null) {
  const zip = new JSZip();
  const mdContent = generateMarkdown(trip, spots, true);
  
  // 寫入 Markdown 檔
  zip.file('README.md', mdContent);
  
  // 建立照片子資料夾
  const photosFolder = zip.folder('photos');
  
  // 收集所有需要下載的照片
  const photoQueue = [];
  spots.forEach(spot => {
    if (spot.photos) {
      spot.photos.forEach(photo => {
        photoQueue.push(photo);
      });
    }
  });

  const totalPhotos = photoQueue.length;
  let downloadedCount = 0;

  // 下載照片 Blob 並寫入 Zip
  for (let i = 0; i < totalPhotos; i++) {
    const photo = photoQueue[i];
    try {
      if (onProgress) {
        onProgress(Math.round((downloadedCount / totalPhotos) * 80)); // 保留 20% 給壓縮生成
      }
      
      const blob = await downloadBlobFile(photo.driveFileId);
      photosFolder.file(`${photo.driveFileId}.jpg`, blob);
      
    } catch (e) {
      console.error(`下載照片失敗 [ID: ${photo.driveFileId}]:`, e);
      // 容錯機制：若單張下載失敗，寫入一小段錯誤訊息避免壓縮中斷
      photosFolder.file(`${photo.driveFileId}_error.txt`, `無法從 Google Drive 下載此照片`);
    }
    downloadedCount++;
  }

  if (onProgress) onProgress(90);

  // 壓縮打包
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  
  if (onProgress) onProgress(100);

  // 觸發瀏覽器下載
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${trip.name || 'travel-journal'}_手札匯出.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
