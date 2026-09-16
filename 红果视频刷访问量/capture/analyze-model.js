
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('capture/model_resp.json', 'utf8'));
const s = JSON.stringify(data);
console.log('total len', s.length);
// 1. URL 提取
const urls = s.match(/https?:\/\/[^"\\ ]+/g) || [];
const uniq = [...new Set(urls)];
console.log('URL count', uniq.length);
uniq.forEach(u => console.log('U|' + u.slice(0, 320)));
// 2. 上报相关 KEY 路径（值截断 240）
const seen = new Set();
function walk(o, path, depth) {
  if (!o || typeof o !== 'object' || depth > 9) return;
  if (Array.isArray(o)) return; // 不进数组
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (/report|heart|stat|track|view|progress|log|track|extra|pb/.test(k) && typeof v !== 'object') {
      const val = String(v);
      const key = path + '.' + k;
      if (!seen.has(key)) { seen.add(key); console.log('K|' + key + '|' + (val.length > 240 ? val.slice(0, 240) + '...(' + val.length + ')' : val)); }
    }
    if (v && typeof v === 'object') walk(v, path + '.' + k, depth + 1);
  }
}
walk(data, 'root', 0);
// 3. 结构摘要
function keysOf(o, label) {
  if (o && typeof o === 'object') console.log('KEYS|' + label + '|' + Object.keys(o).slice(0, 60).join(','));
}
const top = (data.data && (data.data.data || data.data)) || {};
keysOf(top, 'TOP');
const item = top['7645222653694856254'] || top.item || {};
keysOf(item, 'ITEM');
const vm = item.video_model || {};
keysOf(vm, 'VM');
const md = vm.main_data || {};
keysOf(md, 'MD');
if (md.url_list) console.log('MD.url_list count', md.url_list.length, 'first:', JSON.stringify(md.url_list[0]).slice(0, 200));
// 4. 可选上报 URL 字段逐一细看
['log_pb', 'log_extra', 'report_pb', 'report_url', 'track_url', 'preload_url', 'play_extra', 'stream_log'].forEach(f => {
  if (Object.prototype.hasOwnProperty.call(md, f)) {
    const v = JSON.stringify(md[f]);
    console.log('MD.' + f + ' =', v.length > 500 ? v.slice(0, 500) + '...' : v);
  }
});
