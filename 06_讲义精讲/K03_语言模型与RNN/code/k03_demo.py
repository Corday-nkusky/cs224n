"""
K03 demo —— 语言模型与 RNN 的机制验证

只需 numpy；torch 用于 §2 的 autograd 对账（已装，缺失时自动跳过）。
运行（cwd = 06_讲义精讲/K03_语言模型与RNN）：
    D:/code/anaconda/envs/pytorch_env/python.exe code/k03_demo.py

输出与 06_讲义精讲/K03_语言模型与RNN/03_动手验证.md 逐节对应。
"""
import numpy as np

np.set_printoptions(precision=6, suppress=True)


def hdr(t):
    print("\n" + "=" * 66)
    print(t)
    print("=" * 66)


def softmax(z):
    z = z - z.max()                       # 数值稳定
    e = np.exp(z)
    return e / e.sum()


def numeric_grad(f, arr, h=1e-5):
    """中心差分：逐元素 (f(x+h)-f(x-h))/(2h)"""
    g = np.zeros_like(arr)
    it = np.nditer(arr, flags=['multi_index'])
    while not it.finished:
        idx = it.multi_index
        old = arr[idx]
        arr[idx] = old + h; fp = f(arr)
        arr[idx] = old - h; fm = f(arr)
        arr[idx] = old
        g[idx] = (fp - fm) / (2 * h)
        it.iternext()
    return g


# ======================================================================
# §1 手写 vanilla RNN 前向（numpy），并在 §2 用同一网络做 BPTT
#     h_t = tanh(W_hh h_{t-1} + W_xh x_t + b_h)
#     logits_t = W_hy h_t + b_y
# ======================================================================
hdr("§1 手写 vanilla RNN 前向")
rng = np.random.default_rng(0)
d_in, H, C, T = 3, 4, 3, 4
W_xh = rng.normal(size=(H, d_in)) * 0.5
W_hh = rng.normal(size=(H, H)) * 0.5
b_h = rng.normal(size=(H,)) * 0.5
W_hy = rng.normal(size=(C, H)) * 0.5
b_y = rng.normal(size=(C,)) * 0.5
X = rng.normal(size=(T, d_in))           # 4 个时刻的输入向量
y = np.array([0, 1, 2, 0])               # 每个时刻要预测的目标词（索引）
h0 = np.zeros(H)


def rnn_forward(X_, W_xh_, W_hh_, b_h_, W_hy_, b_y_, h0_):
    hs = [h0_]
    logits = []
    for t in range(len(X_)):
        z = W_hh_ @ hs[-1] + W_xh_ @ X_[t] + b_h_
        h = np.tanh(z)
        logits.append(W_hy_ @ h + b_y_)
        hs.append(h)
    return np.array(hs), np.array(logits)


hs, logits = rnn_forward(X, W_xh, W_hh, b_h, W_hy, b_y, h0)
losses = np.array([-np.log(softmax(logits[t])[y[t]]) for t in range(T)])

print("输入序列长度 T =", T, " 隐藏维 H =", H, " 输出词表 C =", C)
print("W_xh", W_xh.shape, " W_hh", W_hh.shape, " W_hy", W_hy.shape)
print("h_0 =", hs[0], "（初始隐藏状态，全 0）")
for t in range(T):
    print(f"h_{t+1} = tanh(W_hh h_{t} + W_xh x_{t+1} + b_h) =", hs[t + 1])
print("每步交叉熵损失 =", losses)
print("整段 loss（求和）= %.6f" % losses.sum())
print("→ 同一组 W_hh/W_xh/W_hy 在 4 个时刻被反复使用（权重共享）")


# --- §1b 复现 02 §4.1 的手算例（3 词、4 词表、隐藏维 1）---
hdr("§1b 复现 02 §4.1 的手算例（the cat sat；V=4；隐藏维 1）")
emb = {'the': np.array([1.0, 0.0]), 'cat': np.array([0.0, 1.0]),
       'dog': np.array([0.0, -1.0]), 'sat': np.array([1.0, 1.0])}
