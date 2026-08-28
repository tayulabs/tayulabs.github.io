/* TAYULABS Cloud · Bananeras loader v1.3 */
(function(){
  'use strict';

  function loadScript(src){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=src;
      script.onload=resolve;
      script.onerror=()=>reject(new Error('No se pudo cargar '+src));
      document.head.appendChild(script);
    });
  }

  function loadCss(href){
    if(document.querySelector(`link[href="${href}"]`))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    document.head.appendChild(link);
  }

  (async()=>{
    try{
      loadCss('cloud-client-bananas-layout.css?v=1.2');
      await loadScript('cloud-client-bananas.js?v=1.0');
      await loadScript('cloud-client-bananas-actions.js?v=1.1');
      await loadScript('cloud-client-bananas-ops.js?v=1.3');
    }catch(error){
      console.error('Bananeras loader:',error);
    }
  })();
})();