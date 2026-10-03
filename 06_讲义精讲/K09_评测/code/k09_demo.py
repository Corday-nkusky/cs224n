"""
K09 demo —— 评测机制的机制验证（EM/F1、pass@k、judge 偏置、数据污染）

只需 numpy（+ 标准库 itertools）。无外部 API、无新依赖。
运行（cwd = 06_讲义精讲/K09_评测）：
    D:/code/anaconda/envs/pytorch_env/python.exe code/k09_demo.py

输出与 06_讲义精讲/K09_评测/03_动手验证.md 逐节对应。
"""
import numpy as np
from itertools import combinations
from math import comb

np.set_printoptions(precision=6, suppress=True)


def hdr(t):
    print("\n" + "=" * 68)
    print(t)
    print("=" * 68)


# ======================================================================
# §1 从零实现 EM 与 token-F1
#     EM   = 归一化后字符串完全相等
#     F1   = token 级的 precision/recall 调和平均（SQuAD 口径）
# ======================================================================
hdr("§1 EM 与 token-F1 从零实现")

import re, string

ARTICLES = {"a", "an", "the"}


def _white(s):
    return re.sub(r"\s+", " ", s).strip()


def normalize(s):
    """SQuAD 风格的 light normalize：小写、去标点、去冠词、压空白。"""
    s = s.lower()
    s = "".join(ch for ch in s if ch not in set(string.punctuation))
    s = " ".join(w for w in s.split() if w not in ARTICLES)
    return _white(s)


def em(pred, gold):
    return float(normalize(pred) == normalize(gold))


def token_f1(pred, gold):
    p, g = normalize(pred).split(), normalize(gold).split()
    if len(p) == 0 or len(g) == 0:
        return float(p == g)
    common = 0
    g_pool = list(g)
    for w in p:
        if w in g_pool:
            common += 1
            g_pool.remove(w)              # 计数口径：多重集合交集
    if common == 0:
        return 0.0
    precision = common / len(p)
    recall = common / len(g)
    return 2 * precision * recall / (precision + recall)


cases = [
    ("72", "72", "完全一致"),
    ("72.", "72", "多了句点"),
    ("the cat sat", "the cat sat on the mat", "少说了后半句"),
    ("yes", "no", "答错"),
    ("1942", "1924", "数字差一点"),
]
print(f"{'pred':<22}{'gold':<24}{'EM':>5}{'F1':>9}   说明")
for pred, gold, note in cases:
    print(f"{pred:<22}{gold:<24}{em(pred, gold):>5.0f}{token_f1(pred, gold):>9.4f}   {note}")
print("→ EM 只认'整串相等'，对措辞/多余标点零容忍；F1 认'部分对上'，")
print("  但两个都不懂语义：'yes' 和 'no' 的 F1 是 0，而 'the cat sat' 只有一半内容却得 F1>0.6。")


# ======================================================================
# §2 pass@k 的无偏估计：1 - C(n-c, k) / C(n, k)
#     验证公式 == 蒙特卡洛（从 n 个样本无放回抽 k 个，至少一个正确的概率）
# ======================================================================
hdr("§2 pass@k 的无偏估计 vs 蒙特卡洛")

def pass_at_k(n, c, k):
    """Codex/HumanEval 的无偏估计：n 个样本里 c 个正确，抽 k 个至少一个正确。"""
    if k > n - c:                     # 剩下的全对，必然命中
        return 1.0
    return 1.0 - comb(n - c, k) / comb(n, k)


n, c = 20, 6
rng = np.random.default_rng(0)
trials = 200_000
print(f"设定：每题生成 n={n} 个样本，其中 c={c} 个正确；k = 从这 n 个里取几个来评分")
print(f"{'k':>4}{'公式 pass@k':>14}{'蒙特卡洛':>14}{'|差|':>12}")
for k in [1, 2, 5, 10, 20]:
    formula = pass_at_k(n, c, k)
    # hypergeometric(ngood=正确数, nbad=错误数, nsample=k) 抽到正确样本的个数
    draws = rng.hypergeometric(c, n - c, k, size=trials)
    mc = float((draws > 0).mean())
    print(f"{k:>4}{formula:>14.6f}{mc:>14.6f}{abs(formula - mc):>12.6f}")
