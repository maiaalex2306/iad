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
    return {
      versao: VERSAO, tenants: [], usuarios: [],
      contas: [], contatos: [], oportunidades: [], tarefas: [],
      segmentos: [], tiposTarefa: [], produtos: [], config: { moeda: 'BRL' }
    };
  }

  let estado = estadoVazio();
  const ouvintes = [];

  /* Migração: um export da v1 precisa continuar abrindo. */
  function migrar(dados) {
    if (!dados || !Array.isArray(dados.oportunidades)) return null;
    dados.tarefas = dados.tarefas || [];
    dados.produtos = dados.produtos || [];
    dados.tenants = dados.tenants || [];
    dados.usuarios = dados.usuarios || [];

    /* Multiempresa: o que já existia passa a pertencer a uma primeira empresa,
       criada aqui, para nada ficar órfão e invisível depois do login. */
    const temRegistros = dados.contas.length || dados.oportunidades.length;
    if (!dados.tenants.length && temRegistros) {
      dados.tenants.push({ id: uid('ten'), nome: 'Minha empresa', cnpj: '', ativo: true, criadoEm: hoje() });
    }
    const primeiro = dados.tenants[0] ? dados.tenants[0].id : null;
    ['contas', 'contatos', 'oportunidades', 'tarefas', 'segmentos', 'tiposTarefa', 'produtos']
      .forEach(function (colecao) {
        (dados[colecao] || []).forEach(function (r) { if (r.tenantId == null) r.tenantId = primeiro; });
      });
    dados.contas.forEach(function (c) {
      if (c.relacaoAtual == null) c.relacaoAtual = 'Prospect';
      if (c.razaoSocial == null) c.razaoSocial = '';
      if (c.cnpj == null) c.cnpj = '';
      if (c.telefone == null) c.telefone = '';
    });

    /* Catálogos: o que era texto solto vira lista gerenciável, sem perder o que já existe. */
    if (!dados.segmentos || !dados.segmentos.length) {
      const nomes = {};
      dados.contas.forEach(function (c) { if (c.segmento) nomes[c.segmento] = true; });
      dados.segmentos = Object.keys(nomes).sort().map(function (nome) {
        return { id: uid('seg'), nome: nome, ativo: true };
      });
    }
    if (!dados.tiposTarefa || !dados.tiposTarefa.length) {
      dados.tiposTarefa = (global.IADPlaybook ? global.IADPlaybook.TIPOS_TAREFA : ['Ligar'])
        .map(function (nome) { return { id: uid('tpt'), nome: nome, ativo: true }; });
    }
    dados.contatos.forEach(function (c) {
      if (c.influencia == null) c.influencia = 2;
      if (c.reportaA === undefined) c.reportaA = null;
      if (c.telefone === undefined) c.telefone = '';
      if (c.perfil == null) c.perfil = 'nao_classificado';
    });
    dados.oportunidades.forEach(function (o) {
      if (!Array.isArray(o.itens)) o.itens = [];
      if (o.etapaDesde == null) o.etapaDesde = o.criadoEm || hoje();
      if (o.adiamentos == null) o.adiamentos = 0;
      if (o.proximoCompromisso === undefined) o.proximoCompromisso = null;
      if (o.tipo == null) o.tipo = 'Novo negócio';
      if (o.concorrentes == null) o.concorrentes = '';
      if (o.insight == null) o.insight = { texto: '', estado: 'nenhum', atualizadoEm: null };
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

  /* Contas de acesso não são dado de negócio: carregar a demonstração, importar
     um backup ou apagar a carteira nunca pode derrubar quem tem login. */
  function substituir(novo) {
    const contasDeAcesso = { tenants: estado.tenants || [], usuarios: estado.usuarios || [] };
    const migrado = migrar(novo) || estadoVazio();

    migrado.tenants = contasDeAcesso.tenants.length ? contasDeAcesso.tenants : (migrado.tenants || []);
    migrado.usuarios = contasDeAcesso.usuarios.length ? contasDeAcesso.usuarios : (migrado.usuarios || []);
    estado = migrado;

    /* O que entrou sem dono fica com quem está trabalhando agora — senão some da tela. */
    const ctx = contexto();
    let alvo = tenantDeTrabalho();
    const temRegistros = estado.contas.length || estado.oportunidades.length;
    if (!alvo && temRegistros) {
      const novoTenant = { id: uid('ten'), nome: 'Minha empresa', cnpj: '', ativo: true, criadoEm: hoje() };
      estado.tenants.push(novoTenant);
      alvo = novoTenant.id;
    }
    ['contas', 'contatos', 'segmentos', 'tiposTarefa', 'produtos'].forEach(function (colecao) {
      (estado[colecao] || []).forEach(function (r) { if (!r.tenantId) r.tenantId = alvo; });
    });
    ['oportunidades', 'tarefas'].forEach(function (colecao) {
      (estado[colecao] || []).forEach(function (r) {
        if (!r.tenantId) r.tenantId = alvo;
        if (!r.donoId && ctx.usuario) r.donoId = ctx.usuario.id;
      });
    });

    salvar();
  }

  /* ---------- escopo: quem está logado enxerga o quê ----------
     Usuário comum vê a própria empresa. O administrador vê tudo, e é o único
     que pode estreitar a visão para uma empresa ou um usuário. */
  function contexto() {
    const A = global.IADAuth;
    const u = A && A.atual();
    if (!u) return { usuario: null, tenantId: null, admin: false, filtros: { tenant: 'todas', usuario: 'todos' } };
    return {
      usuario: u,
      tenantId: u.tenantId,
      admin: u.papel === 'admin',
      filtros: A.filtros()
    };
  }

  function tenantDeTrabalho() {
    const ctx = contexto();
    if (!ctx.usuario) return null;
    if (!ctx.admin) return ctx.tenantId;
    if (ctx.filtros.tenant && ctx.filtros.tenant !== 'todas') return ctx.filtros.tenant;
    return (estado.tenants[0] || {}).id || null;
  }

  function visivel(registro, comDono) {
    const ctx = contexto();
    if (!ctx.usuario) return false;
    if (!ctx.admin) return registro.tenantId === ctx.tenantId;
    if (ctx.filtros.tenant !== 'todas' && registro.tenantId !== ctx.filtros.tenant) return false;
    if (comDono && ctx.filtros.usuario !== 'todos' && registro.donoId !== ctx.filtros.usuario) return false;
    return true;
  }

  /* Mesma forma do estado, já filtrado. As telas leem daqui, nunca de obter(). */
  function dados() {
    const porTenant = function (lista) { return (lista || []).filter(function (r) { return visivel(r, false); }); };
    const porDono = function (lista) { return (lista || []).filter(function (r) { return visivel(r, true); }); };
    return {
      tenants: estado.tenants,
      usuarios: estado.usuarios,
      contas: porTenant(estado.contas),
      contatos: porTenant(estado.contatos),
      oportunidades: porDono(estado.oportunidades),
      tarefas: porDono(estado.tarefas),
      segmentos: porTenant(estado.segmentos),
      tiposTarefa: porTenant(estado.tiposTarefa),
      produtos: porTenant(estado.produtos),
      config: estado.config
    };
  }

  function carimbo(comDono) {
    const ctx = contexto();
    const marca = { tenantId: tenantDeTrabalho() };
    if (comDono) marca.donoId = ctx.usuario ? ctx.usuario.id : null;
    return marca;
  }

  function conta(id) { return estado.contas.find(function (c) { return c.id === id; }); }
  function contato(id) { return estado.contatos.find(function (c) { return c.id === id; }); }
  function oportunidade(id) { return estado.oportunidades.find(function (o) { return o.id === id; }); }
  function tarefa(id) { return estado.tarefas.find(function (t) { return t.id === id; }); }
  function contatosDaConta(contaId) {
    return estado.contatos.filter(function (c) { return c.contaId === contaId && visivel(c, false); });
  }
  function tarefasDaOportunidade(opId) {
    return estado.tarefas.filter(function (t) { return t.oportunidadeId === opId && visivel(t, true); });
  }

  function criarConta(dados) {
    const nova = Object.assign({
      id: uid('acc'), nome: '', razaoSocial: '', cnpj: '', segmento: '', porte: '',
      cidade: '', uf: '', site: '', telefone: '', relacaoAtual: 'Prospect', criadoEm: hoje()
    }, dados);
    estado.contas.push(nova);
    salvar();
    return nova;
  }

  function criarContato(dados) {
    const novo = Object.assign({
      id: uid('ctt'), contaId: null, nome: '', cargo: '', papel: 'Usuário',
      email: '', telefone: '', linkedin: '', influencia: 2, reportaA: null,
      canalPreferido: '', perfil: 'nao_classificado', sentimento: 'nao_acessado', criadoEm: hoje()
    }, carimbo(false), dados);
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
      itens: [],
      proximoCompromisso: null,
      insight: { texto: '', estado: 'nenhum', atualizadoEm: null },
      dims: { problema: 0, prioridade: 0, impacto: 0, criterios: 0, stakeholders: 0, consenso: 0, risco: 0, processo: 0 },
      stakeholders: [],
      eventos: [],
      snapshots: [],
      gateLiberadoPor: null,
      desfecho: null,
      notas: ''
    }, carimbo(true), dados);
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

  function definirInsight(opId, insight) {
    const op = oportunidade(opId);
    if (!op) return null;
    const anterior = op.insight || {};
    op.insight = { texto: insight.texto || '', estado: insight.estado || 'nenhum', atualizadoEm: hoje() };
    if (anterior.estado !== op.insight.estado) {
      op.eventos.unshift({
        id: uid('evt'), tipo: 'sistema', data: hoje(),
        titulo: 'Insight comercial: ' + op.insight.estado
      });
    }
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

  /* ---------- Catálogos: segmentos, tipos de tarefa e produtos ---------- */
  const CATALOGOS = { segmentos: 'seg', tiposTarefa: 'tpt', produtos: 'prd' };

  function catalogo(nome) {
    return (estado[nome] || []).filter(function (i) { return visivel(i, false); });
  }

  function catalogoAtivos(nome) {
    return catalogo(nome).filter(function (i) { return i.ativo !== false; });
  }

  function nomesDoCatalogo(nome) {
    return catalogoAtivos(nome).map(function (i) { return i.nome; });
  }

  function criarNoCatalogo(nome, dados) {
    const item = Object.assign({ id: uid(CATALOGOS[nome] || 'cat'), nome: '', ativo: true, criadoEm: hoje() }, carimbo(false), dados);
    if (!item.nome) return null;
    const existente = catalogo(nome).find(function (i) {
      return i.nome.trim().toLowerCase() === item.nome.trim().toLowerCase();
    });
    if (existente) return existente;
    estado[nome].push(item);
    salvar();
    return item;
  }

  function atualizarNoCatalogo(nome, id, mudancas) {
    const item = catalogo(nome).find(function (i) { return i.id === id; });
    if (!item) return null;
    const anterior = item.nome;
    Object.assign(item, mudancas);
    /* Renomear um segmento renomeia nas contas: o vínculo é pelo nome. */
    if (nome === 'segmentos' && mudancas.nome && mudancas.nome !== anterior) {
      estado.contas.forEach(function (c) { if (c.segmento === anterior) c.segmento = mudancas.nome; });
    }
    salvar();
    return item;
  }

  function removerDoCatalogo(nome, id) {
    estado[nome] = catalogo(nome).filter(function (i) { return i.id !== id; });
    salvar();
  }

  function produto(id) { return catalogo('produtos').find(function (p) { return p.id === id; }); }

  /* ---------- Tarefas ---------- */
  function criarTarefa(dados) {
    const nova = Object.assign({
      id: uid('tsk'), titulo: '', tipo: 'Ligar', oportunidadeId: null,
      contatoId: null, decisaoAlvo: '', vencimento: hoje(),
      status: 'aberta', concluidaEm: null, criadoEm: hoje()
    }, carimbo(true), dados);
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

  /* Apaga a carteira, não os acessos. */
  function limpar() {
    const vazio = estadoVazio();
    vazio.tenants = estado.tenants;
    vazio.usuarios = estado.usuarios;
    estado = vazio;
    salvar();
  }

  global.IADStore = {
    uid, hoje, carregar, salvar, inscrever, obter, substituir, estadoVazio,
    conta, contato, oportunidade, tarefa, contatosDaConta, tarefasDaOportunidade,
    dados, contexto, tenantDeTrabalho, visivel,
    criarConta, criarContato, criarOportunidade, atualizarOportunidade,
    pontuar, registrarEvento, removerEvento, definirCompromisso, definirInsight,
    criarTarefa, concluirTarefa, excluirTarefa,
    catalogo, catalogoAtivos, nomesDoCatalogo, criarNoCatalogo, atualizarNoCatalogo,
    removerDoCatalogo, produto,
    fecharOportunidade, reabrirOportunidade, excluirOportunidade,
    exportar, importar, limpar
  };
})(window);
