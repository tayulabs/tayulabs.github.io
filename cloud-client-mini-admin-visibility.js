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
        display: none !important;
      }

      #client-admin.tca-standalone-view.active {
        display: block !important;
      }
    `;
    document.head.appendChild(style);
  }

  function hideAdmin(section, button) {
    if (!section || !button) return;
    section.classList.remove('active');
    section.style.removeProperty('display');
    button.classList.remove('active');
  }

  function installNavigationBridge(section, button) {
    const nav = document.querySelector('.sidebar .nav');
    if (!nav || nav.dataset.tcaStandaloneBridge === '2') return;

    nav.dataset.tcaStandaloneBridge = '2';

    // Captura global: se ejecuta antes de cualquier guard que pueda detener
    // la propagación del clic en la navegación de escritorio.
    document.addEventListener('click', event => {
      const target = event.target?.closest?.('.sidebar .nav button');
      if (!target || target === button) return;
      hideAdmin(section, button);
    }, true);

    // Respaldo para navegación programática o cambios de estado realizados
    // por otros addons. Si otra pestaña queda activa, Administración se cierra.
    const sync = () => {
      const activeNav = nav.querySelector('button.active');
      const regularViewActive = document.querySelector('main.main .view.active');
      if ((activeNav && activeNav !== button) || regularViewActive) {
        hideAdmin(section, button);
      }
    };

    const navObserver = new MutationObserver(sync);
    navObserver.observe(nav, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });

    const main = document.querySelector('main.main');
    if (main) {
      const viewObserver = new MutationObserver(sync);
      viewObserver.observe(main, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
      });
    }
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
    // redirija a Dashboard, pero controlamos su visibilidad de forma estricta.
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
