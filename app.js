(()=>{
'use strict';
const WAKE=120, FEED_TARGET=210, FEED_MIN=180, FEED_MAX=240, DAY_NAP_MAX=240;
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
const nowMin=()=>{const d=new Date();return d.getHours()*60+d.getMinutes()};
const dayKey=(d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const dayDate=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)};
const dateLabel=k=>dayDate(k).toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});
const shortDate=k=>dayDate(k).toLocaleDateString([],{month:'short',day:'numeric'});
const has=(day,k)=>Object.prototype.hasOwnProperty.call(day.actual||{},k)&&!!day.actual[k];
const actualMin=(day,k)=>has(day,k)?toMin(day.actual[k]):null;

function baseStore(){return {version:3,defaults:{...DEFAULTS},days:{},lastTab:'today',statsRange:7}}
function newDay(anchors){return {anchors:{...(anchors||DEFAULTS)},actual:{},lastChange:'',updatedAt:new Date().toISOString()}}
function load(){
  let data;
  try{data=JSON.parse(localStorage.getItem(STORE)||'null')}catch{}
  if(!data||data.version!==3||!data.days){
    data=baseStore();
    try{
      const old=JSON.parse(localStorage.getItem(LEGACY)||'null');
      if(old&&old.date){
        data.defaults={...DEFAULTS,...(old.anchors||{})};
        data.days[old.date]={anchors:{...data.defaults},actual:{...(old.actual||{})},lastChange:old.lastChange||'',updatedAt:new Date().toISOString()};
      }
    }catch{}
  }
  data.defaults={...DEFAULTS,...(data.defaults||{})};
  data.days=data.days||{};
  return data;
}
let data=load();
function ensureToday(){const k=dayKey();if(!data.days[k])data.days[k]=newDay(data.defaults);return data.days[k]}
function save(){localStorage.setItem(STORE,JSON.stringify(data))}
function today(){return ensureToday()}
function touch(day){day.updatedAt=new Date().toISOString();save()}
ensureToday();save();

