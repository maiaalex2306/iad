'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const views=fs.readFileSync(path.join(root,'src/views.js'),'utf8');
const config=fs.readFileSync(path.join(root,'src/config.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');

test('navegacao nao dispara varredura de IA automaticamente',()=>{
 const a=app.indexOf('function render()');
 const b=app.indexOf('function varrerOrientacoesDoDia()',a);
 assert.ok(a>=0&&b>a,'render/varredura ausentes');
 const body=app.slice(a,b);
 assert.doesNotMatch(body,/if\s*\(hash\s*===\s*['"]#\/hoje['"]\)\s*varrerOrientacoesDoDia\s*\(/);
 assert.doesNotMatch(body,/setTimeout\s*\(function\s*\(\)\s*\{\s*App\.conversar\s*\(\s*\)/);
});
test('analise deliberada e conversa manual permanecem acessiveis',()=>{
 assert.match(app,/analisarPendencias:\s*function\s*\(/);
 assert.match(app,/IA\.varrerOrientacoes\(urgentes,/);
 assert.match(views,/onclick="App\.analisarPendencias\(\)"/);
 assert.match(app,/App\.conversar\s*=\s*function\s*\(/);
});
test('copy da interface nao afirma mais leitura de email automatica',()=>{
 assert.doesNotMatch(views,/Ele já roda ao abrir o app, no fundo, sem avisar/);
 assert.match(views,/nenhuma análise automática em segundo plano/);
});
test('config e PWA possuem a mesma versao',()=>{
 assert.match(config,/numero: 'v286\.8'/);
 assert.match(sw,/iad-crm-v286\.8/);
});
