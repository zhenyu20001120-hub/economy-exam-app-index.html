# -*- coding: utf-8 -*-
"""数据导出器：把 build.py 中的权威题库(工商管理 502 题, 含三层解析与案例展开)
与 mindmaps.MIND(思维导图/知识回顾/详细讲解) 导出为参照项目同款的运行时 JSON：
  bank.json      —— 题目(案例已展开为子题, 含 oa/logic/kp 三层解析)
  chapters.json  —— 章节(工商, 按部分分组)
  lecture.json   —— 每章知识点(map/review/detail)
  changes.json   —— 2026 考纲变动提示
纯数据, 不含任何 UI/逻辑；运行时由 app.js 加载。
"""
import json
import build
from mindmaps import MIND

SUBJECT = "工商"
SUBJECT_FULL = "工商管理"

# 章节按"部分"分组(用于首页/章节讲解的分组展示)
PART_OF = {
    1: "战略与治理", 2: "战略与治理",
    3: "市场与渠道", 4: "市场与渠道",
    5: "生产运营", 6: "生产运营", 7: "生产运营",
    8: "创新与人力", 9: "创新与人力",
    10: "资本与国际化", 11: "资本与国际化",
}


def to_letter(idx):
    return chr(65 + idx)


def flatten():
    out = []
    seq = 0
    for it in build.Q:
        ch = it["chapter"]
        cid = "%s-%d" % (SUBJECT, ch)
        base = {
            "subject": SUBJECT,
            "chapter": cid,
            "real": bool(it.get("real")),
            "year": it.get("year"),
            "source_type": "真题" if it.get("real") else "习题",
        }
        if it["type"] == "case":
            # 案例: 背景作为 caseBg, 每个子题展开为一道独立题
            for s in it.get("subs", []):
                seq += 1
                ans = "".join(sorted(to_letter(i) for i in (s.get("answer") or [])))
                opts = {to_letter(i): o for i, o in enumerate(s.get("options") or [])}
                out.append({
                    **base,
                    "id": s.get("id") or ("case-%d" % seq),
                    "type": "multi" if len(s.get("answer") or []) > 1 else "single",
                    "stem": s.get("stem", ""),
                    "options": opts,
                    "answer": ans,
                    "explain": s.get("analysis", "") or "",
                    "oa": s.get("oa") or [],
                    "logic": s.get("logic") or "",
                    "kp": s.get("kp") or "",
                    "caseBg": it.get("case") or "",
                })
        else:
            seq += 1
            ans = "".join(sorted(to_letter(i) for i in (it.get("answer") or [])))
            opts = {to_letter(i): o for i, o in enumerate(it.get("options") or [])}
            out.append({
                **base,
                "id": it.get("id") or ("q-%d" % seq),
                "type": "multi" if len(it.get("answer") or []) > 1 else "single",
                "stem": it.get("stem", ""),
                "options": opts,
                "answer": ans,
                "explain": it.get("analysis", "") or "",
                "oa": it.get("oa") or [],
                "logic": it.get("logic") or "",
                "kp": it.get("kp") or "",
                "caseBg": "",
            })
    return out


def build_chapters():
    return {SUBJECT: [
        {
            "id": "%s-%d" % (SUBJECT, c["id"]),
            "name": c["name"],
            "part": PART_OF.get(c["id"], SUBJECT_FULL),
            "weight": c.get("weight", ""),
        }
        for c in build.CHAPTERS
    ]}


def build_lecture():
    lec = {}
    for ch, m in MIND.items():
        lec["%s-%d" % (SUBJECT, ch)] = {
            "title": m.get("title", "第%d章" % ch),
            "map": m.get("map", []),
            "review": m.get("review", ""),
            "detail": m.get("detail", ""),
        }
    return lec


def build_changes():
    # 2026 考纲变动: 第6章新增"质量管理与安全生产管理", 删除原"电子商务"
    return {
        "%s-6" % SUBJECT: {
            "big": True,
            "note": "2026 版考纲新增第6章《质量管理与安全生产管理》，并删除原“电子商务”章。新增内容为重点考查方向，需重点关注。",
            "adds": [
                "全面质量管理(TQM)基本观点与老七种工具",
                "六西格玛管理(DMAIC 流程)",
                "过程能力指数 Cp / Cpk",
                "安全生产管理(海因里希 1:29:300 法则、轨迹交叉/能量意外释放理论)",
            ],
        }
    }


def main():
    bank = flatten()
    chapters = build_chapters()
    lecture = build_lecture()
    changes = build_changes()
    with open("bank.json", "w", encoding="utf-8") as f:
        json.dump(bank, f, ensure_ascii=False, indent=1)
    with open("chapters.json", "w", encoding="utf-8") as f:
        json.dump(chapters, f, ensure_ascii=False, indent=1)
    with open("lecture.json", "w", encoding="utf-8") as f:
        json.dump(lecture, f, ensure_ascii=False, indent=1)
    with open("changes.json", "w", encoding="utf-8") as f:
        json.dump(changes, f, ensure_ascii=False, indent=1)
    n_single = sum(1 for q in bank if q["type"] == "single")
    n_multi = sum(1 for q in bank if q["type"] == "multi")
    n_case = sum(1 for q in bank if q["caseBg"])
    print("导出完成:")
    print("  bank.json     : %d 题 (单选 %d / 多选 %d / 含案例子题 %d)" % (len(bank), n_single, n_multi, n_case))
    print("  chapters.json : %d 章" % len(chapters[SUBJECT]))
    print("  lecture.json  : %d 章知识点" % len(lecture))
    print("  changes.json  : %d 条考纲变动" % len(changes))


if __name__ == "__main__":
    main()