function feedAroundNaps(prev,target,naps){
  let t=clamp(target,prev+FEED_MIN,prev+FEED_MAX),note='';
  for(const nap of naps){
    if(t>nap.start&&t<nap.end){
      if(nap.end-prev<=FEED_MAX){t=nap.end;note=`moved to after ${nap.name}`}
      else if(nap.start-prev>=FEED_MIN){t=Math.max(prev+FEED_MIN,nap.start-10);note=`moved before ${nap.name}`}
      else {t=nap.end;note=`overlaps ${nap.name}`}
    }
  }
  return {time:t,note};
}
function compute(day){
  const a={wake:toMin(day.anchors.wake),feed:toMin(day.anchors.feed),bed:toMin(day.anchors.bed),dream:toMin(day.anchors.dream)};
  const wake=actualMin(day,'wake')??a.wake;
  const feed1=actualMin(day,'feed1')??Math.max(a.feed,wake+15);
  const nap1s=actualMin(day,'nap1s')??wake+WAKE;
  const nap1e=actualMin(day,'nap1e')??nap1s+90;
  const nap1={name:'Nap 1',start:nap1s,end:Math.max(nap1e,nap1s+10)};
  const f2auto=feedAroundNaps(feed1,feed1+FEED_TARGET,[nap1]);
  const feed2=actualMin(day,'feed2')??f2auto.time;
  const nap2s=actualMin(day,'nap2s')??nap1.end+WAKE;
  const nap2e=actualMin(day,'nap2e')??nap2s+90;
  const nap2={name:'Nap 2',start:nap2s,end:Math.max(nap2e,nap2s+10)};
  const f3auto=feedAroundNaps(feed2,feed2+FEED_TARGET,[nap2]);
  const feed3=actualMin(day,'feed3')??f3auto.time;
  const firstTwo=(nap1.end-nap1.start)+(nap2.end-nap2.start);
  const remaining=Math.max(0,DAY_NAP_MAX-firstTwo);
  let nap3Target=Math.min(firstTwo>=150?30:45,remaining);
  if(nap3Target<=0)nap3Target=15;
  const nap3s=actualMin(day,'nap3s')??nap2.end+WAKE;
  if(!has(day,'nap3e')){const latestEnd=BED_MAX-WAKE;if(nap3s+nap3Target>latestEnd)nap3Target=Math.max(10,latestEnd-nap3s)}
  const nap3e=actualMin(day,'nap3e')??nap3s+nap3Target;
  const nap3={name:'Nap 3',start:nap3s,end:Math.max(nap3e,nap3s+5)};
  const f4auto=feedAroundNaps(feed3,feed3+FEED_TARGET,[nap3]);
  const feed4=actualMin(day,'feed4')??f4auto.time;
  const bedAuto=clamp(Math.max(a.bed,nap3.end+WAKE),BED_MIN,BED_MAX);
  const bed=actualMin(day,'bed')??bedAuto;
  const dream=actualMin(day,'dream')??clamp(a.dream,DREAM_MIN,DREAM_MAX);
  const feeds=[feed1,feed2,feed3,feed4];
  const gaps=feeds.slice(1).map((f,i)=>f-feeds[i]);
  const wakeWindows=[nap1.start-wake,nap2.start-nap1.end,nap3.start-nap2.end,bed-nap3.end];
  const totalNap=(nap1.end-nap1.start)+(nap2.end-nap2.start)+(nap3.end-nap3.start);
  return {wake,feed1,feed2,feed3,feed4,nap1,nap2,nap3,bed,dream,feeds,gaps,wakeWindows,totalNap,notes:{feed2:f2auto.note,feed3:f3auto.note,feed4:f4auto.note}};
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
  if(d.single)return has(day,d.single)?'actual':Object.keys(day.actual).length?'updated':'planned';
  const s=has(day,d.start),e=has(day,d.end);if(s&&e)return'actual';if(s||e)return'partial';return Object.keys(day.actual).length?'updated':'planned';
}
function subtitle(d,c){
  if(d.id==='wake')return `Nap 1 around ${fmt(c.nap1.start)}`;
  if(d.id==='feed1')return `Ideal first feed around ${fmt(c.feed1)}`;
  if(d.id==='feed2')return `${dur(c.feed2-c.feed1)} after Feed 1${c.notes.feed2?` · ${c.notes.feed2}`:''}`;
  if(d.id==='feed3')return `${dur(c.feed3-c.feed2)} after Feed 2${c.notes.feed3?` · ${c.notes.feed3}`:''}`;
  if(d.id==='feed4')return `${dur(c.feed4-c.feed3)} after Feed 3${c.notes.feed4?` · ${c.notes.feed4}`:''}`;
  if(d.id==='nap1')return `${dur(c.nap1.start-c.wake)} wake window · ${dur(c.nap1.end-c.nap1.start)} nap`;
  if(d.id==='nap2')return `${dur(c.nap2.start-c.nap1.end)} wake window · ${dur(c.nap2.end-c.nap2.start)} nap`;
  if(d.id==='nap3')return `${dur(c.nap3.start-c.nap2.end)} wake window · ${dur(c.nap3.end-c.nap3.start)} nap`;
  if(d.id==='bed')return `Target 6:30–7:00 PM · ${dur(c.bed-c.nap3.end)} final wake window`;
  if(d.id==='dream')return `Target 9:30–11:00 PM`;
  return '';
}
function whenText(d,c){if(d.single)return fmt(c[d.single]);const n=c[d.obj];return `${fmt(n.start)}–${fmt(n.end)}`}
function timeline(day,c){
  return defs.map(d=>{const st=statusFor(day,d);const label=st==='actual'?'ACTUAL':st==='partial'?'PARTIAL':st==='updated'?'UPDATED':'PLANNED';return `<button class="row ${d.kind}" data-edit="${d.id}"><span class="rowTime">${whenText(d,c)}</span><span class="rowIcon">${d.icon}</span><span class="rowText"><b>${d.title}</b><span>${subtitle(d,c)}</span></span><span class="status ${st}">${label}</span></button>`}).join('')
}
function chronology(day,c){
  return [
    {key:'wake',label:'Wake up',icon:'☀️',time:c.wake},
    {key:'feed1',label:'Feed 1',icon:'🍼',time:c.feed1},
    {key:'nap1s',label:'Nap 1 starts',icon:'😴',time:c.nap1.start},
    {key:'nap1e',label:'Nap 1 ends',icon:'☀️',time:c.nap1.end},
    {key:'feed2',label:'Feed 2',icon:'🍼',time:c.feed2},
    {key:'nap2s',label:'Nap 2 starts',icon:'😴',time:c.nap2.start},
    {key:'nap2e',label:'Nap 2 ends',icon:'☀️',time:c.nap2.end},
    {key:'feed3',label:'Feed 3',icon:'🍼',time:c.feed3},
    {key:'nap3s',label:'Nap 3 starts',icon:'😴',time:c.nap3.start},
    {key:'nap3e',label:'Nap 3 ends',icon:'☀️',time:c.nap3.end},
    {key:'feed4',label:'Feed 4',icon:'🍼',time:c.feed4},
    {key:'bed',label:'Bedtime',icon:'🌙',time:c.bed},
    {key:'dream',label:'Dream feed',icon:'✨',time:c.dream}
  ].sort((a,b)=>a.time-b.time)
}
function nextEvent(day,c){
  const pending=chronology(day,c).filter(e=>!has(day,e.key));
  if(!pending.length)return null;
  const now=nowMin();
  return pending.find(e=>e.time>=now-20)||pending.find(e=>e.time>=now-90)||[...pending].sort((a,b)=>Math.abs(a.time-now)-Math.abs(b.time-now))[0];
}
function logActual(key,label){const d=today();d.actual[key]=toTime(nowMin());d.lastChange=`${label} logged at ${fmt(nowMin())}. The rest of today was recalculated.`;touch(d);renderAll()}
function hero(day,c){
  const n=nextEvent(day,c);const btn=$('#heroAction');
  if(!n){$('#nextLabel').textContent='TODAY';$('#nextTitle').textContent='All caught up';$('#nextTime').textContent='✓';$('#nextIcon').textContent='♡';$('#nextMeta').textContent='Everything in today’s plan has been logged.';btn.classList.add('hidden');return}
  btn.classList.remove('hidden');$('#nextLabel').textContent=n.time<nowMin()?'CHECK IN':'NEXT UP';$('#nextTitle').textContent=n.label;$('#nextTime').textContent=fmt(n.time);$('#nextIcon').textContent=n.icon;
  const delta=n.time-nowMin();$('#nextMeta').textContent=delta>5?`In about ${dur(delta)}. Tap below when it actually happens.`:delta>=-20?'Right around now. Log the real time and everything after it adjusts.':`Planned ${dur(Math.abs(delta))} ago. Log it now if it just happened, or tap the schedule row to correct it.`;
  btn.textContent=`Log ${n.label.toLowerCase()} now`;btn.dataset.key=n.key;btn.dataset.label=n.label;
}
function check(c){
  let msg='Everything currently fits the routine.';let cls='';
  const feedBad=c.gaps.some(g=>g<FEED_MIN||g>FEED_MAX),wakeBad=c.wakeWindows.some(w=>Math.abs(w-WAKE)>25);
  if(c.totalNap>DAY_NAP_MAX){msg=`Daytime naps total ${dur(c.totalNap)}, above the 4-hour max.`;cls='bad'}
  else if(feedBad||wakeBad||c.bed<BED_MIN||c.bed>BED_MAX){msg='A few times are outside the usual routine. That’s okay — the plan is adapting around the actual day.';cls='warn'}
  $('#scheduleCheck').innerHTML=`<div class="checkMsg ${cls}">${msg}</div>`
}
function renderToday(){
  const d=today(),c=compute(d);$('#dateText').textContent=new Date().toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});$('#anchorWake').value=d.anchors.wake;$('#anchorFeed').value=d.anchors.feed;$('#anchorBed').value=d.anchors.bed;$('#anchorDream').value=d.anchors.dream;$('#timeline').innerHTML=timeline(d,c);hero(d,c);check(c);
  const note=$('#updateNote');if(d.lastChange){note.textContent=d.lastChange;note.classList.remove('hidden')}else note.classList.add('hidden');
  const running=[1,2,3].find(i=>has(d,`nap${i}s`)&&!has(d,`nap${i}e`));$('#wakeNowLabel').textContent=running?`Woke from Nap ${running}`:has(d,'wake')?'Woke up':'Morning wake';$('#wakeNowSub').textContent=running?'End the running nap':has(d,'wake')?'Log a wake time':'Start today';
  const nextNap=[1,2,3].find(i=>!has(d,`nap${i}s`));$('#sleepNowLabel').textContent=nextNap?`Nap ${nextNap} started`:'No nap left';$('#sleepNowSub').textContent=nextNap?'Start the next nap':'All 3 naps started';$('#sleepNowBtn').disabled=!nextNap;
}

