# -*- coding: utf-8 -*-
"""一次性补丁：把「猜数据事实」改成「读实测结论」。
纪律：只按行锚点定位，改完立刻用 node --check 验语法。"""
import io

P = r'D:\code\cs224n\site\data\k01.js'
text = io.open(P, encoding='utf-8', newline='').read()
lines = text.splitlines(True)
orig_len = len(lines)

def find(pred, start=0):
    for i in range(start, len(lines)):
        if pred(lines[i]):
            return i
    raise SystemExit('锚点没找到: ' + repr(pred))

L = "\u201c"   # “
R = "\u201d"   # ”

# ---------- 1. 第 6 段标题：不再宣称全是"先猜后对" ----------
i = find(lambda l: "id: 'numbers', num: 6" in l)
assert "\u6570\u503c\u4f8b\u5b50\uff08\u5148\u731c\u540e\u5bf9\uff09" in lines[i]
lines[i] = lines[i].replace("\u6570\u503c\u4f8b\u5b50\uff08\u5148\u731c\u540e\u5bf9\uff09", "\u6570\u503c\u4f8b\u5b50")

# ---------- 2. 段首 note 改成"两半"说明 ----------
i = find(lambda l: "title: '\u89c4\u77e9\uff1a\u5148\u5199\u4f60\u7684\u731c\u6d4b\uff0c\u518d\u770b\u5b9e\u6d4b'" in l)
assert "logs/*.txt" in lines[i + 1], 'note 不是两行？'
note = [
    "        { t: 'note', tone: 'key', title: '\u5206\u4e24\u534a\uff1a\u80fd\u81ea\u5df1\u7b97\u7684\uff0c\u548c\u5b9e\u6d4b\u7ed9\u4f60\u8bfb\u7684', md: r`**\u4e0a\u534a\u6bb5\u4e09\u9053\u9898**\u53ea\u8003\u6982\u5ff5\uff0c\u7b54\u6848\u5728\u8111\u5b50\u91cc\u5c31\u80fd\u60f3\u51fa\u6765 \u2014\u2014 \u5148\u7ed9\u4e00\u4e2a\u6570\u518d\u770b\u5bf9\u8d26\uff0c\u731c\u9519\u6b63\u597d\u8bf4\u660e\u524d\u9762\u6709\u6d1e\u3002\n",
    "**\u4e0b\u534a\u6bb5\u56db\u4e2a\u6570**\u662f\u5b9e\u6d4b\u7ed3\u8bba\uff1a\u5b83\u4eec\u4f9d\u8d56\u8bcd\u9891\u8868\u6216 SVD\uff0c**\u63a8\u4e0d\u51fa\u6765\u4e5f\u4e0d\u9700\u8981\u63a8** \u2014\u2014 \u76f4\u63a5\u8bfb\uff0c\u91cd\u70b9\u662f\u60f3\u660e\u767d" + L + "\u8fd9\u4e2a\u6570\u4e3a\u4ec0\u4e48\u662f\u5b83" + R + "\u3002\n",
    "\u6240\u6709\u5b9e\u6d4b\u503c\u90fd\u7531 <code>js/core/k01_core.js</code> \u672c\u9875\u73b0\u7b97\uff0c\u4e0e <code>logs/*.txt</code> \u9010\u4f4d\u5bf9\u8fc7\u8d26\uff08\u89c1 tests/core.test.js \u7684 118 \u6761\u65ad\u8a00\uff09\u3002` },\n",
]
lines[i:i + 2] = note

# ---------- 3. 删掉四道"猜数据事实"的题 ----------
a = find(lambda l: "id: 'p-cos'" in l)
b = find(lambda l: "id: 'p-cost'" in l)
assert b > a
removed = b - a
del lines[a:b]
assert removed > 30, removed

