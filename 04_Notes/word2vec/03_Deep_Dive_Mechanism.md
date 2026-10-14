# 03 · 原理解析与底层细节：知其然，也知其所以然

> 符号全部沿用 `01 §1`（`V, D, C, K, T, B, W_in, W_out, s`），不再重复定义。
> 事实标注：**【论文原文】**= arXiv:1310.4546 逐字提取；**【官方源码】**= word2vec.c 逐字提取；
> **【实测】**= 本机跑出来的数字；**【第三方】**= 通行说法但本次未核。

---

## 1. 起点：Skip-gram 的原始目标函数

Skip-gram 想最大化"用中心词预测它周围词"的对数似然：

$$\mathcal{L} = \frac{1}{T}\sum_{t=1}^{T}\;\sum_{\substack{-C \le j \le C \\ j \neq 0}} \log p(w_{t+j} \mid w_t)$$

其中条件概率用 softmax 定义（`v` 来自 `W_in`，`u` 来自 `W_out`）：

$$p(w_O \mid w_I) = \frac{\exp\!\big(u_{w_O}^{\top} v_{w_I}\big)}{\displaystyle\sum_{w=1}^{V} \exp\!\big(u_{w}^{\top} v_{w_I}\big)}$$

**痛点全在分母上。** 对 $\log p$ 求梯度会得到那条著名的式子：

$$\frac{\partial \log p(w_O\mid w_I)}{\partial v_{w_I}} = \underbrace{u_{w_O}}_{\text{正样本}} \;-\; \underbrace{\sum_{w=1}^{V} p(w\mid w_I)\,u_w}_{\text{整个词表的期望，O(V·D)}}$$

> **每一个训练样本都要把 V 个词的内积全算一遍。** V=100000、D=300 时是 3×10⁷ 次乘加 × 每个样本。
> 这就是为什么 2013 年之前"神经网络词向量"只是论文里的玩具。

## 1.1 ⭐ 分母带来的其实是三类问题（严格区分）

"softmax 太慢"这句话揉了三件不同的事，**它们需要的技术不一样**：

| 类别 | 具体是什么 | 严重性 | 谁能解决 |
|------|-----------|--------|---------|
| ① **前向算得慢** | 每对要算 V 个点积 + V 个 exp | 可忍，理论上能靠堆算力硬扛 | 层次 softmax / 负采样 |
| ② **反向写得多** | 梯度对 V−1 个非目标词都非零，要读写整个 `W_out` | **真正致命** | 层次 softmax / 负采样 |
| ③ **目标函数错配** | softmax 强制"概率竞争"，但我们要的是向量不是概率 | **最深** —— 决定要不要**换目标函数** | **只有负采样** |

**② 是最致命的。** 看上面那条梯度：第二项 $\sum_{w=1}^{V}p(w|w_I)u_w$ 要先**读**全部 V 行；而
$\partial\mathcal{L}/\partial u_{w\neq o}=p(w|w_I)\cdot v_{w_I}$ 对 **V−1 个非目标词全部非零**，
所以每训一个词对都要把 `W_out` 的**全部 V 行写回一遍** —— 梯度被分母从"稀疏"强行变成"稠密"。

【论文原文 arXiv:1310.4546 §1】word2vec 的卖点恰恰是这句话：

> *"Unlike most of the previously used neural network architectures for learning word vectors,
> training of the Skip-gram model does not involve dense matrix multiplications."*

**"no dense matrix multiplications" 就是它快的原因**，而 softmax 的分母正好把它变回了稠密矩阵运算。
分布式训练时每步要同步整个 V×D 的更新矩阵 —— 这才是真的跑不动，加机器解决不了。

