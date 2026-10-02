# T4 · 从零写 Transformer（A3）（D10–D13，预计 10–14h）

> 状态：**未解锁**（前置：T3 通过）｜ 全课动手量最大的一份作业
> **这次作业是从零写 Transformer**：权重由 `snapshots/` 给定，pytest 只比对前向输出，考的是形状算对、mask 放对位置。
> 这门课**没有微调作业**（SFT 场景在 P4a 主项目 MiniMind / nanochat 里做）。课程完整结构见 `00_课程大纲.md` §3。

## 验收标准

| # | 标准 | 判定方式 |
|---|------|----------|
| A1 | `cd tests && pytest` **8 个 test 全绿**：`test_model` / `test_modules` / `test_mlp` / `test_attention` / `test_decoder_block` / `test_forward` / `test_generate` / `test_loss_on_batch` | 我看 pytest 输出（贴完整 stdout） |
| A2 | 能默说 6 处填空各自的**输入输出张量形状**，以及 `d_model → (n_heads × d_attention)` 这个维度是怎么拆的 | 白板，我核 |
| A3 | 能解释**因果 mask 在代码里的落点**：它加在 softmax 之前还是之后、加在什么位置、为什么用 `-inf` 而不是 `0` | 推导 + 指代码行 |
| A4 | 能说清 `generate()` 里 KV cache 的取舍（本题骨架注释里写了 `# TODO: Maybe add KV caching`，说明**官方不要求**，但我要你讲清"加了会省什么、为什么难写对"） | 问答 |
| A5 | 能说清 `get_loss_on_batch()` 里 shift 的必要性（logits 第 i 位预测的是第几个 token） | 指代码 + 问答 |
| A6 | `from_pretrained()`：能说清"自己实现的 Transformer"与 HF `GPT2LMHeadModel` 之间的 `state_dict_converter` 在做什么、为什么权重名会不一致 | 问答 |

## 目标

把 T3 的"能默画"变成"能写对"。**A3 的判定方式对你很友好**：权重是给定的（`snapshots/test_model_state_dict.pt`），测试只比对前向输出张量（`np.testing.assert_allclose`, `atol=1e-5`）——**它考的不是你调参，是你能不能把形状算对、把 mask 放对位置**。这也正是 Transformer 唯一容易错的地方。

## 任务清单

1. （1h）读 `a3/cs224n-A3-student/` 结构：确认 `model_solution.py` 是**骨架**（6 处 `# TODO, complete`），`tests/snapshots/` 是标准答案张量
2. （1h）跑一次 `pytest`，看全红，确认环境与 `jaxtyping`/`einops` 装好了（`requirements.txt`）
3. （6–9h）按下面的顺序填 6 处 TODO，**填一个跑一个**：

| 顺序 | 文件位置 | 填什么 | 对应 test |
|---|---|---|---|
| ① | `model_solution.py:64` → `MLP.forward` | GELU 前馈 + 残差维度 | `test_mlp` |
| ② | `model_solution.py:91` → `CausalAttention.forward` | Q/K/V 投影 → 分头 → 缩放点积 → **因果 mask** → softmax → 拼头 → `W_o` | `test_attention` |
| ③ | `model_solution.py:109` → `DecoderBlock.forward` | 注意力的残差 + 归一化顺序（注意是 **pre-LN 还是 post-LN**，骨架给的是哪种就照哪种，别改成你以为的） | `test_decoder_block` |
| ④ | `model_solution.py:151` → `Transformer.forward` | embedding + 位置编码 → N×DecoderBlock → 输出投影 | `test_forward` |
| ⑤ | `model_solution.py:161` → `Transformer.generate` | 自回归采样，注意 `context_length` 截断 | `test_generate` |
| ⑥ | `model_solution.py:170` → `Transformer.get_loss_on_batch` | 交叉熵，**注意 logits 与 targets 的 shift** | `test_loss_on_batch` |

4. （1–2h）`train.py` 跑一个小规模训练，确认能出下降的 loss 曲线（这一步 test 不管，但**不跑它你不知道自己写的模型真的能学**）

## 材料清单

- `02_Assignments/a3/cs224n-A3-student/` + `_packages/a3_handout.pdf`
- `01_Lectures/cs224n-2026-lecture05-transformers.pdf`
- 论文 *Attention Is All You Need* §3.2（缩放点积注意力那段，对照看）
- `04_Notes/N3_transformer辨析.md`（post-LN vs pre-LN、mask 语义、KV cache）

## 常见坑

- **形状错了先算维度，不要靠 `.view()` 试错。** `d_model % n_heads == 0` 是断言好的，`d_attention = d_model / n_heads`。分头那步用骨架 import 的 `einops.rearrange`，别手写 reshape 把自己绕晕。
- **mask 加在 softmax 之前，且用 `-inf`（或 `-1e9`）**。加在 softmax 之后、或用 `0` 填，都会通过形状检查但数值全错 —— 这类 bug 只有 `atol=1e-5` 的张量比对能抓出来，肉眼跑一遍是看不出来的。
- **因果 mask 的方向**：`第 i 个位置能看到 j ≤ i`。写反了不会报错，只会让 loss 下不去或 generate 输出乱序。**用 `train.py` 的下降曲线做判据，不要靠"看起来对"。**
- `loss_on_batch` 的 shift：logits 的第 `i` 位预测第 `i+1` 个 token。忘了 shift 会让 loss 明显偏高但不报错 —— 这是最隐蔽的一处。
- 本机 8GB 单卡：TEST_CONFIG 是小模型，测试没问题；`train.py` 若 OOM，先降 `batch_size`，不要先怀疑模型写错。

## 验收记录（验收后由我回填）

- 日期：
