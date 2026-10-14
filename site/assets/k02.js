/* ================================================================
   K02 · 神经网络与反向传播 — 全部交互逻辑
   纯原生 JS，离线可跑，无依赖。
   ================================================================ */
(function () {
'use strict';

/* ---------------- 工具 ---------------- */
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
var SVGNS = 'http://www.w3.org/2000/svg';
function sEl(tag, attrs) {
  var e = document.createElementNS(SVGNS, tag);
  if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  return e;
}
function toast(msg) {
  var t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.classList.remove('show'); }, 2200);
}

/* ---------------- 存档 ---------------- */
var SAVE_KEY = 'cs224n_k02_v2';
var save = { checks: {}, quiz: {}, tasks: {}, selftest: {}, scene: 0 };
try {
  var raw = localStorage.getItem(SAVE_KEY);
  if (raw) save = JSON.parse(raw);
} catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

var TOTAL = 14; // 6 检验点 + 6 期末题 + 1 XOR 任务 + 1 合书自测
function score() {
  var s = 0;
  Object.keys(save.checks).forEach(function (k) { if (save.checks[k]) s++; });
  Object.keys(save.quiz).forEach(function (k) { if (save.quiz[k] === true) s++; });
  if (save.tasks._point) s++;
  if (save.selftest._point) s++;
  return s;
}
function refreshProgress() {
  var s = score();
  $('#progressFill').style.width = (s / TOTAL * 100) + '%';
  $('#progressLabel').textContent = s + ' / ' + TOTAL;
  var fs = $('#finalScore'); if (fs) fs.textContent = s + ' / ' + TOTAL;
  var msg = $('#finalMsg');
  if (msg) {
    if (s >= 14) msg.textContent = '满分。闸门 1 已开——拿张白纸，把两层 MLP 的 ∂L/∂W₁ 不看书默推一遍，然后去 T2 验收。';
    else if (s >= 10) msg.textContent = '主线已通。剩下的分多在「合书自测」——反向传播必须能讲出来才算会。';
    else if (s >= 5) msg.textContent = '过半。建议重跑场景 3 的计算图推演和场景 7 的闸门推导。';
    else msg.textContent = '按顺序走 10 个场景。场景 7 的推导是本章命门，别跳。';
  }
}

/* ---------------- 主题（与 K01 共享） ---------------- */
var themeBtn = $('#themeBtn');
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  themeBtn.textContent = t === 'dark' ? '☾ 浅色' : '☀ 深色';
}
applyTheme(localStorage.getItem('k01_theme') || 'dark');
themeBtn.addEventListener('click', function () {
  var cur = document.documentElement.getAttribute('data-theme');
  var nxt = cur === 'dark' ? 'light' : 'dark';
  applyTheme(nxt);
  localStorage.setItem('k01_theme', nxt);
});

/* ---------------- 场景路由 ---------------- */
var scenes = $$('.scene');
var N = scenes.length;
var dotsBox = $('#dots');
var SCENE_NAMES = ['封面', '线性之死', '非线性判定单元', '计算图', '单节点规则', '矩阵微积分', 'softmax 梯度', '闸门推导', '梯度检查', '激活函数', '收官'];
for (var i = 0; i < N; i++) {
  (function (i) {
    var d = el('span', 'dot');
    d.title = SCENE_NAMES[i] || ('场景 ' + i);
    d.addEventListener('click', function () { go(i); });
    dotsBox.appendChild(d);
  })(i);
}
var inited = {};
function go(i) {
  i = Math.max(0, Math.min(N - 1, i));
  scenes.forEach(function (s, j) { s.classList.toggle('active', j === i); });
  $$('.dot', dotsBox).forEach(function (d, j) { d.classList.toggle('active', j === i); });
  save.scene = i; persist();
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (!inited[i]) { inited[i] = true; (SCENE_INIT[i] || function () {})(); }
  try { history.replaceState(null, '', '#' + i); } catch (e) {}
}
$('#prevBtn').addEventListener('click', function () { go(save.scene - 1); });
$('#nextBtn').addEventListener('click', function () { go(save.scene + 1); });
document.addEventListener('keydown', function (e) {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight') go(save.scene + 1);
  if (e.key === 'ArrowLeft') go(save.scene - 1);
});

/* 封面：场景地图 + 开始 */
(function () {
  var map = $('#sceneMap');
  for (var i = 1; i < N; i++) {
    (function (i) {
      var c = el('div', 'map-card');
      c.innerHTML = '<div class="num">' + String(i).padStart(2, '0') + '</div><div class="ttl">' + SCENE_NAMES[i] + '</div>';
      c.addEventListener('click', function () { go(i); });
      map.appendChild(c);
    })(i);
  }
  $('#startBtn').addEventListener('click', function () { go(1); });
})();

