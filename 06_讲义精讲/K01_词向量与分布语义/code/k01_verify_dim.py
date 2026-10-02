"""
K01 补充核验：k=2 时那批 cos = 1.0000 到底是怎么产生的。

背景：`logs/k01_demo_out.txt` PART 3 里出现了 cos(deep, flying) = 1.0000、
cos(NLP, flying) = 1.0000 这种"无关词也有最高相似度"的现象。

对这件事容易给出两种都不准确的解释，本脚本用来判定真正的原因：

  H1 待验：2 维空间太挤，余弦退化成"是否同侧"
  H2 待验：只有 1 维才会这样，所以这里一定是算错了 / 用了二次投影的坐标
  H3 待验：这份语料的共现矩阵恰好是**二分图**，导致名义上 k=2，
           但每个词只占用 1 个坐标 —— 有效自由度 = 1（于是 H1 描述的退化确实
           发生了，只是发生在名义 2 维里；H2 关于成因的判断也不成立）

三个实验分别给出：退化的真正机制 / 打破该结构后的对照 / 与维度无关的那种失效。

运行：
    D:/code/anaconda/envs/pytorch_env/python.exe code/k01_verify_dim.py
"""

import numpy as np
from collections import deque

np.set_printoptions(precision=6, suppress=True, linewidth=140)


# ---------- 工具 ----------

def build_cooc(sentences, window=1):
    words = sorted({w for s in sentences for w in s})
    w2i = {w: i for i, w in enumerate(words)}
    n = len(words)
    X = np.zeros((n, n))
    for s in sentences:
        for p, w in enumerate(s):
            for off in range(-window, window + 1):
                if off == 0:
                    continue
                j = p + off
                if 0 <= j < len(s):
                    X[w2i[w], w2i[s[j]]] += 1
    return words, X


def cos_matrix(E):
    En = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-15)
    return En @ En.T


def count_unitary(E, tol=1e-8):
    """统计 |cos| 在数值上等于 1 的词对数量。"""
    C = cos_matrix(E)
    n = C.shape[0]
    hits, pairs = [], 0
    for i in range(n):
        for j in range(i + 1, n):
            pairs += 1
            if abs(abs(C[i, j]) - 1.0) < tol:
                hits.append((i, j, C[i, j]))
    return C, hits, pairs


def is_bipartite(X):
    """给邻接矩阵做二染色。能染开 = 二分图（无奇环）。"""
    n = X.shape[0]
    adj = [np.nonzero(X[i])[0].tolist() for i in range(n)]
    color = [-1] * n
    for s in range(n):
        if color[s] != -1:
            continue
        color[s] = 0
        q = deque([s])
        while q:
            u = q.popleft()
            for v in adj[u]:
                if color[v] == -1:
                    color[v] = 1 - color[u]
                    q.append(v)
                elif color[v] == color[u]:
                    return False, color
    return True, color


def report(name, words, X, ks):
    print()
    print("=" * 70)
    print(name)
    print("=" * 70)
    Xf = X.astype(float)
    ok, color = is_bipartite(Xf)
    print(f"共现矩阵是否二分图: {ok}")
    if ok:
        g0 = [words[i] for i in range(len(words)) if color[i] == 0]
        g1 = [words[i] for i in range(len(words)) if color[i] == 1]
        print(f"  二分划片 A: {g0}")
        print(f"  二分划片 B: {g1}")

    U, S, Vt = np.linalg.svd(Xf)
    print(f"奇异值: {S}")
    dup = []
    for i in range(1, len(S)):
        if abs(S[i] - S[i - 1]) < 1e-9 and S[i] > 1e-9:
            dup.append((i - 1, i, S[i]))
    print(f"相邻相等的奇异值对（二分图指纹）: {dup if dup else '无'}")

    print()
    print(f"{'k':>3} {'每词非零坐标数分布':>22} {'|cos|=1 的词对':>16} {'占比':>8}")
    for k in ks:
        E = U[:, :k] * S[:k]
        nonzero = (np.abs(E) > 1e-9).sum(axis=1)
        _, hits, pairs = count_unitary(E)
        dist = sorted(set(nonzero.tolist()))
        print(f"{k:>3} {str(dist):>22} {len(hits):>10}/{pairs:<5} "
              f"{len(hits) / pairs:>7.1%}")
    return U, S, Vt


# ---------- 实验 1：原 demo 的三句话语料 ----------

sents = [
    "I like deep learning".split(),
    "I like NLP".split(),
    "I enjoy flying".split(),
]
words, X = build_cooc(sents)
U, S, Vt = report("实验 1 · 原 demo 的 3 句话语料", words, X, ks=[1, 2, 3, 4, 5, 6])

print()
print("--- k=2 的实际坐标（保留 8 位小数，看第二维是不是真为 0）---")
E2 = U[:, :2] * S[:2]
for i, w in enumerate(words):
    print(f"  {w:10s} [{E2[i, 0]:+.8f}  {E2[i, 1]:+.8f}]  非零坐标数="
          f"{(np.abs(E2[i]) > 1e-9).sum()}")
print()
print(">>> 第二维全部严格为 0 => 名义 k=2，实际每个词只有 1 个自由度。")

print()
print("--- 恒等式检查: Emb = U[:,:k]*S[:k] 是否恒等于 X @ V[:,:k] ---")
Xf = X.astype(float)
for k in range(1, 7):
    lhs = U[:, :k] * S[:k]
    rhs = Xf @ Vt[:k].T
    print(f"  k={k}: max|差| = {np.abs(lhs - rhs).max():.3e}")
print(">>> 成立意味着：嵌入是共现矩阵行的线性函数 —— 语料层面区分不了的两个词，"
      "无论多少维都区分不了。")


# ---------- 实验 2：加一句话打破二分图 ----------

print()
sents2 = sents + ["I enjoy learning NLP".split()]
words2, X2 = build_cooc(sents2)
report("实验 2 · 加一句 ‘I enjoy learning NLP’ 打破二分图", words2, X2, ks=[1, 2, 3, 4])


# ---------- 实验 3：两词共现行完全相同 —— 多少维都救不回来 ----------

print()
print("=" * 70)
print("实验 3 · 语料区分不了的词，维度再高也是 cos = 1.0")
print("=" * 70)
rng = np.random.default_rng(0)
V = 400
base = rng.integers(0, 6, size=(V, V)).astype(float)
X3 = (base + base.T) / 2          # 对称化，模拟共现矩阵
X3[1] = X3[0]                     # 让词 1 与词 0 的共现行完全相同
X3[:, 1] = X3[:, 0]
U3, S3, Vt3 = np.linalg.svd(X3)
for k in [2, 50, 300]:
    E = U3[:, :k] * S3[:k]
    c = cos_matrix(E)
    print(f"  k={k:>3}: cos(词0, 词1) = {c[0, 1]:.12f}   "
          f"两向量 max|差| = {np.abs(E[0] - E[1]).max():.3e}")
print(">>> 结论：这两词的嵌入向量完全相等，与降到几维无关。"
      "这是数据的锅，不是降维的锅。")
