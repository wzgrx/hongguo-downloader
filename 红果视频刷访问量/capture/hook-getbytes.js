'use strict';
function log(s) { console.log('[GB] ' + s); }
Java.perform(function () {
  log('getBytes probe loaded');
  var Base64 = Java.use('android.util.Base64');
  var SC = Java.use('com.bytedance.frameworks.baselib.network.http.cronet.impl.SsCronetHttpClient');
  SC.newSsCall.implementation = function (req) {
    try {
      var urlStr = ''; var bodyObj = null;
      var df = req.getClass().getDeclaredFields();
      for (var i = 0; i < df.length; i++) {
        try { df[i].setAccessible(true); var v = df[i].get(req);
          if (v === null) continue; var sv = String(v);
          if (/https?:\/\//.test(sv) && sv.length > urlStr.length) urlStr = sv;
          if (/TypedByteArray/.test(v.getClass().getName())) bodyObj = v;
        } catch (fe) {}
      }
      if (/app_log/.test(urlStr) && bodyObj !== null) {
        try {
          var m = bodyObj.getClass().getMethod('getBytes');
          var b = m.invoke(bodyObj);
          if (b !== null && b.getClass().isArray()) {
            log('OK_LEN=' + b.length);
            log('OK_B64=' + Base64.encodeToString(b, 2).slice(0, 500));
          } else log('NON_ARRAY');
        } catch (e) {
          log('ERR ' + e);
          log('CAUSE ' + (e.getCause ? e.getCause() : 'none'));
        }
      }
    } catch (e) { log('OUTER ' + String(e).slice(0, 100)); }
    return this.newSsCall(req);
  };
  log('probe installed');
});