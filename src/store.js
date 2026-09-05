/* Persistência local (offline-first). No MVP: localStorage.
   A troca para IndexedDB/SQLite ou API remota acontece só aqui. */
(function (global) {
  'use strict';

  const CHAVE = 'iad-crm:estado:v1';
  const VERSAO = 1;

  function uid(prefixo) {
    return prefixo + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function estadoVazio() {
    return { versao: VERSAO, contas: [], contatos: [], oportunidades: [], config: { moeda: 'BRL' } };
  }

  let estado = estadoVazio();
  const ouvintes = [];

  function carregar() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (bruto) {
        const dados = JSON.parse(bruto);
        if (dados && dados.versao === VERSAO) estado = dados;
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
    }
    ouvintes.forEach(function (fn) { fn(estado); });
  }

  function inscrever(fn) { ouvintes.push(fn); }
  function obter() { return estado; }

  function substituir(novo) {
    estado = novo;
    estado.versao = VERSAO;
    salvar();
  }

  function conta(id) { return estado.contas.find(function (c) { return c.id === id; }); }
  function contato(id) { return estado.contatos.find(function (c) { return c.id === id; }); }
  function oportunidade(id) { return estado.oportunidades.find(function (o) { return o.id === id; }); }
  function contatosDaConta(contaId) {
    return estado.contatos.filter(function (c) { return c.contaId === contaId; });
  }

  function criarConta(dados) {
    const nova = Object.assign({ id: uid('acc'), nome: '', segmento: '', criadoEm: hoje() }, dados);
    estado.contas.push(nova);
    salvar();
    return nova;
  }

  function criarContato(dados) {
    const novo = Object.assign({
      id: uid('ctt'), contaId: null, nome: '', cargo: '', papel: 'Usuário',
      email: '', telefone: '', linkedin: '', influencia: 2,
      sentimento: 'nao_acessado', criadoEm: hoje()
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
      dono: '',
      criadoEm: hoje(),
      fechamentoPrevisto: '',
      dims: { problema: 0, prioridade: 0, impacto: 0, criterios: 0, stakeholders: 0, consenso: 0, risco: 0, processo: 0 },
      stakeholders: [],
      eventos: [],
      snapshots: [],
      gateLiberadoPor: null,
      notas: ''
    }, dados);
    nova.snapshots = [{ data: hoje(), iad: 0, dims: Object.assign({}, nova.dims) }];
    estado.oportunidades.push(nova);
    salvar();
    return nova;
  }

  function atualizarOportunidade(id, mudancas) {
    const op = oportunidade(id);
    if (!op) return null;
    Object.assign(op, mudancas);
    salvar();
    return op;
  }

  /* Toda mudança de pontuação vira snapshot: o histórico precisa ser auditável. */
  function pontuar(id, dimensao, valor) {
    const op = oportunidade(id);
    if (!op) return null;
    op.dims[dimensao] = valor;
    const iad = Object.keys(op.dims).reduce(function (s, k) { return s + op.dims[k]; }, 0);
    op.snapshots.push({ data: hoje(), iad: iad, dims: Object.assign({}, op.dims), dimensaoAlterada: dimensao });
    salvar();
    return op;
  }

  function registrarEvento(id, evento) {
    const op = oportunidade(id);
    if (!op) return null;
    op.eventos.unshift(Object.assign({ id: uid('evt'), data: hoje(), tipo: 'decision' }, evento));
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

  function excluirOportunidade(id) {
    estado.oportunidades = estado.oportunidades.filter(function (o) { return o.id !== id; });
    salvar();
  }

  function hoje() { return new Date().toISOString().slice(0, 10); }

  function exportar() {
    return JSON.stringify(estado, null, 2);
  }

  function importar(texto) {
    const dados = JSON.parse(texto);
    if (!dados || !Array.isArray(dados.oportunidades)) throw new Error('Arquivo fora do formato esperado.');
    substituir(dados);
  }

  function limpar() { substituir(estadoVazio()); }

  global.IADStore = {
    uid, hoje, carregar, salvar, inscrever, obter, substituir,
    conta, contato, oportunidade, contatosDaConta,
    criarConta, criarContato, criarOportunidade, atualizarOportunidade,
    pontuar, registrarEvento, removerEvento, excluirOportunidade,
    exportar, importar, limpar, estadoVazio
  };
})(window);
