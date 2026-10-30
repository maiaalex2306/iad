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
  /* A resposta POST de uma criação pode se perder APÓS commit. No retry,
     só aceitar o registro existente como confirmação se TODOS os campos
     enviados coincidirem; campo divergente é conflito, nunca sobrescrita. */
  function sameRecord(sent,server) {
    if (!sent || !server || !sent.id || !sent.tenant_id ||
        sent.id!==server.id || sent.tenant_id!==server.tenant_id) return false;
    function equal(a,b) {
      if(Object.is(a,b)) return true;
      if(!a||!b||typeof a!=='object'||typeof b!=='object') return false;
      if(Array.isArray(a)!==Array.isArray(b))return false;
      if(Array.isArray(a))
        return a.length===b.length&&a.every((x,i)=>equal(x,b[i]));
      const ka=Object.keys(a), kb=Object.keys(b);
      return ka.length===kb.length && ka.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));
    }
    return Object.keys(sent).filter(k=>k!=='atualizado_em'&&k!=='revisao')
      .every(k=>Object.hasOwn(server,k)&&equal(sent[k],server[k]));
  }
  return Object.freeze({ revision, conflict, operation, sameRecord });
});