(()=>{
'use strict';
const VERSION='20260915-lorabridge1';
if(window.__tayuLoRaTelemetryBridgeVersion===VERSION)return;
window.__tayuLoRaTelemetryBridgeVersion=VERSION;

let lastSignature='';
let busy=false;

const devices=()=>Array.isArray(window.__tayuRealDevices)?window.__tayuRealDevices:[];
const rows=()=>Array.isArray(window.__tayuLastTelemetry)?window.__tayuLastTelemetry:[];
function parsePayload(row){const v=row?.payload;if(v&&typeof v==='object')return v;if(typeof v==='string')try{return JSON.parse(v)}catch(_){}return{}}
function communication(device){return device?.configuration?.communication||{}}
function latestGatewayRow(key){let out=null;for(const row of rows()){if(row?.__tayuLoraSynthetic)continue;if(String(row?.device_key||'')!==String(key||''))continue;if(!out||new Date(row?.time||0)>new Date(out?.time||0))out=row}return out}
function nodeObject(payload,nodeId){return payload?.lora?.nodes?.[nodeId]||payload?.nodes?.[nodeId]||payload?.gateway?.nodes?.[nodeId]||null}
function cloneNodePayload(raw,gatewayKey,nodeId){const gps=raw?.gps&&typeof raw.gps==='object'?{...raw.gps}:{};const link=raw?.link&&typeof raw.link==='object'?{...raw.link}:{};return{...raw,gps,link,lora:{node_id:nodeId,transport:'lora_p2p'},gateway:{device_key:gatewayKey},source:'lora_p2p'}}
function isRecent(time){const t=new Date(time||0).getTime();return Number.isFinite(t)&&Date.now()-t<45000}

function syncNodes(){
  if(busy)return false;
  busy=true;
  try{
    const telemetry=rows();
    const synthetic=[];
    const signature=[];
    const now=Date.now();

    for(const device of devices()){
      const cfg=communication(device);
      if(cfg.role!=='lora_node')continue;
      const gatewayKey=String(cfg.gateway_device_key||cfg.parent_gateway_device_key||'');
      const nodeId=String(cfg.node_id||device.device_key||'');
      if(!gatewayKey||!nodeId)continue;

      const gatewayRow=latestGatewayRow(gatewayKey);
      const gatewayPayload=parsePayload(gatewayRow);
      const raw=nodeObject(gatewayPayload,nodeId);
      if(!gatewayRow||!raw)continue;

      const gatewayTime=new Date(gatewayRow.time||0).getTime();
      const ageRaw=Number(raw.seen_age_ms);
      const ageMs=Number.isFinite(ageRaw)&&ageRaw>=0?ageRaw:0;
      const sourceTime=Number.isFinite(gatewayTime)?gatewayTime-ageMs:now-ageMs;
      const iso=new Date(Math.max(0,sourceTime)).toISOString();
      const payload=cloneNodePayload(raw,gatewayKey,nodeId);
      const online=raw.online!==false&&isRecent(iso);

      synthetic.push({device_key:device.device_key,time:iso,payload,status:online?'online':'offline',__tayuLoraSynthetic:true,__tayuLoraGateway:gatewayKey});
      device.status=online?'online':'offline';
      device.last_seen_at=iso;
      signature.push(`${device.device_key}|${iso}|${raw.packet_counter??''}|${online?1:0}`);
    }

    const keep=telemetry.filter(row=>!row?.__tayuLoraSynthetic);
    window.__tayuLastTelemetry=[...synthetic,...keep];

    const next=signature.sort().join('||');
    const changed=next!==lastSignature;
    lastSignature=next;
    return changed;
  }finally{busy=false}
}

function syncAndNotify(){
  const changed=syncNodes();
  if(changed){
    window.dispatchEvent(new CustomEvent('tayu:telemetry-updated',{detail:{source:'lora-bridge'}}));
    window.dispatchEvent(new CustomEvent('tayu:lora-node-telemetry'));
  }
}

function install(){
  window.addEventListener('tayu:telemetry-updated',event=>{if(event?.detail?.source==='lora-bridge')return;queueMicrotask(syncAndNotify)});
  window.addEventListener('tayu:client-access-ready',()=>setTimeout(syncAndNotify,250));
  window.addEventListener('tayu:device-configuration-updated',()=>setTimeout(syncAndNotify,80));
  window.addEventListener('pageshow',()=>setTimeout(syncAndNotify,180));
  setInterval(syncAndNotify,10000);
  setTimeout(syncAndNotify,500);
}

window.__tayuSyncLoRaNodeTelemetry=syncAndNotify;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
