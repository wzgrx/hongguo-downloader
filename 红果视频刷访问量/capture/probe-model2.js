
const axios = require('axios');
const API = "https://api5-normal-sinfonlineb.fqnovel.com";
const COMMON_QUERY = {
  klink_egdi: "AAI29o4dI-eMiO73_SRSbZ_0By1v3fUSriNeu8-L951MoXhWT88pzj5B",
  iid: "3788260546453235",
  device_id: "538083340353620",
  ac: "wifi",
  channel: "oppo_8662_64",
  aid: "8662",
  app_name: "novelread",
  version_code: "71532",
  version_name: "7.1.5.32",
  device_platform: "android",
  os: "android",
  ssmix: "a",
  device_type: "SM-N9860",
  device_brand: "Samsung",
  language: "zh",
  os_api: "28",
  os_version: "9",
  manifest_version_code: "71532",
  resolution: "900*1600",
  dpi: "320",
  update_version_code: "71532",
  host_abi: "arm64-v8a",
  dragon_device_type: "pad",
  pv_player: "71532",
  compliance_status: "0",
  need_personal_recommend: "1",
  player_so_load: "1",
  is_android_pad_screen: "0",
  rom_version: "PQ3A.190705.10241111+release-keys",
  cdid: "b4f93387-5319-4134-aab9-2cd4e9279b8f",
};
COMMON_QUERY._rticket = Date.now().toString();
const HEADERS = {
  "User-Agent": "com.phoenix.read/71532 (Linux; U; Android 9; SM-N9860; Build/PQ3A.190705.10241111;tt-ok/3.12.13.20)",
  "Accept-Encoding": "gzip",
  "Accept": "application/json; charset=utf-8,application/x-protobuf",
  "Content-Type": "application/json; charset=utf-8",
  "Host": "api5-normal-sinfonlineb.fqnovel.com",
};
const MODEL_BIZ_PARAM = {
  detail_page_version: 0,
  device_level: 3,
  disable_digg_stat: false,
  need_all_video_definition: true,
  need_mp4_align: false,
  use_os_player: false,
  use_server_dns: false,
  video_platform: 1024,
};
const vid = "7645222653694856254";
const body = { biz_param: MODEL_BIZ_PARAM, dr_scene: "preload", mixed_video_id_map: { "1004": [vid] } };
(async () => {
  try {
    const res = await axios.post(API + "/novel/player/multi_video_model/preload/v1", body, { params: COMMON_QUERY, headers: HEADERS, timeout: 25000 });
    const s = JSON.stringify(res.data);
    console.log('STATUS', res.status, 'len', s.length);
    const urls = s.match(/https?:\/\/[^"\\ ]+/g) || [];
    const uniq = [...new Set(urls)];
    console.log('=== URLs (' + uniq.length + ') ===');
    uniq.forEach(u => console.log(' ', u.slice(0, 260)));
    const item = res.data.data ? res.data.data[vid] || res.data.data : res.data;
    console.log('=== item keys ===', item ? Object.keys(item).join(',') : '(none)');
    function walk(o, path, depth) {
      if (!o || typeof o !== 'object' || depth > 6) return;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (/report|log|track|heart|stat|progress|play_count|view|extra|pb/.test(k)) {
          const val = typeof v === 'string' ? v : (typeof v === 'object' ? JSON.stringify(v) : String(v));
          if (val.length < 800) console.log('KEY[' + path + '.' + k + '] = ' + val);
          else console.log('KEY[' + path + '.' + k + '] = ...(' + val.length + ' chars) ' + val.slice(0, 400));
        }
        if (v && typeof v === 'object') walk(v, path + '.' + k, depth + 1);
      }
    }
    walk(res.data, 'root', 0);
    // 打印 video_model 的完整结构（一层）
    const vm = item && item.video_model;
    if (vm) { console.log('=== video_model keys ===', Object.keys(vm).join(',')); }
  } catch (e) {
    console.log('ERR', e.message, e.response ? e.response.status : '');
    if (e.response && e.response.data) console.log('BODY', JSON.stringify(e.response.data).slice(0, 800));
  }
})();