Wxh_h = np.array([1.0, 1.0]); Whh_h = 0.5; hh = 0.0
for w in ['the', 'cat', 'sat']:
    z = Wxh_h @ emb[w] + Whh_h * hh
    hh = np.tanh(z)
    print(f"输入 {w:>3}  z = Wxh·x + 0.5·h_prev = {z:.5f}   h = tanh(z) = {hh:.5f}")
Why = np.array([1.0, 0.0, -1.0, 1.0])       # 对应 the/cat/dog/sat
logits_h = Why * hh
p_h = softmax(logits_h)
print("t=3 的 logits（the/cat/dog/sat）=", logits_h)
print("t=3 的 softmax =", p_h, " 和 =", p_h.sum())
print("→ 与 02 §4.1 手算表逐位一致")


# ======================================================================
# §2 BPTT：手推梯度 vs 数值梯度 vs torch.autograd
#     要点：重复权重的梯度 = 各次出现处梯度之和
# ======================================================================
hdr("§2 BPTT：手推梯度 vs 数值梯度 vs torch.autograd")

def total_loss(X_, y_, W_xh_, W_hh_, b_h_, W_hy_, b_y_):
    _, lo = rnn_forward(X_, W_xh_, W_hh_, b_h_, W_hy_, b_y_, h0)
    return sum(-np.log(softmax(lo[t])[y_[t]]) for t in range(len(y_)))


# --- 手推 BPTT（从输出往回、沿时刻反传并累加）---
dW_xh = np.zeros_like(W_xh); dW_hh = np.zeros_like(W_hh); db_h = np.zeros_like(b_h)
dW_hy = np.zeros_like(W_hy); db_y = np.zeros_like(b_y)
dh = np.zeros((T + 1, H))                 # 每个时刻保存 h 收到的上游梯度，供累加

for t in range(T - 1, -1, -1):
    p = softmax(logits[t])
    dlogit = p.copy(); dlogit[y[t]] -= 1.0        # ŷ − y（K02 §6）
    dW_hy += np.outer(dlogit, hs[t + 1])
    db_y += dlogit
    dh[t + 1] += W_hy.T @ dlogit                  # 输出层回传到 h_t
    dz = dh[t + 1] * (1.0 - hs[t + 1] ** 2)       # tanh 的局部导数
    dW_hh += np.outer(dz, hs[t])                  # 每个时刻都把贡献加到同一块 W_hh
    dW_xh += np.outer(dz, X[t])
    db_h += dz
    dh[t] += W_hh.T @ dz                          # 再往上一时刻传（累加，不覆盖）

# --- 数值梯度 ---
nW_xh = numeric_grad(lambda A: total_loss(X, y, A, W_hh, b_h, W_hy, b_y), W_xh.copy())
nW_hh = numeric_grad(lambda A: total_loss(X, y, W_xh, A, b_h, W_hy, b_y), W_hh.copy())
nb_h = numeric_grad(lambda A: total_loss(X, y, W_xh, W_hh, A, W_hy, b_y), b_h.copy())
nW_hy = numeric_grad(lambda A: total_loss(X, y, W_xh, W_hh, b_h, A, b_y), W_hy.copy())
nb_y = numeric_grad(lambda A: total_loss(X, y, W_xh, W_hh, b_h, W_hy, A), b_y.copy())

print("整段 loss = %.10f" % total_loss(X, y, W_xh, W_hh, b_h, W_hy, b_y))
print("∂L/∂W_hh max|手推-数值| =", np.abs(dW_hh - nW_hh).max())
print("∂L/∂W_xh max|手推-数值| =", np.abs(dW_xh - nW_xh).max())
print("∂L/∂b_h  max|手推-数值| =", np.abs(db_h - nb_h).max())
print("∂L/∂W_hy max|手推-数值| =", np.abs(dW_hy - nW_hy).max())
print("∂L/∂b_y  max|手推-数值| =", np.abs(db_y - nb_y).max())