print("→ 公式与蒙特卡洛一致到约 1e-3（MC 的抽样误差量级）。")
print(f"  注意 k={n} 时 pass@{n}=1.0：把全部样本都取来，只要有一个对就命中——")
print("  pass@k 随 k 单调上升，所以'pass@k 数字'离开 k 没有意义。")


# ======================================================================
# §3 LLM-as-judge 的偏置：位置偏置 / 长度（啰嗦）偏置
#     构造一个"只看位置或只看长度"的假 judge，显示打分翻转
# ======================================================================
hdr("§3 judge 偏置模拟：位置偏置与长度偏置")

# ---- 3.1 位置偏置：同一对答案换个顺序，赢家翻转 ----
def judge_pick_first(a, b):
    """假 judge：永远选第一个（槽位 1）。"""
    return "1"


items = 30
decisions = []
for _ in range(items):
    decisions.append(judge_pick_first("respX", "respY"))          # X 在前
win_when_first = sum(d == "1" for d in decisions) / items
decisions_swapped = []
for _ in range(items):
    decisions_swapped.append(judge_pick_first("respY", "respX"))  # Y 在前
win_when_second = sum(d == "1" for d in decisions_swapped) / items
print(f"[位置偏置] 30 对完全相同的内容，只是交换左右槽位：")
print(f"  '槽位1 的胜率' = {win_when_first:.2f}（X 在左）")
print(f"  交换后 X 的胜率 = {1 - win_when_second:.2f}")
print(f"  同一份答案，仅因换了个位置，胜率从 {win_when_first:.2f} 掉到 {1 - win_when_second:.2f}"
      f"（翻转率 {win_when_first - (1 - win_when_second):.2f}）")
print("  → 内容没变、结论反向：这就是'位置/顺序偏置'。")

# ---- 3.2 长度偏置：judge 只挑更长的，长度与内容无关时也能造出赢家 ----
def judge_pick_longer(ra, rb):
    return "1" if len(ra) >= len(rb) else "2"


rng = np.random.default_rng(1)
pairs = 100
long_win = 0
for _ in range(pairs):
    short = "short but correct."
    long = short + " " + " ".join(["extra"] * 15)   # 内容相同，只多说废话
    long_win += (judge_pick_longer(long, short) == "1")   # 把长的放槽位1
print(f"\n[长度偏置] {pairs} 对：一句正确短答 vs 同一句+15 个废话词的'冗长版'")
print(f"  冗长版的胜率 = {long_win / pairs:.2f}（内容毫无增加）")
# 让 E 被系统性写得更长（模型 E 的 system prompt 就是"回答得啰嗦些"），质量对等
E_win = 0
for _ in range(pairs):
    E_long = "correct answer." + " " + " ".join(["extra"] * 15)   # E 啰嗦
    F_short = "correct answer."                                    # F 简洁、质量相同
    E_win += (judge_pick_longer(E_long, F_short) == "1")           # E 放槽位1
print(f"  质量对等、但模型 E 被系统性写得更长时，E 的胜率 = {E_win / pairs:.2f}")
print("  → E 的赢率由'谁更长'而非'谁更好'决定：这就是 verbosity bias。")

# ---- 3.3 用"真值"口径量化：位置偏置会把无差别的 50% 抬到 100% ----
print("\n[量化] 若两份回答真实质量相等（真胜率应为 0.50，且含平局）：")
print(f"  只看位置的 judge 给出的'非平局率' = {win_when_first:.2f}（100% 都判出赢家），")
print("  真值 0% 差距被虚构成 ~100% 的判定——**假阳性分歧**。")


