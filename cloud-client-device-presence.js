(() => {
  'use strict';

  const VERSION='20260915-presence1';
  if(window.__tayuDevicePresenceVersion===VERSION)return;
  window.__tayuDevicePresenceVersion=VERSION;

  // Un NOVA de control necesita presencia/telemetría reciente para considerarse
  // operativo. No confiamos sólo en device.status porque puede quedar rezagado.
  const ONLINE_TTL_MS=45000;
  let timer=null;

  function devices(){
    return Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[];
  }

  function deviceByKey(deviceKey){
    return devices().find(item=>String(item?.device_key||'')===String(deviceKey||''))||null;
  }

  function latestRow(deviceKey){
    let latest=null;
    for(const row of(Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[])){
      if(String(row?.device_key||'')!==String(deviceKey||''))continue;
      if(!latest||new Date(row?.time||0)>new Date(latest?.time||0))latest=row;
    }
    return latest;
  }

  function parseTime(value){
    const time=new Date(value||0).getTime();
    return Number.isFinite(time)&&time>0?time:0;
  }

  function lastSeenAt(deviceKey){
    const device=deviceByKey(deviceKey);
    const candidates=[
      parseTime(latestRow(deviceKey)?.time),
      parseTime(device?.last_seen_at),
      parseTime(device?.last_seen),
      parseTime(device?.lastSeen),
      parseTime(device?.last_telemetry_at),
      parseTime(device?.lastTelemetryAt)
    ];
    return Math.max(0,...candidates);
  }

  function isOnline(deviceKey){
    const device=deviceByKey(deviceKey);
    if(!device)return false;
    const explicit=String(device?.status||'').toLowerCase();
    if(explicit==='offline')return false;
    const seen=lastSeenAt(deviceKey);
    if(!seen)return false;
    return Date.now()-seen<ONLINE_TTL_MS;
  }

  function parsePayload(row){
    const value=row?.payload;
    if(value&&typeof value==='object')return value;
    if(typeof value==='string'){
      try{return JSON.parse(value);}catch(_){return {};}
    }
    return {};
  }

  function readOutput(deviceKey,outputKey){
    const payload=parsePayload(latestRow(deviceKey));
    const values=[
      payload?.[outputKey],payload?.outputs?.[outputKey],payload?.io?.[outputKey],
      payload?.relays?.[outputKey],payload?.[`${outputKey}_state`]
    ];
    const value=values.find(item=>item!==undefined&&item!==null);
    if(value===true||value===false)return value;
    if(value===1||value==='1'||String(value).toLowerCase()==='on'||String(value).toLowerCase()==='true')return true;
    if(value===0||value==='0'||String(value).toLowerCase()==='off'||String(value).toLowerCase()==='false')return false;
    return undefined;
  }

  function modeOf(card){
    const select=card.querySelector('[data-op-role="mode"]');
    if(select?.value)return String(select.value).toLowerCase();
    const label=String(card.querySelector('.tayu-sector-resource-top > .tayu-sector-pill')?.textContent||'').toLowerCase();
    if(label.includes('autom'))return'automatic';
    if(label.includes('timer'))return'timer';
    return'manual';
  }

  function ensureStyle(){
    if(document.getElementById('tayuDevicePresenceStyles'))return;
    const style=document.createElement('style');
    style.id='tayuDevicePresenceStyles';
    style.textContent=`
      .tayu-presence-note{margin-top:8px;padding:8px 10px;border-radius:10px;border:1px solid rgba(245,158,11,.28);background:rgba(245,158,11,.08);color:var(--warning);font-size:11px;font-weight:800;line-height:1.4}
    `;
    document.head.appendChild(style);
  }

  function syncCard(card,online){
    const deviceKey=card.dataset.deviceKey||'';
    const outputKey=card.dataset.sectorOutput||'';
    const mode=modeOf(card);
    const state=card.querySelector('.tayu-sector-state');
    const pill=card.querySelector('.tayu-sector-resource-top > .tayu-sector-pill');
    const button=card.querySelector('[data-sector-toggle]');
    let note=card.querySelector('[data-tayu-presence-note]');

    if(!online){
      if(pill){
        pill.textContent=mode==='automatic'?'Automático · Pausado':mode==='timer'?'Timer · Pausado':'Manual';
      }
      if(state){
        state.classList.remove('on','off');
        state.textContent='— SIN CONEXIÓN';
      }
      if(button){
        button.disabled=true;
        button.textContent='DISPOSITIVO OFFLINE';
      }
      if((mode==='automatic'||mode==='timer')&&!note){
        note=document.createElement('div');
        note.dataset.tayuPresenceNote='1';
        note.className='tayu-presence-note';
        note.textContent='Automatización pausada mientras el dispositivo está offline. La configuración se conserva y se reanuda cuando vuelva a reportar.';
        card.querySelector('.tayu-sector-control')?.insertAdjacentElement('beforebegin',note);
      }
      return;
    }

    note?.remove();
    if(pill)pill.textContent=mode==='automatic'?'Automático':mode==='timer'?'Timer':'Manual';

    const value=readOutput(deviceKey,outputKey);
    if(state){
      state.classList.toggle('on',value===true);
      state.classList.toggle('off',value===false);
      state.textContent=value===undefined?'— SIN LECTURA':value?'● ENCENDIDO':'○ APAGADO';
    }
    if(button){
      if(mode==='automatic'){
        button.disabled=true;
        button.textContent='CONTROL AUTOMÁTICO';
      }else if(mode==='timer'){
        button.disabled=true;
        button.textContent='CONTROL TIMER';
      }else if(value===undefined){
        button.disabled=true;
        button.textContent='ESPERANDO ESTADO';
      }else{
        button.disabled=false;
        button.dataset.next=value?'0':'1';
        button.classList.toggle('ghost',Boolean(value));
        button.textContent=value?'APAGAR':'ENCENDER';
      }
    }
  }

  function syncVisiblePresence(){
    ensureStyle();
    document.querySelectorAll('.tayu-sector-device').forEach(deviceCard=>{
      const resource=deviceCard.querySelector('[data-sector-output][data-device-key]');
      const deviceKey=resource?.dataset?.deviceKey||deviceCard.querySelector('.tayu-sector-device-key')?.textContent?.trim()||'';
      if(!deviceKey)return;
      const online=isOnline(deviceKey);
      const badge=deviceCard.querySelector('.tayu-sector-status');
      if(badge){
        badge.classList.toggle('online',online);
        badge.textContent=online?'ONLINE':'OFFLINE';
      }
      deviceCard.querySelectorAll('[data-sector-output][data-device-key]').forEach(card=>syncCard(card,online));
    });
  }

  function installOutputGuard(){
    const original=window.__tayuApiPost;
    if(typeof original!=='function'||original.__tayuPresenceGuard)return;
    const guarded=async function(path,body,...rest){
      if(String(path)==='/devices/output'&&body?.device_key&&!isOnline(body.device_key)){
        throw new Error('Dispositivo offline: no se envió la orden de salida.');
      }
      return original.call(this,path,body,...rest);
    };
    guarded.__tayuPresenceGuard=true;
    guarded.__tayuPresenceOriginal=original;
    window.__tayuApiPost=guarded;
  }

  function install(){
    window.__tayuIsDeviceOnline=isOnline;
    window.__tayuDeviceLastSeenAt=lastSeenAt;
    installOutputGuard();
    syncVisiblePresence();

    window.addEventListener('tayu:telemetry-updated',syncVisiblePresence);
    window.addEventListener('tayu:client-access-ready',()=>setTimeout(()=>{installOutputGuard();syncVisiblePresence();},120));
    window.addEventListener('pageshow',()=>setTimeout(syncVisiblePresence,80));
    document.addEventListener('click',event=>{
      if(event.target?.closest?.('.nav button[data-view="fincas"],.nav button[data-view="camaroneras"],.nav button[data-view="bananeras"],.nav button[data-view="ganaderia"]'))setTimeout(syncVisiblePresence,180);
    },true);

    clearInterval(timer);
    // Sólo revisa presencia y texto visible; no consulta API ni reconstruye vistas.
    timer=setInterval(syncVisiblePresence,5000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
