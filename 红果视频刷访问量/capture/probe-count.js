
const axios = require('axios');
function makeQS(aid) {
  const base = {
    iid: aid === '8662' ? '3788260546453235' : '1272582850785593',
    device_id: aid === '8662' ? '538083340353620' : '3418827795729376',
    ac: 'wifi', channel: aid === '8662' ? 'oppo_8662_64' : 'xiaomi_8704_64',
    aid, app_name: aid === '8662' ? 'novelread' : 'kylin_read',
    version_code: aid === '8662' ? '71532' : '73332', version_name: aid === '8662' ? '7.1.5.32' : '7.3.3.32',
    device_platform: 'android', os: 'android', ssmix: 'a', device_type: aid === '8662' ? 'SM-N9860' : '25079RPDCC',
    device_brand: aid === '8662' ? 'Samsung' : 'Redmi', language: 'zh', os_api: '28', os_version: '9',
    manifest_version_code: aid === '8662' ? '71532' : '73332', resolution: aid === '8662' ? '900*1600' : '1880*2963',
    dpi: aid === '8662' ? '320' : '450', update_version_code: aid === '8662' ? '71532' : '73332',
    host_abi: 'arm64-v8a', dragon_device_type: 'pad', pv_player: aid === '8662' ? '71532' : '73332',
    compliance_status: '0', rom_version: 'release-keys', cdid: 'b4f93387-5319-4134-aab9-2cd4e9279b8f',
    _rticket: String(Date.now()),
  };
  return base;
}
const DT = {
  detail_page_version: 0, disable_digg_stat: false,
  image_shrink_datas_str: 'W3siaW1hZ2VfdHlwZSI6MywiaW1hZ2Vfd2lkdGgiOjkwMCwic2hyaW5rX3R5cGUiOjN9LHsiaW1hZ2VfdHlwZSI6NCwiaW1hZ2Vfd2lkdGgiOjcyLCJzaHJpbmtfdHlwZSI6NH1d\n',
  need_all_video_definition: false, need_mp4_align: false, screen_width_px: '900', source: 7, use_os_player: false, use_server_dns: false,
};
const SID = '7664958856774044697';
const FQ = aid => 'https://' + (aid === '8662' ? 'api5-normal-sinfonlineb.fqnovel.com' : 'api5-normal.fqnovel.com');
async function detail(aid) {
  try {
    const r = await axios.post(FQ(aid) + '/novel/player/multi_video_detail/preload/v1', { biz_param: DT, dr_scene: 'preload', series_id: SID }, {
      params: makeQS(aid), headers: { 'User-Agent': 'okhttp/3.12.13.20', 'Accept-Encoding': 'gzip', 'Content-Type': 'application/json; charset=utf-8' }, timeout: 15000,
    });
    const s = JSON.stringify(r.data);
    // 找出数值型统计键
    const keys = new Set();
    function walk(o, path) {
      if (!o || typeof o !== 'object') return;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (typeof v === 'number' || typeof v === 'string' && /^\d{4,}$/.test(v)) {
          if (/count|play|num|total|digg|stat|view|watch/i.test(k)) keys.add(path + '.' + k + '=' + v);
        }
        if (v && typeof v === 'object') walk(v, path + '.' + k);
      }
    }
    walk(r.data, '');
    console.log('=== aid=' + aid + ' detail ok len=' + s.length + ' ===');
    [...keys].slice(0, 30).forEach(k => console.log('  ' + k));
    // video_data 顶层键
    const d = r.data.data || {};
    const sid0 = Object.keys(d)[0];
    const vd = d[sid0] && d[sid0].video_data;
    if (vd) {
      console.log('  video_data keys:', JSON.stringify(Object.keys(vd)));
      if (vd.series_detail) console.log('  series_detail:', JSON.stringify(vd.series_detail).slice(0, 500));
      const vl = vd.video_list || [];
      console.log('  eps:', vl.length, vl[0] ? JSON.stringify({ vid: vl[0].vid, t: vl[0].title }).slice(0, 120) : '');
    }
  } catch (e) { console.log('aid=' + aid + ' ERR', e.message.slice(0, 120)); }
}
(async () => { await detail('8662'); await detail('8704'); })();
