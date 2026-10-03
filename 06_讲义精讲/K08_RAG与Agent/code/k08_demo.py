"""
K08 demo —— RAG（检索增强生成）与 Agent 的机制验证

只需 numpy（无需下载模型 / 不需联网 / 不调外部 API）。
运行（cwd = 06_讲义精讲/K08_RAG与Agent）：
    D:/code/anaconda/envs/pytorch_env/python.exe code/k08_demo.py

输出与 06_讲义精讲/K08_RAG与Agent/03_动手验证.md 逐节对应。
所有数字确定（无随机、无外部依赖），几秒跑完。
"""
import re
import numpy as np

np.set_printoptions(precision=6, suppress=True)

STOP = set("""a an the is are was were be been being of in on at to for from by with
and or as it its this that these those what which who whom whose how many much do
does did can could will would should i you he she they we my your his her their
""".split())


def hdr(t):
    print("\n" + "=" * 66)
    print(t)
    print("=" * 66)


def tokenize(s):
    toks = re.findall(r"[a-z0-9]+", s.lower())
    return [t for t in toks if t not in STOP]


# ======================================================================
# 小语料：4 个主题 × 3 篇 = 12 篇短文档（每篇 1–3 句）
# ======================================================================
DOCS = [
    # 0-2 地理/山峰
    "Mount Everest is the highest mountain above sea level. It lies in the Himalayas on the border of Nepal and China. Its height is about 8849 meters.",
    "Mount Kilimanjaro is the highest mountain in Africa. It is a dormant volcano in Tanzania. Many climbers attempt its summit each year.",
    "The Alps are a mountain range in Europe. They stretch across several countries including France, Switzerland and Italy. They are popular for skiing.",
    # 3-5 化学/物理
    "Photosynthesis converts sunlight, water and carbon dioxide into glucose and oxygen. It takes place in the chloroplasts of plant leaves.",
    "Water boils at 100 degrees Celsius at sea level. It freezes at 0 degrees Celsius. These values change with air pressure.",
    "The speed of light in a vacuum is about 300000 kilometers per second. Nothing can travel faster than light.",
    # 6-8 编程
    "Python is a programming language created by Guido van Rossum. It emphasizes code readability and a simple syntax. It is widely used for data science.",
    "JavaScript is a programming language mainly used in web browsers. It adds interactivity to web pages. It was standardized as ECMAScript.",
    "Rust is a systems programming language focused on memory safety. It prevents many common bugs at compile time. It does not use a garbage collector.",
    # 9-11 天文
    "The Moon orbits Earth about every 27 days. It causes the ocean tides. Its surface is covered with craters.",
    "Mars is the fourth planet from the Sun. It is often called the red planet because of iron oxide dust. It has two small moons.",
    "The Sun is the star at the center of the solar system. It produces energy by nuclear fusion. It is about 150 million kilometers from Earth.",
]

DOC_TOKENS = [tokenize(d) for d in DOCS]
N = len(DOCS)
AVGDL = float(np.mean([len(t) for t in DOC_TOKENS]))


def df_map(tokens_list):
    df = {}
    for toks in tokens_list:
        for t in set(toks):
            df[t] = df.get(t, 0) + 1
    return df


DF = df_map(DOC_TOKENS)
IDF = {t: np.log(1 + (N - c + 0.5) / (c + 0.5)) for t, c in DF.items()}


def bm25_scores(query, doc_toks, k1=1.5, b=0.75):
    q = tokenize(query)
    out = np.zeros(len(doc_toks))
    for i, toks in enumerate(doc_toks):
        dl = len(toks)
        tf = {}
        for t in toks:
            tf[t] = tf.get(t, 0) + 1
        s = 0.0
        for t in q:
            if t not in tf:
                continue
            f = tf[t]
            s += IDF.get(t, 0.0) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / AVGDL))
        out[i] = s
    return out


def tfidf_scores(query, doc_toks):
    q = tokenize(query)
    out = np.zeros(len(doc_toks))
    for i, toks in enumerate(doc_toks):
        tf = {}
        for t in toks:
            tf[t] = tf.get(t, 0) + 1
        s = 0.0
        for t in q:
            if t in tf:
                s += (1 + np.log(tf[t])) * IDF.get(t, 0.0)
        out[i] = s
    return out