/* ---------------- 检验点 ---------------- */
var CP_ANSWERS = { cp1: '1', cp2: '1', cp3: '1', cp4: '1', cp5: '0', cp6: '1' };
var CP_EXPLAIN = {
  cp1: '对。A 两点连线的中点 = B 两点连线的中点 = (0.5, 0.5)：两条同类连线在此交叉，任何一条直线都会把其中两点判反，所以至少错一个——这就是线性不可分。',
  cp2: '对。结合律：W₃W₂W₁ 还是一个矩阵。深度必须配非线性才有意义。',
  cp3: '对。z₁⁽²⁾=−2<0，ReLU 局部导数为 0，上游梯度被乘成 0，整行不再更新。',
  cp4: '对。a 有两条出边：经 a·b 贡献 b=5，经 +a 贡献 1，总梯度 5+1=6。',
  cp5: '对。δ 是 (4×1)，xᵀ 是 (1×3)，外积 (4×3)，与 W 同形——这就是形状约定。',
  cp6: '对。先 W₂ᵀ(p−y) 传过第二个线性层，再 ⊙ ReLU 掩码传过激活，最后才轮到外积 xᵀ。'
};
$$('.checkpoint').forEach(function (cp) {
  var id = cp.getAttribute('data-check');
  var fb = $('.cp-feedback', cp);
  var opts = $$('.quiz-opt', cp);
  if (save.checks[id]) {
    opts.forEach(function (o) { if (o.getAttribute('data-v') === CP_ANSWERS[id]) o.classList.add('correct'); });
    fb.textContent = CP_EXPLAIN[id]; fb.classList.add('good');
    return;
  }
  opts.forEach(function (o) {
    o.addEventListener('click', function () {
      if (save.checks[id]) return;
      var v = o.getAttribute('data-v');
      if (v === CP_ANSWERS[id]) {
        save.checks[id] = true; persist();
        o.classList.add('correct');
        fb.textContent = CP_EXPLAIN[id]; fb.className = 'cp-feedback good';
        refreshProgress();
        toast('检验点通过 +1');
      } else {
        o.classList.add('wrong');
        fb.textContent = '再想想——可以把上面的实验再做一遍。';
        fb.className = 'cp-feedback bad';
        setTimeout(function () { o.classList.remove('wrong'); }, 900);
      }
    });
  });
});

/* ================================================================
   各场景初始化（懒加载）
   ================================================================ */
var SCENE_INIT = {};

/* ---------- 场景 1：XOR ---------- */
SCENE_INIT[1] = function () {
  var svg = $('#xorSvg');
  var W = 360, PAD = 34, XMIN = -0.4, XMAX = 1.8;
  function sx(x) { return PAD + (x - XMIN) / (XMAX - XMIN) * (W - 2 * PAD); }
  function sy(y) { return W - PAD - (y - XMIN) / (XMAX - XMIN) * (W - 2 * PAD); }
  var PTS = [ // x1, x2, cls (0=A, 1=B)
    [0, 0, 0], [1, 1, 0], [1, 0, 1], [0, 1, 1]
  ];
  var mapped = false;
  function relu(z) { return Math.max(0, z); }
  function mapPt(p) { return [relu(p[0] + p[1] - 0.5), relu(1.5 - p[0] - p[1])]; }

  // 底：网格 + 坐标轴
  for (var g = 0; g <= 2; g++) {
    [0, 0.5, 1, 1.5].forEach(function (t) {
      svg.appendChild(sEl('line', { x1: sx(t), y1: sy(XMIN), x2: sx(t), y2: sy(XMAX), stroke: 'rgba(148,163,184,.10)' }));
      svg.appendChild(sEl('line', { x1: sx(XMIN), y1: sy(t), x2: sx(XMAX), y2: sy(t), stroke: 'rgba(148,163,184,.10)' }));
    });
    break;
  }
  var lineEl = sEl('line', { stroke: '#e2e8f0', 'stroke-width': 2.5, 'stroke-dasharray': '7 5' });
  svg.appendChild(lineEl);
  var ptEls = PTS.map(function (p) {
    var grp = sEl('g');
    var shape;
    if (p[2] === 0) {
      shape = sEl('circle', { r: 11, fill: 'rgba(56,189,248,.25)', stroke: '#38bdf8', 'stroke-width': 2.5 });
    } else {
      shape = sEl('rect', { x: -9, y: -9, width: 18, height: 18, transform: 'rotate(45)', fill: 'rgba(251,191,36,.22)', stroke: '#fbbf24', 'stroke-width': 2.5 });
    }
    grp.appendChild(shape);
    svg.appendChild(grp);
    return grp;
  });
  var noteEls = PTS.map(function (p, i) {
    var t = sEl('text', { 'font-size': 12, 'text-anchor': 'middle', fill: 'rgba(226,232,240,.75)', 'font-weight': 700 });
    svg.appendChild(t);
    return t;
  });

  function curPts() { return mapped ? PTS.map(mapPt) : PTS; }

  function render() {
    var theta = (+$('#xorTheta').value) * Math.PI / 180;
    var c = (+$('#xorOff').value) / 100;
    $('#xorThetaV').textContent = $('#xorTheta').value + '°';
    $('#xorOffV').textContent = c.toFixed(2);
    var nx = Math.cos(theta), ny = Math.sin(theta);
    // 直线：n·p = c；方向 d = (−ny, nx)，中心 p0 = c·n
    var x0 = c * nx, y0 = c * ny, dx = -ny, dy = nx, T = 4;
    lineEl.setAttribute('x1', sx(x0 - dx * T)); lineEl.setAttribute('y1', sy(y0 - dy * T));
    lineEl.setAttribute('x2', sx(x0 + dx * T)); lineEl.setAttribute('y2', sy(y0 + dy * T));
    var pts = curPts(), good = 0;
    pts.forEach(function (p, i) {
      var px = sx(p[0]), py = sy(p[1]);
      // B 类两点映射后重合，略作偏移避免完全遮挡
      if (mapped && PTS[i][2] === 1) { px += i === 2 ? -12 : 12; py += i === 2 ? -6 : 6; }
      ptEls[i].setAttribute('transform', 'translate(' + px + ',' + py + ')');
      var pred = (nx * p[0] + ny * p[1] > c) ? 0 : 1;
      var ok = pred === PTS[i][2];
      if (ok) good++;
      ptEls[i].style.opacity = ok ? '1' : '.45';
      noteEls[i].setAttribute('x', px); noteEls[i].setAttribute('y', py - 18);
      noteEls[i].textContent = (PTS[i][2] === 0 ? 'A' : 'B') + (ok ? '' : ' ✗');
    });
    $('#xorScore').textContent = good + ' / 4';
    if (mapped && good === 4 && !save.tasks._point) {
      save.tasks._point = true; persist(); refreshProgress();
      toast('✓ 任务完成：非线性映射后 4/4 可分，+1 分');
    }
    $('#xorNote').innerHTML = mapped
      ? '映射后的空间里，A 两点落在 (0, 1.5) 与 (1.5, 0)，B 两点被一起压到 (0.5, 0.5)——<b>找条直线拿 4/4 试试</b>（提示：θ ≈ 45°，c ≈ 1.0~1.3）。'
      : '你会发现：不管怎么转、怎么挪，<b>最多分对 3 个</b>。这不是你手残——下面证明给你看。';
  }
  $('#xorTheta').addEventListener('input', render);
  $('#xorOff').addEventListener('input', render);
  $('#xorMapBtn').addEventListener('click', function () {
    mapped = true;
    this.style.display = 'none'; $('#xorBackBtn').style.display = '';
    $('#xorTheta').value = 45; $('#xorOff').value = 110;
    render();
  });
  $('#xorBackBtn').addEventListener('click', function () {
    mapped = false;
    this.style.display = 'none'; $('#xorMapBtn').style.display = '';
    render();
  });
  render();
};

