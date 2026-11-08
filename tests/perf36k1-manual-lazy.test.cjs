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
  assert.ok(manual.length > 225000 && manual.length < 275000, 'Manual completo e carregado apenas sob demanda');
  assert.ok(core.length < 530000);
});

test('PERF-36K1: capitulos anteriores preservados e novidades documentadas sem duplicar Manual', () => {
  const ctx=setup();
  vm.runInNewContext(read('src/views.js'),ctx,{filename:'src/views.js'});
  const before=ctx.IADViews.playbook();
  assert.match(before,/iad-manual-loading/,'manual permanece lazy');
  vm.runInNewContext(read('src/views-manual.js'),ctx,{filename:'src/views-manual.js'});
  const actual=ctx.IADViews.playbook();
  assert.match(actual,/Manual do IAD CRM/);
  for(const name of ['m-regra','m-oito','m-regua','m-caminho','m-dia',
    'm-fila','m-potencial','m-nutricao','m-lh','m-telas','m-pipeline',
    'm-conversas','m-ia','m-limites','m-cadencia']) {
    assert.ok(actual.includes('id="'+name+'"'),'secao historica ausente: '+name);
  }
  for(const name of ['m-novidades','m-inteligencia','m-mercado-novo',
    'm-linkleads-novo','m-tecnologias','m-operacao']) {
    assert.ok(actual.includes('id="'+name+'"'),'capitulo novo ausente: '+name);
    assert.equal(actual.split('id="'+name+'"').length-1,1,'capitulo repetido: '+name);
  }
  for(const name of ['m-guia-v28697','m-radar-28697','m-mercado-operacional',
    'm-maquina-prospeccao','m-linkedin-operacao','m-nuvem-integridade',
    'm-papeis-empresas','m-ia-servicos','m-operacao-rapida','m-tecnologia-perf']) {
    assert.ok(actual.includes('id="'+name+'"'),'guia atualizado ausente: '+name);
    assert.equal(actual.split('id="'+name+'"').length-1,1,'guia duplicado: '+name);
  }
  assert.match(actual,/Funcionalidades atuais e solução de problemas/);
  assert.match(actual,/Método IAD, telas e rotina comercial/);
  assert.match(actual,/Entradas de hoje/);
  assert.match(actual,/100 MiB/);
  assert.match(actual,/NOVO REGISTRO · REVISAR/);
  assert.match(actual,/importação automática da pesquisa externa está desabilitada no piloto/);
  assert.match(actual,/não limpe cookies\/localStorage\/IndexedDB/);
  assert.match(actual,/0 a 32/);
  assert.match(actual,/Inteligência Comercial/);
  assert.match(actual,/Supabase/);
  assert.match(actual,/Contato a confirmar/);
  assert.equal(ctx.IADViews.playbook(),actual,'reabertura deterministica');
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
