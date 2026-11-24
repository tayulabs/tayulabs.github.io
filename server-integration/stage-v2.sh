#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd /opt/tayu-platform
PIN=f3a7cb0587c49ba347997b4b2539815a164be79a
BASE="https://raw.githubusercontent.com/tayulabs/tayulabs.github.io/$PIN"
mkdir -p "$HOME/backups" "$HOME/reportes-prueba"
STAGE=$(mktemp -d /opt/tayu-platform/apps/report-service/v2-stage.XXXXXX)
BACKUP="$HOME/backups/amelia-v2-pre-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$BACKUP" apps/api/modules/satellite/report-template.cjs apps/api/modules/satellite/report-route.cjs compose.api-reports.yaml compose.reports.yaml
echo "RESPALDO: $BACKUP"
mkdir "$STAGE/assets"
curl -fsSL --retry 2 --max-time 120 "$BASE/cloud-client-satellite-report.js" -o "$STAGE/report-template.cjs"
curl -fsSL --retry 2 --max-time 120 "$BASE/imagenes/AmeliaCloud-color.png" -o "$STAGE/assets/amelia.png"
curl -fsSL --retry 2 --max-time 120 "$BASE/assets/images/tayu20labs-206x206.png" -o "$STAGE/assets/tayulabs.png"
python3 - "$STAGE" <<'PY'
import hashlib, pathlib, sys
p=pathlib.Path(sys.argv[1])
for name, expected in {
    "report-template.cjs":"76ff97d55b3983b94b0cc18b974294ab3ffd1f5b",
    "assets/amelia.png":"18299243ba5baa8cfd10751c7f965b9ea3762975",
    "assets/tayulabs.png":"d08683f0663ff108c1ca61d91f0546947a57d776",
}.items():
    data=(p/name).read_bytes()
    actual=hashlib.sha1(("blob "+str(len(data))+"\0").encode()+data).hexdigest()
    if actual!=expected: raise SystemExit("Hash incorrecto: "+name)
    if name.endswith(".png") and not data.startswith(b"\x89PNG\r\n\x1a\n"): raise SystemExit("PNG invalido: "+name)
    print("VERIFICADO:",name)
PY
docker run --rm --pull never --network none --entrypoint cat tayu-report-service:1.1.3 /app/server.cjs > "$STAGE/server.cjs"
python3 - "$STAGE" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1])/"server.cjs"
s=p.read_text()
old="const html = report.render(model, {\n      toolbar: false\n    });"
assert s.count(old)==1,"No se encontro el render original"
s=s.replace(old,"""const fs = require('node:fs');
    const logo = name => 'data:image/png;base64,' +
      fs.readFileSync('/app/assets/' + name).toString('base64');
    const html = report.render(model, {
      toolbar: false,
      branding: {
        ameliaLogoDataUrl: logo('amelia.png'),
        tayulabsLogoDataUrl: logo('tayulabs.png')
      }
    });""")
