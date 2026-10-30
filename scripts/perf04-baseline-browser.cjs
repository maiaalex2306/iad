/* PERF-04 — baseline instrumentado Chromium v273, SEM Supabase de produção.
   Usuários, tenants e oportunidades exclusivamente sintéticos em memória. */
'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),cp=require('node:child_process');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 let safe=path.join(root,pathname==='/'?'index.html':pathname.slice(1));
 if(!safe.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 if(pathname==='/src/config.js'){
   res.writeHead(200,{'content-type':'application/javascript','cache-control':'no-store'});
   res.end("window.IADConfig={supabase:{url:'',chave:''}};window.IADHomologacao=true;window.IADVersao={numero:'v273-PERF04-BASELINE',data:'2026-10-30'};");
   return;
 }
 if(!fs.existsSync(safe)||!fs.statSync(safe).isFile()){res.writeHead(404);res.end('Not found');return;}
 res.writeHead(200,{'content-type':mime[path.extname(safe)]||'application/octet-stream','cache-control':'no-store'});
 fs.createReadStream(safe).pipe(res);
});
function p95(vals){return Math.round([...vals].sort((a,b)=>a-b)[Math.ceil(vals.length*.95)-1]*100)/100;}
function p50(vals){return Math.round([...vals].sort((a,b)=>a-b)[Math.ceil(vals.length*.5)-1]*100)/100;}
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1450,height:900}});
 const jsErrors=[];
 page.on('pageerror',err=>jsErrors.push(err.message));
 page.on('dialog',dlg=>dlg.dismiss());
 await page.route('**/*',route=>{
   if(route.request().url().startsWith(base+'/'))return route.continue();
   return route.abort('blockedbyclient');
 });
 await page.goto(base+'/#/pipeline',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!(window.IADViews&&window.IADStore&&window.IADAuth&&window.IADPlaybook),null,{timeout:15000});
 const rows=[];
 /* O Chrome valida UI e isolamento com 243 cartões. A paridade 243/1k/5k
    roda no bench Node isolado: o caso de 5k é dominado por trabalho de CPU
    em page.evaluate e pode bloquear indefinidamente o worker Chromium. */
 for(const n of [389]){
  const data=await page.evaluate((n)=>{
    const S=window.IADStore,P=window.IADPlaybook,A=window.IADAuth,N=window.IADNuvem;
    N.mandaNoAcesso=()=>false; N.conectado=()=>false;N.configurada=()=>false;
    const W=window.IADWhatsapp;if(W)W.disponivel=()=>false;
    const e=S.obter();
    const uA={id:'perf-a',tenantId:'tenant-a',nome:'Homolog Test A',login:'perf-a',papel:'gestor',ativo:true,emailConfirmado:true};
    const uB={id:'perf-b',tenantId:'tenant-b',nome:'Homolog Test B',login:'perf-b',papel:'usuario',ativo:true,emailConfirmado:true};
    e.usuarios=[uA,uB];e.tenants=[{id:'tenant-a',nome:'HOMOLOG A'},{id:'tenant-b',nome:'HOMOLOG B'}];
    const dia=(d)=>{const x=new Date();x.setDate(x.getDate()+d);return x.toISOString().slice(0,10);};
    e.contas=Array.from({length:Math.max(40,Math.ceil(n/5))},(_,i)=>({
      id:'ca'+i,tenantId:'tenant-a',donoId:'perf-a',nome:'A_EMPRESA_'+i,uf:'SP',cidade:'Campinas'}));
    e.contas.push({id:'cb0',tenantId:'tenant-b',donoId:'perf-b',nome:'B_PRIVADO',uf:'PR',cidade:'Curitiba'});
    e.contatos=Array.from({length:Math.ceil(n/4)},(_,i)=>({id:'p'+i,tenantId:'tenant-a',donoId:'perf-a',contaId:e.contas[i%e.contas.length].id,perfil:'mobilizador',papel:'Champion / Mobilizer',sentimento:'favoravel'}));
    e.oportunidades=Array.from({length:n},(_,i)=>({id:'op'+i,contaId:'ca'+(i%Math.max(40,Math.ceil(n/5))),tenantId:'tenant-a',donoId:'perf-a',
      titulo:'A_NEGOCIO_'+i,valor:10000+i,etapa:i%3?'Diagnóstico':'Proposta',criadoEm:dia(-25),etapaDesde:dia(-12),
      fechamentoPrevisto:dia(35),dims:Object.fromEntries(P.DIMENSOES.map(d=>[d.id,0])),stakeholders:[],eventos:[],desfecho:null}));
    e.oportunidades.push({id:'privado',tenantId:'tenant-b',donoId:'perf-b',contaId:'cb0',titulo:'B_PRIVADO',
      valor:999999,etapa:'Proposta',criadoEm:dia(-25),etapaDesde:dia(-12),
      fechamentoPrevisto:dia(35),dims:Object.fromEntries(P.DIMENSOES.map(d=>[d.id,0])),stakeholders:[],eventos:[]});
    e.tarefas=Array.from({length:n*2},(_,i)=>({id:'t'+i,tenantId:'tenant-a',donoId:'perf-a',oportunidadeId:'op'+(i%n),status:i%3?'aberta':'concluida',vencimento:dia(i%2?-2:10),titulo:'T'+i}));
    e.sinais=[];e.notas=[];e.produtos=[];e.tiposTarefa=[];e.fontes=[];
    A.abrirSessao(uA);
    S.semSincronizar(()=>S.salvar());
    if(window.IADPipelinePerf)window.IADPipelinePerf.limpar();
    const tempo=[];
    for(let i=0;i<6;i++){
      const start=performance.now();
      document.getElementById('conteudo').innerHTML=window.IADViews.pipeline();
      tempo.push(performance.now()-start);
    }
    const items=document.querySelectorAll('#conteudo .lista > button.item').length;
    const conteudo=document.getElementById('conteudo').textContent;
    return {n,ms:tempo.slice(1),firstMs:tempo[0],cards:items,total:window.IADPipelinePerf.estatisticas(),
      visibleA:conteudo.includes('A_NEGOCIO_'),hiddenB:!conteudo.includes('B_PRIVADO'),length:conteudo.length};
  },n);
  if(!data.visibleA || !data.hiddenB || data.cards!==Math.min(48,n))
    throw new Error('Falha na tela/isolamento, N='+n+' '+JSON.stringify(data));
  rows.push({opportunities:n,firstDOMMs:+data.firstMs.toFixed(2),p50DOMMs:p50(data.ms),p95DOMMs:p95(data.ms),
    renderedCards:data.cards,cache:data.total});
  console.log('PERF03A_BROWSER '+JSON.stringify(rows.at(-1)));
 }
 /* O fixture injeta o Pipeline na div sem trocar a rota real do App.
    Chamar App.pipelineMais() invoca render() da rota/login, limpando a div,
    portanto o teste verificava zero mesmo com a paginação funcional.
    Validar o mesmo handler de paginação da view e remontar o fixture. */
 await page.evaluate(()=>{
   window.IADViews.maisPipeline();
   document.getElementById('conteudo').innerHTML=window.IADViews.pipeline();
 });
 const after=await page.locator('#conteudo .lista > button.item').count();
 if(after!==96)throw new Error('Mostrar mais não trouxe 96 cartões: '+after);

 // PERF-04: medições por função e por fase (geração HTML versus custo DOM).
 // 389 oportunidades sintéticas, mesmos escopos e payloads em todas as telas.
 const measurements=await page.evaluate(()=>{
   const V=window.IADViews;
   const root=document.getElementById('conteudo');
   const screens=[
     ['Hoje',()=>V.hoje()],
     ['Painel',()=>V.painel()],
     ['Pipeline',()=>V.pipeline()],
     ['Tarefas',()=>V.tarefas()],
     ['Revisão',()=>V.revisao()],
     ['Cadastros',()=>V.cadastros()],
     ['Contas',()=>V.contas()],
     ['Nutrição',()=>V.nutricao()],
     ['Cockpit',()=>V.cockpit('op0')],
     ['Configuração',()=>V.dados()],
     ['Método',()=>V.playbook()],
     ['Notas',()=>V.notasRapidas()]
   ];
   const percentile=(a,p)=>{
     const s=[...a].sort((x,y)=>x-y);
     return +(s[Math.max(0,Math.ceil(s.length*p)-1)]||0).toFixed(2);
   };
   const results=[],errors=[];
   for(const [name,view] of screens){
     const calc=[],dom=[];
     try {
       for(let i=0;i<6;i++){
         const start=performance.now();
         const html=view();
         const generated=performance.now();
         if(typeof html!=='string')throw Error('View não retornou HTML');
         root.innerHTML=html;
         const painted=performance.now();
         calc.push(generated-start);dom.push(painted-generated);
       }
       results.push({
         screen:name,firstHTMLMs:+calc[0].toFixed(2),
         htmlP50Ms:percentile(calc.slice(1),.50),htmlP95Ms:percentile(calc.slice(1),.95),
         domP50Ms:percentile(dom.slice(1),.50),domP95Ms:percentile(dom.slice(1),.95),
         combinedP95Ms:percentile(calc.slice(1).map((v,i)=>v+dom.slice(1)[i]),.95)
       });
     }catch(e){errors.push({screen:name,error:String(e && e.message||e)});}
   }
   return {screens:results,errors,heapBytes:performance.memory?.usedJSHeapSize||null,
     sizes:{opportunities:window.IADStore.dados().oportunidades.length,
       tasks:window.IADStore.dados().tarefas.length}};
 });
 // Perfil de chamadas para localizar trabalho repetido na Nutrição.
 // Mede em cenário isolado, restaura as funções após a única execução.
 measurements.nutricaoCallProfile=await page.evaluate(()=>{
   const E=window.IADEngine,V=window.IADViews;
   const names=['potencial','baseDoPotencial','resumo','iad'];
   const previous=new Map(),counts={};
   for(const name of names) {
     const original=E[name];if(typeof original!=='function')continue;
     previous.set(name,original);
     counts[name]={calls:0,totalMs:0};
     E[name]=function(...args){
       const at=performance.now();
       try{return original.apply(this,args);}
       finally {counts[name].calls++;counts[name].totalMs+=performance.now()-at;}
     };
   }
   const started=performance.now();
   try{V.nutricao();}
   finally {for(const [name,original] of previous)E[name]=original;}
   const totalMs=performance.now()-started;
   for(const name of Object.keys(counts))counts[name].totalMs=+counts[name].totalMs.toFixed(2);
   return {totalMs:+totalMs.toFixed(2),functions:counts};
 });
 console.log('PERF04_NUTRICAO_PROFILE '+JSON.stringify(measurements.nutricaoCallProfile));
 console.log('PERF04_BASELINE '+JSON.stringify(measurements));
 fs.mkdirSync(path.join(root,'homolog-artifacts'),{recursive:true});
 fs.writeFileSync(path.join(root,'homolog-artifacts','perf04-browser-baseline.json'),
   JSON.stringify({type:'baseline-only',appVersion:'v273',commit:process.env.GITHUB_SHA||'',
     environment:'Chromium headless GitHub Actions / fixed 1450x900 / synthetic no real Supabase',
     samples:6,warmup:1,measurement:'performance.now HTML + DOM innerHTML synchronous only; not network or LCP/INP',
     ...measurements},null,2));
 if(measurements.screens.length<10 || measurements.errors.length)
   throw new Error('PERF-04 telas não mensuradas: '+JSON.stringify(measurements.errors));


 // Diferencial v273 versus candidato executado na MESMA página, com o
 // MESMO dataset, sessão, Engine, Store e navegador. Apenas views.js muda.
 const baselineViewsSrc=cp.execFileSync('git',[
   'show','ccf80d289cb6dc3425ec996ac72b022db52b7781:src/views.js'
 ],{cwd:root,encoding:'utf8',maxBuffer:3e6});
 const candidateViewsSrc=fs.readFileSync(path.join(root,'src/views.js'),'utf8');
 const differential=await page.evaluate(({baselineViewsSrc,candidateViewsSrc})=>{
   const original=window.IADViews,A=window.IADAuth,S=window.IADStore,E=window.IADEngine;
   function load(text){
     const marker='global.IADViews = {';
     if(!text.includes(marker))throw Error('Export de views.js ausente');
     const injected=text.replace(marker,marker+
       '\n __perf04SetNutri: function(cfg) { Object.assign(nutri,cfg); },');
     (0,eval)(injected);
     return window.IADViews;
   }
   const baseline=load(baselineViewsSrc);
   const candidate=load(candidateViewsSrc);
   window.IADViews=original;
   const uA=S.obter().usuarios.find(x=>x.id==='perf-a');
   const uB=S.obter().usuarios.find(x=>x.id==='perf-b');
   const ops=S.obter().oportunidades;
   const saved=ops.map(x=>({ref:x,nutricao:x.nutricao}));
   const cases=[];
   function check(name,session,filters){
     A.abrirSessao(session);
     baseline.__perf04SetNutri(filters);
     candidate.__perf04SetNutri(filters);
     const oldHTML=baseline.nutricao(),newHTML=candidate.nutricao();
     if(oldHTML!==newHTML){
       let index=0;while(index<oldHTML.length&&oldHTML[index]===newHTML[index])index++;
       throw Error('Nutricao HTML divergente: '+name+' at '+index+
         ' baseline='+JSON.stringify(oldHTML.slice(index,index+130))+
         ' candidate='+JSON.stringify(newHTML.slice(index,index+130)));
     }
     cases.push({name,bytes:newHTML.length,tenant:session.tenantId});
   }
   try {
     for(let i=0;i<ops.length;i++){
       if(ops[i].tenantId==='tenant-a'&&i%11===0)
         ops[i].nutricao={desde:'2026-10-01',motivo:'Aguardar orçamento',
           revisarEm:'2026-11-01'};
     }
     const common={busca:'',responsavel:'todos',segmento:'todos',
       potencial:'todos',saude:'todas',marcadosPipeline:{},marcadosNutricao:{}};
     check('ativa-sem-filtros',uA,{...common,aba:'ativa'});
     check('nutricao-sem-filtros',uA,{...common,aba:'nutricao'});
     check('ativa-IAD-zero',uA,{...common,aba:'ativa',saude:'zerado'});
     check('ativa-IAD-1a4',uA,{...common,aba:'ativa',saude:'ate4'});
     check('ativa-filtro-busca',uA,{...common,aba:'ativa',busca:'A_NEGOCIO_2'});
     check('nutricao-filtro-busca',uA,{...common,aba:'nutricao',busca:'A_NEGOCIO_2'});
     check('ativa-filtro-potencial',uA,{...common,aba:'ativa',potencial:'fora'});
     check('outro-tenant',uB,{...common,aba:'ativa'});
     A.abrirSessao(uA);
     const tarefas=S.dados().tarefas;
     const index=Object.create(null),hoje=S.hoje();
     for(const t of tarefas)
       if(t.oportunidadeId!=null&&t.status==='aberta'&&t.vencimento&&t.vencimento<hoje)
         index[t.oportunidadeId]=(index[t.oportunidadeId]||0)+1;
     for(const op of S.dados().oportunidades){
       const old=E.resumo(op).tarefasAtrasadas;
       const next=E.resumo(op,index).tarefasAtrasadas;
       if(old!==next)throw Error('Tarefas vencidas divergentes em '+op.id+': '+old+' != '+next);
     }
     baseline.__perf04SetNutri({...common,aba:'ativa'});
     candidate.__perf04SetNutri({...common,aba:'ativa'});
     const oldTimes=[],newTimes=[];
     // alterna a ordem para minimizar tendência térmica do runner.
     for(let i=0;i<7;i++){
       let t=performance.now();
       if(i%2===0){baseline.nutricao();oldTimes.push(performance.now()-t);
         t=performance.now();candidate.nutricao();newTimes.push(performance.now()-t);}
       else{candidate.nutricao();newTimes.push(performance.now()-t);
         t=performance.now();baseline.nutricao();oldTimes.push(performance.now()-t);}
     }
     const p95=(a)=>{const sorted=a.slice(1).sort((a,b)=>a-b);return sorted[Math.ceil(sorted.length*.95)-1];};
     const oldP95=+p95(oldTimes).toFixed(2),newP95=+p95(newTimes).toFixed(2);
     if(!(newP95<=oldP95*.5))throw Error('Regressão/candidato sem ganho mínimo de 50%: '+oldP95+' vs '+newP95);
     return {cases,parity:'PASS',validatedOverdue:389,
       baselineWarmP95Ms:oldP95,candidateWarmP95Ms:newP95,
       improvementPct:+(100*(1-newP95/oldP95)).toFixed(2)};
   }finally{
     for(const savedOp of saved)savedOp.ref.nutricao=savedOp.nutricao;
     A.abrirSessao(uA);window.IADViews=original;
   }
 },{baselineViewsSrc,candidateViewsSrc});
 console.log('PERF04_NUTRICAO_DIFFERENTIAL '+JSON.stringify(differential));
 fs.writeFileSync(path.join(root,'homolog-artifacts','perf04-nutricao-differential.json'),
   JSON.stringify({environment:'Same Chromium page and deterministic synthetic dataset',
     baselineCommit:'ccf80d289cb6dc3425ec996ac72b022db52b7781',
     candidateCommit:process.env.GITHUB_SHA||'',
     methodology:'Same Store/Engine, old/new views.js, 8 scenarios; 7 paired iterations, warm p95 excluding first',
     ...differential},null,2));


 // PERF-04 P1: differential v274 VS candidata em uma única página. A v274
 // é o commit de merge previamente publicado; ambos usam a mesma Store,
 // mesmo clock/tenant e mesmas funções globais de gráficos.
 const v274='d67ecd36de841ea225c68af370b69d1d66958089';
 const filesP1={
   oldEngine:cp.execFileSync('git',['show',v274+':src/engine.js'],
       {cwd:root,encoding:'utf8',maxBuffer:3e6}),
   oldViews:cp.execFileSync('git',['show',v274+':src/views.js'],
       {cwd:root,encoding:'utf8',maxBuffer:3e6}),
   newEngine:fs.readFileSync(path.join(root,'src/engine.js'),'utf8'),
   newViews:fs.readFileSync(path.join(root,'src/views.js'),'utf8')
 };
 const p1=await page.evaluate((files)=>{
   const previousViews=window.IADViews,previousEngine=window.IADEngine;
   const A=window.IADAuth,S=window.IADStore;
   const userA=S.obter().usuarios.find(u=>u.id==='perf-a');
   const userB=S.obter().usuarios.find(u=>u.id==='perf-b');
   function load(src){
     (0,eval)(src.engine);
     const marker='global.IADViews = {';
     if(!src.views.includes(marker))throw Error('IADViews export ausente');
     (0,eval)(src.views.replace(marker,marker+
       '\n __perf04PanelFilters: function(periodo,segmento) { filtroPeriodo=periodo; filtroSegmento=segmento; },'));
     return {V:window.IADViews,E:window.IADEngine};
   }
   const old=load({engine:files.oldEngine,views:files.oldViews});
   const candidate=load({engine:files.newEngine,views:files.newViews});
   const cases=[];
   const times={painel:{old:[],candidate:[]},revisao:{old:[],candidate:[]}};
   const median=(v)=>{const sorted=[...v].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]};
   const p95=(v)=>{const sorted=[...v].sort((a,b)=>a-b);return sorted[Math.ceil(sorted.length*.95)-1]};
   function measure(type,session,periodo,segmento,label,comparative){
     A.abrirSessao(session);
     const choose=(which)=>{
       which.V.__perf04PanelFilters(periodo,segmento);
       return type==='painel'?which.V.painel():which.V.revisao();
     };
     const a=choose(old),b=choose(candidate);
     /* Os SVGs de funil usam IDs gerados por contador global fnl1,fnl2...
        Compartilhar a mesma página incrementa esse contador entre renders.
        Normalizar SOMENTE esses IDs preserva atributos, textos e números. */
     const canonical=(html)=>{
       const seen=new Map();
       return html.replace(/fnl\d+/g,function(id){
         if(!seen.has(id))seen.set(id,'fnlCANON'+seen.size);
         return seen.get(id);
       });
     };
     const ac=canonical(a),bc=canonical(b);
     if(ac!==bc){
       let index=0;while(index<ac.length&&ac[index]===bc[index])index++;
       throw Error('P1 HTML divergente '+label+' caractere '+index+
         ' v274='+JSON.stringify(ac.slice(index,index+140))+
         ' candidata='+JSON.stringify(bc.slice(index,index+140)));
     }
     cases.push({label,screen:type,tenant:session.tenantId,bytes:b.length,parity:'PASS'});
     if(comparative){
       // 1 aquecimento + 7 repetições alternando a ordem.
       for(let i=0;i<8;i++){
         const seq=i%2===0?[[old,'old'],[candidate,'candidate']]:
           [[candidate,'candidate'],[old,'old']];
         for(const [which,name] of seq){
           const t=performance.now();choose(which);const dt=performance.now()-t;
           if(i)times[type][name].push(dt);
         }
       }
     }
   }
   try{
     const all={periodo:'todos',segmento:'todos'};
     measure('painel',userA,all.periodo,all.segmento,'painel-geral-A',true);
     measure('revisao',userA,all.periodo,all.segmento,'revisao-geral-A',true);
     const months=old.E.mesesDisponiveis(S.dados().oportunidades);
     if(months.length)measure('painel',userA,months[0],'todos','painel-mes-A',false);
     const allOps=S.obter().oportunidades,prev=allOps.map(o=>({o,n:o.nutricao}));
     try{
       allOps.forEach((o,i)=>{if(o.tenantId==='tenant-a'&&i%13===0)
         o.nutricao={desde:'2026-10-01',motivo:'Ciclo orçamento',revisarEm:'2026-10-15'};
       });
       measure('revisao',userA,'todos','todos','revisao-nutricao-vencida',false);
       measure('painel',userA,'todos','todos','painel-com-nutricao',false);
     }finally{prev.forEach(x=>{x.o.nutricao=x.n;});}
     measure('painel',userB,'todos','todos','painel-outro-tenant',false);
     measure('revisao',userB,'todos','todos','revisao-outro-tenant',false);
     const metrics={};
     for(const screen of ['painel','revisao']){
       const o=times[screen].old,c=times[screen].candidate;
       const baselineP95=+p95(o).toFixed(2),candidateP95=+p95(c).toFixed(2);
       metrics[screen]={baselineP95Ms:baselineP95,candidateP95Ms:candidateP95,
         improvementPct:+(100*(1-candidateP95/baselineP95)).toFixed(2),
         baselineMedianMs:+median(o).toFixed(2),candidateMedianMs:+median(c).toFixed(2)};
       if(!Number.isFinite(baselineP95)||candidateP95>baselineP95*1.20)
         throw Error('Regressão P1 >=20% em '+screen+': '+JSON.stringify(metrics[screen]));
     }
     return {cases,metrics,parity:'PASS'};
   }finally{
     A.abrirSessao(userA);window.IADViews=previousViews;window.IADEngine=previousEngine;
   }
 },filesP1);
 console.log('PERF04_P1_DIFFERENTIAL '+JSON.stringify(p1));
 fs.writeFileSync(path.join(root,'homolog-artifacts','perf04-p1-revisao-painel.json'),
   JSON.stringify({baselineCommit:v274,candidateCommit:process.env.GITHUB_SHA||'',
     methodology:'same browser/page/Store, original and new engine/views, seven warmed alternating samples',
     dataset:{opportunities:389,tasks:778},...p1},null,2));

 // Evita abrir qualquer registro da outra empresa, mesmo com IDs falsos.
 const isolation=await page.evaluate(()=>{
   const A=window.IADAuth,S=window.IADStore;
   const ub=S.obter().usuarios.find(x=>x.id==='perf-b');
   A.abrirSessao(ub);
   window.IADViews.conferirSessao(ub.id);
   const html=window.IADViews.pipeline();
   document.getElementById('conteudo').innerHTML=html;
   return {a:html.includes('A_NEGOCIO'),b:html.includes('B_PRIVADO'),
     count:S.dados().oportunidades.length};
 });
 if(isolation.a||!isolation.b||isolation.count!==1)
   throw Error('Isolamento entre tenants falhou '+JSON.stringify(isolation));
 if(jsErrors.length)throw Error('Erros JS: '+JSON.stringify(jsErrors.slice(0,10)));
 fs.mkdirSync(path.join(root,'homolog-artifacts'),{recursive:true});
 fs.writeFileSync(path.join(root,'homolog-artifacts','perf04-pipeline-check.json'),
   JSON.stringify({environment:'Chromium headless GitHub Actions, Supabase MOCK isolado',runs:rows,showMore:after,
    tenantIsolation:isolation,jsErrors},null,2));
 await page.screenshot({path:path.join(root,'homolog-artifacts','perf04-pipeline.png'),fullPage:false});
 await browser.close();server.close();
 console.log('PERF04_BASELINE_DONE');
}
main().catch(e=>{
 console.error('PERF04_BASELINE_FAIL '+e.stack);
 // Não deixar Chromium aberto segurando o runner por 20 minutos após falha.
 server.closeAllConnections?.();
 server.close();
 process.exit(1);
});
