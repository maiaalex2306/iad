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
  global.IADIncremental = { criar: criar };
})(window);
