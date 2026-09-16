/**
 * protocol-bot.js - 纯协议刷量主程序（不依赖平板/平台，PC 直接发请求）
 *
 * 每条"播放会话" = per 指纹 × per 视频：
 *   1) 向播放直链接口发起带本指纹的请求（CDN/业务层真实播放请求记录）
 *   2) Range 拉流头 N 字节（模拟真客户端拉取视频数据）
 *   3) 向候选/指定上报端点发送 开始→心跳→完成 事件序列（默认 --mode pull 只拉流；
 *      确认真实上报端点后用 --endpoint <URL> --mode report 或 --mode both）
 *
 * 用法：
 *   node src/protocol-bot.js --series <链接或series_id> --dry          # 干跑：解析+打印计划，不发
 *   node src/protocol-bot.js --series <链接> --fps 8 --rate 20        # 8 指纹 × 全视频集
 *   node src/protocol-bot.js --probe                                   # 探测候选端点，找出真上报接口
 *   node src/protocol-bot.js --series <链接> --endpoint <URL> --send  # 指定已确认端点正式刷
 *
 * 说明：单指纹单视频 24h 去重窗口内只计一次 → 日产量 ≈ 指纹数 × 视频数。
 *       出口 IP 有限时务必挂代理池 --proxy host:port,host2:port2。
 */
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { makeFingerprintPool, makeFingerprint } = require('./device-fp');

const ROOT = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const CANDIDATES_FILE = path.join(ROOT, 'candidates', 'endpoints.json');

// 只读复用下载器模块（解析剧集/直链），不修改它
let hongguo = null;
try {
  hongguo = require(path.join(ROOT, '..', 'src', 'native', 'hongguo.js'));
} catch (e) {
  console.warn('[!] 未加载到下载器 hongguo 模块(仅影响剧集解析/直链获取):', e.message);
}

const API_HOST = 'https://api5-normal-sinfonlineb.fqnovel.com';
const MODEL_BODY = {
  biz_param: {
    detail_page_version: 0,
    device_level: 3,
    disable_digg_stat: false,
    need_all_video_definition: true,
    need_mp4_align: false,
    use_os_player: false,
    use_server_dns: false,
    video_platform: 1024,
  },
  dr_scene: 'preload',
  mixed_video_id_map: { '1004': [] },
};

function parseArgs(argv) {
  const a = {
    series: [], vids: [], fps: cfg.replay.fingerprintCount,
    rate: cfg.replay.itemsPerMinute, proxies: cfg.replay.proxyList || [],
    dry: cfg.replay.dryRun, endpoint: '', mode: 'pull', probe: false,
    pullBytes: 131072, maxEpisodes: 0,
    applog: path.join(ROOT, 'capture', 'app_log_batch.bin'),
    progressParams: path.join(ROOT, 'src', 'report-params.json'),
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--series') a.series.push(argv[++i]);
    else if (v === '--vids') a.vids = a.vids.concat(String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean));
    else if (v === '--fps') a.fps = parseInt(argv[++i], 10);
    else if (v === '--rate') a.rate = parseInt(argv[++i], 10);
    else if (v === '--proxy') a.proxies.push(argv[++i]);
    else if (v === '--endpoint') a.endpoint = argv[++i];
    else if (v === '--mode') a.mode = argv[++i];
    else if (v === '--max-episodes') a.maxEpisodes = parseInt(argv[++i], 10);
    else if (v === '--pull-bytes') a.pullBytes = parseInt(argv[++i], 10);
    else if (v === '--probe') a.probe = true;
    else if (v === '--dry') a.dry = true;
    else if (v === '--send') a.dry = false;
    else if (v === '--applog') a.applog = argv[++i];
    else if (v === '--progress-params') a.progressParams = argv[++i];
  }
  return a;
}

function loadCandidates() {
  try {
    return JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8')).candidates || [];
  } catch (e) {
    return [];
  }
}

