(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const state = {
    organizations: [],
    loadingOrganizations: null,
    tabTimer: null,
    rowsTimer: null,
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

  const post = (path, body) => request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  function injectStyles() {
    if (document.getElementById('tayuSubscriptionControlsStyles')) return;

    const style = document.createElement('style');
    style.id = 'tayuSubscriptionControlsStyles';
    style.textContent = `
      .subscription-status-card{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(300px,1.2fr);gap:14px;padding:15px;border:1px solid var(--border);border-radius:16px;background:var(--panel2);margin-bottom:14px}
      .subscription-status-main{display:flex;flex-direction:column;gap:7px;justify-content:center}
      .subscription-status-main small,.subscription-status-meta small{color:var(--muted);font-size:11px;font-weight:800}
      .subscription-status-main strong{font-size:20px}
      .subscription-status-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .subscription-status-meta>div{padding:10px;border:1px solid var(--border);border-radius:12px;background:var(--panel)}
      .subscription-status-meta b{display:block;margin-top:4px;font-size:12px;word-break:break-word}
      .subscription-access{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:900}
      .subscription-help{margin:0 0 14px;padding:11px 13px;border:1px solid rgba(37,99,235,.22);background:rgba(37,99,235,.07);color:var(--blue);border-radius:13px;font-size:12px;font-weight:750;line-height:1.5}
      .human-access-box{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px;border:1px solid var(--border);border-radius:15px;background:var(--panel);margin:0 0 14px}
      .human-access-box.suspended{border-color:rgba(220,38,38,.28);background:rgba(220,38,38,.055)}
      .human-access-copy b{display:block;margin-bottom:4px}
      .human-access-copy p{margin:0;color:var(--muted);font-size:12px;line-height:1.5}
      .human-access-copy small{display:block;margin-top:6px;color:var(--muted)}
      .human-access-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .human-access-status{white-space:nowrap}
      @media(max-width:760px){
        .subscription-status-card{grid-template-columns:1fr}
        .subscription-status-meta{grid-template-columns:1fr}
        .human-access-box{align-items:flex-start;flex-direction:column}
        .human-access-actions{width:100%;justify-content:flex-start}
      }
    `;
    document.head.appendChild(style);
  }

  function parseDate(value) {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).slice(0, 10));
    if (!match) return null;
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  function todayUtcDate() {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  function addDays(date, days) {
    const result = new Date(date.getTime());
    result.setUTCDate(result.getUTCDate() + Number(days || 0));
    return result;
  }

  function formatDate(value) {
    const date = value instanceof Date ? value : parseDate(value);
    if (!date || Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('es-EC', { timeZone: 'UTC' }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('es-EC', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  function calculateState(subscription = {}) {
    if (subscription.subscription_state) return String(subscription.subscription_state);

    const start = parseDate(subscription.start_date);
    const end = parseDate(subscription.end_date);
    const today = todayUtcDate();

    if (!start && !end) return 'unconfigured';
    if (start && today < start) return 'not_started';
    if (!end) return 'active';
    if (today <= end) return 'active';

    const graceEnabled = subscription.grace_enabled !== false;
    const graceDays = Number(subscription.grace_days ?? 5);
    const graceEnd = addDays(end, graceDays);

    if (graceEnabled && today <= graceEnd) return 'grace';
    return 'expired';
  }

  function stateInfo(subscription = {}) {
    if (subscription.human_suspended_at) {
      return {
        status: 'manual_suspended',
        label: 'Suspendida manualmente',
        pill: 'off',
        access: false,
        description: 'TAYULABS suspendió manualmente el acceso humano de esta empresa. MQTT, ingestión, heartbeat y procesos de campo continúan operativos.',
      };
    }

    const status = calculateState(subscription);
    const info = {
      unconfigured: {
        label: 'Sin configurar', pill: 'warn', access: true,
        description: 'La empresa todavía no tiene fechas de servicio. Por compatibilidad, el acceso permanece habilitado.',
      },
      not_started: {
        label: 'Aún no inicia', pill: 'blue', access: false,
        description: 'La fecha de inicio está en el futuro. Los usuarios de la empresa todavía no pueden acceder.',
      },
      active: {
        label: 'Activa', pill: '', access: true,
        description: 'La suscripción está vigente y los usuarios de la empresa tienen acceso normal.',
      },
      grace: {
        label: 'Período de gracia', pill: 'warn', access: true,
        description: 'La fecha de servicio terminó, pero la empresa continúa operativa durante el período de gracia.',
      },
      expired: {
        label: 'Vencida', pill: 'off', access: false,
        description: 'Terminó la suscripción y también el período de gracia. El backend bloquea únicamente el acceso humano del cliente.',
      },
    };

    return { status, ...(info[status] || info.unconfigured) };
  }

  function graceEnd(subscription = {}) {
    if (subscription.grace_ends_on) return parseDate(subscription.grace_ends_on);
    const end = parseDate(subscription.end_date);
    if (!end || subscription.grace_enabled === false) return null;
    return addDays(end, Number(subscription.grace_days ?? 5));
  }

  async function loadOrganizations(force = false) {
    if (!force && state.organizations.length) return state.organizations;
    if (!force && state.loadingOrganizations) return state.loadingOrganizations;

    state.loadingOrganizations = request('/admin/organizations')
      .then((rows) => {
        state.organizations = Array.isArray(rows) ? rows : [];
        return state.organizations;
      })
      .finally(() => {
        state.loadingOrganizations = null;
      });

    return state.loadingOrganizations;
  }

  function currentOrganization() {
    const slug = document.getElementById('orgModalSubtitle')?.textContent?.trim();
    if (!slug || slug === '—' || slug === 'Cargando…') return null;
    return state.organizations.find((org) => org.slug === slug) || null;
  }

  function formSubscriptionFallback(tab) {
    const form = tab.querySelector('form');
    if (!form) return {};
    return {
      start_date: form.querySelector('[name="start_date"]')?.value || null,
      end_date: form.querySelector('[name="end_date"]')?.value || null,
      grace_enabled: form.querySelector('[name="grace_enabled"]')?.value !== 'false',
      grace_days: Number(form.querySelector('[name="grace_days"]')?.value || 5),
    };
  }

  function renderCombined(tab, org, subscription) {
    tab.querySelector('[data-subscription-enhancer]')?.remove();
    tab.querySelector('[data-human-access-control]')?.remove();
    tab.querySelector('.notice')?.remove();

    const info = stateInfo(subscription);
    const graceUntil = graceEnd(subscription);
    const start = subscription.start_date ? formatDate(subscription.start_date) : '—';
    const end = subscription.end_date ? formatDate(subscription.end_date) : '—';
    const grace = graceUntil ? formatDate(graceUntil) : '—';
    const suspended = Boolean(subscription.human_suspended_at);

    const fragment = document.createDocumentFragment();

    const status = document.createElement('div');
    status.dataset.subscriptionEnhancer = '1';
    status.innerHTML = `
      <div class="subscription-status-card">
        <div class="subscription-status-main">
          <small>ESTADO EFECTIVO</small>
          <div><span class="pill ${esc(info.pill)}">${esc(info.label)}</span></div>
          <strong>${info.access ? 'Acceso permitido' : (suspended ? 'Acceso humano bloqueado' : 'Acceso bloqueado')}</strong>
          <span class="subscription-access ${info.access ? '' : 'muted'}">${info.access ? '● Backend habilitado' : '● Backend bloqueado'}</span>
        </div>
        <div>
          <p style="margin:0 0 10px;color:var(--muted);font-size:12px;line-height:1.5">${esc(info.description)}</p>
          <div class="subscription-status-meta">
            <div><small>Inicio</small><b>${esc(start)}</b></div>
            <div><small>Fin</small><b>${esc(end)}</b></div>
            <div><small>Fin de gracia</small><b>${esc(grace)}</b></div>
          </div>
        </div>
      </div>
      <div class="subscription-help">
        La suspensión bloquea el acceso humano, pero no detiene dispositivos, MQTT ni la recepción de telemetría.
      </div>
    `;
    fragment.appendChild(status);

    if (org?.id) {
      const control = document.createElement('div');
      control.dataset.humanAccessControl = '1';
      control.className = `human-access-box ${suspended ? 'suspended' : ''}`;
      control.innerHTML = `
        <div class="human-access-copy">
          <b>Suspensión manual de acceso humano</b>
          <p>${suspended
            ? 'Los usuarios de esta empresa están bloqueados manualmente. Los dispositivos, MQTT y la ingestión continúan activos.'
            : 'Permite bloquear temporalmente a los usuarios sin detener dispositivos, MQTT ni la recepción de telemetría.'}</p>
          ${suspended ? `<small>Suspendida desde: ${esc(formatDateTime(subscription.human_suspended_at))}</small>` : ''}
        </div>
        <div class="human-access-actions">
          <span class="pill ${suspended ? 'off' : ''} human-access-status">${suspended ? 'Suspendida' : 'Acceso habilitado'}</span>
          <button type="button" class="btn ${suspended ? '' : 'danger'} small">${suspended ? 'Reactivar acceso' : 'Suspender acceso'}</button>
        </div>
      `;

      const button = control.querySelector('button');
      button?.addEventListener('click', () => setHumanAccess(org, !suspended, button));
      fragment.appendChild(control);
    }

    tab.prepend(fragment);
  }

  async function enhanceSubscriptionTab(force = false) {
    const tab = document.getElementById('tab-subscription');
    if (!tab || !tab.querySelector('form')) return;

    if (!force && tab.querySelector('[data-subscription-enhancer]') && tab.querySelector('[data-human-access-control]')) {
      return;
    }

    let subscription = formSubscriptionFallback(tab);

    try {
      await loadOrganizations();
      const org = currentOrganization();
      if (org?.id) {
        subscription = await request(`/admin/organization/subscription?organization_id=${encodeURIComponent(org.id)}`);
      }
      renderCombined(tab, org, subscription || {});
    } catch (error) {
      console.warn('TAYULABS subscription controls:', error);
      const org = currentOrganization();
      renderCombined(tab, org, subscription || {});
    }
  }

  async function setHumanAccess(org, suspended, button) {
    const confirmation = suspended
      ? `¿Suspender el acceso humano de ${org.name}?\n\nLos usuarios quedarán bloqueados, pero MQTT, telemetría y dispositivos continuarán funcionando.`
      : `¿Reactivar el acceso humano de ${org.name}?`;

    if (!window.confirm(confirmation)) return;

    const previous = button.textContent;
    button.disabled = true;
    button.textContent = suspended ? 'Suspendiendo…' : 'Reactivando…';

    try {
      await post('/admin/organization/subscription/human-access', {
        organization_id: org.id,
        suspended,
      });

      if (typeof window.showSuccess === 'function') {
        window.showSuccess(suspended ? 'Acceso humano suspendido.' : 'Acceso humano reactivado.');
      }

      await loadOrganizations(true);
      await enhanceSubscriptionTab(true);
      await refreshOrganizationRows(false);
    } catch (error) {
      if (typeof window.showError === 'function') {
        window.showError('orgError', error.message);
      } else {
        alert(error.message);
      }
    } finally {
      button.disabled = false;
      button.textContent = previous;
    }
  }

  function extractOrganizationId(row) {
    const onclick = row.getAttribute('onclick') || '';
    const match = /openOrganization\(['"]([^'"]+)['"]\)/.exec(onclick);
    return match?.[1] || null;
  }

  function serviceCellHtml(org) {
    const info = stateInfo(org);
    if (org.human_suspended_at) {
      return `<span class="pill off">Suspendida manualmente</span><br><span class="muted">desde ${esc(formatDateTime(org.human_suspended_at))}</span>`;
    }

    const end = org.end_date ? `hasta ${formatDate(org.end_date)}` : (
      info.status === 'active' && org.start_date ? 'sin fecha final' : 'sin fechas'
    );
    return `<span class="pill ${esc(info.pill)}">${esc(info.label)}</span><br><span class="muted">${esc(end)}</span>`;
  }

  async function refreshOrganizationRows(force = true) {
    try {
      const orgs = await loadOrganizations(force);
      const map = new Map(orgs.map((org) => [String(org.id), org]));

      for (const hostId of ['organizationsHost', 'overviewOrganizations']) {
        const host = document.getElementById(hostId);
        if (!host) continue;

        host.querySelectorAll('tbody tr[onclick]').forEach((row) => {
          const id = extractOrganizationId(row);
          const org = id ? map.get(String(id)) : null;
          const cell = row.children?.[2];
          if (org && cell) cell.innerHTML = serviceCellHtml(org);
        });
      }
    } catch (error) {
      console.warn('TAYULABS organization subscription rows:', error);
    }
  }

  function scheduleTabEnhance() {
    clearTimeout(state.tabTimer);
    state.tabTimer = setTimeout(() => enhanceSubscriptionTab(false), 0);
  }

  function scheduleRowsRefresh() {
    clearTimeout(state.rowsTimer);
    state.rowsTimer = setTimeout(() => refreshOrganizationRows(true), 120);
  }

  function installObservers() {
    const tab = document.getElementById('tab-subscription');
    if (tab && tab.dataset.subscriptionControlsObserver !== '1') {
      tab.dataset.subscriptionControlsObserver = '1';
      const observer = new MutationObserver(() => {
        if (!tab.querySelector('form')) return;
        const hasStatus = Boolean(tab.querySelector('[data-subscription-enhancer]'));
        const hasControl = Boolean(tab.querySelector('[data-human-access-control]'));
        if (hasStatus && hasControl) return;
        scheduleTabEnhance();
      });
      observer.observe(tab, { childList: true });
    }

    for (const id of ['organizationsHost', 'overviewOrganizations']) {
      const host = document.getElementById(id);
      if (!host || host.dataset.subscriptionControlsObserver === '1') continue;
      host.dataset.subscriptionControlsObserver = '1';
      const observer = new MutationObserver((mutations) => {
        if (!mutations.some((mutation) => mutation.target === host)) return;
        scheduleRowsRefresh();
      });
      observer.observe(host, { childList: true });
    }
  }

  function boot() {
    injectStyles();
    installObservers();
    setTimeout(async () => {
      try {
        await loadOrganizations();
        await enhanceSubscriptionTab(false);
        await refreshOrganizationRows(false);
      } catch (error) {
        console.warn('TAYULABS subscription controls boot:', error);
      }
    }, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
