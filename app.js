(()=>{
'use strict';

// "Mom Science": every planned time is a moving window, not an alarm.
// Wake windows: 1h30–2h, with a default sweet spot around 1h45 that can
// gradually personalize from Stella's actual nap-start history.
const WAKE_MIN=90, WAKE_DEFAULT=105, WAKE_MAX=120;
const FEED_TARGET=210, FEED_MIN=180, FEED_MAX=240, DAY_NAP_MAX=240;
const BED_MIN=18*60+30, BED_MAX=19*60, DREAM_MIN=21*60+30, DREAM_MAX=23*60;
const STORE='stella-baby-history-v3', LEGACY='baby-day-live-v2';
const DEFAULTS={wake:'07:00',feed:'07:15',bed:'18:30',dream:'22:15'};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const pad=n=>String(n).padStart(2,'0');
const toMin=t=>{if(!t)return null;const [h,m]=t.split(':').map(Number);return h*60+m};
const toTime=n=>{if(n==null||Number.isNaN(n))return '';n=((Math.round(n)%1440)+1440)%1440;return `${pad(Math.floor(n/60))}:${pad(n%60)}`};
const fmt=n=>n==null?'—':new Date(2000,0,1,Math.floor(n/60)%24,n%60).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const dur=n=>{if(n==null||Number.isNaN(n))return '—';n=Math.max(0,Math.round(n));const h=Math.floor(n/60),m=n%60;return h?`${h}h${m?` ${m}m`:''}`:`${m}m`};
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const round5=n=>Math.round(n/5)*5;
const nowMin=()=>{const d=new Date();return d.getHours()*60+d.getMinutes()};
const dayKey=(d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const dayDate=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)};
const dateLabel=k=>dayDate(k).toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});
const shortDate=k=>dayDate(k).toLocaleDateString([],{month:'short',day:'numeric'});
const has=(day,k)=>Object.prototype.hasOwnProperty.call(day.actual||{},k)&&!!day.actual[k];
const actualMin=(day,k)=>has(day,k)?toMin(day.actual[k]):null;

function baseStore(){return {version:5,defaults:{...DEFAULTS},days:{},lastTab:'today',statsRange:7}}
function newDay(anchors){return {anchors:{...(anchors||DEFAULTS)},actual:{},resettles:[],lastChange:'',updatedAt:new Date().toISOString()}}
function load(){
  let loaded;
  try{loaded=JSON.parse(localStorage.getItem(STORE)||'null')}catch{}
  let out;
  if(loaded&&loaded.days){out={...baseStore(),...loaded,version:5}}
  else{
    out=baseStore();
    try{
      const old=JSON.parse(localStorage.getItem(LEGACY)||'null');
      if(old&&old.date){
        out.defaults={...DEFAULTS,...(old.anchors||{})};
        out.days[old.date]={anchors:{...out.defaults},actual:{...(old.actual||{})},resettles:[],lastChange:old.lastChange||'',updatedAt:new Date().toISOString()};
      }
    }catch{}
  }
  out.defaults={...DEFAULTS,...(out.defaults||{})};
  out.days=out.days||{};
  Object.keys(out.days).forEach(k=>{const d=out.days[k]||{};d.anchors={...DEFAULTS,...(d.anchors||{})};d.actual=d.actual||{};d.resettles=Array.isArray(d.resettles)?d.resettles:[];d.lastChange=d.lastChange||'';out.days[k]=d});
  return out;
}
let data=load();
function ensureToday(){const k=dayKey();if(!data.days[k])data.days[k]=newDay(data.defaults);const d=data.days[k];d.anchors={...DEFAULTS,...(d.anchors||{})};d.actual=d.actual||{};d.resettles=Array.isArray(d.resettles)?d.resettles:[];return d}
function save(){localStorage.setItem(STORE,JSON.stringify(data))}
function today(){return ensureToday()}
function touch(day){day.updatedAt=new Date().toISOString();save()}
ensureToday();save();

function actualNapWakeWindows(day){
  const vals=[];
  if(has(day,'wake')&&has(day,'nap1s'))vals.push(actualMin(day,'nap1s')-actualMin(day,'wake'));
  if(has(day,'nap1e')&&has(day,'nap2s'))vals.push(actualMin(day,'nap2s')-actualMin(day,'nap1e'));
  if(has(day,'nap2e')&&has(day,'nap3s'))vals.push(actualMin(day,'nap3s')-actualMin(day,'nap2e'));
  return vals.filter(v=>v>=75&&v<=135);
}
function learnedWakeTarget(){
  const end=dayDate(dayKey()),start=new Date(end);start.setDate(start.getDate()-13);
  const vals=[];
  Object.entries(data.days||{}).forEach(([k,d])=>{const date=dayDate(k);if(date>=start&&date<=end)vals.push(...actualNapWakeWindows(d))});
  if(vals.length<4)return WAKE_DEFAULT;
  return clamp(round5(vals.reduce((a,b)=>a+b,0)/vals.length),WAKE_MIN,WAKE_MAX);
}
function wakeWindow(from,target=learnedWakeTarget()){return {early:from+WAKE_MIN,target:from+target,late:from+WAKE_MAX}}
function feedWindow(from){return {early:from+FEED_MIN,target:from+FEED_TARGET,late:from+FEED_MAX}}
function rangeText(r){return `${fmt(r.early)}–${fmt(r.late)}`}

