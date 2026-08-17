# -*- coding: utf-8 -*-
"""
重写 bank.json 中每条题目的 oa（选项逐项解析），让【错误选项】真正有教学价值：
  - 若错误选项是名词/概念：把该名词的释义讲一遍（从本题 explain / kp / 本章讲义 detail·review 中挖掘权威定义，不瞎编）。
  - 若错误选项是陈述句：讲清楚“它为什么错”，对照正确答案。
  - 名词解释题（题干“XX是指…”）：重点解释每个错误选项里的名词。
正确选项保持原有“✅ 该选项正确。<解析首句>”不变。

用法：
  python enrich_oa.py --check 20     # 仅打印 20 条样例供人工审查，不写文件
  python enrich_oa.py                # 全量重写 bank.json 的 oa 字段
保持 id / stem / options / answer 完全不变，用户进度安全。
"""
import json, re, sys, os

try:
    from terms import TERMS
except ImportError:
    TERMS = {}

BASE = os.path.dirname(os.path.abspath(__file__))
BANK = os.path.join(BASE, 'bank.json')
LEC = os.path.join(BASE, 'lecture.json')

CUES = ['是指', '指的是', '是', '即', '称为', '属于', '指', '也叫', '又称', '又称作', '指为']

STOP = set('的是不以下关于下列以下说法错误正确说法正确符合题意不符包括包含用于表示指')


def load():
    with open(BANK, encoding='utf-8') as f:
        bank = json.load(f)
    with open(LEC, encoding='utf-8') as f:
        lec = json.load(f)
    return bank, lec


def split_sent(text):
    return [s.strip() for s in re.split(r'[。！？；\n]', text or '') if s.strip()]


def build_corpus(q, lec):
    """返回按优先级排列的 (来源, [句子...]) 列表。"""
    corpus = []
    if q.get('explain'):
        corpus.append(('explain', split_sent(q['explain'])))
    if q.get('kp'):
        corpus.append(('kp', split_sent(q['kp'])))
    m = (lec.get(q.get('chapter')) or {})
    for key in ('detail', 'review'):
        if m.get(key):
            corpus.append(('lec_' + key, split_sent(m[key])))
    return corpus


def term_keys(opt_text):
    """从选项文本里提取用于检索的“关键词/名词”（含滑动窗口子串，避免只取前缀漏掉中间词）。"""
    t = re.sub(r'[（(][^()（）]*[)）]', '', opt_text or '')  # 去括号注释
    t = t.strip(' 。，、；：')
    keys = []
    if t:
        keys.append(t)
    L = len(t)
    # 滑动窗口：长度 6/5/4 的所有连续子串（覆盖“企业业务战略”->“业务战略”这类中间匹配）
    for n in (6, 5, 4):
        if L >= n:
            for i in range(0, L - n + 1):
                sub = t[i:i + n]
                if len(sub) >= 2:
                    keys.append(sub)
    # 去重保序
    seen, out = set(), []
    for k in keys:
        if k not in seen:
            seen.add(k)
            out.append(k)
    return out


def find_def(term, corpus):
    """在 corpus 中找包含 term 且像定义的句子，返回 (句子, 来源) 或 (None,None)。"""
    if len(term) <= 3:
        # 短词必须带定义线索，避免巧合命中
        for _, sents in corpus:
            for s in sents:
                if term in s and any(c in s for c in CUES):
                    return s
        return None
    # 优先：带定义线索的句子
    best = None
    for _, sents in corpus:
        for s in sents:
            if term in s:
                if any(c in s for c in CUES):
                    return s
                best = best or s
    return best


def derive_oa(item, lec):
    opts = item.get('options') or {}
    keys = list(opts.keys())
    ans = set((item.get('answer') or '').upper())
    ana = (item.get('explain') or '').strip()
    first = (ana.split('。')[0] + '。') if ana else ''
    kp = (item.get('kp') or '').strip()
    kp_first = (kp.split('。')[0] + '。') if kp else ''
    corpus = build_corpus(item, lec)
    correct_label = '、'.join('%s.%s' % (k, opts[k]) for k in sorted(ans) if k in opts)
    oa = []
    is_term_q = bool(re.search(r'(是指|指的是|的概念|属于.*?的是|下列.*?的是|关于.*?的说法|下列说法错误的是|下列说法正确的是)', item.get('stem') or ''))

    for k in keys:
        ot = opts[k]
        if k in ans:
            oa.append('✅ 该选项正确。' + (first if first else '符合题意。'))
        else:
            # 1) 试着挖错误项名词释义
            term = None
            defn = None
            for tk in term_keys(ot):
                d = find_def(tk, corpus)
                if d:
                    term, defn = tk, d
                    break
            # 1.5) 挖不到 → 回退到权威名词库
            if defn is None:
                for tk in term_keys(ot):
                    if tk in TERMS:
                        defn = TERMS[tk]
                        term = tk
                        break
            # 2) 组织解释
            if defn:
                if len(defn) > 90:
                    defn = defn[:90] + '…'
                seg = '「%s」——%s' % (ot, defn)
            else:
                # 没挖到释义：用对照式，避免编造
                if kp_first:
                    seg = '「%s」与题干所述情形不符。本题正确结论为%s（%s），故此项不选。' % (ot, correct_label, kp_first)
                else:
                    seg = '「%s」与题干所述情形不符，本题正确结论为%s，故不选。' % (ot, correct_label)
            if is_term_q and defn:
                head = '❌ 该选项错误（名词释义）：'
            elif defn:
                head = '❌ 该选项错误。'
            else:
                head = '❌ 该选项错误（为何错）：'
            oa.append(head + seg)
    return oa


def main():
    check = '--check' in sys.argv
    n = 20
    for i, a in enumerate(sys.argv):
        if a == '--check' and i + 1 < len(sys.argv):
            try:
                n = int(sys.argv[i + 1])
            except ValueError:
                pass
    bank, lec = load()
    if check:
        print('===== 样例预览（前 %d 题的错误项解释）=====' % n)
        for x in bank[:n]:
            new = derive_oa(x, lec)
            wrong = [t for t in new if t.startswith('❌')]
            if not wrong:
                continue
            print('\n### %s (ans=%s) %s' % (x['id'], x['answer'], x['stem'][:40]))
            for t in wrong:
                print('   ' + t)
        return
    # 全量重写
    for x in bank:
        x['oa'] = derive_oa(x, lec)
    with open(BANK, 'w', encoding='utf-8') as f:
        json.dump(bank, f, ensure_ascii=False, indent=1)
    print('done: rewrote oa for %d questions' % len(bank))


if __name__ == '__main__':
    main()
