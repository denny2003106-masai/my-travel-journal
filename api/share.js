const https = require('https');

module.exports = (req, res) => {
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

  // 後端-後端 fetch 避開 CORS 限制
  https.get(url, (driveRes) => {
    // 處理 301/302 重導向
    if (driveRes.statusCode === 302 || driveRes.statusCode === 301) {
      const redirectUrl = driveRes.headers.location;
      https.get(redirectUrl, (redirectRes) => {
        redirectRes.pipe(res);
      }).on('error', (err) => {
        res.status(500).json({ error: 'Failed to fetch redirect shared data', details: err.message });
      });
      return;
    }
    
    if (driveRes.statusCode !== 200) {
      res.status(driveRes.statusCode).json({ error: 'Google Drive returned non-200 status', code: driveRes.statusCode });
      return;
    }
    
    driveRes.pipe(res);
  }).on('error', (err) => {
    res.status(500).json({ error: 'Failed to fetch shared data', details: err.message });
  });
};