**③ 为什么最深**：softmax 是**排他归一化**，抬高 $p(o|w_I)$ 必然压低其余 V−1 个词。
但语义上这个偏置是错的 —— `cat` 的邻居 `dog` 和 `kitten` 并不互斥。更根本的是**我们要的根本不是概率**：
【论文原文 §2.2】*"the Skip-gram model is only concerned with learning high-quality vector
representations, so we are free to simplify NCE as long as the vector representations retain their quality."*
这句话是负采样的合法性来源：**既然只要向量，归一化就是纯负担。**

> ⚠️ **别把"罕见词学不好"算到 softmax 头上。** 那是**数据频率**问题。
> 解决它的是**第三个技术 —— 高频词子采样**（§5.1），论文引言说它 *"improves accuracy of the
> representations of less frequent words"*。子采样和负采样、层次 softmax 是**并列的三件事**。

---

## 2. Negative Sampling：把 1 道 V 选 1 的多选题，拆成 K+1 道判断题

### 2.1 改写后的目标函数

对每个 (中心词 $c$, 上下文词 $o$) 训练对，抓 $K$ 个噪声词 $n_1...n_K \sim P_n(w)$，最大化：

$$\boxed{\;\mathcal{L}^{(c,o)} \;=\; -\log\sigma\!\big(u_o^{\top} v_c\big) \;-\; \sum_{k=1}^{K} \log\sigma\!\big(-u_{n_k}^{\top} v_c\big)\;}$$

即：让 $\sigma(u_o^\top v_c) \to 1$（真邻居判"是"），让 $\sigma(u_{n_k}^\top v_c) \to 0$（假邻居判"否"）。

> **它和 NCE 的关系**：【论文原文】NEG 是 Noise Contrastive Estimation 的简化版——
> *"NCE needs both samples and the numerical probabilities of the noise distribution,
> while Negative sampling uses only samples."*
> NCE 理论上逼近 softmax 的归一化，NEG **放弃了归一化**，换来更简单的实现。
> 代价就是：NEG 训练出来的打分不是概率，所以 word2vec **不能用来算句子概率**（见 `02 §5`）。

### 2.2 噪声分布 $P_n(w)$：为什么是 3/4 次方

【论文原文 §2.2】：

$$P_n(w) = \frac{U(w)^{3/4}}{Z}$$

$U(w)$ 是 unigram（一元词频）分布。论文说它在所有任务上都显著优于 unigram 本身和均匀分布。

> **直觉**：直接用词频（幂=1）会让 "the/a/in" 被采样得太多——但它们太容易判"否"了，
> 对梯度的信息量小；均匀分布（幂=0）又让高频词出现太少，模型学不会区分"常见但不相干"的词。
> 0.75 是**纯实验调出来的**折中，没有理论推导。别把它当数学结论。

### 2.3 梯度推导（这一步非常干净，值得手推一遍）

记 $s_{pos} = u_o^\top v_c$，$s_k = u_{n_k}^\top v_c$。先对**打分 s** 求导：

$$\frac{\partial}{\partial s}\big[-\log\sigma(s)\big] = \sigma(s) - 1
\qquad\qquad
\frac{\partial}{\partial s}\big[-\log\sigma(-s)\big] = \sigma(s)$$

（第二个式子：$-\log\sigma(-s) = \log(1+e^{s})$，导数是 $\frac{e^s}{1+e^s} = \sigma(s)$。）

再用 $\partial (u^\top v)/\partial v = u$，立刻得到全部三条梯度：

$$\nabla_{v_c}\mathcal{L} \;=\; \big(\sigma(s_{pos})-1\big)\,u_o \;+\; \sum_{k=1}^{K} \sigma(s_k)\,u_{n_k}$$

$$\nabla_{u_o}\mathcal{L} \;=\; \big(\sigma(s_{pos})-1\big)\,v_c
\qquad\qquad
\nabla_{u_{n_k}}\mathcal{L} \;=\; \sigma(s_k)\,v_c$$

**统一成一句话**——这是整个 word2vec 反向传播的全部内容：

