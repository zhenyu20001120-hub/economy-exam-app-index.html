const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
(async () => {
  const appJs = read('app.js');
  const bank = read('bank.json');
  const lec = read('lecture.json');
  const cha = read('chapters.json');
  const chg = read('changes.json');
  const dom = new JSDOM(`<!doctype html><html><body><div id="app"></div><nav id="tabbar" hidden><button data-nav="home">h</button></nav></body></html>`,
    { runScripts: 'outside-only', url: 'https://zhenyu20001120-hub.github.io/economy-exam-app-index.html/', pretendToBeVisual: true });
  const w = dom.window;
  // 制造一个“旧版本”的畸形 store：wrong 是数组，且有一个元素是字符串，还有一个 due 不是数字
  const malformed = {
    wrong: [
      { due: Date.now(), box: 0 },          // 数组里放对象（旧版可能）
      'c1-1',                                // 旧版可能是字符串 id
      { box: 1 }                             // 缺 due 字段
    ],
    answered: { 'c1-2': 'yes-i-am-not-object' },  // 旧版 answered 可能存字符串
    roundsPicked: 'not-an-array',
    exams: 'nope'
  };
  w.localStorage.setItem('zjjjs_gq_v1_x', JSON.stringify(malformed));
  w.fetch = (u) => {
    const s = String(u);
    let b = '[]';
    if (s.endsWith('bank.json')) b = bank;
    else if (s.endsWith('lecture.json')) b = lec;
    else if (s.endsWith('chapters.json')) b = cha;
    else if (s.endsWith('changes.json')) b = chg;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(b)) });
  };
  let crashed = false;
  w.addEventListener('error', e => { crashed = true; console.log('[WIN ERR]', e.message); });
  try { w.eval(appJs); } catch (e) { console.log('[EVAL THROW]', e.stack); process.exit(1); }
  await new Promise(r => setTimeout(r, 800));
  const inp = w.document.getElementById('userName');
  if (!inp) { console.log('NOT on gate — unexpected'); process.exit(1); }
  inp.value = 'x';                       // 老用户名，命中畸形 store
  const btn = w.document.getElementById('enterBtn');
  let clickErr = null;
  try { btn.onclick(); } catch (e) { clickErr = e; }
  await new Promise(r => setTimeout(r, 400));
  const preview = w.document.getElementById('app').innerHTML;
  const onHome = preview.includes('hero') || preview.includes('中级经济师');
  console.log('--- RESULT ---');
  console.log('click threw?     ', clickErr ? clickErr.message : 'NO');
  console.log('window error?    ', crashed);
  console.log('curUser=         ', w.localStorage.getItem('zjjjs_user'));
  console.log('tabbarHidden=    ', w.document.getElementById('tabbar').hidden);
  console.log('reached home?    ', onHome);
  // 检查 store 是否被洗白
  const after = JSON.parse(w.localStorage.getItem('zjjjs_gq_v1_x') || '{}');
  console.log('sanitized wrong= ', JSON.stringify(after.wrong));
  console.log('sanitized answered=', JSON.stringify(after.answered));
  console.log('sanitized roundsPicked=', JSON.stringify(after.roundsPicked), 'exams=', JSON.stringify(after.exams));
  console.log(onHome && !clickErr ? 'PASS ✅ 畸形 store 不再导致无响应' : 'FAIL ❌');
})();
