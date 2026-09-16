/* TAYULABS Cloud - Sensores: perfiles, CSV y graficas genericas
 * Fuente de definicion preferida: device.capabilities.telemetry.
 * Compatibilidad: device.configuration.signals.
 * Historico: GET /telemetry/history y GET /telemetry/export.csv.
 * Dashboard: reutiliza el motor signalChart ya existente en cloud-client-app.html.
 */
(function(){
  'use strict';

  const API_BASE='https://api.tayulabs.com';
  let selectedSensor=null;
  let previewChart=null;
  let previewTimer=null;
  let previewRequestId=0;

  function escapeHtml(value){
    return String(value??'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function safeFilePart(value){
    return String(value||'telemetria')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-zA-Z0-9_-]+/g,'-')
      .replace(/^-+|-+$/g,'')
      .slice(0,80)||'telemetria';
  }

  function localInputValue(date){
    const d=new Date(date.getTime()-date.getTimezoneOffset()*60000);
    return d.toISOString().slice(0,16);
  }

  function readPath(obj,path){
    return String(path||'').split('.').filter(Boolean).reduce((acc,key)=>acc==null?undefined:acc[key],obj);
  }

  function realDevices(){
    return Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[];
  }

  function latestRows(){
    return Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[];
  }

  function latestPayloadMap(){
    const map=new Map();
    latestRows().forEach(row=>{
      const key=String(row?.device_key||'');
      if(!key)return;
      const when=new Date(row?.time||0).getTime();
      const prev=map.get(key);
      if(!prev||when>prev.when)map.set(key,{when,payload:row?.payload&&typeof row.payload==='object'?row.payload:{}});
    });
    return map;
  }

  function asObject(value){
    return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  }

  function sensorState(value,min,max){
    const n=Number(value);
    if(!Number.isFinite(n))return 'Sin datos';
    if(min!==null&&min!==undefined&&min!==''&&n<Number(min))return 'Bajo';
    if(max!==null&&max!==undefined&&max!==''&&n>Number(max))return 'Alto';
    return 'Normal';
  }

  function profileSensors(){
    const payloads=latestPayloadMap();
    const out=[];

    realDevices().forEach(device=>{
      const deviceKey=String(device?.device_key||device?.uuid||device?.id||'');
      if(!deviceKey)return;

      const capabilities=asObject(device?.capabilities);
      const profileTelemetry=asObject(capabilities.telemetry);
      const configuration=asObject(device?.configuration);
      const configuredSignals=asObject(configuration.signals);
      const paths=new Set([...Object.keys(profileTelemetry),...Object.keys(configuredSignals)]);
      const payload=payloads.get(deviceKey)?.payload||{};

      paths.forEach(path=>{
        const profile=asObject(profileTelemetry[path]);
        const configured=asObject(configuredSignals[path]);
        if(configured.enabled===false)return;

        const value=readPath(payload,path);
        const numeric=Number(value);
        const type=String(profile.type||configured.type||(Number.isFinite(numeric)?'number':typeof value)||'').toLowerCase();
        const name=String(configured.name||profile.label||profile.name||path);
        const unit=String(configured.unit??profile.unit??'');
        const min=configured.alarm_min??null;
        const max=configured.alarm_max??null;
        const decimals=Number.isFinite(Number(profile.decimals))?Math.max(0,Math.min(8,Number(profile.decimals))):null;
        const chartAllowed=profile.chart!==false && type==='number';
        const technical=profile.technical===true;
        const farm=device?.farm||device?.site_name||device?.organization_name||'';
        const zone=device?.zone||device?.sector||'';
        const location=[farm,zone].filter(Boolean).join(' · ');

        out.push({
          id:`${deviceKey}:${path}`,
          deviceKey,
          deviceName:String(device?.name||deviceKey),
          sourcePath:path,
          name,
          unit,
          value:Number.isFinite(numeric)?numeric:value,
          min,
          max,
          decimals,
          chart:chartAllowed,
          technical,
          type,
          location,
          state:sensorState(value,min,max),
          profileDefined:Object.prototype.hasOwnProperty.call(profileTelemetry,path),
          configured:Object.prototype.hasOwnProperty.call(configuredSignals,path)
        });
      });
    });

    return out.sort((a,b)=>{
      const d=a.deviceName.localeCompare(b.deviceName,'es');
      return d||a.name.localeCompare(b.name,'es');
    });
  }

  function formatSensorValue(sensor){
    const n=Number(sensor?.value);
    if(!Number.isFinite(n))return sensor?.value===true?'1':sensor?.value===false?'0':'—';
    if(Number.isFinite(sensor?.decimals))return n.toLocaleString('es-EC',{minimumFractionDigits:sensor.decimals,maximumFractionDigits:sensor.decimals});
    return n.toLocaleString('es-EC',{maximumFractionDigits:4});
  }

  function chartableSensors(){
    return profileSensors().filter(sensor=>sensor.chart===true);
  }

  function sensorById(id){
    return profileSensors().find(sensor=>sensor.id===id)||null;
  }

  function injectStyles(){
    if(document.getElementById('tayuSensorEnhancementStyles'))return;
    const style=document.createElement('style');
    style.id='tayuSensorEnhancementStyles';
    style.textContent=`
      .tayu-sensor-action{text-align:center!important;width:76px}
      .tayu-sensor-icon-btn{
        width:34px;height:34px;padding:0!important;border-radius:11px!important;
        display:inline-grid;place-items:center;font-size:17px;line-height:1;
        background:var(--panel2)!important;color:var(--text)!important;
        border:1px solid var(--border)!important;cursor:pointer;
      }
      .tayu-sensor-icon-btn:hover{border-color:var(--brand)!important;color:var(--brand)!important}
      .tayu-sensor-icon-btn:disabled{opacity:.35;cursor:not-allowed}
      .tayu-sensor-tech{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:11px;font-weight:800;margin-top:4px}
      .tayu-sensor-source{font-size:11px}
      .tayu-sensor-table-empty{text-align:center!important;color:var(--muted);padding:20px!important}

      #tayuSensorCsvModal .modal-card{width:min(590px,100%)}
      .tayu-csv-info{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:4px 0 14px}
      .tayu-csv-info>div{background:var(--panel2);border:1px solid var(--border);border-radius:14px;padding:11px 12px;min-width:0}
      .tayu-csv-info span{display:block;color:var(--muted);font-size:11px;font-weight:850;margin-bottom:4px}
      .tayu-csv-info b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
      .tayu-csv-custom{display:none;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
      .tayu-csv-custom.open{display:grid}
      .tayu-csv-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;flex-wrap:wrap}
      .tayu-csv-status{min-height:20px;margin-top:10px;font-size:12px;color:var(--muted);font-weight:750}
      .tayu-csv-status.error{display:block;color:var(--danger)}
      .tayu-csv-note{font-size:12px;color:var(--muted);line-height:1.45;margin:10px 0 0}

      #tayuSensorChartBuilder{margin-top:18px}
      #tayuSensorChartBuilder .tayu-sensor-chart-status{min-height:20px;margin-top:10px;color:var(--muted);font-size:12px;font-weight:800}
      #tayuSensorChartBuilder .tayu-sensor-chart-status.ok{color:var(--brand)}
      #tayuSensorChartBuilder .tayu-sensor-chart-status.error{display:block;color:var(--danger)}
      #tayuSensorChartBuilder .tayu-sensor-chart-empty{padding:18px;border:1px dashed var(--border);border-radius:16px;color:var(--muted);text-align:center}
      #tayuSensorChartBuilder .modbus-chart-box{min-height:260px}
      @media(max-width:600px){
        .tayu-csv-info,.tayu-csv-custom.open{grid-template-columns:1fr}
        .tayu-csv-actions{display:grid;grid-template-columns:1fr;width:100%}
        .tayu-csv-actions .btn{width:100%}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureModal(){
    if(document.getElementById('tayuSensorCsvModal'))return;
    const modal=document.createElement('div');
    modal.id='tayuSensorCsvModal';
    modal.className='modal-backdrop';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML=`
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="tayuCsvTitle">
        <div class="modal-header">
          <div>
            <h3 id="tayuCsvTitle" style="margin:0">Descargar historial CSV</h3>
            <p class="hint" style="margin:6px 0 0">Exporta el historial real almacenado en la plataforma.</p>
          </div>
          <button type="button" class="btn ghost" id="tayuCsvClose" aria-label="Cerrar">×</button>
        </div>
        <div class="tayu-csv-info">
          <div><span>Variable</span><b id="tayuCsvVariable">—</b></div>
          <div><span>Equipo</span><b id="tayuCsvDevice">—</b></div>
          <div><span>Unidad</span><b id="tayuCsvUnit">—</b></div>
          <div><span>Fuente</span><b id="tayuCsvSource">—</b></div>
        </div>
        <label for="tayuCsvPeriod">Periodo</label>
        <select id="tayuCsvPeriod">
          <option value="24h">Últimas 24 horas</option>
          <option value="7d">Últimos 7 días</option>
          <option value="30d">Últimos 30 días</option>
          <option value="custom">Personalizado</option>
          <option value="all">Todo disponible</option>
        </select>
        <div class="tayu-csv-custom" id="tayuCsvCustom">
          <div><label for="tayuCsvFrom">Desde</label><input id="tayuCsvFrom" type="datetime-local"></div>
          <div><label for="tayuCsvTo">Hasta</label><input id="tayuCsvTo" type="datetime-local"></div>
        </div>
        <p class="tayu-csv-note" id="tayuCsvNote">La fecha y hora se exportan en formato ISO para conservar el instante exacto de cada muestra.</p>
        <div class="tayu-csv-status" id="tayuCsvStatus"></div>
        <div class="tayu-csv-actions">
          <button type="button" class="btn ghost" id="tayuCsvCancel">Cancelar</button>
          <button type="button" class="btn" id="tayuCsvDownload">↓ Descargar CSV</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const close=()=>closeModal();
    document.getElementById('tayuCsvClose').addEventListener('click',close);
    document.getElementById('tayuCsvCancel').addEventListener('click',close);
    document.getElementById('tayuCsvDownload').addEventListener('click',downloadSelectedSensorCsv);
    document.getElementById('tayuCsvPeriod').addEventListener('change',updatePeriodUi);
    modal.addEventListener('click',event=>{if(event.target===modal)closeModal();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal.classList.contains('open'))closeModal();});
  }

  function updatePeriodUi(){
    const period=document.getElementById('tayuCsvPeriod')?.value||'24h';
    const custom=document.getElementById('tayuCsvCustom');
    const note=document.getElementById('tayuCsvNote');
    custom?.classList.toggle('open',period==='custom');
    if(note){
      note.textContent=period==='all'
        ? 'Se exportará todo el historial disponible de esta variable. La preparación puede tardar si existen muchas muestras.'
        : 'La fecha y hora se exportan en formato ISO para conservar el instante exacto de cada muestra.';
    }
  }

  function openModal(sensor){
    if(!sensor?.deviceKey||!sensor?.sourcePath)return;
    ensureModal();
    selectedSensor=sensor;
    document.getElementById('tayuCsvVariable').textContent=sensor.name||sensor.sourcePath;
    document.getElementById('tayuCsvDevice').textContent=`${sensor.deviceName||sensor.deviceKey} · ${sensor.deviceKey}`;
    document.getElementById('tayuCsvUnit').textContent=sensor.unit||'Sin unidad';
    document.getElementById('tayuCsvSource').textContent=sensor.sourcePath;
    document.getElementById('tayuCsvStatus').textContent='';
    document.getElementById('tayuCsvStatus').classList.remove('error');
    document.getElementById('tayuCsvPeriod').value='24h';

    const now=new Date();
    document.getElementById('tayuCsvTo').value=localInputValue(now);
    document.getElementById('tayuCsvFrom').value=localInputValue(new Date(now.getTime()-24*60*60*1000));
    updatePeriodUi();

    const modal=document.getElementById('tayuSensorCsvModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
  }

  function closeModal(){
    const modal=document.getElementById('tayuSensorCsvModal');
    if(!modal)return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    selectedSensor=null;
  }

  function periodDates(period){
    const now=new Date();
    if(period==='all')return {from:null,to:null,label:'todo'};
    if(period==='custom'){
      const fromValue=document.getElementById('tayuCsvFrom')?.value||'';
      const toValue=document.getElementById('tayuCsvTo')?.value||'';
      const from=new Date(fromValue);
      const to=new Date(toValue);
      if(!fromValue||!toValue||Number.isNaN(from.getTime())||Number.isNaN(to.getTime()))throw new Error('Selecciona una fecha inicial y una fecha final válidas.');
      if(from>=to)throw new Error('La fecha inicial debe ser anterior a la fecha final.');
      return {from,to,label:'personalizado'};
    }
    const hours=period==='7d'?24*7:period==='30d'?24*30:24;
    return {from:new Date(now.getTime()-hours*60*60*1000),to:now,label:period};
  }

  async function downloadSelectedSensorCsv(){
    const sensor=selectedSensor;
    if(!sensor?.deviceKey||!sensor?.sourcePath)return;
    const status=document.getElementById('tayuCsvStatus');
    const button=document.getElementById('tayuCsvDownload');
    const oldText=button.textContent;

    try{
      status.classList.remove('error');
      status.textContent='Preparando archivo…';
      button.disabled=true;
      button.textContent='Preparando…';

      const kc=window.__tayuEntryKeycloak;
      if(!kc?.authenticated)throw new Error('La sesión no está disponible. Recarga la plataforma e intenta nuevamente.');
      await kc.updateToken(30);

      const range=periodDates(document.getElementById('tayuCsvPeriod')?.value||'24h');
      const params=new URLSearchParams({device_key:sensor.deviceKey,source_path:sensor.sourcePath});
      if(range.from&&range.to){params.set('from',range.from.toISOString());params.set('to',range.to.toISOString());}

      const response=await fetch(`${API_BASE}/telemetry/export.csv?${params.toString()}`,{headers:{Authorization:`Bearer ${kc.token}`}});
      if(!response.ok){
        let message=`No se pudo generar el CSV (HTTP ${response.status}).`;
        try{const data=await response.json();if(data?.error)message=data.error;}catch(_){}
        throw new Error(message);
      }

      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download=`${safeFilePart(sensor.deviceKey)}-${safeFilePart(sensor.name||sensor.sourcePath)}-${range.label}.csv`;
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
      status.textContent=`CSV listo · ${(blob.size/1024).toFixed(blob.size>=1024?1:0)} KB`;
    }catch(error){
      console.error('TAYULABS sensor CSV:',error);
      status.classList.add('error');
      status.textContent=error?.message||'No se pudo descargar el historial.';
    }finally{
      button.disabled=false;
      button.textContent=oldText;
    }
  }

  async function updateProfileSensorThreshold(sensor,key,value){
    const device=realDevices().find(item=>String(item?.device_key||item?.uuid||item?.id||'')===sensor.deviceKey);
    if(!device||!window.__tayuApiPost)return;
    const configuration=JSON.parse(JSON.stringify(asObject(device.configuration)));
    configuration.outputs=asObject(configuration.outputs);
    configuration.signals=asObject(configuration.signals);
    configuration.assets=Array.isArray(configuration.assets)?configuration.assets:[];
    const existing=asObject(configuration.signals[sensor.sourcePath]);
    const meta={
      enabled:existing.enabled!==false,
      name:existing.name||sensor.name,
      unit:existing.unit??sensor.unit??'',
      application:existing.application||'generic',
      alarm_severity:existing.alarm_severity||'warning',
      ...existing
    };
    meta[key==='min'?'alarm_min':'alarm_max']=value===''?null:Number(value);
    configuration.signals[sensor.sourcePath]=meta;
    await window.__tayuApiPost('/devices/configuration',{device_key:sensor.deviceKey,configuration});
    await window.refreshRealData?.();
  }

  function renderSensorTable(){
    const table=document.getElementById('sensorTable');
    if(!table)return;
    const list=profileSensors();
    if(!list.length)return;

    table.innerHTML=`<tr>
      <th>Sensor</th><th>Valor</th><th>Equipo</th><th>Mínimo</th><th>Máximo</th><th>Estado</th><th>Fuente</th>
      <th class="tayu-sensor-action">Gráfica</th><th class="tayu-sensor-action">CSV</th>
    </tr>`+list.map(sensor=>{
      const value=formatSensorValue(sensor);
      const statusClass=sensor.state==='Normal'?'status':sensor.state==='Sin datos'?'status off':'status warn';
      return `<tr data-tayu-sensor-id="${escapeHtml(sensor.id)}">
        <td><b>${escapeHtml(sensor.name)}</b>${sensor.technical?'<span class="tayu-sensor-tech">Dato técnico</span>':''}</td>
        <td><b>${escapeHtml(value)}${sensor.unit?` ${escapeHtml(sensor.unit)}`:''}</b></td>
        <td>${escapeHtml(sensor.deviceName)}<br><small class="hint">${escapeHtml(sensor.deviceKey)}</small></td>
        <td><input class="small-input" type="number" step="any" value="${sensor.min??''}" data-sensor-threshold="min" data-sensor-id="${escapeHtml(sensor.id)}"></td>
        <td><input class="small-input" type="number" step="any" value="${sensor.max??''}" data-sensor-threshold="max" data-sensor-id="${escapeHtml(sensor.id)}"></td>
        <td><span class="${statusClass}">${escapeHtml(sensor.state)}</span></td>
        <td><code class="tayu-sensor-source">${escapeHtml(sensor.sourcePath)}</code></td>
        <td class="tayu-sensor-action"><button type="button" class="tayu-sensor-icon-btn" data-sensor-chart="${escapeHtml(sensor.id)}" ${sensor.chart?'':'disabled'} title="${sensor.chart?'Configurar gráfica':'Esta variable está marcada con chart:false en el perfil'}">📈</button></td>
        <td class="tayu-sensor-action"><button type="button" class="tayu-sensor-icon-btn" data-sensor-csv="${escapeHtml(sensor.id)}" title="Descargar historial CSV">↓</button></td>
      </tr>`;
    }).join('');
  }

  function ensureChartBuilder(){
    const section=document.getElementById('sensores');
    if(!section||document.getElementById('tayuSensorChartBuilder'))return;
    const card=document.createElement('div');
    card.id='tayuSensorChartBuilder';
    card.className='card';
    card.innerHTML=`
      <div class="chart-steps">
        <div class="chart-step"><b>1. Equipo</b><span class="hint">Selecciona el equipo que está enviando la telemetría.</span></div>
        <div class="chart-step"><b>2. Variable</b><span class="hint">Solo aparecen variables numéricas habilitadas con chart: true.</span></div>
        <div class="chart-step"><b>3. Dashboard</b><span class="hint">La gráfica se guarda como widget movible, igual que Modbus.</span></div>
      </div>
      <div class="module-header" style="margin-top:16px">
        <div><h3 style="margin:0">📈 Gráficas de sensores</h3><p class="hint">Configura periodo, tipo, detalle y rango del eje Y.</p></div>
        <button type="button" class="btn" id="tayuSensorChartAdd">＋ Agregar gráfica al dashboard</button>
      </div>
      <div class="modbus-builder" id="tayuSensorChartForm">
        <div><label>Equipo</label><select id="tayuSensorChartDevice"></select></div>
        <div><label>Variable</label><select id="tayuSensorChartVariable"></select></div>
        <div><label>Tipo</label><select id="tayuSensorChartType"><option value="line">Línea</option><option value="bar">Barras</option></select></div>
        <div><label>Ventana eje X</label><select id="tayuSensorChartPeriod"><option value="0.5">30 segundos</option><option value="1">1 minuto</option><option value="5" selected>5 minutos</option><option value="15">15 minutos</option><option value="60">1 hora</option><option value="1440">24 horas</option></select></div>
        <div><label>Detalle de la gráfica</label><select id="tayuSensorChartPoints"><option value="20">20 puntos</option><option value="50" selected>50 puntos</option><option value="100">100 puntos</option><option value="200">200 puntos</option><option value="400">400 puntos</option></select></div>
        <div><label>Mínimo eje Y</label><input id="tayuSensorChartMin" type="number" step="any" placeholder="Automático"></div>
        <div><label>Máximo eje Y</label><input id="tayuSensorChartMax" type="number" step="any" placeholder="Automático"></div>
        <div class="full"><label>Título</label><input id="tayuSensorChartTitle" placeholder="Ej: Oxígeno disuelto · Piscina 10"></div>
      </div>
      <div class="modbus-chart-box" style="margin-top:16px"><canvas id="tayuSensorChartPreview"></canvas></div>
      <div class="tayu-sensor-chart-status" id="tayuSensorChartStatus"></div>`;
    section.appendChild(card);

    document.getElementById('tayuSensorChartDevice').addEventListener('change',()=>{refreshVariableSelect();loadExistingChartConfig();schedulePreview();});
    document.getElementById('tayuSensorChartVariable').addEventListener('change',()=>{loadExistingChartConfig();schedulePreview();});
    ['tayuSensorChartType','tayuSensorChartPeriod','tayuSensorChartPoints','tayuSensorChartMin','tayuSensorChartMax','tayuSensorChartTitle'].forEach(id=>{
      const el=document.getElementById(id);el?.addEventListener(id.includes('Title')||id.includes('Min')||id.includes('Max')?'input':'change',schedulePreview);
    });
    document.getElementById('tayuSensorChartAdd').addEventListener('click',saveChartToDashboard);
  }

  function chartDevices(){
    const map=new Map();
    chartableSensors().forEach(sensor=>{
      if(!map.has(sensor.deviceKey))map.set(sensor.deviceKey,{deviceKey:sensor.deviceKey,deviceName:sensor.deviceName});
    });
    return [...map.values()].sort((a,b)=>a.deviceName.localeCompare(b.deviceName,'es'));
  }

  function refreshDeviceSelect(preferred){
    ensureChartBuilder();
    const select=document.getElementById('tayuSensorChartDevice');
    if(!select)return;
    const devices=chartDevices();
    const current=preferred||select.value;
    select.innerHTML=devices.length
      ? devices.map(item=>`<option value="${escapeHtml(item.deviceKey)}">${escapeHtml(item.deviceName)} · ${escapeHtml(item.deviceKey)}</option>`).join('')
      : '<option value="">No hay sensores graficables</option>';
    if(devices.some(item=>item.deviceKey===current))select.value=current;
    refreshVariableSelect();
  }

  function refreshVariableSelect(preferred){
    const deviceKey=document.getElementById('tayuSensorChartDevice')?.value||'';
    const select=document.getElementById('tayuSensorChartVariable');
    if(!select)return;
    const sensors=chartableSensors().filter(sensor=>sensor.deviceKey===deviceKey);
    const current=preferred||select.value;
    select.innerHTML=sensors.length
      ? sensors.map(sensor=>`<option value="${escapeHtml(sensor.sourcePath)}">${escapeHtml(sensor.name)}${sensor.unit?` (${escapeHtml(sensor.unit)})`:''}</option>`).join('')
      : '<option value="">Sin variables graficables</option>';
    if(sensors.some(sensor=>sensor.sourcePath===current))select.value=current;
  }

  function selectedChartSensor(){
    const deviceKey=document.getElementById('tayuSensorChartDevice')?.value||'';
    const path=document.getElementById('tayuSensorChartVariable')?.value||'';
    return chartableSensors().find(sensor=>sensor.deviceKey===deviceKey&&sensor.sourcePath===path)||null;
  }

  function signalConfigs(){
    return window.tayuSignalChartConfigs&&typeof window.tayuSignalChartConfigs==='object'?window.tayuSignalChartConfigs:{};
  }

  function findExistingChart(deviceKey,path){
    const layouts=Array.isArray(window.dashboardWidgetIds)?window.dashboardWidgetIds:[];
    const configs=signalConfigs();
    return Object.keys(configs).find(id=>layouts.includes(id)&&configs[id]?.deviceKey===deviceKey&&configs[id]?.path===path)||null;
  }

  function loadExistingChartConfig(){
    const sensor=selectedChartSensor();
    if(!sensor)return;
    const id=findExistingChart(sensor.deviceKey,sensor.sourcePath);
    const cfg=id?signalConfigs()[id]:null;
    const set=(field,value)=>{const el=document.getElementById(field);if(el)el.value=value??'';};
    set('tayuSensorChartType',cfg?.type||'line');
    set('tayuSensorChartPeriod',cfg?.period??5);
    set('tayuSensorChartPoints',cfg?.points??50);
    set('tayuSensorChartMin',cfg?.min??'');
    set('tayuSensorChartMax',cfg?.max??'');
    set('tayuSensorChartTitle',cfg?.title||`${sensor.name} · ${sensor.deviceName}`);
    const button=document.getElementById('tayuSensorChartAdd');
    if(button)button.textContent=id?'Actualizar gráfica del dashboard':'＋ Agregar gráfica al dashboard';
    const status=document.getElementById('tayuSensorChartStatus');
    if(status){status.className='tayu-sensor-chart-status';status.textContent=id?'Esta variable ya tiene una gráfica en el dashboard. Los cambios actualizarán ese mismo widget.':'';}
  }

  function chartFormConfig(){
    const sensor=selectedChartSensor();
    if(!sensor)return null;
    return {
      deviceKey:sensor.deviceKey,
      path:sensor.sourcePath,
      title:document.getElementById('tayuSensorChartTitle')?.value||`${sensor.name} · ${sensor.deviceName}`,
      unit:sensor.unit||'',
      period:Number(document.getElementById('tayuSensorChartPeriod')?.value||5),
      type:document.getElementById('tayuSensorChartType')?.value||'line',
      points:Math.max(20,Math.min(400,Number(document.getElementById('tayuSensorChartPoints')?.value||50))),
      min:document.getElementById('tayuSensorChartMin')?.value??'',
      max:document.getElementById('tayuSensorChartMax')?.value??''
    };
  }

  function samplePoints(points,maxPoints){
    if(points.length<=maxPoints)return points;
    const out=[];
    const step=(points.length-1)/(maxPoints-1);
    for(let i=0;i<maxPoints;i++)out.push(points[Math.round(i*step)]);
    return out;
  }

  function axisBound(value){
    if(value===''||value===null||value===undefined)return undefined;
    const n=Number(value);return Number.isFinite(n)?n:undefined;
  }

  function schedulePreview(){
    clearTimeout(previewTimer);
    previewTimer=setTimeout(updatePreview,180);
  }

  async function updatePreview(){
    const cfg=chartFormConfig();
    const canvas=document.getElementById('tayuSensorChartPreview');
    if(!cfg||!canvas||typeof Chart==='undefined')return;
    const requestId=++previewRequestId;
    const status=document.getElementById('tayuSensorChartStatus');

    try{
      const now=new Date();
      const from=new Date(now.getTime()-Math.max(.5,cfg.period)*60*1000);
      const rows=window.__tayuApi?await window.__tayuApi(`/telemetry/history?device_key=${encodeURIComponent(cfg.deviceKey)}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(now.toISOString())}`):[];
      if(requestId!==previewRequestId)return;
      let points=(Array.isArray(rows)?rows:[]).map(row=>({t:new Date(row.time),v:Number(readPath(row.payload,cfg.path))})).filter(point=>Number.isFinite(point.v)&&!Number.isNaN(point.t.getTime()));
      points=samplePoints(points,cfg.points);
      const data=points.map(point=>({x:point.t.getTime(),y:point.v}));
      const theme=typeof window.tayuChartTheme==='function'?window.tayuChartTheme():{text:'#667085',grid:'rgba(17,24,39,.10)',border:'rgba(17,24,39,.18)'};
      const datasetLabel=`${cfg.title}${cfg.unit?` (${cfg.unit})`:''}`;

      if(previewChart)previewChart.destroy();
      previewChart=new Chart(canvas,{
        type:cfg.type,
        data:{datasets:[{label:datasetLabel,data,tension:.3}]},
        options:{
          parsing:false,responsive:true,maintainAspectRatio:false,animation:false,
          plugins:{legend:{labels:{color:theme.text}},tooltip:{callbacks:{title:items=>{const x=items?.[0]?.parsed?.x;return Number.isFinite(x)?new Date(x).toLocaleString('es-EC'):'';}}}},
          scales:{
            x:{type:'linear',min:from.getTime(),max:now.getTime(),ticks:{maxTicksLimit:8,color:theme.text,callback:value=>new Date(Number(value)).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit',second:'2-digit'})},grid:{color:theme.grid},border:{color:theme.border}},
            y:{min:axisBound(cfg.min),max:axisBound(cfg.max),ticks:{color:theme.text},grid:{color:theme.grid},border:{color:theme.border}}
          }
        }
      });
      if(status&&!findExistingChart(cfg.deviceKey,cfg.path)){
        status.className='tayu-sensor-chart-status';
        status.textContent=points.length?`${points.length} puntos cargados en la vista previa.`:'Todavía no hay muestras históricas para esta variable.';
      }
    }catch(error){
      console.warn('Vista previa de sensor:',error);
      if(status){status.className='tayu-sensor-chart-status error';status.textContent=`No se pudo cargar la vista previa: ${error?.message||error}`;}
    }
  }

  async function saveChartToDashboard(){
    const cfg=chartFormConfig();
    const status=document.getElementById('tayuSensorChartStatus');
    if(!cfg||!window.newWidgetInstance||!Array.isArray(window.dashboardWidgetIds)){
      if(status){status.className='tayu-sensor-chart-status error';status.textContent='El motor de widgets todavía no está disponible.';}
      return;
    }

    try{
      const configs=signalConfigs();
      let widgetId=findExistingChart(cfg.deviceKey,cfg.path);
      const existed=Boolean(widgetId);
      if(!widgetId){
        widgetId=window.newWidgetInstance('signalChart');
        window.dashboardWidgetIds.push(widgetId);
      }
      configs[widgetId]=cfg;
      window.tayuSignalChartConfigs=configs;
      await window.saveDashboardCloud?.();
      window.renderDashboardWidgets?.();
      window.renderWidgetLibrary?.();
      if(status){status.className='tayu-sensor-chart-status ok';status.textContent=existed?'Gráfica actualizada en el dashboard.':'Gráfica agregada al dashboard.';}
      const button=document.getElementById('tayuSensorChartAdd');
      if(button)button.textContent='Actualizar gráfica del dashboard';
    }catch(error){
      console.error('Guardar gráfica de sensor:',error);
      if(status){status.className='tayu-sensor-chart-status error';status.textContent=`No se pudo guardar la gráfica: ${error?.message||error}`;}
    }
  }

  function selectSensorForChart(sensor){
    if(!sensor?.chart)return;
    ensureChartBuilder();
    refreshDeviceSelect(sensor.deviceKey);
    const deviceSelect=document.getElementById('tayuSensorChartDevice');
    if(deviceSelect)deviceSelect.value=sensor.deviceKey;
    refreshVariableSelect(sensor.sourcePath);
    const variableSelect=document.getElementById('tayuSensorChartVariable');
    if(variableSelect)variableSelect.value=sensor.sourcePath;
    loadExistingChartConfig();
    schedulePreview();
    document.getElementById('tayuSensorChartBuilder')?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function bindSensorTableActions(){
    const table=document.getElementById('sensorTable');
    if(!table||table.dataset.tayuSensorActions==='1')return;
    table.dataset.tayuSensorActions='1';
    table.addEventListener('click',event=>{
      const chartButton=event.target.closest('[data-sensor-chart]');
      if(chartButton){const sensor=sensorById(chartButton.dataset.sensorChart);if(sensor)selectSensorForChart(sensor);return;}
      const csvButton=event.target.closest('[data-sensor-csv]');
      if(csvButton){const sensor=sensorById(csvButton.dataset.sensorCsv);if(sensor)openModal(sensor);}
    });
    table.addEventListener('change',event=>{
      const input=event.target.closest('[data-sensor-threshold]');
      if(!input)return;
      const sensor=sensorById(input.dataset.sensorId);
      if(!sensor)return;
      input.disabled=true;
      updateProfileSensorThreshold(sensor,input.dataset.sensorThreshold,input.value).catch(error=>{
        console.error('Actualizar umbral de sensor:',error);
        alert(`No se pudo guardar el umbral: ${error?.message||error}`);
      }).finally(()=>{input.disabled=false;});
    });
  }

  function refreshSensorUi(){
    renderSensorTable();
    bindSensorTableActions();
    ensureChartBuilder();
    const selectedDevice=document.getElementById('tayuSensorChartDevice')?.value||'';
    const selectedVariable=document.getElementById('tayuSensorChartVariable')?.value||'';
    refreshDeviceSelect(selectedDevice);
    if(selectedVariable)refreshVariableSelect(selectedVariable);
    loadExistingChartConfig();
  }

  function install(){
    injectStyles();
    ensureModal();
    ensureChartBuilder();

    const originalRender=window.renderSensorTable;
    if(typeof originalRender==='function'&&!originalRender.__tayuProfileSensorsWrapped){
      const wrapped=function(){
        const result=originalRender.apply(this,arguments);
        refreshSensorUi();
        return result;
      };
      wrapped.__tayuProfileSensorsWrapped=true;
      window.renderSensorTable=wrapped;
    }

    const originalRefresh=window.refreshRealData;
    if(typeof originalRefresh==='function'&&!originalRefresh.__tayuProfileSensorsWrapped){
      const wrappedRefresh=async function(){
        const result=await originalRefresh.apply(this,arguments);
        refreshSensorUi();
        return result;
      };
      wrappedRefresh.__tayuProfileSensorsWrapped=true;
      window.refreshRealData=wrappedRefresh;
    }

    refreshSensorUi();
    setTimeout(refreshSensorUi,500);
    setTimeout(refreshSensorUi,1500);
  }

  window.openSensorCsvExport=openModal;
  window.downloadSelectedSensorCsv=downloadSelectedSensorCsv;
  window.refreshTayuProfileSensors=refreshSensorUi;

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();