/* ---------- 场景 3：计算图推演 ---------- */
SCENE_INIT[3] = function () {
  var svg = $('#cgSvg');
  var nodes = [
    { x: 100, name: 'x', val: '[1, 2]', grad: '[1, 0]' },
    { x: 330, name: 'z₁', val: '[1, −2]', grad: '[1, 0]' },
    { x: 560, name: 'h', val: '[1, 0]', grad: '[1, 1]' },
    { x: 790, name: 's', val: '1.0', grad: '1' }
  ];
  var edges = [
    { a: 0, b: 1, lab: '仿射 W₁,b₁' },
    { a: 1, b: 2, lab: 'ReLU' },
    { a: 2, b: 3, lab: '仿射 W₂,b₂' }
  ];
  edges.forEach(function (e) {
    var x1 = nodes[e.a].x + 46, x2 = nodes[e.b].x - 46;
    svg.appendChild(sEl('line', { x1: x1, y1: 120, x2: x2, y2: 120, stroke: 'rgba(148,163,184,.5)', 'stroke-width': 2 }));
    var t = sEl('text', { x: (x1 + x2) / 2, y: 105, 'text-anchor': 'middle', 'font-size': 12, fill: 'rgba(148,163,184,.9)' });
    t.textContent = e.lab; svg.appendChild(t);
    var t2 = sEl('text', { x: (x1 + x2) / 2, y: 143, 'text-anchor': 'middle', 'font-size': 11, fill: 'rgba(251,191,36,.85)' });
    t2.textContent = ''; svg.appendChild(t2);
    e.gradEl = t2;
  });
  var nodeEls = nodes.map(function (n) {
    var g = sEl('g', { 'class': 'cg-node' });
    g.appendChild(sEl('rect', { x: n.x - 46, y: 84, width: 92, height: 72, rx: 12, fill: 'var(--bg-3)', stroke: 'rgba(148,163,184,.35)', 'stroke-width': 1.5 }));
    var nm = sEl('text', { x: n.x, y: 112, 'text-anchor': 'middle', 'class': 'cg-name' });
    nm.textContent = n.name; g.appendChild(nm);
    var val = sEl('text', { x: n.x, y: 136, 'text-anchor': 'middle', 'class': 'cg-val' });
    val.textContent = ''; g.appendChild(val);
    var gr = sEl('text', { x: n.x, y: 196, 'text-anchor': 'middle', 'class': 'cg-grad' });
    gr.textContent = ''; g.appendChild(gr);
    svg.appendChild(g);
    return { g: g, val: val, gr: gr };
  });
  var edgeGradLabels = ['∂s/∂W₁ = δ·xᵀ = [[1,2],[0,0]]', '⊙ 1[z₁>0]', '∂s/∂W₂ = 1·hᵀ = [[1,0]]'];

  var STEPS = [
    { cap: '前向 ①：z₁ = W₁x + b₁ = [1·1+0·2, 0·1+(−1)·2] = [1, −2]。', n: 1, v: true },
    { cap: '前向 ②：h = ReLU(z₁) = [max(1,0), max(−2,0)] = [1, 0]——第 2 个单元进死区，输出被压成 0。', n: 2, v: true },
    { cap: '前向 ③：s = W₂h + b₂ = 1·1 + 1·0 = 1.0。前向结束，损失/输出的值到手。', n: 3, v: true },
    { cap: '反向 ⓪：从终点出发，∂s/∂s = 1（自己对自己的导数）。', n: 3, g: true },
    { cap: '反向 ①：过「仿射 W₂,b₂」。对参数：∂s/∂W₂ = 上游·输入ᵀ = 1·hᵀ = [[1,0]]；继续前传：∂s/∂h = W₂ᵀ·1 = [1,1]。', n: 2, g: true, e: 2 },
    { cap: '反向 ②：过「ReLU」。局部导数 = 1[z₁>0] = [1,0]（z₁=−2 的单元导数为 0）。下游 = [1,1] ⊙ [1,0] = [1,0]——第 2 单元的梯度在此被截断。', n: 1, g: true, e: 1 },
    { cap: '反向 ③：过「仿射 W₁,b₁」。∂s/∂W₁ = [1,0]ᵀ·[1,2] = [[1,2],[0,0]]；∂s/∂x = W₁ᵀ·[1,0] = [1,0]（若 x 是词向量，它就是 embedding 的更新信号）。', n: 0, g: true, e: 0 },
    { cap: '收工：9 个数全部算完，本机中心差分对账 max|差| = 2.2×10⁻¹³。注意 ∂s/∂W₁ 第 2 行 = [0,0]——死区单元没有梯度回流。', done: true }
  ];
  var idx = 0;
  function render() {
    nodeEls.forEach(function (ne, i) {
      ne.val.textContent = ''; ne.gr.textContent = '';
      ne.g.classList.remove('lit');
    });
    edges.forEach(function (e) { e.gradEl.textContent = ''; });
    nodes.forEach(function (n, i) {
      for (var k = 0; k < Math.min(idx, STEPS.length); k++) {
        var st = STEPS[k];
        if (st.n === i && st.v) nodeEls[i].val.textContent = n.val;
        if (st.n === i && st.g) nodeEls[i].gr.textContent = '∂s/∂' + n.name + ' = ' + n.grad;
      }
    });
    edges.forEach(function (e, i) {
      for (var k = 0; k < Math.min(idx, STEPS.length); k++) {
        if (STEPS[k].e === i) e.gradEl.textContent = edgeGradLabels[i];
      }
    });
    if (idx > 0 && idx <= STEPS.length) {
      var cur = STEPS[idx - 1];
      if (cur.n !== undefined) nodeEls[cur.n].g.classList.add('lit');
      $('#cgCaption').textContent = cur.cap;
    } else {
      $('#cgCaption').textContent = '前向：从左到右算每个节点的值。反向：从右到左传梯度，规则只有一条——下游 = 上游 × 局部。';
    }
    $('#cgNext').textContent = idx >= STEPS.length ? '已完成 ✓' : ('下一步（' + Math.min(idx + 1, STEPS.length) + '/' + STEPS.length + '）→');
  }
  $('#cgNext').addEventListener('click', function () {
    if (idx >= STEPS.length) { toast('推演完毕——合上书，自己在纸上重走一遍'); return; }
    idx++; render();
  });
  $('#cgReset').addEventListener('click', function () { idx = 0; render(); });
  render();
};

