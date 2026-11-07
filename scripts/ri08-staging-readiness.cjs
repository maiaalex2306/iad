'use strict';
/* RI-08 — portão de transporte da IA em homologação, sem credenciais.
   Um 503 não pode ser tratado como sucesso do release.
   Um 401 prova apenas que o portão Auth respondeu; NÃO prova que o modelo executa.
   A validação semântica autenticada permanece um gate operacional separado. */
const TARGET='https://bvlfzeblpewlqhssprpv.supabase.co/functions/v1/assistente';

function interpretStatus(status){
  if(status===401)return {
    ok:true, code:'AUTH_GATE_ENFORCED',
    explanation:'O transporte da IA existe e exige sessão. Prova de execução LLM autenticada ainda obrigatória.'
  };
  if(status===503)return {
    ok:false, code:'AI_PROVIDER_NOT_READY',
    explanation:'A função de homologação está sem provedor de IA configurado ou disponível (HTTP 503).'
  };
  return {
    ok:false,code:'UNEXPECTED_HTTP_STATUS',
    explanation:'Resposta inesperada do assistente sem sessão: HTTP '+String(status)+'.'
  };
}
async function main(){
  const ac=new AbortController();
  const timeout=setTimeout(()=>ac.abort(),25000);
  let status;
  try{
    const res=await fetch(TARGET,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({tipo:'diagnostico'}),signal:ac.signal
    });
    status=res.status;
    // Nunca registrar corpos, URLs de usuários, credenciais ou dados comerciais.
  }finally{clearTimeout(timeout);}
  const gate=interpretStatus(status);
  console.log('RI08_STAGING_HTTP_STATUS='+status);
  console.log('RI08_STAGING_GATE='+gate.code);
  if(!gate.ok)throw Error(gate.explanation);
  console.log(gate.explanation);
}
if(require.main===module)main().catch(error=>{
  console.error('RI08_STAGING_RELEASE_BLOCKED: '+String(error?.message||error));
  process.exitCode=1;
});
module.exports={interpretStatus};
