'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const w={};vm.runInNewContext(fs.readFileSync('src/incremental.js','utf8'),{window:w});
const nova=()=>w.IADIncremental.criar();
const wrap=(id,valor,classe)=>({op:{id,valor},classe:{id:classe}});
const expected=(data)=>{
 const r={qtd:data.length,valor:0,saudavel:0,risco:0,zumbi:0};
 data.forEach(x=>{const v=x.op.valor||0,c=x.classe.id;r.valor+=v;
 if(c==='real'||c==='oculto')r.saudavel+=v;
 if(c==='falso'||c==='construcao')r.risco+=v;
 if(c==='zumbi')r.zumbi+=v;});return r;
};
test('incremental com 5000 oportunidades e 100 alterações; paridade reconstrução',()=>{
 const data=Array.from({length:5000},(_,i)=>wrap('op'+i,i%30,['real','oculto','falso','construcao','zumbi'][i%5]));
 const a=nova();a.reconstruir(data);assert.deepEqual(JSON.parse(JSON.stringify(a.resultado())),expected(data));
 for(let i=0;i<100;i++){const idx=i*31;data[idx]=wrap('op'+idx,idx+101,'real');a.atualizar(data[idx]);}
 assert.deepEqual(JSON.parse(JSON.stringify(a.resultado())),expected(data));
 for(let i=0;i<50;i++){const idx=i*17;assert.equal(a.excluir('op'+idx),true);data.splice(data.findIndex(x=>x.op.id==='op'+idx),1);}
 assert.deepEqual(JSON.parse(JSON.stringify(a.resultado())),expected(data));
});
test('isolamento entre instâncias e limpeza ao trocar sessão',()=>{
 const a=nova(),b=nova();a.atualizar(wrap('a',10,'real'));b.atualizar(wrap('b',300,'zumbi'));
 assert.equal(a.resultado().valor,10);assert.equal(b.resultado().valor,300);
 a.limpar();assert.equal(a.resultado().qtd,0);assert.equal(b.resultado().qtd,1);
});
test('duplicidade, dados inválidos e atomicidade de reconstrução',()=>{
 const a=nova();a.atualizar(wrap('a',20,'real'));
 assert.throws(()=>a.reconstruir([wrap('x',1,'real'),wrap('x',2,'real')]),/duplicado/);
 assert.equal(a.resultado().valor,20);
 assert.throws(()=>a.atualizar(wrap('z',Infinity,'real')),/inválido/);
 assert.equal(a.resultado().qtd,1);
});
test('atualização idempotente e exclusão inexistente',()=>{
 const a=nova();a.atualizar(wrap('x',10,'falso'));a.atualizar(wrap('x',10,'falso'));
 assert.equal(a.resultado().qtd,1);assert.equal(a.resultado().risco,10);
 assert.equal(a.excluir('unknown'),false);assert.equal(a.excluir('x'),true);
 assert.equal(a.resultado().valor,0);
});
