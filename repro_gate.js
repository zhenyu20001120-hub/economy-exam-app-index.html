const { JSDOM } = require('jsdom');
const https = require('https');
function get(url){return new Promise((res,rej)=>{https.get(url,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});}
(async()=>{
  const appJs=await get('https://zhenyu20001120-hub.github.io/economy-exam-app-index.html/app.js');
  const bank=await get('https://zhenyu20001120-hub.github.io/economy-exam-app-index.html/bank.json');
  const lec=await get('https://zhenyu20001120-hub.github.io/economy-exam-app-index.html/lecture.json');
  const cha=await get('https://zhenyu20001120-hub.github.io/economy-exam-app-index.html/chapters.json');
  const chg=await get('https://zhenyu20001120-hub.github.io/economy-exam-app-index.html/changes.json');
  console.log('fetched app.js',appJs.length,'bank',bank.length);
  const dom=new JSDOM(`<!doctype html><html><body><div id="app"></div><nav id="tabbar" hidden><button data-nav="home">h</button></nav></body></html>`,{runScripts:'outside-only',url:'https://zhenyu20001120-hub.github.io/economy-exam-app-index.html/',pretendToBeVisual:true});
  const w=dom.window;
  w.fetch=(u)=>{const s=String(u);let b='[]';if(s.endsWith('bank.json'))b=bank;else if(s.endsWith('lecture.json'))b=lec;else if(s.endsWith('chapters.json'))b=cha;else if(s.endsWith('changes.json'))b=chg;return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve(JSON.parse(b))});};
  w.addEventListener('error',e=>console.log('[WIN ERR]',e.message,e.error&&e.error.stack));
  try{w.eval(appJs);}catch(e){console.log('[EVAL THROW]',e.stack);process.exit(1);}
  await new Promise(r=>setTimeout(r,800));
  console.log('after boot: curUser=',w.localStorage.getItem('zjjjs_user'),'tabbarHidden=',w.document.getElementById('tabbar').hidden);
  console.log('app preview:',w.document.getElementById('app').innerHTML.slice(0,80));
  const inp=w.document.getElementById('userName');
  if(!inp){console.log('NOT on gate');process.exit(1);}
  inp.value='zxy';
  const btn=w.document.getElementById('enterBtn');
  console.log('click enterBtn (onclick=',typeof btn.onclick,')');
  try{btn.onclick();}catch(e){console.log('[CLICK THROW]',e.message);console.log(e.stack);}
  await new Promise(r=>setTimeout(r,400));
  console.log('after click: curUser=',w.localStorage.getItem('zjjjs_user'),'tabbarHidden=',w.document.getElementById('tabbar').hidden);
  console.log('app preview:',w.document.getElementById('app').innerHTML.slice(0,160));
})();
