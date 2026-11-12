'use strict';
// PERF-03D two real GoTrue users; local ephemeral Supabase ONLY.
const assert=require('node:assert/strict');
const base=process.env.API_URL||'http://127.0.0.1:54321';
const anon=process.env.ANON_KEY,service=process.env.SERVICE_ROLE_KEY;
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(base)||!anon||!service)
 throw Error('CAS E2E requires local ephemeral Supabase; no production access');
async function call(path,method,token,body){
 const r=await fetch(base+path,{method,headers:{apikey:anon,authorization:'Bearer '+token,'content-type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
 let t=await r.text();let d;try{d=JSON.parse(t)}catch{d=t}
 return {status:r.status,data:d};
}
async function success(path,method,token,body){
 const r=await call(path,method,token,body);
 assert.ok(r.status>=200&&r.status<300,method+' '+path+': '+r.status+' '+JSON.stringify(r.data).slice(0,300));
 return r.data;
}
(async()=>{
 const salt=Date.now().toString(36);
 const tenants=await success('/rest/v1/tenants','POST',service,[{nome:'CAS-A-'+salt},{nome:'CAS-B-'+salt}]);
 const ta=tenants[0].id,tb=tenants[1].id;
 async function user(tag,tenant){
  const email='p03d_'+salt+'_'+tag+'@homolog.invalid';
  const u=await success('/auth/v1/admin/users','POST',service,{email,password:'Perf03DLocal!3089922',email_confirm:true});
  await success('/rest/v1/perfis?id=eq.'+u.id,'PATCH',service,{tenant_id:tenant,papel:'usuario'});
  const tok=await success('/auth/v1/token?grant_type=password','POST',anon,{email,password:'Perf03DLocal!3089922'});
  return tok.access_token;
 }
 const a=await user('a',ta),b=await user('b',ta),c=await user('c',tb);
 const id='perf03d_'+salt;
 await success('/rest/v1/oportunidades','POST',service,{id,tenant_id:ta,titulo:'Original',valor:100,etapa:'prospeccao'});
 const cas='/rest/v1/rpc/iad_oportunidade_cas';
 const x=await success(cas,'POST',a,{p_id:id,p_tenant_id:ta,p_revisao:0,p_patch:{titulo:'Primeiro autor',valor:200}});
 assert.equal(x[0].estado,'ok');assert.equal(Number(x[0].revisao_atual),1);
 const idempotent='/rest/v1/rpc/iad_oportunidade_cas_idempotente';
 const opid='cas-retry-'+salt;
 const first=await success(idempotent,'POST',a,{p_id:id,p_tenant_id:ta,p_revisao:1,p_patch:{produto:'Confirmado'},p_operation_id:opid});
 assert.equal(first[0].estado,'ok');
 const repeated=await success(idempotent,'POST',a,{p_id:id,p_tenant_id:ta,p_revisao:1,p_patch:{produto:'Confirmado'},p_operation_id:opid});
 assert.equal(repeated[0].estado,'ok');
 assert.equal(Number(first[0].revisao_atual),Number(repeated[0].revisao_atual));
 const receiptForged=await call('/rest/v1/iad_cas_receipts','POST',a,{usuario_id:'00000000-0000-0000-0000-000000000000',tenant_id:ta,operation_id:'forged',request_hash:'x',record_id:id,revisao_atual:100});
 assert.ok(receiptForged.status>=400,'Cannot forge CAS receipts');
 const y=await success(cas,'POST',b,{p_id:id,p_tenant_id:ta,p_revisao:0,p_patch:{titulo:'Segundo autor'}});
 assert.equal(y[0].estado,'conflito_ou_inacessivel');
 const outsider=await success(cas,'POST',c,{p_id:id,p_tenant_id:ta,p_revisao:1,p_patch:{titulo:'Invasão'}});
 assert.equal(outsider[0].estado,'conflito_ou_inacessivel');
 const saved=await success('/rest/v1/oportunidades?select=titulo,valor,revisao&id=eq.'+id,'GET',a);
 assert.equal(saved[0].titulo,'Primeiro autor');assert.equal(Number(saved[0].valor),200);assert.equal(Number(saved[0].revisao),2);
 const del='/rest/v1/rpc/iad_oportunidade_excluir_cas_idempotente';
 const stale=await success(del,'POST',b,{p_id:id,p_tenant_id:ta,p_revisao:0,p_operation_id:'delete-stale-'+salt});
 assert.equal(stale[0].estado,'conflito_ou_inacessivel');
 const delReq={p_id:id,p_tenant_id:ta,p_revisao:2,p_operation_id:'delete-ok-'+salt};
 const live=await success(del,'POST',a,delReq);
 assert.equal(live[0].estado,'ok');
 const again=await success(del,'POST',a,delReq);
 assert.equal(again[0].estado,'ok','Lost deletion ACK must replay same receipt');
 const other=await success(del,'POST',b,delReq);
 assert.equal(other[0].estado,'conflito_ou_inacessivel','Other user cannot replay receipt');
 console.log('PERF03D_AUTH_CAS_PASS '+JSON.stringify({users:3,tenants:2,staleUpdateBlocked:true,crossTenantBlocked:true,staleDeleteBlocked:true,deleteConfirmed:true,productionModified:false}));
})().catch(e=>{console.error('PERF03D_AUTH_CAS_FAILED',e.stack);process.exitCode=1});
