# -*- coding: utf-8 -*-
"""README 同步：拆掉「md 正本 → 站点派生」的表述，改成「站点是唯一载体」。"""
import io

P = r'D:\code\cs224n\site\README.md'
s = io.open(P, encoding='utf-8', newline='').read()

REPS = []

# ---------- R1：分工表整段重写 ----------
REPS.append(("""| 谁 | 管什么 |
|---|---|
| `../06_讲义精讲/K01_*/**.md` | **内容的唯一正本** |
| `../code/*.py` + `../logs/*.txt` | 数字的实测来源 |
| `site/data/courses.js` | **课程注册表**：有哪几门课、编号与标题 |
| `site/`（本目录） | 复习层的**派生**交付物：10 段式 + 交互 + Quiz |

**md 是正本，站点是派生副本。** 改内容请改 md 并重跑 `tools/build_lectures.py`，
不要在 `data/k01.js` 里改正文 —— 否则两套内容会漂移。

唯一的例外：`data/k01.js` 里的**讲解骨架**（10 段式怎么分块、哪个块配哪个交互、
公式的逐项高亮标记）是站点独有的编排，没有 md 正本，就在那里改。
""", """| 谁 | 管什么 |
|---|---|
| `site/data/kNN.js` | **内容的唯一载体**：10 段式正文、公式、交互编排、Quiz、术语表、诚实清单全在这里 |
| `../code/*.py` + `../logs/*.txt` | 数字的实测来源（每个数字都要能复现） |
| `site/data/courses.js` | **课程注册表**：有哪几门课、编号与标题 |
| `site/js/core/` | 纯算法层，浏览器与 Node 共用同一份 |

**交互页就是唯一要读的东西 —— 这是硬要求，不是偏好。**

- 页面里**不许出现「去别处读原文」的指针**。`site.check.js` 的 §2b 用正则扫全文钉住它
  （`arXiv:1310.4546 §2.1` 这类**论文**章节号例外，那是合法出处，不是 md 指针）。
- `../06_讲义精讲/K01_*/**.md` 是**历史讲义的留档**：站点不引用它、也不从它派生任何东西。
  旧的 `tools/build_lectures.py` + `data/lectures.js` 那条派生链已于 2026-10 拆除。
- **改内容 = 改 `site/data/kNN.js`。没有第二处。**

> 2026-10 的方向调整：之前是「md 正本 → 站点派生」双轨，读者得自己判断该看哪边，
> 而两条轨体量相当（`k01.js` 102 KB / `lectures.js` 101 KB），谁也不是答案。
> 现在只剩一条轨，导航层（每段的导读卡 + 第 1 段的 10 段地图）由站点自己提供。
"""))

# ---------- R2 ----------
REPS.append(("`KB.chapters` / `KB.lectures` / `KB.viz` 都是 map 挂载式",
             "`KB.chapters` / `KB.viz` / `KB.core` 都是 map 挂载式"))

# ---------- R3：地址约定删 lecture 行 ----------
REPS.append(("""#/c/<课id>/ref/honesty            诚实清单
#/c/<课id>/ref/lecture[/<key>]    讲义正本
""", """#/c/<课id>/ref/honesty            诚实清单
"""))

# ---------- R4 ----------
REPS.append(("""**地址只由三个函数产生**（`app.js` 里的 `courseSec` / `courseRef` / `lectureRef`）。
以前 `'#/k01/'` 这种前缀是直接写在 5 处渲染代码里的，改地址格式要逐个找出来 —— 现在只动这一段。""",
"""**地址只由两个函数产生**（`app.js` 里的 `courseSec` / `courseRef`；段地址 `courseSec`，
专业页 `courseRef`）。以前 `'#/k01/'` 这种前缀是直接写在 5 处渲染代码里的，
改地址格式要逐个找出来 —— 现在只动这一段。"""))

# ---------- R5：目录树 ----------
REPS.append(("├── index.html            双击就开（按顺序加载 12 个 script，无 module、无 fetch）",
             "├── index.html            双击就开（按顺序加载 11 个 script，无 module、无 fetch）"))

REPS.append(("""├── data/                 courses.js(课程注册表) · k01.js(内容)
│                         lectures.js + freq.js(构建产物，别手改)
├── reference/            imdb2000_freq.json —— 真实词频表（IMDB top-2000）
├── tools/                dump_freq.py · build_lectures.py · build_single.py""",
"""├── data/                 courses.js(课程注册表) · k01.js(内容)
│                         freq.js(词频表，构建产物，别手改)
├── reference/            imdb2000_freq.json —— 真实词频表（IMDB top-2000）
├── tools/                dump_freq.py · build_freq.py · build_single.py"""))

# ---------- R6：单文件段落里的脚本数 ----------
REPS.append(("内联了什么：5 个 CSS 段 + KaTeX CSS + 12 个 JS + **20 条 `@font-face` 的 woff2 字体**",
             "内联了什么：5 个 CSS 段 + KaTeX CSS + 11 个 JS + **20 条 `@font-face` 的 woff2 字体**"))
REPS.append(("""if len(srcs) != 12:            raise SystemExit(...)   # 脚本数对不上""",
             """if len(srcs) != 11:            raise SystemExit(...)   # 脚本数对不上"""))

