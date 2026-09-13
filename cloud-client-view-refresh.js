(() => {
  'use strict';

  let currentDeviceKey = '';
  let currentData = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const roleCanConfigure = () => ['owner','admin'].includes(String(window.__tayuClientAccess?.role || document.body?.dataset?.tayuRole || '').toLowerCase());
  const sectorLabel = value => ({fincas:'Fincas',camaroneras:'Camaroneras',bananeras:'Bananeras',ganaderia:'Ganadería'})[String(value || '').toLowerCase()] || 'Sin sector';

  function refreshDevices() {
    const button = document.getElementById('tdRefresh');
    if (button && !button.disabled) button.click();
  }

  function refreshAdmin() {
    const button = document.getElementById('tcaRefreshBtn');
    if (button && !button.disabled) button.click();
  }

  function syncActiveView() {
    if (document.getElementById('dispositivos')?.classList.contains('active')) refreshDevices();
    if (document.getElementById('clientAdminNavButton')?.classList.contains('active')) refreshAdmin();
  }

  function installStyles() {
    if (document.getElementById('tayu-iot-resource-styles')) return;
    const style = document.createElement('style');
    style.id = 'tayu-iot-resource-styles';
    style.textContent = `
      #dispositivos .td-iot-footer{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:13px;padding-top:12px;border-top:1px solid var(--border)}
      #dispositivos .td-iot-sector{font-size:11px;color:var(--muted);font-weight:800}
      #dispositivos .td-iot-configure{padding:9px 12px;border-radius:12px;font-size:12px}
      .tayu-iot-modal{display:none;position:fixed;inset:0;z-index:2147483200;background:rgba(0,0,0,.46);padding:22px;align-items:center;justify-content:center}
      .tayu-iot-modal.open{display:flex}.tayu-iot-dialog{width:min(980px,100%);max-height:90vh;overflow:auto;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:26px;padding:20px;box-shadow:var(--shadow)}
      .tayu-iot-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}.tayu-iot-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.tayu-iot-pill{padding:6px 9px;border-radius:999px;background:var(--panel2);border:1px solid var(--border);font-size:11px;font-weight:850}
      .tayu-iot-group{margin-top:18px}.tayu-iot-group h4{margin:0 0 9px}.tayu-iot-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tayu-iot-resource{border:1px solid var(--border);border-radius:18px;padding:14px;background:var(--panel2)}
      .tayu-iot-resource-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.tayu-iot-resource-top h5{margin:0;font-size:15px}.tayu-iot-key{font-size:10px;color:var(--muted);margin-top:3px}.tayu-iot-state{padding:5px 8px;border-radius:999px;font-size:10px;font-weight:900;background:rgba(245,158,11,.12);color:var(--warning)}.tayu-iot-state.ok{background:rgba(91,193,47,.12);color:var(--brand)}
      .tayu-iot-form{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:11px}.tayu-iot-form .full{grid-column:1/-1}.tayu-iot-form label{margin:0 0 5px;font-size:11px}.tayu-iot-form input,.tayu-iot-form select{padding:10px;border-radius:11px}.tayu-iot-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:11px}.tayu-iot-actions .btn{padding:9px 11px;border-radius:11px;font-size:12px}.tayu-iot-msg{min-height:18px;margin-top:7px;font-size:11px;color:var(--muted)}
      @media(max-width:760px){.tayu-iot-modal{padding:8px;align-items:flex-start;padding-top:54px}.tayu-iot-dialog{max-height:86vh;border-radius:20px;padding:14px}.tayu-iot-grid,.tayu-iot-form{grid-template-columns:1fr}.tayu-iot-form .full{grid-column:auto}.tayu-iot-head{flex-direction:column}.tayu-iot-head .btn{width:100%}#dispositivos .td-iot-footer{align-items:stretch;flex-direction:column}#dispositivos .td-iot-configure{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function decorateDevices() {
    if (!roleCanConfigure()) return;
    installStyles();
    const devices = Array.isArray(window.__tayuRealDevices) ? window.__tayuRealDevices : [];
    document.querySelectorAll('#tdGrid .td-card').forEach(card => {
      const key = card.querySelector('.td-key')?.textContent?.trim();
      if (!key) return;
      const device = devices.find(row => String(row.device_key) === key);
      let footer = card.querySelector('.td-iot-footer');
      if (!footer) {
        footer = document.createElement('div');
        footer.className = 'td-iot-footer';
        footer.innerHTML = '<span class="td-iot-sector"></span><button type="button" class="btn ghost td-iot-configure">⚙ Configurar IoT</button>';
        card.appendChild(footer);
      }
      footer.querySelector('.td-iot-sector').textContent = `Sector: ${sectorLabel(device?.site_sector)}`;
      footer.querySelector('.td-iot-configure').dataset.deviceKey = key;
    });
  }

  function resourceLabel(resource) {
    const key = String(resource?.resource_key || '');
    if (/^relay\d+$/i.test(key)) return `Relay ${key.replace(/\D/g,'')}`;
    if (/^din\d+$/i.test(key)) return `Entrada digital ${key.replace(/\D/g,'')}`;
    if (key === 'rs485') return 'RS485 / Modbus';
    if (key === 'gps') return 'GPS externo / ubicación';
    return key || 'Recurso';
  }

  const groupLabel = type => ({digital_output:'Salidas',digital_input:'Entradas',interface:'Comunicación',location:'Ubicación / opcional',sensor:'Sensores'})[type] || 'Otros recursos';

  function applicationOptions(resource) {
    const choices = {
      digital_output:[['generic','Salida genérica'],['irrigation_pump','Bomba de riego'],['well_pump','Bomba de pozo'],['pump','Bomba'],['valve','Válvula'],['motor','Motor'],['aerator','Aireador eléctrico'],['feeder','Alimentador automático'],['lighting','Iluminación']],
      digital_input:[['generic_input','Entrada genérica'],['float_switch','Flotador / nivel'],['pump_state','Estado de bomba'],['pressure_switch','Presostato'],['alarm','Alarma'],['dry_contact','Contacto seco']],
      interface:[['modbus','Modbus'],['interface','Interfaz genérica']],location:[['tracking','Tracking / ubicación']],sensor:[['sensor','Sensor']]
    };
    const current = resource.assignment?.application || resource.default_application || '';
    const list = [...(choices[resource.resource_type] || [['generic','Genérico']])];
    if (current && !list.some(([value]) => value === current)) list.unshift([current,current]);
    return list.map(([value,label]) => `<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`).join('');
  }

  function ensureModal() {
    installStyles();
    let modal = document.getElementById('tayuIotModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'tayuIotModal';
    modal.className = 'tayu-iot-modal';
    modal.innerHTML = '<div class="tayu-iot-dialog" id="tayuIotDialog"></div>';
    modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
    return modal;
  }

  function renderModal(data) {
    currentData = data;
    const modal = ensureModal();
    const dialog = document.getElementById('tayuIotDialog');
    const device = data?.device || {};
    const resources = Array.isArray(data?.resources) ? data.resources : [];
    const order = ['digital_output','digital_input','interface','location','sensor'];
    const types = [...new Set(resources.map(r => r.resource_type))].sort((a,b) => order.indexOf(a)-order.indexOf(b));
    dialog.innerHTML = `<div class="tayu-iot-head"><div><h3 style="margin:0">Configurar IoT · ${esc(device.name || device.device_key)}</h3><p class="hint" style="margin:6px 0 0">Asigna la función de cada recurso físico. El dispositivo continúa gestionado desde Cloud Admin.</p><div class="tayu-iot-meta"><span class="tayu-iot-pill">${esc(device.profile_name || device.profile_key || 'Perfil IoT')}</span><span class="tayu-iot-pill">Sitio: ${esc(device.site_name || 'Sin sitio')}</span><span class="tayu-iot-pill">Sector: ${esc(sectorLabel(device.site_sector))}</span><span class="tayu-iot-pill">${resources.length} recursos</span></div></div><button type="button" class="btn ghost" id="tayuIotClose">Cerrar</button></div>${types.map(type=>`<section class="tayu-iot-group"><h4>${esc(groupLabel(type))}</h4><div class="tayu-iot-grid">${resources.filter(r=>r.resource_type===type).map(resource=>{const a=resource.assignment;return `<article class="tayu-iot-resource" data-iot-resource="${esc(resource.resource_key)}"><div class="tayu-iot-resource-top"><div><h5>${esc(resourceLabel(resource))}</h5><div class="tayu-iot-key">${esc(resource.resource_key)} · ${esc(resource.resource_type)}</div></div><span class="tayu-iot-state ${a?'ok':''}">${a?'CONFIGURADO':'SIN CONFIGURAR'}</span></div><div class="tayu-iot-form"><div><label>Aplicación</label><select data-iot-role="application">${applicationOptions(resource)}</select></div><div><label>Nombre visible</label><input data-iot-role="display_name" value="${esc(a?.display_name || resourceLabel(resource))}"></div><div class="full"><label style="display:flex;align-items:center;gap:8px"><input data-iot-role="enabled" type="checkbox" style="width:auto" ${a?.enabled===false?'':'checked'}> Recurso activo</label></div></div><div class="tayu-iot-actions">${a?'<button type="button" class="btn ghost" data-iot-remove>Quitar asignación</button>':''}<button type="button" class="btn" data-iot-save>Guardar</button></div><div class="tayu-iot-msg"></div></article>`;}).join('')}</div></section>`).join('') || '<p class="hint">Este perfil no declara recursos configurables.</p>'}`;
    document.getElementById('tayuIotClose').onclick = () => modal.classList.remove('open');
    modal.classList.add('open');
  }

  async function openConfigurator(deviceKey) {
    currentDeviceKey = String(deviceKey || '');
    const modal = ensureModal();
    document.getElementById('tayuIotDialog').innerHTML = '<p class="hint">Cargando recursos del dispositivo…</p>';
    modal.classList.add('open');
    try {
      if (typeof window.__tayuApi !== 'function') throw new Error('API de la plataforma no disponible');
      renderModal(await window.__tayuApi(`/devices/iot-resources?device_key=${encodeURIComponent(currentDeviceKey)}`));
    } catch (error) {
      document.getElementById('tayuIotDialog').innerHTML = `<h3>Configurar IoT</h3><p style="color:var(--danger)">${esc(error.message)}</p>`;
    }
  }

  async function saveResource(card) {
    const key = card?.dataset?.iotResource;
    const resource = currentData?.resources?.find(r => r.resource_key === key);
    if (!resource || typeof window.__tayuApiPost !== 'function') return;
    const msg = card.querySelector('.tayu-iot-msg');
    try {
      msg.textContent = 'Guardando…';
      await window.__tayuApiPost('/devices/iot-resources', {
        device_key:currentDeviceKey,resource_key:key,
        application:card.querySelector('[data-iot-role="application"]')?.value || resource.default_application,
        display_name:card.querySelector('[data-iot-role="display_name"]')?.value?.trim() || resourceLabel(resource),
        enabled:Boolean(card.querySelector('[data-iot-role="enabled"]')?.checked),
        settings:resource.assignment?.settings || {}
      });
      await openConfigurator(currentDeviceKey);
    } catch (error) { msg.textContent = error.message; msg.style.color = 'var(--danger)'; }
  }

  async function removeResource(card) {
    const key = card?.dataset?.iotResource;
    if (!key || typeof window.__tayuApiPost !== 'function') return;
    const msg = card.querySelector('.tayu-iot-msg');
    try {
      msg.textContent = 'Quitando asignación…';
      await window.__tayuApiPost('/devices/iot-resources',{device_key:currentDeviceKey,resource_key:key,remove:true});
      await openConfigurator(currentDeviceKey);
    } catch (error) { msg.textContent = error.message; msg.style.color = 'var(--danger)'; }
  }

  document.addEventListener('click', event => {
    const nav = event.target?.closest?.('.nav button');
    if (nav?.dataset?.view === 'dispositivos') { setTimeout(refreshDevices,0); setTimeout(decorateDevices,150); setTimeout(decorateDevices,700); return; }
    if (nav?.id === 'clientAdminNavButton') { setTimeout(refreshAdmin,0); return; }
    const config = event.target?.closest?.('.td-iot-configure');
    if (config) { event.preventDefault(); openConfigurator(config.dataset.deviceKey); return; }
    const save = event.target?.closest?.('[data-iot-save]');
    if (save) { saveResource(save.closest('.tayu-iot-resource')); return; }
    const remove = event.target?.closest?.('[data-iot-remove]');
    if (remove) removeResource(remove.closest('.tayu-iot-resource'));
  }, true);

  document.addEventListener('click', event => {
    if (event.target?.closest?.('#tdRefresh')) { setTimeout(decorateDevices,200); setTimeout(decorateDevices,800); }
  });

  window.addEventListener('tayu:client-access-ready', () => { setTimeout(syncActiveView,100); setTimeout(decorateDevices,300); });
  window.addEventListener('pageshow', () => { setTimeout(syncActiveView,100); setTimeout(decorateDevices,300); });

  if (!window.__tayuDeviceDecorationTimer) window.__tayuDeviceDecorationTimer=setInterval(()=>{if(document.getElementById('dispositivos')?.classList.contains('active'))decorateDevices();},1500);
})();
