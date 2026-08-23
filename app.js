(()=>{
'use strict';

const WAKE=120;
const FEED_TARGET=210;
const FEED_MIN=180;
const FEED_MAX=240;
const DAY_NAP_MAX=240;
const BED_MIN=18*60+30;
const BED_MAX=19*60;
const DREAM_MIN=21*60+30;
const DREAM_MAX=23*60;
const STORE='baby-day-simple-v3';

const $=s=>document.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
const toMin=t=>{ if(!t) return null; const [h,m]=t.split(':').map(Number); return h*60+m; };
const toTime=n=>{ n=((Math.round(n)%1440)+1440)%1440; return `${pad(Math.floor(n/60))}:${pad(n%60)}`; };
const fmt=n=>new Date(2000,0,1,Math.floor(n/60)%24,n%60).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const dur=n=>{ n=Math.max(0,Math.round(n)); const h=Math.floor(n/60),m=n%60; return h?`${h} hr${h===1?'':'s'}${m?` ${m} min`:''}`:`${m} min`; };
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const nowMin=()=>{ const d=new Date(); return d.getHours()*60+d.getMinutes(); };
const dayKey=()=>new Date().toLocaleDateString('en-CA');

const baseState=()=>({
  date:dayKey(),
  anchors:{wake:'07:00',feed:'07:15',bed:'18:30',dream:'22:15'},
  actual:{},
  lastChange:''
});

function load(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORE)||'{}');
    const base=baseState();
    if(saved.date!==dayKey()) return base;
    return {...base,...saved,anchors:{...base.anchors,...(saved.anchors||{})},actual:{...(saved.actual||{})}};
  }catch{return baseState();}
}
let state=load();
function save(){ state.date=dayKey(); localStorage.setItem(STORE,JSON.stringify(state)); }
const has=k=>Object.prototype.hasOwnProperty.call(state.actual,k)&&!!state.actual[k];
const actualMin=k=>has(k)?toMin(state.actual[k]):null;

function note(text){ state.lastChange=text; save(); }
function setActual(k,min,label){ state.actual[k]=toTime(min); note(`${label} logged at ${fmt(min)} — the rest of today was recalculated.`); }
function clearActual(k){ delete state.actual[k]; save(); }

function feedAroundNaps(prev,target,naps){
  let t=clamp(target,prev+FEED_MIN,prev+FEED_MAX);
  for(const nap of naps){
    if(t>nap.start&&t<nap.end){
      if(nap.end-prev<=FEED_MAX) t=nap.end;
      else if(nap.start-prev>=FEED_MIN) t=Math.max(prev+FEED_MIN,nap.start-10);
      else t=nap.end;
    }
  }
  return t;
}

function compute(){
  const a={wake:toMin(state.anchors.wake),feed:toMin(state.anchors.feed),bed:toMin(state.anchors.bed),dream:toMin(state.anchors.dream)};
  const wake=actualMin('wake')??a.wake;
  const feed1=actualMin('feed1')??Math.max(a.feed,wake+15);

  const nap1s=actualMin('nap1s')??wake+WAKE;
  const nap1e=actualMin('nap1e')??nap1s+90;
  const nap1={start:nap1s,end:Math.max(nap1s+10,nap1e)};
  const feed2=actualMin('feed2')??feedAroundNaps(feed1,feed1+FEED_TARGET,[nap1]);

  const nap2s=actualMin('nap2s')??nap1.end+WAKE;
  const nap2e=actualMin('nap2e')??nap2s+90;
  const nap2={start:nap2s,end:Math.max(nap2s+10,nap2e)};
  const feed3=actualMin('feed3')??feedAroundNaps(feed2,feed2+FEED_TARGET,[nap2]);

  const firstTwo=(nap1.end-nap1.start)+(nap2.end-nap2.start);
  const room=Math.max(0,DAY_NAP_MAX-firstTwo);
  let nap3Length=Math.min(firstTwo>=150?30:45,room||15);
  const nap3s=actualMin('nap3s')??nap2.end+WAKE;
  if(!has('nap3e')) nap3Length=Math.max(10,Math.min(nap3Length,BED_MAX-WAKE-nap3s));
  const nap3e=actualMin('nap3e')??nap3s+nap3Length;
  const nap3={start:nap3s,end:Math.max(nap3s+5,nap3e)};

  const feed4=actualMin('feed4')??feedAroundNaps(feed3,feed3+FEED_TARGET,[nap3]);
  const bed=actualMin('bed')??clamp(Math.max(a.bed,nap3.end+WAKE),BED_MIN,BED_MAX);
  const dream=actualMin('dream')??clamp(a.dream,DREAM_MIN,DREAM_MAX);

  const feeds=[feed1,feed2,feed3,feed4];
  const gaps=feeds.slice(1).map((f,i)=>f-feeds[i]);
  const wakeWindows=[nap1.start-wake,nap2.start-nap1.end,nap3.start-nap2.end,bed-nap3.end];
  const totalNap=(nap1.end-nap1.start)+(nap2.end-nap2.start)+(nap3.end-nap3.start);
  return {wake,feed1,feed2,feed3,feed4,nap1,nap2,nap3,bed,dream,feeds,gaps,wakeWindows,totalNap};
}

