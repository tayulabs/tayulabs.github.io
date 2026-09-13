(() => {
  'use strict';

  function refreshDevices() {
    const button = document.getElementById('tdRefresh');
    if (button && !button.disabled) button.click();
  }

  function refreshAdmin() {
    const button = document.getElementById('tcaRefreshBtn');
    if (button && !button.disabled) button.click();
  }

  function syncActiveView() {
    if (document.getElementById('dispositivos')?.classList.contains('active')) {
      refreshDevices();
    }

    const adminButton = document.getElementById('clientAdminNavButton');
    if (adminButton?.classList.contains('active')) {
      refreshAdmin();
    }
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('.nav button');
    if (!button) return;

    if (button.dataset.view === 'dispositivos') {
      setTimeout(refreshDevices, 0);
    } else if (button.id === 'clientAdminNavButton') {
      setTimeout(refreshAdmin, 0);
    }
  }, true);

  window.addEventListener('tayu:client-access-ready', () => setTimeout(syncActiveView, 100));
  window.addEventListener('pageshow', () => setTimeout(syncActiveView, 100));
})();