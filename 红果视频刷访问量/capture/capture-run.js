// capture-run.js - 用 Node frida 附加到目标 App，加载 hook-net.js，实时输出请求日志
// 用法: node capture/capture-run.js [package] [pid]
const fs = require('fs');
const path = require('path');
async function main() {
  const frida = await import('frida');
  const PKG = process.argv[2] || 'com.phoenix.read';
  const LOG = path.join(__dirname, 'capture-' + PKG + '.log');
  const out = fs.createWriteStream(LOG, { flags: 'a' });
  function w(l) { console.log(l); out.write(l + '\n'); }
  let dev;
  try { dev = await frida.getUsbDevice(); }
  catch (e) { dev = await frida.getDeviceManager().addRemoteDevice('127.0.0.1:27042'); }
  const pidArg = Number(process.argv[3] || NaN);
  const session = Number.isFinite(pidArg) ? await dev.attach(pidArg) : await dev.attach(PKG);
  const src = fs.readFileSync(path.join(__dirname, 'hook-net.js'), 'utf8');
  const script = await session.createScript(src);
  script.message.connect(function (msg) {
    var line = msg.type === 'send' ? String(msg.payload) : (msg.type + ': ' + JSON.stringify(msg).slice(0, 600));
    w(line);
  });
  await script.load();
  w('=== attached ' + PKG + ' pid=' + session.pid + ' log=' + LOG + ' ===');
  process.on('SIGINT', async function () { try { await session.detach(); } catch (e) {} process.exit(0); });
  process.on('SIGTERM', async function () { try { await session.detach(); } catch (e) {} process.exit(0); });
}
main().catch(function (e) { console.error('capture-run error: ' + e.message + '\n' + (e.stack || '')); process.exit(1); });