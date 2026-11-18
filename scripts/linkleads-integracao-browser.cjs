/* LinkLeads × IaD CRM — E2E em Chromium real com dados sintéticos, sem Supabase,
   sem LinkedIn e sem ponte real (a ponte é simulada por rota do Playwright).
   Cobre: menu "LinkLeads" abrindo o app por linkleads:// (uma vez por entrada),
   aviso quando o app não abre, botão LinkLeads no Pipeline importando só o que
   é do LinkLeads, com origem, fonte e papel confirmado, e dando baixa só nele. */
'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 let parsed,file;
 try{parsed=new URL(req.url,'http://127.0.0.1');file=path.resolve(root,decodeURIComponent(parsed.pathname).replace(/^\/+/,''));}
 catch{res.writeHead(400);return res.end('Bad request');}
 if(parsed.pathname==='/')file=path.join(root,'index.html');
 if(parsed.pathname==='/src/config.js'){
  res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});
  return res.end("window.IADConfig={supabase:{url:'',chave:''}};window.IADHomologacao=true;window.IAD_RI_ENABLED=true;window.IAD_MARKET_ENABLED=true;window.IAD_LINKEDIN_LEADS_ENABLED=true;window.IADVersao={numero:'linkleads-e2e',data:'2026-11-08'};");
 }
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found');}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
 fs.createReadStream(file).pipe(res);
});
const lh={id:'lh-1',recebidoEm:'2026-11-08T10:00:00Z',dados:{full_name:'Carlos Lima',profile_url:'https://www.linkedin.com/in/carlos-lima/',
 organization_1:'Hidro Sul',my_full_name:'Rosa SDR',message1_from:'Rosa SDR',message1_text:'Olá Carlos',
 message2_from:'Carlos Lima',message2_text:'Pode mandar o material'}};
