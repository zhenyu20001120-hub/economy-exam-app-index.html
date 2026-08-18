#!/usr/bin/env python3
# 把 5 份 PDF 每一页都渲染成 PNG，便于我逐页"看图转写"。
import os, pymupdf as fitz

SRC = r"C:\Users\Johnny\Desktop\20260818中级师考试"
OUT = os.path.join(os.path.dirname(__file__), "pages")
os.makedirs(OUT, exist_ok=True)

PDFS = [
    ("12m", "12【章节母题】2026新大纲 中经工商~乐橙网.pdf"),
    ("07m", "07【考前模考卷1】2026新大纲 中经工商~乐橙网.pdf"),
    ("08m", "08【考前模考卷2】2026新大纲 中经工商~乐橙网.pdf"),
    ("09m", "09【提分密训卷1】2026新大纲 中经工商~乐橙网.pdf"),
    ("10m", "10【提分密训卷2】2026新大纲 中经工商~乐橙网.pdf"),
]

if __name__ == "__main__":
    for tag, name in PDFS:
        d = fitz.open(os.path.join(SRC, name))
        n = len(d)
        for i in range(n):
            out = os.path.join(OUT, f"{tag}_p{i+1:03d}.png")
            if os.path.exists(out) and os.path.getsize(out) > 50000:
                continue
            pix = d[i].get_pixmap(dpi=150)
            pix.save(out)
        print(f"{tag}  {n} pages rendered -> {OUT}")
