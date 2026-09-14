(() => {
  'use strict';

  const operationOverrides=new Map();
  const saveBusy=new Set();

  function parsePayload(row){
    const value=row?.payload;
    if(value&&typeof value==='object')return value;
    if(typeof value==='string'){
      try{return JSON.parse(value);}catch(_){return {};}
    }
    return {};
  }

  function latestRow(deviceKey){
    let latest=null;
    for(const row of (Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[])){
      if(String(row?.device_key)!==String(deviceKey))continue;
      if(!latest||new Date(row?.time||0)>new Date(latest?.time||0))latest=row;
    }
    return latest;
  }

  function readOutput(deviceKey,outputKey){
    const payload=parsePayload(latestRow(deviceKey));
    const candidates=[payload?.[outputKey],payload?.outputs?.[outputKey],payload?.io?.[outputKey],payload?.relays?.[outputKey],payload?.[`${outputKey}_state`]];
    const value=candidates.find(item=>item!==undefined&&item!==null);
    if(value===true||value===false)return value;
    if(value===1||value==='1'||String(value).toLowerCase()==='on'||String(value).toLowerCase()==='true')return true;
    if(value===0||value==='0'||String(value).toLowerCase()==='off'||String(value).toLowerCase()==='false')return false;
    return undefined;
  }

  function patchTelemetry(deviceKey,outputKey,value){
    const row=latestRow(deviceKey);
    if(!row)return;
    const payload=parsePayload(row);
    payload[outputKey]=Boolean(value);
    if(payload.outputs&&typeof payload.outputs==='object')payload.outputs[outputKey]=Boolean(value);
    if(payload.relays&&typeof payload.relays==='object')payload.relays[outputKey]=Boolean(value);
    row.payload=payload;
  }

  function updateSectorCard(button,value,pending=false){
    const card=button?.closest?.('[data-sector-output]');
    if(!card)return;
    const state=card.querySelector('.tayu-sector-state');
    if(state){
      state.classList.toggle('on',Boolean(value));
      state.classList.toggle('off',!value);
      state.textContent=pending?(value?'● ENCENDIENDO…':'○ APAGANDO…'):(value?'● ENCENDIDO':'○ APAGADO');
    }
    button.dataset.next=value?'0':'1';
    button.classList.toggle('ghost',Boolean(value));
    button.textContent=pending?(value?'ENCENDIENDO…':'APAGANDO…'):(value?'APAGAR':'ENCENDER');
  }

  function updateNovaCard(button,value,pending=false){
    const card=button?.closest?.('.nova-relay-card');
    if(!card)return;
    card.classList.toggle('on',Boolean(value));
    card.classList.toggle('off',!value);
    const state=card.querySelector('.relay-state');
    if(state)state.textContent=pending?(value?'● ENCENDIENDO…':'○ APAGANDO…'):(value?'● ENCENDIDO':'○ APAGADO');
    button.textContent=pending?(value?'ENCENDIENDO…':'APAGANDO…'):(value?'APAGAR':'ENCENDER');
  }

  function updateButtonUi(button,value,pending=false){
    updateSectorCard(button,value,pending);
    updateNovaCard(button,value,pending);
  }

  async function smoothSetOutput(deviceKey,outputKey,value,button){
    const next=Boolean(value);
    const previous=readOutput(deviceKey,outputKey);
    const previousText=button?.textContent||'';
    try{
      if(button){
        button.disabled=true;
        updateButtonUi(button,next,true);
      }
      if(typeof window.__tayuApiPost!=='function')throw new Error('API de la plataforma no disponible');
      await window.__tayuApiPost('/devices/output',{
        device_key:deviceKey,
        output_key:outputKey,
        value:next
      });
      patchTelemetry(deviceKey,outputKey,next);
      if(button)updateButtonUi(button,next,false);
      return true;
    }catch(error){
      console.error('Control IoT:',error);
      if(button&&previous!==undefined)updateButtonUi(button,previous,false);
      else if(button&&previousText)button.textContent=previousText;
      alert(`No se pudo controlar ${outputKey}: ${error.message||error}`);
      return false;
    }finally{
      if(button)button.disabled=false;
    }
  }

  function numberOrNull(value){
    if(value===''||value==null)return null;
    const n=Number(value);
    return Number.isFinite(n)?n:null;
  }

  function collectOperation(editor){
    const get=role=>editor.querySelector(`[data-op-role="${role}"]`)?.value??'';
    return {
      mode:get('mode')||'manual',
      automatic:{
        source:get('automatic.source')||'',
        on_operator:get('automatic.on_operator')||'<=',
        on_value:numberOrNull(get('automatic.on_value')),
        off_operator:get('automatic.off_operator')||'>=',
        off_value:numberOrNull(get('automatic.off_value')),
        fail_safe:get('automatic.fail_safe')||'off'
      },
      timers:[...editor.querySelectorAll('[data-op-timer-slot]')].map(slot=>({
        on:slot.querySelector('[data-op-timer="on"]')?.value||'',
        off:slot.querySelector('[data-op-timer="off"]')?.value||'',
        days:[...slot.querySelectorAll('[data-op-day]:checked')].map(input=>Number(input.dataset.opDay))
      })).filter(slot=>slot.on||slot.off)
    };
  }

  const operationKey=(deviceKey,outputKey)=>`${deviceKey}|${outputKey}`;

  function applyOperationUi(card,settings){
    if(!card||!settings)return;
    const mode=String(settings.mode||'manual').toLowerCase();
    const badge=card.querySelector('.tayu-sector-resource-top > .tayu-sector-pill');
    if(badge)badge.textContent=mode==='automatic'?'Automático':mode==='timer'?'Timer':'Manual';

    const editor=card.querySelector('[data-op-editor]');
    if(editor){
      const modeSelect=editor.querySelector('[data-op-role="mode"]');
      if(modeSelect&&modeSelect.value!==mode)modeSelect.value=mode;
      editor.querySelectorAll('[data-op-panel]').forEach(panel=>panel.hidden=panel.dataset.opPanel!==mode);
      const editorBadge=editor.querySelector('.tayu-op-head .tayu-sector-pill');
      if(editorBadge)editorBadge.textContent=mode==='automatic'?'⚙ Automático':mode==='timer'?'🕒 Timer':'👆 Manual';
    }

    const button=card.querySelector('[data-sector-toggle]');
    if(!button)return;
    const state=card.querySelector('.tayu-sector-state');
    const on=Boolean(state?.classList.contains('on'));
    const hasState=Boolean(state&&!String(state.textContent||'').includes('SIN LECTURA'));
    const online=Boolean(card.closest('.tayu-sector-device')?.querySelector('.tayu-sector-status.online'));
    button.dataset.next=on?'0':'1';
    button.classList.toggle('ghost',on);

    if(!online){button.disabled=true;button.textContent='DISPOSITIVO OFFLINE';return;}
    if(mode!=='manual'){
      button.disabled=true;
      button.textContent=mode==='automatic'?'CONTROL AUTOMÁTICO':'CONTROL TIMER';
      return;
    }
    button.disabled=!hasState;
    button.textContent=!hasState?'ESPERANDO ESTADO':on?'APAGAR':'ENCENDER';
  }

  function applyKnownOverrides(root=document){
    const cards=[];
    if(root?.matches?.('[data-sector-output][data-device-key]'))cards.push(root);
    root?.querySelectorAll?.('[data-sector-output][data-device-key]').forEach(card=>cards.push(card));
    cards.forEach(card=>{
      const settings=operationOverrides.get(operationKey(card.dataset.deviceKey,card.dataset.sectorOutput));
      if(settings)applyOperationUi(card,settings);
    });
  }

  async function saveOperationFixed(editor,button){
    if(!editor||typeof window.__tayuApi!=='function'||typeof window.__tayuApiPost!=='function')return;
    const deviceKey=editor.dataset.deviceKey;
    const outputKey=editor.dataset.outputKey;
    const key=operationKey(deviceKey,outputKey);
    if(!deviceKey||!outputKey||saveBusy.has(key))return;
    const msg=editor.querySelector('.tayu-op-msg');
    const settings=collectOperation(editor);

    if(settings.mode==='automatic'&&!settings.automatic.source){if(msg)msg.textContent='Selecciona un sensor RS485 para el modo automático.';return;}
    if(settings.mode==='automatic'&&(settings.automatic.on_value===null||settings.automatic.off_value===null)){if(msg)msg.textContent='Completa los valores de encendido y apagado.';return;}
    if(settings.mode==='timer'&&!settings.timers.some(slot=>slot.on&&slot.off)){if(msg)msg.textContent='Configura al menos un horario completo.';return;}

    saveBusy.add(key);
    if(button)button.disabled=true;
    try{
      if(msg){msg.style.color='var(--muted)';msg.textContent='Guardando…';}
      const data=await window.__tayuApi(`/devices/iot-resources?device_key=${encodeURIComponent(deviceKey)}`);
      const resource=data?.resources?.find(item=>String(item.resource_key)===String(outputKey));
      if(!resource)throw new Error('No se encontró el recurso físico.');
      const device=(window.__tayuRealDevices||[]).find(item=>String(item?.device_key)===String(deviceKey));
      const legacy=device?.configuration?.outputs?.[outputKey]||{};
      const application=resource.assignment?.application||legacy.application||legacy.type||resource.default_application||'generic';
      const displayName=resource.assignment?.display_name||legacy.name||`Relay ${String(outputKey).replace(/\D/g,'')||outputKey}`;

      await window.__tayuApiPost('/devices/iot-resources',{
        device_key:deviceKey,
        resource_key:outputKey,
        application,
        display_name:displayName,
        enabled:resource.assignment?.enabled!==false,
        settings
      });

      operationOverrides.set(key,settings);
      const card=editor.closest('[data-sector-output]');
      applyOperationUi(card,settings);

      const runtime=window.__tayuAutomationRuntime;
      try{
        if(typeof runtime?.reloadDevice==='function') await runtime.reloadDevice(deviceKey);
        else{
          runtime?.invalidate?.(deviceKey);
          if(typeof runtime?.evaluate==='function') await runtime.evaluate();
        }
      }catch(error){
        console.warn('Recarga de automatización:',error);
      }
      applyOperationUi(card,settings);

      if(msg){
        msg.style.color='var(--brand)';
        msg.textContent=settings.mode==='manual'?'Guardado. Control manual activo.':settings.mode==='automatic'?'Guardado. Control automático activo.':'Guardado. Timer activo.';
      }
    }catch(error){
      console.error('Guardar modo IoT:',error);
      if(msg){msg.style.color='var(--danger)';msg.textContent=error.message||'No se pudo guardar.';}
    }finally{
      saveBusy.delete(key);
      if(button)button.disabled=false;
    }
  }

  function ensureAutomationRuntime(){
    if(window.__tayuAutomationRuntime||document.querySelector('script[data-tayu-automation-runtime]'))return;
    const script=document.createElement('script');
    script.src='cloud-client-automation-runtime.js?v=20260914-automation3';
    script.dataset.tayuAutomationRuntime='1';
    script.onerror=()=>console.error('No se pudo cargar el runtime de automatización.');
    document.head.appendChild(script);
  }

  window.setGenericOutput=smoothSetOutput;
  window.setNovaRelay=(deviceKey,relay,state,button)=>smoothSetOutput(deviceKey,`relay${Number(relay)}`,state,button);

  window.addEventListener('click',event=>{
    const save=event.target?.closest?.('[data-op-save]');
    if(save){
      const editor=save.closest('[data-op-editor]');
      if(editor){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        saveOperationFixed(editor,save);
        return;
      }
    }

    const outputButton=event.target?.closest?.('[data-sector-toggle]');
    if(!outputButton)return;
    const card=outputButton.closest('[data-sector-output][data-device-key]');
    if(!card)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(outputButton.disabled)return;
    smoothSetOutput(card.dataset.deviceKey,card.dataset.sectorOutput,outputButton.dataset.next==='1',outputButton);
  },true);

  const observer=new MutationObserver(records=>{
    records.forEach(record=>record.addedNodes.forEach(node=>{
      if(node?.nodeType===1)applyKnownOverrides(node);
    }));
  });
  if(document.documentElement)observer.observe(document.documentElement,{childList:true,subtree:true});

  ensureAutomationRuntime();
  setTimeout(()=>applyKnownOverrides(document),0);
})();