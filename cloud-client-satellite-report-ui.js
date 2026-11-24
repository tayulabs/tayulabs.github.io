/* Amelia Satellite report UI: preview/print locally; optional authenticated VPS download. */
(function(root){
  'use strict';
  const R=root.AmeliaSatelliteReport;
  if(!R)return;
  const $=(id)=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fileName=(field,id)=>('Amelia-Satellite-'+String(field.code||field.name||'lote')+'-'+id).replace(/[^A-Za-z0-9_-]+/g,'-').slice(0,160)+'.pdf';
  async function logo(){
    try{
      const res=await fetch(new URL('imagenes/logo.png',document.baseURI),{cache:'force-cache'});
      if(!res.ok)throw Error();
      const b=await res.blob();if(b.size>2000000||!/^image\/(png|jpeg|webp)$/.test(b.type))return null;
      return await new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=reject;f.readAsDataURL(b);});
    }catch(e){return null;}
  }
  async function decode(r){
    const url=R.safeImage(r.sample_data_url);
    if(!url||!url.startsWith('data:image/png;base64,'))throw Error('Raster numérico inválido');
    const w=Number(r.width),h=Number(r.height);
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>4000000)throw Error('Raster demasiado grande');
    const img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
    if(img.naturalWidth!==w||img.naturalHeight!==h)throw Error('Dimensiones incorrectas');
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Canvas no disponible');
    ctx.drawImage(img,0,0);return ctx.getImageData(0,0,w,h).data;
  }
  function download(data,field){
    if(!data||typeof data.pdf_base64!=='string'||data.pdf_base64.length>55000000||!/^JVBERi0[A-Za-z0-9+/=]+$/.test(data.pdf_base64))throw Error('La API no devolvió un PDF válido.');
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
    dialog.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h3 style="margin:0">Informe satelital PDF</h3><button type="button" class="btn ghost" data-close aria-label="Cerrar">×</button></div><p style="margin:12px 0;color:var(--muted,#657661)">'+esc(field.code||'Lote')+' · '+esc(field.name||'')+' · '+esc(field.crop_type||'Cultivo no informado')+'</p><div style="display:flex;gap:12px;flex-wrap:wrap"><label style="flex:1;min-width:120px;display:grid;gap:5px">Periodo<select id="satReportDays"><option value="30">30 días</option><option value="90" selected>90 días</option><option value="180">180 días</option><option value="365">365 días</option></select></label><label style="flex:1;min-width:140px;display:grid;gap:5px">Tipo de informe<select id="satReportType"><option value="technical">Técnico completo</option><option value="executive">Ejecutivo</option></select></label></div><h4 style="margin:18px 0 8px">Secciones</h4><div id="satReportSections" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:7px">'+R.SECTIONS.map(([k,name])=>'<label style="display:flex;align-items:center;gap:8px;padding:7px 0"><input type="checkbox" value="'+k+'" checked style="width:auto;flex:none">'+esc(name)+'</label>').join('')+'</div><p style="font-size:12px;color:var(--muted,#657661)">Se utilizarán los datos disponibles del lote; sin reanalizar ni inventar observaciones. El informe se puede guardar como PDF en el navegador. La descarga directa requiere habilitar el servicio del VPS.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="satReportPreview" class="btn" type="button">Generar informe PDF</button><button id="satReportDirect" class="btn ghost" type="button">Descarga directa (VPS)</button></div><p id="satReportProgress" role="status" aria-live="polite" style="font-size:13px;min-height:20px;margin-bottom:0"></p>';
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
    $('satReportPreview').addEventListener('click',async()=>{
      if(busy)return;
      let cfg;try{cfg=options();}catch(e){progress(e.message);return;}
      if(context.isCurrent&&!context.isCurrent()){progress('El lote cambió. Cierra y vuelve a abrir el informe.');return;}
      const popup=window.open('','_blank');
      if(!popup){progress('Permite las ventanas emergentes para abrir el informe.');return;}
      try{popup.opener=null;popup.document.title='Preparando informe Amelia';popup.document.body.textContent='Consultando datos satelitales del lote…';}catch(e){popup.close();progress('No fue posible abrir la vista previa.');return;}
      setBusy(true);progress('Consultando historial, adquisiciones y mapas…');
      try{
        const model=await R.collect({...context,options:cfg,decode,logo:await logo()});
        if(!dialog.isConnected||popup.closed||(context.isCurrent&&!context.isCurrent())){if(!popup.closed)popup.close();return;}
        const html=R.render(model);
        popup.document.open();popup.document.write(html);popup.document.close();
        popup.document.getElementById('ameliaPrint')?.addEventListener('click',()=>popup.print());
        progress('Informe preparado. En la nueva ventana, pulsa Imprimir / Guardar como PDF.');
      }catch(e){if(!popup.closed)popup.close();progress('No se pudo generar el informe: '+(e?.message||'error'));}
      finally{if(dialog.isConnected)setBusy(false);}
    });
    $('satReportDirect').addEventListener('click',async()=>{
      if(busy)return;
      let cfg;try{cfg=options();}catch(e){progress(e.message);return;}
      if(context.isCurrent&&!context.isCurrent()){progress('El lote cambió. Cierra y vuelve a abrir el informe.');return;}
      if(typeof root.__tayuApiPost!=='function'){progress('Servicio autenticado no disponible. Usa Generar informe PDF.');return;}
      setBusy(true);progress('Solicitando PDF al servidor…');
      try{
        const response=await root.__tayuApiPost('/satellite/reports/pdf',{field_id:field.id,...cfg});
        if(!dialog.isConnected||(context.isCurrent&&!context.isCurrent()))return;
        download(response,field);progress('PDF descargado.');
      }catch(e){progress('Descarga directa no disponible: '+(e?.message||'error')+'. Usa Generar informe PDF para guardarlo desde el navegador.');}
      finally{if(dialog.isConnected)setBusy(false);}
    });
    if(typeof dialog.showModal==='function')dialog.showModal();else{dialog.setAttribute('open','');dialog.querySelector('[data-close]').onclick=close;}
  }
  root.AmeliaSatelliteReportUI={open};
})(window);