# -*- coding: utf-8 -*-
"""段 8 从「与相近概念比较」扩成「更大的图景」：
补两条路对照、原始计数的 4 个 hack、GloVe、内在 vs 外在评测、静态表示的死穴与八代演进表。
同时改段标题与导读卡。
"""
import io

P = r'D:\code\cs224n\site\data\k01.js'
text = io.open(P, encoding='utf-8', newline='').read()


def after(anchor, payload, tail='\n'):
    global text
    i = text.find(anchor)
    assert i > 0, 'anchor 没找到：' + anchor[:44]
    j = text.find(tail, i)
    assert j > 0, 'tail 没找到：' + anchor[:44]
    k = text.find('\n', j) + 1
    text = text[:k] + payload + text[k:]


def before(anchor, payload):
    global text
    i = text.find(anchor)
    assert i > 0, 'anchor 没找到：' + anchor[:44]
    text = text[:i] + payload + text[i:]


# ---------- 改标题与导读卡 ----------
old_title = "      id: 'compare', num: 8, title: '\u4e0e\u76f8\u8fd1\u6982\u5ff5\u6bd4\u8f83',"
assert text.count(old_title) == 1
text = text.replace(old_title, "      id: 'compare', num: 8, title: '\u66f4\u5927\u7684\u56fe\u666f',")

old_goal = """          covers: ['"softmax 太慢"具体是三类问题里的哪一类', '三条路线各自治好了哪一类', '计数法 vs 预测法、内在评测 vs 外在评测、Skip-gram vs CBOW'],
          after: ['说出"最致命的是**反向写得多**"以及为什么（梯度被分母从稀疏强行变稠密）', '指出**只有负采样**治了第三类（目标函数错配），层次 softmax 没治', '说出"罕见词学不好是**数据频率**问题，不是 softmax 的问题"'] },"""
assert text.count(old_goal) == 1, text.count(old_goal)
new_goal = """          covers: ['"softmax 太慢"具体是三类问题里的哪一类，谁治了哪一类', '计数法和预测法各自的优缺点，以及 **GloVe** 在中间的位置', '内在评测和外在评测的区别，怎么判断一套词向量好不好'],
          after: ['说出"最致命的是**反向写得多**"以及为什么（梯度被分母从稀疏强行变稠密）', '说出 GloVe 为什么盯**共现概率的比值**而不是概率本身', '说出静态表示的**一词一义**死穴，以及它到哪一代才被解决'] },"""
text = text.replace(old_goal, new_goal)

# ---------- 第 1 段地图里那一行也要跟着改 ----------
old_rm = """['compare', '8 \u00b7 \u4e0e\u76f8\u8fd1\u6982\u5ff5\u6bd4\u8f83', '"softmax \u592a\u6162"\u5176\u5b9e\u662f\u4e09\u7c7b\u95ee\u9898'],"""
assert text.count(old_rm) == 1, 'roadmap 行没找到：%d' % text.count(old_rm)
text = text.replace(old_rm, """['compare', '8 \u00b7 \u66f4\u5927\u7684\u56fe\u666f', '\u4e24\u6761\u8def\u3001GloVe \u4e0e\u8bc4\u6d4b\u4f53\u7cfb'],""")

# ---------- 段首：两条路的完整对照 ----------
before("        { t: 'h', md: '\"softmax 太慢\"其实是三类问题，别混为一谈' },", r'''        { t: 'p', md: r`前面 7 段都在讲同一条路：**词向量是"学"出来的**（word2vec 的代理任务）。其实还有另一条 —— **"数"出来的**。
这一节把两条路摆到一起，补上它们各自的边界，然后回答最后一个问题：**怎么判断一套词向量是好是坏？**` },
        { t: 'table', head: ['', '计数法（共现 + SVD）', '预测法（word2vec）'], rows: [
          ['怎么做', '数一遍语料 → SVD 降维', '训练一个预测模型'],
          ['优点', '统计充分、可解释、**一次成型**', '**可增量**、复杂度可控'],
          ['缺点', '大矩阵 SVD 很贵；**原始计数效果差，需要一堆 hack**', '要调参、要训练'],
          ['slides 的评价', 'Lec2 p33 叫它 classic method，但 p34 明说对原始计数直接跑 SVD 效果不好', 'Lec2 p26 叫它 standard word2vec']
        ] },

''')

