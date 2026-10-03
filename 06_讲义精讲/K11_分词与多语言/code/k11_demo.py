"""
K11 demo —— 分词与多语言的机制验证

内容：
  §1 从零实现 BPE，在 slides 的 Peter Piper 语料上复现前 6 次合并（对照 slides p26–53）
  §2 字节级 BPE + 多语言不均衡：同一句话，英文 vs 中文的 token 数与 tokens/char
  §3 词表大小 vs 序列长度：扫几种词表上限，看平均每词 token 数下降
  §4 未登录词与拼写：字节级回退把 OOV / 拼写变体切碎

只依赖 Python 标准库（确定性；无随机、无网络、不下载词表）。
运行：
    D:/code/anaconda/envs/pytorch_env/python.exe code/k11_demo.py

输出与 06_讲义精讲/K11_分词与多语言/03_动手验证.md 逐节对应。
"""
import sys
from collections import Counter

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def hdr(t):
    print("\n" + "=" * 68)
    print(t)
    print("=" * 68)


def fmt(tok):
    """把 token 显示成人能看的样子。bytes 能解码就解码，否则给十六进制。"""
    if isinstance(tok, (bytes, bytearray)):
        try:
            return tok.decode("utf-8")
        except UnicodeDecodeError:
            return tok.hex()
    return tok


def pair_counts(words):
    """words: [[token_list, freq], ...] -> Counter{(a,b): 频次}"""
    pairs = Counter()
    for toks, f in words:
        for a, b in zip(toks, toks[1:]):
            pairs[(a, b)] += f
    return pairs


def merge_seq(toks, pair, new_tok):
    """在一条 token 序列里，把所有不相交的相邻 pair 就地替换成 new_tok。"""
    out, i, n = [], 0, len(toks)
    while i < n:
        if i < n - 1 and toks[i] == pair[0] and toks[i + 1] == pair[1]:
            out.append(new_tok)
            i += 2
        else:
            out.append(toks[i])
            i += 1
    return out


def train_bpe(corpus, num_merges, verbose=False):
    """
    corpus: [(token_sequence, freq), ...]，token 是 str（字符级）或 bytes（字节级）。
    返回 (vocab, merges, words)；merges 是训练顺序的合并规则列表。
    频次相同按 token 字典序打破并列（确定性，且与 slides 的裴并列结果一致）。
    """
    words = [[list(seq), f] for seq, f in corpus]
    vocab = set()
    for seq, _ in corpus:
        vocab.update(seq)
    merges = []
    for step in range(1, num_merges + 1):
        pairs = pair_counts(words)
        if not pairs:
            break
        best_pair, best_cnt = sorted(pairs.items(), key=lambda kv: (-kv[1], kv[0]))[0]
        new_tok = best_pair[0] + best_pair[1]
        for w in words:
            w[0] = merge_seq(w[0], best_pair, new_tok)
        vocab.add(new_tok)
        merges.append({"new": new_tok, "pair": best_pair, "count": best_cnt})
        if verbose:
            print(f"  merge {step:2d}: {fmt(best_pair[0])!r} + {fmt(best_pair[1])!r}"
                  f" -> {fmt(new_tok)!r}   频次={best_cnt}   |V|={len(vocab)}")
    return vocab, merges, words


def encode(tokens, merges):
    """把一条 token 序列按合并规则顺序切分。"""
    toks = list(tokens)
    for m in merges:
        toks = merge_seq(toks, m["pair"], m["new"])
    return toks


def bytes_of(word):
    return [bytes([b]) for b in word.encode("utf-8")]


def encode_text(text, merges):
    """按空格预分词后逐词编码，拼回一条 token 序列。"""
    toks = []
    for w in text.split():
        toks += encode(bytes_of(w), merges)
    return toks


# ======================================================================
# §1 从零实现 BPE：复现 slides 的 Peter Piper walkthrough
# ======================================================================
hdr("§1 BPE 训练全过程：Peter Piper 语料（复现 slides p26–53）")

text = "Peter Piper picked a peck of pickled peppers"
# slides p27：按空格预分词，词前的 '_' 表示一个空格
corpus1 = []
for i, w in enumerate(text.split()):
    seq = list(("_" + w) if i > 0 else w)
    corpus1.append((seq, 1))

