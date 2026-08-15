const fs = require("fs");
const vm = require("vm");
const html = fs.readFileSync("index.html", "utf8");
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeStub() {
  const f = function () { return makeStub(); };
  return new Proxy(f, {
    get(t, prop) {
      if (prop === "innerHTML" || prop === "textContent" || prop === "value") return "";
      if (prop === "offsetTop") return 0;
      if (prop === "length") return 0;
      if (prop === "firstChild") return makeStub();
      if (prop === Symbol.toPrimitive) return () => "";
      return makeStub();
    },
    set() { return true; },
    apply() { return makeStub(); }
  });
}

const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};

const sandbox = {
  document: {
    getElementById: () => makeStub(),
    createElement: () => makeStub(),
    createDocumentFragment: () => makeStub(),
    querySelector: () => makeStub(),
    querySelectorAll: () => { const a = []; a.forEach = () => {}; return a; },
    body: makeStub()
  },
  localStorage,
  window: { scrollTo: () => {} },
  alert: () => {},
  confirm: () => true,
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  fetch: undefined,
  console,
  Date, String, Math, Array, Object, JSON, parseInt, Number, isNaN, Symbol
};

const driver = `
;(function(){
  let __fail=0;
  function run(label, fn){ try{ fn(); console.log("OK  -", label); }catch(e){ __fail++; console.log("ERR -", label, "::", e.message); } }

  // 数据完整性: 每题 oa 长度必须等于选项数; mind 覆盖11章
  run("data: oa matches options", ()=>{
    let bad=0;
    DATA.questions.forEach(q=>{
      if(q.type==='case'){ (q.subs||[]).forEach(s=>{ if((s.oa||[]).length!==s.options.length) bad++; }); }
      else { if((q.oa||[]).length!==q.options.length) bad++; }
    });
    if(bad) throw new Error("oa mismatch count="+bad);
  });
  run("data: mind has 11 chapters", ()=>{ if(Object.keys(DATA.mind).length!==11) throw new Error("mind="+Object.keys(DATA.mind).length); });
  run("data: every chapter has review+detail+map", ()=>{
    for(let k=1;k<=11;k++){ const m=DATA.mind[k]; if(!m||!m.review||!m.detail||!m.map||!m.map.length) throw new Error("ch"+k); }
  });

  run("renderHome", ()=>renderHome());
  run("renderChapters", ()=>renderChapters());
  run("startMode chapter", ()=>startMode("chapter", 1));
  run("submitAnswer (correct, 3-layer)", ()=>{ const q=state.items[state.idx]; state.answers[q.id]=q.answer.slice(); submitAnswer(); });
  run("submitAnswer (case sub)", ()=>{ startMode("chapter", 5); const q=state.items.find(x=>x.caseBg); if(q){ state.answers[q.id]=q.answer.slice(); submitAnswer(); } });
  run("nextQ", ()=>nextQ());
  run("startMode random", ()=>startMode("random"));
  run("startMode wrong (empty->alert)", ()=>startMode("wrong"));
  run("startMode mock", ()=>startMode("mock"));
  run("buildMock size=100", ()=>{ const m=buildMock(); if(m.length!==100) throw new Error("mock size="+m.length); });

  // 三轮复习
  run("round: buildRound(1) size", ()=>{
    resetRoundsPicked(); resetRoundResults();
    const r1=buildRound(1);
    if(r1.length < 11) throw new Error("round1 too small="+r1.length);
  });
  run("round: buildRound(2) no overlap with round1", ()=>{
    const r1=buildRound(1);
    const r2=buildRound(2);
    const s1=new Set(r1.map(x=>x.id));
    let overlap=0; r2.forEach(x=>{ if(s1.has(x.id)) overlap++; });
    if(overlap) throw new Error("overlap="+overlap);
  });
  run("round: buildRound(3) no overlap with 1+2", ()=>{
    const r3=buildRound(3);
    const all=getRoundsPicked();
    if(all.length < 33) throw new Error("picked too few="+all.length);
    if(r3.length < 11) throw new Error("round3 too small="+r3.length);
  });
  run("round: startMode('round',2) renders exam UI", ()=>{
    resetRoundsPicked(); resetRoundResults();
    setUser('alice');
    startMode('round', 2);
    if(state.mode!=='round' || state.round!==2) throw new Error('state='+JSON.stringify({mode:state.mode,round:state.round}));
  });
  run("round: renderRoundPicker", ()=>renderRoundPicker());
  run("round: setRoundResult + getRoundResults (学习: done/correct/acc)", ()=>{
    setRoundResult(1, 80, 75, 94);
    setRoundResult(2, 70, 60, 86);
    const rr=getRoundResults();
    if(!rr.r1||rr.r1.done!==80||rr.r1.acc!==94) throw new Error("r1="+JSON.stringify(rr.r1));
    if(!rr.r2||rr.r2.done!==70||rr.r2.acc!==86) throw new Error("r2="+JSON.stringify(rr.r2));
  });
  run("round: finishRound records acc (stub DOM, no crash)", ()=>{
    setUser('alice'); resetRoundsPicked(); resetRoundResults();
    startMode('round',1);
    const q=state.items[0]; state.answers[q.id]=q.answer.slice(); state.submitted[q.id]=1;
    finishRound();
    const rr=getRoundResults();
    if(!rr.r1 || typeof rr.r1.acc!=='number') throw new Error("r1="+JSON.stringify(rr.r1));
  });
  run("flatItems>=490", ()=>{ if(flatItems().length<490) throw new Error("items="+flatItems().length); });
  run("isCorrect", ()=>{ if(isCorrect({answer:[0,1]},{0:0,1:1,length:2,slice:()=>[0,1]})===false) throw new Error("should true"); });
  run("renderMind(ch1)", ()=>{ const h=renderMind(DATA.mind[1].map,0); if(!h.includes("企业战略")){ console.log("   >> h.slice:", h.slice(0,160)); throw new Error("no content, len="+h.length); } });
  run("renderKnowledge", ()=>renderKnowledge());
  run("renderChapterKnowledge(1)", ()=>renderChapterKnowledge(1));
  run("renderChapterKnowledge(6 new chapter)", ()=>renderChapterKnowledge(6));

  // 用户身份(分享不串数据)
  run("user: setUser + curUser", ()=>{ setUser('alice'); if(curUser()!=='alice') throw new Error('cur='+curUser()); });
  run("user: namespacing isolates two users", ()=>{
    setUser('alice'); addUnique(STORE.wrong,'q1');
    setUser('bob'); if(load(STORE.wrong).length!==0) throw new Error('bob sees alice data');
    setUser('alice'); if(load(STORE.wrong).length!==1) throw new Error('alice lost data, len='+load(STORE.wrong).length);
  });
  run("user: listUsers records names", ()=>{ if(!listUsers().includes('alice')||!listUsers().includes('bob')) throw new Error('list='+listUsers()); });
  run("user: renderUserGate renders", ()=>renderUserGate());
  run("user: enterUser sets user + renders home", ()=>{ clearUser(); enterUser('carol'); if(curUser()!=='carol') throw new Error('cur='+curUser()); });
  run("user: switchUser clears current user", ()=>{ switchUser(); if(curUser()!=='') throw new Error('not cleared: '+curUser()); });

  // 进度与云同步
  run("sync: getProgress shape", ()=>{
    const p=getProgress();
    ['wrong','done','correct','fav','last','ts','v'].forEach(k=>{ if(!(k in p)) throw new Error('missing '+k); });
  });
  run("sync: recordPos + getLastPos", ()=>{
    setUser('alice'); startMode('chapter', 1);
    const p=getLastPos();
    if(!p || p.mode!=='chapter' || p.chapter!==1) throw new Error('lastpos='+JSON.stringify(p));
  });
  run("sync: resumeLast no crash", ()=>resumeLast());
  run("sync: renderSettings", ()=>renderSettings());
  run("sync: boot without user shows gate", ()=>{ clearUser(); boot(); });
  run("sync: boot with user + no token renders home", ()=>{ setUser('alice'); boot(); });
  run("sync: pushCloud guarded (no token)", ()=>{ const _t=sync.token; sync.token=''; pushCloud(); sync.token=_t; });

  if(__fail>0) throw new Error("SMOKE FAILURES="+__fail);
})();
`;
try {
  vm.runInNewContext(code + driver, sandbox, { filename: "app.js" });
  console.log("SMOKE TEST DONE");
  process.exit(0);
} catch (e) {
  console.log("SMOKE TEST FAILED:", e.message);
  process.exit(1);
}
