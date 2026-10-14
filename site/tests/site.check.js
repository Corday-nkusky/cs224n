/* ============================================================
 * site.check.js —— 结构与公式校验（Node，零依赖）
 * ------------------------------------------------------------
 * 检查这些事，任何一条不过就 exit 1：
 *   1. index.html 引用的本地文件都存在
 *   2. 每章 10 个环节都不为空、块类型合法、交互模块都已注册
 *   2b. 正文里没有任何"去别处读原文"的指针（md 讲义那条轨已退役）
 *   2b2. 每段都有导读卡、第 1 段有本课地图
 *   2b3. 每段正文有体量下限（防止内容被"顺手精简"回要点列表）
 *   2b4. 交互面板的两条呈现契约（填充条要 display:block / 品牌区要真链接）
 *   3. Quiz 答案索引合法、数值题能算出有限值、开放题有答案要点
 *   4. 所有文本里的 $...$ / $$...$$ 都能用本地 KaTeX 渲染（throwOnError: true）
 *   4b. latex 反斜杠纪律：raw 模板里不许出现 \\（会被 LaTeX 读成换行，且 KaTeX 不报错）
 *   4c. latex 反斜杠纪律：含 $ 的单引号串里不许出现单反斜杠（会被 JS 吃掉，KaTeX 也不报错）
 *   5. 关键数字与 logs 里的实测值一致（"每个数字都要能复现"）
 *   6. 公式逐项高亮的标记与 parts 对得上（不跳号、不超出 p1..p3、回退项逐个点名）
 *
 * 跑法：node site/tests/site.check.js
 *
 * ⚠️ 这里是**静态**检查：只在 Node 里读数据，**从不执行 js/ui/app.js**。
 *    所以 app.js 里写错一个括号（页面白屏）它照样能全绿。
 *    「页面真的能开、按钮真的能点」由 tests/smoke.mjs 用真实 Chrome 覆盖（见 README）。
 * ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');

const SITE = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
const notes = [];

function ok(cond, name, detail) {
  // 防呆：断言条件必须是严格布尔。写反参数（把说明当条件传）会让断言空转，
  // 空转的断言比没有断言更糟 —— 直接抓出来。
  if (typeof cond !== 'boolean') {
    fail++;
    failures.push('[断言参数写反] ' + String(name).slice(0, 60) + '  cond 类型=' + typeof cond);
    console.log('  \u2717 [断言参数写反] ' + String(name).slice(0, 60));
    return;
  }
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); console.log('  \u2717 ' + name + (detail ? '  → ' + detail : '')); }
}
function note(msg) { notes.push(msg); console.log('  \u2139 ' + msg); }
function section(t) { console.log('\n' + t); }
function rel(p) { return path.relative(SITE, p).split(path.sep).join('/'); }

/* ---------- 0. 装出浏览器环境（只装数据与纯函数要用的那几个全局） ---------- */
global.window = global;
global.katex = require(path.join(SITE, 'vendor', 'katex', 'katex.min.js'));
global.markdownit = require(path.join(SITE, 'vendor', 'markdown-it.min.js'));

// courses.js（课程注册表）要在任何 data/kNN.js 之前加载 —— 和 index.html 里的顺序一致
require(path.join(SITE, 'data', 'courses.js'));
require(path.join(SITE, 'js', 'core', 'k01_core.js'));
require(path.join(SITE, 'js', 'core', 'a1_core.js'));
require(path.join(SITE, 'js', 'ui', 'util.js'));
require(path.join(SITE, 'js', 'ui', 'md.js'));
require(path.join(SITE, 'data', 'k01.js'));
require(path.join(SITE, 'data', 'a1.js'));
require(path.join(SITE, 'data', 'freq.js'));
// viz-kit 要在任何 js/viz/*.js 之前：那些文件一加载就向它注册自己
require(path.join(SITE, 'js', 'ui', 'viz-kit.js'));
require(path.join(SITE, 'js', 'viz', 'k01_viz.js'));
require(path.join(SITE, 'js', 'viz', 'a1_viz.js'));

const KB = global.KB;
const C = KB.core.k01;
const C1 = KB.core.a1;
const CH = KB.chapters.k01;
const CH1 = KB.chapters.a1;
const F = KB.freq.imdb2000;

/* ============================================================
 * 0.5 课程注册表（多课程的入口）
 * ------------------------------------------------------------
 * 这一节是 2026-10-07 加的。起因：courses.js 的 IIFE 忘了传参，
 * 于是 KB.courses / firstReadyCourse / courseReady 全都没定义，
 * 而当时没有任何一条断言能发现 —— 因为本文件根本没 require 它。
 * ============================================================ */
section('0.5 课程注册表');
{
  ok(Array.isArray(KB.courses) && KB.courses.length > 0,
    'KB.courses 已导出且非空', `${(KB.courses || []).length} 门`);
  ok(typeof KB.firstReadyCourse === 'function',
    'KB.firstReadyCourse 是函数（首页/非课程页靠它决定兜底课程）');
  ok(typeof KB.courseReady === 'function',
    'KB.courseReady 是函数（灰卡与已开工的判定依据）');

  const ids = (KB.courses || []).map((c) => c.id);
  ok(new Set(ids).size === ids.length, '课程 id 不重复', ids.join(' '));
  ok((KB.courses || []).every((c) => c.id && c.no && c.title),
    '每门课都有 id / no / title 三件套');
  ok(KB.firstReadyCourse() === 'k01',
    'firstReadyCourse() 落到第一门已开工的课', KB.firstReadyCourse());

  // 反向约束：加载了数据却在注册表里没登记 ⇒ 首页看不到它，是最难发现的那种错
  const loaded = Object.keys(KB.chapters || {});
  const missing = loaded.filter((id) => ids.indexOf(id) < 0);
  ok(missing.length === 0,
    '每门已加载数据的课都在注册表里登记了（否则首页看不到它）',
    missing.length ? '漏登记：' + missing.join(' ') : loaded.join(' ') + ' 均已登记');

  // 反向约束：登记了但没数据 ⇒ 会被当成未开工的灰卡，这里只报事实
  const notLoaded = ids.filter((id) => !(KB.chapters && KB.chapters[id]));
  note('登记了但尚未开工的课（首页显示灰卡）：' + (notLoaded.join(' ') || '无'));

  // 每门已开工的课都必须有这些字段，否则点进去就崩
  (loaded.length ? loaded : []).forEach((id) => {
    const ch = KB.chapters[id];
    ok(ch.id === id, `${id} 的 chapter.id 与它挂的 key 一致`, ch.id);
    ok(Array.isArray(ch.sections) && ch.sections.length > 0, `${id} 有正文段`, (ch.sections || []).length + ' 段');
  });
}

