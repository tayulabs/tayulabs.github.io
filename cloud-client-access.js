(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const READ_ONLY_ROLE = 'viewer';

  const MODULE_UI = {
    dashboard: { button: '.nav button[data-view="dashboard"]', view: '#dashboard' },
    alarmas: { button: '.nav button[data-view="alarmas"]', view: '#alarmas' },
    fincas: { button: '.nav button[data-view="fincas"]', view: '#fincas' },
    camaroneras: { button: '.nav button[data-view="camaroneras"]', view: '#camaroneras' },
    bananeras: { button: '.nav button[data-view="bananeras"]', view: '#bananeras' },
    ganaderia: { button: '.nav button[data-view="ganaderia"]', view: '#ganaderia' },
    flotas: { button: '#gpsGenericNavButton', view: '#gps-generic-view' },
    sensores: { button: '.nav button[data-view="sensores"]', view: '#sensores' },
    dispositivos: { button: '.nav button[data-view="dispositivos"]', view: '#dispositivos' },
    tramas: { button: '.nav button[data-view="tramas"]', view: '#tramas' },
    modbus: { button: '.nav button[data-view="modbus"]', view: '#modbus' },
    notifications: { button: '.nav button[data-view="notifications"]', view: '#notifications' },
    configuracion: { button: '.nav button[data-view="configuracion"]', view: '#configuracion' },
  };

  const SECTOR_KEYS = new Set(['fincas', 'camaroneras', 'bananeras', 'ganaderia']);

  let moduleMap = new Map();
  let hasModulePolicy = false;
  let visibilityTimer = null;
  let visibilityObserver = null;
  let visibilityQueued = false;
  let applyingVisibility = false;

  function installRoleStyles() {
    if (document.getElementById('tayu-client-role-styles')) return;

    const style = document.createElement('style');
    style.id = 'tayu-client-role-styles';
    style.textContent = `
      body[data-tayu-role="viewer"] #dispositivos .module-header button[onclick*="openAssetModal"],
      body[data-tayu-role="viewer"] #dispositivos .asset-actions,
      body[data-tayu-role="viewer"] #assetModal {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function denyViewerAction() {
    alert('Tu rol Viewer es de solo lectura.');
    return false;
  }

  function hardenViewerActions() {
    [
      'openAssetModal',
      'saveAssetFromModal',
      'deleteAsset',
      'duplicateAsset'
    ].forEach(name => {
      if (typeof window[name] === 'function') {
        window[name] = denyViewerAction;
      }
    });
  }

  function buildModuleMap(modules) {
    const rows = Array.isArray(modules) ? modules : [];
    moduleMap = new Map();

    rows.forEach((row) => {
      const key = String(row?.module || '').trim().toLowerCase();
      if (!key) return;
      moduleMap.set(key, Boolean(row?.enabled));
    });

    // Compatibilidad: organizaciones antiguas sin filas de módulos
    // conservan la experiencia completa hasta que Super Admin las configure.
    hasModulePolicy = moduleMap.size > 0;
  }

  function isModuleEnabled(key) {
    const normalized = String(key || '').trim().toLowerCase();
    if (!normalized) return false;

    if (normalized === 'notifications') {
      const role = String(window.__tayuClientAccess?.role || '').trim().toLowerCase();
      return role === 'owner' || role === 'admin';
    }

    if (!hasModulePolicy) return true;

    if (moduleMap.has(normalized)) {
      return moduleMap.get(normalized) === true;
    }

    if (normalized.endsWith('.iot')) {
      const parent = normalized.slice(0, -4);
      // En configuraciones antiguas, habilitar el sector equivalía al IoT existente.
      return moduleMap.get(parent) === true;
    }

    if (normalized.endsWith('.erp')) {
      // ERP es una capacidad nueva: si no existe explícitamente, se considera desactivada.
      return false;
    }

    if (SECTOR_KEYS.has(normalized)) {
      return moduleMap.get(`${normalized}.iot`) === true || moduleMap.get(`${normalized}.erp`) === true;
    }

    return false;
  }

  function setElementModuleVisibility(element, enabled) {
    if (!element) return;
    const display = enabled ? '' : 'none';
    if (element.hidden === enabled) element.hidden = !enabled;
    if (element.style.display !== display) element.style.display = display;
    element.dataset.tayuModuleAllowed = enabled ? '1' : '0';
  }

  function firstEnabledModuleButton() {
    for (const [key, ui] of Object.entries(MODULE_UI)) {
      if (!isModuleEnabled(key)) continue;
      const button = document.querySelector(ui.button);
      if (button && !button.hidden && button.style.display !== 'none') return button;
    }
    return null;
  }

  function applyModuleVisibility() {
    if (!hasModulePolicy || applyingVisibility) return;
    applyingVisibility = true;

    try {
      let activeViewWasBlocked = false;

      for (const [key, ui] of Object.entries(MODULE_UI)) {
        const enabled = isModuleEnabled(key);
        const button = document.querySelector(ui.button);
        const view = document.querySelector(ui.view);

        setElementModuleVisibility(button, enabled);
        setElementModuleVisibility(view, enabled);

        if (!enabled && (button?.classList.contains('active') || view?.classList.contains('active'))) {
          button?.classList.remove('active');
          view?.classList.remove('active');
          activeViewWasBlocked = true;
        }
      }

      if (activeViewWasBlocked) {
        const fallback = firstEnabledModuleButton();
        if (fallback) setTimeout(() => fallback.click(), 0);
      }
    } finally {
      applyingVisibility = false;
    }
  }

  function queueModuleVisibility() {
    if (visibilityQueued || !hasModulePolicy) return;
    visibilityQueued = true;
    queueMicrotask(() => {
      visibilityQueued = false;
      applyModuleVisibility();
    });
  }

  function installModuleVisibilityObserver() {
    if (visibilityObserver || !document.body) return;

    visibilityObserver = new MutationObserver((mutations) => {
      if (applyingVisibility || !hasModulePolicy) return;

      const relevant = mutations.some((mutation) => {
        if (mutation.type === 'childList') return mutation.addedNodes.length > 0;
        if (mutation.type !== 'attributes') return false;

        const target = mutation.target;
        return Boolean(
          target?.id === 'gpsGenericNavButton' ||
          target?.id === 'gps-generic-view' ||
          target?.matches?.('.nav button[data-view]')
        );
      });

      if (relevant) queueModuleVisibility();
    });

    visibilityObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'hidden', 'class'],
    });
  }

  function installModuleClickGuard() {
    if (document.documentElement.dataset.tayuModuleClickGuard === '1') return;
    document.documentElement.dataset.tayuModuleClickGuard = '1';

    document.addEventListener('click', (event) => {
      if (!hasModulePolicy) return;

      const button = event.target?.closest?.('.nav button');
      if (!button) return;

      let key = null;
      if (button.id === 'gpsGenericNavButton') key = 'flotas';
      else key = String(button.dataset.view || '').trim().toLowerCase();

      if (!key || isModuleEnabled(key)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      applyModuleVisibility();
    }, true);
  }

  function scheduleModuleVisibilityRefresh() {
    if (visibilityTimer) clearInterval(visibilityTimer);

    let attempts = 0;
    applyModuleVisibility();

    visibilityTimer = setInterval(() => {
      attempts += 1;
      applyModuleVisibility();
      if (attempts >= 60) {
        clearInterval(visibilityTimer);
        visibilityTimer = null;
      }
    }, 100);
  }

  function exposeModuleAccess() {
    const snapshot = Object.fromEntries(moduleMap.entries());
    window.__tayuModules = snapshot;
    window.__tayuHasModulePolicy = hasModulePolicy;
    window.__tayuModuleEnabled = isModuleEnabled;

    document.documentElement.dataset.tayuModulePolicy = hasModulePolicy ? '1' : '0';
    if (document.body) document.body.dataset.tayuModulePolicy = hasModulePolicy ? '1' : '0';

    window.dispatchEvent(new CustomEvent('tayu:modules-applied', {
      detail: {
        has_policy: hasModulePolicy,
        modules: snapshot,
      }
    }));
  }

  function applyAccess(access) {
    const role = String(access?.role || '').trim().toLowerCase();

    window.__tayuClientAccess = access || null;

    const organizationId = String(access?.organization_id || '').trim();
    if (organizationId) {
      if (typeof window.__tayuSetActiveOrganization === 'function') {
        window.__tayuSetActiveOrganization(organizationId, { reload: false });
      } else {
        window.__tayuActiveOrganizationId = organizationId;
        try {
          window.sessionStorage?.setItem('tayu.activeOrganizationId', organizationId);
        } catch (_) {}
      }
    }

    document.documentElement.dataset.tayuRole = role;
    if (document.body) document.body.dataset.tayuRole = role;

    installRoleStyles();

    if (role === READ_ONLY_ROLE) {
      hardenViewerActions();
    }

    buildModuleMap(access?.modules);
    exposeModuleAccess();
    installModuleVisibilityObserver();
    installModuleClickGuard();
    scheduleModuleVisibilityRefresh();

    window.dispatchEvent(new CustomEvent('tayu:client-access-ready', {
      detail: access || null
    }));
  }

  async function loadAccess() {
    const keycloak = window.__tayuEntryKeycloak;
    if (!keycloak?.authenticated) {
      throw new Error('Authenticated Keycloak session not available');
    }

    try {
      await keycloak.updateToken(30);
    } catch (error) {
      console.warn('TAYULABS access: token refresh skipped', error);
    }

    const requestMe = (useOrganization = true) => fetch(`${API_URL}/me`, {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${keycloak.token}`,
        ...(useOrganization && typeof window.__tayuOrganizationHeaders === 'function'
          ? window.__tayuOrganizationHeaders()
          : {})
      }
    });

    let response = await requestMe(true);

    if (response.status === 403 && Object.keys(
      typeof window.__tayuOrganizationHeaders === 'function'
        ? window.__tayuOrganizationHeaders()
        : {}
    ).length) {
      if (typeof window.__tayuSetActiveOrganization === 'function') {
        window.__tayuSetActiveOrganization(null, { reload: false });
      } else {
        try {
          window.sessionStorage?.removeItem('tayu.activeOrganizationId');
        } catch (_) {}
      }
      response = await requestMe(false);
    }

    if (!response.ok) {
      throw new Error(`GET /me failed (${response.status})`);
    }

    const access = await response.json();
    applyAccess(access);
    return access;
  }

  async function init() {
    try {
      await loadAccess();
    } catch (error) {
      console.error('TAYULABS client access:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
