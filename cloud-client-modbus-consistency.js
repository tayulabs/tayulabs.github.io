(() => {
  'use strict';

  const explicitEmptySave=new Set();
  const configCache=new Map();
  let refreshTimer=null;

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function selectedDeviceKey(){
    return String(document.getElementById('mbDeviceSelect')?.value||'');
  }

  function latestPayload(deviceKey){
    const rows=(Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[])
      .filter(row=>String(row?.device_key)===String(deviceKey))
      .sort((a,b)=>new Date(b?.time||0)-new Date(a?.time||0));
    const value=rows[0]?.payload;
    if(value&&typeof value==='object')return value;
    if(typeof value==='string'){
      try{return JSON.parse(value);}catch(_){}
    }
    return {};
  }

  function liveModbus(deviceKey){
    const value=latestPayload(deviceKey)?.modbus;
    return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  }

  async function getRemoteConfig(deviceKey,force=false){
    if(!deviceKey||typeof window.__tayuApi!=='function')return null;
    const cached=configCache.get(deviceKey);
    if(!force&&cached&&Date.now()-cached.at<5000)return cached.value;
    const value=await window.__tayuApi(`/devices/modbus-config?device_key=${encodeURIComponent(deviceKey)}`);
    configCache.set(deviceKey,{at:Date.now(),value});
    return value;
  }

  function rowCount(){
    return document.querySelectorAll('#mbParamRows tr:not(.mb-empty-row)').length;
  }

  function markDirty(){
    window.__tayuMarkModbusFormDirty?.();
  }

  function installStyles(){
    if(document.getElementById('tayuModbusConsistencyStyles'))return;
    const style=document.createElement('style');
    style.id='tayuModbusConsistencyStyles';
    style.textContent=`
      .tayu-mb-sync{margin:14px 0;padding:14px;border:1px solid var(--border);border-radius:16px;background:var(--panel2)}
      .tayu-mb-sync-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
      .tayu-mb-sync-head h4{margin:0}.tayu-mb-sync-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}
      .tayu-mb-sync-item{padding:10px;border-radius:12px;border:1px solid var(--border);background:var(--panel)}
      .tayu-mb-sync-item span{display:block;color:var(--muted);font-size:10px;font-weight:850;margin-bottom:4px}.tayu-mb-sync-item b{font-size:13px}
      .tayu-mb-consistency{margin-top:10px;padding:10px 12px;border-radius:12px;font-size:11px;line-height:1.45;border:1px solid var(--border);background:var(--panel)}
      .tayu-mb-consistency.warn{border-color:rgba(245,158,11,.35);background:rgba(245,158,11,.08)}
      .tayu-mb-consistency.ok{border-color:rgba(91,193,47,.30);background:rgba(91,193,47,.07)}
      .tayu-mb-consistency.error{border-color:rgba(239,68,68,.30);background:rgba(239,68,68,.07)}
      .tayu-mb-consistency .btn{margin-top:9px;padding:8px 10px;border-radius:10px;font-size:11px}
      .tayu-mb-delete{padding:7px 9px!important;border-radius:9px!important;font-size:11px!important;background:rgba(239,68,68,.08)!important;color:var(--danger)!important;border:1px solid rgba(239,68,68,.20)!important}
      .tayu-mb-chart-note{margin-top:10px;padding:10px 12px;border-radius:12px;background:var(--panel2);border:1px solid var(--border);font-size:11px;line-height:1.45;color:var(--muted)}
      @media(max-width:900px){.tayu-mb-sync-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:560px){.tayu-mb-sync-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureActionColumn(){
    const table=document.querySelector('#modbus .modbus-param-table');
    const headRow=table?.querySelector('thead tr');
    if(headRow&&!headRow.querySelector('[data-mb-action-head]')){
      const th=document.createElement('th');
      th.dataset.mbActionHead='1';
      th.textContent='Acción';
      headRow.appendChild(th);
    }

    const tbody=document.getElementById('mbParamRows');
    if(!tbody)return;
    tbody.querySelectorAll('.mb-empty-row').forEach(row=>row.querySelector('td')?.setAttribute('colspan','9'));
    tbody.querySelectorAll('tr:not(.mb-empty-row)').forEach(row=>{
      if(row.querySelector('[data-mb-delete]'))return;
      const td=document.createElement('td');
      td.innerHTML='<button type="button" class="btn ghost tayu-mb-delete" data-mb-delete>Eliminar</button>';
      row.appendChild(td);
    });
  }

  function ensureEmptyRow(){
    const tbody=document.getElementById('mbParamRows');
    if(!tbody||tbody.querySelector('tr:not(.mb-empty-row)'))return;
    let empty=tbody.querySelector('.mb-empty-row');
    if(!empty){
      empty=document.createElement('tr');
      empty.className='mb-empty-row';
      empty.innerHTML='<td colspan="9" style="text-align:center;padding:16px;color:var(--muted)">Sin parámetros Modbus configurados. Pulsa “＋ Agregar parámetro”.</td>';
      tbody.appendChild(empty);
    }else{
      empty.querySelector('td')?.setAttribute('colspan','9');
    }
  }

  function screenRefreshMs(){
    const value=Number(document.getElementById('realtimeRefreshInterval')?.value);
    return [1000,2000,5000,10000].includes(value)?value:5000;
  }

  function periodText(minutes){
    const n=Number(minutes||5);
    if(n<1)return`${Math.round(n*60)} s`;
    if(n<60)return`${n} min`;
    if(n===60)return'1 h';
    if(n===1440)return'24 h';
    return`${n/60} h`;
  }

  function ensureSyncBox(){
    installStyles();
    let box=document.getElementById('tayuModbusSyncBox');
    if(box)return box;
    const grid=document.querySelector('#modbus .modbus-config-grid');
    if(!grid)return null;
    box=document.createElement('div');
    box.id='tayuModbusSyncBox';
    box.className='tayu-mb-sync';
    grid.insertAdjacentElement('afterend',box);
    return box;
  }

  function ensureChartNote(){
    const builder=document.querySelector('#modbus .modbus-builder');
    if(!builder)return;
    let note=document.getElementById('tayuModbusChartSyncNote');
    if(!note){
      note=document.createElement('div');
      note.id='tayuModbusChartSyncNote';
      note.className='tayu-mb-chart-note';
      builder.insertAdjacentElement('afterend',note);
    }
    const period=Number(document.getElementById('mbChartPeriod')?.value||5);
    const points=Math.max(1,Number(document.getElementById('mbChartPoints')?.value||50));
    const targetSeconds=(period*60)/points;
    note.innerHTML=`<b>Gráfica:</b> la ventana X (${esc(periodText(period))}) solo define cuánto historial consultar/mostrar. “Detalle” limita los puntos dibujados. Con ${points} puntos, la resolución visual objetivo es ≈ ${targetSeconds<1?targetSeconds.toFixed(1):Math.round(targetSeconds)} s/punto, pero nunca crea datos nuevos: la resolución real depende de la telemetría almacenada.`;

    const pointsSelect=document.getElementById('mbChartPoints');
    const parent=pointsSelect?.parentElement;
    const label=parent?.querySelector('label');
    if(label)label.textContent='Puntos máximos en gráfica';
  }

  async function renderSyncInfo(force=false){
    const box=ensureSyncBox();
    ensureActionColumn();
    ensureEmptyRow();
    ensureChartNote();
    if(!box)return;

    const deviceKey=selectedDeviceKey();
    if(!deviceKey){
      box.innerHTML='<div class="tayu-mb-consistency">Selecciona un NOVA EDGE para revisar la sincronización Modbus.</div>';
      return;
    }

    const timeout=Math.max(0,Number(document.getElementById('mbTimeout')?.value||0));
    const poll=Math.max(0,Number(document.getElementById('mbPoll')?.value||0));
    const screen=screenRefreshMs();
    let raw=null;
    try{raw=await getRemoteConfig(deviceKey,force);}catch(error){console.warn('Modbus config sync:',error);}
    const params=Array.isArray(raw?.parameters)?raw.parameters:[];
    const liveKeys=Object.keys(liveModbus(deviceKey));

    let stateClass='';
    let message='';
    let action='';
    if(!params.length&&liveKeys.length){
      stateClass='warn';
      message=`El NOVA está enviando ${liveKeys.length} lectura${liveKeys.length===1?'':'s'} Modbus, pero PostgreSQL no tiene parámetros registrados para este equipo. Son lecturas heredadas/no vinculadas: conocemos el nombre y valor, pero no el registro, FC, tipo, escala u offset. Por seguridad, Guardar queda bloqueado mientras la tabla esté vacía para evitar borrarlas accidentalmente.`;
      action='<button type="button" class="btn ghost" data-mb-clear-inherited>Eliminar lecturas heredadas del NOVA</button>';
    }else if(params.length&&!liveKeys.length){
      stateClass='warn';
      message=`Hay ${params.length} parámetro${params.length===1?'':'s'} guardado${params.length===1?'':'s'}, pero todavía no llegó telemetría Modbus actual. La configuración se conserva; la pantalla queda esperando el próximo reporte.`;
    }else if(params.length&&liveKeys.length){
      stateClass='ok';
      message=`Configuración y telemetría concordantes: ${params.length} parámetro${params.length===1?'':'s'} registrado${params.length===1?'':'s'} y ${liveKeys.length} valor${liveKeys.length===1?'':'es'} recibido${liveKeys.length===1?'':'s'}.`;
    }else{
      message='No hay parámetros Modbus registrados ni lecturas actuales para este NOVA.';
    }

    const cadenceWarning=poll&&timeout&&poll<timeout
      ? '<div class="tayu-mb-consistency warn"><b>Atención:</b> Polling es menor que Timeout. Si una consulta tarda hasta el timeout, el ciclo solicitado no puede cumplirse de forma estable. Conviene que Polling sea igual o mayor que Timeout y dejar margen para todas las variables del ciclo.</div>'
      : '';

    box.innerHTML=`
      <div class="tayu-mb-sync-head"><div><h4>Sincronización Modbus</h4><div class="hint">Cada tiempo cumple una función distinta; no deben forzarse al mismo valor.</div></div></div>
      <div class="tayu-mb-sync-grid">
        <div class="tayu-mb-sync-item"><span>Timeout RS485</span><b>${timeout||'—'} ms</b><small class="hint">Máximo de espera por respuesta.</small></div>
        <div class="tayu-mb-sync-item"><span>Polling NOVA</span><b>${poll||'—'} ms</b><small class="hint">Cadencia de lectura en el equipo.</small></div>
        <div class="tayu-mb-sync-item"><span>Actualización pantalla</span><b>${screen/1000} s</b><small class="hint">Consulta visual de la plataforma.</small></div>
        <div class="tayu-mb-sync-item"><span>Histórico / gráficas</span><b>PostgreSQL</b><small class="hint">Usa timestamps reales; independiente de la pantalla.</small></div>
      </div>
      <div class="tayu-mb-consistency ${stateClass}">${message}${action}</div>
      ${cadenceWarning}
    `;
  }

  function scheduleRefresh(force=false,delay=80){
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(()=>renderSyncInfo(force),delay);
  }

  function installWrappers(){
    if(window.__tayuModbusConsistencyWrapped)return;
    window.__tayuModbusConsistencyWrapped=true;

    const originalAdd=window.addModbusParamRow;
    if(typeof originalAdd==='function'){
      window.addModbusParamRow=function(...args){
        const result=originalAdd.apply(this,args);
        setTimeout(()=>{ensureActionColumn();ensureEmptyRow();scheduleRefresh(false,20);},0);
        return result;
      };
    }

    const originalChanged=window.onModbusDeviceChanged;
    if(typeof originalChanged==='function'){
      window.onModbusDeviceChanged=async function(...args){
        const result=await originalChanged.apply(this,args);
        explicitEmptySave.delete(selectedDeviceKey());
        configCache.delete(selectedDeviceKey());
        ensureActionColumn();ensureEmptyRow();
        await renderSyncInfo(true);
        return result;
      };
    }

    const originalSave=window.saveModbusConfigFromPlatform;
    if(typeof originalSave==='function'){
      window.saveModbusConfigFromPlatform=async function(...args){
        const deviceKey=selectedDeviceKey();
        const status=document.getElementById('mbConfigStatus');
        if(!deviceKey)return originalSave.apply(this,args);
        let remote=null;
        try{remote=await getRemoteConfig(deviceKey,true);}catch(_){}
        const remoteParams=Array.isArray(remote?.parameters)?remote.parameters:[];
        const rows=rowCount();
        const liveKeys=Object.keys(liveModbus(deviceKey));

        // Si PostgreSQL tiene parámetros pero la tabla aparece vacía, no permitimos
        // que un fallo de render los borre.
        if(!rows&&remoteParams.length&&!explicitEmptySave.has(deviceKey)){
          if(status)status.textContent=`Protección activa: PostgreSQL tiene ${remoteParams.length} parámetros pero la tabla está vacía. Cambia de NOVA y vuelve o pulsa Actualizar antes de guardar.`;
          await renderSyncInfo(true);
          return;
        }

        // Caso observado: telemetría vieja existe, pero la plataforma no conoce
        // los registros. Guardar timeout/polling con params=[] limpiaría el NOVA.
        if(!rows&&!remoteParams.length&&liveKeys.length&&!explicitEmptySave.has(deviceKey)){
          if(status)status.textContent='No se guardó: hay lecturas heredadas sin parámetros registrados. Usa “Eliminar lecturas heredadas” si realmente quieres limpiarlas, o registra primero sus parámetros.';
          await renderSyncInfo(true);
          return;
        }

        const result=await originalSave.apply(this,args);
        explicitEmptySave.delete(deviceKey);
        configCache.delete(deviceKey);
        setTimeout(()=>{ensureActionColumn();ensureEmptyRow();renderSyncInfo(true);},1800);
        return result;
      };
    }

    const originalLive=window.refreshLiveTelemetry;
    if(typeof originalLive==='function'){
      window.refreshLiveTelemetry=async function(...args){
        const result=await originalLive.apply(this,args);
        if(document.getElementById('modbus')?.classList.contains('active'))scheduleRefresh(false,30);
        return result;
      };
    }
  }

  window.addEventListener('click',event=>{
    const nav=event.target?.closest?.('.nav button[data-view="modbus"]');
    if(nav){setTimeout(()=>{installWrappers();ensureActionColumn();ensureEmptyRow();renderSyncInfo(true);},220);return;}

    const remove=event.target?.closest?.('[data-mb-delete]');
    if(remove){
      event.preventDefault();
      const row=remove.closest('tr');
      const deviceKey=selectedDeviceKey();
      row?.remove();
      markDirty();
      ensureEmptyRow();
      if(rowCount()===0&&deviceKey)explicitEmptySave.add(deviceKey);
      scheduleRefresh(false,20);
      return;
    }

    const clearInherited=event.target?.closest?.('[data-mb-clear-inherited]');
    if(clearInherited){
      event.preventDefault();
      const deviceKey=selectedDeviceKey();
      if(!deviceKey)return;
      const ok=confirm('Esto enviará una lista vacía de parámetros Modbus al NOVA EDGE. Las lecturas heredadas dejarán de generarse. El histórico ya almacenado no se borra. ¿Continuar?');
      if(!ok)return;
      explicitEmptySave.add(deviceKey);
      window.saveModbusConfigFromPlatform?.();
    }
  },true);

  const modbus=document.getElementById('modbus');
  if(modbus){
    const update=event=>{
      const id=event.target?.id||'';
      if(['mbTimeout','mbPoll','mbChartPeriod','mbChartPoints','mbDeviceSelect'].includes(id))scheduleRefresh(false,80);
    };
    modbus.addEventListener('input',update);
    modbus.addEventListener('change',update);
  }

  window.addEventListener('tayu:client-access-ready',()=>{
    installWrappers();
    if(document.getElementById('modbus')?.classList.contains('active'))setTimeout(()=>renderSyncInfo(true),250);
  });
  window.addEventListener('pageshow',()=>{
    installWrappers();
    if(document.getElementById('modbus')?.classList.contains('active'))setTimeout(()=>renderSyncInfo(false),250);
  });

  installWrappers();
})();