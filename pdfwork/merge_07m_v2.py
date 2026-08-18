"""正确合并 07m 100 题: 删除旧 c7-1..c7-100 (任何 source_type), 加入新 100 题 c7-1..c7-100"""
import json, sys, os

_mod_globals = {}
with open('pdfwork/07m_data.py', 'r', encoding='utf-8') as f:
    exec(f.read(), _mod_globals)
parse_data = _mod_globals['parse_data']

BANK_PATH = 'bank.json'

def to_bank_record(q):
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
    kp = q['kp']
    logic = f"本题为{('多选' if is_multi else '单选')}题,主题考点:{kp}。抓住题干关键词、区分易混概念即可准确判定。"
    return {
        "subject": "工商", "chapter": q['chapter'],
        "real": False, "year": 2026, "source_type": "模考卷1",
        "id": q['id'], "type": q['type'], "stem": q['stem'],
        "options": opts, "answer": ans, "explain": q['explain'],
        "oa": oa, "logic": logic, "kp": kp, "caseBg": "",
    }

def main():
    qs = parse_data()
    assert len(qs) == 100, f'Expected 100, got {len(qs)}'

    with open(BANK_PATH, 'r', encoding='utf-8') as f:
        bank = json.load(f)
    print(f'before: {len(bank)}')

    # 删掉所有 旧 c7-1..c7-100 (含 -m1 后缀, 即任何 c7- 前缀的)
    removed = [q['id'] for q in bank if q['id'].startswith('c7-')]
    bank = [q for q in bank if not q['id'].startswith('c7-')]
    print(f'removed {len(removed)} old c7-* ids')

    # 加新 100 道
    new_records = [to_bank_record(q) for q in qs]
    bank.extend(new_records)
    print(f'after: {len(bank)}')

    with open(BANK_PATH, 'w', encoding='utf-8') as f:
        json.dump(bank, f, ensure_ascii=False, indent=2)

    from collections import Counter
    c7 = [q for q in bank if q['id'].startswith('c7-')]
    print(f'c7- count: {len(c7)}')
    print('source_type:', Counter(q['source_type'] for q in c7))
    print('chapter:', Counter(q['chapter'] for q in c7))
    print('type:', Counter(q['type'] for q in c7))

if __name__ == '__main__':
    main()
