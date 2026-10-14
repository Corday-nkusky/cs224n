/* ============================================================
 * K01 算法层单测（Node，零依赖）
 * ------------------------------------------------------------
 * 每个断言都绑死在 logs 里的真实数字上（讲义那条轨已退役）：
 *   logs/k01_demo_out.txt        → 共现矩阵、奇异值、余弦、重构误差
 *   logs/k01_verify_dim_out.txt  → 二分图、非零坐标数、|cos|=1 占比、恒等式
 *   logs/k01_huffman_neg_out.txt → 噪声分布、熵、哈夫曼路径/深度/加权代价
 *   playground/t1_word2vec/run_numpy_out.txt → 复杂度账
 * 跑法：node site/tests/core.test.js
 * ============================================================ */

'use strict';

const path = require('path');
const fs = require('fs');
const core = require(path.join(__dirname, '..', 'js', 'core', 'k01_core.js'));

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); console.log('  \u2717 ' + name + (detail ? '  → ' + detail : '')); }
}

function near(name, got, want, tol) {
  const d = Math.abs(got - want);
  ok(name, d <= tol, `got ${got}, want ${want}, |diff|=${d.toExponential(3)} > ${tol}`);
}

function arrNear(name, got, want, tol) {
  let worst = 0, at = -1;
  for (let i = 0; i < want.length; i++) {
    const d = Math.abs(got[i] - want[i]);
    if (d > worst) { worst = d; at = i; }
  }
  ok(name, worst <= tol, `max|diff|=${worst.toExponential(3)} at [${at}] (got ${got[at]}, want ${want[at]})`);
}

function section(t) { console.log('\n' + t); }

/* ============================================================
 * 1. 基础数值
 * ============================================================ */
section('1. sigmoid / softmax');

ok('σ(0) = 0.5', Math.abs(core.sigmoid(0) - 0.5) < 1e-15);
near('σ(1) = 0.7310585786', core.sigmoid(1), 0.7310585786300049, 1e-15);
near('σ(−1) = 0.2689414214', core.sigmoid(-1), 0.2689414213699951, 1e-15);
ok('σ 数值稳定：σ(−900) 不返回 NaN/0 除', core.sigmoid(-900) >= 0 && Number.isFinite(core.sigmoid(-900)));
near('σ(x)+σ(−x) = 1（x=800）', core.sigmoid(800) + core.sigmoid(-800), 1, 1e-15);

{
  const p = core.softmax([1, 2, 3]);
  near('softmax 归一化 Σp = 1', p.reduce((a, b) => a + b, 0), 1, 1e-15);
  const big = core.softmax([1000, 1001, 999]);
  ok('softmax 减最大值：大数不溢出', big.every(Number.isFinite) && Math.abs(big.reduce((a, b) => a + b, 0) - 1) < 1e-15,
    JSON.stringify(big));
}

/* ============================================================
 * 2. one-hot 正交（logs/k01_demo_out.txt PART 1）
 * ============================================================ */
section('2. one-hot：任意两个不同词内积恒为 0');

{
  const words = ['hotel', 'motel', 'banking', 'monetary', 'cat'];
  const V = words.length;
  const vecs = words.map((_, i) => core.zeros(V).map((__, j) => (i === j ? 1 : 0)));
  let offDiagMax = 0, diagOk = true;
  for (let i = 0; i < V; i++) {
    for (let j = 0; j < V; j++) {
      const d = core.dot(vecs[i], vecs[j]);
      if (i === j) { if (d !== 1) diagOk = false; }
      else offDiagMax = Math.max(offDiagMax, Math.abs(d));
    }
  }
  ok('对角线全为 1', diagOk);
  ok('非对角元全为 0（正交）', offDiagMax === 0, `max=|${offDiagMax}|`);
  near('hotel·motel = 0（跟 hotel·cat 完全一样）', core.dot(vecs[0], vecs[1]), core.dot(vecs[0], vecs[4]), 0);
}

/* ============================================================
 * 3. 共现矩阵（logs/k01_demo_out.txt PART 2）
 * ============================================================ */
section('3. 三句话语料的窗口共现矩阵（window=1）');

const TOY = [['I', 'like', 'deep', 'learning'], ['I', 'like', 'NLP'], ['I', 'enjoy', 'flying']];
const co = core.cooccurrence(TOY, { window: 1 });
const W = co.index;

ok('词表大小 = 7', co.words.length === 7, co.words.join(','));
ok('X[I][like] = 2（I 在两句里都挨着 like）', co.X[W.I][W.like] === 2, String(co.X[W.I][W.like]));
ok('X[like][I] = 2（对称）', co.X[W.like][W.I] === 2);
ok('X[NLP][like] = 1', co.X[W.NLP][W.like] === 1);
ok('X[deep][learning] = 1', co.X[W.deep][W.learning] === 1);
ok('X[deep][like] = 1', co.X[W.deep][W.like] === 1);
ok('X[I][enjoy] = 1', co.X[W.I][W.enjoy] === 1);
ok('X[flying][enjoy] = 1', co.X[W.flying][W.enjoy] === 1);
ok('X[learning][deep] = 1', co.X[W.learning][W.deep] === 1);
ok('对称性 max|X − Xᵀ| = 0', co.maxAsymmetry === 0, String(co.maxAsymmetry));
ok('非零元素 = 12', co.nonzero === 12, String(co.nonzero));
near('非零占比 = 12/49 = 24.5%', co.nonzeroRatio, 12 / 49, 1e-15);
near('非零占比（百分比口径）= 24.4898%', co.nonzeroRatio * 100, 24.489795918367346, 1e-12);