function feedAroundNaps(prev,target,naps){
  let t=clamp(target,prev+FEED_MIN,prev+FEED_MAX),note='';
  for(const nap of naps){
    if(t>nap.start&&t<nap.end){
      if(nap.end-prev<=FEED_MAX){t=nap.end;note=`after ${nap.name}`}
      else if(nap.start-prev>=FEED_MIN){t=Math.max(prev+FEED_MIN,nap.start-10);note=`before ${nap.name}`}
      else {t=nap.end;note=`overlaps ${nap.name}`}
    }
  }
  return {time:t,note};
}

function compute(day){
  const a={wake:toMin(day.anchors.wake),feed:toMin(day.anchors.feed),bed:toMin(day.anchors.bed),dream:toMin(day.anchors.dream)};
  const wakeTarget=learnedWakeTarget();
  const wake=actualMin(day,'wake')??a.wake;
  const feed1=actualMin(day,'feed1')??Math.max(a.feed,wake+15);

  const nap1Window=wakeWindow(wake,wakeTarget);
  const nap1s=actualMin(day,'nap1s')??nap1Window.target;
  const nap1e=actualMin(day,'nap1e')??nap1s+90;
  const nap1={name:'Nap 1',start:nap1s,end:Math.max(nap1e,nap1s+10),window:nap1Window};

  const feed2Window=feedWindow(feed1);
  const f2auto=feedAroundNaps(feed1,feed2Window.target,[nap1]);
  const feed2=actualMin(day,'feed2')??f2auto.time;

  const nap2Window=wakeWindow(nap1.end,wakeTarget);
  const nap2s=actualMin(day,'nap2s')??nap2Window.target;
  const nap2e=actualMin(day,'nap2e')??nap2s+90;
  const nap2={name:'Nap 2',start:nap2s,end:Math.max(nap2e,nap2s+10),window:nap2Window};

  const feed3Window=feedWindow(feed2);
  const f3auto=feedAroundNaps(feed2,feed3Window.target,[nap2]);
  const feed3=actualMin(day,'feed3')??f3auto.time;

  const firstTwo=(nap1.end-nap1.start)+(nap2.end-nap2.start);
  const remaining=Math.max(0,DAY_NAP_MAX-firstTwo);
  let nap3Target=Math.min(firstTwo>=150?30:45,remaining);
  if(nap3Target<=0)nap3Target=15;
  const nap3Window=wakeWindow(nap2.end,wakeTarget);
  let nap3s=actualMin(day,'nap3s')??nap3Window.target;
  if(!has(day,'nap3s'))nap3s=Math.min(nap3s,BED_MAX-WAKE_MIN-10);
  if(!has(day,'nap3e')){const latestEnd=BED_MAX-WAKE_MIN;if(nap3s+nap3Target>latestEnd)nap3Target=Math.max(10,latestEnd-nap3s)}
  const nap3e=actualMin(day,'nap3e')??nap3s+nap3Target;
  const nap3={name:'Nap 3',start:nap3s,end:Math.max(nap3e,nap3s+5),window:nap3Window};

  const feed4Window=feedWindow(feed3);
  const f4auto=feedAroundNaps(feed3,feed4Window.target,[nap3]);
  const feed4=actualMin(day,'feed4')??f4auto.time;

  const finalWake=wakeWindow(nap3.end,wakeTarget);
  const bedEarly=Math.max(BED_MIN,finalWake.early),bedLate=Math.min(BED_MAX,finalWake.late);
  const bedWindow=bedEarly<=bedLate?{early:bedEarly,target:clamp(a.bed,bedEarly,bedLate),late:bedLate}:{early:BED_MIN,target:clamp(Math.max(a.bed,finalWake.target),BED_MIN,BED_MAX),late:BED_MAX};
  const bed=actualMin(day,'bed')??bedWindow.target;
  const dreamWindow={early:DREAM_MIN,target:clamp(a.dream,DREAM_MIN,DREAM_MAX),late:DREAM_MAX};
  const dream=actualMin(day,'dream')??dreamWindow.target;

  const feeds=[feed1,feed2,feed3,feed4];
  const gaps=feeds.slice(1).map((f,i)=>f-feeds[i]);
  const wakeWindows=[nap1.start-wake,nap2.start-nap1.end,nap3.start-nap2.end,bed-nap3.end];
  const totalNap=(nap1.end-nap1.start)+(nap2.end-nap2.start)+(nap3.end-nap3.start);
  return {
    wake,feed1,feed2,feed3,feed4,nap1,nap2,nap3,bed,dream,feeds,gaps,wakeWindows,totalNap,wakeTarget,
    windows:{feed2:feed2Window,feed3:feed3Window,feed4:feed4Window,bed:bedWindow,dream:dreamWindow},
    notes:{feed2:f2auto.note,feed3:f3auto.note,feed4:f4auto.note}
  };
}

