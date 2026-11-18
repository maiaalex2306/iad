import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyMarketTenantScope,marketTenantMessage} from '../src/ri/market-tenant-scope.mjs';
const ctx={selectedTenant:'tenant-bio',selectedUser:'actor-1'};
test('usuario autenticado do tenant selecionado pode carregar catálogo',()=>{
 const s=verifyMarketTenantScope({...ctx,profile:{tenant_id:'tenant-bio',papel:'gestor',ativo:true}});
 assert.deepEqual(s,{ok:true,code:'MATCHED'});
});
test('tenant de perfil distinto do tenant selecionado bloqueia pesquisa paga',()=>{
 const s=verifyMarketTenantScope({...ctx,profile:{tenant_id:'tenant-acp',papel:'admin',ativo:true}});
 assert.deepEqual(s,{ok:false,code:'TENANT_CONTEXT_MISMATCH'});
 assert.match(marketTenantMessage(s.code),/empresa selecionada.*diferente/i);
 assert.match(marketTenantMessage(s.code),/nenhuma IA foi chamada/i);
});
test('perfil inválido, inativo, sem tenant ou não autorizado falha fechado',()=>{
 for(const [profile,code] of [
  [null,'PROFILE_UNAVAILABLE'],
  [{tenant_id:'tenant-bio',papel:'gestor',ativo:false},'PROFILE_INACTIVE'],
  [{tenant_id:'tenant-bio',papel:'outro',ativo:true},'PROFILE_UNAUTHORIZED'],
  [{tenant_id:null,papel:'admin',ativo:true},'PROFILE_TENANT_MISSING']
 ])assert.equal(verifyMarketTenantScope({...ctx,profile}).code,code);
 assert.equal(verifyMarketTenantScope({...ctx,selectedUser:''}).ok,false);
});
test('nenhum dado de outra empresa é retornado pelo verificador',()=>{
 const s=verifyMarketTenantScope({...ctx,profile:{tenant_id:'tenant-acp',papel:'admin'}});
 assert.deepEqual(Object.keys(s).sort(),['code','ok']);
 assert.ok(!JSON.stringify(s).includes('tenant-acp'));
});