{
  const bp = core.isBipartite(co.X);
  ok('共现图是二分图（03 §4 的第一步）', bp.bipartite === true);
  const nameOf = i => co.words[i];
  const A = bp.bipartite ? bp.groups[0].map(nameOf).sort().join(',') : '';
  const B = bp.bipartite ? bp.groups[1].map(nameOf).sort().join(',') : '';
  const setEq = (s, arr) => s === arr.slice().sort().join(',');
  ok('A 组 = {I, NLP, deep, flying}',
    bp.bipartite && (setEq(A, ['I', 'NLP', 'deep', 'flying']) || setEq(B, ['I', 'NLP', 'deep', 'flying'])), A + ' | ' + B);
  ok('B 组 = {enjoy, learning, like}',
    bp.bipartite && (setEq(A, ['enjoy', 'learning', 'like']) || setEq(B, ['enjoy', 'learning', 'like'])), A + ' | ' + B);
}

/* ============================================================
 * 4. SVD / 降维（logs/k01_demo_out.txt PART 3–4）
 * ============================================================ */
section('4. SVD 降维：奇异值、非零坐标数、|cos|=1 占比、重构误差');

const svd = core.svdEmbedding(co.X, 7);
const SIG = [2.6404470773710083, 2.6404470773710083, 1.1930906362589508, 1.1930906362589508,
             0.7775435455806398, 0.7775435455806398];
arrNear('奇异值（前 6 个，与日志 4 位小数一致）= [2.640447 2.640447 1.193091 1.193091 0.777544 0.777544]',
  svd.sigmas, SIG, 1e-6);

near('奇异值成对相等（二分图指纹）#0=#1', svd.sigmas[0] - svd.sigmas[1], 0, 1e-9);
near('奇异值成对相等 #2=#3', svd.sigmas[2] - svd.sigmas[3], 0, 1e-9);
near('奇异值成对相等 #4=#5', svd.sigmas[4] - svd.sigmas[5], 0, 1e-9);
// σ = √λ 会把特征值的浮点噪声开方放大：λ 的噪声 ~1e-15 → σ 的噪声 ~1e-8。
// 所以"第 7 个奇异值为 0"只能在特征值口径上严格断言。
near('第 7 个特征值 ~ 0（矩阵秩 = 6）', svd.sigmas[6] * svd.sigmas[6], 0, 1e-12);
ok('第 7 个奇异值 ≤ 1e-7（√ 放大的浮点极限）', svd.sigmas[6] <= 1e-7, svd.sigmas[6].toExponential(3));

{
  const ERR = [3.320849, 2.013971, 1.622533, 1.099613, 0.777544, 0.000000, 0.000000];
  const got = [];
  for (let k = 1; k <= 7; k++) got.push(core.reconstructionError(svd.sigmas, k));
  arrNear('重构误差 ‖X − X_k‖_F（k=1..7）= 3.320849 / 2.013971 / 1.622533 / 1.099613 / 0.777544 / 0 / 0',
    got, ERR, 5e-7);
  let mono = true;
  for (let k = 1; k < 7; k++) if (got[k] > got[k - 1] + 1e-12) mono = false;
  ok('误差随 k 单调不增', mono, got.map(v => v.toFixed(6)).join(' '));
}

{
  const emb2 = core.svdEmbedding(co.X, 2).embedding;
  const nz = core.nonzeroCoordCounts(emb2, 1e-8);
  ok('k=2 时每个词只有 1 个非零坐标（名义维度 ≠ 有效自由度）',
    nz.every(c => c === 1), JSON.stringify(nz));

  const p2 = core.absCosOnePairs(emb2, 1e-6);
  ok('k=2：|cos|=1 的词对 = 9', p2.count === 9, String(p2.count));
  ok('k=2：词对总数 = 21', p2.total === 21, String(p2.total));
  near('k=2：占比 = 9/21 = 42.9%', p2.ratio * 100, 42.857142857142854, 1e-10);

  // logs/k01_verify_dim_out.txt 实验 1 的整张表。
  // ⚠️ 为什么只断言 k ∈ {1,2,4,5,6}：这个矩阵是二分图，奇异值成对相等
  //    （2.6404|2.6404、1.1931|1.1931、0.7775|0.7775），每一对构成一个 2 维特征子空间，
  //    子空间内部的**【基不唯一】**。k 取完整退化组（2/4/6）时，嵌入是「行在子空间上的投影」，
  //    两两余弦是几何量、与基无关 → 可复现；k=3 只取到 1.1931 那一对里的**一根**轴，
  //    取哪一根由算法的舍入路径决定 → 不可复现（numpy 报 0/21，Jacobi 报 3/21，两者都合法）。
  const EXP1 = { 1: [6, 21, 28.6], 2: [9, 21, 42.9], 4: [0, 21, 0], 5: [0, 21, 0], 6: [0, 21, 0] };
  let tableOk = true, detail = '';
  for (const k of [1, 2, 4, 5, 6]) {
    const e = core.svdEmbedding(co.X, k).embedding;
    const r = core.absCosOnePairs(e, 1e-6);
    const pct = Math.round(r.ratio * 1000) / 10;
    if (r.count !== EXP1[k][0] || r.total !== EXP1[k][1] || Math.abs(pct - EXP1[k][2]) > 0.05) {
      tableOk = false; detail += ` k=${k}: 得到 ${r.count}/${r.total}=${pct}% 期望 ${EXP1[k].join('/')}%`;
    }
  }
  ok('实验 1 整张表复现（k=1,2,4,5,6 的 |cos|=1 计数与占比；k=3 见下）', tableOk, detail);

  {
    const e3 = core.svdEmbedding(co.X, 3).embedding;
    const r3 = core.absCosOnePairs(e3, 1e-6);
    const nz3 = core.nonzeroCoordCounts(e3, 1e-8);
    console.log(`  \u2139 k=3 是非可复现行：本实现得到 ${r3.count}/${r3.total}、非零坐标数 ${JSON.stringify(nz3)}；` +
      `日志（numpy）是 0/21、[2]。两者都合法 —— 退化子空间内基不唯一，这一行不能当"可复现数字"用。`);
  }
}