let editing=null;
function openEdit(id){
  const d=today(),c=compute(d),def=defs.find(x=>x.id===id);editing=def;$('#editTitle').textContent=def.title;
  if(def.single){$('#editFields').innerHTML=editField(def.single,'Time',c[def.single],has(d,def.single))}
  else {const n=c[def.obj];$('#editFields').innerHTML=editField(def.start,'Start',n.start,has(d,def.start))+editField(def.end,'End',n.end,has(d,def.end))}
  $('#editDialog').showModal();
}
function editField(key,label,value,actual){return `<div class="editField"><label>${label}<input type="time" data-edit-time="${key}" value="${toTime(value)}"></label><label class="actualToggle"><input type="checkbox" data-edit-actual="${key}" ${actual?'checked':''}> Actual</label></div>`}
function saveEdit(){const d=today();$$('[data-edit-time]').forEach(inp=>{const key=inp.dataset.editTime,checked=$(`[data-edit-actual="${key}"]`).checked;if(checked&&inp.value)d.actual[key]=inp.value;else delete d.actual[key]});d.lastChange=`${editing.title} updated. Future times were recalculated.`;touch(d);renderAll()}
function clearEdit(){const d=today();if(editing.single)delete d.actual[editing.single];else{delete d.actual[editing.start];delete d.actual[editing.end]}d.lastChange=`${editing.title} returned to automatic planning.`;touch(d);$('#editDialog').close();renderAll()}

