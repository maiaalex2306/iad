'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../src/views.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../assets/styles.css'), 'utf8');

test('HOJE: o gráfico de composição é substituído por uma decisão acionável', () => {
  const inicio = src.indexOf('function hoje()');
  const fim = src.indexOf('/* A barra de páginas.', inicio);
  const trecho = src.slice(inicio, fim);
  assert.ok(trecho.includes('painelDeAcaoHoje(grupos)'));
  assert.ok(!trecho.includes('G.composicao(grupos.filter'));
});
test('HOJE: conta somente urgente e prioridade e explica o valor sem prever receita', () => {
  const inicio = src.indexOf('function painelDeAcaoHoje(');
  const fim = src.indexOf('/* A barra de páginas.', inicio);
  const trecho = src.slice(inicio, fim);
  assert.ok(trecho.includes('g.chave === 3'));
  assert.ok(trecho.includes('g.chave === 2'));
  assert.ok(trecho.includes('urgente.qtd + prioridade.qtd'));
  assert.ok(trecho.includes('não é previsão de receita'));
  assert.ok(trecho.includes('valor > 0'));
  assert.ok(trecho.includes('Sem valor monetário cadastrado'));
  assert.ok(trecho.includes('Nenhuma intervenção urgente'));
});
test('HOJE: atalhos filtram pelos estados preexistentes', () => {
  assert.ok(src.includes("linha(urgente, 'urgente', 'Urgente', 'Atacar primeiro', '3')"));
  assert.ok(src.includes("linha(prioridade, 'prioridade', 'Prioridade', 'Planejar sequência', '2')"));
  assert.ok(src.includes("onclick=\"App.filtrarHoje(' + chave + ')"));
});
test('HOJE: apresentação responsiva com rótulos e foco acessível', () => {
  assert.match(css, /\.hoje-acao-opcoes\s*\{/);
  assert.match(css, /@media\s*\(max-width:\s*560px\)/);
  assert.match(css, /\.hoje-acao-item:hover,\s*\.hoje-acao-item:focus-visible/);
});