{
  // 03 §4 展示的 k=2 实际坐标：每词 1 个自由度，组内同号
  const emb2 = core.svdEmbedding(co.X, 2).embedding;
  const pairsShown = [['like', 'enjoy'], ['deep', 'learning'], ['I', 'like'], ['NLP', 'flying'], ['deep', 'flying']];
  const want = [1.0, 0.0, 0.0, 1.0, 1.0];
  let okAll = true, detail = '';
  pairsShown.forEach((pr, i) => {
    const c = core.cosine(emb2[W[pr[0]]], emb2[W[pr[1]]]);
    // 只比 |cos|：SVD 每根轴整体符号是任意的（±q 都是合法解）
    if (Math.abs(Math.abs(c) - want[i]) > 1e-6) { okAll = false; detail += ` ${pr.join('–')}=${c.toFixed(4)}`; }
  });
  ok('03 §4 的 5 个余弦：like–enjoy / deep–learning / I–like / NLP–flying / deep–flying = 1/0/0/1/1（比 |cos|）',
    okAll, detail);
}

section('4b. 对照实验：打破二分图 / 语料区分不了的词');

{
  const TOY2 = TOY.concat([['I', 'enjoy', 'learning', 'NLP']]);
  const co2 = core.cooccurrence(TOY2, { window: 1 });
  ok('加一句「I enjoy learning NLP」后不再是二分图', core.isBipartite(co2.X).bipartite === false);

  const EXP2 = { 1: [21, 21, 100.0], 2: [1, 21, 4.8], 3: [1, 21, 4.8], 4: [1, 21, 4.8] };
  let tableOk = true, detail = '';
  for (const k of [1, 2, 3, 4]) {
    const e = core.svdEmbedding(co2.X, k).embedding;
    const r = core.absCosOnePairs(e, 1e-6);
    const pct = Math.round(r.ratio * 1000) / 10;
    if (r.count !== EXP2[k][0] || Math.abs(pct - EXP2[k][2]) > 0.05) {
      tableOk = false; detail += ` k=${k}: ${r.count}/${r.total}=${pct}% 期望 ${EXP2[k][0]}/${EXP2[k][1]}=${EXP2[k][2]}%`;
    }
  }
  ok('实验 2 复现：42.9% → 4.8%（真二维不会被一堆词拿 1.0）', tableOk, detail);

  const e2 = core.svdEmbedding(co2.X, 2).embedding;
  const nz2 = core.nonzeroCoordCounts(e2, 1e-8);
  ok('实验 2：k=2 时每词 2 个非零坐标都用上', nz2.every(c => c === 2), JSON.stringify(nz2));

  // 实验 2 剩下的那 1 对应当是共现行相同的两个词
  const r = core.absCosOnePairs(e2, 1e-6);
  const rowKey = i => co2.X[i].join(',');
  const sameRow = r.pairs.every(pr => rowKey(pr[0]) === rowKey(pr[1]));
  ok('剩下那 1 对的共现行完全相同（NLP 与 deep）', r.count === 1 && sameRow);
}

{
  // 实验 3 的机制：嵌入是共现矩阵「行」的线性函数 → 行相同则嵌入相同（与 k 无关）
  const n = 40, k = 40;
  const rnd = core.mulberry32(20261006);
  const X = core.zeros2(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) X[i][j] = i === j ? 0 : Math.floor(rnd() * 4);
  for (let j = 0; j < n; j++) X[1][j] = X[0][j];      // 让 1 号词与 0 号词共现行完全一样
  for (let i = 0; i < n; i++) X[i][1] = X[i][0];

  const emb = core.svdEmbedding(X, k).embedding;
  const d0 = core.maxAbsDiff(emb[0], emb[1]);
  ok('共现行相同的两个词，嵌入向量完全相同（max|差| ~ 1e-13）', d0 < 1e-10, 'max|差| = ' + d0.toExponential(3));
  near('它们的余弦 = 1（加维度救不了）', Math.abs(core.cosine(emb[0], emb[1])), 1, 1e-12);
}

