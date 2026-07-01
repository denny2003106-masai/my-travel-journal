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
 * 產生 HTML 成果網頁並叫起瀏覽器列印/儲存為 PDF 檔案
 */
export function exportToPdf(trip, spots, theme = 'youth') {
  const htmlString = generateSinglePageHtml(trip, spots, theme);
  
  // 注入列印樣式：隱藏音樂控制元件、優化字體大小與分頁防截斷
  const printStyle = `
    <style>
      @media print {
        #music-control-btn, .music-disc-container, .cd-disc, .cd-arm { display: none !important; }
        body { background-color: var(--bg-primary) !important; color: var(--text-primary) !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .journal-container { max-width: 100% !important; margin: 0 !important; box-shadow: none !important; }
        .timeline-card { page-break-inside: avoid; break-inside: avoid; margin-bottom: 24px !important; }
      }
    </style>
  `;
  
  let styledHtml = htmlString;
  if (htmlString.includes('</head>')) {
    styledHtml = htmlString.replace('</head>', printStyle + '</head>');
  } else {
    styledHtml = printStyle + htmlString;
  }

  // 1. 開啟新視窗
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('無法開啟列印視窗，請檢查您的瀏覽器是否封鎖了快顯視窗！');
  }

  // 2. 寫入 HTML 內容
  printWindow.document.open();
  printWindow.document.write(styledHtml);
  printWindow.document.close();

  // 3. 等待圖片加載完畢後觸發列印
  const triggerPrint = () => {
    const imgs = printWindow.document.querySelectorAll('img');
    const promises = Array.from(imgs).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    });

    Promise.all(promises).then(() => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 800); // 給予足夠的渲染緩衝時間
    });
  };

  // 如果視窗已載入直接觸發，否則監聽 load 事件
  if (printWindow.document.readyState === 'complete') {
    triggerPrint();
  } else {
    printWindow.addEventListener('load', triggerPrint);
  }
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
