'use strict';
function log(s) { console.log('[ENUM] ' + s); }
Java.perform(function () {
  log('enum hook loaded');
  try {
    var all = Java.enumerateLoadedClassesSync();
    log('total classes: ' + all.length);
    var hits = all.filter(function (c) { return /ttnet|retrofit|netbean|dragon.*network|NetworkApi/i.test(c) && c.indexOf('$') < 0; });
    log('ttnet/retrofit classes: ' + hits.length);
    hits.slice(0, 60).forEach(function (c) { log('CLS|' + c); });
    // 也找请求构建/回调类
    var req = all.filter(function (c) { return /Request.*Wrapper|ApiRequest|HttpClient|IRequest/i.test(c); });
    log('req classes: ' + req.length);
    req.slice(0, 40).forEach(function (c) { log('RCLS|' + c); });
  } catch (e) { log('enum err: ' + e); }
  try { log('I_TYPE=' + typeof Interceptor + ' A_TYPE=' + (typeof Interceptor !== 'undefined' ? typeof Interceptor.attach : 'n/a')); } catch (e) { log('itype err ' + e); }
  // getaddrinfo：显式 libc 导出 + 分段 try
  try {
    var libc = Process.getModuleByName('libc.so');
    var gai = libc.getExportByName('getaddrinfo');
    log('gai addr: ' + gai);
    if (gai) {
      Interceptor.attach(gai, {
        onEnter: function (args) {
          try {
            var h = args[0].isNull() ? '?' : args[0].readCString();
            if (h && h.length < 130) log('RESOLVE ' + h);
          } catch (e) {}
        }
      });
      log('gai hooked OK');
    } else { log('gai not exported'); }
  } catch (e) { log('gai hook err: ' + e); }
  // 补 okhttp 最小钩子
  try {
    var RB = Java.use('okhttp3.Request$Builder');
    RB.build.implementation = function () { var req = this.build(); log('OKHTTP ' + req.method() + ' ' + req.url()); return req; };
    log('okhttp hooked');
  } catch (e) { log('okhttp nf'); }
});