# 01 · Quickstart MVP：跑通 Word2Vec 的最小闭环

> **这份不讲推导。** 目标只有一个：让你亲眼看到「一堆文本进去 → 能算相似度的词向量出来」。
> 直觉和演进看 `02`，公式推导看 `03`，面试速查看 `04`。
> **全套导航与"一共学了什么"的自检清单在 `00_README_and_Learning_Map.md`，建议最后回到那里打勾。**
>
> 本文件里所有输出都是**本机实测**（不是我编的示例），实测环境见 §2。

---

## 0. 先记住这 8 行——这是 Word2Vec 的全部核心

后面几百行代码都只是这 8 行的工程展开。先背下来，再看实现：

```python
# 对每个 (中心词 c, 上下文词 o) 训练对:
v_c = W_in[c]                        # 取出中心词向量
u_o = W_out[o]                       # 取出正样本(真上下文)向量
neg = sample_K_words()               # 随机抓 K 个"假上下文"词

s_pos = dot(v_c, u_o)                # 真样本打分: 越高越好
s_neg = dot(v_c, W_out[neg])         # 假样本打分: 越低越好
loss  = -log σ(s_pos) - Σ log σ(-s_neg)

# 梯度只有两项, 全都长成 (预测值 - 标签) × 向量 的形式
W_in[c]   -= lr * ((σ(s_pos)-1) * u_o + σ(s_neg) @ W_out[neg])
W_out[o]  -= lr * ((σ(s_pos)-1) * v_c)
W_out[neg] -= lr * outer(σ(s_neg), v_c)
```

> **白话**：模型干的事是"猜这个词周围会出现什么词"。但它不老老实实做「从 10 万个词里挑 1 个」这种
> 多选题（太慢），而是把问题改成了 K+1 道判断题：「这是不是它的邻居？是 / 不是」。
> 慢的根源——分母要把整个词表都算一遍——就这么被绕过去了。这是 Word2Vec 全部的意义。

---

## 1. 全局符号约定（四份文档统一，后文不再重复解释）

| 符号 | 含义 | 本文取值 |
|---|---|---|
| `V` | 词表大小 vocab size | 69（本例） |
| `D` | 词向量维度 embedding dim | 32 |
| `C` | 窗口**半长** window，真实窗口宽 = 2C | 2 |
| `K` | 每个正样本配的负样本个数 | 5 |
| `T` | 语料总 token 数 | 7540 |
| `B` | batch size（numpy 版是在线 SGD，B=1） | 1 / 512 |
| `L` | 句子长度 | 5~7 |
| `W_in` | 形状 `(V, D)`，**中心词**矩阵，第 w 行记作 `v_w` | |
| `W_out` | 形状 `(V, D)`，**上下文词**矩阵，第 w 行记作 `u_w` | |
| `s` | 打分 score，`s = u_o · v_c`（内积，标量） | |

> **为什么是两套矩阵？** 同一个词当"中心词"和当"上下文词"时角色不对称。
> 共用一个矩阵的话，会逼着 `<v_w, v_w>`（自己和自己）变大，训练目标退化。
> 训练结束后**只取 `W_in`** 当最终词向量（也可以取 `W_in + W_out`，工程上更常见的是只用 `W_in`）。

---

## 2. 环境与两条路线（本机实测）

| 路线 | 解释器 | 依赖 | 状态 |
|---|---|---|---|
| A · 纯 numpy | `D:/code/anaconda/python.exe`（3.13.5） | numpy 2.1.3 | ✅ 实测跑通 |
| B · PyTorch | `D:/code/anaconda/envs/pytorch_env/python.exe`（3.10.18） | torch 2.6.0+cu124, numpy 2.2.6 | ✅ 实测跑通（CUDA 可用；版本为 2026-10-02 复测值） |
| C · gensim | `D:/code/anaconda/envs/pytorch_env/python.exe` | gensim 4.4.0 | ✅ **2026-10-02 已装**（用户级 user-site，导入已验证；base 仍没有） |

> ⚠️ 注意：本机 anaconda 的 **base 环境没有 torch**，torch 在 `envs/pytorch_env` 里。
> 别用 base 跑路线 B，会 `ModuleNotFoundError`。【实测】

```bash
# 路线 A
cd D:/WorkBuddydatata/2026-09-25-00-44-37/word2vec-notes
D:/code/anaconda/python.exe w2v_skipgram_numpy.py

# 路线 B
D:/code/anaconda/envs/pytorch_env/python.exe w2v_skipgram_torch.py
```

---

## 3. 路线 A：纯 numpy（零第三方依赖）

### 3.1 输入长什么样

合成的小语料，故意埋进三类规律：**王室/性别**、**平民**、**首都-国家**。

