/* ==========================================================================
   Travel Journal - Single Page HTML Export Template
   ========================================================================== */

import { getDirectFileUrl, getAudioDownloadUrl } from './drive.js';

/**
 * 產生可用於 Google 協作平台嵌入或獨立分享的單頁式旅遊成果網頁 (HTML/CSS)
 * @param {Object} trip 行程物件
 * @param {Array<Object>} spots 景點清單 (已篩選)
 * @param {string} theme 風格主題
 * @returns {string} 完整的 HTML 字串
 */
export function generateSinglePageHtml(trip, spots, theme = 'youth') {
  const tripName = trip.name || '我的旅遊手札';
  const region = trip.region || '未分類區域';
  const dateStr = `${trip.startDate || ''} ~ ${trip.endDate || ''}`;

  // 各視覺風格與輕音樂背景設定 (挑選過更柔和的輕音樂)
  const themeConfig = {
    youth: {
      name: '青春',
      bgPrimary: '#0f172a',
      bgSecondary: '#1e293b',
      bgCard: 'rgba(30, 41, 59, 0.65)',
      borderColor: 'rgba(255, 255, 255, 0.08)',
      textPrimary: '#f8fafc',
      textSecondary: '#94a3b8',
      accentColor: '#06b6d4',      /* Cyan */
      accentPurple: '#ec4899',     /* Pink */
      bgmUrl: 'https://archive.org/download/ClaudeDebussyClairDeLuneFromTwilight/Claude%20Debussy%20-%20Clair%20de%20lune%20%28From%20Twilight%29.mp3' /* 德布西：月光 (柔美鋼琴) */
    },
    hotblood: {
      name: '熱血',
      bgPrimary: '#180808',
      bgSecondary: '#2d0f0f',
      bgCard: 'rgba(45, 15, 15, 0.65)',
      borderColor: 'rgba(244, 63, 94, 0.15)',
      textPrimary: '#fff1f2',
      textSecondary: '#fda4af',
      accentColor: '#f43f5e',      /* Rose */
      accentPurple: '#f97316',     /* Orange */
      bgmUrl: 'https://archive.org/download/Complete_Chopin_Nocturnes/Chopin_Nocturne_No.04_in_EfM_Op.9_2_SDRodrian.mp3' /* 蕭邦：夜曲 Op.9 No.2 (優雅柔和) */
    },
    natural: {
      name: '自然',
      bgPrimary: '#061c15',
      bgSecondary: '#0a2d21',
      bgCard: 'rgba(10, 45, 33, 0.65)',
      borderColor: 'rgba(16, 185, 129, 0.12)',
      textPrimary: '#ecfdf5',
      textSecondary: '#a7f3d0',
      accentColor: '#10b981',      /* Emerald Green */
      accentPurple: '#84cc16',     /* Lime */
      bgmUrl: 'https://archive.org/download/musopen-chopin/Prelude%20Op.%2028%20no.%2015.mp3' /* 蕭邦：雨滴前奏曲 (自然雨滴感) */
    },
    foodie: {
      name: '美食',
      bgPrimary: '#1c120c',
      bgSecondary: '#2e1e14',
      bgCard: 'rgba(46, 30, 20, 0.65)',
      borderColor: 'rgba(245, 158, 11, 0.15)',
      textPrimary: '#fffbeb',
      textSecondary: '#fde68a',
      accentColor: '#f59e0b',      /* Amber */
      accentPurple: '#f43f5e',     /* Coral Rose */
      bgmUrl: 'https://archive.org/download/OpenGoldbergVariations/Kimiko%20Ishizaka%20-%20J.S.%20Bach-%20-Open-%20Goldberg%20Variations%2C%20BWV%20988%20%28Piano%29%20-%2001%20Aria.mp3' /* 巴哈：郭德堡變奏曲-詠嘆調 (平靜溫暖) */
    },
    shopping: {
      name: 'SHOPPING',
      bgPrimary: '#170b28',
      bgSecondary: '#24113f',
      bgCard: 'rgba(36, 17, 63, 0.65)',
      borderColor: 'rgba(168, 85, 247, 0.15)',
      textPrimary: '#faf5ff',
      textSecondary: '#e9d5ff',
      accentColor: '#a855f7',      /* Purple */
      accentPurple: '#d946ef',     /* Fuchsia */
      bgmUrl: 'https://archive.org/download/BeethovenPianoSonataNo.14moonlightrubinstein/04Beethoven_PianoSonata14InCSharpMinorOp.27_2_moonlight_-1.AdagioSostenuto.mp3' /* 貝多芬：月光奏鳴曲第一樂章 (神祕沉靜) */
    },
    healing: {
      name: '療癒放空',
      bgPrimary: '#091220',
      bgSecondary: '#0f1f33',
      bgCard: 'rgba(15, 31, 51, 0.6)',
      borderColor: 'rgba(147, 197, 253, 0.15)',
      textPrimary: '#eff6ff',
      textSecondary: '#bfdbfe',
      accentColor: '#60a5fa',      /* Soft Blue */
      accentPurple: '#c084fc',     /* Lavender */
      bgmUrl: 'https://archive.org/download/GymnopedieNo.1/Gymnopedie%20No.1.mp3' /* 薩提：第一號琴諾佩第 (最放鬆療癒) */
    }
  };

  const currentTheme = themeConfig[theme] || themeConfig.youth;

  // 根據風格主題產生額外的視覺自訂樣式覆寫
  let themeCss = '';
  if (theme === 'youth') {
    themeCss = `
      body { --font-family: 'Outfit', 'Noto Sans TC', sans-serif; }
      .spot-card { border-radius: 24px; box-shadow: 0 10px 25px rgba(6, 182, 212, 0.15); }
      .spot-marker { border-radius: 50%; }
    `;
  } else if (theme === 'hotblood') {
    themeCss = `
      body { --font-family: 'Outfit', 'Noto Sans TC', sans-serif; }
      .spot-card { border-radius: 4px; border: 2px solid var(--accent-color); transform: skewX(-1deg); box-shadow: 4px 4px 0px var(--accent-purple); }
      .spot-marker { border-radius: 0; transform: rotate(45deg); }
      .spot-marker::before { display: block; transform: rotate(-45deg); }
    `;
  } else if (theme === 'natural') {
    themeCss = `
      body { --font-family: 'Georgia', 'Noto Sans TC', serif; background-image: radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.05) 0%, transparent 80%); }
      .spot-card { border-radius: 40px 10px 40px 10px; border: 1px solid rgba(16, 185, 129, 0.2); box-shadow: 0 8px 32px rgba(6, 28, 21, 0.2); }
      .spot-marker { border-radius: 40px 10px 40px 10px; }
    `;
  } else if (theme === 'foodie') {
    themeCss = `
      body { --font-family: 'Playfair Display', 'Noto Sans TC', serif; }
      .spot-card { border-radius: 16px; border: 1px dashed var(--accent-color); box-shadow: 0 4px 15px rgba(245, 158, 11, 0.1); }
      .spot-marker { border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%; }
      .photo-img-wrapper { border-radius: 50% 50% 0 0; }
    `;
  } else if (theme === 'shopping') {
    themeCss = `
      body { --font-family: 'Outfit', 'Noto Sans TC', sans-serif; letter-spacing: 0.5px; }
      .spot-card { border-radius: 0px; border-left: 5px solid var(--accent-color); box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4); }
      .spot-marker { border-radius: 50%; background: var(--text-primary); color: var(--bg-primary); border: 2px solid var(--accent-color); }
    `;
  } else if (theme === 'healing') {
    themeCss = `
      body { --font-family: 'Outfit', 'Noto Sans TC', sans-serif; }
      .spot-card { border-radius: 30px; backdrop-filter: blur(25px); box-shadow: 0 15px 40px rgba(147, 197, 253, 0.1); border: 1px solid rgba(255,255,255,0.12); }
      .spot-marker { border-radius: 50%; animation: pulseHealing 3s infinite ease-in-out; }
      @keyframes pulseHealing {
        0% { box-shadow: 0 0 0 0px rgba(96, 165, 250, 0.4); }
        70% { box-shadow: 0 0 0 12px rgba(96, 165, 250, 0); }
        100% { box-shadow: 0 0 0 0px rgba(96, 165, 250, 0); }
      }
    `;
  }

  // 產生景點 HTML 內容
  let spotsHtml = '';
  spots.forEach((spot, index) => {
    // 圖片網格
    let photosHtml = '';
    if (spot.photos && spot.photos.length > 0) {
      photosHtml = `<div class="photo-grid">`;
      spot.photos.forEach(photo => {
        // 設定照片連結
        const imgUrl = photo.driveFileId ? getDirectFileUrl(photo.driveFileId) : 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400&fit=crop&q=60';
        
        let audioPlayHtml = '';
        if (photo.audioFileId) {
          // 語音轉化文字的內容 (若有)，直接在播放器下方顯示為「語音隨筆文字」
          const voiceTextHtml = photo.comment 
            ? `<div class="voice-transcript"><i class="fa-solid fa-quote-left" style="margin-right:6px; color:var(--accent-color);"></i>${photo.comment}</div>` 
            : '';
          
          // 為了解決 Safari 與行動端 CORS 對直接播音的重重阻擋，
          // 在成果網頁裡我們直接使用 Google Drive 原生預覽播放器的 Iframe 嵌入，以獲得 100% 完美的播放體驗！
          audioPlayHtml = `
            <div class="audio-badge">
              <div style="font-size:0.75rem; font-weight:600; display:flex; align-items:center; gap:6px; margin-bottom:8px;">
                <i class="fa-solid fa-microphone"></i> 語音隨筆感受
              </div>
              <div class="audio-iframe-wrapper" style="border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color); background: rgba(0,0,0,0.15); height: 60px; margin-bottom: 8px;">
                <iframe src="https://drive.google.com/file/d/${photo.audioFileId}/preview" width="100%" height="60" style="border: none; overflow: hidden; background: transparent;" scrolling="no"></iframe>
              </div>
              ${voiceTextHtml}
            </div>
          `;
        }

        // 如果是僅有語音而無相片
        const isAudioOnly = photo.driveFileId === '';
        
        // 若不是純語音，且有相片說明，則顯示相片隨筆
        const commentHtml = (photo.comment && !isAudioOnly && !photo.audioFileId) 
          ? `<p class="photo-caption">${photo.comment}</p>` 
          : '';

        photosHtml += `
          <div class="photo-card">
            ${!isAudioOnly ? `
              <div class="photo-img-wrapper">
                <img src="${imgUrl}" alt="${photo.originalName || '照片'}" loading="lazy" onclick="openLightbox('${imgUrl}')" />
              </div>
            ` : ''}
            ${audioPlayHtml}
            ${commentHtml}
          </div>
        `;
      });
      photosHtml += `</div>`;
    }

    const spotDate = spot.date ? `<span class="spot-date"><i class="fa-regular fa-calendar-days"></i> ${spot.date}</span>` : '';
    const spotLoc = spot.location && spot.location.address ? `
      <span class="spot-loc">
        <i class="fa-solid fa-location-dot"></i> 
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.location.address)}" target="_blank">${spot.location.address}</a>
      </span>
    ` : '';

    spotsHtml += `
      <div class="spot-item">
        <div class="spot-timeline">
          <div class="spot-marker">${index + 1}</div>
          <div class="spot-line"></div>
        </div>
        <div class="spot-card">
          <div class="spot-header">
            <h3 class="spot-name">${spot.name}</h3>
            <div class="spot-badges">
              ${spotDate}
              ${spotLoc}
            </div>
          </div>
          <p class="spot-desc">${spot.description || '在此處留下了美好的回憶...'}</p>
          ${photosHtml}
        </div>
      </div>
    `;
  });

  // 返回完整 HTML
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${tripName} - 旅跡成果分享 (${currentTheme.name}風格)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
  <style>
    :root {
      --bg-primary: ${currentTheme.bgPrimary};
      --bg-secondary: ${currentTheme.bgSecondary};
      --bg-card: ${currentTheme.bgCard};
      --border-color: ${currentTheme.borderColor};
      --text-primary: ${currentTheme.textPrimary};
      --text-secondary: ${currentTheme.textSecondary};
      --accent-color: ${currentTheme.accentColor};
      --accent-purple: ${currentTheme.accentPurple};
      --font-family: 'Outfit', 'Noto Sans TC', sans-serif;
    }
    
    [data-theme="light"] {
      --bg-primary: #f8fafc;
      --bg-secondary: #ffffff;
      --bg-card: rgba(255, 255, 255, 0.8);
      --border-color: rgba(0, 0, 0, 0.08);
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --accent-color: ${currentTheme.accentColor};
      --accent-purple: ${currentTheme.accentPurple};
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-family);
      line-height: 1.6;
      padding-bottom: 60px;
      transition: background-color 0.3s, color 0.3s;
    }

    .container {
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
      padding: 24px 16px;
    }

    header {
      background: radial-gradient(circle at top right, var(--bg-secondary), var(--bg-primary));
      border: 1px solid var(--border-color);
      border-radius: 24px;
      padding: 32px 24px;
      margin-bottom: 32px;
      text-align: center;
      position: relative;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    }

    .header-actions {
      position: absolute;
      top: 16px;
      right: 16px;
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .action-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border-color);
      border-radius: 50%;
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--text-primary);
      transition: all 0.2s ease;
    }
    
    .action-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      transform: scale(1.05);
    }

    .music-btn.playing {
      color: var(--accent-color);
      border-color: var(--accent-color);
      box-shadow: 0 0 10px var(--accent-color);
      animation: spinCD 4s linear infinite;
    }

    h1 {
      font-size: 2.2rem;
      font-weight: 800;
      margin-bottom: 12px;
      background: linear-gradient(to right, var(--accent-color), var(--accent-purple));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: 0.5px;
    }

    .trip-meta {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 16px;
      color: var(--text-secondary);
      font-size: 0.9rem;
    }

    .trip-meta span {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Timeline and Spots */
    .timeline {
      display: flex;
      flex-direction: column;
      margin-top: 16px;
    }

    .spot-item {
      display: flex;
      position: relative;
    }

    .spot-timeline {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-right: 16px;
    }

    .spot-marker {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent-color), var(--accent-purple));
      color: #0f0c20;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
      box-shadow: 0 0 10px var(--accent-color);
    }

    .spot-line {
      width: 2px;
      flex: 1;
      background: var(--border-color);
    }

    .spot-item:last-child .spot-line {
      display: none;
    }

    .spot-card {
      flex: 1;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 20px;
      padding: 24px;
      margin-bottom: 24px;
      backdrop-filter: blur(12px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      transition: all 0.3s ease;
    }

    .spot-header {
      margin-bottom: 12px;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 10px;
    }

    .spot-name {
      font-size: 1.35rem;
      font-weight: 700;
      margin-bottom: 6px;
      color: var(--text-primary);
    }

    .spot-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .spot-badges span i {
      color: var(--accent-color);
    }
    
    .spot-loc a {
      color: var(--text-secondary);
      text-decoration: none;
      border-bottom: 1px dotted var(--text-secondary);
    }
    .spot-loc a:hover {
      color: var(--accent-color);
    }

    .spot-desc {
      font-size: 0.95rem;
      color: var(--text-primary);
      margin-bottom: 20px;
      white-space: pre-wrap;
      line-height: 1.7;
    }

    /* Photo Grid */
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }

    .photo-card {
      background: rgba(0,0,0,0.15);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: inset 0 0 10px rgba(0,0,0,0.2);
    }

    .photo-img-wrapper {
      aspect-ratio: 4/3;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
    }

    .photo-img-wrapper img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }

    .photo-img-wrapper img:hover {
      transform: scale(1.04);
    }

    .photo-caption {
      font-size: 0.8rem;
      color: var(--text-secondary);
      text-align: center;
      padding: 4px;
      line-height: 1.4;
      font-style: italic;
    }

    /* Audio Player */
    .audio-badge {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px;
      background: rgba(255,255,255,0.04);
      border-radius: 8px;
      font-size: 0.75rem;
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
    }

    .voice-transcript {
      margin-top: 8px;
      padding: 8px 10px;
      background: rgba(0, 0, 0, 0.25);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 0.8rem;
      line-height: 1.5;
      border-left: 2px solid var(--accent-color);
      font-style: italic;
    }

    /* Lightbox Modal */
    .lightbox {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .lightbox img {
      max-width: 90%;
      max-height: 80%;
      border-radius: 8px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
    }

    .lightbox-close {
      position: absolute;
      top: 20px;
      right: 20px;
      color: white;
      font-size: 2.2rem;
      cursor: pointer;
      transition: 0.2s;
    }
    
    .lightbox-close:hover {
      transform: scale(1.1);
    }

    /* CD Spin Animation */
    @keyframes spinCD {
      to { transform: rotate(360deg); }
    }

    /* Responsive */
    @media (max-width: 600px) {
      .trip-meta {
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      .spot-item {
        flex-direction: column;
      }
      .spot-timeline {
        flex-direction: row;
        width: 100%;
        margin-right: 0;
        margin-bottom: 12px;
        align-items: center;
      }
      .spot-line {
        height: 2px;
        width: 100%;
        margin-left: 12px;
      }
      .spot-marker {
        width: 28px;
        height: 28px;
        font-size: 0.85rem;
      }
      .photo-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }
    }

    /* 風格化視覺覆寫 */
    ${themeCss}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-actions">
        <!-- 浮動背景音樂播放按鈕 -->
        <div class="action-btn music-btn" onclick="toggleMusic()" title="播放/暫停背景音樂">
          <i class="fa-solid fa-compact-disc" style="font-size: 1.2rem;"></i>
          <audio id="bgm-player" loop src="${currentTheme.bgmUrl}"></audio>
        </div>
        <!-- 亮暗模式切換 -->
        <div class="action-btn theme-toggle" onclick="toggleTheme()" title="切換主題">
          <i class="fa-solid fa-moon"></i>
        </div>
      </div>
      <h1>${tripName}</h1>
      <div class="trip-meta">
        <span><i class="fa-solid fa-map-location-dot"></i> ${region}</span>
        <span><i class="fa-regular fa-clock"></i> ${dateStr}</span>
      </div>
    </header>

    <div class="timeline">
      ${spotsHtml}
    </div>
  </div>

  <!-- Lightbox -->
  <div class="lightbox" id="lightbox" onclick="closeLightbox()">
    <span class="lightbox-close">&times;</span>
    <img id="lightbox-img" src="" alt="放大圖" />
  </div>

  <script>
    // 亮暗主題切換
    function toggleTheme() {
      const body = document.body;
      const icon = document.querySelector('.theme-toggle i');
      if (body.hasAttribute('data-theme')) {
        body.removeAttribute('data-theme');
        icon.className = 'fa-solid fa-moon';
      } else {
        body.setAttribute('data-theme', 'light');
        icon.className = 'fa-solid fa-sun';
      }
    }

    // 背景音樂控制項
    function toggleMusic() {
      const bgm = document.getElementById('bgm-player');
      const btn = document.querySelector('.music-btn');
      
      if (bgm.paused) {
        bgm.play().then(() => {
          btn.classList.add('playing');
        }).catch(err => {
          alert('提示：由於瀏覽器安全政策，請點擊頁面任意處後再點擊音樂按鈕，即可開始播放背景音樂！');
          console.warn("Autoplay blocked:", err);
        });
      } else {
        bgm.pause();
        btn.classList.remove('playing');
      }
    }

    // 燈箱控制
    function openLightbox(url) {
      document.getElementById('lightbox-img').src = url;
      document.getElementById('lightbox').style.display = 'flex';
    }

    function closeLightbox() {
      document.getElementById('lightbox').style.display = 'none';
    }
  </script>
</body>
</html>
`;
}
