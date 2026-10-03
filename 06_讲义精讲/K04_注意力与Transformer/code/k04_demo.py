"""
K04 demo —— 注意力与 Transformer 的机制验证

只需 numpy + torch（pytorch_env 里都有）。几秒出结果，全部确定性（固定 seed）。
运行（cwd 必须是本目录）：
    D:/code/anaconda/envs/pytorch_env/python.exe -B code/k04_demo.py

输出与 06_讲义精讲/K04_注意力与Transformer/03_动手验证.md 逐节对应。
"""
import numpy as np

np.set_printoptions(precision=6, suppress=True)


def hdr(t):
    print("\n" + "=" * 68)
    print(t)
    print("=" * 68)


def softmax_rows(S):
    """按最后一维做数值稳定的 softmax；-inf 会得到精确的 0。"""
    S = np.asarray(S, dtype=float)
    m = S.max(axis=-1, keepdims=True)
    m = np.where(np.isfinite(m), m, 0.0)      # 整行 -inf 时兜底（本 demo 不会出现）
    e = np.exp(S - m)
    return e / e.sum(axis=-1, keepdims=True)


# ======================================================================
# §1 scaled dot-product attention：手算对账
#     3 个 token，d_k = 4；scores = Q K^T / sqrt(d_k)；softmax；output = W V
# ======================================================================
hdr("§1 scaled dot-product attention：3 个 token、d_k=4 的手算对账")
Q = np.array([[1.0, 0.0, 1.0, 0.0],
              [0.0, 1.0, 0.0, 1.0],
              [1.0, 1.0, 0.0, 0.0]])
K = np.array([[1.0, 0.0, 0.0, 1.0],
              [0.0, 1.0, 1.0, 0.0],
              [1.0, 0.0, 1.0, 0.0]])
V = np.array([[1.0, 2.0, 3.0, 4.0],
              [5.0, 6.0, 7.0, 8.0],
              [9.0, 10.0, 11.0, 12.0]])
d_k = Q.shape[1]
scale = 1.0 / np.sqrt(d_k)

raw = Q @ K.T
scores = raw * scale
weights = softmax_rows(scores)
out = weights @ V

print("d_k =", d_k, "  scale = 1/sqrt(d_k) =", scale)
print("raw scores  Q@K^T =\n", raw)
print("scaled scores     =\n", scores)
print("softmax 权重 W (每行和为 1) =\n", weights)
print("每行和 =", weights.sum(axis=1), " (应为 [1 1 1])")
print("output = W @ V =\n", out)

# 逐步朴素实现（每个 query 单独走一遍）与矩阵实现对账
out_naive = np.zeros_like(out)
for i in range(len(Q)):
    s_i = np.array([Q[i] @ K[j] * scale for j in range(len(K))])
    w_i = softmax_rows(s_i)
    out_naive[i] = w_i @ V
print("矩阵实现 vs 逐 query 朴素实现  max|差| =", np.abs(out - out_naive).max())


# ======================================================================
# §2 为什么要除 sqrt(d_k)：d 越大，点积越大 → softmax 越尖 → 梯度越小
# ======================================================================
hdr("§2 为什么要除 sqrt(d_k)：点积方差随 d 增长、softmax 饱和")
rng = np.random.default_rng(0)
n_tok, n_try = 8, 64
for d in (4, 64, 512):
    std_raw, mp_raw, mp_scaled = [], [], []
    for _ in range(n_try):
        q = rng.normal(size=(n_tok, d))
        k = rng.normal(size=(n_tok, d))
        s = q @ k.T
        std_raw.append(s.std())                        # 未缩放：随 d 增长
        mp_raw.append(softmax_rows(s).max(axis=1).mean())            # 未缩放：越尖
        mp_scaled.append(softmax_rows(s / np.sqrt(d)).max(axis=1).mean())  # 缩放后拉回
    print(f"d_k={d:4d} | 未缩放 scores std≈{np.mean(std_raw):8.3f}"
          f" | 未缩放 softmax 最大权重均值≈{np.mean(mp_raw):.4f}"
          f" | 除以 sqrt(d_k) 后≈{np.mean(mp_scaled):.4f}")
print("→ 未缩放时 std≈sqrt(d_k)；softmax 最大权重趋近 1（饱和），梯度趋近 0。除 sqrt(d_k) 把 std 拉回 ~1。")


# ======================================================================
# §3 causal mask：必须在 softmax 之前用 -inf 填（上三角权重恰为 0）
# ======================================================================
hdr("§3 causal mask：-inf 在 softmax 之前填")
n = 4
S = np.array([[1.0, 2.0, 3.0, 4.0],
              [0.5, 1.0, 1.5, 2.0],
              [-1.0, 0.0, 1.0, 2.0],
              [2.0, 2.0, 2.0, 2.0]])
future = np.triu(np.ones((n, n), dtype=bool), k=1)     # j > i 的位置
print("原始 scores =\n", S)
print("future 掩码 (j>i) =\n", future.astype(int))

S_masked = np.where(future, -np.inf, S)               # softmax 之前填 -inf
W_ok = softmax_rows(S_masked)
print("\n先 mask(-inf) 再 softmax → 权重 =\n", W_ok)
print("上三角是否全为精确 0.0 :", bool((np.triu(W_ok, k=1) == 0.0).all()))
print("每行和 =", W_ok.sum(axis=1), " (仍为 [1 1 1])")

# 错误做法：先 softmax 再把上三角清零
W_bad = softmax_rows(S)
W_bad = np.where(future, 0.0, W_bad)
print("\n错误做法：先 softmax 再清零 → 权重 =\n", W_bad)
print("每行和 =", W_bad.sum(axis=1), " (行和 < 1，输出被整体缩小，语义被破坏)")


