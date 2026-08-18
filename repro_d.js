/* Request C 增强验证：主题键 v2 + 侧栏按钮同步 + 答题卡分组/统计条 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const readJSON = (f) => JSON.parse(read(f));
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (e ? ' → ' + e : '')); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async function () {
  const html = read('index.html');
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
  const w = dom.window;
  w.localStorage.setItem('zjjjs_user', 'tester');
  // 模拟旧版深色残留：zjjjs_theme=dark 不应再影响默认主题
  w.localStorage.setItem('zjjjs_theme', 'dark');
  w.fetch = (url) => Promise.resolve({ json: () => Promise.resolve(readJSON(String(url).split('/').pop().split('?')[0])) });
  w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {};
  if (!('serviceWorker' in w.navigator)) Object.defineProperty(w.navigator, 'serviceWorker', { value: { register: () => Promise.reject() }, configurable: true });
  else w.navigator.serviceWorker.register = () => Promise.reject();

  const sApp = w.document.createElement('script');
  sApp.textContent = read('app.js');
  w.document.body.appendChild(sApp);
  const bridge = `window.__t = { get BANK(){return BANK}, get BYID(){return BYID}, get store(){return store}, get practiceState(){return practiceState}, startPractice:startPractice, renderPractice:renderPractice };`;
  const sB = w.document.createElement('script'); sB.textContent = bridge; w.document.body.appendChild(sB);

  for (let i = 0; i < 80; i++) { if (w.document.getElementById('tabbar') && !w.document.getElementById('tabbar').hidden) break; await wait(50); }
  const t = w.__t;

  console.log('\n【主题：默认浅色（忽略旧 dark 残留）】');
  ok('默认 data-theme=light（无视 zjjjs_theme=dark 残留）', w.document.documentElement.dataset.theme === 'light', 'theme=' + w.document.documentElement.dataset.theme);
  ok('侧栏切换按钮存在', !!w.document.getElementById('sidebarTheme'));
  ok('侧栏按钮初始文案含「切换深色」', /切换深色/.test(w.document.getElementById('sidebarTheme').textContent), w.document.getElementById('sidebarTheme').textContent);

  console.log('\n【切换并记忆到新键 zjjjs_theme_v2】');
  w.toggleTheme();
  ok('toggleTheme → dark', w.document.documentElement.dataset.theme === 'dark', 'theme=' + w.document.documentElement.dataset.theme);
  ok('dark 记忆到 zjjjs_theme_v2', w.localStorage.getItem('zjjjs_theme_v2') === 'dark', 'v2=' + w.localStorage.getItem('zjjjs_theme_v2'));
  ok('旧键 zjjjs_theme 不被改写', w.localStorage.getItem('zjjjs_theme') === 'dark');
  ok('悬浮按钮变 ☀️', w.document.getElementById('themeToggle').textContent === '☀️');
  ok('侧栏按钮同步为「切换浅色」', /切换浅色/.test(w.document.getElementById('sidebarTheme').textContent), w.document.getElementById('sidebarTheme').textContent);
  w.toggleTheme();
  ok('再切换回 light', w.document.documentElement.dataset.theme === 'light');
  ok('侧栏按钮同步回「切换深色」', /切换深色/.test(w.document.getElementById('sidebarTheme').textContent));

  console.log('\n【刷题页：答题卡分组 + 统计条（粉笔式）】');
  t.startPractice('工商', '全部', false, false, '');
  const total = t.practiceState.ids.length;
  ok('存在 .study-aside 右栏', !!w.document.querySelector('.study-aside'));
  ok('存在 .palette', !!w.document.querySelector('.palette'));
  ok('存在统计行 .palette-stat', !!w.document.querySelector('.palette-stat'));
  const statTxt = w.document.querySelector('.palette-stat').textContent;
  ok('统计行含「已答 X / 共 Y」', /已答\s*\d+\s*\/\s*共\s*\d+\s*题/.test(statTxt), statTxt);
  ok('统计行总数=题库量 ' + total, new RegExp('共\\s*' + total + '\\s*题').test(statTxt), statTxt);
  ok('存在进度条 .progress>i', !!w.document.querySelector('.palette .progress > i'));
  const secs = w.document.querySelectorAll('.palette-sec');
  ok('按题型分组（≥1 段）', secs.length >= 1, 'secs=' + secs.length);
  const secLabels = Array.from(w.document.querySelectorAll('.palette-sec-h span:first-child')).map(e => e.textContent);
  ok('含「单选题」分组', secLabels.includes('单选题'), secLabels.join(','));
  const hasMulti = secLabels.includes('多选题');
  ok('含「多选题」分组', hasMulti, secLabels.join(','));
  const groupedPc = w.document.querySelectorAll('.palette-sec .pc').length;
  ok('分组内题号格子总数 = 题库量 ' + total, groupedPc === total, 'groupedPc=' + groupedPc);
  // 当前题高亮
  const allPc = w.document.querySelectorAll('.palette .pc');
  ok('当前题(idx0)高亮 .cur', allPc[0] && allPc[0].classList.contains('cur'));

  console.log('\n【作答后：统计/分组着色】');
  const curId = t.practiceState.ids[t.practiceState.i];
  const rightK = t.BYID[curId].answer[0];
  w.document.querySelectorAll('#opts .opt').forEach(el => { if (el.dataset.k === rightK) el.click(); });
  w.document.querySelector('#submitBtn').click();
  w.eval('renderPractice()');
  const newStat = w.document.querySelector('.palette-stat').textContent;
  ok('作答后统计行显示「已答 1」', /已答\s*1\s*\//.test(newStat), newStat);
  ok('答对的题格子 .ok', w.document.querySelectorAll('.palette .pc')[0].classList.contains('ok'));

  console.log('\n==== Request C+ repro: ' + (fail === 0 ? 'ALL PASS' : fail + ' FAILED') + ' (' + pass + ' passed) ====');
  process.exit(fail === 0 ? 0 : 1);
})();
