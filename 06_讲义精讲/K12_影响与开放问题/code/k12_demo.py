# -*- coding: utf-8 -*-
"""K12 选读课 · 轻量实测：Good-Turing「未见过事件」的概率质量

为什么做这个 demo：
  lec16 p13–p20 的核心论证（Kalai & Vempala 2024 / Kalai et al. 2025）是：
  「一个校准(calibrated)的语言模型**必须**产生幻觉」——因为它要给训练里
  没出现过的事件预留非零概率质量，而一旦被逼着输出具体答案，预留的那部分
  质量就落在它其实不知道的答案上。
  slides 用 Good-Turing 估计量说明「未见过事件的概率 ≈ 只出现一次事件的概率」。
  这个量是可算的。本脚本把它在一个**仓库内真实文本**上算出来。

边界（务必先读）：
  · slides 讲的是「任意事实(arbitrary facts)」，不是词。这里用词型/词次做一个
    可算的代理，共享同一套 Good-Turing 思想，但**不是 slides 的原始设定**。
  · 数据是仓库自带的 GSM8K 前 100 题题目文本（真实、可复现），不是 slides 里的数据。
  · 只用 numpy + 标准库，不装包、不下载。

运行：
  C:/Users/TANGWENJIAN/.workbuddy/binaries/python/envs/default/Scripts/python.exe -B 06_讲义精讲/K12_影响与开放问题/code/k12_demo.py
"""

import json
import re
from collections import Counter

import numpy as np

DATA = "02_Assignments/a4/cs224n-A4-student/data/gsm8k_first_100.jsonl"
TOKEN = re.compile(r"[a-z0-9]+")


def load_questions(path):
    qs = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            qs.append(json.loads(line)["question"])
    return qs


def tokens(text):
    return TOKEN.findall(text.lower())


def main():
    qs = load_questions(DATA)
    print("=" * 64)
    print("K12 demo：Good-Turing「未见过事件」概率质量（真实语料，可复现）")
    print("=" * 64)
    print(f"数据：{DATA}")
    print(f"题目数：{len(qs)}")

    # ---- 1. 全量词频统计 ----
    all_tokens = [t for q in qs for t in tokens(q)]
    freq = Counter(all_tokens)
    N = len(all_tokens)                      # 词次 tokens
    V = len(freq)                            # 词型 types
    N_r = Counter(freq.values())             # N_r = 恰好出现 r 次的词型数

    print("\n[1] 全量统计")
    print(f"    词次 N = {N}")
    print(f"    词型 V = {V}")
    print(f"    只出现 1 次的词型 N_1 = {N_r[1]}  ({N_r[1]/V:.1%} of types)")
    print(f"    出现 2 次 N_2 = {N_r[2]}，出现 3 次 N_3 = {N_r[3]}")

    # Good-Turing 直觉：未见过事件概率 ≈ 只出现一次事件概率
    unseen_mass = N_r[1] / N
    print(f"\n[2] Good-Turing 估计：P(未见过事件) ≈ N_1 / N = "
          f"{N_r[1]}/{N} = {unseen_mass:.3f}  ({unseen_mass:.1%})")
    print("    解读：在一个校准模型里，约这么高比例的概率质量必须留给")
    print("          '训练样本里从未出现过'的事件。这就是幻觉的原理性来源。")

    # ---- 3. 用「留出法」验证这个估计靠不靠谱 ----
    # 前 50 题当训练，后 50 题当测试：看测试集里有多少词次是训练集没见过的(OOV)
    train = Counter(t for q in qs[:50] for t in tokens(q))
    test_tokens = [t for q in qs[50:] for t in tokens(q)]
    oov_tokens = sum(1 for t in test_tokens if t not in train)
    test_types = set(test_tokens)
    oov_types = sum(1 for t in test_types if t not in train)

    print("\n[3] 留出法参照（前 50 题→训练，后 50 题→测试）")
    print(f"    测试集 OOV 词次占比 = {oov_tokens}/{len(test_tokens)} = "
          f"{oov_tokens/len(test_tokens):.1%}")
    print(f"    测试集 OOV 词型占比 = {oov_types}/{len(test_types)} = "
          f"{oov_types/len(test_types):.1%}")
    print("    注：这不是 [2] 那个量的等价核对。它明显更大，原因是语料极小")
    print("        且做了 50/50 划分——词型口径下多数词只在一半里出现过。")
    print("        它只说明一件事：'没见过的东西占比很大'在这个规模下成立，")
    print("        不能拿来反推 [2] 的数值准确与否。")

    # ---- 4. Zipf 形状：少量高频词吃掉大部分词次 ----
    freqs_sorted = np.array(sorted(freq.values(), reverse=True))
    cum = np.cumsum(freqs_sorted) / N
    for topk in (1, 10, 50, 100):
        if topk <= V:
            print(f"\n[4] Zipf：词频最高的 {topk:>3} 个词型覆盖 "
                  f"{cum[topk-1]:.1%} 的词次")

    # ---- 5. 结论（区分事实与解读）----
    print("\n" + "=" * 64)
    print("结论")
    print("=" * 64)
    print(f"【实测】真实 GSM8K 题目文本上：N={N} 词次、V={V} 词型、")
    print(f"        N_1={N_r[1]}，Good-Turing 未见过质量估计 N_1/N={unseen_mass:.3f}。")
    print("【解读，非实测】这个量不能被压到 0：它是'校准'的代价(Fact)。")
    print("        把它当成对 lec16「校准模型必须产生幻觉」结论的一个可算例证；")
    print("        数值随语料域与规模变化，不是普适常数。")


if __name__ == "__main__":
    main()