function uaFor(fp) {
  const osVer = {'9':'Android 9','11':'Android 11','12':'Android 12','15':'Android 15'}[String(fp.os_version)] || ('Android ' + fp.os_version);
  const buildTag = fp.rom_version.split('+')[0];
  return 'com.phoenix.read/71532 (Linux; U; ' + osVer + '; ' + fp.device_type + '; Build/' + buildTag + ';tt-ok/3.12.13.20)';
}

function qsFor(fp) {
  const q = Object.assign({}, fp, { _rticket: String(Date.now()) });
  return Object.entries(q).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
}

function parseProxy(s) {
  const m = String(s).match(/^(?:http:\/\/)?(?:([^:@]+):([^@]+)@)?([^:]+):(\d+)$/);
  if (!m) return null;
  return { host: m[3], port: parseInt(m[4], 10), auth: m[1] && m[2] ? { username: m[1], password: m[2] } : undefined };
}

function pickProxy(proxies, idx) {
  if (!proxies || proxies.length === 0) return false;
  return parseProxy(proxies[idx % proxies.length]) || false;
}

function fill(text, ctx) {
  return String(text).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (m, k) => (k in ctx ? ctx[k] : m));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(min, max) { return min + Math.random() * (max - min); }
function JITTER() { return 700 + Math.random() * 600; }

/* ---------- 1. 解析剧集列表 ---------- */
async function resolveVids(args) {
  const vids = [];
  if (!hongguo) return vids;
  for (const inp of args.series) {
    try {
      const sid = await hongguo.resolveSeriesId(inp);
      const data = await hongguo.fetchEpisodeList(sid);
      const eps = args.maxEpisodes > 0 ? data.episodes.slice(0, args.maxEpisodes) : data.episodes;
      console.log('[解析] 《' + data.series_title + '》 series_id=' + sid + ' 共' + data.total + '集, 取' + eps.length + '集');
      for (const ep of eps) vids.push(String(ep.vid));
    } catch (e) {
      console.log('[解析失败] ' + inp + ' -> ' + e.message);
    }
  }
  return vids;
}

/* ---------- 2. 带指纹的播放直链请求（CDN/业务层播放记录） ---------- */
async function modelRequest(vid, fp, proxy) {
  const body = JSON.parse(JSON.stringify(MODEL_BODY));
  body.mixed_video_id_map['1004'] = [vid];
  const url = API_HOST + '/novel/player/multi_video_model/preload/v1?' + qsFor(fp);
  const res = await axios.post(url, body, {
    headers: { 'User-Agent': uaFor(fp), 'Host': 'api5-normal-sinfonlineb.fqnovel.com', 'Content-Type': 'application/json; charset=utf-8' },
    timeout: 20000, proxy,
  });
  let mainUrl = '';
  try {
    const item = (res.data || {}).data ? res.data.data[vid] : null;
    const vm = item ? item.video_model : '';
    if (vm) {
      const vmj = JSON.parse(vm);
      const lst = (vmj.video_list || []).filter(v => v.main_url);
      if (lst.length) mainUrl = lst[0].main_url;
    }
  } catch (e) { /* 解析失败也没关系，请求本身已产生记录 */ }
  return { status: res.status, mainUrl };
}

/* ---------- 3. Range 拉流头（模拟拉取视频数据） ---------- */
async function rangePull(url, fp, proxy, bytes) {
  if (!url) return { ok: false, reason: 'no-url' };
  const res = await axios({
    method: 'GET', url, responseType: 'stream', timeout: 20000, proxy,
    headers: { 'User-Agent': uaFor(fp), 'Range': 'bytes=0-' + (bytes - 1) },
  });
  return new Promise((resolve) => {
    let got = 0;
    res.data.on('data', (c) => {
      got += c.length;
      if (got >= bytes) { try { res.data.destroy(); } catch (e) {} }
    });
    res.data.on('end', () => resolve({ ok: true, got }));
    res.data.on('error', (e) => resolve({ ok: false, reason: String(e).slice(0, 80) }));
  });
}

