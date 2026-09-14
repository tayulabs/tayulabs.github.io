(() => {
  'use strict';

  const CUSTOM=new Set(['tank','liquid','gauge','gauge_semi','kpi']);
  const TYPE_OPTIONS=[
    ['tank','Tanque animado'],
    ['liquid','Liquid fill circle'],
    ['gauge','Gauge circular'],
    ['gauge_semi','Gauge semicircular'],
    ['kpi','KPI + mini tendencia']
  ];
  const remembered=new Map();

  function selectionKey(){
    const device=document.getElementById('mbChartDevice')?.value||'';
    const variable=document.getElementById('mbChartVariable')?.value||'';
    return device&&variable?`${device}|${variable}`:'';
  }

  function ensureOptions(){
    const select=document.getElementById('mbChartType');
    if(!select)return null;
    TYPE_OPTIONS.forEach(([value,label])=>{
      if(select.querySelector(`option[value="${value}"]`))return;
      const option=document.createElement('option');
      option.value=value;
      option.textContent=label;
      select.appendChild(option);
    });
    return select;
  }

  function installStyle(){
    if(document.getElementById('tayuAdvancedVisualStableStyle'))return;
    const style=document.createElement('style');
    style.id='tayuAdvancedVisualStableStyle';
    style.textContent='.tayu-av-preview-locked #mbPreviewChart{display:none!important}.tayu-av-preview-locked .tayu-av-host[data-av-preview]{display:flex!important}';
    document.head.appendChild(style);
  }

  function previewBox(){
    return document.getElementById('mbPreviewChart')?.parentElement||null;
  }

  function lockPreview(type){
    const box=previewBox();
    const canvas=document.getElementById('mbPreviewChart');
    if(!box||!canvas)return;
    const custom=CUSTOM.has(type);
    box.classList.toggle('tayu-av-preview-locked',custom);
    if(custom)canvas.style.setProperty('display','none','important');
    else canvas.style.removeProperty('display');
  }

  function rememberCurrent(){
    const select=ensureOptions();
    const key=selectionKey();
    if(!select||!key)return;
    remembered.set(key,String(select.value||'line'));
    lockPreview(select.value);
  }

  function restore(){
    const select=ensureOptions();
    const key=selectionKey();
    if(!select||!key)return;
    const wanted=remembered.get(key);
    if(wanted&&select.querySelector(`option[value="${wanted}"]`))select.value=wanted;
    lockPreview(wanted||select.value);
  }

  function wrapFormLoader(){
    const original=window.loadMbChartFormFromSelection;
    if(typeof original!=='function'||original.__tayuVisualStable2)return;
    const wrapped=function(...args){
      const key=selectionKey();
      const wanted=key?remembered.get(key):null;
      if(wanted)lockPreview(wanted);
      const result=original.apply(this,args);
      if(wanted){
        const select=ensureOptions();
        if(select?.querySelector(`option[value="${wanted}"]`))select.value=wanted;
        lockPreview(wanted);
      }
      return result;
    };
    wrapped.__tayuVisualStable2=true;
    window.loadMbChartFormFromSelection=wrapped;
  }

  function wrapPreview(){
    const original=window.updateMbPreview;
    if(typeof original!=='function'||original.__tayuVisualStable2)return;
    const wrapped=function(...args){
      const select=ensureOptions();
      const key=selectionKey();
      const wanted=(key&&remembered.get(key))||select?.value||'line';
      if(CUSTOM.has(wanted)){
        lockPreview(wanted);
        if(select?.querySelector(`option[value="${wanted}"]`))select.value=wanted;
      }
      const result=original.apply(this,args);
      if(CUSTOM.has(wanted)){
        if(select?.querySelector(`option[value="${wanted}"]`))select.value=wanted;
        lockPreview(wanted);
        Promise.resolve(result).finally(()=>{
          const current=ensureOptions();
          if(current?.querySelector(`option[value="${wanted}"]`))current.value=wanted;
          lockPreview(wanted);
        });
      }
      return result;
    };
    wrapped.__tayuVisualStable2=true;
    window.updateMbPreview=wrapped;
  }

  function wrapVariableRefresh(){
    const original=window.refreshMbVariables;
    if(typeof original!=='function'||original.__tayuVisualStable2)return;
    const wrapped=function(...args){
      const key=selectionKey();
      const wanted=key?remembered.get(key):null;
      if(wanted)lockPreview(wanted);
      const result=original.apply(this,args);
      restore();
      return result;
    };
    wrapped.__tayuVisualStable2=true;
    window.refreshMbVariables=wrapped;
  }

  function install(){
    installStyle();
    ensureOptions();
    wrapFormLoader();
    wrapPreview();
    wrapVariableRefresh();

    document.addEventListener('change',event=>{
      const id=event.target?.id||'';
      if(id==='mbChartType')rememberCurrent();
      if(id==='mbChartDevice'||id==='mbChartVariable'){
        setTimeout(restore,0);
        setTimeout(restore,120);
      }
    },true);

    document.addEventListener('click',event=>{
      if(event.target?.closest?.('.nav button[data-view="modbus"]')){
        setTimeout(restore,80);
        setTimeout(restore,240);
      }
    },true);

    setInterval(()=>{
      if(document.getElementById('modbus')?.classList.contains('active'))restore();
    },250);

    setTimeout(restore,80);
    setTimeout(restore,300);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
