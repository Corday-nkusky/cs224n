# -*- coding: utf-8 -*-
"""反向对照：把三处「多课程改造」故意改回旧写法，确认 A-2 / A-12 / G2-8 真的会变红。

用法（两句用 ; 连起来跑，保证无论测试怎么挂都会还原）：
    python tests/_reverse_control.py break && node tests/smoke.mjs ; python tests/_reverse_control.py restore

为什么必须做这件事：断言写错方向（永远为真）在正常跑里看不出来 ——
全绿和全绿长得一模一样。这是唯一能区分「测试真的在测」和「测试在装样子」的办法。

选这几处，是因为它们各自对应一件**用户能看见的**事：
  A-2   标签页标题是不是全站标题（不该带某一门课的编号）
  A-12  二级目录是不是真的嵌在当前课程下面（不是平铺在清单末尾）
  G2-8  「这一页怎么来的」是不是项目全局页（不该顶着某门课的编号）

⚠️ **注入要能真的生效**（踩过）：第一版把 A-2 的注入写成"只改 index.html 的静态 <title>"，
   结果 A-2 依旧全绿 —— 因为 renderTopbar 会动态覆盖 document.title，
   静态 title 根本轮不到生效。所以 A-2 必须**两条一起注入**：
   静态 title 改回带 K01 的旧串 **且** 去掉动态赋值，才是完整的"退回旧写法"。
   （这也说明反向对照本身要检查预期：该红的那条没红，是注入错了，不是断言错了。）
"""
import os
import sys
import shutil

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CSS = os.path.join(SITE, 'css', 'layout.css')
HTML = os.path.join(SITE, 'index.html')
APP = os.path.join(SITE, 'js', 'ui', 'app.js')

# (文件, 正确写法, 旧写法, 应该出现几次)  —— count 不精确命中就中止，绝不"猜着改"
BREAKS = [
    # —— A-2：退回「整站的标签页标题写死在 index.html 里且带着 K01」——
    # 必须两处一起改：只改静态 title 是无效注入（renderTopbar 会覆盖它）。
    (HTML,
     '<title>CS224N 交互复习站</title>',
     '<title>CS224N · K01 词向量与分布语义 · 交互复习站</title>',
     1),
    (APP,
     "    document.title = isHome\n"
     "      ? 'CS224N 交互复习站 · 全部课程'\n"
     "      : (inCourse\n"
     "        ? 'CS224N · ' + courseNo() + ' ' + ((ch && ch.title) || '') + ' · 交互复习站'\n"
     "        : 'CS224N 交互复习站');\n",
     "    /* reverse-control：不再随路由更新标签页标题 */\n",
     1),
    # —— A-12：当前课程不展开二级目录（课程树只剩一级）——
    (APP,
     "    var openCourse = isCourseRoute() ? CURR : '';",
     "    var openCourse = '';   /* reverse-control：任何课程都不展开二级目录 */",
     1),
    # —— G2-8：关于页退回「顶着当前课程编号」——
    (APP,
     "    $content.appendChild(pageHead('CS224N 交互复习站', '这一页怎么来的',",
     "    $content.appendChild(pageHead('CS224N · ' + courseNo(), '这一页怎么来的',",
     1),
]


def read(p):
    with open(p, 'r', encoding='utf-8', newline='') as f:
        return f.read()


def write(p, s):
    with open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(s)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    if mode not in ('break', 'restore'):
        raise SystemExit('用法：_reverse_control.py break|restore')

    if mode == 'break':
        # 先整体备份，再改写 —— 中途 assert 失败也不会留下半改状态
        for p in {CSS, HTML, APP}:
            shutil.copyfile(p, p + '.rcbak')
        for p, good, bad, n in BREAKS:
            s = read(p)
            assert s.count(good) == n, '%s 里正确写法出现 %d 次（期望 %d）—— 不精确命中，中止' % (
                os.path.basename(p), s.count(good), n)
            write(p, s.replace(good, bad))
            print('  已改回旧写法：' + os.path.relpath(p, SITE))
        print('反向对照已布置 —— 接下来 A-2 / A-12 / G2-8 应该变红（其余应仍绿）。')
    else:
        for p in {CSS, HTML, APP}:
            if os.path.exists(p + '.rcbak'):
                shutil.copyfile(p + '.rcbak', p)
                os.remove(p + '.rcbak')
                print('  已还原：' + os.path.relpath(p, SITE))


if __name__ == '__main__':
    main()
