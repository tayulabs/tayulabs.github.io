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
  let restoringFocus = false;
  let restoredAfterRefresh = false;
  let lastChangeKey = '';
  let lastChangeAt = 0;

  function isThresholdInput(element){
    return Boolean(element && typeof element.matches === 'function' && element.matches(INPUT_SELECTOR));
  }

  function inputKey(input){
    if(!isThresholdInput(input)) return '';
    return `${String(input.dataset.sensorId || '')}::${String(input.dataset.sensorThreshold || '')}`;
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

  function draftKey(){
    return draft ? `${draft.sensorId}::${draft.threshold}` : '';
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
      restoredAfterRefresh = true;
      restoringFocus = true;
      try{ input.focus({preventScroll:true}); }
      catch(_){ try{ input.focus(); }catch(__){} }
      restoringFocus = false;
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
    if(!restoringFocus) restoredAfterRefresh = false;
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
    lastChangeKey = inputKey(event.target);
    lastChangeAt = Date.now();
  }, true);

  document.addEventListener('focusout', event => {
    const input = event.target;
    if(!isThresholdInput(input)) return;
    const leavingDraft = draft ? {...draft} : null;
    const leavingKey = inputKey(input);

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

      /*
       * Si el campo fue reconstruido durante la edicion, el navegador puede considerar
       * el valor restaurado como valor inicial y no disparar change al salir. En ese caso
       * lo disparamos una sola vez para que la configuracion llegue a la API.
       */
      const nativeChangeJustFired = lastChangeKey === leavingKey && (Date.now() - lastChangeAt) < 250;
      if(restoredAfterRefresh && !nativeChangeJustFired){
        input.dispatchEvent(new Event('change',{bubbles:true}));
      }

      editing = false;
      restoredAfterRefresh = false;
      setTimeout(() => {
        if(!editing && draft && draftKey() === leavingKey){
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
