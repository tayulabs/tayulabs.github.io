(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  let currentPayload = null;
  let gridObserver = null;
  let syncQueued = false;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  const isManager = () => {
    const role = String(
      window.__tayuClientAccess?.role ||
      document.body?.dataset?.tayuRole ||
      ''
    ).toLowerCase();
    return role === 'owner' || role === 'admin';
  };

  async function api(path, options = {}) {
    const keycloak = window.__tayuEntryKeycloak;
    if (!keycloak?.authenticated) throw new Error('Sesión no disponible');

    try { await keycloak.updateToken(30); } catch (_) {}

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${keycloak.token}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      cache: 'no-store',
      headers,
    });

    let body = null;
    const text = await response.text();
    if (text) {
      try { body = JSON.parse(text); } catch (_) { body = text; }
    }

    if (!response.ok) {
      const message = body?.error || body?.message || `HTTP ${response.status}`;
      throw new Error(message);
    }

    return body;
  }

  function injectStyles() {
    if (document.getElementById('tayuIotResourceStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuIotResourceStyles';
    style.textContent = `
      #dispositivos .tayu-iot-card-actions{display:flex;justify-content:flex-end;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}
      #dispositivos .tayu-iot-config-button{width:100%;justify-content:center;gap:7px}
      #tayuIotConfigModal{position:fixed;inset:0;z-index:2147482500;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(3,8,5,.62);backdrop-filter:blur(6px)}
      #tayuIotConfigModal.open{display:flex}
      #tayuIotConfigModal .tic-panel{width:min(980px,96vw);max-height:min(860px,92vh);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--border);border-radius:24px;background:var(--panel);box-shadow:0 28px 80px rgba(0,0,0,.35)}
      #tayuIotConfigModal .tic-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:20px 22px;border-bottom:1px solid var(--border)}
      #tayuIotConfigModal .tic-header h2{margin:0;font-size:22px}
      #tayuIotConfigModal .tic-subtitle{margin-top:5px;color:var(--muted);font-size:12px;font-weight:750}
      #tayuIotConfigModal .tic-close{min-width:38px;height:38px;border-radius:12px;border:1px solid var(--border);background:var(--panel2);color:var(--text);font-size:18px;font-weight:900;cursor:pointer}
      #tayuIotConfigModal .tic-device{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;padding:14px 22px;border-bottom:1px solid var(--border);background:var(--panel2)}
      #tayuIotConfigModal .tic-device div{min-width:0}
      #tayuIotConfigModal .tic-device span{display:block;color:var(--muted);font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}
      #tayuIotConfigModal .tic-device b{display:block;margin-top:3px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #tayuIotConfigModal .tic-body{overflow:auto;padding:18px 22px 24px}
      #tayuIotConfigModal .tic-message{padding:18px;border:1px dashed var(--border);border-radius:16px;background:var(--panel2);color:var(--muted);text-align:center}
      #tayuIotConfigModal .tic-warning{margin-bottom:14px;padding:11px 13px;border-radius:14px;border:1px solid rgba(245,158,11,.25);background:rgba(245,158,11,.08);font-size:12px;font-weight:750}
      #tayuIotConfigModal .tic-section{margin-top:18px}
      #tayuIotConfigModal .tic-section:first-child{margin-top:0}
      #tayuIotConfigModal .tic-section-title{display:flex;align-items:center;gap:8px;margin:0 0 9px;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
      #tayuIotConfigModal .tic-section-title span{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:var(--panel2);border:1px solid var(--border);font-size:10px}
      #tayuIotConfigModal .tic-resources{display:grid;gap:10px}
      #tayuIotConfigModal .tic-row{display:grid;grid-template-columns:160px minmax(150px,1fr) minmax(180px,1.25fr) 92px auto;gap:10px;align-items:end;padding:12px;border:1px solid var(--border);border-radius:16px;background:var(--panel)}
      #tayuIotConfigModal .tic-resource-name{align-self:center;min-width:0}
      #tayuIotConfigModal .tic-resource-name b{display:block;font-size:13px}
      #tayuIotConfigModal .tic-resource-name small{display:block;margin-top:4px;color:var(--muted);font-size:10px}
      #tayuIotConfigModal .tic-field label{display:block;margin-bottom:5px;color:var(--muted);font-size:9px;font-weight:900;text-transform:uppercase}
      #tayuIotConfigModal .tic-field input{width:100%;min-height:38px;padding:8px 10px;border:1px solid var(--border);border-radius:11px;background:var(--panel2);color:var(--text);font:inherit;font-size:12px}
      #tayuIotConfigModal .tic-toggle{display:flex;align-items:center;justify-content:center;gap:6px;min-height:38px;padding:0 8px;border:1px solid var(--border);border-radius:11px;background:var(--panel2);font-size:11px;font-weight:850}
      #tayuIotConfigModal .tic-toggle input{width:auto;margin:0}
      #tayuIotConfigModal .tic-actions{display:flex;gap:7px;justify-content:flex-end}
      #tayuIotConfigModal .tic-actions button{min-height:38px;padding:0 11px;border-radius:11px;white-space:nowrap}
      #tayuIotConfigModal .tic-remove{border:1px solid rgba(239,68,68,.22);background:rgba(239,68,68,.08);color:var(--danger);font-weight:850;cursor:pointer}
      #tayuIotConfigModal .tic-state{display:inline-flex;margin-top:6px;padding:3px 7px;border-radius:999px;background:var(--panel2);border:1px solid var(--border);color:var(--muted);font-size:9px;font-weight:900}
      #tayuIotConfigModal .tic-state.configured{background:rgba(91,193,47,.1);border-color:rgba(91,193,47,.22);color:var(--brand)}
      #tayuIotConfigModal .tic-footer-note{margin-top:16px;color:var(--muted);font-size:10px;line-height:1.5}
      @media(max-width:880px){#tayuIotConfigModal{padding:8px}#tayuIotConfigModal .tic-panel{max-height:96vh;border-radius:20px}#tayuIotConfigModal .tic-device{grid-template-columns:1fr 1fr}#tayuIotConfigModal .tic-row{grid-template-columns:1fr 1fr}#tayuIotConfigModal .tic-resource-name,#tayuIotConfigModal .tic-actions{grid-column:1/-1}#tayuIotConfigModal .tic-actions{justify-content:stretch}#tayuIotConfigModal .tic-actions button{flex:1}}
      @media(max-width:560px){#tayuIotConfigModal .tic-header,#tayuIotConfigModal .tic-body{padding-left:14px;padding-right:14px}#tayuIotConfigModal .tic-device{padding-left:14px;padding-right:14px;grid-template-columns:1fr}#tayuIotConfigModal .tic-row{grid-template-columns:1fr}#tayuIotConfigModal .tic-resource-name,#tayuIotConfigModal .tic-actions{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function ensureDatalist() {
    if (document.getElementById('tayuIotApplications')) return;
    const list = document.createElement('datalist');
    list.id = 'tayuIotApplications';
    [
      ['generic','Salida genérica'],
      ['irrigation_pump','Bomba de riego'],
      ['well_pump','Bomba de pozo'],
      ['pump','Bomba'],
      ['valve','Válvula'],
      ['motor','Motor'],
      ['aerator','Aireador eléctrico'],
      ['feeder','Alimentador automático'],
      ['lighting','Iluminación'],
      ['generic_input','Entrada genérica'],
      ['float_switch','Flotador / nivel'],
      ['pressure_switch','Presostato'],
      ['pump_state','Estado de bomba'],
      ['alarm_input','Entrada de alarma'],
      ['level_switch','Interruptor de nivel'],
      ['modbus','Modbus'],
      ['tracking','Tracking / GPS'],
      ['sensor','Sensor']
    ].forEach(([value,label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.label = label;
      list.appendChild(option);
    });
    document.body.appendChild(list);
  }

  function ensureModal() {
    let modal = document.getElementById('tayuIotConfigModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'tayuIotConfigModal';
    modal.innerHTML = `
      <div class="tic-panel" role="dialog" aria-modal="true" aria-labelledby="tayuIotTitle">
        <div class="tic-header">
          <div>
            <h2 id="tayuIotTitle">Configurar IoT</h2>
            <div class="tic-subtitle" id="tayuIotSubtitle">Cargando recursos físicos…</div>
          </div>
          <button class="tic-close" type="button" aria-label="Cerrar">×</button>
        </div>
        <div class="tic-device" id="tayuIotDeviceSummary"></div>
        <div class="tic-body" id="tayuIotBody"><div class="tic-message">Cargando…</div></div>
      </div>`;

    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('.tic-close')) closeModal();
    });

    modal.addEventListener('click', async event => {
      const save = event.target.closest('[data-tic-save]');
      if (save) {
        await saveResource(save.dataset.ticSave, save);
        return;
      }
      const remove = event.target.closest('[data-tic-remove]');
      if (remove) await removeResource(remove.dataset.ticRemove, remove);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });

    document.body.appendChild(modal);
    return modal;
  }

  function closeModal() {
    document.getElementById('tayuIotConfigModal')?.classList.remove('open');
    currentPayload = null;
  }

  const sectorLabel = value => ({
    fincas: 'Fincas',
    camaroneras: 'Camaroneras',
    bananeras: 'Bananeras',
    ganaderia: 'Ganadería'
  }[String(value || '').toLowerCase()] || value || 'Sin sector');

  function resourceLabel(resource) {
    const key = String(resource?.resource_key || 'Recurso');
    let match = key.match(/^relay(\d+)$/i);
    if (match) return `Relay ${match[1]}`;
    match = key.match(/^din(\d+)$/i);
    if (match) return `Entrada digital ${match[1]}`;
    if (key.toLowerCase() === 'rs485') return 'RS485 / Modbus';
    if (key.toLowerCase() === 'gps') {
      return String(resource?.source || '').toLowerCase().includes('external')
        ? 'GPS externo (opcional)'
        : 'GPS / ubicación';
    }
    return key;
  }

  function groupFor(resource) {
    switch (resource?.resource_type) {
      case 'digital_output': return ['outputs','Salidas'];
      case 'digital_input': return ['inputs','Entradas'];
      case 'interface': return ['interfaces','Comunicación'];
      case 'location': return ['location','Ubicación / opcional'];
      case 'sensor': return ['sensors','Sensores'];
      default: return ['other','Otros recursos'];
    }
  }

  function renderModal(payload) {
    currentPayload = payload;
    const modal = ensureModal();
    const device = payload?.device || {};
    const resources = Array.isArray(payload?.resources) ? payload.resources : [];
    const subtitle = document.getElementById('tayuIotSubtitle');
    const summary = document.getElementById('tayuIotDeviceSummary');
    const body = document.getElementById('tayuIotBody');

    if (subtitle) subtitle.textContent = `${device.name || device.device_key || 'Dispositivo'} · ${resources.length} recursos detectados`;
    if (summary) summary.innerHTML = `
      <div><span>Device key</span><b title="${escapeHtml(device.device_key)}">${escapeHtml(device.device_key || '—')}</b></div>
      <div><span>Perfil</span><b title="${escapeHtml(device.profile_name || device.profile_key)}">${escapeHtml(device.profile_name || device.profile_key || '—')}</b></div>
      <div><span>Sitio</span><b title="${escapeHtml(device.site_name)}">${escapeHtml(device.site_name || 'Sin sitio')}</b></div>
      <div><span>Sector</span><b>${escapeHtml(sectorLabel(device.site_sector))}</b></div>`;

    if (!body) return;
    if (!resources.length) {
      body.innerHTML = '<div class="tic-message">Este perfil no declara recursos IoT configurables.</div>';
      return;
    }

    const groups = new Map();
    resources.forEach(resource => {
      const [key,label] = groupFor(resource);
      if (!groups.has(key)) groups.set(key, { label, rows: [] });
      groups.get(key).rows.push(resource);
    });

    const noSector = !device.site_id || !device.site_sector;
    const warning = noSector
      ? '<div class="tic-warning">Este dispositivo no tiene un sitio/sector operativo asignado. Puedes revisar sus capacidades, pero asigna primero un sitio desde administración antes de guardar aplicaciones productivas.</div>'
      : '';

    const sections = [...groups.values()].map(group => `
      <section class="tic-section">
        <h3 class="tic-section-title">${escapeHtml(group.label)} <span>${group.rows.length}</span></h3>
        <div class="tic-resources">
          ${group.rows.map(resource => {
            const assignment = resource.assignment || null;
            const application = assignment?.application || resource.default_application || '';
            const displayName = assignment?.display_name || '';
            const enabled = assignment ? assignment.enabled !== false : true;
            const state = assignment ? 'Configurado' : 'Sin configurar';
            return `
              <div class="tic-row" data-resource-key="${escapeHtml(resource.resource_key)}">
                <div class="tic-resource-name">
                  <b>${escapeHtml(resourceLabel(resource))}</b>
                  <small>${escapeHtml(resource.resource_key)} · ${escapeHtml(resource.resource_type)}</small>
                  <span class="tic-state ${assignment ? 'configured' : ''}">${state}</span>
                </div>
                <div class="tic-field">
                  <label>Aplicación</label>
                  <input data-tic-application list="tayuIotApplications" value="${escapeHtml(application)}" placeholder="ej. irrigation_pump">
                </div>
                <div class="tic-field">
                  <label>Nombre visible</label>
                  <input data-tic-name value="${escapeHtml(displayName)}" placeholder="ej. Bomba de riego principal">
                </div>
                <label class="tic-toggle"><input type="checkbox" data-tic-enabled ${enabled ? 'checked' : ''}> Activo</label>
                <div class="tic-actions">
                  ${assignment ? `<button type="button" class="tic-remove" data-tic-remove="${escapeHtml(resource.resource_key)}">Quitar</button>` : ''}
                  <button type="button" class="btn" data-tic-save="${escapeHtml(resource.resource_key)}" ${noSector ? 'disabled' : ''}>Guardar</button>
                </div>
              </div>`;
          }).join('')}
        </div>
      </section>`).join('');

    body.innerHTML = `${warning}${sections}<div class="tic-footer-note">La asignación define qué hace cada recurso físico. El dispositivo y su aprovisionamiento continúan gestionándose desde Cloud Admin.</div>`;
  }

  async function loadDeviceResources(deviceKey) {
    const modal = ensureModal();
    modal.classList.add('open');
    document.getElementById('tayuIotSubtitle').textContent = 'Cargando recursos físicos…';
    document.getElementById('tayuIotDeviceSummary').innerHTML = '';
    document.getElementById('tayuIotBody').innerHTML = '<div class="tic-message">Consultando perfil y asignaciones…</div>';

    try {
      const payload = await api(`/devices/iot-resources?device_key=${encodeURIComponent(deviceKey)}`);
      renderModal(payload);
    } catch (error) {
      document.getElementById('tayuIotBody').innerHTML = `<div class="tic-message">No se pudo cargar la configuración: ${escapeHtml(error.message)}</div>`;
    }
  }

  function resourceByKey(key) {
    return (currentPayload?.resources || []).find(resource => String(resource.resource_key) === String(key));
  }

  async function saveResource(resourceKey, button) {
    if (!currentPayload?.device?.device_key || !isManager()) return;
    const row = button.closest('.tic-row');
    const application = String(row?.querySelector('[data-tic-application]')?.value || '').trim().toLowerCase();
    const displayName = String(row?.querySelector('[data-tic-name]')?.value || '').trim();
    const enabled = Boolean(row?.querySelector('[data-tic-enabled]')?.checked);
    const resource = resourceByKey(resourceKey);

    if (!application) {
      alert('Selecciona o escribe una aplicación para este recurso.');
      return;
    }

    button.disabled = true;
    const previous = button.textContent;
    button.textContent = 'Guardando…';

    try {
      await api('/devices/iot-resources', {
        method: 'POST',
        body: JSON.stringify({
          device_key: currentPayload.device.device_key,
          resource_key: resourceKey,
          application,
          display_name: displayName || resourceLabel(resource),
          settings: resource?.assignment?.settings || {},
          enabled,
        })
      });
      const refreshed = await api(`/devices/iot-resources?device_key=${encodeURIComponent(currentPayload.device.device_key)}`);
      renderModal(refreshed);
    } catch (error) {
      alert(`No se pudo guardar: ${error.message}`);
      button.disabled = false;
      button.textContent = previous;
    }
  }

  async function removeResource(resourceKey, button) {
    if (!currentPayload?.device?.device_key || !isManager()) return;
    if (!confirm(`¿Quitar la configuración de ${resourceLabel(resourceByKey(resourceKey))}?`)) return;

    button.disabled = true;
    const previous = button.textContent;
    button.textContent = 'Quitando…';

    try {
      await api('/devices/iot-resources', {
        method: 'POST',
        body: JSON.stringify({
          device_key: currentPayload.device.device_key,
          resource_key: resourceKey,
          remove: true,
        })
      });
      const refreshed = await api(`/devices/iot-resources?device_key=${encodeURIComponent(currentPayload.device.device_key)}`);
      renderModal(refreshed);
    } catch (error) {
      alert(`No se pudo quitar: ${error.message}`);
      button.disabled = false;
      button.textContent = previous;
    }
  }

  function syncButtons() {
    syncQueued = false;
    if (!isManager()) return;
    const grid = document.getElementById('tdGrid');
    if (!grid) return;

    grid.querySelectorAll('.td-card').forEach(card => {
      if (card.querySelector('.tayu-iot-card-actions')) return;
      const key = String(card.querySelector('.td-key')?.textContent || '').trim();
      if (!key) return;

      const actions = document.createElement('div');
      actions.className = 'tayu-iot-card-actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn ghost tayu-iot-config-button';
      button.dataset.deviceKey = key;
      button.textContent = '⚙ Configurar IoT';
      actions.appendChild(button);
      card.appendChild(actions);
    });
  }

  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    queueMicrotask(syncButtons);
  }

  function watchGrid() {
    const grid = document.getElementById('tdGrid');
    if (!grid || gridObserver) return Boolean(grid);

    gridObserver = new MutationObserver(queueSync);
    gridObserver.observe(grid, { childList: true, subtree: true });
    syncButtons();
    return true;
  }

  function installClickHandler() {
    if (document.documentElement.dataset.tayuIotResourceClicks === '1') return;
    document.documentElement.dataset.tayuIotResourceClicks = '1';

    document.addEventListener('click', event => {
      const button = event.target?.closest?.('.tayu-iot-config-button');
      if (!button || !isManager()) return;
      event.preventDefault();
      loadDeviceResources(button.dataset.deviceKey);
    });
  }

  function boot() {
    injectStyles();
    ensureDatalist();
    ensureModal();
    installClickHandler();

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (watchGrid()) {
        queueSync();
        if (isManager() || attempts >= 120) clearInterval(timer);
      }
      if (attempts >= 120) clearInterval(timer);
    }, 100);

    window.addEventListener('tayu:client-access-ready', () => {
      watchGrid();
      queueSync();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
