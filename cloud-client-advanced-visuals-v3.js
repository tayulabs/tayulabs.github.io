(() => {
  'use strict';

  const CUSTOM_TYPES=new Set(['tank','liquid','gauge','gauge_semi','kpi']);
  const selectedByKey=new Map();
  const draftsByKey=new Map();
  const historyRequests=new Map();
  let basePreview=null;
  let baseAdd=null;
  let baseDashboardRender=null;
  let baseWidgetRender=null;
  let dashboardObserver=null;
  let saveTimer=null;
  let previewFrame=0;
  let dashboardFrame=0;
  let installed=false;

  const $=id=>document.getElementById(id);
  const isCustom=type=>CUSTOM_TYPES.has(String(type||''));

  function key(){
    const d=$('mbChartDevice')?.value||'';
    const v=$('mbChartVariable')?.value||'';
    return d&&v?`${d}|${v}`:'';
  }

  function selection(){
    try{return window.currentMbChartSelection?.()||{d:null,v:null};}catch(_){return {d:null,v:null};}
  }

  function map(){
    const value=window.modbusChartConfigs;
    return value&&typeof value==='object'?value:null;
  }

  function ids(){return Array.isArray(window.dashboardWidgetIds)?window.dashboardWidgetIds:[];}
  function devices(){return Array.isArray(window.modbusDevices)?window.modbusDevices:[];}

  function findWidget(deviceId,variableId){
    const configs=map();if(!configs)return null;
    return Object.keys(configs).find(id=>ids().includes(id)&&configs[id]?.deviceId===deviceId&&configs[id]?.variableId===variableId)||null;
  }

  function savedConfigForSelection(){
    const {d,v}=selection();if(!d||!v)return null;
    const id=findWidget(d.id,v.id);
    return id?map()?.[id]||null:null;
  }

  function currentType(){
    const k=key();
    const selected=selectedByKey.get(k);
    if(selected)return selected;
    const saved=savedConfigForSelection()?.type;
    if(isCustom(saved))return saved;
    return $('mbChartType')?.value||saved||'line';
  }

  function currentForm(){
    let cfg=null;
    try{cfg=window.currentMbChartFormConfig?.()||null;}catch(_){cfg=null;}
    if(!cfg)return null;
    const draft=draftsByKey.get(key());
    if(draft)cfg={...cfg,...draft};
    const type=currentType();
    if(type)cfg.type=type;
    return cfg;
  }

  function history(d,v){
    try{return window.mbHistory?.(d,v)||[];}catch(_){return [];}
  }

  function latestValue(d,v){
    const h=history(d,v)
      .map(p=>({t:p?.t instanceof Date?p.t:new Date(p?.t||0),v:Number(p?.v)}))
      .filter(p=>Number.isFinite(p.v)&&!Number.isNaN(p.t.getTime()));
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
    if(max<=min){const center=Number.isFinite(value)?value:min;min=center-1;max=center+1;}
    return {min,max};
  }

  function pct(value,min,max){
    return Number.isFinite(value)&&max>min?Math.max(0,Math.min(100,(value-min)*100/(max-min))):0;
  }

  function num(value){
    if(!Number.isFinite(value))return '—';
    const a=Math.abs(value);
    return value.toLocaleString('es-EC',{maximumFractionDigits:a>=100?1:a>=10?2:3});
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
    const fresh=host.dataset.avType!==type;
    if(fresh){host.dataset.avType=type;host.innerHTML=skeleton(type);}
    const value=latestValue(d,v),range=bounds(cfg,v,value),percent=pct(value,range.min,range.max),unit=v?.unit||'';
    const set=(q,t)=>{const el=host.querySelector(q);if(el)el.textContent=t;};
    set('[data-av-title]',cfg?.title||v?.name||'Variable');
    set('[data-av-value]',num(value));
    set('[data-av-unit]',unit);
    set('[data-av-percent]',`${Math.round(percent)}%`);
    set('[data-av-min]',`Mín ${num(range.min)}${unit?` ${unit}`:''}`);
    set('[data-av-max]',`Máx ${num(range.max)}${unit?` ${unit}`:''}`);

    const fill=host.querySelector('[data-av-fill]');
    if(fill){
      if(fresh){
        fill.style.height='0%';
        requestAnimationFrame(()=>{if(fill.isConnected)fill.style.height=`${percent}%`;});
      }else fill.style.height=`${percent}%`;
    }
    const gauge=host.querySelector('[data-av-gauge]');
    if(gauge)gauge.setAttribute('stroke-dasharray',`${percent.toFixed(2)} 100`);

    if(type==='kpi'){
      const h=history(d,v);spark(host.querySelector('[data-av-spark]'),h);
      const a=Number(h[0]?.v),b=Number(h[h.length-1]?.v);
      set('[data-av-kpi-meta]',Number.isFinite(a)&&Number.isFinite(b)?`${b>a?'↑':b<a?'↓':'→'} ${num(Math.abs(b-a))}${unit?` ${unit}`:''}`:'Sin tendencia suficiente');
    }
  }

  function setPreviewMode(custom){
    const section=$('modbus');if(section)section.classList.toggle('tayu-v3-custom-preview',custom);
    const canvas=$('mbPreviewChart');if(canvas)canvas.style.display=custom?'none':'';
    if(!custom)canvas?.parentElement?.querySelector('.tayu-av-host[data-av-v3-preview]')?.remove();
  }

  async function ensureHistory(d,cfg){
    if(!d||!window.loadMbHistoryFromVps)return;
    const minutes=Math.max(.5,Number(cfg?.period||5));
    const requestKey=`${d.id}|${minutes}`;
    const last=historyRequests.get(requestKey)||0;
    if(Date.now()-last<30000)return;
    historyRequests.set(requestKey,Date.now());
    try{await window.loadMbHistoryFromVps(d,minutes,false);}catch(error){console.warn('Histórico visual IoT:',error);}
  }

  async function renderPreview(loadHistory=false){
    const k=key(),type=currentType();
    if(!k||!isCustom(type)){setPreviewMode(false);return;}
    const select=$('mbChartType');if(select&&select.value!==type)select.value=type;
    window.__tayuSelectedModbusVisualType=type;
    setPreviewMode(true);
    const {d,v}=selection(),cfg=currentForm();if(!d||!v||!cfg)return;
    cfg.type=type;
    if(loadHistory)await ensureHistory(d,cfg);
    const box=$('mbPreviewChart')?.parentElement;if(!box)return;
    let host=box.querySelector('.tayu-av-host[data-av-v3-preview]');
    if(!host){host=document.createElement('div');host.className='tayu-av-host';host.dataset.avV3Preview='1';box.appendChild(host);}
    paint(host,type,cfg,d,v);
  }

  function schedulePreview(loadHistory=false){
    if(previewFrame)cancelAnimationFrame(previewFrame);
    previewFrame=requestAnimationFrame(()=>{previewFrame=0;renderPreview(loadHistory);});
  }

  function renderDashboardCustom(){
    const configs=map();if(!configs)return;
    document.querySelectorAll('#dashboard .dashboard-widget[data-widget-id]').forEach(widget=>{
      const id=widget.dataset.widgetId||'',cfg=configs[id],custom=isCustom(cfg?.type),box=widget.querySelector('.modbus-chart-box');
      if(!box)return;
      const canvas=box.querySelector('canvas.dashboard-modbus-chart,canvas.tayu-av-v3-canvas,canvas.tayu-av-v2-canvas,canvas.tayu-av-base-canvas');
      if(!custom){
        box.querySelector('.tayu-av-host[data-av-v3-dashboard]')?.remove();
        if(canvas?.classList.contains('tayu-av-v3-canvas')){
          canvas.classList.remove('tayu-av-v3-canvas');canvas.classList.add('dashboard-modbus-chart');canvas.style.display='';
        }
        return;
      }
      if(canvas){
        if(canvas._chart){try{canvas._chart.destroy();}catch(_){}canvas._chart=null;}
        canvas.classList.remove('dashboard-modbus-chart','tayu-av-v2-canvas','tayu-av-base-canvas');
        canvas.classList.add('tayu-av-v3-canvas');canvas.style.display='none';
      }
      let host=box.querySelector('.tayu-av-host[data-av-v3-dashboard]');
      if(!host){
        box.querySelector('.tayu-av-host[data-av-v2-dashboard],.tayu-av-host[data-av-dashboard]')?.remove();
        host=document.createElement('div');host.className='tayu-av-host';host.dataset.avV3Dashboard='1';box.appendChild(host);
      }
      const d=devices().find(item=>item.id===cfg.deviceId),v=d?.variables?.find(item=>item.id===cfg.variableId);
      if(d&&v)paint(host,cfg.type,cfg,d,v);
    });
  }

  function scheduleDashboard(){
    if(dashboardFrame)return;
    dashboardFrame=requestAnimationFrame(()=>{dashboardFrame=0;renderDashboardCustom();});
  }

  function rememberDraftField(id,value){
    const k=key();if(!k)return;
    const field={
      mbChartMin:'min',mbChartMax:'max',mbChartTitle:'title',mbChartPeriod:'period',mbChartPoints:'points'
    }[id];
    if(!field)return;
    const draft={...(draftsByKey.get(k)||{})};
    draft[field]=['period','points'].includes(field)?Number(value||0):value;
    draftsByKey.set(k,draft);

    const {d,v}=selection();if(!d||!v)return;
    const widgetId=findWidget(d.id,v.id),configs=map();
    if(widgetId&&configs?.[widgetId]){
      configs[widgetId]={...configs[widgetId],[field]:draft[field]};
      if(isCustom(currentType()))configs[widgetId].type=currentType();
      clearTimeout(saveTimer);
      saveTimer=setTimeout(()=>window.saveModbusChartConfigs?.(),450);
      scheduleDashboard();
    }
  }

  function restoreDraft(){
    const draft=draftsByKey.get(key());if(!draft)return;
    const fields={min:'mbChartMin',max:'mbChartMax',title:'mbChartTitle',period:'mbChartPeriod',points:'mbChartPoints'};
    Object.entries(fields).forEach(([field,id])=>{
      if(!(field in draft))return;
      const el=$(id);if(el&&String(el.value)!==String(draft[field]))el.value=draft[field];
    });
  }

  function repairSelection(){
    const section=$('modbus');if(section&&!section.classList.contains('active'))return;
    const k=key();if(!k)return;
    let type=selectedByKey.get(k);
    if(!type){
      const saved=savedConfigForSelection()?.type;
      if(isCustom(saved)){type=saved;selectedByKey.set(k,saved);}
    }
    if(isCustom(type)){
      const select=$('mbChartType');if(select&&select.value!==type)select.value=type;
      window.__tayuSelectedModbusVisualType=type;
      restoreDraft();schedulePreview(true);
    }else{
      window.__tayuSelectedModbusVisualType=null;
      setPreviewMode(false);
    }
  }

  function installSafePreview(){
    if(window.updateMbPreview?.__tayuVisualV3)return;
    basePreview=window.updateMbPreview;
    const safe=async function(...args){
      const type=currentType();
      if(isCustom(type)){schedulePreview(false);return;}
      setPreviewMode(false);
      return typeof basePreview==='function'?basePreview.apply(this,args):undefined;
    };
    safe.__tayuVisualV3=true;window.updateMbPreview=safe;
  }

  function installSafeAdd(){
    if(window.addModbusChartWidget?.__tayuVisualV3)return;
    baseAdd=window.addModbusChartWidget;
    const safe=function(){
      const type=currentType();
      if(!isCustom(type))return typeof baseAdd==='function'?baseAdd.apply(this,arguments):undefined;
      const cfg=currentForm(),configs=map();
      if(!cfg||!configs){alert('No se pudo leer la configuración de la gráfica.');return;}
      cfg.type=type;
      try{
        const matches=Object.keys(configs).filter(id=>ids().includes(id)&&configs[id]?.deviceId===cfg.deviceId&&configs[id]?.variableId===cfg.variableId);
        let widgetId=matches[0],existed=Boolean(widgetId);
        if(!widgetId){widgetId=window.newWidgetInstance?.('modbusChart');if(!widgetId)throw new Error('No se pudo crear el widget.');window.dashboardWidgetIds=[...ids(),widgetId];}
        configs[widgetId]={...cfg,type};
        matches.slice(1).forEach(id=>{window.dashboardWidgetIds=ids().filter(x=>x!==id);delete configs[id];});
        draftsByKey.delete(key());
        window.saveModbusChartConfigs?.();
        window.saveWidgetLayout?.();
        window.renderDashboardWidgets?.();
        scheduleDashboard();setTimeout(scheduleDashboard,80);
        alert(existed?'Gráfica actualizada en el dashboard.':'Gráfica agregada al dashboard.');
      }catch(error){console.error('Guardar visualización IoT:',error);alert(`No se pudo guardar la gráfica: ${error?.message||error}`);}
    };
    safe.__tayuVisualV3=true;window.addModbusChartWidget=safe;
  }

  function wrapDashboardRender(){
    if(window.renderDashboardModbusChart?.__tayuVisualV3)return;
    baseDashboardRender=window.renderDashboardModbusChart;
    if(typeof baseDashboardRender!=='function')return;
    const wrapped=function(...args){
      const result=baseDashboardRender.apply(this,args);
      Promise.resolve(result).finally(scheduleDashboard);
      return result;
    };
    wrapped.__tayuVisualV3=true;window.renderDashboardModbusChart=wrapped;
  }

  function wrapWidgetRender(){
    if(window.renderDashboardWidgets?.__tayuVisualV3)return;
    baseWidgetRender=window.renderDashboardWidgets;
    if(typeof baseWidgetRender!=='function')return;
    const wrapped=function(...args){
      const result=baseWidgetRender.apply(this,args);
      scheduleDashboard();
      return result;
    };
    wrapped.__tayuVisualV3=true;window.renderDashboardWidgets=wrapped;
  }

  function bindDashboardObserver(){
    const box=$('dashboardWidgets');if(!box||dashboardObserver)return;
    dashboardObserver=new MutationObserver(mutations=>{
      if(mutations.some(m=>m.type==='childList'))scheduleDashboard();
    });
    dashboardObserver.observe(box,{childList:true});
  }

  function bindEvents(){
    document.addEventListener('input',event=>{
      const id=event.target?.id||'';
      if(!['mbChartMin','mbChartMax','mbChartTitle','mbChartPeriod','mbChartPoints'].includes(id))return;
      rememberDraftField(id,event.target.value);
      if(isCustom(currentType()))schedulePreview(false);
    },true);

    document.addEventListener('change',event=>{
      const id=event.target?.id||'';
      if(id==='mbChartType'){
        const type=String(event.target.value||'line'),k=key();if(k)selectedByKey.set(k,type);
        window.__tayuSelectedModbusVisualType=isCustom(type)?type:null;
        if(isCustom(type)){setPreviewMode(true);schedulePreview(true);}else{setPreviewMode(false);basePreview?.();}
      }else if(id==='mbChartDevice'||id==='mbChartVariable'){
        window.__tayuSelectedModbusVisualType=null;
        setTimeout(repairSelection,30);
      }
    },true);

    document.addEventListener('click',event=>{
      if(event.target?.closest?.('.nav button[data-view="modbus"]'))setTimeout(repairSelection,70);
      if(event.target?.closest?.('.nav button[data-view="dashboard"]'))setTimeout(scheduleDashboard,70);
    },true);

    window.addEventListener('pageshow',()=>{setTimeout(repairSelection,70);setTimeout(scheduleDashboard,70);});
    window.addEventListener('tayu:client-access-ready',()=>{setTimeout(repairSelection,90);setTimeout(scheduleDashboard,90);});
  }

  function install(){
    if(installed)return true;
    if(typeof window.currentMbChartFormConfig!=='function'||typeof window.addModbusChartWidget!=='function')return false;
    installed=true;
    installSafePreview();installSafeAdd();wrapDashboardRender();wrapWidgetRender();bindDashboardObserver();bindEvents();
    repairSelection();scheduleDashboard();
    return true;
  }

  if(!install()){
    let attempts=0;
    const retry=()=>{
      attempts+=1;
      if(install()||attempts>=60)return;
      setTimeout(retry,100);
    };
    setTimeout(retry,60);
  }
})();