const ll={id:'ll-1',recebidoEm:'2026-11-08T11:00:00Z',dados:{full_name:'Ana Silva',profile_url:'https://www.linkedin.com/in/ana-silva/',
 organization_1:'Águas do Vale',organization_title_1:'Diretora de Operações',member_distance:'DISTANCE_1',my_full_name:'Alexandre (LinkLeads)',
 message1_from:'Alexandre (LinkLeads)',message1_text:'Como vocês medem as perdas hoje?',message1_send_at_iso:'2026-11-07T10:00:00Z',
 message2_from:'Ana Silva',message2_text:'Tenho interesse, podemos falar semana que vem?',message2_send_at_iso:'2026-11-08T09:00:00Z',
 campaign:'Prospecção Saneamento',linkleads_origem:'linkleads',linkleads_event:'reply_received',linkleads_papel:'Decisor econômico',
 linkleads_papel_confirmado:1,linkleads_reply_label:'interessado',linkleads_reply_summary:'Quer conversar'}};
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const outside=[],baixas=[],leituras=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.dismiss());
  await page.route('**/*',route=>{
   const url=route.request().url();
   if(url.startsWith(origin+'/'))return route.continue();
   if(url.startsWith('https://ponte.example/')){
    const u=new URL(url);
    assert.equal(u.searchParams.get('token'),'leitura-teste');
    assert.equal(u.searchParams.get('e'),'tenant-a');
    if(route.request().method()==='POST'){baixas.push(...JSON.parse(route.request().postData()).marcar);return route.fulfill({json:{ok:true}});}
    leituras.push(url);
    return route.fulfill({json:{itens:[lh,ll].filter(i=>!baixas.includes(i.id))}});
   }
   outside.push(url);return route.abort();
  });
  await page.goto(origin+'/#/hoje',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.IADStore&&window.IADAuth&&window.App&&window.IADNuvem,null,{timeout:15000});
  await page.evaluate(()=>{
   const S=window.IADStore,A=window.IADAuth,N=window.IADNuvem;
   N.mandaNoAcesso=()=>false;N.conectado=()=>false;N.configurada=()=>false;
   N.chamarFuncao=async()=>({});            // IA indisponível: o app segue pela regra
   window.__protocolos=[];window.IADAbrirProtocolo=u=>window.__protocolos.push(u);
   const user={id:'ll-e2e-gestor',nome:'Gestor sintético',login:'ll_e2e',papel:'gestor',ativo:true,tenantId:'tenant-a'};
   const d=S.obter();
   d.tenants=[{id:'tenant-a',nome:'Indústria A',ponteUrl:'https://ponte.example/',ponteChave:'leitura-teste'}];
   d.usuarios=[user];d.contas=[];d.contatos=[];d.oportunidades=[];d.tarefas=[];d.sinais=[];d.notas=[];d.fontes=[];d.produtos=[];d.tiposTarefa=[];
   A.abrirSessao(user);S.semSincronizar(()=>S.salvar());S.semSincronizar(()=>S.adotarOrfaos());
  });

  // 1. menu renomeado e abertura automática do app
  await page.evaluate(()=>window.App.ir('#/linkedin-leads'));
  await page.locator('#iad-linkleads-launcher').waitFor({timeout:15000});
  assert.equal((await page.locator('nav.tabs a[href="#/linkedin-leads"]').textContent()).replace(/\s+/g,' ').includes('LinkLeads'),true,'menu chama LinkLeads');
  assert.equal(await page.locator('nav.tabs a[href="#/linkedin-leads"]').textContent().then(t=>/LinkedIN Leads/.test(t)),false);
  let protos=await page.evaluate(()=>window.__protocolos);
  assert.deepEqual(protos,['linkleads://abrir?origem=iadcrm&empresa=tenant-a&empresaNome=Ind%C3%BAstria%20A'],'abre o app com a empresa certa');
  await page.waitForFunction(()=>/não abriu/i.test(document.getElementById('iad-linkleads-launcher')?.textContent||''),null,{timeout:6000});
  assert.equal(await page.evaluate(()=>document.getElementById('iad-linkedin-assistido').open),true,'sem o app, o modo assistido se abre');
  if(process.env.SHOT_DIR)await page.screenshot({path:path.join(process.env.SHOT_DIR,'iad-menu-linkleads.png')});
  // redesenho da mesma tela não reabre o app; sair e voltar reabre; o botão abre sempre
  await page.evaluate(()=>window.App.ir('#/linkedin-leads'));
  await page.evaluate(()=>{window.IADStore.semSincronizar(()=>window.IADStore.salvar());});
  await page.waitForTimeout(300);
  assert.equal((await page.evaluate(()=>window.__protocolos)).length,1,'atualização de dados não reabre o app');
  await page.evaluate(()=>window.App.ir('#/pipeline'));
  await page.evaluate(()=>window.App.ir('#/linkedin-leads'));
  await page.locator('#iad-linkleads-launcher').waitFor();
  assert.equal((await page.evaluate(()=>window.__protocolos)).length,2,'nova entrada no menu abre de novo');
  await page.getByRole('button',{name:'Abrir o LinkLeads'}).click();
  assert.equal((await page.evaluate(()=>window.__protocolos)).length,3,'o botão abre sempre');

  // 2. Pipeline: dois botões, cada um com o que é seu
  await page.evaluate(()=>window.App.ir('#/pipeline'));
  await page.getByRole('button',{name:'Importar LH',exact:true}).waitFor({timeout:10000});
  await page.getByRole('button',{name:'LinkLeads',exact:true}).click();
  const dlg=page.locator('dialog[open]').filter({hasText:'Importar do LinkLeads'});
  await dlg.waitFor({timeout:20000});
  const texto=await dlg.textContent();
  assert.match(texto,/Ana Silva/);assert.doesNotMatch(texto,/Carlos Lima/,'o item do Linked Helper não entra no lote do LinkLeads');
  assert.match(texto,/confirmado no LinkLeads/);
  assert.equal(await dlg.locator('select[data-papel]').first().inputValue(),'Decisor econômico');
  if(process.env.SHOT_DIR)await page.screenshot({path:path.join(process.env.SHOT_DIR,'iad-importar-linkleads.png')});
  await dlg.getByRole('button',{name:'Importar os marcados'}).click();
  await page.waitForFunction(()=>(window.IADStore.obter().oportunidades||[]).length===1,null,{timeout:15000});
  const r=await page.evaluate(()=>{const d=window.IADStore.obter();return {op:d.oportunidades[0],ct:d.contatos[0],fontes:d.fontes};});
  assert.match(r.op.titulo,/Águas do Vale — origem LinkLeads$/);
  assert.equal(r.op.origem,'LinkLeads');
  assert.equal(r.op.campanha,'Prospecção Saneamento');
  assert.equal(r.op.etapa,'Conexão');
  assert.equal(r.ct.papel,'Decisor econômico','papel confirmado no LinkLeads chega como Papel na compra');
  assert.equal(r.fontes.find(f=>f.id===r.op.fonteId)?.nome,'LinkLeads');
  assert.match(r.op.notas,/ORIGEM LINKLEADS/);assert.match(r.op.notas,/1º grau/);
  assert.match(r.op.notas,/Papel no LinkLeads: Decisor econômico \(confirmado pelo vendedor\)/);
  await page.waitForFunction(n=>true,null);
  await page.waitForTimeout(500);
  assert.deepEqual(baixas,['ll-1'],'baixa só no item do LinkLeads; o do Linked Helper fica na ponte');

  if(process.env.SHOT_DIR){await page.keyboard.press('Escape').catch(()=>{});await page.screenshot({path:path.join(process.env.SHOT_DIR,'iad-pipeline-botoes.png'),clip:{x:0,y:0,width:1440,height:300}});}
  // 3. Importar LH continua igual e só com o que é do Linked Helper
  await page.getByRole('button',{name:'Importar LH',exact:true}).click();
  const dlh=page.locator('dialog[open]').filter({hasText:'Importar do Linked Helper'});
  await dlh.waitFor({timeout:20000});
  const tlh=await dlh.textContent();
  assert.match(tlh,/Carlos Lima/);assert.doesNotMatch(tlh,/Ana Silva/);
  await dlh.getByRole('button',{name:'Cancelar'}).click();

  assert.deepEqual(outside,[],'nenhuma requisição externa além da ponte simulada');
  assert.deepEqual(errors,[],'sem erros de página');
  console.log('LINKLEADS_INTEGRACAO_BROWSER_PASS',JSON.stringify({protocolos:3,importadoLinkLeads:true,papelConfirmado:true,baixaSeletiva:true,importarLHIntacto:true}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
