/* ================================================================
   K01 · 词向量与分布语义 — 全部交互逻辑
   纯原生 JS，file:// 双击可跑，无依赖。
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
function toast(msg) {
  var t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.classList.remove('show'); }, 2200);
}

/* ---------------- 存档 ---------------- */
var SAVE_KEY = 'cs224n_k01_v2';
var save = { checks: {}, quiz: {}, tasks: {}, selftest: {}, scene: 0 };
try {
  var raw = localStorage.getItem(SAVE_KEY);
  if (raw) save = JSON.parse(raw);
} catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

var TOTAL = 14; // 6 检验点 + 6 期末题 + 1 向量任务 + 1 合书自测
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
    if (s >= 14) msg.textContent = '满分。去 A1 把共现矩阵和 SVD 亲手写出来吧——讲义里的每个数字你都已经见过活的版本。';
    else if (s >= 10) msg.textContent = '主线已通。剩下的分数多在「合书自测」——能讲出来才算真的懂。';
    else if (s >= 5) msg.textContent = '过半。建议回到没拿分的场景，把交互实验再做一遍。';
    else msg.textContent = '按顺序走一遍 10 个场景，每个检验点先猜再验证。';
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
var SCENE_NAMES = ['封面', '旧世界', '分布假说', '共现矩阵', '降维', '相似度', 'word2vec', '代价', '负采样', '训练兑现', '评测收官'];
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
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
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

