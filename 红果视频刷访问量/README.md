# 红果视频刷访问量（研究 + 工具集）

> 基础：复用同目录「红果短剧下载器」已逆向出的红果/番茄系 API 指纹（fqnovel.com 域、
> novelread 客户端参数、device_id/iid/cdid 结构），在其之上研究播放量（访问量）的统计路径
> 与刷量方案。本目录代码独立运行，**不修改下载器任何文件**。

---

## 一、结论先行

| 路线 | 效率 | 真实性 | 被清量风险 | 推荐度 |
|---|---|---|---|---|
| A. 真机自动化（root 平板 + adb 播放循环） | 低（1 设备 1 路） | ★★★★★ 最高 | 最低 | ⭐ 首选 |
| B. 协议重放（抓包后脚本上报播放事件） | 高（可多指纹+多代理并行） | ★★★ 中 | 较高 | ⭐ 提速用 |
| C. Frida Hook 伪造完成事件 | 高 | ★★ 低 | 高 | 备选/研究 |

**推荐组合**：先用抓包工具（本目录 `capture/`）把红果 App 的真实播放上报接口和报文抓出来
→ 日常用「方案 A 真机自动化」稳定跑量（最像真人、最难被清）→ 需要冲量时用「方案 B 协议重放」
（多设备指纹 + 代理池 + 节流）并行提速。

---

## 二、播放量统计机制分析（红果/番茄系）

### 2.1 播放计数发生在哪

字节系（红果短剧、番茄小说短剧频道共用 fqnovel.com / novelread 客户端体系）的播放量
不是单一接口 +1 的结果，而是**多条证据链合并**：

1. **CDN 拉流日志**：播放器请求视频直链（本项目 `fetchPlayUrlSingle` 拿到的 main_url）时，
   CDN/点播服务端已记录一次「播放请求」。这是最底层计数，脚本层面无法伪造（除非真的去拉流）。
2. **客户端事件上报**：播放过程中客户端按节奏上报各种事件——
   播放开始（play/start）、进度心跳（每 N 秒 progress）、播放结束（finish/complete）、
   退出（pause/exit）。这类上报走业务域接口（fqnovel.com 系）或埋点域
   （log.snssdk.com、mon.snssdk.com 系），**这就是协议层可以伪造的部分**。
3. **服务端合并去重**：把「CDN 拉流」+「客户端上报」合并，按 设备/账号 × 视频 × 时间窗口 去重。

### 2.2 「有效播放」判定模型（去重是核心）

按视频行业 + 字节系的通用做法，一个播放要记为有效，典型条件（**具体阈值需抓包/实测确认**）：

- **时长阈值**：播放停留 ≥ 若干秒（常见 3s / 10s / 集长的一定比例）才算一次有效播放；
- **去重窗口**：同一设备（device_id）、同一账号、同一视频在窗口内（常见 24h 或按集）只计一次；
- **完播加权**：完播率高的播放权重更高（影响推荐/热度，不只是计数）；
- **事件序列合理性**：必须有「开始 → 心跳 → 结束」的合理序列，只有孤立事件会被判异常。

### 2.3 风控（反刷）维度清单

| 维度 | 说明 | 对抗手段（见第七章） |
|---|---|---|
| 设备指纹 | device_id/iid/cdid/install_id 的一致性 | 指纹池、每个指纹固定复用 |
| IP 频次与归属 | 同 IP 大量不同设备刷 = 机房特征 | 代理池轮换、控制单 IP 速率 |
| 行为节奏 | 真人观看时长/间隔有随机分布 | 随机延时、随机滑屏 |
| 时间分布 | 全天均匀 vs 凌晨突增 | 分时段、分日跑 |
| 账号登录态 | 未登录 vs 登录、账号数量 | 多账号轮换（可选） |
| 上报频率 | 单设备单位时间上报次数上限 | 令牌桶节流 |
| 字段完整性 | 缺字段/字段矛盾（如分辨率与机型不符） | 抓真实报文原样填充 |

### 2.4 本项目能直接复用的资产（来自下载器）

- `COMMON_QUERY`：完整客户端参数模板（iid / device_id / cdid / klink_egdi / 机型 / ROM 等），
  协议重放时只需随机化 iid/device_id/cdid + 时间戳即可生成新指纹；
