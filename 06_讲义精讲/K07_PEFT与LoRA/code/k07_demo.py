"""
K07 demo —— PEFT 与 LoRA 的机制验证

只依赖 numpy + torch（pytorch_env 已装）。不下载模型、不装包。
运行（cwd 在 06_讲义精讲/K07_PEFT与LoRA 目录下）：
    D:/code/anaconda/envs/pytorch_env/python.exe code/k07_demo.py

输出存 logs/k07_demo_out.txt，与 03_动手验证.md 逐节对应。
全部随机性由 seed 固定；脚本几秒跑完。

对应 slides：Lecture 9 Efficient Adaptation
  p35（全参 vs PEFT）、p45-47（全参微调与 Δφ）、p48（W0 + αBA，低秩）、
  p49（收敛到全参 / 推理无额外延迟）、p53（QLoRA 4-bit）。
"""
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
# 手写 LoRA 层：冻结 W0（base），只训 A、B；前向 = W0 x + (α/r)·B(A x)
#   slides p48：W0 + ΔW = W0 + αBA，B∈R^{d×r}, A∈R^{r×k}，只 A、B 可训练
# ======================================================================
class LoRALinear(nn.Module):
    def __init__(self, base: nn.Linear, r, alpha):
        super().__init__()
        self.base = base
        for p in self.base.parameters():
            p.requires_grad = False          # 冻结预训练权重 W0
        self.d_out, self.d_in = base.out_features, base.in_features
        self.r, self.alpha = r, alpha
        self.A = nn.Parameter(torch.randn(r, self.d_in) * 0.01)   # A 高斯初始化
        self.B = nn.Parameter(torch.zeros(self.d_out, r))         # B 零初始化

    @property
    def scale(self):
        return self.alpha / self.r        # 缩放因子 α/r（论文口径）

    def forward(self, x):
        return self.base(x) + self.scale * (x @ self.A.T @ self.B.T)


# ======================================================================
# §1 参数量：全参微调 vs LoRA
# ======================================================================
hdr("§1 参数量：全参微调 vs LoRA（以 Transformer 里一个方阵为例）")

d = k = 4096
full = d * k
print(f"一个 {d}×{k} 的权重矩阵 W0：")
print(f"  全参微调可训练参数 = d·k = {full:,}")
print(f"\n{'秩 r':>6}{'LoRA 可训练 2·d·r':>20}{'占全参比例':>14}")
for r in [1, 2, 4, 8, 16, 64]:
    p = 2 * d * r
    print(f"{r:>6}{p:>20,}{p / full:>13.6%}")

# 实测：真建一个 4096×4096 的 Linear，用 LoRA(r=8) 包一层，数 requires_grad
lin = nn.Linear(d, k)
lora = LoRALinear(lin, r=8, alpha=16)
trainable = sum(p.numel() for p in lora.parameters() if p.requires_grad)
allp = sum(p.numel() for p in lora.parameters())
print(f"\n实测：LoRA(r=8) 包装 4096×4096 Linear")
print(f"  总参数 = {allp:,}，可训练 = {trainable:,}（占 {trainable / allp:.6%}）")
print(f"  即把可训练量从 {full:,} 降到 {trainable:,}，少 {full // trainable} 倍。")

# 每任务存一份的成本（算术，不是实测）
gpt3 = 175e9
print(f"\n每任务存一份的成本（算术）：")
print(f"  全参副本：GPT-3 175B 参数 × 2 字节(fp16) ≈ {gpt3 * 2 / 1e9:.0f} GB")
print(f"  一个 4096 矩阵的 LoRA(r=8)：{trainable:,} 参数 × 2 字节 ≈ "
      f"{trainable * 2 / 1024:.1f} KB")


# ======================================================================
# §2 低秩拟合：LoRA 能拟合"低秩的 ΔW"；秩不足则欠拟合
#     对照全参微调（直接训 W）
# ======================================================================
hdr("§2 低秩拟合：目标 ΔW 是低秩时，LoRA 秩够就拟合、秩不够就欠拟合")

