'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../../src/app.js'),'utf8');
test('Sync: guard allows one repaint per frame and keeps error alert immediate',()=>{
 const start=src.indexOf('let renderSyncPendente = false;');
 const stop=src.indexOf('global.IADAjuda.ligar();',start);
 assert.ok(start>0&&stop>start);
 const snippet=src.slice(start,stop).replaceAll('global.IADSincronia','sincronia');
 let observer,paints=0,alerts=0;const queue=[];
 vm.runInNewContext(snippet,{sincronia:{aoMudar:f=>observer=f},vigiarGravacao:()=>alerts++,render:()=>paints++,requestAnimationFrame:f=>queue.push(f)});
 observer({situacao:'salvando'});observer({situacao:'salvando'});observer({situacao:'erro'});
 assert.equal(alerts,3);assert.equal(paints,0);assert.equal(queue.length,1);
 queue.shift()();assert.equal(paints,1);
 observer({situacao:'ocioso'});assert.equal(queue.length,1);
 queue.shift()();assert.equal(paints,2);
});
test('Caminho manual e dados comerciais preservados',()=>{
 assert.match(src,/global\.IADSincronia\.ligar\(\)/);
 assert.match(src,/global\.IADSincronia\.aoMudar/);
});
