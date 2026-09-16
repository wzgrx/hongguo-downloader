
const axios = require('axios');
const fp = {
  klink_egdi: String(Date.now()),
  iid: '1129609482228261',
  device_id: '7315868276056057381',
  cdid: '7c9ec5a5-4b0a-4d28-9b73-79f37bca5a75',
  aid: 8662,
  app_name: 'novelread',
  version_code: '71532',
  device_platform: 'android',
  os_version: '9',
  sdk_version: 34,
  tz_offset: 28800,
  update_version_code: '7153201',
  ac: 'wifi',
  channel: 'novelreader',
  ab_version: '71532_1.0.0_0',
  session_id: String(Date.now())
};
const qs = Object.keys(fp).map(k => k + '=' + encodeURIComponent(fp[k])).join('&');
const url = 'https://api5-normal-sinfonlineb.fqnovel.com/byte/ugc/multi_video_model/?' + qs;
(async () => {
  try {
    const r = await axios.post(url, {
      cmd: 'multi_video_model',
      item_ids: ['7645222653694856254'],
      data_type: 1,
      from: 'novelweb',
    }, {
      headers: {
        'User-Agent': 'com.phoenix.read/71532 (Linux; U; Android 9; SM-N9860; Build/PQ3A.190705.10241111;tt-ok/3.12.13.20)',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    });
    const body = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    const s = JSON.stringify(body);
    console.log('STATUS', r.status, 'len', s.length);
    // 提取所有 URL 形态字段
    const urls = s.match(/https?:\/\/[^"\\ ]+/g) || [];
    const uniq = [...new Set(urls)];
    console.log('=== URLs in response (' + uniq.length + ') ===');
    uniq.forEach(u => console.log(u.slice(0, 220)));
    // 打印关键键路径
    const item = body.data && (body.data.data || body.data);
    console.log('=== top keys ===', Object.keys(body).join(','));
    function walk(o, path) {
      if (!o || typeof o !== 'object') return;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (/report|log|track|heart|stat|view|pb|share/.test(k)) {
          const val = typeof v === 'string' ? v : JSON.stringify(v);
          console.log('KEY[' + path + '.' + k + '] =', String(val).slice(0, 300));
        }
        if (v && typeof v === 'object') walk(v, path + '.' + k);
      }
    }
    walk(body, 'root');
  } catch (e) {
    console.log('ERR', e.message, e.response ? e.response.status : '');
    if (e.response && e.response.data) console.log('BODY', JSON.stringify(e.response.data).slice(0, 600));
  }
})();
