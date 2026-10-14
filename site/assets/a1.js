/* ================================================================
   A1 轮椅 · 词向量实战上手桥 — 全部交互逻辑
   纯原生 JS，离线可跑，无依赖。不给答案，只给桥。
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
var SAVE_KEY = 'cs224n_a1_v1';
var save = { checks: {}, quiz: {}, tasks: {}, selftest: {}, env: {}, scene: 0 };
try {
  var raw = localStorage.getItem(SAVE_KEY);
  if (raw) save = JSON.parse(raw);
} catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

var TOTAL = 8; // 4 检验点 + 2 手算任务 + 1 numpy 热身 + 1 合书自测
function score() {
  var s = 0;
  Object.keys(save.checks).forEach(function (k) { if (save.checks[k]) s++; });
  if (save.tasks.that) s++;
  if (save.tasks.well) s++;
  if (save.tasks.warmup) s++;
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
    if (s >= 8) msg.textContent = '轮椅可以拆了。关掉本页，去 notebook 把四个函数独立写出来，然后过验收清单。';
    else if (s >= 5) msg.textContent = '桥已过一半。剩下的重点是：手算任务过没过关、提示阶梯是不是真没用就写出来了。';
    else if (s >= 2) msg.textContent = '继续。场景 3 的手算是全章的地基，别跳。';
    else msg.textContent = '从环境门开始，按顺序走。';
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
var SCENE_NAMES = ['封面', '环境门', 'Predict–Run', '手算矩阵', 'numpy 热身', 'distinct_words', '共现矩阵', 'SVD+画图', 'Q1.5 合龙', '撤桥验收'];
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
var CP_ANSWERS = { cp1: '1', cp2: '2', cp3: '1', cp4: '1' };
var CP_EXPLAIN = {
  cp1: '对。doc1 贡献 All、glitters；doc2 贡献 well、ends。共 4 个共现词、4 条计数。',
  cp2: '对。对称来自定义本身：每条相邻边被两个方向各数一次。和排序、SVD 都无关。',
  cp3: '对。官方口径是纯计数 +1，无距离加权。一加权整个矩阵都对不上 M_test_ans。',
  cp4: '对。TruncatedSVD.fit_transform 返回 U·Σ 的前 k 列，每词一个 k 维向量。'
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
        fb.textContent = '再想想——回上面的场景把实验再做一遍。';
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

/* ---------- 场景 1：环境门 ---------- */
SCENE_INIT[1] = function () {
  var PY = 'D:/code/anaconda/envs/pytorch_env/python.exe';
  var ITEMS = [
    { id: 'e1', title: '解释器就位', cmd: PY + ' --version', expect: 'Python 3.10.x' },
    { id: 'e2', title: '四个依赖可导入', cmd: PY + ' -c "import gensim, sklearn, scipy, matplotlib, numpy; print(gensim.__version__, sklearn.__version__, numpy.__version__)"', expect: '4.4.0  1.7.2  2.2.6（版本号以你机器为准，不报错即过）' },
    { id: 'e3', title: 'IMDB 缓存可加载', cmd: PY + ' -c "from datasets import load_dataset; d = load_dataset(\'stanfordnlp/imdb\', name=\'plain_text\'); print(len(d[\'train\']))"', expect: '25000（走 HF 缓存，秒级；警告可忽略）' },
    { id: 'e4', title: 'notebook 跑通 cell-1', cmd: 'jupyter notebook 打开 a1/student/exploring_word_vectors.ipynb，Shift+Enter 跑到 Q1.1 之前', expect: 'cell-1 无红错；gensim、load_dataset 都成功' }
  ];
  var box = $('#envList');
  ITEMS.forEach(function (it) {
    var item = el('div', 'env-item');
    if (save.env[it.id]) item.classList.add('done');
    var chk = el('div', 'env-check', '✓');
    var body = el('div');
    body.style.flex = '1';
    body.appendChild(el('div', 'env-title', it.title));
    var cmd = el('code', 'env-cmd', it.cmd);
    body.appendChild(cmd);
    body.appendChild(el('div', 'env-expect', '期望：' + it.expect));
    item.appendChild(chk); item.appendChild(body);
    function toggle() {
      item.classList.toggle('done');
      save.env[it.id] = item.classList.contains('done');
      persist();
      if (save.env[it.id]) toast('已记录：' + it.title);
    }
    chk.addEventListener('click', toggle);
    item.addEventListener('click', function (e) { if (e.target === cmd) return; toggle(); });
    box.appendChild(item);
  });
};

/* ---------- 场景 2：Predict–Run ---------- */
SCENE_INIT[2] = function () {
  [['pr1', '1'], ['pr2', '1'], ['pr3', '1']].forEach(function (pair) {
    var id = pair[0], ans = pair[1];
    $$('#' + id + ' .pr-opt').forEach(function (o) {
      o.addEventListener('click', function () {
        var good = o.getAttribute('data-a') === ans;
        o.classList.add(good ? 'ok' : 'no');
        if (!good) {
          $$('#' + id + ' .pr-opt').forEach(function (x) {
            if (x.getAttribute('data-a') === ans) x.classList.add('ok');
          });
        }
        $('#' + id + 'r').classList.add('show');
      });
    });
  });
};

