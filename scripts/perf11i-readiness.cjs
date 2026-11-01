'use strict';
/* PERF-11I: verificador de PRÉ-CONDIÇÕES da homologação, não declaração
 * de liberação de produção. Não faz chamadas de rede ou SQL.
 * Entrada: JSON SOMENTE de contagens, flags de schema e RLS; sem PII.
 */
const fs=require('node:fs');
function validar(dados) {
  if(typeof dados?.release_readiness_report==='string') {
    dados=JSON.parse(dados.release_readiness_report);
  }
  const falhas=[];
  if(!dados||dados.schema_version!==1||typeof dados.counts!=='object'||
     typeof dados.schema!=='object'||typeof dados.rls!=='object') {
    return {status:'BLOQUEADO',codigo:'SCHEMA_RELATORIO_INVALIDO',
      prerequisitosOk:false, falhas:['O relatório de pré-voo não segue o contrato v1.']};
  }
  const c=dados.counts,s=dados.schema,r=dados.rls;
  const numero=(nome,min,descricao)=>{
    const v=c[nome];
    if(!Number.isInteger(v)||v<min)
      falhas.push({codigo:nome,necessario:min,observado:Number.isInteger(v)?v:null,descricao});
  };
  numero('auth_users',4,'Ao menos quatro identidades Auth para executar a matriz.');
  numero('profiles',4,'Ao menos quatro perfis associados a usuários Auth.');
  numero('tenants',2,'Ao menos duas empresas independentes.');
  numero('admins',1,'Pelo menos um administrador.');
  numero('managers',1,'Pelo menos um gestor de empresa.');
  numero('sellers',2,'Pelo menos dois vendedores para testar vazamentos laterais.');
  numero('opportunities',1,'Dados de teste para exercitar o CRM.');
  numero('tenant_coverage',2,'Oportunidades em duas empresas distintas.');
  for(const campo of ['iad_sync_usuario_eventos','iad_sync_usuario_versoes']) {
    if(s[campo]!==true)
      falhas.push({codigo:'schema.'+campo,necessario:true,observado:s[campo]===true,
        descricao:'Tabela obrigatória da sincronização por usuário indisponível.'});
  }
  if(r.protected_opportunities!==true)
    falhas.push({codigo:'rls.opportunities',necessario:true,observado:r.protected_opportunities,
      descricao:'RLS de oportunidades precisa estar habilitada.'});
  if(!Number.isInteger(r.tables_in_public)||r.tables_in_public<1||
     !Number.isInteger(r.without_rls)||r.without_rls!==0)
    falhas.push({codigo:'rls.all_public',necessario:0,observado:r.without_rls??null,
      descricao:'Nenhuma tabela pública deve estar sem RLS.'});
  return {
    status:falhas.length?'BLOQUEADO':'PRECONDICOES_ATENDIDAS',
    codigo:falhas.length?'AMBIENTE_INCOMPLETO':'MATRIZ_DISPONIVEL',
    prerequisitosOk:falhas.length===0, falhas,
    comentario:'Pré-condições de cenário: não atesta RLS por operação, CAS, browser autenticado, P95 real nem autoriza publicação.'
  };
}
if(require.main===module) {
  const arquivo=process.argv[2];
  if(!arquivo) {
    console.error('Uso: node scripts/perf11i-readiness.cjs arquivo-de-contagens.json');
    process.exitCode=2;
  } else {
    try {
      const o=validar(JSON.parse(fs.readFileSync(arquivo,'utf8')));
      process.stdout.write(JSON.stringify(o,null,2)+'\n');
      if(!o.prerequisitosOk)process.exitCode=2; // falha fechada, não aviso amarelo
    }catch(e) {
      console.error('Pré-voo inválido: '+e.message);
      process.exitCode=2;
    }
  }
}
module.exports={validar};
