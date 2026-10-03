# 桥：从 K04 概念到 A3 动手（怎么从"会推会算"走到"写对 GPT-2 风格 Transformer"）

> 适用：读完 K04 六篇之后，打开 `02_Assignments/a3/cs224n-A3-student/` 觉得 gap 大、不知道从哪下手。
> 这不是新知识点。它把 K04 的注意力能力翻译成 A3 需要的三块新东西：**① 一个可以照抄的"数据流形状表"**（六处 TODO 各自的输入输出张量是什么形）；**② `einops.rearrange` / `masked_fill` / `nn.LayerNorm` 这几个 API 该怎么用**（K04 只讲了原理）；**③ 用 `train.py` 的下降曲线做总判据**（K04 `03` §8 只说到"要用曲线判断"）。
> 在"渐进放手循环"（方法论 §0）里的位置：你已完成第一幕（级 1，读懂了）和第二幕入口（级 2–3，`03` 跑通、`04` 推过）；本文桥组送你走过 **级 2→5**；六个 `pytest` 全绿 + `train.py` 出下降的 loss 曲线 = 级 5 完成。
> 环境事实【实测 2026-10-02 `pytorch_env`】：torch 2.6.0+cu124 / numpy 2.2.6 / transformers 4.57.3 / datasets 4.4.2 / huggingface_hub 0.36.0 / tqdm 4.67.1 齐全；**但缺 `jaxtyping`、`einops`、`pytest` 三个包** —— `model_solution.py` 第 11、14 行 `import jaxtyping` / `from einops import rearrange`，**目前连 import 都会失败**。`requirements.txt` 列的正是这三个 + 已有那些。**这是开工前必须先决策的一点**（见文末"需要决策的点"）。

---

## 先想清楚：gap 到底是什么

K04 给你的能力是"**手算清注意力三步、推得出 $\sqrt{d_k}$、说得出 mask 为什么用 $-\infty$**"。A3 要的是它在**两个新场景**落地：

1. **一个完整的模型容器**：A3 不是一个孤立的注意力函数，而是 `Transformer = embeddings + N×DecoderBlock + final_layer_norm + lm_head`，而 `DecoderBlock = attention + mlp + 两组 LayerNorm + 残差`。**六处 TODO 是一条链**：`MLP` → `CausalAttention` → `DecoderBlock` → `Transformer.forward` → `generate` / `get_loss_on_batch`。上一处的输出是下一处的输入，**顺序不能跳**（handout 第 3 部分也是这个顺序）。
2. **一层"深度学习工程"的 API**：`einops.rearrange`（分头/合并）、`masked_fill`（填 $-\infty$）、`nn.LayerNorm` / `nn.Linear`（参数容器）、`F.cross_entropy`（含 softmax）。K04 的 `03`/`04` 告诉你这些**在算什么**，这里告诉你**在 PyTorch 里怎么打**。

所以桥分四级（顺序别跳）：

```
① 数据流形状表 + 六处填空的输入输出（看准每个张量）   级 2 看得准
② causal mask 与 scale 的机制（用 K04 demo 最小例追透） 级 3 追得透
③ PyTorch / einops 微热身（rearrange/masked_fill/LN…）  级 4 Modify 前奏
④ 六处 TODO 逐个击破，填一格验一格                      级 5 补得完
```

> ⚠️ **顺序警告**：**先做 K04 的 `03`（跑 demo、对账）+ `04` §2–§4（推 $\sqrt{d_k}$、分头、mask）**，再动 A3。顺序反了，A3 会退化成"照抄 API、形状对了不知道为什么"。**六处填空里最容易错的三处（scale、mask、shift）全部押在 `04` 上。**

---

## 台阶 ①：数据流形状表（约 25 分钟）｜级 2 · 看得准

**这是 A3 的地图。** 下图每条边都标了形状（含 batch），全部来自读 `model_solution.py` + 读 `tests/snapshots/*.npy`【实测】。

**`TEST_CONFIG`**（`tests/helpers.py` 第 13–19 行）：`d_model=48, n_heads=2, n_layers=2, context_length=16, vocab_size=16` ⇒ `d_attention = 48/2 = 24`。

**六处填空的输入输出形状**（实测读 snapshot）：