```
the king rules the kingdom          the queen rules the kingdom
the king wears a golden crown       the queen wears a golden crown
the king lives in a big palace      the man walks in the park
the king sits on the throne         the woman walks in the park
the king is a man        ← 关键句：把"性别"锚进王室词
the queen is a woman     ← 重复 4 次 = 给这条信号加权重
paris is the capital of france
tokyo is the capital of japan
river stone cloud engine market     ← 噪声句：稀释共现密度
```

> **为什么要造噪声句？** 最初版本没加，结果 V=39 的词表里任意两词几乎都共现过，
> 正负样本梯度互相打架，loss 从 2.76 一路涨到 8.0e5。加了 300 条噪声句后 loss 才正常下降。【实测】

### 3.2 五步核心（每段都是 w2v_skipgram_numpy.py 的摘录）

**Step 1 · 建词表 + 负采样表**

```python
def build_neg_table(w2i, counter):
    """P_n(w) ∝ f(w)^0.75 —— 比原始频次更平滑: 抬高罕见词, 压低高频词"""
    freq  = np.array([counter[w] for w in w2i], dtype=np.float64)   # (V,)
    probs = freq ** 0.75          # 3/4 次方是原版取值, 论文实测比 1.0 和 0.0(均匀)都好
    probs /= probs.sum()
    cum   = np.cumsum(probs)      # 前缀和 -> 采样是 O(log V)
    table = np.searchsorted(cum, rng.random(1_000_000)).astype(np.int32)
    return table                  # shape: (TABLE_SIZE,) 原版 C 实现是 1e8, 这里缩小省内存
```

> **白话**：负样本不能均匀随机抓，否则抓到的全是 "the / a" 这种没信息量的词（也没挑战性）。
> 按词频抓又会让高频词被过度惩罚。0.75 次方是论文试出来的折中。【论文原文，arXiv:1310.4546 §2.2】

**Step 2 · 数值稳定的 sigmoid（别跳过，这是会真的炸的地方）**

```python
def sigmoid(x):        # 分段算, 避免 exp(大正数) 溢出
    x = np.asarray(x, dtype=np.float64); out = np.empty_like(x); mask = x >= 0
    out[mask]  = 1.0 / (1.0 + np.exp(-x[mask]))   # x>=0 → exp 的自变量恒为负, 安全
    ex = np.exp(x[~mask])
    out[~mask] = ex / (1.0 + ex)                  # x<0  → exp(x) ∈ (0,1), 安全
    return out if out.ndim else float(out)

def log_sigmoid(x):    # log σ(x) = -log(1+e^{-x}) = -logaddexp(0, -x), numpy 内建, 天然防溢出
    return -np.logaddexp(0.0, -np.asarray(x, dtype=np.float64))
```

**Step 3 · 前向：一次更新到底算了几个数**

```python
v_c = W_in[c]      # (D,)
u_o = W_out[o]     # (D,)
U_n = W_out[neg]   # (K, D)
s_pos = float(u_o @ v_c)      # 标量
s_neg = U_n @ v_c             # (K,)
loss  = -log_sigmoid(s_pos) - log_sigmoid(-s_neg).sum()
```

> **这里就是革命的那一刀**：一次更新只算 **`(1+K)×D` = 6×32 = 192** 次乘加，**和词表大小 V 无关**。
> 完整 softmax 要算 `V×D`；本例 V=69 时是 2208，若 V=100000 则是 **3,200,000** —— 差 **~16667 倍**。【实测，见 §3.3 输出】

**Step 4 · 反向：梯度只有三行**

```python
g_pos = sigmoid(s_pos) - 1.0          # 正样本 label=1
g_neg = sigmoid(s_neg)                # 负样本 label=0, shape: (K,)

W_in[c]    -= lr * (g_pos * u_o + g_neg @ U_n)   # (D,)
W_out[o]   -= lr * g_pos * v_c                   # (D,)
W_out[neg] -= lr * np.outer(g_neg, v_c)          # (K, D)
```

> **关键洞察**（推导见 03）：二分类交叉熵对**打分 s** 的梯度就是 `σ(s) - label`，
> 再乘上对面的向量就得到对参数的梯度。所以整个 word2vec 的反向传播没有任何链式法则绕弯。
> 而且**只更新被查到的那几行**（稀疏更新），这是原版能一小时训完十亿词的原因之一。

**Step 5 · 初始化（照抄原版 word2vec.c）**

```python
W_in  = (rng.random((V, D)) - 0.5) / D   # 原版 syn0: uniform(-0.5, 0.5) / D
W_out = np.zeros((V, D))                 # 原版 syn1neg: 全零！不是笔误
```

