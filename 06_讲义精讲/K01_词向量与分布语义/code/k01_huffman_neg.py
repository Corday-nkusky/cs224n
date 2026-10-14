"""
K01 补充验证：负采样的噪声分布 + 哈夫曼树 / 层次 softmax
=====================================================

跑四组实验，每组都能独立对账：

  A. 噪声分布指数 alpha 的影响：P_n(w) ∝ U(w)^alpha，alpha = 0 / 0.5 / 0.75 / 1.0
  B. 用真实词频建一棵哈夫曼树，打印路径，比对"高频词路径短"
  C. 复杂度对账：平均路径长度 vs log2(W) vs 均匀树
  D. 层次 softmax 的概率公式数值校验：sum_w p(w | w_I) == 1

依赖: numpy (+ datasets，仅当 --source imdb 时需要；语料已缓存在本机)
运行:
    python k01_huffman_neg.py                 # 默认用 IMDB unsupervised 50k
    python k01_huffman_neg.py --source local  # 用项目内小语料，无网络依赖
"""

import argparse
import collections
import heapq
import math
import os
import re
import sys

import numpy as np

TOP_V = 2000          # 取词频最高的前 TOP_V 个词建树
SEED = 20261006


# =========================================================
# 语料：拿词频
# =========================================================
def load_counts(source: str, top_v: int):
    """返回 (word_list, counts)，按词频降序，长度 = min(top_v, 词表大小)"""
    if source == "imdb":
        # IMDB 已缓存在本机 HF 目录；强制离线。否则 datasets 会去 huggingface.co
        # 做 HEAD 探测，网络抖动时会反复重试卡住（2026-10-06 实测卡了 90 秒未完）。
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        os.environ.setdefault("HF_DATASETS_OFFLINE", "1")
        from datasets import load_dataset
        ds = load_dataset("stanfordnlp/imdb", split="unsupervised")
        text = "\n".join(ds["text"])
        origin = "IMDB unsupervised 50k（datasets 本地缓存，离线）"
    else:
        # 备用语料：内置玩具语料。注意 02_Assignments/a2/a2/data/en-cw.txt 是
        # 词向量文件（一行一个 float），不是自然语言语料，不能拿来算词频。
        here = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(here, "..", "..", "..", "04_Notes", "word2vec", "small_corpus.txt")
        if not os.path.exists(path):
            print(f"[!] 找不到本地语料 {path}，退回到内置玩具语料", file=sys.stderr)
            text = ("the king rules the kingdom and the queen wears a golden crown . "
                    "the king lives in a big palace near the river . "
                    "the queen is a woman and the king is a man . "
                    "paris is the capital of france and tokyo is the capital of japan . ") * 200
            origin = "内置玩具语料（25 词，只能看机制，不能看数值）"
        else:
            text = open(path, encoding="utf-8", errors="ignore").read()
            origin = path

    # 极简分词：只留 [a-z']，其余当分隔符
    tokens = re.findall(r"[a-z']+", text.lower())
    cnt = collections.Counter(tokens)
    items = cnt.most_common(top_v)
    words = [w for w, _ in items]
    counts = np.array([c for _, c in items], dtype=np.float64)
    return words, counts, origin


