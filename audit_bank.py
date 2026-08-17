# -*- coding: utf-8 -*-
"""程序化结构体检 economy-exam-app/bank.json
检查：答案字母是否都在 options、单/多选答案数量、oa 正确项标注与 answer 是否一致、
选项非空、题干/解释非空、是否有乱码占位、重复题干、缺 kp/logic、案例题缺 caseBg。
"""
import json, re, sys
from collections import Counter

PATH = "bank.json"
a = json.load(open(PATH, encoding="utf-8"))
print("总题量:", len(a))

# 结构探针
print("item0 keys:", list(a[0].keys()))
print("item0 样例:", json.dumps(a[0], ensure_ascii=False)[:500])
print("type 分布:", dict(Counter(x.get("type") for x in a)))
print("chapter 分布:", dict(Counter(x.get("chapter") for x in a)))
print("case 题数:", sum(1 for x in a if x.get("caseBg")))

issues = []  # (id, level, msg)

GARBAGE = ["TODO", "FIXME", "xxx", "？？？", "???", "待补充", "占位", "XXXX"]

def norm_ans(s):
    return re.sub(r"[^A-Z]", "", (s or "").upper())

for x in a:
    qid = x.get("id", "?")
    opts = x.get("options") or {}
    ans = norm_ans(x.get("answer"))
    keys = list(opts.keys())
    # 选项
    if not opts:
        issues.append((qid, "高", "options 为空"))
    for k, v in opts.items():
        if not isinstance(v, str) or not v.strip():
            issues.append((qid, "高", "选项 %s 为空或非法" % k))
        else:
            for g in GARBAGE:
                if g in v:
                    issues.append((qid, "中", "选项 %s 含占位/乱码 '%s'" % (k, g)))
    # 答案
    if not ans:
        issues.append((qid, "高", "answer 为空或无法解析: %r" % x.get("answer")))
    else:
        for c in ans:
            if c not in keys:
                issues.append((qid, "高", "答案字母 %s 不在选项 %s 中" % (c, keys)))
        t = x.get("type")
        if t == "single" and len(ans) != 1:
            issues.append((qid, "高", "单选但答案有 %d 个: %s" % (len(ans), ans)))
        if t == "multi" and len(ans) < 2:
            issues.append((qid, "中", "多选但答案仅 %d 个: %s" % (len(ans), ans)))
    # oa 与 answer 一致性
    oa = x.get("oa")
    if isinstance(oa, list):
        if len(oa) != len(keys):
            issues.append((qid, "中", "oa 长度 %d 与选项数 %d 不符" % (len(oa), len(keys))))
        else:
            for i, k in enumerate(keys):
                note = oa[i] or ""
                is_correct = k in ans
                has_ok = ("✅" in note) or ("✓" in note) or ("正确" in note)
                has_no = ("❌" in note) or ("✗" in note) or ("错误" in note)
                if is_correct and has_no and not has_ok:
                    issues.append((qid, "高", "oa 把正确项 %s 标成了错误" % k))
                if (not is_correct) and has_ok and not has_no:
                    issues.append((qid, "高", "oa 把错误项 %s 标成了正确" % k))
    # 解释字段
    if not (x.get("explain") or "").strip():
        issues.append((qid, "中", "explain 为空"))
    if not (x.get("logic") or "").strip():
        issues.append((qid, "低", "logic 为空"))
    if not (x.get("kp") or "").strip():
        issues.append((qid, "低", "kp 为空"))
    # 题干
    stem = (x.get("stem") or "").strip()
    if not stem:
        issues.append((qid, "高", "stem 为空"))
    else:
        for g in GARBAGE:
            if g in stem:
                issues.append((qid, "中", "题干含占位/乱码 '%s'" % g))
    # 案例题
    if x.get("caseBg") and not (x.get("caseBg") or "").strip():
        issues.append((qid, "中", "caseBg 为空(标记了案例却无背景)"))

# 重复题干
seen = {}
for x in a:
    s = (x.get("stem") or "").strip()
    if s:
        seen.setdefault(s, []).append(x.get("id"))
dups = {s: ids for s, ids in seen.items() if len(ids) > 1}
for s, ids in dups.items():
    issues.append((ids[0], "中", "重复题干(共 %d 题: %s): %s" % (len(ids), ids, s[:40])))

# 汇总
print("\n==== 体检问题清单 (共 %d 条) ====" % len(issues))
lvl_order = {"高": 0, "中": 1, "低": 2}
issues.sort(key=lambda t: (lvl_order.get(t[1], 9), t[0]))
for qid, lvl, msg in issues:
    print("[%s] %s: %s" % (lvl, qid, msg))
print("\n高:%d 中:%d 低:%d" % (
    sum(1 for i in issues if i[1] == "高"),
    sum(1 for i in issues if i[1] == "中"),
    sum(1 for i in issues if i[1] == "低"),
))
