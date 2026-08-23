(()=>{
'use strict';
const STORE='stella-baby-history-v3';
const TYPES={
  feed:{icon:'🍼',label:'Extra feed'},
  resettle:{icon:'🫶',label:'Paci / resettle'},
  wake:{icon:'☀️',label:'Woke / cry'},
  nap:{icon:'😴',label:'Extra nap / sleep'},
  bedtime:{icon:'🌙',label:'Bedtime note'},
  dream:{icon:'✨',label:'Dream feed'},
  note:{icon:'📝',label:'Note'}
};
const $=s=>document.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
const todayKey=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const nowTime=()=>{const d=new Date();return `${pad(d.getHours())}:${pad(d.getMinutes())}`};
const fmt=t=>{if(!t)return '—';const [h,m]=t.split(':').map(Number);return new Date(2000,0,1,h,m).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})};
const dateLabel=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'})};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nativeSet=Storage.prototype.setItem.bind(localStorage);
const nativeGet=Storage.prototype.getItem.bind(localStorage);

function readStore(){try{return JSON.parse(nativeGet(STORE)||'{}')}catch{return {}}}
function normalize(store){store=store&&typeof store==='object'?store:{};store.days=store.days||{};return store}
function manualFor(day){return Array.isArray(day?.manualEntries)?day.manualEntries:[]}
function dayHasManual(day){return manualFor(day).length>0}

// The main app keeps its own in-memory copy. Preserve manual entries whenever it saves.
const originalSetItem=Storage.prototype.setItem;
Storage.prototype.setItem=function(key,value){
  if(this===localStorage&&key===STORE){
    try{
      const incoming=normalize(JSON.parse(value)),existing=normalize(JSON.parse(nativeGet(STORE)||'{}'));
      Object.entries(existing.days).forEach(([k,d])=>{
        const extras=manualFor(d);
        if(!extras.length)return;
        if(!incoming.days[k])incoming.days[k]=d;
        else incoming.days[k].manualEntries=extras;
      });
      value=JSON.stringify(incoming);
    }catch{}
  }
  return originalSetItem.call(this,key,value);
};

function writeStore(store){nativeSet(STORE,JSON.stringify(normalize(store)))}
function getDay(store,key,create=false){store=normalize(store);if(!store.days[key]&&create)store.days[key]={anchors:{},actual:{},resettles:[],lastChange:'',updatedAt:new Date().toISOString()};return store.days[key]}
function allManual(store){return Object.entries(normalize(store).days).flatMap(([date,day])=>manualFor(day).map(e=>({...e,date:e.date||date})))}

function addStyles(){
  const s=document.createElement('style');s.id='manual-entry-styles';s.textContent=`
  .manualAddBtn{width:100%;margin-top:9px;border:1px dashed #d8d0c7;border-radius:14px;background:#fffefa80;padding:11px;font-weight:900;color:var(--muted)}
  .manualHint{margin:6px 2px 0;color:var(--muted);font-size:.67rem;line-height:1.4}
  .manualExtras{padding:13px 14px;margin-top:5px}.manualExtras.hidden{display:none!important}.manualExtrasHead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:3px}.manualExtrasHead b{font-size:.9rem}.manualEntryRow{width:100%;border:0;background:transparent;border-top:1px solid var(--line);padding:10px 0;display:grid;grid-template-columns:66px 30px minmax(0,1fr) auto;gap:8px;align-items:center;text-align:left;color:var(--ink)}.manualEntryRow:first-of-type{border-top:0}.manualEntryRow .mt{font-weight:950;font-size:.86rem}.manualEntryRow .mi{font-size:1rem}.manualEntryRow .mx b{display:block;font-size:.78rem}.manualEntryRow .mx small{display:block;color:var(--muted);font-size:.65rem;margin-top:2px;line-height:1.3}
  .manualDialogGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px}.manualField{display:block;font-size:.7rem;font-weight:900;color:var(--muted)}.manualField.full{grid-column:1/-1}.manualField input,.manualField select,.manualField textarea{display:block;width:100%;margin-top:5px;border:1px solid var(--line);border-radius:11px;padding:9px;background:white;color:var(--ink);font:inherit;font-weight:850}.manualField textarea{min-height:72px;resize:vertical;font-weight:700}.manualInfo{background:var(--blueSoft);color:var(--blue);border-radius:12px;padding:9px 10px;font-size:.69rem;line-height:1.4;margin-top:11px}.manualDelete{background:var(--redSoft)!important;color:var(--red)!important}.manualMetric{background:#fff7e8!important}.manualHistorySection{margin-top:12px;padding-top:8px;border-top:1px solid var(--line)}.manualHistorySection>div:first-child{margin-bottom:5px}
  @media(max-width:390px){.manualEntryRow{grid-template-columns:60px 28px minmax(0,1fr) auto;gap:6px}}
  `;document.head.appendChild(s);
}

