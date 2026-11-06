/* PERF-36A: laboratório local sem credenciais, sem Supabase e sem dados de clientes. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script\s+defer\s+src="(src\/[^"]+\.js)"><\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,37,'PERF-35 shell deve ter 37 scripts defer');
assert.equal(scripts[0],'src/config.js');assert.equal(scripts.at(-1),'src/app.js');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const rel=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file=path.resolve(root,rel);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found');}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(file).pipe(res);
});
const pct=(values,p)=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?Math.round(v[Math.ceil(v.length*p)-1]*10)/10:null;};
(async()=>{
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true,args:['--no-sandbox']});
    const runs=Number(process.env.PERF36_RUNS||5),samples=[];
    assert.ok(Number.isInteger(runs)&&runs>=1&&runs<=30,'PERF36_RUNS 1..30');
    for(let i=0;i<runs;i++){
      const ctx=await browser.newContext({serviceWorkers:'block'}),page=await ctx.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('dialog',d=>d.dismiss());
      await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort('blockedbyclient'));
      await page.addInitScript(()=>{
        window.__perf36Tasks=[];
        try{new PerformanceObserver(list=>{for(const t of list.getEntries())window.__perf36Tasks.push(t.duration);}).observe({type:'longtask',buffered:true});}catch(_){}
      });
      const started=Date.now();
      await page.goto(origin+'/#/hoje',{waitUntil:'domcontentloaded',timeout:30000});
      const wallMs=Date.now()-started;
      await page.waitForTimeout(100);
      const m=await page.evaluate(()=>{
        const nav=performance.getEntriesByType('navigation')[0];
        const js=performance.getEntriesByType('resource').filter(r=>/\.m?js$/.test(new URL(r.name).pathname));
        const fcp=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint');
        const tasks=window.__perf36Tasks;
        return {appReady:typeof window.App==='object',storeReady:typeof window.IADStore==='object',dclMs:nav?nav.domContentLoadedEventEnd-nav.startTime:null,fcpMs:fcp?fcp.startTime:null,jsFiles:js.length,jsBytes:js.reduce((n,r)=>n+(r.decodedBodySize||0),0),longTasks:tasks.length,longTaskMs:tasks.reduce((n,v)=>n+v,0)};
      });
      assert.equal(m.appReady,true,'App não iniciou');
      assert.equal(m.storeReady,true,'Store não iniciou');
      assert.deepEqual(errors,[],'JavaScript errors: '+errors.slice(0,3).join(' | '));
      samples.push({wallMs,...m});await ctx.close();
    }
    const keys=['wallMs','dclMs','fcpMs','jsBytes','longTasks','longTaskMs'];
    const percentis=Object.fromEntries(keys.map(k=>[k,{p50:pct(samples.map(x=>x[k]),.5),p95:pct(samples.map(x=>x[k]),.95)}]));
    console.log('PERF36_SHELL_PROFILE_PASS '+JSON.stringify({scope:'local-unauthenticated',runs,scripts:scripts.length,percentis,samples}));
  }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error('PERF36_SHELL_PROFILE_FAIL',e.stack);process.exitCode=1;});
