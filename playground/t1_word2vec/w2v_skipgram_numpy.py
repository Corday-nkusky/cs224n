"""
Word2Vec (Skip-gram + Negative Sampling) —— 纯 numpy 最小实现
依赖: numpy (无 torch / gensim / 任何第三方)

运行:
    python w2v_skipgram_numpy.py

============================================================
全局符号约定 (四份文档全文统一)
============================================================
    V    : 词表大小 (vocab size)
    D    : 词向量维度 (embedding dim)
    C    : 上下文窗口"半长" (window), 真实窗口宽度 = 2C
    K    : 每个正样本配的负样本个数
    T    : 语料总 token 数
    B    : batch size (本实现为纯在线 SGD, B = 1)
    L    : 句子/序列长度

    W_in  : shape (V, D) —— 中心词矩阵,  第 w 行记作 v_w
    W_out : shape (V, D) —— 上下文词矩阵, 第 w 行记作 u_w
    score : s = u_o . v_c  (标量, 内积)
============================================================
"""

import collections
import numpy as np

SEED = 42
rng = np.random.default_rng(SEED)

# ---------------------------------------------------------
# 超参
# ---------------------------------------------------------
D = 32          # 词向量维度
C = 2           # 窗口半长 -> 左右各看 2 个词
K = 5           # 负样本个数
LR0, LR1 = 0.025, 0.0001  # 学习率: 线性衰减 0.025 -> 0.0001
#   ↑ 0.025 不是随手取的: 它是原版 word2vec.c / gensim 对 skip-gram 的默认 alpha。
#     实测过 lr=0.1: 参数范数会指数发散 (‖W‖ 从 1e1 涨到 1e10, loss 爆到 1e47), 不是收敛慢, 是炸。
#     见 04 号文档"踩坑点"。
EPOCHS = 5
#  ↑ 别贪 epoch。实测: 同一语料跑到 491200 步(20 epoch)时, loss 反而从 2.76 涨到 8.0e5,
#    ‖W_in‖ 从 ~20 涨到 425 —— 小语料上"正负样本梯度拉锯"会让范数无界增长。
#    详见 04 号文档踩坑点 #3。

# 背景噪声词: 让语料的共现关系变"稀疏", 更接近真实语料的统计结构
NOISE_WORDS = ["river", "stone", "cloud", "engine", "market", "signal", "copper", "forest",
               "engineer", "harbor", "candle", "mirror", "plaza", "tunnel", "cotton",
               "ladder", "orchid", "compass", "velvet", "granite", "meadow", "lantern",
               "anchor", "puzzle", "carpet", "falcon", "marble", "pencil", "rocket", "violin"]
REPEAT = 20            # 主题句重复次数
N_NOISE_SENTS = 300    # 噪声句条数
NEG_POWER = 0.75         # 负采样分布指数: P_n(w) ∝ f(w)^0.75
TABLE_SIZE = 1_000_000   # 负采样查表长度 (原版 C 实现是 1e8, 这里为省内存缩小)


# =========================================================
# 1. 造语料: 用模板合成的小语料, 故意埋入 "性别 / 王室 / 首都" 三种规律
#    (真实场景请用大语料; 小语料只是为了让闭环可复现)
# =========================================================
def build_corpus():
    rng_corpus = np.random.default_rng(2024)  # 独立随机源, 保证语料可复现
    royal2gender = {"king": "man", "queen": "woman", "prince": "boy", "princess": "girl"}
    people = ["man", "woman", "boy", "girl"]
    caps = [("paris", "france"), ("tokyo", "japan"), ("beijing", "china")]

    sents = []
    for _ in range(REPEAT):                   # 重复若干遍, 凑够训练量
        for r, g in royal2gender.items():
            sents += [
                f"the {r} rules the kingdom",
                f"the {r} wears a golden crown",
                f"the {r} lives in a big palace",
                f"the {r} sits on the throne",
            ]
            # 关键: 把"性别"锚进王室词。重复 4 次 = 给这条信号加权重,
            # 否则性别只占 king 上下文的 1/5, 类比会算错 (实测 top1 会是 prince)
            sents += [f"the {r} is a {g}"] * 4
        for p in people:                      # 平民词共享一套上下文
            sents += [
                f"the {p} walks in the park",
                f"the {p} eats a red apple",
                f"the {p} reads a long book",
            ]
        for city, country in caps:
            sents += [f"{city} is the capital of {country}"] * 3
    # 噪声句: 随机拼 5 个背景词。作用是稀释"万物共现"的密度 ——
    # 没有它的话, 39 个词的词表里任意两词几乎都共现过, 正负样本梯度互相打架。
    for _ in range(N_NOISE_SENTS):
        sents.append(" ".join(rng_corpus.choice(NOISE_WORDS, size=5, replace=False)))
    return [s.split() for s in sents]


