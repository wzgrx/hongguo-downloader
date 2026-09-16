'use strict';
function log(s) { console.log('[TT] ' + s); }
Java.perform(function () {
  log('hook v3 loaded');
  // 反射枚举关键类方法
  ['com.ttnet.org.chromium.net.impl.CronetUrlRequestContext',
   'com.bytedance.frameworks.baselib.network.http.cronet.impl.SsCronetHttpClient',
   'com.bytedance.ttnet.HttpClient'].forEach(function (cn) {
    try {
      var C = Java.use(cn);
      var ms = C.class.getMethods();
      for (var i = 0; i < ms.length; i++) {
        var s = ms[i].toString();
        if (/newUrlRequest|build|execute|newCall|request|createRequest/i.test(s)) log('MM|' + cn + ' :: ' + s.slice(0, 180));
      }
    } catch (e) { log('mm err ' + cn + ' ' + e.toString().slice(0, 80)); }
  });
  // okhttp
  try { var RB = Java.use('okhttp3.Request$Builder'); RB.build.implementation = function () { var req = this.build(); log('OKHTTP ' + req.method() + ' ' + req.url()); return req; }; log('okhttp hooked'); } catch (e) {}
});
try {
  var libc = Process.getModuleByName('libc.so');
  var gai = libc.getExportByName('getaddrinfo');
  if (gai) { Interceptor.attach(gai, { onEnter: function (args) { try { var h = args[0].isNull() ? '?' : args[0].readCString(); if (h && h.length < 130) log('RESOLVE ' + h); } catch (e) {} } }); log('gai hooked'); }
} catch (e) { log('gai err ' + e); }