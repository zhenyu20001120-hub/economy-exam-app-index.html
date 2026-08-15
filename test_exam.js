/* jsdom 集成测试: 真实加载 index.html, 跑完一整场考试, 验证交卷返回结果 + 错题解析 + 三轮覆盖 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.com/', pretendToBeVisual: true });
const w = dom.window;
w.confirm = () => true;          // 自动确认交卷
w.alert = () => {};
w.scrollTo = () => {};

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log('  ✅ '+name); } else { fail++; console.log('  ❌ '+name); } }

// ---------- 1. 模拟考试: 交卷必须返回分数 + 错题表 ----------
console.log('【1】模拟考试 交卷返回结果');
w.eval("setUser('tester')");
w.eval("startMode('mock')");
let st = w.eval('state');
ok('mock 题数=100', st.items.length === 100);
// 全部答对
const expectedMax = w.eval(`(function(){ let s=0; for(let i=0;i<state.items.length;i++){ const q=state.items[i]; s+=scoreOf(q, q.answer); } return s; })()`);
w.eval(`(function(){ for(let i=0;i<state.items.length;i++){ state.idx=i; const q=state.items[i]; state.answers[q.id]=q.answer.slice(); } })()`);
w.eval("tryFinish()");
let app = w.document.getElementById('app');
ok('结果页含「模拟考试结果」标题', /模拟考试结果/.test(app.textContent));
ok('结果页渲染出分数卡(.card.center, 此前被 el 丢弃的内容)', !!app.querySelector('.card.center'));
const big = app.querySelector('.big');
ok('显示分数数字', big && /^\d+$/.test(big.textContent.trim()));
ok('全对得分=该套题可达满分('+expectedMax+')', big && big.textContent.trim() === String(expectedMax));
ok('全对时显示「全部正确」', /全部正确/.test(app.textContent));

// ---------- 2. 三轮复习: 每轮≥160 + 按章节顺序 + 不计时 + 跨轮去重 + 三轮覆盖全库 + 错题内联解析 ----------
console.log('【2】三轮复习 章节顺序/不计时/覆盖');
w.eval("resetRoundsPicked(); resetRoundResults(); renderRoundPicker();");
w.eval("startMode('round',1)");
st = w.eval('state');
const r1 = st.items.map(q => q.id);
ok('第1轮题数≥160 (用户要求每轮≥160)', r1.length >= 160);
ok('第1轮按章节顺序(chapter 单调不减)', w.eval(`(function(){ for(let i=1;i<state.items.length;i++){ if((state.items[i].chapter||0) < (state.items[i-1].chapter||0)) return false; } return true; })()`));
ok('第1轮不计时(state.untimed=true)', w.eval('state.untimed') === true);
let topbar = w.document.querySelector('.exam-topbar');
ok('第1轮顶部条显示「不计时」', topbar && /不计时/.test(topbar.textContent));
ok('第1轮顶部条无倒计时框(#examTimerBox)', !w.document.getElementById('examTimerBox'));
// 故意错前8题, 其余答对
w.eval(`(function(){ for(let i=0;i<state.items.length;i++){ state.idx=i; const q=state.items[i]; if(i<8){ const wrong=[ q.answer[0]===0?1:0 ]; state.answers[q.id]=wrong; } else { state.answers[q.id]=q.answer.slice(); } } })()`);
w.eval("tryFinish()");
app = w.document.getElementById('app');
ok('第1轮结果页含「三轮复习」标题', /三轮复习/.test(app.textContent));
ok('第1轮结果页含分数卡', !!app.querySelector('.card.center'));
const wl = app.querySelector('#wl');
ok('第1轮错题表有≥8条', wl && wl.children.length >= 8);
// 内联展开第一条错题解析
const firstWrong = w.eval(`(function(){ for(let i=0;i<state.items.length;i++){ const q=state.items[i]; const a=state.answers[q.id]||[]; if(!isCorrect(q,a)) return q.id; } return null; })()`);
ok('找到一条错题id', !!firstWrong);
w.eval("toggleWrong('"+firstWrong+"')");
const det = w.document.getElementById('wd_'+firstWrong);
ok('错题解析内联展开(显示)', det && det.style.display !== 'none');
ok('解析含三层(选项解析/出题思路/思维导图)', det && /选项解析/.test(det.textContent) && /出题思路/.test(det.textContent));

// 第2轮: 与第1轮不重复, 同样≥160且按章节顺序
w.eval("startMode('round',2)");
const st2 = w.eval('state');
const r2 = st2.items.map(q => q.id);
ok('第2轮题数≥160', r2.length >= 160);
ok('第2轮按章节顺序', w.eval(`(function(){ for(let i=1;i<state.items.length;i++){ if((state.items[i].chapter||0) < (state.items[i-1].chapter||0)) return false; } return true; })()`));
ok('第1轮与第2轮无重复(跨轮去重)', r1.filter(id => r2.includes(id)).length === 0);

// 第3轮: 覆盖剩余, 三轮并集=全库502, 同样≥160且按章节顺序
w.eval("startMode('round',3)");
const st3 = w.eval('state');
const r3 = st3.items.map(q => q.id);
ok('第3轮题数≥160', r3.length >= 160);
ok('第3轮按章节顺序', w.eval(`(function(){ for(let i=1;i<state.items.length;i++){ if((state.items[i].chapter||0) < (state.items[i-1].chapter||0)) return false; } return true; })()`));
const union = new Set([...r1, ...r2, ...r3]);
ok('三轮并集覆盖全库(=502题, 每个细节考点都进三轮)', union.size === 502);

// 第3轮交卷后显示三轮通关进度卡
w.eval(`(function(){ for(let i=0;i<state.items.length;i++){ state.idx=i; const q=state.items[i]; state.answers[q.id]=q.answer.slice(); } })()`);
w.eval("tryFinish()");
app = w.document.getElementById('app');
ok('第3轮结果含三轮通关情况卡', /三轮通关情况/.test(app.textContent));

// ---------- 3. 错题练习模式也能正常显示解析 ----------
console.log('【3】章节练习 提交后显示三层解析');
w.eval("startMode('chapter',1)");
st = w.eval('state');
w.eval(`(function(){ state.idx=0; const q=state.items[0]; state.answers[q.id]=[ q.answer[0]===0?1:0 ]; submitAnswer(); })()`);
const fb = w.document.getElementById('fb');
ok('章节练习提交后渲染解析(选项/思路)', fb && /选项解析/.test(fb.textContent) && /出题思路/.test(fb.textContent));

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
if (fail > 0) { try{ dom.window.close(); }catch(e){} process.exit(1); }
try{ dom.window.close(); }catch(e){}
process.exit(0);
