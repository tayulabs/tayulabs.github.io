(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const state = {
    organizations: [],
    loadingOrganizations: null,
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

  async function request(path) {
    const kc = await getKeycloak();
    await kc.updateToken(60);

    const response = await fetch(API_URL + path, {
      headers: {
        Authorization: `Bearer ${kc.token}`,
      },
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `API ${response.status}`);
    return data;
  }

  function injectStyles() {
    if (document.getElementById('tayuSubscriptionStyles')) return;

    const style = document.createElement('style');
    style.id = 'tayuSubscriptionStyles';
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
      @media(max-width:760px){.subscription-status-card{grid-template-columns:1fr}.subscription-status-meta{grid-template-columns:1fr}}
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

  function stateInfo(subscription) {
    const status = calculateState(subscription);

    const info = {
      unconfigured: {
        label: 'Sin configurar',
        pill: 'warn',
        access: true,
        description: 'La empresa todavía no tiene fechas de servicio. Por compatibilidad, el acceso permanece habilitado.',
      },
      not_started: {
        label: 'Aún no inicia',
        pill: 'blue',
        access: false,
        description: 'La fecha de inicio está en el futuro. Los usuarios de la empresa todavía no pueden acceder.',
      },
      active: {
        label: 'Activa',
        pill: '',
        access: true,
        description: 'La suscripción está vigente y los usuarios de la empresa tienen acceso normal.',
      },
      grace: {
        label: 'Período de gracia',
        pill: 'warn',
        access: true,
        description: 'La fecha de servicio terminó, pero la empresa continúa operativa durante el período de gracia.',
      },
      expired: {
        label: 'Vencida',
        pill: 'off',
        access: false,
        description: 'Terminó la suscripción y también el período de gracia. El backend bloquea el acceso de los usuarios de la empresa.',
      },
    };

    return { status, ...(info[status] || info.unconfigured) };
  }

  function graceEnd(subscription) {
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

  function currentOrganizationFromDom() {
    const slug = document.getElementById('orgModalSubtitle')?.textContent?.trim();
    if (!slug) return null;
    return state.organizations.find((item) => item.slug === slug) || null;
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

  function renderStatusCard(tab, subscription) {
    const old = tab.querySelector('[data-subscription-enhancer]');
    if (old) old.remove();

    const info = stateInfo(subscription);
    const graceUntil = graceEnd(subscription);
    const start = subscription.start_date ? formatDate(subscription.start_date) : '—';
    const end = subscription.end_date ? formatDate(subscription.end_date) : '—';
    const grace = graceUntil ? formatDate(graceUntil) : '—';

    const wrapper = document.createElement('div');
    wrapper.dataset.subscriptionEnhancer = '1';
    wrapper.innerHTML = `
      <div class="subscription-status-card">
        <div class="subscription-status-main">
          <small>ESTADO EFECTIVO</small>
          <div><span class="pill ${esc(info.pill)}">${esc(info.label)}</span></div>
          <strong>${info.access ? 'Acceso permitido' : 'Acceso bloqueado'}</strong>
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
        TAYULABS Cloud permite el acceso durante la vigencia y el período de gracia. Al finalizar la gracia, las solicitudes del cliente son bloqueadas por el backend. La suspensión manual de una empresa se administrará por separado.
      </div>
    `;

    const legacyNotice = tab.querySelector('.notice');
    if (legacyNotice) legacyNotice.remove();
    tab.prepend(wrapper);
  }

  async function enhanceSubscriptionTab() {
    const tab = document.getElementById('tab-subscription');
    if (!tab || !tab.querySelector('form')) return;

    try {
      await loadOrganizations();
      const org = currentOrganizationFromDom();
      let subscription = formSubscriptionFallback(tab);

      if (org?.id) {
        try {
          const live = await request(`/admin/organization/subscription?organization_id=${encodeURIComponent(org.id)}`);
          if (live) subscription = live;
        } catch (error) {
          console.warn('TAYULABS subscription status:', error);
        }
      }

      renderStatusCard(tab, subscription);
    } catch (error) {
      console.warn('TAYULABS subscription enhancer:', error);
      renderStatusCard(tab, formSubscriptionFallback(tab));
    }
  }

  function extractOrganizationId(row) {
    const onclick = row.getAttribute('onclick') || '';
    const match = /openOrganization\(['"]([^'"]+)['"]\)/.exec(onclick);
    return match?.[1] || null;
  }

  function serviceCellHtml(org) {
    const info = stateInfo(org);
    const end = org.end_date ? `hasta ${formatDate(org.end_date)}` : (
      info.status === 'active' && org.start_date ? 'sin fecha final' : 'sin fechas'
    );
    return `<span class="pill ${esc(info.pill)}">${esc(info.label)}</span><br><span class="muted">${esc(end)}</span>`;
  }

  async function refreshOrganizationServiceCells() {
    try {
      const orgs = await loadOrganizations(true);
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
      console.warn('TAYULABS organization subscription labels:', error);
    }
  }

  function installObservers() {
    const tab = document.getElementById('tab-subscription');
    if (tab && tab.dataset.subscriptionObserver !== '1') {
      tab.dataset.subscriptionObserver = '1';
      const observer = new MutationObserver(() => {
        queueMicrotask(enhanceSubscriptionTab);
      });
      observer.observe(tab, { childList: true });
    }

    ['organizationsHost', 'overviewOrganizations'].forEach((id) => {
      const host = document.getElementById(id);
      if (!host || host.dataset.subscriptionObserver === '1') return;
      host.dataset.subscriptionObserver = '1';
      const observer = new MutationObserver(() => {
        clearTimeout(host.__tayuSubscriptionRefreshTimer);
        host.__tayuSubscriptionRefreshTimer = setTimeout(refreshOrganizationServiceCells, 120);
      });
      observer.observe(host, { childList: true, subtree: true });
    });
  }

  function boot() {
    injectStyles();
    installObservers();
    setTimeout(() => {
      enhanceSubscriptionTab();
      refreshOrganizationServiceCells();
    }, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