# ---------- 4. 在 p-cost 之后补一张"实测结论"表 ----------
i = find(lambda l: "run_numpy_out.txt\u3001logs/k01_huffman_neg_out.txt \u5b9e\u9a8c D" in l)
table = [
    "\n",
    "        { t: 'h', md: '\u4e0a\u9762\u4e09\u9053\u80fd\u81ea\u5df1\u7b97\uff0c\u4e0b\u9762\u56db\u4e2a\u662f**\u5b9e\u6d4b\u7ed3\u8bba** \u2014\u2014 \u4e0d\u7528\u731c\uff0c\u8981\u8bfb\u61c2' },\n",
    "        { t: 'table', head: ['\u91cf', '\u5b9e\u6d4b\u503c', '\u8fd9\u4e2a\u6570\u5728\u8bf4\u4ec0\u4e48'], rows: [\n",
    "          ['2 \u7ef4\u4e0b <code>like</code>\u2013<code>enjoy</code> \u7684\u4f59\u5f26', '1.0000',\n",
    "           '21 \u4e2a\u8bcd\u5bf9\u91cc 9 \u5bf9\u7684 $|\\\\cos|=1$\\uff0842.9%\\uff09\u3002**\u964d\u7ef4\u628a" + L + "\u50cf\u4e0d\u50cf" + R + "\u538b\u6210\u4e86" + L + "\u50cf / \u4e0d\u50cf" + R + "**\\uff0c\u4e2d\u95f4\u5730\u5e26\u6574\u6bb5\u6d88\u5931 \u2014\u2014 \u8fd9\u6b63\u662f" + L + "\u7ef4\u5ea6\u865a\u9ad8" + R + "\u7684\u5178\u578b\u75c7\u72b6'],\n",
    "          ['\u4fdd\u7559\u524d 1 \u4e2a\u5947\u5f02\u503c\u7684\u91cd\u6784\u8bef\u5dee $\\\\lVert X-X_1\\\\rVert_F$', '3.3208',\n",
    "           '\u5b8c\u6574\u5e8f\u5217 3.3208 \u2192 2.0140 \u2192 1.6225 \u2192 1.0996 \u2192 0.7775 \u2192 **0 \u2192 0**\uff1a\u5355\u8c03\u4e0b\u964d\uff0c**$k$ \u4e00\u5230\u77e9\u9635\u7684\u79e9\uff086\uff09\u8bef\u5dee\u5c31\u7cbe\u786e\u5f52\u96f6**'],\n",
    "          ['$\\\\alpha=0.75$ \u65f6 <code>the</code> \u7684\u91c7\u6837\u6982\u7387', '2.715%',\n",
    "           '\u7eaf\u8bcd\u9891\uff08$\\\\alpha=1$\uff09\u662f 6.880%\uff0c\u5747\u5300\uff08$\\\\alpha=0$\\uff09\u662f 0.050%\u3002$\\\\alpha<1$ **\u538b\u9ad8\u9891\u3001\u62ac\u4f4e\u9891**\uff0c\u5206\u5e03\u71b5\u4ece 5.8683 \u5347\u5230 6.7838'],\n",
    "          ['\u54c8\u592b\u66fc\u6811\u6309\u8bcd\u9891\u52a0\u6743\u7684\u5e73\u5747\u8def\u5f84\u957f', '8.491 \u5c42',\n",
    "           '\u5e73\u8861\u6811\u6bcf\u8bcd\u6052\u4e3a 11.0 \u5c42 \u2192 **\u7701 22.8%**\u3002\u8bba\u6587\u53e3\u5f84 $8.491 \\\\le \\\\log_2 2000 = 10.966$ \u6210\u7acb']\n",
    "        ], note: r`\u56db\u4e2a\u503c\u90fd\u7531 <code>js/core/k01_core.js</code> \u73b0\u7b97\uff0c\u4e0e <code>logs/*.txt</code> \u9010\u4f4d\u5bf9\u8fc7\u8d26\u3002**\u5b83\u4eec\u7684\u7528\u5904\u662f\u5f53\u5224\u636e**\uff1a\u4ee5\u540e\u770b\u5230" + L + "\u4f59\u5f26\u5168\u662f 1.0" + R + "\u5c31\u5148\u6570\u975e\u96f6\u5750\u6807\uff0c\u770b\u5230" + L + "\u8bef\u5dee\u4e0d\u964d\u4e86" + R + "\u5c31\u5148\u60f3\u79e9\u3002` },\n",
]
lines[i + 1:i + 1] = table

# ---------- 5. Quiz q7：数值题 → 概念题 ----------
a = find(lambda l: "{ id: 'q7'," in l)
b = find(lambda l: "{ id: 'q8'," in l)
q7 = [
    "    { id: 'q7', kind: 'choice', q: r`\u628a\u8d1f\u91c7\u6837\u7684\u91c7\u6837\u5206\u5e03\u4ece\u7eaf\u8bcd\u9891\uff08$\\\\alpha=1$\uff09\u6362\u6210 $U(w)^{3/4}$\uff08$\\\\alpha=0.75$\uff09\uff0c\u6700\u9ad8\u9891\u8bcd <code>the</code> \u88ab\u91c7\u5230\u7684\u6982\u7387\u4f1a\u600e\u4e48\u53d8\uff1f`,\n",
    "      options: [\n",
    "        '\u53d8\u9ad8 \u2014\u2014 3/4 \u6b21\u65b9\u4f1a\u653e\u5927\u9ad8\u9891\u8bcd\u7684\u6743\u91cd',\n",
    "        '\u53d8\u4f4e \u2014\u2014 $\\\\alpha<1$ \u628a\u5206\u5e03\u62c9\u5e73\uff0c\u9ad8\u9891\u8bcd\u88ab\u538b\u4e0b\u53bb\uff08\u5b9e\u6d4b 6.880% \u2192 2.715%\uff09',\n",
    "        '\u4e0d\u53d8 \u2014\u2014 \u5f52\u4e00\u5316\u4e4b\u540e\u6bcf\u4e2a\u8bcd\u7684\u6bd4\u4f8b\u662f\u56fa\u5b9a\u7684',\n",
    "        '\u8981\u770b\u8bcd\u8868\u5927\u5c0f\uff0c\u6ca1\u6709\u786e\u5b9a\u65b9\u5411'\n",
    "      ], answer: 1,\n",
    "      explain: r`$U(w)^{3/4}$ \u662f**\u51f9\u51fd\u6570**\uff1a\u4efb\u4f55 $x\\\\in(0,1)$ \u90fd\u6709 $x^{3/4}>x$\uff0c\u6240\u4ee5\u5b83\u628a**\u5c0f\u7684\u6570\u62ac\u8d77\u6765\u3001\u5927\u7684\u6570\u76f8\u5bf9\u538b\u4e0b\u53bb**\u3002\u5f52\u4e00\u5316\u540e the \u4ece **6.880% \u2192 2.715%**\uff08\u964d\u5230 1/2.53\uff09\uff0c\u800c queen \u4ece 0.008% \u62ac\u5230 **0.017%**\u3002\n",
    "\u673a\u5236\u7684\u91cd\u70b9\u662f**\u538b\u9ad8\u9891\uff0c\u4e0d\u662f\u62ac\u4f4e\u9891** \u2014\u2014 \u9ad8\u9891\u8bcd\u88ab\u538b\u4e0b\u53bb\u4e4b\u540e\uff0c\u4f4e\u9891\u8bcd\u5728\u5f52\u4e00\u5316\u91cc\u81ea\u7136\u5360\u66f4\u5927\u4efd\u989d\u3002` },\n",
    "\n",
]
lines[a:b] = q7

