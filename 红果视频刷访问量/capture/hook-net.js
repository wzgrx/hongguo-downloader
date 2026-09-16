'use strict';
function log(s) { console.log('[NET] ' + s); }
Java.perform(function () {
  log('hook-net v5 loaded');
  try {
    var ReqBuilder = Java.use('okhttp3.Request$Builder');
    ReqBuilder.build.implementation = function () {
      var req = this.build();
      try {
        log('OKHTTP ' + req.method() + ' ' + req.url());
        var body = '';
        try { var b = req.body(); if (b) { var ob = Java.use('okio.Buffer').$new(); b.writeTo(ob); body = ob.readUtf8().slice(0, 1200); } } catch (be) {}
        if (body) log('  B ' + body);
      } catch (e) {}
      return req;
    };
    log('okhttp hooked');
  } catch (e) {}
  ['android.net.connectivity.org.chromium.net.impl.CronetUrlRequestContext',
   'android.net.http.CronetEngineWrapper',
   'org.chromium.net.impl.CronetUrlRequestContext',
   'org.chromium.net.CronetUrlRequestContext'].forEach(function (cn) {
    try {
      var Ctx = Java.use(cn);
      Ctx.newUrlRequestBuilder.implementation = function (url, cb, ex) { log('CRONET ' + url); return this.newUrlRequestBuilder(url, cb, ex); };
      log('ctx hooked: ' + cn);
    } catch (e) {}
  });
});
// ---- native TLS 明文抓取（所有 SSL 库） ----
try {
  var mods = Process.enumerateModules();
  var targets = mods.filter(function (m) { return /ssl|cronet|ttnet|nework|libr3|quic|boringssl/i.test(m.name); });
  log('SSL modules: ' + targets.map(function (m) { return m.name; }).join(','));
  targets.forEach(function (m) {
    ['SSL_write', 'SSL_read'].forEach(function (fn) {
      try {
        var addr = Module.findExportByName(m.name, fn);
        if (addr) {
          Interceptor.attach(addr, {
            onEnter: function (args) {
              var len = args[2].toInt32();
              if (len <= 0 || len > 90000) return;
              try {
                var s = args[1].readUtf8String(Math.min(len, 220));
                if (s && /(GET |POST |PUT |HEAD |HTTP\/1\.|\{"|fqnovel|snssdk|qznovelvod|play|report|stat|heartbeat)/i.test(s)) {
                  log('TLS-' + fn + '[' + m.name + '] ' + s.split(/\r?\n/).slice(0, 2).join(' | '));
                }
              } catch (e) {}
            }
          });
          log('tls hook: ' + m.name + ' ' + fn);
        }
      } catch (e) {}
    });
  });
} catch (e) { log('native err: ' + e); }