| # | 填空（行号） | 输入形状 | 输出形状 | 对应 test（行号） |
|---|-------------|---------|---------|------------------|
| ① | `MLP.forward`（**L91**） | `(2,16,48)` | `(2,16,48)` | `test_mlp`（L50） |
| ② | `CausalAttention.forward`（**L64**） | `(2,16,48)` | `(2,16,48)` | `test_attention`（L59） |
| ③ | `DecoderBlock.forward`（**L109**） | `(2,16,48)` | `(2,16,48)` | `test_decoder_block`（L68） |
| ④ | `Transformer.forward`（**L151**） | `(2,14)` int64 | `(2,14,16)` float | `test_forward`（L77） |
| ⑤ | `Transformer.generate`（**L161**） | `(2,1)` int64，`num_new_tokens=2` | `(2,3)` int64 | `test_generate`（L86） |
| ⑥ | `Transformer.get_loss_on_batch`（**L170**） | `(2,5)` int64 | 标量 `()` float | `test_loss_on_batch`（L97） |

**`CausalAttention.forward` 内部的数据流**（②是本课最核心的一处，逐行对 K04）：

```
x                (B, T, d_model)          = (2,16,48)
q = W_q(x)       (B, T, d_attn*n_heads)   = (2,16,48)      ← 一次产出全部头
分头 rearrange   (B, h, T, d_attn)        = (2,2,16,24)    ← head 轴当 batch
scores = q @ k^T (B, h, T, T)             = (2,2,16,16)    ← 每个头一张 n×n
scores /= √d_attn  缩放
scores = mask(scores)  ← 未来位置填 -inf（softmax 之前！）
attn = softmax(scores, -1)  (B,h,T,T)
out = attn @ v    (B, h, T, d_attn)       = (2,2,16,24)
合并 rearrange    (B, T, d_attn*n_heads)  = (2,16,48)
out = W_o(out)    (B, T, d_model)         = (2,16,48)
```

**自己动手**：拿上面那张表，把 `d_model=48, d_attn=24` 代进去，在白纸上**默写一遍 `CausalAttention.forward` 的每行形状**。写不出来就回 `05` §1.2。

> **这一步的产物**：你脑子里有了"每个中间张量长什么样"。六处填空这时已经**设计完一半**——剩下的只是把公式翻译成 API。

---

## 台阶 ②：causal mask 与 scale 的机制（约 20 分钟）｜级 3 · 追得透

A3 里唯一会"形状对、数值全错"的地方就是 ②。**先用 K04 的 demo 把它追透**：

1. **scale**：回到 `04` §2 的方差推导。`self.d_attention = int(config.d_model / config.n_heads)`（`model_solution.py` L41），缩放因子是 `1/math.sqrt(self.d_attention)`。**问自己**：如果误写成 `1/math.sqrt(d_model)`，`test_attention` 会报什么？（答：形状对、数值全错，`atol=1e-5` 抓到。）

2. **mask 的落点**：骨架 `__init__` L52–L58 已经 `register_buffer("causal_mask", tril(ones(context_length, context_length)).view(1,1,context_length,context_length), persistent=False)` —— **它是一个 0/1 的下三角矩阵，不是 $-\infty$ 矩阵**。所以：
   - **错误做法 A**：`scores = scores * causal_mask` —— 这只是把未来分数**乘成 0**，等于"填 0 分"（`04` §4.3 说的错误），softmax 后未来位置仍分到权重。
   - **正确做法**：`scores = scores.masked_fill(self.causal_mask == 0, float('-inf'))` 或 `scores + (1 - self.causal_mask) * -1e9`，**在 softmax 之前**。
   - **先写预期再跑**：用 `03` §4 的 4×4 例子，自己判断"乘 0"和"填 $-\infty$"在 softmax 后的权重差别。`03` §4 实测：正确做法上三角**精确 0.0**；先 softmax 再清零行和 $=[0.032,0.269,0.356,1.0]$。

3. **`persistent=False` 的含义**：这个 buffer 不进 `state_dict()`，所以 `snapshots/test_model_state_dict.pt` 里**没有**它——**别指望从权重加载 mask**，它由代码生成。

> **这一步的产物**：②这处填空的 mask 那一行已经写定了。**记住 `05` §3 坑 2/3：mask 在 softmax 前、用 $-\infty$、方向是下三角。**

---

## 台阶 ③：PyTorch / einops 微热身（约 25 分钟，放 playground 或新 cell）｜级 4 · Modify 前奏

A3 需要的新语法就这几块，先在**空 cell** 里玩明白（**不是答案，是通用 API**）。**注意：下面这些 cell 会 import `einops`——它还没装，先按文末决策装好再跑。**

