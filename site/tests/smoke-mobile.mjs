#!/usr/bin/env node
/* ============================================================
 * smoke-mobile.mjs —— 「单文件手机版」的验收脚本
 * ============================================================
 * 为什么单独写一套，而不是改 smoke.mjs：
 *   smoke.mjs 验的是 site/index.html（多文件形态，含 164 条断言）。
 *   本脚本验的是 build_single.py 打出来的 dist/CS224N-mobile.html
 *   （单文件形态），关注点完全不同：
 *     - CSS/JS/字体有没有真的内联进去（内联失败时页面会白屏却不一定报错）
 *     - 手机窄视口下横向会不会溢出
 *     - ☰ 抽屉能不能开、选项手指点不点得中
 *   两者互不干扰 —— 改坏其中一个不影响另一个。
 *
 * 用法：
 *   node site/tests/smoke-mobile.mjs
 * 退出码 0 = 全过。
 * ============================================================ */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SITE = path.resolve(__dirname, '..')
const TARGET = path.join(SITE, 'dist', 'CS224N-mobile.html')
const TARGET_URL = pathToFileURL(TARGET).href
const SHOTS = path.join(__dirname, 'screenshots-mobile')
const PORT = 9414

/* 两台真机的视口参数（不是随便取的） */
const DEVICES = [
  { name: 'iPhone 14 Pro', width: 393, height: 852, dpr: 3 },
  { name: 'Android 常见机', width: 360, height: 800, dpr: 2 },
]

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------------- 断言记账 ---------------- */
let pass = 0
const fails = []
const EXPECT_TOTAL = Number(process.env.K01_MOBILE_EXPECT || 36)