- `resolveSeriesId / fetchEpisodeList / fetchPlayUrlSingle`：给定分享链接可拿全集 vid 列表
  与播放直链——**拉直链本身就是一次 CDN 播放请求**，可用于「配合上报」或研究计数关系；
- UA、Referer、Host 头等完整请求头。

---

## 三、三种技术路线详解

### 路线 A：真机自动化（`src/autoplay.js`）—— 推荐日常跑量

原理：root 平板安装红果短剧 App 并登录，adb 驱动「点亮屏幕 → 播放一集 → 随机停留
40~120 秒 → 上滑切下一集 → 随机休息 → 循环」。行为完全等同真人刷剧，服务端难以从
行为上区分。

- 需要的设备动作：唤醒/保屏、模拟点击/滑动、随机等待；
- 每个循环 = 一集的有效播放（配合 2.2 的时长阈值，停留时间必须超过阈值）；
- 本机已配好：自动发现 adb 设备、自动探测红果包名、自适应屏幕坐标滑动。

### 路线 B：协议重放（`src/replay-report.js`）—— 冲量提速

原理：抓到真实上报报文后，把 `vid/device_id/iid/cdid/时间戳/播放时长` 等字段参数化，
用脚本以「多指纹轮换 + 代理池 + 令牌桶节流」重放，同一视频批量产生上报事件。

- **必须先抓包**拿到：上报接口 URL、完整 Header、完整 Body（见 `capture/`）；
- 指纹池由 `src/device-fp.js` 生成（结构与下载器 COMMON_QUERY 一致）；
- 内置 --dry 干跑模式，先看报文再发；
- 注意：只重放上报事件不拉流，若服务端严格合并 CDN 拉流日志，纯上报可能不计（需实测）；
  可配合下载器 `fetchPlayUrlSingle` 先拉直链再上报。

### 路线 C：Frida Hook 伪造（`capture/frida-hook-http.js` 延伸）

原理：在 root 平板上跑 frida-server，hook App 播放器回调或统计 SDK 的上报函数，
伪造「播放完成」事件批量上报。

- 依赖 App 具体类名/版本，维护成本高，且事件序列单一容易被风控识别；
- 本目录的 frida 脚本主要用于**抓包取证**（SSL unpin + okhttp 全量日志），
  伪造玩法在抓到真实函数后按需扩展。

---

## 四、操作流程（从 0 到跑量）

1. **装 App**：已实测平板装有 `com.phoenix.read`（番茄小说短剧/红果同源），确认已登录可观察的账号；（若用独立的「红果短剧」App 也可，autoplay 会按关键词自动探测）
2. **抓包确认统计接口**（一次性，约 20 分钟）：
   - 方式一（推荐）：平板跑 frida-server，PC 跑 `frida -U -f 包名 -l capture/frida-hook-http.js`，
     然后在 App 里正常播放几集，抓取上报请求；
   - 方式二：PC 起 mitmproxy，平板设代理 + 装系统证书（见 `capture/mitm-notes.md`），过滤
     fqnovel.com / snssdk.com 域；
   - 把抓到的最典型「播放进度/结束上报」报文填入 `capture/play_event.template.json`；
3. **真机自动化起步**：
   `npm run autoplay`（先编辑 `config.json`：把平板手动打开到目标剧集首页，保持播放第一集）；
4. **协议重放提速**（抓包完成后）：
   `npm run replay -- --dry` 看报文 → 去掉 dry 正式发；
5. **验证**（第七章）。

---

## 五、目录结构

```
红果视频刷访问量/
├── README.md                     # 本文档
├── package.json                  # Node 工程（axios）
├── config.json                   # 统一配置（adb / 包名 / 时长 / 重放参数）
├── src/
│   ├── adb.js                    # adb 封装：设备发现、包名探测、点击/滑动/截图/保持亮屏
│   ├── autoplay.js               # 路线 A：真机自动播放主程序
│   ├── device-fp.js              # 设备指纹池（结构对齐下载器 COMMON_QUERY）
│   └── replay-report.js          # 路线 B：协议重放客户端（指纹轮换+代理+节流）
└── capture/
    ├── frida-hook-http.js        # Frida：SSL unpin + okhttp 全量请求/响应日志（抓包取证）
    ├── mitm-notes.md             # mitmproxy 抓包配置（root 平板装系统证书步骤）
    └── play_event.template.json  # 上报事件模板（占位符，等待抓包结果填充）
```

