/* TAYULABS Cloud · Bananeras demo GPS v1.7
   Vista ORIÓN independiente para demo@tayulabs.com.
*/
(function(){
  'use strict';

  const DEMO_EMAIL='demo@tayulabs.com';
  const VERSION='1.7';
  const INDEX_URL='demo/bananas-track-index.json';
  const COLORS=['#16a34a','#2563eb','#f59e0b','#7c3aed','#0891b2','#dc2626','#65a30d','#9333ea'];

  let tracks=[];
  let demoMap=null;
  let demoLayers=[];
  let loadingPromise=null;
  let installed=false;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));

  function identities(){
    const out=[];
    try{if(typeof currentUser!=='undefined'&&currentUser)out.push(currentUser.email,currentUser.username,currentUser.user);}catch(_){ }
    try{if(typeof keycloak!=='undefined'&&keycloak?.tokenParsed)out.push(keycloak.tokenParsed.email,keycloak.tokenParsed.preferred_username,keycloak.tokenParsed.username);}catch(_){ }
    try{const me=window.BananaUI?.state?.me;if(me)out.push(me.email,me.username,me.preferred_username);}catch(_){ }
    return out.filter(Boolean).map(v=>String(v).trim().toLowerCase());
  }

  function isDemo(){
    const ids=identities();
    return ids.includes(DEMO_EMAIL)||ids.includes('demo');
  }

  function ensureStyles(){
    if(document.getElementById('banana-demo-gps-v17-style'))return;
    const style=document.createElement('style');
    style.id='banana-demo-gps-v17-style';
    style.textContent=`
      #bananeras .banana-demo-orion-runtime{display:block}
      #bananeras .banana-demo-orion-head{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:18px}
      #bananeras .banana-demo-orion-head h3{margin:0 0 5px;font-size:20px}
      #bananeras .banana-demo-orion-head p{margin:0;color:var(--muted);font-size:13px}
      #bananeras .banana-demo-orion-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(320px,.9fr);gap:18px;align-items:stretch}
      #bananeras .banana-demo-map-card,#bananeras .banana-demo-side-card{background:var(--panel);border:1px solid var(--border);border-radius:24px;box-shadow:var(--shadow);padding:14px}
      #bananeras .banana-demo-side-card{padding:20px;overflow:hidden}
      #bananaSatelliteMap{position:relative;width:100%;height:620px;min-height:620px;border-radius:20px;overflow:hidden;background:#dfe7d8}
      #bananaDemoLeafletMap{width:100%;height:100%;min-height:620px;border-radius:20px;overflow:hidden;background:#dfe7d8}
      #bananeras .banana-demo-gps-banner{margin:0 0 12px;padding:11px 12px;border:1px solid rgba(85,198,43,.28);background:rgba(85,198,43,.08);border-radius:14px;font-size:12px;line-height:1.45;color:var(--muted)}
      #bananeras .banana-demo-gps-banner b{color:var(--text)}
      #bananeras .banana-demo-operator-list{display:grid;gap:8px;max-height:355px;overflow:auto;padding-right:3px}
      #bananeras .banana-demo-operator-card{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--border);border-radius:14px;background:var(--panel2);color:var(--text);text-align:left;cursor:pointer}
      #bananeras .banana-demo-operator-card:hover,#bananeras .banana-demo-operator-card.active{border-color:rgba(85,198,43,.45);background:rgba(85,198,43,.09)}
      #bananeras .banana-demo-operator-card b{display:block;font-size:13px}
      #bananeras .banana-demo-operator-card small{display:block;color:var(--muted);margin-top:3px;font-size:11px}
      #bananeras .banana-demo-operator-card>span:last-child{font-size:11px;font-weight:800;color:var(--muted);white-space:nowrap}
      #bananeras .banana-demo-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:7px;vertical-align:-1px}
      #bananeras .banana-demo-details{margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:16px;background:var(--panel2);font-size:12px;line-height:1.45}
      #bananeras .banana-demo-details h3{margin:0 0 10px;font-size:16px}
      #bananeras .banana-demo-details p{margin:6px 0}
      #bananeras .banana-demo-label{background:#fff!important;border:1px solid rgba(17,24,39,.14)!important;color:#111!important;border-radius:9px!important;padding:4px 7px!important;font-size:11px!important;font-weight:900!important;box-shadow:0 4px 12px rgba(0,0,0,.2)!important}
      #bananeras .banana-demo-label:before{display:none!important}
      #bananeras .banana-demo-map-error{height:100%;min-height:520px;display:grid;place-items:center;padding:30px;text-align:center;color:#b42318;font-weight:800;background:#fff5f4;border-radius:20px}
      @media(max-width:1050px){#bananeras .banana-demo-orion-grid{grid-template-columns:1fr}#bananaSatelliteMap,#bananaDemoLeafletMap{height:500px;min-height:500px}}
      @media(max-width:620px){#bananeras .banana-demo-orion-head{align-items:flex-start;flex-direction:column}#bananaSatelliteMap,#bananaDemoLeafletMap{height:400px;min-height:400px}}
    `;
    document.head.appendChild(style);
  }

  async function loadTracks(){
    if(tracks.length)return tracks;
    if(loadingPromise)return loadingPromise;
    loadingPromise=(async()=>{
      const ir=await fetch(`${INDEX_URL}?v=${VERSION}`,{cache:'no-store'});
      if(!ir.ok)throw new Error(`Índice GPS demo HTTP ${ir.status}`);
      const index=await ir.json();
      const loaded=[];
      for(let i=0;i<(index.operators||[]).length;i++){
        const meta=index.operators[i];
        const r=await fetch(`demo/${meta.file}?v=${VERSION}`,{cache:'no-store'});
        if(!r.ok)throw new Error(`${meta.file} HTTP ${r.status}`);
        const x=await r.json();
        x.color=x.color||meta.color||COLORS[i%COLORS.length];
        x.name=x.name||meta.name||`Operador ${i+1}`;
        x.id=x.id||meta.id||`ORION-DEMO-${String(i+1).padStart(2,'0')}`;
        x.date=x.date||meta.date||'';
        x.battery=x.battery??meta.battery??null;
        x.state=x.state||meta.state||'Activo';
        x.distance_km=Number(x.distance_km??meta.distance_km??0);
        x.points=(x.points||[]).filter(p=>Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon)));
        if(x.points.length)loaded.push(x);
      }
      tracks=loaded;
      return loaded;
    })().finally(()=>{loadingPromise=null;});
    return loadingPromise;
  }

  function panel(){
    return document.querySelector('#bananeras [data-banana-panel="orion"]');
  }

  function ensureRuntime(){
    ensureStyles();
    const hostPanel=panel();
    if(!hostPanel)throw new Error('No existe la pestaña ORIÓN GPS del módulo Bananeras.');

    let runtime=hostPanel.querySelector('.banana-demo-orion-runtime');
    if(runtime)return runtime;

    hostPanel.innerHTML=`
      <div class="banana-demo-orion-runtime">
        <div class="banana-demo-orion-head">
          <div>
            <h3>🍌 Bananeras · ORIÓN GPS</h3>
            <p>Mapa satelital de recorridos, trazabilidad de labores y ubicación de operadores.</p>
          </div>
          <button type="button" class="btn ghost" data-demo-gps-refresh>Actualizar datos</button>
        </div>
        <div class="banana-demo-orion-grid">
          <div class="banana-demo-map-card"><div id="bananaSatelliteMap"></div></div>
          <div class="banana-demo-side-card">
            <h3 style="margin:0 0 8px">Operadores asignados</h3>
            <p class="hint" style="margin:0 0 14px">Selecciona un operador para centrar su recorrido GPS.</p>
            <div id="bananaSatelliteList" class="banana-demo-operator-list"></div>
            <div id="bananaSatelliteDetails" class="banana-demo-details"><p class="hint">Selecciona un operador.</p></div>
          </div>
        </div>
      </div>`;

    runtime=hostPanel.querySelector('.banana-demo-orion-runtime');
    runtime.querySelector('[data-demo-gps-refresh]').onclick=()=>render().catch(showError);
    return runtime;
  }

  function destroyMap(){
    demoLayers=[];
    if(demoMap){try{demoMap.remove();}catch(_){ }demoMap=null;}
    try{
      if(window.bananaSatelliteMap&&typeof window.bananaSatelliteMap.remove==='function')window.bananaSatelliteMap.remove();
    }catch(_){ }
    window.bananaSatelliteMap=null;
  }

  function createMap(){
    if(!window.L)throw new Error('Leaflet no está disponible en la página.');
    ensureRuntime();
    const host=document.getElementById('bananaSatelliteMap');
    if(!host)throw new Error('No se pudo crear el área del mapa ORIÓN demo.');

    destroyMap();
    host.innerHTML='<div id="bananaDemoLeafletMap"></div>';
    const el=document.getElementById('bananaDemoLeafletMap');

    demoMap=L.map(el,{zoomControl:true,preferCanvas:true,attributionControl:true}).setView([-2.1400,-79.8655],17);
    window.bananaSatelliteMap=demoMap;

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {maxZoom:20,maxNativeZoom:19,attribution:'Imagery © Esri'}
    ).addTo(demoMap);

    L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {maxZoom:20,opacity:.72}
    ).addTo(demoMap);

    return demoMap;
  }

  function renderList(items){
    const list=document.getElementById('bananaSatelliteList');
    if(!list)return;
    const total=items.reduce((a,x)=>a+x.points.length,0);
    list.innerHTML=`
      <div class="banana-demo-gps-banner"><b>DEMO · ORIÓN GPS</b><br>${total} puntos reales del track suministrado. Los nombres de operadores son ficticios.</div>
      ${items.map((x,i)=>`
        <button type="button" class="banana-demo-operator-card" data-demo-orion="${i}">
          <span><b><span class="banana-demo-dot" style="background:${esc(x.color)}"></span>${esc(x.name)}</b><small>${esc(x.id)} · ${esc(x.date)}</small></span>
          <span>${x.points.length} pts · ${Number(x.distance_km).toFixed(2)} km</span>
        </button>`).join('')}`;
    list.querySelectorAll('[data-demo-orion]').forEach(btn=>btn.onclick=()=>focus(Number(btn.dataset.demoOrion)));
  }

  function popup(track,p,index){
    return `<b>${esc(track.name)}</b><br>${esc(track.id)}<br>Punto ${index+1}/${track.points.length}<br>${esc(p.time||'—')}<br>${Number(p.lat).toFixed(6)}, ${Number(p.lon).toFixed(6)}`;
  }

  function draw(items,map){
    const all=[];
    items.forEach((track,ti)=>{
      const color=track.color||COLORS[ti%COLORS.length];
      const coords=track.points.map(p=>[Number(p.lat),Number(p.lon)]);
      all.push(...coords);

      const line=L.polyline(coords,{color,weight:4,opacity:.88,smoothFactor:.4}).addTo(map);
      line.bindPopup(`<b>${esc(track.name)}</b><br>${esc(track.id)}<br>${esc(track.date)}<br>${track.points.length} puntos · ${Number(track.distance_km).toFixed(2)} km`);
      demoLayers.push(line);

      track.points.forEach((p,i)=>{
        const dot=L.circleMarker([Number(p.lat),Number(p.lon)],{
          radius:(i===0||i===track.points.length-1)?4:2.1,
          color,weight:1,opacity:.95,fillColor:color,fillOpacity:.76
        }).addTo(map);
        dot.bindPopup(popup(track,p,i));
        demoLayers.push(dot);
      });

      const last=coords[coords.length-1];
      if(last){
        const marker=L.circleMarker(last,{radius:7,color:'#fff',weight:2,fillColor:color,fillOpacity:1}).addTo(map);
        marker.bindTooltip(track.name,{permanent:true,direction:'right',offset:[9,0],className:'banana-demo-label'});
        demoLayers.push(marker);
      }
    });

    if(all.length)map.fitBounds(L.latLngBounds(all),{padding:[28,28],maxZoom:18});
    setTimeout(()=>{try{map.invalidateSize(true);}catch(_){ }},100);
    setTimeout(()=>{try{map.invalidateSize(true);}catch(_){ }},450);
  }

  function showDetails(track){
    const d=document.getElementById('bananaSatelliteDetails');
    if(!d)return;
    const first=track.points[0],last=track.points[track.points.length-1];
    d.innerHTML=`
      <h3><span class="banana-demo-dot" style="background:${esc(track.color)}"></span>${esc(track.name)}</h3>
      <p><b>Equipo:</b> ${esc(track.id)}</p>
      <p><b>Fecha:</b> ${esc(track.date)}</p>
      <p><b>Puntos registrados:</b> ${track.points.length}</p>
      <p><b>Distancia recorrida:</b> ${Number(track.distance_km).toFixed(2)} km</p>
      <p><b>Inicio:</b> ${esc(first?.time||'—')}</p>
      <p><b>Fin:</b> ${esc(last?.time||'—')}</p>
      <p><b>Batería:</b> ${track.battery??'—'}%</p>
      <p><b>Estado:</b> ${esc(track.state||'Activo')}</p>
      <p class="hint">Coordenadas reales del track suministrado. Identidad ficticia únicamente para demostración.</p>`;
  }

  function focus(index){
    const x=tracks[index];
    if(!x||!demoMap)return;
    document.querySelectorAll('#bananaSatelliteList [data-demo-orion]').forEach((btn,i)=>btn.classList.toggle('active',i===index));
    const coords=x.points.map(p=>[Number(p.lat),Number(p.lon)]);
    if(coords.length)demoMap.fitBounds(L.latLngBounds(coords),{padding:[35,35],maxZoom:19});
    showDetails(x);
  }

  async function render(){
    if(!isDemo())return;
    ensureRuntime();
    const items=await loadTracks();
    if(!items.length)throw new Error('No se encontraron puntos GPS demo.');
    const map=createMap();
    renderList(items);
    draw(items,map);
    showDetails(items[0]);
  }

  function showError(error){
    console.error('ORIÓN GPS demo v1.7:',error);
    try{ensureRuntime();}catch(_){ }
    const host=document.getElementById('bananaSatelliteMap');
    if(host)host.innerHTML=`<div class="banana-demo-map-error"><div><div style="font-size:34px;margin-bottom:10px">⚠️</div>No se pudo cargar el mapa demo.<br><small>${esc(error?.message||error)}</small></div></div>`;
    const list=document.getElementById('bananaSatelliteList');
    if(list)list.innerHTML=`<div class="banana-demo-gps-banner" style="border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.08)"><b>Error GPS demo</b><br>${esc(error?.message||error)}</div>`;
  }

  window.renderBananaDemoGps=()=>render().catch(showError);
  window.focusBananaDemoOperator=focus;

  function install(){
    if(installed||!isDemo())return;
    installed=true;
    window.refreshBananaSatellite=function(){render().catch(showError);};

    document.addEventListener('click',e=>{
      const tab=e.target.closest('#bananeras [data-banana-tab="orion"]');
      if(tab)setTimeout(()=>render().catch(showError),100);
    },true);
  }

  async function boot(){
    for(let i=0;i<240;i++){
      if(isDemo()&&window.BananaUI&&window.L&&panel()){
        install();
        await loadTracks();
        if(panel()?.classList.contains('active'))await render();
        return;
      }
      await sleep(250);
    }
    throw new Error('No se pudo inicializar la pestaña ORIÓN demo.');
  }

  boot().catch(showError);
})();