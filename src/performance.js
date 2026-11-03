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
  /* PERF-23: a mesma métrica para Promise, incluindo falhas.
     Nunca armazena payload, endpoint, token, ID ou motivo de erro.
     Preserva o resultado e rejeição da operação original e não mede
     nada quando o usuário não ativou a instrumentação local. */
  function medirPromessa(nome, operacao) {
    if (!ativo) return operacao();
    const inicio = agora();
    const concluir = function () { registrar(nome, agora() - inicio); };
    let resultado;
    try { resultado = operacao(); }
    catch (erro) { concluir(); throw erro; }
    return Promise.resolve(resultado).then(
      function (valor) { concluir(); return valor; },
      function (erro) { concluir(); throw erro; }
    );
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
  /* PERF-17: cronometro opt-in de clique ate dois frames do cockpit.
     Nunca recebe ID, nome, hash ou registro; somente tokens numericos e nomes
     tecnicos de etapas predefinidas. Dois frames nao comprovam paint fisico.
     Uma nova abertura invalida os callbacks da abertura anterior. */
  const ETAPAS_ABERTURA = ['rota', 'html', 'dom', 'widgets', 'frame1', 'frame2'];
  let proximoTokenAbertura = 0;
  let abertura = null;

  function iniciarAbertura() {
    if (!ativo) return 0;
    const inicio = agora();
    abertura = { token: ++proximoTokenAbertura, inicio: inicio,
      anterior: inicio, ultimaEtapa: -1 };
    return abertura.token;
  }

  function aberturaPendente() {
    return ativo && abertura ? abertura.token : 0;
  }

  function cancelarAbertura(token) {
    if (!abertura || (token && abertura.token !== token)) return false;
    abertura = null;
    return true;
  }

  function etapaAbertura(token, etapa) {
    if (!ativo || !abertura || token !== abertura.token) return false;
    const posicao = ETAPAS_ABERTURA.indexOf(etapa);
    if (posicao < 0 || posicao <= abertura.ultimaEtapa) return false;
    /* Nao mascarar marcas faltantes em fluxos interrompidos. */
    if (posicao !== abertura.ultimaEtapa + 1) {
      abertura = null;
      return false;
    }
    const agoraMs = agora();
    registrar('perf17.cockpit.ate-' + etapa, agoraMs - abertura.inicio);
    registrar('perf17.cockpit.etapa-' + etapa, agoraMs - abertura.anterior);
    abertura.anterior = agoraMs;
    abertura.ultimaEtapa = posicao;
    if (etapa === 'frame2') {
      registrar('perf17.cockpit.clique-a-dois-frames', agoraMs - abertura.inicio);
      abertura = null;
    }
    return true;
  }

  /* Exportação local auditável: somente nomes técnicos de métricas e durações.
     O resultado não contém IDs, nomes, e-mails, conteúdo ou dados de cliente. */
  function exportarJSON() {
    return JSON.stringify({
      formato: 'iad-perf-10-p7',
      versaoEsquema: 1,
      escopo: 'esta-sessao',
      metodologia: 'p50 e p95 das últimas 100 amostras por métrica; PERF-17: clique a dois frames não comprova paint físico; PERF-23: duração das chamadas ao servidor e da sincronização, com grupos sem URLs; intervalos de rede podem se sobrepor',
      metricas: relatorio(true)
    }, null, 2);
  }
  /* PERF-24: allowlist estrita — a tela e o JSON baixado pelo usuario
     jamais incluem nomes de metricas customizadas que por engano recebam
     IDs, emails, URLs ou outros valores comerciais. Não alterar o relatório
     de engenharia legado nem coletar informações em segundo plano. */
  const CHAVES_DIAGNOSTICO = [
    'perf17.cockpit.clique-a-dois-frames',
    'perf17.cockpit.etapa-rota',
    'perf17.cockpit.etapa-html',
    'perf17.cockpit.etapa-dom',
    'perf17.cockpit.etapa-widgets',
    'perf17.cockpit.etapa-frame1',
    'perf17.cockpit.etapa-frame2',
    'tela.cockpit',
    'dom.cockpit',
    'perf10.cockpit.resumo',
    'perf03b.cockpit-resumo',
    'perf10.cockpit.inicializar-quadro',
    /* PERF-31: cronometros fixos de abertura e quatro contadores no cabecalho. */
    'perf31.cockpit.abas.inicial',
    'perf31.cockpit.conteudo.inicial',
    'perf31.badge.tarefas',
    'perf31.badge.whatsapp',
    'perf31.badge.sinais',
    'perf31.badge.email',
    /* PERF-26: métricas fixas já coletadas na troca de abas; sem IDs ou nomes comerciais. */
    'perf10.cockpit.abas.cabecalho',
    'perf10.cockpit.aba.conteudo',
    'perf10.aba.decisao',
    'perf10.aba.historico',
    'perf10.aba.tarefas',
    'perf10.aba.whatsapp',
    'perf10.aba.sinais',
    'perf10.aba.email',
    'perf10.aba.propostas',
    'perf10.aba.produtos',
    'perf10.aba.arquivos',
    'perf23.sync.puxar',
    'perf23.sync.manual',
    'perf23.sync.entrada',
    'perf23.rede.rest',
    'perf23.rede.auth',
    'perf23.rede.functions',
    'perf23.rede.storage',
    'perf23.rede.outros'
  ];
  function relatorioDiagnostico() {
    const bruto = relatorio(true);
    const seguro = {};
    CHAVES_DIAGNOSTICO.forEach(function (chave) {
      if (Object.prototype.hasOwnProperty.call(bruto, chave))
        seguro[chave] = bruto[chave];
    });
    return seguro;
  }
  function exportarDiagnosticoJSON() {
    return JSON.stringify({
      formato: 'iad-perf24-diagnostico',
      versaoEsquema: 1,
      escopo: 'esta-sessao',
      privacidade: 'somente metricas predefinidas; sem IDs, nomes, URLs, tokens ou conteudo comercial',
      metodologia: 'P50/P95 das últimas 100 amostras de cada indicador; mínimo sugerido 30 aberturas; dois frames não comprovam pintura; chamadas de rede e sincronização podem se sobrepor e não devem ser somadas',
      metricas: relatorioDiagnostico()
    }, null, 2);
  }

  global.IADPerformance = {
    iniciar: function () { ativo = true; return 'Medição iniciada — não envia dados.'; },
    parar: function () { ativo = false; abertura = null; return relatorio(); },
    limpar: function () { abertura = null; Object.keys(amostras).forEach(function(k){delete amostras[k];}); },
    medir: medir, medirPromessa: medirPromessa, registrar: registrar, relatorio: relatorio,
    medirDoisFrames: medirDoisFrames, agora: agora,
    iniciarAbertura: iniciarAbertura, aberturaPendente: aberturaPendente,
    etapaAbertura: etapaAbertura, cancelarAbertura: cancelarAbertura,
    exportarJSON: exportarJSON,
    relatorioDiagnostico: relatorioDiagnostico,
    exportarDiagnosticoJSON: exportarDiagnosticoJSON,
    ativo: function () { return ativo; }
  };
})(window);
