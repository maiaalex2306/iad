import test from 'node:test';
import assert from 'node:assert/strict';
import {AUTOMOTIVE_BATCH_FAMILY_COUNT,isAutomotiveUmbrella,buildMarketBatchPlan,mergeMarketBatchCandidates} from '../src/ri/market-batches.mjs';
const names=[
 ['3549904','São José dos Campos'],['3554102','Taubaté'],
 ['3508504','Caçapava'],['3524402','Jacareí'],['3550704','São Sebastião']
];
const filters={uf:'SP',municipios:names.map(([codigoIBGE,nome])=>({codigoIBGE,nome,uf:'SP'})),
 segmentos:['Automotivo e Mobilidade'],faixasFuncionarios:['201_500','501_1000']};
test('RI-M24: cinco municípios × 18 famílias = 90 células reais e distintas',()=>{
 assert.equal(AUTOMOTIVE_BATCH_FAMILY_COUNT,18);
 assert.equal(isAutomotiveUmbrella(filters),true);
 const p=buildMarketBatchPlan(filters);
 assert.equal(p.length,90);
 assert.equal(new Set(p.map(x=>x.municipioIBGE+'|'+x.familyIndex)).size,90);
 for(const city of filters.municipios)
  assert.equal(p.filter(x=>x.municipioIBGE===city.codigoIBGE).length,18);
 assert.deepEqual(p[0],{municipioIBGE:'3549904',municipio:'São José dos Campos',uf:'SP',familyIndex:0});
 assert.equal(p[89].familyIndex,17);
});
test('RI-M24: a taxonomia não vaza para segmentos de outros setores nem cidades sem IBGE',()=>{
 assert.equal(buildMarketBatchPlan({...filters,segmentos:['Química e Petroquímica']}).length,0);
 assert.equal(buildMarketBatchPlan({...filters,municipios:[{codigoIBGE:'not-ibge',nome:'Outra',uf:'SP'}]}).length,0);
 assert.equal(buildMarketBatchPlan({...filters,municipios:[...filters.municipios,filters.municipios[0]]}).length,90);
});
test('RI-M24: deduplica nome+município sem CNPJ e preserva fontes HTTPS e provedores',()=>{
 const a={cnpj:null,nome:'Fornecedor de Peças',cidade:'Jacareí',uf:'SP',providers:['OpenAI'],fontes:[],fonteStatus:'pendente_sem_fonte'};
 const b={...a,nome:'Fornecedor de Pecas',providers:['Anthropic'],fontes:[{url:'https://example.org/fornecedor',titulo:'Cadastro'}],fonteStatus:'citada_pelo_provedor'};
 const merged=mergeMarketBatchCandidates([a],[b]);
 assert.equal(merged.length,1);
 assert.equal(merged[0].fonteStatus,'citada_pelo_provedor');
 assert.deepEqual(merged[0].providers,['OpenAI','Anthropic']);
 assert.equal(merged[0].fontes.length,1);
});
test('RI-M24: mesmo nome e diferentes municípios ou CNPJ permanecem entidades separadas',()=>{
 const first={cnpj:null,nome:'Grupo Fabril',cidade:'Caçapava',uf:'SP',fontes:[]};
 const other={cnpj:null,nome:'Grupo Fabril',cidade:'Taubaté',uf:'SP',fontes:[]};
 const parent={cnpj:'11222333000181',nome:'Grupo Fabril',cidade:'Caçapava',uf:'SP',fontes:[]};
 const branch={cnpj:'12345678000195',nome:'Grupo Fabril',cidade:'Caçapava',uf:'SP',fontes:[]};
 assert.equal(mergeMarketBatchCandidates([first],[other,parent,branch]).length,4);
});
test('RI-M24: entradas vazias, sem nome ou fonte insegura não criam empresa',()=>{
 const a=mergeMarketBatchCandidates([],[
  {cnpj:null,nome:'',cidade:'Caçapava',uf:'SP'},
  {cnpj:null,nome:'Fornecedor A',cidade:'Taubaté',uf:'SP',fontes:[{url:'javascript:alert(1)'}]},
 ]);
 assert.equal(a.length,1);assert.deepEqual(a[0].fontes,[]);
});
