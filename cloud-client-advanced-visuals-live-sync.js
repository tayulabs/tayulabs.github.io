(() => {
  'use strict';

  const CUSTOM_TYPES=new Set(['tank','liquid','gauge','gauge_semi','kpi']);
  let timer=null;
  let frame=0;

  function configs(){
    const value=window.modbusChartConfigs;
    return value&&typeof value==='object'?value:{};
  }

  function devices(){
    return Array.isArray(window.modbusDevices)?window.modbusDevices:[];
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

  function percent(value,min,max){
    if(!Number.isFinite(value)||!Number.isFinite(min)||!Number.isFinite(max)||max<=min)return 0;
    return Math.max(0,Math.min(100,(value-min)*100/(max-min)));
  }

  function palette(type,pct){
    if(pct<=33)return {level:'low',accent:'#EF4444',accent2:'#B91C1C'};
    if(pct<=66)return {level:'medium',accent:'#F59E0B',accent2:'#D97706'};
    if(type==='tank'||type==='liquid')return {level:'high',accent:'#38BDF8',accent2:'#0284C7'};
    return {level:'high',accent:'#5BC12F',accent2:'#3E9D1F'};
  }

  function num(value){
    if(!Number.isFinite(value))return '—';
    const a=Math.abs(value);
    return value.toLocaleString('es-EC',{maximumFractionDigits:a>=100?1:a>=10?2:3});
  }

  function paintWidget(widget,cfg){
    if(!CUSTOM_TYPES.has(String(cfg?.type||'')))return;
    const host=widget.querySelector('.tayu-av-host[data-av-v4-dashboard]');
    if(!host)return;

    const d=devices().find(item=>item.id===cfg.deviceId);
    const v=d?.variables?.find(item=>item.id===cfg.variableId);
    if(!d||!v)return;

    let value=Number(v.value);
    if(!Number.isFinite(value)){
      try{
        const h=window.mbHistory?.(d,v)||[];
        const last=h[h.length-1];
        value=Number(last?.v);
      }catch(_){ value=NaN; }
    }
    if(!Number.isFinite(value))return;

    const range=bounds(cfg,v,value);
    const pct=percent(value,range.min,range.max);
    const colors=palette(cfg.type,pct);
    const signature=`${cfg.type}|${value}|${range.min}|${range.max}|${colors.level}`;
    if(host.dataset.avLiveSignature===signature)return;
    host.dataset.avLiveSignature=signature;
    host.dataset.avLevel=colors.level;
    host.style.setProperty('--tayu-av-accent',colors.accent);
    host.style.setProperty('--tayu-av-accent-2',colors.accent2);

    const valueEl=host.querySelector('[data-av-value]');
    const pctEl=host.querySelector('[data-av-percent]');
    const minEl=host.querySelector('[data-av-min]');
    const maxEl=host.querySelector('[data-av-max]');
    const unit=String(v.unit||'');
    if(valueEl)valueEl.textContent=num(value);
    if(pctEl){pctEl.textContent=`${Math.round(pct)}%`;pctEl.style.color=colors.accent;}
    if(minEl)minEl.textContent=`Mín ${num(range.min)}${unit?` ${unit}`:''}`;
    if(maxEl)maxEl.textContent=`Máx ${num(range.max)}${unit?` ${unit}`:''}`;

    const fill=host.querySelector('[data-av-fill]');
    if(fill){
      fill.style.background=`linear-gradient(180deg,${colors.accent} 0%,${colors.accent} 36%,${colors.accent2} 100%)`;
      fill.style.height=`${pct}%`;
    }

    const gauge=host.querySelector('[data-av-gauge]');
    if(gauge){
      gauge.style.stroke=colors.accent;
      gauge.setAttribute('stroke-dasharray',`${pct.toFixed(2)} 100`);
    }

    if(cfg.type==='kpi'){
      if(valueEl)valueEl.style.color=colors.accent;
      const meta=host.querySelector('[data-av-kpi-meta]');
      if(meta)meta.style.color=colors.accent;
      const line=host.querySelector('[data-av-spark] polyline');
      if(line)line.style.stroke=colors.accent;
    }
  }

  function repaint(){
    frame=0;
    if(!document.getElementById('dashboard')?.classList.contains('active'))return;
    const map=configs();
    document.querySelectorAll('#dashboard .dashboard-widget[data-widget-id]').forEach(widget=>{
      const cfg=map[widget.dataset.widgetId||''];
      if(cfg)paintWidget(widget,cfg);
    });
  }

  function schedule(){
    if(frame)return;
    frame=requestAnimationFrame(repaint);
  }

  function install(){
    clearInterval(timer);
    timer=setInterval(schedule,2000);
    document.addEventListener('click',event=>{
      if(event.target?.closest?.('.nav button[data-view="dashboard"]'))setTimeout(schedule,80);
    },true);
    window.addEventListener('pageshow',()=>setTimeout(schedule,100));
    window.addEventListener('tayu:client-access-ready',()=>setTimeout(schedule,120));
    setTimeout(schedule,150);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();

(() => {
  'use strict';
  if(document.getElementById('tayuSectorOperationStabilityLoader'))return;
  const script=document.createElement('script');
  script.id='tayuSectorOperationStabilityLoader';
  script.src='cloud-client-sector-operation-stability.js?v=20260914-opstable1';
  script.async=false;
  document.head.appendChild(script);
})();
