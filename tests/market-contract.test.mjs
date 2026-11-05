import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCnpj, normalizeMarketFilters, matchCrmAccount, normalizeMarketCompanies, proposePipelineAction, buildMarketImportRequest} from '../src/ri/market-contract.mjs';
const tenantId='tenant-a',existing={id:'a1',tenantId,cnpj:'11.222.333/0001-81',nome:'Acme Indústria',razaoSocial:'Acme Indústria',site:'https://acme.example'};
test('CNPJ numerico e alfanumerico validos; DV incorreto rejeitado',()=>{
 assert.equal(normalizeCnpj('11.222.333/0001-81'),'11222333000181');
 const seed='12ABC34501DE',dv=(s,w)=>{const m=[...s].reduce((a,c,i)=>a+(c.charCodeAt(0)-48)*w[i],0)%11;return m<2?0:11-m};
 const d1=dv(seed,[5,4,3,2,9,8,7,6,5,4,3,2]),cnpj=seed+d1+dv(seed+d1,[6,5,4,3,2,9,8,7,6,5,4,3,2]);
 assert.equal(normalizeCnpj(cnpj),cnpj);assert.equal(normalizeCnpj(cnpj.slice(0,-1)+(cnpj.endsWith('0')?'1':'0')),'');
});
test('BUSCAR exige geografia, segmento e limites financeiros coerentes',()=>{
 assert.equal(normalizeMarketFilters({ddd:'012',segmento:'Químico',funcionariosMin:200}).ddd,'12');
 assert.throws(()=>normalizeMarketFilters({uf:'SP'}),/segmento/i);
 assert.throws(()=>normalizeMarketFilters({segmento:'Químico'}),/geografia/i);
 assert.throws(()=>normalizeMarketFilters({uf:'SP',segmento:'Químico',funcionariosMin:800,funcionariosMax:200}),/funcionarios/i);
 assert.throws(()=>normalizeMarketFilters({uf:'SP',segmento:'Químico',limit:10000}),/Limite/i);
});
test('tenant correto: CNPJ igual reconhecido e CNPJ fora do tenant invisivel',()=>{
 assert.equal(matchCrmAccount({cnpj:existing.cnpj},[existing],tenantId).status,'existing');
 assert.equal(matchCrmAccount({cnpj:existing.cnpj},[{...existing,tenantId:'outro'}],tenantId).status,'new');
});
test('filial da mesma raiz nao e tratada como conta identica',()=>{
 const m=matchCrmAccount({cnpj:'11222333000262'},[existing],tenantId);
 assert.equal(m.status,'related');assert.equal(m.accountId,'a1');
});
test('coincidencia de nome ou dominio exige revisao',()=>{
 assert.equal(matchCrmAccount({razaoSocial:'Acme Indústria'},[existing],tenantId).status,'review');
 assert.equal(matchCrmAccount({site:'https://acme.example'},[existing],tenantId).status,'review');
});
test('empresa retornada sem CNPJ valido nao e inventada ou incluida',()=>{
 const v=normalizeMarketCompanies([{cnpj:'11222333000181',razaoSocial:'Acme Indústria',contatos:[{nome:'Ana',cargo:'Diretora'}]},{cnpj:'invalid',razaoSocial:'Inexistente'}],{source:'fonte-test',retrievedAt:'2026-11-04'});
 assert.equal(v.length,1);assert.equal(v[0].source,'fonte-test');assert.equal(v[0].contatos[0].email,'');assert.equal(v[0].funcionariosStatus,'nao_confirmado');
});
test('plano nunca grava no CRM e aponta oportunidades existentes',()=>{
 const snapshot={contas:[existing],oportunidades:[{id:'opp1',tenantId,contaId:'a1',etapa:'Prospecção'}]},before=JSON.stringify(snapshot);
 const result=proposePipelineAction({cnpj:existing.cnpj},snapshot,{tenantId,userId:'u1'});
 assert.equal(result.operation,'review_existing');assert.equal(result.existingOpportunityId,'opp1');assert.equal(result.writePerformed,false);assert.equal(JSON.stringify(snapshot),before);
 assert.throws(()=>proposePipelineAction({},snapshot,{tenantId:'',userId:'u1'}),/escopo/i);
});
test('fontes de pesquisa web verificadas sao preservadas no dossie',()=>{
 const source='https://example.org/empresa-a';
 const v=normalizeMarketCompanies([{cnpj:'11222333000181',nome:'Empresa A',fontes:[{url:source,titulo:'Empresa A verificada'}],providers:['OpenAI','Anthropic']}],{source:'IA Web',retrievedAt:'2026-11-04'});
 assert.equal(v.length,1);assert.equal(v[0].fontes[0].url,source);
 assert.deepEqual(v[0].providers,['OpenAI','Anthropic']);
});

