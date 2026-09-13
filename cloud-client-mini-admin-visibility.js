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

      #client-admin.tca-standalone-view {
        display: none;
      }

      #client-admin.tca-standalone-view.active {
        display: block;
      }
    `;
    document.head.appendChild(style);
  }

  function installNavigationBridge(section, button) {
    const nav = document.querySelector('.sidebar .nav');
    if (!nav || nav.dataset.tcaStandaloneBridge === '1') return;

    nav.dataset.tcaStandaloneBridge = '1';
    nav.addEventListener('click', event => {
      const target = event.target.closest('button');
      if (!target || target === button) return;

      section.classList.remove('active');
      section.style.removeProperty('display');
    });
  }

  function detachMiniAdminFromModulePermissions() {
    if (!isManager()) return false;

    const button = document.getElementById('clientAdminNavButton');
    const section = document.getElementById('client-admin');
    if (!button || !section) return false;

    // Administración no es un módulo operativo de la organización.
    // Debe depender del rol seguro owner/admin y no de applyModulePermissions().
    button.removeAttribute('data-view');
    button.style.removeProperty('display');

    // applyModulePermissions() busca `.view.active` y redirige a Dashboard
    // cuando el id activo no está en organization_modules. Sacamos solamente
    // Administración de esa colección y mantenemos su navegación por separado.
    section.classList.remove('view');
    section.classList.add('tca-standalone-view');
    section.style.removeProperty('display');

    installNavigationBridge(section, button);
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
