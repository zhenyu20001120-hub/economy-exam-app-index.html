/* jsdom 集成测试: 真实加载 index.html, 验证
   - 模拟考试交卷返回结果 + 错题解析
   - 三轮学习: 每轮≥160 + 按章节顺序 + 不计时 + 跨轮去重 + 三轮覆盖全库
   - 三轮学习: 每题提交即判对错 + 详细解析 + 本题对应知识点
   - 学完一轮正确率统计 + 三轮后引导去模拟考试
   - 章节练习提交后三层解析 + 知识点 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.com/', pretendToBeVisual: true });
const w = dom.window;
w.confirm = () => true;          // 自动确认
w.alert = () => {};
w.scrollTo = () => {};

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log('  ✅ '+name); } else { fail++; console.log('  ❌ '+name); } }

// ---------- 0. 首页展示「三轮学习」而非「三轮复习」 ----------
console.log('【0】首页文案: 三轮学习');
w.eval("renderHome()");
let app = w.document.getElementById('app');
ok('首页出现「三轮学习」入口', /三轮学习/.test(app.textContent));
ok('首页不再出现「三轮复习」', !/三轮复习/.test(app.textContent));

// ---------- 1. 模拟考试: 交卷必须返回分数 + 错题表 ----------
console.log('【1】模拟考试 交卷返回结果');
w.eval("setUser('tester')");
w.eval("startMode('mock')");
let st = w.eval('state');
ok('mock 题数=100', st.items.length === 100);
const expectedMax = w.eval(`(function(){ let s=0; for(let i=0;i<state.items.length;i++){ const q=state.items[i]; s+=scoreOf(q, q.answer); } return s; })()`);
w.eval(`(function(){ for(let i=0;i<state.items.length;i++){ state.idx=i; const q=state.items[i]; state.answers[q.id]=q.answer.slice(); } })()`);
w.eval("tryFinish()");
app = w.document.getElementById('app');
ok('结果页含「模拟考试结果」标题', /模拟考试结果/.test(app.textContent));
ok('结果页渲染出分数卡(.card.center)', !!app.querySelector('.card.center'));
const big = app.querySelector('.big');
ok('显示分数数字', big && /^\d+$/.test(big.textContent.trim()));
ok('全对得分=该套题可达满分('+expectedMax+')', big && big.textContent.trim() === String(expectedMax));
ok('全对时显示「全部正确」', /全部正确/.test(app.textContent));

// ---------- 2. 三轮学习: 每轮≥160 + 章节顺序 + 不计时 + 跨轮去重 + 三轮覆盖全库 ----------
console.log('【2】三轮学习 章节顺序/不计时/覆盖');
w.eval("resetRoundsPicked(); resetRoundResults(); renderRoundPicker();");
w.eval("startMode('round',1)");
st = w.eval('state');
const r1 = st.items.map(q => q.id);
ok('第1轮题数≥160 (用户要求每轮≥160)', r1.length >= 160);
ok('第1轮按章节顺序(chapter 单调不减)', w.eval(`(function(){ for(let i=1;i<state.items.length;i++){ if((state.items[i].chapter||0) < (state.items[i-1].chapter||0)) return false; } return true; })()`));
ok('第1轮不计时(state.untimed=true)', w.eval('state.untimed') === true);
ok('第1轮顶部条显示「不计时」', /不计时/.test(app.textContent) || /不计时/.test(w.document.getElementById('app').textContent));
ok('第1轮顶部条无倒计时框(#examTimerBox)', !w.document.getElementById('examTimerBox'));

// 逐题提交: 第1题故意答错, 验证立即判对错 + 解析 + 知识点
console.log('【2.1】三轮学习 逐题提交即反馈(对错/解析/知识点)');
w.eval(`(function(){ state.idx=0; const q=state.items[0]; state.answers[q.id]=[ q.answer[0]===0?1:0 ]; submitAnswer(); })()`);
let fb = w.document.getElementById('fb');
ok('提交后选项被标色(对/错)', !!w.document.querySelector('.opt.correct') || !!w.document.querySelector('.opt.wrong'));
ok('反馈含「本题对应知识点」', fb && /本题对应知识点/.test(fb.textContent));
ok('反馈含「本题考点 · 出题思路」', fb && /本题考点/.test(fb.textContent));
ok('反馈含「选项解析(逐项讲透)」', fb && /选项解析/.test(fb.textContent));
ok('提交后写入本机学习数据(STORE.done)', w.eval(`(function(){ const q=state.items[0]; return load(STORE.done).includes(q.id); })()`));
ok('提交后 state.submitted 标记已提交', w.eval(`(function(){ const q=state.items[0]; return !!(state.submitted&&state.submitted[q.id]); })()`));
ok('顶部进度「已学」自增为 1', w.eval('state.roundDone') === 1);

// 答对一题, 验证正确率统计
w.eval(`(function(){ state.idx=1; const q=state.items[1]; state.answers[q.id]=q.answer.slice(); submitAnswer(); })()`);
ok('提交2题后 roundDone=2', w.eval('state.roundDone') === 2);
ok('顶部正确率显示存在', !!w.document.getElementById('learnAcc'));

// 完成本轮 → 正确率统计 + 引导下一轮
console.log('【2.2】完成本轮: 正确率统计 + 引导');
w.eval("finishRound()");
app = w.document.getElementById('app');
ok('本轮完成页含「第 1 轮学习完成」', /第\s*1\s*轮学习完成/.test(app.textContent));
ok('完成页含「正确率」', /正确率/.test(app.textContent));
ok('完成页引导「进入第 2 轮」', /进入第\s*2\s*轮/.test(app.textContent));
const rr1 = w.eval("getRoundResults()['r1']");
ok('轮次结果已存(含 acc 正确率)', rr1 && typeof rr1.acc === 'number' && rr1.done >= 1);

// 第2轮: 与第1轮不重复, 同样≥160且按章节顺序
w.eval("startMode('round',2)");
const st2 = w.eval('state');
const r2 = st2.items.map(q => q.id);
ok('第2轮题数≥160', r2.length >= 160);
ok('第2轮按章节顺序', w.eval(`(function(){ for(let i=1;i<state.items.length;i++){ if((state.items[i].chapter||0) < (state.items[i-1].chapter||0)) return false; } return true; })()`));
ok('第1轮与第2轮无重复(跨轮去重)', r1.filter(id => r2.includes(id)).length === 0);

// 第3轮: 覆盖剩余, 三轮并集=全库502
w.eval("startMode('round',3)");
const st3 = w.eval('state');
const r3 = st3.items.map(q => q.id);
ok('第3轮题数≥160', r3.length >= 160);
ok('第3轮按章节顺序', w.eval(`(function(){ for(let i=1;i<state.items.length;i++){ if((state.items[i].chapter||0) < (state.items[i-1].chapter||0)) return false; } return true; })()`));
const union = new Set([...r1, ...r2, ...r3]);
ok('三轮并集覆盖全库(=502题, 每个细节考点都进三轮)', union.size === 502);

// 第3轮完成后引导去模拟考试(先提交1题, 否则0提交会被守卫拦截)
console.log('【2.3】三轮学完 引导去模拟考试');
w.eval(`(function(){ state.idx=0; const q=state.items[0]; state.answers[q.id]=q.answer.slice(); submitAnswer(); })()`);
w.eval("finishRound()");
app = w.document.getElementById('app');
ok('第3轮完成页引导「去模拟考试」', /去模拟考试/.test(app.textContent));

// ---------- 3. 章节练习提交后显示三层解析 + 知识点 ----------
console.log('【3】章节练习 提交后显示解析 + 知识点');
w.eval("startMode('chapter',1)");
st = w.eval('state');
w.eval(`(function(){ state.idx=0; const q=state.items[0]; state.answers[q.id]=[ q.answer[0]===0?1:0 ]; submitAnswer(); })()`);
fb = w.document.getElementById('fb');
ok('章节练习提交后渲染解析(选项/考点)', fb && /选项解析/.test(fb.textContent) && /本题考点/.test(fb.textContent));
ok('章节练习反馈含「本题对应知识点」', fb && /本题对应知识点/.test(fb.textContent));

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
if (fail > 0) { try{ dom.window.close(); }catch(e){} process.exit(1); }
try{ dom.window.close(); }catch(e){}
process.exit(0);
