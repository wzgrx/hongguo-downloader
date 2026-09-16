/**
 * autoplay.js - 路线 A：真机自动播放刷量
 *
 * 流程：检测设备 → 探测红果包名 → 保屏 → 循环：等待随机播放时长 → 上滑切下一集 →
 * 随机休息 → 记录。行为模拟真人刷剧（停留时长 / 休息间隔 / 音量抖动随机化）。
 *
 * 用法：
 *   node src/autoplay.js --info              # 只检测，不动作
 *   node src/autoplay.js --loops 20          # 播放 20 集
 *   node src/autoplay.js --play-min 40 --play-max 120 --no-swipe
 */
const path = require('path');
const fs = require('fs');
const Adb = require('./adb');
const { makeFingerprint } = require('./device-fp');

const ROOT = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

function parseArgs(argv) {
  const a = {
    loops: cfg.autoplay.loops,
    playMin: cfg.autoplay.playSecondsMin,
    playMax: cfg.autoplay.playSecondsMax,
    swipe: cfg.autoplay.swipeToNext,
    info: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--info') a.info = true;
    else if (v === '--loops') a.loops = parseInt(argv[++i], 10);
    else if (v === '--play-min') a.playMin = parseInt(argv[++i], 10);
    else if (v === '--play-max') a.playMax = parseInt(argv[++i], 10);
    else if (v === '--no-swipe') a.swipe = false;
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const adb = new Adb(cfg.adb);

  // 1. 设备检查
  const devices = adb.listDevices();
  const online = devices.filter(d => d.state === 'device');
  if (online.length === 0) {
    console.error('[!] 未检测到在线设备。请连接平板并开启 USB 调试。');
    process.exit(1);
  }
  const dev = online.find(d => d.serial === cfg.adb.serial) || online[0];
  adb.serial = dev.serial;
  console.log('[设备]', dev.serial, dev.product || '', dev.model || '');
  console.log('[屏幕]', JSON.stringify(adb.screenSize()));

  // 2. 红果包名探测
  const pkg = adb.findPackage(cfg.app.packageHints) || cfg.app.fallbackPackage;
  if (!pkg) {
    console.warn('[!] 未找到红果短剧 App（按关键词', cfg.app.packageHints.join('/'), '）。');
    console.warn('    请先在平板上安装红果短剧 App，或编辑 config.json 的 app.fallbackPackage 手动指定包名。');
  } else {
    console.log('[App]', pkg);
    const act = adb.mainActivity(pkg);
    console.log('[启动Activity]', act || '(未取到)');
    console.log('[前台]', adb.currentActivity() || '(未知)');
  }

  if (args.info) {
    console.log('');
    console.log('[info] 检测完成。红果 App 是否就绪：', pkg ? '是' : '否');
    if (pkg) adb.launch(pkg, '');
    process.exit(0);
  }
  if (!pkg) {
    console.error('[!] 红果 App 未安装，无法自动播放。');
    process.exit(1);
  }

  // 3. 准备
  if (cfg.autoplay.keepScreenOn) adb.keepScreenOn(true);
  adb.wake();
  adb.keyevent('KEYCODE_MEDIA_PLAY');
  adb.launch(pkg, '');
  await adb.sleep(2500);

  const { w, h } = adb.screenSize();
  if (!w || !h) {
    console.error('[!] 无法获取屏幕尺寸。');
    process.exit(1);
  }
  const swipeFrom = { x: w * 0.5, y: h * 0.82 };
  const swipeTo = { x: w * 0.5, y: h * 0.18 };

  const fp = makeFingerprint(0);

  console.log('');
  console.log('[开始刷量] 循环', args.loops, '集 · 单集停留', args.playMin, '~', args.playMax, '秒 · 上滑切集:', args.swipe);
  const started = Date.now();
  let done = 0;

  for (let i = 0; i < args.loops; i++) {
    const cur = adb.currentActivity();
    if (pkg && cur && !cur.startsWith(pkg)) {
      console.log('  [!] 前台不在目标 App（', cur, '），尝试拉回…');
      adb.launch(pkg, '');
      await adb.sleep(1500);
    }
    if (!adb.isScreenOn()) {
      adb.wake();
      await adb.sleep(1200);
    }

    const stay = Math.round(adb.rand(args.playMin, args.playMax));
    const actShort = (adb.currentActivity().split('/').pop() || '?');
    console.log('  [' + (i + 1) + '/' + args.loops + '] 播放中 ~' + stay + 's (前台=' + actShort + ')');
    await adb.sleep(stay * 1000);

    if (cfg.autoplay.volumeJitter && Math.random() < 0.25) {
      adb.volume(Math.random() < 0.5 ? 1 : -1);
    }

    if (args.swipe) {
      adb.swipe(swipeFrom.x, swipeFrom.y, swipeTo.x, swipeTo.y, 300);
      await adb.sleep(1200);
    }

    const rest = Math.round(adb.rand(cfg.autoplay.sleepBetweenMin, cfg.autoplay.sleepBetweenMax));
    await adb.sleep(rest * 1000);
    done++;
  }

  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log('');
  console.log('[完成] 已播放', done, '集 · 用时', elapsed, '秒 · 指纹 device_id=', fp.device_id);
  if (cfg.autoplay.keepScreenOn) adb.keepScreenOn(false);
  process.exit(0);
}

main().catch((e) => {
  console.error('[autoplay失败]', e.message);
  process.exit(1);
});