/* ============================================================
 * 1. index.html 引用的本地文件
 * ============================================================ */
section('1. index.html 引用的本地文件都存在');
{
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const refs = [];
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) refs.push(m[1]);
  for (const m of html.matchAll(/<link[^>]+href="([^"]+)"/g)) refs.push(m[1]);
  ok(refs.length >= 8, '解析出至少 8 个本地引用', 'got ' + refs.length);
  let allThere = true, missing = [];
  for (const r of refs) {
    const p = path.resolve(SITE, r);
    if (!fs.existsSync(p)) { allThere = false; missing.push(r); }
  }
  ok(allThere, '每个 <script src> / <link href> 都能在磁盘上找到', missing.join(', '));

  // 反向：data / js 目录下有没有没被引用的孤儿文件（提示，不算失败）
  const loaded = refs.filter(r => /\.(js|css)$/.test(r)).map(r => path.resolve(SITE, r));
  const orphans = [];
  (function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (!/vendor|katex/.test(f)) walk(p); continue; }
      if (!/\.(js|css)$/.test(f)) continue;
      if (!loaded.includes(p) && !/vendor/.test(p)) orphans.push(rel(p));
    }
  })(path.join(SITE, 'js'));
  (function walk2(dir) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) continue;
      if (/\.js$/.test(f) && !loaded.includes(p)) orphans.push(rel(p));
    }
  })(path.join(SITE, 'data'));
  if (orphans.length) note('没有被 index.html 引用的 js：' + orphans.join(', '));
}

/* ============================================================
 * 2. 结构
 * ============================================================ */
section('2. 每章 10 个环节 / 块类型 / 交互模块');

const KNOWN = ['p', 'h', 'ul', 'ol', 'quote', 'note', 'table', 'kv', 'code', 'math', 'hl', 'viz', 'predict', 'quizset', 'goal', 'roadmap'];

ok(CH.sections.length === 10, '正文章节数 = 10', String(CH.sections.length));
ok(CH.sections.map(s => s.num).join(',') === '1,2,3,4,5,6,7,8,9,10', '编号 1..10 连续且有序',
  CH.sections.map(s => s.num).join(','));

const vizKeys = KB.viz.keys();
ok(vizKeys.length > 0, '交互模块已注册', vizKeys.join(','));
for (const k of CH.vizKeys) ok(vizKeys.includes(k), '声明过的交互模块已实现：' + k, vizKeys.join(','));

const secIds = new Set();
let totalBlocks = 0;
const unknownTypes = [];
const vizRefs = [];
for (const s of CH.sections) {
  ok(!!s.id && !!s.title && s.blocks.length > 0, '第 ' + s.num + ' 段非空：' + s.title,
    'blocks=' + (s.blocks ? s.blocks.length : 'undefined'));
  ok(!secIds.has(s.id), '段 id 唯一：' + s.id);
  secIds.add(s.id);
  for (const b of s.blocks) {
    totalBlocks++;
    if (!KNOWN.includes(b.t)) unknownTypes.push(s.id + ':' + b.t);
    if (b.t === 'viz') vizRefs.push(b.key);
    if (b.t === 'p' && !b.md) failures.push(s.id + ' 有空段落');
  }
}
ok(unknownTypes.length === 0, '所有块类型都在已知白名单里', unknownTypes.join(','));
ok(vizRefs.length >= 11, '页面里挂载的交互块 ≥ 11', String(vizRefs.length));
for (const k of vizRefs) ok(vizKeys.includes(k), '交互块引用的模块存在：' + k);

section('2b. 站点自洽：正文里没有任何"去别处读原文"的指针');
{
  /* 用户的硬要求：「把这个交互式页面做成我唯一需要读的东西」。
     所以正文里不许再出现指向 md 讲义、文档楼层号、或"讲义正本"页的指针 ——
     一旦有人把那条双轨加回来，这两条会立刻变红。 */
  const mdRef = /\d\d §|\.md\b|讲义正本|派生副本/;
  /* 论文原文章节号（如 arXiv:1310.4546 §2.1）是**合法的站外出处**，不是 md 讲义指针。
     先把它剔掉再扫，否则真引用会被误判成"去别处读原文"。 */
  const stripPaper = s => s.replace(/arXiv:[\w.]+(?:v\d+)?\s*§[\d.]+/g, '');
  const hasMdRef = s => mdRef.test(stripPaper(s));
  const scanBlocks = (blocks, prefix, bag) => blocks.forEach(b => {
    ['md', 'title', 'note', 'text', 'q', 'alt', 'source', 'intro'].forEach(k => {
      if (typeof b[k] === 'string' && hasMdRef(b[k])) bag.push(prefix + ':' + b.t + '.' + k);
    });
    (b.rows || []).forEach(r => r.forEach(c => { if (typeof c === 'string' && hasMdRef(c)) bag.push(prefix + ':' + b.t); }));
    (b.items || []).forEach(c => { if (typeof c === 'string' && hasMdRef(c)) bag.push(prefix + ':' + b.t); });
    (b.head || []).forEach(c => { if (typeof c === 'string' && hasMdRef(c)) bag.push(prefix + ':' + b.t); });
    (b.parts || []).forEach(p => ['label', 'note'].forEach(k => { if (typeof p[k] === 'string' && hasMdRef(p[k])) bag.push(prefix + ':hl'); }));
  });

  const bodyHits = [];
  CH.sections.forEach(s => scanBlocks(s.blocks, s.id, bodyHits));
  CH.quiz.forEach(q => {
    ['q', 'explain'].forEach(k => { if (typeof q[k] === 'string' && hasMdRef(q[k])) bodyHits.push(q.id + '.' + k); });
  });
  ok(bodyHits.length === 0, '正文与 Quiz 里没有指向 md / 讲义正本的指针', bodyHits.slice(0, 6).join(', '));

  const pageHits = [];
  CH.glossary.forEach((g, i) => g.forEach(x => { if (typeof x === 'string' && hasMdRef(x)) pageHits.push('gloss' + i); }));
  CH.formulas.forEach((f, i) => ['name', 'note', 'tex'].forEach(k => { if (typeof f[k] === 'string' && hasMdRef(f[k])) pageHits.push('f' + i); }));
  CH.honesty.forEach((h, i) => { if (typeof h === 'string' && hasMdRef(h)) pageHits.push('honesty' + i); });
  if (typeof CH.params.note === 'string' && hasMdRef(CH.params.note)) pageHits.push('params');
  ok(pageHits.length === 0, '术语表 / 公式卡 / 诚实清单里也没有指向 md 的指针', pageHits.slice(0, 6).join(', '));
}

