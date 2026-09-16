'use strict';
function log(s) { console.log('[TT] ' + s); }
Java.perform(function () {
  log('q9q hook loaded');
  try {
    var C = Java.use('com.ttnet.org.chromium.net.impl.CronetUrlRequestContext');
    var m = C.Q9q;
    if (m && m.overloads) {
      m.overloads.forEach(function (ov) {
        ov.implementation = function () {
          try { var a0 = arguments[0]; if (typeof a0 === 'string') log('URLQ|' + a0.slice(0, 500)); } catch (e) {}
          return ov.apply(this, arguments);
        };
      });
      log('Q9q hooked ov=' + m.overloads.length);
    } else log('Q9q missing');
  } catch (e) { log('Q9q err ' + String(e).slice(0, 130)); }
  try {
    var SC = Java.use('com.bytedance.frameworks.baselib.network.http.cronet.impl.SsCronetHttpClient');
    if (SC.newSsCall) {
      SC.newSsCall.implementation = function (req) {
        try { log('SSCALL|' + req.url() + ' M=' + req.method()); } catch (e) { log('SSCALL-ERR ' + String(e).slice(0, 70)); }
        return this.newSsCall(req);
      };
      log('newSsCall hooked');
    }
    if (SC.openConnection && SC.openConnection.overloads) {
      SC.openConnection.overloads.forEach(function (ov) {
        ov.implementation = function () {
          try { var a0 = arguments[0]; if (typeof a0 === 'string') log('OPENCONN|' + a0.slice(0, 500)); } catch (e) {}
          return ov.apply(this, arguments);
        };
      });
      log('openConnection hooked');
    }
  } catch (e) { log('SC err ' + String(e).slice(0, 130)); }
  try {
    var C2 = Java.use('com.ttnet.org.chromium.net.impl.CronetUrlRequestContext');
    if (C2.onRequestInterceptorToStart) {
      C2.onRequestInterceptorToStart.implementation = function (u, h1, h2) {
        try { if (u) log('INTERCEPT|' + String(u).slice(0, 500)); } catch (e) {}
        return this.onRequestInterceptorToStart(u, h1, h2);
      };
      log('interceptor hooked');
    }
  } catch (e) { log('int err ' + String(e).slice(0, 100)); }
  try { var RB = Java.use('okhttp3.Request$Builder'); RB.build.implementation = function () { var req = this.build(); log('OKHTTP ' + req.method() + ' ' + req.url()); return req; }; } catch (e) {}
});
try {
  var libc = Process.getModuleByName('libc.so');
  var gai = libc.getExportByName('getaddrinfo');
  if (gai) { Interceptor.attach(gai, { onEnter: function (args) { try { var h = args[0].isNull() ? '?' : args[0].readCString(); if (h && h.length < 130) log('RESOLVE ' + h); } catch (e) {} } }); log('gai hooked'); }
} catch (e) { log('gai err ' + e); }