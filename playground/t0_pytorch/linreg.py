"""T0 验收 A1：纯 tensor + autograd 手写线性回归。

规则：不用 nn.Linear / nn.Module / optim —— 只许用 tensor 的加减乘除和 loss.backward()。
目的：逼自己看见 autograd 在每一步做了什么。

跑法：D:/code/anaconda/envs/pytorch_env/python.exe linreg.py
"""

import torch

torch.manual_seed(0)

# 1. 造数据：y = w_true * x + b_true + 噪声
w_true, b_true = 3.0, -1.5
x = torch.linspace(-2, 2, 64)
y = w_true * x + b_true + 0.3 * torch.randn(64)

# 2. 参数初始化：为什么 requires_grad=True？为什么初始值不是 0？（T0 问答 A4/A2 会问）
w = torch.tensor(____, requires_grad=____)  # TODO: 填一个非零初值 + 布尔值
b = torch.tensor(____, requires_grad=____)  # TODO

lr = 0.05
for step in range(200):
    # 3. 前向：y_pred = w*x + b（广播机制会自动处理）
    y_pred = ____  # TODO

    # 4. 损失：MSE，注意 backward() 要求 loss 是什么形状？（T0 问答 A5）
    loss = ____  # TODO: 手写 MSE，别用 nn.functional

    # 5. 反向：这一行之后，w.grad / b.grad 里存的是什么？谁的导数？（T0 问答 A2）
    ____  # TODO

    # 6. 手动梯度下降：step 在这里等价于 optimizer.step() 做的事（T0 问答 A3）
    with torch.no_grad():
        w -= ____  # TODO
        b -= ____  # TODO

    # 7. 为什么下一轮 backward 之前必须清梯度？不清会看到什么现象？
    #    实验：注释掉下面两行，跑两次对比 loss 曲线，把结论写进 T0 文档自答区
    w.grad.____  # TODO
    b.grad.____  # TODO

    if step % 20 == 0:
        print(f"step {step:3d}  loss {loss.item():.4f}  w {w.item():.3f}  b {b.item():.3f}")

print(f"\n期望: w≈{w_true}, b≈{b_true}")
assert abs(w.item() - w_true) < 0.1 and abs(b.item() - b_true) < 0.1, "没收敛，回头查前向或梯度"
print("通过：参数收敛到真值附近")
