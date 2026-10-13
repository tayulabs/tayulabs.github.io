/* Halloween overlay TAYULABS. Fechas Ecuador continental: 13–31 octubre. */
(function(){
"use strict";
if(window.__tayuHalloweenLoaded) return;
window.__tayuHalloweenLoaded=true;
const CONFIG=Object.freeze({
  enabled:true,timeZone:"America/Guayaquil",firstDay:13,lastDay:31,
  intensity:"normal",bats:true,ghosts:true,spiderwebs:true,pumpkins:true
});
const ROOT="tayu-halloween-overlay";
const formatter=new Intl.DateTimeFormat("en-US",{timeZone:CONFIG.timeZone,month:"numeric",day:"numeric"});
const ART={
 bat:'<svg viewBox="0 0 80 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M40 17l-5-7-5 6-8-6-9 4-8-9L1 24l12-2 5 8 11-6 11 10 11-10 11 6 5-8 12 2-4-19-8 9-9-4-8 6-5-6Z" fill="#1d3125" stroke="#6fad51" stroke-width="1.4" stroke-linejoin="round"/><circle cx="36" cy="22" r="1.3" fill="#f0b45f"/><circle cx="44" cy="22" r="1.3" fill="#f0b45f"/></svg>',
 ghost:'<svg viewBox="0 0 48 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 52V24a18 18 0 0 1 36 0v28l-9-6-9 6-9-6-9 6Z" fill="#f3fff0" fill-opacity=".88" stroke="#9bcc8d" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="18" cy="28" rx="2.6" ry="3.5" fill="#293a2e"/><ellipse cx="30" cy="28" rx="2.6" ry="3.5" fill="#293a2e"/><path d="M21 39q3 3 6 0" fill="none" stroke="#293a2e" stroke-width="1.5" stroke-linecap="round"/></svg>',
 web:'<svg viewBox="0 0 110 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="none" stroke="#b7cfad" stroke-width="1.4" stroke-linecap="round"><path d="M0 0H110M0 0V110M0 0l109 109M0 0l110 43M0 0l43 110"/><path d="M24 0Q17 17 0 24M46 0Q32 31 0 46M70 0Q47 47 0 70M98 0Q66 66 0 98"/><path d="M24 0Q27 15 15 27M46 0Q51 27 27 51M70 0Q76 44 44 76M98 0Q102 65 65 102"/></g></svg>',
 pumpkin:'<svg viewBox="0 0 72 74" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M36 22q-2-11 9-18" fill="none" stroke="#356737" stroke-width="6" stroke-linecap="round"/><path d="M36 20Q20 6 15 12q5 11 21 8" fill="#65ac4c"/><ellipse cx="36" cy="47" rx="29" ry="23" fill="#df7628"/><ellipse cx="23" cy="47" rx="13" ry="22" fill="#ee9035"/><ellipse cx="49" cy="47" rx="13" ry="22" fill="#ee9035"/><ellipse cx="36" cy="47" rx="11" ry="23" fill="#f4a149"/><path d="m20 43 7-9 5 10Zm20 1 5-10 7 9Z" fill="#283b27"/><path d="M23 53q13 14 26 0l-6 2-6-3-5 3-5-2Z" fill="#283b27"/></svg>'
};
function show(){
 if(!CONFIG.enabled)return false;
 const manual=new URLSearchParams(window.location.search).get("tayu_halloween");
 if(manual==="off")return false;
 if(manual==="preview")return true;
 const parts=formatter.formatToParts(new Date());
 const month=Number(parts.find(p=>p.type==="month").value);
 const day=Number(parts.find(p=>p.type==="day").value);
 return month===10&&day>=CONFIG.firstDay&&day<=CONFIG.lastDay;
}
function add(root,type,n){
 const el=document.createElement("div");
 el.className="tayu-halloween__ornament tayu-halloween__"+type+" tayu-halloween__"+type+"--"+n;
 el.innerHTML=ART[type]; // Solo SVG fijo definido arriba.
 root.appendChild(el);
}
function mount(){
 if(!document.body||document.getElementById(ROOT))return;
 const root=document.createElement("div");
 root.id=ROOT;
 root.setAttribute("aria-hidden","true");
 root.setAttribute("data-intensity",CONFIG.intensity);
 if(CONFIG.spiderwebs){add(root,"web",1);add(root,"web",2)}
 if(CONFIG.bats){for(let n=1;n<=3;n++)add(root,"bat",n)}
 if(CONFIG.ghosts){add(root,"ghost",1);add(root,"ghost",2)}
 if(CONFIG.pumpkins){add(root,"pumpkin",1);add(root,"pumpkin",2)}
 document.body.appendChild(root);
}
function refresh(){
 if(!document.body)return;
 if(show())mount();
 else{const root=document.getElementById(ROOT);if(root)root.remove()}
}
function init(){
 refresh();
 window.setInterval(refresh,60000);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh()});
 window.addEventListener("pageshow",refresh);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
})();
