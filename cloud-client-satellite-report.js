/* Amelia Satellite: shared report model and A4 document (browser + Node). */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.AmeliaSatelliteReport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SECTIONS=[
    ['summary','Resumen ejecutivo'],['indices','Indicadores NDVI, NDMI, NDRE y EVI'],
    ['maps','Mapas satelitales'],['areas','Superficies y zonas prioritarias'],
    ['history','Evolución histórica'],['compare','Comparación Antes y Después'],
    ['radar','Análisis radar Sentinel-1'],['recommendations','Conclusiones y recomendaciones'],
    ['methodology','Metodología y fuentes']
  ];
  const OPTICAL=['ndvi','ndmi','ndre','evi'];
  const DEFAULTS=SECTIONS.map(x=>x[0]);
  const EXECUTIVE=['summary','indices','maps','history','recommendations','methodology'];
  const N=v=>v==null||typeof v==='boolean'||(typeof v==='string'&&!v.trim())||!Number.isFinite(Number(v))?null:Number(v);
  const F=(v,d=3)=>N(v)==null?'—':N(v).toLocaleString('es-EC',{minimumFractionDigits:d,maximumFractionDigits:d});
  const pct=v=>N(v)==null?'—':F(v,1)+'%';
  const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v)?v.slice(0,10):'';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const usable=r=>r&&['good','limited'].includes(r.quality);
  const rank=r=>({good:3,limited:2,poor:1,no_data:0}[r?.quality]??-1);
  const qlabel=q=>({good:'Buena',limited:'Limitada',poor:'Baja',no_data:'Sin datos'}[q]||'No informada');
  const safeImage=v=>typeof v==='string'&&v.length<=24000000&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)?v:null;
  const signed=v=>N(v)==null?'—':(v>0?'+':'')+F(v);
  const hasMetric=(r,k)=>N(r?.[k+'_mean'])!=null;
  const validDate=v=>!!day(v)&&Number.isFinite(Date.parse(day(v)+'T00:00:00Z'))&&new Date(day(v)+'T00:00:00Z').toISOString().slice(0,10)===day(v);
  const utcToday=()=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const x=k=>p.find(t=>t.type===k).value;return x('year')+'-'+x('month')+'-'+x('day');};
  function settings(options={}){
    const days=[30,90,180,365].includes(Number(options.days))?Number(options.days):90;
    const type=options.type==='executive'?'executive':'technical';
    const sections=Array.isArray(options.sections)?DEFAULTS.filter(x=>options.sections.includes(x)):(type==='executive'?EXECUTIVE.slice():DEFAULTS.slice());
    if(!sections.length)throw Error('Selecciona al menos una sección.');
    return {days,type,sections};
  }
  function rangeFor(days,today=utcToday()){
    if(!validDate(today))throw Error('Fecha de emisión inválida.');
    const start=new Date(today+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-(days-1));
    return {from:start.toISOString().slice(0,10),to:today};
  }
  function historyRows(rows,range){
    const map=new Map();
    for(const r of Array.isArray(rows)?rows:[]){
      const from=day(r?.interval_from),to=day(r?.interval_to);
      // Do not include composites that extend outside the requested interval.
      if(!validDate(from)||!validDate(to)||from>to||from<range.from||to>range.to)continue;
      const k=from+'|'+to, old=map.get(k);
      if(!old||rank(r)>rank(old)||(rank(r)===rank(old)&&(N(r.valid_pixel_percent)??-1)>(N(old.valid_pixel_percent)??-1)))map.set(k,r);
    }
    return [...map.values()].sort((a,b)=>day(a.interval_to).localeCompare(day(b.interval_to)));
  }
  function sceneList(rows,range){
    const seen=new Set();
    return (Array.isArray(rows)?rows:[]).filter(r=>{
      const d=day(r?.acquired_at);
      if(!validDate(d)||d<range.from||d>range.to||!r.id||seen.has(String(r.id)))return false;
      seen.add(String(r.id));return true;
    }).sort((a,b)=>String(a.acquired_at).localeCompare(String(b.acquired_at)));
  }
  const latest=(rows,metric)=>[...rows].reverse().find(r=>usable(r)&&(!metric||hasMetric(r,metric)))||null;
  const metric=(r,k)=>N(r?.[k+'_mean']);
  function delta(a,b,k){const x=metric(a,k),y=metric(b,k);return x==null||y==null?null:y-x;}
  function opticalPair(rows){
    const v=rows.filter(r=>usable(r)&&hasMetric(r,'ndvi'));
    const b=v[v.length-1],a=v.find(r=>day(r.acquired_at)<day(b?.acquired_at));
    return a&&b?{before:a,after:b}:null;
  }
  function inside(x,y,ring){
    let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];if(!Array.isArray(a)||!Array.isArray(b))continue;
      if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;
    }return yes;
  }
  function quantile(a,p){const x=(a.length-1)*p,i=Math.floor(x);return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(x-i);}
  const AREA_COLORS=[[221,122,48],[166,190,90],[43,111,63]], CHANGE_COLORS=[[195,70,50],[221,216,182],[46,125,76]];
  function rasterInfo(r,pixels){
    const w=N(r?.width),h=N(r?.height),bbox=r?.bbox?.map(N),range=r?.sample_value_range?.map(N);
    if(r?.sample_encoding!=='RG16_UNORM_ALPHA_V1'||!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>1000000||
      !bbox||bbox.length!==4||bbox.some(x=>x==null)||bbox[0]>=bbox[2]||bbox[1]>=bbox[3]||bbox[0]<-180||bbox[2]>180||bbox[1]<-90||bbox[3]>90||
      !range||range.length!==2||range.some(x=>x==null)||range[1]<=range[0]||!pixels||pixels.length!==w*h*4)return null;
    const [west,south,east,north]=bbox,rad=Math.PI/180,dx=(east-west)/w*rad,R=6371008.8;
    return {w,h,bbox,range,pixels,center:(x,y)=>[west+(x+.5)*(east-west)/w,north-(y+.5)*(north-south)/h],
      ha:y=>R*R*dx*Math.abs(Math.sin((north-(north-south)*y/h)*rad)-Math.sin((north-(north-south)*(y+1)/h)*rad))/10000,
      value:i=>range[0]+(pixels[i]*256+pixels[i+1])/65535*(range[1]-range[0])};
  }
  function excludedAt(zones,x,y){
    return zones.some(z=>{
      const g=z?.geometry_geojson,ps=g?.type==='Polygon'?[g.coordinates]:g?.type==='MultiPolygon'?g.coordinates:[];
      return Array.isArray(ps)&&ps.some(p=>Array.isArray(p)&&Array.isArray(p[0])&&inside(x,y,p[0])&&!p.slice(1).some(r=>Array.isArray(r)&&inside(x,y,r)));
    });
  }
  function encodePng(w,h,pixels){
    if(typeof require!=='function'||typeof Buffer==='undefined')return null;
    let PNG;try{PNG=require('pngjs').PNG;}catch(e){return null;}
    return 'data:image/png;base64,'+PNG.sync.write({width:w,height:h,data:Buffer.from(pixels)}).toString('base64');
  }
  function areaStats(raster,pixels,zones,encode=encodePng){
    const r=rasterInfo(raster,pixels);if(!r||!Array.isArray(zones))return null;
    let excluded=0,total=0;const points=[];
    for(let y=0;y<r.h;y++){const ha=r.ha(y);for(let x=0;x<r.w;x++){
      const i=(y*r.w+x)*4;if(pixels[i+3]<250)continue;
      const [lon,lat]=r.center(x,y);if(excludedAt(zones,lon,lat)){excluded+=ha;continue;}
      points.push([r.value(i),ha,i]);total+=ha;
    }}
    if(!points.length)return {total:0,excluded,count:0};
    const sorted=points.map(x=>x[0]).sort((a,b)=>a-b),q1=quantile(sorted,.25),q3=quantile(sorted,.75),sums=[0,0,0],out=new Uint8Array(pixels.length);
    for(const [v,ha,i] of points){const k=v<q1?0:v>q3?2:1;sums[k]+=ha;out.set(AREA_COLORS[k],i);out[i+3]=255;}
    return {total,excluded,count:points.length,low:sums[0],mid:sums[1],high:sums[2],q1,q3,image:encode(r.w,r.h,out),bbox:r.bbox};
  }
  function commonChange(a,pa,b,pb,zones,encode=encodePng){
    const x=rasterInfo(a,pa),y=rasterInfo(b,pb);
    if(!x||!y||!Array.isArray(zones)||x.w!==y.w||x.h!==y.h||!x.bbox.every((v,i)=>Math.abs(v-y.bbox[i])<1e-9)||
      !a.sample_processing_version||a.sample_processing_version!==b.sample_processing_version)return null;
    let count=0,total=0,sa=0,sb=0;const sums=[0,0,0],out=new Uint8Array(pa.length);
    for(let j=0;j<x.h;j++){const ha=x.ha(j);for(let i=0;i<x.w;i++){
      const k=(j*x.w+i)*4;if(pa[k+3]<250||pb[k+3]<250)continue;
      const [lon,lat]=x.center(i,j);if(excludedAt(zones,lon,lat))continue;
      const av=x.value(k),bv=y.value(k),d=bv-av,c=d<-.05?0:d>.05?2:1;
      count++;total+=ha;sa+=av*ha;sb+=bv*ha;sums[c]+=ha;out.set(CHANGE_COLORS[c],k);out[k+3]=255;
    }}
    if(!count||!total)return null;
    return {count,total,before:sa/total,after:sb/total,delta:(sb-sa)/total,low:sums[0],mid:sums[1],high:sums[2],image:encode(x.w,x.h,out),bbox:x.bbox};
  }
  async function collect({getApi,field,siteName,organizationName,logo,options,decode,encode=encodePng,today=utcToday(),reportId}){
    if(typeof getApi!=='function'||!field?.id)throw Error('Selecciona un lote.');
    const cfg=settings(options),range=rangeFor(cfg.days,today),root='/satellite/fields/'+encodeURIComponent(field.id),warnings=[];
    const selected=k=>cfg.sections.includes(k);
    const denied=e=>[401,403].includes(Number(e?.status||e?.statusCode))||/\bAPI\s+(401|403)\b/.test(String(e?.message||''));
    async function request(label,path,fallback=null){try{return await getApi(path);}catch(e){if(denied(e))throw e;warnings.push(label+': no disponible.');return fallback;}}
    async function history(){
      try{const r=await getApi(root+'/observations?limit=100');if(!Array.isArray(r))throw Error();if(r.length>=100)warnings.push('Historial: límite de 100 registros alcanzado.');return r;}
      catch(e){if(denied(e))throw e;const r=await request('Historial',root+'/observations?limit=36',[]);warnings.push('Historial consultado con límite de 36 registros; el periodo podría estar incompleto.');return Array.isArray(r)?r:[];}
    }
    const [rawH,rawS,ex]=await Promise.all([
      history(),request('Adquisiciones',root+'/scenes?limit=180',null),
      (selected('areas')||selected('compare'))?request('Exclusiones',root+'/exclusions',null):Promise.resolve(null)
    ]);
    if(Array.isArray(rawS?.scenes)&&rawS.scenes.length>=180)warnings.push('Catálogo: límite de 180 adquisiciones alcanzado; podrían faltar fechas.');
    if(!Array.isArray(rawS?.scenes)&&rawS!=null)warnings.push('Formato del catálogo de adquisiciones no reconocido.');
    const h=historyRows(rawH,range),scenes=sceneList(rawS?.scenes,range);
    const optical=scenes.filter(r=>r.collection==='sentinel-2-l2a'),radar=scenes.filter(r=>r.collection==='sentinel-1-grd');
    const current=latest(optical,'ndvi')||latest(optical),currentRadar=latest(radar),pair=opticalPair(optical);
    const zones=Array.isArray(ex?.zones)?ex.zones:null,maps={};
    const mapCache=new Map();
    async function getMap(row,layer){
      if(!row)return null;
      const cacheKey=String(row.id)+'|'+layer;
      if(mapCache.has(cacheKey))return mapCache.get(cacheKey);
      const result=await request(layer.toUpperCase()+' '+day(row.acquired_at),root+'/scenes/'+encodeURIComponent(row.id)+'/map?layer='+encodeURIComponent(layer)+'&contrast=fixed');
      if(!result||!safeImage(result.image_data_url)){if(result)warnings.push('Imagen '+layer.toUpperCase()+' no disponible o formato no admitido.');mapCache.set(cacheKey,null);return null;}
      mapCache.set(cacheKey,result);return result;
    }
    function publicMap(r,row,layer){return r?{image:safeImage(r.image_data_url),date:day(row.acquired_at),layer,range:Array.isArray(r.color_range)&&r.color_range.length===2?r.color_range.map(N):null,bbox:Array.isArray(r.bbox)?r.bbox.map(N):null}:null;}
    if(selected('maps')&&current)for(const k of OPTICAL)maps[k]=publicMap(await getMap(current,k),current,k);
    let areas=null;
    if(selected('areas')&&current&&zones!==null&&typeof decode==='function'){
      const r=await getMap(current,'ndvi');
      if(r&&r.sample_encoding==='RG16_UNORM_ALPHA_V1'&&safeImage(r.sample_data_url)&&r.width*r.height<=4000000){
        try{areas=areaStats(r,await decode(r),zones,encode);}catch(e){warnings.push('Superficies: no se pudo leer el raster numérico.');}
      }
    }
    if(selected('areas')&&!areas)warnings.push('Superficies válidas por cuartil no calculadas: faltan datos numéricos o exclusiones verificadas.');
    let comparison=null;
    if(selected('compare')&&pair){
      const a=await getMap(pair.before,'ndvi'),b=await getMap(pair.after,'ndvi');
      comparison={...pair,beforeMap:publicMap(a,pair.before,'ndvi'),afterMap:publicMap(b,pair.after,'ndvi')};
      const ar=a?.color_range,br=b?.color_range,ab=a?.bbox,bb=b?.bbox;
      const matching=(x,y,n)=>Array.isArray(x)&&Array.isArray(y)&&x.length===n&&y.length===n&&x.every((v,i)=>N(v)!=null&&N(y[i])!=null&&Math.abs(N(v)-N(y[i]))<1e-9);
      comparison.sameScale=matching(ar,br,2)&&matching(ab,bb,4);
      if(a&&b&&zones!==null&&typeof decode==='function'){try{comparison.common=commonChange(a,await decode(a),b,await decode(b),zones,encode);}catch(e){comparison.common=null;}}
      if(!comparison.common)warnings.push('ΔNDVI común no calculado: faltan rasters numéricos compatibles, versión de procesamiento, exclusiones verificadas o píxeles comunes.');
    }
    const radarMaps={};
    if(selected('radar')&&currentRadar)for(const k of ['vv','vh','ratio'])radarMaps[k]=publicMap(await getMap(currentRadar,k),currentRadar,k);
    return {id:reportId||('AS-'+today.replace(/-/g,'')+'-'+Math.random().toString(36).slice(2,10).toUpperCase()),today,range,cfg,
      field:{id:field.id,code:field.code,name:field.name,crop:field.crop_type,area:N(field.area_hectares)},
      siteName:siteName||'No informado',organizationName:organizationName||'',logo:safeImage(logo),
      history:h,scenes,optical,radar,current,currentRadar,pair,maps,areas,zones:zones?.map(z=>({name:z.name}))??null,comparison,radarMaps,warnings};
  }
  function observations(m){
    const c=m.current,p=m.pair,items=[];
    if(!c)items.push('No se encontraron adquisiciones ópticas utilizables en los datos recuperados para el periodo solicitado.');
    else{
      items.push('Última adquisición óptica utilizable recuperada: '+day(c.acquired_at)+'. NDVI '+F(metric(c,'ndvi'))+'; NDMI '+F(metric(c,'ndmi'))+'. Calidad '+qlabel(c.quality).toLowerCase()+'.');
      if(c.quality==='limited')items.push('La última adquisición tiene calidad limitada; revisar la cobertura y contrastar con observaciones de campo.');
    }
    if(m.comparison?.common){const x=m.comparison.common;items.push('ΔNDVI medio en '+F(x.total,2)+' ha de píxeles comunes: '+signed(x.delta)+' puntos. Interpretación orientativa.');}else if(p){const d=delta(p.before,p.after,'ndvi');if(d!=null)items.push('NDVI: '+signed(d)+' puntos entre '+day(p.before.acquired_at)+' y '+day(p.after.acquired_at)+'. Diferencia de promedios, no necesariamente de los mismos píxeles.');}
    if(m.areas?.count)items.push('Superficie válida tras exclusiones: '+F(m.areas.total,2)+' ha; zona de valores inferiores al P25: '+F(m.areas.low,2)+' ha.');
    return items;
  }
  function recs(m){
    const items=[];
    if(!m.current)items.push('Revisar nuevas adquisiciones ópticas cuando estén disponibles; no inferir estado vegetal a partir de ausencia de datos.');
    else{
      const d=m.pair?delta(m.pair.before,m.pair.after,'ndvi'):null;
      if(d!=null&&d<-.05)items.push('Priorizar inspecciones donde disminuyó el NDVI. Verificar desarrollo del cultivo, manejo, riego y condiciones ambientales antes de atribuir una causa.');
      else if(d!=null&&d>.05)items.push('Contrastar el aumento de NDVI con la etapa fenológica y los registros de manejo; no equivale por sí solo a mayor rendimiento.');
      else if(d!=null)items.push('Mantener seguimiento de las próximas adquisiciones; el cambio medio es pequeño con el umbral exploratorio usado.');
      else items.push('Conseguir al menos dos fechas ópticas comparables para evaluar cambios.');
      if(m.areas?.low>0)items.push('Utilizar el mapa NDVI para orientar recorridos en zonas de valores relativamente inferiores; el cuartil no representa hectáreas enfermas.');
      items.push('Verificar en campo disponibilidad de agua, nutrición, cobertura, plagas y enfermedades según criterio agronómico. NDMI no mide directamente humedad volumétrica del suelo.');
    }
    if(m.currentRadar)items.push('Usar el radar como complemento estructural y de humedad relativa; comparar únicamente geometrías de adquisición compatibles.');
    return items;
  }
  function classifiedMap(image,labels,colors){
    if(!safeImage(image))return no('Mapa clasificado no disponible.');
    return '<div class="classified"><div class="mapimage"><img alt="Mapa clasificado" src="'+image+'"></div><div class="chartkey">'+labels.map((l,i)=>'<span style="color:rgb('+colors[i].join(',')+')">■ '+esc(l)+'</span>').join('')+'</div></div>';
  }
  function actions(m){
    const rows=[],c=m.current,x=m.comparison?.common,crop=String(m.field.crop||'').toLowerCase();
    if(!c||c.quality==='limited')rows.push(['Cobertura óptica '+(c?'limitada':'no utilizable'),'Contrastar con inspección y próxima adquisición.','Alta']);
    if(m.areas?.low>0)rows.push([F(m.areas.low,2)+' ha inferiores al P25','Recorrer zonas señaladas; verificar drenaje, riego, nutrición y cobertura.','Alta']);
    if(x)rows.push(['ΔNDVI común '+signed(x.delta),'Revisar mapa de variación y registros de manejo; el cambio no identifica una causa.','Media']);
    else if(m.pair)rows.push(['Promedios de escenas con cobertura diferente','No atribuir cambio de vigor; recuperar rasters comparables.','Media']);
    if(c&&metric(c,'ndmi')!=null)rows.push(['NDMI '+F(metric(c,'ndmi')),'Contrastar con humedad de suelo medida y registros de riego.','Media']);
    if(crop.includes('banan'))rows.push(['Cultivo: banano','En recorridos verificar drenaje, estado foliar y uniformidad del dosel; registrar hallazgos.','Seguimiento']);
    else if(crop.includes('maíz')||crop.includes('maiz'))rows.push(['Cultivo: maíz','Contrastar con etapa fenológica, densidad y uniformidad de emergencia.','Seguimiento']);
    if(m.currentRadar)rows.push(['Radar disponible','Complementar observaciones ópticas; usar geometrías compatibles.','Seguimiento']);
    return rows.length?rows:[['Datos insuficientes','Esperar nuevas adquisiciones y verificar en campo.','Alta']];
  }
  const kpi=(label,val,note='')=>'<div class="kpi"><small>'+esc(label)+'</small><strong>'+esc(val)+'</strong><span>'+esc(note)+'</span></div>';
  const ul=items=>'<ul>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
  const table=(heads,rows)=>'<table><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  const no=message=>'<div class="empty">'+esc(message)+'</div>';
  function mapCard(label,m){
    if(!m||!safeImage(m.image))return '<div class="mapcard"><h3>'+esc(label)+'</h3>'+no('Mapa no disponible.')+'</div>';
    const scale=m.range?.length===2&&m.range.every(x=>N(x)!=null)?F(m.range[0],2)+' a '+F(m.range[1],2):'Rango no informado por la API';
    const isRadar=['vv','vh','ratio'].includes(m.layer);
    const gradient=isRadar?'#22245a,#3171b5,#47c1db,#f1da68,#de5c2e':'#c62828,#ef6c00,#fdd835,#7cb342,#1b5e20';
    const legend=m.range?.length===2&&m.range.every(x=>N(x)!=null)?'<div class="legend" style="background:linear-gradient(to right,'+gradient+')"></div><div class="legendlabels"><span>'+esc(F(m.range[0],2))+'</span><span>'+esc(F(m.range[1],2))+'</span></div>':'';
    return '<div class="mapcard"><h3>'+esc(label)+'</h3><div class="mapimage"><img alt="'+esc(label)+'" src="'+m.image+'"></div>'+legend+'<small>'+esc(m.date)+' · contraste fijo · '+esc(scale)+'</small><small>Colores según la escala de la API; sin mapa base.</small></div>';
  }
  function trend(rows,series=[['ndvi','#367d36'],['ndmi','#2d75a8']]){
    if(!rows.some(r=>usable(r)&&series.some(([k])=>metric(r,k)!=null)))return no('No hay valores utilizables para esta serie.');
    const W=680,H=235,L=48,R=16,T=18,B=36,iw=W-L-R,ih=H-T-B;
    const xs=rows.map(r=>Date.parse(day(r.interval_to)+'T00:00:00Z')),lo=Math.min(...xs),hi=Math.max(...xs);
    const x=i=>L+(hi===lo?.5:(xs[i]-lo)/(hi-lo))*iw,y=v=>T+(1-Math.max(-1,Math.min(1,v)))*ih/2;
    let out='<svg class="chart" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg">';
    for(const v of [-1,-.5,0,.5,1])out+='<path d="M'+L+' '+y(v)+'H'+(W-R)+'" stroke="#dce5da"/><text x="'+(L-8)+'" y="'+(y(v)+4)+'" text-anchor="end" font-size="10" fill="#536253">'+v+'</text>';
    for(const [k,color] of series){
      let path='',prev=false,pts='';
      rows.forEach((r,i)=>{const v=usable(r)?metric(r,k):null;if(v==null||v< -1||v>1){prev=false;return;}path+=(prev?' L':' M')+x(i)+' '+y(v);prev=true;pts+='<circle cx="'+x(i)+'" cy="'+y(v)+'" r="3" fill="'+color+'"/>';});
      out+='<path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="2.4"/>'+pts;
    }
    const tick=[...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])];
    for(const i of tick)out+='<text x="'+x(i)+'" y="'+(H-10)+'" text-anchor="middle" font-size="10" fill="#536253">'+esc(day(rows[i].interval_to).slice(5))+'</text>';
    return out+'</svg><div class="chartkey">'+series.map(([k,color])=>'<span style="color:'+color+'">● '+k.toUpperCase()+'</span>').join('')+'<span>Huecos = sin dato utilizable</span></div>';
  }
  const CSS='@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#e7ece6;color:#20341d;font:13px Arial,sans-serif}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{position:sticky;top:0;z-index:5;background:#223d1b;color:white;padding:12px;text-align:center}.toolbar button{border:0;border-radius:5px;background:#5bc12f;padding:10px 18px;font:bold 14px Arial;color:#142b10;cursor:pointer}.page{width:210mm;min-height:297mm;margin:12px auto;background:white;position:relative;padding:13mm 15mm 10mm;display:flex;flex-direction:column;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}.head{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #5bc12f;padding-bottom:9px;margin-bottom:22px}.brand{font-weight:900;color:#284a18;font-size:18px;letter-spacing:-.5px}.brand img{height:32px;max-width:145px;object-fit:contain;vertical-align:middle;margin-right:8px}.tag{font-size:11px;color:#53704b}.eyebrow{font-size:11px;text-transform:uppercase;color:#51823f;font-weight:bold;letter-spacing:1.6px}h1{font-size:34px;line-height:1.03;margin:10px 0 16px;color:#284a18;letter-spacing:-1px}h2{font-size:25px;letter-spacing:-.6px;color:#284a18;margin:5px 0 12px}h3{font-size:15px;margin:0 0 7px;color:#284a18}p,li{line-height:1.55}li{margin:7px 0}small,.note{color:#5c6b59;font-size:11px;line-height:1.4}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}.kpi{border-left:4px solid #5bc12f;background:#f1f6ee;padding:12px 14px;min-height:78px;overflow-wrap:anywhere}.kpi small,.kpi span{display:block;font-size:11px;color:#52654c}.kpi strong{display:block;font-size:23px;margin:5px 0;color:#284a18}.band{background:#284a18;color:#fff;padding:18px;margin:16px 0}.band p{margin:4px 0}.empty{border:1px dashed #b4c6ae;padding:20px;text-align:center;color:#657661;background:#f8faf7}.mapcard{border:1px solid #dce6d8;padding:10px;break-inside:avoid}.mapimage{height:48mm;background:#f1f4ef;display:flex;align-items:center;justify-content:center}.mapimage img{max-width:100%;max-height:100%;object-fit:contain} .legend{height:9px;margin-top:7px;border-radius:3px}.legendlabels{display:flex;justify-content:space-between;font-size:10px;color:#52654c}.mapcard small{display:block;margin-top:5px}.chart{width:100%;display:block}.chartkey{display:flex;gap:15px;font-size:11px;color:#367d36;margin:5px 0 12px}table{border-collapse:collapse;width:100%;font-size:11px;margin:10px 0}th{background:#284a18;color:white;text-align:left;font-weight:600}th,td{padding:6px 7px;border-bottom:1px solid #dce6d8;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#f2f6f0}.footer{margin-top:auto;border-top:1px solid #dce6d8;padding-top:6px;font-size:10px;color:#60745a;display:flex;justify-content:space-between;gap:8px}.reportmeta{font-size:11px;color:#60745a;margin-top:6px}.pill{display:inline-block;padding:5px 9px;background:#e8f3e2;color:#284a18;font-weight:bold;font-size:11px}.disclaimer{border-left:3px solid #5bc12f;padding:9px 12px;background:#f5f8f3;font-size:11px}.area-bar{height:20px;display:flex;border-radius:3px;overflow:hidden;margin:12px 0}.area-bar span{display:block}.source{overflow-wrap:anywhere}.page{overflow-wrap:anywhere}@media print{html,body{background:white}.toolbar{display:none!important}.page{margin:0;box-shadow:none;width:210mm;min-height:297mm}}';
  const CSS_V2='.head{margin-bottom:16px}.brand img{height:39px;max-width:170px;margin:0}.tag{font-size:10px}.powered{display:flex;align-items:center;gap:10px;margin:18px 0 12px;color:#657661;font-size:11px}.powered img{width:52px;height:52px;object-fit:contain}.powered strong{color:#284a18}.band{background:#f0f6ec;color:#284a18;border-left:4px solid #5bc12f;padding:12px 16px;margin:12px 0}.kpi{min-height:66px;padding:9px 12px}.grid{gap:9px;margin:9px 0}.mapimage{height:42mm}.mapcard{padding:8px}.classified .mapimage{height:74mm}.classified .chartkey{flex-wrap:wrap}.footer{flex-shrink:0}.page{padding-top:12mm;padding-bottom:10mm}.radar-page .mapimage{height:29mm}.radar-page .kpi{min-height:54px}.radar-page .grid{margin:7px 0}.radar-page .mapcard small{margin-top:3px}.radar-page .disclaimer{margin:6px 0}@media print{.page{min-height:296mm}}';
  function render(m,{toolbar=false,branding={}}={}){
    const pages=[],on=k=>m.cfg.sections.includes(k),c=m.current,latestH=latest(m.history,'ndvi'),p=m.pair;
    function add(title,body){pages.push({title,body});}
    if(on('summary'))add('Informe técnico satelital','<span class="eyebrow">Agricultura de precisión / informe de lote</span><h1>Monitoreo y evolución<br>del cultivo</h1><span class="pill">'+esc(m.cfg.type==='technical'?'Informe técnico':'Informe ejecutivo')+'</span>'+(m.organizationName?'<p><b>Empresa:</b> '+esc(m.organizationName)+'</p>':'')+'<div class="grid">'+kpi('Finca',m.siteName)+kpi('Lote',m.field.name||'Sin nombre',m.field.code||'Sin código')+kpi('Cultivo',m.field.crop||'No informado')+kpi('Superficie registrada',F(m.field.area,2)+' ha')+'</div><div class="band"><p><b>Periodo solicitado:</b> '+esc(m.range.from)+' al '+esc(m.range.to)+'</p><p><b>Fecha de emisión:</b> '+esc(m.today)+'</p><p><b>Identificador:</b> '+esc(m.id)+'</p></div><h3>Resumen de hallazgos</h3>'+ul(observations(m))+'<p class="disclaimer">Observación remota histórica. Los índices son orientativos y no sustituyen una evaluación agronómica en campo.</p>');
    if(on('indices'))add('Indicadores agrícolas','<p>Última adquisición óptica utilizable recuperada: <b>'+esc(c?day(c.acquired_at):'Sin dato')+'</b>. Los cuatro indicadores corresponden a la misma escena.</p><div class="grid">'+OPTICAL.map(k=>kpi(k.toUpperCase(),F(metric(c,k)),c?qlabel(c.quality):'No disponible')).join('')+'</div>'+table(['Índice','Qué representa'],[['NDVI','Respuesta relativa de la vegetación y cobertura.'],['NDMI','Cambios relacionados con agua en la vegetación.'],['NDRE','Respuesta del borde rojo; útil en coberturas densas.'],['EVI','Respuesta vegetal con correcciones atmosféricas y de fondo.']])+'<p>Calidad: '+esc(c?qlabel(c.quality):'Sin dato')+' · Píxeles válidos: '+esc(pct(c?.valid_pixel_percent))+' · Nubosidad local: '+esc(pct(c?.local_cloud_percent))+'</p><p class="note">'+(latestH?'Última composición utilizable: NDVI '+esc(F(metric(latestH,'ndvi')))+'.':'No hay composiciones con NDVI utilizable en el periodo.')+' No se confunde con una adquisición individual.</p>');
    if(on('maps'))add('Mapas satelitales','<p>Capas ópticas de la adquisición seleccionada automáticamente. Los colores son relativos a la escala de cada índice; no indican enfermedad de forma directa.</p><div class="grid">'+OPTICAL.map(k=>mapCard(k.toUpperCase(),m.maps[k])).join('')+'</div><p class="note">Las imágenes muestran el raster disponible del lote, sin fondo cartográfico. No se presentan imágenes de demostración como datos reales.</p>');
    if(on('areas')){
      const a=m.areas;let body='<p>Superficies estimadas mediante píxeles válidos de NDVI y exclusiones registradas.</p><div class="grid">'+kpi('Área registrada',F(m.field.area,2)+' ha')+kpi('Área válida analizada',a?F(a.total,2)+' ha':'—')+kpi('Píxeles válidos excluidos',a?F(a.excluded,2)+' ha':'—')+kpi('Zonas registradas',m.zones?String(m.zones.length):'—')+'</div>';
      if(a?.count&&a.total>0)body+='<div class="area-bar">'+[['#bc704b',a.low],['#d2cc91',a.mid],['#4d9154',a.high]].map(([color,v])=>'<span style="background:'+color+';width:'+(100*v/a.total).toFixed(5)+'%"></span>').join('')+'</div>'+table(['Distribución relativa','Superficie','% de área válida'],[['Inferior al P25',F(a.low,2)+' ha',pct(100*a.low/a.total)],['P25 a P75',F(a.mid,2)+' ha',pct(100*a.mid/a.total)],['Superior al P75',F(a.high,2)+' ha',pct(100*a.high/a.total)]])+'<p>P25: '+F(a.q1)+' · P75: '+F(a.q3)+' · '+esc(a.count)+' píxeles válidos.</p>';
      else body+=no('No se dispone de un cálculo válido de cuartiles para esta escena.');
      body+='<h3>Exclusiones</h3>'+(m.zones===null?no('No se pudo verificar la lista de exclusiones.'):m.zones.length?ul(m.zones.slice(0,6).map(z=>z.name||'Zona sin nombre')):'<p>No hay exclusiones registradas.</p>')+(m.zones?.length>6?'<p>Se muestran las primeras 6 zonas; todas se consideraron en el cálculo.</p>':'')+'<p class="disclaimer">Los cuartiles son relativos a esta escena, no hectáreas de cultivo sano o enfermo. El área válida puede ser menor que la superficie física del lote.</p>';
      add('Superficies y zonas prioritarias',body);
      if(a?.count)add('Mapa de zonas prioritarias', '<p>Clasificación relativa NDVI de la adquisición '+esc(day(c?.acquired_at))+'. Norte arriba según extensión del raster; sin mapa base.</p>'+classifiedMap(a.image,['Inferior P25','P25–P75','Superior P75'],AREA_COLORS)+table(['Clase','Hectáreas'],[['Inferior P25',F(a.low,2)],['P25–P75',F(a.mid,2)],['Superior P75',F(a.high,2)]])+'<p class="disclaimer">Sin color: píxel no válido o excluido. No representa diagnóstico de enfermedad.</p>');
    }
    if(on('history')){
      const individual=(m.optical||[]).map(r=>({...r,interval_to:r.acquired_at}));
      const opticalRows=individual.map(r=>[day(r.acquired_at),qlabel(r.quality),pct(r.valid_pixel_percent),...OPTICAL.map(k=>usable(r)?F(metric(r,k)):'—')]);
      add('Evolución óptica Sentinel-2','<p>Adquisiciones individuales dentro del periodo: '+individual.length+' · calidad buena o limitada: '+individual.filter(usable).length+'. No se mezclan con composiciones.</p>'+trend(individual,[['ndvi','#367d36'],['ndmi','#2d75a8']])+trend(individual,[['ndre','#947238'],['evi','#6d4997']])+'<p class="note">Los huecos indican falta de valores utilizables. Las fechas no representan medición continua.</p>');
      for(let i=0;i<opticalRows.length;i+=18)add('Registro de adquisiciones ópticas',table(['Fecha','Calidad','Válidos','NDVI','NDMI','NDRE','EVI'],opticalRows.slice(i,i+18)));
      const h=m.history,rows=h.map(r=>[day(r.interval_from)+' / '+day(r.interval_to),qlabel(r.quality),pct(r.valid_pixel_percent),usable(r)?F(metric(r,'ndvi')):'—',usable(r)?F(metric(r,'ndmi')):'—']);
      add('Histórico de composiciones','<p>Periodos agregados totalmente comprendidos en el intervalo. Se recuperaron '+h.length+' registros; '+h.filter(usable).length+' de calidad buena o limitada.</p>'+trend(h)+table(['Periodo','Calidad','Válidos','NDVI','NDMI'],rows.slice(0,10))+(rows.length>10?'<p class="note">La tabla continúa en el anexo de registros.</p>':''));
      for(let i=10;i<rows.length;i+=25)add('Anexo de registros históricos',table(['Periodo','Calidad','Válidos','NDVI','NDMI'],rows.slice(i,i+25)));
    }
    if(on('compare')){
      const x=m.comparison;
      add('Comparación Antes y Después',x?'<p>Comparación entre la primera y última adquisición óptica utilizable con NDVI recuperadas dentro del intervalo.</p><div class="grid">'+kpi('Antes',F(metric(x.before,'ndvi')),day(x.before.acquired_at))+kpi('Después',F(metric(x.after,'ndvi')),day(x.after.acquired_at))+kpi('Variación NDVI',signed(delta(x.before,x.after,'ndvi'))+' puntos')+kpi('Variación NDMI',signed(delta(x.before,x.after,'ndmi'))+' puntos')+'</div>'+(x.sameScale?'<div class="grid">'+mapCard('Antes / NDVI',x.beforeMap)+mapCard('Después / NDVI',x.afterMap)+'</div>':no('No se pudo verificar la misma escala de colores y extensión espacial; no se muestran mapas comparativos.'))+'<p>Calidad: '+esc(qlabel(x.before.quality))+' / '+esc(qlabel(x.after.quality))+' · Cobertura válida: '+esc(pct(x.before.valid_pixel_percent))+' / '+esc(pct(x.after.valid_pixel_percent))+'</p><p class="disclaimer">Diferencia de promedios de escenas; no es un cambio calculado sobre una máscara común. No atribuir causas sin validación.</p>':no('Se necesitan dos adquisiciones ópticas de fechas diferentes y calidad buena o limitada.'));
    }
    if(on('compare')&&m.comparison?.common){
      const x=m.comparison.common;
      add('Mapa de variación NDVI (ΔNDVI)','<p>Comparación de píxeles válidos en ambas fechas, con igual dimensión, extensión y versión de procesamiento; se asume la misma rejilla geográfica. Se aplican exclusiones registradas.</p><div class="grid">'+kpi('Área común',F(x.total,2)+' ha')+kpi('ΔNDVI medio',signed(x.delta))+kpi('NDVI antes (común)',F(x.before))+kpi('NDVI después (común)',F(x.after))+'</div>'+classifiedMap(x.image,['Disminución < −0,05','Entre −0,05 y +0,05','Aumento > +0,05'],CHANGE_COLORS)+table(['Cambio exploratorio','Área'],[['Disminución',F(x.low,2)+' ha'],['Intervalo central',F(x.mid,2)+' ha'],['Aumento',F(x.high,2)+' ha']])+'<p class="disclaimer">Umbral exploratorio no específico del cultivo. La máscara común no elimina diferencias atmosféricas ni geométricas residuales.</p>');
    }
    if(on('radar')){
      const r=m.currentRadar;
      add('Radar Sentinel-1',r?'<p>Última adquisición radar utilizable: '+esc(day(r.acquired_at))+' · calidad '+esc(qlabel(r.quality))+'</p><div class="grid">'+kpi('VV',F(r.s1_vv_db_mean,2)+' dB')+kpi('VH',F(r.s1_vh_db_mean,2)+' dB')+kpi('Órbita relativa',r.relative_orbit??'—')+kpi('Dirección',({ascending:'Ascendente',descending:'Descendente'}[String(r.orbit_direction).toLowerCase()]||r.orbit_direction||'—'))+'</div><div class="grid">'+['vv','vh','ratio'].map(k=>mapCard(k==='ratio'?'VV/VH':k.toUpperCase(),m.radarMaps[k])).join('')+'</div><p class="disclaimer">El radar no mide NDVI. Su respuesta depende de la estructura, humedad, incidencia y geometría. Solo comparar órbita y dirección compatibles.</p>':no('No hay adquisiciones radar utilizables recuperadas para el periodo.'));
    }
    if(on('recommendations'))add('Conclusiones y recomendaciones','<h3>Hallazgos observados</h3>'+ul(observations(m))+'<h3>Acciones sugeridas</h3>'+table(['Hallazgo','Acción sugerida','Prioridad'],actions(m))+'<p class="disclaimer">Recomendaciones generadas por reglas descriptivas, sin diagnóstico automatizado, pronóstico de cosecha ni prescripción de fertilizantes. Umbral exploratorio de cambio NDVI: ±0,05 puntos; no es específico del cultivo.</p>');
    if(on('methodology'))add('Metodología y fuentes','<h3>Origen de los datos</h3><p>Copernicus Sentinel-2 L2A (óptico) y Sentinel-1 GRD (radar), procesados por Amelia Cloud. Los periodos históricos son composiciones y las escenas son adquisiciones registradas.</p>'+table(['Variable','Definición'],[['NDVI','(NIR − Red) / (NIR + Red)'],['NDMI','(NIR − SWIR) / (NIR + SWIR)'],['NDRE','(NIR − Red edge) / (NIR + Red edge)'],['EVI','2,5 × (NIR − Red) / (NIR + 6 × Red − 7,5 × Blue + 1)'],['VV / VH','Retrodispersión radar en polarizaciones VV y VH; dB cuando se indica.']])+'<h3>Calidad y alcance</h3><p>Se usan calidades buena y limitada para interpretación y gráficos. Nulos permanecen como datos ausentes. Resolución, máscaras y escala dependen del producto procesado; no se supone una resolución efectiva no informada. El cálculo de área usa centros de píxel, la máscara alfa del raster numérico y exclusiones poligonales. No es una mensura.</p><p>Se analizó únicamente lo devuelto por las consultas de historial y catálogo. El periodo solicitado puede no estar completamente cubierto.</p><p class="source">Contains modified Copernicus Sentinel data ('+esc(m.range.from.slice(0,4))+'–'+esc(m.range.to.slice(0,4))+'). Mapas e índices procesados por Amelia Cloud.</p>');
    if(m.warnings.length)add('Disponibilidad y limitaciones',ul(m.warnings)+'<p>Las secciones sin datos se dejan explícitamente incompletas; no se sustituyen por valores simulados.</p>');
    const amelia=safeImage(branding.ameliaLogoDataUrl),tayu=safeImage(branding.tayulabsLogoDataUrl)||safeImage(m.logo);
    const brand=amelia?'<img alt="Amelia Cloud" src="'+amelia+'">':'<span>AMELIA CLOUD</span>';
    const powered='<div class="powered"><span>Powered by</span>'+(tayu?'<img alt="TAYULABS" src="'+tayu+'">':'<strong>TAYULABS</strong>')+'</div>';
    return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src data:; script-src \'none\';"><title>'+esc(m.id)+' · Informe satelital</title><style>'+CSS+CSS_V2+'</style></head><body>'+(toolbar?'<div class="toolbar"><button id="ameliaPrint">Imprimir / Guardar como PDF</button><span> · A4 · desactiva encabezados y pies del navegador</span></div>':'')+pages.map((p,i)=>'<article class="page'+(p.title==='Radar Sentinel-1'?' radar-page':'')+'"><header class="head"><div class="brand">'+brand+'</div><span class="tag">TAYULABS · AMELIA SATELLITE</span></header><div class="reportmeta">'+esc(m.field.code||m.field.name||'Lote')+' · '+esc(m.range.from)+' — '+esc(m.range.to)+'</div>'+(i===0&&on('summary')?'':'<h2>'+esc(p.title)+'</h2>')+p.body+(i===0?powered:'')+'<footer class="footer"><span>'+esc(m.id)+' · '+esc(m.today)+'</span><span>tayulabs.com · '+(i+1)+' / '+pages.length+'</span></footer></article>').join('')+'</body></html>';
  }
  return {SECTIONS,DEFAULTS,EXECUTIVE,settings,rangeFor,historyRows,sceneList,areaStats,commonChange,collect,render,observations,recs,safeImage};
});