/* ---------------- 检验点通用逻辑 ---------------- */
var CP_ANSWERS = { cp1: '0', cp2: '2', cp3: '1', cp4: '1', cp5: '0', cp6: '1' };
var CP_EXPLAIN = {
  cp1: '对。one-hot 里"像不像"这个概念不存在——这正是要发明词向量的原因。',
  cp2: '对。"I like deep learning" 和 "I like NLP" 里 like 的左边都是 I，共 2 次。',
  cp3: '对。多保留一根轴，丢的信息只会更少：误差 2.014 → 1.623。',
  cp4: '对。这正是贵的根源——每个训练对都要扫整个词表。',
  cp5: '对。B 说的是层次 softmax，别混。',
  cp6: '对。高频词子采样让罕见词获得更多有效上下文；负采样治的是 softmax 的代价。'
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
   各场景初始化（懒加载：进入场景才建）
   ================================================================ */
var SCENE_INIT = {};

/* ---------- 场景 1：one-hot ---------- */
SCENE_INIT[1] = function () {
  var words = ['hotel', 'motel', 'banking', 'monetary', 'cat'];
  var box = $('#ohWords');
  var picked = [];
  function vec(w) {
    var v = words.map(function (x) { return x === w ? '1' : '0'; });
    return '[' + v.join(' ') + ']';
  }
  function render() {
    $$('.word-chip', box).forEach(function (c) {
      c.classList.toggle('picked', picked.indexOf(c.textContent) >= 0);
    });
    $('#ohVecA').textContent = picked[0] ? vec(picked[0]) : '—';
    $('#ohVecB').textContent = picked[1] ? vec(picked[1]) : '—';
    if (picked.length === 2) {
      var dot = picked[0] === picked[1] ? 1 : 0;
      $('#ohDot').textContent = dot;
      $('#ohNote').textContent = dot === 0
        ? '不同的词 → 恒为 0（正交）。意思再近也没用。'
        : '同一个词 → 1。只有"是/不是"，没有"有点像"。';
    } else {
      $('#ohDot').textContent = '?';
      $('#ohNote').textContent = picked.length === 1 ? '再点一个词' : '点两个词试试（可以点同一个）';
    }
  }
  words.forEach(function (w) {
    var c = el('span', 'word-chip', w);
    c.addEventListener('click', function () {
      if (picked.length >= 2) picked = [];
      picked.push(w);
      render();
    });
    box.appendChild(c);
  });
  render();
};

/* ---------- 场景 2：语境浏览器 ---------- */
SCENE_INIT[2] = function () {
  var DATA = {
    delicious: {
      sents: [
        ['The ', 'soup ', 'was ', '|delicious|', ' and ', 'everyone ', 'asked ', 'for ', 'the ', 'recipe.'],
        ['What ', 'a ', '|delicious|', ' cake ', '— ', 'did ', 'you ', 'bake ', 'it ', 'yourself?'],
        ['The ', 'restaurant ', 'is ', 'famous ', 'for ', 'its ', '|delicious|', ' pasta.']
      ],
      note: '邻居们：soup / cake / pasta、famous、everyone asked for the recipe —— 不用查字典，你也知道它是夸食物。'
    },
    awful: {
      sents: [
        ['The ', 'movie ', 'was ', '|awful|', ' — ', 'we ', 'left ', 'halfway.'],
        ['What ', 'an ', '|awful|', ' day ', '— ', 'nothing ', 'went ', 'right.'],
        ['The ', 'food ', 'looked ', 'good ', 'but ', 'tasted ', '|awful|', '.']
      ],
      note: '邻居们：left halfway、nothing went right —— 全是负面语境。词义 = 邻居的分布。'
    }
  };
  var btnBox = $('#ctxBtns'), sentBox = $('#ctxSents');
  function render(key) {
    $$('.word-chip', btnBox).forEach(function (c) { c.classList.toggle('picked', c.textContent === key); });
    sentBox.innerHTML = '';
    DATA[key].sents.forEach(function (parts) {
      var s = el('div', 'sent');
      parts.forEach(function (p) {
        if (p.indexOf('|') === 0) {
          var t = el('span', 't', p.replace(/\|/g, ''));
          s.appendChild(t);
        } else {
          s.appendChild(document.createTextNode(p));
        }
      });
      sentBox.appendChild(s);
    });
    var n = el('div', 'callout'); n.style.marginTop = '10px'; n.textContent = DATA[key].note;
    sentBox.appendChild(n);
  }
  Object.keys(DATA).forEach(function (k) {
    var c = el('span', 'word-chip', k);
    c.addEventListener('click', function () { render(k); });
    btnBox.appendChild(c);
  });
  render('delicious');
};

/* ---------- 场景 3：共现矩阵 ---------- */
SCENE_INIT[3] = function () {
  var CORPUS = [['I', 'like', 'deep', 'learning'], ['I', 'like', 'NLP'], ['I', 'enjoy', 'flying']];
  var VOCAB = ['I', 'NLP', 'deep', 'enjoy', 'flying', 'learning', 'like'];
  var chipsBox = $('#corpusChips'), matBox = $('#coMatrix');
  var m = 1;

  // 语料 chips（带句子/位置标记，供高亮）
  var chipEls = [];
  CORPUS.forEach(function (sent, si) {
    sent.forEach(function (w, wi) {
      var c = el('span', 'token', w);
      c.dataset.s = si; c.dataset.w = wi;
      chipsBox.appendChild(c);
      chipEls.push(c);
    });
    if (si < CORPUS.length - 1) {
      var sep = el('span', 'token', '·');
      sep.style.opacity = '.35'; sep.style.border = 'none'; sep.style.background = 'none';
      chipsBox.appendChild(sep);
    }
  });

  function compute() {
    var X = {}, contrib = {};
    VOCAB.forEach(function (a) { X[a] = {}; contrib[a] = {}; VOCAB.forEach(function (b) { X[a][b] = 0; contrib[a][b] = []; }); });
    CORPUS.forEach(function (sent, si) {
      sent.forEach(function (w, wi) {
        for (var j = Math.max(0, wi - m); j <= Math.min(sent.length - 1, wi + m); j++) {
          if (j === wi) continue;
          X[w][sent[j]]++;
          contrib[w][sent[j]].push('句' + (si + 1) + '：「' + sent.join(' ') + '」');
        }
      });
    });
    return { X: X, contrib: contrib };
  }

  var grid = {}; // grid[a][b] -> cell el
  function buildGrid() {
    matBox.innerHTML = '';
    matBox.style.gridTemplateColumns = 'repeat(' + (VOCAB.length + 1) + ', minmax(38px,auto))';
    matBox.appendChild(el('div', 'cell head', 'X'));
    VOCAB.forEach(function (b) { matBox.appendChild(el('div', 'cell head', b)); });
    grid = {};
    VOCAB.forEach(function (a) {
      matBox.appendChild(el('div', 'cell head', a));
      grid[a] = {};
      VOCAB.forEach(function (b) {
        var c = el('div', 'cell', '0');
        grid[a][b] = c;
        matBox.appendChild(c);
      });
    });
  }

  function showAll() {
    var r = compute(), nz = 0;
    VOCAB.forEach(function (a) {
      VOCAB.forEach(function (b) {
        var v = r.X[a][b], c = grid[a][b];
        c.textContent = v;
        c.classList.toggle('on', v > 0);
        c.title = v > 0 ? r.contrib[a][b].join('\n') : '从未共现';
        if (v > 0) nz++;
      });
    });
    $('#sparsityPill').textContent = nz + ' / 49（' + (nz / 49 * 100).toFixed(1) + '% 非零）';
  }

  function stepBuild() {
    buildGrid();
    var r = compute();
    var steps = [];
    CORPUS.forEach(function (sent, si) {
      sent.forEach(function (w, wi) { steps.push({ si: si, wi: wi }); });
    });
    var cur = {};
    VOCAB.forEach(function (a) { cur[a] = {}; VOCAB.forEach(function (b) { cur[a][b] = 0; }); });
    var idx = 0, nz = 0;
    $('#buildBtn').disabled = true;
    var timer = setInterval(function () {
      if (idx >= steps.length) {
        clearInterval(timer);
        chipEls.forEach(function (c) { c.classList.remove('center', 'context'); });
        $('#buildBtn').disabled = false;
        $('#sparsityPill').textContent = nz + ' / 49（' + (nz / 49 * 100).toFixed(1) + '% 非零）';
        VOCAB.forEach(function (a) { VOCAB.forEach(function (b) { grid[a][b].title = r.contrib[a][b].length ? r.contrib[a][b].join('\n') : '从未共现'; }); });
        return;
      }
      var st = steps[idx++];
      var sent = CORPUS[st.si], w = sent[st.wi];
      chipEls.forEach(function (c) {
        var si = +c.dataset.s, wi = +c.dataset.w;
        c.classList.toggle('center', si === st.si && wi === st.wi);
        c.classList.toggle('context', si === st.si && wi !== st.wi && Math.abs(wi - st.wi) <= m);
      });
      for (var j = Math.max(0, st.wi - m); j <= Math.min(sent.length - 1, st.wi + m); j++) {
        if (j === st.wi) continue;
        var b = sent[j];
        if (cur[w][b] === 0) nz++;
        cur[w][b]++;
        var cell = grid[w][b];
        cell.textContent = cur[w][b];
        cell.classList.add('on');
        cell.style.transform = 'scale(1.25)';
        setTimeout(function (cc) { cc.style.transform = ''; }, 220, cell);
      }
      $('#sparsityPill').textContent = nz + ' / 49（构建中…）';
    }, 420);
  }

  $('#winSlider').addEventListener('input', function () {
    m = +this.value; $('#winVal').textContent = m; showAll();
  });
  $('#buildBtn').addEventListener('click', stepBuild);
  $('#resetMatrixBtn').addEventListener('click', function () { buildGrid(); $('#sparsityPill').textContent = '0 / 49'; });
  buildGrid(); showAll();
};

/* ---------- 场景 4：SVD ---------- */
SCENE_INIT[4] = function () {
  var SV = [2.6404, 2.6404, 1.1931, 1.1931, 0.7775, 0.7775, 0.0];
  var ERR = [3.320849, 2.013971, 1.622533, 1.099613, 0.777544, 0.0, 0.0];
  var total2 = SV.reduce(function (s, x) { return s + x * x; }, 0);
  var barsBox = $('#svdBars'), fills = [];
  SV.forEach(function (sv, i) {
    var col = el('div', 'bar-col');
    var num = el('div', 'bar-num', sv.toFixed(2));
    var track = el('div', 'bar-track'); track.style.height = '120px';
    var fill = el('div', 'bar-fill');
    fill.style.height = (sv / 2.6404 * 100) + '%';
    track.appendChild(fill);
    var lab = el('div', 'bar-label', 'σ' + (i + 1));
    col.appendChild(num); col.appendChild(track); col.appendChild(lab);
    barsBox.appendChild(col);
    fills.push(fill);
  });
  function update(k) {
    $('#kVal').textContent = k;
    $('#svdErr').textContent = ERR[k - 1].toFixed(3);
    var e = 0; for (var i = 0; i < k; i++) e += SV[i] * SV[i];
    $('#svdEnergy').textContent = (e / total2 * 100).toFixed(1) + '%';
    fills.forEach(function (f, i) {
      f.style.opacity = i < k ? '1' : '.18';
    });
  }
  $('#kSlider').addEventListener('input', function () { update(+this.value); });
  update(2);
};

/* ---------- 场景 5：向量游乐场 ---------- */
SCENE_INIT[5] = function () {
  var box = $('#vecPlayground');
  var W = 640, H = 280, R = 3;
  box.innerHTML = '<svg id="vecSvg" viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;background:var(--bg-2);border-radius:12px;touch-action:none;cursor:crosshair;"></svg>';
  var svg = $('#vecSvg', box);
  var NS = 'http://www.w3.org/2000/svg';
  function sx(x) { return W / 2 + x / R * (W / 2 - 20); }
  function sy(y) { return H / 2 - y / R * (H / 2 - 20); }
  function invX(px) { return (px - W / 2) / (W / 2 - 20) * R; }
  function invY(py) { return -(py - H / 2) / (H / 2 - 20) * R; }

  // 网格
  for (var g = -3; g <= 3; g++) {
    var l1 = document.createElementNS(NS, 'line');
    l1.setAttribute('x1', sx(g)); l1.setAttribute('y1', 0); l1.setAttribute('x2', sx(g)); l1.setAttribute('y2', H);
    l1.setAttribute('stroke', 'rgba(148,163,184,.12)');
    svg.appendChild(l1);
    var l2 = document.createElementNS(NS, 'line');
    l2.setAttribute('x1', 0); l2.setAttribute('y1', sy(g)); l2.setAttribute('x2', W); l2.setAttribute('y2', sy(g));
    l2.setAttribute('stroke', 'rgba(148,163,184,.12)');
    svg.appendChild(l2);
  }
  function mkArrow(color) {
    var line = document.createElementNS(NS, 'line');
    line.setAttribute('stroke', color); line.setAttribute('stroke-width', '3'); line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);
    var dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('r', '9'); dot.setAttribute('fill', color); dot.style.cursor = 'grab';
    svg.appendChild(dot);
    var lab = document.createElementNS(NS, 'text');
    lab.setAttribute('fill', color); lab.setAttribute('font-size', '13'); lab.setAttribute('font-weight', '700');
    svg.appendChild(lab);
    return { line: line, dot: dot, lab: lab };
  }
  var uA = mkArrow('#38bdf8'), vA = mkArrow('#818cf8');
  var u = { x: 2, y: 1 }, v = { x: -1, y: 1.6 };
  var activeTask = null;

  function fmt(n, d) { return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }

  function update() {
    [[uA, u, 'u'], [vA, v, 'v']].forEach(function (p) {
      var a = p[0], pt = p[1], name = p[2];
      a.line.setAttribute('x1', sx(0)); a.line.setAttribute('y1', sy(0));
      a.line.setAttribute('x2', sx(pt.x)); a.line.setAttribute('y2', sy(pt.y));
      a.dot.setAttribute('cx', sx(pt.x)); a.dot.setAttribute('cy', sy(pt.y));
      a.lab.setAttribute('x', sx(pt.x) + 12); a.lab.setAttribute('y', sy(pt.y) - 8);
      a.lab.textContent = name + ' (' + fmt(pt.x, 1) + ', ' + fmt(pt.y, 1) + ')';
    });
    var dot = u.x * v.x + u.y * v.y;
    var nu = Math.hypot(u.x, u.y), nv = Math.hypot(v.x, v.y);
    var cos = (nu * nv) > 1e-6 ? dot / (nu * nv) : 0;
    var ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    $('#vDot').textContent = fmt(dot, 2);
    $('#vCos').textContent = fmt(cos, 2);
    $('#vAngle').textContent = fmt(ang, 0) + '°';
    if (activeTask !== null && Math.abs(cos - activeTask) < 0.03 && nu > .3 && nv > .3) {
      var t = activeTask; activeTask = null;
      save.tasks['t' + t] = true;
      var done = ['t-1', 't0', 't1'].filter(function (k) { return save.tasks[k]; }).length;
      if (done >= 2 && !save.tasks._point) { save.tasks._point = true; toast('任务完成 ≥2 个，+1 分'); }
      persist(); refreshProgress();
      toast('✓ 任务达成：cos = ' + fmt(cos, 2));
    }
  }

  function drag(vec) {
    return function (e) {
      e.preventDefault();
      function mv(ev) {
        var r = svg.getBoundingClientRect();
        var px = (ev.clientX - r.left) / r.width * W;
        var py = (ev.clientY - r.top) / r.height * H;
        vec.x = Math.max(-R, Math.min(R, invX(px)));
        vec.y = Math.max(-R, Math.min(R, invY(py)));
        update();
      }
      function up() {
        document.removeEventListener('pointermove', mv);
        document.removeEventListener('pointerup', up);
      }
      document.addEventListener('pointermove', mv);
      document.addEventListener('pointerup', up);
    };
  }
  uA.dot.addEventListener('pointerdown', drag(u));
  vA.dot.addEventListener('pointerdown', drag(v));

  $$('[data-task]').forEach(function (b) {
    b.addEventListener('click', function () {
      activeTask = +b.getAttribute('data-task');
      toast('任务已激活：把 cos 拖到 ' + activeTask + '.00');
    });
  });
  $('#vecReset').addEventListener('click', function () {
    u = { x: 2, y: 1 }; v = { x: -1, y: 1.6 }; activeTask = null; update();
  });
  update();
};

