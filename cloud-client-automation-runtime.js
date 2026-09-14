(() => {
  'use strict';

  // Runtime de automatización por eventos lógicos:
  // - Automático sólo se reevalúa cuando llega una telemetría nueva.
  // - Timer sólo se reevalúa cuando cambia el minuto o llega un estado nuevo.
  // - Una orden ya enviada no se repite contra la misma telemetría antigua.
  const RESOURCE_TTL_MS = 60000;
  const LOOP_MS = 2000;
  const SENSOR_STALE_MS = 45000;
  const RETRY_AFTER_MS = 5000;

  const resourceCache = new Map();
  const evaluationState = new Map();
  const commandState = new Map();
  const commandBusy = new Set();
  let loopBusy = false;
  let loopTimer = null;

  const devices = () => Array.isArray(window.__tayuRealDevices) ? window.__tayuRealDevices : [];
  const automationKey = (deviceKey,outputKey) => `${String(deviceKey || '')}|${String(outputKey || '')}`;

  function deviceByKey(deviceKey){
    return devices().find(row => String(row?.device_key || '') === String(deviceKey || '')) || null;
  }

  function latestRow(deviceKey){
    let latest = null;
    for(const row of (Array.isArray(window.__tayuLastTelemetry) ? window.__tayuLastTelemetry : [])){
      if(String(row?.device_key || '') !== String(deviceKey || '')) continue;
      if(!latest || new Date(row?.time || 0) > new Date(latest?.time || 0)) latest = row;
    }
    return latest;
  }

  function rowTime(row){
    const value = new Date(row?.time || 0).getTime();
    return Number.isFinite(value) ? value : 0;
  }

  function parsePayload(row){
    const value = row?.payload;
    if(value && typeof value === 'object') return value;
    if(typeof value === 'string'){
      try{return JSON.parse(value);}catch(_){return {};}
    }
    return {};
  }

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

  function patchOutput(row,outputKey,value){
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
    const timers = Array.isArray(legacy.timers) ? legacy.timers : (legacy.timer ? [legacy.timer] : []);
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
      automatic: {...(legacy.automatic || {}), ...(saved.automatic || {})},
      timers: hasSavedTimers ? savedTimers : legacy.timers
    };
  }

  function automaticDecision(deviceKey,automatic,row){
    const time = rowTime(row);
    const age = time ? Date.now() - time : Infinity;
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
    const onValue = explicitOn ?? (useSensorThresholds ? thresholdFromSensor(meta,onOperator) : null);
    const offValue = explicitOff ?? (useSensorThresholds ? thresholdFromSensor(meta,offOperator) : null);

    const onMatch = onValue !== null && compare(value,onOperator,onValue);
    const offMatch = offValue !== null && compare(value,offOperator,offValue);
    if(onMatch && offMatch) return null;
    if(onMatch) return true;
    if(offMatch) return false;
    return null;
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
    const selectedDays = Array.isArray(slot?.days) && slot.days.length ? slot.days.map(Number) : [1,2,3,4,5,6,7];
    const day = dayNumber(now);
    const current = now.getHours() * 60 + now.getMinutes();
    if(on < off) return selectedDays.includes(day) && current >= on && current < off;
    return (selectedDays.includes(day) && current >= on)
      || (selectedDays.includes(previousDay(day)) && current < off);
  }

  function timerDecision(settings,now){
    const slots = (Array.isArray(settings?.timers) ? settings.timers : (settings?.timer ? [settings.timer] : []))
      .filter(slot => minutes(slot?.on) !== null && minutes(slot?.off) !== null && slot.on !== slot.off);
    if(!slots.length) return null;
    return slots.some(slot => timerSlotActive(slot,now));
  }

  function minuteStamp(date){
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
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

  async function commandOutput(deviceKey,outputKey,desired,row){
    if(typeof window.__tayuApiPost !== 'function') return false;
    const key = automationKey(deviceKey,outputKey);
    if(commandBusy.has(key)) return false;

    const payload = parsePayload(row);
    const actual = readOutput(payload,outputKey);
    const telemetryTime = rowTime(row);
    const previous = commandState.get(key);

    if(actual === desired){
      // Si la telemetría nueva ya confirma el estado, no hay nada que enviar.
      if(!previous || telemetryTime >= Number(previous.telemetryTime || 0)){
        commandState.set(key,{value:desired,sentAt:Number(previous?.sentAt||0),telemetryTime,confirmed:true});
      }
      return true;
    }

    if(previous?.value === desired){
      // No repetir la misma orden contra el mismo paquete viejo de telemetría.
      if(telemetryTime <= Number(previous.telemetryTime || 0)) return true;
      // Si llegó un paquete nuevo contradictorio, permitimos reintento pero no en ráfaga.
      if(Date.now() - Number(previous.sentAt || 0) < RETRY_AFTER_MS) return true;
    }

    commandBusy.add(key);
    const sentAt = Date.now();
    commandState.set(key,{value:desired,sentAt,telemetryTime,confirmed:false});
    try{
      await window.__tayuApiPost('/devices/output',{
        device_key:deviceKey,
        output_key:outputKey,
        value:Boolean(desired)
      });
      patchOutput(row,outputKey,desired);
      updateVisibleState(deviceKey,outputKey,desired);
      return true;
    }catch(error){
      console.warn(`Automation output ${deviceKey}/${outputKey}:`,error);
      const current = commandState.get(key);
      if(current?.sentAt === sentAt) commandState.set(key,{...current,failed:true});
      return false;
    }finally{
      commandBusy.delete(key);
    }
  }

  function clearDeviceRuntimeState(deviceKey){
    const prefix = `${String(deviceKey || '')}|`;
    for(const key of [...evaluationState.keys()]) if(key.startsWith(prefix)) evaluationState.delete(key);
    for(const key of [...commandState.keys()]) if(key.startsWith(prefix)) commandState.delete(key);
  }

  async function evaluateDevice(device,forceResources=false){
    const deviceKey = String(device?.device_key || '');
    if(!deviceKey) return;
    const data = await loadResources(deviceKey,forceResources);
    const resources = (Array.isArray(data?.resources) ? data.resources : [])
      .filter(resource => resource?.resource_type === 'digital_output' && resource?.assignment?.enabled !== false);
    const row = latestRow(deviceKey);
    const telemetryTime = rowTime(row);
    const now = new Date();
    const minute = minuteStamp(now);

    for(const resource of resources){
      const outputKey = String(resource?.resource_key || '');
      if(!outputKey) continue;
      const key = automationKey(deviceKey,outputKey);
      const settings = effectiveSettings(resource,deviceKey);
      const mode = String(settings.mode || 'manual').toLowerCase();
      const previous = evaluationState.get(key);

      if(mode === 'manual'){
        if(previous) evaluationState.delete(key);
        commandState.delete(key);
        continue;
      }

      if(mode === 'automatic'){
        // Una misma muestra del sensor nunca se evalúa repetidamente.
        if(previous?.mode === 'automatic' && previous.telemetryTime === telemetryTime) continue;
        const desired = automaticDecision(deviceKey,settings.automatic || {},row);
        evaluationState.set(key,{mode,telemetryTime,minute,desired});
        if(desired !== null) await commandOutput(deviceKey,outputKey,desired,row);
        continue;
      }

      if(mode === 'timer'){
        // Timer sólo necesita reaccionar a cambio de minuto o a un estado físico nuevo.
        if(previous?.mode === 'timer' && previous.minute === minute && previous.telemetryTime === telemetryTime) continue;
        const desired = timerDecision(settings,now);
        evaluationState.set(key,{mode,telemetryTime,minute,desired});
        if(desired !== null) await commandOutput(deviceKey,outputKey,desired,row);
      }
    }
  }

  async function evaluateAll(forceResources=false){
    if(loopBusy) return;
    loopBusy = true;
    try{
      await Promise.all(devices().map(device => evaluateDevice(device,forceResources)));
    }finally{
      loopBusy = false;
    }
  }

  async function reloadDevice(deviceKey){
    const key = String(deviceKey || '');
    if(!key) return;
    resourceCache.delete(key);
    clearDeviceRuntimeState(key);
    const device = deviceByKey(key);
    if(device) await evaluateDevice(device,true);
  }

  async function reloadAll(){
    resourceCache.clear();
    evaluationState.clear();
    commandState.clear();
    await evaluateAll(true);
  }

  function install(){
    clearInterval(loopTimer);
    loopTimer = setInterval(() => evaluateAll(false),LOOP_MS);
    window.addEventListener('tayu:client-access-ready',() => setTimeout(() => reloadAll(),300));
    window.addEventListener('pageshow',() => setTimeout(() => evaluateAll(false),250));
    document.addEventListener('visibilitychange',() => {
      if(document.visibilityState === 'visible') setTimeout(() => evaluateAll(false),150);
    });
    setTimeout(() => reloadAll(),1200);

    window.__tayuAutomationRuntime = {
      evaluate:() => evaluateAll(false),
      reload:reloadAll,
      reloadDevice,
      invalidate:deviceKey => {
        const key = String(deviceKey || '');
        resourceCache.delete(key);
        clearDeviceRuntimeState(key);
      }
    };
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();