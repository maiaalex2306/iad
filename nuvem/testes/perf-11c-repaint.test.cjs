'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('src/app.js','utf8');
function trecho(inicio,fim){
 const i=src.indexOf(inicio),j=src.indexOf(fim,i+inicio.length);
 assert.ok(i>=0&&j>i,'função não localizada: '+inicio);
 return src.slice(i,j);
}
function parcial(papel,remoto,hash){
 const cont={pinturas:0};
 const el={innerHTML:'não alterado',querySelector:()=>null};
 const w={scrollY:10,scrollTo(){},IADNuvem:{mandaNoAcesso:()=>true,sessao:()=>remoto?{access_token:'fake'}:null}};
 const dom={getElementById:()=>el,activeElement:null};
 const ctx={A:{atual:()=>papel?{id:'u1'}:null},
   global:w,window:w,document:dom,location:{hash},
   faixaDeAviso:()=>'',console};
 const trechoCodigo=trecho('  function repintarConteudo(', '  function repintarTarefas()');
 vm.runInNewContext(trechoCodigo+'\n;globalThis.partial=repintarConteudo;',ctx);
 const ok=ctx.partial('#/pipeline',()=>{cont.pinturas++;return 'nova tela';});
 return{ok,el,cont};
}
function executarMetodo(nome,args,ctx){
 const ini=src.indexOf('    '+nome+': function (');
 const fim=src.indexOf('\n    },',ini);
 assert.ok(ini>=0&&fim>ini,nome);
 const metodo='({'+src.slice(ini,fim+7)+'})';
 const obj=vm.runInNewContext(metodo,ctx);
 obj[nome](...args);
}
test('repintura bloqueada para usuário sem login, sessão expirada e rota diferente',()=>{
 for(const [login,sessao,hash] of [[false,true,'#/pipeline'],[true,false,'#/pipeline'],[true,true,'#/outra']]){
   const r=parcial(login,sessao,hash);
   assert.equal(r.ok,false);
   assert.equal(r.cont.pinturas,0);
   assert.equal(r.el.innerHTML,'não alterado');
 }
 const r=parcial(true,true,'#/pipeline');
 assert.equal(r.ok,true);assert.equal(r.cont.pinturas,1);
 assert.equal(r.el.innerHTML,'nova tela');
});
test('filtro local usa repintura parcial sem remontar o shell',()=>{
 let rendered=0,repainted=0,filtrado;
 const ctx={V:{pipelineFiltrar:p=>{filtrado=p;}},repintarPipeline:()=>{repainted++;return true;},
  render:()=>{rendered++;}};
 executarMetodo('pipelineCampo',['etapa','Proposta'],ctx);
 assert.deepEqual(JSON.parse(JSON.stringify(filtrado)),{etapa:'Proposta'});
 assert.equal(repainted,1);assert.equal(rendered,0);
 ctx.repintarPipeline=()=>false;
 executarMetodo('pipelineCampo',['etapa','Diagnóstico'],ctx);
 assert.equal(rendered,1,'queda segura na rota indisponível');
});
test('recorte global de administrador mantém render completo e filtros locais não',()=>{
 let rendered=0,repainted=0,filtered=0;
 const a={ehAdmin:()=>true,definirFiltros:()=>{}};
 const ctx={A:a,V:{pipelineLimparTudo(){},pipelineFiltrar(){filtered++},
    pipelineEstado:()=>({etapa:'Proposta'})},U:{fecharDialogos(){}},
  repintarPipeline:()=>{repainted++;return true},render:()=>{rendered++}};
 executarMetodo('pipelineLimpar',['tenant'],ctx);
 assert.equal(rendered,1);assert.equal(repainted,0,'empresa exige recarregar escopo');
 executarMetodo('pipelineLimpar',['etapa'],ctx);
 assert.equal(rendered,1);assert.equal(repainted,1);assert.equal(filtered,1);
});
test('barra de grupos usa repaint e conserva fallback; busca mantém debounce',()=>{
 let rendered=0,repainted=0,grupo;
 const ctx={V:{definirFiltro:g=>{grupo=g}},repintarPipeline:()=>{repainted++;return true},
    render:()=>rendered++};
 executarMetodo('filtrar',['negociacao'],ctx);
 assert.equal(grupo,'negociacao');assert.equal(repainted,1);assert.equal(rendered,0);
 assert.match(src,/App\._buscaPipeline = setTimeout\(function \(\) \{\s*if \(!repintarPipeline\(\)\) render\(\);/);
 assert.match(src,/dlg\.remove\(\);\s*if \(!repintarPipeline\(\)\) render\(\);/);
});
