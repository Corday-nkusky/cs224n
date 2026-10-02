"""
K01 配套演示脚本：把"one-hot 算不出相似度"和"共现矩阵 + SVD 能算出"两件事跑出来看。

依赖: numpy, sklearn（pytorch_env 里都有，纯 CPU，1 秒跑完）

运行:
    D:/code/anaconda/envs/pytorch_env/python.exe k01_demo.py
"""

import numpy as np

np.set_printoptions(precision=4, suppress=True, linewidth=120)

print("=" * 62)
print("PART 1 · one-hot 为什么算不出相似度")
print("=" * 62)

vocab = ["hotel", "motel", "banking", "monetary", "cat"]
V = len(vocab)
onehot = np.eye(V, dtype=int)

print(f"词表 V={V}: {vocab}")
for w, v in zip(vocab, onehot):
    print(f"  {w:10s} -> {v}")

print("\n两两内积（相似度）:")
print("        " + "".join(f"{w[:7]:>9s}" for w in vocab))
for i, wi in enumerate(vocab):
    row = "".join(f"{onehot[i] @ onehot[j]:9d}" for j in range(V))
    print(f"  {wi:6s}{row}")

print("\n>>> 关键: 任意两个不同词的内积都是 0（正交）")
print(">>> 自己和自己是 1。这里没有'有点像'这个中间状态。")

print()
print("=" * 62)
print("PART 2 · 共现矩阵（Lec2 p31 的例子，window=1，对称）")
print("=" * 62)

sentences = [
    "I like deep learning".split(),
    "I like NLP".split(),
    "I enjoy flying".split(),
]

words = sorted({w for s in sentences for w in s})
w2i = {w: i for i, w in enumerate(words)}
n = len(words)
print(f"语料: {sentences}")
print(f"词表({n}): {words}")

X = np.zeros((n, n), dtype=int)
for s in sentences:
    for pos, w in enumerate(s):
        for offset in (-1, 1):
            j = pos + offset
            if 0 <= j < len(s):
                X[w2i[w], w2i[s[j]]] += 1

print("\n共现矩阵 X (行=中心词, 列=上下文词):")
print("        " + "".join(f"{w[:7]:>9s}" for w in words))
for i, w in enumerate(words):
    print(f"  {w:6s}" + "".join(f"{X[i, j]:9d}" for j in range(n)))

print(f"\n对称性检查: max|X - X.T| = {np.abs(X - X.T).max()}")
print(f"非零元素占比: {(X != 0).sum()}/{X.size} = {(X != 0).mean():.1%}  <- 词表一大就会极稀疏")

print()
print("=" * 62)
print("PART 3 · SVD 降到 2 维，看看能不能算相似度")
print("=" * 62)

Xf = X.astype(float)
U, S, Vt = np.linalg.svd(Xf)
print(f"奇异值: {S}")

k = 2
emb = U[:, :k] * S[:k]
print(f"\n降到 {k} 维后的坐标:")
for w in words:
    print(f"  {w:10s} {emb[w2i[w]]}")


def cos(a, b):
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))


print("\n余弦相似度（挑几对）:")
pairs = [("like", "enjoy"), ("deep", "learning"), ("I", "like"), ("NLP", "flying"), ("deep", "flying")]
for a, b in pairs:
    print(f"  cos({a:8s}, {b:8s}) = {cos(emb[w2i[a]], emb[w2i[b]]):+.4f}")

nnz = (np.abs(emb) > 1e-9).sum(axis=1)
print(f"\n>>> 第一步: 数一数每个词实际用到了几个坐标 -> {sorted(set(nnz.tolist()))}")
print(f">>> 名义上 k=2，但每个词只有 {int(nnz.max())} 个非零坐标 —— 两根轴从没被同一个词同时使用过。")

print(">>> 第二步: 这事儿和维度无关，先看奇异值是不是成对相等的 —— 上面那串")
print(">>>         [2.6404 2.6404 | 1.1931 1.1931 | 0.7775 0.7775] 就是成对。")
print(">>>         成对相等是共现矩阵为『二分图』的指纹:")

A = [w for w in words if emb[w2i[w]][0] > 1e-9]
B = [w for w in words if emb[w2i[w]][1] < -1e-9]
print(f">>>           分组 A = {A}")
print(f">>>           分组 B = {B}")
print(">>>         A 组内部互不共现，只跟 B 组共现（反之亦然）。SVD 于是把 A 组铺到")
print(">>>         第一根轴、B 组铺到第二根轴 —— 每组内部只剩 1 个自由度、坐标还同号，")
print(">>>         夹角必然是 0 度 => 组内 cos 全 1.0000，跨组全 0.0000。")

print(">>> 结论: 判据不是『k 写的是几』，而是『每个词实际拿到几个线性无关的共现模式』。")
print(">>>      还有第二种塌法跟维度无关: 两个词在语料里的共现行一模一样时，")
print(">>>      2 维 / 50 维 / 300 维都是 1.0 —— 那得换语料才救得回来。")
print(">>>      完整对照实验跑 code/k01_verify_dim.py（输出见 logs/k01_verify_dim_out.txt）。")

print()
print("=" * 62)
print("PART 4 · 保留 k 个奇异值 = 最优秩 k 近似（Lec2 p33 的结论，实测）")
print("=" * 62)

for kk in range(1, n + 1):
    approx = (U[:, :kk] * S[:kk]) @ Vt[:kk]
    err = np.linalg.norm(Xf - approx)
    print(f"  k={kk}: 重构误差 ||X - X_k||_F = {err:.6f}")

print("\n>>> k 增大误差单调下降; k=n 时完全重建。")
print(">>> 保留前 k 个 = 在'最小二乘'意义下能做到的最好压缩（SVD 的经典结论）。")
