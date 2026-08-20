(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const state = {
    organizations: [],
    organizationId: '',
    devices: [],
    sites: [],
    profiles: [],
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
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
    try {
      await kc.updateToken(60);
    } catch {
      throw new Error('La sesión expiró. Vuelve a iniciar sesión.');
    }

    const response = await fetch(API_URL + path, {
      ...options,
      headers: {
        Authorization: `Bearer ${kc.token}`,
        ...(options.headers || {}),
      },
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
    if (document.getElementById('tayuDevicesStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuDevicesStyles';
    style.textContent = `
      .devices-toolbar{display:grid;grid-template-columns:minmax(240px,1fr) minmax(220px,1fr) auto;gap:10px;align-items:end;margin-bottom:14px}
      .device-row{cursor:default!important}
      .device-credential-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .device-secret{display:flex;gap:8px;align-items:stretch}
      .device-secret input{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
      .device-credential-note{margin:0 0 14px;padding:12px;border:1px solid rgba(217,119,6,.25);background:rgba(217,119,6,.08);color:var(--warn);border-radius:13px;font-size:12px;font-weight:800;line-height:1.5}
      .device-copy-ok{font-size:11px;color:var(--brand-dark);font-weight:800;margin-top:8px;min-height:16px}
      @media(max-width:760px){.devices-toolbar,.device-credential-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function injectUI() {
    injectStyles();

    const nav = document.querySelector('.nav');
    if (nav && !nav.querySelector('[data-view="devices-admin"]')) {
      const old = [...nav.querySelectorAll('button')]
        .find((button) => button.textContent.includes('Dispositivos'));
      if (old) {
        const button = document.createElement('button');
        button.dataset.view = 'devices-admin';
        button.textContent = '◈ Dispositivos';
        button.addEventListener('click', () => window.goDevicesView(button));
        old.replaceWith(button);
      }
    }

    const main = document.querySelector('main.main');
    if (main && !document.getElementById('devices-admin')) {
      main.insertAdjacentHTML('beforeend', `
        <section id="devices-admin" class="view">
          <div class="card">
            <div class="section-head">
              <div>
                <h2>Dispositivos</h2>
                <p>Registro, perfil, sitio y credenciales MQTT administradas.</p>
              </div>
              <button id="newDeviceButton" class="btn" type="button">＋ Nuevo dispositivo</button>
            </div>
            <div class="devices-toolbar">
              <div class="field">
                <label>Empresa</label>
                <select id="devicesOrganization"></select>
              </div>
              <div class="field">
                <label>Buscar</label>
                <input id="devicesSearch" placeholder="Nombre o device key">
              </div>
              <button id="reloadDevicesButton" class="btn ghost" type="button">↻ Recargar</button>
            </div>
            <div id="devicesViewSuccess"></div>
            <div id="devicesViewError" class="error-box"></div>
            <div id="devicesHost"><div class="empty">Selecciona una empresa.</div></div>
          </div>
        </section>
      `);

      document.getElementById('devicesOrganization')?.addEventListener('change', async (event) => {
        state.organizationId = event.target.value || '';
        await loadDevicesForSelectedOrganization();
      });
      document.getElementById('devicesSearch')?.addEventListener('input', renderDevicesView);
      document.getElementById('reloadDevicesButton')?.addEventListener('click', loadDevicesWorkspace);
      document.getElementById('newDeviceButton')?.addEventListener('click', openDeviceCreator);
    }

    if (!document.getElementById('deviceAdminModal')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="deviceAdminModal" class="modal">
          <div class="modal-card medium">
            <div class="modal-head">
              <div>
                <h2>Nuevo dispositivo</h2>
                <p id="deviceAdminSubtitle">—</p>
              </div>
              <button id="closeDeviceAdmin" class="close" type="button">×</button>
            </div>
            <div id="deviceAdminError" class="error-box"></div>
            <div id="deviceAdminBody"></div>
          </div>
        </div>
      `);
      document.getElementById('closeDeviceAdmin')?.addEventListener('click', closeDeviceCreator);
      document.getElementById('deviceAdminModal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) closeDeviceCreator();
      });
    }

    if (!document.getElementById('deviceCredentialsModal')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="deviceCredentialsModal" class="modal">
          <div class="modal-card medium">
            <div class="modal-head">
              <div>
                <h2 id="deviceCredentialsTitle">Credenciales MQTT</h2>
                <p id="deviceCredentialsSubtitle">—</p>
              </div>
              <button id="closeDeviceCredentials" class="close" type="button">×</button>
            </div>
            <div id="deviceCredentialsBody"></div>
          </div>
        </div>
      `);
      document.getElementById('closeDeviceCredentials')?.addEventListener('click', closeCredentials);
      document.getElementById('deviceCredentialsModal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) closeCredentials();
      });
    }

    enhanceOrganizationDevicesTab();
  }

  function setViewError(message = '') {
    const el = document.getElementById('devicesViewError');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('show', Boolean(message));
  }

  function setViewSuccess(message = '') {
    const el = document.getElementById('devicesViewSuccess');
    if (!el) return;
    el.innerHTML = message ? `<div class="success">${esc(message)}</div>` : '';
  }

  function setModalError(message = '') {
    const el = document.getElementById('deviceAdminError');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('show', Boolean(message));
  }

  function statusClass(status) {
    if (status === 'active' || status === 'online') return '';
    if (status === 'pending_provisioning') return 'warn';
    return 'off';
  }

  function profileLabel(device) {
    return device.profile_key || device.device_type || '—';
  }

  async function loadOrganizations() {
    state.organizations = await api('/admin/organizations');
    const select = document.getElementById('devicesOrganization');
    if (!select) return;

    const previous = state.organizationId || select.value;
    select.innerHTML = state.organizations.length
      ? state.organizations.map((org) => `<option value="${esc(org.id)}">${esc(org.name)}</option>`).join('')
      : '<option value="">Sin empresas</option>';

    if (previous && state.organizations.some((org) => org.id === previous)) {
      select.value = previous;
    }

    state.organizationId = select.value || '';
  }

  async function loadProfiles() {
    const rows = await api('/admin/device-profiles');
    state.profiles = Array.isArray(rows) ? rows : [];
  }

  async function loadDevicesForSelectedOrganization() {
    setViewError('');
    setViewSuccess('');
    const host = document.getElementById('devicesHost');

    if (!state.organizationId) {
      state.devices = [];
      state.sites = [];
      if (host) host.innerHTML = '<div class="empty">No hay una empresa seleccionada.</div>';
      return;
    }

    if (host) host.innerHTML = '<div class="empty">Cargando dispositivos…</div>';

    try {
      const q = `?organization_id=${encodeURIComponent(state.organizationId)}`;
      const [devices, sites] = await Promise.all([
        api('/admin/organization/devices' + q),
        api('/admin/organization/sites' + q),
      ]);
      state.devices = Array.isArray(devices) ? devices : [];
      state.sites = Array.isArray(sites) ? sites : [];
      renderDevicesView();
    } catch (error) {
      setViewError(error.message);
      if (host) host.innerHTML = '<div class="empty">No se pudieron cargar los dispositivos.</div>';
    }
  }

  async function loadDevicesWorkspace() {
    setViewError('');
    try {
      await Promise.all([loadOrganizations(), loadProfiles()]);
      await loadDevicesForSelectedOrganization();
    } catch (error) {
      setViewError(error.message);
    }
  }

  function renderDevicesView() {
    const host = document.getElementById('devicesHost');
    if (!host) return;
    const q = (document.getElementById('devicesSearch')?.value || '').trim().toLowerCase();
    const rows = state.devices.filter((device) => !q || `${device.name || ''} ${device.device_key || ''} ${device.device_type || ''} ${device.profile_key || ''}`.toLowerCase().includes(q));

    if (!rows.length) {
      host.innerHTML = '<div class="empty">No hay dispositivos que coincidan.</div>';
      return;
    }

    host.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Dispositivo</th>
              <th>Perfil</th>
              <th>Sitio</th>
              <th>Estado</th>
              <th>Administrativo</th>
              <th>MQTT</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((device) => `
              <tr class="device-row">
                <td><b>${esc(device.name)}</b><br><span class="muted">${esc(device.device_key)}</span></td>
                <td>${esc(profileLabel(device))}</td>
                <td>${esc(device.site_name || 'Sin sitio')}</td>
                <td><span class="pill ${statusClass(device.status)}">${esc(device.status || 'offline')}</span></td>
                <td><span class="pill ${statusClass(device.administrative_status)}">${esc(device.administrative_status || 'active')}</span></td>
                <td>${device.mqtt_provisioned
                  ? `<span class="pill blue">Administrado · v${Number(device.credential_version || 1)}</span><br><span class="muted">${esc(device.mqtt_username || '')}</span>`
                  : '<span class="muted">Legacy / no administrado</span>'}</td>
                <td>${device.mqtt_provisioned
                  ? `<button class="btn ghost small" type="button" data-regen-device="${esc(device.id)}">Regenerar MQTT</button>`
                  : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    host.querySelectorAll('[data-regen-device]').forEach((button) => {
      button.addEventListener('click', () => regenerateCredentials(button.dataset.regenDevice));
    });
  }

  function openDeviceCreator() {
    setModalError('');
    setViewSuccess('');

    if (!state.organizationId) {
      setViewError('Selecciona una empresa antes de crear un dispositivo.');
      return;
    }

    if (!state.profiles.length) {
      setViewError('No existen perfiles de dispositivo disponibles.');
      return;
    }

    const org = state.organizations.find((item) => item.id === state.organizationId);
    document.getElementById('deviceAdminSubtitle').textContent = org?.name || 'Empresa';

    const siteOptions = [
      '<option value="">Sin sitio</option>',
      ...state.sites.map((site) => `<option value="${esc(site.id)}">${esc(site.name)}</option>`),
    ].join('');

    document.getElementById('deviceAdminBody').innerHTML = `
      <form id="deviceAdminForm">
        <div class="form-grid">
          <div class="field">
            <label>Empresa</label>
            <div class="user-identity-readonly">${esc(org?.name || state.organizationId)}</div>
          </div>
          <div class="field">
            <label>Perfil *</label>
            <select name="profile_key" required>
              ${state.profiles.map((profile) => `<option value="${esc(profile.profile_key)}">${esc(profile.display_name)} · ${esc(profile.profile_key)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Nombre *</label>
            <input name="name" required maxlength="200" placeholder="Ej: NOVA EDGE 02">
          </div>
          <div class="field">
            <label>Device key *</label>
            <input name="device_key" required maxlength="100" pattern="[A-Za-z0-9][A-Za-z0-9._-]*" placeholder="NOVA-EDGE-002" autocomplete="off">
          </div>
          <div class="field">
            <label>Sitio</label>
            <select name="site_id">${siteOptions}</select>
          </div>
          <div class="field">
            <label>Estado administrativo</label>
            <select name="administrative_status">
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
          </div>
          <div class="field full">
            <div class="notice">Al crear el dispositivo, TAYULABS generará automáticamente una contraseña MQTT. La contraseña se mostrará una sola vez y no se guarda en texto plano en la base de datos.</div>
          </div>
        </div>
        <div class="form-actions">
          <button id="cancelDeviceAdmin" type="button" class="btn ghost">Cancelar</button>
          <button type="submit" class="btn">Crear dispositivo</button>
        </div>
      </form>
    `;

    const form = document.getElementById('deviceAdminForm');
    form.addEventListener('submit', createDevice);
    document.getElementById('cancelDeviceAdmin')?.addEventListener('click', closeDeviceCreator);
    document.getElementById('deviceAdminModal').classList.add('open');
  }

  function closeDeviceCreator() {
    setModalError('');
    const body = document.getElementById('deviceAdminBody');
    if (body) body.innerHTML = '';
    document.getElementById('deviceAdminModal')?.classList.remove('open');
  }

  async function createDevice(event) {
    event.preventDefault();
    setModalError('');

    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    const body = {
      organization_id: state.organizationId,
      profile_key: form.profile_key.value,
      name: form.name.value.trim(),
      device_key: form.device_key.value.trim(),
      site_id: form.site_id.value || null,
      administrative_status: form.administrative_status.value,
    };

    try {
      const created = await post('/admin/organization/devices', body);
      closeDeviceCreator();
      await loadDevicesForSelectedOrganization();
      setViewSuccess(`Dispositivo ${created.device_key} creado correctamente.`);
      showCredentials(created, 'Credenciales MQTT generadas');
      if (typeof window.refreshAll === 'function') window.refreshAll();
    } catch (error) {
      setModalError(error.message);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function regenerateCredentials(deviceId) {
    const device = state.devices.find((item) => String(item.id) === String(deviceId));
    if (!device) return;

    const ok = window.confirm(
      `Regenerar las credenciales MQTT de ${device.device_key}?\n\nLa contraseña anterior dejará de funcionar inmediatamente.`
    );
    if (!ok) return;

    setViewError('');
    setViewSuccess('');

    try {
      const result = await post('/admin/organization/device/mqtt/regenerate', {
        organization_id: state.organizationId,
        device_id: device.id,
      });
      await loadDevicesForSelectedOrganization();
      setViewSuccess(`Credenciales MQTT regeneradas para ${device.device_key}.`);
      showCredentials(result, 'Credenciales MQTT regeneradas');
    } catch (error) {
      setViewError(error.message);
    }
  }

  function credentialField(label, value, secret = false) {
    const id = `cred-${Math.random().toString(36).slice(2)}`;
    return `
      <div class="field">
        <label>${esc(label)}</label>
        <div class="device-secret">
          <input id="${id}" type="${secret ? 'password' : 'text'}" readonly autocomplete="off" value="${esc(value)}">
          ${secret ? `<button class="btn ghost small" type="button" data-toggle-secret="${id}">Ver</button>` : ''}
          <button class="btn ghost small" type="button" data-copy-field="${id}">Copiar</button>
        </div>
      </div>
    `;
  }

  function showCredentials(result, title) {
    const mqtt = result?.mqtt;
    if (!mqtt?.username || !mqtt?.password) {
      setViewError('La operación terminó, pero la respuesta no incluyó las credenciales MQTT de una sola visualización.');
      return;
    }

    document.getElementById('deviceCredentialsTitle').textContent = title;
    document.getElementById('deviceCredentialsSubtitle').textContent = result.device_key || 'Dispositivo';

    const body = document.getElementById('deviceCredentialsBody');
    body.innerHTML = `
      <div class="device-credential-note">Guarda estas credenciales ahora. La contraseña se muestra una sola vez; al cerrar esta ventana TAYULABS Cloud la elimina del DOM y no podrá recuperarla. Si se pierde, deberás regenerarla.</div>
      <div class="device-credential-grid">
        ${credentialField('Host', mqtt.host || '')}
        ${credentialField('Puerto', String(mqtt.port ?? ''))}
        ${credentialField('TLS', mqtt.tls ? 'Sí' : 'No')}
        ${credentialField('Usuario MQTT', mqtt.username || '')}
        ${credentialField('Contraseña MQTT', mqtt.password || '', true)}
        ${credentialField('Telemetry topic', mqtt.telemetry_topic || '')}
        ${credentialField('Command topic', mqtt.command_topic || '')}
      </div>
      <div id="deviceCopyStatus" class="device-copy-ok"></div>
      <div class="form-actions">
        <button id="doneDeviceCredentials" class="btn" type="button">Ya guardé las credenciales</button>
      </div>
    `;

    body.querySelectorAll('[data-copy-field]').forEach((button) => {
      button.addEventListener('click', async () => {
        const input = document.getElementById(button.dataset.copyField);
        if (!input) return;
        try {
          await navigator.clipboard.writeText(input.value);
          const status = document.getElementById('deviceCopyStatus');
          if (status) status.textContent = 'Copiado al portapapeles.';
        } catch {
          input.select();
          document.execCommand('copy');
        }
      });
    });

    body.querySelectorAll('[data-toggle-secret]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.toggleSecret);
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        button.textContent = input.type === 'password' ? 'Ver' : 'Ocultar';
      });
    });

    document.getElementById('doneDeviceCredentials')?.addEventListener('click', closeCredentials);
    document.getElementById('deviceCredentialsModal').classList.add('open');
  }

  function closeCredentials() {
    const body = document.getElementById('deviceCredentialsBody');
    if (body) {
      body.querySelectorAll('input').forEach((input) => { input.value = ''; });
      body.innerHTML = '';
    }
    document.getElementById('deviceCredentialsModal')?.classList.remove('open');
  }

  function enhanceOrganizationDevicesTab() {
    const tab = document.getElementById('tab-devices');
    if (!tab || tab.dataset.devicesEnhancer === '1') return;
    tab.dataset.devicesEnhancer = '1';

    const observer = new MutationObserver(() => {
      if (!tab.innerHTML || tab.querySelector('[data-manage-devices]')) return;
      const bar = document.createElement('div');
      bar.className = 'section-head';
      bar.dataset.manageDevices = '1';
      bar.innerHTML = `
        <div><h3>Dispositivos de la empresa</h3><p>El registro y las credenciales MQTT se administran desde la sección Dispositivos.</p></div>
        <button class="btn small" type="button">Administrar dispositivos</button>
      `;
      bar.querySelector('button').addEventListener('click', async () => {
        try {
          if (!state.organizations.length) await loadOrganizations();
          const slug = document.getElementById('orgModalSubtitle')?.textContent?.trim();
          const org = state.organizations.find((item) => item.slug === slug);
          if (org) state.organizationId = org.id;
          if (typeof window.closeOrganizationModal === 'function') window.closeOrganizationModal();
          const button = document.querySelector('.nav [data-view="devices-admin"]');
          window.goDevicesView(button);
        } catch (error) {
          setViewError(error.message);
        }
      });
      tab.prepend(bar);
    });

    observer.observe(tab, { childList: true });
  }

  window.goDevicesView = async (button) => {
    injectUI();
    if (typeof window.goView === 'function') window.goView('devices-admin', button);
    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');
    if (title) title.textContent = 'Dispositivos';
    if (subtitle) subtitle.textContent = 'Perfiles, sitios y aprovisionamiento MQTT.';
    await loadDevicesWorkspace();
  };

  function boot() {
    injectUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
