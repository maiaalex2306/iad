import test from 'node:test';
import assert from 'node:assert/strict';
import {mountMarketInvestigation} from '../src/ri/market-investigation.mjs';

class FakeNode {
 constructor(tag){this.tagName=tag;this.children=[];this.events={};this.textContent='';this.className='';this.disabled=false;}
 appendChild(node){this.children.push(node);return node}
 replaceChildren(...nodes){this.children=[...nodes]}
 addEventListener(name,fn){(this.events[name]??=[]).push(fn)}
}
const document={createElement:tag=>new FakeNode(tag)};
const base={nome:'Empresa A',cnpj:null,cidade:'Jacarei',uf:'SP',segmento:'Quimico'};
function prepare(company=base){
 const card=new FakeNode('section');
 const calls=[];
 const oldFetch=globalThis.fetch;
 const nuvem={sessao:()=>({access_token:'token-sintetico'}),config:()=>({url:'https://example.supabase.co',chave:'chave-publica-sintetica'})};
 const dispose=mountMarketInvestigation({card,company,doc:document,nuvem,valid:()=>true,
  provider:()=> 'OpenAI',getSequence:()=>1});
 return {card,calls,dispose,restore:()=>{globalThis.fetch=oldFetch},button:card.children.find(x=>x.tagName==='button'),panel:card.children.find(x=>x.tagName==='section')};
}
function asText(node){return [node.textContent,...node.children.map(asText)].filter(Boolean).join(' ')}
test('empresa sem CNPJ mostra botão dedicado; um clique solicita investigação por nome e nunca importa',async()=>{
 const f=prepare();
 try{
  assert.match(f.button?.textContent||'',/LOCALIZAR IDENTIDADE E CNPJ/i);
  let payload;
  globalThis.fetch=async(url,init)=>{
   payload=JSON.parse(init.body);
   assert.match(url,/\/functions\/v1\/market-search$/);
   return new Response(JSON.stringify({source:'Pesquisa teste',data:[{
    nome:'Empresa A',razaoSocial:'Empresa A',cnpj:'11222333000181',
    cidade:'Jacarei',uf:'SP',segmento:'Quimico',
    fontes:[{url:'https://example.org/empresa-a',titulo:'Cadastro público'}],
    contatos:[],noticias:[]
   }],providers:['OpenAI'],usage:[{provider:'OpenAI',webSearchRequests:2}]}),{status:200});
  };
  await f.button.events.click[0]();
  assert.equal(payload.action,'investigate');
  assert.deepEqual(payload.target,{cnpj:null,nome:'Empresa A'});
  assert.deepEqual(payload.filters,{uf:'SP',cidade:'Jacarei',segmento:'Quimico',limit:1});
  assert.match(asText(f.panel),/CNPJ relatado \(NÃO verificado\)/i);
  assert.match(asText(f.panel),/não há importação automática/i);
  assert.equal(f.panel.children.filter(x=>x.tagName==='a').length,1);
  assert.equal(f.button.disabled,true,'dois cliques não gastam cota duas vezes');
 }finally{f.dispose();f.restore()}
});
test('alvo sem município ou segmento não habilita investigação paga',()=>{
 const f=prepare({...base,cidade:''});
 try{assert.equal(f.button,undefined);assert.equal(f.card.children.length,0)}finally{f.dispose();f.restore()}
});
test('busca com CNPJ mantém modo exato, resultado não identificado não atualiza CRM',async()=>{
 const f=prepare({...base,cnpj:'11222333000181'});
 try{
  assert.match(f.button.textContent,/INVESTIGAR EMPRESA COM IA/);
  globalThis.fetch=async(_url,init)=>{
   const p=JSON.parse(init.body);assert.equal(p.target.cnpj,'11222333000181');
   return new Response(JSON.stringify({data:[],providers:['OpenAI']}),{status:200});
  };
  await f.button.events.click[0]();
  assert.match(asText(f.panel),/CNPJ exato não corroborado/i);
  assert.equal(f.panel.children.filter(x=>x.tagName==='a').length,0);
 }finally{f.dispose();f.restore()}
});