/* ---------- 场景 3：手算矩阵 ---------- */
SCENE_INIT[3] = function () {
  var VOCAB = ['<END>', '<START>', 'All', "All's", 'ends', 'glitters', 'gold', "isn't", 'that', 'well'];
  var ANS_THAT = { 2: 1, 4: 1, 5: 1, 9: 1 };
  var ANS_WELL = { 0: 1, 3: 1, 4: 1, 8: 1 };
  var FULL = [
    { 6: 1, 9: 1 }, { 2: 1, 3: 1 }, { 1: 1, 8: 1 }, { 1: 1, 9: 1 }, { 8: 1, 9: 1 },
    { 7: 1, 8: 1 }, { 0: 1, 7: 1 }, { 5: 1, 6: 1 }, { 2: 1, 4: 1, 5: 1, 9: 1 }, { 0: 1, 3: 1, 4: 1, 8: 1 }
  ];

  function buildRow(boxId, rowName) {
    var box = $('#' + boxId);
    box.style.gridTemplateColumns = 'repeat(11, minmax(34px, 1fr))';
    var hd = el('div', 'c h', rowName);
    box.appendChild(hd);
    VOCAB.forEach(function (w) { box.appendChild(el('div', 'c h', w)); });
    box.appendChild(el('div', 'c rowh', rowName));
    var cells = [];
    for (var j = 0; j < 10; j++) {
      (function (j) {
        var c = el('div', 'c pick', '0');
        c.addEventListener('click', function () {
          var on = c.classList.toggle('on');
          c.textContent = on ? '1' : '0';
        });
        box.appendChild(c);
        cells.push(c);
      })(j);
    }
    return cells;
  }

  function checkRow(cells, ans, fbSel, taskKey) {
    var ok = true;
    for (var j = 0; j < 10; j++) {
      var on = cells[j].classList.contains('on');
      var want = !!ans[j];
      if (on !== want) ok = false;
    }
    var fb = $(fbSel);
    if (ok) {
      fb.textContent = '✓ 与官方 M_test_ans 的这一行逐位一致。'; fb.className = 'cp-feedback good';
      if (!save.tasks[taskKey]) {
        save.tasks[taskKey] = true; persist(); refreshProgress();
        toast('✓ 手算任务完成 +1 分');
      }
      maybeRevealFull();
    } else {
      fb.textContent = '✗ 还不对。回语料逐位置数：中心词左右各 1 格，出现几次数几次。';
      fb.className = 'cp-feedback bad';
    }
  }

  var thatCells = buildRow('mxThat', 'that');
  var wellCells = buildRow('mxWell', 'well');
  $('#chkThat').addEventListener('click', function () { checkRow(thatCells, ANS_THAT, '#fbThat', 'that'); });
  $('#chkWell').addEventListener('click', function () { checkRow(wellCells, ANS_WELL, '#fbWell', 'well'); });

  // 恢复已完成状态
  if (save.tasks.that) { ANS_THAT && Object.keys(ANS_THAT).forEach(function (j) { thatCells[+j].classList.add('on'); thatCells[+j].textContent = '1'; }); $('#fbThat').textContent = '✓ 已完成。'; $('#fbThat').className = 'cp-feedback good'; }
  if (save.tasks.well) { Object.keys(ANS_WELL).forEach(function (j) { wellCells[+j].classList.add('on'); wellCells[+j].textContent = '1'; }); $('#fbWell').textContent = '✓ 已完成。'; $('#fbWell').className = 'cp-feedback good'; }

  function maybeRevealFull() {
    if (!(save.tasks.that && save.tasks.well)) return;
    var card = $('#fullMatrixCard');
    if (card.style.display !== 'none') return;
    card.style.display = '';
    var box = $('#mxFull');
    box.style.gridTemplateColumns = 'repeat(11, minmax(30px, 1fr))';
    box.appendChild(el('div', 'c h', ''));
    VOCAB.forEach(function (w) { box.appendChild(el('div', 'c h', w)); });
    FULL.forEach(function (row, i) {
      box.appendChild(el('div', 'c h', VOCAB[i]));
      for (var j = 0; j < 10; j++) {
        box.appendChild(el('div', 'c' + (row[j] ? ' rev' : ''), row[j] ? '1' : '0'));
      }
    });
  }
  maybeRevealFull();
};

