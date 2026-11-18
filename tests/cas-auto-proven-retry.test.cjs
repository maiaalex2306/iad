'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('src/nuvem.js','utf8');
const start=source.indexOf('  let retomadaCASEmCurso = null;');
const end=source.indexOf('  /* Diagnóstico P0 somente quantitativo',start);
assert.ok(start>=0&&end>start,'encontrado o controle de recuperação CAS');
const snippet=source.slice(start,end);
function scenario(kind){
 let sends=0,proof=0;
 const ctx={Promise,Error,String,
  retomarFilaCAS:()=>{sends++;
    if(kind==='proved'&&sends===1)return Promise.reject(Error('Conflito de revisão no servidor. Edições pendentes preservadas'));
    if(kind==='true-conflict')return Promise.reject(Error('Conflito de revisão no servidor. Edições pendentes preservadas'));
    if(kind==='offline')return Promise.reject(Error('Rede indisponível. Fila preservada.'));
    return Promise.resolve({sent:1,blocked:false});
  },
  conciliarCASJaAplicadasSomenteLeitura:()=>{proof++;
    return Promise.resolve({reconhecidas:kind==='proved'?1:0,recibosConciliados:0,restantes:kind==='proved'?0:1});
  }
 };
 vm.createContext(ctx);
 vm.runInContext(snippet,ctx);
 return {ctx,stats:()=>({sends,proof})};
}
test('CAS: conflito já aplicado reconhecido por prova e retentado uma única vez',async()=>{
 const {ctx,stats}=scenario('proved');
 const r=await ctx.retomarFilaCASSeguro();
 assert.equal(r.sent,1);
 assert.deepEqual(stats(),{sends:2,proof:1});
});
test('CAS: conflito real não é reenviado nem considerado resolvido',async()=>{
 const {ctx,stats}=scenario('true-conflict');
 await assert.rejects(ctx.retomarFilaCASSeguro(),/Conflito de revisão/);
 assert.deepEqual(stats(),{sends:1,proof:1});
});
test('CAS: falha de rede não desencadeia prova, nem reenvio',async()=>{
 const {ctx,stats}=scenario('offline');
 await assert.rejects(ctx.retomarFilaCASSeguro(),/Rede indisponível/);
 assert.deepEqual(stats(),{sends:1,proof:0});
});
test('CAS: duas tentativas simultâneas compartilham o mesmo envio',async()=>{
 const {ctx,stats}=scenario('proved');
 await Promise.all([ctx.retomarFilaCASSeguro(),ctx.retomarFilaCASSeguro()]);
 assert.deepEqual(stats(),{sends:2,proof:1});
});
test('CAS: não desativa controle de conflito nem aceita patch sem prova',()=>{
 assert.match(source,/if\(!resultado\.reconhecidas&&!resultado\.recibosConciliados\)throw erro/);
 assert.match(source,/return retomarFilaCAS\(\)/);
 assert.match(source,/fila\.satisfazRemoto\(op,remote\)/);
 assert.match(source,/throw new Error\(detalhe\+' Edições pendentes preservadas/);
});
