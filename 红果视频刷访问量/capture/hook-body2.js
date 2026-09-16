'use strict';
function log(s) { console.log('[BD2] ' + s); }
Java.perform(function () {
  log('body2 loaded');
  try {
    var SC = Java.use('com.bytedance.frameworks.baselib.network.http.cronet.impl.SsCronetHttpClient');
    SC.newSsCall.implementation = function (req) {
      try {
        var cls = req.getClass();
        var fields = cls.getDeclaredFields();
        var urlStr = '';
        var vals = [];
        for (var i = 0; i < fields.length; i++) {
          try {
            fields[i].setAccessible(true);
            var v = fields[i].get(req);
            if (v !== null) {
              var sv = String(v);
              if (/https?:\/\//.test(sv) && /reading\.snssdk|fqnovel|app_log/.test(sv) && sv.length > urlStr.length) urlStr = sv;
              vals.push(fields[i].getName() + '=' + (sv.length > 700 ? sv.slice(0, 700) : sv));
            }
          } catch (fe) {}
        }
        if (/app_log|read_progress|read_history|bookmall\/cell|multi_share/.test(urlStr)) {
          log('=== REQ ' + urlStr.slice(0, 160) + ' ===');
          vals.forEach(function (x) { log('F|' + x.slice(0, 800)); });
          log('END');
        }
      } catch (e) { log('err ' + String(e).slice(0, 100)); }
      return this.newSsCall(req);
    };
    log('newSsCall body2 installed');
  } catch (e) { log('SC err ' + String(e).slice(0, 150)); }
  try {
    var OK = Java.use('okhttp3.Request$Builder');
    OK.build.implementation = function () {
      try {
        var u = this.url();
        if (u && /app_log|read_progress|read_history|bookmall|multi_share/.test(String(u))) {
          log('OKHTTP|' + String(u).slice(0, 200));
        }
      } catch (e) {}
      return OK.build.call(this);
    };
    log('okhttp hooked');
  } catch (e) { log('ok err ' + String(e).slice(0, 100)); }
});