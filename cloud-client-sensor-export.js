/* TAYULABS Cloud - Sensores: perfiles, CSV y graficas avanzadas
 * Fuente preferida: device.capabilities.telemetry.
 * Compatibilidad: device.configuration.signals.
 * Historico: GET /telemetry/history y GET /telemetry/export.csv.
 * Dashboard: reutiliza signalChart y agrega visualizaciones avanzadas sin romper Chart.js.
 * v4: el constructor mantiene un borrador local y los refrescos de telemetria nunca pisan la selección del usuario.
 */
(function(){
  'use strict';

  const API_BASE='https://api.tayulabs.com';
  const CUSTOM_TYPES=new Set(['tank','liquid','gauge','gauge_semi','kpi']);
  const TYPE_OPTIONS=[
    ['line','Línea'],
    ['bar','Barras'],
    ['tank','Tanque animado'],
    ['liquid','Liquid fill circle'],
    ['gauge','Gauge circular'],
    ['gauge_semi','Gauge semicircular'],
    ['kpi','KPI + mini tendencia']
  ];

  let selectedSensor=null;
  let previewChart=null;
  let previewTimer=null;
  let previewRequestId=0;
  let builderInitialized=false;
  let builderDirty=false;
  let builderDraft=null;
  let builderSaving=false;
  const customHistoryCache=new Map();

  const asObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const realDevices=()=>Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[];
  const latestRows=()=>Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[];

  function escapeHtml(value){
    return String(value??'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function safeFilePart(value){
    return String(value||'telemetria').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'telemetria';
  }

  function localInputValue(date){
    const d=new Date(date.getTime()-date.getTimezoneOffset()*60000);
    return d.toISOString().slice(0,16);
  }

  function readPath(obj,path){
    return String(path||'').split('.').filter(Boolean).reduce((acc,key)=>acc==null?undefined:acc[key],obj);
  }

  function latestPayloadMap(){
    const map=new Map();
    latestRows().forEach(row=>{
      const key=String(row?.device_key||'');
      if(!key)return;
      const when=new Date(row?.time||0).getTime();
      const prev=map.get(key);
      let payload=row?.payload;
      if(typeof payload==='string'){try{payload=JSON.parse(payload);}catch(_){payload={};}}
      if(!prev||when>prev.when)map.set(key,{when,payload:asObject(payload)});
    });
    return map;
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
      const profileTelemetry=asObject(asObject(device?.capabilities).telemetry);
      const configuredSignals=asObject(asObject(device?.configuration).signals);
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
        const chartAllowed=profile.chart!==false&&type==='number';
        const technical=profile.technical===true;
        const farm=device?.farm||device?.site_name||device?.organization_name||'';
        const zone=device?.zone||device?.sector||'';
        out.push({
          id:`${deviceKey}:${path}`,
          deviceKey,
          deviceName:String(device?.name||deviceKey),
          sourcePath:path,
          name,unit,
          value:Number.isFinite(numeric)?numeric:value,
          min,max,decimals,
          chart:chartAllowed,
          technical,
          type,
          location:[farm,zone].filter(Boolean).join(' · '),
          state:sensorState(value,min,max),
          profileDefined:Object.prototype.hasOwnProperty.call(profileTelemetry,path),
          configured:Object.prototype.hasOwnProperty.call(configuredSignals,path)
        });
      });
    });
    return out.sort((a,b)=>a.deviceName.localeCompare(b.deviceName,'es')||a.name.localeCompare(b.name,'es'));
  }

  function chartableSensors(){return profileSensors().filter(sensor=>sensor.chart===true);}
  function sensorById(id){return profileSensors().find(sensor=>sensor.id===id)||null;}

  function formatSensorValue(sensor){
    const n=Number(sensor?.value);
    if(!Number.isFinite(n))return sensor?.value===true?'1':sensor?.value===false?'0':'—';
    if(Number.isFinite(sensor?.decimals))return n.toLocaleString('es-EC',{minimumFractionDigits:sensor.decimals,maximumFractionDigits:sensor.decimals});
    return n.toLocaleString('es-EC',{maximumFractionDigits:4});
  }

  function numberText(value){
    const n=Number(value);
    if(!Number.isFinite(n))return '—';
    const abs=Math.abs(n),digits=abs>=100?1:abs>=10?2:3;
    return n.toLocaleString('es-EC',{maximumFractionDigits:digits});
  }

  function axisBound(value){
    if(value===''||value===null||value===undefined)return undefined;
    const n=Number(value);
    return Number.isFinite(n)?n:undefined;
  }

  function bounds(cfg,value){
    let min=axisBound(cfg?.min),max=axisBound(cfg?.max);
    if(!Number.isFinite(min))min=0;
    if(!Number.isFinite(max))max=100;
    if(max<=min){
      const center=Number.isFinite(Number(value))?Number(value):min;
      min=center-1;max=center+1;
    }
    return {min,max};
  }

  function percentage(value,min,max){
    const n=Number(value);
    if(!Number.isFinite(n)||!Number.isFinite(min)||!Number.isFinite(max)||max<=min)return 0;
    return Math.max(0,Math.min(100,((n-min)/(max-min))*100));
  }

  function injectStyles(){
    if(document.getElementById('tayuSensorEnhancementStyles'))return;
    const style=document.createElement('style');
    style.id='tayuSensorEnhancementStyles';
    style.textContent=`
      .tayu-sensor-action{text-align:center!important;width:76px}
      .tayu-sensor-icon-btn{width:34px;height:34px;padding:0!important;border-radius:11px!important;display:inline-grid;place-items:center;font-size:17px;line-height:1;background:var(--panel2)!important;color:var(--text)!important;border:1px solid var(--border)!important;cursor:pointer}
      .tayu-sensor-icon-btn:hover{border-color:var(--brand)!important;color:var(--brand)!important}.tayu-sensor-icon-btn:disabled{opacity:.35;cursor:not-allowed}
      .tayu-sensor-tech{display:block;color:var(--muted);font-size:10px;font-weight:800;margin-top:4px}.tayu-sensor-source{font-size:11px}
      #tayuSensorCsvModal .modal-card{width:min(590px,100%)}
      .tayu-csv-info{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:4px 0 14px}.tayu-csv-info>div{background:var(--panel2);border:1px solid var(--border);border-radius:14px;padding:11px 12px;min-width:0}
      .tayu-csv-info span{display:block;color:var(--muted);font-size:11px;font-weight:850;margin-bottom:4px}.tayu-csv-info b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
      .tayu-csv-custom{display:none;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.tayu-csv-custom.open{display:grid}.tayu-csv-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;flex-wrap:wrap}
      .tayu-csv-status{min-height:20px;margin-top:10px;font-size:12px;color:var(--muted);font-weight:750}.tayu-csv-status.error{display:block;color:var(--danger)}.tayu-csv-note{font-size:12px;color:var(--muted);line-height:1.45;margin:10px 0 0}
      #tayuSensorChartBuilder{margin-top:18px}#tayuSensorChartBuilder .tayu-sensor-chart-status{min-height:20px;margin-top:10px;color:var(--muted);font-size:12px;font-weight:800}#tayuSensorChartBuilder .tayu-sensor-chart-status.ok{color:var(--brand)}#tayuSensorChartBuilder .tayu-sensor-chart-status.error{display:block;color:var(--danger)}
      .tayu-sensor-hidden-field{display:none!important}.tayu-sensor-preview-host{min-height:250px;display:flex;align-items:center;justify-content:center;padding:10px}.tayu-sensor-base-canvas.hidden{display:none!important}
      .tayu-sv-shell{width:100%;height:100%;min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--text)}
      .tayu-sv-title{font-size:13px;font-weight:900;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tayu-sv-range{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;color:var(--muted);font-size:11px;font-weight:800}
      .tayu-sv-value{font-size:29px;font-weight:950;line-height:1.05}.tayu-sv-unit{font-size:13px;color:var(--muted);font-weight:850;margin-left:4px}.tayu-sv-percent{font-size:13px;font-weight:900;color:var(--muted);margin-top:5px}
      .tayu-sv-tank{position:relative;width:132px;height:188px;border:5px solid var(--border);border-radius:26px 26px 38px 38px;overflow:hidden;background:var(--panel2)}
      .tayu-sv-tank:before{content:'';position:absolute;left:15px;right:15px;top:-10px;height:16px;border:4px solid var(--border);border-radius:50%;background:var(--panel);z-index:4}
      .tayu-sv-water,.tayu-sv-circle-water{position:absolute;left:0;right:0;bottom:0;height:0;background:linear-gradient(180deg,#38bdf8,#0284c7);transition:height .8s cubic-bezier(.2,.8,.2,1)}
      .tayu-sv-water:before,.tayu-sv-circle-water:before{content:'';position:absolute;left:-25%;top:-11px;width:150%;height:23px;border-radius:44%;background:rgba(255,255,255,.30);animation:tayuSensorWave 3.3s linear infinite}@keyframes tayuSensorWave{from{transform:translateX(-12%) rotate(0deg)}to{transform:translateX(12%) rotate(360deg)}}
      .tayu-sv-center{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.tayu-sv-liquid{position:relative;width:178px;height:178px;border-radius:50%;overflow:hidden;background:var(--panel2);border:5px solid var(--border)}
      .tayu-sv-gauge{position:relative;width:190px;height:190px;display:grid;place-items:center}.tayu-sv-gauge svg{width:190px;height:190px;transform:rotate(-90deg)}.tayu-sv-track,.tayu-sv-gauge-value{fill:none;stroke-width:14;stroke-linecap:round}.tayu-sv-track{stroke:var(--border)}.tayu-sv-gauge-value{stroke:var(--brand);transition:stroke-dasharray .8s}
      .tayu-sv-semi{position:relative;width:230px;height:145px;display:flex;align-items:flex-end;justify-content:center}.tayu-sv-semi svg{position:absolute;left:0;top:0;width:230px;height:125px}.tayu-sv-semi .tayu-sv-track,.tayu-sv-semi .tayu-sv-gauge-value{fill:none;stroke-width:17;stroke-linecap:round}.tayu-sv-semi-center{z-index:2;text-align:center;margin-bottom:3px}
      .tayu-sv-kpi{width:min(440px,100%);display:grid;grid-template-columns:minmax(135px,.75fr) 1.25fr;gap:18px;align-items:center;padding:18px;border:1px solid var(--border);border-radius:22px;background:var(--panel2)}.tayu-sv-kpi-main small{display:block;color:var(--muted);font-size:11px;font-weight:850;margin-bottom:7px}.tayu-sv-kpi-main strong{font-size:34px;line-height:1;font-weight:950}.tayu-sv-spark{width:100%;height:82px;overflow:visible}.tayu-sv-spark polyline{fill:none;stroke:var(--brand);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.tayu-sv-spark-line{stroke:var(--border);stroke-width:1}
      .tayu-sv-empty{color:var(--muted);font-weight:800;font-size:13px;text-align:center;padding:30px}.tayu-sensor-custom-dashboard{min-height:235px;display:flex;align-items:center;justify-content:center}
      @media(max-width:600px){.tayu-csv-info,.tayu-csv-custom.open{grid-template-columns:1fr}.tayu-csv-actions{display:grid;grid-template-columns:1fr;width:100%}.tayu-csv-actions .btn{width:100%}.tayu-sv-kpi{grid-template-columns:1fr}.tayu-sv-spark{height:70px}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal(){
    if(document.getElementById('tayuSensorCsvModal'))return;
    const modal=document.createElement('div');
    modal.id='tayuSensorCsvModal';
    modal.className='modal-backdrop';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML=`<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="tayuCsvTitle"><div class="modal-header"><div><h3 id="tayuCsvTitle" style="margin:0">Descargar historial CSV</h3><p class="hint" style="margin:6px 0 0">Exporta el historial real almacenado en la plataforma.</p></div><button type="button" class="btn ghost" id="tayuCsvClose" aria-label="Cerrar">×</button></div><div class="tayu-csv-info"><div><span>Variable</span><b id="tayuCsvVariable">—</b></div><div><span>Equipo</span><b id="tayuCsvDevice">—</b></div><div><span>Unidad</span><b id="tayuCsvUnit">—</b></div><div><span>Fuente</span><b id="tayuCsvSource">—</b></div></div><label for="tayuCsvPeriod">Periodo</label><select id="tayuCsvPeriod"><option value="24h">Últimas 24 horas</option><option value="7d">Últimos 7 días</option><option value="30d">Últimos 30 días</option><option value="custom">Personalizado</option><option value="all">Todo disponible</option></select><div class="tayu-csv-custom" id="tayuCsvCustom"><div><label for="tayuCsvFrom">Desde</label><input id="tayuCsvFrom" type="datetime-local"></div><div><label for="tayuCsvTo">Hasta</label><input id="tayuCsvTo" type="datetime-local"></div></div><p class="tayu-csv-note" id="tayuCsvNote">La fecha y hora se exportan en formato ISO para conservar el instante exacto de cada muestra.</p><div class="tayu-csv-status" id="tayuCsvStatus"></div><div class="tayu-csv-actions"><button type="button" class="btn ghost" id="tayuCsvCancel">Cancelar</button><button type="button" class="btn" id="tayuCsvDownload">↓ Descargar CSV</button></div></div>`;
    document.body.appendChild(modal);
    document.getElementById('tayuCsvClose').addEventListener('click',closeModal);
    document.getElementById('tayuCsvCancel').addEventListener('click',closeModal);
    document.getElementById('tayuCsvDownload').addEventListener('click',downloadSelectedSensorCsv);
    document.getElementById('tayuCsvPeriod').addEventListener('change',updatePeriodUi);
    modal.addEventListener('click',event=>{if(event.target===modal)closeModal();});
  }

  function updatePeriodUi(){
    const period=document.getElementById('tayuCsvPeriod')?.value||'24h';
    document.getElementById('tayuCsvCustom')?.classList.toggle('open',period==='custom');
    const note=document.getElementById('tayuCsvNote');
    if(note)note.textContent=period==='all'?'Se exportará todo el historial disponible de esta variable. La preparación puede tardar si existen muchas muestras.':'La fecha y hora se exportan en formato ISO para conservar el instante exacto de cada muestra.';
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
    document.getElementById('tayuCsvFrom').value=localInputValue(new Date(now.getTime()-86400000));
    updatePeriodUi();
    document.getElementById('tayuSensorCsvModal').classList.add('open');
    document.getElementById('tayuSensorCsvModal').setAttribute('aria-hidden','false');
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
      const fv=document.getElementById('tayuCsvFrom')?.value||'';
      const tv=document.getElementById('tayuCsvTo')?.value||'';
      const from=new Date(fv),to=new Date(tv);
      if(!fv||!tv||Number.isNaN(from.getTime())||Number.isNaN(to.getTime()))throw new Error('Selecciona una fecha inicial y una fecha final válidas.');
      if(from>=to)throw new Error('La fecha inicial debe ser anterior a la fecha final.');
      return {from,to,label:'personalizado'};
    }
    const hours=period==='7d'?168:period==='30d'?720:24;
    return {from:new Date(now.getTime()-hours*3600000),to:now,label:period};
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
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),5000);
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
    const meta={enabled:existing.enabled!==false,name:existing.name||sensor.name,unit:existing.unit??sensor.unit??'',application:existing.application||'generic',alarm_severity:existing.alarm_severity||'warning',...existing};
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
    table.innerHTML=`<tr><th>Sensor</th><th>Valor</th><th>Equipo</th><th>Mínimo</th><th>Máximo</th><th>Estado</th><th>Fuente</th><th class="tayu-sensor-action">Gráfica</th><th class="tayu-sensor-action">CSV</th></tr>`+list.map(sensor=>{
      const value=formatSensorValue(sensor);
      const statusClass=sensor.state==='Normal'?'status':sensor.state==='Sin datos'?'status off':'status warn';
      return `<tr data-tayu-sensor-id="${escapeHtml(sensor.id)}"><td><b>${escapeHtml(sensor.name)}</b>${sensor.technical?'<span class="tayu-sensor-tech">Dato técnico</span>':''}</td><td><b>${escapeHtml(value)}${sensor.unit?` ${escapeHtml(sensor.unit)}`:''}</b></td><td>${escapeHtml(sensor.deviceName)}<br><small class="hint">${escapeHtml(sensor.deviceKey)}</small></td><td><input class="small-input" type="number" step="any" value="${sensor.min??''}" data-sensor-threshold="min" data-sensor-id="${escapeHtml(sensor.id)}"></td><td><input class="small-input" type="number" step="any" value="${sensor.max??''}" data-sensor-threshold="max" data-sensor-id="${escapeHtml(sensor.id)}"></td><td><span class="${statusClass}">${escapeHtml(sensor.state)}</span></td><td><code class="tayu-sensor-source">${escapeHtml(sensor.sourcePath)}</code></td><td class="tayu-sensor-action"><button type="button" class="tayu-sensor-icon-btn" data-sensor-chart="${escapeHtml(sensor.id)}" ${sensor.chart?'':'disabled'} title="${sensor.chart?'Configurar gráfica':'Esta variable está marcada con chart:false en el perfil'}">📈</button></td><td class="tayu-sensor-action"><button type="button" class="tayu-sensor-icon-btn" data-sensor-csv="${escapeHtml(sensor.id)}" title="Descargar historial CSV">↓</button></td></tr>`;
    }).join('');
  }

  function typeOptionsHtml(){
    return TYPE_OPTIONS.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
  }

  function ensureChartBuilder(){
    const section=document.getElementById('sensores');
    if(!section||document.getElementById('tayuSensorChartBuilder'))return;
    const card=document.createElement('div');
    card.id='tayuSensorChartBuilder';
    card.className='card';
    card.innerHTML=`<div class="chart-steps"><div class="chart-step"><b>1. Equipo</b><span class="hint">Selecciona el equipo que está enviando la telemetría.</span></div><div class="chart-step"><b>2. Variable</b><span class="hint">Solo aparecen variables numéricas habilitadas con chart: true.</span></div><div class="chart-step"><b>3. Dashboard</b><span class="hint">Elige la visualización y agrégala como widget movible.</span></div></div><div class="module-header" style="margin-top:16px"><div><h3 style="margin:0">📈 Gráficas de sensores</h3><p class="hint">Mismas visualizaciones disponibles en Modbus.</p></div><button type="button" class="btn" id="tayuSensorChartAdd">＋ Agregar gráfica al dashboard</button></div><div class="modbus-builder" id="tayuSensorChartForm"><div><label>Equipo</label><select id="tayuSensorChartDevice"></select></div><div><label>Variable</label><select id="tayuSensorChartVariable"></select></div><div><label>Tipo</label><select id="tayuSensorChartType">${typeOptionsHtml()}</select></div><div data-sensor-period-field><label>Ventana eje X</label><select id="tayuSensorChartPeriod"><option value="0.5">30 segundos</option><option value="1">1 minuto</option><option value="5" selected>5 minutos</option><option value="15">15 minutos</option><option value="60">1 hora</option><option value="1440">24 horas</option></select></div><div data-sensor-points-field><label>Detalle de la gráfica</label><select id="tayuSensorChartPoints"><option value="20">20 puntos</option><option value="50" selected>50 puntos</option><option value="100">100 puntos</option><option value="200">200 puntos</option><option value="400">400 puntos</option></select></div><div><label id="tayuSensorChartMinLabel">Mínimo eje Y</label><input id="tayuSensorChartMin" type="number" step="any" placeholder="Automático"></div><div><label id="tayuSensorChartMaxLabel">Máximo eje Y</label><input id="tayuSensorChartMax" type="number" step="any" placeholder="Automático"></div><div class="full"><label>Título</label><input id="tayuSensorChartTitle" placeholder="Ej: Oxígeno disuelto · Piscina 10"></div></div><div class="modbus-chart-box" style="margin-top:16px;position:relative"><canvas id="tayuSensorChartPreview" class="tayu-sensor-base-canvas"></canvas><div id="tayuSensorPreviewHost" class="tayu-sensor-preview-host" hidden></div></div><div class="tayu-sensor-chart-status" id="tayuSensorChartStatus"></div>`;
    section.appendChild(card);

    const device=document.getElementById('tayuSensorChartDevice');
    const variable=document.getElementById('tayuSensorChartVariable');
    device.addEventListener('change',()=>{
      builderDirty=false;
      builderDraft=null;
      refreshVariableSelect();
      loadExistingChartConfig(true);
      schedulePreview();
    });
    variable.addEventListener('change',()=>{
      builderDirty=false;
      builderDraft=null;
      loadExistingChartConfig(true);
      schedulePreview();
    });

    ['tayuSensorChartType','tayuSensorChartPeriod','tayuSensorChartPoints','tayuSensorChartMin','tayuSensorChartMax','tayuSensorChartTitle'].forEach(id=>{
      const el=document.getElementById(id);
      if(!el)return;
      const eventName=id.includes('Title')||id.includes('Min')||id.includes('Max')?'input':'change';
      el.addEventListener(eventName,()=>{
        builderDirty=true;
        builderDraft=captureBuilderDraft();
        syncBuilderFields();
        schedulePreview();
      });
    });
    document.getElementById('tayuSensorChartAdd').addEventListener('click',saveChartToDashboard);
    syncBuilderFields();
  }

  function syncBuilderFields(){
    const visual=document.getElementById('tayuSensorChartType')?.value||'line';
    const instant=['tank','liquid','gauge','gauge_semi'].includes(visual);
    document.querySelector('[data-sensor-period-field]')?.classList.toggle('tayu-sensor-hidden-field',instant);
    document.querySelector('[data-sensor-points-field]')?.classList.toggle('tayu-sensor-hidden-field',instant);
    const min=document.getElementById('tayuSensorChartMinLabel');
    const max=document.getElementById('tayuSensorChartMaxLabel');
    if(min)min.textContent=instant?'Mínimo del rango':'Mínimo eje Y';
    if(max)max.textContent=instant?'Máximo del rango':'Máximo eje Y';
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
    select.innerHTML=devices.length?devices.map(item=>`<option value="${escapeHtml(item.deviceKey)}">${escapeHtml(item.deviceName)} · ${escapeHtml(item.deviceKey)}</option>`).join(''):'<option value="">No hay sensores graficables</option>';
    if(devices.some(item=>item.deviceKey===current))select.value=current;
    refreshVariableSelect(builderDraft?.deviceKey===select.value?builderDraft.path:undefined);
  }

  function refreshVariableSelect(preferred){
    const deviceKey=document.getElementById('tayuSensorChartDevice')?.value||'';
    const select=document.getElementById('tayuSensorChartVariable');
    if(!select)return;
    const sensors=chartableSensors().filter(sensor=>sensor.deviceKey===deviceKey);
    const current=preferred||select.value;
    select.innerHTML=sensors.length?sensors.map(sensor=>`<option value="${escapeHtml(sensor.sourcePath)}">${escapeHtml(sensor.name)}${sensor.unit?` (${escapeHtml(sensor.unit)})`:''}</option>`).join(''):'<option value="">Sin variables graficables</option>';
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

  function captureBuilderDraft(){
    const sensor=selectedChartSensor();
    if(!sensor)return null;
    return {
      deviceKey:sensor.deviceKey,
      path:sensor.sourcePath,
      visualType:document.getElementById('tayuSensorChartType')?.value||'line',
      period:document.getElementById('tayuSensorChartPeriod')?.value||'5',
      points:document.getElementById('tayuSensorChartPoints')?.value||'50',
      min:document.getElementById('tayuSensorChartMin')?.value??'',
      max:document.getElementById('tayuSensorChartMax')?.value??'',
      title:document.getElementById('tayuSensorChartTitle')?.value||`${sensor.name} · ${sensor.deviceName}`
    };
  }

  function restoreBuilderDraft(draft){
    if(!draft)return false;
    const ds=document.getElementById('tayuSensorChartDevice');
    const vs=document.getElementById('tayuSensorChartVariable');
    if(!ds||!vs)return false;
    if(![...ds.options].some(o=>o.value===draft.deviceKey))return false;
    ds.value=draft.deviceKey;
    refreshVariableSelect(draft.path);
    if(![...vs.options].some(o=>o.value===draft.path))return false;
    vs.value=draft.path;
    const set=(id,value)=>{const el=document.getElementById(id);if(el&&value!==undefined&&value!==null)el.value=String(value);};
    set('tayuSensorChartType',draft.visualType||'line');
    set('tayuSensorChartPeriod',draft.period??5);
    set('tayuSensorChartPoints',draft.points??50);
    set('tayuSensorChartMin',draft.min??'');
    set('tayuSensorChartMax',draft.max??'');
    set('tayuSensorChartTitle',draft.title??'');
    syncBuilderFields();
    return true;
  }

  function updateBuilderButtonAndStatus(id){
    const button=document.getElementById('tayuSensorChartAdd');
    if(button)button.textContent=id?'Actualizar gráfica del dashboard':'＋ Agregar gráfica al dashboard';
    const status=document.getElementById('tayuSensorChartStatus');
    if(status&&!builderSaving){
      status.className='tayu-sensor-chart-status';
      if(builderDirty)status.textContent='Cambios sin guardar. La vista previa usa esta configuración.';
      else status.textContent=id?'Esta variable ya tiene una visualización en el dashboard.':' ';
    }
  }

  function loadExistingChartConfig(force=false){
    const sensor=selectedChartSensor();
    if(!sensor)return;
    const id=findExistingChart(sensor.deviceKey,sensor.sourcePath);
    if(builderDirty&&!force){
      updateBuilderButtonAndStatus(id);
      return;
    }
    const cfg=id?signalConfigs()[id]:null;
    const set=(field,value)=>{const el=document.getElementById(field);if(el)el.value=value??'';};
    set('tayuSensorChartType',cfg?.visualType||cfg?.type||'line');
    set('tayuSensorChartPeriod',cfg?.period??5);
    set('tayuSensorChartPoints',cfg?.points??50);
    set('tayuSensorChartMin',cfg?.min??'');
    set('tayuSensorChartMax',cfg?.max??'');
    set('tayuSensorChartTitle',cfg?.title||`${sensor.name} · ${sensor.deviceName}`);
    builderDirty=false;
    builderDraft=captureBuilderDraft();
    updateBuilderButtonAndStatus(id);
    syncBuilderFields();
  }

  function chartFormConfig(){
    const sensor=selectedChartSensor();
    if(!sensor)return null;
    const visualType=document.getElementById('tayuSensorChartType')?.value||'line';
    return {
      deviceKey:sensor.deviceKey,
      path:sensor.sourcePath,
      title:document.getElementById('tayuSensorChartTitle')?.value||`${sensor.name} · ${sensor.deviceName}`,
      unit:sensor.unit||'',
      period:Number(document.getElementById('tayuSensorChartPeriod')?.value||5),
      type:CUSTOM_TYPES.has(visualType)?'line':visualType,
      visualType,
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

  function schedulePreview(){
    clearTimeout(previewTimer);
    previewTimer=setTimeout(updatePreview,160);
  }

  function sparklineSvg(points){
    const values=points.map(p=>Number(p.v)).filter(Number.isFinite);
    if(values.length<2)return '<div class="tayu-sv-empty">Esperando histórico…</div>';
    const min=Math.min(...values),max=Math.max(...values),span=max-min||1,w=300,h=82,pad=4;
    const coords=values.map((v,i)=>`${pad+(i/(values.length-1))*(w-pad*2)},${h-pad-((v-min)/span)*(h-pad*2)}`).join(' ');
    return `<svg class="tayu-sv-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line class="tayu-sv-spark-line" x1="0" y1="${h-1}" x2="${w}" y2="${h-1}"></line><polyline points="${coords}"></polyline></svg>`;
  }

  function visualMarkup(type,cfg,value,points=[]){
    const {min,max}=bounds(cfg,value);
    const pct=percentage(value,min,max);
    const valueText=numberText(value);
    const unit=escapeHtml(cfg.unit||'');
    const title=escapeHtml(cfg.title||cfg.path||'Variable');
    if(type==='tank')return `<div class="tayu-sv-shell"><div class="tayu-sv-title">${title}</div><div class="tayu-sv-tank"><div class="tayu-sv-water" style="height:${pct}%"></div><div class="tayu-sv-center"><div><span class="tayu-sv-value">${valueText}</span><span class="tayu-sv-unit">${unit}</span></div><div class="tayu-sv-percent">${pct.toFixed(0)}%</div></div></div><div class="tayu-sv-range"><span>${numberText(min)}</span><span>${numberText(max)}</span></div></div>`;
    if(type==='liquid')return `<div class="tayu-sv-shell"><div class="tayu-sv-title">${title}</div><div class="tayu-sv-liquid"><div class="tayu-sv-circle-water" style="height:${pct}%"></div><div class="tayu-sv-center"><div><span class="tayu-sv-value">${valueText}</span><span class="tayu-sv-unit">${unit}</span></div><div class="tayu-sv-percent">${pct.toFixed(0)}%</div></div></div><div class="tayu-sv-range"><span>${numberText(min)}</span><span>${numberText(max)}</span></div></div>`;
    if(type==='gauge')return `<div class="tayu-sv-shell"><div class="tayu-sv-title">${title}</div><div class="tayu-sv-gauge"><svg viewBox="0 0 120 120"><circle class="tayu-sv-track" cx="60" cy="60" r="47" pathLength="100"></circle><circle class="tayu-sv-gauge-value" cx="60" cy="60" r="47" pathLength="100" stroke-dasharray="${pct} 100"></circle></svg><div class="tayu-sv-center"><div><span class="tayu-sv-value">${valueText}</span><span class="tayu-sv-unit">${unit}</span></div><div class="tayu-sv-percent">${pct.toFixed(0)}%</div></div></div><div class="tayu-sv-range"><span>${numberText(min)}</span><span>${numberText(max)}</span></div></div>`;
    if(type==='gauge_semi')return `<div class="tayu-sv-shell"><div class="tayu-sv-title">${title}</div><div class="tayu-sv-semi"><svg viewBox="0 0 200 115"><path class="tayu-sv-track" d="M20 100 A80 80 0 0 1 180 100" pathLength="100"></path><path class="tayu-sv-gauge-value" d="M20 100 A80 80 0 0 1 180 100" pathLength="100" stroke-dasharray="${pct} 100"></path></svg><div class="tayu-sv-semi-center"><div><span class="tayu-sv-value">${valueText}</span><span class="tayu-sv-unit">${unit}</span></div><div class="tayu-sv-percent">${pct.toFixed(0)}%</div></div></div><div class="tayu-sv-range"><span>${numberText(min)}</span><span>${numberText(max)}</span></div></div>`;
    if(type==='kpi')return `<div class="tayu-sv-shell"><div class="tayu-sv-title">${title}</div><div class="tayu-sv-kpi"><div class="tayu-sv-kpi-main"><small>Valor actual</small><strong>${valueText}</strong><span class="tayu-sv-unit">${unit}</span></div><div>${sparklineSvg(points)}</div></div></div>`;
    return '';
  }

  async function historyPoints(cfg){
    const now=new Date();
    const from=new Date(now.getTime()-Math.max(.5,cfg.period||5)*60000);
    const rows=window.__tayuApi?await window.__tayuApi(`/telemetry/history?device_key=${encodeURIComponent(cfg.deviceKey)}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(now.toISOString())}`):[];
    const points=(Array.isArray(rows)?rows:[])
      .map(row=>({t:new Date(row.time),v:Number(readPath(row.payload,cfg.path))}))
      .filter(point=>Number.isFinite(point.v)&&!Number.isNaN(point.t.getTime()));
    return {points:samplePoints(points,cfg.points||50),from,now};
  }

  async function updatePreview(){
    const cfg=chartFormConfig();
    const canvas=document.getElementById('tayuSensorChartPreview');
    const host=document.getElementById('tayuSensorPreviewHost');
    if(!cfg||!canvas||!host)return;
    const requestId=++previewRequestId;
    const status=document.getElementById('tayuSensorChartStatus');
    try{
      const {points,from,now}=await historyPoints(cfg);
      if(requestId!==previewRequestId)return;
      const latest=points.length?points[points.length-1].v:Number(selectedChartSensor()?.value);
      if(CUSTOM_TYPES.has(cfg.visualType)){
        if(previewChart){previewChart.destroy();previewChart=null;}
        canvas.classList.add('hidden');
        host.hidden=false;
        host.innerHTML=visualMarkup(cfg.visualType,cfg,latest,points);
      }else{
        host.hidden=true;host.innerHTML='';canvas.classList.remove('hidden');
        if(typeof Chart==='undefined')return;
        const data=points.map(point=>({x:point.t.getTime(),y:point.v}));
        const theme=typeof window.tayuChartTheme==='function'?window.tayuChartTheme():{text:'#667085',grid:'rgba(17,24,39,.10)',border:'rgba(17,24,39,.18)'};
        const datasetLabel=`${cfg.title}${cfg.unit?` (${cfg.unit})`:''}`;
        if(previewChart)previewChart.destroy();
        previewChart=new Chart(canvas,{type:cfg.type,data:{datasets:[{label:datasetLabel,data,tension:.3}]},options:{parsing:false,responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{labels:{color:theme.text}},tooltip:{callbacks:{title:items=>{const x=items?.[0]?.parsed?.x;return Number.isFinite(x)?new Date(x).toLocaleString('es-EC'):'';}}}},scales:{x:{type:'linear',min:from.getTime(),max:now.getTime(),ticks:{maxTicksLimit:8,color:theme.text,callback:value=>new Date(Number(value)).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit',second:'2-digit'})},grid:{color:theme.grid},border:{color:theme.border}},y:{min:axisBound(cfg.min),max:axisBound(cfg.max),ticks:{color:theme.text},grid:{color:theme.grid},border:{color:theme.border}}}}});
      }
      if(status&&!builderSaving){
        const id=findExistingChart(cfg.deviceKey,cfg.path);
        status.className='tayu-sensor-chart-status';
        if(builderDirty)status.textContent=`Vista previa: ${TYPE_OPTIONS.find(x=>x[0]===cfg.visualType)?.[1]||cfg.visualType}. Cambios sin guardar.`;
        else if(id)status.textContent='Esta variable ya tiene una visualización en el dashboard.';
        else status.textContent=points.length?`${points.length} puntos cargados en la vista previa.`:'Todavía no hay muestras históricas para esta variable.';
      }
    }catch(error){
      console.warn('Vista previa de sensor:',error);
      if(status){status.className='tayu-sensor-chart-status error';status.textContent=`No se pudo cargar la vista previa: ${error?.message||error}`;}
    }
  }

  async function saveChartToDashboard(){
    if(builderSaving)return;
    const cfg=chartFormConfig();
    const status=document.getElementById('tayuSensorChartStatus');
    const button=document.getElementById('tayuSensorChartAdd');
    if(!cfg||!window.newWidgetInstance||!Array.isArray(window.dashboardWidgetIds)){
      if(status){status.className='tayu-sensor-chart-status error';status.textContent='El motor de widgets todavía no está disponible.';}
      return;
    }
    builderSaving=true;
    const oldText=button?.textContent||'';
    if(button){button.disabled=true;button.textContent='Guardando…';}
    if(status){status.className='tayu-sensor-chart-status';status.textContent=`Guardando ${TYPE_OPTIONS.find(x=>x[0]===cfg.visualType)?.[1]||cfg.visualType}…`;}
    try{
      const configs=signalConfigs();
      let widgetId=findExistingChart(cfg.deviceKey,cfg.path);
      const existed=Boolean(widgetId);
      if(!widgetId){
        widgetId=window.newWidgetInstance('signalChart');
        window.dashboardWidgetIds.push(widgetId);
      }
      configs[widgetId]={...cfg};
      window.tayuSignalChartConfigs=configs;
      builderDraft={
        deviceKey:cfg.deviceKey,path:cfg.path,visualType:cfg.visualType,
        period:String(cfg.period),points:String(cfg.points),min:cfg.min,max:cfg.max,title:cfg.title
      };
      await window.saveDashboardCloud?.();
      builderDirty=false;
      window.renderDashboardWidgets?.();
      window.renderWidgetLibrary?.();
      setTimeout(()=>renderCustomDashboardVisuals(true),180);
      restoreBuilderDraft(builderDraft);
      updateBuilderButtonAndStatus(widgetId);
      if(status){status.className='tayu-sensor-chart-status ok';status.textContent=existed?'Visualización actualizada en el dashboard.':'Visualización agregada al dashboard.';}
      if(button)button.textContent='Actualizar gráfica del dashboard';
    }catch(error){
      console.error('Guardar gráfica de sensor:',error);
      builderDirty=true;
      if(status){status.className='tayu-sensor-chart-status error';status.textContent=`No se pudo guardar la gráfica: ${error?.message||error}`;}
    }finally{
      builderSaving=false;
      if(button){button.disabled=false;if(!button.textContent||button.textContent==='Guardando…')button.textContent=oldText||'Actualizar gráfica del dashboard';}
    }
  }

  function latestValueForConfig(cfg){
    const rows=latestRows().filter(row=>String(row?.device_key||'')===String(cfg.deviceKey)).sort((a,b)=>new Date(b?.time||0)-new Date(a?.time||0));
    let payload=rows[0]?.payload;
    if(typeof payload==='string'){try{payload=JSON.parse(payload);}catch(_){payload={};}}
    return Number(readPath(payload||{},cfg.path));
  }

  async function cachedHistory(cfg,force=false){
    const key=`${cfg.deviceKey}|${cfg.path}|${cfg.period}|${cfg.points}`;
    const now=Date.now();
    const cached=customHistoryCache.get(key);
    if(!force&&cached&&now-cached.at<30000)return cached.points;
    try{
      const result=await historyPoints(cfg);
      customHistoryCache.set(key,{at:now,points:result.points});
      return result.points;
    }catch(error){
      console.warn('Histórico visual sensor:',error);
      return cached?.points||[];
    }
  }

  async function renderCustomDashboardVisuals(force=false){
    const configs=signalConfigs();
    const widgets=[...document.querySelectorAll('.dashboard-widget[data-widget-type="signalChart"]')];
    for(const widget of widgets){
      const id=widget.dataset.widgetId;
      const cfg=configs[id];
      const visual=cfg?.visualType||cfg?.type||'line';
      const box=widget.querySelector('.modbus-chart-box');
      const canvas=widget.querySelector('.dashboard-signal-chart');
      if(!box||!cfg)continue;
      let host=box.querySelector('.tayu-sensor-custom-dashboard');
      if(!CUSTOM_TYPES.has(visual)){
        if(host)host.remove();
        if(canvas)canvas.style.display='';
        widget.querySelector('.chart-history-toolbar')?.style.removeProperty('display');
        continue;
      }
      if(canvas){
        if(canvas._chart){try{canvas._chart.destroy();}catch(_){}canvas._chart=null;}
        canvas.style.display='none';
      }
      if(!host){host=document.createElement('div');host.className='tayu-sensor-custom-dashboard';box.appendChild(host);}
      const latest=latestValueForConfig(cfg);
      const points=visual==='kpi'?await cachedHistory(cfg,force):[];
      host.innerHTML=visualMarkup(visual,cfg,latest,points);
      const toolbar=widget.querySelector('.chart-history-toolbar');
      if(toolbar)toolbar.style.display=visual==='kpi'?'':'none';
      const panel=widget.querySelector('.chart-history-panel');
      if(panel&&visual!=='kpi')panel.classList.remove('open');
    }
  }

  function selectSensorForChart(sensor){
    if(!sensor?.chart)return;
    ensureChartBuilder();
    builderDirty=false;
    builderDraft=null;
    refreshDeviceSelect(sensor.deviceKey);
    const ds=document.getElementById('tayuSensorChartDevice');
    if(ds)ds.value=sensor.deviceKey;
    refreshVariableSelect(sensor.sourcePath);
    const vs=document.getElementById('tayuSensorChartVariable');
    if(vs)vs.value=sensor.sourcePath;
    loadExistingChartConfig(true);
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
      updateProfileSensorThreshold(sensor,input.dataset.sensorThreshold,input.value)
        .catch(error=>{console.error('Actualizar umbral de sensor:',error);alert(`No se pudo guardar el umbral: ${error?.message||error}`);})
        .finally(()=>{input.disabled=false;});
    });
  }

  function refreshSensorUi(){
    const draftBefore=builderDirty?(captureBuilderDraft()||builderDraft):null;
    if(draftBefore)builderDraft=draftBefore;

    renderSensorTable();
    bindSensorTableActions();
    ensureChartBuilder();

    const currentDevice=draftBefore?.deviceKey||document.getElementById('tayuSensorChartDevice')?.value||'';
    const currentVariable=draftBefore?.path||document.getElementById('tayuSensorChartVariable')?.value||'';
    refreshDeviceSelect(currentDevice);
    if(currentVariable)refreshVariableSelect(currentVariable);

    if(builderDirty&&builderDraft){
      restoreBuilderDraft(builderDraft);
      const sensor=selectedChartSensor();
      updateBuilderButtonAndStatus(sensor?findExistingChart(sensor.deviceKey,sensor.sourcePath):null);
      schedulePreview();
    }else{
      loadExistingChartConfig(!builderInitialized);
      if(!builderInitialized)schedulePreview();
    }
    builderInitialized=true;
  }

  function wrapDashboardRenderers(){
    if(window.renderDashboardWidgets&&!window.renderDashboardWidgets.__tayuSensorVisualWrapped){
      const original=window.renderDashboardWidgets;
      const wrapped=function(...args){const result=original.apply(this,args);setTimeout(()=>renderCustomDashboardVisuals(false),220);return result;};
      wrapped.__tayuSensorVisualWrapped=true;
      window.renderDashboardWidgets=wrapped;
    }
    if(window.refreshDashboardWidgetsInPlace&&!window.refreshDashboardWidgetsInPlace.__tayuSensorVisualWrapped){
      const original=window.refreshDashboardWidgetsInPlace;
      const wrapped=function(...args){const result=original.apply(this,args);setTimeout(()=>renderCustomDashboardVisuals(false),180);return result;};
      wrapped.__tayuSensorVisualWrapped=true;
      window.refreshDashboardWidgetsInPlace=wrapped;
    }
  }

  function install(){
    injectStyles();ensureModal();ensureChartBuilder();
    const originalRender=window.renderSensorTable;
    if(typeof originalRender==='function'&&!originalRender.__tayuProfileSensorsWrapped){
      const wrapped=function(){const result=originalRender.apply(this,arguments);refreshSensorUi();return result;};
      wrapped.__tayuProfileSensorsWrapped=true;
      window.renderSensorTable=wrapped;
    }
    const originalRefresh=window.refreshRealData;
    if(typeof originalRefresh==='function'&&!originalRefresh.__tayuProfileSensorsWrapped){
      const wrappedRefresh=async function(){
        const result=await originalRefresh.apply(this,arguments);
        refreshSensorUi();
        setTimeout(()=>renderCustomDashboardVisuals(false),100);
        return result;
      };
      wrappedRefresh.__tayuProfileSensorsWrapped=true;
      window.refreshRealData=wrappedRefresh;
    }
    wrapDashboardRenderers();
    refreshSensorUi();
    setTimeout(()=>{refreshSensorUi();renderCustomDashboardVisuals(true);},500);
    setTimeout(()=>{wrapDashboardRenderers();refreshSensorUi();renderCustomDashboardVisuals(true);},1500);
  }

  window.openSensorCsvExport=openModal;
  window.downloadSelectedSensorCsv=downloadSelectedSensorCsv;
  window.refreshTayuProfileSensors=refreshSensorUi;
  window.renderTayuSensorCustomVisuals=renderCustomDashboardVisuals;
  window.getTayuSensorChartDraft=()=>builderDraft?{...builderDraft}:null;

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