# ---------- R7：dist 说明加一句快照警告 ----------
REPS.append(("""**一个 1.13 MB 的 `.html`，拷到手机上（微信/QQ/AirDrop）用浏览器打开就能用**，
不需要 `css/`、`js/`、`vendor/` 任何一个兄弟文件，也不需要联网。""",
"""**一个 1.13 MB 的 `.html`，拷到手机上（微信/QQ/AirDrop）用浏览器打开就能用**，
不需要 `css/`、`js/`、`vendor/` 任何一个兄弟文件，也不需要联网。

> ⚠️ 仓库里现有的 `dist/CS224N-mobile.html` 是**2026-10 重构前的快照**，
> 里面还带着「讲义正本」那条轨。用户明确要求**不主动重建**它（费时间），
> 所以它和新站点的内容会不一致。要重新同步就手动跑一次 `build_single.py`。"""))

# ---------- R8：校验数字与描述 ----------
REPS.append(("node site/tests/site.check.js    # 181 条：内容与结构（Node，无 DOM）",
             "node site/tests/site.check.js    # 169 条：内容与结构（Node，无 DOM）"))

REPS.append(("块类型合法、原文指针存在、Quiz 索引合法",
             "块类型合法、**站点自洽（正文里没有「去别处读原文」的指针）**、**每段都有导读卡**、Quiz 索引合法"))

REPS.append(("6 组公式高亮、7 个先猜后对、14 道 Quiz 作答",
             "6 组公式高亮、3 个先猜后对（只留答案能自己算出来的）、**导读卡与 10 段地图能点跳**、14 道 Quiz 作答"))

# ---------- R9：内容管线整段重写 ----------
REPS.append(("""```
md 正本 ──tools/build_lectures.py──▶ data/lectures.js ──▶ 站内「讲义正本」页
IMDB 缓存 ──tools/dump_freq.py────▶ reference/imdb2000_freq.json ──▶ data/freq.js
```

两个脚本都用 base 环境跑：`D:/code/anaconda/python.exe site/tools/xxx.py`。

`build_lectures.py` 的关键点：md 正文用 `json.dumps` 包成**字符串字面量**（不是模板字符串），
反引号和 `${` 会被自动转义 —— 否则正文里的 `` ` `` 会直接破坏 `data/lectures.js`。

之所以要在构建期把 md 变成 `.js`，是因为 `file://` 下浏览器会拦掉 `fetch` 和 ES module。
内容预先变成 `<script>` 能加载的形式，双击就能开。""",
"""```
IMDB 缓存 ──tools/dump_freq.py──▶ reference/imdb2000_freq.json
                                          │  tools/build_freq.py
                                          ▼
                                     data/freq.js
```

**只剩这一条管线了，而且它只产数据、不产内容。**
内容本身（`data/kNN.js`）是手写的，不经任何构建 ——
「讲义 md → `lectures.js`」那条链已于 2026-10 拆除（连同 `build_lectures.py` 一起删了）。

两个脚本都用 base 环境跑：`D:/code/anaconda/python.exe site/tools/xxx.py`。

之所以要在构建期把词频表变成 `.js`，是因为 `file://` 下浏览器会拦掉 `fetch` 和 ES module。
数据预先变成 `<script>` 能加载的形式，双击就能开。"""))

# ---------- R10：怎么改 ----------
REPS.append(("""- **改一句讲解** → 改 `../06_讲义精讲/K01_*/` 里对应的 md，重跑 `build_lectures.py`。
  （只影响「讲义正本」页；10 段式正文的措辞在 `data/k01.js`。）""",
"""- **改一句讲解** → 直接改 `site/data/k01.js`。站点是唯一载体，**没有第二处要同步**。
  （`../06_讲义精讲/` 里那几篇 md 是留档，改了不会反映到站点上。）"""))

REPS.append(("""- **改地址格式** → 只动 `app.js` 里 `courseSec` / `courseRef` / `lectureRef` 三个函数
  （外加两套 smoke 里的字面量）。别再把 `'#/c/k01/'` 直接写进渲染代码。""",
"""- **改地址格式** → 只动 `app.js` 里 `courseSec` / `courseRef` 两个函数
  （外加两套 smoke 里的字面量）。别再把 `'#/c/k01/'` 直接写进渲染代码。"""))

# ---------- R11：新增一条硬约束 ----------
REPS.append(("""13. **「关于」这类全站页不许挂任何课程编号**""",
"""13a. **每段开头的导读卡（`goal`）和第 1 段的本课地图（`roadmap`）不许删** ——
    用户原话是「学习时不知道看哪个，效率很低」，这两样就是针对那句话做的导航层。
    `site.check.js` §2b2 钉住「10 段每段开头都有导读卡」「地图覆盖 10 段且顺序一致」，
    `smoke.mjs` 的 `G-nav-1..4` 钉住渲染与点击跳转。
14. **「关于」这类全站页不许挂任何课程编号**"""))

n = 0
for old, new in REPS:
    c = s.count(old)
    assert c == 1, ('替换命中 %d 次：' % c) + old[:70].replace('\n', '\\n')
    s = s.replace(old, new)
    n += 1

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('OK 完成 %d 处替换' % n)