```python
import torch, torch.nn as nn, torch.nn.functional as F
from einops import rearrange               # A3 骨架已经 import，分头/合并用它

B, T, d, h = 2, 16, 48, 2
d_head = d // h
x = torch.randn(B, T, d)

# 分头：把最后一维 d 拆成 (h, d_head)，再把 head 轴挪到 batch 维
xh = rearrange(x, "b t (h d) -> b h t d", h=h)     # (2,16,48) -> (2,2,16,24)
print(xh.shape)                                     # torch.Size([2, 2, 16, 24])

# 合并：反向操作。顺序必须与分头严格互逆
back = rearrange(xh, "b h t d -> b t (h d)")        # -> (2,16,48)
print(torch.allclose(back, x))                      # True（无信息丢失）

# masked_fill：把未来位置分数填成 -inf（在 softmax 之前）
scores = torch.randn(B, h, T, T)
mask = torch.tril(torch.ones(T, T)).view(1, 1, T, T)   # 0/1 下三角，和骨架里的一样
scores = scores.masked_fill(mask == 0, float("-inf"))  # ← 未来位置 = -inf
attn = F.softmax(scores, dim=-1)
print(attn[0, 0, 0])          # 第 0 个位置只能看自己 → [1, 0, 0, ...]
print(attn.sum(-1)[0, 0])     # 每行和仍为 1

# LayerNorm：对最后一维（特征维）归一化；核对 K04 04 §7
ln = nn.LayerNorm(d)
y = ln(x)
print(y.mean(-1)[0, 0])       # ≈ 0（特征维均值）
```

**每一条都对照 K04**：
- `rearrange` 的字符串里 `h` 显式给出，**不靠 `.view()` 试错** → `03` §5（分头顺序敏感）
- `masked_fill(mask == 0, -inf)` 在 `softmax` **之前** → `04` §4（值必须是 $-\infty$）
- `ln(x).mean(-1)≈0` → `04` §7（LN 在特征维）
- `F.softmax(..., dim=-1)` 的 `dim` 是**最后一维**（被 attend 的 key 维），不是 batch

> **提示**：A3 里 `W_q = nn.Linear(d_model, d_attention * n_heads)`（骨架 L45–L47）**一次产出全部头**，所以分头只需 `rearrange`，**不需要**再乘任何矩阵。`W_o = nn.Linear(d_attention * n_heads, d_model)`（L49）负责融回。

---

## 台阶 ④：六处 TODO 逐个击破（约 6–9h）｜级 5 · Completion（填一格验一格）

**写一处，立刻跑这一处对应的 test；绿了再写下一处。不要一口气写完。** 必须**在 `tests/` 目录下**跑 pytest（test 里用的是相对路径 `'snapshots/...'`，`test_student.py` L3 也把父目录塞进了 `sys.path`）。

**完整命令**（绝对路径解释器，避免 PATH 上的 base python 没 torch；`pytest` 必须先装）：

```bash
cd d:/code/cs224n/02_Assignments/a3/cs224n-A3-student/tests
D:/code/anaconda/envs/pytorch_env/python.exe -m pytest test_student.py -v
# 或单跑一处：
D:/code/anaconda/envs/pytorch_env/python.exe -m pytest test_student.py::test_attention -v
```

| 顺序 | 位置（实际行号） | 填什么 | 对应 test | 判据 |
|------|----------------|--------|-----------|------|
| ① | `model_solution.py:91` `MLP.forward` | `fc2(gelu(fc1(x)))`（GELU 已给） | `test_mlp` | `atol=1e-5` |
| ② | `model_solution.py:64` `CausalAttention.forward` | Q/K/V → `rearrange` 分头 → 缩放 → **mask($-\infty$)** → softmax → $\times v$ → `rearrange` 合并 → $W_o$ | `test_attention` | `atol=1e-5` |
| ③ | `model_solution.py:109` `DecoderBlock.forward` | **pre-LN 残差**：`x = x + attn(pre_layer_norm(x))`；`x = x + mlp(post_layer_norm(x))` | `test_decoder_block` | `atol=1e-5` |
| ④ | `model_solution.py:151` `Transformer.forward` | `embeddings(x) + position_embeddings(positions)`（**positions 广播**）→ `backbone` → `final_layer_norm` → `lm_head` | `test_forward` | `atol=1e-5` |
| ⑤ | `model_solution.py:161` `Transformer.generate` | 循环 $n$ 次：取最后 `context_length` 个 token → `forward` → `argmax` 末位 → 拼到序列尾 | `test_generate` | **`assert_array_equal`（精确相等！）** |
| ⑥ | `model_solution.py:170` `Transformer.get_loss_on_batch` | `F.cross_entropy(logits[:, :-1].flatten(0,1), input_ids[:, 1:].flatten())` | `test_loss_on_batch` | `atol=1e-5` |