const defs=[
  {id:'wake',kind:'wake',icon:'☀️',title:'Wake up',single:'wake'},
  {id:'feed1',kind:'feed',icon:'🍼',title:'Feed 1',single:'feed1'},
  {id:'nap1',kind:'nap',icon:'😴',title:'Nap 1',start:'nap1s',end:'nap1e',obj:'nap1'},
  {id:'feed2',kind:'feed',icon:'🍼',title:'Feed 2',single:'feed2'},
  {id:'nap2',kind:'nap',icon:'😴',title:'Nap 2',start:'nap2s',end:'nap2e',obj:'nap2'},
  {id:'feed3',kind:'feed',icon:'🍼',title:'Feed 3',single:'feed3'},
  {id:'nap3',kind:'nap',icon:'😴',title:'Nap 3',start:'nap3s',end:'nap3e',obj:'nap3'},
  {id:'feed4',kind:'feed',icon:'🍼',title:'Feed 4',single:'feed4'},
  {id:'bed',kind:'sleep',icon:'🌙',title:'Bedtime',single:'bed'},
  {id:'dream',kind:'sleep',icon:'✨',title:'Dream feed',single:'dream'}
];
function statusFor(day,d){
  if(d.single)return has(day,d.single)?'actual':'window';
  const s=has(day,d.start),e=has(day,d.end);if(s&&e)return'actual';if(s||e)return'partial';return'window';
}
function subtitle(d,c){
  if(d.id==='wake')return `Nap 1 window ${rangeText(c.nap1.window)} · sweet spot ~${fmt(c.nap1.window.target)}`;
  if(d.id==='feed1')return `Morning anchor · around ${fmt(c.feed1)}`;
  if(['feed2','feed3','feed4'].includes(d.id)){const w=c.windows[d.id];return `Window ${rangeText(w)} · sweet spot ~${fmt(c[d.id])}${c.notes[d.id]?` · ${c.notes[d.id]}`:''}`}
  if(d.id==='nap1')return `Start window ${rangeText(c.nap1.window)} · sweet spot ~${fmt(c.nap1.window.target)} · ~${dur(c.nap1.end-c.nap1.start)} nap`;
  if(d.id==='nap2')return `Start window ${rangeText(c.nap2.window)} · sweet spot ~${fmt(c.nap2.window.target)} · ~${dur(c.nap2.end-c.nap2.start)} nap`;
  if(d.id==='nap3')return `Start window ${rangeText(c.nap3.window)} · sweet spot ~${fmt(c.nap3.window.target)} · short nap ~${dur(c.nap3.end-c.nap3.start)}`;
  if(d.id==='bed')return `Window ${rangeText(c.windows.bed)} · final wake window 1h30–2h`;
  if(d.id==='dream')return `Window ${rangeText(c.windows.dream)} · whenever works in that range`;
  return '';
}
function whenText(d,c){if(d.single)return fmt(c[d.single]);const n=c[d.obj];return `${fmt(n.start)}–${fmt(n.end)}`}
function resettlesFor(day,nap){return (day.resettles||[]).filter(r=>Number(r.nap)===Number(nap)).sort((a,b)=>(a.time||'').localeCompare(b.time||''))}
function timeline(day,c){
  return defs.map(d=>{
    const st=statusFor(day,d),label=st==='actual'?'ACTUAL':st==='partial'?'PARTIAL':'WINDOW';
    let html=`<button class="row ${d.kind}" data-edit="${d.id}"><span class="rowTime">${whenText(d,c)}</span><span class="rowIcon">${d.icon}</span><span class="rowText"><b>${d.title}</b><span>${subtitle(d,c)}</span></span><span class="status ${st}">${label}</span></button>`;
    if(d.obj&&d.obj.startsWith('nap')){const n=Number(d.obj.replace('nap','')),rs=resettlesFor(day,n);if(rs.length)html+=`<div class="resettleStrip"><span>🫶</span><b>${rs.length} resettle${rs.length===1?'':'s'}</b><span>${rs.map(r=>fmt(toMin(r.time))).join(' · ')}</span></div>`}
    return html;
  }).join('');
}
function chronology(day,c){
  return [
    {key:'wake',label:'Wake up',icon:'☀️',time:c.wake},
    {key:'feed1',label:'Feed 1',icon:'🍼',time:c.feed1},
    {key:'nap1s',label:'Nap 1 starts',icon:'😴',time:c.nap1.start,window:c.nap1.window,cue:'sleepy'},
    {key:'nap1e',label:'Nap 1 ends',icon:'☀️',time:c.nap1.end},
    {key:'feed2',label:'Feed 2',icon:'🍼',time:c.feed2,window:c.windows.feed2,cue:'hungry'},
    {key:'nap2s',label:'Nap 2 starts',icon:'😴',time:c.nap2.start,window:c.nap2.window,cue:'sleepy'},
    {key:'nap2e',label:'Nap 2 ends',icon:'☀️',time:c.nap2.end},
    {key:'feed3',label:'Feed 3',icon:'🍼',time:c.feed3,window:c.windows.feed3,cue:'hungry'},
    {key:'nap3s',label:'Nap 3 starts',icon:'😴',time:c.nap3.start,window:c.nap3.window,cue:'sleepy'},
    {key:'nap3e',label:'Nap 3 ends',icon:'☀️',time:c.nap3.end},
    {key:'feed4',label:'Feed 4',icon:'🍼',time:c.feed4,window:c.windows.feed4,cue:'hungry'},
    {key:'bed',label:'Bedtime',icon:'🌙',time:c.bed,window:c.windows.bed,cue:'sleepy'},
    {key:'dream',label:'Dream feed',icon:'✨',time:c.dream,window:c.windows.dream,cue:'feed'}
  ].sort((a,b)=>a.time-b.time);
}
function tomorrowEvent(){
  const t=new Date();t.setDate(t.getDate()+1);const preview=newDay(data.defaults),c=compute(preview);
  return {tomorrow:true,key:null,label:'Wake up',icon:'☀️',time:c.wake,feedTime:c.feed1,date:dayKey(t)};
}
function nextEvent(day,c){
  const now=nowMin();
  if(has(day,'dream'))return tomorrowEvent();
  const running=[1,2,3].find(i=>has(day,`nap${i}s`)&&!has(day,`nap${i}e`));
  if(running)return {key:`nap${running}e`,label:`Nap ${running} ends`,icon:'☀️',time:c[`nap${running}`].end,runningNap:running};
  const pending=chronology(day,c).filter(e=>!has(day,e.key));
  if(!pending.length)return tomorrowEvent();
  if(has(day,'bed')){const dream=pending.find(e=>e.key==='dream');return dream||tomorrowEvent()}
  const viable=pending.filter(e=>(e.window?.late??e.time)>=now-30).sort((a,b)=>(a.window?.early??a.time)-(b.window?.early??b.time));
  if(viable.length)return viable[0];
  const dream=pending.find(e=>e.key==='dream');if(dream&&now>=BED_MAX)return dream;
  return tomorrowEvent();
}
function logActual(key,label){const d=today();d.actual[key]=toTime(nowMin());d.lastChange=`${label} logged at ${fmt(nowMin())}. All later windows slid from what actually happened.`;touch(d);renderAll()}

