/* ============================================================
 * app.js —— 路由、页面渲染、块渲染器、进度、主题
 * ------------------------------------------------------------
 * 约束（手册里的技术坑）：
 *  - 不用 fetch、不用 ES module（双击 index.html 从 file:// 打开会被拦）
 *  - 内容全部走 <script> 预先加载好的 window.KB
 * ============================================================ */
(function (global) {
  'use strict';
  var KB = global.KB = global.KB || {};
  var el = KB.dom.el, clear = KB.dom.clear;

  /* ---------------- 当前课程 ----------------
   * 以前这里写的是：var CHAPTER = KB.chapters.k01;
   * 一个模块级常量 —— 于是整个 app.js 都活在「世界只有一门课」的假设里，
   * 所有遵循单课心智的代码路径从这里一路泄漏到文件末尾（2026-10-07 实测 34 处引用）。
   *
   * 改为：CURR 是「当前课程 id」，由 parseHash() 决定；CH() 是取当前课数据的唯一入口。
   * 不要在模块顶层缓存 CH() 的返回值 —— 那等于把这个假设又请回来了。
   */
  var CURR = (KB.firstReadyCourse && KB.firstReadyCourse()) || 'k01';
  function CH() { return KB.chapters[CURR]; }

  /** 某个课号的显示名（'k01' → 'K01'）。从注册表查 —— 以前 'K01' 写死在 8 处页面标题里。 */
  function courseNoOf(cid) {
    var c = courseById(cid);
    return (c && c.no) || String(cid || '').toUpperCase();
  }
  function courseNo() { return courseNoOf(CURR); }

  /* ---------------- 两条轨道 ----------------
   * 「知识点」（K01–K12）回答"这是什么"，「动手作业」（A1–A4）回答"现在做什么"。
   * 注册表里没写 kind 的按知识点处理 —— 这样 K02 以后照抄 K01 的写法，不用补字段。 */
  /** 按 id 取注册表条目（没有就 null）。kindOf / parentOf 都建在它上面。 */
  function courseById(cid) {
    var list = KB.courses || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === cid) return list[i];
    return null;
  }
  function kindOf(cid) {
    var c = courseById(cid);
    return (c && c.kind) || 'topic';
  }
  /** 作业页对应的知识点 id（'a1' → 'k01'）；知识点页没有 parent，返回 '' */
  function parentOf(cid) {
    var c = courseById(cid);
    return (c && c.parent) || '';
  }
  /** 某个知识点下挂了哪些作业（'k01' → ['a1']）。双向链接的反向那半靠它。 */
  function tasksOf(cid) {
    return (KB.courses || []).filter(function (c) {
      return (c.kind || 'topic') === 'task' && c.parent === cid;
    });
  }
  /** 注册表条目 → 一个能落地的地址。取它的第一段（没做过的课退回列表里第一门） */
  function landingOf(cid) {
    var ch = KB.chapters[cid];
    if (!ch || !ch.sections || !ch.sections.length) return '';
    return rootOf(cid) + '/' + cid + '/' + ch.sections[0].id;
  }
  /** 作业的地址前缀是 a，知识点是 c —— 两条轨道在地址栏里就分家 */
  function rootOf(cid) { return kindOf(cid) === 'task' ? 'a' : 'c'; }
  var VISIT = 'cs224n.site.visit.v1';
  var THEME = 'cs224n.site.theme.v1';

  /* ---------------- 术语链接索引 ----------------
   * 需求：正文里出现的术语名 → 点一下跳到「术语表」对应条目。
   * 做法：**渲染完成后在 DOM 层遍历文本节点**做替换，而不是在 HTML 字符串上跑正则 ——
   *       这样 <code> / <a> / KaTeX / 交互区 / Quiz 都能安全避开（字符串层做不到）。
   * 去重：同一页里同一个术语只链第一次出现，否则满屏下划线看不清。
   */
  var TERM_BAN = {};   // 自动提取偶尔会产出太泛的别名，在这里排除

  /** 从一个术语名推出它在正文里的几种写法 */
  function aliasesOf(name) {
    var out = [name], paren = [];
    var base = name.replace(/[（(]([^）)]*)[）)]/g, function (_, g) { paren.push(g.trim()); return ' '; }).trim();
    paren.forEach(function (x) { if (x) out.push(x); });
    var toks = base.split(/\s*[\/／]\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
    toks.forEach(function (x) { out.push(x); });
    toks.concat([base]).forEach(function (x) {
      // 去掉尾部 " 空格 + 拉丁/希腊字母" 片段：窗口大小 m → 窗口大小、奇异值 σ → 奇异值
      var t = x.replace(/[\s]+[A-Za-z\u0370-\u03ff][A-Za-z0-9\u0370-\u03ff′'^_{}()\[\]]*$/, '').trim();
      if (t && t !== x && t.length >= 3) out.push(t);   // 去尾产物要求 ≥3 字符，避免"层次"这类过泛词
    });
    return out;
  }

  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function buildTerms(chapter) {
    var gl = (chapter && chapter.glossary) || [];
    var list = [], seen = {};
    gl.forEach(function (g, i) {
      aliasesOf(String(g[0]).replace(/`/g, '')).forEach(function (a) {
        a = a.trim();
        if (a.length < 2 || seen[a] || TERM_BAN[a]) return;   // 单字母（U(w) 里的 w）必然误匹配
        seen[a] = 1; list.push({ t: a, i: i });
      });
    });
    // 长别名优先，否则 "层次 softmax" 会被 "softmax" 抢先吃掉
    list.sort(function (a, b) { return b.t.length - a.t.length; });
    var map = {};
    list.forEach(function (x) { if (!(x.t in map)) map[x.t] = x.i; });
    var src = list.length ? list.map(function (x) {
      var e = escapeRe(x.t);
      // 纯英文/数字别名加词边界，避免在别的单词里命中（softmax 不会被 "softmaxes" 之类误伤）
      return /^[A-Za-z0-9][A-Za-z0-9 ._+-]*$/.test(x.t) ? '\\b' + e + '\\b' : e;
    }).join('|') : '(?!)';
    return {
      map: map, src: src, re: new RegExp(src, 'g'), n: list.length,
      names: gl.map(function (g) { return String(g[0]).replace(/`/g, ''); })
    };
  }

  /* 按课程缓存 —— 每门课有自己的术语表，索引不能共用。
     以前这里是模块加载时跑一次的 IIFE：多课后第二门课会一直拿第一门的术语去说话，
     而且链接会指向第一门课的术语表。 */
  var TERMS_CACHE = {};
  function TERMS() {
    if (!TERMS_CACHE[CURR]) TERMS_CACHE[CURR] = buildTerms(CH());
    return TERMS_CACHE[CURR];
  }

  function glosHref(i) { return courseRef('glossary', i); }

  /** 这些元素及其子树一律不碰 */
  function termSkip(e) {
    var n = e.nodeName;
    if (n === 'A' || n === 'CODE' || n === 'BUTTON' || n === 'SCRIPT' || n === 'STYLE' ||
        n === 'TEXTAREA' || n === 'INPUT' || n === 'SELECT' || n === 'OPTION') return true;
    var cl = e.classList;
    if (cl && (cl.contains('katex') || cl.contains('tlink') || cl.contains('g') ||
               cl.contains('quiz') || cl.contains('quiz-score'))) return true;
    if (e.hasAttribute('data-viz') || e.hasAttribute('data-nolink')) return true;
    return false;
  }

  /** 把一个文本节点里的术语名换成 <a class="tlink"> */
  function linkOneText(tn, used, selfIdx) {
    var text = tn.nodeValue, last = 0, m, frag = null, n = 0;
    TERMS().re.lastIndex = 0;
    while ((m = TERMS().re.exec(text))) {
      var hit = m[0], i = TERMS().map[hit];
      if (i == null || i === selfIdx || used['t' + i]) continue;
      used['t' + i] = 1;
      if (!frag) frag = document.createDocumentFragment();
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = document.createElement('a');
      a.className = 'tlink';
      a.setAttribute('href', glosHref(i));
      a.setAttribute('title', '术语表：' + TERMS().names[i]);
      a.textContent = hit;
      frag.appendChild(a);
      last = m.index + hit.length;
      n++;
    }
    if (frag) {
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      tn.parentNode.replaceChild(frag, tn);
    }
    return n;
  }

  /**
   * 给容器里的术语加链接。
   * @param used     跨块去重表（正文整页共用一个）；不传则本容器独立去重
   * @param selfIdx  当前条目下标 —— 术语表里不链自己
   */
  function linkTerms(root, used, selfIdx) {
    if (!root || !TERMS().n) return 0;
    used = used || {};
    var nodes = [];
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { if (/\S/.test(c.nodeValue)) nodes.push(c); }
        else if (c.nodeType === 1 && !termSkip(c)) walk(c);
      }
    })(root);
    var hits = 0;
    nodes.forEach(function (tn) { hits += linkOneText(tn, used, selfIdx); });

    // 第二遍：<code>xxx</code> 整块恰好等于术语名 → 把整个 code 包进链接
    // （比在 code 内部插 <a> 好看，也保证 code 的等宽底色完整）
    Array.prototype.forEach.call(root.querySelectorAll('code'), function (cd) {
      if (cd.parentNode && cd.parentNode.nodeName === 'PRE') return;   // 代码块不动
      if (cd.querySelector('a')) return;
      var txt = cd.textContent.trim();
      if (!txt || txt !== cd.textContent) return;
      var i = TERMS().map[txt];
      if (i == null || i === selfIdx || used['t' + i]) return;
      used['t' + i] = 1;
      var a = document.createElement('a');
      a.className = 'tlink';
      a.setAttribute('href', glosHref(i));
      a.setAttribute('title', '术语表：' + TERMS().names[i]);
      cd.parentNode.insertBefore(a, cd);
      a.appendChild(cd);
      hits++;
    });
    return hits;
  }

  /* ---------------- 进度 ---------------- */
  function loadVisit() {
    try { return JSON.parse(localStorage.getItem(VISIT) || '{}'); } catch (e) { return {}; }
  }
  function saveVisit(v) {
    try { localStorage.setItem(VISIT, JSON.stringify(v)); } catch (e) { }
  }
  function markVisited(secId) {
    var v = loadVisit();
    v[CH().id] = v[CH().id] || {};
    if (!v[CH().id][secId]) {
      v[CH().id][secId] = 1;
      saveVisit(v);
      updateProgress();
      renderCourseTree();   // 二级目录里那个「· 已读」记号在这一层
    }
  }
  function visitedCountFor(cid) {
    var v = loadVisit();
    return Object.keys((v[cid]) || {}).length;
  }
  function visitedCount() { return visitedCountFor(CURR); }

  /* ---------------- 主题 ---------------- */
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME); } catch (e) { }
    setTheme(saved || 'light');
  }
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME, t); } catch (e) { }
    var b = document.getElementById('themeBtn');
    if (b) b.textContent = t === 'dark' ? '☀ 浅色' : '☾ 深色';
  }

  /* ---------------- 骨架 ---------------- */
  var $side = null, $tools = null, $main = null, $content = null, $toc = null, $progressBar = null;

  function buildShell() {
    $side = document.getElementById('sidebar');
    $tools = document.getElementById('sideTools');
    $main = document.getElementById('main');
    $content = document.getElementById('content');
    $toc = document.getElementById('toc');
    $progressBar = document.getElementById('progressBar');
    renderCourseTree();
    renderTools();
    updateProgress();
    document.getElementById('themeBtn').addEventListener('click', function () {
      setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
    document.getElementById('menuBtn').addEventListener('click', function () {
      document.body.classList.toggle('nav-open');
    });
    document.addEventListener('click', function (e) {
      if (document.body.classList.contains('nav-open') && !$side.contains(e.target) && !e.target.closest('#menuBtn')) {
        document.body.classList.remove('nav-open');
      }
    });
    window.addEventListener('hashchange', route);
  }

  /* 左侧两级目录：一级是课程，二级是**当前那门课**的段落。
     段落必须挂在它自己所属的课程下面（缩进 + 左侧竖线），
     不能平铺在整个课程清单之后 —— 那样看起来像「第 13 门课」，也看不出这些段落属于谁。 */
  /* 被手动收起的那门课的 id（null = 没收起任何课）。
     默认行为是「进了哪门课就展开哪门课」，用户点倒三角可以把它临时关掉。
     只存「收起」这一个状态而不是存一整张 cid→bool 表，是因为
     只有**当前正在读的那门课**才允许被收起 —— 见 routeInner 里的清理。 */
  var navCollapsed = null;

  function renderCourseTree() {
    var host = document.getElementById('courseTree');
    clear(host);
    /* 遍历数据层的课程注册表，而不是在这里写字面量数组。
       那份 12 行数组若硬编码在渲染代码里，「做完了 K02」就得回 UI 代码改 false → true。
       现在 ready 与否由 KB.chapters[id] 是否存在自动判定 —— 做完一门就自动点亮。

       2026-10：注册表分成「知识点」与「动手作业」两条轨道，侧栏跟着分两段。
       作业不是"第 13 门课"，平铺在知识点里会让人以为它只是又一个知识点。 */
    var openCourse = isCourseRoute() ? CURR : '';
    var list = KB.courses || [];

    function rowFor(c) {
      var ready = KB.courseReady(c.id);
      /* 路由说「当前这门课要展开」，用户点过倒三角则可以把它关掉。 */
      var open = (c.id === openCourse) && (c.id !== navCollapsed);
      /* 三角只在「有内容的课」上出现。没开工的课没有二级目录，
         给它画一个 ▸ 会让人以为点开就有东西。 */
      var caret = el('span', {
        class: 'caret',
        text: ready ? (open ? '▾' : '▸') : '',
        title: ready ? (open ? '收起这一页的目录' : '展开这一页的目录') : null
      });
      if (ready) {
        caret.addEventListener('click', function (e) {
          /* 别让这次点击冒泡到行上 —— 行上的处理是「进入这一页」，
             不停的话收起的同一次点击会顺手跳转，看起来就像根本收不起来。 */
          e.stopPropagation();
          navCollapsed = open ? c.id : null;
          renderCourseTree();
        });
      }
      var row = el('div', {
        class: 'k' + (ready ? ' on' : '') + (open ? ' cur' : '') + (kindOf(c.id) === 'task' ? ' task' : ''),
        /* tooltip 里给完整课名 —— 侧栏只有 268px，长课名会被省略号截掉，
           悬停要能看全。状态说明也一并放进去。 */
        title: c.no + ' ' + c.title + '（' + c.tags + '）· ' + (ready
          ? (open ? '正在读这一页，下面展开的是它的目录' : '打开这一页')
          : '还没开工：只有元数据，没有加载内容数据')
      },
        caret,
        el('b', { text: c.no }),
        el('span', { class: 'ttl', text: c.title }),
        /* 侧栏窄，把 "Lecture 12–13" 缩成 "Lec 12–13"，省下的宽度留给课名
           —— 课名被截掉比标签被缩写更糟。首页的卡片地方大，那边用原文。 */
        el('span', { class: 'tag', text: c.tags.replace(/^Lecture\s*/, 'Lec ') }));
      if (ready) {
        row.addEventListener('click', function () {
          /* 主动进这一页 → 一定是展开的（收起状态下点行是进页面，不是展开）。 */
          navCollapsed = null;
          location.hash = courseSec(c.id, KB.chapters[c.id].sections[0].id);
        });
      }
      host.appendChild(row);
      if (open) host.appendChild(secNavFor(c.id));
    }

    [['topic', '知识点'], ['task', '动手作业']].forEach(function (g) {
      var arr = list.filter(function (c) { return kindOf(c.id) === g[0]; });
      if (!arr.length) return;
      host.appendChild(el('div', { class: 'side-title side-grp', text: g[1] }));
      arr.forEach(rowFor);
    });
  }

  /** 二级目录：某一门课的段落清单。只在它所属课程展开时被调用。 */
  function secNavFor(cid) {
    var ul = el('ul', { class: 'sec-nav', id: 'secNav' });
    var v = loadVisit()[cid] || {};
    KB.chapters[cid].sections.forEach(function (s) {
      var a = el('a', { class: (currentRoute.page === s.id ? 'active' : '') },
        el('span', { class: 'n', text: String(s.num) }),
        el('span', { text: s.title + (v[s.id] ? '  ·' : '') }));
      a.addEventListener('click', function () { location.hash = courseSec(cid, s.id); });
      ul.appendChild(el('li', {}, a));
    });
    return ul;
  }

  /* 工具条。标题里的条数从当前课程现取 —— 写死「术语表（42 条）」那种数字，
     换一门课就是错的，而且错得很隐蔽：数字看起来很具体，没人会怀疑它是硬编码的。
     首页上这些条目全是「某门课的」，没有课程就一条都不该出现（只留站点级的关于页）。 */
  /** 自测页地址：哪一段挂了 quizset 块就去哪一段。
   *  K01 把它单独放在第 10 段（段 id 就叫 quiz），A1 挂在最后一段（checklist）——
   *  两处的段骨架本来就不同，所以不能写死 'quiz'：那样 A1 的自测入口会 404。 */
  function quizSecId() {
    var ch = CH();
    if (!ch || !ch.sections) return 'quiz';
    for (var i = 0; i < ch.sections.length; i++) {
      var bl = ch.sections[i].blocks || [];
      for (var j = 0; j < bl.length; j++) if (bl[j].t === 'quizset') return ch.sections[i].id;
    }
    return 'quiz';
  }

  function toolDefs(onHome) {
    var out = [];
    if (!onHome) {
      var ch = CH() || {};
      /* 跨轨道的那一条排最前 —— 它是这一页最该被点走的下一步：
         作业页往上找「我该先读哪门课」，知识点页往下找「读完拿什么练手」。 */
      var pid = parentOf(CURR);
      if (pid) {
        var pc = courseById(pid);
        if (pc && landingOf(pid)) {
          out.push(['#/' + landingOf(pid),
            '对应知识点：' + pc.no + ' ' + pc.title]);
        }
      }
      tasksOf(CURR).forEach(function (t) {
        if (landingOf(t.id)) {
          out.push(['#/' + landingOf(t.id), '配套动手作业：' + t.no + ' ' + t.title]);
        }
      });
      out.push([courseRef('glossary'), '术语表（' + (ch.glossary || []).length + ' 条）']);
      out.push([courseRef('formulas'), '公式速查（' + (ch.formulas || []).length + ' 条）']);
      out.push([courseRef('params'), '参数与复杂度卡']);
      out.push([courseSec(CURR, quizSecId()), 'Quiz（' + (ch.quiz || []).length + ' 题）']);
      out.push([courseRef('honesty'), '未验证清单']);
    }
    out.push(['#/about', '这一页怎么来的']);
    return out;
  }

  function renderTools() {
    clear($tools);
    /* 工具条里的每一条（术语表 / 公式速查 / Quiz / 诚实清单）都属于**某一门课**。
       所以只有「在课程里」时才显示它们 + 分组标题；首页、关于页、走错页都只留站点级的条目。
       判据是「是不是课程路由」，不是「是不是首页」—— 否则关于页会挂着 K01 的工具条。 */
    var inCourse = isCourseRoute();
    if (inCourse) $tools.appendChild(el('div', { class: 'side-title', text: courseNo() + ' · 工具' }));
    toolDefs(!inCourse).forEach(function (t) {
      var key = t[0].replace(/^#\//, '');
      var a = el('a', { class: (currentRoute.raw === key ? 'active' : ''), text: t[1] });
      a.addEventListener('click', function () { location.hash = t[0]; });
      $tools.appendChild(a);
    });
  }

  /** 当前地址是不是「某一门课里」（正文段或 ref/ 专业页都算） */
  function isCourseRoute() {
    return currentRoute.name === 'course' && !!KB.chapters[currentRoute.course];
  }

  /* 顶栏。课程的标题由当前课程现取 —— 写死在 index.html 里的话，
     只有一门课时看不出来，多课后点进第二门课会继续显示第一门的标题和进度。
     页面形态有三种：首页（课程列表）/ 课程内 / 其它全站页（关于、走错）——
     只按「是不是首页」二分的话，关于页会掉进「课程内」分支、顶着当前课程的标题。 */
  function renderTopbar() {
    var t = document.getElementById('topTitle');
    var sub = document.getElementById('topSub');
    var pw = document.getElementById('progressWrap');
    var isHome = currentRoute.name === 'home';
    var inCourse = isCourseRoute();
    var ch = KB.chapters[CURR];
    var nc = (KB.courses || []).length;
    /* body 上打个页面形态的记号。侧栏/顶栏的差异现在都由 JS 直接渲染，
       这个类不再承担布局职责 —— 它的用处是给「当前是不是首页」留一个可断言的抓手
       （smoke 的 A-12 就靠它确认顶栏走的是哪条分支）。 */
    document.body.classList.toggle('route-home', isHome);
    if (t) t.textContent = isHome ? '全部内容' : (inCourse ? (ch ? ch.title : '') : 'CS224N 交互复习站');
    var nTopic = (KB.courses || []).filter(function (c) { return kindOf(c.id) === 'topic'; }).length;
    var nTask = (KB.courses || []).filter(function (c) { return kindOf(c.id) === 'task'; }).length;
    if (sub) {
      sub.textContent = isHome
        ? '离线可用 · 断网双击 index.html 即可 · ' + nTopic + ' 个知识点 · ' + nTask + ' 份动手作业'
        : (inCourse
          ? '离线可用 · 共 ' + ((ch && ch.sections) ? ch.sections.length : 0) + ' 段 · 交互与自测同页'
          : '离线可用 · 一个入口装下 ' + nTopic + ' 个知识点与 ' + nTask + ' 份动手作业');
    }
    // 进度条只在课程内有意义 —— 别的时候留着只会显示上一门课的数字
    if (pw) pw.style.display = inCourse ? '' : 'none';
    // 品牌副标题也现取：写死「K01 试点」时课程一多就名不副实。
    // 也别写太长 —— 侧栏只有 268px，长了会把标题挤到折行。
    var bs = document.getElementById('brandSub');
    if (bs) bs.textContent = 'K01 试点 · ' + nTopic + ' 课 + ' + nTask + ' 作业';
    // 标签页标题跟着当前地址走：首页 / 课程内 / 全站页三种形态各一个标题
    document.title = isHome
      ? 'CS224N 交互复习站 · 全部内容'
      : (inCourse
        ? 'CS224N · ' + courseNo() + ' ' + ((ch && ch.title) || '') + ' · 交互复习站'
        : 'CS224N 交互复习站');
    updateProgress();
  }

  function updateProgress() {
    var n = visitedCount(), total = CH().sections.length;
    $progressBar.style.width = (n / total * 100) + '%';
    document.getElementById('progressText').textContent = n + '/' + total + ' 节';
  }

  /* ---------------- 路由 ----------------
   * 2026-10-07：从「只有 k01」泛化成多课。地址约定：
   *   #/                                首页（课程列表）
   *   #/c/<课id>/<段id>                 某课的一段
   *   #/c/<课id>/ref/glossary[/<i>]     术语表（可定位到第 i 条）
   *   #/c/<课id>/ref/formulas           公式速查
   *   #/c/<课id>/ref/params             参数与形状
   *   #/c/<课id>/ref/honesty            诚实清单
   *   #/about                           全站关于页
   *
   * 专业页为什么要挂 ref/ 前缀，而不是 #/c/k01/glossary：
   *   段 id 由各课自己起，和专业页名字放同一个命名空间迟早撞车 —— K01 第 10 段就叫
   *   quiz、第 5 段叫 formula，而专业页叫 formulas，**只差一个字母**。
   *   加 ref/ 让两个命名空间彻底不相交，将来任何一门课起名叫 glossary 也不会出事。
   */
  /* ---------------- 地址构造 ----------------
   * 全站只有这两个函数能产生地址。前缀直接写在渲染代码里的话，改地址格式要逐个找出来改
   * —— 而这块渲染代码有几十处、还分散在 app.js / quiz.js / viz 里。
   * 要改地址，只动这一段；漏掉的会在两套 smoke 里立刻变红。
   */
  function courseSec(cid, sid) {
    var id = cid || CURR;
    return '#/' + rootOf(id) + '/' + id + '/' + sid;
  }
  function courseRef(page, arg) {
    return '#/' + rootOf(CURR) + '/' + CURR + '/ref/' + page + (arg ? '/' + arg : '');
  }

  var currentRoute = { name: 'home', raw: '' };

  function parseHash() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    if (!h) return { name: 'home', raw: '' };
    var seg = h.split('/').filter(Boolean);
    /* 'c' = 知识点轨道，'a' = 动手作业轨道。'about' 不会被误判：它只有一段，seg[1] 是 undefined。 */
    if ((seg[0] === 'c' || seg[0] === 'a') && seg[1]) {
      var rest = seg.slice(2);
      var r = { name: 'course', raw: h, course: seg[1], ref: false, page: '', arg: '', extra: '' };
      if (rest[0] === 'ref') {
        r.ref = true;
        r.page = rest[1] || '';
        r.arg = rest[2] || '';
        r.extra = rest[3] || '';
      } else {
        r.page = rest[0] || '';
      }
      return r;
    }
    if (seg[0] === 'about') return { name: 'about', raw: h };
    return { name: 'unknown', raw: h };
  }

  function route() {
    try {
      routeInner();
    } catch (e) {
      /* 渲染异常不能白屏 —— 以前页面会静默停在半渲染状态，看到的人分不清
         是这一页内容本来就少，还是崩了。现在把栈直接打在页面上：人和断言都一眼能看见。 */
      clear($content);
      $content.appendChild(el('div', { class: 'err' },
        el('b', { text: '渲染出错：' + (e && e.message ? e.message : String(e)) }),
        el('pre', { class: 'mini', text: (e && e.stack) || '' })));
      if (global.console && console.error) console.error(e);
    }
  }

  function routeInner() {
    var r = currentRoute = parseHash();
    // 当前课程：地址里那门能用就用，否则退回第一门已开工的课
    CURR = (r.course && KB.chapters[r.course]) ? r.course : KB.firstReadyCourse();
    document.body.classList.remove('nav-open');
    renderTopbar();
    /* 「我手动收起了目录」只对**当前这门课**有意义：
       一旦离开它（回首页、去关于页、进另一门课），这条收起状态就作废 ——
       否则首页和关于页的侧栏会挂着一门课的段落目录，看起来像「你还在那门课里」。
       （这条清理不是可选的：删掉它，smoke 的 G2-6 / G2-8 立刻红。） */
    if (!isCourseRoute() || CURR !== navCollapsed) navCollapsed = null;
    /* 课程树现在依赖 currentRoute（当前那门课要展开二级目录），所以每次路由都要重画 */
    renderCourseTree();
    renderTools();
    if (r.name === 'home') renderHome();
    else if (r.name === 'about') renderAbout();
    else if (r.name === 'course') renderCourseRoute(r);
    else renderUnknown(r.raw);
    window.scrollTo(0, 0);
  }

  /** 课程内的分发：段 与 ref/ 专业页是两个命名空间，互不遮挡 */
  function renderCourseRoute(r) {
    if (!KB.chapters[r.course]) return renderUnknown(r.raw);
    if (r.ref) {
      if (r.page === 'glossary') return renderGlossary(r.arg);
      if (r.page === 'formulas') return renderFormulas();
      if (r.page === 'params') return renderParams();
      if (r.page === 'honesty') return renderHonesty();
      return renderUnknown(r.raw);
    }
    if (secById(r.page)) return renderSection(r.page);
    return renderUnknown(r.raw);
  }

  /* 未知地址：显式报错，而不是悄悄回落到第一段。
     以前 route() 的兜底是 renderSection(第一段) —— 地址打错时页面看起来完全正常，
     于是错误会一直藏到有人发现内容不对为止。多课后路由表更大，这个兜底更危险。 */
  function renderUnknown(raw) {
    clear($content);
    $content.appendChild(pageHead('走错了', '没有这个地址',
      '站点里没有 <code>#' + KB.md.escapeHtml(raw) + '</code> 这个位置。'));
    var card = el('div', { class: 'card' });
    card.appendChild(el('p', { html:
      '课程的正文段在 <code>#/c/&lt;课id&gt;/&lt;段id&gt;</code>，' +
      '术语表之类的专项页挂在 <code>#/c/&lt;课id&gt;/ref/…</code> 下。' }));
    card.appendChild(el('p', {}, el('a', { class: 'tlink', href: '#/', text: '← 回到课程列表' })));
    $content.appendChild(card);
    renderRightRail(null);
  }

  /* ---------------- 首页：课程列表 ---------------- */
  function courseCard(c) {
    var ch = KB.chapters[c.id];
    if (!ch) {
      return el('div', { class: 'course-card planned' + (kindOf(c.id) === 'task' ? ' task' : '') },
        el('div', { class: 'cc-no', text: c.no }),
        el('h3', { text: c.title }),
        el('div', { class: 'cc-tags', text: c.tags }),
        el('div', { class: 'cc-note', text: '未开工' }));
    }
    var secs = (ch.sections || []).length;
    var done = visitedCountFor(c.id);
    var card = el('div', { class: 'course-card' + (kindOf(c.id) === 'task' ? ' task' : '') },
      el('div', { class: 'cc-no', text: c.no }),
      el('h3', { text: c.title }),
      el('div', { class: 'cc-tags', text: c.tags }),
      el('div', { class: 'cc-stats' },
        el('span', { text: secs + ' 段' }),
        el('span', { text: (ch.glossary || []).length + ' 术语' }),
        el('span', { text: (ch.quiz || []).length + ' 题 Quiz' }),
        el('span', { text: (ch.vizKeys || []).length + ' 个交互' })),
      el('div', { class: 'cc-bar' },
        el('i', { style: 'width:' + (secs ? (done / secs * 100) : 0) + '%' })),
      el('div', { class: 'cc-done', text: done + '/' + secs + ' 节已读' }));
    card.addEventListener('click', function () {
      location.hash = courseSec(c.id, (ch.sections[0] || {}).id);
    });
    return card;
  }

  function renderHome() {
    clear($content);
    var list = KB.courses || [];
    var topics = list.filter(function (c) { return kindOf(c.id) === 'topic'; });
    var tasks = list.filter(function (c) { return kindOf(c.id) === 'task'; });
    var readyN = list.filter(function (c) { return KB.courseReady(c.id); }).length;
    $content.appendChild(pageHead('CS224N · ' + topics.length + ' 个知识点 + ' + tasks.length + ' 个作业', '全部内容',
      '已开工 <b>' + readyN + '</b> / 共 ' + list.length + ' 个。' +
      '每一页都自洽：正文、公式、交互、自测全在同一页，不需要另找讲义。'));

    /* 两条轨道分两区。分区标题只在那一区非空时出现 —— 一个空标题比没有标题更让人困惑。 */
    function block(title, sub, arr) {
      if (!arr.length) return;
      $content.appendChild(el('div', { class: 'home-sec' },
        el('h2', { text: title }),
        el('span', { text: sub })));
      var grid = el('div', { class: 'course-grid' });
      arr.forEach(function (c) { grid.appendChild(courseCard(c)); });
      $content.appendChild(grid);
    }
    block('知识点', '先读这些：概念、公式、直觉，配可动手的实验', topics);
    block('动手作业', '读完对应知识点之后做 —— 每份都带「不装环境也能预演」的交互', tasks);
    renderRightRail(null);
  }

  /* ---------------- 渲染：章节 ---------------- */
  function secById(id) {
    for (var i = 0; i < CH().sections.length; i++) if (CH().sections[i].id === id) return CH().sections[i];
    return null;
  }

  function renderSection(secId) {
    var s = secById(secId) || CH().sections[0];
    var idx = CH().sections.indexOf(s);
    clear($content);

    var head = el('div', { class: 'chapter-head' },
      el('div', { class: 'eyebrow', text: 'CS224N · ' + courseNo() + ' · 第 ' + s.num + ' 段 / 共 ' + CH().sections.length + ' 段' }),
      el('h1', { text: s.title }),
      el('div', { class: 'lead', html: CH().subtitle }));
    $content.appendChild(head);

    var sec = el('section', { class: 'block-sec', id: 'sec-' + s.id });
    var st = el('div', { class: 'sec-title' },
      el('span', { class: 'n', text: String(s.num).padStart(2, '0') }),
      el('h3', { text: s.title }));
    sec.appendChild(st);
    s.blocks.forEach(function (b) { var n = renderBlock(b); if (n) sec.appendChild(n); });
    $content.appendChild(sec);

    // 正文里的术语 → 链到术语表。必须放在 mountVizIn 之前：交互区不参与链接。
    linkTerms(sec, {});

    // 上一个 / 下一个
    var pager = el('div', { class: 'pager' });
    if (idx > 0) {
      var a = prevNext('上一节', CH().sections[idx - 1], false);
      pager.appendChild(a);
    } else pager.appendChild(el('div', { class: 'ph' }));
    if (idx < CH().sections.length - 1) {
      pager.appendChild(prevNext('下一节', CH().sections[idx + 1], true));
    } else {
      /* 最后一段的右侧卡片：通常是「去 Quiz 自测」。
         但如果自测块**就在这一段里**（作业的骨架就是这样，自测挂在最后一段），
         再链到自己就是一张点了没反应的卡 —— 改成引去术语表。 */
      var lastIsQuiz = (s.id === quizSecId());
      var a2 = el('a', { class: 'next' },
        el('span', { class: 'lbl', text: lastIsQuiz ? '本课结束' : '本章结束' }),
        el('span', { class: 'ttl', text: lastIsQuiz ? '回术语表速查 →' : '去 Quiz 自测 →' }));
      a2.addEventListener('click', function () {
        location.hash = lastIsQuiz ? courseRef('glossary') : courseSec(CURR, quizSecId());
      });
      pager.appendChild(a2);
    }
    $content.appendChild(pager);

    // 跨轨道出口只挂在最后一段 —— 挂在每一段就成了每页都重复的横幅，
    // 读到第 3 段的人还不该被催着去写作业。
    if (idx === CH().sections.length - 1) {
      var band = crossBand();
      if (band) $content.appendChild(band);
    }

    renderRightRail(s);
    mountVizIn($content);
    markVisited(s.id);
  }

  function prevNext(lbl, s, next) {
    var a = el('a', { class: next ? 'next' : '' },
      el('span', { class: 'lbl', text: lbl + ' · 第 ' + s.num + ' 段' }),
      el('span', { class: 'ttl', text: s.title }));
    a.addEventListener('click', function () { location.hash = courseSec(CURR, s.id); });
    return a;
  }

  /* 跨轨道出口：把「知识点」和「动手作业」两条轨道在页面末尾接上。
     作业页往下读完了，最该点的不是「下一节」（没有下一节了），
     而是「我读的那门课在哪」；知识点页读完了，最该点的是「拿什么练手」。
     没有对应关系（比如 K05 这类还没配作业的课）时返回 null，什么都不渲染。 */
  function crossBand() {
    var items = [];
    if (kindOf(CURR) === 'task') {
      var pid = parentOf(CURR);
      var pc = pid && courseById(pid);
      if (pc && landingOf(pid)) {
        items.push({ href: '#/' + landingOf(pid), lbl: '回知识点复习', ttl: pc.no + ' ' + pc.title });
      }
    } else {
      tasksOf(CURR).forEach(function (t) {
        if (landingOf(t.id)) items.push({ href: '#/' + landingOf(t.id), lbl: t.no + ' · 读完去练手', ttl: t.title });
      });
    }
    if (!items.length) return null;
    var box = el('div', { class: 'xband' });
    items.forEach(function (it) {
      var a = el('a', { class: 'xlink' },
        el('span', { class: 'lbl', text: it.lbl }),
        el('span', { class: 'ttl', text: it.ttl + ' →' }));
      a.addEventListener('click', function () { location.hash = it.href; });
      box.appendChild(a);
    });
    return box;
  }

  /** 交互模块的宿主 div 由 renderBlock 造出来，挂载统一放这里（保证 DOM 已在文档里） */
  function mountVizIn(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-viz]'), function (host) {
      if (host.dataset.mounted) return;
      host.dataset.mounted = '1';
      KB.viz.mount(host.dataset.viz, host, { chapter: CH() });
    });
  }

  /* ---------------- 渲染：块 ---------------- */
  function renderBlock(b) {
    switch (b.t) {
      case 'p':
        return el('div', { class: 'bd', html: KB.md.block(b.md) });

      case 'h':
        return el('h4', { class: 'bh', html: KB.md.inline(b.md) });

      case 'ul':
        return el('ul', {}, b.items.map(function (x) { return el('li', { html: KB.md.inline(x) }); }));

      case 'ol':
        return el('ol', {}, b.items.map(function (x) { return el('li', { html: KB.md.inline(x) }); }));

      case 'quote':
        return el('blockquote', { class: 'quote' },
          el('span', { html: KB.md.inline(b.text) }),
          b.by ? el('span', { class: 'by', text: '—— ' + b.by }) : null);

      case 'note': {
        var n = el('div', { class: 'note ' + (b.tone || 'info') });
        if (b.title) n.appendChild(el('div', { class: 'nt', html: KB.md.inline(b.title) }));
        n.appendChild(el('div', { html: KB.md.block(b.md) }));
        return n;
      }

      case 'table': {
        var w = el('div', { class: 'tbl-wrap' });
        var t = el('table', { class: 'md' });
        t.appendChild(el('tr', {}, b.head.map(function (h) { return el('th', { html: KB.md.inline(h) }); })));
        b.rows.forEach(function (r) {
          t.appendChild(el('tr', {}, r.map(function (c) { return el('td', { html: KB.md.inline(c) }); })));
        });
        w.appendChild(t);
        var box = el('div', {});
        box.appendChild(w);
        if (b.note) box.appendChild(el('p', { class: 'md-note', html: KB.md.inline(b.note) }));
        if (b.source) box.appendChild(el('p', { class: 'tbl-source', html: '出处：' + KB.md.inline(b.source) }));
        return box;
      }

      case 'kv':
        return el('div', { class: 'tbl-wrap' }, el('table', { class: 'md' },
          el('tbody', {}, b.rows.map(function (r) {
            return el('tr', {}, el('th', { html: KB.md.inline(r[0]) }), el('td', { html: KB.md.inline(r[1]) }));
          }))));

      case 'code':
        return el('pre', {}, el('code', { text: b.text }));

      case 'math': {
        var mb = el('div', { class: 'math-block' },
          el('div', { html: KB.md.katex(b.tex, true) }));
        if (b.tag) mb.appendChild(el('div', { class: 'mtag', html: KB.md.inline(b.tag) }));
        if (b.source) mb.appendChild(el('div', { class: 'mtag', html: '出处：' + KB.md.inline(b.source) }));
        return mb;
      }

      case 'goal':
        return renderGoal(b);

      case 'roadmap':
        return renderRoadmap(b);

      case 'hl':
        return renderHl(b);

      case 'viz': {
        var host = el('div', { dataset: { viz: b.key } });
        return host;
      }

      case 'predict':
        return renderPredict(b);

      case 'quizset': {
        var qh = el('div', {});
        var qhost = el('div', {});
        qh.appendChild(qhost);
        KB.quiz.mount(qhost, CH());
        return qh;
      }

      default:
        return el('div', { class: 'err', text: '未知块类型：' + b.t });
    }
  }

  /* ---------- 本段导读（每段开头的"导航卡"） ---------- */
  /* 为什么要有它：用户的原话是"学习时不知道看哪个，效率很低"。
     以前每段的开头直接就是正文，读者没有"这一段要给我什么、读完我该会什么"的预告。
     这张卡就是那段预告 —— 而且它必须能被读成一句自我检验的话（读不出 = 这段没过）。 */
  function renderGoal(b) {
    var box = el('div', { class: 'goal' });
    var ROWS = [
      ['before', '进这一段之前，你应该已经能', b.before],
      ['covers', '这一段回答', b.covers],
      ['after', '读完这一段，你应该能', b.after]
    ];
    ROWS.forEach(function (r) {
      if (!r[2] || !r[2].length) return;
      var col = el('div', { class: 'gcol g-' + r[0] });
      col.appendChild(el('div', { class: 'gt', text: r[1] }));
      col.appendChild(el('ul', {}, r[2].map(function (x) {
        return el('li', { html: KB.md.inline(x) });
      })));
      box.appendChild(col);
    });
    return box;
  }

  /* ---------- 本课地图（第 1 段开头的 10 段索引） ---------- */
  function renderRoadmap(b) {
    var box = el('div', { class: 'roadmap' });
    if (b.intro) box.appendChild(el('div', { class: 'rm-intro', html: KB.md.inline(b.intro) }));
    var list = el('div', { class: 'rm-list' });
    (b.items || []).forEach(function (it) {
      // [段id, 段标题, 一句话说明]
      var a = el('a', { class: 'rm-item', href: courseSec(CURR, it[0]) });
      a.appendChild(el('span', { class: 'rm-t', html: KB.md.inline(it[1]) }));
      a.appendChild(el('span', { class: 'rm-d', html: KB.md.inline(it[2]) }));
      list.appendChild(a);
    });
    box.appendChild(list);
    return box;
  }

  /* ---------- 公式逐项高亮 ---------- */
  function renderHl(b) {
    var box = el('div', { class: 'hl', dataset: { step: '0', lit: 'none' } });
    if (b.intro) box.appendChild(el('div', { class: 'hl-intro', html: KB.md.inline(b.intro) }));
    var stage = el('div', { class: 'hl-stage', html: KB.md.katex(b.tex, true) });
    box.appendChild(stage);

    var note = el('div', { class: 'hl-note', html: '<span class="lb">点「下一步」，公式的每一部分会被逐项高亮。</span>' });
    var dots = el('div', { class: 'hl-dots' });
    var bar = el('div', { class: 'hl-bar' });
    var parts = el('div', { class: 'hl-parts' });
    var steps = b.parts.length;
    for (var i = 0; i < steps; i++) dots.appendChild(el('i', {}));

    var cur = 0;
    function go(k) {
      cur = k;
      box.dataset.step = String(k);
      // 有的分项讲的是「整体」（例如「合起来 = 期望 − 观测」），公式里没有可点的片段。
      // 这时退化成整式高亮，而不是点了没反应 —— data-lit 供 CSS 判断走哪条路。
      var hasPart = k > 0 && !!stage.querySelector('.hl-p' + k);
      box.dataset.lit = k === 0 ? 'none' : (hasPart ? 'part' : 'all');
      Array.prototype.forEach.call(dots.children, function (d, di) { d.classList.toggle('on', di < k); });
      Array.prototype.forEach.call(parts.children, function (p, pi) { p.classList.toggle('on', pi === k - 1); });
      if (k === 0) {
        note.innerHTML = '<span class="lb">点「下一步」，公式的每一部分会被逐项高亮。</span>';
      } else {
        var p = b.parts[k - 1];
        note.innerHTML = '<span class="lb">' + KB.md.inline(p.label) + '</span>' + KB.md.inline(p.note);
      }
      prev.disabled = k === 0;
      next.disabled = k === steps;
      next.textContent = k === steps ? '走完了' : '下一步';
    }

    var prev = el('button', { class: 'btn', text: '上一步' });
    var next = el('button', { class: 'btn primary', text: '下一步' });
    var reset = el('button', { class: 'btn', text: '重置' });
    prev.addEventListener('click', function () { if (cur > 0) go(cur - 1); });
    next.addEventListener('click', function () { if (cur < steps) go(cur + 1); });
    reset.addEventListener('click', function () { go(0); });
    bar.appendChild(prev); bar.appendChild(next); bar.appendChild(reset); bar.appendChild(dots);

    b.parts.forEach(function (p, i) {
      var btn = el('button', { html: KB.md.inline(p.label) });
      btn.addEventListener('click', function () { go(i + 1); });
      parts.appendChild(btn);
    });

    box.appendChild(bar);
    box.appendChild(parts);
    box.appendChild(note);
    if (b.source) box.appendChild(el('div', { class: 'viz-src', html: '出处：' + KB.md.inline(b.source) }));
    go(0);
    return box;
  }

  /* ---------- 先猜后对 ---------- */
  function renderPredict(b) {
    var box = el('div', { class: 'predict' });
    box.appendChild(el('div', { class: 'pq' }, el('span', { class: 'tag', text: '先猜后对' }), el('span', { html: KB.md.inline(b.q) })));

    // 用**当前课程**的算法层。以前这里是模块级 var C = KB.core.k01 —— 抽掉它之后这里成了
    // ReferenceError（症状：含「先猜后对」的第 6 段整段渲染不出来）。多课后必须按 CURR 取。
    var answer = b.compute(KB.core && KB.core[CURR], KB.freq && KB.freq.imdb2000);
    var digits = b.digits != null ? b.digits : 4;
    var tol = b.tol != null ? b.tol : 1e-6;

    var inp = el('input', { type: 'text', placeholder: '写下你的猜测', inputmode: 'decimal' });
    var btn = el('button', { class: 'btn primary', text: '对账' });
    var verdict = el('div', { class: 'verdict' });
    var alt = el('div', { class: 'palt', html: KB.md.inline(b.alt || '') });

    btn.addEventListener('click', function () {
      var v = KB.util.parseNum(inp.value);
      if (isNaN(v)) { verdict.className = 'verdict no'; verdict.textContent = '先填一个数字'; return; }
      var ok = Math.abs(v - answer) <= tol;
      verdict.className = 'verdict ' + (ok ? 'ok' : 'no');
      verdict.innerHTML = (ok ? '✓ 猜对了。' : '✗ 差了 ' + Math.abs(v - answer).toFixed(digits) + '。') +
        ' 实测 <span class="actual">' + answer.toFixed(digits) + ' ' + (b.unit || '') + '</span>';
      alt.style.display = '';
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') btn.click(); });

    box.appendChild(el('div', { class: 'prow' }, inp, el('span', { class: 'unit', text: b.unit || '' }), btn));
    box.appendChild(verdict);
    alt.style.display = 'none';
    box.appendChild(alt);
    if (b.source) box.appendChild(el('div', { class: 'psrc', html: '实测来源：<code>' + KB.md.escapeHtml(b.source) + '</code>（本页用 k01_core.js 现算，与它逐位对账）' }));
    return box;
  }

  /* ---------------- 渲染：其它页 ---------------- */
  function pageHead(eyebrow, title, lead) {
    return el('div', { class: 'chapter-head' },
      el('div', { class: 'eyebrow', text: eyebrow }),
      el('h1', { text: title }),
      lead ? el('div', { class: 'lead', html: lead }) : null);
  }

  function renderGlossary(glos) {
    clear($content);
    $content.appendChild(pageHead('CS224N · ' + courseNo() + ' · 速查', '术语表',
      '共 ' + CH().glossary.length + ' 条。名词首次出现时的英文原词一并保留。' +
      '<br>正文里带虚线下划线的词可直接点到这里；条目内部出现的其他术语也能互相跳。'));
    var card = el('div', { class: 'card' });
    CH().glossary.forEach(function (g, i) {
      card.appendChild(el('div', { class: 'glos-item', id: 'glos-' + i, dataset: { gi: String(i) } },
        el('div', { class: 'g', html: KB.md.inline(g[0]) }),
        // 2026-10-06：释义从「一句话」改成「多段讲解」，故用块级渲染（能出 <p>/<ul>/公式/例子块）。
        // 若某条仍只有一句话，block() 会把它包成一个 <p>，外观与旧版一致，不会退化。
        el('div', { class: 'd', html: KB.md.block(g[1]) })));
    });
    $content.appendChild(card);

    // 条目之间互跳：每条单独去重（共用一个 used 的话，第 10 条以后就没链接了），且不链自己
    Array.prototype.forEach.call(card.querySelectorAll('.glos-item'), function (it, i) {
      linkTerms(it.querySelector('.d'), {}, i);
    });
    renderRightRail(null);

    // 从正文的术语链接跳进来：滚到那一条并闪一下（route() 末尾的 scrollTo(0,0) 已先执行完）
    var idx = parseInt(glos, 10);
    if (isFinite(idx)) {
      var tgt = card.querySelector('.glos-item[data-gi="' + idx + '"]');
      if (tgt) {
        setTimeout(function () {
          tgt.scrollIntoView({ block: 'start' });
          tgt.classList.add('flash');
          setTimeout(function () { tgt.classList.remove('flash'); }, 1700);
        }, 40);
      }
    }
  }

  function renderFormulas() {
    clear($content);
    $content.appendChild(pageHead('CS224N · ' + courseNo() + ' · 速查', '公式速查',
      '全部用本地 KaTeX 渲染，断网可用。'));
    CH().formulas.forEach(function (f) {
      var card = el('div', { class: 'card' },
        el('h3', { html: KB.md.inline(f.name) }),
        el('div', { class: 'math-block', html: KB.md.katex(f.tex, true) }),
        el('div', { class: 'mtag', html: KB.md.inline(f.note) }));
      $content.appendChild(card);
    });
    renderRightRail(null);
  }

  function renderParams() {
    clear($content);
    var P = CH().params;
    $content.appendChild(pageHead('CS224N · ' + courseNo() + ' · 速查', '参数与复杂度卡',
      '这一课的维度、参数量与复杂度，一张表看完。'));
    var card = el('div', { class: 'card' });
    var t = el('table', { class: 'md' });
    t.appendChild(el('tr', {}, P.head.map(function (h) { return el('th', { html: KB.md.inline(h) }); })));
    P.rows.forEach(function (r) {
      t.appendChild(el('tr', {}, r.map(function (c) { return el('td', { html: KB.md.inline(c) }); })));
    });
    card.appendChild(el('div', { class: 'tbl-wrap' }, t));
    card.appendChild(el('div', { class: 'note warn', html: KB.md.block(P.note) }));
    $content.appendChild(card);
    /* 「实测锚点」由课程自己提供（chapter.measureRows 返回 [['量','值'],…]）。
       以前这十行硬编码在渲染函数里，全是 K01 的哈夫曼树与噪声分布实测值 ——
       多课后到了 K02 页面，这里会一本正经地显示 K02 根本没讲过的东西。现在改成可选。 */
    if (typeof CH().measureRows === 'function') {
      var mrows = CH().measureRows();
      if (mrows && mrows.length) {
        var card2 = el('div', { class: 'card' });
        card2.appendChild(el('h3', { text: '实测锚点' }));
        if (CH().measureLead) card2.appendChild(el('div', { html: KB.md.block(CH().measureLead) }));
        card2.appendChild(el('div', { class: 'tbl-wrap' }, el('table', { class: 'md' },
          el('tr', {}, el('th', { text: '量' }), el('th', { text: '实测值' })),
          mrows.map(function (r) {
            return el('tr', {}, el('td', { html: r[0] }), el('td', { class: 'num', text: r[1] }));
          }))));
        card2.appendChild(el('p', { class: 'mini', html: '以上每一条都由本页现在重新算出来，与 <code>logs/</code> 里的日志逐位一致。' }));
        $content.appendChild(card2);
      }
    }
    renderRightRail(null);
  }

  function renderHonesty() {
    clear($content);
    $content.appendChild(pageHead('CS224N · ' + courseNo() + ' · 边界', '未验证清单',
      '这一页专门写"我<b>没能</b>验证什么"。含糊带过比直接承认更糟。'));
    var card = el('div', { class: 'card' });
    var ol = el('ol', { class: 'honesty' });
    CH().honesty.forEach(function (h) {
      ol.appendChild(el('li', { html: '<span class="badge">未验证</span>' + KB.md.inline(h) }));
    });
    card.appendChild(ol);
    $content.appendChild(card);

    $content.appendChild(el('div', { class: 'card' },
      el('h3', { text: '这一页的数字是怎么保证可信的' }),
      el('div', { html: KB.md.block(
        '三层保障，缺一层这一页就不可信：\n\n' +
        '1. **算法层有单测**：`js/core/kNN_core.js` 里每个函数都被 `tests/core.test.js` 用日志里的真实数字断言过（118 条），跑一次 `node site/tests/core.test.js` 就重验一遍。\n' +
        '2. **交互里的数字是现算的，不是抄的**：所有"实测值"都调 `compute()` 现场算出来，抄写会漂移、计算不会。\n' +
        '3. **结构有校验**：`tests/site.check.js` 会检查每段非空、Quiz 索引合法、交互模块存在、引用的本地文件存在、**所有公式都能用本地 KaTeX 渲染**，有问题就 exit 1。\n\n' +
        '**你随时可以推翻我**：跑那两个测试；或者直接跑 Python 脚本（`code/k01_demo.py` / `code/k01_huffman_neg.py` / `code/k01_verify_dim.py`）对照 `logs/`。' ) })));
    renderRightRail(null);
  }

  /* 全站页：不属于任何一门课。眉标里不能出现 courseNo()（进过 K01 就永远写着 K01），
     正文里的数字、路径、进度也不能取当前课程 —— 那样「关于」会随你最后看的那门课变形。 */
  function renderAbout() {
    clear($content);
    var list = KB.courses || [];
    var readyN = list.filter(function (c) { return KB.courseReady(c.id); }).length;
    $content.appendChild(pageHead('CS224N 交互复习站', '这一页怎么来的',
      '一个入口装下全部 <b>' + list.length + '</b> 个知识点：每门课都是' +
      '分段讲解 + 可动手的交互实验 + 术语表 + 自测题，全站离线可用。'));
    $content.appendChild(el('div', { class: 'card', html: KB.md.block(
      '### 这个站是什么\n\n' +
      '把一门课做成**可以离线学完**的交互网站：双击 `index.html` 就能用，拔网线也能用。\n\n' +
      '**每门课都是一个自洽的整体** —— 想学一门课，就只看它自己那一串页面，' +
      '不需要另外找讲义或原文对照。正文负责把"为什么"讲清楚，公式可以逐项拆开看，' +
      '交互能把结论动手试出来，末尾有自测。\n\n' +
      '### 目录\n\n' +
      '```\n' +
      'site/\n' +
      '├── index.html            双击就开（file:// 下也能用，无后端）\n' +
      '├── css/                  base(主题 token) · layout(三栏/两级目录) · components · viz\n' +
      '├── js/core/kNN_core.js   每课一个纯算法模块，浏览器与 Node 共用\n' +
      '├── js/ui/                util · md(markdown+KaTeX) · quiz · app(路由/块渲染)\n' +
      '├── js/viz/kNN_viz.js     每课一组交互实验\n' +
      '├── data/                 courses.js(课程注册表) · kNN.js(该课全部内容) · freq.js\n' +
      '├── reference/            imdb2000_freq.json —— 真实词频表\n' +
      '├── tools/                dump_freq.py · build_freq.py · build_single.py\n' +
      '├── tests/                四套校验（算法 / 结构 / 浏览器 / 手机）\n' +
      '├── dist/                 单文件手机版（内联全部资源，无兄弟文件也能开）\n' +
      '└── vendor/               katex 0.19.0 · markdown-it 15.0.2（本地，离线可用）\n' +
      '```\n\n' +
      '### 地址怎么看\n\n' +
      '```\n' +
      '#/                              首页：课程列表\n' +
      '#/c/<课id>/<段id>                某门课的一段（课id 形如 k01、k02…）\n' +
      '#/c/<课id>/ref/glossary[/<i>]    术语表（可定位到第 i 条）\n' +
      '#/c/<课id>/ref/formulas|params|honesty\n' +
      '#/about                          本页\n' +
      '```\n\n' +
      '`ref/` 这一层是刻意留的：段 id 由每门课自己起，和专业页名字放同一个命名空间迟早撞车' +
      '（第 10 段就叫 `quiz`），加一层前缀让两个命名空间不相交。\n\n' +
      '### 三条技术约束（为什么这么写）\n\n' +
      '1. **不用 fetch、不用 ES module** —— 浏览器从 `file://` 打开时会拦掉它们。所以内容以 `data/*.js` 形式用普通 `<script>` 按序加载。\n' +
      '2. **LaTeX 一律写在 `String.raw` 里** —— 普通 JS 字符串会把 `\\f` 之类当转义吃掉。\n' +
      '3. **长公式不撑破布局** —— grid / flex 的子元素默认不会缩到内容以下，所有可能装长内容的容器都加了 `min-width: 0`，超宽只在自己的框里横向滚动。\n\n' +
      '### 还没做\n\n' +
      '- 还有 **' + (list.length - readyN) + ' 门课没开工**（' + readyN + '/' + list.length + '）——' +
      '它们目前在首页显示为灰卡：元数据齐了，内容数据还没写。做完一门就把它的数据文件挂上去，卡片自动点亮。\n' +
      '- 幻灯片里的插图没提取（PDF 只有文字层）。\n' +
      '- 每门课内部的"未验证清单"在各课的侧栏里，是本站在诚实边界上的自我披露。' ) }));
    renderRightRail(null);
  }

  /* ---------------- 右侧速查栏 ---------------- */
  function renderRightRail(section) {
    clear($toc);
    /* 首页/全站页不属于任何一门课，右栏不该显示「某门课的速查 + 锚点数字」——
       那些数字是 K01 算出来的，摆在首页会让人以为它们属于整个站点。 */
    if (currentRoute.name !== 'course') {
      var nT = (KB.courses || []).filter(function (c) { return (c.kind || 'topic') === 'topic'; }).length;
      var nA = (KB.courses || []).filter(function (c) { return c.kind === 'task'; }).length;
      $toc.appendChild(el('h4', { text: '怎么用' }));
      $toc.appendChild(el('div', { class: 'mini', html:
        '左侧分两条轨道：<b>知识点 ' + nT + ' 个</b>回答"这是什么"，<b>动手作业 ' + nA + ' 份</b>回答"现在做什么"。实心的是已开工的，虚线的是还没做的。<br><br>' +
        '每门课内部都有 <b>分段讲解</b> + <b>可动手的交互实验</b> + <b>术语表</b> + <b>自测题</b>。<br><br>' +
        '每份作业都配了「不装环境也能玩」的预演交互 —— 先在网页上把要算的东西算一遍，再去写代码。' }));
      return;
    }
    if (section) {
      var heads = section.blocks.filter(function (b) { return b.t === 'h'; });
      if (heads.length) {
        $toc.appendChild(el('h4', { text: '本页' }));
        var ul = el('ul', {});
        heads.forEach(function (h) {
          var t = h.md.replace(/[*$`]/g, '').slice(0, 22);
          ul.appendChild(el('li', {}, el('a', { html: KB.md.inline(h.md).replace(/<[^>]+>/g, ''), onclick: function (e) { e.preventDefault(); } })));
          var li = ul.lastChild.firstChild;
          li.addEventListener('click', function () {
            Array.prototype.forEach.call($content.querySelectorAll('h4.bh'), function (el2) {
              if (el2.textContent.trim() === t || el2.textContent.indexOf(t.replace(/^[①-⑦]\s*/, '')) === 0) {
                el2.scrollIntoView({ block: 'start', behavior: 'smooth' });
              }
            });
          });
        });
        $toc.appendChild(ul);
      }
    }
    $toc.appendChild(el('h4', { text: '本章速查' }));
    $toc.appendChild(el('ul', {}, toolDefs().slice(0, 5).map(function (t) {
      return el('li', {}, (function () {
        var a = el('a', { text: t[1] });
        a.addEventListener('click', function () { location.hash = t[0]; });
        return a;
      })());
    })));

    /* 「几个锚点数字」由课程自己提供（chapter.railAnchors 是个返回字符串数组的函数）。
       以前这段直接写死在 app.js 里，全是 K01 的实测值 —— 到了 K02 页面上，这里会一本正经地
       显示「the 的哈夫曼路径」，那就成了 K02 讲没讲过的另一门课的数字。
       现在是可选的：某门课不提供就不显示这一节。 */
    if (typeof CH().railAnchors === 'function') {
      $toc.appendChild(el('h4', { text: '几个锚点数字' }));
      $toc.appendChild(el('div', { class: 'mini', html: CH().railAnchors().join('<br>') }));
    }

    $toc.appendChild(el('h4', { text: '诚实边界' }));
    $toc.appendChild(el('div', { class: 'mini', html:
      '本页有 <b>' + CH().honesty.length + ' 条</b>没能验证的东西，单列一页。' }));
    var a2 = el('a', { text: '→ 打开未验证清单' });
    a2.addEventListener('click', function () { location.hash = courseRef('honesty'); });
    $toc.appendChild(a2);
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    initTheme();
    buildShell();
    if (!KB.courses || !KB.courses.length) {
      document.getElementById('content').innerHTML = '<div class="err">课程注册表未加载：检查 data/courses.js</div>';
      return;
    }
    if (!KB.firstReadyCourse || !KB.firstReadyCourse()) {
      document.getElementById('content').innerHTML = '<div class="err">没有任何一门课加载成功：检查 data/kNN.js</div>';
      return;
    }
    route();
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (!(currentRoute.name === 'course' && !currentRoute.ref && secById(currentRoute.page))) return;
      var idx = -1;
      CH().sections.forEach(function (s, i) { if (s.id === currentRoute.page) idx = i; });
      if (e.key === 'ArrowRight' && idx < CH().sections.length - 1) location.hash = courseSec(CURR, CH().sections[idx + 1].id);
      if (e.key === 'ArrowLeft' && idx > 0) location.hash = courseSec(CURR, CH().sections[idx - 1].id);
    });
  }

  KB.app = { boot: boot, route: route, renderBlock: renderBlock, courseId: function () { return CURR; }, chapter: function () { return CH(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
