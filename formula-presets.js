(()=>{
  const PRESETS=[5,5.5,6,6.5,7,7.5,8];
  function apply(){
    const wrap=document.getElementById('formulaQuickAmounts');
    if(!wrap||wrap.dataset.presetPatch==='done')return;
    wrap.innerHTML=PRESETS.map(v=>`<button type="button" data-amt="${v}">${v} oz</button>`).join('');
    wrap.dataset.presetPatch='done';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);
  apply();
  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
})();