function windowMeta(n,now){
  const w=n.window;if(!w)return null;
  if(now<w.early)return {phase:'upcoming',text:`Window ${rangeText(w)}. It opens in ${dur(w.early-now)}; sweet spot ~${fmt(w.target)}.`};
  if(now<=w.late){
    const cue=n.cue==='hungry'?'hunger':n.cue==='sleepy'?'sleepy':'baby';
    return {phase:'open',text:`Window is open (${rangeText(w)}). Sweet spot ~${fmt(w.target)}, but ${cue} cues win.`};
  }
  return {phase:'late',text:`Past the usual ${rangeText(w)} window by ${dur(now-w.late)}. No panic — follow her cues and log the real time.`};
}
function hero(day,c){
  const n=nextEvent(day,c),btn=$('#heroAction'),card=$('#nextCard');
  card.classList.toggle('tomorrow',!!n.tomorrow);
  if(n.tomorrow){
    $('#nextLabel').textContent='TOMORROW';$('#nextTitle').textContent='Wake up';$('#nextTime').textContent=fmt(n.time);$('#nextIcon').textContent='☀️';
    $('#nextMeta').textContent=`Today is wrapped. Tomorrow starts around ${fmt(n.time)}, with the first daytime feed around ${fmt(n.feedTime)}.`;btn.classList.add('hidden');return;
  }
  btn.classList.remove('hidden');$('#nextTitle').textContent=n.window?`${n.label.replace(' starts','')} window`:n.label;$('#nextIcon').textContent=n.icon;
  const wm=windowMeta(n,nowMin());
  if(wm){$('#nextLabel').textContent=wm.phase==='open'?'WINDOW OPEN':wm.phase==='late'?'FOLLOW HER CUES':'COMING UP';$('#nextTime').textContent=rangeText(n.window);$('#nextMeta').textContent=wm.text}
  else{
    $('#nextLabel').textContent=n.time<nowMin()?'CHECK IN':'NEXT UP';$('#nextTime').textContent=fmt(n.time);const delta=n.time-nowMin();
    $('#nextMeta').textContent=n.runningNap&&delta<0?`Nap ${n.runningNap} is running long by ${dur(Math.abs(delta))}. A paci/resettle does not end the nap — use “Woke up” when she is actually up.`:delta>5?`Around ${fmt(n.time)}. That’s a guide, not an alarm.`:delta>=-20?'Right around now. Log the real time and the later windows will slide.':`Planned around ${fmt(n.time)}. Log the real time if it just happened.`;
  }
  btn.textContent=`Log ${n.label.toLowerCase()} now`;btn.dataset.key=n.key;btn.dataset.label=n.label;
}
function check(c){
  let msg=`Mom Science mode: wake windows are 1h30–2h. Stella’s current sweet spot is ~${dur(c.wakeTarget)}.`,cls='';
  const feedBad=c.gaps.some(g=>g<FEED_MIN||g>FEED_MAX),wakeBad=c.wakeWindows.some(w=>w<WAKE_MIN||w>WAKE_MAX);
  if(c.totalNap>DAY_NAP_MAX){msg=`Daytime naps total ${dur(c.totalNap)}, above the ~4-hour guide.`;cls='bad'}
  else if(feedBad||wakeBad||c.bed<BED_MIN||c.bed>BED_MAX){msg='A few actual times are outside the usual windows. That can happen — the app keeps adapting from what Stella actually did.';cls='warn'}
  $('#scheduleCheck').innerHTML=`<div class="checkMsg ${cls}">${msg}</div>`;
}
function renderToday(){
  const d=today(),c=compute(d),closed=has(d,'dream');
  $('#dateText').textContent=new Date().toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});const ms=$('#momScience');if(ms)ms.innerHTML=`<b>🧠 Mom Science:</b> wake windows slide from the real wake-up — usually <b>1h30–2h</b>. Current sweet spot: <b>~${dur(c.wakeTarget)}</b>. <span>Her cues beat the clock.</span>`;
  $('#anchorWake').value=d.anchors.wake;$('#anchorFeed').value=d.anchors.feed;$('#anchorBed').value=d.anchors.bed;$('#anchorDream').value=d.anchors.dream;
  $('#timeline').innerHTML=timeline(d,c);hero(d,c);check(c);
  const note=$('#updateNote');if(d.lastChange){note.textContent=d.lastChange;note.classList.remove('hidden')}else note.classList.add('hidden');
  const running=[1,2,3].find(i=>has(d,`nap${i}s`)&&!has(d,`nap${i}e`));
  $('#wakeNowLabel').textContent=running?`Woke from Nap ${running}`:has(d,'wake')?'Woke up':'Morning wake';$('#wakeNowSub').textContent=running?'End the running nap':has(d,'wake')?'Wake already logged':'Start today';
  const nextNap=[1,2,3].find(i=>!has(d,`nap${i}s`));
  $('#sleepNowLabel').textContent=running?'Nap in progress':nextNap?`Nap ${nextNap} started`:'No nap left';$('#sleepNowSub').textContent=running?'Use Woke up when the nap ends':nextNap?'Log when she actually falls asleep':'All 3 naps started';$('#sleepNowBtn').disabled=closed||!!running||!nextNap;
  $('#resettleNowBtn').disabled=closed||!running;$('#resettleNowSub').textContent=running?`Nap ${running} keeps running`:'Available during a nap';
  const dreamMode=(has(d,'bed')||nowMin()>=20*60+30)&&!has(d,'dream');$('#feedNowSub').textContent=dreamMode?'Log the dream feed':'Log the nearest feed';$('#feedNowBtn').querySelector('b').textContent=dreamMode?'Dream feed now':'Fed now';
  $('#feedNowBtn').disabled=closed;$('#wakeNowBtn').disabled=closed||(!running&&has(d,'wake'));
}