# ======================================================================
# §4 multi-head：分头 / 合并的形状（对照 A3 的 TEST_CONFIG）
#     A3 TEST_CONFIG: d_model=48, n_heads=2 → d_attention=24
#     snapshot 实测: attention_input/output 均为 (2,16,48)
# ======================================================================
hdr("§4 multi-head 分头与合并的形状（d_model=48, n_heads=2, d_head=24）")
import torch
torch.manual_seed(0)

B, T, d_model, n_heads = 2, 16, 48, 2
d_head = d_model // n_heads
x = torch.randn(B, T, d_model)

Wq = torch.randn(d_model, d_model) * 0.1               # 等价 nn.Linear(d_model, d_model).weight
xq = x @ Wq.t()                                        # (B,T,48)
print("x  {}  →  xq = x @ Wq^T  {}".format(tuple(x.shape), tuple(xq.shape)))

xq_h = xq.view(B, T, n_heads, d_head).transpose(1, 2)  # (B,h,T,d_head)
print("分头 reshape (B,T,(h,d)) → transpose → ", tuple(xq_h.shape))
scores = xq_h @ xq_h.transpose(-1, -2) / np.sqrt(d_head)
print("scores = q k^T / sqrt(d_head) =", tuple(scores.shape), "  (每个头一张 n×n 表)")
W = torch.softmax(scores, dim=-1)
head_out = W @ xq_h                                    # (B,h,T,d_head)
print("每个头的输出 = W @ v =", tuple(head_out.shape))

merged = head_out.transpose(1, 2).reshape(B, T, d_model)
print("合并 transpose→reshape =", tuple(merged.shape))
print("d_head =", d_head, " d_model/n_heads =", d_model // n_heads)
print("合并后前 24 维 == 第 0 个头的输出 ?  max|差| =",
      (merged[:, :, :d_head] - head_out[:, 0]).abs().max().item())
print("head 轴当 batch 轴的代价：score/flop 与单头相同量级，只是分成 h 份并行算")
print("拼接顺序敏感：第 ℓ 个头占用输出维 [ℓ·d_head, (ℓ+1)·d_head)，与 Wq 的列分块一致")


# ======================================================================
# §5 positional encoding：sin/cos 数值 + 无位置时注意力置换不变
# ======================================================================
hdr("§5 位置编码：sin/cos 数值；无位置时 self-attention 看不出词序")
d_pos, n_pos = 8, 4
pos = np.arange(n_pos)[:, None]
i = np.arange(0, d_pos, 2)[None, :]
denom = 10000.0 ** (i / d_pos)
PE = np.zeros((n_pos, d_pos))
PE[:, 0::2] = np.sin(pos / denom)
PE[:, 1::2] = np.cos(pos / denom)
print(f"sinusoidal PE，d={d_pos}，前 {n_pos} 个位置 =\n", PE)
print("各行范数 =", np.round(np.linalg.norm(PE, axis=1), 6), " (每行独一无二 → 能编码顺序)")
pair_l1 = np.abs(PE[:, None, :] - PE[None, :, :]).sum(-1)
off_diag_min = pair_l1[~np.eye(n_pos, dtype=bool)].min()
print("任意两行之间的最小 L1 距离 =", round(off_diag_min, 6), " (>0 → 每行都不同)")

# 无位置编码的 self-attention 对“换序”不敏感
rng = np.random.default_rng(3)
X = rng.normal(size=(n_pos, d_pos))
Wq2, Wk2, Wv2 = (rng.normal(size=(d_pos, d_pos)) * 0.3 for _ in range(3))


def attn_no_pos(Xin):
    q, k, v = Xin @ Wq2, Xin @ Wk2, Xin @ Wv2
    return softmax_rows(q @ k.T / np.sqrt(d_pos)) @ v


perm = np.array([2, 0, 3, 1])
print("\n无 PE：out(PX) 与 P·out(X)  max|差| =",
      np.abs(attn_no_pos(X[perm]) - attn_no_pos(X)[perm]).max(), " (≈0 → 注意力本身排列等变)")
print("→ 只靠 self-attention，'Zuko made tea' 与 'tea made Zuko' 在它眼里只差一个重排，学不到顺序")

# 加上 PE（位置绑在“槽位”上）后，换词序结果就变了
with_pos = attn_no_pos(X + PE)
with_pos_perm = attn_no_pos(X[perm] + PE)
print("加 PE：out(PX+PE) 与 P·out(X+PE)  max|差| =",
      np.abs(with_pos_perm - with_pos[perm]).max(), " (≠0 → 顺序信息注入了)")
print("注：A3 用的是【可学习】位置嵌入 nn.Embedding(context_length, d_model)，不是这里的 sin/cos")


# ======================================================================
# §6 O(n^2)：输出长度 n（序列长度）而非模型宽度
# ======================================================================
hdr("§6 自注意力的 O(n^2)：与序列长度平方成正比（确定性计数，不含计时）")
d_c = 64
print(f"{'n':>7} | {'score 元素 n^2':>16} | {'注意力乘加 n^2·d':>18} | {'RNN 全程 n·d^2':>16} | 谁更贵")
for n_len in (16, 128, 1000, 50000):
    attn_elems = n_len * n_len
    attn_flops = n_len * n_len * d_c
    rnn_flops = n_len * d_c * d_c
    who = "注意力" if attn_flops > rnn_flops else "RNN"
    print(f"{n_len:7d} | {attn_elems:16,} | {attn_flops:18,} | {rnn_flops:16,} | {who}")
print("→ n 翻倍，score 矩阵元素数 ×4（O(n^2)）；d 固定时 RNN 是 O(n) 串行、注意力是 O(n^2) 并行。")
print("→ slides p70 担心的是 n≥50,000 的长文档：此时 score 矩阵有 2.5e9 个元素。")