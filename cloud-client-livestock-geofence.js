/* TAYULABS Cloud · Ganadería · geocercas v1.0 */
(function(){
  'use strict';

  const state={
    siteId:'',
    drawing:false,
    points:[],
    preview:null,
    pointLayers:[],
    savedLayers:[],
    geofences:[],
    editingId:null
  };

  const esc=v=>String(v??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");

  function map(){
    return window.cattleSatelliteMap||null;
  }

  function currentSite(){
    return String(document.getElementById('lcSite')?.value||'');
  }

  function injectStyles(){
    if(document.getElementById('tayuLivestockGeofenceCss'))return;
    const style=document.createElement('style');
    style.id='tayuLivestockGeofenceCss';
    style.textContent=`
      #ganaderia .lgf-btn{display:inline-flex;align-items:center;gap:7px}
      #ganaderia .lgf-status{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:850;background:rgba(91,193,47,.12);color:#2f7e18}
      #ganaderia .lgf-status.off{background:rgba(100,116,139,.1);color:var(--muted)}
      #ganaderia .lgf-panel{display:none;position:absolute;right:14px;top:14px;z-index:650;width:min(330px,calc(100% - 28px));background:rgba(255,255,255,.97);border:1px solid rgba(148,163,184,.28);border-radius:18px;padding:14px;box-shadow:0 18px 50px rgba(15,23,42,.24);backdrop-filter:blur(12px);color:#17231a}
      #ganaderia .lgf-panel.show{display:block}
      #ganaderia .lgf-panel h4{margin:0;font-size:14px}
      #ganaderia .lgf-panel p{margin:5px 0 10px;color:#64748b;font-size:11px;line-height:1.45}
      #ganaderia .lgf-panel label{font-size:10px;font-weight:800;color:#64748b}
      #ganaderia .lgf-panel input,#ganaderia .lgf-panel select{margin-top:5px;width:100%}
      #ganaderia .lgf-check{display:flex;gap:8px;align-items:center;margin-top:10px;font-size:11px;font-weight:800}
      #ganaderia .lgf-check input{width:auto;margin:0}
      #ganaderia .lgf-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
      #ganaderia .lgf-manager{display:grid;gap:12px}
      #ganaderia .lgf-manager-head{display:flex;justify-content:space-between;gap:12px;align-items:center}
      #ganaderia .lgf-zone-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}
      #ganaderia .lgf-zone{border:1px solid var(--border);background:var(--panel2);border-radius:15px;padding:12px;display:grid;gap:8px}
      #ganaderia .lgf-zone-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      #ganaderia .lgf-zone small{color:var(--muted)}
      #ganaderia .lgf-zone-actions{display:flex;gap:7px;flex-wrap:wrap}
      #ganaderia .lgf-zone-badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:rgba(91,193,47,.12);font-size:10px;font-weight:900;color:#2f7e18}
      #ganaderia .lgf-zone-badge.noalert{background:rgba(100,116,139,.10);color:#64748b}
      #ganaderia .lgf-counter{margin-top:9px;padding:8px 10px;border-radius:11px;background:#f4f7f4;font-size:11px}
      #ganaderia .lgf-legend{display:flex;gap:8px;align-items:center;font-size:11px;color:var(--muted);margin-top:7px}
      #ganaderia .lgf-dot{width:10px;height:10px;border-radius:50%;background:#5BC12F;box-shadow:0 0 0 4px rgba(91,193,47,.15)}
      .lgf-vertex{width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid #5BC12F;box-shadow:0 2px 8px rgba(0,0,0,.28)}
    `;
    document.head.appendChild(style);
  }

  function headerActions(){
    const header=document.querySelector('#ganaderia .module-header');
    if(!header)return null;
    let actions=header.querySelector('.actions');
    if(!actions){
      actions=document.createElement('div');
      actions.className='actions';
      const refresh=header.querySelector('#lcRefresh');
      if(refresh)actions.appendChild(refresh);
      header.appendChild(actions);
    }
    return actions;
  }

  function ensureUi(){
    const view=document.getElementById('ganaderia');
    if(!view||!view.dataset.livestockMap)return false;
    injectStyles();

    const actions=headerActions();
    if(actions&&!document.getElementById('lgfStart')){
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='btn ghost lgf-btn';
      btn.id='lgfStart';
      btn.innerHTML='⌗ Delimitar zona';
      btn.addEventListener('click',startDrawing);
      actions.prepend(btn);

      const status=document.createElement('span');
      status.id='lgfStatus';
      status.className='lgf-status off';
      status.textContent='Sin perímetro';
      actions.prepend(status);
    }

    const card=document.querySelector('#ganaderia .lc-map-card');
    if(card&&!document.getElementById('lgfPanel')){
      const panel=document.createElement('div');
      panel.id='lgfPanel';
      panel.className='lgf-panel';
      panel.innerHTML=`
        <h4 id="lgfPanelTitle">Nueva zona ganadera</h4>
        <p>Marca el perímetro con clics sobre el mapa. Al editar puedes arrastrar los vértices existentes o agregar nuevos.</p>
        <label>Nombre de la zona</label>
        <input id="lgfName" value="Perímetro principal" placeholder="Ej. Potrero A">
        <div style="margin-top:10px">
          <label>Tipo de zona</label>
          <select id="lgfZoneType">
            <option value="farm">Perímetro de finca</option>
            <option value="paddock">Potrero</option>
            <option value="water">Zona de agua</option>
            <option value="custom">Otra zona</option>
          </select>
        </div>
        <div style="margin-top:10px">
          <label>Aplicar alerta a</label>
          <select id="lgfHerd">
            <option value="">Todos los animales</option>
          </select>
        </div>
        <label class="lgf-check"><input type="checkbox" id="lgfAlerts" checked> Alertar cuando el animal salga de esta zona</label>
        <div style="margin-top:10px">
          <label>Severidad de la alerta</label>
          <select id="lgfSeverity">
            <option value="critical">Crítica</option>
            <option value="warning">Advertencia</option>
            <option value="info">Información</option>
          </select>
        </div>
        <div class="lgf-counter" id="lgfCounter">0 puntos marcados</div>
        <div class="lgf-legend"><span class="lgf-dot"></span><span>Las zonas se guardan en la finca y vuelven a cargarse al ingresar.</span></div>
        <p style="margin-top:8px">Los destinatarios se gestionan en <b>Notificaciones</b>. Para agua u otras zonas informativas puedes desactivar la alerta.</p>
        <div class="lgf-actions">
          <button type="button" class="btn ghost" id="lgfUndo">Deshacer</button>
          <button type="button" class="btn ghost" id="lgfCancel">Cancelar</button>
          <button type="button" class="btn" id="lgfSave">Guardar zona</button>
        </div>
      `;
      card.appendChild(panel);
      panel.querySelector('#lgfUndo')?.addEventListener('click',undoPoint);
      panel.querySelector('#lgfCancel')?.addEventListener('click',cancelDrawing);
      panel.querySelector('#lgfSave')?.addEventListener('click',saveGeofence);
    }

    if(!document.getElementById('lgfManager')){
      const shell=view.querySelector('.lc-shell');
      const before=view.querySelector('#lcIotDetails');
      const manager=document.createElement('div');
      manager.id='lgfManager';
      manager.className='card lgf-manager';
      manager.innerHTML=`
        <div class="lgf-manager-head">
          <div><h3 style="margin:0">Zonas del mapa</h3><p class="hint" style="margin:5px 0 0">Perímetros, potreros, puntos de agua y otras áreas de la finca.</p></div>
          <button type="button" class="btn" id="lgfNewZone">+ Nueva zona</button>
        </div>
        <div class="lgf-zone-list" id="lgfZoneList"><p class="hint">Cargando zonas…</p></div>
      `;
      if(shell){
        if(before) shell.insertBefore(manager,before);
        else shell.appendChild(manager);
      }
      manager.querySelector('#lgfNewZone')?.addEventListener('click',startDrawing);
    }

    bindMap();
    fillHerdOptions();
    return true;
  }

  function clearPreview(){
    const m=map();
    if(state.preview&&m){
      try{m.removeLayer(state.preview)}catch(_){}
    }
    state.preview=null;
    for(const layer of state.pointLayers){
      try{m?.removeLayer(layer)}catch(_){}
    }
    state.pointLayers=[];
  }

  function updateCounter(){
    const el=document.getElementById('lgfCounter');
    if(el)el.textContent=state.points.length+' punto'+(state.points.length===1?'':'s')+' marcado'+(state.points.length===1?'':'s');
  }

  function redrawPreview(){
    const m=map();if(!m)return;
    clearPreview();

    state.pointLayers=state.points.map(([lat,lon])=>
      L.marker([lat,lon],{
        interactive:false,
        icon:L.divIcon({
          className:'',
          html:'<div class="lgf-vertex"></div>',
          iconSize:[12,12],
          iconAnchor:[6,6]
        })
      }).addTo(m)
    );

    if(state.points.length>=2){
      if(state.points.length>=3){
        state.preview=L.polygon(state.points,{
          color:'#5BC12F',
          weight:3,
          fillColor:'#5BC12F',
          fillOpacity:.13,
          dashArray:'7 6'
        }).addTo(m);
      }else{
        state.preview=L.polyline(state.points,{
          color:'#5BC12F',
          weight:3,
          dashArray:'7 6'
        }).addTo(m);
      }
    }
    updateCounter();
  }

  function onMapClick(event){
    if(!state.drawing)return;
    state.points.push([Number(event.latlng.lat),Number(event.latlng.lng)]);
    redrawPreview();
  }

  let boundMap=null;
  function bindMap(){
    const m=map();
    if(!m||boundMap===m)return;
    if(boundMap){
      try{boundMap.off('click',onMapClick)}catch(_){}
    }
    boundMap=m;
    m.on('click',onMapClick);
  }

  function startDrawing(){
    if(!ensureUi())return;
    state.siteId=currentSite();
    if(!state.siteId){
      alert('Selecciona una unidad ganadera.');
      return;
    }
    state.drawing=true;
    state.points=[];
    clearPreview();
    updateCounter();
    document.getElementById('lgfPanel')?.classList.add('show');
    map()?.getContainer()?.classList.add('lgf-drawing');
  }

  function undoPoint(){
    if(!state.drawing||!state.points.length)return;
    state.points.pop();
    redrawPreview();
  }

  function cancelDrawing(){
    state.drawing=false;
    state.points=[];
    clearPreview();
    document.getElementById('lgfPanel')?.classList.remove('show');
    map()?.getContainer()?.classList.remove('lgf-drawing');
  }

  function clearSaved(){
    const m=map();
    for(const layer of state.savedLayers){
      try{m?.removeLayer(layer)}catch(_){}
    }
    state.savedLayers=[];
  }

  function renderSaved(){
    const m=map();if(!m)return;
    clearSaved();

    for(const g of state.geofences){
      const points=Array.isArray(g.points)?g.points:[];
      const latlngs=points.map(p=>[Number(p.lat),Number(p.lon)]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
      if(latlngs.length<3)continue;
      const layer=L.polygon(latlngs,{
        color:'#5BC12F',
        weight:3,
        fillColor:'#5BC12F',
        fillOpacity:.08
      }).addTo(m);
      layer.bindTooltip(esc(g.name||'Zona ganadera'),{sticky:true});
      state.savedLayers.push(layer);
    }

    const active=state.geofences.filter(g=>g.enabled!==false);
    const status=document.getElementById('lgfStatus');
    if(status){
      status.classList.toggle('off',!active.length);
      status.textContent=active.length
        ? active.length+' perímetro'+(active.length===1?' activo':'s activos')
        : 'Sin perímetro';
    }
  }

  async function loadGeofences(){
    if(!ensureUi()||typeof window.__tayuApi!=='function')return;
    const siteId=currentSite();
    if(!siteId)return;
    state.siteId=siteId;
    try{
      const data=await window.__tayuApi('/livestock/geofences?site_id='+encodeURIComponent(siteId));
      state.geofences=Array.isArray(data)?data:(Array.isArray(data?.geofences)?data.geofences:[]);
      renderSaved();
    }catch(error){
      if(String(error?.message||'').includes('404'))return;
      console.warn('Geocercas ganadería:',error);
    }
  }

  async function saveGeofence(){
    if(state.points.length<3){
      alert('Marca al menos 3 puntos para crear el perímetro.');
      return;
    }
    if(typeof window.__tayuApiPost!=='function'){
      alert('No está disponible la API para guardar la zona.');
      return;
    }

    const name=String(document.getElementById('lgfName')?.value||'Perímetro principal').trim()||'Perímetro principal';
    const body={
      site_id:state.siteId||currentSite(),
      name,
      geofence_type:'polygon',
      points:state.points.map(([lat,lon])=>({lat,lon})),
      alerts_enabled:true,
      severity:String(document.getElementById('lgfSeverity')?.value||'critical')
    };

    const button=document.getElementById('lgfSave');
    if(button){button.disabled=true;button.textContent='Guardando…'}

    try{
      await window.__tayuApiPost('/livestock/geofences',body);
      state.drawing=false;
      state.points=[];
      clearPreview();
      document.getElementById('lgfPanel')?.classList.remove('show');
      map()?.getContainer()?.classList.remove('lgf-drawing');
      await loadGeofences();
    }catch(error){
      console.error('Guardar geocerca:',error);
      alert('No se pudo guardar el perímetro. Falta activar el servicio de geocercas en el VPS.');
    }finally{
      if(button){button.disabled=false;button.textContent='Guardar zona'}
    }
  }

  function activate(){
    if(!ensureUi())return;
    bindMap();
    loadGeofences().catch(console.error);
  }

  document.addEventListener('click',event=>{
    if(event.target?.closest?.('.nav button[data-view="ganaderia"]'))setTimeout(activate,700);
  });

  document.addEventListener('change',event=>{
    if(event.target?.id==='lcSite')setTimeout(()=>loadGeofences().catch(console.error),150);
  });

  window.__tayuLoadLivestockGeofences=loadGeofences;
  window.__tayuStartLivestockGeofence=startDrawing;

  const timer=setInterval(()=>{
    if(document.getElementById('ganaderia')?.dataset.livestockMap==='1'){
      activate();
      clearInterval(timer);
    }
  },500);
})();