let editing=null;
function openEdit(id){
  const d=today(),c=compute(d),def=defs.find(x=>x.id===id);editing=def;$('#editTitle').textContent=def.title;
  if(def.single){$('#editFields').innerHTML=editField(def.single,'Time',c[def.single],has(d,def.single))}
  else {const n=c[def.obj];$('#editFields').innerHTML=editField(def.start,'Start',n.start,has(d,def.start))+editField(def.end,'End',n.end,has(d,def.end))}
  $('#editDialog').showModal();
}
function editField(key,label,value,actual){return `<div class="editField"><label>${label}<input type="time" data-edit-time="${key}" value="${toTime(value)}"></label><label class="actualToggle"><input type="checkbox" data-edit-actual="${key}" ${actual?'checked':''}> Actual</label></div>`}
function saveEdit(){const d=today();$$('[data-edit-time]').forEach(inp=>{const key=inp.dataset.editTime,checked=$(`[data-edit-actual="${key}"]`).checked;if(checked&&inp.value)d.actual[key]=inp.value;else delete d.actual[key]});d.lastChange=`${editing.title} updated. Future windows slid from the new actual time.`;touch(d);renderAll()}
function clearEdit(){const d=today();if(editing.single)delete d.actual[editing.single];else{delete d.actual[editing.start];delete d.actual[editing.end]}d.lastChange=`${editing.title} returned to automatic windows.`;touch(d);$('#editDialog').close();renderAll()}

