'use strict';
function log(s) { console.log('[INV] ' + s); }
Java.perform(function () {
  log('invocation hook loaded');
  try {
    var Inv = Java.use('com.bytedance.retrofit2.Invocation');
    Inv.$init.overloads.forEach(function (ov) {
      ov.implementation = function () {
        try {
          var meth = arguments[0];
          var argsArr = arguments[1];
          var mstr = meth ? String(meth) : '?';
          if (/read_progress|read_history|share|search|detail|model|preload|progress|report|feed|recommend|play/i.test(mstr)) {
            log('=== INVOCATION ===');
            log('METH|' + mstr.slice(0, 260));
            if (argsArr) {
              for (var i = 0; i < argsArr.length; i++) {
                try {
                  var v = argsArr[i];
                  if (v !== null && v !== undefined) {
                    var s = String(v);
                    if (s.length > 500) s = s.slice(0, 500);
                    log('ARG' + i + '|' + s);
                  }
                } catch (ae) {}
              }
            }
          }
        } catch (e) { log('inv err ' + String(e).slice(0, 100)); }
        return ov.apply(this, arguments);
      };
    });
    log('Invocation hooked: ' + Inv.$init.overloads.length);
  } catch (e) { log('Inv err ' + String(e).slice(0, 150)); }
  try {
    var C = Java.use('com.ttnet.org.chromium.net.impl.CronetUrlRequestContext');
    var m = C.Q9q;
    if (m && m.overloads) m.overloads.forEach(function (ov) {
      ov.implementation = function () {
        try { var a0 = arguments[0]; if (typeof a0 === 'string' && /read_progress|read_history|share|search|detail|model|heartbeat|report/.test(a0)) log('URLQ|' + a0.slice(0, 200)); } catch (e) {}
        return ov.apply(this, arguments);
      };
    });
    log('Q9q hooked');
  } catch (e) { log('q9q err ' + String(e).slice(0, 100)); }
});