(() => {
  'use strict';

  let fleetPinned = false;
  let restoringFleet = false;
  let fleetMapExploring = false;

  function injectStyles() {
    if (document.getElementById('tayuNavigationFixStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuNavigationFixStyles';
    style.textContent = `
      .sidebar{
        display:flex;
        flex-direction:column;
        overflow:visible;
      }
      .sidebar .brand{
        flex:0 0 auto;
      }
      .sidebar .nav{
        flex:1 1 auto;
        min-height:0;
        overflow-y:auto;
        overflow-x:hidden;
        overscroll-behavior:contain;
        -webkit-overflow-scrolling:touch;
        scrollbar-width:none;
        -ms-overflow-style:none;
      }
      .sidebar .nav::-webkit-scrollbar{
        width:0;
        height:0;
        display:none;
      }
      #dispositivos .td-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
      #dispositivos .td-cloud-badge{padding:7px 11px;border-radius:999px;background:rgba(91,193,47,.11);border:1px solid rgba(91,193,47,.22);color:var(--brand);font-size:11px;font-weight:900;white-space:nowrap}
      #dispositivos .td-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}
      #dispositivos .td-kpi{background:var(--panel2);border:1px solid var(--border);border-radius:16px;padding:13px}
      #dispositivos .td-kpi span{display:block;color:var(--muted);font-size:11px;font-weight:850}
      #dispositivos .td-kpi b{display:block;font-size:25px;margin-top:5px}
      #dispositivos .td-toolbar{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:10px;align-items:end;margin-bottom:16px}
      #dispositivos .td-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
      #dispositivos .td-card{border:1px solid var(--border);border-radius:18px;padding:15px;background:var(--panel)}
      #dispositivos .td-card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      #dispositivos .td-card h3{margin:0;font-size:17px}
      #dispositivos .td-key{font-size:11px;color:var(--muted);margin-top:5px;word-break:break-all}
      #dispositivos .td-status{padding:6px 9px;border-radius:999px;font-size:11px;font-weight:900;background:rgba(239,68,68,.10);color:var(--danger);white-space:nowrap}
      #dispositivos .td-status.online{background:rgba(91,193,47,.12);color:var(--brand)}
      #dispositivos .td-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:13px}
      #dispositivos .td-meta div{background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:9px;min-width:0}
      #dispositivos .td-meta span{display:block;color:var(--muted);font-size:10px;font-weight:850;margin-bottom:4px}
      #dispositivos .td-meta b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #dispositivos .td-empty{grid-column:1/-1;padding:24px;text-align:center;border:1px dashed var(--border);border-radius:16px;color:var(--muted);background:var(--panel2)}
      @media(max-width:900px){#dispositivos .td-grid{grid-template-columns:1fr}#dispositivos .td-toolbar{grid-template-columns:1fr 1fr}}
      @media(max-width:600px){#dispositivos .td-summary,#dispositivos .td-toolbar,#dispositivos .td-meta{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function navButton(view) {
    return document.querySelector(`.nav button[data-view="${view}"]`);
  }

  function reorderNavigation() {
    const nav = document.querySelector('.nav');
    const fleet = document.getElementById('gpsGenericNavButton');
    if (!nav || !fleet) return false;

    const order = [
      navButton('dashboard'),
      navButton('alarmas'),
      navButton('fincas'),
      navButton('camaroneras'),
      navButton('bananeras'),
      navButton('ganaderia'),
      fleet,
      navButton('sensores'),
      navButton('dispositivos'),
      navButton('tramas'),
      navButton('modbus'),
      navButton('configuracion'),
      document.getElementById('clientAdminNavButton')
    ].filter(Boolean);

    order.forEach(button => nav.appendChild(button));
    return true;
  }

  function restoreFleetView() {
    if (!fleetPinned || restoringFleet) return;
    const fleetView = document.getElementById('gps-generic-view');
    const fleetButton = document.getElementById('gpsGenericNavButton');
    if (!fleetView || !fleetButton) return;

    restoringFleet = true;
    try {
      document.querySelectorAll('.view.active').forEach(view => {
        if (view !== fleetView) view.classList.remove('active');
      });
      document.querySelectorAll('.nav button.active').forEach(button => {
        if (button !== fleetButton) button.classList.remove('active');
      });
      fleetView.classList.add('active');
      fleetButton.classList.add('active');
      const title = document.getElementById('pageTitle');
      if (title) title.textContent = 'Flotas';
    } finally {
      restoringFleet = false;
    }
  }

  function watchActiveView() {
    const main = document.querySelector('main.main') || document.body;
    if (!main || main.dataset.tayuFleetViewWatcher === '1') return;
    main.dataset.tayuFleetViewWatcher = '1';

    const observer = new MutationObserver(() => {
      if (!fleetPinned || restoringFleet) return;
      const fleetView = document.getElementById('gps-generic-view');
      if (!fleetView?.classList.contains('active')) {
        queueMicrotask(restoreFleetView);
      }
    });
    observer.observe(main, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  function currentFleetGpsPosition() {
    const text = document.querySelector('#gpsCurrentLocation b')?.textContent || '';
    const match = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  function samePoint(a, b, tolerance = 0.00002) {
    return Boolean(
      a && b &&
      Math.abs(Number(a.lat) - Number(b.lat)) <= tolerance &&
      Math.abs(Number(a.lng) - Number(b.lng)) <= tolerance
    );
  }

  function patchLeafletFleetMap() {
    if (!window.L?.Map?.prototype) return false;
    const proto = window.L.Map.prototype;
    if (proto.__tayuFleetNavigationPatchedV2) return true;

    const originalSetView = proto.setView;
    proto.setView = function(center, zoom, options) {
      const isFleetMap = this.getContainer?.()?.id === 'gpsGenericMap';

      if (isFleetMap && fleetMapExploring) {
        let requested = null;
        try {
          requested = window.L.latLng(center);
        } catch (_) {}

        const gps = currentFleetGpsPosition();
        const noExplicitOptions = options === undefined || options === null;
        const isAutomaticGpsCenter = noExplicitOptions && Number(zoom) === 16 && samePoint(requested, gps);
        const ecuadorCenter = { lat: -1.8312, lng: -78.1834 };
        const isAutomaticFallback = noExplicitOptions && Number(zoom) === 6 && samePoint(requested, ecuadorCenter, 0.0002);

        if (isAutomaticGpsCenter || isAutomaticFallback) {
          return this;
        }
      }

      return originalSetView.call(this, center, zoom, options);
    };

    proto.__tayuFleetNavigationPatchedV2 = true;
    return true;
  }

  function markFleetMapExploringAfterInteraction(event) {
    if (!event.target?.closest?.('#gpsGenericMap')) return;
    setTimeout(() => {
      fleetMapExploring = true;
    }, 0);
  }

  function installInteractionGuards() {
    if (document.documentElement.dataset.tayuFleetInteractionGuardsV2 === '1') return;
    document.documentElement.dataset.tayuFleetInteractionGuardsV2 = '1';

    document.addEventListener('click', event => {
      const nav = event.target?.closest?.('.nav button');
      if (nav) {
        fleetPinned = nav.id === 'gpsGenericNavButton';
        if (fleetPinned) {
          fleetMapExploring = false;
          setTimeout(() => {
            reorderNavigation();
            restoreFleetView();
          }, 0);
        }
      }

      if (event.target?.closest?.('#gpsCurrentOnlyButton, #gpsHistoryButton')) {
        fleetMapExploring = false;
      }
    }, true);

    document.addEventListener('change', event => {
      if (event.target?.id === 'gpsGenericDeviceSelect') {
        fleetMapExploring = false;
      }
    }, true);

    document.addEventListener('pointerdown', markFleetMapExploringAfterInteraction, true);
    document.addEventListener('touchstart', markFleetMapExploringAfterInteraction, { capture: true, passive: true });
    document.addEventListener('wheel', markFleetMapExploringAfterInteraction, { capture: true, passive: true });
  }

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function assignedDevicesLatestMap() {
    const map = new Map();
    (Array.isArray(window.__tayuLastTelemetry) ? window.__tayuLastTelemetry : []).forEach(row => {
      if (!row?.device_key) return;
      const previous = map.get(row.device_key);
      if (!previous || new Date(row.time || 0) >= new Date(previous.time || 0)) map.set(row.device_key, row);
    });
    return map;
  }

  function assignedDeviceOnline(device, telemetry) {
    const state = String(device?.status || '').toLowerCase();
    if (state === 'online') return true;
    if (state === 'offline') return false;
    const time = new Date(telemetry?.time || 0).getTime();
    return Number.isFinite(time) && Date.now() - time < 90000;
  }

  function assignedDeviceLastSeen(telemetry) {
    if (!telemetry?.time) return 'Sin telemetría';
    const time = new Date(telemetry.time);
    if (Number.isNaN(time.getTime())) return 'Sin telemetría';
    const age = Math.max(0, Date.now() - time.getTime());
    if (age < 60000) return `Hace ${Math.max(1, Math.round(age / 1000))} s`;
    if (age < 3600000) return `Hace ${Math.round(age / 60000)} min`;
    if (age < 86400000) return `Hace ${Math.round(age / 3600000)} h`;
    return time.toLocaleString('es-EC');
  }

  function ensureAssignedDevicesView() {
    const view = document.getElementById('dispositivos');
    if (!view || view.dataset.tayuAssignedDevicesView === '1') return view;
    view.dataset.tayuAssignedDevicesView = '1';
    view.innerHTML = `
      <div class="card">
        <div class="td-head">
          <div>
            <h3 style="margin:0">Mis dispositivos</h3>
            <p class="hint" style="margin:6px 0 0">Equipos asignados a tu organización desde Cloud Admin. El alta, aprovisionamiento y asignación se realizan desde administración central.</p>
          </div>
          <span class="td-cloud-badge">● Gestionados desde Cloud Admin</span>
        </div>
        <div class="td-summary">
          <div class="td-kpi"><span>Total asignados</span><b id="tdTotal">0</b></div>
          <div class="td-kpi"><span>Online</span><b id="tdOnline">0</b></div>
          <div class="td-kpi"><span>Offline</span><b id="tdOffline">0</b></div>
        </div>
        <div class="td-toolbar">
          <div><label>Buscar</label><input id="tdSearch" placeholder="Nombre, device key, perfil, sitio..."></div>
          <div><label>Tipo / perfil</label><select id="tdType"><option value="all">Todos</option></select></div>
          <div><label>Estado</label><select id="tdStatus"><option value="all">Todos</option><option value="online">Online</option><option value="offline">Offline</option></select></div>
          <button class="btn ghost" id="tdRefresh">Actualizar</button>
        </div>
        <div class="td-grid" id="tdGrid"></div>
      </div>`;

    view.querySelector('#tdSearch')?.addEventListener('input', renderAssignedDevices);
    view.querySelector('#tdType')?.addEventListener('change', renderAssignedDevices);
    view.querySelector('#tdStatus')?.addEventListener('change', renderAssignedDevices);
    view.querySelector('#tdRefresh')?.addEventListener('click', async () => {
      try { await window.refreshRealData?.(); } catch (_) {}
      renderAssignedDevices();
    });
    return view;
  }

  function renderAssignedDevices() {
    ensureAssignedDevicesView();
    const grid = document.getElementById('tdGrid');
    if (!grid) return;

    const devices = Array.isArray(window.__tayuRealDevices) ? window.__tayuRealDevices : [];
    const latest = assignedDevicesLatestMap();
    const rows = devices.map(device => {
      const telemetry = latest.get(device.device_key);
      const payload = telemetry?.payload || {};
      return {
        device,
        telemetry,
        online: assignedDeviceOnline(device, telemetry),
        profile: device.profile_name || device.device_type || 'Dispositivo IoT',
        site: device.site_name || device.site?.name || payload.site_name || payload.farm || payload.finca || 'Sin sitio asignado',
        zone: payload.zone || payload.zona || payload.pond || payload.piscina || 'Sin zona'
      };
    });

    const total = document.getElementById('tdTotal');
    const online = document.getElementById('tdOnline');
    const offline = document.getElementById('tdOffline');
    if (total) total.textContent = String(rows.length);
    if (online) online.textContent = String(rows.filter(row => row.online).length);
    if (offline) offline.textContent = String(rows.filter(row => !row.online).length);

    const typeSelect = document.getElementById('tdType');
    const previousType = typeSelect?.value || 'all';
    const profiles = [...new Set(rows.map(row => row.profile))].sort((a,b) => a.localeCompare(b));
    if (typeSelect) {
      typeSelect.innerHTML = '<option value="all">Todos</option>' + profiles.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      if (previousType === 'all' || profiles.includes(previousType)) typeSelect.value = previousType;
    }

    const query = String(document.getElementById('tdSearch')?.value || '').trim().toLowerCase();
    const typeFilter = typeSelect?.value || 'all';
    const statusFilter = document.getElementById('tdStatus')?.value || 'all';

    const filtered = rows.filter(row => {
      if (typeFilter !== 'all' && row.profile !== typeFilter) return false;
      if (statusFilter === 'online' && !row.online) return false;
      if (statusFilter === 'offline' && row.online) return false;
      if (!query) return true;
      return [row.device.name,row.device.device_key,row.profile,row.site,row.zone,row.device.organization_name]
        .join(' ').toLowerCase().includes(query);
    });

    if (!filtered.length) {
      grid.innerHTML = '<div class="td-empty">No hay dispositivos asignados que coincidan con los filtros.</div>';
      return;
    }

    grid.innerHTML = filtered.map(row => {
      const capabilities = row.device.capabilities || {};
      const connectivity = [...(capabilities.connectivity || []), ...(capabilities.protocols || [])]
        .map(item => typeof item === 'string' ? item : item?.type)
        .filter(Boolean);
      return `<article class="td-card">
        <div class="td-card-head">
          <div><h3>${escapeHtml(row.device.name || row.device.device_key)}</h3><div class="td-key">${escapeHtml(row.device.device_key)}</div></div>
          <span class="td-status ${row.online ? 'online' : ''}">${row.online ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
        <div class="td-meta">
          <div><span>Tipo / perfil</span><b title="${escapeHtml(row.profile)}">${escapeHtml(row.profile)}</b></div>
          <div><span>Sitio</span><b title="${escapeHtml(row.site)}">${escapeHtml(row.site)}</b></div>
          <div><span>Zona</span><b title="${escapeHtml(row.zone)}">${escapeHtml(row.zone)}</b></div>
          <div><span>Última comunicación</span><b>${escapeHtml(assignedDeviceLastSeen(row.telemetry))}</b></div>
          <div><span>Conectividad</span><b title="${escapeHtml(connectivity.join(' · '))}">${escapeHtml(connectivity.join(' · ') || '—')}</b></div>
          <div><span>Organización</span><b>${escapeHtml(row.device.organization_name || 'Mi organización')}</b></div>
        </div>
      </article>`;
    }).join('');
  }

  function installAssignedDevicesView() {
    ensureAssignedDevicesView();
    renderAssignedDevices();

    const button = navButton('dispositivos');
    if (button && button.dataset.tayuAssignedDevicesBound !== '1') {
      button.dataset.tayuAssignedDevicesBound = '1';
      button.addEventListener('click', () => setTimeout(renderAssignedDevices, 0));
    }

    if (!window.__tayuAssignedDevicesRefreshTimer) {
      window.__tayuAssignedDevicesRefreshTimer = setInterval(() => {
        if (document.getElementById('dispositivos')?.classList.contains('active')) renderAssignedDevices();
      }, 5000);
    }
  }

  function boot() {
    injectStyles();
    installInteractionGuards();
    watchActiveView();
    installAssignedDevicesView();

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const navReady = reorderNavigation();
      const leafletReady = patchLeafletFleetMap();
      installAssignedDevicesView();
      if ((navReady && leafletReady) || attempts >= 120) clearInterval(timer);
    }, 100);

    fleetPinned = Boolean(document.getElementById('gps-generic-view')?.classList.contains('active'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
