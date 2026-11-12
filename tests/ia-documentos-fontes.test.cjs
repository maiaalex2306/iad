'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('src/app.js','utf8');
const store=fs.readFileSync('src/store.js','utf8');
const ui=fs.readFileSync('src/ui.js','utf8');

test('fontes repetidas são exibidas uma vez por empresa e nome normalizado',()=>{
 const a=app.indexOf('  function fontesParaSelecao(');
 const b=app.indexOf('  function campoDeFonte(',a);
 assert.ok(a>=0&&b>a);
 const ctx={Map,Array,String};
 vm.createContext(ctx);
 vm.runInContext(app.slice(a,b),ctx);
 const fontes=[
  {id:'f1',nome:'LinkedIn',tenantId:'empresa1'},
  {id:'f2',nome:'  LINKEDIN ',tenantId:'empresa1'},
  {id:'f3',nome:'LínkedIn',tenantId:'empresa1'},
  {id:'f4',nome:'LinkedIn',tenantId:'empresa2'},
  {id:'f5',nome:'Indicação',tenantId:'empresa1'}
 ];
 const lista=ctx.fontesParaSelecao(fontes,'f2','empresa1');
 assert.equal(lista.length,2);
 assert.equal(lista.find(x=>x.rotulo.trim().toLowerCase()==='linkedin').valor,'f2');
 assert.equal(lista.find(x=>x.rotulo==='Indicação').valor,'f5');
 const nova=ctx.fontesParaSelecao(fontes,'','empresa1');
 assert.equal(nova.length,2);
 assert.equal(nova.some(x=>x.valor==='f4'),false);
});
test('fonte repetida nunca é descartada ou desreferenciada automaticamente',()=>{
 assert.match(app,/function fontesParaSelecao/);
 assert.doesNotMatch(app.slice(app.indexOf('function fontesParaSelecao'),app.indexOf('function camposOportunidade')),/removerDoCatalogo|registrarExclusao|\.splice\(/);
 assert.match(store,/nome === 'fontes'[\s\S]*?achatar\(i\.nome\) === achatar\(item\.nome\)/);
});
test('IA de oportunidade usa teto maior e amostra o início e o fim dos PDFs',()=>{
 const a=ui.indexOf('        /* A Edge Function aceita até 40 mil');
 const b=ui.indexOf('        if (texto.length < 12)',a);
 assert.ok(a>=0&&b>a);
 const trecho=ui.slice(a,b);
 assert.match(trecho,/oportunidade/);
 assert.match(trecho,/38000/);
 assert.match(trecho,/slice\(0,frente\)/);
 assert.match(trecho,/slice\(-tras\)/);
 assert.match(trecho,/avisoCorte/);
 assert.match(ui,/documento\(s\) tiveram trechos omitidos/);
});


test('3 PDFs longos: cada arquivo entra com início e conclusão, respeitando 38 mil',()=>{
 const a=ui.indexOf('        /* A Edge Function aceita até 40 mil');
 const b=ui.indexOf('        if (texto.length < 12)',a);
 const trecho=ui.slice(a,b);
 const docs=['Dossie.pdf','Resumo1.pdf','Resumo2.pdf'].map((nome,i)=>({
   nome,texto:'INICIO_'+i+' '+('A'.repeat(18000))+' FIM_'+i
 }));
 const context={c:{extrair:'oportunidade'},digitado:'',comTexto:docs,Math,String,Array};
 vm.createContext(context);
 vm.runInContext(trecho+'globalThis.resultadoIA={texto,avisoCorte,cortados};',context);
 const r=context.resultadoIA;
 assert.ok(r.texto.length<=38000);
 assert.equal(r.cortados,3);
 for(let i=0;i<3;i++){
   assert.ok(r.texto.includes('=== '+docs[i].nome+' ==='));
   assert.ok(r.texto.includes('INICIO_'+i));
   assert.ok(r.texto.includes('FIM_'+i));
 }
 assert.match(r.avisoCorte,/3 de 3/);
});
test('um só texto digitado nunca estoura limite do envio',()=>{
 const a=ui.indexOf('        /* A Edge Function aceita até 40 mil');
 const b=ui.indexOf('        if (texto.length < 12)',a);
 const context={c:{extrair:'oportunidade'},digitado:'Z'.repeat(60000),comTexto:[],Math,String,Array};
 vm.createContext(context);
 vm.runInContext(ui.slice(a,b)+'globalThis.preparo=texto;',context);
 assert.equal(context.preparo.length,38000);
});
