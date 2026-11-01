/* PERF-01: métricas locais, sem envio de dados ao servidor.
   Ative no Console: IADPerformance.iniciar()
   Após navegar: IADPerformance.relatorio();  Desative: IADPerformance.parar()
   Coleta somente duração e contagem, nunca conteúdo dos registros. */
(function (global) {
  'use strict';
  let ativo = false;
  const amostras = Object.create(null);
  const MAX_AMOSTRAS = 100;
  const MIN_AMOSTRAS = 20;
  /* Apenas nomes técnicos conhecidos; nenhum ID, nome comercial ou parâmetro
     enviado por telas pode se tornar chave de relatório. */
  const CHAVES_FIXAS = new Set([
    'dom.cockpit', 'hoje.fila', 'hoje.cartoes', 'p5d.eventos', 'teste',
    'perf03b.cockpit-resumo', 'perf03b.trocar-aba', 'perf10.tarefa',
    'perf10.cockpit.resumo', 'perf10.cockpit.dois-frames',
    'perf10.cockpit.proximo-frame', 'perf10.cockpit.inicializar-arquivos',
    'perf10.cockpit.inicializar-quadro', 'perf10.cockpit.abas.cabecalho',
    'perf10.cockpit.aba.conteudo', 'perf10.cockpit.tarefas.render',
    'perf10.aba.gerar-html', 'perf10.aba.atualizar-dom',
    'perf10.aba.proximo-frame', 'longtask.navegador', 'tela.cockpit'
  ]);
  const ABAS = new Set(['decisao', 'historico', 'tarefas', 'whatsapp',
    'sinais', 'email', 'propostas', 'produtos', 'arquivos']);
  const ROTAS = new Set(['hoje','painel','pipeline','tarefas','nutricao',
    'contas','cadastros','dados','revisao','config','configuracao',
    'usuarios','playbook','notas','conversas','campanhas']);
  const LIMITES_MS = Object.freeze({
    'tela.cockpit': 250,
    'dom.cockpit': 120,
    'tela.#/pipeline': 250,
    'perf10.aba.gerar-html': 120,
    'perf10.aba.atualizar-dom': 120,
    'perf10.cockpit.dois-frames': 300,
    'perf10.aba.proximo-frame': 250,
    'longtask.navegador': 200
  });
  let observador = null;
  function nomeTecnico(valor) {
    const n = String(valor == null ? '' : valor);
    if (CHAVES_FIXAS.has(n)) return n;
    if (n.indexOf('tela.') === 0) {
      const m = /^tela\.#\/([a-z]+)$/.exec(n);
      return m && ROTAS.has(m[1]) ? n : 'tela.outra-rota';
    }
    let m = /^perf10\.aba\.(?:dois-frames\.)?([a-z]+)$/.exec(n);
    if (m && ABAS.has(m[1])) return n;
    m = /^perf10\.cockpit\.detalhe(?:\.dom)?\.([a-z-]+)$/.exec(n);
    /* Detalhes lazy podem carregar nomes arbitrários: agrupar por tipo
       sem usar IDs ou nomes passados como argumentos. */
    if (m) return n.indexOf('.dom.') >= 0
      ? 'perf10.cockpit.detalhe.dom.outros'
      : 'perf10.cockpit.detalhe.outros';
    return 'metrica.outra';
  }
  const agora = function () {
    return global.performance && typeof global.performance.now === 'function'
      ? global.performance.now() : Date.now();
  };
  function registrar(nome, ms) {
    if (!ativo) return;
    const v = Number(ms);
    if (!Number.isFinite(v) || v < 0) return;
    const chave = nomeTecnico(nome);
    const o = amostras[chave] || (amostras[chave] = {
      chamadas: 0, totalMs: 0, maxMs: 0, ultimasMs: []
    });
    o.chamadas++;
    o.totalMs += v;
    o.maxMs = Math.max(o.maxMs, v);
    o.ultimasMs.push(v);
    if (o.ultimasMs.length > MAX_AMOSTRAS) o.ultimasMs.shift();
  }
  function observarLongTasks() {
    if (observador || typeof global.PerformanceObserver !== 'function') return;
    try {
      observador = new global.PerformanceObserver(function (lista) {
        /* Proibido coletar entry.name, attribution, URL ou stack.
           Apenas duração; medição local somente com opt-in. */
        lista.getEntries().forEach(function (e) {
          if (e.entryType === 'longtask') registrar('longtask.navegador', e.duration);
        });
      });
      observador.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      if (observador) { try { observador.disconnect(); } catch (ignorar) {} }
      observador = null;
    }
  }
  function pararObservador() {
    if (!observador) return;
    try { observador.disconnect(); } catch (ignorar) {}
    observador = null;
  }
  /* Diagnóstico agregado local; sem decisões com menos de 20 amostras.
     Os limites são metas de triagem, NÃO atestado de SLO de produção. */
  function avaliar() {
    const r = relatorio(true), resultado = {};
    Object.keys(LIMITES_MS).forEach(function (chave) {
      const dado = r[chave], limite = LIMITES_MS[chave];
      const n = dado ? dado.amostrasPercentis : 0;
      resultado[chave] = {
        amostras: n, limiteP95Ms: limite,
        p95Ms: dado ? dado.p95Ultimas100Ms : null,
        situacao: n < MIN_AMOSTRAS ? 'amostra-insuficiente'
          : dado.p95Ultimas100Ms <= limite ? 'dentro-do-limite' : 'acima-do-limite'
      };
    });
    return {versaoEsquema:1, local:true, coletaAtiva:ativo,
      minimoAmostras:MIN_AMOSTRAS, metricas:resultado};
  }
  function medir(nome, funcao) {
    if (!ativo) return funcao();
    const inicio = agora();
    try { return funcao(); }
    finally { registrar(nome, agora() - inicio); }
  }
  /* PERF-10 P5: dois frames são aproximação do próximo paint,
     não prova de pixels apresentados. Medição opcional, somente leitura. */
  function medirDoisFrames(nome, inicio) {
    if (!ativo || typeof global.requestAnimationFrame !== 'function') return false;
    const t0 = Number(inicio);
    if (!Number.isFinite(t0)) return false;
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(function () {
        registrar(nome, agora() - t0);
      });
    });
    return true;
  }
  function relatorio(silencioso) {
    const resultado = {};
    Object.keys(amostras).forEach(function (nome) {
      const o = amostras[nome];
      const vals = o.ultimasMs.slice().sort(function (a,b) { return a-b; });
      const p50 = vals.length ? vals[Math.ceil(vals.length * .50)-1] : 0;
      const p95 = vals.length ? vals[Math.ceil(vals.length * .95)-1] : 0;
      resultado[nome] = {
        chamadas: o.chamadas,
        amostrasPercentis: vals.length,
        totalMs: +o.totalMs.toFixed(1),
        mediaMs: +(o.totalMs / o.chamadas).toFixed(1),
        p50Ultimas100Ms: +p50.toFixed(1),
        p95Ultimas100Ms: +p95.toFixed(1),
        maxMs: +o.maxMs.toFixed(1)
      };
    });
    if (!silencioso && typeof console !== 'undefined' && console.table) console.table(resultado);
    return resultado;
  }
  /* Exportação local auditável: somente nomes técnicos de métricas e durações.
     O resultado não contém IDs, nomes, e-mails, conteúdo ou dados de cliente. */
  function exportarJSON() {
    return JSON.stringify({
      formato: 'iad-perf-10-p7',
      versaoEsquema: 1,
      escopo: 'esta-sessao',
      metodologia: 'p50 e p95 das últimas 100 amostras por métrica; dois frames não garantem paint',
      metricas: relatorio(true),
      diagnostico: avaliar()
    }, null, 2);
  }
  global.IADPerformance = {
    iniciar: function () {
      if (!ativo) { ativo = true; observarLongTasks(); }
      return 'Medição iniciada — não envia dados.';
    },
    parar: function () {
      ativo = false;
      pararObservador();
      return relatorio();
    },
    limpar: function () { Object.keys(amostras).forEach(function(k){delete amostras[k];}); },
    medir: medir, registrar: registrar, relatorio: relatorio,
    medirDoisFrames: medirDoisFrames, agora: agora,
    exportarJSON: exportarJSON, avaliar: avaliar,
    ativo: function () { return ativo; }
  };
})(window);
