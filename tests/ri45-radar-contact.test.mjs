import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildRadarContactIndex,safeLinkedInProfile,safeTelephone} from '../src/ri/radar-contact.mjs';
const scope={userId:'u1',role:'gestor',tenantId:'ta',token:'t1'};
const base=()=>({
 contas:[{id:'a',tenantId:'ta',nome:'Empresa A',donoId:'u1'},{id:'a',tenantId:'tb',nome:'Empresa B',donoId:'u2'}],
 contatos:[
  {id:'c1',contaId:'a',tenantId:'ta',donoId:'u1',nome:'Ana Santos',linkedin:'https://br.linkedin.com/in/ana-santos?trk=abc',telefone:'+55 (11) 99999-9999'},
  {id:'c2',contaId:'a',tenantId:'ta',donoId:'u1',nome:'Bruno Costa',linkedin:'javascript:alert(1)',telefone:'desconhecido'},
  {id:'secret',contaId:'a',tenantId:'tb',donoId:'u2',nome:'Contato Secreto',linkedin:'https://www.linkedin.com/in/secret',telefone:'11988887777'}
 ],
 oportunidades:[{
  id:'op',contaId:'a',tenantId:'ta',donoId:'u1',stakeholders:['c1','c2'],
  eventos:[{id:'evt',tipo:'decision',contatoId:'c1',titulo:'Podemos marcar uma conversa.'},
   {id:'sys',tipo:'sistema',titulo:'Conversa no LinkedIn',detalhe:'Ana Santos: Podemos marcar uma conversa.'}]
 }]
});
const item={tenantId:'ta',accountId:'a',sourceOpportunityId:'op',
 sourceEventId:'evt',evidence:'Podemos marcar uma conversa.'};
test('RI-45: registro explicitamente vinculado identifica a pessoa sem misturar contatos',()=>{
 const s=base(),before=JSON.stringify(s),get=buildRadarContactIndex({snapshot:s,scope});
 const c=get(item);
 assert.equal(c.name,'Ana Santos');
 assert.equal(c.linkedin,'https://br.linkedin.com/in/ana-santos');
 assert.equal(c.phone.href,'tel:+5511999999999');
 assert.equal(JSON.stringify(s),before,'consulta nao altera CRM');
});
test('RI-45: transcricao relaciona citacao ao evento de decisao e contato',()=>{
 const get=buildRadarContactIndex({snapshot:base(),scope});
 assert.equal(get({...item,sourceEventId:'sys'}).name,'Ana Santos');
});
test('RI-45: com contatos multiplos e sem evidencia de autoria, nao inventa pessoa',()=>{
 const s=base();s.oportunidades[0].eventos=[];const get=buildRadarContactIndex({snapshot:s,scope});
 assert.equal(get({...item,evidence:'Outra fala'}),null);
});
test('RI-45: nao mistura tenant, dono ou oportunidade',()=>{
 const s=base();const get=buildRadarContactIndex({snapshot:s,scope});
 assert.equal(get({...item,tenantId:'tb'}),null);
 assert.equal(get({...item,sourceOpportunityId:'outro'}),null);
 const admin={role:'admin',admin:true,userId:'adm',tenantId:'ta',tenantFilter:'ta',ownerFilter:'u2'};
 assert.equal(buildRadarContactIndex({snapshot:s,scope:admin})(item),null);
});
test('RI-45: suporta unico stakeholder e unico contato sem atribuir a autoria',()=>{
 const s=base();s.oportunidades[0].eventos=[];s.oportunidades[0].stakeholders=['c2'];
 let get=buildRadarContactIndex({snapshot:s,scope});
 assert.equal(get(item).name,'Bruno Costa');
 assert.equal(get(item).linkedin,null);
 assert.equal(get(item).phone,null);
 s.contatos=s.contatos.filter(c=>c.id==='c1'||c.id==='secret');s.oportunidades[0].stakeholders=[];
 get=buildRadarContactIndex({snapshot:s,scope});
 assert.match(get(item).relation,/autoria a confirmar/);
});
test('RI-45: links validados, somente HTTPS no LinkedIn e telefone seguro',()=>{
 for(const url of ['javascript:alert(1)','https://linkedin.com.evil.test/in/alguem',
 'https://user:pass@linkedin.com/in/alguem','http://linkedin.com/in/alguem',
 'https://linkedin.com/company/empresa','https://linkedin.com@evil.com/in/alguem'])
 assert.equal(safeLinkedInProfile(url),null);
 assert.equal(safeLinkedInProfile('www.linkedin.com/in/alguem'),
 'https://www.linkedin.com/in/alguem');
 assert.equal(safeTelephone('texto qualquer'),null);
 assert.deepEqual(safeTelephone('11 97526-7760'),{label:'11 97526-7760',href:'tel:11975267760'});
});
test('RI-45: tela tem contatos no cartão e mantém leitura segura',()=>{
 const view=fs.readFileSync(new URL('../src/ri/account-view.mjs',import.meta.url),'utf8');
 assert.match(view,/buildRadarContactIndex/);
 assert.match(view,/iad-ri-radar-contact/);
 assert.doesNotMatch(view,/\.innerHTML|localStorage\.setItem|Store\.salvar\(/);
 const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(sw,/\.\/src\/ri\/radar-contact\.mjs/);
});
