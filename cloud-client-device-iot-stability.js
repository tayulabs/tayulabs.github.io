(() => {
  'use strict';

  const savedModes=new Map();
  const pendingModes=new Map();
  let lightBusy=false;
  let lightTimer=null;

  const opKey=(deviceKey,outputKey)=>`${String(deviceKey||'')}|${String(outputKey||'')}`;
  const canConfigure=()=>['owner','admin'].includes(String(
    window.__tayuClientAccess?.role || document.body?.dataset?.tayuRole || ''
  ).toLowerCase());
  const sectorLabel=value=>({
    fincas:'Fincas',camaroneras:'Camaroneras',bananeras:'Bananeras',ganaderia:'Ganadería'
  })[String(value||'').toLowerCase()]||'Sin sector';

  function parsePayload(row){
    const value=row?.payload;
    if(value&&typeof value==='object')return value;
    if(typeof value==='string'){
      try{return JSON.parse(value);}catch(_){return {};}
    }
    return {};
  }

  function readPath(obj,path){
    return String(path||'').split('.').filter(Boolean).reduce((acc,key)=>acc==null?undefined:acc[key],obj);
  }

  function readOutput(payload,outputKey){
    const values=[payload?.[outputKey],payload?.outputs?.[outputKey],payload?.io?.[outputKey],payload?.relays?.[outputKey],payload?.[`${outputKey}_state`]];
    const value=values.find(item=>item!==undefined&&item!==null);
    if(value===true||value===false)return value;
    if(value===1||value==='1'||String(value).toLowerCase()==='on'||String(value).toLowerCase()==='true')return true;
    if(value===0||value==='0'||String(value).toLowerCase()==='off'||String(value).toLowerCase()==='false')return false;
    return undefined;
  }

  function applyModeUi(card,mode,settling=false){
    if(!card)return;
    mode=String(mode||'manual').toLowerCase();
    const badge=card.querySelector('.tayu-sector-resource-top > .tayu-sector-pill');
    if(badge)badge.textContent=mode==='automatic'?'Automático':mode==='timer'?'Timer':'Manual';

    const editor=card.querySelector('[data-op-editor]');
    if(editor){
      const select=editor.querySelector('[data-op-role="mode"]');
      if(select&&select.value!==mode)select.value=mode;
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

    if(settling){button.disabled=true;button.textContent='CAMBIANDO MODO…';return;}
    if(!online){button.disabled=true;button.textContent='DISPOSITIVO OFFLINE';return;}
    if(mode!=='manual'){
      button.disabled=true;
      button.textContent=mode==='automatic'?'CONTROL AUTOMÁTICO':'CONTROL TIMER';
      return;
    }
    button.disabled=!hasState;
    button.textContent=!hasState?'ESPERANDO ESTADO':on?'APAGAR':'ENCENDER';
  }

  function patchSavedModes(root=document){
    const cards=[];
    if(root?.matches?.('[data-sector-output][data-device-key]'))cards.push(root);
    const parent=root?.closest?.('[data-sector-output][data-device-key]');
    if(parent&&!cards.includes(parent))cards.push(parent);
    root?.querySelectorAll?.('[data-sector-output][data-device-key]').forEach(card=>cards.push(card));
    cards.forEach(card=>{
      const mode=savedModes.get(opKey(card.dataset.deviceKey,card.dataset.sectorOutput));
      if(mode)applyModeUi(card,mode,false);
    });
  }

  function decorate(){
    if(!canConfigure())return;
    const devices=Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[];
    document.querySelectorAll('#tdGrid .td-card').forEach(card=>{
      const key=card.querySelector('.td-key')?.textContent?.trim();
      if(!key)return;
      const device=devices.find(row=>String(row.device_key)===key);
      let footer=card.querySelector('.td-iot-footer');
      if(!footer){
        footer=document.createElement('div');
        footer.className='td-iot-footer';
        footer.innerHTML='<span class="td-iot-sector"></span><button type="button" class="btn ghost td-iot-configure">⚙ Configurar IoT</button>';
        card.appendChild(footer);
      }
      const sector=footer.querySelector('.td-iot-sector');
      const button=footer.querySelector('.td-iot-configure');
      if(sector)sector.textContent=`Sector: ${sectorLabel(device?.site_sector)}`;
      if(button)button.dataset.deviceKey=key;
    });
  }

  function attachObserver(){
    const grid=document.getElementById('tdGrid');
    if(!grid||grid.dataset.tayuIotStableObserver==='1')return false;
    grid.dataset.tayuIotStableObserver='1';
    const observer=new MutationObserver(()=>queueMicrotask(decorate));
    observer.observe(grid,{childList:true});
    decorate();
    return true;
  }

  function boot(){
    decorate();
    if(attachObserver())return;
    let attempts=0;
    const timer=setInterval(()=>{
      attempts+=1;
      if(attachObserver()||attempts>=24){clearInterval(timer);return;}
      if(attempts%4===0)decorate();
    },250);
  }

  function tuneFullRefresh(){
    if(window.__tayuFullRefreshTuned||window.__tayuDashboardCloudLoaded!==true)return;
    const select=document.getElementById('realtimeRefreshInterval');
    if(!select||typeof window.saveGeneralSettings!=='function')return;
    if(Number(select.value)!==5000){
      select.value='5000';
      Promise.resolve(window.saveGeneralSettings()).then(()=>{window.__tayuFullRefreshTuned=true;}).catch(error=>console.warn('Ajuste de refresco:',error));
    }else window.__tayuFullRefreshTuned=true;
  }

  function scheduleTune(){
    [800,1800,3500,6000].forEach(delay=>setTimeout(tuneFullRefresh,delay));
  }

  function patchTelemetry(rows){
    const latest=new Map();
    (Array.isArray(rows)?rows:[]).forEach(row=>{
      const key=String(row?.device_key||'');
      if(!key)return;
      const previous=latest.get(key);
      if(!previous||new Date(row?.time||0)>=new Date(previous?.time||0))latest.set(key,row);
    });

    document.querySelectorAll('[data-sector-output][data-device-key]').forEach(card=>{
      const row=latest.get(String(card.dataset.deviceKey||''));
      if(!row)return;
      const value=readOutput(parsePayload(row),String(card.dataset.sectorOutput||''));
      if(value!==undefined){
        const state=card.querySelector('.tayu-sector-state');
        if(state){
          state.classList.toggle('on',value===true);
          state.classList.toggle('off',value===false);
          state.textContent=value?'● ENCENDIDO':'○ APAGADO';
        }
      }
      const mode=savedModes.get(opKey(card.dataset.deviceKey,card.dataset.sectorOutput));
      if(mode)applyModeUi(card,mode,false);
    });

    document.querySelectorAll('[data-op-editor][data-device-key]').forEach(editor=>{
      const row=latest.get(String(editor.dataset.deviceKey||''));
      if(!row)return;
      const source=editor.querySelector('[data-op-role="automatic.source"]')?.value||'';
      const reading=editor.querySelector('[data-op-reading]');
      if(!source||!reading)return;
      const value=readPath(parsePayload(row),source);
      const device=(window.__tayuRealDevices||[]).find(item=>String(item?.device_key)===String(editor.dataset.deviceKey));
      const unit=device?.configuration?.signals?.[source]?.unit||'';
      const time=new Date(row?.time||0).getTime();
      const age=Number.isFinite(time)?Math.max(0,Math.round((Date.now()-time)/1000)):null;
      reading.textContent=`Lectura actual: ${value===undefined?'—':value}${unit?` ${unit}`:''}${age===null?'':` · telemetría hace ${age} s`}`;
    });
  }

  async function fastTelemetry(){
    clearTimeout(lightTimer);
    if(document.hidden){lightTimer=setTimeout(fastTelemetry,1000);return;}
    if(lightBusy||typeof window.__tayuApi!=='function'){
      lightTimer=setTimeout(fastTelemetry,500);
      return;
    }
    lightBusy=true;
    try{
      const rows=await window.__tayuApi('/telemetry/latest');
      if(Array.isArray(rows)){
        window.__tayuLastTelemetry=rows;
        patchTelemetry(rows);
        window.__tayuAutomationRuntime?.evaluate?.();
      }
    }catch(error){
      console.warn('Telemetría rápida:',error);
    }finally{
      lightBusy=false;
      lightTimer=setTimeout(fastTelemetry,1000);
    }
  }

  function startFastTelemetry(){
    if(window.__tayuFastTelemetryStarted)return;
    window.__tayuFastTelemetryStarted=true;
    clearTimeout(lightTimer);
    lightTimer=setTimeout(fastTelemetry,250);
  }

  async function settlePendingModes(){
    const now=Date.now();
    for(const [key,item] of [...pendingModes.entries()]){
      const editor=item.editor;
      if(!editor?.isConnected){pendingModes.delete(key);continue;}
      const text=String(editor.querySelector('.tayu-op-msg')?.textContent||'');
      if(text.startsWith('Guardado.')){
        savedModes.set(key,item.mode);
        const card=editor.closest('[data-sector-output]');
        applyModeUi(card,item.mode,true);
        try{
          window.__tayuAutomationRuntime?.invalidate?.(item.deviceKey);
          await window.__tayuAutomationRuntime?.reload?.();
        }catch(error){console.warn('Recarga de modo:',error);}
        applyModeUi(card,item.mode,false);
        pendingModes.delete(key);
      }else if(/No se pudo|Selecciona|Completa|Configura/.test(text)||now-item.startedAt>12000){
        applyModeUi(editor.closest('[data-sector-output]'),item.previous,false);
        pendingModes.delete(key);
      }
    }
  }

  window.addEventListener('click',event=>{
    const save=event.target?.closest?.('[data-op-save]');
    if(save){
      const editor=save.closest('[data-op-editor]');
      const deviceKey=editor?.dataset?.deviceKey;
      const outputKey=editor?.dataset?.outputKey;
      const mode=editor?.querySelector('[data-op-role="mode"]')?.value||'manual';
      if(deviceKey&&outputKey){
        const card=editor.closest('[data-sector-output]');
        const badge=String(card?.querySelector('.tayu-sector-resource-top > .tayu-sector-pill')?.textContent||'').toLowerCase();
        const previous=badge.includes('autom')?'automatic':badge.includes('timer')?'timer':'manual';
        const key=opKey(deviceKey,outputKey);
        pendingModes.set(key,{editor,deviceKey,outputKey,mode,previous,startedAt:Date.now()});
        applyModeUi(card,mode,true);
        setTimeout(settlePendingModes,80);
      }
    }
  },true);

  const observer=new MutationObserver(records=>{
    let shouldSettle=false;
    records.forEach(record=>{
      record.addedNodes.forEach(node=>{if(node?.nodeType===1)patchSavedModes(node);});
      if(record.target?.closest?.('.tayu-op-msg,[data-op-editor]'))shouldSettle=true;
    });
    if(shouldSettle)setTimeout(settlePendingModes,0);
  });
  if(document.documentElement)observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});

  window.addEventListener('tayu:client-access-ready',()=>{
    setTimeout(boot,0);
    scheduleTune();
    startFastTelemetry();
  });

  document.addEventListener('click',event=>{
    if(event.target?.closest?.('.nav button[data-view="dispositivos"], #tdRefresh'))setTimeout(boot,0);
  },true);

  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden){
      clearTimeout(lightTimer);
      lightTimer=setTimeout(fastTelemetry,100);
    }
  });

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{
      boot();
      scheduleTune();
      startFastTelemetry();
    },{once:true});
  }else{
    boot();
    scheduleTune();
    startFastTelemetry();
  }
})();