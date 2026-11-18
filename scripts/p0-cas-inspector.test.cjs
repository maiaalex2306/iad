'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const cloud=fs.readFileSync('src/nuvem.js','utf8');
const a=cloud.indexOf('  function inspecionarPendenciasCAS() {');
const b=cloud.indexOf('  /* Cópia local explícita.',a);
assert.ok(a>=0&&b>a,'read-only inspector exists');
async function run(scenario){
 const pending=scenario.pending||[];
 const ack=scenario.acks||[];
 const requests=[];
 let writes=0;
 const ctx={
  Promise,Number,String,Array,encodeURIComponent,
  tenantsComFilaCAS:()=>['tenant-a'],
  filaCASDaSessao:()=>({
   pending:()=>pending,pendingAcks:()=>ack,
   flush:()=>{writes++;throw Error('must not flush');},
   confirmAck:()=>{writes++;throw Error('must not confirm');}
  }),
  chamar:async(url,options)=>{
   requests.push({url,options});
   if(scenario.error)throw Error('secret network failure');
   return scenario.rows||[{id:'hidden',revisao:8}];
  }
 };
 vm.runInNewContext(cloud.slice(a,b)+'\nglobalThis.check=inspecionarPendenciasCAS;',ctx);
 const value=JSON.parse(JSON.stringify(await ctx.check()));
 return {value,requests,writes};
}
const op={userId:'user-secret',tenantId:'tenant-a',recordId:'record-secret',
 operationId:'operation-secret',patch:{company:'commercial-secret'},expectedRevision:7};
test('revision mismatch is classified but no IDs or commercial content leak',async()=>{
 const x=await run({pending:[op]});
 assert.equal(x.value.total,1);assert.equal(x.value.itens[0].estado,'conflito_de_revisao');
 assert.equal(x.writes,0);assert.equal(x.requests.length,1);
 assert.equal(x.requests[0].options,undefined);
 assert.doesNotMatch(JSON.stringify(x.value),/secret|patch|record|tenant/i);
});
test('matching revision reports compatible, not auto-resolved',async()=>{
 const x=await run({pending:[op],rows:[{revisao:7}]});
 assert.equal(x.value.itens[0].estado,'revisao_compativel');assert.equal(x.writes,0);
});
test('receipt is not treated as unconfirmed edit',async()=>{
 const x=await run({acks:[{operation:op}],rows:[{revisao:8}]});
 assert.equal(x.value.itens[0].estado,'ack_aguardando_conciliacao');
});
test('missing record and network errors are not falsely resolved',async()=>{
 const a=await run({pending:[op],rows:[]}),b=await run({pending:[op],error:true});
 assert.equal(a.value.itens[0].estado,'registro_indisponivel');
 assert.equal(b.value.itens[0].estado,'consulta_indisponivel');
});
test('bounded query count and no hidden write or RPC',async()=>{
 const x=await run({pending:Array.from({length:35},()=>({...op}))});
 assert.equal(x.value.total,35);assert.equal(x.value.verificados,30);
 assert.equal(x.requests.length,30);assert.equal(x.writes,0);
 assert.ok(x.requests.every(y=>!y.url.includes('/rpc/')));
});
test('blocked UI connects inspector to button; PWA coordinated',()=>{
 const app=fs.readFileSync('src/app.js','utf8');
 const config=fs.readFileSync('src/config.js','utf8');
 const sw=fs.readFileSync('sw.js','utf8');
 assert.match(app,/diagnosticarPendenciasCAS: function/);
 assert.match(app,/botao\.textContent='Diagnosticar pendências'/);
 const riCfgVersion=(fs.readFileSync('src/config.js','utf8').match(/numero: '(v[0-9]+(?:\.[0-9]+)*)'/)||[])[1];
 const riPwaVersion=(fs.readFileSync('sw.js','utf8').match(/const CACHE = 'iad-crm-(v[0-9]+(?:\.[0-9]+)*)'/)||[])[1];
 assert.ok(riCfgVersion && riPwaVersion,'release and PWA version required');
 assert.equal(riCfgVersion,riPwaVersion,'release and PWA cache must match');

});
