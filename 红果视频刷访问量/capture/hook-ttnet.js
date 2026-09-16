'use strict';
function log(s) { console.log('[TT] ' + s); }
Java.perform(function () {
  log('ttnet hook v1 loaded');
  ['com.ttnet.org.chromium.net.impl.CronetUrlRequestContext',
   'com.ttnet.org.chromium.net.CronetEngineBase',
   'com.bytedance.frameworks.baselib.network.http.cronet.impl.SsCronetHttpClient'].forEach(function (cn) {
    try {
      var C = Java.use(cn);
      var m = C.newUrlRequestBuilder;
      if (m) {
        m.overloads.forEach(function (ov) {
          ov.implementation = function () {
            try {
              var a0 = arguments[0];
              if (typeof a0 === 'string') log('TTNET ' + a0);
              else log('TTNET [' + cn + '] arg0=' + String(a0));
            } catch (e) {}
            return ov.apply(this, arguments);
          };
        });
        log('ctx hooked: ' + cn);
      } else log('no newUrlRequestBuilder in ' + cn);
    } catch (e) { log('ctx err ' + cn + ' ' + e); }
  });
  // builder addHeader（TTNet fork）
  ['com.ttnet.org.chromium.net.impl.CronetUrlRequest$Builder',
   'com.ttnet.org.chromium.net.UrlRequest$Builder'].forEach(function (bn) {
    try {
      var B = Java.use(bn);
      if (B.addHeader) {
        B.addHeader.implementation = function (k, v) { log('TH ' + k + ': ' + v); return this.addHeader(k, v); };
        log('builder hooked: ' + bn);
      }
    } catch (e) {}
  });
  // 响应回调
  try {
    var CB = Java.use('com.ttnet.org.chromium.net.UrlRequest$Callback');
    if (CB.onResponseStarted) {
      CB.onResponseStarted.implementation = function (req, info) {
        try { log('TRESP ' + info.getUrl() + ' http=' + info.getHttpStatusCode()); } catch (e) {}
        return this.onResponseStarted(req, info);
      };
      log('callback hooked');
    }
  } catch (e) { log('cb err ' + e); }
  // okhttp
  try {
    var RB = Java.use('okhttp3.Request$Builder');
    RB.build.implementation = function () { var req = this.build(); log('OKHTTP ' + req.method() + ' ' + req.url()); return req; };
  } catch (e) {}
});
// getaddrinfo
try {
  var libc = Process.getModuleByName('libc.so');
  var gai = libc.getExportByName('getaddrinfo');
  if (gai) {
    Interceptor.attach(gai, {
      onEnter: function (args) {
        try { var h = args[0].isNull() ? '?' : args[0].readCString(); if (h && h.length < 130) log('RESOLVE ' + h); } catch (e) {}
      }
    });
    log('gai hooked');
  }
} catch (e) { log('gai err ' + e); }