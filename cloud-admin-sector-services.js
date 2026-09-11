(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';

  const GENERAL_MODULES = [
    ['dashboard', 'Dashboard', 'Vista principal de la plataforma'],
    ['alarmas', 'Alarmas', 'Alarmas y eventos transversales'],
    ['sensores', 'Sensores', 'Lecturas e históricos IoT'],
    ['dispositivos', 'Dispositivos', 'Inventario y gestión de equipos'],
    ['tramas', 'Tramas', 'Telemetría y mensajes recibidos'],
    ['modbus', 'Equipos Modbus', 'Variables y equipos RS485 / Modbus'],
    ['configuracion', 'Configuración', 'Ajustes de la plataforma'],
    ['flotas', 'Flotas', 'Seguimiento y operación vehicular'],
  ];

  const SECTORS = [
    { key: 'fincas', label: 'Fincas', description: 'Agricultura y operaciones de campo.' },
    { key: 'camaroneras', label: 'Fincas Camaroneras', description: 'Producción acuícola, piscinas y automatización.' },
    { key: 'bananeras', label: 'Bananeras', description: 'Gestión e IoT para producción bananera.' },
    { key: 'ganaderia', label: 'Ganadería', description: 'Gestión pecuaria, trazabilidad e IoT.' },
  ];

  const KNOWN_KEYS = new Set([
    ...GENERAL_MODULES.map(([key]) => key),
    ...SECTORS.flatMap(({ key }) => [key, `${key}.iot`, `${key}.erp`]),
  ]);

  const state = {
    organizationId: null,
    rows: [],
    rendering: false,
    wrapped: false,
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function getKeycloak() {
    for (let i = 0; i < 100; i += 1) {
      const kc = window.__tayuKeycloak;
      if (kc?.authenticated && kc?.token) return kc;
      await sleep(100);
    }
    throw new Error('No hay una sesión administrativa activa.');
  }

  async function request(path, options = {}) {
    const kc = await getKeycloak();
    await kc.updateToken(30);
    const response = await fetch(API_URL + path, {
      ...options,
      headers: {
        Authorization: `Bearer ${kc.token}`,
        ...(options.headers || {}),
      },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `API ${response.status}`);
    return data;
  }

  const api = (path) => request(path);
  const post = (path, body) => request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  function injectStyles() {
    if (document.getElementById('tayuSectorServicesStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuSectorServicesStyles';
    style.textContent = `
      .sector-services-wrap{display:grid;gap:18px}
      .sector-services-title{margin:0 0 4px}.sector-services-subtitle{margin:0;color:var(--muted);font-size:13px;line-height:1.5}
      .sector-general-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
      .sector-general-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--panel2)}
      .sector-general-item.enabled{border-color:rgba(85,198,43,.35);background:rgba(85,198,43,.07)}
      .sector-general-item b{display:block}.sector-general-item small{display:block;color:var(--muted);font-size:11px;line-height:1.35;margin-top:3px}.sector-general-item input{width:auto}
      .sector-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .sector-card{border:1px solid var(--border);border-radius:17px;background:var(--panel2);padding:14px}
      .sector-card.active{border-color:rgba(85,198,43,.38);box-shadow:0 0 0 1px rgba(85,198,43,.08) inset}
      .sector-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      .sector-card-head h4{margin:0;font-size:16px}.sector-card-head p{margin:4px 0 0;color:var(--muted);font-size:12px;line-height:1.35}
      .sector-enable{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:900;white-space:nowrap}.sector-enable input{width:auto}
      .sector-service-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
      .sector-service{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px;border-radius:13px;border:1px solid var(--border);background:var(--panel)}
      .sector-service.enabled{border-color:rgba(37,99,235,.28);background:rgba(37,99,235,.06)}
      .sector-service b{display:block;font-size:13px}.sector-service small{display:block;color:var(--muted);font-size:10.5px;margin-top:3px}.sector-service input{width:auto}
      .sector-service.disabled{opacity:.5}
      .sector-note{padding:11px 13px;border-radius:13px;border:1px solid rgba(37,99,235,.18);background:rgba(37,99,235,.055);color:var(--muted);font-size:12px;line-height:1.5}
      .sector-extras{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
      @media(max-width:950px){.sector-general-grid,.sector-extras{grid-template-columns:repeat(2,minmax(0,1fr))}.sector-grid{grid-template-columns:1fr}}
      @media(max-width:620px){.sector-general-grid,.sector-extras,.sector-service-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function rowMap(rows = state.rows) {
    return new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row.module), Boolean(row.enabled)]));
  }

  function hasExplicit(rows, key) {
    return (Array.isArray(rows) ? rows : []).some((row) => String(row.module) === key);
  }

  function sectorValues(rows, sectorKey) {
    const map = rowMap(rows);
    const parent = Boolean(map.get(sectorKey));
    const iotKey = `${sectorKey}.iot`;
    const erpKey = `${sectorKey}.erp`;

    // Compatibilidad con empresas antiguas: un sector ya habilitado equivalía
    // a la experiencia IoT que existe actualmente.
    const iot = hasExplicit(rows, iotKey) ? Boolean(map.get(iotKey)) : parent;
    const erp = hasExplicit(rows, erpKey) ? Boolean(map.get(erpKey)) : false;

    return {
      parent: parent || iot || erp,
      iot,
      erp,
    };
  }

  function generalCard(key, label, description, enabled, inputName = 'module') {
    return `<label class="sector-general-item ${enabled ? 'enabled' : ''}">
      <span><b>${esc(label)}</b><small>${esc(description)}</small></span>
      <input type="checkbox" name="${esc(inputName)}" value="${esc(key)}" data-general="${esc(key)}" ${enabled ? 'checked' : ''}>
    </label>`;
  }

  function sectorCard(sector, values, inputName = 'module') {
    const { key, label, description } = sector;
    return `<div class="sector-card ${values.parent ? 'active' : ''}" data-sector-card="${esc(key)}">
      <div class="sector-card-head">
        <div><h4>${esc(label)}</h4><p>${esc(description)}</p></div>
        <label class="sector-enable">Habilitar sector
          <input type="checkbox" name="${esc(inputName)}" value="${esc(key)}" data-sector-parent="${esc(key)}" ${values.parent ? 'checked' : ''}>
        </label>
      </div>
      <div class="sector-service-grid">
        <label class="sector-service ${values.iot ? 'enabled' : ''} ${values.parent ? '' : 'disabled'}">
          <span><b>IoT / Automatización</b><small>Sensores, dispositivos, control y telemetría.</small></span>
          <input type="checkbox" name="${esc(inputName)}" value="${esc(key)}.iot" data-sector-service="${esc(key)}" data-service-kind="iot" ${values.iot ? 'checked' : ''} ${values.parent ? '' : 'disabled'}>
        </label>
        <label class="sector-service ${values.erp ? 'enabled' : ''} ${values.parent ? '' : 'disabled'}">
          <span><b>ERP / Gestión</b><small>Operación, producción, inventario, costos y reportes.</small></span>
          <input type="checkbox" name="${esc(inputName)}" value="${esc(key)}.erp" data-sector-service="${esc(key)}" data-service-kind="erp" ${values.erp ? 'checked' : ''} ${values.parent ? '' : 'disabled'}>
        </label>
      </div>
    </div>`;
  }

  function wireForm(host) {
    host.querySelectorAll('[data-general]').forEach((input) => {
      input.addEventListener('change', () => {
        input.closest('.sector-general-item')?.classList.toggle('enabled', input.checked);
      });
    });

    host.querySelectorAll('[data-sector-parent]').forEach((parent) => {
      parent.addEventListener('change', () => {
        const key = parent.dataset.sectorParent;
        const card = host.querySelector(`[data-sector-card="${CSS.escape(key)}"]`);
        const services = host.querySelectorAll(`[data-sector-service="${CSS.escape(key)}"]`);
        card?.classList.toggle('active', parent.checked);
        services.forEach((service) => {
          service.disabled = !parent.checked;
          if (!parent.checked) service.checked = false;
          service.closest('.sector-service')?.classList.toggle('disabled', !parent.checked);
          service.closest('.sector-service')?.classList.toggle('enabled', parent.checked && service.checked);
        });
      });
    });

    host.querySelectorAll('[data-sector-service]').forEach((service) => {
      service.addEventListener('change', () => {
        const key = service.dataset.sectorService;
        const parent = host.querySelector(`[data-sector-parent="${CSS.escape(key)}"]`);
        if (service.checked && parent && !parent.checked) {
          parent.checked = true;
          parent.dispatchEvent(new Event('change'));
          service.checked = true;
        }
        service.closest('.sector-service')?.classList.toggle('enabled', service.checked);
      });
    });
  }

  function renderOrganizationModules(rows = state.rows) {
    const host = document.getElementById('tab-modules');
    if (!host || !state.organizationId) return;

    const map = rowMap(rows);
    const extras = (Array.isArray(rows) ? rows : [])
      .filter((row) => !KNOWN_KEYS.has(String(row.module)))
      .sort((a, b) => String(a.module).localeCompare(String(b.module)));

    state.rendering = true;
    host.innerHTML = `<div class="sector-services-wrap" data-sector-services-ui="1">
      <div>
        <h3 class="sector-services-title">Módulos y servicios contratados</h3>
        <p class="sector-services-subtitle">Configura los módulos generales y define si cada sector utiliza IoT, ERP o ambos.</p>
      </div>

      <div>
        <div class="section-head"><div><h3>Módulos generales</h3><p>Herramientas transversales disponibles para esta organización.</p></div></div>
        <div class="sector-general-grid">
          ${GENERAL_MODULES.map(([key, label, description]) => generalCard(key, label, description, Boolean(map.get(key)))).join('')}
        </div>
      </div>

      <div>
        <div class="section-head"><div><h3>Sectores y servicios</h3><p>IoT y ERP se contratan de forma independiente dentro de cada sector.</p></div></div>
        <div class="sector-grid">
          ${SECTORS.map((sector) => sectorCard(sector, sectorValues(rows, sector.key))).join('')}
        </div>
      </div>

      <div class="sector-note"><b>Cómo funciona:</b> si un sector tiene solo IoT, el cliente verá automatización y monitoreo; si tiene solo ERP, verá gestión; si tiene ambos, ambas experiencias convivirán dentro del mismo sector. Alarmas, Sensores, Dispositivos, Tramas y Equipos Modbus siguen siendo herramientas IoT globales configurables.</div>

      ${extras.length ? `<div>
        <div class="section-head"><div><h3>Otros módulos existentes</h3><p>Se conservan para no alterar configuraciones previas.</p></div></div>
        <div class="sector-extras">${extras.map((row) => generalCard(String(row.module), String(row.module), 'Módulo existente', Boolean(row.enabled))).join('')}</div>
      </div>` : ''}

      <div class="form-actions"><button id="saveSectorServices" class="btn" type="button">Guardar módulos y servicios</button></div>
    </div>`;
    state.rendering = false;

    wireForm(host);
    document.getElementById('saveSectorServices')?.addEventListener('click', saveOrganizationModules);
  }

  async function loadOrganizationModules() {
    if (!state.organizationId) return;
    const rows = await api(`/admin/organization/modules?organization_id=${encodeURIComponent(state.organizationId)}`);
    state.rows = Array.isArray(rows) ? rows : [];
    renderOrganizationModules(state.rows);
  }

  async function saveOrganizationModules() {
    const host = document.getElementById('tab-modules');
    if (!host || !state.organizationId) return;

    const existingKeys = (state.rows || []).map((row) => String(row.module));
    const allKeys = new Set([...KNOWN_KEYS, ...existingKeys]);
    const enabledKeys = new Set();

    host.querySelectorAll('input[type="checkbox"][value]:checked').forEach((input) => {
      enabledKeys.add(String(input.value));
    });

    // Si hay un servicio activo, el sector padre debe quedar activo también.
    for (const sector of SECTORS) {
      if (enabledKeys.has(`${sector.key}.iot`) || enabledKeys.has(`${sector.key}.erp`)) {
        enabledKeys.add(sector.key);
      }
    }

    const button = document.getElementById('saveSectorServices');
    if (button) {
      button.disabled = true;
      button.textContent = 'Guardando…';
    }

    try {
      await post('/admin/organization/modules', {
        organization_id: state.organizationId,
        modules: [...allKeys].map((module) => ({
          module,
          enabled: enabledKeys.has(module),
        })),
      });

      const success = document.getElementById('orgSuccess');
      if (success) success.innerHTML = '<div class="success">Módulos y servicios actualizados correctamente.</div>';

      await loadOrganizationModules();
      const count = state.rows.filter((row) => row.enabled).length;
      const counter = document.getElementById('orgModulesCount');
      if (counter) counter.textContent = count;
    } catch (error) {
      const box = document.getElementById('orgError');
      if (box) {
        box.textContent = error.message;
        box.classList.add('show');
      }
    } finally {
      if (button && document.body.contains(button)) {
        button.disabled = false;
        button.textContent = 'Guardar módulos y servicios';
      }
    }
  }

  function renderCreateModules() {
    const host = document.getElementById('createModules');
    if (!host) return;

    host.className = '';
    host.innerHTML = `<div class="sector-services-wrap" data-sector-create-ui="1">
      <div>
        <h3 class="sector-services-title">Módulos generales</h3>
        <div class="sector-general-grid" style="margin-top:10px">
          ${GENERAL_MODULES.map(([key, label, description]) => generalCard(key, label, description, false, 'initial_module')).join('')}
        </div>
      </div>
      <div>
        <h3 class="sector-services-title">Sectores y servicios</h3>
        <p class="sector-services-subtitle">Selecciona qué contrata la nueva empresa desde el inicio.</p>
        <div class="sector-grid" style="margin-top:10px">
          ${SECTORS.map((sector) => sectorCard(sector, { parent: false, iot: false, erp: false }, 'initial_module')).join('')}
        </div>
      </div>
    </div>`;
    wireForm(host);
  }

  function wrapOpenOrganization() {
    const original = window.openOrganization;
    if (typeof original !== 'function' || original.__tayuSectorServicesWrapped) return;

    const wrapped = async function (id, ...args) {
      state.organizationId = String(id || '');
      const result = await original.call(this, id, ...args);
      await loadOrganizationModules().catch((error) => console.warn('TAYULABS sector services:', error));
      return result;
    };
    wrapped.__tayuSectorServicesWrapped = true;
    wrapped.__tayuSectorServicesOriginal = original;
    window.openOrganization = wrapped;
  }

  function wrapCloseOrganization() {
    const original = window.closeOrganizationModal;
    if (typeof original !== 'function' || original.__tayuSectorServicesWrapped) return;
    const wrapped = function (...args) {
      state.organizationId = null;
      state.rows = [];
      return original.apply(this, args);
    };
    wrapped.__tayuSectorServicesWrapped = true;
    window.closeOrganizationModal = wrapped;
  }

  function wrapCreateOrganization() {
    const original = window.openCreateOrganization;
    if (typeof original !== 'function' || original.__tayuSectorServicesWrapped) return;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      queueMicrotask(renderCreateModules);
      return result;
    };
    wrapped.__tayuSectorServicesWrapped = true;
    window.openCreateOrganization = wrapped;
  }

  function installObserver() {
    const host = document.getElementById('tab-modules');
    if (!host || host.__tayuSectorObserver) return;
    host.__tayuSectorObserver = true;

    new MutationObserver(() => {
      if (state.rendering || !state.organizationId) return;
      if (!host.querySelector('[data-sector-services-ui="1"]')) {
        queueMicrotask(() => loadOrganizationModules().catch((error) => console.warn('TAYULABS sector services:', error)));
      }
    }).observe(host, { childList: true });
  }

  function boot() {
    injectStyles();
    installObserver();
    wrapOpenOrganization();
    wrapCloseOrganization();
    wrapCreateOrganization();

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      injectStyles();
      installObserver();
      wrapOpenOrganization();
      wrapCloseOrganization();
      wrapCreateOrganization();
      if (attempts >= 120 || (
        window.openOrganization?.__tayuSectorServicesWrapped &&
        window.openCreateOrganization?.__tayuSectorServicesWrapped
      )) clearInterval(timer);
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
