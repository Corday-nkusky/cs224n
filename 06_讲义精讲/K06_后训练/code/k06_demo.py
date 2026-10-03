"""
K06 demo —— 后训练（SFT / RLHF / DPO）的机制验证

用 torch（2.6.0+cu124）。玩具规模：几个 prompt、几条候选回答、少量偏好对。
全部确定（固定 seed），几秒跑完，不下载任何模型。

运行（cwd = 06_讲义精讲/K06_后训练）：
    D:/code/anaconda/envs/pytorch_env/python.exe code/k06_demo.py

输出与 06_讲义精讲/K06_后训练/03_动手验证.md 逐节对应。
"""
import numpy as np
import torch

torch.manual_seed(0)
torch.set_printoptions(precision=6)
np.set_printoptions(precision=6, suppress=True)


def hdr(t):
    print("\n" + "=" * 64)
    print(t)
    print("=" * 64)


def log_softmax(z):
    return z - torch.logsumexp(z, dim=-1, keepdim=True)


# ======================================================================
# §1 玩具 DPO 设置：一个"logits 模型" + 3 条偏好对
#     每个 prompt 有 C=4 条候选回答；模型就是一张 (P, C) 的 logits 表。
#     reference = 冻结的初始 logits（= SFT/pretrain 模型）。
#     chosen / rejected 故意取成"人类偏好与参考模型相反"，好让训练有活干。
# ======================================================================
hdr("§1 玩具 DPO 设置")

P, C = 3, 4
Z_ref = torch.tensor([
    [1.5, 0.2, -0.5, 0.8],   # prompt 0
    [0.3, 1.2, 0.9, -0.4],   # prompt 1
    [-0.6, 0.7, 1.4, 0.1],   # prompt 2
], dtype=torch.float64)
# (chosen w, rejected l)：取 w = 参考模型最不看好的、l = 最看好的
pairs = [(2, 0), (3, 1), (0, 2)]
W = torch.tensor([w for w, _ in pairs])
L = torch.tensor([l for _, l in pairs])
prompt_idx = torch.arange(P)

ls_ref = log_softmax(Z_ref)
print("参考模型 logits Z_ref =\n", Z_ref)
print("参考模型概率 p_ref =\n", ls_ref.exp())
print("偏好对 (chosen w, rejected l) =", pairs)
print("初始：chosen 的 log p_ref   =", ls_ref[prompt_idx, W])
print("初始：rejected 的 log p_ref =", ls_ref[prompt_idx, L])
print("初始 log p_ref(w) - log p_ref(l) =", (ls_ref[prompt_idx, W] - ls_ref[prompt_idx, L]))


def dpo_loss(Z, beta):
    """标准 DPO 损失（每条偏好对求和后取平均）。返回 (loss, 每对的 u 值)。"""
    ls = log_softmax(Z)
    logratio = ls - ls_ref
    u = beta * (logratio[prompt_idx, W] - logratio[prompt_idx, L])
    return -torch.log(torch.sigmoid(u)).mean(), u


def kl_to_ref(Z):
    ls = log_softmax(Z)
    p = ls.exp()
    return (p * (ls - ls_ref)).sum(dim=-1).mean()      # 每个 prompt 的 KL，再平均


def metrics(Z, beta):
    ls = log_softmax(Z)
    margin = (ls[prompt_idx, W] - ls[prompt_idx, L]).mean()   # 原始 log-prob 差
    return float(margin), float(beta * margin), float(kl_to_ref(Z))


beta0 = 0.5
loss0, u0 = dpo_loss(Z_ref, beta0)
print("\nβ =", beta0, " 初始 DPO loss =", float(loss0), "（= ln 2，因 u=0）")
print("初始 u（σ 的输入）=", u0, " → σ(u) =", torch.sigmoid(u0))


# ======================================================================
# §2 DPO 训练：chosen 相对 rejected 的 log-prob 差上升
# ======================================================================
hdr("§2 DPO 训练：chosen − rejected 的 log-prob 差上升")


def train_dpo(beta, steps=300, lr=0.1, record_at=()):
    Z = Z_ref.clone().requires_grad_(True)
    opt = torch.optim.Adam([Z], lr=lr)
    traj = []
    for step in range(steps + 1):
        if step in record_at:
            lo, _ = dpo_loss(Z.detach(), beta)
            mg, rm, kl = metrics(Z.detach(), beta)
            traj.append((step, float(lo), mg, rm, kl))
        if step == steps:
            break
        loss, _ = dpo_loss(Z, beta)
        opt.zero_grad(); loss.backward(); opt.step()
    return Z.detach(), traj


Z_dpo, traj = train_dpo(beta0, steps=300, lr=0.1, record_at={0, 1, 5, 20, 100, 300})
m0 = metrics(Z_ref, beta0)
m1 = metrics(Z_dpo, beta0)
print("step    loss      margin(logp_w-logp_l)   β·margin    KL(p||p_ref)")
for s, lo, mg, rm, kl in traj:
    print(f"{s:>4}   {lo:.6f}   {mg:+.6f}                 {rm:+.6f}    {kl:.6f}")

