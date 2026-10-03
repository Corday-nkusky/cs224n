# T1 · Word Vectors + A1（D2–D3，预计 7–9h）

> 状态：**可执行** ｜ 前置：无
>
> **T0（PyTorch 军训）不是本任务的前置** —— A1 是四个作业里唯一不用 PyTorch 的一个，全程 NumPy + gensim。T0 的硬前置关系挂在 T2 上（A2 要算 tensor 导数）。排法二选一：T1 → T0 → T2，或 T0 与 T1 并行。

## 开工前的两道环境关（第一关已过，第二关 Part 2 前过）

**第一关：notebook 第一个代码 cell 会卡住整页**——它在**导入 numpy 之前**先 `from gensim.models import KeyedVectors`，又用 `datasets.load_dataset("stanfordnlp/imdb")` 加载 IMDB 语料（Q1.5 用）。任一失败，后面所有 cell（连 numpy 都没导入）全部起不来。

**已过【实测 2026-10-02 `pytorch_env`】**：gensim 4.4.0 已装（用户级 user-site，`from gensim.models import KeyedVectors` 导入已验证）；datasets 4.4.2 已装；**IMDB 已预下载到 HF 缓存并实测加载成功**（train/test 各 25k、unsupervised 50k）；huggingface.org 官方源可达（HEAD 0.7s / 200）。cell-1 直接整格跑，**不要注释**。

**第二关：Part 2 的 GloVe 预训练向量要联网下载（Part 1 不涉及，验收后再处理）**——靠一句 `gensim.downloader.api.load("glove-wiki-gigaword-200")` 拉 40 万词 × 200 维（约 250MB）。gensim 的下载源在国内通常不可达或极慢，notebook 自带注释也写了 "If you are receiving 'reset by peer' error, rerun the cell"。

**做法**：先单独跑一次下载，确认能拿到再往下做。不通的话两条退路：
1. 手动下 `glove-wiki-gigaword-200` 的文件，用 `KeyedVectors.load_word2vec_format()` 本地加载，绕开 downloader；
2. 换一个能下的小词向量（比如 `glove-wiki-gigaword-100`），但**要承认结论会变**——Q2.x 的相似度与类比结果依赖具体向量。

## 验收标准（先看这个）

| # | 标准 | 判定方式 |
|---|------|----------|
| A1 | notebook 全程跑通：四段代码（`distinct_words` / `compute_co_occurrence_matrix` / `reduce_to_k_dim` / `plot_embeddings`）写完，且你画的两张图与 `imgs/question_1.5.png`、`imgs/question_2.1.png` **对得上** | 我看运行输出 + 图 |
| A2 | 书面题全部作答：Q1.5（共现聚类分析）、Q2.1（GloVe 与共现图差异）、Q2.2（一词多义）、Q2.3（同义反义）、Q2.4–2.6（类比成立/不成立）、Q2.7–2.9（偏见） | 我读答案 |
| A3 | 能说清**共现矩阵为什么不能直接拿来当词向量用**，以及 SVD 在这一步到底干了什么 | 问答 |
| A4 | 能默写 skip-gram 的目标函数，并解释为什么中心词和上下文词各用一套向量（U / V 两个矩阵） | 问答 |
| A5 | 能推导 naive softmax loss 对中心词向量的梯度，说明它为什么是 O(\|V\|)、负采样怎么把这一步绕开 | 推导 + playground 代码验证 |
| A6 | 能解释 GloVe 与 word2vec 目标函数的差异，以及"共现矩阵"在两者里扮演的角色有何不同 | 问答 |
| A7 | 能解释词向量类比（`king - man + woman ≈ queen`）**为什么成立、在什么情况下不成立** | 问答 |

判定方式为"问答"的条目：**我出题，允许追问到你会为止**；答错不记失败，首次答错点进错题本。

## 目标

A1 的本体是**两条路线的对照体验**：Part 1 用计数法（共现矩阵 + SVD）造词向量，Part 2 拿现成的预测法产物（GloVe）来用，让你亲手看到两者在聚类图上的差别。

