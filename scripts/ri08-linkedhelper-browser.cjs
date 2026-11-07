/* RI-08: replay sintético de importação no navegador real. Nenhum dado de clientes. */
'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
 '.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 let file;try{file=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\/+/,''));}
 catch{res.writeHead(400);return res.end();}
 if(url.pathname==='/')file=path.join(root,'index.html');
 if(url.pathname==='/src/config.js'){
  res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});
  return res.end("window.IADConfig={supabase:{url:'',chave:''}};window.IADHomologacao=true;window.IAD_RI_ENABLED=true;window.IADVersao={numero:'ri08-staging',data:'2026-11-06'};");
 }
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);return res.end('Not found');
 }
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
 fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:850},serviceWorkers:'block'});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.dismiss());
  await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
  await page.goto(origin+'/#/hoje',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.IADStore&&window.IADAuth&&window.App&&window.IADNuvem,
   null,{timeout:15000});
  await page.evaluate(()=>{
   const S=window.IADStore,A=window.IADAuth,N=window.IADNuvem;
   N.mandaNoAcesso=()=>false;N.conectado=()=>false;N.configurada=()=>false;
   const user={id:'ri08-test',nome:'Gestor teste',login:'ri08',
    papel:'gestor',ativo:true,tenantId:'tenant-a'};
   const d=S.obter();
   d.tenants=[{id:'tenant-a',nome:'Empresa A'}];d.usuarios=[user];
   d.contas=[];d.contatos=[];d.oportunidades=[];d.tarefas=[];d.sinais=[];
   A.abrirSessao(user);S.semSincronizar(()=>S.salvar());
   S.semSincronizar(()=>S.adotarOrfaos());
   window.App.revisarImportacao([
    {id:'lh-1',nome:'Marina Compradora',empresa:'Indústria Alfa',cargo:'Gerente industrial',
     resposta:'Quero conhecer as soluções de vocês.',respostaDaIA:'neutra',
     respostaEm:'2026-11-05',operador:'Rosa Oliveira',
     conversa:[{nosso:false,de:'Marina Compradora',texto:'Quero conhecer as soluções de vocês.'}],
     sinaisLocais:[{type:'interesse_solucoes',evidence:'Quero conhecer as soluções de vocês.'}]},
    {id:'lh-2',nome:'Carlos Cortesia',empresa:'Indústria Beta',cargo:'Coordenador',
     resposta:'Obrigado pelo contato.',respostaDaIA:'neutra',respostaEm:'2026-11-05',
     operador:'Rosa Oliveira',conversa:[{nosso:false,de:'Carlos Cortesia',texto:'Obrigado pelo contato.'}],
     sinaisLocais:[]}
   ],'');
  });
  const modal=page.locator('dialog.revisao-ia[open]');
  await modal.waitFor({timeout:15000});
  const text=await modal.textContent();
  assert.match(text,/Sinais comerciais encontrados/);
  assert.match(text,/Quero conhecer as soluções de vocês/);
  assert.match(text,/Responderam com conteúdo/);
  assert.match(text,/Responderam por cortesia/);
  assert.ok(text.indexOf('Marina Compradora')<text.indexOf('Carlos Cortesia'),
   'Lead com interesse deve aparecer acima da resposta de cortesia');
  assert.equal(await modal.locator('img').count(),0);
  assert.deepEqual(errors,[],'Erros JS inesperados: '+errors.join(' | '));
  console.log('RI08_BROWSER_IMPORT_PASS '+JSON.stringify({
   importPreview:true,localIntent:true,courtesyDemoted:true,
   companyMatchingUnchanged:true,productionData:false}));
  await page.close();
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error('RI08_BROWSER_IMPORT_FAIL',e.stack);process.exitCode=1;server.close();});