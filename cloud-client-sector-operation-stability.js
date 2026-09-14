(() => {
  'use strict';

  const SECTORS=new Set(['fincas','camaroneras','bananeras','ganaderia']);
  let liveTimer=null;
  let refreshTimer=null;
  let refreshBusy=false;
  const observers=[];

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function latestTelemetryRow(deviceKey){
    return (Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[])
      .filter(row=>String(row?.device_key||'')===String(deviceKey||''))
      .sort((a,b)=>new Date(b?.time||0)-new Date(a?.time||0))[0]||null;
  }

  function latestPayload(deviceKey){
    const value=latestTelemetryRow(deviceKey)?.payload;
    if(value&&typeof value==='object')return value;
    if(typeof value==='string'){try{return JSON.parse(value);}catch(_){}}
    return {};
  }

  function readPath(obj,path){
    return String(path||'').split('.').filter(Boolean).reduce((acc,key)=>acc==null?undefined:acc[key],obj);
  }

  function numberOrNull(value){
    if(value===''||value==null)return null;
    const n=Number(value);return Number.isFinite(n)?n:null;
  }

  function deviceByKey(deviceKey){
    return (Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[])
      .find(row=>String(row?.device_key||'')===String(deviceKey||''))||{};
  }

  // Sensores es la fuente de verdad para automatización: usamos exactamente
  // configuration.signals, ocultando los que el usuario quitó de Sensores/alertas.
  function configuredSensors(deviceKey){
    const device=deviceByKey(deviceKey);
    const signals=device?.configuration?.signals||{};
    const payload=latestPayload(deviceKey);
    const seen=new Set();
    return Object.entries(signals)
      .filter(([path,meta])=>path&&meta?.enabled!==false&&meta?.alerts_disabled!==true)
      .map(([path,meta])=>{
        const m=meta&&typeof meta==='object'?meta:{};
        const canonical=String(path).trim();
        const key=canonical.toLowerCase();
        if(!canonical||seen.has(key))return null;
        seen.add(key);
        return {
          path:canonical,
          label:m.name||m.label||m.display_name||canonical,
          unit:String(m.unit||''),
          value:readPath(payload,canonical),
          min:numberOrNull(m.alarm_min),
          max:numberOrNull(m.alarm_max)
        };
      })
      .filter(Boolean)
      .sort((a,b)=>String(a.label).localeCompare(String(b.label),'es'));
  }

  function signalSignature(signals){
    return signals.map(item=>`${item.path}|${item.label}|${item.unit}|${item.min}|${item.max}`).join('||');
  }

  function relativeAge(deviceKey){
    const row=latestTelemetryRow(deviceKey);
    const time=new Date(row?.time||0).getTime();
    if(!Number.isFinite(time)||time<=0)return 'sin timestamp de telemetría';
    const seconds=Math.max(0,Math.round((Date.now()-time)/1000));
    if(seconds<2)return 'telemetría ahora';
    if(seconds<60)return `telemetría hace ${seconds} s`;
    const minutes=Math.floor(seconds/60);
    return `telemetría hace ${minutes} min`;
  }

  function thresholdForOperator(signal,operator){
    if(!signal)return null;
    if(operator==='<'||operator==='<=')return signal.min;
    if(operator==='>'||operator==='>=')return signal.max;
    return signal.min??signal.max;
  }

  function ensureSensorLinkUi(editor){
    const reading=editor?.querySelector?.('[data-op-reading]');
    if(!reading)return null;
    let box=editor.querySelector('[data-op-sensor-link-box]');
    if(!box){
      box=document.createElement('div');
      box.dataset.opSensorLinkBox='1';
      box.className='tayu-op-reading';
      box.style.marginTop='7px';
      box.innerHTML=`<label style="display:flex;align-items:center;gap:7px;margin:0;color:var(--text);font-weight:800"><input type="checkbox" data-op-use-sensor-thresholds checked style="width:auto;margin:0"> Usar umbrales configurados en Sensores</label><div data-op-threshold-summary style="margin-top:6px;color:var(--muted)"></div>`;
      reading.insertAdjacentElement('afterend',box);
    }
    return box;
  }

  function updateThresholdLink(editor,signal){
    const box=ensureSensorLinkUi(editor);if(!box)return;
    const checkbox=box.querySelector('[data-op-use-sensor-thresholds]');
    const summary=box.querySelector('[data-op-threshold-summary]');
    if(summary){
      if(!signal)summary.textContent='Selecciona un sensor para usar sus umbrales.';
      else summary.textContent=`Sensores: mín ${signal.min??'—'}${signal.unit?` ${signal.unit}`:''} · máx ${signal.max??'—'}${signal.unit?` ${signal.unit}`:''}`;
    }
    const linked=checkbox?.checked!==false;
    const onOp=editor.querySelector('[data-op-role="automatic.on_operator"]')?.value||'<=';
    const offOp=editor.querySelector('[data-op-role="automatic.off_operator"]')?.value||'>=';
    const onInput=editor.querySelector('[data-op-role="automatic.on_value"]');
    const offInput=editor.querySelector('[data-op-role="automatic.off_value"]');
    const onValue=thresholdForOperator(signal,onOp);
    const offValue=thresholdForOperator(signal,offOp);
    if(onInput){onInput.disabled=linked&&onValue!==null;if(linked&&onValue!==null)onInput.value=onValue;}
    if(offInput){offInput.disabled=linked&&offValue!==null;if(linked&&offValue!==null)offInput.value=offValue;}
  }

  function updateReading(editor){
    const deviceKey=editor?.dataset?.deviceKey;
    const select=editor?.querySelector?.('[data-op-role="automatic.source"]');
    const reading=editor?.querySelector?.('[data-op-reading]');
    if(!deviceKey||!select||!reading)return;
    const path=select.value;
    if(!path){
      reading.textContent='Selecciona un sensor previamente configurado en Sensores.';
      updateThresholdLink(editor,null);
      return;
    }
    const signal=configuredSensors(deviceKey).find(item=>item.path===path);
    if(!signal){
      reading.textContent='Este sensor ya no está disponible en Sensores.';
      updateThresholdLink(editor,null);
      return;
    }
    const value=signal.value===undefined||signal.value===null?'—':signal.value;
    reading.textContent=`Lectura actual: ${value}${signal.unit?` ${signal.unit}`:''} · ${relativeAge(deviceKey)}`;
    updateThresholdLink(editor,signal);
  }

  function syncEditorSignals(editor){
    const deviceKey=editor?.dataset?.deviceKey;
    const select=editor?.querySelector?.('[data-op-role="automatic.source"]');
    if(!deviceKey||!select)return;
    const signals=configuredSensors(deviceKey);
    const signature=signalSignature(signals);
    const selected=select.value;

    if(select.dataset.tayuSignalSignature!==signature){
      const valid=signals.some(item=>item.path===selected);
      select.innerHTML='<option value="">Seleccionar sensor de Sensores…</option>'+signals.map(item=>
        `<option value="${esc(item.path)}">${esc(item.label)}${item.unit?` (${esc(item.unit)})`:''}</option>`
      ).join('');
      select.dataset.tayuSignalSignature=signature;
      select.value=valid?selected:'';
      if(selected&&!valid){
        const reading=editor.querySelector('[data-op-reading]');
        if(reading)reading.textContent='La señal guardada ya no está habilitada en Sensores. Selecciona otro sensor y guarda nuevamente.';
      }
    }

    if(!signals.length){
      const reading=editor.querySelector('[data-op-reading]');
      if(reading)reading.textContent='No hay sensores habilitados en Sensores para este dispositivo.';
    }
    updateReading(editor);
  }

  function syncActiveEditors(){
    for(const sector of SECTORS){
      const view=document.getElementById(sector);
      if(!view?.classList.contains('active'))continue;
      view.querySelectorAll('[data-op-editor]').forEach(syncEditorSignals);
    }
  }

  function hasActiveAutomaticEditor(){
    for(const sector of SECTORS){
      const view=document.getElementById(sector);
      if(!view?.classList.contains('active'))continue;
      if([...view.querySelectorAll('[data-op-editor]')].some(editor=>editor.querySelector('[data-op-role="mode"]')?.value==='automatic'))return true;
    }
    return false;
  }

  async function refreshLiveAndSync(){
    if(refreshBusy||!hasActiveAutomaticEditor())return;
    refreshBusy=true;
    try{
      if(typeof window.refreshLiveTelemetry==='function')await window.refreshLiveTelemetry(true);
    }catch(error){
      console.warn('Refresco de telemetría para automático:',error);
    }finally{
      refreshBusy=false;
      syncActiveEditors();
    }
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
      const source=editor.querySelector('[data-op-role="automatic.source"]')?.value||'';
      const signal=configuredSensors(deviceKey).find(item=>item.path===source)||null;
      const useSensorThresholds=editor.querySelector('[data-op-use-sensor-thresholds]')?.checked!==false;
      const onOperator=editor.querySelector('[data-op-role="automatic.on_operator"]')?.value||'<=';
      const offOperator=editor.querySelector('[data-op-role="automatic.off_operator"]')?.value||'>=';
      let onValue=numberOrNull(editor.querySelector('[data-op-role="automatic.on_value"]')?.value);
      let offValue=numberOrNull(editor.querySelector('[data-op-role="automatic.off_value"]')?.value);

      if(useSensorThresholds&&signal){
        onValue=thresholdForOperator(signal,onOperator);
        offValue=thresholdForOperator(signal,offOperator);
      }

      const settings={...(resource.assignment?.settings||{})};
      settings.mode=mode;
      settings.automatic={
        source,
        use_sensor_thresholds:useSensorThresholds,
        on_operator:onOperator,
        on_value:onValue,
        off_operator:offOperator,
        off_value:offValue,
        fail_safe:editor.querySelector('[data-op-role="automatic.fail_safe"]')?.value||'off'
      };
      settings.timers=collectTimers(editor);

      if(mode==='automatic'&&!source)throw new Error('Selecciona un sensor configurado en Sensores para el modo automático.');
      if(mode==='automatic'&&!signal)throw new Error('El sensor seleccionado ya no está habilitado en Sensores.');
      if(mode==='automatic'&&(onValue===null||offValue===null)){
        throw new Error(useSensorThresholds?'El sensor necesita los umbrales mínimo y máximo requeridos por los operadores seleccionados. Configúralos en Sensores o desactiva “Usar umbrales”.':'Completa los valores de encendido y apagado.');
      }
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

      updateCardAfterSave(editor,mode);
      if(msg){msg.style.color='var(--brand)';msg.textContent=useSensorThresholds&&mode==='automatic'?'Guardado y vinculado a los umbrales de Sensores.':'Guardado. La telemetría continúa activa.';}
      await refreshLiveAndSync();
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

    // window/capture corre antes que el listener del módulo original.
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
      const editor=event.target?.closest?.('[data-op-editor]');
      if(!editor)return;
      if(event.target.matches('[data-op-role="automatic.source"],[data-op-role="automatic.on_operator"],[data-op-role="automatic.off_operator"],[data-op-use-sensor-thresholds]')){
        updateReading(editor);
      }
    },true);

    document.addEventListener('click',event=>{
      const nav=event.target?.closest?.('.nav button[data-view]');
      if(SECTORS.has(nav?.dataset?.view))setTimeout(()=>{syncActiveEditors();refreshLiveAndSync();},250);
    },true);

    clearInterval(liveTimer);
    clearInterval(refreshTimer);
    liveTimer=setInterval(syncActiveEditors,1000);
    refreshTimer=setInterval(refreshLiveAndSync,5000);
    window.addEventListener('pageshow',()=>setTimeout(()=>{syncActiveEditors();refreshLiveAndSync();},150));
    window.addEventListener('tayu:client-access-ready',()=>setTimeout(()=>{syncActiveEditors();refreshLiveAndSync();},250));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