# =========================================================
# 2. 建词表 + 负采样表
# =========================================================
def build_vocab(corpus):
    counter = collections.Counter(w for sent in corpus for w in sent)
    words = sorted(counter)                   # 按字典序, 保证可复现
    w2i = {w: i for i, w in enumerate(words)}
    i2w = {i: w for i, w in enumerate(words)}
    return w2i, i2w, counter


def build_neg_table(w2i, counter):
    """P_n(w) ∝ f(w)^0.75 —— 比频次平滑: 抬高罕见词, 压低高频词"""
    V = len(w2i)
    freq = np.array([counter[w] for w in w2i], dtype=np.float64)
    probs = freq ** NEG_POWER
    probs /= probs.sum()
    cum = np.cumsum(probs)                    # 前缀和 -> O(log V) 采样
    u = rng.random(TABLE_SIZE)
    table = np.searchsorted(cum, u).astype(np.int32)
    return table                              # shape: (TABLE_SIZE,)


# =========================================================
# 3. 数值稳定的 sigmoid / log-sigmoid
# =========================================================
def sigmoid(x):
    """分段计算, 避免 exp(大正数) 溢出。x: 标量或 ndarray"""
    x = np.asarray(x, dtype=np.float64)
    out = np.empty_like(x)
    mask = x >= 0
    out[mask] = 1.0 / (1.0 + np.exp(-x[mask]))     # x>=0: 走 -x 分支, exp 自变量恒为负
    ex = np.exp(x[~mask])
    out[~mask] = ex / (1.0 + ex)                   # x<0 : exp(x) ∈ (0,1), 安全
    return out if out.ndim else float(out)


def log_sigmoid(x):
    """log σ(x) = -log(1+e^{-x}) = -logaddexp(0, -x)。numpy 内建, 天然防溢出"""
    return -np.logaddexp(0.0, -np.asarray(x, dtype=np.float64))


