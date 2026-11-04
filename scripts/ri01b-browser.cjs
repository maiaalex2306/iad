/* RI-01B: browser contract for lazy, read-only account intelligence.
 * Isolated HTTP server, synthetic tenants only, no production credentials.
 */
'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
let enabled=true;
const server=http.createServer((req,res)=>{
  let url;
  try{url=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400);return res.end();}
  let file;
  try{file=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\/+/,''));}catch{res.writeHead(400);return res.end();}
  if(url.pathname==='/src/config.js'){
    res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});
    return res.end("window.IADConfig={supabase:{url:'',chave:''}};window.IADHomologacao=true;window.IAD_RI_ENABLED="+String(enabled)+";window.IADVersao={numero:'v286.45',data:'2026-11-04'};");
  }
  if(url.pathname==='/')file=path.join(root,'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found');}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const errors=[];
 async function makePage(){
   const page=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block'});
   page.on('pageerror',e=>errors.push(e.message));
   page.on('dialog',d=>d.dismiss());
   await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
   await page.goto(origin+'/#/hoje',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.IADStore&&window.IADAuth&&window.App&&window.IADNuvem,{timeout:15000});
   return page;
 }
 try {
   const page=await makePage();
   await page.evaluate(()=>{
     const S=window.IADStore,A=window.IADAuth,N=window.IADNuvem;
     N.mandaNoAcesso=()=>false;N.conectado=()=>false;N.configurada=()=>false;
     if(window.IADWhatsapp)window.IADWhatsapp.disponivel=()=>false;
     const user={id:'ri01-user',nome:'Gestora de testes',login:'ri01',papel:'gestor',ativo:true,tenantId:'tenant-a'};
     const e=S.obter();e.tenants=[{id:'tenant-a',nome:'Empresa A'},{id:'tenant-b',nome:'Empresa B'}];e.usuarios=[user];
     e.contas=[
       {id:'a1',tenantId:'tenant-a',donoId:user.id,nome:'Indústria Aurora <img src=x onerror=alert(9)>',cidade:'SJC',uf:'SP',segmento:'Indústria'},
       {id:'b1',tenantId:'tenant-b',donoId:user.id,nome:'EMPRESA SECRETA B'}
     ];
     e.contatos=[
       {id:'c1',tenantId:'tenant-a',donoId:user.id,contaId:'a1',nome:'Ana Gestora',papel:'Decisora'},
       {id:'c2',tenantId:'tenant-b',donoId:user.id,contaId:'a1',nome:'CONTATO SECRETO'}
     ];
     e.oportunidades=[
       {id:'o1',tenantId:'tenant-a',donoId:user.id,contaId:'a1',titulo:'Reduzir custo hídrico',eventos:[]},
       {id:'o2',tenantId:'tenant-b',donoId:user.id,contaId:'a1',titulo:'NEGÓCIO SECRETO'}
     ];
     e.tarefas=[];e.sinais=[];e.notas=[];e.fontes=[];e.produtos=[];e.tiposTarefa=[];
     A.abrirSessao(user);S.semSincronizar(()=>S.salvar());
     /* O render legado de qualquer rota executa adotarOrfaos() e normaliza
        tipos de tarefa quando a carteira sintética está vazia. Estabilizamos
        esse estado ANTES da medição, para distinguir escrita legada do RI-01B. */
     S.semSincronizar(()=>S.adotarOrfaos());
   });
   const initial=await page.evaluate(()=>({rev:window.IADStore.revisao(),hash:location.hash}));
   const t0=Date.now();
   await page.evaluate(()=>window.App.ir('#/inteligencia'));
   await page.locator('#iad-ri-root button[data-account-id="a1"]').waitFor({timeout:12000});
   const linkCount=await page.locator('nav.tabs a[href="#/inteligencia"]').count();
   assert.equal(linkCount,1,'a rota protegida deve estar no menu somente com flag ativa');
   assert.equal(await page.locator('#iad-ri-root button[data-account-id="b1"]').count(),0,'não listar conta de outra empresa');
   await page.locator('#iad-ri-root button[data-account-id="a1"]').click();
   await page.locator('#iad-ri-details').waitFor();
   const view=await page.locator('#iad-ri-root').textContent();
   assert.match(view,/Ana Gestora/);
   assert.match(view,/Decisora/,'o papel do contato no schema CRM deve ser exibido');
   assert.match(view,/1 oportunidade/);
   assert.doesNotMatch(view,/EMPRESA SECRETA|CONTATO SECRETO|NEGÓCIO SECRETO/);
   assert.equal(await page.locator('#iad-ri-root img').count(),0,'texto comercial não pode executar HTML');
   const after=await page.evaluate(()=>({rev:window.IADStore.revisao(),hash:location.hash}));
   assert.equal(initial.rev,after.rev,'somente leitura não grava no Store');
   assert.equal(after.hash,'#/inteligencia');
   await page.evaluate(()=>{window.IADAuth.encerrarSessao();window.App.ir('#/hoje');});
   await page.waitForFunction(()=>!document.getElementById('iad-ri-root'));
   assert.equal(await page.locator('#iad-ri-details').count(),0,'a tela antiga não deve permanecer após logout');
   await page.close();

   enabled=false;
   const off=await makePage();
   assert.equal(await off.locator('nav.tabs a[href="#/inteligencia"]').count(),0,'com flag desligada não há novo item no menu');
   await off.close();

   assert.equal(errors.length,0,'erros de execução: '+JSON.stringify(errors));
   console.log('RI01B_BROWSER_PASS '+JSON.stringify({routeMs:Date.now()-t0,tenantIsolation:true,xssInert:true,noWrite:true,featureFlag:true,scopeSafe:true,environment:'Chromium synthetic local HTTP'}));
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error('RI01B_BROWSER_FAIL',e.stack);process.exitCode=1;server.close();});
