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
 /* Lê a versão dos dois arquivos em vez de fixar um número.
    Fixar trava o teste no passado: ele passou a falhar no bump seguinte e
    nunca mais voltou ao verde, vermelho por estar desatualizado e não por
    ter achado desacordo. Um vermelho que não quer dizer nada ensina todo
    mundo a ignorar vermelho. O que este teste quer saber — e o nome dele já
    dizia — é se os DOIS lados falam a mesma versão, qualquer que seja. */
 const NUM = /(v\d+(?:\.\d+)*)/;
 const noSw = new RegExp("const CACHE = 'iad-crm-" + NUM.source + "'").exec(sw);
 const noConfig = new RegExp("numero: '" + NUM.source + "'").exec(config);
 assert.ok(noSw, 'nao li a versao em sw.js');
 assert.ok(noConfig, 'nao li a versao em src/config.js');
 assert.equal(noSw[1], noConfig[1],
  'sw.js diz ' + noSw[1] + ' e src/config.js diz ' + noConfig[1] +
  ' — troque os dois no mesmo commit');
});
