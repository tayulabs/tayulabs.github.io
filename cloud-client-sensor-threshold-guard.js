/* TAYULABS Cloud - Proteccion de edicion para umbrales de sensores.
 * Evita que el refresco de telemetria destruya el input Minimo/Maximo mientras el usuario escribe.
 */
(() => {
  'use strict';

  const INPUT_SELECTOR = '#sensorTable [data-sensor-threshold]';
  let draft = null;
  let editing = false;
  let tableObserver = null;
  let guardTimer = null;
  let observerTable = null;

  function isThresholdInput(element){
    return Boolean(element && typeof element.matches === 'function' && element.matches(INPUT_SELECTOR));
  }

  function snapshot(input){
    if(!isThresholdInput(input)) return null;
    draft = {
      sensorId: String(input.dataset.sensorId || ''),
      threshold: String(input.dataset.sensorThreshold || ''),
      value: String(input.value ?? '')
    };
    return draft;
  }

  function findDraftInput(){
    if(!draft) return null;
    const table = document.getElementById('sensorTable');
    if(!table) return null;
    return [...table.querySelectorAll('[data-sensor-threshold][data-sensor-id]')].find(input =>
      String(input.dataset.sensorId || '') === draft.sensorId &&
      String(input.dataset.sensorThreshold || '') === draft.threshold
    ) || null;
  }

  function restoreDraft(){
    if(!editing || !draft) return false;
    const input = findDraftInput();
    if(!input) return false;

    if(String(input.value ?? '') !== draft.value){
      input.value = draft.value;
    }

    if(document.activeElement !== input){
      try{ input.focus({preventScroll:true}); }
      catch(_){ try{ input.focus(); }catch(__){} }
    }
    return true;
  }

  function attachObserver(){
    const table = document.getElementById('sensorTable');
    if(!table){
      setTimeout(attachObserver,300);
      return;
    }
    if(observerTable === table && tableObserver) return;

    try{ tableObserver?.disconnect(); }catch(_){}
    observerTable = table;
    tableObserver = new MutationObserver(() => {
      if(editing && draft) queueMicrotask(restoreDraft);
    });
    tableObserver.observe(table,{childList:true,subtree:true});
  }

  document.addEventListener('focusin', event => {
    if(!isThresholdInput(event.target)) return;
    editing = true;
    snapshot(event.target);
  }, true);

  document.addEventListener('input', event => {
    if(!isThresholdInput(event.target)) return;
    editing = true;
    snapshot(event.target);
  }, true);

  document.addEventListener('change', event => {
    if(!isThresholdInput(event.target)) return;
    snapshot(event.target);
  }, true);

  document.addEventListener('focusout', event => {
    const input = event.target;
    if(!isThresholdInput(input)) return;
    const leavingDraft = draft ? {...draft} : null;

    setTimeout(() => {
      if(!leavingDraft || !draft) return;
      if(draft.sensorId !== leavingDraft.sensorId || draft.threshold !== leavingDraft.threshold) return;

      const active = document.activeElement;
      if(isThresholdInput(active)){
        editing = true;
        snapshot(active);
        return;
      }

      /* Si el input fue eliminado por innerHTML durante el refresh, no fue un blur voluntario. */
      if(!input.isConnected){
        editing = true;
        restoreDraft();
        return;
      }

      /* Blur real del usuario: deja que el evento change guarde el valor en la API. */
      editing = false;
      setTimeout(() => {
        if(!editing && draft &&
           draft.sensorId === leavingDraft.sensorId &&
           draft.threshold === leavingDraft.threshold){
          draft = null;
        }
      },1800);
    },0);
  }, true);

  /* Respaldo ante refrescos muy rapidos o scripts que reconstruyan la tabla varias veces. */
  clearInterval(guardTimer);
  guardTimer = setInterval(() => {
    attachObserver();
    if(editing && draft) restoreDraft();
  },120);

  attachObserver();
})();
