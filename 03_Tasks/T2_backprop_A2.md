# T2 · 反向传播与 tensor 求导 + 依存句法分析器，A2 主攻（D4–D7，预计 16–22h）

> 状态：**未解锁**（前置：T1 通过）｜ **全计划不可砍的一关**
>
> **这次作业的范围**：书面题考 **tensor 求导**；代码是**一个 transition-based 依存句法分析器**（`parser_model.py` / `parser_transitions.py` / `run.py`，数据 `*.conll`）。
> **RNN 不在本次作业里** —— 它在 Lec4 讲义，靠自己手推 BPTT（见验收 A4）。课程完整结构见 `00_课程大纲.md` §3。

## 验收标准

| # | 标准 | 判定方式 |
|---|------|----------|
| A1 | **A2 代码**：`parser_transitions.py` 自测通过 + `run.py` 训练出**下降的 loss 曲线**（不是"跑通"，是真在学）；**A2 书面**：tensor 求导全部做完 | 我看运行输出 + 书面答案 |
| A2 | 纸上手推：sigmoid 梯度、softmax+交叉熵合并后的简洁形式（ŷ−y）、两层 NN（affine→ReLU→affine→softmax）对第一层权重的完整链式求导 | 白板推导，我逐步核 |
| A3 | 能解释数值梯度检查（中心差分）的原理、eps 取多大、为什么用中心差分而不是单侧 | 问答 |
| A4 | 能解释 RNN 的 BPTT 为什么梯度会消失/爆炸：从 ∏W 的谱范数说起，并说出 3 种缓解手段各自的代价 | 推导 + 问答 |
| A5 | 能说清为什么梯度剪裁（clipping）治爆炸不治消失 | 问答 |

## 目标

**这门课对 AI 初学者价值密度最高的 4 天。** 把 T0 里"autograd 替你做的事"亲手做一遍，此后你看到任何架构，第一反应都是它的反向图。

## 任务清单

1. （0.5h）Lec3 slides 精读（backprop 计算图部分逐页看）—— 中文精讲见 `06_讲义精讲/K02_神经网络与反向传播/` 六篇
2. （1h）**先在纸上完成 A2 的推导，再写代码**——顺序反了 A2 会退化成"调包"
3. （8–12h）A2 编码：**transition-based 依存句法分析器** —— 先 `parser_transitions.py` 的转移系统自测（`part_c`/`part_d`），再 `parser_model.py` 的 `forward()`（`--embedding`/`--forward`），最后 `run.py` 训练（先 `-d` 再全量）。**上手走 `07_伴学/03_A2反向传播上手指引.md` 的四级桥**（转移系统手走 → 循环口述 → PyTorch 微热身 → 三块代码填一格验一格）
4. （1h）Lec4 slides（RNN/LM 部分）—— **RNN 只在这里出现，A2 作业里没有**；中文精讲见 `06_讲义精讲/K03_*/`（K03 待交付）
5. （1h）回答 A2/A4/A5 的口头版，写到本文档自答区

## 材料清单

- `01_Lectures/cs224n-2026-lecture03-neuralnets.pdf`（精读）
- `06_讲义精讲/K02_神经网络与反向传播/`（六篇中文精讲 + `code/k02_demo.py` + logs）
- `07_伴学/03_A2反向传播上手指引.md`：从 K02 概念到 A2 三块代码的四级桥（读 02 后觉得 gap 大就先走它）
- `01_Lectures/cs224n-2026-lecture04-rnnlm.pdf`
- `02_Assignments/a2/a2/`（工作目录）+ `_packages/a2_handout.pdf`
- 遇到矩阵求导卡壳：CS231n 的 vector calculus notes（我会按需写进 `04_Notes/`）

## 常见坑

- **转置和广播**：写 `(h·W)` 还是 `(W·h)` 定不下来时，先把每个张量的 shape 注释在旁边
- 数值梯度检查挂了先怀疑**自己的解析式**， eps 不对是最后才考虑的
- RNN 部分 forget `dh_prev` 的累加是最常见的 backprop 错误——BPTT 是"所有时刻梯度的和"，不是覆盖

## 验收记录（验收后由我回填）

- 日期：
- 结果：
- 进错题本的点：
