/* Orientação: por que esta conta está aqui, o que está atrasado, o que fazer.
   ==================================================================
   A tela Hoje já ordenava a carteira certo. O que ela não fazia era EXPLICAR.

   O motivo é no motor: `fila()` escolhe a posição com uma cadeia de `else if`.
   A primeira condição que casa ganha, e as outras — que continuam verdadeiras
   — nunca aparecem. O vendedor lia "Compromisso vencido há 3 dias" e não
   ficava sabendo que, no mesmo negócio, a evidência tinha 40 dias, ninguém
   mapeado além de uma pessoa, e a proposta saiu com 50% de prontidão. Uma
   causa de quatro. Ele agia na que viu e o negócio continuava doente.

   Este módulo refaz TODAS as verificações e lista todas as que estão
   verdadeiras. Três listas, que são as três perguntas de quem abre o app às
   oito da manhã:

     · POR QUE esta conta está nesta posição  → causas
     · O QUE já está atrasado                 → atrasos
     · O QUE fazer para acelerar              → acelerar

   Duas decisões de projeto que valem comentário, porque as duas são sobre
   NÃO fazer:

   1. A régua da urgência continua sendo UMA SÓ, a do motor. Aqui não se
      recalcula nível, não se reordena a fila, não se promove nada a urgente.
      Causa nenhuma carrega selo próprio de gravidade. Se este módulo dissesse
      "causa urgente" dentro de um cartão que o motor marcou "Em dia", a mesma
      tela se contradiria — e tela que se contradiz é tela em que ninguém mais
      confia. As causas saem em ordem de peso, a principal marcada, e o selo do
      cartão vem de um lugar só.

   2. Nada aqui chama a IA, e nada aqui depende dela. Tudo sai dos dados que o
      app já tem: é instantâneo, é auditável, funciona offline e não custa nada.
      A IA entra DEPOIS, uma vez por dia, para acrescentar o que só ela pode —
      ler o texto do que o cliente disse e propor a próxima jogada na língua
      dele. Se a IA não estiver no ar, a orientação não fica vazia: fica sem o
      parágrafo dela.

   Cálculo puro: entra item da fila, sai objeto. Nada lê a tela, nada grava.
*/
(function (global) {
  'use strict';

  const P = global.IADPlaybook;
  const E = global.IADEngine;

  /* Os mesmos cortes do motor, pelo mesmo motivo de sempre: dois lugares com
     réguas diferentes é a origem de "a tela diz uma coisa e o filtro diz
     outra". Aqui eles servem só para ORDENAR as causas. */
  const DIAS_DE_FOLGA = 14;

  function dias(a, b) { return E.diasEntre(a, b); }
  function hoje() { return global.IADStore.hoje(); }
  function dataBr(iso) {
    return String(iso || '').slice(0, 10).split('-').reverse().join('/');
  }
  function plural(n, um, muitos) { return n + ' ' + (n === 1 ? um : muitos); }

  /* ---------------- as causas ----------------
     Cada causa é {id, texto, custo, peso}. `texto` diz o que está acontecendo;
     `custo` diz o que isso cobra — é a parte que ensina. "40 dias sem
     evidência" é um fato; "quanto mais tempo passa, mais a conversa reinicia
     do zero" é o motivo de mexer hoje. */
  function causas(item) {
    const r = item.resumo;
    const op = r.op;
    const cob = r.coverage;
    const lista = [];
    const por = function (id, peso, texto, custo) {
      lista.push({ id: id, peso: peso, texto: texto, custo: custo });
    };

    if (op.nutricao && E.nutricaoVencida(op)) {
      por('revisao', 72,
        'A revisão da nutrição venceu' +
          (op.nutricao.revisarEm ? ' em ' + dataBr(op.nutricao.revisarEm) : '') + '.',
        'Foi você que marcou esta data. Deixar passar transforma nutrição em esquecimento.');
    }

    const comp = r.compromisso;
    if (comp && comp.vencido) {
      por('combinado', 100 + Math.min(comp.diasAtraso, 20),
        'Combinado vencido há ' + plural(comp.diasAtraso, 'dia', 'dias') + ': ' + comp.texto,
        comp.dono === 'cliente'
          ? 'Combinado que vence sem cobrança ensina ao cliente que prazo aqui não vale.'
          : 'A bola está com você. Nada custa mais caro do que o vendedor ser o atraso.');
    }

    const mom = item.porQueAgora;
    if (mom) {
      por('agora', 92 + Math.min(mom.atraso, 8),
        'O cliente se mexeu há ' + plural(mom.idadeSinal, 'dia', 'dias') + ' — ' +
          E.rotuloDoSinal(mom.principal).toLowerCase() +
          ' — e o registro está parado há ' + mom.idadeEvidencia + '.',
        'Ele andou e nós não. Esta é a janela mais curta e a mais barata de aproveitar.');
    }

    const vencidas = (item.tarefas || []).filter(function (t) {
      return t.vencimento && t.vencimento < hoje();
    });
    if (vencidas.length) {
      por('tarefas', 80,
        plural(vencidas.length, 'tarefa sua vencida', 'tarefas suas vencidas') + ' neste negócio.',
        'Não é o cliente que está travando: é a sua lista.');
    }

    const depois = E.depoisDaProposta(op);
    if (depois && !cob.temEconomicBuyer) {
      por('decisor', 76,
        'Em ' + String(op.etapa).toLowerCase() + ' sem acesso ao decisor econômico.',
        'Proposta sem quem assina é orçamento, não negociação — e é o padrão que mais vira “sumiu”.');
    }
    if (depois && !r.gates.liberado) {
      por('gates', 70,
        'Proposta emitida com prontidão de ' + r.gates.prontidao + '%: falta ' +
          r.gates.pendentes.map(function (g) { return g.nome.toLowerCase(); }).join(', ') + '.',
        'Preço discutido antes de valor acordado vira desconto.');
    }

    if (r.evidenceAge > 30) {
      por('silencio', 60,
        plural(r.evidenceAge, 'dia', 'dias') + ' sem nenhuma evidência do cliente.',
        'Depois de um mês de silêncio, a conversa não continua: ela recomeça.');
    } else if (r.evidenceAge > DIAS_DE_FOLGA) {
      por('silencio', 46,
        plural(r.evidenceAge, 'dia', 'dias') + ' sem evidência do cliente (a régua é ' +
          DIAS_DE_FOLGA + ').',
        'Ainda dá para retomar de onde parou. Em duas semanas, não dá mais.');
    }

    if (r.velocity === 0 && !E.nuncaComecou(op)) {
      por('parado', 34, 'Nenhuma das oito decisões subiu nos últimos 30 dias.',
        'Reunião que não move decisão é atividade, não avanço.');
    }

    if (cob.resistentesCriticos && cob.resistentesCriticos.length) {
      por('resistencia', 50,
        'Resistência em papel crítico: ' + cob.resistentesCriticos.map(function (p) {
          return p.nome + ' (' + p.papel + ')';
        }).join(', ') + '.',
        'Quem decide estar contra não muda de lado numa apresentação. Trate antes de pedir a decisão.');
    }

    if (op.fechamentoPrevisto && op.fechamentoPrevisto < hoje()) {
      por('previsao', 44,
        'A data de fechamento que você previu (' + dataBr(op.fechamentoPrevisto) +
          ') passou há ' + plural(dias(op.fechamentoPrevisto, hoje()), 'dia', 'dias') + '.',
        'Previsão vencida que fica no lugar contamina o número de todo mundo. Reveja ou reagende.');
    }

    if (cob.mapeados && !cob.mobilizadores) {
      por('mobilizador', 30, 'Ninguém no grupo move a decisão por dentro.',
        'Sem mobilizador, você empurra de fora — e de fora não se vence consenso interno.');
    }
    if (cob.mapeados <= 1) {
      por('single', 24, cob.mapeados === 1
        ? 'Tudo depende de uma única pessoa.'
        : 'Nenhuma pessoa mapeada nesta conta.',
        'Se essa pessoa sai, muda de área ou esfria, o negócio sai com ela.');
    }
    if (cob.faltando && cob.faltando.length) {
      por('papeis', 20,
        'Papel crítico sem ninguém: ' + cob.faltando.join(', ') + '.',
        'Decisão que depende de um papel que você não conhece acontece sem você na sala.');
    }
    if (cob.bloqueadores) {
      por('bloqueador', 18,
        plural(cob.bloqueadores, 'bloqueador identificado', 'bloqueadores identificados') + ' no grupo.',
        'Bloqueador identificado e não tratado é a objeção que aparece no fim.');
    }

    const comprovacao = (r.lacunas || []).filter(function (l) { return l.tipo === 'comprovacao'; });
    if (comprovacao.length) {
      por('comprovacao', 40,
        plural(comprovacao.length, 'decisão marcada alto', 'decisões marcadas alto') +
          ' sem evidência do cliente que sustente: ' +
          comprovacao.map(function (l) { return l.titulo; }).join(', ') + '.',
        'Nota sem prova é a nossa versão do falso avançado — e ela engana primeiro quem a deu.');
    }

    if (E.nuncaComecou(op)) {
      por('triagem', 4, 'Nunca houve evidência do cliente, em ' + r.evidenceAge + ' dias.',
        'Isto é um lead, não um negócio. Decida se vale a primeira conversa.');
    }

    if (!lista.length) {
      por('ok', 14, 'Nada em atraso: o negócio está no prazo da metodologia.',
        'O trabalho aqui é construir a próxima decisão, não consertar nada.');
    }

    lista.sort(function (a, b) { return b.peso - a.peso; });
    /* A principal é a que o motor usou para pôr o negócio nesta posição — e
       não simplesmente a de maior peso. São quase sempre a mesma; quando não
       são, manda o motor, para que o cartão nunca explique uma posição com um
       motivo diferente do que a produziu. */
    const principal = lista.find(function (c) { return c.id === item.tipo; }) ||
      lista.find(function (c) { return c.id === rotuloDoTipo(item.tipo); }) || lista[0];
    lista.forEach(function (c) { c.principal = c === principal; });
    if (principal && lista[0] !== principal) {
      lista.splice(lista.indexOf(principal), 1);
      lista.unshift(principal);
    }
    return lista;
  }

  /* O motor nomeia os baldes com palavras próprias ('trava', 'resgate',
     'avanco'). A tradução mora aqui e não lá porque é só para casar a causa
     principal com o balde — o motor não deve nada a esta tela. */
  function rotuloDoTipo(tipo) {
    if (tipo === 'trava') return 'decisor';
    if (tipo === 'resgate') return 'silencio';
    if (tipo === 'avanco') return 'parado';
    return tipo;
  }

  /* ---------------- o que está atrasado ----------------
     Separado das causas de propósito. Causa explica a POSIÇÃO; atraso é
     dívida com data. É a lista que se resolve hoje, item por item, e a única
     em que cada linha tem um número de dias. */
  function atrasos(item) {
    const r = item.resumo;
    const op = r.op;
    const lista = [];
    const por = function (id, dias_, texto, oque) {
      lista.push({ id: id, dias: dias_, texto: texto, oque: oque });
    };

    const comp = r.compromisso;
    if (comp && comp.vencido) {
      por('combinado', comp.diasAtraso,
        'Combinado: ' + comp.texto + ' — era para ' + dataBr(comp.data) + '.',
        comp.dono === 'cliente'
          ? 'Cobre o retorno e reagende com data nova.'
          : 'Entregue hoje e avise que entregou.');
    }

    (item.tarefas || []).filter(function (t) {
      return t.vencimento && t.vencimento < hoje();
    }).sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : 1; })
      .slice(0, 4).forEach(function (t) {
        por('tarefa', dias(t.vencimento, hoje()),
          (t.tipo ? '[' + t.tipo + '] ' : '') + t.titulo + ' — venceu em ' + dataBr(t.vencimento) + '.',
          'Faça, ou mude a data para uma que você vai cumprir.');
      });

    if (op.nutricao && E.nutricaoVencida(op) && op.nutricao.revisarEm) {
      por('revisao', dias(op.nutricao.revisarEm, hoje()),
        'Revisão da nutrição marcada para ' + dataBr(op.nutricao.revisarEm) + '.',
        'Veja se o motivo que segurava a conta ainda vale. Se não vale, devolva à carteira.');
    }

    if (op.fechamentoPrevisto && op.fechamentoPrevisto < hoje()) {
      por('previsao', dias(op.fechamentoPrevisto, hoje()),
        'Fechamento previsto para ' + dataBr(op.fechamentoPrevisto) + '.',
        'Reagende com data que você sustenta, ou registre o desfecho real.');
    }

    if (r.evidenceAge > DIAS_DE_FOLGA) {
      por('evidencia', r.evidenceAge - DIAS_DE_FOLGA,
        'Última evidência do cliente há ' + plural(r.evidenceAge, 'dia', 'dias') + '.',
        'Uma conversa que produza prova nova — não um follow-up pedindo retorno.');
    }

    if (r.tempoNaEtapa > 45) {
      por('etapa', r.tempoNaEtapa - 45,
        'Parado em ' + op.etapa + ' há ' + plural(r.tempoNaEtapa, 'dia', 'dias') + '.',
        'Ou a etapa avança com decisão provada, ou ela volta para onde o cliente está de verdade.');
    }

    lista.sort(function (a, b) { return b.dias - a.dias; });
    return lista;
  }

  /* ---------------- o que fazer para acelerar ----------------
     Ordem de execução, não de importância: o que se faz primeiro vem primeiro.
     Cada passo tem `com` (quem) quando o app sabe quem é — sem nome, "prove o
     Impacto" é conselho e não tarefa. */
  function acelerar(item) {
    const r = item.resumo;
    const op = r.op;
    const cob = r.coverage;
    const lista = [];
    const por = function (id, texto, com, porque) {
      lista.push({ id: id, texto: texto, com: com || '', porque: porque || '' });
    };

    const comp = r.compromisso;
    if (comp && comp.vencido && comp.dono !== 'cliente') {
      por('entregar', 'Entregue hoje o que foi combinado: ' + comp.texto, '',
        'Enquanto a bola está com você, nada mais nesta lista importa.');
    }

    /* O passo do motor vem com nome e canal — é o único lugar do app que sabe
       QUEM prova a decisão que falta. */
    const q = item.comQuem || {};
    const canal = item.canal;
    if (item.acao) {
      let com = '';
      if (q.presente && q.pessoa) {
        com = q.pessoa.nome + (q.papel ? ' (' + q.papel + ')' : '') +
          (canal ? ' por ' + canal.rotulo : '');
      } else if (q.porta) {
        com = 'peça a ' + q.porta.nome + ' a apresentação ao ' + (q.papel || 'decisor');
      }
      por('passo', item.acao, com,
        item.decisao ? 'Move a decisão “' + item.decisao.nome + '”, que é a próxima que falta.'
          : 'É o próximo degrau da metodologia neste negócio.');
    }

    if (canal && !canal.alcancavel && q.presente && q.pessoa) {
      por('contato', 'Complete o cadastro de ' + q.pessoa.nome + ': falta o ' +
        String(canal.rotulo).toLowerCase() + '.', '',
        'Hoje não existe como falar com ela por esse canal.');
    }

    /* O papel que a próxima decisão já persegue sai daqui: `item.acao` e a
       linha de “com quem” do cartão já mandam atrás dele, e repetir a mesma
       frase duas vezes no mesmo cartão faz a tela parecer quebrada. O que
       sobra são os OUTROS papéis críticos que ninguém está perseguindo. */
    const jaPerseguido = q.papel || '';
    (cob.faltando || []).filter(function (papel) { return papel !== jaPerseguido; })
      .slice(0, 2).forEach(function (papel, n) {
        por('papel', 'Descubra quem é o ' + papel + ' nesta conta.',
          q.porta ? 'peça a ' + q.porta.nome : '',
          /* O porquê sai uma vez só: duas linhas idênticas seguidas são ruído
             que faz o olho pular o bloco inteiro. */
          n === 0 ? 'Decisão que passa por um papel desconhecido acontece sem você.' : '');
      });

    if (E.depoisDaProposta(op) && !r.gates.liberado) {
      r.gates.pendentes.slice(0, 2).forEach(function (g, n) {
        por('gate', 'Prove ' + g.nome + ': está em ' + g.atual + ' e a proposta exige ' + g.min + '.',
          '', n === 0 ? 'Gate aberto em proposta emitida é desconto esperando acontecer.' : '');
      });
    }

    (r.lacunas || []).filter(function (l) { return l.tipo === 'comprovacao'; })
      .slice(0, 2).forEach(function (l, n) {
        por('provar', 'Registre a evidência de ' + l.titulo + ': ' + l.comoProvar, '',
          n === 0 ? 'A nota está acima do que o histórico do cliente sustenta.' : '');
      });

    if (cob.mapeados <= 1) {
      por('segundo', 'Traga uma segunda pessoa para a conversa — área diferente da atual.', '',
        'Venda de uma pessoa só é a que mais morre sem aviso.');
    }

    (cob.resistentesCriticos || []).slice(0, 1).forEach(function (p) {
      por('resistencia', 'Trate a objeção de ' + p.nome + ' (' + p.papel + ') antes da próxima proposta.',
        p.nome, 'Resistência em papel crítico não se contorna: se resolve ou derruba.');
    });

    if (!r.nbd.dimensao && r.iad >= P.IAD_MAXIMO - 2) {
      por('fechar', 'Feche o plano de ação conjunto: data de assinatura e responsáveis dos dois lados.',
        '', 'As oito decisões estão provadas. Falta só formalizar.');
    }

    return lista.slice(0, 5);
  }

  /* ---------------- a orientação inteira ----------------
     `op.orientacao` é o parágrafo que a IA escreveu na última varredura. Ele
     entra como `ia` e vem SEMPRE datado: leitura de ontem apresentada como de
     hoje é pior do que leitura nenhuma, porque o vendedor age nela. */
  function explicar(item) {
    const o = item.resumo.op.orientacao;
    const dia = o && o.data ? String(o.data).slice(0, 10) : '';
    return {
      causas: causas(item),
      atrasos: atrasos(item),
      acelerar: acelerar(item),
      ia: o && (o.leitura || (o.causas || []).length || (o.acelerar || []).length) ? o : null,
      iaDeHoje: !!dia && dia === hoje(),
      iaEm: dia
    };
  }

  /* Quem ainda não tem leitura da IA de hoje, na ordem da fila. É a lista que
     a varredura diária consome — e o motivo de ela ser calculada aqui, longe
     da tela: a varredura roda sozinha, sem ninguém olhando. */
  function semLeituraDeHoje(itens) {
    const dia = hoje();
    return (itens || []).filter(function (i) {
      const o = i.resumo.op.orientacao;
      return !o || String(o.data || '').slice(0, 10) !== dia;
    });
  }

  global.IADOrientacao = {
    DIAS_DE_FOLGA: DIAS_DE_FOLGA,
    causas: causas, atrasos: atrasos, acelerar: acelerar,
    explicar: explicar, semLeituraDeHoje: semLeituraDeHoje
  };
})(window);
