
const axios = require('axios');
const q = { iid: '1272582850785593', device_id: '3418827795729376', ac: 'wifi', channel: 'xiaomi_8704_64',
  aid: '8704', app_name: 'kylin_read', version_code: '73332', version_name: '7.3.3.32',
  device_platform: 'android', os: 'android', ssmix: 'a', device_type: '25079RPDCC', device_brand: 'Redmi',
  language: 'zh', os_api: '36', os_version: '16', manifest_version_code: '73332', resolution: '1880*2963',
  dpi: '450', update_version_code: '73332', host_abi: 'arm64-v8a', dragon_device_type: 'pad', pv_player: '73332',
  compliance_status: '0', rom_version: 'release-keys', cdid: 'b4f93387-5319-4134-aab9-2cd4e9279b8f' };
const H = { 'User-Agent': 'okhttp/3.12.13.20', 'Accept-Encoding': 'gzip', 'Content-Type': 'application/json; charset=utf-8' };
const SID = '7664958856774044697';
const VID = '7664960983332310041';
const bodies = [
  { book_id: SID, vid: VID, duration: 100, progress: 30, source: 8, need_save: 1 },
  { book_id: SID, group_id: SID, vid: VID, position: 30, duration: 100, scene: 1 },
  { bookId: SID, vid: VID, read_percent: 0.3, read_position: 3000, duration: 10000 },
  { book_id: SID, chapter_id: VID, read_progress: 30, progress: 30000 },
  { book_id: SID, video_id: VID, play_seconds: 30, play_duration: 100 },
  { book_id: SID, item_id: VID, progress_ms: 30000, duration_ms: 100000 },
];
(async () => {
  for (const body of bodies) {
    for (const [host, path] of [['https://reading.snssdk.com', '/reading/bookapi/read_progress/upload/v'], ['https://reading.snssdk.com', '/reading/bookapi/read_history/update/v']]) {
      try {
        const r = await axios.post(host + path, body, { params: { ...q, _rticket: String(Date.now()) }, headers: H, timeout: 10000, validateStatus: () => true });
        console.log(path + ' ' + JSON.stringify(body).slice(0, 80) + ' => ' + r.status + ' ' + JSON.stringify(r.data).slice(0, 140));
      } catch (e) { console.log(path + ' ERR ' + e.message.slice(0, 60)); }
    }
  }
})();
