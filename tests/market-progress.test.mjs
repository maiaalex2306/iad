import test from 'node:test';
import assert from 'node:assert/strict';
import {mountMarketSearchProgress} from '../src/ri/market-progress.mjs';
class Node{
 constructor(tag){this.tagName=tag;this.textContent='';this.hidden=false;this.children=[];this.events={};this.attributes={};}
 append(...children){this.children.push(...children);}
 addEventListener(kind,fn){(this.events[kind]??=[]).push(fn);}
 setAttribute(k,v){this.attributes[k]=v;}
 removeAttribute(k){delete this.attributes[k];}
 fire(k,data={}){for(const fn of this.events[k]??[])fn(data);}
}
function fixture(){
 const events={};
 const doc={createElement:tag=>new Node(tag),addEventListener:(k,fn)=>{(events[k]??=[]).push(fn);},
  removeEventListener:(k,fn)=>{events[k]=(events[k]||[]).filter(x=>x!==fn);}};
 const host=new Node('main');
 const walk=(n,p)=>{if(p(n))return n;for(const x of n.children){const v=walk(x,p);if(v)return v;}return null;};
 return {doc,host,walk,events};
}
test('pop-up de pesquisa é oculto antes de ação explícita do usuário',()=>{
 const f=fixture(),p=mountMarketSearchProgress({doc:f.doc,host:f.host});
 assert.equal(p.getState(),'idle');assert.equal(p.overlay.hidden,true);
 assert.equal(f.walk(f.host,n=>n.attributes?.role==='dialog')?.attributes['aria-modal'],'true');
 p.dispose();assert.equal(p.getState(),'disposed');
});
test('busca pendente mostra progresso indeterminado, tempo e permite ocultar/reabrir sem cancelar',()=>{
 const f=fixture(),p=mountMarketSearchProgress({doc:f.doc,host:f.host});
 try{
  p.start('ChatGPT e Claude');p.waiting();
  assert.equal(p.getState(),'running');assert.equal(p.overlay.hidden,false);
  assert.ok(f.walk(f.host,n=>n.tagName==='progress'));
  const bar=f.walk(f.host,n=>n.tagName==='progress');
  assert.equal(bar.attributes.value,undefined,'não pode inventar percentuais');
  assert.match(f.walk(f.host,n=>n.className==='iad-market-progress-phase').textContent,/Aguardando resposta/);
  assert.match(f.walk(f.host,n=>n.className==='iad-market-progress-time').textContent,/0 s/);
  const close=f.walk(f.host,n=>n.className?.includes('iad-market-progress-close'));
  close.fire('click');
  assert.equal(p.overlay.hidden,true);assert.equal(p.reopen.hidden,false);
  p.reopen.fire('click');
  assert.equal(p.overlay.hidden,false);
  p.processing();
  assert.match(f.walk(f.host,n=>n.className==='iad-market-progress-phase').textContent,/organizando candidatas/i);
  p.finish({count:2,partial:true});
  assert.equal(p.getState(),'done');
  assert.match(f.walk(f.host,n=>n.className==='iad-market-progress-title').textContent,/parcialmente concluída/);
  assert.match(f.walk(f.host,n=>n.className==='iad-market-progress-description').textContent,/2 empresa/);
  assert.equal(bar.hidden,true);
  close.fire('click');assert.equal(p.overlay.hidden,true);
 }finally{p.dispose();}
});
test('falhas da API são apresentadas, sem alegar que a quota foi devolvida',()=>{
 const f=fixture(),p=mountMarketSearchProgress({doc:f.doc,host:f.host});
 try{
  p.start('Claude');
  p.fail('Limite diário de pesquisas atingido');
  assert.equal(p.getState(),'error');
  assert.match(f.walk(f.host,n=>n.className==='iad-market-progress-description').textContent,/Limite diário/);
  assert.equal(p.reopen.hidden,true);
 }finally{p.dispose();}
});
test('ocultar durante a requisição não impede conclusão nem conserva timer',()=>{
 const f=fixture(),p=mountMarketSearchProgress({doc:f.doc,host:f.host});
 p.start('ChatGPT');p.hide();p.finish({count:0});
 assert.equal(p.getState(),'done');assert.equal(p.overlay.hidden,true);assert.equal(p.reopen.hidden,true);
 p.dispose();
});
