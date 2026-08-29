/* TAYULABS Cloud · Bananeras ORIÓN demo repair v1.8
   Repara la vista GPS demo si el runtime quedó incompleto.
*/
(function(){
  'use strict';

  const DEMO_EMAIL='demo@tayulabs.com';
  let rendering=false;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  function identities(){
    const out=[];
    try{if(typeof currentUser!=='undefined'&&currentUser)out.push(currentUser.email,currentUser.username,currentUser.user);}catch(_){ }
    try{if(typeof keycloak!=='undefined'&&keycloak?.tokenParsed)out.push(keycloak.tokenParsed.email,keycloak.tokenParsed.preferred_username,keycloak.tokenParsed.username);}catch(_){ }
    try{const me=window.BananaUI?.state?.me;if(me)out.push(me.email,me.username,me.preferred_username);}catch(_){ }
    return out.filter(Boolean).map(v=>String(v).trim().toLowerCase());
  }

  function isDemo(){
    const ids=identities();
    return ids.includes(DEMO_EMAIL)||ids.includes('demo');
  }

  function panel(){
    return document.querySelector('#bananeras [data-banana-panel="orion"]');
  }

  function runtimeIsComplete(runtime){
    return !!(
      runtime &&
      runtime.querySelector('#bananaSatelliteMap') &&
      runtime.querySelector('#bananaSatelliteList') &&
      runtime.querySelector('#bananaSatelliteDetails')
    );
  }

  function destroyOldMap(){
    try{
      if(window.bananaSatelliteMap&&typeof window.bananaSatelliteMap.remove==='function'){
        window.bananaSatelliteMap.remove();
      }
    }catch(_){ }
    try{window.bananaSatelliteMap=null;}catch(_){ }
  }

  function rebuildRuntime(){
    const hostPanel=panel();
    if(!hostPanel)return null;

    const existing=hostPanel.querySelector('.banana-demo-orion-runtime');
    if(runtimeIsComplete(existing)){
      bindRefresh(existing);
      return existing;
    }

    destroyOldMap();

    hostPanel.innerHTML=`
      <div class="banana-demo-orion-runtime">
        <div class="banana-demo-orion-head">
          <div>
            <h3>🍌 Bananeras · ORIÓN GPS</h3>
            <p>Mapa satelital de recorridos, trazabilidad de labores y ubicación de operadores.</p>
          </div>
          <button type="button" class="btn ghost" data-demo-gps-refresh>Actualizar datos</button>
        </div>
        <div class="banana-demo-orion-grid">
          <div class="banana-demo-map-card">
            <div id="bananaSatelliteMap"></div>
          </div>
          <div class="banana-demo-side-card">
            <h3 style="margin:0 0 8px">Operadores asignados</h3>
            <p class="hint" style="margin:0 0 14px">Selecciona un operador para centrar su recorrido GPS.</p>
            <div id="bananaSatelliteList" class="banana-demo-operator-list"></div>
            <div id="bananaSatelliteDetails" class="banana-demo-details">
              <p class="hint">Selecciona un operador.</p>
            </div>
          </div>
        </div>
      </div>`;

    const runtime=hostPanel.querySelector('.banana-demo-orion-runtime');
    bindRefresh(runtime);
    return runtime;
  }

  function bindRefresh(runtime){
    const btn=runtime?.querySelector('[data-demo-gps-refresh]');
    if(!btn)return;
    btn.onclick=()=>repairAndRender();
  }

  async function repairAndRender(){
    if(!isDemo()||rendering)return;
    const runtime=rebuildRuntime();
    if(!runtime)return;

    rendering=true;
    try{
      await sleep(30);
      if(typeof window.renderBananaDemoGps==='function'){
        await Promise.resolve(window.renderBananaDemoGps());
      }else if(typeof window.refreshBananaSatellite==='function'){
        await Promise.resolve(window.refreshBananaSatellite());
      }
    }catch(error){
      console.error('ORIÓN demo repair v1.8:',error);
    }finally{
      rendering=false;
    }
  }

  document.addEventListener('click',event=>{
    const tab=event.target.closest('#bananeras [data-banana-tab="orion"]');
    if(!tab||!isDemo())return;
    rebuildRuntime();
    setTimeout(()=>repairAndRender(),160);
  },true);

  async function boot(){
    for(let i=0;i<240;i++){
      if(isDemo()&&window.BananaUI&&panel()){
        rebuildRuntime();
        if(panel()?.classList.contains('active')){
          setTimeout(()=>repairAndRender(),120);
        }
        return;
      }
      await sleep(250);
    }
  }

  boot().catch(error=>console.error('ORIÓN demo repair boot:',error));
})();