section('2b2. 每段导读（goal）与本课地图（roadmap）');
{
  /* 加这两样东西的原因写在 app.js 的 renderGoal 注释里：
     用户说"学习时不知道看哪个，效率很低"。
     既然是给"唯一要读的那一页"做导航，它就不能悄悄消失 —— 这里钉住。 */
  /* 第 1 段是「地图 + 导读」两张卡（地图在前），其余 9 段只有导读卡 */
  const goalAt = (s, i) => (i === 0 ? s.blocks[1] : s.blocks[0]);
  const needGoal = CH.sections.filter((s, i) => {
    const g = goalAt(s, i);
    return !(g && g.t === 'goal');
  });
  ok(needGoal.length === 0, '10 段每段开头都有一张导读卡',
    needGoal.map(s => s.id).join(','));
  ok(CH.sections.length === 10, '段数 = 10', String(CH.sections.length));

  const badGoal = [];
  CH.sections.forEach((s, i) => {
    const g = goalAt(s, i);
    if (!g || g.t !== 'goal') return;
    if (!Array.isArray(g.covers) || !g.covers.length) badGoal.push(s.id + ': 缺 covers');
    if (!Array.isArray(g.after) || !g.after.length) badGoal.push(s.id + ': 缺 after');
  });
  ok(badGoal.length === 0, '每张导读卡都有"这一段回答"和"读完你应该能"', badGoal.join(' | '));

  const rm = CH.sections[0].blocks[0];
  ok(!!rm && rm.t === 'roadmap', '第 1 段第一块是本课地图');
  const ids = CH.sections.map(s => s.id);
  const rmIds = (rm && rm.items || []).map(it => it[0]);
  ok(rmIds.length === 10, '地图覆盖 10 段', String(rmIds.length));
  ok(rmIds.join(',') === ids.join(','), '地图条目顺序与段顺序一致', rmIds.join(','));
}

section('2b3. 每段的体量下限（防止内容被改薄）');
{
  /* 起因（2026-10）：用户指出"十段式网页最多只能用来复习，里面缺少大量的内容"。
     实测：加深前 10 段正文只有 10,570 字，是 md 讲义的 19%；第 7 段 11 个交互
     只写了 437 字，第 10 段只有 154 字。
     加深后 10 段合计 ≈ 35,000 字。这里钉一个**下限**，不是为了刷字数，
     而是防止以后有人"顺手精简"把某段又改回要点列表 —— 那种改法不会让任何
     现有断言变红，却正好把用户抱怨的问题原样搬回来。
     口径与 tools/_stat.js 完全一致（同一份 textOf）。 */
  function textOf(b) {
    const out = [];
    const push = x => { if (typeof x === 'string') out.push(x); };
    ['md', 'title', 'text', 'q', 'alt', 'intro', 'tag', 'note', 'source', 'before'].forEach(k => push(b[k]));
    ['covers', 'after'].forEach(k => (b[k] || []).forEach(push));
    (b.items || []).forEach(push);
    (b.head || []).forEach(push);
    (b.rows || []).forEach(r => r.forEach(push));
    (b.parts || []).forEach(p => { push(p.label); push(p.note); });
    return out.join('');
  }

  const FLOOR = 2000;        // 每段正文下限
  const TOTAL_FLOOR = 32000; // 10 段合计下限
  let grand = 0;
  const thin = [], few = [];
  CH.sections.forEach(s => {
    const n = s.blocks.reduce((acc, b) => acc + textOf(b).length, 0);
    grand += n;
    if (n < FLOOR) thin.push(s.id + '=' + n);
    if (s.blocks.length < 8) few.push(s.id + '=' + s.blocks.length + '块');
  });
  ok(thin.length === 0, `每段正文 ≥ ${FLOOR} 字（防改薄）`, thin.join(', '));
  ok(grand >= TOTAL_FLOOR, `10 段合计 ≥ ${TOTAL_FLOOR} 字`, String(grand));
  ok(few.length === 0, '每段 ≥ 8 个块（不是一张卡片了事）', few.join(', '));
  note('10 段正文合计：' + grand + ' 字（加深前 10,570 字）');
}

section('2b4. 交互面板：两条只能靠「看一眼」发现的退化');
{
  /* 这两条都不落在任何既有断言的口径里：元素在、class 在、style 属性在、
     CSS 语法合法、公式也照样渲染 —— 四套校验全绿，页面上那块东西却是坏的。
     所以只能对着**源码文本**钉。真正量渲染结果的是 smoke.mjs 的 I2-1..4。 */
  const vizCss = fs.readFileSync(path.join(SITE, 'css', 'viz.css'), 'utf8');
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

  /* ① 条形填充条 .bf 是 <i>，<i> 是行内元素，而行内元素的 width / height 一律无效。
        少了 display:block，52 条全部渲染成 0×0 的空盒子：页面上只剩左标签和右数字，
        中间一片空白。它出现过整整一版，四套校验没有一条变红。 */
  const bfRule = (vizCss.match(/\.bar-row\s+\.bf\s*\{[^}]*\}/) || [''])[0];
  ok(/display\s*:\s*block/.test(bfRule),
    '条形填充条 .bar-row .bf 声明了 display:block（行内元素的 width/height 无效）',
    bfRule.replace(/\s+/g, ' ').slice(0, 96) || '没找到 .bar-row .bf 规则');

  /* ② 品牌区是一个真链接，不是靠 JS 绑 click 的 div ——
        只有 <a href="#/"> 才自带中键、右键「新标签打开」和键盘 Tab + Enter。 */
  const brandTag = (html.match(/<a[^>]*class="brand"[^>]*>/) || [''])[0];
  ok(/href="#\/"/.test(brandTag),
    '左上角品牌区是 <a href="#/">（点「NLP」方块或文字回首页）',
    brandTag || '品牌区不是一个指向 #/ 的链接');

  note('面板宽度由 css/viz.css 的 --viz-bleed 控制（宽屏出血、窄屏退回与正文同宽）');
}