/* ---------- 场景 4：分叉相加 ---------- */
SCENE_INIT[4] = function () {
  function render() {
    var a = (+$('#branchA').value) / 10;
    $('#branchAV').textContent = a.toFixed(1);
    $('#brY').textContent = (a * a + a).toFixed(2);
    $('#brP1').textContent = (2 * a).toFixed(2);
    $('#brP2').textContent = '1.00';
    $('#brTot').textContent = (2 * a + 1).toFixed(2);
  }
  $('#branchA').addEventListener('input', render);
  render();
};

/* ---------- 场景 5：形状追踪 ---------- */
SCENE_INIT[5] = function () {
  function render() {
    var m = +$('#shapeM').value, n = +$('#shapeN').value;
    $('#shapeMV').textContent = m;
    $('#shapeNV').textContent = n;
    $('#shX').textContent = n + ' 维';
    $('#shW').textContent = m + '×' + n;
    $('#shZ').textContent = m + ' 维';
    $('#shDelta').textContent = m + ' 维';
    $('#shGW').textContent = m + '×' + n;
    $('#shGB').textContent = m + ' 维';
    $('#shGX').textContent = n + ' 维';
  }
  $('#shapeM').addEventListener('input', render);
  $('#shapeN').addEventListener('input', render);
  render();
};

