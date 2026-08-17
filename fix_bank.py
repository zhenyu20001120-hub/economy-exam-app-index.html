# -*- coding: utf-8 -*-
"""修正题库中专家团核验发现的问题（保持 id 不变，仅改题干/答案/解析，重新派生 oa/logic）。
修正清单：
 高：c3-7, c3b-10 答案 C->B（成长期，已 WebSearch 权威确认）
 高：c5-15 题干"生产提前期"->"生产周期"（A 选项即生产周期定义，答案 A 不变）
 中：x8-1 题干括号"(高风险高收益)"->"(高收益、高成功概率/低风险)"（答案 D 珍珠正确）
 中：c3b-9 串章，chapter 工商-3->工商-9（薪酬设计属人力资源章）
 低：c5-10, x5-3 题干"技术特性"->"确定依据"（与解析一致）
 低：c5-12 术语"单件工时"->"平均单件工时(并行)"
"""
import json, sys

PATH = "bank.json"
sys.path.insert(0, ".")
from improve_explanations import derive_oa, derive_logic  # 复用既有派生逻辑保证格式一致

raw = open(PATH, encoding="utf-8").read()
pretty = raw.count("\n") > 100
a = json.loads(raw)
byid = {x["id"]: x for x in a}


def refresh(item):
    item["oa"] = derive_oa(item)
    item["logic"] = derive_logic(item)


# ---- 高：c3-7 ----
x = byid["c3-7"]
x["answer"] = "B"
x["explain"] = ("成长期产品销量迅速增长、利润快速上升并在本阶段达到最高峰；"
               "成熟期是销量达到顶峰、利润趋于稳定并开始下降；介绍期销量低、利润薄；"
               "衰退期销量与利润均下滑。题干“销售额迅速增长、利润达到最高”正是成长期特征。")
refresh(x)

# ---- 高：c3b-10（与 c3-7 同考点变体） ----
x = byid["c3b-10"]
x["answer"] = "B"
x["explain"] = ("成长期产品销量迅速增长、利润快速上升并在本阶段达到最高峰；"
               "成熟期是销量达到顶峰、利润趋于稳定并开始下降；介绍期销量低、利润薄；"
               "衰退期销量与利润均下滑。题干“销售量迅速增长、利润达到最高”正是成长期特征。")
refresh(x)

# ---- 高：c5-15 题干改为生产周期（A 选项即其定义） ----
x = byid["c5-15"]
x["stem"] = "生产周期是指（ ）。"
x["explain"] = ("生产周期是从原材料投入到成品出产所经历的日历时间；"
               "生产间隔期是相邻两批产品投入或出产的间隔时间。")
refresh(x)  # 答案 A 不变

# ---- 中：x8-1 题干括号修正（答案 D 珍珠正确） ----
x = byid["x8-1"]
x["stem"] = "根据'风险-收益气泡图'，位于第Ⅰ象限(高收益、高成功概率/低风险)、能为企业带来高额利润的项目是（ ）。"

# ---- 中：c3b-9 串章修正 ----
x = byid["c3b-9"]
x["chapter"] = "工商-9"

# ---- 低：c5-10 题干措辞 ----
x = byid["c5-10"]
x["stem"] = "生产能力按确定依据可分为（ ）。"

# ---- 低：x5-3 题干措辞 ----
x = byid["x5-3"]
x["stem"] = "生产能力按确定依据可分为设计能力、查定能力和（ ）。"

# ---- 低：c5-12 术语润色 ----
x = byid["c5-12"]
x["explain"] = "平均单件工时(在2台设备并行条件下)=总加工时间/设备数=5/2=2.5分钟/件。"
refresh(x)

if pretty:
    json.dump(a, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
else:
    json.dump(a, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

print("done. touched: c3-7,c3b-10,c5-15,x8-1,c3b-9,c5-10,x5-3,c5-12")