def topk(scores, k):
    order = np.argsort(-scores)
    return [(int(i), float(scores[i])) for i in order[:k] if scores[i] > 0]


# ======================================================================
# §1 稀疏检索：BM25 / TF-IDF
# ======================================================================
hdr("§1 稀疏检索（BM25 / TF-IDF）：toy 语料上的打分与 top-3")
print(f"文档数 N={N}  平均文档长度 avgdl={AVGDL:.4f}  词表大小 |V|={len(DF)}")
print(f"IDF('mountain')={IDF['mountain']:.4f}  IDF('the'->停用词已删) "
      f"IDF('programming')={IDF['programming']:.4f}")

QUERIES = [
    "highest mountain in the Himalayas",
    "programming language with simple readable syntax",
    "how plants use sunlight to make food",
]

for qi, q in enumerate(QUERIES, 1):
    print(f"\n--- 查询 Q{qi}: {q!r} ---")
    print("query tokens:", tokenize(q))
    b = bm25_scores(q, DOC_TOKENS)
    t = tfidf_scores(q, DOC_TOKENS)
    print("BM25  top-3:", topk(b, 3))
    print("TFIDF top-3:", topk(t, 3))

# ======================================================================
# §2 稠密检索：余弦相似度
#    (a) LSA：TF-IDF 矩阵 -> SVD 降维（无监督，仍偏字面，小语料会退化）
#    (b) 手工语义嵌入：展示"稠密能匹配近义词、稀疏不能"（真实系统里是学出来的）
# ======================================================================
hdr("§2 稠密检索对照组：LSA(SVD) 与语义嵌入的余弦相似度")

vocab = sorted(DF.keys())
vidx = {w: i for i, w in enumerate(vocab)}
V = len(vocab)

# ---- (a) LSA：log-tf + IDF 加权 -> SVD -> 前 K 维 -> 余弦 ----
X = np.zeros((N, V))
for i, toks in enumerate(DOC_TOKENS):
    tf = {}
    for t in toks:
        tf[t] = tf.get(t, 0) + 1
    for t, c in tf.items():
        X[i, vidx[t]] = 1 + np.log(c)
idf_vec = np.array([IDF[w] for w in vocab])
Xw = X * idf_vec
Xw = Xw / np.clip(np.linalg.norm(Xw, axis=1, keepdims=True), 1e-12, None)
K = 4
U, S, Vt = np.linalg.svd(Xw, full_matrices=False)
doc_lsa = Xw @ Vt[:K].T
doc_lsa = doc_lsa / np.clip(np.linalg.norm(doc_lsa, axis=1, keepdims=True), 1e-12, None)
print(f"(a) LSA：|V|={V} -> K={K} 维，奇异值 S[:4]={S[:4]}")


def lsa_query(query):
    q = tokenize(query)
    vec = np.zeros(V)
    for t in q:
        if t in vidx:
            vec[vidx[t]] += IDF[t]
    vec = vec / np.clip(np.linalg.norm(vec), 1e-12, None)
    v = vec @ Vt[:K].T
    return v / np.clip(np.linalg.norm(v), 1e-12, None)


