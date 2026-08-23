(()=>{
'use strict';
const WAKE=120, FEED_TARGET=210, FEED_MIN=180, FEED_MAX=240, DAY_NAP_MAX=240;
const BED_MIN=18*60+30, BED_MAX=19*60, DREAM_MIN=21*60+30, DREAM_MAX=23*60;
const STORE='baby-day-live-v2';
const $=s=>document.querySelector(s), pad=n=>String(n).padStart(2,'0');
const toMin=t=>{if(!t)return null;const [h,m]=t.split(':').map(Number);return h*60+m};
const toTime=n=>{n=((Math.round(n)%1440)+1440)%1440;return `${pad(Math.floor(n/60))}:${pad(n%60)}`};
const fmt=n=>new Date(2000,0,1,Math.floor(n/60)%24,n%60).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const dur=n=>{n=Math.max(0,Math.round(n));const h=Math.floor(n/60),m=n%60;return h?`${h}h${m?` ${m}m`:''}`:`${m}m`};
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const nowMin=()=>{const d=new Date();return d.getHours()*60+d.getMinutes()};
const dayKey=()=>new Date().toLocaleDateString('en-CA');
const baseState=()=>({date:dayKey(),anchors:{wake:'07:00',feed:'07:15',bed:'18:30',dream:'22:15'},actual:{},lastChange:''});
let state=load();
function load(){try{const x=JSON.parse(localStorage.getItem(STORE)||'{}');const b=baseState();return x.date===dayKey()?{...b,...x,anchors:{...b.anchors,...(x.anchors||{})},actual:{...(x.actual||{})}}:b}catch{return baseState()}}
function save(){state.date=dayKey();localStorage.setItem(STORE,JSON.stringify(state))}
const has=k=>Object.prototype.hasOwnProperty.call(state.actual,k)&&!!state.actual[k];
const actualMin=k=>has(k)?toMin(state.actual[k]):null;
function setActual(k,v,label){state.actual[k]=v;state.lastChange=`Recalculated after ${label||k} was logged at ${fmt(toMin(v))}.`;save();render()}
function clearActual(k){delete state.actual[k];state.lastChange='Returned that event to automatic planning.';save();render()}
function clearPair(a,b){delete state.actual[a];delete state.actual[b];state.lastChange='Returned that nap to automatic planning.';save();render()}

function feedAroundNaps(prev,target,naps){
  let t=clamp(target,prev+FEED_MIN,prev+FEED_MAX),note='';
  for(const nap of naps){
    if(t>nap.start&&t<nap.end){
      if(nap.end-prev<=FEED_MAX){t=nap.end;note=`moved to after ${nap.name}`}
      else if(nap.start-prev>=FEED_MIN){t=Math.max(prev+FEED_MIN,nap.start-10);note=`moved before ${nap.name}`}
      else {t=nap.end;note=`conflicts with ${nap.name}`}
    }
  }
  return {time:t,note};
}

function compute(){
  const a={wake:toMin(state.anchors.wake),feed:toMin(state.anchors.feed),bed:toMin(state.anchors.bed),dream:toMin(state.anchors.dream)};
  const wake=actualMin('wake')??a.wake;
  const feed1=actualMin('feed1')??Math.max(a.feed,wake+15);

  const nap1s=actualMin('nap1s')??wake+WAKE;
  const nap1e=actualMin('nap1e')??nap1s+90;
  const nap1={name:'Nap 1',start:nap1s,end:Math.max(nap1e,nap1s+10)};

  const f2auto=feedAroundNaps(feed1,feed1+FEED_TARGET,[nap1]);
  const feed2=actualMin('feed2')??f2auto.time;

  const nap2s=actualMin('nap2s')??nap1.end+WAKE;
  const nap2e=actualMin('nap2e')??nap2s+90;
  const nap2={name:'Nap 2',start:nap2s,end:Math.max(nap2e,nap2s+10)};

  const f3auto=feedAroundNaps(feed2,feed2+FEED_TARGET,[nap2]);
  const feed3=actualMin('feed3')??f3auto.time;

  const firstTwo=(nap1.end-nap1.start)+(nap2.end-nap2.start);
  const remaining=Math.max(0,DAY_NAP_MAX-firstTwo);
  let nap3Target=Math.min(firstTwo>=150?30:45,remaining);
  if(nap3Target<=0)nap3Target=15;
  const nap3s=actualMin('nap3s')??nap2.end+WAKE;
  if(!has('nap3e')){
    const latestEnd=BED_MAX-WAKE;
    if(nap3s+nap3Target>latestEnd)nap3Target=Math.max(10,latestEnd-nap3s);
  }
  const nap3e=actualMin('nap3e')??nap3s+nap3Target;
  const nap3={name:'Nap 3',start:nap3s,end:Math.max(nap3e,nap3s+5)};

  const f4auto=feedAroundNaps(feed3,feed3+FEED_TARGET,[nap3]);
  const feed4=actualMin('feed4')??f4auto.time;

  const bedAuto=clamp(Math.max(a.bed,nap3.end+WAKE),BED_MIN,BED_MAX);
  const bed=actualMin('bed')??bedAuto;
  const dream=actualMin('dream')??clamp(a.dream,DREAM_MIN,DREAM_MAX);

  const feeds=[feed1,feed2,feed3,feed4];
  const gaps=feeds.slice(1).map((f,i)=>f-feeds[i]);
  const wakeWindows=[nap1.start-wake,nap2.start-nap1.end,nap3.start-nap2.end,bed-nap3.end];
  const totalNap=(nap1.end-nap1.start)+(nap2.end-nap2.start)+(nap3.end-nap3.start);
  return {wake,feed1,feed2,feed3,feed4,nap1,nap2,nap3,bed,dream,feeds,gaps,wakeWindows,totalNap,firstTwo,notes:{feed2:f2auto.note,feed3:f3auto.note,feed4:f4auto.note}};
}

const defs=[
  {id:'wake',kind:'wake',icon:'☀︎',title:'Wake up',single:'wake'},
  {id:'feed1',kind:'feed',icon:'◒',title:'Feed 1',single:'feed1'},
  {id:'nap1',kind:'nap',icon:'Zz',title:'Nap 1',start:'nap1s',end:'nap1e',obj:'nap1'},
  {id:'feed2',kind:'feed',icon:'◒',title:'Feed 2',single:'feed2'},
  {id:'nap2',kind:'nap',icon:'Zz',title:'Nap 2',start:'nap2s',end:'nap2e',obj:'nap2'},
  {id:'feed3',kind:'feed',icon:'◒',title:'Feed 3',single:'feed3'},
  {id:'nap3',kind:'nap',icon:'Zz',title:'Nap 3',start:'nap3s',end:'nap3e',obj:'nap3'},
  {id:'feed4',kind:'feed',icon:'◒',title:'Feed 4',single:'feed4'},
  {id:'bed',kind:'sleep',icon:'☾',title:'Bedtime',single:'bed'},
  {id:'dream',kind:'sleep',icon:'✦',title:'Dream feed',single:'dream'}
];
function eventTime(d,c){return d.single?c[d.single]:c[d.obj].start}
function isActual(d){return d.single?has(d.single):(has(d.start)||has(d.end))}
function subtitle(d,c){
  if(d.id==='wake')return `Nap 1 plans for ${fmt(c.nap1.start)} · two hours after wake`;
  if(d.id==='feed1')return `Ideal first feed is around 7:15 AM · today’s plan uses ${fmt(c.feed1)}`;
  if(d.id==='feed2')return `${dur(c.feed2-c.feed1)} after Feed 1${c.notes.feed2?` · ${c.notes.feed2}`:''}`;
  if(d.id==='feed3')return `${dur(c.feed3-c.feed2)} after Feed 2${c.notes.feed3?` · ${c.notes.feed3}`:''}`;
  if(d.id==='feed4')return `${dur(c.feed4-c.feed3)} after Feed 3${c.notes.feed4?` · ${c.notes.feed4}`:''}`;
  if(d.id==='nap1')return `Wake window ${dur(c.nap1.start-c.wake)} · planned nap ${dur(c.nap1.end-c.nap1.start)}`;
  if(d.id==='nap2')return `Wake window ${dur(c.nap2.start-c.nap1.end)} · planned nap ${dur(c.nap2.end-c.nap2.start)}`;
  if(d.id==='nap3')return `Wake window ${dur(c.nap3.start-c.nap2.end)} · short nap ${dur(c.nap3.end-c.nap3.start)}`;
  if(d.id==='bed')return `6:30–7:00 PM window · final wake window ${dur(c.bed-c.nap3.end)}`;
  if(d.id==='dream')return `Dream-feed window 9:30–11:00 PM`;
  return '';
}
function input(k,v,label=''){return `<div class="timewrap">${label?`<small>${label}</small>`:''}<input type="time" data-time="${k}" value="${toTime(v)}"></div>`}
function eventHtml(d,c){
  let controls='';
  if(d.single){controls=`${input(d.single,c[d.single])}<button class="tiny now" data-now="${d.single}" data-label="${d.title}">Now</button>${has(d.single)?`<button class="tiny auto" data-auto="${d.single}">Auto</button>`:''}`}
  else {const n=c[d.obj];controls=`${input(d.start,n.start,'Start')}${input(d.end,n.end,'End')}<button class="tiny now" data-now="${d.start}" data-label="${d.title} start">Start now</button><button class="tiny now" data-now="${d.end}" data-label="${d.title} end">Wake now</button>${isActual(d)?`<button class="tiny auto" data-pair="${d.start},${d.end}">Auto</button>`:''}`}
  return `<div class="event ${d.kind}"><div class="ico">${d.icon}</div><div><div class="eventTop"><div><div class="title">${d.title}</div><div class="sub">${subtitle(d,c)}</div></div><span class="tag ${isActual(d)?'actual':''}">${isActual(d)?'ACTUAL':'PLANNED'}</span></div><div class="controls">${controls}</div></div></div>`
}
function planRows(c){
  const rows=defs.map(d=>({d,time:eventTime(d,c)})).sort((x,y)=>x.time-y.time);
  return rows.map(({d})=>{const n=d.obj?c[d.obj]:null;const when=d.single?fmt(c[d.single]):`${fmt(n.start)}–${fmt(n.end)}`;return `<div class="planline"><div class="when">${when}</div><div class="what"><b>${d.title}</b><span>${subtitle(d,c)}</span></div><span class="tag ${isActual(d)?'actual':''}">${isActual(d)?'actual':'auto'}</span></div>`}).join('')
}
function chronology(c){
  return [
    {key:'wake',label:'Wake up',time:c.wake},
    {key:'feed1',label:'Feed 1',time:c.feed1},
    {key:'nap1s',label:'Nap 1 starts',time:c.nap1.start},
    {key:'nap1e',label:'Nap 1 ends',time:c.nap1.end},
    {key:'feed2',label:'Feed 2',time:c.feed2},
    {key:'nap2s',label:'Nap 2 starts',time:c.nap2.start},
    {key:'nap2e',label:'Nap 2 ends',time:c.nap2.end},
    {key:'feed3',label:'Feed 3',time:c.feed3},
    {key:'nap3s',label:'Nap 3 starts',time:c.nap3.start},
    {key:'nap3e',label:'Nap 3 ends',time:c.nap3.end},
    {key:'feed4',label:'Feed 4',time:c.feed4},
    {key:'bed',label:'Bedtime',time:c.bed},
    {key:'dream',label:'Dream feed',time:c.dream}
  ].sort((a,b)=>a.time-b.time)
}
function nextEvent(c){const now=nowMin();return chronology(c).find(e=>e.time>=now-2)||null}
function hero(c){const n=nextEvent(c);if(!n){$('#nextTitle').textContent='Day complete ✓';$('#nextMeta').textContent='Everything on the schedule is behind you for today.';$('#logNext').classList.add('hidden');$('#clearNext').classList.add('hidden');return}$('#logNext').classList.remove('hidden');$('#nextTitle').textContent=`${n.label} · ${fmt(n.time)}`;const delta=n.time-nowMin();$('#nextMeta').textContent=delta>1?`Planned in ${dur(delta)}. Log the actual time and future unlocked events reflow immediately.`:'Right about now. Log it and the rest of the day will recalculate.';$('#logNext').dataset.key=n.key;$('#logNext').dataset.label=n.label;if(has(n.key)){ $('#clearNext').classList.remove('hidden');$('#clearNext').dataset.key=n.key }else $('#clearNext').classList.add('hidden')}
function check(c){
  const out=[];
  c.gaps.forEach((g,i)=>{if(g<FEED_MIN||g>FEED_MAX)out.push({bad:false,text:`Feed ${i+2} is ${dur(g)} after the previous feed; the routine says 3–4 hours.`})});
  c.wakeWindows.forEach((w,i)=>{if(Math.abs(w-WAKE)>20)out.push({bad:false,text:`${i===3?'Final wake window':`Wake window ${i+1}`} is ${dur(w)} instead of about 2 hours.`})});
  if(c.totalNap>DAY_NAP_MAX)out.push({bad:true,text:`Daytime nap total is ${dur(c.totalNap)}, above the 4-hour maximum.`});
  if(c.nap3.end-c.nap3.start>45)out.push({bad:false,text:`Nap 3 is ${dur(c.nap3.end-c.nap3.start)}; the routine calls for 30–45 minutes max when the first two naps were long.`});
  if(c.bed<BED_MIN||c.bed>BED_MAX)out.push({bad:false,text:`Bedtime is ${fmt(c.bed)}, outside the 6:30–7:00 PM target.`});
  if(c.dream<DREAM_MIN||c.dream>DREAM_MAX)out.push({bad:false,text:`Dream feed is ${fmt(c.dream)}, outside the 9:30–11:00 PM window.`});
  if(c.feed1<c.wake-10)out.push({bad:true,text:`Feed 1 is before wake-up. Check the actual times.`});
  if(!out.length)out.push({ok:true,text:'Everything currently fits the routine: 2-hour wake windows, 3–4-hour feeds, nap cap, bedtime and dream-feed window.'});
  $('#alerts').innerHTML=out.map(x=>`<div class="alert ${x.ok?'ok':x.bad?'bad':''}">${x.ok?'✓':'!'}&nbsp; ${x.text}</div>`).join('')
}
function render(){
  const c=compute();
  $('#anchorWake').value=state.anchors.wake;$('#anchorFeed').value=state.anchors.feed;$('#anchorBed').value=state.anchors.bed;$('#anchorDream').value=state.anchors.dream;
  $('#plan').innerHTML=planRows(c);
  $('#events').innerHTML=defs.map(d=>eventHtml(d,c)).join('');
  $('#reflowNote').textContent=state.lastChange||'The default day, calculated from a 7:00 AM wake and ~7:15 AM first feed.';
  $('#stats').innerHTML=`<div class="stat"><span>Day naps</span><b>${dur(c.totalNap)} / 4h</b></div><div class="stat"><span>Bedtime</span><b>${fmt(c.bed)}</b></div><div class="stat"><span>Last day feed</span><b>${fmt(c.feed4)}</b></div>`;
  hero(c);check(c);save();window.__babyPlanner={state:JSON.parse(JSON.stringify(state)),computed:c}
}
function bind(){
  const amap={anchorWake:'wake',anchorFeed:'feed',anchorBed:'bed',anchorDream:'dream'};
  Object.keys(amap).forEach(id=>$('#'+id).addEventListener('change',e=>{state.anchors[amap[id]]=e.target.value;state.lastChange='Recalculated from the updated daily anchor.';save();render()}));
  $('#events').addEventListener('change',e=>{const k=e.target.dataset.time;if(k)setActual(k,e.target.value,k)});
  $('#events').addEventListener('click',e=>{if(e.target.dataset.now)setActual(e.target.dataset.now,toTime(nowMin()),e.target.dataset.label);if(e.target.dataset.auto)clearActual(e.target.dataset.auto);if(e.target.dataset.pair){const [a,b]=e.target.dataset.pair.split(',');clearPair(a,b)}});
  $('#logNext').addEventListener('click',e=>setActual(e.currentTarget.dataset.key,toTime(nowMin()),e.currentTarget.dataset.label));
  $('#clearNext').addEventListener('click',e=>clearActual(e.currentTarget.dataset.key));
  $('#resetBtn').addEventListener('click',()=>$('#resetDialog').showModal());$('#cancelReset').addEventListener('click',()=>$('#resetDialog').close());$('#confirmReset').addEventListener('click',()=>{state=baseState();save();$('#resetDialog').close();render()})
}
$('#dateText').textContent=new Date().toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});bind();render();setInterval(()=>hero(compute()),60000);
})();
