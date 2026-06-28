const CACHE_NAME = 'travel-journal-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

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
        // 離線且無快取時的 fallback
      });
    })
  );
});
