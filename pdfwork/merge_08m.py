# -*- coding: utf-8 -*-
"""
合并 08m 模考卷二 100 题到 bank.json
- 加载 08m_data.py (exec, 避免 pdfwork 包名问题)
- 删除已有 c8-* 题目 (如有)
- 新增 100 条: 60单选 + 20多选 + 20案例
- 输出: 607 + 100 = 707
"""

import json
import os
import sys

BANK = 'bank.json'
DATA_FILE = 'pdfwork/08m_data.py'

# ---------- 1. 加载 08m_data.py ----------
_mod_globals = {}
with open(DATA_FILE, 'r', encoding='utf-8') as f:
    exec(f.read(), _mod_globals)
parse_data = _mod_globals['parse_data']
records = parse_data()
print(f'[load] {DATA_FILE}: {len(records)} 条')

# ---------- 2. 读取 bank.json ----------
with open(BANK, 'r', encoding='utf-8') as f:
    bank = json.load(f)
print(f'[load] {BANK}: {len(bank)} 条')

# ---------- 3. 删除已存在的 c8-* ----------
before = len(bank)
bank = [q for q in bank if not q.get('id', '').startswith('c8-')]
removed = before - len(bank)
print(f'[clean] 删除旧 c8-*: {removed} 条')

# ---------- 4. 构造新题库条目 ----------
def to_bank_record(q):
    opts_list = q['opts']
    # bank.json 标准格式: options 是对象 {A: ..., B: ..., ...}, 答案字母作 key
    opts_obj = {chr(65 + i): v for i, v in enumerate(opts_list)}
    ans = q['answer']
    oa = {}
    for i, letter in enumerate('ABCDE'):
        oa[letter] = letter in ans
    # 构造 logic: 从 explain 截取前 60 字
    full = q.get('explain', '')
    logic = full[:60].replace('\n', ' ').strip()
    if len(full) > 60:
        logic += '...'
    rec = {
        "subject": "工商",
        "chapter": q['chapter'],
        "real": False,
        "year": 2026,
        "source_type": "模考卷2",
        "id": q['id'],
        "type": q['type'],
        "stem": q['stem'],
        "options": opts_obj,
        "answer": ans,
        "explain": q.get('explain', ''),
        "oa": oa,
        "logic": logic,
        "kp": q.get('kp', ''),
    }
    if q.get('caseBg'):
        rec['caseBg'] = q['caseBg']
    return rec

new_records = [to_bank_record(q) for q in records]
bank.extend(new_records)
print(f'[add] 新增: {len(new_records)} 条')

# ---------- 5. 写回 ----------
with open(BANK, 'w', encoding='utf-8') as f:
    json.dump(bank, f, ensure_ascii=False, indent=2)
print(f'[save] {BANK}: {len(bank)} 条')

# ---------- 6. 统计 ----------
from collections import Counter
src = Counter(q.get('source_type', '?') for q in bank)
print('[stats] source_type:', dict(src))
typ = Counter(q.get('type', '?') for q in bank)
print('[stats] type:', dict(typ))
ch = Counter(q.get('chapter', '?') for q in bank if q.get('source_type') == '模考卷2')
print('[stats] 08m 章节分布:', dict(sorted(ch.items())))
