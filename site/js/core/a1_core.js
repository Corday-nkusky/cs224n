/* ============================================================
 * A1 纯算法层（浏览器 + Node 共用，零依赖）
 * ------------------------------------------------------------
 * A1 = CS224N Assignment 1「Exploring Word Vectors」的 Part 1。
 * notebook 要学生自己写四个函数，其中前两个（distinct_words、
 * compute_co_occurrence_matrix）的**精确口径**在这里重写成可断言的纯函数，
 * 并附上 notebook cell-14 里那份 M_test_ans 作为对账基准。
 *
 * 纪律：
 *   1. toy 语料逐字取自 notebook cell-11 / cell-14 的 test_corpus
 *      （两句话，带 <START>/<END>）—— 改一个字符，core.test.js 立刻红。
 *   2. 窗口口径 = "每个词轮流当中心词，给它 window 内的每个上下文 +1"。
 *      矩阵的对称性是这条口径的**自然结果**，不是事后再补 M[j][i]。
 *   3. 本文件不做任何"大约"：所有数字要么能从这里复算，要么来自 notebook。
 * ============================================================ */
(function (global) {
  'use strict';

  var START_TOKEN = '<START>';
  var END_TOKEN = '<END>';

  /* ---------------- toy 语料（notebook cell-11/14 原文） ---------------- */

  var TOY_CORPUS = [
    (START_TOKEN + " All that glitters isn't gold " + END_TOKEN).split(' '),
    (START_TOKEN + " All's well that ends well " + END_TOKEN).split(' ')
  ];

  /* notebook 里的正确答案（cell-11 的 ans_test_corpus_words，sorted 后）
     —— 注意 '<END>' 排在最前：'<' 的编码 (60) 比任何字母都小。 */
  var ANS_WORDS = ['<END>', '<START>', 'All', "All's", 'ends', 'glitters', 'gold', "isn't", 'that', 'well'];

  /* notebook cell-14 的 M_test_ans（window_size=1）。这是对账基准，
     不参与计算 —— 计算由 cooccurrence() 现做，两者必须逐位相等。 */
  var M_TEST_ANS = [
    [0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    [0, 0, 1, 1, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
    [0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 1, 1, 0],
    [1, 0, 0, 0, 0, 0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 1, 0, 1, 1, 0, 0, 0, 1],
    [1, 0, 0, 1, 1, 0, 0, 0, 1, 0]
  ];

  /* ---------------- 基础 ---------------- */

  function zeros2(r, c) {
    var m = new Array(r);
    for (var i = 0; i < r; i++) {
      var row = new Array(c);
      for (var j = 0; j < c; j++) row[j] = 0;
      m[i] = row;
    }
    return m;
  }

  function sum2(M) {
    var s = 0;
    for (var i = 0; i < M.length; i++) for (var j = 0; j < M[i].length; j++) s += M[i][j];
    return s;
  }

  function maxAsymmetry(M) {
    var mx = 0;
    for (var i = 0; i < M.length; i++) {
      for (var j = 0; j < M[i].length; j++) {
        var d = Math.abs(M[i][j] - M[j][i]);
        if (d > mx) mx = d;
      }
    }
    return mx;
  }

  function nonzero(M) {
    var n = 0;
    for (var i = 0; i < M.length; i++) for (var j = 0; j < M[i].length; j++) if (M[i][j] !== 0) n++;
    return n;
  }

  /* ---------------- Q1.1 distinct_words ---------------- */

  /**
   * notebook 口径：把所有文档里的词收进一个集合，再 sorted()。
   * 返回 {words, n}。注意 sort() 用的是**编码序**，不是"字典序"的直觉版：
   *   '<' (60) < '\'' (39)? 不 —— 39 < 60，但 'All' 和 "All's" 的前三个字符相同，
   *   短的排前面，所以仍是 All < All's。真正反直觉的是 '<END>' 排在 'All' 前面。
   */
  function distinctWords(corpus) {
    var seen = {}, out = [];
    for (var i = 0; i < corpus.length; i++) {
      var doc = corpus[i];
      for (var j = 0; j < doc.length; j++) {
        var w = doc[j];
        if (!seen[w]) { seen[w] = 1; out.push(w); }
      }
    }
    out.sort();
    return { words: out, n: out.length };
  }

  /** 反例用：按"首次出现的顺序"排（不 sort）。与 sorted 版对比就是 Q1.1 的坑。 */
  function firstSeenOrder(corpus) {
    var seen = {}, out = [];
    for (var i = 0; i < corpus.length; i++) {
      var doc = corpus[i];
      for (var j = 0; j < doc.length; j++) {
        var w = doc[j];
        if (!seen[w]) { seen[w] = 1; out.push(w); }
      }
    }
    return out;
  }

  /* ---------------- Q1.2 compute_co_occurrence_matrix ---------------- */

  /**
   * 每个词轮流当中心词；给它 window 内（左右各 window 个）的每个词 +1。
   * 句首/句尾窗口不完整 —— 靠 max(0, c-win) / min(len, c+win+1) 截断。
   * 纯计数，**没有任何距离加权**（A1 不是 1/d 加权那一路）。
   *
   * opts.window  窗口半径，默认 4（notebook 默认值）
   * opts.order   'sorted'（默认，与 distinct_words 一致）| 'firstSeen'（反例）
   *
   * 返回 {words, word2ind, X, steps}
   *   steps = 按「文档 → 中心词位置 → 上下文位置」顺序的全部 +1 事件，
   *           形如 {d, c, j, i, k, cell:[i,k]}，供交互逐步回放。
   */
  function cooccurrence(corpus, opts) {
    opts = opts || {};
    var win = opts.window == null ? 4 : opts.window;
    var order = opts.order || 'sorted';

    var words = order === 'firstSeen' ? firstSeenOrder(corpus) : distinctWords(corpus).words;
    var n = words.length;
    var word2ind = {};
    for (var t = 0; t < n; t++) word2ind[words[t]] = t;

    var X = zeros2(n, n);
    var steps = [];
    for (var d = 0; d < corpus.length; d++) {
      var doc = corpus[d];
      for (var c = 0; c < doc.length; c++) {
        var lo = Math.max(0, c - win);
        var hi = Math.min(doc.length, c + win + 1);   // 左闭右开
        for (var j = lo; j < hi; j++) {
          if (j === c) continue;
          var i = word2ind[doc[c]];
          var k = word2ind[doc[j]];
          X[i][k] += 1;
          steps.push({ d: d, c: c, j: j, i: i, k: k, cell: [i, k] });
        }
      }
    }

    return {
      words: words, word2ind: word2ind, X: X, steps: steps, window: win, order: order,
      n: n,
      total: n * n,
      nonzero: nonzero(X),
      sum: sum2(X),
      maxAsymmetry: maxAsymmetry(X)
    };
  }

  /** 把 steps 的前 t 步累加成一个矩阵（交互式步进用；t = steps.length 时等于完整 X） */
  function replay(corpus, opts, t) {
    var c = cooccurrence(corpus, opts);
    var M = zeros2(c.n, c.n);
    for (var i = 0; i < Math.min(t, c.steps.length); i++) {
      var s = c.steps[i];
      M[s.i][s.k] += 1;
    }
    c.partial = M;
    return c;
  }

  /** 某个词在某一处的窗口里能看到谁（交互里"点一个词"用） */
  function windowOf(doc, c, win) {
    var lo = Math.max(0, c - win);
    var hi = Math.min(doc.length, c + win + 1);
    var out = [];
    for (var j = lo; j < hi; j++) if (j !== c) out.push(j);
    return out;
  }

  /* ---------------- 与 M_test_ans 对账 ---------------- */

  /** 现算的 window=1 矩阵 vs notebook cell-14 的 M_test_ans，逐位比 */
  function checkAgainstNotebook() {
    var c = cooccurrence(TOY_CORPUS, { window: 1 });
    var wordsOk = c.words.join('|') === ANS_WORDS.join('|');
    var allOk = wordsOk && c.n === M_TEST_ANS.length;
    var firstBad = null;
    if (allOk) {
      for (var i = 0; i < M_TEST_ANS.length && allOk; i++) {
        for (var j = 0; j < M_TEST_ANS[i].length; j++) {
          if (c.X[i][j] !== M_TEST_ANS[i][j]) {
            allOk = false;
            firstBad = { i: i, j: j, got: c.X[i][j], want: M_TEST_ANS[i][j], row: c.words[i], col: c.words[j] };
            break;
          }
        }
      }
    }
    return { ok: allOk, wordsOk: wordsOk, firstBad: firstBad, computed: c };
  }

  function diagSum(M) {
    var s = 0;
    for (var i = 0; i < M.length; i++) s += M[i][i];
    return s;
  }

  /** 两个矩阵的第一个不同格（按行优先扫） */
  function firstDiff(got, want, words) {
    for (var i = 0; i < want.length; i++) {
      for (var j = 0; j < want[i].length; j++) {
        if (got[i][j] !== want[i][j]) {
          return { i: i, j: j, got: got[i][j], want: want[i][j], row: words[i], col: words[j] };
        }
      }
    }
    return null;
  }

  /** 两个矩阵的"不同格数" —— 对"词表没排序"这种整体错位，比 firstDiff 有说服力 */
  function diffCount(got, want) {
    var n = 0;
    for (var i = 0; i < want.length; i++) {
      for (var j = 0; j < want[i].length; j++) if (got[i][j] !== want[i][j]) n++;
    }
    return n;
  }

  /** 两个矩阵的**全部**不同格，[[i, j], ...]。
   *  交互要把它们全标出来 —— 因为好几个错法的教学点恰恰是"错的格很多"：
   *  忘了跳过自己 → 整条对角线变红；词表没排序 → 36/100 格变红，可元素和与对称性全对。
   *  只标"第一个不同格"的话，这两个反差都看不见。 */
  function diffCells(got, want) {
    var out = [];
    for (var i = 0; i < want.length; i++) {
      for (var j = 0; j < want[i].length; j++) if (got[i][j] !== want[i][j]) out.push([i, j]);
    }
    return out;
  }

  /* ---------------- 常见错法（交互用；每一种都可复算） ----------------
   * 用途：作业里 sanity check 一红，学生只知道"错了"，不知道错在哪一格。
   * 这里把四种最常见的错法各自跑一遍，直接指出"第一个不同的格子"。
   * 全部是真实实现差异，不是编出来的。
   * ------------------------------------------------------------ */
  function variants(corpus, win) {
    var base = cooccurrence(corpus, { window: win });
    var words = base.words, w2i = base.word2ind, n = base.n;
    var out = [];

    function push(key, name, why, fill) {
      var X = zeros2(n, n);
      for (var d = 0; d < corpus.length; d++) {
        var doc = corpus[d];
        for (var c = 0; c < doc.length; c++) fill(X, doc, c, d);
      }
      out.push({
        key: key, name: name, why: why, X: X,
        asym: maxAsymmetry(X), diag: diagSum(X), sum: sum2(X),
        diff: firstDiff(X, base.X, words), diffCount: diffCount(X, base.X),
        diffCells: diffCells(X, base.X),
        words: words
      });
    }

    // ① 只数右边的词（"每个词只看它后面 window 个"）→ 上三角，不对称
    push('rightOnly', '只数右边', '窗口只往右看，没有"每个词轮流当中心词" —— 于是 M[i][j] 有、M[j][i] 是 0，矩阵不再对称。',
      function (X, doc, c) {
        var hi = Math.min(doc.length, c + win + 1);
        for (var j = c + 1; j < hi; j++) X[w2i[doc[c]]][w2i[doc[j]]] += 1;
      });

    // ② 忘了跳过自己 → 对角线非 0
    push('withSelf', '忘了跳过自己', '内层循环漏了 if j != c —— 每个词于是跟自己"共现"了一次，对角线从全 0 变成非 0（同一个词出现几次就加几次）。',
      function (X, doc, c) {
        var lo = Math.max(0, c - win), hi = Math.min(doc.length, c + win + 1);
        for (var j = lo; j < hi; j++) X[w2i[doc[c]]][w2i[doc[j]]] += 1;
      });

    // ③ 右边界少一格（range(c-win, c+win) 忘了 +1）→ 最远的那个上下文丢了
    push('shortRight', '右边界少一格', '写成了 range(c-win, c+win) —— Python 的 range 右开，等价于 j < c+win，最右边那一个词永远数不到（左边反而正常）。',
      function (X, doc, c) {
        var lo = Math.max(0, c - win), hi = Math.min(doc.length, c + win);
        for (var j = lo; j < hi; j++) if (j !== c) X[w2i[doc[c]]][w2i[doc[j]]] += 1;
      });

    // ④ 按 1/d 加权（这是 K01 的口径，A1 不是）→ 数值变成小数
    //    注意：window=1 时所有距离都等于 1，1/d ≡ 1，这个错法**退化成正确实现** ——
    //    于是它能通过全部 sanity check（那些都用 window=1），只在 Q1.5（window=4）才露馅。
    //    这是 A1 里最阴的一个坑，所以这里保留它并让交互把这件事说出来。
    push('weighted', '按 1/d 加权', '把 K01 里那套距离加权搬过来了 —— A1 明说了是"纯计数、每共现一次 +1"。⚠️ 窗口 = 1 时所有距离都等于 1，加权和不加权**完全一样**，所以这个错法能通过全部 sanity check，只在 Q1.5（默认窗口 4）才暴露。',
      function (X, doc, c) {
        var lo = Math.max(0, c - win), hi = Math.min(doc.length, c + win + 1);
        for (var j = lo; j < hi; j++) { if (j !== c) X[w2i[doc[c]]][w2i[doc[j]]] += 1 / Math.abs(j - c); }
      });

    // ⑤ 词表顺序用"首次出现"而不是 sorted → 每一行每一列对应的人都换了
    (function () {
      var bad = cooccurrence(corpus, { window: win, order: 'firstSeen' });
      out.push({
        key: 'badOrder', name: '词表没排序', why: 'distinct_words 忘了 sorted()，矩阵行列都按"首次出现顺序"排。注意：它**仍然对称、元素和也一样** —— 所以这个错最难发现，数字看着全对，只是每个数字都对应到了错的词。',
        X: bad.X, asym: bad.maxAsymmetry, diag: diagSum(bad.X), sum: bad.sum,
        diff: firstDiff(bad.X, base.X, words), diffCount: diffCount(bad.X, base.X),
        diffCells: diffCells(bad.X, base.X),
        words: bad.words, permuted: words.map(function (w) { return bad.word2ind[w]; })
      });
    })();

    // 正确实现也放进列表，好让交互在一个控件里并排切换
    out.unshift({
      key: 'correct', name: '正确实现', why: '每个词轮流当中心词，给它 window 内的每个上下文 +1；纯计数，不加权；行列都按 sorted 后的词表。',
      X: base.X, asym: base.maxAsymmetry, diag: diagSum(base.X), sum: base.sum,
      diff: null, diffCount: 0, diffCells: [], words: words
    });

    return { base: base, variants: out };
  }

  var API = {
    START_TOKEN: START_TOKEN,
    END_TOKEN: END_TOKEN,
    TOY_CORPUS: TOY_CORPUS,
    ANS_WORDS: ANS_WORDS,
    M_TEST_ANS: M_TEST_ANS,
    zeros2: zeros2,
    sum2: sum2,
    maxAsymmetry: maxAsymmetry,
    nonzero: nonzero,
    distinctWords: distinctWords,
    firstSeenOrder: firstSeenOrder,
    cooccurrence: cooccurrence,
    replay: replay,
    windowOf: windowOf,
    checkAgainstNotebook: checkAgainstNotebook,
    variants: variants,
    diagSum: diagSum,
    firstDiff: firstDiff,
    diffCount: diffCount,
    diffCells: diffCells
  };

  // 算法层挂在自己的命名空间下（KB.core.a1），不往 window 上抛全局单例 ——
  // 单例会被后加载的那门课静默覆盖。与 core/k01_core.js 同一条纪律。
  global.KB = global.KB || {};
  global.KB.core = global.KB.core || {};
  global.KB.core.a1 = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
