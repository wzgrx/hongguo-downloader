/**
 * prepare-release-assets.js —— 为 GitHub Release 准备 ASCII 文件名的资产
 *
 * 为什么需要：
 *   本地打包产物的文件名是中文（红果短剧下载器-1.0.0-win-x64.zip），
 *   但 GitHub 的 Release 资产接口会把文件名里的非 ASCII 字符直接过滤掉，
 *   变成 "-1.0.0-win-x64.zip"（gh CLI 与直连 API 都会这样）。
 *   所以上传前先把产物复制成 ASCII 文件名。
 *
 * 产物：dist/release/<ascii 文件名>
 * 用法：
 *   node scripts/prepare-release-assets.js
 *   gh release create v1.0.0 --title "..." --notes-file notes.md dist/release/*
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'release');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const SLUG = pkg.name; // hongguo-downloader

// 本地产物名（中文） -> Release 资产名（ASCII）
const MAP = [
  { from: `红果短剧下载器-${VERSION}-win-x64.zip`, to: `${SLUG}-${VERSION}-win-x64.zip`, desc: '绿色版 zip（推荐）' },
  { from: `红果短剧下载器-Setup-${VERSION}.exe`, to: `${SLUG}-${VERSION}-Setup.exe`, desc: 'NSIS 安装包' },
  { from: `红果短剧下载器-${VERSION}-便携版.exe`, to: `${SLUG}-${VERSION}-portable.exe`, desc: '便携单文件' },
];

function findInDist(name) {
  const p = path.join(DIST, name);
  if (fs.existsSync(p)) return p;
  return null;
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const done = [];
  const missing = [];

  for (const m of MAP) {
    const src = findInDist(m.from);
    if (!src) { missing.push(m.from); continue; }
    const dst = path.join(OUT, m.to);
    fs.copyFileSync(src, dst); // 复制而不是改名，保留 dist 里的原始产物
    done.push({ ...m, size: fs.statSync(dst).size });
  }

  console.log('已准备 Release 资产 → ' + OUT);
  for (const d of done) {
    console.log(`  ${d.to}`);
    console.log(`      ${(d.size / 1048576).toFixed(1)} MB   （${d.desc}）`);
  }
  if (missing.length) {
    console.log('\n未找到以下本地产物，请先打包：');
    missing.forEach((m) => console.log('  ' + m));
    console.log('  可执行：npm run build && npm run build:zip && npm run build:portable');
  }

  console.log('\n下一步（示例）：');
  console.log(`  gh release create v${VERSION} --title "红果短剧下载器 v${VERSION}" \\`);
  console.log(`    --notes-file release-notes.md dist/release/*`);
  console.log('  或补传：gh release upload v' + VERSION + ' dist/release/* --clobber');
}

try { main(); } catch (e) {
  console.error('失败：' + e.message);
  process.exit(1);
}
