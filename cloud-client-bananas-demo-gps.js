/* TAYULABS Cloud · Bananeras demo GPS v1.6
   Mapa Leaflet independiente para demo@tayulabs.com.
*/
(function(){
  'use strict';

  const DEMO_EMAIL='demo@tayulabs.com';
  const VERSION='1.6';
  const INDEX_URL='demo/bananas-track-index.json';
  const COLORS=['#16a34a','#2563eb','#f59e0b','#7c3aed','#0891b2','#dc2626','#65a30d','#9333ea'];

  let tracks=[];
  let demoMap=null;
  let demoLayers=[];
  let loadingPromise=null;
  let renderSeq=0;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function identities(){
    const out=[];
    try{if(typeof currentUser!=='undefined'&&currentUser)out.push(currentUser.email,currentUser.username,currentUser.user);}catch(_){ }
    try{if(typeof keycloak!=='undefined'&&keycloak?.tokenParsed)out.push(keycloak.tokenParsed.email,keycloak.tokenParsed.preferred_username,keycloak.tokenParsed.username);}catch(_){ }
    try{const me=window.BananaUI?.state?.me;if(me)out.push(me.email,me.username,me.preferred_username);}catch(_){ }
    return out.filter(Boolean).map(v=>String(v).trim().toLowerCase());
  }

  function isDemo(){const ids=identities();return ids.includes(DEMO_EMAIL)||ids.includes('demo');}

  function ensureStyles(){
    if(document.getElementById('banana-demo-gps-v16-style'))return;
    const style=document.createElement('style');
    style.id='banana-demo-gps-v16-style';
    style.textContent=`
      #bananaSatelliteMap{position:relative;min-height:620px;background:#dfe7d8}
      #bananaDemoLeafletMap{width:100%;height:620px;border-radius:20px;overflow:hidden;background:#dfe7d8}
      #bananeras .banana-demo-gps-banner{margin:0 0 12px;padding:11px 12px;border:1px solid rgba(85,198,43,.28);background:rgba(85,198,43,.08);border-radius:14px;font-size:12px;line-height:1.45;color:var(--muted)}
      #bananeras .banana-demo-gps-banner b{color:var(--text)}
      #bananeras .banana-demo-operator-card{width:100%;text-align:left;cursor:pointer}
      #bananeras .banana-demo-operator-card.active{outline:2px solid rgba(85,198,43,.38);background:rgba(85,198,43,.08)}
      #bananeras .banana-demo-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;vertical-align:-1px}
      #bananeras .banana-demo-label{background:#fff!important;border:1px solid rgba(17,24,39,.12)!important;color:#111!important;border-radius:9px!important;padding:4px 7px!important;font-size:11px!important;font-weight:900!important;box-shadow:0 4px 12px rgba(0,0,0,.2)!important}
      #bananeras .banana-demo-label:before{display:none!important}
      #bananeras .banana-demo-map-error{height:100%;min-height:520px;display:grid;place-items:center;padding:30px;text-align:center;color:#b42318;font-weight:800;background:#fff5f4;border-radius:20px}
      @media(max-width:960px){#bananaSatelliteMap,#bananaDemoLeafletMap{min-height:420px;height:420px}}
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
      return tracks;
    })().finally(()=>{loadingPromise=null;});
    return loadingPromise;
  }

  function clearOriginalMap(){
    try{
      if(window.bananaSatelliteMap&&typeof window.bananaSatelliteMap.remove==='function')window.bananaSatelliteMap.remove();
    }catch(_){ }
    try{window.bananaSatelliteMap=null;}catch(_){ }
    try{
      if(typeof bananaSatelliteMarkers!=='undefined'&&Array.isArray(bananaSatelliteMarkers))bananaSatelliteMarkers.splice(0,bananaSatelliteMarkers.length);
    }catch(_){ }
  }

  function destroyDemoMap(){
    demoLayers=[];
    if(demoMap){try{demoMap.remove();}catch(_){ }demoMap=null;}
  }

  function prepareHost(){
    const host=document.getElementById('bananaSatelliteMap');
    if(!host)return null;
    clearOriginalMap();
    destroyDemoMap();
    host.removeAttribute('_leaflet_id');
    host.innerHTML='<div id="bananaDemoLeafletMap"></div>';
    return document.getElementById('bananaDemoLeafletMap');
  }

  function createMap(){
    if(!window.L)throw new Error('Leaflet no está disponible en la página.');
    const el=prepareHost();
    if(!el)throw new Error('No existe el contenedor bananaSatelliteMap.');

    demoMap=L.map(el,{zoomControl:true,preferCanvas:true}).setView([-2.1400,-79.8655],17);

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {maxZoom:20,maxNativeZoom:19,attribution:'Imagery © Esri'}
    ).addTo(demoMap);

    L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {maxZoom:20,opacity:.75}
    ).addTo(demoMap);

    return demoMap;
  }

  function renderList(items){
    const list=document.getElementById('bananaSatelliteList');
    if(!list)return;
    const total=items.reduce((a,x)=>a+x.points.length,0);
    list.innerHTML=`
      <div class="banana-demo-gps-banner"><b>DEMO · ORIÓN GPS</b><br>${total} puntos del track suministrado. Los nombres de operadores son ficticios para demostración.</div>
      ${items.map((x,i)=>`
        <button type="button" class="tayu-list-card banana-demo-operator-card" data-demo-orion="${i}">
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
          radius:(i===0||i===track.points.length-1)?4:2.2,
          color,weight:1,opacity:.95,fillColor:color,fillOpacity:.78
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
    setTimeout(()=>{try{map.invalidateSize(true);}catch(_){ }},500);
  }

  function showDetails(track){
    const d=document.getElementById('bananaSatelliteDetails');
    if(!d)return;
    const first=track.points[0],last=track.points[track.points.length-1];
    d.innerHTML=`
      <h3 style="margin-top:0"><span class="banana-demo-dot" style="background:${esc(track.color)}"></span>${esc(track.name)}</h3>
      <p><b>Equipo:</b> ${esc(track.id)}</p>
      <p><b>Fecha:</b> ${esc(track.date)}</p>
      <p><b>Puntos registrados:</b> ${track.points.length}</p>
      <p><b>Distancia recorrida:</b> ${Number(track.distance_km).toFixed(2)} km</p>
      <p><b>Inicio:</b> ${esc(first?.time||'—')}</p>
      <p><b>Fin:</b> ${esc(last?.time||'—')}</p>
      <p><b>Batería:</b> ${track.battery??'—'}%</p>
      <p><b>Estado:</b> ${esc(track.state||'Activo')}</p>
      <p class="hint">Coordenadas reales del track suministrado. Identidad del operador creada únicamente para demo.</p>`;
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
    const seq=++renderSeq;
    ensureStyles();
    const items=await loadTracks();
    if(seq!==renderSeq)return;
    if(!items.length)throw new Error('No se encontraron puntos GPS demo.');
    const map=createMap();
    renderList(items);
    draw(items,map);
    showDetails(items[0]);
  }

  function showError(error){
    console.error('ORIÓN GPS demo v1.6:',error);
    const host=document.getElementById('bananaSatelliteMap');
    if(host)host.innerHTML=`<div class="banana-demo-map-error"><div><div style="font-size:34px;margin-bottom:10px">⚠️</div>No se pudo cargar el mapa demo.<br><small>${esc(error?.message||error)}</small></div></div>`;
    const list=document.getElementById('bananaSatelliteList');
    if(list)list.innerHTML=`<div class="banana-demo-gps-banner" style="border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.08)"><b>Error GPS demo</b><br>${esc(error?.message||error)}</div>`;
  }

  window.renderBananaDemoGps=()=>render().catch(showError);
  window.focusBananaDemoOperator=focus;

  function install(){
    if(!isDemo())return;

    window.refreshBananaSatellite=function(){render().catch(showError);};

    document.addEventListener('click',e=>{
      const tab=e.target.closest('#bananeras [data-banana-tab="orion"]');
      if(tab){
        setTimeout(()=>render().catch(showError),120);
      }
    },true);

    const observer=new MutationObserver(()=>{
      const panel=document.querySelector('#bananeras [data-banana-panel="orion"]');
      if(panel?.classList.contains('active')&&!document.getElementById('bananaDemoLeafletMap')){
        setTimeout(()=>render().catch(showError),80);
      }
    });
    const root=document.getElementById('bananeras');
    if(root)observer.observe(root,{subtree:true,attributes:true,attributeFilter:['class']});
  }

  async function boot(){
    for(let i=0;i<240;i++){
      if(isDemo()&&window.BananaUI&&window.L&&document.getElementById('bananaSatelliteMap')){
        install();
        await loadTracks();
        const panel=document.querySelector('#bananeras [data-banana-panel="orion"]');
        if(panel?.classList.contains('active'))await render();
        return;
      }
      await sleep(250);
    }
    throw new Error('No se pudo inicializar el contexto ORIÓN demo.');
  }

  boot().catch(showError);
})();