print("语料（预分词后；'_' 表示词前空格）:")
print("  " + " | ".join("".join(s) for s, _ in corpus1))
print("初始词表（D 中出现的单个字符）:")
print("  " + str(sorted(set(c for s, _ in corpus1 for c in s))))

init_pairs = pair_counts([[list(s), f] for s, f in corpus1])
print("\n初始相邻对频次（全部，降序）:")
for (a, b), c in sorted(init_pairs.items(), key=lambda kv: (-kv[1], kv[0])):
    print(f"  {a!r} + {b!r} : {c}")

print("\n训练（每次合并最高频相邻对）:")
vocab1, merges1, final1 = train_bpe(corpus1, 6, verbose=True)

print("\n最终每个词的切分:")
for toks, _ in final1:
    print("  " + "".join(toks))

expected = [("_", "p", "_p"), ("c", "k", "ck"), ("e", "r", "er"),
            ("_p", "e", "_pe"), ("_p", "i", "_pi"), ("_pi", "ck", "_pick")]
got = [(m["pair"][0], m["pair"][1], m["new"]) for m in merges1]
print("\n与 slides merge list 对账:")
print("  slides :", expected)
print("  实测   :", got)
print("  一致   :", got == expected)

print("\n测试时切分一个没见过的词（slides p54，只套合并规则，不重新训练）:")
toks_pier = encode(list("_pier"), merges1)
print(f"  '_pier' -> {' | '.join(toks_pier)}   （{len(toks_pier)} tokens）")


# ======================================================================
# §2 字节级 BPE + 多语言不均衡
# ======================================================================
hdr("§2 多语言不均衡：同一句话，英文 vs 中文（字节级 BPE）")

# 训练语料：英文词频高、词量大；中文词少、频次极低。
# 模拟 slides p64 的不均衡：Common Crawl 里英文占 40–45%，
# 许多低资源语言（Tagalog / Amharic / Yoruba）占比 <0.01%。
en_counts = {
    "the": 300, "and": 260, "we": 220, "you": 180, "they": 140, "was": 120,
    "is": 150, "of": 200, "to": 190, "in": 170, "on": 135, "at": 160,
    "by": 95, "as": 125, "it": 110, "with": 90, "for": 100, "from": 70,
    "back": 75, "time": 85, "way": 95, "day": 60, "milk": 40, "milky": 45,
    "grass": 16, "sat": 27, "flew": 32, "pepper": 22,
}
_bases = ["look", "pick", "walk", "talk", "play", "work", "jump", "help",
          "call", "want", "need", "open", "close", "start", "stop", "watch",
          "move", "push", "pull", "count"]
for _b in _bases:                       # 形态变化共享子词（ed / ing / s）
    en_counts[_b] = 24
    en_counts[_b + "s"] = 14
    en_counts[_b + "ed"] = 11
    en_counts[_b + "ing"] = 9

zh_counts = {
    "我们": 6, "看着": 5, "银河": 4, "坐在": 3, "草地": 3, "时间": 4, "飞逝": 2,
}

corpus_b = []
for w, f in en_counts.items():
    corpus_b.append((bytes_of(w), f))
for w, f in zh_counts.items():
    corpus_b.append((bytes_of(w), f))

en_total = sum(en_counts.values())
zh_total = sum(zh_counts.values())
ZH_SHARE = zh_total / (en_total + zh_total)
N_MERGES = 200
init_bytes = set(b for seq, _ in corpus_b for b in seq)
vocab_b, merges_b, _ = train_bpe(corpus_b, N_MERGES)

print(f"训练语料：英文 {len(en_counts)} 词 / 总频次 {en_total}；"
      f"中文 {len(zh_counts)} 词 / 总频次 {zh_total}")
print(f"中文数据占比 = {ZH_SHARE*100:.2f}%")
print(f"初始 |V| = 语料中出现的不同字节数 = {len(init_bytes)}")
print(f"训练 {N_MERGES} 次合并后 词表大小 |V| = {len(vocab_b)}")

en_test = "we looked at the milky way"
zh_test = "我们看着银河"
toks_en = encode_text(en_test, merges_b)
toks_zh = encode(bytes_of(zh_test), merges_b)   # 中文无空格 -> 整串一个 chunk

