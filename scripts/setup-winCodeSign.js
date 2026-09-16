/**
 * setup-winCodeSign.js —— Windows 打包前置环境准备
 *
 * 背景：
 *   electron-builder 打包 Windows 时会下载 winCodeSign-2.6.0.7z，其中包含两个
 *   macOS 用的符号链接（darwin/10.12/lib/libcrypto.dylib、libssl.dylib）。
 *   7-Zip 在 Windows 上创建符号链接需要管理员权限或开启「开发者模式」，
 *   非管理员环境下 7za 会以退出码 2 结束，electron-builder 反复重试后中止打包。
 *
 * 本脚本做的事：
 *   借助 electron-builder 自带的 app-builder 把该压缩包解压到一个**固定目录**，
 *   之后配合 node_modules 里的小补丁（basename 会加入 .dsh-bak）即可跳过重复解压。
 *   注意：想重新生成时，请先把 .dsh-bak 备份改回原名。
 *
 * 用法：
 *   node scripts/setup-winCodeSign.js
 *   然后正常执行：npm run build
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.eb-cache');
const LOCK = path.join(CACHE, 'winCodeSign', 'winCodeSign-2.6.0');
const APP_BUILDER = path.join(ROOT, 'node_modules', 'app-builder-bin', 'win', 'x64', 'app-builder.exe');

const MIRROR =
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
  'https://registry.npmmirror.com/-/binary/electron-builder-binaries/';
const URL = `${MIRROR}winCodeSign-2.6.0/winCodeSign-2.6.0.7z`;

if (process.platform !== 'win32') {
  console.log('非 Windows 平台，无需此步骤。');
  process.exit(0);
}

if (fs.existsSync(path.join(LOCK, 'windows-10', 'x64', 'signtool.exe'))) {
  console.log('winCodeSign 已就绪：' + LOCK);
  process.exit(0);
}

fs.mkdirSync(CACHE, { recursive: true });

console.log('正在解压 winCodeSign（跳过 macOS 符号链接的报错不影响 Windows 文件）...');

// app-builder 需要 PATH 里有 7za；electron-builder 运行时由 JS 层注入，这里手动补齐
const sevenZipDir = path.join(ROOT, 'node_modules', '7zip-bin', 'win', 'x64');
const env = {
  ...process.env,
  ELECTRON_BUILDER_CACHE: CACHE + path.sep,
  PATH: sevenZipDir + path.delimiter + (process.env.PATH || ''),
};

execFile(
  APP_BUILDER,
  ['download-artifact', '--name', 'winCodeSign', '--url', URL],
  { cwd: ROOT, env },
  (err, stdout, stderr) => {
    // 注意：那两个 macOS 符号链接会让 7za 返回退出码 2，app-builder 因此判定失败
    // 并保留随机命名的临时目录；但 Windows 需要的文件其实已经解压完整。
    // 所以这里不因 err 直接退出，而是按目录内容做校验。
    const parent = path.join(CACHE, 'winCodeSign');
    if (!fs.existsSync(parent)) {
      console.error('解压目录不存在，app-builder 输出：');
      console.error(stderr || stdout || (err && err.message));
      process.exit(1);
    }

    const isUsable = (d) =>
      fs.existsSync(path.join(d, 'windows-10', 'x64', 'signtool.exe')) &&
      fs.existsSync(path.join(d, 'rcedit-x64.exe'));

    // 随机目录名可能是纯数字，也可能是别的；统一按内容筛选
    const dirs = fs
      .readdirSync(parent, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(parent, d.name));

    const complete = dirs.find(isUsable);
    if (!complete) {
      console.error('未找到解压完整的目录，app-builder 输出：');
      console.error(stderr || stdout || (err && err.message));
      console.error('现有子目录：' + dirs.join(', '));
      process.exit(1);
    }

    fs.rmSync(LOCK, { recursive: true, force: true });
    fs.cpSync(complete, LOCK, { recursive: true });
    dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
    fs.readdirSync(parent)
      .filter((f) => f.endsWith('.7z'))
      .forEach((f) => fs.rmSync(path.join(parent, f), { force: true }));

    console.log('完成：' + LOCK);
  }
);
