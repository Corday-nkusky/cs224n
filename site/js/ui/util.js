/* ============================================================
 * util.js —— DOM / 格式化小工具（无依赖）
 * ============================================================ */
(function (global) {
  'use strict';
  var KB = global.KB = global.KB || {};

  function el(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style') node.setAttribute('style', v);
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x != null) node.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  /** 数字格式化：固定小数位，去掉多余的 0，保留 tabular 对齐感 */
  function num(v, digits) {
    if (!isFinite(v)) return String(v);
    if (digits == null) return String(v);
    return Number(v).toFixed(digits);
  }

  /** 解析用户输入：允许全角、百分号、空格、下划线 */
  function parseNum(s) {
    if (s == null) return NaN;
    var t = String(s).trim()
      .replace(/[，,]/g, '')
      .replace(/[％%]/g, '')
      .replace(/[。．]/g, '.')
      .replace(/\s+/g, '')
      .replace(/^\+/, '');
    if (t === '') return NaN;
    var m = t.match(/^-?\d*\.?\d+(?:[eE][-+]?\d+)?$/);
    if (!m) return NaN;
    return parseFloat(t);
  }

  /** Fisher–Yates（用固定种子，保证每次刷新顺序一致，便于对账） */
  function shuffle(arr, seed) {
    var a = arr.slice(), rnd = (KB.core && KB.core.k01) ? KB.core.k01.mulberry32(seed || 1) : Math.random;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  KB.dom = { el: el, clear: clear };
  KB.util = { num: num, parseNum: parseNum, shuffle: shuffle };
})(typeof window !== 'undefined' ? window : globalThis);