# ---- (b) 手工语义嵌入（2 维，便于看聚类）：doc/query 向量 = 词向量平均 ----
EMB = {
    # 地理/山峰 (x≈1)
    "everest": (1.0, 0.0), "kilimanjaro": (1.0, 0.10), "alps": (0.90, -0.10),
    "mountain": (0.95, 0.0), "highest": (1.0, 0.05), "height": (0.90, 0.05),
    "himalayas": (1.0, 0.08), "summit": (0.85, 0.0), "peak": (0.95, 0.02),
    "tall": (0.90, 0.03), "range": (0.80, -0.05), "africa": (0.70, 0.10),
    "tanzania": (0.70, 0.08), "meters": (0.85, 0.02),
    # 化学/物理 (y≈1)
    "water": (0.0, 1.0), "boils": (0.0, 0.95), "freezes": (0.0, 0.90),
    "temperature": (0.05, 0.95), "photosynthesis": (0.10, 1.0),
    "sunlight": (0.10, 0.95), "plant": (0.10, 0.90), "plants": (0.10, 0.90),
    "glucose": (0.12, 1.0), "oxygen": (0.12, 0.98), "food": (0.15, 0.92),
    "light": (0.05, 0.95), "carbon": (0.0, 0.90), "dioxide": (0.0, 0.90),
    # 编程 (-1,0)
    "python": (-1.0, 0.0), "javascript": (-1.0, 0.05), "rust": (-0.95, -0.05),
    "programming": (-1.0, 0.0), "language": (-0.90, 0.0), "code": (-1.0, 0.02),
    "coding": (-1.0, 0.02), "syntax": (-0.95, 0.05), "readable": (-0.90, 0.05),
    "readability": (-0.85, 0.07), "read": (-0.85, 0.07), "easy": (-0.80, 0.10),
    "compiler": (-0.90, -0.05), "garbage": (-0.70, -0.05),
    # 天文 (0,-1)
    "moon": (0.0, -1.0), "mars": (0.0, -0.95), "sun": (0.0, -0.98),
    "planet": (0.0, -0.95), "orbit": (0.0, -0.90), "earth": (0.05, -0.95),
    "space": (0.0, -0.90), "star": (0.0, -1.0), "telescope": (0.0, -0.80),
    "red": (0.0, -0.70), "solar": (0.0, -0.95),
}


def emb_vec(tokens):
    vs = [EMB[t] for t in tokens if t in EMB]
    if not vs:
        return None
    v = np.mean(vs, axis=0)
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


doc_emb = np.array([emb_vec(tokenize(d)) for d in DOCS])


def emb_query(query):
    return emb_vec(tokenize(query))


SYN_QUERIES = [
    ("highest mountain in the Himalayas", 0),
    ("how tall is the peak", 0),               # tall/peak 不在语料里 -> 稀疏必失手
    ("which plant makes food from light", 3),  # food 不在语料里
    ("readable coding language", 6),           # coding 不在语料里
    ("planet orbiting earth", 9),
]
print("\n(b) 语义嵌入（手工构造，2 维）：稀疏 vs 稠密 top-1 对比")
print(f"{'查询':<36}{'BM25 top1':>12}{'LSA top1':>10}{'嵌入 top1':>10}{'gold':>6}")
win_b = win_l = win_e = 0
for q, gold in SYN_QUERIES:
    b = bm25_scores(q, DOC_TOKENS)
    bt = topk(b, 1)
    b1 = bt[0][0] if bt else -1
    l1 = int(np.argmax(doc_lsa @ lsa_query(q)))
    qv = emb_query(q)
    e1 = int(np.argmax(doc_emb @ qv)) if qv is not None else -1
    win_b += int(b1 == gold)
    win_l += int(l1 == gold)
    win_e += int(e1 == gold)
    print(f"{q:<36}{b1:>12}{l1:>10}{e1:>10}{gold:>6}")
print(f"top-1 命中: BM25 {win_b}/{len(SYN_QUERIES)}   "
      f"LSA {win_l}/{len(SYN_QUERIES)}   语义嵌入 {win_e}/{len(SYN_QUERIES)}")
print("→ 稀疏靠字面重合：'tall/peak/food/coding' 不在语料里时 BM25 直接失手；"
      "稠密语义嵌入把它们拉回正确的语义簇（这就是要吃 embedding 的原因）")

# ======================================================================
# §3 分块粒度对命中率的影响
# ======================================================================
hdr("§3 分块（chunking）粒度 vs 命中率 + 上下文长度")

