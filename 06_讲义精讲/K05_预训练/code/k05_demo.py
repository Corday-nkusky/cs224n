"""
K05 demo —— 预训练：子词 BPE / CLM vs MLM / 静态 vs 上下文相关

只依赖 numpy + torch（PyTorch 已装）。不下载任何预训练模型。
运行（cwd 在 06_讲义精讲/K05_预训练 目录下）：
    D:/code/anaconda/envs/pytorch_env/python.exe code/k05_demo.py

输出存 logs/k05_demo_out.txt，与 03_动手验证.md 逐节对应。
全部随机性由 seed 固定；脚本几秒跑完。
"""
import math
from collections import Counter

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

torch.manual_seed(0)
np.random.seed(0)
np.set_printoptions(precision=6, suppress=True)


def hdr(t):
    print("\n" + "=" * 64)
    print(t)
    print("=" * 64)


# ======================================================================
# §1 子词与 BPE：词表怎么从"字符"逐次长出"词块"
#    slides p6：Byte-pair encoding 算法；p7：常见词留在词表、稀有词被切成子词
# ======================================================================
hdr("§1 子词与 BPE：字符起步，按最高频相邻对逐次合并")

word_freqs = {
    ("l", "o", "w", "</w>"): 5,
    ("l", "o", "w", "e", "r", "</w>"): 2,
    ("n", "e", "w", "e", "s", "t", "</w>"): 6,
    ("w", "i", "d", "e", "s", "t", "</w>"): 3,
}


def get_stats(vocab):
    pairs = Counter()
    for word, freq in vocab.items():
        for i in range(len(word) - 1):
            pairs[(word[i], word[i + 1])] += freq
    return pairs


def merge_pair(pair, vocab):
    out = {}
    for word, freq in vocab.items():
        new_word, i = [], 0
        while i < len(word):
            if i < len(word) - 1 and (word[i], word[i + 1]) == pair:
                new_word.append(word[i] + word[i + 1])
                i += 2
            else:
                new_word.append(word[i])
                i += 1
        out[tuple(new_word)] = freq
    return out


vocab = dict(word_freqs)
init_syms = sorted({c for w in vocab for c in w})
print("初始词表（字符 + 词尾符号）：", init_syms)
print("初始词表大小：", len(init_syms))

merges = []
for step in range(1, 11):
    stats = get_stats(vocab)
    pair = max(stats, key=lambda p: stats[p])       # 频次最高；并列取先遇到者（确定性）
    cnt = stats[pair]
    vocab = merge_pair(pair, vocab)
    merges.append(pair)
    syms = sorted({c for w in vocab for c in w})
    print(f"第 {step:2d} 次合并：{pair[0]}+{pair[1]} -> {pair[0] + pair[1]}"
          f"（频次 {cnt}）  词表大小 -> {len(syms)}")


def tokenize(word, merges):
    symbols = list(word) + ["</w>"]
    for a, b in merges:
        i, new = 0, []
        while i < len(symbols):
            if i < len(symbols) - 1 and symbols[i] == a and symbols[i + 1] == b:
                new.append(a + b)
                i += 2
            else:
                new.append(symbols[i])
                i += 1
        symbols = new
    return symbols


final_syms = sorted({c for w in vocab for c in w})
print("\n最终词表大小：", len(final_syms))
print("词表内容：", final_syms)

print("\n用这套子词切词：")
for w in ["low", "lower", "newest", "widest", "lowest", "taaaasty"]:
    print(f"  {w:16s} -> {tokenize(w, merges)}")
print("→ 常见词整块保留（low / newest）；未见过的词退化成字符级的子词组合。")


# ======================================================================
# §2 同一语料，两种目标怎么构造：CLM（shift 一位） vs MLM（mask 15%）
#    slides p18(语言模型)、p26-27(BERT Masked LM)
# ======================================================================
hdr("§2 CLM 与 MLM 的构造：同一语料的两种'监督信号'")

