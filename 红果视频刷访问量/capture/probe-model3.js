
const axios = require('axios');
const fs = require('fs');
const API = "https://api5-normal-sinfonlineb.fqnovel.com";
const COMMON_QUERY = {
  klink_egdi: "AAI29o4dI-eMiO73_SRSbZ_0By1v3fUSriNeu8-L951MoXhWT88pzj5B",
  iid: "3788260546453235", device_id: "538083340353620", ac: "wifi", channel: "oppo_8662_64",
  aid: "8662", app_name: "novelread", version_code: "71532", version_name: "7.1.5.32",
  device_platform: "android", os: "android", ssmix: "a", device_type: "SM-N9860", device_brand: "Samsung",
  language: "zh", os_api: "28", os_version: "9", manifest_version_code: "71532", resolution: "900*1600",
  dpi: "320", update_version_code: "71532", host_abi: "arm64-v8a", dragon_device_type: "pad",
  pv_player: "71532", compliance_status: "0", need_personal_recommend: "1", player_so_load: "1",
  is_android_pad_screen: "0", rom_version: "PQ3A.190705.10241111+release-keys",
  cdid: "b4f93387-5319-4134-aab9-2cd4e9279b8f",
};
COMMON_QUERY._rticket = Date.now().toString();
const HEADERS = {
  "User-Agent": "com.phoenix.read/71532 (Linux; U; Android 9; SM-N9860; Build/PQ3A.190705.10241111;tt-ok/3.12.13.20)",
  "Accept-Encoding": "gzip", "Accept": "application/json; charset=utf-8,application/x-protobuf",
  "Content-Type": "application/json; charset=utf-8", "Host": "api5-normal-sinfonlineb.fqnovel.com",
};
const MODEL_BIZ_PARAM = { detail_page_version: 0, device_level: 3, disable_digg_stat: false,
  need_all_video_definition: true, need_mp4_align: false, use_os_player: false, use_server_dns: false, video_platform: 1024 };
const vid = "7645222653694856254";
const body = { biz_param: MODEL_BIZ_PARAM, dr_scene: "preload", mixed_video_id_map: { "1004": [vid] } };
(async () => {
  try {
    const res = await axios.post(API + "/novel/player/multi_video_model/preload/v1", body, { params: COMMON_QUERY, headers: HEADERS, timeout: 25000 });
    const s = JSON.stringify(res.data);
    fs.writeFileSync('capture/model_resp.json', s);
    console.log('STATUS', res.status, 'saved len', s.length);
    // 找到所有 URL
    const urls = s.match(/https?:\/\/[^"\\ ]+/g) || [];
    const uniq = [...new Set(urls)];
    console.log('URL count', uniq.length);
    uniq.forEach(u => console.log('U|' + u.slice(0, 300)));
    // 找到所有含 report/stat/heart 的 KEY（数组>50 跳过）
    function walk(o, path, depth) {
      if (!o || typeof o !== 'object' || depth > 7) return;
      if (Array.isArray(o)) { if (o.length > 50) return; }
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (typeof v === 'object' && v !== null && (!Array.isArray(v) || v.length <= 50) && (!Array.isArray(v) || typeof v[0] !== 'number')) {
          if (/report|heart|stat|track|view|progress|log|pb|extra/.test(k)) {
            const val = JSON.stringify(v);
            if (val.length <= 500) console.log('K|' + path + '.' + k + '|' + val);
          }
          if (v && typeof v === 'object') walk(v, path + '.' + k, depth + 1);
        }
      }
    }
    walk(res.data, 'root', 0);
    // 顶层结构摘要
    const top = res.data.data || {};
    const item = top[vid] || {};
    console.log('ITEM KEYS|' + Object.keys(item).join(','));
    const vm = item.video_model || {};
    console.log('VM KEYS|' + Object.keys(vm).join(','));
    const md = vm.main_data || {};
    console.log('MD KEYS|' + Object.keys(md).join(','));
  } catch (e) {
    console.log('ERR', e.message, e.response ? e.response.status : '');
    if (e.response && e.response.data) console.log('BODY|' + JSON.stringify(e.response.data).slice(0, 900));
  }
})();
