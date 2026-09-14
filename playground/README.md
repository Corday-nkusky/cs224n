# Playground：练手代码区

> 规则：**这里的代码随便造**——写坏了不心疼，重写比看懂别人的代码学得快。作业代码不写在这里，作业有各自的目录。

## 目录约定

```
playground/
├── t0_pytorch/        T0：手写线性回归、tensor 玩具实验
├── t1_word2vec/       T1：naive softmax / 负采样的小规模复现（不依赖 a1 框架）
├── t2_backprop/       T2：纸推结果 vs 代码验证的对照脚本
├── t3_transformer/    T3：单头 self-attention、因果 mask 小实验
└── README.md
```

- 每个 `tN_*` 对应一个任务阶段，做完的实验**不用删**，验收时它们就是证据
- 跑大文件下载类实验时把数据放本目录下，`data/` 已在 `.gitignore` 里
- 每完成一个值得留的实验就 commit 一次，提交信息写清楚做了什么（比如 `t0: 手写线性回归，验证 zero_grad 遗漏时 loss 漂移`）
