
const axios = require('axios');
function makeQS(aid) {
  return {
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
}
const DT = { detail_page_version: 0, disable_digg_stat: false,
  image_shrink_datas_str: 'W3siaW1hZ2VfdHlwZSI6MywiaW1hZ2Vfd2lkdGgiOjkwMCwic2hyaW5rX3R5cGUiOjN9LHsiaW1hZ2VfdHlwZSI6NCwiaW1hZ2Vfd2lkdGgiOjcyLCJzaHJpbmtfdHlwZSI6NH1d\n',
  need_all_video_definition: false, need_mp4_align: false, screen_width_px: '900', source: 7, use_os_player: false, use_server_dns: false };
const SID = '7664958856774044697';
const VID = '7664960983332310041';
const q = makeQS('8662');
const H = { 'User-Agent': 'okhttp/3.12.13.20', 'Accept-Encoding': 'gzip', 'Content-Type': 'application/json; charset=utf-8' };
async function cnt(label) {
  const r = await axios.post('https://api5-normal-sinfonlineb.fqnovel.com/novel/player/multi_video_detail/preload/v1',
    { biz_param: DT, dr_scene: 'preload', series_id: SID }, { params: { ...q, _rticket: String(Date.now()) }, headers: H, timeout: 15000 });
  console.log(label, 'play_cnt =', r.data.data[SID].video_data.series_play_cnt);
  return r.data.data[SID].video_data.series_play_cnt;
}
(async () => {
  const b0 = await cnt('BEFORE');
  // T1: model preload 连打 30 次
  const MQ = { ...makeQS('8662'), _rticket: String(Date.now()) };
  const MB = { biz_param: { detail_page_version: 0, device_level: 3, disable_digg_stat: false, need_all_video_definition: true, need_mp4_align: false, use_os_player: false, use_server_dns: false, video_platform: 1024 },
    dr_scene: 'preload', mixed_video_id_map: { '1004': [VID] } };
  let ok = 0;
  for (let i = 0; i < 30; i++) {
    try {
      const r = await axios.post('https://api5-normal-sinfonlineb.fqnovel.com/novel/player/multi_video_model/preload/v1', MB, { params: { ...MQ, _rticket: String(Date.now() + i) }, headers: H, timeout: 10000 });
      if (r.data && r.data.code === 0) ok++;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 120));
  }
  console.log('model preload ok:', ok, '/30');
  await new Promise(r => setTimeout(r, 12000));
  const a1 = await cnt('AFTER40s');
  console.log('DELTA =', a1 - b0);
})();
