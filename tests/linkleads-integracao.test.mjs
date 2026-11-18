/* LinkLeads × ponte: o mesmo balde, dois botões, cada um com o que é seu.
   Carrega o código real do navegador (playbook.js e integracoes.js) num
   contexto isolado, com fetch e Store falsos. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function carregar(itens){
  const pedidos=[];
  const ctx={console,URL,URLSearchParams,encodeURIComponent,
    fetch:async(url,opts={})=>{pedidos.push({url,opts});return {ok:true,status:200,json:async()=>({itens})};}};
  ctx.window=ctx;ctx.globalThis=ctx;
  ctx.IADStore={
    contexto:()=>({usuario:{id:'u'},admin:false,tenantId:'bwc-vale',filtros:{}}),
    obter:()=>({tenants:[{id:'bwc-vale',nome:'Bio Water Care',ponteUrl:'https://ponte.example/',ponteChave:'leitura'}]})
  };
  vm.createContext(ctx);
  for(const f of ['src/playbook.js','src/integracoes.js'])vm.runInContext(readFileSync(f,'utf8'),ctx,{filename:f});
  return {I:ctx.IADIntegracoes,pedidos};
}

const lh={id:'lh-1',recebidoEm:'2026-11-08T10:00:00Z',dados:{full_name:'Carlos Lima',profile_url:'https://www.linkedin.com/in/carlos/',
  organization_1:'Hidro Sul',my_full_name:'Rosa SDR',message1_from:'Rosa SDR',message1_text:'Olá Carlos',
  message2_from:'Carlos Lima',message2_text:'Pode mandar o material'}};
const ll={id:'ll-1',recebidoEm:'2026-11-08T11:00:00Z',dados:{full_name:'Ana Silva',profile_url:'https://www.linkedin.com/in/ana-silva/',
  organization_1:'Águas do Vale',organization_title_1:'Diretora de Operações',member_distance:'DISTANCE_1',my_full_name:'Alexandre (LinkLeads)',
  message1_from:'Alexandre (LinkLeads)',message1_text:'Como vocês medem as perdas?',message1_send_at_iso:'2026-11-07T10:00:00Z',
  message2_from:'Ana Silva',message2_text:'Tenho interesse, podemos falar semana que vem?',message2_send_at_iso:'2026-11-08T09:00:00Z',
  campaign:'Prospecção Saneamento',linkleads_origem:'linkleads',linkleads_event:'reply_received',
  linkleads_papel:'Decisor econômico',linkleads_papel_confirmado:1,linkleads_reply_label:'interessado',
  linkleads_reply_summary:'Quer conversar',linkleads_committee:'Águas do Vale: Decisor econômico'}};

test('cada botão leva só o que é seu, do mesmo balde da empresa',async()=>{
  const {I,pedidos}=carregar([lh,ll]);
  const doLH=await I.buscar();
  const doLL=await I.buscar('linkleads');
  assert.deepEqual(doLH.map(l=>l.nome),['Carlos Lima']);
  assert.deepEqual(doLL.map(l=>l.nome),['Ana Silva']);
  assert(pedidos.every(p=>/token=leitura/.test(p.url)&&/e=bwc-vale/.test(p.url)),'lê o balde da empresa com a chave de leitura');
});

test('item do LinkLeads: papel confirmado, leitura da IA e conversa com autoria certa',async()=>{
  const {I}=carregar([ll]);
  const [a]=await I.buscar('linkleads');
  assert.equal(a.origem,'linkleads');
  assert.equal(a.papelLinkLeads,'Decisor econômico');
  assert.equal(a.papelConfirmado,true);
  assert.equal(a.rotuloLinkLeads,'interessado');
  assert.equal(a.empresa,'Águas do Vale');
  assert.equal(a.cargo,'Diretora de Operações');
  assert.equal(a.resposta,'Tenho interesse, podemos falar semana que vem?');
  assert.equal(a.mensagensDele,1,'a mensagem enviada pelo LinkLeads não vira evidência do cliente');
  assert.equal(a.conversa[0].nosso,true);
});

test('papel fora do playbook vira vazio, nunca papel inventado',async()=>{
  const {I}=carregar([{...ll,dados:{...ll.dados,linkleads_papel:'Rei do mundo'}}]);
  const [a]=await I.buscar('linkleads');
  assert.equal(a.papelLinkLeads,'');
});

test('item do Linked Helper continua igual (origem lh, sem campos do LinkLeads)',async()=>{
  const {I}=carregar([lh]);
  const [a]=await I.buscar();
  assert.equal(a.origem,'lh');
  assert.equal(a.papelLinkLeads,'');
  assert.equal(a.papelConfirmado,false);
  assert.equal(a.resposta,'Pode mandar o material');
});

test('primeiras versões do LinkLeads (só linkleads_event) também são reconhecidas',()=>{
  const {I}=carregar([]);
  assert.equal(I.origemDoItem({linkleads_event:'reply_received'}),'linkleads');
  assert.equal(I.origemDoItem({full_name:'x'}),'lh');
});
