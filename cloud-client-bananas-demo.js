/* TAYULABS Cloud · Bananeras demo v1.4
   Solo para demo@tayulabs.com. Crea datos comerciales idempotentes
   marcados con TAYU_DEMO_BANANERAS_V1 y monta recorridos GPS reales.
*/
(function(){
  'use strict';

  const DEMO_EMAIL='demo@tayulabs.com';
  const MARKER='TAYU_DEMO_BANANERAS_V1';
  const VERSION='1.4';
  let demoTracks=[];
  let demoGpsLayers=[];
  let originalGpsRefresh=null;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const today=()=>new Date().toISOString().slice(0,10);
  const ymdOffset=days=>{const d=new Date();d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);};
  const isoAt=(days,hour,minute=0)=>`${ymdOffset(days)}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00-05:00`;
  const n=v=>Number(v||0);

  function userEmail(){
    try{if(typeof currentUser!=='undefined'&&currentUser?.email)return String(currentUser.email).toLowerCase();}catch(_){ }
    try{if(typeof keycloak!=='undefined'){return String(keycloak?.tokenParsed?.preferred_username||keycloak?.tokenParsed?.email||'').toLowerCase();}}catch(_){ }
    return '';
  }

  function isDemoUser(){return userEmail()===DEMO_EMAIL;}

  function ensureStyle(){
    if(document.getElementById('banana-demo-v14-style'))return;
    const style=document.createElement('style');
    style.id='banana-demo-v14-style';
    style.textContent=`
      #bananeras .banana-demo-pill{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border-radius:999px;background:rgba(85,198,43,.12);border:1px solid rgba(85,198,43,.30);color:var(--text);font-size:11px;font-weight:900;white-space:nowrap}
      #bananeras .banana-demo-pill.loading{background:rgba(37,99,235,.10);border-color:rgba(37,99,235,.22)}
      #bananeras .banana-demo-pill.error{background:rgba(239,68,68,.10);border-color:rgba(239,68,68,.22);color:var(--danger)}
      #bananeras .banana-demo-gps-note{margin:0 0 12px;padding:10px 12px;border-radius:14px;background:rgba(85,198,43,.08);border:1px solid rgba(85,198,43,.22);font-size:12px;color:var(--muted)}
      #bananeras .banana-demo-gps-note b{color:var(--text)}
    `;
    document.head.appendChild(style);
  }

  function badge(text,kind=''){
    ensureStyle();
    const root=document.querySelector('#bananeras .banana-head');
    if(!root)return;
    let el=document.getElementById('bananaDemoBadge');
    if(!el){
      el=document.createElement('span');
      el.id='bananaDemoBadge';
      const actions=root.querySelector('.banana-actions');
      if(actions)actions.prepend(el);else root.appendChild(el);
    }
    el.className='banana-demo-pill '+kind;
    el.textContent=text;
  }

  async function api(path){return await window.__tayuApi(path);}
  async function post(path,body){return await window.__tayuApiPost(path,body);}

  async function waitContext(){
    for(let i=0;i<240;i++){
      if(userEmail()&&window.BananaUI?.state&&typeof window.__tayuApi==='function'&&typeof window.__tayuApiPost==='function')return true;
      await sleep(250);
    }
    return false;
  }

  function replaceRecord(list,record){
    const i=list.findIndex(x=>x.id===record.id);
    if(i>=0)list[i]=record;else list.push(record);
  }

  function updatePayload(desired,id){
    const body={...desired,id};
    delete body.site_id;
    return body;
  }

  async function ensureRecord(list,keyField,desired,createPath,updatePath=null,legacyValue=null){
    let found=list.find(x=>String(x[keyField])===String(desired[keyField]));
    if(found)return found;
    if(updatePath&&legacyValue){
      const legacy=list.find(x=>String(x[keyField])===String(legacyValue));
      if(legacy){
        const updated=await post(updatePath,updatePayload(desired,legacy.id));
        replaceRecord(list,updated);
        return updated;
      }
    }
    const created=await post(createPath,desired);
    replaceRecord(list,created);
    return created;
  }

  function chooseSite(state){
    const all=[state.lots,state.workers,state.crews,state.harvest,state.packing,state.boxes,state.pallets,state.dispatches].flat().filter(Boolean);
    const preferred=all.find(x=>String(x.site_name||'').toLowerCase().includes('juan carlos'));
    if(preferred?.site_id)return preferred.site_id;
    const any=all.find(x=>x.site_id);
    if(any?.site_id)return any.site_id;
    const dev=(window.__tayuRealDevices||[]).find(x=>x.site_id);
    if(dev?.site_id)return dev.site_id;
    return state.me?.site_ids?.[0]||null;
  }

  async function seedDemo(){
    if(!isDemoUser())return;
    badge('DEMO · preparando datos','loading');

    await window.BananaUI.refresh();
    const state=window.BananaUI.state;
    const siteId=chooseSite(state);
    if(!siteId)throw new Error('No existe un sitio disponible para cargar el demo.');

    const lists={
      lots:await api('/bananas/lots'),
      workers:await api('/bananas/workers'),
      crews:await api('/bananas/crews'),
      harvest:await api('/bananas/harvest-orders'),
      packing:await api('/bananas/packing-sessions'),
      weighings:await api('/bananas/weighings'),
      quality:await api('/bananas/quality-checks'),
      boxes:await api('/bananas/boxes'),
      pallets:await api('/bananas/pallets'),
      dispatches:await api('/bananas/dispatches')
    };

    const lotSpecs=[
      ['DEMO-L01','Lote Norte',12.8,'Cavendish'],
      ['DEMO-L02','Lote Central',15.6,'Cavendish'],
      ['DEMO-L03','Lote Río',9.4,'Cavendish'],
      ['DEMO-L04','Lote Sur',13.1,'Cavendish'],
      ['DEMO-L05','Lote Exportación',10.7,'Cavendish']
    ];
    const lots=[];
    for(let i=0;i<lotSpecs.length;i++){
      const [code,name,area,variety]=lotSpecs[i];
      lots.push(await ensureRecord(lists.lots,'code',{site_id:siteId,code,name,area_hectares:area,variety,status:'active',notes:MARKER},'/bananas/lots','/bananas/lots/update',i===0?'LOT-FRONT-001':null));
    }

    const workerSpecs=[
      ['DEMO-EMP-01','Carlos Mendoza','Supervisor de cosecha','0992458101','2025-03-10'],
      ['DEMO-EMP-02','Jorge Zambrano','Operador de campo','0987714202','2025-05-19'],
      ['DEMO-EMP-03','Luis Cedeño','Operador de campo','0963157703','2024-11-04'],
      ['DEMO-EMP-04','Miguel Vera','Supervisor de cuadrilla','0996812204','2025-01-13'],
      ['DEMO-EMP-05','Pedro Alvarado','Operador de transporte','0974128305','2024-09-23'],
      ['DEMO-EMP-06','Andrés Quintero','Operador de empacadora','0985501906','2025-06-02'],
      ['DEMO-EMP-07','José Parrales','Inspector de calidad','0991047607','2024-08-12'],
      ['DEMO-EMP-08','Daniel Torres','Operador de empaque','0968823108','2025-02-17'],
      ['DEMO-EMP-09','María Fernanda Vélez','Coordinadora de empacadora','0983194409','2024-05-06'],
      ['DEMO-EMP-10','Ana Lucía Cedeño','Auxiliar de calidad','0972205510','2025-07-07']
    ];
    const workers=[];
    for(let i=0;i<workerSpecs.length;i++){
      const [employee_code,full_name,job_title,phone,hired_on]=workerSpecs[i];
      workers.push(await ensureRecord(lists.workers,'employee_code',{site_id:siteId,employee_code,full_name,job_title,phone,hired_on,status:'active',notes:MARKER},'/bananas/workers','/bananas/workers/update',i===0?'EMP-FRONT-001':null));
    }

    const crewSpecs=[
      {code:'DEMO-C01',name:'Cuadrilla Cosecha Norte',crew_type:'harvest',supervisor_worker_id:workers[0].id},
      {code:'DEMO-C02',name:'Cuadrilla Cosecha Sur',crew_type:'harvest',supervisor_worker_id:workers[3].id},
      {code:'DEMO-C03',name:'Transporte y Recepción',crew_type:'transport',supervisor_worker_id:workers[4].id},
      {code:'DEMO-C04',name:'Empaque y Calidad',crew_type:'packing',supervisor_worker_id:workers[8].id}
    ];
    const crews=[];
    for(let i=0;i<crewSpecs.length;i++){
      crews.push(await ensureRecord(lists.crews,'code',{site_id:siteId,...crewSpecs[i],status:'active',notes:MARKER},'/bananas/crews','/bananas/crews/update',i===0?'CREW-FRONT-001':null));
    }

    const memberPlan=[
      [crews[0],[workers[0],workers[1],workers[2]]],
      [crews[1],[workers[3],workers[5],workers[7]]],
      [crews[2],[workers[4],workers[1]]],
      [crews[3],[workers[8],workers[6],workers[9],workers[7]]]
    ];
    for(const [crew,members] of memberPlan){
      let existing=await api('/bananas/crew-members?crew_id='+encodeURIComponent(crew.id));
      for(const worker of members){
        if(existing.some(m=>m.worker_id===worker.id&&m.left_on==null))continue;
        const created=await post('/bananas/crew-members',{crew_id:crew.id,worker_id:worker.id,joined_on:ymdOffset(-120)});
        existing.push(created);
      }
    }

    const harvestSpecs=[
      {order_code:'DEMO-H001',lot_id:lots[0].id,crew_id:crews[0].id,scheduled_date:today(),status:'in_progress',planned_bunches:160,harvested_bunches:122,received_bunches:116,rejected_bunches:6},
      {order_code:'DEMO-H002',lot_id:lots[1].id,crew_id:crews[1].id,scheduled_date:today(),status:'scheduled',planned_bunches:140,harvested_bunches:0,received_bunches:0,rejected_bunches:0},
      {order_code:'DEMO-H003',lot_id:lots[2].id,crew_id:crews[0].id,scheduled_date:ymdOffset(-1),status:'completed',planned_bunches:150,harvested_bunches:148,received_bunches:144,rejected_bunches:4},
      {order_code:'DEMO-H004',lot_id:lots[3].id,crew_id:crews[1].id,scheduled_date:ymdOffset(-1),status:'completed',planned_bunches:130,harvested_bunches:129,received_bunches:124,rejected_bunches:5},
      {order_code:'DEMO-H005',lot_id:lots[4].id,crew_id:crews[0].id,scheduled_date:ymdOffset(1),status:'scheduled',planned_bunches:170,harvested_bunches:0,received_bunches:0,rejected_bunches:0},
      {order_code:'DEMO-H006',lot_id:lots[2].id,crew_id:crews[1].id,scheduled_date:today(),status:'draft',planned_bunches:120,harvested_bunches:0,received_bunches:0,rejected_bunches:0}
    ];
    const harvest=[];
    for(let i=0;i<harvestSpecs.length;i++){
      harvest.push(await ensureRecord(lists.harvest,'order_code',{site_id:siteId,...harvestSpecs[i],notes:MARKER},'/bananas/harvest-orders','/bananas/harvest-orders/update',i===0?'HARV-FRONT-001':null));
    }

    const packingSpecs=[
      {session_code:'DEMO-P001',harvest_order_id:harvest[0].id,production_date:today(),shift:'Matutino',planned_boxes:420,packed_boxes:286,rejected_boxes:12,finalStatus:'in_progress'},
      {session_code:'DEMO-P002',harvest_order_id:harvest[2].id,production_date:today(),shift:'Vespertino',planned_boxes:360,packed_boxes:210,rejected_boxes:8,finalStatus:'in_progress'},
      {session_code:'DEMO-P003',harvest_order_id:harvest[2].id,production_date:ymdOffset(-1),shift:'Matutino',planned_boxes:380,packed_boxes:372,rejected_boxes:6,finalStatus:'completed'},
      {session_code:'DEMO-P004',harvest_order_id:harvest[3].id,production_date:ymdOffset(-1),shift:'Vespertino',planned_boxes:330,packed_boxes:321,rejected_boxes:5,finalStatus:'completed'}
    ];
    const packing=[];
    for(let i=0;i<packingSpecs.length;i++){
      const p=packingSpecs[i];
      packing.push(await ensureRecord(lists.packing,'session_code',{site_id:siteId,session_code:p.session_code,harvest_order_id:p.harvest_order_id,production_date:p.production_date,shift:p.shift,status:'in_progress',planned_boxes:p.planned_boxes,packed_boxes:p.packed_boxes,rejected_boxes:p.rejected_boxes,notes:MARKER},'/bananas/packing-sessions','/bananas/packing-sessions/update',i===0?'PACK-FRONT-001':null));
    }

    const weights=[];
    const weightValues=[20.4,20.1,19.8,20.6,20.0,20.3,19.9,20.5,20.2,19.7,20.4,20.0,19.9,20.2,20.5,19.8,20.1,20.3,19.7,20.4];
    for(let i=0;i<20;i++){
      const session=packing[Math.floor(i/5)];
      const ref='DEMO-WGT-'+String(i+1).padStart(3,'0');
      let found=lists.weighings.find(x=>x.reference_code===ref);
      if(!found){
        const day=i<10?0:-1;
        const source=['manual','mqtt','modbus','device'][i%4];
        found=await post('/bananas/weighings',{packing_session_id:session.id,reference_code:ref,weighing_type:'box',gross_weight_kg:weightValues[i],tare_weight_kg:1.1,source,recorded_at:isoAt(day,8+(i%8),10+(i%5)*7),raw_payload:{demo:true,marker:MARKER,source},notes:MARKER});
        lists.weighings.push(found);
      }
      weights.push(found);
    }

    for(let i=0;i<packing.length;i++){
      const spec=packingSpecs[i];
      if(spec.finalStatus==='completed'&&packing[i].status!=='completed'){
        packing[i]=await post('/bananas/packing-sessions/update',{id:packing[i].id,session_code:spec.session_code,harvest_order_id:spec.harvest_order_id,production_date:spec.production_date,shift:spec.shift,status:'completed',planned_boxes:spec.planned_boxes,packed_boxes:spec.packed_boxes,rejected_boxes:spec.rejected_boxes,notes:MARKER});
        replaceRecord(lists.packing,packing[i]);
      }
    }

    const qualitySpecs=[
      ['DEMO-Q001',packing[0],workers[6],'box','pass',12,1,0,9],
      ['DEMO-Q002',packing[0],workers[6],'process','conditional',20,3,0,11],
      ['DEMO-Q003',packing[1],workers[9],'box','pass',15,1,0,13],
      ['DEMO-Q004',packing[1],workers[6],'final','fail',10,2,0,15],
      ['DEMO-Q005',packing[2],workers[6],'final','pass',18,1,-1,10],
      ['DEMO-Q006',packing[2],workers[9],'process','pass',20,0,-1,12],
      ['DEMO-Q007',packing[3],workers[6],'final','pass',16,1,-1,14],
      ['DEMO-Q008',packing[3],workers[9],'incoming','pass',14,0,-1,15]
    ];
    const quality=[];
    for(const [check_code,session,inspector,check_type,result,sample_size,defect_count,day,hour] of qualitySpecs){
      let found=lists.quality.find(x=>x.check_code===check_code);
      if(!found){
        found=await post('/bananas/quality-checks',{packing_session_id:session.id,check_code,inspector_worker_id:inspector.id,check_type,result,sample_size,defect_count,details:{demo:true,calibre:'39-46 mm',apariencia:result==='fail'?'Requiere revisión':'Conforme',marker:MARKER},checked_at:isoAt(day,hour,20),notes:MARKER});
        lists.quality.push(found);
      }
      quality.push(found);
    }

    const dispatchSpecs=[
      {dispatch_code:'DEMO-D001',customer_name:'Exportadora Pacífico',destination:'Puerto de Guayaquil',vehicle_plate:'GBA-4821',driver_name:'Ricardo Mena',status:'loading',scheduled_at:isoAt(0,17,0),declared_pallets:2,declared_boxes:8,declared_weight_kg:154.8},
      {dispatch_code:'DEMO-D002',customer_name:'Tropical Fresh',destination:'Centro Logístico Durán',vehicle_plate:'GTR-9214',driver_name:'Edison Cevallos',status:'draft',scheduled_at:isoAt(1,8,30),declared_pallets:1,declared_boxes:4,declared_weight_kg:77.6},
      {dispatch_code:'DEMO-D003',customer_name:'Andean Fruit Trading',destination:'Puerto de Guayaquil',vehicle_plate:'GSA-3158',driver_name:'Marco López',status:'delivered',scheduled_at:isoAt(-1,16,0),declared_pallets:2,declared_boxes:8,declared_weight_kg:155.2}
    ];
    const dispatches=[];
    for(const d of dispatchSpecs){
      dispatches.push(await ensureRecord(lists.dispatches,'dispatch_code',{site_id:siteId,...d,notes:MARKER},'/bananas/dispatches'));
    }

    const palletSpecs=[
      {pallet_code:'DEMO-PL001',packing_session_id:packing[0].id,dispatch_id:dispatches[0].id,status:'loaded',declared_box_count:4,gross_weight_kg:81.0,finalStatus:'loaded'},
      {pallet_code:'DEMO-PL002',packing_session_id:packing[0].id,dispatch_id:dispatches[0].id,status:'open',declared_box_count:4,gross_weight_kg:80.4,finalStatus:'open'},
      {pallet_code:'DEMO-PL003',packing_session_id:packing[1].id,dispatch_id:dispatches[1].id,status:'open',declared_box_count:4,gross_weight_kg:80.6,finalStatus:'open'},
      {pallet_code:'DEMO-PL004',packing_session_id:packing[2].id,dispatch_id:dispatches[2].id,status:'closed',declared_box_count:4,gross_weight_kg:80.1,finalStatus:'dispatched'},
      {pallet_code:'DEMO-PL005',packing_session_id:packing[3].id,dispatch_id:dispatches[2].id,status:'closed',declared_box_count:4,gross_weight_kg:80.8,finalStatus:'dispatched'}
    ];
    const pallets=[];
    for(const p of palletSpecs){
      pallets.push(await ensureRecord(lists.pallets,'pallet_code',{packing_session_id:p.packing_session_id,pallet_code:p.pallet_code,dispatch_id:p.dispatch_id,status:p.status,declared_box_count:p.declared_box_count,gross_weight_kg:p.gross_weight_kg,notes:MARKER},'/bananas/pallets'));
    }

    const boxQual=[quality[0],quality[0],quality[1],quality[0],quality[2],quality[2],quality[3],quality[2],quality[4],quality[5],quality[4],quality[5],quality[6],quality[7],quality[6],quality[7],quality[6],quality[7],quality[6],quality[7]];
    for(let i=0;i<20;i++){
      const code='DEMO-BOX-'+String(i+1).padStart(3,'0');
      if(lists.boxes.some(x=>x.box_code===code))continue;
      const pallet=pallets[Math.floor(i/4)];
      const day=i<12?0:-1;
      const status=i<8?'palletized':i<12?'approved':'dispatched';
      const weight=n(weights[i].net_weight_kg||weightValues[i]-1.1);
      const created=await post('/bananas/boxes',{packing_session_id:pallet.packing_session_id,box_code:code,pallet_id:pallet.id,weighing_id:weights[i].id,quality_check_id:boxQual[i].id,product_type:'Banano Cavendish Premium',grade:i%5===0?'B':'A',net_weight_kg:weight,status,packed_at:isoAt(day,9+(i%7),5+(i%4)*11),notes:MARKER});
      lists.boxes.push(created);
    }

    for(let i=0;i<pallets.length;i++){
      const spec=palletSpecs[i];
      if(spec.finalStatus!==pallets[i].status){
        pallets[i]=await post('/bananas/pallets/update',{id:pallets[i].id,pallet_code:spec.pallet_code,dispatch_id:spec.dispatch_id,status:spec.finalStatus,declared_box_count:spec.declared_box_count,gross_weight_kg:spec.gross_weight_kg,notes:MARKER});
        replaceRecord(lists.pallets,pallets[i]);
      }
    }

    await window.BananaUI.refresh();
    badge('DEMO · datos cargados');
  }

  async function loadTracks(){
    if(demoTracks.length)return demoTracks;
    const index=await fetch('demo/bananas-track-index.json?v='+VERSION,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('No se pudo cargar el índice GPS demo.');return r.json();});
    demoTracks=await Promise.all(index.operators.map(meta=>fetch('demo/'+meta.file+'?v='+VERSION,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('No se pudo cargar '+meta.file);return r.json();})));
    return demoTracks;
  }

  function clearDemoGps(){
    if(!window.bananaSatelliteMap)return;
    demoGpsLayers.forEach(layer=>{try{window.bananaSatelliteMap.removeLayer(layer);}catch(_){ }});
    demoGpsLayers=[];
  }

  function renderDemoList(tracks){
    const list=document.getElementById('bananaSatelliteList');
    if(!list)return;
    list.innerHTML=`<div class="banana-demo-gps-note"><b>DEMO · recorridos GPS reales</b><br>Coordenadas provenientes del archivo de track suministrado. Los nombres de operadores son demostrativos.</div>`+
      tracks.map((x,i)=>`<button class="tayu-list-card" onclick="window.focusBananaDemoOperator(${i})"><span><b>${x.name}</b><small>${x.id} · ${x.date}</small></span><span>${x.points.length} pts · ${Number(x.distance_km).toFixed(2)} km</span></button>`).join('');
  }

  async function applyGpsDemo(){
    if(!isDemoUser())return originalGpsRefresh?.();
    const tracks=await loadTracks();
    if(!window.bananaSatelliteMap){try{window.initBananaSatelliteMap?.();}catch(_){ }}
    if(!window.bananaSatelliteMap||!window.L)return;

    try{
      if(typeof bananaOperators!=='undefined'){
        bananaOperators.splice(0,bananaOperators.length);
        tracks.forEach(x=>{const last=x.points[x.points.length-1];bananaOperators.push({id:x.id,name:x.name,lat:last.lat,lon:last.lon,points:x.points.length,battery:x.battery,state:x.state});});
        window.renderBananaSatellite?.();
      }
    }catch(error){console.warn('No se pudo reemplazar la lista ORIÓN demo:',error);}

    clearDemoGps();
    tracks.forEach(x=>{
      const coords=x.points.map(p=>[Number(p.lat),Number(p.lon)]);
      const line=L.polyline(coords,{color:x.color,weight:4,opacity:.78}).addTo(window.bananaSatelliteMap).bindPopup(`<b>${x.name}</b><br>${x.id}<br>${x.date}<br>${x.points.length} puntos · ${Number(x.distance_km).toFixed(2)} km`);
      demoGpsLayers.push(line);
      if(coords.length){
        demoGpsLayers.push(L.circleMarker(coords[0],{radius:5,color:x.color,weight:2,fillOpacity:.85}).addTo(window.bananaSatelliteMap));
        demoGpsLayers.push(L.circleMarker(coords[coords.length-1],{radius:6,color:x.color,weight:2,fillOpacity:1}).addTo(window.bananaSatelliteMap));
      }
    });
    renderDemoList(tracks);

    const cluster=tracks.slice(1).flatMap(x=>x.points.map(p=>[Number(p.lat),Number(p.lon)]));
    if(cluster.length)window.bananaSatelliteMap.fitBounds(L.latLngBounds(cluster),{padding:[24,24]});
    setTimeout(()=>window.bananaSatelliteMap?.invalidateSize?.(),100);
  }

  window.focusBananaDemoOperator=function(index){
    const x=demoTracks[index];
    if(!x||!window.bananaSatelliteMap||!window.L)return;
    const coords=x.points.map(p=>[Number(p.lat),Number(p.lon)]);
    if(coords.length)window.bananaSatelliteMap.fitBounds(L.latLngBounds(coords),{padding:[35,35],maxZoom:18});
    const d=document.getElementById('bananaSatelliteDetails');
    if(d){
      const first=x.points[0],last=x.points[x.points.length-1];
      d.innerHTML=`<h3 style="margin-top:0">${x.name}</h3><p><b>Equipo:</b> ${x.id}</p><p><b>Fecha:</b> ${x.date}</p><p><b>Puntos registrados:</b> ${x.points.length}</p><p><b>Distancia del track:</b> ${Number(x.distance_km).toFixed(2)} km</p><p><b>Inicio:</b> ${first?.time||'—'}</p><p><b>Fin:</b> ${last?.time||'—'}</p><p><b>Batería demo:</b> ${x.battery}%</p><p class="hint">Coordenadas reales del archivo suministrado; identidad del operador creada para demostración.</p>`;
    }
  };

  function installGpsOverride(){
    if(!isDemoUser())return;
    if(!originalGpsRefresh)originalGpsRefresh=window.refreshBananaSatellite;
    window.refreshBananaSatellite=function(){applyGpsDemo().catch(error=>console.error('GPS demo:',error));};
  }

  async function boot(){
    const ready=await waitContext();
    if(!ready||!isDemoUser())return;
    ensureStyle();
    installGpsOverride();
    try{
      await seedDemo();
      await loadTracks();
      setTimeout(()=>applyGpsDemo().catch(console.error),300);
    }catch(error){
      console.error('Bananeras demo seed:',error);
      badge('DEMO · error al cargar','error');
    }
  }

  boot();
})();
