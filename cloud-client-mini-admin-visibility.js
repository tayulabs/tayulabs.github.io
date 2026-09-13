(() => {
  'use strict';

  const BODY_OPEN_CLASS = 'tayu-client-admin-visible';

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
        display: none !important;
      }

      body.${BODY_OPEN_CLASS} #client-admin.tca-standalone-view {
        display: block !important;
      }
    `;
    document.head.appendChild(style);
  }

  function syncAdminVisibility(section, button) {
    const open = Boolean(button?.classList.contains('active'));
    document.body.classList.toggle(BODY_OPEN_CLASS, open);

    if (!open && section) {
      section.classList.remove('active');
      section.style.removeProperty('display');
    }
  }

  function installNavigationBridge(section, button) {
    const nav = document.querySelector('.sidebar .nav');
    if (!nav || nav.dataset.tcaStandaloneBridge === '3') return;

    nav.dataset.tcaStandaloneBridge = '3';

    // Captura: corre antes del guard de escritorio que usa stopImmediatePropagation().
    nav.addEventListener('click', event => {
      const target = event.target.closest('button');
      if (!target) return;

      const openingAdmin = target === button;
      document.body.classList.toggle(BODY_OPEN_CLASS, openingAdmin);

      if (!openingAdmin) {
        section.classList.remove('active');
        section.style.removeProperty('display');
      }
    }, true);

    // Respaldo seguro: observa solo la clase del botón de Administración.
    // No observa el main ni la sección, por lo que no puede crear un ciclo.
    const observer = new MutationObserver(() => syncAdminVisibility(section, button));
    observer.observe(button, { attributes:true, attributeFilter:['class'] });

    syncAdminVisibility(section, button);
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

    // La mantenemos fuera de `.view` para que applyModulePermissions() no la
    // redirija a Dashboard. Su visibilidad depende solo del botón Administración.
    section.classList.remove('view');
    section.classList.add('tca-standalone-view');
    section.style.removeProperty('display');

    installNavigationBridge(section, button);
    syncAdminVisibility(section, button);
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