/* ---------- 4. 上报事件（开始/心跳/完成） ---------- */
async function reportEvent(ep, vid, fp, proxy, stage, ctx) {
  const c = Object.assign({}, ctx, { stage });
  const url = fill(ep.url, c);
  const headers = {};
  for (const k of Object.keys(ep.headers || {})) headers[k] = fill(ep.headers[k], c);
  let body = ep.body;
  if (body && typeof body === 'object') body = JSON.parse(fill(JSON.stringify(body), c));
  const res = await axios({
    method: (ep.method || 'POST'), url, headers, timeout: 15000, proxy,
    data: ep.method !== 'GET' && body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined,
  });
  return res.status;
}

async function buildContext(vid, fp, playSeconds) {
  return {
    vid,
    device_id: fp.device_id,
    iid: fp.iid,
    cdid: fp.cdid,
    session: fp.session,
    install_id: fp.install_id,
    ts: String(Date.now()),
    rticket: String(Date.now()),
    play_seconds: String(playSeconds),
    play_progress: String(playSeconds),
    scene: 'detail',
  };
}

/* ---------- 4b. app_log 埋点泵（2026-09-06 实测 200 接受） ----------
 * app 侧：gzip 压缩 protobuf 批次(TypedByteArray 24-32KB, log-encode-type: gzip)
 * 本机：优先重放 capture/app_log_batch.bin（真批次，抓包后填入），
 *       否则发送结构占位 JSON（服务端返回 200 但不计播放，仅验证链路）。
 * 计数只认真批次 → 抓到真实批次后把路径指给 --applog。
 */
const APPLOG_HOSTS = [
  'https://log.snssdk.com/service/2/app_log/',
  'https://rtlog5-applog.fqnovel.com/service/2/app_log/',
  'https://mon11-misc.fqnovel.com/service/2/app_log/',
];
async function reportAppLog(vid, fp, proxy, ctx, args) {
  const q = qsFor(fp) + '&tt_data=a&vid=' + vid;
  const ticket = String(Date.now());
  let bodyBuf = null;
  if (fs.existsSync(args.applog)) {
    bodyBuf = fs.readFileSync(args.applog);
  }
  const results = [];
  for (const host of APPLOG_HOSTS) {
    try {
      const res = await axios({
        method: 'POST', url: host + '?' + q,
        headers: {
          'log-encode-type': bodyBuf ? 'gzip' : 'identity',
          'X-SS-REQ-TICKET': ticket,
          'Content-Type': bodyBuf ? 'application/x-www-form-urlencoded' : 'application/json',
          'User-Agent': uaFor(fp),
        },
        data: bodyBuf || JSON.stringify({ tt_data: 'a', event: 'play', vid, device_id: fp.device_id, ts: ctx.ts }),
        timeout: 15000, proxy: proxy || false,
      });
      results.push(host.replace('https://', '').split('/')[0] + ':' + res.status);
    } catch (e) {
      results.push(host.replace('https://', '').split('/')[0] + ':ERR');
    }
  }
  return results.join(' ');
}

/* ---------- 4c. read_progress/read_history 进度上报 ----------
 * 端点存在（100103 PARAM_INVALID=参数不对）。真实参数待平板播放抓取：
 * 抓到的 Request.tags(Invocation 参数) 填入 src/report-params.json 后本函数自动生效。
 */
