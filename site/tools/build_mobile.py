# -*- coding: utf-8 -*-
"""
build_mobile.py —— 把新的独立页（index / k01 / k02 / k03 / a1）各打包成
「一个自包含的 HTML 文件」，供手机端离线观看。

用法：
    python tools/build_mobile.py                # 输出到 site/dist/mobile/
    python tools/build_mobile.py -o XDIR        # 自定义输出目录

产出：
    dist/mobile/index.html · k01.html · k02.html · k03.html · a1.html

    每个文件自带 CSS/JS，零外部依赖；文件名与原站一致、放在同一目录，
    所以页面里的 <a href="k01.html"> 之类链接**不用改**就能互相跳转。

    为什么不合并成一个文件：五页共用同一套顶层全局名（$ / $$ / SCENE_INIT /
    SCENE_NAMES / go …）和同一批 id（#themeBtn / #dots …）。强行塞进一个文档会
    互相覆盖、getElementById 只认第一个 —— 结果就是只有最后一课能跑，且不报错。

安全底线（与旧 build_single.py 一致）：
  * 源码零改动：手机补丁只注入产物，不动 site/ 下任何原文件
  * JS 内联前处理两处 HTML 解析陷阱：</script 与 <!- -
"""

import argparse
import io
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)

PAGES = ['index.html', 'k01.html', 'k02.html', 'k03.html', 'a1.html']


