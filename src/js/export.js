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
  try {
    const htmlString = generateSinglePageHtml(trip, spots, theme);
    
    // 注入 PDF 專屬樣式：隱藏音樂控制與 CD、強制背景為白色、文字改為暗色以利列印與導出，且設定 A4 固定的 700px 寬度防止右側截斷！
    const pdfStyle = `
      <style>
        #music-control-btn, .music-disc-container, .cd-disc, .cd-arm { display: none !important; }
        :root, [data-theme="light"], html, body {
          --bg-primary: #ffffff !important;
          --bg-secondary: #ffffff !important;
          --bg-card: #ffffff !important;
          --border-color: #cbd5e1 !important;
          --text-primary: #0f172a !important;
          --text-secondary: #475569 !important;
          background: #ffffff !important;
          background-color: #ffffff !important;
          background-image: none !important;
          color: #0f172a !important;
        }
        html, body {
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
        }
        .container {
          width: 700px !important;
          max-width: 700px !important;
          margin: 0 auto !important;
          padding: 24px 16px !important;
          box-shadow: none !important;
          background: #ffffff !important;
          background-color: #ffffff !important;
        }
        header {
          background: #ffffff !important;
          background-color: #ffffff !important;
          background-image: none !important;
          border: 1px solid #cbd5e1 !important;
          box-shadow: none !important;
          padding: 24px 16px !important;
          margin-bottom: 24px !important;
        }
        h1 {
          font-size: 1.8rem !important;
          margin-bottom: 8px !important;
        }
        .trip-meta {
          gap: 12px !important;
          font-size: 0.8rem !important;
        }
        .timeline::before {
          background-color: #cbd5e1 !important;
        }
        .spot-item {
          margin-bottom: 8px !important;
        }
        .spot-card {
          background: #f8fafc !important;
          background-color: #f8fafc !important;
          border: 1px solid #cbd5e1 !important;
          box-shadow: none !important;
          color: #1e293b !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          margin-bottom: 16px !important;
          padding: 16px !important;
        }
        .spot-item:last-child .spot-card {
          margin-bottom: 0 !important;
        }
        .spot-header {
          padding-bottom: 6px !important;
          margin-bottom: 8px !important;
        }
        .spot-name {
          font-size: 1.15rem !important;
          margin-bottom: 4px !important;
        }
        .spot-badges {
          gap: 8px !important;
          font-size: 0.75rem !important;
        }
        .spot-desc {
          font-size: 0.85rem !important;
          margin-bottom: 12px !important;
          line-height: 1.5 !important;
        }
        .photo-grid {
          gap: 10px !important;
          grid-template-columns: repeat(2, 1fr) !important;
        }
        .photo-card {
          background: #ffffff !important;
          background-color: #ffffff !important;
          border: 1px solid #cbd5e1 !important;
          box-shadow: none !important;
          padding: 6px !important;
        }
        .photo-caption {
          font-size: 0.75rem !important;
          padding: 2px !important;
        }
        .audio-badge {
          background: #f8fafc !important;
          background-color: #f8fafc !important;
          border: 1px solid #cbd5e1 !important;
          color: #64748b !important;
          padding: 6px !important;
        }
        .voice-transcript {
          background: #f1f5f9 !important;
          background-color: #f1f5f9 !important;
          border-left: 3px solid var(--accent-color) !important;
          color: #475569 !important;
          font-size: 0.75rem !important;
          padding: 6px 8px !important;
          margin-top: 6px !important;
        }
        .journal-header h1 {
          color: #0f172a !important;
        }
        .journal-header p {
          color: #475569 !important;
        }
        .spot-date, .spot-location, span, i, a {
          color: #64748b !important;
        }
      </style>
    `;

    let styledHtml = htmlString;
    if (htmlString.includes('</head>')) {
      styledHtml = htmlString.replace('</head>', pdfStyle + '</head>');
    } else {
      styledHtml = pdfStyle + htmlString;
    }

    // 1. 在主視窗中建立一個隱藏的 iframe 來加載並渲染 HTML 內容，防範主頁樣式污染
    if (onStatusUpdate) onStatusUpdate('正在載入 PDF 渲染模組...');
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '700px';
    iframe.style.height = '1000px'; 
    iframe.style.left = '-9999px';
    iframe.style.opacity = '0';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(styledHtml);
    iframeDoc.close();
    iframeDoc.documentElement.setAttribute('data-theme', 'light');

    // 2. 動態下載並載入 html2pdf.js 到【主視窗】中，避免彈出分頁載入外部腳本遭 iOS 沙盒安全封鎖
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
      if (onStatusUpdate) onStatusUpdate('正在下載並轉換相片資源...');

      // 3. 下載並將相片轉成 Base64
      const convertImagesToBase64 = async () => {
        const imgs = iframeDoc.querySelectorAll('img');
        if (imgs.length === 0) return;

        const promises = Array.from(imgs).map(async (img) => {
          const originalSrc = img.getAttribute('src');
          if (!originalSrc || originalSrc.startsWith('data:')) return;
          try {
            const res = await fetch(originalSrc);
            if (!res.ok) throw new Error('HTTP status ' + res.status);
            const blob = await res.blob();
            const base64Url = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            img.src = base64Url;
          } catch (err) {
            console.warn('相片轉換 Base64 失敗:', originalSrc, err);
          }
        });

        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 8000));
        await Promise.race([Promise.all(promises), timeoutPromise]);
      };

      convertImagesToBase64().then(() => {
        if (onStatusUpdate) onStatusUpdate('正在產生 PDF 長圖...');

        setTimeout(() => {
          const element = iframeDoc.querySelector('.container');
          const elementWidth = element.offsetWidth || 700;
          const elementHeight = element.offsetHeight || 1000;

          // 1 px = 0.75 pt (在 96 DPI 標準下)
          // 高度加上 30pt 安全空間，保證 100% 裝在第一頁，絕不產生第二頁空白頁！
          const widthInPt = elementWidth * 0.75;
          const heightInPt = elementHeight * 0.75 + 30;

          // 檢測是否為 iOS 裝置 (iPhone / iPad)
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

          const opt = {
            margin:       0,
            filename:     document.title.replace(' - 旅跡成果分享', '').replace(/\s+/g, '_') + '_長圖.pdf',
            image:        { type: 'jpeg', quality: 0.95 },
            html2canvas:  { 
              scale: isIOS ? 1 : 2, // iOS 裝置強制為 scale: 1，防止 WebKit 記憶體超載導致 Safari/Chrome 崩潰重整 (Reload)
              useCORS: true, 
              logging: false,
              backgroundColor: '#ffffff'
            },
            jsPDF:        { 
              unit: 'pt', 
              format: [widthInPt, heightInPt]
            }
          };

          if (isIOS) {
            // iOS 平台上使用 output('bloburl') 產生 PDF 記憶體網址
            html2pdf().set(opt).from(element).output('bloburl').then((blobUrl) => {
              document.body.removeChild(iframe);
              
              // 在 iOS 上，我們開啟一個全新視窗，且不加載任何外部 script，純靜態顯示
              const printWindow = window.open('', '_blank');
              if (!printWindow) {
                if (onError) onError(new Error('無法開啟 PDF 預覽分頁，請允許瀏覽器快顯視窗！'));
                return;
              }
              
              printWindow.document.open();
              printWindow.document.write(`
                <html>
                <head>
                  <title>旅跡手札 - PDF 預覽</title>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                </head>
                <body style="margin:0;padding:0;background:#0f172a;overflow:hidden;">
                  <div style="background:#0f172a;color:#ffffff;padding:0 16px;display:flex;justify-content:space-between;align-items:center;height:50px;box-shadow:0 4px 10px rgba(0,0,0,0.15);box-sizing:border-box;position:fixed;top:0;left:0;right:0;z-index:1000;">
                    <span style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:0.9rem;font-weight:500;">旅遊手札 PDF 預覽</span>
                    <a href="${blobUrl}" target="_blank" style="background:linear-gradient(135deg, #ff416c, #ff4b2b);color:#ffffff;text-decoration:none;padding:6px 12px;border-radius:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:0.75rem;font-weight:bold;box-shadow:0 2px 6px rgba(255,65,108,0.4);">在新分頁打開 PDF</a>
                  </div>
                  <iframe src="${blobUrl}" style="position:fixed;top:50px;left:0;width:100vw;height:calc(100vh - 50px);border:none;z-index:99;"></iframe>
                </body>
                </html>
              `);
              printWindow.document.close();

              if (onComplete) onComplete();
            }).catch(err => {
              document.body.removeChild(iframe);
              if (onError) onError(err);
            });
          } else {
            // 桌機與 Android 使用正常下載流程，在主頁面直接觸發下載，省去開啟新分頁
            html2pdf().set(opt).from(element).save().then(() => {
              document.body.removeChild(iframe);
              if (onComplete) onComplete();
            }).catch(err => {
              document.body.removeChild(iframe);
              if (onError) onError(err);
            });
          }
        }, 1000);
      });
    });
  } catch (err) {
    if (onError) onError(err);
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
