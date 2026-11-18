'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../src/views.js'), 'utf8');
const found = source.match(/(function oportunidadesAbertasPorConta\(oportunidades\) \{[\s\S]*?\n  \})\n\n  function contas\(\)/);
assert.ok(found, 'PERF-16: helper de indexacao ausente');
const indexar = vm.runInNewContext('(' + found[1] + ')', { Map, Number });

test('preserva filtro original, ordem, duplicatas, chaves tipadas e NaN', () => {
  const oportunidades = [
    { id: 'primeiro', contaId: 'A' },
    { id: 'fechado', contaId: 'A', desfecho: 'ganho' },
    { id: 'numero', contaId: 1 },
    { id: 'texto', contaId: '1' },
    { id: 'nulo', contaId: null },
    { id: 'ausente' },
    { id: 'nan', contaId: NaN },
    { id: 'primeiro', contaId: 'A' },
    { id: 'b', contaId: 'B' }
  ];
  const mapa = indexar(oportunidades);
  for (const contaId of ['A', 'B', '1', 1, null, undefined, NaN, 'inexistente']) {
    const esperado = oportunidades.filter(o => o.contaId === contaId && !o.desfecho);
    const atual = mapa.get(contaId) || [];
    assert.deepEqual(Array.from(atual, o => o.id), esperado.map(o => o.id));
    assert.ok(Array.from(atual).every((o, i) => o === esperado[i]));
  }
  assert.equal(oportunidades.length, 9, 'nao modifica a fonte');
});

test('o indice e recriado por render, sem estado global persistente', () => {
  const fonte = [{ id: 'x', contaId: 'A' }];
  const primeiro = indexar(fonte);
  fonte.push({ id: 'y', contaId: 'A' });
  assert.equal(primeiro.get('A').length, 1);
  assert.equal(indexar(fonte).get('A').length, 2);
});

test('Contas e Cadastros usam a mesma fonte visivel e evitam filtro quadratico', () => {
  const contas = source.slice(source.indexOf('function contas() {'), source.indexOf('/* ---------------- Cadastros ---------------- */'));
  const lista = source.slice(source.indexOf('function listaEmpresas(est) {'), source.indexOf('function listaContatos(est) {'));
  assert.match(contas, /const abertasPorConta = oportunidadesAbertasPorConta\(est\.oportunidades\)/);
  assert.match(lista, /const abertasPorConta = oportunidadesAbertasPorConta\(est\.oportunidades\)/);
  assert.doesNotMatch(contas, /est\.oportunidades\.filter\(/);
  assert.doesNotMatch(lista, /est\.oportunidades\.filter\(/);
});

test('384 contas x 389 oportunidades: acessos de chave caem ao menos dez vezes', () => {
  let leituras = 0;
  const oportunidades = Array.from({ length: 389 }, (_, i) => ({
    get contaId() { leituras++; return 'c' + (i % 384); },
    desfecho: i % 7 === 0 ? 'perdida' : null
  }));
  const contas = Array.from({ length: 384 }, (_, i) => 'c' + i);
  for (const id of contas) oportunidades.filter(o => o.contaId === id && !o.desfecho);
  const antigo = leituras;
  leituras = 0;
  const mapa = indexar(oportunidades);
  for (const id of contas) mapa.get(id);
  assert.equal(antigo, 384 * 389);
  assert.ok(leituras < antigo / 10, 'acessos novo=' + leituras + ', antigo=' + antigo);
});
