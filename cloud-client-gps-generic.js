(() => {
  'use strict';

  const PROFILE_KEY = 'gps_generic';
  const ECUADOR_CENTER = [-1.8312, -78.1834];
  const DEFAULT_GPS_CONFIG = {
    report_interval_minutes: 5,
    asset: {
      owner_name: '', asset_type: 'vehicle', brand: '', model: '', year: '', plate: '', color: '', vin: '',
      driver_name: '', driver_phone: '', photo_url: '', notes: ''
    },
    alerts: {
      geofence_entry: true, geofence_exit: true, no_report_minutes: 15, battery_low_pct: 20, max_speed_kmh: null
    },
    geofences: []
  };

  const state = {
    devices: [], telemetry: [], selectedKey: '', map: null, marker: null, routeLayer: null,
    geofenceLayers: [], draftPoints: [], draftLayer: null, drawing: false, history: [], lastHistoryRange: null,
    initialized: false
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const n = value => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const atPath = (obj, path) => String(path || '').split('.').reduce((value, key) => value == null ? undefined : value[key], obj);
  const readAny = (payload, paths) => {
    for (const path of paths) {
      const value = atPath(payload, path);
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
  };

  function coordinates(payload = {}) {
    return {
      lat: n(readAny(payload, ['lat','latitude','location.lat','location.latitude','gps.lat','gps.latitude'])),
      lon: n(readAny(payload, ['lon','lng','longitude','location.lon','location.lng','location.longitude','gps.lon','gps.lng','gps.longitude']))
    };
  }

  function gpsValue(payload, key) {
    const paths = {
      speed: ['speed_kmh','speed','velocity','gps.speed'], heading: ['heading','course','bearing','gps.heading'],
      altitude: ['altitude','alt','gps.altitude'], satellites: ['satellites','sats','gps.satellites','gps.sats'],
      hdop: ['hdop','gps.hdop'], battery: ['battery_pct','battery','bateria','power.battery_pct'],
      firmware: ['fw','firmware','firmware_version','device.firmware'], imei: ['imei','gsm.imei','modem.imei'],
      iccid: ['iccid','sim.iccid','gsm.iccid'], operator: ['operator','carrier','gsm.operator','network.operator'],
      gsmSignal: ['gsm_rssi','rssi','gsm.rssi','gsm.csq','csq'], externalPower: ['external_power','power.external','vin_present','usb_present']
    };
    return readAny(payload, paths[key] || []);
  }

  function isGenericGpsDevice(device = {}) {
    const caps = device.capabilities || {};
    const values = [device.profile_key, device.device_type, device.profile_name, caps.category, caps.tracking?.profile]
      .map(value => String(value || '').trim().toLowerCase());
    return values.includes(PROFILE_KEY) || values.includes('gps genérico') || values.includes('gps generico') || values.includes('gps_tracker');
  }

  function selectedDevice() { return state.devices.find(device => device.device_key === state.selectedKey) || null; }
  function latestRow(deviceKey) { return state.telemetry.find(row => row.device_key === deviceKey) || null; }
  function canEdit() { return String(window.__tayuClientAccess?.role || '').toLowerCase() !== 'viewer'; }
  function clone(value) { return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : {}; }

  function normalizedGpsConfig(device) {
    const raw = clone(device?.configuration?.gps || {});
    return {
      ...clone(DEFAULT_GPS_CONFIG), ...raw,
      asset: { ...clone(DEFAULT_GPS_CONFIG.asset), ...(raw.asset || {}) },
      alerts: { ...clone(DEFAULT_GPS_CONFIG.alerts), ...(raw.alerts || {}) },
      geofences: Array.isArray(raw.geofences) ? raw.geofences : []
    };
  }

  function injectStyles() {
    if (document.getElementById('tayuGpsGenericStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuGpsGenericStyles';
    style.textContent = `
      #gps-generic-view .gps-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(300px,.8fr);gap:18px}
      #gps-generic-view .gps-map{height:500px;border-radius:18px;overflow:hidden;background:var(--panel2)}
      #gps-generic-view .gps-kpis{grid-template-columns:repeat(6,minmax(0,1fr));margin:18px 0}
      #gps-generic-view .gps-kpi{background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:14px}
      #gps-generic-view .gps-kpi span{display:block;color:var(--muted);font-size:11px;font-weight:850;margin-bottom:6px}
      #gps-generic-view .gps-kpi b{font-size:19px}
      #gps-generic-view .gps-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:end}
      #gps-generic-view .gps-tools>div{min-width:180px;flex:1}
      #gps-generic-view .gps-section{margin-top:18px}
      #gps-generic-view .gps-info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      #gps-generic-view .gps-info{padding:11px;border:1px solid var(--border);border-radius:13px;background:var(--panel2)}
      #gps-generic-view .gps-info span{display:block;color:var(--muted);font-size:11px;font-weight:850}
      #gps-generic-view .gps-info b{display:block;margin-top:5px;overflow-wrap:anywhere}
      #gps-generic-view .gps-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      #gps-generic-view .gps-form-grid .full{grid-column:1/-1}
      #gps-generic-view .gps-geofence-list{display:grid;gap:8px;margin-top:12px}
      #gps-generic-view .gps-geofence-item{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:11px;border:1px solid var(--border);border-radius:13px;background:var(--panel2)}
      #gps-generic-view .gps-geofence-item input{width:auto}
      #gps-generic-view .gps-draw-note{display:none;padding:11px 13px;border-radius:13px;background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.22);color:var(--blue);font-size:12px;font-weight:800;margin:10px 0}
      #gps-generic-view .gps-draw-note.show{display:block}
      #gps-generic-view .gps-events{display:grid;gap:7px}
      #gps-generic-view .gps-event{padding:10px 12px;border-left:3px solid var(--brand);background:var(--panel2);border-radius:10px;font-size:12px}
      #gps-generic-view .gps-empty{padding:28px;text-align:center;color:var(--muted)}
      #gps-generic-view .gps-status-line{min-height:18px;color:var(--muted);font-size:12px;margin-top:8px}
      #gps-generic-view .gps-current{padding:13px;border-radius:15px;border:1px solid var(--border);background:var(--panel2);margin-bottom:12px}
      #gps-generic-view .gps-current b{font-size:15px}#gps-generic-view .gps-current small{display:block;color:var(--muted);margin-top:5px}
      #gps-generic-view .gps-readonly{opacity:.68}
      @media(max-width:1180px){#gps-generic-view .gps-kpis{grid-template-columns:repeat(3,1fr)}#gps-generic-view .gps-layout{grid-template-columns:1fr}}
      @media(max-width:760px){#gps-generic-view .gps-map{height:390px}#gps-generic-view .gps-kpis{grid-template-columns:repeat(2,1fr)}#gps-generic-view .gps-form-grid{grid-template-columns:1fr}#gps-generic-view .gps-form-grid .full{grid-column:auto}}
      @media(max-width:430px){#gps-generic-view .gps-kpis{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function injectUI() {
    if (state.initialized) return;
    injectStyles();
    const nav = document.querySelector('.nav');
    if (nav && !document.getElementById('gpsGenericNavButton')) {
      const button = document.createElement('button');
      button.id = 'gpsGenericNavButton'; button.type = 'button'; button.style.display = 'none';
      button.innerHTML = '<span class="nav-icon">📍</span><span class="nav-label">GPS Genérico</span>';
      button.addEventListener('click', () => openGpsView());
      const deviceButton = nav.querySelector('[data-view="dispositivos"]');
      if (deviceButton) deviceButton.insertAdjacentElement('afterend', button); else nav.appendChild(button);
    }

    const main = document.querySelector('main.main');
    if (main && !document.getElementById('gps-generic-view')) {
      main.insertAdjacentHTML('beforeend', `
        <section id="gps-generic-view" class="view">
          <div class="card"><div class="module-header"><div><h3 style="margin:0">📍 GPS Genérico</h3><p class="hint">Seguimiento de vehículos y activos con ubicación actual, historial y geocercas.</p></div><div class="actions"><button class="btn ghost" type="button" id="gpsRefreshButton">↻ Actualizar</button></div></div><div class="gps-tools" style="margin-top:14px"><div><label>Dispositivo GPS</label><select id="gpsGenericDeviceSelect"></select></div></div><div id="gpsGenericStatus" class="gps-status-line"></div></div>
          <div class="grid gps-kpis"><div class="gps-kpi"><span>Estado</span><b id="gpsKpiStatus">—</b></div><div class="gps-kpi"><span>Último reporte</span><b id="gpsKpiLast">—</b></div><div class="gps-kpi"><span>Velocidad</span><b id="gpsKpiSpeed">—</b></div><div class="gps-kpi"><span>Batería</span><b id="gpsKpiBattery">—</b></div><div class="gps-kpi"><span>Satélites</span><b id="gpsKpiSatellites">—</b></div><div class="gps-kpi"><span>HDOP</span><b id="gpsKpiHdop">—</b></div></div>
          <div class="gps-layout"><div class="card map-card"><div id="gpsGenericMap" class="gps-map"></div></div><div class="card"><h3 style="margin-top:0">Ubicación actual</h3><div id="gpsCurrentLocation" class="gps-current"><b>Esperando GPS…</b><small>No se ha recibido una posición válida.</small></div><h3>Datos GPS / red</h3><div id="gpsTechnicalInfo" class="gps-info-grid"></div></div></div>
          <div class="card gps-section"><div class="module-header"><div><h3 style="margin:0">Historial de recorrido</h3><p class="hint">Consulta puntos históricos y dibuja la ruta sobre el mapa.</p></div></div><div class="gps-tools" style="margin-top:12px"><div><label>Desde</label><input id="gpsHistoryFrom" type="datetime-local"></div><div><label>Hasta</label><input id="gpsHistoryTo" type="datetime-local"></div><button class="btn" id="gpsHistoryButton" type="button">Consultar recorrido</button><button class="btn ghost" id="gpsCurrentOnlyButton" type="button">Ver ubicación actual</button></div><div id="gpsHistoryStatus" class="gps-status-line"></div></div>
          <div class="grid two gps-section"><div class="card"><div class="module-header"><div><h3 style="margin:0">Geocercas</h3><p class="hint">Dibuja polígonos directamente sobre el mapa.</p></div><div class="actions"><button class="btn ghost gps-edit-control" id="gpsDrawButton" type="button">✦ Dibujar</button><button class="btn gps-edit-control" id="gpsSaveFenceButton" type="button" disabled>Guardar geocerca</button><button class="btn ghost gps-edit-control" id="gpsCancelFenceButton" type="button" disabled>Cancelar</button></div></div><div id="gpsDrawNote" class="gps-draw-note">Haz clic sobre el mapa para agregar vértices. Necesitas mínimo 3 puntos.</div><div id="gpsGeofenceStatus" class="gps-status-line"></div><div id="gpsGeofenceList" class="gps-geofence-list"></div></div><div class="card"><h3 style="margin-top:0">Eventos de geocerca</h3><p class="hint">Se calculan usando el recorrido consultado y las geocercas configuradas.</p><div id="gpsGeofenceEvents" class="gps-events"><div class="gps-empty">Consulta un recorrido para calcular entradas y salidas.</div></div></div></div>
          <div class="card gps-section"><div class="module-header"><div><h3 style="margin:0">Configuración del tracker</h3><p class="hint">La configuración se guarda en TAYULABS Cloud y se envía al dispositivo. El firmware debe implementar estos parámetros.</p></div><button class="btn gps-edit-control" id="gpsSaveConfigButton" type="button">Guardar configuración</button></div><div class="gps-form-grid" style="margin-top:14px"><div><label>Frecuencia de actualización</label><select id="gpsReportInterval"><option value="1">Cada 1 minuto</option><option value="5">Cada 5 minutos</option><option value="10">Cada 10 minutos</option><option value="30">Cada 30 minutos</option></select></div><div><label>Sin reporte (min)</label><input id="gpsNoReport" type="number" min="1" max="1440"></div><div><label>Batería baja (%)</label><input id="gpsBatteryLow" type="number" min="0" max="100"></div><div><label>Velocidad máxima (km/h)</label><input id="gpsMaxSpeed" type="number" min="0" step="1" placeholder="Sin límite"></div><div><label>Alerta entrada a geocerca</label><select id="gpsAlertEntry"><option value="true">Activada</option><option value="false">Desactivada</option></select></div><div><label>Alerta salida de geocerca</label><select id="gpsAlertExit"><option value="true">Activada</option><option value="false">Desactivada</option></select></div></div><h3 style="margin:20px 0 10px">Información del vehículo / activo</h3><div class="gps-form-grid"><div><label>Propietario</label><input id="gpsOwnerName"></div><div><label>Tipo de activo</label><select id="gpsAssetType"><option value="vehicle">Vehículo</option><option value="motorcycle">Moto</option><option value="boat">Bote</option><option value="person">Persona</option><option value="equipment">Equipo / activo</option><option value="prototype">Prototipo</option></select></div><div><label>Marca</label><input id="gpsBrand"></div><div><label>Modelo</label><input id="gpsModel"></div><div><label>Año</label><input id="gpsYear" type="number" min="1900" max="2100"></div><div><label>Placa</label><input id="gpsPlate"></div><div><label>Color</label><input id="gpsColor"></div><div><label>Chasis / VIN</label><input id="gpsVin"></div><div><label>Conductor asignado</label><input id="gpsDriverName"></div><div><label>Teléfono conductor</label><input id="gpsDriverPhone"></div><div class="full"><label>Foto del activo (URL)</label><input id="gpsPhotoUrl" type="url" placeholder="https://..."></div><div class="full"><label>Observaciones</label><textarea id="gpsAssetNotes" rows="3"></textarea></div></div><div id="gpsConfigStatus" class="gps-status-line"></div></div>
        </section>`);
    }

    document.getElementById('gpsGenericDeviceSelect')?.addEventListener('change', event => { state.selectedKey = event.target.value || ''; state.history = []; state.lastHistoryRange = null; loadSelectedDevice(); });
    document.getElementById('gpsRefreshButton')?.addEventListener('click', async () => { setStatus('gpsGenericStatus','Actualizando…'); try { await window.refreshRealData?.(); await syncFromPlatform(true); setStatus('gpsGenericStatus','Datos actualizados.'); } catch(error) { setStatus('gpsGenericStatus',`No se pudo actualizar: ${error.message}`); } });
    document.getElementById('gpsHistoryButton')?.addEventListener('click', queryHistory);
    document.getElementById('gpsCurrentOnlyButton')?.addEventListener('click', () => { state.history = []; state.lastHistoryRange = null; clearRoute(); updateMap(); renderGeofenceEvents(); setStatus('gpsHistoryStatus','Mostrando ubicación actual.'); });
    document.getElementById('gpsDrawButton')?.addEventListener('click', startDrawing);
    document.getElementById('gpsSaveFenceButton')?.addEventListener('click', saveDraftFence);
    document.getElementById('gpsCancelFenceButton')?.addEventListener('click', cancelDrawing);
    document.getElementById('gpsSaveConfigButton')?.addEventListener('click', saveConfiguration);
    if (!canEdit()) setReadOnly();
    state.initialized = true; setDefaultHistoryRange();
  }

  function setStatus(id,text){const el=document.getElementById(id);if(el)el.textContent=text||'';}
  function setDefaultHistoryRange(){const to=new Date(),from=new Date(to.getTime()-24*60*60*1000);const localValue=date=>{const d=new Date(date.getTime()-date.getTimezoneOffset()*60000);return d.toISOString().slice(0,16)};const f=document.getElementById('gpsHistoryFrom'),t=document.getElementById('gpsHistoryTo');if(f&&!f.value)f.value=localValue(from);if(t&&!t.value)t.value=localValue(to);}
  function setReadOnly(){document.querySelectorAll('#gps-generic-view .gps-edit-control').forEach(el=>{el.disabled=true;el.title='Tu rol Viewer es de solo lectura.'});document.querySelectorAll('#gps-generic-view .gps-form-grid input, #gps-generic-view .gps-form-grid select, #gps-generic-view .gps-form-grid textarea').forEach(el=>{el.disabled=true});document.getElementById('gps-generic-view')?.classList.add('gps-readonly');}

  function openGpsView(){injectUI();document.querySelectorAll('.view').forEach(view=>view.classList.remove('active'));document.querySelectorAll('.nav button').forEach(button=>button.classList.remove('active'));document.getElementById('gps-generic-view')?.classList.add('active');document.getElementById('gpsGenericNavButton')?.classList.add('active');const title=document.getElementById('pageTitle');if(title)title.textContent='GPS Genérico';document.getElementById('sidebar')?.classList.remove('open');ensureMap();setTimeout(()=>{state.map?.invalidateSize();updateMap()},120);loadSelectedDevice();}

  function ensureMap(){const host=document.getElementById('gpsGenericMap');if(!host||!window.L||state.map)return;state.map=L.map(host,{zoomControl:true}).setView(ECUADOR_CENTER,6);if(typeof window.addSatelliteLayer==='function')window.addSatelliteLayer(state.map);else L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imágenes © Esri'}).addTo(state.map);state.map.on('click',event=>{if(!state.drawing||!canEdit())return;state.draftPoints.push([event.latlng.lat,event.latlng.lng]);drawDraft()});}
  function currentPosition(){const row=latestRow(state.selectedKey),pos=coordinates(row?.payload||{});return{...pos,row};}
  function updateMap(){ensureMap();if(!state.map)return;if(state.marker){state.map.removeLayer(state.marker);state.marker=null}const{lat,lon,row}=currentPosition();if(lat!==null&&lon!==null){const device=selectedDevice();state.marker=L.circleMarker([lat,lon],{radius:9,color:'#55c62b',fillColor:'#55c62b',fillOpacity:.92,weight:3}).addTo(state.map);state.marker.bindPopup(`<b>${esc(device?.name||state.selectedKey)}</b><br>${lat.toFixed(6)}, ${lon.toFixed(6)}<br>${row?.time?esc(new Date(row.time).toLocaleString('es-EC')):''}`);if(!state.history.length)state.map.setView([lat,lon],16)}else if(!state.history.length)state.map.setView(ECUADOR_CENTER,6);renderGeofences();}
  function clearRoute(){if(state.routeLayer&&state.map)state.map.removeLayer(state.routeLayer);state.routeLayer=null;}
  function drawHistoryRoute(){ensureMap();clearRoute();if(!state.map||!state.history.length)return;const points=state.history.map(row=>{const pos=coordinates(row.payload||{});return pos.lat!==null&&pos.lon!==null?[pos.lat,pos.lon]:null}).filter(Boolean);if(!points.length)return;state.routeLayer=L.polyline(points,{color:'#2563eb',weight:4,opacity:.85}).addTo(state.map);const layers=[state.routeLayer,...state.geofenceLayers];if(state.marker)layers.push(state.marker);const bounds=L.featureGroup(layers).getBounds();if(bounds.isValid())state.map.fitBounds(bounds.pad(.12));}

  function renderCurrentData(){const device=selectedDevice(),row=latestRow(state.selectedKey),payload=row?.payload||{},pos=coordinates(payload);document.getElementById('gpsKpiStatus').textContent=String(device?.status||'offline').toLowerCase()==='online'?'ONLINE':'OFFLINE';document.getElementById('gpsKpiLast').textContent=row?.time?new Date(row.time).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'}):'—';const speed=n(gpsValue(payload,'speed')),battery=n(gpsValue(payload,'battery')),sats=gpsValue(payload,'satellites'),hdop=gpsValue(payload,'hdop');document.getElementById('gpsKpiSpeed').textContent=speed!==null?`${speed.toFixed(1)} km/h`:'—';document.getElementById('gpsKpiBattery').textContent=battery!==null?`${Math.round(battery)}%`:'—';document.getElementById('gpsKpiSatellites').textContent=sats??'—';document.getElementById('gpsKpiHdop').textContent=hdop??'—';const current=document.getElementById('gpsCurrentLocation');if(current)current.innerHTML=pos.lat!==null&&pos.lon!==null?`<b>${pos.lat.toFixed(6)}, ${pos.lon.toFixed(6)}</b><small>${row?.time?`Último punto: ${esc(new Date(row.time).toLocaleString('es-EC'))}`:'Punto recibido'}</small>`:'<b>Esperando GPS…</b><small>El dispositivo todavía no ha enviado latitud y longitud válidas.</small>';const fields=[['Altitud',gpsValue(payload,'altitude'),'m'],['Rumbo',gpsValue(payload,'heading'),'°'],['Firmware',gpsValue(payload,'firmware'),''],['IMEI',gpsValue(payload,'imei'),''],['ICCID / SIM',gpsValue(payload,'iccid'),''],['Operador GSM',gpsValue(payload,'operator'),''],['Señal GSM',gpsValue(payload,'gsmSignal'),''],['Alimentación externa',gpsValue(payload,'externalPower'),'']];const info=document.getElementById('gpsTechnicalInfo');if(info)info.innerHTML=fields.map(([label,value,unit])=>`<div class="gps-info"><span>${esc(label)}</span><b>${value===null||value===undefined||value===''?'—':`${esc(value)}${unit?` ${unit}`:''}`}</b></div>`).join('');updateGeofenceCurrentStatus();}

  function fillConfigForm(){const device=selectedDevice();if(!device)return;const cfg=normalizedGpsConfig(device),asset=cfg.asset,alerts=cfg.alerts;const set=(id,value)=>{const el=document.getElementById(id);if(el)el.value=value??''};set('gpsReportInterval',String(cfg.report_interval_minutes||5));set('gpsNoReport',alerts.no_report_minutes??15);set('gpsBatteryLow',alerts.battery_low_pct??20);set('gpsMaxSpeed',alerts.max_speed_kmh??'');set('gpsAlertEntry',String(alerts.geofence_entry!==false));set('gpsAlertExit',String(alerts.geofence_exit!==false));set('gpsOwnerName',asset.owner_name);set('gpsAssetType',asset.asset_type||'vehicle');set('gpsBrand',asset.brand);set('gpsModel',asset.model);set('gpsYear',asset.year);set('gpsPlate',asset.plate);set('gpsColor',asset.color);set('gpsVin',asset.vin);set('gpsDriverName',asset.driver_name);set('gpsDriverPhone',asset.driver_phone);set('gpsPhotoUrl',asset.photo_url);set('gpsAssetNotes',asset.notes);renderGeofenceList();renderGeofences();}
  function loadSelectedDevice(){const device=selectedDevice();if(!device){setStatus('gpsGenericStatus','No hay dispositivos GPS GENÉRICO disponibles.');return}setStatus('gpsGenericStatus',`${device.name} · ${device.device_key}`);fillConfigForm();renderCurrentData();updateMap();}

  async function syncFromPlatform(forceFetch=false){injectUI();let devices=Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[],telemetry=Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[];if((forceFetch||!devices.length)&&typeof window.__tayuApi==='function'){try{devices=await window.__tayuApi('/devices');window.__tayuRealDevices=Array.isArray(devices)?devices:[]}catch{}}if((forceFetch||!telemetry.length)&&typeof window.__tayuApi==='function'){try{telemetry=await window.__tayuApi('/telemetry/latest');window.__tayuLastTelemetry=Array.isArray(telemetry)?telemetry:[]}catch{}}state.devices=(Array.isArray(devices)?devices:[]).filter(isGenericGpsDevice);state.telemetry=Array.isArray(telemetry)?telemetry:[];const navButton=document.getElementById('gpsGenericNavButton');if(navButton)navButton.style.display=state.devices.length?'':'none';const select=document.getElementById('gpsGenericDeviceSelect');if(select){const previous=state.selectedKey||select.value;select.innerHTML=state.devices.length?state.devices.map(device=>`<option value="${esc(device.device_key)}">${esc(device.name)} · ${esc(device.device_key)}</option>`).join(''):'<option value="">No hay GPS GENÉRICO</option>';if(previous&&state.devices.some(device=>device.device_key===previous))select.value=previous;state.selectedKey=select.value||''}if(state.selectedKey){renderCurrentData();if(document.getElementById('gps-generic-view')?.classList.contains('active'))updateMap();}}

  async function queryHistory(){const device=selectedDevice();if(!device||typeof window.__tayuApi!=='function')return;const fromValue=document.getElementById('gpsHistoryFrom')?.value,toValue=document.getElementById('gpsHistoryTo')?.value;if(!fromValue||!toValue){setStatus('gpsHistoryStatus','Selecciona fecha y hora de inicio y fin.');return}const from=new Date(fromValue),to=new Date(toValue);if(Number.isNaN(from.getTime())||Number.isNaN(to.getTime())||from>=to){setStatus('gpsHistoryStatus','El rango de fechas no es válido.');return}setStatus('gpsHistoryStatus','Consultando recorrido…');try{const rows=await window.__tayuApi(`/telemetry/history?device_key=${encodeURIComponent(device.device_key)}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);state.history=(Array.isArray(rows)?rows:[]).filter(row=>{const pos=coordinates(row.payload||{});return pos.lat!==null&&pos.lon!==null}).sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime());state.lastHistoryRange={from,to};drawHistoryRoute();renderGeofenceEvents();setStatus('gpsHistoryStatus',state.history.length?`${state.history.length.toLocaleString('es-EC')} puntos GPS mostrados en el mapa.`:'No hay puntos GPS en ese rango.')}catch(error){setStatus('gpsHistoryStatus',`No se pudo consultar el recorrido: ${error.message}`)}}

  function startDrawing(){if(!canEdit())return;ensureMap();state.drawing=true;state.draftPoints=[];document.getElementById('gpsDrawNote')?.classList.add('show');document.getElementById('gpsSaveFenceButton').disabled=false;document.getElementById('gpsCancelFenceButton').disabled=false;document.getElementById('gpsDrawButton').disabled=true;setStatus('gpsGeofenceStatus','Modo dibujo activo.');drawDraft();}
  function drawDraft(){if(!state.map)return;if(state.draftLayer)state.map.removeLayer(state.draftLayer);state.draftLayer=null;if(!state.draftPoints.length)return;state.draftLayer=state.draftPoints.length>=3?L.polygon(state.draftPoints,{color:'#2563eb',weight:3,fillOpacity:.12}).addTo(state.map):L.polyline(state.draftPoints,{color:'#2563eb',weight:3,dashArray:'6 6'}).addTo(state.map);}
  function cancelDrawing(){state.drawing=false;state.draftPoints=[];if(state.draftLayer&&state.map)state.map.removeLayer(state.draftLayer);state.draftLayer=null;document.getElementById('gpsDrawNote')?.classList.remove('show');if(canEdit()){document.getElementById('gpsSaveFenceButton').disabled=true;document.getElementById('gpsCancelFenceButton').disabled=true;document.getElementById('gpsDrawButton').disabled=false}setStatus('gpsGeofenceStatus','');}
  async function saveDraftFence(){if(!canEdit()||state.draftPoints.length<3){setStatus('gpsGeofenceStatus','La geocerca necesita mínimo 3 puntos.');return}const name=window.prompt('Nombre de la geocerca',`Geocerca ${normalizedGpsConfig(selectedDevice()).geofences.length+1}`);if(!name)return;const cfg=normalizedGpsConfig(selectedDevice());cfg.geofences.push({id:`gf-${Date.now()}`,name:name.trim(),enabled:true,points:state.draftPoints.map(([lat,lon])=>[Number(lat),Number(lon)])});try{await persistGpsConfig(cfg);cancelDrawing();setStatus('gpsGeofenceStatus',`Geocerca "${name.trim()}" guardada.`)}catch(error){setStatus('gpsGeofenceStatus',`No se pudo guardar: ${error.message}`)}}

  function renderGeofences(){if(!state.map)return;state.geofenceLayers.forEach(layer=>state.map.removeLayer(layer));state.geofenceLayers=[];const cfg=normalizedGpsConfig(selectedDevice());cfg.geofences.filter(fence=>fence.enabled!==false&&Array.isArray(fence.points)&&fence.points.length>=3).forEach(fence=>{const layer=L.polygon(fence.points,{color:'#f59e0b',weight:2,fillOpacity:.10}).addTo(state.map);layer.bindPopup(`<b>${esc(fence.name)}</b><br>Geocerca`);state.geofenceLayers.push(layer)});}
  function renderGeofenceList(){const host=document.getElementById('gpsGeofenceList');if(!host)return;const cfg=normalizedGpsConfig(selectedDevice());if(!cfg.geofences.length){host.innerHTML='<div class="gps-empty">Aún no hay geocercas.</div>';return}host.innerHTML=cfg.geofences.map(fence=>`<div class="gps-geofence-item"><div><b>${esc(fence.name)}</b><small class="hint">${Array.isArray(fence.points)?fence.points.length:0} vértices</small></div><div class="actions"><label style="display:flex;align-items:center;gap:6px;margin:0"><input type="checkbox" data-fence-toggle="${esc(fence.id)}" ${fence.enabled!==false?'checked':''} ${canEdit()?'':'disabled'}> Activa</label><button class="btn ghost small gps-edit-control" type="button" data-fence-delete="${esc(fence.id)}" ${canEdit()?'':'disabled'}>Eliminar</button></div></div>`).join('');host.querySelectorAll('[data-fence-toggle]').forEach(input=>input.addEventListener('change',()=>toggleFence(input.dataset.fenceToggle,input.checked)));host.querySelectorAll('[data-fence-delete]').forEach(button=>button.addEventListener('click',()=>deleteFence(button.dataset.fenceDelete)));}
  async function toggleFence(id,enabled){if(!canEdit())return;const cfg=normalizedGpsConfig(selectedDevice()),fence=cfg.geofences.find(item=>item.id===id);if(!fence)return;fence.enabled=Boolean(enabled);try{await persistGpsConfig(cfg);setStatus('gpsGeofenceStatus','Geocerca actualizada.')}catch(error){setStatus('gpsGeofenceStatus',error.message)}}
  async function deleteFence(id){if(!canEdit())return;const cfg=normalizedGpsConfig(selectedDevice()),fence=cfg.geofences.find(item=>item.id===id);if(!fence||!window.confirm(`¿Eliminar la geocerca "${fence.name}"?`))return;cfg.geofences=cfg.geofences.filter(item=>item.id!==id);try{await persistGpsConfig(cfg);setStatus('gpsGeofenceStatus','Geocerca eliminada.')}catch(error){setStatus('gpsGeofenceStatus',error.message)}}

  function pointInPolygon(point,polygon){const[x,y]=point;let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const[xi,yi]=polygon[i],[xj,yj]=polygon[j];const intersect=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||Number.EPSILON)+xi);if(intersect)inside=!inside}return inside;}
  function updateGeofenceCurrentStatus(){const cfg=normalizedGpsConfig(selectedDevice()),active=cfg.geofences.filter(fence=>fence.enabled!==false&&fence.points?.length>=3),{lat,lon}=currentPosition();if(!active.length){setStatus('gpsGeofenceStatus','Sin geocercas activas.');return}if(lat===null||lon===null){setStatus('gpsGeofenceStatus','Esperando ubicación para evaluar geocercas.');return}const inside=active.filter(fence=>pointInPolygon([lat,lon],fence.points));setStatus('gpsGeofenceStatus',inside.length?`Ubicación actual dentro de: ${inside.map(fence=>fence.name).join(', ')}`:'Ubicación actual fuera de todas las geocercas activas.');}
  function renderGeofenceEvents(){const host=document.getElementById('gpsGeofenceEvents');if(!host)return;const cfg=normalizedGpsConfig(selectedDevice()),fences=cfg.geofences.filter(fence=>fence.enabled!==false&&fence.points?.length>=3);if(!state.history.length||!fences.length){host.innerHTML='<div class="gps-empty">Consulta un recorrido y configura una geocerca para calcular eventos.</div>';return}const events=[];fences.forEach(fence=>{let previous=null;state.history.forEach(row=>{const pos=coordinates(row.payload||{});if(pos.lat===null||pos.lon===null)return;const inside=pointInPolygon([pos.lat,pos.lon],fence.points);if(previous!==null&&inside!==previous)events.push({time:new Date(row.time),type:inside?'Entrada':'Salida',fence:fence.name});previous=inside})});events.sort((a,b)=>b.time-a.time);host.innerHTML=events.length?events.slice(0,30).map(event=>`<div class="gps-event"><b>${esc(event.type)} · ${esc(event.fence)}</b><br><span class="muted">${esc(event.time.toLocaleString('es-EC'))}</span></div>`).join(''):'<div class="gps-empty">No se detectaron cruces de geocerca en este recorrido.</div>';}

  function collectConfiguration(){const get=id=>document.getElementById(id)?.value??'',maxSpeed=get('gpsMaxSpeed'),current=normalizedGpsConfig(selectedDevice());return{...current,report_interval_minutes:Number(get('gpsReportInterval')||5),alerts:{...current.alerts,no_report_minutes:Math.max(1,Number(get('gpsNoReport')||15)),battery_low_pct:Math.max(0,Math.min(100,Number(get('gpsBatteryLow')||20))),max_speed_kmh:maxSpeed===''?null:Math.max(0,Number(maxSpeed)),geofence_entry:get('gpsAlertEntry')==='true',geofence_exit:get('gpsAlertExit')==='true'},asset:{owner_name:get('gpsOwnerName').trim(),asset_type:get('gpsAssetType')||'vehicle',brand:get('gpsBrand').trim(),model:get('gpsModel').trim(),year:get('gpsYear').trim(),plate:get('gpsPlate').trim(),color:get('gpsColor').trim(),vin:get('gpsVin').trim(),driver_name:get('gpsDriverName').trim(),driver_phone:get('gpsDriverPhone').trim(),photo_url:get('gpsPhotoUrl').trim(),notes:get('gpsAssetNotes').trim()}};}
  async function persistGpsConfig(gpsConfig){if(!canEdit())throw new Error('Tu rol es de solo lectura.');const device=selectedDevice();if(!device)throw new Error('Selecciona un dispositivo.');if(typeof window.__tayuApiPost!=='function')throw new Error('La API de configuración no está disponible.');const configuration=clone(device.configuration||{});configuration.gps=gpsConfig;await window.__tayuApiPost('/devices/configuration',{device_key:device.device_key,configuration});device.configuration=configuration;const original=(window.__tayuRealDevices||[]).find(item=>item.device_key===device.device_key);if(original)original.configuration=configuration;fillConfigForm();updateMap();renderGeofenceEvents();}
  async function saveConfiguration(){if(!canEdit())return;setStatus('gpsConfigStatus','Guardando configuración…');try{const cfg=collectConfiguration();await persistGpsConfig(cfg);setStatus('gpsConfigStatus',`Configuración guardada. Intervalo solicitado: ${cfg.report_interval_minutes} min.`)}catch(error){setStatus('gpsConfigStatus',`No se pudo guardar: ${error.message}`)}}

  function boot(){injectUI();syncFromPlatform(false).catch(()=>{});setInterval(()=>{syncFromPlatform(false).catch(()=>{});if(state.selectedKey&&document.getElementById('gps-generic-view')?.classList.contains('active')){renderCurrentData();updateMap()}},5000);}
  window.addEventListener('tayu:client-access-ready',()=>{if(!canEdit())setReadOnly()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