const defs=[
  {id:'wake',kind:'wake',icon:'☀️',title:'Wake for the day',single:'wake',desc:()=> 'Start of the day'},
  {id:'feed1',kind:'feed',icon:'🍼',title:'Feed 1',single:'feed1',desc:()=> 'First feed — ideally around 7:15 AM'},
  {id:'nap1',kind:'nap',icon:'😴',title:'Nap 1',start:'nap1s',end:'nap1e',obj:'nap1',desc:c=>`about ${dur(c.nap1.start-c.wake)} after waking`},
  {id:'feed2',kind:'feed',icon:'🍼',title:'Feed 2',single:'feed2',desc:c=>`${dur(c.feed2-c.feed1)} after Feed 1`},
  {id:'nap2',kind:'nap',icon:'😴',title:'Nap 2',start:'nap2s',end:'nap2e',obj:'nap2',desc:c=>`about ${dur(c.nap2.start-c.nap1.end)} after Nap 1`},
  {id:'feed3',kind:'feed',icon:'🍼',title:'Feed 3',single:'feed3',desc:c=>`${dur(c.feed3-c.feed2)} after Feed 2`},
  {id:'nap3',kind:'nap',icon:'😴',title:'Nap 3',start:'nap3s',end:'nap3e',obj:'nap3',desc:c=>`short nap · ${dur(c.nap3.end-c.nap3.start)}`},
  {id:'feed4',kind:'feed',icon:'🍼',title:'Feed 4',single:'feed4',desc:c=>`${dur(c.feed4-c.feed3)} after Feed 3`},
  {id:'bed',kind:'sleep',icon:'🌙',title:'Bedtime',single:'bed',desc:()=> 'goal: 6:30–7:00 PM'},
  {id:'dream',kind:'feed',icon:'✨',title:'Dream feed',single:'dream',desc:()=> 'goal: 9:30–11:00 PM'}
];

function eventTime(d,c){ return d.single?c[d.single]:c[d.obj].start; }
function isActual(d){ return d.single?has(d.single):(has(d.start)||has(d.end)); }
function hasAnyActual(){ return Object.keys(state.actual).length>0; }