function actualCount(day){return Object.keys(day.actual||{}).filter(k=>day.actual[k]).length}
function actualNapTotal(day){let t=0,complete=0;for(let i=1;i<=3;i++){if(has(day,`nap${i}s`)&&has(day,`nap${i}e`)){const x=actualMin(day,`nap${i}e`)-actualMin(day,`nap${i}s`);if(x>0&&x<300){t+=x;complete++}}}return complete?{minutes:t,complete}:null}
function feedCount(day){return ['feed1','feed2','feed3','feed4','dream'].filter(k=>has(day,k)).length}
function historyDays(){return Object.entries(data.days).filter(([,d])=>actualCount(d)>0).sort((a,b)=>b[0].localeCompare(a[0]))}
function renderHistory(){
  const list=historyDays();if(!list.length){$('#historyList').innerHTML='<div class="emptyState"><b>No saved days yet</b>Start logging actual feeds, naps or wake times. Today will appear here automatically.</div>';return}
  $('#historyList').innerHTML=list.map(([k,d])=>{const naps=actualNapTotal(d);return `<button class="historyDay" data-history="${k}"><div class="historyTop"><b>${dateLabel(k)}</b><span>${actualCount(d)} actual logs</span></div><div class="historyMetrics"><div class="historyMetric"><small>Wake</small><strong>${has(d,'wake')?fmt(actualMin(d,'wake')):'—'}</strong></div><div class="historyMetric"><small>Feeds</small><strong>${feedCount(d)} logged</strong></div><div class="historyMetric"><small>Naps</small><strong>${naps?dur(naps.minutes):'—'}</strong></div><div class="historyMetric"><small>Bed</small><strong>${has(d,'bed')?fmt(actualMin(d,'bed')):'—'}</strong></div></div></button>`}).join('')
}
function openHistory(k){
  const d=data.days[k];$('#historyTitle').textContent=dateLabel(k);const naps=actualNapTotal(d);const rows=[];
  const labels={wake:'Wake up',feed1:'Feed 1',nap1s:'Nap 1 start',nap1e:'Nap 1 end',feed2:'Feed 2',nap2s:'Nap 2 start',nap2e:'Nap 2 end',feed3:'Feed 3',nap3s:'Nap 3 start',nap3e:'Nap 3 end',feed4:'Feed 4',bed:'Bedtime',dream:'Dream feed'};
  Object.entries(labels).forEach(([key,label])=>{if(has(d,key))rows.push(`<div class="detailRow"><b>${label}</b><span>${fmt(actualMin(d,key))}</span></div>`)});
  $('#historyDetails').innerHTML=`<div class="detailSummary"><div class="historyMetric"><small>Actual logs</small><strong>${actualCount(d)}</strong></div><div class="historyMetric"><small>Feeds</small><strong>${feedCount(d)}</strong></div><div class="historyMetric"><small>Nap sleep</small><strong>${naps?dur(naps.minutes):'—'}</strong></div></div>${rows.join('')||'<div class="emptyState">No actual events saved.</div>'}`;$('#historyDialog').showModal();
}

