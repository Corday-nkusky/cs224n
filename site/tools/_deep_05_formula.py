# -*- coding: utf-8 -*-
"""段 5「公式逐项解释」深读：补两条梯度的完整推导（原来只有"每一项在说什么"，没有"怎么推出来的"）。
"""
import io

P = r'D:\code\cs224n\site\data\k01.js'
text = io.open(P, encoding='utf-8', newline='').read()

ANCHOR = "source: 'logs/k01_huffman_neg_out.txt \u5b9e\u9a8c A' },"
i = text.find(ANCHOR)
assert i > 0, 'anchor 没找到'
j = text.find('\n', i) + 1

NEW = r'''
        { t: 'h', md: '推导一遍：$\partial J/\partial v_c$ 是怎么来的' },
        { t: 'p', md: r`上面那个"期望 − 观测"不是猜出来的。**完整推导只有五步，值得白纸写一遍**（A2 会考这个）。
**第一步：把 softmax 代进去，用 $\log\frac{a}{b}=\log a-\log b$ 拆开。**
$$J=-\log P(o\mid c)=-\log\frac{\exp(u_o^{\mathsf T}v_c)}{\sum_{w\in V}\exp(u_w^{\mathsf T}v_c)}=-u_o^{\mathsf T}v_c+\log\sum_{w\in V}\exp(u_w^{\mathsf T}v_c)$$
拆开之后，$J$ 变成"减一项"加"对数求和"两段，各自好求。` },
        { t: 'p', md: r`**第二步：第一项对 $v_c$ 求导。**
$$\frac{\partial}{\partial v_c}\left(-u_o^{\mathsf T}v_c\right)=-u_o$$
一个线性项，很直接 —— **结果就是"真实邻居"那个向量，系数是 $-1$。**` },
        { t: 'p', md: r`**第三步：第二项用链式法则。**
记 $z_w=u_w^{\mathsf T}v_c$、$Z=\sum_w\exp(z_w)$，则
$$\frac{\partial\log Z}{\partial v_c}=\frac{1}{Z}\sum_{w}\exp(z_w)\,u_w=\sum_{w}\underbrace{\frac{\exp(z_w)}{Z}}_{=\,P(w\mid c)}u_w$$
**这一步是关键**：$\exp(z_w)/Z$ 恰好就是 softmax 概率 $P(w\mid c)$。所以第二项的导数是一个**按当前概率加权的平均**。` },
        { t: 'p', md: r`**第四步：合起来。**
$$\frac{\partial J}{\partial v_c}=\sum_{w\in V}P(w\mid c)\,u_w\;-\;u_o$$
**第五步（读懂它）**：第一项是模型**自己以为**的邻居（按概率加权），第二项是**真实出现**的邻居。所以每次更新都在做同一件事 —— **把中心词向量拉向真实邻居、推离它误以为的邻居。**` },
        { t: 'note', tone: 'key', title: '两个顺手就能说出的推论', md: r`① **模型已经很准时，梯度会自动变小**：若 $P(o\mid c)\to1$，第一项 $\approx u_o$，与第二项抵消，梯度 $\to0$ —— 不用再更新了。
② **另外两个梯度的形状**：$\partial J/\partial u_o=(P(o\mid c)-1)v_c$、$\partial J/\partial u_{w\neq o}=P(w\mid c)v_c$。它们和**逻辑回归 / 交叉熵**的梯度完全同构 —— 这是后面所有 softmax 类损失的通用结构。
⚠️ 这条公式 **slides 里没有**（第 18–19 页只有一页 Interactive Session），是按标准推导补齐的。` },

        { t: 'h', md: '负采样梯度：为什么第一项多了一个 $(1-\sigma)$' },
        { t: 'p', md: r`对 $J_{\text{neg}}=-\log\sigma(u_o^{\mathsf T}v_c)-\sum_k\log\sigma(-u_k^{\mathsf T}v_c)$ 求导，用到 $\frac{d}{dx}\sigma(x)=\sigma(x)\big(1-\sigma(x)\big)$：
$$\frac{\partial J_{\text{neg}}}{\partial v_c}=-\Big(1-\sigma(u_o^{\mathsf T}v_c)\Big)u_o+\sum_{k}\sigma(u_k^{\mathsf T}v_c)\,u_k$$` },
        { t: 'p', md: r`**和 softmax 版逐项比一比**：

| | softmax 版 | 负采样版 |
|---|---|---|
| 第一项（真实邻居） | $-u_o$，**系数恒为 1** | $-(1-\sigma)u_o$，**误差自适应** |
| 第二项（压低谁） | $\sum_{w\in V}P(w\mid c)u_w$ —— **遍历整个词表** | $\sum_{k\in K}\sigma(\cdot)u_k$ —— **只算 $K$ 个** |

**一句话结论：形状几乎一样，只是把"遍历全词表"换成了"只看 K 个"。** 负采样不是另一种理论，**它是同一个梯度的稀疏近似。**` },
        { t: 'note', tone: 'info', title: '自己验一遍', md: r`第 7 段的梯度交互可以亲手对账：改 $v_c$ 和 $u_o$，页面上会同时显示**解析梯度**和**中心差分数值梯度**，两者之差在 $10^{-8}$ 量级。` },

'''

text = text[:j] + NEW + text[j:]
io.open(P, 'w', encoding='utf-8', newline='').write(text)
print('OK 段 5 完成')
