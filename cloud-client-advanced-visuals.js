(() => {
  'use strict';

  const CUSTOM_TYPES = new Set(['tank','liquid','gauge','gauge_semi','kpi']);
  const TYPE_OPTIONS = [
    ['tank','Tanque animado'],
    ['liquid','Liquid fill circle'],
    ['gauge','Gauge circular'],
    ['gauge_semi','Gauge semicircular'],
    ['kpi','KPI + mini tendencia']
  ];
  let liveTimer = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function isCustom(type){
    return CUSTOM_TYPES.has(String(type || ''));
  }

  function installStyles(){
    if(document.getElementById('tayuAdvancedVisualStyles')) return;
    const style=document.createElement('style');
    style.id='tayuAdvancedVisualStyles';
    style.textContent=`
      .tayu-av-host{min-height:260px;display:flex;align-items:center;justify-content:center;padding:14px;overflow:hidden}
      .tayu-av-shell{width:100%;height:100%;min-height:230px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--text)}
      .tayu-av-title{font-size:13px;font-weight:900;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tayu-av-range{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;color:var(--muted);font-size:11px;font-weight:800}
      .tayu-av-value{font-size:29px;font-weight:950;line-height:1.05}.tayu-av-unit{font-size:13px;color:var(--muted);font-weight:850;margin-left:4px}
      .tayu-av-percent{font-size:13px;font-weight:900;color:var(--muted);margin-top:5px}

      .tayu-av-tank{position:relative;width:132px;height:188px;border:5px solid var(--border);border-radius:26px 26px 38px 38px;overflow:hidden;background:var(--panel2);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text) 5%,transparent)}
      .tayu-av-tank:before{content:'';position:absolute;left:15px;right:15px;top:-10px;height:16px;border:4px solid var(--border);border-radius:50%;background:var(--panel);z-index:4}
      .tayu-av-water,.tayu-av-circle-water{position:absolute;left:0;right:0;bottom:0;height:0;background:linear-gradient(180deg,#38bdf8,#0284c7);transition:height .9s cubic-bezier(.2,.8,.2,1)}
      .tayu-av-water:before,.tayu-av-circle-water:before{content:'';position:absolute;left:-25%;top:-11px;width:150%;height:23px;border-radius:44%;background:rgba(255,255,255,.30);animation:tayuWave 3.3s linear infinite}
      .tayu-av-water:after,.tayu-av-circle-water:after{content:'';position:absolute;left:-35%;top:-7px;width:170%;height:18px;border-radius:48%;background:rgba(2,132,199,.32);animation:tayuWave 4.7s linear infinite reverse}
      @keyframes tayuWave{from{transform:translateX(-12%) rotate(0deg)}to{transform:translateX(12%) rotate(360deg)}}
      .tayu-av-center{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;text-shadow:0 2px 8px rgba(255,255,255,.72)}
      body.dark .tayu-av-center{text-shadow:0 2px 8px rgba(0,0,0,.85)}

      .tayu-av-liquid-circle{position:relative;width:178px;height:178px;border-radius:50%;overflow:hidden;background:var(--panel2);border:5px solid var(--border);box-shadow:inset 0 0 0 5px color-mix(in srgb,var(--panel) 70%,transparent)}
      .tayu-av-liquid-circle .tayu-av-center{border-radius:50%}

      .tayu-av-gauge{position:relative;width:190px;height:190px;display:grid;place-items:center}
      .tayu-av-gauge svg{width:190px;height:190px;transform:rotate(-90deg);overflow:visible}
      .tayu-av-gauge-track,.tayu-av-gauge-value{fill:none;stroke-width:14;stroke-linecap:round}
      .tayu-av-gauge-track{stroke:var(--border)}
      .tayu-av-gauge-value{stroke:var(--brand);transition:stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)}
      .tayu-av-gauge .tayu-av-center{position:absolute;inset:0;text-shadow:none}

      .tayu-av-semi{position:relative;width:230px;height:145px;display:flex;align-items:flex-end;justify-content:center}
      .tayu-av-semi svg{position:absolute;left:0;top:0;width:230px;height:125px;overflow:visible}
      .tayu-av-semi-track,.tayu-av-semi-value{fill:none;stroke-width:17;stroke-linecap:round}
      .tayu-av-semi-track{stroke:var(--border)}
      .tayu-av-semi-value{stroke:var(--brand);transition:stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)}
      .tayu-av-semi-center{z-index:2;text-align:center;margin-bottom:3px}

      .tayu-av-kpi{width:min(440px,100%);display:grid;grid-template-columns:minmax(135px,.75fr) 1.25fr;gap:18px;align-items:center;padding:18px;border:1px solid var(--border);border-radius:22px;background:var(--panel2)}
      .tayu-av-kpi-main small{display:block;color:var(--muted);font-size:11px;font-weight:850;margin-bottom:7px}.tayu-av-kpi-main strong{font-size:34px;line-height:1;font-weight:950}.tayu-av-spark{width:100%;height:82px;overflow:visible}.tayu-av-spark polyline{fill:none;stroke:var(--brand);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.tayu-av-spark-line{stroke:var(--border);stroke-width:1}
      .tayu-av-empty{color:var(--muted);font-weight:800;font-size:13px;text-align:center;padding:30px}
      .tayu-av-help{grid-column:1/-1;margin-top:-2px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--panel2);font-size:11px;line-height:1.45;color:var(--muted)}
      .tayu-av-hidden-field{display:none!important}
      .tayu-av-base-canvas{display:none!important}
      @media(max-width:600px){.tayu-av-kpi{grid-template-columns:1fr}.tayu-av-spark{height:70px}.tayu-av-host{min-height:235px}.tayu-av-shell{min-height:210px}}
    `;
    document.head.appendChild(style);
  }

  function ensureTypeOptions(){
    const select=document.getElementById('mbChartType');
    if(!select) return false;
    TYPE_OPTIONS.forEach(([value,label])=>{
      if(select.querySelector(`option[value="${value}"]`)) return;
      const option=document.createElement('option');
      option.value=value;
      option.textContent=label;
      select.appendChild(option);
    });
    return true;
  }

  function builderField(id){
    return document.getElementById(id)?.parentElement || null;
  }

  function ensureBuilderHelp(){
    const type=document.getElementById('mbChartType');
    const builder=type?.closest('.modbus-builder');
    if(!builder || builder.querySelector('.tayu-av-help')) return;
    const note=document.createElement('div');
    note.className='tayu-av-help';
    note.innerHTML='<b>Visualizaciones IoT:</b> Tanque y Liquid fill muestran nivel animado; los gauges muestran el valor actual dentro del rango Mín/Máx; KPI conserva la ventana temporal para su mini tendencia.';
    builder.appendChild(note);
  }

  function syncBuilderFields(){
    ensureTypeOptions();
    ensureBuilderHelp();
    const type=document.getElementById('mbChartType')?.value || 'line';
    const instant=['tank','liquid','gauge','gauge_semi'].includes(type);
    ['mbChartPeriod','mbChartPoints'].forEach(id=>builderField(id)?.classList.toggle('tayu-av-hidden-field',instant));
    const minLabel=builderField('mbChartMin')?.querySelector('label');
    const maxLabel=builderField('mbChartMax')?.querySelector('label');
    if(minLabel) minLabel.textContent=instant?'Mínimo del rango':'Mínimo eje Y';
    if(maxLabel) maxLabel.textContent=instant?'Máximo del rango':'Máximo eje Y';
  }

  function currentSelection(){
    try{
      if(typeof currentMbChartSelection==='function') return currentMbChartSelection();
    }catch(_){}
    return {d:null,v:null};
  }

  function currentForm(){
    try{
      if(typeof currentMbChartFormConfig==='function') return currentMbChartFormConfig();
    }catch(_){}
    return null;
  }

  function configForWidget(id){
    try{return typeof modbusChartConfigs!=='undefined' ? modbusChartConfigs?.[id] : null;}catch(_){return null;}
  }

  function deviceForConfig(cfg){
    try{return typeof modbusDevices!=='undefined' ? modbusDevices.find(item=>item.id===cfg?.deviceId) : null;}catch(_){return null;}
  }

  function variableForConfig(d,cfg){
    return d?.variables?.find(item=>item.id===cfg?.variableId) || null;
  }

  function historyFor(d,v,cfg){
    let history=[];
    try{
      if(typeof mbHistory==='function') history=mbHistory(d,v) || [];
    }catch(_){}
    const normalized=history.map(point=>({
      t:point?.t instanceof Date?point.t:new Date(point?.t||0),
      v:Number(point?.v)
    })).filter(point=>Number.isFinite(point.v)&&!Number.isNaN(point.t.getTime()));
    const period=Math.max(.5,Number(cfg?.period||5));
    if(!normalized.length) return [];
    const latest=normalized[normalized.length-1].t.getTime();
    const cutoff=latest-period*60*1000;
    let visible=normalized.filter(point=>point.t.getTime()>=cutoff);
    const limit=Math.max(10,Math.min(400,Number(cfg?.points||50)));
    if(visible.length>limit){
      const step=(visible.length-1)/(limit-1);
      visible=Array.from({length:limit},(_,i)=>visible[Math.round(i*step)]);
    }
    return visible;
  }

  function latestValue(d,v){
    const history=historyFor(d,v,{period:1440,points:10});
    const last=history[history.length-1];
    if(last&&Number.isFinite(last.v)) return last.v;
    const value=Number(v?.value);
    return Number.isFinite(value)?value:null;
  }

  function bounds(cfg,v,value){
    const parse=value=>value===''||value===null||value===undefined?null:Number(value);
    let min=parse(cfg?.min);
    let max=parse(cfg?.max);
    if(!Number.isFinite(min)) min=Number(v?.min);
    if(!Number.isFinite(max)) max=Number(v?.max);
    if(!Number.isFinite(min)) min=0;
    if(!Number.isFinite(max)) max=100;
    if(max<=min){
      const center=Number.isFinite(value)?value:min;
      min=center-1;max=center+1;
    }
    return {min,max};
  }

  function percentage(value,min,max){
    if(!Number.isFinite(value)||!Number.isFinite(min)||!Number.isFinite(max)||max<=min) return 0;
    return Math.max(0,Math.min(100,((value-min)/(max-min))*100));
  }

  function numberText(value){
    if(!Number.isFinite(value)) return '—';
    const abs=Math.abs(value);
    const digits=abs>=100?1:abs>=10?2:3;
    return value.toLocaleString('es-EC',{maximumFractionDigits:digits});
  }

  function typeSkeleton(type){
    if(type==='tank') return `<div class="tayu-av-shell"><div class="tayu-av-title" data-av-title></div><div class="tayu-av-tank"><div class="tayu-av-water" data-av-fill></div><div class="tayu-av-center"><div><span class="tayu-av-value" data-av-value></span><span class="tayu-av-unit" data-av-unit></span></div><div class="tayu-av-percent" data-av-percent></div></div></div><div class="tayu-av-range"><span data-av-min></span><span data-av-max></span></div></div>`;
    if(type==='liquid') return `<div class="tayu-av-shell"><div class="tayu-av-title" data-av-title></div><div class="tayu-av-liquid-circle"><div class="tayu-av-circle-water" data-av-fill></div><div class="tayu-av-center"><div><span class="tayu-av-value" data-av-value></span><span class="tayu-av-unit" data-av-unit></span></div><div class="tayu-av-percent" data-av-percent></div></div></div><div class="tayu-av-range"><span data-av-min></span><span data-av-max></span></div></div>`;
    if(type==='gauge') return `<div class="tayu-av-shell"><div class="tayu-av-title" data-av-title></div><div class="tayu-av-gauge"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="tayu-av-gauge-track" cx="60" cy="60" r="47" pathLength="100"></circle><circle class="tayu-av-gauge-value" data-av-gauge cx="60" cy="60" r="47" pathLength="100" stroke-dasharray="0 100"></circle></svg><div class="tayu-av-center"><div><span class="tayu-av-value" data-av-value></span><span class="tayu-av-unit" data-av-unit></span></div><div class="tayu-av-percent" data-av-percent></div></div></div><div class="tayu-av-range"><span data-av-min></span><span data-av-max></span></div></div>`;
    if(type==='gauge_semi') return `<div class="tayu-av-shell"><div class="tayu-av-title" data-av-title></div><div class="tayu-av-semi"><svg viewBox="0 0 200 115" aria-hidden="true"><path class="tayu-av-semi-track" d="M20 100 A80 80 0 0 1 180 100" pathLength="100"></path><path class="tayu-av-semi-value" data-av-gauge d="M20 100 A80 80 0 0 1 180 100" pathLength="100" stroke-dasharray="0 100"></path></svg><div class="tayu-av-semi-center"><div><span class="tayu-av-value" data-av-value></span><span class="tayu-av-unit" data-av-unit></span></div><div class="tayu-av-percent" data-av-percent></div></div></div><div class="tayu-av-range"><span data-av-min></span><span data-av-max></span></div></div>`;
    if(type==='kpi') return `<div class="tayu-av-shell"><div class="tayu-av-title" data-av-title></div><div class="tayu-av-kpi"><div class="tayu-av-kpi-main"><small>VALOR ACTUAL</small><div><strong data-av-value></strong><span class="tayu-av-unit" data-av-unit></span></div><div class="tayu-av-percent" data-av-kpi-meta></div></div><svg class="tayu-av-spark" data-av-spark viewBox="0 0 320 82" preserveAspectRatio="none" aria-label="Mini tendencia"></svg></div><div class="tayu-av-range"><span data-av-min></span><span data-av-max></span></div></div>`;
    return '<div class="tayu-av-empty">Visualización no disponible.</div>';
  }

  function sparkline(svg,history){
    if(!svg) return;
    if(history.length<2){
      svg.innerHTML='<text x="160" y="43" text-anchor="middle" fill="currentColor" opacity=".55" font-size="12">Esperando más muestras…</text>';
      return;
    }
    const values=history.map(point=>point.v);
    let min=Math.min(...values),max=Math.max(...values);
    if(max<=min){min-=1;max+=1;}
    const points=history.map((point,index)=>{
      const x=history.length===1?160:(index/(history.length-1))*316+2;
      const y=76-((point.v-min)/(max-min))*68;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    svg.innerHTML=`<line class="tayu-av-spark-line" x1="2" y1="78" x2="318" y2="78"></line><polyline points="${points}"></polyline>`;
  }

  function updateVisual(host,type,cfg,d,v){
    if(!host) return;
    if(host.dataset.avType!==type){
      host.dataset.avType=type;
      host.innerHTML=typeSkeleton(type);
    }
    const value=latestValue(d,v);
    const range=bounds(cfg,v,value);
    const pct=percentage(value,range.min,range.max);
    const unit=v?.unit || '';
    const title=cfg?.title || v?.name || 'Variable';
    const set=(selector,text)=>{const el=host.querySelector(selector);if(el)el.textContent=text;};
    set('[data-av-title]',title);
    set('[data-av-value]',numberText(value));
    set('[data-av-unit]',unit);
    set('[data-av-percent]',`${Math.round(pct)}%`);
    set('[data-av-min]',`Mín ${numberText(range.min)}${unit?` ${unit}`:''}`);
    set('[data-av-max]',`Máx ${numberText(range.max)}${unit?` ${unit}`:''}`);
    const fill=host.querySelector('[data-av-fill]');
    if(fill) requestAnimationFrame(()=>{fill.style.height=`${pct}%`;});
    const gauge=host.querySelector('[data-av-gauge]');
    if(gauge) requestAnimationFrame(()=>{gauge.setAttribute('stroke-dasharray',`${pct.toFixed(2)} 100`);});
    if(type==='kpi'){
      const h=historyFor(d,v,cfg);
      sparkline(host.querySelector('[data-av-spark]'),h);
      const first=h[0]?.v,last=h[h.length-1]?.v;
      let text='Sin tendencia suficiente';
      if(Number.isFinite(first)&&Number.isFinite(last)&&h.length>1){
        const delta=last-first;
        const arrow=delta>0?'↑':delta<0?'↓':'→';
        text=`${arrow} ${numberText(Math.abs(delta))}${unit?` ${unit}`:''} · ${h.length} muestras`;
      }
      set('[data-av-kpi-meta]',text);
    }
  }

  function renderPreviewCustom(){
    syncBuilderFields();
    const type=document.getElementById('mbChartType')?.value || 'line';
    const canvas=document.getElementById('mbPreviewChart');
    const box=canvas?.parentElement;
    if(!canvas||!box) return;
    let host=box.querySelector(':scope > .tayu-av-host[data-av-preview]');
    if(!isCustom(type)){
      canvas.style.display='';
      host?.remove();
      return;
    }
    canvas.style.display='none';
    if(!host){
      host=document.createElement('div');
      host.className='tayu-av-host';
      host.dataset.avPreview='1';
      box.appendChild(host);
    }
    const {d,v}=currentSelection();
    const cfg=currentForm();
    if(!d||!v||!cfg){host.innerHTML='<div class="tayu-av-empty">Selecciona equipo y variable.</div>';return;}
    updateVisual(host,type,cfg,d,v);
  }

  function prepareDashboardCanvases(){
    document.querySelectorAll('#dashboard .dashboard-widget').forEach(widget=>{
      const id=widget.dataset.widgetId || '';
      const cfg=configForWidget(id);
      const custom=isCustom(cfg?.type);
      const canvas=widget.querySelector('canvas.dashboard-modbus-chart,canvas.tayu-av-base-canvas');
      const host=widget.querySelector('.tayu-av-host[data-av-dashboard]');
      if(custom){
        if(canvas){
          if(canvas._chart){try{canvas._chart.destroy();}catch(_){} canvas._chart=null;}
          canvas.classList.remove('dashboard-modbus-chart');
          canvas.classList.add('tayu-av-base-canvas');
          canvas.style.display='none';
        }
      }else{
        host?.remove();
        if(canvas?.classList.contains('tayu-av-base-canvas')){
          canvas.classList.remove('tayu-av-base-canvas');
          canvas.classList.add('dashboard-modbus-chart');
          canvas.style.display='';
        }
      }
    });
  }

  function renderDashboardCustom(){
    document.querySelectorAll('#dashboard .dashboard-widget').forEach(widget=>{
      const id=widget.dataset.widgetId || '';
      const cfg=configForWidget(id);
      if(!isCustom(cfg?.type)) return;
      const d=deviceForConfig(cfg),v=variableForConfig(d,cfg);
      const box=widget.querySelector('.modbus-chart-box');
      if(!box) return;
      let host=box.querySelector(':scope > .tayu-av-host[data-av-dashboard]');
      if(!host){
        host=document.createElement('div');
        host.className='tayu-av-host';
        host.dataset.avDashboard='1';
        box.appendChild(host);
      }
      if(!d||!v){host.innerHTML='<div class="tayu-av-empty">Variable no disponible.</div>';return;}
      updateVisual(host,cfg.type,cfg,d,v);
    });
  }

  function wrapPreview(){
    const original=window.updateMbPreview;
    if(typeof original!=='function'||original.__tayuAdvancedVisuals) return;
    const wrapped=async function(...args){
      ensureTypeOptions();
      const select=document.getElementById('mbChartType');
      const requested=select?.value || 'line';
      if(!isCustom(requested)){
        const result=await original.apply(this,args);
        renderPreviewCustom();
        return result;
      }
      let result;
      if(select) select.value='line';
      try{result=await original.apply(this,args);}finally{
        if(select&&select.value==='line') select.value=requested;
      }
      renderPreviewCustom();
      return result;
    };
    wrapped.__tayuAdvancedVisuals=true;
    window.updateMbPreview=wrapped;
  }

  function wrapFormLoader(){
    const original=window.loadMbChartFormFromSelection;
    if(typeof original!=='function'||original.__tayuAdvancedVisuals) return;
    const wrapped=function(...args){
      const result=original.apply(this,args);
      ensureTypeOptions();
      syncBuilderFields();
      setTimeout(renderPreviewCustom,0);
      return result;
    };
    wrapped.__tayuAdvancedVisuals=true;
    window.loadMbChartFormFromSelection=wrapped;
  }

  function wrapDashboardRenderer(){
    const original=window.renderDashboardModbusChart;
    if(typeof original!=='function'||original.__tayuAdvancedVisuals) return;
    const wrapped=function(...args){
      prepareDashboardCanvases();
      const result=original.apply(this,args);
      setTimeout(renderDashboardCustom,0);
      setTimeout(renderDashboardCustom,180);
      return result;
    };
    wrapped.__tayuAdvancedVisuals=true;
    window.renderDashboardModbusChart=wrapped;
  }

  function wrapDashboardWidgets(){
    const original=window.renderDashboardWidgets;
    if(typeof original!=='function'||original.__tayuAdvancedVisuals) return;
    const wrapped=function(...args){
      const result=original.apply(this,args);
      setTimeout(()=>{
        prepareDashboardCanvases();
        renderDashboardCustom();
      },0);
      return result;
    };
    wrapped.__tayuAdvancedVisuals=true;
    window.renderDashboardWidgets=wrapped;
  }

  function install(){
    installStyles();
    ensureTypeOptions();
    ensureBuilderHelp();
    wrapPreview();
    wrapFormLoader();
    wrapDashboardRenderer();
    wrapDashboardWidgets();
    syncBuilderFields();
    renderPreviewCustom();
    prepareDashboardCanvases();
    renderDashboardCustom();

    document.addEventListener('change',event=>{
      if(event.target?.id==='mbChartType'){
        syncBuilderFields();
        window.updateMbPreview?.();
      }
    });
    document.addEventListener('click',event=>{
      if(event.target?.closest?.('.nav button[data-view="modbus"]')) setTimeout(()=>{ensureTypeOptions();syncBuilderFields();renderPreviewCustom();},180);
      if(event.target?.closest?.('.nav button[data-view="dashboard"]')) setTimeout(()=>{prepareDashboardCanvases();renderDashboardCustom();},180);
    },true);

    clearInterval(liveTimer);
    liveTimer=setInterval(()=>{
      if(document.getElementById('modbus')?.classList.contains('active')) renderPreviewCustom();
      if(document.getElementById('dashboard')?.classList.contains('active')){
        prepareDashboardCanvases();
        renderDashboardCustom();
      }
    },2000);

    window.addEventListener('tayu:client-access-ready',()=>setTimeout(()=>{ensureTypeOptions();syncBuilderFields();prepareDashboardCanvases();renderDashboardCustom();},220));
    window.addEventListener('pageshow',()=>setTimeout(()=>{ensureTypeOptions();syncBuilderFields();prepareDashboardCanvases();renderDashboardCustom();},180));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
