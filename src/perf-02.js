/* IaD CRM PERF-02 — cache de fila por revisão, dia e escopo autenticado.
   Não persiste nem transmite dados. Exclusivamente para Store.dados().
   O cálculo do Decision Engine continua sendo a fonte de verdade. */
(function (global) {
  'use strict';
  let cache = null;
  const contadores = { hits: 0, misses: 0, invalidacoes: 0 };

  function escopo() {
    const S = global.IADStore;
    const c = S && S.contexto && S.contexto();
    if (!c || !c.usuario || !c.usuario.id) return null;
    const f = c.filtros || {};
    return JSON.stringify([
      c.usuario.id, c.usuario.papel || '', c.tenantId || '',
      !!c.admin, !!c.gestor, f.tenant || '', f.usuario || ''
    ]);
  }

  function copiar(f) {
    /* O consumidor pode paginar/ordenar arrays sem alterar a entrada em cache.
       Os registros internos continuam as referências oficiais do Store. */
    return {
      itens: f.itens.slice(), triagem: f.triagem.slice(),
      urgentes: f.urgentes.slice(), valorUrgente: f.valorUrgente
    };
  }

  function filaDados(est) {
    const S = global.IADStore;
    const E = global.IADEngine;
    if (!S || !E || !est || !Array.isArray(est.oportunidades) ||
        !Array.isArray(est.tarefas)) throw new Error('PERF-02: carteira inválida');
    const usuario = escopo();
    /* Sem identidade, nunca cachear dados que possam ter vindo de outra sessão. */
    if (!usuario || typeof S.revisao !== 'function') {
      return E.fila(est.oportunidades, est.tarefas);
    }
    const revisao = S.revisao();
    const dia = S.hoje();
    const chave = JSON.stringify([revisao, dia, usuario]);
    if (cache && cache.chave === chave) {
      contadores.hits++;
      return copiar(cache.fila);
    }
    if (cache) contadores.invalidacoes++;
    contadores.misses++;
    const medidor = global.IADPerformance;
    const calcular = function () { return E.fila(est.oportunidades, est.tarefas); };
    const resultado = medidor ? medidor.medir('perf02.fila-miss', calcular) : calcular();
    /* Se houve escrita durante o cálculo, não conservar resultado potencialmente
       misto. A próxima leitura refaz a fila na revisão atual. */
    cache = S.revisao() === revisao && escopo() === usuario && S.hoje() === dia
      ? { chave: chave, fila: resultado } : null;
    return copiar(resultado);
  }

  function limpar() {
    cache = null;
    contadores.hits = 0;
    contadores.misses = 0;
    contadores.invalidacoes = 0;
  }

  global.IADPerf02 = {
    filaDados: filaDados, limpar: limpar,
    estatisticas: function () {
      return { hits: contadores.hits, misses: contadores.misses,
        invalidacoes: contadores.invalidacoes, ativo: !!cache };
    }
  };
})(window);
