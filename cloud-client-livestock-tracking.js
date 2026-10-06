/* TAYULABS Cloud · Ganadería · tracking TAURO GPS v1.0 */
(function(){
  'use strict';

  const REFRESH_MS=20000;
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
    const text=\x60${d?.device_type||''} ${d?.profile_key||''} ${d?.profile_name||''} ${d?.name||''}\x60.toLowerCase();
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
        animal_code:code||\x60GAN-${suffix}\x60,
        name:p.animal_name||\x60Vaca ${suffix}\x60,
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
    const style=document.createElement('style');style.id='tayuLivestockCss';style.textContent=\x60
      #ganaderia .lc-shell{display:grid;gap:16px}
      #ganaderia .lc-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
      #ganaderia .lc-kpi{border:1px solid var(--border);background:var(--panel);border-radius:18px;padding:15px}
      #ganaderia .lc-kpi span{display:block;color:var(--muted);font-size:12px;font-weight:700}
      #ganaderia .lc-kpi b{display:block;margin-top:6px;font-size:25px}
      #ganaderia .lc-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
      #ganaderia .lc-tools>div{flex:1;min-width:150px}
      #ganaderia .lc-layout{display:grid;grid-template-columns:minmax(0,2.1fr) minmax(300px,.9fr);gap:16px}
      #ganaderia .lc-map-card{padding:0!important;overflow:hidden;position:relative}
      #ganaderia #cattleSatelliteMap{height:680px;min-height:540px;border-radius:20px}
      #ganaderia .lc-live{position:absolute;left:14px;top:14px;z-index:500;background:rgba(6,20,15,.9);color:#fff;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900}
      #ganaderia .lc-live i{display:inline-block;width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 5px rgba(34,197,94,.16);margin-right:7px}
      #ganaderia .lc-side{display:grid;gap:12px;align-content:start}
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
      .lc-cow-icon{background:transparent!important;border:0!important}
      .lc-cow{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#fff;border:3px solid var(--cow);font-size:19px;box-shadow:0 8px 18px rgba(0,0,0,.28)}
      .lc-cow.online:after{content:"";position:absolute;width:8px;height:8px;border-radius:50%;right:0;bottom:0;background:#22c55e;border:2px solid #fff}
      .lc-cow.offline{filter:grayscale(.7);opacity:.7}
      .lc-cow.moving{animation:lcPulse 1.5s infinite}
      @keyframes lcPulse{50%{transform:scale(1.12)}}
      @media(max-width:1100px){#ganaderia .lc-kpis{grid-template-columns:repeat(3,1fr)}#ganaderia .lc-layout{grid-template-columns:1fr}}
      @media(max-width:700px){#ganaderia .lc-kpis{grid-template-columns:1fr 1fr}#ganaderia #cattleSatelliteMap{height:520px}}
    \x60;
    document.head.appendChild(style);
  }

  function shell(){
    const view=document.getElementById('ganaderia');if(!view)return null;
    styles();
    if(view.dataset.livestockMap==='1')return view;
    const iot=view.querySelector('[data-tayu-sector-iot="ganaderia"]');
    try{window.cattleSatelliteMap?.remove?.()}catch(_){}
    window.cattleSatelliteMap=null;
    view.innerHTML=\x60
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
          <div class="card lc-map-card"><div class="lc-live"><i></i>TAURO GPS · seguimiento activo</div><div id="cattleSatelliteMap"></div></div>
          <div class="lc-side">
            <div class="card"><h3>Inventario del hato</h3><p class="hint">Selecciona un animal para centrarlo y abrir su ficha.</p><div class="lc-list" id="cattleSatelliteList"></div></div>
            <div class="card" id="cattleSatelliteDetails"><h3>Ficha del animal</h3><p class="hint">Selecciona una vaca del mapa o del listado.</p></div>
          </div>
        </div>
      </div>
    \x60;
    if(iot)view.prepend(iot);
    view.dataset.livestockMap='1';
    view.querySelector('#lcRefresh')?.addEventListener('click',()=>refresh(true));
    view.querySelector('#lcSite')?.addEventListener('change',e=>{s.siteId=e.target.value;s.fitted=false;s.selected='';refresh(true)});
    view.querySelector('#lcHerd')?.addEventListener('change',render);
    view.querySelector('#lcStatus')?.addEventListener('change',render);
    view.querySelector('#lcSearch')?.addEventListener('input',render);
    initMap();
    return view;
  }

  function initMap(){
    const el=document.getElementById('cattleSatelliteMap');if(!el||!window.L)return;
    if(s.map&&s.map.getContainer()===el){setTimeout(()=>s.map.invalidateSize(),50);return}
    try{s.map?.remove?.()}catch(_){}
    s.map=L.map(el).setView([-0.470341,-80.081111],16);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20,attribution:'Tiles © Esri'}).addTo(s.map);
    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxZoom:20,opacity:.7}).addTo(s.map);
    window.cattleSatelliteMap=s.map;
  }

  function siteSelect(){
    const el=document.getElementById('lcSite');if(!el)return;
    const list=sites(),old=s.siteId||el.value;
    el.innerHTML=list.length?list.map(x=>\x60<option value="${esc(x.id)}">${esc(x.name)}</option>\x60).join(''):'<option value="">Sin unidad ganadera</option>';
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
      if(q&&!\x60${r.animal_code||''} ${r.name||''} ${r.ear_tag||''} ${r.device?.device_key||''} ${r.herd?.name||''}\x60.toLowerCase().includes(q))return false;
      return true;
    });
  }

  function herdSelect(){
    const el=document.getElementById('lcHerd');if(!el)return;
    const old=el.value,names=[...new Set(s.rows.map(r=>r.herd?.name).filter(Boolean))].sort();
    el.innerHTML='<option value="">Todos</option>'+names.map(x=>\x60<option value="${esc(x)}">${esc(x)}</option>\x60).join('');
    if(names.includes(old))el.value=old;
  }

  function text(id,v){const el=document.getElementById(id);if(el)el.textContent=v}

  function kpis(){
    const rows=s.rows,online=rows.filter(r=>String(r.device?.status).toLowerCase()==='online').length;
    const moving=rows.filter(r=>r.tracking?.motion===true).length,resting=rows.filter(r=>r.tracking?.motion===false).length;
    const bs=rows.map(r=>num(r.tracking?.battery_pct)).filter(v=>v!==null);
    text('lcTotal',rows.length);text('lcOnline',online);text('lcMoving',moving);text('lcResting',resting);
    text('lcBattery',bs.length?(bs.reduce((a,b)=>a+b,0)/bs.length).toFixed(1)+'%':'—');
  }

  function icon(r,i){
    const c=color(r.herd?.name,i),online=String(r.device?.status).toLowerCase()==='online',moving=r.tracking?.motion===true;
    return L.divIcon({className:'lc-cow-icon',html:\x60<div class="lc-cow ${online?'online':'offline'} ${moving?'moving':''}" style="--cow:${c}">🐄</div>\x60,iconSize:[34,34],iconAnchor:[17,17],popupAnchor:[0,-18]});
  }

  function popup(r){
    return \x60<b>${esc(r.name||r.animal_code)}</b><br><small>${esc(r.animal_code||'')} · ${esc(r.herd?.name||'Sin grupo')}</small><br><br>🔋 ${r.tracking?.battery_pct??'—'}% · 🚶 ${r.tracking?.speed_kmh??'—'} km/h\x60;
  }

  function markers(){
    if(!s.map)initMap();if(!s.map)return;
    const rows=filtered(),ids=new Set(rows.map(r=>String(r.animal_id||r.device?.device_key||r.animal_code)));
    for(const [id,m] of s.markers)if(!ids.has(id)){s.map.removeLayer(m);s.markers.delete(id)}
    rows.forEach((r,i)=>{
      const id=String(r.animal_id||r.device?.device_key||r.animal_code),lat=num(r.tracking?.lat),lon=num(r.tracking?.lon);
      if(lat===null||lon===null)return;
      let m=s.markers.get(id);
      if(!m){m=L.marker([lat,lon],{icon:icon(r,i)}).addTo(s.map).bindPopup(popup(r));m.on('click',()=>select(id,true));s.markers.set(id,m)}
      else{m.setLatLng([lat,lon]);m.setIcon(icon(r,i));m.setPopupContent(popup(r))}
    });
    if(!s.fitted&&s.markers.size){const g=L.featureGroup([...s.markers.values()]);s.map.fitBounds(g.getBounds().pad(.28),{maxZoom:18});s.fitted=true}
    setTimeout(()=>s.map?.invalidateSize(),80);
  }

  function list(){
    const el=document.getElementById('cattleSatelliteList');if(!el)return;
    const rows=filtered();
    el.innerHTML=rows.length?rows.map((r,i)=>{
      const id=String(r.animal_id||r.device?.device_key||r.animal_code),active=id===s.selected,c=color(r.herd?.name,i);
      return \x60<button class="lc-row ${active?'active':''}" data-cow="${esc(id)}"><span><b><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};margin-right:7px"></i>${esc(r.name||r.animal_code)}</b><small>${esc(r.animal_code||'')} · ${esc(r.herd?.name||'Sin grupo')}</small></span><span class="lc-right"><b>${r.tracking?.battery_pct??'—'}% 🔋</b><br><small>${r.tracking?.speed_kmh??'—'} km/h</small></span></button>\x60;
    }).join(''):'<p class="hint">No hay animales que coincidan con los filtros.</p>';
    el.querySelectorAll('[data-cow]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.cow,true)));
  }

  function ago(v){
    if(!v)return'Sin conexión';const ms=Date.now()-new Date(v).getTime();if(!Number.isFinite(ms))return'—';
    const sec=Math.max(0,Math.floor(ms/1000));if(sec<60)return'hace '+sec+' s';const min=Math.floor(sec/60);if(min<60)return'hace '+min+' min';return new Date(v).toLocaleString('es-EC');
  }

  function detail(r){
    const t=r.tracking||{},d=r.device||{},online=String(d.status||'').toLowerCase()==='online';
    return \x60
      <div style="display:flex;justify-content:space-between;gap:10px"><div><h3 style="margin:0">${esc(r.name||r.animal_code)}</h3><p class="hint" style="margin:5px 0 0">${esc(r.animal_code||'')} ${r.ear_tag?'· Arete '+esc(r.ear_tag):''}</p></div><span class="${online?'status':'status off'}">${online?'ONLINE':'OFFLINE'}</span></div>
      <div class="lc-detail">
        <div><span>Grupo / hato</span><b>${esc(r.herd?.name||'—')}</b></div>
        <div><span>Collar TAURO</span><b>${esc(d.device_key||d.name||'—')}</b></div>
        <div><span>Batería</span><b>${t.battery_pct??'—'}%</b></div>
        <div><span>Velocidad</span><b>${t.speed_kmh??'—'} km/h</b></div>
        <div><span>Actividad</span><b>${t.activity_index??'—'}</b></div>
        <div><span>Movimiento</span><b>${t.motion===true?'En movimiento':t.motion===false?'En reposo':'—'}</b></div>
        <div><span>Satélites / HDOP</span><b>${t.satellites??'—'} / ${t.hdop??'—'}</b></div>
        <div><span>Última conexión</span><b>${esc(ago(d.last_seen_at||r.telemetry_time))}</b></div>
        ${r.breed?\x60<div><span>Raza</span><b>${esc(r.breed)}</b></div>\x60:''}
        ${r.current_weight_kg?\x60<div><span>Peso actual</span><b>${esc(r.current_weight_kg)} kg</b></div>\x60:''}
        <div><span>Gateway</span><b>${esc(t.gateway_model||t.gateway_id||'UG67')}</b></div>
      </div>
      <div class="lc-actions"><button class="btn ghost" id="lcCenter">Centrar en mapa</button>${r.animal_id?'<button class="btn" id="lcHistory">Ver recorrido 24 h</button>':''}</div>
      <p class="hint" style="margin-top:10px">Posición: ${t.lat??'—'}, ${t.lon??'—'}</p>
    \x60;
  }

  function select(id,center=false){
    const r=s.rows.find(x=>String(x.animal_id||x.device?.device_key||x.animal_code)===String(id));if(!r)return;
    s.selected=String(id);list();
    const el=document.getElementById('cattleSatelliteDetails');
    if(el){el.innerHTML=detail(r);el.querySelector('#lcCenter')?.addEventListener('click',()=>centerRow(r,true));el.querySelector('#lcHistory')?.addEventListener('click',()=>history(r))}
    if(center)centerRow(r,true);
  }

  function centerRow(r,popupOpen=false){
    const lat=num(r.tracking?.lat),lon=num(r.tracking?.lon);if(lat===null||lon===null||!s.map)return;
    s.map.setView([lat,lon],19,{animate:true});
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
      s.map.fitBounds(s.history.getBounds().pad(.2),{maxZoom:19});
    }catch(error){console.error(error);alert('No se pudo cargar el recorrido histórico.')}
  }

  function render(){kpis();list();markers();if(s.selected){const r=s.rows.find(x=>String(x.animal_id||x.device?.device_key||x.animal_code)===s.selected);if(r){const el=document.getElementById('cattleSatelliteDetails');if(el)el.innerHTML=detail(r)}}}

  async function refresh(fit=false){
    if(!shell())return;siteSelect();
    if(!s.siteId){s.rows=[];render();return}
    if(fit)s.fitted=false;
    s.rows=await load(s.siteId);herdSelect();render();
  }

  function activate(){
    shell();refresh(!s.fitted).catch(console.error);
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
