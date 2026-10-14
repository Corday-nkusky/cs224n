#!/usr/bin/env node
/* ============================================================
 * smoke.mjs —— K01 交互复习站的浏览器冒烟测试
 * ============================================================
 * 手册要求：
 *   「逐个写交互实验……写完做一次『全部挂载、全部按钮点一遍』的冒烟测试」
 *   交付前检查项：「双击 index.html 能打开，断网也能用」
 *
 * 已有的两层校验都没覆盖这一层：
 *   tests/core.test.js  —— 只验 js/core 的纯算法（Node 里跑，没有 DOM）
 *   tests/site.check.js —— 只做静态结构校验 + 公式能否渲染（仍是 Node）
 *   本脚本              —— **真实浏览器里的 DOM 渲染与事件绑定**
 *
 * 零依赖：只要 Node ≥ 20（全局 WebSocket / fetch）+ 本机 Chrome。
 * 不下载 Chromium、不起本地服务器，直接开 file://（这正是要验的交付形态）。
 *
 * 用法：
 *   node site/tests/smoke.mjs           # 退出码 0 = 全过
 *   node site/tests/smoke.mjs --shots   # 额外落盘截图（默认就落，见 SHOTS）
 *
 * 退出码非 0 时会列出全部失败项，便于直接定位。
 * ============================================================ */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SITE = path.resolve(__dirname, '..')
const INDEX_URL = pathToFileURL(path.join(SITE, 'index.html')).href
const SHOTS = path.join(__dirname, 'screenshots')
const REPORT = path.join(__dirname, 'smoke-report.json')
const PORT = 9411

/* 与手册 10 段式骨架对应的 10 个 section（顺序即 sidebar 顺序） */
const SECTION_IDS = ['what', 'why', 'intuition', 'def', 'formula', 'numbers', 'viz', 'compare', 'pitfalls', 'quiz']
/* 11 个交互实验 */
const VIZ_KEYS = ['onehot', 'cooccur', 'dim', 'noise', 'huffman', 'grad', 'cost', 'windowdemo', 'softmaxdemo', 'negsamp', 'cosdemo']
/* 7 个非章节页面 */
const REF_PAGES = ['glossary', 'formulas', 'params', 'quiz', 'honesty', 'about']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]

/* ============================================================
 * CDP 客户端（照 webapp-e2e-verify-cdp 技能里的最小实现）
 * ============================================================ */

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.seq = 0
    this.pending = new Map()
    this.listeners = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id !== undefined) {
        const slot = this.pending.get(msg.id)
        if (!slot) return
        this.pending.delete(msg.id)
        if (msg.error) slot.reject(new Error(`${msg.error.message}（code ${msg.error.code}）`))
        else slot.resolve(msg.result)
        return
      }
      const slots = this.listeners.get(msg.method)
      if (slots) {
        for (const slot of [...slots]) {
          slot.cb(msg.params)
          if (slot.once) slots.splice(slots.indexOf(slot), 1)
        }
      }
    })
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', () => reject(new Error(`WebSocket 连接失败：${wsUrl}`)), { once: true })
    })
    return new Cdp(ws)
  }

  send(method, params = {}) {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, cb, once = false) {
    if (!this.listeners.has(method)) this.listeners.set(method, [])
    this.listeners.get(method).push({ cb, once })
  }

  waitEvent(method, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`等待 ${method} 超时（${timeoutMs}ms）`)), timeoutMs)
      this.on(method, (params) => { clearTimeout(timer); resolve(params) }, true)
    })
  }

  close() { try { this.ws.close() } catch { /* 关不掉也不影响退出 */ } }
}

async function launchChrome({ port = PORT, width = 1280, height = 900 } = {}) {
  const exe = CHROME_CANDIDATES.find((p) => existsSync(p))
  if (!exe) throw new Error('找不到 Chrome / Edge，请在 CHROME_CANDIDATES 里补路径')

  const profile = mkdtempSync(path.join(tmpdir(), 'k01-smoke-'))
  const proc = spawn(exe, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--allow-file-access-from-files',   // file:// 下同一目录的资源互访
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })

  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) {
        const cdp = await Cdp.connect(page.webSocketDebuggerUrl)
        await cdp.send('Page.enable')
        await cdp.send('Runtime.enable')
        await cdp.send('Network.enable')
        await cdp.send('Log.enable')
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
        return { cdp, proc, profile, exe }
      }
    } catch { /* CDP 端点还没起来，继续等 */ }
    await sleep(300)
  }
  proc.kill()
  throw new Error('Chrome CDP 端点未就绪')
}

/* ============================================================
 * 页面操作封装
 * ============================================================ */

async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) {
    const d = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text
    throw new Error(`页面内执行异常：${d}`)
  }
  return r.result.value
}

async function waitFor(cdp, expr, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expr)) return true
    await sleep(100)
  }
  /* 超时时把 #content 的实际内容一起抛出来。
     以前只报「等待超时：路由 X 生效」，光看这句话只能知道「没出现」，
     不知道是页面崩了、渲染出了别的东西、还是真慢 —— 每次都得另外写探针去猜。 */
  let dump = ''
  try {
    dump = await evaluate(cdp, `(document.getElementById('content')||{}).innerText || '(取不到 #content)'`)
  } catch (e) { dump = '(读取 #content 失败: ' + e.message + ')' }
  dump = String(dump).replace(/\s+/g, ' ').trim().slice(0, 900)
  throw new Error(`等待超时：${label}\n    当时 #content 的实际内容：\n    ${dump}`)
}

async function navigate(cdp, url) {
  const loaded = cdp.waitEvent('Page.loadEventFired')
  await cdp.send('Page.navigate', { url })
  await loaded
  await sleep(350)
}

async function screenshot(cdp, file, fullPage = false) {
  mkdirSync(path.dirname(file), { recursive: true })
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage })
  writeFileSync(file, Buffer.from(r.data, 'base64'))
  return file
}

/** 切 hash 并等页面真的换了内容（hashchange 是异步的） */
async function goHash(cdp, hash, markerExpr) {
  await evaluate(cdp, `location.hash = ${JSON.stringify(hash)}`)
  // markerExpr 可选：不传就只等一小会儿。以前不传会把 undefined 喂给 Runtime.evaluate，
  // CDP 直接回 Invalid parameters —— 那种报错看不出是哪个调用出的，排查很贵。
  if (markerExpr) await waitFor(cdp, markerExpr, `路由 ${hash} 生效`, 8000)
  await sleep(120)
}

/**
 * 收集控制台报错。
 * 注意：source === 'network' 的 Log 条目是浏览器给失败资源打的日志，
 * 不是 JS 异常 —— JS 异常要从 Runtime.exceptionThrown 收。
 */
function collectErrors(cdp) {
  const errors = []
  cdp.on('Runtime.exceptionThrown', (p) => {
    errors.push({
      kind: 'exception',
      text: p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '未知 JS 异常',
    })
  })
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') errors.push({ kind: 'console.error', text: p.args.map((a) => a.value ?? a.description).join(' ') })
  })
  cdp.on('Log.entryAdded', (p) => {
    if (p.entry.level === 'error' && p.entry.source !== 'network') errors.push({ kind: `log/${p.entry.source}`, text: p.entry.text })
  })
  return errors
}

/* ============================================================
 * 断言收集器
 * 硬知识 18：预期断言数要做**硬判定**。
 * 「跑过的断言都过了」不等于「该跑的都跑了」——有人删掉一条、或某条被跳过，
 * 都会得到「退出码 0 + 断言数变少」。所以数量对不上直接判失败。
 * ============================================================ */

/**
 * 预期断言总数（硬判定）。
 *
 * 一个套件的退出码 0 只说明「跑过的那些断言都过了」，不说明「该跑的都跑了」。
 * 有人删掉/注释掉一条断言，或某条因前置缺失被跳过，都会得到「退出码 0 + 断言数变少」。
 * 所以这里把数量对不上直接判失败。
 * 代价：增删断言时要同步改这个数 —— 这个代价是值得付的（参考 webapp-e2e-verify-cdp 第 18 条）。
 * 临时本地实验可用 K01_SMOKE_EXPECT=0 关掉这项检查。
 */
const EXPECT_TOTAL = Number(process.env.K01_SMOKE_EXPECT || 217)

function createChecker() {
  const results = []
  const check = (id, desc, cond, detail) => {
    if (typeof cond !== 'boolean') throw new Error(`断言 ${id} 的条件不是布尔值（写反了？）：${cond}`)
    results.push({ id, desc, ok: cond, detail: detail == null ? '' : String(detail) })
    const mark = cond ? '\u2713' : '\u2717'
    console.log(`  ${mark} ${id}  ${desc}${detail ? ` —— ${detail}` : ''}`)
    return cond
  }
  return {
    check,
    section(title) { console.log(`\n${title}`) },
    results,
    summary() {
      const failed = results.filter((r) => !r.ok)
      if (EXPECT_TOTAL && results.length !== EXPECT_TOTAL) {
        console.log(`\n\u2717 断言总数不符：实际 ${results.length}，预期 ${EXPECT_TOTAL}`)
        console.log('  说明有断言被删除或被跳过。确认无误后更新 EXPECT_TOTAL（或设环境变量 K01_SMOKE_EXPECT）。')
        failed.push({ id: 'META-1', desc: '断言总数与预期一致', ok: false, detail: `${results.length} != ${EXPECT_TOTAL}` })
      }
      console.log(`\n${'='.repeat(64)}`)
      console.log(`通过 ${results.length - failed.length} 项，失败 ${failed.length} 项（共 ${results.length} 项）`)
      if (failed.length) {
        console.log('\n失败清单：')
        failed.forEach((f) => console.log(`  - ${f.id}  ${f.desc}  ${f.detail}`))
      }
      return failed
    },
  }
}

/* ============================================================
 * 主流程
 * ============================================================ */

