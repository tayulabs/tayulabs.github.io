/* Amelia Satellite report UI: authenticated PDF generation exclusively on the VPS. */
(function(root){
  'use strict';
  const R=root.AmeliaSatelliteReport;
  if(!R)return;
  const $=(id)=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fileName=(field,id)=>('Amelia-Satellite-'+String(field.code||field.name||'lote')+'-'+id).replace(/[^A-Za-z0-9_-]+/g,'-').slice(0,160)+'.pdf';
  function download(data,field){
    if(!data||typeof data.pdf_base64!=='string'||data.pdf_base64.length>20971520||!/^JVBERi0[A-Za-z0-9+/=]+$/.test(data.pdf_base64))throw Error('La API no devolvió un PDF válido.');
    const raw=atob(data.pdf_base64),bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
    const a=document.createElement('a');a.href=url;a.download=fileName(field,data.report_id||Date.now());document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  let active=false;
  function open(context){
    if(active)return;
    const field=context?.field;
    if(!field?.id||typeof context.getApi!=='function')throw Error('Selecciona un lote para generar el informe.');
    const dialog=document.createElement('dialog');dialog.id='satReportDialog';
    dialog.style.cssText='width:min(620px,calc(100vw - 24px));max-height:90vh;overflow:auto;border:1px solid #77936b;border-radius:14px;padding:20px;background:var(--card,#fff);color:var(--text,#20341d);box-shadow:0 12px 50px #0004;';
    dialog.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h3 style="margin:0">Informe satelital PDF</h3><button type="button" class="btn ghost" data-close aria-label="Cerrar">×</button></div><p style="margin:12px 0;color:var(--muted,#657661)">'+esc(field.code||'Lote')+' · '+esc(field.name||'')+' · '+esc(field.crop_type||'Cultivo no informado')+'</p><div style="display:flex;gap:12px;flex-wrap:wrap"><label style="flex:1;min-width:120px;display:grid;gap:5px">Periodo<select id="satReportDays"><option value="30">30 días</option><option value="90" selected>90 días</option><option value="180">180 días</option><option value="365">365 días</option></select></label><label style="flex:1;min-width:140px;display:grid;gap:5px">Tipo de informe<select id="satReportType"><option value="technical">Técnico completo</option><option value="executive">Ejecutivo</option></select></label></div><h4 style="margin:18px 0 8px">Secciones</h4><div id="satReportSections" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:7px">'+R.SECTIONS.map(([k,name])=>'<label style="display:flex;align-items:center;gap:8px;padding:7px 0"><input type="checkbox" value="'+k+'" checked style="width:auto;flex:none">'+esc(name)+'</label>').join('')+'</div><p style="font-size:12px;color:var(--muted,#657661)">Se utilizarán los datos disponibles del lote; sin reanalizar ni inventar observaciones. El informe se genera de forma segura en el servidor de Amelia Cloud y se descarga automáticamente. Los datos ausentes se identifican en el documento.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="satReportDirect" class="btn" type="button">Generar informe PDF</button></div><p id="satReportProgress" role="status" aria-live="polite" style="font-size:13px;min-height:20px;margin-bottom:0"></p>';
    document.body.appendChild(dialog);active=true;
    const close=()=>{active=false;dialog.remove();};
    dialog.addEventListener('close',close,{once:true});
    dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('cancel',()=>{});
    $('satReportType').addEventListener('change',e=>{
      const selected=e.target.value==='executive'?R.EXECUTIVE:R.DEFAULTS;
      dialog.querySelectorAll('input[type=checkbox]').forEach(x=>x.checked=selected.includes(x.value));
    });
    function options(){return R.settings({days:$('satReportDays').value,type:$('satReportType').value,sections:[...dialog.querySelectorAll('input[type=checkbox]:checked')].map(x=>x.value)});}
    let busy=false;
    const progress=t=>{const el=dialog.querySelector('#satReportProgress');if(el)el.textContent=t;};
    const setBusy=b=>{busy=b;dialog.querySelectorAll('button:not([data-close]),select,input').forEach(el=>el.disabled=b);};
    $('satReportDirect').addEventListener('click',async()=>{
      if(busy)return;
      let cfg;try{cfg=options();}catch(e){progress(e.message);return;}
      if(context.isCurrent&&!context.isCurrent()){progress('El lote cambió. Cierra y vuelve a abrir el informe.');return;}
      if(typeof root.__tayuApiPost!=='function'){progress('Servicio autenticado no disponible. Actualiza Amelia Cloud e inténtalo nuevamente.');return;}
      setBusy(true);progress('Generando informe en el servidor… Puede tardar según la cantidad de datos.');
      try{
        const response=await root.__tayuApiPost('/satellite/reports/pdf',{field_id:field.id,...cfg});
        if(!dialog.isConnected||(context.isCurrent&&!context.isCurrent()))return;
        download(response,field);progress('PDF descargado.');
      }catch(e){progress('No se pudo generar el PDF: '+(e?.message||'error'));}
      finally{if(dialog.isConnected)setBusy(false);}
    });
    if(typeof dialog.showModal==='function')dialog.showModal();else{dialog.setAttribute('open','');dialog.querySelector('[data-close]').onclick=close;}
  }
  root.AmeliaSatelliteReportUI={open};
})(window);