(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  let organizations = [];
  let refreshTimer = null;

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
    await kc.updateToken(60);

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
    if (document.getElementById('tayuHumanAccessStyles')) return;

    const style = document.createElement('style');
    style.id = 'tayuHumanAccessStyles';
    style.textContent = `
      .human-access-box{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px;border:1px solid var(--border);border-radius:15px;background:var(--panel);margin:0 0 14px}
      .human-access-box.suspended{border-color:rgba(220,38,38,.28);background:rgba(220,38,38,.055)}
      .human-access-copy b{display:block;margin-bottom:4px}
      .human-access-copy p{margin:0;color:var(--muted);font-size:12px;line-height:1.5}
      .human-access-copy small{display:block;margin-top:6px;color:var(--muted)}
      .human-access-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .human-access-status{white-space:nowrap}
      @media(max-width:760px){.human-access-box{align-items:flex-start;flex-direction:column}.human-access-actions{width:100%;justify-content:flex-start}}
    `;
    document.head.appendChild(style);
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

  async function loadOrganizations() {
    const rows = await request('/admin/organizations');
    organizations = Array.isArray(rows) ? rows : [];
    return organizations;
  }

  function currentOrganization() {
    const slug = document.getElementById('orgModalSubtitle')?.textContent?.trim();
    if (!slug) return null;
    return organizations.find((org) => org.slug === slug) || null;
  }

  function forceSuspendedStatus(enhancer, subscription) {
    if (!enhancer || !subscription?.human_suspended_at) return;

    const main = enhancer.querySelector('.subscription-status-main');
    if (main) {
      const pill = main.querySelector('.pill');
      if (pill) {
        pill.className = 'pill off';
        pill.textContent = 'Suspendida manualmente';
      }

      const strong = main.querySelector('strong');
      if (strong) strong.textContent = 'Acceso humano bloqueado';

      const access = main.querySelector('.subscription-access');
      if (access) {
        access.classList.add('muted');
        access.textContent = '● Backend bloqueado';
      }
    }

    const description = enhancer.querySelector('.subscription-status-card > div:nth-child(2) > p');
    if (description) {
      description.textContent = 'TAYULABS suspendió manualmente el acceso humano de esta empresa. MQTT, ingestión, heartbeat y procesos de campo continúan operativos.';
    }
  }

  async function setHumanAccess(org, suspended, button) {
    const verb = suspended ? 'suspender' : 'reactivar';
    const confirmation = suspended
      ? `¿Suspender el acceso humano de ${org.name}?\n\nLos usuarios quedarán bloqueados, pero MQTT, telemetría y dispositivos continuarán funcionando.`
      : `¿Reactivar el acceso humano de ${org.name}?`;

    if (!window.confirm(confirmation)) return;

    const previous = button.textContent;
    button.disabled = true;
    button.textContent = suspended ? 'Suspendiendo…' : 'Reactivando…';

    try {
      const result = await post('/admin/organization/subscription/human-access', {
        organization_id: org.id,
        suspended,
      });

      if (typeof window.showSuccess === 'function') {
        window.showSuccess(suspended ? 'Acceso humano suspendido.' : 'Acceso humano reactivado.');
      }

      await loadOrganizations();

      if (typeof window.openOrganization === 'function') {
        await window.openOrganization(org.id);
      } else {
        await enhanceSubscriptionTab();
      }

      await refreshOrganizationRows();
      return result;
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

  function renderControl(tab, org, subscription) {
    const previous = tab.querySelector('[data-human-access-control]');
    if (previous) previous.remove();

    const suspended = Boolean(subscription?.human_suspended_at);
    const box = document.createElement('div');
    box.dataset.humanAccessControl = '1';
    box.className = `human-access-box ${suspended ? 'suspended' : ''}`;
    box.innerHTML = `
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

    const button = box.querySelector('button');
    button.addEventListener('click', () => setHumanAccess(org, !suspended, button));

    const enhancer = tab.querySelector('[data-subscription-enhancer]');
    if (enhancer) {
      forceSuspendedStatus(enhancer, subscription);
      enhancer.insertAdjacentElement('afterend', box);
    } else {
      tab.prepend(box);
    }
  }

  async function enhanceSubscriptionTab() {
    const tab = document.getElementById('tab-subscription');
    if (!tab || !tab.querySelector('form')) return;

    try {
      if (!organizations.length) await loadOrganizations();
      const org = currentOrganization();
      if (!org?.id) return;

      const subscription = await request(`/admin/organization/subscription?organization_id=${encodeURIComponent(org.id)}`);
      renderControl(tab, org, subscription || {});
    } catch (error) {
      console.warn('TAYULABS human access:', error);
    }
  }

  function extractOrganizationId(row) {
    const onclick = row.getAttribute('onclick') || '';
    const match = /openOrganization\(['"]([^'"]+)['"]\)/.exec(onclick);
    return match?.[1] || null;
  }

  async function refreshOrganizationRows() {
    try {
      const orgs = await loadOrganizations();
      const map = new Map(orgs.map((org) => [String(org.id), org]));

      for (const hostId of ['organizationsHost', 'overviewOrganizations']) {
        const host = document.getElementById(hostId);
        if (!host) continue;

        host.querySelectorAll('tbody tr[onclick]').forEach((row) => {
          const id = extractOrganizationId(row);
          const org = id ? map.get(String(id)) : null;
          const cell = row.children?.[2];
          if (!org?.human_suspended_at || !cell) return;

          cell.innerHTML = `<span class="pill off">Suspendida manualmente</span><br><span class="muted">desde ${esc(formatDateTime(org.human_suspended_at))}</span>`;
        });
      }
    } catch (error) {
      console.warn('TAYULABS human access rows:', error);
    }
  }

  function scheduleEnhance() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      enhanceSubscriptionTab();
      refreshOrganizationRows();
    }, 180);
  }

  function installObservers() {
    const tab = document.getElementById('tab-subscription');
    if (tab && tab.dataset.humanAccessObserver !== '1') {
      tab.dataset.humanAccessObserver = '1';
      const observer = new MutationObserver(scheduleEnhance);
      observer.observe(tab, { childList: true, subtree: true });
    }

    for (const id of ['organizationsHost', 'overviewOrganizations']) {
      const host = document.getElementById(id);
      if (!host || host.dataset.humanAccessObserver === '1') continue;
      host.dataset.humanAccessObserver = '1';
      const observer = new MutationObserver(scheduleEnhance);
      observer.observe(host, { childList: true, subtree: true });
    }
  }

  function boot() {
    injectStyles();
    installObservers();
    setTimeout(async () => {
      try {
        await loadOrganizations();
        await enhanceSubscriptionTab();
        await refreshOrganizationRows();
      } catch (error) {
        console.warn('TAYULABS human access boot:', error);
      }
    }, 900);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
