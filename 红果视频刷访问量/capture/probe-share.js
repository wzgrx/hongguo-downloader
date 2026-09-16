
const axios = require('axios');
const fs = require('fs');
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
const DT = {
  detail_page_version: 0, disable_digg_stat: false,
  image_shrink_datas_str: 'W3siaW1hZ2VfdHlwZSI6MywiaW1hZ2Vfd2lkdGgiOjkwMCwic2hyaW5rX3R5cGUiOjN9LHsiaW1hZ2VfdHlwZSI6NCwiaW1hZ2Vfd2lkdGgiOjcyLCJzaHJpbmtfdHlwZSI6NH1d\n',
  need_all_video_definition: false, need_mp4_align: false, screen_width_px: '900', source: 7, use_os_player: false, use_server_dns: false,
};
const SID = '7664958856774044697';
(async () => {
  const r = await axios.post('https://api5-normal-sinfonlineb.fqnovel.com/novel/player/multi_video_detail/preload/v1',
    { biz_param: DT, dr_scene: 'preload', series_id: SID },
    { params: makeQS('8662'), headers: { 'User-Agent': 'okhttp/3.12.13.20', 'Accept-Encoding': 'gzip', 'Content-Type': 'application/json; charset=utf-8' }, timeout: 20000 });
  fs.writeFileSync('capture/detail_resp.json', JSON.stringify(r.data));
  const vd = r.data.data[SID].video_data;
  console.log('play_cnt:', vd.series_play_cnt, 'create_time:', vd.create_time, 'episode_cnt:', vd.episode_cnt);
  console.log('share_info:', JSON.stringify(vd.share_info));
  console.log('record_info:', JSON.stringify(vd.record_info).slice(0, 300));
  console.log('pay_info:', JSON.stringify(vd.pay_info).slice(0, 300));
  console.log('duration:', vd.duration);
  const e0 = vd.video_list[0];
  console.log('ep0 keys:', Object.keys(e0).filter(k => /vid|index|title|url|play|stat/.test(k)));
})();
