/* Os funis: o declarado, o real, e o que fica entre os dois.
   ==================================================================
   O funil que a internet ensina — topo, meio, fundo — mede ONDE O VENDEDOR
   COLOCOU o negócio. É o funil declarado, e é o que todo CRM mostra. Ele
   responde "quantos estão em Proposta", que é uma pergunta sobre nós.

   Este app existe porque essa pergunta não prevê nada. A tese inteira é que
   ETAPA NÃO É DECISÃO: o negócio avança quando o CLIENTE decide, e um pipeline
   cheio de "Proposta" com índice 4 é uma previsão de receita que não vai
   acontecer.

   Então aqui há DOIS funis, lado a lado de propósito:

     · o DECLARADO    — as etapas do CRM, onde o vendedor pôs cada negócio.
     · o REAL         — as oito decisões, na ordem em que acontecem dentro do
                        cliente. Quantos de fato reconheceram o problema?
                        Quantos têm critério escrito? É um funil sobre ELES.

   E a diferença entre os dois é o número mais útil da tela: o FALSO AVANÇADO.
   Negócio em etapa adiantada cuja decisão não acompanhou. Nenhum outro CRM
   mostra isso porque nenhum outro mede os dois lados.

   O terceiro funil é o da NUTRIÇÃO, que é o destino honesto de quem não está
   pronto: entrou, por quê, voltou, e quanto tempo ficou. Sem ele, "não é
   agora" vira "encerrado" e a conta some da cabeça de todo mundo.

   Tudo aqui é CÁLCULO PURO: entra lista de registros, sai número. Nada lê a
   tela, nada grava. É o que permite testar cada conta sem navegador.
*/
(function (global) {
  'use strict';

  const P = global.IADPlaybook;
  const E = global.IADEngine;

  /* Nota 2 é "Declarado": o cliente disse, com palavras dele. É o primeiro
     degrau em que a decisão deixa de ser suposição nossa — e por isso é o
     corte que define se ela ACONTECEU. Abaixo disso é achismo do vendedor,
     e contar achismo num funil é o que faz pipeline inflado. */
  const CORTE = 2;

  const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  function diaDaSemana(iso) {
    if (!iso) return -1;
    /* Meio-dia para não cair no dia anterior por fuso: '2026-10-01' lido como
       UTC vira 30/09 à noite no Brasil, e aí toda segunda vira domingo. */
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    return isNaN(d.getTime()) ? -1 : d.getDay();
  }

  function dias(a, b) {
    if (!a || !b) return null;
    const x = new Date(String(a).slice(0, 10) + 'T12:00:00');
    const y = new Date(String(b).slice(0, 10) + 'T12:00:00');
    if (isNaN(x.getTime()) || isNaN(y.getTime())) return null;
    return Math.round((y - x) / 86400000);
  }

  function soma(lista, fn) {
    return lista.reduce(function (s, x) { return s + (fn(x) || 0); }, 0);
  }

  function media(lista, fn) {
    return lista.length ? soma(lista, fn) / lista.length : 0;
  }

  /* ---------------- os filtros ----------------

     Um objeto só, e todo campo é opcional. O gestor combina o que quiser, e o
     que ele não escolheu não recorta nada — filtro que não foi pedido não pode
     esconder dado. */
  function vazio() {
    return { de: '', ate: '', responsavel: '', segmento: '', campanha: '', sdr: '',
             fonte: '', uf: '', origem: '', situacao: 'todas' };
  }

  function contaDe(op, contas) { return contas[op.contaId] || null; }

  /* A data pela qual o negócio entra no recorte: a de criação. É quando ele
     chegou à carteira, e é a única que existe em TODOS — fechamento previsto
     muda, desfecho só existe em quem fechou. */
  function dentroDoPeriodo(iso, f) {
    const d = String(iso || '').slice(0, 10);
    if (!d) return !f.de && !f.ate;
    if (f.de && d < f.de) return false;
    if (f.ate && d > f.ate) return false;
    return true;
  }

  function filtrar(est, filtros) {
    const f = Object.assign(vazio(), filtros || {});
    const contas = {};
    (est.contas || []).forEach(function (c) { contas[c.id] = c; });

    return (est.oportunidades || []).filter(function (op) {
      const c = contaDe(op, contas);
      if (!dentroDoPeriodo(op.criadoEm, f)) return false;
      if (f.responsavel && String(op.donoId || '') !== f.responsavel) return false;
      if (f.segmento && String((c && c.segmento) || '') !== f.segmento) return false;
      if (f.campanha && String(op.campanha || '') !== f.campanha) return false;
      if (f.sdr && String(op.sdr || '') !== f.sdr) return false;
      if (f.fonte && String(op.fonteId || op.origem || '') !== f.fonte) return false;
      if (f.uf && String((c && c.uf) || '').toUpperCase() !== f.uf.toUpperCase()) return false;
      if (f.origem && String(op.origem || '') !== f.origem) return false;

      if (f.situacao === 'abertas' && op.desfecho) return false;
      if (f.situacao === 'ganhas' && !(op.desfecho && op.desfecho.tipo === 'ganho')) return false;
      if (f.situacao === 'perdidas' && !(op.desfecho && op.desfecho.tipo !== 'ganho')) return false;
      if (f.situacao === 'nutricao' && !op.nutricao) return false;
      return true;
    });
  }

  /* Tudo o que existe para escolher, tirado dos próprios dados. Oferecer uma
     campanha que não tem negócio nenhum é ruído com cara de opção. */
  function opcoesDeFiltro(est) {
    const contas = {};
    (est.contas || []).forEach(function (c) { contas[c.id] = c; });
    const junta = function (fn) {
      const vistos = {};
      (est.oportunidades || []).forEach(function (op) {
        const v = fn(op, contas[op.contaId] || {});
        if (v) vistos[v] = true;
      });
      return Object.keys(vistos).sort(function (a, b) { return a.localeCompare(b); });
    };
    return {
      campanhas: junta(function (op) { return String(op.campanha || '').trim(); }),
      sdrs: junta(function (op) { return String(op.sdr || '').trim(); }),
      segmentos: junta(function (op, c) { return String(c.segmento || '').trim(); }),
      ufs: junta(function (op, c) { return String(c.uf || '').trim().toUpperCase(); }),
      origens: junta(function (op) { return String(op.origem || '').trim(); })
    };
  }

  /* ---------------- o funil REAL: as oito decisões ----------------

     Em funil de verdade: cada degrau conta quem chegou NELE E em todos os
     anteriores. Contar cada decisão isolada daria um gráfico de barras, não um
     funil — e esconderia o caso que mais importa, o do negócio que tem
     "critérios" sem ter "problema", que é decisão construída no ar. */
  function funilDaDecisao(ops) {
    const ordem = (E && E.ORDEM_DECISAO) || [];
    const nomes = {};
    (P.DIMENSOES || []).forEach(function (d) { nomes[d.id] = d.nome; });

    let restantes = ops.slice();
    const entrada = restantes.length;
    const degraus = ordem.map(function (id) {
      restantes = restantes.filter(function (op) { return ((op.dims || {})[id] || 0) >= CORTE; });
      return {
        id: id, nome: nomes[id] || id,
        qtd: restantes.length,
        valor: soma(restantes, function (op) { return op.valor; }),
        /* Dos que chegaram ao degrau anterior, quantos passaram deste. É onde
           a carteira trava, e é a pergunta que o gestor faz. */
        deEntrada: entrada ? restantes.length / entrada : 0
      };
    });

    degraus.forEach(function (d, i) {
      const antes = i === 0 ? entrada : degraus[i - 1].qtd;
      d.doAnterior = antes ? d.qtd / antes : 0;
      d.perdidos = Math.max(0, antes - d.qtd);
    });

    /* Onde mais gente para. Não é o degrau mais vazio: é o que derruba mais
       entre um passo e o seguinte. */
    const gargalo = degraus.slice().sort(function (a, b) { return b.perdidos - a.perdidos; })[0] || null;
    return { entrada: entrada, degraus: degraus, gargalo: gargalo };
  }

  /* ---------------- o funil DECLARADO: as etapas do CRM ---------------- */
  function funilDaEtapa(ops) {
    const etapas = P.ETAPAS || [];
    const porEtapa = {};
    etapas.forEach(function (e) { porEtapa[e] = { etapa: e, qtd: 0, valor: 0, iad: 0, falsos: 0 }; });

    ops.forEach(function (op) {
      const e = porEtapa[op.etapa];
      if (!e) return;
      e.qtd++;
      e.valor += op.valor || 0;
      e.iad += E.iad(op);
      if (ehFalsoAvancado(op)) e.falsos++;
    });

    const lista = etapas.map(function (nome) {
      const e = porEtapa[nome];
      e.iadMedio = e.qtd ? e.iad / e.qtd : 0;
      return e;
    });

    /* Funil de etapa é cumulativo para trás: quem está em Proposta passou por
       Diagnóstico. Contar só quem está parado em cada coluna faz o "funil"
       subir e descer, que não é funil nenhum. */
    let acumulado = 0;
    for (let i = lista.length - 1; i >= 0; i--) {
      acumulado += lista[i].qtd;
      lista[i].chegaram = acumulado;
    }
    const entrada = lista.length ? lista[0].chegaram : 0;
    lista.forEach(function (e, i) {
      const antes = i === 0 ? entrada : lista[i - 1].chegaram;
      e.doAnterior = antes ? e.chegaram / antes : 0;
      e.deEntrada = entrada ? e.chegaram / entrada : 0;
    });
    return { entrada: entrada, degraus: lista };
  }

  /* Etapa adiantada sem a decisão correspondente. A régua é a mesma do motor:
     o que cada etapa exige está no playbook, e repetir o critério aqui faria
     a tela discordar do cockpit no dia em que um dos dois mudasse. */
  function ehFalsoAvancado(op) {
    if (!E || !E.classificar) return false;
    const c = E.classificar(op);
    return !!(c && c.id === 'falso_avancado');
  }

  /* ---------------- o funil da NUTRIÇÃO ----------------

     Não é um funil de etapas: é um CICLO. Entra quem não está pronto, sai quem
     ficou — e o número que importa é quantos VOLTARAM, porque é ele que diz se
     nutrir serve para alguma coisa nesta carteira ou se é só um cemitério com
     nome melhor. */
  function funilDaNutricao(ops) {
    const dentro = ops.filter(function (op) { return !!op.nutricao; });
    const comHistorico = ops.filter(function (op) { return (op.historicoNutricao || []).length; });

    const passagens = [];
    comHistorico.forEach(function (op) {
      (op.historicoNutricao || []).forEach(function (h) {
        passagens.push({ op: op, h: h, dias: dias(h.desde, h.retomadaEm) });
      });
    });

    const voltaram = {};
    comHistorico.forEach(function (op) { voltaram[op.id] = op; });
    const voltaramLista = Object.keys(voltaram).map(function (k) { return voltaram[k]; });
    const ganharamDepois = voltaramLista.filter(function (op) {
      return op.desfecho && op.desfecho.tipo === 'ganho';
    });

    const porMotivo = {};
    dentro.forEach(function (op) {
      const m = String((op.nutricao && (op.nutricao.motivoTexto || op.nutricao.motivo)) || 'sem motivo');
      porMotivo[m] = porMotivo[m] || { motivo: m, qtd: 0, valor: 0 };
      porMotivo[m].qtd++;
      porMotivo[m].valor += op.valor || 0;
    });

    const hoje = global.IADStore ? global.IADStore.hoje() : '';
    const vencidos = dentro.filter(function (op) {
      return op.nutricao.revisarEm && op.nutricao.revisarEm <= hoje;
    });
    const semData = dentro.filter(function (op) { return !op.nutricao.revisarEm; });

    return {
      dentro: dentro.length,
      valorDentro: soma(dentro, function (op) { return op.valor; }),
      vencidos: vencidos.length,
      semData: semData.length,
      voltaram: voltaramLista.length,
      ganharamDepois: ganharamDepois.length,
      /* De quem voltou, quantos fecharam. É a prova de que a nutrição paga. */
      aproveitamento: voltaramLista.length ? ganharamDepois.length / voltaramLista.length : 0,
      diasMedios: (function () {
        const comDias = passagens.filter(function (x) { return x.dias != null; });
        return comDias.length ? media(comDias, function (x) { return x.dias; }) : 0;
      })(),
      porMotivo: Object.keys(porMotivo).map(function (k) { return porMotivo[k]; })
        .sort(function (a, b) { return b.qtd - a.qtd; })
    };
  }

  /* ---------------- o dia da semana ----------------

     Duas perguntas diferentes, e misturá-las é o erro comum: em que dia se
     TRABALHA mais, e em que dia se VENDE mais. Quando os dois não coincidem,
     há um padrão para explorar — e é o tipo de coisa que ninguém descobre
     olhando a lista de tarefas. */
  function porDiaDaSemana(ops, tarefas) {
    const linhas = DIAS.map(function (nome, i) {
      return { dia: i, nome: nome, concluidas: 0, criadas: 0, ganhos: 0, valorGanho: 0, evidencias: 0 };
    });

    (tarefas || []).forEach(function (t) {
      if (t.status !== 'aberta' && t.concluidaEm) {
        const d = diaDaSemana(t.concluidaEm);
        if (d >= 0) linhas[d].concluidas++;
      }
    });

    ops.forEach(function (op) {
      const c = diaDaSemana(op.criadoEm);
      if (c >= 0) linhas[c].criadas++;
      if (op.desfecho && op.desfecho.tipo === 'ganho') {
        const g = diaDaSemana(op.desfecho.data);
        if (g >= 0) { linhas[g].ganhos++; linhas[g].valorGanho += op.desfecho.valorFinal || op.valor || 0; }
      }
      (op.eventos || []).forEach(function (ev) {
        if (ev.tipo !== 'decision') return;
        const d = diaDaSemana(ev.data);
        if (d >= 0) linhas[d].evidencias++;
      });
    });

    return linhas;
  }

  /* ---------------- campanha e SDR ----------------

     "Eficiente" não é quem trouxe mais lead: é quem trouxe lead que DECIDE.
     Uma campanha com cem leads e IAD médio 1 é mais cara do que uma com dez e
     IAD 12, porque as cem horas gastas nela saíram do mesmo dia. */
  function agrupar(ops, chave, rotuloVazio) {
    const por = {};
    ops.forEach(function (op) {
      const k = String(chave(op) || '').trim() || rotuloVazio;
      por[k] = por[k] || { rotulo: k, qtd: 0, valor: 0, iad: 0, ganhos: 0, perdidos: 0,
                           valorGanho: 0, emNutricao: 0, comEvidencia: 0 };
      const g = por[k];
      g.qtd++;
      g.valor += op.valor || 0;
      g.iad += E.iad(op);
      if (op.nutricao) g.emNutricao++;
      if ((op.eventos || []).some(function (e) { return e.tipo === 'decision'; })) g.comEvidencia++;
      if (op.desfecho) {
        if (op.desfecho.tipo === 'ganho') { g.ganhos++; g.valorGanho += op.desfecho.valorFinal || op.valor || 0; }
        else g.perdidos++;
      }
    });
    return Object.keys(por).map(function (k) {
      const g = por[k];
      g.iadMedio = g.qtd ? g.iad / g.qtd : 0;
      const fechados = g.ganhos + g.perdidos;
      g.taxaGanho = fechados ? g.ganhos / fechados : 0;
      /* Quantos saíram do zero: a campanha que traz cem nomes e nenhuma
         conversa não trouxe nada. */
      g.taxaEvidencia = g.qtd ? g.comEvidencia / g.qtd : 0;
      return g;
    }).sort(function (a, b) { return b.qtd - a.qtd; });
  }

  /* ---------------- atrasos ----------------

     Atraso médio e adiamento são coisas diferentes e as duas importam: a
     primeira diz o quanto a agenda escorrega, a segunda diz quantas vezes a
     mesma coisa foi empurrada. Negócio adiado quatro vezes é um dado sobre o
     NEGÓCIO, não sobre a agenda. */
  function atrasos(tarefas, hoje) {
    const abertas = (tarefas || []).filter(function (t) { return t.status === 'aberta'; });
    const atrasadas = abertas.filter(function (t) { return t.vencimento && t.vencimento < hoje; });
    const feitas = (tarefas || []).filter(function (t) { return t.status !== 'aberta' && t.concluidaEm; });
    const feitasAtrasadas = feitas.filter(function (t) { return t.vencimento && t.concluidaEm > t.vencimento; });

    return {
      abertas: abertas.length,
      atrasadas: atrasadas.length,
      diasDeAtrasoMedio: atrasadas.length
        ? media(atrasadas, function (t) { return dias(t.vencimento, hoje) || 0; }) : 0,
      piorAtraso: atrasadas.reduce(function (m, t) {
        const d = dias(t.vencimento, hoje) || 0;
        return d > m ? d : m;
      }, 0),
      feitas: feitas.length,
      feitasNoPrazo: feitas.length - feitasAtrasadas.length,
      pontualidade: feitas.length ? (feitas.length - feitasAtrasadas.length) / feitas.length : 0,
      adiamentos: soma(tarefas || [], function (t) { return t.adiamentos || 0; }),
      semRelato: (tarefas || []).filter(function (t) { return t.semRegistro; }).length
    };
  }

  /* ---------------- o ciclo de venda ----------------
     Quanto tempo leva, de verdade, do cadastro ao fechamento — e a diferença
     entre ganhar e perder. Perder rápido é bom; perder devagar é o caro. */
  function ciclo(ops) {
    const fechados = ops.filter(function (op) { return op.desfecho && op.desfecho.data; });
    const ganhos = fechados.filter(function (op) { return op.desfecho.tipo === 'ganho'; });
    const perdidos = fechados.filter(function (op) { return op.desfecho.tipo !== 'ganho'; });
    const emDias = function (lista) {
      const com = lista.map(function (op) { return dias(op.criadoEm, op.desfecho.data); })
        .filter(function (d) { return d != null && d >= 0; });
      return com.length ? com.reduce(function (s, d) { return s + d; }, 0) / com.length : 0;
    };
    return {
      fechados: fechados.length,
      ganhos: ganhos.length,
      perdidos: perdidos.length,
      taxaGanho: fechados.length ? ganhos.length / fechados.length : 0,
      diasParaGanhar: emDias(ganhos),
      diasParaPerder: emDias(perdidos),
      ticketMedio: ganhos.length
        ? soma(ganhos, function (op) { return op.desfecho.valorFinal || op.valor || 0; }) / ganhos.length : 0,
      iadAoGanhar: ganhos.length ? media(ganhos, function (op) { return op.desfecho.iadFinal || E.iad(op); }) : 0,
      iadAoPerder: perdidos.length ? media(perdidos, function (op) { return op.desfecho.iadFinal || E.iad(op); }) : 0
    };
  }

  /* Tudo de uma vez, para a tela não ter de orquestrar seis chamadas e para o
     teste poder conferir o conjunto. */
  function tudo(est, filtros) {
    const ops = filtrar(est, filtros);
    const ids = {};
    ops.forEach(function (op) { ids[op.id] = true; });
    const tarefas = (est.tarefas || []).filter(function (t) {
      return !t.oportunidadeId || ids[t.oportunidadeId];
    });
    const hoje = global.IADStore ? global.IADStore.hoje() : '';
    const abertas = ops.filter(function (op) { return !op.desfecho && !op.nutricao; });

    return {
      ops: ops,
      qtd: ops.length,
      decisao: funilDaDecisao(abertas),
      etapa: funilDaEtapa(abertas),
      nutricao: funilDaNutricao(ops),
      semana: porDiaDaSemana(ops, tarefas),
      campanhas: agrupar(ops, function (op) { return op.campanha; }, 'Sem campanha'),
      sdrs: agrupar(ops, function (op) { return op.sdr; }, 'Sem SDR'),
      atrasos: atrasos(tarefas, hoje),
      ciclo: ciclo(ops),
      falsos: abertas.filter(ehFalsoAvancado).length
    };
  }

  global.IADFunis = {
    CORTE: CORTE, DIAS: DIAS,
    vazio: vazio, filtrar: filtrar, opcoesDeFiltro: opcoesDeFiltro,
    funilDaDecisao: funilDaDecisao, funilDaEtapa: funilDaEtapa, funilDaNutricao: funilDaNutricao,
    porDiaDaSemana: porDiaDaSemana, agrupar: agrupar, atrasos: atrasos, ciclo: ciclo,
    diaDaSemana: diaDaSemana, dias: dias, tudo: tudo
  };
})(window);