section('2c. 公式逐项高亮的结构');{
  let blocks = 0, bad = [];
  for (const s of CH.sections) for (const b of s.blocks) {
    if (b.t !== 'hl') continue;
    blocks++;
    if (!b.parts || !b.parts.length) bad.push(s.id + ': 没有 parts');
    for (const p of b.parts || []) {
      if (!p.cls || !p.label || !p.note) bad.push(s.id + ': 缺 cls/label/note');
    }
  }
  ok(blocks >= 5, '公式逐项高亮块数 ≥ 5', String(blocks));
  ok(bad.length === 0, '每个高亮块都有 parts 且字段齐全', bad.join(' | '));

  // 高亮标记与 parts 必须对得上：
  //  · CSS 只定义了 hl-p1 / hl-p2 / hl-p3，所以 parts 最多 3 项、标记不得超出这个范围；
  //  · 标记不许"跳号"（有 p1 和 p3 却没有 p2）—— 那会让中间那一步点了没反应；
  //  · 分项若在公式里确实没有对应片段（讲的是"整体"结论），允许走整式回退，
  //    但要**逐个点名**，不能默默存在 —— 否则没人知道哪一步是退化的。
  const skipped = [], oversize = [], fallback = [];
  for (const s of CH.sections) {
    let bi = 0;
    for (const b of s.blocks) {
      if (b.t !== 'hl') continue;
      bi++;
      const parts = b.parts || [];
      const where = s.id + ' 第' + bi + '块';
      if (parts.length > 3) oversize.push(where + ': parts=' + parts.length);
      for (const p of parts) if (!/^p[123]$/.test(p.cls)) oversize.push(where + ': cls=' + p.cls);
      const marked = new Set();
      for (const m of String(b.tex).matchAll(/\\htmlClass\{(hl-p[0-9]+)\}/g)) marked.add(m[1]);
      const nums = [...marked].map(x => parseInt(x.slice(4), 10));
      const maxN = nums.length ? Math.max.apply(null, nums) : 0;
      for (let k = 1; k <= maxN; k++) if (!marked.has('hl-p' + k)) skipped.push(where + ': 缺 hl-p' + k);
      if (maxN > 3) oversize.push(where + ': 标记到 hl-p' + maxN);
      for (const p of parts) if (!marked.has('hl-' + p.cls)) fallback.push(where + ' 的「' + String(p.label).replace(/[$\\]/g, '').slice(0, 14) + '」');
    }
  }
  ok(oversize.length === 0, 'parts 数与 cls 都在 CSS 定义的 p1..p3 范围内', oversize.join(' | '));
  ok(skipped.length === 0, '公式里的高亮标记不跳号', skipped.join(' | '));
  note('有 ' + fallback.length + ' 个分项在公式里没有对应片段，会退化成整式高亮：' + (fallback.join(', ') || '（无）'));
}

/* ============================================================
 * 2d. 动手作业轨道（A1 标杆）
 * ------------------------------------------------------------
 * 两条轨道是 2026-10 加的：知识点（#/c/…）回答「这是什么」，
 * 动手作业（#/a/…）回答「现在做什么」。
 * 上面第 2 节的断言（「10 个环节」「编号 1..10」「viz 块 ≥ 11」）全部是按 K01 写死的，
 * 一条都没覆盖到作业页 —— 而作业页恰恰用的是**另一套段骨架**。
 * 这一节补的正是那些「默认段骨架叫 what/why/…」的隐含假设。
 * ============================================================ */