subjects = ["cat", "dog", "fox", "owl"]
verb_objs = {
    "ate": ["fish", "bone", "mouse"],
    "sat": ["mat", "log"],
    "chased": ["mouse", "fox"],
    "saw": ["mat", "log", "bone"],
}
sent_tokens = []
for s in subjects:
    for v, objs in verb_objs.items():
        for o in objs:
            sent_tokens.append(["the", s, v, "the", o])   # 5 个 token

all_toks = sorted({t for sent in sent_tokens for t in sent})
vocab2 = ["<pad>", "<mask>"] + all_toks
V2 = len(vocab2)
PAD, MASK = 0, 1
ids2 = [[vocab2.index(t) for t in sent] for sent in sent_tokens]

n_sent, n_tok = len(sent_tokens), sum(len(s) for s in sent_tokens)
print(f"语料：{n_sent} 句，{n_tok} 个 token；词表 V = {V2}（含 <pad>/<mask>）")
print("示例句：", sent_tokens[0])

clm_slots = sum(len(s) - 1 for s in ids2)
print("\nCLM 构造（shift 一位）：")
print(f"  {sent_tokens[0]}")
print(f"  输入 = {sent_tokens[0][:-1]}")
print(f"  目标 = {sent_tokens[0][1:]}")
print(f"  每句 {len(sent_tokens[0]) - 1} 个预测位；全语料监督位 = {clm_slots} 个"
      f"（占 token 数 {clm_slots / n_tok:.0%}）")

rng_mlm = np.random.default_rng(0)
flat = [(si, ti) for si, s in enumerate(ids2) for ti in range(len(s))]
n_mask = int(round(len(flat) * 0.15))
chosen = set(rng_mlm.choice(len(flat), size=n_mask, replace=False).tolist())
counts = {"mask": 0, "random": 0, "keep": 0}
for idx in range(len(flat)):
    if idx in chosen:
        r = rng_mlm.random()
        if r < 0.8:
            counts["mask"] += 1
        elif r < 0.9:
            counts["random"] += 1
        else:
            counts["keep"] += 1

print("\nMLM 构造（mask 15%）：")
print(f"  选中 {n_mask} / {n_tok} = {n_mask / n_tok:.1%} 个 token 作为预测目标")
print(f"  80/10/10 实际落到：[MASK] {counts['mask']} 个，"
      f"随机替换 {counts['random']} 个，保持不变 {counts['keep']} 个")
print("  （BERT 只在被选中的位置算 loss；其余位置不算）")
print(f"\n对比：CLM 监督 {clm_slots} 位（每个词都当一次目标），"
      f"MLM 监督 {n_mask} 位 —— 同一份语料，监督信号数量差 {clm_slots / n_mask:.1f} 倍。")


# ======================================================================
# §3 实跑：受控对比——同一模型、同一批监督位，只改"看得见哪边"
#     §3 换用一份为实验专门构造的语料（见下方注释），与 §2 的语料不同。
# ======================================================================
hdr("§3 实跑：单向上下文 vs 双向上下文，重建难度差多少")

# 构造语料：句形 [s0, s1, nxt[z], z, s4]。第 2 个词 nxt[z] 只由它右边的 z 决定
# （nxt 是 8 元环上的双射）。于是：单向模型在第 2 位看不到 z，双向能看到。
cycle = [f"c{i}" for i in range(8)]
nxt = {cycle[i]: cycle[(i + 1) % 8] for i in range(8)}
S0 = ["s0", "s1", "s2", "s3"]
S1 = ["p0", "p1", "p2", "p3", "p4", "p5"]
S4 = ["e0", "e1", "e2", "e3"]
corpus3 = [[a, b, nxt[z], z, d] for a in S0 for b in S1 for z in cycle for d in S4]

