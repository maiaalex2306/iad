/* IaD CRM v273 — pure conflict and revision contract; not activated in production. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IADCAS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  function revision(value) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Revisão inválida');
    return value;
  }
  function unchanged(a, b) { return Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b); }
  function conflict(base, local, remote) {
    if (!base || !local || !remote || base.id !== local.id || base.id !== remote.id)
      throw new TypeError('Identidades incompatíveis');
    if (base.tenantId !== local.tenantId || base.tenantId !== remote.tenantId)
      throw new TypeError('Empresas incompatíveis');
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    const differences = [];
    for (const key of keys) {
      if (key === 'revisao' || key === 'atualizadoEm') continue;
      const localChanged = !unchanged(base[key], local[key]);
      const remoteChanged = !unchanged(base[key], remote[key]);
      if (localChanged && remoteChanged && !unchanged(local[key], remote[key]))
        differences.push({ field: key, base: base[key], local: local[key], remote: remote[key] });
    }
    return differences;
  }
  function operation({ tenantId, userId, table, recordId, expectedRevision, patch, operationId }) {
    if (!tenantId || !userId || !recordId || !operationId || typeof operationId !== 'string')
      throw new TypeError('Identidade e idempotência obrigatórias');
    if (table !== 'oportunidades') throw new TypeError('Tabela não habilitada para CAS');
    revision(expectedRevision);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length)
      throw new TypeError('Alteração vazia');
    if (['id','tenant_id','tenantId','dono_id','revisao','atualizado_em'].some(k => Object.hasOwn(patch,k)))
      throw new TypeError('Alteração em campo protegido');
    return Object.freeze({ tenantId, userId, table, recordId, expectedRevision,
      operationId, patch: Object.freeze(structuredClone(patch)) });
  }
  return Object.freeze({ revision, conflict, operation });
});