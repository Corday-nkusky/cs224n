# CS224N 学习仓库

个人自学 **CS224N: Natural Language Processing with Deep Learning**（Winter 2026 版）的完整工作区：
课程原始材料 + 中文讲义精讲 + 任务卡 + 手写笔记 + 一套可离线打开的交互复习站。

> **不是课程官方仓库。** 课程材料版权归课程方，本仓库仅为个人学习留档，不对外分发、不作商业用途。

---

## 三个入口

| 想干什么 | 打开 |
|---|---|
| **知道现在该学什么** | [`07_伴学/01_当前位置.md`](07_伴学/01_当前位置.md) |
| **看这门课的整体规划** | [`00_学习指南.md`](00_学习指南.md)（怎么排时间）+ [`00_课程大纲.md`](00_课程大纲.md)（这门课有什么） |
| **打开交互复习站** | 双击 `site/index.html`（离线可用，无服务器） |

**进度只看 [`05_Records/验收记录.md`](05_Records/验收记录.md)** —— 其他文档都不写进度，避免多份文档互相打架。

---

## 目录结构

```
cs224n/
├── 00_学习指南.md          # 总计划：20 天路线、砍单优先级
├── 00_课程大纲.md          # 19 讲知识结构、A1–A4 各考什么、出口闸门
│
├── 01_Lectures/            # 课程原始材料（只读）
│   ├── *.pdf               #   17 份官方 slides
│   └── notes/              #   词向量课程笔记
├── 02_Assignments/         # 作业工作区 a1–a4 + 原始包存档（_packages/，别动）
│
├── 03_Tasks/               # 任务卡 T0–T6：验收标准前置，任务 + 材料 + 坑一体
├── 04_Notes/               # 手写笔记：autograd 与计算图、NLP 发展史、word2vec 四维笔记
├── 05_Records/             # 验收记录（进度唯一来源）+ 错题本
│
├── 06_讲义精讲/             # slides 的中文转写与扩写（K01–K12），纯 md 留档
│   ├── 00_全景地图.md
│   └── K01_词向量与分布语义/ ... K12_影响与开放问题/
│
├── 07_伴学/                # 资源地图 + 当前位置 + A1–A4 上手工桥（读懂→会写之间的台阶）
├── playground/             # t0–t3 练手目录 + 参考实现
└── site/                   # 交互复习站（见下）
```

---

## 交互复习站 `site/`

一套纯 HTML / CSS / 原生 JS 的**离线复习站**，把讲义做成十段式正文 + 可拖可点的交互 + 公式逐项高亮 + Quiz。

- 双击 `site/index.html` 即可打开（`file://` 协议，无服务器、无后端、断网可用）
- 内容载体是 `site/data/kNN.js`，改内容只改这一处
- 校验（退出码即判定）：

```bash
node site/tests/core.test.js     # 算法层断言
node site/tests/site.check.js    # 静态结构断言
node site/tests/smoke.mjs        # 浏览器端到端断言
node site/tests/smoke-mobile.mjs # 移动端断言
```

- 打包成手机可用的单文件：

```bash
python site/tools/build_mobile.py   # → site/dist/mobile/*.html（每页一个自包含文件）
```

细节与硬约束见 [`site/README.md`](site/README.md)。

---

## 环境

- **Python 3.13**（作业与 `code/*.py` 实测脚本）
- **Node.js 22**（站点校验与打包）
- 作业与讲义中的每个数字都要能复现：实测脚本在 `site/tools/_deep_*.py` 与各课 `code/`，输出留档在同级 `logs/`。

---

## 说明

- 课程：<https://web.stanford.edu/class/cs224n/>
- 讲义精讲（`06_`/`site/`）是本仓库的原创转写与扩写，与课程官方 slides 不是同一份东西；有疑问以 `01_Lectures/` 原始 slides 为准。
- 所有结论按 `官方原文 / 实测 / 第三方 / 未验证` 分级标注，未验证的部分单独列出，不糊弄。