# ---------- 段末追加：hack / GloVe / 评测 / 一词一义 ----------
after("title: '评测这条最容易把结论说反'", r'''
        { t: 'h', md: '计数法的第一道坎：对原始计数直接跑 SVD 不好用' },
        { t: 'p', md: r`slides p34 用**三个感叹号**强调这件事：*Running an SVD on raw counts does not work well!!!*
**原因**：the / he / has 这类**功能词**太频繁，**句法信号压倒了语义信号** —— 降维抓到的第一个主轴往往是"这个词常不常和功能词一起出现"，而不是它的意思。` },
        { t: 'table', head: ['hack', '做法', '解决什么'], rows: [
          ['取对数', '对频次取 $\\log$', '压缩高频词的统治地位'],
          ['截断', '$\\min(X,t)$，$t\\approx100$', '同上，加一个硬上限'],
          ['忽略功能词', '干脆不统计 the / he / has', '去掉纯句法信号'],
          ['**斜坡窗口**', '离得近的词给更高权重', '把**距离**信息也装进去'],
          ['用相关性替代计数', '算相关系数，**负值置 0**', '去掉"共同不出现"的干扰']
        ], note: r`slides p35 提到 **COALS 模型**（Rohde et al. 2005）就是用这类修正做出来的。
**这一节和 A1 作业直接相关**：你在作业里对共现矩阵做 SVD 之前也得先做这类处理，否则画出来的图会是**一团**。` },

        { t: 'h', md: 'GloVe：两条路的合流' },
        { t: 'p', md: r`**GloVe**（Pennington, Socher, Manning, EMNLP 2014）问的是：
> **怎么把"共现概率的比值"编码成向量空间里的线性成分？**

**这句话什么意思**：光看 $P(\\text{ice}\\mid\\text{solid})$ 高不高没用，因为 $P(\\text{water}\\mid\\text{solid})$ 也高。真正把 ice 和 steam 分开的是**比值**。` },
        { t: 'table', head: ['$k$', '$P(k\\mid\\text{solid})$', '$P(k\\mid\\text{gas})$', '$\\dfrac{P(k\\mid\\text{solid})}{P(k\\mid\\text{gas})}$'], rows: [
          ['water', '大', '大', '$\\approx 1$ —— **这个比值什么都没告诉你**'],
          ['ice', '大', '小', '**很大** —— 信号在这里'],
          ['steam', '小', '大', '**很小**']
        ], note: r`这就是"比值里藏着语义"的具体含义：**单个概率区分不了 water，比值才能分开 ice 和 steam。**` },
        { t: 'note', tone: 'info', title: '两个卖点，外加一条诚实声明', md: r`模型是 **log-bilinear**（带向量差）。卖点：**训练快**、**能扩展到超大语料**。
**和 word2vec 的关系一句话**：word2vec 只看**局部窗口**、边扫边学；GloVe 先攒**全局共现统计**、再拟合。**目标是同一件事的两种走法。**
⚠️ **GloVe 的损失函数在 slides 第 37 页的图里，文字层提取不到**，本页不给公式。需要就读原论文。` },

        { t: 'h', md: '怎么评：内在评测 vs 外在评测' },
        { t: 'table', head: ['', '内在评测（intrinsic）', '外在评测（extrinsic）'], rows: [
          ['在哪评', '专门的**中间子任务**', '**真实任务**'],
          ['速度', '快', '慢'],
          ['优点', '帮你理解这个子系统', '**结论直接可用**'],
          ['缺点', '**不确定是否对真实任务有用**', '**说不清是子系统的问题，还是它跟别的部分交互的问题**'],
          ['判"赢"的标准', '——', '**只换掉这一个子系统，准确率提升 = 赢了**']
        ] },
        { t: 'p', md: r`**最典型的内在评测：词向量类比。** 形式是 $a:b::c:?$，比如 man:woman :: king:?。
做法：算 $v_{\\text{king}}-v_{\\text{man}}+v_{\\text{woman}}$，再用**余弦距离**检索最近的词。**两个必须注意的细节**：
① **要把输入的三个词从检索结果里剔除** —— 否则答案永远是 king 自己（这是第 9 段第 2 条坑的来历）；
② **已知缺陷**：信息在向量里但**不是线性关系**时，类比测不出来（slides p39 原话 *What if the information is there but not linear?*）。` },
        { t: 'code', text: 'king   - man   + woman  ->  queen(0.999), prince(0.999), princess(0.998)\nparis  - france+ japan  ->  beijing(0.999), tokyo(0.999)' },
        { t: 'p', md: r`**另一类内在评测：跟人类打分比相关性。** slides 给的 **WordSim353** 是 353 对词，每对都有人类打好的平均相似度分，拿向量距离和人类打分算相关性：` },
        { t: 'table', head: ['词 1', '词 2', '人类打分'], rows: [
          ['tiger', 'cat', '7.35'],
          ['tiger', 'tiger', '10'],
          ['computer', 'internet', '7.58'],
          ['plane', 'car', '5.77'],
          ['stock', 'phone', '1.62'],
          ['stock', 'jaguar', '0.92']
        ], note: r`⚠️ 这些数字是从 slides 表格抄的，**我没有下载 WordSim353 数据集复核**。注意 <code>tiger</code>–<code>tiger</code> 是满分 10，而 <code>stock</code>–<code>jaguar</code> 只有 0.92 —— 人类打分把"完全同义"和"几乎无关"标在了两端。` },
        { t: 'note', tone: 'info', title: '外在评测的例子：NER', md: r`**命名实体识别**（NER）：识别人名、机构名、地名。slides 给的例句是 *Chris Manning lives in Palo Alto.*
**判定"这套词向量到底好不好"最硬的证据，就是把它换进 NER，看准确率涨不涨。** 这也是第 9 段第 9 题考的那条。` },

        { t: 'h', md: '这一代技术的死穴：一词一义' },
        { t: 'p', md: r`**不管上下文是什么，bank 只有一个向量。**
- "I deposited money in the **bank**" —— 金融机构
- "We sat on the river **bank**" —— 河岸

**两个意思被压进同一个向量**，压出来的结果偏向哪边，完全取决于语料里哪个意思出现得更多。这不是实现 bug，是**静态表示的定义决定的** —— 一张词表对应一张矩阵，一个词只能有一行。` },
        { t: 'table', head: ['代', '做法', '解决了什么', '还差什么'], rows: [
          ['1', 'BoW（词袋）', '文本变成向量', '丢词序、稀疏'],
          ['2', 'LSA / SVD', '降维、抓住主题', '原始计数效果差'],
          ['3', 'NNLM（神经语言模型）', '第一次"学"出词向量', '慢'],
          ['4', '**Word2Vec**', '**快到能用在工业规模**', '一词一义'],
          ['5', 'GloVe', '用全局统计补上只看局部窗口的短板', '一词一义'],
          ['6', 'fastText', '加入子词信息，罕见词有救', '一词一义'],
          ['7', '**ELMo / BERT**', '**上下文相关表示**', '贵，需要大模型'],
          ['8', '句向量', '整句一个向量', '长度与组合性']
        ], note: r`**word2vec 的历史定位**：第 4 代。它的核心贡献是**把代价从 $O(V)$ 降到 $O(K)$** —— **这是一次效率革命，不是效果革命。** 这句话能解释为什么 word2vec 论文那么短却那么有名。` },
        { t: 'note', tone: 'warn', title: '记住这个死穴 —— 它是整条缺陷链上的下一个扣', md: r`一词一义要到 **ELMo / BERT（上下文相关表示）**才解决，那是 K03 之后的主线。
**下一课 K02** 讲神经网络与反向传播 —— 也就是"怎么把这一课手推的梯度，交给框架自动算"。` },
''', tail='` },')

io.open(P, 'w', encoding='utf-8', newline='').write(text)
print('OK 段 8 完成')