> **`W_out` 全零不会训不动吗？** 不会。全零时 `s=0 → σ(s)=0.5`，梯度非零，照样能推开。
> 本机对照实验：全零 vs 随机初始化，loss 2.683 vs 2.655，几乎无差别。【实测，详见 03 §5】

### 3.3 完整实测输出

```
[corpus] 7540 tokens | V=69 | D=32 | pairs/epoch=22000 | total_updates=110000
  step   11000 / 110000 | lr=0.0225 | avg_loss=3.2664
  step   22000 / 110000 | lr=0.0200 | avg_loss=2.3838
  step   33000 / 110000 | lr=0.0175 | avg_loss=2.0589
  step   44000 / 110000 | lr=0.0150 | avg_loss=1.8634
  step   55000 / 110000 | lr=0.0126 | avg_loss=1.7694
  step   66000 / 110000 | lr=0.0101 | avg_loss=1.7189
  step   77000 / 110000 | lr=0.0076 | avg_loss=1.6940
  step   88000 / 110000 | lr=0.0051 | avg_loss=1.6840
  step   99000 / 110000 | lr=0.0026 | avg_loss=1.6630
  step  110000 / 110000 | lr=0.0001 | avg_loss=1.6539

[cost per update]
  NEG (this impl) : (1+K)*D = 192 mult-add
  full softmax    : V*D     = 2208 mult-add   (本例 V=69)
  if V=100000     : 3200000 vs 192 -> ~16667x

[most_similar]  (using W_in)
      king -> [('queen', 0.999), ('prince', 0.999), ('princess', 0.999), ('boy', 0.919), ('woman', 0.918)]
     queen -> [('king', 0.999), ('prince', 0.999), ('princess', 0.999), ('boy', 0.923), ('woman', 0.921)]
       man -> [('woman', 1.0), ('boy', 0.999), ('girl', 0.999), ('prince', 0.919), ('queen', 0.919)]
     paris -> [('beijing', 0.999), ('tokyo', 0.999), ('girl', 0.903), ('woman', 0.899), ('boy', 0.898)]

[analogy]
  king   - man   + woman = ?  -> [('queen', 0.999), ('prince', 0.999), ('princess', 0.998)]
  queen  - woman + man   = ?  -> [('king', 0.999), ('prince', 0.999), ('princess', 0.999)]
  paris  - france+ japan = ?  -> [('beijing', 0.999), ('tokyo', 0.999), ('girl', 0.908)]
  tokyo  - japan + china = ?  -> [('beijing', 0.999), ('paris', 0.999), ('girl', 0.912)]
```

### 3.4 怎么判断"学成了"——三个信号

1. **loss 单调下降** 3.27 → 1.65。理论下界参考：初始时所有 `s=0`，loss = `(1+K)·ln2 = 4.159`；
   训练完降到 1.65，说明正负样本确实被分开了。
2. **相似词成团** `king` 的邻居全是王室词，`paris` 的邻居全是首都词。这是"语义"出现的证据。
3. **类比成立** `king - man + woman ≈ queen`（top1 命中）、`tokyo - japan + china ≈ beijing`（top1 命中）。

> ⚠️ **必须承认的两个瑕疵**（别被漂亮数字骗了）：
> - **相似度全部虚高到 0.999**。真实语料上 word2vec 的相似词 cosine 一般在 **0.5~0.85**。
>   本例是模板合成语料，同一句话重复几十遍，熵太低，词向量几乎收敛到重合方向。
> - **`paris - france + japan` 的 top1 是 beijing 不是 tokyo**。原因：三个首都词在本语料里
>   共享**完全相同**的上下文（"is the capital of"），模型没有任何信号能在它们之间再区分。
>   这不是 bug，是合成语料的固有缺陷——**类比能力来自共现统计的差异，不是魔法**。
>   （`tokyo - japan + china` 能命中 beijing，是同一现象的镜像。）

---

## 4. 路线 B：PyTorch 版（看清楚张量维度怎么流动）

numpy 版是**逐样本在线 SGD**（B=1），PyTorch 版是 **batch 版**。模型定义就两个 `Embedding`：

```python
class SkipGramNEG(nn.Module):
    def __init__(self, V, D):
        super().__init__()
        self.W_in  = nn.Embedding(V, D, sparse=True)   # sparse=True: 只回传被查到的行
        self.W_out = nn.Embedding(V, D, sparse=True)
        nn.init.uniform_(self.W_in.weight,  -0.5 / D, 0.5 / D)
        nn.init.zeros_(self.W_out.weight)               # 对齐原版 C 代码

    def forward(self, center, ctx, neg):
        v_c = self.W_in(center)                    # (B, D)
        u_o = self.W_out(ctx)                      # (B, D)
        U_n = self.W_out(neg)                      # (B, K, D)
        s_pos = (v_c * u_o).sum(dim=1)             # (B,)  逐行内积
        s_neg = torch.bmm(U_n, v_c.unsqueeze(2)).squeeze(2)   # bmm: (B,K,D)x(B,D,1) -> (B,K)
        return s_pos, s_neg

loss = -(F.logsigmoid(s_pos) + F.logsigmoid(-s_neg).sum(dim=1)).mean()
```