section('2d. 动手作业轨道（A1）：注册表 / 段骨架 / 块类型 / 体量 / 自测');
{
  const A = C1;                                    // KB.core.a1
  const tasks = (KB.courses || []).filter((c) => c.kind === 'task');

  ok(tasks.length >= 1, '注册表里有「动手作业」这一类（kind: task）', tasks.map((t) => t.no).join(' ') || '无');
  ok(tasks.every((t) => t.parent && KB.chapters[t.parent]),
    '每份作业的 parent 都指向一个真实存在的知识点（双向链接靠这个字段）',
    tasks.map((t) => t.no + '→' + t.parent).join(' '));
  ok(CH1.kind === 'task', 'a1 这一章声明了 kind: task', String(CH1.kind));
  ok(CH1.id === 'a1', 'chapter.id 与它挂的 key 一致', CH1.id);
  ok(CH1.subtitle && /A1|Assignment\s*1/.test(CH1.subtitle),
    'A1 的副标题里点了自己（课号或官方作业名）', String(CH1.subtitle).slice(0, 44));

  /* ---- 段骨架：与 K01 是两套 ---- */
  ok(CH1.sections.length === 10, 'A1 有 10 段', String(CH1.sections.length));
  ok(CH1.sections.map((s) => s.num).join(',') === '1,2,3,4,5,6,7,8,9,10',
    'A1 段号 1..10 连续且有序', CH1.sections.map((s) => s.num).join(','));
  /* 判据不是「一个都不许重名」，而是「明显是另一套骨架」：
     what / pitfalls 这类名字对任何一门课都自然，将来 A2–A4 也会用 ——
     要求完全不重名只会逼人起出 what2 这种名字。
     真正要拦的是「把 K01 的十段骨架直接抄过来」：那种情况 10 个 id 会**全部**命中。 */
  const k01Ids = CH.sections.map((s) => s.id);
  const a1Ids = CH1.sections.map((s) => s.id);
  const overlapIds = a1Ids.filter((id) => k01Ids.indexOf(id) >= 0);
  ok(a1Ids.filter((id) => k01Ids.indexOf(id) < 0).length >= 8,
    'A1 的段 id 至少 8 个是它自己独有的（不是照抄 K01 的十段骨架）',
    `独有 ${a1Ids.filter((id) => k01Ids.indexOf(id) < 0).length}/10，重名的只有：${overlapIds.join(',') || '无'}`);
  const k01Titles = CH.sections.map((s) => s.title);
  ok(CH1.sections.every((s) => k01Titles.indexOf(s.title) < 0),
    'A1 每段的标题都与 K01 不同（段名一样就说明还没换成作业的讲法）',
    CH1.sections.map((s) => s.title).filter((t) => k01Titles.indexOf(t) >= 0).join(',') || '全部不同');

  /* ---- 块类型 / 交互引用 ---- */
  const badTypes = [], emptyP = [];
  let a1Blocks = 0;
  const a1Viz = [];
  const a1SecIds = new Set();
  for (const s of CH1.sections) {
    ok(!!s.id && !!s.title && s.blocks.length > 0, `A1 第 ${s.num} 段非空：${s.title}`, 'blocks=' + s.blocks.length);
    ok(!a1SecIds.has(s.id), 'A1 段 id 唯一：' + s.id);
    a1SecIds.add(s.id);
    for (const b of s.blocks) {
      a1Blocks++;
      if (KNOWN.indexOf(b.t) < 0) badTypes.push(s.id + ':' + b.t);
      if (b.t === 'viz') a1Viz.push(b.key);
      if (b.t === 'p' && !b.md) emptyP.push(s.id);
    }
  }
  ok(badTypes.length === 0, 'A1 的所有块类型都在已知白名单里', badTypes.join(',') || String(a1Blocks) + ' 块');
  ok(emptyP.length === 0, 'A1 没有空段落', emptyP.join(','));

  ok(CH1.vizKeys.length >= 1, 'A1 声明了预演交互（不装环境也能玩）', CH1.vizKeys.join(','));
  for (const k of CH1.vizKeys) ok(vizKeys.indexOf(k) >= 0, 'A1 声明过的交互已实现：' + k);
  ok(a1Viz.length === CH1.vizKeys.length,
    `A1 正文挂的交互块数（${a1Viz.length}）与声明的（${CH1.vizKeys.length}）一致`, a1Viz.join(','));
  for (const k of a1Viz) ok(vizKeys.indexOf(k) >= 0, 'A1 交互块引用的模块存在：' + k);
  /* viz-kit 抽出来就是为了这件事：K01 与 A1 的交互必须进**同一张**注册表。
     进两张表的话，KB.viz.mount 就得知道"这是哪门课的交互" —— 那正是抽出去要消掉的东西。 */
  ok(CH.vizKeys.every((k) => vizKeys.indexOf(k) >= 0) && vizKeys.length >= CH.vizKeys.length + a1Viz.length,
    'K01 与 A1 的交互共用一张注册表（js/ui/viz-kit.js）',
    `${vizKeys.length} 个 key = K01 的 ${CH.vizKeys.length} + A1 的 ${a1Viz.length} + 其它`);

  /* ---- 体量下限：口径与 2b3 相同，但门槛更低 ----
     作业页回答的是「怎么做」，天然比知识点页短一些；门槛按实际体量的下沿设，
     只用来拦「内容被改薄」，不用来评优劣。 */
  const FLOOR = 400;
  const thin = CH1.sections.filter((s) => JSON.stringify(s).length < FLOOR).map((s) => s.id);
  ok(thin.length === 0, `A1 每段体量 ≥ ${FLOOR} 字符（防止内容被改薄）`, thin.join(',') || '全部达标');
  const a1Chars = CH1.sections.reduce((a, s) => a + JSON.stringify(s).length, 0);
  ok(a1Chars > 18000, 'A1 正文总量 > 18000 字符', String(a1Chars));

  /* ---- 自测：10 题里有且只有 1 道数值题，且必须由 a1_core 现算 ---- */
  ok(CH1.quiz.length === 10, 'A1 自测 10 题', String(CH1.quiz.length));
  const calc = CH1.quiz.filter((q) => typeof q.compute === 'function');
  ok(calc.length === 1, 'A1 有且只有 1 道数值题', String(calc.length));
  if (calc.length) {
    /* 判据是「现算」而不是「等于 24」：写死 24 的话，改语料后题面和答案会分家。
       compute 拿到的是 a1_core —— 这正是 quiz.js 里那个 KB.core[chapter.id] 修复的意义。 */
    ok(calc[0].compute(A) === 24, 'A1 数值题由 a1_core 现算出 24（不是写死在题面里的数字）',
      String(calc[0].compute(A)));
    ok(typeof calc[0].unit === 'string' && calc[0].digits === 0,
      'A1 数值题标了单位且小数位为 0（计数不该显示成 24.0000）',
      `unit=${JSON.stringify(calc[0].unit)} digits=${calc[0].digits}`);
  }
  ok(CH1.quiz.filter((q) => q.kind === 'choice').length >= 6, 'A1 选择题 ≥ 6（自测以概念为主）',
    String(CH1.quiz.filter((q) => q.kind === 'choice').length));
  ok(CH1.glossary.length >= 10 && CH1.formulas.length >= 5 && CH1.honesty.length >= 4,
    'A1 的术语表 / 公式速查 / 诚实清单都在',
    `${CH1.glossary.length} 术语 / ${CH1.formulas.length} 公式 / ${CH1.honesty.length} 条诚实边界`);

  /* ---- 正文里不许出现「去别处读原文」的指针（口径同 2b，但针对 A1）---- */
  const mdRef = /\d\d §|\.md\b|讲义正本|派生副本/;
  const a1Text = JSON.stringify(CH1.sections);
  ok(!mdRef.test(a1Text.replace(/arXiv:[\w.]+(?:v\d+)?\s*§[\d.]+/g, '')),
    'A1 正文里没有指向 md 讲义/楼层号的指针', (a1Text.match(mdRef) || [])[0] || '干净');

  note('A1 是作业轨道的标杆；A2–A4 照抄它的结构（kind:task + parent + 自己的段骨架 + vizKeys）即可接进来');
}

/* ============================================================
 * 3. Quiz
 * ============================================================ */