KD = 64                 # 方阵边长
R_TRUE = 4              # 目标 ΔW 的真实秩
g = torch.Generator().manual_seed(1)
W0 = torch.randn(KD, KD, generator=g) * 0.1
B_true = torch.randn(KD, R_TRUE, generator=g) * 0.5
A_true = torch.randn(R_TRUE, KD, generator=g) * 0.5
Delta = B_true @ A_true                       # rank(Delta) = 4
W_target = W0 + Delta
X = torch.randn(256, KD, generator=g)
Y = X @ W_target.T

print(f"构造：W0 随机；目标更新 ΔW = B_true·A_true，真实秩 r_true = {R_TRUE}")
print(f"样本：X {tuple(X.shape)}，Y = X·W_targetᵀ")


def train_lora(r, steps=2500, lr=0.02):
    """冻结 W0，只训 A、B；α=r 使 scale=1，便于直接对照 ΔW。"""
    torch.manual_seed(0)
    A = nn.Parameter(torch.randn(r, KD) * 0.1)
    B = nn.Parameter(torch.zeros(KD, r))
    opt = torch.optim.Adam([A, B], lr=lr)
    for _ in range(steps):
        opt.zero_grad()
        Yh = X @ W0.T + (X @ A.T) @ B.T        # scale = α/r = 1
        loss = F.mse_loss(Yh, Y)
        loss.backward()
        opt.step()
    with torch.no_grad():
        W_eff = W0 + B @ A
        return (W_eff - W_target).norm().item() / Delta.norm().item()


def train_full(steps=2500, lr=0.02):
    """全参微调：直接训 W，从 W0 出发。"""
    torch.manual_seed(0)
    W = nn.Parameter(W0.clone())
    opt = torch.optim.Adam([W], lr=lr)
    for _ in range(steps):
        opt.zero_grad()
        loss = F.mse_loss(X @ W.T, Y)
        loss.backward()
        opt.step()
    with torch.no_grad():
        return (W - W_target).norm().item() / Delta.norm().item()


print(f"\n{'方法':<34}{'可训练参数':>12}{'相对误差 ‖W_eff−W_target‖/‖ΔW‖':>34}")
for name, err, npar in [
    ("LoRA r=8（≥ r_true）", train_lora(8), 2 * 8 * KD),
    ("LoRA r=2（< r_true）", train_lora(2), 2 * 2 * KD),
    ("全参微调（训整个 W）", train_full(), KD * KD),
]:
    print(f"{name:<32}{npar:>12,}{err:>32.6f}")
print("→ 目标 ΔW 秩为 4：LoRA r=8 误差趋近 0，r=2 无法表示、留下明显残差；")
print("  全参微调当然也能拟合，但可训参数多得多。")


# ======================================================================
# §3 秩 r 的作用：参数线性增长，误差在 r ≥ 真秩后塌到 0
# ======================================================================
hdr("§3 秩 r 的作用：可训练参数线性增长，误差在 r ≥ r_true 后趋 0")

print(f"目标 ΔW 的真实秩 r_true = {R_TRUE}")
print(f"\n{'秩 r':>6}{'可训练参数 2·r·64':>20}{'相对误差':>14}")
for r in [1, 2, 4, 8, 16, 32]:
    err = train_lora(r)
    print(f"{r:>6}{2 * r * KD:>20,}{err:>14.6f}")
print("→ r 从 1 增到 2、再到 4：误差在 r = r_true = 4 处塌到 ~0（够表示了）；")
print("  r 再往上加只是浪费参数（这里 r=8/16/32 的误差都已触及训练下限）。")


# ======================================================================
# §4 初始化：A 高斯、B 零 → 起点输出 = 预训练输出（ΔW = 0）
# ======================================================================
hdr("§4 初始化：B 初始化为 0 ⇒ 训练起点就是预训练模型")

torch.manual_seed(0)
W0s = torch.randn(KD, KD) * 0.1
A_s = torch.randn(8, KD) * 0.01        # A 高斯
B_zero = torch.zeros(KD, 8)            # B 零
x_s = torch.randn(4, KD)
scale_s = 16 / 8
out_lora = x_s @ W0s.T + scale_s * ((x_s @ A_s.T) @ B_zero.T)
out_base = x_s @ W0s.T
print(f"B=0 时，LoRA 前向 = 预训练前向，max|差| = "
      f"{(out_lora - out_base).abs().max().item():.3e}")