function chronology(c){
  return [
    {key:'wake',label:'Wake for the day',icon:'☀️',time:c.wake,action:'Woke now'},
    {key:'feed1',label:'Feed 1',icon:'🍼',time:c.feed1,action:'Fed now'},
    {key:'nap1s',label:'Nap 1 starts',icon:'😴',time:c.nap1.start,action:'Start nap now'},
    {key:'nap1e',label:'Wake from Nap 1',icon:'☀️',time:c.nap1.end,action:'Baby woke now'},
    {key:'feed2',label:'Feed 2',icon:'🍼',time:c.feed2,action:'Fed now'},
    {key:'nap2s',label:'Nap 2 starts',icon:'😴',time:c.nap2.start,action:'Start nap now'},
    {key:'nap2e',label:'Wake from Nap 2',icon:'☀️',time:c.nap2.end,action:'Baby woke now'},
    {key:'feed3',label:'Feed 3',icon:'🍼',time:c.feed3,action:'Fed now'},
    {key:'nap3s',label:'Nap 3 starts',icon:'😴',time:c.nap3.start,action:'Start nap now'},
    {key:'nap3e',label:'Wake from Nap 3',icon:'☀️',time:c.nap3.end,action:'Baby woke now'},
    {key:'feed4',label:'Feed 4',icon:'🍼',time:c.feed4,action:'Fed now'},
    {key:'bed',label:'Bedtime',icon:'🌙',time:c.bed,action:'Bedtime now'},
    {key:'dream',label:'Dream feed',icon:'✨',time:c.dream,action:'Dream feed now'}
  ].sort((a,b)=>a.time-b.time);
}

function activeNap(){
  for(let i=1;i<=3;i++) if(has(`nap${i}s`)&&!has(`nap${i}e`)) return i;
  return null;
}
function nextFeedKey(c=compute()){
  const now=nowMin();
  const times={feed1:c.feed1,feed2:c.feed2,feed3:c.feed3,feed4:c.feed4,dream:c.dream};
  const open=['feed1','feed2','feed3','feed4','dream'].filter(k=>!has(k));
  if(!open.length) return null;
  return open.sort((a,b)=>Math.abs(times[a]-now)-Math.abs(times[b]-now))[0];
}
function nextNapStartKey(c=compute()){
  const now=nowMin();
  const times={nap1s:c.nap1.start,nap2s:c.nap2.start,nap3s:c.nap3.start};
  const open=['nap1s','nap2s','nap3s'].filter(k=>!has(k));
  if(!open.length || now>c.nap3.start+90) return null;
  return open.sort((a,b)=>Math.abs(times[a]-now)-Math.abs(times[b]-now))[0];
}

function nextEvent(c){
  const active=activeNap();
  if(active){
    const e=chronology(c).find(x=>x.key===`nap${active}e`);
    if(e) return e;
  }
  const now=nowMin();
  const items=chronology(c).filter(e=>!has(e.key));
  return items.find(e=>e.time>=now-8)||items.find(e=>e.time>=now-45)||items[items.length-1]||null;
}

function renderHero(c){
  const n=nextEvent(c);
  if(!n){
    $('#nextLabel').textContent='ALL DONE';
    $('#nextTitle').textContent='Day complete';
    $('#nextTime').textContent='✓';
    $('#nextIcon').textContent='♡';
    $('#nextMeta').textContent='You’ve logged everything for today.';
    $('#heroAction').classList.add('hidden');
    return;
  }
  $('#heroAction').classList.remove('hidden');
  $('#nextLabel').textContent=activeNap()?'CURRENTLY':'NEXT UP';
  $('#nextTitle').textContent=activeNap()?`Nap ${activeNap()} · sleeping`:n.label;
  $('#nextTime').textContent=fmt(n.time);
  $('#nextIcon').textContent=n.icon;
  const delta=n.time-nowMin();
  $('#nextMeta').textContent=activeNap()
    ? `Planned wake around ${fmt(n.time)}. Tap below when baby actually wakes.`
    : delta>1?`In about ${dur(delta)}. If it happens earlier or later, just log it.`:delta>=-8?'Right about now.':'This is the next unlogged item in today’s plan.';
  $('#heroAction').textContent=activeNap()?'Baby woke now':n.action;
  $('#heroAction').dataset.key=activeNap()?`nap${activeNap()}e`:n.key;
  $('#heroAction').dataset.label=activeNap()?`Wake from Nap ${activeNap()}`:n.label;
}

function quickLog(key,label){
  if(!key) return;
  setActual(key,nowMin(),label);
  render();
}

