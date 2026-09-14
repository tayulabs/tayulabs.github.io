(() => {
  'use strict';

  const TYPES=[
    ['tank','Tanque animado'],
    ['liquid','Liquid fill circle'],
    ['gauge','Gauge circular'],
    ['gauge_semi','Gauge semicircular'],
    ['kpi','KPI + mini tendencia']
  ];

  function installStyles(){
    if(document.getElementById('tayuAdvancedVisualStylesV2'))return;
    document.getElementById('tayuAdvancedVisualStyles')?.remove();
    const style=document.createElement('style');
    style.id='tayuAdvancedVisualStylesV2';
    style.textContent=`
      .tayu-av-host{min-height:260px;display:flex;align-items:center;justify-content:center;padding:14px;overflow:hidden}
      .tayu-av-shell{width:100%;height:100%;min-height:230px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--text)}
      .tayu-av-title{font-size:13px;font-weight:900;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .tayu-av-range{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;color:var(--muted);font-size:11px;font-weight:800}
      .tayu-av-value{font-size:29px;font-weight:950;line-height:1.05}.tayu-av-unit{font-size:13px;color:var(--muted);font-weight:850;margin-left:4px}
      .tayu-av-percent{font-size:13px;font-weight:900;color:var(--muted);margin-top:5px}

      .tayu-av-tank{position:relative;width:132px;height:188px;border:5px solid var(--border);border-radius:26px 26px 38px 38px;overflow:hidden;background:var(--panel2);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text) 5%,transparent)}
      .tayu-av-tank:before{content:'';position:absolute;left:15px;right:15px;top:-10px;height:16px;border:4px solid var(--border);border-radius:50%;background:var(--panel);z-index:4}
      .tayu-av-water,.tayu-av-circle-water{
        position:absolute;left:0;right:0;bottom:0;height:0;
        background:linear-gradient(180deg,#42c7f5 0%,#1ba7e0 32%,#0788c9 100%);
        border-top:2px solid rgba(255,255,255,.65);
        box-shadow:inset 0 10px 22px rgba(255,255,255,.14);
        transition:height 1.15s cubic-bezier(.22,.78,.24,1);
        will-change:height;
      }
      .tayu-av-water:before,.tayu-av-circle-water:before{
        content:'';position:absolute;inset:0;
        background:linear-gradient(115deg,transparent 12%,rgba(255,255,255,.13) 42%,transparent 72%);
        opacity:.75;pointer-events:none;
      }
      .tayu-av-water:after,.tayu-av-circle-water:after{
        content:'';position:absolute;left:0;right:0;top:0;height:8px;
        background:linear-gradient(180deg,rgba(255,255,255,.34),rgba(255,255,255,0));
        pointer-events:none;
      }
      .tayu-av-center{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;text-shadow:0 2px 8px rgba(255,255,255,.72)}
      body.dark .tayu-av-center{text-shadow:0 2px 8px rgba(0,0,0,.85)}

      .tayu-av-liquid-circle{position:relative;width:178px;height:178px;border-radius:50%;overflow:hidden;background:var(--panel2);border:5px solid var(--border);box-shadow:inset 0 0 0 5px color-mix(in srgb,var(--panel) 70%,transparent)}
      .tayu-av-liquid-circle .tayu-av-center{border-radius:50%}

      .tayu-av-gauge{position:relative;width:190px;height:190px;display:grid;place-items:center}
      .tayu-av-gauge svg{width:190px;height:190px;transform:rotate(-90deg);overflow:visible}
      .tayu-av-gauge-track,.tayu-av-gauge-value{fill:none;stroke-width:14;stroke-linecap:round}.tayu-av-gauge-track{stroke:var(--border)}
      .tayu-av-gauge-value{stroke:var(--brand);transition:stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)}
      .tayu-av-gauge .tayu-av-center{position:absolute;inset:0;text-shadow:none}

      .tayu-av-semi{position:relative;width:230px;height:145px;display:flex;align-items:flex-end;justify-content:center}
      .tayu-av-semi svg{position:absolute;left:0;top:0;width:230px;height:125px;overflow:visible}
      .tayu-av-semi-track,.tayu-av-semi-value{fill:none;stroke-width:17;stroke-linecap:round}.tayu-av-semi-track{stroke:var(--border)}
      .tayu-av-semi-value{stroke:var(--brand);transition:stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)}
      .tayu-av-semi-center{z-index:2;text-align:center;margin-bottom:3px}

      .tayu-av-kpi{width:min(440px,100%);display:grid;grid-template-columns:minmax(135px,.75fr) 1.25fr;gap:18px;align-items:center;padding:18px;border:1px solid var(--border);border-radius:22px;background:var(--panel2)}
      .tayu-av-kpi-main small{display:block;color:var(--muted);font-size:11px;font-weight:850;margin-bottom:7px}.tayu-av-kpi-main strong{font-size:34px;line-height:1;font-weight:950}
      .tayu-av-spark{width:100%;height:82px;overflow:visible}.tayu-av-spark polyline{fill:none;stroke:var(--brand);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.tayu-av-spark-line{stroke:var(--border);stroke-width:1}
      .tayu-av-empty{color:var(--muted);font-weight:800;font-size:13px;text-align:center;padding:30px}
      .tayu-av-help{grid-column:1/-1;margin-top:-2px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--panel2);font-size:11px;line-height:1.45;color:var(--muted)}
      .tayu-av-hidden-field{display:none!important}.tayu-av-v3-canvas{display:none!important}
      @media(max-width:600px){.tayu-av-kpi{grid-template-columns:1fr}.tayu-av-spark{height:70px}.tayu-av-host{min-height:235px}.tayu-av-shell{min-height:210px}}
      @media(prefers-reduced-motion:reduce){.tayu-av-water,.tayu-av-circle-water,.tayu-av-gauge-value,.tayu-av-semi-value{transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function ensureOptions(){
    const select=document.getElementById('mbChartType');if(!select)return;
    TYPES.forEach(([value,label])=>{
      if(select.querySelector(`option[value="${value}"]`))return;
      const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option);
    });
  }

  function syncFields(){
    ensureOptions();
    const select=document.getElementById('mbChartType');if(!select)return;
    const instant=['tank','liquid','gauge','gauge_semi'].includes(select.value);
    ['mbChartPeriod','mbChartPoints'].forEach(id=>document.getElementById(id)?.parentElement?.classList.toggle('tayu-av-hidden-field',instant));
    const min=document.getElementById('mbChartMin')?.parentElement?.querySelector('label');
    const max=document.getElementById('mbChartMax')?.parentElement?.querySelector('label');
    if(min)min.textContent=instant?'Mínimo del rango':'Mínimo eje Y';
    if(max)max.textContent=instant?'Máximo del rango':'Máximo eje Y';
    const builder=select.closest('.modbus-builder');
    if(builder&&!builder.querySelector('.tayu-av-help')){
      const note=document.createElement('div');note.className='tayu-av-help';
      note.innerHTML='<b>Visualizaciones IoT:</b> Tanque y Liquid fill suben o bajan suavemente con el valor real. Los gauges usan el rango Mín/Máx. KPI conserva el histórico para su mini tendencia.';
      builder.appendChild(note);
    }
  }

  function boot(){
    installStyles();syncFields();
    document.addEventListener('change',event=>{if(event.target?.id==='mbChartType')syncFields();});
    document.addEventListener('click',event=>{if(event.target?.closest?.('.nav button[data-view="modbus"]'))setTimeout(syncFields,80);},true);
    window.addEventListener('pageshow',()=>setTimeout(syncFields,80));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
