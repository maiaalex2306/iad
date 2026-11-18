'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict'),{chromium}=require('playwright');
/* O nome do cache vem do sw.js, nao de um literal. Fixado em 'iad-crm-v286.83',
   este teste passava so enquanto a versao fosse exatamente essa: no bump
   seguinte ele abria um cache que nao existe mais e falhava para sempre na
   linha do assert do cache — verificado simulando v286.84. E a mesma doenca
   dos tres testes que fixavam a versao (consertados na v286.49): vermelho
   permanente por estar desatualizado, nao por ter achado problema. */
const CACHE_ATIVO=(()=>{
 const fonte=fs.readFileSync(path.resolve(__dirname,'..','sw.js'),'utf8');
 const achado=/const CACHE\s*=\s*['"](iad-crm-v[\d.]+)['"]/.exec(fonte);
 assert(achado,'nao li o nome do cache em sw.js');
 return achado[1];
})();
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
  /* `navigator.serviceWorker.ready` resolve quando JA EXISTE worker ativo, mas
     `registration.active.state` lido nesse instante ainda pode dizer
     'activating': o handler de `activate` do sw.js roda com waitUntil e a
     transicao para 'activated' vem um tique depois. Amostrar o estado uma vez
     e, portanto, uma corrida — passou em d54d03b e d831337 e falhou em 4c548e3,
     mesmo script, so sob carga da CI. Esperar a transicao em vez de amostra-la
     torna o teste deterministico sem afrouxar o que ele exige. */
  const active=await page.evaluate(async()=>{
   const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
   await navigator.serviceWorker.ready;
   const worker=registration.active||registration.waiting||registration.installing;
   if(!worker)return null;
   if(worker.state!=='activated'){
    await new Promise(ok=>{
     const ver=()=>{if(worker.state==='activated'){worker.removeEventListener('statechange',ver);ok();}};
     worker.addEventListener('statechange',ver);ver();
    });
   }
   return worker.state;
  });
  assert.equal(active,'activated');
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:20000});
  const cache=await page.evaluate(async(nome)=>{
   const c=await caches.open(nome),r=await c.match('/src/ri/conversation-intent.mjs');
   return {found:!!r,valid:!!r&&(await r.text()).includes('INTENT_KINDS'),items:(await c.keys()).length};
  },CACHE_ATIVO);
  assert(cache.found&&cache.valid,'cache '+CACHE_ATIVO+' sem o modulo esperado');
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