section('3. Quiz');
{
  ok(CH.quiz.length >= 3, 'Quiz 题数 ≥ 3（手册交付前检查项）', String(CH.quiz.length));
  const kinds = {};
  CH.quiz.forEach(q => { kinds[q.kind] = (kinds[q.kind] || 0) + 1; });
  note('题型分布：' + Object.keys(kinds).map(k => k + '=' + kinds[k]).join(', '));

  const ids = new Set();
  for (const q of CH.quiz) {
    ok(!ids.has(q.id), 'Quiz id 唯一：' + q.id);
    ids.add(q.id);
    ok(!!q.explain, q.id + ' 有解释');
    if (q.kind === 'choice') {
      ok(Array.isArray(q.options) && q.options.length >= 2, q.id + ' 选项 ≥ 2');
      ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length,
        q.id + ' 答案索引合法（' + q.answer + ' / ' + (q.options || []).length + '）');
    } else if (q.kind === 'calc') {
      const v = q.compute(C, F);
      ok(typeof v === 'number' && isFinite(v), q.id + ' 数值题算得出有限值', String(v));
    } else if (q.kind === 'open') {
      ok(Array.isArray(q.points) && q.points.length >= 3, q.id + ' 开放题有 ≥3 条答案要点',
        String((q.points || []).length));
    } else {
      ok(false, q.id + ' 未知题型：' + q.kind);
    }
    if (q.src) ok(true, q.id + ' 标了出处');
  }
  // 覆盖手册要求的四类题型
  ok(CH.quiz.some(q => q.kind === 'choice'), '含概念判断题');
  ok(CH.quiz.some(q => q.kind === 'calc'), '含数值计算题');
  ok(CH.quiz.some(q => q.kind === 'open'), '含推导/开放题');

  /* ---- 可猜性：选项必须在「视觉上彼此不可区分」 ---- */
  // 来历（真实事故）：初版 9 道选择题的正确项全部写了 markdown 粗体（**…**），
  // 18 个干扰项一个粗体都没有 —— 于是"哪个选项是粗体"就等于"哪个是答案"，
  // 判断题直接退化成送分题。注意这类泄露**渲染层是对的**（quiz.js 忠实渲染了
  // 数据），所以 DOM 断言抓不到，只能靠数据侧断言。
  const EMPHASIS = /(\*\*|__|<b\b|<\/b>|<strong|<em\b|<\/em>|<i\b|<\/i>|<mark|<u\b)/i;
  const tainted = [], htmlIn = [];
  for (const q of CH.quiz) {
    if (q.kind !== 'choice') continue;
    (q.options || []).forEach((o, i) => {
      const tag = q.id + '.' + String.fromCharCode(65 + i);
      if (EMPHASIS.test(String(o))) tainted.push(tag);
      if (/<[a-z/][^>]*>/i.test(String(o))) htmlIn.push(tag);
    });
  }
  ok(tainted.length === 0,
    '选择题选项一律纯文本，不带任何强调标记（否则「有粗体 = 正确答案」）', tainted.join(', ') || '9 题 36 个选项全部干净');
  ok(htmlIn.length === 0, '选择题选项不含 HTML 标签（同样会变成区分选项的记号）', htmlIn.join(', '));

  // 答案位置分布：只报事实、不设阈值 —— 要不要打散由人决定
  // （打散需同步 explain 里对选项字母的引用，属改动题面，不自动化）
  const pos = {}, choiceN = CH.quiz.filter(q => q.kind === 'choice').length;
  for (const q of CH.quiz) if (q.kind === 'choice') pos[q.answer] = (pos[q.answer] || 0) + 1;
  note('答案位置分布：' + [0, 1, 2, 3].map(k => String.fromCharCode(65 + k) + '=' + (pos[k] || 0)).join(' ')
    + `（共 ${choiceN} 题；单字母占比过高会让"蒙"有效）`);
}

/* ============================================================
 * 4. 公式全部能渲染（throwOnError: true）
 * ============================================================ */
section('4. 全部公式用本地 KaTeX 渲染（throwOnError: true）');
{
  const bad = [];
  let count = 0, textFields = 0;

  const collect = (b, sid) => {
    const check = (str, where) => {
      if (typeof str !== 'string') return;
      const r = KB.md.checkMath(str);
      count += r.count; textFields++;
      r.bad.forEach(x => bad.push(where + ' :: ' + x.tex.slice(0, 60) + ' :: ' + x.message));
    };
    if (b.t === 'math' || b.t === 'hl') {
      try {
        global.katex.renderToString(b.tex, { trust: true, strict: 'ignore', displayMode: true, throwOnError: true });
        count++;
      } catch (e) { bad.push(sid + ' ' + b.t + ' :: ' + b.tex.slice(0, 60) + ' :: ' + e.message); }
    }
    ['md', 'intro', 'title', 'note', 'text', 'q', 'alt', 'source'].forEach(k => check(b[k], sid + '.' + b.t + '.' + k));
    if (b.parts) b.parts.forEach((p, i) => { check(p.label, sid + '.hl.p' + i + '.label'); check(p.note, sid + '.hl.p' + i + '.note'); });
    if (b.head) b.head.forEach((c, i) => check(c, sid + '.table.th' + i));
    if (b.rows) b.rows.forEach((r, i) => r.forEach((c, j) => check(c, sid + '.table.' + i + '.' + j)));
    if (b.items) b.items.forEach((c, i) => check(c, sid + '.list' + i));
  };

  CH.sections.forEach(s => s.blocks.forEach(b => collect(b, s.id)));
  CH.quiz.forEach(q => {
    const o = { t: 'quiz', q: q.q, explain: q.explain, source: q.src };
    collect(o, q.id);
    (q.options || []).forEach((x, i) => collect({ t: 'quiz', head: [x] }, q.id + '.opt' + i));
    (q.points || []).forEach((x, i) => collect({ t: 'quiz', items: [x] }, q.id + '.pt' + i));
  });
  CH.glossary.forEach((g, i) => collect({ t: 'g', head: g }, 'gloss' + i));
  CH.formulas.forEach((f, i) => collect({ t: 'g', items: [f.name, f.note] }, 'formula' + i));
  CH.formulas.forEach((f, i) => {
    try { global.katex.renderToString(f.tex, { trust: true, strict: 'ignore', displayMode: true, throwOnError: true }); count++; }
    catch (e) { bad.push('formula' + i + ' :: ' + f.tex.slice(0, 60) + ' :: ' + e.message); }
  });
  CH.honesty.forEach((h, i) => collect({ t: 'g', items: [h] }, 'honesty' + i));
  collect({ t: 'g', items: CH.params.head.concat(CH.params.rows.map(r => r.join(' '))).concat([CH.params.note]) }, 'params');

  ok(count > 60, '检查到的公式数 > 60', String(count));
  ok(bad.length === 0, '零渲染失败', bad.slice(0, 5).join(' | '));

  // 站点自带全部公式：不再有"另一半在 md 里"的说法
  note('公式总数：' + count + '（全部来自正文与专业页）');
}

/* ============================================================
 * 4b. LaTeX 反斜杠纪律：raw 模板里不许出现 \\
 * ------------------------------------------------------------
 * 2026-10 抓到的真实事故，值得单独立一节：
 *   data/k01.js 里 LaTeX 一律写在 String.raw 模板（r`...`）里，那里 `\\` **不会**被
 *   当转义 —— 它原样保留成两个反斜杠，而 LaTeX 把 `\\` 读成**换行**。于是
 *       写错： r`$P(\\text{ice}\\mid\\text{solid})$`
 *       写对： r`$P(\text{ice}\mid\text{solid})$`
 *   写错的那个渲染成「P(」换行「textice」换行「mid」…，公式被拆成好几行。
 *
 *   关键在于：**KaTeX 不报错**（`\\` 本身是合法的 LaTeX 命令），所以上一节
 *   「throwOnError: true 零渲染失败」完全拦不住它 —— 四套校验全绿，页面却是坏的。
 *   这个 bug 是靠人眼看第 8 段的截图才发现的。
 *
 *   判据：**求值之后**的字符串里不许出现连续两个反斜杠。
 *   （raw 模板保留 `\\`；而单引号串 `'\\mid'` 求值后是 `\mid`，不会被误报。）
 *   唯一例外：矩阵 / 多行的行分隔符 —— `\\` 后面紧跟数字，如 bmatrix 的 `1&2\\3&4`。
 * ============================================================ */
