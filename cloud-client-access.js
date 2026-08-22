(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const READ_ONLY_ROLE = 'viewer';

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

  function applyAccess(access) {
    const role = String(access?.role || '').trim().toLowerCase();

    window.__tayuClientAccess = access || null;
    document.documentElement.dataset.tayuRole = role;
    if (document.body) document.body.dataset.tayuRole = role;

    installRoleStyles();

    if (role === READ_ONLY_ROLE) {
      hardenViewerActions();
    }

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

    const response = await fetch(`${API_URL}/me`, {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${keycloak.token}`
      }
    });

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