function renderQuick(c){
  const f=nextFeedKey(c);
  $('#feedNowBtn').disabled=!f;
  $('#feedNowSub').textContent=f?(f==='dream'?'Dream feed':`Feed ${f.replace('feed','')}`):'All feeds logged';

  const active=activeNap();
  const nextNap=nextNapStartKey(c);
  if(active){
    $('#sleepNowBtn').disabled=true;
    $('#sleepNowLabel').textContent='Baby is sleeping';
    $('#sleepNowSub').textContent=`Nap ${active} in progress`;
    $('#wakeNowBtn').disabled=false;
    $('#wakeNowLabel').textContent='Baby woke';
    $('#wakeNowSub').textContent=`End Nap ${active} now`;
  }else{
    $('#sleepNowBtn').disabled=!nextNap && has('bed');
    if(nextNap){
      $('#sleepNowLabel').textContent='Nap started';
      $('#sleepNowSub').textContent=`Start Nap ${nextNap.match(/\d/)[0]} now`;
    }else{
      $('#sleepNowLabel').textContent=has('bed')?'Bedtime logged':'Bedtime now';
      $('#sleepNowSub').textContent=has('bed')?'Done':'Put down for night';
    }
    const morningWindow=nowMin()<=c.wake+180;
    $('#wakeNowBtn').disabled=has('wake')||!morningWindow;
    $('#wakeNowLabel').textContent=(!has('wake')&&morningWindow)?'Woke up':'Not napping';
    $('#wakeNowSub').textContent=(!has('wake')&&morningWindow)?'Start the day now':'Use after a nap';
  }

  if(state.lastChange){ $('#updateNote').textContent='✓ '+state.lastChange; $('#updateNote').classList.remove('hidden'); }
  else $('#updateNote').classList.add('hidden');
}

function rowStatus(d){
  if(isActual(d)) return ['ACTUAL','actual'];
  if(hasAnyActual()) return ['UPDATED','updated'];
  return ['PLAN',''];
}
function rowTime(d,c){
  if(d.single) return fmt(c[d.single]);
  const n=c[d.obj]; return `${fmt(n.start)}–${fmt(n.end)}`;
}
function renderTimeline(c){
  const rows=defs.slice().sort((a,b)=>eventTime(a,c)-eventTime(b,c));
  $('#timeline').innerHTML=rows.map(d=>{
    const [status,cls]=rowStatus(d);
    return `<button class="row ${d.kind}" data-edit="${d.id}">
      <span class="rowTime">${rowTime(d,c)}</span>
      <span class="rowIcon">${d.icon}</span>
      <span class="rowText"><b>${d.title}</b><span>${d.desc(c)}</span></span>
      <span class="status ${cls}">${status}</span>
    </button>`;
  }).join('');
}

function renderCheck(c){
  const warnings=[];
  c.gaps.forEach((g,i)=>{ if(g<FEED_MIN||g>FEED_MAX) warnings.push(`Feed ${i+2} is ${dur(g)} after the previous feed.`); });
  c.wakeWindows.forEach((w,i)=>{ if(Math.abs(w-WAKE)>25) warnings.push(`${i===3?'Final wake window':`Wake window ${i+1}`} is ${dur(w)}.`); });
  if(c.totalNap>DAY_NAP_MAX) warnings.push(`Daytime sleep totals ${dur(c.totalNap)}, over the 4-hour target.`);
  if(c.bed<BED_MIN||c.bed>BED_MAX) warnings.push(`Bedtime is outside the 6:30–7:00 PM target.`);
  if(c.dream<DREAM_MIN||c.dream>DREAM_MAX) warnings.push(`Dream feed is outside the 9:30–11:00 PM window.`);
  if(!warnings.length){
    $('#scheduleCheck').innerHTML=`<div class="checkMsg">✓ On track · ${dur(c.totalNap)} of daytime sleep planned.</div>`;
  }else{
    $('#scheduleCheck').innerHTML=`<div class="checkMsg warn"><b>Worth a look:</b> ${warnings.slice(0,2).join(' ')}</div>`;
  }
}

