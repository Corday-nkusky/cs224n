# -*- coding: utf-8 -*-
"""给 10 段各插一张「本段导读」（goal）卡，并在第 1 段开头插「本课地图」（roadmap）。

纪律：
  * before / covers / after 三栏都必须写成"可自我检验"的句子，不写"理解 XX 的概念"这种空话。
  * 只插不改：原有块一个不动，全部插在 blocks: [ 之后。
"""
import io

P = r'D:\code\cs224n\site\data\k01.js'
text = io.open(P, encoding='utf-8', newline='').read()

def jslist(items):
    for x in items:
        i = 0
        while True:
            i = x.find("'", i)
            if i < 0:
                break
            # 只允许 \$' 这种在 JS 单引号串里合法的转义；裸单引号会写坏源码
            assert i > 0 and x[i - 1] == '\\', x
            i += 1
    return '[' + ', '.join("'" + x + "'" for x in items) + ']'

def goal(covers, after, before=None):
    out = ["        { t: 'goal',"]
    if before:
        out.append('          before: ' + jslist(before) + ',')
    out.append('          covers: ' + jslist(covers) + ',')
    out.append('          after: ' + jslist(after) + ' },')
    return '\n'.join(out) + '\n'

ROADMAP = """        { t: 'roadmap', intro: r`**本课只有一个主人：这一页。** 下面是 10 段的路线图 —— 点任意一行直接跳过去，不需要另找讲义。
读法建议：1 → 2 → 3 建立直觉，4 → 5 上公式，6 → 7 动手对账，8 → 9 划清边界，10 自测。卡在哪一段就回到哪一段，不必重头看。`,
          items: [
            ['what', '1 · 它是什么', '一句话定义，和 one-hot 差在哪'],
            ['why', '2 · 为什么需要它', 'WordNet 和 one-hot 各自死在哪里'],
            ['intuition', '3 · 直觉', '身份证号 vs 坐标、共现图、代理任务'],
            ['def', '4 · 数学定义', '相似度 / 目标函数 / 三条路线的式子，含出处分级'],
            ['formula', '5 · 公式逐项解释', '点开逐项高亮，看每一部分在干什么'],
            ['numbers', '6 · 数值例子', '3 道能自己算 + 4 个实测结论'],
            ['viz', '7 · 可交互可视化', '11 个交互，每个复现一个结论'],
            ['compare', '8 · 与相近概念比较', '"softmax 太慢"其实是三类问题'],
            ['pitfalls', '9 · 常见误区', '12 条坑，每条给"怎么认出来"'],
            ['quiz', '10 · Quiz', '14 题，覆盖全部 10 段']
          ] },
"""

