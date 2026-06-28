/* ==========================================================================
   Travel Journal - Photo Inspiration Search (Flickr & Unsplash)
   ========================================================================== */

// 預設的 Flickr 公用金鑰 (僅供測試使用，建議使用者在設定中替換成自己的)
const DEFAULT_FLICKR_KEY = '5200df80bcfb8b7ed6fb87441584db1e';

export const searchKeys = {
  flickrKey: localStorage.getItem('tj_flickr_key') || DEFAULT_FLICKR_KEY,
  unsplashKey: localStorage.getItem('tj_unsplash_key') || ''
};

/**
 * 更新 API 金鑰並儲存
 */
export function updateSearchKeys(flickr, unsplash) {
  searchKeys.flickrKey = flickr || DEFAULT_FLICKR_KEY;
  searchKeys.unsplashKey = unsplash || '';
  localStorage.setItem('tj_flickr_key', searchKeys.flickrKey);
  localStorage.setItem('tj_unsplash_key', searchKeys.unsplashKey);
}

/**
 * 根據地名或關鍵字，搜尋高品質的旅遊美照，供使用者模仿構圖
 * @param {string} query 搜尋關鍵字 (例如 "熊本城" 或 "Kumamoto Castle")
 * @returns {Promise<Array<{url: string, author: string, link: string}>>} 照片清單
 */
export async function searchInspirationPhotos(query) {
  if (!query || query.trim() === '') return [];
  
  const results = [];

  // 1. 優先嘗試使用 Unsplash API (若使用者有提供 Unsplash Access Key)
  if (searchKeys.unsplashKey) {
    try {
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12&orientation=squarish`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Client-ID ${searchKeys.unsplashKey}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          data.results.forEach(img => {
            results.push({
              url: img.urls.small || img.urls.regular,
              author: img.user.name || 'Unsplash 攝影師',
              link: img.links.html,
              source: 'Unsplash'
            });
          });
          return results; // 有 Unsplash 結果就優先返回
        }
      }
    } catch (e) {
      console.warn('Unsplash 搜尋失敗，切換為 Flickr:', e);
    }
  }

  // 2. 備用方案：使用 Flickr API
  if (searchKeys.flickrKey) {
    try {
      const url = `https://www.flickr.com/services/rest/?method=flickr.photos.search&api_key=${searchKeys.flickrKey}&text=${encodeURIComponent(query)}&sort=interestingness-desc&privacy_filter=1&safe_search=1&per_page=12&format=json&nojsoncallback=1`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.photos && data.photos.photo && data.photos.photo.length > 0) {
          data.photos.photo.forEach(p => {
            // 組裝 Flickr 圖片的 URL
            // 格式: https://live.staticflickr.com/{server-id}/{id}_{secret}_{size-suffix}.jpg
            const imgUrl = `https://live.staticflickr.com/${p.server}/${p.id}_${p.secret}_q.jpg`; // 'q' 為 150x150 正方形
            const photoLink = `https://www.flickr.com/photos/${p.owner}/${p.id}`;
            results.push({
              url: imgUrl,
              author: `Flickr 用戶`,
              link: photoLink,
              source: 'Flickr'
            });
          });
        }
      }
    } catch (err) {
      console.error('Flickr 搜尋失敗：', err);
    }
  }

  // 3. 極度後備方案：如果 API 都失效或沒有結果，回傳一些預設的高質感佔位圖，避免介面空無一物
  if (results.length === 0) {
    const fallbacks = [
      'https://images.unsplash.com/photo-1542044896530-05d85be9b11a?w=400&fit=crop&q=60', // Camera
      'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400&fit=crop&q=60', // Map
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&fit=crop&q=60', // Beach
      'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400&fit=crop&q=60'  // Roadtrip
    ];
    fallbacks.forEach((url, i) => {
      results.push({
        url: url,
        author: '旅跡手札精選',
        link: 'https://unsplash.com',
        source: '精選'
      });
    });
  }

  return results;
}