async function reportProgress(vid, fp, proxy, ctx, args, seriesId) {
  let params = {};
  if (fs.existsSync(args.progressParams)) {
    try { params = JSON.parse(fs.readFileSync(args.progressParams, 'utf8')); } catch (e) { console.log('[!] report-params.json 解析失败: ' + e.message); }
  }
  const body = Object.assign({
    book_id: seriesId || '',
    vid,
    duration: 100,
    progress: ctx.play_seconds,
    source: 8,
  }, params);
  const trips = [
    ['https://reading.snssdk.com/reading/bookapi/read_progress/upload/v', body],
    ['https://reading.snssdk.com/reading/bookapi/read_history/update/v', Object.assign({}, body, { book_id: seriesId || '' })],
  ];
  const results = [];
  for (const [url, bd] of trips) {
    try {
      const res = await axios.post(url + '?' + qsFor(fp), bd, {
        headers: { 'User-Agent': uaFor(fp), 'Content-Type': 'application/json; charset=utf-8' },
        timeout: 15000, proxy: proxy || false, validateStatus: () => true,
      });
      let msg = '';
      try { msg = JSON.stringify(res.data).slice(0, 80); } catch (e) { msg = String(res.data).slice(0, 60); }
      results.push(url.split('/').slice(-2).join('/') + '->' + res.status + ' ' + msg);
    } catch (e) {
      results.push(url.split('/').slice(-2).join('/') + '->ERR ' + e.message.slice(0, 40));
    }
  }
  return results.join(' | ');
}

function makeRateLimiter(perMinute) {
  const interval = Math.max(60000 / Math.max(perMinute, 1), 1200);
  return { wait: () => sleep(interval * (0.7 + Math.random() * 0.6)) };
}