$$\boxed{\;\nabla \mathcal{L} \;=\; \big(\sigma(s) - y\big)\cdot (\text{对面的那个向量}),\qquad y \in \{1 \text{ 正}, 0 \text{ 否}\}\;}$$

> **为什么值得记**：它和"线性回归/逻辑回归的梯度 = 残差 × 输入"是**同一个式子**。
> 残差 $\sigma(s)-y$ 是标量，对面那个向量就是"输入"。
> 这也解释了为什么反向传播只有三行代码（`01 §3.2 Step 4`）——没有隐藏层，没有链式法则绕弯。

### 2.4 更新量级：为什么叫"稀疏更新"

一次更新只碰：
- `W_in` 的 **1 行**（中心词）
- `W_out` 的 **1 + K 行**（正样本 + K 个负样本）

其余 V-2-K 行**完全不动**。`nn.Embedding(sparse=True)` 的 `sparse=True` 就是在告诉框架这件事。
代价从 $O(V\cdot D)$ 变成 $O((1+K)\cdot D)$：**与词表大小无关**。

---

## 3. 维度变换全表

### 3.1 numpy 在线版（B=1）

| 量 | shape | 说明 |
|---|---|---|
| `c`, `o` | 标量 int | 中心词 / 上下文词下标 |
| `neg` | `(K,)` = (5,) | 负样本下标 |
| `W_in[c]` → `v_c` | `(D,)` = (32,) | 中心词向量 |
| `W_out[o]` → `u_o` | `(D,)` | 正样本上下文向量 |
| `W_out[neg]` → `U_n` | `(K, D)` = (5, 32) | 负样本上下文向量 |
| `s_pos = u_o @ v_c` | 标量 | |
| `s_neg = U_n @ v_c` | `(K,)` | 广播：每行与 `v_c` 内积 |
| `g_pos` | 标量 | $\sigma(s_{pos})-1$ |
| `g_neg` | `(K,)` | $\sigma(s_{neg})$ |
| `g_neg @ U_n` | `(D,)` | `(K,)@(K,D)` → 加权求和 |
| `np.outer(g_neg, v_c)` | `(K, D)` | 每行 = `g_neg[k] * v_c` |

### 3.2 PyTorch batch 版（B=512）

| 量 | shape | 说明 |
|---|---|---|
| `center`, `ctx` | `(B,)` | |
| `neg` | `(B, K)` | |
| `W_in(center)` → `v_c` | `(B, D)` | |
| `W_out(ctx)` → `u_o` | `(B, D)` | |
| `W_out(neg)` → `U_n` | `(B, K, D)` | |
| `s_pos = (v_c*u_o).sum(1)` | `(B,)` | 逐行内积 |
| `v_c.unsqueeze(2)` | `(B, D, 1)` | 给 bmm 补一个维度 |
| `bmm(U_n, v_c.unsqueeze(2))` | `(B, K, 1)` → squeeze → `(B, K)` | 批量矩阵乘：`(B,K,D)×(B,D,1)` |
| `F.logsigmoid(-s_neg).sum(1)` | `(B,)` | K 个负样本 loss 求和 |
| `loss` | 标量 | `.mean()` 后再 backward |

> ⚠️ **bmm 的维度陷阱**：`torch.bmm` 只接受 **3D**，前后两维必须是 batch。
> 忘了 `unsqueeze(2)` 会直接报维度错误——这是写 batch 版时最常见的第一个报错。

---

## 4. 数值稳定性（这一节每条都有实测/源码支撑）

### 4.1 $\log\sigma(x)$ 必须稳定写法

$$\log\sigma(x) = -\log(1+e^{-x}) = -\text{logaddexp}(0, -x)$$

**本机实测对照**（`np.log(1/(1+np.exp(-x)))` vs `-np.logaddexp(0, -x)`）：

