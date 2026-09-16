'use strict';
function log(s) { console.log('[MN] ' + s); }
Java.perform(function () {
  log('method-name probe loaded');
  var SC = Java.use('com.bytedance.frameworks.baselib.network.http.cronet.impl.SsCronetHttpClient');
  SC.newSsCall.implementation = function (req) {
    try {
      var urlStr = '';
      var bodyObj = null;
      var df = req.getClass().getDeclaredFields();
      for (var i = 0; i < df.length; i++) {
        try {
          df[i].setAccessible(true);
          var v = df[i].get(req);
          if (v === null) continue;
          var sv = String(v);
          if (/https?:\/\//.test(sv) && sv.length > urlStr.length) urlStr = sv;
          if (/TypedByteArray/.test(v.getClass().getName())) bodyObj = v;
        } catch (fe) {}
      }
      if (/app_log|read_progress|read_history|multi_video/.test(urlStr) && bodyObj !== null) {
        // 只枚举方法名，绝不调用
        var mm = bodyObj.getClass().getMethods();
        var names = [];
        for (var mi = 0; mi < mm.length; mi++) {
          var n = mm[mi].getName();
          if (/byte|data|body|content|read|obtain|value|get/i.test(n) && mm[mi].getParameterTypes().length === 0) names.push(n);
        }
        log('CLS|' + bodyObj.getClass().getName());
        log('METHODS|' + names.join(','));
      }
    } catch (e) { log('ERR ' + String(e).slice(0, 100)); }
    return this.newSsCall(req);
  };
  log('probe installed');
});