/* ---------- 场景 6：滑动窗口 + softmax ---------- */
SCENE_INIT[6] = function () {
  var SENT = ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'the', 'lazy', 'dog'];
  var CAND = ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog'];
  var m = 2, pos = 3, playing = false, timer = null;
  var sentBox = $('#w2vSent'), barsBox = $('#softmaxBars');
  var chips = SENT.map(function (w) {
    var c = el('span', 'token', w);
    sentBox.appendChild(c);
    return c;
  });
  function score(word, p) {
    // 示意分布：真实上下文给高分；其余给稳定的伪随机低分
    var si = SENT.indexOf(word);
    if (si >= 0 && si !== p && Math.abs(si - p) <= m) return 2.2;
    if (word === SENT[p]) return -2.0;
    var h = ((word.length * 31 + p * 17) % 10) / 10;
    return h * 0.8 - 0.4;
  }
  function render() {
    chips.forEach(function (c, i) {
      c.classList.toggle('center', i === pos);
      c.classList.toggle('context', i !== pos && Math.abs(i - pos) <= m);
    });
    var ctx = SENT.filter(function (_, i) { return i !== pos && Math.abs(i - pos) <= m; });
    $('#w2vCap').innerHTML = '位置 t=' + (pos + 1) + '：中心词 = <b style="color:var(--accent)">' + SENT[pos] + '</b>，上下文 = {' + ctx.join(', ') + '}';
    // softmax
    var exps = CAND.map(function (w) { return Math.exp(score(w, pos)); });
    var sum = exps.reduce(function (a, b) { return a + b; }, 0);
    var rows = CAND.map(function (w, i) { return { w: w, p: exps[i] / sum }; });
    rows.sort(function (a, b) { return b.p - a.p; });
    barsBox.innerHTML = '';
    rows.forEach(function (r) {
      var col = el('div', 'bar-col');
      var num = el('div', 'bar-num', (r.p * 100).toFixed(0) + '%');
      var track = el('div', 'bar-track'); track.style.height = '100px';
      var fill = el('div', 'bar-fill');
      var isCtx = ctx.indexOf(r.w) >= 0;
      fill.style.height = Math.max(2, r.p * 100) + '%';
      if (!isCtx) { fill.style.background = 'var(--fg-3)'; fill.style.opacity = '.4'; }
      track.appendChild(fill);
      col.appendChild(num); col.appendChild(track); col.appendChild(el('div', 'bar-label', r.w));
      barsBox.appendChild(col);
    });
  }
  function step(d) { pos = (pos + d + SENT.length) % SENT.length; render(); }
  $('#wPrev').addEventListener('click', function () { step(-1); });
  $('#wNext').addEventListener('click', function () { step(1); });
  $('#wPlay').addEventListener('click', function () {
    playing = !playing;
    this.textContent = playing ? '⏸ 暂停' : '▶ 自动播放';
    if (playing) { timer = setInterval(function () { step(1); }, 900); }
    else clearInterval(timer);
  });
  render();
};