# 4 篇长文档，每篇 6 句；gold 答案定位到某一句
LONG = [
    "The Voyager 1 spacecraft was launched in 1977. "                                  # 0 gold
    "It carries a golden record with sounds of Earth. "
    "Voyager 1 entered interstellar space in 2012. "
    "It is the farthest human-made object from Earth. "
    "Its power comes from radioisotope thermoelectric generators. "
    "It still sends faint signals back to Earth.",
    "The Amazon rainforest covers much of South America. "
    "It produces a large share of the world's oxygen. "                                # 1 gold
    "The Amazon River flows through it. "
    "It is home to millions of species. "
    "Deforestation threatens its biodiversity. "
    "Its soil is surprisingly nutrient poor.",
    "The Great Barrier Reef lies off the coast of Australia. "
    "It is the world's largest coral reef system. "
    "It spans over 2300 kilometers. "                                                  # 2 gold
    "It is made of billions of tiny coral polyps. "
    "Rising sea temperatures cause coral bleaching. "
    "It is a UNESCO World Heritage Site.",
    "The Silk Road was an ancient network of trade routes. "
    "It connected China with the Mediterranean. "                                        # 3 gold
    "Goods such as silk and spices were traded along it. "
    "Ideas and religions also spread along these routes. "
    "It flourished for more than a thousand years. "
    "Its decline followed the rise of maritime trade.",
]
LONG_SENTS = [re.split(r"(?<=\.)\s+", d.strip()) for d in LONG]
GOLD = {0: 0, 1: 1, 2: 2, 3: 1}   # 查询 i -> 目标句下标

Q3 = [
    "farthest human made object launched spacecraft",
    "rainforest producing oxygen",
    "largest coral reef how long",
    "ancient trade routes connecting China",
]


def build_chunks(n_sent, overlap):
    chunks = []  # (doc_id, text, sent_range)
    for d, sents in enumerate(LONG_SENTS):
        i = 0
        while i < len(sents):
            j = min(i + n_sent, len(sents))
            text = " ".join(sents[i:j])
            chunks.append((d, text, set(range(i, j))))
            if j == len(sents):
                break
            i += max(1, n_sent - overlap)
    return chunks


print(f"{'chunk句数':>8} {'重叠':>4} {'#块':>4} {'平均块token':>10} "
      f"{'检索top3 token':>13} {'hit@1':>6} {'hit@3':>6}")
configs = [(1, 0), (2, 0), (2, 1), (3, 0), (3, 2), (6, 0)]
for n_sent, ov in configs:
    chunks = build_chunks(n_sent, ov)
    ctexts = [c[1] for c in chunks]
    ctoks = [tokenize(c) for c in ctexts]
    ndoc = len(ctoks)
    cdf = df_map(ctoks)
    cidf = {t: np.log(1 + (ndoc - c + 0.5) / (c + 0.5)) for t, c in cdf.items()}
    cavg = float(np.mean([len(t) for t in ctoks]))
    hit1 = hit3 = 0
    tok_top3 = []
    # 「查询 -> (目标文档, 目标句)」对齐
    tgt = [(0, 0), (1, 1), (2, 2), (3, 1)]
    for (qd, gs), q in zip(tgt, Q3):
        qt = tokenize(q)
        sc = np.zeros(ndoc)
        for ci, toks in enumerate(ctoks):
            dl = len(toks)
            tf = {}
            for t in toks:
                tf[t] = tf.get(t, 0) + 1
            s = 0.0
            for t in qt:
                if t in tf:
                    f = tf[t]
                    s += cidf.get(t, 0.0) * (f * 2.5) / (f + 1.5 * (1 - 0.75 + 0.75 * dl / cavg))
            sc[ci] = s
        order = np.argsort(-sc)
        hit1 += int(chunks[order[0]][0] == qd and gs in chunks[order[0]][2])
        hit3 += int(any(chunks[o][0] == qd and gs in chunks[o][2] for o in order[:3]))
        tok_top3.append(sum(len(ctoks[o]) for o in order[:3]))
    print(f"{n_sent:>8} {ov:>4} {len(chunks):>4} "
          f"{float(np.mean([len(t) for t in ctoks])):>10.1f} "
          f"{float(np.mean(tok_top3)):>13.1f} {hit1:>4}/4 {hit3:>4}/4")

