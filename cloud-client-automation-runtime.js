(() => {
  'use strict';

  const VERSION='20260914-production1';
  if(window.__tayuAutomationRuntime?.version===VERSION)return;

  const SENSOR_STALE_MS=45000;
  const RETRY_AFTER_MS=8000;
  const BOOT_CONCURRENCY=6;
  const ACTIVE_CONCURRENCY=8;

  const resourceCache=new Map();
  const activeDevices=new Set();
  const evaluationState=new Map();
  const commandState=new Map();
  const commandBusy=new Set();

  let evaluationBusy=false;
  let evaluationPending=false;
  let telemetryWatchTimer=null;
  let minuteTimer=null;
  let lastTelemetrySignature='';
  let bootStarted=false;

  const devices=()=>Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[];
  const automationKey=(deviceKey,outputKey)=>`${String(deviceKey||'')}|${String(outputKey||'')}`;

  function deviceByKey(deviceKey){
    return devices().find(row=>String(row?.device_key||'')===String(deviceKey||''))||null;
  }

  function latestTelemetryMap(){
    const map=new Map();
    for(const row of(Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[])){
      const key=String(row?.device_key||'');
      if(!key)continue;
      const previous=map.get(key);
      if(!previous||new Date(row?.time||0)>new Date(previous?.time||0))map.set(key,row);
    }
    return map;
  }

  function rowTime(row){
    const value=new Date(row?.time||0).getTime();
    return Number.isFinite(value)?value:0;
  }

  function parsePayload(row){
    const value=row?.payload;
    if(value&&typeof value==='object')return value;
    if(typeof value==='string'){
      try{return JSON.parse(value);}catch(_){return {};}
    }
    return {};
  }

  function readPath(object,path){
    return String(path||'').split('.').filter(Boolean).reduce((acc,key)=>acc==null?undefined:acc[key],object);
  }

  function readOutput(payload,outputKey){
    const values=[
      payload?.[outputKey],payload?.outputs?.[outputKey],payload?.io?.[outputKey],
      payload?.relays?.[outputKey],payload?.[`${outputKey}_state`]
    ];
    const value=values.find(item=>item!==undefined&&item!==null);
    if(value===true||value===false)return value;
    if(value===1||value==='1'||String(value).toLowerCase()==='on'||String(value).toLowerCase()==='true')return true;
    if(value===0||value==='0'||String(value).toLowerCase()==='off'||String(value).toLowerCase()==='false')return false;
    return undefined;
  }

  function patchOutput(row,outputKey,value){
    if(!row)return;
    const payload=parsePayload(row);
    payload[outputKey]=Boolean(value);
    if(payload.outputs&&typeof payload.outputs==='object')payload.outputs[outputKey]=Boolean(value);
    if(payload.relays&&typeof payload.relays==='object')payload.relays[outputKey]=Boolean(value);
    row.payload=payload;
  }

  function numberOrNull(value){
    if(value===''||value===null||value===undefined)return null;
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  }

  function compare(value,operator,threshold){
    if(!Number.isFinite(value)||!Number.isFinite(threshold))return false;
    if(operator==='<=')return value<=threshold;
    if(operator==='<')return value<threshold;
    if(operator==='>=')return value>=threshold;
    if(operator==='>')return value>threshold;
    if(operator==='==')return value===threshold;
    return false;
  }

  function sensorMeta(deviceKey,path){
    const meta=deviceByKey(deviceKey)?.configuration?.signals?.[path];
    return meta&&typeof meta==='object'?meta:null;
  }

  function thresholdFromSensor(meta,operator){
    if(!meta)return null;
    if(operator==='<'||operator==='<=')return numberOrNull(meta.alarm_min);
    if(operator==='>'||operator==='>=')return numberOrNull(meta.alarm_max);
    return numberOrNull(meta.alarm_min)??numberOrNull(meta.alarm_max);
  }

  function failSafeDecision(value){
    if(value==='hold')return null;
    if(value==='on'||value===true||value==='true')return true;
    return false;
  }

  function legacySettings(deviceKey,outputKey){
    const legacy=deviceByKey(deviceKey)?.configuration?.outputs?.[outputKey]||{};
    return{
      mode:String(legacy.mode||'manual').toLowerCase(),
      automatic:legacy.automatic&&typeof legacy.automatic==='object'?legacy.automatic:{},
      timers:Array.isArray(legacy.timers)?legacy.timers:(legacy.timer?[legacy.timer]:[])
    };
  }

  function effectiveSettings(resource,deviceKey){
    if(resource?.assignment){
      const saved=resource.assignment.settings&&typeof resource.assignment.settings==='object'?resource.assignment.settings:{};
      return{
        ...saved,
        mode:String(saved.mode||'manual').toLowerCase(),
        automatic:saved.automatic&&typeof saved.automatic==='object'?saved.automatic:{},
        timers:Array.isArray(saved.timers)?saved.timers:(saved.timer?[saved.timer]:[])
      };
    }
    return legacySettings(deviceKey,String(resource?.resource_key||''));
  }

  function automaticDecision(deviceKey,automatic,row){
    const time=rowTime(row);
    if(!time||Date.now()-time>SENSOR_STALE_MS)return failSafeDecision(automatic?.fail_safe);

    const source=String(automatic?.source||'');
    const value=Number(readPath(parsePayload(row),source));
    if(!source||!Number.isFinite(value))return failSafeDecision(automatic?.fail_safe);

    const onOperator=automatic?.on_operator||'<=';
    const offOperator=automatic?.off_operator||'>=';
    const useSensorThresholds=automatic?.use_sensor_thresholds!==false;
    const meta=useSensorThresholds?sensorMeta(deviceKey,source):null;

    // Si el modo está vinculado a Sensores, los umbrales actuales del sensor
    // son la fuente de verdad. Así cambiar mín/máx en Sensores no requiere
    // volver a guardar cada relay.
    const onValue=useSensorThresholds
      ? thresholdFromSensor(meta,onOperator)
      : numberOrNull(automatic?.on_value);
    const offValue=useSensorThresholds
      ? thresholdFromSensor(meta,offOperator)
      : numberOrNull(automatic?.off_value);

    const onMatch=onValue!==null&&compare(value,onOperator,onValue);
    const offMatch=offValue!==null&&compare(value,offOperator,offValue);
    if(onMatch&&offMatch)return null;
    if(onMatch)return true;
    if(offMatch)return false;
    return null;
  }

  function minutes(value){
    const match=/^(\d{1,2}):(\d{2})$/.exec(String(value||''));
    if(!match)return null;
    const hour=Number(match[1]),minute=Number(match[2]);
    if(hour<0||hour>23||minute<0||minute>59)return null;
    return hour*60+minute;
  }

  function dayNumber(date){const day=date.getDay();return day===0?7:day;}
  function previousDay(day){return day===1?7:day-1;}

  function timerSlotActive(slot,now){
    const on=minutes(slot?.on),off=minutes(slot?.off);
    if(on===null||off===null||on===off)return false;
    const days=Array.isArray(slot?.days)&&slot.days.length?slot.days.map(Number):[1,2,3,4,5,6,7];
    const day=dayNumber(now);
    const current=now.getHours()*60+now.getMinutes();
    if(on<off)return days.includes(day)&&current>=on&&current<off;
    return(days.includes(day)&&current>=on)||(days.includes(previousDay(day))&&current<off);
  }

  function timerDecision(settings,now){
    const slots=(Array.isArray(settings?.timers)?settings.timers:(settings?.timer?[settings.timer]:[]))
      .filter(slot=>minutes(slot?.on)!==null&&minutes(slot?.off)!==null&&slot.on!==slot.off);
    if(!slots.length)return null;
    return slots.some(slot=>timerSlotActive(slot,now));
  }

  function minuteStamp(date){
    return`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
  }

  function resourcesOf(data){return Array.isArray(data?.resources)?data.resources:[];}

  function refreshActiveDevice(deviceKey){
    const key=String(deviceKey||'');
    const data=resourceCache.get(key)?.data;
    const active=resourcesOf(data).some(resource=>{
      if(resource?.resource_type!=='digital_output'||resource?.assignment?.enabled===false)return false;
      const mode=effectiveSettings(resource,key).mode;
      return mode==='automatic'||mode==='timer';
    });
    if(active)activeDevices.add(key);else activeDevices.delete(key);
  }

  async function loadResources(deviceKey,force=false){
    const key=String(deviceKey||'');
    if(!key||typeof window.__tayuApi!=='function')return null;
    const cached=resourceCache.get(key);
    if(!force&&cached)return cached.data;
    try{
      const data=await window.__tayuApi(`/devices/iot-resources?device_key=${encodeURIComponent(key)}`);
      resourceCache.set(key,{data});
      refreshActiveDevice(key);
      return data;
    }catch(error){
      console.warn('Automation resources:',key,error);
      return cached?.data||null;
    }
  }

  function updateVisibleState(deviceKey,outputKey,value){
    const selector=`[data-sector-output="${CSS.escape(String(outputKey))}"][data-device-key="${CSS.escape(String(deviceKey))}"]`;
    document.querySelectorAll(selector).forEach(card=>{
      const state=card.querySelector('.tayu-sector-state');
      if(!state)return;
      state.classList.toggle('on',Boolean(value));
      state.classList.toggle('off',!value);
      state.textContent=value?'● ENCENDIDO':'○ APAGADO';
    });
  }

  async function commandOutput(deviceKey,outputKey,desired,row){
    if(typeof window.__tayuApiPost!=='function')return false;
    const key=automationKey(deviceKey,outputKey);
    if(commandBusy.has(key))return false;

    const actual=readOutput(parsePayload(row),outputKey);
    const telemetryTime=rowTime(row);
    const previous=commandState.get(key);

    if(actual===desired){
      commandState.set(key,{value:desired,sentAt:Number(previous?.sentAt||0),telemetryTime,confirmed:true});
      return true;
    }
    if(previous?.value===desired){
      if(telemetryTime<=Number(previous.telemetryTime||0))return true;
      if(Date.now()-Number(previous.sentAt||0)<RETRY_AFTER_MS)return true;
    }

    commandBusy.add(key);
    const sentAt=Date.now();
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
      return false;
    }finally{
      commandBusy.delete(key);
    }
  }

  function clearOutputRuntimeState(deviceKey,outputKey){
    const key=automationKey(deviceKey,outputKey);
    evaluationState.delete(key);
    commandState.delete(key);
    commandBusy.delete(key);
  }

  function clearDeviceRuntimeState(deviceKey){
    const prefix=`${String(deviceKey||'')}|`;
    for(const key of[...evaluationState.keys()])if(key.startsWith(prefix))evaluationState.delete(key);
    for(const key of[...commandState.keys()])if(key.startsWith(prefix))commandState.delete(key);
    for(const key of[...commandBusy])if(key.startsWith(prefix))commandBusy.delete(key);
  }

  async function evaluateResource(deviceKey,resource,row,now,force=false){
    const outputKey=String(resource?.resource_key||'');
    if(!outputKey)return;
    const key=automationKey(deviceKey,outputKey);
    const settings=effectiveSettings(resource,deviceKey);
    const mode=String(settings.mode||'manual').toLowerCase();
    const previous=evaluationState.get(key);
    const telemetryTime=rowTime(row);
    const minute=minuteStamp(now);

    if(mode==='manual'){
      clearOutputRuntimeState(deviceKey,outputKey);
      return;
    }
    if(mode==='automatic'){
      if(!force&&previous?.mode==='automatic'&&previous.telemetryTime===telemetryTime)return;
      const desired=automaticDecision(deviceKey,settings.automatic||{},row);
      evaluationState.set(key,{mode,telemetryTime,minute,desired});
      if(desired!==null)await commandOutput(deviceKey,outputKey,desired,row);
      return;
    }
    if(mode==='timer'){
      if(!force&&previous?.mode==='timer'&&previous.minute===minute&&previous.telemetryTime===telemetryTime)return;
      const desired=timerDecision(settings,now);
      evaluationState.set(key,{mode,telemetryTime,minute,desired});
      if(desired!==null)await commandOutput(deviceKey,outputKey,desired,row);
    }
  }

  async function evaluateCachedDevice(deviceKey,telemetryMap,force=false){
    const key=String(deviceKey||'');
    const data=resourceCache.get(key)?.data;
    if(!data)return;
    const row=telemetryMap.get(key)||null;
    const now=new Date();
    const jobs=[];
    for(const resource of resourcesOf(data)){
      if(resource?.resource_type!=='digital_output'||resource?.assignment?.enabled===false)continue;
      const mode=effectiveSettings(resource,key).mode;
      if(mode!=='automatic'&&mode!=='timer')continue;
      jobs.push(evaluateResource(key,resource,row,now,force));
    }
    await Promise.all(jobs);
  }

  async function evaluateActive(force=false){
    if(evaluationBusy){evaluationPending=true;return;}
    evaluationBusy=true;
    try{
      const keys=[...activeDevices];
      const telemetryMap=latestTelemetryMap();
      for(let index=0;index<keys.length;index+=ACTIVE_CONCURRENCY){
        await Promise.all(keys.slice(index,index+ACTIVE_CONCURRENCY).map(key=>evaluateCachedDevice(key,telemetryMap,force)));
      }
    }finally{
      evaluationBusy=false;
      if(evaluationPending){evaluationPending=false;queueMicrotask(()=>evaluateActive(false));}
    }
  }

  function telemetrySignature(){
    const latest=latestTelemetryMap();
    return[...activeDevices].sort().map(key=>`${key}:${rowTime(latest.get(key))}`).join('|');
  }

  function checkTelemetryChange(){
    const signature=telemetrySignature();
    if(signature&&signature!==lastTelemetrySignature){
      lastTelemetrySignature=signature;
      evaluateActive(false);
    }
  }

  function scheduleMinuteTick(){
    clearTimeout(minuteTimer);
    const delay=60000-(Date.now()%60000)+80;
    minuteTimer=setTimeout(()=>{
      evaluateActive(false);
      scheduleMinuteTick();
    },delay);
  }

  function cloneSettings(settings){
    try{return JSON.parse(JSON.stringify(settings||{}));}catch(_){return{...(settings||{})};}
  }

  async function applySettings(deviceKey,outputKey,settings,resourceData){
    const key=String(deviceKey||''),output=String(outputKey||'');
    if(!key||!output)return;

    let data=resourceData&&Array.isArray(resourceData.resources)?resourceData:resourceCache.get(key)?.data;
    if(!data)data={resources:[]};
    const resource=resourcesOf(data).find(item=>String(item?.resource_key||'')===output);
    if(resource){
      resource.assignment=resource.assignment&&typeof resource.assignment==='object'?resource.assignment:{};
      resource.assignment.settings=cloneSettings(settings);
    }
    resourceCache.set(key,{data});
    clearOutputRuntimeState(key,output);
    refreshActiveDevice(key);

    const mode=String(settings?.mode||'manual').toLowerCase();
    if(mode==='manual'||!resource)return;
    const row=latestTelemetryMap().get(key)||null;
    await evaluateResource(key,resource,row,new Date(),true);
  }

  async function reloadDevice(deviceKey){
    const key=String(deviceKey||'');
    if(!key)return;
    resourceCache.delete(key);
    activeDevices.delete(key);
    clearDeviceRuntimeState(key);
    await loadResources(key,true);
    await evaluateCachedDevice(key,latestTelemetryMap(),true);
  }

  async function reloadAll(){
    resourceCache.clear();
    activeDevices.clear();
    evaluationState.clear();
    commandState.clear();
    commandBusy.clear();
    const keys=devices().map(device=>String(device?.device_key||'')).filter(Boolean);
    for(let index=0;index<keys.length;index+=BOOT_CONCURRENCY){
      await Promise.all(keys.slice(index,index+BOOT_CONCURRENCY).map(key=>loadResources(key,true)));
    }
    lastTelemetrySignature=telemetrySignature();
    await evaluateActive(true);
  }

  function bootOnce(){
    if(bootStarted)return;
    bootStarted=true;
    setTimeout(()=>reloadAll().catch(error=>console.warn('Automation boot:',error)),350);
  }

  function dispose(){
    clearInterval(telemetryWatchTimer);
    clearTimeout(minuteTimer);
    telemetryWatchTimer=null;
    minuteTimer=null;
  }

  function install(){
    dispose();
    telemetryWatchTimer=setInterval(checkTelemetryChange,750);
    scheduleMinuteTick();
    window.addEventListener('tayu:client-access-ready',bootOnce,{once:true});
    window.addEventListener('pageshow',()=>setTimeout(checkTelemetryChange,100));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(checkTelemetryChange,80);});
    setTimeout(bootOnce,800);

    window.__tayuAutomationRuntime={
      version:VERSION,
      evaluate:()=>evaluateActive(false),
      reload:reloadAll,
      reloadDevice,
      applySettings,
      invalidate:deviceKey=>{
        const key=String(deviceKey||'');
        resourceCache.delete(key);
        activeDevices.delete(key);
        clearDeviceRuntimeState(key);
      },
      dispose
    };
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
