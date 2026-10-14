/* ============================================================
 * quiz.js —— 交互式 Quiz 引擎
 * 三种题型：choice（选项）/ calc（数值，答案现算）/ open（开放，给要点自评）
 * 作答记录存 localStorage，按章存。
 * ============================================================ */
(function (global) {
  'use strict';
  var KB = global.KB = global.KB || {};
  var el = KB.dom.el, clear = KB.dom.clear;

  var STORE = 'cs224n.site.quiz.v1';

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { return {}; }
  }
  function saveStore(s) {
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* 隐私模式下忽略 */ }
  }

  var KIND_LABEL = { choice: '概念判断', calc: '数值计算', open: '开放推导' };

  function mount(host, chapter) {
    clear(host);
    /* 取**当前这一课**的算法层。以前这里写死 KB.core.k01 —— 多课后 A1 的数值题
       会拿到 K01 的算法层：要么算出 K01 的数字（题面还对得上但答案是错的），
       要么直接 TypeError。判据必须是 chapter.id，不是 CURR（这里是按课挂载的）。 */
    var C = global.KB && KB.core && KB.core[chapter.id];
    var F = (KB.freq && KB.freq.imdb2000) || null;
    var store = loadStore();
    var mine = store[chapter.id] = store[chapter.id] || {};

    var objTotal = 0, objRight = 0;
    chapter.quiz.forEach(function (q) { if (q.kind !== 'open') objTotal++; });

    var scoreEl = el('div', { class: 'quiz-score' });
    var list = el('div', { class: 'quiz' });

    function refreshScore() {
      objRight = 0;
      chapter.quiz.forEach(function (q) {
        var s = mine[q.id];
        if (q.kind !== 'open' && s && s.right) objRight++;
      });
      clear(scoreEl);
      scoreEl.appendChild(el('span', { html: '客观题得分' }));
      scoreEl.appendChild(el('b', { text: objRight + ' / ' + objTotal }));
      scoreEl.appendChild(el('span', { html: '（数值题的正确答案由本页<b>现算</b>，不是写死的）' }));
      var reset = el('button', { class: 'btn', text: '清空作答' });
      reset.addEventListener('click', function () {
        if (!confirm('清空本章 Quiz 的作答记录？')) return;
        mine = store[chapter.id] = {};
        saveStore(store);
        mount(host, chapter);
      });
      scoreEl.appendChild(reset);
    }

    chapter.quiz.forEach(function (q, qi) {
      var card = el('div', { class: 'q' });
      var head = el('div', { class: 'qhead' },
        el('span', { class: 'qid', text: q.id }),
        el('span', { class: 'qkind', text: KIND_LABEL[q.kind] || q.kind }));
      card.appendChild(head);
      card.appendChild(el('div', { class: 'qt', html: KB.md.inline(q.q) }));

      var explainBox = null;
      function showExplain() {
        if (explainBox) { explainBox.style.display = ''; return; }
        explainBox = el('div', { class: 'explain', html: KB.md.block(q.explain || '') });
        card.appendChild(explainBox);
      }

      if (q.kind === 'choice') {
        var opts = el('div', { class: 'opts' });
        var state = mine[q.id] || null;
        q.options.forEach(function (txt, k) {
          var row = el('div', { class: 'opt' },
            el('span', { class: 'k', text: String.fromCharCode(65 + k) }),
            el('span', { html: KB.md.inline(txt) }));
          row.addEventListener('click', function () {
            if (state && state.locked) return;
            var right = k === q.answer;
            mine[q.id] = { choice: k, right: right, locked: true };
            saveStore(store);
            Array.prototype.forEach.call(opts.children, function (c, ci) {
              c.classList.remove('sel');
              if (ci === q.answer) c.classList.add('right');
              else if (ci === k) c.classList.add('wrong');
            });
            verdict.className = 'verdict ' + (right ? 'ok' : 'no');
            verdict.textContent = right ? '✓ 正确' : '✗ 不对 —— 正确项是 ' + String.fromCharCode(65 + q.answer);
            showExplain();
            refreshScore();
          });
          opts.appendChild(row);
        });
        card.appendChild(opts);
        var verdict = el('div', { class: 'verdict' });
        card.appendChild(verdict);
        if (state && state.locked) {
          Array.prototype.forEach.call(opts.children, function (c, ci) {
            if (ci === q.answer) c.classList.add('right');
            else if (ci === state.choice) c.classList.add('wrong');
          });
          verdict.className = 'verdict ' + (state.right ? 'ok' : 'no');
          verdict.textContent = state.right ? '✓ 正确' : '✗ 不对 —— 正确项是 ' + String.fromCharCode(65 + q.answer);
          showExplain();
        }

      } else if (q.kind === 'calc') {
        var row2 = el('div', { class: 'qrow' });
        var inp = el('input', { type: 'text', placeholder: '填数值', inputmode: 'decimal' });
        if (mine[q.id] && mine[q.id].raw != null) inp.value = mine[q.id].raw;
        var unit = el('span', { class: 'unit', text: q.unit || '' });
        var btn = el('button', { class: 'btn primary', text: '对账' });
        var verdict2 = el('div', { class: 'verdict' });
        var answer = q.compute(C, F);
        var digits = q.digits != null ? q.digits : 4;
        var tol = q.tol != null ? q.tol : 1e-6;
        btn.addEventListener('click', function () {
          var v = KB.util.parseNum(inp.value);
          if (isNaN(v)) { verdict2.className = 'verdict no'; verdict2.textContent = '请填一个数字'; return; }
          var ok = Math.abs(v - answer) <= tol;
          mine[q.id] = { raw: inp.value, right: ok, locked: true };
          saveStore(store);
          verdict2.className = 'verdict ' + (ok ? 'ok' : 'no');
          verdict2.innerHTML = ok
            ? '✓ 对上了。正确答案 <span class="actual">' + answer.toFixed(digits) + ' ' + (q.unit || '') + '</span>'
            : '✗ 你的答案 ' + v + '，差 ' + Math.abs(v - answer).toFixed(digits) + '。正确答案 <span class="actual">' + answer.toFixed(digits) + ' ' + (q.unit || '') + '</span>';
          showExplain();
          refreshScore();
        });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') btn.click(); });
        row2.appendChild(inp); row2.appendChild(unit); row2.appendChild(btn);
        card.appendChild(row2);
        card.appendChild(verdict2);
        if (mine[q.id] && mine[q.id].locked) {
          verdict2.className = 'verdict ' + (mine[q.id].right ? 'ok' : 'no');
          verdict2.innerHTML = (mine[q.id].right ? '✓ 对上了。' : '✗ 之前答错过。') +
            '正确答案 <span class="actual">' + answer.toFixed(digits) + ' ' + (q.unit || '') + '</span>';
          showExplain();
        }

      } else {
        var ta = el('textarea', {
          rows: 3, placeholder: '先自己写出来再展开（这里不会判对错，是你自己的思考记录）',
          style: 'width:100%;font:inherit;font-size:.87rem;padding:8px 10px;border:1px solid var(--line-strong);border-radius:6px;background:var(--bg);color:var(--fg);resize:vertical'
        });
        if (mine[q.id] && mine[q.id].raw) ta.value = mine[q.id].raw;
        ta.addEventListener('input', function () {
          mine[q.id] = { raw: ta.value };
          saveStore(store);
        });
        card.appendChild(ta);
        var row3 = el('div', { class: 'qrow' });
        var b3 = el('button', { class: 'btn primary', text: '看答案要点' });
        b3.addEventListener('click', function () {
          showExplain();
          if (!container) {
            var container = el('div', { class: 'explain', style: 'border-left-color:var(--warn)' });
            container.appendChild(el('div', { style: 'font-weight:660;margin-bottom:6px', text: '答案要点（逐条对照，缺哪条回哪一节）' }));
            var ul = el('ul', { class: 'points' });
            (q.points || []).forEach(function (pt) { ul.appendChild(el('li', { html: KB.md.inline(pt) })); });
            container.appendChild(ul);
            card.insertBefore(container, explainBox);
          }
          b3.disabled = true;
          b3.textContent = '要点已展开';
        });
        row3.appendChild(b3);
        card.appendChild(row3);
      }

      if (q.src) card.appendChild(el('div', { class: 'qsrc', html: '出处：' + KB.md.inline(q.src) }));
      list.appendChild(card);
    });

    host.appendChild(scoreEl);
    host.appendChild(list);
    refreshScore();
  }

  KB.quiz = { mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
