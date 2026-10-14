# -*- coding: utf-8 -*-
"""
build_single.py —— 把 site/ 打包成「一个 HTML 文件」，给手机端看。

用法：
    python tools/build_single.py            # 默认输出 site/dist/CS224N-mobile.html
    python tools/build_single.py -o X.html  # 自定义输出

产出特征：
  * 单个 .html，所有 CSS / JS / 字体全部内联 —— 拷给谁都能离线打开
  * 手机上直接用浏览器打开即能用（也可从微信/QQ 里「用其他应用打开」）
  * 源码零改动：手机专属补丁只注入产物，不动 site/ 下任何原文件

内联清单（顺序即原 index.html 的加载顺序，不可调换）：
    vendor/katex/katex.min.css    字体 → data URI（只留 woff2，删掉 woff/ttf）
    css/base.css  css/layout.css  css/components.css  css/viz.css
    vendor/katex/katex.min.js  vendor/markdown-it.min.js
    js/core/k01_core.js  js/ui/util.js  js/ui/md.js
    data/k01.js  data/freq.js
    js/viz/k01_viz.js  js/ui/quiz.js  js/ui/app.js
"""

import argparse
import base64
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)          # site/
SITE = ROOT


def read(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        return f.read()


def read_b(p):
    with io.open(p, 'rb') as f:
        return f.read()


def sp(p):
    return os.path.join(SITE, p)


# ---------------------------------------------------------------- 移动端补丁
# 只在打包产物里出现。全是「窄屏/触摸/iOS」相关的增强，
# 桌面宽度下大部分不生效，剩下的也是无害的，所以没有写回源 CSS。
MOBILE_CSS = """
/* ============================================================
 * 手机端补丁（build_single.py 注入，只存在于单文件版）
 * ------------------------------------------------------------
 * 1) iOS 横屏会自动放大字号 —— 关掉
 * 2) iPhone 刘海/底部横条 —— 让顶栏与内容避开安全区
 * 3) 触摸目标 < 44px 手指点不准 —— 抬高按钮与选项
 * 4) 顶栏毛玻璃要 -webkit- 前缀，iOS Safari 才认
 * 5) 长英文串 / 长公式不许把页面撑宽
 * ========================================================== */
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }

/* 任何块层的长串都必须能断行，否则一个 URL 就能撑出横向滚动 */
.content, .content * { overflow-wrap: break-word; word-break: break-word; }

/* iOS Safari 的毛玻璃要带前缀 */
.topbar { -webkit-backdrop-filter: blur(10px); }

/* 手指友好的最小点击区 */
.opt, .btn, .viz button, select, input[type=range] { min-height: 44px; }
.ctl input[type=range] { padding: 10px 0; }

/* 刘海屏：内容不被盖住，底部留出手势条的位置 */
@supports (padding: max(0px)) {
  .topbar { padding-top: max(10px, env(safe-area-inset-top)); padding-left: max(15px, env(safe-area-inset-left)); padding-right: max(15px, env(safe-area-inset-right)); }
  .content { padding-left: max(17px, env(safe-area-inset-left)); padding-right: max(17px, env(safe-area-inset-right)); padding-bottom: max(30px, env(safe-area-inset-bottom)); }
  .sidebar { padding-top: max(14px, env(safe-area-inset-top)); padding-bottom: max(14px, env(safe-area-inset-bottom)); }
}

@media (max-width: 860px) {
  /* 矩阵、SVG、代码块在窄屏里允许自己横向滚，不许带着整页一起滚 */
  .mx, .tree-svg, pre, .bars { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .stat-row { grid-template-columns: 1fr 1fr; gap: 10px; }
  .stat { padding: 11px 13px; }
  .stat .sv { font-size: 1.25rem; }
  /* 顶栏：手机上只留「☰ + 标题 + 进度 + 开关」。
     `.sub` 那句「断网双击 index.html 即可」是桌面场景的说明，手机上（从微信/文件 App 打开）
     毫无意义，留着只会把标题挤成两行、说明挤成三行。
     进度条的图形也收起来 —— 「10/10 节」这几个字已经把同一件事说清楚了，
     省下的宽度让给标题，否则「词向量与分布语义」会被截成「词向量与分…」。 */
  .topbar { gap: 8px; }
  .topbar .sub { display: none; }
  .topbar .progress { display: none; }
  /* min-width:0 是让 flex 子项真的能收缩的前提（否则 h1 会顶穿顶栏） */
  .topbar .grow { min-width: 0; }
  .topbar .grow h1 {
    font-size: 1.02rem; line-height: 1.35; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
  }
  .topbar .progress-wrap { font-size: .72rem; }
  /* 段标题与正文的留白收紧，一屏多看两行 */
  .sec-title { margin-top: 30px; }
  .content { font-size: 16px; }
}

@media print { .topbar, .sidebar, .toc { display: none !important; } }
"""


# ---------------------------------------------------------------- 字体内联
WOFF2_SRC = re.compile(
    r'url\(fonts/(KaTeX_[A-Za-z0-9\-]+)\.woff2\)\s*format\("woff2"\),'
    r'\s*url\(fonts/\1\.woff\)\s*format\("woff"\),'
    r'\s*url\(fonts/\1\.ttf\)\s*format\("truetype"\)'
)


def inline_fonts(css):
    """把 @font-face 里的 woff2 换成 data URI，并丢掉 woff/ttf 两种回落。

    只保留 woff2 的理由：iOS 10+ / Android 5+ 全支持（覆盖率 ~98%）,
    而 woff+ttf 要多花 2 倍体积。真遇到不支持的机器，KaTeX 会退回
    系统衬线字体，公式仍可读，只是不再那么「教科书」。
    """
    seen = {}
    bag = {}

    def rep(m):
        name = m.group(1)
        seen[name] = 1
        p = sp('vendor/katex/fonts/%s.woff2' % name)
        if not os.path.exists(p):
            raise SystemExit('缺少字体文件：' + p)
        b64 = base64.b64encode(read_b(p)).decode('ascii')
        bag[name] = len(b64)
        return 'url(data:font/woff2;base64,%s) format("woff2")' % b64

    out, n = WOFF2_SRC.subn(rep, css)
    if n != 20:
        raise SystemExit('期望 20 条 @font-face，实际替换 %d 条 —— 正则没命中，中止（不产出残缺文件）' % n)
    return out, n, bag


# ---------------------------------------------------------------- 主流程
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('-o', '--out', default=os.path.join(ROOT, 'dist', 'CS224N-mobile.html'))
    args = ap.parse_args()

    html = read(sp('index.html'))

    # ---- 1. CSS：<link> → <style> ----
    links = re.findall(r'<link rel="stylesheet" href="([^"]+)">', html)
    if not links:
        raise SystemExit('index.html 里没找到 stylesheet link —— 中止')

    css_all = []
    for href in links:
        # href 可能是 css/../vendor/... 这种写法，normpath 能正确归一到 site/ 下
        p = os.path.normpath(os.path.join(SITE, href))
        if not os.path.exists(p):
            raise SystemExit('找不到 CSS：' + href + ' → ' + p)
        css_all.append('/* ===== 内联自 %s ===== */\n%s' % (href, read(p)))

    css_text = '\n'.join(css_all)

    # 字体只内联到 KaTeX 那段 CSS 里
    css_text, font_n, font_sizes = inline_fonts(css_text)

    # 顺手剥掉 markdown-it 之外的 sourcemap 注释（file:// 下会白请求一次）
    css_text = re.sub(r'/\*# sourceMappingURL=[^*]*\*/', '', css_text).strip()

    css_text += '\n' + MOBILE_CSS

    html = re.sub(r'<link rel="stylesheet" href="[^"]+">\s*', '', html)
    assert '<link rel="stylesheet"' not in html, '还有未内联的 stylesheet'
    assert '</style' not in css_text.lower(), 'CSS 里含 </style，会截断 <style> 块'
    html = html.replace('</head>', '<style>\n%s\n</style>\n</head>' % css_text)

    # ---- 2. JS：<script src> → <script> ----
    srcs = re.findall(r'<script src="([^"]+)"></script>', html)
    # katex / markdown-it + 算法层 + ui 层 + 3 份数据 + 交互层，顺序即依赖顺序
    # 硬判定：数量对不上就中止，防止「加了脚本但漏内联」这种静默失败。
    # 15 = katex + markdown-it
    #      + k01_core + a1_core + util + md
    #      + courses + k01.js + a1.js + freq
    #      + viz-kit + k01_viz + a1_viz + quiz + app
    if len(srcs) != 15:
        raise SystemExit('期望 15 个 <script src>，实际 %d 个 —— 中止（加/删脚本后要同步这里）' % len(srcs))
    # 数量对上也可能接错顺序：注册表必须在任何 data/kNN.js 之前，否则课程报不了到
    if not any('courses.js' in h for h in srcs):
        raise SystemExit('找不到 courses.js —— 课程注册表必须被内联，否则首页列不出课程')
    i_courses = next(i for i, h in enumerate(srcs) if 'courses.js' in h)
    i_k01 = next((i for i, h in enumerate(srcs) if 'data/k01.js' in h), len(srcs))
    if i_courses > i_k01:
        raise SystemExit('courses.js 排在 data/k01.js 之后 —— 顺序错了，每门课要能向注册表报到')
    # 第二条顺序硬判定：viz-kit 必须在任何 js/viz/*.js 之前。
    # 那些文件一加载就调用 KB.viz.register / KB.vizKit.panel，kit 还没加载就直接 TypeError，
    # 而且是在浏览器里才炸 —— 静默失败里最难查的一类。
    i_kit = next(i for i, h in enumerate(srcs) if 'viz-kit.js' in h)
    i_viz = [i for i, h in enumerate(srcs) if re.search(r'js/viz/', h)]
    if i_viz and min(i_viz) < i_kit:
        raise SystemExit('js/viz/*.js 排到了 js/ui/viz-kit.js 之前 —— 交互会在加载期就报错')

    for href in srcs:
        p = os.path.normpath(os.path.join(SITE, href))
        if not os.path.exists(p):
            raise SystemExit('找不到 JS：' + href)
        js = read(p)
        js = re.sub(r'//#\s*sourceMappingURL=.*\n?', '', js)

        # ---- 内联脚本的两处 HTML 解析陷阱 ----
        # HTML 在 <script> 里按「script data」状态读内容，遇到 <!-- 会转入 escaped 状态；
        # 若之后再出现 <script，就进入 double-escaped —— 那时 </script> 不再闭合脚本，
        # 整个页面会被这一个字符串吃掉。所以两个都要处理。
        low = js.lower()
        # </script：转成 <\/script（JS 字符串/正则里 \/ 都等于 /，语义不变）
        if '</script' in low:
            js = re.sub(r'</(?=script)', r'<\\/', js, flags=re.I)
        # <!--：转成 <\!--（JS 里 \! 是 identity escape，等于 !）
        if '<!--' in js:
            js = js.replace('<!--', '<\\!--')
        low = js.lower()
        assert '</script' not in low, '转义失败：%s 仍含 </script' % href
        assert '<!--' not in js, '转义失败：%s 仍含 <!--' % href
        marker = '<script src="%s"></script>' % href
        assert html.count(marker) == 1, '标记不唯一：' + href
        html = html.replace(marker, '<script>\n/* ===== 内联自 %s ===== */\n%s\n</script>' % (href, js.rstrip()))

    assert '<script src=' not in html, '还有未内联的 script'

    # ---- 3. 手机版专属的 head 调整 ----
    html = html.replace(
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="format-detection" content="telephone=no">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="color-scheme" content="light dark">'
    )

    # 单文件版的描述换个说法（"双击打开"是桌面场景的话）。
    # 这里**不再写死条数** —— 以前写「7 个交互实验」这种数字，加完 A1 就全错了，
    # 而且错了没有任何断言会发现（它只影响分享卡片上的一行字）。
    html = html.replace(
        'content="CS224N 的离线交互复习站：按知识点分课，每课十段式讲解、可动手的交互实验、公式逐项高亮、术语表与 Quiz。纯 HTML/CSS/JS，无后端，双击即可打开。"',
        'content="CS224N 离线交互复习站（手机单文件版）：分知识点与动手作业两条轨道，每页都有分段讲解、可动手的交互实验、公式逐项高亮、术语表与自测。零外部依赖，离线可用。"'
    )
    html = html.replace(
        '<title>CS224N · K01 词向量与分布语义 · 交互复习站</title>',
        '<title>CS224N · K01 词向量与分布语义（手机版）</title>'
    )

    # ---- 4. 写盘 ----
    out = os.path.abspath(args.out)
    d = os.path.dirname(out)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    with io.open(out, 'w', encoding='utf-8', newline='') as f:
        f.write(html)

    size = os.path.getsize(out)
    print('OK  ' + out)
    print('    内联 CSS 段 %d 个（字体 %d 条 @font-face → data URI）' % (len(links), font_n))
    print('    内联 JS   %d 个' % len(srcs))
    print('    产物大小   %.2f MB (%d 字节)' % (size / 1048576.0, size))
    FontKB = sum(font_sizes.values()) / 1024.0
    print('    其中字体   %.0f KB base64' % FontKB)


if __name__ == '__main__':
    main()
