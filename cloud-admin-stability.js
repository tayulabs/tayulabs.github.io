(() => {
  'use strict';

  const API_ORIGIN = 'https://api.tayulabs.com';
  const API_TIMEOUT_MS = 15000;
  const TOKEN_TIMEOUT_MS = 10000;
  const OPEN_TIMEOUT_MS = 22000;

  let modalBusy = false;
  let openingOrganization = false;
  let tokenRefreshInFlight = null;
  let installed = false;
  let openAttempt = 0;

  const diagnostics = {
    version: '20260822-stability2',
    lastOpenStartedAt: null,
    lastOpenFinishedAt: null,
    lastOpenOrganizationId: null,
    lastError: null,
  };
  window.__tayuAdminStability = diagnostics;

  function timeoutPromise(ms, message) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  function withTimeout(promise, ms, message) {
    return Promise.race([promise, timeoutPromise(ms, message)]);
  }

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

  function installKeycloakGuard() {
    const kc = window.__tayuKeycloak;
    if (!kc || typeof kc.updateToken !== 'function') return false;
    if (kc.updateToken.__tayuStabilityWrapped) return true;

    const originalUpdateToken = kc.updateToken.bind(kc);

    const wrappedUpdateToken = function (minValidity = 5) {
      if (tokenRefreshInFlight) return tokenRefreshInFlight;

      tokenRefreshInFlight = withTimeout(
        Promise.resolve().then(() => originalUpdateToken(minValidity)),
        TOKEN_TIMEOUT_MS,
        'La renovación de la sesión tardó demasiado. Intenta nuevamente.'
      ).finally(() => {
        tokenRefreshInFlight = null;
      });

      return tokenRefreshInFlight;
    };

    wrappedUpdateToken.__tayuStabilityWrapped = true;
    kc.updateToken = wrappedUpdateToken;
    return true;
  }

  function setModalBusy(value, mode = 'save') {
    modalBusy = Boolean(value);
    const modal = document.getElementById('organizationModal');
    if (!modal) return;
    modal.classList.toggle('tayu-admin-busy', modalBusy && mode === 'save');
    modal.classList.toggle('tayu-admin-opening', modalBusy && mode === 'open');
  }

  function showLoadFailure(message) {
    const title = document.getElementById('orgModalTitle');
    const errorBox = document.getElementById('orgError');

    if (title?.textContent?.trim() === 'Cargando…') {
      title.textContent = 'No se pudo cargar la empresa';
    }

    if (errorBox) {
      errorBox.textContent = message || 'La carga no terminó correctamente. Cierra esta ventana e intenta nuevamente.';
      errorBox.classList.add('show');
    }
  }

  function wrapAsyncAction(name) {
    const original = window[name];
    if (typeof original !== 'function' || original.__tayuStabilityWrapped) return false;

    const wrapped = async function (...args) {
      if (modalBusy || openingOrganization) return;
      setModalBusy(true, 'save');
      try {
        return await withTimeout(
          Promise.resolve(original.apply(this, args)),
          OPEN_TIMEOUT_MS,
          'La operación administrativa tardó demasiado. Intenta nuevamente.'
        );
      } catch (error) {
        diagnostics.lastError = error?.message || String(error);
        const errorBox = document.getElementById('orgError');
        if (errorBox) {
          errorBox.textContent = diagnostics.lastError;
          errorBox.classList.add('show');
        }
        console.error('TAYULABS admin action:', name, error);
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

      const attempt = ++openAttempt;
      openingOrganization = true;
      setModalBusy(true, 'open');
      diagnostics.lastOpenStartedAt = new Date().toISOString();
      diagnostics.lastOpenFinishedAt = null;
      diagnostics.lastOpenOrganizationId = id;
      diagnostics.lastError = null;

      try {
        await withTimeout(
          Promise.resolve(original.call(this, id)),
          OPEN_TIMEOUT_MS,
          'La empresa tardó demasiado en cargar. Cierra esta ventana e intenta nuevamente.'
        );
      } catch (error) {
        diagnostics.lastError = error?.message || String(error);
        showLoadFailure(diagnostics.lastError);
        console.error('TAYULABS open organization:', error);
      } finally {
        if (attempt === openAttempt) {
          const title = document.getElementById('orgModalTitle');
          const errorBox = document.getElementById('orgError');
          if (title?.textContent?.trim() === 'Cargando…') {
            title.textContent = 'No se pudo cargar la empresa';
            if (errorBox && !errorBox.classList.contains('show')) {
              errorBox.textContent = 'La carga no terminó correctamente. Cierra esta ventana e intenta nuevamente.';
              errorBox.classList.add('show');
            }
          }
          diagnostics.lastOpenFinishedAt = new Date().toISOString();
          openingOrganization = false;
          setModalBusy(false, 'open');
        }
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
      openAttempt += 1;
      diagnostics.lastOpenOrganizationId = null;
      return original.apply(this, args);
    };

    wrapped.__tayuStabilityWrapped = true;
    window.closeOrganizationModal = wrapped;
    return true;
  }

  function installWrappers() {
    injectStyles();
    installKeycloakGuard();

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
      if (attempts >= 120 || (
        window.__tayuKeycloak?.updateToken?.__tayuStabilityWrapped &&
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
