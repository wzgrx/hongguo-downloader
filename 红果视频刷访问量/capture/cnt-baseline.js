
const axios = require('axios');
const q = { iid: '1272582850785593', device_id: '3418827795729376', ac: 'wifi', channel: 'xiaomi_8704_64',
  aid: '8704', app_name: 'kylin_read', version_code: '73332', version_name: '7.3.3.32',
  device_platform: 'android', os: 'android', ssmix: 'a', device_type: '25079RPDCC', device_brand: 'Redmi',
  language: 'zh', os_api: '36', os_version: '16', manifest_version_code: '73332', resolution: '1880*2963',
  dpi: '450', update_version_code: '73332', host_abi: 'arm64-v8a', dragon_device_type: 'pad', pv_player: '73332',
  compliance_status: '0', rom_version: 'release-keys', cdid: 'b4f93387-5319-4134-aab9-2cd4e9279b8f' };
const DT = { detail_page_version: 0, disable_digg_stat: false,
  image_shrink_datas_str: 'W3siaW1hZ2VfdHlwZSI6MywiaW1hZ2Vfd2lkdGgiOjkwMCwic2hyaW5rX3R5cGUiOjN9LHsiaW1hZ2VfdHlwZSI6NCwiaW1hZ2Vfd2lkdGgiOjcyLCJzaHJpbmtfdHlwZSI6NH1d\n',
  need_all_video_definition: false, need_mp4_align: false, screen_width_px: '1880', source: 7, use_os_player: false, use_server_dns: false };
const ids = ['7676063019855514649', '7677804799802215449', '7675424396831378456', '7588198183751126041'];
const H = { 'User-Agent': 'okhttp/3.12.13.20', 'Accept-Encoding': 'gzip', 'Content-Type': 'application/json; charset=utf-8' };
(async () => {
  for (const sid of ids) {
    try {
      const r = await axios.post('https://reading.snssdk.com/novel/player/multi_video_detail/preload/v1',
        { biz_param: DT, dr_scene: 'preload', series_id: sid },
        { params: { ...q, _rticket: String(Date.now()) }, headers: H, timeout: 15000 });
      const d = r.data.data || {};
      const k = Object.keys(d)[0];
      const vd = d[k] && d[k].video_data;
      if (vd) console.log('BASE|' + sid + '|' + vd.series_play_cnt + '|' + (vd.series_title || '').slice(0, 20));
      else console.log('BASE|' + sid + '|NO_DATA');
    } catch (e) { console.log('BASE|' + sid + '|ERR ' + e.message.slice(0, 60)); }
  }
})();
