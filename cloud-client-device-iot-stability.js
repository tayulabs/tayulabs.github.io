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

  function optimizeTelemetryRefresh(){
    if(window.__tayuTelemetryPerformanceApplied)return;
    const select=document.getElementById('realtimeRefreshInterval');
    const current=Number(select?.value||0);
    if(!select || !current || typeof window.saveGeneralSettings!=='function')return;

    // Conserva 1 s si el usuario ya lo tenía. Si estaba en 5/10 s, usa 2 s:
    // suficientemente rápido para telemetría en vivo sin forzar históricos y
    // gráficas pesadas a trabajar cada segundo.
    if(current>2000){
      window.__tayuTelemetryPerformanceApplied=true;
      select.value='2000';
      Promise.resolve(window.saveGeneralSettings()).catch(error=>{
        window.__tayuTelemetryPerformanceApplied=false;
        console.warn('No se pudo optimizar el refresco de telemetría:',error);
      });
    }else{
      window.__tayuTelemetryPerformanceApplied=true;
    }
  }

  function scheduleTelemetryOptimization(){
    [600,1600,3500].forEach(delay=>setTimeout(optimizeTelemetryRefresh,delay));
  }

  function boot() {
    decorate();
    if (attachObserver()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (attachObserver() || attempts >= 24) {
        clearInterval(timer);
        return;
      }
      if (attempts % 4 === 0) decorate();
    }, 250);
  }

  window.addEventListener('tayu:client-access-ready', () => {
    setTimeout(boot, 0);
    scheduleTelemetryOptimization();
  });

  document.addEventListener('click', event => {
    if (event.target?.closest?.('.nav button[data-view="dispositivos"], #tdRefresh')) {
      setTimeout(boot, 0);
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      boot();
      scheduleTelemetryOptimization();
    }, {once:true});
  } else {
    boot();
    scheduleTelemetryOptimization();
  }
})();