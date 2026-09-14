(() => {
  'use strict';

  const VERSION='20260914-production3';
  if(window.__tayuSectorOperationStabilityVersion===VERSION)return;
  window.__tayuSectorOperationStabilityVersion=VERSION;

  const SECTORS=new Set(['fincas','camaroneras','bananeras','ganaderia']);
  const observers=[];
  let telemetryFrame=0;

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function ensureTelemetryEventBridge(){
    if(window.__tayuTelemetryEventBridgeVersion==='20260914-event1')return;
    const descriptor=Object.getOwnPropertyDescriptor(window,'__tayuLastTelemetry');
    if(descriptor && descriptor.configurable===false)return;

    let current=window.__tayuLastTelemetry;
    let scheduled=false;
    const emit=()=>{
      if(scheduled)return;
      scheduled=true;
      queueMicrotask(()=>{
        scheduled=false;
        window.dispatchEvent(new CustomEvent('tayu:telemetry-updated',{detail:{telemetry:current}}));
      });
    };

    Object.defineProperty(window,'__tayuLastTelemetry',{
      configurable:true,
      enumerable:true,
      get(){return current;},
      set(value){
        current=value;
        emit();
      }
    });
    window.__tayuEmitTelemetryUpdated=emit;
    window.__tayuTelemetryEventBridgeVersion='20260914-event1';
  }

  function numberOrNull(value){
    if(value===''||value===null||value===undefined)return null;
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  }

  function deviceByKey(deviceKey){
    return (Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[])
      .find(row=>String(row?.device_key||'')===String(deviceKey||''))||{};
  }

  function latestRow(deviceKey){
    let latest=null;
    for(const row of(Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[])){
      if(String(row?.device_key||'')!==String(deviceKey||''))continue;
      if(!latest||new Date(row?.time||0)>new Date(latest?.time||0))latest=row;
    }
    return latest;
  }

  function parsePayload(row){
    const value=row?.payload;
    if(value&&typeof value==='object')return value;
    if(typeof value==='string'){
      try{return JSON.parse(value);}catch(_){return {};}
    }
    return {};
  }

  function readPath(object,path){
    return String(path||'').split('.').filter(Boolean).reduce((acc,key)=>acc==null?undefined:acc[key],object);
  }

  function configuredSensors(deviceKey){
    const device=deviceByKey(deviceKey);
    const payload=parsePayload(latestRow(deviceKey));
    return Object.entries(device?.configuration?.signals||{})
      .filter(([path,meta])=>path&&meta?.enabled!==false&&meta?.alerts_disabled!==true)
      .map(([path,meta])=>({
        path:String(path),
        label:meta?.name||meta?.label||meta?.display_name||path,
        unit:String(meta?.unit||''),
        min:numberOrNull(meta?.alarm_min),
        max:numberOrNull(meta?.alarm_max),
        value:readPath(payload,path)
      }))
      .sort((a,b)=>String(a.label).localeCompare(String(b.label),'es'));
  }

  function ensureStyles(){
    if(document.getElementById('tayuAutomaticProductionStyles'))return;
    const style=document.createElement('style');
    style.id='tayuAutomaticProductionStyles';
    style.textContent=`
      [data-op-panel="automatic"] .tayu-op-rule{display:none!important}
      .tayu-op-threshold-summary{margin-top:8px;padding:9px 10px;border-radius:10px;background:var(--panel);border:1px solid var(--border);font-size:11px;color:var(--muted);line-height:1.45}
      .tayu-op-failsafe-row{margin-top:9px;max-width:280px}
      .tayu-op-failsafe-row label{display:block;margin:0 0 5px;font-size:11px;color:var(--muted);font-weight:800}
      .tayu-op-failsafe-row select{width:100%;padding:9px 10px;border-radius:10px}
    `;
    document.head.appendChild(style);
  }

  function ensureProductionUi(editor){
    const panel=editor?.querySelector?.('[data-op-panel="automatic"]');
    const reading=editor?.querySelector?.('[data-op-reading]');
    if(!panel||!reading)return;

    editor.querySelector('[data-op-sensor-link-box]')?.remove();

    let summary=editor.querySelector('[data-op-production-thresholds]');
    if(!summary){
      summary=document.createElement('div');
      summary.dataset.opProductionThresholds='1';
      summary.className='tayu-op-threshold-summary';
      reading.insertAdjacentElement('afterend',summary);
    }

    let failsafe=editor.querySelector('[data-op-production-failsafe]');
    const select=editor.querySelector('[data-op-role="automatic.fail_safe"]');
    if(!failsafe&&select){
      failsafe=document.createElement('div');
      failsafe.dataset.opProductionFailsafe='1';
      failsafe.className='tayu-op-failsafe-row';
      failsafe.innerHTML='<label>Falla de sensor</label>';
      failsafe.appendChild(select);
      summary.insertAdjacentElement('afterend',failsafe);
    }
  }

  function setValue(element,value){
    if(!element)return;
    const next=String(value??'');
    if(element.value!==next)element.value=next;
  }

  function setText(element,value){
    if(!element)return;
    const next=String(value??'');
    if(element.textContent!==next)element.textContent=next;
  }

  function setHtml(element,value){
    if(!element)return;
    if(element.innerHTML!==value)element.innerHTML=value;
  }

  function syncEditor(editor,telemetryOnly=false){
    if(!editor)return;
    const mode=editor.querySelector('[data-op-role="mode"]')?.value||'manual';
    if(telemetryOnly&&mode!=='automatic')return;

    ensureProductionUi(editor);
    const deviceKey=editor.dataset.deviceKey||'';
    const select=editor.querySelector('[data-op-role="automatic.source"]');
    const reading=editor.querySelector('[data-op-reading]');
    const summary=editor.querySelector('[data-op-production-thresholds]');
    if(!deviceKey||!select||!reading||!summary)return;

    const sensors=configuredSensors(deviceKey);
    const selected=select.value;
    const signature=sensors.map(item=>`${item.path}|${item.label}|${item.unit}|${item.min}|${item.max}`).join('||');
    if(select.dataset.tayuProductionSignature!==signature){
      const valid=sensors.some(item=>item.path===selected);
      const html='<option value="">Seleccionar sensor…</option>'+sensors.map(item=>
        `<option value="${esc(item.path)}">${esc(item.label)}${item.unit?` (${esc(item.unit)})`:''}</option>`
      ).join('');
      if(select.innerHTML!==html)select.innerHTML=html;
      select.dataset.tayuProductionSignature=signature;
      setValue(select,valid?selected:'');
    }

    const sensor=sensors.find(item=>item.path===select.value)||null;
    setValue(editor.querySelector('[data-op-role="automatic.on_operator"]'),'<=');
    setValue(editor.querySelector('[data-op-role="automatic.off_operator"]'),'>=');
    setValue(editor.querySelector('[data-op-role="automatic.on_value"]'),sensor?.min??'');
    setValue(editor.querySelector('[data-op-role="automatic.off_value"]'),sensor?.max??'');

    if(!sensor){
      setText(reading,select.value?'El sensor seleccionado ya no está disponible en Sensores.':'Selecciona un sensor configurado en Sensores.');
      setText(summary,'La automatización usa directamente los umbrales mínimo y máximo configurados en Sensores.');
      return;
    }

    const value=sensor.value===undefined||sensor.value===null?'—':sensor.value;
    setText(reading,`Lectura actual: ${value}${sensor.unit?` ${sensor.unit}`:''}`);
    setHtml(summary,`<b>Umbrales de Sensores:</b> encender ≤ ${esc(sensor.min??'—')}${sensor.unit?` ${esc(sensor.unit)}`:''} · apagar ≥ ${esc(sensor.max??'—')}${sensor.unit?` ${esc(sensor.unit)}`:''}`);
  }

  function activeEditors(automaticOnly=false){
    const result=[];
    for(const sector of SECTORS){
      const view=document.getElementById(sector);
      if(!view?.classList.contains('active'))continue;
      view.querySelectorAll('[data-op-editor]').forEach(editor=>{
        if(!automaticOnly||editor.querySelector('[data-op-role="mode"]')?.value==='automatic')result.push(editor);
      });
    }
    return result;
  }

  function syncActiveEditors(telemetryOnly=false){
    activeEditors(telemetryOnly).forEach(editor=>syncEditor(editor,telemetryOnly));
  }

  function scheduleTelemetrySync(){
    if(telemetryFrame)return;
    telemetryFrame=requestAnimationFrame(()=>{
      telemetryFrame=0;
      syncActiveEditors(true);
    });
  }

  function editorsFromAddedNode(node){
    if(node?.nodeType!==1)return [];
    const result=[];
    if(node.matches?.('[data-op-editor]'))result.push(node);
    node.querySelectorAll?.('[data-op-editor]').forEach(editor=>result.push(editor));
    return result;
  }

  function bindObservers(){
    observers.splice(0).forEach(observer=>observer.disconnect());
    for(const sector of SECTORS){
      const view=document.getElementById(sector);
      if(!view)continue;
      const observer=new MutationObserver(records=>{
        const editors=new Set();
        for(const record of records){
          for(const node of record.addedNodes){
            editorsFromAddedNode(node).forEach(editor=>editors.add(editor));
          }
        }
        if(!editors.size)return;
        requestAnimationFrame(()=>editors.forEach(editor=>syncEditor(editor,false)));
      });
      observer.observe(view,{childList:true,subtree:true});
      observers.push(observer);
    }
  }

  function install(){
    ensureTelemetryEventBridge();
    ensureStyles();
    bindObservers();
    syncActiveEditors(false);

    document.addEventListener('change',event=>{
      const editor=event.target?.closest?.('[data-op-editor]');
      if(!editor)return;
      if(event.target.matches('[data-op-role="automatic.source"],[data-op-role="mode"]'))syncEditor(editor,false);
    },true);

    document.addEventListener('click',event=>{
      const nav=event.target?.closest?.('.nav button[data-view]');
      if(SECTORS.has(nav?.dataset?.view))setTimeout(()=>syncActiveEditors(false),80);
    },true);

    window.addEventListener('tayu:telemetry-updated',scheduleTelemetrySync);
    window.addEventListener('pageshow',()=>setTimeout(()=>syncActiveEditors(false),80));
    window.addEventListener('tayu:client-access-ready',()=>setTimeout(()=>syncActiveEditors(false),100));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();