/* ---------- 场景 7：代价对比 ---------- */
SCENE_INIT[7] = function () {
  var DATA = [
    { name: 'naive softmax', v: 30000000, label: '3.0×10⁷', note: '每训练对' },
    { name: '层次 softmax', v: 5100, label: '5.1×10³', note: 'O(log V·d)' },
    { name: '负采样', v: 1800, label: '1.8×10³', note: 'O((1+K)·d)' }
  ];
  var box = $('#costBars');
  var maxL = Math.log10(DATA[0].v), minL = Math.log10(DATA[2].v) - 0.5;
  DATA.forEach(function (d) {
    var col = el('div', 'bar-col');
    var num = el('div', 'bar-num', d.label);
    var track = el('div', 'bar-track'); track.style.height = '150px';
    var fill = el('div', 'bar-fill');
    fill.style.height = ((Math.log10(d.v) - minL) / (maxL - minL) * 100) + '%';
    track.appendChild(fill);
    col.appendChild(num); col.appendChild(track);
    col.appendChild(el('div', 'bar-label', d.name));
    col.appendChild(el('div', 'bar-label', d.note));
    box.appendChild(col);
  });
};

/* ---------- 场景 8：负采样 α + 哈夫曼 ---------- */
SCENE_INIT[8] = function () {
  var WORDS = ['the', 'and', 'a', 'of', 'to', 'man', 'king', 'queen'];
  var TABLE = {
    '0':    { p: [0.050, 0.050, 0.050, 0.050, 0.050, 0.050, 0.050, 0.050], H: 7.6009, top: '0.050%' },
    '0.5':  { p: [0.840, 0.587, 0.585, 0.554, 0.532, 0.107, 0.040, 0.029], H: 7.3284, top: '0.840%' },
    '0.75': { p: [2.715, 1.583, 1.577, 1.452, 1.368, 0.123, 0.028, 0.017], H: 6.7838, top: '2.715%' },
    '1':    { p: [6.880, 3.352, 3.334, 2.985, 2.758, 0.111, 0.015, 0.008], H: 5.8683, top: '6.880%' }
  };
  var btnBox = $('#alphaBtns'), barsBox = $('#negBars');
  function render(a) {
    $$('.word-chip', btnBox).forEach(function (c) { c.classList.toggle('picked', c.textContent === 'α = ' + a); });
    var d = TABLE[a];
    barsBox.innerHTML = '';
    WORDS.forEach(function (w, i) {
      var col = el('div', 'bar-col');
      var num = el('div', 'bar-num', d.p[i].toFixed(2) + '%');
      var track = el('div', 'bar-track'); track.style.height = '110px';
      var fill = el('div', 'bar-fill');
      fill.style.height = Math.max(2, d.p[i] / 6.88 * 100) + '%';
      if (a === '0.75') fill.style.background = 'linear-gradient(180deg, var(--ok), var(--accent))';
      track.appendChild(fill);
      col.appendChild(num); col.appendChild(track); col.appendChild(el('div', 'bar-label', w));
      barsBox.appendChild(col);
    });
    $('#negEntropy').textContent = d.H.toFixed(2);
    $('#negTop').textContent = d.top;
  }
  Object.keys(TABLE).forEach(function (a) {
    var c = el('span', 'word-chip', 'α = ' + a);
    c.addEventListener('click', function () { render(a); });
    btnBox.appendChild(c);
  });
  render('0.75');

  // 哈夫曼
  var HF = [
    { name: '哈夫曼树', v: 8.49, note: '按词频加权 · 最优' },
    { name: '完全平衡树', v: 11.00, note: 'log₂2000 ≈ 11' },
    { name: '随机合并树', v: 14.31, note: '20 次平均' }
  ];
  var hbox = $('#huffBars');
  HF.forEach(function (d, i) {
    var col = el('div', 'bar-col');
    var num = el('div', 'bar-num', d.v.toFixed(2));
    var track = el('div', 'bar-track'); track.style.height = '110px';
    var fill = el('div', 'bar-fill');
    fill.style.height = (d.v / 14.31 * 100) + '%';
    if (i === 0) fill.style.background = 'linear-gradient(180deg, var(--ok), var(--accent))';
    track.appendChild(fill);
    col.appendChild(num); col.appendChild(track);
    col.appendChild(el('div', 'bar-label', d.name));
    col.appendChild(el('div', 'bar-label', d.note));
    hbox.appendChild(col);
  });
};

