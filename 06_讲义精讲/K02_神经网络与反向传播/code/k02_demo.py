"""
K02 demo —— 神经网络与反向传播的机制验证

只需 numpy。torch 对照（§7）为可选，缺失时自动跳过。
运行：
    D:/code/anaconda/envs/pytorch_env/python.exe code/k02_demo.py

输出与 06_讲义精讲/K02_神经网络与反向传播/03_动手验证.md 逐节对应。
"""
import numpy as np

np.set_printoptions(precision=6, suppress=True)


def hdr(t):
    print("\n" + "=" * 64)
    print(t)
    print("=" * 64)


# ======================================================================
# §1 没有非线性时，多层塌成一层：  W2(W1 x) == (W2 W1) x
# ======================================================================
hdr("§1 线性塌缩：两层线性叠加 == 一个矩阵")
rng = np.random.default_rng(0)
W1 = rng.normal(size=(4, 3))
W2 = rng.normal(size=(2, 4))
x = rng.normal(size=3)

two_layer = W2 @ (W1 @ x)
W_collapsed = W2 @ W1
one_layer = W_collapsed @ x

print("W1 shape:", W1.shape, " W2 shape:", W2.shape, " x shape:", x.shape)
print("两层分别算 W2@(W1@x) :", two_layer)
print("合成单矩阵 (W2@W1)@x :", one_layer)
print("max|差| =", np.abs(two_layer - one_layer).max())

# 对照：中间插入 ReLU 后，复合不再是单个线性变换
relu = lambda z: np.maximum(z, 0.0)
nl_two_layer = W2 @ relu(W1 @ x)
print("\n中间插 ReLU:           ", nl_two_layer)
print("与 (W2@W1)@x 的差     :", nl_two_layer - one_layer)
print("→ 差值非零，说明非线性让'深度'真正起作用（不再等价于单层）")


# ======================================================================
# §2 手算算例（02 §5 的同一个网络）
#     x=[1,2] -> W1 -> ReLU -> h -> W2 -> s
# ======================================================================
hdr("§2 手算算例：前向")
x_hand = np.array([1.0, 2.0])
W1h = np.array([[1.0, 0.0],
                [0.0, -1.0]])
b1h = np.array([0.0, 0.0])
W2h = np.array([[1.0, 1.0]])
b2h = np.array([0.0])

z1 = W1h @ x_hand + b1h
h = relu(z1)
s = (W2h @ h + b2h)[0]

print("z1 = W1@x + b1 =", z1)
print("h  = ReLU(z1)  =", h, "  <- 第2个单元被 ReLU 压成 0（死区）")
print("s  = W2@h + b2 =", s)


# ======================================================================
# §3 手算梯度 vs 数值梯度（中心差分）
# ======================================================================
hdr("§3 手算梯度 vs 数值梯度：单层线性 + ReLU")

def forward_s(W1_, b1_, W2_, b2_, x_):
    return (W2_ @ relu(W1_ @ x_ + b1_) + b2_)[0]

def numeric_grad(f, arr, h=1e-4):
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

# 解析梯度（按 02 §4 的单节点规则手动推）
ds_dW2 = h.reshape(1, -1)             # ∂s/∂W2 = h^T
ds_dh = W2h[0]                        # ∂s/∂h  = W2^T
drelu = (z1 > 0).astype(float)        # ReLU 的局部导数：正为1，否则0
ds_dz1 = ds_dh * drelu                # 逐元素相乘（Hadamard）
ds_dW1 = np.outer(ds_dz1, x_hand)     # 外积：δ x^T
ds_db1 = ds_dz1
ds_dx = W1h.T @ ds_dz1

gW1 = numeric_grad(lambda A: forward_s(A, b1h, W2h, b2h, x_hand), W1h.copy())
gb1 = numeric_grad(lambda A: forward_s(W1h, A, W2h, b2h, x_hand), b1h.copy())
gW2 = numeric_grad(lambda A: forward_s(W1h, b1h, A, b2h, x_hand), W2h.copy())
gb2 = numeric_grad(lambda A: forward_s(W1h, b1h, W2h, A, x_hand), b2h.copy())
gx = numeric_grad(lambda A: forward_s(W1h, b1h, W2h, b2h, A), x_hand.copy())

print("∂s/∂W2  解析 =", ds_dW2, " 数值 =", gW2, " max|差| =", np.abs(ds_dW2 - gW2).max())
print("∂s/∂W1  解析 =", ds_dW1.tolist(), " max|差| =", np.abs(ds_dW1 - gW1).max())
print("∂s/∂b1  解析 =", ds_db1, " 数值 =", gb1, " max|差| =", np.abs(ds_db1 - gb1).max())
print("∂s/∂b2  解析 =", np.array([1.0]), " 数值 =", gb2, " max|差| =", np.abs(np.array([1.0]) - gb2).max())
print("∂s/∂x   解析 =", ds_dx, " 数值 =", gx, " max|差| =", np.abs(ds_dx - gx).max())
print("\n注意 ∂s/∂W1 的第 2 行全为 0 —— 死掉的 ReLU 单元没有梯度回流")


# ======================================================================
# §4 softmax + 交叉熵 对 logits 的梯度 = ŷ − y
# ======================================================================
hdr("§4 softmax + 交叉熵：∂J/∂z = ŷ − y")

def softmax(z):
    z = z - z.max()                       # 数值稳定
    e = np.exp(z)
    return e / e.sum()

def ce_loss(z, y):
    return -np.log(softmax(z)[y])

