/* ==========================================================================
   Travel Journal - GPS (EXIF) Extraction & Image Compression Module
   ========================================================================== */

import exifr from 'exifr';

/**
 * 讀取圖片的 EXIF GPS 資訊
 * @param {File} file 圖片檔案
 * @returns {Promise<{lat: number, lng: number}|null>} 經緯度對象
 */
export async function getPhotoLocation(file) {
  const result = { lat: null, lng: null, date: null, timestamp: null };
  try {
    // 1. 解析 GPS 資訊
    const gps = await exifr.gps(file);
    if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
      result.lat = gps.latitude;
      result.lng = gps.longitude;
    }

    // 2. 解析拍攝日期資訊
    const meta = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
    if (meta) {
      const dateVal = meta.DateTimeOriginal || meta.CreateDate;
      if (dateVal instanceof Date && !isNaN(dateVal)) {
        const yyyy = dateVal.getFullYear();
        const mm = String(dateVal.getMonth() + 1).padStart(2, '0');
        const dd = String(dateVal.getDate()).padStart(2, '0');
        result.date = `${yyyy}-${mm}-${dd}`;
        result.timestamp = dateVal.getTime();
      } else if (typeof dateVal === 'string') {
        const match = dateVal.trim().match(/^(\d{4})[:/-](\d{2})[:/-](\d{2})(?:\s+(\d{2})[:/-](\d{2})[:/-](\d{2}))?/);
        if (match) {
          result.date = `${match[1]}-${match[2]}-${match[3]}`;
          const dateStr = `${match[1]}/${match[2]}/${match[3]}` + (match[4] ? ` ${match[4]}:${match[5]}:${match[6]}` : ' 00:00:00');
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime())) {
            result.timestamp = parsedDate.getTime();
          }
        }
      }
    }
  } catch (err) {
    console.warn('exifr 解析相片中繼資料失敗：', err);
  }
  
  if (result.lat !== null || result.lng !== null || result.date !== null) {
    return result;
  }
  return null;
}

/**
 * 使用 OpenStreetMap Nominatim API 反向地理編碼，將經緯度轉換為人類可讀地名
 * @param {number} lat 緯度
 * @param {number} lng 經度
 * @returns {Promise<string>} 景點/地區名稱
 */
export async function getPlaceNameFromGPS(lat, lng) {
  try {
    // 增加 zoom 至 18 以獲得最精確的地點資訊
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=zh-TW,zh,en`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'
      }
    });
    if (res.ok) {
      const data = await res.json();
      const address = data.address || {};
      
      // 1. 優先使用特定的 POI/商業/地標屬性作為景點名稱，避開廣域行政區名
      const poiKeys = [
        'tourism', 'historic', 'attraction', 'amenity', 'shop', 'leisure', 
        'building', 'office', 'aeroway', 'station', 'railway', 'highway', 'rest_area'
      ];
      
      let spotName = '';
      for (const key of poiKeys) {
        if (address[key]) {
          spotName = address[key];
          break;
        }
      }
      
      // 如果沒有找到特定的地標，使用 display_name 的第一個逗號前的部分（代表最精確的位置特徵）
      if (!spotName && data.display_name) {
        spotName = data.display_name.split(',')[0].trim();
      }
      
      if (!spotName) {
        spotName = '未知景點';
      }
      
      // 2. 組合完整的詳細地址
      const fullAddress = data.display_name || '未知地址';
      
      return { name: spotName, address: fullAddress };
    }
  } catch (err) {
    console.warn('反向地名編碼失敗：', err);
  }
  return { 
    name: `經緯度: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, 
    address: `緯度: ${lat}, 經度: ${lng}` 
  };
}

/**
 * 壓縮圖片，限制最大寬度為 2048px，並在畫布上渲染以利儲存
 * @param {File} file 原始圖片檔案
 * @param {number} maxWidth 最大寬度限制 (預設 2048)
 * @returns {Promise<Blob>} 壓縮後的 JPEG Blob
 */
export function compressImage(file, maxWidth = 2048) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // 計算等比例縮放
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // 轉換為 JPEG Blob，品質設為 85%
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('圖片壓縮失敗'));
            }
          },
          'image/jpeg',
          0.85
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

