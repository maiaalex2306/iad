/* RI-M12: browser regression; synthetic tenant, no authenticated connection. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/styles.css"><link rel="stylesheet" href="/assets/paleta-acp.css"><div class="card" style="margin:20px;padding:16px"><div id="market"></div></div>');
  return;
 }
 const file=path.resolve(root,decodeURIComponent(u.pathname).replace(/^\/+/, ''));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':u.pathname.endsWith('.css')?'text/css':'text/javascript','cache-control':'no-store'});
 fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const width of [1440,900,390]){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port+'/');
   const data=await page.evaluate(async()=>{
    const original=window.fetch.bind(window);
    window.fetch=(url,opt)=>String(url).includes('/rest/v1/segmentos?')
      ?Promise.resolve(new Response(JSON.stringify([{nome:'Química e Petroquímica',ativo:true},{nome:'Alimentos',ativo:true}]),{status:200,headers:{'content-type':'application/json'}}))
      :original(url,opt);
    const mod=await import('/src/ri/market-view.mjs');
    mod.mountMarketDiscovery({root:document.getElementById('market'),
      snapshot:{segmentos:[{nome:'Química e Petroquímica',ativo:true,tenantId:'tenant-a'},{nome:'Segmento desatualizado',ativo:true,tenantId:'tenant-a'}]},
      scope:{tenantId:'tenant-a',userId:'user-a',token:'scope-token'},
      getScopeToken:()=> 'scope-token',nuvem:{sessao:()=>({access_token:'synthetic'}),config:()=>({url:'https://example.invalid',chave:'synthetic'})}});
    return true;
   });
   assert.equal(data,true);
   await page.waitForFunction(()=>document.querySelector('.iad-market-ui .iad-market-btn-search')?.disabled===false);
   const boxes=await page.locator('.iad-market-filter').count();
   assert.equal(boxes,5,'cinco campos de filtro');
   const labels=await page.locator('.iad-market-filter-label').evaluateAll(els=>els.map(e=>getComputedStyle(e).fontWeight));
   assert.ok(labels.every(w=>Number(w)>=700),'labels bold '+labels);
   const before=await page.locator('.iad-market-filter-grid').boundingBox();
   const popup=page.locator('.iad-market-picker').nth(2);
   await popup.locator('summary').click();
   const visible=await popup.locator('.iad-market-picker-panel').isVisible();
   assert.equal(visible,true,'dropdown visivel');
   const panelBox=await popup.locator('.iad-market-picker-panel').boundingBox();
   const after=await page.locator('.iad-market-filter-grid').boundingBox();
   assert.ok(Math.abs(before.height-after.height)<4,'popup nao deve deslocar filtros');
   assert.ok(panelBox.width>=240,'painel largo o suficiente');
   const choices=await popup.locator('.market-options .iad-market-option').allTextContents();
   assert.ok(choices.includes('Alimentos'),'catalogo autorizado veio do servidor');
   const searchBox=popup.locator('input[type=search]');
   await searchBox.fill('industria quimica');
   const semanticItems=await popup.locator('.market-options .iad-market-option').allTextContents();
   assert.ok(semanticItems.some(s=>s.includes('Química e Petroquímica')),'alias semantico deve sugerir categoria autorizada');
   await searchBox.fill('');
   assert.equal(choices.includes('Segmento desatualizado'),false,'catalogo local obsoleto eliminado');
   const layout=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,viewport:window.innerWidth}));
   assert.ok(layout.scrollWidth<=layout.viewport+2,'sem overflow horizontal '+JSON.stringify(layout));
   await page.keyboard.press('Escape');assert.equal(await popup.getAttribute('open'),null,'escape fecha filtro');
   assert.deepEqual(errors,[],'erros JS '+JSON.stringify(errors));
   console.log('RI_M12_LAYOUT_PASS '+JSON.stringify({width,fields:boxes,bold:labels,unchangedGridHeight:before.height,overlayWidth:panelBox.width,choices}));
   await context.close();
  }
 }finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(err=>{console.error('RI_M12_LAYOUT_FAIL',err.stack);process.exitCode=1;});
