(() => {
  'use strict';

  // Automatización ligera: evalúa el estado ya disponible en memoria y evita
  // lanzar un segundo ciclo de refresco de telemetría sobre el dashboard.
  const RESOURCE_TTL_MS = 30000;
  const LOOP_MS = 2000;
  const SENSOR_STALE_MS = 45000;
  const COMMAND_COOLDOWN_MS = 3000;

  const resourceCache = new Map();
  const commandState = new Map();
  const commandBusy = new Set();
  let loopBusy = false;
  let loopTimer = null;

  const devices = () => Array.isArray(window.__tayuRealDevices) ? window.__tayuRealDevices : [];

  function deviceByKey(deviceKey){
    return devices().find(row => String(row?.device_key || '') === String(deviceKey || '')) || null;
  }

  function telemetryRows(deviceKey){
    return (Array.isArray(window.__tayuLastTelemetry) ? window.__tayuLastTelemetry : [])
      .filter(row => String(row?.device_key || '') === String(deviceKey || ''))
      .sort((a,b) => new Date(b?.time || 0) - new Date(a?.time || 0));
  }

  function latestRow(deviceKey){ return telemetryRows(deviceKey)[0] || null; }

  function parsePayload(row){
    const value = row?.payload;
    if(value && typeof value === 'object') return value;
    if(typeof value === 'string'){
      try{return JSON.parse(value);}catch(_){return {};}
    }
    return {};
  }

  function latestPayload(deviceKey){ return parsePayload(latestRow(deviceKey)); }

  function readPath(obj,path){
    return String(path || '').split('.').filter(Boolean)
      .reduce((acc,key) => acc == null ? undefined : acc[key], obj);
  }

  function readOutput(payload,outputKey){
    const candidates = [
      payload?.[outputKey],
      payload?.outputs?.[outputKey],
      payload?.io?.[outputKey],
      payload?.relays?.[outputKey],
      payload?.[`${outputKey}_state`]
    ];
    const value = candidates.find(item => item !== undefined && item !== null);
    if(value === true || value === false) return value;
    if(value === 1 || value === '1' || String(value).toLowerCase() === 'on' || String(value).toLowerCase() === 'true') return true;
    if(value === 0 || value === '0' || String(value).toLowerCase() === 'off' || String(value).toLowerCase() === 'false') return false;
    return undefined;
  }

  function patchOutput(deviceKey,outputKey,value){
    const row = latestRow(deviceKey);
    if(!row) return;
    const payload = parsePayload(row);
    payload[outputKey] = Boolean(value);
    if(payload.outputs && typeof payload.outputs === 'object') payload.outputs[outputKey] = Boolean(value);
    if(payload.relays && typeof payload.relays === 'object') payload.relays[outputKey] = Boolean(value);
    row.payload = payload;
  }

  function numberOrNull(value){
    if(value === '' || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function compare(value,operator,threshold){
    if(!Number.isFinite(value) || !Number.isFinite(threshold)) return false;
    if(operator === '<=') return value <= threshold;
    if(operator === '<') return value < threshold;
    if(operator === '>=') return value >= threshold;
    if(operator === '>') return value > threshold;
    if(operator === '==') return value === threshold;
    return false;
  }

  function sensorMeta(deviceKey,path){
    const meta = deviceByKey(deviceKey)?.configuration?.signals?.[path];
    return meta && typeof meta === 'object' ? meta : null;
  }

  function thresholdFromSensor(meta,operator){
    if(!meta) return null;
    if(operator === '<' || operator === '<=') return numberOrNull(meta.alarm_min);
    if(operator === '>' || operator === '>=') return numberOrNull(meta.alarm_max);
    return numberOrNull(meta.alarm_min) ?? numberOrNull(meta.alarm_max);
  }

  function failSafeDecision(value){
    if(value === 'hold') return null;
    if(value === 'on' || value === true || value === 'true') return true;
    return false;
  }

  function legacySettings(deviceKey,outputKey){
    const legacy = deviceByKey(deviceKey)?.configuration?.outputs?.[outputKey] || {};
    const timers = Array.isArray(legacy.timers)
      ? legacy.timers
      : (legacy.timer ? [legacy.timer] : []);
    return {
      mode: String(legacy.mode || 'manual').toLowerCase(),
      automatic: legacy.automatic && typeof legacy.automatic === 'object' ? legacy.automatic : {},
      timers
    };
  }

  function effectiveSettings(resource,deviceKey){
    const outputKey = String(resource?.resource_key || '');
    const saved = resource?.assignment?.settings && typeof resource.assignment.settings === 'object'
      ? resource.assignment.settings
      : {};
    const legacy = legacySettings(deviceKey,outputKey);
    const hasSavedTimers = Array.isArray(saved.timers) || Boolean(saved.timer);
    const savedTimers = Array.isArray(saved.timers) ? saved.timers : (saved.timer ? [saved.timer] : []);
    return {
      ...saved,
      mode: String(saved.mode || legacy.mode || 'manual').toLowerCase(),
      automatic: {
        ...(legacy.automatic || {}),
        ...(saved.automatic || {})
      },
      timers: hasSavedTimers ? savedTimers : legacy.timers
    };
  }

  function automaticDecision(deviceKey,automatic){
    const row = latestRow(deviceKey);
    const rowTime = new Date(row?.time || 0).getTime();
    const age = Number.isFinite(rowTime) ? Date.now() - rowTime : Infinity;
    if(age > SENSOR_STALE_MS) return failSafeDecision(automatic?.fail_safe);

    const source = String(automatic?.source || '');
    const raw = readPath(parsePayload(row),source);
    const value = Number(raw);
    if(!source || !Number.isFinite(value)) return failSafeDecision(automatic?.fail_safe);

    const onOperator = automatic?.on_operator || '<=';
    const offOperator = automatic?.off_operator || '>=';
    const explicitOn = numberOrNull(automatic?.on_value);
    const explicitOff = numberOrNull(automatic?.off_value);
    const useSensorThresholds = automatic?.use_sensor_thresholds === true;
    const meta = useSensorThresholds ? sensorMeta(deviceKey,source) : null;

    // Los valores configurados en el modo automático tienen prioridad. Los
    // umbrales de alarma del sensor sólo se usan si se activó expresamente esa opción.
    const onValue = explicitOn ?? (useSensorThresholds ? thresholdFromSensor(meta,onOperator) : null);
    const offValue = explicitOff ?? (useSensorThresholds ? thresholdFromSensor(meta,offOperator) : null);

    const onMatch = onValue !== null && compare(value,onOperator,onValue);
    const offMatch = offValue !== null && compare(value,offOperator,offValue);

    if(onMatch && offMatch) return null;
    if(onMatch) return true;
    if(offMatch) return false;
    return null; // banda de histéresis: conserva el último estado
  }

  function minutes(value){
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    if(!match) return null;
    const h = Number(match[1]), m = Number(match[2]);
    if(h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  }

  function dayNumber(date){
    const day = date.getDay();
    return day === 0 ? 7 : day;
  }

  function previousDay(day){ return day === 1 ? 7 : day - 1; }

  function timerSlotActive(slot,now){
    const on = minutes(slot?.on), off = minutes(slot?.off);
    if(on === null || off === null || on === off) return false;
    const selectedDays = Array.isArray(slot?.days) && slot.days.length
      ? slot.days.map(Number)
      : [1,2,3,4,5,6,7];
    const day = dayNumber(now);
    const current = now.getHours() * 60 + now.getMinutes();

    if(on < off) return selectedDays.includes(day) && current >= on && current < off;

    // Horario que cruza medianoche, por ejemplo 22:00 -> 05:00.
    return (selectedDays.includes(day) && current >= on)
      || (selectedDays.includes(previousDay(day)) && current < off);
  }

  function timerDecision(settings){
    const slots = (Array.isArray(settings?.timers)
      ? settings.timers
      : (settings?.timer ? [settings.timer] : []))
      .filter(slot => minutes(slot?.on) !== null && minutes(slot?.off) !== null && slot.on !== slot.off);
    if(!slots.length) return null;
    const now = new Date();
    return slots.some(slot => timerSlotActive(slot,now));
  }

  async function loadResources(deviceKey,force=false){
    const key = String(deviceKey || '');
    if(!key || typeof window.__tayuApi !== 'function') return null;
    const cached = resourceCache.get(key);
    if(!force && cached && Date.now() - cached.at < RESOURCE_TTL_MS) return cached.data;
    try{
      const data = await window.__tayuApi(`/devices/iot-resources?device_key=${encodeURIComponent(key)}`);
      resourceCache.set(key,{at:Date.now(),data});
      return data;
    }catch(error){
      console.warn('Automation resources:',key,error);
      return cached?.data || null;
    }
  }

  function updateVisibleState(deviceKey,outputKey,value){
    const selector = `[data-sector-output="${CSS.escape(String(outputKey))}"][data-device-key="${CSS.escape(String(deviceKey))}"]`;
    document.querySelectorAll(selector).forEach(card => {
      const state = card.querySelector('.tayu-sector-state');
      if(state){
        state.classList.toggle('on',Boolean(value));
        state.classList.toggle('off',!value);
        state.textContent = value ? '● ENCENDIDO' : '○ APAGADO';
      }
    });
  }

  async function commandOutput(deviceKey,outputKey,desired){
    if(typeof window.__tayuApiPost !== 'function') return;
    const commandKey = `${deviceKey}|${outputKey}`;
    if(commandBusy.has(commandKey)) return;

    const actual = readOutput(latestPayload(deviceKey),outputKey);
    if(actual === desired) return;

    const previous = commandState.get(commandKey);
    if(previous?.value === desired && Date.now() - previous.at < COMMAND_COOLDOWN_MS) return;

    commandBusy.add(commandKey);
    commandState.set(commandKey,{value:desired,at:Date.now()});
    try{
      await window.__tayuApiPost('/devices/output',{
        device_key:deviceKey,
        output_key:outputKey,
        value:Boolean(desired)
      });
      patchOutput(deviceKey,outputKey,desired);
      updateVisibleState(deviceKey,outputKey,desired);
    }catch(error){
      console.warn(`Automation output ${deviceKey}/${outputKey}:`,error);
    }finally{
      commandBusy.delete(commandKey);
    }
  }

  async function evaluateDevice(device){
    const deviceKey = String(device?.device_key || '');
    if(!deviceKey) return;
    const data = await loadResources(deviceKey,false);
    const resources = (Array.isArray(data?.resources) ? data.resources : [])
      .filter(resource => resource?.resource_type === 'digital_output' && resource?.assignment?.enabled !== false);

    for(const resource of resources){
      const outputKey = String(resource?.resource_key || '');
      if(!outputKey) continue;
      const settings = effectiveSettings(resource,deviceKey);
      const mode = String(settings.mode || 'manual').toLowerCase();
      let desired = null;
      if(mode === 'automatic') desired = automaticDecision(deviceKey,settings.automatic || {});
      else if(mode === 'timer') desired = timerDecision(settings);
      else continue;
      if(desired !== null) await commandOutput(deviceKey,outputKey,desired);
    }
  }

  async function evaluateAll(forceResources=false){
    if(loopBusy) return;
    loopBusy = true;
    try{
      if(forceResources) resourceCache.clear();
      await Promise.all(devices().map(device => evaluateDevice(device)));
    }finally{
      loopBusy = false;
    }
  }

  function install(){
    clearInterval(loopTimer);
    loopTimer = setInterval(() => evaluateAll(false),LOOP_MS);
    window.addEventListener('tayu:client-access-ready',() => setTimeout(() => evaluateAll(true),300));
    window.addEventListener('pageshow',() => setTimeout(() => evaluateAll(true),250));
    document.addEventListener('visibilitychange',() => {
      if(document.visibilityState === 'visible') setTimeout(() => evaluateAll(false),150);
    });
    setTimeout(() => evaluateAll(true),1200);

    window.__tayuAutomationRuntime = {
      evaluate:() => evaluateAll(false),
      reload:() => evaluateAll(true),
      invalidate:deviceKey => resourceCache.delete(String(deviceKey || ''))
    };
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
