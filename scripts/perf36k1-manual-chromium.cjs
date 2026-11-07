/* PERF-36K1: navegador real local, sintético, sem autenticação ou dados comerciais.
   Valida importação única do Manual e disponibilidade pelo PWA offline. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
  '.css':'text/css','.png':'image/png','.svg':'image/svg+xml',
  '.webmanifest':'application/manifest+json'};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rel = url.pathname === '/' ? 'index.html'
    : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const filename = path.resolve(root, rel);
  if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename) ||
      !fs.statSync(filename).isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, {'content-type':mime[path.extname(filename)] || 'application/octet-stream',
    'cache-control':'no-store'});
  fs.createReadStream(filename).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({headless:true, args:['--no-sandbox']});
    const context = await browser.newContext({serviceWorkers:'allow'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('dialog', d => d.dismiss());
    await page.route('**/*', route => route.request().url().startsWith(origin + '/')
      ? route.continue() : route.abort('blockedbyclient'));
    await page.goto(origin + '/#/hoje', {waitUntil:'domcontentloaded', timeout:30000});
    await page.waitForFunction(() => !!window.IADViews && !!window.IADCarregarOpcional,
      {timeout:15000});
    const boot = await page.evaluate(() => ({
      moduleLoaded: !!window.IADViewsManual,
      placeholder: window.IADViews.playbook().includes('iad-manual-loading'),
      scriptCount: performance.getEntriesByType('resource')
        .filter(x => /\/src\/[^/]+\.js$/.test(new URL(x.name).pathname)).length
    }));
    assert.equal(boot.moduleLoaded, false, 'Manual não pode ser baixado no boot');
    assert.equal(boot.placeholder, true, 'Rota Método mantém placeholder síncrono');
    assert.equal(boot.scriptCount, 35, 'Shell inicial deve permanecer com 35 scripts');
    const loaded = await page.evaluate(async () => {
      const results = await Promise.all([
        window.IADCarregarOpcional('IADViewsManual', 'views-manual.js'),
        window.IADCarregarOpcional('IADViewsManual', 'views-manual.js'),
        window.IADCarregarOpcional('IADViewsManual', 'views-manual.js')
      ]);
      const html = window.IADViews.playbook();
      document.getElementById('conteudo').innerHTML = html;
      return {
        sameObject: results.every(x => x === results[0]),
        contentLength: html.length,
        title: !!document.querySelector('#conteudo h1'),
        htmlOk: html.includes('Manual do IAD CRM') &&
          !!document.querySelector('#m-pipeline') &&
          !!document.querySelector('#m-tarefas'),
        manualResources: performance.getEntriesByType('resource')
          .filter(x => new URL(x.name).pathname.endsWith('/src/views-manual.js')).length
      };
    });
    assert.equal(loaded.sameObject, true, 'Promessa de import compartilhada');
    assert.ok(loaded.contentLength > 100000, 'Manual integral, sem truncar conteúdo');
    assert.equal(loaded.title, true);
    assert.equal(loaded.htmlOk, true, 'HTML real do Manual');
    assert.equal(loaded.manualResources, 1, 'Importação única do módulo');

    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null,
      {timeout:30000});
    await context.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded', timeout:30000});
    await page.waitForFunction(() => !!window.IADCarregarOpcional, null, {timeout:15000});
    const offline = await page.evaluate(async () => {
      const initial = !!window.IADViewsManual;
      await window.IADCarregarOpcional('IADViewsManual','views-manual.js');
      return {
        initial,
        rendered:window.IADViews.playbook().includes('Manual do IAD CRM'),
        cached:!!window.IADViewsManual
      };
    });
    assert.equal(offline.initial,false,'Manual ainda não analisado antes da ação offline');
    assert.equal(offline.rendered,true,'Manual disponível offline no PWA');
    assert.equal(offline.cached,true);
    assert.deepEqual(errors, [], 'Browser pageerror: ' + errors.slice(0,3).join(' / '));
    console.log('PERF36K1_MANUAL_CHROMIUM_PASS ' + JSON.stringify({
      scope:'chromium-local-anonymous-synthetic', bootScripts:boot.scriptCount,
      removedFromStartup:true, importedOnce:true, htmlParity:true,
      offlinePrecache:true, bytesOfManual:loaded.contentLength
    }));
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(err => {console.error('PERF36K1_MANUAL_CHROMIUM_FAIL',err.stack);process.exitCode=1;});
