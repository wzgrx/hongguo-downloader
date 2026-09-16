# 第三方组件许可说明

本软件（红果短剧下载器）使用了以下第三方组件。各组件的版权归其各自作者所有，
本软件对这些组件的使用均遵循其原始许可证。

---

## 运行时依赖

| 组件 | 版本 | 许可证 | 项目地址 |
|---|---|---|---|
| Electron | 28.3.3 | MIT | https://github.com/electron/electron |
| React | 18.3.1 | MIT | https://github.com/facebook/react |
| React DOM | 18.3.1 | MIT | https://github.com/facebook/react |
| axios | ^1.13.2 | MIT | https://github.com/axios/axios |

Electron 打包产物中已包含 Chromium 与 Node.js 的许可声明：

- `LICENSE.electron.txt`
- `LICENSES.chromium.html`

---

## 内置可执行程序

### FFmpeg（GPLv3）

| 项 | 说明 |
|---|---|
| 文件 | `resources/bin/ffmpeg.exe`、`resources/bin/ffprobe.exe` |
| 版本 | FFmpeg 7.1-essentials_build |
| 来源 | https://www.gyan.dev/ffmpeg/builds/ |
| 构建参数 | 含 `--enable-gpl --enable-version3 --enable-libx264 --enable-libx265` |
| **许可证** | **GNU General Public License v3.0** |
| 源码 | https://ffmpeg.org/download.html · https://github.com/FFmpeg/FFmpeg |

用途：为「一键合并」提供分片拼接，为「兼容模式」提供格式转码
（解决部分电脑无法硬件解码 HEVC 导致的「黑屏有声」）。

随软件分发的许可证全文位于 `resources/bin/`：

- `COPYING.GPLv3` —— GPLv3 全文（本构建适用的主许可证）
- `COPYING.GPLv2` —— GPLv2 全文
- `COPYING.LGPLv2.1` —— LGPLv2.1 全文
- `LICENSE.md` —— FFmpeg 官方许可证说明
- `FFMPEG-NOTICE.txt` —— 本项目的补充说明与源码获取方式

FFmpeg 是独立的第三方程序，本软件仅通过命令行调用其公开接口，未修改其源码。

---

## 开发依赖

构建期使用以下工具（不随软件分发）：

| 组件 | 许可证 |
|---|---|
| Vite | MIT |
| electron-builder | MIT |
| @vitejs/plugin-react | MIT |
| concurrently | MIT |
| wait-on | MIT |

---

## 本软件自身

本软件基于上游项目二次开发，整体以 **GNU General Public License v3.0** 发布，
详见仓库根目录的 `LICENSE` 与 `NOTICE`。
