(() => {
  'use strict';

  const canConfigure = () => ['owner','admin'].includes(String(
    window.__tayuClientAccess?.role || document.body?.dataset?.tayuRole || ''
  ).toLowerCase());

  const sectorLabel = value => ({
    fincas:'Fincas',
    camaroneras:'Camaroneras',
    bananeras:'Bananeras',
    ganaderia:'Ganadería'
  })[String(value || '').toLowerCase()] || 'Sin sector';

  function decorate() {
    if (!canConfigure()) return;
    const devices = Array.isArray(window.__tayuRealDevices) ? window.__tayuRealDevices : [];
    document.querySelectorAll('#tdGrid .td-card').forEach(card => {
      const key = card.querySelector('.td-key')?.textContent?.trim();
      if (!key) return;
      const device = devices.find(row => String(row.device_key) === key);
      let footer = card.querySelector('.td-iot-footer');
      if (!footer) {
        footer = document.createElement('div');
        footer.className = 'td-iot-footer';
        footer.innerHTML = '<span class="td-iot-sector"></span><button type="button" class="btn ghost td-iot-configure">⚙ Configurar IoT</button>';
        card.appendChild(footer);
      }
      const sector = footer.querySelector('.td-iot-sector');
      const button = footer.querySelector('.td-iot-configure');
      if (sector) sector.textContent = `Sector: ${sectorLabel(device?.site_sector)}`;
      if (button) button.dataset.deviceKey = key;
    });
    window.__tayuCommunicationRole?.decorate?.();
  }

  function attachObserver() {
    const grid = document.getElementById('tdGrid');
    if (!grid || grid.dataset.tayuIotStableObserver === '1') return false;
    grid.dataset.tayuIotStableObserver = '1';
    const observer = new MutationObserver(() => queueMicrotask(decorate));
    observer.observe(grid, { childList:true });
    decorate();
    return true;
  }

  function boot() {
    decorate();
    if (attachObserver()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      decorate();
      if (attachObserver() || attempts >= 100) clearInterval(timer);
    }, 100);
  }

  window.addEventListener('tayu:client-access-ready', () => setTimeout(boot, 0));
  document.addEventListener('click', event => {
    if (event.target?.closest?.('.nav button[data-view="dispositivos"], #tdRefresh')) {
      setTimeout(boot, 0);
    }
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();

(() => {
  'use strict';

  const VERSION = '20260916-communication1';
  if (window.__tayuCommunicationRole?.version === VERSION) return;

  const ROLES = {
    standalone: 'Equipo independiente',
    lora_mini_gateway: 'Mini Gateway LoRa',
    lora_node: 'Nodo LoRa'
  };

  const DEFAULT_RADIO = {
    frequency_mhz: 915,
    tx_power_dbm: 20,
    spreading_factor: 9,
    bandwidth_khz: 125,
    coding_rate: '4/5',
    sync_word: '0x12'
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  const clone = value => {
    try { return JSON.parse(JSON.stringify(value || {})); }
    catch { return {...(value || {})}; }
  };

  const devices = () => Array.isArray(window.__tayuRealDevices) ? window.__tayuRealDevices : [];
  const deviceFor = key => devices().find(row => String(row.device_key) === String(key)) || null;
  const canEdit = () => ['owner','admin'].includes(String(
    window.__tayuClientAccess?.role || document.body?.dataset?.tayuRole || ''
  ).toLowerCase());

  function profileKey(device) {
    return String(device?.profile_key || device?.device_type || '').trim().toLowerCase();
  }

  function inferredRole(device) {
    const key = profileKey(device);
    if (key === 'nova_edge_pro_minigateway' || key === 'nova_edge_pro_mini_gateway') return 'lora_mini_gateway';
    if (key === 'rak11300_lora_node' || key === 'rak11300_node') return 'lora_node';
    return 'standalone';
  }

  function configuration(device) {
    const saved = clone(device?.configuration?.communication || {});
    const role = ROLES[saved.role] ? saved.role : inferredRole(device);
    return {
      ...saved,
      role,
      protocol: role === 'standalone' ? 'wifi_mqtt' : 'lora_p2p',
      gateway_device_key: String(saved.gateway_device_key || saved.parent_gateway_device_key || ''),
      parent_gateway_device_key: String(saved.parent_gateway_device_key || saved.gateway_device_key || ''),
      node_id: String(saved.node_id || device?.device_key || ''),
      lora: {...DEFAULT_RADIO, ...(saved.lora || {})},
      gps: {
        enabled: Boolean(saved.gps?.enabled),
        show_on_map: Boolean(saved.gps?.show_on_map)
      },
      gateway: {
        max_nodes: Math.min(5, Math.max(1, Number(saved.gateway?.max_nodes || 5)))
      }
    };
  }

  function profileLabel(device) {
    const key = profileKey(device);
    if (key === 'nova_edge_pro_minigateway' || key === 'nova_edge_pro_mini_gateway') return 'NOVA EDGE PRO Mini Gateway';
    if (key === 'rak11300_lora_node' || key === 'rak11300_node') return 'RAK11300 LoRa Node';
    if (key === 'nova_edge_pro') return 'NOVA EDGE PRO';
    return device?.profile_key || device?.device_type || 'Sin perfil';
  }

  function roleIcon(role) {
    if (role === 'lora_mini_gateway') return '📡';
    if (role === 'lora_node') return '◉';
    return '☁';
  }

  function injectStyles() {
    if (document.getElementById('tayuCommunicationRoleStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuCommunicationRoleStyles';
    style.textContent = `
      .td-iot-footer{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
      .td-iot-sector{margin-right:auto}
      .comm-role-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid var(--border);border-radius:999px;background:var(--panel2);font-size:10px;font-weight:900}
      .comm-role-badge.gateway{color:var(--brand)}
      .comm-role-badge.node{color:var(--blue)}
      .comm-role-modal{display:none;position:fixed;inset:0;z-index:2147483200;background:#0008;padding:20px;align-items:center;justify-content:center}
      .comm-role-modal.open{display:flex}
      .comm-role-card{width:min(780px,100%);max-height:90vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:22px;padding:20px}
      .comm-role-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      .comm-role-head h2{margin:0}
      .comm-role-close{border:0;background:transparent;font-size:25px;cursor:pointer;color:var(--text)}
      .comm-role-section{margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--panel2)}
      .comm-role-section h3{margin:0 0 9px;font-size:14px}
      .comm-role-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .comm-role-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
      .comm-role-grid label{display:block;margin-bottom:5px;font-size:11px;font-weight:800}
      .comm-role-grid input,.comm-role-grid select{width:100%}
      .comm-role-check{display:flex!important;align-items:center;gap:8px;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--panel)}
      .comm-role-check input{width:auto!important;margin:0}
      .comm-role-note{margin-top:9px;padding:10px;border:1px solid var(--border);border-radius:10px;color:var(--muted);font-size:11px;line-height:1.5;background:var(--panel)}
      .comm-role-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
      .comm-role-message{min-height:18px;margin-top:7px;font-size:11px}
      @media(max-width:760px){.comm-role-modal{padding:8px;align-items:flex-start;padding-top:45px}.comm-role-grid,.comm-role-grid.three{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    injectStyles();
    let modal = document.getElementById('tayuCommunicationRoleModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'tayuCommunicationRoleModal';
    modal.className = 'comm-role-modal';
    modal.innerHTML = '<div class="comm-role-card"><div id="tayuCommunicationRoleBody"></div></div>';
    modal.addEventListener('click', event => {
      if (event.target === modal) modal.classList.remove('open');
    });
    document.body.appendChild(modal);
    return modal;
  }

  function gatewayOptions(selfKey, selected) {
    const gateways = devices().filter(device => {
      if (String(device.device_key) === String(selfKey)) return false;
      return configuration(device).role === 'lora_mini_gateway';
    });

    if (!gateways.length) return '<option value="">No hay Mini Gateways configurados</option>';

    return '<option value="">Seleccionar Mini Gateway…</option>' + gateways.map(device => (
      `<option value="${esc(device.device_key)}" ${String(device.device_key) === String(selected) ? 'selected' : ''}>${esc(device.name || device.device_key)} · ${esc(device.device_key)}</option>`
    )).join('');
  }

  function radioFields(cfg) {
    return `
      <div class="comm-role-section">
        <h3>Radio LoRa P2P</h3>
        <div class="comm-role-grid three">
          <div><label>Frecuencia (MHz)</label><input data-comm-field="frequency" type="number" step="0.1" value="${esc(cfg.lora.frequency_mhz)}"></div>
          <div><label>Potencia TX (dBm)</label><input data-comm-field="power" type="number" min="-9" max="30" value="${esc(cfg.lora.tx_power_dbm)}"></div>
          <div><label>Spreading Factor</label><select data-comm-field="sf">${[7,8,9,10,11,12].map(v => `<option value="${v}" ${Number(cfg.lora.spreading_factor) === v ? 'selected' : ''}>SF${v}</option>`).join('')}</select></div>
          <div><label>Bandwidth</label><select data-comm-field="bandwidth">${[125,250,500].map(v => `<option value="${v}" ${Number(cfg.lora.bandwidth_khz) === v ? 'selected' : ''}>${v} kHz</option>`).join('')}</select></div>
          <div><label>Coding Rate</label><select data-comm-field="coding">${['4/5','4/6','4/7','4/8'].map(v => `<option value="${v}" ${cfg.lora.coding_rate === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div><label>Sync Word</label><input data-comm-field="sync" value="${esc(cfg.lora.sync_word)}"></div>
        </div>
      </div>
    `;
  }

  function roleFields(device, cfg) {
    if (cfg.role === 'standalone') {
      return '<div class="comm-role-note">Este equipo se comunica directamente con TAYULABS Cloud mediante WiFi / MQTT.</div>';
    }

    if (cfg.role === 'lora_mini_gateway') {
      return `
        ${radioFields(cfg)}
        <div class="comm-role-section">
          <h3>Mini Gateway</h3>
          <div class="comm-role-grid">
            <div>
              <label>Capacidad máxima de nodos</label>
              <input data-comm-field="max_nodes" type="number" min="1" max="5" value="${esc(cfg.gateway.max_nodes)}">
            </div>
            <div>
              <label>Enlace Cloud</label>
              <input value="WiFi + MQTT TLS" disabled>
            </div>
          </div>
          <div class="comm-role-note">El Mini Gateway conserva una sola identidad MQTT propia. Los nodos asociados se identifican por Node ID y usan LoRa P2P hacia este equipo.</div>
        </div>
      `;
    }

    return `
      <div class="comm-role-section">
        <h3>Nodo LoRa</h3>
        <div class="comm-role-grid">
          <div>
            <label>Mini Gateway asociado *</label>
            <select data-comm-field="gateway">${gatewayOptions(device.device_key, cfg.gateway_device_key)}</select>
          </div>
          <div>
            <label>Node ID *</label>
            <input data-comm-field="node_id" value="${esc(cfg.node_id || device.device_key)}">
          </div>
        </div>
      </div>
      ${radioFields(cfg)}
      <div class="comm-role-section">
        <h3>GPS opcional</h3>
        <div class="comm-role-grid">
          <label class="comm-role-check"><input data-comm-field="gps_enabled" type="checkbox" ${cfg.gps.enabled ? 'checked' : ''}> Este nodo tiene GPS</label>
          <label class="comm-role-check"><input data-comm-field="gps_map" type="checkbox" ${cfg.gps.show_on_map ? 'checked' : ''} ${cfg.gps.enabled ? '' : 'disabled'}> Mostrar en mapas</label>
        </div>
      </div>
    `;
  }

  function open(deviceKey) {
    const device = deviceFor(deviceKey);
    if (!device) return;

    const cfg = configuration(device);
    const modal = ensureModal();
    const body = document.getElementById('tayuCommunicationRoleBody');

    body.dataset.deviceKey = deviceKey;
    body.innerHTML = `
      <div class="comm-role-head">
        <div>
          <h2>Comunicación · ${esc(device.name || device.device_key)}</h2>
          <p class="hint" style="margin:6px 0 0">${esc(device.device_key)}</p>
        </div>
        <button type="button" class="comm-role-close" data-comm-close>×</button>
      </div>

      <div class="comm-role-section">
        <h3>Identidad del equipo</h3>
        <div class="comm-role-grid">
          <div><label>Perfil de hardware</label><input value="${esc(profileLabel(device))}" disabled></div>
          <div><label>Rol de comunicación</label><select data-comm-role>${Object.entries(ROLES).map(([value,label]) => `<option value="${value}" ${cfg.role === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div>
        </div>
        <div class="comm-role-note">Modelo/perfil y rol son conceptos separados. Un NOVA EDGE PRO puede trabajar como equipo independiente, Nodo LoRa o Mini Gateway según su firmware y configuración.</div>
      </div>

      <div data-comm-role-fields>${roleFields(device, cfg)}</div>

      <div class="comm-role-actions">
        <button type="button" class="btn ghost" data-comm-close>Cancelar</button>
        <button type="button" class="btn" data-comm-save ${canEdit() ? '' : 'disabled'}>Guardar comunicación</button>
      </div>
      <div class="comm-role-message" data-comm-message></div>
    `;

    modal.classList.add('open');
  }

  function numberValue(root, name, fallback) {
    const input = root.querySelector(`[data-comm-field="${name}"]`);
    const value = Number(input?.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function formConfiguration(root) {
    const device = deviceFor(root.dataset.deviceKey);
    const current = configuration(device);
    const role = root.querySelector('[data-comm-role]')?.value || 'standalone';
    const gateway = String(root.querySelector('[data-comm-field="gateway"]')?.value || '');
    const nodeId = String(root.querySelector('[data-comm-field="node_id"]')?.value || device?.device_key || '').trim();
    const gpsEnabled = Boolean(root.querySelector('[data-comm-field="gps_enabled"]')?.checked);
    const gpsMap = gpsEnabled && Boolean(root.querySelector('[data-comm-field="gps_map"]')?.checked);

    return {
      ...current,
      role,
      protocol: role === 'standalone' ? 'wifi_mqtt' : 'lora_p2p',
      gateway_device_key: role === 'lora_node' ? gateway : '',
      parent_gateway_device_key: role === 'lora_node' ? gateway : '',
      node_id: role === 'lora_node' ? nodeId : String(current.node_id || device?.device_key || ''),
      lora: role === 'standalone' ? current.lora : {
        frequency_mhz: numberValue(root, 'frequency', current.lora.frequency_mhz),
        tx_power_dbm: numberValue(root, 'power', current.lora.tx_power_dbm),
        spreading_factor: numberValue(root, 'sf', current.lora.spreading_factor),
        bandwidth_khz: numberValue(root, 'bandwidth', current.lora.bandwidth_khz),
        coding_rate: String(root.querySelector('[data-comm-field="coding"]')?.value || current.lora.coding_rate),
        sync_word: String(root.querySelector('[data-comm-field="sync"]')?.value || current.lora.sync_word)
      },
      gps: {
        enabled: role === 'lora_node' && gpsEnabled,
        show_on_map: role === 'lora_node' && gpsMap
      },
      gateway: {
        max_nodes: role === 'lora_mini_gateway'
          ? Math.min(5, Math.max(1, numberValue(root, 'max_nodes', current.gateway.max_nodes)))
          : current.gateway.max_nodes
      }
    };
  }

  async function save(root, button) {
    const device = deviceFor(root.dataset.deviceKey);
    const message = root.querySelector('[data-comm-message]');
    if (!device || !message) return;

    const comm = formConfiguration(root);

    if (comm.role === 'lora_node') {
      if (!comm.gateway_device_key) {
        message.textContent = 'Selecciona el Mini Gateway asociado.';
        return;
      }
      if (!comm.node_id) {
        message.textContent = 'Ingresa el Node ID.';
        return;
      }
      const gateway = deviceFor(comm.gateway_device_key);
      if (!gateway || configuration(gateway).role !== 'lora_mini_gateway') {
        message.textContent = 'El dispositivo seleccionado no está configurado como Mini Gateway.';
        return;
      }
    }

    if (typeof window.__tayuApiPost !== 'function') {
      message.textContent = 'La API de configuración todavía no está disponible.';
      return;
    }

    const fullConfiguration = clone(device.configuration || {});
    fullConfiguration.communication = comm;

    try {
      button.disabled = true;
      message.textContent = 'Guardando…';
      await window.__tayuApiPost('/devices/configuration', {
        device_key: device.device_key,
        configuration: fullConfiguration
      });
      device.configuration = fullConfiguration;
      message.textContent = 'Configuración guardada.';
      message.style.color = 'var(--brand)';
      decorate();
      setTimeout(() => ensureModal().classList.remove('open'), 450);
    } catch (error) {
      message.textContent = error?.message || 'No se pudo guardar la configuración.';
      message.style.color = 'var(--danger)';
    } finally {
      button.disabled = !canEdit();
    }
  }

  function decorate() {
    injectStyles();
    const all = devices();

    document.querySelectorAll('#tdGrid .td-card').forEach(card => {
      const key = card.querySelector('.td-key')?.textContent?.trim();
      if (!key) return;
      const device = all.find(row => String(row.device_key) === String(key));
      if (!device) return;

      const cfg = configuration(device);
      let footer = card.querySelector('.td-iot-footer');
      if (!footer) {
        footer = document.createElement('div');
        footer.className = 'td-iot-footer';
        card.appendChild(footer);
      }

      let badge = footer.querySelector('[data-comm-role-badge]');
      if (!badge) {
        badge = document.createElement('span');
        badge.dataset.commRoleBadge = '1';
        badge.className = 'comm-role-badge';
        footer.insertBefore(badge, footer.firstChild);
      }

      badge.className = `comm-role-badge ${cfg.role === 'lora_mini_gateway' ? 'gateway' : cfg.role === 'lora_node' ? 'node' : ''}`;
      badge.textContent = `${roleIcon(cfg.role)} ${ROLES[cfg.role]}`;

      let button = footer.querySelector('[data-comm-role-open]');
      if (canEdit() && !button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn ghost';
        button.dataset.commRoleOpen = key;
        button.textContent = '📡 Comunicación';
        footer.appendChild(button);
      }
      if (button) button.dataset.commRoleOpen = key;
    });
  }

  function refreshSoon() {
    [0, 180, 500, 1000].forEach(delay => setTimeout(decorate, delay));
  }

  function install() {
    ensureModal();
    refreshSoon();

    document.addEventListener('click', event => {
      const openButton = event.target?.closest?.('[data-comm-role-open]');
      if (openButton) {
        event.preventDefault();
        open(openButton.dataset.commRoleOpen);
        return;
      }

      if (event.target?.closest?.('[data-comm-close]')) {
        ensureModal().classList.remove('open');
        return;
      }

      const saveButton = event.target?.closest?.('[data-comm-save]');
      if (saveButton) {
        const root = document.getElementById('tayuCommunicationRoleBody');
        if (root) save(root, saveButton);
      }
    }, true);

    document.addEventListener('change', event => {
      const root = event.target?.closest?.('#tayuCommunicationRoleBody');
      if (!root) return;

      if (event.target.matches('[data-comm-role]')) {
        const device = deviceFor(root.dataset.deviceKey);
        const cfg = configuration(device);
        cfg.role = event.target.value;
        cfg.protocol = cfg.role === 'standalone' ? 'wifi_mqtt' : 'lora_p2p';
        const host = root.querySelector('[data-comm-role-fields]');
        if (host) host.innerHTML = roleFields(device, cfg);
      }

      if (event.target.matches('[data-comm-field="gps_enabled"]')) {
        const map = root.querySelector('[data-comm-field="gps_map"]');
        if (map) {
          map.disabled = !event.target.checked;
          if (!event.target.checked) map.checked = false;
        }
      }

      if (event.target.matches('[data-comm-field="gateway"]')) {
        const gateway = deviceFor(event.target.value);
        if (!gateway) return;
        const radio = configuration(gateway).lora;
        const mapping = {
          frequency:'frequency_mhz',
          power:'tx_power_dbm',
          sf:'spreading_factor',
          bandwidth:'bandwidth_khz',
          coding:'coding_rate',
          sync:'sync_word'
        };
        Object.entries(mapping).forEach(([field, key]) => {
          const input = root.querySelector(`[data-comm-field="${field}"]`);
          if (input && radio[key] != null) input.value = radio[key];
        });
      }
    }, true);

    window.addEventListener('tayu:client-access-ready', refreshSoon);
    document.addEventListener('click', event => {
      if (event.target?.closest?.('.nav button[data-view="dispositivos"], #tdRefresh')) refreshSoon();
    }, true);
  }

  window.__tayuCommunicationRole = {
    version: VERSION,
    decorate,
    open,
    configuration: key => configuration(deviceFor(key)),
    role: key => configuration(deviceFor(key)).role
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();