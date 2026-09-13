(() => {
  'use strict';

  const SECTORS = new Set(['fincas','camaroneras','bananeras','ganaderia']);
  const LABELS = {fincas:'Fincas',camaroneras:'Camaroneras',bananeras:'Bananeras',ganaderia:'Ganadería'};
  const APP_LABELS = {
    generic:'Salida genérica',aerator:'Aireador eléctrico',feeder:'Alimentador automático',
    irrigation_pump:'Bomba de riego',water_pump:'Bomba de agua',pump:'Bomba de agua',well_pump:'Bomba de pozo',
    valve:'Válvula',motor:'Motor',lighting:'Iluminación',generic_input:'Entrada genérica',
    float_switch:'Flotador / nivel',pump_state:'Estado de bomba',pressure_switch:'Presostato',alarm:'Alarma',dry_contact:'Contacto seco',
    modbus:'Modbus RS485',interface:'Interfaz genérica',tracking:'Tracking / ubicación',sensor:'Sensor'
  };
  const TYPE_LABELS = {digital_output:'Salida',digital_input:'Entrada',interface:'Comunicación',location:'Ubicación',sensor:'Sensor'};
  const DAY_LABELS = {1:'Lun',2:'Mar',3:'Mié',4:'Jue',5:'Vie',6:'Sáb',7:'Dom'};
  const resourceCache = new Map();
  const renderingSectors = new Set();
  const scheduledTimers = new Map();

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function injectStyles(){
    if(document.getElementById('tayuSectorIotStyles'))return;
    const style=document.createElement('style');style.id='tayuSectorIotStyles';style.textContent=`
      .tayu-sector-iot{margin-bottom:18px}.banana-shell>.tayu-sector-iot{margin:16px 0}
      .tayu-sector-iot-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}.tayu-sector-iot-head h3{margin:0}.tayu-sector-iot-head p{margin:6px 0 0}
      .tayu-sector-iot-list{display:grid;gap:14px;margin-top:16px}.tayu-sector-device{border:1px solid var(--border);background:var(--panel2);border-radius:18px;padding:15px}
      .tayu-sector-device-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.tayu-sector-device-head h4{margin:0;font-size:17px}.tayu-sector-device-key{font-size:11px;color:var(--muted);margin-top:4px}
      .tayu-sector-device-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.tayu-sector-pill{padding:5px 8px;border-radius:999px;border:1px solid var(--border);background:var(--panel);font-size:10px;font-weight:850}
      .tayu-sector-status{padding:6px 9px;border-radius:999px;font-size:10px;font-weight:900;background:rgba(239,68,68,.10);color:var(--danger)}.tayu-sector-status.online{background:rgba(91,193,47,.12);color:var(--brand)}
      .tayu-sector-resources{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:13px}.tayu-sector-resource{border:1px solid var(--border);background:var(--panel);border-radius:15px;padding:12px}
      .tayu-sector-resource-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.tayu-sector-resource h5{margin:0;font-size:14px}.tayu-sector-resource small{color:var(--muted)}
      .tayu-sector-state{font-size:17px;font-weight:900;margin-top:8px}.tayu-sector-state.on{color:var(--brand)}.tayu-sector-state.off{color:var(--muted)}
      .tayu-sector-control{margin-top:10px}.tayu-sector-control .btn{width:100%;padding:9px 11px;border-radius:11px;font-size:12px}.tayu-sector-note{margin-top:8px;font-size:11px;color:var(--muted);line-height:1.45}
      .tayu-sector-mode-detail{margin-top:9px;padding:9px 10px;border-radius:11px;border:1px solid var(--border);background:var(--panel2);font-size:11px;line-height:1.5}.tayu-sector-mode-detail b{color:var(--text)}
      .tayu-sector-secondary{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.tayu-sector-secondary .tayu-sector-pill{background:var(--panel2)}
      .tayu-sector-empty{padding:20px;border:1px dashed var(--border);border-radius:16px;background:var(--panel2);color:var(--muted);text-align:center}
      @media(max-width:760px){.tayu-sector-resources{grid-template-columns:1fr}.tayu-sector-iot-head .btn{width:100%}}
    `;document.head.appendChild(style);
  }

  function latestTelemetryMap(){
    const map=new Map();const rows=Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[];
    rows.forEach(row=>{const key=row?.device_key;if(!key)return;const previous=map.get(String(key));if(!previous||new Date(row.time||0)>=new Date(previous.time||0))map.set(String(key),row);});return map;
  }
  function payloadObject(row){const value=row?.payload;if(value&&typeof value==='object')return value;if(typeof value==='string'){try{return JSON.parse(value)}catch(_){}}return {};}
  function readPath(obj,path){return String(path||'').split('.').filter(Boolean).reduce((acc,key)=>acc==null?undefined:acc[key],obj);}
  function readOutput(payload,key){
    const candidates=[payload?.[key],payload?.outputs?.[key],payload?.io?.[key],payload?.relays?.[key],payload?.[`${key}_state`]];const value=candidates.find(item=>item!==undefined&&item!==null);
    if(value===true||value===false)return value;if(value===1||value==='1'||String(value).toLowerCase()==='on'||String(value).toLowerCase()==='true')return true;if(value===0||value==='0'||String(value).toLowerCase()==='off'||String(value).toLowerCase()==='false')return false;return undefined;
  }
  function deviceOnline(device,telemetry){const state=String(device?.status||'').toLowerCase();if(state==='online')return true;if(state==='offline')return false;const time=new Date(telemetry?.time||0).getTime();return Number.isFinite(time)&&Date.now()-time<90000;}

  function resourceLabel(resource){
    const assignment=resource?.assignment||{};if(assignment.display_name)return assignment.display_name;const app=assignment.application||resource?.default_application;if(APP_LABELS[app])return APP_LABELS[app];
    const key=String(resource?.resource_key||'');if(/^relay\d+$/i.test(key))return`Relay ${key.replace(/\D/g,'')}`;if(/^din\d+$/i.test(key))return`Entrada digital ${key.replace(/\D/g,'')}`;if(key==='rs485')return'RS485 / Modbus';if(key==='gps')return'GPS / ubicación';return key||'Recurso';
  }
  function applicationLabel(resource){const app=resource?.assignment?.application||resource?.default_application||'';return APP_LABELS[app]||app||TYPE_LABELS[resource?.resource_type]||'Recurso';}

  function hideLegacyNovaCamaroneras(){
    const view=document.getElementById('camaroneras');if(!view)return;
    view.querySelectorAll('.nova-edge-panel').forEach(element=>{if(!element.dataset.tayuSectorOwned)element.style.display='none';});
    view.querySelectorAll('details').forEach(details=>{const summary=details.querySelector(':scope > summary')?.textContent||'';if(/NOVA\s*EDGE/i.test(summary))details.style.display='none';});
  }

  function mountInfo(sector){
    const view=document.getElementById(sector);if(!view)return null;
    if(sector==='bananeras'){
      const shell=view.querySelector('.banana-shell');if(!shell)return{view,target:null,before:null};
      const firstContent=[...shell.children].find(child=>child.classList?.contains('banana-section-card'))||null;return{view,target:shell,before:firstContent};
    }
    return{view,target:view,before:view.firstChild};
  }
  function ensureHost(sector){
    injectStyles();const info=mountInfo(sector);if(!info?.view||!info.target)return null;
    let host=info.view.querySelector(`[data-tayu-sector-iot="${sector}"]`);if(!host){host=document.createElement('div');host.className='card tayu-sector-iot';host.dataset.tayuSectorIot=sector;host.dataset.tayuSectorOwned='1';}
    if(host.parentElement!==info.target||(info.before&&host.nextElementSibling!==info.before))info.target.insertBefore(host,info.before);return host;
  }
  function scheduleSectorRender(sector,force=false){
    if(!SECTORS.has(sector))return;(scheduledTimers.get(sector)||[]).forEach(clearTimeout);const delays=sector==='bananeras'?[40,350,1000]:[40,350];scheduledTimers.set(sector,delays.map(delay=>setTimeout(()=>renderSector(sector,force),delay)));
  }
  async function loadResources(deviceKey,force=false){const key=String(deviceKey||'');if(!force&&resourceCache.has(key))return resourceCache.get(key);if(typeof window.__tayuApi!=='function')throw new Error('API no disponible');const data=await window.__tayuApi(`/devices/iot-resources?device_key=${encodeURIComponent(key)}`);resourceCache.set(key,data);return data;}

  function modeDetail(resource,payload){
    const settings=resource?.assignment?.settings||{};const mode=String(settings.mode||'manual').toLowerCase();
    if(mode==='automatic'){
      const auto=settings.automatic||{};const source=auto.source||'';const value=source?readPath(payload,source):undefined;
      return `<div class="tayu-sector-mode-detail"><b>Sensor RS485:</b> ${esc(source||'Sin asignar')}${value!==undefined?` · ${esc(value)}`:''}<br><b>Encender:</b> ${esc(auto.on_operator||'<=')} ${esc(auto.on_value??'—')} · <b>Apagar:</b> ${esc(auto.off_operator||'>=')} ${esc(auto.off_value??'—')}<br><b>Falla de sensor:</b> ${auto.fail_safe==='hold'?'Mantener último estado':'Apagar salida'}</div>`;
    }
    if(mode==='timer'){
      const timers=Array.isArray(settings.timers)&&settings.timers.length?settings.timers:(settings.timer?[settings.timer]:[]);
      if(!timers.length)return'<div class="tayu-sector-mode-detail">Timer sin horarios configurados.</div>';
      return `<div class="tayu-sector-mode-detail">${timers.map((timer,index)=>{const days=(timer.days||[]).map(day=>DAY_LABELS[day]||day).join(' ');return `<b>Horario ${index+1}:</b> ${esc(timer.on||'--:--')} → ${esc(timer.off||'--:--')}${days?` · ${esc(days)}`:''}`;}).join('<br>')}</div>`;
    }
    return '';
  }

  function renderOutput(resource,device,telemetry,sector){
    const payload=payloadObject(telemetry);const key=String(resource.resource_key||'');const state=readOutput(payload,key);const on=state===true;const assignment=resource.assignment||null;const enabled=assignment?.enabled!==false;const mode=String(assignment?.settings?.mode||'manual').toLowerCase();const manual=mode==='manual'||!mode;const online=deviceOnline(device,telemetry);const controllable=resource.controllable!==false&&enabled&&manual;const stateText=state===undefined?'— SIN LECTURA':on?'● ENCENDIDO':'○ APAGADO';const modeText=manual?'Manual':mode==='automatic'?'Automático':mode==='timer'?'Timer':mode;
    return `<article class="tayu-sector-resource" data-sector-output="${esc(key)}" data-device-key="${esc(device.device_key)}" data-sector="${esc(sector)}"><div class="tayu-sector-resource-top"><div><h5>${esc(resourceLabel(resource))}</h5><small>${esc(key)} · ${esc(applicationLabel(resource))}</small></div><span class="tayu-sector-pill">${esc(modeText)}</span></div><div class="tayu-sector-state ${on?'on':'off'}">${esc(stateText)}</div>${modeDetail(resource,payload)}${assignment?'':'<div class="tayu-sector-note">Sin asignación específica. Configúralo desde Dispositivos → Configurar IoT.</div>'}${!enabled?'<div class="tayu-sector-note">Este recurso está desactivado.</div>':''}<div class="tayu-sector-control"><button type="button" class="btn ${on?'ghost':''}" data-sector-toggle ${(!online||!controllable||state===undefined)?'disabled':''} data-next="${on?'0':'1'}">${!online?'DISPOSITIVO OFFLINE':!enabled?'RECURSO INACTIVO':!manual?`CONTROL ${esc(modeText.toUpperCase())}`:state===undefined?'ESPERANDO ESTADO':on?'APAGAR':'ENCENDER'}</button></div></article>`;
  }

  function renderSecondaryResources(resources){const secondary=resources.filter(resource=>resource.resource_type!=='digital_output');if(!secondary.length)return'';return`<div class="tayu-sector-secondary">${secondary.map(resource=>{const type=TYPE_LABELS[resource.resource_type]||'Recurso';const app=applicationLabel(resource);return`<span class="tayu-sector-pill">${esc(type)}: ${esc(resourceLabel(resource))}${app?` · ${esc(app)}`:''}</span>`;}).join('')}</div>`;}
  function renderDevice(device,resourceData,telemetry,sector){const resources=Array.isArray(resourceData?.resources)?resourceData.resources:[];const outputs=resources.filter(resource=>resource.resource_type==='digital_output');const online=deviceOnline(device,telemetry);const profile=device.profile_name||device.profile_key||device.device_type||'Dispositivo IoT';const site=device.site_name||resourceData?.device?.site_name||'Sin sitio';return`<section class="tayu-sector-device"><div class="tayu-sector-device-head"><div><h4>${esc(device.name||device.device_key)}</h4><div class="tayu-sector-device-key">${esc(device.device_key)}</div><div class="tayu-sector-device-meta"><span class="tayu-sector-pill">${esc(profile)}</span><span class="tayu-sector-pill">Sitio: ${esc(site)}</span><span class="tayu-sector-pill">Sector: ${esc(LABELS[sector]||sector)}</span></div></div><span class="tayu-sector-status ${online?'online':''}">${online?'ONLINE':'OFFLINE'}</span></div>${outputs.length?`<div class="tayu-sector-resources">${outputs.map(resource=>renderOutput(resource,device,telemetry,sector)).join('')}</div>`:'<div class="tayu-sector-note">Este dispositivo no declara salidas digitales controlables.</div>'}${renderSecondaryResources(resources)}</section>`;}

  async function renderSector(sector,force=false){
    if(!SECTORS.has(sector)||renderingSectors.has(sector))return;const view=document.getElementById(sector);if(!view)return;renderingSectors.add(sector);
    try{
      hideLegacyNovaCamaroneras();const host=ensureHost(sector);if(!host)return;const devices=(Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[]).filter(device=>String(device?.site_sector||'').toLowerCase()===sector);
      host.innerHTML=`<div class="tayu-sector-iot-head"><div><h3>IoT y automatización · ${esc(LABELS[sector])}</h3><p class="hint">Control universal: aplicación, modo Manual / Automático / Timer y recursos físicos del dispositivo.</p></div><button type="button" class="btn ghost" data-sector-iot-refresh="${esc(sector)}">Actualizar</button></div><div class="tayu-sector-iot-list"><div class="tayu-sector-empty">Cargando dispositivos IoT…</div></div>`;
      const listHost=host.querySelector('.tayu-sector-iot-list');if(!devices.length){listHost.innerHTML=`<div class="tayu-sector-empty">No hay dispositivos IoT asignados a ${esc(LABELS[sector])}. La asignación se administra desde Cloud Admin.</div>`;return;}
      const telemetryMap=latestTelemetryMap();const rows=await Promise.all(devices.map(async device=>{try{return renderDevice(device,await loadResources(device.device_key,force),telemetryMap.get(String(device.device_key)),sector);}catch(error){return`<section class="tayu-sector-device"><div class="tayu-sector-device-head"><div><h4>${esc(device.name||device.device_key)}</h4><div class="tayu-sector-device-key">${esc(device.device_key)}</div></div></div><div class="tayu-sector-note">No se pudieron cargar los recursos: ${esc(error.message)}</div></section>`;}}));listHost.innerHTML=rows.join('');
    }finally{renderingSectors.delete(sector);}
  }

  async function refreshSector(sector){try{await window.refreshRealData?.();}catch(_){}resourceCache.clear();await renderSector(sector,true);}
  async function toggleOutput(button){const card=button.closest('[data-sector-output]');if(!card||typeof window.setGenericOutput!=='function')return;const deviceKey=card.dataset.deviceKey;const outputKey=card.dataset.sectorOutput;const sector=card.dataset.sector;const next=button.dataset.next==='1';try{await window.setGenericOutput(deviceKey,outputKey,next,button);await refreshSector(sector);}catch(error){console.error('Sector IoT output:',error);}}

  document.addEventListener('click',event=>{
    const nav=event.target?.closest?.('.nav button[data-view]');const sector=nav?.dataset?.view;if(SECTORS.has(sector)){scheduleSectorRender(sector,false);return;}
    const refresh=event.target?.closest?.('[data-sector-iot-refresh]');if(refresh){event.preventDefault();refreshSector(refresh.dataset.sectorIotRefresh);return;}
    const toggle=event.target?.closest?.('[data-sector-toggle]');if(toggle){event.preventDefault();toggleOutput(toggle);}
  },true);
  window.addEventListener('tayu:client-access-ready',()=>{hideLegacyNovaCamaroneras();for(const sector of SECTORS){if(document.getElementById(sector)?.classList.contains('active'))scheduleSectorRender(sector,false);}});
  window.addEventListener('pageshow',()=>{hideLegacyNovaCamaroneras();for(const sector of SECTORS){if(document.getElementById(sector)?.classList.contains('active'))scheduleSectorRender(sector,false);}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hideLegacyNovaCamaroneras,{once:true});else hideLegacyNovaCamaroneras();
  window.__tayuRenderSectorIot=renderSector;
})();