def read(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        return f.read()


# --------------------------------------------------------------- 移动端补丁
# 只出现在产物里，不回写源 CSS。针对这套页面的类名写：
#   .top-nav / .scene-footer（固定栏）、.scene（正文）、.card、
#   .btn / .nav-btn / .quiz-opt / .dot（触摸目标）、table、.fig（横向溢出）
MOBILE_CSS = """
/* ============================================================
 * 手机端补丁（build_mobile.py 注入，只存在于单文件版）
 * 1) iOS 横屏自动放大字号 —— 关掉
 * 2) 刘海 / 底部手势条 —— 固定栏与正文避开安全区
 * 3) 手指点不准 —— 抬高按钮、选项、滑块的触摸区
 * 4) 顶/底固定栏的毛玻璃 —— iOS Safari 要 -webkit- 前缀
 * 5) 窄屏溢出 —— 表格、SVG 图、矩阵自己横向滚，不许带着整页滚
 * ========================================================== */
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body { overflow-wrap: break-word; }

/* 固定栏毛玻璃前缀 */
.top-nav, .scene-footer, .card, .nav-btn { -webkit-backdrop-filter: blur(10px); }

/* 安全区：刘海屏不被盖、底部留出手势条 */
@supports (padding: max(0px)) {
  .top-nav {
    padding-top: max(10px, env(safe-area-inset-top));
    padding-left: max(16px, env(safe-area-inset-left));
    padding-right: max(16px, env(safe-area-inset-right));
  }
  .scene-footer {
    padding-bottom: max(14px, env(safe-area-inset-bottom));
    padding-left: max(16px, env(safe-area-inset-left));
    padding-right: max(16px, env(safe-area-inset-right));
  }
  .scene {
    padding-left: max(14px, env(safe-area-inset-left));
    padding-right: max(14px, env(safe-area-inset-right));
  }
}

/* 手指友好的最小点击区 */
.btn, .nav-btn, .quiz-opt, .map-card, select, input[type=range] { min-height: 44px; }
.slider-wrap input[type=range] { padding: 12px 0; }
.dot { width: 13px; height: 13px; }
.dots { gap: 10px; }

@media (max-width: 860px) {
  .scene { padding: 78px 14px 112px; }
  .card { padding: 15px; }
  .scene-title { line-height: 1.2; }
  .cover-title { line-height: 1.1; }

  /* 表格在窄屏自己横向滚 */
  table.num, table.cmp { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }

  /* 内联 SVG 图：保证最小可读宽度，超出部分让它自己滚 */
  .fig { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .fig svg { min-width: 460px; }

  /* 矩阵 / 条形图 / 代码块 */
  .matrix-wrap, .bars, pre { overflow-x: auto; -webkit-overflow-scrolling: touch; }

  /* 统计块两列排（若页面用了 4 列 1fr 的 stat-row） */
  .stat-row { grid-template-columns: 1fr 1fr; gap: 10px; }

  /* 顶栏：手机上收起副标题，标题单行省略，别挤成两行 */
  .top-nav { gap: 8px; }
  .brand-text small { display: none; }
  .brand-text { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}

@media print { .top-nav, .scene-footer { display: none !important; } }
"""


def inline_assets(html):
    """把 <link rel=stylesheet> 与 <script src> 换成内联；返回 (html, n_css, n_js)。"""
    def css_rep(m):
        href = m.group(1)
        p = os.path.normpath(os.path.join(SITE, href))
        if not os.path.exists(p):
            raise SystemExit('找不到 CSS：%s → %s' % (href, p))
        css = read(p)
        css = re.sub(r'/\*#\s*sourceMappingURL=[^*]*\*/', '', css).strip()
        assert '</style' not in css.lower(), 'CSS 含 </style，会截断：' + href
        return '<style>\n/* ==== 内联自 %s ==== */\n%s\n</style>' % (href, css)

    html, n_css = re.subn(
        r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>', css_rep, html)

    def js_rep(m):
        href = m.group(1)
        p = os.path.normpath(os.path.join(SITE, href))
        if not os.path.exists(p):
            raise SystemExit('找不到 JS：%s → %s' % (href, p))
        js = read(p)
        js = re.sub(r'//#\s*sourceMappingURL=.*', '', js)
        # 两处 HTML 解析陷阱：</script 与 <!--
        if '</script' in js.lower():
            js = re.sub(r'</(?=script)', r'<\\/', js, flags=re.I)
        if '<!--' in js:
            js = js.replace('<!--', '<\\!--')
        assert '</script' not in js.lower(), '转义失败：%s 仍含 </script' % href
        assert '<!--' not in js, '转义失败：%s 仍含 <!--' % href
        return '<script>\n/* ==== 内联自 %s ==== */\n%s\n</script>' % (href, js.rstrip())

    html, n_js = re.subn(r'<script\s+src="([^"]+)"></script>', js_rep, html)
    return html, n_css, n_js


def build_page(name, out_dir):
    html = read(os.path.join(SITE, name))
    html, n_css, n_js = inline_assets(html)

    # 手机专属 head 调整
    html = html.replace(
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="format-detection" content="telephone=no">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="color-scheme" content="light dark">')

    # 注入手机补丁（放在所有样式之后，保证覆盖）
    assert '</head>' in html, '缺少 </head>：' + name
    html = html.replace('</head>', '<style>\n%s\n</style>\n</head>' % MOBILE_CSS, 1)

    assert '<link rel="stylesheet"' not in html, '还有未内联的 stylesheet：' + name
    assert '<script src=' not in html, '还有未内联的 script：' + name

    out = os.path.join(out_dir, name)
    with io.open(out, 'w', encoding='utf-8', newline='') as f:
        f.write(html)
    return out, n_css, n_js, os.path.getsize(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('-o', '--out', default=os.path.join(SITE, 'dist', 'mobile'))
    args = ap.parse_args()
    out_dir = os.path.abspath(args.out)
    if not os.path.isdir(out_dir):
        os.makedirs(out_dir)

    print('输出目录：' + out_dir)
    total = 0
    for name in PAGES:
        out, nc, nj, size = build_page(name, out_dir)
        total += size
        print('  OK  %-12s  CSS %d  JS %d  %6.1f KB' % (name, nc, nj, size / 1024.0))
    print('合计 %.2f MB / %d 个文件' % (total / 1048576.0, len(PAGES)))


if __name__ == '__main__':
    main()