| x | naive | stable（logaddexp） |
|---|---|---|
| −1000 | **−inf** ⚠️ 溢出 | −1000.0 ✅ |
| −50 | −50.0 | −50.0 |
| 0 | −0.6931 | −0.6931 |
| +50 | 0.0（精度丢失） | −1.93e−22 |
| +1000 | 0.0 | −0.0 |

> x=−1000 时 naive 直接给 **−inf**，这个 −inf 会进入 loss 求和，让整个 batch 变 nan。
> 训练发散时你看到的 `nan`，有相当一部分源头就在这里。
> `np.logaddexp` 内部做了分段处理，永远不溢出。**不需要自己写分段，用现成的。**

### 4.2 σ(x) 的分段写法

```python
out[x>=0] = 1/(1+exp(-x))      # exp 的自变量恒 ≤ 0，安全
out[x<0]  = exp(x)/(1+exp(x))  # exp(x) ∈ (0,1)，安全
```
两个分支里 `exp` 的自变量都不超过 0，杜绝上溢。

### 4.3 参数范数会无界增长（NEG 的固有性质，不是 bug）

NEG 的目标函数里**没有任何正则项 / 权重衰减**。理论上，只要正样本还想更"正"，
模型的解就是让 $s_{pos}\to+\infty$，也就是让向量范数一直变大。**它不会收敛到一个有限的范数。**

本机实测：

| 配置 | 训练后 ‖W_in‖ |
|---|---|
| 初始（uniform(−0.5/D, 0.5/D)） | ≈ 0.42 |
| lr=0.025, 3 epoch | 13.1 → 17.8 → **20.1** |
| lr=0.025, 5 epoch（最终配置） | **25.3**（平均行范数 2.97） |
| lr=0.025, 20 epoch | **425.7**，且 loss 从 2.76 涨到 8.0e5 |
| lr=0.1, 3 epoch | 4.7e6 → 1.5e10（**发散**） |

> **工程后果**：范数增长本身不影响余弦相似度（余弦只看方向），所以**大部分场景无害**。
> 但它意味着：(1) 训练轮数不能随便加；(2) 如果你要把词向量喂给下游模型做点积打分，
> 范数差异会污染打分，这时应该**归一化**或者换用 cosine。

---

## 5. 原版 word2vec.c 的工程 trick（全部【官方源码】+【论文原文】核对过）

### 5.1 ⚠️ 高频词子采样：论文公式和参考实现**不是一个东西**

这是本文档最值得记住的一个"反直觉"事实。

**【论文原文 §2.3】**（arXiv:1310.4546 公式 5）：

$$P(w_i) = 1 - \sqrt{\frac{t}{f(w_i)}}, \qquad t \text{ typically around } 10^{-5}$$

**【官方源码 word2vec.c】** 实际写的是：

```c
// The subsampling randomly discards frequent words while keeping the ranking same
if (sample > 0) {
  real ran = (sqrt(vocab[word].cn / (sample * train_words)) + 1) * (sample * train_words) / vocab[word].cn;
  next_random = next_random * (unsigned long long)25214903917 + 11;
  if (ran < (next_random & 0xFFFF) / (real)65536) continue;
}
```

设归一化词频 $p = \text{cn}/\text{train\_words}$，阈值 $t = \text{sample}$，则

$$\text{ran} = \sqrt{\tfrac{t}{p}} + \tfrac{t}{p}, \qquad P(\text{discard}) = \min(\text{ran},\,1)$$

（因为 `ran < U(0,1)` 的概率就是 ran。）

**两者数值完全不同。** 举例 $t=10^{-3}$，$p=0.01$（词频 1%）：

| | 丢弃概率 |
|---|---|
| 论文公式 $1-\sqrt{t/p}$ | **68.4%** |
| 源码实现 $\sqrt{t/p}+t/p$ | **41.6%** |

**怎么办**：你在代码里跑的是**源码版**（gensim 也用的这个形式）。
论文公式是"思想表述"，源码才是"实际行为"。写论文引公式可以，调参要按源码来。