# --- torch.autograd 对账 ---
try:
    import torch
    tW_xh = torch.tensor(W_xh, dtype=torch.float64, requires_grad=True)
    tW_hh = torch.tensor(W_hh, dtype=torch.float64, requires_grad=True)
    tbh = torch.tensor(b_h, dtype=torch.float64, requires_grad=True)
    tW_hy = torch.tensor(W_hy, dtype=torch.float64, requires_grad=True)
    tby = torch.tensor(b_y, dtype=torch.float64, requires_grad=True)
    tX = torch.tensor(X, dtype=torch.float64)
    th = torch.zeros(H, dtype=torch.float64)
    tloss = torch.tensor(0.0, dtype=torch.float64)
    for t in range(T):
        th = torch.tanh(tW_hh @ th + tW_xh @ tX[t] + tbh)
        tlogit = tW_hy @ th + tby
        tloss = tloss + torch.nn.functional.cross_entropy(tlogit.unsqueeze(0),
                                                          torch.tensor([y[t]]))
    tloss.backward()
    print("\n[torch] ∂L/∂W_hh max|autograd-手推| =", (tW_hh.grad.numpy() - dW_hh).max())
    print("[torch] ∂L/∂W_xh max|autograd-手推| =", (tW_xh.grad.numpy() - dW_xh).max())
    print("[torch] ∂L/∂W_hy max|autograd-手推| =", (tW_hy.grad.numpy() - dW_hy).max())
    print("[torch] loss 与 numpy 实现的 loss 差 =", abs(tloss.item() - total_loss(X, y, W_xh, W_hh, b_h, W_hy, b_y)))
    print("→ 手推 BPTT 与 autograd 是同一个东西；BPTT 就是'按时刻反传、逐时刻累加'")
except ImportError:
    print("\n[torch] 未安装，跳过 autograd 对照")


# ======================================================================
# §3 梯度消失 / 爆炸：谱半径 r 控制 ∏ 雅可比的模长
#     (A) 线性 RNN  h_t = W h_{t-1}  →  ∂h_T/∂h_0 = W^T（就是 ∏W 的谱范数故事）
#     (B) 加回 tanh  →  ∂h_T/∂h_0 = (D_T W)...(D_1 W)，D_t = diag(1 - h_t^2)
# ======================================================================
hdr("§3-A 线性 RNN：∂h_T/∂h_0 = W^20，谱范数 = r^20（T=20）")

def orthogonal(H_, g):
    A = g.normal(size=(H_, H_))
    Q, _ = np.linalg.qr(A)
    return Q

Hj, Tj = 4, 20
seed = np.random.default_rng(42)
Q = orthogonal(Hj, seed)                  # 固定方向，只改谱半径 r
h_start = seed.normal(size=Hj)
g_out = np.ones(Hj)                       # 末端上游梯度（构造：末端损失对 h_T 的梯度）

print("H =", Hj, " T =", Tj, " W = r × 正交矩阵，故 ‖W‖₂ = r 精确成立")
print(f"{'r':>5} | {'‖W^20‖₂':>14} | {'与 r^20 比':>10}")
for r in [0.5, 0.9, 1.0, 1.1, 1.5, 2.5]:
    W = r * Q
    Jlin = np.linalg.matrix_power(W, Tj)
    print(f"{r:>5.1f} | {np.linalg.norm(Jlin, 2):>14.6e} | {np.linalg.norm(Jlin, 2) / r ** Tj:>10.6f}")
print("→ r<1：r^20 迅速衰减（0.5^20 ≈ 9.5e-7），远端的梯度信号丢光 = 梯度消失")
print("→ r>1：r^20 迅速放大（2.5^20 ≈ 9.1e7），梯度爆炸")
print("→ 这就是 T2 验收 A4 说的'从 ∏W 的谱范数说起'")

