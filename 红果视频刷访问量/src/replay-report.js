/**
 * replay-report.js - 路线 B：协议重放刷量客户端
 *
 * 原理：把抓包得到的真实「播放上报」报文（URL/Headers/Body）参数化，
 * 用设备指纹池轮换 + 令牌桶节流 + 代理池轮换重放，批量产生上报事件。
 *
 * 用法：
 *   node src/replay-report.js --dry              # 干跑：只打印要发的报文，不发
 *   node src/replay-report.js --vids 7645...,7646... --rate 15
 *
 * 前置：先抓包，把真实上报报文填入 capture/play_event.template.json
 *       （见 capture/mitm-notes.md 与 capture/frida-hook-http.js）。
 */
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { makeFingerprintPool } = require('./device-fp');

const ROOT = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

function parseArgs(argv) {
  const a = {
    dry: !!cfg.replay.dryRun,
    vids: [],
    rate: cfg.replay.itemsPerMinute,
    fps: cfg.replay.fingerprintCount,
    proxies: cfg.replay.proxyList || [],
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--dry') a.dry = true;
    else if (v === '--send') a.dry = false;
    else if (v === '--vids') a.vids = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (v === '--rate') a.rate = parseInt(argv[++i], 10);
    else if (v === '--fps') a.fps = parseInt(argv[++i], 10);
    else if (v === '--proxy') a.proxies.push(argv[++i]);
  }
  return a;
}

function loadTemplate() {
  const p = path.join(ROOT, cfg.replay.eventTemplate);
  const t = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!t.url || (!t.body && !t.headers)) {
    throw new Error('模板不完整：需要 url + headers/body。请先用抓包结果填充 ' + p);
  }
  return t;
}

function fillPlaceholders(text, ctx) {
  return String(text).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (m, key) => {
    if (key in ctx) return ctx[key];
    return m; // 未提供的占位符保留原样，便于发现遗漏
  });
}

function renderPayload(tpl, ctx) {
  const url = fillPlaceholders(tpl.url, ctx);
  const headers = {};
  for (const [k, v] of Object.entries(tpl.headers || {})) headers[k] = fillPlaceholders(v, ctx);
  let body = tpl.body;
  if (body && typeof body === 'object') {
    body = JSON.parse(fillPlaceholders(JSON.stringify(body), ctx));
  }
  return { method: (tpl.method || 'POST').toUpperCase(), url, headers, body };
}

// 令牌桶：itemsPerMinute 速率 + 随机抖动
function makeRateLimiter(perMinute) {
  const interval = Math.max(60000 / Math.max(perMinute, 1), 1000);
  return {
    async wait() {
      const jitter = interval * (0.7 + Math.random() * 0.6);
      await new Promise(r => setTimeout(r, jitter));
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tpl = loadTemplate();
  const fps = makeFingerprintPool(args.fps);
  const limiter = makeRateLimiter(args.rate);

  let vids = args.vids;
  if (vids.length === 0) {
    vids = (Array.isArray(tpl.vids) ? tpl.vids : []).map(v => String(v));
  }
  if (vids.length === 0) {
    console.error('[!] 未提供视频列表：用 --vids 指定，或写入模板的 vids 字段。');
    process.exit(1);
  }

  console.log('[重放] 视频数=' + vids.length, '指纹池=' + fps.length,
    '速率=' + args.rate + '/min', '代理=' + (args.proxies.length || '直连'), '干跑=' + args.dry);
  console.log('[模板] ' + tpl.method + ' ' + (tpl.url || '').slice(0, 110));
  console.log('');

  let sent = 0;
  let err = 0;

  for (const vid of vids) {
    for (let fpIdx = 0; fpIdx < fps.length; fpIdx++) {
      const fp = fps[fpIdx];
      const playSeconds = Math.round(40 + Math.random() * 80); // 模拟看完一集
      const ctx = {
        vid,
        device_id: fp.device_id,
        iid: fp.iid,
        cdid: fp.cdid,
        session: fp.session,
        install_id: fp.install_id,
        ts: String(Date.now()),
        rticket: String(Date.now()),
        play_seconds: String(playSeconds),
        play_progress: String(playSeconds), // 视模板字段而定
        core_scene: '3',
        'screen_w': fp.resolution.split('*')[0],
        'screen_h': fp.resolution.split('*')[1],
      };
      const payload = renderPayload(tpl, ctx);

      if (args.dry) {
        console.log('--- [DRY] vid=' + vid, 'fp#' + fpIdx, 'device_id=' + fp.device_id);
        console.log(payload.method, payload.url);
        console.log('headers:', JSON.stringify(payload.headers).slice(0, 300));
        console.log('body:', JSON.stringify(payload.body).slice(0, 500));
        console.log('');
        sent++;
        continue;
      }

      const proxy = args.proxies.length ? args.proxies[sent % args.proxies.length] : null;
      try {
        const res = await axios({
          method: payload.method,
          url: payload.url,
          headers: payload.headers,
          data: payload.body ? JSON.stringify(payload.body) : undefined,
          timeout: 20000,
          proxy: proxy ? parseProxy(proxy) : false,
        });
        sent++;
        console.log('[OK] vid=' + vid, 'fp#' + fpIdx, '->', res.status,
          String(res.data || '').slice(0, 80).replace(/\n/g, ' '));
      } catch (e) {
        err++;
        console.log('[ERR] vid=' + vid, 'fp#' + fpIdx, '->', e.message.slice(0, 160));
      }
      await limiter.wait();
    }
  }

  console.log('');
  console.log('[完成] 发送=' + sent, '失败=' + err);
  process.exit(err === 0 ? 0 : 1);
}

function parseProxy(s) {
  // 支持 host:port 或 http://user:pass@host:port
  const m = s.match(/^(?:http:\/\/)?(?:([^:@]+):([^@]+)@)?([^:]+):(\d+)$/);
  if (!m) return false;
  return {
    host: m[3],
    port: parseInt(m[4], 10),
    auth: m[1] && m[2] ? { username: m[1], password: m[2] } : undefined,
  };
}

main().catch((e) => {
  console.error('[replay失败]', e.message);
  process.exit(1);
});
