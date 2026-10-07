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
    editingId:null,
    mapControl:null
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
      #ganaderia .lgf-map-control a{display:flex!important;align-items:center;justify-content:center;width:34px!important;height:34px!important;line-height:34px!important;font-size:18px!important;font-weight:900!important;text-decoration:none!important;color:#17231a!important;background:#fff!important;cursor:pointer}
      #ganaderia .lgf-map-control a:hover{background:#f4f7f4!important;color:#2f7e18!important}
      #ganaderia .lgf-map-control a.lgf-map-zones{border-top:1px solid #ccc}
      #ganaderia .lgf-map-control a:focus{outline:2px solid #5BC12F;outline-offset:-2px}
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



  function ensureUi(){
    const view=document.getElementById('ganaderia');
    if(!view||!view.dataset.livestockMap)return false;
    injectStyles();

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
          <div><h3 style="margin:0">Zonas del mapa</h3><p class="hint" style="margin:5px 0 0">Perímetros, potreros, puntos de agua y otras áreas de la finca. Usa el botón ⬡ del mapa para crear una nueva zona.</p></div>
        </div>
        <div class="lgf-zone-list" id="lgfZoneList"><p class="hint">Cargando zonas…</p></div>
      `;
      if(shell){
        if(before) shell.insertBefore(manager,before);
        else shell.appendChild(manager);
      }
    }

    bindMap();
    fillHerdOptions();
    return true;
  }

  function zoneMeta(type){
    const key=String(type||'farm');
    const all={
      farm:{label:'Perímetro de finca',color:'#5BC12F'},
      paddock:{label:'Potrero',color:'#f59e0b'},
      water:{label:'Zona de agua',color:'#0ea5e9'},
      custom:{label:'Otra zona',color:'#a855f7'}
    };
    return all[key]||all.custom;
  }

  function fillHerdOptions(selected=''){
    const el=document.getElementById('lgfHerd');
    if(!el)return;
    const source=document.getElementById('lcHerd');
    const names=[...new Set(
      [...(source?.options||[])]
        .map(o=>String(o.value||'').trim())
        .filter(Boolean)
    )];
    el.innerHTML='<option value="">Todos los animales</option>'+
      names.map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('');
    if(selected&&names.includes(selected))el.value=selected;
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

    state.pointLayers=state.points.map(([lat,lon],index)=>{
      const marker=L.marker([lat,lon],{
        interactive:true,
        draggable:true,
        icon:L.divIcon({
          className:'',
          html:'<div class="lgf-vertex"></div>',
          iconSize:[12,12],
          iconAnchor:[6,6]
        })
      }).addTo(m);

      marker.on('dragend',event=>{
        const p=event.target.getLatLng();
        state.points[index]=[Number(p.lat),Number(p.lng)];
        redrawPreview();
      });

      return marker;
    });

    if(state.points.length>=2){
      const meta=zoneMeta(document.getElementById('lgfZoneType')?.value);
      if(state.points.length>=3){
        state.preview=L.polygon(state.points,{
          color:meta.color,
          weight:3,
          fillColor:meta.color,
          fillOpacity:.13,
          dashArray:'7 6'
        }).addTo(m);
      }else{
        state.preview=L.polyline(state.points,{
          color:meta.color,
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

  function openZoneManager(){
    const el=document.getElementById('lgfManager');
    if(!el)return;
    el.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function installMapControl(m){
    if(!m||state.mapControl)return;

    const ZoneControl=L.Control.extend({
      options:{position:'topleft'},
      onAdd(){
        const box=L.DomUtil.create('div','leaflet-bar leaflet-control lgf-map-control');

        const draw=L.DomUtil.create('a','lgf-map-draw',box);
        draw.href='#';
        draw.innerHTML='⬡';
        draw.title='Dibujar nueva zona';
        draw.setAttribute('role','button');
        draw.setAttribute('aria-label','Dibujar nueva zona');

        const manage=L.DomUtil.create('a','lgf-map-zones',box);
        manage.href='#';
        manage.innerHTML='▤';
        manage.title='Administrar zonas';
        manage.setAttribute('role','button');
        manage.setAttribute('aria-label','Administrar zonas');

        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.disableScrollPropagation(box);

        L.DomEvent.on(draw,'click',event=>{
          L.DomEvent.preventDefault(event);
          startDrawing();
        });

        L.DomEvent.on(manage,'click',event=>{
          L.DomEvent.preventDefault(event);
          openZoneManager();
        });

        return box;
      }
    });

    state.mapControl=new ZoneControl();
    state.mapControl.addTo(m);
  }

  let boundMap=null;
  function bindMap(){
    const m=map();
    if(!m||boundMap===m)return;
    if(boundMap){
      try{boundMap.off('click',onMapClick)}catch(_){}
    }
    boundMap=m;
    state.mapControl=null;
    installMapControl(m);
    m.on('click',onMapClick);
  }

  function preparePanel(g=null){
    fillHerdOptions(g?.scope_herd||'');
    const type=String(g?.zone_type||'farm');
    const title=document.getElementById('lgfPanelTitle');
    if(title)title.textContent=g?'Editar zona ganadera':'Nueva zona ganadera';

    const name=document.getElementById('lgfName');
    if(name)name.value=g?.name||('Zona '+(state.geofences.length+1));

    const typeEl=document.getElementById('lgfZoneType');
    if(typeEl)typeEl.value=type;

    const herd=document.getElementById('lgfHerd');
    if(herd)herd.value=g?.scope_herd||'';

    const alerts=document.getElementById('lgfAlerts');
    if(alerts)alerts.checked=g?g.alerts_enabled!==false:type==='farm';

    const severity=document.getElementById('lgfSeverity');
    if(severity)severity.value=String(g?.severity||'critical');

    const save=document.getElementById('lgfSave');
    if(save)save.textContent=g?'Guardar cambios':'Guardar zona';
  }

  function startDrawing(){
    if(!ensureUi())return;
    state.siteId=currentSite();
    if(!state.siteId){
      alert('Selecciona una unidad ganadera.');
      return;
    }
    state.editingId=null;
    state.drawing=true;
    state.points=[];
    clearPreview();
    preparePanel(null);
    updateCounter();
    document.getElementById('lgfPanel')?.classList.add('show');
    map()?.getContainer()?.classList.add('lgf-drawing');
  }

  function startEdit(id){
    const g=state.geofences.find(x=>String(x.id)===String(id));
    if(!g)return;
    state.editingId=String(g.id);
    state.siteId=String(g.site_id||currentSite());
    state.drawing=true;
    state.points=(Array.isArray(g.points)?g.points:[])
      .map(p=>[Number(p.lat),Number(p.lon)])
      .filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
    preparePanel(g);
    redrawPreview();
    document.getElementById('lgfPanel')?.classList.add('show');
    map()?.getContainer()?.classList.add('lgf-drawing');
    if(state.points.length>=3){
      map()?.fitBounds(L.latLngBounds(state.points).pad(.2),{maxZoom:18});
    }
  }

  function undoPoint(){
    if(!state.drawing||!state.points.length)return;
    state.points.pop();
    redrawPreview();
  }

  function cancelDrawing(){
    state.drawing=false;
    state.editingId=null;
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

  function focusZone(id){
    const layer=state.savedLayers.find(x=>String(x.__geofenceId)===String(id));
    if(layer&&map()){
      map().fitBounds(layer.getBounds().pad(.2),{maxZoom:18});
      layer.openTooltip?.();
    }
  }

  function renderZoneManager(){
    const el=document.getElementById('lgfZoneList');
    if(!el)return;

    if(!state.geofences.length){
      el.innerHTML='<p class="hint">No hay zonas guardadas. Puedes crear el perímetro de la finca, potreros o zonas de agua.</p>';
      return;
    }

    el.innerHTML=state.geofences.map(g=>{
      const meta=zoneMeta(g.zone_type);
      const scope=g.scope_herd?'Hato: '+esc(g.scope_herd):'Todos los animales';
      const alertText=g.alerts_enabled!==false?'Alerta activa':'Solo visual';
      return '<div class="lgf-zone">'+
        '<div class="lgf-zone-top">'+
          '<div>'+
            '<b><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+meta.color+';margin-right:7px"></span>'+esc(g.name||'Zona ganadera')+'</b>'+
            '<small>'+esc(meta.label)+' · '+scope+'</small>'+
          '</div>'+
          '<span class="lgf-zone-badge '+(g.alerts_enabled!==false?'':'noalert')+'">'+alertText+'</span>'+
        '</div>'+
        '<div class="lgf-zone-actions">'+
          '<button type="button" class="btn ghost" data-lgf-focus="'+esc(g.id)+'">Ver</button>'+
          '<button type="button" class="btn ghost" data-lgf-edit="'+esc(g.id)+'">Editar</button>'+
          '<button type="button" class="btn ghost" data-lgf-delete="'+esc(g.id)+'">Eliminar</button>'+
        '</div>'+
      '</div>';
    }).join('');

    el.querySelectorAll('[data-lgf-focus]').forEach(b=>b.addEventListener('click',()=>focusZone(b.dataset.lgfFocus)));
    el.querySelectorAll('[data-lgf-edit]').forEach(b=>b.addEventListener('click',()=>startEdit(b.dataset.lgfEdit)));
    el.querySelectorAll('[data-lgf-delete]').forEach(b=>b.addEventListener('click',()=>deleteGeofence(b.dataset.lgfDelete)));
  }

  function renderSaved(){
    const m=map();if(!m)return;
    clearSaved();

    for(const g of state.geofences){
      if(g.enabled===false)continue;
      const points=Array.isArray(g.points)?g.points:[];
      const latlngs=points.map(p=>[Number(p.lat),Number(p.lon)]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
      if(latlngs.length<3)continue;

      const meta=zoneMeta(g.zone_type);
      const layer=L.polygon(latlngs,{
        color:meta.color,
        weight:3,
        fillColor:meta.color,
        fillOpacity:g.zone_type==='water'?.16:.08
      }).addTo(m);

      layer.__geofenceId=g.id;
      layer.bindTooltip(
        '<b>'+esc(g.name||'Zona ganadera')+'</b><br><small>'+esc(meta.label)+'</small>',
        {sticky:true}
      );

      state.savedLayers.push(layer);
    }

    renderZoneManager();
  }

  async function loadGeofences(){
    if(!ensureUi()||typeof window.__tayuApi!=='function')return;
    const siteId=currentSite();
    if(!siteId)return;
    state.siteId=siteId;
    try{
      const data=await window.__tayuApi('/livestock/geofences?site_id='+encodeURIComponent(siteId));
      state.geofences=Array.isArray(data)?data:(Array.isArray(data?.geofences)?data.geofences:[]);
      fillHerdOptions();
      renderSaved();
    }catch(error){
      if(String(error?.message||'').includes('404'))return;
      console.warn('Geocercas ganadería:',error);
    }
  }

  async function saveGeofence(){
    if(state.points.length<3){
      alert('Marca al menos 3 puntos para crear la zona.');
      return;
    }
    if(typeof window.__tayuApiPost!=='function'){
      alert('No está disponible la API para guardar la zona.');
      return;
    }

    const name=String(document.getElementById('lgfName')?.value||'Zona ganadera').trim()||'Zona ganadera';
    const body={
      id:state.editingId||undefined,
      site_id:state.siteId||currentSite(),
      name,
      geofence_type:'polygon',
      zone_type:String(document.getElementById('lgfZoneType')?.value||'farm'),
      scope_herd:String(document.getElementById('lgfHerd')?.value||'').trim()||null,
      points:state.points.map(([lat,lon])=>({lat,lon})),
      alerts_enabled:Boolean(document.getElementById('lgfAlerts')?.checked),
      severity:String(document.getElementById('lgfSeverity')?.value||'critical')
    };

    const button=document.getElementById('lgfSave');
    if(button){button.disabled=true;button.textContent='Guardando…'}

    try{
      const endpoint=state.editingId?'/livestock/geofences/update':'/livestock/geofences';
      await window.__tayuApiPost(endpoint,body);
      state.drawing=false;
      state.editingId=null;
      state.points=[];
      clearPreview();
      document.getElementById('lgfPanel')?.classList.remove('show');
      map()?.getContainer()?.classList.remove('lgf-drawing');
      await loadGeofences();
      window.tayuLoadAlarmEvents?.();
    }catch(error){
      console.error('Guardar geocerca:',error);
      alert('No se pudo guardar la zona: '+(error?.message||error));
    }finally{
      if(button){button.disabled=false;button.textContent='Guardar zona'}
    }
  }

  async function deleteGeofence(id){
    const g=state.geofences.find(x=>String(x.id)===String(id));
    if(!g||typeof window.__tayuApiPost!=='function')return;
    if(!confirm('¿Eliminar la zona "'+(g.name||'Zona ganadera')+'"?'))return;

    try{
      await window.__tayuApiPost('/livestock/geofences/delete',{
        id:g.id,
        site_id:g.site_id||currentSite()
      });

      if(String(state.editingId)===String(g.id))cancelDrawing();
      await loadGeofences();
      await window.tayuLoadAlarmEvents?.();
    }catch(error){
      console.error('Eliminar geocerca:',error);
      alert('No se pudo eliminar la zona: '+(error?.message||error));
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
    if(event.target?.id==='lgfZoneType'&&!state.editingId){
      const alerts=document.getElementById('lgfAlerts');
      if(alerts)alerts.checked=String(event.target.value)==='farm';
      redrawPreview();
    }
  });

  window.addEventListener('tayu:livestock-tracking-refreshed',event=>{
    const siteId=String(event.detail?.siteId||'');
    if(siteId&&siteId===currentSite()&&(state.siteId!==siteId||!state.geofences.length)){
      loadGeofences().catch(console.error);
    }
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