assert "version: '1.1.3'" in s
s=s.replace("version: '1.1.3'","version: '1.2.0'")
p.write_text(s)
PY
cat > "$STAGE/Dockerfile" <<'DOCKER'
FROM tayu-report-service:1.1.3
WORKDIR /app
COPY --chmod=644 report-template.cjs server.cjs ./
COPY --chmod=755 assets ./assets
RUN node --check server.cjs && node --check report-template.cjs
CMD ["node","server.cjs"]
DOCKER
docker build -t tayu-report-service:1.2.0 "$STAGE"
CID=""
TEMP=""
cleanup() {
  if [ -n "$CID" ]; then docker rm -f "$CID" >/dev/null 2>&1 || true; fi
  if [ -n "$TEMP" ]; then rm -f "$TEMP"; fi
}
trap cleanup EXIT
CID=$(docker run -d --pull never --init --network none --memory=768m --cpus=1 --pids-limit=256 --cap-drop=ALL --security-opt=no-new-privileges --security-opt "seccomp=/opt/tayu-platform/apps/report-service/security/amelia-seccomp.json" --read-only --tmpfs /tmp:rw,size=256m -e "REPORT_SERVICE_KEY=$(openssl rand -hex 32)" tayu-report-service:1.2.0)
TEMP=$(mktemp "$HOME/reportes-prueba/.v2-XXXXXX")
if ! docker exec -i "$CID" node - > "$TEMP" <<'NODE'
const assert=require('node:assert/strict');
const {PNG}=require('pngjs');
const R=require('/app/report-template.cjs');
const base='data:image/png;base64,';
const today=new Date().toISOString().slice(0,10);
const date=n=>new Date(Date.now()-n*86400000).toISOString();
const scenes=[{id:'before',acquired_at:date(20),collection:'sentinel-2-l2a',quality:'good',ndvi_mean:.5,ndmi_mean:.2,ndre_mean:.3,evi_mean:.4,valid_pixel_percent:90},{id:'after',acquired_at:date(2),collection:'sentinel-2-l2a',quality:'limited',ndvi_mean:.6,ndmi_mean:.25,ndre_mean:.4,evi_mean:.5,valid_pixel_percent:70}];
function raster(after,layer) {
  const png=new PNG({width:8,height:8});
  for(let i=0;i<64;i++){
    png.data[i*4]=30+i*2+(after?12:0);
    png.data[i*4+1]=0;
    png.data[i*4+2]=0;
    png.data[i*4+3]=i===0||(!after&&i===1)?0:255;
  }
  const data=base+PNG.sync.write(png).toString('base64');
  return {width:8,height:8,bbox:[-80.1,-2.1,-80.09,-2.09],color_range:[-.2,.9],image_data_url:data,sample_data_url:data,sample_value_range:[-1,1],sample_encoding:'RG16_UNORM_ALPHA_V1',sample_processing_version:'fixture-v1'};
}
(async()=>{
  const url='http://127.0.0.1:3300';
  let health;
  for(let i=0;i<20;i++){try{health=await fetch(url+'/health');if(health.ok)break;}catch(e){}await new Promise(r=>setTimeout(r,500));}
  assert(health?.ok);
  assert.equal((await health.json()).version,'1.2.0');
  const model=await R.collect({field:{id:'demo',code:'SAT-V2-TEST',name:'Lote simulado',crop_type:'Banano',area_hectares:100},siteName:'Prueba sintetica',today,options:{days:90},decode:r=>PNG.sync.read(Buffer.from(r.sample_data_url.slice(base.length),'base64')).data,getApi:async path=>{
    if(path.includes('/observations'))return [];
    if(path.includes('/scenes?'))return {scenes};
    if(path.includes('/exclusions'))return {zones:[]};
    if(path.includes('/map?'))return raster(path.includes('/after/'),new URL(path,'http://localhost').searchParams.get('layer'));
    throw Error('Ruta inesperada');
  }});
  assert.equal(model.areas.count,63);
  assert.equal(model.comparison.common.count,62);
  assert(model.areas.image.startsWith(base));
  assert(model.comparison.common.image.startsWith(base));
  console.error('ZONAS Y MASCARA COMUN: OK');
  const res=await fetch(url+'/render',{method:'POST',headers:{'content-type':'application/json','x-report-key':process.env.REPORT_SERVICE_KEY},body:JSON.stringify(model),signal:AbortSignal.timeout(90000)});
  assert.equal(res.status,200);
  const pdf=Buffer.from(await res.arrayBuffer());
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert(pdf.subarray(-1024).toString().includes('%%EOF'));
  console.error('PDF V2 DE PRUEBA:',pdf.length,'bytes');
  process.stdout.write(pdf);
})().catch(e=>{console.error(e.message);process.exitCode=1});
NODE
then
  docker logs --tail 30 "$CID" >&2
  exit 1
fi
mv "$TEMP" "$HOME/reportes-prueba/amelia-v2-prueba.pdf"
TEMP=""
cp "$STAGE/report-template.cjs" apps/api/modules/satellite/report-template.cjs
if ! docker build -t tayu-api:satellite-reports-v2 apps/api; then
  tar -xzf "$BACKUP" apps/api/modules/satellite/report-template.cjs
  exit 1
fi
docker run --rm --pull never --network none --entrypoint sh tayu-api:satellite-reports-v2 -c 'set -e; node --check /app/modules/satellite/report-template.cjs; node --check /app/modules/satellite/report-route.cjs; node -e "require(\"pngjs\");require(\"./modules/satellite/report-route.cjs\")"'
echo "V2 CANDIDATA LISTA"
echo "PDF DE PRUEBA: $HOME/reportes-prueba/amelia-v2-prueba.pdf"
echo "PRODUCCION NO MODIFICADA (contenedores no recreados)"
