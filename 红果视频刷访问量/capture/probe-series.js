
const axios = require('axios');
(async () => {
  // 1. 拿分享页原始 HTML → series_id
  try {
    const sr = await axios.get('https://novelquickapp.com/s/WGPClz6sw10/', { timeout: 20000, maxRedirects: 8, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 9; SM-N9860) AppleWebKit/537.36', 'Accept': 'text/html,application/xhtml+xml' }, responseType: 'text' });
    const txt = typeof sr.data === 'string' ? sr.data : JSON.stringify(sr.data);
    console.log('final url:', sr.request.res.responseUrl || sr.config.url);
    console.log('len:', txt.length);
    const m = txt.match(/video_series_id[=:"]+\s*(\d+)/);
    if (m) console.log('SERIES_ID:', m[1]);
    else {
      const m2 = txt.match(/series[_-]?id[=:"]+(\d+)/i);
      console.log('SERIES_ID alt:', m2 ? m2[1] : 'NOT FOUND');
      console.log('html head:', txt.slice(0, 400).replace(/\s+/g, ' '));
    }
  } catch (e) { console.log('share ERR', e.message.slice(0, 120)); }
})();
