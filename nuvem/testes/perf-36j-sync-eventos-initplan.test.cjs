'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const forward = fs.readFileSync(path.join(root, 'nuvem/perf-36j-sync-eventos-initplan.sql'), 'utf8');
const backward = fs.readFileSync(path.join(root, 'nuvem/perf-36j-sync-eventos-rollback.sql'), 'utf8');

function predicate(sql) {
  const match = sql.match(/ALTER\s+POLICY\s+iad_sync_eventos_leitura\s+ON\s+public\.iad_sync_eventos\s+USING\s+(\([\s\S]*?\))\s*;/i);
  assert.ok(match, 'politica e alvo exatos devem existir');
  return match[1]
    .replace(/\(\s*SELECT\s+public\.(sou_admin|sou_gestor|meu_tenant)\(\)\s*\)/gi, '$1()')
    .replace(/\bpublic\.(sou_admin|sou_gestor|meu_tenant)\b/gi, '$1')
    .replace(/\s+/g, '')
    .toLowerCase();
}

test('PERF-36J: mesma regra booleana na migracao e no rollback', () => {
  assert.equal(predicate(forward), predicate(backward));
});
test('PERF-36J: cada funcao independente e avaliada como InitPlan', () => {
  for (const fn of ['sou_admin', 'sou_gestor', 'meu_tenant']) {
    assert.match(forward, new RegExp('\\(SELECT public\\.' + fn + '\\(\\)\\)', 'i'));
  }
});
test('PERF-36J: nao modifica escrita, grants ou configuracao RLS', () => {
  for (const text of [forward, backward]) {
    assert.match(text, /\bBEGIN\s*;/i);
    assert.match(text, /\bCOMMIT\s*;/i);
    assert.match(text, /SET\s+LOCAL\s+lock_timeout\s*=\s*'3s'/i);
    assert.doesNotMatch(text.replace(/^\s*--.*$/gm, ''), /\b(DROP|REVOKE|GRANT|TRUNCATE|DELETE|INSERT|UPDATE|WITH CHECK|DISABLE)\b/i);
    assert.equal((text.match(/\bALTER\s+POLICY\b/gi) || []).length, 1);
  }
});
