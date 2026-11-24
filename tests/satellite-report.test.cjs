'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../cloud-client-satellite-report.js');
const today='2026-11-24',range=R.rangeFor(90,today);
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
const raster={width:2,height:2,bbox:[-80,-2,-79.999,-1.999],sample_value_range:[-1,1],sample_encoding:'RG16_UNORM_ALPHA_V1',image_data_url:image,sample_data_url:image,color_range:[-1,1]};
const pixels=new Uint8Array([10,20,0,255,30,20,0,255,50,20,0,0,80,20,0,255]);
const zones=[{name:'Casa',geometry_geojson:{coordinates:[[[-80,-2],[-79.9995,-2],[-79.9995,-1.999],[-80,-1.999],[-80,-2]]]}}];
const input=[{interval_from:'2026-11-01',interval_to:'2026-11-05',quality:'poor',ndvi_mean:.8},{interval_from:'2026-11-01',interval_to:'2026-11-05',quality:'good',ndvi_mean:0},{interval_from:'2026-08-20',interval_to:'2026-08-29',quality:'good',ndvi_mean:.8}];
const scenes=[{id:'a',acquired_at:'2026-10-01',collection:'sentinel-2-l2a',quality:'good',ndvi_mean:.65,ndmi_mean:.32},{id:'b',acquired_at:'2026-11-20',collection:'sentinel-2-l2a',quality:'limited',ndvi_mean:.5,ndmi_mean:null},{id:'c',acquired_at:'2026-11-22',collection:'sentinel-1-grd',quality:'good',s1_vv_db_mean:-12}];
const field={id:'f',name:'Maíz < & >',code:'SAT-001',area_hectares:12};
test('defaults, inclusive 90 days and section selection',()=>{assert.equal(R.settings().days,90);assert.equal(R.settings().sections.length,9);assert.equal(range.from,'2026-08-27');assert.throws(()=>R.settings({sections:[]}));});
test('duplicate periods: higher quality wins and numeric zero stays zero',()=>{const rows=R.historyRows(input,range);assert.equal(rows.length,1);assert.equal(rows[0].ndvi_mean,0);});
test('pixel masks and exclusions',()=>{const a=R.areaStats(raster,pixels,zones);assert.equal(a.count,2);assert.ok(a.excluded>0);assert.ok(Math.abs(a.low+a.mid+a.high-a.total)<1e-8);});
test('full report: reuse maps, match scale, escape text, no print toolbar on VPS',async()=>{
  const calls=[];
  const model=await R.collect({field,today,decode:async()=>pixels,getApi:async p=>{calls.push(p);return p.includes('observations')?input:p.includes('scenes?')?{scenes}:p.includes('exclusions')?{zones}:raster;}});
  const html=R.render(model,{toolbar:false});
  assert.equal(model.current.id,'b');assert.equal(model.comparison.sameScale,true);assert.equal(model.areas.count,2);
  assert.equal(calls.filter(p=>p.includes('/scenes/b/map?layer=ndvi')).length,1);
  assert.ok(html.includes('Maíz &lt; &amp; &gt;'));assert.ok(!html.includes('id="ameliaPrint"'));
});
test('incompatible or missing map scale is not shown as comparison',async()=>{
  const model=await R.collect({field,today,options:{sections:['compare']},getApi:async p=>p.includes('observations')?[]:p.includes('scenes?')?{scenes}:null});
  assert.equal(model.comparison.sameScale,false);
});
test('authorization errors are not hidden as empty data',async()=>{await assert.rejects(R.collect({field,today,getApi:async()=>{throw Error('API 403');}}),/403/);});
test('missing measurements are explicitly unavailable',async()=>{const model=await R.collect({field,today,getApi:async p=>p.includes('observations')?[]:p.includes('scenes?')?{scenes:[]}:p.includes('exclusions')?{zones:[]}:null});const html=R.render(model);assert.ok(html.includes('No hay adquisiciones radar'));assert.ok(model.warnings.length);});