/* ============================================================
 * 5. 噪声分布（logs/k01_huffman_neg_out.txt 实验 A）
 * ============================================================ */
section('5. 负采样噪声分布 P_n(w) ∝ U(w)^alpha（IMDB top-2000）');

const freqPath = path.join(__dirname, '..', 'reference', 'imdb2000_freq.json');
const freq = JSON.parse(fs.readFileSync(freqPath, 'utf8'));
const counts = freq.counts;
const idxOf = {};
freq.words.forEach((w, i) => { idxOf[w] = i; });

ok('V = 2000', freq.V === 2000, String(freq.V));
ok('top-V 内计数和 T = 9,846,798（与日志一致）', freq.tokens_in_vocab === 9846798, String(freq.tokens_in_vocab));
ok('the 频次 = 677483', counts[idxOf.the] === 677483, String(counts[idxOf.the]));
ok('and 频次 = 330035', counts[idxOf.and] === 330035);
ok('in 频次 = 188891', counts[idxOf.in] === 188891);
ok('最高频词依次为 the, and, a, of, to, is, br, in',
  freq.words.slice(0, 8).join(',') === 'the,and,a,of,to,is,br,in', freq.words.slice(0, 8).join(','));

{
  const uni = core.unigram(counts);
  const pct = w => uni[idxOf[w]] * 100;
  near('unigram：the = 6.880%', pct('the'), 6.880, 5e-4);
  near('unigram：and = 3.352%', pct('and'), 3.352, 5e-4);
  near('unigram：a = 3.334%', pct('a'), 3.334, 5e-4);
  near('unigram：of = 2.985%', pct('of'), 2.985, 5e-4);
  near('unigram：to = 2.758%', pct('to'), 2.758, 5e-4);
  near('unigram：queen = 0.008%', pct('queen'), 0.008, 5e-4);
}

{
  const A = {};
  [0.0, 0.5, 0.75, 1.0].forEach(a => { A[a] = core.noiseDistribution(counts, a); });
  const pct = (a, w) => A[a].p[idxOf[w]] * 100;

  // 日志：the 的 alpha=0/0.5/0.75/1.0 列
  near('α=0.75：the = 2.715%', pct(0.75, 'the'), 2.715, 5e-4);
  near('α=0.75：and = 1.583%', pct(0.75, 'and'), 1.583, 5e-4);
  near('α=0.75：a = 1.577%', pct(0.75, 'a'), 1.577, 5e-4);
  near('α=0.75：of = 1.452%', pct(0.75, 'of'), 1.452, 5e-4);
  near('α=0.75：to = 1.368%', pct(0.75, 'to'), 1.368, 5e-4);
  near('α=0.75：man = 0.123%', pct(0.75, 'man'), 0.123, 5e-4);
  near('α=0.75：king = 0.028%', pct(0.75, 'king'), 0.028, 5e-4);
  near('α=0.75：queen = 0.017%', pct(0.75, 'queen'), 0.017, 5e-4);

  near('α=0.5：the = 0.840%', pct(0.5, 'the'), 0.840, 5e-4);
  near('α=1.0：the = 6.880%（= unigram 本身）', pct(1.0, 'the'), 6.880, 5e-4);
  near('α=0：最高频词占比 = 1/V = 0.050%', pct(0, 'the'), 0.050, 5e-4);

  // 高频词被压低的倍数（日志最后一列）
  near('倍数(a=1 / a=0.75)：the = 2.53x', A[1.0].p[idxOf.the] / A[0.75].p[idxOf.the], 2.53, 5e-3);
  near('倍数：man = 0.90x（低频词反而被抬高）', A[1.0].p[idxOf.man] / A[0.75].p[idxOf.man], 0.90, 5e-3);
  near('倍数：queen = 0.47x', A[1.0].p[idxOf.queen] / A[0.75].p[idxOf.queen], 0.47, 5e-3);

  // 熵
  near('熵 α=0.0 → 7.6009 nats', A[0.0].entropy, 7.6009, 5e-5);
  near('熵 α=0.5 → 7.3284 nats', A[0.5].entropy, 7.3284, 5e-5);
  near('熵 α=0.75 → 6.7838 nats', A[0.75].entropy, 6.7838, 5e-5);
  near('熵 α=1.0 → 5.8683 nats', A[1.0].entropy, 5.8683, 5e-5);
  ok('熵随 α 单调递减（α 越大越集中）',
    A[0.0].entropy > A[0.5].entropy && A[0.5].entropy > A[0.75].entropy && A[0.75].entropy > A[1.0].entropy);
  near('每个 α 都归一化：Σp = 1', [0, 0.5, 0.75, 1].map(a => core.noiseDistribution(counts, a).p.reduce((x, y) => x + y, 0)).reduce((x, y) => x + y) / 4, 1, 1e-12);
}

/* ============================================================
 * 6. 哈夫曼树（logs/k01_huffman_neg_out.txt 实验 B/C）
 * ============================================================ */
section('6. 哈夫曼树：路径、深度、带权路径长、内部节点数');

const hf = core.buildHuffman(counts);

