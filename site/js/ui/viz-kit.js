/* ============================================================
 * viz-kit.js —— 交互模块的公共框架与小件
 * ------------------------------------------------------------
 * 为什么要单独一个文件：
 *   这套东西原本长在 js/viz/k01_viz.js 的闭包里（KB.viz 注册表 +
 *   panel / ctl / slider / kvs / bars / matrix），于是**只有 K01 能用**。
 *   A1 的作业页要加自己的预演交互时，只能在第二个文件里把 panel / slider
 *   再抄一遍 —— 两份迟早会长歪（改了一处忘了另一处）。
 *   现在抽出来共用：k01_viz.js 与 a1_viz.js 都从这里取，函数名一字未改。
 *
 * 加载顺序：必须在 js/ui/util.js（KB.dom）之后、任何 js/viz/*.js 之前。
 * ============================================================ */
(function (global) {
  'use strict';
  var KB = global.KB = global.KB || {};
  var el = KB.dom.el, clear = KB.dom.clear;

  /* ---------------- 注册表 ----------------
   * 交互模块按 key 注册（reg.onehot / KB.viz.register('a1-cooc', fn)），
   * 正文里的 { t: 'viz', key: 'xxx' } 块渲染成宿主 div，再由 app.js 统一挂载。
   * 注册表放在这里 —— 这样 k01 与 a1 的交互进的是同一张表，
   * KB.viz.mount 不需要知道它属于哪门课。
   */
  var reg = {};
  KB.vizReg = reg;

  KB.viz = {
    register: function (key, fn) { reg[key] = fn; },
    has: function (key) { return !!reg[key]; },
    keys: function () { return Object.keys(reg); },
    mount: function (key, host, ctx) {
      if (!reg[key]) { host.appendChild(el('div', { class: 'err', text: '找不到交互模块：' + key })); return; }
      try { reg[key](host, ctx); }
      catch (e) { host.appendChild(el('div', { class: 'err', text: '交互出错：' + e.message })); }
    }
  };

  /* ---------------- 公共小件 ---------------- */

  /** 一块交互面板：标题 + 一句提示 + 可选的"对账来源"。返回 {wrap, body} */
  function panel(title, hint, src) {
    var body = el('div', { class: 'viz-body' });
    var head = el('div', { class: 'viz-head' },
      el('div', { class: 'vt', text: title }),
      hint ? el('div', { class: 'vh', html: hint }) : null);
    var wrap = el('div', { class: 'viz' }, head, body);
    if (src) body.appendChild(el('div', { class: 'viz-src', html: '对账来源：' + src }));
    return { wrap: wrap, body: body };
  }

  /** 一行控件：标签 + 控件 + 可选的值显示 */
  function ctl(label, input, valueEl) {
    return el('div', { class: 'ctl' }, el('label', { text: label }), input, valueEl || null);
  }

  /** range 滑块 + 跟随显示的值 */
  function slider(min, max, step, val, onInput) {
    var i = el('input', { type: 'range', min: min, max: max, step: step, value: val });
    var v = el('span', { class: 'val', text: String(val) });
    i.addEventListener('input', function () { v.textContent = i.value; onInput(parseFloat(i.value)); });
    return { node: i, val: v };
  }

  /** 键值行列表：[[键, 值, 可选状态类], ...] */
  function kvs(list) {
    return el('div', { class: 'kvs' }, list.map(function (kv) {
      return el('div', { class: 'kv' },
        el('span', { class: 'k', html: kv[0] }),
        el('span', { class: 'v ' + (kv[2] || ''), text: kv[1] }));
    }));
  }

  /** 横向条形图 */
  function bars(host, items, opts) {
    opts = opts || {};
    clear(host);
    var max = opts.max || Math.max.apply(null, items.map(function (x) { return Math.abs(x.value); })) || 1;
    items.forEach(function (it) {
      var f = el('i', { class: 'bf ' + (it.cls || ''), style: 'width:' + Math.max(0, Math.min(1, it.value / max)) * 100 + '%' });
      host.appendChild(el('div', { class: 'bar-row' },
        el('span', { class: 'bl', html: it.label }),
        el('span', { class: 'bt' }, f),
        el('span', { class: 'bv', text: it.text != null ? it.text : it.value })));
    });
  }

  /** 矩阵表
   * opts.hot   单格高亮 [i,j]
   * opts.hots  多格高亮 [[i,j], ...]（滑动窗口 / 步进用）
   * opts.bads  要标红的格 [[i,j], ...]（"你的实现和正确答案差在这里"）
   * opts.rows  行表头用别的名字（默认 words），用于展示"错序后的行标签"
   */
  function matrix(host, words, X, opts) {
    opts = opts || {};
    clear(host);
    var hotSet = {};
    if (opts.hot) hotSet[opts.hot[0] + ',' + opts.hot[1]] = 1;
    (opts.hots || []).forEach(function (h) { hotSet[h[0] + ',' + h[1]] = 1; });
    var badSet = {};
    (opts.bads || []).forEach(function (h) { badSet[h[0] + ',' + h[1]] = 1; });
    var rows = opts.rows || words;
    var t = el('table', { class: 'mx' + (opts.compact ? ' mx-compact' : '') });
    var hr = el('tr', {}, el('th', { text: '' }));
    words.forEach(function (w) { hr.appendChild(el('th', { text: w })); });
    t.appendChild(hr);
    for (var i = 0; i < words.length; i++) {
      var tr = el('tr', {}, el('th', { text: rows[i] }));
      for (var j = 0; j < words.length; j++) {
        var v = X[i][j];
        var cls = badSet[i + ',' + j] ? 'n bad'
          : (v === 0 ? 'z' : (hotSet[i + ',' + j] ? 'n hot' : 'n'));
        tr.appendChild(el('td', { class: cls, text: v === 0 ? '0' : String(Number(v.toFixed(3))) }));
      }
      t.appendChild(tr);
    }
    host.appendChild(el('div', { class: 'mx-wrap' }, t));
  }

  KB.vizKit = {
    panel: panel, ctl: ctl, slider: slider, kvs: kvs, bars: bars, matrix: matrix
  };
})(typeof window !== 'undefined' ? window : globalThis);
