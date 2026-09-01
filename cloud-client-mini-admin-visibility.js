(() => {
  'use strict';

  const isManager = () => {
    const role = String(
      window.__tayuClientAccess?.role ||
      document.body?.dataset?.tayuRole ||
      ''
    ).toLowerCase();
    return role === 'owner' || role === 'admin';
  };

  function installVisibilityRule() {
    if (document.getElementById('tayu-mini-admin-visibility-rule')) return;

    const style = document.createElement('style');
    style.id = 'tayu-mini-admin-visibility-rule';
    style.textContent = `
      body[data-tayu-role="owner"] #clientAdminNavButton,
      body[data-tayu-role="admin"] #clientAdminNavButton {
        display: flex !important;
      }
    `;
    document.head.appendChild(style);
  }

  function detachMiniAdminFromModulePermissions() {
    if (!isManager()) return false;

    const button = document.getElementById('clientAdminNavButton');
    const section = document.getElementById('client-admin');
    if (!button || !section) return false;

    // La administración depende del rol seguro owner/admin, no de los
    // módulos habilitados de la organización. Si conserva data-view,
    // applyModulePermissions() del cliente la oculta por no ser un módulo.
    button.removeAttribute('data-view');
    button.style.removeProperty('display');
    section.style.removeProperty('display');

    return true;
  }

  function normalize() {
    installVisibilityRule();
    return detachMiniAdminFromModulePermissions();
  }

  window.addEventListener('tayu:client-access-ready', () => {
    normalize();
    queueMicrotask(normalize);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', normalize, { once: true });
  } else {
    normalize();
  }

  if (!normalize()) {
    const observer = new MutationObserver(() => {
      if (normalize()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
