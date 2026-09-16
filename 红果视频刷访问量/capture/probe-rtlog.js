
const axios = require('axios');
const QS = {
  klink_egdi: 'AAI29o4dI-eMiO73_SRSbZ_0By1v3fUSriNeu8-L951MoXhWT88pzj5B',
  iid: '1272582850785593', device_id: '3418827795729376', ac: 'wifi', channel: 'xiaomi_8704_64',
  aid: '8704', app_name: 'kylin_read', version_code: '73332', version_name: '7.3.3.32',
  device_platform: 'android', os: 'android', ssmix: 'a', device_type: '25079RPDCC', device_brand: 'Redmi',
  language: 'zh', os_api: '36', os_version: '16', manifest_version_code: '73332',
  resolution: '1880*2963', dpi: '450', update_version_code: '73332', host_abi: 'arm64-v8a',
  dragon_device_type: 'pad', pv_player: '73332', compliance_status: '0',
  rom_version: 'release-keys', cdid: 'b4f93387-5319-4134-aab9-2cd4e9279b8f', _rticket: String(Date.now()),
};
const H = { 'User-Agent': 'okhttp/3.12.13.20', 'Accept-Encoding': 'gzip', 'Content-Type': 'application/json; charset=utf-8', 'Host': 'rtlog5-applog.fqnovel.com' };
(async () => {
  // 1. rtlog5-applog.fqnovel.com 上的 app_log
  for (const host of ['https://rtlog5-applog.fqnovel.com', 'https://mon11-misc.fqnovel.com']) {
    for (const [path, m] of [['/service/2/app_log/', 'GET'], ['/service/2/app_log/', 'POST'], ['/monitor/collect/c', 'GET'], ['/monitor/collect/c', 'POST']]) {
      try {
        const r = await axios({ method: m, url: host + path, data: { tt_data: 'a' }, params: QS, headers: { ...H, Host: host.replace('https://', '') }, timeout: 10000, validateStatus: () => true });
        let b = ''; try { b = JSON.stringify(r.data).slice(0, 150); } catch (e) { b = String(r.data).slice(0, 100); }
        console.log(m + ' ' + host + path + ' => ' + r.status + ' | ' + b);
      } catch (e) { console.log(m + ' ' + host + path + ' => ERR ' + e.message.slice(0, 70)); }
    }
  }
  // 2. 解析分享链接拿 series_id
  try {
    const sr = await axios.get('https://novelquickapp.com/s/WGPClz6sw10/', { timeout: 15000, maxRedirects: 5, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const final = sr.request.res.responseUrl || sr.config.url;
    console.log('share final:', final);
    console.log('share body head:', String(sr.data).slice(0, 300).replace(/\s+/g, ' '));
  } catch (e) { console.log('share ERR', e.message.slice(0, 100)); }
})();