/**
 * 計算經緯度球面大圓距離 (哈弗辛公式 Haversine Formula，公里)
 */
export function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // 地球半徑 (km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 依據 GPS 距離（1公里）與時間戳記將相片群聚歸類為景點 (Leader-Clustering)
 */
export function clusterPhotos(photos, maxDistanceKm = 1.0) {
  const clusters = [];

  // 1. 優先將相片按照片拍攝時間進行排序
  const sorted = [...photos].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  sorted.forEach(photo => {
    // 若相片沒有 GPS 資訊，依據日期單獨建立「無定位」群組
    if (photo.lat === null || photo.lng === null) {
      let group = clusters.find(c => c.isNoGps && c.date === photo.date);
      if (!group) {
        group = {
          isNoGps: true,
          lat: null,
          lng: null,
          date: photo.date || new Date().toISOString().split('T')[0],
          photos: []
        };
        clusters.push(group);
      }
      group.photos.push(photo);
      return;
    }

    // 有 GPS，尋找符合距離 <= 1km 且「日期相同」的現有群聚 (不同日期拍攝則視為新景點/新行程)
    let matchedCluster = null;
    for (const cluster of clusters) {
      if (cluster.isNoGps) continue;
      if (cluster.date !== photo.date) continue; // 不同拍攝日期，強制拆分為不同景點
      const dist = getDistance(photo.lat, photo.lng, cluster.lat, cluster.lng);
      if (dist <= maxDistanceKm) {
        matchedCluster = cluster;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.photos.push(photo);
      // 動態更新群群質心 (Center of Mass)
      const count = matchedCluster.photos.length;
      matchedCluster.lat = (matchedCluster.lat * (count - 1) + photo.lat) / count;
      matchedCluster.lng = (matchedCluster.lng * (count - 1) + photo.lng) / count;
    } else {
      // 建立新群聚
      clusters.push({
        isNoGps: false,
        lat: photo.lat,
        lng: photo.lng,
        date: photo.date || new Date().toISOString().split('T')[0],
        photos: [photo]
      });
    }
  });

  return clusters;
}

/**
 * 空間多樣性篩選演算法 (Max-Min Greedy Selection，最多挑選 8 張)
 */
export function selectDiversePhotos(photos, limit = 8) {
  if (photos.length <= limit) return photos;

  // 1. 完全重複坐標去重 (僅保留該定點拍攝時間最早的一張)
  const uniquePhotos = [];
  const coordsSet = new Set();
  const sorted = [...photos].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  
  sorted.forEach(p => {
    if (p.lat === null || p.lng === null) {
      uniquePhotos.push(p);
      return;
    }
    // 經緯度取小數點後 5 位作為去重 key (約 1.1 米範圍)
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    if (!coordsSet.has(key)) {
      coordsSet.add(key);
      uniquePhotos.push(p);
    }
  });

  if (uniquePhotos.length <= limit) return uniquePhotos;

  // 2. 貪婪最大化最小距離 (Max-Min Greedy Selection) 挑選出發散的 8 張
  const selected = [];
  selected.push(uniquePhotos[0]); // 起始點：最早的照片
  
  while (selected.length < limit && selected.length < uniquePhotos.length) {
    let bestPhoto = null;
    let maxMinDist = -1;

    for (const photo of uniquePhotos) {
      if (selected.includes(photo)) continue;
      if (photo.lat === null || photo.lng === null) continue;

      let minDist = Infinity;
      for (const sel of selected) {
        if (sel.lat === null || sel.lng === null) continue;
        const d = getDistance(photo.lat, photo.lng, sel.lat, sel.lng);
        if (d < minDist) minDist = d;
      }

      // 我們希望挑選「最小距離」最大的那張照片 (即最遠離已選照片集的位置)
      if (minDist > maxMinDist) {
        maxMinDist = minDist;
        bestPhoto = photo;
      }
    }

    if (bestPhoto) {
      selected.push(bestPhoto);
    } else {
      const remaining = uniquePhotos.filter(p => !selected.includes(p));
      if (remaining.length > 0) {
        selected.push(remaining[0]);
      } else {
        break;
      }
    }
  }

  return selected.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}
