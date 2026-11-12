'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/nuvem.js','utf8');
const begin=source.indexOf('            if (!base) {');
const end=source.indexOf('            /* No-op não deve confirmar',begin);
assert.ok(begin>=0&&end>begin,'missing CAS base preflight present');
function scenario({localRevision,found,identical=false}={}){
 const requests=[],line={id:'lead1',tenant_id:'tenant1',etapa:'Local',valor:17,revisao:localRevision};
 const remote={id:'lead1',tenant_id:'tenant1',etapa:identical?'Local':'Servidor',valor:17,revisao:8};
 const Store={snapshotBaseRemoto:()=>null,memorizarRevisoesRemotas:()=>{}};
 const ctx={Promise,Number,String,Error,encodeURIComponent,Object,
  base:null,linha:line,registro:{...line},Store,paraApp:r=>({id:r.id,tenantId:r.tenant_id,revisao:r.revisao}),
  global:{IADCAS:{sameRecord:(a,b)=>a.id===b.id&&a.tenant_id===b.tenant_id&&a.etapa===b.etapa&&a.valor===b.valor}},
  chamar:async(url,opts)=>{requests.push({url,opts});if(opts?.metodo==='POST')return [remote];return found?[remote]:[];}};
 vm.runInNewContext('function execute(){'+source.slice(begin,end)+'return Promise.resolve();}\nglobalThis.go=execute;',ctx);
 return {go:()=>ctx.go(),requests,local:ctx.registro};
}
test('existing divergent row with missing snapshot never POSTs or overwrites',async()=>{
 const s=scenario({localRevision:7,found:true});
 await assert.rejects(s.go(),/Base CAS da oportunidade existente indisponível/);
 assert.equal(s.requests.length,1);assert.equal(s.requests[0].opts,undefined);
 assert.equal(s.local.etapa,'Local');
});
test('existing row with identical values is a verified retry ACK without POST',async()=>{
 const s=scenario({localRevision:7,found:true,identical:true});
 await s.go();assert.equal(s.requests.length,1);
});
test('server missing but local positive revision blocks accidental re-create',async()=>{
 const s=scenario({localRevision:7,found:false});
 await assert.rejects(s.go(),/Criação bloqueada/);
 assert.equal(s.requests.length,1);
});
test('genuinely new row can still be created after not-found check',async()=>{
 const s=scenario({localRevision:undefined,found:false,identical:true});
 await s.go();assert.equal(s.requests.length,2);assert.equal(s.requests[1].opts.metodo,'POST');
});
test('app release and service worker match',()=>{
 const riCfgVersion=(fs.readFileSync('src/config.js','utf8').match(/numero: '(v[0-9]+(?:\.[0-9]+)*)'/)||[])[1];
 const riPwaVersion=(fs.readFileSync('sw.js','utf8').match(/const CACHE = 'iad-crm-(v[0-9]+(?:\.[0-9]+)*)'/)||[])[1];
 assert.ok(riCfgVersion && riPwaVersion,'release and PWA version required');
 assert.equal(riCfgVersion,riPwaVersion,'release and PWA cache must match');

});
