(() => {
  'use strict';

  const STYLE_ID = 'tayuMobileAccessSyncStyles';

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width:960px){
        .sidebar .nav button[hidden],
        .sidebar .nav button[data-tayu-module-allowed="0"]{
          display:none!important;
        }

        .sidebar .nav button[data-tayu-module-allowed="1"]{
          display:flex!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function enforce() {
    if (window.innerWidth > 960) return;
    document.querySelectorAll('.sidebar .nav button[data-tayu-module-allowed]').forEach(button => {
      const allowed = button.dataset.tayuModuleAllowed === '1';
      button.hidden = !allowed;
    });
  }

  function activate() {
    installStyles();
    enforce();

    window.addEventListener('tayu:modules-applied', () => {
      enforce();
      requestAnimationFrame(enforce);
    });

    const nav = document.querySelector('.sidebar .nav');
    if (nav) {
      const observer = new MutationObserver(enforce);
      observer.observe(nav, { subtree:true, childList:true, attributes:true, attributeFilter:['hidden','style','data-tayu-module-allowed'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', activate, { once:true });
  } else {
    activate();
  }
})();