function resettleCount(day){return (day.resettles||[]).length}
function actualCount(day){return Object.keys(day.actual||{}).filter(k=>day.actual[k]).length+resettleCount(day)}
function actualNapTotal(day){let t=0,complete=0;for(let i=1;i<=3;i++){if(has(day,`nap${i}s`)&&has(day,`nap${i}e`)){const x=actualMin(day,`nap${i}e`)-actualMin(day,`nap${i}s`);if(x>0&&x<300){t+=x;complete++}}}return complete?{minutes:t,complete}:null}
function feedCount(day){return ['feed1','feed2','feed3','feed4','dream'].filter(k=>has(day,k)).length}
function historyDays(){return Object.entries(data.days).filter(([,d])=>actualCount(d)>0).sort((a,b)=>b[0].localeCompare(a[0]))}
function renderHistory(){
  const list=historyDays();if(!list.length){$('#historyList').innerHTML='<div class="emptyState"><b>No saved days yet</b>Start logging actual feeds, naps or wake times. Today will appear here automatically.</div>';return}
  $('#historyList').innerHTML=list.map(([k,d])=>{const naps=actualNapTotal(d),ww=actualNapWakeWindows(d);return `<button class="historyDay" data-history="${k}"><div class="historyTop"><b>${dateLabel(k)}</b><span>${actualCount(d)} actual logs</span></div><div class="historyMetrics"><div class="historyMetric"><small>Wake</small><strong>${has(d,'wake')?fmt(actualMin(d,'wake')):'—'}</strong></div><div class="historyMetric"><small>Feeds</small><strong>${feedCount(d)} logged</strong></div><div class="historyMetric"><small>Naps</small><strong>${naps?dur(naps.minutes):'—'}</strong></div><div class="historyMetric"><small>Wake windows</small><strong>${ww.length?dur(ww.reduce((a,b)=>a+b,0)/ww.length):'—'}</strong></div><div class="historyMetric"><small>Resettles</small><strong>${resettleCount(d)}</strong></div><div class="historyMetric"><small>Bed</small><strong>${has(d,'bed')?fmt(actualMin(d,'bed')):'—'}</strong></div></div></button>`}).join('');
}
function openHistory(k){
  const d=data.days[k];$('#historyTitle').textContent=dateLabel(k);const rows=[];
  const labels={wake:'Wake up',feed1:'Feed 1',nap1s:'Nap 1 start',nap1e:'Nap 1 end',feed2:'Feed 2',nap2s:'Nap 2 start',nap2e:'Nap 2 end',feed3:'Feed 3',nap3s:'Nap 3 start',nap3e:'Nap 3 end',feed4:'Feed 4',bed:'Bedtime',dream:'Dream feed'};
  Object.entries(labels).forEach(([key,label])=>{if(has(d,key))rows.push(`<div class="detailRow"><b>${label}</b><span>${fmt(actualMin(d,key))}</span></div>`)});
  (d.resettles||[]).forEach(r=>rows.push(`<div class="detailRow resettleDetail"><b>🫶 Nap ${r.nap} resettle</b><span>${fmt(toMin(r.time))}</span></div>`));
  const ww=actualNapWakeWindows(d);$('#historyDetails').innerHTML=`<div class="detailSummary"><div class="historyMetric"><small>Actual logs</small><strong>${actualCount(d)}</strong></div><div class="historyMetric"><small>Feeds</small><strong>${feedCount(d)}</strong></div><div class="historyMetric"><small>Avg wake window</small><strong>${ww.length?dur(ww.reduce((a,b)=>a+b,0)/ww.length):'—'}</strong></div></div>${rows.join('')||'<div class="emptyState">No actual events saved.</div>'}`;$('#historyDialog').showModal();
}

