'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const performanceSource=fs.readFileSync(path.join(root,'src/performance.js'),'utf8');
const nuvemSource=fs.readFileSync(path.join(root,'src/nuvem.js'),'utf8');
const segredo='HEINEKEN_SIGILOSO_NAO_EXPORTAR_89483';
function ambiente(){
  let now=100, falhar=false;
  const chamadas=[];
  const storage=new Map();
  /* P0: neste teste de rede, a fila CAS precisa estar verificada e vazia.
     A ausencia de sessao CAS agora bloqueia corretamente o download. */
  storage.set('iad-crm:nuvem-sessao:v1',JSON.stringify({
    access_token:'test-token',
    user:{id:'test-user'},
    perfil:{tenant_id:'test-tenant',papel:'usuario'}
  }));
  const localStorage={
    getItem:k=>storage.get(k)||null,
    setItem:(k,v)=>storage.set(k,String(v)),
    removeItem:k=>storage.delete(k)
  };
  const store={obter:()=>({contas:[],contatos:[],oportunidades:[],tarefas:[]}),
    semSincronizar:fn=>fn(),salvar:()=>{}};
  const w={performance:{now:()=>now},localStorage,
    IADConfig:{supabase:{url:'https://supabase-ficticio.example.test',chave:'public-test-key'}},
    IADStore:store,
    IADCAS:{},
    IADCASQueue:{create:()=>({pending:()=>[]})},
    console};
  const fetch=function(url,opcoes){
    chamadas.push({url,metodo:opcoes.method});
    now+=5;
    if(falhar)return Promise.reject(new Error('REDE_DE_TESTE_'+segredo));
    return Promise.resolve({ok:true,status:200,text:function(){
      now+=7;
      return Promise.resolve(JSON.stringify({teste:true,retorno:segredo}));
    }});
  };
  const env={window:w,localStorage,fetch,Date,Set,Map,Promise,JSON,Math,Number,console};
  vm.runInNewContext(performanceSource,env,{filename:'performance.js'});
  vm.runInNewContext(nuvemSource,env,{filename:'nuvem.js'});
  return {P:w.IADPerformance,N:w.IADNuvem,chamadas,
    adicionarMs:ms=>{now+=ms;},falhar:v=>{falhar=v}};
}

test('PERF-23 desativada: mesma Promise, sem leituras ou exportacao',async()=>{
  const e=ambiente();
  const original=Promise.resolve({marcador:segredo});
  assert.strictEqual(e.P.medirPromessa('perf23.privado',()=>original),original);
  assert.strictEqual(await e.N.eu().then(x=>x.teste),true);
  assert.deepEqual(Object.keys(e.P.relatorio(true)),[]);
  assert.doesNotMatch(e.P.exportarJSON(),new RegExp(segredo));
});

test('PERF-23 Promises: p50/p95 exatos, retorno e rejeicao idênticos',async()=>{
  const e=ambiente();
  e.P.iniciar();
  for(let i=1;i<=100;i++){
    const r=await e.P.medirPromessa('perf23.teste',()=>{
      e.adicionarMs(i);return Promise.resolve(i);
    });
    assert.equal(r,i);
  }
  const rel=e.P.relatorio(true)['perf23.teste'];
  assert.equal(rel.chamadas,100);
  assert.equal(rel.p50Ultimas100Ms,50);
  assert.equal(rel.p95Ultimas100Ms,95);
  const erro=new Error(segredo);
  await assert.rejects(e.P.medirPromessa('perf23.falha',()=>Promise.reject(erro)),x=>x===erro);
  assert.throws(()=>e.P.medirPromessa('perf23.falha',()=>{throw erro}),x=>x===erro);
  assert.equal(e.P.relatorio(true)['perf23.falha'].chamadas,2);
  assert.doesNotMatch(e.P.exportarJSON(),new RegExp(segredo));
  e.P.parar();
  const antes=e.P.relatorio(true)['perf23.falha'].chamadas;
  await assert.rejects(e.P.medirPromessa('perf23.falha',()=>Promise.reject(erro)),x=>x===erro);
  assert.equal(e.P.relatorio(true)['perf23.falha'].chamadas,antes);
});

test('PERF-23 HTTP real do módulo: agrupar auth, rest e functions sem rotas sensíveis',async()=>{
  const e=ambiente();
  e.P.iniciar();
  const u=await e.N.eu();
  const rest=await e.N.sondarTabela('contas_'+segredo,['id']);
  const funcoes=await e.N.chamarFuncao('privado_'+segredo,{conteudo:segredo});
  assert.equal(u.retorno,segredo);
  assert.equal(rest.retorno,segredo);
  assert.equal(funcoes.retorno,segredo);
  assert.equal(e.chamadas.length,3);
  const rel=e.P.relatorio(true);
  for(const grupo of ['auth','rest','functions']){
    assert.equal(rel['perf23.rede.'+grupo].chamadas,1);
    assert.equal(rel['perf23.rede.'+grupo].p95Ultimas100Ms,12);
  }
  const serializado=e.P.exportarJSON();
  assert.doesNotMatch(serializado,new RegExp(segredo));
  assert.doesNotMatch(serializado,/https?:\/\//);
  assert.doesNotMatch(serializado,/apikey|Authorization|Bearer|contas_/i);
  assert.match(serializado,/perf23\.rede\.rest/);
});

test('PERF-23 rede falha: mantém erro original do cliente e registra duração',async()=>{
  const e=ambiente();
  e.P.iniciar();e.falhar(true);
  await assert.rejects(e.N.eu(),/Não foi possível falar com o servidor/);
  assert.equal(e.P.relatorio(true)['perf23.rede.auth'].chamadas,1);
  assert.doesNotMatch(e.P.exportarJSON(),new RegExp(segredo));
});

test('PERF-23 puxar com Supabase indisponível: erro preservado e sync medido',async()=>{
  const e=ambiente();e.P.iniciar();e.falhar(true);
  const antes=e.N.estadoCarga();
  await assert.rejects(e.N.puxar(),/Não foi possível falar com o servidor/);
  const rel=e.P.relatorio(true);
  assert.equal(rel['perf23.sync.puxar'].chamadas,1);
  assert.ok(rel['perf23.rede.rest'].chamadas>=1);
  assert.equal(e.N.estadoCarga().ativa,false);
  assert.equal(antes.ativa,false);
  assert.doesNotMatch(e.P.exportarJSON(),new RegExp(segredo));
});

test('PERF-23 opt-in e metodologia: mantém guardas de segurança do roteador',()=>{
  const s=nuvemSource;
  assert.match(s,/function chamar\(caminho, opcoes\)/);
  assert.match(s,/if \(substitutoDeTeste\) return substitutoDeTeste/);
  assert.match(s,/perf23\.sync\.entrada/);
  assert.match(s,/perf23\.sync\.manual/);
  assert.match(s,/perf23\.sync\.puxar/);
  assert.match(s,/perf23\.rede\./);
  assert.match(performanceSource,/function medirPromessa\(nome, operacao\)/);
  const e=ambiente();e.P.iniciar();
  assert.match(e.P.exportarJSON(),/intervalos de rede podem se sobrepor/);
});
