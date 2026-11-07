const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../src/cas.js');
const base={id:'o1',tenantId:'t1',revisao:1,nome:'A',valor:10};
test('reject unsafe revisions',()=>{for(const n of [-1,1.5,NaN,'1']) assert.throws(()=>C.revision(n));});
test('detect conflicting simultaneous edits',()=>{assert.deepEqual(C.conflict(base,{...base,valor:20},{...base,valor:30}).map(x=>x.field),['valor']);});
test('independent edits have no field collision',()=>{assert.deepEqual(C.conflict(base,{...base,nome:'B'},{...base,valor:20}),[]);});
test('never compare different tenants or records',()=>{assert.throws(()=>C.conflict(base,{...base,tenantId:'t2'},base));assert.throws(()=>C.conflict(base,{...base,id:'o2'},base));});
test('reject protected field mutations and missing idempotency',()=>{
 const args={tenantId:'t1',userId:'u1',table:'oportunidades',recordId:'o1',expectedRevision:1,operationId:'op-1',patch:{nome:'B'}};
 assert.ok(Object.isFrozen(C.operation(args)));
 assert.throws(()=>C.operation({...args,patch:{tenantId:'t2'}}));
 assert.throws(()=>C.operation({...args,operationId:''}));
 assert.throws(()=>C.operation({...args,table:'contas'}));
});
test('create lost ACK: only identical remote payload may confirm, never overwrite',()=>{
 const local={id:'opp-new',tenant_id:'tenant-a',titulo:'Novo',valor:120,
   dims:{impacto:1,problema:2},itens:[{quantidade:2,preco:60}],atualizado_em:'ignored'};
 const same={id:'opp-new',tenant_id:'tenant-a',titulo:'Novo',valor:120,
   dims:{problema:2,impacto:1},itens:[{preco:60,quantidade:2}],revisao:0,atualizado_em:'server'};
 assert.equal(C.sameRecord(local,same),true);
 assert.equal(C.sameRecord(local,{...same,valor:121}),false);
 assert.equal(C.sameRecord(local,{...same,tenant_id:'tenant-b'}),false);
 assert.equal(C.sameRecord(local,{...same,itens:[]}),false);
});