# =========================================================
# 实验 A：噪声分布指数 alpha
# =========================================================
def exp_a(words, counts, origin):
    print("=" * 74)
    print("实验 A  负采样噪声分布 P_n(w) ∝ U(w)^alpha 的影响")
    print("=" * 74)
    total = counts.sum()
    unigram = counts / total
    print(f"语料来源：{origin}")
    print(f"词表大小 V = {len(words)}，token 总数 T = {int(total):,}")
    print(f"最高频词：{', '.join(words[:8])}")
    print()
    print("【实测】各 alpha 下若干词被采为负样本的概率（%），并与 alpha=0.75 对比")
    print()

    idx = [words.index(w) for w in ["the", "a", "of", "and", "king", "queen", "man"]
           if w in words]
    head = [words.index(w) for w in words[:5]]
    rows = sorted(set(idx + head))
    label = {w: ("the" if w == "the" else w) for w in words}

    alphas = [0.0, 0.5, 0.75, 1.0]
    P = {a: (unigram ** a) / (unigram ** a).sum() for a in alphas}

    hdr = f"{'词':<10}{'unigram%':>10}" + "".join(f"{'a=' + str(a):>10}" for a in alphas) + f"{'倍数(a=1)':>12}"
    print(hdr)
    print("-" * len(hdr))
    base = P[0.75]
    for i in rows:
        line = f"{label[words[i]]:<10}{unigram[i] * 100:>10.3f}"
        for a in alphas:
            line += f"{P[a][i] * 100:>10.3f}"
        # 高频词被"压低"了多少倍
        line += f"{P[1.0][i] / base[i]:>12.2f}x"
        print(line)

    print()
    # 熵：分布越均匀熵越大
    print("【实测】噪声分布的熵（越大=越均匀；单位 nats）")
    for a in alphas:
        q = P[a]
        nz = q[q > 0]
        H = float(-(nz * np.log(nz)).sum())
        print(f"  alpha={a:<5} H = {H:.4f}   最高频词占比 = {q[0] * 100:6.3f}%")
    print()
    print("解读：alpha=1（纯词频）时最高频词一家独大，模型只要学会")
    print("      '看到这些就说不是邻居' 就能拿分，学不到细粒度区分；")
    print("      alpha=0（均匀）又太平均，常见但无关的词见不到；0.75 是折中。")
    print()


# =========================================================
# 哈夫曼树
# =========================================================
class Node:
    __slots__ = ("freq", "word", "left", "right", "heap_idx")

    def __init__(self, freq, word=None, left=None, right=None):
        self.freq = freq
        self.word = word      # 叶子才有
        self.left = left
        self.right = right


def build_huffman(words, counts):
    """贪心：每次弹出两个最小权节点合并。返回根节点。"""
    heap = []
    for i, (w, c) in enumerate(zip(words, counts)):
        n = Node(float(c), word=w)
        n.heap_idx = len(heap)
        heap.append((float(c), i, n))
    heapq.heapify(heap)
    nxt = len(heap)

    while len(heap) > 1:
        c1, _, n1 = heapq.heappop(heap)
        c2, _, n2 = heapq.heappop(heap)
        merged = Node(c1 + c2, left=n1, right=n2)
        heapq.heappush(heap, (merged.freq, nxt, merged))
        nxt += 1
    return heap[0][2]


def walk_paths(root, code="", out=None):
    """DFS 收集 word -> (路径比特串, 深度)。迭代实现，避免退化树爆栈。"""
    if out is None:
        out = {}
    stack = [(root, code)]
    while stack:
        node, c = stack.pop()
        if node.word is not None:
            out[node.word] = (c, len(c))
            continue
        if node.left is not None:
            stack.append((node.left, c + "0"))
        if node.right is not None:
            stack.append((node.right, c + "1"))
    return out


def build_huffman_random(words, counts, rng):
    """每次随机弹两个节点合并（不是取最小的两个）—— 构造一棵"非最优"对照树。"""
    heap = [(float(c), i, Node(float(c), word=w)) for i, (w, c) in enumerate(zip(words, counts))]
    nxt = len(heap)
    while len(heap) > 1:
        i1 = rng.integers(len(heap))
        n1 = heap.pop(i1)[2]
        i2 = rng.integers(len(heap))
        n2 = heap.pop(i2)[2]
        heap.append((n1.freq + n2.freq, nxt, Node(n1.freq + n2.freq, left=n1, right=n2)))
        nxt += 1
    return heap[0][2]


def tree_depth(root):
    if root.word is not None:
        return 0
    return 1 + max(tree_depth(root.left), tree_depth(root.right))