/* ---------- 场景 6：softmax + CE ---------- */
SCENE_INIT[6] = function () {
  var names = ['类 1（正确）', '类 2', '类 3'];
  var barsBox = $('#smBars');
  var barFills = [], barNums = [];
  for (var i = 0; i < 3; i++) {
    var col = el('div', 'bar-col');
    var num = el('div', 'bar-num', '—');
    var track = el('div', 'bar-track'); track.style.height = '120px';
    var fill = el('div', 'bar-fill');
    if (i === 0) fill.style.background = 'linear-gradient(180deg, var(--ok), var(--accent))';
    track.appendChild(fill);
    col.appendChild(num); col.appendChild(track); col.appendChild(el('div', 'bar-label', names[i]));
    barsBox.appendChild(col);
    barFills.push(fill); barNums.push(num);
  }
  function render() {
    var z = [ (+$('#smZ1').value) / 10, (+$('#smZ2').value) / 10, (+$('#smZ3').value) / 10 ];
    $('#smZ1V').textContent = z[0].toFixed(1);
    $('#smZ2V').textContent = z[1].toFixed(1);
    $('#smZ3V').textContent = z[2].toFixed(1);
    var m = Math.max(z[0], z[1], z[2]);
    var e = z.map(function (v) { return Math.exp(v - m); });
    var S = e[0] + e[1] + e[2];
    var p = e.map(function (v) { return v / S; });
    p.forEach(function (v, i) {
      barFills[i].style.height = Math.max(1.5, v * 100) + '%';
      barNums[i].textContent = (v * 100).toFixed(1) + '%';
    });
    $('#smJ').textContent = (-Math.log(p[0])).toFixed(4);
    $('#smG1').textContent = (p[0] - 1).toFixed(3);
    $('#smG2').textContent = (p[1]).toFixed(3);
    $('#smG3').textContent = (p[2]).toFixed(3);
  }
  ['smZ1', 'smZ2', 'smZ3'].forEach(function (id) { $('#' + id).addEventListener('input', render); });
  render();
};

/* ---------- 场景 8：中心差分 ---------- */
SCENE_INIT[8] = function () {
  var EPS = 2.2e-16;
  function central(h) { return (Math.pow(1 + h, 3) - Math.pow(1 - h, 3)) / (2 * h); }
  function render() {
    var lg = (+$('#fdH').value) / 10;
    var h = Math.pow(10, lg);
    $('#fdHV').textContent = '1e' + (lg === Math.round(lg) ? lg : lg.toFixed(1));
    var est = central(h);
    var err = Math.abs(est - 3);
    $('#fdEst').textContent = est.toPrecision(10);
    $('#fdErr').textContent = err === 0 ? '0（精确）' : err.toExponential(1);
    var zone;
    if (h > 6e-6) zone = '截断区（~h²）';
    else if (h > 1e-12) zone = '甜区';
    else zone = '舍入区（~ε/h）';
    $('#fdZone').textContent = zone;
    marker(lg, err);
  }
  // 误差曲线（实算）
  var svg = $('#fdCurve'), W = 640, H = 190, padL = 46, padB = 28, padT = 14, padR = 14;
  var LG0 = -16, LG1 = 0, E0 = -17, E1 = 1;
  function sx(lg) { return padL + (lg - LG0) / (LG1 - LG0) * (W - padL - padR); }
  function sy(le) { return padT + (E1 - Math.max(E0, Math.min(E1, le))) / (E1 - E0) * (H - padT - padB); }
  svg.appendChild(sEl('line', { x1: padL, y1: H - padB, x2: W - padR, y2: H - padB, stroke: 'rgba(148,163,184,.4)' }));
  svg.appendChild(sEl('line', { x1: padL, y1: padT, x2: padL, y2: H - padB, stroke: 'rgba(148,163,184,.4)' }));
  for (var gx = -16; gx <= 0; gx += 4) {
    var t = sEl('text', { x: sx(gx), y: H - padB + 16, 'text-anchor': 'middle', 'font-size': 10, fill: 'rgba(148,163,184,.7)' });
    t.textContent = '1e' + gx; svg.appendChild(t);
  }
  [0, -8, -16].forEach(function (gy) {
    var t = sEl('text', { x: padL - 6, y: sy(gy) + 3, 'text-anchor': 'end', 'font-size': 10, fill: 'rgba(148,163,184,.7)' });
    t.textContent = '1e' + gy; svg.appendChild(t);
  });
  var pts = [];
  for (var lg = -16; lg <= 0.001; lg += 0.2) {
    var h = Math.pow(10, lg);
    var err = Math.abs(central(h) - 3);
    pts.push(sx(lg) + ' ' + sy(Math.log10(Math.max(err, 1e-17))));
  }
  svg.appendChild(sEl('path', { d: 'M' + pts.join(' L'), fill: 'none', stroke: '#38bdf8', 'stroke-width': 2.5 }));
  // 谷底参考线 h* = 6e-6
  var tx = sEl('line', { x1: sx(Math.log10(6e-6)), y1: padT, x2: sx(Math.log10(6e-6)), y2: H - padB, stroke: 'rgba(52,211,153,.5)', 'stroke-dasharray': '4 4' });
  svg.appendChild(tx);
  var tt = sEl('text', { x: sx(Math.log10(6e-6)) + 5, y: padT + 12, 'font-size': 10, fill: '#34d399' });
  tt.textContent = 'h* ≈ 6e-6'; svg.appendChild(tt);
  var mk = sEl('circle', { r: 6, fill: '#fbbf24', stroke: '#0b1020', 'stroke-width': 2 });
  svg.appendChild(mk);
  function marker(lg, err) {
    mk.setAttribute('cx', sx(lg));
    mk.setAttribute('cy', sy(Math.log10(Math.max(err, 1e-17))));
  }
  $('#fdH').addEventListener('input', render);
  render();
};