> 另外注意阈值本身也打架：论文说 $t$ 通常 **1e−5**，源码默认 `sample = 1e-3`，
> 帮助文本原文：`"default is 1e-3, useful range is (0, 1e-5)"`（原文如此，两个数字自相矛盾）。
> 我**没有**验证哪个实践上更好。

### 5.2 负采样表：`table_size = 1e8`，`power = 0.75`

```c
const int table_size = 1e8;
int *table;
// InitUnigramTable(): double d1, power = 0.75;
//   table[a] = i; 按 pow(vocab[i].cn, power) 的比例填充 1e8 个槽位
```

采样时一次随机取槽位即可 $O(1)$。本文 MVP 把它缩到 1e6（1e8 个 int 是 400MB）。

### 5.3 动态窗口：不是每个词都看满 C 个邻居

```c
b = next_random % window;   // 实际窗口宽度在 [0, window) 间随机
```

> **效果**：离中心词越远的词被训练到的概率越低 —— 相当于**隐式地对距离做了衰减**，
> 比"等权看待窗口内所有词"更符合直觉（紧邻的词相关性更强）。
> 【官方源码】；这一条很多教程会漏掉。

### 5.4 学习率衰减：衰减到 `starting_alpha × 0.0001`，不是绝对值

```c
alpha = starting_alpha * (1 - word_count_actual / (real)(iter * train_words + 1));
if (alpha < starting_alpha * 0.0001) alpha = starting_alpha * 0.0001;
```

⚠️ 注意是 **`starting_alpha * 0.0001`**（相对值），不是固定 0.0001。
如果你把 alpha 设成 0.5，最终学习率会是 5e−5 而不是 1e−4。
（gensim 的 `min_alpha` 是绝对值参数，两者语义不同——**别混着用**。【第三方，gensim 部分未实测】）

### 5.5 其余默认值（【官方源码】逐字）

```c
int hs = 0, negative = 5;
int binary = 0, cbow = 1, debug_mode = 2, window = 5, min_count = 5, num_threads = 12, min_reduce = 1;
real alpha = 0.025, starting_alpha, sample = 1e-3;
// main(): if (cbow) alpha = 0.05;
// 帮助文本: "-size ... default is 100"
//           "-negative ... default is 5, common values are 3 - 10 (0 = not used)"
//           "-min-count ... default is 5"
```

### 5.6 `W_out` 全零初始化——为什么全零还能训？（我实测过）

```c
// InitNet():
for (a = 0; a < vocab_size; a++) for (b = 0; b < layer1_size; b++)
  syn1neg[a * layer1_size + b] = 0;                                    // 输出矩阵: 全零
...
syn0[a * layer1_size + b] = (((next_random & 0xFFFF) / (real)65536) - 0.5) / layer1_size;  // 输入矩阵: ±0.5/D
```

直觉上"全零 = 梯度为零 = 训不动"，但这里**不会**：
- 全零时 $s = 0$，$\sigma(0) = 0.5$，所以残差 $\sigma(s)-y = \pm 0.5 \neq 0$；
- 对 $u$ 的梯度是 $0.5 \cdot v_c$，$v_c$ 非零 → $u$ 立刻被推开；
- 此后 $u \neq 0$，两侧互相带动。

**本机实测对照**（lr=0.025，同一语料，3 epoch）：

| `W_out` 初始化 | avg loss |
|---|---|
| 全零（原版） | 2.683 |
| 随机 ±0.5/D | 2.655 |

差异 < 1%，**印证原版全零是有意为之且能work**。

> 顺带：全零初始化还有一个隐性好处——训练初期所有词的 $u$ 都一样，
> 梯度主要由 $v_c$ 决定，等价于"先训一个共享的上下文表示"，某种意义上类似于 warmup。
> （这是我的解释，不是论文说的，标【未验证】。）

### 5.7 为什么是两套矩阵（`W_in` / `W_out`）而不是一套

