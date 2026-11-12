'use strict';
/* Confere igualdade exata entre o release em config.js e o cache PWA.
 * Nao fixa o numero: releases posteriores tambem sao validados sem modificar 15 workflows. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const cfg=fs.readFileSync('src/config.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const a=cfg.match(/window\.IADVersao\s*=\s*\{[^}]*numero:\s*'(v\d+(?:\.\d+)*)'/);
const b=sw.match(/const\s+CACHE\s*=\s*'([^']+)'/);
assert.ok(a,'IADVersao ausente');
assert.ok(b,'CACHE PWA ausente');
assert.equal(b[1],'iad-crm-'+a[1],'App e service worker precisam da mesma versao');
console.log('Release e PWA coordenados:',a[1]);
