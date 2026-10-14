/* ================================================================
   K03 · 语言模型与 RNN — 全部交互逻辑
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
var SAVE_KEY = 'cs224n_k03_v2';
var save = { checks: {}, quiz: {}, tasks: {}, selftest: {}, scene: 0 };
try {
  var raw = localStorage.getItem(SAVE_KEY);
  if (raw) save = JSON.parse(raw);
} catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

var TOTAL = 14; // 6 检验点 + 6 期末题 + 1 RNN 任务 + 1 合书自测
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
    if (s >= 14) msg.textContent = '满分。K04 的注意力在等你——RNN 的 bottleneck 就是它的入口。';
    else if (s >= 10) msg.textContent = '主线已通。剩下的分多在「合书自测」——BPTT 要能讲出来才算会。';
    else if (s >= 5) msg.textContent = '过半。建议重跑场景 4 的 RNN 手算和场景 6 的 BPTT 推导。';
    else msg.textContent = '按顺序走 10 个场景。场景 6 的 BPTT 是本章命门，别跳。';
  }
}

/* ---------------- 主题 ---------------- */
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
var SCENE_NAMES = ['封面', 'LM 任务', 'n-gram 之死', '固定窗口 LM', 'RNN 手算', 'Teacher Forcing', 'BPTT', '消失/爆炸', '梯度剪裁', 'Perplexity', '收官'];
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

/* 封面 */
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
var CP_ANSWERS = { cp1: '1', cp2: '1', cp3: '1', cp4: '0', cp5: '2', cp6: '0' };
var CP_EXPLAIN = {
  cp1: '对。链式分解是恒等式，不含近似；近似在"怎么算每个条件概率"。',
  cp2: '对。计数：students opened their 共出现 1000 次，其中 400 次接 books。',
  cp3: '对。窗口永远不够大 + 各位置权重不同（没有对称性）。',
  cp4: '对。训练时喂真实上一词，让每时刻都是条件正确的独立预测题。',
  cp5: '对。0.9²⁰ ≈ 0.12，不是 0.9×20（那是加法）。',
  cp6: '对。剪裁只在 ‖g‖>τ 时触发；‖g‖ 太小时原样返回，对消失无能为力。'
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

/* ---------- 场景 1：链式法则滑块 + 填空 ---------- */
SCENE_INIT[1] = function () {
  var box = $('#chainSliders');
  var vals = [0.90, 0.50, 0.30, 0.60];
  var labels = ['P(w₂|w₁)', 'P(w₃|w₁w₂)', 'P(w₄|w₁w₂w₃)', 'P(w₅|w₁w₂w₃w₄)'];
  var inputs = [];
  labels.forEach(function (lab, i) {
    var wrap = el('div', 'slider-wrap');
    wrap.innerHTML = '<span style="font-size:13px;color:var(--fg-2);min-width:160px;">' + lab + '</span>';
    var inp = el('input');
    inp.type = 'range'; inp.min = '1'; inp.max = '100'; inp.step = '1';
    inp.value = Math.round(vals[i] * 100);
    var val = el('span', 'slider-val mono', vals[i].toFixed(2));
    wrap.appendChild(inp); wrap.appendChild(val);
    box.appendChild(wrap);
    inputs.push({ inp: inp, val: val });
  });
  function render() {
    var p = 1;
    inputs.forEach(function (it, i) {
      var v = (+it.inp.value) / 100;
      it.val.textContent = v.toFixed(2);
      p *= v;
    });
    $('#chainP').textContent = p.toPrecision(3);
    var ce = p > 0 ? -(Math.log(p) / 4) : Infinity;
    $('#chainCE').textContent = isFinite(ce) ? ce.toFixed(2) : '∞';
  }
  inputs.forEach(function (it) { it.inp.addEventListener('input', render); });
  render();

  /* 填空词 */
  var blank = $('#blankWord');
  $$('.word-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      $$('.word-chip').forEach(function (c) { c.classList.toggle('picked', c === chip); });
      blank.textContent = chip.getAttribute('data-bw');
    });
  });
};

