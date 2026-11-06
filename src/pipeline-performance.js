/* PERF-03A: snapshot de resumos do Pipeline, válido por revisão, data e escopo.
   É exclusivamente cache em memória, sem persistência e sem alterar E.resumo. */
(function (global) {
  'use strict';
  let atual = null;
  let parcial = null;
  const contadores = { hits: 0, misses: 0 };
  function escopo() {
    const S = global.IADStore;
    const c = S && S.contexto && S.contexto();
    if (!c || !c.usuario || !c.usuario.id) return null;
    const f = c.filtros || {};
    return JSON.stringify([c.usuario.id, c.usuario.papel || '',
      c.tenantId || '', !!c.admin, !!c.gestor, f.tenant || '', f.usuario || '']);
  }
  function resumos(est) {
    const S = global.IADStore, E = global.IADEngine;
    const identidade = escopo();
    if (!est || !Array.isArray(est.oportunidades) || !Array.isArray(est.tarefas)) {
      throw new Error('PERF-03A: entrada inválida');
    }
    const cacheavel = identidade && S && typeof S.revisao === 'function';
    if (!cacheavel) atual = null;
    const revisao = cacheavel ? S.revisao() : null;
    const dia = cacheavel ? S.hoje() : '';
    const chave = cacheavel ? JSON.stringify([revisao, dia, identidade]) : '';
    if (cacheavel && atual && atual.chave === chave) {
      contadores.hits++;
      return atual.resumos.slice();
    }
    contadores.misses++;
    const calcular = function () {
      /* O mesmo universo de tarefas que E.tarefasAtrasadas(op) enxergaria
         (Store.dados), porém agrupado apenas uma vez por renderização. */
      const atrasadas = Object.create(null);
      const hoje = S.hoje();
      est.tarefas.forEach(function (t) {
        if (t.oportunidadeId == null || t.status !== 'aberta' ||
            !t.vencimento || !(t.vencimento < hoje)) return;
        atrasadas[t.oportunidadeId] = (atrasadas[t.oportunidadeId] || 0) + 1;
      });
      return est.oportunidades.map(function (o) { return E.resumo(o, atrasadas); });
    };
    /* P5e: reutilização opcional dos resumos do Pipeline.
       O mecanismo original permanece fallback e fonte de verdade. */
    if (global.IAD_P5E_PIPELINE_ENABLED === true && global.IADP5e && cacheavel && est.oportunidades.every(function(o) { return !o.desfecho; })) {
      try {
        if (!global.__iadP5ePipeline) global.__iadP5ePipeline = global.IADP5e.criar(S, E);
        const indice = Object.create(null), hojeLocal = S.hoje();
        est.tarefas.forEach(function(t) {
          if (t.oportunidadeId == null || t.status !== 'aberta' ||
              !t.vencimento || !(t.vencimento < hojeLocal)) return;
          indice[t.oportunidadeId] = (indice[t.oportunidadeId] || 0) + 1;
        });
        const saidaIncremental = global.__iadP5ePipeline.calcular(est.oportunidades, indice).resumos;
        return saidaIncremental.slice();
      } catch (erro) {
        console.warn('[P5e pipeline] fallback:', erro.message);
        if (global.__iadP5ePipeline) global.__iadP5ePipeline.revogar();
        global.__iadP5ePipeline = null;
      }
    } else if (global.__iadP5ePipeline) {
      global.__iadP5ePipeline.revogar();
      global.__iadP5ePipeline = null;
    }
    const perf = global.IADPerformance;
    const saida = perf ? perf.medir('perf03.pipeline-resumos-miss', calcular) : calcular();
    atual = cacheavel && S.revisao() === revisao && S.hoje() === dia &&
      escopo() === identidade ? { chave: chave, resumos: saida } : null;
    return saida.slice();
  }
  /* PERF-36: calcular somente oportunidades elegíveis pelos filtros baratos.
   * A fonte é Store.dados() sob o mesmo escopo/tenant da renderização.
   * Cache parcial é efêmero: revisão, dia e identidade devem coincidir.
   * Nunca ativar com flags P5e: manter paridade e fallback existentes. */
  function resumosElegiveis(est, elegiveis) {
    if (!est || !Array.isArray(est.oportunidades) ||
        !Array.isArray(est.tarefas) || !Array.isArray(elegiveis))
      throw Error('PERF-36: entrada inválida');
    const S = global.IADStore, E = global.IADEngine;
    if (elegiveis.length === est.oportunidades.length) return resumos(est);
    if (global.IAD_P5E_PIPELINE_ENABLED === true) {
      const selecionadas = new Set(elegiveis);
      return resumos(est).filter(function (r) { return selecionadas.has(r.op); });
    }
    const identidade = escopo();
    const seguro = !!(identidade && S && typeof S.revisao === 'function' && typeof S.hoje === 'function');
    const rev = seguro ? S.revisao() : null;
    const dia = seguro ? S.hoje() : '';
    const chave = seguro ? JSON.stringify([rev,dia,identidade]) : '';
    if (seguro && atual && atual.chave === chave) {
      const selecionadas = new Set(elegiveis);
      return atual.resumos.filter(function (r) { return selecionadas.has(r.op); });
    }
    if (!seguro || !parcial || parcial.chave !== chave) {
      const atrasadas = Object.create(null);
      const hoje = S.hoje();
      est.tarefas.forEach(function (t) {
        if (t.oportunidadeId == null || t.status !== 'aberta' ||
            !t.vencimento || !(t.vencimento < hoje)) return;
        atrasadas[t.oportunidadeId] = (atrasadas[t.oportunidadeId] || 0) + 1;
      });
      parcial = seguro ? { chave, valores:new Map(), atrasadas } : null;
      if (!seguro) return elegiveis.map(function (op) { return E.resumo(op,atrasadas); });
    }
    const perf=global.IADPerformance;
    return elegiveis.map(function (op) {
      if (parcial.valores.has(op)) return parcial.valores.get(op);
      const calcular=function () { return E.resumo(op,parcial.atrasadas); };
      const result=perf ? perf.medir('perf36.pipeline.resumo-elegivel',calcular) : calcular();
      /* Uma escrita pode ocorrer no cálculo; jamais cachear revisão obsoleta. */
      if(S.revisao()===rev && S.hoje()===dia && escopo()===identidade)
        parcial.valores.set(op,result);
      else parcial=null;
      return result;
    });
  }
  global.IADPipelinePerf = {
    resumos: resumos,
    resumosElegiveis: resumosElegiveis,
    limpar: function () { atual = null; parcial = null; },
    estatisticas: function () { return { hits: contadores.hits,
      misses: contadores.misses, ativo: !!atual,
      selecionadosEmCache: parcial ? parcial.valores.size : 0 }; }
  };
})(window);