ok('the 的路径 = 1011（逐位复现日志）', hf.paths[0] === '1011', hf.paths[0]);
ok('the 的深度 = 4', hf.depths[0] === 4, String(hf.depths[0]));
ok('and 的深度 = 5', hf.depths[idxOf.and] === 5, String(hf.depths[idxOf.and]));
ok('a 的深度 = 5', hf.depths[idxOf.a] === 5);
ok('of 的深度 = 5', hf.depths[idxOf.of] === 5);
ok('to 的深度 = 5', hf.depths[idxOf.to] === 5);
ok('is 的深度 = 6', hf.depths[idxOf.is] === 6, String(hf.depths[idxOf.is]));
ok('br 的深度 = 6', hf.depths[idxOf.br] === 6);
ok('in 的深度 = 6', hf.depths[idxOf.in] === 6);
ok('is 的路径 = 111111', hf.paths[idxOf.is] === '111111', hf.paths[idxOf.is]);

{
  let maxD = 0, minD = Infinity;
  for (let i = 0; i < counts.length; i++) { maxD = Math.max(maxD, hf.depths[i]); minD = Math.min(minD, hf.depths[i]); }
  ok('最长路径 = 14（低频词）', maxD === 14, String(maxD));
  ok('最短路径 = 4（the）', minD === 4, String(minD));

  const tail = ['frame', 'teens', 'according', 'study', 'private', 'meeting', 'jennifer', 'morning'];
  ok('尾部 8 个低频词深度全为 14', tail.every(w => hf.depths[idxOf[w]] === 14),
    tail.map(w => w + ':' + hf.depths[idxOf[w]]).join(' '));
  ok('frame 的路径 = 00111111111010', hf.paths[idxOf.frame] === '00111111111010', hf.paths[idxOf.frame]);
}

{
  const wpl = core.weightedPathLength(counts, hf.depths);
  near('带权平均路径长 = 8.491（实际期望代价）', wpl, 8.491, 5e-4);
  const avgByWord = hf.depths.reduce((a, b) => a + b, 0) / hf.depths.length;
  near('按词数平均路径长 = 12.572', avgByWord, 12.572, 5e-4);
  ok('平衡树深度 = 11 = ⌈log₂2000⌉', core.balancedDepth(2000) === 11, String(core.balancedDepth(2000)));
  near('哈夫曼 / 平衡树 = 0.772（省 22.8%）', wpl / 11.0, 0.772, 5e-4);
  ok('论文口径：8.491 ≤ log₂2000 = 10.966', wpl <= 10.966, wpl.toFixed(4));

  // 内部节点数 = W−1
  const internal = core.collectInternalNodes(hf.root).list.length;
  ok('内部节点数 = 1999 = W−1', internal === 1999, String(internal));
}

/* ============================================================
 * 7. 层次 softmax：Σ_w p(w|w_I) = 1（实验 D）
 * ============================================================ */
section('7. 层次 softmax：路径概率归一化');

{
  const rnd = core.mulberry32(20261006);
  const maxDepth = 14;
  const vecsByDepth = [];
  for (let j = 0; j < maxDepth; j++) {
    vecsByDepth.push([0, 1, 2, 3].map(() => (rnd() * 2 - 1) * 0.3));
  }
  const center = [0.1, -0.2, 0.35, -0.15];
  // 注意：Σ_w p(w|w_I) = 1 是【对全部叶子等权】求和的归一化约束，
  // 不能按词频加权 —— 加权后的 Σ U(w)·p(w|w_I) 是另一个量（期望概率），本来就不等于 1。
  const sum = core.hsSumProbability(hf.paths, hf.depths, center, vecsByDepth);
  near('Σ_w p(w|w_I) = 1（概率合法的数值误差 ~1e-16）', sum, 1, 1e-12);

  // 对 40 个随机中心向量重复，最大偏差仍应在浮点极限
  let worst = 0;
  for (let t = 0; t < 40; t++) {
    const c = [0, 1, 2, 3].map(() => (rnd() * 2 - 1) * 2);
    worst = Math.max(worst, Math.abs(core.hsSumProbability(hf.paths, hf.depths, c, vecsByDepth) - 1));
  }
  ok('40 次随机中心词，max|Σp − 1| ≤ 1e-12（日志报 2.220e-16）', worst <= 1e-12, worst.toExponential(3));

  // 单条路径概率公式：与逐层 σ 连乘的定义一致
  {
    const bits = hf.paths[idxOf.the]; // 1011
    const direct = core.hsPathProb(bits, vecsByDepth, center);
    let manual = 1;
    for (let j = 0; j < bits.length; j++) {
      const s = core.dot(vecsByDepth[j], center);
      manual *= bits[j] === '0' ? core.sigmoid(s) : core.sigmoid(-s);
    }
    near('hsPathProb ≡ 逐层 σ(±s) 连乘', direct, manual, 1e-15);
  }
}

/* ============================================================
 * 8. word2vec 梯度：解析式 vs 中心差分
 * ============================================================ */
section('8. 梯度：解析 vs 中心差分（这是 A2 书面题的预演）');

