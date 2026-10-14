# -*- coding: utf-8 -*-
"""
build_freq.py —— 把真实词频表包成 data/freq.js（离线可用）。

为什么要有这一步：浏览器从 file:// 打开时会拦掉 fetch，所以词频表不能放在 .json 里
等运行时去读，必须在构建期变成 <script> 能加载的 .js。

用法：
    python site/tools/build_freq.py
前置：
    site/reference/imdb2000_freq.json（由 tools/dump_freq.py 从 IMDB HF 缓存导出）
产物：
    site/data/freq.js
"""

import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(os.path.join(HERE, ".."))
FREQ_JSON = os.path.join(SITE, "reference", "imdb2000_freq.json")


def main() -> int:
    if not os.path.exists(FREQ_JSON):
        print("[!] 缺少 " + FREQ_JSON + "（先跑 tools/dump_freq.py）", file=sys.stderr)
        return 2

    with io.open(FREQ_JSON, encoding="utf-8") as f:
        freq = json.load(f)

    out = os.path.join(SITE, "data", "freq.js")
    with io.open(out, "w", encoding="utf-8", newline="") as f:
        f.write("/* 本文件由 tools/build_freq.py 生成，不要手改。\n")
        f.write("   源：reference/imdb2000_freq.json（tools/dump_freq.py 从 IMDB HF 缓存导出）。 */\n")
        f.write("window.KB = window.KB || {};\n")
        f.write("window.KB.freq = window.KB.freq || {};\n")
        f.write("window.KB.freq.imdb2000 = ")
        f.write(json.dumps(freq, ensure_ascii=False, separators=(",", ":")))
        f.write(";\n")

    print("写入 " + out)
    print("  V=%d  top-V 内计数和=%d" % (freq["V"], freq["tokens_in_vocab"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
