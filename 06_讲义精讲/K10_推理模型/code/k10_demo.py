"""
K10 demo —— 推理模型（CoT / test-time compute）的机制验证

自造合成任务，不下载模型、不装新包，只需 numpy。
确定性：所有随机数都来自固定 seed 的 default_rng。

运行（cwd = K10 目录）：
    D:/code/anaconda/envs/pytorch_env/python.exe code/k10_demo.py

输出与 06_讲义精讲/K10_推理模型/03_动手验证.md 逐节对应。

合成任务设定（"会犯错但可模拟"的策略）：
  题目：s_0 = 种子；s_t = (s_{t-1} * 31 + a_t) mod M，a_t 是一位数字，共 n=5 步。
  答案：s_n。
  直接答  ：不做中间步骤，必须在"脑子里"一次算完 n 步；每步内部成功率 q_int，
            所以整题正确率 = q_int^n，错了就吐一个随机错值。
  分步答(CoT)：把每步中间结果写进草稿纸；每步正确率 p_step，任一步错则整题错，
            错了吐随机错值（§4 额外给"瞎猜撞对"通道，模拟奖励攻击）。
"""
import numpy as np

np.set_printoptions(precision=6, suppress=True)

SEED = 20261002
M = 1_000_000_007          # 大模数：保证错答案空间极大、互不相同
N_STEPS = 5                # 链长
Q_INT = 0.60               # "直接答"每步内部成功率
P_STEP = 0.90              # "分步答"每步正确率
N_DECOY = 20               # 每题的错误答案池大小（决定多数投票的天花板）
GUESS_PROB = 0.15          # §4：推理错时"瞎猜撞对"的概率（奖励攻击来源）


def hdr(t):
    print("\n" + "=" * 68)
    print(t)
    print("=" * 68)


# ----------------------------------------------------------------------
# 合成任务
# ----------------------------------------------------------------------
def true_answer(s0, addends):
    s = s0
    for a in addends:
        s = (s * 31 + int(a)) % M
    return s


def make_problem(rng):
    addends = rng.integers(0, 10, size=N_STEPS)
    s0 = int(rng.integers(0, M))
    return s0, addends, true_answer(s0, addends)


def make_decoys(true, rng):
    """每题一个错误答案池：N_DECOY 个互不相同的错值。"""
    out = set()
    while len(out) < N_DECOY:
        v = int(rng.integers(0, M))
        if v != true:
            out.add(v)
    return np.array(sorted(out), dtype=np.int64)


def sample_direct(true, decoys, rng):
    """直接答：一次算完 n 步，每步内部成功率 Q_INT。"""
    ok = rng.random(N_STEPS) < Q_INT
    if ok.all():
        return true, True
    return int(rng.choice(decoys)), False


def sample_chain(true, decoys, rng, guess_prob=0.0):
    """分步答：每步正确率 P_STEP；任一步错则整题错（除非瞎猜撞对）。"""
    ok = rng.random(N_STEPS) < P_STEP
    reasoning_ok = bool(ok.all())
    if reasoning_ok:
        ans = true
    elif rng.random() < guess_prob:
        ans = true                      # 推理错但末答案撞对——奖励攻击的落点
    else:
        ans = int(rng.choice(decoys))
    # 链长：错误链更长（胡言乱语/反复），用来演示"长度不是准度"
    if reasoning_ok:
        length = N_STEPS + int(rng.poisson(3))
    else:
        length = N_STEPS + 4 + int(rng.poisson(8))
    return ans, reasoning_ok, length


def majority_vote(answers, rng):
    """多数投票；并列时在得票最高的候选里随机挑一个（公平、不偏袒正解）。"""
    vals, counts = np.unique(answers, return_counts=True)
    mx = counts.max()
    cands = vals[counts == mx]
    if len(cands) == 1:
        return int(cands[0])
    return int(rng.choice(cands))


# ======================================================================
# §1 直接答 vs 分步答（单样本）
# ======================================================================
def sec1():
    hdr("§1 直接答 vs 分步答（单样本准确率）")
    rng = np.random.default_rng(SEED + 1)
    N = 20000
    d_ok = c_ok = 0
    for _ in range(N):
        s0, add, true = make_problem(rng)
        decoys = make_decoys(true, rng)
        _, okd = sample_direct(true, decoys, rng)
        _, okc, _ = sample_chain(true, decoys, rng)
        d_ok += okd
        c_ok += okc
    print(f"题目：{N_STEPS} 步链式递推（模 1e9+7），每题 1 次作答，共 {N} 题")
    print(f"直接答  每步内部成功率 q_int = {Q_INT}")
    print(f"分步答  每步正确率      p_step = {P_STEP}")
    print(f"理论：直接答 = q_int^n = {Q_INT**N_STEPS:.4f}；"
          f"分步答 = p_step^n = {P_STEP**N_STEPS:.4f}")
    print(f"[实测] 直接答 准确率 = {d_ok/N:.4f}  ({d_ok}/{N})")
    print(f"[实测] 分步答 准确率 = {c_ok/N:.4f}  ({c_ok}/{N})")
    print(f"[实测] 分步答 − 直接答 = {(c_ok-d_ok)/N:.4f}")
    print("→ 同样一步错就全错，分步答只是把'一次憋 n 步'拆成'n 次各一小步'，")
    print("  每小步更容易做对，整题正确率因此抬起来。")


