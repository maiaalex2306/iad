'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validarFixture,verificarProvas,permitido}=require('../../scripts/perf11m-rls-negative.cjs');
const pessoas=[
{id:'adm',papel:'admin',tenant_id:'a',token:'token-admin'},
{id:'mgr',papel:'gestor',tenant_id:'b',token:'token-gestor'},
{id:'v1',papel:'usuario',tenant_id:'a',token:'token-v1'},
{id:'v2',papel:'usuario',tenant_id:'a',token:'token-v2'}
];
const registros=[
{tabela:'oportunidades',id:'a1',tenant_id:'a',dono_id:'v1'},
{tabela:'oportunidades',id:'a2',tenant_id:'a',dono_id:'v2'},
{tabela:'contas',id:'b1',tenant_id:'b',dono_id:'mgr'},
{tabela:'tarefas',id:'b2',tenant_id:'b',dono_id:'mgr'}
];
const fixture={identidades:pessoas,registros};
const consultar=async ({tabela,id,token})=>{
 const u=pessoas.find(x=>x.token===token),r=registros.find(x=>x.tabela===tabela&&x.id===id);
 return r&&permitido(u,r)?[{id:r.id}]:[];
};
test('fixture requer 4 identidades e dois tenants',()=>{
 assert.equal(validarFixture(fixture),true);
 assert.throws(()=>validarFixture({...fixture,identidades:pessoas.slice(1)}),/Quatro/);
 assert.throws(()=>validarFixture({...fixture,registros:registros.map(r=>({...r,tenant_id:'a'}))}),/multiempresa/);
});
test('provas positivas e negativas deterministicas',async()=>{
 const r=await verificarProvas({fixture,consultar});
 assert.equal(r.estado,'PASS_RLS_NEGATIVE');
 assert.ok(r.positivas>0&&r.negativas>0);
 assert.equal(r.provaBrowser,false);
});
test('resposta vazia para todos os usuarios falha fechado',async()=>{
 await assert.rejects(()=>verificarProvas({fixture,consultar:async()=>[]}),/permitido ausente/);
});
test('API que ignora RLS falha por registro proibido',async()=>{
 await assert.rejects(()=>verificarProvas({fixture,consultar:async ({id})=>[{id}]}),/proibido/);
});
test('resposta mal formada falha fechado',async()=>{
 await assert.rejects(()=>verificarProvas({fixture,consultar:async()=>null}),/verificavel/);
});
test('nao retorna tokens nem identificadores ao relatorio',async()=>{
 const result=await verificarProvas({fixture,consultar});
 const dump=JSON.stringify(result);
 assert.ok(!dump.includes('token-')&&!dump.includes('a1')&&!dump.includes('v1'));
});
