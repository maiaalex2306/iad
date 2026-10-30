/* PERF-04 P5b: núcleo incremental puro, sem armazenamento global e sem rede.
   Consumidor deve descartar a instância ao mudar sessão, tenant ou filtros.
   A fonte de verdade continua sendo o Decision Engine. */
(function (global) {
  'use strict';
  function criar() {
    const porId = new Map();
    const totals = { qtd: 0, valor: 0, saudavel: 0, risco: 0, zumbi: 0 };
    function grupo(classe) {
      if (classe === 'real' || classe === 'oculto') return 'saudavel';
      if (classe === 'falso' || classe === 'construcao') return 'risco';
      if (classe === 'zumbi') return 'zumbi';
      return null;
    }
    function ajustar(item, sinal) {
      totals.qtd += sinal;
      totals.valor += sinal * item.valor;
      const g = grupo(item.classe);
      if (g) totals[g] += sinal * item.valor;
    }
    function normalizar(resumo) {
      if (!resumo || !resumo.op || resumo.op.id == null ||
          !resumo.classe || typeof resumo.classe.id !== 'string')
        throw new Error('P5b: resumo inválido');
      const v = Number(resumo.op.valor || 0);
      if (!Number.isFinite(v)) throw new Error('P5b: valor inválido');
      return { id: String(resumo.op.id), valor: v, classe: resumo.classe.id };
    }
    function atualizar(resumo) {
      const item = normalizar(resumo);
      const anterior = porId.get(item.id);
      if (anterior) ajustar(anterior, -1);
      porId.set(item.id, item);
      ajustar(item, 1);
    }
    function excluir(id) {
      const key = String(id), item = porId.get(key);
      if (!item) return false;
      ajustar(item, -1);
      porId.delete(key);
      return true;
    }
    function reconstruir(resumos) {
      const novos = Array.from(resumos || []).map(normalizar);
      const ids = new Set();
      novos.forEach(function (item) {
        if (ids.has(item.id)) throw new Error('P5b: ID duplicado');
        ids.add(item.id);
      });
      porId.clear();
      Object.keys(totals).forEach(function (k) { totals[k] = 0; });
      novos.forEach(function (item) { porId.set(item.id, item); ajustar(item, 1); });
    }
    function resultado() { return Object.assign({}, totals); }
    function limpar() { reconstruir([]); }
    return { atualizar: atualizar, excluir: excluir, reconstruir: reconstruir,
      resultado: resultado, limpar: limpar };
  }
  /* Fachada escopada: falha fechada se identidade, tenant, filtros ou revisão
     mudarem. Nunca usar uma instância antiga após troca de contexto. */
  function criarEscopado(contextoAtual) {
    if (typeof contextoAtual !== 'function') throw new Error('P5b: contexto obrigatório');
    function assinatura() {
      const c = contextoAtual();
      if (!c || !c.usuarioId || !c.tenantId || !Number.isSafeInteger(c.revisao))
        throw new Error('P5b: contexto incompleto');
      return JSON.stringify([c.usuarioId, c.tenantId, c.papel || '',
        c.filtroTenant || '', c.filtroUsuario || '', c.revisao]);
    }
    let inicial = assinatura(), revogado = false;
    const motor = criar();
    function exigir() {
      if (revogado) throw new Error('P5b: instância revogada');
      if (assinatura() !== inicial) {
        motor.limpar(); revogado = true;
        throw new Error('P5b: contexto alterado; reconstrução obrigatória');
      }
    }
    return {
      reconstruir: function (r) { exigir(); return motor.reconstruir(r); },
      atualizar: function (r) { exigir(); return motor.atualizar(r); },
      excluir: function (id) { exigir(); return motor.excluir(id); },
      resultado: function () { exigir(); return motor.resultado(); },
      revogar: function () { motor.limpar(); revogado = true; }
    };
  }
  global.IADIncremental = { criar: criar, criarEscopado: criarEscopado };
})(window);