- **数学原因**：$s = u_o^\top v_c$ 是一个**双线性**打分。若共用一套（$u=v$），
  则 $s_{w,w} = \|v_w\|^2$ 会被所有"自己和自己共现"的样本（其实不存在，但词频高的词更容易被自己当负样本）
  推向奇怪的方向；更本质的是，共用会让打分矩阵被强制对称，损失一半表达力。
- **实践**：训练完只用 `W_in`（原版 `-output-file` 默认输出的也是 syn0）。
  也有人用 `W_in + W_out` 求和，在小语料上略好。【第三方】

---

## 6. Hierarchical Softmax（另一条路）

> slides 只提了名字没展开，本节内容取自 **arXiv:1310.4546 §2.1 原文 + 本机实测**。
> 实测脚本 `06_讲义精讲/K01_词向量与分布语义/code/k01_huffman_neg.py`，输出在同级 `logs/` 下。

### 6.1 思路与树的来源

【论文原文】在神经语言模型里由 **Morin and Bengio** 引入。核心是**不去评估 W 个输出节点，
而是只评估约 $\log_2(W)$ 个节点**：把输出层表示成一棵二叉树，W 个词是叶子，每个内部节点显式表示
"走左孩子还是右孩子"的相对概率 —— 这就定义了一次随机游走，给每个词分配了概率。

**为什么是哈夫曼树**：树的结构严重影响性能（论文引 Mnih and Hinton 的对比研究）。word2vec 选二叉哈夫曼树，
理由是【论文原文】*"we use a binary Huffman tree, as it assigns short codes to the frequent words
which results in fast training."* 即**代价正比于路径长度，让高频词路径短则平均代价小** ——
这是选它而非平衡树的唯一理由。

**怎么建**（贪心，Huffman 1952）：每次把权重（=词频）最小的两个节点合并成父节点，重复 W−1 次。
这个贪心使**带权路径长度** $\sum_w f(w)\cdot L(w)$ 全局最优。

> ⚠️ **树形只由词频决定，不含任何句法或语义信息。** 有些教程讲得像"哈夫曼树学到了词之间的语义层次"，那是错的。

### 6.2 路径概率公式

【论文原文，公式 (3)】记 $n(w,j)$ 为根到 $w$ 路径上第 $j$ 个节点，$L(w)$ 为路径长
（$n(w,1)=\text{root}$，$n(w,L(w))=w$），$\mathrm{ch}(n)$ 是 $n$ 的某个固定孩子，
$[\![x]\!]$ 为真取 1、假取 −1：

