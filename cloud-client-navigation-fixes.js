(() => {
  'use strict';

  let fleetPinned = false;
  let restoringFleet = false;
  let fleetMapExploring = false;

  function injectStyles() {
    if (document.getElementById('tayuNavigationFixStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuNavigationFixStyles';
    style.textContent = `
      .sidebar{
        display:flex;
        flex-direction:column;
        overflow:visible;
      }
      .sidebar .brand{
        flex:0 0 auto;
      }
      .sidebar .nav{
        flex:1 1 auto;
        min-height:0;
        overflow-y:auto;
        overflow-x:hidden;
        overscroll-behavior:contain;
        -webkit-overflow-scrolling:touch;
        scrollbar-width:none;
        -ms-overflow-style:none;
      }
      .sidebar .nav::-webkit-scrollbar{
        width:0;
        height:0;
        display:none;
      }
    `;
    document.head.appendChild(style);
  }

  function navButton(view) {
    return document.querySelector(`.nav button[data-view="${view}"]`);
  }

  function reorderNavigation() {
    const nav = document.querySelector('.nav');
    const fleet = document.getElementById('gpsGenericNavButton');
    if (!nav || !fleet) return false;

    // Orden solicitado:
    // Dashboard → Alarmas → Fincas → Camaroneras → Bananeras → Ganadería →
    // Flotas → Sensores → Dispositivos → Tramas → Equipos Modbus → Configuración.
    const order = [
      navButton('dashboard'),
      navButton('alarmas'),
      navButton('fincas'),
      navButton('camaroneras'),
      navButton('bananeras'),
      navButton('ganaderia'),
      fleet,
      navButton('sensores'),
      navButton('dispositivos'),
      navButton('tramas'),
      navButton('modbus'),
      navButton('configuracion')
    ].filter(Boolean);

    order.forEach(button => nav.appendChild(button));
    return true;
  }

  function restoreFleetView() {
    if (!fleetPinned || restoringFleet) return;
    const fleetView = document.getElementById('gps-generic-view');
    const fleetButton = document.getElementById('gpsGenericNavButton');
    if (!fleetView || !fleetButton) return;

    restoringFleet = true;
    try {
      document.querySelectorAll('.view.active').forEach(view => {
        if (view !== fleetView) view.classList.remove('active');
      });
      document.querySelectorAll('.nav button.active').forEach(button => {
        if (button !== fleetButton) button.classList.remove('active');
      });
      fleetView.classList.add('active');
      fleetButton.classList.add('active');
      const title = document.getElementById('pageTitle');
      if (title) title.textContent = 'Flotas';
    } finally {
      restoringFleet = false;
    }
  }

  function watchActiveView() {
    const main = document.querySelector('main.main') || document.body;
    if (!main || main.dataset.tayuFleetViewWatcher === '1') return;
    main.dataset.tayuFleetViewWatcher = '1';

    const observer = new MutationObserver(() => {
      if (!fleetPinned || restoringFleet) return;
      const fleetView = document.getElementById('gps-generic-view');
      if (!fleetView?.classList.contains('active')) {
        queueMicrotask(restoreFleetView);
      }
    });
    observer.observe(main, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  function currentFleetGpsPosition() {
    const text = document.querySelector('#gpsCurrentLocation b')?.textContent || '';
    const match = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  function samePoint(a, b, tolerance = 0.00002) {
    return Boolean(
      a && b &&
      Math.abs(Number(a.lat) - Number(b.lat)) <= tolerance &&
      Math.abs(Number(a.lng) - Number(b.lng)) <= tolerance
    );
  }

  function patchLeafletFleetMap() {
    if (!window.L?.Map?.prototype) return false;
    const proto = window.L.Map.prototype;
    if (proto.__tayuFleetNavigationPatchedV2) return true;

    const originalSetView = proto.setView;
    proto.setView = function(center, zoom, options) {
      const isFleetMap = this.getContainer?.()?.id === 'gpsGenericMap';

      if (isFleetMap && fleetMapExploring) {
        let requested = null;
        try {
          requested = window.L.latLng(center);
        } catch (_) {}

        const gps = currentFleetGpsPosition();
        const noExplicitOptions = options === undefined || options === null;
        const isAutomaticGpsCenter = noExplicitOptions && Number(zoom) === 16 && samePoint(requested, gps);
        const ecuadorCenter = { lat: -1.8312, lng: -78.1834 };
        const isAutomaticFallback = noExplicitOptions && Number(zoom) === 6 && samePoint(requested, ecuadorCenter, 0.0002);

        // Solo bloqueamos el recentrado automático del módulo GPS.
        // Los controles +/-, rueda del mouse, pinch y zoom del usuario siguen funcionando.
        if (isAutomaticGpsCenter || isAutomaticFallback) {
          return this;
        }
      }

      return originalSetView.call(this, center, zoom, options);
    };

    proto.__tayuFleetNavigationPatchedV2 = true;
    return true;
  }

  function markFleetMapExploringAfterInteraction(event) {
    if (!event.target?.closest?.('#gpsGenericMap')) return;
    setTimeout(() => {
      fleetMapExploring = true;
    }, 0);
  }

  function installInteractionGuards() {
    if (document.documentElement.dataset.tayuFleetInteractionGuardsV2 === '1') return;
    document.documentElement.dataset.tayuFleetInteractionGuardsV2 = '1';

    document.addEventListener('click', event => {
      const nav = event.target?.closest?.('.nav button');
      if (nav) {
        fleetPinned = nav.id === 'gpsGenericNavButton';
        if (fleetPinned) {
          fleetMapExploring = false;
          setTimeout(() => {
            reorderNavigation();
            restoreFleetView();
          }, 0);
        }
      }

      if (event.target?.closest?.('#gpsCurrentOnlyButton, #gpsHistoryButton')) {
        fleetMapExploring = false;
      }
    }, true);

    document.addEventListener('change', event => {
      if (event.target?.id === 'gpsGenericDeviceSelect') {
        fleetMapExploring = false;
      }
    }, true);

    document.addEventListener('pointerdown', markFleetMapExploringAfterInteraction, true);
    document.addEventListener('touchstart', markFleetMapExploringAfterInteraction, { capture: true, passive: true });
    document.addEventListener('wheel', markFleetMapExploringAfterInteraction, { capture: true, passive: true });
  }

  function boot() {
    injectStyles();
    installInteractionGuards();
    watchActiveView();

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const navReady = reorderNavigation();
      const leafletReady = patchLeafletFleetMap();
      if ((navReady && leafletReady) || attempts >= 120) clearInterval(timer);
    }, 100);

    fleetPinned = Boolean(document.getElementById('gps-generic-view')?.classList.contains('active'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
