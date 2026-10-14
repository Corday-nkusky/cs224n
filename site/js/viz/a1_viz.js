/* ============================================================
 * a1_viz.js —— A1 作业页的两个「预演交互」
 * ------------------------------------------------------------
 * 定位：**不用装环境、不用跑 notebook 就能先把作业里最容易卡的那两步走一遍。**
 *   ① a1-cooc   共现矩阵手算器：一格一格地数出来，最后与 notebook 的
 *               M_test_ans 逐位对账 —— 对应 Q1.2 与上手桥的"台阶②"。
 *   ② a1-wrong  错法对照调试器：sanity check 红了之后，一眼看出是哪种错，
 *               以及"你的第一个错误格"在哪 —— 作业里最耗时的一步。
 *
 * 全部数字由 js/core/a1_core.js 现算（toy 语料逐字取自 notebook cell-11/14）。
 * 注册走 KB.viz.register（注册表与公共小件在 js/ui/viz-kit.js）。
 * ============================================================ */
(function (global) {
  'use strict';
  var KB = global.KB = global.KB || {};
  var el = KB.dom.el, clear = KB.dom.clear;
  var K = KB.vizKit;
  var A = KB.core && KB.core.a1;

  function round3(x) { return Math.round(x * 1000) / 1000; }

  /* 分段按钮组：items = [{key, label}]，返回 {node, pick(key)} */
  function seg(items, onPick) {
    var node = el('div', { class: 'seg' });
    var btns = {};
    items.forEach(function (it) {
      var b = el('button', { class: 'btn', type: 'button', text: it.label });
      b.addEventListener('click', function () { onPick(it.key); });
      btns[it.key] = b;
      node.appendChild(b);
    });
    return {
      node: node,
      pick: function (key) {
        Object.keys(btns).forEach(function (k) { btns[k].classList.toggle('on', k === key); });
      }
    };
  }

  /* ============================================================
   * ① 共现矩阵手算器
   * ============================================================ */
  KB.viz.register('a1-cooc', function (root) {
    var p = K.panel('共现矩阵：每个格子的数字是怎么被数出来的',
      '按「下一步」一格一格地数。也可以直接点上面句子里的某个词，跳到"以它为中心"的那一步。' +
      '窗口调到 1 时，数完的结果就是 notebook 里那份 <code>M_test_ans</code>。',
      'notebook cell-14 的 <code>M_test_ans</code>（现算矩阵与它逐位比对）');
    root.appendChild(p.wrap);

    var st = { win: 1, t: 0 };

    var ctlWrap = el('div', { class: 'viz-ctl' });
    var sl = K.slider(1, 4, 1, 1, function (v) { st.win = v; st.t = 0; draw(); });
    ctlWrap.appendChild(K.ctl('窗口大小 w', sl.node, sl.val));

    var bar = el('div', { class: 'step-bar' });
    var bPrev = el('button', { class: 'btn', type: 'button', text: '◀ 上一步' });
    var bNext = el('button', { class: 'btn primary', type: 'button', text: '下一步 ▶' });
    var bAll = el('button', { class: 'btn', type: 'button', text: '数完 ⇥' });
    var bRst = el('button', { class: 'btn', type: 'button', text: '⟲ 重置' });
    bPrev.addEventListener('click', function () { st.t = Math.max(0, st.t - 1); draw(); });
    bNext.addEventListener('click', function () { st.t = st.t + 1; draw(); });
    bAll.addEventListener('click', function () { st.t = 1e9; draw(); });
    bRst.addEventListener('click', function () { st.t = 0; draw(); });
    bar.appendChild(bPrev); bar.appendChild(bNext); bar.appendChild(bAll); bar.appendChild(bRst);
    ctlWrap.appendChild(bar);
    p.body.insertBefore(ctlWrap, p.body.firstChild);

    var sentBox = el('div', { class: 'sent-box' });
    var out = el('div', { class: 'viz-out' });
    var status = el('div', { class: 'viz-status' });
    var anchor = p.body.querySelector('.viz-src');
    p.body.insertBefore(sentBox, anchor);
    p.body.insertBefore(out, anchor);
    p.body.insertBefore(status, anchor);

    function jumpTo(d, ci, c) {
      for (var i = 0; i < c.steps.length; i++) {
        if (c.steps[i].d === d && c.steps[i].c === ci) { st.t = i + 1; draw(); return; }
      }
    }

    function draw() {
      var c = A.replay(A.TOY_CORPUS, { window: st.win }, st.t);
      var total = c.steps.length;
      st.t = Math.min(st.t, total);
      var cur = st.t > 0 ? c.steps[st.t - 1] : null;

      /* ---- 语料：点一个词就跳到"以它为中心"的那一步 ---- */
      clear(sentBox);
      A.TOY_CORPUS.forEach(function (doc, d) {
        var row = el('div', { class: 'sent' });
        row.appendChild(el('span', { class: 'sn', text: '句' + (d + 1) }));
        doc.forEach(function (w, ci) {
          var isCur = cur && cur.d === d && cur.c === ci;
          var isCtx = cur && cur.d === d && cur.j === ci;
          var chip = el('span', {
            class: 'chip' + (isCur ? ' cur' : '') + (isCtx ? ' ctx' : ''),
            text: w
          });
          chip.addEventListener('click', function () { jumpTo(d, ci, c); });
          row.appendChild(chip);
        });
        sentBox.appendChild(row);
      });

      /* ---- 矩阵 ---- */
      clear(out);
      out.appendChild(el('h5', {
        html: '矩阵 X（行 = 中心词，列 = 上下文词）· 已数 <b>' + st.t + '</b> / ' + total + ' 对'
      }));
      var bads = [];
      if (st.win === 1 && st.t === total) {
        /* 数完了就和 notebook 的 M_test_ans 逐位对账。有差异就把**所有**差异格标红 ——
           只标第一个会让人以为"就错了一格"。 */
        bads = A.diffCells(c.partial, A.M_TEST_ANS);
      }
      K.matrix(out, c.words, c.partial, { hots: cur ? [[cur.i, cur.k]] : [], bads: bads });

      out.appendChild(el('h5', { html: '三个可以自己验的性质' }));
      out.appendChild(K.kvs([
        ['对称性 max|X−Xᵀ|', String(c.maxAsymmetry), c.maxAsymmetry === 0 ? 'ok' : 'warn'],
        ['对角线元素和', String(A.diagSum(c.partial)), A.diagSum(c.partial) === 0 ? 'ok' : 'warn'],
        ['非零格', A.nonzero(c.partial) + ' / ' + (c.n * c.n)]
      ]));

      /* ---- 状态说明 ---- */
      clear(status);
      if (!st.t) {
        status.innerHTML = '还没开始数，矩阵全是 0 —— <b>点「下一步」</b>，看第一个格子的 1 是怎么来的。';
      } else if (cur) {
        status.innerHTML = '第 <b>' + (cur.d + 1) + '</b> 句第 <b>' + (cur.c + 1) +
          '</b> 个位置「<b>' + KB.md.escapeHtml(A.TOY_CORPUS[cur.d][cur.c]) + '</b>」当中心词 → 窗口里看到「<b>' +
          KB.md.escapeHtml(A.TOY_CORPUS[cur.d][cur.j]) + '</b>」' +
          '（位置 ' + (cur.j + 1) + '，距离 ' + Math.abs(cur.j - cur.c) + '）→ 格子 ' +
          '<span class="mono">X[' + cur.i + '][' + cur.k + ']</span> +1。';
        if (st.t === total) {
          if (st.win === 1) {
            var nb2 = A.checkAgainstNotebook();
            status.innerHTML += ' <b>数完了</b>（' + total + ' 对）：这份矩阵与 notebook 的 <code>M_test_ans</code> ' +
              (nb2.ok ? '<b>逐位一致</b> —— 你手上那份只要口径一样，assert 就会全绿。'
                      : '不一致（第 ' + (nb2.firstBad ? (nb2.firstBad.i + 1) + ' 行 ' + (nb2.firstBad.j + 1) + ' 列' : '?') + ' 格）。');
          } else {
            status.innerHTML += ' <b>数完了</b>（' + total + ' 对）。把窗口调回 1 才能和 <code>M_test_ans</code> 对账 —— 那份答案固定用窗口 1。';
          }
        }
      }
      bPrev.disabled = st.t === 0;
      bNext.disabled = st.t >= total;
      bAll.disabled = st.t >= total;
      bRst.disabled = st.t === 0;
    }
    draw();
  });

  /* ============================================================
   * ② 错法对照调试器
   * ============================================================ */
  KB.viz.register('a1-wrong', function (root) {
    var p = K.panel('sanity check 红了：先认出是哪一种错',
      '同一个 toy 语料、同一个窗口，六种写法各算出什么。红色的格子是' +
      '「你的实现」与正确答案的第一个不同处 —— 先看它，再看下面那三个数。',
      'notebook cell-14 的 <code>M_test_ans</code>（「正确实现」与它一格不差）');
    root.appendChild(p.wrap);

    var st = { win: 1, pick: 'correct' };

    /* 变体的 key / 名字与窗口无关，所以分段按钮只建一次 */
    var ITEMS = A.variants(A.TOY_CORPUS, 1).variants.map(function (v) {
      return { key: v.key, label: v.name };
    });

    var ctlWrap = el('div', { class: 'viz-ctl' });
    var sl = K.slider(1, 4, 1, 1, function (v) { st.win = v; draw(); });
    ctlWrap.appendChild(K.ctl('窗口大小 w', sl.node, sl.val));
    var s = seg(ITEMS, function (k) { st.pick = k; draw(); });
    ctlWrap.appendChild(K.ctl('你的实现', s.node));
    p.body.insertBefore(ctlWrap, p.body.firstChild);

    var out = el('div', { class: 'viz-out' });
    var status = el('div', { class: 'viz-status' });
    var anchor = p.body.querySelector('.viz-src');
    p.body.insertBefore(out, anchor);
    p.body.insertBefore(status, anchor);

    function draw() {
      var all = A.variants(A.TOY_CORPUS, st.win).variants;
      var v = all[0];
      for (var i = 0; i < all.length; i++) if (all[i].key === st.pick) v = all[i];
      s.pick(v.key);

      var base = A.cooccurrence(A.TOY_CORPUS, { window: st.win });

      clear(out);
      out.appendChild(el('h5', {
        html: '矩阵 X（行 = 中心词，列 = 上下文词）· 与正确答案相差 <b>' +
          v.diffCount + '</b> / ' + (base.n * base.n) + ' 格' +
          (v.diffCount ? '（红格）' : '')
      }));
      /* 标**全部**不同格，不是只标第一个。好几个错法的教学点恰恰是"错的格很多"：
         忘了跳过自己 → 整条对角线变红；词表没排序 → 36/100 格变红，
         可元素和与对称性全对（"数字看着全对"这句话就是这么被看见的）。 */
      K.matrix(out, v.words, v.X, { bads: v.diffCells || [] });

      out.appendChild(el('h5', { html: '三个数，一眼看出是哪种病' }));
      out.appendChild(K.kvs([
        ['元素和', String(round3(v.sum)), v.sum === base.sum ? '' : 'warn'],
        ['对角线元素和', String(round3(v.diag)), v.diag === 0 ? 'ok' : 'bad'],
        ['max|X−Xᵀ|', String(round3(v.asym)), v.asym === 0 ? 'ok' : 'bad']
      ]));

      clear(status);
      var msg = '<b>' + KB.md.escapeHtml(v.name) + '</b>：' + KB.md.inline(v.why);
      if (v.diff) {
        msg += '<br><b>第一个不同格</b>：<span class="mono">X[' + v.diff.i + '][' + v.diff.j + ']</span>（' +
          KB.md.escapeHtml(v.diff.row) + ' × ' + KB.md.escapeHtml(v.diff.col) + '）—— 你算了 <b>' +
          v.diff.got + '</b>，答案要 <b>' + v.diff.want + '</b>。' +
          '<br>红格共 <b>' + v.diffCount + '</b> 格 —— 上面那张表里红的都是。';
      } else if (v.key === 'correct') {
        msg += '<br>这份与 <code>M_test_ans</code> 逐位一致：<b>0 格不同</b>。';
      } else {
        msg += '<br><b>注意</b>：在当前窗口（' + st.win + '）下它和正确实现算出来<b>完全一样</b> —— ' +
          '所有 sanity check 都用窗口 1，于是查不出这个错。把窗口拖到 2 以上再看。';
      }
      status.innerHTML = msg;
    }
    draw();
  });
})(typeof window !== 'undefined' ? window : globalThis);
