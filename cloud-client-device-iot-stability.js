(() => {
  'use strict';

  const canConfigure = () => ['owner','admin'].includes(String(
    window.__tayuClientAccess?.role || document.body?.dataset?.tayuRole || ''
  ).toLowerCase());

  const sectorLabel = value => ({
    fincas:'Fincas',
    camaroneras:'Camaroneras',
    bananeras:'Bananeras',
    ganaderia:'Ganadería'
  })[String(value || '').toLowerCase()] || 'Sin sector';

  function decorate() {
    if (!canConfigure()) return;
    const devices = Array.isArray(window.__tayuRealDevices) ? window.__tayuRealDevices : [];
    document.querySelectorAll('#tdGrid .td-card').forEach(card => {
      const key = card.querySelector('.td-key')?.textContent?.trim();
      if (!key) return;
      const device = devices.find(row => String(row.device_key) === key);
      let footer = card.querySelector('.td-iot-footer');
      if (!footer) {
        footer = document.createElement('div');
        footer.className = 'td-iot-footer';
        footer.innerHTML = '<span class="td-iot-sector"></span><button type="button" class="btn ghost td-iot-configure">⚙ Configurar IoT</button>';
        card.appendChild(footer);
      }
      const sector = footer.querySelector('.td-iot-sector');
      const button = footer.querySelector('.td-iot-configure');
      if (sector) sector.textContent = `Sector: ${sectorLabel(device?.site_sector)}`;
      if (button) button.dataset.deviceKey = key;
    });
    window.__tayuLoRaNetwork?.refresh?.();
  }

  function attachObserver() {
    const grid = document.getElementById('tdGrid');
    if (!grid || grid.dataset.tayuIotStableObserver === '1') return false;
    grid.dataset.tayuIotStableObserver = '1';
    const observer = new MutationObserver(() => queueMicrotask(decorate));
    observer.observe(grid, { childList:true });
    decorate();
    return true;
  }

  function boot() {
    decorate();
    if (attachObserver()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      decorate();
      if (attachObserver() || attempts >= 30) clearInterval(timer);
    }, 180);
  }

  window.addEventListener('tayu:client-access-ready', () => setTimeout(boot, 0));
  document.addEventListener('click', event => {
    if (event.target?.closest?.('.nav button[data-view="dispositivos"], #tdRefresh')) {
      setTimeout(boot, 0);
    }
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();

(() => {
  'use strict';
  if(document.getElementById('tayuDevicePresenceLoader'))return;
  const script=document.createElement('script');
  script.id='tayuDevicePresenceLoader';
  script.src='cloud-client-device-presence.js?v=20260915-presence1';
  script.async=false;
  document.head.appendChild(script);
})();

(() => {
  'use strict';
  if(document.getElementById('tayuLoRaNetworkLoader'))return;
  const script=document.createElement('script');
  script.id='tayuLoRaNetworkLoader';
  script.src='cloud-client-lora-network.js?v=20260915-lora1';
  script.async=false;
  document.head.appendChild(script);
})();
