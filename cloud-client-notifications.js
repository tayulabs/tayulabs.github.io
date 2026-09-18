(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const ALLOWED_ROLES = new Set(['owner', 'admin']);
  const state = {
    loaded: false,
    tab: 'destinations',
    channels: [],
    destinations: [],
    policies: [],
    deliveries: [],
    summary: {},
    editingDestination: null,
    editingPolicy: null,
  };

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function role() {
    return String(window.__tayuClientAccess?.role || '').trim().toLowerCase();
  }

  function allowed() {
    return ALLOWED_ROLES.has(role());
  }

  function list(data, key) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.[key])) return data[key];
    return [];
  }

  async function request(path, options = {}) {
    const kc = window.__tayuEntryKeycloak || window.__tayuKeycloak;
    if (!kc?.authenticated || !kc?.token) throw new Error('Sesión no disponible.');

    try {
      await kc.updateToken(30);
    } catch (_) {}

    const response = await fetch(API_URL + path, {
      cache: 'no-store',
      ...options,
      headers: {
        Authorization: 'Bearer ' + kc.token,
        ...(typeof window.__tayuOrganizationHeaders === 'function'
          ? window.__tayuOrganizationHeaders()
          : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || ('API ' + response.status));
    }
    return data;
  }

  function setStatus(message, type = '') {
    const el = document.getElementById('tayuNotificationsStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'tayu-notifications-status' + (type ? ' ' + type : '');
  }

  function installStyles() {
    if (document.getElementById('tayuNotificationsStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuNotificationsStyles';
    style.textContent = `
      .nav .tayu-notifications-nav{
        width:100%;display:flex;align-items:center;gap:0;margin:6px 0;padding:13px 14px;
        border:0;background:transparent;color:var(--muted);border-radius:16px;
        font-weight:800;text-align:left;cursor:pointer;text-decoration:none;font-family:inherit;font-size:inherit
      }
      .nav .tayu-notifications-nav:hover,.nav .tayu-notifications-nav.active{
        background:rgba(85,198,43,.12);color:var(--text)
      }
      .tayu-notifications-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}
      .tayu-notifications-tab{
        border:1px solid var(--border);background:var(--panel2);color:var(--text);
        padding:10px 14px;border-radius:12px;font-weight:850;cursor:pointer
      }
      .tayu-notifications-tab.active{background:var(--brand);border-color:var(--brand);color:#fff}
      .tayu-notifications-panel{display:none}.tayu-notifications-panel.active{display:block}
      .tayu-notifications-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
      .tayu-notifications-summary>div{background:var(--panel2);border:1px solid var(--border);border-radius:16px;padding:14px}
      .tayu-notifications-summary span{display:block;color:var(--muted);font-size:12px;font-weight:850}
      .tayu-notifications-summary b{display:block;font-size:26px;margin-top:5px}
      .tayu-notifications-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0 20px}
      .tayu-notifications-form .full{grid-column:1/-1}
      .tayu-notifications-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .tayu-notifications-status{min-height:20px;margin:10px 0;font-size:13px;font-weight:800;color:var(--muted)}
      .tayu-notifications-status.ok{color:var(--brand)}.tayu-notifications-status.error{color:var(--danger)}
      .tayu-notifications-chip{display:inline-flex;padding:5px 9px;border-radius:999px;border:1px solid var(--border);font-size:11px;font-weight:900}
      .tayu-notifications-chip.on,.tayu-notifications-chip.sent{color:var(--brand)}
      .tayu-notifications-chip.failed{color:var(--danger)}
      .tayu-notifications-chip.queued,.tayu-notifications-chip.processing{color:var(--warning)}
      .tayu-notifications-channel-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
      .tayu-notifications-channel{border:1px solid var(--border);border-radius:18px;background:var(--panel2);padding:16px}
      .tayu-notifications-channel-head{display:flex;justify-content:space-between;gap:10px;align-items:center}
      .tayu-notifications-table .btn{padding:8px 10px;border-radius:10px;font-size:12px}
      .tayu-notifications-checks{display:flex;gap:14px;flex-wrap:wrap}
      .tayu-notifications-checks label{margin:0;display:flex;align-items:center;gap:6px}
      .tayu-notifications-checks input{width:auto}
      @media(max-width:960px){
        .tayu-notifications-summary,.tayu-notifications-form,.tayu-notifications-channel-grid{grid-template-columns:1fr}
        .tayu-notifications-form .full{grid-column:auto}
      }
    `;
    document.head.appendChild(style);
  }

  function injectView() {
    if (document.getElementById('notifications')) return;

    const section = document.createElement('section');
    section.id = 'notifications';
    section.className = 'view';
    section.innerHTML = `
      <div class="card">
        <div class="module-header">
          <div>
            <h3 style="margin:0">🔔 Notificaciones</h3>
            <p class="hint" style="margin:6px 0 0">Configura destinatarios, reglas de aviso y revisa el historial de entregas.</p>
          </div>
          <button class="btn ghost" type="button" id="tayuNotificationsRefresh">Actualizar</button>
        </div>

        <div class="tayu-notifications-summary">
          <div><span>Destinatarios</span><b id="tayuNotifDestCount">0</b></div>
          <div><span>Reglas activas</span><b id="tayuNotifPolicyCount">0</b></div>
          <div><span>En cola</span><b id="tayuNotifQueuedCount">0</b></div>
          <div><span>Fallidas</span><b id="tayuNotifFailedCount">0</b></div>
        </div>

        <div class="tayu-notifications-tabs">
          <button class="tayu-notifications-tab active" type="button" data-notif-tab="destinations">Destinatarios</button>
          <button class="tayu-notifications-tab" type="button" data-notif-tab="policies">Reglas</button>
          <button class="tayu-notifications-tab" type="button" data-notif-tab="channels">Canales</button>
          <button class="tayu-notifications-tab" type="button" data-notif-tab="history">Historial</button>
        </div>

        <div id="tayuNotificationsStatus" class="tayu-notifications-status"></div>

        <div class="tayu-notifications-panel active" data-notif-panel="destinations">
          <h3>Destinatarios</h3>
          <p class="hint">Para WhatsApp puedes registrar un grupo con su ID terminado en <code>@g.us</code>.</p>
          <form id="tayuNotifDestinationForm" class="tayu-notifications-form">
            <div><label>Nombre</label><input id="tayuNotifDestinationName" required placeholder="Ej: Operaciones"></div>
            <div><label>Canal</label><select id="tayuNotifDestinationChannel"><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="telegram">Telegram</option></select></div>
            <div><label>Tipo</label><select id="tayuNotifDestinationType"><option value="group">Grupo</option><option value="person">Persona</option><option value="endpoint">Endpoint</option></select></div>
            <div><label>Dirección / ID</label><input id="tayuNotifDestinationAddress" required placeholder="120...@g.us"></div>
            <div class="full tayu-notifications-actions">
              <label style="margin:0;display:flex;align-items:center;gap:7px"><input id="tayuNotifDestinationEnabled" type="checkbox" checked style="width:auto"> Activo</label>
              <button class="btn" type="submit">Guardar</button>
              <button class="btn ghost" id="tayuNotifDestinationCancel" type="button" hidden>Cancelar edición</button>
            </div>
          </form>
          <div class="table-wrap">
            <table class="table tayu-notifications-table">
              <thead><tr><th>Nombre</th><th>Canal</th><th>Tipo</th><th>Destino</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody id="tayuNotifDestinationsBody"></tbody>
            </table>
          </div>
        </div>

        <div class="tayu-notifications-panel" data-notif-panel="policies">
          <h3>Reglas de notificación</h3>
          <p class="hint">En esta primera versión, las reglas creadas desde la interfaz se aplican a toda la organización.</p>
          <form id="tayuNotifPolicyForm" class="tayu-notifications-form">
            <div><label>Nombre</label><input id="tayuNotifPolicyName" required placeholder="Ej: Alertas críticas"></div>
            <div><label>Evento</label><select id="tayuNotifPolicyEvent"><option value="alarm_opened">Alarma activada</option><option value="alarm_resolved">Alarma recuperada</option></select></div>
            <div class="full"><label>Descripción</label><input id="tayuNotifPolicyDescription" placeholder="Opcional"></div>
            <div class="full">
              <label>Severidades</label>
              <div class="tayu-notifications-checks">
                <label><input name="tayuNotifSeverity" type="checkbox" value="info" checked> Información</label>
                <label><input name="tayuNotifSeverity" type="checkbox" value="warning" checked> Advertencia</label>
                <label><input name="tayuNotifSeverity" type="checkbox" value="critical" checked> Crítica</label>
              </div>
            </div>
            <div class="full">
              <label>Destinatarios</label>
              <div id="tayuNotifPolicyDestinations" class="tayu-notifications-checks"></div>
            </div>
            <div class="full tayu-notifications-actions">
              <label style="margin:0;display:flex;align-items:center;gap:7px"><input id="tayuNotifPolicyEnabled" type="checkbox" checked style="width:auto"> Activa</label>
              <button class="btn" type="submit">Guardar regla</button>
              <button class="btn ghost" id="tayuNotifPolicyCancel" type="button" hidden>Cancelar edición</button>
            </div>
          </form>
          <div class="table-wrap">
            <table class="table tayu-notifications-table">
              <thead><tr><th>Regla</th><th>Evento</th><th>Severidades</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody id="tayuNotifPoliciesBody"></tbody>
            </table>
          </div>
        </div>

        <div class="tayu-notifications-panel" data-notif-panel="channels">
          <h3>Canales</h3>
          <p class="hint">WhatsApp ya está operativo. Email y Telegram quedan preparados para integrar sus proveedores.</p>
          <div id="tayuNotifChannelsGrid" class="tayu-notifications-channel-grid"></div>
        </div>

        <div class="tayu-notifications-panel" data-notif-panel="history">
          <div class="module-header">
            <div><h3>Historial</h3><p class="hint">Entregas registradas por el backend.</p></div>
            <div class="tayu-notifications-actions">
              <select id="tayuNotifHistoryChannel"><option value="">Todos los canales</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="telegram">Telegram</option></select>
              <select id="tayuNotifHistoryStatus"><option value="">Todos los estados</option><option value="queued">En cola</option><option value="processing">Procesando</option><option value="sent">Enviado</option><option value="failed">Fallido</option><option value="skipped">Omitido</option></select>
            </div>
          </div>
          <div class="table-wrap">
            <table class="table tayu-notifications-table">
              <thead><tr><th>Fecha</th><th>Evento</th><th>Canal</th><th>Destino</th><th>Estado</th><th>ID proveedor</th><th>Error</th></tr></thead>
              <tbody id="tayuNotifHistoryBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const config = document.getElementById('configuracion');
    if (config?.parentElement) config.parentElement.insertBefore(section, config);
  }

  function injectNav() {
    if (document.getElementById('tayuNotificationsNav')) return;
    const nav = document.querySelector('.nav');
    if (!nav) return;

    const link = document.createElement('a');
    link.id = 'tayuNotificationsNav';
    link.href = '#notifications';
    link.className = 'tayu-notifications-nav';
    link.innerHTML = '<span class="nav-icon" aria-hidden="true">🔔</span><span class="nav-label">Notificaciones</span>';

    const configButton = nav.querySelector('button[data-view="configuracion"]');
    if (configButton) nav.insertBefore(link, configButton);
    else nav.appendChild(link);

    link.addEventListener('click', (event) => {
      event.preventDefault();
      openView();
    });
  }

  function openView() {
    if (!allowed()) return;
    document.querySelectorAll('.nav button').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.tayu-notifications-nav').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.view').forEach((el) => el.classList.remove('active'));

    document.getElementById('tayuNotificationsNav')?.classList.add('active');
    document.getElementById('notifications')?.classList.add('active');
    document.getElementById('sidebar')?.classList.remove('open');

    const title = document.getElementById('pageTitle');
    if (title) title.textContent = 'Notificaciones';

    loadAll().catch(showError);
  }

  function showError(error) {
    console.error('TAYULABS notifications:', error);
    setStatus(error?.message || String(error), 'error');
  }

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('[data-notif-tab]').forEach((el) => {
      el.classList.toggle('active', el.dataset.notifTab === tab);
    });
    document.querySelectorAll('[data-notif-panel]').forEach((el) => {
      el.classList.toggle('active', el.dataset.notifPanel === tab);
    });
    if (tab === 'history') loadHistory().catch(showError);
  }

  function renderSummary() {
    const summary = state.summary || {};
    const activePolicies = state.policies.filter((p) => Boolean(p.enabled)).length;
    const queued = Number(summary.queued ?? summary.queued_count ?? 0) || 0;
    const failed = Number(summary.failed ?? summary.failed_count ?? 0) || 0;

    document.getElementById('tayuNotifDestCount').textContent = String(
      Number(summary.destinations ?? summary.destination_count ?? state.destinations.length) || 0
    );
    document.getElementById('tayuNotifPolicyCount').textContent = String(
      Number(summary.active_policies ?? summary.policies ?? activePolicies) || 0
    );
    document.getElementById('tayuNotifQueuedCount').textContent = String(queued);
    document.getElementById('tayuNotifFailedCount').textContent = String(failed);
  }

  function renderDestinations() {
    const body = document.getElementById('tayuNotifDestinationsBody');
    if (!body) return;

    body.innerHTML = state.destinations.length ? state.destinations.map((d) => `
      <tr>
        <td><b>${esc(d.name)}</b></td>
        <td>${esc(String(d.channel || '').toUpperCase())}</td>
        <td>${esc(d.recipient_type || d.type || '—')}</td>
        <td><code>${esc(d.address || d.target || '—')}</code></td>
        <td><span class="tayu-notifications-chip ${d.enabled ? 'on' : ''}">${d.enabled ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <div class="tayu-notifications-actions">
            <button class="btn ghost" type="button" data-destination-edit="${esc(d.id)}">Editar</button>
            <button class="btn ghost" type="button" data-destination-delete="${esc(d.id)}">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="6" class="hint">No hay destinatarios configurados.</td></tr>';

    const checks = document.getElementById('tayuNotifPolicyDestinations');
    if (checks) {
      checks.innerHTML = state.destinations.filter((d) => d.enabled).map((d) => `
        <label><input name="tayuNotifPolicyDestination" type="checkbox" value="${esc(d.id)}"> ${esc(d.name)}</label>
      `).join('') || '<span class="hint">Primero crea un destinatario activo.</span>';
    }
  }

  function renderPolicies() {
    const body = document.getElementById('tayuNotifPoliciesBody');
    if (!body) return;
    body.innerHTML = state.policies.length ? state.policies.map((p) => {
      const severities = Array.isArray(p.severities) ? p.severities.join(', ') : '—';
      return `
        <tr>
          <td><b>${esc(p.name)}</b><br><small class="hint">${esc(p.description || '')}</small></td>
          <td>${esc(p.event_type || '—')}</td>
          <td>${esc(severities)}</td>
          <td><span class="tayu-notifications-chip ${p.enabled ? 'on' : ''}">${p.enabled ? 'Activa' : 'Inactiva'}</span></td>
          <td>
            <div class="tayu-notifications-actions">
              <button class="btn ghost" type="button" data-policy-edit="${esc(p.id)}">Editar</button>
              <button class="btn ghost" type="button" data-policy-delete="${esc(p.id)}">Eliminar</button>
            </div>
          </td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="5" class="hint">No hay reglas configuradas.</td></tr>';
  }

  function renderChannels() {
    const grid = document.getElementById('tayuNotifChannelsGrid');
    if (!grid) return;

    const byChannel = new Map(state.channels.map((c) => [String(c.channel || '').toLowerCase(), c]));
    grid.innerHTML = ['whatsapp', 'email', 'telegram'].map((name) => {
      const c = byChannel.get(name) || { channel: name, configured: false, enabled: false };
      const configured = Boolean(c.configured);
      const enabled = Boolean(c.enabled);
      const label = name === 'whatsapp' ? 'WhatsApp' : name === 'email' ? 'Email' : 'Telegram';
      return `
        <div class="tayu-notifications-channel">
          <div class="tayu-notifications-channel-head">
            <b>${label}</b>
            <span class="tayu-notifications-chip ${enabled ? 'on' : ''}">${enabled ? 'Activo' : 'Inactivo'}</span>
          </div>
          <p class="hint">${configured ? 'Proveedor configurado.' : 'Proveedor todavía no configurado.'}</p>
          <button class="btn ${enabled ? 'ghost' : ''}" type="button"
            data-channel="${name}" data-channel-enabled="${enabled ? 'false' : 'true'}"
            ${configured ? '' : 'disabled'}>
            ${enabled ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      `;
    }).join('');
  }

  function renderHistory() {
    const body = document.getElementById('tayuNotifHistoryBody');
    if (!body) return;
    body.innerHTML = state.deliveries.length ? state.deliveries.map((d) => {
      const rawDate = d.sent_at || d.failed_at || d.queued_at || d.created_at;
      const date = rawDate ? new Date(rawDate).toLocaleString('es-EC') : '—';
      return `
        <tr>
          <td>${esc(date)}</td>
          <td>${esc(d.event_type || '—')}</td>
          <td>${esc(String(d.channel || '').toUpperCase())}</td>
          <td>${esc(d.destination_name || d.target || '—')}</td>
          <td><span class="tayu-notifications-chip ${esc(d.status || '')}">${esc(d.status || '—')}</span></td>
          <td>${esc(d.provider_message_id || '—')}</td>
          <td>${esc(d.error || '—')}</td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="7" class="hint">No hay entregas para mostrar.</td></tr>';
  }

  async function loadHistory() {
    const params = new URLSearchParams();
    const channel = document.getElementById('tayuNotifHistoryChannel')?.value || '';
    const status = document.getElementById('tayuNotifHistoryStatus')?.value || '';
    if (channel) params.set('channel', channel);
    if (status) params.set('status', status);

    const data = await request('/notifications/deliveries' + (params.toString() ? '?' + params : ''));
    state.deliveries = list(data, 'deliveries');
    renderHistory();
  }

  async function loadAll() {
    if (!allowed()) return;
    setStatus('Actualizando…');

    const results = await Promise.all([
      request('/notifications/summary'),
      request('/notifications/channels'),
      request('/notifications/destinations'),
      request('/notifications/policies'),
    ]);

    state.summary = results[0] || {};
    state.channels = list(results[1], 'channels');
    state.destinations = list(results[2], 'destinations');
    state.policies = list(results[3], 'policies');
    state.loaded = true;

    renderSummary();
    renderChannels();
    renderDestinations();
    renderPolicies();
    if (state.tab === 'history') await loadHistory();

    setStatus('Actualizado.', 'ok');
  }

  function resetDestinationForm() {
    state.editingDestination = null;
    document.getElementById('tayuNotifDestinationForm')?.reset();
    const enabled = document.getElementById('tayuNotifDestinationEnabled');
    if (enabled) enabled.checked = true;
    const channel = document.getElementById('tayuNotifDestinationChannel');
    if (channel) channel.value = 'whatsapp';
    const type = document.getElementById('tayuNotifDestinationType');
    if (type) type.value = 'group';
    const cancel = document.getElementById('tayuNotifDestinationCancel');
    if (cancel) cancel.hidden = true;
  }

  function resetPolicyForm() {
    state.editingPolicy = null;
    document.getElementById('tayuNotifPolicyForm')?.reset();
    document.querySelectorAll('input[name="tayuNotifSeverity"]').forEach((el) => el.checked = true);
    const enabled = document.getElementById('tayuNotifPolicyEnabled');
    if (enabled) enabled.checked = true;
    const cancel = document.getElementById('tayuNotifPolicyCancel');
    if (cancel) cancel.hidden = true;
  }

  async function saveDestination(event) {
    event.preventDefault();
    const body = {
      name: document.getElementById('tayuNotifDestinationName').value.trim(),
      channel: document.getElementById('tayuNotifDestinationChannel').value,
      recipient_type: document.getElementById('tayuNotifDestinationType').value,
      address: document.getElementById('tayuNotifDestinationAddress').value.trim(),
      enabled: document.getElementById('tayuNotifDestinationEnabled').checked,
      metadata: {},
    };
    if (state.editingDestination) body.id = state.editingDestination;

    await request('/notifications/destinations', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    resetDestinationForm();
    await loadAll();
    setStatus('Destinatario guardado.', 'ok');
  }

  async function savePolicy(event) {
    event.preventDefault();

    const destination_ids = Array.from(
      document.querySelectorAll('input[name="tayuNotifPolicyDestination"]:checked')
    ).map((el) => el.value);

    const severities = Array.from(
      document.querySelectorAll('input[name="tayuNotifSeverity"]:checked')
    ).map((el) => el.value);

    if (!destination_ids.length) throw new Error('Selecciona al menos un destinatario.');
    if (!severities.length) throw new Error('Selecciona al menos una severidad.');

    const body = {
      name: document.getElementById('tayuNotifPolicyName').value.trim(),
      description: document.getElementById('tayuNotifPolicyDescription').value.trim(),
      event_type: document.getElementById('tayuNotifPolicyEvent').value,
      severities,
      destination_ids,
      scopes: [{ scope_type: 'organization', scope_ref: null, scope_value: null }],
      enabled: document.getElementById('tayuNotifPolicyEnabled').checked,
    };
    if (state.editingPolicy) body.id = state.editingPolicy;

    await request('/notifications/policies', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    resetPolicyForm();
    await loadAll();
    setStatus('Regla guardada.', 'ok');
  }

  function editDestination(id) {
    const d = state.destinations.find((row) => row.id === id);
    if (!d) return;
    state.editingDestination = id;
    document.getElementById('tayuNotifDestinationName').value = d.name || '';
    document.getElementById('tayuNotifDestinationChannel').value = d.channel || 'whatsapp';
    document.getElementById('tayuNotifDestinationType').value = d.recipient_type || d.type || 'group';
    document.getElementById('tayuNotifDestinationAddress').value = d.address || d.target || '';
    document.getElementById('tayuNotifDestinationEnabled').checked = Boolean(d.enabled);
    document.getElementById('tayuNotifDestinationCancel').hidden = false;
    switchTab('destinations');
  }

  function editPolicy(id) {
    const p = state.policies.find((row) => row.id === id);
    if (!p) return;
    state.editingPolicy = id;
    document.getElementById('tayuNotifPolicyName').value = p.name || '';
    document.getElementById('tayuNotifPolicyDescription').value = p.description || '';
    document.getElementById('tayuNotifPolicyEvent').value = p.event_type || 'alarm_opened';
    document.getElementById('tayuNotifPolicyEnabled').checked = Boolean(p.enabled);

    const severitySet = new Set(Array.isArray(p.severities) ? p.severities : []);
    document.querySelectorAll('input[name="tayuNotifSeverity"]').forEach((el) => {
      el.checked = severitySet.has(el.value);
    });

    const ids = new Set(
      Array.isArray(p.destination_ids)
        ? p.destination_ids
        : (Array.isArray(p.destinations)
          ? p.destinations.map((d) => d.id || d.destination_id).filter(Boolean)
          : [])
    );
    document.querySelectorAll('input[name="tayuNotifPolicyDestination"]').forEach((el) => {
      el.checked = ids.has(el.value);
    });

    document.getElementById('tayuNotifPolicyCancel').hidden = false;
    switchTab('policies');
  }

  async function removeDestination(id) {
    if (!confirm('¿Eliminar este destinatario?')) return;
    await request('/notifications/destinations', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    await loadAll();
    setStatus('Destinatario eliminado.', 'ok');
  }

  async function removePolicy(id) {
    if (!confirm('¿Eliminar esta regla?')) return;
    await request('/notifications/policies', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    await loadAll();
    setStatus('Regla eliminada.', 'ok');
  }

  async function toggleChannel(channel, enabled) {
    await request('/notifications/channels', {
      method: 'POST',
      body: JSON.stringify({ channel, enabled }),
    });
    await loadAll();
    setStatus('Canal actualizado.', 'ok');
  }

  function bind() {
    document.querySelectorAll('[data-notif-tab]').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.notifTab));
    });

    document.getElementById('tayuNotificationsRefresh')?.addEventListener('click', () => loadAll().catch(showError));
    document.getElementById('tayuNotifDestinationCancel')?.addEventListener('click', resetDestinationForm);
    document.getElementById('tayuNotifPolicyCancel')?.addEventListener('click', resetPolicyForm);
    document.getElementById('tayuNotifDestinationForm')?.addEventListener('submit', (e) => saveDestination(e).catch(showError));
    document.getElementById('tayuNotifPolicyForm')?.addEventListener('submit', (e) => savePolicy(e).catch(showError));
    document.getElementById('tayuNotifHistoryChannel')?.addEventListener('change', () => loadHistory().catch(showError));
    document.getElementById('tayuNotifHistoryStatus')?.addEventListener('change', () => loadHistory().catch(showError));

    document.getElementById('notifications')?.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.destinationEdit) editDestination(button.dataset.destinationEdit);
      else if (button.dataset.destinationDelete) removeDestination(button.dataset.destinationDelete).catch(showError);
      else if (button.dataset.policyEdit) editPolicy(button.dataset.policyEdit);
      else if (button.dataset.policyDelete) removePolicy(button.dataset.policyDelete).catch(showError);
      else if (button.dataset.channel) toggleChannel(
        button.dataset.channel,
        button.dataset.channelEnabled === 'true'
      ).catch(showError);
    });
  }

  function install() {
    if (!allowed() || document.documentElement.dataset.tayuNotificationsInstalled === '1') return;
    document.documentElement.dataset.tayuNotificationsInstalled = '1';
    installStyles();
    injectView();
    injectNav();
    bind();
    resetDestinationForm();
    resetPolicyForm();
  }

  function boot() {
    if (window.__tayuClientAccess) {
      install();
    } else {
      window.addEventListener('tayu:client-access-ready', install, { once: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();