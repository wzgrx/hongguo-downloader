'use strict';
function log(s) { console.log('[INV] ' + s); }
function ser(v, depth) {
  try {
    if (v === null || v === undefined) return 'null';
    if (depth > 4) return '...';
    var t = v.getClass ? v.getClass().getName() : typeof v;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v instanceof java.util.Map) {
      var it = v.entrySet().iterator(); var out = '{'; var c = 0;
      while (it.hasNext() && c < 20) { var e = it.next();
        out += String(e.getKey()) + '=' + ser(e.getValue(), depth + 1) + ', '; c++; }
      return out + '}';
    }
    if (v instanceof java.util.List) {
      var out = '['; for (var i = 0; i < v.size() && i < 10; i++) out += ser(v.get(i), depth + 1) + ', '; return out + ']';
    }
    // object: reflect fields
    var cls = v.getClass(); var fields = cls.getDeclaredFields(); var out = '{'; var c = 0;
    for (var f = 0; f < fields.length && c < 12; f++) {
      try { fields[f].setAccessible(true); var fv = fields[f].get(v); if (fv === null) continue;
        out += fields[f].getName() + '=' + ser(fv, depth + 1) + ', '; c++; } catch (fe) {}
    }
    return out + '}';
  } catch (e) { return '??'; }
}
Java.perform(function () {
  log('args hook loaded');
  try {
    var Inv = Java.use('com.bytedance.retrofit2.Invocation');
    Inv.$init.overloads.forEach(function (ov) {
      ov.implementation = function () {
        try {
          var meth = arguments[0];
          var argsArr = arguments[1];
          var mstr = meth ? String(meth) : '?';
          if (argsArr && argsArr.length > 0 && /INetworkApi/i.test(mstr)) {
            log('M|' + mstr.slice(0, 200));
            for (var i = 0; i < argsArr.length; i++) {
              var s = ser(argsArr[i], 0);
              if (s.length > 900) s = s.slice(0, 900);
              log('A' + i + '|' + s);
            }
            log('END');
          }
        } catch (e) { log('err ' + String(e).slice(0, 100)); }
        return ov.apply(this, arguments);
      };
    });
    log('Invocation args hooked');
  } catch (e) { log('Inv err ' + String(e).slice(0, 150)); }
});