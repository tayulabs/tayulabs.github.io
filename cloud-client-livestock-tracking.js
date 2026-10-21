/* TAYULABS Cloud · Ganadería · tracking TAURO GPS v2.9 popup layering */
(function(){
  'use strict';

  const REFRESH_MS=20000;
  const COLORS=['#22c55e','#0ea5e9','#f59e0b','#a855f7','#ef4444'];
  const s={map:null,markers:new Map(),blockMarkers:new Map(),rows:[],siteId:'',selected:'',timer:null,fitted:false,history:null,deviceLoadPromise:null,siteCatalog:[],siteLoadPromise:null,refreshPromise:null,cowCanvas:null,cowContext:null,cowPane:null,cowPaintPending:false,cowHitGrid:new Map(),cowIconCache:new Map(),lastListPaint:0,lastAlarmFetch:0,lastTrackingFetch:0,geofenceAlarmIndex:new Map(),cowMotion:new Map(),cowAnimationUntil:0,cowAnimationTimer:null};

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

  async function ensureDeviceCatalog(){
    if(devices().length)return true;
    if(typeof window.__tayuApi!=='function')return false;

    if(!s.deviceLoadPromise){
      s.deviceLoadPromise=(async()=>{
        try{
          const loaded=await window.__tayuApi('/devices');
          if(Array.isArray(loaded))window.__tayuRealDevices=loaded;
          return devices().length>0;
        }catch(error){
          console.error('Ganadería: no se pudo cargar catálogo de dispositivos.',error);
          return false;
        }finally{
          s.deviceLoadPromise=null;
        }
      })();
    }

    return s.deviceLoadPromise;
  }

  function sites(){
    if(s.siteCatalog.length)return s.siteCatalog;
    const map=new Map();
    devices().forEach(d=>{
      const id=String(d.site_id||'');
      if(id&&!map.has(id))map.set(id,{id,name:d.site_name||'Unidad ganadera'});
    });
    return [...map.values()];
  }

  async function ensureSiteCatalog(){
    if(s.siteCatalog.length)return true;
    if(typeof window.__tayuApi!=='function')return sites().length>0;

    if(!s.siteLoadPromise){
      s.siteLoadPromise=(async()=>{
        try{
          // Sitios es una consulta liviana: no exige traer 2300 dispositivos.
          const response=await window.__tayuApi('/client-admin/sites');
          const all=Array.isArray(response)?response:
            Array.isArray(response?.sites)?response.sites:[];
          const allowed=all.filter(row=>{
            const type=String(row.site_type||row.sector_key||row.sector||'').toLowerCase();
            return /ganaderia|ganader[ií]a|livestock|cattle|ganado/.test(type);
          });

          s.siteCatalog=(allowed.length?allowed:all).map(row=>({
            id:String(row.id||row.site_id||''),
            name:String(row.name||row.site_name||'Unidad ganadera')
          })).filter(row=>row.id);

          return s.siteCatalog.length>0;
        }catch(error){
          console.warn('Ganadería: no se pudo consultar el catálogo de fincas.',error);
          return sites().length>0;
        }finally{
          s.siteLoadPromise=null;
        }
      })();
    }
    return s.siteLoadPromise;
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
    let apiError=null;
    if(typeof window.__tayuApi==='function'){
      try{
        const data=await window.__tayuApi('/livestock/tracking?site_id='+encodeURIComponent(siteId));
        if(Array.isArray(data?.animals))return data.animals;
        if(Array.isArray(data))return data;
        throw new Error('Respuesta inesperada del endpoint /livestock/tracking');
      }catch(error){
        apiError=error;
        console.warn('Ganadería: no se pudo cargar tracking completo.',error);
      }
    }else{
      apiError=new Error('La API del cliente todavía no está inicializada');
    }

    const alternate=fallback(siteId);
    if(alternate.length)return alternate;
    throw apiError||new Error('No hay información de tracking ni telemetría TAURO disponible');
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
      #ganaderia .lc-layout{display:grid;grid-template-columns:minmax(0,2.35fr) minmax(300px,.65fr);gap:16px;align-items:start}
      #ganaderia .lc-map-card{padding:0!important;overflow:hidden;position:relative;height:600px;min-height:600px;align-self:start;background:transparent!important}
      #ganaderia #cattleSatelliteMap{height:100%;min-height:600px;border-radius:20px;display:block}
      #ganaderia .lc-live{position:absolute;right:14px;left:auto;top:14px;z-index:500;background:rgba(6,20,15,.9);color:#fff;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900;max-width:calc(100% - 90px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #ganaderia .lc-live i{display:inline-block;width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 5px rgba(34,197,94,.16);margin-right:7px}
      #ganaderia .lc-map-hud{position:absolute;left:14px;right:14px;bottom:14px;z-index:500;display:flex;gap:8px;flex-wrap:wrap;pointer-events:none}
      #ganaderia .lc-map-chip{background:rgba(6,20,15,.88);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:7px 10px;font-size:11px;font-weight:800;backdrop-filter:blur(8px)}
      #ganaderia .lc-side{display:grid;gap:12px;align-content:start}
      .lc-leaflet-popup .leaflet-popup-content-wrapper{border-radius:18px;box-shadow:0 18px 45px rgba(0,0,0,.24);padding:0;overflow:hidden}
      .lc-leaflet-popup .leaflet-popup-content{margin:0;width:370px!important}
      .lc-popup{padding:14px;background:#fff;color:#17231a;max-height:440px;overflow-y:auto}
      .lc-popup-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:11px}
      .lc-popup-head strong{font-size:15px}
      .lc-popup-sub{font-size:11px;color:#64748b;margin-top:3px}
      .lc-popup-status{font-size:10px;font-weight:900;padding:6px 8px;border-radius:999px;background:#e8f8df;color:#2d8f14}
      .lc-popup-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      .lc-popup-grid>div{background:#f7f9f7;border:1px solid #e5e9e5;border-radius:11px;padding:8px}
      .lc-popup-grid span{display:block;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.03em}
      .lc-popup-grid b{display:block;margin-top:3px;font-size:11px;line-height:1.25}
      .lc-popup-foot{margin-top:10px;padding-top:9px;border-top:1px solid #edf0ed;font-size:10px;color:#64748b}
      #ganaderia .lc-list{display:grid;gap:8px;max-height:520px;overflow:auto}
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
      .lc-herd-icon{background:transparent!important;border:0!important}
      .lc-herd-cluster{min-width:68px;height:54px;padding:0 12px;border-radius:27px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,.96);border:4px solid var(--herd);box-shadow:0 8px 22px rgba(0,0,0,.28);color:#17231a;white-space:nowrap}
      .lc-herd-cluster b{font-size:15px;line-height:1}
      .lc-herd-cluster small{font-size:9px;margin-top:4px;max-width:92px;overflow:hidden;text-overflow:ellipsis}
      .lc-near-icon{background:transparent!important;border:0!important}
      .lc-near-dot{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border:2px solid #22c55e;border-radius:50%;background:#fff;color:#166534;box-shadow:0 4px 13px rgba(0,0,0,.22);font-size:12px;font-weight:900}
      .lc-near-dot.outside{border-color:#ef4444;color:#b91c1c}
      .lc-cow-icon{background:transparent!important;border:0!important}
      .lc-cow{width:var(--cow-size,34px);height:var(--cow-size,34px);border-radius:50%;display:grid;place-items:center;background:#fff;border:2px solid var(--cow);font-size:var(--cow-font,19px);box-shadow:0 4px 10px rgba(0,0,0,.24)}
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
       .lc-many-cows .lc-cow.moving,.lc-many-cows .lc-cow.outside{animation:none}
      @keyframes lcPulse{50%{transform:scale(1.12)}}
      @media(max-width:1100px){#ganaderia .lc-kpis{grid-template-columns:repeat(3,1fr)}#ganaderia .lc-layout{grid-template-columns:1fr;align-items:start}#ganaderia .lc-map-card{min-height:560px;height:560px;align-self:start}#ganaderia #cattleSatelliteMap{min-height:560px;height:100%}#ganaderia .lc-list{max-height:360px}}
      @media(max-width:700px){#ganaderia .lc-kpis{grid-template-columns:1fr 1fr}#ganaderia .lc-map-card{min-height:500px;height:500px}#ganaderia #cattleSatelliteMap{min-height:500px;height:100%}.lc-leaflet-popup .leaflet-popup-content{width:285px!important}.lc-popup{max-height:390px}.lc-popup-grid{grid-template-columns:1fr 1fr}}
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
        <div class="card module-header"><div><h3>🐄 Ganadería · Mapa de ganado</h3><p class="hint">Ubicación GPS por animal, estado de TAURO, movimiento, batería y trazabilidad.</p><p class="hint" id="lcDataStatus" role="status" style="margin:6px 0 0"></p></div><button class="btn ghost" id="lcRefresh">Actualizar datos</button></div>
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
            <div class="card"><h3>Inventario del hato</h3><p class="hint">Selecciona una vaca para centrarla y abrir su ficha sobre el mapa.</p><div class="lc-list" id="lcAnimalList"></div></div>
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
    view.querySelector('#lcHerd')?.addEventListener('change',()=>render(true));
    view.querySelector('#lcStatus')?.addEventListener('change',()=>render(true));
    view.querySelector('#lcSearch')?.addEventListener('input',()=>render(true));
    view.querySelector('#lcAnimalList')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-cow]');
      if(button)select(button.dataset.cow,true);
    });
    initMap();
    return view;
  }

  function compactIotPanel(){
    const view=document.getElementById('ganaderia');if(!view)return;
    const box=view.querySelector('#lcIotBox');
    const host=view.querySelector('[data-tayu-sector-iot="ganaderia"]');
    if(box&&host&&host.parentElement!==box)box.appendChild(host);

    const count=s.rows.length||devices().filter(d=>!s.siteId||String(d.site_id)===String(s.siteId)).length;
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
    s.cowCanvas=null;s.cowContext=null;s.cowPane=null;s.cowHitGrid=new Map();s.cowIconCache=new Map();s.cowMotion=new Map();s.cowAnimationUntil=0;
    s.map=L.map(el,{minZoom:13,maxZoom:18}).setView([-0.470341,-80.081111],16);
    // Mantener la ficha del animal por delante de todos los iconos Canvas.
    const popupPane=s.map.getPane('popupPane');
    if(popupPane)popupPane.style.zIndex='850';
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:18,maxZoom:18,attribution:'Tiles © Esri'}).addTo(s.map);
    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:18,maxZoom:18,opacity:.7}).addTo(s.map);
    s.map.on('zoomend moveend resize',()=>{
      if(s.map.getZoom()>18)s.map.setZoom(18);
      markers();
    });
    s.map.on('click',onCowMapClick);
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
    let latest=0;
    for(const r of rows){
      const t=new Date(r.telemetry_time||r.device?.last_seen_at||0).getTime();
      if(Number.isFinite(t)&&t>latest)latest=t;
    }

    text('lcTotal',rows.length);text('lcOnline',online);text('lcMoving',moving);text('lcResting',resting);
    text('lcBattery',bs.length?(bs.reduce((a,b)=>a+b,0)/bs.length).toFixed(1)+'%':'—');
    text('lcMapAnimals','🐄 '+rows.length+' animales');
    text('lcMapGroups','📍 '+groups.length+' grupos');
    const outsideCount=rows.filter(r=>Boolean(outsideInfo(r))).length;
    text('lcMapUpdated',(outsideCount?'🚨 '+outsideCount+' fuera · ':'')+(latest?'🛰 '+ago(new Date(latest).toISOString()):'🛰 Esperando datos'));
  }

  // Índice por dispositivo: evita buscar en todas las alarmas por cada vaca.
  function indexGeofenceAlarms(events){
    const index=new Map();
    for(const a of events){
      if(!['active','acknowledged'].includes(String(a.state||'').toLowerCase()))continue;
      const systemKey=String(a.system_key||a.rule_system_key||'');
      const ruleName=String(a.rule_name||a.name||'');
      const message=String(a.message||'');
      if(!(
        systemKey.startsWith('livestock_geofence:')||
        /salida de perímetro/i.test(ruleName)||
        /salió del perímetro/i.test(message)
      ))continue;
      if(a.device_key)index.set('key:'+a.device_key,a);
      if(a.device_id)index.set('id:'+a.device_id,a);
    }
    s.geofenceAlarmIndex=index;
  }

  function geofenceAlarm(r){
    const deviceKey=String(r.device?.device_key||'');
    const deviceId=String(r.device?.id||'');
    return (deviceKey&&s.geofenceAlarmIndex.get('key:'+deviceKey))||
      (deviceId&&s.geofenceAlarmIndex.get('id:'+deviceId))||null;
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
    if(s.lastAlarmFetch&&Date.now()-s.lastAlarmFetch<30000)return;
    s.lastAlarmFetch=Date.now();
    try{
      const events=await window.__tayuApi('/alarms/events');
      if(Array.isArray(events)){
        window.__tayuAlarmEvents=events;
        indexGeofenceAlarms(events);
      }
    }catch(error){
      s.lastAlarmFetch=0;
      console.warn('Ganadería: no se pudieron actualizar alarmas de geocerca.',error);
    }
  }

  function icon(r,i,size=34){
    const outside=Boolean(outsideInfo(r));
    const c=outside?'#ef4444':color(r.herd?.name,i);
    const online=String(r.device?.status||'').toLowerCase()==='online';
    const moving=r.tracking?.motion===true;
    const html=`<div class="lc-cow ${online?'online':'offline'} ${moving?'moving':''} ${outside?'outside':''}" style="--cow:${c};--cow-size:${size}px;--cow-font:${Math.round(size*.54)}px">🐄</div>`;
    return L.divIcon({
      className:'lc-cow-icon',html,
      iconSize:[size,size],iconAnchor:[size/2,size/2],popupAnchor:[0,-size/2]
    });
  }

  function popup(r){
    const t=r.tracking||{},d=r.device||{};
    const online=String(d.status||'').toLowerCase()==='online';
    const outside=outsideInfo(r);
    const animalState=r.reproductive_status||r.productive_status||r.status||'Activo';
    const sexType=[r.sex,r.animal_type].filter(Boolean).join(' · ')||'—';

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
          <div><span>Collar TAURO</span><b>${esc(d.device_key||d.name||'—')}</b></div>

          <div><span>Batería</span><b>${t.battery_pct??'—'}%</b></div>
          <div><span>Velocidad</span><b>${t.speed_kmh??'—'} km/h</b></div>

          <div><span>Actividad</span><b>${t.activity_index??'—'}</b></div>
          <div><span>Temperatura corporal</span><b>${t.temperature_c??'—'} °C</b></div>

          <div><span>Estado de celo</span><b>${t.estrus_detected===true?'🔥 Celo detectado':'No detectado'}</b></div>
          <div><span>Movimiento</span><b>${t.motion===true?'En movimiento':t.motion===false?'En reposo':'—'}</b></div>

          <div><span>Raza</span><b>${esc(r.breed||'—')}</b></div>
          <div><span>Peso actual</span><b>${r.current_weight_kg?esc(r.current_weight_kg)+' kg':'—'}</b></div>

          <div><span>Valor estimado</span><b>${r.estimated_value_usd!=null?'$'+Number(r.estimated_value_usd).toFixed(2):'—'}</b></div>
          <div><span>Satélites / HDOP</span><b>${t.satellites??'—'} / ${t.hdop??'—'}</b></div>

          <div><span>Sexo / tipo</span><b>${esc(sexType)}</b></div>
          <div><span>Propósito</span><b>${esc(r.production_purpose||'—')}</b></div>

          <div><span>Estado reproductivo</span><b>${esc(r.reproductive_status||'—')}</b></div>
          <div><span>Estado productivo</span><b>${esc(r.productive_status||animalState||'—')}</b></div>

          ${r.paddock?.name?`<div><span>Potrero</span><b>${esc(r.paddock.name)}</b></div>`:''}
          <div><span>Gateway</span><b>${esc(t.gateway_model||t.gateway_id||'UG67')}</b></div>

          <div><span>Última conexión</span><b>${esc(ago(d.last_seen_at||r.telemetry_time))}</b></div>
        </div>

        <div class="lc-popup-foot">
          <b>Posición actual</b><br>
          ${t.lat??'—'}, ${t.lon??'—'}
        </div>
      </div>`;
  }

  // El mapa usa un único canvas. Cada vaca conserva su posición y
  // su icono original; no hay agrupación, muestreo ni marcadores HTML.
  function ensureCowCanvas(){
    if(!s.map)return null;
    if(s.cowCanvas&&s.cowCanvas.isConnected)return s.cowCanvas;
    const pane=s.map.getPane('tauroCows')||s.map.createPane('tauroCows');
    // Debajo de los popups Leaflet (pane=850) y por encima de los polígonos (400).
    pane.style.zIndex='440';
    pane.style.pointerEvents='none';
    const canvas=document.createElement('canvas');
    canvas.className='lc-cows-canvas';
    canvas.style.position='absolute';
    canvas.style.pointerEvents='none';
    pane.appendChild(canvas);
    s.cowCanvas=canvas;
    s.cowContext=canvas.getContext('2d',{alpha:true});
    s.cowHitGrid=new Map();
    s.cowIconCache=new Map();
    return canvas;
  }

  function cowCanvasIcon(size,c,online,outside){
    const key=[size,c,online,outside].join('|');
    if(s.cowIconCache.has(key))return s.cowIconCache.get(key);
    const scale=2;
    const image=document.createElement('canvas');
    image.width=(size+6)*scale;
    image.height=(size+6)*scale;
    const ctx=image.getContext('2d');
    if(!ctx)return null;
    ctx.scale(scale,scale);
    const center=(size+6)/2;
    const radius=(size/2)-1;
    ctx.shadowColor='rgba(0,0,0,.25)';
    ctx.shadowBlur=3;
    ctx.shadowOffsetY=2;
    ctx.beginPath();
    ctx.arc(center,center,radius,0,Math.PI*2);
    ctx.fillStyle='#fff';
    ctx.fill();
    ctx.shadowColor='transparent';
    ctx.lineWidth=2;
    ctx.strokeStyle=c;
    ctx.stroke();
    ctx.font=Math.round(size*.54)+'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText('🐄',center,center+1);
    if(online){
      ctx.beginPath();
      ctx.arc(center+radius-1,center+radius-1,Math.max(2,size*.11),0,Math.PI*2);
      ctx.fillStyle='#22c55e';
      ctx.fill();
      ctx.lineWidth=1.5;
      ctx.strokeStyle='#fff';
      ctx.stroke();
    }
    if(outside){
      ctx.beginPath();
      ctx.arc(center-radius+2,center-radius+2,Math.max(3,size*.13),0,Math.PI*2);
      ctx.fillStyle='#ef4444';
      ctx.fill();
      ctx.lineWidth=1.5;
      ctx.strokeStyle='#fff';
      ctx.stroke();
    }
    s.cowIconCache.set(key,image);
    return image;
  }


  // Canvas v2.8: interpolacion visual entre posiciones GPS efectivamente recibidas.
  function cowMotionId(row){
    return String(row.animal_id||row.device?.device_key||row.animal_code||'');
  }
  function rawCowPoint(row){
    const lat=Number(row?.tracking?.lat),lon=Number(row?.tracking?.lon);
    return Number.isFinite(lat)&&Number.isFinite(lon)?{lat,lon}:null;
  }
  function interpolateCow(motion,now){
    if(!motion)return null;
    const progress=Math.min(1,Math.max(0,(now-motion.start)/(motion.end-motion.start)));
    return {lat:motion.from.lat+(motion.to.lat-motion.from.lat)*progress,
      lon:motion.from.lon+(motion.to.lon-motion.from.lon)*progress};
  }
  function visibleCowPoint(row,now){
    const motion=s.cowMotion.get(cowMotionId(row));
    return motion?interpolateCow(motion,now):rawCowPoint(row);
  }
  function stageCowMovement(nextRows){
    const now=performance.now();
    const previous=new Map(s.rows.map(row=>[cowMotionId(row),row]));
    const motion=new Map();
    let moving=0;
    for(const row of nextRows){
      const key=cowMotionId(row),target=rawCowPoint(row);
      if(!key||!target)continue;
      const older=previous.get(key);
      const from=interpolateCow(s.cowMotion.get(key),now)||rawCowPoint(older);
      if(!from)continue;
      const north=(target.lat-from.lat)*111100;
      const east=(target.lon-from.lon)*111100*Math.cos(target.lat*Math.PI/180);
      const metres=Math.hypot(north,east);
      // Un reinicio de la simulacion puede redistribuir el hato;
      // esos saltos grandes no se muestran como caminata.
      if(metres<0.25||metres>100)continue;
      motion.set(key,{from,to:target,start:now,end:now+17800});
      moving++;
    }
    s.cowMotion=motion;
    s.cowAnimationUntil=moving?now+17800:0;
  }

  function markers(){
    if(!s.map||!ensureCowCanvas())return;
    if(s.cowPaintPending)return;
    s.cowPaintPending=true;
    requestAnimationFrame(()=>{
      s.cowPaintPending=false;
      if(s.map&&s.cowCanvas?.isConnected)paintCows();
    });
  }

  function paintCows(){
    const map=s.map,canvas=s.cowCanvas,ctx=s.cowContext;
    if(!map||!canvas||!ctx)return;
    const dimensions=map.getSize();
    if(dimensions.x<1||dimensions.y<1)return;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const width=Math.ceil(dimensions.x*dpr);
    const height=Math.ceil(dimensions.y*dpr);
    if(canvas.width!==width||canvas.height!==height){
      canvas.width=width;
      canvas.height=height;
      canvas.style.width=dimensions.x+'px';
      canvas.style.height=dimensions.y+'px';
    }
    L.DomUtil.setPosition(canvas,map.containerPointToLayerPoint([0,0]));
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,dimensions.x,dimensions.y);

    const rows=filtered();
    const frameNow=performance.now();
    if(!s.fitted&&rows.length){
      const positions=rows.filter(r=>num(r.tracking?.lat)!==null&&num(r.tracking?.lon)!==null)
        .map(r=>[Number(r.tracking.lat),Number(r.tracking.lon)]);
      if(positions.length){
        s.fitted=true;
        map.fitBounds(L.latLngBounds(positions).pad(.18),{maxZoom:16});
        // fitBounds dispara moveend; pintar después de recalcular zoom.
        return;
      }
    }

    const z=map.getZoom();
    const iconSize=rows.length>100?(z>=18?24:z>=17?22:z>=16?20:18):34;
    const half=iconSize/2;
    const grid=new Map();
    const cellSize=36;
    const indexes=s.geofenceAlarmIndex;
    const useAlarms=indexes.size>0;
    for(const row of rows){
      const position=visibleCowPoint(row,frameNow);
      if(!position)continue;
      const lat=position.lat,lon=position.lon;
      const point=map.latLngToContainerPoint([lat,lon]);
      if(point.x< -iconSize||point.y< -iconSize||
         point.x>dimensions.x+iconSize||point.y>dimensions.y+iconSize)continue;

      const keyId=String(row.animal_id||row.device?.device_key||row.animal_code);
      const outside=useAlarms&&Boolean(geofenceAlarm(row));
      const tint=outside?'#ef4444':color(row.herd?.name);
      const online=String(row.device?.status||'').toLowerCase()==='online';
      const iconImage=cowCanvasIcon(iconSize,tint,online,outside);
      if(iconImage)ctx.drawImage(iconImage,point.x-half-3,point.y-half-3,
        iconSize+6,iconSize+6);

      const gridKey=Math.floor(point.x/cellSize)+':'+Math.floor(point.y/cellSize);
      if(!grid.has(gridKey))grid.set(gridKey,[]);
      grid.get(gridKey).push({row,x:point.x,y:point.y,id:keyId});
    }
    s.cowHitGrid=grid;
  }

  function showCowPopup(row){
    if(!s.map||!row)return;
    const lat=Number(row.tracking?.lat),lon=Number(row.tracking?.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
    L.popup({
      className:'lc-leaflet-popup',
      maxWidth:390,autoPan:true,autoPanPadding:[30,30]
    }).setLatLng([lat,lon]).setContent(popup(row)).openOn(s.map);
  }

  function onCowMapClick(e){
    if(!s.map||!s.cowHitGrid?.size)return;
    const pos=s.map.latLngToContainerPoint(e.latlng);
    const cellSize=36;
    const gx=Math.floor(pos.x/cellSize),gy=Math.floor(pos.y/cellSize);
    let nearest=null,shortest=Infinity;
    for(let dx=-1;dx<=1;dx++){
      for(let dy=-1;dy<=1;dy++){
        const nearby=s.cowHitGrid.get((gx+dx)+':'+(gy+dy))||[];
        for(const item of nearby){
          const d=(pos.x-item.x)**2+(pos.y-item.y)**2;
          if(d<shortest){shortest=d;nearest=item}
        }
      }
    }
    if(!nearest||shortest>18**2)return;
    s.selected=nearest.id;
    list();
    showCowPopup(nearest.row);
  }

  function list(){
    const el=document.getElementById('lcAnimalList');if(!el)return;
    const rows=filtered();
    const shown=rows.slice(0,200);

    el.innerHTML=shown.length?shown.map((r,i)=>{
      const id=String(r.animal_id||r.device?.device_key||r.animal_code),active=id===s.selected,outside=outsideInfo(r),c=outside?'#ef4444':color(r.herd?.name,i);
      return `<button class="lc-row ${active?'active':''} ${outside?'outside':''}" data-cow="${esc(id)}"><span><b><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};margin-right:7px"></i>${outside?'🚨 ':''}${esc(r.name||r.animal_code)}</b><small>${esc(r.animal_code||'')} · ${esc(r.herd?.name||'Sin grupo')}${outside?' · FUERA DEL PERÍMETRO':''}</small></span><span class="lc-right"><b>${r.tracking?.battery_pct??'—'}% 🔋</b><br><small>${r.tracking?.speed_kmh??'—'} km/h</small></span></button>`;
    }).join('')+
      (rows.length>shown.length?`<p class="hint" style="padding:8px 4px">Mostrando ${shown.length} de ${rows.length}. Usa Grupo/hato o Buscar animal para reducir la lista.</p>`:'')
      :'<p class="hint">No hay animales que coincidan con los filtros.</p>';

    s.lastListPaint=Date.now();
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
    const r=s.rows.find(x=>String(x.animal_id||x.device?.device_key||x.animal_code)===String(id));
    if(!r)return;
    s.selected=String(id);
    list();
    if(center)centerRow(r,true);
  }

  function centerRow(r,popupOpen=false){
    const lat=num(r.tracking?.lat),lon=num(r.tracking?.lon);if(lat===null||lon===null||!s.map)return;
    s.map.setView([lat,lon],18,{animate:true});
    if(popupOpen){
      setTimeout(()=>{markers();showCowPopup(r)},270);
    }
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

  function render(forceList=false){
    kpis();
    if(forceList||Date.now()-s.lastListPaint>30000)list();
    markers();
  }

  async function refresh(fit=false){
    if(s.refreshPromise)return s.refreshPromise;
    if(!fit&&s.lastTrackingFetch&&Date.now()-s.lastTrackingFetch<REFRESH_MS)return;

    s.refreshPromise=(async()=>{
      if(!shell())return;
      const status=document.getElementById('lcDataStatus');
      if(status){status.style.color='';status.textContent='Cargando fincas ganaderas…'}

      await ensureSiteCatalog();
      siteSelect();

      if(!s.siteId){
        s.rows=[];
        render();
        if(status){
          status.style.color='#b45309';
          status.textContent='No se encontró una finca ganadera accesible. Comprueba la carga de sitios en la API.';
        }
        return;
      }

      if(fit)s.fitted=false;
      if(status)status.textContent='Cargando posiciones TAURO…';

      try{
        const [rows]=await Promise.all([load(s.siteId),refreshAlarmState()]);
        const nextRows=Array.isArray(rows)?rows:[];
        stageCowMovement(nextRows);
        s.rows=nextRows;
        s.lastTrackingFetch=Date.now();
        herdSelect();
        render();
        if(status){
          status.style.color=s.rows.length?'':'#b45309';
          status.textContent=s.rows.length
            ?s.rows.length.toLocaleString('es-EC')+' animales cargados'
            :'La finca está disponible, pero la consulta de tracking devolvió 0 animales.';
        }
        window.dispatchEvent(new CustomEvent('tayu:livestock-tracking-refreshed',{
          detail:{siteId:s.siteId,count:s.rows.length}
        }));
      }catch(error){
        console.error('Ganadería: error cargando tracking',error);
        if(status){
          status.style.color='#b91c1c';
          status.textContent='Error al cargar tracking: '+String(error?.message||error);
        }
      }
    })();

    try{return await s.refreshPromise}
    finally{s.refreshPromise=null}
  }

  function activate(){
    shell();
    compactIotPanel();
    setTimeout(compactIotPanel,450);
    setTimeout(compactIotPanel,1200);
    refresh(!s.fitted).catch(console.error);
    if(s.timer)clearInterval(s.timer);
    s.timer=setInterval(()=>{if(!document.hidden&&document.getElementById('ganaderia')?.classList.contains('active'))refresh(false).catch(console.error)},REFRESH_MS);
    if(s.cowAnimationTimer)clearInterval(s.cowAnimationTimer);
    s.cowAnimationTimer=setInterval(()=>{
      if(document.hidden||!document.getElementById('ganaderia')?.classList.contains('active'))return;
      if(s.cowAnimationUntil>performance.now())markers();
    },125);
  }

  document.addEventListener('click',e=>{if(e.target?.closest?.('.nav button[data-view="ganaderia"]'))setTimeout(activate,80)});
  window.addEventListener('pageshow',()=>{if(document.getElementById('ganaderia')?.classList.contains('active'))setTimeout(activate,120)});
  window.addEventListener('tayu:client-access-ready',()=>{if(document.getElementById('ganaderia')?.classList.contains('active'))setTimeout(activate,120)});
  window.addEventListener('tayu:real-data-ready',()=>{if(document.getElementById('ganaderia')?.classList.contains('active'))refresh(false).catch(console.error)});
  window.refreshCattleSatellite=()=>refresh(true);
  window.initCattleSatelliteMap=activate;
  window.__tayuRefreshLivestockTracking=refresh;
  setTimeout(()=>{shell();if(document.getElementById('ganaderia')?.classList.contains('active'))activate()},700);
})();
