/* Decision Engine: IAD, Evidence Age, Decision Velocity, Coverage,
   Proposal Gates, Forecast e Next Best Decision. Regras primeiro; IA depois. */
(function (global) {
  'use strict';

  const P = global.IADPlaybook;
  const Store = global.IADStore;

  function iad(op) {
    return P.DIMENSOES.reduce(function (soma, d) { return soma + (op.dims[d.id] || 0); }, 0);
  }

  function diasEntre(dataISO, referencia) {
    const a = new Date(dataISO + 'T00:00:00');
    const b = referencia ? new Date(referencia + 'T00:00:00') : new Date();
    return Math.max(0, Math.floor((b - a) / 86400000));
  }

  function eventosDeDecisao(op) {
    return (op.eventos || []).filter(function (e) { return e.tipo === 'decision'; });
  }

  /* Evidence Age: dias desde a última evidência do CLIENTE.
     Atividade do vendedor não zera o contador — por definição. */
  function evidenceAge(op) {
    const decisoes = eventosDeDecisao(op);
    if (!decisoes.length) return diasEntre(op.criadoEm);
    const maisRecente = decisoes.reduce(function (max, e) { return e.data > max ? e.data : max; }, decisoes[0].data);
    return diasEntre(maisRecente);
  }

  function faixaEvidencia(dias) {
    return P.FAIXAS_EVIDENCIA.find(function (f) { return dias <= f.max; });
  }

  /* Decision Velocity: microdecisões comprovadas nos últimos 30 dias. */
  function decisionVelocity(op) {
    return eventosDeDecisao(op).filter(function (e) { return diasEntre(e.data) <= 30; }).length;
  }

  function stakeholdersDaOp(op) {
    return (op.stakeholders || []).map(function (id) { return Store.contato(id); }).filter(Boolean);
  }

  /* Coverage: papéis críticos do buying group com relacionamento real. */
  function coverage(op) {
    const pessoas = stakeholdersDaOp(op);
    const papeisPresentes = new Set(pessoas.map(function (p) { return p.papel; }));
    const criticosCobertos = P.PAPEIS_CRITICOS.filter(function (papel) { return papeisPresentes.has(papel); });
    const engajados = pessoas.filter(function (p) { return p.sentimento === 'favoravel' || p.sentimento === 'neutro'; });
    return {
      mapeados: pessoas.length,
      papeis: papeisPresentes.size,
      criticosCobertos: criticosCobertos.length,
      criticosTotal: P.PAPEIS_CRITICOS.length,
      percentual: Math.round((criticosCobertos.length / P.PAPEIS_CRITICOS.length) * 100),
      engajados: engajados.length,
      temEconomicBuyer: papeisPresentes.has('Decisor econômico'),
      temChampion: papeisPresentes.has('Champion / Mobilizer'),
      faltando: P.PAPEIS_CRITICOS.filter(function (papel) { return !papeisPresentes.has(papel); })
    };
  }

  /* Proposal Gate: a proposta é consequência da qualificação. */
  function gates(op) {
    const itens = P.GATES_PROPOSTA.map(function (g) {
      const dim = P.DIMENSOES.find(function (d) { return d.id === g.dim; });
      const atual = op.dims[g.dim] || 0;
      return { dim: g.dim, nome: dim.nome, min: g.min, atual: atual, ok: atual >= g.min };
    });
    const aprovados = itens.filter(function (i) { return i.ok; }).length;
    return {
      itens: itens,
      aprovados: aprovados,
      total: itens.length,
      prontidao: Math.round((aprovados / itens.length) * 100),
      liberado: aprovados === itens.length,
      pendentes: itens.filter(function (i) { return !i.ok; })
    };
  }

  const ORDEM_ETAPAS = P.ETAPAS;
  function indiceEtapa(op) { return ORDEM_ETAPAS.indexOf(op.etapa); }
  function depoisDaProposta(op) { return indiceEtapa(op) >= ORDEM_ETAPAS.indexOf('Proposta'); }

  /* Saúde: etapa não entra na conta. Só decisão, movimento e consenso. */
  function saude(op) {
    const pontos = iad(op);
    const idade = evidenceAge(op);
    const cob = coverage(op);
    const g = gates(op);

    let score = (pontos / 16) * 45;
    score += Math.max(0, 25 - idade) / 25 * 20;
    score += (cob.percentual / 100) * 20;
    score += (g.prontidao / 100) * 15;
    if (!cob.temEconomicBuyer && depoisDaProposta(op)) score -= 12;
    if (cob.mapeados <= 1) score -= 8;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /* Os quatro grupos que aparecem quando se separa etapa de decisão. */
  function classificar(op) {
    const pontos = iad(op);
    const idade = evidenceAge(op);
    const cob = coverage(op);
    if (idade > 30) return { id: 'zumbi', rotulo: 'Zumbi', desc: 'Sem evidência nova do comprador há mais de 30 dias.' };
    /* Etapa adiantada não é avanço: sem maturidade, sem gate ou sem decisor econômico, é falso avanço. */
    if (depoisDaProposta(op) && (pontos < 11 || !gates(op).liberado || !cob.temEconomicBuyer)) {
      return { id: 'falso', rotulo: 'Falso avançado', desc: 'Etapa adiantada, decisão imatura.' };
    }
    if (!depoisDaProposta(op) && pontos >= 11) return { id: 'oculto', rotulo: 'Oculto promissor', desc: 'Decisão madura antes da etapa indicar.' };
    if (pontos >= 11 && idade <= 14 && cob.percentual >= 50) {
      return { id: 'real', rotulo: 'Negócio real', desc: 'Decisão madura, movimento recente e consenso em construção.' };
    }
    return { id: 'construcao', rotulo: 'Em construção', desc: 'Decisão ainda sendo formada.' };
  }

  /* Next Best Decision: qual decisão precisa ocorrer DENTRO do cliente agora.
     A ordem importa — problema antes de impacto, stakeholders antes de consenso. */
  const ORDEM_DECISAO = ['problema', 'prioridade', 'impacto', 'stakeholders', 'criterios', 'processo', 'consenso', 'risco'];

  function nextBestDecision(op) {
    const cob = coverage(op);

    if (depoisDaProposta(op) && !cob.temEconomicBuyer) {
      const dim = P.DIMENSOES.find(function (d) { return d.id === 'stakeholders'; });
      return {
        dimensao: dim,
        critico: true,
        decisao: 'O decisor econômico precisa entrar na conversa antes de qualquer nova revisão de proposta.',
        acao: dim.canais.whatsapp,
        canais: dim.canais,
        conteudo: dim.conteudo
      };
    }

    const idade = evidenceAge(op);
    const alvo = ORDEM_DECISAO.find(function (id) { return (op.dims[id] || 0) < 2; });
    if (!alvo) {
      return {
        dimensao: null,
        critico: idade > 14,
        decisao: 'As oito decisões estão comprovadas. A próxima decisão é a formalização: data de assinatura e liberação orçamentária.',
        acao: 'Feche o Mutual Action Plan com data de assinatura e responsáveis dos dois lados.',
        canais: null,
        conteudo: 'Mutual Action Plan'
      };
    }

    const dim = P.DIMENSOES.find(function (d) { return d.id === alvo; });
    const nivel = op.dims[alvo] || 0;
    return {
      dimensao: dim,
      critico: idade > 21,
      decisao: dim.pergunta,
      acao: nivel === 0 ? dim.canais.whatsapp : dim.canais.email,
      canais: dim.canais,
      conteudo: dim.conteudo,
      evidenciasAceitas: dim.evidencias
    };
  }

  function alertas(op) {
    const lista = [];
    const idade = evidenceAge(op);
    const cob = coverage(op);
    const g = gates(op);
    const f = faixaEvidencia(idade);

    if (idade > 14) lista.push({ nivel: idade > 30 ? 'alto' : 'medio', texto: idade + ' dias sem evidência do comprador (' + f.rotulo + ').' });
    if (cob.mapeados <= 1) lista.push({ nivel: 'alto', texto: 'Venda single-threaded: depende de uma única pessoa.' });
    if (depoisDaProposta(op) && !cob.temEconomicBuyer) lista.push({ nivel: 'alto', texto: 'Em proposta ou adiante sem acesso ao decisor econômico.' });
    if (depoisDaProposta(op) && !g.liberado) lista.push({ nivel: 'alto', texto: 'Proposta emitida com prontidão de apenas ' + g.prontidao + '%.' });
    if (!cob.temChampion) lista.push({ nivel: 'medio', texto: 'Nenhum champion identificado no grupo comprador.' });
    if (decisionVelocity(op) === 0) lista.push({ nivel: 'medio', texto: 'Decision Velocity zerada nos últimos 30 dias.' });
    return lista;
  }

  function resumo(op) {
    return {
      op: op,
      conta: Store.conta(op.contaId),
      iad: iad(op),
      evidenceAge: evidenceAge(op),
      faixa: faixaEvidencia(evidenceAge(op)),
      velocity: decisionVelocity(op),
      coverage: coverage(op),
      gates: gates(op),
      saude: saude(op),
      classe: classificar(op),
      nbd: nextBestDecision(op),
      alertas: alertas(op)
    };
  }

  /* Carteira: onde está o dinheiro e qual decisão o está segurando. */
  function carteira(oportunidades) {
    const abertas = oportunidades.filter(function (o) { return o.etapa !== 'Venda'; });
    const resumos = abertas.map(resumo);
    const total = resumos.reduce(function (s, r) { return s + (r.op.valor || 0); }, 0);
    const porGrupo = {};
    resumos.forEach(function (r) {
      const k = r.classe.id;
      porGrupo[k] = porGrupo[k] || { rotulo: r.classe.rotulo, valor: 0, qtd: 0 };
      porGrupo[k].valor += r.op.valor || 0;
      porGrupo[k].qtd += 1;
    });

    const travas = {};
    resumos.forEach(function (r) {
      if (!r.nbd.dimensao) return;
      const k = r.nbd.dimensao.id;
      travas[k] = travas[k] || { nome: r.nbd.dimensao.nome, valor: 0, qtd: 0 };
      travas[k].valor += r.op.valor || 0;
      travas[k].qtd += 1;
    });

    const media = function (fn) {
      return resumos.length ? resumos.reduce(function (s, r) { return s + fn(r); }, 0) / resumos.length : 0;
    };

    return {
      resumos: resumos,
      total: total,
      qtd: resumos.length,
      porGrupo: porGrupo,
      travas: Object.keys(travas).map(function (k) { return Object.assign({ id: k }, travas[k]); })
        .sort(function (a, b) { return b.valor - a.valor; }),
      iadMedio: media(function (r) { return r.iad; }),
      evidenceAgeMedio: media(function (r) { return r.evidenceAge; }),
      coverageMedio: media(function (r) { return r.coverage.percentual; }),
      prontidaoMedia: media(function (r) { return r.gates.prontidao; }),
      saudavel: resumos.filter(function (r) { return r.classe.id === 'real' || r.classe.id === 'oculto'; })
        .reduce(function (s, r) { return s + (r.op.valor || 0); }, 0),
      emRisco: resumos.filter(function (r) { return r.classe.id === 'falso' || r.classe.id === 'construcao'; })
        .reduce(function (s, r) { return s + (r.op.valor || 0); }, 0),
      zumbi: resumos.filter(function (r) { return r.classe.id === 'zumbi'; })
        .reduce(function (s, r) { return s + (r.op.valor || 0); }, 0)
    };
  }

  global.IADEngine = {
    iad, evidenceAge, faixaEvidencia, decisionVelocity, coverage, gates,
    saude, classificar, nextBestDecision, alertas, resumo, carteira,
    stakeholdersDaOp, diasEntre, indiceEtapa, depoisDaProposta
  };
})(window);
