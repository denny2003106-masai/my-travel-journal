export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) {
    res.status(400).json({ error: 'Missing file id' });
    return;
  }

  // Google Drive 公開檔案下載直連網址
  const url = `https://docs.google.com/uc?export=download&id=${id}`;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const driveRes = await fetch(url);
    const contentType = driveRes.headers.get('content-type') || '';

    if (!driveRes.ok) {
      const text = await driveRes.text();
      res.status(driveRes.status).json({ 
        error: 'Google Drive returned error status', 
        code: driveRes.status,
        details: text.substring(0, 300)
      });
      return;
    }

    if (contentType.includes('text/html')) {
      const htmlText = await driveRes.text();
      
      // 處理 Google Drive 病毒掃描警告頁面 (包含 confirm= 連結)
      if (htmlText.includes('confirm=')) {
        const match = htmlText.match(/confirm=([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          const confirmToken = match[1];
          const confirmUrl = `https://docs.google.com/uc?export=download&confirm=${confirmToken}&id=${id}`;
          const confirmRes = await fetch(confirmUrl);
          if (confirmRes.ok) {
            const data = await confirmRes.json();
            res.status(200).json(data);
            return;
          }
        }
      }
      
      res.status(403).json({ 
        error: '檔案未公開或需要登入 (接收到 HTML 頁面而非 JSON 數據)',
        details: htmlText.substring(0, 150).replace(/<[^>]*>/g, '').trim()
      });
      return;
    }

    const data = await driveRes.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: '無伺服器端點內部錯誤', details: err.message });
  }
}
