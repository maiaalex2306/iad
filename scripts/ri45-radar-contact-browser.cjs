/* RI-45: Chromium real, dados sintéticos e nenhuma chamada externa. */
'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'};
const fixture="<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body><main id=\"iad-ri-root\"></main>\n<script type=\"module\">\nimport {mountAccountIntelligence} from '/src/ri/account-view.mjs';\nconst scope={role:'gestor',userId:'user-1',tenantId:'tenant-a',token:'session-1'};\nconst snapshot={\n contas:[\n  {id:'a',tenantId:'tenant-a',donoId:'user-1',nome:'Empresa Aurora',segmento:'Saneamento'},\n  {id:'a',tenantId:'tenant-b',donoId:'user-2',nome:'Empresa Segredo B',segmento:'Quimico'}\n ],\n contatos:[\n  {id:'c1',tenantId:'tenant-a',contaId:'a',donoId:'user-1',nome:'Ana Santos',linkedin:'https://www.linkedin.com/in/ana-santos',telefone:'11 91234-5678'},\n  {id:'c2',tenantId:'tenant-a',contaId:'a',donoId:'user-1',nome:'Bruno Costa',linkedin:'https://br.linkedin.com/in/bruno-costa',telefone:'+55 (11) 99999-9999'},\n  {id:'secret',tenantId:'tenant-b',contaId:'a',donoId:'user-2',nome:'CONTATO SECRETO',telefone:'11900000000'}\n ],\n oportunidades:[\n  {id:'o1',tenantId:'tenant-a',contaId:'a',donoId:'user-1',titulo:'Projeto de monitoramento',stakeholders:['c1','c2'],eventos:[\n   {id:'decision',tipo:'decision',contatoId:'c1',data:'2026-10-12',titulo:'Claro, podemos marcar uma conversa.'},\n   {id:'sys',tipo:'sistema',data:'2026-10-12',titulo:'Conversa no LinkedIn com Rosa Oliveira (1 mensagem)',detalhe:'12/10/2026 · Bruno Costa: Claro, podemos marcar uma conversa.'}\n  ]},\n  {id:'o2',tenantId:'tenant-b',contaId:'a',donoId:'user-2',titulo:'NEGÓCIO SECRETO',eventos:[]}\n ],\n tarefas:[],sinais:[],produtos:[]\n};\nwindow.__test={snapshot,scope,before:JSON.stringify(snapshot)};\nmountAccountIntelligence({root:document.querySelector('#iad-ri-root'),snapshot,scope,getScopeToken:()=>scope.token});\n</script></body></html>";
const server=http.createServer((req,res)=>{
 let url;try{url=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400);return res.end();}
 if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});return res.end(fixture);}
 let p;try{p=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\/+/,''));}catch{res.writeHead(400);return res.end();}
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);return res.end();}
 res.writeHead(200,{'content-type':mime[path.extname(p)]||'application/octet-stream','cache-control':'no-store'});
 fs.createReadStream(p).pipe(res);
});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const width of [1280,375]){
   const page=await browser.newPage({viewport:{width,height:850},serviceWorkers:'block'});
   const errors=[],outside=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():(outside.push(r.request().url()),r.abort()));
   const started=performance.now();
   await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
   await page.locator('#iad-ri-root .iad-ri-radar-contact-name').waitFor({timeout:15000});
   await page.waitForFunction(()=>!!document.querySelector('#iad-ri-commercial-css')?.sheet,{timeout:8000});
   const firstCard=page.locator('#iad-ri-root .iad-ri-radar-card').first();
   assert.match(await firstCard.textContent(),/Empresa Aurora/);
   assert.equal(await firstCard.locator('.iad-ri-radar-contact-name').textContent(),'Bruno Costa',
    'autor da conversa prevalece sobre evento de Ana');
   assert.equal(await firstCard.locator('.iad-ri-radar-contact-label').allTextContents().then(x=>x.includes('Telefone')),true,
    'telefone precisa de label visivel');
   const link=firstCard.locator('.iad-ri-radar-contact a').filter({hasText:'LinkedIn'});
   assert.equal(await link.getAttribute('href'),'https://br.linkedin.com/in/bruno-costa');
   assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
   assert.equal(await firstCard.locator('a[href="tel:+5511999999999"]').count(),1);
   const text=await page.locator('#iad-ri-root').textContent();
   assert.doesNotMatch(text,/SEGREDO|SECRETO/,'não expor tenant alheio');
   assert.equal(await page.evaluate(()=>JSON.stringify(window.__test.snapshot)===window.__test.before),true,'somente leitura');
   assert.deepEqual(errors,[]);
   assert.equal(outside.length,0,'nenhum acesso externo');
   await page.evaluate(async()=>{
    const data=window.__test.snapshot,scope=window.__test.scope;
    const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    for(let i=0;i<18;i++){
     const aid='ri46-account-'+i;
     data.contas.push({id:aid,tenantId:'tenant-a',donoId:'user-1',nome:'Nova '+i,segmento:'Industrial'});
     data.oportunidades.push({
      id:'ri46-op-'+i,contaId:aid,tenantId:'tenant-a',donoId:'user-1',
      criadoEm:today,notas:i%2===0?'Cliente pediu proposta de monitoramento.':'Registro sem demanda confirmada.',
      eventos:[],desfecho:null
     });
    }
    window.__test.before=JSON.stringify(data);
    scope.token='session-2';
    const m=await import('/src/ri/account-view.mjs');
    m.mountAccountIntelligence({root:document.querySelector('#iad-ri-root'),snapshot:data,scope,getScopeToken:()=>scope.token});
   });
   await page.locator('#iad-ri-root .iad-ri-radar-count').waitFor();
   assert.match(await page.locator('#iad-ri-root .iad-ri-radar-count').textContent(),/12 de 19 registros/);
   assert.match(await page.locator('#iad-ri-root .iad-ri-radar-today').textContent(),/Entradas de hoje \(18\)/);
   assert.equal(await page.locator('#iad-ri-root .iad-ri-radar-card').count(),12);
   await page.locator('#iad-ri-root .iad-ri-radar-today').click();
   assert.match(await page.locator('#iad-ri-root .iad-ri-radar-count').textContent(),/12 de 18 registros/);
   await page.locator('#iad-ri-root .iad-ri-radar-more').click();
   assert.equal(await page.locator('#iad-ri-root .iad-ri-radar-card').count(),18);
   assert.equal(await page.locator('#iad-ri-root .iad-ri-radar-card').filter({hasText:'NOVO REGISTRO'}).count(),9);
   await page.locator('#iad-ri-root .iad-ri-radar-order select').selectOption('prioridade');
   assert.equal(await page.locator('#iad-ri-root .iad-ri-radar-card').count(),12);
   assert.equal(await page.evaluate(()=>JSON.stringify(window.__test.snapshot)===window.__test.before),true);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
   assert.equal(overflow,false,'não deve transbordar no viewport '+width);
   console.log('RI46_BROWSER_PASS '+JSON.stringify({width,firstCardMs:Math.round(performance.now()-started),profile:true,telephoneLabel:true,author:true,tenant:true,readOnly:true,externalRequests:0,pagination:true,filters:true}));
   await page.close();
  }
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error('RI45_BROWSER_FAIL',e.stack);process.exitCode=1;server.close();});