section('4b. LaTeX 反斜杠纪律（raw 模板里 \\ 会被读成换行）');
{
  const dbl = [];
  const seen = new Set();
  const objs = new WeakSet();
  const walk = (node, path) => {
    if (typeof node === 'string') {
      const m = /\\\\/.exec(node);
      if (m && !/\d/.test(node[m.index + 2] || '')) {
        const ctx = node.slice(Math.max(0, m.index - 34), m.index + 34).replace(/\s+/g, ' ');
        const key = path + '|' + ctx;
        if (!seen.has(key)) { seen.add(key); dbl.push(path + ' :: …' + ctx + '…'); }
      }
      return;
    }
    if (Array.isArray(node)) { node.forEach((x, i) => walk(x, path + '[' + i + ']')); return; }
    if (node && typeof node === 'object') {
      if (objs.has(node)) return;          // 防环
      objs.add(node);
      Object.keys(node).forEach(k => walk(node[k], path + '.' + k));
    }
  };
  walk(CH, 'k01');
  ok(dbl.length === 0,
    '没有把 \\mid / \\alpha 这类命令误写成 \\\\（KaTeX 会当换行，且不报错）',
    dbl.slice(0, 4).join('  |  '));
  note('反斜杠纪律：raw 模板里写单反斜杠；只有矩阵换行 \\\\ 后面跟数字时才写两个');
}

/* ============================================================
 * 4c. LaTeX 反斜杠纪律（源码级）：单引号串里必须写 \\
 * ------------------------------------------------------------
 * 另一半故事，和 4b 正好相反：
 *   同一个 k01.js 里，**表格单元之类的短字符串**习惯写成单引号串 `'...'`（不是 raw 模板）。
 *   单引号串里 `\c` **不是**合法转义 —— JS 会把反斜杠**吃掉**：
 *       '$V\cdot D$'  求值成  '$VcdotD$'
 *   更阴的是 `\t` `\r` `\n` `\b` `\f` `\v` 是**真转义**：
 *       '$V\times d$' 求值成  '$V<制表符>imes d$'
 *   两种产物都还是"合法数学"（一堆斜体字母），**KaTeX 不报错** ——
 *   所以 §4 的 throwOnError 与 §4b 的双反斜杠扫描都拦不住。
 *   这个 bug 是看第 10 段的截图才发现的：表格里印着 `VcdotD`、`alpha = 0.75`。
 *
 *   判据只能读**源码文本**（求值后损坏已经发生，数据里反推不出来）：
 *   凡是含 `$` 的单引号串，里面的每个反斜杠只能是 `\\`、`\'` 或 `\uHHHH`。
 * ============================================================ */
section('4c. LaTeX 反斜杠纪律（源码级：单引号串里必须写 \\\\)');
{
  const src = fs.readFileSync(path.join(SITE, 'data', 'k01.js'), 'utf8');
  const bad2 = [];
  let i = 0, lineNo = 1;
  const n = src.length;
  const HEX4 = /^[0-9a-fA-F]{4}$/;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { lineNo++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { const j = src.indexOf('\n', i); i = j < 0 ? n : j; continue; }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); lineNo += src.slice(i, j < 0 ? n : j).split('\n').length - 1; i = j < 0 ? n : j + 2; continue; }
    if (c === '"' || c === '`') {                       // 双引号串 / raw 模板：整段跳过
      const q = c; i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        if (src[i] === '\n') lineNo++;
        i++;
      }
      continue;
    }
    if (c === "'") {
      const at = lineNo;
      i++;
      let body = '', ok = true;
      while (i < n && src[i] !== "'") {
        if (src[i] === '\\') {
          const nxt = src[i + 1] || '';
          if (nxt === '\\' || nxt === "'") { body += src.substr(i, 2); i += 2; continue; }
          if (nxt === 'u' && HEX4.test(src.substr(i + 2, 4))) { body += src.substr(i, 6); i += 6; continue; }
          body += src.substr(i, 2); ok = false; i += 2; continue;
        }
        body += src[i]; i++;
      }
      i++;                                              // 收尾引号
      if (!ok && body.indexOf('$') >= 0) bad2.push('L' + at + ' :: ' + body.slice(0, 68));
      continue;
    }
    i++;
  }
  ok(bad2.length === 0,
    '含 $ 的单引号串里没有单反斜杠（会被 JS 吃掉，或把 \\times 变成制表符）',
    bad2.slice(0, 4).join('  |  '));
  note('单引号串里的 LaTeX 一律写 \\\\；只有 \\\'、\\\\、\\uHHHH 例外');
}

/* ============================================================
 * 5. 关键数字必须与 logs 一致
 * ============================================================ */
section('5. 关键数字与 logs 对账（"每个数字都能复现"）');

function near(name, got, want, tol) {
  const d = Math.abs(got - want);
  ok(d <= tol, name, 'got ' + got + ', want ' + want + ', |diff|=' + d.toExponential(2));
}

{
  // predict 块
  const P = {};
  CH.sections.forEach(s => s.blocks.forEach(b => { if (b.t === 'predict') P[b.id] = b; }));
  const got = id => P[id].compute(C, F);

  ok(Object.keys(P).length === 3, 'predict 块数 = 3', Object.keys(P).join(','));
  /* 用户 2026-10 的硬要求：「自测题里不该让我推词频、非零元素占比这类毫无意义的数」。
     所以 predict 只保留**答案能由本页概念/公式推出来**的题；
     凡是依赖词频表或跑一遍 SVD 才知道的"数据事实"，一律不进 predict（改由正文/交互直接给出）。
     下面这条白名单就是那句话的可执行版本 —— 谁再加回一道猜数据的题，它会立刻变红。 */
  const PREDICT_WHITELIST = ['p-onehot', 'p-cooc', 'p-cost'];
  const stray = Object.keys(P).filter(k => PREDICT_WHITELIST.indexOf(k) < 0);
  ok(stray.length === 0, 'predict 里没有"猜数据事实"的题（只留可推的）', stray.join(','));
  near('p-onehot：hotel·motel = 0（logs PART1）', got('p-onehot'), 0, 0);
  near('p-cooc：X[I][like] = 2（logs PART2）', got('p-cooc'), 2, 0);
  ok(Math.round(got('p-cost')) === 16667, 'p-cost：naive/NEG ≈ 16667×（run_numpy_out.txt）',
    String(got('p-cost')));
}

