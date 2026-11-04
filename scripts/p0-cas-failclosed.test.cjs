'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/nuvem.js','utf8');
const start=source.indexOf('  function puxarCompleto(forcar) {');
const end=source.indexOf('    notificarCarga({ativa:true',start);
assert.ok(start>=0&&end>start,'real download guard exists');
const guard=source.slice(start,end)+'    return Promise.resolve("download-authorized");\n  }\n';
function probe({pending=[],throwOnTenants=null,throwOnPending=null}={}){
 const ctx={Promise,Error,tenantsComFilaCAS:()=>{if(throwOnTenants)throw Error(throwOnTenants);return ['tenant1'];},
   filaCASDaSessao:()=>({pending:()=>{if(throwOnPending)throw Error(throwOnPending);return pending;}})};
 vm.runInNewContext(guard+'globalThis.check=puxarCompleto;',ctx);
 return ctx.check();
}
test('P0: empty verified CAS queue permits full download',async()=>{
 assert.equal(await probe(),'download-authorized');
});
test('P0: pending CAS blocks full download without loss',async()=>{
 await assert.rejects(probe({pending:[{operationId:'op1'}]}),/Há edições CAS pendentes/);
});
test('P0: corrupt queue read cannot be treated as empty',async()=>{
 await assert.rejects(probe({throwOnPending:'Fila CAS inválida; não sobrescrever'}),/Fila CAS inválida/);
});
test('P0: missing session cannot bypass pending journal validation',async()=>{
 await assert.rejects(probe({throwOnTenants:'Sessão CAS ausente.'}),/Sessão CAS ausente/);
});
test('P0: browser storage failure blocks full download',async()=>{
 await assert.rejects(probe({throwOnPending:'QuotaExceededError'}),/QuotaExceededError/);
});
test('P0: release app and PWA are coordinated',()=>{
 const c=fs.readFileSync('src/config.js','utf8'),s=fs.readFileSync('sw.js','utf8');
 assert.match(c,/numero: 'v286.38'/);
 assert.match(s,/const CACHE = 'iad-crm-v286.38'/);
});
