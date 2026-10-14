/* ============================================================
 * A1 作业页内容层
 * ------------------------------------------------------------
 * 这是「动手作业」轨道的第一份。与知识点课（K01–K12）的区别：
 *   知识点回答"这是什么"，作业回答"现在动手做什么、做到什么算完"。
 *   所以段序不是「是什么→为什么→直觉→…→自测」，而是
 *   「交什么 → 环境关 → 桥 → 逐格击破 → 坑 → 产出 → 验收 → 自检」。
 *
 * 三条纪律（与 k01.js 相同）：
 *   1. 数字能复算的就现算 —— toy 语料与 M_test_ans 由 js/core/a1_core.js 提供。
 *   2. 不写模糊词（大约 / 差不多 / 一般来说）。
 *   3. 站点就是正文 —— 不放「去别处读原文」的指针。要引材料就引**作业文件本身**
 *      （notebook 的 cell 号、data/ 下的数据文件），那些是学生手上真有的东西。
 *
 * ⚠️ 本文件所有正文写在 String.raw 模板里，而 String.raw **不处理转义**：
 *    模板里写 \` 会原样留下一个反斜杠。所以这里**行内代码一律用 <code> 标签**，
 *    多行代码用 { t: 'code' } 块 —— 模板里绝不出现反引号。
 * ============================================================ */
