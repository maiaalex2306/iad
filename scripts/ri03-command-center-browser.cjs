/* RI-03 — teste real Chromium local, sem credenciais externas e sem dados de clientes. */
'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
  '.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  let file;
  try {file=path.resolve(root,decodeURIComponent(url.pathname).replace(/^\/+/,''));}
  catch {res.writeHead(400);return res.end();}
  if(url.pathname==='/')file=path.join(root,'index.html');
  if(url.pathname==='/src/config.js'){
    res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});
    return res.end("window.IADConfig={supabase:{url:'',chave:''}};window.IADHomologacao=true;window.IAD_RI_ENABLED=true;window.IAD_MARKET_ENABLED=true;window.IADVersao={numero:'v286.77',data:'2026-11-06'};");
  }
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
    res.writeHead(404);return res.end('Not found');
  }
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',d=>d.dismiss());
    await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
    await page.goto(origin+'/#/hoje',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.IADStore&&window.IADAuth&&window.App&&window.IADNuvem,
      null,{timeout:15000});
    await page.evaluate(()=>{
      const S=window.IADStore,A=window.IADAuth,N=window.IADNuvem,P=window.IADPlaybook;
      N.mandaNoAcesso=()=>false;N.conectado=()=>false;N.configurada=()=>false;
      if(window.IADWhatsapp)window.IADWhatsapp.disponivel=()=>false;
      const user={id:'ri03-user',nome:'Gestor sintético',login:'ri03',
        papel:'gestor',ativo:true,tenantId:'tenant-a'};
      const d=S.obter(),day=(delta)=>{
        const x=new Date();x.setDate(x.getDate()+delta);return x.toISOString().slice(0,10);
      };
      d.tenants=[{id:'tenant-a',nome:'A'},{id:'tenant-b',nome:'B'}];
      d.usuarios=[user];
      d.contas=[
        {id:'a1',tenantId:'tenant-a',donoId:user.id,nome:'Aurora <img src=x onerror=alert(1)>',cidade:'SJC',segmento:'Indústria'},
        {id:'a2',tenantId:'tenant-a',donoId:user.id,nome:'Fábrica Azul',cidade:'Campinas'},
        {id:'a3',tenantId:'tenant-a',donoId:user.id,nome:'Conta sem oportunidade'},
        {id:'b1',tenantId:'tenant-b',donoId:user.id,nome:'SEGREDO-TENANT-B'}];
      d.contatos=[{id:'c1',tenantId:'tenant-a',donoId:user.id,contaId:'a1',nome:'Maria Compradora',papel:'Decisora'},
        {id:'c2',tenantId:'tenant-b',donoId:user.id,contaId:'a1',nome:'CONTATO SEGREDO-TENANT-B'}];
      d.oportunidades=[
        {id:'o1',tenantId:'tenant-a',donoId:user.id,contaId:'a1',titulo:'Modernização da ETE',
         etapa:'Proposta',etapaDesde:day(-44),fechamentoPrevisto:day(-3),valor:50000,desfecho:null,
         dims:Object.fromEntries(P.DIMENSOES.map(x=>[x.id,0])),stakeholders:[],eventos:[]},
        {id:'o2',tenantId:'tenant-a',donoId:user.id,contaId:'a2',titulo:'Recuperar contato',
         etapa:'Conexão',etapaDesde:day(-52),fechamentoPrevisto:day(40),valor:0,desfecho:null,
         dims:Object.fromEntries(P.DIMENSOES.map(x=>[x.id,0])),stakeholders:[],eventos:[]},
        {id:'o3',tenantId:'tenant-a',donoId:user.id,contaId:'a2',titulo:'Descobrir necessidade',
         etapa:'Conexão',etapaDesde:day(-2),fechamentoPrevisto:day(50),valor:0,desfecho:null,
         dims:Object.fromEntries(P.DIMENSOES.map(x=>[x.id,0])),stakeholders:[],eventos:[]},
        {id:'o4',tenantId:'tenant-b',donoId:user.id,contaId:'b1',titulo:'SEGREDO-TENANT-B',
         etapa:'Proposta',valor:999999,desfecho:null}
      ];
      d.tarefas=[{id:'t1',tenantId:'tenant-a',donoId:user.id,oportunidadeId:'o2',
        status:'aberta',vencimento:day(-5)}];
      d.sinais=[];d.notas=[];d.fontes=[];d.produtos=[];d.tiposTarefa=[];
      A.abrirSessao(user);S.semSincronizar(()=>S.salvar());
      S.semSincronizar(()=>S.adotarOrfaos());
    });
    const before=await page.evaluate(()=>window.IADStore.revisao());
    await page.evaluate(()=>window.App.ir('#/inteligencia'));
    await page.locator('#iad-ri-root .iad-ri-workspace').count().catch(()=>0);
    await page.locator('#iad-ri-root .iad-ri-radar-tab[data-radar="forgotten"]').waitFor({timeout:15000});
    await page.locator('#iad-ri-root button[data-account-id="a1"]').waitFor({timeout:15000});
    await page.waitForFunction(()=>document.getElementById('iad-ri-commercial-css')&&
      getComputedStyle(document.querySelector('.iad-ri-hero')).backgroundImage.includes('gradient'));
    assert.equal(await page.locator('#iad-ri-root .iad-ri-kpi').count(),0,
      'Números e KPIs devem permanecer no Painel');
    assert.equal(await page.locator('#iad-ri-root .iad-ri-radar-tab').count(),5);
    const text=await page.locator('#iad-ri-root').textContent();
    for(const expected of ['Radar de oportunidades comerciais','Upsell','Cross-sell',
      'Contas esquecidas','Notícias e movimentos','Segmentos em crescimento',
      'Por que apareceu','Próxima ação recomendada','Investigar uma conta'])
      assert.ok(text.includes(expected),expected);
    assert.doesNotMatch(text,/SEGREDO-TENANT-B/,'nenhum dado de outra empresa na tela');
    assert.equal(await page.locator('#iad-ri-root img').count(),0,'injetar HTML não executa imagem');
    assert.match(await page.locator('#iad-ri-root .iad-ri-radar-results').textContent(),/Empresa|Aurora|Fábrica Azul/);
    for(const tab of ['upsell','crossSell','news','growth']){
      await page.locator('#iad-ri-root .iad-ri-radar-tab[data-radar="'+tab+'"]').click();
      assert.ok((await page.locator('#iad-ri-root .iad-ri-radar-results').textContent()).length>40);
    }
    await page.locator('#iad-ri-root .iad-ri-radar-tab[data-radar="forgotten"]').click();
    await page.locator('#iad-ri-root button[data-account-id="a1"]').click();
    assert.match(await page.locator('#iad-ri-details').textContent(),/Maria Compradora/);
    assert.doesNotMatch(await page.locator('#iad-ri-details').textContent(),/CONTATO SEGREDO/);
    const locator=page.locator('#iad-ri-query');
    await locator.fill('nome inexistente');
    assert.equal(await page.locator('#iad-ri-root button[data-account-id="a1"]').count(),0);
    await locator.fill('Aurora');
    assert.equal(await page.locator('#iad-ri-root button[data-account-id="a1"]').count(),1);
    await locator.fill('SEGREDO-TENANT-B');
    assert.equal(await page.locator('#iad-ri-root .iad-ri-account-row').count(),0);
    await locator.fill('');
    await page.locator('#iad-ri-root .iad-ri-radar-results button:has-text("Analisar conta")').first().click();
    assert.match(await page.locator('#iad-ri-details').textContent(),/DOSSIÊ INTERNO DA CONTA/);
    const after=await page.evaluate(()=>window.IADStore.revisao());
    assert.equal(after,before,'análise, busca e ações não gravam no Store');

    const sizeChecks=[];
    for(const width of [1440,1024,768,390,320]){
      await page.setViewportSize({width,height:850});
      const d=await page.evaluate(()=>{
        const r=document.getElementById('iad-ri-root');
        return {client:r.clientWidth,scroll:r.scrollWidth,hero:!!r.querySelector('.iad-ri-hero')};
      });
      assert.ok(d.hero&&d.client>0,'visualização sumiu: '+width);
      assert.ok(d.scroll<=d.client+2,'overflow horizontal em '+width+'px: '+JSON.stringify(d));
      sizeChecks.push(width);
    }
    assert.deepEqual(errors,[],'erros JS não esperados: '+errors.join(' | '));
    console.log('RI03_COMMAND_CENTER_BROWSER_PASS '+JSON.stringify({
      route:'#/inteligencia',screens:sizeChecks,tenantIsolation:true,
      xssInert:true,noWrites:true,actionNavigation:true,cssLazy:true,
      scope:'Chromium sintético local sem credenciais'}));
    await page.close();
  }finally{await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error('RI03_COMMAND_CENTER_BROWSER_FAIL',e.stack);process.exitCode=1;server.close();});
