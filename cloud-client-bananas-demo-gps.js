/* TAYULABS Cloud · Bananeras demo GPS v1.5
   Render robusto de tracks reales solo para la cuenta demo.
*/
(function(){
  'use strict';

  const DEMO_EMAIL='demo@tayulabs.com';
  const VERSION='1.5';
  const INDEX_URL='demo/bananas-track-index.json';
  const COLORS=['#16a34a','#2563eb','#f59e0b','#7c3aed','#0891b2','#dc2626','#65a30d','#9333ea'];

  let tracks=[];
  let layers=[];
  let loadingPromise=null;
  let installed=false;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function identityValues(){
    const values=[];
    try{if(typeof currentUser!=='undefined'&&currentUser){values.push(currentUser.email,currentUser.username,currentUser.user);}}catch(_){ }
    try{
      if(typeof keycloak!=='undefined'&&keycloak?.tokenParsed){
        values.push(keycloak.tokenParsed.email,keycloak.tokenParsed.preferred_username,keycloak.tokenParsed.username);
      }
    }catch(_){ }
    try{
      const me=window.BananaUI?.state?.me;
      if(me)values.push(me.email,me.username,me.preferred_username);
    }catch(_){ }
    return values.filter(Boolean).map(v=>String(v).trim().toLowerCase());
  }

  function isDemoUser(){
    const ids=identityValues();
    return ids.includes(DEMO_EMAIL)||ids.includes('demo');
  }

  function ensureStyles(){
    if(document.getElementById('banana-demo-gps-v15-style'))return;
    const style=document.createElement('style');
    style.id='banana-demo-gps-v15-style';
    style.textContent=`
      #bananeras .banana-demo-gps-banner{margin:0 0 12px;padding:10px 12px;border:1px solid rgba(85,198,43,.28);background:rgba(85,198,43,.08);border-radius:14px;font-size:12px;line-height:1.45;color:var(--muted)}
      #bananeras .banana-demo-gps-banner b{color:var(--text)}
      #bananeras .banana-demo-track-label{background:var(--panel)!important;border:1px solid var(--border)!important;color:var(--text)!important;border-radius:10px!important;padding:5px 8px!important;font-size:11px!important;font-weight:900!important;box-shadow:0 4px 14px rgba(0,0,0,.16)!important}
      #bananeras .banana-demo-track-label:before{display:none!important}
      #bananeras .banana-demo-operator-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;vertical-align:-1px}
      #bananeras .banana-demo-operator-card{width:100%;text-align:left}
      #bananeras .banana-demo-operator-card.active{outline:2px solid rgba(85,198,43,.35);background:rgba(85,198,43,.08)}
    `;
    document.head.appendChild(style);
  }

  async function loadTracks(){
    if(tracks.length)return tracks;
    if(loadingPromise)return loadingPromise;
    loadingPromise=(async()=>{
      const indexResponse=await fetch(`${INDEX_URL}?v=${VERSION}`,{cache:'no-store'});
      if(!indexResponse.ok)throw new Error('No se pudo cargar el índice de tracks ORIÓN demo.');
      const index=await indexResponse.json();
      const loaded=[];
      for(let i=0;i<(index.operators||[]).length;i++){
        const meta=index.operators[i];
        const response=await fetch(`demo/${meta.file}?v=${VERSION}`,{cache:'no-store'});
        if(!response.ok)throw new Error(`No se pudo cargar ${meta.file}`);
        const data=await response.json();
        data.color=data.color||meta.color||COLORS[i%COLORS.length];
        data.name=data.name||meta.name||`Operador ${i+1}`;
        data.id=data.id||meta.id||`ORION-DEMO-${String(i+1).padStart(2,'0')}`;
        data.date=data.date||meta.date||'';
        data.battery=data.battery??meta.battery??null;
        data.state=data.state||meta.state||'Activo';
        data.distance_km=Number(data.distance_km??meta.distance_km??0);
        data.points=(data.points||[]).filter(p=>Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon)));
        if(data.points.length)loaded.push(data);
      }
      tracks=loaded;
      return tracks;
    })().finally(()=>{loadingPromise=null;});
    return loadingPromise;
  }

  function getMapElement(){return document.getElementById('bananaSatelliteMap');}

  function addSatelliteFallback(map){
    if(!map||map.__tayuDemoSatelliteChecked)return;
    map.__tayuDemoSatelliteChecked=true;
    let hasTiles=false;
    try{map.eachLayer(layer=>{if(window.L&&layer instanceof L.TileLayer)hasTiles=true;});}catch(_){ }
    if(hasTiles)return;
    try{
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {maxZoom:20,attribution:'Tiles © Esri'}
      ).addTo(map);
    }catch(error){console.warn('No se pudo agregar capa satelital demo:',error);}
  }

  async function ensureMap(){
    const el=getMapElement();
    if(!el||!window.L)return null;

    if(!window.bananaSatelliteMap){
      try{window.initBananaSatelliteMap?.();}catch(error){console.warn('initBananaSatelliteMap:',error);}
      await sleep(80);
    }

    if(!window.bananaSatelliteMap){
      try{
        window.bananaSatelliteMap=L.map(el,{zoomControl:true}).setView([-2.14,-79.866],17);
      }catch(error){
        console.error('No se pudo crear mapa ORIÓN demo:',error);
        return null;
      }
    }

    addSatelliteFallback(window.bananaSatelliteMap);
    try{window.bananaSatelliteMap.invalidateSize(true);}catch(_){ }
    return window.bananaSatelliteMap;
  }

  function clearLayers(map){
    if(!map)return;
    for(const layer of layers){try{map.removeLayer(layer);}catch(_){ }}
    layers=[];
    try{
      if(typeof bananaSatelliteMarkers!=='undefined'&&Array.isArray(bananaSatelliteMarkers)){
        bananaSatelliteMarkers.forEach(m=>{try{map.removeLayer(m);}catch(_){ }});
        bananaSatelliteMarkers.splice(0,bananaSatelliteMarkers.length);
      }
    }catch(_){ }
  }

  function renderList(items){
    const list=document.getElementById('bananaSatelliteList');
    if(!list)return;
    list.innerHTML=`
      <div class="banana-demo-gps-banner">
        <b>DEMO · recorridos GPS reales</b><br>
        474 puntos obtenidos del track suministrado. Los nombres de operadores son demostrativos.
      </div>
      ${items.map((x,i)=>`
        <button type="button" class="tayu-list-card banana-demo-operator-card" data-demo-orion-index="${i}">
          <span>
            <b><span class="banana-demo-operator-dot" style="background:${esc(x.color)}"></span>${esc(x.name)}</b>
            <small>${esc(x.id)} · ${esc(x.date)}</small>
          </span>
          <span>${x.points.length} pts · ${Number(x.distance_km||0).toFixed(2)} km</span>
        </button>`).join('')}`;

    list.querySelectorAll('[data-demo-orion-index]').forEach(btn=>{
      btn.onclick=()=>focusOperator(Number(btn.dataset.demoOrionIndex));
    });
  }

  function pointPopup(track,point,index){
    return `<b>${esc(track.name)}</b><br>${esc(track.id)}<br>Punto ${index+1} de ${track.points.length}<br>${esc(point.time||'Sin hora')}<br>${Number(point.lat).toFixed(6)}, ${Number(point.lon).toFixed(6)}`;
  }

  async function renderDemoGps(){
    if(!isDemoUser())return;
    ensureStyles();
    const items=await loadTracks();
    if(!items.length)throw new Error('Los tracks demo no contienen coordenadas.');

    const map=await ensureMap();
    if(!map)return;
    clearLayers(map);

    const allCoords=[];

    items.forEach((track,trackIndex)=>{
      const color=track.color||COLORS[trackIndex%COLORS.length];
      const coords=track.points.map(p=>[Number(p.lat),Number(p.lon)]);
      allCoords.push(...coords);

      const line=L.polyline(coords,{color,weight:4,opacity:.82,smoothFactor:.5}).addTo(map);
      line.bindPopup(`<b>${esc(track.name)}</b><br>${esc(track.id)}<br>${esc(track.date)}<br>${track.points.length} puntos · ${Number(track.distance_km||0).toFixed(2)} km`);
      layers.push(line);

      track.points.forEach((point,index)=>{
        const dot=L.circleMarker([Number(point.lat),Number(point.lon)],{
          radius:index===0||index===track.points.length-1?4:2.3,
          color,
          weight:1,
          opacity:.95,
          fillColor:color,
          fillOpacity:index===0||index===track.points.length-1?1:.72
        }).addTo(map);
        dot.bindPopup(pointPopup(track,point,index));
        layers.push(dot);
      });

      const last=coords[coords.length-1];
      if(last){
        const end=L.circleMarker(last,{radius:7,color:'#ffffff',weight:2,fillColor:color,fillOpacity:1}).addTo(map);
        end.bindTooltip(track.name,{permanent:true,direction:'right',offset:[8,0],className:'banana-demo-track-label'});
        end.bindPopup(`<b>${esc(track.name)}</b><br>${esc(track.id)}<br>Último punto · ${esc(track.points[track.points.length-1]?.time||'')}`);
        layers.push(end);
      }
    });

    renderList(items);

    if(allCoords.length){
      try{map.fitBounds(L.latLngBounds(allCoords),{padding:[28,28],maxZoom:18});}catch(_){ }
    }

    setTimeout(()=>{try{map.invalidateSize(true);}catch(_){ }},80);
    setTimeout(()=>{try{map.invalidateSize(true);}catch(_){ }},350);
  }

  function focusOperator(index){
    const track=tracks[index];
    const map=window.bananaSatelliteMap;
    if(!track||!map||!window.L)return;

    document.querySelectorAll('#bananaSatelliteList [data-demo-orion-index]').forEach((btn,i)=>btn.classList.toggle('active',i===index));

    const coords=track.points.map(p=>[Number(p.lat),Number(p.lon)]);
    if(coords.length){try{map.fitBounds(L.latLngBounds(coords),{padding:[38,38],maxZoom:19});}catch(_){ }}

    const first=track.points[0];
    const last=track.points[track.points.length-1];
    const detail=document.getElementById('bananaSatelliteDetails');
    if(detail){
      detail.innerHTML=`
        <h3 style="margin-top:0"><span class="banana-demo-operator-dot" style="background:${esc(track.color)}"></span>${esc(track.name)}</h3>
        <p><b>Equipo:</b> ${esc(track.id)}</p>
        <p><b>Fecha:</b> ${esc(track.date)}</p>
        <p><b>Puntos registrados:</b> ${track.points.length}</p>
        <p><b>Distancia recorrida:</b> ${Number(track.distance_km||0).toFixed(2)} km</p>
        <p><b>Inicio:</b> ${esc(first?.time||'—')}</p>
        <p><b>Fin:</b> ${esc(last?.time||'—')}</p>
        <p><b>Última ubicación:</b> ${last?`${Number(last.lat).toFixed(6)}, ${Number(last.lon).toFixed(6)}`:'—'}</p>
        <p><b>Batería:</b> ${track.battery??'—'}%</p>
        <p class="hint">Las coordenadas pertenecen al archivo suministrado; el nombre del operador es ficticio para demostración.</p>`;
    }
  }

  window.focusBananaDemoOperator=focusOperator;
  window.renderBananaDemoGps=()=>renderDemoGps().catch(error=>console.error('ORIÓN GPS demo:',error));

  function install(){
    if(installed||!isDemoUser())return false;
    installed=true;

    window.refreshBananaSatellite=function(){
      renderDemoGps().catch(error=>console.error('ORIÓN GPS demo:',error));
    };

    document.addEventListener('click',event=>{
      const tab=event.target.closest('#bananeras [data-banana-tab="orion"]');
      if(tab){
        setTimeout(()=>renderDemoGps().catch(error=>console.error('ORIÓN GPS demo:',error)),120);
        setTimeout(()=>renderDemoGps().catch(error=>console.error('ORIÓN GPS demo:',error)),450);
      }
    },true);

    const legacyRefresh=document.querySelector('#bananeras .banana-legacy-orion button[onclick*="refreshBananaSatellite"]');
    if(legacyRefresh){
      legacyRefresh.onclick=event=>{
        event.preventDefault();
        renderDemoGps().catch(error=>console.error('ORIÓN GPS demo:',error));
      };
    }

    return true;
  }

  async function boot(){
    for(let i=0;i<240;i++){
      if(isDemoUser()&&window.BananaUI&&window.L&&document.getElementById('bananaSatelliteMap')){
        install();
        await loadTracks();
        const orionPanel=document.querySelector('#bananeras [data-banana-panel="orion"]');
        if(orionPanel?.classList.contains('active'))await renderDemoGps();
        return;
      }
      await sleep(250);
    }
    console.warn('ORIÓN GPS demo: no se pudo resolver el contexto de la cuenta demo. Identidades:',identityValues());
  }

  boot().catch(error=>console.error('ORIÓN GPS demo boot:',error));
})();