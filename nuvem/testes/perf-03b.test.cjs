'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'src/nuvem.js'),'utf8');
function ambiente() {
  const tenant='d1111111-1111-4111-8111-111111111111',user='u1';
  const storage=new Map();
  storage.set('iad-crm:nuvem-sessao:v1',JSON.stringify({
    access_token:'synthetic',user:{id:user},perfil:{tenant_id:tenant,papel:'gestor'}
  }));
  const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  const vazio=()=>({contas:[],contatos:[],oportunidades:[],tarefas:[],produtos:[],
   segmentos:[],tiposTarefa:[],fontes:[],sinais:[],notas:[]});
  const state=vazio(),remote=vazio();
  let revision=0,version=0,requests=[],events=[],failure=false;
  const S={obter:()=>state,salvar:()=>{revision++},revisao:()=>revision,
    semSincronizar:f=>f(),exclusoesPendentes:()=>[],esquecerExclusoes(){}};
  const w={IADStore:S,IADConfig:{supabase:{url:'https://homolog.supabase.co',chave:'sb_publishable_test'}}};
  vm.runInNewContext(source,{window:w,localStorage,Date,JSON,Set,Map,Promise,console,URL,encodeURIComponent});
  const N=w.IADNuvem;
  const decode=url=>new URL(url,'https://homolog.supabase.co');
  N.__trocarChamar((url)=>{
    requests.push(url);
    const u=decode(url),t=u.pathname.split('/').at(-1);
    if(t==='iad_sync_versoes')return Promise.resolve([{versao:version}]);
    if(t==='iad_sync_eventos'){
      const cursor=Number((u.searchParams.get('versao')||'').replace('gt.',''));
      return Promise.resolve(events.filter(e=>e.versao>cursor).slice(0,300));
    }
    if(failure&&t==='oportunidades'&&u.searchParams.has('id')&&u.searchParams.get('id').startsWith('in.')){
      return Promise.reject(new Error('Falha de rede em delta'));
    }
    const value=remote[t==='tipos_tarefa'?'tiposTarefa':t];
    if(!value)throw Error('tabela inesperada '+t);
    if(u.searchParams.get('id')?.startsWith('in.')){
      const raw=u.searchParams.get('id').slice(4,-1);
      const ids=new Set(raw.split(',').map(x=>x.replace(/^"|"$/g,'')));
      return Promise.resolve(value.filter(r=>ids.has(r.id)));
    }
    const start=(u.searchParams.get('id')||'').replace('gt.','');
    const arr=value.filter(r=>r.id>start).slice(0,500);
    return Promise.resolve(arr);
  });
  const newRow=(id,valor)=>({id,tenant_id:tenant,conta_id:'c1',titulo:'Negócio '+id,
    valor,etapa:'Proposta',dims:{},eventos:[]});
  remote.oportunidades.push(newRow('op1',100));
  const change=(operacao,id,valor)=>{
    version++;
    events.push({tenant_id:tenant,versao:version,tabela:'oportunidades',registro_id:id,operacao});
    if(operacao==='D')remote.oportunidades=remote.oportunidades.filter(r=>r.id!==id);
    else{
      const i=remote.oportunidades.findIndex(r=>r.id===id);
      if(i<0)remote.oportunidades.push(newRow(id,valor));
      else remote.oportunidades[i]=newRow(id,valor);
    }
  };
  return {N,S,state,remote,change,setFail:v=>failure=v,
    clearCalls:()=>requests.splice(0),requests:()=>requests.slice()};
}
test('PERF03B baixa snapshot primeiro e depois só eventos + IDs atualizados',async()=>{
 const a=ambiente();
 assert.equal(await a.N.puxar(),1);
 assert.equal(a.state.oportunidades[0].valor,100);
 a.clearCalls();
 a.change('U','op1',400);
 const num=await a.N.puxar();
 assert.equal(num,1);
 assert.equal(a.state.oportunidades[0].valor,400);
 const calls=a.requests();
 assert.ok(calls.some(s=>s.includes('iad_sync_eventos')));
 assert.ok(calls.some(s=>s.includes('oportunidades?select=*&id=in.')));
 assert.ok(!calls.some(s=>s.includes('oportunidades?select=*&order=id.asc')));
});
test('PERF03B insere e remove oportunidade sem apagar registros independentes',async()=>{
 const a=ambiente();
 await a.N.puxar();
 a.change('I','op2',800);
 assert.equal(await a.N.puxar(),1);
 assert.equal(a.state.oportunidades.length,2);
 a.change('D','op1');
 assert.equal(await a.N.puxar(),1);
 assert.equal(a.state.oportunidades.length,1);
 assert.equal(a.state.oportunidades[0].id,'op2');
});
test('PERF03B falha em consulta de entidade aborta atomicamente e não avança cursor',async()=>{
 const a=ambiente();
 await a.N.puxar();
 a.change('U','op1',900);
 a.setFail(true);
 await assert.rejects(()=>a.N.puxar(),/Falha de rede em delta/);
 assert.equal(a.state.oportunidades[0].valor,100);
 a.setFail(false);
 await a.N.puxar(); // Reconciliação total depois da falha
 assert.equal(a.state.oportunidades[0].valor,900);
});
test('Cockpit muda somente a aba: paridade de entradas e invalidação após gravação',()=>{
 const views=fs.readFileSync(path.join(root,'src/views.js'),'utf8');
 const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
 assert.match(views,/function painelDaAbaCockpit\(id\)/);
 assert.match(views,/function resumoNoCockpit\(op\)/);
 assert.match(views,/Store\.tarefasDaOportunidade\(op\.id\)/);
 assert.match(views,/function renovarPotencial\(\) \{/);
 assert.match(app,/perf03b\.trocar-aba/);
 const bloco=app.slice(app.indexOf('abaCockpit: function (aba) {'),app.indexOf('verDiagnostico: function ()'));
 assert.match(bloco,/corpo\.innerHTML = partes\.corpo/);
 assert.match(bloco,/atual\.outerHTML = partes\.abas/);
 assert.match(bloco,/if \(aba === 'arquivos'\) pintarArquivos\(id\)/);
 assert.match(bloco,/if \(aba === 'propostas'\) pintarSoltaQuadro\(\)/);
});
test('SQL jornal de mudanças exige RLS, marcador por tenant e triggers para tabelas comerciais',()=>{
 const sql=fs.readFileSync(path.join(root,'nuvem/perf-03b-journal.sql'),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.iad_sync_versoes/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.iad_sync_eventos/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/public\.meu_tenant\(\)/);
 assert.match(sql,/ON CONFLICT \(tenant_id\) DO UPDATE/);
 assert.match(sql,/AFTER INSERT OR UPDATE OR DELETE/);
});
