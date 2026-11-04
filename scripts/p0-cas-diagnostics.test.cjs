'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const cloud=fs.readFileSync('src/nuvem.js','utf8');
const view=fs.readFileSync('src/views.js','utf8');
const start=cloud.indexOf('  function diagnosticoPendenciasCAS() {');
const end=cloud.indexOf('  /* Cópia local explícita.',start);
assert.ok(start>=0&&end>start,'diagnostic code exists');
function run(queues,shouldFail=false){
 const ctx={tenantsComFilaCAS:()=>{if(shouldFail)throw Error('SECRET');return Object.keys(queues);},
   filaCASDaSessao:(tenant)=>({pending:()=>queues[tenant]}),String};
 vm.runInNewContext(cloud.slice(start,end)+'\nglobalThis.result=diagnosticoPendenciasCAS();',ctx);
 return JSON.parse(JSON.stringify(ctx.result));
}
test('only anonymized counts returned across queues',()=>{
 const op={operationId:'secret-123',patch:{notes:'customer secret'},userId:'user-a'};
 const value=run({tenantA:[op,op],tenantB:[],tenantC:[op]});
 assert.deepEqual(value,{quantidade:3,filas:2,disponivel:true});
 assert.doesNotMatch(JSON.stringify(value),/secret|tenant|patch|user/i);
});
test('no queue does not invent pending edits',()=>{
 assert.deepEqual(run({tenantA:[]}),{quantidade:0,filas:0,disponivel:true});
});
test('missing session returns unavailable without leaking error',()=>{
 assert.deepEqual(run({},true),{quantidade:null,filas:null,disponivel:false});
});
test('UI preserves export and explicit retry without automatic deletion',()=>{
 const a=view.indexOf('function semServidor(motivo)');
 const b=view.indexOf('function acesso()',a);
 const snippet=view.slice(a,b);
 assert.match(snippet,/diagnosticoPendenciasCAS/);
 assert.match(snippet,/App\.baixarCopiaPendenciasCAS/);
 assert.match(snippet,/App\.recuperarPendenciasCAS/);
 assert.doesNotMatch(snippet,/localStorage\.clear|removeItem\(/);
});
test('blocking conflict retains fail-closed error and preserves CAS',()=>{
 assert.match(cloud,/if\(r && \(r\.blocked\|\|r\.busy\)\)/);
 assert.match(cloud,/Edições pendentes preservadas/);
 assert.match(cloud,/Conflito de revisão no servidor/);
});
test('PWA version matches application',()=>{
 const config=fs.readFileSync('src/config.js','utf8'),sw=fs.readFileSync('sw.js','utf8');
 const riCfgVersion=(fs.readFileSync('src/config.js','utf8').match(/numero: '(v[0-9]+(?:\.[0-9]+)*)'/)||[])[1];
 const riPwaVersion=(fs.readFileSync('sw.js','utf8').match(/const CACHE = 'iad-crm-(v[0-9]+(?:\.[0-9]+)*)'/)||[])[1];
 assert.ok(riCfgVersion && riPwaVersion,'release and PWA version required');
 assert.equal(riCfgVersion,riPwaVersion,'release and PWA cache must match');

});