/* ---------- 场景 4：numpy 热身 ---------- */
SCENE_INIT[4] = function () {
  var QZ = [
    { code: 'corpus = [["a", "b"], ["c"]]\n[w for doc in corpus for w in doc]', opts: ["['a', 'b', 'c']", "[['a', 'b'], ['c']]", "SyntaxError"], a: 0 },
    { code: "sorted(set(['b', 'a', 'b']))", opts: ["{'a', 'b'}", "['a', 'b']", "['a', 'b', 'b']"], a: 1 },
    { code: "words = ['x', 'y']\nd = {w: i for i, w in enumerate(words)}\nd['y']", opts: ['0', '1', "'y'"], a: 1 },
    { code: 'import numpy as np\nA = np.array([[1., 2.], [3., 4.]])\nA / np.array([1., 2.])', opts: ['[[1, 1], [3, 2]]（按列广播）', '[[1, 2], [1.5, 2]]（按行广播）', 'BroadcastError'], a: 0 }
  ];
  var box = $('#warmupBox');
  var done = {};
  QZ.forEach(function (item, qi) {
    var card = el('div', 'pr-card');
    card.appendChild(el('div', 'pq', item.code));
    var opts = el('div', 'pr-opts');
    item.opts.forEach(function (opt, oi) {
      var o = el('span', 'pr-opt', opt);
      o.addEventListener('click', function () {
        if (done[qi]) return;
        if (oi === item.a) {
          o.classList.add('ok');
          done[qi] = true;
          if (Object.keys(done).length === QZ.length && !save.tasks.warmup) {
            save.tasks.warmup = true; persist(); refreshProgress();
            toast('✓ 热身全对 +1 分，去碰真函数吧');
          }
        } else {
          o.classList.add('no');
          $$('.pr-opt', opts)[item.a].classList.add('ok');
          done[qi] = true; // 看错也算走完，但不给全对分的判定已在上方
        }
      });
      opts.appendChild(o);
    });
    card.appendChild(opts);
    box.appendChild(card);
  });
  // 若已拿过热身分，直接全部标对
  if (save.tasks.warmup) {
    $$('.pr-card', box).forEach(function (card, qi) {
      $$('.pr-opt', card)[QZ[qi].a].classList.add('ok');
    });
  }
};

/* ---------- 提示阶梯（事件委托，全局） ---------- */
document.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-ladder-next]');
  if (!btn) return;
  var box = btn.closest('.hint-ladder');
  var lvs = $$('.lv', box);
  var hidden = lvs.filter(function (l) { return !l.classList.contains('show'); });
  if (hidden.length === 0) { toast('提示已全部揭完——剩下最后一步必须自己写'); return; }
  hidden[0].classList.add('show');
  if (hidden.length === 1) btn.textContent = '没有更多提示了——自己写';
});

/* ---------- 场景 9：合书自测 ---------- */
SCENE_INIT[9] = function () {
  var SELF = [
    ['distinct_words 的两个返回值分别是什么？测试对它们的要求各是什么？', "corpus_words = sorted 去重词表（list，顺序必须精确）；n_corpus_words = 词表大小（int）。toy 语料期望 ['<END>','<START>','All',\"All's\",'ends','glitters','gold',\"isn't\",'that','well']，n=10。"],
    ['手算 toy 语料里 "that" 和 "well" 的共现行（window=1）。', "that → {All, ends, glitters, well}（M[8] 的 {2,4,5,9}）；well 出现两次 → {<END>, All's, ends, that}（M[9] 的 {0,3,4,8}）。"],
    ['共现矩阵为什么对称？对角线为什么全 0？', 'a 在 b 旁边 ⟺ b 在 a 旁边，每条边双向各数一次 → 对称。没有词和自己相邻 → 对角线 0。'],
    ['边界处的窗口怎么处理？', '自然截断：句首词左边没有邻居就只看右边。不环绕、不补零。'],
    ['reduce_to_k_dim 返回什么？Q1.5 为什么还要归一化？', 'U·Σ 前 k 列。Σ 把词频混进模长；Q1.5 只比方向，所以每行除以模长（np.linalg.norm(axis=1, keepdims=True) 广播）。'],
    ['为什么用 sklearn 的 TruncatedSVD 而不是 np.linalg.svd？n_iter=10 是什么？', '全量 SVD 在大词表上太贵；TruncatedSVD 用 randomized 算法只算前 k 个分量。n_iter 是该求解器的迭代次数，notebook 要求传 10。'],
    ['自检对不上 M_test_ans 时的排查顺序？', '① shape 与 word2ind 顺序 → ② np.allclose(M, M.T) 查对称（不对称 = 只数了一边）→ ③ 边界/窗口 off-by-one → ④ 是否误加距离加权。']
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
    if (!confirm('清空本页所有进度（不影响你 notebook 里的代码），重新走一遍轮椅？')) return;
    localStorage.removeItem(SAVE_KEY);
    location.href = 'a1.html';
  });
};

/* ---------------- 启动 ---------------- */
var startScene = 0;
var h = location.hash.replace('#', '');
if (h !== '' && !isNaN(+h)) startScene = +h;
else if (save.scene) startScene = save.scene;
refreshProgress();
go(startScene);

})();
