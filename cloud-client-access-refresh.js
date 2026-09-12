(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const MIN_CHECK_INTERVAL_MS = 15000;
  let baseline = null;
  let lastCheckAt = 0;
  let checking = false;

  function signature(access) {
    const modules = (Array.isArray(access?.modules) ? access.modules : [])
      .map(row => [String(row?.module || '').trim().toLowerCase(), Boolean(row?.enabled)])
      .filter(([name]) => name)
      .sort((a,b) => a[0].localeCompare(b[0]));

    return JSON.stringify({
      organization_id: access?.organization_id || null,
      role: String(access?.role || '').toLowerCase(),
      modules,
    });
  }

  async function fetchAccess() {
    const keycloak = window.__tayuEntryKeycloak;
    if (!keycloak?.authenticated) return null;
    try { await keycloak.updateToken(30); } catch (_) {}

    const response = await fetch(`${API_URL}/me`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${keycloak.token}` }
    });
    if (!response.ok) throw new Error(`GET /me failed (${response.status})`);
    return response.json();
  }

  async function checkForChanges(force = false) {
    if (checking || !baseline) return;
    const now = Date.now();
    if (!force && now - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;

    checking = true;
    lastCheckAt = now;
    try {
      const current = await fetchAccess();
      if (!current) return;
      if (signature(current) !== baseline) {
        window.location.reload();
      }
    } catch (error) {
      console.warn('TAYULABS access refresh:', error);
    } finally {
      checking = false;
    }
  }

  window.addEventListener('tayu:client-access-ready', event => {
    baseline = signature(event.detail || window.__tayuClientAccess || null);
    lastCheckAt = Date.now();
  });

  window.addEventListener('focus', () => checkForChanges());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForChanges();
  });
})();
