/* TAYULABS Cloud · Bananeras loader v1.1 */
(function(){
  'use strict';

  function load(src){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=src;
      script.onload=resolve;
      script.onerror=()=>reject(new Error('No se pudo cargar '+src));
      document.head.appendChild(script);
    });
  }

  (async()=>{
    try{
      await load('cloud-client-bananas.js?v=1.0');
      await load('cloud-client-bananas-actions.js?v=1.1');
    }catch(error){
      console.error('Bananeras loader:',error);
    }
  })();
})();