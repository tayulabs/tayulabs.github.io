(() => {
  'use strict';

  const VERSION = '20260916-lora-widget1';
  const TYPE = 'loraNetwork';
  if (window.__tayuLoRaWidget?.version === VERSION) return;

  const state = { rows: null };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  const devices = () => Array.isArray(window.__tayuRealDevices) ? window.__tayuRealDevices : [];
  const globalRows = () => Array.isArray(window.__tayuLastTelemetry) ? window.__tayuLastTelemetry : [];

  function payloadObject(row) {
    const value = row?.payload;
    if (value && typeof value === 'object') return value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (_) {}
    }
    return {};
  }

  function roleFor(device) {
    const saved = String(device?.configuration?.communication?.role || '').trim();
    if (saved) return saved;
    const profile = String(device?.profile_key || device?.device_type || '').trim().toLowerCase();
    if (profile === 'rak11300_lora_node' || profile === 'rak11300_node') return 'lora_node';
    return 'standalone';
  }

  function loraNodes() {
    return devices().filter(device => roleFor(device) === 'lora_node');
  }

  function latestMap(rows) {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const key = String(row?.device_key || '').trim();
      if (!key) return;
      const previous = map.get(key);
      const current = new Date(row?.time || row?.received_at || 0).getTime();
      const old = new Date(previous?.time || previous?.received_at || 0).getTime();
      if (!previous || current >= old) map.set(key, row);
    });
    return map;
  }

  function number(value, digits = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits) : '—';
  }

  function ageMs(row) {
    const time = new Date(row?.time || row?.received_at || 0).getTime();
    return Number.isFinite(time) && time > 0 ? Math.max(0, Date.now() - time) : Infinity;
  }

  function snapshot(device, row) {
    const payload = payloadObject(row);
    const comm = device?.configuration?.communication || {};
    const gateway = String(
      payload?.lora?.gateway_device_key ||
      payload?.gateway?.device_key ||
      comm.gateway_device_key ||
      comm.parent_gateway_device_key ||
      '—'
    );
    // Los nodos reportan cada pocos segundos. Para la vista del widget usamos
    // la frescura de la telemetría real y no el estado MQTT directo del nodo.
    const online = Boolean(row) && payload.online !== false && ageMs(row) <= 45000;
    return { payload, gateway, online };
  }

  function injectStyles() {
    if (document.getElementById('tayuLoraWidgetStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuLoraWidgetStyles';
    style.textContent = `
      [data-tayu-lora-dashboard]{display:none!important}
      .tayu-lora-widget-note{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
      .tayu-lora-widget-note .hint{margin:0}
      .tayu-lora-widget-refresh{padding:7px 10px!important;border-radius:10px!important;font-size:10px!important}
      .tayu-lora-widget-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .tayu-lora-widget-node{border:1px solid var(--border);border-radius:15px;background:var(--panel2);padding:12px;cursor:pointer;transition:.15s}
      .tayu-lora-widget-node:hover{border-color:rgba(91,193,47,.5);transform:translateY(-1px)}
      .tayu-lora-widget-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
      .tayu-lora-widget-head h4{margin:0;font-size:14px}.tayu-lora-widget-sub{margin-top:3px;color:var(--muted);font-size:9px}
      .tayu-lora-widget-status{padding:5px 8px;border-radius:999px;font-size:9px;font-weight:900;background:rgba(239,68,68,.10);color:var(--danger)}
      .tayu-lora-widget-status.online{background:rgba(91,193,47,.12);color:var(--brand)}
      .tayu-lora-widget-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:9px}
      .tayu-lora-widget-metrics div{border:1px solid var(--border);background:var(--panel);border-radius:10px;padding:8px;min-width:0}
      .tayu-lora-widget-metrics span{display:block;font-size:8px;color:var(--muted);font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tayu-lora-widget-metrics b{display:block;margin-top:3px;font-size:13px;white-space:nowrap}
      .tayu-lora-widget-empty{padding:18px;border:1px dashed var(--border);border-radius:13px;color:var(--muted);font-size:11px;text-align:center}
      @media(max-width:760px){.tayu-lora-widget-grid{grid-template-columns:1fr}.tayu-lora-widget-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function nodeMarkup(device, row) {
    const s = snapshot(device, row);
    return `
      <article class="tayu-lora-widget-node" data-lora-widget-node="${esc(device.device_key)}">
        <div class="tayu-lora-widget-head">
          <div><h4>${esc(device.name || device.device_key)}</h4><div class="tayu-lora-widget-sub">${esc(device.device_key)} · vía ${esc(s.gateway)}</div></div>
          <span class="tayu-lora-widget-status ${s.online ? 'online' : ''}">${s.online ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
        <div class="tayu-lora-widget-metrics">
          <div><span>Temperatura</span><b>${esc(number(s.payload.temperature, 1))} °C</b></div>
          <div><span>Humedad</span><b>${esc(number(s.payload.humidity, 0))} %</b></div>
          <div><span>RSSI</span><b>${esc(number(s.payload?.link?.rssi, 0))} dBm</b></div>
          <div><span>SNR</span><b>${esc(number(s.payload?.link?.snr, 1))} dB</b></div>
        </div>
      </article>`;
  }

  function widgetBodyMarkup() {
    const nodes = loraNodes();
    if (!nodes.length) return '<div class="tayu-lora-widget-empty">No hay nodos LoRa asociados en esta organización.</div>';
    const rows = Array.isArray(state.rows) ? state.rows : globalRows();
    const map = latestMap(rows);
    return `
      <div class="tayu-lora-widget-note">
        <p class="hint">Estado actual de los nodos LoRa P2P. Selecciona uno para abrir detalle e histórico.</p>
        <button type="button" class="btn ghost tayu-lora-widget-refresh" data-lora-widget-refresh>Actualizar</button>
      </div>
      <div class="tayu-lora-widget-grid">${nodes.map(device => nodeMarkup(device, map.get(String(device.device_key)))).join('')}</div>`;
  }

  function renderBodies() {
    document.querySelectorAll(`.dashboard-widget[data-widget-type="${TYPE}"] .widget-live-body`).forEach(body => {
      body.innerHTML = widgetBodyMarkup();
    });
  }

  function removeLegacyBlock() {
    document.querySelectorAll('[data-tayu-lora-dashboard]').forEach(element => element.remove());
  }

  async function refreshWidget(button) {
    const oldText = button?.textContent || 'Actualizar';
    if (button) { button.disabled = true; button.textContent = 'Actualizando…'; }
    try {
      if (typeof window.__tayuApi === 'function') {
        const rows = await window.__tayuApi('/telemetry/latest');
        state.rows = Array.isArray(rows) ? rows : [];
      }
      renderBodies();
    } catch (error) {
      console.warn('LoRa dashboard widget refresh:', error);
      if (button) button.textContent = 'Error · reintentar';
      return;
    } finally {
      if (button) setTimeout(() => { button.disabled = false; button.textContent = oldText; }, 450);
    }
  }

  function installWidgetIntegration() {
    injectStyles();
    removeLegacyBlock();

    try {
      if (typeof widgetCatalog === 'object' && widgetCatalog) {
        widgetCatalog[TYPE] = { title:'Red LoRa P2P', icon:'📡', fixed:false, size:'wide' };
      }
    } catch (error) {
      console.warn('LoRa widget catalog:', error);
      return false;
    }

    if (!window.__tayuLoRaWidgetWrappedCompatible) {
      const previousCompatible = window.getCompatibleAssetsForWidget;
      window.getCompatibleAssetsForWidget = function(type) {
        if (type === TYPE) {
          return loraNodes().map(device => ({
            id: device.device_key,
            uuid: device.device_key,
            name: device.name || device.device_key,
            farm: device.site_name || 'LoRa P2P',
            zone: device.site_sector || ''
          }));
        }
        return previousCompatible ? previousCompatible(type) : [];
      };
      window.__tayuLoRaWidgetWrappedCompatible = true;
    }

    if (!window.__tayuLoRaWidgetWrappedBody) {
      const previousBody = window.widgetBody;
      window.widgetBody = function(type, instanceId) {
        if (type === TYPE) return widgetBodyMarkup(instanceId);
        return previousBody ? previousBody(type, instanceId) : '';
      };
      window.__tayuLoRaWidgetWrappedBody = true;
    }

    if (!window.__tayuLoRaWidgetWrappedAdd) {
      const previousAdd = window.addDashboardWidget;
      window.addDashboardWidget = function(type) {
        if (type !== TYPE) return previousAdd ? previousAdd(type) : undefined;
        const ids = Array.isArray(window.dashboardWidgetIds) ? window.dashboardWidgetIds : [];
        if (ids.some(id => String(id).split('::')[0] === TYPE)) {
          alert('El widget Red LoRa P2P ya está agregado al Dashboard.');
          document.getElementById('widgetModal')?.classList.remove('open');
          return;
        }
        const instanceId = typeof window.newWidgetInstance === 'function'
          ? window.newWidgetInstance(TYPE)
          : `${TYPE}::${Date.now()}`;
        ids.push(instanceId);
        if (!Array.isArray(window.dashboardWidgetIds)) window.dashboardWidgetIds = ids;
        window.saveWidgetLayout?.();
        window.renderDashboardWidgets?.();
        window.renderWidgetLibrary?.();
        document.getElementById('widgetModal')?.classList.remove('open');
        setTimeout(renderBodies, 30);
      };
      window.__tayuLoRaWidgetWrappedAdd = true;
    }

    // La versión anterior insertaba una tarjeta fija encima del Dashboard.
    // Observamos únicamente los hijos directos de la vista para retirarla si
    // el módulo antiguo intenta recrearla; no observamos telemetría ni widgets.
    const dashboard = document.getElementById('dashboard');
    if (dashboard && !dashboard.dataset.tayuLoraWidgetGuard) {
      dashboard.dataset.tayuLoraWidgetGuard = '1';
      new MutationObserver(removeLegacyBlock).observe(dashboard, { childList:true });
    }

    window.renderWidgetLibrary?.();
    window.renderDashboardWidgets?.();
    setTimeout(renderBodies, 60);
    return true;
  }

  document.addEventListener('click', event => {
    const node = event.target?.closest?.('[data-lora-widget-node]');
    if (node) {
      event.preventDefault();
      const key = node.dataset.loraWidgetNode;
      window.__tayuLoRaNodeLive?.open?.(key);
      return;
    }

    const refresh = event.target?.closest?.('[data-lora-widget-refresh]');
    if (refresh) {
      event.preventDefault();
      refreshWidget(refresh);
      return;
    }

    if (event.target?.closest?.('.nav button[data-view="dashboard"]')) {
      setTimeout(() => { removeLegacyBlock(); renderBodies(); }, 120);
    }
  }, true);

  function boot() {
    let attempts = 0;
    const run = () => {
      attempts += 1;
      if (installWidgetIntegration() || attempts >= 40) return;
      setTimeout(run, 100);
    };
    run();
  }

  window.addEventListener('tayu:client-access-ready', () => setTimeout(boot, 0), { once:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();

  window.__tayuLoRaWidget = {
    version: VERSION,
    render: renderBodies,
    refresh: () => refreshWidget(null)
  };
})();
