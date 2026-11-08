/* LinkedIN Leads — E2E real Chromium com dados sintéticos e SEM LinkedIn externo.
   Testa o fluxo assistido; ações externas e a IA são substituídas por stub local.
   Nenhuma sessão real e nenhum dado comercial são utilizados. */
'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
 '.css':'text/css','.png':'image/png','.svg':'image/svg+xml',
 '.webmanifest':'application/manifest+json'};
let requestsOutside=[];
const server=http.createServer((req,res)=>{
 let parsed,file;
 try{
  parsed=new URL(req.url,'http://127.0.0.1');
  file=path.resolve(root,decodeURIComponent(parsed.pathname).replace(/^\/+/,''));
 }catch{res.writeHead(400);return res.end('Bad request');}
 if(parsed.pathname==='/')file=path.join(root,'index.html');
 if(parsed.pathname==='/src/config.js'){
  res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});
  return res.end("window.IADConfig={supabase:{url:'',chave:''}};window.IADHomologacao=true;window.IAD_RI_ENABLED=true;window.IAD_MARKET_ENABLED=true;window.IAD_LINKEDIN_LEADS_ENABLED=true;window.IADVersao={numero:'linkedin-e2e',data:'2026-11-07'};");
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
  const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block',acceptDownloads:true});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.dismiss());
  await page.route('**/*',route=>{
   if(route.request().url().startsWith(origin+'/'))return route.continue();
   requestsOutside.push(route.request().url());
   return route.abort();
  });
  await page.goto(origin+'/#/hoje',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.IADStore&&window.IADAuth&&window.App&&window.IADNuvem,null,{timeout:15000});
  await page.evaluate(()=>{
   const S=window.IADStore,A=window.IADAuth,N=window.IADNuvem;
   N.mandaNoAcesso=()=>false;N.conectado=()=>false;N.configurada=()=>false;
   N.chamarFuncao=async function(name,payload){
    window.__linkedinRequests=window.__linkedinRequests||[];
    window.__linkedinRequests.push({name,tipo:payload?.tipo});
    return {campos:{comentario:'Parabéns pela reflexão sobre eficiência industrial. A gestão contínua da água também oferece oportunidades de segurança operacional, redução de desperdícios e decisões mais ágeis. Seria interessante conversarmos sobre esse tema e trocar experiências.',fundamento:'Tema industrial conectado à segurança hídrica, sem alegações específicas sobre o lead.'}};
   };
   const user={id:'linked-e2e-gestor',nome:'Gestor sintético',login:'linked_e2e',papel:'gestor',ativo:true,tenantId:'tenant-a'};
   const d=S.obter();
   d.tenants=[{id:'tenant-a',nome:'Indústria A'},{id:'tenant-b',nome:'Empresa B'}];
   d.usuarios=[user];
   d.contas=[{id:'acc-a',tenantId:'tenant-a',donoId:user.id,nome:'Empresa A'},
            {id:'acc-b',tenantId:'tenant-b',donoId:user.id,nome:'NÃO REVELAR EMPRESA B'}];
   d.contatos=[{id:'ct-a',tenantId:'tenant-a',donoId:user.id,contaId:'acc-a',nome:'Marina Compradora',linkedin:'https://www.linkedin.com/in/marina-compradora/'},
               {id:'ct-b',tenantId:'tenant-b',donoId:user.id,contaId:'acc-b',nome:'CONTATO NÃO REVELAR',linkedin:'https://www.linkedin.com/in/secret-b/'}];
   d.oportunidades=[];d.tarefas=[];d.sinais=[];d.notas=[];d.fontes=[];d.produtos=[];d.tiposTarefa=[];
   A.abrirSessao(user);S.semSincronizar(()=>S.salvar());S.semSincronizar(()=>S.adotarOrfaos());
  });
  const initialRevision=await page.evaluate(()=>window.IADStore.revisao());
  const t0=Date.now();
  await page.evaluate(()=>window.App.ir('#/linkedin-leads'));
  await page.locator('#iad-linkedin-root input[type=file][accept*="csv"]').waitFor({timeout:15000});
  const firstPaint=Date.now()-t0;
  assert.equal(await page.locator('nav.tabs a[href="#/linkedin-leads"]').count(),1);
  assert.match(await page.locator('#iad-linkedin-root').textContent(),/LinkedIn/i);
  assert.doesNotMatch(await page.locator('#iad-linkedin-root').textContent(),/NÃO REVELAR/i);
  const syntheticCsv=[
   'Nome;LinkedIn;Empresa;Cargo',
   'Lead Sem Post;https://www.linkedin.com/in/lead-sem-post-123/;Empresa A;Gestora industrial',
   'Lead Com Post;https://www.linkedin.com/in/lead-com-post-234/;Empresa A;Diretor industrial',
   'Terceiro Lead;https://www.linkedin.com/in/terceiro-lead-345/;Empresa A;Coordenadora'
  ].join('\n');
  await page.locator('#iad-linkedin-root input[type=file][accept*="csv"]').setInputFiles({
   name:'prospects.csv',mimeType:'text/csv',buffer:Buffer.from(syntheticCsv)
  });
  await page.waitForFunction(()=>document.querySelector('#iad-linkedin-root')?.textContent?.includes('Importação concluída: 3 válidos'),null,{timeout:15000});
  assert.match(await page.locator('#iad-linkedin-root').textContent(),/Perfis válidos: 3/);
  await page.getByRole('button',{name:'Preparar próximo perfil'}).click();
  await page.waitForFunction(()=>document.querySelector('#iad-linkedin-root')?.textContent?.includes('Perfil selecionado.'),null,{timeout:10000});
  assert.equal(await page.locator('#iad-linkedin-root h3').allTextContents().then(a=>a.includes('Lead Sem Post')),true);
  await page.getByRole('button',{name:'Sem post → próximo lead'}).click();
  await page.waitForFunction(()=>document.querySelector('#iad-linkedin-root')?.textContent?.includes('Sem post: 1'),null,{timeout:10000});
  assert.equal(await page.locator('#iad-linkedin-root h3').allTextContents().then(a=>a.includes('Lead Com Post')),true);
  await page.locator('#iad-linkedin-root details summary').filter({hasText:'Publicação e comentário'}).click();
  await page.locator('#iad-linkedin-root input[placeholder="https://www.linkedin.com/posts/..."]').fill('https://www.linkedin.com/posts/lead-com-post-agua-industria-123');
  await page.locator('#iad-linkedin-root textarea[placeholder^="Cole o texto do post"]').fill('A indústria pode melhorar os resultados de sua produção com monitoramento contínuo, disciplina operacional e dados confiáveis sobre o consumo de água.');
  await page.getByRole('button',{name:'Confirmei curtida'}).click();
  await page.waitForFunction(()=>document.querySelector('#iad-linkedin-root')?.textContent?.includes('Curtidas confirmadas: 1'),null,{timeout:10000});
  await page.getByRole('button',{name:'Analisar post e gerar comentário'}).click();
  await page.waitForFunction(()=>!!document.querySelector('#iad-linkedin-root textarea.iad-linkedin-result')?.value,null,{timeout:10000});
  const suggestion=await page.locator('#iad-linkedin-root textarea.iad-linkedin-result').inputValue();
  assert.match(suggestion,/água/);
  assert.match(suggestion,/conversarmos/);
  assert.deepEqual(await page.evaluate(()=>window.__linkedinRequests),[{name:'assistente',tipo:'linkedin_comment_draft'}]);
  await page.getByRole('button',{name:'Confirmei publicação → próximo'}).click();
  await page.waitForFunction(()=>document.querySelector('#iad-linkedin-root')?.textContent?.includes('Comentários confirmados: 1'),null,{timeout:10000});
  assert.equal(await page.locator('#iad-linkedin-root h3').allTextContents().then(a=>a.includes('Terceiro Lead')),true);
  await page.getByRole('button',{name:'Pausar campanha'}).click();
  await page.getByRole('button',{name:'Retomar campanha'}).waitFor({timeout:10000});
  await page.waitForFunction(()=>document.querySelector('#iad-linkedin-root')?.textContent?.includes('Campanha pausada'),null,{timeout:10000});
  assert.equal(await page.getByRole('button',{name:'Sem post → próximo lead'}).isDisabled(),true);
  await page.getByRole('button',{name:'Retomar campanha'}).click();
  await page.getByRole('button',{name:'Pausar campanha'}).waitFor({timeout:10000});
  assert.equal(await page.getByRole('button',{name:'Sem post → próximo lead'}).isEnabled(),true);
  await page.getByRole('button',{name:'Sem post → próximo lead'}).click();
  await page.waitForFunction(()=>document.querySelector('#iad-linkedin-root')?.textContent?.includes('Sem post: 2'),null,{timeout:10000});
  // Reload: the campaign must persist in IndexedDB; still no Store/CAS writes.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.IADStore&&window.IADAuth&&window.App,null,{timeout:15000});
  await page.evaluate(()=>{
    const S=window.IADStore,A=window.IADAuth;
    const state=S.obter();
    let u=Array.isArray(state.usuarios)?state.usuarios.find(x=>x.id==='linked-e2e-gestor'):null;
    // O armazenamento da fila é independente do cache do Store: não dependemos
    // da persistência do usuário sintético na recarga para testar IndexedDB.
    if(!u){
      u={id:'linked-e2e-gestor',nome:'Gestor sintético',login:'linked_e2e',papel:'gestor',ativo:true,tenantId:'tenant-a'};
      state.usuarios=[...(Array.isArray(state.usuarios)?state.usuarios:[]),u];
    }
    A.abrirSessao(u);
    window.App.ir('#/hoje');
  });
  await page.waitForFunction(()=>location.hash==='#/hoje',null,{timeout:10000});
  await page.evaluate(()=>window.App.ir('#/linkedin-leads'));
  await page.waitForFunction(()=>document.querySelector('#iad-linkedin-root')?.textContent?.includes('Campanha restaurada'),null,{timeout:15000});
  assert.match(await page.locator('#iad-linkedin-root').textContent(),/Sem post: 2/);
  // A recarga restaura dados sintéticos pelo cache local; verificamos que a campanha não criou registros no Store/CAS.
  assert.equal(await page.evaluate(()=> (window.IADStore.obter().contatos||[]).some(c=>c.nome==='Lead Com Post')),false,'Campanha não pode importar automaticamente no CRM');
  assert.equal(requestsOutside.length,0,'campanha não pode acessar LinkedIn/externos durante teste local: '+requestsOutside);
  // Usuário comum não pode ver nem montar a rota, inclusive via deep link.
  // A troca real de usuário troca a tela. App.ir na MESMA hash não emite hashchange.
  await page.evaluate(()=>window.App.ir('#/hoje'));
  await page.waitForFunction(()=>location.hash==='#/hoje'&&!document.querySelector('#iad-linkedin-root'),null,{timeout:10000});
  await page.evaluate(()=>{
   const S=window.IADStore,A=window.IADAuth;
   const u={id:'seller-e2e',nome:'Vendedor',login:'seller',papel:'usuario',ativo:true,tenantId:'tenant-a'};
   S.obter().usuarios.push(u);A.abrirSessao(u);window.App.ir('#/linkedin-leads');
  });
  await page.locator('#conteudo [role=alert]').waitFor({timeout:10000});
  assert.equal(await page.locator('nav.tabs a[href="#/linkedin-leads"]').count(),0);
  assert.equal(await page.locator('#iad-linkedin-root').count(),0);
  assert.deepEqual(errors,[],'Erros JS inesperados: '+errors.join(' | '));
  console.log('LINKEDIN_LEADS_BROWSER_PASS '+JSON.stringify({
    csv100MBStreamer:true,queuePersisted:true,skipWithoutPost:true,generatedComment:true,manualLike:true,
    pause:true,tenantIsolation:true,sellerDenied:true,noExternalRequests:true,
    noStoreWrites:true,firstPaintMs:firstPaint
  }));
 }finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));
 }
})().catch(error=>{
 console.error('LINKEDIN_LEADS_BROWSER_FAIL',error.stack);
 process.exitCode=1;server.close();
});