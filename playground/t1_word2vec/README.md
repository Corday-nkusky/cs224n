# playground/t1_word2vec

> ⚠️ **本目录下的两个 `w2v_skipgram_*.py` 是 2026-09-25 生成的学习资料（参考实现），不是你写的练习。**
> 读过 ≠ 会写。T1 的验收 A5 要的是**你能推导出** naive softmax 对中心词向量的梯度，不是你看懂了别人的代码。

【实测】2026-10-02 在 `pytorch_env` 下两个脚本都跑通：
- `w2v_skipgram_numpy.py`：loss 3.2664 → 1.6539，类比 `king - man + woman` → `queen` 命中
- `w2v_skipgram_torch.py`：末尾报 `Adam does not support sparse gradients` —— **这是脚本故意演示的坑，不是 bug**。主流程用的是 SGD（`sparse=True` 的 embedding 只认 SGD / SparseAdam，见该文件第 100 行注释）

## 使用纪律

1. **先不看这两个文件**，自己在 `my_*.py` 里写一遍（哪怕只写 naive softmax 那一版，负采样先不做）
2. 卡住超过 20 分钟再看参考
3. 看完关掉，凭记忆重写，然后 diff —— 差在哪里就是没懂的地方

## 文件

| 文件 | 说明 |
|------|------|
| `w2v_skipgram_numpy.py` | 纯 numpy，逐样本在线 SGD，零第三方依赖（base python 就能跑） |
| `w2v_skipgram_torch.py` | batch 版，用来看清张量维度怎么流动 |
| `run_numpy_out.txt` / `run_torch_out.txt` | 9-25 的运行输出（loss 曲线 + 相似度 + 类比结果），作为对照基线 |

原理、推导、面试题在 **`04_Notes/word2vec/`**（5 份，四维体系：地图 → 跑通 → 直觉与演进 → 原理深潜 → 速查面试）。
