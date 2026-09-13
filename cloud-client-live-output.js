(() => {
  'use strict';

  function parsePayload(row){
    const value=row?.payload;
    if(value && typeof value==='object') return value;
    if(typeof value==='string'){
      try{return JSON.parse(value);}catch(_){return {};}
    }
    return {};
  }

  function latestRow(deviceKey){
    const rows=(Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[])
      .filter(row=>String(row?.device_key)===String(deviceKey))
      .sort((a,b)=>new Date(b?.time||0)-new Date(a?.time||0));
    return rows[0]||null;
  }

  function readOutput(deviceKey,outputKey){
    const payload=parsePayload(latestRow(deviceKey));
    const candidates=[
      payload?.[outputKey],
      payload?.outputs?.[outputKey],
      payload?.io?.[outputKey],
      payload?.relays?.[outputKey],
      payload?.[`${outputKey}_state`]
    ];
    const value=candidates.find(item=>item!==undefined&&item!==null);
    if(value===true||value===false)return value;
    if(value===1||value==='1'||String(value).toLowerCase()==='on'||String(value).toLowerCase()==='true')return true;
    if(value===0||value==='0'||String(value).toLowerCase()==='off'||String(value).toLowerCase()==='false')return false;
    return undefined;
  }

  function patchTelemetry(deviceKey,outputKey,value){
    const row=latestRow(deviceKey);
    if(!row)return;
    let payload=parsePayload(row);
    if(!payload || typeof payload!=='object')payload={};
    payload[outputKey]=Boolean(value);
    if(payload.outputs && typeof payload.outputs==='object')payload.outputs[outputKey]=Boolean(value);
    if(payload.relays && typeof payload.relays==='object')payload.relays[outputKey]=Boolean(value);
    row.payload=payload;
  }

  function updateSectorCard(button,value,pending=false){
    const card=button?.closest?.('[data-sector-output]');
    if(!card)return;
    const state=card.querySelector('.tayu-sector-state');
    if(state){
      state.classList.toggle('on',Boolean(value));
      state.classList.toggle('off',!value);
      state.textContent=pending
        ? (value?'● ENCENDIENDO…':'○ APAGANDO…')
        : (value?'● ENCENDIDO':'○ APAGADO');
    }
    button.dataset.next=value?'0':'1';
    button.classList.toggle('ghost',Boolean(value));
    button.textContent=pending
      ? (value?'ENCENDIENDO…':'APAGANDO…')
      : (value?'APAGAR':'ENCENDER');
  }

  function updateNovaCard(button,value,pending=false){
    const card=button?.closest?.('.nova-relay-card');
    if(!card)return;
    card.classList.toggle('on',Boolean(value));
    card.classList.toggle('off',!value);
    const state=card.querySelector('.relay-state');
    if(state)state.textContent=pending
      ? (value?'● ENCENDIENDO…':'○ APAGANDO…')
      : (value?'● ENCENDIDO':'○ APAGADO');
    button.textContent=pending
      ? (value?'ENCENDIENDO…':'APAGANDO…')
      : (value?'APAGAR':'ENCENDER');
  }

  function updateButtonUi(button,value,pending=false){
    updateSectorCard(button,value,pending);
    updateNovaCard(button,value,pending);
  }

  async function lightweightRefresh(){
    try{
      if(typeof window.refreshLiveTelemetry==='function')await window.refreshLiveTelemetry();
    }catch(error){
      console.warn('Telemetría ligera después de comando:',error);
    }
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

      // Actualización optimista: no reconstruimos toda la plataforma.
      patchTelemetry(deviceKey,outputKey,next);
      if(button)updateButtonUi(button,next,false);

      // Confirmación ligera desde telemetría; refreshLiveTelemetry actualiza los
      // datos en memoria y widgets sin ejecutar refreshRealData(), que reconstruía
      // vistas completas y provocaba el parpadeo visible.
      setTimeout(async()=>{
        await lightweightRefresh();
        const confirmed=readOutput(deviceKey,outputKey);
        if(button && confirmed!==undefined)updateButtonUi(button,confirmed,false);
      },700);
      return true;
    }catch(error){
      console.error('Control IoT:',error);
      if(button && previous!==undefined)updateButtonUi(button,previous,false);
      else if(button && previousText)button.textContent=previousText;
      alert(`No se pudo controlar ${outputKey}: ${error.message||error}`);
      return false;
    }finally{
      if(button)button.disabled=false;
    }
  }

  // Sustituye la variante antigua que hacía refreshRealData(true) después de
  // cada comando y reconstruía gran parte de la interfaz.
  window.setGenericOutput=smoothSetOutput;
  window.setNovaRelay=(deviceKey,relay,state,button)=>
    smoothSetOutput(deviceKey,`relay${Number(relay)}`,state,button);

  // cloud-client-sector-iot.js posee un listener delegado en document que,
  // después del comando, ejecuta un refresh completo del sector. Interceptamos
  // el clic en window/capture antes de llegar a ese listener y usamos la ruta
  // ligera anterior.
  window.addEventListener('click',event=>{
    const button=event.target?.closest?.('[data-sector-toggle]');
    if(!button)return;
    const card=button.closest('[data-sector-output][data-device-key]');
    if(!card)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(button.disabled)return;
    smoothSetOutput(
      card.dataset.deviceKey,
      card.dataset.sectorOutput,
      button.dataset.next==='1',
      button
    );
  },true);
})();