⚠️ **batch 版的学习率不能照抄在线版**（这是实测踩到的坑）：

```
lr=0.025（照抄 numpy 版） → loss 全程卡在 4.1589 纹丝不动（= (1+K)ln2，参数压根没动）
lr=3.0                    → 收敛不足，loss 只降到 2.36
lr=6.0                    → 正常，loss 2.87 → 1.57
lr=25.0                   → nan 发散
```

> **原因**：loss 对 batch 取了 `.mean()`，梯度被除以 B=512，等效步长只剩 `0.025/512 ≈ 4.9e-5`。
> 这不是 word2vec 的问题，是**任何 batch 化改写都会踩的学习率缩放问题**。【实测】

另一个实测到的坑：`sparse=True` 的 Embedding **不能配 Adam**：

```
RuntimeError: Adam does not support sparse gradients, please consider SparseAdam instead
```

实测输出（CUDA，torch 2.6.0+cu124）：

```
[device] cuda | torch 2.6.0+cu124
[corpus] V=69 | pairs=22000 | batch=512
  batch   86/860 | lr=5.7025 | loss=2.8659
  batch  860/860 | lr=0.3475 | loss=1.5677
[most_similar]
    king -> [('prince', 1.0), ('queen', 0.999), ('princess', 0.999)]
   paris -> [('beijing', 1.0), ('tokyo', 0.999), ('capital', 0.857)]
[analogy]
  king - man + woman    = [('prince', 0.999), ('queen', 0.999), ('princess', 0.999)]
  tokyo - japan + china = [('beijing', 0.999), ('paris', 0.999), ('capital', 0.847)]
```

---

## 5. 生产环境用什么：gensim（包已装 2026-10-02，本节代码仍未实跑）

真实项目**不要**用上面的教学实现，用 gensim（Cython 优化、支持多线程、IO 与增量训练都处理好了）。

```python
from gensim.models import Word2Vec
model = Word2Vec(sentences, vector_size=100, window=5, min_count=5,
                 sg=1,            # 1=Skip-gram, 0=CBOW
                 negative=5,      # >0 用负采样; hs=1 则用层次 softmax
                 workers=4, epochs=5)
model.wv.most_similar("king", topn=5)
model.wv.most_similar(positive=["king", "woman"], negative=["man"], topn=1)
model.save("w2v.model")
```

> ⚠️ 以上 API 名称来自 gensim 4.x 常见用法（gensim 4.4.0 已于 2026-10-02 装入 pytorch_env，仅验证过 import），**这段示例代码仍未实跑验证**。
> 用之前自己核一遍：跑通这段，或 `help(gensim.models.Word2Vec)` 对参数名。

---

## 6. 四个立刻能改的旋钮

| 旋钮 | 默认 | 调大会怎样 | 依据 |
|---|---|---|---|
| `D`（维度） | 原版 100 | 表达力↑，但过拟合 + 内存线性涨 | 【官方源码】`-size` default 100 |
| `C`（窗口） | 原版 5 | 语义（topic）↑ / 句法（syntax）↓ | 【官方源码】`-window` default 5 |
| `K`（负样本） | 原版 5 | 小语料建议 5~20，大语料 2~5 就够 | 【论文原文】§2.2 |
| `epochs` | 5 | ⚠️ 不是越多越好，见踩坑点 | 【实测】20 epoch 反而发散 |

---

## 7. 这份没做的事（诚实清单）

- ❌ **没有在真实大语料上训练过**。本文件的所有输出都来自模板合成的 7540-token 小语料，
  相似度和类比数值不能直接外推到真实场景（真实场景相似度通常 0.5~0.85，不是 0.999）。
- ❌ **gensim 示例代码未实测**：包 4.4.0 已于 2026-10-02 装入 pytorch_env（import 已验证），但 §5 的代码没有跑过。
- ❌ **没有做高频词子采样、动态窗口、min_count 过滤**——这些原版 trick 在 03 §5 讲，本 MVP 为了短没实现。
- ❌ **没有做标准 benchmark**（如 wordsim353、Google analogy 数据集）评测。
- ✅ 已实测：loss 曲线、相似词、类比、两套实现、学习率扫描、sparse+Adam 报错。
