/**
 * device-fp.js - 设备指纹池
 * 结构与下载器 src/native/hongguo.js 的 COMMON_QUERY 对齐，
 * 随机化 iid / device_id / cdid / _rticket，其余平台参数保持真实 App 特征。
 */
const crypto = require('crypto');

// 真机特征组合（机型/设备/ROM 一套，避免字段矛盾触发风控）
const MODEL_PROFILES = [
  { device_type: 'SM-N9860', device_brand: 'Samsung', rom_version: 'PQ3A.190705.10241111+release-keys', device_platform: 'android', os_version: '9', os_api: '28', resolution: '900*1600', dpi: '320' },
  { device_type: 'M2102J2SC', device_brand: 'Xiaomi', rom_version: 'RP1A.200720.011+release-keys', device_platform: 'android', os_version: '11', os_api: '30', resolution: '1080*2400', dpi: '440' },
  { device_type: 'PJA110', device_brand: 'HONOR', rom_version: 'HUAWEI.PJA.110+release-keys', device_platform: 'android', os_version: '12', os_api: '31', resolution: '1200*2400', dpi: '480' },
  { device_type: 'XiaomiPad7', device_brand: 'Xiaomi', rom_version: 'UKQ1.231003.002+release-keys', device_platform: 'android', os_version: '15', os_api: '35', resolution: '1480*3200', dpi: '320' },
];

function pad(n, len) {
  return String(n).padStart(len, '0');
}

function genIid() {
  return pad(Math.floor(Math.random() * 9e14) + 1e14, 16);
}

function genDeviceId() {
  const len = 15 + Math.floor(Math.random() * 3);
  return pad(Math.floor(Math.random() * Math.pow(10, len - 1)) + 1, len);
}

function genCdid() {
  return crypto.randomUUID();
}

function genInstallId() {
  return crypto.randomBytes(8).toString('hex');
}

function genSession() {
  return crypto.randomBytes(9).toString('base64url');
}

/**
 * 生成一组完整客户端参数（对标 COMMON_QUERY + 上报需要的动态字段）
 * @param {number} idx 指纹池索引（决定绑定哪套机型特征）
 */
function makeFingerprint(idx = 0) {
  const prof = MODEL_PROFILES[idx % MODEL_PROFILES.length];
  const iid = genIid();
  const deviceId = genDeviceId();
  const cdid = genCdid();
  return {
    ...prof,
    klink_egdi: 'AAI29o4dI-eMiO73_SRSbZ_0By1v3fUSriNeu8-L951MoXhWT88pzj5B',
    iid,
    device_id: deviceId,
    install_id: genInstallId(),
    cdid,
    session: genSession(),
    ac: 'wifi',
    channel: 'oppo_8662_64',
    aid: '8662',
    app_name: 'novelread',
    version_code: '71532',
    version_name: '7.1.5.32',
    ssmix: 'a',
    language: 'zh',
    manifest_version_code: '71532',
    update_version_code: '71532',
    host_abi: 'arm64-v8a',
    dragon_device_type: 'pad',
    pv_player: '71532',
    compliance_status: '0',
    need_personal_recommend: '1',
    player_so_load: '1',
    is_android_pad_screen: '0',
  };
}

/** 生成指纹池 */
function makeFingerprintPool(count = 8) {
  const pool = [];
  for (let i = 0; i < count; i++) pool.push(makeFingerprint(i));
  return pool;
}

/** 把指纹渲染成查询串（不含 _rticket，调用时可传） */
function toQueryString(fp, extra = {}) {
  const q = { ...fp, ...extra, _rticket: String(Date.now()) };
  return Object.entries(q).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
}

module.exports = {
  makeFingerprint,
  makeFingerprintPool,
  toQueryString,
  genIid,
  genDeviceId,
  genCdid,
  MODEL_PROFILES,
};
