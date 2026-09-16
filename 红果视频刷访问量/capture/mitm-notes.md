# mitmproxy 抓包配置（root 平板）

与 frida 抓包二选一即可；frida 脚本（frida-hook-http.js）不依赖代理、更稳，推荐优先用 frida。
本文件是代理方案，适合想看全量流量/存证的情况。

## 0. 前置
- PC 装 mitmproxy（`pip install mitmproxy`，本机已有 Python 3.8.6）
- 平板已 root、已开 USB 调试（本机 adb 已就绪）

## 1. 启动 mitmproxy
```bash
mitmweb -p 8080 --set http2=true          # 开 Web 界面 http://127.0.0.1:8081 方便过滤/导出
```
（如 App 走 HTTP/3/QUIC 命中不了，可加 `--set http3=false` 观察降级，或直接用 frida 方案）

## 2. 平板走代理
```bash
adb shell settings put global http_proxy <PC局域网IP>:8080
```
PC 局域网 IP 用 `ipconfig` 查（与平板同一 Wi-Fi）。

## 3. 信任根证书（root 平板，装成系统证书）★关键
```bash
# 3.1 导出 mitmproxy 自带 CA（首次运行后生成于 ~/.mitmproxy/mitmproxy-ca-cert.pem）
# 3.2 转成系统证书格式并推入系统目录
openssl x509 -inform PEM -in ~/.mitmproxy/mitmproxy-ca-cert.pem -outform DER -out ca.der
HASH=$(openssl x509 -inform PEM -in ~/.mitmproxy/mitmproxy-ca-cert.pem -subject_hash_old -noout)
adb root
adb remount
adb push ca.der /system/etc/security/cacerts/$HASH.0
adb shell chmod 644 /system/etc/security/cacerts/$HASH.0
adb reboot
```
> 小米平板 rooting 后 `adb remount` 若失败：先 `adb shell avbctl disable-verification` + 重启，再 remount。

## 4. 过滤与导出
在 mitmweb 界面（或 mitmproxy 命令行）过滤：
```
~d fqnovel.com | ~d snssdk.com | ~d bytedance.com | ~d amemv.com
```
播放几集后，把「播放上报」相关请求（URL 含 play/report/stat/heart/progress/log 等）导出：
method / url / request headers / request body / response body 全部保存。

## 5. 填模板
把最典型的「进度心跳/播放完成」POST 请求填入
`capture/play_event.template.json`，字段用 `{{placeholders}}` 替换动态值：
- `{{vid}}` 视频 id、`{{device_id}}`、`{{iid}}`、`{{cdid}}`、`{{session}}`、`{{install_id}}`
- `{{ts}}`、`{{rticket}}`、`{{play_seconds}}`、`{{play_progress}}`

> 注意：body 若为 protobuf/二进制（字节系很多统计走 pb），POST body 可能无法直接 JSON 化；
> 这种情况直接改用 capture/frida-hook-http.js 方案，在 okhttp 层拿到的也是序列化后的字节，
> 需配合反编译（jadx 找上报模型类）还原字段。首次建议先抓带详情的业务接口。
