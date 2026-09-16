/**
 * adb.js - adb 封装
 * 负责：设备发现、屏幕尺寸、保持亮屏、点击/滑动/按键、包名探测、前台 Activity 查询。
 * 所有命令走 child_process，输出以 UTF-8 解码。
 */
const { execFileSync } = require('child_process');

class Adb {
  constructor({ path = 'adb', serial = '' } = {}) {
    this.path = path;
    this.serial = serial;
  }

  target() {
    return this.serial ? ['-s', this.serial] : [];
  }

  run(args, opts = {}) {
    const full = [...this.target(), ...args];
    try {
      const stdout = execFileSync(this.path, full, {
        encoding: 'utf8',
        timeout: opts.timeout || 30000,
        maxBuffer: opts.maxBuffer || 32 * 1024 * 1024,
        windowsHide: true,
      });
      return String(stdout || '').trim();
    } catch (e) {
      if (opts.allowFail) return '';
      throw new Error('[adb] ' + full.join(' ') + ' -> ' + (e.stderr || e.message));
    }
  }

  shell(args, opts = {}) {
    return this.run(['shell', ...args], opts);
  }

  /** 设备列表：返回 [{serial, product, model, device}] */
  listDevices() {
    const out = this.run(['devices', '-l']);
    const list = [];
    for (const line of out.split(/\r?\n/)) {
      if (!line.trim() || line.startsWith('List')) continue;
      const parts = line.trim().split(/\s+/);
      const meta = {};
      for (const p of parts.slice(2)) {
        const kv = p.split(':');
        if (kv.length === 2) meta[kv[0]] = kv[1];
      }
      list.push({ serial: parts[0], state: parts[1], ...meta });
    }
    return list;
  }

  /** 按关键词探测包名（第一个非空匹配） */
  findPackage(hints) {
    const out = this.shell(['pm', 'list', 'packages'], { allowFail: true });
    const pkgs = new Set(out.split(/\r?\n/).map(l => l.replace('package:', '').trim()).filter(Boolean));
    for (const h of hints || []) {
      for (const p of pkgs) {
        if (p.includes(h)) return p;
      }
    }
    return '';
  }

  /** 屏幕尺寸 {w, h} */
  screenSize() {
    const out = this.shell(['wm', 'size'], { allowFail: true });
    const m = out.match(/(\d+)x(\d+)/);
    if (!m) return { w: 0, h: 0 };
    return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
  }

  /** 屏幕是否点亮 */
  isScreenOn() {
    const out = this.shell(['dumpsys', 'power'], { allowFail: true });
    return /mWakefulness=Awake|Display Power: state=ON/i.test(out);
  }

  wake() {
    this.shell(['input', 'keyevent', 'KEYCODE_WAKEUP'], { allowFail: true });
    this.shell(['wm', 'dismiss-keyguard'], { allowFail: true });
  }

  keepScreenOn(enable = true) {
    this.shell(['svc', 'power', 'stayon', enable ? 'true' : 'false'], { allowFail: true });
  }

  tap(x, y) {
    this.shell(['input', 'tap', String(Math.round(x)), String(Math.round(y))], { allowFail: true });
  }

  swipe(x1, y1, x2, y2, ms = 300) {
    this.shell(['input', 'swipe', String(Math.round(x1)), String(Math.round(y1)),
      String(Math.round(x2)), String(Math.round(y2)), String(ms)], { allowFail: true });
  }

  keyevent(code) {
    this.shell(['input', 'keyevent', code], { allowFail: true });
  }

  launch(pkg, activity) {
    if (activity) {
      this.shell(['am', 'start', '-n', pkg + '/' + activity], { allowFail: true });
    } else {
      this.shell(['monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'], { allowFail: true });
    }
  }

  /** 取包名 MAIN activity，如 "com.xxx/.MainActivity" 或空 */
  mainActivity(pkg) {
    const out = this.shell(['cmd', 'package', 'resolve-activity', '--brief', '-c', 'android.intent.category.LAUNCHER', pkg], { allowFail: true });
    const lines = out.split(/\r?\n/).filter(Boolean);
    const act = lines[lines.length - 1];
    return act && !act.includes('No activity') ? act.split('/')[1] : '';
  }

  /** 当前前台 Activity 名（含包名） */
  currentActivity() {
    const out = this.shell(['dumpsys', 'activity', 'activities'], { allowFail: true });
    const m = out.match(/(?:mResumedActivity|topResumedActivity)[^}]* ([^ ]+)/);
    return m ? m[1] : '';
  }

  /** 音量 ±（模拟真人调音量的小动作） */
  volume(delta = 1) {
    const code = delta >= 0 ? 'KEYCODE_VOLUME_UP' : 'KEYCODE_VOLUME_DOWN';
    this.keyevent(code);
  }

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  rand(min, max) {
    return min + Math.random() * (max - min);
  }
}

module.exports = Adb;
