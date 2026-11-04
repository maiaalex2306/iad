import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCnpj, normalizeMarketFilters, matchCrmAccount, normalizeMarketCompanies, proposePipelineAction} from '../src/ri/market-contract.mjs';
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