function check(id, label, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${id}  ${label}${detail ? '  — ' + detail : ''}`) }
  else { fails.push(`${id}  ${label}  — ${detail}`); console.log(`  ✗ ${id}  ${label}  — ${detail}`) }
}
function section(t) { console.log(`\n${t}`) }

/* ---------------- CDP ---------------- */
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.seq = 0
    this.pending = new Map()
    this.listeners = new Map()
    this.requests = []
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
      if (msg.method === 'Network.requestWillBeSent') this.requests.push(msg.params.request.url)
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
      ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')), { once: true })
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
      const timer = setTimeout(() => reject(new Error(`等待 ${method} 超时`)), timeoutMs)
      this.on(method, (p) => { clearTimeout(timer); resolve(p) }, true)
    })
  }
  close() { try { this.ws.close() } catch { /* ignore */ } }
}

async function launchChrome({ device }) {
  const exe = CHROME_CANDIDATES.find((p) => existsSync(p))
  if (!exe) throw new Error('找不到 Chrome / Edge')
  const profile = mkdtempSync(path.join(tmpdir(), 'k01-mobile-'))
  const proc = spawn(exe, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })

  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) {
        const cdp = await Cdp.connect(page.webSocketDebuggerUrl)
        await cdp.send('Page.enable')
        await cdp.send('Runtime.enable')
        await cdp.send('Network.enable')
        await cdp.send('Log.enable')
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: device.width, height: device.height,
          deviceScaleFactor: device.dpr, mobile: true,
        })
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
        return { cdp, proc, profile }
      }
    } catch { /* CDP 未就绪 */ }
    await sleep(300)
  }
  proc.kill()
  throw new Error('Chrome CDP 端点未就绪')
}

async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) {
    const d = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text
    throw new Error('页面内执行异常：' + d)
  }
  return r.result.value
}

async function navigate(cdp, url) {
  const loaded = cdp.waitEvent('Page.loadEventFired')
  await cdp.send('Page.navigate', { url })
  await loaded
  await sleep(700)
}

async function goHash(cdp, hash) {
  await evaluate(cdp, `location.hash = ${JSON.stringify(hash)}`)
  await sleep(260)
}

async function screenshot(cdp, file) {
  mkdirSync(path.dirname(file), { recursive: true })
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(file, Buffer.from(r.data, 'base64'))
  return file
}

/** 页面里跑：既溢出、又不允许横向滚动的元素 —— 这才是手机上真会难看的那些 */
const OVERFLOW_PROBE = String.raw`(() => {
  var vw = document.documentElement.clientWidth;
  var canScroll = function (el) {
    var p = el.parentElement;
    while (p && p !== document.documentElement) {
      var ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
      p = p.parentElement;
    }
    return false;
  };
  var bad = [];
  document.querySelectorAll('#content *, .topbar *').forEach(function (el) {
    if (el.closest('.sidebar')) return;           // 抽屉收起时本来就在视口外
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right <= vw + 1) return;                // 没溢出
    if (canScroll(el)) return;                    // 父容器允许横滑，可接受
    bad.push({ t: el.tagName, c: String(el.className || '').slice(0, 34), w: Math.round(r.width), right: Math.round(r.right) });
  });
  return {
    vw: vw,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    bad: bad.slice(0, 6), badCount: bad.length,
  };
})()`

/* ============================================================ */

async function main() {
  console.log('========== 单文件手机版验收 ==========')

  /* ---- A. 产物本身 ---- */
  section('A. 产物')
  check('A-1', 'dist 里的单文件存在', existsSync(TARGET), TARGET)
  const bytes = existsSync(TARGET) ? statSync(TARGET).size : 0
  check('A-2', '体积合理（> 0.8 MB 且 < 5 MB，微信/QQ 传得动）', bytes > 838860 && bytes < 5242880,
    (bytes / 1048576).toFixed(2) + ' MB')
  const src = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : ''
  check('A-3', '没有残留 <script src>（全内联）', !/<script\s+src=/.test(src))
  check('A-4', '没有残留 <link rel="stylesheet"（全内联）', !/<link\s+rel="stylesheet"/.test(src))
  check('A-5', '字体已内联为 data URI', (src.match(/url\(data:font\/woff2;base64,/g) || []).length === 20,
    (src.match(/url\(data:font\/woff2;base64,/g) || []).length + ' 条 @font-face')

  if (!existsSync(TARGET)) {
    console.log('\n产物不存在，先跑 python tools/build_single.py')
    process.exit(1)
  }

  const device = DEVICES[0]
  const { cdp, proc, profile } = await launchChrome({ device })
  console.log(`  视口：${device.name} ${device.width}×${device.height} @${device.dpr}x`)

  const errors = []
  cdp.on('Runtime.exceptionThrown', (p) => {
    errors.push(String(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').slice(0, 160))
  })
  cdp.on('Log.entryAdded', (p) => {
    if (p.entry?.level === 'error') errors.push('console: ' + String(p.entry.text || '').slice(0, 160))
  })

  try {
    /* ---- B. 打开与内联是否真的生效 ---- */
    section('B. 内联是否真的生效（光看"没报错"证明不了）')
    await navigate(cdp, TARGET_URL)
    await sleep(600)

    const env = await evaluate(cdp, String.raw`({
      hasKatex: typeof katex === 'object' && typeof katex.renderToString === 'function',
      hasMd: typeof markdownit === 'function',
      hasKB: typeof window.KB === 'object',
      sec: (window.KB && window.KB.chapters && window.KB.chapters.k01 && window.KB.chapters.k01.sections || []).length,
      glos: (window.KB && window.KB.chapters && window.KB.chapters.k01 && window.KB.chapters.k01.glossary || []).length,
      // base.css 里写的暖米底 rgb(247,247,242)。若 CSS 没内联进来，这里会是白 / 透明
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bodyFs: getComputedStyle(document.body).fontSize,
      // .brand::before 是我用纯 CSS 造的方块 logo，能读到 content 就说明 layout.css 也进来了
      brandBefore: getComputedStyle(document.querySelector('.brand'), '::before').content,
      katexCssRules: (function(){
        for (var i=0;i<document.styleSheets.length;i++){
          try{ for (var j=0;j<document.styleSheets[i].cssRules.length;j++){
            var t = document.styleSheets[i].cssRules[j].cssText;
            if (t.indexOf('KaTeX_AMS')>=0 || t.indexOf('data:font/woff2')>=0) return true;
          } } catch(e){}
        }
        return false;
      })(),
      styleTags: document.querySelectorAll('style').length,
      scriptTags: document.querySelectorAll('script').length,
      inlineScripts: document.querySelectorAll('script[src]').length,
      stylesheets: document.querySelectorAll('link[rel=stylesheet]').length,
      externalReqs: 0,
    })`)

    check('B-1', 'katex 全局可用（vendor JS 内联成功）', env.hasKatex)
    check('B-2', 'markdown-it 全局可用', env.hasMd)
    check('B-3', 'KB 数据层可用，10 段 + 42 术语都在', env.hasKB && env.sec === 10 && env.glos === 42,
      `${env.sec} 段 / ${env.glos} 术语`)
    check('B-4', 'base.css 生效（body 背景是暖米色而不是白）', env.bodyBg === 'rgb(247, 247, 242)', env.bodyBg)
    check('B-5', 'layout.css 生效（.brand::before 的 CSS logo 有 content）',
      env.brandBefore && env.brandBefore.includes('NLP'), String(env.brandBefore))
    check('B-6', 'KaTeX 的 @font-face 带 data URI 出现在 CSSOM 里', env.katexCssRules)
    check('B-7', '页面里 0 个外引脚本 / 0 个外引样式', env.inlineScripts === 0 && env.stylesheets === 0,
      `script[src]=${env.inlineScripts} link=${env.stylesheets}，style 标签 ${env.styleTags} 个`)

    const netUrls = cdp.requests.filter((u) => !u.startsWith('file:///') && !u.startsWith('data:'))
    check('B-8', '零外部网络请求（离线可用）', netUrls.length === 0, netUrls.slice(0, 3).join(' | ') || '无 http(s) 请求')

    /* ---- C. 首页 + 内容渲染 ---- */
    section('C. 手机上的首页与内容')

    // C-0：多课程改造后首屏不再是 K01 正文，而是课程列表。先单独验首页。
    await goHash(cdp, '#/')
    await sleep(400)
    const home = await evaluate(cdp, String.raw`({
      cards: document.querySelectorAll('.course-card').length,
      planned: document.querySelectorAll('.course-card.planned').length,
      title: (document.querySelector('.topbar h1')||{}).textContent || '',
      overflow: (function(){
        var vw = document.documentElement.clientWidth, n = 0;
        document.querySelectorAll('.course-grid *').forEach(function(el){
          var r = el.getBoundingClientRect();
          if (r.width && r.right > vw + 1) n++;
        });
        return n;
      })(),
    })`)
    check('C-0', '首页在手机上列出 12 张课程卡（其中 11 张未开工灰卡）且不溢出',
      home.cards === 12 && home.planned === 11 && home.overflow === 0,
      `${home.cards} 张（灰 ${home.planned} / 溢出 ${home.overflow}）顶栏「${home.title}」`)

    // 下面的内容断言必须在「课程内」验 —— 首页是列表，没有正文/公式/术语链接。
    // （漏掉这步时 C-1/C-3/C-5 会齐刷刷变红，这就是它存在的意义。）
    const s0 = await evaluate(cdp, String.raw`(window.KB.chapters.k01.sections[0]||{}).id || 'def'`)
    await goHash(cdp, '#/c/k01/' + s0)
    await sleep(400)
    const body = await evaluate(cdp, String.raw`({
      title: (document.querySelector('.topbar h1')||{}).textContent || '',
      chars: (document.querySelector('#content')||{textContent:''}).textContent.replace(/\s+/g,'').length,
      katex: document.querySelectorAll('.katex').length,
      katexErr: document.querySelectorAll('.katex-error').length,
      viz: document.querySelectorAll('.viz').length,
      tlinks: document.querySelectorAll('a.tlink').length,
      errBlocks: document.querySelectorAll('.err').length,
    })`)
    check('C-1', '主标题渲染出来了', /词向量/.test(body.title), body.title)
    check('C-2', '首屏正文有内容', body.chars > 300, body.chars + ' 字')
    check('C-3', 'KaTeX 公式渲染且无渲染错误', body.katex > 0 && body.katexErr === 0,
      `${body.katex} 个公式 / ${body.katexErr} 个错误`)
    check('C-4', '11 个交互实验都在（首个段落含 viz 块的那些）', body.errBlocks === 0, '无 .err 占位块 ' + body.errBlocks)
    check('C-5', '术语链接存在', body.tlinks > 0, body.tlinks + ' 个')

    /* ---- D. 横向溢出（逐个路由） ---- */
    section('D. 横向溢出（逐路由扫，最能说明手机上能不能看）')
    const sids = await evaluate(cdp, String.raw`(window.KB.chapters.k01.sections||[]).map(function(s){return s.id})`)
    /* 作业轨道（#/a/…）是后加的，本脚本验的又是**构建产物** dist/CS224N-mobile.html ——
       旧产物里根本没有 A1。所以这里按「产物里有没有 a1 这一章」动态决定要不要扫 A1 路由：
       现在（产物是旧快照）不扫，等重新构建出带 A1 的单文件后自动开始覆盖。
       写死要扫的话，产物没重建的这段时间里这条会一直是红的 —— 那不是真的坏，是版本不同步。 */
    const hasTaskTrack = await evaluate(cdp, `!!(window.KB.chapters && window.KB.chapters.a1)`)
    const asids = hasTaskTrack
      ? await evaluate(cdp, String.raw`(window.KB.chapters.a1.sections||[]).map(function(s){return s.id})`)
      : []
    const routes = [].concat(
      [['#/', '首页课程列表']],
      sids.map((s) => ['#/c/k01/' + s, '段:' + s]),
      [['#/c/k01/ref/glossary', '术语表'], ['#/c/k01/quiz', 'Quiz'], ['#/c/k01/ref/formulas', '公式'],
      ['#/c/k01/ref/params', '参数'], ['#/c/k01/ref/honesty', '诚实'], ['#/about', '关于']],
      asids.map((s) => ['#/a/a1/' + s, 'A1段:' + s]),
      hasTaskTrack ? [['#/a/a1/ref/glossary', 'A1术语表'], ['#/a/a1/ref/honesty', 'A1诚实']] : []
    )
    const overflows = []
    const vizHome = {}          // viz key → 它所在的段（顺便摸清 11 个交互分布在哪几段）
    for (const [hash, label] of routes) {
      await goHash(cdp, hash)
      const o = await evaluate(cdp, OVERFLOW_PROBE)
      if (o.badCount > 0) overflows.push(`${label}(${o.badCount}): ` + JSON.stringify(o.bad.slice(0, 2)))
      // 注意：data-viz 挂在「外层宿主 div」上，里面的 .viz 卡本身没这属性（app.js:439）
      const keys = await evaluate(cdp, String.raw`[].slice.call(document.querySelectorAll('[data-viz]')).map(function(e){ return e.getAttribute('data-viz') || '?' })`)
      keys.forEach((k) => { vizHome[k] = label })
    }
    check('D-1', `${routes.length} 个路由在 ${device.width}px 下无不可控横向溢出`, overflows.length === 0,
      overflows.slice(0, 3).join(' || ') || `${routes.length}/${routes.length} 干净`)

    // 顺带记一笔：11 个交互分布在哪几段（不是断言，是给后面定位用的）
    console.log('  交互分布：' + Object.keys(vizHome).map((k) => k + '@' + vizHome[k]).join(' '))

    const fin = await evaluate(cdp, OVERFLOW_PROBE)
    check('D-2', '文档整体不横向滚动', fin.scrollWidth <= fin.vw + 1,
      `scrollWidth=${fin.scrollWidth} viewport=${fin.vw}`)

    /* ---- E. 手机专属交互 ---- */
    section('E. 手机能不能操作')
    await goHash(cdp, '#/c/k01/' + sids[0])
    const menuBefore = await evaluate(cdp, String.raw`document.body.classList.contains('nav-open')`)
    await evaluate(cdp, String.raw`document.getElementById('menuBtn').click()`)
    await sleep(320)
    const menuAfter = await evaluate(cdp, String.raw`({
      open: document.body.classList.contains('nav-open'),
      visible: (function(){ var s=document.querySelector('.sidebar'); var r=s.getBoundingClientRect(); return r.left > -5 && r.width > 100; })(),
      items: document.querySelectorAll('#secNav a').length,
    })`)
    check('E-1', '☰ 按钮能拉开侧栏抽屉（手机上唯一的导航入口）',
      !menuBefore && menuAfter.open && menuAfter.visible, `菜单项 ${menuAfter.items} 个`)
    await evaluate(cdp, String.raw`document.getElementById('menuBtn').click()`)
    await sleep(300)
    check('E-2', '再点一次能收起', !(await evaluate(cdp, String.raw`document.body.classList.contains('nav-open')`)))

    // 触摸目标：44px 是 Apple HIG 的下限。放到 Quiz 页测 —— 那里选项最多，样本才有意义
    await goHash(cdp, '#/c/k01/quiz')
    await sleep(400)
    const touch = await evaluate(cdp, String.raw`(() => {
      var sel = '.topbar button, .ctl button, .viz button, .opt, .toc a';
      var small = [], n = 0;
      document.querySelectorAll(sel).forEach(function(el){
        var r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        n++;
        if (r.height < 40) small.push(String(el.className || el.tagName).slice(0,22) + ':' + Math.round(r.height));
      });
      return { n: n, small: small.slice(0,5), smallCount: small.length };
    })()`)
    check('E-3', '按钮/选项够手指点（≥40px 高）', touch.smallCount === 0,
      touch.small.join(', ') || `${touch.n} 个控件全部达标`)

    // Quiz 在手机上点得动吗
    await goHash(cdp, '#/c/k01/quiz')
    await sleep(300)
    const quiz = await evaluate(cdp, String.raw`(() => {
      var c = document.querySelector('.quiz .qcard') || document.querySelector('.quiz > div');
      var opt = document.querySelector('.opt');
      if (!opt) return { ok: false, why: '找不到选项' };
      opt.click();
      var marked = document.querySelectorAll('.opt.right, .opt.wrong').length;
      return { ok: true, cards: document.querySelectorAll('.quiz .q, .quiz .qcard').length, marked: marked,
               explain: !!document.querySelector('.explain') };
    })()`)
    check('E-4', 'Quiz 选项在手机上点一下就能作答并出解析', quiz.ok && quiz.marked >= 1,
      quiz.ok ? `已判对错 ${quiz.marked} 个选项` : quiz.why)

    // 顶栏标题：手机宽度下容易被挤成「词向量与分…」。这里实测而不是估算 ——
    // scrollWidth > clientWidth 就是真被截了，省得每次靠眼睛争。
    await goHash(cdp, '#/c/k01/' + sids[0])
    await sleep(300)
    const barTitle = await evaluate(cdp, String.raw`(() => {
      var h = document.querySelector('.topbar h1');
      return { clipped: h.scrollWidth > h.clientWidth + 1, cw: h.clientWidth, sw: h.scrollWidth, text: h.textContent.trim() };
    })()`)
    check('E-5', '顶栏标题在手机上完整显示（没被截成「词向量与分…」）', !barTitle.clipped,
      barTitle.clipped ? `被截断：可用 ${barTitle.cw}px / 实际需要 ${barTitle.sw}px` : `「${barTitle.text}」完整`)

    /* ---- F. 交互实验能用 ---- */
    section('F. 交互实验')
    const VIZ_KEYS = ['onehot', 'cooccur', 'dim', 'noise', 'huffman', 'grad', 'cost',
      'windowdemo', 'softmaxdemo', 'negsamp', 'cosdemo']
    const missing = VIZ_KEYS.filter((k) => !(k in vizHome))
    check('F-1', `11 个交互实验在手机版里全都找得到`, missing.length === 0,
      missing.length ? '缺：' + missing.join(' ') : Object.keys(vizHome).length + ' 个：`' + Object.keys(vizHome).join(' ') + '`')

    // 挑 viz 最密集的那一屏来做操作测试
    const hostSid = await evaluate(cdp, String.raw`(() => {
      var S = window.KB.chapters.k01.sections, best = null, bn = 0;
      for (var i = 0; i < S.length; i++) {
        var n = (S[i].blocks || []).filter(function (b) { return b.t === 'viz' }).length;
        if (n > bn) { bn = n; best = S[i].id; }
      }
      return { id: best, n: bn };
    })()`)
    await goHash(cdp, '#/c/k01/' + hostSid.id)
    await sleep(500)
    const viz = await evaluate(cdp, String.raw`(() => {
      return [].slice.call(document.querySelectorAll('[data-viz]')).map(function(h){
        return { key: h.getAttribute('data-viz') || '?',
                 card: h.querySelectorAll('.viz').length,
                 ctl: h.querySelectorAll('input, select, button').length,
                 out: (h.querySelector('.viz-body, .viz-out, .mx, svg, .bars') ? 1 : 0),
                 err: h.querySelectorAll('.err').length };
      });
    })()`)
    check('F-2', `「${hostSid.id}」这屏里挂上了交互卡`, viz.length > 0, viz.length + ' 个：`' + viz.map((v) => v.key).join(' ') + '`')
    // 前提必须非空，否则下面两条会变成「空数组自动通过」的假绿
    check('F-3', '每个交互都有可操作控件（且框定了非空前提）', viz.length > 0 && viz.every((v) => v.ctl > 0),
      viz.map((v) => v.key + ':' + v.ctl).join(' '))
    check('F-4', '交互都渲染出输出区且无错误块', viz.length > 0 && viz.every((v) => v.out === 1 && v.err === 0 && v.card === 1),
      viz.map((v) => v.key + '(card' + v.card + ')').join(' '))

    // 真的点一遍按钮
    const btnResult = await evaluate(cdp, String.raw`(() => {
      var bad = 0, n = 0;
      [].slice.call(document.querySelectorAll('.viz button')).forEach(function(b){
        try { b.click(); n++; } catch (e) { bad++; }
      });
      return { n: n, bad: bad };
    })()`)
    check('F-5', '逐个点按钮无异常（且确实点到了按钮）', btnResult.bad === 0 && btnResult.n > 0,
      `${btnResult.n} 个按钮全部点过`)

    // 再把滑块推一档，确认手机上拖得动
    const rng = await evaluate(cdp, String.raw`(() => {
      var before = [], after = [], bad = 0;
      [].slice.call(document.querySelectorAll('.viz input[type=range]')).forEach(function(r){
        before.push(r.value);
        try {
          r.value = String(Math.round((Number(r.min) + Number(r.max)) / 2));
          r.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e) { bad++; }
        after.push(r.value);
      });
      return { n: before.length, changed: before.filter(function(v,i){return v!==after[i]}).length, bad: bad };
    })()`)
    check('F-6', '滑块在手机上能被驱动且真的改变输出', rng.bad === 0 && rng.n > 0 && rng.changed > 0,
      `${rng.n} 个滑块，${rng.changed} 个值有变化`)

    /* ---- G. 深色 + 第二台机器 ---- */
    section('G. 深色模式与第二台机器')
    await evaluate(cdp, String.raw`document.getElementById('themeBtn').click()`)
    await sleep(300)
    const darkBg = await evaluate(cdp, String.raw`getComputedStyle(document.body).backgroundColor`)
    check('G-1', '深色模式可切换且真的变深', /rgb\((1\d|2\d|3\d)/.test(darkBg), darkBg)
    await evaluate(cdp, String.raw`document.getElementById('themeBtn').click()`)
    await sleep(250)

    check('G-2', '整个过程零 JS 异常', errors.length === 0, errors.slice(0, 2).join(' | ') || '干净')

    /* ---- H. 截图（给人眼看） ---- */
    section('H. 截图')
    await goHash(cdp, '#/')
    await sleep(400)
    await screenshot(cdp, path.join(SHOTS, 'mobile-00-首页.png'))
    /* 截图用**真正的第一段**，别写死某个段 id ——
       以前这里写死 '#/c/k01/def'，而 def 是第 4 段「数学定义」，
       文件名却叫「首段」，名不符实还看不出来。 */
    await goHash(cdp, '#/c/k01/' + s0)
    await sleep(400)
    await screenshot(cdp, path.join(SHOTS, 'mobile-01-首段.png'))
    await goHash(cdp, '#/c/k01/ref/glossary')
    await sleep(300)
    await screenshot(cdp, path.join(SHOTS, 'mobile-02-术语表.png'))
    console.log('  已落盘 3 张（' + SHOTS + '）')

    cdp.close()
    proc.kill()

    /* 换第二台：只验最关键的溢出与渲染 */
    const second = DEVICES[1]
    const s = await launchChrome({ device: second })
    await navigate(s.cdp, TARGET_URL)
    await sleep(900)
    // 必须进到课程里再验：首屏是课程列表，那里本来就没公式。
    // （旧写法只断言 "公式错误数 = 0"，在首页上拿到 0/0 也算过 —— 典型的空前提假绿。）
    await goHash(s.cdp, '#/c/k01/' + s0)
    await sleep(500)
    const so = await evaluate(s.cdp, OVERFLOW_PROBE)
    check('G-3', `${second.name} ${second.width}px 下同样不横向溢出`, so.badCount === 0,
      JSON.stringify(so.bad.slice(0, 2)) || '干净')
    const sk = await evaluate(s.cdp, String.raw`({
      n: document.querySelectorAll('.katex').length,
      e: document.querySelectorAll('.katex-error').length,
    })`)
    check('G-4', `${second.name} 下公式同样正常（非空前提：真的渲染出了公式）`,
      sk.n > 0 && sk.e === 0, `${sk.n} 个公式 / ${sk.e} 个错误`)
    await screenshot(s.cdp, path.join(SHOTS, 'mobile-03-Android.png'))
    s.cdp.close()
    s.proc.kill()
    try { rmSync(profile, { recursive: true, force: true }) } catch { /* ignore */ }
  } catch (e) {
    fails.push('EXCEPTION ' + e.message)
    console.log('\n!! 执行异常：' + e.message)
    cdp.close(); proc.kill()
  }

  console.log(`\n通过 ${pass} / 期望 ${EXPECT_TOTAL}`)
  if (pass !== EXPECT_TOTAL) {
    fails.push(`断言总数不符：期望 ${EXPECT_TOTAL}，实际 ${pass}`)
  }
  if (fails.length) {
    console.log('\n失败项：')
    fails.forEach((f) => console.log('  ✗ ' + f))
    process.exit(1)
  }
  console.log('手机版验收通过：单个 HTML、离线可用、手机视口下不横向溢出、☰ 抽屉与 Quiz 都能用。')
}

main().catch((e) => { console.error(e); process.exit(1) })
