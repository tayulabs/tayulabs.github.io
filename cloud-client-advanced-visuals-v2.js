(() => {
  'use strict';

  const CUSTOM_TYPES=new Set(['tank','liquid','gauge','gauge_semi','kpi']);
  const TYPE_OPTIONS=[
    ['tank','Tanque animado'],
    ['liquid','Liquid fill circle'],
    ['gauge','Gauge circular'],
    ['gauge_semi','Gauge semicircular'],
    ['kpi','KPI + mini tendencia']
  ];
  const selectedByKey=new Map();
  let basePreview=null;
  let baseAdd=null;
  let dashboardObserver=null;

  function key(){
    const d=document.getElementById('mbChartDevice')?.value||'';
    const v=document.getElementById('mbChartVariable')?.value||'';
    return d&&v?`${d}|${v}`:'';
  }
  function isCustom(type){return CUSTOM_TYPES.has(String(type||''));}
  function ensureOptions(){
    const select=document.getElementById('mbChartType');
    if(!select)return null;
    TYPE_OPTIONS.forEach(([value,label])=>{
      if(select.querySelector(`option[value="${value}"]`))return;
      const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option);
    });
    return select;
  }
  function selection(){
    try{return typeof currentMbChartSelection==='function'?currentMbChartSelection():{d:null,v:null};}catch(_){return {d:null,v:null};}
  }
  function form(){
    try{return typeof currentMbChartFormConfig==='function'?currentMbChartFormConfig():null;}catch(_){return null;}
  }
  function cfgMap(){try{return typeof modbusChartConfigs!=='undefined'?modbusChartConfigs:null;}catch(_){return null;}}
  function deviceList(){try{return typeof modbusDevices!=='undefined'?modbusDevices:[];}catch(_){return [];}}
  function history(d,v){
    try{return typeof mbHistory==='function'?(mbHistory(d,v)||[]):[];}catch(_){return [];}
  }
  function latestValue(d,v){
    const h=history(d,v).map(p=>({t:p?.t instanceof Date?p.t:new Date(p?.t||0),v:Number(p?.v)})).filter(p=>Number.isFinite(p.v)&&!Number.isNaN(p.t.getTime()));
    const last=h[h.length-1];
    if(last)return last.v;
    const n=Number(v?.value);return Number.isFinite(n)?n:null;
  }
  function bounds(cfg,v,value){
    const parse=x=>x===''||x===null||x===undefined?null:Number(x);
    let min=parse(cfg?.min),max=parse(cfg?.max);
    if(!Number.isFinite(min))min=Number(v?.min);
    if(!Number.isFinite(max))max=Number(v?.max);
    if(!Number.isFinite(min))min=0;
    if(!Number.isFinite(max))max=100;
    if(max<=min){const c=Number.isFinite(value)?value:min;min=c-1;max=c+1;}
    return {min,max};
  }
  function pct(value,min,max){return Number.isFinite(value)&&max>min?Math.max(0,Math.min(100,(value-min)*100/(max-min))):0;}
  function num(value){
    if(!Number.isFinite(value))return '—';
    const a=Math.abs(value);return value.toLocaleString('es-EC',{maximumFractionDigits:a>=100?1:a>=10?2:3});
  }
  function skeleton(type){
    if(type==='tank')return `<div class="tayu-av-shell"><div class="tayu-av-title" data-av-title></div><div class="tayu-av-tank"><div class="tayu-av-water" data-av-fill></div><div class="tayu-av-center"><div><span class="tayu-av-value" data-av-value></span><span class="tayu-av-unit" data-av-unit></span></div><div class="tayu-av-percent" data-av-percent></div></div></div><div class="tayu-av-range"><span data-av-min></span><span data-av-max></span></div></div>`;
    if(type==='liquid')return `<div class="tayu-av-shell"><div class="tayu-av-title" data-av-title></div><div class="tayu-av-liquid-circle"><div class="tayu-av-circle-water" data-av-fill></div><div class="tayu-av-center"><div><span class="tayu-av-value" data-av-value></span><span class="tayu-av-unit" data-av-unit></span></div><div class="tayu-av-percent" data-av-percent></div></div></div><div class="tayu-av-range"><span data-av-min></span><span data-av-max></span></div></div>`;
    if(type==='gauge')return `<div class="tayu-av-shell"><div class="tayu-av-title" data-av-title></div><div class="tayu-av-gauge"><svg viewBox="0 0 120 120"><circle class="tayu-av-gauge-track" cx="60" cy="60" r="47" pathLength="100"></circle><circle class="tayu-av-gauge-value" data-av-gauge cx="60" cy="60" r="47" pathLength="100" stroke-dasharray="0 100"></circle></svg><div class="tayu-av-center"><div><span class="tayu-av-value" data-av-value></span><span class="tayu-av-unit" data-av-unit></span></div><div class="tayu-av-percent" data-av-percent></div></div></div><div class="tayu-av-range"><span data-av-min></span><span data-av-max></span></div></div>`;
    if(type==='gauge_semi')return `<div class="tayu-av-shell"><div class="tayu-av-title" data-av-title></div><div class="tayu-av-semi"><svg viewBox="0 0 200 115"><path class="tayu-av-semi-track" d="M20 100 A80 80 0 0 1 180 100" pathLength="100"></path><path class="tayu-av-semi-value" data-av-gauge d="M20 100 A80 80 0 0 1 180 100" pathLength="100" stroke-dasharray="0 100"></path></svg><div class="tayu-av-semi-center"><div><span class="tayu-av-value" data-av-value></span><span class="tayu-av-unit" data-av-unit></span></div><div class="tayu-av-percent" data-av-percent></div></div></div><div class="tayu-av-range"><span data-av-min></span><span data-av-max></span></div></div>`;
    if(type==='kpi')return `<div class="tayu-av-shell"><div class="tayu-av-title" data-av-title></div><div class="tayu-av-kpi"><div class="tayu-av-kpi-main"><small>VALOR ACTUAL</small><div><strong data-av-value></strong><span class="tayu-av-unit" data-av-unit></span></div><div class="tayu-av-percent" data-av-kpi-meta></div></div><svg class="tayu-av-spark" data-av-spark viewBox="0 0 320 82" preserveAspectRatio="none"></svg></div><div class="tayu-av-range"><span data-av-min></span><span data-av-max></span></div></div>`;
    return '';
  }
  function spark(svg,h){
    if(!svg)return;
    const rows=h.map(p=>Number(p?.v)).filter(Number.isFinite).slice(-50);
    if(rows.length<2){svg.innerHTML='<text x="160" y="43" text-anchor="middle" fill="currentColor" opacity=".55" font-size="12">Esperando más muestras…</text>';return;}
    let min=Math.min(...rows),max=Math.max(...rows);if(max<=min){min-=1;max+=1;}
    const points=rows.map((v,i)=>`${(2+i*316/(rows.length-1)).toFixed(1)},${(76-(v-min)*68/(max-min)).toFixed(1)}`).join(' ');
    svg.innerHTML=`<line class="tayu-av-spark-line" x1="2" y1="78" x2="318" y2="78"></line><polyline points="${points}"></polyline>`;
  }
  function paint(host,type,cfg,d,v){
    if(!host)return;
    if(host.dataset.avType!==type){host.dataset.avType=type;host.innerHTML=skeleton(type);}
    const value=latestValue(d,v),range=bounds(cfg,v,value),percent=pct(value,range.min,range.max),unit=v?.unit||'';
    const set=(q,t)=>{const el=host.querySelector(q);if(el)el.textContent=t;};
    set('[data-av-title]',cfg?.title||v?.name||'Variable');set('[data-av-value]',num(value));set('[data-av-unit]',unit);
    set('[data-av-percent]',`${Math.round(percent)}%`);set('[data-av-min]',`Mín ${num(range.min)}${unit?` ${unit}`:''}`);set('[data-av-max]',`Máx ${num(range.max)}${unit?` ${unit}`:''}`);
    const fill=host.querySelector('[data-av-fill]');if(fill)fill.style.height=`${percent}%`;
    const gauge=host.querySelector('[data-av-gauge]');if(gauge)gauge.setAttribute('stroke-dasharray',`${percent.toFixed(2)} 100`);
    if(type==='kpi'){
      const h=history(d,v);spark(host.querySelector('[data-av-spark]'),h);
      const a=Number(h[0]?.v),b=Number(h[h.length-1]?.v);set('[data-av-kpi-meta]',Number.isFinite(a)&&Number.isFinite(b)?`${b>a?'↑':b<a?'↓':'→'} ${num(Math.abs(b-a))}${unit?` ${unit}`:''}`:'Sin tendencia suficiente');
    }
  }
  function setPreviewMode(custom){
    const section=document.getElementById('modbus');if(section)section.classList.toggle('tayu-v2-custom-preview',custom);
    const canvas=document.getElementById('mbPreviewChart');if(canvas)canvas.style.display=custom?'none':'';
    if(!custom)canvas?.parentElement?.querySelector('.tayu-av-host[data-av-v2-preview]')?.remove();
  }
  async function renderPreview(){
    const select=ensureOptions(),k=key();if(!select||!k)return;
    const desired=selectedByKey.get(k)||select.value||'line';
    if(!isCustom(desired)){setPreviewMode(false);return;}
    if(select.value!==desired)select.value=desired;
    setPreviewMode(true);
    const {d,v}=selection(),cfg=form();if(!d||!v||!cfg)return;
    cfg.type=desired;
    try{if(typeof loadMbHistoryFromVps==='function')await loadMbHistoryFromVps(d,Math.max(.5,Number(cfg.period||5)));}catch(error){console.warn('Histórico visual IoT:',error);}
    const box=document.getElementById('mbPreviewChart')?.parentElement;if(!box)return;
    let host=box.querySelector('.tayu-av-host[data-av-v2-preview]');
    if(!host){host=document.createElement('div');host.className='tayu-av-host';host.dataset.avV2Preview='1';box.appendChild(host);}
    paint(host,desired,cfg,d,v);
  }
  function getCfg(id){const map=cfgMap();return map?.[id]||null;}
  function getDevice(cfg){return deviceList().find(d=>d.id===cfg?.deviceId)||null;}
  function renderDashboardCustom(){
    document.querySelectorAll('#dashboard .dashboard-widget[data-widget-id]').forEach(widget=>{
      const id=widget.dataset.widgetId||'',cfg=getCfg(id),custom=isCustom(cfg?.type),box=widget.querySelector('.modbus-chart-box');if(!box)return;
      let canvas=box.querySelector('canvas.dashboard-modbus-chart,canvas.tayu-av-v2-canvas,canvas.tayu-av-base-canvas');
      if(!custom){
        box.querySelector('.tayu-av-host[data-av-v2-dashboard]')?.remove();
        if(canvas?.classList.contains('tayu-av-v2-canvas')){canvas.classList.remove('tayu-av-v2-canvas');canvas.classList.add('dashboard-modbus-chart');canvas.style.display='';}
        return;
      }
      if(canvas){if(canvas._chart){try{canvas._chart.destroy();}catch(_){}canvas._chart=null;}canvas.classList.remove('dashboard-modbus-chart','tayu-av-base-canvas');canvas.classList.add('tayu-av-v2-canvas');canvas.style.display='none';}
      let host=box.querySelector('.tayu-av-host[data-av-v2-dashboard]');
      if(!host){box.querySelector('.tayu-av-host[data-av-dashboard]')?.remove();host=document.createElement('div');host.className='tayu-av-host';host.dataset.avV2Dashboard='1';box.appendChild(host);}
      const d=getDevice(cfg),v=d?.variables?.find(x=>x.id===cfg.variableId);if(d&&v)paint(host,cfg.type,cfg,d,v);
    });
  }
  function savedTypeForSelection(){
    const {d,v}=selection();if(!d||!v)return null;
    const map=cfgMap();if(!map)return null;
    try{
      const ids=typeof dashboardWidgetIds!=='undefined'?dashboardWidgetIds:[];
      const id=Object.keys(map).find(x=>ids.includes(x)&&map[x]?.deviceId===d.id&&map[x]?.variableId===v.id);
      return id?map[id]?.type:null;
    }catch(_){return null;}
  }
  function repairSelection(){
    const section=document.getElementById('modbus');if(section&&!section.classList.contains('active'))return;
    const select=ensureOptions(),k=key();if(!select||!k)return;
    let desired=selectedByKey.get(k);
    if(!desired){const saved=savedTypeForSelection();if(isCustom(saved)){desired=saved;selectedByKey.set(k,saved);}}
    if(isCustom(desired)){
      if(select.value!==desired)select.value=desired;
      setPreviewMode(true);renderPreview();
    }else if(!isCustom(select.value)){setPreviewMode(false);}
  }
  function installSafePreview(){
    if(window.updateMbPreview?.__tayuVisualV2)return;
    basePreview=window.updateMbPreview;
    const safe=async function(...args){
      const select=ensureOptions(),k=key(),desired=selectedByKey.get(k)||select?.value||'line';
      if(isCustom(desired)){if(select)select.value=desired;setPreviewMode(true);await renderPreview();return;}
      setPreviewMode(false);return typeof basePreview==='function'?basePreview.apply(this,args):undefined;
    };
    safe.__tayuVisualV2=true;window.updateMbPreview=safe;
  }
  function installSafeAdd(){
    if(window.addModbusChartWidget?.__tayuVisualV2)return;
    baseAdd=window.addModbusChartWidget;
    const safe=function(){
      const select=ensureOptions(),k=key(),desired=selectedByKey.get(k)||select?.value||'line';
      if(!isCustom(desired))return typeof baseAdd==='function'?baseAdd.apply(this,arguments):undefined;
      const cfg=form(),map=cfgMap();
      if(!cfg||!map){alert('No se pudo leer la configuración de la gráfica.');return;}
      cfg.type=desired;
      try{
        const ids=typeof dashboardWidgetIds!=='undefined'?dashboardWidgetIds:[];
        const matches=Object.keys(map).filter(id=>ids.includes(id)&&map[id]?.deviceId===cfg.deviceId&&map[id]?.variableId===cfg.variableId);
        let widgetId=matches[0],existed=Boolean(widgetId);
        if(!widgetId){widgetId=newWidgetInstance('modbusChart');dashboardWidgetIds.push(widgetId);}
        map[widgetId]={...cfg,type:desired};
        matches.slice(1).forEach(id=>{dashboardWidgetIds=dashboardWidgetIds.filter(x=>x!==id);delete map[id];});
        saveModbusChartConfigs();saveWidgetLayout();renderDashboardWidgets();
        requestAnimationFrame(renderDashboardCustom);setTimeout(renderDashboardCustom,120);setTimeout(renderDashboardCustom,450);
        alert(existed?'Gráfica actualizada en el dashboard.':'Gráfica agregada al dashboard.');
      }catch(error){console.error('Guardar visualización IoT:',error);alert(`No se pudo guardar la gráfica: ${error?.message||error}`);}
    };
    safe.__tayuVisualV2=true;window.addModbusChartWidget=safe;
  }
  function bindDashboardObserver(){
    const dash=document.getElementById('dashboard');if(!dash||dashboardObserver)return;
    dashboardObserver=new MutationObserver(()=>requestAnimationFrame(renderDashboardCustom));
    dashboardObserver.observe(dash,{childList:true,subtree:true});
  }
  function install(){
    ensureOptions();installSafePreview();installSafeAdd();bindDashboardObserver();
    document.addEventListener('change',event=>{
      if(event.target?.id==='mbChartType'){
        const type=String(event.target.value||'line'),k=key();if(k)selectedByKey.set(k,type);
        if(isCustom(type)){event.stopImmediatePropagation();setPreviewMode(true);renderPreview();}else{setPreviewMode(false);}
      }
      if(['mbChartDevice','mbChartVariable'].includes(event.target?.id||''))setTimeout(repairSelection,40);
    },true);
    document.addEventListener('click',event=>{
      if(event.target?.closest?.('.nav button[data-view="modbus"]'))setTimeout(repairSelection,140);
      if(event.target?.closest?.('.nav button[data-view="dashboard"]'))setTimeout(renderDashboardCustom,140);
    },true);
    setInterval(()=>{
      installSafePreview();installSafeAdd();
      if(document.getElementById('modbus')?.classList.contains('active'))repairSelection();
      if(document.getElementById('dashboard')?.classList.contains('active'))renderDashboardCustom();
    },750);
    setTimeout(repairSelection,120);setTimeout(renderDashboardCustom,180);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
