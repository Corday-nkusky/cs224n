/* ============================================================
 * courses.js —— 全 12 个知识点的元数据清单（课程注册表）
 * ------------------------------------------------------------
 * 为什么单独一个文件：
 *   以前这份清单是硬编码在 app.js 的 renderCourseTree() 里的一个字面量数组，
 *   于是「做完了 K02」这件事实要回到 UI 代码里改 false → true。
 *   注册表应该属于数据层：UI 只遍历它，不认识任何一门具体的课。
 *
 * status 不在本文件里写 —— 它由运行时派生：
 *   KB.chapters[id] 存在 ⇒ ready，否则 planned。
 *   这样做完一门课就自动上线，不用改两个地方。
 * ============================================================ */
(function (global) {
  'use strict';
  var KB = global.KB = global.KB || {};

  KB.courses = [
    { id: 'k01', no: 'K01', title: '词向量与分布语义', tags: 'Lecture 1–2' },
    { id: 'k02', no: 'K02', title: '神经网络与反向传播', tags: 'Lecture 3' },
    { id: 'k03', no: 'K03', title: '语言模型与 RNN', tags: 'Lecture 4' },
    { id: 'k04', no: 'K04', title: '注意力与 Transformer', tags: 'Lecture 5' },
    { id: 'k05', no: 'K05', title: '预训练', tags: 'Lecture 7' },
    { id: 'k06', no: 'K06', title: '后训练', tags: 'Lecture 8' },
    { id: 'k07', no: 'K07', title: 'PEFT 与 LoRA', tags: 'Lecture 9' },
    { id: 'k08', no: 'K08', title: 'RAG 与 Agent', tags: 'Lecture 10' },
    { id: 'k09', no: 'K09', title: '评测', tags: 'Lecture 11' },
    { id: 'k10', no: 'K10', title: '推理模型', tags: 'Lecture 12–13' },
    { id: 'k11', no: 'K11', title: '分词与多语言', tags: 'Lecture 14' },
    { id: 'k12', no: 'K12', title: '影响与开放问题', tags: 'Lecture 16 / 19' },

    /* ---- 第二条轨道：动手作业 ----
     * kind: 'task' 让地址前缀变成 #/a/<id>（知识点是 #/c/<id>），
     * 也让侧栏把它单独归到「动手作业」一组。
     * parent 是它对应的知识点 —— 两端的互相跳转全靠这一个字段：
     *   作业页 →「对应知识点：K01」，K01 页 →「配套动手作业：A1」。
     * K02–K12 没写 kind 就默认 'topic'，所以老课一条都不用改。 */
    { id: 'a1', no: 'A1', title: '词向量作业：从共现矩阵到 GloVe', tags: 'Assignment 1', kind: 'task', parent: 'k01' }
  ];

  /** 第一门已 readiness 的课程（用作兜底落点） */
  KB.firstReadyCourse = function () {
    var list = KB.courses || [];
    for (var i = 0; i < list.length; i++) if (KB.chapters && KB.chapters[list[i].id]) return list[i].id;
    return list.length ? list[0].id : '';
  };

  /** 某门课是否已开工（有数据文件加载过） */
  KB.courseReady = function (id) {
    return !!(KB.chapters && KB.chapters[id]);
  };
})(typeof window !== 'undefined' ? window : globalThis);