hdr("§3-B 加回 tanh（真实 vanilla RNN）：tanh' ≤ 1 且会饱和")

print(f"{'r':>5} | {'‖∏ D_t W‖₂':>14} | {'‖回传梯度‖₂':>14}")
for r in [0.5, 0.9, 1.0, 1.1, 1.5, 2.5]:
    W = r * Q
    hs_ = [h_start]
    for t in range(Tj):
        hs_.append(np.tanh(W @ hs_[-1]))
    hs_ = np.array(hs_)
    J = np.eye(Hj)
    for t in range(Tj, 0, -1):            # 从末端往起点累乘
        D = np.diag(1.0 - hs_[t] ** 2)
        J = D @ W @ J
    g0 = J.T @ g_out                      # 末端梯度 g_out 回传到起点后的梯度
    print(f"{r:>5.1f} | {np.linalg.norm(J, 2):>14.6e} | {np.linalg.norm(g0):>14.6e}")
print("→ 每步因子 = r·tanh'(z)，tanh' ≤ 1，所以 r=1 也在衰减（0.504，不是 1）")
print("→ 注意 r=2.5 反而比 r=1.5 小：状态被 tanh 推到饱和区（D_t→0）'自动刹车'")
print("   —— 这是真实 tanh RNN 的一个缓解因素，但不改变机制；RNN 仍常需剪裁")


# ======================================================================
# §4 梯度剪裁：按范数缩放，方向不变
# ======================================================================
hdr("§4 梯度剪裁（Gradient Clipping）：治爆炸，方向不变")

# 用线性 RNN、r=2.5 的回传梯度做一个真实的爆炸梯度向量 g = (W^T)^20 g_out
r = 2.5
W = r * Q
Jlin = np.linalg.matrix_power(W, Tj)
g = Jlin.T @ g_out
threshold = 1.0
lr = 0.1
norm_before = np.linalg.norm(g)
g_clipped = g * (threshold / norm_before) if norm_before > threshold else g
norm_after = np.linalg.norm(g_clipped)

cos = float(g @ g_clipped / (np.linalg.norm(g) * np.linalg.norm(g_clipped)))
print("原始梯度 g（构造）：回传末端 ones 得到，范数 ‖g‖₂ = %.6e" % norm_before)
print("阈值 threshold = %.1f" % threshold)
print("剪裁后 g_clipped = g × (threshold/‖g‖)，范数 = %.10f" % norm_after)
print("方向余弦 cos(g, g_clipped) = %.12f（=1 表示方向没变）" % cos)
print("学习率 lr = %.1f" % lr)
print("剪裁前一步的 ‖Δθ‖ = lr·‖g‖   = %.6e（'一下跳到 Iowa'）" % (lr * norm_before))
print("剪裁后一步的 ‖Δθ‖ = lr·‖g_clip‖= %.6f（同方向、小步走）" % (lr * norm_after))
print("→ 剪裁只限制步长，不改变方向；对'梯度太小'的消失问题没有任何帮助")


# ======================================================================
# §5 perplexity 与交叉熵：ppl = exp(CE)
# ======================================================================
hdr("§5 perplexity = exp(交叉熵)，越小越好")
for ce in [0.0, 0.693147, 1.0, 2.302585, 6.907755]:
    print("交叉熵 CE = %.6f  →  perplexity = exp(CE) = %.6f" % (ce, np.exp(ce)))
V = 1000
print("\n均匀分布模型的特殊值：词表 V = %d" % V)
print("  CE_uniform = log(V) = %.6f" % np.log(V))
print("  ppl_uniform = exp(log V) = V = %.6f" % np.exp(np.log(V)))
print("→ 低 perplexity 好；ppl = V 表示模型和'在 V 个词上瞎猜'一样差")