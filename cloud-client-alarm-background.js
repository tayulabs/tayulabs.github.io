(() => {
  'use strict';

  let timer = null;
  let running = false;

  function alarmAllowed(){
    return typeof window.__tayuModuleEnabled === 'function'
      ? window.__tayuModuleEnabled('alarmas')
      : true;
  }

  function refreshMs(){
    const configured = Number(document.getElementById('realtimeRefreshInterval')?.value || 5000);
    if(!Number.isFinite(configured)) return 5000;
    return Math.min(10000, Math.max(2000, configured));
  }

  async function refreshAlarms(){
    if(running || !alarmAllowed()) return;
    const load = window.tayuLoadAlarmEvents;
    if(typeof load !== 'function') return;

    running = true;
    try{
      // La fuente de verdad de la campana son los eventos del VPS. Esto debe
      // actualizarse independientemente de la vista que tenga abierta el usuario.
      await load();
    }catch(error){
      console.warn('TAYULABS alarm background sync:', error);
    }finally{
      running = false;
    }
  }

  function schedule(){
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await refreshAlarms();
      schedule();
    }, refreshMs());
  }

  function start(){
    clearTimeout(timer);
    refreshAlarms();
    schedule();
  }

  document.addEventListener('change', event => {
    if(event.target?.id === 'realtimeRefreshInterval') start();
  });

  document.addEventListener('visibilitychange', () => {
    if(!document.hidden) refreshAlarms();
  });

  window.addEventListener('pageshow', refreshAlarms);
  window.addEventListener('tayu:client-access-ready', start);
  window.addEventListener('tayu:modules-applied', refreshAlarms);

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
