(() => {
  'use strict';

  const SECTORS = new Set(['fincas','camaroneras','bananeras','ganaderia']);
  const DAYS = [['Lun',1],['Mar',2],['Mié',3],['Jue',4],['Vie',5],['Sáb',6],['Dom',7]];
  const cache = new Map();
  const timers = new Map();

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
  const canConfigure = () => ['owner','admin'].includes(String(
    window.__tayuClientAccess?.role || document.body?.dataset?.tayuRole || ''
  ).toLowerCase());

  function installStyles(){
    if(document.getElementById('tayuSectorOperationStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuSectorOperationStyles';
    style.textContent = `
      .tayu-op-box{margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--panel2)}
      .tayu-op-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}
      .tayu-op-head b{font-size:12px}.tayu-op-form{display:grid;grid-template-columns:1fr 1fr;gap:9px}
      .tayu-op-form label{display:block;margin:0 0 5px;font-size:11px;color:var(--muted);font-weight:800}
      .tayu-op-form select,.tayu-op-form input{width:100%;padding:9px 10px;border-radius:10px}
      .tayu-op-full{grid-column:1/-1}.tayu-op-panel{grid-column:1/-1;border-top:1px solid var(--border);padding-top:10px;margin-top:2px}
      .tayu-op-panel[hidden]{display:none}.tayu-op-note{font-size:11px;color:var(--muted);line-height:1.45;margin:0 0 9px}
      .tayu-op-rule{display:grid;grid-template-columns:1fr .7fr 1fr;gap:8px}.tayu-op-rule+.tayu-op-rule{margin-top:8px}
      .tayu-op-reading{margin-top:8px;padding:8px 10px;border-radius:10px;background:var(--panel);border:1px solid var(--border);font-size:11px;color:var(--muted)}
      .tayu-op-slot{padding-top:10px;margin-top:10px;border-top:1px solid var(--border)}.tayu-op-slot:first-child{padding-top:0;margin-top:0;border-top:0}
      .tayu-op-time{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tayu-op-days{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
      .tayu-op-day{display:flex!important;align-items:center;gap:4px!important;margin:0!important;padding:5px 7px;border:1px solid var(--border);border-radius:9px;background:var(--panel);font-size:10px!important}
      .tayu-op-day input{width:auto!important;padding:0!important;margin:0!important}
      .tayu-op-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}.tayu-op-actions .btn{padding:8px 11px;border-radius:10px;font-size:11px}
      .tayu-op-msg{min-height:17px;margin-top:6px;font-size:11px;color:var(--muted)}
      @media(max-width:760px){.tayu-op-form,.tayu-op-rule,.tayu-op-time{grid-template-columns:1fr}.tayu-op-full,.tayu-op-panel{grid-column:auto}.tayu-op-actions .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function deviceByKey(deviceKey){
    return (Array.isArray(window.__tayuRealDevices) ? window.__tayuRealDevices : [])
      .find(row => String(row?.device_key) === String(deviceKey)) || {};
  }

  function latestPayload(deviceKey){
    const rows = (Array.isArray(window.__tayuLastTelemetry) ? window.__tayuLastTelemetry : [])
      .filter(row => String(row?.device_key) === String(deviceKey))
      .sort((a,b) => new Date(b?.time || 0) - new Date(a?.time || 0));
    const value = rows[0]?.payload;
    if(value && typeof value === 'object') return value;
    if(typeof value === 'string'){
      try{return JSON.parse(value);}catch(_){}
    }
    return {};
  }

  function readPath(obj,path){
    return String(path || '').split('.').filter(Boolean).reduce((acc,key) => acc == null ? undefined : acc[key], obj);
  }

  function legacyOutput(device,outputKey){
    return device?.configuration?.outputs?.[outputKey] || {};
  }

  function effectiveSettings(resource,device,outputKey){
    const saved = resource?.assignment?.settings || {};
    const legacy = legacyOutput(device,outputKey);
    const legacyTimers = Array.isArray(legacy.timers) ? legacy.timers : (legacy.timer ? [legacy.timer] : []);
    const savedTimers = Array.isArray(saved.timers) ? saved.timers : (saved.timer ? [saved.timer] : []);
    return {
      ...saved,
      mode: saved.mode || legacy.mode || 'manual',
      automatic: {
        source:'', on_operator:'<=', on_value:null, off_operator:'>=', off_value:null, fail_safe:'off',
        ...(legacy.automatic || {}), ...(saved.automatic || {})
      },
      timers: savedTimers.length ? savedTimers : legacyTimers
    };
  }

  function effectiveApplication(resource,device,outputKey){
    const legacy = legacyOutput(device,outputKey);
    return resource?.assignment?.application || legacy.application || legacy.type || resource?.default_application || 'generic';
  }

  function effectiveName(resource,device,outputKey){
    const legacy = legacyOutput(device,outputKey);
    return resource?.assignment?.display_name || legacy.name || `Relay ${String(outputKey).replace(/\D/g,'') || outputKey}`;
  }

  function rs485Signals(deviceKey){
    const device = deviceByKey(deviceKey);
    const signals = device?.configuration?.signals || {};
    const payload = latestPayload(deviceKey);
    return Object.entries(signals).map(([path,meta]) => {
      const m = meta && typeof meta === 'object' ? meta : {};
      return {
        path,
        label: m.name || m.label || m.display_name || path,
        unit: m.unit || '',
        value: readPath(payload,path)
      };
    }).sort((a,b) => String(a.label).localeCompare(String(b.label)));
  }

  function signalOptions(deviceKey,selected=''){
    const signals = rs485Signals(deviceKey);
    const options = ['<option value="">Seleccionar sensor RS485…</option>'];
    signals.forEach(signal => {
      options.push(`<option value="${esc(signal.path)}" ${signal.path===selected?'selected':''}>RS485 · ${esc(signal.label)}${signal.unit?` (${esc(signal.unit)})`:''}</option>`);
    });
    if(selected && !signals.some(signal => signal.path === selected)){
      options.push(`<option value="${esc(selected)}" selected>${esc(selected)} · configuración anterior</option>`);
    }
    return options.join('');
  }

  function signalReading(deviceKey,path){
    if(!path) return 'Selecciona un sensor RS485 previamente registrado.';
    const signal = rs485Signals(deviceKey).find(item => item.path === path);
    if(!signal) return 'Sensor guardado; lectura actual no disponible.';
    return `Lectura actual: ${signal.value === undefined ? '—' : signal.value}${signal.unit ? ` ${signal.unit}` : ''}`;
  }

  const operatorOptions = value => ['<=','<','>=','>','==']
    .map(op => `<option value="${op}" ${op===value?'selected':''}>${op}</option>`).join('');

  function timerSlot(timer,index){
    const days = Array.isArray(timer?.days) && timer.days.length ? timer.days : [1,2,3,4,5,6,7];
    return `<div class="tayu-op-slot" data-op-timer-slot="${index}">
      <b>Horario ${index+1}</b>
      <div class="tayu-op-time">
        <div><label>Encender</label><input type="time" data-op-timer="on" value="${esc(timer?.on || '')}"></div>
        <div><label>Apagar</label><input type="time" data-op-timer="off" value="${esc(timer?.off || '')}"></div>
      </div>
      <label style="margin-top:8px">Días</label>
      <div class="tayu-op-days">${DAYS.map(([label,day]) => `<label class="tayu-op-day"><input type="checkbox" data-op-day="${day}" ${days.includes(day)?'checked':''}>${label}</label>`).join('')}</div>
    </div>`;
  }

  function editorHtml(deviceKey,outputKey,resource){
    const device = deviceByKey(deviceKey);
    const settings = effectiveSettings(resource,device,outputKey);
    const automatic = settings.automatic || {};
    const mode = settings.mode || 'manual';
    const schedules = settings.timers || [];
    const signals = rs485Signals(deviceKey);

    return `<div class="tayu-op-box" data-op-editor>
      <div class="tayu-op-head"><b>Modo de operación</b><span class="tayu-sector-pill">${mode==='automatic'?'⚙ Automático':mode==='timer'?'🕒 Timer':'👆 Manual'}</span></div>
      <div class="tayu-op-form">
        <div class="tayu-op-full"><label>Modo</label><select data-op-role="mode"><option value="manual" ${mode==='manual'?'selected':''}>👆 Manual</option><option value="automatic" ${mode==='automatic'?'selected':''}>⚙ Automático por sensor</option><option value="timer" ${mode==='timer'?'selected':''}>🕒 Timer / horarios</option></select></div>

        <div class="tayu-op-panel" data-op-panel="manual" ${mode==='manual'?'':'hidden'}>
          <p class="tayu-op-note">El equipo se controla directamente con el botón de encendido/apagado de esta tarjeta.</p>
        </div>

        <div class="tayu-op-panel" data-op-panel="automatic" ${mode==='automatic'?'':'hidden'}>
          <p class="tayu-op-note">Automatiza esta salida usando un sensor RS485 previamente registrado.</p>
          <label>Sensor / señal RS485</label>
          <select data-op-role="automatic.source">${signalOptions(deviceKey,automatic.source || '')}</select>
          <div class="tayu-op-reading" data-op-reading>${esc(signalReading(deviceKey,automatic.source || ''))}</div>
          ${signals.length ? '' : '<div class="tayu-op-reading">No hay sensores RS485 registrados todavía en este dispositivo.</div>'}
          <div class="tayu-op-rule" style="margin-top:10px">
            <div><label>Encender cuando</label><select data-op-role="automatic.on_operator">${operatorOptions(automatic.on_operator || '<=')}</select></div>
            <div><label>Valor</label><input type="number" step="any" data-op-role="automatic.on_value" value="${automatic.on_value ?? ''}"></div>
            <div><label>Falla de sensor</label><select data-op-role="automatic.fail_safe"><option value="off" ${automatic.fail_safe==='off'?'selected':''}>Apagar salida</option><option value="hold" ${automatic.fail_safe==='hold'?'selected':''}>Mantener último estado</option></select></div>
          </div>
          <div class="tayu-op-rule">
            <div><label>Apagar cuando</label><select data-op-role="automatic.off_operator">${operatorOptions(automatic.off_operator || '>=')}</select></div>
            <div><label>Valor</label><input type="number" step="any" data-op-role="automatic.off_value" value="${automatic.off_value ?? ''}"></div>
            <div></div>
          </div>
        </div>

        <div class="tayu-op-panel" data-op-panel="timer" ${mode==='timer'?'':'hidden'}>
          <p class="tayu-op-note">Configura hasta dos horarios. La programación queda asociada al relay aunque el NOVA cambie de sector.</p>
          ${timerSlot(schedules[0] || {on:'06:00',off:'08:00',days:[1,2,3,4,5,6,7]},0)}
          ${timerSlot(schedules[1] || {on:'',off:'',days:[1,2,3,4,5,6,7]},1)}
        </div>
      </div>
      <div class="tayu-op-actions"><button type="button" class="btn" data-op-save>Guardar modo</button></div>
      <div class="tayu-op-msg"></div>
    </div>`;
  }

  async function loadResourceData(deviceKey,force=false){
    const key = String(deviceKey || '');
    if(!force && cache.has(key)) return cache.get(key);
    if(typeof window.__tayuApi !== 'function') throw new Error('API no disponible');
    const data = await window.__tayuApi(`/devices/iot-resources?device_key=${encodeURIComponent(key)}`);
    cache.set(key,data);
    return data;
  }

  function syncPanels(editor){
    const mode = editor.querySelector('[data-op-role="mode"]')?.value || 'manual';
    editor.querySelectorAll('[data-op-panel]').forEach(panel => panel.hidden = panel.dataset.opPanel !== mode);
    const badge = editor.querySelector('.tayu-op-head .tayu-sector-pill');
    if(badge) badge.textContent = mode==='automatic' ? '⚙ Automático' : mode==='timer' ? '🕒 Timer' : '👆 Manual';
  }

  async function decorateSector(sector,force=false){
    if(!SECTORS.has(sector)) return;
    installStyles();
    const view = document.getElementById(sector);
    if(!view) return;
    const cards = [...view.querySelectorAll('[data-sector-output][data-device-key]')];
    if(!cards.length) return;

    const keys = [...new Set(cards.map(card => card.dataset.deviceKey).filter(Boolean))];
    const dataByDevice = new Map();
    await Promise.all(keys.map(async key => {
      try{dataByDevice.set(key,await loadResourceData(key,force));}catch(error){console.error('Sector operation resources:',key,error);}
    }));

    cards.forEach(card => {
      if(card.querySelector('[data-op-editor]')) return;
      const deviceKey = card.dataset.deviceKey;
      const outputKey = card.dataset.sectorOutput;
      const data = dataByDevice.get(deviceKey);
      const resource = data?.resources?.find(item => String(item.resource_key) === String(outputKey));
      if(!resource) return;

      const existingDetail = card.querySelector('.tayu-sector-mode-detail');
      if(existingDetail) existingDetail.remove();

      const mode = effectiveSettings(resource,deviceByKey(deviceKey),outputKey).mode || 'manual';
      const topBadge = card.querySelector('.tayu-sector-resource-top > .tayu-sector-pill');
      if(topBadge) topBadge.textContent = mode==='automatic' ? 'Automático' : mode==='timer' ? 'Timer' : 'Manual';

      if(!canConfigure()) return;
      const control = card.querySelector('.tayu-sector-control');
      const wrap = document.createElement('div');
      wrap.innerHTML = editorHtml(deviceKey,outputKey,resource);
      const editor = wrap.firstElementChild;
      editor.dataset.deviceKey = deviceKey;
      editor.dataset.outputKey = outputKey;
      editor.dataset.sector = sector;
      if(control) card.insertBefore(editor,control); else card.appendChild(editor);
    });
  }

  function scheduleDecorate(sector,force=false){
    if(!SECTORS.has(sector)) return;
    (timers.get(sector) || []).forEach(clearTimeout);
    const delays = sector === 'bananeras' ? [250,900,1600] : [200,700,1300];
    timers.set(sector,delays.map(delay => setTimeout(() => decorateSector(sector,force),delay)));
  }

  function numberOrNull(value){
    if(value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function collectTimers(editor){
    return [...editor.querySelectorAll('[data-op-timer-slot]')].map(slot => ({
      on: slot.querySelector('[data-op-timer="on"]')?.value || '',
      off: slot.querySelector('[data-op-timer="off"]')?.value || '',
      days: [...slot.querySelectorAll('[data-op-day]:checked')].map(input => Number(input.dataset.opDay))
    })).filter(slot => slot.on || slot.off);
  }

  async function saveOperation(editor){
    const deviceKey = editor.dataset.deviceKey;
    const outputKey = editor.dataset.outputKey;
    const sector = editor.dataset.sector;
    const msg = editor.querySelector('.tayu-op-msg');
    try{
      const data = await loadResourceData(deviceKey,false);
      const resource = data?.resources?.find(item => String(item.resource_key) === String(outputKey));
      if(!resource) throw new Error('No se encontró el recurso físico.');
      const device = deviceByKey(deviceKey);
      const mode = editor.querySelector('[data-op-role="mode"]')?.value || 'manual';
      const settings = {...(resource.assignment?.settings || {})};
      settings.mode = mode;
      settings.automatic = {
        source: editor.querySelector('[data-op-role="automatic.source"]')?.value || '',
        on_operator: editor.querySelector('[data-op-role="automatic.on_operator"]')?.value || '<=',
        on_value: numberOrNull(editor.querySelector('[data-op-role="automatic.on_value"]')?.value),
        off_operator: editor.querySelector('[data-op-role="automatic.off_operator"]')?.value || '>=',
        off_value: numberOrNull(editor.querySelector('[data-op-role="automatic.off_value"]')?.value),
        fail_safe: editor.querySelector('[data-op-role="automatic.fail_safe"]')?.value || 'off'
      };
      settings.timers = collectTimers(editor);

      if(mode === 'automatic' && !settings.automatic.source) throw new Error('Selecciona un sensor RS485 para el modo automático.');
      if(mode === 'automatic' && (settings.automatic.on_value === null || settings.automatic.off_value === null)) throw new Error('Completa los valores de encendido y apagado.');
      if(mode === 'timer' && !settings.timers.some(slot => slot.on && slot.off)) throw new Error('Configura al menos un horario completo.');

      msg.style.color = 'var(--muted)';
      msg.textContent = 'Guardando…';
      await window.__tayuApiPost('/devices/iot-resources', {
        device_key: deviceKey,
        resource_key: outputKey,
        application: effectiveApplication(resource,device,outputKey),
        display_name: effectiveName(resource,device,outputKey),
        enabled: resource.assignment?.enabled !== false,
        settings
      });

      cache.delete(deviceKey);
      msg.textContent = 'Guardado.';
      if(typeof window.__tayuRenderSectorIot === 'function') await window.__tayuRenderSectorIot(sector,true);
      scheduleDecorate(sector,true);
    }catch(error){
      msg.textContent = error.message || 'No se pudo guardar.';
      msg.style.color = 'var(--danger)';
    }
  }

  document.addEventListener('change', event => {
    const mode = event.target?.closest?.('[data-op-role="mode"]');
    if(mode){syncPanels(mode.closest('[data-op-editor]'));return;}
    const sensor = event.target?.closest?.('[data-op-role="automatic.source"]');
    if(sensor){
      const editor = sensor.closest('[data-op-editor]');
      const reading = editor?.querySelector('[data-op-reading]');
      if(reading) reading.textContent = signalReading(editor.dataset.deviceKey,sensor.value);
    }
  }, true);

  document.addEventListener('click', event => {
    const nav = event.target?.closest?.('.nav button[data-view]');
    const sector = nav?.dataset?.view;
    if(SECTORS.has(sector)){
      scheduleDecorate(sector,false);
      return;
    }

    const refresh = event.target?.closest?.('[data-sector-iot-refresh]');
    if(refresh){
      const currentSector = refresh.dataset.sectorIotRefresh;
      cache.clear();
      scheduleDecorate(currentSector,true);
      return;
    }

    const save = event.target?.closest?.('[data-op-save]');
    if(save){
      event.preventDefault();
      saveOperation(save.closest('[data-op-editor]'));
    }
  }, true);

  window.addEventListener('tayu:client-access-ready', () => {
    for(const sector of SECTORS){
      if(document.getElementById(sector)?.classList.contains('active')) scheduleDecorate(sector,false);
    }
  });

  window.addEventListener('pageshow', () => {
    for(const sector of SECTORS){
      if(document.getElementById(sector)?.classList.contains('active')) scheduleDecorate(sector,false);
    }
  });
})();
