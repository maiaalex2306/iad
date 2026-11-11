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

test('HOJE: renderiza valores reais e filtros funcionais sem incluir aguardando', () => {
  const vm = require('node:vm');
  const start = src.indexOf('  function painelDeAcaoHoje(grupos) {');
  const end = src.indexOf('  /* A barra de páginas.', start);
  assert.ok(start > -1 && end > start, 'função de painel encontrada');
  const fn = src.slice(start, end);
  const context = {
    esc: x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    U: {
      numero: n => String(n),
      compacto: n => 'R$ ' + Number(n).toFixed(2)
    }
  };
  vm.createContext(context);
  vm.runInContext(fn, context);
  const output = context.painelDeAcaoHoje([
    { chave: 3, qtd: 8, valor: 675400 },
    { chave: 2, qtd: 4, valor: 178300 },
    { chave: 'resto', qtd: 30, valor: 1500000 },
    { chave: 'espera', qtd: 20, valor: 900000 }
  ]);
  assert.match(output, /12 negócio\(s\) para agir/);
  assert.match(output, /R\$ 853700\.00/);
  assert.match(output, /79% do valor que pede ação está urgente/);
  assert.match(output, /App\.filtrarHoje\(3\)/);
  assert.match(output, /App\.filtrarHoje\(2\)/);
  assert.doesNotMatch(output, /R\$ 1500000\.00|R\$ 900000\.00/);
});
test('HOJE: sem urgências exibe mensagem e não oferece cobrança enganosa', () => {
  const vm = require('node:vm');
  const start = src.indexOf('  function painelDeAcaoHoje(grupos) {');
  const end = src.indexOf('  /* A barra de páginas.', start);
  const context = { esc: x => String(x), U: { numero: String, compacto: String } };
  vm.createContext(context);
  vm.runInContext(src.slice(start, end), context);
  assert.match(context.painelDeAcaoHoje([
    { chave: 'resto', qtd: 12, valor: 3000 },
    { chave: 'espera', qtd: 5, valor: 4000 }
  ]), /Nenhuma intervenção urgente/);
  const semValor = context.painelDeAcaoHoje([
    { chave: 3, qtd: 1, valor: 0 },
    { chave: 2, qtd: 1, valor: 0 }
  ]);
  assert.match(semValor, /Sem valor monetário cadastrado/);
  assert.doesNotMatch(semValor, /NaN|Infinity/);
});
