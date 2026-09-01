/* TAYULABS Cloud - Exportacion CSV generica por sensor
 * Usa GET /telemetry/export.csv y la sesion Keycloak ya autenticada.
 * No modifica la logica base de sensores: agrega una columna de descarga
 * despues de que renderSensorTable() termina.
 */
(function(){
  'use strict';

  const API_BASE='https://api.tayulabs.com';
  let selectedSensor=null;

  function sensors(){
    try{
      return (typeof platformSensors!=='undefined' && Array.isArray(platformSensors))
        ? platformSensors
        : [];
    }catch(_){
      return [];
    }
  }

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

  function injectStyles(){
    if(document.getElementById('tayuSensorCsvStyles'))return;
    const style=document.createElement('style');
    style.id='tayuSensorCsvStyles';
    style.textContent=`
      .tayu-csv-head,.tayu-csv-cell{text-align:center!important;width:74px}
      .tayu-csv-btn{
        width:34px;height:34px;padding:0!important;border-radius:11px!important;
        display:inline-grid;place-items:center;font-size:19px;line-height:1;
        background:var(--panel2)!important;color:var(--text)!important;
        border:1px solid var(--border)!important;cursor:pointer;
      }
      .tayu-csv-btn:hover{border-color:var(--brand)!important;color:var(--brand)!important}
      .tayu-csv-btn:disabled{opacity:.45;cursor:not-allowed}
      #tayuSensorCsvModal .modal-card{width:min(590px,100%)}
      .tayu-csv-info{
        display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:4px 0 14px;
      }
      .tayu-csv-info>div{
        background:var(--panel2);border:1px solid var(--border);border-radius:14px;padding:11px 12px;
        min-width:0;
      }
      .tayu-csv-info span{display:block;color:var(--muted);font-size:11px;font-weight:850;margin-bottom:4px}
      .tayu-csv-info b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
      .tayu-csv-custom{display:none;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
      .tayu-csv-custom.open{display:grid}
      .tayu-csv-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;flex-wrap:wrap}
      .tayu-csv-status{min-height:20px;margin-top:10px;font-size:12px;color:var(--muted);font-weight:750}
      .tayu-csv-status.error{display:block;color:var(--danger)}
      .tayu-csv-note{font-size:12px;color:var(--muted);line-height:1.45;margin:10px 0 0}
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
          <div>
            <label for="tayuCsvFrom">Desde</label>
            <input id="tayuCsvFrom" type="datetime-local">
          </div>
          <div>
            <label for="tayuCsvTo">Hasta</label>
            <input id="tayuCsvTo" type="datetime-local">
          </div>
        </div>

        <p class="tayu-csv-note" id="tayuCsvNote">La fecha y hora se exportan en formato ISO para conservar el instante exacto de cada muestra.</p>
        <div class="tayu-csv-status" id="tayuCsvStatus"></div>

        <div class="tayu-csv-actions">
          <button type="button" class="btn ghost" id="tayuCsvCancel">Cancelar</button>
          <button type="button" class="btn" id="tayuCsvDownload">↓ Descargar CSV</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const period=document.getElementById('tayuCsvPeriod');
    const close=()=>closeModal();
    document.getElementById('tayuCsvClose').addEventListener('click',close);
    document.getElementById('tayuCsvCancel').addEventListener('click',close);
    document.getElementById('tayuCsvDownload').addEventListener('click',downloadSelectedSensorCsv);
    period.addEventListener('change',updatePeriodUi);
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
    injectStyles();
    ensureModal();
    selectedSensor=sensor;

    document.getElementById('tayuCsvVariable').textContent=sensor.name||sensor.sourcePath;
    document.getElementById('tayuCsvDevice').textContent=sensor.deviceKey;
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
      if(!fromValue||!toValue||Number.isNaN(from.getTime())||Number.isNaN(to.getTime())){
        throw new Error('Selecciona una fecha inicial y una fecha final válidas.');
      }
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

      const period=document.getElementById('tayuCsvPeriod')?.value||'24h';
      const range=periodDates(period);
      const params=new URLSearchParams({
        device_key:sensor.deviceKey,
        source_path:sensor.sourcePath
      });
      if(range.from&&range.to){
        params.set('from',range.from.toISOString());
        params.set('to',range.to.toISOString());
      }

      const response=await fetch(`${API_BASE}/telemetry/export.csv?${params.toString()}`,{
        headers:{Authorization:`Bearer ${kc.token}`}
      });

      if(!response.ok){
        let message=`No se pudo generar el CSV (HTTP ${response.status}).`;
        try{
          const data=await response.json();
          if(data?.error)message=data.error;
        }catch(_){}
        throw new Error(message);
      }

      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download=`${safeFilePart(sensor.deviceKey)}-${safeFilePart(sensor.name||sensor.sourcePath)}-${range.label}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
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

  function enhanceSensorTable(){
    const table=document.getElementById('sensorTable');
    if(!table)return;
    const rows=Array.from(table.rows||[]);
    if(!rows.length)return;

    const header=rows[0];
    let head=header.querySelector('[data-tayu-csv-head]');
    if(!head){
      head=document.createElement('th');
      head.className='tayu-csv-head';
      head.dataset.tayuCsvHead='1';
      head.textContent='CSV';
      header.appendChild(head);
    }

    const list=sensors();
    rows.slice(1).forEach((row,index)=>{
      let cell=row.querySelector('[data-tayu-csv-cell]');
      if(!cell){
        cell=document.createElement('td');
        cell.className='tayu-csv-cell';
        cell.dataset.tayuCsvCell='1';
        row.appendChild(cell);
      }
      cell.replaceChildren();
      const sensor=list[index];
      if(!sensor?.deviceKey||!sensor?.sourcePath){
        cell.textContent='—';
        return;
      }
      const button=document.createElement('button');
      button.type='button';
      button.className='tayu-csv-btn';
      button.title=`Descargar historial de ${sensor.name||sensor.sourcePath}`;
      button.setAttribute('aria-label',button.title);
      button.textContent='↓';
      button.addEventListener('click',()=>openModal(sensor));
      cell.appendChild(button);
    });
  }

  function install(){
    injectStyles();
    ensureModal();

    const original=window.renderSensorTable;
    if(typeof original==='function'&&!original.__tayuCsvWrapped){
      const wrapped=function(){
        const result=original.apply(this,arguments);
        enhanceSensorTable();
        return result;
      };
      wrapped.__tayuCsvWrapped=true;
      window.renderSensorTable=wrapped;
    }

    enhanceSensorTable();
    setTimeout(enhanceSensorTable,350);
    setTimeout(enhanceSensorTable,1000);
  }

  window.openSensorCsvExport=openModal;
  window.downloadSelectedSensorCsv=downloadSelectedSensorCsv;

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
