(() => {
  'use strict';

  let observer = null;
  let repairQueued = false;

  function installStyles(){
    if(document.getElementById('tayuModbusActionStableStyles')) return;
    const style=document.createElement('style');
    style.id='tayuModbusActionStableStyles';
    style.textContent=`
      #modbus .tayu-mb-delete{
        width:32px!important;height:32px!important;padding:0!important;
        border-radius:10px!important;display:inline-grid!important;place-items:center!important;
        font-size:21px!important;line-height:1!important;font-weight:900!important;
        background:rgba(239,68,68,.08)!important;color:var(--danger)!important;
        border:1px solid rgba(239,68,68,.24)!important;cursor:pointer!important;
      }
      #modbus .tayu-mb-delete:hover{
        background:rgba(239,68,68,.14)!important;border-color:var(--danger)!important;
      }
      #modbus th[data-mb-action-head],#modbus td[data-mb-action-cell]{
        width:64px;text-align:center!important;
      }
    `;
    document.head.appendChild(style);
  }

  function repair(){
    repairQueued=false;
    installStyles();

    const table=document.querySelector('#modbus .modbus-param-table');
    const tbody=document.getElementById('mbParamRows');
    if(!table||!tbody) return;

    const headRow=table.querySelector('thead tr');
    if(headRow){
      let head=headRow.querySelector('[data-mb-action-head]');
      if(!head){
        head=document.createElement('th');
        head.dataset.mbActionHead='1';
        head.textContent='Acción';
        headRow.appendChild(head);
      }
    }

    tbody.querySelectorAll('.mb-empty-row').forEach(row=>{
      row.querySelector('td')?.setAttribute('colspan','9');
    });

    tbody.querySelectorAll('tr:not(.mb-empty-row)').forEach(row=>{
      let button=row.querySelector('[data-mb-delete]');
      let cell=button?.closest('td') || row.querySelector('[data-mb-action-cell]');

      if(!cell){
        cell=document.createElement('td');
        cell.dataset.mbActionCell='1';
        row.appendChild(cell);
      }else{
        cell.dataset.mbActionCell='1';
      }

      if(!button){
        button=document.createElement('button');
        button.type='button';
        button.className='btn ghost tayu-mb-delete';
        button.dataset.mbDelete='1';
        cell.replaceChildren(button);
      }

      button.textContent='×';
      button.title='Eliminar parámetro Modbus';
      button.setAttribute('aria-label','Eliminar parámetro Modbus');
    });
  }

  function queueRepair(){
    if(repairQueued) return;
    repairQueued=true;
    requestAnimationFrame(repair);
  }

  function bindObserver(){
    const section=document.getElementById('modbus');
    if(!section) return false;

    observer?.disconnect();
    observer=new MutationObserver(mutations=>{
      if(mutations.some(m=>m.type==='childList')) queueRepair();
    });
    observer.observe(section,{childList:true,subtree:true});
    queueRepair();
    return true;
  }

  function boot(){
    installStyles();
    if(!bindObserver()){
      let attempts=0;
      const timer=setInterval(()=>{
        attempts+=1;
        if(bindObserver()||attempts>=80) clearInterval(timer);
      },100);
    }

    document.addEventListener('click',event=>{
      if(event.target?.closest?.('.nav button[data-view="modbus"]')) setTimeout(queueRepair,80);
    },true);

    window.addEventListener('tayu:client-access-ready',()=>setTimeout(queueRepair,120));
    window.addEventListener('pageshow',()=>setTimeout(queueRepair,120));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();

(() => {
  'use strict';
  if(document.getElementById('tayuAdvancedVisualsUiV2Loader')) return;

  const ui=document.createElement('script');
  ui.id='tayuAdvancedVisualsUiV2Loader';
  ui.src='cloud-client-advanced-visuals-ui-v2.js?v=20260914-water2';
  ui.async=false;
  ui.onload=()=>{
    if(document.getElementById('tayuAdvancedVisualsV4Loader')) return;
    const engine=document.createElement('script');
    engine.id='tayuAdvancedVisualsV4Loader';
    engine.src='cloud-client-advanced-visuals-v4.js?v=20260914-levelcolors3';
    engine.async=false;
    engine.onload=()=>{
      if(document.getElementById('tayuAdvancedVisualsLiveSyncLoader')) return;
      const sync=document.createElement('script');
      sync.id='tayuAdvancedVisualsLiveSyncLoader';
      sync.src='cloud-client-advanced-visuals-live-sync.js?v=20260914-livecolors2';
      sync.async=false;
      document.head.appendChild(sync);
    };
    document.head.appendChild(engine);
  };
  document.head.appendChild(ui);
})();

(() => {
  'use strict';
  if(document.getElementById('tayuAutomationRuntimeLoader')) return;
  const script=document.createElement('script');
  script.id='tayuAutomationRuntimeLoader';
  script.src='cloud-client-automation-runtime.js?v=20260914-runtime1';
  script.async=false;
  document.head.appendChild(script);
})();

(() => {
  'use strict';
  if(document.getElementById('tayuSidebarUnderlayWidthFix')) return;
  const style=document.createElement('style');
  style.id='tayuSidebarUnderlayWidthFix';
  style.textContent=`
    @media (min-width:961px){
      html body #app.app::before,
      html body.sidebar-collapsed #app.app::before,
      html body:not(.sidebar-collapsed) #app.app::before{
        width:150px!important;
      }
    }
  `;
  document.head.appendChild(style);
})();
