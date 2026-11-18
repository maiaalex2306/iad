/* Regression: Kanban must distinguish total stage count from initially rendered cards.
 * node --test tests/pipeline-visibility-cadastro.test.cjs
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const views=fs.readFileSync(path.join(root,'src/views.js'),'utf8');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const cadastro=fs.readFileSync(path.join(root,'src/empresa-cadastro.js'),'utf8');
const store=fs.readFileSync(path.join(root,'src/store.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const config=fs.readFileSync(path.join(root,'src/config.js'),'utf8');
const begin=views.indexOf('  function kanban(resumos, totais) {');
const end=views.indexOf('  function cartaoKanban(r, etapas) {');
assert.ok(begin>=0&&end>begin,'Kanban function must be present');
let limits={};
const kanban=Function('P','U','esc','cartaoKanban','limitesKanban','TAMANHO_LOTE_KANBAN',
 views.slice(begin,end)+'\nreturn kanban;')(
 {ETAPAS:['Prospecção','Conexão','Diagnóstico','Benefícios','Proposta','Validação','Fechamento','Venda']},
 {compacto:String},String, r=>'<article>'+r.op.titulo+'</article>',limits,12);
const records=Array.from({length:19},(_,i)=>({
 op:{id:'op'+i,titulo:i===15?'Frimesa':'Conta '+i,etapa:'Diagnóstico',valor:100}
}));
test('Kanban counts all and initially renders only 12, never silently deleting Frimesa',()=>{
 const html=kanban(records,records);
 assert.match(html,/19 negociações/);
 assert.match(html,/Mostrando 12 de 19/);
 assert.match(html,/Mostrar mais negociações nesta etapa/);
 assert.doesNotMatch(html,/>Frimesa<\/article>/);
});
test('Load more reaches an item outside initial batch',()=>{
 limits.Diagnóstico=24;
 const html=kanban(records,records);
 assert.match(html,/>Frimesa<\/article>/);
 assert.match(html,/Mostrando 19 de 19/);
});
test('Server-wide search result remains visible even outside initial batch',()=>{
 const match=records.filter(x=>x.op.titulo.toLowerCase().includes('frimesa'));
 limits.Diagnóstico=12;
 const html=kanban(match,match);
 assert.match(html,/Frimesa/);
 assert.match(html,/Mostrando 1 de 1/);
});
const sandbox={window:{},console};
vm.runInNewContext(cadastro,sandbox);
const e=sandbox.window.IADEmpresaCadastro;
test('company fields and CNPJ-CEP enrichment remain present',()=>{
 for(const name of ['cnpj','cep','logradouro','numero','complemento','bairro','cidade','uf','codigoIbge','telefone'])
  assert.ok(app.includes("id: '"+name+"'")||app.includes("id:'"+name+"'"),name);
 assert.equal(e.validarCnpj('11.222.333/0001-81'),'11222333000181');
 assert.equal(e.validarCep('12.345-678'),'12345678');
});
test('enrichment never overwrites a manually filled city or uses personal phone as corporate phone',()=>{
 const diff=e.compararCampos({cidade:'Campinas',telefone:''},{cidade:'São Paulo',telefone:'11999998888'});
 assert.equal(diff.conflitos[0].key,'cidade');
 assert.equal(diff.preencher[0].key,'telefone');
 assert.ok(app.includes('telefone: lead.telefone'));
 assert.ok(app.includes('empresaTelefone'));
});
test('persistence and visual contract remain available',()=>{
 for(const name of ['cep','logradouro','numero','complemento','bairro','codigoIbge','fontesCadastro'])
  assert.ok(store.includes(name),name);
 assert.ok(views.includes('CNPJ: '));
 assert.ok(views.includes('Telefone: '));
 assert.ok(views.includes('c.logradouro'));
});
test('release version and service worker match',()=>{
 const a=config.match(/numero: '([^']+)'/);
 const b=sw.match(/const CACHE = 'iad-crm-([^']+)'/);
 assert.equal(a[1],b[1]);
 assert.ok(sw.includes('./src/empresa-cadastro.js'));
});
