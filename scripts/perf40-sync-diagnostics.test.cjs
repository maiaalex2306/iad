'use strict';
/* PERF-40 — execução real do cliente de sincronização com PostgREST simulado.
   Sem internet, credenciais, clientes, dados de produção, ou escrita no banco. */
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=file=>fs.readFileSync(path.join(root,'src',file),'utf8');
const TABLES=['contas','contatos','oportunidades','tarefas','produtos','segmentos',
 'tipos_tarefa','fontes','sinais','notas'];
function setup({optin=true,pending=false,failing=null}={}){
 const storage=new Map();
 const tenant='11111111-1111-4111-8111-111111111111';
 const profile={tenant_id:tenant,papel:'gestor',nome:'Teste'};
 storage.set('iad-crm:nuvem-sessao:v1',JSON.stringify({
   user:{id:'33333333-3333-4333-8333-333333333333'},
   access_token:'not-a-real-token',perfil:profile
 }));
 const localStorage={
  getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),
  removeItem:k=>storage.delete(k),
  key:i=>[...storage.keys()][i]||null,
  get length(){return storage.size}
 };
 let saves=0,requests=[];
 const state=Object.fromEntries(TABLES.map(x=>[x,[]]));
 state.contas=[{id:'old',tenantId:tenant,nome:'Antes da carga'}];
 const Store={
  obter:()=>state,salvar:()=>{saves++},revisao:()=>saves,
  semSincronizar:fn=>fn(),memorizarRevisoesRemotas:()=>{},exclusoesPendentes:()=>[],
  contexto:()=>({filtros:{}})
 };
 let now=1000;
 const win={localStorage,IADStore:Store,
  IADCAS:{},IADCASQueue:{
   create:()=>({pending:()=>pending?[{id:'unacked'}]:[],pendingAcks:()=>[]})
  },
  IADConfig:{supabase:{url:'https://homolog.invalid',chave:'fake-anon'}},
  performance:{now:()=>++now}};
 const sandbox={window:win,localStorage,Date,Math,JSON,Promise,Map,Set,URL,
  Number,console,encodeURIComponent,decodeURIComponent,fetch:()=>Promise.reject(Error('No internet'))};
 vm.runInNewContext(src('performance.js'),sandbox,{filename:'performance.js'});
 vm.runInNewContext(src('nuvem.js'),sandbox,{filename:'nuvem.js'});
 const perf=win.IADPerformance,N=win.IADNuvem;
 if(optin)perf.iniciar();
 N.__trocarChamar(async route=>{
  requests.push(route);
  const name=/^\/rest\/v1\/([^?]+)/.exec(route)?.[1];
  if(failing===name)throw Error('Remote table unavailable');
  if(/&id=gt\./.test(route))return [];
  if(name==='contas')return [{id:'c-1',tenant_id:tenant,nome:'Conta sintética'}];
  if(name==='oportunidades')return [{id:'op-1',tenant_id:tenant,
    conta_id:'c-1',titulo:'Oportunidade sintética',eventos:[]}];
  return [];
 });
 return {perf,N,storage,state,requests,saveCount:()=>saves,tenant};
}
test('download integral mantém 10 tabelas e ordem de confirmação, com métricas opt-in',async()=>{
 const h=setup();const total=await h.N.puxar(true);
 assert.equal(total,2);
 assert.equal(h.saveCount(),1,'snapshot salvo uma única vez');
 assert.equal(h.state.contas[0].nome,'Conta sintética');
 assert.equal(h.state.oportunidades[0].titulo,'Oportunidade sintética');
 assert(h.storage.has('iad-crm:nuvem-marcas'),'marcas gravadas após carga');
 assert(h.requests.some(x=>x.startsWith('/rest/v1/oportunidades?select=*')));
 const report=h.perf.relatorioDiagnostico();
 for(const table of TABLES)assert.equal(report['perf40.sync.table.'+table].chamadas,1,table);
 for(const phase of ['download','persist','marks'])
  assert.equal(report['perf40.sync.full.'+phase].chamadas,1,phase);
 assert.equal(report['perf23.sync.puxar'].chamadas,1);
 assert(!JSON.stringify(report).includes('11111111-1111'));
 assert(!JSON.stringify(report).includes('op-1'));
});
test('sem opt-in nenhuma métrica é coletada ou exportada',async()=>{
 const h=setup({optin:false});await h.N.puxar(true);
 assert.equal(h.saveCount(),1);
 assert.equal(Object.keys(h.perf.relatorioDiagnostico()).length,0);
});
test('falha de uma tabela preserva snapshot e não grava marcas',async()=>{
 const h=setup({failing:'oportunidades'});
 await assert.rejects(()=>h.N.puxar(true),/oportunidades/);
 assert.equal(h.saveCount(),0);
 assert.equal(h.state.contas[0].id,'old');
 assert(!h.storage.has('iad-crm:nuvem-marcas'));
 const report=h.perf.relatorioDiagnostico();
 assert.equal(report['perf40.sync.full.download'].chamadas,1);
 assert.equal(report['perf40.sync.full.persist'],undefined);
 assert.equal(report['perf40.sync.full.marks'],undefined);
});
test('CAS pendente bloqueia download completo e preserva estado',async()=>{
 const h=setup({pending:true});
 await assert.rejects(()=>h.N.puxar(true),/CAS pendentes/);
 assert.equal(h.requests.length,0);
 assert.equal(h.state.contas[0].id,'old');
 assert.equal(h.saveCount(),0);
});
test('allowlist não vaza strings arbitrárias com URL/identidade/segredo',()=>{
 const h=setup();
 h.perf.registrar('perf40.sync.table.cnpj-SECRET-https://example.com',999);
 h.perf.registrar('perf40.sync.table.oportunidades',12);
 const obj=JSON.parse(h.perf.exportarDiagnosticoJSON());
 assert.equal(obj.metricas['perf40.sync.table.oportunidades'].p95Ultimas100Ms,12);
 assert(!JSON.stringify(obj).includes('SECRET'));
 assert(!JSON.stringify(obj).includes('example.com'));
 assert(!JSON.stringify(obj).includes('cnpj'));
});
test('não mudou a semântica de forçar sincronização nem os mecanismos CAS',()=>{
 const nuvem=src('nuvem.js');
 assert.match(nuvem,/function sincronizar\(\) \{/);
 assert.match(nuvem,/empurrar\(\{ tudo: true \}\)/);
 assert.match(nuvem,/tenantsComFilaCAS\(\)\.some/);
 assert.match(nuvem,/if \(pending\)/);
 assert.match(nuvem,/Store\.semSincronizar/);
 assert.match(nuvem,/cursorDelta = null/);
});
