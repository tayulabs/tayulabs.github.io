'use strict';
// Integration source only. Deploy on the private API server, never run as a public static service.
const {randomUUID}=require('node:crypto');
const report=require('../cloud-client-satellite-report.js');
/**
 * Express-compatible route factory. The application MUST attach its existing
 * authenticated Satellite permission middleware and inject request-scoped data access.
 * resolveContext(req, fieldId) must verify organization + site + field access,
 * return null if unauthorized, and return {field,siteName,organizationName,getApi}
 * if authorized. getApi must enforce the same request scope on every read.
 */
function makeSatelliteReportHandler({resolveContext,puppeteer,PNG,logo=null,maxConcurrent=2,logger=console}={}){
  if(typeof resolveContext!=='function'||typeof puppeteer?.launch!=='function'||typeof PNG?.sync?.read!=='function')throw Error('Missing trusted report dependencies');
  if(!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>4)throw Error('Invalid concurrency limit');
  let active=0;
  const decode=r=>{
    if(typeof r.sample_data_url!=='string'||!r.sample_data_url.startsWith('data:image/png;base64,'))throw Error('Invalid numeric raster');
    const b=Buffer.from(r.sample_data_url.slice('data:image/png;base64,'.length),'base64');
    if(b.length>18000000||b.length<24||b.readUInt32BE(16)!==Number(r.width)||b.readUInt32BE(20)!==Number(r.height)||Number(r.width)*Number(r.height)>4000000)throw Error('Invalid PNG dimensions');
    const decoded=PNG.sync.read(b);
    if(decoded.width!==Number(r.width)||decoded.height!==Number(r.height))throw Error('Raster dimensions differ');
    return decoded.data;
  };
  return async function satelliteReportPdf(req,res){
    const body=req.body||{},fieldId=body.field_id;
    if((typeof fieldId!=='string'&&typeof fieldId!=='number')||!String(fieldId).trim()||String(fieldId).length>128)return res.status(400).json({error:'Identificador de lote inválido.'});
    let cfg;try{cfg=report.settings(body);}catch(e){return res.status(400).json({error:e.message});}
    if(active>=maxConcurrent)return res.status(429).json({error:'El servicio de informes está ocupado. Intenta nuevamente.'});
    active++;
    let browser, timer;
    try{
      const ctx=await resolveContext(req,fieldId);
      if(!ctx?.field||String(ctx.field.id)!==String(fieldId)||typeof ctx.getApi!=='function')return res.status(404).json({error:'Lote no disponible.'});
      const id='AS-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+randomUUID().slice(0,12).toUpperCase();
      const model=await report.collect({...ctx,options:cfg,decode,logo,reportId:id});
      if(req.aborted||res.destroyed)return;
      const html=report.render(model,{toolbar:false});
      // Keep Chromium sandbox active. Run as a dedicated non-root user.
      browser=await puppeteer.launch({headless:true,timeout:20000});
      const page=await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request',r=>{const url=r.url();const fn=/^(data:|about:blank$)/.test(url)?'continue':'abort';r[fn]().catch(()=>{});});
      await page.setContent(html,{waitUntil:'load',timeout:30000});
      // Ensure resources have loaded before generating; no external scripts/fonts.
      await page.evaluate(()=>Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>{}))));
      const pdf=Buffer.from(await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,timeout:30000}));
      if(pdf.length<5||pdf.subarray(0,5).toString()!=='%PDF-'||pdf.length>40000000)throw Error('PDF invalid or exceeds maximum size');
      if(req.aborted||res.destroyed)return;
      res.setHeader('Cache-Control','private, no-store');
      res.setHeader('X-Content-Type-Options','nosniff');
      return res.json({report_id:id,mime_type:'application/pdf',pdf_base64:pdf.toString('base64')});
    }catch(error){
      // No personal data or bearer tokens in the log or response.
      logger.error?.('Amelia Satellite report generation failed',error?.name||'Error');
      if(!res.headersSent&&!res.destroyed)return res.status(500).json({error:'No fue posible generar el PDF.'});
    }finally{if(timer)clearTimeout(timer);if(browser)try{await browser.close();}catch(_){}active--;}
  };
}
module.exports={makeSatelliteReportHandler};