/* ==========================================================================
   Travel Journal - Google OAuth 2.0 Client & Onboarding Manager
   ========================================================================== */

// 預設的 Google Client ID (使用者可以在設定中自訂，若是自己託管)
const DEFAULT_CLIENT_ID = '404693681965-ofbp1tr14kcetr86jv9jp5ce5vtijm8j.apps.googleusercontent.com'; // 使用者測試用 Client ID

const savedClientId = localStorage.getItem('tj_client_id');
const oldDummyId = '953685043825-p322qsnv86i3i2ch0qplv6tndg9omd20.apps.googleusercontent.com';

export const authState = {
  accessToken: localStorage.getItem('tj_access_token') || '',
  tokenExpiry: parseInt(localStorage.getItem('tj_token_expiry') || '0', 10),
  clientId: (savedClientId && savedClientId !== oldDummyId) ? savedClientId : DEFAULT_CLIENT_ID,
  userEmail: localStorage.getItem('tj_user_email') || '',
  userName: localStorage.getItem('tj_user_name') || ''
};

let tokenClient = null;

/**
 * 檢查當前 Token 是否有效
 */
export function isTokenValid() {
  return authState.accessToken && Date.now() < authState.tokenExpiry;
}

/**
 * 初始化 Google Identity Services Token Client
 */
export function initGoogleAuth(onSuccess, onError) {
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    console.error('Google GIS SDK not loaded yet.');
    if (onError) onError('Google SDK 尚未載入，請稍後再試。');
    return;
  }

  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: authState.clientId,
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
      callback: async (response) => {
        if (response.error) {
          console.error('OAuth error:', response);
          if (onError) onError(response.error_description || '授權失敗');
          return;
        }

        // 儲存 Token
        authState.accessToken = response.access_token;
        authState.tokenExpiry = Date.now() + (parseInt(response.expires_in, 10) * 1000);
        localStorage.setItem('tj_access_token', authState.accessToken);
        localStorage.setItem('tj_token_expiry', authState.tokenExpiry.toString());

        // 獲取使用者個人資料 (Email & Name)
        try {
          await fetchUserProfile();
        } catch (e) {
          console.warn('Failed to fetch profile', e);
        }

        if (onSuccess) onSuccess(authState);
      },
    });
  } catch (err) {
    console.error('Error initializing token client:', err);
    if (onError) onError(err.message || '初始化 Google 登入失敗');
  }
}

/**
 * 請求登入 / 授權
 */
export function login(onSuccess, onError) {
  if (!tokenClient) {
    initGoogleAuth(onSuccess, onError);
  }
  
  if (tokenClient) {
    // 每次點擊登入時，強迫彈出帳戶選擇視窗
    tokenClient.requestAccessToken({ prompt: 'select_account' });
  } else {
    if (onError) onError('登入元件初始化失敗，請重新整理網頁。');
  }
}

/**
 * 登出
 */
export function logout() {
  if (authState.accessToken) {
    google.accounts.oauth2.revokeToken(authState.accessToken, () => {
      console.log('Access token revoked');
    });
  }
  
  authState.accessToken = '';
  authState.tokenExpiry = 0;
  authState.userEmail = '';
  authState.userName = '';
  
  localStorage.removeItem('tj_access_token');
  localStorage.removeItem('tj_token_expiry');
  localStorage.removeItem('tj_user_email');
  localStorage.removeItem('tj_user_name');
}

/**
 * 獲取 Google 帳戶使用者資訊
 */
async function fetchUserProfile() {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${authState.accessToken}`
    }
  });
  if (res.ok) {
    const data = await res.json();
    authState.userEmail = data.email || '';
    authState.userName = data.name || '';
    localStorage.setItem('tj_user_email', authState.userEmail);
    localStorage.setItem('tj_user_name', authState.userName);
  }
}

/**
 * 更新自訂 Client ID
 */
export function updateClientId(newClientId) {
  authState.clientId = newClientId || DEFAULT_CLIENT_ID;
  localStorage.setItem('tj_client_id', authState.clientId);
  // 重置 token client 以套用新的 Client ID
  tokenClient = null;
}
