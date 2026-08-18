"""把 07m 100 题数据合并到 bank.json,转换格式"""
import json, sys, os
# 直接 exec 加载模块(避免 __init__.py 问题)
_mod_globals = {}
with open('pdfwork/07m_data.py', 'r', encoding='utf-8') as f:
    exec(f.read(), _mod_globals)
parse_data = _mod_globals['parse_data']

BANK_PATH = 'bank.json'

def to_bank_record(q):
    """把 7m_data 的一条 dict 转成 bank.json 的一条 record"""
    opts = q['options']
    ans = q['answer']
    is_multi = q['type'] == 'multi'
    correct_set = set(ans)

    oa = []
    for letter in sorted(opts.keys()):
        text = opts[letter]
        if letter in correct_set:
            oa.append(f"✅ 该选项正确。{text}")
        else:
            oa.append(f"❌ 该选项错误。「{text}」")

    # 简洁 logic / kp
    kp = q['kp']
    logic = f"本题为{('多选' if is_multi else '单选')}题,主题考点:{kp}。抓住题干关键词、区分易混概念即可准确判定。"

    return {
        "subject": "工商",
        "chapter": q['chapter'],
        "real": False,
        "year": 2026,
        "source_type": "模考卷1",
        "id": q['id'],
        "type": q['type'],
        "stem": q['stem'],
        "options": opts,
        "answer": ans,
        "explain": q['explain'],
        "oa": oa,
        "logic": logic,
        "kp": kp,
        "caseBg": "",
    }

def main():
    qs = parse_data()
    assert len(qs) == 100, f'Expected 100, got {len(qs)}'

    # 读现有 bank
    with open(BANK_PATH, 'r', encoding='utf-8') as f:
        bank = json.load(f)
    print(f'before: {len(bank)} questions in bank.json')

    # 检查 id 冲突
    existing_ids = {q['id'] for q in bank}
    new_ids = [q['id'] for q in qs]
    conflicts = [i for i in new_ids if i in existing_ids]
    if conflicts:
        print(f'CONFLICT ids: {conflicts[:10]}')
        # 给冲突 id 加 -m1 后缀
        for q in qs:
            if q['id'] in existing_ids:
                q['id'] = q['id'] + '-m1'

    # 转格式
    new_records = [to_bank_record(q) for q in qs]
    bank.extend(new_records)

    # 写回
    with open(BANK_PATH, 'w', encoding='utf-8') as f:
        json.dump(bank, f, ensure_ascii=False, indent=2)
    print(f'after: {len(bank)} questions')

    # 统计
    from collections import Counter
    print('by type:', Counter(q['type'] for q in new_records))
    print('by chapter:', Counter(q['chapter'] for q in new_records))

if __name__ == '__main__':
    main()