vocab3 = ["<pad>", "<mask>"] + sorted({t for s in corpus3 for t in s})
V3 = len(vocab3)
ids3 = [[vocab3.index(t) for t in s] for s in corpus3]
print(f"受控语料：{len(corpus3)} 句，每句 5 个 token；词表 V = {V3}")
print("示例句：", corpus3[0], "（第 2 位 nxt[z] 由右边的 z 唯一决定，z 是随机的）")
print("→ 单边模型在第 2 位只能看到左边的 s0、s1（与 nxt[z] 无关）；双向能看到右边的 z。")

rng_split = np.random.default_rng(1)
order = rng_split.permutation(len(ids3))
tr_ids = [ids3[i] for i in sorted(order[:700].tolist())]
te_ids = [ids3[i] for i in sorted(order[700:].tolist())]
tr_pos = [(si, ti) for si, s in enumerate(tr_ids) for ti in range(len(s))]
te_pos = [(si, ti) for si, s in enumerate(te_ids) for ti in range(len(s))]
D = 16


def sample_positions(positions, frac, seed):
    rng = np.random.default_rng(seed)
    n = max(1, int(round(len(positions) * frac)))
    idx = rng.choice(len(positions), size=n, replace=False)
    return [positions[i] for i in sorted(idx.tolist())]


def build_bag(seqs, positions, mode):
    """mode='causal' 只看左边的词；mode='bidir' 看除目标自己以外的全部词。"""
    L = max(len(s) for s in seqs)
    X, MK, Y = [], [], []
    for si, ti in positions:
        row = seqs[si][:]
        mk = [p < ti for p in range(len(row))] if mode == "causal" \
            else [p != ti for p in range(len(row))]
        X.append(row + [PAD] * (L - len(row)))
        MK.append(mk + [False] * (L - len(mk)))
        Y.append(seqs[si][ti])
    return torch.tensor(X), torch.tensor(MK), torch.tensor(Y)


class BagLM(nn.Module):
    """把'可见上下文'的 embedding 求平均，再线性映射到词表 logits。"""
    def __init__(self, n_vocab, n_dim):
        super().__init__()
        self.emb = nn.Embedding(n_vocab, n_dim)
        self.fc = nn.Linear(n_dim, n_vocab)

    def forward(self, x, mk):
        e = self.emb(x)
        m = mk.unsqueeze(-1).float()
        pooled = (e * m).sum(1) / m.sum(1).clamp(min=1)
        return self.fc(pooled)


def train_bag(mode, positions_fn, epochs=500):
    torch.manual_seed(0)
    model = BagLM(V3, D)
    opt = torch.optim.Adam(model.parameters(), lr=0.01, weight_decay=1e-3)
    last = 0.0
    for ep in range(epochs):
        x, mk, y = build_bag(tr_ids, positions_fn(ep), mode)
        opt.zero_grad()
        loss = F.cross_entropy(model(x, mk), y)
        loss.backward()
        opt.step()
        last = loss.item()
    return model, last


def eval_bag(model, mode):
    x, mk, y = build_bag(te_ids, te_pos, mode)
    with torch.no_grad():
        return float(F.cross_entropy(model(x, mk), y, reduction="none").numpy().mean())


pos_15 = lambda ep: sample_positions(tr_pos, 0.15, seed=100 + ep)
pos_all = lambda ep: tr_pos

causal_m, causal_tr = train_bag("causal", pos_15)
bidir_m, bidir_tr = train_bag("bidir", pos_15)
causal_full_m, causal_full_tr = train_bag("causal", pos_all)

print(f"\n模型：同一个'袋装上下文 + 线性头'，d={D}，V={V3}，参数 "
      f"{sum(p.numel() for p in causal_m.parameters())}")
print(f"评估：测试集全部 {len(te_pos)} 个位置，各自用自己的可见上下文\n")
print(f"{'目标':<34}{'训练NLL':>10}{'测试NLL':>10}{'测试困惑度':>12}")
results = {}
for name, m, mode, tr in [
    ("单向/因果(只看左边), 监督15%", causal_m, "causal", causal_tr),
    ("双向(看除自己外全部), 监督15%", bidir_m, "bidir", bidir_tr),
    ("单向/因果(只看左边), 监督100%", causal_full_m, "causal", causal_full_tr),
]:
    te = eval_bag(m, mode)
    results[name] = te
    print(f"{name:<32}{tr:>10.4f}{te:>10.4f}{math.exp(te):>12.4f}")