# ======================================================================
# §4 有检索 vs 无检索：toy QA
# ======================================================================
hdr("§4 有检索 vs 无检索：toy 问答对比")

# 8 个问题，答案都是"模型参数里没有"的实时/私有事实
QA = [
    ("Where is Mount Everest located?", "Himalayas", 0),
    ("What is the height of Mount Everest?", "8849", 0),
    ("What does photosynthesis produce?", "glucose and oxygen", 3),
    ("At what temperature does water boil at sea level?", "100", 4),
    ("Who created Python?", "Guido van Rossum", 6),
    ("How often does the Moon orbit Earth?", "27", 9),
    ("How far is the Sun from Earth?", "150 million", 11),
    ("What are the two moons of Mars called?", None, 10),  # 语料里没有 -> 检索也答不出
]

# "参数记忆"：模型只硬记了 2 条常见知识（模拟训练数据里的知识截止/缺失）
PARAM_MEMORY = {
    "Where is Mount Everest located?": "Nepal",          # 部分对
    "Who created Python?": "Guido van Rossum",           # 记住
}


def retrieve_top1(query):
    b = bm25_scores(query, DOC_TOKENS)
    i = int(np.argmax(b))
    return DOCS[i], float(b[i])


def is_correct(query, answer, passage):
    if answer is None:
        return False
    return answer.lower() in passage.lower()


no_ret = with_ret = 0
print(f"{'问题':<48}{'无检索':<8}{'有检索':<8}{'检索top1分':>10}")
for q, ans, _ in QA:
    nr = PARAM_MEMORY.get(q, "UNKNOWN")            # 无检索：只从参数记忆答
    passage, score = retrieve_top1(q)              # 有检索：先检索
    no_ok = (ans is not None) and (ans.lower() in nr.lower())
    wr_ok = is_correct(q, ans, passage)
    no_ret += int(no_ok)
    with_ret += int(wr_ok)
    print(f"{q:<48}{('OK' if no_ok else 'x'):<8}{('OK' if wr_ok else 'x'):<8}{score:>10.2f}")

print(f"\n无检索正确: {no_ret}/{len(QA)} = {no_ret/len(QA):.1%}")
print(f"有检索正确: {with_ret}/{len(QA)} = {with_ret/len(QA):.1%}")
print("（第 8 题 'Mars 的卫星' 语料里没有 -> 检索也答不出：这是『检索错/知识缺失』失败模式）")

# ======================================================================
# §5 Agent 的循环：观察 -> 思考 -> 行动（在玩具搜索环境里跑 ReAct）
# ======================================================================
hdr("§5 Agent 循环（ReAct 风格）：观察 -> 思考 -> 行动")

# 玩具环境：一个小知识库 + 一个 search 工具
KB = {
    "front row": "The Front Row media center program was discontinued.",
    "apple remote": "The Apple Remote was introduced in 2005 to control Front Row.",
    "keyboard function keys": "Front Row can be controlled by keyboard function keys.",
}
TARGET = "Question: A device other than Apple Remote that can control Front Row"


def search_tool(arg):
    key = arg.lower().strip()
    for k, v in KB.items():
        if k in key or key in k:
            return v
    return f"NOT FOUND (similar: {list(KB)[:2]})"


def react_loop(max_steps=4):
    trace = []
    plan = ["apple remote", "front row", "keyboard function keys"]
    for step, act in enumerate(plan, 1):
        obs = search_tool(act)
        trace.append((step, f"Search[{act}]", obs))
        if "keyboard function keys" in obs.lower():
            return trace, "keyboard function keys", step
        if obs.startswith("NOT FOUND"):
            trace.append((step, "REVISE(query)", "改用更精确的关键词"))
    return trace, "unknown", max_steps


trace, answer, steps = react_loop()
for step, act, obs in trace:
    print(f"step {step}: act={act:<28} obs={obs[:52]}")
print(f"\n最终答案 = {answer!r}   用了 {steps} 步")
print("对比：单次检索（只 Search[apple remote] 1 步）拿不到 'keyboard function keys'")
print("→ Agent 的价值在多步『观察-思考-行动』：前一步的输出决定下一步的行动")