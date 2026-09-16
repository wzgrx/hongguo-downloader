'use strict';
function log(s) { console.log('[CS] ' + s); }
Java.perform(function () {
  log('capture-safe loaded ' + Date.now());
  var Base64 = Java.use('android.util.Base64');
  var SC = Java.use('com.bytedance.frameworks.baselib.network.http.cronet.impl.SsCronetHttpClient');
  SC.newSsCall.implementation = function (req) {
    try {
      var urlStr = '';
      var fields = [];
      var df = req.getClass().getDeclaredFields();
      for (var i = 0; i < df.length; i++) {
        try {
          df[i].setAccessible(true);
          var v = df[i].get(req);
          if (v === null) continue;
          var nm = df[i].getName();
          var sv = String(v);
          if (/https?:\/\//.test(sv) && sv.length > urlStr.length) urlStr = sv;
          if (/TypedByteArray/.test(v.getClass().getName())) {
            // 仅精确调用 getBytes() 读字节；失败则不输出（绝不遍历调方法）
            try {
              var gb = v.getClass().getMethod('getBytes');
              var b = gb.invoke(v);
              if (b !== null && b.getClass().isArray()) fields.push(nm + '_B64=' + Base64.encodeToString(b, 2).slice(0, 2000));
            } catch (be) { var em = String(be); if (em.length > 300) em = em.slice(0, 300); fields.push(nm + '=TB_ERR:' + em); }
          } else {
            if (nm === 'tags' || nm === 'headers') {
              if (/read_progress|read_history|app_log|multi_video|share/.test(sv)) fields.push(nm + '=' + sv.slice(0, 2600));
            } else {
              fields.push(nm + '=' + sv.slice(0, 900));
            }
          }
        } catch (fe) {}
      }
      if (/app_log|read_progress|read_history|multi_video_detail|multi_video_model|multi_share/.test(urlStr)) {
        log('===REQ===');
        log('URL|' + urlStr.slice(0, 220));
        fields.forEach(function (x) { log('F|' + x.slice(0, 2800)); });
        log('===END===');
      }
    } catch (e) { log('ERR ' + String(e).slice(0, 120)); }
    return this.newSsCall(req);
  };
  log('newSsCall safe-installed');
  try {
    var C = Java.use('com.ttnet.org.chromium.net.impl.CronetUrlRequestContext');
    var m = C.Q9q;
    if (m && m.overloads) m.overloads.forEach(function (ov) {
      ov.implementation = function () {
        try { var a0 = arguments[0]; if (typeof a0 === 'string' && /read_progress|read_history|app_log|multi_video|share|report/.test(a0)) log('URLQ|' + a0.slice(0, 240)); } catch (e) {}
        return ov.apply(this, arguments);
      };
    });
    log('Q9q installed');
  } catch (e) { log('q9q ERR ' + String(e).slice(0, 100)); }
});