# =========================================================
# 实验 B / C：树结构 + 复杂度
# =========================================================
def exp_bc(words, counts):
    print("=" * 74)
    print("实验 B  用真实词频建哈夫曼树：高频词的路径确实更短")
    print("=" * 74)
    root = build_huffman(words, counts)
    paths = walk_paths(root)

    V = len(words)
    depths = np.array([paths[w][1] for w in words], dtype=np.float64)
    total = counts.sum()

    # 按词数平均 / 按词频加权平均
    avg_by_word = depths.mean()
    avg_by_freq = float((depths * counts).sum() / total)
    # 完全平衡的二叉树：所有词深度都是 ceil(log2 V)
    balanced = math.ceil(math.log2(V))
    log2V = math.log2(V)

    print(f"V = {V}，log2(V) = {log2V:.3f}，完全平衡树深度 = {balanced}")
    print()
    print("【实测】路径长度")
    print(f"  最长路径              = {int(depths.max())}")
    print(f"  最短路径              = {int(depths.min())}")
    print(f"  平均路径长（按词数）  = {avg_by_word:.3f}")
    print(f"  平均路径长（按词频）  = {avg_by_freq:.3f}   ← 这个才是实际期望代价")
    print(f"  平衡树按词频的加权    = {balanced:.3f}   （= 平衡树每词深度）")
    print()
    print(f"  哈夫曼 vs 平衡树的加权代价比 = {avg_by_freq / balanced:.3f}  → 省 {100 * (1 - avg_by_freq / balanced):.1f}%")
    print(f"  论文口径 '平均不超过 log2(W)'：{avg_by_freq:.3f} ≤ {log2V:.3f} ? "
          f"{'成立' if avg_by_freq <= log2V else '不成立'}")
    print()

    print("【实测】按词频排序，看前 12 个词的路径比特串（左=0 右=1）")
    print(f"  {'词':<12}{'频次':>8}{'占比%':>8}{'深度':>6}  路径")
    for w, c in list(zip(words, counts))[:12]:
        code, d = paths[w]
        print(f"  {w:<12}{int(c):>8}{c / total * 100:>8.3f}{d:>6}  {code}")
    print()
    print("【实测】尾部 8 个低频词的路径")
    for w, c in list(zip(words, counts))[-8:]:
        code, d = paths[w]
        print(f"  {w:<12}{int(c):>8}{c / total * 100:>8.3f}{d:>6}  {code}")
    print()
    print("结论：高频词拿到短码 —— 这就是哈夫曼树的全部意义。")
    print("      树形只由词频决定，不含任何句法/语义信息。")
    print()

    # 对照：随机合并树（同样合法，但带权路径长度不是最优）
    rng = np.random.default_rng(SEED)
    rand_depths = []
    for _ in range(20):
        rp = walk_paths(build_huffman_random(words, counts, rng))
        d = np.array([rp[w][1] for w in words], dtype=np.float64)
        rand_depths.append(float((d * counts).sum() / total))
    rand_avg = float(np.mean(rand_depths))

    best_huff = float((depths * counts).sum() / total)
    print(f"【实测】带权平均路径长（= 期望每词代价的代理，V={V}）")
    print(f"  哈夫曼树（贪心最优）    = {best_huff:.4f}")
    print(f"  随机合并树（20 次取平均）= {rand_avg:.4f}   → 是哈夫曼的 {rand_avg / best_huff:.3f} 倍")
    print(f"  完全平衡树               = {balanced:.4f}   → 是哈夫曼的 {balanced / best_huff:.3f} 倍")
    print()
    print("  平衡树每个词深度一样（不区分频率）；哈夫曼树让高频词走短路，")
    print("  所以带权平均更短 —— 这正是论文说的 'assigns short codes to the frequent words'。")
    print()

    return paths, root


