(() => {
  'use strict';

  const LIGHT_ICON = 'imagenes/icons/flotas-color.png';
  const DARK_ICON = 'imagenes/icons/flotas-white.png';

  function injectStyles() {
    if (document.getElementById('tayuFlotasBrandingStyles')) return;

    const style = document.createElement('style');
    style.id = 'tayuFlotasBrandingStyles';
    style.textContent = `
      #gpsGenericNavButton .flotas-nav-icon{
        display:inline-grid;
        place-items:center;
        width:18px;
        height:18px;
        flex:0 0 18px;
      }
      #gpsGenericNavButton .flotas-nav-icon img{
        width:18px;
        height:18px;
        object-fit:contain;
        display:block;
      }
      #gpsGenericNavButton .flotas-icon-white{display:none;}
      body.dark #gpsGenericNavButton .flotas-icon-color{display:none;}
      body.dark #gpsGenericNavButton .flotas-icon-white{display:block;}
    `;
    document.head.appendChild(style);
  }

  function setPageTitle() {
    const view = document.getElementById('gps-generic-view');
    if (!view?.classList.contains('active')) return;

    const title = document.getElementById('pageTitle');
    if (title) title.textContent = 'Flotas';
  }

  function brandNavigation() {
    const button = document.getElementById('gpsGenericNavButton');
    if (!button) return false;

    if (button.dataset.tayuFlotasBranding !== '1') {
      button.innerHTML = `
        <span class="nav-icon flotas-nav-icon" aria-hidden="true">
          <img class="flotas-icon-color" src="${LIGHT_ICON}" alt="">
          <img class="flotas-icon-white" src="${DARK_ICON}" alt="">
        </span>
        <span class="nav-label">Flotas</span>
      `;
      button.dataset.tayuFlotasBranding = '1';
      button.addEventListener('click', () => setTimeout(setPageTitle, 0));
    }

    return true;
  }

  function brandView() {
    const view = document.getElementById('gps-generic-view');
    if (!view) return false;

    const heading = [...view.querySelectorAll('h3')]
      .find((item) => item.textContent.includes('GPS Genérico'));

    if (heading) {
      heading.textContent = 'Gestión de Flotas Vehiculares';
      const hint = heading.parentElement?.querySelector('.hint');
      if (hint) {
        hint.textContent = 'Monitoreo GPS de vehículos y activos con ubicación actual, recorridos, geocercas y alertas.';
      }
    }

    return true;
  }

  function applyBranding() {
    injectStyles();
    const navReady = brandNavigation();
    const viewReady = brandView();
    setPageTitle();
    return navReady && viewReady;
  }

  function boot() {
    if (applyBranding()) return;

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (applyBranding() || attempts >= 100) clearInterval(timer);
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
