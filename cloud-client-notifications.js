(() => {
  'use strict';

  window.__tayuNotificationsVersion = '20260918-notifications12';

  const API_URL = 'https://api.tayulabs.com';
  const ALLOWED_ROLES = new Set(['owner', 'admin']);

  const EVENT_LABELS = {
    alarm_opened: 'Alarma activada',
    alarm_resolved: 'Alarma recuperada',
  };

  const SEVERITY_LABELS = {
    info: 'Información',
    warning: 'Advertencia',
    critical: 'Crítica',
  };

  const SCOPE_LABELS = {
    organization: 'Toda la organización',
    sector: 'Sector productivo',
    site: 'Sitio / finca',
    resource: 'Unidad productiva',
    device_type: 'Tipo de equipo',
    device: 'Dispositivo específico',
    alarm_rule: 'Alarma específica',
  };

  const state = {
    loaded: false,
    tab: 'destinations',
    channels: [],
    destinations: [],
    policies: [],
    deliveries: [],
    whatsappGroups: [],
    summary: {},
    scopeOptions: {
      sectors: [],
      sites: [],
      resources: [],
      device_types: [],
      devices: [],
      alarm_rules: [],
    },
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

  function unwrapObject(data) {
    let current = data;
    const seen = new Set();

    for (let i = 0; i < 4; i += 1) {
      if (!current || typeof current !== 'object' || Array.isArray(current) || seen.has(current)) break;
      seen.add(current);

      if (current.data && typeof current.data === 'object' && !Array.isArray(current.data)) {
        current = current.data;
        continue;
      }

      break;
    }

    return current;
  }

  function list(data, key) {
    const candidates = [
      data,
      data?.[key],
      data?.data,
      data?.data?.[key],
      data?.rows,
      data?.items,
      data?.results,
      data?.data?.rows,
      data?.data?.items,
      data?.data?.results,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }

    const unwrapped = unwrapObject(data);
    if (Array.isArray(unwrapped?.[key])) return unwrapped[key];
    if (Array.isArray(unwrapped?.rows)) return unwrapped.rows;
    if (Array.isArray(unwrapped?.items)) return unwrapped.items;
    if (Array.isArray(unwrapped?.results)) return unwrapped.results;

    return [];
  }

  function summaryObject(data) {
    const candidates = [
      data?.summary,
      data?.data?.summary,
      data?.data,
      data,
    ];

    for (const candidate of candidates) {
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        return candidate;
      }
    }

    return {};
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

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function requestWithRetry(path, options = {}, attempts = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await request(path, options);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await sleep(350 * attempt);
        }
      }
    }

    throw lastError || new Error('No se pudo completar la solicitud.');
  }

  function setStatus(message, type = '') {
    const el = document.getElementById('tayuNotificationsStatus');
    if (!el) return;
    el.textContent = message || '';
    const stateClass = type === 'error'
      ? ' is-error'
      : type === 'ok'
        ? ' is-ok'
        : '';
    el.className = 'tayu-notifications-status' + stateClass;
  }

  function installStyles() {
    if (document.getElementById('tayuNotificationsStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuNotificationsStyles';
    style.textContent = `
      .nav .tayu-notifications-nav{
        width:100%;display:flex;align-items:center;gap:10px;margin:6px 0;padding:13px 14px;
        border:0;background:transparent;color:var(--muted);border-radius:16px;
        font-weight:800;text-align:left;cursor:pointer;text-decoration:none;font-family:inherit;font-size:inherit
      }
      .nav .tayu-notifications-nav:hover,.nav .tayu-notifications-nav.active{background:rgba(85,198,43,.12);color:var(--text)}

      /* Notificaciones: la barra es oscura en modo claro y clara en modo oscuro */
      .tayu-notifications-nav .nav-icon .icon-white{
        opacity:1!important;
        visibility:visible!important;
        filter:none!important;
      }
      .tayu-notifications-nav .nav-icon .icon-color{
        opacity:0!important;
        visibility:hidden!important;
        filter:none!important;
      }
      body.dark .tayu-notifications-nav .nav-icon .icon-white{
        opacity:0!important;
        visibility:hidden!important;
      }
      body.dark .tayu-notifications-nav .nav-icon .icon-color{
        opacity:1!important;
        visibility:visible!important;
        filter:none!important;
      }

      body.sidebar-collapsed .tayu-notifications-nav{justify-content:center;padding:13px 8px}
      body.sidebar-collapsed .tayu-notifications-nav .nav-label{display:none}
      @media(max-width:960px){body.sidebar-collapsed .tayu-notifications-nav{justify-content:flex-start;padding:13px 14px}body.sidebar-collapsed .tayu-notifications-nav .nav-label{display:inline}}

      .tayu-notifications-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}
      .tayu-notifications-tab{border:1px solid var(--border);background:var(--panel2);color:var(--text);padding:10px 14px;border-radius:12px;font-weight:850;cursor:pointer}
      .tayu-notifications-tab.active{background:var(--brand);border-color:var(--brand);color:#fff}
      .tayu-notifications-panel{display:none}.tayu-notifications-panel.active{display:block}
      .tayu-notifications-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
      .tayu-notifications-summary>div{background:var(--panel2);border:1px solid var(--border);border-radius:16px;padding:14px}
      .tayu-notifications-summary span{display:block;color:var(--muted);font-size:12px;font-weight:850}
      .tayu-notifications-summary b{display:block;font-size:26px;margin-top:5px}
      .tayu-notifications-section-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin:4px 0 18px}
      .tayu-notifications-section-head h3{margin:0 0 5px}.tayu-notifications-section-head p{margin:0}
      .tayu-notifications-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .tayu-notifications-status{min-height:20px;margin:10px 0;font-size:13px;font-weight:800;color:var(--muted)}
      .tayu-notifications-status.is-ok{color:var(--brand)}.tayu-notifications-status.is-error{color:var(--danger)}
      .tayu-notifications-chip{display:inline-flex;padding:5px 9px;border-radius:999px;border:1px solid var(--border);font-size:11px;font-weight:900}
      .tayu-notifications-chip.on,.tayu-notifications-chip.sent{color:var(--brand)}
      .tayu-notifications-chip.failed{color:var(--danger)}
      .tayu-notifications-chip.queued,.tayu-notifications-chip.processing{color:var(--warning)}
      .tayu-notifications-channel-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
      .tayu-notifications-channel{border:1px solid var(--border);border-radius:18px;background:var(--panel2);padding:16px}
      .tayu-notifications-channel-head{display:flex;justify-content:space-between;gap:10px;align-items:center}
      .tayu-notifications-table .btn{padding:8px 10px;border-radius:10px;font-size:12px}
      #notifications .tayu-notifications-table{table-layout:fixed;min-width:0}
      #notifications .tayu-notifications-table th,#notifications .tayu-notifications-table td{white-space:normal;vertical-align:top;word-break:break-word}
      #notifications [data-notif-panel="policies"] .tayu-notifications-table th:nth-child(1){width:22%}
      #notifications [data-notif-panel="policies"] .tayu-notifications-table th:nth-child(2){width:17%}
      #notifications [data-notif-panel="policies"] .tayu-notifications-table th:nth-child(3){width:17%}
      #notifications [data-notif-panel="policies"] .tayu-notifications-table th:nth-child(4){width:24%}
      #notifications [data-notif-panel="policies"] .tayu-notifications-table th:nth-child(5){width:9%}
      #notifications [data-notif-panel="policies"] .tayu-notifications-table th:nth-child(6){width:11%}
      .tayu-notifications-checks{display:flex;gap:10px;flex-wrap:wrap}
      .tayu-notifications-checks label{margin:0;display:flex;align-items:center;gap:7px;padding:9px 11px;border:1px solid var(--border);border-radius:12px;background:var(--panel2);color:var(--text)}
      .tayu-notifications-checks input{width:auto}
      .tayu-notifications-hidden{display:none!important}
      .tayu-notifications-note{margin-top:6px;color:var(--muted);font-size:12px;font-weight:650;line-height:1.45}
      .tayu-notifications-scope-box{border:1px solid var(--border);border-radius:16px;background:var(--panel2);padding:12px}
      .tayu-notifications-scope-row{display:grid;grid-template-columns:210px minmax(0,1fr) auto;gap:9px;align-items:end;margin:8px 0}
      .tayu-notifications-scope-summary{display:flex;gap:5px;flex-wrap:wrap}
      .tayu-notifications-scope-summary span{display:inline-flex;padding:4px 8px;border-radius:999px;background:var(--panel2);border:1px solid var(--border);font-size:11px;font-weight:800}

      .tayu-notifications-modal{display:none;position:fixed;inset:0;z-index:120000;background:rgba(0,0,0,.46);padding:22px;align-items:center;justify-content:center}
      .tayu-notifications-modal.open{display:flex}
      .tayu-notifications-modal-card{width:min(780px,100%);max-height:88vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:26px;box-shadow:var(--shadow);padding:22px}
      .tayu-notifications-modal-card.wide{width:min(980px,100%)}
      .tayu-notifications-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding-bottom:14px;border-bottom:1px solid var(--border)}
      .tayu-notifications-modal-head h3{margin:0 0 5px;font-size:22px}.tayu-notifications-modal-head p{margin:0}
      .tayu-notifications-close{width:38px;height:38px;border-radius:12px;border:1px solid var(--border);background:var(--panel2);color:var(--text);cursor:pointer;font-size:20px;line-height:1}
      .tayu-notifications-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:16px}
      .tayu-notifications-form .full{grid-column:1/-1}
      .tayu-notifications-form-section{grid-column:1/-1;border-top:1px solid var(--border);padding-top:16px;margin-top:2px}
      .tayu-notifications-form-section:first-child{border-top:0;padding-top:0}
      .tayu-notifications-form-section h4{margin:0 0 4px;font-size:15px}.tayu-notifications-form-section>p{margin:0 0 12px}
      .tayu-notifications-status-control{display:flex;justify-content:space-between;align-items:center;gap:16px;border:1px solid var(--border);border-radius:16px;background:var(--panel2);padding:14px}
      .tayu-notifications-status-control b{display:block;margin-bottom:4px}.tayu-notifications-status-control span{display:block;color:var(--muted);font-size:12px}
      .tayu-notifications-switch{position:relative;width:48px;height:28px;flex:0 0 48px}
      .tayu-notifications-switch input{position:absolute;opacity:0;pointer-events:none}
      .tayu-notifications-switch i{position:absolute;inset:0;border-radius:999px;background:#a7aea5;transition:.2s;cursor:pointer}
      .tayu-notifications-switch i:after{content:'';position:absolute;width:22px;height:22px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 2px 6px rgba(0,0,0,.18)}
      .tayu-notifications-switch input:checked+i{background:var(--brand)}
      .tayu-notifications-switch input:checked+i:after{transform:translateX(20px)}
      .tayu-notifications-modal-footer{grid-column:1/-1;display:flex;justify-content:flex-end;gap:9px;border-top:1px solid var(--border);padding-top:16px;margin-top:2px}
      .tayu-notifications-destination-value{font-weight:750}.tayu-notifications-destination-value small{display:block;color:var(--muted);font-weight:650;margin-top:3px}

      @media(max-width:960px){
        .tayu-notifications-summary,.tayu-notifications-channel-grid,.tayu-notifications-form{grid-template-columns:1fr}
        .tayu-notifications-form .full,.tayu-notifications-form-section,.tayu-notifications-modal-footer{grid-column:auto}
        .tayu-notifications-scope-row{grid-template-columns:1fr}
        .tayu-notifications-section-head{flex-direction:column}.tayu-notifications-section-head .btn{width:100%}
        .tayu-notifications-modal{padding:10px;align-items:flex-start;padding-top:36px}
        .tayu-notifications-modal-card{max-height:90vh;border-radius:20px;padding:16px}
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
            <h3 style="margin:0">Notificaciones</h3>
            <p class="hint" style="margin:6px 0 0">Define quién recibe avisos, cuándo se envían y revisa cada entrega.</p>
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
          <div class="tayu-notifications-section-head">
            <div><h3>Destinatarios</h3><p class="hint">Personas, grupos o sistemas que recibirán tus avisos.</p></div>
            <button class="btn" type="button" id="tayuNotifNewDestination">+ Nuevo destinatario</button>
          </div>
          <div class="table-wrap">
            <table class="table tayu-notifications-table">
              <thead><tr><th>Nombre</th><th>Canal</th><th>Tipo</th><th>Destino</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody id="tayuNotifDestinationsBody"></tbody>
            </table>
          </div>
        </div>

        <div class="tayu-notifications-panel" data-notif-panel="policies">
          <div class="tayu-notifications-section-head">
            <div><h3>Reglas de notificación</h3><p class="hint">Decide qué evento genera un aviso, quién lo recibe y dónde aplica.</p></div>
            <button class="btn" type="button" id="tayuNotifNewPolicy">+ Nueva regla</button>
          </div>
          <div class="table-wrap">
            <table class="table tayu-notifications-table">
              <thead><tr><th>Regla</th><th>Condición</th><th>Destinatarios</th><th>Alcance</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody id="tayuNotifPoliciesBody"></tbody>
            </table>
          </div>
        </div>

        <div class="tayu-notifications-panel" data-notif-panel="channels">
          <h3>Canales</h3>
          <p class="hint">WhatsApp está operativo. Email y Telegram quedan preparados para integrar sus proveedores.</p>
          <div id="tayuNotifChannelsGrid" class="tayu-notifications-channel-grid"></div>
        </div>

        <div class="tayu-notifications-panel" data-notif-panel="history">
          <div class="module-header">
            <div><h3>Historial</h3><p class="hint">Cada intento de entrega registrado por el backend.</p></div>
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

      <div class="tayu-notifications-modal" id="tayuNotifDestinationModal" aria-hidden="true">
        <div class="tayu-notifications-modal-card" role="dialog" aria-modal="true" aria-labelledby="tayuNotifDestinationModalTitle">
          <div class="tayu-notifications-modal-head">
            <div><h3 id="tayuNotifDestinationModalTitle">Nuevo destinatario</h3><p class="hint">Configura de forma sencilla quién recibirá las notificaciones.</p></div>
            <button class="tayu-notifications-close" type="button" data-notif-close="destination" aria-label="Cerrar">×</button>
          </div>
          <form id="tayuNotifDestinationForm" class="tayu-notifications-form">
            <div class="full tayu-notifications-form-section">
              <h4>1. ¿Quién recibirá el aviso?</h4>
              <p class="hint">El nombre es solo para identificar este destinatario dentro de Tayulabs.</p>
            </div>
            <div>
              <label id="tayuNotifDestinationNameLabel">Nombre del destinatario</label>
              <input id="tayuNotifDestinationName" required placeholder="Ej: Operaciones">
              <div id="tayuNotifDestinationNameHelp" class="tayu-notifications-note">Usa un nombre fácil de reconocer.</div>
            </div>
            <div><label>Canal</label><select id="tayuNotifDestinationChannel"><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="telegram">Telegram</option></select></div>
            <div><label>Tipo de destinatario</label><select id="tayuNotifDestinationType"><option value="group">Grupo</option><option value="person">Persona</option><option value="endpoint">Sistema / endpoint</option></select></div>
            <div id="tayuNotifWhatsappGroupWrap">
              <label>Grupo de WhatsApp</label>
              <select id="tayuNotifWhatsappGroup"><option value="">Cargando grupos…</option></select>
              <div id="tayuNotifWhatsappGroupNote" class="tayu-notifications-note"></div>
            </div>
            <div id="tayuNotifDestinationAddressWrap" class="full tayu-notifications-hidden">
              <label id="tayuNotifDestinationAddressLabel">Dirección</label>
              <input id="tayuNotifDestinationAddress">
              <div id="tayuNotifDestinationAddressHelp" class="tayu-notifications-note"></div>
            </div>
            <div class="full tayu-notifications-form-section">
              <h4>2. Estado</h4>
              <p class="hint">Puedes dejarlo guardado sin permitir que reciba avisos todavía.</p>
              <div class="tayu-notifications-status-control">
                <div><b>Destinatario activo</b><span>Cuando está activo puede ser usado por las reglas de notificación.</span></div>
                <label class="tayu-notifications-switch"><input id="tayuNotifDestinationEnabled" type="checkbox" checked><i></i></label>
              </div>
            </div>
            <div class="tayu-notifications-modal-footer">
              <button class="btn ghost" id="tayuNotifDestinationCancel" type="button">Cancelar</button>
              <button class="btn" type="submit">Guardar destinatario</button>
            </div>
          </form>
        </div>
      </div>

      <div class="tayu-notifications-modal" id="tayuNotifPolicyModal" aria-hidden="true">
        <div class="tayu-notifications-modal-card wide" role="dialog" aria-modal="true" aria-labelledby="tayuNotifPolicyModalTitle">
          <div class="tayu-notifications-modal-head">
            <div><h3 id="tayuNotifPolicyModalTitle">Nueva regla</h3><p class="hint">Configura la regla por pasos. Todo lo que edites aquí pertenece a esta regla.</p></div>
            <button class="tayu-notifications-close" type="button" data-notif-close="policy" aria-label="Cerrar">×</button>
          </div>
          <form id="tayuNotifPolicyForm" class="tayu-notifications-form">
            <div class="full tayu-notifications-form-section">
              <h4>1. ¿Qué debe generar la notificación?</h4>
              <p class="hint">Dale un nombre claro a la regla y elige qué tipo de evento la activa.</p>
            </div>
            <div><label>Nombre de la regla</label><input id="tayuNotifPolicyName" required placeholder="Ej: Sensor sin conexión"></div>
            <div><label>Evento</label><select id="tayuNotifPolicyEvent"><option value="alarm_opened">Cuando se activa una alarma</option><option value="alarm_resolved">Cuando una alarma vuelve a la normalidad</option></select></div>
            <div class="full"><label>Descripción</label><input id="tayuNotifPolicyDescription" placeholder="Opcional: explica para qué sirve esta regla"></div>
            <div class="full"><label>Severidades que deben avisar</label><div class="tayu-notifications-checks"><label><input name="tayuNotifSeverity" type="checkbox" value="info" checked> Información</label><label><input name="tayuNotifSeverity" type="checkbox" value="warning" checked> Advertencia</label><label><input name="tayuNotifSeverity" type="checkbox" value="critical" checked> Crítica</label></div></div>

            <div class="full tayu-notifications-form-section">
              <h4>2. ¿Quién debe recibirla?</h4>
              <p class="hint">Selecciona uno o más destinatarios activos.</p>
              <div id="tayuNotifPolicyDestinations" class="tayu-notifications-checks"></div>
            </div>

            <div class="full tayu-notifications-form-section">
              <h4>3. ¿Dónde debe aplicar?</h4>
              <p class="hint">Puedes aplicarla a toda la organización o limitarla a un sitio, dispositivo o alarma específica.</p>
              <div id="tayuNotifPolicyScopes" class="tayu-notifications-scope-box"></div>
              <div class="tayu-notifications-actions" style="margin-top:10px">
                <button class="btn ghost" id="tayuNotifAddScope" type="button">+ Agregar otra condición</button>
              </div>
              <div class="tayu-notifications-note">Si agregas dos opciones del mismo tipo, basta que coincida una. Si combinas tipos distintos, deben cumplirse ambas condiciones.</div>
            </div>

            <div class="full tayu-notifications-form-section">
              <h4>4. Estado</h4>
              <div class="tayu-notifications-status-control">
                <div><b>Regla activa</b><span>Si la desactivas, la configuración se conserva pero no enviará avisos.</span></div>
                <label class="tayu-notifications-switch"><input id="tayuNotifPolicyEnabled" type="checkbox" checked><i></i></label>
              </div>
            </div>
            <div class="tayu-notifications-modal-footer">
              <button class="btn ghost" id="tayuNotifPolicyCancel" type="button">Cancelar</button>
              <button class="btn" type="submit">Guardar regla</button>
            </div>
          </form>
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
    link.innerHTML = '<span class="nav-icon" aria-hidden="true"><img class="tayu-nav-img icon-color" src="imagenes/icons/notificacion-color.png" alt=""><img class="tayu-nav-img icon-white" src="imagenes/icons/notificacion-white.png" alt="" aria-hidden="true"></span><span class="nav-label">Notificaciones</span>';

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
    if (tab === 'destinations') {
      loadWhatsappGroups().catch(() => {});
    }
    if (tab === 'channels') {
      setStatus('Cargando canales…');
      loadChannels().then((ok) => {
        if (ok) setStatus('Canales actualizados.', 'ok');
        else setStatus('No se pudieron cargar los canales. Reintenta con Actualizar.', 'error');
      }).catch(showError);
    }
    if (tab === 'policies') {
      loadScopeOptions().then((ok) => {
        if (!ok) {
          setStatus('No se pudieron cargar los alcances. Reintenta con Actualizar.', 'error');
        }
      }).catch(showError);
    }
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

  function destinationUsesWhatsappGroup() {
    return (
      document.getElementById('tayuNotifDestinationChannel')?.value === 'whatsapp' &&
      document.getElementById('tayuNotifDestinationType')?.value === 'group'
    );
  }

  function renderWhatsappGroups(selectedAddress = '') {
    const select = document.getElementById('tayuNotifWhatsappGroup');
    const note = document.getElementById('tayuNotifWhatsappGroupNote');
    if (!select) return;

    const groups = Array.isArray(state.whatsappGroups) ? state.whatsappGroups : [];
    const current = String(selectedAddress || document.getElementById('tayuNotifDestinationAddress')?.value || '');

    if (!groups.length) {
      select.innerHTML = '<option value="">No hay grupos disponibles</option>';
      if (note) note.textContent = 'Puedes usar el campo Dirección / ID como respaldo.';
      return;
    }

    select.innerHTML =
      '<option value="">Selecciona un grupo</option>' +
      groups.map((group) => {
        const id = String(group.id || '').trim();
        const name = String(group.name || id).trim();
        return '<option value="' + esc(id) + '"' + (id === current ? ' selected' : '') + '>' +
          esc(name) + '</option>';
      }).join('');

    if (note) note.textContent = groups.length + ' grupo(s) detectado(s).';
  }

  function syncDestinationAddressMode() {
    const channel = document.getElementById('tayuNotifDestinationChannel')?.value || 'whatsapp';
    const type = document.getElementById('tayuNotifDestinationType')?.value || 'group';
    const groupMode = channel === 'whatsapp' && type === 'group';
    const groupWrap = document.getElementById('tayuNotifWhatsappGroupWrap');
    const addressWrap = document.getElementById('tayuNotifDestinationAddressWrap');
    const address = document.getElementById('tayuNotifDestinationAddress');
    const addressLabel = document.getElementById('tayuNotifDestinationAddressLabel');
    const addressHelp = document.getElementById('tayuNotifDestinationAddressHelp');
    const nameLabel = document.getElementById('tayuNotifDestinationNameLabel');
    const nameHelp = document.getElementById('tayuNotifDestinationNameHelp');

    groupWrap?.classList.toggle('tayu-notifications-hidden', !groupMode);
    addressWrap?.classList.toggle('tayu-notifications-hidden', groupMode);

    if (nameLabel) nameLabel.textContent = type === 'person' ? 'Nombre del contacto' : type === 'group' ? 'Nombre del grupo' : 'Nombre del destinatario';
    if (nameHelp) nameHelp.textContent = type === 'person'
      ? 'Ej.: Carlos - Mantenimiento. Este nombre solo se usa dentro de Tayulabs.'
      : type === 'group'
        ? 'Puedes usar el mismo nombre del grupo de WhatsApp.'
        : 'Usa un nombre que permita reconocer fácilmente este destino.';

    let label = 'Dirección / ID';
    let placeholder = '';
    let help = '';

    if (channel === 'whatsapp' && type === 'person') {
      label = 'Número de WhatsApp';
      placeholder = 'Ej: 593987654321';
      help = 'Incluye el código de país, sin espacios. Para Ecuador empieza por 593.';
    } else if (channel === 'whatsapp') {
      label = 'ID de WhatsApp';
      placeholder = 'Ej: 593987654321@c.us';
      help = 'Uso avanzado. Para grupos usa el selector de grupos.';
    } else if (channel === 'email') {
      label = 'Correo electrónico';
      placeholder = 'Ej: operaciones@empresa.com';
      help = 'Ingresa el correo que recibirá las notificaciones.';
    } else if (channel === 'telegram') {
      label = 'Usuario / Chat ID de Telegram';
      placeholder = 'Ej: @operaciones o chat ID';
      help = 'Este canal estará disponible cuando se configure su proveedor.';
    }

    if (addressLabel) addressLabel.textContent = label;
    if (addressHelp) addressHelp.textContent = help;
    if (address) {
      address.required = !groupMode;
      address.placeholder = placeholder;
      address.inputMode = channel === 'whatsapp' && type === 'person' ? 'tel' : 'text';
    }

    if (groupMode) {
      const selected = document.getElementById('tayuNotifWhatsappGroup')?.value || '';
      if (selected && address) address.value = selected;
    }
  }

  async function loadWhatsappGroups(selectedAddress = '') {
    try {
      const data = await requestWithRetry('/notifications/whatsapp-groups');
      state.whatsappGroups = Array.isArray(data?.groups) ? data.groups : [];
      window.__tayuNotificationsRaw = {
        ...(window.__tayuNotificationsRaw || {}),
        whatsappGroups: data,
      };
      if (window.__tayuNotificationsErrors) {
        delete window.__tayuNotificationsErrors.whatsappGroups;
      }
      renderWhatsappGroups(selectedAddress);
      syncDestinationAddressMode();
      renderDestinations();
      return true;
    } catch (error) {
      state.whatsappGroups = [];
      window.__tayuNotificationsErrors = {
        ...(window.__tayuNotificationsErrors || {}),
        whatsappGroups: error?.message || String(error),
      };
      renderWhatsappGroups(selectedAddress);
      syncDestinationAddressMode();
      return false;
    }
  }

  function destinationDisplayValue(d) {
    const channel = String(d.channel || '').toLowerCase();
    const type = String(d.recipient_type || d.type || '').toLowerCase();
    const address = String(d.address || d.target || '');

    if (channel === 'whatsapp' && type === 'group') {
      const group = state.whatsappGroups.find((item) => String(item.id || '') === address);
      return { main: group?.name || d.name || 'Grupo de WhatsApp', detail: group ? 'Grupo de WhatsApp' : '' };
    }

    if (channel === 'whatsapp' && type === 'person') {
      const phone = address.replace(/@c\.us$/i, '').replace(/\D/g, '');
      return { main: phone ? '+' + phone : address || '—', detail: 'WhatsApp' };
    }

    return { main: address || '—', detail: '' };
  }

  function renderDestinations() {
    const body = document.getElementById('tayuNotifDestinationsBody');
    if (!body) return;

    body.innerHTML = state.destinations.length ? state.destinations.map((d) => {
      const display = destinationDisplayValue(d);
      const type = (d.recipient_type || d.type) === 'group' ? 'Grupo' :
        (d.recipient_type || d.type) === 'person' ? 'Persona' :
        (d.recipient_type || d.type) === 'endpoint' ? 'Sistema / endpoint' :
        (d.recipient_type || d.type || '—');
      return `
        <tr>
          <td><b>${esc(d.name)}</b></td>
          <td>${esc(String(d.channel || '').toUpperCase())}</td>
          <td>${esc(type)}</td>
          <td><div class="tayu-notifications-destination-value">${esc(display.main)}${display.detail ? '<small>' + esc(display.detail) + '</small>' : ''}</div></td>
          <td><span class="tayu-notifications-chip ${d.enabled ? 'on' : ''}">${d.enabled ? 'Activo' : 'Inactivo'}</span></td>
          <td><div class="tayu-notifications-actions"><button class="btn ghost" type="button" data-destination-edit="${esc(d.id)}">Editar</button><button class="btn ghost" type="button" data-destination-delete="${esc(d.id)}">Eliminar</button></div></td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="6" class="hint">No hay destinatarios configurados.</td></tr>';

    const checks = document.getElementById('tayuNotifPolicyDestinations');
    if (checks) {
      checks.innerHTML = state.destinations.filter((d) => d.enabled).map((d) => `
        <label><input name="tayuNotifPolicyDestination" type="checkbox" value="${esc(d.id)}"> ${esc(d.name)} <small class="hint">${esc(String(d.channel || '').toUpperCase())}</small></label>
      `).join('') || '<span class="hint">Primero crea un destinatario activo.</span>';
    }
  }

  function scopeOptionPayload(type, item) {
    if (type === 'organization') {
      return { scope_ref: null, scope_value: null };
    }

    if (type === 'sector') {
      return { scope_ref: null, scope_value: String(item?.key || item?.value || item || '') };
    }

    if (type === 'device_type') {
      return { scope_ref: null, scope_value: String(item || '') };
    }

    if (type === 'site') {
      return { scope_ref: item?.id || null, scope_value: null };
    }

    if (type === 'resource') {
      return {
        scope_ref: item?.id || null,
        scope_value: item?.resource_type || null,
      };
    }

    if (type === 'device') {
      return { scope_ref: item?.id || null, scope_value: null };
    }

    if (type === 'alarm_rule') {
      return { scope_ref: item?.id || null, scope_value: null };
    }

    return { scope_ref: null, scope_value: null };
  }

  function scopeOptionLabel(type, item) {
    if (type === 'organization') return 'Toda la organización';
    if (type === 'sector') return item?.name || item?.key || String(item || '');
    if (type === 'site') return item?.name || item?.slug || item?.id || 'Sitio';
    if (type === 'resource') {
      const label = item?.name || item?.code || item?.id || 'Unidad productiva';
      return item?.resource_type ? label + ' · ' + item.resource_type : label;
    }
    if (type === 'device_type') return String(item || '');
    if (type === 'device') return item?.name || item?.device_key || item?.id || 'Dispositivo';
    if (type === 'alarm_rule') {
      const label = item?.name || item?.system_key || item?.id || 'Regla';
      return item?.device_name ? label + ' · ' + item.device_name : label;
    }
    return String(item || '');
  }

  function scopeChoices(type) {
    if (type === 'organization') {
      return [{
        label: 'Toda la organización',
        payload: { scope_ref: null, scope_value: null },
      }];
    }

    const map = {
      sector: state.scopeOptions.sectors,
      site: state.scopeOptions.sites,
      resource: state.scopeOptions.resources,
      device_type: state.scopeOptions.device_types,
      device: state.scopeOptions.devices,
      alarm_rule: state.scopeOptions.alarm_rules,
    };

    return (Array.isArray(map[type]) ? map[type] : []).map((item) => ({
      label: scopeOptionLabel(type, item),
      payload: scopeOptionPayload(type, item),
    }));
  }

  function addScopeRow(initial = {}) {
    const host = document.getElementById('tayuNotifPolicyScopes');
    if (!host) return;

    const row = document.createElement('div');
    row.className = 'tayu-notifications-scope-row';
    row.innerHTML = `
      <div>
        <label>Aplicar por</label>
        <select class="tayu-notif-scope-type">
          ${Object.entries(SCOPE_LABELS).map(([value, label]) =>
            '<option value="' + esc(value) + '">' + esc(label) + '</option>'
          ).join('')}
        </select>
      </div>
      <div>
        <label>Selecciona</label>
        <select class="tayu-notif-scope-value"></select>
      </div>
      <button class="btn ghost tayu-notif-scope-remove" type="button">Quitar</button>
    `;

    host.appendChild(row);

    const typeSelect = row.querySelector('.tayu-notif-scope-type');
    const valueSelect = row.querySelector('.tayu-notif-scope-value');

    function populate(selected = null) {
      const type = typeSelect.value;
      const choices = scopeChoices(type);

      valueSelect.disabled = type === 'organization';
      valueSelect.innerHTML = choices.length
        ? choices.map((choice) => {
            const value = JSON.stringify(choice.payload);
            const isSelected = selected &&
              String(selected.scope_ref || '') === String(choice.payload.scope_ref || '') &&
              String(selected.scope_value || '') === String(choice.payload.scope_value || '');
            return '<option value="' + esc(value) + '"' + (isSelected ? ' selected' : '') + '>' +
              esc(choice.label) + '</option>';
          }).join('')
        : '<option value="">Sin opciones disponibles</option>';
    }

    typeSelect.value = initial.scope_type || 'organization';
    populate(initial);

    typeSelect.addEventListener('change', () => populate(null));
    row.querySelector('.tayu-notif-scope-remove')?.addEventListener('click', () => {
      row.remove();
      if (!host.querySelector('.tayu-notifications-scope-row')) {
        addScopeRow({ scope_type: 'organization', scope_ref: null, scope_value: null });
      }
    });
  }

  function collectScopes() {
    const rows = Array.from(document.querySelectorAll('#tayuNotifPolicyScopes .tayu-notifications-scope-row'));
    return rows.map((row) => {
      const scope_type = row.querySelector('.tayu-notif-scope-type')?.value || 'organization';

      if (scope_type === 'organization') {
        return { scope_type, scope_ref: null, scope_value: null };
      }

      const raw = row.querySelector('.tayu-notif-scope-value')?.value || '';
      if (!raw) throw new Error('Selecciona un valor para cada alcance.');

      const payload = JSON.parse(raw);
      return {
        scope_type,
        scope_ref: payload.scope_ref || null,
        scope_value: payload.scope_value || null,
      };
    });
  }

  function renderScopeSummary(scopes) {
    const rows = Array.isArray(scopes) && scopes.length
      ? scopes
      : [{ scope_type: 'organization', scope_ref: null, scope_value: null }];

    return rows.map((scope) => {
      const type = scope.scope_type || 'organization';
      const label = SCOPE_LABELS[type] || type;

      if (type === 'organization') return label;

      const choices = scopeChoices(type);
      const match = choices.find((choice) =>
        String(choice.payload.scope_ref || '') === String(scope.scope_ref || '') &&
        String(choice.payload.scope_value || '') === String(scope.scope_value || '')
      );

      const value = match?.label || scope.scope_value || scope.scope_ref || '—';
      return label + ': ' + value;
    });
  }

  function renderPolicies() {
    const body = document.getElementById('tayuNotifPoliciesBody');
    if (!body) return;
    body.innerHTML = state.policies.length ? state.policies.map((p) => {
      const severities = Array.isArray(p.severities)
        ? p.severities.map((value) => SEVERITY_LABELS[value] || value).join(', ')
        : '—';
      const scopes = renderScopeSummary(p.scopes);
      const destinations = Array.isArray(p.destinations)
        ? p.destinations.map((d) => d.name || d.address).filter(Boolean)
        : [];
      return `
        <tr>
          <td><b>${esc(p.name)}</b>${p.description ? '<br><small class="hint">' + esc(p.description) + '</small>' : ''}</td>
          <td><b>${esc(EVENT_LABELS[p.event_type] || p.event_type || '—')}</b><br><small class="hint">${esc(severities)}</small></td>
          <td>${destinations.length ? destinations.map((name) => '<span class="tayu-notifications-chip">' + esc(name) + '</span>').join(' ') : '<span class="hint">Sin destinatario</span>'}</td>
          <td><div class="tayu-notifications-scope-summary">${scopes.map((scope) => '<span>' + esc(scope) + '</span>').join('')}</div></td>
          <td><span class="tayu-notifications-chip ${p.enabled ? 'on' : ''}">${p.enabled ? 'Activa' : 'Inactiva'}</span></td>
          <td><div class="tayu-notifications-actions"><button class="btn ghost" type="button" data-policy-edit="${esc(p.id)}">Editar</button><button class="btn ghost" type="button" data-policy-delete="${esc(p.id)}">Eliminar</button></div></td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="6" class="hint">No hay reglas configuradas.</td></tr>';
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
          <td>${esc(EVENT_LABELS[d.event_type] || d.event_type || '—')}</td>
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

    const data = await requestWithRetry('/notifications/deliveries' + (params.toString() ? '?' + params : ''));
    state.deliveries = list(data, 'deliveries');
    renderHistory();
  }

  async function loadChannels() {
    try {
      const data = await requestWithRetry('/notifications/channels');
      state.channels = list(data, 'channels');

      window.__tayuNotificationsRaw = {
        ...(window.__tayuNotificationsRaw || {}),
        channels: data,
      };

      window.__tayuNotificationsState = {
        ...(window.__tayuNotificationsState || {}),
        channels: state.channels,
      };

      if (window.__tayuNotificationsErrors) {
        delete window.__tayuNotificationsErrors.channels;
      }

      renderChannels();
      return true;
    } catch (error) {
      window.__tayuNotificationsErrors = {
        ...(window.__tayuNotificationsErrors || {}),
        channels: error?.message || String(error),
      };
      return false;
    }
  }

  async function loadScopeOptions() {
    try {
      const data = await requestWithRetry('/notifications/scope-options');
      const rawScopeOptions = unwrapObject(data) || {};
      state.scopeOptions =
        rawScopeOptions.scope_options ||
        rawScopeOptions.options ||
        rawScopeOptions || {
          sectors: [],
          sites: [],
          resources: [],
          device_types: [],
          devices: [],
          alarm_rules: [],
        };

      window.__tayuNotificationsRaw = {
        ...(window.__tayuNotificationsRaw || {}),
        scopeOptions: data,
      };

      window.__tayuNotificationsState = {
        ...(window.__tayuNotificationsState || {}),
        scopeOptions: state.scopeOptions,
      };

      if (window.__tayuNotificationsErrors) {
        delete window.__tayuNotificationsErrors.scopeOptions;
      }

      renderPolicies();

      // Las filas de alcance pueden haberse creado antes de que llegaran
      // las opciones. Las reconstruimos conservando la selección actual.
      const host = document.getElementById('tayuNotifPolicyScopes');
      if (host) {
        let currentScopes = [];
        try {
          currentScopes = collectScopes();
        } catch (_) {
          currentScopes = [];
        }

        if (!currentScopes.length) {
          currentScopes = [{ scope_type: 'organization', scope_ref: null, scope_value: null }];
        }

        host.innerHTML = '';
        currentScopes.forEach((scope) => addScopeRow(scope));
      }

      return true;
    } catch (error) {
      window.__tayuNotificationsErrors = {
        ...(window.__tayuNotificationsErrors || {}),
        scopeOptions: error?.message || String(error),
      };
      return false;
    }
  }

  async function loadAll() {
    if (!allowed()) return;
    setStatus('Actualizando…');

    const endpoints = [
      ['summary', '/notifications/summary'],
      ['destinations', '/notifications/destinations'],
      ['policies', '/notifications/policies'],
    ];

    const raw = {};
    const errors = {};

    // Carga secuencial: evita ráfagas contra el API y permite reintentar
    // cada recurso sin perder los que ya respondieron correctamente.
    for (const [key, path] of endpoints) {
      try {
        raw[key] = await requestWithRetry(path);
      } catch (error) {
        raw[key] = null;
        errors[key] = error?.message || String(error);
      }
    }

    state.summary = summaryObject(raw.summary);

    const loadedDestinations = list(raw.destinations, 'destinations');
    const loadedPolicies = list(raw.policies, 'policies');

    if (raw.destinations !== null) state.destinations = loadedDestinations;
    if (raw.policies !== null) state.policies = loadedPolicies;

    window.__tayuNotificationsRaw = {
      ...(window.__tayuNotificationsRaw || {}),
      ...raw,
    };

    window.__tayuNotificationsErrors = errors;
    window.__tayuNotificationsState = {
      channels: state.channels,
      destinations: state.destinations,
      policies: state.policies,
      scopeOptions: state.scopeOptions,
      summary: state.summary,
    };

    state.loaded = true;

    renderSummary();
    renderChannels();
    renderDestinations();
    renderPolicies();

    if (state.tab === 'destinations') {
      loadWhatsappGroups().catch(() => {});
    }

    if (state.tab === 'policies') {
      const scopesOk = await loadScopeOptions();
      if (!scopesOk) errors.scopeOptions = window.__tayuNotificationsErrors?.scopeOptions || 'Failed to fetch';
    }

    if (state.tab === 'history') {
      try {
        await loadHistory();
      } catch (error) {
        errors.history = error?.message || String(error);
        window.__tayuNotificationsErrors = errors;
      }
    }

    const failedKeys = Object.keys(errors);

    if (failedKeys.length) {
      setStatus(
        'Carga parcial. No respondió: ' +
        failedKeys.join(', ') +
        '. Los demás datos sí se conservaron.',
        'error'
      );
    } else {
      setStatus(
        'Actualizado · ' +
        state.destinations.length + ' destinatario(s) · ' +
        state.policies.length + ' regla(s).',
        'ok'
      );
    }
  }

  function setModalOpen(id, open) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.toggle('open', Boolean(open));
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function closeDestinationModal() { setModalOpen('tayuNotifDestinationModal', false); }
  function closePolicyModal() { setModalOpen('tayuNotifPolicyModal', false); }

  function openNewDestination() {
    resetDestinationForm();
    const title = document.getElementById('tayuNotifDestinationModalTitle');
    if (title) title.textContent = 'Nuevo destinatario';
    setModalOpen('tayuNotifDestinationModal', true);
    if (destinationUsesWhatsappGroup()) loadWhatsappGroups().catch(() => {});
    setTimeout(() => document.getElementById('tayuNotifDestinationName')?.focus(), 0);
  }

  async function openNewPolicy() {
    resetPolicyForm();
    await loadScopeOptions();
    resetPolicyForm();
    const title = document.getElementById('tayuNotifPolicyModalTitle');
    if (title) title.textContent = 'Nueva regla';
    setModalOpen('tayuNotifPolicyModal', true);
    setTimeout(() => document.getElementById('tayuNotifPolicyName')?.focus(), 0);
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
    const address = document.getElementById('tayuNotifDestinationAddress');
    if (address) address.value = '';
    renderWhatsappGroups('');
    syncDestinationAddressMode();
  }

  function resetPolicyForm() {
    state.editingPolicy = null;
    document.getElementById('tayuNotifPolicyForm')?.reset();
    document.querySelectorAll('input[name="tayuNotifSeverity"]').forEach((el) => el.checked = true);
    const enabled = document.getElementById('tayuNotifPolicyEnabled');
    if (enabled) enabled.checked = true;
    const scopes = document.getElementById('tayuNotifPolicyScopes');
    if (scopes) {
      scopes.innerHTML = '';
      addScopeRow({ scope_type: 'organization', scope_ref: null, scope_value: null });
    }
  }

  async function saveDestination(event) {
    event.preventDefault();

    const channel = document.getElementById('tayuNotifDestinationChannel').value;
    const recipientType = document.getElementById('tayuNotifDestinationType').value;
    const groupMode = channel === 'whatsapp' && recipientType === 'group';
    const groupSelect = document.getElementById('tayuNotifWhatsappGroup');
    const addressInput = document.getElementById('tayuNotifDestinationAddress');
    const selectedGroupId = groupMode ? String(groupSelect?.value || '').trim() : '';
    let address = groupMode ? selectedGroupId : String(addressInput?.value || '').trim();

    if (groupMode && !address) throw new Error('Selecciona un grupo de WhatsApp.');

    if (channel === 'whatsapp' && recipientType === 'person') {
      const digits = address.replace(/@c\.us$/i, '').replace(/\D/g, '');
      if (digits.length < 8) throw new Error('Ingresa un número de WhatsApp válido con código de país.');
      address = digits + '@c.us';
    }

    let name = document.getElementById('tayuNotifDestinationName').value.trim();
    if (!name && groupMode) name = groupSelect?.selectedOptions?.[0]?.textContent?.trim() || '';
    if (!name) throw new Error('Escribe un nombre para identificar al destinatario.');

    const body = {
      name,
      channel,
      recipient_type: recipientType,
      address,
      enabled: document.getElementById('tayuNotifDestinationEnabled').checked,
      metadata: groupMode ? { source: 'whatsapp-service' } : {},
    };
    if (state.editingDestination) body.id = state.editingDestination;

    await request('/notifications/destinations', { method: 'POST', body: JSON.stringify(body) });
    closeDestinationModal();
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
      scopes: collectScopes(),
      enabled: document.getElementById('tayuNotifPolicyEnabled').checked,
    };
    if (state.editingPolicy) body.id = state.editingPolicy;

    await request('/notifications/policies', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    closePolicyModal();
    resetPolicyForm();
    await loadAll();
    setStatus('Regla guardada.', 'ok');
  }

  function editDestination(id) {
    const d = state.destinations.find((row) => row.id === id);
    if (!d) return;
    state.editingDestination = id;
    const title = document.getElementById('tayuNotifDestinationModalTitle');
    if (title) title.textContent = 'Editar destinatario';
    document.getElementById('tayuNotifDestinationName').value = d.name || '';
    document.getElementById('tayuNotifDestinationChannel').value = d.channel || 'whatsapp';
    document.getElementById('tayuNotifDestinationType').value = d.recipient_type || d.type || 'group';
    let editAddress = d.address || d.target || '';
    if ((d.channel || '') === 'whatsapp' && (d.recipient_type || d.type || '') === 'person') {
      editAddress = String(editAddress).replace(/@c\.us$/i, '');
    }
    document.getElementById('tayuNotifDestinationAddress').value = editAddress;
    document.getElementById('tayuNotifDestinationEnabled').checked = Boolean(d.enabled);
    renderWhatsappGroups(d.address || d.target || '');
    syncDestinationAddressMode();
    setModalOpen('tayuNotifDestinationModal', true);
    if ((d.channel || '') === 'whatsapp' && (d.recipient_type || d.type || '') === 'group') {
      loadWhatsappGroups(d.address || d.target || '').catch(() => {});
    }
  }

  function editPolicy(id) {
    const p = state.policies.find((row) => row.id === id);
    if (!p) return;
    state.editingPolicy = id;
    const title = document.getElementById('tayuNotifPolicyModalTitle');
    if (title) title.textContent = 'Editar regla';
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

    const scopeHost = document.getElementById('tayuNotifPolicyScopes');
    if (scopeHost) {
      scopeHost.innerHTML = '';
      const scopes = Array.isArray(p.scopes) && p.scopes.length
        ? p.scopes
        : [{ scope_type: 'organization', scope_ref: null, scope_value: null }];
      scopes.forEach((scope) => addScopeRow(scope));
    }

    setModalOpen('tayuNotifPolicyModal', true);
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
    document.getElementById('tayuNotifNewDestination')?.addEventListener('click', openNewDestination);
    document.getElementById('tayuNotifNewPolicy')?.addEventListener('click', () => openNewPolicy().catch(showError));
    document.getElementById('tayuNotifDestinationCancel')?.addEventListener('click', closeDestinationModal);
    document.getElementById('tayuNotifPolicyCancel')?.addEventListener('click', closePolicyModal);
    document.querySelectorAll('[data-notif-close="destination"]').forEach((el) => el.addEventListener('click', closeDestinationModal));
    document.querySelectorAll('[data-notif-close="policy"]').forEach((el) => el.addEventListener('click', closePolicyModal));

    document.getElementById('tayuNotifDestinationChannel')?.addEventListener('change', () => {
      syncDestinationAddressMode();
      if (destinationUsesWhatsappGroup()) loadWhatsappGroups().catch(() => {});
    });
    document.getElementById('tayuNotifDestinationType')?.addEventListener('change', () => {
      syncDestinationAddressMode();
      if (destinationUsesWhatsappGroup()) loadWhatsappGroups().catch(() => {});
    });
    document.getElementById('tayuNotifWhatsappGroup')?.addEventListener('change', (event) => {
      const address = document.getElementById('tayuNotifDestinationAddress');
      if (address) address.value = event.target.value || '';
      const name = document.getElementById('tayuNotifDestinationName');
      if (name && !name.value.trim()) name.value = event.target.selectedOptions?.[0]?.textContent?.trim() || '';
    });

    document.getElementById('tayuNotifAddScope')?.addEventListener('click', () => addScopeRow({ scope_type: 'organization' }));
    document.getElementById('tayuNotifDestinationForm')?.addEventListener('submit', (e) => saveDestination(e).catch(showError));
    document.getElementById('tayuNotifPolicyForm')?.addEventListener('submit', (e) => savePolicy(e).catch(showError));
    document.getElementById('tayuNotifHistoryChannel')?.addEventListener('change', () => loadHistory().catch(showError));
    document.getElementById('tayuNotifHistoryStatus')?.addEventListener('change', () => loadHistory().catch(showError));

    ['tayuNotifDestinationModal', 'tayuNotifPolicyModal'].forEach((id) => {
      document.getElementById(id)?.addEventListener('click', (event) => {
        if (event.target.id !== id) return;
        if (id === 'tayuNotifDestinationModal') closeDestinationModal();
        else closePolicyModal();
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      closeDestinationModal();
      closePolicyModal();
    });

    document.getElementById('notifications')?.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.destinationEdit) editDestination(button.dataset.destinationEdit);
      else if (button.dataset.destinationDelete) removeDestination(button.dataset.destinationDelete).catch(showError);
      else if (button.dataset.policyEdit) editPolicy(button.dataset.policyEdit);
      else if (button.dataset.policyDelete) removePolicy(button.dataset.policyDelete).catch(showError);
      else if (button.dataset.channel) toggleChannel(button.dataset.channel, button.dataset.channelEnabled === 'true').catch(showError);
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
    closeDestinationModal();
    closePolicyModal();
  }

  window.__tayuNotificationsReload = () => loadAll();
  window.__tayuNotificationsOpen = () => openView();

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