function injectUI(){
  if($('#manualEntryBtn'))return;
  const quick=$('.quickSection');if(!quick)return;
  const btn=document.createElement('button');btn.id='manualEntryBtn';btn.className='manualAddBtn';btn.textContent='＋ Add a past / extra entry';
  const hint=document.createElement('p');hint.className='manualHint';hint.textContent='For anything outside the plan — like a 4:00 AM feed. It saves to history without pretending it was Feed 1.';
  const note=$('#updateNote');quick.insertBefore(btn,note||null);quick.insertBefore(hint,note||null);
  const extras=document.createElement('section');extras.id='manualExtras';extras.className='card manualExtras hidden';quick.insertAdjacentElement('afterend',extras);
  btn.addEventListener('click',()=>openDialog());extras.addEventListener('click',e=>{const r=e.target.closest('[data-manual-id]');if(r)openDialog(r.dataset.manualId)});

  const dlg=document.createElement('dialog');dlg.id='manualEntryDialog';dlg.innerHTML=`<form method="dialog" class="dialogCard" id="manualEntryForm"><div class="dialogHead"><div><div class="eyebrow">Outside the schedule</div><h3 id="manualEntryTitle">Add manual entry</h3></div><button class="closeButton" value="cancel" aria-label="Close">×</button></div><div class="manualInfo">Use this for extra events that happened but should not replace a scheduled item — for example, a 4:00 AM feed. Manual entries do not move the automatic plan.</div><div class="manualDialogGrid"><label class="manualField">Type<select id="manualEntryType"><option value="feed">Extra feed</option><option value="resettle">Paci / resettle</option><option value="wake">Woke / cry</option><option value="nap">Extra nap / sleep</option><option value="bedtime">Bedtime note</option><option value="dream">Dream feed</option><option value="note">Note</option></select></label><label class="manualField">Time<input type="time" id="manualEntryTime" required></label><label class="manualField">Date<input type="date" id="manualEntryDate" required></label><label class="manualField full">Note (optional)<textarea id="manualEntryNote" placeholder="e.g. Woke hungry, took 4 oz and went back down"></textarea></label></div><div class="dialogActions"><button type="button" class="secondary manualDelete hidden" id="manualEntryDelete">Delete</button><button type="submit" class="primary">Save entry</button></div></form>`;
  document.body.appendChild(dlg);$('#manualEntryForm').addEventListener('submit',e=>{e.preventDefault();saveDialog();dlg.close()});$('#manualEntryDelete').addEventListener('click',deleteEditing);
}

