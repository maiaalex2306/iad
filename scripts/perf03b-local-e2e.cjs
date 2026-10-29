/* PERF-03B — integração do cliente IaDNuvem com PostgREST REAL descartável.
 * Nunca aceita URL pública e nunca grava token em logs/artefatos. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path'),vm=require('node:vm');
const base=process.env.API_URL || 'http://127.0.0.1:54321';
const anon=process.env.ANON_KEY,service=process.env.SERVICE_ROLE_KEY;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)||!anon||!service)
  throw Error('Apenas Supabase local e chaves descartáveis são permitidos');
const root=path.join(__dirname,'..');
function headers(k){return {'apikey':anon,'authorization':'Bearer '+k,'content-type':'application/json'};}
async function query(uri,method,k,body,other){
  const res=await fetch(base+uri,{method,headers:{...headers(k),...(other||{})},
    body:body===undefined?undefined:JSON.stringify(body)});
  const txt=await res.text();let data=null;
  try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!res.ok)throw Error(method+' '+uri.split('?')[0]+' '+res.status+' '+String(JSON.stringify(data)).slice(0,180));
  return data;
}
async function main(){
 const salt=Date.now().toString(36);
 const email='perf03b_'+salt+'@homolog.invalid';
 const u=await query('/auth/v1/admin/users','POST',service,{
  email,password:'Perf03B!StrongPassword12345',email_confirm:true
 });
 const tenants=await query('/rest/v1/tenants?select=id','POST',service,
  [{nome:'PERF03B DELTA TESTE'}],{'Prefer':'return=representation'});
 const tenant=tenants[0].id;
 await query('/rest/v1/perfis?id=eq.'+u.id,'PATCH',service,{tenant_id:tenant,papel:'gestor'});
 const session=await query('/auth/v1/token?grant_type=password','POST',anon,
  {email,password:'Perf03B!StrongPassword12345'});
 const id1='perf03b1_'+salt,id2='perf03b2_'+salt;
 await query('/rest/v1/contas','POST',service,[
  {id:id1,tenant_id:tenant,nome:'Primeira'},
  {id:id2,tenant_id:tenant,nome:'Segunda'}
 ],{'Prefer':'return=minimal'});
 const storage=new Map();
 storage.set('iad-crm:nuvem-sessao:v1',JSON.stringify({
  user:{id:u.id,email},access_token:session.access_token,
  perfil:{tenant_id:tenant,papel:'usuario'}
 }));
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),
  removeItem:k=>storage.delete(k)};
 const state={contas:[],contatos:[],oportunidades:[],tarefas:[],produtos:[],
  segmentos:[],tiposTarefa:[],fontes:[],sinais:[],notas:[]};
 let revision=0,requests=[];
 const S={obter:()=>state,revisao:()=>revision,salvar:()=>{revision++},
  semSincronizar:f=>f(),exclusoesPendentes:()=>[],esquecerExclusoes(){}};
 const w={IADStore:S,IADConfig:{supabase:{url:base,chave:anon}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'src/nuvem.js'),'utf8'),
  {window:w,localStorage,Date,Map,Set,JSON,console,URL,Promise,fetch,encodeURIComponent});
 const N=w.IADNuvem;
 N.__trocarChamar(async (route,opts)=>{
  requests.push(route);
  if(/^\/rest\/v1\/(sinais|notas)\?/.test(route))return [];
  const method=(opts&&opts.metodo)||'GET';
  return query(route,method,session.access_token,opts&&opts.corpo,opts&&opts.cabecalhos);
 });
 const init=await N.puxar();
 assert.equal(state.contas.length,2,'primeiro snapshot');
 requests=[];
 await query('/rest/v1/contas?id=eq.'+id1,'PATCH',service,{nome:'Primeira Atualizada'});
 const delta=await N.puxar();
 assert.equal(state.contas.find(c=>c.id===id1).nome,'Primeira Atualizada');
 assert.equal(state.contas.find(c=>c.id===id2).nome,'Segunda');
 assert.ok(requests.some(p=>p.includes('iad_sync_eventos')));
 assert.ok(requests.some(p=>p.includes('contas?select=*&id=in.')));
 assert.ok(!requests.some(p=>p.includes('contas?select=*&order=id.asc')));
 requests=[];
 await query('/rest/v1/contas?id=eq.'+id1,'DELETE',service);
 const excl=await N.puxar();
 assert.equal(state.contas.length,1);
 assert.equal(state.contas[0].id,id2);
 // Um usuário normal não deve descobrir as movimentações dos colegas pelo journal.
 const spyEmail='perf03b_visivel_'+salt+'@homolog.invalid';
 const spy=await query('/auth/v1/admin/users','POST',service,{
  email:spyEmail,password:'Perf03B!StrongPassword12345',email_confirm:true
 });
 await query('/rest/v1/perfis?id=eq.'+spy.id,'PATCH',service,{tenant_id:tenant,papel:'usuario'});
 const spyToken=(await query('/auth/v1/token?grant_type=password','POST',anon,{
  email:spyEmail,password:'Perf03B!StrongPassword12345'
 })).access_token;
 const spyVersoes=await query('/rest/v1/iad_sync_versoes?select=versao','GET',spyToken);
 const spyEventos=await query('/rest/v1/iad_sync_eventos?select=registro_id,versao','GET',spyToken);
 assert.deepEqual(spyVersoes,[],'Vendedor sem acesso ao watermark compartilhado');
 assert.deepEqual(spyEventos,[],'Vendedor não pode enumerar eventos de colegas');
 const result={supabase:'local / loopback',journalOnlyGestor:true,normalUserNoMetadata:true,
 firstRecords:init,deltaEvents:delta,deleteEvents:excl,
  lastRecords:state.contas.length,parity:true,isolation:'Authenticated PostgREST/RLS'};
 fs.mkdirSync(path.join(root,'homolog-artifacts'),{recursive:true});
 fs.writeFileSync(path.join(root,'homolog-artifacts','perf03b-e2e.json'),JSON.stringify(result,null,2));
 console.log('PERF03B_REAL_DELTA '+JSON.stringify(result));
}
main().catch(e=>{console.error('PERF03B_REAL_DELTA_FAILED '+e.stack);process.exitCode=1;});
