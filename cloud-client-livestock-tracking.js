/* TAYULABS Cloud · Ganadería · tracking TAURO GPS v1.0 */
(function(){
  'use strict';

  const REFRESH_MS=5000;
  const COLORS=['#22c55e','#0ea5e9','#f59e0b','#a855f7','#ef4444'];
  const s={map:null,markers:new Map(),rows:[],siteId:'',selected:'',timer:null,fitted:false,history:null};

  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const path=(o,p)=>String(p||'').split('.').reduce((a,k)=>a==null?undefined:a[k],o);
  const firstNum=(o,paths)=>{for(const p of paths){const v=num(path(o,p));if(v!==null)return v}return null};

  function coords(p={}){
    return {
      lat:firstNum(p,['lat','latitude','location.lat','gps.lat']),
      lon:firstNum(p,['lon','lng','longitude','location.lon','gps.lon'])
    };
  }

  function tauro(d){
    const text=`${d?.device_type||''} ${d?.profile_key||''} ${d?.profile_name||''} ${d?.name||''}`.toLowerCase();
    return /tauro|ganado|collar/.test(text);
  }

  function devices(){
    return (Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[]).filter(d=>{
      if(!tauro(d))return false;
      const sector=String(d?.site_sector||d?.sector_key||'').toLowerCase();
      return !sector||sector==='ganaderia';
    });
  }

  function telemetry(){
    const map=new Map();
    for(const row of (Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[])){
      const key=String(row?.device_key||row?.device_id||'');
      if(!key)continue;
      const old=map.get(key);
      if(!old||new Date(row.time||0)>=new Date(old.time||0))map.set(key,row);
    }
    return map;
  }

  function sites(){
    const map=new Map();
    devices().forEach(d=>{
      const id=String(d.site_id||'');
      if(id&&!map.has(id))map.set(id,{id,name:d.site_name||'Unidad ganadera'});
    });
    return [...map.values()];
  }

  function fallback(siteId){
    const latest=telemetry();
    return devices().filter(d=>!siteId||String(d.site_id)===String(siteId)).map((d,i)=>{
      const t=latest.get(String(d.device_key))||{},p=t.payload||{},c=coords(p);
      const code=p.animal_code||'';
      const suffix=String(code).match(/(\d+)$/)?.[1]||String(i+1).padStart(3,'0');
      const speed=firstNum(p,['speed_kmh','speed','gps.speed']);
      return {
        animal_id:null,
        animal_code:code||`GAN-${suffix}`,
        name:p.animal_name||`Vaca ${suffix}`,
        ear_tag:p.ear_tag||null,
        breed:null,
        current_weight_kg:null,
        herd:{name:p.herd||p.group||'Sin grupo'},
        device:{
          id:d.id||null,
          device_key:d.device_key,
          name:d.name,
          status:String(d.status||'offline').toLowerCase(),
          last_seen_at:d.last_seen_at||t.time||null
        },
        telemetry_time:t.time||null,
        tracking:{
          lat:c.lat,lon:c.lon,
          speed_kmh:speed,
          battery_pct:firstNum(p,['battery_pct','battery','bateria']),
          activity_index:firstNum(p,['activity_index','activity']),
          temperature_c:firstNum(p,['temperature_c','temperature','temp_c','body_temperature_c']),
          estrus_detected:Boolean(p.estrus_detected??p.heat_detected??p.in_heat??false),
          heading:firstNum(p,['heading','course']),
          satellites:firstNum(p,['satellites','sats']),
          hdop:firstNum(p,['hdop']),
          motion:typeof p.motion==='boolean'?p.motion:(speed!==null?speed>0.05:null),
          gateway_id:p.gateway_id||null,
          gateway_model:p.gateway_model||null
        }
      };
    }).filter(r=>r.tracking.lat!==null&&r.tracking.lon!==null);
  }

  async function load(siteId){
    if(typeof window.__tayuApi==='function'){
      try{
        const data=await window.__tayuApi('/livestock/tracking?site_id='+encodeURIComponent(siteId));
        if(data&&Array.isArray(data.animals))return data.animals;
      }catch(error){
        console.warn('Ganadería: endpoint de ficha completa no disponible; usando telemetría TAURO.',error);
      }
    }
    return fallback(siteId);
  }

  function color(name,index=0){
    const x=String(name||'');let h=0;
    for(let i=0;i<x.length;i++)h=((h<<5)-h)+x.charCodeAt(i);
    return COLORS[Math.abs(h||index)%COLORS.length];
  }

  function styles(){
    if(document.getElementById('tayuLivestockCss'))return;
    const style=document.createElement('style');style.id='tayuLivestockCss';style.textContent=`
      #ganaderia .lc-shell{display:grid;gap:16px}
      #ganaderia .lc-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
      #ganaderia .lc-kpi{border:1px solid var(--border);background:var(--panel);border-radius:18px;padding:15px}
      #ganaderia .lc-kpi span{display:block;color:var(--muted);font-size:12px;font-weight:700}
      #ganaderia .lc-kpi b{display:block;margin-top:6px;font-size:25px}
      #ganaderia .lc-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
      #ganaderia .lc-tools>div{flex:1;min-width:150px}
      #ganaderia .lc-layout{display:grid;grid-template-columns:minmax(0,2.1fr) minmax(300px,.9fr);gap:16px;align-items:start}
      #ganaderia .lc-map-card{padding:0!important;overflow:hidden;position:relative;height:auto;align-self:start;background:transparent!important}
      #ganaderia #cattleSatelliteMap{height:680px;min-height:540px;border-radius:20px;display:block}
      #ganaderia .lc-live{position:absolute;left:14px;top:14px;z-index:500;background:rgba(6,20,15,.9);color:#fff;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900}
      #ganaderia .lc-live i{display:inline-block;width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 5px rgba(34,197,94,.16);margin-right:7px}
      #ganaderia .lc-map-hud{position:absolute;left:14px;right:14px;bottom:14px;z-index:500;display:flex;gap:8px;flex-wrap:wrap;pointer-events:none}
      #ganaderia .lc-map-chip{background:rgba(6,20,15,.88);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:7px 10px;font-size:11px;font-weight:800;backdrop-filter:blur(8px)}
      #ganaderia .lc-side{display:grid;gap:12px;align-content:start}
      .lc-leaflet-popup .leaflet-popup-content-wrapper{border-radius:18px;box-shadow:0 18px 45px rgba(0,0,0,.24);padding:0;overflow:hidden}
      .lc-leaflet-popup .leaflet-popup-content{margin:0;width:310px!important}
      .lc-popup{padding:14px;background:#fff;color:#17231a}
      .lc-popup-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:11px}
      .lc-popup-head strong{font-size:15px}
      .lc-popup-sub{font-size:11px;color:#64748b;margin-top:3px}
      .lc-popup-status{font-size:10px;font-weight:900;padding:6px 8px;border-radius:999px;background:#e8f8df;color:#2d8f14}
      .lc-popup-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      .lc-popup-grid>div{background:#f7f9f7;border:1px solid #e5e9e5;border-radius:11px;padding:8px}
      .lc-popup-grid span{display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.03em}
      .lc-popup-grid b{display:block;margin-top:3px;font-size:11px;line-height:1.25}
      .lc-popup-foot{margin-top:10px;padding-top:9px;border-top:1px solid #edf0ed;font-size:10px;color:#64748b}
      #ganaderia .lc-list{display:grid;gap:8px;max-height:370px;overflow:auto}
      #ganaderia .lc-row{width:100%;border:1px solid var(--border);background:var(--panel2);color:var(--text);border-radius:15px;padding:11px;display:flex;justify-content:space-between;gap:10px;text-align:left;cursor:pointer}
      #ganaderia .lc-row:hover,#ganaderia .lc-row.active{outline:2px solid var(--brand);background:rgba(91,193,47,.09)}
      #ganaderia .lc-row small{display:block;color:var(--muted);margin-top:4px}
      #ganaderia .lc-right{text-align:right;white-space:nowrap;font-size:12px}
      #ganaderia .lc-detail{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
      #ganaderia .lc-detail>div{background:var(--panel2);border:1px solid var(--border);border-radius:13px;padding:10px}
      #ganaderia .lc-detail span{display:block;color:var(--muted);font-size:11px}
      #ganaderia .lc-detail b{display:block;margin-top:4px;font-size:13px;overflow-wrap:anywhere}
      #ganaderia .lc-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      #ganaderia .lc-iot-details{padding:0;overflow:hidden}
      #ganaderia .lc-iot-details>summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:14px;align-items:center;padding:15px 17px}
      #ganaderia .lc-iot-details>summary::-webkit-details-marker{display:none}
      #ganaderia .lc-iot-details>summary b{display:block}
      #ganaderia .lc-iot-details>summary small{display:block;color:var(--muted);margin-top:4px}
      #ganaderia .lc-iot-toggle{font-size:12px;font-weight:900;color:var(--brand);white-space:nowrap}
      #ganaderia .lc-iot-box{border-top:1px solid var(--border);max-height:390px;overflow:auto;padding:12px}
      #ganaderia .lc-iot-box>[data-tayu-sector-iot="ganaderia"]{margin:0!important;box-shadow:none!important}
      #ganaderia .lc-iot-box .tayu-sector-iot-list{max-height:330px;overflow:auto}
      #ganaderia .lc-iot-box .tayu-sector-device{padding:11px;border-radius:14px}
      #ganaderia .lc-iot-box .tayu-sector-resources{display:none!important}
      #ganaderia .lc-iot-box .tayu-sector-secondary{display:none!important}
      #ganaderia .lc-iot-box .tayu-sector-note{display:none!important}
      .lc-cow-icon{background:transparent!important;border:0!important}
      .lc-cow{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#fff;border:3px solid var(--cow);font-size:19px;box-shadow:0 8px 18px rgba(0,0,0,.28);transition:transform .8s ease}
      .lc-cow.online:after{content:"";position:absolute;width:8px;height:8px;border-radius:50%;right:0;bottom:0;background:#22c55e;border:2px solid #fff}
      .lc-cow.outside{--cow:#ef4444!important;border-color:#ef4444!important;box-shadow:0 0 0 5px rgba(239,68,68,.18),0 8px 18px rgba(0,0,0,.32);animation:lcDanger 1.15s infinite}
      .lc-cow.outside:before{content:"🚨";position:absolute;left:-9px;top:-13px;font-size:15px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
      .lc-row.outside{border-color:#ef4444!important;background:rgba(239,68,68,.07)!important}
      .lc-row.outside:hover,.lc-row.outside.active{outline:2px solid #ef4444!important}
      .lc-outside-banner{margin:10px 0 12px;padding:10px 12px;border-radius:13px;background:rgba(239,68,68,.10);border:1px solid rgba(239,68,68,.32);color:#b91c1c;font-size:12px;font-weight:900}
      .lc-popup-alert{margin-bottom:10px;padding:8px 10px;border-radius:11px;background:#fee2e2;border:1px solid #fecaca;color:#b91c1c;font-size:11px;font-weight:900}
      @keyframes lcDanger{50%{transform:scale(1.14);box-shadow:0 0 0 9px rgba(239,68,68,.10),0 8px 18px rgba(0,0,0,.32)}}
      .lc-cow.offline{filter:grayscale(.7);opacity:.7}
      .lc-cow.moving{animation:lcPulse 1.5s infinite}
      @keyframes lcPulse{50%{transform:scale(1.12)}}
      @media(max-width:1100px){#ganaderia .lc-kpis{grid-template-columns:repeat(3,1fr)}#ganaderia .lc-layout{grid-template-columns:1fr}}
      @media(max-width:700px){#ganaderia .lc-kpis{grid-template-columns:1fr 1fr}#ganaderia #cattleSatelliteMap{height:520px}.lc-leaflet-popup .leaflet-popup-content{width:270px!important}.lc-popup-grid{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function shell(){
    const view=document.getElementById('ganaderia');if(!view)return null;
    styles();
    if(view.dataset.livestockMap==='1')return view;
    const iot=view.querySelector('[data-tayu-sector-iot="ganaderia"]');
    try{window.cattleSatelliteMap?.remove?.()}catch(_){}
    window.cattleSatelliteMap=null;
    view.innerHTML=`
      <div class="lc-shell">
        <div class="card module-header"><div><h3>🐄 Ganadería · Mapa de ganado</h3><p class="hint">Ubicación GPS por animal, estado de TAURO, movimiento, batería y trazabilidad.</p></div><button class="btn ghost" id="lcRefresh">Actualizar datos</button></div>
        <div class="lc-kpis">
          <div class="lc-kpi"><span>Animales monitoreados</span><b id="lcTotal">0</b></div>
          <div class="lc-kpi"><span>Collares online</span><b id="lcOnline">0</b></div>
          <div class="lc-kpi"><span>En movimiento</span><b id="lcMoving">0</b></div>
          <div class="lc-kpi"><span>En reposo</span><b id="lcResting">0</b></div>
          <div class="lc-kpi"><span>Batería promedio</span><b id="lcBattery">—</b></div>
        </div>
        <div class="card lc-tools">
          <div><label>Unidad ganadera</label><select id="lcSite"></select></div>
          <div><label>Grupo / hato</label><select id="lcHerd"><option value="">Todos</option></select></div>
          <div><label>Estado</label><select id="lcStatus"><option value="">Todos</option><option value="online">Online</option><option value="offline">Offline</option></select></div>
          <div><label>Buscar animal</label><input id="lcSearch" placeholder="Código, arete, nombre…"></div>
        </div>
        <div class="lc-layout">
          <div class="card lc-map-card">
            <div class="lc-live"><i></i>TAURO GPS · seguimiento activo</div>
            <div id="cattleSatelliteMap"></div>
            <div class="lc-map-hud">
              <span class="lc-map-chip" id="lcMapAnimals">🐄 0 animales</span>
              <span class="lc-map-chip" id="lcMapGroups">📍 0 grupos</span>
              <span class="lc-map-chip" id="lcMapUpdated">🛰 Esperando datos</span>
            </div>
          </div>
          <div class="lc-side">
            <div class="card"><h3>Inventario del hato</h3><p class="hint">Selecciona un animal para centrarlo y abrir su ficha.</p><div class="lc-list" id="lcAnimalList"></div></div>
            <div class="card" id="lcAnimalDetails"><h3>Ficha del animal</h3><p class="hint">Selecciona una vaca del mapa o del listado.</p></div>
          </div>
        </div>

        <details class="card lc-iot-details" id="lcIotDetails">
          <summary>
            <span><b>Dispositivos IoT asociados</b><small id="lcIotSummary">Collares TAURO GPS vinculados a esta unidad ganadera.</small></span>
            <span class="lc-iot-toggle">Ver dispositivos ▾</span>
          </summary>
          <div class="lc-iot-box" id="lcIotBox"></div>
        </details>
      </div>
    `;
    if(iot)document.getElementById('lcIotBox')?.appendChild(iot);
    view.dataset.livestockMap='1';
    compactIotPanel();
    view.querySelector('#lcRefresh')?.addEventListener('click',()=>refresh(true));
    view.querySelector('#lcSite')?.addEventListener('change',e=>{s.siteId=e.target.value;s.fitted=false;s.selected='';refresh(true)});
    view.querySelector('#lcHerd')?.addEventListener('change',render);
    view.querySelector('#lcStatus')?.addEventListener('change',render);
    view.querySelector('#lcSearch')?.addEventListener('input',render);
    initMap();
    return view;
  }

  function compactIotPanel(){
    const view=document.getElementById('ganaderia');if(!view)return;
    const box=view.querySelector('#lcIotBox');
    const host=view.querySelector('[data-tayu-sector-iot="ganaderia"]');
    if(box&&host&&host.parentElement!==box)box.appendChild(host);

    const count=devices().filter(d=>!s.siteId||String(d.site_id)===String(s.siteId)).length;
    const summary=view.querySelector('#lcIotSummary');
    if(summary)summary.textContent=count
      ? count+' collares TAURO GPS asociados. Abre esta sección solo si necesitas revisar los dispositivos.'
      : 'Sin dispositivos IoT asociados a esta unidad.';

    const details=view.querySelector('#lcIotDetails');
    const toggle=details?.querySelector('.lc-iot-toggle');
    if(details&&toggle){
      const sync=()=>{toggle.textContent=details.open?'Ocultar dispositivos ▴':'Ver dispositivos ▾';};
      if(!details.dataset.bound){details.dataset.bound='1';details.addEventListener('toggle',sync);}
      sync();
    }
  }

  function initMap(){
    const el=document.getElementById('cattleSatelliteMap');if(!el||!window.L)return;
    if(s.map&&s.map.getContainer()===el){setTimeout(()=>s.map.invalidateSize(),50);return}
    try{s.map?.remove?.()}catch(_){}
    s.map=L.map(el,{minZoom:13,maxZoom:18}).setView([-0.470341,-80.081111],16);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:18,maxZoom:18,attribution:'Tiles © Esri'}).addTo(s.map);
    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:18,maxZoom:18,opacity:.7}).addTo(s.map);
    s.map.on('zoomend',()=>{if(s.map.getZoom()>18)s.map.setZoom(18);});
    window.cattleSatelliteMap=s.map;
  }

  function siteSelect(){
    const el=document.getElementById('lcSite');if(!el)return;
    const list=sites(),old=s.siteId||el.value;
    el.innerHTML=list.length?list.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join(''):'<option value="">Sin unidad ganadera</option>';
    if(old&&list.some(x=>x.id===old))el.value=old;
    s.siteId=el.value||list[0]?.id||'';
  }

  function filtered(){
    const herd=document.getElementById('lcHerd')?.value||'';
    const status=document.getElementById('lcStatus')?.value||'';
    const q=String(document.getElementById('lcSearch')?.value||'').trim().toLowerCase();
    return s.rows.filter(r=>{
      if(herd&&String(r.herd?.name||'')!==herd)return false;
      if(status&&String(r.device?.status||'').toLowerCase()!==status)return false;
      if(q&&!`${r.animal_code||''} ${r.name||''} ${r.ear_tag||''} ${r.device?.device_key||''} ${r.herd?.name||''}`.toLowerCase().includes(q))return false;
      return true;
    });
  }

  function herdSelect(){
    const el=document.getElementById('lcHerd');if(!el)return;
    const old=el.value,names=[...new Set(s.rows.map(r=>r.herd?.name).filter(Boolean))].sort();
    el.innerHTML='<option value="">Todos</option>'+names.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    if(names.includes(old))el.value=old;
  }

  function text(id,v){const el=document.getElementById(id);if(el)el.textContent=v}

  function kpis(){
    const rows=s.rows,online=rows.filter(r=>String(r.device?.status).toLowerCase()==='online').length;
    const moving=rows.filter(r=>r.tracking?.motion===true).length,resting=rows.filter(r=>r.tracking?.motion===false).length;
    const bs=rows.map(r=>num(r.tracking?.battery_pct)).filter(v=>v!==null);
    const groups=[...new Set(rows.map(r=>r.herd?.name).filter(Boolean))];
    const latest=rows.map(r=>new Date(r.telemetry_time||r.device?.last_seen_at||0).getTime()).filter(Number.isFinite).sort((a,b)=>b-a)[0];

    text('lcTotal',rows.length);text('lcOnline',online);text('lcMoving',moving);text('lcResting',resting);
    text('lcBattery',bs.length?(bs.reduce((a,b)=>a+b,0)/bs.length).toFixed(1)+'%':'—');
    text('lcMapAnimals','🐄 '+rows.length+' animales');
    text('lcMapGroups','📍 '+groups.length+' grupos');
    const outsideCount=rows.filter(r=>Boolean(outsideInfo(r))).length;
    text('lcMapUpdated',(outsideCount?'🚨 '+outsideCount+' fuera · ':'')+(latest?'🛰 '+ago(new Date(latest).toISOString()):'🛰 Esperando datos'));
  }

  function geofenceAlarm(r){
    const events=Array.isArray(window.__tayuAlarmEvents)?window.__tayuAlarmEvents:[];
    const deviceKey=String(r.device?.device_key||'');
    const deviceId=String(r.device?.id||'');
    return events.find(a=>{
      if(!['active','acknowledged'].includes(String(a.state||'').toLowerCase()))return false;
      const systemKey=String(a.system_key||a.rule_system_key||'');
      const ruleName=String(a.rule_name||a.name||'');
      const message=String(a.message||'');
      const isGeofence=
        systemKey.startsWith('livestock_geofence:') ||
        /salida de perímetro/i.test(ruleName) ||
        /salió del perímetro/i.test(message);
      if(!isGeofence)return false;
      const alarmDeviceKey=String(a.device_key||'');
      const alarmDeviceId=String(a.device_id||'');
      return (deviceKey&&alarmDeviceKey===deviceKey)||(deviceId&&alarmDeviceId===deviceId);
    })||null;
  }

  function outsideInfo(r){
    const a=geofenceAlarm(r);
    if(!a)return null;
    const value=a.value&&typeof a.value==='object'?a.value:{};
    return {
      alarm:a,
      geofenceName:value.geofence_name||String(a.rule_name||'').replace(/^Salida de perímetro\s*·\s*/i,'')||'Zona ganadera'
    };
  }

  async function refreshAlarmState(){
    if(typeof window.__tayuApi!=='function')return;
    try{
      const events=await window.__tayuApi('/alarms/events');
      if(Array.isArray(events))window.__tayuAlarmEvents=events;
    }catch(error){
      console.warn('Ganadería: no se pudieron actualizar alarmas de geocerca.',error);
    }
  }

  function icon(r,i){
    const outside=Boolean(outsideInfo(r));
    const c=outside?'#ef4444':color(r.herd?.name,i),online=String(r.device?.status).toLowerCase()==='online',moving=r.tracking?.motion===true;
    return L.divIcon({className:'lc-cow-icon',html:`<div class="lc-cow ${online?'online':'offline'} ${moving?'moving':''} ${outside?'outside':''}" style="--cow:${c}">🐄</div>`,iconSize:[34,34],iconAnchor:[17,17],popupAnchor:[0,-18]});
  }

  function popup(r){
    const t=r.tracking||{},d=r.device||{};
    const online=String(d.status||'').toLowerCase()==='online';
    const animalState=r.reproductive_status||r.productive_status||r.status||'Activo';
    const outside=outsideInfo(r);
    return `
      <div class="lc-popup">
        ${outside?`<div class="lc-popup-alert">🚨 FUERA DEL PERÍMETRO · ${esc(outside.geofenceName)}</div>`:''}
        <div class="lc-popup-head">
          <div>
            <strong>🐄 ${esc(r.name||r.animal_code||'Animal')}</strong>
            <div class="lc-popup-sub">${esc(r.animal_code||'')} ${r.ear_tag?'· Arete '+esc(r.ear_tag):''}</div>
          </div>
          <span class="lc-popup-status">${online?'ONLINE':'OFFLINE'}</span>
        </div>

        <div class="lc-popup-grid">
          <div><span>Grupo / hato</span><b>${esc(r.herd?.name||'—')}</b></div>
          <div><span>Raza</span><b>${esc(r.breed||'—')}</b></div>
          <div><span>Peso actual</span><b>${r.current_weight_kg?esc(r.current_weight_kg)+' kg':'—'}</b></div>
          <div><span>Estado animal</span><b>${esc(animalState)}</b></div>
          <div><span>Batería TAURO</span><b>${t.battery_pct??'—'}%</b></div>
          <div><span>Velocidad</span><b>${t.speed_kmh??'—'} km/h</b></div>
          <div><span>Actividad</span><b>${t.activity_index??'—'}</b></div>
          <div><span>Temperatura</span><b>${t.temperature_c??'—'} °C</b></div>
          <div><span>Celo</span><b>${t.estrus_detected===true?'Detectado':'No detectado'}</b></div>
          <div><span>Valor animal</span><b>${r.estimated_value_usd!=null?'$'+Number(r.estimated_value_usd).toFixed(2):'—'}</b></div>
          <div><span>Movimiento</span><b>${t.motion===true?'En movimiento':t.motion===false?'En reposo':'—'}</b></div>
        </div>

        <div class="lc-popup-foot">
          ${esc(d.device_key||'TAURO GPS')} · ${esc(ago(d.last_seen_at||r.telemetry_time))}
        </div>
      </div>`;
  }

  function markers(){
    if(!s.map)initMap();if(!s.map)return;
    const rows=filtered(),ids=new Set(rows.map(r=>String(r.animal_id||r.device?.device_key||r.animal_code)));
    for(const [id,m] of s.markers)if(!ids.has(id)){s.map.removeLayer(m);s.markers.delete(id)}
    rows.forEach((r,i)=>{
      const id=String(r.animal_id||r.device?.device_key||r.animal_code),lat=num(r.tracking?.lat),lon=num(r.tracking?.lon);
      if(lat===null||lon===null)return;
      let m=s.markers.get(id);
      if(!m){m=L.marker([lat,lon],{icon:icon(r,i)}).addTo(s.map).bindPopup(popup(r),{className:'lc-leaflet-popup',maxWidth:330,autoPan:true,autoPanPadding:[30,30]});m.on('click',()=>select(id,true));s.markers.set(id,m)}
      else{m.setLatLng([lat,lon]);m.setIcon(icon(r,i));m.setPopupContent(popup(r))}
    });
    if(!s.fitted&&s.markers.size){const g=L.featureGroup([...s.markers.values()]);s.map.fitBounds(g.getBounds().pad(.28),{maxZoom:18});s.fitted=true}
    setTimeout(()=>s.map?.invalidateSize(),80);
  }

  function list(){
    const el=document.getElementById('lcAnimalList');if(!el)return;
    const rows=filtered();
    el.innerHTML=rows.length?rows.map((r,i)=>{
      const id=String(r.animal_id||r.device?.device_key||r.animal_code),active=id===s.selected,outside=outsideInfo(r),c=outside?'#ef4444':color(r.herd?.name,i);
      return `<button class="lc-row ${active?'active':''} ${outside?'outside':''}" data-cow="${esc(id)}"><span><b><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};margin-right:7px"></i>${outside?'🚨 ':''}${esc(r.name||r.animal_code)}</b><small>${esc(r.animal_code||'')} · ${esc(r.herd?.name||'Sin grupo')}${outside?' · FUERA DEL PERÍMETRO':''}</small></span><span class="lc-right"><b>${r.tracking?.battery_pct??'—'}% 🔋</b><br><small>${r.tracking?.speed_kmh??'—'} km/h</small></span></button>`;
    }).join(''):'<p class="hint">No hay animales que coincidan con los filtros.</p>';
    el.querySelectorAll('[data-cow]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.cow,true)));
  }

  function ago(v){
    if(!v)return'Sin conexión';const ms=Date.now()-new Date(v).getTime();if(!Number.isFinite(ms))return'—';
    const sec=Math.max(0,Math.floor(ms/1000));if(sec<60)return'hace '+sec+' s';const min=Math.floor(sec/60);if(min<60)return'hace '+min+' min';return new Date(v).toLocaleString('es-EC');
  }

  function detail(r){
    const t=r.tracking||{},d=r.device||{},online=String(d.status||'').toLowerCase()==='online',outside=outsideInfo(r);
    return `
      ${outside?`<div class="lc-outside-banner">🚨 FUERA DEL PERÍMETRO · ${esc(outside.geofenceName)}</div>`:''}
      <div style="display:flex;justify-content:space-between;gap:10px"><div><h3 style="margin:0">${esc(r.name||r.animal_code)}</h3><p class="hint" style="margin:5px 0 0">${esc(r.animal_code||'')} ${r.ear_tag?'· Arete '+esc(r.ear_tag):''}</p></div><span class="${online?'status':'status off'}">${online?'ONLINE':'OFFLINE'}</span></div>
      <div class="lc-detail">
        <div><span>Grupo / hato</span><b>${esc(r.herd?.name||'—')}</b></div>
        <div><span>Collar TAURO</span><b>${esc(d.device_key||d.name||'—')}</b></div>
        <div><span>Batería</span><b>${t.battery_pct??'—'}%</b></div>
        <div><span>Velocidad</span><b>${t.speed_kmh??'—'} km/h</b></div>
        <div><span>Actividad</span><b>${t.activity_index??'—'}</b></div>
        <div><span>Temperatura corporal</span><b>${t.temperature_c??'—'} °C</b></div>
        <div><span>Estado de celo</span><b>${t.estrus_detected===true?'🔥 Celo detectado':'No detectado'}</b></div>
        <div><span>Valor estimado</span><b>${r.estimated_value_usd!=null?'$'+Number(r.estimated_value_usd).toFixed(2):'—'}</b></div>
        <div><span>Movimiento</span><b>${t.motion===true?'En movimiento':t.motion===false?'En reposo':'—'}</b></div>
        <div><span>Satélites / HDOP</span><b>${t.satellites??'—'} / ${t.hdop??'—'}</b></div>
        <div><span>Última conexión</span><b>${esc(ago(d.last_seen_at||r.telemetry_time))}</b></div>
        ${r.breed?`<div><span>Raza</span><b>${esc(r.breed)}</b></div>`:''}
        ${r.current_weight_kg?`<div><span>Peso actual</span><b>${esc(r.current_weight_kg)} kg</b></div>`:''}
        <div><span>Gateway</span><b>${esc(t.gateway_model||t.gateway_id||'UG67')}</b></div>
        <div><span>Sexo / tipo</span><b>${esc([r.sex,r.animal_type].filter(Boolean).join(' · ')||'—')}</b></div>
        <div><span>Propósito</span><b>${esc(r.production_purpose||'—')}</b></div>
        <div><span>Estado reproductivo</span><b>${esc(r.reproductive_status||'—')}</b></div>
        <div><span>Estado productivo</span><b>${esc(r.productive_status||r.status||'—')}</b></div>
        ${r.paddock?.name?`<div><span>Potrero</span><b>${esc(r.paddock.name)}</b></div>`:''}
      </div>
      <div class="lc-actions"><button class="btn ghost" id="lcCenter">Centrar en mapa</button>${r.animal_id?'<button class="btn" id="lcHistory">Ver recorrido 24 h</button>':''}</div>
      <p class="hint" style="margin-top:10px">Posición: ${t.lat??'—'}, ${t.lon??'—'}</p>
    `;
  }

  function select(id,center=false){
    const r=s.rows.find(x=>String(x.animal_id||x.device?.device_key||x.animal_code)===String(id));if(!r)return;
    s.selected=String(id);list();
    const el=document.getElementById('lcAnimalDetails');
    if(el){el.innerHTML=detail(r);el.querySelector('#lcCenter')?.addEventListener('click',()=>centerRow(r,true));el.querySelector('#lcHistory')?.addEventListener('click',()=>history(r))}
    if(center)centerRow(r,true);
  }

  function centerRow(r,popupOpen=false){
    const lat=num(r.tracking?.lat),lon=num(r.tracking?.lon);if(lat===null||lon===null||!s.map)return;
    s.map.setView([lat,lon],18,{animate:true});
    const id=String(r.animal_id||r.device?.device_key||r.animal_code);if(popupOpen)s.markers.get(id)?.openPopup();
  }

  async function history(r){
    if(!r.animal_id||typeof window.__tayuApi!=='function')return;
    try{
      const data=await window.__tayuApi('/livestock/tracking/'+encodeURIComponent(r.animal_id)+'/history?hours=24&limit=1500');
      const pts=(Array.isArray(data?.points)?data.points:[]).filter(p=>num(p.lat)!==null&&num(p.lon)!==null);
      if(!pts.length){alert('Aún no hay recorrido histórico disponible.');return}
      if(s.history)s.map.removeLayer(s.history);
      s.history=L.polyline(pts.map(p=>[Number(p.lat),Number(p.lon)]),{color:'#16a34a',weight:4,opacity:.86}).addTo(s.map);
      s.map.fitBounds(s.history.getBounds().pad(.2),{maxZoom:18});
    }catch(error){console.error(error);alert('No se pudo cargar el recorrido histórico.')}
  }

  function render(){kpis();list();markers();compactIotPanel();if(s.selected){const r=s.rows.find(x=>String(x.animal_id||x.device?.device_key||x.animal_code)===s.selected);if(r){const el=document.getElementById('lcAnimalDetails');if(el)el.innerHTML=detail(r)}}}

  async function refresh(fit=false){
    if(!shell())return;siteSelect();
    if(!s.siteId){s.rows=[];render();return}
    if(fit)s.fitted=false;
    const [rows]=await Promise.all([load(s.siteId),refreshAlarmState()]);
    s.rows=rows;herdSelect();render();
    window.dispatchEvent(new CustomEvent('tayu:livestock-tracking-refreshed',{detail:{siteId:s.siteId}}));
  }

  function activate(){
    shell();
    compactIotPanel();
    setTimeout(compactIotPanel,450);
    setTimeout(compactIotPanel,1200);
    refresh(!s.fitted).catch(console.error);
    if(s.timer)clearInterval(s.timer);
    s.timer=setInterval(()=>{if(!document.hidden&&document.getElementById('ganaderia')?.classList.contains('active'))refresh(false).catch(console.error)},REFRESH_MS);
  }

  document.addEventListener('click',e=>{if(e.target?.closest?.('.nav button[data-view="ganaderia"]'))setTimeout(activate,80)});
  window.addEventListener('pageshow',()=>{if(document.getElementById('ganaderia')?.classList.contains('active'))setTimeout(activate,120)});
  window.addEventListener('tayu:client-access-ready',()=>{if(document.getElementById('ganaderia')?.classList.contains('active'))setTimeout(activate,120)});
  window.refreshCattleSatellite=()=>refresh(true);
  window.initCattleSatelliteMap=activate;
  window.__tayuRefreshLivestockTracking=refresh;
  setTimeout(()=>{shell();if(document.getElementById('ganaderia')?.classList.contains('active'))activate()},700);
})();
