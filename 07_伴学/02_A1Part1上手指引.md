# 桥：从 K01 概念到 A1 Part 1 动手（怎么从"读懂了"走到"写得出"）

> 适用：读完 K01 的 00/01/02 之后，打开 notebook 觉得 gap 大、不知道怎么下手。
> 这不是新知识点，是把已懂的概念翻译成代码的四层台阶。**台阶不是答案——核心循环必须你自己写。**
> 在"渐进放手循环"（方法论 §0）里的位置：你已完成第一幕（级 1），本文桥组送你走过**级 2→5**，作业全部 sanity 全绿即级 5 完成；级 6（Make，playground 自写 word2vec）在 T1 后段。
> 环境事实【实测 2026-10-02 `pytorch_env`】：datasets 4.4.2、**gensim 4.4.0 已装**；IMDB 已缓存；numpy 2.1.2。

---

## 先想清楚：gap 到底是什么

不是概念 gap（共现矩阵、SVD 你已经懂了），是两层机械 gap：

1. **还没看过"概念变成代码跑起来"的样子**——只在 02 里看过手算表。
2. **还没把"怎么数"变成给计算机的精确步骤**——人能容忍"看着办"，机器不能。

所以桥分四级，**每一级只跨一个能力级，顺序别跳**：

```
① 跑 k01_demo（只看输出不看源码）   级 2 看得准   PRIMM 的 Predict–Run
② toy 语料手算 + 解释每一步 + 伪代码 级 3 追得透   PRIMM 的 Investigate（含级 5 的骨架预备）
③ numpy 微热身（通用语法，不涉答案） 级 4 仿得来   Modify 前奏
④ 填四个函数，写一个跑一个测试      级 5 补得完   Completion（样例逐格挖空）
```

## 台阶 ①：跑演示脚本，先"看见"（约 20 分钟）｜级 2 · Predict–Run

K01 的 `03_动手验证.md` 本来就是概念→代码之间的那一层。之前说"03 先别读"过于保守——**现在读它，正是时候**。

1. 终端进入 K01 目录，跑（只需 numpy，1 秒出结果）：

```bash
cd d:/code/cs224n/06_讲义精讲/K01_词向量与分布语义
D:/code/anaconda/envs/pytorch_env/python.exe code/k01_demo.py
```

2. 按 03 篇的规矩来：**每段先写下你对输出的预期（或选 a/b），再对比实际输出**。猜错的地方做个记号——那就是你 02 篇概念里的洞。
3. **不要打开 `k01_demo.py` 看源码**——它里面有共现矩阵的实现，提前看等于泄 Q1.2 的底。你只需要看终端输出和 logs 里的结果。

## 台阶 ②：手算 + 自我解释 + 伪代码（约 25 分钟）｜级 3 · Investigate

Notebook 的 **cell-4（markdown）** 已经印了一张完整手算表（window=1 的两句文档），这是官方给你的样子。现在轮到你：

1. 先**绕开** cell-14（Q1.2 测试 cell）里那个印出来的答案矩阵 `M_test_ans`——自己数完再对。
2. 拿测试语料（Q1.1 测试用的那两句，加上 `<START>/<END>`），在纸上/文本文件里走完整流程：
   - 列出全部不同的词 → **按 Python `sorted()` 会给出的顺序**列（提示：`'<'` 的 ASCII 比字母小，大写字母比小写小——想清楚 `<END>` 和 `All` 谁排前面）
   - 给每个词编号（这一步的产物就是 `word2ind`）
   - 开一张 N×N 全 0 表
   - 以**每个词轮流做中心词**，数它 window 内出现谁，格子 +1
   - 最后检查：矩阵对称吗？对角线（自己跟自己）是几？
3. 把过程写成**五行以内的中文/类代码伪代码**。能写出来，四个函数里的前两个你已经设计完了——剩下的只是把这五行翻译成 Python。

## 台阶 ③：numpy 微热身（约 10 分钟，可放 playground 或新 cell）｜级 4 · Modify 前奏

作业需要的全部新语法就这几块，先在一个空 cell 里玩明白：

