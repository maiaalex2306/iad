/* PERF-35: comprova concorrência real de download dos scripts no Chromium.
 * Compara o shell versionado com a variante serial somente em memória.
 * Sem acesso ao Supabase nem dados de clientes; não fixa ganho de tempo
 * em ambiente CI sujeito a CPU variável.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const target=new Set(['src/config.js','src/performance.js','src/localidades.js','src/playbook.js']);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const tags=[...html.matchAll(/<script defer src="(src\/[^"]+\.js)"><\/script>/g)].map(x=>x[1]);
assert.equal(tags.length,37,'O shell deve declarar os mesmos 37 scripts em ordem');
assert.equal(tags[0],'src/config.js');
assert.equal(tags.at(-1),'src/app.js');
assert.ok(!/<script\s+src="src\//.test(html),'Scripts síncronos regressivos detectados');
const timings={parallel:{active:0,max:0,start:[],end:[]},serial:{active:0,max:0,start:[],end:[]}};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 const mode=u.pathname.startsWith('/serial/')?'serial':'parallel';
 if(u.pathname==='/serial/'||u.pathname==='/parallel/'){
  res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});
  return res.end(mode==='serial'?html.replace(/<script defer src=/g,'<script src='):html);
 }
 const assetPath=u.pathname.replace(/^\/(?:serial|parallel)\//,'/');
 const filename=path.resolve(root,assetPath.replace(/^\/+/,''));if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){
  res.writeHead(404);return res.end('Not found');
 }
 const file=fs.readFileSync(filename);
 const respond=()=>{res.writeHead(200,{'content-type':mime[path.extname(filename)]||'application/octet-stream','cache-control':'no-store'});res.end(file);};
 if(target.has(assetPath.slice(1))){
  const t=timings[mode];t.active++;t.max=Math.max(t.max,t.active);t.start.push(assetPath);
  setTimeout(()=>{t.active--;t.end.push(assetPath);respond();},140);
 }else respond();
});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const results={};
 try{
  for(const mode of ['serial','parallel']){
   const ctx=await browser.newContext({serviceWorkers:'block'});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('dialog',d=>d.dismiss());
   await page.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort('blockedbyclient'));
   const begin=Date.now();
   await page.goto(base+'/'+mode+'/#/hoje',{waitUntil:'domcontentloaded',timeout:30000});
   const totalMs=Date.now()-begin;
   const loaded=await page.evaluate(()=>({
    app:typeof window.App==='object',
    store:typeof window.IADStore==='object',
    version:window.IADVersao?.numero||null,
    route:location.hash
   }));
   assert.equal(loaded.app,true,mode+' perdeu inicialização App');
   assert.equal(loaded.store,true,mode+' perdeu Store');
   assert.ok(loaded.version?.startsWith('v286.'),mode+' perdeu versão');
   assert.equal(errors.length,0,mode+' Javascript errors '+errors.slice(0,4).join(' | '));
   results[mode]={totalMs,maxConcurrent:timings[mode].max,loaded};
   await ctx.close();
  }
  assert.equal(results.serial.maxConcurrent,1,'Controle serial deve baixar uma dependência por vez');
  assert.ok(results.parallel.maxConcurrent>=2,'Defer não paralelizou os downloads');
  assert.deepEqual(timings.parallel.start.slice(0,4).sort(),timings.serial.start.slice(0,4).sort());
  console.log('PERF35_PARALLEL_SHELL_PASS '+JSON.stringify(results));
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error('PERF35_PARALLEL_SHELL_FAIL',e.stack);process.exitCode=1;server.close();});
