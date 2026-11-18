import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketCityCache,marketCityCacheForDocument} from '../src/ri/market-city-cache.mjs';
const item=(uf,id,nome)=>({key:id,label:nome,value:{codigoIBGE:id,nome,uf}});
test('reabertura da mesma aba aproveita o catálogo público em memória',()=>{
 const doc={},a=marketCityCacheForDocument(doc),b=marketCityCacheForDocument(doc);
 assert.equal(a,b);
 assert.equal(a.put('SP',[item('SP','3530607','Mogi das Cruzes')]),true);
 assert.equal(b.get('SP')?.[0].value.codigoIBGE,'3530607');
 assert.equal(marketCityCacheForDocument({}).get('SP'),null);
});
test('TTL de 6 horas invalida entradas e permite nova consulta',()=>{
 let clock=1_000;
 const c=createMarketCityCache({now:()=>clock,ttlMs:100});
 c.put('SP',[item('SP','3530607','Mogi das Cruzes')]);
 clock+=99;assert.ok(c.get('SP'));
 clock+=2;assert.equal(c.get('SP'),null);
});
test('LRU respeita limite e mantém estado mais recente',()=>{
 const c=createMarketCityCache({maxUfs:2});
 c.put('SP',[item('SP','3530607','Mogi das Cruzes')]);
 c.put('RJ',[item('RJ','3304557','Rio de Janeiro')]);
 assert.ok(c.get('SP'));
 c.put('MG',[item('MG','3106200','Belo Horizonte')]);
 assert.equal(c.get('RJ'),null);
 assert.ok(c.get('SP'));assert.ok(c.get('MG'));
});
test('registros invalidados não entram no cache',()=>{
 const c=createMarketCityCache();
 assert.equal(c.put('SP',[]),false);
 assert.equal(c.put('SP',[item('SP','ABC','Mogi')]),false);
 assert.equal(c.put('SP',[item('RJ','3304557','Rio')]),false);
 assert.equal(c.put('SP',[item('SP','3530607','Mogi'),item('SP','3530607','Duplicada')]),false);
 assert.equal(c.get('SP'),null);
});
test('dados de cache são imutáveis e não persistem fora do documento',()=>{
 const c=createMarketCityCache();
 assert.equal(c.put('SP',[item('SP','3530607','Mogi das Cruzes')]),true);
 const cities=c.get('SP');
 assert.ok(Object.isFrozen(cities));
 assert.ok(Object.isFrozen(cities[0]));
 assert.ok(Object.isFrozen(cities[0].value));
 assert.equal(JSON.stringify(cities).includes('tenantId'),false);
 c.clear();assert.equal(c.get('SP'),null);
});
