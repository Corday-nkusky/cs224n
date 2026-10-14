/* 统计各段正文字数 —— 只读，不修改任何东西。跑法：node tools/_stat.js */
global.window = global;
global.katex = require('../vendor/katex/katex.min.js');
global.markdownit = require('../vendor/markdown-it.min.js');
require('../data/courses.js');
require('../js/core/k01_core.js');
require('../js/ui/util.js');
require('../js/ui/md.js');
require('../data/k01.js');

var CH = global.KB.chapters.k01;
function textOf(b) {
  var out = [];
  function push(x) { if (typeof x === 'string') out.push(x); }
  ['md', 'title', 'text', 'q', 'alt', 'intro', 'tag', 'note', 'source', 'before'].forEach(function (k) { push(b[k]); });
  ['covers', 'after'].forEach(function (k) { (b[k] || []).forEach(push); });
  (b.items || []).forEach(push);
  (b.head || []).forEach(push);
  (b.rows || []).forEach(function (r) { r.forEach(push); });
  (b.parts || []).forEach(function (p) { push(p.label); push(p.note); });
  return out.join('');
}
var grand = 0;
CH.sections.forEach(function (s) {
  var n = 0;
  s.blocks.forEach(function (b) { n += textOf(b).length; });
  grand += n;
  console.log('段 ' + s.num + '  ' + s.id.padEnd(10) + String(s.blocks.length).padStart(3) + ' 块  ' + String(n).padStart(6) + ' 字');
});
console.log('---- 10 段合计 ' + grand + ' 字 ----');
var quiz = CH.quiz.map(function (q) { return (q.q || '') + (q.explain || '') + (q.points || []).join('') + (q.options || []).join(''); }).join('');
console.log('Quiz ' + quiz.length + ' 字 ／ 术语表 ' + CH.glossary.map(function (g) { return g.join(''); }).join('').length + ' 字');
