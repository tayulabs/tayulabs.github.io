/* TAYULABS Cloud · Bananeras v1.0
   Frontend sobre APIs /bananas/* ya protegidas por Keycloak.
*/
(function(){
  'use strict';

  const state={
    initialized:false,
    loading:false,
    activeTab:'summary',
    siteId:'',
    me:null,
    summary:{},
    lots:[],workers:[],crews:[],harvest:[],packing:[],weighings:[],quality:[],boxes:[],pallets:[],dispatches:[]
  };

  const tabs=[
    ['summary','Resumen'],['production','Producción'],['packing','Empacadora'],['weighing','Pesaje'],
    ['quality','Calidad'],['people','Personal'],['trace','Trazabilidad'],['pallets','Pallets'],
    ['dispatches','Despachos'],['orion','ORIÓN GPS'],['reports','Reportes']
  ];

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>Number(v||0).toLocaleString('es-EC',{maximumFractionDigits:3});
  const date=v=>v?new Date(v).toLocaleDateString('es-EC'):'—';
  const datetime=v=>v?new Date(v).toLocaleString('es-EC'):'—';
  const today=()=>new Date().toISOString().slice(0,10);

  function ensureCss(){
    if(document.querySelector('link[data-banana-css]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='cloud-client-bananas.css?v=1.0';link.dataset.bananaCss='1';
    document.head.appendChild(link);
  }

  async function waitApi(){
    for(let i=0;i<100;i++){
      if(typeof window.__tayuApi==='function'&&typeof window.__tayuApiPost==='function')return;
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error('La API segura de TAYULABS no está disponible.');
  }

  async function safeGet(path,fallback=[]){
    try{return await window.__tayuApi(path);}catch(error){console.warn('Bananeras GET',path,error);return fallback;}
  }

  function siteQuery(path){
    if(!state.siteId)return path;
    return path+(path.includes('?')?'&':'?')+'site_id='+encodeURIComponent(state.siteId);
  }

  function statusClass(value){
    const v=String(value||'').toLowerCase();
    if(['inactive','cancelled','rejected','fail'].includes(v))return 'off';
    if(['draft','pending','hold','quality_hold','conditional'].includes(v))return 'warn';
    if(['scheduled','in_progress','loading','dispatched','palletized'].includes(v))return 'info';
    return '';
  }

  function badge(value){return `<span class="banana-status ${statusClass(value)}">${esc(value||'—')}</span>`;}
  function empty(text='Sin registros todavía.'){return `<div class="banana-empty">${esc(text)}</div>`;}

  function table(headers,rows){
    if(!rows.length)return empty();
    return `<div class="banana-table-wrap"><table class="banana-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }

  function siteRows(){
    const map=new Map();
    const all=[state.lots,state.workers,state.crews,state.harvest,state.packing,state.boxes,state.pallets,state.dispatches].flat();
    all.forEach(x=>{if(x?.site_id)map.set(x.site_id,x.site_name||x.site_id);});
    (window.__tayuRealDevices||[]).forEach(x=>{if(x?.site_id)map.set(x.site_id,x.site_name||x.site_id);});
    (state.me?.site_ids||[]).forEach(id=>{if(!map.has(id))map.set(id,`Sitio ${String(id).slice(0,8)}`);});
    return [...map.entries()].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name));
  }

  function siteOptions(selected=''){
    return `<option value="">Todos los sitios</option>`+siteRows().map(x=>`<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.name)}</option>`).join('');
  }

  function filtered(list){return state.siteId?list.filter(x=>x.site_id===state.siteId):list;}

  function buildShell(section){
    const legacy=document.createElement('div');legacy.className='banana-legacy-orion';
    while(section.firstChild)legacy.appendChild(section.firstChild);

    section.innerHTML=`<div class="banana-shell">
      <div class="banana-head">
        <div><h3>🍌 Gestión de Bananeras</h3><p>Producción, empacadora, pesaje, calidad y trazabilidad desde campo hasta despacho.</p></div>
        <div class="banana-actions"><button class="btn ghost" data-banana-refresh>Actualizar</button><button class="btn" data-banana-new>＋ Nuevo registro</button></div>
      </div>
      <div class="banana-section-card">
        <div class="banana-toolbar">
          <div><label>Sitio / finca</label><select data-banana-site><option value="">Todos los sitios</option></select></div>
          <div><label>Vista</label><input value="Operación bananera" disabled></div>
          <button class="btn ghost" data-banana-refresh-2>Sincronizar</button>
        </div>
        <div class="banana-tabs">${tabs.map(([id,label],i)=>`<button class="banana-tab ${i===0?'active':''}" data-banana-tab="${id}">${label}</button>`).join('')}</div>
      </div>
      ${tabs.map(([id])=>`<div class="banana-panel ${id==='summary'?'active':''}" data-banana-panel="${id}"></div>`).join('')}
      <div class="banana-modal" data-banana-modal><div class="banana-modal-card"><div class="banana-modal-head"><div><h4 data-banana-modal-title>Nuevo registro</h4><p class="hint" data-banana-modal-subtitle></p></div><button class="btn ghost" type="button" data-banana-modal-close>✕</button></div><div class="banana-message" data-banana-message></div><form class="banana-form" data-banana-form></form></div></div>
    </div>`;

    section.querySelector('[data-banana-panel="orion"]').appendChild(legacy);
    section.querySelector('[data-banana-refresh]').onclick=()=>loadAll(true);
    section.querySelector('[data-banana-refresh-2]').onclick=()=>loadAll(true);
    section.querySelector('[data-banana-new]').onclick=()=>openDefaultCreate();
    section.querySelector('[data-banana-modal-close]').onclick=closeModal;
    section.querySelector('[data-banana-modal]').addEventListener('click',e=>{if(e.target.matches('[data-banana-modal]'))closeModal();});
    section.querySelectorAll('[data-banana-tab]').forEach(btn=>btn.onclick=()=>selectTab(btn.dataset.bananaTab));
    section.querySelector('[data-banana-site]').onchange=async e=>{state.siteId=e.target.value;await refreshSummary();renderAll();};
  }

  function selectTab(id){
    state.activeTab=id;
    document.querySelectorAll('#bananeras [data-banana-tab]').forEach(x=>x.classList.toggle('active',x.dataset.bananaTab===id));
    document.querySelectorAll('#bananeras [data-banana-panel]').forEach(x=>x.classList.toggle('active',x.dataset.bananaPanel===id));
    if(id==='orion'){setTimeout(()=>{try{window.refreshBananaSatellite?.();window.bananaSatelliteMap?.invalidateSize?.();}catch(_){ }},150);}
  }

  async function refreshSummary(){
    state.summary=await safeGet(siteQuery('/bananas/summary'),{});
  }

  async function loadAll(force=false){
    if(state.loading)return;
    state.loading=true;
    const section=document.getElementById('bananeras');section?.classList.add('banana-loading');
    try{
      await waitApi();
      const [me,summary,lots,workers,crews,harvest,packing,weighings,quality,boxes,pallets,dispatches]=await Promise.all([
        safeGet('/me',null),safeGet(siteQuery('/bananas/summary'),{}),safeGet('/bananas/lots',[]),safeGet('/bananas/workers',[]),safeGet('/bananas/crews',[]),safeGet('/bananas/harvest-orders',[]),safeGet('/bananas/packing-sessions',[]),safeGet('/bananas/weighings',[]),safeGet('/bananas/quality-checks',[]),safeGet('/bananas/boxes',[]),safeGet('/bananas/pallets',[]),safeGet('/bananas/dispatches',[])
      ]);
      Object.assign(state,{me,summary,lots,workers,crews,harvest,packing,weighings,quality,boxes,pallets,dispatches});
      renderAll();
    }finally{
      state.loading=false;section?.classList.remove('banana-loading');
    }
  }

  function renderAll(){
    const site=document.querySelector('#bananeras [data-banana-site]');
    if(site){const old=state.siteId;site.innerHTML=siteOptions(old);site.value=old;}
    renderSummary();renderProduction();renderPeople();renderPacking();renderWeighing();renderQuality();renderTrace();renderPallets();renderDispatches();renderReports();
  }

  function panel(id){return document.querySelector(`#bananeras [data-banana-panel="${id}"]`);}

  function renderSummary(){
    const host=panel('summary');if(!host)return;const s=state.summary||{};
    const kpis=[
      ['Lotes activos',s.active_lots,'Campo'],['Trabajadores activos',s.active_workers,'Personal'],['Cuadrillas activas',s.active_crews,'Operación'],['Órdenes abiertas',s.open_harvest_orders,'Cosecha'],['Empacadoras abiertas',s.open_packing_sessions,'Proceso'],['Cajas hoy',s.boxes_today,'Producción'],['Peso neto hoy',`${num(s.net_weight_today_kg)} kg`,'Pesaje'],['Alertas de calidad',s.quality_alerts_today,'Hoy'],['Pallets activos',s.active_pallets,'Logística'],['Despachos pendientes',s.pending_dispatches,'Salida']
    ];
    host.innerHTML=`<div class="banana-kpis">${kpis.map(([a,b,c])=>`<div class="banana-kpi"><span>${esc(a)}</span><strong>${esc(b??0)}</strong><small>${esc(c)}</small></div>`).join('')}</div>
      <div class="banana-grid-two" style="margin-top:16px">
        <div class="banana-section-card"><h4>Órdenes de cosecha recientes</h4><p>Últimas operaciones del campo.</p>${table(['Código','Lote','Cuadrilla','Fecha','Estado'],filtered(state.harvest).slice(0,6).map(x=>`<tr><td><b>${esc(x.order_code)}</b></td><td>${esc(x.lot_name||x.lot_code)}</td><td>${esc(x.crew_name||'—')}</td><td>${date(x.scheduled_date)}</td><td>${badge(x.status)}</td></tr>`))}</div>
        <div class="banana-section-card"><h4>Producción empacada</h4><p>Sesiones de empacadora recientes.</p>${table(['Sesión','Orden','Fecha','Cajas','Estado'],filtered(state.packing).slice(0,6).map(x=>`<tr><td><b>${esc(x.session_code)}</b></td><td>${esc(x.harvest_order_code)}</td><td>${date(x.production_date)}</td><td>${num(x.packed_boxes)}</td><td>${badge(x.status)}</td></tr>`))}</div>
      </div>`;
  }

  function renderProduction(){
    const host=panel('production');if(!host)return;
    host.innerHTML=`<div class="banana-grid-two">
      <div class="banana-section-card"><div class="banana-head"><div><h4>Lotes</h4><p>Unidades productivas registradas.</p></div><button class="btn" onclick="window.BananaUI.create('lot')">＋ Lote</button></div>${table(['Código','Nombre','Sitio','Área ha','Variedad','Estado'],filtered(state.lots).map(x=>`<tr><td><b>${esc(x.code)}</b></td><td>${esc(x.name)}</td><td>${esc(x.site_name||'—')}</td><td>${num(x.area_hectares)}</td><td>${esc(x.variety||'—')}</td><td>${badge(x.status)}</td></tr>`))}</div>
      <div class="banana-section-card"><div class="banana-head"><div><h4>Órdenes de cosecha</h4><p>Programación y avance de cosecha.</p></div><button class="btn" onclick="window.BananaUI.create('harvest')">＋ Orden</button></div>${table(['Orden','Lote','Cuadrilla','Fecha','Plan','Cosechado','Estado'],filtered(state.harvest).map(x=>`<tr><td><b>${esc(x.order_code)}</b></td><td>${esc(x.lot_name||x.lot_code)}</td><td>${esc(x.crew_name||'—')}</td><td>${date(x.scheduled_date)}</td><td>${num(x.planned_bunches)}</td><td>${num(x.harvested_bunches)}</td><td>${badge(x.status)}</td></tr>`))}</div>
    </div>`;
  }

  function renderPeople(){
    const host=panel('people');if(!host)return;
    host.innerHTML=`<div class="banana-grid-two">
      <div class="banana-section-card"><div class="banana-head"><div><h4>Trabajadores</h4><p>Personal operativo de campo y empacadora.</p></div><button class="btn" onclick="window.BananaUI.create('worker')">＋ Trabajador</button></div>${table(['Código','Nombre','Cargo','Sitio','Teléfono','Estado'],filtered(state.workers).map(x=>`<tr><td><b>${esc(x.employee_code)}</b></td><td>${esc(x.full_name)}</td><td>${esc(x.job_title||'—')}</td><td>${esc(x.site_name||'—')}</td><td>${esc(x.phone||'—')}</td><td>${badge(x.status)}</td></tr>`))}</div>
      <div class="banana-section-card"><div class="banana-head"><div><h4>Cuadrillas</h4><p>Equipos de trabajo y supervisores.</p></div><button class="btn" onclick="window.BananaUI.create('crew')">＋ Cuadrilla</button></div>${table(['Código','Cuadrilla','Tipo','Supervisor','Sitio','Estado'],filtered(state.crews).map(x=>`<tr><td><b>${esc(x.code)}</b></td><td>${esc(x.name)}</td><td>${esc(x.crew_type)}</td><td>${esc(x.supervisor_name||'—')}</td><td>${esc(x.site_name||'—')}</td><td>${badge(x.status)}</td></tr>`))}</div>
    </div>`;
  }

  function renderPacking(){
    const host=panel('packing');if(!host)return;
    host.innerHTML=`<div class="banana-section-card"><div class="banana-head"><div><h4>Sesiones de empacadora</h4><p>Jornadas de proceso vinculadas a una orden de cosecha.</p></div><button class="btn" onclick="window.BananaUI.create('packing')">＋ Sesión</button></div>${table(['Sesión','Orden','Lote','Fecha','Turno','Plan cajas','Empacadas','Rechazadas','Estado'],filtered(state.packing).map(x=>`<tr><td><b>${esc(x.session_code)}</b></td><td>${esc(x.harvest_order_code)}</td><td>${esc(x.lot_name||x.lot_code)}</td><td>${date(x.production_date)}</td><td>${esc(x.shift||'—')}</td><td>${num(x.planned_boxes)}</td><td>${num(x.packed_boxes)}</td><td>${num(x.rejected_boxes)}</td><td>${badge(x.status)}</td></tr>`))}</div>`;
  }

  function renderWeighing(){
    const host=panel('weighing');if(!host)return;
    host.innerHTML=`<div class="banana-section-card"><div class="banana-head"><div><h4>Pesajes</h4><p>Registro manual o automático desde dispositivo / MQTT / Modbus.</p></div><button class="btn" onclick="window.BananaUI.create('weighing')">＋ Pesaje</button></div>${table(['Fecha','Referencia','Sesión','Tipo','Bruto kg','Tara kg','Neto kg','Origen'],filtered(state.weighings).map(x=>`<tr><td>${datetime(x.recorded_at)}</td><td><b>${esc(x.reference_code||'—')}</b></td><td>${esc(x.session_code)}</td><td>${esc(x.weighing_type)}</td><td>${num(x.gross_weight_kg)}</td><td>${num(x.tare_weight_kg)}</td><td><b>${num(x.net_weight_kg)}</b></td><td>${badge(x.source)}</td></tr>`))}</div>`;
  }

  function renderQuality(){
    const host=panel('quality');if(!host)return;
    host.innerHTML=`<div class="banana-section-card"><div class="banana-head"><div><h4>Control de calidad</h4><p>Muestreos, defectos e inspecciones.</p></div><button class="btn" onclick="window.BananaUI.create('quality')">＋ Inspección</button></div>${table(['Código','Sesión','Inspector','Tipo','Muestra','Defectos','Resultado','Fecha'],filtered(state.quality).map(x=>`<tr><td><b>${esc(x.check_code)}</b></td><td>${esc(x.session_code)}</td><td>${esc(x.inspector_name||'—')}</td><td>${esc(x.check_type)}</td><td>${num(x.sample_size)}</td><td>${num(x.defect_count)}</td><td>${badge(x.result)}</td><td>${datetime(x.checked_at)}</td></tr>`))}</div>`;
  }

  function renderTrace(){
    const host=panel('trace');if(!host)return;
    host.innerHTML=`<div class="banana-section-card"><h4>Trazabilidad de caja</h4><p>Busca un código y sigue el producto desde el lote hasta el pallet.</p><div class="banana-trace-box"><div><label>Código de caja</label><input data-banana-trace-input placeholder="Ej: BOX-000123"></div><button class="btn" data-banana-trace-btn>Buscar</button></div><div data-banana-trace-result></div></div>
      <div class="banana-section-card" style="margin-top:16px"><div class="banana-head"><div><h4>Cajas producidas</h4><p>Inventario trazable.</p></div><button class="btn" onclick="window.BananaUI.create('box')">＋ Caja</button></div>${table(['Caja','Sesión','Lote','Peso kg','Calidad','Pallet','Estado','Empacada'],filtered(state.boxes).map(x=>`<tr><td><b>${esc(x.box_code)}</b></td><td>${esc(x.session_code)}</td><td>${esc(x.lot_name||x.lot_code)}</td><td>${num(x.net_weight_kg??x.weighing_net_weight_kg)}</td><td>${badge(x.quality_result||'—')}</td><td>${esc(x.pallet_code||'—')}</td><td>${badge(x.status)}</td><td>${datetime(x.packed_at)}</td></tr>`))}</div>`;
    host.querySelector('[data-banana-trace-btn]').onclick=searchTrace;
    host.querySelector('[data-banana-trace-input]').addEventListener('keydown',e=>{if(e.key==='Enter')searchTrace();});
  }

  async function searchTrace(){
    const input=document.querySelector('#bananeras [data-banana-trace-input]');const out=document.querySelector('#bananeras [data-banana-trace-result]');
    const code=input?.value.trim();if(!code)return;
    out.innerHTML=empty('Buscando…');
    const rows=await safeGet('/bananas/boxes?box_code='+encodeURIComponent(code),[]);const x=rows[0];
    if(!x){out.innerHTML=empty('No encontramos esa caja.');return;}
    out.innerHTML=`<div class="banana-trace-result"><div><span>Caja</span><b>${esc(x.box_code)}</b></div><div><span>Lote</span><b>${esc(x.lot_name||x.lot_code)}</b></div><div><span>Orden cosecha</span><b>${esc(x.harvest_order_code)}</b></div><div><span>Empacadora</span><b>${esc(x.session_code)}</b></div><div><span>Peso neto</span><b>${num(x.net_weight_kg??x.weighing_net_weight_kg)} kg</b></div><div><span>Calidad</span><b>${esc(x.quality_result||'—')}</b></div><div><span>Pallet</span><b>${esc(x.pallet_code||'—')}</b></div><div><span>Estado</span><b>${esc(x.status)}</b></div></div>`;
  }

  function renderPallets(){
    const host=panel('pallets');if(!host)return;
    host.innerHTML=`<div class="banana-section-card"><div class="banana-head"><div><h4>Pallets</h4><p>Agrupación de cajas para carga y despacho.</p></div><button class="btn" onclick="window.BananaUI.create('pallet')">＋ Pallet</button></div>${table(['Pallet','Sesión','Despacho','Cajas reales','Cajas declaradas','Peso cajas kg','Peso bruto kg','Estado'],filtered(state.pallets).map(x=>`<tr><td><b>${esc(x.pallet_code)}</b></td><td>${esc(x.session_code)}</td><td>${esc(x.dispatch_code||'—')}</td><td>${num(x.actual_box_count)}</td><td>${num(x.declared_box_count)}</td><td>${num(x.actual_box_weight_kg)}</td><td>${num(x.gross_weight_kg)}</td><td>${badge(x.status)}</td></tr>`))}</div>`;
  }

  function renderDispatches(){
    const host=panel('dispatches');if(!host)return;
    host.innerHTML=`<div class="banana-section-card"><div class="banana-head"><div><h4>Despachos</h4><p>Salida de producción, vehículo y destino.</p></div><button class="btn" onclick="window.BananaUI.create('dispatch')">＋ Despacho</button></div>${table(['Despacho','Cliente','Destino','Vehículo','Conductor','Pallets','Cajas','Estado'],filtered(state.dispatches).map(x=>`<tr><td><b>${esc(x.dispatch_code)}</b></td><td>${esc(x.customer_name||'—')}</td><td>${esc(x.destination||'—')}</td><td>${esc(x.vehicle_plate||'—')}</td><td>${esc(x.driver_name||'—')}</td><td>${num(x.actual_pallets??x.declared_pallets)}</td><td>${num(x.actual_boxes??x.declared_boxes)}</td><td>${badge(x.status)}</td></tr>`))}</div>`;
  }

  function renderReports(){
    const host=panel('reports');if(!host)return;
    const s=state.summary||{};
    host.innerHTML=`<div class="banana-grid-three"><div class="banana-section-card"><h4>Producción</h4><p>Indicadores disponibles para reportes.</p><div class="tayu-state-list"><div><span>Cajas hoy</span><b>${num(s.boxes_today)}</b></div><div><span>Peso neto hoy</span><b>${num(s.net_weight_today_kg)} kg</b></div><div><span>Órdenes abiertas</span><b>${num(s.open_harvest_orders)}</b></div></div></div><div class="banana-section-card"><h4>Calidad</h4><p>Seguimiento del día.</p><div class="tayu-state-list"><div><span>Alertas</span><b>${num(s.quality_alerts_today)}</b></div><div><span>Inspecciones cargadas</span><b>${filtered(state.quality).length}</b></div><div><span>Cajas registradas</span><b>${filtered(state.boxes).length}</b></div></div></div><div class="banana-section-card"><h4>Logística</h4><p>Preparación de salida.</p><div class="tayu-state-list"><div><span>Pallets activos</span><b>${num(s.active_pallets)}</b></div><div><span>Despachos pendientes</span><b>${num(s.pending_dispatches)}</b></div><div><span>Despachos registrados</span><b>${filtered(state.dispatches).length}</b></div></div></div></div>`;
  }

  const forms={
    lot:{title:'Nuevo lote',path:'/bananas/lots',fields:[['site_id','Sitio','site'],['code','Código','text'],['name','Nombre','text'],['area_hectares','Área (ha)','number'],['variety','Variedad','text'],['status','Estado','select',['active','inactive','closed']]]},
    worker:{title:'Nuevo trabajador',path:'/bananas/workers',fields:[['site_id','Sitio','site'],['employee_code','Código empleado','text'],['full_name','Nombre completo','text'],['job_title','Cargo','text'],['phone','Teléfono','text'],['hired_on','Fecha ingreso','date'],['status','Estado','select',['active','inactive']]]},
    crew:{title:'Nueva cuadrilla',path:'/bananas/crews',fields:[['site_id','Sitio','site'],['code','Código','text'],['name','Nombre','text'],['crew_type','Tipo','select',['harvest','field','transport','packing','quality','other']],['supervisor_worker_id','Supervisor','workers',true],['status','Estado','select',['active','inactive']]]},
    harvest:{title:'Nueva orden de cosecha',path:'/bananas/harvest-orders',fields:[['site_id','Sitio','site'],['order_code','Código orden','text'],['lot_id','Lote','lots'],['crew_id','Cuadrilla','crews'],['scheduled_date','Fecha programada','date'],['status','Estado','select',['draft','scheduled','in_progress','completed','cancelled']],['planned_bunches','Racimos planificados','number']]},
    packing:{title:'Nueva sesión de empacadora',path:'/bananas/packing-sessions',fields:[['site_id','Sitio','site'],['session_code','Código sesión','text'],['harvest_order_id','Orden de cosecha','harvest'],['production_date','Fecha producción','date'],['shift','Turno','text'],['status','Estado','select',['draft','in_progress','completed','cancelled']],['planned_boxes','Cajas planificadas','number']]},
    weighing:{title:'Registrar pesaje',path:'/bananas/weighings',fields:[['packing_session_id','Sesión empacadora','packing'],['reference_code','Referencia','text'],['weighing_type','Tipo','select',['bunch','cluster','box','waste','pallet','other']],['gross_weight_kg','Peso bruto kg','number'],['tare_weight_kg','Tara kg','number'],['source','Origen','select',['manual','device','mqtt','modbus','import']]]},
    quality:{title:'Nueva inspección de calidad',path:'/bananas/quality-checks',fields:[['packing_session_id','Sesión empacadora','packing'],['check_code','Código control','text'],['inspector_worker_id','Inspector','workers',true],['check_type','Tipo','select',['incoming','process','box','final']],['result','Resultado','select',['pending','pass','fail','conditional']],['sample_size','Tamaño muestra','number'],['defect_count','Defectos','number']]},
    dispatch:{title:'Nuevo despacho',path:'/bananas/dispatches',fields:[['site_id','Sitio','site'],['dispatch_code','Código despacho','text'],['customer_name','Cliente','text'],['destination','Destino','text'],['vehicle_plate','Placa','text'],['driver_name','Conductor','text'],['status','Estado','select',['draft','loading','dispatched','delivered','cancelled']],['declared_pallets','Pallets declarados','number'],['declared_boxes','Cajas declaradas','number'],['declared_weight_kg','Peso declarado kg','number']]},
    pallet:{title:'Nuevo pallet',path:'/bananas/pallets',fields:[['packing_session_id','Sesión empacadora','packing'],['pallet_code','Código pallet','text'],['dispatch_id','Despacho','dispatches',true],['status','Estado','select',['open','closed','hold','loaded','dispatched']],['declared_box_count','Cajas declaradas','number'],['gross_weight_kg','Peso bruto kg','number']]},
    box:{title:'Nueva caja trazable',path:'/bananas/boxes',fields:[['packing_session_id','Sesión empacadora','packing'],['box_code','Código caja','text'],['pallet_id','Pallet','pallets',true],['weighing_id','Pesaje','weighings',true],['quality_check_id','Control calidad','quality',true],['product_type','Producto','text'],['grade','Grado','text'],['net_weight_kg','Peso neto kg','number'],['status','Estado','select',['packed','quality_hold','approved','palletized','rejected','dispatched']]]}
  };

  function optionsFor(type){
    if(type==='site')return siteRows().map(x=>[x.id,x.name]);
    const cfg={workers:['id','full_name'],lots:['id','name'],crews:['id','name'],harvest:['id','order_code'],packing:['id','session_code'],dispatches:['id','dispatch_code'],pallets:['id','pallet_code'],weighings:['id','reference_code'],quality:['id','check_code']}[type];
    if(!cfg)return[];return (state[type]||[]).map(x=>[x[cfg[0]],x[cfg[1]]||x[cfg[0]]]);
  }

  function fieldHtml(field){
    const [name,label,type,optional]=field;let input='';
    if(type==='select')input=`<select name="${name}">${field[3].map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>`;
    else if(['site','workers','lots','crews','harvest','packing','dispatches','pallets','weighings','quality'].includes(type))input=`<select name="${name}">${optional?'<option value="">Sin asignar</option>':''}${optionsFor(type).map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;
    else input=`<input name="${name}" type="${type}" ${type==='number'?'step="any" min="0"':''} ${type==='date'?`value="${today()}"`:''}>`;
    return `<div><label>${esc(label)}</label>${input}</div>`;
  }

  function openCreate(kind){
    const cfg=forms[kind];if(!cfg)return;const modal=document.querySelector('#bananeras [data-banana-modal]'),form=document.querySelector('#bananeras [data-banana-form]');
    document.querySelector('#bananeras [data-banana-modal-title]').textContent=cfg.title;
    document.querySelector('#bananeras [data-banana-modal-subtitle]').textContent='El registro se guardará en la organización autenticada.';
    form.innerHTML=cfg.fields.map(fieldHtml).join('')+`<div class="banana-form-actions"><button class="btn ghost" type="button" data-cancel>Cancelar</button><button class="btn" type="submit">Guardar</button></div>`;
    form.querySelector('[data-cancel]').onclick=closeModal;
    form.onsubmit=async e=>{e.preventDefault();await submitCreate(kind,new FormData(form));};
    const siteSel=form.querySelector('[name="site_id"]');if(siteSel&&state.siteId&&[...siteSel.options].some(o=>o.value===state.siteId))siteSel.value=state.siteId;
    message('');modal.classList.add('open');
  }

  async function submitCreate(kind,fd){
    const cfg=forms[kind],body={};
    cfg.fields.forEach(([name,,type])=>{let value=fd.get(name);if(value==='')value=null;if(type==='number'&&value!==null)value=Number(value);body[name]=value;});
    try{
      message('Guardando…','ok');
      await window.__tayuApiPost(cfg.path,body);
      message('Registro guardado correctamente.','ok');
      await loadAll(true);setTimeout(closeModal,450);
    }catch(error){message(error.message||'No se pudo guardar.','error');}
  }

  function message(text,type=''){
    const el=document.querySelector('#bananeras [data-banana-message]');if(!el)return;
    el.textContent=text||'';el.className='banana-message'+(text?' show '+type:'');
  }

  function closeModal(){document.querySelector('#bananeras [data-banana-modal]')?.classList.remove('open');message('');}

  function openDefaultCreate(){
    const map={production:'harvest',people:'worker',packing:'packing',weighing:'weighing',quality:'quality',trace:'box',pallets:'pallet',dispatches:'dispatch'};
    openCreate(map[state.activeTab]||'lot');
  }

  async function init(){
    if(state.initialized)return;
    const section=document.getElementById('bananeras');if(!section)return;
    ensureCss();buildShell(section);state.initialized=true;
    await loadAll();
  }

  window.BananaUI={init,refresh:()=>loadAll(true),create:openCreate,state};

  function hook(){
    const button=document.querySelector('.nav button[data-view="bananeras"]');
    if(button)button.addEventListener('click',()=>setTimeout(()=>init().catch(console.error),0));
    const section=document.getElementById('bananeras');
    if(section?.classList.contains('active'))init().catch(console.error);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook);else hook();
})();
