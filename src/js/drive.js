/* ==========================================================================
   Travel Journal - Google Drive API Sync Module
   ========================================================================== */

import { authState } from './auth.js';

/**
 * 取得當前可用的 Google Access Token，並做基本錯誤攔截
 */
function getHeaders(contentType = 'application/json') {
  if (!authState.accessToken) {
    throw new Error('Google 帳戶未登入或授權已過期');
  }
  const headers = {
    Authorization: `Bearer ${authState.accessToken}`
  };
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  return headers;
}

/**
 * 尋找或建立應用程式專屬資料夾
 * @param {string} folderName 資料夾名稱
 * @param {string} parentId 父資料夾 ID (選填)
 * @returns {Promise<string>} 資料夾 ID
 */
export async function findOrCreateFolder(folderName, parentId = null) {
  let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
  const res = await fetch(url, {
    method: 'GET',
    headers: getHeaders()
  });

  if (!res.ok) {
    throw new Error(`尋找資料夾失敗: ${res.statusText}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // 沒找到，新建資料夾
  const createUrl = 'https://www.googleapis.com/drive/v3/files?fields=id';
  const body = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentId) {
    body.parents = [parentId];
  }

  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body)
  });

  if (!createRes.ok) {
    throw new Error(`建立資料夾 ${folderName} 失敗: ${createRes.statusText}`);
  }

  const newFolder = await createRes.json();
  
  // 為了讓匯出的成果網頁能在 Google 協作平台完美顯示圖片，
  // 我們預設將專屬資料夾設定為「任何知道連結的人皆可讀取」，
  // 這樣上傳的圖片才能以直連網址載入。
  try {
    await makeFilePublic(newFolder.id);
  } catch (err) {
    console.warn('無法將資料夾設定為公開唯讀：', err);
  }

  return newFolder.id;
}

/**
 * 將 Google Drive 上的檔案或資料夾設定為「任何知道連結的人皆可檢視」
 */
export async function makeFilePublic(fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;
  const body = {
    role: 'reader',
    type: 'anyone'
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body)
  });
  return res.ok;
}

/**
 * 上傳檔案至指定資料夾 (照片或錄音檔)
 * @param {string} parentId 資料夾 ID
 * @param {string} filename 檔案名稱
 * @param {Blob|File} blob 檔案內容
 * @param {string} contentType 檔案 MIME 類型
 * @returns {Promise<string>} 檔案 ID
 */
export async function uploadFile(parentId, filename, blob, contentType) {
  const metadata = {
    name: filename,
    parents: [parentId]
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
  const res = await fetch(url, {
    method: 'POST',
    headers: getHeaders(null), // multipart 不需要 Content-Type 標頭，瀏覽器會自動產生 border
    body: form
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`檔案上傳失敗: ${res.statusText} (${errText})`);
  }

  const fileData = await res.json();
  
  // 上傳後將該檔案也設為公開唯讀，以確保直連網址可用
  try {
    await makeFilePublic(fileData.id);
  } catch (e) {
    console.warn(`無法設定檔案 ${filename} 為公開：`, e);
  }

  return fileData.id;
}

/**
 * 讀取文字型檔案內容 (如 trips.json)
 * @param {string} fileId 檔案 ID
 * @returns {Promise<string>} 檔案文字內容
 */
export async function downloadTextFile(fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    method: 'GET',
    headers: getHeaders(null)
  });

  if (!res.ok) {
    throw new Error(`下載檔案失敗: ${res.statusText}`);
  }

  return await res.text();
}

/**
 * 讀取二進制檔案為 Blob (如錄音檔)
 */
export async function downloadBlobFile(fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    method: 'GET',
    headers: getHeaders(null)
  });

  if (!res.ok) {
    throw new Error(`下載檔案失敗: ${res.statusText}`);
  }

  return await res.blob();
}

/**
 * 更新已存在檔案的內容
 * @param {string} fileId 檔案 ID
 * @param {string|Blob} content 檔案新內容
 * @param {string} contentType MIME 類型
 */
export async function updateFileContent(fileId, content, contentType) {
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: getHeaders(contentType),
    body: content
  });

  if (!res.ok) {
    throw new Error(`更新檔案失敗: ${res.statusText}`);
  }

  return await res.json();
}

/**
 * 搜尋資料夾下的特定檔案 (如 trips.json)
 */
export async function findFileInFolder(parentId, filename) {
  const query = `name = '${filename}' and '${parentId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
  const res = await fetch(url, {
    method: 'GET',
    headers: getHeaders()
  });

  if (!res.ok) {
    throw new Error(`尋找檔案失敗: ${res.statusText}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * 刪除 Google Drive 上的檔案
 */
export async function deleteFile(fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: getHeaders()
  });
  
  if (!res.ok) {
    throw new Error(`刪除檔案失敗: ${res.statusText}`);
  }
  return true;
}

/**
 * 產生 Google Drive 直連圖片或檔案的公開網址 (可用於嵌入)
 */
export function getDirectFileUrl(fileId) {
  // 對於圖片，這個 URL 可以在網頁上直接載入 (在 file 被設為 anyone reader 之後)
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
}

/**
 * 取得用於下載/播放錄音檔的 URL
 */
export function getAudioDownloadUrl(fileId) {
  return `https://docs.google.com/uc?export=download&id=${fileId}`;
}
