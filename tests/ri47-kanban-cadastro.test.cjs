/* RI-47 v286.108 — execute: node --test tests/ri47-kanban-cadastro.test.cjs */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=read('src/views.js');
const empresaCode=read('src/empresa-cadastro.js');
const win={alert:()=>{},confirm:()=>true,fetch:()=>Promise.reject(Error('Network should not be used in unit tests'))};
win.window=win;
const sandbox={window:win,Event:class Event{constructor(type){this.type=type}},AbortController:class AbortController{
 constructor(){this.signal={};}abort(){}},setTimeout:()=>1,clearTimeout:()=>{}};
vm.runInNewContext(empresaCode,sandbox);
const Empresa=win.IADEmpresaCadastro;
const row=(etapa,i)=>({op:{id:'id-'+etapa+i,titulo:etapa==='Diagnóstico'&&i===0?'Frimesa — origem LH':'Empresa '+i,etapa,valor:0},classe:{id:'ok'},
 tarefasAtrasadas:0,conta:{nome:'Conta'},iad:0,faixa:{classe:'ok'},evidenceAge:0});
let limitePorEtapa=Object.create(null);
const start=source.indexOf('  function kanban(resumos, totais) {');
const end=source.indexOf('  function listaFechados(est)',start);
assert.ok(start>=0&&end>start,'Localizar corpo real do Kanban');
const etapaCodigo=source.slice(start,end);
const P={ETAPAS:['Prospecção','Conexão','Diagnóstico','Benefícios','Proposta','Validação','Fechamento','Venda']};
const compact=n=>String(n);
const montar=new Function('P','U','esc','tiraDecisao','estaLendo','tarjaDeAtraso','tarjaDeConversas','obterLimites',
  'const TAMANHO_LOTE_KANBAN='+Number(source.match(/const TAMANHO_LOTE_KANBAN = (\d+);/)?.[1])+';let limitesKanban=obterLimites();\n'+etapaCodigo+
 '\nreturn (r,t)=>{limitesKanban=obterLimites();return kanban(r,t);};');
const kanban=montar(P,{compacto:compact},String,()=>'',()=>false,()=>'',()=>'',()=>limitePorEtapa);
test('Kanban não esconde a Frimesa por causa de centenas de cartões em Conexão',()=>{
 const todos=[...Array.from({length:312},(_,i)=>row('Conexão',i)),...Array.from({length:8},(_,i)=>row('Diagnóstico',i))];
 const html=kanban(todos,todos);
 assert.match(html,/Frimesa — origem LH/);
 assert.match(html,/Mostrando 8 de 8/);
 assert.match(html,/Mostrando 12 de 312/);
 assert.match(html,/pipelineMaisKanban\('Conexão'\)/);
});
test('Expansão de uma coluna não expande as outras',()=>{
 limitePorEtapa=Object.create(null);
 const rows=[...Array.from({length:20},(_,i)=>row('Conexão',i)),...Array.from({length:17},(_,i)=>row('Diagnóstico',i))];
 const first=kanban(rows,rows);assert.match(first,/Mostrando 12 de 17/);
 limitePorEtapa['Diagnóstico']=16;
 const next=kanban(rows,rows);
 assert.match(next,/Mostrando 16 de 17/);assert.match(next,/Mostrando 12 de 20/);
});
test('Busca por uma empresa preserva resultado da etapa',()=>{
 const rows=[row('Diagnóstico',0)];
 assert.match(kanban(rows,rows),/Frimesa — origem LH/);
});
test('CNPJ numérico válido, inválido e CEP',()=>{
 assert.equal(Empresa.validarCnpj('11.222.333/0001-81'),'11222333000181');
 assert.equal(Empresa.validarCnpj('11.111.111/1111-11'),'');
 assert.equal(Empresa.validarCep('01001-000'),'01001000');
 assert.equal(Empresa.validarCep('010010'),'');
});
test('BrasilAPI e ViaCEP: normalização de campos',()=>{
 assert.equal(Empresa.cnpjParaCampos({cnpj:'11222333000181',razao_social:'Exemplo',ddd_telefone_1:'(11) 3333-4444'}).telefone,'1133334444');
 assert.equal(Empresa.cepParaCampos({cep:'01001-000',logradouro:'Praça da Sé',localidade:'São Paulo',uf:'SP',ibge:'3550308'}).codigoIbge,'3550308');
});
test('Conciliação nunca substitui endereço ou telefone já digitados',()=>{
 const valores={cep:'',logradouro:'',cidade:'Rio de Janeiro',telefone:'11988887777'};
 const els=Object.fromEntries(Object.entries(valores).map(([id,value])=>[id,{value,dispatchEvent(){}}]));
 const dlg={isConnected:true,querySelector:s=>els[s.match(/name="([^"]+)"/)?.[1]]||null};
 const r=Empresa.aplicarProposta(dlg,{cep:'01001000',logradouro:'Praça da Sé',cidade:'São Paulo',telefone:'1133334444'},
 {nome:'ViaCEP',url:'https://viacep.com.br/ws/01001000/json/'});
 assert.equal(r.aplicados,2);
 assert.equal(els.cidade.value,'Rio de Janeiro');
 assert.equal(els.telefone.value,'11988887777');
 assert.equal(dlg.empresaFontes.cep.provedor,'ViaCEP');
});
test('Duplicidade de CNPJ interrompe Salvar sem perder o diálogo',()=>{
 const inputs={cnpj:{value:'11.222.333/0001-81'},uf:{value:'SP'},cep:{value:'01001-000'}};
 let submit;const dlg={querySelector:q=>inputs[q.match(/name="([^"]+)"/)?.[1]]||null,
  addEventListener:(name,fn)=>{if(name==='submit')submit=fn;}};
 Empresa.ligarAoFormulario(dlg,[{id:'a1',nome:'Empresa existente',cnpj:'11222333000181'}],'a2');
 let prevent=false;
 submit({submitter:{value:'ok'},preventDefault:()=>{prevent=true;}});
 assert.equal(prevent,true);
});
test('Arquivos do shell e banco possuem os novos campos',()=>{
 const index=read('index.html'),worker=read('sw.js'),config=read('src/config.js');
 assert.match(index,/src\/empresa-cadastro\.js/);
 const numero=config.match(/numero:\s*'(v286\.\d+)'/)?.[1];
 assert.ok(numero,'versão do aplicativo declarada');
 assert.ok(worker.includes('iad-crm-'+numero),'Service Worker com versão divergente');
 assert.match(worker,/src\/empresa-cadastro\.js/);
 assert.ok(Number(numero.split('.').at(-1))>=108,'cadastro exige release >=v286.108');
 const sql=read('nuvem/ri47-cadastro-endereco.sql');
 for(const col of ['cep','logradouro','numero','complemento','bairro','codigo_ibge','fontes_cadastro'])
  assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS '+col));
});