en_chars = len(en_test.replace(" ", ""))
zh_chars = len(zh_test)

print(f"\n英文：'{en_test}'")
print(f"  tokens={len(toks_en)}  chars={en_chars}  "
      f"tokens/char={len(toks_en)/en_chars:.3f}  tokens/word={len(toks_en)/len(en_test.split()):.3f}")
print("  切分:", " | ".join(fmt(t) for t in toks_en))

print(f"\n中文：'{zh_test}'")
print(f"  tokens={len(toks_zh)}  chars={zh_chars}  "
      f"tokens/char={len(toks_zh)/zh_chars:.3f}")
print("  切分:", " | ".join(fmt(t) for t in toks_zh))

ratio = (len(toks_zh) / zh_chars) / (len(toks_en) / en_chars)
print(f"\n→ 同一分词器下，中文的 tokens/char 是英文的 {ratio:.1f} 倍")

# (b) 对照：如果分词器只见过英文，中文会怎样？
en_only_corpus = [(bytes_of(w), f) for w, f in en_counts.items()]
vocab_e, merges_e, _ = train_bpe(en_only_corpus, N_MERGES)
toks_zh_en_only = encode(bytes_of(zh_test), merges_e)
print(f"\n对照：只喂英文语料训练的分词器（|V|={len(vocab_e)}，含中文数据占比 0%）")
print(f"  同一个中文句 '{zh_test}':")
print(f"    tokens={len(toks_zh_en_only)}  chars={zh_chars}  "
      f"tokens/char={len(toks_zh_en_only)/zh_chars:.3f}")
print("    切分:", " | ".join(fmt(t) for t in toks_zh_en_only))
print(f"\n→ 中文数据占比从 0% 提到 {ZH_SHARE*100:.2f}%，"
      f"中文 tokens/char 从 {len(toks_zh_en_only)/zh_chars:.3f} 降到 {len(toks_zh)/zh_chars:.3f}"
      f"（降 {len(toks_zh_en_only)/len(toks_zh):.1f} 倍）")


# ======================================================================
# §3 词表大小 vs 序列长度
# ======================================================================
hdr("§3 词表大小 vs 序列长度（同一个分词器，扫不同词表上限）")

test3 = "we looked at the milky way and time flew by as we sat back on the grass"
test3_words = test3.split()
test3_chars = len(test3.replace(" ", ""))

print(f"测试句：'{test3}'")
print(f"（{test3_chars} 字符，{len(test3_words)} 词）\n")
print(f"{'max_merges':>10} | {'|V|':>5} | {'tokens':>6} | {'tok/word':>8} | {'tok/char':>8}")
print("-" * 52)
for nm in [0, 50, 100, 200, 400, 800]:
    vocab_s, merges_s, _ = train_bpe(corpus_b, nm)
    toks = encode_text(test3, merges_s)
    print(f"{nm:>10} | {len(vocab_s):>5} | {len(toks):>6} | "
          f"{len(toks)/len(test3_words):>8.3f} | {len(toks)/test3_chars:>8.3f}")

print("\n→ 词表越大，序列越短（省算力/省上下文），代价是 embedding 矩阵越大。")
print("  这是分词器设计里最硬的一组权衡。")


# ======================================================================
# §4 未登录词与拼写：字节级回退
# ======================================================================
hdr("§4 未登录词与拼写：字节级回退把 OOV / 变体切碎")

print("用 §2 训练好的英文为主的分词器（|V|=%d）编码下列串：\n" % len(vocab_b))
samples = ["milky", "important", "importent", "impoooortant", "地球", "😀"]
for s in samples:
    toks = encode(bytes_of(s), merges_b)
    print(f"  {s!r:>16} -> {len(toks):>3} tokens: {' | '.join(fmt(t) for t in toks)}")

print("\n说明：")
print("  1) 字节级 BPE 天然无 OOV——任何字符都能用 UTF-8 字节表示；")
print("     但没在训练语料里出现过的字符会被拆成单个字节（中文 3 字节/字，emoji 4 字节）。")
print("  2) 一个字符的改动就会移动 BPE 的合并边界，产出完全不同的 token 序列")
print("     （'important' vs 'impoooortant' 的 token 数不同）。")