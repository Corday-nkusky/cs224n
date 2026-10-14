/* ============================================================
 * K01 纯算法层（浏览器 + Node 共用，零依赖）
 * ------------------------------------------------------------
 * 纪律：本文件里每个函数都必须能在 tests/core.test.js 里用
 *       讲义/日志中的真实数字断言。不做任何"大约"。
 * 约定：所有矩阵用「行数组的数组」表示，向量用普通数组。
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 基础线性代数 ---------- */

  function dot(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  function norm(a) {
    return Math.sqrt(dot(a, a));
  }

  function cosine(a, b) {
    var d = norm(a) * norm(b);
    if (d === 0) return 0;
    return dot(a, b) / d;
  }

  function zeros(n) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = 0;
    return a;
  }

  function zeros2(r, c) {
    var m = new Array(r);
    for (var i = 0; i < r; i++) m[i] = zeros(c);
    return m;
  }

  function transpose(X) {
    var r = X.length, c = X[0].length;
    var T = zeros2(c, r);
    for (var i = 0; i < r; i++) for (var j = 0; j < c; j++) T[j][i] = X[i][j];
    return T;
  }

  /* ---------- 激活 / 归一化 ---------- */

  function sigmoid(x) {
    // 数值稳定写法：x 很负时 exp(-x) 会溢出
    if (x >= 0) return 1 / (1 + Math.exp(-x));
    var e = Math.exp(x);
    return e / (1 + e);
  }

  /** 稳定 softmax：先减去最大值，避免 exp 溢出（05 §3 坑 #3） */
  function softmax(scores) {
    var m = -Infinity, i;
    for (i = 0; i < scores.length; i++) if (scores[i] > m) m = scores[i];
    var out = zeros(scores.length), s = 0;
    for (i = 0; i < scores.length; i++) {
      out[i] = Math.exp(scores[i] - m);
      s += out[i];
    }
    for (i = 0; i < out.length; i++) out[i] /= s;
    return out;
  }

  /* ---------- 共现矩阵（02 §5.1 / 03 §3） ---------- */

  /**
   * 窗口共现矩阵。
   * @param {string[][]} corpus 每句一个词数组
   * @param {{window:number}} opts
   * 口径与 code/k01_demo.py 一致：从左到右走每个词，把它左右各 window 个词计数 +1，
   * 只记「中心词 → 上下文词」这一个方向（不手动双向补写）。
   * 对称性 X = Xᵀ 是窗口口径下的**必然结果**，由 maxAsymmetry 实测验证，
   * 不是我们塞进去的性质 —— 见 03 §3。
   */
  function cooccurrence(corpus, opts) {
    opts = opts || {};
    var w = opts.window == null ? 1 : opts.window;

    var vocab = [], seen = Object.create(null);
    for (var s = 0; s < corpus.length; s++) {
      for (var k = 0; k < corpus[s].length; k++) {
        var t = corpus[s][k];
        if (!(t in seen)) { seen[t] = vocab.length; vocab.push(t); }
      }
    }
    var n = vocab.length, X = zeros2(n, n);

    for (var si = 0; si < corpus.length; si++) {
      var sent = corpus[si];
      for (var t1 = 0; t1 < sent.length; t1++) {
        var a = seen[sent[t1]];
        for (var d = -w; d <= w; d++) {
          if (d === 0) continue;
          var t2 = t1 + d;
          if (t2 < 0 || t2 >= sent.length) continue;
          X[a][seen[sent[t2]]] += 1;   // 只加一次：中心词 → 上下文词
        }
      }
    }

    var nz = 0, maxAsym = 0;
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        if (X[i][j] !== 0) nz++;
        var df = Math.abs(X[i][j] - X[j][i]);
        if (df > maxAsym) maxAsym = df;
      }
    }

    return {
      words: vocab,
      index: seen,
      X: X,
      nonzero: nz,
      total: n * n,
      nonzeroRatio: nz / (n * n),
      maxAsymmetry: maxAsym
    };
  }

  /* ---------- 二分图判定（03 §4 的 BFS 二染色） ---------- */

  function isBipartite(X) {
    var n = X.length, color = new Array(n);
    for (var i = 0; i < n; i++) color[i] = -1;
    for (var s = 0; s < n; s++) {
      if (color[s] !== -1) continue;
      color[s] = 0;
      var queue = [s];
      while (queue.length) {
        var u = queue.shift();
        for (var v = 0; v < n; v++) {
          if (u === v || X[u][v] === 0) continue;
          if (color[v] === -1) { color[v] = 1 - color[u]; queue.push(v); }
          else if (color[v] === color[u]) return { bipartite: false, groups: null };
        }
      }
    }
    var g = [[], []];
    for (var q = 0; q < n; q++) g[color[q]].push(q);
    return { bipartite: true, groups: g };
  }

  /* ---------- 对称矩阵特征分解（Jacobi 旋转） ---------- */

  /**
   * 对实对称矩阵做 Jacobi 特征分解。用来算 XᵀX 的特征值/特征向量，
   * 从而得到 SVD（σ = √λ，V 的列 = 特征向量）。
   * 返回 { values: 降序, vectors: [i][j] 第 j 个特征向量的第 i 个分量 }
   */
  function jacobiEigen(Ain, opts) {
    opts = opts || {};
    var maxSweeps = opts.maxSweeps || 200;
    var tol = opts.tol || 1e-14;
    var n = Ain.length;
    var A = zeros2(n, n), V = zeros2(n, n), i, j, k;
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) A[i][j] = Ain[i][j];
      V[i][i] = 1;
    }

    for (var sweep = 0; sweep < maxSweeps; sweep++) {
      var off = 0;
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      if (Math.sqrt(2 * off) < tol) break;

      for (var p = 0; p < n - 1; p++) {
        for (var q = p + 1; q < n; q++) {
          if (Math.abs(A[p][q]) < 1e-300) continue;
          var theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
          var t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          if (theta === 0) t = 1;
          var c = 1 / Math.sqrt(t * t + 1), sn = t * c;
          for (k = 0; k < n; k++) {
            var akp = A[k][p], akq = A[k][q];
            A[k][p] = c * akp - sn * akq;
            A[k][q] = sn * akp + c * akq;
          }
          for (k = 0; k < n; k++) {
            var apk = A[p][k], aqk = A[q][k];
            A[p][k] = c * apk - sn * aqk;
            A[q][k] = sn * apk + c * aqk;
          }
          for (k = 0; k < n; k++) {
            var vkp = V[k][p], vkq = V[k][q];
            V[k][p] = c * vkp - sn * vkq;
            V[k][q] = sn * vkp + c * vkq;
          }
        }
      }
    }

    var pairs = [];
    for (i = 0; i < n; i++) pairs.push({ value: A[i][i], vec: i });
    pairs.sort(function (a, b) { return b.value - a.value; });

    var values = [], vecs = zeros2(n, n);
    for (j = 0; j < n; j++) {
      values.push(pairs[j].value);
      for (i = 0; i < n; i++) vecs[i][j] = V[i][pairs[j].vec];
    }
    return { values: values, vectors: vecs };
  }

  /**
   * 由共现矩阵 X（n×n）算出奇异值与前 kMax 个右奇异向量。
   * 嵌入式子与讲义 03 §4 的恒等式一致：Emb = X · V[:, :k]（= U[:, :k]·Σ[:k]）
   * 符号约定：每根轴整体乘 ±1 都是合法解，这里统一取
   *          「绝对值最大的那个分量取正」，否则不同实现的符号会互相打架。
   */
  function svdEmbedding(X, kMax) {
    var n = X.length;
    var Xt = transpose(X);
    // A = XᵀX
    var A = zeros2(n, n);
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) A[i][j] = dot(Xt[i], X[j]);
    }
    var eig = jacobiEigen(A);
    var sigmas = eig.values.map(function (v) { return Math.sqrt(Math.max(v, 0)); });

    // 符号归一：每根轴按绝对值最大分量取正
    var vecs = eig.vectors;
    for (var c = 0; c < n; c++) {
      var bi = 0, bv = -1;
      for (var r = 0; r < n; r++) {
        if (Math.abs(vecs[r][c]) > bv) { bv = Math.abs(vecs[r][c]); bi = r; }
      }
      if (vecs[bi][c] < 0) for (var r2 = 0; r2 < n; r2++) vecs[r2][c] = -vecs[r2][c];
    }

    var k = Math.min(kMax == null ? n : kMax, n);
    var emb = zeros2(n, k);
    for (var w = 0; w < n; w++) {
      for (var d = 0; d < k; d++) {
        var s = 0;
        for (var m = 0; m < n; m++) s += X[w][m] * vecs[m][d];
        emb[w][d] = s;
      }
    }
    return { sigmas: sigmas, vectors: vecs, embedding: emb, k: k };
  }

  /**
   * 最优秩 k 近似的 Frobenius 误差：‖X − X_k‖_F = √(Σ_{i>k} σ_i²)
   * 与 03 §5 的表一致（k=1..7 → 3.3208 / 2.0140 / 1.6225 / 1.0996 / 0.7775 / 0 / 0）
   */
  function reconstructionError(sigmas, k) {
    var s = 0;
    for (var i = k; i < sigmas.length; i++) s += sigmas[i] * sigmas[i];
    return Math.sqrt(s);
  }

  /** 每个词实际用到了几个非零坐标（03 §4 的核心判据） */
  function nonzeroCoordCounts(emb, eps) {
    eps = eps == null ? 1e-9 : eps;
    return emb.map(function (row) {
      var c = 0;
      for (var i = 0; i < row.length; i++) if (Math.abs(row[i]) > eps) c++;
      return c;
    });
  }

  /** |cos| = 1 的词对数量（塌陷的指纹） */
  function absCosOnePairs(emb, eps) {
    eps = eps == null ? 1e-6 : eps;
    var n = emb.length, pairs = [], total = 0;
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        total++;
        if (Math.abs(Math.abs(cosine(emb[i], emb[j])) - 1) <= eps) pairs.push([i, j]);
      }
    }
    return { pairs: pairs, count: pairs.length, total: total, ratio: pairs.length / total };
  }

  /* ---------- 噪声分布（04 §4.3，IMDB 实测口径） ---------- */

  /**
   * P_n(w) ∝ U(w)^alpha 并归一化。
   * @param {number[]} counts 词频（顺序 = 词表顺序）
   * 与 code/k01_huffman_neg.py 的 exp_a 一致：分母是传入 counts 的总和。
   */
  function noiseDistribution(counts, alpha) {
    var n = counts.length, i, s = 0;
    var p = zeros(n);
    if (alpha === 0) {
      for (i = 0; i < n; i++) p[i] = 1 / n;
    } else {
      for (i = 0; i < n; i++) { p[i] = Math.pow(counts[i], alpha); s += p[i]; }
      for (i = 0; i < n; i++) p[i] /= s;
    }
    var H = 0;
    for (i = 0; i < n; i++) if (p[i] > 0) H -= p[i] * Math.log(p[i]);
    return { p: p, entropy: H };
  }

  /** unigram 分布本身 */
  function unigram(counts) {
    var s = 0;
    for (var i = 0; i < counts.length; i++) s += counts[i];
    return counts.map(function (c) { return c / s; });
  }

  /* ---------- 哈夫曼树（04 §5.2） ----------
   * 平局约定刻意复刻 code/k01_huffman_neg.py：堆元素为 (freq, tieId, node)，
   * 叶子 tieId = 词频降序里的下标，内部节点 tieId 从 V 起递增。
   * 这样 the 的路径会逐位复现日志里的 "1011"。
   */

  function MinHeap(cmp) {
    this.a = [];
    this.cmp = cmp;
  }
  MinHeap.prototype.push = function (v) {
    var a = this.a; a.push(v);
    var i = a.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (this.cmp(a[p], a[i]) <= 0) break;
      var t = a[p]; a[p] = a[i]; a[i] = t; i = p;
    }
  };
  MinHeap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };
  MinHeap.prototype.size = function () { return this.a.length; };

  /**
   * @param {number[]} counts 词频
   * @returns {{root:object, paths:Object, depths:number[]}}
   *   paths[词表下标] = 比特串（左 0 右 1）
   */
  function buildHuffman(counts) {
    var heap = new MinHeap(function (x, y) {
      return x.f - y.f || x.t - y.t;
    });
    var n = counts.length, i;
    for (i = 0; i < n; i++) heap.push({ f: counts[i], t: i, word: i, left: null, right: null });

    var nxt = n;
    while (heap.size() > 1) {
      var a = heap.pop(), b = heap.pop();
      heap.push({ f: a.f + b.f, t: nxt++, word: null, left: a, right: b });
    }
    var root = n === 1 ? heap.a[0] : heap.pop();

    // 路径：DFS，left 补 0，right 补 1
    var paths = {}, depths = zeros(n);
    var stack = [{ node: root, code: '' }];
    while (stack.length) {
      var cur = stack.pop();
      if (cur.node.word != null) {
        paths[cur.node.word] = cur.code;
        depths[cur.node.word] = cur.code.length;
        continue;
      }
      if (cur.node.right !== null) stack.push({ node: cur.node.right, code: cur.code + '1' });
      if (cur.node.left !== null) stack.push({ node: cur.node.left, code: cur.code + '0' });
    }
    return { root: root, paths: paths, depths: depths };
  }

  /** 按词频加权的平均路径长 = Σ f(w)L(w) / Σ f(w)（这才是实际期望代价） */
  function weightedPathLength(counts, depths) {
    var s = 0, tot = 0;
    for (var i = 0; i < counts.length; i++) { s += depths[i] * counts[i]; tot += counts[i]; }
    return s / tot;
  }

  /** 完全平衡二叉树：所有词深度相同 = ⌈log2 V⌉ */
  function balancedDepth(V) {
    return Math.ceil(Math.log(V) / Math.LN2 - 1e-12);
  }

  /** 随机合并树（对照，非最优）：每次随机取两个节点合并 */
  function randomMergeTree(counts, seed) {
    var rnd = mulberry32(seed == null ? 1 : seed);
    var nodes = counts.map(function (c) { return { f: c, left: null, right: null, word: null }; });
    while (nodes.length > 1) {
      var i1 = Math.floor(rnd() * nodes.length), a = nodes.splice(i1, 1)[0];
      var i2 = Math.floor(rnd() * nodes.length), b = nodes.splice(i2, 1)[0];
      nodes.push({ f: a.f + b.f, left: a, right: b, word: null });
    }
    var depths = zeros(counts.length), stack = [{ node: nodes[0], d: 0 }];
    while (stack.length) {
      var cur = stack.pop();
      if (cur.node.left === null) { depths[cur.node.word] = cur.d; continue; }
      stack.push({ node: cur.node.left, d: cur.d + 1 });
      stack.push({ node: cur.node.right, d: cur.d + 1 });
    }
    return depths;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- 层次 softmax（04 §5.3） ----------
   * p(w|w_I) = ∏_{j} σ( ± v'_{n(w,j)} · v_{w_I} )
   * 符号取「路径下一位是不是固定孩子」：本实现把「左孩子」当固定孩子，
   * 即该位是 0 取 +，是 1 取 −。这是论文里 [[x]] ∈ {+1,−1} 的一种合法取法。
   */

  function hsPathProb(bits, nodeVecs, center) {
    var p = 1;
    for (var j = 0; j < bits.length; j++) {
      var s = dot(nodeVecs[j], center);
      var sign = bits[j] === '0' ? 1 : -1;
      p *= sigmoid(sign * s);
    }
    return p;
  }

  /**
   * 对整棵树校验 Σ_w p(w|w_I) = 1。
   * 每个内部节点的向量按「树上的节点下标」存进 nodeVecs：
   * nodeVecs[内部节点编号] 为该内部节点的向量。
   */
  function collectInternalNodes(root) {
    var list = [], idx = new Map();
    (function walk(node) {
      if (node.left === null) return;
      idx.set(node, list.length);
      list.push(node);
      walk(node.left); walk(node.right);
    })(root);
    return { list: list, index: idx };
  }

  /** 用「每层一个向量」的简化口径：第 j 层用同一个内部节点向量 */
  function hsSumProbability(paths, depthList, center, vecsByDepth, weightFn) {
    var total = 0;
    for (var w = 0; w < depthList.length; w++) {
      var bits = paths[w];
      if (bits == null) continue;
      var p = 1;
      for (var j = 0; j < bits.length; j++) {
        var s = dot(vecsByDepth[j], center);
        var sign = bits[j] === '0' ? 1 : -1;
        p *= sigmoid(sign * s);
      }
      total += weightFn ? weightFn(w) * p : p;
    }
    return total;
  }

  /* ---------- word2vec 梯度（04 §2.3 / §4.4） ---------- */

  /**
   * naive softmax 版：
   *   P(w|c) = softmax(U · v_c)
   *   ∂J/∂v_c = Σ_w P(w|c)·u_w − u_o
   *   ∂J/∂u_o = (P(o|c) − 1)·v_c,  ∂J/∂u_w = P(w|c)·v_c (w ≠ o)
   */
  function skipgramSoftmaxGrad(vc, U, o) {
    var V = U.length;
    var scores = new Array(V);
    for (var w = 0; w < V; w++) scores[w] = dot(U[w], vc);
    var P = softmax(scores);

    var dvc = zeros(vc.length), dU = zeros2(V, vc.length), i, d;
    for (w = 0; w < V; w++) {
      for (d = 0; d < vc.length; d++) dvc[d] += P[w] * U[w][d];
    }
    for (d = 0; d < vc.length; d++) dvc[d] -= U[o][d];
    for (w = 0; w < V; w++) {
      var coef = (w === o ? P[w] - 1 : P[w]);
      for (d = 0; d < vc.length; d++) dU[w][d] = coef * vc[d];
    }
    var J = -Math.log(Math.max(P[o], 1e-300));
    return { J: J, P: P, scores: scores, dvc: dvc, dU: dU };
  }

  function negLoss(vc, U, o, neg) {
    var J = -Math.log(Math.max(sigmoid(dot(U[o], vc)), 1e-300));
    for (var i = 0; i < neg.length; i++) {
      J -= Math.log(Math.max(sigmoid(-dot(U[neg[i]], vc)), 1e-300));
    }
    return J;
  }

  /**
   * 负采样版：
   *   ∂J/∂v_c = −(1 − σ(u_o·v_c))·u_o + Σ_k σ(u_k·v_c)·u_k
   *   ∂J/∂u_o = −(1 − σ(u_o·v_c))·v_c
   *   ∂J/∂u_k = σ(u_k·v_c)·v_c
   */
  function skipgramNegGrad(vc, U, o, neg) {
    var d = vc.length, i, k;
    var J = negLoss(vc, U, o, neg);
    var eo = 1 - sigmoid(dot(U[o], vc));

    var dvc = zeros(d), dU = zeros2(U.length, d);
    for (i = 0; i < d; i++) dvc[i] = -eo * U[o][i];
    for (i = 0; i < d; i++) dU[o][i] = -eo * vc[i];

    for (k = 0; k < neg.length; k++) {
      var idx = neg[k];
      var ek = sigmoid(dot(U[idx], vc));
      for (i = 0; i < d; i++) dvc[i] += ek * U[idx][i];
      for (i = 0; i < d; i++) dU[idx][i] = ek * vc[i];
    }
    return { J: J, dvc: dvc, dU: dU };
  }

  /** 中心差分数值梯度：用来验证上面的解析梯度（误差应在 1e-8 量级） */
  function numericGrad(f, x, h) {
    h = h == null ? 1e-6 : h;
    var g = zeros(x.length);
    for (var i = 0; i < x.length; i++) {
      var old = x[i];
      x[i] = old + h; var fp = f();
      x[i] = old - h; var fm = f();
      x[i] = old;
      g[i] = (fp - fm) / (2 * h);
    }
    return g;
  }

  function maxAbsDiff(a, b) {
    var m = 0;
    for (var i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
    return m;
  }

  /* ---------- 复杂度账（04 §2.5 / §5.4） ---------- */

  function mulAddCounts(V, D, K, L) {
    return {
      naive: V * D,
      hs: L * D,
      neg: (1 + K) * D
    };
  }

  /* ---------- 导出 ---------- */

  var API = {
    dot: dot, norm: norm, cosine: cosine, zeros: zeros, zeros2: zeros2, transpose: transpose,
    sigmoid: sigmoid, softmax: softmax,
    cooccurrence: cooccurrence, isBipartite: isBipartite,
    jacobiEigen: jacobiEigen, svdEmbedding: svdEmbedding,
    reconstructionError: reconstructionError,
    nonzeroCoordCounts: nonzeroCoordCounts, absCosOnePairs: absCosOnePairs,
    noiseDistribution: noiseDistribution, unigram: unigram,
    buildHuffman: buildHuffman, weightedPathLength: weightedPathLength,
    balancedDepth: balancedDepth, randomMergeTree: randomMergeTree,
    mulberry32: mulberry32,
    collectInternalNodes: collectInternalNodes, hsPathProb: hsPathProb,
    hsSumProbability: hsSumProbability,
    skipgramSoftmaxGrad: skipgramSoftmaxGrad, skipgramNegGrad: skipgramNegGrad,
    negLoss: negLoss, numericGrad: numericGrad, maxAbsDiff: maxAbsDiff,
    mulAddCounts: mulAddCounts
  };

  // 算法层必须挂在自己的命名空间下（KB.core.<课id>），不能往 window 上抛全局单例：
  // 单例会被后加载的那门课**静默覆盖** —— 先加载的课程算法全错、且不报错。
  // 注意本文件是入口里第一个加载的 KB 脚本，此时 KB 还不存在，故要自己建。
  global.KB = global.KB || {};
  global.KB.core = global.KB.core || {};
  global.KB.core.k01 = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
