'use strict';
/* RI-03 — somente dados sintéticos, sem rede, sem acesso a produção. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const portfolioUrl=pathToFileURL(path.join(root,'src/ri/portfolio-analytics.mjs')).href;
const viewUrl=pathToFileURL(path.join(root,'src/ri/account-view.mjs')).href;
const asOf='2026-11-06';
const scope={userId:'gestor-1',tenantId:'tenant-a',role:'gestor',admin:false,
  tenantFilter:'todas',ownerFilter:'todos',token:'safe'};
const opp=(id,account,stage,day,amount=0)=>({
  id,contaId:account,tenantId:'tenant-a',donoId:'gestor-1',
  titulo:'Negociação '+id,etapa:stage,etapaDesde:day,valor:amount,desfecho:null});
function fixture(){
  const x={contas:[
    {id:'c1',tenantId:'tenant-a',donoId:'gestor-1',nome:'Indústria Aurora'},
    {id:'c2',tenantId:'tenant-a',donoId:'gestor-1',nome:'Fábrica Azul'},
    {id:'c3',tenantId:'tenant-a',donoId:'gestor-1',nome:'Conta sem negócio'},
    {id:'b1',tenantId:'tenant-b',donoId:'gestor-1',nome:'EMPRESA SECRETA'}],
   oportunidades:[
     {...opp('o1','c1','Proposta','2026-10-01',19000),fechamentoPrevisto:'2026-11-01'},
     opp('o2','c1','Diagnóstico','2026-10-12',2500),
     opp('o3','c2','Conexão','2026-09-15'),
     opp('o4','c2','Prospecção','2026-11-02'),
     {id:'b-op',tenantId:'tenant-b',contaId:'b1',donoId:'gestor-1',
      titulo:'OP SECRETA',etapa:'Proposta',valor:900000,desfecho:null}],
   tarefas:[
     {id:'t1',oportunidadeId:'o3',tenantId:'tenant-a',donoId:'gestor-1',status:'aberta',vencimento:'2026-11-01'},
     {id:'t2',oportunidadeId:'o3',tenantId:'tenant-a',donoId:'gestor-1',status:'aberta',vencimento:'2026-11-02'},
     {id:'t3',oportunidadeId:'b-op',tenantId:'tenant-b',donoId:'gestor-1',status:'aberta',vencimento:'2026-11-01'}]};
  return {snapshot:x,scope,asOf};
}
test('RI-03: encaminha negócios em movimentos auditáveis',async()=>{
  const {buildPortfolioAnalytics}=await import(portfolioUrl);
  const f=fixture(),before=JSON.stringify(f),x=buildPortfolioAnalytics(f);
  assert.equal(x.metrics.accounts,3);
  assert.equal(x.metrics.open,4);
  assert.equal(x.metrics.openValue,21500);
  assert.equal(x.metrics.positiveOpen,2);
  assert.equal(x.metrics.accountsWithoutOpen,1);
  assert.equal(x.metrics.overdueTasks,2);
  assert.deepEqual(Object.fromEntries(Object.entries(x.motions).map(([k,v])=>[k,v.count])),
    {fechar:1,avancar:1,reativar:1,qualificar:1});
  const action=x.motions.fechar.items[0];
  assert.equal(action.accountName,'Indústria Aurora');
  assert.match(action.action,/Validar decisão/);
  assert.ok(!JSON.stringify(x).includes('EMPRESA SECRETA'));
  assert.ok(!JSON.stringify(x).includes('OP SECRETA'));
  assert.equal(JSON.stringify(f),before,'análise não modifica dados ou filtros');
});
test('RI-03: filtros de admin respeitados também nos grupos de ação',async()=>{
  const {buildPortfolioAnalytics}=await import(portfolioUrl);
  const f=fixture();
  f.snapshot.contas.push({id:'c4',tenantId:'tenant-a',donoId:'outro',nome:'CONTA PRIVADA'});
  f.snapshot.oportunidades.push({...opp('o5','c4','Proposta','2026-10-01',950000),donoId:'outro'});
  f.scope={...scope,role:'admin',admin:true,tenantFilter:'tenant-a',ownerFilter:'gestor-1'};
  const x=buildPortfolioAnalytics(f);
  assert.equal(x.metrics.openValue,21500);
  assert.equal(x.metrics.accounts,3);
  assert.equal(x.motions.fechar.count,1);
  assert.ok(!JSON.stringify(x).includes('CONTA PRIVADA'));
  f.scope={...f.scope,ownerFilter:'outro'};
  const y=buildPortfolioAnalytics(f);
  assert.equal(y.metrics.openValue,950000);
  assert.ok(!JSON.stringify(y).includes('Indústria Aurora'));
});
test('RI-03: lista limitada mesmo para 6000 oportunidades; priorização não segue ordem de cadastro',async()=>{
  const {buildPortfolioAnalytics}=await import(portfolioUrl);
  const f=fixture();
  f.snapshot.oportunidades=Array.from({length:6000},(_,i)=>({
    ...opp('bulk'+i,'c1','Conexão','2026-09-20',i===5999?100000:0),
    fechamentoPrevisto:i===5999?'2026-10-30':null}));
  f.snapshot.tarefas=[];
  const x=buildPortfolioAnalytics(f);
  assert.equal(x.metrics.open,6000);
  assert.equal(x.motions.reativar.count,6000);
  assert.equal(x.motions.reativar.items.length,12);
  assert.equal(x.motions.reativar.items[0].opportunityId,'bulk5999');
  assert.equal(x.priorities.length,15);
  assert.ok(JSON.stringify(x).length<24000,'resultado limita tamanho e custo de UI');
});
test('RI-03: tela não contém fontes externas, escrita ou HTML comercial inseguro',async()=>{
  const view=fs.readFileSync(path.join(root,'src/ri/account-view.mjs'),'utf8');
  const css=fs.readFileSync(path.join(root,'assets/ri-commercial.css'),'utf8');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const config=fs.readFileSync(path.join(root,'src/config.js'),'utf8');
  const mod=await import(viewUrl);
  assert.equal(typeof mod.mountAccountIntelligence,'function');
  assert.equal(typeof mod.selectVisibleAccounts,'function');
  for(const m of ['upsell','crossSell','forgotten','news','growth'])
    assert.ok(view.includes("id:'"+m+"'"));
  assert.ok(view.includes('textContent'));
  assert.ok(!view.includes('.innerHTML'));
  assert.doesNotMatch(view,/fetch\s*\(|supabase\.|localStorage\.setItem|Store\.salvar\(/);
  assert.ok(view.includes('getScopeToken()===scope.token'));
  assert.ok(view.includes('findVisibleAccount(snapshot,scope'));
  assert.ok(css.includes('#iad-ri-root'));
  assert.ok(css.includes('@media (max-width:640px)'));
  assert.ok(sw.includes("'./assets/ri-commercial.css'"));
  const version=config.match(/numero:\s*'(v286\.\d+)'/);
  assert.ok(version,'versão requerida');
  assert.ok(sw.includes('iad-crm-'+version[1]),'SW e config devem ter mesma versão');
  assert.ok(sw.includes("'./src/ri/opportunity-radar.mjs'"));
  assert.ok(version[1].startsWith('v286.'));
});
