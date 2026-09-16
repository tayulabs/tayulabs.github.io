(() => {
  'use strict';

  const VERSION = '20260916-lora-node-modal2';
  if (window.__tayuLoRaNodeLive?.version === VERSION) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  const state = {
    deviceKey: '',
    latestRows: null,
    historyMinutes: 360,
    charts: [],
    observer: null,
    dashboardRows: null
  };

  const devices = () => Array.isArray(window.__tayuRealDevices) ? window.__tayuRealDevices : [];
  const globalLatestRows = () => Array.isArray(window.__tayuLastTelemetry) ? window.__tayuLastTelemetry : [];

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
    if (profile === 'nova_edge_pro_minigateway' || profile === 'nova_edge_pro_mini_gateway') return 'lora_mini_gateway';
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
      const currentTime = new Date(row?.time || row?.received_at || 0).getTime();
      const previousTime = new Date(previous?.time || previous?.received_at || 0).getTime();
      if (!previous || currentTime >= previousTime) map.set(key, row);
    });
    return map;
  }

  function formatNumber(value, digits = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : '—';
  }

  function ageLabel(value) {
    const time = new Date(value || 0).getTime();
    if (!Number.isFinite(time) || time <= 0) return 'Sin lectura';
    const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (seconds < 5) return 'Ahora';
    if (seconds < 60) return `Hace ${seconds} s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `Hace ${hours} h`;
    return new Date(time).toLocaleString();
  }

  function injectStyles() {
    if (document.getElementById('tayuLoraNodeLiveStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuLoraNodeLiveStyles';
    style.textContent = `
      .tayu-lora-node-open{white-space:nowrap}
      .td-card.tayu-lora-clickable{cursor:pointer}
      .td-card.tayu-lora-clickable:hover{border-color:rgba(91,193,47,.45)}
      .tayu-lora-node-inline-removed{display:none!important}

      .tayu-lora-modal{display:none;position:fixed;inset:0;z-index:2147483300;background:rgba(0,0,0,.48);padding:20px;align-items:center;justify-content:center}
      .tayu-lora-modal.open{display:flex}
      .tayu-lora-modal-card{width:min(820px,100%);max-height:88vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:22px;box-shadow:var(--shadow);padding:18px}
      .tayu-lora-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;position:sticky;top:-18px;background:var(--panel);padding:4px 0 12px;z-index:3}
      .tayu-lora-modal-title{margin:0;font-size:21px}.tayu-lora-modal-sub{margin-top:5px;font-size:11px;color:var(--muted)}
      .tayu-lora-close{border:0;background:transparent;color:var(--text);font-size:28px;line-height:1;cursor:pointer;padding:2px 6px}
      .tayu-lora-status{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;font-size:10px;font-weight:900;background:rgba(239,68,68,.10);color:var(--danger)}
      .tayu-lora-status.online{background:rgba(91,193,47,.12);color:var(--brand)}
      .tayu-lora-status.waiting{background:rgba(245,158,11,.12);color:var(--warning)}
      .tayu-lora-topline{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:11px}
      .tayu-lora-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
      .tayu-lora-metric{border:1px solid var(--border);border-radius:13px;background:var(--panel2);padding:11px}
      .tayu-lora-metric span{display:block;color:var(--muted);font-size:9px;font-weight:850;margin-bottom:5px}.tayu-lora-metric b{font-size:18px;color:var(--text)}
      .tayu-lora-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:10px}
      .tayu-lora-box{border:1px solid var(--border);border-radius:13px;background:var(--panel2);padding:11px;font-size:11px;line-height:1.65;color:var(--muted)}.tayu-lora-box strong{color:var(--text)}
      .tayu-lora-gps{margin-top:10px;border:1px solid var(--border);border-radius:13px;background:var(--panel2);padding:11px;font-size:11px;line-height:1.6;color:var(--muted)}.tayu-lora-gps strong{color:var(--text)}
      .tayu-lora-history{margin-top:13px;border-top:1px solid var(--border);padding-top:13px}
      .tayu-lora-history-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.tayu-lora-history-head h4{margin:0;font-size:14px}
      .tayu-lora-history-controls{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.tayu-lora-history-controls button{padding:7px 9px;border-radius:9px;font-size:10px}
      .tayu-lora-history-controls button.active{background:var(--brand);color:#fff;border-color:var(--brand)}
      .tayu-lora-charts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.tayu-lora-chart{height:220px;border:1px solid var(--border);border-radius:13px;background:var(--panel2);padding:10px;position:relative}.tayu-lora-chart h5{margin:0 0 5px;font-size:11px}.tayu-lora-chart canvas{max-height:180px}
      .tayu-lora-history-note{font-size:10px;color:var(--muted);margin-top:8px;min-height:15px}
      .tayu-lora-modal-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:12px}.tayu-lora-modal-actions .btn{padding:8px 11px;border-radius:10px;font-size:11px}

      .tayu-lora-dashboard{margin:0 0 18px}.tayu-lora-dashboard-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.tayu-lora-dashboard-head h3{margin:0}.tayu-lora-dashboard-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
      .tayu-lora-dashboard-node{border:1px solid var(--border);border-radius:16px;background:var(--panel2);padding:12px;cursor:pointer}.tayu-lora-dashboard-node:hover{border-color:rgba(91,193,47,.45)}
      .tayu-lora-dashboard-node-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.tayu-lora-dashboard-node h4{margin:0;font-size:14px}.tayu-lora-dashboard-key{font-size:10px;color:var(--muted);margin-top:3px}
      .tayu-lora-dashboard-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:9px}.tayu-lora-dashboard-metrics div{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:8px}.tayu-lora-dashboard-metrics span{display:block;font-size:8px;color:var(--muted);font-weight:850}.tayu-lora-dashboard-metrics b{display:block;margin-top:3px;font-size:13px}
      .tayu-lora-dashboard-empty{margin-top:10px;padding:14px;border:1px dashed var(--border);border-radius:12px;color:var(--muted);font-size:11px;text-align:center}

      @media(max-width:760px){
        .tayu-lora-modal{padding:8px;align-items:flex-start;padding-top:48px}.tayu-lora-modal-card{max-height:84vh;padding:14px;border-radius:18px}
        .tayu-lora-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.tayu-lora-detail-grid,.tayu-lora-charts,.tayu-lora-dashboard-grid{grid-template-columns:1fr}
        .tayu-lora-dashboard-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
    `;
    document.head.appendChild(style);
  }

  function radioFor(device, payload) {
    const configured = device?.configuration?.communication?.lora || {};
    return {
      frequency_mhz: configured.frequency_mhz ?? 915,
      tx_power_dbm: configured.tx_power_dbm ?? 20,
      spreading_factor: configured.spreading_factor ?? 9,
      bandwidth_khz: configured.bandwidth_khz ?? 125,
      coding_rate: configured.coding_rate ?? '4/5'
    };
  }

  function rowFor(deviceKey, rows = null) {
    const source = Array.isArray(rows) ? rows : (Array.isArray(state.latestRows) ? state.latestRows : globalLatestRows());
    return latestMap(source).get(String(deviceKey)) || null;
  }

  function nodeSnapshot(device, row) {
    const payload = payloadObject(row);
    const comm = device?.configuration?.communication || {};
    const radio = radioFor(device, payload);
    const hasRow = Boolean(row);
    const online = hasRow && payload.online !== false && String(device?.status || '').toLowerCase() !== 'offline';
    const waiting = !hasRow;
    const gateway = String(payload?.lora?.gateway_device_key || payload?.gateway?.device_key || comm.gateway_device_key || comm.parent_gateway_device_key || '—');
    const nodeId = String(payload?.lora?.node_id || payload?.node_id || comm.node_id || device?.device_key || '—');
    const gps = payload?.gps && typeof payload.gps === 'object' ? payload.gps : {};
    const last = row?.time || row?.received_at || device?.last_seen_at;
    return { device, row, payload, comm, radio, online, waiting, gateway, nodeId, gps, last };
  }

  function gpsMarkup(snapshot) {
    const { gps, comm } = snapshot;
    if (gps.valid === true) {
      return `<strong>GPS válido</strong><br>Latitud: ${esc(formatNumber(gps.lat ?? gps.latitude, 6))} · Longitud: ${esc(formatNumber(gps.lon ?? gps.lng ?? gps.longitude, 6))}<br>Satélites: ${esc(gps.satellites ?? gps.sats ?? '—')} · HDOP: ${esc(gps.hdop ?? '—')} · Altitud: ${esc(gps.altitude ?? gps.alt ?? '—')} m · Velocidad: ${esc(gps.speed ?? gps.speed_kmh ?? '—')}`;
    }
    return `<strong>GPS</strong><br>Sin posición válida${comm?.gps?.enabled ? ' · esperando fix' : ''}`;
  }

  function modalBodyMarkup(snapshot) {
    const { device, payload, radio, online, waiting, gateway, nodeId, last } = snapshot;
    return `
      <div class="tayu-lora-modal-head">
        <div><h3 class="tayu-lora-modal-title">${esc(device?.name || device?.device_key)}</h3><div class="tayu-lora-modal-sub">${esc(device?.device_key)} · RAK11300 LoRa Node</div></div>
        <button type="button" class="tayu-lora-close" data-lora-close aria-label="Cerrar">×</button>
      </div>
      <div class="tayu-lora-topline"><div class="tayu-lora-modal-sub">${esc(nodeId)} · vía ${esc(gateway)} · ${esc(ageLabel(last))}</div><span class="tayu-lora-status ${online ? 'online' : waiting ? 'waiting' : ''}">${online ? '● ONLINE' : waiting ? '● ESPERANDO DATOS' : '● OFFLINE'}</span></div>
      <div class="tayu-lora-metrics">
        <div class="tayu-lora-metric"><span>Temperatura</span><b>${esc(formatNumber(payload.temperature, 1))} °C</b></div>
        <div class="tayu-lora-metric"><span>Humedad</span><b>${esc(formatNumber(payload.humidity, 0))} %</b></div>
        <div class="tayu-lora-metric"><span>RSSI</span><b>${esc(formatNumber(payload?.link?.rssi, 0))} dBm</b></div>
        <div class="tayu-lora-metric"><span>SNR</span><b>${esc(formatNumber(payload?.link?.snr, 1))} dB</b></div>
      </div>
      <div class="tayu-lora-detail-grid">
        <div class="tayu-lora-box"><strong>Comunicación</strong><br>Protocolo: LoRa P2P<br>Mini Gateway: ${esc(gateway)}<br>Node ID: ${esc(nodeId)}<br>Frecuencia: ${esc(formatNumber(radio.frequency_mhz, 0))} MHz · SF${esc(radio.spreading_factor)} · BW ${esc(formatNumber(radio.bandwidth_khz, 0))} kHz · CR ${esc(radio.coding_rate)}</div>
        <div class="tayu-lora-box"><strong>Estado del enlace</strong><br>Paquetes recibidos: ${esc(payload.packets_received ?? '—')}<br>Paquetes perdidos: ${esc(payload.packets_lost ?? '—')}<br>Contador: ${esc(payload.packet_counter ?? '—')}<br>Último paquete: ${esc(ageLabel(last))}</div>
      </div>
      <div class="tayu-lora-gps">${gpsMarkup(snapshot)}</div>
      <div class="tayu-lora-history">
        <div class="tayu-lora-history-head"><h4>Histórico del nodo</h4><div class="tayu-lora-history-controls"><button type="button" class="btn ghost" data-lora-range="60">1 h</button><button type="button" class="btn ghost active" data-lora-range="360">6 h</button><button type="button" class="btn ghost" data-lora-range="1440">24 h</button></div></div>
        <div class="tayu-lora-charts"><div class="tayu-lora-chart"><h5>Temperatura / Humedad</h5><canvas id="tayuLoraEnvChart"></canvas></div><div class="tayu-lora-chart"><h5>RSSI / SNR</h5><canvas id="tayuLoraLinkChart"></canvas></div></div>
        <div id="tayuLoraHistoryNote" class="tayu-lora-history-note">Cargando histórico…</div>
      </div>
      <div class="tayu-lora-modal-actions"><button type="button" class="btn ghost" data-lora-refresh-modal>Actualizar</button></div>
    `;
  }

  function ensureModal() {
    injectStyles();
    let modal = document.getElementById('tayuLoraNodeModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'tayuLoraNodeModal';
    modal.className = 'tayu-lora-modal';
    modal.innerHTML = '<div class="tayu-lora-modal-card"><div id="tayuLoraNodeModalBody"></div></div>';
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    document.body.appendChild(modal);
    return modal;
  }

  function destroyCharts() {
    state.charts.forEach(chart => { try { chart?.destroy?.(); } catch (_) {} });
    state.charts = [];
  }

  function closeModal() {
    destroyCharts();
    state.deviceKey = '';
    document.getElementById('tayuLoraNodeModal')?.classList.remove('open');
  }

  function chartRows(history) {
    return (Array.isArray(history) ? history : [])
      .map(row => ({ row, time: new Date(row?.time || row?.received_at || 0) }))
      .filter(item => Number.isFinite(item.time.getTime()))
      .sort((a, b) => a.time - b.time);
  }

  function numeric(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function renderHistory(history) {
    destroyCharts();
    const note = document.getElementById('tayuLoraHistoryNote');
    const rows = chartRows(history);
    if (!rows.length) {
      if (note) note.textContent = 'No hay registros en el intervalo seleccionado.';
      return;
    }
    if (typeof window.Chart !== 'function') {
      if (note) note.textContent = 'Chart.js no está disponible en esta sesión.';
      return;
    }

    const labels = rows.map(item => item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const envCanvas = document.getElementById('tayuLoraEnvChart');
    const linkCanvas = document.getElementById('tayuLoraLinkChart');
    if (!envCanvas || !linkCanvas) return;

    const envChart = new window.Chart(envCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Temperatura °C', data: rows.map(item => numeric(payloadObject(item.row).temperature)), tension: .25, pointRadius: 0, spanGaps: true },
          { label: 'Humedad %', data: rows.map(item => numeric(payloadObject(item.row).humidity)), tension: .25, pointRadius: 0, spanGaps: true }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 9 } } } }, scales: { x: { ticks: { maxTicksLimit: 6, font: { size: 8 } } }, y: { ticks: { font: { size: 8 } } } } }
    });

    const linkChart = new window.Chart(linkCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'RSSI dBm', data: rows.map(item => numeric(payloadObject(item.row)?.link?.rssi)), tension: .25, pointRadius: 0, spanGaps: true },
          { label: 'SNR dB', data: rows.map(item => numeric(payloadObject(item.row)?.link?.snr)), tension: .25, pointRadius: 0, spanGaps: true }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 9 } } } }, scales: { x: { ticks: { maxTicksLimit: 6, font: { size: 8 } } }, y: { ticks: { font: { size: 8 } } } } }
    });

    state.charts.push(envChart, linkChart);
    if (note) note.textContent = `${rows.length} lecturas · últimos ${state.historyMinutes === 60 ? '60 min' : state.historyMinutes === 360 ? '6 h' : '24 h'}.`;
  }

  async function loadHistory(deviceKey, minutes) {
    const note = document.getElementById('tayuLoraHistoryNote');
    if (note) note.textContent = 'Cargando histórico…';
    if (typeof window.__tayuApi !== 'function') {
      if (note) note.textContent = 'API no disponible.';
      return;
    }
    try {
      const rows = await window.__tayuApi(`/telemetry/history?device_key=${encodeURIComponent(deviceKey)}&minutes=${Number(minutes) || 360}`);
      renderHistory(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.warn('LoRa node history:', error);
      if (note) note.textContent = 'No se pudo cargar el histórico.';
    }
  }

  function renderModal(deviceKey, rows = null) {
    const device = devices().find(item => String(item?.device_key) === String(deviceKey));
    if (!device || roleFor(device) !== 'lora_node') return false;
    const modal = ensureModal();
    const body = document.getElementById('tayuLoraNodeModalBody');
    const row = rowFor(deviceKey, rows);
    body.innerHTML = modalBodyMarkup(nodeSnapshot(device, row));
    modal.classList.add('open');
    body.querySelectorAll('[data-lora-range]').forEach(button => button.classList.toggle('active', Number(button.dataset.loraRange) === state.historyMinutes));
    return true;
  }

  async function openNode(deviceKey) {
    state.deviceKey = String(deviceKey || '');
    state.historyMinutes = 360;
    renderModal(state.deviceKey);
    loadHistory(state.deviceKey, state.historyMinutes);

    if (typeof window.__tayuApi !== 'function') return;
    try {
      const rows = await window.__tayuApi('/telemetry/latest');
      state.latestRows = Array.isArray(rows) ? rows : [];
      if (state.deviceKey === String(deviceKey)) renderModal(state.deviceKey, state.latestRows);
    } catch (error) {
      console.warn('LoRa latest telemetry:', error);
    }
  }

  async function refreshOpenNode(button = null) {
    if (!state.deviceKey || typeof window.__tayuApi !== 'function') return;
    const old = button?.textContent || 'Actualizar';
    if (button) { button.disabled = true; button.textContent = 'Actualizando…'; }
    try {
      const rows = await window.__tayuApi('/telemetry/latest');
      state.latestRows = Array.isArray(rows) ? rows : [];
      renderModal(state.deviceKey, state.latestRows);
      await loadHistory(state.deviceKey, state.historyMinutes);
      renderDashboard(state.latestRows);
    } catch (error) {
      console.warn('LoRa refresh:', error);
    } finally {
      if (button) { button.disabled = false; button.textContent = old; }
    }
  }

  function ensureCardButton(card, deviceKey) {
    card.querySelectorAll('.tayu-lora-node-live').forEach(panel => panel.remove());
    card.classList.add('tayu-lora-clickable');
    card.dataset.loraNodeKey = deviceKey;

    let button = card.querySelector('[data-lora-node-open]');
    if (button) return button;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn ghost tayu-lora-node-open';
    button.dataset.loraNodeOpen = deviceKey;
    button.textContent = '📡 Ver datos';

    const footer = card.querySelector('.td-iot-footer');
    if (footer) footer.appendChild(button);
    else {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;justify-content:flex-end;margin-top:10px';
      wrap.appendChild(button);
      card.appendChild(wrap);
    }
    return button;
  }

  function decorateCards() {
    injectStyles();
    const allDevices = devices();
    document.querySelectorAll('#tdGrid .td-card').forEach(card => {
      const key = card.querySelector('.td-key')?.textContent?.trim();
      if (!key) return;
      const device = allDevices.find(row => String(row?.device_key) === key);
      if (!device || roleFor(device) !== 'lora_node') {
        card.classList.remove('tayu-lora-clickable');
        delete card.dataset.loraNodeKey;
        card.querySelector('[data-lora-node-open]')?.remove();
        card.querySelectorAll('.tayu-lora-node-live').forEach(panel => panel.remove());
        return;
      }
      ensureCardButton(card, key);
    });
  }

  function dashboardView() {
    const buttons = [...document.querySelectorAll('.nav button[data-view]')];
    const button = buttons.find(item => /dashboard|inicio|resumen/i.test(`${item.dataset.view || ''} ${item.textContent || ''}`));
    if (!button) return null;
    const id = String(button.dataset.view || '').trim();
    return id ? document.getElementById(id) : null;
  }

  function dashboardNodeMarkup(device, row) {
    const s = nodeSnapshot(device, row);
    return `<article class="tayu-lora-dashboard-node" data-lora-dashboard-node="${esc(device.device_key)}"><div class="tayu-lora-dashboard-node-head"><div><h4>${esc(device.name || device.device_key)}</h4><div class="tayu-lora-dashboard-key">${esc(device.device_key)} · vía ${esc(s.gateway)}</div></div><span class="tayu-lora-status ${s.online ? 'online' : s.waiting ? 'waiting' : ''}">${s.online ? 'ONLINE' : s.waiting ? 'SIN DATOS' : 'OFFLINE'}</span></div><div class="tayu-lora-dashboard-metrics"><div><span>Temp.</span><b>${esc(formatNumber(s.payload.temperature, 1))} °C</b></div><div><span>Humedad</span><b>${esc(formatNumber(s.payload.humidity, 0))} %</b></div><div><span>RSSI</span><b>${esc(formatNumber(s.payload?.link?.rssi, 0))}</b></div><div><span>SNR</span><b>${esc(formatNumber(s.payload?.link?.snr, 1))}</b></div></div></article>`;
  }

  function ensureDashboardHost(view) {
    let host = view.querySelector('[data-tayu-lora-dashboard]');
    if (host) return host;
    host = document.createElement('section');
    host.className = 'card tayu-lora-dashboard';
    host.dataset.tayuLoraDashboard = '1';
    const kpis = view.querySelector('.kpis');
    if (kpis?.parentElement === view) kpis.insertAdjacentElement('afterend', host);
    else view.insertBefore(host, view.firstChild);
    return host;
  }

  function renderDashboard(rows = null) {
    const view = dashboardView();
    if (!view) return;
    const nodes = loraNodes();
    let host = view.querySelector('[data-tayu-lora-dashboard]');
    if (!nodes.length) { host?.remove(); return; }
    host = ensureDashboardHost(view);
    const sourceRows = Array.isArray(rows) ? rows : (Array.isArray(state.dashboardRows) ? state.dashboardRows : globalLatestRows());
    const map = latestMap(sourceRows);
    host.innerHTML = `<div class="tayu-lora-dashboard-head"><div><h3>Red LoRa P2P</h3><p class="hint" style="margin:5px 0 0">Nodos asociados a Mini Gateways TAYULABS. Selecciona un nodo para ver detalle e histórico.</p></div><button type="button" class="btn ghost" data-lora-dashboard-refresh>Actualizar</button></div>${nodes.length ? `<div class="tayu-lora-dashboard-grid">${nodes.map(device => dashboardNodeMarkup(device, map.get(String(device.device_key)))).join('')}</div>` : '<div class="tayu-lora-dashboard-empty">No hay nodos LoRa configurados.</div>'}`;
  }

  async function refreshDashboard(button = null) {
    if (typeof window.__tayuApi !== 'function') { renderDashboard(); return; }
    const old = button?.textContent || 'Actualizar';
    if (button) { button.disabled = true; button.textContent = 'Actualizando…'; }
    try {
      const rows = await window.__tayuApi('/telemetry/latest');
      state.dashboardRows = Array.isArray(rows) ? rows : [];
      renderDashboard(state.dashboardRows);
    } catch (error) {
      console.warn('LoRa dashboard refresh:', error);
    } finally {
      if (button) { button.disabled = false; button.textContent = old; }
    }
  }

  function attachGridObserver() {
    const grid = document.getElementById('tdGrid');
    if (!grid || grid.dataset.tayuLoraObserver === '1') return false;
    grid.dataset.tayuLoraObserver = '1';
    let scheduled = false;
    state.observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; decorateCards(); });
    });
    state.observer.observe(grid, { childList: true });
    return true;
  }

  function refreshSoon() {
    [0, 180, 500, 1000].forEach(delay => setTimeout(() => {
      decorateCards();
      attachGridObserver();
      renderDashboard();
    }, delay));
  }

  document.addEventListener('click', event => {
    const close = event.target?.closest?.('[data-lora-close]');
    if (close) { event.preventDefault(); closeModal(); return; }

    const range = event.target?.closest?.('[data-lora-range]');
    if (range && state.deviceKey) {
      event.preventDefault();
      state.historyMinutes = Number(range.dataset.loraRange) || 360;
      document.querySelectorAll('[data-lora-range]').forEach(button => button.classList.toggle('active', button === range));
      loadHistory(state.deviceKey, state.historyMinutes);
      return;
    }

    const refreshModalButton = event.target?.closest?.('[data-lora-refresh-modal]');
    if (refreshModalButton) { event.preventDefault(); refreshOpenNode(refreshModalButton); return; }

    const dashboardRefresh = event.target?.closest?.('[data-lora-dashboard-refresh]');
    if (dashboardRefresh) { event.preventDefault(); refreshDashboard(dashboardRefresh); return; }

    const dashboardNode = event.target?.closest?.('[data-lora-dashboard-node]');
    if (dashboardNode) { event.preventDefault(); openNode(dashboardNode.dataset.loraDashboardNode); return; }

    const openButton = event.target?.closest?.('[data-lora-node-open]');
    if (openButton) { event.preventDefault(); event.stopPropagation(); openNode(openButton.dataset.loraNodeOpen); return; }

    const card = event.target?.closest?.('#tdGrid .td-card[data-lora-node-key]');
    if (card && !event.target?.closest?.('button,a,input,select,textarea,label')) {
      openNode(card.dataset.loraNodeKey);
      return;
    }

    const nav = event.target?.closest?.('.nav button[data-view]');
    if (nav || event.target?.closest?.('#tdRefresh')) refreshSoon();
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('tayuLoraNodeModal')?.classList.contains('open')) closeModal();
  });

  window.addEventListener('tayu:client-access-ready', refreshSoon);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshSoon, { once: true });
  else refreshSoon();

  window.__tayuLoRaNodeLive = {
    version: VERSION,
    decorate: decorateCards,
    open: openNode,
    refresh: refreshOpenNode,
    renderDashboard
  };
})();