```python
import numpy as np
M = np.zeros((3, 3))      # 开表
M[0, 1] += 1              # 数一对
words = ['b', 'a', 'c']
w2i = {w: i for i, w in enumerate(sorted(words))}  # 词→编号字典
# 窗口遍历的骨架：j 从 center-window 到 center+window，跳过越界和自己
for i in range(len(words)):
    for j in range(max(0, i-1), min(len(words), i+2)):
        if i != j:
            print(words[i], '->', words[j])
```

再加一个查文档能力测试（Q1.3 就要用它）：

```python
from sklearn.decomposition import TruncatedSVD
X = np.random.rand(5, 4)
TruncatedSVD(n_components=2, n_iter=10).fit_transform(X).shape  # 应该是 ?
```

## 台阶 ④：四个函数逐个击破（约 1.5–2h）｜级 5 · Completion（填一格验一格）

**写一个，立刻跑紧跟其后的 sanity check cell；过了再写下个。** 不要一口气写完。

| 函数 | 输入→输出 | 思维提示（不是代码） | 测试怎么判 |
|------|----------|--------------------|-----------|
| `distinct_words` | 句子列表→排序去重的词表 + 个数 | 两层 `for` 的列表推导把 list of lists 拍平；`set` 去重；`sorted` | 精确等于测试里的列表，顺序也考 |
| `compute_co_occurrence_matrix` | 语料、window=4→矩阵 M + word2ind | 就是台阶②那五行伪代码：**纯计数，每次 +1，没有距离加权**；对称性是"每个词轮流当中心"的自然结果，不用手工补 M[j,i] | 10×10 每个格子精确比对；**先别偷看 M_test_ans** |
| `reduce_to_k_dim` | M→(词数, k) | 一行 sklearn：`TruncatedSVD(n_components=k, n_iter=10)` + `fit_transform`；它返回 U·S，不用你拼 | 只查形状 |
| `plot_embeddings` | 降维结果、字典、词表→散点图 | 逐词取坐标 `plt.scatter` 画叉、`plt.text` 贴标签；只画传入的词 | 肉眼对 `imgs/question_1.4_test.png`，无 assert |

**这一步最容易犯的三个错**（先记住，犯了你会认出来）：
1. 窗口边界：句首/句尾的词窗口不完整，`max/min` 截断，别让下标越界。
2. 计数口径：A1 是**每共现一次 +1**，不是按距离 1/d 加权。
3. 词表顺序：矩阵行列顺序必须等于 `distinct_words` 的排序结果，错了整个表错位且不报错。

## 然后：Q1.5（约 30 分钟 + 书面题）

在 150 条 IMDB 影评上真跑一次（cell-22，归一化代码 notebook 已给好，不用写），图对 `imgs/question_1.5.png`，答 a/b：哪两团聚着、哪些本该聚却没聚。**这一步必须数据下载成功**（见下方环境）。

## 环境（已实测，2026-10-02）

cell-1 直接全跑即可：gensim 4.4.0 已装（用户级 site-packages，导入已验证）；IMDB 已预下载到本机 HF 缓存，train/test 各 25k、unsupervised 50k 已实测加载成功；huggingface.org 官方源可达。**别注释 cell-1**（Q1.5 真语料依赖它）。

## 完成标志（自检，不用等我）

- [ ] **级 2**：k01_demo 输出你全部猜对，或猜错处已搞懂
- [ ] **级 3**：toy 矩阵手数结果与 M_test_ans 一致（先数后看）
- [ ] **级 5**：四个函数各自的 sanity 全绿（每个是填完立刻跑的，不是最后一起跑）
- [ ] Q1.5 图与参考图一致，a/b 书面题写完
- [ ] **级 8 预热**：能回答——共现矩阵为什么不能直接当词向量？SVD 这一步到底做了什么？

全过后找我做 T1 验收（A1 图对账 + 概念问答；这是级 8，不是级 5——问答会卡到合资料讲清为止）。
**撤桥检验**：验收前可以试一次：关掉本文档，只看作业要求，能把流程从头讲一遍吗？讲不出的地方就是桥没撤干净。

---
*维护：Trae，2026-10-02。*