c1, c2, c3 = results.values()
print(f"\n随机基线 NLL = ln(V) = {math.log(V3):.4f}，困惑度 = V = {V3}")
print("（NLL = 交叉熵 = 负对数似然；困惑度 = exp(NLL)。越小 = 重建越容易。）")
print(f"→ 第 1 行 vs 第 2 行：同一模型、同一批 15% 监督位，只把可见上下文从'左边'")
print(f"   换成'两侧' —— 测试 NLL 从 {c1:.4f} 降到 {c2:.4f}。双向上下文让重建更容易。")
print(f"→ 第 1 行 vs 第 3 行：监督位从 15% 提到 100%，几乎不变（{c1:.4f} vs {c3:.4f}）——")
print("   因为动态 mask 每轮重采样，15% 长期也能覆盖所有位置。方向才是关键差别。")
print("→ 这正是 CLM 与 MLM 的核心差别：CLM 监督密、只看左边，但能生成；")
print("   MLM 监督稀（15%）、看两侧，擅长表示，却不能直接生成。")


# ======================================================================
# §4 静态 vs 上下文相关：同一个词在两种语境下
#    slides p9："I record the record"；p10-11：词向量不随句子变 vs 整模型预训练
# ======================================================================
hdr("§4 静态 vs 上下文相关：同一个词，两种语境")

# (a) 向量层面（玩具：随机 embedding + 邻词均值当"上下文表示"）
rng_ctx = np.random.default_rng(7)
mini_vocab = ["i", "record", "the", "song", "is", "broken"]
emb = {w: rng_ctx.normal(size=8) for w in mini_vocab}
S1 = ["i", "record", "the", "song"]      # record 作动词
S2 = ["the", "record", "is", "broken"]   # record 作名词


def cos(a, b):
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))


def contextual_rep(word, sent):
    return np.mean([emb[w] for w in sent if w != word], axis=0)


st = emb["record"]
ct1, ct2 = contextual_rep("record", S1), contextual_rep("record", S2)
print("两句：", " ".join(S1), " / ", " ".join(S2))
print(f"\n静态表示：两句里完全相同  cos = {cos(st, st):.4f}  L2距离 = {np.linalg.norm(st - st):.4f}")
print(f"上下文表示：cos(S1, S2) = {cos(ct1, ct2):.4f}  L2距离 = {np.linalg.norm(ct1 - ct2):.4f}")
print("→ 静态表示对同一词只有一个向量（K01 的一词一义）；上下文表示随句子改变。")

# (b) 预测分布：用 §3 里"监督 100% 的单向模型"看下一个词
print("\n用 §3 训练好的单向模型看'同一个位置的预测分布'：")


def next_word_dist(ctx_tokens):
    L = 5
    row = [vocab3.index(w) for w in ctx_tokens]
    X = torch.tensor([row + [PAD] * (L - len(row))])
    MK = torch.tensor([[True] * len(row) + [False] * (L - len(row))])
    with torch.no_grad():
        return F.softmax(causal_full_m(X, MK), dim=-1)[0].numpy()


for ctx in [["p0", "c1"], ["p0", "c2"]]:
    p = next_word_dist(ctx)
    top = np.argsort(-p)[:3]
    print(f"  上下文 {ctx} -> 下一个词 top3: "
          + ", ".join(f"{vocab3[i]}({p[i]:.3f})" for i in top))
print("→ 左边的词不同，下一个词的分布就不同；这就是'上下文相关'在预测层面的样子。")
print("→ 静态词向量把同一个词的位置压成同一个向量，产不出这种区分。")