async function main() {
  const { check, section, results, summary } = createChecker()
  const { cdp, proc, profile, exe } = await launchChrome()
  const errors = collectErrors(cdp)
  const requests = []
  cdp.on('Network.requestWillBeSent', (p) => requests.push(p.request.url))

  // 弹窗（Quiz 的「清空作答」用 confirm）一律自动取消，避免脚本卡死
  cdp.on('Page.javascriptDialogOpening', () => {
    cdp.send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {})
  })

  const notes = []
  const shots = []

  try {
    /* ---------------- A. 首次加载 ---------------- */
    section('A. 首次加载（file:// 直接开，无服务器）')
    await navigate(cdp, INDEX_URL)

    const boot = await evaluate(cdp, `({
      ready: !!document.querySelector('#content .chapter-head'),
      title: document.title,
      secs: document.querySelectorAll('#secNav a').length,
      tree: document.querySelectorAll('#courseTree .k').length,
      cur: document.querySelectorAll('#courseTree .k.cur').length,
      contentLen: (document.getElementById('content') || {}).innerHTML ? document.getElementById('content').innerHTML.length : 0,
      katex: document.querySelectorAll('.katex').length,
      cards: document.querySelectorAll('#content .course-card').length,
      planned: document.querySelectorAll('#content .course-card.planned').length,
      toc: document.querySelectorAll('#toc h4').length,
      theme: document.documentElement.getAttribute('data-theme'),
      fontFaces: document.fonts ? document.fonts.size : -1,
      fontStatus: document.fonts ? document.fonts.status : 'n/a',
      errEls: document.querySelectorAll('#content .err').length,
      protocol: location.protocol,
      hash: location.hash,
    })`)

    check('A-1', '页面在 file:// 协议下启动（无服务器、无 fetch）', boot.protocol === 'file:', boot.protocol)
    /* 标签页标题多课后改成了动态的：首页不带课程名，进课后才带（见 A-12）。
       首页标题里若出现 K01，说明又退回「整站就是 K01」的老写法了。 */
    check('A-2', '标签页标题正确（首页是全站标题，不带某一门课）',
      /CS224N/.test(boot.title) && !/K01/.test(boot.title), boot.title)
    check('A-3', '首屏正文已渲染', boot.ready && boot.contentLen > 2000, `content ${boot.contentLen} 字符`)
    check('A-4', '左侧目录树渲染出全部 13 项（12 个知识点 + 1 份动手作业）', boot.tree === 13, `${boot.tree} 项`)
    /* 侧栏是**两级目录**：一级课程，二级是当前那门课的段落。
       首页没有「打开的课程」，所以二级目录一条都不该有 —— 有的话就是又退回
       「把所有段落平铺在课程清单后面」的老结构了（读起来像多出来的一门课）。 */
    check('A-5', '首页侧栏只有一级目录（13 项，没有展开任何课程的段落）',
      boot.cur === 0 && boot.secs === 0 && boot.tree === 13,
      `${boot.tree} 项 / 展开 ${boot.cur} 个 / 二级目录 ${boot.secs} 条`)
    /* 首页的右栏是「怎么用」说明（1 个小标题）；课程内才是「本章速查 + 锚点数字 + 诚实边界」（≥3）。
       两类页面形态本就不同，所以课程内的那部分放到 A-12 里验。 */
    check('A-6', '右侧栏有内容（首页是「怎么用」说明）', boot.toc >= 1, `${boot.toc} 个小标题`)
    check('A-7', '默认浅色主题（手册里用户要"白色的"）', boot.theme === 'light', boot.theme)
    /* 多课程后首屏是课程列表，不再是 K01 第一段 ——
       所以「公式渲染」不能在首屏上测（首页没有公式），得进到课里再测。见 A-11。 */
    check('A-8', '首屏是课程列表：13 张卡（12 知识点 + 1 作业），其中 11 张是未开工的灰卡',
      boot.cards === 13 && boot.planned === 11, `${boot.cards} 张卡 / ${boot.planned} 张灰卡`)
    check('A-9', 'KaTeX 字体已加载（离线字体走相对路径）', boot.fontFaces > 0 && boot.fontStatus === 'loaded', `${boot.fontFaces} 个 FontFace，status=${boot.fontStatus}`)
    check('A-10', '首屏没有错误占位块', boot.errEls === 0, `.err × ${boot.errEls}`)

    /* A-11：公式系统本身得进到有公式的页面才算验过。
       首屏现在是课程列表，把这条留在这里是为了避免「首页没公式 ⇒ 以为 KaTeX 没生效」。 */
    await goHash(cdp, '#/c/k01/what', `document.querySelectorAll('#content .katex').length >= 0`)
    await sleep(250)
    const inCourse = await evaluate(cdp, `({
      katex: document.querySelectorAll('#content .katex').length,
      errEls: document.querySelectorAll('#content .err').length,
      sec: !!document.querySelector('#sec-what'),
      toc: document.querySelectorAll('#toc h4').length,
      topTitle: (document.getElementById('topTitle') || {}).textContent || '',
      topSub: (document.getElementById('topSub') || {}).textContent || '',
      docTitle: document.title,
      isHome: document.body.classList.contains('route-home'),
      /* 两级目录的硬判据：展开的那门课(.k.cur)的**下一个兄弟节点**就是它的段落列表。
         只数「secNav 里有 10 条」是不够的 —— 平铺在清单最后也是 10 条。 */
      curNode: (function () {
        var k = document.querySelector('#courseTree .k.cur');
        if (!k) return { ok: false, why: '没有 .k.cur' };
        var nx = k.nextElementSibling;
        return {
          ok: !!nx && nx.tagName === 'UL' && nx.classList.contains('sec-nav') && nx.id === 'secNav',
          no: (k.querySelector('b') || {}).textContent || '',
          tag: nx ? nx.tagName + '.' + nx.className : '(无兄弟节点)',
          n: nx ? nx.querySelectorAll('a').length : 0,
        };
      })(),
      seclessAtEnd: document.querySelector('#courseTree > .sec-nav:last-child') ? 1 : 0,
      toolsTitle: (document.querySelector('#sideTools .side-title') || {}).textContent || '',
    })`)
    check('A-11', '进入课程后公式能渲染（首页没有公式，不能在首屏上测）',
      inCourse.sec && inCourse.katex > 0 && inCourse.errEls === 0,
      `${inCourse.katex} 个 .katex / .err × ${inCourse.errEls}`)
    /* 顶栏以前是 index.html 里写死的静态文本（#topTitle 有 id 却从没被 JS 更新过），
       多课后点进别的课它不会变 —— 这条盯住「顶栏跟着当前课程走」。
       顺带盯住左栏的两级目录：段落必须嵌在自己那门课下面，不能甩在清单末尾。 */
    check('A-12', '顶栏随课程切换（标题 + 段数说明），右栏换成该课速查，左栏两级目录嵌在该课下',
      inCourse.topTitle.indexOf('词向量') >= 0 &&
      inCourse.topSub.indexOf('交互与自测同页') >= 0 &&
      inCourse.toc >= 3 &&
      inCourse.isHome === false &&
      inCourse.curNode.ok && inCourse.curNode.no === 'K01' && inCourse.curNode.n === 10 &&
      inCourse.seclessAtEnd === 0 &&
      inCourse.toolsTitle.indexOf('K01') === 0 &&
      /K01/.test(inCourse.docTitle),
      `顶栏「${inCourse.topTitle}」/ 右栏 ${inCourse.toc} 个小标题 / 二级目录挂在 ${inCourse.curNode.no} 的 ${inCourse.curNode.tag}（${inCourse.curNode.n} 条）/ 末尾裸列表 ${inCourse.seclessAtEnd} / 工具标题「${inCourse.toolsTitle}」/ 标签页「${inCourse.docTitle}」`)

    // 「课程内长什么样」这张必须给人眼看：两级目录是不是真的嵌对了，断言只能验结构、验不了观感
    shots.push(await screenshot(cdp, path.join(SHOTS, '01-课程内-两级目录.png')))

    /* ---------------- B. 十段逐段挂载 ---------------- */
    section('B. 十段逐段挂载（每段都渲染 + 交互挂载成功）')
    const secInfo = {}
    for (const id of SECTION_IDS) {
      await goHash(cdp, `#/c/k01/${id}`, `!!document.querySelector('#sec-${id}')`)
      const s = await evaluate(cdp, `(function () {
        var sec = document.querySelector('#sec-' + ${JSON.stringify(id)});
        if (!sec) sec = document.querySelector('#content section.block-sec');
        var hosts = [].slice.call(document.querySelectorAll('[data-viz]'));
        return {
          title: (document.querySelector('#content h1') || {}).textContent || '',
          blocks: sec ? sec.children.length : 0,
          chars: sec ? sec.textContent.length : 0,
          vizHosts: hosts.length,
          vizMounted: hosts.filter(function (h) { return h.dataset.mounted === '1' }).length,
          vizWithBody: hosts.filter(function (h) { return !!h.querySelector('.viz-body') }).length,
          errEls: document.querySelectorAll('#content .err').length,
          katex: document.querySelectorAll('#content .katex').length,
        };
      })()`)
      secInfo[id] = s
      check(`B-${id}-1`, `第 ${SECTION_IDS.indexOf(id) + 1} 段「${s.title}」内容非空`, s.blocks > 2 && s.chars > 300, `${s.blocks} 块 / ${s.chars} 字`)
      check(`B-${id}-2`, `第 ${SECTION_IDS.indexOf(id) + 1} 段无错误占位块`, s.errEls === 0, `.err × ${s.errEls}`)
      check(`B-${id}-3`, `第 ${SECTION_IDS.indexOf(id) + 1} 段交互全部挂载`, s.vizHosts === s.vizMounted && s.vizHosts === s.vizWithBody, `${s.vizMounted}/${s.vizHosts} 挂载，${s.vizWithBody} 有内容`)
    }
    const vizSection = secInfo.viz
    check('B-viz-all', `可交互可视化段（第 7 段）${VIZ_KEYS.length} 个交互全部在同一页挂载`, vizSection.vizHosts === VIZ_KEYS.length, `${vizSection.vizHosts} 个宿主`)

    shots.push(await screenshot(cdp, path.join(SHOTS, '02-第七段-全部交互.png'), true))

    /* ---------------- C. 11 个交互逐控件操作 ---------------- */
    section('C. 11 个交互实验逐控件操作（滑块每一档、下拉每一项、按钮每个都点）')
    await goHash(cdp, '#/c/k01/viz', `document.querySelectorAll('[data-viz]').length >= ${VIZ_KEYS.length}`)

    const vizReports = {}
    for (const key of VIZ_KEYS) {
      const errBefore = errors.length
      // 一个宿主里可能挂载了两次同名交互（onehot），全部驱动
      const rep = await evaluate(cdp, `(function () {
        var hosts = [].slice.call(document.querySelectorAll('[data-viz="' + ${JSON.stringify(key)} + '"]'));
        if (!hosts.length) return { found: 0 };
        var agg = { found: hosts.length, ranges: 0, rangeSteps: 0, selects: 0, selectSteps: 0, checks: 0, buttons: 0, errs: [] };
        function fire(n, t) { n.dispatchEvent(new Event(t, { bubbles: true })); }
        hosts.forEach(function (host) {
          [].slice.call(host.querySelectorAll('input[type=range]')).forEach(function (r) {
            var min = parseFloat(r.min), max = parseFloat(r.max);
            var vals = [min, min + (max - min) / 4, min + (max - min) / 2, min + (max - min) * 3 / 4, max];
            vals.forEach(function (v) { r.value = String(v); fire(r, 'input'); agg.rangeSteps++; });
            r.value = String(min); fire(r, 'input');
            agg.ranges++;
          });
          [].slice.call(host.querySelectorAll('select')).forEach(function (s) {
            var n = s.options.length;
            for (var i = 0; i < n; i++) { s.selectedIndex = i; fire(s, 'change'); agg.selectSteps++; }
            s.selectedIndex = 0; fire(s, 'change');
            agg.selects++;
          });
          [].slice.call(host.querySelectorAll('input[type=checkbox]')).forEach(function (c) {
            c.checked = !c.checked; fire(c, 'change');
            c.checked = !c.checked; fire(c, 'change');
            agg.checks++;
          });
          [].slice.call(host.querySelectorAll('button')).forEach(function (b) { b.click(); agg.buttons++; });
          agg.errs = agg.errs.concat([].slice.call(host.querySelectorAll('.err')).map(function (e) { return e.textContent; }));
        });
        agg.hasBody = hosts.every(function (h) { return !!h.querySelector('.viz-body') && h.querySelector('.viz-body').children.length > 0; });
        return agg;
      })()`)
      vizReports[key] = rep

      const noNewErr = errors.length === errBefore
      check(`C-${key}-1`, `[${key}] 交互找到并已挂载`, rep.found >= 1, `${rep.found} 个宿主`)
      check(`C-${key}-2`, `[${key}] 全部控件可驱动（滑块 ${rep.ranges} / 下拉 ${rep.selects} / 勾选 ${rep.checks} / 按钮 ${rep.buttons}）`,
        (rep.ranges + rep.selects + rep.checks + rep.buttons) >= 1, `${rep.rangeSteps + rep.selectSteps} 次状态切换`)
      check(`C-${key}-3`, `[${key}] 操作后无错误占位块`, rep.errs.length === 0, rep.errs.join(' | ') || '0 个')
      check(`C-${key}-4`, `[${key}] 操作后输出区仍有内容`, rep.hasBody === true)
      check(`C-${key}-5`, `[${key}] 操作过程中无 JS 异常`, noNewErr, noNewErr ? '' : `${errors.length - errBefore} 条`)

      // 关键交互截图
      if (['onehot', 'dim', 'huffman', 'grad', 'windowdemo', 'softmaxdemo', 'negsamp', 'cosdemo'].includes(key)) {
        const host = await evaluate(cdp, `(function(){
          var h = document.querySelector('[data-viz="${key}"]');
          if (h) h.scrollIntoView({ block: 'start' });
          return !!h;
        })()`)
        if (host) {
          await sleep(200)
          shots.push(await screenshot(cdp, path.join(SHOTS, `03-交互-${key}.png`)))
        }
      }
    }

    /* ---------------- D. 公式逐项高亮 ---------------- */
    section('D. 公式逐项高亮（6 个 hl 块：逐项按钮、下一步走到底、重置与反向对照）')
    // 6 个 hl 块都在第 5 段「公式逐项解释」
    await goHash(cdp, '#/c/k01/formula', `document.querySelectorAll('.hl').length === 6`)
    // 高亮用了 0.18s 的 background-color 过渡：同步读 getComputedStyle 只会拿到过渡起点（透明）。
    // 测试期间临时关掉过渡 —— 它只影响动画时长，不影响任何选择器与属性的最终解析结果。
    // （随后 D-8 会在撤掉这段样式、保留真实过渡的状态下再验一次，避免"只在测试仪表下才生效"。）
    await evaluate(cdp, `(function () {
      var st = document.createElement('style');
      st.id = 'k01-smoke-no-transition';
      st.textContent = '.hl, .hl * { transition: none !important; animation: none !important; }';
      document.head.appendChild(st);
      return true;
    })()`)
    const hlReport = await evaluate(cdp, `(function () {
      function litCount(box, k) {
        var stage = box.querySelector('.hl-stage');
        if (!stage) return -1;
        return [].slice.call(stage.querySelectorAll('.hl-p' + k)).filter(function (e) {
          var bg = getComputedStyle(e).backgroundColor;
          return bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
        }).length;
      }
      // 整式回退：data-lit="all" 时底色加在 .katex-display > .katex 上
      function allLitCount(box) {
        var n = box.querySelector('.hl-stage .katex-display > .katex');
        if (!n) return -1;
        var bg = getComputedStyle(n).backgroundColor;
        return (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') ? 1 : 0;
      }
      return [].slice.call(document.querySelectorAll('.hl')).map(function (box) {
        var partBtns = [].slice.call(box.querySelectorAll('.hl-parts button'));
        var steps = partBtns.length;
        function pick(txt) {
          return [].slice.call(box.querySelectorAll('.hl-bar .btn')).filter(function (b) { return txt.test(b.textContent) })[0];
        }
        var next = pick(/下一步|走完了/);
        var reset = pick(/重置/);
        // ① 先回第 0 步，采「无高亮」基线，再用「下一步」一路点到底
        if (reset) reset.click();
        var litAtZero = litCount(box, steps);
        var zeroAll = allLitCount(box);
        var clicked = 0;
        while (next && !next.disabled && clicked < 30) { next.click(); clicked++; }
        var end = { step: box.dataset.step, dots: box.querySelectorAll('.hl-dots i.on').length, lit: litCount(box, steps), all: allLitCount(box), mode: box.dataset.lit };
        // ② 逐个分项按钮：跳到第 k 步，应当只有第 k 项亮
        var lit = [];
        partBtns.forEach(function (b, i) {
          b.click();
          var others = 0;
          for (var j = 1; j <= 3; j++) { if (j !== i + 1 && litCount(box, j) > 0) others++; }
          lit.push({ step: box.dataset.step, n: litCount(box, i + 1), others: others, mode: box.dataset.lit, allBg: allLitCount(box) });
        });
        if (reset) reset.click();
        return {
          steps: steps, clicked: clicked, end: end, lit: lit, litAtZero: litAtZero, zeroAll: zeroAll,
          backToZero: box.dataset.step,
          afterReset: (box.querySelector('.hl-note') || {}).textContent || '',
        };
      });
    })()`)

    check('D-1', '找到 6 个公式逐项高亮块', hlReport.length === 6, `${hlReport.length} 个`)
    check('D-2', '每个块都能用「下一步」一路点到尾（步数 = 分项数）', hlReport.length === 6 && hlReport.every((h) => h.steps > 1 && h.clicked === h.steps && h.end.step === String(h.steps)), hlReport.map((h) => `${h.clicked}/${h.steps}`).join(' '))
    check('D-3', '走到尾时每个圆点都点亮', hlReport.length === 6 && hlReport.every((h) => h.end.dots === h.steps), hlReport.map((h) => `${h.end.dots}`).join(' '))
    check('D-4', '分项按钮能单独跳到第 k 步', hlReport.length === 6 && hlReport.every((h) => h.lit.length === h.steps && h.lit.every((x, i) => x.step === String(i + 1))), hlReport.map((h) => h.lit.map((x) => x.step).join('')).join(' '))
    check('D-5', '每一步都有可见的高亮：要么片段，要么整式回退（不留「点了没反应」的步骤）', hlReport.length === 6 && hlReport.every((h) => h.lit.every((x) => x.n >= 1 || x.mode === 'all')), hlReport.map((h) => h.lit.map((x) => x.n >= 1 ? 'p' : (x.mode === 'all' ? 'A' : '—')).join('')).join(' '))
    check('D-6', '走整式回退的那几步，整式底色确实出现（反向对照：不是只写了 data-lit）', hlReport.length === 6 && hlReport.every((h) => h.lit.every((x) => x.mode !== 'all' || x.allBg === 1)), hlReport.flatMap((h) => h.lit.filter((x) => x.mode === 'all').map((x) => x.allBg)).join(' ') || '无整式回退步骤')
    check('D-7', '第 k 步只亮第 k 项，不会串亮别项', hlReport.length === 6 && hlReport.every((h) => h.lit.every((x) => x.others === 0)), hlReport.map((h) => h.lit.map((x) => x.others).join('')).join(' '))
    check('D-8', '重置后回到第 0 步，底色全撤且提示文案复原（反向对照）', hlReport.length === 6 && hlReport.every((h) => h.backToZero === '0' && h.litAtZero === 0 && h.zeroAll === 0 && /点「下一步」/.test(h.afterReset)), hlReport.map((h) => `${h.litAtZero}/${h.zeroAll}`).join(' '))

    // 撤掉临时样式，保留真实过渡，隔 0.4s 再验一次底色确实出现
    await evaluate(cdp, `(function () {
      var s = document.getElementById('k01-smoke-no-transition');
      if (s) s.remove();
      document.querySelectorAll('.hl')[0].querySelectorAll('.hl-parts button')[0].click();
      return true;
    })()`)
    await sleep(450)
    const realLit = await evaluate(cdp, `(function () {
      var stage = document.querySelectorAll('.hl')[0].querySelector('.hl-stage');
      return [].slice.call(stage.querySelectorAll('.hl-p1')).filter(function (e) {
        var bg = getComputedStyle(e).backgroundColor;
        return bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
      }).length;
    })()`)
    check('D-9', '不关过渡、真实渲染 0.45s 后底色确实出现（排除「只在测试仪表下才生效」）', realLit >= 1, `${realLit} 个片段带底色`)

    /* ---------------- E. 先猜后对 ---------------- */
    section('E. 先猜后对（3 个 predict 块：空输入 / 填错 / 按页面显示的位数填对，三条路径）')
    // 3 个 predict 块都在第 6 段「数值例子」。
    // 2026-10 从 7 个砍到 3 个：用户点名批评「让我推测词频和非零元素占比这种毫无意义的题目」，
    // 于是只留下**答案能自己算出来**的三道（one-hot 内积 / 共现计数 / naive 乘加次数），
    // 其余四个纯数据事实（余弦 1.0000、误差 3.3208、the 采样率 2.715%、哈夫曼路径长 8.491）
    // 改成正文里的一张「实测结论」表 —— 读，不猜。
    await goHash(cdp, '#/c/k01/numbers', `document.querySelectorAll('.predict').length === 3`)
    const predReport = await evaluate(cdp, `(function () {
      var sec = KB.chapters.k01.sections.filter(function (s) { return s.id === 'numbers' })[0];
      var blocks = sec.blocks.filter(function (b) { return b.t === 'predict' });
      var F = KB.freq && KB.freq.imdb2000;
      var boxes = [].slice.call(document.querySelectorAll('.predict'));
      return boxes.map(function (box, i) {
        var sb = blocks[i];
        var answer = sb.compute(KB.core.k01, F);
        var digits = sb.digits != null ? sb.digits : 4;
        var inp = box.querySelector('input[type=text]');
        var btn = [].slice.call(box.querySelectorAll('button')).filter(function (b) { return b.textContent.trim() === '对账' })[0];
        var v = box.querySelector('.verdict');
        var alt = box.querySelector('.palt');
        inp.value = ''; btn.click();
        var emptyMsg = v.textContent;
        inp.value = String(answer + 1234.5); btn.click();
        var wrongMsg = v.textContent;
        // 「按页面自己显示出来的那个数填」必须判对，否则页面自相矛盾
        inp.value = answer.toFixed(digits); btn.click();
        var shownMsg = v.textContent;
        var shownCls = v.className;
        return {
          q: (box.querySelector('.pq') || {}).textContent || '',
          answer: answer, digits: digits,
          emptyMsg: emptyMsg, wrongMsg: wrongMsg, shownMsg: shownMsg, shownCls: shownCls,
          altShown: alt ? getComputedStyle(alt).display !== 'none' : false,
          hasSrc: !!box.querySelector('.psrc'),
        };
      });
    })()`)

    check('E-1', '找到 3 个「先猜后对」块', predReport.length === 3, `${predReport.length} 个`)
    check('E-2', '空输入时给出「先填一个数字」提示', predReport.length === 3 && predReport.every((p) => /先填一个数字/.test(p.emptyMsg)), predReport.map((p) => p.emptyMsg).join(' | ').slice(0, 80))
    check('E-3', '填错后给出差额 + 实测值', predReport.length === 3 && predReport.every((p) => /实测/.test(p.wrongMsg) && /差/.test(p.wrongMsg)), (predReport[0] || {}).wrongMsg?.slice(0, 70) || '')
    check('E-4', '按页面显示的小数位填进去必须判「猜对了」（容差与显示位数一致）', predReport.length === 3 && predReport.every((p) => /猜对了/.test(p.shownMsg)), predReport.map((p) => `${p.answer.toFixed(p.digits)}\u2192${/猜对了/.test(p.shownMsg) ? 'OK' : '判错'}`).join(' '))
    check('E-5', '对账后展开「为什么」段落', predReport.length === 3 && predReport.every((p) => p.altShown), predReport.filter((p) => !p.altShown).length ? '有未展开的' : '全部展开')
    check('E-6', '每个块都标注了实测来源', predReport.length === 3 && predReport.every((p) => p.hasSrc))

    /* ---------------- F. Quiz ---------------- */
    section('F. Quiz 14 题逐题作答（11 判断 + 1 数值 + 2 开放）')
    await goHash(cdp, '#/c/k01/quiz', `document.querySelectorAll('.quiz .q').length === 14`)
    await sleep(200)

    const quizReport = await evaluate(cdp, `(function () {
      var cards = [].slice.call(document.querySelectorAll('.quiz .q'));
      // 【作答前采集】答案不该在点第一下之前就能看出来：
      // ① 选项里没有强调标签（<b>/<strong>/…，源头是数据里的 markdown 粗体）
      // ② 没有被提前打上 对/错 记号
      // ③ 同一题的 4 个选项 DOM 结构完全一致（无法靠结构或样式区分）
      var pre = [];
      cards.forEach(function (card) {
        if (((card.querySelector('.qkind') || {}).textContent || '') !== '概念判断') return;
        var os = [].slice.call(card.querySelectorAll('.opt'));
        var shapes = os.map(function (o) {
          return [].slice.call(o.children).map(function (c) { return c.tagName + '.' + (c.className || '') }).join('+');
        });
        pre.push({
          id: ((card.querySelector('.qid') || {}).textContent || '').trim(),
          n: os.length,
          shapesSame: shapes.length > 1 && shapes.every(function (s) { return s === shapes[0] }),
          shapes: shapes[0] || '',
          emphasis: os.reduce(function (a, o) { return a + o.querySelectorAll('b,strong,em,i,mark,u').length }, 0),
          marked: card.querySelectorAll('.opt.right, .opt.wrong, .opt.sel').length,
        });
      });
      var out = [];
      cards.forEach(function (card) {
        var kind = (card.querySelector('.qkind') || {}).textContent || '';
        var id = (card.querySelector('.qid') || {}).textContent || '';
        var rec = { id: id, kind: kind };
        if (kind === '概念判断') {
          var opts = card.querySelectorAll('.opt');
          opts[0].click();
          rec.opts = opts.length;
          rec.verdict = (card.querySelector('.verdict') || {}).textContent || '';
          rec.explainShown = !!card.querySelector('.explain') && getComputedStyle(card.querySelector('.explain')).display !== 'none';
          rec.rightMarks = card.querySelectorAll('.opt.right').length;
          rec.clickedAgain = (function () {
            opts[1].click();
            return (card.querySelector('.verdict') || {}).textContent || '';
          })();
        } else if (kind === '数值计算') {
          var inp = card.querySelector('input[type=text]');
          var btn = [].slice.call(card.querySelectorAll('button')).filter(function (b) { return b.textContent.trim() === '对账' })[0];
          inp.value = ''; btn.click();
          rec.emptyMsg = (card.querySelector('.verdict') || {}).textContent || '';
          inp.value = '0'; btn.click();
          rec.verdict = (card.querySelector('.verdict') || {}).textContent || '';
          rec.explainShown = !!card.querySelector('.explain') && getComputedStyle(card.querySelector('.explain')).display !== 'none';
        } else {
          var ta = card.querySelector('textarea');
          ta.value = '（冒烟测试写入的占位文本）';
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          rec.typed = ta.value;
          var b3 = [].slice.call(card.querySelectorAll('button')).filter(function (b) { return /看答案要点/.test(b.textContent) })[0];
          b3.click();
          rec.points = card.querySelectorAll('.points li').length;
          rec.btnDisabled = b3.disabled;
        }
        out.push(rec);
      });
      return { cards: out, pre: pre, score: (document.querySelector('.quiz-score b') || {}).textContent || '' };
    })()`)

    const choiceCards = quizReport.cards.filter((c) => c.kind === '概念判断')
    const calcCards = quizReport.cards.filter((c) => c.kind === '数值计算')
    const openCards = quizReport.cards.filter((c) => c.kind !== '概念判断' && c.kind !== '数值计算')

    check('F-1', 'Quiz 页面共 14 题', quizReport.cards.length === 14, `概念判断 ${choiceCards.length} / 数值计算 ${calcCards.length} / 开放 ${openCards.length}`)
    check('F-2', '11 道概念判断题都能选，且立刻判对错 + 展开解析', choiceCards.length === 11 && choiceCards.every((c) => /正确|不对/.test(c.verdict) && c.explainShown), choiceCards.map((c) => c.id + ':' + c.verdict.trim().slice(0, 6)).join(' '))
    check('F-3', '每题都有 4 个选项，正确项被标出', choiceCards.every((c) => c.opts === 4 && c.rightMarks === 1), choiceCards.map((c) => c.opts + '/' + c.rightMarks).join(' '))

    // 【作答前】可猜性检查：正确答案不能在点击之前以任何方式显形
    const pre = quizReport.pre
    check('F-9', '作答前 11 道选择题的选项不含任何强调标签（<b>/<strong>/<em>…）',
      pre.length === 11 && pre.every((p) => p.emphasis === 0),
      pre.map((p) => p.id + ':' + p.emphasis).join(' '))
    check('F-10', '作答前没有任何选项被提前标成 对/错/选中',
      pre.length === 11 && pre.every((p) => p.marked === 0),
      pre.map((p) => p.id + ':' + p.marked).join(' '))
    check('F-11', '同一题的 4 个选项 DOM 结构完全一致（无法靠结构/样式区分）',
      pre.length === 11 && pre.every((p) => p.n === 4 && p.shapesSame),
      pre.map((p) => p.id + ':' + (p.shapesSame ? 'ok(' + p.shapes + ')' : 'MISMATCH')).join(' ').slice(0, 96))
    check('F-4', '已锁定的题再点不改变判定（防止刷分）', choiceCards.every((c) => /正确|不对/.test(c.clickedAgain)), choiceCards[0].clickedAgain.trim().slice(0, 30))
    check('F-5', '1 道数值题空输入有提示', calcCards.length === 1 && calcCards.every((c) => /请填一个数字/.test(c.emptyMsg)), calcCards.map((c) => c.emptyMsg.trim()).join(' | ').slice(0, 60))
    check('F-6', '1 道数值题答错后给出正确答案 + 解析', calcCards.every((c) => /正确答案/.test(c.verdict) && c.explainShown), calcCards.map((c) => c.id).join(' '))
    check('F-7', '2 道开放题可写、可展开要点', openCards.length === 2 && openCards.every((c) => c.typed.length > 0 && c.points >= 3 && c.btnDisabled === true), openCards.map((c) => c.id + ':' + c.points + ' 要点').join(' '))
    check('F-8', '得分条正确显示并随作答更新', /\/\s*12/.test(quizReport.score) && !/^0\s*\//.test(quizReport.score.trim()), quizReport.score.trim())
    // 记下此刻的得分，供 J-4 验「重载后能从 localStorage 恢复」
    const scoreBeforeReload = quizReport.score.trim()

    shots.push(await screenshot(cdp, path.join(SHOTS, '04-Quiz-已作答.png'), true))

    /* ---------------- G. 其余 7 个页面 ---------------- */
    section('G. 其余入口页（术语表 / 公式速查 / 参数卡 / Quiz / 未验证清单 / 关于）')
    const pageExpect = {
      glossary: { marker: `document.querySelectorAll('.glos-item').length === 42`, minChars: 1500, label: '术语表' },
      formulas: { marker: `document.querySelectorAll('.card .math-block').length >= 8`, minChars: 500, label: '公式速查' },
      params: { marker: `document.querySelectorAll('#content table').length >= 2`, minChars: 600, label: '参数卡' },
      quiz: { marker: `document.querySelectorAll('.quiz .q').length === 14`, minChars: 1000, label: 'Quiz' },
      honesty: { marker: `document.querySelectorAll('.honesty li').length === 8`, minChars: 500, label: '未验证清单' },
      about: { marker: `!!document.querySelector('#content .card')`, minChars: 800, label: '这一页怎么来的' },
    }
    for (const key of REF_PAGES) {
      const exp = pageExpect[key]
      // 多课程后地址变了：原本的 #/ref/quiz 页与 K01 的第 10 段内容重复，已合并为段地址；
      // about 是全站页，不属于任何一门课。其余专项页挂在 #/c/<课id>/ref/ 下。
      const hash = key === 'quiz' ? '#/c/k01/quiz'
        : key === 'about' ? '#/about'
          : `#/c/k01/ref/${key}`
      await goHash(cdp, hash, exp.marker)
      const p = await evaluate(cdp, `(function(){
        return {
          chars: document.getElementById('content').textContent.length,
          errEls: document.querySelectorAll('#content .err').length,
          h1: (document.querySelector('#content h1') || {}).textContent || '',
          katex: document.querySelectorAll('#content .katex').length,
        };
      })()`)
      check(`G-${key}-1`, `「${exp.label}」渲染成功`, p.chars >= exp.minChars && p.errEls === 0, `${p.h1} / ${p.chars} 字`)

      // 术语表：多段讲解 + 例子块 + 公式，必须人眼看过。落 4 张留档（首/中/后各取几条）。
      if (key === 'glossary') {
        for (const idx of [0, 12, 26, 40]) {
          const hit = await evaluate(cdp, `(function(){
            var it = document.querySelectorAll('.glos-item')[${idx}];
            if (it) it.scrollIntoView({ block: 'start' });
            return !!it;
          })()`)
          if (hit) {
            await sleep(160)
            shots.push(await screenshot(cdp, path.join(SHOTS, `08-术语表-第${idx + 1}条.png`)))
          }
        }
      }
    }

    /* 每段开头的导读卡（.goal）和第 1 段的本课地图（.roadmap）—— 2026-10 加的导航层。
       为什么加：用户原话"学习时不知道看哪个，效率很低"。
       断言只能验结构与跳转，"好不好看"靠下面那张截图。 */
    await goHash(cdp, '#/c/k01/what', `!!document.querySelector('#sec-what')`)
    const nav = await evaluate(cdp, `(function(){
      var items = [].slice.call(document.querySelectorAll('#content .roadmap .rm-item'));
      return {
        rm: items.length,
        rmHref: items.map(function(a){ return a.getAttribute('href'); }),
        goal: document.querySelectorAll('#content .goal .gcol').length,
        covers: document.querySelectorAll('#content .goal .g-covers li').length,
        after: document.querySelectorAll('#content .goal .g-after li').length
      };
    })()`)
    // 第 1 段的导读卡只有 2 栏：它前面没有别的内容，所以没有「进这一段之前」这一栏。
    // 其余 9 段都是 3 栏（前置 / 这一段回答 / 读完你应该能）。
    check('G-nav-1', '第 1 段有本课地图（10 行）+ 导读卡（2 栏，无「前置」）',
      nav.rm === 10 && nav.goal === 2 && nav.covers >= 2 && nav.after >= 2,
      `地图 ${nav.rm} 行 / 导读 ${nav.goal} 栏（回答 ${nav.covers} 条、读完能 ${nav.after} 条）`)
    check('G-nav-2', '地图每一行都指向真实段地址',
      nav.rmHref.length === 10 && nav.rmHref.every((h) => /^#\/c\/k01\/[a-z]+$/.test(h || '')),
      nav.rmHref.join(' '))

    /* 列宽均分 —— 锁住刚修的那个洞。
       .goal 原来是 `grid-template-columns: repeat(3, 1fr)`（写死 3 列），
       而第 1 段只有 2 栏（它没有"前置"）→ 空出的第 3 格露出容器底色 --line，
       看起来像一块坏掉的空板。现在 column 数自适应，这里量宽度确认真的是均分、
       且列宽之和 ≈ 容器宽（没有 leftover 空格）。 */
    const goalCols = await evaluate(cdp, `(function(){
      var box = document.querySelector('#content .goal');
      if (!box) return null;
      var cols = [].slice.call(box.querySelectorAll('.gcol'));
      var w = cols.map(function(c){ return Math.round(c.getBoundingClientRect().width); });
      return {
        n: cols.length, w: w,
        box: Math.round(box.getBoundingClientRect().width),
        sum: w.reduce(function(a,b){ return a+b; }, 0)
      };
    })()`)
    check('G-nav-5', '导读卡列宽均分（第 1 段 2 栏也对半，没有空掉的第 3 格）',
      !!goalCols && goalCols.n === 2 && Math.abs(goalCols.w[0] - goalCols.w[1]) <= 2 &&
      Math.abs(goalCols.box - goalCols.sum) <= 4,
      goalCols ? `列宽 ${goalCols.w.join('/')}，合计 ${goalCols.sum} / 容器 ${goalCols.box}` : '没找到导读卡')

    // 截图要在**点地图之前**拍 —— 否则拍到的是跳过去之后的第 3 段，而不是第 1 段的地图。
    shots.push(await screenshot(cdp, path.join(SHOTS, '09-第1段-地图与导读.png')))

    // 点地图第 3 行，应该真的跳到第 3 段（intuition）
    await evaluate(cdp, `(function(){ var a = document.querySelectorAll('#content .roadmap .rm-item')[2]; if (a) a.click(); })()`)
    await sleep(320)
    const navJumped = await evaluate(cdp, `!!document.querySelector('#sec-intuition')`)
    check('G-nav-3', '点地图条目真的跳到对应段', navJumped === true)
    shots.push(await screenshot(cdp, path.join(SHOTS, '09-第3段-导读卡.png')))

    // 其余 9 段也各有一张导读卡（结构级抽查，抽 3 段）
    let goalOk = true
    const goalDetail = []
    for (const sid of ['def', 'numbers', 'pitfalls']) {
      await goHash(cdp, `#/c/k01/${sid}`, `!!document.querySelector('#sec-${sid}')`)
      const g = await evaluate(cdp, `document.querySelectorAll('#sec-${sid} .goal .gcol').length`)
      if (g !== 3) { goalOk = false }
      goalDetail.push(sid + ':' + g)
    }
    check('G-nav-4', '抽 3 段：每段开头都有 3 栏导读卡', goalOk, goalDetail.join(' '))

    /* 加深之后的视觉存档（只落盘，不加断言）。
       这两段是 2026-10 加深时改动最大、且旧截图完全没覆盖的地方：
       第 8 段补了 GloVe / 内在-外在评测 / 5 个 hack 三张表，第 10 段补了 14 题索引表与回查表。 */
    await goHash(cdp, '#/c/k01/compare', `!!document.querySelector('#sec-compare')`)
    await evaluate(cdp, `(function(){
      var hs = [].slice.call(document.querySelectorAll('#sec-compare h4.bh'));
      var t = hs.filter(function(h){ return h.textContent.indexOf('GloVe') >= 0; })[0];
      if (t) t.scrollIntoView({ block: 'start' });
      return !!t;
    })()`)
    await sleep(240)
    shots.push(await screenshot(cdp, path.join(SHOTS, '11-加深-第8段-GloVe与评测.png')))

    await goHash(cdp, '#/c/k01/quiz', `!!document.querySelector('#sec-quiz .quiz')`)
    await evaluate(cdp, `(function(){
      var hs = [].slice.call(document.querySelectorAll('#sec-quiz h4.bh'));
      var t = hs.filter(function(h){ return h.textContent.indexOf('定位器') >= 0; })[0];
      if (t) t.scrollIntoView({ block: 'start' });
      return !!t;
    })()`)
    await sleep(240)
    shots.push(await screenshot(cdp, path.join(SHOTS, '11-加深-第10段-Quiz索引表.png')))

    /* ---------------- G2. 术语链接（正文 → 术语表 / 条目互跳） ---------------- */
    section('G2. 术语链接：正文里的术语能跳到术语表，条目之间能互跳')
    const linkScan = []
    for (const sid of ['def', 'formula', 'viz']) {
      await goHash(cdp, `#/c/k01/${sid}`, `!!document.querySelector('#sec-${sid}')`)
      const r = await evaluate(cdp, `(function(){
        var links = [].slice.call(document.querySelectorAll('#content .tlink'));
        return {
          n: links.length,
          hrefs: links.map(function(a){ return a.getAttribute('href'); }),
          texts: links.map(function(a){ return a.textContent; }),
          inQuiz: document.querySelectorAll('#content .quiz .tlink').length,
          inViz: document.querySelectorAll('#content [data-viz] .tlink').length,
          bad: links.filter(function(a){ return !/^#\\/c\\/k01\\/ref\\/glossary\\/\\d+$/.test(a.getAttribute('href')||''); }).length
        };
      })()`)
      linkScan.push(Object.assign({ sid }, r))
      if (sid === 'def') {
        // 滚到第一个链接再截，免得第一屏全是公式看不到链接
        await evaluate(cdp, `(function(){ var a = document.querySelector('#sec-def .tlink'); if (a) a.scrollIntoView({ block: 'center' }); return !!a; })()`)
        await sleep(220)
        shots.push(await screenshot(cdp, path.join(SHOTS, '09-正文里的术语链接.png')))
      }
    }
    const totalLinks = linkScan.reduce((a, x) => a + x.n, 0)
    check('T-1', '正文里挂上了术语链接（三段共 ≥ 12 个）', totalLinks >= 12,
      linkScan.map((x) => x.sid + ':' + x.n).join(' '))
    const badHref = linkScan.reduce((a, x) => a + x.bad, 0)
    check('T-2', '每个链接都指向 #/c/k01/ref/glossary/<下标>', badHref === 0, badHref ? badHref + ' 个异常' : '全部合法')
    const quizLeak = linkScan.reduce((a, x) => a + x.inQuiz, 0)
    const vizLeak = linkScan.reduce((a, x) => a + x.inViz, 0)
    check('T-3', 'Quiz 选项与交互区内部没有被插链接（否则破坏作答与选项结构断言）',
      quizLeak === 0 && vizLeak === 0, `quiz:${quizLeak} viz:${vizLeak}`)
    const dup = []
    linkScan.forEach((x) => {
      const s = {}
      x.texts.forEach((t) => { s[t] = (s[t] || 0) + 1 })
      Object.keys(s).forEach((k) => { if (s[k] > 1) dup.push(x.sid + ':' + k) })
    })
    check('T-4', '同一段里同一个术语只链第一次（不刷屏）', dup.length === 0, dup.slice(0, 5).join(' ') || '无重复')

    // 点一个链接 → 应跳到术语表并定位到那一条
    await goHash(cdp, '#/c/k01/formula', `!!document.querySelector('#sec-formula .tlink')`)
    const clicked = await evaluate(cdp, `(function(){
      var a = document.querySelector('#sec-formula .tlink');
      if (!a) return null;
      var href = a.getAttribute('href'), txt = a.textContent;
      a.click();
      return { href: href, txt: txt, want: parseInt(href.split('/').pop(), 10) };
    })()`)
    await sleep(600)
    const wantIdx = clicked ? clicked.want : -1
    const jumped = await evaluate(cdp, `(function(){
      var item = document.querySelector('.glos-item[data-gi="${wantIdx}"]');
      var rect = item ? item.getBoundingClientRect() : null;
      return {
        hash: location.hash,
        hasItem: !!item,
        flashed: !!document.querySelector('.glos-item.flash'),
        itemName: item ? (item.querySelector('.g') || {}).textContent : '',
        top: rect ? Math.round(rect.top) : null
      };
    })()`)
    check('T-5', '点术语链接 → 跳到术语表对应条目', !!clicked && jumped.hash === '#/c/k01/ref/glossary/' + wantIdx && jumped.hasItem,
      clicked ? `点了「${clicked.txt}」→ ${jumped.hash} / ${jumped.itemName}` : '公式段找不到可点的术语链接')
    check('T-6', '目标条目被滚进视口并高亮闪一下', jumped.flashed && jumped.top !== null && jumped.top < 400,
      `flash=${jumped.flashed} top=${jumped.top}`)

    const glosLinks = await evaluate(cdp, `(function(){
      var items = [].slice.call(document.querySelectorAll('#content .glos-item'));
      var n = 0, selfLink = 0;
      items.forEach(function(it){
        var gi = it.getAttribute('data-gi');
        var ls = [].slice.call(it.querySelectorAll('.tlink'));
        n += ls.length;
        ls.forEach(function(a){ if (a.getAttribute('href') === '#/c/k01/ref/glossary/' + gi) selfLink++; });
      });
      return { n: n, selfLink: selfLink, items: items.length };
    })()`)
    check('T-7', '术语表条目之间能互跳（共 ≥ 20 个链接）', glosLinks.n >= 20, `${glosLinks.n} 个 / ${glosLinks.items} 条`)
    check('T-8', '术语表里没有「自己链自己」', glosLinks.selfLink === 0, `${glosLinks.selfLink} 处`)

    // T-9 —— 我们之所以**不做**一个常驻的「回到原文」按钮，是因为浏览器自带后退就够了：
    // 它连滚动位置都精确恢复。原因：术语链接走的是 hash 路由，后退触发 history traversal，
    // 浏览器的 scroll restoration 在 route() 里那句 scrollTo(0,0) **之后**执行，正好把它覆盖掉。
    // 但这份能力依赖 history.scrollRestoration 保持默认 'auto' ——
    // 一旦有人在 route() 里改成 'manual' 想「自己管滚动」，它会静默失效。所以锁住它。
    await goHash(cdp, '#/c/k01/formula')
    await sleep(250)
    const room = await evaluate(cdp, `(function(){
      var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, Math.min(1200, max));
      return { max: max };
    })()`)
    await sleep(250)
    const leftY = await evaluate(cdp, `Math.round(window.scrollY)`)
    const wentTo = await evaluate(cdp, `(function(){
      var a = document.querySelector('#sec-formula .tlink');
      if (!a) return null;
      a.click();
      return a.getAttribute('href');
    })()`)
    await sleep(700)
    const jumpedTo = await evaluate(cdp, `location.hash`)
    await evaluate(cdp, `history.back()`)
    /* 后退到原段落要等三件事**同时**落定，缺一条就是假红：
     *   ① location.hash 变回目标段（这一条立即满足，hashchange 之前就改了）；
     *   ② 目标段真的重新渲染进 DOM（`#sec-formula .tlink` 存在 —— 光看 hash 会抓空）；
     *   ③ 滚动位置恢复到离开前的值（Chrome 是异步恢复的）。
     * 原先固定 sleep(800) 会间歇性抓到 ② ③ 还没完成。红一条假警报的代价是
     * 以后没人信这套校验，所以改成轮询到三件事都成立（最多约 3s）。 */
    let backState = null
    for (let i = 0; i < 15; i++) {
      backState = await evaluate(cdp, `({ h: location.hash, y: Math.round(window.scrollY), links: document.querySelectorAll('#sec-formula .tlink').length })`)
      if (backState.h === '#/c/k01/formula' && backState.links > 0 && Math.abs(backState.y - leftY) < 30) break
      await sleep(200)
    }
    // leftY > 0 是硬前提：不加这句，页面在当前视口下万一不可滚动，0≈0 会让它变成假绿
    check('T-9', '浏览器后退能回到原段落且滚动位置分毫不动（这是不做「返回按钮」的前提）',
      leftY > 0 && wentTo && jumpedTo.indexOf('#/c/k01/ref/glossary/') === 0 &&
      backState.h === '#/c/k01/formula' && Math.abs(backState.y - leftY) < 30 && backState.links > 0,
      `可滚 ${room.max}px / 离开前 y=${leftY} →（跳到 ${jumpedTo}）→ 后退后 ${backState.h} y=${backState.y} / 术语链接 ${backState.links} 个`)

    /* ---------------- G2. 首页与课程切换（多课程地基） ---------------- */
    section('G2. 首页 / 课程切换 / 未知地址')
    await goHash(cdp, '#/', `document.querySelectorAll('#content .course-card').length === 13`)
    shots.push(await screenshot(cdp, path.join(SHOTS, '00-首页-课程列表.png')))

    const home = await evaluate(cdp, `({
      cards: document.querySelectorAll('#content .course-card').length,
      planned: document.querySelectorAll('#content .course-card.planned').length,
      clickable: [].slice.call(document.querySelectorAll('#content .course-card')).filter(function (c) {
        return !c.classList.contains('planned');
      }).length,
      treeTotal: document.querySelectorAll('#courseTree .k').length,
      treeReady: document.querySelectorAll('#courseTree .k.on').length,
      treeGrp: [].slice.call(document.querySelectorAll('#courseTree .side-grp')).map(function (e) { return e.textContent.trim(); }),
      treeTask: document.querySelectorAll('#courseTree .k.task').length,
      secTitles: [].slice.call(document.querySelectorAll('#content .home-sec h2')).map(function (e) { return e.textContent.trim(); }),
      taskCards: document.querySelectorAll('#content .course-card.task').length,
      h1: (document.querySelector('#content h1') || {}).textContent || '',
      navDisplay: (function () { var e = document.getElementById('secNav'); return e ? getComputedStyle(e).display : 'missing'; })(),
      curOpen: document.querySelectorAll('#courseTree .k.cur').length,
      secAtEnd: document.querySelector('#courseTree > .sec-nav:last-child') ? 1 : 0,
      tools: [].slice.call(document.querySelectorAll('#sideTools a')).map(function (a) { return a.textContent.trim(); }),
      toolsTitle: (document.querySelector('#sideTools .side-title') || {}).textContent || '',
    })`)
    check('G2-1', '首页列出全部 13 项（12 知识点 + 1 作业），其中 11 项是未开工的灰卡',
      home.cards === 13 && home.planned === 11 && home.clickable === 2,
      `${home.cards} 张卡 / ${home.planned} 灰卡 / 可点 ${home.clickable} 张 · 标题「${home.h1}」`)
    /* 两条轨道不是「13 门课平铺」：首页要分成「知识点」「动手作业」两区，
       侧栏也要分两组。混在一起的后果是把作业读成"又一个知识点"。 */
    check('G2-9', '首页分成「知识点」「动手作业」两区，作业卡带 task 标记',
      home.secTitles.length === 2 && home.secTitles[0] === '知识点' && home.secTitles[1] === '动手作业' &&
      home.taskCards === 1,
      `分区标题 ${home.secTitles.join(' / ')} · 作业卡 ${home.taskCards} 张`)
    check('G2-10', '侧栏按两条轨道分组，作业行带 task 标记',
      home.treeGrp.length === 2 && home.treeGrp[1] === '动手作业' && home.treeTask === 1,
      `分组标题 ${home.treeGrp.join(' / ')} · 作业行 ${home.treeTask} 条`)
    check('G2-2', '侧栏目录树同样 13 项，只有已开工的 2 项可点',
      home.treeTotal === 13 && home.treeReady === 2,
      `${home.treeTotal} 项 / ${home.treeReady} 项已开工`)
    /* 「首页还挂着某门课的段落列表」是多课程最容易被忽略的耦合残留 ——
       视觉上会让人以为「你已经在某门课里了」。首页必须只剩一级目录 + 站点级的关于页。
       注意这里判的是「二级目录根本不存在」，不是「被 CSS 藏起来」——
       藏起来的话 DOM 里仍有一个语义上属于某门课的列表。 */
    check('G2-6', '首页左栏只有一级目录（没有展开的课程、没有二级目录、工具条只剩站点级条目）',
      home.navDisplay === 'missing' && home.curOpen === 0 && home.secAtEnd === 0 &&
      home.tools.length === 1 && home.tools[0].indexOf('这一页怎么来的') >= 0 &&
      home.toolsTitle === '',
      `二级目录 ${home.navDisplay} / 展开课程 ${home.curOpen} / 工具条 ${home.tools.length} 条：${home.tools.join('、')} / 工具标题「${home.toolsTitle}」`)

    // 点 K01 的卡片真的能进课
    await evaluate(cdp, `document.querySelectorAll('#content .course-card')[0].click()`)
    await sleep(300)
    const entered = await evaluate(cdp, `({ hash: location.hash, sec: !!document.querySelector('#sec-what') })`)
    check('G2-3', '点课程卡进入该课第一段', entered.sec && entered.hash.indexOf('#/c/k01/') === 0,
      `${entered.hash} / 段已挂载 ${entered.sec}`)

    // 进课后左栏要「长回来」：G2-6 说首页一级都不展开，这里说进课后二级目录要嵌对位置
    const afterEnter = await evaluate(cdp, `({
      curOpen: document.querySelectorAll('#courseTree .k.cur').length,
      sibling: (function () {
        var k = document.querySelector('#courseTree .k.cur');
        var nx = k && k.nextElementSibling;
        return { tag: nx ? nx.tagName + '.' + nx.className : '无', n: nx ? nx.querySelectorAll('a').length : 0 };
      })(),
      tools: document.querySelectorAll('#sideTools a').length,
      toolsTitle: (document.querySelector('#sideTools .side-title') || {}).textContent || '',
    })`)
    // 工具条 = 5 门课本级条目（术语表/公式速查/参数卡/Quiz/未验证清单）
    //        + 1 条跨轨道条目（K01 挂着「配套动手作业：A1」）
    //        + 1 条站点级（这一页怎么来的）= 7。
    // （2026-10 拆轨时去掉了第 6 条课本级条目「讲义」：md 那条轨已退役。）
    check('G2-7', '进入课程后二级目录嵌在该课程下面（10 条），工具条 7 条（含跨轨道的作业入口）并标明属于哪门课',
      afterEnter.curOpen === 1 && afterEnter.sibling.n === 10 &&
      afterEnter.sibling.tag.indexOf('sec-nav') >= 0 &&
      afterEnter.tools === 7 && afterEnter.toolsTitle.indexOf('K01') === 0,
      `展开 ${afterEnter.curOpen} 个 / 兄弟节点 ${afterEnter.sibling.tag}（${afterEnter.sibling.n} 条）/ 工具条 ${afterEnter.tools} 条「${afterEnter.toolsTitle}」`)

    /* ---- 品牌区：点「NLP」方块或文字都回首页 ----
       要求它**就是**一个 <a href="#/">，而不是靠 JS 绑 click：
       只有真链接才自带中键、右键「新标签打开」和键盘 Tab+Enter。 */
    const brand = await evaluate(cdp, `(function(){
      var b = document.querySelector('.brand');
      return { tag: b ? b.tagName : '无', href: b ? (b.getAttribute('href') || '') : '' };
    })()`)
    check('G4-1', '左上角品牌区是指向首页的真链接（不是 JS 绑的假按钮）',
      brand.tag === 'A' && brand.href === '#/', `${brand.tag} href="${brand.href}"`)

    await evaluate(cdp, `document.querySelector('.brand').click()`)
    await sleep(320)
    const brandBack = await evaluate(cdp, `({ hash: location.hash, cards: document.querySelectorAll('#content .course-card').length })`)
    check('G4-2', '点品牌区真的回到首页（课程列表 13 张卡）',
      brandBack.cards === 13 && brandBack.hash.indexOf('#/c/') < 0,
      `${brandBack.hash} / ${brandBack.cards} 张卡`)

    /* ---- 倒三角：点一下收起子目录，再点展开，两次都不跳转 ----
       「收目录」和「进这门课」是两件事，必须分开：
       以前整行只有一个点击行为（跳转），倒三角只是个装饰符号，点了没反应。 */
    await goHash(cdp, '#/c/k01/intuition', `!!document.querySelector('#sec-intuition')`)
    const navBefore = await evaluate(cdp, `({
      hash: location.hash,
      nav: document.querySelectorAll('#secNav a').length,
      caret: (document.querySelector('#courseTree .k.on .caret') || {}).textContent || ''
    })`)
    await evaluate(cdp, `document.querySelector('#courseTree .k.on .caret').click()`)
    await sleep(260)
    const navClosed = await evaluate(cdp, `({
      hash: location.hash,
      nav: document.querySelectorAll('#secNav a').length,
      caret: (document.querySelector('#courseTree .k.on .caret') || {}).textContent || ''
    })`)
    check('G3-1', '点倒三角收起子目录：二级目录消失、箭头变 ▸，且地址一动不动（收目录 ≠ 跳转）',
      navBefore.nav === 10 && navClosed.nav === 0 && navClosed.caret === '▸' &&
      navClosed.hash === navBefore.hash,
      `目录 ${navBefore.nav} → ${navClosed.nav} 条 / ${navBefore.caret} → ${navClosed.caret} / hash ${navClosed.hash === navBefore.hash ? '未变' : '被改到 ' + navClosed.hash}`)

    await evaluate(cdp, `document.querySelector('#courseTree .k.on .caret').click()`)
    await sleep(260)
    const navReopen = await evaluate(cdp, `({
      nav: document.querySelectorAll('#secNav a').length,
      caret: (document.querySelector('#courseTree .k.on .caret') || {}).textContent || ''
    })`)
    check('G3-2', '再点一次重新展开（箭头回到 ▾，10 条段落目录回来）',
      navReopen.nav === 10 && navReopen.caret === '▾',
      `${navReopen.nav} 条 / ${navReopen.caret}`)

    /* 「这一页怎么来的」是**项目全局页**，不属于任何一门课。
       它原来顶着 'CS224N · K01' 的眉标，正文里还写着「10 段式」「K01 试点」。
       判据：眉标与正文里都不许出现任何课程编号，且正文要点明「一个入口装下 N 门课」。 */
    await goHash(cdp, '#/about', `!!document.querySelector('#content .chapter-head')`)
    await sleep(250)
    const about = await evaluate(cdp, `({
      eyebrow: (document.querySelector('#content .chapter-head .eyebrow') || {}).textContent || '',
      text: (document.getElementById('content') || {}).innerText || '',
      curOpen: document.querySelectorAll('#courseTree .k.cur').length,
      topTitle: (document.getElementById('topTitle') || {}).textContent || '',
      topSub: (document.getElementById('topSub') || {}).textContent || '',
      docTitle: document.title,
      progressShown: (function () { var e = document.getElementById('progressWrap'); return e ? getComputedStyle(e).display : 'missing'; })(),
      tools: [].slice.call(document.querySelectorAll('#sideTools a')).map(function (a) { return a.textContent.trim(); }),
      toolsTitle: (document.querySelector('#sideTools .side-title') || {}).textContent || '',
    })`)
    check('G2-8', '「这一页怎么来的」是项目全局页：眉标/顶栏/正文里都没有任何课程编号，左栏不带某课的工具',
      about.eyebrow.indexOf('K0') < 0 && about.eyebrow.indexOf('CS224N') >= 0 &&
      about.text.indexOf('K01') < 0 && about.text.indexOf('词向量') < 0 &&
      about.text.indexOf('courses.js') >= 0 && about.text.indexOf('课程注册表') >= 0 &&
      about.topTitle.indexOf('CS224N') >= 0 && about.topTitle.indexOf('词向量') < 0 &&
      about.docTitle.indexOf('K0') < 0 && about.progressShown === 'none' &&
      about.curOpen === 0 && about.toolsTitle === '' &&
      about.tools.length === 1 && about.tools[0].indexOf('这一页怎么来的') >= 0,
      `眉标「${about.eyebrow}」/ 顶栏「${about.topTitle}」/ 标签页「${about.docTitle}」/ 进度条 ${about.progressShown} / 左侧展开 ${about.curOpen} 门 / 工具条 ${about.tools.length} 条（标题「${about.toolsTitle}」）`)
    shots.push(await screenshot(cdp, path.join(SHOTS, '10-关于页-全站页.png')))

    // 灰卡点了不该有任何反应
    await goHash(cdp, '#/', `document.querySelectorAll('#content .course-card').length === 13`)
    const beforeDead = await evaluate(cdp, `location.hash`)
    await evaluate(cdp, `document.querySelectorAll('#content .course-card.planned')[0].click()`)
    await sleep(300)
    const afterDead = await evaluate(cdp, `location.hash`)
    check('G2-4', '点未开工的灰卡不会跳转（它不是链接）', beforeDead === afterDead,
      `点前 ${beforeDead} → 点后 ${afterDead}`)

    /* 未知地址必须显式报错。以前的兜底是「悄悄回落第一段」—— 地址错了页面看着却完全正常，
       这种错能一直藏着直到有人发现内容不对。多课后路由更长，更容易打错。 */
    await goHash(cdp, '#/c/k99/nope', `true`)
    await sleep(250)
    const unknown = await evaluate(cdp, `({
      hash: location.hash,
      text: (document.getElementById('content') || {}).innerText || '',
      err: document.querySelectorAll('#content .err').length,
    })`)
    check('G2-5', '未知地址显示「没有这个地址」而不是悄悄回落到正文',
      unknown.text.indexOf('没有这个地址') >= 0,
      `${unknown.hash} → ${String(unknown.text).replace(/\s+/g, ' ').slice(0, 60)}`)

    /* 全站页（#/about、未知地址）之后，后面的分组都按「在课程里」继续跑。
       收尾这一步不能省：G2-8 测完停在 #/about，那里没有 #sec-what、
       右栏也不是课程速查，后面的断言会莫名其妙地红。 */
    await goHash(cdp, '#/c/k01/what', `!!document.querySelector('#sec-what')`)
    await sleep(250)

    /* ---------------- G5. 动手作业轨道（A1 标杆） ----------------
       2026-10 拆成两条轨道：知识点（#/c/…）回答「这是什么」，
       动手作业（#/a/…）回答「现在做什么」。这一节把 A1 钉死 ——
       地址前缀、章节骨架、两个预演交互、算法层、Quiz、以及跟 K01 的双向链接。

       为什么值得单独一节：作业页用的是**自己那套骨架**（不叫 what/why/…），
       如果哪里漏了「段骨架必须叫那十个名字」的隐含假设，只有真跑一遍才会暴露。 */
    section('G5. 动手作业轨道：A1 词向量作业（含与 K01 的双向链接）')
    await goHash(cdp, '#/a/a1/what', `!!document.querySelector('#sec-what')`)
    shots.push(await screenshot(cdp, path.join(SHOTS, '13-作业A1-第一段.png'), true))

    const taskBoot = await evaluate(cdp, `({
      hash: location.hash,
      eyebrow: (document.querySelector('#content .chapter-head .eyebrow') || {}).textContent || '',
      lead: (document.querySelector('#content .chapter-head .lead') || {}).textContent || '',
      secs: document.querySelectorAll('#secNav a').length,
      curOpen: document.querySelectorAll('#courseTree .k.cur').length,
      curIsTask: document.querySelectorAll('#courseTree .k.cur.task').length,
      toolsTitle: (document.querySelector('#sideTools .side-title') || {}).textContent || '',
      tools: [].slice.call(document.querySelectorAll('#sideTools a')).map(function (a) { return a.textContent.trim(); }),
      docTitle: document.title,
      topSub: (document.getElementById('topSub') || {}).textContent || '',
    })`)
    check('G5-1', '作业地址前缀是 #/a/（与知识点的 #/c/ 分家），A1 页正常渲染',
      taskBoot.hash.indexOf('#/a/a1/') === 0 && taskBoot.eyebrow.indexOf('A1') >= 0 && taskBoot.secs === 10,
      `${taskBoot.hash} · 眉标「${taskBoot.eyebrow}」· 二级目录 ${taskBoot.secs} 条`)
    check('G5-2', '侧栏里 A1 是当前展开项、带 task 标记，顶栏与工具条都按作业轨道走',
      taskBoot.curOpen === 1 && taskBoot.curIsTask === 1 &&
      taskBoot.toolsTitle.indexOf('A1') === 0 && taskBoot.docTitle.indexOf('A1') >= 0,
      `展开 ${taskBoot.curOpen} / task 标记 ${taskBoot.curIsTask} / 工具标题「${taskBoot.toolsTitle}」/ 标签页「${taskBoot.docTitle}」`)

    /* 双向链接（上行）：作业页必须能回对应的知识点。
       判据放在**工具条第一条**：它是最容易被点到的位置，也是跨轨道关系的唯一入口。 */
    const backLink = taskBoot.tools.filter((t) => t.indexOf('对应知识点') >= 0)
    check('G5-3', 'A1 工具条有「对应知识点：K01 …」（作业 → 知识点 的链接在）',
      backLink.length === 1 && backLink[0].indexOf('K01') >= 0 && backLink[0].indexOf('词向量') >= 0,
      backLink.join(' / ') || '没有这一条')

    /* 双向链接（下行）：知识点页必须能去配套作业。K01 的侧栏工具条里找。 */
    await goHash(cdp, '#/c/k01/what', `!!document.querySelector('#sec-what')`)
    const k01Tools = await evaluate(cdp, `[].slice.call(document.querySelectorAll('#sideTools a')).map(function (a) { return a.textContent.trim(); })`)
    const fwdLink = k01Tools.filter((t) => t.indexOf('配套动手作业') >= 0)
    check('G5-4', 'K01 工具条有「配套动手作业：A1 …」（知识点 → 作业 的链接在）',
      fwdLink.length === 1 && fwdLink[0].indexOf('A1') >= 0 && fwdLink[0].indexOf('词向量作业') >= 0,
      fwdLink.join(' / ') || '没有这一条')

    /* 段末的跨轨道出口：只挂在最后一段，别处不该有。 */
    await goHash(cdp, '#/c/k01/what', `!!document.querySelector('#sec-what')`)
    const noBand = await evaluate(cdp, `document.querySelectorAll('#content .xband').length`)
    await goHash(cdp, '#/c/k01/quiz', `document.querySelectorAll('.quiz .q').length === 14`)
    const bandAtEnd = await evaluate(cdp, `(function(){
      var b = document.querySelectorAll('#content .xband a');
      return { n: b.length, txt: [].slice.call(b).map(function (a) { return a.textContent.replace(/\\s+/g, ' ').trim(); }) };
    })()`)
    check('G5-5', '跨轨道出口只出现在最后一段（K01 第 1 段没有，末段有「A1 …」）',
      noBand === 0 && bandAtEnd.n === 1 && bandAtEnd.txt[0].indexOf('A1') >= 0,
      `第 1 段 ${noBand} 个 / 末段 ${bandAtEnd.n} 个：${bandAtEnd.txt.join(' | ')}`)

    await goHash(cdp, '#/a/a1/checklist', `!!document.querySelector('#sec-checklist')`)
    const backBand = await evaluate(cdp, `(function(){
      var b = document.querySelectorAll('#content .xband a');
      return { n: b.length, txt: [].slice.call(b).map(function (a) { return a.textContent.replace(/\\s+/g, ' ').trim(); }) };
    })()`)
    check('G5-6', 'A1 末段的跨轨道出口指回 K01 复习（作业 → 知识点 的出口在）',
      backBand.n === 1 && backBand.txt[0].indexOf('K01') >= 0 && backBand.txt[0].indexOf('词向量与分布语义') >= 0,
      `${backBand.n} 个：${backBand.txt.join(' | ')}`)

    /* A1 十章逐段：有内容、无错误块。骨架与 K01 完全不同（what/env/bridge/…），
       所以不能复用上面的 SECTION_IDS 循环。 */
    const TASK_SECS = ['what', 'env', 'bridge', 'funcs', 'traps', 'q15', 'part2', 'submit', 'pitfalls', 'checklist']
    const taskSecInfo = {}
    for (const id of TASK_SECS) {
      await goHash(cdp, '#/a/a1/' + id, `!!document.querySelector('#sec-${id}')`)
      const s = await evaluate(cdp, `(function(){
        var sec = document.querySelector('#sec-${id}');
        var hosts = [].slice.call(sec.querySelectorAll('[data-viz]'));
        return {
          title: (document.querySelector('#content h1') || {}).textContent || '',
          blocks: sec.children.length,
          chars: sec.textContent.length,
          vizHosts: hosts.length,
          vizMounted: hosts.filter(function (h) { return h.dataset.mounted === '1' }).length,
          errEls: sec.querySelectorAll('.err').length,
        };
      })()`)
      taskSecInfo[id] = s
      check(`G5s-${id}-1`, `A1 第 ${TASK_SECS.indexOf(id) + 1} 段「${s.title}」内容非空`,
        s.blocks > 2 && s.chars > 300, `${s.blocks} 块 / ${s.chars} 字`)
      check(`G5s-${id}-2`, `A1 第 ${TASK_SECS.indexOf(id) + 1} 段无错误占位块`,
        s.errEls === 0, `.err × ${s.errEls}`)
    }
    const vizSum = TASK_SECS.reduce((a, id) => a + taskSecInfo[id].vizHosts, 0)
    const vizOk = TASK_SECS.every((id) => taskSecInfo[id].vizHosts === taskSecInfo[id].vizMounted)
    check('G5-7', 'A1 全 10 段里刚好 2 个预演交互，且都已挂载（不装环境也能玩）',
      vizSum === 2 && vizOk, `共 ${vizSum} 个宿主 / 全部挂载 ${vizOk}`)

    /* 两个预演交互不在同一段：手算器（a1-cooc）跟着「四个函数」讲共现矩阵那一步，
       错法对照器（a1-wrong）跟着「三个最容易犯的错」。所以每个交互各自导航到它所在的段。
       先把控件全驱动一遍（结构层），再用算法层对账（数值层）。 */
    const A1_VIZ = [{ key: 'a1-cooc', sec: 'funcs' }, { key: 'a1-wrong', sec: 'traps' }]
    const a1VizReports = {}
    for (const { key, sec } of A1_VIZ) {
      await goHash(cdp, `#/a/a1/${sec}`, `document.querySelectorAll('[data-viz="${key}"]').length >= 1`)
      const errBefore = errors.length
      const rep = await evaluate(cdp, `(function () {
        var hosts = [].slice.call(document.querySelectorAll('[data-viz="' + ${JSON.stringify(key)} + '"]'));
        var agg = { found: hosts.length, ranges: 0, selects: 0, buttons: 0, rangeSteps: 0, errs: [], hasBody: false };
        if (!hosts.length) return agg;
        function fire(n, t) { n.dispatchEvent(new Event(t, { bubbles: true })); }
        hosts.forEach(function (host) {
          [].slice.call(host.querySelectorAll('input[type=range]')).forEach(function (r) {
            var min = parseFloat(r.min), max = parseFloat(r.max);
            [min, min + (max - min) / 2, max].forEach(function (v) { r.value = String(v); fire(r, 'input'); agg.rangeSteps++; });
            r.value = String(min); fire(r, 'input');
            agg.ranges++;
          });
          [].slice.call(host.querySelectorAll('select')).forEach(function (s) {
            for (var i = 0; i < s.options.length; i++) { s.selectedIndex = i; fire(s, 'change'); }
            s.selectedIndex = 0; fire(s, 'change');
            agg.selects++;
          });
          // 分段按钮组（错法对照器用它切变体）也是 button，会被下面这一行一起点掉
          [].slice.call(host.querySelectorAll('button')).forEach(function (b) { b.click(); agg.buttons++; });
          agg.errs = agg.errs.concat([].slice.call(host.querySelectorAll('.err')).map(function (e) { return e.textContent; }));
        });
        agg.hasBody = hosts.every(function (h) { return !!h.querySelector('.viz-body') && h.querySelector('.viz-body').children.length > 0; });
        return agg;
      })()`)
      a1VizReports[key] = rep
      check(`G5v-${key}-1`, `[${key}] 预演交互找到并已挂载`, rep.found >= 1, `${rep.found} 个宿主`)
      check(`G5v-${key}-2`, `[${key}] 全部控件可驱动（滑块 ${rep.ranges} / 下拉 ${rep.selects} / 按钮 ${rep.buttons}）且输出区有内容`,
        (rep.ranges + rep.selects + rep.buttons) >= 1 && rep.errs.length === 0 && rep.hasBody === true,
        `${rep.rangeSteps} 次滑块切换 / 错误块 ${rep.errs.length} 个 / 输出区有内容 ${rep.hasBody}`)
      check(`G5v-${key}-3`, `[${key}] 操作过程中无 JS 异常`, errors.length === errBefore, errors.length === errBefore ? '' : `${errors.length - errBefore} 条`)
    }

    /* 错法对照器：红格数必须等于该变体的差异格数 —— 这是「看得见」的那一半。
       静态校验只能证明 matrix() 收到了 bads 参数；这里量的是真渲染出多少个红格。
       而且这几条正好是那个教学点本身：忘了跳过自己 → 整条对角线变红；
       词表没排序 → 36 格变红，可元素和与对称性全对。 */
    const wrongRed = await evaluate(cdp, `(function(){
      var host = document.querySelector('[data-viz="a1-wrong"]');
      var range = host.querySelector('input[type=range]');
      if (range) { range.value = '1'; range.dispatchEvent(new Event('input', { bubbles: true })); }
      function reds() { return host.querySelectorAll('.mx td.bad').length; }
      function diagReds() {
        var t = host.querySelector('.mx');
        if (!t) return -1;
        var rows = [].slice.call(t.querySelectorAll('tr')).slice(1);
        var n = 0;
        rows.forEach(function (tr, i) {
          var tds = [].slice.call(tr.querySelectorAll('td'));
          if (tds[i] && tds[i].classList.contains('bad')) n++;
        });
        return n;
      }
      function click(re, key) {
        var b = [].slice.call(host.querySelectorAll('button')).filter(function (x) { return re.test(x.textContent) })[0];
        if (!b) { out[key] = '按钮没找到'; return; }
        b.click();
        out[key] = reds();
        out[key + 'Diag'] = diagReds();
      }
      var out = {};
      click(/正确实现/, 'correct');
      click(/忘了跳过自己/, 'withSelf');
      click(/词表没排序/, 'badOrder');
      click(/只数右边/, 'rightOnly');
      return out;
    })()`)
    check('G5-14', '错法对照器把差异格**全部**标红，且数量与各变体的差异格数一致（正确实现 0 格）',
      wrongRed.correct === 0 && wrongRed.withSelf === 10 && wrongRed.badOrder === 36 && wrongRed.rightOnly === 12,
      `正确 ${wrongRed.correct} / 忘了跳过自己 ${wrongRed.withSelf} / 词表没排序 ${wrongRed.badOrder} / 只数右边 ${wrongRed.rightOnly}`)
    check('G5-15', '「忘了跳过自己」的红格恰好落在整条对角线上（10 格全在对角）',
      wrongRed.withSelfDiag === 10 && wrongRed.correctDiag === 0,
      `对角红格：withSelf ${wrongRed.withSelfDiag} / correct ${wrongRed.correctDiag}`)

    /* 算法层在浏览器里现算，与 notebook 的 M_test_ans 逐位对账 ——
       这一层是纯函数，放 Node 里也能测（core.test.js 就是这么做的）；
       在浏览器里再测一遍的理由只有一个：确认它在 file:// 下真的被加载进来了。 */
    const a1Core = await evaluate(cdp, `(function(){
      var A = KB.core && KB.core.a1;
      if (!A) return { missing: 1 };
      var m1 = A.cooccurrence(A.TOY_CORPUS, { window: 1 });
      var m4 = A.cooccurrence(A.TOY_CORPUS, { window: 4 });
      var v = A.variants(A.TOY_CORPUS, 1);
      var nb = A.checkAgainstNotebook();
      var ch = KB.chapters.a1;
      var qi = (ch.quiz || []).filter(function (q) { return q.compute; }).length;
      return {
        words: m1.words.join(','), sum1: m1.sum, nz1: m1.nonzero, asym1: m1.maxAsymmetry,
        sum4: m4.sum, nz4: m4.nonzero,
        vN: v.variants.length, correctSum: v.variants[0].sum, correctAsym: v.variants[0].asym,
        badOrderDiff: v.variants.filter(function (x) { return x.key === 'badOrder' })[0].diffCount,
        withSelfDiag: v.variants.filter(function (x) { return x.key === 'withSelf' })[0].diag,
        notebookOk: nb.ok,
        sections: (ch.sections || []).length, quiz: (ch.quiz || []).length,
        glossary: (ch.glossary || []).length, formulas: (ch.formulas || []).length,
        honesty: (ch.honesty || []).length, calcQuiz: qi,
        kind: (KB.courses.filter(function (c) { return c.id === 'a1' })[0] || {}).kind,
        parent: (KB.courses.filter(function (c) { return c.id === 'a1' })[0] || {}).parent,
      };
    })()`)
    check('G5-8', 'a1_core 在浏览器里加载，现算的 toy 共现矩阵与 notebook 的 M_test_ans 逐位一致',
      a1Core.notebookOk === true, `ok=${a1Core.notebookOk} · 词表 ${a1Core.words}`)
    check('G5-9', '手算基准：window=1 元素和 24 / 非零 24 / 完全对称；window=4 元素和 72 / 非零 59',
      a1Core.sum1 === 24 && a1Core.nz1 === 24 && a1Core.asym1 === 0 && a1Core.sum4 === 72 && a1Core.nz4 === 59,
      `w1 和=${a1Core.sum1} 非零=${a1Core.nz1} 不对称=${a1Core.asym1} / w4 和=${a1Core.sum4} 非零=${a1Core.nz4}`)
    check('G5-10', '错法对照器 6 个变体齐全，正确解没被改坏（和=24、不对称=0）',
      a1Core.vN === 6 && a1Core.correctSum === 24 && a1Core.correctAsym === 0,
      `${a1Core.vN} 个变体 / correct 和=${a1Core.correctSum} 不对称=${a1Core.correctAsym}`)
    check('G5-11', '两个"最难发现"的错法数字仍然可复算（badOrder 不改对称性、withSelf 对角线=14）',
      a1Core.badOrderDiff === 36 && a1Core.withSelfDiag === 14,
      `badOrder 错格=${a1Core.badOrderDiff} / withSelf 对角和=${a1Core.withSelfDiag}`)
    check('G5-12', 'A1 内容层齐备（10 段 / 10 题含 1 道数值题 / 13 术语 / 公式 / 诚实清单）且注册表登记正确',
      a1Core.sections === 10 && a1Core.quiz === 10 && a1Core.calcQuiz === 1 &&
      a1Core.glossary === 13 && a1Core.formulas >= 5 && a1Core.honesty >= 5 &&
      a1Core.kind === 'task' && a1Core.parent === 'k01',
      `${a1Core.sections} 段 / ${a1Core.quiz} 题（数值题 ${a1Core.calcQuiz}）/ ${a1Core.glossary} 术语 / ${a1Core.formulas} 公式 / ${a1Core.honesty} 条诚实边界 / kind=${a1Core.kind} parent=${a1Core.parent}`)

    /* A1 的自测题：数值题必须**按 K01 的算法层重算**，不能拿到 k01_core 的数字。
       这曾经是个真 bug —— quiz.js 里写死了 KB.core.k01，A1 的题要么算错要么 TypeError。 */
    await goHash(cdp, '#/a/a1/checklist', `document.querySelectorAll('.quiz .q').length === 10`)
    const a1Quiz = await evaluate(cdp, `(function(){
      var qs = [].slice.call(document.querySelectorAll('.quiz .q'));
      var calc = qs.filter(function (q) { return q.querySelector('.qrow input'); })[0];
      var r = { n: qs.length, hasCalc: !!calc, note: '', actual: '' };
      if (calc) {
        var inp = calc.querySelector('.qrow input');
        inp.value = '24';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        calc.querySelector('.qrow button').click();
        var v = calc.querySelector('.verdict');
        r.note = v ? v.textContent.trim() : '(无判定)';
        r.ok = !!(v && v.className.indexOf(' no') < 0 && v.className.indexOf('ok') >= 0);
        var act = calc.querySelector('.verdict .actual');
        r.actual = act ? act.textContent.trim() : '';
      }
      return r;
    })()`)
    check('G5-13', 'A1 自测页挂出 10 题；数值题按 a1_core 算出 24，填 24 判对（证明没串到 k01_core）',
      a1Quiz.n === 10 && a1Quiz.hasCalc === true && a1Quiz.ok === true && a1Quiz.actual.indexOf('24') === 0,
      `${a1Quiz.n} 题 / 填 24 → ${a1Quiz.note}`)
    shots.push(await screenshot(cdp, path.join(SHOTS, '14-作业A1-自测页.png'), true))

    /* ---------------- H. 主题切换 ---------------- */
    section('H. 深浅色主题切换')
    await goHash(cdp, '#/c/k01/def', `!!document.querySelector('#sec-def')`)
    const t0 = await evaluate(cdp, `(function(){
      var b = document.getElementById('themeBtn');
      return { theme: document.documentElement.getAttribute('data-theme'), label: b.textContent, bg: getComputedStyle(document.body).backgroundColor };
    })()`)
    await evaluate(cdp, `document.getElementById('themeBtn').click()`)
    await sleep(200)
    const t1 = await evaluate(cdp, `(function(){
      var b = document.getElementById('themeBtn');
      return { theme: document.documentElement.getAttribute('data-theme'), label: b.textContent, bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(document.body).color };
    })()`)
    await evaluate(cdp, `document.getElementById('themeBtn').click()`)
    await sleep(200)
    const t2 = await evaluate(cdp, `({ theme: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor })`)

    check('H-1', '点一下切到深色（底色确实变了）', t1.theme === 'dark' && t1.bg !== t0.bg, `${t0.bg} \u2192 ${t1.bg}`)
    check('H-2', '深色下文字是浅色（可读）', t1.fg !== t0.bg && t1.fg !== 'rgb(0, 0, 0)', `color=${t1.fg}`)
    check('H-3', '再点一下切回浅色', t2.theme === 'light' && t2.bg === t0.bg, t2.bg)

    await evaluate(cdp, `document.getElementById('themeBtn').click()`)
    await sleep(250)
    shots.push(await screenshot(cdp, path.join(SHOTS, '05-深色主题.png')))
    await evaluate(cdp, `document.getElementById('themeBtn').click()`)
    await sleep(200)

    /* ---------------- I. 响应式：三种宽度都不横向溢出 ---------------- */
    section('I. 响应式（390 / 768 / 1280 三档都不横向滚动）')
    await goHash(cdp, '#/c/k01/formula', `!!document.querySelector('#sec-formula')`)
    const widthReport = {}
    for (const w of [390, 768, 1280]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 860, deviceScaleFactor: 1, mobile: w < 600 })
      await sleep(400)
      const r = await evaluate(cdp, `(function(){
        var de = document.documentElement;
        // 找出比视口宽的元素的「元凶」，便于定位（SVG 的 className 是 SVGAnimatedString，排除）
        var wide = [].slice.call(document.querySelectorAll('#content *')).filter(function (e) {
          if (e.namespaceURI !== 'http://www.w3.org/1999/xhtml') return false;
          if (e.closest('.tbl-wrap, .mx-wrap, .vec, .math-block, pre, .hl-stage')) return false;
          return e.getBoundingClientRect().width > window.innerWidth + 2;
        }).slice(0, 3).map(function (e) { return e.tagName + '.' + String(e.className).slice(0, 30) });
        return { sw: de.scrollWidth, iw: window.innerWidth, wide: wide };
      })()`)
      widthReport[w] = r
      // 严格判据：整页 scrollWidth 不得超过视口（宽表格/长公式有自己的内层滚动容器，不计入）
      check(`I-${w}`, `${w}px 宽度下整页不横向滚动`, r.sw <= r.iw + 2, `scrollWidth ${r.sw} / viewport ${r.iw}${r.wide.length ? '（越界元素: ' + r.wide.join(', ') + '）' : ''}`)
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    await sleep(400)
    shots.push(await screenshot(cdp, path.join(SHOTS, '06-手机宽度-390.png'), true))
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    await sleep(300)

    /* ---------------- I2. 交互面板的宽度与条形渲染 ----------------
     * 两条都是「静态校验全绿、页面却是坏的」那一类：
     *   · 面板宽度：CSS 值合法、元素存在、结构正确 —— 但被正文的 780px 卡着；
     *   · 填充条：元素存在、class 正确、style 里有 width:100% —— 但 <i> 是行内元素，
     *     行内元素的 width/height 一律无效，于是 52 条全部渲染成 0×0。
     * 所以这两条必须由**浏览器量实际盒子**来钉，且必须在宽屏下量
     * （1280 时中间栏本就没有余量，出血量为 0 是正确行为）。 */
    section('I2. 交互面板：宽屏下比正文宽 + 条形填充条真的占据空间')
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
    await sleep(320)
    await goHash(cdp, '#/c/k01/viz', `!!document.querySelector('#sec-viz')`)
    await sleep(400)
    const wideViz = await evaluate(cdp, `(function(){
      var viz = document.querySelector('#content .viz');
      var read = document.querySelector('#content p');
      var side = document.getElementById('sidebar');
      var toc = document.getElementById('toc');
      var bf = document.querySelector('#content .bf');
      var vr = viz.getBoundingClientRect(), rr = read.getBoundingClientRect();
      var sr = side.getBoundingClientRect(), tr = toc.getBoundingClientRect();
      var fr = bf.getBoundingClientRect(), cs = getComputedStyle(bf);
      return {
        vizW: Math.round(vr.width), vizL: Math.round(vr.left), vizR: Math.round(vr.right),
        readW: Math.round(rr.width),
        sideR: Math.round(sr.right), tocL: Math.round(tr.left),
        bfN: document.querySelectorAll('#content .bf').length,
        bfDisplay: cs.display, bfW: Math.round(fr.width), bfH: Math.round(fr.height),
        bfStyled: (bf.getAttribute('style') || '')
      };
    })()`)
    check('I2-1', '1600px 宽屏下交互面板比正文宽（不再被正文行宽卡住）',
      wideViz.vizW >= wideViz.readW + 150,
      `交互 ${wideViz.vizW}px / 正文 ${wideViz.readW}px（多 ${wideViz.vizW - wideViz.readW}px）`)
    check('I2-2', '出血不越界：面板没有压到左侧目录或右侧速查栏',
      wideViz.vizL >= wideViz.sideR && wideViz.vizR <= wideViz.tocL,
      `面板 ${wideViz.vizL}..${wideViz.vizR} / 侧栏右边界 ${wideViz.sideR} / 速查左边界 ${wideViz.tocL}`)
    check('I2-3', '条形填充条真的占据空间（display:block 且宽高 > 0，不是 0×0 空盒子）',
      wideViz.bfN > 0 && wideViz.bfDisplay === 'block' && wideViz.bfW > 20 && wideViz.bfH > 5,
      `${wideViz.bfN} 条 · display=${wideViz.bfDisplay} · ${wideViz.bfW}×${wideViz.bfH} · style="${wideViz.bfStyled}"`)
    /* 留一张宽屏存档：面板宽度和填充条这两件事，只看断言文字不如看一眼截图 */
    await evaluate(cdp, `(function(){ var b = document.querySelectorAll('#content .bars'); if (b.length) b[0].scrollIntoView({ block: 'center' }); })()`)
    await sleep(340)
    shots.push(await screenshot(cdp, path.join(SHOTS, '12-宽屏-交互面板与条形.png')))
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    await sleep(340)
    /* 1280 是主流笔记本宽度，也是**最可能什么变化都看不出来**的一档：
       中间栏本来就被 780px 的正文填满了。所以这里单独钉一条 ——
       出血量的下限是「吃回正文的左右 padding」，正好宽出 68px。
       若哪天有人把这个下限改回 0，这条会红。 */
    const midViz = await evaluate(cdp, `(function(){
      var viz = document.querySelector('#content .viz');
      var read = document.querySelector('#content p');
      var vr = viz.getBoundingClientRect(), rr = read.getBoundingClientRect();
      var sr = document.getElementById('sidebar').getBoundingClientRect();
      var tr = document.getElementById('toc').getBoundingClientRect();
      return {
        vizW: Math.round(vr.width), readW: Math.round(rr.width),
        vizL: Math.round(vr.left), vizR: Math.round(vr.right),
        sideR: Math.round(sr.right), tocL: Math.round(tr.left)
      };
    })()`)
    check('I2-4', '1280px 下也宽出约 68px（吃回正文左右 padding），且不越界',
      midViz.vizW >= midViz.readW + 60 && midViz.vizL >= midViz.sideR && midViz.vizR <= midViz.tocL,
      `交互 ${midViz.vizW}px / 正文 ${midViz.readW}px / 边界 ${midViz.vizL}..${midViz.vizR}（侧栏 ${midViz.sideR}、速查 ${midViz.tocL}）`)

    /* ---------------- J. 断网重载 ---------------- */
    section('J. 断网也能用（模拟离线后整页重载）')
    const reqBefore = requests.length
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
    await navigate(cdp, INDEX_URL + '?offline=1')
    /* 首屏现在是课程列表（文本短、也没有公式），所以「离线后内容照常渲染」
       必须进到课里再验 —— 否则这两条断言测的是首页，等于没测内容层。 */
    await goHash(cdp, '#/c/k01/formula', `!!document.querySelector('#sec-formula')`)
    const off = await evaluate(cdp, `({
      ready: !!document.querySelector('#content .chapter-head'),
      chars: document.getElementById('content').textContent.length,
      katex: document.querySelectorAll('.katex').length,
      errEls: document.querySelectorAll('#content .err').length,
      online: navigator.onLine,
    })`)
    check('J-1', '浏览器确实处于离线态', off.online === false, `navigator.onLine=${off.online}`)
    check('J-2', '离线重载后整页照常渲染', off.ready && off.chars > 500 && off.errEls === 0, `正文 ${off.chars} 字`)
    check('J-3', '离线时 KaTeX 公式仍然渲染', off.katex > 0, `${off.katex} 个`)

    // 离线态下切到 Quiz，验证 localStorage 里的作答被恢复
    await goHash(cdp, '#/c/k01/quiz', `document.querySelectorAll('.quiz .q').length === 14`)
    const restored = await evaluate(cdp, `({
      score: (document.querySelector('.quiz-score b') || {}).textContent || '',
      lockedChoice: [].slice.call(document.querySelectorAll('.quiz .q')).filter(function (c) {
        var v = c.querySelector('.verdict');
        return !!c.querySelector('.opt.right') || (v && v.className.indexOf(' no') >= 0);
      }).length,
      explains: document.querySelectorAll('.quiz .explain').length,
    })`)
    check('J-4', '重载后 Quiz 作答记录从 localStorage 恢复（分数与重载前一致）', restored.score.trim() === scoreBeforeReload && restored.lockedChoice >= 12, `重载前 ${scoreBeforeReload} → 重载后 ${restored.score.trim()} / 已判定 ${restored.lockedChoice} 题 / 解析 ${restored.explains} 段`)

    shots.push(await screenshot(cdp, path.join(SHOTS, '07-断网重载-Quiz已恢复.png'), true))

    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await sleep(200)

    /* ---------------- K. 零外部请求 ---------------- */
    section('K. 资源审计：一个外部请求都没有')
    const byScheme = {}
    const ext = []
    requests.forEach((u) => {
      const s = (u.match(/^([a-z][a-z0-9+.-]*):/i) || [])[1] || 'unknown'
      byScheme[s] = (byScheme[s] || 0) + 1
      if (s !== 'file' && s !== 'blob' && s !== 'data') ext.push(u)
    })
    notes.push({ 资源请求总数: requests.length, 按协议: byScheme, 外部请求: ext })
    check('K-1', `确实加载了本地资源（反向对照：若网络事件没收到，K-2 会空转）`, requests.length > 15, `${requests.length} 个请求，本页新增 ${requests.length - reqBefore} 个`)
    check('K-2', '所有请求都是 file://，没有任何 http(s) 外链', ext.length === 0 && (byScheme.file || 0) > 0, Object.entries(byScheme).map(([k, v]) => `${k}:${v}`).join(' ') + (ext.length ? ' 外链=' + ext.slice(0, 3).join(',') : ''))

    /* ---------------- L. 错误收集器的正向对照 ---------------- */
    section('L. 检查项校验：错误收集器真的能收到错（正向对照）')
    // 反向对照：如果收集器坏了、恒返回空数组，前面所有「无 JS 异常」都会假通过。
    // 这里主动制造一个异常，确认收集器抓得到。
    const beforeControl = errors.length
    await cdp.send('Runtime.evaluate', { expression: `setTimeout(function(){ throw new Error('__SMOKE_POSITIVE_CONTROL__'); }, 0)` })
    await sleep(600)
    const caught = errors.length > beforeControl && errors.some((e) => /__SMOKE_POSITIVE_CONTROL__/.test(e.text))
    check('L-1', '错误收集器能捕获到真实 JS 异常（否则前面所有"无异常"断言都是空转）', caught, `捕获 ${errors.length - beforeControl} 条`)

    const realErrors = errors.filter((e) => !/__SMOKE_POSITIVE_CONTROL__/.test(e.text))
    check('L-2', `全流程没有真实 JS 异常 / console.error`, realErrors.length === 0, realErrors.slice(0, 3).map((e) => e.kind + ': ' + e.text.slice(0, 90)).join(' || ') || '0 条')

    /* ---------------- 结果汇总 ---------------- */
    const failed = summary()

    const report = {
      生成时间: new Date().toISOString(),
      页面: INDEX_URL,
      浏览器: exe,
      断言: { 总数: results.length, 失败: failed.length, 预期总数: EXPECT_TOTAL || null },
      失败项: failed.map((f) => ({ id: f.id, desc: f.desc, detail: f.detail })),
      真实错误: realErrors,
      资源审计: notes,
      各段统计: secInfo,
      交互统计: vizReports,
      宽度: widthReport,
      截图: shots,
    }
    writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8')

    console.log(`\n报告：${path.relative(process.cwd(), REPORT)}`)
    console.log(`截图：${path.relative(process.cwd(), SHOTS)}/（${shots.length} 张）`)
    if (failed.length === 0) {
      console.log('\n冒烟测试通过：双击 index.html 可用，断网可用；K01 十段 / 11 个交互 / 6 组公式高亮 / 3 个先猜后对 / 14 道 Quiz，A1 十段 / 2 个预演交互 / 10 道 Quiz 全部可操作，两条轨道互通。')
    }
    process.exitCode = failed.length ? 1 : 0
  } catch (e) {
    console.error(`\n冒烟测试中断：${e.message}`)
    console.error(e.stack)
    process.exitCode = 2
  } finally {
    cdp.close()
    proc.kill()
    await sleep(200)
    try { rmSync(profile, { recursive: true, force: true }) } catch { /* 回收站/占用都可能失败，不影响结论 */ }
  }
}

main()
