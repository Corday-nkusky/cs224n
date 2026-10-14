/* ============================================================
 * md.js —— markdown-it + KaTeX 的薄封装
 * ------------------------------------------------------------
 * 为什么要包一层：markdown-it 会把 $...$ 里的反斜杠当转义处理，
 * 所以顺序必须是「先把数学段挖出来 → 交给 markdown-it → 再填回 KaTeX 渲染结果」。
 * 零网络依赖：markdown-it 与 katex 都在 vendor/ 本地。
 * ============================================================ */
(function (global) {
  'use strict';
  var KB = global.KB = global.KB || {};
  var katex = global.katex;

  var PH_OPEN = '\u0001M', PH_CLOSE = '\u0001';
  var md = new global.markdownit({
    html: true,        // 讲义里有 <details> / <code> / <br>，必须放行
    linkify: false,
    breaks: false,
    typographer: false
  });

  var errors = [];     // 渲染失败的公式，site.check.js 会读
  var OPT = { trust: true, strict: 'ignore', throwOnError: false, displayMode: false };

  /** 挖出 $...$ / $$...$$，返回 {text, math: []} */
  function extract(str) {
    var math = [];
    var out = '';
    var i = 0;
    while (i < str.length) {
      var ch = str[i];
      if (ch === '\\') { out += str.slice(i, i + 2); i += 2; continue; }
      if (ch === '$') {
        var dbl = str[i + 1] === '$';
        // 注意：$ 后紧跟数字的情况（如 $5）不算数学段
        if (dbl) {
          var endD = str.indexOf('$$', i + 2);
          if (endD > -1) {
            math.push({ tex: str.slice(i + 2, endD), display: true });
            out += PH_OPEN + (math.length - 1) + PH_CLOSE;
            i = endD + 2; continue;
          }
        } else {
          var endS = i + 1;
          while (endS < str.length) {
            if (str[endS] === '\\') { endS += 2; continue; }
            if (str[endS] === '$') break;
            endS++;
          }
          var body = str.slice(i + 1, endS);
          if (endS < str.length && body.length && !/^\s/.test(body) && !/\s$/.test(body) && /[\\^_{}=0-9a-zA-Z(]/.test(body)) {
            math.push({ tex: body, display: false });
            out += PH_OPEN + (math.length - 1) + PH_CLOSE;
            i = endS + 1; continue;
          }
        }
      }
      out += ch;
      i++;
    }
    return { text: out, math: math };
  }

  function renderTex(tex, display, opts) {
    var o = { trust: true, strict: 'ignore', displayMode: !!display };
    if (opts) Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });
    try {
      return katex.renderToString(tex, o);
    } catch (e) {
      errors.push({ tex: tex, message: e.message });
      if (o.throwOnError) throw e;
      return '<span class="err">公式渲染失败：' + escapeHtml(tex) + '</span>';
    }
  }

  function restore(html, math) {
    for (var i = 0; i < math.length; i++) {
      var m = math[i];
      var ph = PH_OPEN + i + PH_CLOSE;
      var k = renderTex(m.tex, m.display);
      // 独占一行的展示公式 → 提到 <p> 外面，变成块级
      var wrapped = '<p>' + ph + '</p>';
      if (html.indexOf(wrapped) > -1) {
        html = html.replace(wrapped, '<div class="math-block">' + k + '</div>');
      } else {
        html = html.split(ph).join(k);
      }
    }
    return html;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** 行内渲染：只处理行内语法，不包 <p> */
  function inline(str, opts) {
    if (str == null) return '';
    if (typeof str !== 'string') str = String(str);
    var p = extract(str);
    return restore(md.renderInline(p.text), p.math);
  }

  /** 块级渲染：完整 markdown */
  function block(str, opts) {
    if (str == null) return '';
    if (typeof str !== 'string') str = String(str);
    var p = extract(str);
    var html = md.render(p.text);
    html = restore(html, p.math);
    return postProcess(html);
  }

  function postProcess(html) {
    // 表格外面包一层，长表格只在自己的框里横向滚动（不撑破布局）
    html = html.replace(/<table>/g, '<div class="tbl-wrap"><table class="md">')
               .replace(/<\/table>/g, '</table></div>');
    return html;
  }

  KB.md = {
    katex: renderTex,
    block: block,
    inline: inline,
    extract: extract,
    errors: errors,
    escapeHtml: escapeHtml,
    /** 供 site.check.js 用：把一段文本里的公式全部按 throwOnError 渲染一遍 */
    checkMath: function (str) {
      var p = extract(str), bad = [];
      p.math.forEach(function (m) {
        try { katex.renderToString(m.tex, { trust: true, strict: 'ignore', displayMode: m.display, throwOnError: true }); }
        catch (e) { bad.push({ tex: m.tex, message: e.message }); }
      });
      return { count: p.math.length, bad: bad };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
