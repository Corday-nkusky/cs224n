"""
把 K01 负采样/哈夫曼交互要用的真实词频表导出成 JSON。
数据来源与 06_讲义精讲/K01_词向量与分布语义/code/k01_huffman_neg.py 完全一致
（IMDB unsupervised 50k，HF 本地缓存，强制离线），保证浏览器里的交互
能复现 logs/k01_huffman_neg_out.txt 的数字。

用法：
    D:/code/anaconda/envs/pytorch_env/python.exe site/tools/dump_freq.py
产物：
    site/reference/imdb2000_freq.json
"""

import collections
import json
import os
import re
import sys

TOP_V = 2000


def main() -> int:
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("HF_DATASETS_OFFLINE", "1")
    from datasets import load_dataset

    ds = load_dataset("stanfordnlp/imdb", split="unsupervised")
    text = "\n".join(ds["text"])

    tokens = re.findall(r"[a-z']+", text.lower())
    total_tokens = len(tokens)
    cnt = collections.Counter(tokens)
    items = cnt.most_common(TOP_V)

    # 注意：logs/k01_huffman_neg_out.txt 里的 T=9,846,798 是【top-2000 词内部的计数和】，
    # 不是全语料 token 数。原脚本 exp_a 用的是 counts.sum()，而 counts 只含 top_v 个词。
    # 百分比一律以 tokens_in_vocab 为分母才对得上日志。
    tokens_in_vocab = sum(c for _, c in items)

    payload = {
        "source": "IMDB unsupervised 50k (stanfordnlp/imdb, HF local cache, offline)",
        "tokenizer": r"[a-z']+ on text.lower()",
        "total_tokens_all": total_tokens,
        "tokens_in_vocab": tokens_in_vocab,
        "V": len(items),
        "words": [w for w, _ in items],
        "counts": [c for _, c in items],
    }

    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "..", "reference", "imdb2000_freq.json")
    out = os.path.abspath(out)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    # 自检：和 logs/k01_huffman_neg_out.txt 的前几个数字对账
    print(f"写入 {out}")
    print(f"V={payload['V']}  全语料 token={total_tokens}  top-V 内计数和={tokens_in_vocab}")
    assert tokens_in_vocab == 9846798, f"与日志的 T=9,846,798 不一致：{tokens_in_vocab}"
    print("前 8 个词（词 / 频次 / 在 top-V 内的占比%）:")
    for w, c in items[:8]:
        print(f"  {w:<10} {c:>8}  {100.0 * c / tokens_in_vocab:.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
