/* 中级经济师·工商管理 刷题 App —— 纯前端，数据驱动（bank.json/chapters.json/lecture.json）
 * 架构参照 grapewang88-wq/zjjjs-app（数据驱动 + hash 路由 + PWA），
 * 并保留本项目特色：① 题库及三层解析(oa/logic/kp+思维导图) ② 三轮学习(逐题反馈/按章/不计时/覆盖全库)。
 */
'use strict';

// ---------- 常量 ----------
const SUBJECTS = ['工商'];
const SUBJECT_FULL = { '工商': '工商管理' };
// 工商管理专业实务卷：单选60×1 + 多选20×2 + 案例20×2 = 100题 / 140分 / 90分钟 / 84合格
const EXAM_SPEC = {
  '工商': { single: 60, multi: 20, case: 20, singlePt: 1, multiPt: 2, casePt: 2, minutes: 90, total: 140, pass: 84 },
};
const TARGET = 160;            // 三轮学习每轮题量下限
const SR_INTERVALS = [0, 1, 3, 7]; // 间隔重复盒子

// ---------- 存储（按用户名隔离） ----------
const USER_KEY = 'zjjjs_user';        // 当前用户名
const TOKEN_KEY = 'zjjjs_token';      // GitHub PAT（仅存本机）
const SYNC_ON_KEY = 'zjjjs_sync_on';  // 是否启用云同步
const SYNC_REPO = 'zhenyu20001120-hub/economy-exam-app-index.html';
const SYNC_BRANCH = 'ee-sync';
const API = 'https://api.github.com';
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
function curUser() { try { return localStorage.getItem(USER_KEY) || ''; } catch (e) { return ''; } }
function setUser(n) { try { localStorage.setItem(USER_KEY, n); } catch (e) {} }
function clearUser() { try { localStorage.removeItem(USER_KEY); } catch (e) {} }
function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
function syncOn() { try { return localStorage.getItem(SYNC_ON_KEY) === '1'; } catch (e) { return false; } }
function setSyncOn(v) { try { localStorage.setItem(SYNC_ON_KEY, v ? '1' : '0'); } catch (e) {} }
// 每个用户名一套独立存储桶，互不串
function lsKey() { return 'zjjjs_gq_v1' + (curUser() ? '_' + curUser() : ''); }
let store = loadStore();
function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
// 防御性修复：旧版本可能把 store.wrong / store.answered 存成数组或字符串，
// 直接访问 .due / .correct 会抛错，导致点击“进入刷题”或启动首页时整页无响应。
function sanitizeStore(raw) {
  const s = isObj(raw) ? raw : {};
  s.answered = isObj(s.answered) ? s.answered : {};
  s.wrong = isObj(s.wrong) ? s.wrong : {};
  s.stats = isObj(s.stats) ? s.stats : {};
  s.roundQuestions = isObj(s.roundQuestions) ? s.roundQuestions : {};
  s.roundResults = isObj(s.roundResults) ? s.roundResults : {};
  s.exams = Array.isArray(s.exams) ? s.exams : [];
  s.roundsPicked = Array.isArray(s.roundsPicked) ? s.roundsPicked : [];
  for (const id of Object.keys(s.wrong)) {
    const w = s.wrong[id];
    if (!isObj(w) || !Number.isFinite(w.due)) { delete s.wrong[id]; continue; }
    if (!Number.isFinite(w.box)) w.box = 0;
    if (!Number.isFinite(w.wrongCount)) w.wrongCount = 0;
  }
  for (const id of Object.keys(s.answered)) {
    if (!isObj(s.answered[id])) delete s.answered[id];
  }
  return s;
}
function loadStore() {
  try { return sanitizeStore(JSON.parse(localStorage.getItem(lsKey()))); }
  catch (e) { return sanitizeStore({}); }
}
let _pushTimer = null;
function saveStore() {
  try {
    store._ts = Date.now();
    localStorage.setItem(lsKey(), JSON.stringify(store));
  } catch (e) {}
  schedulePush();
}
function schedulePush() {
  if (!syncOn() || !curUser() || !getToken()) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => { pushCloud().catch(() => {}); }, 1500);
}
function backupProgress() {
  try {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(store))));
    try { if (navigator.clipboard) navigator.clipboard.writeText(code); } catch (e) {}
    window.prompt('这是你的备份码（已尝试自动复制）。请长按全选复制，粘到备忘录/微信收藏保存好。以后在任意设备点“恢复进度”粘回即可：', code);
  } catch (e) { alert('备份失败：' + e.message); }
}
function restoreProgress() {
  const code = window.prompt('粘贴你之前保存的备份码，恢复学习进度：');
  if (!code) return;
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!data || typeof data !== 'object') throw new Error('格式不对');
    store = data; saveStore(); alert('恢复成功！进度已还原。'); location.reload();
  } catch (e) { alert('恢复失败，备份码可能不完整或有误：' + e.message); }
}
function S() {
  store.answered = store.answered || {};
  store.wrong = store.wrong || {};
  store.stats = store.stats || {};
  store.exams = store.exams || [];
  store.roundsPicked = store.roundsPicked || [];
  store.roundQuestions = store.roundQuestions || {};
  store.roundResults = store.roundResults || {};
  return store;
}
const now = () => Date.now();
const DAY = 86400000;

