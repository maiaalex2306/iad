'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {resumoTempo,conferirVisibilidade,apiClient,executar}=
 require('../../scripts/perf11l-auth-probe.cjs');
test('P95 estatístico é calculado sobre ao menos vinte amostras',()=>{
 const r=resumoTempo(Array.from({length:30},(_,i)=>i+1));
 assert.equal(r.amostras,30);
 assert.equal(r.p50Ms,15);
 assert.equal(r.p95Ms,29);
 assert.throws(()=>resumoTempo([10]),/20 medições/);
});
test('admin vê dois tenants, sem inferir identidades',()=>{
 assert.deepEqual(conferirVisibilidade({papel:'admin',tenant_id:'a'},
  [{tenant_id:'a',id:'1'},{tenant_id:'b',id:'2'}],'admin'),
  {visiveis:2,tenantsDistintos:2});
});
test('gestor não pode receber linhas de outra empresa',()=>{
 assert.throws(()=>conferirVisibilidade({papel:'gestor',tenant_id:'a'},
  [{tenant_id:'b',dono_id:null}],'m1'),/outra empresa/);
});
test('vendedor não pode receber linhas de outro responsável',()=>{
 const p={papel:'usuario',tenant_id:'a'};
 assert.throws(()=>conferirVisibilidade(p,[{tenant_id:'a',dono_id:'u2'}],'u1'),/outro responsável/);
 assert.equal(conferirVisibilidade(p,[{tenant_id:'a',dono_id:null},
  {tenant_id:'a',dono_id:'u1'}],'u1').visiveis,2);
});
test('API sempre aponta somente para projeto de homologação',async()=>{
 let uri,cabecalho;
 const c=apiClient('chave-publica-de-teste',(url,options)=>{
  uri=url;cabecalho=options.headers;
  return Promise.resolve({ok:true,json:()=>Promise.resolve([])});
 });
 await c.request('/rest/v1/oportunidades?select=id','token-falso');
 assert.match(uri,/^https:\/\/bvlfzeblpewlqhssprpv\.supabase\.co\//);
 assert.equal(cabecalho.Authorization,'Bearer token-falso');
});
test('sem ativação ou credenciais a execução falha antes de qualquer rede',async()=>{
 await assert.rejects(()=>executar({enabled:'0',key:'chave-publica-de-teste'}),/PERF11L_ENABLE/);
 await assert.rejects(()=>executar({enabled:'1',key:'chave-publica-de-teste'}),/Falta credencial/);
});
test('ensaio de quatro sessões reais simulado em API local isola identidade e gera P95 anonimizado',async()=>{
 const map={
  admin:{id:'uadmin',papel:'admin',tenant_id:'a'},
  gestor:{id:'umgr',papel:'gestor',tenant_id:'b'},
  vendedor1:{id:'uv1',papel:'usuario',tenant_id:'a'},
  vendedor2:{id:'uv2',papel:'usuario',tenant_id:'a'}
 };
 const registros=[
  {id:'oppA1',tenant_id:'a',dono_id:'uv1'},
  {id:'oppA2',tenant_id:'a',dono_id:null},
  {id:'oppB',tenant_id:'b',dono_id:'umgr'}
 ];
 const cred=Object.fromEntries(Object.keys(map).map(label=>[
  label+'@example.test',label]));
 let chamadas=0;
 const fetch=async(url,o)=>{
  chamadas++;
  const path=new URL(url);
  const responder=(dados)=>({ok:true,status:200,json:async()=>dados});
  if(path.pathname==='/auth/v1/token'){
   const label=cred[JSON.parse(o.body).email];
   assert.ok(label,'identidade desconhecida');
   return responder({access_token:'token-'+label,user:{id:map[label].id}});
  }
  const label=o.headers.Authorization.replace('Bearer token-','');
  const user=map[label];
  assert.ok(user);
  if(path.pathname==='/rest/v1/perfis')return responder([{...user,ativo:true}]);
  if(path.pathname.includes('iad_sync_usuario_'))return responder([]);
  const table=path.pathname.split('/')[3];
  assert.ok(['oportunidades','contas','tarefas'].includes(table));
  const filtered=registros.filter(r=>user.papel==='admin' ||
    (user.tenant_id===r.tenant_id && (user.papel==='gestor'||
      r.dono_id===null||r.dono_id===user.id)));
  return responder(filtered);
 };
 const c={enabled:'1',key:'chave-publica-de-teste',fetch};
 for(const label of Object.keys(map)){
  c[label+'Email']=label+'@example.test';c[label+'Password']='senha-ficticia';
 }
 const r=await executar(c);
 assert.equal(r.estado,'PASS_API_RLS');
 assert.equal(r.provaBrowser,false);
 assert.equal(r.p95PontaAPonta,false);
 assert.equal(r.perfis.length,4);
 assert.equal(r.rede.oportunidadesAdmin.amostras,30);
 assert.ok(chamadas>=4*5+30);
 const dump=JSON.stringify(r);
 for(const segredo of ['senha-ficticia','token-admin','uadmin','uv1','@example.test'])
  assert.ok(!dump.includes(segredo),'vazamento: '+segredo);
});