**这一步最容易犯的六个错**（先记住，犯了你会认出来）：

1. **scale 除错维度**：是 `sqrt(self.d_attention)` = `sqrt(d_model/n_heads)`，**不是** `sqrt(d_model)`（`04` §2）。
2. **mask 用 0/1 相乘、或加在 softmax 之后**：骨架的 `causal_mask` 是 0/1 的下三角，**要 `masked_fill==0` 成 $-\infty$、且在 softmax 前**（`04` §4）。
3. **`rearrange` 的 `d` 没写对**：分头字符串是 `"b t (h d) -> b h t d"`，合并是逆操作；`h` 必须显式传（`03` §5）。
4. **③的 LN 位置错**：骨架命名是 `pre_layer_norm`（来自 HF `ln_1`，在注意力前）和 `post_layer_norm`（来自 `ln_2`，在 MLP 前），**两者都是 pre-norm**；**别实现成 post-LN**（`04` §7、【待核验】以 `test_decoder_block` 定案）。
5. **④忘了位置、或没广播**：`positions = torch.arange(seq_len)` 要加到 `(B, seq_len, d)` 上（广播），且位置表大小 = `context_length`（`04` §5、`05` §3 坑 6/12）。
6. **⑥忘了 shift**：`logits[:, :-1]` 对 `input_ids[:, 1:]`（第 $i$ 位预测第 $i+1$ 个 token）。忘 shift → loss 偏高但**不报错**（T4 坑 4）。

> **`generate` 的精确相等是最严的一关**：`test_generate` 用 `np.testing.assert_array_equal`（不是 `atol`）。要做到**完全可复现**：模型必须已 `eval()`（`test_model` fixture 里做了），且用 **greedy**（`argmax`）而非采样。任何数值偏差都可能改变 argmax、进而改变 token 序列。另：`num_new_tokens=2`、输入长度 1 ⇒ 输出长度 3，形状对表要为 `(2,3)`。
>
> **KV cache 不在本桥要求内**：骨架注释 `# TODO: Maybe add KV caching` 说明官方不要求（T4 A4 只要求你**讲清取舍**，不要求实现）。

---

## 完成标志（自检，不用等我）

- [ ] **级 2**：能默写 `CausalAttention.forward` 每一行的张量形状（`05` §1.2）
- [ ] **级 3**：能说清骨架的 0/1 `causal_mask` 为什么要 `masked_fill` 成 $-\infty$、且必须在 softmax 前；能说清 scale 除的是 $d_{head}$（`04` §2/§4）
- [ ] **级 4**：`rearrange` 分头/合并互逆、`masked_fill` 后 softmax 行和为 1（台阶③的 cell 都跑过）
- [ ] **级 5**：**六个 `pytest` 全绿**（`test_mlp` / `test_attention` / `test_decoder_block` / `test_forward` / `test_generate` / `test_loss_on_batch`），贴完整 stdout 给我
- [ ] **总判据**：`train.py` 跑出 `./losses_and_grad_norms.png`，**左图 loss 明显下降、右图 grad norm 稳定** —— 这是"mask 没写反"的**唯一强判据**（T4 坑 3）
- [ ] **级 8 预热**：能回答——②这处填空里，**mask 加在 softmax 前和加在后的输出差在哪**？`generate` 为什么必须 greedy+eval？

全过后找我做 T4 验收（A1–A6 问答 + 看 pytest 输出 + 看 loss 曲线）。**A3 的 bonus（训练加速）与 KV cache 不在本次**。

**撤桥检验**：关掉本文档，只看 handout 第 3 部分 + `model_solution.py` 的六个 `# TODO`，能把"每处填空的输入输出形状 → 用什么 API → 为什么这么写"从零讲一遍吗？讲不出的地方就是桥没撤干净。

---

## 这一篇没能验证的部分