test('normalizacao preserva divergencias de dados das IAs para revisao comercial',()=>{
 const v=normalizeMarketCompanies([{cnpj:'11222333000181',cidade:'Jacarei',
  conflitos:[{campo:'cidade',valorOriginal:'Jacarei',valorDivergente:'Campinas',provedor:'Anthropic'}],
  territorioCorroborado:false}],{source:'IA Web'});
 assert.equal(v.length,1);
 assert.equal(v[0].territorioCorroborado,false);
 assert.equal(v[0].conflitos.length,1);
 assert.equal(v[0].conflitos[0].valorDivergente,'Campinas');
});

test('importacao exige revisao, cnpj novo, fonte e ausencia de conflitos',()=>{
 const scope={tenantId,userId:'u1'},rid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const company={cnpj:'11222333000181',nome:'Empresa A',cidade:'Jacarei',uf:'SP',segmento:'Quimico',
  fontes:[{url:'https://example.org/empresa-a'}],conflitos:[]};
 const request=buildMarketImportRequest(company,{contas:[],oportunidades:[]},scope,rid);
 assert.equal(request.p_tenant,tenantId);
 assert.equal(request.p_request_id,rid);
 assert.equal(request.p_confirmed,true);
 assert.equal(request.p_empresa.cnpj,company.cnpj);
 assert.equal(request.p_empresa.fontes[0].url,company.fontes[0].url);
 assert.throws(()=>buildMarketImportRequest({...company,conflitos:[{campo:'cidade'}]}, {contas:[]},scope,rid),/diverg|revis/i);
 assert.throws(()=>buildMarketImportRequest({...company,fontes:[]}, {contas:[]},scope,rid),/fonte/i);
 assert.throws(()=>buildMarketImportRequest(company,{contas:[existing]},scope,rid),/cadastrad|exist/i);
 assert.throws(()=>buildMarketImportRequest(company,{contas:[]},scope,'bad'),/identificador/i);
});

test('pos-importacao confirma sincronizacao local apenas depois de puxar seguro',async()=>{
 const {refreshMarketPipelineAfterImport}=await import('../src/ri/market-view.mjs');
 const calls=[];
 const nuvem={diagnosticoPendenciasCAS:()=>({disponivel:true,quantidade:0}),haMudancas:()=>false,puxar:async()=>{calls.push('puxar');}};
 const result=await refreshMarketPipelineAfterImport({nuvem,importedCount:1,valid:()=>true});
 assert.equal(result.status,'synced');
 assert.deepEqual(calls,['puxar']);
});
test('pos-importacao nao baixa carteira com CAS pendente ou diagnostico indisponivel',async()=>{
 const {refreshMarketPipelineAfterImport}=await import('../src/ri/market-view.mjs');
 let called=0;
 for(const pending of [{disponivel:true,quantidade:1},{disponivel:false,quantidade:null}]){
  const nuvem={diagnosticoPendenciasCAS:()=>pending,haMudancas:()=>false,puxar:async()=>{called++}};
  const state=await refreshMarketPipelineAfterImport({nuvem,importedCount:1,valid:()=>true});
  assert.equal(state.status,'pending');
 }
 assert.equal(called,0,'Nunca sobrescrever estado local com CAS nao reconciliado');
});
test('falha de download nao desfaz importacao confirmada no servidor',async()=>{
 const {refreshMarketPipelineAfterImport}=await import('../src/ri/market-view.mjs');
 const nuvem={diagnosticoPendenciasCAS:()=>({disponivel:true,quantidade:0}),haMudancas:()=>false,puxar:async()=>{throw Error('rede fora')}};
 const state=await refreshMarketPipelineAfterImport({nuvem,importedCount:1,valid:()=>true});
 assert.equal(state.status,'pending');
 assert.equal(state.serverCommitted,true);
});
