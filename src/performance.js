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
      const p50 = vals.length ? vals[Math.ceil(vals.length * .50)-1] : 0;
      const p95 = vals.length ? vals[Math.ceil(vals.length * .95)-1] : 0;
      resultado[nome] = {
        chamadas: o.chamadas,
        totalMs: +o.totalMs.toFixed(1),
        mediaMs: +(o.totalMs / o.chamadas).toFixed(1),
        p50Ultimas100Ms: +p50.toFixed(1),
        p95Ultimas100Ms: +p95.toFixed(1),
        maxMs: +o.maxMs.toFixed(1)
      };
    });
    if (typeof console !== 'undefined' && console.table) console.table(resultado);
    return resultado;
  }
  global.IADPerformance = {
    iniciar: function () { ativo = true; return 'Medição iniciada — não envia dados.'; },
    parar: function () { ativo = false; return relatorio(); },
    limpar: function () { Object.keys(amostras).forEach(function(k){delete amostras[k];}); },
    medir: medir, registrar: registrar, relatorio: relatorio,
    ativo: function () { return ativo; }
  };
})(window);
