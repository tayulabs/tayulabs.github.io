(() => {
  'use strict';

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installVisibilityRule, { once: true });
  } else {
    installVisibilityRule();
  }
})();