let editingId=null;
function findEntry(id){const store=readStore();for(const [date,day] of Object.entries(store.days||{})){const e=manualFor(day).find(x=>x.id===id);if(e)return {store,date,day,e}}return null}
function openDialog(id=null){
  editingId=id;const found=id?findEntry(id):null;const e=found?.e;
  $('#manualEntryTitle').textContent=e?'Edit manual entry':'Add manual entry';$('#manualEntryType').value=e?.type||'feed';$('#manualEntryTime').value=e?.time||nowTime();$('#manualEntryDate').value=found?.date||todayKey();$('#manualEntryNote').value=e?.note||'';$('#manualEntryDelete').classList.toggle('hidden',!e);$('#manualEntryDialog').showModal();
}
function saveDialog(){
  const date=$('#manualEntryDate').value||todayKey(),time=$('#manualEntryTime').value,type=$('#manualEntryType').value,note=$('#manualEntryNote').value.trim();if(!time)return;
  const store=readStore();
  if(editingId){for(const day of Object.values(store.days||{})){day.manualEntries=manualFor(day).filter(x=>x.id!==editingId)}}
  const day=getDay(store,date,true);day.manualEntries=manualFor(day);day.manualEntries.push({id:editingId||`m_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,type,time,note,date,createdAt:new Date().toISOString()});day.updatedAt=new Date().toISOString();writeStore(store);editingId=null;renderAllManual();
}
function deleteEditing(){if(!editingId)return;const store=readStore();for(const day of Object.values(store.days||{}))day.manualEntries=manualFor(day).filter(x=>x.id!==editingId);writeStore(store);editingId=null;$('#manualEntryDialog').close();renderAllManual()}

function renderTodayManual(){
  const box=$('#manualExtras');if(!box)return;const day=getDay(readStore(),todayKey(),false),items=manualFor(day).slice().sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  if(!items.length){box.classList.add('hidden');box.innerHTML='';return}box.classList.remove('hidden');box.innerHTML=`<div class="manualExtrasHead"><div><div class="eyebrow">Extra log</div><b>Outside the schedule</b></div><button class="secondary compact" id="manualExtraAdd">+ Add</button></div>${items.map(e=>{const t=TYPES[e.type]||TYPES.note;return `<button class="manualEntryRow" data-manual-id="${esc(e.id)}"><span class="mt">${fmt(e.time)}</span><span class="mi">${t.icon}</span><span class="mx"><b>${esc(t.label)}</b>${e.note?`<small>${esc(e.note)}</small>`:''}</span><span class="status actual">LOGGED</span></button>`}).join('')}`;$('#manualExtraAdd')?.addEventListener('click',()=>openDialog());
}

let decoratingHistory=false;
function decorateHistoryList(){
  if(decoratingHistory)return;const list=$('#historyList');if(!list)return;decoratingHistory=true;
  try{
    const store=readStore(),manualDates=Object.entries(store.days||{}).filter(([,d])=>dayHasManual(d));
    list.querySelectorAll('[data-history]').forEach(card=>{
      const date=card.dataset.history,items=manualFor(store.days?.[date]);if(!items.length)return;
      const top=card.querySelector('.historyTop span');if(top&&!top.dataset.manualDecorated){top.textContent+=` · ${items.length} extra${items.length===1?'':'s'}`;top.dataset.manualDecorated='1'}
      const metrics=card.querySelector('.historyMetrics');if(metrics&&!metrics.querySelector('.manualMetric')){const feeds=items.filter(e=>e.type==='feed').length;metrics.insertAdjacentHTML('beforeend',`<div class="historyMetric manualMetric"><small>Extra</small><strong>${feeds?`${feeds} feed${feeds===1?'':'s'}`:`${items.length} log${items.length===1?'':'s'}`}</strong></div>`)}
    });
    const shown=new Set([...list.querySelectorAll('[data-history],[data-manual-history]')].map(x=>x.dataset.history||x.dataset.manualHistory));
    manualDates.filter(([date])=>!shown.has(date)).forEach(([date,day])=>{const items=manualFor(day),feeds=items.filter(e=>e.type==='feed').length;const b=document.createElement('button');b.className='historyDay';b.dataset.manualHistory=date;b.innerHTML=`<div class="historyTop"><b>${dateLabel(date)}</b><span>${items.length} manual log${items.length===1?'':'s'}</span></div><div class="historyMetrics"><div class="historyMetric manualMetric"><small>Extra feeds</small><strong>${feeds}</strong></div><div class="historyMetric"><small>Manual</small><strong>${items.length}</strong></div></div>`;list.appendChild(b)});
  }finally{decoratingHistory=false}
}
function appendManualToHistoryDialog(date){
  const store=readStore(),items=manualFor(store.days?.[date]).slice().sort((a,b)=>(a.time||'').localeCompare(b.time||''));if(!items.length)return;const details=$('#historyDetails');if(!details||details.querySelector('.manualHistorySection'))return;details.insertAdjacentHTML('beforeend',`<div class="manualHistorySection"><div><div class="eyebrow">Extra / manual entries</div></div>${items.map(e=>{const t=TYPES[e.type]||TYPES.note;return `<div class="detailRow"><span>${t.icon} ${esc(t.label)}${e.note?` · ${esc(e.note)}`:''}</span><b>${fmt(e.time)}</b></div>`}).join('')}</div>`)
}
function openManualHistory(date){const store=readStore(),items=manualFor(store.days?.[date]).slice().sort((a,b)=>(a.time||'').localeCompare(b.time||''));$('#historyTitle').textContent=dateLabel(date);$('#historyDetails').innerHTML=`<div class="manualHistorySection"><div><div class="eyebrow">Manual-only day</div></div>${items.map(e=>{const t=TYPES[e.type]||TYPES.note;return `<div class="detailRow"><span>${t.icon} ${esc(t.label)}${e.note?` · ${esc(e.note)}`:''}</span><b>${fmt(e.time)}</b></div>`}).join('')}</div>`;$('#historyDialog').showModal()}

function decorateStats(){
  const grid=$('#statGrid');if(!grid)return;const days=Number($('#rangeTabs button.active')?.dataset.days||7),cut=new Date();cut.setHours(0,0,0,0);cut.setDate(cut.getDate()-(days-1));const items=allManual(readStore()).filter(e=>{const [y,m,d]=e.date.split('-').map(Number);return new Date(y,m-1,d)>=cut}),feeds=items.filter(e=>e.type==='feed').length,key=`${days}:${feeds}:${items.length}`;
  if(grid.dataset.manualKey===key&&grid.querySelector('.manualStat'))return;
  grid.dataset.manualKey=key;grid.querySelectorAll('.manualStat').forEach(x=>x.remove());grid.insertAdjacentHTML('beforeend',`<div class="statCard manualStat"><span>Extra feeds</span><b>${feeds}</b><small>manual / off-schedule</small></div><div class="statCard manualStat"><span>Manual entries</span><b>${items.length}</b><small>last ${days} days</small></div>`)
}
function exportFullBackup(){const store=readStore(),blob=new Blob([JSON.stringify(store,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`stella-baby-day-backup-${todayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function renderAllManual(){renderTodayManual();decorateHistoryList();decorateStats()}

addStyles();injectUI();renderAllManual();
const histObs=new MutationObserver(()=>setTimeout(decorateHistoryList,0));if($('#historyList'))histObs.observe($('#historyList'),{childList:true,subtree:true});
const statObs=new MutationObserver(()=>setTimeout(decorateStats,0));if($('#statGrid'))statObs.observe($('#statGrid'),{childList:true,subtree:true});
document.addEventListener('click',e=>{
  const mh=e.target.closest('[data-manual-history]');if(mh){e.preventDefault();openManualHistory(mh.dataset.manualHistory);return}
  const h=e.target.closest('[data-history]');if(h)setTimeout(()=>appendManualToHistoryDialog(h.dataset.history),0);
  if(e.target.closest('#rangeTabs,.tab[data-tab="stats"]'))setTimeout(decorateStats,0);
},true);
// Export from localStorage so recently-added manual entries are included even before a reload.
document.addEventListener('click',e=>{if(e.target.closest('#exportBtn,#historyExportBtn')){e.preventDefault();e.stopImmediatePropagation();exportFullBackup()}},true);
})();
