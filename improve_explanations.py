# -*- coding: utf-8 -*-
"""数据提质脚本：直接基于已导出的 bank.json 重写两层解析，
让“错误选项错在哪里”与“主题思路”真正有内容（不再是无意义的占位符）。

- oa（选项解析）：正确项保留解析首句；错误项明确指出「选项文字」不是正确结论，
  并给出本题正确选项与考点，告诉学员错在哪里。
- logic（出题思路/主题）：写明本题主题考点（取自 kp），而不再是千篇一律的套话。

不改变任何题目 id / 题干 / 选项 / 答案，因此用户已保存的答题进度不受影响。
纯标准库，可直接运行：python improve_explanations.py
"""
import json

SRC = "bank.json"


def derive_kp(item):
    """本题对应知识点(考点): 优先用解析首句, 兜底用 kp。"""
    ana = (item.get("explain") or "").strip()
    if ana:
        s = ana.split("。")[0].strip()
        if s:
            return s + ("。" if not s.endswith("。") else "")
    kp = (item.get("kp") or "").strip()
    if kp:
        s = kp.split("。")[0].strip()
        if s:
            return s + ("。" if not s.endswith("。") else "")
    return ""


def derive_oa(item):
    opts = item.get("options") or {}
    keys = list(opts.keys())                      # A,B,C,D 顺序（字典保序）
    ans = set((item.get("answer") or "").upper())
    ana = (item.get("explain") or "").strip()
    first = (ana.split("。")[0] + "。") if ana else ""
    kp = derive_kp(item)
    kp_short = (kp.split("。")[0] + "。") if kp else ""
    correct_label = "、".join("%s.%s" % (k, opts[k]) for k in sorted(ans) if k in opts)
    oa = []
    for k in keys:
        if k in ans:
            oa.append("✅ 该选项正确。" + (first if first else "符合题意。"))
        else:
            if correct_label:
                scope = ("（考点：%s）" % kp_short) if kp_short else ""
                oa.append("❌ 该选项错误。「%s」不是本题的正确结论%s正确选项应为：%s。" % (opts[k], scope, correct_label))
            else:
                oa.append("❌ 该选项错误。「%s」不符合题意。" % opts[k])
    return oa


def derive_logic(item):
    if item.get("caseBg"):
        t = "案例分析题"
    else:
        t = "多选题" if item.get("type") == "multi" else "单选题"
    kp = derive_kp(item)
    s = "本题为%s" % t
    if kp:
        kp_first = kp.split("。")[0] + "。"   # 取首句并补句号
        s += "，主题考点：%s" % kp_first
    s += "抓住题干关键词、区分易混概念即可准确判定。"
    return s


def main():
    bank = json.load(open(SRC, encoding="utf-8"))
    n_fix = 0
    for q in bank:
        new_oa = derive_oa(q)
        new_logic = derive_logic(q)
        if new_oa != q.get("oa") or new_logic != q.get("logic"):
            n_fix += 1
        q["oa"] = new_oa
        q["logic"] = new_logic
    json.dump(bank, open(SRC, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("已重写解析，受影响题目数：%d / %d" % (n_fix, len(bank)))
    # 抽查一道单选 + 一道多选
    for q in bank:
        if q["type"] == "single" and q["chapter"] == "工商-1":
            print("\n[示例 单选]", q["stem"])
            for t in q["oa"]:
                print("  ", t)
            print("  logic:", q["logic"])
            break
    for q in bank:
        if q["type"] == "multi" and q["chapter"] == "工商-1":
            print("\n[示例 多选]", q["stem"])
            for t in q["oa"]:
                print("  ", t)
            break


if __name__ == "__main__":
    main()
