/* TAYULABS Cloud · Bananeras presentation polish v1.9 */
(function(){
  'use strict';

  const ACCOUNT='demo@tayulabs.com';
  const INDEX_URL='demo/bananas-track-index.json?v=1.9';
  let operators=[];
  let listObserver=null;
  let rootObserver=null;
  let detailsObserver=null;
  let painting=false;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  function identities(){
    const out=[];
    try{if(typeof currentUser!=='undefined'&&currentUser)out.push(currentUser.email,currentUser.username,currentUser.user);}catch(_){ }
    try{if(typeof keycloak!=='undefined'&&keycloak?.tokenParsed)out.push(keycloak.tokenParsed.email,keycloak.tokenParsed.preferred_username,keycloak.tokenParsed.username);}catch(_){ }
    try{const me=window.BananaUI?.state?.me;if(me)out.push(me.email,me.username,me.preferred_username);}catch(_){ }
    return out.filter(Boolean).map(v=>String(v).trim().toLowerCase());
  }

  function enabled(){return identities().includes(ACCOUNT)||identities().includes('demo');}

  function cleanText(value){
    return String(value??'')
      .replace(/TAYU_DEMO_BANANERAS_V1/gi,'')
      .replace(/ORION-DEMO-/gi,'ORION-')
      .replace(/\bDEMO\s*·\s*/gi,'')
      .replace(/\bDEMO-/gi,'')
      .replace(/\bDEMO\b/gi,'')
      .replace(/\s{2,}/g,' ')
      .trim();
  }

  function ensureStyle(){
    if(document.getElementById('banana-presentation-v19-style'))return;
    const s=document.createElement('style');
    s.id='banana-presentation-v19-style';
    s.textContent=`
      #bananaDemoBadge{display:none!important}
      #bananeras .banana-demo-gps-banner{display:none!important}
      #bananeras .banana-orion-list-card{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--border);border-radius:14px;background:var(--panel2);color:var(--text);text-align:left;cursor:pointer}
      #bananeras .banana-orion-list-card:hover,#bananeras .banana-orion-list-card.active{border-color:rgba(85,198,43,.45);background:rgba(85,198,43,.09)}
      #bananeras .banana-orion-list-card b{display:block;font-size:13px}
      #bananeras .banana-orion-list-card small{display:block;color:var(--muted);margin-top:3px;font-size:11px}
      #bananeras .banana-orion-list-card>span:last-child{font-size:11px;font-weight:800;color:var(--muted);white-space:nowrap}
      #bananeras .banana-orion-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:7px;vertical-align:-1px}
    `;
    document.head.appendChild(s);
  }

  function sanitizeElement(el){
    if(!el||el.nodeType!==1)return;
    if(el.id==='bananaDemoBadge'){el.remove();return;}

    el.querySelectorAll?.('#bananaDemoBadge').forEach(x=>x.remove());

    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      const parent=node.parentElement;
      if(!parent||['SCRIPT','STYLE'].includes(parent.tagName))continue;
      const next=cleanText(node.nodeValue);
      if(next!==String(node.nodeValue??'').trim())node.nodeValue=next;
    }

    el.querySelectorAll?.('input[type="text"],input:not([type]),textarea').forEach(input=>{
      if(!input.value)return;
      const next=cleanText(input.value);
      if(next!==input.value)input.value=next;
    });

    el.querySelectorAll?.('#bananaSatelliteDetails .hint,.banana-demo-details .hint').forEach(p=>{
      if(/fictic|demostraci|track suministrado|coordenadas reales/i.test(p.textContent||''))p.remove();
    });
  }

  async function loadOperators(){
    const r=await fetch(INDEX_URL,{cache:'no-store'});
    if(!r.ok)throw new Error('No se pudo cargar la lista de operadores ORIÓN.');
    const data=await r.json();
    operators=(data.operators||[]).map((x,i)=>({...x,_index:i}));
    return operators;
  }

  function listHost(){return document.getElementById('bananaSatelliteList');}

  function paintList(){
    const list=listHost();
    if(!list||!operators.length||painting)return;
    if(list.dataset.orionPresentation==='1'&&list.querySelectorAll('[data-demo-orion]').length===operators.length)return;

    painting=true;
    try{
      list.dataset.orionPresentation='1';
      list.innerHTML=operators.map((x,i)=>`
        <button type="button" class="banana-orion-list-card" data-demo-orion="${i}" data-orion-presentation="1">
          <span>
            <b><span class="banana-orion-dot" style="background:${String(x.color||'#55c62b').replace(/[^#a-zA-Z0-9(),.%\s-]/g,'')}"></span>${cleanText(x.name)}</b>
            <small>${cleanText(x.id)} · ${cleanText(x.date)}</small>
          </span>
          <span>${Number(x.points_count||0)} pts · ${Number(x.distance_km||0).toFixed(2)} km</span>
        </button>`).join('');

      list.querySelectorAll('[data-demo-orion]').forEach(btn=>{
        btn.onclick=()=>{
          const index=Number(btn.dataset.demoOrion);
          list.querySelectorAll('[data-demo-orion]').forEach((b,j)=>b.classList.toggle('active',j===index));
          try{window.focusBananaDemoOperator?.(index);}catch(error){console.warn(error);}
          setTimeout(()=>{sanitizeElement(document.getElementById('bananaSatelliteDetails'));sanitizePopups();},30);
        };
      });
    }finally{
      painting=false;
    }
  }

  function sanitizePopups(){
    document.querySelectorAll('.leaflet-popup-content,.leaflet-tooltip').forEach(el=>sanitizeElement(el));
  }

  function watchList(){
    const list=listHost();
    if(!list)return;
    listObserver?.disconnect();
    listObserver=new MutationObserver(()=>{
      if(painting)return;
      const ours=list.querySelectorAll('[data-orion-presentation="1"]').length;
      if(ours!==operators.length)setTimeout(paintList,0);
    });
    listObserver.observe(list,{childList:true,subtree:true,characterData:true});
    paintList();
  }

  function watchDetails(){
    const d=document.getElementById('bananaSatelliteDetails');
    if(!d)return;
    detailsObserver?.disconnect();
    detailsObserver=new MutationObserver(()=>setTimeout(()=>sanitizeElement(d),0));
    detailsObserver.observe(d,{childList:true,subtree:true,characterData:true});
    sanitizeElement(d);
  }

  function suppressLegacyRenderer(){
    if(window.__bananaPresentationLegacySuppressed)return;
    const original=window.renderBananaSatellite;
    window.__bananaPresentationLegacySuppressed=true;
    window.renderBananaSatellite=function(...args){
      if(enabled()){
        setTimeout(()=>{paintList();sanitizeElement(document.getElementById('bananaSatelliteDetails'));},0);
        return;
      }
      return typeof original==='function'?original.apply(this,args):undefined;
    };
  }

  function attach(){
    if(!enabled())return;
    ensureStyle();
    suppressLegacyRenderer();
    const root=document.getElementById('bananeras');
    if(!root)return;
    sanitizeElement(root);
    watchList();
    watchDetails();
    sanitizePopups();
  }

  async function boot(){
    for(let i=0;i<240;i++){
      if(enabled()&&window.BananaUI){
        await loadOperators();
        attach();
        const root=document.getElementById('bananeras');
        rootObserver=new MutationObserver(()=>{
          sanitizeElement(root);
          if(listHost()&&!listObserver)watchList();
          if(document.getElementById('bananaSatelliteDetails')&&!detailsObserver)watchDetails();
          paintList();
          sanitizePopups();
        });
        rootObserver.observe(root,{childList:true,subtree:true,characterData:true});
        document.addEventListener('click',e=>{
          if(e.target.closest('#bananeras [data-banana-tab="orion"]')){
            setTimeout(()=>{attach();paintList();sanitizePopups();},220);
            setTimeout(()=>{attach();paintList();sanitizePopups();},900);
          }
        },true);
        return;
      }
      await sleep(250);
    }
  }

  boot().catch(error=>console.error('Bananeras presentation polish:',error));
})();
