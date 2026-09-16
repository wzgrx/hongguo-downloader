'use strict';
console.log('RUNTIME=' + (typeof Script !== 'undefined' ? Script.runtime : 'none'));
console.log('Java=' + (typeof Java));
console.log('Module=' + (typeof Module));
console.log('Interceptor=' + (typeof Interceptor));
console.log('Process=' + (typeof Process));
if (typeof Java !== 'undefined') {
  console.log('Java.available=' + Java.available);
  Java.perform(function(){ console.log('JAVA_PERFORM_OK'); });
}