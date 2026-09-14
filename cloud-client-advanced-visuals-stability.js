(() => {
  'use strict';

  const TYPE_OPTIONS = [
    ['tank','Tanque animado'],
    ['liquid','Liquid fill circle'],
    ['gauge','Gauge circular'],
    ['gauge_semi','Gauge semicircular'],
    ['kpi','KPI + mini tendencia']
  ];
  const remembered = new Map();
  let repairing = false;

  function selectionKey(){
    const device=document.getElementById('mbChartDevice')?.value||'';
    const variable=document.getElementById('mbChartVariable')?.value||'';
    return device&&variable?`${device}|${variable}`:'';
  }

  function ensureOptions(){
    const select=document.getElementById('mbChartType');
    if(!select) return null;
    TYPE_OPTIONS.forEach(([value,label])=>{
      if(select.querySelector(`option[value="${value}"]`)) return;
      const option=document.createElement('option');
      option.value=value;
      option.textContent=label;
      select.appendChild(option);
    });
    return select;
  }

  function invokePreviewKeeping(type){
    const select=ensureOptions();
    if(!select||typeof window.updateMbPreview!=='function') return;
    select.value=type;
    let result;
    try{
      result=window.updateMbPreview();
    }catch(error){
      console.warn('Vista previa IoT:',error);
    }
    // El renderer avanzado usa temporalmente "line" para que Chart.js pueda
    // cargar el histórico. Restauramos el valor en el mismo ciclo de evento,
    // sin esperar la consulta al VPS.
    if(select.querySelector(`option[value="${type}"]`)) select.value=type;
    Promise.resolve(result).finally(()=>{
      const current=document.getElementById('mbChartType');
      const key=selectionKey();
      if(current&&remembered.get(key)===type&&current.querySelector(`option[value="${type}"]`)) current.value=type;
    });
  }

  function bindSelect(){
    const select=ensureOptions();
    if(!select||select.dataset.tayuVisualStable==='1') return false;
    select.dataset.tayuVisualStable='1';

    // Quitamos únicamente el onchange inline de este selector. Así evitamos que
    // el wrapper avanzado deje visible el valor temporal "line" mientras espera
    // el histórico.
    select.removeAttribute('onchange');
    select.addEventListener('change',event=>{
      event.stopPropagation();
      const key=selectionKey();
      const type=String(select.value||'line');
      if(key) remembered.set(key,type);
      invokePreviewKeeping(type);
    });
    return true;
  }

  function repairSelection(){
    if(repairing) return;
    repairing=true;
    try{
      bindSelect();
      const section=document.getElementById('modbus');
      if(section&&!section.classList.contains('active')) return;
      const select=ensureOptions();
      const key=selectionKey();
      if(!select||!key) return;

      const desired=remembered.get(key);
      if(!desired){
        // Si una configuración guardada ya es de tipo avanzado, la recordamos
        // para que los refrescos posteriores tampoco la devuelvan a Línea.
        if(TYPE_OPTIONS.some(([value])=>value===select.value)) remembered.set(key,select.value);
        return;
      }
      if(select.value!==desired&&select.querySelector(`option[value="${desired}"]`)){
        invokePreviewKeeping(desired);
      }
    }finally{
      repairing=false;
    }
  }

  function boot(){
    bindSelect();
    setTimeout(repairSelection,120);
    setTimeout(repairSelection,450);

    document.addEventListener('click',event=>{
      if(event.target?.closest?.('.nav button[data-view="modbus"]')) setTimeout(repairSelection,180);
    },true);

    document.addEventListener('change',event=>{
      if(['mbChartDevice','mbChartVariable'].includes(event.target?.id||'')){
        setTimeout(repairSelection,40);
        setTimeout(repairSelection,250);
      }
    },true);

    setInterval(repairSelection,500);
    window.addEventListener('pageshow',()=>setTimeout(repairSelection,160));
    window.addEventListener('tayu:client-access-ready',()=>setTimeout(repairSelection,180));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
