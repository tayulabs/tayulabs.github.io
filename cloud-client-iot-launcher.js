(() => {
  'use strict';

  const CONFIGURATOR_SRC = 'cloud-client-iot-configurator.js?v=20260913-iotcfg1';
  let loadingPromise = null;

  const roleCanConfigure = () => {
    const role = String(window.__tayuClientAccess?.role || document.body?.dataset?.tayuRole || '').toLowerCase();
    return role === 'owner' || role === 'admin';
  };

  function installStyles() {
    if (document.getElementById('tayu-iot-launcher-styles')) return;
    const style = document.createElement('style');
    style.id = 'tayu-iot-launcher-styles';
    style.textContent = `
      #dispositivos .td-iot-footer{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:13px;padding-top:12px;border-top:1px solid var(--border)}
      #dispositivos .td-iot-sector{font-size:11px;color:var(--muted);font-weight:800}
      #dispositivos .td-iot-configure{padding:9px 12px;border-radius:12px;font-size:12px}
      @media(max-width:600px){#dispositivos .td-iot-footer{align-items:stretch;flex-direction:column}#dispositivos .td-iot-configure{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function deviceForKey(deviceKey) {
    return (Array.isArray(window.__tayuRealDevices) ? window.__tayuRealDevices : [])
      .find(device => String(device?.device_key) === String(deviceKey));
  }

  function sectorLabel(value) {
    return ({fincas:'Fincas',camaroneras:'Camaroneras',bananeras:'Bananeras',ganaderia:'Ganadería'})[String(value || '').toLowerCase()] || 'Sin sector';
  }

  function decorateCards() {
    if (!roleCanConfigure()) return;
    installStyles();

    document.querySelectorAll('#tdGrid .td-card').forEach(card => {
      const key = card.querySelector('.td-key')?.textContent?.trim();
      if (!key) return;
      const device = deviceForKey(key);

      let footer = card.querySelector('.td-iot-footer');
      if (!footer) {
        footer = document.createElement('div');
        footer.className = 'td-iot-footer';
        footer.innerHTML = '<span class="td-iot-sector"></span><button type="button" class="btn ghost td-iot-configure">⚙ Configurar IoT</button>';
        card.appendChild(footer);
      }

      const sector = footer.querySelector('.td-iot-sector');
      if (sector) sector.textContent = `Sector: ${sectorLabel(device?.site_sector)}`;
      const button = footer.querySelector('.td-iot-configure');
      if (button) button.dataset.deviceKey = key;
    });
  }

  function loadConfigurator() {
    if (typeof window.tayuOpenIotConfigurator === 'function') return Promise.resolve();
    if (loadingPromise) return loadingPromise;

    loadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CONFIGURATOR_SRC;
      script.async = true;
      script.onload = () => typeof window.tayuOpenIotConfigurator === 'function'
        ? resolve()
        : reject(new Error('El configurador IoT no quedó disponible.'));
      script.onerror = () => reject(new Error('No se pudo cargar el configurador IoT.'));
      document.head.appendChild(script);
    }).catch(error => {
      loadingPromise = null;
      throw error;
    });

    return loadingPromise;
  }

  async function openConfigurator(deviceKey, button) {
    const oldText = button?.textContent || '';
    try {
      if (button) { button.disabled = true; button.textContent = 'Cargando…'; }
      await loadConfigurator();
      await window.tayuOpenIotConfigurator(deviceKey);
    } catch (error) {
      console.error('TAYULABS IoT configurator:', error);
      alert(error.message || 'No se pudo abrir Configurar IoT.');
    } finally {
      if (button) { button.disabled = false; button.textContent = oldText || '⚙ Configurar IoT'; }
    }
  }

  document.addEventListener('click', event => {
    const configButton = event.target?.closest?.('.td-iot-configure');
    if (configButton) {
      event.preventDefault();
      event.stopPropagation();
      openConfigurator(configButton.dataset.deviceKey, configButton);
      return;
    }

    if (event.target?.closest?.('.nav button[data-view="dispositivos"], #tdRefresh')) {
      setTimeout(decorateCards, 80);
      setTimeout(decorateCards, 500);
    }
  }, true);

  window.addEventListener('tayu:client-access-ready', () => setTimeout(decorateCards, 150));
  window.addEventListener('pageshow', () => setTimeout(decorateCards, 150));

  if (!window.__tayuIotLauncherTimer) {
    window.__tayuIotLauncherTimer = setInterval(() => {
      if (document.getElementById('dispositivos')?.classList.contains('active')) decorateCards();
    }, 1500);
  }
})();
