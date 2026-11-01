'use strict';
/* PERF-11L: testes reais de API/RLS sob 4 identidades da HOMOLOGAÇÃO.
 * Nunca conecta à produção, não escreve, não persiste credenciais/tokens.
 * Execução manual apenas; credenciais injetadas por Secrets do GitHub Actions.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ORIGIN='https://bvlfzeblpewlqhssprpv.supabase.co';
const ROLES=[
 ['admin','admin'],['gestor','gestor'],
 ['vendedor1','usuario'],['vendedor2','usuario']
];
const pct=(arr,n)=>arr.slice().sort((a,b)=>a-b)[Math.ceil(arr.length*n)-1];
function resumoTempo(vals){
 assert.ok(vals.length>=20,'P95 exige 20 medições');
 return {amostras:vals.length,p50Ms:+pct(vals,.5).toFixed(1),
   p95Ms:+pct(vals,.95).toFixed(1),maxMs:+Math.max(...vals).toFixed(1)};
}
function conferirVisibilidade(perfil,linhas,usuarioId){
 const papel=perfil.papel,tenant=perfil.tenant_id;
 for(const row of linhas){
  if(papel!=='admin' && row.tenant_id!==tenant)
    throw Error('RLS: registro de outra empresa visível');
  if(papel==='usuario' && row.dono_id && row.dono_id!==usuarioId)
    throw Error('RLS: registro de outro responsável visível');
 }
 return {visiveis:linhas.length,tenantsDistintos:new Set(linhas.map(x=>x.tenant_id)).size};
}
function apiClient(apiKey,fetchImpl=fetch){
 async function request(path,token,options={}){
  const res=await fetchImpl(ORIGIN+path,{
   method:options.method||'GET',
   headers:{apikey:apiKey,Authorization:'Bearer '+(token||apiKey),
    'content-type':'application/json'},
   body:options.body?JSON.stringify(options.body):undefined
  });
  if(!res.ok)throw Error('API de homologação recusou solicitação, HTTP '+res.status);
  return res.json();
 }
 return {request};
}
async function executar(config){
 assert.equal(config.enabled,'1','PERF11L_ENABLE=1 é obrigatório');
 assert.ok(config.key?.length>15,'Falta chave publishable/anon da homologação');
 const c=apiClient(config.key,config.fetch);
 const resultados={tipo:'PERF-11L',ambiente:'homologacao',
  testes:'GoTrue e PostgREST autenticados, leitura apenas',
  provaBrowser:false,p95PontaAPonta:false,perfis:[],rede:null};
 const sessoes=[];
 for(const [label,papel] of ROLES){
  const email=config[label+'Email'],password=config[label+'Password'];
  assert.ok(email&&password,'Falta credencial de teste '+label);
  const auth=await c.request('/auth/v1/token?grant_type=password',null,
   {method:'POST',body:{email,password}});
  assert.ok(auth.access_token&&auth.user?.id,'Login sem token de autenticação');
  const token=auth.access_token,userId=auth.user.id;
  const users=await c.request('/rest/v1/perfis?id=eq.'+encodeURIComponent(userId)+
    '&select=id,papel,tenant_id,ativo&limit=1',token);
  assert.equal(users.length,1,'Perfil não encontrado');
  const profile=users[0];
  assert.equal(profile.papel,papel,'Papel divergente do cenário '+label);
  assert.equal(profile.ativo,true,'Perfil de teste bloqueado');
  assert.ok(profile.tenant_id,'Perfil sem tenant');
  sessoes.push({label,papel,token,userId,profile});
 }
 assert.equal(new Set(sessoes.map(s=>s.userId)).size,4,
  'Identidades Auth precisam ser diferentes');
 assert.ok(new Set(sessoes.map(s=>s.profile.tenant_id)).size>=2,
  'A matriz precisa de ao menos duas empresas');
 for(const s of sessoes){
  const total={};
  for(const table of ['contas','oportunidades','tarefas']){
   const rows=await c.request('/rest/v1/'+table+'?select=id,tenant_id,dono_id&order=id.asc&limit=500',s.token);
   assert.ok(Array.isArray(rows),'Resposta inválida');
   assert.ok(rows.length<500,'Página incompleta: implementar cursor antes de aceitar');
   total[table]=conferirVisibilidade(s.profile,rows,s.userId);
  }
  const versions=await c.request('/rest/v1/iad_sync_usuario_versoes?select=tenant_id,usuario_id,versao&limit=100',s.token);
  const events=await c.request('/rest/v1/iad_sync_usuario_eventos?select=tenant_id,usuario_id,versao&limit=500',s.token);
  assert.ok(Array.isArray(versions)&&Array.isArray(events));
  if(s.papel==='usuario'){
   for(const r of [...versions,...events]){
    assert.equal(r.tenant_id,s.profile.tenant_id,'Cursor de tenant estranho');
    assert.equal(r.usuario_id,s.userId,'Journal privado de outro vendedor');
   }
  }else{
   assert.equal(versions.length,0,'Cursor privado visível a admin/gestor');
   assert.equal(events.length,0,'Evento privado visível a admin/gestor');
  }
  resultados.perfis.push({papel:s.papel,etiqueta:s.label,
   tabelas:total,cursoresPrivados:versions.length,eventosPrivados:events.length});
 }
 const admin=sessoes[0],tempos=[];
 const path='/rest/v1/oportunidades?select=id,tenant_id,dono_id&order=id.asc&limit=500';
 for(let i=0;i<30;i++){
  const start=performance.now();
  const rows=await c.request(path,admin.token);
  const total=performance.now()-start;
  assert.equal(rows.length,resultados.perfis[0].tabelas.oportunidades.visiveis);
  tempos.push(total);
 }
 resultados.rede={oportunidadesAdmin:resumoTempo(tempos)};
 resultados.estado='PASS_API_RLS';
 return resultados;
}
if(require.main===module){
 executar({enabled:process.env.PERF11L_ENABLE,key:process.env.PERF11L_STAGING_KEY,
  adminEmail:process.env.PERF11L_ADMIN_EMAIL,adminPassword:process.env.PERF11L_ADMIN_PASSWORD,
  gestorEmail:process.env.PERF11L_GESTOR_EMAIL,gestorPassword:process.env.PERF11L_GESTOR_PASSWORD,
  vendedor1Email:process.env.PERF11L_VENDEDOR1_EMAIL,vendedor1Password:process.env.PERF11L_VENDEDOR1_PASSWORD,
  vendedor2Email:process.env.PERF11L_VENDEDOR2_EMAIL,vendedor2Password:process.env.PERF11L_VENDEDOR2_PASSWORD
 }).then(r=>{
  fs.mkdirSync('perf11l-results',{recursive:true});
  fs.writeFileSync('perf11l-results/api-rls.json',JSON.stringify(r,null,2));
  console.log(JSON.stringify({estado:r.estado,rede:r.rede,perfis:r.perfis}));
 }).catch(e=>{console.error('PERF-11L BLOQUEADA: '+e.message);process.exitCode=2;});
}
module.exports={resumoTempo,conferirVisibilidade,apiClient,executar};
