
const axios = require('axios');
(async () => {
  const q = 'version_code=73332&device_platform=android&device_id=3418827795729376&aid=8704&iid=1272582850785593&app_name=kylin_read&ac=wifi&os=android&ssmix=a&device_type=25079RPDCC&channel=xiaomi_8704_64&version_name=7.3.3.32';
  for (const u of ['https://log.snssdk.com/service/2/app_log/?' + q, 'https://is.snssdk.com/service/settings/v3/?caller_name=lnx&os_type=android&aid=8704&app_version=73332&device_id=3418827795729376']) {
    try {
      const r = await axios.get(u, { timeout: 12000, headers: { 'User-Agent': 'okhttp/3.12.13.20', 'Accept-Encoding': 'gzip' } });
      const b = typeof r.data === 'string' ? r.data.slice(0, 260) : JSON.stringify(r.data).slice(0, 260);
      console.log('GET', u.slice(0, 110), '=>', r.status, b);
    } catch (e) { console.log('GET', u.slice(0, 110), '=> ERR', e.message, e.response ? e.response.status : ''); }
  }
})();
