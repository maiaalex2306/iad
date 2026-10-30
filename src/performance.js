/* PERF-01: métricas locais, sem envio de dados ao servidor.
   Ative no Console: IADPerformance.iniciar()
   Após navegar: IADPerformance.relatorio();  Desative: IADPerformance.parar()
   Coleta somente duração e contagem, nunca conteúdo dos registros. */
(function (global) {
  'use strict';
  let ativo = false;
  const amostras = Object.create(null);
  const agora = function () {
    return global.performance && typeof global.performance.now === 'function'
      ? global.performance.now() : Date.now();
  };
  function registrar(nome, ms) {
    if (!ativo) return;
    const o = amostras[nome] || (amostras[nome] = {
      chamadas: 0, totalMs: 0, maxMs: 0, ultimasMs: []
    });
    const v = Math.max(0, Number(ms) || 0);
    o.chamadas++;
    o.totalMs += v;
    o.maxMs = Math.max(o.maxMs, v);
    o.ultimasMs.push(v);
    if (o.ultimasMs.length > 100) o.ultimasMs.shift();
  }
  function medir(nome, funcao) {
    if (!ativo) return funcao();
    const inicio = agora();
    try { return funcao(); }
    finally { registrar(nome, agora() - inicio); }
  }
  function relatorio() {
    const resultado = {};
    Object.keys(amostras).forEach(function (nome) {
      const o = amostras[nome];
      const vals = o.ultimasMs.slice().sort(function (a,b) { return a-b; });
      const p95 = vals.length ? vals[Math.ceil(vals.length * .95)-1] : 0;
      resultado[nome] = {
        chamadas: o.chamadas,
        totalMs: +o.totalMs.toFixed(1),
        mediaMs: +(o.totalMs / o.chamadas).toFixed(1),
        p95Ultimas100Ms: +p95.toFixed(1),
        maxMs: +o.maxMs.toFixed(1)
      };
    });
    if (typeof console !== 'undefined' && console.table) console.table(resultado);
    return resultado;
  }
  // PERF-04 P3: Web Vitals coletados apenas sob ativação explícita.
  // Não persistir, transmitir, registrar nomes de oportunidades nem URLs.
  let observers = [];
  const vitals = { lcpMs: null, inpMs: null, cls: 0, amostrasINP: 0 };
  function observarVital(tipo, callback) {
    if (typeof global.PerformanceObserver !== 'function') return;
    try {
      const supported = global.PerformanceObserver.supportedEntryTypes || [];
      if (!supported.includes(tipo)) return;
      const observer = new global.PerformanceObserver(function (list) {
        if (!ativo) return;
        list.getEntries().forEach(callback);
      });
      observer.observe({ type: tipo, buffered: true });
      observers.push(observer);
    } catch (_) { /* Alguns navegadores não oferecem estas entradas. */ }
  }
  function iniciarVitals() {
    ativo = true;
    if (observers.length) return;
    observarVital('largest-contentful-paint', function (entry) {
      if (Number.isFinite(entry.startTime)) vitals.lcpMs = Math.round(entry.startTime);
    });
    observarVital('event', function (entry) {
      if (!Number.isFinite(entry.duration) || !entry.interactionId) return;
      vitals.inpMs = Math.max(vitals.inpMs || 0, Math.round(entry.duration));
      vitals.amostrasINP++;
    });
    observarVital('layout-shift', function (entry) {
      if (!entry.hadRecentInput && Number.isFinite(entry.value))
        vitals.cls = Math.round((vitals.cls + entry.value) * 10000) / 10000;
    });
  }
  function pararVitals() {
    observers.forEach(function (observer) { observer.disconnect(); });
    observers = [];
    ativo = false;
    return relatorioVitals();
  }
  function relatorioVitals() {
    return { lcpMs: vitals.lcpMs, inpEstimadoMs: vitals.inpMs,
      cls: vitals.cls, interacoesObservadas: vitals.amostrasINP,
      metodologia: 'INP estimado (maior interação observada), não INP oficial do ciclo completo da página',
      escopo: 'local; nenhuma transferência automática de dados' };
  }
  function limparVitals() {
    vitals.lcpMs = null; vitals.inpMs = null; vitals.cls = 0; vitals.amostrasINP = 0;
  }
  global.IADPerformance = {
    iniciar: function () { ativo = true; return 'Medição iniciada — não envia dados.'; },
    parar: function () { ativo = false; return relatorio(); },
    limpar: function () { Object.keys(amostras).forEach(function(k){delete amostras[k];}); },
    medir: medir, registrar: registrar, relatorio: relatorio,
    ativo: function () { return ativo; },
    iniciarVitals: iniciarVitals, pararVitals: pararVitals,
    relatorioVitals: relatorioVitals, limparVitals: limparVitals
  };
})(window);
