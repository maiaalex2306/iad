'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {resolve}=require('node:path');
const file=pathToFileURL(resolve(__dirname,'../src/ri/account-view.mjs'));
let modulePromise;
async function select(snapshot,scope,query,limit){modulePromise??=import(file);return (await modulePromise).selectVisibleAccounts(snapshot,scope,query,limit);}
const snapshot={contas:[
 {id:'c1',tenantId:'tenant-a',donoId:'seller-1',nome:'Indústria Química Aurora',cidade:'SJC'},
 {id:'c2',tenantId:'tenant-a',donoId:'seller-2',nome:'Fábrica Verde'},
 {id:'c3',tenantId:'tenant-b',donoId:'seller-1',nome:'Empresa Secreta'},
 {id:'c4',tenantId:'tenant-a',nome:'Conta Sem Dono'}
]};
const seller={userId:'seller-1',tenantId:'tenant-a',role:'vendedor',admin:false,tenantFilter:'todas',ownerFilter:'todos'};
test('vendedor vê apenas próprias contas e contas sem dono na própria empresa',async()=>{
 const rows=await select(snapshot,seller,'',50);
 assert.deepEqual(rows.map(x=>x.id),['c1','c4']);
});
test('perfil usuario nativo do IaD equivale ao vendedor: escopo próprio e sem dono',async()=>{
 const rows=await select(snapshot,{...seller,role:'usuario'},'',50);
 assert.deepEqual(rows.map(x=>x.id),['c1','c4']);
 const wrongTenant=await select(snapshot,{...seller,role:'usuario',tenantId:'tenant-b'},'',50);
 assert.deepEqual(wrongTenant.map(x=>x.id),['c3']);
});
test('gestor vê todas as contas apenas na empresa atual',async()=>{
 const rows=await select(snapshot,{...seller,role:'gestor'},'',50);
 assert.deepEqual(rows.map(x=>x.id),['c1','c2','c4']);
});
test('admin respeita tenant escolhido e filtro de responsável',async()=>{
 const rows=await select(snapshot,{...seller,role:'admin',admin:true,tenantFilter:'tenant-b',ownerFilter:'todos'},'',50);
 assert.deepEqual(rows.map(x=>x.id),['c3']);
 const owner=await select(snapshot,{...seller,role:'admin',admin:true,tenantFilter:'todas',ownerFilter:'seller-2'},'',50);
 assert.deepEqual(owner.map(x=>x.id),['c2']);
});
test('busca ignora acentos e caixa e respeita limite de saída',async()=>{
 const rows=await select(snapshot,{...seller,role:'gestor'},'quimica',40);
 assert.deepEqual(rows.map(x=>x.id),['c1']);
 const limit=await select(snapshot,{...seller,role:'gestor'},'',1);
 assert.equal(limit.length,1);
});
test('escopo sem sessão, conta não identificada ou lista inválida é negado',async()=>{
 assert.deepEqual(await select(snapshot,{...seller,userId:''},'',50),[]);
 assert.deepEqual(await select({contas:[{id:'',tenantId:'tenant-a',nome:'Sem id'}]},seller,'',50),[]);
 assert.deepEqual(await select({contas:null},seller,'',50),[]);
});
test('não modifica os registros originais',async()=>{
 const before=JSON.stringify(snapshot);
 await select(snapshot,seller,'',50);
 assert.equal(JSON.stringify(snapshot),before);
});
test('seleção de conta após a primeira página não pode perder o registro',async()=>{
 modulePromise??=import(file);
 const {findVisibleAccount}=await modulePromise;
 const accounts=Array.from({length:120},(_,i)=>({id:'acct-'+i,tenantId:'tenant-a',donoId:'seller-1',nome:'Conta '+i}));
 assert.equal(findVisibleAccount({contas:accounts},seller,'acct-109')?.id,'acct-109');
 assert.equal(findVisibleAccount({contas:accounts},seller,'acct-999'),null);
 assert.equal(findVisibleAccount({contas:accounts},{...seller,tenantId:'tenant-b'},'acct-109'),null);
});

test('global administrator with no fixed tenant can view the authorized cross-tenant snapshot',async()=>{
 const rootAdmin={userId:'root-admin',tenantId:null,role:'admin',admin:true,tenantFilter:'todas',ownerFilter:'todos'};
 const rows=await select(snapshot,rootAdmin,'',50);
 assert.deepEqual(rows.map(x=>x.id),['c1','c2','c3','c4']);
 modulePromise??=import(file);
 assert.equal((await modulePromise).findVisibleAccount(snapshot,rootAdmin,'c3')?.id,'c3');
});
