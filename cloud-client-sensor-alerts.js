/* TAYULABS Cloud - Alertas y acciones de sensores
 * Compatible con sensores definidos por capabilities.telemetry y configuration.signals.
 * v2: reemplaza prompts de "Agregar sensor" por modal visual.
 */
(() => {
  'use strict';

  const sensorStateCache=new Map();
  let lastAlarmRefreshAt=0;
  let liveTimer=null;

  const asObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};

  function escapeHtml(value){
    return String(value??'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function readPath(object,path){
    return String(path||'').split('.').filter(Boolean).reduce((acc,key)=>acc==null?undefined:acc[key],object);
  }

  function latestPayload(deviceKey){
    const rows=(Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[])
      .filter(row=>String(row?.device_key||'')===String(deviceKey||''))
      .sort((a,b)=>new Date(b?.time||0)-new Date(a?.time||0));
    const value=rows[0]?.payload;
    if(value&&typeof value==='object')return value;
    if(typeof value==='string'){try{return JSON.parse(value);}catch(_){}}
    return {};
  }

  function realAssets(){
    return Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[];
  }

  function profileSensors(){
    const out=[];
    realAssets().forEach(asset=>{
      const deviceKey=String(asset?.device_key||asset?.uuid||asset?.id||'');
      if(!deviceKey)return;
      const profileTelemetry=asObject(asset?.capabilities?.telemetry);
      const configuredSignals=asObject(asset?.configuration?.signals);
      const paths=new Set([...Object.keys(profileTelemetry),...Object.keys(configuredSignals)]);
      const payload=latestPayload(deviceKey);

      paths.forEach(path=>{
        const profile=asObject(profileTelemetry[path]);
        const configured=asObject(configuredSignals[path]);
        if(configured.enabled===false)return;
        const raw=readPath(payload,path);
        const number=Number(raw);
        const type=String(profile.type||configured.type||(Number.isFinite(number)?'number':typeof raw)||'').toLowerCase();
        out.push({
          id:`${deviceKey}:${path}`,
          deviceKey,
          sourcePath:path,
          name:String(configured.name||profile.label||profile.name||path),
          unit:String(configured.unit??profile.unit??''),
          value:Number.isFinite(number)?number:raw,
          min:configured.alarm_min??null,
          max:configured.alarm_max??null,
          alarm_equals:configured.alarm_equals??null,
          type,
          deviceName:String(asset?.name||deviceKey)
        });
      });
    });
    return out.sort((a,b)=>{
      const d=a.deviceName.localeCompare(b.deviceName,'es');
      return d||a.name.localeCompare(b.name,'es');
    });
  }

  function sensors(){
    const profile=profileSensors();
    if(profile.length)return profile;
    try{
      return (typeof platformSensors!=='undefined'&&Array.isArray(platformSensors))?platformSensors:[];
    }catch(_){return [];}
  }

  function assets(){
    const real=realAssets();
    if(real.length)return real;
    try{return (typeof assetInventory!=='undefined'&&Array.isArray(assetInventory))?assetInventory:[];}catch(_){return [];}
  }

  function assetKey(asset){
    return String(asset?.device_key||asset?.uuid||asset?.id||'');
  }

  function assetName(asset){
    return String(asset?.name||assetKey(asset)||'Equipo');
  }

  function assetFor(sensor){
    return assets().find(asset=>assetKey(asset)===String(sensor?.deviceKey||''))||null;
  }

  function signalMeta(sensor){
    return assetFor(sensor)?.configuration?.signals?.[sensor?.sourcePath]||{};
  }

  function isVisibleSensor(sensor){
    return signalMeta(sensor)?.alerts_disabled!==true;
  }

  function currentValue(sensor){
    if(!sensor?.deviceKey||!sensor?.sourcePath)return undefined;
    return readPath(latestPayload(sensor.deviceKey),sensor.sourcePath);
  }

  function numeric(value){
    if(value===null||value===undefined||value==='')return null;
    const n=Number(value);return Number.isFinite(n)?n:null;
  }

  function evaluate(sensor,value){
    const meta=signalMeta(sensor);
    if(meta?.alerts_disabled===true)return {state:'Desactivado',alarm:false};
    if(typeof value==='boolean'&&sensor?.alarm_equals!==null&&sensor?.alarm_equals!==undefined){
      const alarm=value===Boolean(sensor.alarm_equals);
      return {state:alarm?'Alerta':'Normal',alarm};
    }
    const n=numeric(value);
    if(n===null)return {state:'Sin datos',alarm:false};
    const min=numeric(sensor?.min),max=numeric(sensor?.max);
    if(min!==null&&n<min)return {state:'Bajo',alarm:true};
    if(max!==null&&n>max)return {state:'Alto',alarm:true};
    if(min===null&&max===null)return {state:'Sin umbral',alarm:false};
    return {state:'Normal',alarm:false};
  }

  function formatValue(sensor,value){
    if(value===undefined||value===null||value==='')return `—${sensor?.unit?` ${sensor.unit}`:''}`;
    return `${value}${sensor?.unit?` ${sensor.unit}`:''}`;
  }

  function stateClass(state){
    if(state==='Normal')return 'status';
    if(state==='Bajo'||state==='Alto'||state==='Alerta')return 'status warn';
    return 'tayu-sensor-neutral';
  }

  function installStyles(){
    if(document.getElementById('tayuSensorAlertStyles'))return;
    const style=document.createElement('style');
    style.id='tayuSensorAlertStyles';
    style.textContent=`
      .tayu-sensor-action-head,.tayu-sensor-action-cell{text-align:center!important;width:58px}
      .tayu-sensor-delete{width:32px;height:32px;padding:0!important;border-radius:10px!important;display:inline-grid;place-items:center;font-size:21px!important;line-height:1!important;background:rgba(239,68,68,.08)!important;color:var(--danger)!important;border:1px solid rgba(239,68,68,.24)!important;cursor:pointer;font-weight:900!important}
      .tayu-sensor-delete:hover{background:rgba(239,68,68,.14)!important;border-color:var(--danger)!important}
      .tayu-sensor-neutral{display:inline-flex;padding:6px 10px;border-radius:999px;background:var(--panel2);border:1px solid var(--border);color:var(--muted);font-size:12px;font-weight:850}
      .tayu-sensor-rule-note{margin:12px 0 0;padding:10px 12px;border-radius:12px;background:var(--panel2);border:1px solid var(--border);font-size:11px;line-height:1.45;color:var(--muted)}
      .tayu-mb-delete{width:32px!important;height:32px!important;padding:0!important;border-radius:10px!important;display:inline-grid!important;place-items:center!important;font-size:21px!important;line-height:1!important;font-weight:900!important;background:rgba(239,68,68,.08)!important;color:var(--danger)!important;border:1px solid rgba(239,68,68,.24)!important}
      .tayu-mb-delete:hover{background:rgba(239,68,68,.14)!important;border-color:var(--danger)!important}

      #tayuAddSensorModal .modal-card{width:min(720px,100%);max-height:88vh;overflow:auto}
      .tayu-add-sensor-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .tayu-add-sensor-grid .full{grid-column:1/-1}
      .tayu-add-sensor-source{margin-top:14px;padding:12px 14px;border:1px solid var(--border);border-radius:14px;background:var(--panel2);font-size:12px;color:var(--muted);line-height:1.55}
      .tayu-add-sensor-source b{color:var(--text)}
      .tayu-add-sensor-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;flex-wrap:wrap}
      .tayu-add-sensor-status{min-height:20px;margin-top:10px;font-size:12px;font-weight:800;color:var(--muted)}
      .tayu-add-sensor-status.error{display:block;color:var(--danger)}
      .tayu-add-sensor-status.ok{color:var(--brand)}
      @media(max-width:650px){
        .tayu-add-sensor-grid{grid-template-columns:1fr}
        .tayu-add-sensor-grid .full{grid-column:auto}
        .tayu-add-sensor-actions{display:grid;grid-template-columns:1fr;width:100%}
        .tayu-add-sensor-actions .btn{width:100%}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureRuleNote(){
    const table=document.getElementById('sensorTable');
    const card=table?.closest('.card');
    if(!card||card.querySelector('.tayu-sensor-rule-note'))return;
    const note=document.createElement('div');
    note.className='tayu-sensor-rule-note';
    note.innerHTML='<b>Regla de alerta:</b> Mínimo genera alerta cuando la lectura es menor al valor configurado; Máximo cuando la lectura es mayor. Un valor exactamente igual al límite se considera dentro del rango.';
    table.closest('.table-wrap')?.insertAdjacentElement('beforebegin',note);
  }

  function enhanceSensorTable(){
    installStyles();
    const table=document.getElementById('sensorTable');
    if(!table)return;
    const rows=Array.from(table.rows||[]);
    if(!rows.length)return;
    ensureRuleNote();

    const header=rows[0];
    let actionHead=header.querySelector('[data-tayu-sensor-action-head]');
    if(!actionHead){
      actionHead=document.createElement('th');
      actionHead.dataset.tayuSensorActionHead='1';
      actionHead.className='tayu-sensor-action-head';
      actionHead.textContent='Acción';
      header.appendChild(actionHead);
    }

    const list=sensors();
    rows.slice(1).forEach((row,index)=>{
      const sensor=list[index];
      if(!sensor)return;
      if(!isVisibleSensor(sensor)){row.remove();return;}
      row.dataset.tayuSensorId=String(sensor.id||'');
      row.dataset.tayuSensorDevice=String(sensor.deviceKey||'');
      row.dataset.tayuSensorPath=String(sensor.sourcePath||'');

      let cell=row.querySelector('[data-tayu-sensor-action-cell]');
      if(!cell){
        cell=document.createElement('td');
        cell.dataset.tayuSensorActionCell='1';
        cell.className='tayu-sensor-action-cell';
        row.appendChild(cell);
      }
      cell.replaceChildren();
      const button=document.createElement('button');
      button.type='button';
      button.className='tayu-sensor-delete';
      button.textContent='×';
      button.title=`Quitar ${sensor.name||sensor.sourcePath} de Sensores y alertas`;
      button.setAttribute('aria-label',button.title);
      button.addEventListener('click',()=>window.deleteSensor?.(sensor.id));
      cell.appendChild(button);
    });
    syncSensorRows();
  }

  function requestAlarmRefresh(){
    const now=Date.now();
    if(now-lastAlarmRefreshAt<5000)return;
    lastAlarmRefreshAt=now;
    Promise.resolve(window.tayuLoadAlarmEvents?.()).catch(error=>console.warn('Actualizar alarmas:',error));
  }

  function syncSensorRows(){
    const view=document.getElementById('sensores');
    const table=document.getElementById('sensorTable');
    if(!table||(view&&!view.classList.contains('active')))return;
    let anyAlarm=false;

    sensors().filter(isVisibleSensor).forEach(sensor=>{
      const value=currentValue(sensor);
      if(value!==undefined)sensor.value=value;
      const evaluation=evaluate(sensor,value!==undefined?value:sensor.value);
      sensor.state=evaluation.state;
      const row=Array.from(table.querySelectorAll('tr[data-tayu-sensor-id]')).find(item=>item.dataset.tayuSensorId===String(sensor.id||''));
      if(row){
        if(row.cells[1])row.cells[1].innerHTML=`<b>${formatValue(sensor,value!==undefined?value:sensor.value)}</b>`;
        if(row.cells[5])row.cells[5].innerHTML=`<span class="${stateClass(evaluation.state)}">${evaluation.state}</span>`;
      }
      const previous=sensorStateCache.get(String(sensor.id));
      sensorStateCache.set(String(sensor.id),evaluation.state);
      if(evaluation.alarm){anyAlarm=true;if(previous!==evaluation.state)requestAlarmRefresh();}
    });
    if(anyAlarm)requestAlarmRefresh();
  }

  function flattenTelemetry(object,prefix='',out={}){
    if(!object||typeof object!=='object'||Array.isArray(object))return out;
    Object.entries(object).forEach(([key,value])=>{
      const path=prefix?`${prefix}.${key}`:key;
      if(value&&typeof value==='object'&&!Array.isArray(value)){
        flattenTelemetry(value,path,out);
      }else if(['number','boolean','string'].includes(typeof value)){
        out[path]=value;
      }
    });
    return out;
  }

  function inferCandidateType(value,profile,configured){
    const declared=String(profile?.type||configured?.type||'').toLowerCase();
    if(declared)return declared;
    if(typeof value==='boolean')return 'boolean';
    if(typeof value==='number'&&Number.isFinite(value))return 'number';
    const number=Number(value);
    if(value!==''&&Number.isFinite(number))return 'number';
    return typeof value||'string';
  }

  function sensorCandidates(asset){
    const deviceKey=assetKey(asset);
    if(!deviceKey)return [];
    const profileTelemetry=asObject(asset?.capabilities?.telemetry);
    const configuredSignals=asObject(asset?.configuration?.signals);
    const payload=latestPayload(deviceKey);
    const flatPayload=flattenTelemetry(payload);
    const paths=new Set([
      ...Object.keys(profileTelemetry),
      ...Object.keys(configuredSignals),
      ...Object.keys(flatPayload)
    ]);

    return [...paths]
      .filter(path=>path&&path!=='fw'&&!/^relay\d+$/i.test(path))
      .map(path=>{
        const profile=asObject(profileTelemetry[path]);
        const configured=asObject(configuredSignals[path]);
        const value=Object.prototype.hasOwnProperty.call(flatPayload,path)?flatPayload[path]:readPath(payload,path);
        const type=inferCandidateType(value,profile,configured);
        return {
          path,
          name:String(configured.name||profile.label||profile.name||path),
          unit:String(configured.unit??profile.unit??''),
          type,
          value,
          profileDefined:Object.prototype.hasOwnProperty.call(profileTelemetry,path),
          configured:Object.prototype.hasOwnProperty.call(configuredSignals,path),
          alertsDisabled:configured.alerts_disabled===true,
          min:configured.alarm_min??'',
          max:configured.alarm_max??''
        };
      })
      .sort((a,b)=>a.name.localeCompare(b.name,'es')||a.path.localeCompare(b.path,'es'));
  }

  function ensureAddSensorModal(){
    if(document.getElementById('tayuAddSensorModal'))return;
    const modal=document.createElement('div');
    modal.id='tayuAddSensorModal';
    modal.className='modal-backdrop';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML=`
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="tayuAddSensorTitle">
        <div class="modal-header">
          <div>
            <h3 id="tayuAddSensorTitle" style="margin:0">Agregar sensor</h3>
            <p class="hint" style="margin:6px 0 0">Selecciona el equipo y la variable que quieres mostrar en Sensores y umbrales.</p>
          </div>
          <button type="button" class="btn ghost" id="tayuAddSensorClose" aria-label="Cerrar">×</button>
        </div>

        <div class="tayu-add-sensor-grid">
          <div class="full">
            <label for="tayuAddSensorDevice">Equipo</label>
            <select id="tayuAddSensorDevice"></select>
          </div>
          <div class="full">
            <label for="tayuAddSensorVariable">Variable</label>
            <select id="tayuAddSensorVariable"></select>
          </div>
          <div>
            <label for="tayuAddSensorName">Nombre visible</label>
            <input id="tayuAddSensorName" type="text" placeholder="Ej: Oxígeno disuelto">
          </div>
          <div>
            <label for="tayuAddSensorUnit">Unidad</label>
            <input id="tayuAddSensorUnit" type="text" placeholder="Ej: mg/L">
          </div>
          <div>
            <label for="tayuAddSensorMin">Mínimo de alarma</label>
            <input id="tayuAddSensorMin" type="number" step="any" placeholder="Opcional">
          </div>
          <div>
            <label for="tayuAddSensorMax">Máximo de alarma</label>
            <input id="tayuAddSensorMax" type="number" step="any" placeholder="Opcional">
          </div>
        </div>

        <div class="tayu-add-sensor-source" id="tayuAddSensorSource">Selecciona una variable.</div>
        <div class="tayu-add-sensor-status" id="tayuAddSensorStatus"></div>

        <div class="tayu-add-sensor-actions">
          <button type="button" class="btn ghost" id="tayuAddSensorCancel">Cancelar</button>
          <button type="button" class="btn" id="tayuAddSensorSave">＋ Agregar sensor</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    document.getElementById('tayuAddSensorClose').addEventListener('click',closeAddSensorModal);
    document.getElementById('tayuAddSensorCancel').addEventListener('click',closeAddSensorModal);
    document.getElementById('tayuAddSensorDevice').addEventListener('change',()=>populateAddSensorVariables());
    document.getElementById('tayuAddSensorVariable').addEventListener('change',syncAddSensorMeta);
    document.getElementById('tayuAddSensorSave').addEventListener('click',saveAddSensorModal);
    modal.addEventListener('click',event=>{if(event.target===modal)closeAddSensorModal();});
  }

  function selectedAddSensorAsset(){
    const key=document.getElementById('tayuAddSensorDevice')?.value||'';
    return assets().find(asset=>assetKey(asset)===key)||null;
  }

  function selectedAddSensorCandidate(){
    const asset=selectedAddSensorAsset();
    const path=document.getElementById('tayuAddSensorVariable')?.value||'';
    return asset?sensorCandidates(asset).find(item=>item.path===path)||null:null;
  }

  function populateAddSensorDevices(preferred=''){
    const select=document.getElementById('tayuAddSensorDevice');
    if(!select)return;
    const list=assets().filter(asset=>assetKey(asset));
    const current=preferred||select.value;
    select.innerHTML=list.length
      ? list.map(asset=>`<option value="${escapeHtml(assetKey(asset))}">${escapeHtml(assetName(asset))} · ${escapeHtml(assetKey(asset))}</option>`).join('')
      : '<option value="">No hay dispositivos disponibles</option>';
    if(list.some(asset=>assetKey(asset)===current))select.value=current;
    populateAddSensorVariables();
  }

  function populateAddSensorVariables(preferred=''){
    const select=document.getElementById('tayuAddSensorVariable');
    if(!select)return;
    const asset=selectedAddSensorAsset();
    const list=asset?sensorCandidates(asset):[];
    const current=preferred||select.value;
    select.innerHTML=list.length
      ? list.map(item=>{
          const flags=[item.profileDefined?'perfil':'',item.configured?(item.alertsDisabled?'desactivado':'configurado'):''].filter(Boolean).join(' · ');
          return `<option value="${escapeHtml(item.path)}">${escapeHtml(item.name)}${item.unit?` (${escapeHtml(item.unit)})`:''}${flags?` · ${escapeHtml(flags)}`:''}</option>`;
        }).join('')
      : '<option value="">Sin variables disponibles en este equipo</option>';
    if(list.some(item=>item.path===current))select.value=current;
    syncAddSensorMeta();
  }

  function syncAddSensorMeta(){
    const candidate=selectedAddSensorCandidate();
    const name=document.getElementById('tayuAddSensorName');
    const unit=document.getElementById('tayuAddSensorUnit');
    const min=document.getElementById('tayuAddSensorMin');
    const max=document.getElementById('tayuAddSensorMax');
    const source=document.getElementById('tayuAddSensorSource');
    const save=document.getElementById('tayuAddSensorSave');
    if(!candidate){
      if(name)name.value='';if(unit)unit.value='';if(min)min.value='';if(max)max.value='';
      if(source)source.textContent='No hay una variable seleccionada.';
      if(save)save.disabled=true;
      return;
    }
    if(name)name.value=candidate.name||candidate.path;
    if(unit)unit.value=candidate.unit||'';
    if(min)min.value=candidate.min??'';
    if(max)max.value=candidate.max??'';
    if(source){
      const value=candidate.value===undefined||candidate.value===null?'Sin lectura todavía':String(candidate.value);
      source.innerHTML=`<b>Fuente:</b> <code>${escapeHtml(candidate.path)}</code><br><b>Tipo:</b> ${escapeHtml(candidate.type)} · <b>Valor actual:</b> ${escapeHtml(value)}`;
    }
    if(save){save.disabled=false;save.textContent=candidate.configured&&!candidate.alertsDisabled?'Guardar cambios':'＋ Agregar sensor';}
  }

  function openAddSensorModal(){
    installStyles();
    ensureAddSensorModal();
    const modal=document.getElementById('tayuAddSensorModal');
    const status=document.getElementById('tayuAddSensorStatus');
    if(status){status.className='tayu-add-sensor-status';status.textContent='';}
    populateAddSensorDevices();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
  }

  function closeAddSensorModal(){
    const modal=document.getElementById('tayuAddSensorModal');
    if(!modal)return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
  }

  async function saveAddSensorModal(){
    const asset=selectedAddSensorAsset();
    const candidate=selectedAddSensorCandidate();
    const status=document.getElementById('tayuAddSensorStatus');
    const button=document.getElementById('tayuAddSensorSave');
    if(!asset||!candidate){
      if(status){status.className='tayu-add-sensor-status error';status.textContent='Selecciona un equipo y una variable.';}
      return;
    }
    if(typeof window.__tayuApiPost!=='function'){
      if(status){status.className='tayu-add-sensor-status error';status.textContent='La API todavía no está disponible.';}
      return;
    }

    const name=document.getElementById('tayuAddSensorName')?.value?.trim()||candidate.name||candidate.path;
    const unit=document.getElementById('tayuAddSensorUnit')?.value?.trim()||'';
    const minValue=document.getElementById('tayuAddSensorMin')?.value??'';
    const maxValue=document.getElementById('tayuAddSensorMax')?.value??'';
    if(minValue!==''&&maxValue!==''&&Number(minValue)>Number(maxValue)){
      if(status){status.className='tayu-add-sensor-status error';status.textContent='El mínimo no puede ser mayor que el máximo.';}
      return;
    }

    const oldText=button?.textContent||'Agregar sensor';
    try{
      if(button){button.disabled=true;button.textContent='Guardando…';}
      if(status){status.className='tayu-add-sensor-status';status.textContent='Guardando configuración del sensor…';}

      let sourceAsset=asset;
      try{
        if(typeof window.__tayuApi==='function'){
          const remote=await window.__tayuApi('/devices');
          const fresh=Array.isArray(remote)?remote.find(item=>String(item?.device_key||item?.uuid||item?.id||'')===assetKey(asset)):null;
          if(fresh)sourceAsset={...asset,...fresh};
        }
      }catch(error){console.warn('Agregar sensor: usando configuración local',error);}

      const configuration=JSON.parse(JSON.stringify(sourceAsset?.configuration||{}));
      configuration.outputs=configuration.outputs||{};
      configuration.signals=configuration.signals||{};
      configuration.assets=Array.isArray(configuration.assets)?configuration.assets:[];

      const existing=asObject(configuration.signals[candidate.path]);
      configuration.signals[candidate.path]={
        enabled:true,
        name,
        unit,
        application:existing.application||'generic',
        alarm_min:minValue===''?null:Number(minValue),
        alarm_max:maxValue===''?null:Number(maxValue),
        alarm_equals:existing.alarm_equals??null,
        alarm_severity:existing.alarm_severity||'warning',
        ...existing,
        enabled:true,
        name,
        unit,
        alarm_min:minValue===''?null:Number(minValue),
        alarm_max:maxValue===''?null:Number(maxValue),
        alerts_disabled:false
      };

      await window.__tayuApiPost('/devices/configuration',{
        device_key:assetKey(asset),
        configuration
      });

      const local=assets().find(item=>assetKey(item)===assetKey(asset));
      if(local)local.configuration=configuration;
      if(status){status.className='tayu-add-sensor-status ok';status.textContent='Sensor agregado correctamente.';}
      await window.refreshRealData?.();
      window.refreshTayuProfileSensors?.();
      enhanceSensorTable();
      setTimeout(closeAddSensorModal,350);
    }catch(error){
      console.error('Agregar sensor:',error);
      if(status){status.className='tayu-add-sensor-status error';status.textContent=error?.message||'No se pudo agregar el sensor.';}
    }finally{
      if(button){button.disabled=false;button.textContent=oldText;}
    }
  }

  async function deleteSensor(id){
    const sensor=sensors().find(item=>String(item?.id||'')===String(id||''));
    if(!sensor?.deviceKey||!sensor?.sourcePath||typeof window.__tayuApiPost!=='function')return;
    const ok=confirm(`¿Quitar “${sensor.name||sensor.sourcePath}” de Sensores y alertas?\n\nLa telemetría y sus gráficas NO se eliminarán. Solo dejará de aparecer en esta sección y se desactivarán sus alertas.`);
    if(!ok)return;

    try{
      let sourceAsset=assetFor(sensor);
      try{
        if(typeof window.__tayuApi==='function'){
          const remote=await window.__tayuApi('/devices');
          const fresh=Array.isArray(remote)?remote.find(item=>String(item?.device_key||'')===String(sensor.deviceKey)):null;
          if(fresh?.configuration)sourceAsset={...sourceAsset,configuration:fresh.configuration};
        }
      }catch(error){console.warn('Usando configuración local para quitar sensor:',error);}

      const cfg=JSON.parse(JSON.stringify(sourceAsset?.configuration||{}));
      cfg.outputs=cfg.outputs||{};cfg.signals=cfg.signals||{};cfg.assets=Array.isArray(cfg.assets)?cfg.assets:[];
      const meta=cfg.signals[sensor.sourcePath]||{enabled:true,name:sensor.name||sensor.sourcePath,unit:sensor.unit||'',application:'generic',alarm_severity:'warning'};
      meta.enabled=meta.enabled!==false;
      meta.alarm_min=null;meta.alarm_max=null;meta.alarm_equals=null;meta.alerts_disabled=true;
      cfg.signals[sensor.sourcePath]=meta;

      await window.__tayuApiPost('/devices/configuration',{device_key:sensor.deviceKey,configuration:cfg});
      const local=assetFor(sensor);if(local)local.configuration=cfg;
      sensorStateCache.delete(String(sensor.id));
      await window.refreshRealData?.();
      enhanceSensorTable();
    }catch(error){
      console.error('Quitar sensor/alerta:',error);
      alert(`No se pudo quitar el sensor de alertas: ${error?.message||error}`);
    }
  }

  function polishModbusDeleteButtons(){
    document.querySelectorAll('#modbus [data-mb-delete]').forEach(button=>{
      button.textContent='×';button.title='Eliminar parámetro Modbus';button.setAttribute('aria-label','Eliminar parámetro Modbus');
    });
  }

  function wrap(name,after){
    const original=window[name];
    if(typeof original!=='function'||original.__tayuSensorAlertWrapped)return;
    const wrapped=function(...args){
      const result=original.apply(this,args);
      if(result&&typeof result.then==='function')return result.finally(()=>setTimeout(after,0));
      setTimeout(after,0);return result;
    };
    wrapped.__tayuSensorAlertWrapped=true;
    window[name]=wrapped;
  }

  function install(){
    installStyles();
    ensureAddSensorModal();

    const originalRender=window.renderSensorTable;
    if(typeof originalRender==='function'&&!originalRender.__tayuSensorAlertWrapped){
      const wrapped=function(...args){
        const result=originalRender.apply(this,args);
        enhanceSensorTable();
        return result;
      };
      wrapped.__tayuSensorAlertWrapped=true;
      window.renderSensorTable=wrapped;
    }

    const originalUpdate=window.updateSensor;
    if(typeof originalUpdate==='function'&&!originalUpdate.__tayuSensorAlertWrapped){
      const wrappedUpdate=async function(...args){
        const result=await originalUpdate.apply(this,args);
        enhanceSensorTable();
        setTimeout(()=>{syncSensorRows();window.tayuLoadAlarmEvents?.();},1200);
        return result;
      };
      wrappedUpdate.__tayuSensorAlertWrapped=true;
      window.updateSensor=wrappedUpdate;
    }

    const originalRefresh=window.refreshRealData;
    if(typeof originalRefresh==='function'&&!originalRefresh.__tayuSensorAlertWrapped){
      const wrappedRefresh=async function(...args){
        const result=await originalRefresh.apply(this,args);
        setTimeout(enhanceSensorTable,0);
        return result;
      };
      wrappedRefresh.__tayuSensorAlertWrapped=true;
      window.refreshRealData=wrappedRefresh;
    }

    // Sustituye definitivamente el flujo antiguo basado en prompt().
    window.addSensor=openAddSensorModal;
    window.openAddSensorModal=openAddSensorModal;
    window.closeAddSensorModal=closeAddSensorModal;

    window.deleteSensor=deleteSensor;
    wrap('addModbusParamRow',polishModbusDeleteButtons);
    wrap('onModbusDeviceChanged',polishModbusDeleteButtons);
    wrap('saveModbusConfigFromPlatform',polishModbusDeleteButtons);

    enhanceSensorTable();
    polishModbusDeleteButtons();
    setTimeout(()=>{enhanceSensorTable();polishModbusDeleteButtons();},350);
    setTimeout(()=>{enhanceSensorTable();polishModbusDeleteButtons();window.addSensor=openAddSensorModal;},1000);
    clearInterval(liveTimer);liveTimer=setInterval(syncSensorRows,1000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();