print("\n最终策略 p_θ =\n", log_softmax(Z_dpo).exp())
print("结论：loss ↓，log p(w)-log p(l) 从", f"{m0[0]:+.4f}", "升到", f"{m1[0]:+.4f}",
      "（chosen 被抬高、rejected 被压低）")
print("同时 KL(p_θ||p_ref) 从 0 升到", f"{m1[2]:.4f}", "—— 策略离开了参考模型")


# ======================================================================
# §3 β 与参考模型的作用（KL 正则强度）
# ======================================================================
hdr("§3 β 与参考模型的作用：β 越小，越远离参考模型")

print("β       最终 margin    β·margin      KL(p_θ||p_ref)")
for beta in [0.1, 0.5, 2.0]:
    Zb, _ = train_dpo(beta, steps=300, lr=0.1)
    mg, rm, kl = metrics(Zb, beta)
    print(f"{beta:<7.1f} {mg:+.6f}     {rm:+.6f}     {kl:.6f}")

print("\n→ β 是 RLHF 目标里 KL 项的系数：β 越小 → 允许离参考模型越远")
print("  （margin 与 KL 同时变大）；β 越大 → 策略被拴在参考模型附近")


# ======================================================================
# §4 reward hacking 玩具：表面奖励升、真实目标崩
#     6 个动作；proxy 奖励偏爱 5 号，而真实奖励的最优点在 3/4 号。
# ======================================================================
hdr("§4 reward hacking：表面奖励升、真实目标崩")

r_proxy = torch.tensor([0.0, 0.2, 0.4, 0.6, 0.7, 1.0], dtype=torch.float64)
r_true = torch.tensor([0.1, 0.2, 0.3, 0.9, 0.75, 0.0], dtype=torch.float64)
print("r_proxy =", r_proxy, " argmax =", int(r_proxy.argmax()))
print("r_true  =", r_true, " argmax =", int(r_true.argmax()))
print("均匀分布下：proxy 期望 =", float(r_proxy.mean()), " 真实期望 =", float(r_true.mean()))


def run_hack(beta_kl, steps=400, lr=0.2):
    """梯度上升最大化 E_p[proxy] - β·KL(p||uniform)。返回逐步 (proxy, true, KL)。"""
    theta = torch.zeros(6, dtype=torch.float64, requires_grad=True)
    opt = torch.optim.Adam([theta], lr=lr)
    log_uniform = torch.log(torch.tensor(1 / 6, dtype=torch.float64))
    traj = []
    for step in range(steps + 1):
        p = torch.softmax(theta, dim=-1)
        kl = (p * (torch.log(p) - log_uniform)).sum()   # 可微的 KL
        traj.append((step, float((p * r_proxy).sum()), float((p * r_true).sum()), float(kl)))
        if step == steps:
            break
        loss = -(p * r_proxy).sum() + beta_kl * kl
        opt.zero_grad(); loss.backward(); opt.step()
    return traj


for beta_kl, tag in [(0.0, "无 KL 惩罚"), (0.5, "KL 惩罚 β=0.5"), (2.0, "KL 惩罚 β=2.0")]:
    traj = run_hack(beta_kl)
    print(f"\n[{tag}]  step   proxy奖励   真实奖励   KL(对均匀)")
    for s, pr, tr, kl in traj:
        if s in (0, 1, 2, 3, 5, 10, 20, 50, 100, 400):
            print(f"        {s:>4}   {pr:.6f}   {tr:.6f}   {kl:.6f}")
    pk = max(traj, key=lambda x: x[2])
    print(f"   真实奖励峰值 {pk[2]:.6f} @step {pk[0]}；末值 {traj[-1][2]:.6f}")


# ======================================================================
# §5 DPO 对 logits 的梯度：手推 = autograd
#     手推结果：∂ℓ/∂θ_j = β(σ(u)-1)(δ_{jw} - δ_{jl})，只动 w、l 两个 logit。
# ======================================================================
hdr("§5 DPO 对 logits 的梯度：手推 = autograd")

Zg = Z_ref.clone().requires_grad_(True)
loss_g, u_g = dpo_loss(Zg, beta0)
loss_g.backward()
auto_grad = Zg.grad.clone()

pair_weight = beta0 * (torch.sigmoid(u_g) - 1.0) / P    # ∂ℓ/∂u，再除以 P（mean）
hand_grad = torch.zeros_like(Z_ref)
for k in range(P):
    hand_grad[k, W[k]] += pair_weight[k]
    hand_grad[k, L[k]] -= pair_weight[k]

print("autograd ∂loss/∂Z =\n", auto_grad)
print("手推     ∂loss/∂Z =\n", hand_grad)
print("max|autograd - 手推| =", float((auto_grad - hand_grad).abs().max()))
print("→ 每行只有 chosen / rejected 两个位置非零，其余为 0（softmax 归一化项抵消）")