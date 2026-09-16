'use strict';
console.log('RUNTIME=' + (typeof Script !== 'undefined' ? Script.runtime : 'none'));
console.log('Java=' + (typeof Java));
console.log('frida ver=' + frida.version);
if (typeof Java !== 'undefined') { console.log('Java.available=' + Java.available); }
console.log('Module ok: ' + (typeof Module !== 'undefined' ? Module.findBaseAddress('libc.so') : 'none'));