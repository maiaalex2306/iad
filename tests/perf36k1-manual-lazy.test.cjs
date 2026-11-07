'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const originalCommit = 'eecf58f042965dee61b0d368d3c669c32c22d321';

function setup() {
  const window = {};
  window.window = window;
  window.IADVersao = { numero: 'v286.75', data: '2026-11-06' };
  window.IADStore = { nomesDoCatalogo: () => ['WhatsApp', 'E-mail'] };
  window.IADEngine = {};
  window.IADUI = {
    esc: value => String(value == null ? '' : value).replace(/&/g, '&amp;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    data: value => String(value)
  };
  vm.runInNewContext(read('src/playbook.js'), window, {filename:'src/playbook.js'});
  assert.ok(window.IADPlaybook, 'Playbook real carregado');
  return window;
}

test('PERF-36K1: JavaScript e PWA com sintaxe válida', () => {
  for (const file of ['src/views.js','src/views-manual.js','src/app.js','sw.js','src/config.js']) {
    new vm.Script(read(file), { filename:file });
  }
  const sw = read('sw.js'), config = read('src/config.js');
  const version = config.match(/numero:\s*'(v286\.\d+)'/);
  assert.ok(version, 'a versao v286 do aplicativo deve estar declarada');
  assert.ok(sw.includes("const CACHE = 'iad-crm-" + version[1] + "'"),
    'cache e versao precisam ser iguais em toda release');
  assert.match(sw, /'\.\/src\/views-manual\.js'/);
  assert.doesNotMatch(read('index.html'), /<script[^>]*views-manual\.js/);
});

test('PERF-36K1: o Manual não é analisado no shell inicial', () => {
  const core = read('src/views.js');
  const manual = read('src/views-manual.js');
  const app = read('src/app.js');
  assert.equal(core.includes('function manualDasOito()'), false);
  assert.equal(core.includes('function indiceDoManual()'), false);
  assert.match(manual, /function manualDasOito\(\)/);
  assert.match(manual, /function indiceDoManual\(\)/);
  assert.match(manual, /global\.IADViewsManual\s*=\s*Object\.freeze/);
  assert.match(app, /carregarOpcional\('IADViewsManual',\s*'views-manual\.js'\)/);
  assert.match(app, /rota\.hash === '#\/playbook'/);
  assert.match(app, /location\.hash !== '#\/playbook'/);
  assert.ok(manual.length > 170000 && manual.length < 210000);
  assert.ok(core.length < 530000);
});

test('PERF-36K1: HTML do Método é idêntico ao da versão estável v286.74', () => {
  const old = execFileSync('git',
    ['show', originalCommit + ':src/views.js'],
    {cwd:root, encoding:'utf8', maxBuffer:4*1024*1024});
  const ctxOld = setup();
  vm.runInNewContext(old, ctxOld, {filename:'views-original.js'});
  const expected = ctxOld.IADViews.playbook();
  assert.match(expected, /Manual do IAD CRM/);
  assert.ok(expected.length > 100000, 'conteúdo integral do Manual');

  const ctx = setup();
  vm.runInNewContext(read('src/views.js'), ctx, {filename:'src/views.js'});
  const before = ctx.IADViews.playbook();
  assert.match(before, /iad-manual-loading/);
  assert.equal(before.includes('Manual do IAD CRM'), false);

  vm.runInNewContext(read('src/views-manual.js'), ctx, {filename:'src/views-manual.js'});
  const actual = ctx.IADViews.playbook();
  assert.strictEqual(actual, expected, 'HTML deve ser byte a byte equivalente');
  assert.equal(actual.includes('iad-manual-loading'), false);
  assert.equal(ctx.IADViews.playbook(), actual, 'reabertura determinística');
});

test('PERF-36K1: referências críticas não alteradas', () => {
  const app = read('src/app.js'), core = read('src/views.js');
  assert.match(app, /hash: '#\/hoje'/);
  assert.match(app, /hash: '#\/pipeline'/);
  assert.match(app, /hash: '#\/tarefas'/);
  assert.match(app, /hash: '#\/playbook'[^}]*render: V\.playbook/);
  assert.match(core, /global\.IADViews = \{/);
  assert.match(core, /hoje, painel, pipeline, tarefas, cockpit/);
  assert.match(app, /token !== geracaoDoManual/);
  assert.match(app, /!A\.atual\(\)/);
  assert.match(app, /!global\.IADNuvem\.sessao\(\)/);
});