z = np.array([2.0, 1.0, -1.0])
y = 0
p = softmax(z)
J = ce_loss(z, y)
onehot = np.zeros_like(z); onehot[y] = 1.0
analytic = p - onehot
numeric = numeric_grad(lambda A: ce_loss(A, y), z.copy())

print("z        =", z)
print("ŷ=softmax=", p)
print("y (正确类)=", y, "  J = -log p_y =", J)
print("∂J/∂z 解析 (ŷ−y) =", analytic)
print("∂J/∂z 数值       =", numeric, " max|差| =", np.abs(analytic - numeric).max())


# ======================================================================
# §5 分叉处梯度相加： y = a*a + a  ->  dy/da = 2a + 1
# ======================================================================
hdr("§5 梯度在分叉处相加")
a = np.array([3.0])
f_branch = lambda A: (A[0] * A[0]) + A[0]
print("a =", a[0])
print("y = a*a + a =", f_branch(a))
print("dy/da 解析 (2a+1) =", 2 * a[0] + 1)
print("dy/da 数值        =", numeric_grad(f_branch, a.copy()))
print("→ 两条支路各贡献 2a 和 1，相加才对；只取一条（3 或 1）就错")


# ======================================================================
# §6 两层 MLP + softmax 交叉熵： 三层梯度来源互相对账
#     解析(手推)  vs  数值(中心差分)  vs  torch.autograd
#     —— 这就是 T2 段一闸门 1「∂L/∂W1」的完整演练
# ======================================================================
hdr("§6 两层 MLP：∂L/∂W1（解析 / 数值 / autograd 三方对账）")

rng = np.random.default_rng(7)
d_in, d_h, C = 3, 4, 3
W1m = rng.normal(size=(d_h, d_in)) * 0.5
b1m = rng.normal(size=(d_h,)) * 0.5
W2m = rng.normal(size=(C, d_h)) * 0.5
b2m = rng.normal(size=(C,)) * 0.5
xm = rng.normal(size=d_in)
ym = 2

def mlp_loss(W1_, b1_, W2_, b2_, x_, y_):
    z1_ = W1_ @ x_ + b1_
    h_ = relu(z1_)
    z2_ = W2_ @ h_ + b2_
    return -np.log(softmax(z2_)[y_])

# --- 手推解析梯度 ---
z1m = W1m @ xm + b1m
hm = relu(z1m)
z2m = W2m @ hm + b2m
pm = softmax(z2m)
Lm = -np.log(pm[ym])

dz2 = pm.copy(); dz2[ym] -= 1.0          # ŷ − y
dW2m = np.outer(dz2, hm)
db2m = dz2
dhm = W2m.T @ dz2
dz1 = dhm * (z1m > 0)
dW1m = np.outer(dz1, xm)
db1m = dz1
dxm = W1m.T @ dz1

# --- 数值梯度 ---
nW1 = numeric_grad(lambda A: mlp_loss(A, b1m, W2m, b2m, xm, ym), W1m.copy())
nW2 = numeric_grad(lambda A: mlp_loss(W1m, b1m, A, b2m, xm, ym), W2m.copy())
nb1 = numeric_grad(lambda A: mlp_loss(W1m, A, W2m, b2m, xm, ym), b1m.copy())
nb2 = numeric_grad(lambda A: mlp_loss(W1m, b1m, W2m, A, xm, ym), b2m.copy())

print("L =", Lm)
print("∂L/∂W2  max|解析-数值| =", np.abs(dW2m - nW2).max())
print("∂L/∂W1  max|解析-数值| =", np.abs(dW1m - nW1).max())
print("∂L/∂b1  max|解析-数值| =", np.abs(db1m - nb1).max())
print("∂L/∂b2  max|解析-数值| =", np.abs(db2m - nb2).max())
print("\n∂L/∂W1 (解析) =\n", dW1m)
print("∂L/∂W1 (数值) =\n", nW1)

# --- torch.autograd 对账（可选） ---
try:
    import torch
    tW1 = torch.tensor(W1m, requires_grad=True)
    tb1 = torch.tensor(b1m, requires_grad=True)
    tW2 = torch.tensor(W2m, requires_grad=True)
    tb2 = torch.tensor(b2m, requires_grad=True)
    tx = torch.tensor(xm)
    tz1 = tW1 @ tx + tb1
    th = torch.relu(tz1)
    tz2 = tW2 @ th + tb2
    tL = torch.nn.functional.cross_entropy(tz2.unsqueeze(0), torch.tensor([ym]))
    tL.backward()
    print("\n[torch] ∂L/∂W1 max|autograd-解析| =",
          (tW1.grad.numpy() - dW1m).max())
    print("[torch] ∂L/∂W2 max|autograd-解析| =",
          (tW2.grad.numpy() - dW2m).max())
    print("[torch] L 与 numpy 实现的 L 差 =", abs(tL.item() - Lm))
except ImportError:
    print("\n[torch] 未安装，跳过 autograd 对照")


# ======================================================================
# §7 学习率过大 / 过小：为什么需要它（A2 用 Adam, lr=5e-4）
# ======================================================================
hdr("§7 SGD 一步：梯度下降更新（对照 A2 的 run.py）")
theta = 1.0
alpha = 0.1
grad = 3 * theta ** 2          # d/dθ θ^3
new_theta = theta - alpha * grad
print("θ =", theta, " ∂J/∂θ = 3θ² =", grad)
print("θ_new = θ - α·grad =", new_theta)
print("（slides p19 的更新式；A2 里 Adam 会自动定步长，但结构一样）")