# ======================================================================
# §2 self-consistency：多次采样 + 多数投票
# ======================================================================
def sample_matrix(N, K, guess_prob, rng, mode="chain"):
    """返回 (正确掩码 N×K, 长度 N×K)。"""
    corr = np.zeros((N, K), dtype=bool)
    lens = np.zeros((N, K), dtype=int)
    for i in range(N):
        s0, add, true = make_problem(rng)
        decoys = make_decoys(true, rng)
        for j in range(K):
            if mode == "chain":
                ans, ok, length = sample_chain(true, decoys, rng, guess_prob)
            else:
                ans, ok = sample_direct(true, decoys, rng)
                length = N_STEPS + int(rng.poisson(3))
            corr[i, j] = (ans == true)
            lens[i, j] = length
    return corr, lens


def sec2(rng, chain_corr, chain_lens, ks):
    hdr("§2 self-consistency：k 次采样多数投票")
    N, K = chain_corr.shape
    print(f"每题独立采样 K={K} 条分步链，N={N} 题；单样本准确率≈{chain_corr[:,0].mean():.4f}")
    print(f"{'k':>4} {'多数投票':>10} {'k 条里至少一条对(上限)':>22}")
    for k in ks:
        acc_mv = 0
        acc_any = 0
        for i in range(N):
            ok = chain_corr[i, :k]
            acc_any += int(bool(ok.any()))
            acc_mv += _majority_from_mask(ok, rng)
        print(f"{k:>4} {acc_mv/N:>10.4f} {acc_any/N:>22.4f}")
    print("→ 单样本越准，k 增大时多数投票越快接近上限；这是 test-time scaling 的雏形。")


def _majority_from_mask(ans_ok, rng):
    """由某题的 k 条样本是否正确的掩码，模拟多数投票是否命中正解。
    正确样本全投真答案；错误样本把票投给池中随机错值（可碰撞）。"""
    k = len(ans_ok)
    c = int(ans_ok.sum())
    wrong = k - c
    if wrong == 0:
        return 1
    # wrong 张错票分派到 N_DECOY 个错值
    votes = rng.integers(0, N_DECOY, size=wrong)
    max_wrong = np.bincount(votes, minlength=N_DECOY).max()
    if c > max_wrong:
        return 1
    if c < max_wrong:
        return 0
    # 并列：正解与某个错值同为最高票，随机挑
    n_tied_wrong = int((np.bincount(votes, minlength=N_DECOY) == max_wrong).sum())
    return int(rng.random() < 1.0 / (1 + n_tied_wrong))


# ======================================================================
# §3 test-time compute 缩放：预算 k vs 准确率（不同"验尸/筛选"方式）
# ======================================================================
def sec3(chain_corr, direct_corr, ks):
    hdr("§3 test-time compute 缩放：采样预算 k vs 准确率")
    N, K = chain_corr.shape
    V_ORM = 0.80  # 结果奖励模型(ORM)识别的成功率
    rng = np.random.default_rng(SEED + 9)
    print(f"N={N} 题，K={K} 次采样。四种「花钱」方式：")
    print("  CoT-多数投票      ：不训练 verifier，直接投票（self-consistency）")
    print("  CoT-Best-of-N 完美：假设 verifier 一定挑出正确解（理论上限）")
    print(f"  CoT-Best-of-N ORM ：结果奖励模型，v={V_ORM} 挑对、其余随机挑")
    print("  Direct-多数投票   ：不做 CoT，也照样投票（对照组）")
    head = f"{'k':>4} {'CoT-MV':>9} {'CoT-BoN完美':>12} {'CoT-BoN_ORM':>12} {'Direct-MV':>10}"
    print(head)
    for k in ks:
        cot_mv = cot_bon = cot_orm = dir_mv = 0
        for i in range(N):
            okc = chain_corr[i, :k]
            okd = direct_corr[i, :k]
            cot_mv += _majority_from_mask(okc, rng)
            cot_bon += int(bool(okc.any()))
            if okc.any():
                cot_orm += 1 if rng.random() < V_ORM else int(rng.random() < okc.mean())
            dir_mv += _majority_from_mask(okd, rng)
        print(f"{k:>4} {cot_mv/N:>9.4f} {cot_bon/N:>12.4f} "
              f"{cot_orm/N:>12.4f} {dir_mv/N:>10.4f}")
    print("→ 同样加预算：CoT 的曲线从更高起点爬、更快到顶；")
    print("  Direct 起点极低，多采样也追不上——test-time compute 放大的")
    print("  是'已经有救'的推理能力，不是凭空造能力。")
    print("→ 完美 verifier 明显高于多数投票；ORM 只识别 80% 时介于两者之间。")
    print("  这就是 slides 那句 'invest in verification'。")


