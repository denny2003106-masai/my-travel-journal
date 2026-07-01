const CACHE_NAME = 'travel-journal-v2'; // 更新版本以清除舊快取
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg'
];

// 安裝事件
self.addEventListener('install', (e) => {
  self.skipWaiting(); // 立即跳過等待，啟用新 Service Worker
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// 激活事件
self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(), // 立即接管網頁控制權
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              console.log('正在清除舊快取:', key);
              return caches.delete(key);
            }
          })
        );
      })
    ])
  );
});

// 網路優先策略 (用於 HTML 和 PWA 設定檔)
function networkFirst(request) {
  return fetch(request).then((response) => {
    if (response && response.status === 200) {
      const responseToCache = response.clone();
      caches.open(CACHE_NAME).then((cache) => {
        cache.put(request, responseToCache);
      });
    }
    return response;
  }).catch(() => {
    return caches.match(request);
  });
}

// 請求攔截
self.addEventListener('fetch', (e) => {
  // 1. 如果是開發環境 (包含 localhost, 127.0.0.1 或 Vite 開發請求)，完全繞過 Service Worker
  if (
    e.request.url.includes('localhost') || 
    e.request.url.includes('127.0.0.1') || 
    e.request.url.includes('@vite') || 
    e.request.url.includes('__vite_ping') || 
    e.request.url.includes('node_modules')
  ) {
    return;
  }

  // 2. 對於 API 請求或 Google Authentication 不進行快取，直接網路請求
  if (e.request.url.includes('googleapis.com') || e.request.url.includes('google.com')) {
    return;
  }

  const url = new URL(e.request.url);
  
  // 3. 對於導航請求 (HTML) 或 PWA 設定檔，採用「網路優先」策略，確保連網時拿到最新代碼
  if (
    e.request.mode === 'navigate' || 
    url.pathname === '/' || 
    url.pathname.endsWith('/index.html') || 
    url.pathname.endsWith('/manifest.json') || 
    url.pathname.endsWith('/service-worker.js')
  ) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // 4. 其他靜態資源 (CSS, JS, 圖片) 採用「快取優先」策略，加快載入速度
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((response) => {
        // 確保響應有效
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        
        // 複製響應寫入快取
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });
        
        return response;
      }).catch(() => {
        // 離線且無快取
      });
    })
  );
});