B_rand = torch.randn(KD, 8) * 0.01     # 若 B 也是随机非零
out_rand = x_s @ W0s.T + scale_s * ((x_s @ A_s.T) @ B_rand.T)
print(f"对照：B 随机非零时，与预训练前向 max|差| = "
      f"{(out_rand - out_base).abs().max().item():.3e}")
print("→ B=0 保证 ΔW=BA=0：训练从「预训练模型」出发，一上来不会破坏已有能力；")
print("  若 A、B 都随机非零，起点就会给权重叠加一个随机扰动。")

# 梯度视角：ΔW = s·B(Ax)；B=0 时 ∂L/∂A = s·(Bᵀδ)xᵀ = 0，只有 B 先动
Wd = torch.randn(KD, KD) * 0.1
Ad = (torch.randn(8, KD) * 0.1).requires_grad_(True)
Bd = torch.zeros(KD, 8).requires_grad_(True)
xd = torch.randn(16, KD)
yd = torch.randn(16, KD)
out_d = xd @ Wd.T + scale_s * (xd @ Ad.T) @ Bd.T
((out_d - yd) ** 2).mean().backward()
print(f"\n梯度视角（训练前 B=0）：‖∂L/∂A‖_F = {Ad.grad.norm().item():.6e}，"
      f"‖∂L/∂B‖_F = {Bd.grad.norm().item():.6e}")
print("→ B=0 时 A 的第一步梯度为 0，只有 B 先更新；B 一旦非零，A 才开始收到梯度。")


# ======================================================================
# §5 merge：把 BA 合并进 W0 后，输出不变（且可精确回退）
#     用 float64 展示，差异落在机器精度 ~1e-16
# ======================================================================
hdr("§5 merge：W0 + (α/r)·BA 合并后输出不变，可精确回退")

rng = np.random.default_rng(2)
MS = 512
W0m = rng.normal(0, 0.1, size=(MS, MS)).astype(np.float64)
Am = rng.normal(0, 0.01, size=(8, MS)).astype(np.float64)
Bm = rng.normal(0, 0.01, size=(MS, 8)).astype(np.float64)
alpha_m, r_m = 16, 8
s_m = alpha_m / r_m
Xm = rng.normal(size=(256, MS)).astype(np.float64)

out_lora64 = Xm @ W0m.T + s_m * ((Xm @ Am.T) @ Bm.T)      # 两边分开算
W_merged = W0m + s_m * (Bm @ Am)                          # 合并成一个矩阵
out_merged = Xm @ W_merged.T
diff = np.abs(out_lora64 - out_merged).max()
print(f"LoRA 前向 vs 合并后前向：max|差| = {diff:.3e}")
print(f"→ 合并只是把 (α/r)·BA 加进 W0，是恒等变形，差异只有浮点舍入。")

W_back = W_merged - s_m * (Bm @ Am)                       # 回退到预训练权重
print(f"回退：W_merged − (α/r)·BA = W0 ?  max|差| = "
      f"{np.abs(W_back - W0m).max():.3e}")
print("→ 推理时无额外延迟；换任务就把这份 BA 减掉、换上另一份 B'A'（slides p49）。")


# ======================================================================
# §6 缩放 α/r：固定秩 r，调 α 等价于线性缩放 ΔW 的有效尺度
# ======================================================================
hdr("§6 缩放 α/r：ΔW 的有效尺度 = (α/r) 乘 BA")

r_s = 8
A6 = torch.randn(r_s, KD) * 0.1
B6 = torch.randn(KD, r_s) * 0.1
base_norm = (B6 @ A6).norm().item()
print(f"固定 r={r_s}，BA 的 Frobenius 范数 = {base_norm:.6f}")
print(f"\n{'α':>5}{'α/r':>8}{'‖(α/r)·BA‖_F':>16}")
for alpha in [8, 16, 32]:
    s = alpha / r_s
    print(f"{alpha:>5}{s:>8.2f}{(s * (B6 @ A6)).norm().item():>16.6f}")
print("→ 保持 r、增大 α，等价于把同一份更新的强度按 (α/r) 线性放大。")
print("  slides p48 把 α 说成预训练知识与任务知识的权衡；工程上常按 α/r 缩放。")