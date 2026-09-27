(() => {
  'use strict';

  const MODULE = 'satellite';
  let map = null;
  let drawing = false;
  let points = [];
  let markers = [];
  let line = null;
  let polygon = null;
  let selectedFieldId = null;
  let chart = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function enabled() {
    if (typeof window.__tayuModuleEnabled === 'function') {
      return window.__tayuModuleEnabled(MODULE) === true;
    }
    const rows = Array.isArray(window.__tayuOrganizationModules) ? window.__tayuOrganizationModules : [];
    return rows.some(row => String(row?.module || '').toLowerCase() === MODULE && Boolean(row?.enabled));
  }

  function getApi(path) {
    if (!window.__tayuApi) throw new Error('API de Amelia no disponible');
    return window.__tayuApi(path);
  }

  function postApi(path, body) {
    if (!window.__tayuApiPost) throw new Error('API POST de Amelia no disponible');
    return window.__tayuApiPost(path, body);
  }

  function styles() {
    if (document.getElementById('tayu-satellite-styles')) return;
    const el = document.createElement('style');
    el.id = 'tayu-satellite-styles';
    el.textContent =
      '#satellite .sat-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(320px,.8fr);gap:18px;margin-top:18px}' +
      '#satellite .sat-map{height:520px;border-radius:20px;overflow:hidden;background:var(--panel2)}' +
      '#satellite .sat-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}' +
      '#satellite .sat-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
      '#satellite .sat-form .full{grid-column:1/-1}' +
      '#satellite .sat-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:18px}' +
      '#satellite .sat-kpi{background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:16px;box-shadow:var(--shadow)}' +
      '#satellite .sat-kpi span{display:block;color:var(--muted);font-size:12px;font-weight:800}' +
      '#satellite .sat-kpi b{display:block;font-size:26px;margin-top:8px}' +
      '#satellite .sat-list{display:flex;flex-direction:column;gap:10px;max-height:310px;overflow:auto}' +
      '#satellite .sat-field{padding:13px;border:1px solid var(--border);border-radius:16px;background:var(--panel2);cursor:pointer}' +
      '#satellite .sat-field.active{outline:2px solid var(--brand)}' +
      '#satellite .sat-status{margin-top:10px;font-size:13px;color:var(--muted);font-weight:750}' +
      '#satellite .sat-status.ok{color:var(--brand)}#satellite .sat-status.error{color:var(--danger)}' +
      '#satellite .sat-badge{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:850}' +
      '#satellite .sat-badge.good{background:rgba(85,198,43,.14);color:var(--brand)}' +
      '#satellite .sat-badge.limited{background:rgba(245,158,11,.16);color:#d97706}' +
      '#satellite .sat-badge.poor,#satellite .sat-badge.no_data{background:rgba(239,68,68,.13);color:var(--danger)}' +
      '#satellite .sat-chart{height:270px}#satellite .sat-table-wrap{overflow:auto}' +
      '@media(max-width:1100px){#satellite .sat-grid{grid-template-columns:1fr}#satellite .sat-kpis{grid-template-columns:1fr 1fr}}' +
      '@media(max-width:700px){#satellite .sat-form,#satellite .sat-kpis{grid-template-columns:1fr}#satellite .sat-map{height:420px}}';
    document.head.appendChild(el);
  }

  function setStatus(message, type) {
    const el = document.getElementById('satelliteStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'sat-status' + (type ? ' ' + type : '');
  }

  function fail(error) {
    console.error('Amelia Satellite:', error);
    setStatus(error?.message || 'Error en Amelia Satellite.', 'error');
  }

  function ensureUi() {
    if (!enabled()) return false;
    styles();

    const nav = document.querySelector('.nav');
    if (nav && !nav.querySelector('button[data-view="satellite"]')) {
      const btn = document.createElement('button');
      btn.dataset.view = 'satellite';
      btn.innerHTML = '<span class="nav-icon">🛰️</span><span class="nav-label">Satélite</span>';
      const fincas = nav.querySelector('button[data-view="fincas"]');
      if (fincas?.nextSibling) nav.insertBefore(btn, fincas.nextSibling);
      else nav.appendChild(btn);
      btn.addEventListener('click', () => openView(btn));
    }

    const main = document.querySelector('main.main');
    if (main && !document.getElementById('satellite')) {
      const section = document.createElement('section');
      section.id = 'satellite';
      section.className = 'view';
      section.innerHTML =
        '<div class="card"><div class="module-header"><div><h3 style="margin:0">🛰️ Amelia Satellite</h3><p class="hint" style="margin:6px 0 0">Sentinel-2 · NDVI y NDMI por lote.</p></div><div class="actions"><button class="btn ghost" id="satRefresh">Actualizar</button><button class="btn" id="satSync" disabled>Analizar con satélite</button></div></div></div>' +
        '<div class="sat-kpis">' +
          '<div class="sat-kpi"><span>NDVI actual</span><b id="satKpiNdvi">—</b><small>Último periodo utilizable</small></div>' +
          '<div class="sat-kpi"><span>NDMI actual</span><b id="satKpiNdmi">—</b><small>Último periodo utilizable</small></div>' +
          '<div class="sat-kpi"><span>Píxeles válidos</span><b id="satKpiValid">—</b><small id="satKpiQuality">Sin análisis</small></div>' +
          '<div class="sat-kpi"><span>Área</span><b id="satKpiArea">—</b><small>hectáreas</small></div>' +
        '</div>' +
        '<div class="sat-grid">' +
          '<div>' +
            '<div class="card map-card"><div id="satelliteMap" class="sat-map"></div><div class="sat-toolbar"><button class="btn" id="satDrawStart">Dibujar lote</button><button class="btn ghost" id="satDrawUndo" disabled>Deshacer</button><button class="btn ghost" id="satDrawFinish" disabled>Finalizar</button><button class="btn ghost" id="satDrawClear">Limpiar</button></div><p class="hint" id="satDrawNote">Marca al menos 3 puntos para crear el perímetro.</p></div>' +
            '<div class="card" style="margin-top:18px"><h3 style="margin-top:0">Evolución satelital</h3><div class="sat-chart"><canvas id="satelliteTrendChart"></canvas></div><div class="sat-table-wrap"><table class="table"><thead><tr><th>Periodo</th><th>Calidad</th><th>Válidos</th><th>NDVI</th><th>NDMI</th></tr></thead><tbody id="satelliteObservationsBody"><tr><td colspan="5">Sin datos.</td></tr></tbody></table></div></div>' +
          '</div>' +
          '<div>' +
            '<div class="card"><h3 style="margin-top:0">Lote satelital</h3><div class="sat-form">' +
              '<div class="full"><label>Finca / sitio</label><select id="satSiteSelect"><option value="">Cargando...</option></select></div>' +
              '<div><label>Código</label><input id="satFieldCode" placeholder="SAT-001"></div>' +
              '<div><label>Cultivo</label><input id="satCropType" placeholder="banano, cacao..."></div>' +
              '<div class="full"><label>Nombre</label><input id="satFieldName" placeholder="Lote Norte"></div>' +
              '<div><label>Área estimada (ha)</label><input id="satArea" type="number" readonly></div>' +
              '<div><label>Intervalo</label><select id="satInterval"><option value="P5D">5 días</option><option value="P10D">10 días</option></select></div>' +
              '<div class="full"><button class="btn" id="satSaveField" disabled>Guardar lote</button></div>' +
            '</div><div id="satelliteStatus" class="sat-status">Esperando datos.</div></div>' +
            '<div class="card" style="margin-top:18px"><h3 style="margin-top:0">Lotes registrados</h3><div id="satelliteFieldList" class="sat-list"><div class="hint">Sin lotes.</div></div></div>' +
          '</div>' +
        '</div>';

      const fincasView = document.getElementById('fincas');
      if (fincasView?.nextSibling) main.insertBefore(section, fincasView.nextSibling);
      else main.appendChild(section);
      bind();
    }
    return true;
  }

  function openView(button) {
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    button.classList.add('active');
    document.getElementById('satellite')?.classList.add('active');
    const title = document.getElementById('pageTitle');
    if (title) title.textContent = 'Monitoreo Satelital';
    document.getElementById('sidebar')?.classList.remove('open');
    setTimeout(() => {
      initMap();
      map?.invalidateSize();
      loadSites().catch(fail);
    }, 80);
  }

  function initMap() {
    const host = document.getElementById('satelliteMap');
    if (!host || !window.L || map) return map;
    map = L.map(host).setView([-1.8312, -78.1834], 6);
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:20,attribution:'© OpenStreetMap'});
    const imagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom:19,attribution:'Imágenes © Esri'});
    imagery.addTo(map);
    L.control.layers({'Satélite':imagery,'Mapa':streets}).addTo(map);
    map.on('click', e => { if (drawing) addPoint(e.latlng); });
    return map;
  }

  function clearLayers() {
    markers.forEach(m => m.remove());
    markers = [];
    line?.remove(); line = null;
    polygon?.remove(); polygon = null;
  }

  function redraw() {
    line?.remove(); line = null;
    if (drawing && points.length >= 2) line = L.polyline(points, {weight:3}).addTo(map);
    document.getElementById('satDrawUndo').disabled = points.length === 0;
    document.getElementById('satDrawFinish').disabled = points.length < 3;
    document.getElementById('satSaveField').disabled = true;
    const note = document.getElementById('satDrawNote');
    if (note) note.textContent = drawing ? 'Puntos marcados: ' + points.length : 'Marca al menos 3 puntos para crear el perímetro.';
  }

  function addPoint(latlng) {
    points.push([latlng.lat, latlng.lng]);
    markers.push(L.circleMarker(latlng,{radius:5,weight:2,fillOpacity:1}).addTo(map));
    redraw();
  }

  function estimateAreaHa(list) {
    if (list.length < 3) return 0;
    const lat0 = list.reduce((s,p)=>s+p[0],0)/list.length;
    const my = 111320;
    const mx = Math.max(1000,111320*Math.cos(lat0*Math.PI/180));
    const xy = list.map(p=>[p[1]*mx,p[0]*my]);
    let a = 0;
    for (let i=0;i<xy.length;i++) {
      const p1=xy[i], p2=xy[(i+1)%xy.length];
      a += p1[0]*p2[1]-p2[0]*p1[1];
    }
    return Math.abs(a)/2/10000;
  }

  function startDraw() {
    initMap();
    clearLayers();
    points = [];
    drawing = true;
    redraw();
    setStatus('Dibuja el perímetro del lote.', 'ok');
  }

  function finishDraw() {
    if (points.length < 3) return;
    drawing = false;
    line?.remove(); line = null;
    polygon = L.polygon(points,{weight:3,fillOpacity:.18}).addTo(map);
    const area = estimateAreaHa(points);
    document.getElementById('satArea').value = area.toFixed(2);
    document.getElementById('satKpiArea').textContent = area.toFixed(2);
    document.getElementById('satSaveField').disabled = false;
    setStatus('Polígono listo para guardar.', 'ok');
  }

  function clearDraw() {
    drawing = false;
    points = [];
    clearLayers();
    document.getElementById('satArea').value = '';
    document.getElementById('satKpiArea').textContent = '—';
    document.getElementById('satSaveField').disabled = true;
    redraw();
  }

  function geojson() {
    if (points.length < 3) return null;
    const coords = points.map(p => [p[1],p[0]]);
    coords.push([coords[0][0],coords[0][1]]);
    return {type:'Polygon',coordinates:[coords]};
  }

  async function loadSites() {
    setStatus('Cargando sitios...');
    const rows = await getApi('/satellite/sites');
    const sites = Array.isArray(rows) ? rows : [];
    const select = document.getElementById('satSiteSelect');
    select.innerHTML = sites.length
      ? sites.map(s => '<option value="' + esc(s.id) + '">' + esc(s.name) + ' · ' + esc(s.site_type || 'sitio') + '</option>').join('')
      : '<option value="">Sin sitios disponibles</option>';
    if (sites.length) await loadFields();
    setStatus('Amelia Satellite listo.', 'ok');
  }

  async function loadFields() {
    const siteId = document.getElementById('satSiteSelect')?.value;
    if (!siteId) return;
    const rows = await getApi('/satellite/fields?site_id=' + encodeURIComponent(siteId));
    const fields = Array.isArray(rows) ? rows : [];
    const host = document.getElementById('satelliteFieldList');
    host.innerHTML = fields.length
      ? fields.map(f => '<div class="sat-field" data-id="' + esc(f.id) + '"><b>' + esc(f.name) + '</b><div><small>' + esc(f.code) + ' · ' + esc(f.crop_type || 'Sin cultivo') + ' · ' + Number(f.area_hectares||0).toFixed(2) + ' ha</small></div></div>').join('')
      : '<div class="hint">Aún no hay lotes satelitales.</div>';
    host.querySelectorAll('.sat-field').forEach(el => el.addEventListener('click', () => selectField(el.dataset.id, fields)));
  }

  async function selectField(id, fields) {
    selectedFieldId = id;
    document.querySelectorAll('#satelliteFieldList .sat-field').forEach(el => el.classList.toggle('active', el.dataset.id === id));
    document.getElementById('satSync').disabled = false;
    let field = fields.find(f => f.id === id);
    if (!field) field = await getApi('/satellite/fields/' + encodeURIComponent(id));
    if (field?.geometry_geojson && map) {
      clearLayers();
      polygon = L.geoJSON(field.geometry_geojson,{style:{weight:3,fillOpacity:.18}}).addTo(map);
      try { map.fitBounds(polygon.getBounds(),{padding:[24,24]}); } catch (_) {}
    }
    document.getElementById('satKpiArea').textContent = Number(field?.area_hectares||0).toFixed(2);
    await loadObservations(id);
  }

  async function saveField() {
    const siteId = document.getElementById('satSiteSelect')?.value;
    const code = document.getElementById('satFieldCode')?.value.trim();
    const name = document.getElementById('satFieldName')?.value.trim();
    const crop = document.getElementById('satCropType')?.value.trim();
    const area = Number(document.getElementById('satArea')?.value||0);
    const geometry = geojson();
    if (!siteId || !code || !name || !geometry || !(area>0)) throw new Error('Completa sitio, código, nombre y polígono.');
    const result = await postApi('/satellite/fields',{site_id:siteId,code,name,crop_type:crop||null,geometry_geojson:geometry,area_hectares:area});
    selectedFieldId = result?.id || null;
    setStatus('Lote guardado.', 'ok');
    await loadFields();
  }

  async function syncField() {
    if (!selectedFieldId) throw new Error('Selecciona un lote.');
    const interval = document.getElementById('satInterval')?.value || 'P5D';
    setStatus('Consultando Sentinel-2...');
    const result = await postApi('/satellite/fields/' + encodeURIComponent(selectedFieldId) + '/sync',{aggregationInterval:interval,maxCloudCoverage:100});
    setStatus('Análisis completado: ' + Number(result?.saved||0) + ' periodos guardados.', 'ok');
    await loadObservations(selectedFieldId);
  }

  async function loadObservations(id) {
    const rows = await getApi('/satellite/fields/' + encodeURIComponent(id) + '/observations?limit=36');
    renderObservations(Array.isArray(rows) ? rows : []);
  }

  function renderObservations(rows) {
    const sorted = [...rows].sort((a,b)=>new Date(a.interval_from||0)-new Date(b.interval_from||0));
    const latest = [...sorted].reverse().find(r => r.quality === 'good' || r.quality === 'limited');
    const fmt = v => Number.isFinite(Number(v)) ? Number(v).toFixed(3) : '—';
    document.getElementById('satKpiNdvi').textContent = fmt(latest?.ndvi_mean);
    document.getElementById('satKpiNdmi').textContent = fmt(latest?.ndmi_mean);
    document.getElementById('satKpiValid').textContent = latest?.valid_pixel_percent == null ? '—' : Number(latest.valid_pixel_percent).toFixed(1) + '%';
    document.getElementById('satKpiQuality').textContent = latest?.quality || 'Sin análisis';

    const body = document.getElementById('satelliteObservationsBody');
    body.innerHTML = sorted.length ? sorted.map(r => {
      const from = r.interval_from ? new Date(r.interval_from).toLocaleDateString('es-EC') : '—';
      const to = r.interval_to ? new Date(r.interval_to).toLocaleDateString('es-EC') : '—';
      const q = esc(r.quality || 'no_data');
      return '<tr><td>' + from + ' → ' + to + '</td><td><span class="sat-badge ' + q + '">' + q + '</span></td><td>' + (r.valid_pixel_percent==null?'—':Number(r.valid_pixel_percent).toFixed(1)+'%') + '</td><td>' + fmt(r.ndvi_mean) + '</td><td>' + fmt(r.ndmi_mean) + '</td></tr>';
    }).join('') : '<tr><td colspan="5">Sin datos.</td></tr>';

    if (!window.Chart) return;
    const canvas = document.getElementById('satelliteTrendChart');
    if (!canvas) return;
    if (chart) { try { chart.destroy(); } catch (_) {} }
    const usable = sorted.filter(r => Number.isFinite(Number(r.ndvi_mean)) && Number.isFinite(Number(r.ndmi_mean)));
    chart = new Chart(canvas,{
      type:'line',
      data:{
        labels:usable.map(r=>new Date(r.interval_to).toLocaleDateString('es-EC',{day:'2-digit',month:'short'})),
        datasets:[
          {label:'NDVI',data:usable.map(r=>Number(r.ndvi_mean)),tension:.28},
          {label:'NDMI',data:usable.map(r=>Number(r.ndmi_mean)),tension:.28}
        ]
      },
      options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{y:{min:-1,max:1}}}
    });
    window.applyTayuChartTheme?.();
  }

  function bind() {
    document.getElementById('satRefresh')?.addEventListener('click',()=>loadSites().catch(fail));
    document.getElementById('satDrawStart')?.addEventListener('click',startDraw);
    document.getElementById('satDrawUndo')?.addEventListener('click',()=>{if(points.length){points.pop();markers.pop()?.remove();redraw();}});
    document.getElementById('satDrawFinish')?.addEventListener('click',finishDraw);
    document.getElementById('satDrawClear')?.addEventListener('click',clearDraw);
    document.getElementById('satSaveField')?.addEventListener('click',()=>saveField().catch(fail));
    document.getElementById('satSync')?.addEventListener('click',()=>syncField().catch(fail));
    document.getElementById('satSiteSelect')?.addEventListener('change',()=>{selectedFieldId=null;clearDraw();loadFields().catch(fail);});
  }

  function boot() { ensureUi(); }

  window.addEventListener('tayu:modules-applied',()=>setTimeout(boot,0));
  window.addEventListener('tayu:client-access-ready',()=>setTimeout(boot,0));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});
  else setTimeout(boot,0);

  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    if (enabled()) { ensureUi(); clearInterval(timer); }
    if (attempts > 80) clearInterval(timer);
  },250);
})();