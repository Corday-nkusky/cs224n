/* ============================================================
 * k01_viz.js —— 7 个交互实验
 * ------------------------------------------------------------
 * 全部数字由 js/core/k01_core.js 现算 + reference/imdb2000_freq.json 的真实词频。
 * 每个实验都对应讲义里的一张表或一个结论（写在 viz-src 里）。
 * ============================================================ */
(function (global) {
  'use strict';
  var KB = global.KB = global.KB || {};
  var el = KB.dom.el, clear = KB.dom.clear;

  /* 注册表与公共小件都挪到了 js/ui/viz-kit.js —— A1 的作业页交互要用同一套。
     这里只取个别名：下面 11 个 reg.xxx 的写法一个字都不用改。 */
  var reg = KB.vizReg;

  var C = KB.core && KB.core.k01;

  /* 公共小件（panel / ctl / slider / kvs / bars / matrix）从 viz-kit 取。
     保留同名局部变量 —— 下面 11 个交互里的调用点一个字都不用改。 */
  var panel = KB.vizKit.panel, ctl = KB.vizKit.ctl, slider = KB.vizKit.slider,
      kvs = KB.vizKit.kvs, bars = KB.vizKit.bars, matrix = KB.vizKit.matrix;

  /* ============================================================
   * ① one-hot
   * ============================================================ */
  reg.onehot = function (root) {
    var p = panel('one-hot：相似度这个概念根本不存在',
      '点两个词，看它们的内积。5 词词表，向量长度 = 词表大小。',
      '<code>logs/k01_demo_out.txt</code> PART 1');
    root.appendChild(p.wrap);

    var words = ['hotel', 'motel', 'banking', 'monetary', 'cat'];
    var V = words.length;
    var vecs = words.map(function (_, i) {
      return C.zeros(V).map(function (__, j) { return i === j ? 1 : 0; });
    });
    var X = C.zeros2(V, V);
    for (var i = 0; i < V; i++) for (var j = 0; j < V; j++) X[i][j] = C.dot(vecs[i], vecs[j]);

    var pick = [0, 1];
    var out = el('div', { class: 'viz-out' });
    var selWrap = el('div', { class: 'viz-ctl' });

    function mkSel(idx) {
      var s = el('select', {});
      words.forEach(function (w, k) { s.appendChild(el('option', { value: k, text: w, selected: k === pick[idx] ? 'selected' : null })); });
      s.addEventListener('change', function () { pick[idx] = parseInt(s.value, 10); draw(); });
      return s;
    }
    selWrap.appendChild(el('div', { class: 'ctl' }, el('label', { text: '词 A' }), mkSel(0), el('label', { text: '词 B' }), mkSel(1)));
    p.body.appendChild(selWrap);
    p.body.appendChild(out);

    function draw() {
      clear(out);
      var a = pick[0], b = pick[1];
      out.appendChild(el('h5', { html: '两两内积（行 × 列）' }));
      matrix(out, words, X, { hot: [a, b] });
      var d = X[a][b];
      out.appendChild(el('h5', { html: '你选的这一对' }));
      out.appendChild(kvs([
        ['<code>' + words[a] + '</code> · <code>' + words[b] + '</code>', d.toFixed(0), d === 0 ? 'warn' : 'ok'],
        ['对角线（自己跟自己）', X[a][a].toFixed(0), 'ok']
      ]));
      out.appendChild(el('p', { class: 'mini', html: a === b
        ? '同一个词 → 内积 = 1。'
        : '<b>内积 = 0，术语叫「正交」。</b>于是 <code>' + words[a] + '</code> 和 <code>' + words[b] +
          '</code> 的关系，跟 <code>' + words[a] + '</code> 和随便哪个词的关系，<b>在数值上完全相同</b>。' }));
      out.appendChild(el('p', { class: 'mini', html: '对角线是 1，其余<b>全部是 0</b>。<b>"有点像"这个中间状态整个是空的</b> —— 而恰恰是中间地带装着全部有用信息。' }));
    }
    draw();
  };

  /* ============================================================
   * ② 共现矩阵
   * ============================================================ */
  var TOY_A = [['I', 'like', 'deep', 'learning'], ['I', 'like', 'NLP'], ['I', 'enjoy', 'flying']];
  var TOY_B = TOY_A.concat([['I', 'enjoy', 'learning', 'NLP']]);

  function cooc(corpus, win) { return C.cooccurrence(corpus, { window: win }); }

  reg.cooccur = function (root) {
    var p = panel('共现矩阵：对称和稀疏是图结构的后果，不是你塞进去的',
      '改窗口大小、改语料，看矩阵和两个性质怎么变。',
      '<code>logs/k01_demo_out.txt</code> PART 2、<code>logs/k01_verify_dim_out.txt</code>');
    root.appendChild(p.wrap);

    var st = { win: 1, variant: 0 };
    var out = el('div', { class: 'viz-out' });
    var ctls = el('div', { class: 'viz-ctl' });

    var sl = slider(1, 3, 1, 1, function (v) { st.win = v; draw(); });
    ctls.appendChild(ctl('窗口大小', sl.node, sl.val));

    var sel = el('select', {});
    sel.appendChild(el('option', { value: 0, text: '原 3 句话（was: 二分图）' }));
    sel.appendChild(el('option', { value: 1, text: '加一句 I enjoy learning NLP' }));
    sel.addEventListener('change', function () { st.variant = parseInt(sel.value, 10); draw(); });
    ctls.appendChild(ctl('语料', sel));

    p.body.insertBefore(ctls, p.body.firstChild);
    p.body.insertBefore(out, p.body.querySelector('.viz-src'));

    function draw() {
      clear(out);
      var corpus = st.variant === 0 ? TOY_A : TOY_B;
      var c = cooc(corpus, st.win);
      var bp = C.isBipartite(c.X);

      out.appendChild(el('h5', { html: '共现矩阵 X（行 = 中心词，列 = 上下文词）' }));
      matrix(out, c.words, c.X);
      out.appendChild(el('h5', { html: '两个可以自己验的性质' }));
      out.appendChild(kvs([
        ['对称性 $\\max|X-X^{\\mathsf T}|$', String(c.maxAsymmetry), c.maxAsymmetry === 0 ? 'ok' : 'bad'],
        ['非零元素', c.nonzero + '/' + c.total],
        ['非零占比', (c.nonzeroRatio * 100).toFixed(1) + '%'],
        ['是否二分图', bp.bipartite ? '是' : '否', bp.bipartite ? 'warn' : 'ok']
      ]));
      if (st.win === 1 && st.variant === 0) {
        out.appendChild(el('p', { class: 'mini', html: '<b>这一行就是日志里的数字：</b>max|X−Xᵀ| = 0、12/49 = <b>24.5%</b>。' }));
      } else {
        out.appendChild(el('p', { class: 'mini', html: '⚠️ 改动之后已经没有日志可对账了 —— 这里的数字是本页现算的，口径与 <code>code/k01_demo.py</code> 一致（只记中心词 → 上下文词这一个方向）。' }));
      }
      if (bp.bipartite) {
        var g = bp.groups;
        out.appendChild(el('p', { class: 'mini', html: '二分划片：A = {' + g[0].map(function (i) { return c.words[i]; }).join(', ') +
          '}，B = {' + g[1].map(function (i) { return c.words[i]; }).join(', ') +
          '}。<b>组内互不共现，只跟对面组共现</b> —— 记住这一点，第 ③ 个实验里它会导致奇异值成对相等。' }));
      }
    }
    draw();
  };

  /* ============================================================
   * ③ 降维：名义 k ≠ 有效自由度
   * ============================================================ */
  reg.dim = function (root) {
    var p = panel('降维：一堆 1.0000 不是"学得好"，是塌了',
      '拖 k，数每个词实际用到几个坐标，再看 |cos| = 1 的词对有多少。',
      '<code>logs/k01_verify_dim_out.txt</code> 实验 1/2');
    root.appendChild(p.wrap);

    var st = { k: 2, variant: 0 };
    var out = el('div', { class: 'viz-out' });
    var ctls = el('div', { class: 'viz-ctl' });
    var sl = slider(1, 6, 1, 2, function (v) { st.k = v; draw(); });
    ctls.appendChild(ctl('保留维度 k', sl.node, sl.val));
    var sel = el('select', {});
    sel.appendChild(el('option', { value: 0, text: '原 3 句话（二分图，有退化）' }));
    sel.appendChild(el('option', { value: 1, text: '加第 4 句（打破二分图）' }));
    sel.addEventListener('change', function () { st.variant = parseInt(sel.value, 10); draw(); });
    ctls.appendChild(ctl('语料', sel));
    p.body.insertBefore(ctls, p.body.firstChild);
    p.body.insertBefore(out, p.body.querySelector('.viz-src'));

    function draw() {
      clear(out);
      var corpus = st.variant === 0 ? TOY_A : TOY_B;
      var c = cooc(corpus, 1);
      var svd = C.svdEmbedding(c.X, c.words.length);
      var k = Math.min(st.k, c.words.length);
      var emb = C.svdEmbedding(c.X, k).embedding;
      var nz = C.nonzeroCoordCounts(emb, 1e-8);
      var pairs = C.absCosOnePairs(emb, 1e-6);

      out.appendChild(el('h5', { html: '奇异值（成对相等 = 二分图指纹）' }));
      out.appendChild(el('div', { class: 'vec', text: svd.sigmas.map(function (s, i) {
        return s.toFixed(6) + (i === k - 1 ? '  ← 保留到这一根' : '');
      }).join('\n') }));

      out.appendChild(el('h5', { html: 'k = ' + k + ' 时每个词的坐标（保留 6 位小数）' }));
      var rows = c.words.map(function (w, i) {
        return w.padEnd(9) + ' [' + emb[i].map(function (v) { return (v >= 0 ? '+' : '') + v.toFixed(6).padStart(9); }).join(' ') +
          ']   非零坐标数 = ' + nz[i];
      });
      out.appendChild(el('div', { class: 'vec', text: rows.join('\n') }));

      var allOne = nz.every(function (x) { return x === 1; });
      out.appendChild(el('h5', { html: '判据' }));
      out.appendChild(kvs([
        ['每词非零坐标数', '[' + nz.join(', ') + ']', allOne && k > 1 ? 'bad' : ''],
        ['|cos| = 1 的词对', pairs.count + '/' + pairs.total + ' = ' + (pairs.ratio * 100).toFixed(1) + '%',
          pairs.ratio > 0.3 ? 'bad' : (pairs.count ? 'warn' : 'ok')],
        ['矩阵秩', String(svd.sigmas.filter(function (s) { return s > 1e-7; }).length) + ' / ' + c.words.length]
      ]));

      if (allOne && k > 1) {
        out.appendChild(el('p', { class: 'mini', html: '<b>塌了。</b>名字叫 ' + k + ' 维，实际每个词只用到 <b>1</b> 个坐标 —— 两根轴从没被同一个词同时使用过。' }));
      }
      if (pairs.count) {
        var names = pairs.pairs.map(function (pr) { return '<code>' + c.words[pr[0]] + '</code>–<code>' + c.words[pr[1]] + '</code>'; });
        out.appendChild(el('p', { class: 'mini', html: '|cos| = 1 的词对：' + names.join('、') + '。' }));
      }

      out.appendChild(el('h5', { html: '重构误差 ‖X − X_k‖_F（k 增大应收敛到 0）' }));
      var errBars = el('div', { class: 'bars' });
      out.appendChild(errBars);
      bars(errBars, [1, 2, 3, 4, 5, 6, 7].slice(0, c.words.length).map(function (kk) {
        var e = C.reconstructionError(svd.sigmas, kk);
        return { label: 'k=' + kk, value: e, text: e.toFixed(4), cls: kk === k ? '' : 'alt' };
      }));

      // 日志对照表
      out.appendChild(el('h5', { html: '与日志对照（实验 1：原 3 句话）' }));
      var logTbl = { 1: [6, 21, 28.6], 2: [9, 21, 42.9], 3: [0, 21, 0], 4: [0, 21, 0], 5: [0, 21, 0], 6: [0, 21, 0], 7: [0, 21, 0] };
      var rows2 = [];
      for (var kk = 1; kk <= 7; kk++) {
        var logged = logTbl[kk];
        var live = null;
        if (kk <= c.words.length) {
          var e2 = C.svdEmbedding(c.X, kk).embedding;
          var r2 = C.absCosOnePairs(e2, 1e-6);
          live = r2.count + '/' + r2.total + ' = ' + (r2.ratio * 100).toFixed(1) + '%';
        }
        rows2.push([String(kk), logged ? logged[0] + '/' + logged[1] + ' = ' + logged[2] + '%' : '—',
          live || '—', (kk === 3 && st.variant === 0) ? '⚠️ 不可复现（见下）' : '']);
      }
      out.appendChild(el('div', { class: 'tbl-wrap' }, el('table', { class: 'md' },
        el('tr', {}, el('th', { text: 'k' }), el('th', { text: '日志（numpy）' }), el('th', { html: '本页现算（Jacobi）' }), el('th', { text: '' })),
        rows2.map(function (r) { return el('tr', {}, r.map(function (cell, i) { return el('td', { html: cell, class: i === 3 && cell ? 'warn' : '' }); })); })
      )));
      if (st.variant === 0) {
        out.appendChild(el('p', { class: 'mini', html: '⚠️ <b>k=3 那一行两边的数字不同，这是正常的</b>，不是 bug：奇异值成对相等时，那一对张成的 2 维子空间里<b>基不唯一</b>，numpy 和 Jacobi 各选了一个合法基。k 跨<b>完整</b>退化组（2/4/6）时是基无关的，两边一致。详见 <code>tests/core.test.js</code> 的说明与「诚实清单」。' }));
      }
    }
    draw();
  };

  /* ============================================================
   * ④ 负采样噪声分布
   * ============================================================ */
  reg.noise = function (root) {
    var p = panel('负采样：为什么要给词频开 3/4 次方',
      '真实词频来自 IMDB top-2000。拖 α，看高频词被压、低频词被抬。',
      '<code>logs/k01_huffman_neg_out.txt</code> 实验 A');
    root.appendChild(p.wrap);

    var F = KB.freq.imdb2000;
    var show = ['the', 'and', 'a', 'of', 'to', 'man', 'king', 'queen'];
    var st = { alpha: 0.75 };
    var out = el('div', { class: 'viz-out' });
    var ctls = el('div', { class: 'viz-ctl' });
    var sl = slider(0, 1, 0.05, 0.75, function (v) { st.alpha = v; draw(); });
    ctls.appendChild(ctl('α（词频的次方）', sl.node, sl.val));
    p.body.insertBefore(ctls, p.body.firstChild);
    p.body.insertBefore(out, p.body.querySelector('.viz-src'));

    var idx = show.map(function (w) { return F.words.indexOf(w); });

    function draw() {
      clear(out);
      var d = C.noiseDistribution(F.counts, st.alpha);
      var uni = C.unigram(F.counts);

      out.appendChild(el('h5', { html: '被采为负样本的概率（%）—— 蓝 = 当前 α，灰 = α=1（纯词频）' }));
      var bx = el('div', { class: 'bars' });
      out.appendChild(bx);
      var items = [];
      idx.forEach(function (i, n) {
        items.push({ label: show[n], value: d.p[i] * 100, text: (d.p[i] * 100).toFixed(3) + '%', cls: '' });
        items.push({ label: '↳ 纯词频', value: uni[i] * 100, text: (uni[i] * 100).toFixed(3) + '%', cls: 'alt' });
      });
      bars(bx, items);

      out.appendChild(el('h5', { html: '分布的整体性质' }));
      out.appendChild(kvs([
        ['熵 H（nats）', d.entropy.toFixed(4)],
        ['最高频词占比', (d.p[0] * 100).toFixed(3) + '%'],
        ['高频词被压低倍数（α=1 ÷ 当前）', (uni[idx[0]] / d.p[idx[0]]).toFixed(2) + '×'],
        ['queen 相对纯词频', (d.p[idx[7]] / uni[idx[7]]).toFixed(2) + '×']
      ]));

      out.appendChild(el('h5', { html: '日志里的四个锚点（可对照）' }));
      out.appendChild(el('div', { class: 'tbl-wrap' }, el('table', { class: 'md' },
        el('tr', {}, el('th', { text: 'α' }), el('th', { html: '熵 H' }), el('th', { html: 'the 占比' }), el('th', { text: '本页现算' })),
        [[0, 7.6009, 0.050], [0.5, 7.3284, 0.840], [0.75, 6.7838, 2.715], [1.0, 5.8683, 6.880]].map(function (r) {
          var now = C.noiseDistribution(F.counts, r[0]);
          var hit = Math.abs(st.alpha - r[0]) < 1e-9;
          return el('tr', { class: hit ? 'ok' : '' },
            el('td', { html: 'α=' + r[0] + (hit ? ' ←当前' : '') }),
            el('td', { html: r[1].toFixed(4) + (hit ? '' : '') }),
            el('td', { html: r[2].toFixed(3) + '%' }),
            el('td', { html: now.entropy.toFixed(4) + ' / ' + (now.p[0] * 100).toFixed(3) + '%' }));
        })
      )));
      out.appendChild(el('p', { class: 'mini', html: 'α=1 时 the 一家占 6.880%，模型只要学会"看到 the 就说不是邻居"就能拿高分，<b>学不到细粒度区分</b>；α=0 又太平，常见但无关的词见不到。<b>0.75 是折中，也是原论文的经验值</b>（为什么恰好 3/4 论文没给推导）。' }));
    }
    draw();
  };

  /* ============================================================
   * ⑤ 哈夫曼树
   * ============================================================ */
  reg.huffman = function (root) {
    var p = panel('哈夫曼树：代价正比于路径长度，所以高频词该走短路',
      '真实词频（IMDB top-2000）建树。选一个词，看它的路径被高亮出来。',
      '<code>logs/k01_huffman_neg_out.txt</code> 实验 B/C/D');
    root.appendChild(p.wrap);

    var F = KB.freq.imdb2000;
    var tree = C.buildHuffman(F.counts);
    var st = { word: 'the' };

    var out = el('div', { class: 'viz-out' });
    var ctls = el('div', { class: 'viz-ctl' });
    var sel = el('select', {});
    var cand = F.words.slice(0, 16).concat(['frame', 'teens', 'according', 'study', 'morning']);
    cand.forEach(function (w) { sel.appendChild(el('option', { value: w, text: w + '（频次 ' + F.counts[F.words.indexOf(w)] + '）' })); });
    sel.addEventListener('change', function () { st.word = sel.value; draw(); });
    ctls.appendChild(ctl('看哪个词', sel));
    var chk = el('input', { type: 'checkbox', checked: 'checked' });
    chk.addEventListener('change', function () { draw(); });
    ctls.appendChild(el('div', { class: 'ctl' }, el('label', { text: '画出路径' }), el('label', { class: 'chk' }, chk, el('span', { text: '从根到该词的路径' }))));
    p.body.insertBefore(ctls, p.body.firstChild);
    p.body.insertBefore(out, p.body.querySelector('.viz-src'));

    var wpl = C.weightedPathLength(F.counts, tree.depths);
    var avgByWord = tree.depths.reduce(function (a, b) { return a + b; }, 0) / tree.depths.length;
    var maxD = Math.max.apply(null, tree.depths);
    var minD = Math.min.apply(null, tree.depths);

    function drawPath(S, idx, bits) {
      clear(S);
      // 沿着路径逐层画出「该节点 + 它的两个孩子」，高亮被选中的分支
      var node = tree.root, y = 0, dy = 34;
      var width = 520, mid = width / 2;
      var svgNS = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + ((bits.length + 1) * dy + 10));
      svg.setAttribute('class', 'tree-svg');
      function mk(tag, attrs, text) {
        var n = document.createElementNS(svgNS, tag);
        Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
        if (text != null) n.textContent = text;
        return n;
      }
      for (var j = 0; j < bits.length; j++) {
        var bit = bits[j];
        var child = bit === '0' ? node.left : node.right;
        var sib = bit === '0' ? node.right : node.left;
        // 节点
        svg.appendChild(mk('circle', { cx: mid, cy: y + 8, r: 5, fill: 'none', stroke: 'currentColor' }));
        svg.appendChild(mk('text', { x: mid + 10, y: y + 12 }, '第 ' + (j + 1) + ' 层内部节点'));
        // 两条边
        var lx = mid - 70, rx = mid + 70, cy2 = y + dy;
        svg.appendChild(mk('path', { d: 'M' + mid + ',' + (y + 13) + ' L' + lx + ',' + (cy2 - 2), class: 'edge' + (bit === '0' ? ' hot' : '') }));
        svg.appendChild(mk('path', { d: 'M' + mid + ',' + (y + 13) + ' L' + rx + ',' + (cy2 - 2), class: 'edge' + (bit === '1' ? ' hot' : '') }));
        svg.appendChild(mk('text', { x: (mid + lx) / 2 - 4, y: y + 25, class: 'bit' }, '0'));
        svg.appendChild(mk('text', { x: (mid + rx) / 2 + 2, y: y + 25, class: 'bit' }, '1'));
        // 子节点
        var last = j === bits.length - 1;
        svg.appendChild(mk('circle', { cx: lx, cy: cy2, r: 4, class: bit === '0' ? 'hot' : '' }));
        svg.appendChild(mk('text', { x: lx - 46, y: cy2 + 3 }, bit === '0' ? (last ? idx : '…') : '…'));
        svg.appendChild(mk('circle', { cx: rx, cy: cy2, r: 4, class: bit === '1' ? 'hot' : '' }));
        svg.appendChild(mk('text', { x: rx + 8, y: cy2 + 3 }, bit === '1' ? (last ? idx : '…') : '…'));
        node = child;
        mid = bit === '0' ? lx : rx;
        y = cy2;
      }
      S.appendChild(svg);
    }

    function draw() {
      clear(out);
      var idx = F.words.indexOf(st.word);
      var bits = tree.paths[idx];
      var depth = tree.depths[idx];

      out.appendChild(el('h5', { html: '① ' + st.word + ' 的路径' }));
      out.appendChild(el('div', { class: 'path-bits' }, bits.split('').map(function (b) {
        return el('span', { class: b === '0' ? '' : 'hot', text: b });
      }).concat([el('span', { style: 'border:none;background:none;color:var(--fg-muted)', text: '  深度 ' + depth + '（左=0，右=1）' })])));

      out.appendChild(el('h5', { html: '② 从根到它的路径（每层都是一道二分类）' }));
      var svgHost = el('div', {});
      out.appendChild(svgHost);
      drawPath(svgHost, st.word, bits);

      out.appendChild(el('h5', { html: '③ 整棵树的统计' }));
      out.appendChild(kvs([
        ['词表大小 W', String(F.V)],
        ['内部节点数', String(C.collectInternalNodes(tree.root).list.length) + '（理论 W−1 = ' + (F.V - 1) + '）', 'ok'],
        ['最短 / 最长路径', minD + ' / ' + maxD],
        ['the 的深度', String(tree.depths[0])],
        ['加权平均路径长（按词频）', wpl.toFixed(3), 'ok'],
        ['平均路径长（按词数）', avgByWord.toFixed(3), 'warn'],
        ['完全平衡树', String(C.balancedDepth(F.V)) + '.000'],
        ['log₂W', (Math.log(F.V) / Math.LN2).toFixed(3)]
      ]));

      out.appendChild(el('h5', { html: '④ 三种树的代价对比（越小越好）' }));
      var bx = el('div', { class: 'bars' });
      out.appendChild(bx);
      bars(bx, [
        { label: '哈夫曼', value: wpl, text: wpl.toFixed(4), cls: '' },
        { label: '平衡树', value: C.balancedDepth(F.V), text: C.balancedDepth(F.V).toFixed(4), cls: 'alt' },
        { label: '随机合并', value: 14.3082, text: '14.3082 *', cls: 'warn' }
      ]);
      out.appendChild(el('p', { class: 'mini', html: '哈夫曼 / 平衡树 = <b>' + (wpl / C.balancedDepth(F.V)).toFixed(3) + '</b> → 省 <b>' + ((1 - wpl / C.balancedDepth(F.V)) * 100).toFixed(1) + '%</b>。论文口径"平均不超过 log₂W"：' +
        wpl.toFixed(3) + ' ≤ ' + (Math.log(F.V) / Math.LN2).toFixed(3) + ' —— <b>' + (wpl <= Math.log(F.V) / Math.LN2 ? '成立' : '不成立') + '</b>。' }));
      out.appendChild(el('p', { class: 'mini', html: '* <b>随机合并树 = 14.3082 是引用的实测值</b>（原脚本用 numpy 随机数发生器、20 次平均，SEED=20261006）；本页的 JS 重算会给同量级但不同的数，所以不重算、直接标出来源（哈夫曼的 1.685 倍）。' }));
      out.appendChild(el('p', { class: 'mini', html: '⚠️ <b>树的形状只由词频决定，不含任何句法或语义信息。</b>树形跟"词义层次"没有关系 —— 这是最常见的误解之一。' }));
    }
    draw();
  };

  /* ============================================================
   * ⑥ skip-gram 梯度
   * ============================================================ */
  reg.grad = function (root) {
    var p = panel('skip-gram 梯度：解析式 vs 数值差分',
      '拖中心词向量和真实上下文向量，看概率分布怎么变、梯度怎么算。右侧是中心差分独立算出来的梯度。',
      '<code>04_原理深潜.md</code> §2.3–§2.4（slides 里没有这两页公式）');
    root.appendChild(p.wrap);

    var V = 5, D = 3;
    var voc = ['I', 'like', 'deep', 'learning', 'NLP'];
    var rnd = C.mulberry32(7);
    var U = C.zeros2(V, D);
    for (var i = 0; i < V; i++) for (var j = 0; j < D; j++) U[i][j] = Number(((rnd() * 2 - 1) * 1.2).toFixed(3));

    var st = { vc: [0.8, -0.4, 0.6], o: 1 };
    var out = el('div', { class: 'viz-out' });
    var ctls = el('div', { class: 'viz-ctl' });

    ['v_c[0]', 'v_c[1]', 'v_c[2]'].forEach(function (lb, k) {
      var sl = slider(-2, 2, 0.1, st.vc[k], function (v) { st.vc[k] = v; draw(); });
      ctls.appendChild(ctl(lb, sl.node, sl.val));
    });
    var sel = el('select', {});
    voc.forEach(function (w, k) { sel.appendChild(el('option', { value: k, text: 'o = ' + w, selected: k === st.o ? 'selected' : null })); });
    sel.addEventListener('change', function () { st.o = parseInt(sel.value, 10); draw(); });
    ctls.appendChild(ctl('真实上下文 o', sel));
    p.body.insertBefore(ctls, p.body.firstChild);
    p.body.insertBefore(out, p.body.querySelector('.viz-src'));

    function draw() {
      clear(out);
      var g = C.skipgramSoftmaxGrad(st.vc, U, st.o);
      var numVc = C.numericGrad(function () { return C.skipgramSoftmaxGrad(st.vc, U, st.o).J; }, st.vc, 1e-6);
      var numUo = C.numericGrad(function () { return C.skipgramSoftmaxGrad(st.vc, U, st.o).J; }, U[st.o], 1e-6);

      out.appendChild(el('h5', { html: '① P(w | c) = softmax(U · v_c)  ——  注意 Σ = ' + g.P.reduce(function (a, b) { return a + b; }, 0).toFixed(12) }));
      var bx = el('div', { class: 'bars' });
      out.appendChild(bx);
      bars(bx, voc.map(function (w, k) {
        return { label: w + (k === st.o ? ' ★' : ''), value: g.P[k], text: g.P[k].toFixed(6), cls: k === st.o ? '' : 'alt' };
      }));

      out.appendChild(el('h5', { html: '② ∂J/∂v_c = Σ_w P(w|c)·u_w − u_o  （期望 − 观测）' }));
      var cmp = el('div', { class: 'cmp' });
      cmp.appendChild(el('div', { class: 'box' },
        el('div', { class: 'bt', html: '解析梯度' }),
        el('div', { class: 'mono', text: g.dvc.map(function (x) { return (x >= 0 ? '+' : '') + x.toFixed(9); }).join('  ') })));
      cmp.appendChild(el('div', { class: 'box' },
        el('div', { class: 'bt', html: '中心差分（独立算法，h = 1e-6）' }),
        el('div', { class: 'mono', text: numVc.map(function (x) { return (x >= 0 ? '+' : '') + x.toFixed(9); }).join('  ') })));
      out.appendChild(cmp);
      out.appendChild(kvs([
        ['max|解析 − 数值|', C.maxAbsDiff(g.dvc, numVc).toExponential(3), C.maxAbsDiff(g.dvc, numVc) < 1e-7 ? 'ok' : 'bad'],
        ['∂J/∂u_o 的 max|差|', C.maxAbsDiff(g.dU[st.o], numUo).toExponential(3), C.maxAbsDiff(g.dU[st.o], numUo) < 1e-7 ? 'ok' : 'bad'],
        ['J = −log P(o|c)', g.J.toFixed(6)]
      ]));

      out.appendChild(el('h5', { html: '③ ∂J/∂u_w 对 V−1 个非目标词全部非零 —— 这就是"反向写得多"' }));
      out.appendChild(el('div', { class: 'tbl-wrap' }, el('table', { class: 'md' },
        el('tr', {}, el('th', { text: 'w' }), el('th', { html: 'P(w|c)' }), el('th', { html: '系数' }), el('th', { html: '‖∂J/∂u_w‖' })),
        voc.map(function (w, k) {
          var coef = k === st.o ? g.P[k] - 1 : g.P[k];
          return el('tr', {},
            el('td', { html: '<code>' + w + '</code>' + (k === st.o ? ' ★o' : '') }),
            el('td', { html: g.P[k].toFixed(6) }),
            el('td', { html: coef.toFixed(6) }),
            el('td', { html: C.norm(g.dU[k]).toFixed(6) }));
        })
      )));
      out.appendChild(el('p', { class: 'mini', html: '<b>5 个词里没有一个是 0</b>（除 o 外全是 $P(w|c)v_c$）。每训一个词对就要读写整个 U 矩阵 —— 梯度从"稀疏"被分母强行变成"稠密"。这是 §2.6 里第 ② 类问题"最致命"的原因。' }));
      out.appendChild(el('p', { class: 'mini', html: '把 v_c 往真实邻居那边拖一点（比如把对应分量调正），会看到 P(o|c) 上升、∂J/∂v_c 的模变小 —— 这正是"梯度 → 0 就收敛"的直观版本。' }));
    }
    draw();
  };

  /* ============================================================
   * ⑦ 复杂度账
   * ============================================================ */
  reg.cost = function (root) {
    var p = panel('复杂度账：三类问题各自被谁治了',
      '拖词表大小和维度，看三种方法的乘加次数、以及"每步写回几行"。',
      '<code>playground/t1_word2vec/run_numpy_out.txt</code>、<code>04 §2.5</code>');
    root.appendChild(p.wrap);

    var st = { V: 100000, D: 300, K: 5 };
    var out = el('div', { class: 'viz-out' });
    var ctls = el('div', { class: 'viz-ctl' });

    var sV = slider(2, 6, 0.1, 5, function (v) { st.V = Math.round(Math.pow(10, v)); draw(); });
    ctls.appendChild(ctl('log₁₀V', sV.node, sV.val));
    var sD = slider(25, 1000, 25, 300, function (v) { st.D = v; draw(); });
    ctls.appendChild(ctl('维度 D', sD.node, sD.val));
    var sK = slider(1, 20, 1, 5, function (v) { st.K = v; draw(); });
    ctls.appendChild(ctl('负样本数 K', sK.node, sK.val));
    p.body.insertBefore(ctls, p.body.firstChild);
    p.body.insertBefore(out, p.body.querySelector('.viz-src'));

    // V 滑的是指数，需要同步显示 V 的真值
    var vLabel = el('div', { class: 'ctl' }, el('label', { text: '当前设置' }), el('span', { class: 'val', style: 'min-width:auto' }));
    ctls.appendChild(vLabel);

    function draw() {
      clear(out);
      var L = C.balancedDepth(st.V);
      var c = C.mulAddCounts(st.V, st.D, st.K, L);
      vLabel.lastChild.textContent = 'V = ' + st.V.toLocaleString() + '，D = ' + st.D + '，K = ' + st.K + '，⌈log₂V⌉ = ' + L;

      out.appendChild(el('h5', { html: '单对乘加次数（对数轴看量级）' }));
      var bx = el('div', { class: 'bars' });
      out.appendChild(bx);
      var mx = c.naive;
      bars(bx, [
        { label: 'naive', value: c.naive, text: c.naive.toExponential(3), cls: '' },
        { label: 'HS', value: c.hs, text: c.hs.toExponential(3), cls: 'alt' },
        { label: 'NEG', value: c.neg, text: c.neg.toExponential(3), cls: 'alt' }
      ], { max: mx });

      out.appendChild(kvs([
        ['naive / NEG', (c.naive / c.neg).toFixed(0) + '×', 'warn'],
        ['naive / HS', (c.naive / c.hs).toFixed(0) + '×', 'warn'],
        ['V=69, D=32, K=5 时', '2208 vs 192（日志口径）'],
        ['参数量（基本相同）', '2VD = ' + (2 * st.V * st.D).toExponential(3) + ' vs (2W−1)D = ' + ((2 * st.V - 1) * st.D).toExponential(3)]
      ]));

      out.appendChild(el('h5', { html: '每步写回几行 —— 这一列比乘加次数更要紧' }));
      out.appendChild(el('div', { class: 'tbl-wrap' }, el('table', { class: 'md' },
        el('tr', {}, el('th', { text: '方法' }), el('th', { html: '乘加次数' }), el('th', { html: '写回行数' })),
        [
          ['naive softmax', c.naive.toExponential(3), st.V.toLocaleString() + ' 行（全表）'],
          ['层次 softmax', c.hs.toExponential(3), '≈' + L + ' 行（路径上）'],
          ['负采样', c.neg.toExponential(3), (1 + st.K) + ' 行']
        ].map(function (r) {
          return el('tr', {}, r.map(function (x, i) { return el('td', { html: x, class: i === 2 ? 'num' : '' }); }));
        })
      )));

      out.appendChild(el('p', { class: 'mini', html: '把 V 拖到 10⁵、D = 300、K = 5，就复现了日志里的 <b>3.0e7 / 5.1e3 / 1.8e3</b>（HS 用的是 ⌈log₂V⌉=17）。' }));
      out.appendChild(el('p', { class: 'mini', html: '⚠️ 三种方法的<b>参数量基本相同</b> —— <b>省下来的是计算量，不是存储。</b>这一点很多教程会讲错。' }));
    }
    draw();
  };

  /* ============================================================
   * ⑧ 滑动窗口：共现矩阵是一个词一个词扫出来的
   *    （对标参考实现的「单步推进 / 自动播放 / 重置 / 状态回显」）
   * ============================================================ */
  reg.windowdemo = function (root) {
    var p = panel('滑动窗口：共现矩阵是一个词一个词扫出来的',
      '点「下一步」让窗口沿句子走一遍，看每一步它往矩阵的哪一格 +1。整句扫完，矩阵与上面 <code>cooccur</code> 那份逐格相同。',
      '<code>logs/k01_demo_out.txt</code> PART 2');
    root.appendChild(p.wrap);
    var src = p.body.querySelector('.viz-src');
    function add(n) { p.body.insertBefore(n, src); return n; }

    var SENTS = [['I', 'like', 'deep', 'learning'], ['I', 'like', 'NLP'], ['I', 'enjoy', 'flying']];
    var words = [], wi = {};
    SENTS.forEach(function (s) {
      s.forEach(function (w) { if (wi[w] == null) { wi[w] = words.length; words.push(w); } });
    });
    var V = words.length;
    var steps = [];
    SENTS.forEach(function (s, si) { for (var t = 0; t < s.length; t++) steps.push([si, t]); });

    var st = { win: 1, at: -1, timer: null, X: C.zeros2(V, V), last: [] };

    var lineBox = add(el('div', {}));
    var ctlBox = add(el('div', { class: 'viz-ctl' }));
    var statRow = add(el('div', { class: 'stat-row' }));
    var btnBar = add(el('div', { class: 'step-bar' }));
    var out = add(el('div', { class: 'viz-out' }));
    var status = add(el('div', { class: 'viz-status' }));

    var sl = slider(1, 2, 1, 1, function (v) { st.win = v; reset(); });
    ctlBox.appendChild(ctl('窗口半长 m', sl.node, sl.val));

    var bPrev = el('button', { class: 'btn', text: '← 上一步' });
    var bNext = el('button', { class: 'btn primary', text: '下一步 →' });
    var bPlay = el('button', { class: 'btn', text: '自动播放' });
    var bReset = el('button', { class: 'btn', text: '重置' });
    [bPrev, bNext, bPlay, bReset].forEach(function (b) { btnBar.appendChild(b); });

    function stop() { if (st.timer) { clearInterval(st.timer); st.timer = null; } bPlay.textContent = '自动播放'; }
    function play() {
      bPlay.textContent = '暂停';
      st.timer = setInterval(function () {
        if (st.at >= steps.length - 1) { stop(); return; }
        fwd();
      }, 620);
    }
    function neighbors(si, t) {
      var s = SENTS[si], r = [];
      for (var d = -st.win; d <= st.win; d++) {
        if (d === 0) continue;
        var t2 = t + d;
        if (t2 >= 0 && t2 < s.length) r.push(s[t2]);
      }
      return r;
    }
    function fwd() {
      if (st.at >= steps.length - 1) return;
      st.at++;
      var cur = steps[st.at], ci = wi[SENTS[cur[0]][cur[1]]];
      st.last = [];
      neighbors(cur[0], cur[1]).forEach(function (w2) {
        var oi = wi[w2];
        st.X[ci][oi] += 1;
        st.last.push([ci, oi]);
      });
      draw();
    }
    function back() {
      if (st.at < 0) return;
      var cur = steps[st.at], ci = wi[SENTS[cur[0]][cur[1]]];
      neighbors(cur[0], cur[1]).forEach(function (w2) { st.X[ci][wi[w2]] -= 1; });
      st.at--;
      st.last = [];
      draw();
    }
    function reset() { stop(); st.at = -1; st.X = C.zeros2(V, V); st.last = []; draw(); }

    bPrev.addEventListener('click', function () { stop(); back(); });
    bNext.addEventListener('click', function () { stop(); fwd(); });
    bPlay.addEventListener('click', function () { if (st.timer) stop(); else play(); });
    bReset.addEventListener('click', reset);

    function card(l, v, cls) {
      return el('div', { class: 'stat' },
        el('span', { class: 'sl', text: l }),
        el('span', { class: 'sv ' + (cls || ''), text: v }));
    }

    function draw() {
      var cur = st.at >= 0 ? steps[st.at] : null;
      // 句子：中心词涂实色，窗口内邻居描边，扫过的淡化
      clear(lineBox);
      SENTS.forEach(function (s, si) {
        var row = el('div', { class: 'wd-line' });
        s.forEach(function (w, t) {
          var cls = 'wd';
          if (cur) {
            if (si < cur[0] || (si === cur[0] && t < cur[1])) cls += ' done';
            if (si === cur[0] && t === cur[1]) cls += ' center';
            else if (si === cur[0] && Math.abs(t - cur[1]) <= st.win) cls += ' ctx';
          }
          row.appendChild(el('span', { class: cls, text: w }));
        });
        lineBox.appendChild(row);
      });
      // 大数字
      clear(statRow);
      var nz = 0;
      for (var i = 0; i < V; i++) for (var j = 0; j < V; j++) if (st.X[i][j] > 0) nz++;
      statRow.appendChild(card('已扫描', (st.at + 1) + ' / ' + steps.length + ' 步'));
      statRow.appendChild(card('本轮写入', st.last.length + ' 格', st.last.length ? 'ok' : ''));
      statRow.appendChild(card('矩阵非零格', nz + ' / ' + (V * V), 'hi'));
      // 矩阵
      clear(out);
      out.appendChild(el('h5', { html: '共现矩阵（黄 = 本次刚 +1 的格子）' }));
      matrix(out, words, st.X, { hots: st.last });
      // 状态条
      if (!cur) {
        status.innerHTML = '<b>还没开始。</b>窗口半长 m = ' + st.win + '，也就是中心词左右各看 ' + st.win +
          ' 个词。点「下一步」开始扫，或点「自动播放」让它自己走完。';
      } else {
        var si = cur[0], t = cur[1], word = SENTS[si][t], nbs = neighbors(si, t);
        status.innerHTML = '<b>第 ' + (st.at + 1) + ' / ' + steps.length + ' 步</b>（第 ' + (si + 1) + ' 句）：中心词 = <span class="mono">' + word + '</span>' +
          (nbs.length
            ? '，窗口里的邻居 = <span class="mono">' + nbs.join('、') + '</span> → ' +
              nbs.map(function (x) { return '<span class="mono">X[' + word + '][' + x + '] += 1</span>'; }).join('、')
            : '（句首或句尾，窗口里没有词，这一步不写任何格子）');
        if (st.at === steps.length - 1) {
          status.innerHTML += '<br><b>扫完了。</b>注意 X 是<b>对称</b>的（X[i][j] = X[j][i]）—— 这不是特意写的，是窗口口径的' +
            '<b>必然结果</b>：I 在 like 左边时数了一次，轮到 like 做中心词时又把 I 数了一次。';
        }
      }
      bPrev.disabled = st.at < 0;
      bNext.disabled = st.at >= steps.length - 1;
    }
    draw();
  };

  /* ============================================================
   * ⑨ softmax 三步：分母为什么要遍历整个词表
   * ============================================================ */
  reg.softmaxdemo = function (root) {
    var p = panel('softmax 三步：分母为什么要遍历整个词表',
      '拖每个上下文词的原始分数 s，看它怎么经过 ①取指数 ②归一化 变成概率。<b>第 ② 步的分母要算遍全表</b> —— 这就是"贵"的根源。',
      '<code>04_原理深潜.md</code> §2.2');
    root.appendChild(p.wrap);
    var src = p.body.querySelector('.viz-src');
    function add(n) { p.body.insertBefore(n, src); return n; }

    var CTX = ['like', 'enjoy', 'deep', 'NLP', 'flying'];
    var st = { s: [2.0, 1.0, 0.5, 0.0, -0.5] };

    var ctlBox = add(el('div', { class: 'viz-ctl' }));
    var btnBar = add(el('div', { class: 'step-bar' }));
    var statRow = add(el('div', { class: 'stat-row' }));
    var out = add(el('div', { class: 'viz-out' }));
    var status = add(el('div', { class: 'viz-status' }));

    var sliders = CTX.map(function (w, i) {
      var sl = slider(-3, 3, 0.1, st.s[i], function (v) { st.s[i] = v; draw(); });
      ctlBox.appendChild(ctl('s(' + w + ')', sl.node, sl.val));
      return sl;
    });

    [['like 遥遥领先', [3, 0.4, 0.3, 0.2, 0.1]],
     ['全部相等 → 均匀分布', [1, 1, 1, 1, 1]],
     ['全部为 0', [0, 0, 0, 0, 0]]].forEach(function (pr) {
      var b = el('button', { class: 'btn', text: pr[0] });
      b.addEventListener('click', function () {
        st.s = pr[1].slice();
        sliders.forEach(function (sl, i) {
          sl.node.value = String(st.s[i]);
          sl.node.dispatchEvent(new Event('input', { bubbles: true }));
        });
        draw();
      });
      btnBar.appendChild(b);
    });

    function card(l, v, cls) {
      return el('div', { class: 'stat' },
        el('span', { class: 'sl', text: l }),
        el('span', { class: 'sv ' + (cls || ''), text: v }));
    }

    function draw() {
      var ex = st.s.map(function (x) { return Math.exp(x); });
      var Z = ex.reduce(function (a, b) { return a + b; }, 0);
      var pr = ex.map(function (x) { return x / Z; });
      var H = 0;
      pr.forEach(function (q) { if (q > 0) H -= q * Math.log(q); });

      clear(out);
      out.appendChild(el('h5', { html: '① 原始分数 s = u<sub>o</sub><sup>T</sup>v<sub>c</sub> —— 可以是负的' }));
      out.appendChild(el('div', { class: 'tbl-wrap' }, el('table', { class: 'md' },
        el('tr', {}, el('th', { text: '上下文词 o' }), el('th', { text: '分数 s' })),
        CTX.map(function (w, i) {
          return el('tr', {},
            el('td', { html: '<code>' + w + '</code>' }),
            el('td', { class: 'num', text: st.s[i].toFixed(1) }));
        })
      )));

      out.appendChild(el('h5', { html: '② exp(s) —— 把任何实数变成正数，并且把差距放大' }));
      var b2 = el('div', { class: 'bars' });
      out.appendChild(b2);
      bars(b2, CTX.map(function (w, i) { return { label: w, value: ex[i], text: ex[i].toFixed(3) }; }));

      out.appendChild(el('h5', { html: '③ p = exp(s) / Σexp(s) —— 现在才是合法概率' }));
      var b3 = el('div', { class: 'bars' });
      out.appendChild(b3);
      bars(b3, CTX.map(function (w, i) { return { label: w, value: pr[i] * 100, text: (pr[i] * 100).toFixed(2) + '%' }; }));

      clear(statRow);
      statRow.appendChild(card('分母 Σexp(s)', Z.toFixed(4), 'hi'));
      statRow.appendChild(card('最大概率', (Math.max.apply(null, pr) * 100).toFixed(2) + '%', 'ok'));
      statRow.appendChild(card('分布熵 H（nats）', H.toFixed(4)));
      statRow.appendChild(card('Σp（应为 1）', pr.reduce(function (a, b) { return a + b; }, 0).toFixed(6)));

      status.innerHTML = Z > 1e6
        ? '<b>分母已经到 ' + Z.toExponential(2) + ' 了。</b>exp 把分数差距<b>指数级</b>放大 —— 两个词差 20 分，概率就差 e²⁰ ≈ ' +
          Math.round(Math.exp(20)).toLocaleString() + ' 倍。这就是训练里要"先减去最大值"防溢出的原因。'
        : '<b>看着这 5 个词，想象词表是 50 万个。</b>每更新一次，②③ 两步都要对<b>整个词表</b>算一遍 exp 再求和：' +
          'V = 50 万就是 50 万次 exp + 50 万次加法。<b>这就是三类问题里第 ① 类「前向算得慢」的根源</b>，' +
          '也是负采样和层次 softmax 要治的病。';
    }
    draw();
  };

  /* ============================================================
   * ⑩ 负采样抽样模拟：真的抽几批负样本出来看看
   * ============================================================ */
  reg.negsamp = function (root) {
    var p = panel('真的抽几批负样本出来看看',
      '按 U(w)<sup>α</sup> 抽样（真实 IMDB top-2000 词频）。反复抽，看 <code>the</code> 被抽到多少次，以及 α=0.75 把它压到了多少。',
      '<code>logs/k01_huffman_neg_out.txt</code> 实验 A');
    root.appendChild(p.wrap);
    var src = p.body.querySelector('.viz-src');
    function add(n) { p.body.insertBefore(n, src); return n; }

    var F = KB.freq.imdb2000;
    var THE = F.words.indexOf('the');
    var SEED = 20261006;
    var st = { alpha: 0.75, K: 5, rng: C.mulberry32(SEED), batches: 0, hits: 0, draws: 0, last: [] };

    var ctlBox = add(el('div', { class: 'viz-ctl' }));
    var statRow = add(el('div', { class: 'stat-row' }));
    var chipRow = add(el('div', { class: 'chip-row' }));
    var btnBar = add(el('div', { class: 'step-bar' }));
    var out = add(el('div', { class: 'viz-out' }));
    var status = add(el('div', { class: 'viz-status' }));

    var slA = slider(0, 1, 0.05, 0.75, function (v) { st.alpha = v; reseed(); });
    ctlBox.appendChild(ctl('α（词频的次方）', slA.node, slA.val));
    var slK = slider(1, 8, 1, 5, function (v) { st.K = v; reseed(); });
    ctlBox.appendChild(ctl('K（每步抽几个负样本）', slK.node, slK.val));

    var bOne = el('button', { class: 'btn primary', text: '抽 1 批' });
    var bMany = el('button', { class: 'btn', text: '抽 200 批' });
    var bSeed = el('button', { class: 'btn', text: '同一随机种子重来' });
    [bOne, bMany, bSeed].forEach(function (b) { btnBar.appendChild(b); });

    function reseed() { st.rng = C.mulberry32(SEED); st.batches = 0; st.hits = 0; st.draws = 0; st.last = []; draw(); }
    function dist() { return C.noiseDistribution(F.counts, st.alpha); }
    function pick(P) {
      var r = st.rng(), c = 0;
      for (var i = 0; i < P.length; i++) { c += P[i]; if (r <= c) return i; }
      return P.length - 1;
    }
    function oneBatch() {
      var P = dist().p, picks = [];
      for (var k = 0; k < st.K; k++) {
        var i = pick(P);
        picks.push(i);
        if (i === THE) st.hits++;
      }
      st.batches++;
      st.draws += st.K;
      st.last = picks;
    }
    bOne.addEventListener('click', function () { oneBatch(); draw(); });
    bMany.addEventListener('click', function () { for (var i = 0; i < 200; i++) oneBatch(); draw(); });
    bSeed.addEventListener('click', reseed);

    function card(l, v, cls) {
      return el('div', { class: 'stat' },
        el('span', { class: 'sl', text: l }),
        el('span', { class: 'sv ' + (cls || ''), text: v }));
    }

    function draw() {
      var d = dist(), theo = d.p[THE];
      // 本批抽到的词
      clear(chipRow);
      if (!st.last.length) {
        chipRow.appendChild(el('span', { class: 'mini', text: '还没抽。点「抽 1 批」。' }));
      } else {
        st.last.forEach(function (i) {
          chipRow.appendChild(el('span', { class: 'chip' + (i === THE ? ' hit' : '') },
            el('code', { text: F.words[i] }),
            el('span', { class: 'cfreq', text: F.counts[i] >= 1000 ? (F.counts[i] / 1000).toFixed(0) + 'k' : String(F.counts[i]) })));
        });
      }
      // 大数字
      clear(statRow);
      var gotThe = st.last.filter(function (i) { return i === THE; }).length;
      statRow.appendChild(card('本批抽到 the', gotThe + ' / ' + st.K, gotThe ? 'warn' : ''));
      statRow.appendChild(card('累计批次', String(st.batches)));
      statRow.appendChild(card('实测抽到 the 占比', st.draws ? (st.hits / st.draws * 100).toFixed(3) + '%' : '—', 'ok'));
      statRow.appendChild(card('理论占比', (theo * 100).toFixed(3) + '%', 'hi'));
      // 分布条
      clear(out);
      out.appendChild(el('h5', { html: 'α = ' + st.alpha.toFixed(2) + ' 时的抽取分布（前 8 个词）' }));
      var bx = el('div', { class: 'bars' });
      out.appendChild(bx);
      bars(bx, [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) {
        return { label: F.words[i], value: d.p[i] * 100, text: (d.p[i] * 100).toFixed(3) + '%', cls: i === THE ? 'warn' : '' };
      }));
      out.appendChild(el('p', { class: 'mini', html: '熵 H = <b>' + d.entropy.toFixed(4) + '</b> nats。α 越小分布越平（熵越大），低频词越有机会被抽到当负样本。' }));

      status.innerHTML = '<b>抽了 ' + st.batches + ' 批、共 ' + st.draws + ' 个负样本。</b>' +
        (st.draws >= 200
          ? '实测抽到 <span class="mono">the</span> 的占比是 <b>' + (st.hits / st.draws * 100).toFixed(3) + '%</b>，' +
            '理论值 <b>' + (theo * 100).toFixed(3) + '%</b> —— 抽得越多越贴近，这就是"按分布采样"的含义。' +
            '对照一下：纯词频（α=1）时 the 是 6.880%，<b>开了 3/4 次方之后被压到 ' + (theo * 100).toFixed(3) + '%</b>。'
          : '点「抽 200 批」让实测占比靠近理论值。注意理论占比那一栏会随 α 实时变 —— 它才是"应该抽到多少次"。');
    }
    draw();
  };

  /* ============================================================
   * ⑪ 余弦相似度：为什么要把长度除掉
   * ============================================================ */
  reg.cosdemo = function (root) {
    var p = panel('余弦相似度：为什么要先把长度除掉',
      '拖两个向量的方向和长短，看点积怎么跟着长度变，而余弦<b>一点不变</b>。',
      '<code>02_它到底是什么.md</code> §2.3');
    root.appendChild(p.wrap);
    var src = p.body.querySelector('.viz-src');
    function add(n) { p.body.insertBefore(n, src); return n; }

    var st = { tu: 35, ru: 4, tv: 100, rv: 2 };
    var ctlBox = add(el('div', { class: 'viz-ctl' }));
    var btnBar = add(el('div', { class: 'step-bar' }));
    var statRow = add(el('div', { class: 'stat-row' }));
    var svgHost = add(el('div', {}));
    var status = add(el('div', { class: 'viz-status' }));

    var s1 = slider(0, 180, 1, st.tu, function (v) { st.tu = v; draw(); });
    ctlBox.appendChild(ctl('u 的方向（度）', s1.node, s1.val));
    var s2 = slider(1, 5, 0.5, st.ru, function (v) { st.ru = v; draw(); });
    ctlBox.appendChild(ctl('u 的长度 |u|', s2.node, s2.val));
    var s3 = slider(0, 180, 1, st.tv, function (v) { st.tv = v; draw(); });
    ctlBox.appendChild(ctl('v 的方向（度）', s3.node, s3.val));
    var s4 = slider(1, 5, 0.5, st.rv, function (v) { st.rv = v; draw(); });
    ctlBox.appendChild(ctl('v 的长度 |v|', s4.node, s4.val));

    var SL = [s1, s2, s3, s4];
    [['同向（夹角 0°）', 30, 4, 30, 2],
     ['正交（夹角 90°）', 0, 4, 90, 4],
     ['反向（夹角 180°）', 0, 3, 180, 3],
     ['|u| 拉长 3 倍、方向不变', 45, 5, 120, 1.5]].forEach(function (pr) {
      var b = el('button', { class: 'btn', text: pr[0] });
      b.addEventListener('click', function () {
        var vals = [pr[1], pr[2], pr[3], pr[4]];
        SL.forEach(function (s, i) {
          s.node.value = String(vals[i]);
          s.val.textContent = String(vals[i]);
        });
        st.tu = vals[0]; st.ru = vals[1]; st.tv = vals[2]; st.rv = vals[3];
        draw();
      });
      btnBar.appendChild(b);
    });

    var NS = 'http://www.w3.org/2000/svg';
    function mk(tag, attrs, txt) {
      var n = document.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      if (txt != null) n.textContent = txt;
      return n;
    }
    function card(l, v, cls) {
      return el('div', { class: 'stat' },
        el('span', { class: 'sl', text: l }),
        el('span', { class: 'sv ' + (cls || ''), text: v }));
    }

    function draw() {
      var u = [Math.cos(st.tu * Math.PI / 180) * st.ru, Math.sin(st.tu * Math.PI / 180) * st.ru];
      var v = [Math.cos(st.tv * Math.PI / 180) * st.rv, Math.sin(st.tv * Math.PI / 180) * st.rv];
      var dp = C.dot(u, v), nu = C.norm(u), nv = C.norm(v), cs = C.cosine(u, v);

      var W = 520, H = 300, ox = 76, oy = 246, sc = 40;
      clear(svgHost);
      var svg = mk('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'vz-svg' });
      svg.appendChild(mk('line', { x1: 18, y1: oy, x2: W - 12, y2: oy, class: 'ax' }));
      svg.appendChild(mk('line', { x1: ox, y1: 14, x2: ox, y2: oy + 12, class: 'ax' }));
      svg.appendChild(mk('circle', { cx: ox, cy: oy, r: sc, fill: 'none', stroke: 'var(--line-strong)', 'stroke-dasharray': '3 4' }));
      svg.appendChild(mk('text', { x: W - 54, y: oy + 17, class: 'axl' }, '维度 1'));
      svg.appendChild(mk('text', { x: ox + 9, y: 24, class: 'axl' }, '维度 2'));

      // 夹角弧（用折线近似，省得算 SVG 的 sweep 方向）
      var a1 = Math.min(st.tu, st.tv), a2 = Math.max(st.tu, st.tv);
      if (a2 - a1 > 0.6) {
        var pts = [];
        for (var k = 0; k <= 24; k++) {
          var a = (a1 + (a2 - a1) * k / 24) * Math.PI / 180;
          pts.push((ox + Math.cos(a) * 44).toFixed(1) + ',' + (oy - Math.sin(a) * 44).toFixed(1));
        }
        svg.appendChild(mk('polyline', { points: pts.join(' '), class: 'arc' }));
        svg.appendChild(mk('text', {
          x: ox + Math.cos((a1 + a2) / 2 * Math.PI / 180) * 62,
          y: oy - Math.sin((a1 + a2) / 2 * Math.PI / 180) * 62 + 4,
          class: 'lbl'
        }, (a2 - a1).toFixed(0) + '°'));
      }

      function arrow(vec, cls, label) {
        var x = ox + vec[0] * sc, y = oy - vec[1] * sc;
        svg.appendChild(mk('line', { x1: ox, y1: oy, x2: x, y2: y, class: cls }));
        var ang = Math.atan2(y - oy, x - ox);
        svg.appendChild(mk('path', {
          d: 'M' + x + ',' + y +
             ' L' + (x - Math.cos(ang - 0.32) * 11) + ',' + (y - Math.sin(ang - 0.32) * 11) +
             ' L' + (x - Math.cos(ang + 0.32) * 11) + ',' + (y - Math.sin(ang + 0.32) * 11) + ' Z',
          class: cls + 'head'
        }));
        svg.appendChild(mk('text', { x: x + 9, y: y - 7, class: 'lbl' }, label));
      }
      arrow(u, 'u', 'u');
      arrow(v, 'v', 'v');
      svgHost.appendChild(svg);

      clear(statRow);
      statRow.appendChild(card('点积 u·v', dp.toFixed(4)));
      statRow.appendChild(card('|u|', nu.toFixed(4), 'hi'));
      statRow.appendChild(card('|v|', nv.toFixed(4), 'hi'));
      statRow.appendChild(card('余弦 cos(u,v)', cs.toFixed(4), 'ok'));

      var dA = Math.abs(st.tv - st.tu);
      var msg;
      if (dA < 1) {
        msg = '两个向量<b>同向</b>：cos = ' + cs.toFixed(4) + ' ≈ 1。不管 |u|、|v| 是多少，只要方向一样，余弦就是 1。';
      } else if (Math.abs(dA - 90) < 1) {
        msg = '两个向量<b>正交</b>：cos = ' + cs.toFixed(4) + ' ≈ 0，点积也是 0。one-hot 向量两两之间全是这种关系 —— 所以它"算不出相似度"。';
      } else if (dA > 179) {
        msg = '两个向量<b>反向</b>：cos = ' + cs.toFixed(4) + ' ≈ −1。夹角越接近 180°，余弦越接近 −1，点积也越负。';
      } else {
        msg = '夹角 ' + dA.toFixed(0) + '°。现在拖动 <b>|u|</b> 的滑块：<b>点积会跟着变，余弦一动不动</b> —— ' +
          '因为余弦把两个长度都除掉了，只留下方向。这就是"用方向表示语义、不用长度"的全部理由。';
      }
      status.innerHTML = msg;
    }
    draw();
  };
})(typeof window !== 'undefined' ? window : globalThis);