1. **A3 六处代码我一行都没跑过** —— 骨架是 stub（函数体是 `# TODO, complete` + `return torch.empty(1)`），未填不可能跑通。本桥关于形状、行号、判据的一切**全部来自读码与读 `.npy`**，**不是我实跑的结果**。**实际读到的文件与行**：
   - `model_solution.py`：全文（六处 TODO 的精确行号：**L64** `CausalAttention.forward`、**L91** `MLP.forward`、**L109** `DecoderBlock.forward`、**L151** `Transformer.forward`、**L161** `generate`、**L170** `get_loss_on_batch`；`CausalAttention.__init__` L36–L58 的 `d_attention`/`W_q/W_k/W_v`/`W_o`/`causal_mask`；`MLP.__init__` L80–L85；`DecoderBlock.__init__` L97–L103 的两个 LayerNorm；`Transformer.__init__` L115–L125、`_init_weights` L127–L145）
   - `tests/test_student.py`：全文（**共 8 个 test 函数**：`test_model` L20、`test_modules` L29、`test_mlp` L50、`test_attention` L59、`test_decoder_block` L68、`test_forward` L77、`test_generate` L86、`test_loss_on_batch` L97；均 `assert_allclose atol=1e-5`，唯 `test_generate` 用 `assert_array_equal`）
   - `tests/helpers.py`：`TEST_CONFIG` L13–L19、`set_seed` L21–L26、`get_test_modules_from_model` L29–L35
   - `utils.py`：`switch_backbone_key` L6–L96（`c_attn` 拆 $W_q/W_k/W_v$、`.t()` 转置）、`state_dict_converter` L101–L136
   - `train.py`：全文（TinyStories 取前 1% L38–L39、gpt2 分词器 L33、chunk 到 `context_length` L44–L58、缓存 L100–L107、AdamW `lr=1e-5` L113、`clip_grad_norm_` 阈值 1 L146、`plot_results` L61–L84、`__main__` L161–L177）
   - `tests/snapshots/*.npy`：**全部用 numpy 实读形状**（见台阶①表）
   - `README.md` / `requirements.txt` / `pytest.ini`
2. **文档与真实作业的一致性（2026-10-02 收尾已勘正）**：`T4` 写的"8 个 test"**是对的**（`tests/test_student.py` 实测 8 个；本桥早先误记为 6 个，已更正）；`T4` 表格里 `MLP.forward` / `CausalAttention.forward` 的行号**确实标反过**，已改为 **① `MLP.forward` = `:91`、② `CausalAttention.forward` = `:64`**。`T3`/`T4` 曾引用的 `04_Notes/N3_transformer辨析.md`（本机不存在）**已替换为 `06_讲义精讲/K04_注意力与Transformer/04_原理深潜.md`**，现无悬空引用。
3. **`DecoderBlock.forward` 的确切 LN 组合未验证** —— 我只读到 stub。命名 + GPT-2 事实指向"两组 pre-norm"，但**必须以 `test_decoder_block` 为准**（`04` §7.3 标【待核验】）。
4. **`train.py` 的运行代价与可行性未测** —— 它要**联网**下载 `roneneldan/TinyStories` 与 gpt2 分词器（HF 官方站【实测 2026-10-02】可达，0.7s/200；hf-mirror 证书过期不可用）；`context_length=512`、`d_model=33`、`max_steps=100`、`batch=16`，本机 8GB 显存**应够但未实跑**。OOM 先降 `batch_size`。
5. **`from_pretrained()` 未验证** —— 要下载 gpt2 权重（约 500MB）并依赖 `utils.state_dict_converter` 正确；**我没跑**。T4 A6 只要求讲清 converter 在做什么。
6. **环境的三个缺包未装** —— `jaxtyping`、`einops`、`pytest` 当前**不在** `pytorch_env`（【实测】），`model_solution.py` 现在 import 就会失败；`pytest` 用于跑测试。**是否需要安装是派活方要拍的决策点**（本桥不能替用户装）。

---

## 需要决策的点（回报派发方）

1. **装 `jaxtyping` / `einops` / `pytest` 到 `pytorch_env`**：这是 A3 的**环境门**（`requirements.txt` 明确列出）。沙箱默认不让写 env 目录，可能需装到用户级 site-packages（与 gensim 4.4.0 同样的处置）。**没这三个包，A3 一步都跑不动。**
2. **`train.py` 与 `from_pretrained` 的联网前提**：需要下载 TinyStories（1%）与 gpt2 分词器/权重。HF 官方站实测可达，但体量与耗时需确认后可接受的下载预算。

---
*维护：Trae，2026-10-02。*