**作业里没有的东西**（别去找，找不到）：naive softmax 的实现、负采样的实现、数值梯度检查——这些都不在 A1 里。A5 的推导要靠 Lec2 讲义 + 你在 `playground/t1_word2vec/` 自己写的小规模复现来落地。这一块不是可选项：它是 T2（A2 考 tensor 求导）唯一的前置练习。

## 任务清单

1. （1h）Lec1 slides 翻过 + Lec2 slides 精读（word2vec 部分）
2. （1h）读 `01_Lectures/notes/` 两份词向量笔记（notes1 是推导主线，notes2 是 GloVe）
3. （2–3h）**A1 Part 1**（上手走 `07_伴学/02_A1Part1上手指引.md` 的四级桥：跑 demo → 手算 → numpy 热身 → 填函数）：共现矩阵 → SVD 降到 2 维 → 画图 → Q1.5 书面题。Q1.1–Q1.4 用 toy 语料，Q1.5 需 IMDB 下载（见顶部两关）
4. （0.5h）解决上面第二关的 GloVe 下载门槛
5. （2h）**A1 Part 2**：GloVe 降维图 + 余弦相似度 + 一词多义 + 类比 + 偏见分析
6. （1.5h）**`playground/t1_word2vec/`**：自己写一个小规模 word2vec——用一个几百词的小语料，先实现 naive softmax 并手算梯度对照，再实现负采样，对比两者的训练速度。⚠️ 该目录已有参考实现，**先自己写 → 卡住再看 → 看完关掉重写再 diff**（纪律见该目录 README）

## 材料清单

- `01_Lectures/cs224n-2026-lecture01-intro.pdf` / `lecture01-history.pdf`（快翻）
- `01_Lectures/cs224n-2026-lecture02-wordvecs.pdf`（精读）
- `01_Lectures/notes/cs224n-notes1-wordvecs-intro.pdf`、`cs224n-notes2-wordvecs2.pdf`
- **`06_讲义精讲/K01_词向量与分布语义/`**（slides 中文转写，6 份 + 可跑脚本）：`01` 讲动机、`02` 讲概念（§5–§7 是共现矩阵与 SVD 直觉，**A1 Part 1 的直接铺垫**）、`03` 动手对账、`04` 原理深潜（§2 目标函数、§4 负采样梯度、§6 共现矩阵+SVD 机制）、`05` 速查与自测题
- **`07_伴学/02_A1Part1上手指引.md`**：从 K01 概念到四个函数的四级桥（读 02 后觉得 gap 大就先走它）
- **`04_Notes/word2vec/`**（2026-09-25 的四维笔记，5 份）：`03` §2.3 是 softmax → 负采样的梯度推导，`03` §8 讲"线性类比为什么成立"，`04` 是速查与面试题
- **`playground/t1_word2vec/`**：两个可跑的参考实现 + 运行输出。**这是生成的学习资料，不是练习** —— 用法见该目录 README 的使用纪律
- `02_Assignments/a1/student/`（工作目录，作业本体就是一个 notebook）

**环境【实测，2026-10-02 `pytorch_env`】**：numpy 2.2.6 / scipy 1.15.3 / sklearn 1.7.2 / matplotlib 3.10.0 / torch 2.6.0+cu124 / notebook 7.4.4 / datasets 4.4.2 / **gensim 4.4.0** 齐全；IMDB 已缓存。Part 2 的 GloVe（约 250MB）尚未下载，见本文顶部第二关。

## 常见坑

- **共现矩阵的对称性**：`M[i][j]` 与 `M[j][i]` 会被窗口各计一次，写完先拿 3 句话的手算例子对着验一遍，别直接上 imdb 语料
- `reduce_to_k_dim` 要用 `TruncatedSVD`（sklearn），不是普通 PCA——共现矩阵是稀疏的，用错会得到全零
- **Part 2 的 `get_matrix_of_vectors` 有随机 shuffle**（`random.seed(225)`），图对不上先确认种子有没有被改
- 类比题用 `most_similar(positive=[...], negative=[...])`，注意它是**余弦相似度**排序，不是欧氏距离——A7 会追问这个区别
- notebook 开头声明"不要往 import 列表里加东西"；真需要就单独开 cell，保持作业可提交

## 验收记录（验收后由我回填）

- 日期：
- 结果：
- 进错题本的点：