# ======================================================================
# §4 代价：奖励攻击 / 虚假推理 / 长度不是准度
# ======================================================================
def sec4():
    hdr("§4 代价：奖励攻击、虚假推理、长度不是准度")
    rng = np.random.default_rng(SEED + 4)
    N = 20000
    corr = reason_ok = hacked = 0
    for _ in range(N):
        s0, add, true = make_problem(rng)
        decoys = make_decoys(true, rng)
        ans, rok, _ = sample_chain(true, decoys, rng, guess_prob=GUESS_PROB)
        c = (ans == true)
        corr += c
        reason_ok += rok
        hacked += (c and not rok)          # 末答案对、但推理是错的
    print("\n(a) 奖励攻击：结果奖励只看末答案，会给'推理错但撞对'的链发奖金")
    print(f"    瞎猜撞对通道 guess_prob = {GUESS_PROB}")
    print(f"[实测] 推理真的对          = {reason_ok/N:.4f}")
    print(f"[实测] 末答案对(含撞对)     = {corr/N:.4f}")
    print(f"[实测] 末答案对但推理错     = {hacked/N:.4f}")
    print(f"[实测] '末答案对'里有多少是撞对的(奖励攻击率) = {hacked/corr:.4f}")
    print("    → 只优化末答案的 RLVR，会把这份比例的错误推理一起奖励。")

    # (b) 长度不是准度：错误链平均更长
    rng2 = np.random.default_rng(SEED + 5)
    N2, K = 3000, 8
    corr_l, wrong_l = [], []
    corr_m8 = np.zeros((N2, K), dtype=bool)
    len_m8 = np.zeros((N2, K), dtype=int)
    for i in range(N2):
        s0, add, true = make_problem(rng2)
        decoys = make_decoys(true, rng2)
        for j in range(K):
            ans, rok, length = sample_chain(true, decoys, rng2)
            corr_m8[i, j] = (ans == true)
            len_m8[i, j] = length
            (corr_l if rok else wrong_l).append(length)
    print(f"\n(b) 长度不是准度：随机 N={N2} 题、每题 8 条链")
    print(f"[实测] 推理正确链 平均长度 = {np.mean(corr_l):.2f}  (n={len(corr_l)})")
    print(f"[实测] 推理错误链 平均长度 = {np.mean(wrong_l):.2f}  (n={len(wrong_l)})")
    # 三种从 8 条里挑一条的方式
    acc_first = corr_m8[:, 0].mean()
    idx_long = len_m8.argmax(axis=1)
    acc_long = float(np.take_along_axis(corr_m8, idx_long[:, None], axis=1).mean())
    acc_oracle = float(corr_m8.any(axis=1).mean())
    print(f"[实测] 挑第一条(≈随机)  准确率 = {acc_first:.4f}")
    print(f"[实测] 挑最长的一条     准确率 = {acc_long:.4f}")
    print(f"[实测] 完美 verifier 挑 准确率 = {acc_oracle:.4f}")
    print("    → '挑最长'比随机还差：错误链更长，长度启发式会被自己骗。")

    print("\n(c) 手写的'看似对但错'示例（静态文本，演示虚假推理）")
    print("    题目：17 × 3 = ?")
    print("    看似对但错（结构完整、语气自信、结论错）：")
    print("      '17 × 3 = (10 + 7) × 3 = 10×3 + 7 = 30 + 7 = 37'")
    print("      —— 错误在 7×3 被写成 7；每一步都像模像样，末答案错。")
    print("    格式奖励可被刷（有  thinking 标签、有'因此'，内容却是空的）：")
    print("      ' thinking让我一步步想……先分析，再检验，最后综合。因此答案是 37。'")
    print("      —— 结构奖励 +1，准确率奖励 0：RLVR 里格式项压过质量项就走这条路。")


# ======================================================================
def main():
    ks = [1, 3, 5, 7, 9, 11, 15, 21, 31]
    # §1
    sec1()
    # 预采样给 §2 §3 共用
    rng = np.random.default_rng(SEED + 2)
    N2, K = 3000, 32
    chain_corr, chain_lens = sample_matrix(N2, K, 0.0, rng, mode="chain")
    direct_corr, _ = sample_matrix(N2, K, 0.0, rng, mode="direct")
    sec2(np.random.default_rng(SEED + 3), chain_corr, chain_lens, ks)
    sec3(chain_corr, direct_corr, ks)
    # §4
    sec4()
    print("\n" + "=" * 68)
    print("完成。所有数字可用同一条命令复现（seed 固定）。")
    print("=" * 68)


if __name__ == "__main__":
    main()