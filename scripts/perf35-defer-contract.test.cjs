'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const all=[...html.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)><\/script>/g)];
test('PERF-35: os 37 scripts clássicos carregam com defer, sem alterar ordem',()=>{
 assert.equal(all.length,37);
 assert.ok(all.every(x=>/\bdefer\b/.test(x[1]+x[3])),'script sem defer');
 assert.ok(all.every(x=>!/\basync\b/.test(x[1]+x[3])),'async quebraria ordem');
 assert.equal(all[0][2],'src/config.js');
 assert.equal(all[all.length-1][2],'src/app.js');
 assert.equal(new Set(all.map(x=>x[2])).size,37,'duplicidade de script');
 assert.ok(all.every(x=>fs.existsSync(x[2])),'script ausente');
});
test('PERF-35: recuperação executa antes do boot, sem perder tokens de convite',()=>{
 const recovery=html.indexOf('location.replace(\'/recuperar.html\'');
 const first=html.indexOf('<script src="src/config.js" defer>');
 assert.ok(recovery>0 && recovery<first);
 assert.match(html,/tipo === 'recovery' \|\| tipo === 'invite'/);
 assert.match(html,/h\.has\('access_token'\)/);
});
test('PERF-35: roteador ainda depende do DOMContentLoaded',()=>{
 const app=fs.readFileSync('src/app.js','utf8');
 assert.match(app,/document\.addEventListener\('DOMContentLoaded'/);
 assert.match(app,/global\.App = App/);
});
test('PERF-35: versão de PWA e config continuam coerentes',()=>{
 const cfg=fs.readFileSync('src/config.js','utf8');
 const sw=fs.readFileSync('sw.js','utf8');
 const ver=cfg.match(/numero: '(v\d+(?:\.\d+)*)'/);
 assert.ok(ver);
 assert.ok(sw.includes("const CACHE = 'iad-crm-"+ver[1]+"'"));
});