/* ---------- 场景 9：loss 曲线 + 类比 ---------- */
SCENE_INIT[9] = function () {
  var PTS = [
    [11000, 3.2664], [22000, 2.3838], [33000, 2.0589], [44000, 1.8634], [55000, 1.7694],
    [66000, 1.7189], [77000, 1.6940], [88000, 1.6840], [99000, 1.6630], [110000, 1.6539]
  ];
  var svg = $('#lossChart'), NS = 'http://www.w3.org/2000/svg';
  var W = 640, H = 220, padL = 46, padB = 30, padT = 14, padR = 14;
  var x0 = 11000, x1 = 110000, y0 = 1.5, y1 = 3.4;
  function sx(x) { return padL + (x - x0) / (x1 - x0) * (W - padL - padR); }
  function sy(y) { return padT + (y1 - y) / (y1 - y0) * (H - padT - padB); }
  // 轴
  var ax = document.createElementNS(NS, 'line');
  ax.setAttribute('x1', padL); ax.setAttribute('y1', H - padB); ax.setAttribute('x2', W - padR); ax.setAttribute('y2', H - padB);
  ax.setAttribute('stroke', 'rgba(148,163,184,.4)'); svg.appendChild(ax);
  var ay = document.createElementNS(NS, 'line');
  ay.setAttribute('x1', padL); ay.setAttribute('y1', padT); ay.setAttribute('x2', padL); ay.setAttribute('y2', H - padB);
  ay.setAttribute('stroke', 'rgba(148,163,184,.4)'); svg.appendChild(ay);
  [1.5, 2, 2.5, 3].forEach(function (y) {
    var t = document.createElementNS(NS, 'text');
    t.setAttribute('x', padL - 8); t.setAttribute('y', sy(y) + 4); t.setAttribute('text-anchor', 'end');
    t.setAttribute('fill', 'rgba(148,163,184,.7)'); t.setAttribute('font-size', '11');
    t.textContent = y.toFixed(1); svg.appendChild(t);
  });
  [[11000, '11k'], [55000, '55k'], [110000, '110k']].forEach(function (p) {
    var t = document.createElementNS(NS, 'text');
    t.setAttribute('x', sx(p[0])); t.setAttribute('y', H - padB + 18); t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', 'rgba(148,163,184,.7)'); t.setAttribute('font-size', '11');
    t.textContent = p[1]; svg.appendChild(t);
  });
  var yl = document.createElementNS(NS, 'text');
  yl.setAttribute('x', 12); yl.setAttribute('y', 16); yl.setAttribute('fill', 'rgba(148,163,184,.8)');
  yl.setAttribute('font-size', '11'); yl.textContent = 'avg loss'; svg.appendChild(yl);
  var path = PTS.map(function (p, i) { return (i ? 'L' : 'M') + sx(p[0]) + ' ' + sy(p[1]); }).join(' ');
  var pl = document.createElementNS(NS, 'path');
  pl.setAttribute('d', path); pl.setAttribute('fill', 'none');
  pl.setAttribute('stroke', '#38bdf8'); pl.setAttribute('stroke-width', '2.5'); pl.setAttribute('stroke-linecap', 'round');
  svg.appendChild(pl);
  PTS.forEach(function (p) {
    var c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', sx(p[0])); c.setAttribute('cy', sy(p[1])); c.setAttribute('r', '4');
    c.setAttribute('fill', '#818cf8');
    var tt = document.createElementNS(NS, 'title');
    tt.textContent = 'step ' + p[0] + ' · loss ' + p[1];
    c.appendChild(tt);
    svg.appendChild(c);
  });

  // 类比
  var AN = [['queen', 0.999], ['prince', 0.999], ['princess', 0.998]];
  var box = $('#analogyBars');
  AN.forEach(function (r, i) {
    var col = el('div', 'bar-col');
    var num = el('div', 'bar-num', r[1].toFixed(3));
    var track = el('div', 'bar-track'); track.style.height = '90px';
    var fill = el('div', 'bar-fill');
    fill.style.height = (r[1] * 100 * 0.9) + '%';
    if (i === 0) fill.style.background = 'linear-gradient(180deg, var(--warn), var(--accent))';
    track.appendChild(fill);
    col.appendChild(num); col.appendChild(track); col.appendChild(el('div', 'bar-label', r[0]));
    box.appendChild(col);
  });
};

