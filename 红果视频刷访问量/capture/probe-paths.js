
const axios = require('axios');
const API = 'https://api5-normal.fqnovel.com';
const QS = {
  klink_egdi: 'AAI29o4dI-eMiO73_SRSbZ_0By1v3fUSriNeu8-L951MoXhWT88pzj5B',
  iid: '1272582850785593', device_id: '3418827795729376', ac: 'wifi', channel: 'xiaomi_8704_64',
  aid: '8704', app_name: 'kylin_read', version_code: '73332', version_name: '7.3.3.32',
  device_platform: 'android', os: 'android', ssmix: 'a', device_type: '25079RPDCC', device_brand: 'Redmi',
  language: 'zh', os_api: '36', os_version: '16', manifest_version_code: '73332',
  resolution: '1880*2963', dpi: '450', update_version_code: '73332', host_abi: 'arm64-v8a',
  dragon_device_type: 'pad', pv_player: '73332', compliance_status: '0',
  rom_version: 'release-keys', cdid: 'b4f93387-5319-4134-aab9-2cd4e9279b8f',
  _rticket: String(Date.now()),
};
const HEADERS = {
  'User-Agent': 'com.phoenix.read/71532 (Linux; U; Android 9; SM-N9860; Build/PQ3A.190705.10241111;tt-ok/3.12.13.20)',
  'Host': 'api5-normal-sinfonlineb.fqnovel.com',
  'Accept-Encoding': 'gzip',
  'Content-Type': 'application/json; charset=utf-8',
};
const vid = '7645222653694856254';
const paths = [
  ['/novel/player/multi_video_model/preload/v1', 'POST', { biz_param: { detail_page_version: 0, device_level: 3, disable_digg_stat: false, need_all_video_definition: true, need_mp4_align: false, use_os_player: false, use_server_dns: false, video_platform: 1024 }, dr_scene: 'preload', mixed_video_id_map: { '1004': [vid] } }],
  ['/novel/player/multi_video_detail/preload/v1', 'POST', { biz_param: { detail_page_version: 0, disable_digg_stat: false, image_shrink_datas_str: 'W10=', need_all_video_definition: false, need_mp4_align: false, screen_width_px: '1880', source: 7, use_os_player: false, use_server_dns: false }, video_ids: [vid] }],
  ['/novel/player/play_report/v1', 'POST', {}],
  ['/novel/player/heartbeat/v1', 'POST', {}],
  ['/novel/player/play_finish/v1', 'POST', {}],
  ['/novel/player/report/v1', 'POST', {}],
  ['/novel/player/play_progress/v1', 'POST', {}],
  ['/novel/player/play_start/v1', 'POST', {}],
  ['/novel/reading/stats/report/v1', 'POST', {}],
  ['/novel/reading/play/report/v1', 'POST', {}],
  ['/stats/report/v1', 'POST', {}],
  ['/service/2/app_log/', 'GET', null],
];
(async () => {
  for (const [p, m, body] of paths) {
    try {
      const r = await axios({ method: m, url: API + p, data: body, params: QS, headers: HEADERS, timeout: 10000, validateStatus: () => true });
      let b = '';
      try { const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; b = JSON.stringify(d).slice(0, 180); } catch (e) { b = String(r.data).slice(0, 120); }
      console.log(m + ' ' + p + ' => ' + r.status + ' | ' + b);
    } catch (e) {
      console.log(m + ' ' + p + ' => ERR ' + e.message.slice(0, 60));
    }
  }
})();