# =========================================================
# 4. 训练: 在线 SGD, 每次只更新涉及到的那几行 (稀疏更新是 word2vec 快的关键之一)
# =========================================================
def train(corpus, w2i, table):
    V = len(w2i)
    # 原版 word2vec.c: W_in 随机初始化, W_out 全零 (见 03 号文档"为什么全零也能训")
    W_in = (rng.random((V, D)) - 0.5) / D              # shape: (V, D)
    W_out = np.zeros((V, D))                           # shape: (V, D)

    # 预先展开所有 (中心词下标 in 语料, 上下文词) 训练对
    ids = [[w2i[w] for w in sent] for sent in corpus]
    pairs = []
    for sent in ids:
        for i, c in enumerate(sent):
            lo, hi = max(0, i - C), min(len(sent), i + C + 1)
            for j in range(lo, hi):
                if j != i:
                    pairs.append((c, sent[j]))
    total_steps = len(pairs) * EPOCHS
    print(f"[corpus] {sum(len(s) for s in ids)} tokens | V={V} | D={D} | "
          f"pairs/epoch={len(pairs)} | total_updates={total_steps}")

    step, loss_acc, loss_cnt = 0, 0.0, 0
    for ep in range(EPOCHS):
        order = rng.permutation(len(pairs))            # 每个 epoch 打乱
        for idx in order:
            c, o = pairs[idx]
            lr = LR0 + (LR1 - LR0) * (step / total_steps)   # 学习率线性衰减

            # ---- 采样 K 个负样本 ----
            neg = table[rng.integers(0, TABLE_SIZE, size=K)]  # shape: (K,)

            v_c = W_in[c]                              # (D,)
            u_o = W_out[o]                             # (D,)
            U_n = W_out[neg]                           # (K, D)

            # ---- 前向: 只算 (1+K) 个内积, 与词表大小 V 无关 ----
            s_pos = float(u_o @ v_c)                   # 标量
            s_neg = U_n @ v_c                          # (K,)
            loss = -log_sigmoid(s_pos) - log_sigmoid(-s_neg).sum()
            loss_acc, loss_cnt, step = loss_acc + loss, loss_cnt + 1, step + 1

            # ---- 反向: 二分类交叉熵对 score 的梯度 = (σ(s) - label) ----
            g_pos = sigmoid(s_pos) - 1.0               # label = 1
            g_neg = sigmoid(s_neg)                     # label = 0, shape: (K,)

            grad_v_c = g_pos * u_o + g_neg @ U_n       # (D,)
            W_in[c] -= lr * grad_v_c
            W_out[o] -= lr * g_pos * v_c               # (D,)
            W_out[neg] -= lr * np.outer(g_neg, v_c)    # (K, D)

            if step % (total_steps // 10) == 0:
                print(f"  step {step:>7} / {total_steps} | lr={lr:.4f} | "
                      f"avg_loss={loss_acc / loss_cnt:.4f}")
                loss_acc, loss_cnt = 0.0, 0

    return W_in, W_out


# =========================================================
# 5. 评估: 余弦相似 / 词语类比 (取 W_in 作为最终词向量)
# =========================================================
def most_similar(W, w2i, i2w, word, topn=5):
    if word not in w2i:
        return f"'{word}' not in vocab"
    v = W[w2i[word]]
    norms = np.linalg.norm(W, axis=1) + 1e-12
    sims = (W @ v) / (norms * (np.linalg.norm(v) + 1e-12))
    sims[w2i[word]] = -np.inf                          # 排除自己
    top = np.argsort(-sims)[:topn]
    return [(i2w[i], round(float(sims[i]), 3)) for i in top]


def analogy(W, w2i, i2w, a, b, c, topn=3):
    """a - b + c = ?   例: king - man + woman = queen"""
    for w in (a, b, c):
        if w not in w2i:
            return f"'{w}' not in vocab"
    q = W[w2i[a]] - W[w2i[b]] + W[w2i[c]]
    norms = np.linalg.norm(W, axis=1) + 1e-12
    sims = (W @ q) / (norms * (np.linalg.norm(q) + 1e-12))
    for w in (a, b, c):
        sims[w2i[w]] = -np.inf                         # 排除题目里的词
    top = np.argsort(-sims)[:topn]
    return [(i2w[i], round(float(sims[i]), 3)) for i in top]


# =========================================================
# main
# =========================================================
if __name__ == "__main__":
    corpus = build_corpus()
    w2i, i2w, counter = build_vocab(corpus)
    table = build_neg_table(w2i, counter)
    W_in, W_out = train(corpus, w2i, table)

    V = len(w2i)
    print("\n[cost per update]")
    print(f"  NEG (this impl) : (1+K)*D = {(1 + K) * D} mult-add")
    print(f"  full softmax    : V*D     = {V * D} mult-add   (本例 V={V})")
    print(f"  if V=100000     : {100000 * D} vs {(1 + K) * D} "
          f"-> ~{100000 * D / ((1 + K) * D):.0f}x")

    print("\n[most_similar]  (using W_in)")
    for w in ["king", "queen", "man", "paris"]:
        print(f"  {w:>8} -> {most_similar(W_in, w2i, i2w, w)}")

    print("\n[analogy]")
    print(f"  king   - man   + woman = ?  -> {analogy(W_in, w2i, i2w, 'king', 'man', 'woman')}")
    print(f"  queen  - woman + man   = ?  -> {analogy(W_in, w2i, i2w, 'queen', 'woman', 'man')}")
    print(f"  paris  - france+ japan = ?  -> {analogy(W_in, w2i, i2w, 'paris', 'france', 'japan')}")
    print(f"  tokyo  - japan + china = ?  -> {analogy(W_in, w2i, i2w, 'tokyo', 'japan', 'china')}")