{
  // 单测已经覆盖的部分，这里只抽查最容易被改坏的那几个
  const co = C.cooccurrence([['I', 'like', 'deep', 'learning'], ['I', 'like', 'NLP'], ['I', 'enjoy', 'flying']], { window: 1 });
  near('共现矩阵非零占比 = 12/49 = 24.5%', co.nonzeroRatio * 100, 24.489795918367346, 1e-9);
  ok(co.maxAsymmetry === 0, '对称性 max|X−Xᵀ| = 0', String(co.maxAsymmetry));
  ok(C.isBipartite(co.X).bipartite === true, '共现图是二分图');

  const svd = C.svdEmbedding(co.X, 7);
  near('σ₁ = 2.640447', svd.sigmas[0], 2.6404470773710083, 1e-6);
  near('σ₃ = 1.193091', svd.sigmas[2], 1.1930906362589508, 1e-6);
  near('重构误差 k=2 = 2.013971', C.reconstructionError(svd.sigmas, 2), 2.013971, 5e-6);
  const nz2 = C.nonzeroCoordCounts(C.svdEmbedding(co.X, 2).embedding, 1e-8);
  ok(nz2.every(x => x === 1), 'k=2 时每词只有 1 个非零坐标', JSON.stringify(nz2));
  const pair9 = C.absCosOnePairs(C.svdEmbedding(co.X, 2).embedding, 1e-6);
  ok(pair9.count === 9 && pair9.total === 21, 'k=2 时 |cos|=1 的词对 = 9/21 = 42.9%',
    pair9.count + '/' + pair9.total);

  ok(F.V === 2000, '词频表 V = 2000', String(F.V));
  ok(F.tokens_in_vocab === 9846798, 'top-V 内计数和 = 9,846,798', String(F.tokens_in_vocab));
  ok(F.counts[F.words.indexOf('the')] === 677483, 'the 频次 = 677483', String(F.counts[F.words.indexOf('the')]));
  ok(F.words.slice(0, 4).join(',') === 'the,and,a,of', '前 4 个高频词 = the,and,a,of', F.words.slice(0, 4).join(','));

  const nd = C.noiseDistribution(F.counts, 0.75);
  near('α=0.75 熵 = 6.7838', nd.entropy, 6.7838, 5e-5);
  near('α=0.75 时 the = 2.715%', nd.p[0] * 100, 2.715, 5e-4);
  near('α=1.0 熵 = 5.8683', C.noiseDistribution(F.counts, 1.0).entropy, 5.8683, 5e-5);
  near('α=0.0 熵 = 7.6009', C.noiseDistribution(F.counts, 0).entropy, 7.6009, 5e-5);

  const tree = C.buildHuffman(F.counts);
  ok(tree.paths[0] === '1011', 'the 的哈夫曼路径 = 1011', tree.paths[0]);
  ok(tree.depths[0] === 4, 'the 的深度 = 4', String(tree.depths[0]));
  ok(Math.max.apply(null, tree.depths) === 14, '最长路径 = 14', String(Math.max.apply(null, tree.depths)));
  ok(Math.min.apply(null, tree.depths) === 4, '最短路径 = 4', String(Math.min.apply(null, tree.depths)));
  near('加权平均路径长 = 8.491', C.weightedPathLength(F.counts, tree.depths), 8.491, 5e-4);
  ok(C.collectInternalNodes(tree.root).list.length === 1999, '内部节点数 = 1999 = W−1',
    String(C.collectInternalNodes(tree.root).list.length));
  ok(C.balancedDepth(2000) === 11, '平衡树深度 = 11 = ⌈log₂2000⌉', String(C.balancedDepth(2000)));

  const mc = C.mulAddCounts(100000, 300, 5, 17);
  ok(mc.naive === 30000000, 'V=1e5, D=300：naive = 3.0e7', String(mc.naive));
  ok(mc.hs === 5100 && mc.neg === 1800, 'HS = 5,100 / NEG = 1,800', mc.hs + '/' + mc.neg);
  const mc2 = C.mulAddCounts(69, 32, 5, 17);
  ok(mc2.naive === 2208 && mc2.neg === 192, 'V=69, D=32：2208 vs 192', mc2.naive + '/' + mc2.neg);
}

/* ============================================================
 * 6. 交付前检查清单里能自动化的部分
 * ============================================================ */
section('6. 交付前检查清单（可自动化的部分）');
{
  ok(CH.honesty.length > 0, '"未能验证的部分"清单非空（' + CH.honesty.length + ' 条）');
  ok(CH.glossary.length >= 30, '术语表 ≥ 30 条（' + CH.glossary.length + ' 条）');
  ok(CH.formulas.length >= 8, '公式速查 ≥ 8 条（' + CH.formulas.length + ' 条）');
  ok(!!CH.params && CH.params.rows.length === 3, '参数/复杂度卡齐全');

  // 每个「先猜后对」都必须标实测来源 —— 否则那个数字无从复核
  let noSrc = [];
  CH.sections.forEach(s => s.blocks.forEach(b => { if (b.t === 'predict' && !b.source) noSrc.push(s.id + ':' + b.id); }));
  ok(noSrc.length === 0, '每个先猜后对的数值题都标了实测来源', noSrc.join(','));

  // 段落里不许出现"大约/一般来说/差不多"这类无定义词（用户的硬要求）
  const banned = /(大约|大概|差不多|一般来说|通常情况下)/;
  const hits = [];
  CH.sections.forEach(s => s.blocks.forEach(b => {
    ['md', 'title', 'note', 'q'].forEach(k => { if (typeof b[k] === 'string' && banned.test(b[k])) hits.push(s.id + '.' + b.t + '.' + k); });
  }));
  ok(hits.length === 0, '正文里没有"大约/差不多"这类模糊词', hits.join(', '));
}

/* ============================================================
 * 汇总
 * ============================================================ */
console.log('\n' + '='.repeat(64));
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail) {
  console.log('\n失败清单：');
  failures.forEach(f => console.log('  - ' + f));
}
console.log('='.repeat(64));
process.exit(fail ? 1 : 0);