(function () {
  'use strict';
  var r = String.raw;

  window.KB = window.KB || {};
  window.KB.chapters = window.KB.chapters || {};

  /* ---------- 交互模块注册表（site.check.js 会核对 key 是否存在） ---------- */
  var VIZ = ['a1-cooc', 'a1-wrong'];

  var sections = [

    /* ================= 1 · 这个作业要你交什么 ================= */
    {
      id: 'what', num: 1, title: '这个作业要你交什么',
      blocks: [
        { t: 'roadmap',
          intro: r`**这一页是 A1 的操作台，不是另一份讲义。** 它按"你实际要动手的顺序"排：先确认交什么、再过关、再过桥、再逐个函数击破，最后验收。
材料只有三样：**notebook**（作业本体）、<code>data/</code> 里的数据、**这一页**。`,
          items: [
            ['what', '1 · 要你交什么', '两个 Part、25 分、交付物是一份 PDF'],
            ['env', '2 · 开工前的两关', '第一个 cell 会卡住整页；GloVe 要下 250 MB'],
            ['bridge', '3 · 四级台阶', '从"读懂了"走到"写得出"的四步'],
            ['funcs', '4 · 四个函数', '签名、要做什么、测试怎么判'],
            ['traps', '5 · 三个最易犯的错', '窗口边界 / 计数口径 / 词表顺序'],
            ['q15', '6 · Q1.5 真语料出图', '150 条 IMDB 影评跑一次'],
            ['part2', '7 · Part 2 与书面题', 'GloVe、类比、偏见'],
            ['submit', '8 · 交付与验收', '七条验收标准'],
            ['pitfalls', '9 · 常见坑与排查', '跑不动时按这个顺序查'],
            ['checklist', '10 · 自检与自测', '做完之前逐条打勾']
          ] },

        { t: 'goal',
          before: ['读完 K01 的第 1、3、4、6 段（共现矩阵 → SVD → 降维）', '知道余弦相似度是什么'],
          covers: ['A1 两个 Part 各自要交什么、各多少分', '它和 K01 是什么关系 —— 哪一块是概念的代码版'],
          after: ['能说出 Part 1 与 Part 2 的方法差异（计数 vs 预测）', '知道最终要交的是一份什么文件'] },

        { t: 'p', md: r`A1 全称 *Exploring Word Vectors*，25 分。它的本体是**两条路线的对照体验**：

**Part 1（10 分）** 用计数法从零造词向量 —— 你自己写代码数共现矩阵、做 SVD 降到 2 维、画散点图。

**Part 2（15 分）** 拿现成的预测法产物（GloVe 预训练向量）来用 —— 不用你训练，但要你分析它、量它、找出它的问题。

要你看的不是"哪个更好"，是**两条路线在同一个坐标系里长什么样**。` },

        { t: 'table',
          head: ['', 'Part 1 · 计数法', 'Part 2 · 预测法'],
          rows: [
            ['方法', '共现矩阵 + 截断 SVD', '直接加载 GloVe 预训练向量'],
            ['你要写的代码', '**4 个函数**（Q1.1–Q1.4）', '**0 个**（<code>get_matrix_of_vectors</code> 已给）'],
            ['产物', '1 张散点图 + 2 道书面题', '1 张散点图 + 8 道题（代码 + 书面）'],
            ['对应 K01', '第 3、4、6 段', '第 8 段（GloVe 与评测）'],
            ['一句话', '从语料里**数**出语义', '用别人**训**好的语义'] ],
          note: '两张图都不是"随便画一个"：每张都要与 <code>imgs/</code> 里的参考图对得上，这是硬判据。' },

        { t: 'h', md: 'Part 1 具体要你做什么' },
        { t: 'p', md: r`四个函数串成一条流水线，**上一处的输出是下一处的输入**：

1. <code>distinct_words</code> 把语料拍平、去重、**排序**，得到词表与它的长度。
2. <code>compute_co_occurrence_matrix</code> 拿词表开一张 $N\times N$ 的零矩阵，把每个词的窗口邻居**数**进去。
3. <code>reduce_to_k_dim</code> 用截断 SVD 把 $N\times N$ 压成 $N\times 2$。
4. <code>plot_embeddings</code> 把每一行当成一个 2 维坐标，画点贴标签。

前两个是这道题的**主体**（2 + 3 分），后两个各 1 分、各一行代码。` },
        { t: 'ul', items: [
          '**Q1.1–Q1.4 用 toy 语料**：两句带 <code>&lt;START&gt;</code> / <code>&lt;END&gt;</code> 的短句，跑完一个立刻对一次答案。',
          '**Q1.5 用真语料**：150 条 IMDB 影评（<code>NUM_SAMPLES = 150</code>），出图后回答两个书面问题。',
          '词表规模是这条流水线**唯一**会变大的东西：toy 语料 10 个词，IMDB 150 条影评约 3,000 个词。'
        ] },

        { t: 'h', md: 'Part 2 具体要你做什么' },
        { t: 'p', md: r`Part 2 不给代码题，给的是**分析题**。加载 GloVe（40 万词 × 200 维）之后：

- **Q2.1** 把同一批词用 GloVe 降到 2 维画出来，和 Part 1 那张图**对比**（哪里像、哪里不像、为什么）。
- **Q2.2 / Q2.3** 用余弦相似度找多义词与同义/反义词，看向量**抓没抓住**这些关系。
- **Q2.4–Q2.6** 类比：<code>king − man + woman ≈ queen</code> 这类关系，哪些成立、哪些不成立。
- **Q2.7–Q2.9** 偏见：<code>man : profession</code> 与 <code>woman : profession</code> 的最近邻不一样 —— 分析偏见怎么进到向量里，以及怎么缓解。` },
        { t: 'note', tone: 'info', title: '这一页不是"再读一遍 K01"',
          md: r`K01 讲的是**为什么**（为什么共现矩阵能表示语义、为什么 SVD 能降维）。这一页讲的是**怎么写出来**，以及**怎么知道自己写对了**。

两者不重复：K01 第 7 段那些交互让你"看懂"，这里的两个交互让你"先预演一遍，再回到自己电脑上写"。` },

        { t: 'h', md: '分数构成' },
        { t: 'table',
          head: ['题', '类型', '分值', '在哪一段讲'],
          rows: [
            ['Q1.1 <code>distinct_words</code>', '代码', '2', '第 4 段'],
            ['Q1.2 <code>compute_co_occurrence_matrix</code>', '代码', '3', '第 4、5 段'],
            ['Q1.3 <code>reduce_to_k_dim</code>', '代码', '1', '第 4 段'],
            ['Q1.4 <code>plot_embeddings</code>', '代码', '1', '第 4 段'],
            ['Q1.5 共现图分析', '书面', '3', '第 6 段'],
            ['Q2.1 GloVe 图分析', '书面', '3', '第 7 段'],
            ['Q2.2 一词多义', '代码 + 书面', '1.5', '第 7 段'],
            ['Q2.3 同义与反义', '代码 + 书面', '2', '第 7 段'],
            ['Q2.4–Q2.6 类比', '代码 + 书面', '4.5', '第 7 段'],
            ['Q2.7–Q2.9 偏见', '代码 + 书面', '3', '第 7 段'] ],
          source: 'notebook 每道题的标题括号里都标了分值' },

        { t: 'h', md: '交付物' },
        { t: 'ol', items: [
          '**notebook 全程跑通**：Clear Outputs → Run All，不能有报错。',
          '**两张图与参考图对得上**：<code>imgs/question_1.5.png</code>（Part 1）与 <code>imgs/question_2.1.png</code>（Part 2）。',
          '**所有书面题都写了**：notebook 里那些 "Write your answer here." 的红字下面。',
          '**导出成一份 PDF**：Save and Export Notebook as → PDF（Pandoc 缺失时先导 HTML，浏览器 Ctrl+P 存 PDF）。'
        ] },
        { t: 'note', tone: 'warn', title: '评分的人只看那份 PDF',
          md: r`notebook 里 "Clear Outputs of All Cells" 之后再 "Run All"，是为了让**代码和它的输出一起**进 PDF。

如果某个单元格没跑，PDF 上就是一片空白 —— 评分的人看不到你的解法，这道题就是 0 分，哪怕你本地跑得再好。导完 PDF **自己翻一遍**，确认每一道代码题的输出都在。` }
      ]
    },

    /* ================= 2 · 开工前的两关 ================= */
    {
      id: 'env', num: 2, title: '开工前的两关',
      blocks: [
        { t: 'goal',
          before: ['知道 A1 要交什么'],
          covers: ['哪两个地方最容易在开工前把人卡住', '每关具体怎么过（命令、判断标准、退路）'],
          after: ['能自己判断"这个环境到底能不能开工"', '知道 GloVe 下载慢的时候有哪两条退路'] },

        { t: 'p', md: r`A1 有两个**和代码无关**的门槛，都出现在你写第一个函数之前。它们的共同点是：**报错信息完全不指向真正的原因** —— 先知道它们长什么样，能省掉一两个小时。` },

        { t: 'h', md: '第一关：notebook 的第一个 cell 会卡住整页' },
        { t: 'p', md: r`第一个 cell（import 那格）有两件重活，**顺序还反了**：` },
        { t: 'code', text: r`from gensim.models import KeyedVectors          # 先 import 一个重库
...
from datasets import load_dataset
imdb_dataset = load_dataset("stanfordnlp/imdb", name="plain_text")   # 再下载语料` },
        { t: 'p', md: r`注意 <code>import numpy</code> 排在**这两件事之后**。所以只要 gensim 装不上、或者 IMDB 下不动，**连 numpy 都还没导进来**，后面每一个 cell 都会跟着报"未定义" —— 看起来像满屏都错了。` },
        { t: 'note', tone: 'warn', title: '判断标准',
          md: r`如果第一个 cell 报的是 <code>NameError: name 'np' is not defined</code> 或类似"后面全崩"的画面 —— **不要去查后面的 cell**。回到第一个 cell，直接看它是哪一行先失败的。` },
        { t: 'p', md: r`这一关在本机**已经实测过了**，结论是能过：` },
        { t: 'kv', rows: [
          ['<code>gensim</code>', '已装（用户级 site-packages），导入正常'],
          ['<code>datasets</code>', '已装'],
          ['IMDB 语料', '已预下载到 HF 缓存并实测加载成功（train / test 各 25k、unsupervised 50k）'],
          ['网络', '<code>huggingface.org</code> 可达']
        ] },
        { t: 'p', md: r`所以 **第一个 cell 直接整格跑，不要注释掉任何一行** —— Q1.5 的真语料就是从这里来的。` },

        { t: 'h', md: '第二关：Part 2 的 GloVe 要联网下 250 MB' },
        { t: 'p', md: r`Part 2 第一件事是加载 GloVe：` },
        { t: 'code', text: r`gensim.downloader.api.load("glove-wiki-gigaword-200")   # 40 万词 × 200 维，约 250 MB` },
        { t: 'p', md: r`**Part 1 完全不涉及这一步**（Part 1 只用你自己数的共现矩阵）。所以这一关可以推到 Part 1 验收之后再处理。notebook 自带的注释也写了：<code>If you are receiving "reset by peer" error, rerun the cell</code>。` },
        { t: 'p', md: r`下载不动时的两条退路，**代价不同，要自己选**：` },
        { t: 'ol', items: [
          '**手动下文件**，用 <code>KeyedVectors.load_word2vec_format()</code> 本地加载，绕开 <code>gensim.downloader</code>。结论不受影响（还是那 40 万词 × 200 维）。',
          '**换一个更小的向量**（比如 <code>glove-wiki-gigaword-100</code>）。这条路要**承认结论会变** —— Q2.x 的相似度与类比结果依赖具体向量，图对不上参考图是正常的。'
        ] },
        { t: 'note', tone: 'warn', title: '换了向量就得改口',
          md: r`题目要你对比的参考图 <code>imgs/question_2.1.png</code> 是用 **200 维**那版画的。换成 100 维之后，你有两个选择：要么在答案里写明"我用了 100 维，所以与参考图有差异"，要么老老实实下 200 维。**不要用 100 维的结果去解释 200 维的图。**` },

        { t: 'h', md: '一张表：开工前该确认什么' },
        { t: 'kv', rows: [
          ['Python 版本', '≥ 3.8（notebook 第一个 cell 自己会 assert）'],
          ['numpy / scipy', '已装（<code>distinct_words</code> 与共现矩阵要用）'],
          ['sklearn', '已装（<code>TruncatedSVD</code> 在它里面）'],
          ['matplotlib', '已装（Q1.4 画图用）'],
          ['gensim', '已装 —— 第一关的关键'],
          ['IMDB 数据', '已缓存 —— 第一关的另一半'],
          ['GloVe 向量', '**未下载**（250 MB）—— Part 2 才需要']
        ] },
        { t: 'note', tone: 'info', title: '一个反直觉的点',
          md: r`A1 是四个作业里**唯一不用 PyTorch** 的一个。全程 NumPy + gensim + sklearn。

所以"PyTorch 还没学"不构成不开工的理由 —— 硬前置是**共现矩阵和 SVD 的直觉**，那是 K01 给的。` }
      ]
    },

    /* ================= 3 · 四级台阶 ================= */
    {
      id: 'bridge', num: 3, title: '四级台阶',
      blocks: [
        { t: 'goal',
          before: ['环境两关都过了'],
          covers: ['读完 K01 之后、写代码之前，中间差的到底是什么', '把这段距离拆成四级的理由'],
          after: ['能说清"概念懂"和"写得出"之间缺的是哪一层', '知道每一级要花多久、产出什么'] },

        { t: 'p', md: r`读完 K01 之后打开 notebook，最常见的反应是"每个概念我都懂，但不知道第一行写什么"。

**这个 gap 不是概念 gap，是两层机械 gap：**

1. **还没看过"概念变成代码跑起来"的样子** —— K01 里看过手算表，但没看过一段真代码的输出。
2. **还没把"怎么数"变成给计算机的精确步骤** —— 人能容忍"看着办"，机器不能。` },
        { t: 'p', md: r`所以这段路拆成四级，**每一级只跨一个能力级，顺序不要跳**：` },

        { t: 'table',
          head: ['台阶', '做什么', '产出', '约多久'],
          rows: [
            ['① 跑 demo', '跑一遍 K01 的演示脚本，**只看输出，不看源码**', '对每个输出有一份预期，猜错处已标出', '20 分钟'],
            ['② 手算 + 伪代码', '拿 toy 语料在纸上数一遍共现矩阵，再写五行伪代码', '一张手算表 + 五行伪代码', '25 分钟'],
            ['③ numpy 微热身', '只练作业要用到的那几个语法点', '一个能跑的练习 cell', '10 分钟'],
            ['④ 四个函数', '写一个、立刻跑紧跟其后的 sanity check', '四个函数全绿', '1.5–2 小时'] ],
          note: '② 的产出（五行伪代码）就是 ④ 里前两个函数的**设计稿** —— 能写出来，剩下只是翻译成 Python。' },

        { t: 'h', md: '台阶 ① 先"看见"：跑演示，不看源码' },
        { t: 'p', md: r`K01 有一份配套的演示脚本，只需要 numpy，一秒出结果。跑它的规矩是**先写下你对输出的预期，再对比实际输出** —— 猜错的地方做个记号，那就是你概念里的洞。

**不要打开那份脚本的源码看。** 它里面有共现矩阵的实现，提前看等于把 Q1.2 的答案抄了。你只需要看终端输出。` },
        { t: 'note', tone: 'warn', title: '同理：别偷看测试里的答案矩阵',
          md: r`notebook 的 Q1.2 测试 cell 里印着一张完整的 <code>M_test_ans</code>。**自己数完再看。**

这一页第 4 段有个交互就是让你在数完之后**自动和它对账** —— 那时候看答案才有意义。` },

        { t: 'h', md: '台阶 ② 手算 + 伪代码：这一步不能省' },
        { t: 'p', md: r`拿 notebook 里 toy 语料那两句话（带 <code>&lt;START&gt;</code> / <code>&lt;END&gt;</code>），按顺序走一遍：

1. 列出全部不同的词，**按排序会给出的顺序**列。这里有个坑：<code>&lt;</code> 的编码比任何字母都小，所以 <code>&lt;END&gt;</code> 和 <code>&lt;START&gt;</code> 排在最前面 —— 想清楚再列。
2. 给每个词编号，这一步的产物就是 <code>word2ind</code>。
3. 开一张 $N\times N$ 的全 0 表。
4. **以每个词轮流当中心词**，数它窗口内出现谁，格子 +1。
5. 最后检查两件事：矩阵对称吗？对角线（自己跟自己）是几？

然后把过程写成**五行以内的伪代码**。` },
        { t: 'p', md: r`这五步听起来笨，但它把机器要做的事**完整暴露**了一遍：你会亲手碰到"句首的词窗口不完整"这件事，而那正是第 5 段要讲的第一个坑。跳过它，你只会在调 assert 的时候遇到同一个问题，而且不知道从哪查起。` },

        { t: 'h', md: '台阶 ③ numpy 微热身' },
        { t: 'p', md: r`作业需要的新语法只有这几块，先在一个空 cell 里玩明白（**不要往 notebook 的 import 列表里加东西**，题目明确说了保持可提交）：` },
        { t: 'code', text: r`import numpy as np

# 开表
M = np.zeros((3, 3))

# 数一对
M[0, 1] += 1

# 词 -> 编号 的字典
words = ['b', 'a', 'c']
w2i = {w: i for i, w in enumerate(sorted(words))}

# 窗口遍历的骨架：j 从 center-window 到 center+window，跳过越界和自己
for i in range(len(words)):
    for j in range(max(0, i - 1), min(len(words), i + 2)):
        if i != j:
            print(words[i], '->', words[j])

# Q1.3 要用的降维（先确认它返回的形状）
from sklearn.decomposition import TruncatedSVD
X = np.random.rand(5, 4)
print(TruncatedSVD(n_components=2, n_iter=10).fit_transform(X).shape)   # 应该是 (5, 2)` },
        { t: 'p', md: r`**这四块背下来就够了。** 特别是第三块那个 <code>max(0, …)</code> / <code>min(len, …)</code> —— 它是台阶②里"句首句尾窗口不完整"的代码版，也是第 5 段的第一个坑。` },

        { t: 'h', md: '台阶 ④ 四个函数，填一格验一格' },
        { t: 'p', md: r`**写一个，立刻跑紧跟其后的 sanity check cell；过了再写下一个。** 不要一口气写完四个再一起跑 —— 四个里错一个，assert 只会指向最先失败的那一行，你会误以为后面三个也有问题。

具体每个函数怎么写、坑在哪，见下一段。` }
      ]
    },

    /* ================= 4 · 四个函数逐个击破 ================= */
    {
      id: 'funcs', num: 4, title: '四个函数逐个击破',
      blocks: [
        { t: 'goal',
          before: ['走过四级台阶的前三级'],
          covers: ['四个函数各自的签名、要做什么、测试怎么判', '每个函数最容易错在哪一步'],
          after: ['能不看答案写出前两个函数', '知道每个函数对应的 sanity check 在查什么'] },

        { t: 'p', md: r`四个函数在 notebook 里是**顺序排列**的，每个后面紧跟一个 sanity check。下表是全景，后面逐个展开。` },

        { t: 'table',
          head: ['函数', '输入 → 输出', '一句话', '测试怎么判'],
          rows: [
            ['<code>distinct_words</code>', '语料 → 词表 + 个数', '拍平、去重、**排序**', '精确等于测试给的列表，**顺序也考**'],
            ['<code>compute_co_occurrence_matrix</code>', '语料、窗口 → 矩阵 M + word2ind', '纯计数，每共现一次 +1', '10×10 每个格子精确比对'],
            ['<code>reduce_to_k_dim</code>', 'M → (词数, k)', '一行 sklearn 的截断 SVD', '只查形状'],
            ['<code>plot_embeddings</code>', '降维结果、字典、词表 → 散点图', '逐词画点贴标签', '肉眼对参考图，无 assert'] ],
          note: '前两个是主体（2 + 3 分），后两个各 1 分、各一行。**先把前两个做扎实。**' },

        { t: 'h', md: '① distinct_words：把语料拍平、去重、排序' },
        { t: 'p', md: r`要交的签名是：` },
        { t: 'code', text: r`def distinct_words(corpus):
    """ Determine a list of distinct words for the corpus.
        Return:
            corpus_words (list of strings): sorted list of distinct words across the corpus
            n_corpus_words (integer): number of distinct words across the corpus
    """
    corpus_words = []
    n_corpus_words = -1
    # ... 你的实现 ...
    return corpus_words, n_corpus_words` },
        { t: 'p', md: r`三件事：**两层循环**把 list of lists 拍平、**集合**去重、**排序**。返回两个值（列表 + 它的长度）。

测试怎么判：<code>assert test_corpus_words == ans_test_corpus_words</code> —— 列表**逐项相等**，所以顺序也考。排序带来的词表顺序就是矩阵行列的顺序（第 5 段第三个坑）。` },
        { t: 'note', tone: 'info', title: '为什么 docstring 里写着 "sorted"',
          md: r`因为矩阵行列的顺序必须和 <code>distinct_words</code> 的输出**完全一致**。题目把这一段写死在签名上，就是为了让 <code>word2ind</code> 有唯一解 —— 否则同一个语料可以产出很多个"都对"的矩阵。` },

        { t: 'h', md: '② compute_co_occurrence_matrix：这道题的主体' },
        { t: 'p', md: r`签名：` },
        { t: 'code', text: r`def compute_co_occurrence_matrix(corpus, window_size=4):
    """ Compute co-occurrence matrix for the given corpus and window_size (default of 4).

        Note: Each word in a document should be at the center of a window. Words near edges will have a smaller
              number of co-occurring words.

              For example, if we take the document "<START> All that glitters is not gold <END>" with window size of 4,
              "All" will co-occur with "<START>", "that", "glitters", "is", and "not".
    """
    words, n_words = distinct_words(corpus)
    M = None
    word2ind = {}
    # ... 你的实现 ...
    return M, word2ind` },
        { t: 'p', md: r`把台阶②那五行伪代码翻译成代码。三条口径，一条都不能自己发挥：

1. **纯计数**：每共现一次 <code>+= 1</code>。**没有**按距离加权（不是 $1/d$）。
2. **每个词轮流当中心词**：所以句子里每一个位置都要当一次中心词。对称性是这条口径的**自然结果**，不需要手工补 <code>M[j][i]</code>。
3. **跳过自己**：<code>j == i</code> 时不计数。所以对角线**全是 0**。

下面的交互把这三条拆成"一格一格数"的动作 —— 你可以先在这里数一遍，再回 notebook 写。` },

        { t: 'viz', key: 'a1-cooc' },

        { t: 'p', md: r`**怎么用这个交互**：先按「下一步」走三五步，把"格子 = 中心词 × 上下文词"这件事看实；再用窗口滑块把 $w$ 调到 4，看同一份语料要多走多少步（窗口越大，每对的距离越远，但**计数口径不变**）；最后调回 $w=1$ 按「数完」，看它就是那份 <code>M_test_ans</code>。` },

        { t: 'h', md: '③ reduce_to_k_dim：一行 sklearn' },
        { t: 'p', md: r`签名里已经把要用的类写在 docstring 上了：sklearn 的 <code>TruncatedSVD</code>，且 <code>n_iters = 10</code>（变量已在函数体里给好，直接用）。` },
        { t: 'code', text: r`def reduce_to_k_dim(M, k=2):
    """ ... In terms of the SVD from math class, this actually returns U * S """
    n_iters = 10    # 把这个参数传进 TruncatedSVD 的构造里
    M_reduced = None
    # ... 你的实现 ...
    return M_reduced` },
        { t: 'p', md: r`**为什么是 TruncatedSVD 而不是 PCA**：共现矩阵是**稀疏**的（toy 语料 $10\times10$ 里只有 24 个非零格，IMDB 那版更稀）。<code>TruncatedSVD</code> 不中心化，可以直接吃稀疏矩阵；普通 <code>PCA</code> 要先减去均值，一减就把稀疏结构毁了。题目在 docstring 里点名了这个类，就是防你换成 PCA。

它返回的是 $U\Sigma$，不需要你自己乘。测试只查形状：$(10, 2)$。` },

        { t: 'h', md: '④ plot_embeddings：只画传进来的词' },
        { t: 'code', text: r`def plot_embeddings(M_reduced, word2ind, words):
    """ Plot in a scatterplot the embeddings of the words specified in the list "words".
        NOTE: do not plot all the words listed in M_reduced / word2ind.
        Include a label next to each point.
    """` },
        { t: 'p', md: r`逐词取坐标 <code>M_reduced[word2ind[w]]</code>，用 <code>plt.scatter</code> 画点、<code>plt.text</code> 贴标签。**只画 <code>words</code> 里列出的那些**，不是把整个矩阵都画上 —— docstring 专门用大写 NOTE 强调了这一句。

这个函数没有 assert，判据是**肉眼对参考图**：<code>imgs/question_1.4_test.png</code>（toy 语料）与 <code>imgs/question_1.5.png</code>（IMDB）。` },

        { t: 'note', tone: 'info', title: '写一个跑一个',
          md: r`四个函数里，**只有第一个的失败会连累后面三个**（<code>compute_co_occurrence_matrix</code> 内部会调它）。

所以顺序是硬的：① → ② → ③ → ④。过了再写下个，别攒着。` }
      ]
    },

    /* ================= 5 · 三个最容易犯的错 ================= */
    {
      id: 'traps', num: 5, title: '三个最容易犯的错',
      blocks: [
        { t: 'goal',
          before: ['写过或正在写 compute_co_occurrence_matrix'],
          covers: ['这道题上最常见的三种错法各长什么样', 'sanity check 报错时，怎么一眼认出是哪一种'],
          after: ['能看着一张矩阵说出它是哪种错', '知道"窗口 = 1 时查不出加权错"这件事'] },

        { t: 'p', md: r`下面三个坑按**出现频率**排。它们的共同点是：**代码都能跑通，报错信息也不指向原因** —— 第二个坑甚至能让你的 sanity check 全绿、只在 Q1.5 才暴露。` },

        { t: 'h', md: '坑 1：窗口边界（max / min 截断）' },
        { t: 'p', md: r`句子第一个词的左边没有词，最后一个词的右边没有词。窗口被句子边界**截断**，所以这些词看到的邻居比别人少。

正确写法是让下标范围自己适应边界：` },
        { t: 'code', text: r`j 从 max(0, c - window) 到 min(len(doc) - 1, c + window)     # 含两端` },
        { t: 'p', md: r`写错的两种典型：**忘记截断**（下标越界，Python 会从尾部绕回来取到错的词 —— **不报错**）、以及 <code>range</code> **忘加 1**（Python 的 <code>range</code> 是右开区间，最右边那个词永远数不到）。` },

        { t: 'h', md: '坑 2：计数口径（不加权）' },
        { t: 'p', md: r`A1 明说了是**纯计数**：每共现一次 +1。K01 里还讲过另一种口径 —— 按距离 $1/d$ 加权（越近的词权重越大）。**两套都合理，但 A1 只要前者。**

这个坑最阴的地方在于：` },
        { t: 'code', text: r`窗口 = 1 时，窗口内所有词的距离都等于 1
 -> 1/d ≡ 1
 -> 加了权等于没加权
 -> 所有 sanity check 用的都是窗口 1（它们查不出这个错）
 -> 只有 Q1.5（默认窗口 4）出图时才露馅` },
        { t: 'p', md: r`下面的交互把这个"同一份代码、窗口调到 2 以上才现形"演示出来了。` },

        { t: 'viz', key: 'a1-wrong' },

        { t: 'p', md: r`**怎么用这个交互**：先停在「正确实现」看那三个数（元素和、对角线、对称性）；再逐个点另外五个变体，看**第一个不同格**跳到哪、那三个数怎么变。最后把窗口从 1 拖到 4，看「按 1/d 加权」这一项从"和正确完全一样"变成"真的不一样了"。` },

        { t: 'h', md: '坑 3：词表顺序（矩阵行列必须同源）' },
        { t: 'p', md: r`矩阵的第 $i$ 行、第 $i$ 列对应哪个词，由一个 <code>word2ind</code> 字典决定：**字典和矩阵必须来自同一次 <code>distinct_words</code> 调用**。

如果一边用排序后的词表、另一边用"首次出现顺序"，会发生什么？

- 矩阵**仍然对称**（因为计数口径本身是对称的）；
- **元素总和也完全一样**；
- 但每一个数字都对应到了**错的词**。

也就是说：这个错法**不会让任何 assert 变红**（数值上"都对"），也不会让图报错 —— 它只会让你画出一张语义完全错位的图，而你会以为那是真实结果。` },
        { t: 'note', tone: 'warn', title: '认出它只需一行',
          md: r`打印 <code>word2ind</code> 看一眼：如果第一个键不是 <code>&lt;END&gt;</code>（排序后 <code>&lt;</code> 最小），而是 <code>&lt;START&gt;</code>（首次出现），那就是这个坑。

上面那个交互里，"词表没排序"变体把两个矩阵并排摆出来了 —— 你会发现它们长得**很像**，那正是它危险的地方。` },

        { t: 'h', md: '排查顺序（sanity check 红了的时候）' },
        { t: 'ol', items: [
          '**先数非零格的个数与总和**：总和少了近一半 → 大概率是"只数了右边"或"右边界少一格"；总和变多 → 大概率是忘了跳过自己。',
          '**再看对角线**：对角线非 0 → 确定是忘了跳过自己。',
          '**再看对称性**：<code>max|X − Xᵀ| &gt; 0</code> → 确定是"只数一个方向"。',
          '**三个都正常但 assert 还是红** → 大概率是词表顺序问题，去打印 <code>word2ind</code>。',
          '全查过还不对 → 才回去怀疑矩阵以外的代码（比如 <code>distinct_words</code> 本身就没排序）。'
        ] },
        { t: 'p', md: r`这个顺序不是随便排的：**它按"能排除掉的错误数量"排**。前两步能把三个坑里的两个直接钉死，剩下的再去看词表。反过来先怀疑代码逻辑，会在同一片区域来回改。` }
      ]
    },

    /* ================= 6 · Q1.5 真语料出图 ================= */
    {
      id: 'q15', num: 6, title: 'Q1.5 真语料出图',
      blocks: [
        { t: 'goal',
          before: ['四个函数都过了各自的 sanity check'],
          covers: ['Q1.5 这一段流水线跑的是什么数据', '那段代码里三处需要看懂的地方', '两个书面题在问什么'],
          after: ['能自己判断"我这张图对不对"', '知道图对不上时先查哪三处'] },

        { t: 'p', md: r`Q1.5 是 Part 1 的收尾：把四个函数**串起来跑真数据**。代码 notebook 已经写好了（不用你补），但你要能读懂它，因为两个书面题的答案全靠这张图。` },

        { t: 'code', text: r`imdb_corpus = read_corpus()
M_co_occurrence, word2ind_co_occurrence = compute_co_occurrence_matrix(imdb_corpus)
M_reduced_co_occurrence = reduce_to_k_dim(M_co_occurrence, k=2)

# Rescale (normalize) the rows to make them each of unit-length
M_lengths = np.linalg.norm(M_reduced_co_occurrence, axis=1)
M_normalized = M_reduced_co_occurrence / M_lengths[:, np.newaxis]   # broadcasting

words = ['movie', 'book', 'mysterious', 'story', 'fascinating',
         'good', 'interesting', 'large', 'massive', 'huge']

plot_embeddings(M_normalized, word2ind_co_occurrence, words)` },

        { t: 'p', md: r`这段代码有三处要专门看懂：` },
        { t: 'ol', items: [
          '**<code>read_corpus()</code> 用的是 train 集的前 150 条**（<code>NUM_SAMPLES = 150</code>），不是全部 25,000 条。它给每句话首尾补上 <code>&lt;START&gt;</code> / <code>&lt;END&gt;</code>，并把非字母数字字符剔掉、全部转小写。',
          '**<code>compute_co_occurrence_matrix</code> 这里用的是默认窗口 4**（没传第二个参数）。这就是坑 2 的"露馅点"。',
          '**归一化那两行**：把每个词的 2 维向量除以它自己的长度，于是所有点都落到单位圆上。'
        ] },
        { t: 'note', tone: 'info', title: '为什么要归一化',
          md: r`不归一化的话，向量的**长度**会掺进来。而长度跟"这个词在语料里出现得多不多"高度相关 —— 于是图会被**频次**主导，你看到的不是"谁跟谁像"，而是"谁出现得多"。

归一化之后，点的位置只表示**方向**，也就是"跟谁像"。这正是 K01 里余弦相似度那套逻辑的图形版：**用方向表示语义，把长度扔掉。**` },

        { t: 'h', md: '两个书面题在问什么' },
        { t: 'p', md: r`**a.** 找出至少**两组**聚在一起的词，每组给一个解释。

**b.** 有哪些你**本以为**会聚在一起、实际没聚的？举**两个**例子。` },
        { t: 'note', tone: 'warn', title: '这题没有标准答案，但有一个硬要求',
          md: r`两个问题都要**点名具体的词**，不能只说"语义相近的一组词"。评分的人要看到你写出 <code>movie</code> 和 <code>story</code> 这种具体的对，以及你对"为什么"的说法。

b 问比 a 问难：它逼你承认"向量没抓住我脑子里的那个关系"，而这正是这门课后面要处理的事（多义、偏见、评比评估）。` },

        { t: 'h', md: '怎么判断"我这张图对不对"' },
        { t: 'ol', items: [
          '**形状**：10 个点应该都落在同一个圆的圆周上（归一化的结果）。如果有的点在圆心附近、有的在很远，说明归一化没生效。',
          '**量级**：两个坐标轴的范围应该都在 $[-1, 1]$ 之间。',
          '**对图**：与 <code>imgs/question_1.5.png</code> 摆在一起看 —— 聚类关系要对得上（具体坐标不会完全一致，因为 SVD 的符号与基有自由度）。'
        ] },
        { t: 'note', tone: 'warn', title: '图对不上，先查这三处',
          md: r`**① 窗口**：<code>compute_co_occurrence_matrix(imdb_corpus)</code> 不能传第二个参数（默认就是 4，参考图用的也是 4）。

**② 归一化那两行有没有漏**：漏了的话图会散开成一大片。

**③ <code>words</code> 那份 10 个词的列表有没有改**：改了词就画的是别的点了。

这三处都不是"算法错了"，而是"跑的数据不对" —— 所以先查它们，再去怀疑第 4 段那四个函数。` }
      ]
    },

    /* ================= 7 · Part 2 与书面题 ================= */
    {
      id: 'part2', num: 7, title: 'Part 2 与书面题',
      blocks: [
        { t: 'goal',
          before: ['Part 1 跑通并出图（或至少四个函数全绿）', 'GloVe 向量已就位（250 MB 那一关过了）'],
          covers: ['Part 2 的九道题各自在问什么', 'most_similar 的排序依据', '类比为什么有时成立、有时不成立'],
          after: ['能自己跑出 Q2.1 的图', '能说清类比成立与不成立的条件'] },

        { t: 'p', md: r`Part 2 的定位是**换一条路线看同一件事**：Part 1 你从语料里"数"出向量，Part 2 你直接拿走别人"训"好的向量（GloVe，40 万词 × 200 维），然后用它做四类事情 —— 对比、量相似度、做类比、查偏见。` },

        { t: 'h', md: 'Q2.1：同一批词，两张图' },
        { t: 'p', md: r`把 Q1.5 那十个词用 **GloVe 向量**降到 2 维画一遍（代码 notebook 已给：<code>get_matrix_of_vectors</code> + <code>reduce_to_k_dim</code> + 同样的归一化），然后回答两问：**和 Part 1 那张图哪里像、哪里不像；为什么。**

要点在于：两张图用的是**同一批词、同一种降维方法（SVD）、同一种归一化**，唯一的差别是**向量的来源** —— 一个是 $10\times10$ 的共现矩阵算出来的，一个是 200 维的预训练向量。所以图上的差别，全部来自"向量怎么来的"这一件事。` },
        { t: 'note', tone: 'info', title: '一个容易忽略的陷阱',
          md: r`<code>get_matrix_of_vectors</code> 里有 <code>random.seed(225)</code> 和一次 <code>random.shuffle(words)</code>。**图对不上时先确认这个种子没被改过。**

那是 notebook 给好的代码，你不需要动它 —— 但如果之前有人改了 <code>seed</code>，<code>word2ind</code> 里词的编号就变了，图会跟着变。` },

        { t: 'h', md: 'Q2.2：一词多义' },
        { t: 'code', text: r`pprint.pprint(wv_from_bin.most_similar('bank'))` },
        { t: 'p', md: r`<code>bank</code> 至少有"银行"和"河岸"两个意思。看它的最近邻里是**两个义项的词混在一起**，还是**被其中一个义项主导**。

题目的问法是"这个词的最近邻能不能反映它的多个意思"。**一个词只对应一个向量** —— 这就是静态词向量的死穴，也是 K01 第 8 段"一词一义"那一节讲的事。` },

        { t: 'h', md: 'Q2.3：同义与反义' },
        { t: 'code', text: r`# 用 you pick 的几个词试：同义词的余弦应该高
wv_from_bin.similarity('happy', 'cheerful')
# 反义词呢？
wv_from_bin.similarity('happy', 'sad')` },
        { t: 'p', md: r`这里有个反直觉的观察：**反义词的余弦相似度往往也不低**。

原因是分布语义的基本假设 —— "一个词的意思由它出现的上下文决定"。而反义词（happy / sad）**出现在非常相似的上下文里**（"我很 ___"、"他看起来 ___"），所以它们学出来的向量也挨得近。这暴露了"用上下文表示语义"这条路线的一个真实边界。` },

        { t: 'h', md: 'Q2.4–Q2.6：类比' },
        { t: 'p', md: r`类比的做法是**向量加减**：要问"man 之于 woman，正如 grandfather 之于什么"，就构造 $w(\text{woman}) - w(\text{man}) + w(\text{grandfather})$，再找与它最接近的词。` },
        { t: 'code', text: r`pprint.pprint(wv_from_bin.most_similar(positive=['woman', 'grandfather'], negative=['man']))

# Q2.6 给了一个"预期会成立、实际不成立"的例子：
pprint.pprint(wv_from_bin.most_similar(positive=['foot', 'glove'], negative=['hand']))` },
        { t: 'p', md: r`Q2.4 是书面推导：用 $m$、$g$、$w$、$x$ 四个向量，**只用余弦相似度**说明为什么 $w - m + g$ 会靠近 $x$（提示：把余弦展开成点积，再看 $w$ 与 $m$ 的差这个方向代表什么）。

Q2.5 要你**自己找**一个成立的类比（写出四个词，且"正确词排第一"）。

Q2.6 反过来：<code>foot : glove :: hand : ?</code> 直觉答案是 <code>hand</code> 的"手套"，但向量给的答案不是。要你分析为什么，并**再找一个**不成立的例子。` },

        { t: 'h', md: 'Q2.7–Q2.9：偏见' },
        { t: 'code', text: r`pprint.pprint(wv_from_bin.most_similar(positive=['man', 'profession'], negative=['woman']))
print()
pprint.pprint(wv_from_bin.most_similar(positive=['woman', 'profession'], negative=['man']))` },
        { t: 'p', md: r`把 <code>profession</code> 分别和 <code>man</code> / <code>woman</code> 组合，看两边最近邻的词有什么不同。Q2.8 要你自己用 <code>most_similar</code> 找出**另一个**带偏见的词对。

Q2.9 是纯书面：**偏见怎么进到向量里的**（提示：语料本身反映了社会现实，模型把这它学了进去）、以及**怎么缓解**（提示：想一想"投影掉某个方向"这类做法，以及它会不会有副作用）。` },
        { t: 'note', tone: 'warn', title: 'most_similar 排的是余弦，不是欧氏距离',
          md: r`<code>most_similar</code> 默认按**余弦相似度**排序。这不是细节 —— 类比题之所以能成立，正是因为它比的是**方向**而不是距离。

K01 第 1 段那个"两个向量长度不同但夹角为零 → 余弦为 1"的交互，讲的就是这件事。` },

        { t: 'h', md: '九道题一览' },
        { t: 'table',
          head: ['题', '要什么', '类型'],
          rows: [
            ['Q2.1', 'GloVe 图与 Part 1 图对比（像 / 不像 / 为什么）', '书面'],
            ['Q2.2', '多义词的最近邻反映不反映多个意思', '代码 + 书面'],
            ['Q2.3', '同义词与反义词的余弦相似度', '代码 + 书面'],
            ['Q2.4', '用余弦推导类比为什么成立', '书面'],
            ['Q2.5', '找一个**成立**的类比', '代码 + 书面'],
            ['Q2.6', '分析一个**不成立**的类比，另找一个', '代码 + 书面'],
            ['Q2.7', '分析 man/woman × profession 的差异', '书面'],
            ['Q2.8', '自己找一个带偏见的例子', '代码 + 书面'],
            ['Q2.9', '偏见怎么来、怎么缓解', '书面'] ],
          note: 'Part 2 没有一行是"造向量"，全是"用向量 + 解释"。它的分比 Part 1 高（15 vs 10），因为解释比实现难。' }
      ]
    },

    /* ================= 8 · 交付与验收 ================= */
    {
      id: 'submit', num: 8, title: '交付与验收',
      blocks: [
        { t: 'goal',
          before: ['十个函数/题都做完了'],
          covers: ['导出一份合格 PDF 的完整流程', '七条验收标准分别在验什么'],
          after: ['能自己判断"这份作业交得出去吗"', '知道每条验收标准对应哪一段的能力'] },

        { t: 'h', md: '导出这一份 PDF' },
        { t: 'ol', items: [
          '点 notebook 顶部的 **Save**。',
          '**Edit → Clear Outputs of All Cells** —— 清掉所有输出，只留代码内容。',
          '**Run → Run All Cells** —— 按顺序全部重跑（要几分钟）。这一步是给评分的人看的：让他看到**你的代码真的跑得出这些结果**。',
          '**File → Save and Export Notebook as → PDF**。若报 <code>nbconvert failed: Pandoc wasn\'t found</code>，就先导 HTML：File → Save and Export Notebook as → HTML，在浏览器里打开，<code>Ctrl + P</code>，目标改成"另存为 PDF"。',
          '**翻一遍那份 PDF**，确认每一道代码题的**输出**都在（不是只有代码）。题目原文：<code>The PDF is the only thing your graders will see!</code>'
        ] },
        { t: 'note', tone: 'warn', title: '两个最常见的交作业事故',
          md: r`**① 代码在、输出不在**：某个 cell 忘了重跑，导出时那格是空的。评分的人看到空白，这道题就是 0 分。

**② 输出太长被截断**：Part 2 有几个 cell 会打印几百行最近邻。题目说"代码被截断没关系（因为不换行），但**解法必须都显示出来**" —— 所以书面题的文字回答要确认在 PDF 里。` },

        { t: 'h', md: '七条验收标准' },
        { t: 'p', md: r`这七条来自作业的验收表。前三条是**硬判据**（图对得上、题答完、跑得通），后四条是**能力判据**（要能讲出来）。` },
        { t: 'table',
          head: ['#', '标准', '判定方式'],
          rows: [
            ['A1', 'notebook 全程跑通：四个函数写完，且两张图与参考图对得上', '看运行输出 + 图'],
            ['A2', '书面题全部作答（Q1.5、Q2.1–Q2.9）', '读答案'],
            ['A3', '能说清**共现矩阵为什么不能直接当词向量用**，以及 SVD 在这步干了什么', '问答'],
            ['A4', '能默写 skip-gram 的目标函数，并解释为什么中心词与上下文词**各用一套向量**', '问答'],
            ['A5', '能推导 naive softmax 损失对中心词向量的梯度，说明它为什么是 $O(|V|)$、负采样怎么绕开', '推导 + 代码验证'],
            ['A6', '能解释 GloVe 与 word2vec 目标函数的差异，以及共现矩阵在两者里角色有何不同', '问答'],
            ['A7', '能解释词向量类比（$king - man + woman \approx queen$）**为什么成立、什么时候不成立**', '问答'] ],
          source: '作业的验收表（T1）' },
        { t: 'p', md: r`**注意 A3–A7 不是"作业里的题"**，是要你在验收时**当场讲出来**的能力项。它们的答案分散在 K01 的不同段里：` },
        { t: 'ul', items: [
          '**A3** 在 K01 第 3、4 段（稀疏、维度高、为什么需要降维）。',
          '**A4** 在 K01 第 4 段（目标函数）与第 5 段（公式逐项）。',
          '**A5** 在 K01 第 5 段（梯度推导）与第 6 段（复杂度账）。',
          '**A6** 在 K01 第 8 段（GloVe 与 word2vec 的对照）。',
          '**A7** 在 K01 第 8 段（线性类比为什么成立）。'
        ] },
        { t: 'note', tone: 'info', title: 'A4 / A5 不在 A1 的代码里',
          md: r`作业里**没有** naive softmax 的实现、没有负采样的实现、没有数值梯度检查。这些是 K01 讲、你在 playground 里自己写小规模复现来落地的事。

所以"作业做完了"和"A1 这一关过了"不是一回事 —— 后者包含 A3–A7 那几条口头能力。**这是故意的**：作业考不出"你到底懂没懂"，问答可以追问到你讲清为止。` }
      ]
    },

    /* ================= 9 · 常见坑与排查 ================= */
    {
      id: 'pitfalls', num: 9, title: '常见坑与排查',
      blocks: [
        { t: 'goal',
          before: ['动手做起来了，或者卡住了'],
          covers: ['跑不动 / 结果不对时，按什么顺序定位', '每类症状背后最可能的原因'],
          after: ['遇到报错时能自己定位到段落，而不是在整个 notebook 里乱找'] },

        { t: 'p', md: r`这一段按**症状**组织，不按知识点。查法很简单：在下面这张表里找到你的症状，看它指向哪一段。` },

        { t: 'table',
          head: ['症状', '最可能的原因', '去哪一段'],
          rows: [
            ['第一个 cell 就崩，后面全红', 'gensim 没装，或 IMDB 下不动（numpy 都还没导入）', '第 2 段'],
            ['<code>distinct_words</code> 的 assert 挂了', '忘了排序，或没把 list of lists 拍平', '第 4 段 ①'],
            ['共现矩阵 assert 挂了', '三种口径错法之一', '第 5 段'],
            ['矩阵不对称', '只数了一个方向（没让每个词轮流当中心词）', '第 5 段 坑 1'],
            ['对角线不是 0', '内层循环没跳过 <code>j == c</code>', '第 5 段 坑 2'],
            ['元素和比参考少近一半', '<code>range</code> 右边界少了一格，或只数了右边', '第 5 段 坑 1'],
            ['断言全绿，但 Q1.5 的图完全不对', '要么词表顺序不同源，要么按 1/d 加权了', '第 5 段 坑 2、坑 3'],
            ['<code>reduce_to_k_dim</code> 结果全是 0', '用了 <code>PCA</code> 而不是 <code>TruncatedSVD</code>', '第 4 段 ③'],
            ['Q1.5 的图散成一大片', '归一化那两行漏了', '第 6 段'],
            ['Q2.1 的图对不上参考图', '<code>random.seed(225)</code> 被改了，或用了 100 维向量', '第 7 段 Q2.1'],
            ['GloVe 下载报 <code>reset by peer</code>', '网络抖动 —— 重跑那个 cell；仍不稳就走手动下载', '第 2 段 第二关'],
            ['导出的 PDF 里代码题是空的', '有 cell 没跑就导出了', '第 8 段']
          ] },

        { t: 'h', md: '三条通用排查原则' },
        { t: 'ol', items: [
          '**从第一个失败处查，不要从报错最多处查**：notebook 的报错会连锁（一个 cell 崩了，后面全红）。第一个红的那格才是原因。',
          '**先查"数据对不对"，再查"算法对不对"**：窗口传错、词表顺序错、忘了归一化 —— 这三类占了"结果不对"的多数，而它们都不是算法问题。',
          '**拿 toy 语料复现**：真语料上出的问题，换回那两句 toy 语料再看一遍。规模小到能用眼睛数，问题就藏不住了。'
        ] },
        { t: 'note', tone: 'info', title: '跟"看起来对"较真',
          md: r`这门课后面会专门讲**评测**：一个数字"看起来合理"不等于它对。

A1 里最典型的就是坑 3 —— 词表顺序错了，矩阵每一个格子都是"合法的计数"，只是对应错了词。**没有任何 assert 会红**，图也照画。

所以这一段的排查表不是"报错处理清单"，而是"**怎么在没报错的时候发现自己错了**"。` }
      ]
    },

    /* ================= 10 · 自检与自测 ================= */
    {
      id: 'checklist', num: 10, title: '自检与自测',
      blocks: [
        { t: 'goal',
          before: ['做到最后阶段了'],
          covers: ['交作业之前逐条打勾的清单', '十道自测题，覆盖这一页的全部十段'],
          after: ['能自己判断"可以交了"', '能说出七条验收标准里每一条对应哪一段'] },

        { t: 'h', md: '交之前逐条打勾' },
        { t: 'ul', items: [
          '环境两关都过了：第一个 cell 整格跑通、GloVe 能加载（或已明确决定用哪个替代方案）。',
          '四级台阶走完了：跑过 demo（且没看源码）、手算过 toy 矩阵、numpy 那几块玩过。',
          '四个函数**各自**的 sanity check 都绿（不是最后一起跑的）。',
          'Q1.5 的图与 <code>imgs/question_1.5.png</code> 聚类关系一致，两个书面题都点名了具体的词。',
          'Q2.1 的图与 <code>imgs/question_2.1.png</code> 对得上（或已写明用了哪个替代向量）。',
          'Q2.2–Q2.9 全部作答，代码 cell 都跑过、输出都在。',
          '导出的 PDF 里，**每一道代码题的输出都可见**。',
          'A3–A7 那五条能力项，每一条都能不看资料讲一遍。'
        ] },
        { t: 'note', tone: 'info', title: '最后一条最重要',
          md: r`前七条是"作业交得出去"，第八条是"这一关过了"。

如果 A3–A7 里有哪条讲不出来，回 K01 对应那一段，别急着交 —— 那些是下一课（A2 要算张量导数）的直接前置。` },

        { t: 'h', md: '十道自测题' },
        { t: 'p', md: r`下面十道题覆盖这一页的十段。选择题会立刻判对错；数值题的正确答案由这一页**现算**（用的是这一课自己的算法层，不是 K01 的）；开放题给答案要点，你自己对照。` },
        { t: 'quizset' }
      ]
    }
  ];

  /* ============================================================
   * Quiz：10 道，覆盖上面 10 段
   * ------------------------------------------------------------
   * 数值题（calc）的 compute 收到的是 **KB.core.a1**（quiz.js 按 chapter.id 取）。
   * 只出"能自己算出来"的题 —— 不让读者猜数据事实。
   * ============================================================ */
  var quiz = [
    { id: 'q1', kind: 'choice',
      q: r`A1 的 Part 1 与 Part 2 最本质的差别是什么？`,
      options: [
        'Part 1 用 NumPy，Part 2 用 PyTorch',
        'Part 1 从语料里**数**出向量（共现矩阵 + SVD），Part 2 用别人**训**好的向量（GloVe）',
        'Part 1 有代码题，Part 2 只有书面题',
        'Part 1 用窗口 4，Part 2 用窗口 200'
      ], answer: 1,
      explain: r`计数法 vs 预测法，这才是分界。**代码量不是分界**：Part 2 确实一道代码题都没有，但那是因为它的重点在"用向量 + 解释"。工具上两边都是 NumPy + sklearn（A1 全程不碰 PyTorch）。` },

    { id: 'q2', kind: 'choice',
      q: r`notebook 第一个 cell 报 <code>NameError: name 'np' is not defined</code>，最该先去看哪里？`,
      options: [
        '报这一行的那格代码',
        '第一个 cell —— 因为 <code>import numpy</code> 排在 gensim 与 IMDB 下载**之后**，那两步失败就轮不到 numpy',
        '整个 notebook 的 import 列表',
        '换一个 Python 版本重装环境'
      ], answer: 1,
      explain: r`连锁报错要从**第一个失败处**查。第一个 cell 里 <code>from gensim.models import KeyedVectors</code> 与 IMDB 下载都排在 <code>import numpy</code> 之前 —— 任一失败，后面每一个 cell 都会报"未定义"，看起来像满屏都错。` },

    { id: 'q3', kind: 'choice',
      q: r`A1 的共现矩阵**必须**是对称的，这个对称性从哪来？`,
      options: [
        '代码里显式写了 <code>M[j][i] = M[i][j]</code> 补上另一半',
        '它是"每个词轮流当中心词"这条口径的自然结果，不需要手工补',
        '因为 <code>TruncatedSVD</code> 会把矩阵对称化',
        '因为语料里每一对词都恰好出现两次'
      ], answer: 1,
      explain: r`**不用手动补**。句子里每个位置都会当一次中心词：A 当中心时把 A→B 数了一次，轮到 B 当中心时又会把 B→A 数一次。两次数出来的是同一对词，落在对称的两个格子里。

如果"只数右边"，上三角有、下三角是 0 —— 矩阵就不对称了（第 5 段的交互可切换着看）。` },

    { id: 'q4', kind: 'calc',
      q: r`toy 语料（两句，窗口 $w=1$）的共现矩阵里，**元素总和**是多少？（提示：每个词轮流当中心词，数它窗口内的邻居。）`,
      unit: '次', tol: 0, digits: 0,
      compute: function (C) { return C.cooccurrence(C.TOY_CORPUS, { window: 1 }).sum; },
      explain: r`第 1 句 7 个词、第 2 句 7 个词，共 14 个位置。句首句尾那两个位置（两句的 <code>&lt;START&gt;</code>、两句的 <code>&lt;END&gt;</code>）窗口只有 1 个邻居，中间 10 个位置各有 2 个邻居：

$4\times1 + 10\times2 = 24$。

**总和 24 与"非零格数 24"在这道题里碰巧相等**（因为窗口 = 1 时没有重复计数），但换成窗口 4 就不是了 —— 那时总和 72、非零格 59。` },

    { id: 'q5', kind: 'choice',
      q: r`把计数口径从"每共现一次 +1"改成"按 $1/d$ 加权"，会发生什么？`,
      options: [
        '所有 sanity check 立刻变红，当场就能发现',
        '**窗口 = 1 时两者完全一样**（距离恒为 1），所以 sanity check 全绿，只在 Q1.5（默认窗口 4）才暴露',
        '矩阵不再对称',
        '矩阵对角线不再是 0'
      ], answer: 1,
      explain: r`这是 A1 最阴的坑。所有 sanity check 都用窗口 1，而窗口 1 时 $1/d \equiv 1$ —— 加权和不加权算出来是**同一个矩阵**。

只有 Q1.5 用默认窗口 4 时，距离出现 2、3、4，加权才真正改变数值。第 5 段那个交互把窗口从 1 拖到 4 就能看到这件事。` },

    { id: 'q6', kind: 'choice',
      q: r`"词表没排序"（<code>word2ind</code> 用首次出现顺序、矩阵用排序顺序）会有什么后果？`,
      options: [
        '矩阵不对称，assert 立刻报错',
        '矩阵仍然对称、元素和也一样，**每个数字都对应到了错的词** —— 没有 assert 会红',
        '画图时会报维度不匹配',
        'SVD 会算出全零'
      ], answer: 1,
      explain: r`重排行列**不破坏对称性**（对称是计数口径的性质），元素总和也不变。所以这个错法在数值上"看起来全对"，只有把 <code>word2ind</code> 打印出来、或者把图和参考图并排比，才看得出来。

这正是第 9 段说的：**要在没报错的时候发现自己错了。**` },

    { id: 'q7', kind: 'choice',
      q: r`<code>reduce_to_k_dim</code> 为什么必须用 <code>TruncatedSVD</code> 而不是 <code>PCA</code>？`,
      options: [
        '因为 PCA 只支持方阵',
        '因为共现矩阵是**稀疏**的，<code>PCA</code> 要先减去均值、会把稀疏结构毁掉；<code>TruncatedSVD</code> 不中心化，能直接吃稀疏矩阵',
        '因为 PCA 太慢',
        '两者其实等价，题目只是随便选了一个'
      ], answer: 1,
      explain: r`共现矩阵大部分格子是 0（toy 语料 100 格里只有 24 个非零；IMDB 那版更稀）。<code>PCA</code> 的减均值会把 0 变成非 0，稀疏性立刻没了。<code>TruncatedSVD</code> 不做中心化。

题目在 docstring 里直接点名了这个类，就是防你换。另外它返回的是 $U\Sigma$，不用自己乘。` },

    { id: 'q8', kind: 'choice',
      q: r`Q1.5 里，为什么画图前要把降维后的向量**归一化**成单位长度？`,
      options: [
        '为了让坐标都落在 $[0,1]$ 之间好看',
        '因为向量长度跟**词频**高度相关，不归一化的话图会被频次主导；归一化后点的位置只表示**方向**，也就是"跟谁像"',
        '因为 SVD 要求输入是单位向量',
        '为了让所有点都落在同一条直线上'
      ], answer: 1,
      explain: r`这是 K01 里余弦相似度那一套的图形版：**用方向表示语义，把长度扔掉**。不归一化的话，你看到的更多是"哪个词出现得多"，而不是"哪个词跟哪个词像"。` },

    { id: 'q9', kind: 'choice',
      q: r`<code>most_similar(positive=[...], negative=[...])</code> 是按什么排序的？`,
      options: [
        '欧氏距离',
        '余弦相似度',
        '词频',
        '共同出现的次数'
      ], answer: 1,
      explain: r`默认按**余弦相似度**。这不是可忽略的细节 —— 类比题之所以成立，正是因为它比方向而不是比距离。

K01 第 1 段那个交互演示的就是这件事：两个向量长度差很多，只要夹角为 0，余弦就是 1。` },

    { id: 'q10', kind: 'open',
      q: r`不看资料，讲清 A3 与 A7 两条验收标准的答案。`,
      points: [
        '**A3（共现矩阵为什么不能直接当词向量）**：$N$ 随词表增长（IMDB 那版约 3,000 维），维度太高；且大部分格子是 0（稀疏），行与行之间看不出"像不像"。SVD 把 $N$ 维压到 $k$ 维，同时保留了共现结构里的主要方向 —— 它做的事是"用少数几个正交方向重新描述同一份计数"。',
        '**A3 的补充**：降维后的向量是**稠密**的，每一维都参与比较，余弦才有意义。原始共现行几乎两两正交，内积接近 0。',
        '**A7（类比为什么成立）**：$king - man + woman$ 这种运算成立，是因为某些语义关系在向量空间里近似表现为**一个固定的平移方向**（"性别"这个方向）。把 man → woman 的方向加到 king 上，就走到 queen 附近。',
        '**A7 什么时候不成立**：这个平移方向只在**高频、语义单义、关系规整**的词上近似成立。反例就在 Q2.6（<code>foot : glove :: hand : ?</code>）："脚之于袜子/手套"这类关系不是干净的线性方向，且低频词学不准，所以预期答案排不到第一。',
        '**答这两条的要诀**：不要只说结论，要说出"为什么"和"什么时候例外"。验收会上会被追问到讲清为止。'
      ],
      explain: r`这两条分别对应 K01 的第 3–4 段（共现矩阵 → SVD）与第 8 段（线性类比）。` },
  ];

  /* ============================================================
   * 术语表：作业里出现的专有名词，按它第一次出现的顺序排
   * ============================================================ */
  var glossary = [
    [r`探照灯式问题（本页导航）`, r`不是术语，是本页的用法：每一段开头那张导读卡写着「进这一段之前你应该已经能 / 这一段回答 / 读完你应该能」。

**它是给你自检用的**：如果"读完你应该能"那几条你读不出声，说明这一段没过，回上去重读。`],

    [r`计数法与预测法`, r`**一句话：造词向量的两条主要路线 —— 一条数共现，一条猜邻居。**

**计数法**（count-based）：统计词与词在窗口里一起出现了多少次，形成一个矩阵，再降维。A1 的 Part 1 走这条。

**预测法**（prediction-based）：训练一个小神经网络，让它用中心词预测上下文（或反过来），训练完把网络里的参数当向量。word2vec、GloVe 走这条。

<div class="eg">两条路线的产物**在数学上关系很近** —— 后面会看到，GloVe 的目标函数就是在分解共现矩阵的对数。但在 A1 里，老师要你亲手看的是它们在散点图上的差别。</div>`],

    [r`toy 语料`, r`**一句话：题目给的两句极短的话，用来在规模小到能用眼睛数的情况下验证函数写对了没。**

<div class="eg"><code>&lt;START&gt; All that glitters isn't gold &lt;END&gt;</code><br><code>&lt;START&gt; All's well that ends well &lt;END&gt;</code></div>

两句共 14 个词位、10 个不同的词。Q1.1–Q1.4 都用它 —— 因为规模小，你能手算一遍再和代码对。

<div class="eg">注意开头的 <code>&lt;START&gt;</code> / <code>&lt;END&gt;</code> 也是"词"，它们进词表、进矩阵。补这两个标记的作用是让句首词也有左边的邻居。</div>`],

    [r`word2ind`, r`**一句话：一个字典，把词映射到它在矩阵里的行号/列号。**

矩阵本身只是数字，词和行列的对应关系全靠这个字典记着。所以**字典和矩阵必须来自同一次词表构造** —— 这是第 5 段坑 3 的全部内容。

<div class="eg">toy 语料排序后的 <code>word2ind</code> 从 <code>&lt;END&gt;: 0</code>、<code>&lt;START&gt;: 1</code> 开始 —— 因为字符 <code>&lt;</code> 的编码(60)比任何字母都小，这两个标记排在所有普通词前面。</div>`],

    [r`窗口大小 window_size`, r`**一句话：数共现时，中心词左右各看几个词。**

<code>window_size = 4</code>（notebook 默认）表示左右各看 4 个。窗口越大，"共现"的定义越松，能抓住的关联越远，但矩阵也越稠密。

<div class="eg">句首句尾的词窗口**不完整**（左边没词了）。这不是特殊情况，是常态 —— 代码必须用 <code>max(0, …)</code> / <code>min(len, …)</code> 把边界截断，而不是让它越界。</div>`],

    [r`截断 SVD（TruncatedSVD）`, r`**一句话：把一个大矩阵压成"只保留前 k 个主要方向"的降维方法，且不要求矩阵先中心化。**

普通 SVD 把 $X$ 分解成 $U\Sigma V^{\mathsf T}$；截断它 = 只留 $\Sigma$ 里最大的 $k$ 个奇异值及其向量。sklearn 的 <code>TruncatedSVD</code> 返回 $U\Sigma$（不用你自己乘）。

<div class="eg">**为什么不能换成 PCA**：共现矩阵是稀疏的，<code>PCA</code> 要先减去每列均值，一减 0 就变非 0，稀疏结构毁了。<code>TruncatedSVD</code> 不做这一步。</div>`],

    [r`归一化（unit-length normalize）`, r`**一句话：把每个向量除以它自己的长度，让所有向量都变成单位长度。**

用途是让比较**只反映方向**。不归一化的话，向量长度会掺进来 —— 而长度跟词频高度相关，图会被"谁出现得多"主导。

<div class="eg">Q1.5 和 Q2.1 画图前都做这一步，两行 numpy：算长度、按列除。漏了的话散点图会散开成一大片，点不在同一个圆周上。</div>`],

    [r`GloVe`, r`**一句话：一种预测法词向量，但它同时用到了全局共现统计。**

word2vec 只看局部窗口（一次看几个词），GloVe 先算全局共现矩阵、再分解它的**对数**。于是它既保留了"预测"的目标形式，又利用了整个语料统计。

<div class="eg">A1 的 Part 2 用的 <code>glove-wiki-gigaword-200</code> 是 40 万词 × 200 维，约 250 MB。你在 Part 2 不训练它，只加载、分析。</div>`],

    [r`余弦相似度`, r`**一句话：两个向量夹角的余弦，等于点积除以两个长度。**

$\cos(u,v)=\dfrac{u^{\mathsf T}v}{\lVert u\rVert\lVert v\rVert}$，取值 $[-1,1]$。它把长度除掉了，只留下方向 —— 所以"长度差很多但方向一样"的两个向量，余弦是 1。

<div class="eg">它的三个特征值：同向 = 1、正交 = 0、反向 = −1。<code>most_similar</code> 默认就按它排序。</div>`],

    [r`most_similar`, r`**一句话：gensim 里"找最近的词"的方法，按余弦相似度排序。**

三种调用方式：只给 <code>positive</code>（找相似词）、给 <code>positive</code> + <code>negative</code>（做类比）、给多个词（语义加减）。

<div class="eg">类比就写在这套参数上：<code>most_similar(positive=['woman', 'grandfather'], negative=['man'])</code> 算的是 $w(\text{woman}) - w(\text{man}) + w(\text{grandfather})$ 的最近邻。</div>`],

    [r`静态词向量（一词一义）`, r`**一句话：一个词只有一个向量，于是它的多个意思被挤在同一个点上。**

<code>bank</code>（银行 / 河岸）在 GloVe 里只对应一个向量。Q2.2 让你去看它的最近邻 —— 会发现两个义项的词混在一起，或者其中一个义项被另一个压住。

<div class="eg">这是**所有**静态词向量的共同限制，不是 GloVe 的缺陷。要分开义项就得让同一个词随上下文产生不同向量（后面课里的 contextual embeddings）。</div>`],

    [r`词向量的偏见（bias）`, r`**一句话：向量里带着训练语料里的社会刻板印象。**

语料里"医生"更多和"他"一起出现、"护士"更多和"她"一起出现，模型就学到了这个关联。Q2.7 用 <code>man/woman × profession</code> 的最近邻差异把它显形。

<div class="eg">要理解的关键一点：**这不是模型"想"成这样，是语料就这样。** 所以"删掉某些词"治不了根 —— 缓解方法（比如把向量投影到与性别无关的子空间）本身也有副作用，Q2.9 要你讨论这件事。</div>`],

    [r`验收标准（A3–A7）`, r`**一句话：作业交完之后，你要能当场讲出来的五条能力。**

它们不出现在 notebook 里，是口头问答：共现矩阵的局限与 SVD 的作用（A3）、skip-gram 目标函数与两套向量的理由（A4）、梯度推导与 $O(|V|)$ / 负采样（A5）、GloVe 与 word2vec 的差异（A6）、类比成立与不成立的条件（A7）。

<div class="eg">**它们才是"这一关过没过"的判据。** 作业跑通只说明你能照着做；A3–A7 说明你懂了。答案分散在 K01 的第 3–8 段。</div>`]
  ];

  /* ============================================================
   * 公式速查
   * ============================================================ */
  var formulas = [
    { name: '余弦相似度', tex: r`\cos(u,v)=\frac{u^{\mathsf T}v}{\lVert u\rVert\,\lVert v\rVert}`, note: '消掉长度、只比方向；取值 [−1, 1]。A1 里所有"像不像"都由它判' },
    { name: '行归一化（Q1.5 画图前）', tex: r`\hat{M}_i=\frac{M_i}{\lVert M_i\rVert}`, note: '每一行除以自己的长度，于是每个词落在单位圆上' },
    { name: '截断 SVD', tex: r`X\approx U_k\Sigma_k V_k^{\mathsf T}`, note: '只留前 k 个奇异值 —— 最优的秩 k 近似；sklearn 返回 UΣ' },
    { name: '共现计数（A1 口径）', tex: r`X_{ij}=\sum_{c}\ \#\{j:\ |j-c|\le w,\ j\ne c,\ \mathrm{word}(c)=i,\ \mathrm{word}(j)=j\}`, note: '纯计数，每共现一次 +1；**不加权**（不是 1/d）' },
    { name: '类比（向量加减）', tex: r`x \approx w(\text{woman})-w(\text{man})+w(\text{grandfather})`, note: '在向量空间里，"性别"近似是一个固定方向' },
    { name: 'skip-gram 目标函数', tex: r`J(\theta)=-\frac{1}{T}\sum_{t=1}^{T}\sum_{-m\le j\le m,\ j\ne 0}\log P(w_{t+j}\mid w_t;\theta)`, note: 'A4 要默写的就是它；变体在 K01 第 4 段' },
    { name: 'naive softmax 梯度', tex: r`\frac{\partial J}{\partial v_c}=\sum_{w\in V}P(w\mid c)u_w-u_o`, note: '期望 − 观测；求和的规模 O(|V|) 正是 A5 要解释的"贵"' }
  ];

  /* ============================================================
   * 参数与复杂度卡
   * ============================================================ */
  var params = {
    head: ['量', '值', '在哪出现'],
    rows: [
      ['Q1.1–Q1.4 语料', 'toy 两句，10 个不同词', 'notebook 的 sanity check'],
      ['Q1.5 语料', '<code>NUM_SAMPLES = 150</code> 条 IMDB 影评', 'cell-6 <code>read_corpus</code>'],
      ['Q1.2 测试窗口', '<code>window_size = 1</code>', 'cell-14'],
      ['Q1.5 窗口', '<b>4</b>（默认，不传参）', 'cell-22'],
      ['降维目标', '<code>k = 2</code>，<code>n_iters = 10</code>', 'cell-16 <code>reduce_to_k_dim</code>'],
      ['画图词表', '10 个手挑的词', 'cell-22 / cell-36'],
      ['GloVe 规模', '40 万词 × 200 维（约 250 MB）', 'Part 2'],
      ['Part 2 的随机种子', '<code>random.seed(225)</code>', 'cell-32 <code>get_matrix_of_vectors</code>'],
      ['总分', 'Part 1 = 10 分 / Part 2 = 15 分', 'notebook 标题']
    ],
    note: r`**这张表里最要紧的两行是"Q1.2 测试窗口 = 1"和"Q1.5 窗口 = 4"。**

它们不一样，而正是这个不一样让"按 $1/d$ 加权"这个错法能骗过全部 sanity check（第 5 段坑 2）。调试图对不上时，先回来看这两行。`
  };

  /* ============================================================
   * 诚实清单：本页没能验证的部分
   * ============================================================ */
  var honesty = [
    r`**这一页没有在真实环境里跑过 A1。** 本页的 toy 语料、<code>word2ind</code> 顺序、以及那份 $10\times10$ 的 <code>M_test_ans</code>，都是从 notebook 的 cell-11 / cell-14 里逐字取出来、再用 <code>js/core/a1_core.js</code> 现算复核的（<code>checkAgainstNotebook()</code> 逐位比对）。但**notebook 本身没有在这里执行过** —— 所以"照着这一页做就能全绿"这句话，我给的是推理，不是实测。`,
    r`**"环境两关已过"那几条是从既有记录里读来的**（gensim 已装、IMDB 已缓存、网络可达），不是这一页重新跑出来的。环境可能变了 —— 开工前请自己跑一次第一个 cell 确认。`,
    r`**GloVe 那 250 MB 没有下载过。** 所以 Part 2 的 Q2.1–Q2.9 里，凡是需要真实向量才能得出的具体数字（某个词的最近邻是谁、某个类比的排序），本页一个都没有写。第 7 段只讲了每题**在问什么**，没有给"标准答案"—— 因为那是要你自己跑出来的。`,
    r`**"按 1/d 加权在窗口 1 下与不加权完全一致"这句话是实测的**（<code>a1_core.js</code> 的 <code>variants()</code> 在窗口 1 下算出的加权矩阵与正确矩阵逐位相同，在窗口 4 下不同）。但"它能骗过全部 sanity check"是我对 notebook 那些测试的读解 —— 那些测试确实都用窗口 1，这一点可以从 cell-14 / cell-17 直接看到。`,
    r`**两个交互里的矩阵都是 toy 语料规模的**（$10\times10$）。真语料上矩阵约 $3000\times3000$，稀疏度、SVD 的数值行为都会不同 —— 交互里的结论只保证在 toy 规模上成立，不外推到 IMDB。`,
    r`**"六个常用写法"那份错法清单是归纳出来的**，来源是这类作业的实际出错分布，不是 notebook 里列出的。它覆盖的是最常见的几种，不保证穷尽。`
  ];

  /* ============================================================
   * 导出
   * ============================================================ */
  window.KB.chapters.a1 = {
    id: 'a1',
    kind: 'task',
    title: '词向量作业：从共现矩阵到 GloVe',
    subtitle: 'CS224N Assignment 1 · 对应 K01（词向量与分布语义）· 四个作业里的第 1 个',
    vizKeys: VIZ,
    sections: sections,
    quiz: quiz,
    glossary: glossary,
    formulas: formulas,
    params: params,
    honesty: honesty
  };
})();
