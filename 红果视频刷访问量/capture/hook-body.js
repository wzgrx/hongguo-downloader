'use strict';
function log(s) { console.log('[BD] ' + s); }
Java.perform(function () {
  log('body hook loaded');
  try {
    var SC = Java.use('com.bytedance.frameworks.baselib.network.http.cronet.impl.SsCronetHttpClient');
    SC.newSsCall.implementation = function (req) {
      try {
        var cls = req.getClass();
        var fields = cls.getDeclaredFields();
        var interesting = [];
        for (var i = 0; i < fields.length; i++) {
          try {
            fields[i].setAccessible(true);
            var v = fields[i].get(req);
            var nm = fields[i].getName();
            if (v !== null) {
              var sv = String(v);
              if (sv.length > 500) sv = sv.slice(0, 500);
              if (/read_progress|read_history|app_log|multi_video|bookmall|comment/.test(sv)) interesting.push(nm + '=' + sv);
            }
          } catch (fe) {}
        }
        if (interesting.length) {
          log('=== REQ ===');
          interesting.forEach(function (x) { log('RF|' + x.slice(0, 460)); });
        }
      } catch (e) { log('dump err ' + String(e).slice(0, 100)); }
      return this.newSsCall(req);
    };
    log('newSsCall body-hook installed');
  } catch (e) { log('SC err ' + String(e).slice(0, 120)); }
  try {
    var C = Java.use('com.ttnet.org.chromium.net.impl.CronetUrlRequestContext');
    var m = C.Q9q;
    if (m && m.overloads) {
      m.overloads.forEach(function (ov) {
        ov.implementation = function () {
          try { var a0 = arguments[0]; if (typeof a0 === 'string') log('URLQ|' + a0.slice(0, 240)); } catch (e) {}
          return ov.apply(this, arguments);
        };
      });
      log('Q9q hooked');
    }
  } catch (e) { log('q9q err ' + String(e).slice(0, 100)); }
});