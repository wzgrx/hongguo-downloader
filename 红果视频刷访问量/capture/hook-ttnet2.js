'use strict';
function log(s) { console.log('[TT] ' + s); }
var fac = null;
Java.perform(function () {
  log('ttnet hook v2 loaded');
  // 找含 TTNet cronet 的 ClassLoader → 建工厂
  try {
    Java.enumerateClassLoaders({
      onMatch: function (l) {
        if (fac) return;
        try {
          var t = Java.ClassFactory.get(l);
          t.use('com.ttnet.org.chromium.net.impl.CronetUrlRequestContext');
          fac = t;
          log('factory OK via ' + l);
        } catch (e) {}
      },
      onComplete: function () { log('factory search done, fac=' + (fac ? 'yes' : 'no')); }
    });
  } catch (e) { log('fac err ' + e); }
  // 用工厂挂 TTNet cronet 引擎
  if (fac) {
    ['com.ttnet.org.chromium.net.CronetEngine',
     'com.ttnet.org.chromium.net.impl.CronetUrlRequestContext'].forEach(function (cn) {
      try {
        var C = fac.use(cn);
        var m = C.newUrlRequestBuilder;
        if (m && m.overloads) {
          m.overloads.forEach(function (ov) {
            ov.implementation = function () {
              try {
                var a0 = arguments[0];
                log('TTNET ' + (typeof a0 === 'string' ? a0 : String(a0)));
              } catch (e) {}
              return ov.apply(this, arguments);
            };
          });
          log('engine hooked: ' + cn);
        } else log('no method in ' + cn);
      } catch (e) { log('engine err ' + cn + ' ' + e.toString().slice(0, 120)); }
    });
    ['com.ttnet.org.chromium.net.impl.CronetUrlRequest$Builder',
     'com.ttnet.org.chromium.net.UrlRequest$Builder'].forEach(function (bn) {
      try {
        var B = fac.use(bn);
        if (B.addHeader) { B.addHeader.implementation = function (k, v) { log('TH ' + k + ': ' + v); return this.addHeader(k, v); }; log('builder hooked: ' + bn); }
      } catch (e) {}
    });
    try {
      var CB = fac.use('com.ttnet.org.chromium.net.UrlRequest$Callback');
      if (CB.onResponseStarted) {
        CB.onResponseStarted.implementation = function (req, info) {
          try { log('TRESP ' + info.getUrl() + ' http=' + info.getHttpStatusCode()); } catch (e) {}
          return this.onResponseStarted(req, info);
        };
        log('callback hooked');
      }
    } catch (e) { log('cb err ' + e.toString().slice(0, 100)); }
  }
  // okhttp
  try { var RB = Java.use('okhttp3.Request$Builder'); RB.build.implementation = function () { var req = this.build(); log('OKHTTP ' + req.method() + ' ' + req.url()); return req; }; } catch (e) {}
});
try {
  var libc = Process.getModuleByName('libc.so');
  var gai = libc.getExportByName('getaddrinfo');
  if (gai) { Interceptor.attach(gai, { onEnter: function (args) { try { var h = args[0].isNull() ? '?' : args[0].readCString(); if (h && h.length < 130) log('RESOLVE ' + h); } catch (e) {} } }); log('gai hooked'); }
} catch (e) { log('gai err ' + e); }