---

## 六、快速上手命令

```bash
npm install                 # 安装 axios（唯一运行时依赖）

# 1) 看平板连接与红果包名是否被识别
node src/autoplay.js --info

# 2) 真机自动播放（先手动把平板停在该剧集播放页，再运行）
node src/autoplay.js --loops 20

# 3) 协议重放（抓包填好模板后）
node src/replay-report.js --dry          # 干跑：只打印将发送的报文
node src/replay-report.js                # 正式发送
```

常用参数：
`--info` 只检测不动作；`--loops N` 播放轮数；`--play-min S --play-max S` 单集停留时长范围；
`--dry` 重放干跑；`--vids 7645...,7646...` 指定视频；`--rate N` 每分钟上报条数。

---

## 七、防清量清单（实测注意）

1. **先小后大**：先跑 20~50 条观察是否计入、是否被清，再逐步加量；
2. **节流**：单指纹单视频 24h 内只生效一次（去重窗口），重复上报无意义且危险，
   所以「多指纹 + 多视频」而不是「单指纹狂刷」；
3. **代理池**：协议重放若跨省/机房 IP，务必池化轮换，单 IP 每分钟 ≤ 5 条；
4. **行为随机**：真机模式停留时长用 [40,120] 随机区间、随机休息、偶发滑屏；
5. **时段分散**：建议分时段跑，避开凌晨 3~6 点集中爆发；
6. **指纹一致性**：一个 device_id 绑死一套 iid/cdid 与机型参数，不要混用；
7. **账号**：有账号的 App 优先登录态跑（未登录流量权重低且易判异常）；
8. **验证是否生效**：App 内播放页看播放量变化；或抓包对比「上报后服务端返回是否含计数相关字段」。

## 八、当前环境实测记录

- adb：`C:\Users\c1732\AppData\Local\Android\Sdk\platform-tools\adb.exe`（36.0.0）
- 已连接平板：`W84PPZKRH6UKGEWW`（product=turner, model=25079RPDCC, 小米平板, root）
- **目标客户端已装**：`com.phoenix.read`（番茄小说/红果短剧同源，`com.dragon.read.pages.splash.SplashActivity` 启动页 —— 与下载器 UA `com.phoenix.read/71532` 完全对应，即本项目分析的正是它）
- 其余：`com.ss.android.ugc.aweme`（抖音）、`com.qiyi.video.pad`、`com.miui.video`
- node src/autoplay.js --info 实测输出：

```
[设备] W84PPZKRH6UKGEWW turner 25079RPDCC
[屏幕] {"w":1880,"h":3008}
[App] com.phoenix.read
[启动Activity] com.dragon.read.pages.splash.SplashActivity
[info] 检测完成。红果 App 是否就绪： 是
```

下一步：在平板上把 `com.phoenix.read` 打开到目标短剧播放页，然后跑 `npm run autoplay` 即可开始真机刷量。

> 说明：以上「播放量判定模型/风控维度」基于字节系通用埋点与视频行业通行做法归纳，
> 具体接口路径与阈值以第 2 步抓包结果为准。
---

## 九、纯协议刷量（PC 直连，完全不用平板/平台）

新增 `src/protocol-bot.js` 与 `candidates/endpoints.json`：脚本在 PC 上直接向 fqnovel 域名发请求，
平板的唯一作用是`可选的一次性抓包`（拿到真实上报端点，见 capture/），之后永久脱离。

### 原理与默认行为

每条「播放会话」 = 指纹 × 视频：
1. 向播放直链接口发带指纹的请求（业务层播放请求记录）；
2. Range 拉流头 ~128KB 模拟客户端拉取视频数据；
3. 可选：向上报端点发 开始→心跳→完成 事件序列。

默认 `--mode pull`（只做 1+2，因为上报端点未确认前发满 7 个候选端点既吵又无意义）；
确认真实上报端点后改 `--mode report`/`both`。