function avgClock(values){if(!values.length)return null;const adjusted=values.map(v=>v<240?v+1440:v);let n=adjusted.reduce((a,b)=>a+b,0)/adjusted.length;return n>=1440?n-1440:n}
function avg(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null}
function statsDays(range){const end=dayDate(dayKey()),start=new Date(end);start.setDate(start.getDate()-(range-1));return historyDays().filter(([k])=>dayDate(k)>=start&&dayDate(k)<=end).sort((a,b)=>a[0].localeCompare(b[0]))}
function actualFeedGaps(day){const vals=['feed1','feed2','feed3','feed4'].filter(k=>has(day,k)).map(k=>actualMin(day,k)).sort((a,b)=>a-b);const gaps=[];for(let i=1;i<vals.length;i++){const g=vals[i]-vals[i-1];if(g>0&&g<360)gaps.push(g)}return gaps}
function statCard(label,value,sub=''){return `<div class="statCard"><span>${label}</span><b>${value}</b>${sub?`<small>${sub}</small>`:''}</div>`}
function renderStats(){
  const range=data.statsRange||7,days=statsDays(range),wake=[],first=[],bed=[],nap=[],gaps=[],resettles=[],wakeWindows=[];
  days.forEach(([,d])=>{if(has(d,'wake'))wake.push(actualMin(d,'wake'));if(has(d,'feed1'))first.push(actualMin(d,'feed1'));if(has(d,'bed'))bed.push(actualMin(d,'bed'));const n=actualNapTotal(d);if(n)nap.push(n.minutes);gaps.push(...actualFeedGaps(d));resettles.push(resettleCount(d));wakeWindows.push(...actualNapWakeWindows(d))});
  const totalResettles=resettles.reduce((a,b)=>a+b,0),inRange=wakeWindows.filter(v=>v>=WAKE_MIN&&v<=WAKE_MAX).length;
  $('#statGrid').innerHTML=statCard('Days logged',days.length,`of last ${range}`)+statCard('Stella sweet spot',dur(learnedWakeTarget()),`${wakeWindows.length} actual nap windows`)+statCard('In mom window',wakeWindows.length?`${Math.round(inRange/wakeWindows.length*100)}%`:'—','1h30–2h')+statCard('Avg wake',fmt(avgClock(wake)),`${wake.length} days`)+statCard('Avg first feed',fmt(avgClock(first)),`${first.length} days`)+statCard('Avg nap sleep',nap.length?dur(avg(nap)):'—',`${nap.length} complete days`)+statCard('Avg bedtime',fmt(avgClock(bed)),`${bed.length} days`)+statCard('Avg feed gap',gaps.length?dur(avg(gaps)):'—',`${gaps.length} intervals`)+statCard('Avg resettles',days.length?(totalResettles/days.length).toFixed(1):'—',`${totalResettles} logged`);
  $('#bedChart').innerHTML=lineChart(days.map(([k,d])=>has(d,'bed')?{label:shortDate(k),value:actualMin(d,'bed')}:null).filter(Boolean),'time');
  $('#napChart').innerHTML=lineChart(days.map(([k,d])=>{const n=actualNapTotal(d);return n?{label:shortDate(k),value:n.minutes}:null}).filter(Boolean),'duration');
  $('#statsNote').textContent=wakeWindows.length<4?'Once a few actual wake windows are logged, Baby Day starts using Stella’s own average as the sweet spot inside the 1h30–2h range.':'The sweet spot learns from actual nap starts, while the acceptable window stays flexible. Missing events are ignored rather than guessed.';
  $$('#rangeTabs button').forEach(b=>b.classList.toggle('active',Number(b.dataset.days)===range));
}
function lineChart(points,type){
  if(points.length<2)return '<div class="chartEmpty">Need at least 2 logged days for a trend.</div>';
  const W=330,H=130,L=30,R=10,T=12,B=24,vals=points.map(p=>p.value),min=Math.min(...vals),max=Math.max(...vals),padY=Math.max(type==='time'?20:30,(max-min)*.18),lo=min-padY,hi=max+padY;
  const x=i=>L+(W-L-R)*(points.length===1?0:i/(points.length-1)),y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo||1));
  const path=points.map((p,i)=>`${i?'L':'M'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' '),label=v=>type==='time'?fmt(v):dur(v),mids=[lo,(lo+hi)/2,hi];
  return `<svg class="chartSvg" viewBox="0 0 ${W} ${H}" role="img"><g>${mids.map(v=>`<line class="chartGuide" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"></line><text class="chartAxis" x="0" y="${y(v)+3}">${label(v)}</text>`).join('')}</g><path class="chartLine" style="color:var(--sageDark)" d="${path}"></path>${points.map((p,i)=>`<circle class="chartDot" style="color:var(--sageDark)" cx="${x(i)}" cy="${y(p.value)}" r="3.5"></circle>`).join('')}<text class="chartAxis" x="${L}" y="${H-4}">${points[0].label}</text><text class="chartAxis" text-anchor="end" x="${W-R}" y="${H-4}">${points[points.length-1].label}</text></svg>`;
}

function exportData(){
  const payload={app:'Baby Day',exportedAt:new Date().toISOString(),version:5,defaults:data.defaults,days:data.days},blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`stella-baby-day-backup-${dayKey()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function importData(file){
  try{const parsed=JSON.parse(await file.text());if(!parsed||![3,4,5].includes(parsed.version)||!parsed.days)throw new Error('Invalid backup');data.defaults={...data.defaults,...(parsed.defaults||{})};data.days={...data.days,...parsed.days};Object.values(data.days).forEach(d=>{d.resettles=Array.isArray(d.resettles)?d.resettles:[]});ensureToday();save();renderAll();alert('Backup imported. Existing days were kept; matching dates were replaced by the backup.')}catch{alert('That file does not look like a Baby Day backup.')}
}

function injectMomScienceUI(){
  if(!$('#momScience')){
    const card=$('#nextCard');
    if(card){
      const box=document.createElement('div');box.id='momScience';box.className='momScience';box.innerHTML='<b>🧠 Mom Science:</b> wake windows slide from the real wake-up — usually <b>1h30–2h</b>, with a starting sweet spot around <b>1h45</b>. <span>Her cues beat the clock.</span>';card.insertAdjacentElement('afterend',box);
      const style=document.createElement('style');style.textContent='.momScience{margin:10px 1px 0;padding:11px 13px;border-radius:15px;background:#edf3eb;border:1px solid #dae5d7;color:#536750;font-size:.74rem;line-height:1.4}.momScience b{font-weight:950}.momScience span{color:var(--muted)}';document.head.appendChild(style);
    }
  }
  const qp=$('.quickSection>p');if(qp)qp.textContent='One tap logs what happened. Every later window slides from the real event.';
  const pill=$('.livePill');if(pill)pill.textContent='MOVING WINDOWS';
  $$('.ruleList div').forEach(row=>{const b=row.querySelector('b'),s=row.querySelector('span');if(b&&s&&b.textContent.trim()==='Wake windows')s.textContent='1h30–2h · sweet spot learns Stella'});
}

function switchTab(tab){data.lastTab=tab;save();$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$$('.view').forEach(v=>v.classList.remove('active'));$(`#${tab}View`).classList.add('active');if(tab==='history')renderHistory();if(tab==='stats')renderStats();window.scrollTo({top:0,behavior:'smooth'})}
function renderAll(){renderToday();renderHistory();renderStats()}

$('#heroAction').addEventListener('click',e=>{if(e.currentTarget.dataset.key)logActual(e.currentTarget.dataset.key,e.currentTarget.dataset.label)});
$('#feedNowBtn').addEventListener('click',()=>{const d=today(),c=compute(d),now=nowMin();if(has(d,'dream'))return;if((has(d,'bed')||now>=20*60+30)&&!has(d,'dream')){logActual('dream','Dream feed');return}const keys=['feed1','feed2','feed3','feed4'].filter(k=>!has(d,k));if(!keys.length)return;const key=keys.sort((a,b)=>Math.abs(c[a]-now)-Math.abs(c[b]-now))[0];logActual(key,key.replace('feed','Feed '))});
$('#sleepNowBtn').addEventListener('click',()=>{const d=today();if(has(d,'dream'))return;const running=[1,2,3].find(i=>has(d,`nap${i}s`)&&!has(d,`nap${i}e`));if(running)return;const i=[1,2,3].find(n=>!has(d,`nap${n}s`));if(i)logActual(`nap${i}s`,`Nap ${i} started`)});
$('#wakeNowBtn').addEventListener('click',()=>{const d=today();if(has(d,'dream'))return;const running=[1,2,3].find(i=>has(d,`nap${i}s`)&&!has(d,`nap${i}e`));if(running)logActual(`nap${running}e`,`Nap ${running} ended`);else if(!has(d,'wake'))logActual('wake','Wake up')});
$('#resettleNowBtn').addEventListener('click',()=>{const d=today(),running=[1,2,3].find(i=>has(d,`nap${i}s`)&&!has(d,`nap${i}e`));if(!running||has(d,'dream'))return;d.resettles=d.resettles||[];d.resettles.push({time:toTime(nowMin()),nap:running,at:new Date().toISOString()});d.lastChange=`Paci / resettle logged during Nap ${running} at ${fmt(nowMin())}. The nap is still running.`;touch(d);renderAll()});
$('#timeline').addEventListener('click',e=>{const row=e.target.closest('[data-edit]');if(row)openEdit(row.dataset.edit)});
$('#editForm').addEventListener('submit',e=>{e.preventDefault();saveEdit();$('#editDialog').close()});$('#clearEditBtn').addEventListener('click',clearEdit);
$('#resetBtn').addEventListener('click',()=>$('#resetDialog').showModal());$('#cancelReset').addEventListener('click',()=>$('#resetDialog').close());$('#confirmReset').addEventListener('click',()=>{const d=today();d.actual={};d.resettles=[];d.lastChange='';touch(d);$('#resetDialog').close();renderAll()});
[['anchorWake','wake'],['anchorFeed','feed'],['anchorBed','bed'],['anchorDream','dream']].forEach(([id,key])=>$('#'+id).addEventListener('change',e=>{const d=today();d.anchors[key]=e.target.value;data.defaults[key]=e.target.value;d.lastChange='Schedule anchors updated.';touch(d);renderAll()}));
$$('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
$('#historyList').addEventListener('click',e=>{const b=e.target.closest('[data-history]');if(b)openHistory(b.dataset.history)});$('#closeHistory').addEventListener('click',()=>$('#historyDialog').close());
$('#rangeTabs').addEventListener('click',e=>{const b=e.target.closest('[data-days]');if(!b)return;data.statsRange=Number(b.dataset.days);save();renderStats()});
$('#exportBtn').addEventListener('click',exportData);$('#historyExportBtn').addEventListener('click',exportData);$('#importBtn').addEventListener('click',()=>$('#importFile').click());$('#importFile').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(f)importData(f);e.target.value=''});

injectMomScienceUI();renderAll();switchTab(['today','history','stats'].includes(data.lastTab)?data.lastTab:'today');
setInterval(()=>renderToday(),60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderAll()});
})();
