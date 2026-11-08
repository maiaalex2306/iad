'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const chapters=[
 ['m-guia-v28697','manualDoGuiaAtual','Guia de operação: da oportunidade'],
 ['m-radar-28697','manualDoRadarDetalhado','Pistas da carteira — instruções'],
 ['m-mercado-operacional','manualDoMercadoPassoAPasso','Inteligência de Mercado — pesquisa externa'],
 ['m-maquina-prospeccao','manualDaMaquinaProspeccao','Máquina de Prospecção'],
 ['m-linkedin-operacao','manualDoLinkedinOperacional','LinkedIn — três fluxos'],
 ['m-nuvem-integridade','manualDaSincronizacaoAtual','Persistência e recuperação'],
 ['m-papeis-empresas','manualDePermissoesAtual','Perfis, empresas e acesso'],
 ['m-ia-servicos','manualDosServicosIA','Assistente e pesquisa externa'],
 ['m-operacao-rapida','manualDaResolucaoOperacional','Diagnóstico rápido'],
 ['m-tecnologia-perf','manualDaArquiteturaDetalhada','Como a arquitetura sustenta']
];
test('MAN-97: todos os novos capítulos aparecem uma vez e no índice navegável',()=>{
 const src=read('src/views-manual.js'),doc=read('docs/MANUAL-COMPLETO-v28697.md');
 const index=src.slice(src.indexOf('const SECOES_DO_MANUAL = ['),src.indexOf('function manualDasNovidades()'));
 for(const [id,fn,title] of chapters){
  assert.match(src,new RegExp('function '+fn+'\\(\\)'));
  assert.equal((index.match(new RegExp('"'+id+'"','g'))||[]).length,1,'indice: '+id);
  assert.match(src,new RegExp('id=\\\\?"'+id+'\\\\?"'));
  assert.ok(doc.includes(title),'documento tecnico: '+id);
 }
 for(const id of ['m-regra','m-oito','m-caminho','m-dia','m-tarefa','m-contar','m-pipeline','m-ia']){
  assert.ok(src.includes("'"+id+"'")||src.includes('id="'+id+'"')||src.includes('id=\\"'+id+'\\"'),'capítulo historico: '+id);
 }
 assert.match(src,/SECOES_DO_MANUAL\.slice\(0,16\)/);
 assert.match(src,/SECOES_DO_MANUAL\.slice\(16\)/);
 assert.match(src,/<details/);
 assert.match(src,/<summary>/);
});
test('MAN-97: versões, cache e carregamento lazy são coerentes',()=>{
 const src=read('src/views-manual.js'),config=read('src/config.js'),sw=read('sw.js'),app=read('src/app.js');
 new vm.Script(src,{filename:'src/views-manual.js'});
 new vm.Script(sw,{filename:'sw.js'});
 assert.match(config,/numero:\s*'v286\.97'/);
 assert.match(sw,/const CACHE = 'iad-crm-v286\.97'/);
 assert.match(sw,/'\.\/src\/views-manual\.js'/);
 assert.doesNotMatch(read('index.html'),/<script[^>]*views-manual\.js/);
 assert.match(app,/carregarOpcional\('IADViewsManual', 'views-manual\.js'\)/);
 assert.ok(src.length<275000,'Evitar crescimento ilimitado do módulo lazy');
});
test('MAN-97: diferencia hipótese de compra, cadastro recente e pesquisa externa',()=>{
 const m=read('src/views-manual.js'),doc=read('docs/MANUAL-COMPLETO-v28697.md');
 for(const term of ['NOVO REGISTRO · REVISAR','Entradas de hoje','12 cartões',
  'data local','Ver mais','Telefone','LinkedIn','CNPJ','Finder','Analyst',
  'Signal Hunter','Enricher','Qualifier','Prioritizer','100 MiB','IndexedDB',
  'HTTP 503','CAS','RLS']){
  assert.ok(m.includes(term),'Capítulo não aborda: '+term);
  assert.ok(doc.includes(term),'Manual técnico não aborda: '+term);
 }
 assert.match(m,/importação automática da pesquisa externa está desabilitada no piloto/);
 assert.match(m,/não é chance de compra/);
 assert.match(m,/não lê o DOM do LinkedIn/);
 assert.match(m,/não equivale a compra confirmada/);
});
test('MAN-97: README não repete arquitetura obsoleta',()=>{
 const r=read('README.md');
 assert.match(r,/IAD possui oito dimensões, cada uma de 0 a 4 pontos \(total 0 a 32\)/);
 assert.match(r,/O CRM completo não é uma base offline independente/);
 assert.match(r,/importação bloqueada no piloto/);
 assert.match(r,/MANUAL-COMPLETO-v28697\.md/);
 assert.doesNotMatch(r,/IAD de 0 a 16/);
});
