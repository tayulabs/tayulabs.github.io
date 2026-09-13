(() => {
  'use strict';

  let currentDeviceKey = '';
  let currentData = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sectorLabel = value => ({fincas:'Fincas',camaroneras:'Camaroneras',bananeras:'Bananeras',ganaderia:'Ganadería'})[String(value || '').toLowerCase()] || 'Sin sector';
  const roleCanConfigure = () => ['owner','admin'].includes(String(window.__tayuClientAccess?.role || document.body?.dataset?.tayuRole || '').toLowerCase());
  const DAYS = [['Lun',1],['Mar',2],['Mié',3],['Jue',4],['Vie',5],['Sáb',6],['Dom',7]];

  function refreshDevices(){const button=document.getElementById('tdRefresh');if(button&&!button.disabled)button.click();}
  function refreshAdmin(){const button=document.getElementById('tcaRefreshBtn');if(button&&!button.disabled)button.click();}
  function syncActiveView(){if(document.getElementById('dispositivos')?.classList.contains('active'))refreshDevices();if(document.getElementById('clientAdminNavButton')?.classList.contains('active'))refreshAdmin();}

  function installStyles(){
    if(document.getElementById('tayu-iot-resource-styles'))return;
    const style=document.createElement('style');style.id='tayu-iot-resource-styles';style.textContent=`
      #dispositivos .td-iot-footer{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:13px;padding-top:12px;border-top:1px solid var(--border)}
      #dispositivos .td-iot-sector{font-size:11px;color:var(--muted);font-weight:800}
      #dispositivos .td-iot-configure{padding:9px 12px;border-radius:12px;font-size:12px}
      .tayu-iot-modal{display:none;position:fixed;inset:0;z-index:2147483200;background:rgba(0,0,0,.46);padding:22px;align-items:center;justify-content:center}
      .tayu-iot-modal.open{display:flex}.tayu-iot-dialog{width:min(1080px,100%);max-height:90vh;overflow:auto;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:26px;padding:20px;box-shadow:var(--shadow)}
      .tayu-iot-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}.tayu-iot-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.tayu-iot-pill{padding:6px 9px;border-radius:999px;background:var(--panel2);border:1px solid var(--border);font-size:11px;font-weight:850}
      .tayu-iot-group{margin-top:18px}.tayu-iot-group h4{margin:0 0 9px}.tayu-iot-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tayu-iot-resource{border:1px solid var(--border);border-radius:18px;padding:14px;background:var(--panel2)}
      .tayu-iot-resource-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.tayu-iot-resource-top h5{margin:0;font-size:15px}.tayu-iot-key{font-size:10px;color:var(--muted);margin-top:3px}.tayu-iot-state{padding:5px 8px;border-radius:999px;font-size:10px;font-weight:900;background:rgba(245,158,11,.12);color:var(--warning)}.tayu-iot-state.ok{background:rgba(91,193,47,.12);color:var(--brand)}
      .tayu-iot-form{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:11px}.tayu-iot-form .full{grid-column:1/-1}.tayu-iot-form label{margin:0 0 5px;font-size:11px}.tayu-iot-form input,.tayu-iot-form select{padding:10px;border-radius:11px}
      .tayu-mode-panel{grid-column:1/-1;border:1px solid var(--border);background:var(--panel);border-radius:14px;padding:12px}.tayu-mode-panel[hidden]{display:none}.tayu-mode-panel h6{margin:0 0 6px;font-size:12px}.tayu-mode-note{font-size:11px;color:var(--muted);line-height:1.45;margin:0 0 10px}
      .tayu-rule-grid,.tayu-timer-grid{display:grid;grid-template-columns:1fr .75fr 1fr;gap:8px}.tayu-timer-grid{grid-template-columns:1fr 1fr}.tayu-days{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.tayu-day{display:flex!important;align-items:center;gap:4px!important;margin:0!important;padding:6px 8px;border:1px solid var(--border);border-radius:10px;background:var(--panel2);font-size:10px!important}.tayu-day input{width:auto!important;padding:0!important;margin:0!important}
      .tayu-timer-slot{border-top:1px solid var(--border);padding-top:10px;margin-top:10px}.tayu-timer-slot:first-child{border-top:0;padding-top:0;margin-top:0}.tayu-signal-reading{margin-top:8px;padding:8px 10px;border-radius:10px;background:var(--panel2);font-size:11px;color:var(--muted)}
      .tayu-iot-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:11px}.tayu-iot-actions .btn{padding:9px 11px;border-radius:11px;font-size:12px}.tayu-iot-msg{min-height:18px;margin-top:7px;font-size:11px;color:var(--muted)}
      @media(max-width:760px){.tayu-iot-modal{padding:8px;align-items:flex-start;padding-top:54px}.tayu-iot-dialog{max-height:86vh;border-radius:20px;padding:14px}.tayu-iot-grid,.tayu-iot-form,.tayu-rule-grid,.tayu-timer-grid{grid-template-columns:1fr}.tayu-iot-form .full{grid-column:auto}.tayu-iot-head{flex-direction:column}.tayu-iot-head .btn{width:100%}#dispositivos .td-iot-footer{align-items:stretch;flex-direction:column}#dispositivos .td-iot-configure{width:100%}}
    `;document.head.appendChild(style);
  }

  function decorateDevices(){
    if(!roleCanConfigure())return;installStyles();
    const devices=Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[];
    document.querySelectorAll('#tdGrid .td-card').forEach(card=>{
      const key=card.querySelector('.td-key')?.textContent?.trim();if(!key)return;
      const device=devices.find(row=>String(row.device_key)===key);
      let footer=card.querySelector('.td-iot-footer');
      if(!footer){footer=document.createElement('div');footer.className='td-iot-footer';footer.innerHTML='<span class="td-iot-sector"></span><button type="button" class="btn ghost td-iot-configure">⚙ Configurar IoT</button>';card.appendChild(footer);}
      footer.querySelector('.td-iot-sector').textContent=`Sector: ${sectorLabel(device?.site_sector)}`;
      footer.querySelector('.td-iot-configure').dataset.deviceKey=key;
    });
  }

  function realDevice(){return (Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[]).find(row=>String(row.device_key)===currentDeviceKey)||{};}
  function latestPayload(){
    const rows=Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[];
    const row=rows.filter(x=>String(x?.device_key)===currentDeviceKey).sort((a,b)=>new Date(b?.time||0)-new Date(a?.time||0))[0];
    const value=row?.payload;if(value&&typeof value==='object')return value;if(typeof value==='string'){try{return JSON.parse(value)}catch(_){}}return {};
  }
  function readPath(obj,path){return String(path||'').split('.').filter(Boolean).reduce((acc,key)=>acc==null?undefined:acc[key],obj);}

  function resourceLabel(resource){const key=String(resource?.resource_key||'');if(/^relay\d+$/i.test(key))return`Relay ${key.replace(/\D/g,'')}`;if(/^din\d+$/i.test(key))return`Entrada digital ${key.replace(/\D/g,'')}`;if(key==='rs485')return'RS485 / Modbus';if(key==='gps')return'GPS externo / ubicación';return key||'Recurso';}
  const groupLabel=type=>({digital_output:'Salidas',digital_input:'Entradas',interface:'Comunicación',location:'Ubicación / opcional',sensor:'Sensores'})[type]||'Otros recursos';

  function legacyOutput(resource){return realDevice()?.configuration?.outputs?.[resource.resource_key]||{};}
  function effectiveSettings(resource){
    const saved=resource.assignment?.settings||{};const legacy=legacyOutput(resource);const firstLegacyTimer=legacy.timer&&typeof legacy.timer==='object'?legacy.timer:null;
    const timers=Array.isArray(saved.timers)&&saved.timers.length?saved.timers:(saved.timer?[saved.timer]:(firstLegacyTimer?[firstLegacyTimer]:[]));
    return {
      ...saved,
      mode:saved.mode||legacy.mode||'manual',
      automatic:{source:'',on_operator:'<=',on_value:null,off_operator:'>=',off_value:null,fail_safe:'off',...(legacy.automatic||{}),...(saved.automatic||{})},
      timers
    };
  }
  function effectiveApplication(resource){const legacy=legacyOutput(resource);return resource.assignment?.application||legacy.application||legacy.type||resource.default_application||'';}
  function effectiveName(resource){const legacy=legacyOutput(resource);return resource.assignment?.display_name||legacy.name||resourceLabel(resource);}

  function applicationOptions(resource){
    const choices={
      digital_output:[['generic','Salida genérica'],['aerator','Aireador eléctrico'],['feeder','Alimentador automático'],['irrigation_pump','Bomba de riego'],['water_pump','Bomba de agua'],['well_pump','Bomba de pozo'],['valve','Válvula'],['motor','Motor'],['lighting','Iluminación']],
      digital_input:[['generic_input','Entrada genérica'],['float_switch','Flotador / nivel'],['pump_state','Estado de bomba'],['pressure_switch','Presostato'],['alarm','Alarma'],['dry_contact','Contacto seco']],
      interface:[['modbus','Modbus RS485'],['interface','Interfaz genérica']],location:[['tracking','Tracking / ubicación']],sensor:[['sensor','Sensor']]
    };
    const current=effectiveApplication(resource);const list=[...(choices[resource.resource_type]||[['generic','Genérico']])];if(current&&!list.some(([value])=>value===current))list.unshift([current,current]);
    return list.map(([value,label])=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`).join('');
  }

  function registeredRs485Signals(){
    const device=realDevice();const signals=device?.configuration?.signals||{};const payload=latestPayload();
    return Object.entries(signals).map(([path,meta])=>{
      const m=meta&&typeof meta==='object'?meta:{};const label=m.name||m.label||m.display_name||path;const unit=m.unit||'';const value=readPath(payload,path);
      return {path,label,unit,value};
    }).sort((a,b)=>String(a.label).localeCompare(String(b.label)));
  }
  function signalOptions(selected=''){
    const signals=registeredRs485Signals();
    const options=['<option value="">Seleccionar sensor RS485…</option>'];
    signals.forEach(signal=>options.push(`<option value="${esc(signal.path)}" ${signal.path===selected?'selected':''}>RS485 · ${esc(signal.label)}${signal.unit?` (${esc(signal.unit)})`:''}</option>`));
    if(selected&&!signals.some(x=>x.path===selected))options.push(`<option value="${esc(selected)}" selected>${esc(selected)} · configuración anterior</option>`);
    return options.join('');
  }
  function selectedSignalReading(path){const s=registeredRs485Signals().find(x=>x.path===path);if(!s)return path?'Sensor guardado; lectura no disponible.':'Selecciona un sensor RS485 previamente registrado.';return `Lectura actual: ${s.value===undefined?'—':s.value}${s.unit?` ${s.unit}`:''}`;}
  const operatorOptions=value=>['<=','<','>=','>','=='].map(op=>`<option value="${op}" ${op===value?'selected':''}>${op}</option>`).join('');

  function timerSlot(timer,index){
    const days=Array.isArray(timer?.days)&&timer.days.length?timer.days:[1,2,3,4,5,6,7];
    return `<div class="tayu-timer-slot" data-timer-slot="${index}"><b>Horario ${index+1}</b><div class="tayu-timer-grid"><div><label>Encender</label><input type="time" data-timer-role="on" value="${esc(timer?.on||'')}"></div><div><label>Apagar</label><input type="time" data-timer-role="off" value="${esc(timer?.off||'')}"></div></div><label>Días</label><div class="tayu-days">${DAYS.map(([label,day])=>`<label class="tayu-day"><input type="checkbox" data-timer-day="${day}" ${days.includes(day)?'checked':''}>${label}</label>`).join('')}</div></div>`;
  }

  function outputModeEditor(resource){
    const settings=effectiveSettings(resource);const automatic=settings.automatic||{};const timers=settings.timers||[];const mode=settings.mode||'manual';
    return `<div class="full"><label>Modo de operación</label><select data-iot-role="mode"><option value="manual" ${mode==='manual'?'selected':''}>👆 Manual</option><option value="automatic" ${mode==='automatic'?'selected':''}>⚙️ Automático por sensor</option><option value="timer" ${mode==='timer'?'selected':''}>🕒 Timer / horarios</option></select></div>
      <div class="tayu-mode-panel" data-iot-mode-panel="manual" ${mode==='manual'?'':'hidden'}><h6>👆 Control manual</h6><p class="tayu-mode-note">La salida se controla directamente desde el sector donde esté asignado el dispositivo.</p></div>
      <div class="tayu-mode-panel" data-iot-mode-panel="automatic" ${mode==='automatic'?'':'hidden'}><h6>⚙️ Automático por sensor RS485</h6><p class="tayu-mode-note">Selecciona un sensor previamente registrado en este dispositivo. Más adelante podremos sumar 0–10 V y 4–20 mA sin cambiar esta estructura.</p><label>Sensor / señal RS485</label><select data-iot-role="automatic.source">${signalOptions(automatic.source||'')}</select><div class="tayu-signal-reading" data-iot-signal-reading>${esc(selectedSignalReading(automatic.source||''))}</div><div class="tayu-rule-grid" style="margin-top:10px"><div><label>Encender cuando</label><select data-iot-role="automatic.on_operator">${operatorOptions(automatic.on_operator||'<=')}</select></div><div><label>Valor</label><input type="number" step="any" data-iot-role="automatic.on_value" value="${automatic.on_value??''}"></div><div><label>Falla de sensor</label><select data-iot-role="automatic.fail_safe"><option value="off" ${automatic.fail_safe==='off'?'selected':''}>Apagar salida</option><option value="hold" ${automatic.fail_safe==='hold'?'selected':''}>Mantener último estado</option></select></div></div><div class="tayu-rule-grid" style="margin-top:8px"><div><label>Apagar cuando</label><select data-iot-role="automatic.off_operator">${operatorOptions(automatic.off_operator||'>=')}</select></div><div><label>Valor</label><input type="number" step="any" data-iot-role="automatic.off_value" value="${automatic.off_value??''}"></div><div></div></div></div>
      <div class="tayu-mode-panel" data-iot-mode-panel="timer" ${mode==='timer'?'':'hidden'}><h6>🕒 Timer / horarios</h6><p class="tayu-mode-note">Configura hasta dos horarios para esta salida. La configuración queda asociada al relay y se conserva aunque el dispositivo cambie de sector.</p>${timerSlot(timers[0]||{on:'06:00',off:'08:00',days:[1,2,3,4,5,6,7]},0)}${timerSlot(timers[1]||{on:'',off:'',days:[1,2,3,4,5,6,7]},1)}</div>`;
  }

  function renderResource(resource){
    const a=resource.assignment;const output=resource.resource_type==='digital_output';
    return `<article class="tayu-iot-resource" data-iot-resource="${esc(resource.resource_key)}"><div class="tayu-iot-resource-top"><div><h5>${esc(resourceLabel(resource))}</h5><div class="tayu-iot-key">${esc(resource.resource_key)} · ${esc(resource.resource_type)}</div></div><span class="tayu-iot-state ${a?'ok':''}">${a?'CONFIGURADO':'SIN CONFIGURAR'}</span></div><div class="tayu-iot-form"><div><label>${output?'Aplicación / equipo':'Función'}</label><select data-iot-role="application">${applicationOptions(resource)}</select></div><div><label>Nombre visible</label><input data-iot-role="display_name" value="${esc(effectiveName(resource))}"></div>${output?outputModeEditor(resource):''}<div class="full"><label style="display:flex;align-items:center;gap:8px"><input data-iot-role="enabled" type="checkbox" style="width:auto" ${a?.enabled===false?'':'checked'}> Recurso activo</label></div></div><div class="tayu-iot-actions">${a?'<button type="button" class="btn ghost" data-iot-remove>Quitar asignación</button>':''}<button type="button" class="btn" data-iot-save>Guardar</button></div><div class="tayu-iot-msg"></div></article>`;
  }

  function ensureModal(){installStyles();let modal=document.getElementById('tayuIotModal');if(modal)return modal;modal=document.createElement('div');modal.id='tayuIotModal';modal.className='tayu-iot-modal';modal.innerHTML='<div class="tayu-iot-dialog" id="tayuIotDialog"></div>';modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.remove('open')});document.body.appendChild(modal);return modal;}

  function renderModal(data){
    currentData=data;const modal=ensureModal();const dialog=document.getElementById('tayuIotDialog');const device=data?.device||{};const resources=Array.isArray(data?.resources)?data.resources:[];const order=['digital_output','digital_input','interface','location','sensor'];const types=[...new Set(resources.map(r=>r.resource_type))].sort((a,b)=>order.indexOf(a)-order.indexOf(b));
    dialog.innerHTML=`<div class="tayu-iot-head"><div><h3 style="margin:0">Configurar IoT · ${esc(device.name||device.device_key)}</h3><p class="hint" style="margin:6px 0 0">Configuración universal: aplicación, modo Manual / Automático / Timer y recursos físicos. El sector solo define dónde se opera el equipo.</p><div class="tayu-iot-meta"><span class="tayu-iot-pill">${esc(device.profile_name||device.profile_key||'Perfil IoT')}</span><span class="tayu-iot-pill">Sitio: ${esc(device.site_name||'Sin sitio')}</span><span class="tayu-iot-pill">Sector: ${esc(sectorLabel(device.site_sector))}</span><span class="tayu-iot-pill">${resources.length} recursos</span></div></div><button type="button" class="btn ghost" id="tayuIotClose">Cerrar</button></div>${types.map(type=>`<section class="tayu-iot-group"><h4>${esc(groupLabel(type))}</h4><div class="tayu-iot-grid">${resources.filter(r=>r.resource_type===type).map(renderResource).join('')}</div></section>`).join('')||'<p class="hint">Este perfil no declara recursos configurables.</p>'}`;
    document.getElementById('tayuIotClose').onclick=()=>modal.classList.remove('open');modal.classList.add('open');
  }

  async function openConfigurator(deviceKey){
    currentDeviceKey=String(deviceKey||'');const modal=ensureModal();document.getElementById('tayuIotDialog').innerHTML='<p class="hint">Cargando recursos del dispositivo…</p>';modal.classList.add('open');
    try{if(typeof window.__tayuApi!=='function')throw new Error('API de la plataforma no disponible');renderModal(await window.__tayuApi(`/devices/iot-resources?device_key=${encodeURIComponent(currentDeviceKey)}`));}
    catch(error){document.getElementById('tayuIotDialog').innerHTML=`<h3>Configurar IoT</h3><p style="color:var(--danger)">${esc(error.message)}</p>`;}
  }

  function syncModePanels(card){const mode=card.querySelector('[data-iot-role="mode"]')?.value||'manual';card.querySelectorAll('[data-iot-mode-panel]').forEach(panel=>panel.hidden=panel.dataset.iotModePanel!==mode);}
  function numberOrNull(value){if(value===''||value==null)return null;const n=Number(value);return Number.isFinite(n)?n:null;}
  function collectTimers(card){return [...card.querySelectorAll('[data-timer-slot]')].map(slot=>({on:slot.querySelector('[data-timer-role="on"]')?.value||'',off:slot.querySelector('[data-timer-role="off"]')?.value||'',days:[...slot.querySelectorAll('[data-timer-day]:checked')].map(x=>Number(x.dataset.timerDay))})).filter(x=>x.on||x.off);}

  async function saveResource(card){
    const key=card?.dataset?.iotResource;const resource=currentData?.resources?.find(r=>r.resource_key===key);if(!resource||typeof window.__tayuApiPost!=='function')return;const msg=card.querySelector('.tayu-iot-msg');
    try{
      const settings={...(resource.assignment?.settings||{})};
      if(resource.resource_type==='digital_output'){
        const mode=card.querySelector('[data-iot-role="mode"]')?.value||'manual';settings.mode=mode;
        settings.automatic={source:card.querySelector('[data-iot-role="automatic.source"]')?.value||'',on_operator:card.querySelector('[data-iot-role="automatic.on_operator"]')?.value||'<=',on_value:numberOrNull(card.querySelector('[data-iot-role="automatic.on_value"]')?.value),off_operator:card.querySelector('[data-iot-role="automatic.off_operator"]')?.value||'>=',off_value:numberOrNull(card.querySelector('[data-iot-role="automatic.off_value"]')?.value),fail_safe:card.querySelector('[data-iot-role="automatic.fail_safe"]')?.value||'off'};
        settings.timers=collectTimers(card);
        if(mode==='automatic'&&!settings.automatic.source)throw new Error('Selecciona un sensor RS485 para el modo automático.');
        if(mode==='automatic'&&(settings.automatic.on_value===null||settings.automatic.off_value===null))throw new Error('Completa los valores de encendido y apagado del modo automático.');
        if(mode==='timer'&&!settings.timers.some(t=>t.on&&t.off))throw new Error('Configura al menos un horario completo para el modo Timer.');
      }
      msg.style.color='var(--muted)';msg.textContent='Guardando…';
      await window.__tayuApiPost('/devices/iot-resources',{device_key:currentDeviceKey,resource_key:key,application:card.querySelector('[data-iot-role="application"]')?.value||resource.default_application,display_name:card.querySelector('[data-iot-role="display_name"]')?.value?.trim()||resourceLabel(resource),enabled:Boolean(card.querySelector('[data-iot-role="enabled"]')?.checked),settings});
      await openConfigurator(currentDeviceKey);if(typeof window.__tayuRenderSectorIot==='function'){const sector=String(currentData?.device?.site_sector||'').toLowerCase();if(sector)window.__tayuRenderSectorIot(sector,true);}
    }catch(error){msg.textContent=error.message;msg.style.color='var(--danger)';}
  }

  async function removeResource(card){const key=card?.dataset?.iotResource;if(!key||typeof window.__tayuApiPost!=='function')return;const msg=card.querySelector('.tayu-iot-msg');try{msg.textContent='Quitando asignación…';await window.__tayuApiPost('/devices/iot-resources',{device_key:currentDeviceKey,resource_key:key,remove:true});await openConfigurator(currentDeviceKey);}catch(error){msg.textContent=error.message;msg.style.color='var(--danger)';}}

  document.addEventListener('change',event=>{
    const mode=event.target?.closest?.('[data-iot-role="mode"]');if(mode){syncModePanels(mode.closest('.tayu-iot-resource'));return;}
    const sensor=event.target?.closest?.('[data-iot-role="automatic.source"]');if(sensor){const card=sensor.closest('.tayu-iot-resource');const reading=card?.querySelector('[data-iot-signal-reading]');if(reading)reading.textContent=selectedSignalReading(sensor.value);}
  },true);

  document.addEventListener('click',event=>{
    const nav=event.target?.closest?.('.nav button');if(nav?.dataset?.view==='dispositivos'){setTimeout(refreshDevices,0);setTimeout(decorateDevices,150);setTimeout(decorateDevices,700);return;}if(nav?.id==='clientAdminNavButton'){setTimeout(refreshAdmin,0);return;}
    const config=event.target?.closest?.('.td-iot-configure');if(config){event.preventDefault();openConfigurator(config.dataset.deviceKey);return;}
    const save=event.target?.closest?.('[data-iot-save]');if(save){event.preventDefault();saveResource(save.closest('.tayu-iot-resource'));return;}
    const remove=event.target?.closest?.('[data-iot-remove]');if(remove){event.preventDefault();removeResource(remove.closest('.tayu-iot-resource'));}
  },true);

  document.addEventListener('click',event=>{if(event.target?.closest?.('#tdRefresh')){setTimeout(decorateDevices,200);setTimeout(decorateDevices,800);}});
  window.addEventListener('tayu:client-access-ready',()=>{setTimeout(syncActiveView,100);setTimeout(decorateDevices,300);});
  window.addEventListener('pageshow',()=>{setTimeout(syncActiveView,100);setTimeout(decorateDevices,300);});
  if(!window.__tayuDeviceDecorationTimer)window.__tayuDeviceDecorationTimer=setInterval(()=>{if(document.getElementById('dispositivos')?.classList.contains('active'))decorateDevices();},1500);
})();