function render(){
  const c=compute();
  $('#dateText').textContent=new Date().toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});
  $('#anchorWake').value=state.anchors.wake;
  $('#anchorFeed').value=state.anchors.feed;
  $('#anchorBed').value=state.anchors.bed;
  $('#anchorDream').value=state.anchors.dream;
  renderHero(c); renderQuick(c); renderTimeline(c); renderCheck(c);
}

let editing=null;
function fieldHtml(key,label,value){
  return `<div class="editField">
    <label>${label}<input type="time" data-edit-time="${key}" value="${toTime(value)}"></label>
    <label class="actualToggle"><input type="checkbox" data-edit-actual="${key}" ${has(key)?'checked':''}> Actual</label>
  </div>`;
}
function openEdit(id){
  const c=compute();
  const d=defs.find(x=>x.id===id);
  if(!d) return;
  editing=d;
  $('#editTitle').textContent=d.title;
  if(d.single) $('#editFields').innerHTML=fieldHtml(d.single,'Time',c[d.single]);
  else{
    const n=c[d.obj];
    $('#editFields').innerHTML=fieldHtml(d.start,'Start',n.start)+fieldHtml(d.end,'Wake',n.end);
  }
  $('#editDialog').showModal();
}
function saveEdit(){
  if(!editing) return;
  document.querySelectorAll('[data-edit-time]').forEach(input=>{
    const key=input.dataset.editTime;
    const checked=document.querySelector(`[data-edit-actual="${key}"]`).checked;
    if(checked) state.actual[key]=input.value;
    else delete state.actual[key];
  });
  state.lastChange=`${editing.title} was adjusted — future times were recalculated.`;
  save(); editing=null; render();
}
function clearEdit(){
  if(!editing) return;
  if(editing.single) delete state.actual[editing.single];
  else { delete state.actual[editing.start]; delete state.actual[editing.end]; }
  state.lastChange=`${editing.title} is back on the automatic plan.`;
  save(); $('#editDialog').close(); editing=null; render();
}

$('#feedNowBtn').addEventListener('click',()=>{ const k=nextFeedKey(compute()); quickLog(k,k==='dream'?'Dream feed':`Feed ${k?.replace('feed','')}`); });
$('#sleepNowBtn').addEventListener('click',()=>{
  const k=nextNapStartKey(compute());
  if(k) quickLog(k,`Nap ${k.match(/\d/)[0]} started`);
  else if(!has('bed')) quickLog('bed','Bedtime');
});
$('#wakeNowBtn').addEventListener('click',()=>{
  const a=activeNap();
  if(a) quickLog(`nap${a}e`,`Wake from Nap ${a}`);
  else if(!has('wake')) quickLog('wake','Morning wake');
});
$('#heroAction').addEventListener('click',e=>quickLog(e.currentTarget.dataset.key,e.currentTarget.dataset.label));
$('#timeline').addEventListener('click',e=>{ const row=e.target.closest('[data-edit]'); if(row) openEdit(row.dataset.edit); });
$('#editForm').addEventListener('submit',e=>{ e.preventDefault(); saveEdit(); $('#editDialog').close(); });
$('#clearEditBtn').addEventListener('click',clearEdit);

[['anchorWake','wake'],['anchorFeed','feed'],['anchorBed','bed'],['anchorDream','dream']].forEach(([id,key])=>{
  $('#'+id).addEventListener('change',e=>{ state.anchors[key]=e.target.value; state.lastChange='Schedule settings changed — today was recalculated.'; save(); render(); });
});

$('#resetBtn').addEventListener('click',()=>$('#resetDialog').showModal());
$('#cancelReset').addEventListener('click',()=>$('#resetDialog').close());
$('#confirmReset').addEventListener('click',()=>{ state=baseState(); save(); $('#resetDialog').close(); render(); });

render();
setInterval(()=>{ if(state.date!==dayKey()){ state=baseState(); save(); } render(); },60000);
})();
