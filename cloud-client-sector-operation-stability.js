(() => {
  'use strict';

  const SECTORS=new Set(['fincas','camaroneras','bananeras','ganaderia']);
  let liveTimer=null;
  const observers=[];

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function latestPayload(deviceKey){
    const rows=(Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[])
      .filter(row=>String(row?.device_key||'')===String(deviceKey||''))
      .sort((a,b)=>new Date(b?.time||0)-new Date(a?.time||0));
    const value=rows[0]?.payload;
    if(value&&typeof value==='object')return value;
    if(typeof value==='string'){try{return JSON.parse(value);}catch(_){}}
    return {};
  }

  function realModbusDevice(deviceKey){
    const list=Array.isArray(window.modbusDevices)?window.modbusDevices:[];
    const exact=`real-${deviceKey}`;
    return list.find(item=>String(item?.id||'')===exact)
      || list.find(item=>String(item?.device_key||item?.deviceKey||'')===String(deviceKey||''))
      || null;
  }

  function configuredSignals(deviceKey){
    const device=realModbusDevice(deviceKey);
    const payload=latestPayload(deviceKey);
    const modbus=payload?.modbus&&typeof payload.modbus==='object'?payload.modbus:{};
    const variables=Array.isArray(device?.variables)?device.variables:[];
    const seen=new Set();
    return variables
      .filter(variable=>variable&&variable.name)
      .map(variable=>{
        const name=String(variable.name).trim();
        const path=`modbus.${name}`;
        const key=path.toLowerCase();
        if(!name||seen.has(key))return null;
        seen.add(key);
        const live=Object.prototype.hasOwnProperty.call(modbus,name)?modbus[name]:variable.value;
        return {path,label:name,unit:String(variable.unit||''),value:live};
      })
      .filter(Boolean)
      .sort((a,b)=>a.label.localeCompare(b.label,'es'));
  }

  function signalSignature(signals){
    return signals.map(item=>`${item.path}|${item.label}|${item.unit}`).join('||');
  }

  function syncEditorSignals(editor){
    const deviceKey=editor?.dataset?.deviceKey;
    const select=editor?.querySelector?.('[data-op-role="automatic.source"]');
    if(!deviceKey||!select)return;
    const signals=configuredSignals(deviceKey);
    if(!signals.length)return;

    const signature=signalSignature(signals);
    const selected=select.value;
    if(select.dataset.tayuSignalSignature!==signature){
      const valid=signals.some(item=>item.path===selected);
      select.innerHTML='<option value="">Seleccionar sensor RS485…</option>'+signals.map(item=>
        `<option value="${esc(item.path)}">RS485 · ${esc(item.label)}${item.unit?` (${esc(item.unit)})`:''}</option>`
      ).join('');
      select.dataset.tayuSignalSignature=signature;
      select.value=valid?selected:'';
      if(selected&&!valid){
        const reading=editor.querySelector('[data-op-reading]');
        if(reading)reading.textContent='La señal guardada ya no pertenece a los parámetros Modbus configurados. Selecciona uno de los sensores disponibles y guarda nuevamente.';
      }
    }
    updateReading(editor);
  }

  function updateReading(editor){
    const deviceKey=editor?.dataset?.deviceKey;
    const select=editor?.querySelector?.('[data-op-role="automatic.source"]');
    const reading=editor?.querySelector?.('[data-op-reading]');
    if(!deviceKey||!select||!reading)return;
    const path=select.value;
    if(!path){
      if(!reading.textContent.includes('ya no pertenece'))reading.textContent='Selecciona un sensor RS485 previamente registrado.';
      return;
    }
    const signal=configuredSignals(deviceKey).find(item=>item.path===path);
    if(!signal){reading.textContent='Sensor guardado; lectura actual no disponible.';return;}
    reading.textContent=`Lectura actual: ${signal.value===undefined||signal.value===null?'—':signal.value}${signal.unit?` ${signal.unit}`:''}`;
  }

  function syncActiveEditors(){
    for(const sector of SECTORS){
      const view=document.getElementById(sector);
      if(!view?.classList.contains('active'))continue;
      view.querySelectorAll('[data-op-editor]').forEach(syncEditorSignals);
    }
  }

  function numberOrNull(value){
    if(value===''||value==null)return null;
    const n=Number(value);return Number.isFinite(n)?n:null;
  }

  function collectTimers(editor){
    return [...editor.querySelectorAll('[data-op-timer-slot]')].map(slot=>({
      on:slot.querySelector('[data-op-timer="on"]')?.value||'',
      off:slot.querySelector('[data-op-timer="off"]')?.value||'',
      days:[...slot.querySelectorAll('[data-op-day]:checked')].map(input=>Number(input.dataset.opDay))
    })).filter(slot=>slot.on||slot.off);
  }

  function effectiveApplication(resource,device,outputKey){
    const legacy=device?.configuration?.outputs?.[outputKey]||{};
    return resource?.assignment?.application||legacy.application||legacy.type||resource?.default_application||'generic';
  }

  function effectiveName(resource,device,outputKey){
    const legacy=device?.configuration?.outputs?.[outputKey]||{};
    return resource?.assignment?.display_name||legacy.name||`Relay ${String(outputKey).replace(/\D/g,'')||outputKey}`;
  }

  function deviceByKey(deviceKey){
    return (Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[])
      .find(row=>String(row?.device_key||'')===String(deviceKey||''))||{};
  }

  function updateCardAfterSave(editor,mode){
    const card=editor.closest('[data-sector-output]');
    if(!card)return;
    const label=mode==='automatic'?'Automático':mode==='timer'?'Timer':'Manual';
    const icon=mode==='automatic'?'⚙ Automático':mode==='timer'?'🕒 Timer':'👆 Manual';
    const topBadge=card.querySelector('.tayu-sector-resource-top > .tayu-sector-pill');
    if(topBadge)topBadge.textContent=label;
    const editorBadge=editor.querySelector('.tayu-op-head .tayu-sector-pill');
    if(editorBadge)editorBadge.textContent=icon;
    const control=card.querySelector('[data-sector-toggle]');
    if(control&&mode!=='manual'){
      control.disabled=true;
      control.textContent=`CONTROL ${label.toUpperCase()}`;
    }
  }

  async function saveOperation(editor,button){
    const deviceKey=editor.dataset.deviceKey;
    const outputKey=editor.dataset.outputKey;
    const msg=editor.querySelector('.tayu-op-msg');
    if(!deviceKey||!outputKey||typeof window.__tayuApi!=='function'||typeof window.__tayuApiPost!=='function')return;
    try{
      if(button)button.disabled=true;
      if(msg){msg.style.color='var(--muted)';msg.textContent='Guardando…';}
      const data=await window.__tayuApi(`/devices/iot-resources?device_key=${encodeURIComponent(deviceKey)}`);
      const resource=data?.resources?.find(item=>String(item?.resource_key||'')===String(outputKey));
      if(!resource)throw new Error('No se encontró el recurso físico.');

      syncEditorSignals(editor);
      const mode=editor.querySelector('[data-op-role="mode"]')?.value||'manual';
      const settings={...(resource.assignment?.settings||{})};
      settings.mode=mode;
      settings.automatic={
        source:editor.querySelector('[data-op-role="automatic.source"]')?.value||'',
        on_operator:editor.querySelector('[data-op-role="automatic.on_operator"]')?.value||'<=',
        on_value:numberOrNull(editor.querySelector('[data-op-role="automatic.on_value"]')?.value),
        off_operator:editor.querySelector('[data-op-role="automatic.off_operator"]')?.value||'>=',
        off_value:numberOrNull(editor.querySelector('[data-op-role="automatic.off_value"]')?.value),
        fail_safe:editor.querySelector('[data-op-role="automatic.fail_safe"]')?.value||'off'
      };
      settings.timers=collectTimers(editor);

      if(mode==='automatic'&&!settings.automatic.source)throw new Error('Selecciona uno de los parámetros Modbus configurados para el modo automático.');
      if(mode==='automatic'&&(settings.automatic.on_value===null||settings.automatic.off_value===null))throw new Error('Completa los valores de encendido y apagado.');
      if(mode==='timer'&&!settings.timers.some(slot=>slot.on&&slot.off))throw new Error('Configura al menos un horario completo.');

      const device=deviceByKey(deviceKey);
      await window.__tayuApiPost('/devices/iot-resources',{
        device_key:deviceKey,
        resource_key:outputKey,
        application:effectiveApplication(resource,device,outputKey),
        display_name:effectiveName(resource,device,outputKey),
        enabled:resource.assignment?.enabled!==false,
        settings
      });

      // No reconstruimos el sector después de guardar. Esa reconstrucción completa
      // podía interrumpir visualmente lecturas/widgets aunque la telemetría siguiera llegando.
      updateCardAfterSave(editor,mode);
      if(msg){msg.style.color='var(--brand)';msg.textContent='Guardado. La telemetría continúa activa.';}
      try{await window.refreshLiveTelemetry?.(true);}catch(error){console.warn('Refresco ligero después de guardar modo:',error);}
      updateReading(editor);
    }catch(error){
      if(msg){msg.style.color='var(--danger)';msg.textContent=error?.message||'No se pudo guardar.';}
    }finally{
      if(button)button.disabled=false;
    }
  }

  function bindScopedObservers(){
    observers.splice(0).forEach(observer=>observer.disconnect());
    for(const sector of SECTORS){
      const view=document.getElementById(sector);if(!view)continue;
      const observer=new MutationObserver(mutations=>{
        if(!mutations.some(item=>item.type==='childList'&&item.addedNodes.length))return;
        requestAnimationFrame(()=>view.querySelectorAll('[data-op-editor]').forEach(syncEditorSignals));
      });
      observer.observe(view,{childList:true,subtree:true});
      observers.push(observer);
    }
  }

  function install(){
    bindScopedObservers();
    syncActiveEditors();

    // window/capture corre antes que el listener document/capture del módulo original.
    // Reemplazamos únicamente el guardado para evitar el rerender completo del sector.
    window.addEventListener('click',event=>{
      const button=event.target?.closest?.('[data-op-save]');
      const editor=button?.closest?.('[data-op-editor]');
      if(!button||!editor)return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      saveOperation(editor,button);
    },true);

    document.addEventListener('change',event=>{
      const select=event.target?.closest?.('[data-op-role="automatic.source"]');
      if(select)updateReading(select.closest('[data-op-editor]'));
    },true);

    document.addEventListener('click',event=>{
      const nav=event.target?.closest?.('.nav button[data-view]');
      if(SECTORS.has(nav?.dataset?.view))setTimeout(syncActiveEditors,250);
    },true);

    clearInterval(liveTimer);
    liveTimer=setInterval(syncActiveEditors,2000);
    window.addEventListener('pageshow',()=>setTimeout(syncActiveEditors,150));
    window.addEventListener('tayu:client-access-ready',()=>setTimeout(syncActiveEditors,250));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