{
  const rnd = core.mulberry32(7);
  const V = 6, D = 4;
  const vc = [0, 1, 2, 3].map(() => (rnd() * 2 - 1));
  const U = core.zeros2(V, D);
  for (let w = 0; w < V; w++) for (let d = 0; d < D; d++) U[w][d] = (rnd() * 2 - 1);
  const o = 2;

  const g = core.skipgramSoftmaxGrad(vc, U, o);
  near('Σ_w P(w|c) = 1', g.P.reduce((a, b) => a + b, 0), 1, 1e-14);

  const num = core.numericGrad(() => core.skipgramSoftmaxGrad(vc, U, o).J, vc, 1e-6);
  const err = core.maxAbsDiff(g.dvc, num);
  ok('∂J/∂v_c 解析 ≈ 数值（< 1e-8）', err < 1e-8, 'max|diff| = ' + err.toExponential(3));

  // "期望 − 观测" 的另一半：Σ P(w|c)u_w 就是第一项
  const expect = core.zeros(D);
  for (let w = 0; w < V; w++) for (let d = 0; d < D; d++) expect[d] += g.P[w] * U[w][d];
  let d2 = 0;
  for (let d = 0; d < D; d++) d2 = Math.max(d2, Math.abs((expect[d] - U[o][d]) - g.dvc[d]));
  near('∂J/∂v_c = Σ_w P(w|c)u_w − u_o（定义式直接对账）', d2, 0, 1e-14);

  // ∂J/∂u_w 全部 V 个非零 —— 这就是"反向写得多"
  let allNonzero = true;
  for (let w = 0; w < V; w++) if (core.norm(g.dU[w]) === 0) allNonzero = false;
  ok('∂J/∂u_w 对全部 V 个词都非零（梯度被分母变稠密）', allNonzero);

  // 数值梯度对 ∂J/∂u_o
  const uoRow = U[o];
  const numU = core.numericGrad(() => core.skipgramSoftmaxGrad(vc, U, o).J, uoRow, 1e-6);
  ok('∂J/∂u_o 解析 ≈ 数值（< 1e-8）', core.maxAbsDiff(g.dU[o], numU) < 1e-8,
    core.maxAbsDiff(g.dU[o], numU).toExponential(3));

  // 形状同构：u_o 的系数是 (P(o|c) − 1) = "预测 − 标签"
  near('∂J/∂u_o = (P(o|c) − 1)·v_c', g.dU[o][0], (g.P[o] - 1) * vc[0], 1e-14);
}

{
  const rnd = core.mulberry32(11);
  const V = 6, D = 4;
  const vc = [0, 1, 2, 3].map(() => (rnd() * 2 - 1));
  const U = core.zeros2(V, D);
  for (let w = 0; w < V; w++) for (let d = 0; d < D; d++) U[w][d] = (rnd() * 2 - 1);
  const o = 1, neg = [0, 3, 5];

  const g = core.skipgramNegGrad(vc, U, o, neg);
  const num = core.numericGrad(() => core.negLoss(vc, U, o, neg), vc, 1e-6);
  ok('负采样 ∂J_neg/∂v_c 解析 ≈ 数值（< 1e-8）', core.maxAbsDiff(g.dvc, num) < 1e-8,
    core.maxAbsDiff(g.dvc, num).toExponential(3));

  const numUo = core.numericGrad(() => core.negLoss(vc, U, o, neg), U[o], 1e-6);
  ok('负采样 ∂J_neg/∂u_o 解析 ≈ 数值（< 1e-8）', core.maxAbsDiff(g.dU[o], numUo) < 1e-8,
    core.maxAbsDiff(g.dU[o], numUo).toExponential(3));
  const numUk = core.numericGrad(() => core.negLoss(vc, U, o, neg), U[3], 1e-6);
  ok('负采样 ∂J_neg/∂u_k 解析 ≈ 数值（< 1e-8）', core.maxAbsDiff(g.dU[3], numUk) < 1e-8,
    core.maxAbsDiff(g.dU[3], numUk).toExponential(3));

  // 稀疏性：只有 o 和 K 个负样本的行非零
  let writtenRows = 0;
  for (let w = 0; w < V; w++) if (core.norm(g.dU[w]) > 0) writtenRows++;
  ok('负采样每步只写回 1 + K = 4 行（梯度恢复稀疏）', writtenRows === 4, String(writtenRows));
}

/* ============================================================
 * 9. 复杂度账（04 §2.5 / §5.4 / run_numpy_out.txt）
 * ============================================================ */
section('9. 复杂度账');

{
  const a = core.mulAddCounts(69, 32, 5, 17);
  ok('V=69, D=32：naive = 2208', a.naive === 2208, String(a.naive));
  ok('V=69, D=32, K=5：NEG = 192', a.neg === 192, String(a.neg));

  const b = core.mulAddCounts(100000, 300, 5, 17);
  ok('V=100000, D=300：naive = 30,000,000', b.naive === 30000000, String(b.naive));
  ok('V=100000, D=300, L=17：HS = 5,100', b.hs === 5100, String(b.hs));
  ok('V=100000, D=300, K=5：NEG = 1,800', b.neg === 1800, String(b.neg));
  near('naive / NEG = 16667x（run_numpy_out.txt 的口径）', 3200000 / 192, 16667, 1);
  ok('参数量基本相同：naive 2VD vs HS (2W−1)D',
    2 * 69 * 32 === 4416 && (2 * 69 - 1) * 32 === 4384, '2VD=4416, (2W−1)D=4384');
}

