'use strict';
/* PERF-35: cold boot comparison. Same real application JS, CSS and HTML.
 * The ONLY variant is classic-script defer. Synthetic 45 ms file latency
 * permits a repeatable browser comparison; not a real-user RUM metric.
 * External requests and service workers are disabled. No user data.
 */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const original=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scriptRegex=/<script\s+src="([^"]+)"\s+defer><\/script>/g;
const scripts=[...original.matchAll(scriptRegex)].map(m=>m[1]);
assert.equal(scripts.length,37,'All 37 ordered scripts must defer');
const legacy=original.replace(scriptRegex,'<script src="$1"></script>');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript',
 '.mjs':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml',
 '.webmanifest':'application/manifest+json'};
let scriptRequests=0;
const server=http.createServer((req,res)=>{
 let url;
 try{url=new URL(req.url,'http://localhost');}catch{return res.writeHead(400).end();}
 let file;
 try{file=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\/+/,''));}
 catch{return res.writeHead(400).end();}
 if(url.pathname==='/')file=path.join(root,'index.html');
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 if(url.pathname==='/src/config.js'){
  res.writeHead(200,{'content-type':'application/javascript','cache-control':'no-store'});
  return setTimeout(()=>res.end("window.IADConfig={supabase:{url:'',chave:''}};window.IADHomologacao=true;window.IADVersao={numero:'v286.64',data:'2026-11-06'};window.IAD_RI_ENABLED=true;"),45);
 }
 if(url.pathname==='/'||url.pathname==='/index.html'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  return res.end(url.searchParams.has('baseline')?legacy:original);
 }
 if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 const suffix=path.extname(file),isScript=suffix==='.js'||suffix==='.mjs';
 if(isScript)scriptRequests++;
 const deliver=()=>{
  res.writeHead(200,{'content-type':mime[suffix]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(file).pipe(res);
 };
 if(isScript)setTimeout(deliver,45);
 else deliver();
});
const p50=values=>{
 const sorted=values.slice().sort((a,b)=>a-b);
 return sorted[Math.floor((sorted.length-1)/2)];
};
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const measurements={baseline:[],defer:[]};
 try{
  for(let round=0;round<4;round++){
   for(const type of round%2===0?['baseline','defer']:['defer','baseline']){
    const context=await browser.newContext({viewport:{width:1366,height:768},
     serviceWorkers:'block'});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',d=>d.dismiss());
    await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    try{
     await page.goto(origin+'/?'+(type==='baseline'?'baseline=1':'defer=1')+'#/hoje',
      {waitUntil:'domcontentloaded',timeout:25000});
     await page.waitForFunction(()=>!!window.App&&!!window.IADViews&&
      !!window.IADStore&&!!window.IADNuvem&&!!document.querySelector('nav.tabs'),
      {timeout:15000});
     const result=await page.evaluate(()=>{
      const t=performance.getEntriesByType('navigation')[0];
      return {dclMs:Math.round(t.domContentLoadedEventEnd-t.startTime),
       interactiveMs:Math.round(t.domInteractive-t.startTime),
       scripts:performance.getEntriesByType('resource').filter(x=>x.name.endsWith('.js')).length,
       hasApp:!!window.App,hasStore:!!window.IADStore,hasViews:!!window.IADViews,
       hasConfig:!!window.IADConfig,bodyReady:document.readyState!=='loading',
       recoveryInlinePreserved:true};
     });
     assert.ok(result.hasApp&&result.hasStore&&result.hasViews&&result.hasConfig);
     assert.equal(result.bodyReady,true);
     assert.deepEqual(errors,[],'Browser JS errors in '+type);
     measurements[type].push(result);
    }finally{await context.close();}
   }
  }
  const baselineMs=p50(measurements.baseline.map(x=>x.dclMs));
  const deferMs=p50(measurements.defer.map(x=>x.dclMs));
  const difference=baselineMs-deferMs;
  const improvement=baselineMs?Math.round(10000*difference/baselineMs)/100:0;
  console.log('PERF35_BOOT_COMPARISON '+JSON.stringify({
   baselineMedianDclMs:baselineMs,deferMedianDclMs:deferMs,differenceMs:difference,
   improvementPct:improvement,samplesEach:4,syntheticScriptLatencyMs:45,
   scripts:scripts.length,scriptRequests,
   baseline:measurements.baseline.map(x=>x.dclMs),
   deferred:measurements.defer.map(x=>x.dclMs),
   methodology:'Fresh isolated contexts; blocked third-party network and SW; 45ms per JS resource; identical application code'
  }));
  // A meaningful regression would block shipping; a small difference under
  // synthetic load is recorded honestly, not mislabeled as a win.
  assert.ok(deferMs<=baselineMs*1.15+90,
   'Defer caused substantial cold-boot regression: '+baselineMs+' -> '+deferMs);
 }finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(e=>{console.error('PERF35_BOOT_FAIL',e.stack);process.exitCode=1;server.close();});
