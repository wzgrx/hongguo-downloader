
const axios = require('axios');
(async () => {
  for (const u of ['https://vod-settings.bytedanceapi.com/', 'https://vod-settings.bytedanceapi.com/settings', 'https://vod-settings.bytedanceapi.com/v1/settings']) {
    try {
      const r = await axios.get(u, { timeout: 12000, headers: { 'User-Agent': 'okhttp/3.12.13.20' } });
      console.log('URL', u, '=>', r.status, (typeof r.data === 'string' ? r.data.slice(0, 400) : JSON.stringify(r.data).slice(0, 400)));
    } catch (e) { console.log('URL', u, '=> ERR', e.message, e.response ? e.response.status : ''); }
  }
})();
