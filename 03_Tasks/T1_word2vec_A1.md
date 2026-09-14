# T1 · Word Vectors + A1（D2–D3，预计 6–8h）

> 状态：**未解锁**（前置：T0 通过）

## 验收标准

| # | 标准 | 判定方式 |
|---|------|----------|
| A1 | A1 全部 test 通过（`python run.py` / `pytest` 全绿） | 我看运行输出 |
| A2 | 能默写 skip-gram 的目标函数（中心词预测上下文），并解释为什么要用两个embedding矩阵（center / output） | 问答 |
| A3 | 能推导 naive softmax loss 对中心词向量的梯度（链路：L → ŷ → U·v_c），并解释为什么复杂度是 O(\|V\|)、负采样怎么把这个问题绕开 | 推导 + 问答 |
| A4 | 能解释 GloVe 与 word2vec 的目标函数差异，以及"共现矩阵"在两者中的角色区别 | 问答 |
| A5 | 能解释词向量类比实验（king - man + woman ≈ queen）**为什么会成立、在什么情况下不成立** | 问答 |

## 目标

理解"分布表示"的核心思想；A1 把这个思想落成 NumPy 代码（本作业故意不用 PyTorch，逼你手算梯度——和 T0 的 autograd 形成对照）。

## 任务清单

1. （1h）Lec1 slides 翻过 + Lec2 slides 精读（word2vec 部分）
2. （1h）读 `01_Lectures/notes/` 两份词向量笔记（notes1 是推导主线，notes2 是 GloVe）
3. （3–4h）A1：按 handout 顺序做，先用 naive softmax，再实现负采样
4. （0.5h）跑 gensim/GloVe 预训练向量玩类比实验，A5 有体感

## 材料清单

- `01_Lectures/cs224n-2026-lecture01-intro.pdf` / `lecture01-history.pdf`（快翻）
- `01_Lectures/cs224n-2026-lecture02-wordvecs.pdf`（精读）
- `01_Lectures/notes/cs224n-notes1-wordvecs-intro.pdf`、`cs224n-notes2-wordvecs2.pdf`
- `02_Assignments/a1/student/`（工作目录）+ `_packages/a1.zip`（原始包，别动）

## 常见坑

- 手算梯度时注意**求和方向**：naive softmax 是对整个词表求和，写代码前先在纸上写出维度
- `__MACOSX` 类垃圾文件已清理；**不要改 `utils/gensim` 相关的框架文件**
- 除法求导（÷count）漏项是 A1 最高频错误，数值梯度检查就是为抓这个

## 验收记录（验收后由我回填）

- 日期：
- 结果：
- 进错题本的点：
