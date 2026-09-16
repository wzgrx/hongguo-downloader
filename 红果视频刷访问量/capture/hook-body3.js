'use strict';
function log(s) { console.log('[B3] ' + s); }
Java.perform(function () {
  log('body3 loaded');
  var SC = Java.use('com.bytedance.frameworks.baselib.network.http.cronet.impl.SsCronetHttpClient');
  var Base64 = Java.use('android.util.Base64');
  SC.newSsCall.implementation = function (req) {
    try {
      var cls = req.getClass();
      var fields = cls.getDeclaredFields();
      var urlStr = '';
      var interesting = [];
      for (var i = 0; i < fields.length; i++) {
        try {
          fields[i].setAccessible(true);
          var v = fields[i].get(req);
          if (v === null) continue;
          var nm = fields[i].getName();
          var sv = String(v);
          if (/\/\//.test(sv) && sv.length > urlStr.length) urlStr = sv;
          // TypedByteArray -> bytes
          if (/TypedByteArray/.test(v.getClass().getName())) {
            try {
              var m2 = v.getClass().getMethod('getBytes');
              var bytes = m2.invoke(v);
              var b64 = Base64.encodeToString(bytes, 2);
              interesting.push(nm + '_B64=' + b64.slice(0, 1200));
            } catch (be) { interesting.push(nm + '=BYTES_UNREADABLE'); }
          } else {
            interesting.push(nm + '=' + (sv.length > 1500 ? sv.slice(0, 1500) : sv));
          }
        } catch (fe) {}
      }
      if (/app_log|read_progress|read_history|multi_video_detail|multi_video_model/.test(urlStr)) {
        log('=== REQ ' + urlStr.slice(0, 200) + ' ===');
        interesting.forEach(function (x) { log('F|' + x.slice(0, 1700)); });
        log('END');
      }
    } catch (e) { log('err ' + String(e).slice(0, 100)); }
    return this.newSsCall(req);
  };
  log('body3 installed');
});