# =========================================================
# 实验 D：层次 softmax 概率公式的数值校验
# =========================================================
def exp_d(words, counts, paths, D=16, trials=40):
    print("=" * 74)
    print("实验 D  层次 softmax 概率公式的数值校验")
    print("=" * 74)
    V = len(words)
    rng = np.random.default_rng(SEED)

    # 给每个内部节点一个向量 v'_n（这里用节点在堆里的编号近似；为简单，
    # 直接按"路径前缀"编号，保证不同节点拿到不同向量）
    prefix2id = {}
    for w in words:
        code, _ = paths[w]
        for j in range(len(code)):
            pref = code[:j]
            if pref not in prefix2id:
                prefix2id[pref] = len(prefix2id)
    n_inner = len(prefix2id)
    # prefix2id 里含空串（根节点），因此 len(prefix2id) 本身就是内部节点总数。
    # 理论值：W 个叶子的满二叉树有 W-1 个内部节点。
    print(f"内部节点数（路径前缀数，含根节点）= {len(prefix2id)}   理论值 W-1 = {V - 1}"
          f"   {'一致' if len(prefix2id) == V - 1 else '【不一致，需排查】'}")
    print(f"叶子数 = {V}")
    print("注意参数的归属：v_w 是【词】的向量（V 个），v'_n 是【内部节点】的向量（W-1 个），")
    print(f"      输出层总参数量 = (V + W-1)·D = {2 * V - 1}·D，与朴素 softmax 的 2VD 基本相同。")
    print("      省下来的不是参数量，是每步的【计算量】。")
    print()

    Vp = rng.normal(scale=0.5, size=(len(prefix2id), D))   # v'_n（含根节点）
    X = rng.normal(scale=0.5, size=(V, D))                # v_w

    def prob(wi, vI):
        code, _ = paths[words[wi]]
        p = 1.0
        for j in range(len(code)):
            nid = prefix2id[code[:j]]
            s = Vp[nid] @ vI
            p *= (1.0 / (1.0 + math.exp(-s))) if code[j] == "1" else 1.0 / (1.0 + math.exp(s))
        return p

    print("【实测】随机向量下 sum_w p(w | w_I)，理论上恒等于 1")
    print(f"  {'中心词':<12}{'sum_w p(w|w_I)':>18}{'最大单点概率':>16}")
    errs = []
    for _ in range(trials):
        i = rng.integers(V)
        vI = X[i]
        ps = np.array([prob(k, vI) for k in range(V)])
        s = ps.sum()
        errs.append(abs(s - 1.0))
        if len(errs) <= 6:
            print(f"  {words[i]:<12}{s:>18.12f}{ps.max():>16.6f}")
    errs = np.array(errs)
    print(f"  ...共 {trials} 次随机中心词")
    print(f"  |sum - 1| 最大 = {errs.max():.3e}   平均 = {errs.mean():.3e}")
    print()

    # 对比：naive softmax 的归一化
    U = rng.normal(scale=0.5, size=(V, D))
    e2 = []
    for _ in range(trials):
        i = rng.integers(V)
        s = U @ X[i]
        s = s - s.max()
        p = np.exp(s)
        p /= p.sum()
        e2.append(abs(p.sum() - 1.0))
    e2 = np.array(e2)
    print(f"  对照 naive softmax 的 |sum - 1| 最大 = {e2.max():.3e}")
    print("  → 两者都是合法概率分布。这是层次 softmax 相对负采样的关键优势：")
    print("    NEG 训练出来的分数【不是概率】，HS 是。")
    print()

    # 计算量对账
    print("【实测】单个训练对的乘加次数（以 V=100000, D=300, K=5 为参照）")
    Vb, Db, Kb = 100000, 300, 5
    print(f"  {'方法':<26}{'每对乘加次数':>18}{'相对 naive':>14}")
    rows = [
        ("naive softmax      O(V·D)", Vb * Db),
        ("hierarchical softmax O(L·D)", int(np.ceil(math.log2(Vb))) * Db),
        ("negative sampling  O((1+K)·D)", (1 + Kb) * Db),
    ]
    base = rows[0][1]
    for name, cost in rows:
        print(f"  {name:<26}{cost:>18,}{cost / base:>13.5f}x")
    print()
    print("  参照：log2(100000) = 16.6 是 log₂V 的理论上界；真实高频词的路径远短于此。")
    print("  两种优化都把代价从 3×10⁷ 量级打到 10³ 量级，量级差 4~5 个数量级。")
    print()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="imdb", choices=["imdb", "local"])
    ap.add_argument("--top-v", type=int, default=TOP_V)
    args = ap.parse_args()

    np.set_printoptions(suppress=True)
    words, counts, origin = load_counts(args.source, args.top_v)

    exp_a(words, counts, origin)
    paths, _ = exp_bc(words, counts)
    exp_d(words, counts, paths)

    print("=" * 74)
    print("事实分级")
    print("=" * 74)
    print("【论文原文】arXiv:1310.4546 §2.1：哈夫曼树、二叉树表示输出层、")
    print("            sum_w p(w|w_I)=1、代价正比于 L(w_O)、平均不超过 log2(W)。")
    print("【论文原文】arXiv:1310.4546 §2.2：P_n(w)=U(w)^{3/4}/Z，k 的建议取值 5-20 / 2-5。")
    print("【实测】以上脚本跑出的所有数字（分布、路径、代价、校验误差）。")
    print("【未验证】alpha=0.75 是否为最优、哈夫曼树的反例对照树的具体构造方式，")
    print("          都只在小规模词表上验证过，不能外推到真实语料。")


if __name__ == "__main__":
    main()
