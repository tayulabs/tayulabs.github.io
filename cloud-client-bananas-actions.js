/* TAYULABS Cloud · Bananeras actions v1.1
   Edición / desactivación de campo-personal-producción y gestión de integrantes de cuadrilla.
*/
(function(){
  'use strict';

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const today=()=>new Date().toISOString().slice(0,10);
  const ymd=v=>v?String(v).slice(0,10):'';
  const state=()=>window.BananaUI?.state;

  function ensureStyles(){
    if($('#banana-actions-v11-style'))return;
    const style=document.createElement('style');
    style.id='banana-actions-v11-style';
    style.textContent=`
      #bananeras .banana-row-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      #bananeras .banana-mini{border:1px solid var(--border);background:var(--panel);color:var(--text);padding:6px 9px;border-radius:10px;font-size:11px;font-weight:850;cursor:pointer}
      #bananeras .banana-mini:hover{border-color:rgba(85,198,43,.5);background:rgba(85,198,43,.08)}
      #bananeras .banana-mini.danger{color:var(--danger)}
      #bananeras .banana-member-tools{display:grid;grid-template-columns:minmax(180px,1fr) 160px auto;gap:10px;align-items:end;margin:12px 0 16px}
      #bananeras .banana-member-list{display:grid;gap:8px}
      #bananeras .banana-member-row{display:grid;grid-template-columns:minmax(180px,1fr) 130px 130px auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid var(--border);border-radius:14px;background:var(--panel2)}
      #bananeras .banana-member-row small{display:block;color:var(--muted);margin-top:3px}
      @media(max-width:800px){#bananeras .banana-member-tools,#bananeras .banana-member-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function filtered(list){
    const s=state();
    return s?.siteId ? (list||[]).filter(x=>x.site_id===s.siteId) : (list||[]);
  }

  function actionCell(kind,id,{members=false,deactivate=false}={}){
    return `<td><div class="banana-row-actions">
      <button class="banana-mini" type="button" data-banana-edit="${kind}" data-id="${esc(id)}">Editar</button>
      ${members?`<button class="banana-mini" type="button" data-banana-members="${esc(id)}">Integrantes</button>`:''}
      ${deactivate?`<button class="banana-mini danger" type="button" data-banana-deactivate="${kind}" data-id="${esc(id)}">Desactivar</button>`:''}
    </div></td>`;
  }

  function decorateCard(card,kind,rows,opts={}){
    const table=$('.banana-table',card);
    if(!table||table.dataset.actionsV11==='1')return;
    const head=$('thead tr',table);
    if(head)head.insertAdjacentHTML('beforeend','<th>Acciones</th>');
    $$('tbody tr',table).forEach((tr,i)=>{
      const row=rows[i];
      if(row)tr.insertAdjacentHTML('beforeend',actionCell(kind,row.id,opts));
    });
    table.dataset.actionsV11='1';
  }

  function decorate(){
    const s=state();
    if(!s)return;
    const prod=$('#bananeras [data-banana-panel="production"]');
    const people=$('#bananeras [data-banana-panel="people"]');
    if(prod){
      const cards=$$('.banana-section-card',prod);
      if(cards[0])decorateCard(cards[0],'lot',filtered(s.lots),{deactivate:true});
      if(cards[1])decorateCard(cards[1],'harvest',filtered(s.harvest));
    }
    if(people){
      const cards=$$('.banana-section-card',people);
      if(cards[0])decorateCard(cards[0],'worker',filtered(s.workers),{deactivate:true});
      if(cards[1])decorateCard(cards[1],'crew',filtered(s.crews),{members:true,deactivate:true});
    }
  }

  const configs={
    lot:{title:'Editar lote',path:'/bananas/lots/update',list:'lots',fields:[
      ['code','Código','text'],['name','Nombre','text'],['area_hectares','Área (ha)','number'],['variety','Variedad','text'],['status','Estado','select',['active','inactive','closed']]
    ]},
    worker:{title:'Editar trabajador',path:'/bananas/workers/update',list:'workers',fields:[
      ['employee_code','Código empleado','text'],['full_name','Nombre completo','text'],['job_title','Cargo','text'],['phone','Teléfono','text'],['hired_on','Fecha ingreso','date'],['status','Estado','select',['active','inactive']]
    ]},
    crew:{title:'Editar cuadrilla',path:'/bananas/crews/update',list:'crews',fields:[
      ['code','Código','text'],['name','Nombre','text'],['crew_type','Tipo','select',['harvest','field','transport','packing','quality','other']],['supervisor_worker_id','Supervisor','workers',true],['status','Estado','select',['active','inactive']]
    ]},
    harvest:{title:'Editar orden de cosecha',path:'/bananas/harvest-orders/update',list:'harvest',fields:[
      ['order_code','Código orden','text'],['lot_id','Lote','lots'],['crew_id','Cuadrilla','crews'],['scheduled_date','Fecha programada','date'],['status','Estado','select',['draft','scheduled','in_progress','completed','cancelled']],['planned_bunches','Racimos planificados','number'],['harvested_bunches','Racimos cosechados','number'],['received_bunches','Racimos recibidos','number'],['rejected_bunches','Racimos rechazados','number']
    ]}
  };

  function options(type,record){
    const s=state();
    if(type==='workers')return (s.workers||[]).filter(x=>!record?.site_id||x.site_id===record.site_id).map(x=>[x.id,x.full_name]);
    if(type==='lots')return (s.lots||[]).filter(x=>!record?.site_id||x.site_id===record.site_id).map(x=>[x.id,x.name]);
    if(type==='crews')return (s.crews||[]).filter(x=>!record?.site_id||x.site_id===record.site_id).map(x=>[x.id,x.name]);
    return [];
  }

  function fieldHtml(field,record){
    const [name,label,type,arg]=field;
    let value=record?.[name]??'';
    if(type==='date')value=ymd(value);
    let input='';
    if(type==='select'){
      input=`<select name="${name}">${arg.map(v=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(v)}</option>`).join('')}</select>`;
    }else if(['workers','lots','crews'].includes(type)){
      input=`<select name="${name}">${arg===true?'<option value="">Sin asignar</option>':''}${options(type,record).map(([v,l])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
    }else{
      input=`<input name="${name}" type="${type}" value="${esc(value)}" ${type==='number'?'step="any" min="0"':''}>`;
    }
    return `<div><label>${esc(label)}</label>${input}</div>`;
  }

  function modalParts(){
    return {
      modal:$('#bananeras [data-banana-modal]'),
      title:$('#bananeras [data-banana-modal-title]'),
      subtitle:$('#bananeras [data-banana-modal-subtitle]'),
      form:$('#bananeras [data-banana-form]'),
      msg:$('#bananeras [data-banana-message]')
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

  function findRecord(kind,id){
    const cfg=configs[kind],s=state();
    return (s?.[cfg.list]||[]).find(x=>x.id===id);
  }

  async function openEdit(kind,id){
    const cfg=configs[kind];
    const record=findRecord(kind,id);
    if(!cfg||!record)return;
    const {modal,title,subtitle,form}=modalParts();
    title.textContent=cfg.title;
    subtitle.textContent=`${record.site_name||'Sitio actual'} · el sitio y la organización no se pueden cambiar aquí.`;
    form.innerHTML=cfg.fields.map(f=>fieldHtml(f,record)).join('')+`<div class="banana-form-actions"><button class="btn ghost" type="button" data-edit-cancel>Cancelar</button><button class="btn" type="submit">Guardar cambios</button></div>`;
    $('[data-edit-cancel]',form).onclick=closeModal;
    form.onsubmit=async e=>{
      e.preventDefault();
      const fd=new FormData(form),body={id:record.id};
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
      }catch(error){showMessage(error.message||'No se pudieron guardar los cambios.','error');}
    };
    showMessage('');
    modal.classList.add('open');
  }

  function updateBody(kind,record,status){
    if(kind==='lot')return {id:record.id,code:record.code,name:record.name,area_hectares:Number(record.area_hectares||0),variety:record.variety||null,status};
    if(kind==='worker')return {id:record.id,employee_code:record.employee_code,full_name:record.full_name,job_title:record.job_title||null,phone:record.phone||null,hired_on:ymd(record.hired_on)||null,status};
    if(kind==='crew')return {id:record.id,code:record.code,name:record.name,crew_type:record.crew_type,supervisor_worker_id:record.supervisor_worker_id||null,status};
    return null;
  }

  async function deactivate(kind,id){
    const record=findRecord(kind,id);
    const cfg=configs[kind];
    if(!record||!cfg)return;
    if(!window.confirm(`¿Desactivar ${kind==='lot'?'este lote':kind==='worker'?'este trabajador':'esta cuadrilla'}?`))return;
    const body=updateBody(kind,record,'inactive');
    try{
      await window.__tayuApiPost(cfg.path,body);
      await window.BananaUI.refresh();
    }catch(error){window.alert(error.message||'No se pudo desactivar el registro.');}
  }

  async function openMembers(crewId){
    const s=state();
    const crew=(s.crews||[]).find(x=>x.id===crewId);
    if(!crew)return;
    const {modal,title,subtitle,form}=modalParts();
    title.textContent=`Integrantes · ${crew.name}`;
    subtitle.textContent='Asigna trabajadores a la cuadrilla y conserva el historial de entradas y salidas.';
    modal.classList.add('open');
    await renderMembers(crew,form);
  }

  async function renderMembers(crew,form){
    showMessage('Cargando integrantes…','ok');
    let members=[];
    try{
      members=await window.__tayuApi('/bananas/crew-members?crew_id='+encodeURIComponent(crew.id));
      showMessage('');
    }catch(error){showMessage(error.message||'No se pudieron cargar los integrantes.','error');return;}

    const activeWorkers=(state().workers||[]).filter(w=>w.site_id===crew.site_id&&w.status==='active');
    const activeIds=new Set(members.filter(m=>m.left_on==null).map(m=>m.worker_id));
    const available=activeWorkers.filter(w=>!activeIds.has(w.id));

    form.innerHTML=`
      <div class="full"><div class="banana-member-tools">
        <div><label>Trabajador</label><select data-member-worker>${available.length?available.map(w=>`<option value="${esc(w.id)}">${esc(w.full_name)} · ${esc(w.employee_code)}</option>`).join(''):'<option value="">No hay trabajadores disponibles</option>'}</select></div>
        <div><label>Fecha ingreso</label><input type="date" value="${today()}" data-member-date></div>
        <button class="btn" type="button" data-member-add ${available.length?'':'disabled'}>＋ Agregar</button>
      </div></div>
      <div class="full"><div class="banana-member-list">
        ${members.length?members.map(m=>`<div class="banana-member-row">
          <div><b>${esc(m.full_name)}</b><small>${esc(m.employee_code||'')} · ${esc(m.job_title||'Sin cargo')}</small></div>
          <div><small>Ingreso</small><b>${esc(ymd(m.joined_on)||'—')}</b></div>
          <div><small>Salida</small><b>${esc(ymd(m.left_on)||'Activo')}</b></div>
          <div>${m.left_on==null?`<button class="banana-mini danger" type="button" data-member-close="${esc(m.id)}">Retirar</button>`:'<span class="banana-status off">histórico</span>'}</div>
        </div>`).join(''):'<div class="banana-empty">Esta cuadrilla todavía no tiene integrantes.</div>'}
      </div></div>
      <div class="banana-form-actions"><button class="btn ghost" type="button" data-member-done>Cerrar</button></div>`;

    $('[data-member-done]',form).onclick=closeModal;
    const add=$('[data-member-add]',form);
    if(add)add.onclick=async()=>{
      const workerId=$('[data-member-worker]',form)?.value;
      const joinedOn=$('[data-member-date]',form)?.value||today();
      if(!workerId)return;
      try{
        showMessage('Agregando integrante…','ok');
        await window.__tayuApiPost('/bananas/crew-members',{crew_id:crew.id,worker_id:workerId,joined_on:joinedOn});
        await renderMembers(crew,form);
      }catch(error){showMessage(error.message||'No se pudo agregar el integrante.','error');}
    };
    $$('[data-member-close]',form).forEach(btn=>btn.onclick=async()=>{
      if(!window.confirm('¿Retirar este trabajador de la cuadrilla?'))return;
      try{
        showMessage('Registrando salida…','ok');
        await window.__tayuApiPost('/bananas/crew-members/close',{id:btn.dataset.memberClose,left_on:today()});
        await renderMembers(crew,form);
      }catch(error){showMessage(error.message||'No se pudo retirar el integrante.','error');}
    });
  }

  function bindActions(){
    const root=$('#bananeras');
    if(!root||root.dataset.actionsBoundV11==='1')return;
    root.dataset.actionsBoundV11='1';
    root.addEventListener('click',e=>{
      const edit=e.target.closest('[data-banana-edit]');
      if(edit){openEdit(edit.dataset.bananaEdit,edit.dataset.id);return;}
      const deact=e.target.closest('[data-banana-deactivate]');
      if(deact){deactivate(deact.dataset.bananaDeactivate,deact.dataset.id);return;}
      const members=e.target.closest('[data-banana-members]');
      if(members){openMembers(members.dataset.bananaMembers);return;}
    });
  }

  function boot(){
    if(!window.BananaUI){setTimeout(boot,150);return;}
    ensureStyles();
    bindActions();
    decorate();
    const target=$('#bananeras');
    if(target){
      const observer=new MutationObserver(()=>decorate());
      observer.observe(target,{childList:true,subtree:true});
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();