// ---------- 数据 ----------
let BANK = [];
let BYID = {};
let CHAPTERS = { '工商': [] };
let CHBYID = {};
let LECTURE = {};
let CHANGES = {};
// 防御性过滤：跳过坏题（缺题干/缺选项/答案异常）
function sanitizeBank(list) {
  const out = [];
  for (const q of (list || [])) {
    if (!q || !q.options || !q.stem) continue;
    const ks = Object.keys(q.options);
    if (ks.length < 2) continue;
    if (ks.join('') !== ks.map((_, i) => String.fromCharCode(65 + i)).join('')) continue;
    const ans = (q.answer || '').toUpperCase().replace(/[^A-E]/g, '');
    if (!ans || [...ans].some(a => !(a in q.options))) continue;
    q.answer = ans;
    q.type = ans.length > 1 ? 'multi' : 'single';
    out.push(q);
  }
  return out;
}
async function loadBank() {
  const [b, c, l, ch2] = await Promise.all([
    fetch('bank.json').then(r => r.json()).catch(() => []),
    fetch('chapters.json').then(r => r.json()).catch(() => ({ '工商': [] })),
    fetch('lecture.json').then(r => r.json()).catch(() => ({})),
    fetch('changes.json').then(r => r.json()).catch(() => ({})),
  ]);
  BANK = sanitizeBank(b); BANK.forEach(q => BYID[q.id] = q);
  CHAPTERS = c; Object.values(c).flat().forEach(ch => CHBYID[ch.id] = ch);
  LECTURE = l; CHANGES = ch2;
}
function changeAlert(cid) {
  const cg = CHANGES[cid];
  if (!cg) return '';
  const adds = (cg.adds && cg.adds.length) ? `<div style="margin-top:8px"><b>2026 新增/变动考点：</b><ul style="margin:6px 0 0;padding-left:20px">${cg.adds.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : '';
  return `<div class="card" style="border-left:4px solid var(--warn);display:flex;gap:12px;align-items:flex-start">
    <div style="font-size:30px">⚠️</div>
    <div style="flex:1">
    <div style="color:var(--warn);font-weight:700">2026 考纲变动章节${cg.big ? '（较大变动）' : ''}</div>
    ${cg.note ? `<div class="sub" style="margin-top:6px">${esc(cg.note)}</div>` : ''}
    ${adds}
    <div class="sub" style="margin-top:8px;font-size:12px">提示：历年真题可能未覆盖这些新增点，2026 年需重点关注。</div>
    </div></div>`;
}
function chName(cid) { return CHBYID[cid] ? CHBYID[cid].name : '未分类'; }
function chPart(cid) { return CHBYID[cid] ? CHBYID[cid].part : ''; }
const chNum = cid => parseInt((cid || '').split('-')[1] || '0', 10);

// ---------- 工具 ----------
const $ = sel => document.querySelector(sel);
const app = () => $('#app');
function esc(s) { return (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function sample(arr, n) { return shuffle(arr).slice(0, n); }
function srcPill(t) { const m = { '真题': 'real', '模拟题': 'mock', '习题': 'ex' }; return `<span class="pill ${m[t] || ''}">${t}</span>`; }

// ---------- 路由 ----------
const routes = {};
function nav(name, params) {
  const h = '#' + name + (params ? '?' + new URLSearchParams(params) : '');
  if (location.hash === h) router();
  else location.hash = h;
}
function router() {
  try {
    const raw = location.hash.slice(1) || 'home';
    const [name, qs] = raw.split('?');
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    (routes[name] || routes.home)(params);
    document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  } catch (e) {
    console.error(e);
    app().innerHTML = '<div class="empty">⚠️ 页面出错了：<br><span class="sub">' + esc(e && e.message ? e.message : String(e)) +
      '</span><br><span class="sub">可在右上角“设置”里点“清除本机进度”后刷新，或在浏览器开发者工具清除本站数据。</span></div>';
  } finally {
    try { window.scrollTo(0, 0); } catch (e) {}
  }
}
window.addEventListener('hashchange', router);

// ==================================================================
// 首页
// ==================================================================
routes.home = () => {
  S();
  const totalDone = Object.keys(store.answered).length;
  const totalCorrect = Object.values(store.answered).filter(a => a.correct).length;
  const dueCount = dueWrongIds().length;
  const wrongTotal = Object.keys(store.wrong).filter(id => BYID[id]).length;
  const rate = totalDone ? Math.round(totalCorrect / totalDone * 100) : 0;
  const rr = store.roundResults || {};
  const roundLine = [1, 2, 3].map(r => { const x = rr['r' + r]; return x ? `第${r}轮 ${x.acc}%` : `第${r}轮 未开始`; }).join('  ·  ');
  app().innerHTML = `
    <div class="hero">
      <div class="htext">
        <h1>中级经济师·工商管理</h1>
        <div class="sub">以题促学 · 三轮学透 · ${BANK.length} 题随刷</div>
        <span class="bless">🎯 祝你一次上岸</span>
      </div>
    </div>
    <div class="userbar">当前用户：<b>${esc(curUser() || '游客')}</b> <span class="pill" style="cursor:pointer" onclick="switchUser()">切换账号</span></div>
    <div class="card"><div class="grid2">
      <div class="stat"><div class="n">${totalDone}</div><div class="l">累计做题</div></div>
      <div class="stat"><div class="n">${rate}%</div><div class="l">正确率</div></div>
      <div class="stat"><div class="n" style="color:var(--bad)">${wrongTotal}</div><div class="l">错题总数</div></div>
      <div class="stat"><div class="n" style="color:var(--warn)">${dueCount}</div><div class="l">今日待复习</div></div>
    </div></div>
    <button class="menu-btn" onclick="nav('practice')">
      <span class="ico">✏️</span><div><div>刷题练习</div><div class="d">真题优先 · 即时三层解析</div></div><span class="arrow">›</span></button>
    <button class="menu-btn" onclick="nav('rounds')">
      <span class="ico">📚</span><div><div>三轮学习</div><div class="d">${roundLine}</div></div><span class="arrow">›</span></button>
    <button class="menu-btn" onclick="nav('wrong')">
      <span class="ico">📕</span><div><div>错题本 · 间隔重复</div><div class="d">${dueCount ? `有 ${dueCount} 道待复习` : '按遗忘曲线自动安排'}</div></div><span class="arrow">›</span></button>
    <button class="menu-btn" onclick="nav('exam')">
      <span class="ico">📝</span><div><div>模拟考试</div><div class="d">100题·限时·自动评分</div></div><span class="arrow">›</span></button>
    <button class="menu-btn" onclick="nav('chapters')">
      <span class="ico">📖</span><div><div>章节讲解 · 按章练习</div><div class="d">思维导图 · 知识回顾</div></div><span class="arrow">›</span></button>
    <button class="menu-btn" onclick="nav('settings')">
      <span class="ico">⚙️</span><div><div>设置 · 云同步</div><div class="d">GitHub 跨设备备份进度</div></div><span class="arrow">›</span></button>
    <div class="card sub" style="font-size:13px">题库共 <b>${BANK.length}</b> 道（单选 ${BANK.filter(q => q.type === 'single' && !q.caseBg).length} · 多选 ${BANK.filter(q => q.type === 'multi' && !q.caseBg).length} · 案例 ${BANK.filter(q => q.caseBg).length}），覆盖 2026 考纲 11 章。</div>
    <div class="row" style="margin-bottom:14px">
      <button class="ghost sm" onclick="backupProgress()">💾 备份进度</button>
      <button class="ghost sm" onclick="restoreProgress()">↩️ 恢复进度</button>
    </div>`;
};

// ==================================================================
// 刷题练习
// ==================================================================
let practiceState = null;
routes.practice = (params) => {
  if (params.start) return renderPractice();
  const subj = SUBJECTS.includes(params.subject) ? params.subject : '工商';
  store._lastSubject = subj; saveStore();
  const src = ['全部', '真题', '习题'].includes(params.src) ? params.src : '全部';
  const chap = (params.chap && CHBYID[params.chap]) ? params.chap : '';
  const pool = filterPool(subj, src, chap);
  const newCnt = pool.filter(q => !store.answered[q.id]).length;
  app().innerHTML = `
    ${topbar('刷题练习', "nav('home')")}
    <div class="card">
      <h3>题目来源</h3>
      <div>${['全部', '真题', '习题'].map(t => `<span class="chip ${t === src ? 'active' : ''}" onclick="nav('practice',{subject:'${subj}',src:'${t}',chap:'${chap}'})">${t}${t !== '全部' ? ` (${filterPool(subj, t, '').length})` : ` (${filterPool(subj, '全部', '').length})`}</span>`).join('')}</div>
      <h3 style="margin-top:14px">章节 ${chap ? `· <span style="color:var(--brand)">${esc(chName(chap))}</span>` : '· 全部'}</h3>
      <div class="row">
        <button class="sec sm" onclick="nav('practice',{subject:'${subj}',src:'${src}',chap:''})">全部章节</button>
        <button class="sec sm" onclick="pickChapter('${subj}','${src}')">按章节选择 ›</button>
      </div>
    </div>
    <div class="card center">
      <div class="sub">可练习 <b style="color:var(--brand);font-size:20px">${pool.length}</b> 道题</div>
      <div class="row" style="margin-top:14px">
        <button onclick="startPractice('${subj}','${src}',false,false,'${chap}')" ${pool.length ? '' : 'disabled'}>顺序练习</button>
        <button class="ghost" onclick="startPractice('${subj}','${src}',true,false,'${chap}')" ${pool.length ? '' : 'disabled'}>乱序练习</button>
      </div>
      <button class="sec sm" style="margin-top:10px;flex:none" onclick="startPractice('${subj}','${src}',true,true,'${chap}')" ${newCnt ? '' : 'disabled'}>只练未做过的题（${newCnt}）</button>
    </div>`;
};
function filterPool(subj, src, chap) {
  return BANK.filter(q => q.subject === subj
    && (src === '全部' || !src || q.source_type === src)
    && (!chap || q.chapter === chap));
}
window.pickChapter = (subj, src) => {
  const chs = CHAPTERS[subj] || [];
  const groups = {};
  chs.forEach(c => { (groups[c.part] = groups[c.part] || []).push(c); });
  const cnt = cid => BANK.filter(q => q.subject === subj && q.chapter === cid).length;
  app().innerHTML = `${topbar('选择章节', `nav('practice',{subject:'${subj}',src:'${src}'})`)}
    ${Object.entries(groups).map(([part, list]) => `
      <div class="card">
        <h3>${esc(part || '其他')}</h3>
        ${list.map(c => `<div class="opt" style="cursor:pointer" onclick="nav('practice',{subject:'${subj}',src:'${src}',chap:'${c.id}'})">
          <div style="flex:1">${esc(c.name)}</div><div class="pill">${cnt(c.id)}</div></div>`).join('')}
      </div>`).join('')}`;
};
window.startPractice = (subj, src, shuf, onlyNew, chap) => {
  let pool = filterPool(subj, src, chap);
  if (onlyNew) pool = pool.filter(q => !store.answered[q.id]);
  if (!pool.length) { alert('没有符合条件的题目'); return; }
  if (shuf) pool = shuffle(pool);
  practiceState = { ids: pool.map(q => q.id), i: 0, subj, src, chap: chap || '' };
  renderPractice();
};
function renderPractice() {
  const st = practiceState;
  if (!st) return nav('practice');
  const q = BYID[st.ids[st.i]];
  app().innerHTML = `
    ${topbar(`${st.i + 1}/${st.ids.length}`, "if(confirm('退出本次练习？'))nav('practice')")}
    <div class="progress"><i style="width:${(st.i + 1) / st.ids.length * 100}%"></i></div>
    ${questionCard(q, { mode: 'practice' })}`;
  wireQuestion(q, { mode: 'practice', onNext: () => { if (st.i < st.ids.length - 1) { st.i++; renderPractice(); } else finishPractice(); } });
}
function finishPractice() {
  const st = practiceState;
  const ids = st.ids;
  const correct = ids.filter(id => store.answered[id] && store.answered[id].correct).length;
  const pct = Math.round(correct / ids.length * 100);
  const word = pct >= 80 ? '太棒了，这一组你稳稳拿下！' : pct >= 60 ? '不错，再巩固下错题就更牢啦' : '没关系，错题都收好了，继续加油';
  app().innerHTML = `${topbar('练习完成', "nav('home')")}
    <div class="card center">
      <div class="scorebig" style="color:var(--brand)">${pct}%</div>
      <div class="sub">共 ${ids.length} 题 · 答对 ${correct} · 答错 ${ids.length - correct}</div>
      <div style="margin-top:8px;font-weight:600;color:var(--brand)">${word}</div>
      <div class="row" style="margin-top:18px">
        <button onclick="startPractice('${st.subj}','${st.src}',true,false,'${st.chap || ''}')">再来一组</button>
        <button class="ghost" onclick="nav('wrong')">看错题本</button>
      </div>
    </div>`;
}

// ==================================================================
// 通用题目卡片 + 作答逻辑（含三层解析）
// ==================================================================
function questionCard(q, opt = {}) {
  const isMulti = q.type === 'multi';
  return `
    <div class="card" id="qcard">
      <div class="qmeta">
        ${srcPill(q.source_type)}${q.year ? `<span class="pill">${q.year}</span>` : ''}
        <span class="pill ${isMulti ? 'multi' : ''}">${isMulti ? '多选题' : '单选题'}</span>
        ${q.chapter ? `<span class="pill brand" style="cursor:pointer" onclick="openLecture('${q.chapter}')">${esc(chName(q.chapter))} ›</span>` : ''}
        ${store.wrong[q.id] ? '<span class="pill" style="color:var(--bad)">错题</span>' : ''}
      </div>
      ${q.caseBg ? `<div class="casebg">${esc(q.caseBg)}</div>` : ''}
      <div class="qstem">${esc(q.stem)}</div>
      <div id="opts">${Object.entries(q.options).map(([k, v]) =>
        `<div class="opt" data-k="${k}"><div class="k">${k}</div><div>${esc(v)}</div></div>`).join('')}</div>
      <div id="feedback"></div>
      <div class="sticky-actions"><button id="submitBtn">${isMulti ? '确认（多选）' : '提交'}</button></div>
    </div>`;
}
function wireQuestion(q, { mode, onNext, onResult }) {
  const isMulti = q.type === 'multi';
  let sel = new Set();
  let submitted = false;
  const optsEl = $('#opts');
  optsEl.querySelectorAll('.opt').forEach(el => {
    el.onclick = () => {
      if (submitted) return;
      const k = el.dataset.k;
      if (isMulti) { sel.has(k) ? sel.delete(k) : sel.add(k); el.classList.toggle('sel'); }
      else { sel = new Set([k]); optsEl.querySelectorAll('.opt').forEach(o => o.classList.toggle('sel', o === el)); }
    };
  });
  const btn = $('#submitBtn');
  btn.onclick = () => {
    if (!submitted) {
      if (!sel.size) { alert('请选择答案'); return; }
      submitted = true;
      const picked = [...sel].sort().join('');
      const answer = q.answer.split('').sort().join('');
      const correct = picked === answer;
      optsEl.querySelectorAll('.opt').forEach(el => {
        const k = el.dataset.k;
        const inAns = q.answer.includes(k), inSel = sel.has(k);
        el.style.pointerEvents = 'none';
        if (inAns) el.classList.add('correct');
        else if (inSel) el.classList.add('wrong');
      });
      recordAnswer(q, correct, mode);
      $('#feedback').innerHTML = feedbackHtml(q, correct);
      btn.textContent = '下一题 ›';
      if (onResult) onResult(correct);
    } else {
      onNext();
    }
  };
}
// 三层解析：① 选项逐项 ② 出题思路 ③ 知识点回顾 + 对应知识点 + 思维导图
function feedbackHtml(q, correct) {
  const ansTxt = q.answer;
  let html = `<div class="explain">
    <div class="lbl">${correct ? '<span class="res-ok">✓ 回答正确</span>' : '<span class="res-bad">✗ 回答错误</span>'} · 正确答案：${esc(ansTxt)}</div>`;
  html += `<div class="layer"><div class="layer-h">① 选项逐项解析（错在哪里 · 为何正确）</div>`;
  if (q.explain) html += `<p>${esc(q.explain)}</p>`;
  (q.oa || []).forEach((t, i) => {
    const mk = q.answer.includes(String.fromCharCode(65 + i)) ? 'ok' : 'no';
    html += `<div class="opt-note ${mk}"><span class="mark ${mk}">${mk === 'ok' ? '✓' : '✗'}</span><b>${String.fromCharCode(65 + i)}.</b> ${esc(t)}</div>`;
  });
  html += `</div>`;
  html += `<div class="layer"><div class="layer-h">② 出题思路（主题与解题要点）</div><p>${esc(q.logic || '')}</p></div>`;
  const m = LECTURE[q.chapter] || {};
  html += `<div class="layer"><div class="layer-h">③ 知识点回顾与讲解（${esc(chName(q.chapter))}）</div>`;
  if (q.kp) html += `<div class="kp-callout"><b>本题对应知识点：</b>${esc(q.kp)}</div>`;
  if (m.review) html += `<p><b>知识回顾：</b>${esc(m.review)}</p>`;
  if (m.detail) html += `<p><b>详细讲解：</b>${esc(m.detail)}</p>`;
  if (m.map) html += `<details class="mm-box"><summary>展开本章思维导图</summary>${renderMind(m.map, 0)}</details>`;
  html += `</div></div>`;
  return html;
}
// 思维导图渲染（嵌套树: 节点 {t, d?, c:[...]}；叶子可为字符串或 {t, d}）
function renderMind(node, depth) {
  if (Array.isArray(node)) return node.map(n => renderMind(n, depth)).join('');
  if (typeof node === 'string') return `<div class="mm-node" style="margin-left:${depth * 16}px">· ${esc(node)}</div>`;
  if (node && node.t) {
    let h = `<div class="mm-node mm-t" style="margin-left:${depth * 16}px">▸ ${esc(node.t)}</div>`;
    // 再细化一层：每个名词/公式都给出简明释义
    if (node.d) h += `<div class="mm-def" style="margin-left:${(depth + 1) * 16}px">${esc(node.d)}</div>`;
    (node.c || []).forEach(c => h += renderMind(c, depth + 1));
    return h;
  }
  return '';
}
function recordAnswer(q, correct, mode) {
  S();
  store.answered[q.id] = { correct, ts: now() };
  if (mode === 'review') updateSR(q.id, correct);
  else {
    if (!correct) addWrong(q.id);
    else if (store.wrong[q.id]) updateSR(q.id, true);
  }
  saveStore();
}

// ==================================================================
// 三轮学习（保留特色功能）
// ==================================================================
let roundState = null;           // 当前进行中的学习会话（内存镜像）
let roundTab = 'round';          // rounds 页签：'round' 全库三轮 / 'chapter' 按章节学

// 持久化的“进行中学习会话”：退出页面也不丢失，回来可“继续练习”
// { kind:'round'|'chapter', round?, chapter?, ids:[], i, done, correct }
function saveActiveStudy() {
  if (!roundState) return;
  store.activeStudy = {
    kind: roundState.kind,
    round: roundState.round || 0,
    chapter: roundState.chapter || '',
    ids: roundState.ids,
    i: roundState.i,
    done: roundState.done,
    correct: roundState.correct,
  };
  saveStore();
}
function clearActiveStudy() { delete store.activeStudy; saveStore(); }
function activeStudyMatches(kind, key) {
  const a = store.activeStudy;
  if (!a || a.kind !== kind) return false;
  if (kind === 'round') return a.round === key && a.i < a.ids.length;
  return a.chapter === key && a.i < a.ids.length;
}
routes.rounds = renderRoundPicker;
function getRoundQuestions(round) { try { return (store.roundQuestions && store.roundQuestions[round]) || null; } catch (e) { return null; } }
function setRoundQuestions(round, ids) { store.roundQuestions = store.roundQuestions || {}; store.roundQuestions[round] = ids; saveStore(); }
// 每轮按章节顺序, 每轮≥160题, 三轮跨轮去重、累计覆盖全库; 每轮题单持久化(再学一遍复用原题)
function buildRound(roundNum) {
  roundNum = +roundNum || 1;
  const stored = getRoundQuestions(roundNum);
  let _stored = (stored || []).filter(id => BYID[id]);   // 防御：剔除更新后已不存在的题
  if (_stored.length) return _stored.map(id => BYID[id]);
  let picked = new Set(store.roundsPicked || []);
  let pool = BANK.filter(x => !picked.has(x.id));
  if (pool.length === 0) { store.roundsPicked = []; saveStore(); pool = BANK.slice(); }
  const byCh = {};
  pool.forEach(x => { (byCh[x.chapter] = byCh[x.chapter] || []).push(x); });
  const chs = Object.keys(byCh).map(chNum).sort((a, b) => a - b);
  let chosen = [];
  if (pool.length <= TARGET * 1.5) {
    chosen = pool.slice(); // 收尾：剩余不足1.5轮则抽完，保证三轮累计覆盖全库
  } else {
    const ptr = {}; chs.forEach(c => ptr[c] = 0);
    let guard = 0, ci = 0;
    while (chosen.length < TARGET && guard++ < pool.length * 3) {
      const c = chs[ci % chs.length]; ci++;
      const arr = byCh['工商-' + c];
      if (ptr[c] < arr.length) chosen.push(arr[ptr[c]++]);
    }
  }
  const a = store.roundsPicked || []; chosen.forEach(x => { if (!a.includes(x.id)) a.push(x.id); });
  store.roundsPicked = a; setRoundQuestions(roundNum, chosen.map(x => x.id));
  chosen.sort((x, y) => chNum(x.chapter) - chNum(y.chapter));
  return chosen;
}
function renderRoundPicker() {
  S();
  const rr = store.roundResults || {};
  const as = store.activeStudy;
  const chs = CHAPTERS['工商'] || [];
  const groups = {};
  chs.forEach(c => { (groups[c.part] = groups[c.part] || []).push(c); });
  const cnt = cid => BANK.filter(q => q.chapter === cid).length;
  const multiCnt = cid => BANK.filter(q => q.chapter === cid && q.type === 'multi').length;
  let html = `${topbar('三轮学习', "nav('home')")}
    <div class="card sub">逐题提交即判对错 + 三层解析 + 对应知识点；支持<b>全库三轮</b>与<b>按章节学</b>两种方式，进度自动保存，退出后可在「继续练习」接着做。</div>
    <div class="seg">
      <span class="seg-i ${roundTab === 'round' ? 'on' : ''}" onclick="roundTab='round';renderRoundPicker()">🌀 全库三轮</span>
      <span class="seg-i ${roundTab === 'chapter' ? 'on' : ''}" onclick="roundTab='chapter';renderRoundPicker()">📖 按章节学</span>
    </div>`;
  if (roundTab === 'round') {
    html += `<div class="round-pick">` + [1, 2, 3].map(r => {
      const x = rr['r' + r];
      const label = x ? ('正确率 ' + x.acc + '%') : '未开始';
      const cont = activeStudyMatches('round', r);
      const btn = cont ? ('继续练习（第' + (as.i + 1) + '/' + as.ids.length + '）') : (x ? '再学一遍' : '开始学习');
      return `<div class="rp ${x ? 'done' : ''}" onclick="startRound(${r})">
          <div class="badge">${r === 1 ? '首轮' : r === 2 ? '巩固' : '冲刺'}</div>
          <div class="no">${r}</div>
          <div class="t">第 ${r} 轮</div>
          <div class="s">${label}</div>
          <button class="sm" style="margin-top:10px">${btn}</button>
        </div>`;
    }).join('') + `</div>
    <div class="card sub">规则：不计时自由作答；三轮抽题互不重复，累计覆盖全库 ${BANK.length} 题；学完一轮看正确率，错题自动进错题本。每轮均含单选与多选。</div>
    <button class="ghost sm" onclick="if(confirm('重置三轮历史？已抽题会清空可重新抽。')){store.roundsPicked=[];store.roundQuestions={};store.roundResults={};saveStore();renderRoundPicker();}">🔄 重置三轮历史</button>`;
  } else {
    html += Object.entries(groups).map(([part, list]) => `
      <div class="card">
        <h3>${esc(part || '其他')}</h3>
        ${list.map(c => {
          const cont = activeStudyMatches('chapter', c.id);
          const btn = cont ? ('继续练习（第' + (as.i + 1) + '/' + as.ids.length + '）') : ('开始学习（' + cnt(c.id) + '题）');
          return `<div class="opt" style="cursor:pointer;display:flex;align-items:center;gap:10px" onclick="startChapterRound('${c.id}')">
            <div style="flex:1">${esc(c.name)} ${multiCnt(c.id) ? `<span class="pill multi">含多选${multiCnt(c.id)}</span>` : ''}</div>
            <button class="sm" style="flex:none">${btn}</button>
          </div>`;
        }).join('')}
      </div>`).join('');
    html += `<div class="card sub">按章节学：只练<b>所选一章</b>的题目（含单选与多选），更适合分章突破；进度同样自动保存，退出后可「继续练习」。</div>`;
  }
  app().innerHTML = html;
}
window.startRound = (r) => {
  if (!BANK.length) { alert('题库为空'); return; }
  if (activeStudyMatches('round', r)) {
    const a = store.activeStudy;
    roundState = { kind: 'round', round: r, ids: a.ids.slice(), i: a.i, done: a.done, correct: a.correct };
  } else {
    const items = buildRound(r);
    roundState = { kind: 'round', round: r, ids: items.map(x => x.id), i: 0, done: 0, correct: 0 };
    saveActiveStudy();
  }
  renderRoundQ();
};
window.startChapterRound = (cid) => {
  if (!cid || !BYID) return;
  if (activeStudyMatches('chapter', cid)) {
    const a = store.activeStudy;
    roundState = { kind: 'chapter', chapter: cid, ids: a.ids.slice(), i: a.i, done: a.done, correct: a.correct };
  } else {
    const items = BANK.filter(x => x.chapter === cid);
    if (!items.length) { alert('该章暂无题目'); return; }
    roundState = { kind: 'chapter', chapter: cid, ids: items.map(x => x.id), i: 0, done: 0, correct: 0 };
    saveActiveStudy();
  }
  renderRoundQ();
};
function renderRoundQ() {
  const st = roundState; if (!st) return nav('rounds');
  const q = BYID[st.ids[st.i]];
  const isCh = st.kind === 'chapter';
  const prefix = isCh ? '按章学习' : ('三轮·第' + st.round + '/3轮');
  const backJs = isCh
    ? "if(confirm('退出本章学习？进度已保存，可随时继续。'))nav('rounds')"
    : "if(confirm('退出本轮？进度已保存，可在「继续练习」接着做。'))nav('rounds')";
  app().innerHTML = `${topbar(`${prefix} (${st.i + 1}/${st.ids.length})`, backJs)}
    <div class="progress"><i style="width:${st.i / st.ids.length * 100}%"></i></div>
    <div class="sub" style="margin-bottom:8px">已学 <b id="rDone">${st.done}</b>/${st.ids.length} · 正确率 <b id="rAcc">${st.done ? Math.round(st.correct / st.done * 100) : 0}%</b></div>
    ${questionCard(q, { mode: isCh ? 'chapter' : 'round' })}`;
  wireQuestion(q, {
    mode: isCh ? 'chapter' : 'round',
    onResult: (c) => {
      st.done++; if (c) st.correct++;
      const d = $('#rDone'); if (d) d.textContent = st.done;
      const a = $('#rAcc'); if (a) a.textContent = (st.done ? Math.round(st.correct / st.done * 100) : 0) + '%';
      saveActiveStudy();
    },
    onNext: () => { if (st.i < st.ids.length - 1) { st.i++; saveActiveStudy(); renderRoundQ(); } else finishRound(); }
  });
}
function finishRound() {
  const st = roundState;
  const acc = st.done ? Math.round(st.correct / st.done * 100) : 0;
  if (st.kind === 'round') {
    store.roundResults = store.roundResults || {};
    store.roundResults['r' + st.round] = { done: st.done, correct: st.correct, acc: acc, ts: Date.now() };
  }
  clearActiveStudy();   // 本轮/本章完成，清除进行中会话，下次进入重新抽/开始
  const isCh = st.kind === 'chapter';
  const next = st.kind === 'round' && st.round < 3;
  app().innerHTML = `${topbar((isCh ? '按章学习' : '三轮学习 · 第' + st.round + '/3轮') + ' 完成', "nav('rounds')")}
    <div class="card center">
      <div class="scorebig" style="color:var(--brand)">${acc}%</div>
      <div class="sub">本轮共 ${st.done} 题 · 答对 ${st.correct}</div>
      <div style="margin-top:8px;font-weight:600">${acc >= 80 ? '太棒了，这一轮基础扎实！' : '不错，错题都收好了，继续巩固～'}</div>
      <div class="row" style="margin-top:18px">
        ${isCh
          ? `<button onclick="startChapterRound('${st.chapter}')">再学本章</button>`
          : (next ? `<button onclick="startRound(${st.round + 1})">进入第 ${st.round + 1} 轮 →</button>` : `<button class="ghost" onclick="nav('exam')">📝 三轮学完，去模拟考试！</button>`)}
        <button class="ghost" onclick="nav('wrong')">看错题本</button>
      </div>
    </div>`;
}

// ==================================================================
// 错题本 + 间隔重复
// ==================================================================
function addWrong(id) {
  S();
  const w = store.wrong[id];
  if (!w) store.wrong[id] = { box: 0, due: now(), addTs: now(), lastTs: now(), wrongCount: 1 };
  else { w.box = 0; w.due = now(); w.lastTs = now(); w.wrongCount++; }
}
function updateSR(id, correct) {
  S();
  const w = store.wrong[id];
  if (!w) return;
  if (correct) {
    w.box++;
    if (w.box >= SR_INTERVALS.length) { delete store.wrong[id]; return; }
    w.due = now() + SR_INTERVALS[w.box] * DAY;
  } else { w.box = 0; w.due = now(); w.wrongCount++; }
  w.lastTs = now();
}
function dueWrongIds() {
  S();
  return Object.keys(store.wrong).filter(id => BYID[id] && isObj(store.wrong[id]) && typeof store.wrong[id].due === 'number' && store.wrong[id].due <= now());
}
let reviewState = null;
routes.wrong = (params) => {
  if (params.start) return renderReview();
  S();
  const all = Object.keys(store.wrong).filter(id => BYID[id]);
  const due = dueWrongIds();
  const bySubj = {};
  all.forEach(id => { const s = BYID[id].subject; bySubj[s] = (bySubj[s] || 0) + 1; });
  app().innerHTML = `
    ${topbar('错题本', "nav('home')")}
    <div class="card"><div class="grid2">
      <div class="stat"><div class="n" style="color:var(--bad)">${all.length}</div><div class="l">错题总数</div></div>
      <div class="stat"><div class="n" style="color:var(--warn)">${due.length}</div><div class="l">今日待复习</div></div>
    </div>
    <div class="sub center" style="margin-top:6px">${SUBJECTS.map(s => `${SUBJECT_FULL[s]} ${bySubj[s] || 0}`).join(' · ')}</div>
    </div>
    ${all.length === 0 ? `<div class="empty">🎉<div style="margin-top:6px;font-weight:600">还没有错题</div><span class="sub">做错的题会自动收进这里，并按遗忘曲线安排复习</span></div>` : `
    <div class="card">
      <h3>间隔重复复习</h3>
      <div class="sub" style="margin-bottom:12px">答对一次进入下一复习周期（今天→1天→3天→7天后），连续答对 4 次即“毕业”移出错题本；答错则重新开始。</div>
      <button onclick="startReview('due')" ${due.length ? '' : 'disabled'}>开始复习今日待复习（${due.length}）</button>
      <div class="row" style="margin-top:10px">
        ${SUBJECTS.map(s => `<button class="ghost" onclick="startReview('${s}')" ${(bySubj[s] || 0) ? '' : 'disabled'}>复习${s}全部(${bySubj[s] || 0})</button>`).join('')}
      </div>
    </div>
    ${wrongChapterBreakdown(all)}`}`;
};
function wrongChapterBreakdown(ids) {
  const byCh = {};
  ids.forEach(id => { const c = BYID[id].chapter || '未分类'; byCh[c] = (byCh[c] || 0) + 1; });
  const rows = Object.entries(byCh).sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (!rows.length) return '';
  const max = rows[0][1];
  return `<div class="card"><h3>薄弱章节（错题分布）</h3>
    ${rows.map(([cid, n]) => `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:3px">
          <span style="cursor:pointer" onclick="${cid !== '未分类' ? `openLecture('${cid}')` : ''}">${esc(cid === '未分类' ? '未分类' : chName(cid))}${cid !== '未分类' && LECTURE[cid] ? ' 📖' : ''}</span>
          <span style="color:var(--bad);font-weight:700">${n}</span>
        </div>
        <div class="progress"><i style="width:${n / max * 100}%;background:var(--bad)"></i></div>
      </div>`).join('')}
  </div>`;
}
window.openLecture = (cid) => { location.hash = '#lecture?cid=' + cid; };
routes.lecture = (params) => {
  const cid = params.cid;
  const ch = CHBYID[cid];
  const content = LECTURE[cid];
  const qn = BANK.filter(q => q.chapter === cid).length;
  app().innerHTML = `${topbar(ch ? ch.name : '章节讲解', "history.length>1?history.back():nav('home')")}
    <div class="card">
      <div class="qmeta">${ch ? `<span class="pill">${esc(ch.part)}</span>` : ''}<span class="pill brand">${qn} 道题</span></div>
      <h2>${ch ? esc(ch.name) : '未分类'}</h2>
      <div class="row" style="margin-top:10px">
        <button class="sm" onclick="startPractice('工商','全部',false,false,'${cid}')">练本章题目</button>
      </div>
    </div>
    ${changeAlert(cid)}
    ${content ? `<div class="card"><h3>考点讲解</h3><div class="lecture">${lectureHtml(cid)}</div></div>`
      : `<div class="empty">📖<br><span class="sub">本章暂无讲解，可先“练本章题目”结合解析复习</span></div>`}`;
};
function lectureHtml(cid) {
  const m = LECTURE[cid] || {};
  let html = '';
  if (m.review) html += `<p><b>知识回顾：</b>${esc(m.review)}</p>`;
  if (m.detail) html += `<p><b>详细讲解：</b>${esc(m.detail)}</p>`;
  if (m.map) html += `<details class="mm-box" open><summary>本章思维导图</summary>${renderMind(m.map, 0)}</details>`;
  return html;
}
routes.chapters = (params) => {
  const subj = SUBJECTS.includes(params.subject) ? params.subject : '工商';
  const chs = CHAPTERS[subj] || [];
  const groups = {};
  chs.forEach(c => { (groups[c.part] = groups[c.part] || []).push(c); });
  const cnt = cid => BANK.filter(q => q.subject === subj && q.chapter === cid).length;
  app().innerHTML = `${topbar('章节讲解', "nav('home')")}
    <div class="card"><div class="sub">点章节看思维导图与知识回顾，或直接练本章题目。</div></div>
    ${Object.entries(groups).map(([part, list]) => `
      <div class="card">
        <h3>${esc(part || '其他')}</h3>
        ${list.map(c => `<div class="opt" style="cursor:pointer" onclick="openLecture('${c.id}')">
          <div style="flex:1">${esc(c.name)} ${LECTURE[c.id] ? '📖' : ''} ${CHANGES[c.id] ? '<span style="color:var(--warn)">⚠️2026变动</span>' : ''}</div>
          <div class="pill">${cnt(c.id)} 题</div></div>`).join('')}
      </div>`).join('')}`;
};
window.startReview = (which) => {
  S();
  let ids;
  if (which === 'due') ids = dueWrongIds();
  else ids = Object.keys(store.wrong).filter(id => BYID[id] && BYID[id].subject === which);
  if (!ids.length) return;
  ids.sort((a, b) => store.wrong[a].due - store.wrong[b].due);
  reviewState = { ids, i: 0, which };
  renderReview();
};
function renderReview() {
  const st = reviewState;
  if (!st || !st.ids.length) return nav('wrong');
  while (st.i < st.ids.length && !store.wrong[st.ids[st.i]]) st.i++;
  if (st.i >= st.ids.length) return finishReview();
  const q = BYID[st.ids[st.i]];
  const w = store.wrong[q.id];
  app().innerHTML = `
    ${topbar(`复习 · ${st.i + 1}/${st.ids.length}`, "if(confirm('结束复习？'))nav('wrong')")}
    <div class="progress"><i style="width:${(st.i + 1) / st.ids.length * 100}%"></i></div>
    <div class="sub" style="margin-bottom:8px">已错 ${w.wrongCount} 次 · 复习进度 ${w.box}/${SR_INTERVALS.length}</div>
    ${questionCard(q, { mode: 'review' })}`;
  wireQuestion(q, { mode: 'review', onNext: () => { st.i++; renderReview(); } });
}
function finishReview() {
  const remaining = dueWrongIds().length;
  app().innerHTML = `${topbar('复习完成', "nav('home')")}
    <div class="card center"><div class="scorebig">✓</div>
    <div class="sub" style="margin-top:8px">本轮复习结束${remaining ? `，还有 ${remaining} 道待复习` : '，今日复习已清空 🎉'}</div>
    <div class="row" style="margin-top:18px">
      ${remaining ? `<button onclick="startReview('due')">继续复习</button>` : ''}
      <button class="ghost" onclick="nav('wrong')">返回错题本</button>
    </div></div>`;
}

// ==================================================================
// 模拟考试（工商管理卷：单选+多选+案例，限时，自动评分）
// ==================================================================
let examState = null;
routes.exam = (params) => {
  if (examState && params.resume) return renderExam();
  S();
  app().innerHTML = `
    ${topbar('模拟考试', "nav('home')")}
    ${SUBJECTS.map(s => {
    const sp = EXAM_SPEC[s];
    const poolS = BANK.filter(q => q.subject === s && !q.caseBg && q.type === 'single').length;
    const poolM = BANK.filter(q => q.subject === s && !q.caseBg && q.type === 'multi').length;
    const poolC = BANK.filter(q => q.caseBg).length;
    const enough = poolS >= sp.single && poolM >= sp.multi && poolC >= sp.case;
    return `<div class="card">
        <h3>${SUBJECT_FULL[s]}</h3>
        <div class="sub">${sp.single} 单选（${sp.singlePt}分）+ ${sp.multi} 多选（${sp.multiPt}分）+ ${sp.case} 案例（${sp.casePt}分） · 满分 ${sp.total} · 合格 ${sp.pass} · ${sp.minutes} 分钟</div>
        <button style="margin-top:12px" onclick="startExam('${s}')" ${enough ? '' : 'disabled'}>${enough ? '开始模拟考' : '题量不足，暂不可考'}</button>
      </div>`;
  }).join('')}
    ${store.exams.length ? `<div class="card"><h3>历史成绩</h3>${store.exams.slice(-8).reverse().map(e =>
    `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)">
        <span>${SUBJECT_FULL[e.subject]}</span>
        <span class="${e.score >= e.pass ? 'res-ok' : 'res-bad'}">${e.score}/${e.total} ${e.score >= e.pass ? '合格' : '未过'}</span>
      </div>`).join('')}</div>` : ''}`;
};
window.startExam = (subj) => {
  const sp = EXAM_SPEC[subj];
  const singles = sample(BANK.filter(q => q.subject === subj && !q.caseBg && q.type === 'single'), sp.single);
  const multis = sample(BANK.filter(q => q.subject === subj && !q.caseBg && q.type === 'multi'), sp.multi);
  const cases = sample(BANK.filter(q => q.caseBg), sp.case);
  const qs = [...singles, ...multis, ...cases];
  examState = { subj, sp, ids: qs.map(q => q.id), answers: {}, i: 0, endAt: now() + sp.minutes * 60000, submitted: false };
  renderExam();
};
function renderExam() {
  const st = examState;
  const q = BYID[st.ids[st.i]];
  const remainMs = st.endAt - now();
  if (remainMs <= 0 && !st.submitted) return submitExam(true);
  app().innerHTML = `
    <div class="topbar">
      <button class="back" onclick="if(confirm('交卷并查看成绩？'))submitExam(false)">✕</button>
      <div class="t">${st.i + 1}/${st.ids.length}</div>
      <div class="r timer" id="timer"></div>
    </div>
    <div class="progress"><i style="width:${(st.i + 1) / st.ids.length * 100}%"></i></div>
    ${examQuestionCard(q, st)}
    <div class="row" style="margin-top:8px">
      <button class="sec" onclick="examGoto(${st.i - 1})" ${st.i === 0 ? 'disabled' : ''}>‹ 上一题</button>
      ${st.i < st.ids.length - 1 ? `<button onclick="examGoto(${st.i + 1})">下一题 ›</button>`
      : `<button onclick="if(confirm('确认交卷？'))submitExam(false)">交卷</button>`}
    </div>
    <button class="sec sm" style="margin-top:10px" onclick="examSheet()">答题卡（已答 ${Object.keys(st.answers).length}/${st.ids.length}）</button>`;
  startExamTimer();
}
function examQuestionCard(q, st) {
  const isMulti = q.type === 'multi';
  const cur = new Set(st.answers[q.id] || []);
  const pt = q.caseBg ? st.sp.casePt : (isMulti ? st.sp.multiPt : st.sp.singlePt);
  return `<div class="card">
    ${q.caseBg ? `<div class="casebg">${esc(q.caseBg)}</div>` : ''}
    <div class="qmeta"><span class="pill ${isMulti ? 'multi' : ''}">${isMulti ? '多选题' : '单选题'}</span><span class="pill">${pt}分</span>${q.caseBg ? '<span class="pill brand">案例分析</span>' : ''}</div>
    <div class="qstem">${esc(q.stem)}</div>
    <div id="opts">${Object.entries(q.options).map(([k, v]) =>
    `<div class="opt ${cur.has(k) ? 'sel' : ''}" onclick="examPick('${q.id}','${k}',${isMulti})"><div class="k">${k}</div><div>${esc(v)}</div></div>`).join('')}</div>
  </div>`;
}
window.examPick = (id, k, isMulti) => {
  const st = examState; const cur = new Set(st.answers[id] || []);
  if (isMulti) { cur.has(k) ? cur.delete(k) : cur.add(k); }
  else { cur.clear(); cur.add(k); }
  st.answers[id] = [...cur];
  if (!cur.size) delete st.answers[id];
  renderExam();
};
window.examGoto = (i) => { examState.i = Math.max(0, Math.min(examState.ids.length - 1, i)); renderExam(); };
window.examSheet = () => {
  const st = examState;
  app().innerHTML = `<div class="topbar"><button class="back" onclick="renderExam()">‹</button><div class="t">答题卡</div><div class="r timer" id="timer"></div></div>
    <div class="card"><div style="display:flex;flex-wrap:wrap;gap:8px">
      ${st.ids.map((id, i) => `<button class="sm ${st.answers[id] ? '' : 'sec'}" style="flex:none;width:44px" onclick="examState.i=${i};renderExam()">${i + 1}</button>`).join('')}
    </div>
    <div class="sub" style="margin-top:12px">已答 ${Object.keys(st.answers).length} / ${st.ids.length}</div>
    <button style="margin-top:12px" onclick="if(confirm('确认交卷？'))submitExam(false)">交卷</button>
    </div>`;
  startExamTimer();
};
let examTimer = null;
function startExamTimer() {
  clearInterval(examTimer);
  const tick = () => {
    if (!examState || examState.submitted) { clearInterval(examTimer); return; }
    const ms = examState.endAt - now();
    const e = $('#timer');
    if (e && ms > 0) {
      const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000);
      e.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      e.classList.toggle('warn', ms < 5 * 60000);
    }
    if (ms <= 0) { clearInterval(examTimer); submitExam(true); }
  };
  tick();
  examTimer = setInterval(tick, 1000);
}
window.submitExam = (auto) => {
  const st = examState; if (st.submitted) return;
  st.submitted = true; clearInterval(examTimer);
  const sp = st.sp;
  let score = 0, nCorrect = 0;
  const detail = st.ids.map(id => {
    const q = BYID[id];
    const picked = (st.answers[id] || []).slice().sort().join('');
    const ans = q.answer.split('').sort().join('');
    const pickedSet = new Set(st.answers[id] || []);
    const ansSet = new Set(q.answer.split(''));
    const isMulti = q.type === 'multi';
    const pt = q.caseBg ? sp.casePt : (isMulti ? sp.multiPt : sp.singlePt);
    let pts = 0, ok = false;
    if (!isMulti) { ok = picked === ans; pts = ok ? pt : 0; }
    else {
      const anyWrong = [...pickedSet].some(k => !ansSet.has(k));
      if (picked === ans) { pts = pt; ok = true; }
      else if (!anyWrong && pickedSet.size > 0) { pts = Math.min(pickedSet.size * 0.5, pt - 0.5); }
      else pts = 0;
    }
    if (ok) nCorrect++;
    score += pts;
    S(); store.answered[id] = { correct: ok, ts: now() };
    if (!ok) addWrong(id);
    return { id, picked, ans, ok: ok, pts };
  });
  score = Math.round(score * 10) / 10;
  S(); store.exams.push({ subject: st.subj, score, total: sp.total, pass: sp.pass, ts: now(), n: st.ids.length, nCorrect });
  saveStore();
  st.detail = detail;
  renderExamResult();
};
function renderExamResult() {
  const st = examState, sp = st.sp;
  const last = store.exams[store.exams.length - 1];
  const pass = last.score >= sp.pass;
  app().innerHTML = `${topbar('模拟考成绩', "nav('exam')")}
    <div class="card center">
      <div class="scorebig ${pass ? 'res-ok' : 'res-bad'}">${last.score}</div>
      <div class="sub">满分 ${sp.total} · 合格线 ${sp.pass} · 答对 ${last.nCorrect}/${st.ids.length}</div>
      <div style="margin-top:10px"><span class="pill ${pass ? 'real' : ''}" style="${pass ? '' : 'background:var(--badbg);color:var(--bad)'}">${pass ? '✓ 达到合格线' : '✗ 未达合格线'}</span></div>
      <div style="margin-top:10px;font-weight:600;color:var(--brand)">${pass ? '保持手感，稳了！' : '差一点点，再刷刷三轮学习就稳了'}</div>
    </div>
    <div class="card"><h3>逐题回顾</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${st.detail.map((d, i) => `<button class="sm ${d.ok ? '' : 'sec'}" style="flex:none;width:44px;${d.ok ? 'background:var(--ok)' : 'background:var(--badbg);color:var(--bad)'}" onclick="examReview(${i})">${i + 1}</button>`).join('')}
      </div>
      <div class="sub" style="margin-top:10px">绿=对，红=错。点击查看题目与解析。错题已自动加入错题本。</div>
    </div>
    <button onclick="nav('exam')">返回</button>`;
}
window.examReview = (i) => {
  const st = examState; const q = BYID[st.ids[i]]; const d = st.detail[i];
  app().innerHTML = `${topbar(`第 ${i + 1} 题`, "renderExamResult()")}
    <div class="card">
      ${q.caseBg ? `<div class="casebg">${esc(q.caseBg)}</div>` : ''}
      <div class="qmeta">${srcPill(q.source_type)}<span class="pill ${q.type === 'multi' ? 'multi' : ''}">${q.type === 'multi' ? '多选' : '单选'}</span>
        <span class="pill ${d.ok ? 'real' : ''}" style="${d.ok ? '' : 'background:var(--badbg);color:var(--bad)'}">${d.ok ? '✓ +' + d.pts : '✗'}</span></div>
      <div class="qstem">${esc(q.stem)}</div>
      <div>${Object.entries(q.options).map(([k, v]) => {
    const inAns = q.answer.includes(k), inPick = (d.picked || '').includes(k);
    let cls = ''; if (inAns) cls = 'correct'; else if (inPick) cls = 'wrong';
    return `<div class="opt ${cls}" style="pointer-events:none"><div class="k">${k}</div><div>${esc(v)}</div></div>`;
  }).join('')}</div>
      <div class="explain"><div class="lbl">你的答案：${d.picked || '未答'} · 正确答案：${q.answer}</div>${q.explain ? esc(q.explain) : '<span class="sub">（暂无解析）</span>'}</div>
    </div>
    <div class="row"><button class="sec" onclick="examReview(${Math.max(0, i - 1)})" ${i === 0 ? 'disabled' : ''}>‹ 上一题</button>
      <button class="sec" onclick="examReview(${Math.min(st.ids.length - 1, i + 1)})" ${i === st.ids.length - 1 ? 'disabled' : ''}>下一题 ›</button></div>`;
};

// ---------- 公共组件 ----------
function topbar(title, backJs) {
  return `<div class="topbar"><button class="back" onclick="${backJs}">‹</button><div class="t">${title}</div></div>`;
}
document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => nav(b.dataset.nav));

// ==================================================================
// 用户名门 + 云同步（保留旧版能力：按用户名隔离 + 跨设备备份）
// ==================================================================
function renderUserGate() {
  $('#tabbar').hidden = true;
  app().innerHTML = `
    <div class="gate">
      <div class="gate-card card">
        <div class="gate-emoji">👤</div>
        <h2>先告诉我你的名字</h2>
        <div class="sub" style="margin-bottom:14px">进度和错题会按名字分开保存，多人共用一台设备也不串；分享给朋友时，各记各的。</div>
        <input id="userName" class="inp" maxlength="20" placeholder="输入用户名，如 小明" />
        <button id="enterBtn" style="margin-top:12px;width:100%">进入刷题</button>
        <div class="sub" style="margin-top:10px;font-size:12px">仅本机记录，不会上传到任何服务器（除非你主动开启云同步）。</div>
      </div>
    </div>`;
  const inp = $('#userName');
  const go = () => {
    try {
      const n = (inp.value || '').trim().replace(/[<>'"]/g, '');
      if (!n) { inp.focus(); return; }
      enterUser(n);
    } catch (e) {
      console.error(e);
      alert('进入刷题失败：' + (e && e.message ? e.message : String(e)) + '\n可尝试刷新页面，或在开发者工具清除本站数据后重试。');
    }
  };
  $('#enterBtn').onclick = go;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  setTimeout(() => inp.focus(), 50);
}
function enterUser(name) {
  setUser(name);
  store = loadStore();          // 加载该用户名自己的进度桶
  saveStore();
  startApp();
}
function switchUser() {
  if (!confirm('切换账号？当前进度已保存在「' + (curUser() || '游客') + '」名下。')) return;
  clearUser();
  store = {}; S();
  renderUserGate();
}
function startApp() {
  $('#tabbar').hidden = false;
  router();
}

// ---- 云同步（GitHub Contents API，进度写到 ee-sync 分支 data/<用户名>/progress.json） ----
function syncPath() { return 'data/' + encodeURIComponent(curUser()) + '/progress.json'; }
function b64(s) { return btoa(unescape(encodeURIComponent(s))); }
function deb64(s) { return decodeURIComponent(escape(atob(s))); }
async function ensureBranch() {
  try {
    const headers = { Authorization: 'token ' + getToken(), Accept: 'application/vnd.github+json' };
    const r = await fetch(`${API}/repos/${SYNC_REPO}/git/ref/heads/main`, { headers });
    if (!r.ok) return;
    const sha = (await r.json()).object.sha;
    await fetch(`${API}/repos/${SYNC_REPO}/git/refs`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'refs/heads/' + SYNC_BRANCH, sha })
    });
  } catch (e) {}
}
async function pushCloud() {
  if (!syncOn() || !curUser() || !getToken()) return false;
  await ensureBranch();
  const path = syncPath();
  const headers = { Authorization: 'token ' + getToken(), Accept: 'application/vnd.github+json' };
  let sha;
  try {
    const g = await fetch(`${API}/repos/${SYNC_REPO}/contents/${path}?ref=${SYNC_BRANCH}`, { headers });
    if (g.ok) sha = (await g.json()).sha;
  } catch (e) {}
  const body = { message: 'sync ' + curUser() + ' ' + Date.now(), content: b64(JSON.stringify(store)), branch: SYNC_BRANCH };
  if (sha) body.sha = sha;
  const r = await fetch(`${API}/repos/${SYNC_REPO}/contents/${path}`, {
    method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return r.ok;
}
async function pullCloud() {
  if (!syncOn() || !curUser() || !getToken()) return false;
  const path = syncPath();
  const headers = { Authorization: 'token ' + getToken(), Accept: 'application/vnd.github+json' };
  let data;
  try {
    const r = await fetch(`${API}/repos/${SYNC_REPO}/contents/${path}?ref=${SYNC_BRANCH}`, { headers });
    if (!r.ok) return false;
    data = await r.json();
  } catch (e) { return false; }
  try {
    const remote = JSON.parse(deb64(data.content));
    if (!store._ts || (remote._ts || 0) > store._ts) { store = Object.assign(loadStore(), remote); saveStore(); }
    return true;
  } catch (e) { return false; }
}
routes.settings = () => {
  S();
  const txt = getToken();
  app().innerHTML = `
    ${topbar('设置 · 云同步', "nav('home')")}
    <div class="card">
      <h3>GitHub 云同步（跨设备）</h3>
      <div class="sub" style="margin-bottom:10px">把当前用户「${esc(curUser() || '游客')}」的进度 / 错题备份到你自己的 GitHub 仓库（分支 ${SYNC_BRANCH}），手机电脑互通。需要你自己生成一个有 <b>repo</b> 权限的 Token，仅存本机，不会泄露给任何人。</div>
      <label class="lbl">Personal Access Token</label>
      <input id="token" class="inp" type="password" placeholder="ghp_xxx（仅存本机）" value="${esc(txt)}" />
      <label class="lbl" style="margin-top:12px;display:flex;align-items:center;gap:8px">
        <input type="checkbox" id="syncOn" ${syncOn() ? 'checked' : ''} /> 启用云同步（自动备份 + 打开时拉取）
      </label>
      <div class="row" style="margin-top:14px">
        <button onclick="saveSettings()">保存设置</button>
        <button class="ghost" onclick="testPush()">立即备份</button>
        <button class="ghost" onclick="testPull()">拉取最新</button>
      </div>
      <div id="syncMsg" class="sub" style="margin-top:10px"></div>
    </div>
    <div class="card sub" style="font-size:13px">
      <b>怎么生成 Token：</b> GitHub 网页 → 右上角头像 → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)，勾选 <b>repo</b>，生成后复制粘贴到上面。仓库固定为 ${SYNC_REPO}（你自己的公开仓库，进度对别人可见但无所谓）。
    </div>`;
};
window.saveSettings = () => {
  setToken($('#token').value.trim());
  setSyncOn($('#syncOn').checked);
  const m = $('#syncMsg'); m.textContent = '已保存。' + (syncOn() ? '云同步已开启，进度将自动备份。' : '云同步已关闭。');
  if (syncOn()) pushCloud().then(ok => { m.textContent += ok ? ' 已成功备份一次。' : ' 备份失败（检查 Token/网络）。'; }).catch(() => {});
};
window.testPush = () => {
  const m = $('#syncMsg'); m.textContent = '备份中…';
  pushCloud().then(ok => { m.textContent = ok ? '✅ 备份成功' : '❌ 备份失败（检查 Token/网络/权限）'; }).catch(() => { m.textContent = '❌ 备份出错'; });
};
window.testPull = () => {
  const m = $('#syncMsg'); m.textContent = '拉取中…';
  pullCloud().then(ok => { m.textContent = ok ? '✅ 已拉取最新进度' : '❌ 拉取失败（无备份或无权限）'; router(); }).catch(() => { m.textContent = '❌ 拉取出错'; });
};

// ---------- 启动 ----------
(async function () {
  app().innerHTML = `<div class="empty" style="padding-top:60px">⏳<div style="margin-top:10px;font-weight:600;color:var(--brand)">正在准备题库…</div></div>`;
  try {
    await loadBank();
    if (!curUser()) {
      renderUserGate();
    } else {
      if (syncOn()) { try { await pullCloud(); } catch (e) {} }
      startApp();
    }
  } catch (e) {
    app().innerHTML = '<div class="empty">⚠️<br><span class="sub">' + esc(e.message) + '</span></div>';
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
