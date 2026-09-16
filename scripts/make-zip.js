/**
 * make-zip.js —— 把绿色版目录打成一个「解压即用」的 zip
 *
 * 为什么不用 electron-builder 自带的 zip target：
 *   它把 75 个文件直接铺在压缩包根目录，用户「解压到当前文件夹」
 *   会把文件散落一地。这里统一套一层以产品名命名的顶层文件夹。
 *
 * 做法：把 win-unpacked 临时改名成目标文件夹名 -> 压缩 -> 再改回来。
 *   改名是瞬时的，不用复制 400MB，也不占额外磁盘。
 *
 * 产物：dist/<产品名>-<版本>-win-x64.zip
 *   └── <产品名>-<版本>/          ← 解压后就是一个完整目录，双击里面的 exe 即用
 *
 * 注意（实测踩坑）：
 *   在本机 Node 24 上，对那个 ~158MB 的 zip 调用 fs.rmSync(file, {force:true})
 *   会让进程直接崩溃（exit 0xC0000409），且崩溃抓不到、finally 不执行。
 *   因此这里删除文件一律用 fs.unlinkSync，删除目录用独立进程的 PowerShell，
 *   并在开头做「上次崩溃遗留」的自愈。
 *
 * 用法：
 *   node scripts/make-zip.js                （需要先有 dist/win-unpacked）
 *   npm run build:zip                       （自动先构建再打包）
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(DIST, 'win-unpacked');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const PRODUCT = (pkg.build && pkg.build.productName) || pkg.name;
const VERSION = pkg.version;

const FOLDER_NAME = `${PRODUCT}-${VERSION}`;
const ZIP_PATH = path.join(DIST, `${PRODUCT}-${VERSION}-win-x64.zip`);
const STAGED = path.join(DIST, FOLDER_NAME);

function find7za() {
  const candidates = [
    path.join(ROOT, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
    path.join(ROOT, 'node_modules', '7zip-bin', 'win', 'ia32', '7za.exe'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

/** 删除文件：用 unlinkSync（rmSync 在本机会崩） */
function safeUnlink(p) {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return true;
  } catch (e) {
    console.warn('[zip] 删除文件失败：' + p + ' — ' + e.message);
    return false;
  }
}

/** 删除目录：交给独立进程的 PowerShell，避免主进程崩溃 */
function safeRemoveDir(dir) {
  if (!fs.existsSync(dir)) return true;
  try {
    execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Remove-Item -LiteralPath '${dir}' -Recurse -Force -ErrorAction SilentlyContinue`,
    ], { stdio: 'ignore' });
    return !fs.existsSync(dir);
  } catch (e) {
    console.warn('[zip] 删除目录失败：' + dir + ' — ' + e.message);
    return false;
  }
}

function main() {
  // ---- 自愈：上次若在改名后崩溃，目录名会停在 PRODUCT-VERSION ----
  if (!fs.existsSync(SRC) && fs.existsSync(STAGED)) {
    console.log('[zip] 检测到上次异常退出遗留的目录，正在改回 win-unpacked…');
    fs.renameSync(STAGED, SRC);
  }
  // 真的是重名残留（两个都在）时删掉残留目录
  if (fs.existsSync(SRC) && fs.existsSync(STAGED)) {
    console.log('[zip] 清理重名残留目录：' + FOLDER_NAME);
    safeRemoveDir(STAGED);
  }

  if (!fs.existsSync(SRC)) {
    console.error('[zip] 未找到 ' + SRC);
    console.error('[zip] 请先执行：npx electron-builder --win --dir');
    process.exit(1);
  }

  console.log('[zip] 准备打包：' + PRODUCT + ' ' + VERSION);

  let renamed = false;
  try {
    // 删除旧 zip（unlinkSync，避免 rmSync 崩溃）
    if (fs.existsSync(ZIP_PATH)) {
      console.log('[zip] 删除旧的 zip…');
      if (!safeUnlink(ZIP_PATH)) throw new Error('旧 zip 删除失败（可能被占用）');
    }

    fs.renameSync(SRC, STAGED); // 瞬时完成
    renamed = true;
    console.log('[zip] 已将 win-unpacked 临时更名为 ' + FOLDER_NAME);

    const sevenZip = find7za();
    if (sevenZip) {
      console.log('[zip] 压缩中（7-Zip）…');
      // 在 dist 目录下执行，压缩包内即带上顶层文件夹
      execFileSync(sevenZip, ['a', '-tzip', '-mx=5', '-bso0', '-bsp0', ZIP_PATH, FOLDER_NAME], {
        cwd: DIST,
        stdio: 'inherit',
      });
    } else {
      console.log('[zip] 压缩中（PowerShell Compress-Archive）…');
      execFileSync(
        'powershell',
        ['-NoProfile', '-Command',
         `Compress-Archive -LiteralPath '${STAGED}' -DestinationPath '${ZIP_PATH}' -Force`],
        { stdio: 'inherit' }
      );
    }

    if (!fs.existsSync(ZIP_PATH)) throw new Error('压缩未生成文件');

    const size = fs.statSync(ZIP_PATH).size;
    console.log('[zip] 完成：' + ZIP_PATH);
    console.log('[zip]   大小：' + (size / 1048576).toFixed(1) + ' MB');
    console.log('[zip]   解压后顶层文件夹：' + FOLDER_NAME + '/（双击其中的 exe 即用）');
  } finally {
    // 无论成功失败都把目录名改回来，避免影响后续 --dir 构建
    if (renamed && fs.existsSync(STAGED) && !fs.existsSync(SRC)) {
      try {
        fs.renameSync(STAGED, SRC);
        console.log('[zip] 已恢复目录名为 win-unpacked');
      } catch (e) {
        console.warn('[zip] 恢复目录名失败（下次运行会自动修复）：' + e.message);
      }
    }
  }
}

try {
  main();
} catch (e) {
  console.error('[zip] 打包失败：' + (e && e.message ? e.message : e));
  process.exit(1);
}
