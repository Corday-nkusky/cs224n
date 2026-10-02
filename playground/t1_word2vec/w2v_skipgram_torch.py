"""
Word2Vec (Skip-gram + Negative Sampling) —— PyTorch 版
用途: 看清楚"张量维度"是怎么流动的。numpy 版是逐样本的在线 SGD, 这里是 batch 版。

运行 (本机 torch 装在 conda 的 pytorch_env 里, base 环境没有 torch):
    D:/code/anaconda/envs/pytorch_env/python.exe w2v_skipgram_torch.py

============================================================
维度约定 (与 numpy 版、与四份文档完全一致)
============================================================
    V: 词表大小   D: 词向量维度   C: 窗口半长   K: 负样本数   B: batch size   N: 训练对总数

    center : (B,)         中心词下标
    ctx    : (B,)         上下文词(正样本)下标
    neg    : (B, K)       负样本下标
    W_in(center)  -> (B, D)      记作 v_c
    W_out(ctx)    -> (B, D)      记作 u_o
    W_out(neg)    -> (B, K, D)   记作 U_neg
    s_pos  : (B,)         = <v_c, u_o>
    s_neg  : (B, K)       = <v_c, U_neg[k]>
============================================================
"""
import sys
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from w2v_skipgram_numpy import build_corpus, build_vocab  # 复用同一份语料/词表

D, C, K, B = 32, 2, 5, 512

# ⚠️ 这里的学习率不能照抄在线版(numpy 版)的 0.025。
#    原因: loss 对 batch 取了 .mean(), 梯度被除以 B=512, 等效步长只剩 0.025/512 ≈ 4.9e-5。
#    实测: lr=0.025 时 loss 全程卡在 4.1589 (= (1+K)*ln2, 即参数完全没动)。
#    实测 lr: 0.025 卡死不动 / 3.0 收敛不足 / 6.0 正常(loss 2.87->1.57) / 25.0 直接 nan 发散。
#    可用命令行覆盖: python w2v_skipgram_torch.py <lr0> <lr1> <epochs>
LR0 = float(sys.argv[1]) if len(sys.argv) > 1 else 6.0
LR1 = float(sys.argv[2]) if len(sys.argv) > 2 else 0.05
EPOCHS = int(sys.argv[3]) if len(sys.argv) > 3 else 20
NEG_POWER = 0.75
TABLE_SIZE = 1_000_000
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


class SkipGramNEG(nn.Module):
    """两套 Embedding: W_in 存"中心词向量 v", W_out 存"上下文向量 u"。
    问: 为什么不能用一套? 答: 同一个词当中心词和当上下文词时, 角色不对称,
        用一套会让 <v_w, v_w> 被迫变大(自己和自己共现), 训练目标退化。"""

    def __init__(self, V, D):
        super().__init__()
        # sparse=True: 只回传被查到的那几行梯度 —— 对应原版 word2vec 的"稀疏更新"
        self.W_in = nn.Embedding(V, D, sparse=True)
        self.W_out = nn.Embedding(V, D, sparse=True)
        nn.init.uniform_(self.W_in.weight, -0.5 / D, 0.5 / D)   # 对齐原版 C 代码
        nn.init.zeros_(self.W_out.weight)                        # 原版 syn1neg 全零

    def forward(self, center, ctx, neg):
        v_c = self.W_in(center)                       # (B, D)
        u_o = self.W_out(ctx)                         # (B, D)
        U_n = self.W_out(neg)                         # (B, K, D)

        s_pos = (v_c * u_o).sum(dim=1)                # (B,)   逐行内积
        # bmm: (B, K, D) x (B, D, 1) -> (B, K, 1) -> squeeze -> (B, K)
        s_neg = torch.bmm(U_n, v_c.unsqueeze(2)).squeeze(2)
        return s_pos, s_neg


def make_pairs(ids, C):
    pairs = []
    for sent in ids:
        for i, c in enumerate(sent):
            for j in range(max(0, i - C), min(len(sent), i + C + 1)):
                if j != i:
                    pairs.append((c, sent[j]))
    return np.array(pairs, dtype=np.int64)             # shape: (N, 2)


