/* RI-01C — actual PWA service worker shell test (synthetic local origin).
 * No Supabase credentials are used, all non-local HTTP is blocked.
 * This test performs one online install, then verifies cached modules offline.
 */
'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  let url;
  try{url=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400);return res.end();}
  if(url.pathname.includes('\0')){res.writeHead(400);return res.end();}
  let filepath;
  try{filepath=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\/+/,''));}
  catch{res.writeHead(400);return res.end();}
  if(url.pathname==='/')filepath=path.join(root,'index.html');
  if(!filepath.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  if(!fs.existsSync(filepath)||!fs.statSync(filepath).isFile()){res.writeHead(404);return res.end('Not found');}
  res.writeHead(200,{'content-type':mime[path.extname(filepath)]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(filepath).pipe(res);
});
(async()=>{
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'allow'});
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.dismiss());
  await ctx.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  try{
    await page.goto(origin+'/#/hoje',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!navigator.serviceWorker?.controller,{timeout:25000});
    const online=await page.evaluate(async()=>{
      const cache=await caches.open('iad-crm-v286.46');
      return {version:window.IADVersao?.numero,flag:window.IAD_RI_ENABLED,
        assets:await Promise.all(['src/app.js','src/ri/account-view.mjs','src/ri/account-briefing.mjs'].map(async p=>{
          const match=await cache.match(new URL(p,document.baseURI).href);
          return {path:p,has:!!match,status:match?.status};
        }))};
    });
    assert.equal(online.version,'v286.46');
    assert.equal(online.flag,true);
    for(const x of online.assets)assert.equal(x.has,true,'static shell cache missing '+x.path);
    await ctx.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded',timeout:16000});
    const offline=await page.evaluate(async()=>{
      const urls=['src/ri/account-view.mjs','src/ri/account-briefing.mjs'];
      return {version:window.IADVersao?.numero,flag:window.IAD_RI_ENABLED,
        statuses:await Promise.all(urls.map(async p=>(await fetch(p)).status))};
    });
    assert.equal(offline.version,'v286.46');
    assert.equal(offline.flag,true);
    assert.deepEqual(offline.statuses,[200,200]);
    assert.equal(errors.length,0,'Page errors: '+JSON.stringify(errors.slice(0,5)));
    console.log('RI01C_OFFLINE_BROWSER_PASS '+JSON.stringify({version:offline.version,cached:online.assets.length,offlineModuleFetches:offline.statuses.length,externalCalls:false}));
  }finally{await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error('RI01C_OFFLINE_BROWSER_FAIL',e.stack);process.exitCode=1;server.close();});
