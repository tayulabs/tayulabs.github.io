(() => {
  'use strict';

  const MANAGER_ROLES = new Set(['owner', 'admin']);
  const state = {
    summary: {},
    channels: [],
    destinations: [],
    policies: [],
    scopeOptions: {},
    deliveries: [],
    editingDestinationId: null,
    editingPolicyId: null,
    activeTab: 'destinations',
  };

  const eventLabels = {
    alarm_opened: 'Alarma activada',
    alarm_resolved: 'Alarma recuperada',
    report_scheduled: 'Reporte programado',
  };

  const severityLabels = {
    info: 'Información',
    warning: 'Advertencia',
    critical: 'Crítica',
  };

  const scopeLabels = {
    organization: 'Toda la organización',
    sector: 'Sector',
    site: 'Sitio',
    resource: 'Unidad productiva',
    device_type: 'Tipo de dispositivo',
    device: 'Dispositivo',
    alarm_rule: 'Regla de alarma',
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

  function canManage() {
    return MANAGER_ROLES.has(role());
  }

  function arrayFrom(data, key) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.[key])) return data[key];
    return [];
  }

  async function api(path) {
    if (typeof window.__tayuApi === 'function') return window.__tayuApi(path);

    const kc = window.__tayuEntryKeycloak || window.__tayuKeycloak;
    if (!kc?.authenticated) throw new Error('Sesión no disponible');
    await kc.updateToken(30);
    const response = await fetch('https://api.tayulabs.com' + path, {
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer ' + kc.token,
        ...(typeof window.__tayuOrganizationHeaders === 'function'
          ? window.__tayuOrganizationHeaders()
          : {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || ('API ' + response.status));
    return data;
  }

  async function post(path, body) {
    if (typeof window.__tayuApiPost === 'function') return window.__tayuApiPost(path, body);

    const kc = window.__tayuEntryKeycloak || window.__tayuKeycloak;
    if (!kc?.authenticated) throw new Error('Sesión no disponible');
    await kc.updateToken(30);
    const response = await fetch('https://api.tayulabs.com' + path, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + kc.token,
        'Content-Type': 'application/json',
        ...(typeof window.__tayuOrganizationHeaders === 'function'
          ? window.__tayuOrganizationHeaders()
          : {})
      },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || ('API ' + response.status));
    return data;
  }

  function installStyles() {
    if (document.getElementById('tayuNotificationStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuNotificationStyles';
    style.textContent = [
      '.tayu-notification-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}',
      '.tayu-notification-tab{border:1px solid var(--border);background:var(--panel2);color:var(--text);padding:10px 14px;border-radius:12px;font-weight:850;cursor:pointer}',
      '.tayu-notification-tab.active{background:var(--brand);border-color:var(--brand);color:#fff}',
      '.tayu-notification-panel{display:none}.tayu-notification-panel.active{display:block}',
      '.tayu-notification-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0}',
      '.tayu-notification-summary>div{background:var(--panel2);border:1px solid var(--border);border-radius:16px;padding:14px}',
      '.tayu-notification-summary span{display:block;color:var(--muted);font-size:12px;font-weight:850}',
      '.tayu-notification-summary b{display:block;font-size:24px;margin-top:6px}',
      '.tayu-notification-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}',
      '.tayu-notification-form .full{grid-column:1/-1}',
      '.tayu-notification-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
      '.tayu-notification-status{min-height:20px;margin:8px 0;color:var(--muted);font-size:13px;font-weight:750}',
      '.tayu-notification-status.error{color:#ef4444}.tayu-notification-status.ok{color:var(--brand)}',
      '.tayu-channel-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}',
      '.tayu-channel-card{border:1px solid var(--border);border-radius:18px;padding:16px;background:var(--panel2)}',
      '.tayu-channel-head{display:flex;justify-content:space-between;gap:10px;align-items:center}',
      '.tayu-chip{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:900;background:var(--panel2);border:1px solid var(--border)}',
      '.tayu-chip.sent,.tayu-chip.enabled{color:var(--brand)}',
      '.tayu-chip.failed{color:#ef4444}.tayu-chip.queued,.tayu-chip.processing{color:#f59e0b}',
      '.tayu-scope-row{display:grid;grid-template-columns:180px 1fr auto;gap:8px;align-items:end;margin:8px 0}',
      '.tayu-scope-box{border:1px solid var(--border);border-radius:16px;padding:12px;background:var(--panel2)}',
      '.tayu-destination-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
      '.tayu-destination-check{display:flex;gap:8px;align-items:center;border:1px solid var(--border);border-radius:12px;padding:9px}',
      '.tayu-destination-check input{width:auto}',
      '.tayu-notification-table .btn{padding:8px 10px;border-radius:10px;font-size:12px}',
      '@media(max-width:960px){.tayu-notification-summary,.tayu-channel-grid,.tayu-notification-form{grid-template-columns:1fr}.tayu-notification-form .full{grid-column:auto}.tayu-scope-row{grid-template-columns:1fr}.tayu-destination-checks{grid-template-columns:1fr}}'
    ].join('\\n');
    document.head.appendChild(style);
  }

  function injectNavigation() {
    if (document.querySelector('.nav button[data-view="notifications"]')) return;

    const nav = document.querySelector('.nav');
    if (!nav) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.view = 'notifications';
    button.innerHTML =
      '<span class="nav-icon" aria-hidden="true" style="font-size:18px">🔔</span>' +
      '<span class="nav-label">Notificaciones</span>';

    const configuration = nav.querySelector('button[data-view="configuracion"]');
    if (configuration) nav.insertBefore(button, configuration);
    else nav.appendChild(button);

    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (!canManage()) return;

      document.querySelectorAll('.nav button').forEach((item) => item.classList.remove('active'));
      document.querySelectorAll('.view').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      document.getElementById('notifications')?.classList.add('active');

      const title = document.getElementById('pageTitle');
      if (title) title.textContent = 'Notificaciones';

      document.getElementById('sidebar')?.classList.remove('open');
      loadAll().catch(showError);
    });
  }

  function injectView() {
    if (document.getElementById('notifications')) return;

    const section = document.createElement('section');
    section.id = 'notifications';
    section.className = 'view';
    section.innerHTML = [
      '<div class="card">',
      '  <div class="module-header">',
      '    <div><h3 style="margin:0">🔔 Notificaciones</h3><p class="hint" style="margin:6px 0 0">Define quién recibe alertas, por qué canal y para qué equipos o unidades productivas.</p></div>',
      '    <button class="btn ghost" type="button" id="tayuNotificationsRefresh">Actualizar</button>',
      '  </div>',
      '  <div class="tayu-notification-summary">',
      '    <div><span>Destinatarios</span><b id="tayuNotifSummaryDest">0</b></div>',
      '    <div><span>Reglas activas</span><b id="tayuNotifSummaryPolicies">0</b></div>',
      '    <div><span>En cola</span><b id="tayuNotifSummaryQueued">0</b></div>',
      '    <div><span>Fallidas</span><b id="tayuNotifSummaryFailed">0</b></div>',
      '  </div>',
      '  <div class="tayu-notification-tabs">',
      '    <button class="tayu-notification-tab active" data-notif-tab="destinations">Destinatarios</button>',
      '    <button class="tayu-notification-tab" data-notif-tab="policies">Reglas</button>',
      '    <button class="tayu-notification-tab" data-notif-tab="channels">Canales</button>',
      '    <button class="tayu-notification-tab" data-notif-tab="history">Historial</button>',
      '  </div>',
      '  <div id="tayuNotifStatus" class="tayu-notification-status"></div>',
      '  <div class="tayu-notification-panel active" data-notif-panel="destinations">',
      '    <h3>Destinatarios</h3>',
      '    <p class="hint">Registra grupos, personas o endpoints que podrán recibir notificaciones.</p>',
      '    <form id="tayuDestinationForm" class="tayu-notification-form">',
      '      <div><label>Nombre</label><input id="tayuDestinationName" required placeholder="Ej: Operaciones camaronera"></div>',
      '      <div><label>Canal</label><select id="tayuDestinationChannel"><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="telegram">Telegram</option></select></div>',
      '      <div><label>Tipo</label><select id="tayuDestinationType"><option value="group">Grupo</option><option value="person">Persona</option><option value="endpoint">Endpoint</option></select></div>',
      '      <div><label>Dirección / ID</label><input id="tayuDestinationAddress" required placeholder="120...@g.us"></div>',
      '      <div class="full tayu-notification-actions"><label style="margin:0;display:flex;gap:8px;align-items:center"><input id="tayuDestinationEnabled" type="checkbox" checked style="width:auto"> Activo</label><button class="btn" type="submit" id="tayuDestinationSave">Guardar destinatario</button><button class="btn ghost" type="button" id="tayuDestinationCancel" hidden>Cancelar edición</button></div>',
      '    </form>',
      '    <div class="table-wrap"><table class="table tayu-notification-table"><thead><tr><th>Nombre</th><th>Canal</th><th>Tipo</th><th>Destino</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="tayuDestinationsBody"></tbody></table></div>',
      '  </div>',
      '  <div class="tayu-notification-panel" data-notif-panel="policies">',
      '    <h3>Reglas de notificación</h3>',
      '    <p class="hint">OR dentro de una misma categoría de alcance y AND entre categorías diferentes.</p>',
      '    <form id="tayuPolicyForm" class="tayu-notification-form">',
      '      <div><label>Nombre</label><input id="tayuPolicyName" required placeholder="Ej: Aireador crítico - turno noche"></div>',
      '      <div><label>Evento</label><select id="tayuPolicyEvent"><option value="alarm_opened">Alarma activada</option><option value="alarm_resolved">Alarma recuperada</option><option value="report_scheduled">Reporte programado</option></select></div>',
      '      <div class="full"><label>Descripción</label><input id="tayuPolicyDescription" placeholder="Opcional"></div>',
      '      <div class="full"><label>Severidades</label><div class="tayu-notification-actions"><label><input type="checkbox" name="tayuSeverity" value="info" checked style="width:auto"> Información</label><label><input type="checkbox" name="tayuSeverity" value="warning" checked style="width:auto"> Advertencia</label><label><input type="checkbox" name="tayuSeverity" value="critical" checked style="width:auto"> Crítica</label></div></div>',
      '      <div class="full"><label>Destinatarios</label><div id="tayuPolicyDestinations" class="tayu-destination-checks"></div></div>',
      '      <div class="full"><label>Alcances</label><div id="tayuPolicyScopes" class="tayu-scope-box"></div><button class="btn ghost" type="button" id="tayuAddScope" style="margin-top:8px">+ Agregar alcance</button></div>',
      '      <div class="full tayu-notification-actions"><label style="margin:0;display:flex;gap:8px;align-items:center"><input id="tayuPolicyEnabled" type="checkbox" checked style="width:auto"> Activa</label><button class="btn" type="submit">Guardar regla</button><button class="btn ghost" type="button" id="tayuPolicyCancel" hidden>Cancelar edición</button></div>',
      '    </form>',
      '    <div class="table-wrap"><table class="table tayu-notification-table"><thead><tr><th>Regla</th><th>Evento</th><th>Severidad</th><th>Destinatarios</th><th>Alcance</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="tayuPoliciesBody"></tbody></table></div>',
      '  </div>',
      '  <div class="tayu-notification-panel" data-notif-panel="channels">',
      '    <h3>Canales</h3><p class="hint">WhatsApp está operativo. Email y Telegram podrán habilitarse cuando tengan configuración del proveedor.</p>',
      '    <div id="tayuChannelsGrid" class="tayu-channel-grid"></div>',
      '  </div>',
      '  <div class="tayu-notification-panel" data-notif-panel="history">',
      '    <div class="module-header"><div><h3>Historial de entregas</h3><p class="hint">Resultado registrado por destinatario y evento.</p></div><div class="tayu-notification-actions"><select id="tayuHistoryChannel"><option value="">Todos los canales</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="telegram">Telegram</option></select><select id="tayuHistoryStatus"><option value="">Todos los estados</option><option value="queued">En cola</option><option value="processing">Procesando</option><option value="sent">Enviado</option><option value="failed">Fallido</option><option value="skipped">Omitido</option></select></div></div>',
      '    <div class="table-wrap"><table class="table tayu-notification-table"><thead><tr><th>Fecha</th><th>Evento</th><th>Canal</th><th>Destino</th><th>Estado</th><th>Proveedor</th><th>Error</th></tr></thead><tbody id="tayuHistoryBody"></tbody></table></div>',
      '  </div>',
      '</div>'
    ].join('');

    const configuration = document.getElementById('configuracion');
    const main = configuration?.parentElement;
    if (main && configuration) main.insertBefore(section, configuration);
  }

  function setStatus(message, type) {
    const el = document.getElementById('tayuNotifStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'tayu-notification-status' + (type ? (' ' + type) : '');
  }

  function showError(error) {
    console.error('TAYULABS notifications:', error);
    setStatus(error?.message || String(error || 'Error'), 'error');
  }

  function switchTab(name) {
    state.activeTab = name;
    document.querySelectorAll('[data-notif-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.notifTab === name);
    });
    document.querySelectorAll('[data-notif-panel]').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.notifPanel === name);
    });

    if (name === 'history') loadDeliveries().catch(showError);
  }

  function count(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function renderSummary() {
    const summary = state.summary || {};
    const activePolicies = summary.policies ?? state.policies.filter((item) => item.enabled).length;
    const values = {
      tayuNotifSummaryDest: summary.destinations ?? state.destinations.length,
      tayuNotifSummaryPolicies: activePolicies,
      tayuNotifSummaryQueued: summary.queued ?? 0,
      tayuNotifSummaryFailed: summary.failed ?? 0,
    };
    Object.entries(values).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(count(value));
    });
  }

  function renderChannels() {
    const grid = document.getElementById('tayuChannelsGrid');
    if (!grid) return;

    const supported = ['whatsapp', 'email', 'telegram'];
    const byName = new Map(state.channels.map((item) => [String(item.channel || '').toLowerCase(), item]));

    grid.innerHTML = supported.map((name) => {
      const row = byName.get(name) || { channel: name, configured: false, enabled: false };
      const title = name === 'whatsapp' ? 'WhatsApp' : name === 'email' ? 'Email' : 'Telegram';
      const configured = Boolean(row.configured);
      const enabled = Boolean(row.enabled);
      return '<div class="tayu-channel-card">' +
        '<div class="tayu-channel-head"><b>' + esc(title) + '</b><span class="tayu-chip ' + (enabled ? 'enabled' : '') + '">' + (enabled ? 'Activo' : 'Inactivo') + '</span></div>' +
        '<p class="hint">' + (configured ? 'Proveedor configurado.' : 'Proveedor aún no configurado.') + '</p>' +
        '<button class="btn ' + (enabled ? 'ghost' : '') + '" type="button" data-channel-toggle="' + esc(name) + '" data-next-enabled="' + (!enabled) + '"' + (!configured ? ' disabled' : '') + '>' +
        (enabled ? 'Desactivar' : 'Activar') + '</button>' +
        '</div>';
    }).join('');
  }

  function renderDestinations() {
    const body = document.getElementById('tayuDestinationsBody');
    if (!body) return;

    body.innerHTML = state.destinations.length
      ? state.destinations.map((item) => {
          return '<tr>' +
            '<td><b>' + esc(item.name) + '</b></td>' +
            '<td>' + esc(String(item.channel || '').toUpperCase()) + '</td>' +
            '<td>' + esc(item.recipient_type) + '</td>' +
            '<td><code>' + esc(item.address) + '</code></td>' +
            '<td><span class="tayu-chip ' + (item.enabled ? 'enabled' : '') + '">' + (item.enabled ? 'Activo' : 'Inactivo') + '</span></td>' +
            '<td><div class="tayu-notification-actions"><button class="btn ghost" type="button" data-destination-edit="' + esc(item.id) + '">Editar</button><button class="btn ghost" type="button" data-destination-delete="' + esc(item.id) + '">Eliminar</button></div></td>' +
            '</tr>';
        }).join('')
      : '<tr><td colspan="6" class="hint">No hay destinatarios configurados.</td></tr>';

    renderPolicyDestinationChecks();
  }

  function renderPolicyDestinationChecks(selectedIds) {
    const container = document.getElementById('tayuPolicyDestinations');
    if (!container) return;

    const selected = new Set(selectedIds || []);
    container.innerHTML = state.destinations
      .filter((item) => item.enabled)
      .map((item) => {
        return '<label class="tayu-destination-check"><input type="checkbox" name="tayuPolicyDestination" value="' + esc(item.id) + '" style="width:auto"' +
          (selected.has(item.id) ? ' checked' : '') + '> <span><b>' + esc(item.name) + '</b><br><small class="hint">' + esc(String(item.channel || '').toUpperCase()) + ' · ' + esc(item.address) + '</small></span></label>';
      }).join('') || '<span class="hint">Primero agrega un destinatario activo.</span>';
  }

  function optionLabel(item, type) {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return String(item || '');

    if (type === 'resource') {
      return String(
        item.name || item.resource_name || item.label || item.code || item.resource_ref || item.id || 'Unidad productiva'
      ) + (item.resource_type ? (' · ' + item.resource_type) : '');
    }

    return String(
      item.name ||
      item.label ||
      item.display_name ||
      item.device_key ||
      item.code ||
      item.system_key ||
      item.value ||
      item.id ||
      ''
    );
  }

  function scopeOptionPayload(type, item) {
    if (type === 'organization') return { scope_ref: null, scope_value: null };

    if (type === 'sector') {
      const value = typeof item === 'string'
        ? item
        : (item?.sector || item?.value || item?.key || item?.name);
      return { scope_ref: null, scope_value: value || null };
    }

    if (type === 'device_type') {
      const value = typeof item === 'string'
        ? item
        : (item?.device_type || item?.value || item?.type || item?.name);
      return { scope_ref: null, scope_value: value || null };
    }

    if (type === 'resource') {
      return {
        scope_ref: item?.resource_ref || item?.resource_id || item?.id || null,
        scope_value: item?.resource_type || item?.type || item?.value || null,
      };
    }

    if (type === 'site') {
      return { scope_ref: item?.site_id || item?.id || null, scope_value: null };
    }

    if (type === 'device') {
      return { scope_ref: item?.device_id || item?.id || null, scope_value: null };
    }

    if (type === 'alarm_rule') {
      return { scope_ref: item?.rule_id || item?.id || null, scope_value: null };
    }

    return { scope_ref: null, scope_value: null };
  }

  function scopeChoices(type) {
    if (type === 'organization') return [{ label: 'Toda la organización', payload: { scope_ref: null, scope_value: null } }];

    const keyMap = {
      sector: 'sectors',
      site: 'sites',
      resource: 'resources',
      device_type: 'device_types',
      device: 'devices',
      alarm_rule: 'alarm_rules',
    };

    let list = arrayFrom(state.scopeOptions, keyMap[type]);

    if (type === 'sector' && !list.length) {
      list = ['fincas', 'camaroneras', 'bananeras', 'ganaderia'];
    }

    return list.map((item) => ({
      label: optionLabel(item, type),
      payload: scopeOptionPayload(type, item),
    }));
  }

  function createScopeRow(initial) {
    const container = document.getElementById('tayuPolicyScopes');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'tayu-scope-row';
    row.innerHTML =
      '<div><label>Tipo</label><select class="tayu-scope-type">' +
      Object.entries(scopeLabels).map(([value, label]) => '<option value="' + esc(value) + '">' + esc(label) + '</option>').join('') +
      '</select></div>' +
      '<div><label>Valor</label><select class="tayu-scope-value"></select></div>' +
      '<button class="btn ghost tayu-scope-remove" type="button">Quitar</button>';

    container.appendChild(row);

    const typeSelect = row.querySelector('.tayu-scope-type');
    const valueSelect = row.querySelector('.tayu-scope-value');

    const refresh = (selectedScope) => {
      const type = typeSelect.value;
      const choices = scopeChoices(type);

      valueSelect.disabled = type === 'organization';
      valueSelect.innerHTML = choices.length
        ? choices.map((choice) => {
            const payload = JSON.stringify(choice.payload);
            const matches = selectedScope &&
              String(selectedScope.scope_ref || '') === String(choice.payload.scope_ref || '') &&
              String(selectedScope.scope_value || '') === String(choice.payload.scope_value || '');
            return '<option value="' + esc(payload) + '"' + (matches ? ' selected' : '') + '>' + esc(choice.label) + '</option>';
          }).join('')
        : '<option value="">Sin opciones disponibles</option>';
    };

    typeSelect.addEventListener('change', () => refresh(null));
    row.querySelector('.tayu-scope-remove').addEventListener('click', () => {
      row.remove();
      if (!container.querySelector('.tayu-scope-row')) createScopeRow({ scope_type: 'organization' });
    });

    typeSelect.value = initial?.scope_type || 'organization';
    refresh(initial || null);
  }

  function resetPolicyForm() {
    state.editingPolicyId = null;
    const form = document.getElementById('tayuPolicyForm');
    form?.reset();
    const enabled = document.getElementById('tayuPolicyEnabled');
    if (enabled) enabled.checked = true;
    document.querySelectorAll('input[name="tayuSeverity"]').forEach((input) => input.checked = true);
    renderPolicyDestinationChecks([]);
    const scopes = document.getElementById('tayuPolicyScopes');
    if (scopes) scopes.innerHTML = '';
    createScopeRow({ scope_type: 'organization', scope_ref: null, scope_value: null });
    const cancel = document.getElementById('tayuPolicyCancel');
    if (cancel) cancel.hidden = true;
  }

  function resetDestinationForm() {
    state.editingDestinationId = null;
    const form = document.getElementById('tayuDestinationForm');
    form?.reset();
    const enabled = document.getElementById('tayuDestinationEnabled');
    if (enabled) enabled.checked = true;
    const channel = document.getElementById('tayuDestinationChannel');
    const type = document.getElementById('tayuDestinationType');
    if (channel) channel.value = 'whatsapp';
    if (type) type.value = 'group';
    const cancel = document.getElementById('tayuDestinationCancel');
    if (cancel) cancel.hidden = true;
  }

  function renderPolicies() {
    const body = document.getElementById('tayuPoliciesBody');
    if (!body) return;

    body.innerHTML = state.policies.length
      ? state.policies.map((item) => {
          const destinations = Array.isArray(item.destinations) ? item.destinations : [];
          const scopes = Array.isArray(item.scopes) ? item.scopes : [];
          const severities = Array.isArray(item.severities) ? item.severities : [];
          const destinationText = destinations.map((d) => d.name || d.destination_name || d.id).filter(Boolean).join(', ') || '—';
          const scopeText = scopes.map((s) => {
            const base = scopeLabels[s.scope_type] || s.scope_type;
            const value = s.scope_value || s.scope_ref;
            return value ? (base + ': ' + value) : base;
          }).join(' · ') || 'Toda la organización';

          return '<tr>' +
            '<td><b>' + esc(item.name) + '</b><br><small class="hint">' + esc(item.description || '') + '</small></td>' +
            '<td>' + esc(eventLabels[item.event_type] || item.event_type) + '</td>' +
            '<td>' + esc(severities.map((s) => severityLabels[s] || s).join(', ')) + '</td>' +
            '<td>' + esc(destinationText) + '</td>' +
            '<td>' + esc(scopeText) + '</td>' +
            '<td><span class="tayu-chip ' + (item.enabled ? 'enabled' : '') + '">' + (item.enabled ? 'Activa' : 'Inactiva') + '</span></td>' +
            '<td><div class="tayu-notification-actions"><button class="btn ghost" type="button" data-policy-edit="' + esc(item.id) + '">Editar</button><button class="btn ghost" type="button" data-policy-delete="' + esc(item.id) + '">Eliminar</button></div></td>' +
            '</tr>';
        }).join('')
      : '<tr><td colspan="7" class="hint">No hay reglas configuradas.</td></tr>';
  }

  function renderHistory() {
    const body = document.getElementById('tayuHistoryBody');
    if (!body) return;

    body.innerHTML = state.deliveries.length
      ? state.deliveries.map((item) => {
          const date = item.sent_at || item.failed_at || item.queued_at || item.created_at;
          const when = date ? new Date(date).toLocaleString('es-EC') : '—';
          return '<tr>' +
            '<td>' + esc(when) + '</td>' +
            '<td>' + esc(eventLabels[item.event_type] || item.event_type) + '</td>' +
            '<td>' + esc(String(item.channel || '').toUpperCase()) + '</td>' +
            '<td>' + esc(item.destination_name || item.target || item.address || '—') + '</td>' +
            '<td><span class="tayu-chip ' + esc(item.status) + '">' + esc(item.status || '—') + '</span></td>' +
            '<td>' + esc(item.provider_message_id || '—') + '</td>' +
            '<td>' + esc(item.error || '—') + '</td>' +
            '</tr>';
        }).join('')
      : '<tr><td colspan="7" class="hint">No hay entregas para los filtros seleccionados.</td></tr>';
  }

  async function loadDeliveries() {
    const channel = document.getElementById('tayuHistoryChannel')?.value || '';
    const status = document.getElementById('tayuHistoryStatus')?.value || '';
    const params = new URLSearchParams();
    if (channel) params.set('channel', channel);
    if (status) params.set('status', status);

    const data = await api('/notifications/deliveries' + (params.toString() ? ('?' + params.toString()) : ''));
    state.deliveries = arrayFrom(data, 'deliveries');
    renderHistory();
  }

  async function loadAll() {
    if (!canManage()) return;
    setStatus('Actualizando notificaciones…');

    const [summary, channels, destinations, scopeOptions, policies] = await Promise.all([
      api('/notifications/summary'),
      api('/notifications/channels'),
      api('/notifications/destinations'),
      api('/notifications/scope-options'),
      api('/notifications/policies'),
    ]);

    state.summary = summary || {};
    state.channels = arrayFrom(channels, 'channels');
    state.destinations = arrayFrom(destinations, 'destinations');
    state.scopeOptions = scopeOptions || {};
    state.policies = arrayFrom(policies, 'policies');

    renderSummary();
    renderChannels();
    renderDestinations();
    renderPolicies();

    if (!document.querySelector('#tayuPolicyScopes .tayu-scope-row')) resetPolicyForm();

    if (state.activeTab === 'history') await loadDeliveries();
    setStatus('Datos actualizados.', 'ok');
  }

  function collectScopes() {
    const rows = Array.from(document.querySelectorAll('#tayuPolicyScopes .tayu-scope-row'));
    return rows.map((row) => {
      const scope_type = row.querySelector('.tayu-scope-type')?.value || 'organization';
      if (scope_type === 'organization') {
        return { scope_type, scope_ref: null, scope_value: null };
      }

      const raw = row.querySelector('.tayu-scope-value')?.value || '';
      if (!raw) throw new Error('Selecciona un valor para cada alcance.');
      const parsed = JSON.parse(raw);
      return {
        scope_type,
        scope_ref: parsed.scope_ref || null,
        scope_value: parsed.scope_value || null,
      };
    });
  }

  async function saveDestination(event) {
    event.preventDefault();
    const body = {
      name: document.getElementById('tayuDestinationName')?.value?.trim(),
      channel: document.getElementById('tayuDestinationChannel')?.value,
      recipient_type: document.getElementById('tayuDestinationType')?.value,
      address: document.getElementById('tayuDestinationAddress')?.value?.trim(),
      metadata: {},
      enabled: Boolean(document.getElementById('tayuDestinationEnabled')?.checked),
    };
    if (state.editingDestinationId) body.id = state.editingDestinationId;

    setStatus('Guardando destinatario…');
    await post('/notifications/destinations', body);
    resetDestinationForm();
    await loadAll();
    setStatus('Destinatario guardado.', 'ok');
  }

  async function savePolicy(event) {
    event.preventDefault();

    const destination_ids = Array.from(
      document.querySelectorAll('input[name="tayuPolicyDestination"]:checked')
    ).map((input) => input.value);

    const severities = Array.from(
      document.querySelectorAll('input[name="tayuSeverity"]:checked')
    ).map((input) => input.value);

    if (!destination_ids.length) throw new Error('Selecciona al menos un destinatario.');
    if (!severities.length) throw new Error('Selecciona al menos una severidad.');

    const body = {
      name: document.getElementById('tayuPolicyName')?.value?.trim(),
      description: document.getElementById('tayuPolicyDescription')?.value?.trim() || '',
      event_type: document.getElementById('tayuPolicyEvent')?.value,
      severities,
      destination_ids,
      scopes: collectScopes(),
      enabled: Boolean(document.getElementById('tayuPolicyEnabled')?.checked),
    };

    if (state.editingPolicyId) body.id = state.editingPolicyId;

    setStatus('Guardando regla…');
    await post('/notifications/policies', body);
    resetPolicyForm();
    await loadAll();
    setStatus('Regla guardada.', 'ok');
  }

  function editDestination(id) {
    const item = state.destinations.find((row) => row.id === id);
    if (!item) return;
    state.editingDestinationId = id;
    document.getElementById('tayuDestinationName').value = item.name || '';
    document.getElementById('tayuDestinationChannel').value = item.channel || 'whatsapp';
    document.getElementById('tayuDestinationType').value = item.recipient_type || 'group';
    document.getElementById('tayuDestinationAddress').value = item.address || '';
    document.getElementById('tayuDestinationEnabled').checked = Boolean(item.enabled);
    document.getElementById('tayuDestinationCancel').hidden = false;
    switchTab('destinations');
  }

  function editPolicy(id) {
    const item = state.policies.find((row) => row.id === id);
    if (!item) return;

    state.editingPolicyId = id;
    document.getElementById('tayuPolicyName').value = item.name || '';
    document.getElementById('tayuPolicyDescription').value = item.description || '';
    document.getElementById('tayuPolicyEvent').value = item.event_type || 'alarm_opened';
    document.getElementById('tayuPolicyEnabled').checked = Boolean(item.enabled);

    const severities = new Set(Array.isArray(item.severities) ? item.severities : []);
    document.querySelectorAll('input[name="tayuSeverity"]').forEach((input) => {
      input.checked = severities.has(input.value);
    });

    const destinationIds = Array.isArray(item.destination_ids)
      ? item.destination_ids
      : (Array.isArray(item.destinations) ? item.destinations.map((d) => d.id || d.destination_id).filter(Boolean) : []);
    renderPolicyDestinationChecks(destinationIds);

    const container = document.getElementById('tayuPolicyScopes');
    container.innerHTML = '';
    const scopes = Array.isArray(item.scopes) && item.scopes.length
      ? item.scopes
      : [{ scope_type: 'organization', scope_ref: null, scope_value: null }];
    scopes.forEach(createScopeRow);

    document.getElementById('tayuPolicyCancel').hidden = false;
    switchTab('policies');
  }

  async function deleteDestination(id) {
    if (!confirm('¿Eliminar este destinatario?')) return;
    await post('/notifications/destinations/delete', { id });
    if (state.editingDestinationId === id) resetDestinationForm();
    await loadAll();
    setStatus('Destinatario eliminado.', 'ok');
  }

  async function deletePolicy(id) {
    if (!confirm('¿Eliminar esta regla de notificación?')) return;
    await post('/notifications/policies/delete', { id });
    if (state.editingPolicyId === id) resetPolicyForm();
    await loadAll();
    setStatus('Regla eliminada.', 'ok');
  }

  async function toggleChannel(channel, enabled) {
    await post('/notifications/channels', { channel, enabled });
    await loadAll();
    setStatus('Canal actualizado.', 'ok');
  }

  function bindEvents() {
    document.querySelectorAll('[data-notif-tab]').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.notifTab));
    });

    document.getElementById('tayuNotificationsRefresh')?.addEventListener('click', () => {
      loadAll().catch(showError);
    });

    document.getElementById('tayuDestinationForm')?.addEventListener('submit', (event) => {
      saveDestination(event).catch(showError);
    });

    document.getElementById('tayuPolicyForm')?.addEventListener('submit', (event) => {
      savePolicy(event).catch(showError);
    });

    document.getElementById('tayuDestinationCancel')?.addEventListener('click', resetDestinationForm);
    document.getElementById('tayuPolicyCancel')?.addEventListener('click', resetPolicyForm);
    document.getElementById('tayuAddScope')?.addEventListener('click', () => createScopeRow({ scope_type: 'organization' }));

    document.getElementById('tayuHistoryChannel')?.addEventListener('change', () => loadDeliveries().catch(showError));
    document.getElementById('tayuHistoryStatus')?.addEventListener('change', () => loadDeliveries().catch(showError));

    document.getElementById('notifications')?.addEventListener('click', (event) => {
      const target = event.target.closest('button');
      if (!target) return;

      if (target.dataset.destinationEdit) editDestination(target.dataset.destinationEdit);
      if (target.dataset.destinationDelete) deleteDestination(target.dataset.destinationDelete).catch(showError);
      if (target.dataset.policyEdit) editPolicy(target.dataset.policyEdit);
      if (target.dataset.policyDelete) deletePolicy(target.dataset.policyDelete).catch(showError);
      if (target.dataset.channelToggle) {
        toggleChannel(
          target.dataset.channelToggle,
          target.dataset.nextEnabled === 'true'
        ).catch(showError);
      }
    });
  }

  function install() {
    if (!canManage()) return;
    installStyles();
    injectView();
    injectNavigation();
    bindEvents();
    resetDestinationForm();
    resetPolicyForm();
    loadAll().catch(showError);
  }

  function boot() {
    if (window.__tayuClientAccess) {
      install();
      return;
    }
    window.addEventListener('tayu:client-access-ready', install, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();