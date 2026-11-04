'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {resolve}=require('node:path');
const src=pathToFileURL(resolve(__dirname,'../src/ri/account-briefing.mjs'));
let mod;
async function build(payload){mod ??= import(src);return (await mod).buildAccountBriefing(payload);}
function sample(){return {
  account:{id:'a1',tenantId:'t1',nome:'Fábrica Aurora'},
  opportunities:[{id:'o1',tenantId:'t1',contaId:'a1',nome:'Redução de perdas'},
                 {id:'o2',tenantId:'t1',contaId:'a2',nome:'Conta errada'},
                 {id:'o3',tenantId:'t2',contaId:'a1',nome:'Tenant errado'}],
  contacts:[{id:'c1',tenantId:'t1',contaId:'a1',nome:'Ana',papelCompra:'Patrocinadora econômica'},
            {id:'c2',tenantId:'t1',contaId:'a2',nome:'Pedro',papelCompra:'Gestor'},
            {id:'c3',tenantId:'t2',contaId:'a1',nome:'Segredo',papelCompra:'Diretor'}],
  evidence:[{id:'e1',tenantId:'t1',contaId:'a1',statement:'Nova linha industrial',status:'confirmed',source:'https://example.com/noticia',capturedAt:'2026-10-01T00:00:00Z',expiresAt:'2026-12-01T00:00:00Z'},
            {id:'e2',tenantId:'t1',contaId:'a1',statement:'Pode haver pressão sobre utilidades',status:'hypothesis'},
            {id:'e3',tenantId:'t1',contaId:'a2',statement:'Outro cliente',status:'confirmed',source:'CRM',capturedAt:'2026-10-01T00:00:00Z'},
            {id:'e4',tenantId:'t2',contaId:'a1',statement:'Dados restritos',status:'confirmed',source:'CRM',capturedAt:'2026-10-01T00:00:00Z'}],
  asOf:'2026-11-04T12:00:00Z'
};}
test('produces verified facts and hypotheses separately',async()=>{
 const report=await build(sample());
 assert.equal(report.accountId,'a1');assert.equal(report.title,'Fábrica Aurora');
 assert.deepEqual(report.facts.map(x=>x.statement),['Nova linha industrial']);
 assert.deepEqual(report.hypotheses.map(x=>x.statement),['Pode haver pressão sobre utilidades']);
 assert.equal(report.facts[0].source,'https://example.com/noticia');
});
test('does not leak contacts or opportunities of other account or tenant',async()=>{
 const report=await build(sample());
 assert.deepEqual(report.decisionMap.map(x=>x.name),['Ana']);
 assert.equal(report.stats.opportunities,1);assert.equal(report.stats.contacts,1);
 assert.ok(!JSON.stringify(report).includes('Segredo'));
 assert.ok(!JSON.stringify(report).includes('Outro cliente'));
});
test('expired source or missing provenance cannot become confirmed fact',async()=>{
 const x=sample();x.evidence[0].expiresAt='2026-10-15T00:00:00Z';
 x.evidence.push({id:'e5',tenantId:'t1',contaId:'a1',statement:'Sem fonte',status:'confirmed',capturedAt:'2026-10-01T00:00:00Z'});
 const report=await build(x);
 assert.equal(report.facts.length,0);
 assert.ok(report.gaps.some(s=>s.includes('Nova linha industrial')));
 assert.ok(report.gaps.some(s=>s.includes('Sem fonte')));
});
test('future-dated evidence must not be trusted',async()=>{
 const x=sample();x.evidence[0].capturedAt='2026-12-12T00:00:00Z';
 const report=await build(x);assert.equal(report.facts.length,0);
});
test('malformed account, tenant or date fails closed',async()=>{
 for(const change of [{account:{id:'a1'}},{account:{id:'',tenantId:'t1'}},{asOf:'garbage'},{contacts:null}]){
  await assert.rejects(build({...sample(),...change}));
 }
});
test('returns plain values, never executable HTML',async()=>{
 const x=sample();x.account.nome='<script>alert(1)</script>';
 x.contacts[0].nome='<img src=x onerror=evil()>';
 const result=await build(x);
 assert.equal(result.title,'<script>alert(1)</script>');
 assert.equal(result.decisionMap[0].name,'<img src=x onerror=evil()>');
 assert.equal(result.html,undefined);
});
test('unknown role is not inferred from job title',async()=>{
 const x=sample();delete x.contacts[0].papelCompra;x.contacts[0].cargo='Presidente';
 const result=await build(x);assert.equal(result.decisionMap[0].role,'Papel a confirmar');
});
test('large preauthorized account data is bounded in output',async()=>{
 const x=sample();x.contacts=[];x.opportunities=[];x.evidence=[];
 for(let i=0;i<15000;i++){
  x.contacts.push({id:'c'+i,tenantId:'t1',contaId:'a1',nome:'Pessoa '+i});
  x.opportunities.push({id:'o'+i,tenantId:'t1',contaId:'a1',nome:'Negócio '+i});
 }
 const result=await build(x);
 assert.equal(result.stats.contacts,15000);assert.equal(result.stats.opportunities,15000);
 assert.ok(result.decisionMap.length<=30);
 assert.ok(JSON.stringify(result).length<15000);
});
test('does not mutate the source data',async()=>{
 const x=sample(),before=JSON.stringify(x);
 await build(x);
 assert.equal(JSON.stringify(x),before);
});
test('recognizes RFC3339 timestamps with explicit timezone offsets from PostgreSQL',async()=>{
 const x=sample();x.asOf='2026-11-04T12:00:00-03:00';
 x.evidence[0].capturedAt='2026-10-01T00:00:00+00:00';
 x.evidence[0].expiresAt='2026-12-01T00:00:00+00:00';
 const result=await build(x);
 assert.equal(result.facts.length,1);
});