### 常用命令

```bash
# 探测候选端点，找出哪个会真正改变播放量
node src/protocol-bot.js --probe

# 正式拉流刷量：8 指纹 × 全剧集，15 条/分钟
node src/protocol-bot.js --series <分享链接或series_id> --fps 8 --rate 15 --send

# 指定已确认端点，发完整事件序列
node src/protocol-bot.js --series <链接> --endpoint https://…/play_report/v1 --mode report --send

# 挂代理池（防单 IP 频控）
node src/protocol-bot.js --series <链接> --proxy 1.2.3.4:8080 --proxy 5.6.7.8:3128 --send
```

### 纯协议实测记录

- `node src/protocol-bot.js --vids 7645222653694856254 --fps 1 --mode pull --send`
  → `[A-拉流请求] vid=7645222653694856254 fp#0 -> 200 (获取直链OK)`（PC 直连，未使用平板）
- 干跑 `--dry` 会完整打印每个会话的计划（拉流 + 各候选端点的事件序列），先看再发。

### 产量公式与限制

日产量 ≈ 指纹数 × 视频数（单指纹单视频 24h 去重窗口只计一次），所以：
- 要量大：多指纹（`--fps 50`）+ 多视频（`--series` 多个链接或 --max-episodes 全量）；
- 要多 IP：代理池轮换，单 IP 速率压低（`--rate 10` 以内）；
- 纯上报是否计入，取决于服务端是否强制合并 CDN 拉流日志——本 bot 默认同时拉流，就是为覆盖这条口径。
---

## 八、设备实测结论（2026-09-06 平板抓包 + PC 直连验证）

用 root 平板（红果短剧 com.kylin.read v7.3.3.32, aid=8704, TTNet 网络栈）抓包，
得到与「刷访问量」直接相关的**已证实事实**：

### 8.1 播放量计数目标
- 系列播放量 = multi_video_detail 响应 video_data.series_play_cnt（例: 7664958856774044697 = 227758）。
- 详情/直链接口 **PC 可直连**（200），双 aid（8662 novelread / 8704 kylin_read）、三个主机都通：
  api5-normal-sinfonlineb.fqnovel.com / api5-normal.fqnovel.com / reading.snssdk.com。

### 8.2 哪些动作**不**涨播放（实测）
- model preload 连打 30 次 → series_play_cnt 增量 = 0。光拉直链/请求直链接口不加播放。

### 8.3 哪些接口**存在且接受**（PC 已连通）
- POST log.snssdk.com|rtlog5-applog.fqnovel.com|mon11-misc.fqnovel.com/service/2/app_log/
  → 200 {"magic_tag":"ss_app_log","message":"success"}。App 侧 body 是 **gzip 压缩 protobuf 批次**
  （TypedByteArray 24~32KB，log-encode-type: gzip），播放/曝光事件全走这里。
  PC 发任意 JSON 也返回 200，但**服务端只认格式正确的 protobuf 批次**（畸形包不计数）。
  → 协议刷量关键 = 抓到真实批次字节（capture/hook-safe.js 已挂载，播放 30 秒即可落 safe_out.txt 里的 B64）。
- POST reading.snssdk.com/reading/bookapi/read_progress/upload/v 与 read_history/update/v
  存在（返回 100103 PARAM_INVALID＝参数不对，非 404）。真实参数**只在播放页**出现；
  盲猜 6 组全被拒 → 需要真播 30 秒抓真实报文（参数在 Request.tags 的 Invocation 字符串里）。

### 8.4 真实播放链路（设备侧观测）
feed 滑动 → multi_video_detail → multi_video_model → CDN 拉流(qznovelvod.com) →
read_progress/upload + read_history/update（仅播放页） + app_log 批次（周期 30~60s）。

### 8.5 下一步（只需要一次 30 秒）
1. 平板上打开任意短剧播放 30~60 秒（capture/hook-safe.js 已后台挂载）；
2. 读取 capture/safe_out.txt：
   - read_progress 请求的 tags → 真实参数 → 写入 src/report-params.json；
   - app_log 请求的 _B64 → 存为 capture/app_log_batch.bin；
3. node src/protocol-bot.js --series <ID> --mode report --send 即可按实测报文重放。