def main():
    torch.manual_seed(42)
    rng = np.random.default_rng(42)
    print(f"[device] {DEVICE} | torch {torch.__version__}")

    corpus = build_corpus()
    w2i, i2w, counter = build_vocab(corpus)
    V = len(w2i)
    ids = [[w2i[w] for w in s] for s in corpus]
    pairs = make_pairs(ids, C)                          # (N, 2)
    print(f"[corpus] V={V} | pairs={len(pairs)} | batch={B}")

    # 负采样表: P_n(w) ∝ f(w)^0.75
    freq = np.array([counter[w] for w in w2i], dtype=np.float64)
    probs = freq ** NEG_POWER
    probs /= probs.sum()
    table_np = np.searchsorted(np.cumsum(probs), rng.random(TABLE_SIZE)).astype(np.int64)
    table = torch.from_numpy(table_np).to(DEVICE)       # (TABLE_SIZE,)

    model = SkipGramNEG(V, D).to(DEVICE)
    opt = torch.optim.SGD(model.parameters(), lr=LR0)   # 注意: sparse 梯度只认 SGD/SparseAdam

    center_all = torch.from_numpy(pairs[:, 0]).to(DEVICE)   # (N,)
    ctx_all = torch.from_numpy(pairs[:, 1]).to(DEVICE)      # (N,)

    n_batches = int(np.ceil(len(pairs) / B))
    total_batches = n_batches * EPOCHS
    done, running = 0, 0.0

    for ep in range(EPOCHS):
        order = torch.randperm(len(pairs), device=DEVICE)
        # 学习率线性衰减 —— 必须手动改 param_group, PyTorch 不会自己衰减
        lr = LR0 + (LR1 - LR0) * (done / total_batches)
        for g in opt.param_groups:
            g["lr"] = lr

        for b in range(n_batches):
            idx = order[b * B:(b + 1) * B]                # (B',)
            center, ctx = center_all[idx], ctx_all[idx]   # 各 (B',)
            # 负样本: 先在表里随机取位置, 再查表 -> (B', K)
            neg = table[torch.randint(0, TABLE_SIZE, (len(idx), K), device=DEVICE)]

            s_pos, s_neg = model(center, ctx, neg)        # (B',), (B', K)
            # 每个样本的总 loss = -log σ(s_pos) - Σ_k log σ(-s_neg_k), 再对 batch 取均值
            loss = -(F.logsigmoid(s_pos) + F.logsigmoid(-s_neg).sum(dim=1)).mean()

            opt.zero_grad()
            loss.backward()
            opt.step()

            running += loss.item()
            done += 1
            if done % (total_batches // 10) == 0:
                print(f"  batch {done:>4}/{total_batches} | lr={lr:.4f} | loss={running / (total_batches // 10):.4f}")
                running = 0.0

    W = model.W_in.weight.detach().cpu().numpy()          # (V, D) 取 W_in 当词向量

    def top(q, excl, k=3):
        n = np.linalg.norm(W, axis=1) + 1e-12
        s = (W @ q) / (n * (np.linalg.norm(q) + 1e-12))
        for w in excl:
            s[w2i[w]] = -np.inf
        t = np.argsort(-s)[:k]
        return [(i2w[i], round(float(s[i]), 3)) for i in t]

    print("\n[most_similar]")
    for w in ["king", "paris"]:
        print(f"  {w:>6} -> {top(W[w2i[w]], [w])}")
    print("[analogy]")
    print(f"  king - man + woman    = {top(W[w2i['king']] - W[w2i['man']] + W[w2i['woman']], ['king','man','woman'])}")
    print(f"  tokyo - japan + china = {top(W[w2i['tokyo']] - W[w2i['japan']] + W[w2i['china']], ['tokyo','japan','china'])}")

    # 顺手验证一个文档的踩坑点: Adam + sparse 梯度会怎样
    try:
        torch.optim.Adam(model.parameters(), lr=1e-3)
        m2 = SkipGramNEG(V, D)
        mb = m2.W_in(torch.tensor([0, 1]))
        mb.sum().backward()
        torch.optim.Adam(m2.parameters()).step()
        print("\n[sparse+Adam] 没报错")
    except RuntimeError as e:
        print(f"\n[sparse+Adam] RuntimeError: {str(e)[:110]}")


if __name__ == "__main__":
    main()