/* ============================================================
 * 10. A1 词向量作业的算法层（js/core/a1_core.js）
 * ------------------------------------------------------------
 * 基准来自 notebook 自己：toy 语料是 a1/code/.../student/... 的 cell-11 / cell-14 原文，
 * M_TEST_ANS 是作业方给的答案矩阵，ANS_WORDS 是同一格的答案词表。
 * 所以这一节不是"我自己算的和我自己算的一样"，而是**我的实现 vs 作业给的答案**。
 * ============================================================ */
section('10. A1 词向量作业：共现矩阵与五种错法');

{
  const A = require(path.join(__dirname, '..', 'js', 'core', 'a1_core.js'));

  /* 10.1 词表：拍平、去重、**排序** */
  const dw = A.distinctWords(A.TOY_CORPUS);
  ok('toy 语料去重后 10 个词', dw.n === 10, String(dw.n));
  ok('词表顺序与 notebook cell-11 的答案词表逐字一致（sorted 才是对的）',
    dw.words.join('|') === A.ANS_WORDS.join('|'),
    `got ${dw.words.join(',')} / want ${A.ANS_WORDS.join(',')}`);
  /* 反向对照：不排序会得到另一个顺序。没有这一条，"排序"这件事就不会被钉住 ——
     乱序同样能通过"10 个词、无重复"这种弱断言。 */
  const fs2 = A.firstSeenOrder(A.TOY_CORPUS);
  ok('反向对照：按首次出现顺序排得到的是另一个顺序（所以 sorted 不是可选项）',
    fs2.join('|') !== dw.words.join('|'), `firstSeen ${fs2.join(',')}`);

  /* 10.2 与作业给的答案矩阵逐位对账 */
  const nb = A.checkAgainstNotebook();
  ok('window=1 的矩阵与 notebook cell-14 的 M_test_ans 逐位一致',
    nb.ok === true, nb.firstBad ? JSON.stringify(nb.firstBad) : 'ok');
  ok('对账函数本身能报错（反向对照：词表改了就该 false）',
    (function () {
      const bad = A.cooccurrence(A.TOY_CORPUS, { window: 1, order: 'firstSeen' });
      return A.firstDiff(bad.X, A.M_TEST_ANS, bad.words) !== null;
    })(), '乱序后确实能查出不同');

  /* 10.3 手算基准（写在 A1 正文第 3、4 段里的那几个数） */
  const m1 = A.cooccurrence(A.TOY_CORPUS, { window: 1 });
  const m4 = A.cooccurrence(A.TOY_CORPUS, { window: 4 });
  ok('window=1：每句 6 个位置 × 2 个方向 × 2 句 = 24 次计数', m1.sum === 24, String(m1.sum));
  ok('window=1：非零格 24 个（10×10 里 24 个 1、其余 0）', m1.nonzero === 24, `${m1.nonzero}/100`);
  ok('window=1：对角线全 0（跳过自己）', A.diagSum(m1.X) === 0, String(A.diagSum(m1.X)));
  ok('window=1：完全对称 max|X−Xᵀ| = 0（每个词轮流当中心词的必然结果）',
    m1.maxAsymmetry === 0, String(m1.maxAsymmetry));
  ok('window=4：元素和 72（每句 6 个位置全在窗口内）', m4.sum === 72, String(m4.sum));
  ok('window=4：非零格 59（"All" 与 "All\'s" 各只出现在一句里，凑不齐 10 个邻居）',
    m4.nonzero === 59, `${m4.nonzero}/100`);

  /* 10.4 窗口与回放小件 */
  const doc = A.TOY_CORPUS[0];
  ok('windowOf(at=3, win=1) 给出左右各一格 [2,4]',
    A.windowOf(doc, 3, 1).join(',') === '2,4', A.windowOf(doc, 3, 1).join(','));
  ok('windowOf 在句首不越界（at=0 → [1]）', A.windowOf(doc, 0, 4).join(',') === '1,2,3,4', A.windowOf(doc, 0, 4).join(','));
  const rp = A.replay(A.TOY_CORPUS, { window: 1 }, 0);
  ok('replay(t=0) 的全零矩阵元素和为 0', A.sum2(rp.partial) === 0, String(A.sum2(rp.partial)));
  ok('replay 每推进一步只 +1（第 t 步的元素和恰好 = t）',
    [1, 7, 13, 24].every((t) => A.sum2(A.replay(A.TOY_CORPUS, { window: 1 }, t).partial) === t),
    '抽 t=1/7/13/24 全部吻合');
  ok('replay 走到尾等于完整矩阵',
    JSON.stringify(A.replay(A.TOY_CORPUS, { window: 1 }, 99).partial) === JSON.stringify(m1.X));

  /* 10.5 五种错法：每个变体都要有可复算的数字，且"正确解"没被改坏 */
  const v1 = A.variants(A.TOY_CORPUS, 1);
  const v4 = A.variants(A.TOY_CORPUS, 4);
  const byKey = (v, k) => v.variants.filter((x) => x.key === k)[0];
  ok('变体共 6 项（correct + 5 种错法）', v1.variants.length === 6, String(v1.variants.length));
  ok('列表第一项就是 correct（交互里默认选中它）', v1.variants[0].key === 'correct');
  ok('correct 与直接调 cooccurrence 的结果逐位相同（变体包装没有改坏正确解）',
    JSON.stringify(v1.variants[0].X) === JSON.stringify(m1.X));

  ok('rightOnly（只数右边）w=1 和 = 12 —— 恰好是正确值的一半',
    byKey(v1, 'rightOnly').sum === 12, String(byKey(v1, 'rightOnly').sum));
  ok('rightOnly（只数右边）不对称 max|X−Xᵀ| = 1',
    byKey(v1, 'rightOnly').asym === 1, String(byKey(v1, 'rightOnly').asym));
  ok('withSelf（忘了跳过自己）w=1 和 = 38、对角和 = 14',
    byKey(v1, 'withSelf').sum === 38 && byKey(v1, 'withSelf').diag === 14,
    `和=${byKey(v1, 'withSelf').sum} 对角=${byKey(v1, 'withSelf').diag}`);
  /* 对角不是 10 也不是 1：同一个词出现几次就加几次。「对角全变成 1」是个想当然的说法，
     实测 14 —— 这条断言就是为了把那个想当然钉死。 */
  ok('withSelf 的对角和不等于词表长度 10（"出现几次加几次"，不是"每个词一次"）',
    byKey(v1, 'withSelf').diag !== 10, String(byKey(v1, 'withSelf').diag));
  ok('shortRight（range 右边界少一格）w=1 和 = 12、w=4 和 = 66',
    byKey(v1, 'shortRight').sum === 12 && byKey(v4, 'shortRight').sum === 66,
    `w1=${byKey(v1, 'shortRight').sum} w4=${byKey(v4, 'shortRight').sum}`);

  /* 两个"最难发现"的错法 —— 这两条是 A1 正文第 5 段的核心论据，必须绑死。 */
  ok('weighted（按 1/d 加权）在 window=1 下与正确实现**逐位相同**（距离恒为 1，权重是空操作）',
    JSON.stringify(byKey(v1, 'weighted').X) === JSON.stringify(m1.X) &&
    byKey(v1, 'weighted').diffCount === 0,
    `diffCount=${byKey(v1, 'weighted').diffCount}`);
  ok('反向对照：同一份 weighted 在 window=4 下就和正确值分家了（和 = 42.333…≠72）',
    Math.abs(byKey(v4, 'weighted').sum - 127 / 3) < 1e-9 && byKey(v4, 'weighted').diffCount > 0,
    `w4 和=${byKey(v4, 'weighted').sum} diffCount=${byKey(v4, 'weighted').diffCount}`);
  ok('badOrder（词表没排序）**仍然对称、元素和也一样**，只是每个数字对到了错的词',
    byKey(v1, 'badOrder').asym === 0 && byKey(v1, 'badOrder').sum === 24 &&
    byKey(v1, 'badOrder').diffCount === 36,
    `不对称=${byKey(v1, 'badOrder').asym} 和=${byKey(v1, 'badOrder').sum} 错格=${byKey(v1, 'badOrder').diffCount}`);

  /* 10.6 交互要用的那几个衍生量 */
  const bad = byKey(v1, 'badOrder');
  ok('badOrder 暴露了它的行/列排列（交互里要按它重排行标签）',
    Array.isArray(bad.permuted) && bad.permuted.length === 10, bad.permuted ? bad.permuted.join(',') : '缺失');
  /* diffCells 是"把错的格全标红"要用的。只标第一个不同格的话，
     两个最强反差都看不见：忘了跳过自己看不出"整条对角线都脏"，词表没排序看不出"36 格全错"。 */
  ok('diffCells 的格数与 diffCount 一致（六项全部对得上）',
    v1.variants.every((x) => x.diffCells.length === x.diffCount),
    v1.variants.map((x) => `${x.key}:${x.diffCells.length}/${x.diffCount}`).join(' '));
  ok('withSelf 的差异格**恰好是整条对角线**（10 格，且 i === j）',
    byKey(v1, 'withSelf').diffCells.length === 10 &&
    byKey(v1, 'withSelf').diffCells.every((c) => c[0] === c[1]),
    byKey(v1, 'withSelf').diffCells.map((c) => c.join(',')).join(' | '));
  ok('badOrder 的差异格 36 个（100 格里三分之一以上是错的）',
    bad.diffCells.length === 36, String(bad.diffCells.length));
  ok('correct 的差异格为空（反向对照：没错就是没错）',
    v1.variants[0].diffCells.length === 0, String(v1.variants[0].diffCells.length));
  const d1 = A.firstDiff(byKey(v1, 'rightOnly').X, m1.X, m1.words);
  ok('firstDiff 能定位到第一个不同的格子并带上行列名',
    d1 && typeof d1.row === 'string' && typeof d1.col === 'string' && d1.got !== d1.want,
    d1 ? `${d1.row}×${d1.col}: got ${d1.got}, want ${d1.want}` : 'null');
}

/* ============================================================
 * 汇总
 * ============================================================ */
console.log('\n' + '='.repeat(60));
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail) {
  console.log('\n失败清单：');
  failures.forEach(f => console.log('  - ' + f));
}
console.log('='.repeat(60));
process.exit(fail ? 1 : 0);
