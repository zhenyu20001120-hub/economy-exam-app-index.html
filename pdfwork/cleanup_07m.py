"""清理 07m id 冲突: 删除旧 c7-1..c7-100, 把新 c7-1-m1..c7-100-m1 重命名"""
import json, re

BANK_PATH = 'bank.json'

def main():
    with open(BANK_PATH, 'r', encoding='utf-8') as f:
        bank = json.load(f)
    print(f'before: {len(bank)}')

    # 1) 删旧 c7-1..c7-100 (无 -m1 后缀的)
    bank = [q for q in bank if not (q['id'].startswith('c7-') and '-m1' not in q['id'])]
    print(f'after delete old: {len(bank)}')

    # 2) 重命名 c7-x-m1 → c7-x
    renamed = 0
    for q in bank:
        m = re.match(r'^c7-(\d+)-m1$', q['id'])
        if m:
            q['id'] = f"c7-{m.group(1)}"
            renamed += 1
    print(f'renamed: {renamed}')
    print(f'after: {len(bank)}')

    # 3) 验证
    c7 = [q for q in bank if q['id'].startswith('c7-')]
    print(f'c7- count: {len(c7)}')
    from collections import Counter
    print('source_type:', Counter(q['source_type'] for q in c7))

    # 写回
    with open(BANK_PATH, 'w', encoding='utf-8') as f:
        json.dump(bank, f, ensure_ascii=False, indent=2)
    print('saved')

if __name__ == '__main__':
    main()
