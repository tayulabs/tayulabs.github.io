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
  let searchMarker = null;
  let currentSites = [];
  let currentFields = [];
  let fieldOverviewLayers = new Map();
  let fieldOverviewStates = new Map();
  let showArchivedFields = false;
  let ndviOverlay = null;
  let farmNdviOverlays = new Map();
  let compareBeforeOverlay = null;
  let compareAfterOverlay = null;
  let comparePositionPct = 50;
  let comparePeriods = [];
  let compareBeforeIndex = 0;
  let compareAfterIndex = 1;

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
      '#satellite .sat-search{margin-bottom:12px;position:relative}' +
      '#satellite .sat-search-box{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}' +
      '#satellite .sat-search-box input{min-width:0}' +
      '#satellite .sat-search-results{display:none;position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:1200;background:var(--panel);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}' +
      '#satellite .sat-search-results.open{display:block}' +
      '#satellite .sat-search-result{padding:11px 13px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;line-height:1.35}' +
      '#satellite .sat-search-result:last-child{border-bottom:0}' +
      '#satellite .sat-search-result:hover{background:var(--panel2)}' +
      '#satellite .sat-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center}' +
      '#satellite .sat-toolbar select{min-width:220px;max-width:320px}' +
      '#satellite .sat-legend{display:none;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;padding:10px 12px;border:1px solid var(--border);border-radius:14px;background:var(--panel2);font-size:12px;font-weight:800}' +
      '#satellite .sat-legend.open{display:flex}' +
      '#satellite .sat-legend-item{display:inline-flex;align-items:center;gap:5px}' +
      '#satellite .sat-legend-swatch{width:12px;height:12px;border-radius:3px;display:inline-block}' +
      '#satellite .sat-compare-panel{display:none;margin-top:10px;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--panel2)}' +
      '#satellite .sat-compare-panel.open{display:block}' +
      '#satellite .sat-compare-head{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end}' +
      '#satellite .sat-compare-period{padding:10px 12px;border:1px solid var(--border);border-radius:14px;background:var(--panel)}' +
      '#satellite .sat-compare-period span{display:block;font-size:11px;font-weight:900;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}' +
      '#satellite .sat-compare-period b{display:block;margin-top:4px;font-size:14px;line-height:1.25}' +
      '#satellite .sat-compare-period small{display:block;margin-top:3px;color:var(--muted);font-weight:750}' +
      '#satellite .sat-compare-timeline{position:relative;margin:14px 12px 2px;height:58px}' +
      '#satellite .sat-compare-track{position:absolute;left:0;right:0;top:16px;height:6px;border-radius:999px;background:rgba(148,163,184,.28)}' +
      '#satellite .sat-compare-selected{position:absolute;top:16px;height:6px;border-radius:999px;background:var(--brand);pointer-events:none}' +
      '#satellite .sat-compare-range{position:absolute;left:0;top:0;width:100%;height:38px;margin:0;background:transparent;appearance:none;-webkit-appearance:none;pointer-events:none}' +
      '#satellite .sat-compare-range::-webkit-slider-runnable-track{height:6px;background:transparent}' +
      '#satellite .sat-compare-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:22px;height:22px;border-radius:50%;margin-top:-8px;background:#fff;border:4px solid var(--brand);box-shadow:0 2px 8px rgba(0,0,0,.22);pointer-events:auto;cursor:ew-resize}' +
      '#satellite .sat-compare-range::-moz-range-track{height:6px;background:transparent}' +
      '#satellite .sat-compare-range::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:4px solid var(--brand);box-shadow:0 2px 8px rgba(0,0,0,.22);pointer-events:auto;cursor:ew-resize}' +
      '#satellite .sat-compare-range.before{z-index:3}' +
      '#satellite .sat-compare-range.after{z-index:4}' +
      '#satellite .sat-compare-ticks{position:absolute;left:0;right:0;top:13px;display:flex;justify-content:space-between;pointer-events:none}' +
      '#satellite .sat-compare-tick{width:12px;height:12px;border-radius:50%;background:var(--panel);border:2px solid rgba(148,163,184,.7)}' +
      '#satellite .sat-compare-axis{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;font-size:11px;color:var(--muted);font-weight:750}' +
      '#satellite .sat-compare-label{position:absolute;top:14px;z-index:900;background:rgba(255,255,255,.9);color:#17310f;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.14)}' +
      '#satellite .sat-compare-label.before{left:14px}' +
      '#satellite .sat-compare-label.after{right:14px}' +
      '#satellite .sat-compare-control{display:none;position:absolute;left:50%;bottom:30px;transform:translateX(-50%);z-index:930;width:min(360px,calc(100% - 48px));padding:8px 12px 9px;border-radius:16px;background:rgba(255,255,255,.94);border:1px solid rgba(40,74,24,.18);box-shadow:0 8px 24px rgba(0,0,0,.24);backdrop-filter:blur(8px)}' +
      '#satellite .sat-compare-control.open{display:block}' +
      '#satellite .sat-compare-control-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:5px;color:#284a18;font-size:10px;font-weight:1000;letter-spacing:.06em}' +
      '#satellite .sat-compare-control input{display:block;width:100%;height:20px;margin:0;accent-color:#284a18;cursor:ew-resize}' +
      '#satellite .sat-map-wrap{position:relative}' +
      '#satellite .sat-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
      '#satellite .sat-form .full{grid-column:1/-1}' +
      '#satellite .sat-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:18px}' +
      '#satellite .sat-kpi{background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:16px;box-shadow:var(--shadow)}' +
      '#satellite .sat-kpi span{display:block;color:var(--muted);font-size:12px;font-weight:800}' +
      '#satellite .sat-kpi b{display:block;font-size:26px;margin-top:8px}' +
      '#satellite .sat-kpi small{display:block;margin-top:4px;line-height:1.35}' +
      '#satellite .sat-insights{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}' +
      '#satellite .sat-insight{background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:16px;box-shadow:var(--shadow)}' +
      '#satellite .sat-insight span{display:block;color:var(--muted);font-size:12px;font-weight:800}' +
      '#satellite .sat-insight b{display:block;margin-top:6px;font-size:18px}' +
      '#satellite .sat-insight small{display:block;margin-top:6px;color:var(--muted);line-height:1.4}' +
      '#satellite .sat-list{display:flex;flex-direction:column;gap:10px;max-height:310px;overflow:auto}' +
      '#satellite .sat-field{padding:13px;border:1px solid var(--border);border-radius:16px;background:var(--panel2);cursor:pointer}' +
      '#satellite .sat-field.active{outline:2px solid var(--brand)}' +
      '#satellite .sat-field-row{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start}' +
      '#satellite .sat-field-check{margin-top:3px;width:17px;height:17px;accent-color:var(--brand)}' +
      '#satellite .sat-batch-actions{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}' +
      '#satellite .sat-map-lot-label{background:rgba(255,255,255,.92);border:0;box-shadow:0 3px 10px rgba(0,0,0,.16);color:#284a18;font-weight:900;border-radius:999px;padding:3px 7px}' +
      '#satellite .sat-farm-legend{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;padding:10px 12px;border:1px solid var(--border);border-radius:14px;background:var(--panel2);font-size:12px;font-weight:800;align-items:center}' +
      '#satellite .sat-farm-legend .item{display:inline-flex;align-items:center;gap:5px}' +
      '#satellite .sat-farm-legend .dot{width:11px;height:11px;border-radius:50%;display:inline-block}' +
      '#satellite .sat-field-status{display:inline-flex;margin-top:5px;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:900;background:rgba(148,163,184,.16);color:var(--muted)}' +
      '#satellite .sat-field-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}' +
      '#satellite .sat-field-menu-wrap{position:relative}' +
      '#satellite .sat-field-menu-btn{border:0;background:transparent;color:var(--muted);font-size:20px;line-height:1;cursor:pointer;padding:0 4px}' +
      '#satellite .sat-field-menu{display:none;position:absolute;right:0;top:26px;z-index:50;min-width:180px;background:var(--panel);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);overflow:hidden}' +
      '#satellite .sat-field-menu.open{display:block}' +
      '#satellite .sat-field-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:10px 12px;cursor:pointer;color:var(--text);font-weight:750}' +
      '#satellite .sat-field-menu button:hover{background:var(--panel2)}' +
      '#satellite .sat-field-menu button.danger{color:var(--danger)}' +
      '#satellite .sat-list-tabs{display:flex;gap:8px;margin-bottom:10px}' +
      '#satellite .sat-list-tabs .active{background:var(--brand);color:#fff}' +
      '#satellite .sat-status{margin-top:10px;font-size:13px;color:var(--muted);font-weight:750}' +
      '#satellite .sat-status.ok{color:var(--brand)}#satellite .sat-status.error{color:var(--danger)}' +
      '#satellite .sat-badge{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:850}' +
      '#satellite .sat-badge.good{background:rgba(85,198,43,.14);color:var(--brand)}' +
      '#satellite .sat-badge.limited{background:rgba(245,158,11,.16);color:#d97706}' +
      '#satellite .sat-badge.poor,#satellite .sat-badge.no_data{background:rgba(239,68,68,.13);color:var(--danger)}' +
      '#satellite .sat-chart{height:270px}#satellite .sat-table-wrap{overflow:auto}' +
      '@media(max-width:1100px){#satellite .sat-grid{grid-template-columns:1fr}#satellite .sat-kpis{grid-template-columns:1fr 1fr}#satellite .sat-insights{grid-template-columns:1fr}}' +
      '@media(max-width:700px){#satellite .sat-form,#satellite .sat-kpis{grid-template-columns:1fr}#satellite .sat-map{height:420px}#satellite .sat-compare-head{grid-template-columns:1fr}#satellite .sat-compare-timeline{margin-left:6px;margin-right:6px}}';
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
      btn.innerHTML = '<span class="nav-icon"><img class="tayu-nav-img icon-color" src="imagenes/icons/satelite-color.png" alt=""><img class="tayu-nav-img icon-white" src="imagenes/icons/satelite-white.png" alt="" aria-hidden="true"></span><span class="nav-label">Satélite</span>';
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
        '<div class="card"><div class="module-header"><div><h3 style="margin:0">🛰️ Amelia Satellite</h3><p class="hint" style="margin:6px 0 0">Análisis de vigor, humedad y evolución de cultivos.</p></div><div class="actions"><button class="btn ghost" id="satRefresh">Actualizar</button><button class="btn" id="satSync" disabled>Analizar con satélite</button></div></div></div>' +
        '<div class="sat-kpis">' +
          '<div class="sat-kpi"><span>NDVI actual</span><b id="satKpiNdvi">—</b><small id="satKpiNdviHint">Sin datos</small></div>' +
          '<div class="sat-kpi"><span>NDMI actual</span><b id="satKpiNdmi">—</b><small id="satKpiNdmiHint">Sin datos</small></div>' +
          '<div class="sat-kpi"><span>Píxeles válidos</span><b id="satKpiValid">—</b><small id="satKpiQuality">Sin análisis</small></div>' +
          '<div class="sat-kpi"><span>Área</span><b id="satKpiArea">—</b><small>hectáreas</small></div>' +
        '</div>' +
        '<div class="sat-insights">' +
          '<div class="sat-insight"><span>Vigor relativo</span><b id="satInsightVigor">—</b><small id="satInsightVigorNote">Esperando observaciones.</small></div>' +
          '<div class="sat-insight"><span>Humedad relativa</span><b id="satInsightMoisture">—</b><small id="satInsightMoistureNote">Esperando observaciones.</small></div>' +
          '<div class="sat-insight"><span>Tendencia NDVI</span><b id="satInsightTrend">—</b><small id="satInsightTrendNote">Se calcula con los dos últimos periodos utilizables.</small></div>' +
        '</div>' +
        '<p class="hint" style="margin:8px 2px 0">Interpretación orientativa: los umbrales de NDVI/NDMI pueden variar según cultivo, etapa fenológica, suelo, clima y manejo.</p>' +
        '<div class="sat-grid">' +
          '<div>' +
            '<div class="card map-card"><div class="sat-search"><div class="sat-search-box"><input id="satLocationSearch" placeholder="Buscar ubicación o coordenadas: -2.1709, -79.9224"><button class="btn ghost" id="satLocationSearchButton">Buscar</button></div><div id="satSearchResults" class="sat-search-results"></div></div><div class="sat-map-wrap"><div id="satelliteMap" class="sat-map"></div><div id="satCompareBeforeLabel" class="sat-compare-label before" style="display:none">ANTES</div><div id="satCompareAfterLabel" class="sat-compare-label after" style="display:none">DESPUÉS</div><div id="satCompareControl" class="sat-compare-control"><div class="sat-compare-control-head"><span>ANTES</span><span>DESPUÉS</span></div><input id="satCompareRevealRange" type="range" min="0" max="100" step="1" value="50" aria-label="Revelar Antes y Después"></div></div><div class="sat-toolbar"><button class="btn" id="satDrawStart">Dibujar lote</button><button class="btn ghost" id="satDrawUndo" disabled>Deshacer</button><button class="btn ghost" id="satDrawFinish" disabled>Finalizar</button><button class="btn ghost" id="satDrawClear">Limpiar</button><button class="btn ghost" id="satNdviMapButton" disabled>Mapa NDVI</button><button class="btn ghost" id="satCompareToggle" disabled>Antes vs después</button></div><div id="satComparePanel" class="sat-compare-panel"><div class="sat-compare-head"><div class="sat-compare-period"><span>Antes</span><b id="satCompareBeforeText">Sin periodo</b><small id="satCompareBeforeQuality">—</small></div><div class="sat-compare-period"><span>Después</span><b id="satCompareAfterText">Sin periodo</b><small id="satCompareAfterQuality">—</small></div><button class="btn" id="satCompareRun" disabled>Comparar</button></div><div class="sat-compare-timeline"><div class="sat-compare-track"></div><div class="sat-compare-selected" id="satCompareSelected"></div><div class="sat-compare-ticks" id="satCompareTicks"></div><input class="sat-compare-range before" id="satCompareBeforeRange" type="range" min="0" max="1" step="1" value="0" disabled aria-label="Periodo Antes"><input class="sat-compare-range after" id="satCompareAfterRange" type="range" min="0" max="1" step="1" value="1" disabled aria-label="Periodo Después"><div class="sat-compare-axis"><span id="satCompareAxisStart">—</span><span id="satCompareAxisEnd">—</span></div></div><p class="hint" style="margin:8px 0 0">Mueve los dos puntos sobre la línea de tiempo y pulsa Comparar. El deslizador inferior recorre el raster del lote: su posición se conserva aunque muevas o acerques el mapa.</p></div><div id="satFarmLegend" class="sat-farm-legend"><strong>Resumen de finca</strong><span class="item"><i class="dot" style="background:#1b5e20"></i>Alto</span><span class="item"><i class="dot" style="background:#7cb342"></i>Moderado</span><span class="item"><i class="dot" style="background:#fdd835"></i>Bajo</span><span class="item"><i class="dot" style="background:#c62828"></i>Muy bajo</span><span class="item"><i class="dot" style="background:#94a3b8"></i>Sin dato confiable</span></div><div id="satNdviLegend" class="sat-legend"><span>NDVI</span><span class="sat-legend-item"><i class="sat-legend-swatch" style="background:#c62828"></i>Muy bajo</span><span class="sat-legend-item"><i class="sat-legend-swatch" style="background:#ef6c00"></i>Bajo</span><span class="sat-legend-item"><i class="sat-legend-swatch" style="background:#fdd835"></i>Medio</span><span class="sat-legend-item"><i class="sat-legend-swatch" style="background:#7cb342"></i>Bueno</span><span class="sat-legend-item"><i class="sat-legend-swatch" style="background:#1b5e20"></i>Alto</span></div><p class="hint" id="satDrawNote">Busca la ubicación, acerca el mapa y marca al menos 3 puntos para crear el perímetro.</p></div>' +
            '<div class="card" style="margin-top:18px"><h3 style="margin-top:0">Evolución satelital</h3><div class="sat-chart"><canvas id="satelliteTrendChart"></canvas></div><div class="sat-table-wrap"><table class="table"><thead><tr><th>Periodo</th><th>Calidad</th><th>Válidos</th><th>NDVI</th><th>NDMI</th></tr></thead><tbody id="satelliteObservationsBody"><tr><td colspan="5">Sin datos.</td></tr></tbody></table></div></div>' +
          '</div>' +
          '<div>' +
            '<div class="card"><h3 style="margin-top:0">Gestión de lotes</h3><div class="sat-form">' +
              '<div class="full"><label>Finca / sitio</label><select id="satSiteSelect"><option value="">Cargando...</option></select></div>' +
              '<div><label>Código</label><input id="satFieldCode" placeholder="SAT-001"></div>' +
              '<div><label>Cultivo</label><input id="satCropType" placeholder="banano, cacao..."></div>' +
              '<div class="full"><label>Nombre</label><input id="satFieldName" placeholder="Lote Norte"></div>' +
              '<div><label>Área estimada (ha)</label><input id="satArea" type="number" readonly></div>' +
              '<div><label>Intervalo</label><select id="satInterval"><option value="P5D">5 días</option><option value="P10D">10 días</option></select></div>' +
              '<div class="full"><button class="btn" id="satSaveField" disabled>Guardar lote</button></div>' +
            '</div><div id="satelliteStatus" class="sat-status">Esperando datos.</div></div>' +
            '<div class="card" style="margin-top:18px"><h3 style="margin-top:0">Lotes de la finca</h3><div class="sat-list-tabs"><button class="btn ghost active" id="satActiveFieldsTab">Activos</button><button class="btn ghost" id="satArchivedFieldsTab">Archivados</button></div><div class="sat-batch-actions" id="satBatchActions"><button class="btn ghost" id="satSelectAllFields" disabled>Seleccionar todos</button><button class="btn" id="satBatchSync" disabled>Analizar seleccionados</button><button class="btn ghost" id="satFarmNdviShow" disabled>Ver NDVI seleccionados</button><button class="btn ghost" id="satFarmNdviHide" disabled>Ocultar NDVI finca</button></div><div id="satelliteFieldList" class="sat-list"><div class="hint">Sin lotes.</div></div></div>' +
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
    map.on('move zoom resize', () => {
      if (!compareAfterOverlay) return;
      requestAnimationFrame(() => setComparePosition(comparePositionPct));
    });
    return map;
  }


  function setSearchMarker(lat, lon, label) {
    initMap();
    searchMarker?.remove();
    searchMarker = L.marker([lat, lon]).addTo(map);
    if (label) searchMarker.bindPopup(esc(label)).openPopup();
    map.flyTo([lat, lon], Math.max(map.getZoom(), 16), {duration:.8});
  }

  function parseCoordinates(value) {
    const text = String(value || '').trim();
    const match = text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return {lat, lon};
  }

  function closeSearchResults() {
    const host = document.getElementById('satSearchResults');
    if (!host) return;
    host.classList.remove('open');
    host.innerHTML = '';
  }

  function showSearchResults(rows) {
    const host = document.getElementById('satSearchResults');
    if (!host) return;
    if (!rows.length) {
      host.innerHTML = '<div class="sat-search-result">No se encontraron ubicaciones.</div>';
      host.classList.add('open');
      return;
    }

    host.innerHTML = rows.map((row, index) =>
      '<div class="sat-search-result" data-index="' + index + '">' +
      esc(row.display_name || 'Ubicación') +
      '</div>'
    ).join('');
    host.classList.add('open');

    host.querySelectorAll('.sat-search-result[data-index]').forEach(el => {
      el.addEventListener('click', () => {
        const row = rows[Number(el.dataset.index)];
        const lat = Number(row?.lat);
        const lon = Number(row?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        document.getElementById('satLocationSearch').value = row.display_name || (lat + ', ' + lon);
        closeSearchResults();
        setSearchMarker(lat, lon, row.display_name || 'Ubicación');
        setStatus('Ubicación encontrada. Acerca el mapa y dibuja el lote.', 'ok');
      });
    });
  }

  async function searchLocation() {
    const input = document.getElementById('satLocationSearch');
    const query = String(input?.value || '').trim();
    if (!query) {
      setStatus('Escribe una ubicación o coordenadas.', 'error');
      return;
    }

    const coordinates = parseCoordinates(query);
    if (coordinates) {
      closeSearchResults();
      setSearchMarker(coordinates.lat, coordinates.lon, coordinates.lat.toFixed(6) + ', ' + coordinates.lon.toFixed(6));
      setStatus('Mapa centrado en las coordenadas ingresadas.', 'ok');
      return;
    }

    setStatus('Buscando ubicación...');
    const response = await fetch(
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=es&q=' +
      encodeURIComponent(query),
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) throw new Error('No se pudo consultar el buscador de ubicaciones.');

    const rows = await response.json();
    showSearchResults(Array.isArray(rows) ? rows : []);
    setStatus(
      Array.isArray(rows) && rows.length
        ? 'Selecciona una coincidencia del buscador.'
        : 'No se encontraron coincidencias.',
      Array.isArray(rows) && rows.length ? 'ok' : 'error'
    );
  }

  function centerSelectedSite() {
    const siteId = document.getElementById('satSiteSelect')?.value;
    const site = currentSites.find(row => row.id === siteId);
    const lat = Number(site?.latitude);
    const lon = Number(site?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    setSearchMarker(lat, lon, site.name || 'Sitio');
    setStatus('Mapa centrado en la ubicación registrada de ' + (site.name || 'la finca') + '.', 'ok');
    return true;
  }

  function clearComparison() {
    compareBeforeOverlay?.remove();
    compareAfterOverlay?.remove();
    compareBeforeOverlay = null;
    compareAfterOverlay = null;
    comparePositionPct = 50;

    document.getElementById('satCompareControl')?.classList.remove('open');
    const revealRange = document.getElementById('satCompareRevealRange');
    if (revealRange) revealRange.value = '50';

    const beforeLabel = document.getElementById('satCompareBeforeLabel');
    const afterLabel = document.getElementById('satCompareAfterLabel');
    if (beforeLabel) beforeLabel.style.display = 'none';
    if (afterLabel) afterLabel.style.display = 'none';
  }

  function clearFarmNdviOverlays() {
    farmNdviOverlays.forEach(overlay => {
      try { overlay.remove(); } catch (_) {}
    });
    farmNdviOverlays.clear();

    const hideButton =
      document.getElementById('satFarmNdviHide');

    if (hideButton) {
      hideButton.disabled = true;
    }
  }

  function clearNdviOverlay() {
    ndviOverlay?.remove();
    ndviOverlay = null;
    clearComparison();
    document.getElementById('satNdviLegend')?.classList.remove('open');
  }

  function setComparePosition(percent) {
    const pct =
      Math.max(
        0,
        Math.min(
          100,
          Number(percent) || 0
        )
      );

    comparePositionPct = pct;

    const afterImage =
      compareAfterOverlay?.getElement?.();

    const revealRange =
      document.getElementById(
        'satCompareRevealRange'
      );

    if (revealRange) {
      revealRange.value =
        String(
          Math.round(pct)
        );
    }

    if (!afterImage) {
      return;
    }

    // El deslizador representa un porcentaje DEL RASTER, no de la ventana.
    // Así 50% siempre parte el NDVI por la mitad y, al mover/zoomear el mapa,
    // el corte permanece en la misma posición relativa dentro del lote.
    const clip =
      'inset(0 0 0 ' +
      pct.toFixed(2) +
      '%)';

    afterImage.style.clipPath =
      clip;

    afterImage.style.webkitClipPath =
      clip;
  }

  function periodPath(fieldId, periodValue) {
    let path = '/satellite/fields/' + encodeURIComponent(fieldId) + '/ndvi-map';
    const parts = String(periodValue || '').split('|');
    if (parts.length === 2 && parts[0] && parts[1]) {
      path += '?from=' + encodeURIComponent(parts[0]) + '&to=' + encodeURIComponent(parts[1]);
    }
    return path;
  }

  function mapBounds(result) {
    const bbox = Array.isArray(result?.bbox) ? result.bbox.map(Number) : [];
    if (bbox.length !== 4 || bbox.some(v => !Number.isFinite(v))) {
      throw new Error('El mapa NDVI no devolvió límites válidos.');
    }
    if (!result?.image_data_url) {
      throw new Error('El mapa NDVI no devolvió una imagen.');
    }
    return [
      [bbox[1], bbox[0]],
      [bbox[3], bbox[2]]
    ];
  }

  function formatMapPeriod(result) {
    return result?.from && result?.to
      ? new Date(result.from).toLocaleDateString('es-EC') + ' → ' + new Date(result.to).toLocaleDateString('es-EC')
      : 'periodo seleccionado';
  }

  function clearLayers() {
    markers.forEach(m => m.remove());
    markers = [];
    line?.remove(); line = null;
    polygon?.remove(); polygon = null;
    clearNdviOverlay();
    clearFarmNdviOverlays();
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

  function clearFieldOverview() {
    fieldOverviewLayers.forEach(layer => {
      try { layer.remove(); } catch (_) {}
    });
    fieldOverviewLayers.clear();
  }

  function overviewStyleForField(id) {
    const state = fieldOverviewStates.get(id);
    const baseColor = state?.color || '#94a3b8';

    return {
      weight: id === selectedFieldId ? 4 : 2,
      fillOpacity: id === selectedFieldId ? .24 : .16,
      color: id === selectedFieldId ? '#5BC12F' : baseColor,
      fillColor: baseColor
    };
  }

  function refreshOverviewStyles() {
    fieldOverviewLayers.forEach((layer, id) => {
      try {
        layer.setStyle(
          overviewStyleForField(id)
        );
      } catch (_) {}
    });
  }

  function renderFieldOverview(fields) {
    if (!map) return;

    clearFieldOverview();

    const bounds = [];

    fields.forEach(field => {
      if (!field?.geometry_geojson) return;

      const layer = L.geoJSON(
        field.geometry_geojson,
        {
          style: overviewStyleForField(field.id)
        }
      ).addTo(map);

      fieldOverviewLayers.set(field.id, layer);

      try {
        layer.bindTooltip(
          esc(field.name || field.code || 'Lote'),
          {
            permanent: false,
            direction: 'center',
            className: 'sat-map-lot-label'
          }
        );
      } catch (_) {}

      layer.on('click', event => {
        try { L.DomEvent.stopPropagation(event); } catch (_) {}
        selectField(field.id, fields).catch(fail);
      });

      try {
        const fieldBounds = layer.getBounds();
        if (fieldBounds?.isValid?.()) bounds.push(fieldBounds);
      } catch (_) {}
    });

    if (!selectedFieldId && bounds.length) {
      try {
        const combined = bounds.slice(1).reduce(
          (acc, item) => acc.extend(item),
          bounds[0]
        );
        map.fitBounds(combined, {padding:[28,28]});
      } catch (_) {}
    }
  }

  function farmStateFromObservation(observation) {
    const value = Number(observation?.ndvi_mean);

    if (
      !observation ||
      !(
        observation.quality === 'good' ||
        observation.quality === 'limited'
      ) ||
      !Number.isFinite(value)
    ) {
      return {
        label: 'Sin dato confiable',
        color: '#94a3b8',
        ndvi: null,
        period: null
      };
    }

    let label = 'Muy bajo';
    let color = '#c62828';

    if (value >= 0.65) {
      label = 'Alto';
      color = '#1b5e20';
    } else if (value >= 0.45) {
      label = 'Moderado';
      color = '#7cb342';
    } else if (value >= 0.25) {
      label = 'Bajo';
      color = '#fdd835';
    }

    const period =
      observation.interval_to
        ? new Date(observation.interval_to).toLocaleDateString('es-EC')
        : null;

    return {
      label,
      color,
      ndvi: value,
      period
    };
  }

  function updateFieldOverviewCard(fieldId, state) {
    const card =
      document.querySelector(
        '#satelliteFieldList .sat-field[data-id="' +
        CSS.escape(String(fieldId)) +
        '"]'
      );

    if (!card) return;

    let badge =
      card.querySelector(
        '.sat-field-status'
      );

    if (!badge) {
      badge =
        document.createElement('span');

      badge.className =
        'sat-field-status';

      const info =
        card.querySelector(
          '.sat-field-head > div:first-child'
        );

      info?.appendChild(
        badge
      );
    }

    badge.textContent =
      state.ndvi === null
        ? state.label
        : state.label +
          ' · NDVI ' +
          state.ndvi.toFixed(3) +
          (
            state.period
              ? ' · ' + state.period
              : ''
          );

    badge.style.background =
      state.color + '22';

    badge.style.color =
      state.color;
  }

  async function loadFarmOverviewStates(fields, siteId) {
    if (
      showArchivedFields ||
      !Array.isArray(fields) ||
      !fields.length
    ) {
      return;
    }

    const queue = [...fields];
    const results = new Map();

    async function worker() {
      while (queue.length) {
        const field = queue.shift();
        if (!field) continue;

        try {
          const rows =
            await getApi(
              '/satellite/fields/' +
              encodeURIComponent(field.id) +
              '/observations?limit=36'
            );

          const observations =
            Array.isArray(rows)
              ? rows
              : [];

          const latestUsable =
            observations.find(row =>
              (
                row?.quality === 'good' ||
                row?.quality === 'limited'
              ) &&
              Number.isFinite(
                Number(row?.ndvi_mean)
              )
            ) || null;

          results.set(
            field.id,
            farmStateFromObservation(
              latestUsable
            )
          );

        } catch (_) {
          results.set(
            field.id,
            farmStateFromObservation(
              null
            )
          );
        }
      }
    }

    await Promise.all(
      Array.from(
        {
          length:
            Math.min(
              4,
              fields.length
            )
        },
        () => worker()
      )
    );

    if (
      showArchivedFields ||
      document.getElementById('satSiteSelect')?.value !== siteId
    ) {
      return;
    }

    fieldOverviewStates =
      results;

    refreshOverviewStyles();

    results.forEach(
      (state, fieldId) => {
        updateFieldOverviewCard(
          fieldId,
          state
        );

        const layer =
          fieldOverviewLayers.get(
            fieldId
          );

        if (!layer) return;

        try {
          const field =
            fields.find(
              row =>
                row.id === fieldId
            );

          const tooltip =
            (field?.name || field?.code || 'Lote') +
            '<br>' +
            state.label +
            (
              state.ndvi === null
                ? ''
                : ' · NDVI ' +
                  state.ndvi.toFixed(3)
            ) +
            (
              state.period
                ? '<br>Último dato: ' +
                  state.period
                : ''
            );

          layer.bindTooltip(
            tooltip,
            {
              permanent: false,
              direction: 'center',
              className:
                'sat-map-lot-label'
            }
          );
        } catch (_) {}
      }
    );
  }

  function updateBatchButtons() {
    const checks = [...document.querySelectorAll('#satelliteFieldList .sat-field-check')];
    const checked = checks.filter(input => input.checked);

    const selectAll = document.getElementById('satSelectAllFields');
    const batch = document.getElementById('satBatchSync');
    const farmMap = document.getElementById('satFarmNdviShow');

    if (selectAll) {
      selectAll.disabled = checks.length === 0;
      selectAll.textContent =
        checks.length > 0 && checked.length === checks.length
          ? 'Quitar selección'
          : 'Seleccionar todos';
    }

    if (batch) {
      batch.disabled = checked.length === 0;
      batch.textContent =
        checked.length > 0
          ? 'Analizar seleccionados (' + checked.length + ')'
          : 'Analizar seleccionados';
    }

    if (farmMap) {
      farmMap.disabled =
        checked.length === 0 ||
        showArchivedFields;

      farmMap.textContent =
        checked.length > 0
          ? 'Ver NDVI seleccionados (' + checked.length + ')'
          : 'Ver NDVI seleccionados';
    }
  }

  async function loadSites() {
    setStatus('Cargando sitios...');
    const rows = await getApi('/satellite/sites');
    const sites = Array.isArray(rows) ? rows : [];
    currentSites = sites;
    const select = document.getElementById('satSiteSelect');
    const previousSiteId = select?.value || '';
    const rememberedSiteId = sessionStorage.getItem('tayuSatelliteSiteId') || '';
    select.innerHTML = sites.length
      ? sites.map(s => '<option value="' + esc(s.id) + '">' + esc(s.name) + ' · ' + esc(s.site_type || 'sitio') + '</option>').join('')
      : '<option value="">Sin sitios disponibles</option>';
    if (previousSiteId && sites.some(s => s.id === previousSiteId)) {
      select.value = previousSiteId;
    } else if (rememberedSiteId && sites.some(s => s.id === rememberedSiteId)) {
      select.value = rememberedSiteId;
    }
    if (select?.value) sessionStorage.setItem('tayuSatelliteSiteId', select.value);
    if (sites.length) {
      centerSelectedSite();
      await loadFields();
    }
    setStatus('Amelia Satellite listo.', 'ok');
  }

  async function loadFields() {
    const siteId = document.getElementById('satSiteSelect')?.value;
    if (!siteId) return;
    const endpoint =
      showArchivedFields
        ? '/satellite/archived-fields?site_id=' + encodeURIComponent(siteId)
        : '/satellite/fields?site_id=' + encodeURIComponent(siteId);

    const rows = await getApi(endpoint);
    if (document.getElementById('satSiteSelect')?.value !== siteId) return;

    const allFields = Array.isArray(rows) ? rows : [];

    // Defensa adicional por sitio: aunque el backend ya recibe site_id,
    // si la respuesta incluye site_id filtramos también en frontend para
    // evitar que lotes de otra finca queden visibles por una respuesta stale
    // o por un endpoint que devuelva más registros de los esperados.
    const siteScopedFields =
      allFields.some(field => field?.site_id)
        ? allFields.filter(field => String(field.site_id) === String(siteId))
        : allFields;

    const fields = showArchivedFields
      ? siteScopedFields.filter(field => field?.status === 'archived')
      : siteScopedFields.filter(field => !field?.status || field.status === 'active');

    currentFields = fields;
    fieldOverviewStates = new Map();
    renderFieldOverview(fields);

    const farmLegend = document.getElementById('satFarmLegend');
    if (farmLegend) farmLegend.style.display = showArchivedFields ? 'none' : 'flex';

    const batchActions = document.getElementById('satBatchActions');
    if (batchActions) batchActions.style.display = showArchivedFields ? 'none' : 'flex';

    const activeTab = document.getElementById('satActiveFieldsTab');
    const archivedTab = document.getElementById('satArchivedFieldsTab');
    activeTab?.classList.toggle('active', !showArchivedFields);
    archivedTab?.classList.toggle('active', showArchivedFields);

    const host = document.getElementById('satelliteFieldList');
    host.innerHTML = fields.length
      ? fields.map(f => {
          const actions = showArchivedFields
            ? '<button data-action="restore" data-id="' + esc(f.id) + '">Restaurar lote</button>' +
              '<button class="danger" data-action="delete" data-id="' + esc(f.id) + '">Eliminar definitivamente</button>'
            : '<button data-action="archive" data-id="' + esc(f.id) + '">Archivar lote</button>' +
              '<button class="danger" data-action="delete" data-id="' + esc(f.id) + '">Eliminar definitivamente</button>';

          const checkbox = showArchivedFields
            ? ''
            : '<input class="sat-field-check" type="checkbox" data-id="' + esc(f.id) + '" aria-label="Seleccionar ' + esc(f.name) + '">';

          return '<div class="sat-field" data-id="' + esc(f.id) + '">' +
            '<div class="sat-field-row">' +
              checkbox +
              '<div>' +
                '<div class="sat-field-head"><div><b>' + esc(f.name) + '</b><div><small>' + esc(f.code) + ' · ' + esc(f.crop_type || 'Sin cultivo') + ' · ' + Number(f.area_hectares||0).toFixed(2) + ' ha</small></div></div>' +
                '<div class="sat-field-menu-wrap"><button class="sat-field-menu-btn" type="button" aria-label="Acciones del lote">⋮</button><div class="sat-field-menu">' + actions + '</div></div></div>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('')
      : '<div class="hint">' + (showArchivedFields ? 'No hay lotes archivados.' : 'Aún no hay lotes satelitales.') + '</div>';

    host.querySelectorAll('.sat-field').forEach(el =>
      el.addEventListener('click', event => {
        if (
          event.target?.closest?.('.sat-field-check') ||
          event.target?.closest?.('.sat-field-menu-wrap')
        ) return;

        if (showArchivedFields) return;
        selectField(el.dataset.id, fields).catch(fail);
      })
    );

    host.querySelectorAll('.sat-field-check').forEach(input =>
      input.addEventListener('change', updateBatchButtons)
    );

    host.querySelectorAll('.sat-field-menu-btn').forEach(button =>
      button.addEventListener('click', event => {
        event.stopPropagation();
        const menu = button.parentElement?.querySelector('.sat-field-menu');
        document.querySelectorAll('#satellite .sat-field-menu.open').forEach(item => {
          if (item !== menu) item.classList.remove('open');
        });
        menu?.classList.toggle('open');
      })
    );

    host.querySelectorAll('.sat-field-menu [data-action]').forEach(button =>
      button.addEventListener('click', event => {
        event.stopPropagation();
        const action = button.dataset.action;
        const id = button.dataset.id;
        manageField(id, action).catch(fail);
      })
    );

    updateBatchButtons();

    loadFarmOverviewStates(
      fields,
      siteId
    ).catch(error => {
      console.warn(
        'Amelia Satellite overview:',
        error
      );
    });

    if (selectedFieldId && fields.some(f => f.id === selectedFieldId)) {
      await selectField(selectedFieldId, fields);
    } else if (selectedFieldId) {
      selectedFieldId = null;
      refreshOverviewStyles();
    }
  }

  async function manageField(fieldId, action) {
    const field = currentFields.find(row => row.id === fieldId);
    const fieldName = field?.name || field?.code || 'este lote';

    if (action === 'archive') {
      if (!window.confirm('¿Archivar "' + fieldName + '"? El historial se conservará y podrás restaurarlo después.')) return;
      await postApi('/satellite/fields/' + encodeURIComponent(fieldId) + '/archive', {});
      if (selectedFieldId === fieldId) selectedFieldId = null;
      setStatus('Lote archivado. Su historial se conserva.', 'ok');
      await loadFields();
      return;
    }

    if (action === 'restore') {
      await postApi('/satellite/fields/' + encodeURIComponent(fieldId) + '/restore', {});
      setStatus('Lote restaurado.', 'ok');
      await loadFields();
      return;
    }

    if (action === 'delete') {
      const confirmed = window.confirm(
        '¿Eliminar definitivamente "' + fieldName + '"?\n\nSe borrará el lote y TODO su historial satelital. Esta acción no se puede deshacer.'
      );

      if (!confirmed) return;

      const secondConfirmed = window.confirm(
        'Confirmación final: ¿eliminar permanentemente "' + fieldName + '"?'
      );

      if (!secondConfirmed) return;

      await postApi(
        '/satellite/fields/' + encodeURIComponent(fieldId) + '/delete',
        {confirm:true}
      );

      if (selectedFieldId === fieldId) {
        selectedFieldId = null;
        clearDraw();
        renderObservations([]);
      }

      setStatus('Lote eliminado definitivamente.', 'ok');
      await loadFields();
    }
  }

  async function selectField(id, fields) {
    selectedFieldId = id;
    document.querySelectorAll('#satelliteFieldList .sat-field').forEach(el => el.classList.toggle('active', el.dataset.id === id));
    refreshOverviewStyles();
    document.getElementById('satSync').disabled = false;
    document.getElementById('satNdviMapButton').disabled = true;
    document.getElementById('satCompareToggle').disabled = true;
    document.getElementById('satCompareRun').disabled = true;
    let field = fields.find(f => f.id === id);
    if (!field) field = await getApi('/satellite/fields/' + encodeURIComponent(id));

    const codeInput = document.getElementById('satFieldCode');
    const cropInput = document.getElementById('satCropType');
    const nameInput = document.getElementById('satFieldName');
    const areaInput = document.getElementById('satArea');

    if (codeInput) codeInput.value = field?.code || '';
    if (cropInput) cropInput.value = field?.crop_type || '';
    if (nameInput) nameInput.value = field?.name || '';
    if (areaInput) areaInput.value = Number(field?.area_hectares || 0).toFixed(2);

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

  async function syncOneField(fieldId, interval) {
    const intervalDays = interval === 'P10D' ? 10 : 5;
    const dayMs = 24 * 60 * 60 * 1000;
    const todayUtcDay = Math.floor(Date.now() / dayMs);
    const alignedToDay = Math.floor(todayUtcDay / intervalDays) * intervalDays;
    const to = new Date(alignedToDay * dayMs);
    const recentFrom = new Date(to.getTime() - (30 * dayMs));

    let result = await postApi(
      '/satellite/fields/' + encodeURIComponent(fieldId) + '/sync',
      {
        from: recentFrom.toISOString(),
        to: to.toISOString(),
        aggregationInterval: interval,
        maxCloudCoverage: 100
      }
    );

    const hasUsableObservation = value =>
      Array.isArray(value?.observations) &&
      value.observations.some(row =>
        row?.quality === 'good' ||
        row?.quality === 'limited'
      );

    let usedFallback = false;

    if (!hasUsableObservation(result)) {
      usedFallback = true;

      const historicalFrom =
        new Date(
          to.getTime() -
          (120 * dayMs)
        );

      result = await postApi(
        '/satellite/fields/' + encodeURIComponent(fieldId) + '/sync',
        {
          from: historicalFrom.toISOString(),
          to: to.toISOString(),
          aggregationInterval: interval,
          maxCloudCoverage: 100
        }
      );
    }

    const saved = Number(result?.saved || 0);
    const skippedNoData = Number(result?.skipped_no_data || 0);
    const usableCount = Array.isArray(result?.observations)
      ? result.observations.filter(row => row?.quality === 'good' || row?.quality === 'limited').length
      : 0;

    return {
      result,
      usedFallback,
      saved,
      skippedNoData,
      usableCount
    };
  }

  async function syncField() {
    if (!selectedFieldId) throw new Error('Selecciona un lote.');

    const interval = document.getElementById('satInterval')?.value || 'P5D';

    setStatus('Procesando imágenes satelitales...');

    const summary =
      await syncOneField(
        selectedFieldId,
        interval
      );

    if (summary.usableCount > 0) {
      setStatus(
        (summary.usedFallback ? 'Se amplió la búsqueda histórica. ' : '') +
        'Análisis completado: ' + summary.usableCount + ' periodos utilizables' +
        (summary.skippedNoData > 0 ? ' y ' + summary.skippedNoData + ' sin datos útiles.' : '.'),
        'ok'
      );
    } else if (summary.saved > 0) {
      setStatus(
        'Se encontraron datos recientes, pero su calidad es baja. Se muestran en el historial y no se usarán para el mapa NDVI.',
        'error'
      );
    } else {
      setStatus(
        'No se encontraron periodos satelitales utilizables para este lote en la ventana consultada.',
        'error'
      );
    }

    await loadObservations(selectedFieldId);

    const siteId =
      document.getElementById('satSiteSelect')?.value;

    if (
      siteId &&
      !showArchivedFields &&
      currentFields.length
    ) {
      await loadFarmOverviewStates(
        currentFields,
        siteId
      );
    }
  }

  async function syncSelectedFields() {
    const selectedIds =
      [...document.querySelectorAll('#satelliteFieldList .sat-field-check:checked')]
        .map(input => input.dataset.id)
        .filter(Boolean);

    if (!selectedIds.length) {
      throw new Error('Selecciona al menos un lote.');
    }

    const interval =
      document.getElementById('satInterval')?.value ||
      'P5D';

    const button =
      document.getElementById('satBatchSync');

    if (button) button.disabled = true;

    let completed = 0;
    let usable = 0;
    let lowQuality = 0;
    let failed = 0;

    for (const fieldId of selectedIds) {
      const field =
        currentFields.find(row => row.id === fieldId);

      setStatus(
        'Analizando lote ' +
        (field?.name || (completed + 1)) +
        ' (' + (completed + 1) + '/' + selectedIds.length + ')...'
      );

      try {
        const summary =
          await syncOneField(
            fieldId,
            interval
          );

        if (summary.usableCount > 0) usable++;
        else if (summary.saved > 0) lowQuality++;

      } catch (error) {
        console.error(
          'Amelia Satellite batch:',
          fieldId,
          error
        );
        failed++;
      }

      completed++;
    }

    setStatus(
      'Análisis múltiple completado: ' +
      usable + ' lote(s) con datos utilizables' +
      (lowQuality ? ', ' + lowQuality + ' con baja calidad' : '') +
      (failed ? ', ' + failed + ' con error' : '') +
      '.',
      failed ? 'error' : 'ok'
    );

    if (button) button.disabled = false;

    if (selectedFieldId) {
      await loadObservations(selectedFieldId);
    }

    const siteId =
      document.getElementById('satSiteSelect')?.value;

    if (
      siteId &&
      !showArchivedFields &&
      currentFields.length
    ) {
      await loadFarmOverviewStates(
        currentFields,
        siteId
      );
    }

    updateBatchButtons();
  }

  async function loadObservations(id) {
    const rows = await getApi('/satellite/fields/' + encodeURIComponent(id) + '/observations?limit=36');
    renderObservations(Array.isArray(rows) ? rows : []);
  }

  async function loadFarmNdviMaps() {
    const selectedIds =
      [...document.querySelectorAll('#satelliteFieldList .sat-field-check:checked')]
        .map(input => input.dataset.id)
        .filter(Boolean);

    if (!selectedIds.length) {
      throw new Error('Selecciona al menos un lote.');
    }

    clearNdviOverlay();
    clearFarmNdviOverlays();

    const showButton =
      document.getElementById('satFarmNdviShow');

    const hideButton =
      document.getElementById('satFarmNdviHide');

    if (showButton) showButton.disabled = true;

    setStatus(
      'Cargando mapas NDVI de ' +
      selectedIds.length +
      ' lote(s)...'
    );

    const queue = [...selectedIds];
    const loadedBounds = [];
    let loaded = 0;
    let unavailable = 0;
    let failed = 0;

    async function worker() {
      while (queue.length) {
        const fieldId = queue.shift();
        if (!fieldId) continue;

        const field =
          currentFields.find(
            row =>
              row.id === fieldId
          );

        try {
          const result =
            await getApi(
              periodPath(
                fieldId,
                ''
              )
            );

          const bounds =
            mapBounds(
              result
            );

          const overlay =
            L.imageOverlay(
              result.image_data_url,
              bounds,
              {
                opacity: .76,
                interactive: false,
                crossOrigin: false
              }
            ).addTo(map);

          farmNdviOverlays.set(
            fieldId,
            overlay
          );

          loadedBounds.push(
            L.latLngBounds(
              bounds
            )
          );

          loaded++;

        } catch (error) {
          const message =
            String(
              error?.message ||
              ''
            ).toLowerCase();

          if (
            message.includes('not found') ||
            message.includes('no usable') ||
            message.includes('no se')
          ) {
            unavailable++;
          } else {
            failed++;
            console.warn(
              'Amelia Satellite farm NDVI:',
              field?.name || fieldId,
              error
            );
          }
        }
      }
    }

    await Promise.all(
      Array.from(
        {
          length:
            Math.min(
              3,
              selectedIds.length
            )
        },
        () => worker()
      )
    );

    fieldOverviewLayers.forEach(layer => {
      try { layer.bringToFront?.(); } catch (_) {}
    });

    document.getElementById('satNdviLegend')?.classList.toggle(
      'open',
      loaded > 0
    );

    if (
      loadedBounds.length &&
      map
    ) {
      try {
        const combined =
          loadedBounds
            .slice(1)
            .reduce(
              (acc, item) =>
                acc.extend(
                  item
                ),
              loadedBounds[0]
            );

        map.fitBounds(
          combined,
          {
            padding:
              [28,28]
          }
        );
      } catch (_) {}
    }

    if (hideButton) {
      hideButton.disabled =
        loaded === 0;
    }

    if (showButton) {
      showButton.disabled = false;
    }

    setStatus(
      'Mapa NDVI de finca: ' +
      loaded +
      ' lote(s) cargados' +
      (
        unavailable
          ? ', ' +
            unavailable +
            ' sin periodo confiable'
          : ''
      ) +
      (
        failed
          ? ', ' +
            failed +
            ' con error'
          : ''
      ) +
      '.',
      failed
        ? 'error'
        : 'ok'
    );
  }

  async function loadNdviOverlay() {
    if (!selectedFieldId) throw new Error('Selecciona un lote.');

    setStatus('Generando mapa NDVI...');

    // El botón Mapa NDVI usa siempre el último periodo confiable.
    // La selección manual de fechas queda exclusivamente en Antes vs después.
    const result = await getApi(periodPath(selectedFieldId, ''));
    const bounds = mapBounds(result);

    clearFarmNdviOverlays();
    clearNdviOverlay();

    ndviOverlay = L.imageOverlay(
      result.image_data_url,
      bounds,
      {
        opacity: .74,
        interactive: false,
        crossOrigin: false
      }
    ).addTo(map);

    document.getElementById('satNdviLegend')?.classList.add('open');
    try { polygon?.bringToFront?.(); } catch (_) {}
    try { map.fitBounds(bounds, {padding:[24,24]}); } catch (_) {}

    setStatus('Mapa NDVI cargado: ' + formatMapPeriod(result) + '.', 'ok');
  }

  async function runComparison() {
    if (!selectedFieldId) throw new Error('Selecciona un lote.');

    const beforeValue =
      comparePeriods[compareBeforeIndex]?.value ||
      '';

    const afterValue =
      comparePeriods[compareAfterIndex]?.value ||
      '';

    if (!beforeValue || !afterValue) {
      throw new Error('Selecciona los periodos Antes y Después.');
    }

    if (compareBeforeIndex >= compareAfterIndex) {
      throw new Error('El periodo Antes debe ser anterior al periodo Después.');
    }

    setStatus('Generando comparación Antes vs Después...');

    const [beforeResult, afterResult] = await Promise.all([
      getApi(periodPath(selectedFieldId, beforeValue)),
      getApi(periodPath(selectedFieldId, afterValue))
    ]);

    const beforeBounds = mapBounds(beforeResult);
    const afterBounds = mapBounds(afterResult);

    clearFarmNdviOverlays();
    clearNdviOverlay();

    compareBeforeOverlay = L.imageOverlay(
      beforeResult.image_data_url,
      beforeBounds,
      {
        opacity: .78,
        interactive: false,
        crossOrigin: false
      }
    ).addTo(map);

    compareAfterOverlay = L.imageOverlay(
      afterResult.image_data_url,
      afterBounds,
      {
        opacity: .78,
        interactive: false,
        crossOrigin: false
      }
    ).addTo(map);

    const compareControl = document.getElementById('satCompareControl');
    compareControl?.classList.add('open');

    const beforeLabel = document.getElementById('satCompareBeforeLabel');
    const afterLabel = document.getElementById('satCompareAfterLabel');

    if (beforeLabel) {
      beforeLabel.textContent = 'ANTES · ' + formatMapPeriod(beforeResult);
      beforeLabel.style.display = 'block';
    }

    if (afterLabel) {
      afterLabel.textContent = 'DESPUÉS · ' + formatMapPeriod(afterResult);
      afterLabel.style.display = 'block';
    }

    document.getElementById('satNdviLegend')?.classList.add('open');

    setComparePosition(50);

    try { polygon?.bringToFront?.(); } catch (_) {}
    try { map.fitBounds(beforeBounds, {padding:[24,24]}); } catch (_) {}

    setStatus('Comparación cargada. El deslizador inferior controla la misma posición relativa dentro del raster aunque muevas el mapa.', 'ok');
  }

  function comparePeriodText(period) {
    if (!period) return 'Sin periodo';

    const from =
      new Date(
        period.interval_from
      ).toLocaleDateString(
        'es-EC'
      );

    const to =
      new Date(
        period.interval_to
      ).toLocaleDateString(
        'es-EC'
      );

    return from + ' → ' + to;
  }

  function updateCompareTimeline(changed) {
    const count =
      comparePeriods.length;

    const beforeRange =
      document.getElementById(
        'satCompareBeforeRange'
      );

    const afterRange =
      document.getElementById(
        'satCompareAfterRange'
      );

    const compareRun =
      document.getElementById(
        'satCompareRun'
      );

    if (
      !beforeRange ||
      !afterRange
    ) {
      return;
    }

    const max =
      Math.max(
        1,
        count - 1
      );

    beforeRange.max =
      String(max);

    afterRange.max =
      String(max);

    if (count < 2) {
      compareBeforeIndex = 0;
      compareAfterIndex = 1;
      beforeRange.value = '0';
      afterRange.value = '1';
      beforeRange.disabled = true;
      afterRange.disabled = true;

      if (compareRun) {
        compareRun.disabled = true;
      }

    } else {
      if (changed === 'before') {
        compareBeforeIndex =
          Math.min(
            Number(
              beforeRange.value
            ),
            compareAfterIndex - 1
          );
      }

      if (changed === 'after') {
        compareAfterIndex =
          Math.max(
            Number(
              afterRange.value
            ),
            compareBeforeIndex + 1
          );
      }

      compareBeforeIndex =
        Math.max(
          0,
          Math.min(
            compareBeforeIndex,
            count - 2
          )
        );

      compareAfterIndex =
        Math.max(
          compareBeforeIndex + 1,
          Math.min(
            compareAfterIndex,
            count - 1
          )
        );

      beforeRange.value =
        String(
          compareBeforeIndex
        );

      afterRange.value =
        String(
          compareAfterIndex
        );

      beforeRange.disabled = false;
      afterRange.disabled = false;

      if (compareRun) {
        compareRun.disabled = false;
      }
    }

    const before =
      comparePeriods[
        compareBeforeIndex
      ];

    const after =
      comparePeriods[
        compareAfterIndex
      ];

    const beforeText =
      document.getElementById(
        'satCompareBeforeText'
      );

    const afterText =
      document.getElementById(
        'satCompareAfterText'
      );

    const beforeQuality =
      document.getElementById(
        'satCompareBeforeQuality'
      );

    const afterQuality =
      document.getElementById(
        'satCompareAfterQuality'
      );

    if (beforeText) {
      beforeText.textContent =
        comparePeriodText(
          before
        );
    }

    if (afterText) {
      afterText.textContent =
        comparePeriodText(
          after
        );
    }

    if (beforeQuality) {
      beforeQuality.textContent =
        before
          ? qualityLabel(
              before.quality
            )
          : '—';
    }

    if (afterQuality) {
      afterQuality.textContent =
        after
          ? qualityLabel(
              after.quality
            )
          : '—';
    }

    const start =
      document.getElementById(
        'satCompareAxisStart'
      );

    const end =
      document.getElementById(
        'satCompareAxisEnd'
      );

    if (start) {
      start.textContent =
        comparePeriods[0]
          ? new Date(
              comparePeriods[0]
                .interval_from
            ).toLocaleDateString(
              'es-EC'
            )
          : '—';
    }

    if (end) {
      end.textContent =
        comparePeriods[
          count - 1
        ]
          ? new Date(
              comparePeriods[
                count - 1
              ].interval_to
            ).toLocaleDateString(
              'es-EC'
            )
          : '—';
    }

    const ticks =
      document.getElementById(
        'satCompareTicks'
      );

    if (ticks) {
      ticks.innerHTML =
        count
          ? comparePeriods
              .map(
                () =>
                  '<i class="sat-compare-tick"></i>'
              )
              .join('')
          : '';
    }

    const selected =
      document.getElementById(
        'satCompareSelected'
      );

    if (selected) {
      if (count < 2) {
        selected.style.left = '0%';
        selected.style.width = '0%';
      } else {
        const denominator =
          count - 1;

        const left =
          (
            compareBeforeIndex /
            denominator
          ) *
          100;

        const right =
          (
            compareAfterIndex /
            denominator
          ) *
          100;

        selected.style.left =
          left + '%';

        selected.style.width =
          Math.max(
            0,
            right - left
          ) + '%';
      }
    }
  }

  function ndviLabel(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return {label:'—', note:'Sin datos suficientes.'};
    if (v >= 0.65) return {label:'Alto', note:'Cobertura vegetal relativamente vigorosa en este periodo.'};
    if (v >= 0.45) return {label:'Moderado', note:'Vigor vegetal intermedio; conviene seguir la tendencia.'};
    if (v >= 0.25) return {label:'Bajo', note:'Índice relativamente bajo; revisar junto con clima, manejo y cultivo.'};
    return {label:'Muy bajo', note:'Señal vegetal baja o suelo/agua expuestos. Requiere contexto de campo.'};
  }

  function ndmiLabel(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return {label:'—', note:'Sin datos suficientes.'};
    if (v >= 0.30) return {label:'Alta', note:'Índice de humedad relativamente alto para este periodo.'};
    if (v >= 0.10) return {label:'Moderada', note:'Nivel de humedad relativo intermedio.'};
    if (v >= 0.00) return {label:'Baja positiva', note:'Humedad relativa baja, pero aún en valores positivos.'};
    return {label:'Muy baja', note:'Índice de humedad negativo; revisar junto con lluvia, riego y tipo de cultivo.'};
  }

  function qualityLabel(value) {
    const labels = {
      good:'Buena calidad',
      limited:'Calidad limitada',
      poor:'Baja calidad',
      no_data:'Sin datos'
    };
    return labels[value] || value || 'Sin análisis';
  }

  function renderObservations(rows) {
    const qualityRank = {
      good: 3,
      limited: 2,
      poor: 1,
      no_data: 0
    };

    // La API puede contener análisis antiguos con horas distintas
    // pero el mismo rango visible. Amelia muestra solo la mejor fila
    // por par de fechas para evitar duplicados en tabla/selectores.
    const dedupedByDay = new Map();

    [...rows].forEach(row => {
      const from = row?.interval_from ? new Date(row.interval_from) : null;
      const to = row?.interval_to ? new Date(row.interval_to) : null;

      const key =
        from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())
          ? from.toISOString().slice(0,10) + '|' + to.toISOString().slice(0,10)
          : String(row?.id || Math.random());

      const current = dedupedByDay.get(key);

      if (!current) {
        dedupedByDay.set(key, row);
        return;
      }

      const currentRank = qualityRank[current?.quality] ?? -1;
      const nextRank = qualityRank[row?.quality] ?? -1;
      const currentValid = Number(current?.valid_pixel_percent ?? -1);
      const nextValid = Number(row?.valid_pixel_percent ?? -1);
      const currentTime = new Date(current?.interval_from || 0).getTime();
      const nextTime = new Date(row?.interval_from || 0).getTime();

      if (
        nextRank > currentRank ||
        (nextRank === currentRank && nextValid > currentValid) ||
        (nextRank === currentRank && nextValid === currentValid && nextTime > currentTime)
      ) {
        dedupedByDay.set(key, row);
      }
    });

    const sorted = [...dedupedByDay.values()]
      .sort((a,b)=>new Date(a.interval_from||0)-new Date(b.interval_from||0));

    const observed = sorted.filter(r =>
      Number.isFinite(Number(r.ndvi_mean)) &&
      Number.isFinite(Number(r.ndmi_mean))
    );

    const usable = observed.filter(r =>
      r.quality === 'good' ||
      r.quality === 'limited'
    );

    const latestUsable = usable[usable.length - 1] || null;
    const previous = usable.length > 1 ? usable[usable.length - 2] : null;
    const latestObserved = observed[observed.length - 1] || null;
    const displayLatest = latestObserved || latestUsable;
    const fmt = v => Number.isFinite(Number(v)) ? Number(v).toFixed(3) : '—';

    const ndviInfo = ndviLabel(latestUsable?.ndvi_mean);
    const ndmiInfo = ndmiLabel(latestUsable?.ndmi_mean);

    const ndviMapButton = document.getElementById('satNdviMapButton');
    const mapPeriods = [...usable]
      .filter(r => r.interval_from && r.interval_to)
      .sort((a,b)=>new Date(b.interval_to||0)-new Date(a.interval_to||0));

    if (ndviMapButton) {
      ndviMapButton.disabled = mapPeriods.length === 0;
    }

    const compareToggle = document.getElementById('satCompareToggle');

    const previousBeforeValue =
      comparePeriods[
        compareBeforeIndex
      ]?.value || '';

    const previousAfterValue =
      comparePeriods[
        compareAfterIndex
      ]?.value || '';

    comparePeriods =
      [...mapPeriods]
        .sort(
          (a,b) =>
            new Date(
              a.interval_to || 0
            ) -
            new Date(
              b.interval_to || 0
            )
        )
        .map(r => ({
          ...r,
          value:
            String(
              r.interval_from
            ) +
            '|' +
            String(
              r.interval_to
            )
        }));

    const rememberedBefore =
      comparePeriods.findIndex(
        item =>
          item.value ===
          previousBeforeValue
      );

    const rememberedAfter =
      comparePeriods.findIndex(
        item =>
          item.value ===
          previousAfterValue
      );

    if (
      rememberedBefore >= 0 &&
      rememberedAfter >= 0 &&
      rememberedBefore <
        rememberedAfter
    ) {
      compareBeforeIndex =
        rememberedBefore;

      compareAfterIndex =
        rememberedAfter;

    } else {
      compareBeforeIndex = 0;
      compareAfterIndex =
        Math.max(
          1,
          comparePeriods.length - 1
        );
    }

    updateCompareTimeline();

    if (compareToggle) {
      compareToggle.disabled =
        comparePeriods.length < 2;
    }

    document.getElementById('satKpiNdvi').textContent = fmt(displayLatest?.ndvi_mean);
    document.getElementById('satKpiNdmi').textContent = fmt(displayLatest?.ndmi_mean);
    document.getElementById('satKpiValid').textContent = displayLatest?.valid_pixel_percent == null ? '—' : Number(displayLatest.valid_pixel_percent).toFixed(1) + '%';
    document.getElementById('satKpiQuality').textContent = qualityLabel(displayLatest?.quality);

    const latestHint =
      displayLatest?.quality === 'poor'
        ? 'Último periodo · baja confianza'
        : displayLatest
          ? 'Último periodo observado'
          : 'Sin datos';

    document.getElementById('satKpiNdviHint').textContent = latestHint;
    document.getElementById('satKpiNdmiHint').textContent = latestHint;

    document.getElementById('satInsightVigor').textContent = ndviInfo.label;
    document.getElementById('satInsightVigorNote').textContent = ndviInfo.note;
    document.getElementById('satInsightMoisture').textContent = ndmiInfo.label;
    document.getElementById('satInsightMoistureNote').textContent = ndmiInfo.note;

    const trendEl = document.getElementById('satInsightTrend');
    const trendNoteEl = document.getElementById('satInsightTrendNote');
    if (latestUsable && previous) {
      const current = Number(latestUsable.ndvi_mean);
      const prior = Number(previous.ndvi_mean);
      const delta = current - prior;
      const pct = Math.abs(prior) > 0.0001 ? (delta / Math.abs(prior)) * 100 : null;
      const arrow = delta > 0.005 ? '▲' : delta < -0.005 ? '▼' : '→';
      trendEl.textContent = arrow + ' ' + (pct == null ? delta.toFixed(3) : Math.abs(pct).toFixed(1) + '%');
      trendNoteEl.textContent =
        'NDVI ' + (delta > 0.005 ? 'subió' : delta < -0.005 ? 'bajó' : 'se mantuvo estable') +
        ' ' + Math.abs(delta).toFixed(3) +
        ' puntos respecto al periodo anterior.';
    } else {
      trendEl.textContent = '—';
      trendNoteEl.textContent = 'Se necesitan al menos dos periodos utilizables.';
    }

    const body = document.getElementById('satelliteObservationsBody');
    body.innerHTML = sorted.length ? sorted.map(r => {
      const from = r.interval_from ? new Date(r.interval_from).toLocaleDateString('es-EC') : '—';
      const to = r.interval_to ? new Date(r.interval_to).toLocaleDateString('es-EC') : '—';
      const q = esc(r.quality || 'no_data');
      return '<tr><td>' + from + ' → ' + to + '</td><td><span class="sat-badge ' + q + '">' + esc(qualityLabel(r.quality)) + '</span></td><td>' + (r.valid_pixel_percent==null?'—':Number(r.valid_pixel_percent).toFixed(1)+'%') + '</td><td>' + fmt(r.ndvi_mean) + '</td><td>' + fmt(r.ndmi_mean) + '</td></tr>';
    }).join('') : '<tr><td colspan="5">Sin datos.</td></tr>';

    if (!window.Chart) return;
    const canvas = document.getElementById('satelliteTrendChart');
    if (!canvas) return;
    if (chart) { try { chart.destroy(); } catch (_) {} }
    const chartRows = sorted.filter(r => Number.isFinite(Number(r.ndvi_mean)) && Number.isFinite(Number(r.ndmi_mean)));
    chart = new Chart(canvas,{
      type:'line',
      data:{
        labels:chartRows.map(r=>new Date(r.interval_to).toLocaleDateString('es-EC',{day:'2-digit',month:'short'})),
        datasets:[
          {label:'NDVI',data:chartRows.map(r=>Number(r.ndvi_mean)),tension:.28},
          {label:'NDMI',data:chartRows.map(r=>Number(r.ndmi_mean)),tension:.28}
        ]
      },
      options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{y:{min:-1,max:1}}}
    });
    window.applyTayuChartTheme?.();
  }

  function bind() {
    document.getElementById('satRefresh')?.addEventListener('click',()=>loadSites().catch(fail));
    document.getElementById('satLocationSearchButton')?.addEventListener('click',()=>searchLocation().catch(fail));
    document.getElementById('satLocationSearch')?.addEventListener('keydown',event=>{
      if(event.key==='Enter'){
        event.preventDefault();
        searchLocation().catch(fail);
      }
    });
    document.addEventListener('click', event => {
      if (!event.target?.closest?.('.sat-search')) closeSearchResults();
      if (!event.target?.closest?.('.sat-field-menu-wrap')) {
        document.querySelectorAll('#satellite .sat-field-menu.open')
          .forEach(menu => menu.classList.remove('open'));
      }
    });
    document.getElementById('satDrawStart')?.addEventListener('click',startDraw);
    document.getElementById('satDrawUndo')?.addEventListener('click',()=>{if(points.length){points.pop();markers.pop()?.remove();redraw();}});
    document.getElementById('satDrawFinish')?.addEventListener('click',finishDraw);
    document.getElementById('satDrawClear')?.addEventListener('click',clearDraw);
    document.getElementById('satNdviMapButton')?.addEventListener('click',()=>loadNdviOverlay().catch(fail));

    document.getElementById('satCompareToggle')?.addEventListener('click',()=>{
      const panel = document.getElementById('satComparePanel');
      const open = !panel?.classList.contains('open');
      panel?.classList.toggle('open', open);
      if (!open) clearComparison();
    });

    document.getElementById('satCompareRun')?.addEventListener('click',()=>runComparison().catch(fail));

    document.getElementById('satCompareBeforeRange')?.addEventListener('input',()=>{
      updateCompareTimeline('before');
    });

    document.getElementById('satCompareAfterRange')?.addEventListener('input',()=>{
      updateCompareTimeline('after');
    });

    document.getElementById('satCompareRevealRange')?.addEventListener('input',event=>{
      setComparePosition(
        event.target.value
      );
    });

    document.getElementById('satSaveField')?.addEventListener('click',()=>saveField().catch(fail));
    document.getElementById('satSync')?.addEventListener('click',()=>syncField().catch(fail));

    document.getElementById('satActiveFieldsTab')?.addEventListener('click',()=>{
      showArchivedFields = false;
      selectedFieldId = null;
      clearDraw();
      loadFields().catch(fail);
    });

    document.getElementById('satArchivedFieldsTab')?.addEventListener('click',()=>{
      showArchivedFields = true;
      selectedFieldId = null;
      clearDraw();
      loadFields().catch(fail);
    });

    document.getElementById('satSelectAllFields')?.addEventListener('click',()=>{
      const checks = [...document.querySelectorAll('#satelliteFieldList .sat-field-check')];
      const shouldCheck = checks.some(input => !input.checked);
      checks.forEach(input => { input.checked = shouldCheck; });
      updateBatchButtons();
    });

    document.getElementById('satBatchSync')?.addEventListener('click',()=>syncSelectedFields().catch(fail));
    document.getElementById('satFarmNdviShow')?.addEventListener('click',()=>loadFarmNdviMaps().catch(fail));
    document.getElementById('satFarmNdviHide')?.addEventListener('click',()=>{
      clearFarmNdviOverlays();
      document.getElementById('satNdviLegend')?.classList.remove('open');
      setStatus('Mapa NDVI de finca ocultado.', 'ok');
      updateBatchButtons();
    });
    document.getElementById('satSiteSelect')?.addEventListener('change',async()=>{
      const siteId =
        document.getElementById('satSiteSelect')?.value || '';

      if (siteId) {
        sessionStorage.setItem(
          'tayuSatelliteSiteId',
          siteId
        );
      }

      selectedFieldId = null;
      currentFields = [];
      fieldOverviewStates = new Map();

      clearDraw();
      clearFieldOverview();

      const listHost =
        document.getElementById('satelliteFieldList');

      if (listHost) {
        listHost.innerHTML =
          '<div class="hint">Cargando lotes de esta finca...</div>';
      }

      document.getElementById('satSync').disabled = true;
      document.getElementById('satNdviMapButton').disabled = true;
      document.getElementById('satCompareToggle').disabled = true;
      document.getElementById('satCompareRun').disabled = true;
      document.getElementById('satComparePanel').classList.remove('open');
      document.getElementById('satFieldCode').value = '';
      document.getElementById('satCropType').value = '';
      document.getElementById('satFieldName').value = '';

      renderObservations([]);
      centerSelectedSite();

      try {
        await loadFields();
      } catch (error) {
        if (listHost) {
          listHost.innerHTML =
            '<div class="hint">No se pudieron cargar los lotes de esta finca.</div>';
        }
        fail(error);
      }
    });
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