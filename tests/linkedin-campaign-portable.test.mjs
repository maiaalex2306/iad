import test from 'node:test';
import assert from 'node:assert/strict';
import {exportLinkedInCampaign,prepareLinkedInCampaignRestore} from '../src/linkedin-campaign-portable.mjs';
import {scopeOfLinkedIn} from '../src/linkedin-checkpoint.mjs';
const scope={userId:'gestor-01',tenantId:'tenant-01',role:'gestor',tenantFilter:'tenant-01',ownerFilter:'todos'};
const campaign='campanha-a';
function fakeQueue(n){
 const rows=Array.from({length:n},(_,i)=>({
   scope:scopeOfLinkedIn(scope),campaign,linha:i+1,
   lead:'Lead '+(i+1),empresa:'Indústria '+i,
   perfil:'https://www.linkedin.com/in/lead-'+(i+1)+'/',
   estado:'pendente'
 }));
 rows[2].estado='sem_post';
 rows[3].estado='descartado';
 rows[4].estado='confirmado';
 rows[4].postUrl='https://www.linkedin.com/posts/exemplo-atividade-123';
 rows[4].post='Um projeto de segurança hídrica que gera valor e eficiência operacional.';
 rows[4].curtidaConfirmada=true;
 rows[4].comentarioPublicado='Parabéns pela iniciativa! Segurança hídrica transforma a operação.';
 return rows;
}
function pages(rows){
 let requests=0;
 return {async readPage(from,size){
   requests++;
   return rows.filter(r=>r.linha>=from).slice(0,size);
 },get calls(){return requests}};
}
test('P0: preserva os 443 perfis e os estados ao transportar campanha entre Chrome e desktop',async()=>{
 const source=fakeQueue(443),p=pages(source),meta={campaign,valid:source.length,paused:true};
 const text=await exportLinkedInCampaign({scope,meta,selected:source[4].perfil,readPage:p.readPage});
 const parsed=JSON.parse(text);
 assert.equal(parsed.rows.length,443);
 assert.equal(parsed.paused,true);
 assert.equal(parsed.format,'iad-linkedin-checkpoint-v1');
 assert.equal(p.calls,6,'quatro páginas de 100, uma página final e teste de completude');
 assert.doesNotMatch(text,/li_at|refresh_token|password|authorization/i);
 const result=prepareLinkedInCampaignRestore(text,scope);
 assert.equal(result.rows.length,443);
 assert.equal(result.rows[0].linha,1);
 assert.equal(result.rows[442].linha,443);
 assert.equal(result.counts.valid,443);
 assert.equal(result.counts.semPost,1);
 assert.equal(result.counts.descartados,1);
 assert.equal(result.counts.curtidas,1);
 assert.equal(result.counts.confirmados,1);
 assert.equal(result.selected?.linha,5);
 assert.equal(result.paused,true);
 assert.equal(result.rows[4].estado,'confirmado');
});
test('P0: empresa ou usuário divergente não pode restaurar checkpoint',async()=>{
 const rows=fakeQueue(20),text=await exportLinkedInCampaign({
  scope,meta:{campaign,valid:20},readPage:pages(rows).readPage
 });
 for(const altered of [{...scope,tenantId:'tenant-02'},{...scope,userId:'outro'}])
   assert.throws(()=>prepareLinkedInCampaignRestore(text,altered),/outro usuário|empresa|filtro/i);
});
test('P0: bloqueia exportação parcial, duplicada ou com tenant estranho',async()=>{
 const rows=fakeQueue(150);
 await assert.rejects(()=>exportLinkedInCampaign({
  scope,meta:{campaign,valid:151},readPage:pages(rows).readPage
 }),/incompleta/i);
 await assert.rejects(()=>exportLinkedInCampaign({
  scope,meta:{campaign,valid:149},readPage:pages(rows).readPage
 }),/Quantidade|adicionais/i);
 const mismatched=rows.map(x=>({...x}));mismatched[3].scope=scopeOfLinkedIn({...scope,tenantId:'outro'});
 await assert.rejects(()=>exportLinkedInCampaign({
  scope,meta:{campaign,valid:150},readPage:pages(mismatched).readPage
 }),/escopo/i);
 const nonOrdered=rows.map(x=>({...x}));nonOrdered[4].linha=4;
 await assert.rejects(()=>exportLinkedInCampaign({
  scope,meta:{campaign,valid:150},readPage:pages(nonOrdered).readPage
 }),/ordenação/i);
});
test('P0: arquivo inválido não cria nem importa campanha',()=>{
 assert.throws(()=>prepareLinkedInCampaignRestore('{"invalid":true}',scope),/checkpoint/i);
 assert.throws(()=>prepareLinkedInCampaignRestore('a'.repeat(12*1024*1024+1),scope),/12 MiB/);
});
