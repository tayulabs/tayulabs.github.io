(() => {
  'use strict';

  const VERSION = '20260916-lora-node-live1';
  if (window.__tayuLoRaNodeLive?.version === VERSION) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  const devices = () => Array.isArray(window.__tayuRealDevices) ? window.__tayuRealDevices : [];
  const latestRows = () => Array.isArray(window.__tayuLastTelemetry) ? window.__tayuLastTelemetry : [];

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
    return `Hace ${hours} h`;
  }

  function injectStyles() {
    if (document.getElementById('tayuLoraNodeLiveStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuLoraNodeLiveStyles';
    style.textContent = `
      .tayu-lora-node-live{margin-top:12px;border:1px solid var(--border);border-radius:16px;background:var(--panel2);padding:12px}
      .tayu-lora-node-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .tayu-lora-node-title{font-size:12px;font-weight:900;color:var(--text)}
      .tayu-lora-node-sub{margin-top:3px;font-size:10px;color:var(--muted)}
      .tayu-lora-node-status{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:999px;font-size:10px;font-weight:900;background:rgba(239,68,68,.10);color:var(--danger)}
      .tayu-lora-node-status.online{background:rgba(91,193,47,.12);color:var(--brand)}
      .tayu-lora-node-status.waiting{background:rgba(245,158,11,.12);color:var(--warning)}
      .tayu-lora-node-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:11px}
      .tayu-lora-node-metric{border:1px solid var(--border);border-radius:12px;background:var(--panel);padding:9px}
      .tayu-lora-node-metric span{display:block;font-size:9px;color:var(--muted);font-weight:850;margin-bottom:4px}
      .tayu-lora-node-metric b{font-size:16px;color:var(--text)}
      .tayu-lora-node-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:9px}
      .tayu-lora-node-box{border:1px solid var(--border);border-radius:12px;background:var(--panel);padding:10px;font-size:10px;line-height:1.6;color:var(--muted)}
      .tayu-lora-node-box strong{color:var(--text)}
      .tayu-lora-node-gps{margin-top:9px;border:1px solid var(--border);border-radius:12px;background:var(--panel);padding:10px;font-size:10px;line-height:1.55;color:var(--muted)}
      .tayu-lora-node-actions{display:flex;justify-content:flex-end;margin-top:9px}
      .tayu-lora-node-actions .btn{padding:7px 10px;border-radius:10px;font-size:10px}
      @media(max-width:760px){.tayu-lora-node-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.tayu-lora-node-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function radioFor(device, payload) {
    const configured = device?.configuration?.communication?.lora || {};
    const transmitted = payload?.lora || {};
    return {
      frequency_mhz: configured.frequency_mhz ?? transmitted.frequency_mhz ?? 915,
      tx_power_dbm: configured.tx_power_dbm ?? transmitted.tx_power_dbm ?? 20,
      spreading_factor: configured.spreading_factor ?? transmitted.spreading_factor ?? 9,
      bandwidth_khz: configured.bandwidth_khz ?? transmitted.bandwidth_khz ?? 125,
      coding_rate: configured.coding_rate ?? transmitted.coding_rate ?? '4/5'
    };
  }

  function panelMarkup(device, row) {
    const payload = payloadObject(row);
    const comm = device?.configuration?.communication || {};
    const radio = radioFor(device, payload);
    const hasRow = Boolean(row);
    const online = hasRow && payload.online !== false && String(device?.status || '').toLowerCase() !== 'offline';
    const waiting = !hasRow;
    const gateway = String(payload?.lora?.gateway_device_key || payload?.gateway?.device_key || comm.gateway_device_key || comm.parent_gateway_device_key || '—');
    const nodeId = String(payload?.lora?.node_id || payload?.node_id || comm.node_id || device?.device_key || '—');
    const gps = payload?.gps && typeof payload.gps === 'object' ? payload.gps : {};
    const gpsValid = gps.valid === true;
    const packetReceived = payload.packets_received ?? '—';
    const packetLost = payload.packets_lost ?? '—';
    const packetCounter = payload.packet_counter ?? '—';
    const last = row?.time || row?.received_at || device?.last_seen_at;

    const gpsHtml = gpsValid
      ? `<strong>GPS válido</strong> · Lat ${esc(formatNumber(gps.lat ?? gps.latitude, 6))} · Lon ${esc(formatNumber(gps.lon ?? gps.lng ?? gps.longitude, 6))}<br>Satélites: ${esc(gps.satellites ?? gps.sats ?? '—')} · HDOP: ${esc(gps.hdop ?? '—')} · Altitud: ${esc(gps.altitude ?? gps.alt ?? '—')} m · Velocidad: ${esc(gps.speed ?? gps.speed_kmh ?? '—')}`
      : `<strong>GPS:</strong> Sin posición válida${comm?.gps?.enabled ? ' · esperando fix' : ''}`;

    return `
      <div class="tayu-lora-node-head">
        <div>
          <div class="tayu-lora-node-title">Datos LoRa del nodo</div>
          <div class="tayu-lora-node-sub">${esc(nodeId)} · vía ${esc(gateway)} · ${esc(ageLabel(last))}</div>
        </div>
        <span class="tayu-lora-node-status ${online ? 'online' : waiting ? 'waiting' : ''}">${online ? '● ONLINE' : waiting ? '● ESPERANDO DATOS' : '● OFFLINE'}</span>
      </div>

      <div class="tayu-lora-node-metrics">
        <div class="tayu-lora-node-metric"><span>Temperatura</span><b>${esc(formatNumber(payload.temperature, 1))} °C</b></div>
        <div class="tayu-lora-node-metric"><span>Humedad</span><b>${esc(formatNumber(payload.humidity, 0))} %</b></div>
        <div class="tayu-lora-node-metric"><span>RSSI</span><b>${esc(formatNumber(payload?.link?.rssi, 0))} dBm</b></div>
        <div class="tayu-lora-node-metric"><span>SNR</span><b>${esc(formatNumber(payload?.link?.snr, 1))} dB</b></div>
      </div>

      <div class="tayu-lora-node-grid">
        <div class="tayu-lora-node-box">
          <strong>Comunicación</strong><br>
          Protocolo: LoRa P2P<br>
          Mini Gateway: ${esc(gateway)}<br>
          Node ID: ${esc(nodeId)}<br>
          Frecuencia: ${esc(formatNumber(radio.frequency_mhz, 0))} MHz · SF${esc(radio.spreading_factor)} · BW ${esc(formatNumber(radio.bandwidth_khz, 0))} kHz · CR ${esc(radio.coding_rate)}
        </div>
        <div class="tayu-lora-node-box">
          <strong>Enlace</strong><br>
          Paquetes recibidos: ${esc(packetReceived)}<br>
          Paquetes perdidos: ${esc(packetLost)}<br>
          Contador de paquete: ${esc(packetCounter)}<br>
          Último paquete: ${esc(ageLabel(last))}
        </div>
      </div>

      <div class="tayu-lora-node-gps">${gpsHtml}</div>
      <div class="tayu-lora-node-actions"><button type="button" class="btn ghost" data-lora-node-refresh="${esc(device.device_key)}">Actualizar datos</button></div>
    `;
  }

  function decorateFromRows(rows) {
    injectStyles();
    const map = latestMap(rows);
    const allDevices = devices();

    document.querySelectorAll('#tdGrid .td-card').forEach(card => {
      const key = card.querySelector('.td-key')?.textContent?.trim();
      if (!key) return;
      const device = allDevices.find(row => String(row?.device_key) === key);
      const existing = card.querySelector('.tayu-lora-node-live');

      if (!device || roleFor(device) !== 'lora_node') {
        existing?.remove();
        return;
      }

      let panel = existing;
      if (!panel) {
        panel = document.createElement('section');
        panel.className = 'tayu-lora-node-live';
        panel.dataset.deviceKey = key;
        card.appendChild(panel);
      }

      panel.innerHTML = panelMarkup(device, map.get(key));
    });
  }

  function decorate() {
    decorateFromRows(latestRows());
  }

  async function refreshFromApi(button) {
    if (typeof window.__tayuApi !== 'function') return;
    const oldText = button?.textContent || 'Actualizar datos';
    if (button) {
      button.disabled = true;
      button.textContent = 'Actualizando…';
    }
    try {
      const rows = await window.__tayuApi('/telemetry/latest');
      decorateFromRows(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.warn('LoRa node telemetry refresh:', error);
      if (button) button.textContent = 'Error · reintentar';
      return;
    } finally {
      if (button) {
        setTimeout(() => {
          button.disabled = false;
          button.textContent = oldText;
        }, 450);
      }
    }
  }

  function refreshSoon() {
    [0, 180, 500, 1000, 2200].forEach(delay => setTimeout(decorate, delay));
  }

  document.addEventListener('click', event => {
    const refresh = event.target?.closest?.('[data-lora-node-refresh]');
    if (refresh) {
      event.preventDefault();
      refreshFromApi(refresh);
      return;
    }

    if (event.target?.closest?.('.nav button[data-view="dispositivos"], #tdRefresh')) {
      refreshSoon();
    }
  }, true);

  window.addEventListener('tayu:client-access-ready', refreshSoon);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshSoon, { once: true });
  } else {
    refreshSoon();
  }

  window.__tayuLoRaNodeLive = {
    version: VERSION,
    decorate,
    refresh: () => refreshFromApi(null)
  };
})();