# ---------- 6. Quiz q13：数格子 → 概念题 ----------
a = find(lambda l: "{ id: 'q13'," in l)
b = find(lambda l: "{ id: 'q14'," in l)
q13 = [
    "    { id: 'q13', kind: 'choice', q: r`\u90a3\u4e2a 7\u00d77 \u5171\u73b0\u77e9\u9635\u975e\u96f6\u5143\u7d20\u53ea\u5360 24.5%\u3002**\u8bcd\u8868\u6269\u5927 100 \u500d\u65f6\uff0c\u975e\u96f6\u5360\u6bd4\u4f1a\u600e\u4e48\u53d8\uff1f**`,\n",
    "      options: [\n",
    "        '\u53d8\u5927 \u2014\u2014 \u8bcd\u591a\u4e86\u5171\u73b0\u5bf9\u5c31\u591a',\n",
    "        '\u4e0d\u53d8 \u2014\u2014 \u7a00\u758f\u7387\u53ea\u8ddf\u7a97\u53e3\u5927\u5c0f\u6709\u5173',\n",
    "        '\u53d8\u5c0f \u2014\u2014 \u8bcd\u8868\u53d8\u5927\u65f6\u65b0\u8bcd\u5927\u591a\u5f7c\u6b64\u6ca1\u89c1\u8fc7\u9762\uff0c\u7edd\u5927\u591a\u6570\u683c\u5b50\u662f 0',\n",
    "        '\u5148\u53d8\u5927\u518d\u53d8\u5c0f'\n",
    "      ], answer: 2,\n",
    "      explain: r`7 \u4e2a\u8bcd\u65f6\u7a97\u53e3 1 \u5df2\u7ecf\u80fd\u8986\u76d6 24.5%\uff0c\u56e0\u4e3a\u6bcf\u4e2a\u8bcd\u90fd\u80fd\u78b0\u4e0a\u51e0\u4e2a\u90bb\u5c45\uff1b\u771f\u5b9e\u8bcd\u8868 50 \u4e07\u65f6\uff0c\u4e00\u4e2a\u8bcd\u901a\u5e38\u53ea\u8ddf\u6781\u5c11\u6570\u8bcd\u5171\u73b0\uff0c\u975e\u96f6\u5360\u6bd4\u6389\u5230\u4e07\u5206\u4e4b\u4e00\u91cf\u7ea7\u3002\n",
    "\u26a0\ufe0f \u4e0b\u9762\u8fd9\u4e2a\u533a\u5206\u5f88\u5bb9\u6613\u6df7\uff1a**\u7a00\u758f\u662f" + L + "\u652f\u6491" + R + "\u5c42\u9762**\uff08\u591a\u5c11\u683c\u5b50\u975e\u96f6\uff09\uff0c**\u79e9\u662f" + L + "\u7ebf\u6027\u76f8\u5173" + R + "\u5c42\u9762**\uff08\u884c\u5411\u91cf\u6709\u6ca1\u6709\u91cd\u53e0\u65b9\u5411\uff09\u3002\u8fd9\u4e2a\u77e9\u9635\u975e\u96f6 24.5%\uff0c\u4f46\u79e9\u53ea\u6709 6 \u2014\u2014 \u4e24\u4ef6\u4e8b\u5b8c\u5168\u72ec\u7acb\u3002` },\n",
    "\n",
]
lines[a:b] = q13

io.open(P, 'w', encoding='utf-8', newline='').write(''.join(lines))
print('OK  行数 %d -> %d' % (orig_len, len(lines)))