/* ---------- 场景 10：期末题 + 合书自测 ---------- */
SCENE_INIT[10] = function () {
  var QUIZ = [
    { q: 'one-hot 表示最致命的问题是什么？', opts: ['维度太高存不下', '任意两个不同词正交，算不出相似度', '不能表示新词'], a: 1 },
    { q: '分布语义假说的一句话版本：', opts: ['词义由词典定义给出', '词义由它指向的事物给出', '词义由经常出现在它附近的词给出'], a: 2 },
    { q: '窗口共现矩阵为什么是对称的？', opts: ['因为每个词轮流当中心词，窗口不分左右', '因为 SVD 保证了对称', '因为语料是对称的'], a: 0 },
    { q: '负采样的梯度为什么是稀疏的？', opts: ['因为 sigmoid 会截断小梯度', '因为一个窗口只涉及真实邻居 + K 个负样本，只需更新这些行', '因为学习率很小'], a: 1 },
    { q: '层次 softmax 省的是什么？', opts: ['参数量', '每个训练步的计算量（V 选 1 → 路径上约 log V 次二分类）', '词表大小'], a: 1 },
    { q: '内在评测（如类比任务）的已知风险：', opts: ['计算太慢', '子任务表现好，不保证对真实任务有用', '需要标注数据'], a: 1 }
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
          refreshProgress();
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
    ['WordNet 路线的四个问题里，哪一个最致命？', '算不出相似度。词典结构里没有"tiger 和 cat 有多像"这个数字，而下游任务要的恰恰是这个数字。'],
    ['为什么 one-hot"算不出相似度"？', '任意两个不同词的 one-hot 向量正交（内积恒为 0）。只有"是/不是"，没有"有点像"。'],
    ['分布语义假说的内容？', '一个词的意思由经常出现在它附近的词给出（Firth 1957）。做法：固定窗口收集上下文，用上下文构建表示。'],
    ['word2vec 的代理任务是什么？为什么叫"代理"？', '用中心词预测上下文词。预测准不准不是目的——为了预测而被迫学出的向量才是目的。'],
    ['为什么每个词要两套向量 v 和 u？', '中心词和上下文词角色不同，分开两套优化更容易；最后可平均。只用一套也能跑，稍差一点。'],
    ['softmax 分母制造了哪三类问题？', '① 前向慢（扫全词表）② 反向梯度稠密（所有 u_w 都要更新）③ 目标错配（强制概率竞争，但只要向量）。② 最致命。'],
    ['U(w)^3/4 里的 3/4 是干什么的？', '压扁词频分布：让低频词被采为负样本的机会变大、高频词不至于一家独大。经验值，无推导。'],
    ['"罕见词表示差"靠什么解决？', '高频词子采样（按概率丢弃高频词），不是负采样。负采样治的是 softmax 的计算代价。']
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
    location.href = 'k01.html';
  });
};

/* ---------------- 推导步进器（事件委托，任意场景通用） ---------------- */
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
