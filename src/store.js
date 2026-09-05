/* Persistência local (offline-first). No MVP: localStorage.
   A troca para IndexedDB/SQLite ou API remota acontece só aqui.
   Arquivos ficam em IndexedDB (src/arquivos.js) porque não cabem aqui. */
(function (global) {
  'use strict';

  const CHAVE = 'iad-crm:estado:v1';
  const VERSAO = 2;

  function uid(prefixo) {
    return prefixo + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function hoje() { return new Date().toISOString().slice(0, 10); }

  function estadoVazio() {
    return { versao: VERSAO, contas: [], contatos: [], oportunidades: [], tarefas: [], config: { moeda: 'BRL' } };
  }

  let estado = estadoVazio();
  const ouvintes = [];

  /* Migração: um export da v1 precisa continuar abrindo. */
  function migrar(dados) {
    if (!dados || !Array.isArray(dados.oportunidades)) return null;
    dados.tarefas = dados.tarefas || [];
    dados.contas.forEach(function (c) {
      if (c.relacaoAtual == null) c.relacaoAtual = 'Prospect';
    });
    dados.contatos.forEach(function (c) {
      if (c.influencia == null) c.influencia = 2;
      if (c.reportaA === undefined) c.reportaA = null;
      if (c.telefone === undefined) c.telefone = '';
    });
    dados.oportunidades.forEach(function (o) {
      if (o.etapaDesde == null) o.etapaDesde = o.criadoEm || hoje();
      if (o.adiamentos == null) o.adiamentos = 0;
      if (o.proximoCompromisso === undefined) o.proximoCompromisso = null;
      if (o.tipo == null) o.tipo = 'Novo negócio';
      if (o.concorrentes == null) o.concorrentes = '';
      (o.eventos || []).forEach(function (e) {
        if (e.tipo === 'decision' && !e.forca) e.forca = 'relato';
      });
    });
    dados.versao = VERSAO;
    return dados;
  }

  function carregar() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (bruto) {
        const dados = JSON.parse(bruto);
        const migrado = dados && dados.versao <= VERSAO ? migrar(dados) : null;
        if (migrado) estado = migrado;
      }
    } catch (e) {
      console.warn('Falha ao carregar estado local:', e);
    }
    return estado;
  }

  function salvar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch (e) {
      console.warn('Falha ao salvar estado local:', e);
      if (String(e.name).indexOf('Quota') !== -1) {
        alert('O armazenamento do navegador encheu. Exporte um backup em ⚙︎ Dados e apague anexos antigos.');
      }
    }
    ouvintes.forEach(function (fn) { fn(estado); });
  }

  function inscrever(fn) { ouvintes.push(fn); }
  function obter() { return estado; }

  function substituir(novo) {
    const migrado = migrar(novo) || estadoVazio();
    estado = migrado;
    salvar();
  }

  function conta(id) { return estado.contas.find(function (c) { return c.id === id; }); }
  function contato(id) { return estado.contatos.find(function (c) { return c.id === id; }); }
  function oportunidade(id) { return estado.oportunidades.find(function (o) { return o.id === id; }); }
  function tarefa(id) { return estado.tarefas.find(function (t) { return t.id === id; }); }
  function contatosDaConta(contaId) {
    return estado.contatos.filter(function (c) { return c.contaId === contaId; });
  }
  function tarefasDaOportunidade(opId) {
    return estado.tarefas.filter(function (t) { return t.oportunidadeId === opId; });
  }

  function criarConta(dados) {
    const nova = Object.assign({
      id: uid('acc'), nome: '', segmento: '', porte: '', cidade: '', uf: '',
      site: '', relacaoAtual: 'Prospect', criadoEm: hoje()
    }, dados);
    estado.contas.push(nova);
    salvar();
    return nova;
  }

  function criarContato(dados) {
    const novo = Object.assign({
      id: uid('ctt'), contaId: null, nome: '', cargo: '', papel: 'Usuário',
      email: '', telefone: '', linkedin: '', influencia: 2, reportaA: null,
      canalPreferido: '', sentimento: 'nao_acessado', criadoEm: hoje()
    }, dados);
    estado.contatos.push(novo);
    salvar();
    return novo;
  }

  function criarOportunidade(dados) {
    const nova = Object.assign({
      id: uid('opp'),
      contaId: null,
      titulo: '',
      valor: 0,
      etapa: 'Prospecção',
      etapaDesde: hoje(),
      tipo: 'Novo negócio',
      concorrentes: '',
      produto: '',
      dono: '',
      criadoEm: hoje(),
      fechamentoPrevisto: '',
      adiamentos: 0,
      proximoCompromisso: null,
      dims: { problema: 0, prioridade: 0, impacto: 0, criterios: 0, stakeholders: 0, consenso: 0, risco: 0, processo: 0 },
      stakeholders: [],
      eventos: [],
      snapshots: [],
      gateLiberadoPor: null,
      desfecho: null,
      notas: ''
    }, dados);
    nova.snapshots = [{ data: hoje(), iad: 0, dims: Object.assign({}, nova.dims) }];
    estado.oportunidades.push(nova);
    salvar();
    return nova;
  }

  /* Mudanças de etapa e de data prevista viram histórico: é assim que o
     adiamento repetido — o sinal de risco mais citado — deixa de ser invisível. */
  function atualizarOportunidade(id, mudancas) {
    const op = oportunidade(id);
    if (!op) return null;

    if (mudancas.etapa && mudancas.etapa !== op.etapa) {
      op.eventos.unshift({
        id: uid('evt'), tipo: 'sistema', data: hoje(),
        titulo: 'Etapa alterada de ' + op.etapa + ' para ' + mudancas.etapa
      });
      op.etapaDesde = hoje();
    }

    if (mudancas.fechamentoPrevisto && op.fechamentoPrevisto &&
        mudancas.fechamentoPrevisto !== op.fechamentoPrevisto) {
      const adiou = mudancas.fechamentoPrevisto > op.fechamentoPrevisto;
      if (adiou) op.adiamentos = (op.adiamentos || 0) + 1;
      op.eventos.unshift({
        id: uid('evt'), tipo: 'sistema', data: hoje(),
        titulo: 'Fechamento previsto ' + (adiou ? 'adiado' : 'antecipado') +
          ' de ' + op.fechamentoPrevisto + ' para ' + mudancas.fechamentoPrevisto
      });
    }

    Object.assign(op, mudancas);
    salvar();
    return op;
  }

  /* Toda mudança de pontuação vira snapshot e entra no histórico visível. */
  function pontuar(id, dimensao, valor, justificativa) {
    const op = oportunidade(id);
    if (!op) return null;
    const anterior = op.dims[dimensao] || 0;
    if (anterior === valor) return op;

    op.dims[dimensao] = valor;
    const iad = Object.keys(op.dims).reduce(function (s, k) { return s + op.dims[k]; }, 0);
    op.snapshots.push({
      data: hoje(), iad: iad, dims: Object.assign({}, op.dims),
      dimensaoAlterada: dimensao, de: anterior, para: valor
    });
    op.eventos.unshift({
      id: uid('evt'), tipo: 'pontuacao', data: hoje(), dimensao: dimensao,
      titulo: 'passou de ' + anterior + ' para ' + valor,
      justificativa: justificativa || ''
    });
    salvar();
    return op;
  }

  function registrarEvento(id, evento) {
    const op = oportunidade(id);
    if (!op) return null;
    const novo = Object.assign({ id: uid('evt'), data: hoje(), tipo: 'decision' }, evento);
    op.eventos.unshift(novo);

    /* O compromisso combinado na evidência passa a ser o compromisso da oportunidade. */
    if (novo.compromisso && novo.compromisso.data) {
      op.proximoCompromisso = Object.assign({ registradoEm: novo.data }, novo.compromisso);
    }
    salvar();
    return op;
  }

  function removerEvento(opId, eventoId) {
    const op = oportunidade(opId);
    if (!op) return null;
    op.eventos = op.eventos.filter(function (e) { return e.id !== eventoId; });
    salvar();
    return op;
  }

  function definirCompromisso(opId, compromisso) {
    const op = oportunidade(opId);
    if (!op) return null;
    op.proximoCompromisso = compromisso && compromisso.data
      ? Object.assign({ registradoEm: hoje() }, compromisso)
      : null;
    salvar();
    return op;
  }

  /* ---------- Tarefas ---------- */
  function criarTarefa(dados) {
    const nova = Object.assign({
      id: uid('tsk'), titulo: '', tipo: 'Ligar', oportunidadeId: null,
      contatoId: null, decisaoAlvo: '', vencimento: hoje(),
      status: 'aberta', concluidaEm: null, criadoEm: hoje()
    }, dados);
    estado.tarefas.push(nova);
    salvar();
    return nova;
  }

  function concluirTarefa(id) {
    const t = tarefa(id);
    if (!t) return null;
    t.status = 'concluida';
    t.concluidaEm = hoje();
    if (t.oportunidadeId) {
      const op = oportunidade(t.oportunidadeId);
      if (op) {
        op.eventos.unshift({
          id: uid('evt'), tipo: 'activity', data: hoje(),
          titulo: 'Tarefa concluída: ' + t.titulo, dimensao: t.decisaoAlvo || ''
        });
      }
    }
    salvar();
    return t;
  }

  function excluirTarefa(id) {
    estado.tarefas = estado.tarefas.filter(function (t) { return t.id !== id; });
    salvar();
  }

  /* Fechar o ciclo: o desfecho congela a foto da decisão no dia do fechamento.
     É essa foto que, somada a muitos negócios, valida ou derruba o modelo. */
  function fecharOportunidade(id, dados) {
    const op = oportunidade(id);
    if (!op) return null;
    op.desfecho = {
      tipo: dados.tipo,
      data: dados.data || hoje(),
      motivo: dados.motivo || '',
      concorrente: dados.concorrente || '',
      valorFinal: dados.valorFinal != null ? dados.valorFinal : op.valor,
      iadFinal: dados.iadFinal,
      dimsFinal: Object.assign({}, op.dims),
      coverageFinal: dados.coverageFinal,
      evidenceAgeFinal: dados.evidenceAgeFinal,
      diasEmAberto: dados.diasEmAberto
    };
    if (dados.tipo === 'ganho') op.etapa = 'Venda';
    op.proximoCompromisso = null;
    salvar();
    return op;
  }

  function reabrirOportunidade(id) {
    const op = oportunidade(id);
    if (!op) return null;
    op.desfecho = null;
    salvar();
    return op;
  }

  function excluirOportunidade(id) {
    estado.oportunidades = estado.oportunidades.filter(function (o) { return o.id !== id; });
    estado.tarefas = estado.tarefas.filter(function (t) { return t.oportunidadeId !== id; });
    salvar();
  }

  function exportar() { return JSON.stringify(estado, null, 2); }

  function importar(texto) {
    const dados = JSON.parse(texto);
    if (!dados || !Array.isArray(dados.oportunidades)) throw new Error('Arquivo fora do formato esperado.');
    substituir(dados);
  }

  function limpar() { substituir(estadoVazio()); }

  global.IADStore = {
    uid, hoje, carregar, salvar, inscrever, obter, substituir, estadoVazio,
    conta, contato, oportunidade, tarefa, contatosDaConta, tarefasDaOportunidade,
    criarConta, criarContato, criarOportunidade, atualizarOportunidade,
    pontuar, registrarEvento, removerEvento, definirCompromisso,
    criarTarefa, concluirTarefa, excluirTarefa,
    fecharOportunidade, reabrirOportunidade, excluirOportunidade,
    exportar, importar, limpar
  };
})(window);
