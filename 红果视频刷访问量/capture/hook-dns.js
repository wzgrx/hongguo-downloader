'use strict';
function log(s) { console.log('[DNS] ' + s); }
['getaddrinfo', 'android_getaddrinfo'].forEach(function (fn) {
  try {
    var addr = Module.findExportByName(null, fn);
    if (addr) {
      Interceptor.attach(addr, {
        onEnter: function (args) {
          try { var h = args[0].isNull() ? '?' : args[0].readCString(); if (h && h.length < 128) log('RESOLVE ' + h); } catch (e) {}
        }
      });
      log('hooked ' + fn + ' @ ' + addr);
    }
  } catch (e) {}
});
// 也监听 TCP connect 目标（含 IP:port 流量去向）
try {
  var conn = Module.findExportByName(null, 'connect');
  if (conn) {
    Interceptor.attach(conn, {
      onEnter: function (args) {
        try {
          var sa = args[1];
          var fam = sa.readU16();
          if (fam === 2) {
            var port = (sa.add(2).readU8() << 8) | sa.add(3).readU8();
            var ip = (sa.add(4).readU8()) + '.' + (sa.add(5).readU8()) + '.' + (sa.add(6).readU8()) + '.' + (sa.add(7).readU8());
            log('CONNECT ' + ip + ':' + port);
          }
        } catch (e) {}
      }
    });
    log('hooked connect');
  }
} catch (e) { log('connect err ' + e); }