/* ---------- main ---------- */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const candidates = loadCandidates();

  if (args.probe) {
    console.log('[probe] 逐个探测候选上报端点（固定一个探测指纹）...');
    const fp = makeFingerprint(0);
    const proxy = pickProxy(args.proxies, 0);
    for (const ep of candidates) {
      const ctx = await buildContext('7645222653694856254', fp, 60);
      const c = Object.assign({}, ctx, { stage: 'start' });
      const url = fill(ep.url, c);
      try {
        const t0 = Date.now();
        const res = await axios({
          method: ep.method, url,
          headers: Object.assign({ 'User-Agent': uaFor(fp) }, Object.fromEntries(Object.entries(ep.headers || {}).map(([k, v]) => [k, fill(v, c)]))),
          data: ep.method !== 'GET' && ep.body ? JSON.stringify(JSON.parse(fill(JSON.stringify(ep.body), c))) : undefined,
          timeout: 15000, proxy: proxy || false,
        });
        const bodyStr = String(res.data || '').slice(0, 120).replace(/\n/g, ' ');
        const elapsed = Date.now() - t0;
        console.log('[' + res.status + '] ' + (ep.name || '?') + ' ' + elapsed + 'ms ' + url.replace(/\?.*/, '?…'));
        console.log('      body: ' + bodyStr);
      } catch (e) {
        console.log('[ERR] ' + (ep.name || '?') + ' -> ' + e.message.slice(0, 100));
      }
    }
    console.log('');
    console.log('探测完成：去 App 播放页观察目标视频播放量变化，能引起变化的候选即为真上报端点，然后用 --endpoint 指定它正式刷。');
    process.exit(0);
  }

  // 收集 vids
  let vids = args.vids.slice();
  if (vids.length === 0 && args.series.length > 0) vids = await resolveVids(args);
  if (vids.length === 0) {
    console.error('[!] 没有视频可刷：请用 --series <链接或ID> 或 --vids a,b,c');
    process.exit(1);
  }

  const fps = makeFingerprintPool(Math.max(args.fps, 1));
  const limiter = makeRateLimiter(args.rate);
  const epList = args.endpoint
    ? [{ name: 'user-defined', method: 'POST', url: args.endpoint, headers: {}, body: null }]
    : candidates;

  console.log('[计划] 视频=' + vids.length + ' × 指纹=' + fps.length + ' = ' + (vids.length * fps.length) + ' 会话');
  console.log('[计划] ' + (args.dry ? 'DRY 干跑（不发）' : 'LIVE 正式发送') + ' · 模式=' + args.mode + ' · 速率=' + args.rate + '/min · 代理=' + (args.proxies.length || '直连(PC出口IP)'));
  console.log('');

  let ok = 0, fail = 0, pullCnt = 0;

  for (let vi = 0; vi < vids.length; vi++) {
    const vid = vids[vi];
    for (let fi = 0; fi < fps.length; fi++) {
      const fp = fps[fi];
      const proxy = pickProxy(args.proxies, vi * 37 + fi);
      const playSeconds = Math.round(45 + Math.random() * 75);
      const tag = 'vid=' + vid + ' fp#' + fi + '(device_id=' + fp.device_id + ')';
      const ctx = await buildContext(vid, fp, playSeconds);

      // A. 播放直链请求（业务层播放记录）
      if (args.mode === 'both' || args.mode === 'pull') {
        if (args.dry) {
          console.log('[DRY-A] ' + tag + ' -> ' + API_HOST + '/novel/player/multi_video_model/preload/v1');
          pullCnt++;
        } else {
          try {
            const mi = await modelRequest(vid, fp, proxy);
            if (mi.status === 200) { ok++; pullCnt++; }
            else fail++;
            console.log('[A-拉流请求] ' + tag + ' -> ' + mi.status + (mi.mainUrl ? ' (获取直链OK)' : ''));
            // B. Range 拉流头
            if (mi.mainUrl && args.mode === 'both') {
              const rp = await rangePull(mi.mainUrl, fp, proxy, args.pullBytes);
              console.log('  [B-拉流头] ' + tag + ' -> ' + (rp.ok ? ('已拉 ' + rp.got + 'B') : 'fail: ' + rp.reason));
            }
          } catch (e) {
            fail++;
            console.log('[A-拉流请求] ' + tag + ' -> ERR ' + e.message.slice(0, 80));
          }
          await limiter.wait();
        }
      }

      // C. 事件上报：--mode report/both 时优先走实测链路（app_log 泵 + 进度上报）
      if ((args.mode === 'both' || args.mode === 'report') && !args.endpoint) {
        if (args.dry) {
          console.log('[DRY-C] ' + tag + ' app_log泵 → ' + APPLOG_HOSTS.length + ' 主机 + read_progress/read_history 进度上报');
        } else {
          const a1 = await reportAppLog(vid, fp, proxy, ctx, args);
          console.log('[C-app_log] ' + tag + ' -> ' + a1);
          await limiter.wait();
          const a2 = await reportProgress(vid, fp, proxy, ctx, args, args.series.length ? '' : '');
          console.log('[C-progress] ' + tag + ' -> ' + a2);
          await limiter.wait();
        }
      } else if (args.mode === 'both' || args.mode === 'report') {
        const stages = ['start'];
        const hearts = 2 + Math.floor(Math.random() * 4);
        for (let h = 0; h < hearts; h++) stages.push('heartbeat');
        stages.push('finish');
        for (const ep of epList) {
          for (const st of stages) {
            if (args.dry) {
              console.log('[DRY-C] ' + tag + ' ' + st + ' -> ' + fill(ep.url, ctx).replace(/\?.*/, '?…'));
              continue;
            }
            try {
              const stCode = await reportEvent(ep, vid, fp, proxy, st, Object.assign({}, ctx, { play_progress: ctx.play_progress, stage: st }));
              if (stCode < 400) ok++; else fail++;
              console.log('[C-上报] ' + tag + ' ' + st + ' -> ' + stCode + ' ' + (ep.name || 'endpoint'));
            } catch (e) {
              fail++;
              console.log('[C-上报] ' + tag + ' ' + st + ' -> ERR ' + e.message.slice(0, 90));
            }
            await limiter.wait();
          }
        }
      }
    }
  }

  console.log('');
  console.log('[完成] 拉流请求=' + pullCnt + ' · 成功=' + ok + ' · 失败=' + fail);
  if (args.dry) {
    console.log('这是干跑。确认无误后用 --send 正式发送。');
    console.log('若只想拉流不报未知端点，用 --mode pull；确认真上报端点后用 --endpoint <URL> --mode report。');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('[protocol-bot失败]', e.message);
  process.exit(1);
});
