/* TAYULABS Cloud · Bananeras operational actions v1.3
   Edición de empacadora, calidad, cajas, pallets y despachos.
   Los pesajes permanecen inmutables por trazabilidad.
*/
(function(){
  'use strict';

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ymd=v=>v?String(v).slice(0,10):'';
  const state=()=>window.BananaUI?.state;

  function filtered(list){
    const s=state();
    return s?.siteId ? (list||[]).filter(x=>x.site_id===s.siteId) : (list||[]);
  }

  function modalParts(){
    return {
      modal:$('#bananeras [data-banana-modal]'),
      title:$('#bananeras [data-banana-modal-title]'),
      subtitle:$('#bananeras [data-banana-modal-subtitle]'),
      form:$('#bananeras [data-banana-form]')
    };
  }

  function showMessage(text,type=''){
    const el=$('#bananeras [data-banana-message]');
    if(!el)return;
    el.textContent=text||'';
    el.className='banana-message'+(text?' show '+type:'');
  }

  function closeModal(){
    $('#bananeras [data-banana-modal]')?.classList.remove('open');
    showMessage('');
  }

  const configs={
    packing:{
      title:'Editar sesión de empacadora',path:'/bananas/packing-sessions/update',list:'packing',fields:[
        ['session_code','Código sesión','text'],
        ['harvest_order_id','Orden de cosecha','harvest'],
        ['production_date','Fecha producción','date'],
        ['shift','Turno','text'],
        ['status','Estado','select',['draft','in_progress','completed','cancelled']],
        ['planned_boxes','Cajas planificadas','number'],
        ['packed_boxes','Cajas empacadas','number'],
        ['rejected_boxes','Cajas rechazadas','number']
      ]
    },
    quality:{
      title:'Editar control de calidad',path:'/bananas/quality-checks/update',list:'quality',fields:[
        ['check_code','Código control','text'],
        ['inspector_worker_id','Inspector','workers',true],
        ['check_type','Tipo','select',['incoming','process','box','final']],
        ['result','Resultado','select',['pending','pass','fail','conditional']],
        ['sample_size','Tamaño muestra','number'],
        ['defect_count','Defectos','number']
      ]
    },
    box:{
      title:'Editar caja trazable',path:'/bananas/boxes/update',list:'boxes',fields:[
        ['box_code','Código caja','text'],
        ['pallet_id','Pallet','pallets',true],
        ['weighing_id','Pesaje','weighings',true],
        ['quality_check_id','Control calidad','quality',true],
        ['product_type','Producto','text'],
        ['grade','Grado','text'],
        ['net_weight_kg','Peso neto kg','number'],
        ['status','Estado','select',['packed','quality_hold','approved','palletized','rejected','dispatched']]
      ]
    },
    pallet:{
      title:'Editar pallet',path:'/bananas/pallets/update',list:'pallets',fields:[
        ['pallet_code','Código pallet','text'],
        ['dispatch_id','Despacho','dispatches',true],
        ['status','Estado','select',['open','closed','hold','loaded','dispatched']],
        ['declared_box_count','Cajas declaradas','number'],
        ['gross_weight_kg','Peso bruto kg','number']
      ]
    },
    dispatch:{
      title:'Editar despacho',path:'/bananas/dispatches/update',list:'dispatches',fields:[
        ['dispatch_code','Código despacho','text'],
        ['customer_name','Cliente','text'],
        ['destination','Destino','text'],
        ['vehicle_plate','Placa','text'],
        ['driver_name','Conductor','text'],
        ['status','Estado','select',['draft','loading','dispatched','delivered','cancelled']],
        ['declared_pallets','Pallets declarados','number'],
        ['declared_boxes','Cajas declaradas','number'],
        ['declared_weight_kg','Peso declarado kg','number']
      ]
    }
  };

  function listOptions(type,record){
    const s=state()||{};
    const sameSite=x=>!record?.site_id||x.site_id===record.site_id;
    const map={
      harvest:[s.harvest||[],'id','order_code'],
      workers:[s.workers||[],'id','full_name'],
      pallets:[s.pallets||[],'id','pallet_code'],
      weighings:[s.weighings||[],'id','reference_code'],
      quality:[s.quality||[],'id','check_code'],
      dispatches:[s.dispatches||[],'id','dispatch_code']
    }[type];
    if(!map)return[];
    const [rows,idKey,labelKey]=map;
    return rows.filter(sameSite).map(x=>[x[idKey],x[labelKey]||x[idKey]]);
  }

  function fieldHtml(field,record){
    const [name,label,type,arg]=field;
    let value=record?.[name]??'';
    if(type==='date')value=ymd(value);
    let input='';

    if(type==='select'){
      input=`<select name="${name}">${arg.map(v=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(v)}</option>`).join('')}</select>`;
    }else if(['harvest','workers','pallets','weighings','quality','dispatches'].includes(type)){
      input=`<select name="${name}">${arg===true?'<option value="">Sin asignar</option>':''}${listOptions(type,record).map(([v,l])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
    }else{
      input=`<input name="${name}" type="${type}" value="${esc(value)}" ${type==='number'?'step="any" min="0"':''}>`;
    }

    return `<div><label>${esc(label)}</label>${input}</div>`;
  }

  function recordFor(kind,id){
    const cfg=configs[kind];
    const s=state();
    return (s?.[cfg?.list]||[]).find(x=>x.id===id);
  }

  async function openEdit(kind,id){
    const cfg=configs[kind];
    const record=recordFor(kind,id);
    if(!cfg||!record)return;

    const {modal,title,subtitle,form}=modalParts();
    title.textContent=cfg.title;
    subtitle.textContent=`${record.site_name||record.session_code||'Registro actual'} · la organización y el sitio permanecen protegidos.`;
    form.innerHTML=cfg.fields.map(f=>fieldHtml(f,record)).join('')+`<div class="banana-form-actions"><button class="btn ghost" type="button" data-ops-cancel>Cancelar</button><button class="btn" type="submit">Guardar cambios</button></div>`;
    $('[data-ops-cancel]',form).onclick=closeModal;

    form.onsubmit=async e=>{
      e.preventDefault();
      const fd=new FormData(form);
      const body={id:record.id};
      cfg.fields.forEach(([name,,type])=>{
        let value=fd.get(name);
        if(value==='')value=null;
        if(type==='number'&&value!==null)value=Number(value);
        body[name]=value;
      });

      try{
        showMessage('Guardando cambios…','ok');
        await window.__tayuApiPost(cfg.path,body);
        await window.BananaUI.refresh();
        showMessage('Cambios guardados.','ok');
        setTimeout(closeModal,350);
      }catch(error){
        showMessage(error.message||'No se pudieron guardar los cambios.','error');
      }
    };

    showMessage('');
    modal.classList.add('open');
  }

  function actionCell(kind,row,{trace=false}={}){
    return `<td><div class="banana-row-actions">
      <button class="banana-mini" type="button" data-banana-ops-edit="${kind}" data-id="${esc(row.id)}">Editar</button>
      ${trace?`<button class="banana-mini" type="button" data-banana-ops-trace="${esc(row.box_code)}">Trazar</button>`:''}
    </div></td>`;
  }

  function decorateTable(panelId,kind,rows,opts={}){
    const host=$(`#bananeras [data-banana-panel="${panelId}"]`);
    if(!host)return;
    const table=$('.banana-table',host);
    if(!table||table.dataset.opsV13==='1')return;

    const head=$('thead tr',table);
    if(head)head.insertAdjacentHTML('beforeend','<th>Acciones</th>');

    $$('tbody tr',table).forEach((tr,i)=>{
      const row=rows[i];
      if(row)tr.insertAdjacentHTML('beforeend',actionCell(kind,row,opts));
    });

    table.dataset.opsV13='1';
  }

  function decorate(){
    const s=state();
    if(!s)return;
    decorateTable('packing','packing',filtered(s.packing));
    decorateTable('quality','quality',filtered(s.quality));
    const tracePanel=$('#bananeras [data-banana-panel="trace"]');
    if(tracePanel){
      const tables=$$('.banana-table',tracePanel);
      const table=tables[tables.length-1];
      if(table&&table.dataset.opsV13!=='1'){
        const head=$('thead tr',table);
        if(head)head.insertAdjacentHTML('beforeend','<th>Acciones</th>');
        $$('tbody tr',table).forEach((tr,i)=>{
          const row=filtered(s.boxes)[i];
          if(row)tr.insertAdjacentHTML('beforeend',actionCell('box',row,{trace:true}));
        });
        table.dataset.opsV13='1';
      }
    }
    decorateTable('pallets','pallet',filtered(s.pallets));
    decorateTable('dispatches','dispatch',filtered(s.dispatches));
  }

  function traceBox(code){
    const tab=$('#bananeras [data-banana-tab="trace"]');
    tab?.click();
    setTimeout(()=>{
      const input=$('#bananeras [data-banana-trace-input]');
      if(input)input.value=code;
      $('#bananeras [data-banana-trace-btn]')?.click();
    },50);
  }

  function bind(){
    const root=$('#bananeras');
    if(!root||root.dataset.opsBoundV13==='1')return;
    root.dataset.opsBoundV13='1';
    root.addEventListener('click',e=>{
      const edit=e.target.closest('[data-banana-ops-edit]');
      if(edit){
        openEdit(edit.dataset.bananaOpsEdit,edit.dataset.id);
        return;
      }
      const trace=e.target.closest('[data-banana-ops-trace]');
      if(trace){
        traceBox(trace.dataset.bananaOpsTrace);
      }
    });
  }

  function boot(){
    if(!window.BananaUI){setTimeout(boot,150);return;}
    bind();
    decorate();
    const target=$('#bananeras');
    if(target){
      const observer=new MutationObserver(()=>decorate());
      observer.observe(target,{childList:true,subtree:true});
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();