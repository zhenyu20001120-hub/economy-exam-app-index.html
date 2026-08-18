/* 新版（数据驱动 + hash 路由 + PWA）集成测试
 * 1) 数据完整性：bank/chapters/lecture/changes JSON 校验
 * 2) jsdom 以真实 <script> 方式加载 index.html + app.js（stub fetch）
 * 3) 功能：首页、导航、三轮覆盖全库、三层解析、模拟考评分、错题间隔重复
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const readJSON = (f) => JSON.parse(read(f));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async function main() {
  // ============ 1. 数据完整性 ============
  console.log('\n【1】数据完整性');
  let bank, chapters, lecture, changes;
  try { bank = readJSON('bank.json'); } catch (e) { ok('bank.json 可解析', false, e.message); return finish(); }
  try { chapters = readJSON('chapters.json'); } catch (e) { ok('chapters.json 可解析', false, e.message); return finish(); }
  try { lecture = readJSON('lecture.json'); } catch (e) { ok('lecture.json 可解析', false, e.message); return finish(); }
  try { changes = readJSON('changes.json'); } catch (e) { ok('changes.json 可解析', false, e.message); return finish(); }

  ok('bank 为数组且 517 题', Array.isArray(bank) && bank.length === 517, 'length=' + (bank && bank.length));
  const singles = bank.filter(q => q.type === 'single' && !q.caseBg).length;
  const multis = bank.filter(q => q.type === 'multi' && !q.caseBg).length;
  const cases = bank.filter(q => q.caseBg).length;
  ok('题型分布 单选387/多选108/案例22', singles === 387 && multis === 108 && cases === 22, `single=${singles} multi=${multis} case=${cases}`);

  let bad = 0, noKp = 0, noMapLec = 0;
  const letters = s => (s || '').split('').every(c => c >= 'A' && c <= 'E');
  for (const q of bank) {
    if (!q.id || !q.stem || !q.options || !q.answer) { bad++; continue; }
    if (!letters(q.answer)) bad++;
    for (const k of q.answer) if (!(k in q.options)) bad++;
    if (!q.kp) noKp++;
    if (!(q.chapter in (lecture || {})) || !(lecture[q.chapter] && lecture[q.chapter].map)) noMapLec++;
  }
  ok('无坏题/答案非法', bad === 0, 'bad=' + bad);
  ok('所有题均有 kp 知识点', noKp === 0, 'noKp=' + noKp);
  ok('所有章节均有思维导图', noMapLec === 0, 'noMap=' + noMapLec);
  ok('chapters 含 11 章', chapters['工商'] && chapters['工商'].length === 11, 'n=' + (chapters['工商'] && chapters['工商'].length));
  ok('changes 含 2026 第6章变动', changes['工商-6'] && changes['工商-6'].adds && changes['工商-6'].adds.length > 0);

  // ============ 2. jsdom 加载 ============
  console.log('\n【2】jsdom 以真实 <script> 加载 index.html + app.js');
  const html = read('index.html');
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
  const w = dom.window;
  w.localStorage.setItem('zjjjs_user', 'tester'); // 预置用户名，避免用户名门拦截后续测试
  // stub 环境（须在注入 app.js 之前）
  w.fetch = (url) => Promise.resolve({ json: () => Promise.resolve(readJSON(String(url).split('/').pop().split('?')[0])) });
  w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {};
  if (!('serviceWorker' in w.navigator)) {
    try { Object.defineProperty(w.navigator, 'serviceWorker', { value: { register: () => Promise.reject() }, configurable: true }); } catch (e) {}
  } else { w.navigator.serviceWorker.register = () => Promise.reject(); }

  // 注入 app.js（真实脚本作用域，顶层 let/const 进入全局词法环境）
  const sApp = w.document.createElement('script');
  sApp.textContent = read('app.js');
  w.document.body.appendChild(sApp);

  // 桥接脚本：把词法变量暴露给测试（getter 形式，读取实时值）
  const bridge = `window.__t = {
    get BANK(){return BANK}, get BYID(){return BYID}, get store(){return store},
    get roundState(){return roundState}, get practiceState(){return practiceState}, get examState(){return examState},
    feedbackHtml:feedbackHtml, startRound:startRound, startChapterRound:startChapterRound, startPractice:startPractice,
    renderRoundPicker:renderRoundPicker, finishRound:finishRound, activeStudyMatches:activeStudyMatches,
    startExam:window.startExam, submitExam:window.submitExam,
    updateSR:updateSR, addWrong:addWrong, nav:nav, router:router, routes:routes, saveStore:saveStore,
    curUser:curUser, enterUser:enterUser, switchUser:switchUser,
    syncOn:syncOn, setSyncOn:setSyncOn, getToken:getToken, setToken:setToken,
    pushCloud:pushCloud, pullCloud:pullCloud, syncPath:syncPath
  };`;
  const sBridge = w.document.createElement('script');
  sBridge.textContent = bridge;
  w.document.body.appendChild(sBridge);

  let loaded = false;
  for (let i = 0; i < 80; i++) {
    if (w.document.getElementById('tabbar') && !w.document.getElementById('tabbar').hidden) { loaded = true; break; }
    await wait(50);
  }
  ok('题库加载完成（tabbar 显示）', loaded);
  const t = w.__t;
  ok('BANK 注入 517', t.BANK.length === 517, 'BANK.length=' + t.BANK.length);

  // ============ 3. 首页 + 导航 ============
  console.log('\n【3】首页与导航');
  w.location.hash = '#home'; w.__t.router();
  let appTxt = w.document.getElementById('app').textContent;
  ok('首页出现「三轮学习」入口', /三轮学习/.test(appTxt));
  ok('首页出现「以题促学」标语', /以题促学/.test(appTxt));
  for (const route of ['practice', 'rounds', 'wrong', 'exam', 'chapters', 'lecture?cid=工商-1']) {
    w.location.hash = '#' + route; w.__t.router();
    const txt = w.document.getElementById('app').textContent;
    ok('路由可渲染: ' + route, txt.length > 20);
  }

  // ============ 4. 三轮学习覆盖全库 ============
  console.log('\n【4】三轮学习：每轮≥160 + 跨轮去重 + 覆盖全库 517');
  const seen = new Set();
  const counts = [];
  for (const r of [1, 2, 3]) {
    t.startRound(r);
    const ids = t.roundState.ids.slice();
    counts.push(ids.length);
    ids.forEach(id => seen.add(id));
  }
  ok('第1轮 ≥160 题', counts[0] >= 160, 'n=' + counts[0]);
  ok('第2轮 ≥160 题', counts[1] >= 160, 'n=' + counts[1]);
  ok('三轮累计覆盖全部 517 题', seen.size === 517, 'covered=' + seen.size);
  const before = t.store.roundQuestions[1].length;
  t.startRound(1);
  const after = t.roundState.ids.length;
  ok('再学一遍复用同一题单', before === after, `${before} vs ${after}`);

  // ============ 5. 三层解析 ============
  console.log('\n【5】三层解析（选项/思路/知识点+思维导图）');
  const id = t.BANK.find(x => x.kp && t.BYID && x.chapter && lecture[x.chapter] && lecture[x.chapter].map).id;
  const fb = t.feedbackHtml(t.BYID[id], true);
  ok('① 选项逐项解析层存在', /选项解析|选项逐项解析/.test(fb));
  ok('① 含错误选项解释（错在哪里/名词释义）', /不是本题的正确结论|——|与题干所述情形不符|名词释义/.test(fb));
  ok('② 主题考点（出题思路）存在', /主题考点/.test(fb));
  ok('③ 知识点回顾层存在', /知识点回顾/.test(fb));
  ok('本题对应知识点卡片存在', /本题对应知识点/.test(fb));
  ok('③ 思维导图含名词/公式释义(mm-def)', /mm-def/.test(fb));

  // ============ 6. 刷题提交即判对错 ============
  console.log('\n【6】刷题：提交即判对错 + 记录');
  t.startPractice('工商', '全部', false, false, '');
  const curId = t.practiceState.ids[t.practiceState.i];
  const qObj = t.BYID[curId];
  const rightK = qObj.answer[0];
  const opts = w.document.querySelectorAll('#opts .opt');
  opts.forEach(el => { if (el.dataset.k === rightK) el.click(); });
  w.document.querySelector('#submitBtn').click();
  const fb2 = w.document.getElementById('app').innerHTML;
  ok('提交后显示解析（res-ok）', /res-ok/.test(fb2));
  ok('作答已写入存储', !!t.store.answered[curId]);

  // ============ 7. 模拟考试评分 ============
  console.log('\n【7】模拟考试：满分 140 / 合格 84');
  t.startExam('工商');
  ok('模拟考 100 题', t.examState.ids.length === 100, 'n=' + t.examState.ids.length);
  w.eval(`(function(){ for(const id of examState.ids){ examState.answers[id]=BYID[id].answer.split(''); } })()`);
  t.submitExam(false);
  const ex = t.store.exams[t.store.exams.length - 1];
  ok('全对得 140 分', ex.score === 140, 'score=' + ex.score);
  ok('全对 100 题全对', ex.nCorrect === 100, 'nCorrect=' + ex.nCorrect);

  // 全错 → 0 分 + 进错题本
  t.store.exams = [];
  t.startExam('工商');
  w.eval(`(function(){ for(const id of examState.ids){ const q=BYID[id]; const wrong=Object.keys(q.options).find(k=>!q.answer.includes(k)); examState.answers[id]=[wrong]; } })()`);
  t.submitExam(false);
  const ex2 = t.store.exams[t.store.exams.length - 1];
  ok('全错得 0 分', ex2.score === 0, 'score=' + ex2.score);
  ok('错题本收到 100 道', Object.keys(t.store.wrong).length === 100, 'wrong=' + Object.keys(t.store.wrong).length);

  // ============ 8. 间隔重复（SR）毕业 ============
  console.log('\n【8】错题间隔重复：答对 4 次毕业移出');
  const wid = Object.keys(t.store.wrong)[0];
  const box0 = t.store.wrong[wid].box;
  t.updateSR(wid, true);
  ok('答对后盒子升级', t.store.wrong[wid].box === box0 + 1, `${box0}->${t.store.wrong[wid].box}`);
  t.updateSR(wid, true); t.updateSR(wid, true); t.updateSR(wid, true);
  ok('连续答对4次（盒子达上限）移出错题本', !t.store.wrong[wid]);

  // ============ 9. 章节讲解 ============
  console.log('\n【9】章节讲解（chapters/lecture 渲染）');
  w.location.hash = '#lecture?cid=工商-6'; w.__t.router();
  const lec = w.document.getElementById('app').textContent;
  ok('章节页含「考点讲解」', /考点讲解/.test(lec));
  ok('章节页含 2026 变动提示', /2026 考纲变动/.test(lec));

  // ============ 10. 错题本页 ============
  console.log('\n【10】错题本页（待复习/分布）');
  for (let i = 0; i < 3; i++) t.addWrong(t.BANK[i].id);
  w.location.hash = '#wrong'; w.__t.router();
  const wrongPage = w.document.getElementById('app').textContent;
  ok('错题本页含「间隔重复复习」', /间隔重复复习/.test(wrongPage));

  // ============ 11. 按用户名隔离本地进度 ============
  console.log('\n【11】按用户名隔离本地进度');
  const testerRaw = JSON.parse(w.localStorage.getItem('zjjjs_gq_v1_tester') || '{}');
  ok('原用户 tester 进度已落盘', Object.keys(testerRaw.answered || {}).length > 0, 'n=' + Object.keys(testerRaw.answered || {}).length);
  w.confirm = () => true;
  t.switchUser(); // 清用户 → 显示用户名门
  const gateTxt = w.document.getElementById('app').textContent;
  ok('无用户名时显示用户名门', /先告诉我你的名字/.test(gateTxt));
  w.document.getElementById('userName').value = 'buyer2';
  w.document.getElementById('enterBtn').click();
  ok('切换后新用户名生效', t.curUser() === 'buyer2');
  ok('新用户进度为空（隔离）', Object.keys(t.store.answered).length === 0);
  t.switchUser();
  w.document.getElementById('userName').value = 'tester';
  w.document.getElementById('enterBtn').click();
  ok('切回 tester 进度恢复', Object.keys(t.store.answered).length > 0);

  // ============ 12. GitHub 云同步 推/拉 ============
  console.log('\n【12】GitHub 云同步（推/拉往返）');
  w.localStorage.setItem('zjjjs_user', 'clouduser');
  t.setToken('ghp_test_token'); t.setSyncOn(true);
  t.enterUser('clouduser');
  t.store.answered['qCLOUD'] = { correct: true, ts: 12345 };
  t.saveStore();
  const cloud = {};
  w.fetch = (url, opts) => {
    const u = String(url); opts = opts || {};
    const key = u.split('?')[0];
    if (u.includes('api.github.com')) {
      if (u.includes('/git/ref/heads/main')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ object: { sha: 'abc' } }) });
      if (u.includes('/git/refs') && (opts.method || 'GET') === 'POST') return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      if (u.includes('/contents/')) {
        if ((opts.method || 'GET') === 'PUT') { cloud[key] = JSON.parse(opts.body).content; return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); }
        if (cloud[key]) return Promise.resolve({ ok: true, json: () => Promise.resolve({ content: cloud[key], sha: 's1' }) });
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      }
    }
    return Promise.resolve({ json: () => Promise.resolve(readJSON(key.split('/').pop().split('?')[0])) });
  };
  const pushed = await t.pushCloud();
  ok('pushCloud 成功', pushed === true);
  w.localStorage.removeItem('zjjjs_gq_v1_clouduser');
  t.store = {};
  const pulled = await t.pullCloud();
  ok('pullCloud 成功', pulled === true);
  ok('拉回云端进度（qCLOUD）', !!(t.store.answered && t.store.answered['qCLOUD']));

  // ============ 13. 三轮进度持久化 + 继续练习 ============
  console.log('\n【13】三轮学习：进度持久化 + 继续练习（修复退出丢进度）');
  t.store.activeStudy = undefined; t.saveStore();
  t.startRound(1);
  const total1 = t.roundState.ids.length;
  function ansCur() {
    const q = t.BYID[t.roundState.ids[t.roundState.i]];
    const opts = w.document.querySelectorAll('#opts .opt');
    opts.forEach(el => { if (el.dataset.k === q.answer[0]) el.click(); });
    w.document.querySelector('#submitBtn').click();            // 提交→显示解析
    const nb = w.document.querySelector('#submitBtn'); if (nb) nb.click(); // 进入下一题
  }
  ansCur(); ansCur(); ansCur();
  ok('作答后 activeStudy 已持久化(i>0)', !!(t.store.activeStudy && t.store.activeStudy.i > 0), 'i=' + (t.store.activeStudy && t.store.activeStudy.i));
  // 退出再进入：应“继续练习”而非从头
  w.location.hash = '#home'; w.__t.router();
  w.location.hash = '#rounds'; w.__t.router();
  const beforeResume = t.store.activeStudy ? t.store.activeStudy.i : 0;
  t.startRound(1);
  ok('再进入第1轮从断点继续（继续练习）', t.roundState.i === beforeResume && t.roundState.i > 0, 'i=' + t.roundState.i);
  // 完成本轮应清除进行中会话（可再学一遍）
  t.roundState.i = t.roundState.ids.length - 1;
  t.finishRound();
  ok('完成本轮后清除 activeStudy（进度可重新开始）', !t.store.activeStudy);
  ok('完成本轮写入 roundResults', !!t.store.roundResults['r1']);

  // ============ 14. 按章节学 + 三轮含多选 ============
  console.log('\n【14】按章节学（C）+ 三轮含多选（E）');
  t.store.activeStudy = undefined; t.saveStore();
  t.startChapterRound('工商-1');
  ok('按章节学：进入 chapter 模式', !!(t.roundState && t.roundState.kind === 'chapter'));
  ok('按章节学：题目均为第1章', !!(t.roundState && t.roundState.ids.every(id => t.BYID[id].chapter === '工商-1')));
  const chMulti = t.roundState ? t.roundState.ids.filter(id => t.BYID[id].type === 'multi').length : 0;
  ok('按章节学：本章含多选', chMulti > 0, 'multi=' + chMulti);
  t.store.activeStudy = undefined; t.saveStore();
  t.startRound(1);
  const r1multi = t.roundState.ids.filter(id => t.BYID[id].type === 'multi').length;
  ok('三轮第1轮含多选', r1multi > 0, 'multi=' + r1multi);
  ok('三轮第1轮题量≥160', t.roundState.ids.length >= 160, 'n=' + t.roundState.ids.length);

  finish();
})().catch(e => { console.error('FATAL', e); process.exit(1); });

function finish() {
  console.log(`\n==== 结果：通过 ${pass} / 失败 ${fail} ====`);
  process.exit(fail ? 1 : 0);
}
