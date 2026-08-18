/* Request C 验证：右侧答题卡(答题卡面板) + 浅/深主题切换 */
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

  console.log('\n【主题：默认浅色 + 切换】');
  ok('默认 data-theme=light', w.document.documentElement.dataset.theme === 'light', 'theme=' + w.document.documentElement.dataset.theme);
  ok('切换按钮初始为 🌙(去深色)', w.document.getElementById('themeToggle').textContent === '🌙');
  w.toggleTheme();
  ok('toggleTheme → dark', w.document.documentElement.dataset.theme === 'dark', 'theme=' + w.document.documentElement.dataset.theme);
  ok('切换后按钮为 ☀️(去浅色)', w.document.getElementById('themeToggle').textContent === '☀️');
  ok('dark 已记忆到 localStorage', w.localStorage.getItem('zjjjs_theme') === 'dark');
  w.toggleTheme();
  ok('再切换回 light', w.document.documentElement.dataset.theme === 'light');
  ok('light 已记忆', w.localStorage.getItem('zjjjs_theme') === 'light');

  console.log('\n【刷题页：右侧答题卡面板】');
  t.startPractice('工商', '全部', false, false, '');
  const total = t.practiceState.ids.length;
  const aside = w.document.querySelector('.study-aside');
  ok('存在 .study-aside 右栏', !!aside);
  ok('存在 .palette 面板', !!w.document.querySelector('.palette'));
  const cells = w.document.querySelectorAll('.palette .pc');
  ok('题号格子数量 = 题库量 ' + total, cells.length === total, 'cells=' + cells.length);
  ok('当前题(idx0)高亮 .cur', cells[0] && cells[0].classList.contains('cur'));

  console.log('\n【作答后：面板状态着色】');
  const curId = t.practiceState.ids[t.practiceState.i];
  const rightK = t.BYID[curId].answer[0];
  w.document.querySelectorAll('#opts .opt').forEach(el => { if (el.dataset.k === rightK) el.click(); });
  w.document.querySelector('#submitBtn').click();
  w.eval('renderPractice()'); // 重新渲染以刷新面板着色
  const c0 = w.document.querySelectorAll('.palette .pc')[0];
  ok('答对的题对应格子 .ok', c0.classList.contains('ok'), 'cls=' + c0.className);
  ok('当前格仍 .cur', c0.classList.contains('cur'));
  const sub = w.document.querySelector('.palette-sub');
  ok('面板统计「已答 1」', /已答 1/.test(sub.textContent), sub.textContent);

  console.log('\n==== Request C repro: ' + (fail === 0 ? 'ALL PASS' : fail + ' FAILED') + ' (' + pass + ' passed) ====');
  process.exit(fail === 0 ? 0 : 1);
})();