function avgClock(values){if(!values.length)return null;const adjusted=values.map(v=>v<240?v+1440:v);let n=adjusted.reduce((a,b)=>a+b,0)/adjusted.length;return n>=1440?n-1440:n}
function avg(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null}
function statsDays(range){const end=dayDate(dayKey()),start=new Date(end);start.setDate(start.getDate()-(range-1));return historyDays().filter(([k])=>dayDate(k)>=start&&dayDate(k)<=end).sort((a,b)=>a[0].localeCompare(b[0]))}
function actualFeedGaps(day){const vals=['feed1','feed2','feed3','feed4'].filter(k=>has(day,k)).map(k=>actualMin(day,k)).sort((a,b)=>a-b);const gaps=[];for(let i=1;i<vals.length;i++){const g=vals[i]-vals[i-1];if(g>0&&g<360)gaps.push(g)}return gaps}
function statCard(label,value,sub=''){return `<div class="statCard"><span>${label}</span><b>${value}</b>${sub?`<small>${sub}</small>`:''}</div>`}
function renderStats(){
  const range=data.statsRange||7,days=statsDays(range),wake=[],first=[],bed=[],nap=[],gaps=[];
  days.forEach(([,d])=>{if(has(d,'wake'))wake.push(actualMin(d,'wake'));if(has(d,'feed1'))first.push(actualMin(d,'feed1'));if(has(d,'bed'))bed.push(actualMin(d,'bed'));const n=actualNapTotal(d);if(n)nap.push(n.minutes);gaps.push(...actualFeedGaps(d))});
  $('#statGrid').innerHTML=statCard('Days logged',days.length,`of last ${range}`)+statCard('Avg wake',fmt(avgClock(wake)),`${wake.length} days`)+statCard('Avg first feed',fmt(avgClock(first)),`${first.length} days`)+statCard('Avg nap sleep',nap.length?dur(avg(nap)):'—',`${nap.length} complete days`)+statCard('Avg bedtime',fmt(avgClock(bed)),`${bed.length} days`)+statCard('Avg feed gap',gaps.length?dur(avg(gaps)):'—',`${gaps.length} intervals`);
  $('#bedChart').innerHTML=lineChart(days.map(([k,d])=>has(d,'bed')?{label:shortDate(k),value:actualMin(d,'bed')}:null).filter(Boolean),'time');
  $('#napChart').innerHTML=lineChart(days.map(([k,d])=>{const n=actualNapTotal(d);return n?{label:shortDate(k),value:n.minutes}:null}).filter(Boolean),'duration');
  $('#statsNote').textContent=days.length<3?'Log a few days and this page becomes much more useful. Only actual events are included in averages and trends.':'Only actual logged data is used. Missing events are ignored rather than guessed.';
  $$('#rangeTabs button').forEach(b=>b.classList.toggle('active',Number(b.dataset.days)===range));
}
function lineChart(points,type){
  if(points.length<2)return '<div class="chartEmpty">Need at least 2 logged days for a trend.</div>';
  const W=330,H=130,L=30,R=10,T=12,B=24,vals=points.map(p=>p.value),min=Math.min(...vals),max=Math.max(...vals),padY=Math.max(type==='time'?20:30,(max-min)*.18),lo=min-padY,hi=max+padY;
  const x=i=>L+(W-L-R)*(points.length===1?0:i/(points.length-1)),y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo||1));
  const path=points.map((p,i)=>`${i?'L':'M'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');const label=v=>type==='time'?fmt(v):dur(v);
  const mids=[lo,(lo+hi)/2,hi];
  return `<svg class="chartSvg" viewBox="0 0 ${W} ${H}" role="img"><g>${mids.map(v=>`<line class="chartGuide" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"></line><text class="chartAxis" x="0" y="${y(v)+3}">${label(v)}</text>`).join('')}</g><path class="chartLine" style="color:var(--sageDark)" d="${path}"></path>${points.map((p,i)=>`<circle class="chartDot" style="color:var(--sageDark)" cx="${x(i)}" cy="${y(p.value)}" r="3.5"></circle>`).join('')}<text class="chartAxis" x="${L}" y="${H-4}">${points[0].label}</text><text class="chartAxis" text-anchor="end" x="${W-R}" y="${H-4}">${points[points.length-1].label}</text></svg>`
}

function exportData(){
  const payload={app:'Baby Day',exportedAt:new Date().toISOString(),version:3,defaults:data.defaults,days:data.days};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`stella-baby-day-backup-${dayKey()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)
}
async function importData(file){
  try{const parsed=JSON.parse(await file.text());if(!parsed||parsed.version!==3||!parsed.days)throw new Error('Invalid backup');data.defaults={...data.defaults,...(parsed.defaults||{})};data.days={...data.days,...parsed.days};ensureToday();save();renderAll();alert('Backup imported. Existing days were kept; matching dates were replaced by the backup.')}catch{alert('That file does not look like a Baby Day backup.')}
}

