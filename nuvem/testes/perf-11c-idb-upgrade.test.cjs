'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/arquivos.js','utf8');
function fakeDB(rows){
 const dados=rows.map(r=>Object.assign({},r));
 const indexed=new Set(['oportunidadeId']);
 const seen=[];
 const asyncReq=ret=>{const req={};queueMicrotask(()=>{req.result=ret;req.onsuccess?.();});return req;};
 const store={
  indexNames:{contains:s=>indexed.has(s)},
  createIndex:(name,field,config)=>{
   assert.equal(config.unique,false);
   indexed.add(name);return{name};
  },
  index:name=>{
   assert.ok(indexed.has(name));
   return{getAll:value=>{seen.push(name);
    return asyncReq(dados.filter(row=>row[name]===value).map(row=>Object.assign({},row)));
   }};
  },
  getAll:()=>{seen.push('all');return asyncReq(dados.map(r=>Object.assign({},r)))},
  put:r=>{const i=dados.findIndex(x=>x.id===r.id);if(i<0)dados.push(r);else dados[i]=r;}
 };
 const db={
  objectStoreNames:{contains:n=>n==='meta'||n==='dados'},
  createObjectStore:()=>{throw Error('upgrade não deveria recriar armazenamento existente');},
  transaction:(names,mode)=>{
   const tx={objectStore:()=>store};
   if(mode==='readwrite')queueMicrotask(()=>tx.oncomplete?.());
   return tx;
  },
  close:()=>{db.closed=true}
 };
 const api={open:(name,version)=>{
  assert.equal(name,'iad-crm-arquivos');assert.equal(version,2);
  const req={};
  queueMicrotask(()=>{
   req.result=db;req.transaction={objectStore:()=>store};
   req.onupgradeneeded?.({oldVersion:1,newVersion:2});
   queueMicrotask(()=>req.onsuccess?.());
  });
  return req;
 }};
 const w={indexedDB:api,IADStore:{uid:()=> 'new',hoje:()=> '2026-11-01'}};
 const ctx={window:w,indexedDB:api,Promise,console,URL,setTimeout};
 vm.runInNewContext(source,ctx,{filename:'arquivos.js'});
 return{w,db,indexed,seen,dados};
}
test('migração realista IndexedDB v1→v2 preserva dados e cria dois novos índices',async()=>{
 const rows=[
  {id:'a',oportunidadeId:'o1',contaId:'c1',tarefaId:'t1',data:'2026-11-01',tamanho:18},
  {id:'b',oportunidadeId:'o2',contaId:'c1',tarefaId:'t2',data:'2026-11-02',tamanho:30},
  {id:'c',oportunidadeId:'o1',contaId:'c3',tarefaId:'t3',data:'2026-11-03',tamanho:12}
 ];
 const f=fakeDB(rows),A=f.w.IADArquivos;
 const a=await A.listar('o1');
 assert.deepEqual(a.map(x=>x.id).sort(),['a','c']);
 assert.deepEqual([...f.indexed].sort(),['contaId','oportunidadeId','tarefaId']);
 assert.deepEqual(f.dados,rows,'migração não pode mexer nos metadados');
 assert.deepEqual((await A.listar({contaId:'c1'})).map(x=>x.id).sort(),['a','b']);
 assert.equal((await A.listar({tarefaId:'t3'}))[0].id,'c');
 assert.deepEqual(f.seen,['oportunidadeId','contaId','tarefaId']);
 assert.equal((await A.uso()).bytes,60);
 assert.equal(f.seen[3],'all');
});
test('onblocked de outra aba falha explicitamente, sem apagar IndexedDB',async()=>{
 const api={open:()=>{
  const req={};queueMicrotask(()=>req.onblocked?.());return req;
 }};
 const w={indexedDB:api};
 vm.runInNewContext(source,{window:w,indexedDB:api,Promise,console,URL,setTimeout});
 await assert.rejects(w.IADArquivos.listar('o1'),/Feche outras abas/);
});
test('onversionchange fecha conexão antiga sem excluir armazenamento',async()=>{
 const f=fakeDB([{id:'a',oportunidadeId:'o1',data:'2026-11-01'}]);
 assert.equal((await f.w.IADArquivos.listar('o1')).length,1);
 assert.equal(typeof f.db.onversionchange,'function');
 f.db.onversionchange();
 assert.equal(f.db.closed,true);
});