# ======================================================================
# §4 数据污染：把测试集答案泄露进训练集，准确率虚高
#     并演示用 n-gram 重叠检测污染（slides p73：常用 8-13 gram）
# ======================================================================
hdr("§4 数据污染：泄露答案 → 准确率虚高 + n-gram 检测")

N = 100
BASE = 0.45                       # 模型真实水平（无污染时每题答对概率）
rng = np.random.default_rng(7)

# 每题：模型是否本就能答对（与是否被泄露无关的"真实正确"）
truth = rng.random(N) < BASE
# 一致但更自然的记法：baseline accuracy
baseline_acc = truth.mean()

# 污染：把前 50 题的答案原样放进"训练语料"
leak_idx = np.arange(0, 50)
# 被泄露的题：在测试时几乎必答对（p=0.97），未泄露的维持原水平
contaminated = truth.copy()
for i in leak_idx:
    contaminated[i] = rng.random() < 0.97
contaminated_acc = contaminated.mean()

print(f"测试集 {N} 题，模型真实水平 p={BASE}")
print(f"  无污染 准确率 = {baseline_acc:.2f}")
print(f"  泄露前 50 题答案后 准确率 = {contaminated_acc:.2f}")
print(f"  污染抬升 = {contaminated_acc - baseline_acc:+.2f}（凭空多出来的'能力'）")

# ---- n-gram 重叠检测（slides p73：检查 exact/near-exact 的 8-13 gram）----
def ngram_set(text, n):
    w = text.split()
    return {" ".join(w[i:i + n]) for i in range(len(w) - n + 1)}


def item_text(i, leaked):
    if leaked:
        return ("natalia sold clips to friends in april then she sold half as many "
                f"clips in may how many altogether {i} answer {i * 7 + 3}")
    return (f"quantum lampshade debated the viscosity of tugboats grade {i} "
            f"zeta omega kappa {i * 13 + 1}")


# "训练语料" = 被泄露的 50 题（逐字原样）+ 200 条无关文本
leak_set = set(int(i) for i in leak_idx)
train_corpus = [item_text(i, True) for i in leak_idx] + [f"unrelated doc {j} kappa lambda {j % 7}" for j in range(200)]
train_8grams = set()
for doc in train_corpus:
    train_8grams |= ngram_set(doc, 8)


def overlap_count(text):
    return len(ngram_set(text, 8) & train_8grams)


flagged = {i for i in range(N) if overlap_count(item_text(i, i in leak_set)) > 0}
tp = len(flagged & leak_set)
fp = len(flagged - leak_set)
fn = len(leak_set - flagged)


def prf(tp, fp, fn):
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return p, r, f


p, r, f = prf(tp, fp, fn)
print(f"\n[n-gram 检测] 用 8-gram 重叠扫描测试集 vs 训练语料：")
print(f"  被标记 = {len(flagged)} 题；其中真泄露 {tp} 题，误报 {fp} 题，漏报 {fn} 题")
print(f"  precision={p:.2f}  recall={r:.2f}  F1={f:.2f}（逐字复制的情况能被精确抓出）")

# 规避演示：只改几处措辞（近义替换），8-gram 全部失效
orig = item_text(0, True)
evaded = ("sara traded badges to peers in march then she traded half as many "
          "badges in june how many total 0 answer 3")
print(f"  逐字复制一题的 8-gram 重合数 = {overlap_count(orig)}")
print(f"  改 7 处措辞（near-duplicate）后重合数 = {overlap_count(evaded)} → 不再被标记")
print("→ 污染不会报错、不改变代码，只会让榜单数字变好看；")
print("  8-gram 重叠是常用的事后发现手段，但对 paraphrase 型污染（近义改写）会漏报。")

print("\n[小结] 真实水平 p=0.45 的模型，仅因测试集被泄露 50%，automatic 准确率显示"
      f" {baseline_acc:.2f} → {contaminated_acc:.2f}。")