function switchTab(tab){data.lastTab=tab;save();$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$$('.view').forEach(v=>v.classList.remove('active'));$(`#${tab}View`).classList.add('active');if(tab==='history')renderHistory();if(tab==='stats')renderStats();window.scrollTo({top:0,behavior:'smooth'})}
function renderAll(){renderToday();renderHistory();renderStats()}

$('#heroAction').addEventListener('click',e=>logActual(e.currentTarget.dataset.key,e.currentTarget.dataset.label));
$('#feedNowBtn').addEventListener('click',()=>{const d=today(),c=compute(d),now=nowMin();const keys=['feed1','feed2','feed3','feed4'].filter(k=>!has(d,k));if(!keys.length)return;const key=keys.sort((a,b)=>Math.abs(c[a]-now)-Math.abs(c[b]-now))[0];logActual(key,key.replace('feed','Feed '))});
$('#sleepNowBtn').addEventListener('click',()=>{const d=today(),i=[1,2,3].find(n=>!has(d,`nap${n}s`));if(i)logActual(`nap${i}s`,`Nap ${i} started`)});
$('#wakeNowBtn').addEventListener('click',()=>{const d=today(),running=[1,2,3].find(i=>has(d,`nap${i}s`)&&!has(d,`nap${i}e`));if(running)logActual(`nap${running}e`,`Nap ${running} ended`);else logActual('wake','Wake up')});
$('#timeline').addEventListener('click',e=>{const row=e.target.closest('[data-edit]');if(row)openEdit(row.dataset.edit)});
$('#editForm').addEventListener('submit',e=>{e.preventDefault();saveEdit();$('#editDialog').close()});$('#clearEditBtn').addEventListener('click',clearEdit);
$('#resetBtn').addEventListener('click',()=>$('#resetDialog').showModal());$('#cancelReset').addEventListener('click',()=>$('#resetDialog').close());$('#confirmReset').addEventListener('click',()=>{const d=today();d.actual={};d.lastChange='';touch(d);$('#resetDialog').close();renderAll()});
[['anchorWake','wake'],['anchorFeed','feed'],['anchorBed','bed'],['anchorDream','dream']].forEach(([id,key])=>$('#'+id).addEventListener('change',e=>{const d=today();d.anchors[key]=e.target.value;data.defaults[key]=e.target.value;d.lastChange='Schedule anchors updated.';touch(d);renderAll()}));
$$('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
$('#historyList').addEventListener('click',e=>{const b=e.target.closest('[data-history]');if(b)openHistory(b.dataset.history)});$('#closeHistory').addEventListener('click',()=>$('#historyDialog').close());
$('#rangeTabs').addEventListener('click',e=>{const b=e.target.closest('[data-days]');if(!b)return;data.statsRange=Number(b.dataset.days);save();renderStats()});
$('#exportBtn').addEventListener('click',exportData);$('#historyExportBtn').addEventListener('click',exportData);$('#importBtn').addEventListener('click',()=>$('#importFile').click());$('#importFile').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(f)importData(f);e.target.value='' });

renderAll();switchTab(['today','history','stats'].includes(data.lastTab)?data.lastTab:'today');
})();