/* ---------- 场景 9：激活函数画廊 ---------- */
SCENE_INIT[9] = function () {
  var svg = $('#actSvg');
  var showD = false;
  var FNS = [
    { name: 'sigmoid σ(z)', f: function (z) { return 1 / (1 + Math.exp(-z)); }, d: function (z) { var s = 1 / (1 + Math.exp(-z)); return s * (1 - s); } },
    { name: 'tanh(z)', f: function (z) { return Math.tanh(z); }, d: function (z) { var t = Math.tanh(z); return 1 - t * t; } },
    { name: 'ReLU(z)', f: function (z) { return Math.max(0, z); }, d: function (z) { return z > 0 ? 1 : 0; } },
    { name: 'GELU(z) ≈ z·σ(1.702z)', f: function (z) { return z / (1 + Math.exp(-1.702 * z)); }, d: function (z) { var s = 1 / (1 + Math.exp(-1.702 * z)); return s + z * 1.702 * s * (1 - s); } }
  ];
  var panels = [[20, 16], [340, 16], [20, 216], [340, 216]];
  var PW = 280, PH = 168, ZR = 4;
  function px(ox, z) { return ox + (z + ZR) / (2 * ZR) * PW; }
  function py(oy, v, vmin, vmax) { return oy + PH - (v - vmin) / (vmax - vmin) * PH; }
  function draw() {
    svg.innerHTML = '';
    FNS.forEach(function (fn, i) {
      var ox = panels[i][0], oy = panels[i][1];
      var vmin = -1.6, vmax = i < 2 ? 1.6 : 4.2;
      svg.appendChild(sEl('rect', { x: ox, y: oy, width: PW, height: PH, rx: 10, fill: 'var(--bg-3)', stroke: 'rgba(148,163,184,.15)' }));
      // 零线
      svg.appendChild(sEl('line', { x1: ox, y1: py(oy, 0, vmin, vmax), x2: ox + PW, y2: py(oy, 0, vmin, vmax), stroke: 'rgba(148,163,184,.25)' }));
      svg.appendChild(sEl('line', { x1: px(ox, 0), y1: oy, x2: px(ox, 0), y2: oy + PH, stroke: 'rgba(148,163,184,.18)' }));
      var t = sEl('text', { x: ox + 10, y: oy + 18, 'font-size': 12, 'font-weight': 700, fill: 'rgba(226,232,240,.9)' });
      t.textContent = fn.name; svg.appendChild(t);
      // 函数曲线
      var pts = [];
      for (var z = -ZR; z <= ZR; z += 0.08) pts.push(px(ox, z) + ' ' + py(oy, fn.f(z), vmin, vmax));
      svg.appendChild(sEl('path', { d: 'M' + pts.join(' L'), fill: 'none', stroke: '#38bdf8', 'stroke-width': 2.5 }));
      if (showD) {
        var dmax = 1.2;
        var dpts = [];
        for (var z2 = -ZR; z2 <= ZR; z2 += 0.08) dpts.push(px(ox, z2) + ' ' + py(oy, fn.d(z2), vmin, vmax));
        svg.appendChild(sEl('path', { d: 'M' + dpts.join(' L'), fill: 'none', stroke: '#fbbf24', 'stroke-width': 2, 'stroke-dasharray': '6 4' }));
        var dt = sEl('text', { x: ox + PW - 10, y: oy + 18, 'font-size': 11, 'text-anchor': 'end', fill: '#fbbf24' });
        dt.textContent = "f′(z)"; svg.appendChild(dt);
      }
    });
  }
  $('#actDerivBtn').addEventListener('click', function () {
    showD = !showD;
    this.textContent = showD ? '隐藏导数' : '叠加显示导数 f′(z)';
    draw();
  });
  draw();
};

