'use strict';
// PERF-11M: provas deterministicas de permissao. Somente leitura em homologacao.
// IDs de fixtures artificiais sao injetados na execucao, nunca publicados em logs.
const assert=require('node:assert/strict');
function validarFixture(f){
  assert.ok(f && Array.isArray(f.identidades) && f.identidades.length===4,'Quatro identidades exigidas');
  assert.ok(Array.isArray(f.registros) && f.registros.length>=4,'Fixtures artificiais insuficientes');
  const ids=new Set(), tenants=new Set(), donos=new Set();
  for(const r of f.registros){
    assert.ok(r.id && r.tenant_id && r.dono_id && ['contas','oportunidades','tarefas'].includes(r.tabela),'Fixture invalida');
    const chave=r.tabela+':'+r.id;
    assert.ok(!ids.has(chave),'Fixture duplicada');ids.add(chave);
    tenants.add(r.tenant_id);donos.add(r.dono_id);
  }
  assert.ok(tenants.size>=2 && donos.size>=2,'Cobertura multiempresa e responsavel obrigatoria');
  const users=new Set(f.identidades.map(u=>u.id));
  assert.equal(users.size,4,'Identidades independentes obrigatorias');
  assert.ok(f.identidades.some(u=>u.papel==='admin') && f.identidades.some(u=>u.papel==='gestor') &&
    f.identidades.filter(u=>u.papel==='usuario').length===2,'Papeis obrigatorios');
  for(const u of f.identidades)assert.ok(u.id && u.tenant_id && u.token,'Identidade incompleta');
  return true;
}
function permitido(u,r){
  return u.papel==='admin' || (u.tenant_id===r.tenant_id &&
    (u.papel==='gestor'||r.dono_id===u.id));
}
async function verificarProvas({fixture,consultar}){
  validarFixture(fixture);
  assert.equal(typeof consultar,'function');
  let positivas=0,negativas=0;
  for(const u of fixture.identidades){
    for(const r of fixture.registros){
      const rows=await consultar({tabela:r.tabela,id:r.id,token:u.token});
      assert.ok(Array.isArray(rows),'Resposta nao verificavel');
      assert.ok(rows.every(row=>row.id===r.id),'API retornou ID inesperado');
      if(permitido(u,r)){
        assert.equal(rows.length,1,'Registro permitido ausente');positivas++;
      }else{
        assert.equal(rows.length,0,'Acesso proibido retornou registro');negativas++;
      }
    }
  }
  assert.ok(positivas>0 && negativas>0,'Provas positivas e negativas obrigatorias');
  return {estado:'PASS_RLS_NEGATIVE',positivas,negativas,provaBrowser:false,provaCAS:false,provaP95E2E:false};
}
module.exports={validarFixture,permitido,verificarProvas};
