/**
 * frida-hook-http.js - Frida 抓包取证脚本（红果/番茄系 App）
 *
 * 用途：
 *   1) SSL unpinning：绕过证书校验，让 mitmproxy 能解密（或直接在本脚本里拿明文）；
 *   2) okhttp 全量请求/响应日志：把 App 发出的每个请求的 URL/Headers/Body 打到 console，
 *      从中找到「播放开始/进度心跳/播放完成」上报接口。
 *
 * 运行（平板需 root 且已启动 frida-server，PC 端 frida 版本匹配）：
 *   adb push frida-server /data/local/tmp/ && adb shell "chmod 755 /data/local/tmp/frida-server"
 *   adb shell "/data/local/tmp/frida-server &"
 *   frida -U -f <包名> -l capture/frida-hook-http.js     # 输出重定向留档：
 *   frida -U -f <包名> -l capture/frida-hook-http.js --runtime=v8 > capture.log 2>&1
 *
 * 在 App 里正常播放 3~5 集，然后 Ctrl+C，在 capture.log 里搜：
 *   play / report / stat / log / heart / progress / snssdk / fqnovel
 */
'use strict';

if (Java.available) {
  Java.perform(function () {
    var log = function (tag, msg) {
      console.log('[' + tag + '] ' + msg);
    };

    // ---------- 1. SSL unpinning（okhttp + 系统 Conscrypt） ----------
    function tryUnpin() {
      var tried = [];

      try {
        var Pinner = Java.use('okhttp3.CertificatePinner');
        Pinner.check.overload('java.lang.String', 'java.util.List').implementation = function (h, l) { return; };
        Pinner.check.overload('java.lang.String', 'java.security.cert.Certificate[]').implementation = function (h, c) { return; };
        // okhttp 4.x: check$okhttp
        var CheckSig = Java.registerClass ? null : null;
        tried.push('okhttp3.CertificatePinner');
      } catch (e) { tried.push('okhttp3.CertificatePinner(no)'); }

      try {
        var TMI = Java.use('com.android.org.conscrypt.TrustManagerImpl');
        TMI.verifyChain.implementation = function () {
          return this.getAcceptedIssuers();
        };
        tried.push('conscrypt TrustManagerImpl.verifyChain');
      } catch (e) { tried.push('conscrypt TrustManagerImpl(no)'); }

      ['checkServerTrusted'].forEach(function (m) {
        try {
          var X509 = Java.use('javax.net.ssl.X509TrustManager');
          X509[m].overload('[Ljava.security.cert.X509Certificate;', 'java.lang.String').implementation = function () { return; };
          tried.push('X509TrustManager.' + m);
        } catch (e) { /* version */ }
      });
      return tried;
    }

    var unpin = tryUnpin();
    log('unpin', unpin.join(' | '));

    // ---------- 2. okhttp 请求日志 ----------
    // 方案 A：hook Request.Builder.build 拿请求行/头/Body
    try {
      var ReqBuilder = Java.use('okhttp3.Request$Builder');
      ReqBuilder.build.implementation = function () {
        var req = this.build();
        try {
          var sb = [];
          sb.push(req.method() + ' ' + req.url());
          var hs = req.headers();
          for (var i = 0; i < hs.size(); i++) {
            sb.push(hs.name(i) + ': ' + hs.value(i));
          }
          var body = req.body();
          if (body !== null) {
            try {
              var okio = Java.use('okio.Buffer');
              var buf = okio.$new();
              body.writeTo(buf);
              var bs = buf.readUtf8();
              if (bs && bs.length > 0) sb.push('[BODY] ' + bs.slice(0, 2000));
            } catch (be) { sb.push('[BODY] (read fail ' + be + ')'); }
          }
          log('REQ', sb.join('\n    '));
        } catch (e) { log('REQ-ERR', String(e)); }
        return req;
      };
      log('hook', 'okhttp3.Request$Builder.build 已挂载');
    } catch (e) {
      log('hook', 'okhttp3.Request$Builder 未找到: ' + e);
    }

    // 方案 B：响应状态码（RealCall.getResponseWithInterceptorChain 返回值）
    try {
      var RealCall = Java.use('okhttp3.RealCall');
      RealCall.getResponseWithInterceptorChain.implementation = function () {
        var resp = this.getResponseWithInterceptorChain();
        try {
          log('RESP', resp.code() + ' <- ' + this.request().url());
        } catch (e) { /* */ }
        return resp;
      };
      log('hook', 'okhttp3.RealCall 已挂载');
    } catch (e) {
      log('hook', 'okhttp3.RealCall 未找到: ' + e);
    }

    // ---------- 3. 播放上报常见关键字过滤提示 ----------
    log('tip', '请现在在 App 内正常播放几集；结束后在本日志中搜索: play|report|stat|heart|progress|snssdk|fqnovel');
  });
} else {
  console.log('Java 不可用，跳过 hook');
}
