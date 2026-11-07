'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),types={'.html':'text/html','.js':'text/javascript',
 '.mjs':'text/javascript','.css':'text/css','.png':'image/png',
 '.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 let p;try{p=path.resolve(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,''));}
 catch{res.writeHead(400);return res.end();}
 if(req.url==='/'||req.url.startsWith('/?'))p=path.join(root,'index.html');
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
  res.writeHead(404);return res.end('not found');
 }
 res.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream','cache-control':'no-store'});
 fs.createReadStream(p).pipe(res);
});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({serviceWorkers:'allow'});
  const page=await context.newPage();
  page.on('dialog',d=>d.dismiss());
  await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
  await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:30000});
  const active=await page.evaluate(async()=>{
   const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
   await navigator.serviceWorker.ready;return registration.active?.state;
  });
  assert.equal(active,'activated');
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:20000});
  const cache=await page.evaluate(async()=>{
   const c=await caches.open('iad-crm-v286.83'),r=await c.match('/src/ri/conversation-intent.mjs');
   return {found:!!r,valid:!!r&&(await r.text()).includes('INTENT_KINDS'),items:(await c.keys()).length};
  });
  assert(cache.found&&cache.valid);
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded',timeout:25000});
  const offline=await page.evaluate(async()=>{
   const response=await fetch('/src/ri/conversation-intent.mjs');
   const source=await response.text();let apiBlocked=false;
   try{await fetch('/rest/v1/oportunidades');}catch{apiBlocked=true;}
   return {status:response.status,source:source.includes('INTENT_KINDS'),
     controller:!!navigator.serviceWorker.controller,apiBlocked};
  });
  assert.equal(offline.status,200);
  assert(offline.source&&offline.controller&&offline.apiBlocked);
  console.log('RELEASE_OFFLINE_CHROMIUM_PASS '+JSON.stringify(cache));
  await context.setOffline(false);
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error('RELEASE_OFFLINE_CHROMIUM_FAIL',e.stack);process.exitCode=1;server.close();});