/* ---------- 场景 2：n-gram 存储爆炸 ---------- */
SCENE_INIT[2] = function () {
  function render() {
    var n = +$('#ngramN').value;
    $('#ngramNV').textContent = n;
    var V = 10000;
    var cells = Math.pow(V, n);
    $('#ngramCells').textContent = cells >= 1e12 ? cells.toExponential(1).replace('e+', '×10^') : cells.toLocaleString();
    var mem = cells * 8;
    if (mem < 1024) $('#ngramMem').textContent = mem + ' B';
    else if (mem < 1024 * 1024) $('#ngramMem').textContent = (mem / 1024).toFixed(1) + ' KB';
    else if (mem < 1024 * 1024 * 1024) $('#ngramMem').textContent = (mem / 1024 / 1024).toFixed(1) + ' MB';
    else if (mem < 1024 * 1024 * 1024 * 1024) $('#ngramMem').textContent = (mem / 1024 / 1024 / 1024).toFixed(1) + ' GB';
    else $('#ngramMem').textContent = (mem / 1024 / 1024 / 1024 / 1024).toFixed(1) + ' TB';
  }
  $('#ngramN').addEventListener('input', render);
  render();
};

/* ---------- 场景 3：窗口大小滑块 ---------- */
SCENE_INIT[3] = function () {
  function render() {
    var w = +$('#winSize').value;
    $('#winSizeV').textContent = w;
    var d = 100, dh = 200;
    var params = dh * w * d;
    $('#winParams').textContent = (params >= 10000) ? (params / 10000).toFixed(0) + ' 万' : params.toLocaleString();
    $('#winRNN').textContent = (dh * d >= 10000) ? (dh * d / 10000).toFixed(0) + ' 万' : (dh * d).toLocaleString();
  }
  $('#winSize').addEventListener('input', render);
  render();
};

