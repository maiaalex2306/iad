'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const config=fs.readFileSync(path.join(root,'src/config.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
test('nao dispara analise IA ao carregar email',()=>{
 const i=app.indexOf('function pintarEmails(forcar)'),j=app.indexOf('App.recarregarEmails =',i);
 assert.ok(i>=0&&j>i); assert.doesNotMatch(app.slice(i,j),/analisarEmailsNovos\s*\(/);
});
test('mantem analise manual',()=>assert.match(app,/App\.analisarEmails\s*=\s*function\s*\(\)\s*\{\s*analisarEmailsNovos\(true\)/));
test('cache e app preservam a mesma versao',()=>{
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