/* ---------- 场景 10：期末题 + 合书自测 ---------- */
SCENE_INIT[10] = function () {
  /* --- SGD 1D 下降演示 --- */
  (function () {
    var TH0 = -1, MIN = 3;
    var theta = TH0, steps = 0;
    var svg = $('#sgdCurve');
    if (!svg) return;
    var W = 680, H = 260, padL = 50, padR = 30, padT = 24, padB = 40;
    var TMIN = -1.5, TMAX = 7.5, JMAX = 20;
    function sx(t) { return padL + (t - TMIN) / (TMAX - TMIN) * (W - padL - padR); }
    function sy(j) { return H - padB - Math.min(j, JMAX) / JMAX * (H - padT - padB); }
    var pts = [];
    for (var t = TMIN; t <= TMAX + 1e-9; t += 0.1) pts.push(sx(t) + ',' + sy((t - MIN) * (t - MIN)));
    svg.appendChild(sEl('polyline', { points: pts.join(' '), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.5 }));
    svg.appendChild(sEl('line', { x1: padL, y1: H - padB, x2: W - padR, y2: H - padB, stroke: 'var(--border)' }));
    svg.appendChild(sEl('line', { x1: sx(MIN), y1: padT, x2: sx(MIN), y2: H - padB, stroke: 'rgba(52,211,153,.5)', 'stroke-dasharray': '4 4' }));
    var tOpt = sEl('text', { x: sx(MIN) + 4, y: padT + 12, 'font-size': 11, fill: 'var(--ok)' });
    tOpt.textContent = 'θ*=3'; svg.appendChild(tOpt);
    var tL = sEl('text', { x: padL, y: H - padB + 18, 'font-size': 11, fill: 'var(--fg-3)' });
    tL.textContent = 'θ'; svg.appendChild(tL);
    var dot = sEl('circle', { r: 7, fill: 'var(--warn)', stroke: 'var(--bg-0)', 'stroke-width': 2 });
    svg.appendChild(dot);
    function render() {
      var j = (theta - MIN) * (theta - MIN);
      var g = 2 * (theta - MIN);
      $('#sgdTheta').textContent = theta.toFixed(2);
      $('#sgdJ').textContent = j.toFixed(2);
      $('#sgdGrad').textContent = g.toFixed(2);
      $('#sgdStep').textContent = steps;
      dot.setAttribute('cx', sx(Math.max(TMIN, Math.min(TMAX, theta))));
      dot.setAttribute('cy', sy(j));
    }
    $('#sgdAlpha').addEventListener('input', function () {
      $('#sgdAlphaV').textContent = ((+this.value) / 100).toFixed(2);
      render();
    });
    $('#sgdStepBtn').addEventListener('click', function () {
      var a = (+$('#sgdAlpha').value) / 100;
      theta = theta - a * 2 * (theta - MIN);
      steps++;
      if (Math.abs(theta - MIN) < 1e-3) $('#sgdNote').innerHTML = '✓ 已经到谷底附近（θ≈3），梯度≈0，几乎不再移动——这就是"收敛"。';
      else if (a > 0.95) $('#sgdNote').innerHTML = 'α 接近甚至超过 1 会剧烈震荡、甚至越走越远（发散）——学习率过大的典型现象。试试把 α 拖小。';
      else $('#sgdNote').innerHTML = '第 ' + steps + ' 步：θ ← θ − α·梯度。损失在下降。继续点，看它一步步收敛到谷底。';
      render();
    });
    $('#sgdResetBtn').addEventListener('click', function () {
      theta = TH0; steps = 0;
      $('#sgdNote').textContent = '已重置到 θ=−1（损失 16）。';
      render();
    });
    render();
  })();

  var QUIZ = [
    { q: '没有非线性激活时，三层线性网络 W₃(W₂(W₁x)) 的表达能力等价于？', opts: ['一个单矩阵线性变换 W′x', '一个三次多项式', '一个三层决策树'], a: 0 },
    { q: '反向传播里 "+" 节点的行为是？', opts: ['把上游梯度原样分发给每个加数', '把上游梯度全给数值最大的加数', '把两个输入相乘后再传'], a: 0 },
    { q: '一个节点的输出被下游用了两次（两条出边），它的总梯度是？', opts: ['两条支路梯度的较大者', '两条支路梯度的乘积', '两条支路梯度之和'], a: 2 },
    { q: 'softmax + 交叉熵对 logits z 的梯度是？', opts: ['ŷ − y', 'y − ŷ', '−log ŷ · y'], a: 0 },
    { q: '∂s/∂W = δxᵀ 里，δ 和 x 分别是？', opts: ['上游梯度、该层输入', '该层输入、上游梯度', '权重、偏置'], a: 0 },
    { q: '数值梯度检查（中心差分）的正确定位是？', opts: ['训练时替代反向传播', '核对解析梯度的实现，不参与训练', '估计最优学习率'], a: 1 }
  ];
  var box = $('#finalQuiz');
  QUIZ.forEach(function (item, qi) {
    var wrap = el('div');
    wrap.style.margin = '16px 0';
    var qh = el('div', null, (qi + 1) + '. ' + item.q);
    qh.style.fontWeight = '600'; qh.style.marginBottom = '6px';
    wrap.appendChild(qh);
    var fb = el('div', 'cp-feedback');
    item.opts.forEach(function (opt, oi) {
      var o = el('div', 'quiz-opt', String.fromCharCode(65 + oi) + '. ' + opt);
      if (save.quiz['q' + qi] === true && oi === item.a) o.classList.add('correct');
      o.addEventListener('click', function () {
        if (save.quiz['q' + qi] !== undefined) return;
        if (oi === item.a) {
          save.quiz['q' + qi] = true;
          o.classList.add('correct');
          fb.textContent = '✓ 正确'; fb.className = 'cp-feedback good';
        } else {
          save.quiz['q' + qi] = false;
          o.classList.add('wrong');
          $$('.quiz-opt', wrap)[item.a].classList.add('correct');
          fb.textContent = '✗ 已标出正确答案。回到对应场景再看一眼。'; fb.className = 'cp-feedback bad';
        }
        persist(); refreshProgress();
      });
      wrap.appendChild(o);
    });
    wrap.appendChild(fb);
    box.appendChild(wrap);
  });

  var SELF = [
    ['K01 的线性 softmax 分类器死在哪两个地方？', '① 线性决策边界——XOR 这种四个点的问题都解不了；② 输入表示（词向量）固定，不随任务调整。'],
    ['"没有非线性时多层塌成一层"，为什么？', '矩阵乘法结合律：W₂(W₁x) = (W₂W₁)x，两个矩阵的乘积还是一个矩阵。本机实测两种方式输出差 3.3×10⁻¹⁶（= 机器精度）。'],
    ['tanh 和 sigmoid 是什么关系？为什么深度网络先试 ReLU？', 'tanh(z) = 2σ(2z) − 1，只是缩放平移过的 sigmoid。先试 ReLU：正半轴导数恒 1，梯度不衰减、计算快；代价是负半轴死区。'],
    ['单节点反向传播的那一条公式？三个词各指什么？', '下游 = 上游 × 局部。上游 = 损失对本节点输出的梯度；局部 = 本节点输出对输入的导数；下游 = 乘完继续往前传的梯度。'],
    ['梯度为什么在分叉处相加？', '同一变量的每条出边都是一条独立的依赖路径。全导数 = 沿所有路径的偏导之和（多元链式法则）。y = a²+a 在 a=3 时 = 2a+1 = 7，实测对账一致。'],
    ['反向传播省的是哪部分计算？', '朴素做法对每个参数单独推整条链，中间因子被重复算 N 次。反向传播从损失出发每层梯度只算一次、存下来复用——前向和反向大 O 复杂度相同。'],
    ['写出 z = Wx + b 的三个梯度。', '∂s/∂W = δxᵀ（外积），∂s/∂b = δ，∂s/∂x = Wᵀδ。δ = 上游梯度 ∂s/∂z。'],
    ['两层 MLP 的 ∂L/∂W₁ 完整链（闸门 1 原题）。', 'p−y →（×W₂ᵀ）→ W₂ᵀ(p−y) →（⊙1[z₁>0]）→ ∂L/∂z₁ →（外积 xᵀ）→ ∂L/∂W₁。每层：乘局部 Jacobian；到参数时与该层输入做外积。']
  ];
  var ul = $('#selfTest');
  SELF.forEach(function (pair, i) {
    var li = el('li');
    var q = el('div', 'q');
    q.appendChild(el('span', null, pair[0]));
    q.appendChild(el('span', 'hint', '先合书口述，再点开'));
    var a = el('div', 'a', pair[1]);
    if (save.selftest['s' + i]) li.classList.add('open');
    q.addEventListener('click', function () {
      li.classList.toggle('open');
      if (li.classList.contains('open')) {
        save.selftest['s' + i] = true;
        var opened = SELF.every(function (_, j) { return save.selftest['s' + j]; });
        if (opened && !save.selftest._point) {
          save.selftest._point = true;
          toast('合书自测全部过完 +1 分');
        }
        persist(); refreshProgress();
      }
    });
    li.appendChild(q); li.appendChild(a);
    ul.appendChild(li);
  });

  $('#resetBtn').addEventListener('click', function () {
    if (!confirm('清空本章所有进度，重新学一遍？')) return;
    localStorage.removeItem(SAVE_KEY);
    location.href = 'k02.html';
  });
};

/* ---------------- 推导步进器（事件委托） ---------------- */
document.addEventListener('click', function (e) {
  var next = e.target.closest('[data-step-next]');
  var reset = e.target.closest('[data-step-reset]');
  if (!next && !reset) return;
  var box = (next || reset).closest('.stepper');
  var steps = $$('.step', box);
  if (next) {
    var hidden = steps.filter(function (s) { return !s.classList.contains('show'); });
    if (hidden.length === 0) { toast('推导完毕——合上书，自己默写一遍'); return; }
    hidden[0].classList.add('show');
    if (hidden.length === 1) toast('最后一步了');
  } else {
    steps.forEach(function (s, i) { s.classList.toggle('show', i === 0); });
  }
});

/* ---------------- 启动 ---------------- */
var startScene = 0;
var h = location.hash.replace('#', '');
if (h !== '' && !isNaN(+h)) startScene = +h;
else if (save.scene) startScene = save.scene;
refreshProgress();
go(startScene);

})();