$$p(w \mid w_I) = \prod_{j=1}^{L(w)-1} \sigma\Big([\![n(w,j+1)=\mathrm{ch}(n(w,j))]\!]\cdot {v'_{n(w,j)}}^{\top} v_{w_I}\Big)$$

**整条路径就是一个连乘，每一步都是一道二分类**：走"固定孩子"那侧用 $\sigma(s)$，
另一侧用 $\sigma(-s)=1-\sigma(s)$。这也解释了为什么它仍是合法概率分布 ——
每层是一次伯努利抽样，沿路径连乘天然归一化。论文说 *"It can be verified that $\sum_{w=1}^{W}p(w|w_I)=1$"*。

**梯度**：每一层都是一个独立的二分类，残差 $(\sigma(\pm s)-y)$ 乘上"对面的那个向量"，
沿路径累加即可。和 §2.3 的 NEG 梯度是同一个形状。

### 6.3 ⚠️ 参数挂在哪（最容易搞混的一点）

【论文原文】*"the hierarchical softmax formulation has one representation $v_w$ for each word $w$
and one representation $v'_n$ for every inner node $n$ of the binary tree."*

| 记号 | 属于谁 | 个数 |
|------|-------|------|
| $v_w$ | **词**的输入向量 | W 个 |
| $v'_n$ | **内部节点**的向量（**不是任何词的向量**） | W−1 个 |

输出层总参数量 $(2W-1)\cdot D$，和朴素 softmax 的 $2VD$ 基本相同 ——
**省下来的是每步计算量，不是参数量。**

### 6.4【实测】IMDB 真实语料上的数字

跑 `k01_huffman_neg.py`（IMDB unsupervised 50k，V=2000，T=9,846,798）：

| 量 | 实测值 |
|---|-------|
| `the` 的路径 / 深度 | `1011` / **4** |
| 尾部低频词深度 | **14** |
| 加权平均路径长 | **8.49**（平衡树 11.0，省 22.8%） |
| 随机合并树（对照） | 14.31 = 哈夫曼的 **1.685 倍** |
| 内部节点数 | 1999 = W−1，与理论一致 |
| $\sum_w p(w\mid w_I)$ 数值误差 | **2.220e-16**（浮点极限） |

论文口径核对：*"proportional to $L(w_O)$, which on average is no greater than $\log W$"*
—— 实测 8.49 ≤ log₂2000 = 10.97，**成立**。

### 6.5 与 NEG 的取舍

| | 层次 softmax | 负采样 |
|---|---|---|
| 单步代价 | $O(L(w)\cdot D)$，随词频变化 | 固定 $(1+K)\cdot D$ |
| 是否需要采样 | 不需要（确定性） | 需要（按 $P_n(w)$） |
| **输出是否是合法概率** | ✅ **是** | ❌ **不是，只是分数** |
| 对罕见词 | 路径长、代价高 | 代价固定 |

【论文原文】NEG *"results in faster training and better vector representations for frequent words,
compared to more complex hierarchical softmax"* —— 因为真实语料里绝大多数 token 是高频词，
HS 的"高频便宜"优势在平均值上被稀释了。

> ⚠️ **"HS 对低频词更友好"是我从上面这句论文结论反推的说法，论文没有直接这么说**，标【推断】。

**工程实际**：`word2vec.c` 默认 `hs = 0, negative = 5`（见 §5.5），即**默认走 NEG**；
gensim 只实现了 negative sampling，没有 HS。

---

## 7. 复杂度总账

| | 每步计算量 | **每步写回行数** | V=1e5, D=300, K=5 时 |
|---|---|---|---|
| 完整 softmax | $(C+1)\cdot V\cdot D$ | **V 行（全表）** | ~1.8e8 |
| Hierarchical Softmax | $O(L(w)\cdot D)$ | 路径上 $\approx\log_2 V$ 行 | ~5.1e3 |
| **Negative Sampling** | $(1+K)\cdot D$ | **1 + K 行** | **1.8e3** |
| 高频词子采样 | —（减少样本数） | — | 论文称 **2–10×** 加速 |

**"每步写回行数"这一列才是关键**：完整 softmax 的梯度对 V−1 个非目标词都非零，
所以每步要读写整个 `W_out`。这一条比"算得慢"更致命 —— 它让分布式训练每步要同步整个 V×D 矩阵。

**参数量三种方法基本相同**：朴素 softmax $2VD$，HS $(2W-1)D$，NEG $2VD$。
**省的是每步计算量，不是存储。**

> NEG 相对完整 softmax 约 **1e5 倍**加速。这就是"单机一天训千亿词"的算术来源
> （【论文原文】引言：*"an optimized single-machine implementation can train on more than 100 billion words in one day"*）。

---

## 8. 为什么线性类比会成立？（把直觉钉成理论）

这是最常被问、也最常被答错的一题。答案不在 word2vec 论文里，在 **GloVe 论文的论证**里。

**GloVe 的核心观察**【第三方，Pennington et al. 2014，未逐字复核】：
区分词义的不是共现**概率**本身，而是共现概率的**比值**。以 $w=\text{solid}$, $w'=\text{gas}$ 为例：

| 探针词 k | $P(k\mid\text{solid})/P(k\mid\text{gas})$ | 含义 |
|---|---|---|
| ice | 大（~8.9） | ice 与 solid 相关、与 gas 无关 → **能区分** |
| steam | 小（~0.085） | 反过来 → **能区分** |
| water | ≈1.36 | 两者都相关 → **区分不了** |
| fashion | ≈0.96 | 两者都无关 → **区分不了** |

结论：**$P(k\mid w)$ 的绝对值信息量小，比值才编码"相关性差异"**。要让向量空间支持类比
（$a-b+c$ 这种线性运算），向量必须编码**比值**，即：

$$F(w_i - w_j,\; \tilde{w}_k) = \frac{P_{ik}}{P_{jk}} \;\Longrightarrow\; w_i^{\top}\tilde{w}_k = \log P_{ik} - b_i - \tilde{b}_k$$

也就是：**"共现概率的对数"应该等于"向量内积"**。这就是线性结构（平行四边形）的来源。

**word2vec 凭什么也有这个性质？** Levy & Goldberg (2014) 的结果【第三方】：
Skip-gram + Negative Sampling 在数学上**等价于隐式分解一个 shifted PMI 矩阵**：

$$\text{PMI}(w, c) - \log k$$

因为 $\text{PMI}$ 就是 $\log\frac{P(w,c)}{P(w)P(c)}$，和上面的 $\log P$ 只差一个与 $c$ 无关的常数。
所以 SG+NS 学到的内积确实在拟合 $\log$ 共现——**线性类比不是巧合，是共现统计的必然推论**。

> ⚠️ 本节两个关键结论（GloVe 的比值论证、Levy & Goldberg 的 PMI 等价）都是**凭记忆引用，
> 本次没有下载论文逐字核对**。数字（8.9 / 0.085 / 1.36 / 0.96）也是记忆值，可能有偏差。
> 需要引用时请查原文。

---

## 9. 诚实清单

**已核实（可放心用）：**
- ✅ 所有标【官方源码】的默认值 / 初始化 / 子采样实现 / 学习率衰减 / 动态窗口 —— 逐字取自 `word2vec.c`
- ✅ 所有标【论文原文】的公式与建议（3/4 次方、K 的范围、NEG vs NCE 的区别、1e-5 阈值）—— 取自 arXiv:1310.4546
- ✅ 所有标【实测】的数字（范数增长、naive vs stable log-sigmoid、全零 vs 随机初始化、学习率扫描）

**未核实 / 存疑（别当定论）：**
- ❌ §1.1 里"softmax 的互斥性是错的归纳偏置"是我的分析，**论文没这么说**。论文只说"我们要的是向量，所以可以随便简化"
- ❌ §6.5 里"HS 对低频词更友好"是我从论文结论反推的，**论文没有直接这么说**
- ❌ **没有实测过"同样算力下三种方法训出的向量谁更好"**，只测了单步计算量、写入行数、概率合法性。论文说 NEG 对高频词更好，那是论文的实验结论，未独立复现
- ❌ **子采样 2×–10× 是论文数字，未在本机复现**
- ❌ 哈夫曼树的贪心最优性**严格证明未做**，只验证了"在构造的对照树里最优"
- ❌ §6.4 的词表只取 top 2000，**不能外推到真实 10 万–100 万词表**（真实词表低频词比例更高，加权平均路径会更长）
- ❌ §8 整个小节的 GloVe 与 Levy&Goldberg 论证与数字 —— 记忆引用，未核对
- ❌ gensim 的 `min_alpha` 语义（绝对值）与源码（相对值）的差异 —— gensim 4.4.0 已装（2026-10-02），但该 API 行为**未实跑验证**
- ❌ §5.6 末尾"全零 ≈ warmup"的解释 —— 我的推测，无出处
- ❌ §5.7"共用矩阵会强制打分对称" —— 是合理推理，未做对照实验
- ❌ 本文所有结论都在 **7540-token 合成语料**上验证；**未在真实大语料上验证过**
