(() => {
  'use strict';

  const API_ORIGIN = 'https://api.tayulabs.com';
  const API_TIMEOUT_MS = 15000;

  let modalBusy = false;
  let openingOrganization = false;
  let installed = false;

  function injectStyles() {
    if (document.getElementById('tayuAdminStabilityStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuAdminStabilityStyles';
    style.textContent = `
      #organizationModal.tayu-admin-busy .tabs button,
      #organizationModal.tayu-admin-busy .close,
      #organizationModal.tayu-admin-busy .form-actions button,
      #organizationModal.tayu-admin-opening .tabs button,
      #organizationModal.tayu-admin-opening .close {
        pointer-events: none !important;
        opacity: .58 !important;
      }
      #organizationModal.tayu-admin-busy .modal-card,
      #organizationModal.tayu-admin-opening .modal-card {
        cursor: progress;
      }
    `;
    document.head.appendChild(style);
  }

  function installApiTimeout() {
    if (window.__tayuAdminFetchTimeoutInstalled) return;
    window.__tayuAdminFetchTimeoutInstalled = true;

    const nativeFetch = window.fetch.bind(window);

    window.fetch = async function tayuAdminFetch(resource, init = {}) {
      let url = '';
      try {
        url = typeof resource === 'string' ? resource : (resource?.url || '');
      } catch (_) {}

      const isAdminApi = url.startsWith(API_ORIGIN);
      if (!isAdminApi || init?.signal) {
        return nativeFetch(resource, init);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      try {
        return await nativeFetch(resource, { ...init, signal: controller.signal });
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error('La API tardó demasiado en responder. Intenta nuevamente.');
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    };
  }

  function setModalBusy(value, mode = 'save') {
    modalBusy = Boolean(value);
    const modal = document.getElementById('organizationModal');
    if (!modal) return;
    modal.classList.toggle('tayu-admin-busy', modalBusy && mode === 'save');
    modal.classList.toggle('tayu-admin-opening', modalBusy && mode === 'open');
  }

  function wrapAsyncAction(name) {
    const original = window[name];
    if (typeof original !== 'function' || original.__tayuStabilityWrapped) return false;

    const wrapped = async function (...args) {
      if (modalBusy || openingOrganization) return;
      setModalBusy(true, 'save');
      try {
        return await original.apply(this, args);
      } finally {
        setModalBusy(false, 'save');
      }
    };

    wrapped.__tayuStabilityWrapped = true;
    window[name] = wrapped;
    return true;
  }

  function wrapOpenOrganization() {
    const original = window.openOrganization;
    if (typeof original !== 'function' || original.__tayuStabilityWrapped) return false;

    const wrapped = async function (id) {
      if (openingOrganization || modalBusy) return;
      openingOrganization = true;
      setModalBusy(true, 'open');

      try {
        await original.call(this, id);
      } finally {
        const title = document.getElementById('orgModalTitle');
        const errorBox = document.getElementById('orgError');
        if (title?.textContent?.trim() === 'Cargando…') {
          title.textContent = 'No se pudo cargar la empresa';
          if (errorBox && !errorBox.classList.contains('show')) {
            errorBox.textContent = 'La carga no terminó correctamente. Cierra esta ventana e intenta nuevamente.';
            errorBox.classList.add('show');
          }
        }
        openingOrganization = false;
        setModalBusy(false, 'open');
      }
    };

    wrapped.__tayuStabilityWrapped = true;
    window.openOrganization = wrapped;
    return true;
  }

  function wrapTabs() {
    const original = window.orgTab;
    if (typeof original !== 'function' || original.__tayuStabilityWrapped) return false;

    const wrapped = function (...args) {
      if (modalBusy || openingOrganization) return;
      return original.apply(this, args);
    };

    wrapped.__tayuStabilityWrapped = true;
    window.orgTab = wrapped;
    return true;
  }

  function wrapClose() {
    const original = window.closeOrganizationModal;
    if (typeof original !== 'function' || original.__tayuStabilityWrapped) return false;

    const wrapped = function (...args) {
      if (modalBusy || openingOrganization) return;
      return original.apply(this, args);
    };

    wrapped.__tayuStabilityWrapped = true;
    window.closeOrganizationModal = wrapped;
    return true;
  }

  function installWrappers() {
    injectStyles();

    const results = [
      wrapOpenOrganization(),
      wrapTabs(),
      wrapClose(),
      wrapAsyncAction('saveGeneral'),
      wrapAsyncAction('saveSubscription'),
      wrapAsyncAction('saveModules'),
      wrapAsyncAction('saveSite'),
    ];

    if (results.some(Boolean)) installed = true;
    return installed;
  }

  function boot() {
    installApiTimeout();
    injectStyles();

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      installWrappers();
      if (attempts >= 80 || (
        typeof window.openOrganization === 'function' &&
        window.openOrganization.__tayuStabilityWrapped &&
        typeof window.saveGeneral === 'function' &&
        window.saveGeneral.__tayuStabilityWrapped
      )) {
        clearInterval(timer);
      }
    }, 100);
  }

  boot();
})();