/* ---------- 场景 4：RNN 手算 SVG 推进 ---------- */
SCENE_INIT[4] = function () {
  var svg = $('#rnnSvg');
  var WORDS = ['the', 'cat', 'sat'];
  var Z = [1.00000, 1.38080, 2.44056];
  var H = [0.76159, 0.88113, 0.98494];
  var LOGITS = [0.98494, 0, -0.98494, 0.98494];
  var SOFT = [0.39794, 0.14862, 0.05550, 0.39794];
  var VOCAB = ['the', 'cat', 'dog', 'sat'];

  var CX = [150, 400, 650];
  var CY = 130;
  var cellEls = [];

  // 画静态框架
  for (var t = 0; t < 3; t++) {
    var g = sEl('g', { 'class': 'rnn-cell', id: 'rnnCell' + t });
    // h_t 框
    g.appendChild(sEl('rect', { x: CX[t] - 50, y: CY - 30, width: 100, height: 60, rx: 10, fill: 'var(--bg-3)', stroke: 'rgba(148,163,184,.4)', 'stroke-width': 1.5 }));
    // h_t 标签
    var ht = sEl('text', { x: CX[t], y: CY + 5, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: 'var(--fg)' });
    ht.textContent = 'h' + (t + 1); g.appendChild(ht);
    // x_t 标签
    var xt = sEl('text', { x: CX[t], y: CY + 55, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--fg-2)' });
    xt.textContent = 'x = "' + WORDS[t] + '"'; g.appendChild(xt);
    svg.appendChild(g);
    cellEls.push({ g: g, ht: ht, xt: xt });

    if (t < 2) {
      // 循环箭头
      var arr = sEl('path', { d: 'M' + (CX[t] + 50) + ' ' + CY + ' Q' + (CX[t] + 125) + ' ' + (CY - 50) + ' ' + (CX[t + 1] - 50) + ' ' + CY, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'marker-end': 'url(#arr)' });
      svg.appendChild(arr);
    }
  }

  // 箭头 marker
  var defs = sEl('defs');
  var mk = sEl('marker', { id: 'arr', markerWidth: '8', markerHeight: '8', refX: '7', refY: '4', orient: 'auto' });
  mk.appendChild(sEl('path', { d: 'M0,0 L8,4 L0,8', fill: 'var(--accent)' }));
  defs.appendChild(mk);
  svg.appendChild(defs);

  // softmax 输出区（在 h3 上方）
  var outG = sEl('g', { id: 'rnnOut', opacity: '0' });
  var barW = 36, gap = 8;
  var startX = CX[2] - ((barW + gap) * 4 - gap) / 2 + barW / 2;
  SOFT.forEach(function (v, i) {
    var bx = startX + i * (barW + gap);
    var bh = v * 80;
    outG.appendChild(sEl('rect', { x: bx - barW / 2, y: CY - 40 - bh, width: barW, height: bh, rx: 4, fill: i === 0 || i === 3 ? 'var(--accent)' : 'var(--fg-3)', opacity: 0.7 }));
    outG.appendChild(sEl('text', { x: bx, y: CY - 45 - bh, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--fg)' }));
    outG.appendChild(sEl('text', { x: bx, y: CY - 22, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--fg-2)' }));
  });
  svg.appendChild(outG);

  var step = 0;
  var cap = $('#rnnCap');

  function render() {
    cellEls.forEach(function (c, i) {
      if (i < step) {
        c.g.classList.add('lit');
        c.ht.textContent = 'h' + (i + 1) + ' = ' + H[i].toFixed(5);
      } else {
        c.g.classList.remove('lit');
        c.ht.textContent = 'h' + (i + 1);
      }
    });
    if (step >= 3) {
      outG.setAttribute('opacity', '1');
      var texts = outG.querySelectorAll('text');
      for (var i = 0; i < 4; i++) {
        texts[i * 2].textContent = (SOFT[i] * 100).toFixed(1) + '%';
        texts[i * 2 + 1].textContent = VOCAB[i];
      }
      cap.innerHTML = 't=3 对账：h₃ = tanh(2.44056) = <b>0.98494</b>；logits = [0.9849, 0, −0.9849, 0.9849]；softmax 和 = 1.0。<b>同一组 W 在 3 个时刻反复使用。</b>';
      if (!save.tasks._point) {
        save.tasks._point = true; persist(); refreshProgress();
        toast('✓ RNN 手算推进完成 +1 分');
      }
    } else if (step === 0) {
      outG.setAttribute('opacity', '0');
      cap.innerHTML = 'h₀ = 0。点「推进」看同一组权重如何逐时刻更新隐藏状态。';
    } else {
      outG.setAttribute('opacity', '0');
      var i = step - 1;
      cap.innerHTML = 't=' + (i + 1) + '：z = ' + Z[i].toFixed(5) + '，tanh(z) = <b>' + H[i].toFixed(5) + '</b>。W<sub>hh</sub>=0.5 把上一时刻记忆乘进来。';
    }
    $('#rnnNext').textContent = step >= 3 ? '已完成 ✓' : '推进一个时刻 →';
  }

  $('#rnnNext').addEventListener('click', function () {
    if (step >= 3) { toast('推演完毕——合上书，自己在纸上重走一遍'); return; }
    step++; render();
  });
  $('#rnnReset').addEventListener('click', function () { step = 0; render(); });
  render();
};

/* ---------- 场景 5：每步损失条形图 ---------- */
SCENE_INIT[5] = function () {
  var losses = [1.285946, 1.497950, 0.772809, 1.730050];
  var box = $('#stepLossBars');
  var maxL = 2.0;
  losses.forEach(function (v, i) {
    var col = el('div', 'bar-col');
    var num = el('div', 'bar-num', v.toFixed(3));
    var track = el('div', 'bar-track'); track.style.height = '140px';
    var fill = el('div', 'bar-fill');
    fill.style.height = (v / maxL * 100) + '%';
    track.appendChild(fill);
    col.appendChild(num); col.appendChild(track); col.appendChild(el('div', 'bar-label', 't=' + (i + 1)));
    box.appendChild(col);
  });
};

/* ---------- 场景 7：谱半径滑块 ---------- */
SCENE_INIT[7] = function () {
  function render() {
    var v = +$('#specR').value;
    var r = v / 100;
    $('#specRV').textContent = r.toFixed(2);
    var p20 = Math.pow(r, 20);
    $('#specR20').textContent = p20 < 0.01 ? p20.toExponential(2) : p20.toFixed(4);
    var verdict = r < 0.99 ? '梯度消失' : (r > 1.01 ? '梯度爆炸' : '临界');
    var elV = $('#specVerdict');
    elV.textContent = verdict;
    elV.style.color = r < 0.99 ? 'var(--err)' : (r > 1.01 ? 'var(--warn)' : 'var(--ok)');
  }
  $('#specR').addEventListener('input', render);
  render();
};

/* ---------- 场景 8：梯度剪裁 ---------- */
SCENE_INIT[8] = function () {
  var G = 1.818989e+8; // 原始梯度范数（来自 k03_demo_out.txt）
  function render() {
    var v = +$('#clipT').value;
    var tau = Math.pow(10, v / 10);
    $('#clipTV').textContent = tau < 1 ? tau.toFixed(2) : (tau < 1000 ? tau.toFixed(1) : tau.toExponential(1));
    var clip = G > tau ? tau : G;
    $('#clipNorm').textContent = clip < 1e4 ? clip.toFixed(1) : clip.toExponential(2);
    var lr = 0.1;
    $('#clipStep').textContent = (lr * clip < 1e4 ? (lr * clip).toFixed(2) : (lr * clip).toExponential(2));
    // 方向不变
  }
  $('#clipT').addEventListener('input', render);
  render();
};

/* ---------- 场景 9：perplexity ---------- */
SCENE_INIT[9] = function () {
  function render() {
    var v = +$('#pplCE').value;
    var ce = v / 100;
    $('#pplCEV').textContent = ce.toFixed(2);
    var ppl = Math.exp(ce);
    $('#pplVal').textContent = ppl < 100 ? ppl.toFixed(2) : ppl.toFixed(1);
    var read = ppl <= 1.5 ? '完美预测' : (ppl <= 2.5 ? '平均在 ' + Math.round(ppl) + ' 个词间犹豫' : (ppl <= 10 ? '平均在 ' + Math.round(ppl) + ' 个词间犹豫' : (ppl <= 100 ? '平均在 ' + Math.round(ppl) + ' 个词间犹豫' : '接近均匀瞎猜')));
    $('#pplRead').textContent = read;
  }
  $('#pplCE').addEventListener('input', render);
  render();
};

/* ---------- 场景 10：seq2seq SVG + 期末题 + 合书自测 ---------- */
SCENE_INIT[10] = function () {
  /* seq2seq 示意图 */
  var svg = $('#s2sSvg');
  // Encoder cells
  var encX = [80, 220, 360];
  var decX = [540, 680, 820];
  var Y = 110;
  // Encoder
  encX.forEach(function (x, i) {
    var g = sEl('g');
    g.appendChild(sEl('rect', { x: x - 45, y: Y - 30, width: 90, height: 60, rx: 10, fill: 'var(--bg-3)', stroke: 'var(--accent)', 'stroke-width': 1.5 }));
    var t = sEl('text', { x: x, y: Y + 5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600, fill: 'var(--fg)' });
    t.textContent = 'h' + (i + 1); g.appendChild(t);
    var s = sEl('text', { x: x, y: Y + 55, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--fg-2)' });
    s.textContent = ['the', 'cat', 'sat'][i]; g.appendChild(s);
    svg.appendChild(g);
    if (i < 2) {
      svg.appendChild(sEl('line', { x1: x + 45, y1: Y, x2: encX[i + 1] - 45, y2: Y, stroke: 'var(--accent)', 'stroke-width': 2, 'marker-end': 'url(#arr2)' }));
    }
  });
  // Decoder
  decX.forEach(function (x, i) {
    var g = sEl('g');
    g.appendChild(sEl('rect', { x: x - 45, y: Y - 30, width: 90, height: 60, rx: 10, fill: 'var(--bg-3)', stroke: 'var(--accent-2)', 'stroke-width': 1.5 }));
    var t = sEl('text', { x: x, y: Y + 5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600, fill: 'var(--fg)' });
    t.textContent = 's' + (i + 1); g.appendChild(t);
    var s = sEl('text', { x: x, y: Y + 55, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--fg-2)' });
    s.textContent = ['<sos>', 'le', 'chat'][i]; g.appendChild(s);
    svg.appendChild(g);
    if (i < 2) {
      svg.appendChild(sEl('line', { x1: x + 45, y1: Y, x2: decX[i + 1] - 45, y2: Y, stroke: 'var(--accent-2)', 'stroke-width': 2, 'marker-end': 'url(#arr2)' }));
    }
  });
  // bottleneck 线
  svg.appendChild(sEl('line', { x1: encX[2] + 45, y1: Y, x2: decX[0] - 45, y2: Y, stroke: 'var(--warn)', 'stroke-width': 3, 'stroke-dasharray': '6 4' }));
  var bt = sEl('text', { x: (encX[2] + decX[0]) / 2, y: Y - 12, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--warn)', 'font-weight': 600 });
  bt.textContent = 'bottleneck：只有一根线'; svg.appendChild(bt);
  // labels
  var encLab = sEl('text', { x: 220, y: 40, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: 'var(--accent)' });
  encLab.textContent = 'Encoder（源句）'; svg.appendChild(encLab);
  var dl = sEl('text', { x: 680, y: 40, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: 'var(--accent-2)' });
  dl.textContent = 'Decoder（译文）'; svg.appendChild(dl);
  // arrow marker
  var defs = sEl('defs');
  var mk = sEl('marker', { id: 'arr2', markerWidth: '8', markerHeight: '8', refX: '7', refY: '4', orient: 'auto' });
  mk.appendChild(sEl('path', { d: 'M0,0 L8,4 L0,8', fill: 'var(--accent-2)' }));
  defs.appendChild(mk);
  svg.appendChild(defs);

  /* 期末题 */
  var QUIZ = [
    { q: 'RNN 隐藏状态更新公式是？', opts: ['h_t = f(W_hh h_{t−1} + W_xh x_t + b)', 'h_t = W_hh h_{t−1} + x_t', 'h_t = softmax(W h_{t−1})'], a: 0 },
    { q: 'BPTT 中重复权重 W_hh 的总梯度等于？', opts: ['各时刻梯度之和', '最后时刻的梯度', '各时刻梯度的平均值'], a: 0 },
    { q: '梯度消失/爆炸的数学根因是什么？', opts: ['∂h_t/∂h_k = ∏ diag(f′) W_hh，谱半径 ρ 定生死', '学习率太大', 'batch size 太小'], a: 0 },
    { q: '均匀分布模型的 perplexity 基线是？', opts: ['ppl = V（词表大小）', 'ppl = 1', 'ppl = 0'], a: 0 },
    { q: 'seq2seq 的 bottleneck 症状是？', opts: ['encoder 只传一个定长向量给 decoder', 'decoder 词表太大', 'encoder 和 decoder 不能同时训练'], a: 0 },
    { q: '为什么 r=2.5 的 tanh RNN 反传梯度反而比 r=1.5 小？', opts: ['大权重把状态推入 tanh 饱和区，tanh′→0 自动刹车', 'tanh 在 r>2 时变成线性', '数值下溢'], a: 0 }
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

  /* 合书自测 */
  var SELF = [
    ['用语言模型自己的话解释："预测下一个词"和"给整段打分"为什么等价？', '链式法则：P(w₁..w_T) = ∏ P(w_t|w₁..w_{t−1})。会预测下一步 ⟹ 会算整段概率；会算整段概率 ⟹ 每一步的条件概率都已知。'],
    ['n-gram 的三个问题是什么？backoff 和 smoothing 各治哪个？', '稀疏①（上文没见过）→ backoff；稀疏②（下词没见过）→ smoothing；存储爆炸 → 没治，只能限制 n≤5。'],
    ['RNN 相比固定窗口 LM 修好了哪两个问题？代价是什么？', '修好：① 参数量与序列长度无关（任意长度输入）；② 每个位置用同一组权重（对称性）。代价：① 循环不能并行；② 远端信息很难取到（梯度消失）。'],
    ['写出 BPTT 递推式 δ^(t) 的完整式子，并解释两项分别来自哪里。', 'δ^(t) = W_hyᵀ(ŷ−y) + W_hhᵀ(f′⊙δ^(t+1))。第一项：本时刻输出层回传的梯度；第二项：下一时刻隐藏状态回传的梯度（时间分叉，相加）。'],
    ['梯度消失和爆炸的数学根因是什么？为什么剪裁不治消失？', '根因：∂h_t/∂h_k = ∏ diag(f′)·W_hh，连乘矩阵的谱半径 ρ 定生死。剪裁只缩放大梯度（‖g‖>τ），小梯度原样返回，对"信号丢了"毫无帮助。'],
    ['LSTM / Attention / Residual 分别怎么绕开"每步重写"？各有什么代价？', 'LSTM：加独立记忆带，信息"加"进去不被覆盖；参数多、仍串行。Attention：任意两位置直接连线；O(n²)。Residual：恒等项 Jacobian=I，梯度有直通路；需维度对齐、本身不建模长程。'],
    ['Perplexity 的三种读法。', '① ppl = exp(CE)；② 逆概率的几何平均；③ 模型平均每步在 k 个词之间犹豫。'],
    ['seq2seq 为什么是"条件语言模型"？bottleneck 症状是什么？', 'Decoder 每步算 P(y_t|y₁..y_{t−1}, x)，是"条件于源句 x 的语言模型"。Bottleneck：encoder 只传一个定长向量，长句信息装不下，decoder 所有时刻共用同一个条件。']
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
    location.href = 'k03.html';
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
