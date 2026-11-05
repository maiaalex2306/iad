import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMarketCompanies} from '../src/ri/market-contract.mjs';
import {buildProspectWorkflow} from '../src/ri/prospect-agents.mjs';

const scope={tenantId:'tenant-a',userId:'seller-a'};
const empty={contas:[],oportunidades:[]};
const url='https://example.org/noticia/expansao';
const raw={
 cnpj:'11222333000181',nome:'Indústria Exemplo',cidade:'Mogi das Cruzes',uf:'SP',
 segmento:'Indústria química',territorioCorroborado:true,
 qualificacaoICP:{municipio:'declarado',ddd:'declarado',segmento:'declarado',funcionarios:'declarado',statusGeral:'declarado_nao_verificado'},
 fontes:[{url:'https://example.org/empresa'}],
 contatos:[{nome:'Ana Exemplo',cargo:'Diretora Industrial',email:'ana@example.org'}],
 noticias:[{titulo:'Empresa anuncia expansão',url,data:'2026-11-05'}],
 providers:['OpenAI','Anthropic']
};
const normalize=(rows)=>normalizeMarketCompanies(rows,{source:'Teste externo',retrievedAt:'2026-11-05'});
const run=(rows,snapshot=empty,s=scope)=>buildProspectWorkflow({companies:normalize(rows),snapshot,scope:s});

test('seis agentes têm métricas reais sobre o mesmo resultado externo, sem inventar buscas',()=>{
 const a=run([raw]);
 assert.deepEqual(a.stages.map(x=>x.id),['finder','analyst','signal-hunter','enricher','qualifier','prioritizer']);
 assert.deepEqual(a.stages.map(x=>x.count),[1,1,1,1,1,1]);
 assert.equal(a.summary.shortlisted,1);
 assert.equal(a.shortlist[0].score,100);
 assert.equal(a.shortlist[0].status,'candidata_para_revisao');
 assert.equal(a.shortlist[0].evidence.contatosVerificados,0);
 assert.equal(a.shortlist[0].evidence.sinaisCompraConfirmados,0);
 assert.equal(a.networkCalls,0);assert.equal(a.writes,0);
 assert.match(a.method,/Não significa probabilidade de compra/);
});
test('notícia e insight sem URL https não viram sinal citado ou sinal de compra',()=>{
 const a=run([{...raw,noticias:[{titulo:'Aumento de produção',url:'http://localhost/teste'}],
  insights:['Eles estão prontos para comprar'],fontes:[{url:'https://example.org/empresa'}]}]);
 assert.equal(a.stages.find(x=>x.id==='signal-hunter').count,0);
 assert.equal(a.candidates[0].evidence.noticiasCitadas,0);
 assert.equal(a.candidates[0].evidence.sinaisCompraConfirmados,0);
 assert.equal(a.candidates[0].score,90);
});
test('identidade pendente, fontes não seguras e divergência bloqueiam shortlist, nunca tornam fatos verificados',()=>{
 const data=[
 {nome:'Pendente',cidade:'Mogi das Cruzes',uf:'SP',fontes:[{url:'https://example.org/p'}]},
 {...raw,cnpj:'',nome:'Outro Pendente',fontes:[{url:'https://example.org/outro'}]},
 {...raw,cnpj:'',nome:'Sem HTTPS',fontes:[{url:'http://example.org/inseguro'}]},
 {...raw,conflitos:[{campo:'cidade',valorOriginal:'Mogi',valorDivergente:'São Paulo',provedor:'Anthropic'}]}
 ];
 const a=run(data);
 assert.equal(a.summary.shortlisted,0);
 assert.equal(a.stages.length,6);
 assert.ok(a.candidates.every(x=>x.status!=='candidata_para_revisao'));
 assert.ok(a.candidates.some(x=>x.evidence.fontesCitadas===0));
 assert.ok(a.candidates.some(x=>x.evidence.conflitos===1));
});
test('não expõe conta de outro tenant nem transforma matriz/filial em novo prospect aprovado',()=>{
 const cross={id:'confidencial-outro-tenant',tenantId:'tenant-b',cnpj:raw.cnpj,nome:'Empresa Secreta'};
 const own={id:'nao-divulgar',tenantId:'tenant-a',cnpj:raw.cnpj,nome:raw.nome};
 const a=run([raw],{contas:[cross],oportunidades:[]});
 assert.equal(a.shortlist.length,1);
 assert.ok(!JSON.stringify(a).includes('confidencial-outro-tenant'));
 const b=run([raw],{contas:[cross,own],oportunidades:[]});
 assert.equal(b.shortlist.length,0);assert.equal(b.summary.existing,1);
 assert.ok(!JSON.stringify(b).includes('nao-divulgar'));
 const filial=run([{...raw,cnpj:'11222333000262'}],{contas:[own],oportunidades:[]});
 assert.equal(filial.summary.shortlisted,0);
 assert.equal(filial.candidates[0].status,'duplicidade_a_revisar');
});
test('não infere dados ausentes de decisões, contatos ou aderência ICP',()=>{
 const a=run([{cnpj:raw.cnpj,nome:'Sem Evidência',cidade:'Mogi das Cruzes',uf:'SP',
  fontes:[{url:'https://example.org/research'}],providers:['OpenAI'],
  contatos:[{nome:'Pessoa Sem Cargo'}],noticias:[],qualificacaoICP:{municipio:'pendente',funcionarios:'pendente'}}]);
 assert.equal(a.stages.find(x=>x.id==='enricher').count,1);
 assert.equal(a.stages.find(x=>x.id==='qualifier').count,0);
 assert.equal(a.candidates[0].evidence.potenciaisDecisores,0);
 assert.equal(a.candidates[0].evidence.icpDeclarados,0);
 assert.equal(a.candidates[0].evidence.contatosVerificados,0);
});
test('ordena candidatos elegíveis antes de revisão obrigatória e de já cadastradas, sem efeitos colaterais',()=>{
 const pending={nome:'Sem CNPJ',cidade:'Mogi das Cruzes',uf:'SP',fontes:[{url:'https://example.org/outro'}]};
 const duplicate={...raw,cnpj:'11222333000262',nome:'Mesmo Grupo'};
 const rows=normalize([pending,duplicate,{...raw,cnpj:'22333444000181'}]);
 const snapshot={contas:[{id:'root',tenantId:scope.tenantId,cnpj:'11222333000262',nome:'Mesmo Grupo'}],oportunidades:[]};
 const before=JSON.stringify({rows,snapshot,scope});
 const a=buildProspectWorkflow({companies:rows,snapshot,scope});
 assert.equal(JSON.stringify({rows,snapshot,scope}),before);
 assert.deepEqual(a.candidates.map(x=>x.status),['candidata_para_revisao','verificacao_obrigatoria','ja_cadastrada']);
 assert.equal(a.shortlist.length,1);
});
test('rejeita resultados acima do limite e sessões sem escopo',()=>{
 assert.throws(()=>buildProspectWorkflow({companies:[],snapshot:empty,scope:{userId:'x'}}),/autorizada/);
 assert.throws(()=>buildProspectWorkflow({companies:new Array(51).fill({}),snapshot:empty,scope}),/autorizada/);
});
test('fluxo vazio oferece etapas rastreáveis sem inventar uma shortlist',()=>{
 const a=run([]);
 assert.equal(a.stages.length,6);
 assert.equal(a.summary.candidates,0);
 assert.equal(a.shortlist.length,0);
 assert.deepEqual(a.stages.map(x=>x.count),[0,0,0,0,0,0]);
});
