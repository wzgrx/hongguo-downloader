'use strict';
function log(s) { console.log('[CAP] ' + s); }
Java.perform(function () {
  log('final capture loaded at ' + Date.now());
  var Base64 = Java.use('android.util.Base64');
  var SC = Java.use('com.bytedance.frameworks.baselib.network.http.cronet.impl.SsCronetHttpClient');
  SC.newSsCall.implementation = function (req) {
    try {
      var cls = req.getClass();
      var urlStr = '';
      var fields = [];
      var df = cls.getDeclaredFields();
      for (var i = 0; i < df.length; i++) {
        try {
          df[i].setAccessible(true);
          var v = df[i].get(req);
          if (v === null) continue;
          var nm = df[i].getName();
          var sv = String(v);
          if (/https?:\/\//.test(sv) && sv.length > urlStr.length) urlStr = sv;
          var vcls = v.getClass().getName();
          if (/TypedByteArray|BytesBody|byte\[\]/.test(vcls)) {
            // 动态枚举能返回 byte[] 的无参方法
            var mm = v.getClass().getMethods();
            var captured = false;
            for (var mi = 0; mi < mm.length; mi++) {
              var mn = mm[mi].getName();
              if (mm[mi].getParameterTypes().length === 0 && /byte|body|content|data|getBytes|obtain/i.test(mn)) {
                try {
                  var b = mm[mi].invoke(v);
                  if (b !== null && b.getClass().isArray() && b.getClass().getComponentType().getName() === 'byte') {
                    fields.push(nm + '_B64_' + mn + '=' + Base64.encodeToString(b, 2).slice(0, 3000));
                    fields.push(nm + '_LEN_' + mn + '=' + b.length);
                    captured = true;
                  }
                } catch (ie) {}
              }
            }
            if (!captured) fields.push(nm + '=' + vcls.substring(vcls.lastIndexOf('.') + 1) + '[' + sv + ']');
          } else {
            if (nm === 'tags' || nm === 'headers') {
              if (/ICommonApi|RetrofitApi|read_progress|read_history|app_log|multi_video|share/.test(sv)) fields.push(nm + '=' + sv.slice(0, 2200));
            } else {
              fields.push(nm + '=' + sv.slice(0, 1200));
            }
          }
        } catch (fe) {}
      }
      if (/app_log|read_progress|read_history|multi_video|share|bookmall\/cell/.test(urlStr)) {
        log('===REQ===');
        log('URL|' + urlStr.slice(0, 250));
        fields.forEach(function (x) { log('F|' + x.slice(0, 3200)); });
        log('===END===');
      }
    } catch (e) { log('ERR ' + String(e).slice(0, 120)); }
    return this.newSsCall(req);
  };
  log('newSsCall installed');
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