GOALS = {
 'what': goal(
   covers=[r'词向量到底是什么东西（一句话说得清）',
           r'它和 one-hot 在**数值上**具体差在哪几位',
           r'为什么每个词要配**两套**向量'],
   after=[r'不看笔记，把"稠密 + 相似上下文 + 几何上挨得近"串成一句话',
          r'看到 $u_o^{\\mathsf T}v_c$ 就知道它是一个中心向量乘一个上下文向量',
          r'说出算相似度时两套向量为什么不能混用']),

 'why': goal(
   before=[r'知道词向量是一串**稠密的实数**，作用是把"像不像"变成"距离大不大"'],
   covers=[r'不学词向量，编一本 WordNet 行不行',
           r'不用稠密向量，给每个词发一个编号（one-hot）行不行',
           r'分布语义假说凭什么能替代上面两条路'],
   after=[r'把 WordNet 的五条问题分成"不够好"和"做不到"，并说出分类标准是**能不能修补**',
          r'说出 one-hot 的致命伤是**正交性**（结构问题），不是"表示不够精细"（精度问题）',
          r'用自己的话说出分布语义假说，并给出它的三个工程优点']),

 'intuition': goal(
   before=[r'知道 one-hot 的两个不同词内积恒为 0（第 1 段）'],
   covers=[r'"编号相邻 ≠ 意思相近"到底在说什么',
           r'共现矩阵和图论里的什么东西是同一回事',
           r'什么叫**代理任务**，它为什么有效'],
   after=[r'用"身份证号 / 哈希值"的类比解释 one-hot 为什么给不出相似度',
          r'把共现矩阵的顶点 / 边 / 边权 / 对称 / 稀疏直接对应到图论概念',
          r'说出层次 softmax 里"高频词拿短码"为什么能压低**按词频加权的**平均代价']),

 'def': goal(
   before=[r'知道本课有两条路线：**数数**（共现矩阵 + SVD）与**训练**（预测模型）'],
   covers=[r'相似度、范数这些量怎么定义',
           r'三条优化路线各自的数学形式',
           r'每个式子属于哪一级出处（严格定义 / slides / 论文原文）'],
   after=[r'写出余弦相似度与 Frobenius 范数的定义，并说出前者为什么要除掉模长',
          r'说出"秩 $k$ 近似是**最优**"是定理而不是调参经验',
          r'区分 $v_w$（属于词，$W$ 个）与 $v\'_n$（属于内部节点，$W-1$ 个）']),

 'formula': goal(
   before=[r'见过第 4 段的式子，以及它们的分级标签'],
   covers=[r'softmax 三步各自在做什么',
           r'本课两条核心梯度（softmax 版 / 负采样版）怎么读',
           r'层次 softmax 为什么**天然归一化**'],
   after=[r'逐项点出 softmax 的三步，并说出"贵"具体贵在第三步',
          r'把 $\\partial J/\\partial v_c$ 读成"期望 − 观测"，并说出每次更新在拉什么、推什么',
          r'说出负采样梯度和 softmax 版**逐项**差在哪']),

 'numbers': goal(
   before=[r'知道共现矩阵是怎么一个词一个词数出来的',
           r'看过第 5 段的两条梯度和负采样分布'],
   covers=[r'哪几个数**只靠概念**就能在脑子里算出来',
           r'哪几个数是"数据事实"，只能实测、不该猜'],
   after=[r'不看笔记，算出两个不同 one-hot 的内积，以及 $X[\\text{I}][\\text{like}]$ 的计数',
          r'说出 $V/(K+1)$ 是怎么来的，并解释为什么"省的是计算量**不是**存储"',
          r'读到"余弦全是 1.0000""误差降到 0 就不再降"时，知道该往哪个方向查']),

 'viz': goal(
   before=[r'知道本课的每个结论都对应一个具体数字'],
   covers=[r'11 个交互各自复现正文里的哪一个结论',
           r'改一个参数时，哪张表会跟着变'],
   after=[r'亲手把 $k$ 从 2 调到 300，撞上"余弦全是 1.0000"，并说出两种成因',
          r'在负采样交互里把 $\\alpha$ 从 1 拖到 0.75，看到 the 被压下去、熵升上来',
          r'在梯度交互里确认解析梯度与数值梯度之差在 $10^{-8}$ 量级']),

 'compare': goal(
   before=[r'见过三条优化路线的名字，知道它们都是为了省计算'],
   covers=[r'"softmax 太慢"具体是三类问题里的哪一类',
           r'三条路线各自治好了哪一类',
           r'计数法 vs 预测法、内在评测 vs 外在评测、Skip-gram vs CBOW'],
   after=[r'说出"最致命的是**反向写得多**"以及为什么（梯度被分母从稀疏强行变稠密）',
          r'指出**只有负采样**治了第三类（目标函数错配），层次 softmax 没治',
          r'说出"罕见词学不好是**数据频率**问题，不是 softmax 的问题"']),

 'pitfalls': goal(
   before=[r'读过前面 8 段'],
   covers=[r'12 条最常见的错法，以及每一条**怎么现场认出来**'],
   after=[r'拿到一个新现象（例如"余弦全是 1.0"）能立刻定位到第几条坑',
          r'说出为什么"维度虚高"是唯一一个**看起来像成功了**的失败']),

 'quiz': goal(
   before=[r'读过前 9 段'],
   covers=[r'14 道题，覆盖全部 10 段'],
   after=[r'选择题：能说出其余三个选项**错在哪**，而不只是选对',
          r'开放题：能白纸写出梯度推导，并说出两个推论']),
}

MARK = r"""        { t: 'p', md: r`"""
out = text
for sid, g in GOALS.items():
    # 定位该段：先找 id 行，再向下找 blocks: [ 行
    key = "id: '%s', num:" % sid
    i = out.find(key)
    assert i >= 0, sid
    j = out.find('blocks: [', i)
    assert j >= 0, sid
    k = out.find('\n', j)
    ins = '\n' + g
    if sid == 'what':
        ins = '\n' + ROADMAP + g
    out = out[:k + 1] + ins + out[k + 1:]
    print('  插入 %-10s  (%d 字符)' % (sid, len(ins)))

io.open(P, 'w', encoding='utf-8', newline='').write(out)
print('OK')
