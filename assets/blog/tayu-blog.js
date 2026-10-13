/* TAYULABS Blog — filtros, enlaces y galeria; sin dependencias. */
(()=>{"use strict";
const search=document.querySelector("#tb-search"),chips=[...document.querySelectorAll(".tb-filter")],cards=[...document.querySelectorAll(".tb-card")],empty=document.querySelector("#tb-empty");
let category="Todos";
function normalize(s){return(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function filter(){if(!cards.length)return;const q=normalize(search?.value);let n=0;for(const c of cards){const ok=(category==="Todos"||c.dataset.category===category)&&normalize(c.textContent).includes(q);c.hidden=!ok;n+=ok?1:0;}if(empty)empty.hidden=n!==0;}
chips.forEach(btn=>btn.addEventListener("click",()=>{category=btn.dataset.filter||"Todos";chips.forEach(b=>b.setAttribute("aria-pressed",String(b===btn)));filter();}));search?.addEventListener("input",filter);
const dlg=document.querySelector("#tb-photo-dialog"),img=dlg?.querySelector("img");
document.querySelectorAll(".tb-gallery-btn").forEach(b=>b.addEventListener("click",()=>{if(!dlg||!img)return;img.src=b.querySelector("img")?.src||"";img.alt=b.querySelector("img")?.alt||"Fotografia de evento";if(typeof dlg.showModal==="function")dlg.showModal();else window.open(img.src,"_blank","noopener");}));
dlg?.querySelector("button")?.addEventListener("click",()=>dlg.close());dlg?.addEventListener("click",e=>{if(e.target===dlg)dlg.close();});
document.querySelectorAll("[data-share]").forEach(b=>b.addEventListener("click",async()=>{const url=b.dataset.share||location.href;try{if(navigator.share){await navigator.share({title:document.title,url});}else if(navigator.clipboard){await navigator.clipboard.writeText(url);b.textContent="¡Enlace copiado!";setTimeout(()=>b.textContent="Copiar enlace",1800);}}catch(e){/* dismissed */}}));
})();