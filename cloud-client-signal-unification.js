(()=>{
'use strict';
const VERSION='20260915-signals1';
if(window.__tayuSignalUnificationVersion===VERSION)return;
window.__tayuSignalUnificationVersion=VERSION;

function devices(){return Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[];}
function deviceByKey(key){return devices().find(item=>String(item?.device_key||'')===String(key||''))||null;}
function originLabel(deviceKey,path){
  const meta=deviceByKey(deviceKey)?.configuration?.signals?.[path]||{};
  const origin=String(meta.origin||meta.source||'').toLowerCase();
  const transport=String(meta.transport||'').toLowerCase();
  if(origin==='lora'||transport.includes('lora'))return'LoRa';
  if(String(path||'').toLowerCase().startsWith('modbus.'))return'RS485 / Modbus';
  if(String(path||'').toLowerCase().startsWith('gps.'))return'GPS';
  if(String(path||'').toLowerCase().startsWith('din'))return'Entrada digital';
  return'Dispositivo';
}

function patchEditor(editor){
  if(!editor)return;
  const panel=editor.querySelector('[data-op-panel="automatic"]');
  const select=editor.querySelector('[data-op-role="automatic.source"]');
  if(!panel||!select)return;

  const note=panel.querySelector('.tayu-op-note');
  if(note)note.textContent='Automatiza esta salida usando una señal configurada del dispositivo: LoRa, RS485 / Modbus, GPS u otra fuente disponible.';

  const labels=[...panel.querySelectorAll('label')];
  const sourceLabel=labels.find(label=>label.nextElementSibling===select || /sensor\s*\/\s*señal|sensor rs485/i.test(label.textContent||''));
  if(sourceLabel)sourceLabel.textContent='Señal del dispositivo';

  const first=select.options?.[0];
  if(first&&!first.value)first.textContent='Seleccionar señal…';

  const deviceKey=editor.dataset.deviceKey||'';
  [...select.options].forEach(option=>{
    if(!option.value)return;
    const meta=deviceByKey(deviceKey)?.configuration?.signals?.[option.value];
    if(!meta)return;
    const label=meta.name||meta.label||meta.display_name||option.value;
    const unit=meta.unit?` (${meta.unit})`:'';
    option.textContent=`${originLabel(deviceKey,option.value)} · ${label}${unit}`;
  });

  let origin=editor.querySelector('[data-tayu-signal-origin]');
  if(!origin){
    origin=document.createElement('div');
    origin.dataset.tayuSignalOrigin='1';
    origin.className='tayu-op-reading';
    origin.style.marginTop='6px';
    select.insertAdjacentElement('afterend',origin);
  }
  origin.textContent=select.value?`Origen: ${originLabel(deviceKey,select.value)}`:'Selecciona una señal para ver su origen.';
}

function patchRoot(root=document){
  if(root?.matches?.('[data-op-editor]'))patchEditor(root);
  root?.querySelectorAll?.('[data-op-editor]').forEach(patchEditor);
}

function install(){
  patchRoot();
  document.addEventListener('change',event=>{
    const editor=event.target?.closest?.('[data-op-editor]');
    if(editor&&(event.target.matches('[data-op-role="automatic.source"]')||event.target.matches('[data-op-role="mode"]')))patchEditor(editor);
  },true);
  ['fincas','camaroneras','bananeras','ganaderia'].forEach(id=>{
    const view=document.getElementById(id);if(!view)return;
    const observer=new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes)if(node?.nodeType===1)patchRoot(node);
    });
    observer.observe(view,{childList:true,subtree:true});
  });
  window.addEventListener('tayu:device-configuration-updated',()=>patchRoot());
  window.addEventListener('tayu:client-access-ready',()=>setTimeout(patchRoot,180));
}

window.__tayuSignalOrigin=originLabel;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();