/**
 * 验证 parseModelVideo 新逻辑：同一份 video_model 响应内，确认选中的是最高档
 * 用法: node scripts/verify-best-def.js [vid ...]
 */
const path = require('path');
const fs = require('fs');

// 加载真实模块源码并额外导出内部函数 parseModelVideo
const srcPath = path.join(__dirname, '..', 'src', 'native', 'hongguo.js');
const src = fs.readFileSync(srcPath, 'utf8');
const Module = require('module');
const m = new Module('hongguo-test');
m.paths = Module._nodeModulePaths(path.join(__dirname, '..'));
m._compile(src + '\nmodule.exports._parseModelVideo = parseModelVideo;\n', 'hongguo-test.js');
const hongguo = m.exports;

const vids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['7645222653694856254', '7645222681196907582', '7645222713215290430', '7645222723290942526', '7645222730542877758'];

function defNumber(defStr) {
  const m2 = String(defStr || '').match(/(\d+)\s*p/i);
  return m2 ? parseInt(m2[1], 10) : 0;
}

(async () => {
  let allOk = true;
  for (const vid of vids) {
    try {
      const playInfo = await hongguo.fetchPlayUrlSingle(vid);
      // fetchPlayUrlSingle 内部也走 parseModelVideo，但拿不到完整 video_model；
      // 这里再取一次原始 model，用真实 parseModelVideo 选流并与全档位对比
      const axios = require('axios');
      const API = "https://api5-normal-sinfonlineb.fqnovel.com";
      const q = {
        klink_egdi: "AAI29o4dI-eMiO73_SRSbZ_0By1v3fUSriNeu8-L951MoXhWT88pzj5B",
        iid: "3788260546453235", device_id: "538083340353620", ac: "wifi",
        channel: "oppo_8662_64", aid: "8662", app_name: "novelread",
        version_code: "71532", version_name: "7.1.5.32", device_platform: "android",
        os: "android", ssmix: "a", device_type: "SM-N9860", device_brand: "Samsung",
        language: "zh", os_api: "28", os_version: "9", manifest_version_code: "71532",
        resolution: "900*1600", dpi: "320", update_version_code: "71532", host_abi: "arm64-v8a",
        dragon_device_type: "pad", pv_player: "71532", compliance_status: "0",
        need_personal_recommend: "1", player_so_load: "1", is_android_pad_screen: "0",
        rom_version: "PQ3A.190705.10241111+release-keys", cdid: "b4f93387-5319-4134-aab9-2cd4e9279b8f",
        _rticket: Date.now().toString(),
      };
      const body = {
        biz_param: {
          detail_page_version: 0, device_level: 3, disable_digg_stat: false,
          need_all_video_definition: true, need_mp4_align: false,
          use_os_player: false, use_server_dns: false, video_platform: 1024,
        },
        dr_scene: "preload",
        mixed_video_id_map: { "1004": [vid] },
      };
      const res = await axios.post(API + '/novel/player/multi_video_model/preload/v1', body, {
        params: q,
        headers: { "User-Agent": hongguo.UA, "Accept-Encoding": "gzip", "Accept": "application/json; charset=utf-8,application/x-protobuf", "Content-Type": "application/json; charset=utf-8", "Host": "api5-normal-sinfonlineb.fqnovel.com" },
        timeout: 25000,
      });
      const item = res.data?.data?.[vid] || {};
      const [url, , codec] = hongguo._parseModelVideo(item.video_model);
      const vmj = JSON.parse(item.video_model || '{}');
      const defs = (vmj.video_list || []).map(v => ({
        def: v.video_meta?.definition,
        size: `${v.video_meta?.vwidth}x${v.video_meta?.vheight}`,
        br: v.video_meta?.bitrate,
        url: v.main_url,
      }));
      const bestDef = defs.reduce((a, b) => (defNumber(b.def) > defNumber(a.def) ? b : a));
      const ok = url === bestDef.url;
      if (!ok) allOk = false;
      console.log(`${ok ? '✅' : '❌'} vid=${vid} 档位=[${defs.map(d => d.def).join(', ')}] -> 选中 ${ok ? bestDef.def + ' ' + bestDef.size : '未知'} (codec=${codec})`);
      if (!ok) {
        console.log('  期望URL:', bestDef.url.slice(0, 100));
        console.log('  实际URL:', String(url || '').slice(0, 100));
      }
    } catch (e) {
      allOk = false;
      console.log(`❌ vid=${vid} 失败: ${e.message}`);
    }
  }
  console.log(allOk ? '\n全部选中最高清晰度 ✅' : '\n存在未选中最高档的情况 ❌');
  process.exit(allOk ? 0 : 1);
})();
