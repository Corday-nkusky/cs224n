# T3 · Transformer 精读（D8–D10，预计 8–10h）

> 状态：**未解锁**（前置：T2 通过）｜ 全课核心，出课后的前沿全部建立在这一讲上

## 验收标准

| # | 标准 | 判定方式 |
|---|------|----------|
| A1 | **不查资料默画** Transformer 结构：embedding → positional encoding → N×(MHA+FFN, 残差+LN) → 输出层，标注每处张量形状 | 白板，我核 |
| A2 | 能说清 Q/K/V 各自的语义和形状，以及"为什么点积要除以 √d_k"（从方差角度推） | 推导 + 问答 |
| A3 | 能解释 multi-head attention 在算力不变的前提下多了什么表达能力 | 问答 |
| A4 | 能解释为什么需要位置编码、正弦编码和可学习编码的取舍 | 问答 |
| A5 | 能推导 self-attention 为什么是 O(n²·d)，并说出 RNN O(n·d²) 在什么场景反而更省 | 问答 |
| A6 | 用 PyTorch 从零写单头 self-attention（≤20 行，可查 API 但不可查实现），并用小张量验证因果 mask 生效 | 代码 + 我看 |

## 目标

把 Transformer 从"听说过"变成"能默写、能实现、能说清每个设计决定的 why"。slides 是教学简化版，**我会同步给出论文原文口径与工程实现的差异**（`06_讲义精讲/K04_注意力与Transformer/04_原理深潜.md`）。

## 任务清单

1. （1h）Lec5 slides 精读，标记所有"我没想明白的箭头"
2. （2h）精读 *Attention Is All You Need* §3，对照 Jay Alammar 的 Illustrated Transformer
3. （3h）完成 A1–A5 的推导与自答
4. （2h）A6 单头 self-attention 实现 + mask 验证

## 材料清单

- `01_Lectures/cs224n-2026-lecture05-transformers.pdf`
- 论文：*Attention Is All You Need*（arXiv 1706.03762）
- Jay Alammar, *The Illustrated Transformer*（配图辅助，**以论文为准**）
- `06_讲义精讲/K04_注意力与Transformer/04_原理深潜.md`（讲解文档：post-LN vs pre-LN、mask 语义、KV cache 等）
- **上手桥**：[`07_伴学/04_A3Transformer上手指引.md`](file:///d:/code/cs224n/07_伴学/04_A3Transformer上手指引.md)（T4 开工前走；T3 先只读台阶 ①–② 做概念确认）

## 常见坑

- 因果 mask 的方向（"第 i 个位置能看到谁"）写反是常态，用 A6 的小张量实验验证，别靠感觉
- LN 的位置（post-LN 原论文 vs pre-LN 主流实现）不同资料画法不同——这**不是**谁错了，是演进，详见 N3
- 除以 √d_k 的方差推导很多人跳过，A2 我会追问到底

## 验收记录（验收后由我回填）

- 日期：
- 结果：
- 进错题本的点：
