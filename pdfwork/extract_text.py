#!/usr/bin/env python3
# 把 5 份 PDF 抽成纯文本，存到 pdfwork/<name>.txt，便于分析版式。
import sys, os, glob, json
import pdfplumber

SRC_DIR = r"C:\Users\Johnny\Desktop\20260818中级师考试"
OUT_DIR = os.path.join(os.path.dirname(__file__))

PDFS = [
    "12【章节母题】2026新大纲 中经工商~乐橙网.pdf",
    "07【考前模考卷1】2026新大纲 中经工商~乐橙网.pdf",
    "08【考前模考卷2】2026新大纲 中经工商~乐橙网.pdf",
    "09【提分密训卷1】2026新大纲 中经工商~乐橙网.pdf",
    "10【提分密训卷2】2026新大纲 中经工商~乐橙网.pdf",
]

def extract(pdf_path):
    out = []
    with pdfplumber.open(pdf_path) as pdf:
        n = len(pdf.pages)
        for i, page in enumerate(pdf.pages):
            txt = page.extract_text() or ""
            out.append(f"\n===== PAGE {i+1}/{n} =====\n" + txt)
    return "".join(out)

if __name__ == "__main__":
    for name in PDFS:
        full = os.path.join(SRC_DIR, name)
        if not os.path.exists(full):
            print("MISSING:", full)
            continue
        text = extract(full)
        base = name.split("~")[0].strip()
        out_path = os.path.join(OUT_DIR, base + ".txt")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"OK  {base}  ->  {len(text)} chars  -> {out_path}")
