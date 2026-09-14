# T0 · PyTorch 军训（D1，预计 4–5h）

> 状态：**待执行** ｜ 前置：无

## 验收标准（先看这个）

| # | 标准 | 判定方式 |
|---|------|----------|
| A1 | 不用 `nn.Linear`，纯 tensor + autograd 手写线性回归，收敛到合理损失 | 代码跑通 + 我看代码 |
| A2 | 能说清 `loss.backward()` 时 autograd 沿计算图**具体做了什么**、梯度最终存在**哪个对象的哪个属性**里 | 问答，含追问 |
| A3 | 能说清 `optimizer.step()` 改了什么、`optimizer.zero_grad()` 为什么必须调、不调会怎样 | 问答，含追问 |
| A4 | 能解释 `requires_grad`、`with torch.no_grad()` 各自的语义，以及推理时为什么用后者 | 问答 |
| A5 | 能解释为什么 loss 必须是标量才能 `backward()`（多元素张量时参数怎么写、语义是什么） | 问答 |

判定方式为"问答"的条目：**我出题，允许追问到你会为止**；答错不记失败，首次答错点进错题本。

## 目标

建立"张量 + 计算图 + 自动微分"的最小可用模型，为 T2 手写 backprop 打底。**本阶段不追求记住 API，追求懂 autograd 机制。**

## 任务清单

1. （1.5h）PyTorch 官方 *Introduction to PyTorch* 系列前 3 个 tutorial（Tensors / Autograd / Neural Networks），1.5 倍速
2. （1h）tensor 操作练习：广播规则、`view/reshape`、`dim` 语义、矩阵乘 `@` vs 逐元素 `*`
3. （1.5h）**验收 A1**：从空文件手写线性回归（生成带噪声数据 → 前向 → MSE → backward → step），不用 `nn.Module` 也可以
4. （0.5h）读 `04_Notes/N0_autograd与计算图.md`，对照你跑的代码，把 A2–A5 的答案用自己的话写下来（写在本文档末尾"自答区"）

## 材料清单

- PyTorch Tutorials: <https://pytorch.org/tutorials/> → Introduction to PyTorch
- `04_Notes/N0_autograd与计算图.md`（我先写好原理，你是审稿人）

## 常见坑

- 忘 `zero_grad()` → 梯度累加，loss 曲线异常（这是 A3 的考点，别装没看见）
- `loss.backward()` 报 "grad can be implicitly created only for scalar outputs" → 这不是 bug，是语义，想清楚再修
- CPU/GPU 张量混合运算报错 → 设备不一致，先 `.to(device)`

## 验收记录（验收后由我回填）

- 日期：
- 结果：
- 进错题本的点：
