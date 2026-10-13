/* TAYULABS Journal — catálogo dinámico independiente del diseño */
(()=>{"use strict";
if(!document.querySelector('script[src*="assets/analytics/tayu-ga4.js"]')){
 const analytics=document.createElement("script");
 analytics.src="/assets/analytics/tayu-ga4.js?v=1";
 analytics.defer=true;
 document.head.appendChild(analytics);
}

const grid=document.getElementById("tb-results"),input=document.getElementById("tb-search"),filters=document.querySelector(".tb-filters"),empty=document.getElementById("tb-empty"),featureSection=document.querySelector(".tb-feature"),feature=document.querySelector(".tb-feature-card");
let all=[],category="Todos";
const esc=v=>String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const slug=v=>String(v||"").replace(/[^a-z0-9-]/g,"");
function apply(){
 let count=0;
 grid?.querySelectorAll(".tb-card").forEach(card=>{
  const visible=(category==="Todos"||category===card.dataset.category)&&norm(card.textContent).includes(norm(input?.value));
  card.hidden=!visible;if(visible)count++;
 });
 if(empty){empty.hidden=count>0;empty.textContent=all.length? "No encontramos artículos con esos filtros. Prueba otra búsqueda." : "Estamos preparando nuevas historias. ¡Muy pronto encontrarás nuestros artículos aquí!";}
}
function pick(name){
 category=name;
 document.querySelectorAll(".tb-filter").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.filter===name)));
 apply();
}
function initFilters(){
 document.querySelectorAll(".tb-filter").forEach(btn=>btn.addEventListener("click",()=>pick(btn.dataset.filter||"Todos")));
 input?.addEventListener("input",apply);
 document.querySelectorAll("[data-event-filter]").forEach(btn=>btn.addEventListener("click",()=>pick("Eventos")));
}
function render(posts){
 if(!grid)return;
 all=Array.isArray(posts)?posts.filter(p=>p&&slug(p.slug)&&p.titulo):[];
 all.sort((a,b)=>String(b.fecha||"").localeCompare(String(a.fecha||"")));
 const cats=[...new Set(all.map(p=>p.categoria).filter(Boolean))];
 if(filters)filters.innerHTML=["Todos",...cats].map(c=>'<button type="button" class="tb-filter" data-filter="'+esc(c)+'" aria-pressed="'+String(c===category)+'">'+esc(c)+'</button>').join("");
 grid.innerHTML=all.map(p=>{
  const link="blog/"+slug(p.slug)+".html";
  const image=p.cover?'<img loading="lazy" src="'+esc(p.cover)+'" alt="'+esc(p.coverAlt||p.titulo)+'">':'<div style="height:100%;display:grid;place-items:center;background:radial-gradient(circle at 80% 25%,#4b912f,#183a23);color:white;font:2rem Anton,Impact,sans-serif;padding:25px;text-align:center">TAYULABS</div>';
  const date=p.fecha?new Date(p.fecha+"T12:00:00").toLocaleDateString("es-EC",{day:"numeric",month:"short",year:"numeric"}):"";
  return '<article class="tb-card" data-category="'+esc(p.categoria||"Noticias")+'"><figure><a href="'+link+'">'+image+'</a></figure><div class="tb-card-body"><span class="tb-label">'+esc(p.categoria||"Noticias")+'</span><h3><a href="'+link+'">'+esc(p.titulo)+'</a></h3><p>'+esc(p.resumen)+'</p><div class="tb-card-foot"><span class="tb-date">'+esc(date)+'</span><a href="'+link+'" style="color:#284a18">Leer historia ↗</a></div></div></article>';
 }).join("");
 const featured=all.find(p=>p.destacado);
 if(featureSection)featureSection.hidden=!featured;
 if(featured&&feature){
  feature.querySelector("h3").textContent=featured.titulo;
  feature.querySelector("p").textContent=featured.resumen||"";
  feature.querySelector(".tb-label").textContent=featured.categoria||"TAYULABS";
  feature.querySelector("a.tb-read").href="blog/"+slug(featured.slug)+".html";
  const img=feature.querySelector("img");
  if(img){img.src=featured.cover||"assets/images/tayu20labs-206x206.png";img.alt=featured.coverAlt||featured.titulo;}
 }
 initFilters();if(!cats.includes(category))category="Todos";pick(category);
}
if(grid)fetch("blog/publicaciones.json",{cache:"no-cache"}).then(r=>{if(!r.ok)throw Error("No se puede leer publicaciones.json");return r.json()}).then(d=>render(d.posts)).catch(err=>{console.error("Error en catálogo del blog",err);if(featureSection)featureSection.hidden=true;if(empty){empty.hidden=false;empty.textContent="No fue posible cargar las publicaciones. Inténtalo de nuevo más tarde.";}});else initFilters();
const dlg=document.getElementById("tb-photo-dialog");
document.querySelectorAll(".tb-gallery-btn").forEach(b=>b.addEventListener("click",()=>{const source=b.querySelector("img");if(!dlg||!source)return;dlg.querySelector("img").src=source.src;dlg.querySelector("img").alt=source.alt;if(dlg.showModal)dlg.showModal();}));
dlg?.querySelector("button")?.addEventListener("click",()=>dlg.close());
document.querySelectorAll("[data-share]").forEach(b=>b.addEventListener("click",async()=>{const url=b.dataset.share||location.href;try{if(navigator.share)await navigator.share({title:document.title,url});else if(navigator.clipboard){await navigator.clipboard.writeText(url);b.textContent="¡Enlace copiado!";}}catch(e){} }));
})();