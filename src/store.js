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

  function daquiADias(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /* Todo negócio nasce com uma data de fechamento: hoje mais 120 dias.

     Não é adivinhação de quando vai fechar — é o relógio começar a andar.
     Negócio sem data prevista some do "por mês" do painel, não entra em
     previsão nenhuma e nunca fica atrasado, então nada nunca cobra por ele.
     Com data, ele aparece, e quando a data passa o app avisa. A data errada se
     corrige em dois cliques; a data que não existe ninguém corrige, porque
     ninguém a vê.

     120 e não 90 nem 180 porque é o que o ciclo desta carteira mostrou até
     aqui — e o campo continua sendo do vendedor: vem preenchido no formulário,
     à vista, para ser trocado. */
  const PRAZO_PADRAO_DE_FECHAMENTO = 120;

  /* ---------------- A tabela de fontes ----------------

     A carteira que já existe tem o de-onde-veio guardado em texto solto
     (`op.origem`). Renomear o sentido daquela coluna seria o jeito conhecido
     de perder o dado sem ninguém perceber, então ela fica onde está e ganha
     uma companheira: `op.fonteId` aponta para a linha da tabela.

     A amarração é por nome achatado — sem acento, sem maiúscula, sem
     pontuação — porque foi digitado à mão e vem escrito de cinco jeitos. O
     que não casar com nada vira fonte nova em vez de virar traço: a lista
     nasce do que a pessoa já usava, e não de uma lista que eu inventei. */
  function semearFontes(dados) {
    dados.fontes = dados.fontes || [];
    if (dados.fontes.length) return;
    const padrao = (global.IADPlaybook && global.IADPlaybook.FONTES_PADRAO) || [];
    dados.fontes = padrao.map(function (f) {
      return { id: uid('fnt'), nome: f.nome, categoria: f.categoria, ativo: true, criadoEm: hoje() };
    });
  }

  function achatar(nome) {
    return String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function amarrarFontes(dados) {
    dados.fontes = dados.fontes || [];
    const porNome = {};
    dados.fontes.forEach(function (f) { porNome[achatar(f.nome)] = f; });

    (dados.oportunidades || []).forEach(function (op) {
      if (op.fonteId) return;
      const texto = String(op.origem || '').trim();
      if (!texto) return;
      let f = porNome[achatar(texto)];
      if (!f) {
        f = { id: uid('fnt'), nome: texto, categoria: 'outra', ativo: true, criadoEm: hoje(),
              tenantId: op.tenantId };
        dados.fontes.push(f);
        porNome[achatar(texto)] = f;
      }
      op.fonteId = f.id;
    });
  }

  /* A linha de item nasceu com três campos: produto, quantidade e preço. Sem
     id não dá para editar nem excluir uma linha específica, e sem o nome e o
     preço congelados a linha muda sozinha quando o catálogo muda.

     O que esta migração NÃO faz é recalcular o valor do negócio. A carteira
     que já existe tem valor digitado à mão, e mexer nele aqui trocaria dezenas
     de números sem ninguém pedir. O valor só passa a ser calculado a partir do
     momento em que alguém mexe na lista. */
  function completarItens(dados) {
    (dados.oportunidades || []).forEach(function (op) {
      if (op.prazoContratoMeses == null) {
        op.prazoContratoMeses = (global.IADPlaybook && global.IADPlaybook.PRAZO_CONTRATO_PADRAO) || 12;
      }
      if (op.valorMensal == null) op.valorMensal = 0;
      (op.itens || []).forEach(function (i) {
        if (!i.id) i.id = uid('itm');
        if (i.nome == null) {
          const p = (dados.produtos || []).find(function (x) { return x.id === i.produtoId; });
          i.nome = p ? p.nome : '';
          if (i.precoTabela == null) i.precoTabela = p ? (Number(p.precoReferencia) || 0) : 0;
        }
        if (i.precoTabela == null) i.precoTabela = Number(i.precoUnitario) || 0;
        if (i.recorrencia == null) i.recorrencia = 'unico';
        if (i.desconto == null) i.desconto = 0;
        if (i.quantidade == null) i.quantidade = 1;
      });
    });
  }

  function estadoVazio() {
    return {
      versao: VERSAO, tenants: [], usuarios: [],
      contas: [], contatos: [], oportunidades: [], tarefas: [],
      segmentos: [], tiposTarefa: [], produtos: [], fontes: [], config: { moeda: 'BRL' },
      /* Auditoria das campanhas do Linked Helper. Não é carteira: são as
         respostas que dizem NÃO, guardadas fora do pipeline de propósito.
         Dentro dele elas seriam negócio; aqui elas são o que a campanha
         produziu de errado, que é a única coisa capaz de melhorar a próxima. */
      recusas: [],
      /* Leads que alguém mandou nunca mais mostrar. */
      descartes: [],
      /* Sinais do comprador: ver o comentário de TIPOS_SINAL no playbook.
         Coleção própria, e não dentro da oportunidade, porque sinal nasce
         grudado na PESSOA e muitas vezes antes de existir negócio nenhum —
         guardá-lo dentro da oportunidade seria perder justamente o sinal que
         chega cedo, que é o mais valioso. */
      sinais: [],
      /* O caderninho. Não é tarefa e não vira uma: tarefa tem dono, prazo,
         tipo e oportunidade, e exigir tudo isso de "ligar para o Carlos" é o
         que faz a pessoa anotar no papel e o app nunca ficar sabendo. */
      notas: []
    };
  }

  let estado = estadoVazio();

  const ouvintes = [];

  /* Migração: um export da v1 precisa continuar abrindo. */
  /* A lista de tipos virou canal ("Telefonema", "WhatsApp"), e quem já usava o
     app tem a lista antiga ("Ligar", "Visitar"). Renomear no lugar mantém o id
     — e portanto a mesma linha na nuvem — e evita a lista com os dois nomes.
     O que o usuário criou não é tocado; o que falta entra.

     Roda no boot e de novo depois de cada sincronização: a lista antiga volta
     do servidor a cada `puxar`, e uma correção que só acontece no boot seria
     desfeita pela primeira sincronização do dia. */
  function padronizarTiposTarefa(dados) {
    if (!global.IADPlaybook || !dados || !dados.tiposTarefa) return false;
    const renomeados = global.IADPlaybook.TIPOS_TAREFA_RENOMEADOS || {};
    let mudou = false;

    dados.tiposTarefa.forEach(function (t) {
      if (!renomeados[t.nome]) return;
      const antigo = t.nome;
      t.nome = renomeados[antigo];
      (dados.tarefas || []).forEach(function (tf) { if (tf.tipo === antigo) tf.tipo = t.nome; });
      mudou = true;
    });

    const tem = {};
    dados.tiposTarefa.forEach(function (t) { tem[t.nome] = true; });
    global.IADPlaybook.TIPOS_TAREFA.forEach(function (nome) {
      if (tem[nome]) return;
      dados.tiposTarefa.push({ id: uid('tpt'), nome: nome, ativo: true });
      mudou = true;
    });
    return mudou;
  }

  function migrar(dados) {
    if (!dados || !Array.isArray(dados.oportunidades)) return null;
    dados.tarefas = dados.tarefas || [];
    dados.produtos = dados.produtos || [];
    dados.tenants = dados.tenants || [];
    dados.usuarios = dados.usuarios || [];
    dados.recusas = dados.recusas || [];
    dados.descartes = dados.descartes || [];
    dados.sinais = dados.sinais || [];
    migrarDescartesParaCampanha(dados);
    migrarParaCincoDegraus(dados);
    migrarDesfechos(dados);

    /* Multiempresa: o que já existia passa a pertencer a uma primeira empresa,
       criada aqui, para nada ficar órfão e invisível depois do login. */
    const temRegistros = dados.contas.length || dados.oportunidades.length;
    if (!dados.tenants.length && temRegistros) {
      dados.tenants.push({ id: uid('ten'), nome: 'Minha empresa', cnpj: '', ativo: true, criadoEm: hoje() });
    }
    const primeiro = dados.tenants[0] ? dados.tenants[0].id : null;
    ['contas', 'contatos', 'oportunidades', 'tarefas', 'segmentos', 'tiposTarefa', 'produtos', 'fontes', 'recusas', 'descartes', 'sinais']
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
      dados.tiposTarefa = (global.IADPlaybook ? global.IADPlaybook.TIPOS_TAREFA : ['Reunião'])
        .map(function (nome) { return { id: uid('tpt'), nome: nome, ativo: true }; });
    } else {
      padronizarTiposTarefa(dados);
    }
    semearFontes(dados);
    amarrarFontes(dados);
    completarItens(dados);
    /* Tarefa nasce planejada (marquei para fazer) ou registrada (aconteceu e
       eu anotei depois). As duas concluídas contam igual no funil e não contam
       igual na metodologia: a primeira mostra disciplina de planejamento, a
       segunda mostra o vendedor correndo atrás do próprio histórico. */
    dados.tarefas.forEach(function (t) {
      /* Limpeza de um campo que nunca devia ter sido gravado: marca de
         trabalho da importação do Linked Helper, que ficava colada na tarefa e
         subia na sincronização. Hoje ela se chama `_criadaAgora` e o envio
         descarta o que começa com underscore; isto aqui tira o que já estava
         guardado, para o registro não carregar lixo a vida inteira. */
      if ('criadaAgora' in t) delete t.criadaAgora;
      if (!t.origem) t.origem = 'planejada';
      if (t.comRelato == null) t.comRelato = false;
      if (t.hora == null) t.hora = '';
      if (t.descricao == null) t.descricao = '';
      if (t.semRegistro == null) t.semRegistro = false;
      if (t.adiamentos == null) t.adiamentos = 0;
    });
    dados.contatos.forEach(function (c) {
      /* Os campos novos nascem vazios em quem já existia. `email` continua
         sendo o profissional e `telefone` continua sendo o WhatsApp: renomear
         o sentido de um campo que já tem dado dentro é o jeito de perder o
         dado sem ninguém perceber. */
      if (c.emailPessoal == null) c.emailPessoal = '';
      if (c.telefoneComercial == null) c.telefoneComercial = '';
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
      /* Buying group com a mesma pessoa duas vezes: veio da importação, que
         empurrava o contato recém-criado num grupo que já o continha. A base
         em uso precisa ser limpa, não só o caminho que a sujava. */
      o.stakeholders = semRepetir(o.stakeholders);
      (o.eventos || []).forEach(function (e) {
        if (e.tipo === 'decision' && !e.forca) e.forca = 'relato';
      });
    });
    dados.versao = VERSAO;
    return dados;
  }

  /* O navegador deixou de guardar carteira.

     Enquanto o `localStorage` foi a verdade e o servidor uma cópia, tudo o
     que deu errado nesta semana veio daí: o depósito é do NAVEGADOR, não do
     login, então a carteira de uma empresa aparecia no aparelho de outra; o
     envio podia falhar calado e dois computadores mostravam números
     diferentes; e a proteção contra gravar vazio por cima gerava faixas,
     cópias de segurança e botões de restaurar que ofereciam a carteira
     alheia. Cada um desses foi corrigido em separado, e o cano continuava
     furado no mesmo lugar.

     Agora a memória é a única cópia local, e ela morre com a aba. O que
     estava guardado de antes é apagado na primeira abertura — inclusive a
     carteira de outra empresa que tenha ficado ali. */
  function carregar() {
    try {
      localStorage.removeItem(CHAVE);
      localStorage.removeItem(CHAVE_ANTES);
    } catch (e) {
      console.warn('Não consegui limpar o depósito antigo:', e);
    }
    return estado;
  }

  /* Guardar deixou de ser escrever no navegador: é avisar quem leva ao
     servidor. `silencio` existe porque a descida também chama `salvar` para
     acordar a tela — e mandar de volta o que acabou de chegar seria um laço. */
  let aoMudar = null;
  let silencio = false;

  function quandoMudar(fn) { aoMudar = fn; }

  function semSincronizar(fn) {
    silencio = true;
    try { fn(); } finally { silencio = false; }
  }

  function salvar() {
    ouvintes.forEach(function (fn) { fn(estado); });
    if (!silencio && aoMudar) aoMudar();
  }

  /* As exclusões precisam viajar.

     O envio sempre foi `upsert`: manda linha por linha e atualiza o que já
     existe. Apagar nunca chegou ao servidor — e enquanto o navegador mandava
     isso passava despercebido, porque a cópia local já estava sem o registro.
     Com o servidor mandando, a oportunidade excluída voltaria na primeira
     recarga. Ficam aqui, fora do estado, para não serem varridas quando a
     carteira é substituída pela do servidor. */
  const exclusoes = [];

  function registrarExclusao(tabela, id) {
    if (!tabela || !id) return;
    exclusoes.push({ tabela: tabela, id: String(id) });
  }

  function exclusoesPendentes() { return exclusoes.slice(); }

  function esquecerExclusoes(quais) {
    (quais || []).forEach(function (x) {
      for (let i = exclusoes.length - 1; i >= 0; i--) {
        if (exclusoes[i].tabela === x.tabela && exclusoes[i].id === x.id) exclusoes.splice(i, 1);
      }
    });
  }

  /* ---------- a cópia de antes ----------

     A sincronização baixa o que o servidor tem e escreve por cima do que
     está aqui. Enquanto o servidor devolve a carteira, isso é o certo. No dia
     em que ele devolve vazio — permissão, carimbo de empresa errado, usuário
     recém-criado —, escrever por cima apaga o trabalho de quem estava
     trabalhando offline, que é justamente quem este app promete proteger.

     Então toda substituição vinda de fora guarda antes o que havia. Uma cópia
     só, a última: não é histórico, é o passo atrás. */
  const CHAVE_ANTES = 'iad-crm:estado:antes-de-baixar';

  /* A cópia de segurança era carteira guardada no navegador, e é justamente
     isso que acabou. Ela existia para um mundo em que o local podia ser a
     única cópia; agora o servidor é, e guardar uma segunda verdade aqui
     recriaria o problema que esta mudança resolve. Fica como função morta
     para não quebrar quem a chama. */
  function guardarCopiaDeSeguranca(porque) {
    return false;
  }

  function guardarCopiaDeSegurancaAntiga(porque) {
    try {
      const movimento = (estado.contas || []).length + (estado.oportunidades || []).length;
      if (!movimento) return false;   /* não vale a pena guardar o nada */
      localStorage.setItem(CHAVE_ANTES, JSON.stringify({
        em: new Date().toISOString(), porque: porque || '', estado: estado
      }));
      return true;
    } catch (e) {
      console.warn('Não consegui guardar a cópia de segurança:', e);
      return false;
    }
  }

  function copiaDeSeguranca() {
    try {
      const bruto = localStorage.getItem(CHAVE_ANTES);
      if (!bruto) return null;
      const c = JSON.parse(bruto);
      if (!c || !c.estado) return null;
      /* Quanto desta cópia é da empresa de quem está olhando.

         Sem esta conta, oferecer a cópia é oferecer a carteira de outra
         empresa: o aparelho da Rosa guardou uma cópia com 72 empresas e 73
         negociações da Bio Water Care, e a faixa ofereceu "restaurar essa
         cópia" para uma gestora da AcP que nunca enxergaria nenhuma delas.
         Aceitar teria trazido de volta tudo o que ela acabou de apagar de
         propósito, e ainda invisível.

         `visivel` só olha o registro e quem está logado — serve tanto para o
         que está guardado quanto para o que está dentro da cópia. */
      const meus = function (lista) {
        return (lista || []).filter(function (r) { return visivel(r, false); }).length;
      };
      return { em: c.em, porque: c.porque || '',
        contas: (c.estado.contas || []).length,
        oportunidades: (c.estado.oportunidades || []).length,
        tarefas: (c.estado.tarefas || []).length,
        minhasContas: meus(c.estado.contas),
        minhasOportunidades: meus(c.estado.oportunidades) };
    } catch (e) { return null; }
  }

  function restaurarCopiaDeSeguranca() {
    try {
      const bruto = localStorage.getItem(CHAVE_ANTES);
      if (!bruto) return false;
      const c = JSON.parse(bruto);
      if (!c || !c.estado) return false;
      substituir(c.estado);
      return true;
    } catch (e) { return false; }
  }

  function descartarCopiaDeSeguranca() {
    try { localStorage.removeItem(CHAVE_ANTES); } catch (e) { /* nada a fazer */ }
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
      /* Reaproveita a que já existe. Criar uma "Minha empresa" a cada
         importação enchia a lista de empresas iguais, e empresa duplicada é o
         que torna registro invisível: cada uma tem id próprio, e o carimbo do
         registro aponta para um só. */
      const jaTem = (estado.tenants || []).filter(function (t) { return t.nome === 'Minha empresa'; })[0];
      const novoTenant = jaTem ||
        { id: uid('ten'), nome: 'Minha empresa', cnpj: '', ativo: true, criadoEm: hoje() };
      if (!jaTem) estado.tenants.push(novoTenant);
      alvo = novoTenant.id;
    }
    /* Carimbo que aponta para empresa inexistente vale menos que carimbo
       nenhum: o registro entra, ocupa espaço e não aparece para ninguém.

       Era o que acontecia com a demonstração e com todo backup importado. O
       migrador, ao ver registros sem empresa, inventava uma "Minha empresa" e
       carimbava tudo com ela; logo abaixo, substituir() descartava essa
       empresa recém-criada para preservar a lista de acessos deste aparelho.
       Os registros ficavam apontando para um id que não existia mais em lugar
       nenhum. Clicar em "Carregar demonstração" gravava tudo e não mostrava
       nada — e quem clicava concluía que o botão estava quebrado. */
    const existentes = {};
    (estado.tenants || []).forEach(function (t) { existentes[t.id] = true; });

    /* Mas "empresa que não existe aqui" não é o mesmo que "empresa que não
       existe". A empresa do servidor tem id UUID; a que este app inventa para
       registro órfão tem a forma `ten_xxx` e nunca existiu em servidor nenhum.

       Um UUID ausente da lista deste aparelho é carteira de outra empresa que
       este navegador ainda não conhece — recarimbar aquilo é mudar a
       prospecção de dono. Só o carimbo inventado, e o vazio, viram da empresa
       de quem está trabalhando. */
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const semCasa = function (r) {
      const dele = String(r.tenantId || '');
      if (!dele) return true;
      if (existentes[dele]) return false;
      return !UUID.test(dele);
    };

    ['contas', 'contatos', 'segmentos', 'tiposTarefa', 'produtos', 'fontes'].forEach(function (colecao) {
      (estado[colecao] || []).forEach(function (r) { if (semCasa(r)) r.tenantId = alvo; });
    });
    ['oportunidades', 'tarefas'].forEach(function (colecao) {
      (estado[colecao] || []).forEach(function (r) {
        if (semCasa(r)) r.tenantId = alvo;
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
      /* Gestor enxerga a empresa inteira; administrador também, e mais. */
      gestor: u.papel === 'gestor' || u.papel === 'admin',
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

  /* Três níveis, e a regra de verdade está no banco (correcao-05-gestor.sql).
     Aqui é o reflexo: sem isto a tela mostraria o que a cópia local tem, que é
     o que o servidor já entregou filtrado — mas quem trabalha offline continua
     precisando do filtro certo. */
  function visivel(registro, comDono) {
    const ctx = contexto();
    if (!ctx.usuario) return false;

    if (ctx.admin) {
      if (ctx.filtros.tenant !== 'todas' && registro.tenantId !== ctx.filtros.tenant) return false;
      if (comDono && ctx.filtros.usuario !== 'todos' && registro.donoId !== ctx.filtros.usuario) return false;
      return true;
    }

    if (registro.tenantId !== ctx.tenantId) return false;
    if (!comDono || ctx.gestor) return true;
    /* Registro sem dono é da empresa: não some para ninguém. */
    return !registro.donoId || registro.donoId === ctx.usuario.id;
  }

  /* Por que a tela está vazia. Sem isto, "sumiu tudo" é um print — e um print
     não distingue "o servidor não mandou nada", "veio com a empresa errada" e
     "está tudo aqui e um filtro escondeu". As três têm correções diferentes e
     eu já perdi rodadas adivinhando qual era. */
  function diagnostico() {
    const ctx = contexto();
    const A = global.IADAuth;
    const u = ctx.usuario;
    const colecoes = ['contas', 'contatos', 'oportunidades', 'tarefas', 'segmentos', 'tiposTarefa', 'produtos', 'fontes', 'sinais', 'notas'];

    const linhas = colecoes.map(function (nome) {
      const todos = estado[nome] || [];
      const comDono = ['contas', 'contatos', 'oportunidades', 'tarefas', 'notas'].indexOf(nome) !== -1;
      return {
        colecao: nome,
        guardados: todos.length,
        visiveis: todos.filter(function (r) { return visivel(r, comDono); }).length
      };
    });

    /* Os tenantIds que aparecem nos registros, com quantos em cada. É a
       pergunta que resolve o caso mais comum: os dados estão aqui, mas
       carimbados com a empresa de outra conta. */
    const porTenant = {};
    colecoes.forEach(function (nome) {
      (estado[nome] || []).forEach(function (r) {
        const k = r.tenantId || '(sem empresa)';
        porTenant[k] = (porTenant[k] || 0) + 1;
      });
    });

    const semDono = (estado.oportunidades || []).filter(function (o) { return !o.donoId; }).length;

    return {
      usuario: u ? (u.nome || u.login) : null,
      login: u ? (u.login || u.email) : null,
      papel: u ? u.papel : null,
      meuTenantId: ctx.tenantId,
      minhaEmpresa: (u && A.tenant(u.tenantId) && A.tenant(u.tenantId).nome) || '',
      empresasEspelhadas: (estado.tenants || []).map(function (t) { return { id: t.id, nome: t.nome }; }),
      filtrosDoAdmin: ctx.admin ? ctx.filtros : null,
      colecoes: linhas,
      registrosPorEmpresa: porTenant,
      empresasFantasma: empresasFantasma(),
      oportunidadesSemDono: semDono
    };
  }

  /* ---------- juntar empresas duplicadas ----------

     A mesma empresa cadastrada quatro vezes — "acP", "AcP", "Advanced Channel
     Partners", "AcP - Advanced Channel Partners" — não é bagunça de nome: cada
     uma tem id próprio, e todo registro aponta para um só. Um registro
     carimbado com a variante errada é invisível para quem entra pela certa, e
     invisível sem erro nenhum na tela, que é a pior forma de sumir.

     Isto muda o carimbo dos registros deste aparelho, de uma empresa para
     outra, e apaga a empresa esvaziada. Não toca no servidor: lá a mesma
     limpeza é uma consulta, e misturar as duas num clique só esconderia qual
     das duas falhou. */
  /* Empresas que carimbam registros aqui e não existem mais no servidor.

     Nascem de uma situação específica e cada vez mais comum: a mesma empresa
     foi cadastrada duas vezes, as duas foram juntadas do lado do servidor, e
     este aparelho continua com o carimbo antigo. O registro fica apontando
     para um cofre que não existe — e sincronizar devolve erro de chave
     estrangeira, que é a mensagem menos útil possível para quem só quer a
     carteira de volta.

     `(sem empresa)` fica de fora: aquilo é registro criado offline antes de
     haver empresa, e quem cuida dele é o adotarOrfaos. */
  function empresasFantasma() {
    const conhecidas = {};
    (estado.tenants || []).forEach(function (t) { conhecidas[String(t.id)] = true; });

    const colecoes = ['contas', 'contatos', 'oportunidades', 'tarefas', 'segmentos', 'tiposTarefa', 'produtos', 'fontes', 'sinais'];
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const conta = {};
    colecoes.forEach(function (nome) {
      (estado[nome] || []).forEach(function (r) {
        const k = String(r.tenantId || '');
        /* Só UUID: o carimbo `ten_xxx` que o app inventa nunca existiu em
           servidor nenhum e não é fantasma, é local de nascença. */
        if (!k || conhecidas[k] || !UUID.test(k)) return;
        conta[k] = (conta[k] || 0) + 1;
      });
    });

    return Object.keys(conta).map(function (id) {
      return { id: id, registros: conta[id] };
    });
  }

  /* Traz para uma empresa tudo que aponta para empresa que não existe mais.
     Um clique, sem ninguém precisar copiar identificador de uma tela para
     outra — que é onde o erro acontece. */
  function adotarFantasmas(paraId) {
    if (!paraId) return 0;
    let total = 0;
    empresasFantasma().forEach(function (f) {
      total += moverRegistros(f.id, paraId);
    });
    return total;
  }

  function moverRegistros(deId, paraId) {
    if (!deId || !paraId || deId === paraId) return 0;
    const colecoes = ['contas', 'contatos', 'oportunidades', 'tarefas', 'segmentos', 'tiposTarefa', 'produtos', 'fontes', 'sinais'];
    let mexidos = 0;
    colecoes.forEach(function (nome) {
      (estado[nome] || []).forEach(function (r) {
        if (String(r.tenantId || '') === String(deId)) { r.tenantId = paraId; mexidos++; }
      });
    });
    salvar();
    return mexidos;
  }

  function esquecerEmpresa(id) {
    const usada = ['contas', 'contatos', 'oportunidades', 'tarefas', 'segmentos', 'tiposTarefa', 'produtos', 'fontes', 'sinais']
      .some(function (nome) {
        return (estado[nome] || []).some(function (r) { return String(r.tenantId || '') === String(id); });
      });
    if (usada) return false;   /* nunca some com empresa que ainda carimba algo */
    estado.tenants = (estado.tenants || []).filter(function (t) { return t.id !== id; });
    salvar();
    return true;
  }

  /* Mesma forma do estado, já filtrado. As telas leem daqui, nunca de obter(). */
  function dados() {
    const porTenant = function (lista) { return (lista || []).filter(function (r) { return visivel(r, false); }); };
    const porDono = function (lista) { return (lista || []).filter(function (r) { return visivel(r, true); }); };
    return {
      tenants: estado.tenants,
      usuarios: estado.usuarios,
      contas: porDono(estado.contas),
      contatos: porDono(estado.contatos),
      oportunidades: porDono(estado.oportunidades),
      tarefas: porDono(estado.tarefas),
      segmentos: porTenant(estado.segmentos),
      tiposTarefa: porTenant(estado.tiposTarefa),
      produtos: porTenant(estado.produtos),
      fontes: porTenant(estado.fontes),
      /* Por dono, e não por empresa: sinal é dado de pessoa identificada e
         segue a mesma regra do contato a que ele pertence. Um vendedor não
         enxerga o comportamento das contas do colega. */
      sinais: porDono(estado.sinais),
      /* Nem por empresa nem por dono: só minhas. `porDono` deixaria o gestor
         ler o caderninho da equipe, que é exatamente o que esta tela promete
         não fazer. */
      notas: ordenarNotas((estado.notas || []).filter(minhaNota)),
      config: estado.config
    };
  }

  /* ---------- notas rápidas ----------

     Tudo aqui é de propósito mais pobre do que uma tarefa. Uma nota tem texto
     e um estado: feita ou não. Não tem prazo, não tem tipo, não tem dono que
     não seja quem escreveu. Essa pobreza é a funcionalidade: o que compete
     com o Post-it não é um formulário melhor, é não ter formulário.

     A nota é privada, e privada de verdade: nem gestor nem administrador
     enxergam. A regra vale no banco (correcao-23) e vale aqui. Um rascunho
     que o chefe lê é um rascunho onde ninguém escreve o que realmente
     precisa lembrar — e aí a tela vira mais um lugar vazio. */
  function minhaNota(n) {
    const ctx = contexto();
    if (!ctx.usuario) return false;
    return String(n.donoId || '') === String(ctx.usuario.id);
  }

  /* Abertas primeiro, e dentro de cada grupo a mais nova em cima: o que eu
     acabei de anotar é o que eu ainda não fiz. */
  function ordenarNotas(lista) {
    return lista.slice().sort(function (a, b) {
      if (!!a.feita !== !!b.feita) return a.feita ? 1 : -1;
      return String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')) ||
             String(b.id || '').localeCompare(String(a.id || ''));
    });
  }

  function minhasNotas() {
    return ordenarNotas((estado.notas || []).filter(minhaNota));
  }

  function notasAbertas() {
    return minhasNotas().filter(function (n) { return !n.feita; });
  }

  function nota(id) {
    return (estado.notas || []).filter(function (n) { return n.id === id && minhaNota(n); })[0] || null;
  }

  /* `oportunidadeId` nasce vazio quase sempre, e é assim que tem que ser: a
     nota vem antes de saber a que negócio ela pertence. Quando o app
     reconhece um nome no texto, ele preenche — mas depois, e sem perguntar. */
  function criarNota(texto, oportunidadeId) {
    const limpo = String(texto || '').trim();
    if (!limpo) return null;
    const base = Object.assign({
      id: uid('not'),
      texto: limpo,
      feita: false,
      oportunidadeId: oportunidadeId || null,
      /* Instante inteiro, e não `hoje()`: cinco anotações do mesmo dia com a
         mesma data empatam, e empate aqui é lista fora de ordem. */
      criadoEm: new Date().toISOString()
    }, carimbo(true));
    estado.notas = estado.notas || [];
    estado.notas.push(base);
    salvar();
    return base;
  }

  function atualizarNota(id, dados) {
    const n = nota(id);
    if (!n) return null;
    if (dados.texto != null) {
      const limpo = String(dados.texto).trim();
      if (!limpo) return n;      /* apagar o texto todo é excluir, e isso tem botão */
      n.texto = limpo;
    }
    if (dados.feita != null) n.feita = !!dados.feita;
    if (dados.oportunidadeId !== undefined) n.oportunidadeId = dados.oportunidadeId || null;
    salvar();
    return n;
  }

  /* Com argumento, para o mesmo botão servir de desfazer. Marcar por engano e
     não ter volta é o jeito mais rápido de a pessoa parar de marcar. */
  function concluirNota(id, feita) {
    return atualizarNota(id, { feita: feita === undefined ? true : !!feita });
  }

  function excluirNota(id) {
    const n = nota(id);
    if (!n) return false;
    estado.notas = (estado.notas || []).filter(function (x) { return x.id !== id; });
    registrarExclusao('notas', id);
    salvar();
    return true;
  }

  function carimbo(comDono) {
    const ctx = contexto();
    const marca = { tenantId: tenantDeTrabalho() };
    if (comDono) marca.donoId = ctx.usuario ? ctx.usuario.id : null;
    return marca;
  }

  /* ---------- da régua de três degraus para a de cinco ----------

     A escala era 0, 1 e 2, com a força da evidência (relato, confirmado,
     documentado) num eixo separado. Passa a ser 0 a 4, com a origem da
     informação sendo a própria escada.

     Ninguém precisa repontuar nada, porque a informação necessária já está
     gravada: a força da evidência mais forte de cada decisão. É ela que diz se
     um 2 antigo era "o cliente confirmou" ou "está no papel".

     - 0 continua 0.
     - 1 vira 2. O antigo 1 era "reconhece, mas de forma vaga", que na régua
       nova é exatamente "declarado pelo cliente".
     - 2 vira 3 ou 4, conforme a evidência mais forte já registrada: confirmada
       vira 3 (testado), documentada vira 4. Um 2 sem nenhuma evidência forte
       vira 2 — era o caso que a regra antiga chamava de "comprovado sem prova",
       e a régua nova simplesmente não deixa ele subir.

     Roda uma vez e se marca como feita: sem a marca, a segunda carga
     promoveria de novo o que já subiu, e a carteira inteira iria para 4. */
  const PESO_DA_FORCA = { relato: 1, confirmado: 2, documentado: 3 };

  function migrarParaCincoDegraus(dados) {
    if (dados.escalaDeCincoDegraus) return;
    dados.escalaDeCincoDegraus = true;

    (dados.oportunidades || []).forEach(function (op) {
      if (!op.dims) return;
      const maisForte = {};
      (op.eventos || []).forEach(function (e) {
        if (e.tipo !== 'decision' || !e.dimensao) return;
        const peso = PESO_DA_FORCA[e.forca] || 0;
        if (peso > (maisForte[e.dimensao] || 0)) maisForte[e.dimensao] = peso;
      });

      Object.keys(op.dims).forEach(function (dim) {
        const antiga = op.dims[dim] || 0;
        if (antiga === 0) { op.dims[dim] = 0; return; }
        if (antiga === 1) { op.dims[dim] = 2; return; }
        if (antiga !== 2) return;                    /* já migrado ou fora da faixa */
        const forca = maisForte[dim] || 0;
        op.dims[dim] = forca >= 3 ? 4 : (forca >= 2 ? 3 : 2);
      });

      /* O histórico da curva do IAD também precisa mudar de escala, senão o
         gráfico mostra uma queda que nunca aconteceu no dia da migração. */
      (op.snapshots || []).forEach(function (m) {
        if (!m.dims) return;
        Object.keys(m.dims).forEach(function (dim) {
          const v = m.dims[dim] || 0;
          m.dims[dim] = v === 1 ? 2 : (v === 2 ? 3 : v);
        });
        m.iad = Object.keys(m.dims).reduce(function (t, k) { return t + m.dims[k]; }, 0);
        if (m.de === 1) m.de = 2; else if (m.de === 2) m.de = 3;
        if (m.para === 1) m.para = 2; else if (m.para === 2) m.para = 3;
      });

      if (op.desfecho && typeof op.desfecho.iadFinal === 'number') {
        op.desfecho.iadFinal = Object.keys(op.dims)
          .reduce(function (t, k) { return t + (op.dims[k] || 0); }, 0);
      }
    });
  }

  /* Registro sem empresa não aparece para ninguém: o filtro por empresa o
     esconde, e para quem cadastrou parece que o salvar não funcionou. Aconteceu
     de verdade com as contas, que nasciam sem carimbo. Corrigida a origem, isto
     recupera o que já tinha sido gravado assim.

     Só roda para usuário comum, que tem exatamente uma empresa: para o
     administrador, com várias à vista, não há resposta certa sobre de quem é o
     registro órfão — e adivinhar seria pior do que deixar aparecer. */
  function adotarOrfaos() {
    const ctx = contexto();
    if (!ctx.usuario || ctx.admin || !ctx.tenantId) return 0;
    let adotados = 0;
    /* A padronização vem antes da adoção, e não depois: o tipo que ela
       acrescenta nasce sem empresa e ficaria invisível até o render seguinte. */
    const padronizou = padronizarTiposTarefa(estado);
    ['contas', 'contatos', 'oportunidades', 'tarefas', 'segmentos', 'tiposTarefa', 'produtos', 'fontes', 'recusas', 'sinais']
      .forEach(function (colecao) {
        (estado[colecao] || []).forEach(function (r) {
          if (!r.tenantId) { r.tenantId = ctx.tenantId; adotados++; }
        });
      });
    if (adotados || padronizou) salvar();
    return adotados;
  }

  function conta(id) { return estado.contas.find(function (c) { return c.id === id; }); }
  function contato(id) { return estado.contatos.find(function (c) { return c.id === id; }); }
  function oportunidade(id) { return estado.oportunidades.find(function (o) { return o.id === id; }); }
  function tarefa(id) { return estado.tarefas.find(function (t) { return t.id === id; }); }
  function contatosDaConta(contaId) {
    return estado.contatos.filter(function (c) { return c.contaId === contaId && visivel(c, true); });
  }
  function tarefasDaOportunidade(opId) {
    return estado.tarefas.filter(function (t) { return t.oportunidadeId === opId && visivel(t, true); });
  }

  function criarConta(dados) {
    const nova = Object.assign({
      id: uid('acc'), nome: '', razaoSocial: '', cnpj: '', segmento: '', porte: '',
      cidade: '', uf: '', site: '', telefone: '', relacaoAtual: 'Prospect', criadoEm: hoje()
    }, carimbo(true), dados);
    estado.contas.push(nova);
    salvar();
    return nova;
  }

  function criarContato(dados) {
    const novo = Object.assign({
      id: uid('ctt'), contaId: null, nome: '', cargo: '', papel: 'Usuário',
      /* Dois de cada, e a razão é prática, não cadastral.

         O e-mail profissional morre quando a pessoa troca de emprego; o
         pessoal é o que sobrevive — e numa venda consultiva o comprador de
         hoje é o comprador da próxima empresa dele.

         Nos telefones a separação é operacional: `telefone` é o WhatsApp, e é
         por ele que a conversa casa com o contato. O comercial é o da mesa,
         que ninguém usa para conversar e que não deve concorrer no casamento
         como primeira escolha. */
      email: '', emailPessoal: '',
      telefone: '', telefoneComercial: '',
      linkedin: '', influencia: 2, reportaA: null,
      canalPreferido: '', perfil: 'nao_classificado', sentimento: 'nao_acessado', criadoEm: hoje()
    }, carimbo(true), dados);
    estado.contatos.push(novo);
    salvar();
    return novo;
  }

  function semRepetir(ids) {
    const vistos = {};
    return (ids || []).filter(function (id) {
      if (!id || vistos[id]) return false;
      vistos[id] = true;
      return true;
    });
  }

  /* Vincular alguém ao buying group tinha de passar por aqui, e não por um
     push solto: a oportunidade nasce já com os contatos da conta, e quem
     acabou de criar o contato empurrava o mesmo id de novo. O resultado era a
     mesma pessoa duas vezes no grupo comprador — "2 pessoas, 0% dos papéis
     críticos" numa conta com um contato só. */
  function vincularStakeholder(op, contatoId) {
    if (!op || !contatoId) return false;
    op.stakeholders = semRepetir(op.stakeholders);
    if (op.stakeholders.indexOf(contatoId) !== -1) return false;
    op.stakeholders.push(contatoId);
    return true;
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
      /* De onde o negócio veio. Com várias SDRs prospectando, sem isto não
         dá para dizer qual campanha e qual pessoa produziram pipeline real. */
      origem: '',
      /* Aponta para a linha da tabela de fontes. `origem` continua sendo o
         texto solto do que foi criado antes dela existir. */
      fonteId: '',
      campanha: '',
      sdr: '',
      sdrEmail: '',
      criadoEm: hoje(),
      fechamentoPrevisto: daquiADias(PRAZO_PADRAO_DE_FECHAMENTO),
      adiamentos: 0,
      itens: [],
      /* O que o mensal soma no valor do negócio. Fica na oportunidade e não no
         item porque prazo é do contrato, não de cada linha. */
      prazoContratoMeses: (global.IADPlaybook && global.IADPlaybook.PRAZO_CONTRATO_PADRAO) || 12,
      valorMensal: 0,
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
    /* O formulário devolve string vazia quando ninguém digitou, e string vazia
       venceria o padrão no Object.assign acima. Sem esta linha o campo em
       branco continuaria produzindo negócio sem data — que é exatamente o que
       o padrão existe para evitar. */
    if (!nova.fechamentoPrevisto) nova.fechamentoPrevisto = daquiADias(PRAZO_PADRAO_DE_FECHAMENTO);
    nova.snapshots = [{ data: hoje(), iad: 0, dims: Object.assign({}, nova.dims) }];

    /* O buying group começa com quem já está cadastrado na empresa: são as
       pessoas daquela conta. Exigir vincular uma a uma fazia o app acusar venda
       single-threaded e 0% de cobertura num negócio com três interlocutores já
       cadastrados — alarme falso, que é pior do que alarme nenhum. Quem não faz
       parte deste negócio se remove no cockpit. */
    if (!nova.stakeholders.length && nova.contaId) {
      nova.stakeholders = contatosDaConta(nova.contaId).map(function (c) { return c.id; });
    }
    nova.stakeholders = semRepetir(nova.stakeholders);

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
  /* "origem" diz o que provocou esta mudança de nota — normalmente a conclusão
     de uma tarefa. Carimbar no snapshot é o que permite responder, semanas
     depois, quais tarefas de fato movem decisão e quais só movem o calendário.
     Sem o carimbo só sobra adivinhar pela data, que erra sempre que duas coisas
     acontecem no mesmo dia. */
  function pontuar(id, dimensao, valor, justificativa, origem) {
    const op = oportunidade(id);
    if (!op) return null;
    const anterior = op.dims[dimensao] || 0;
    const limite = (global.IADPlaybook && global.IADPlaybook.NOTA_MAXIMA) || 4;
    if (!(valor >= 0 && valor <= limite)) return op;
    if (anterior === valor) return op;

    op.dims[dimensao] = valor;
    const iad = Object.keys(op.dims).reduce(function (s, k) { return s + op.dims[k]; }, 0);
    const marca = {
      data: hoje(), iad: iad, dims: Object.assign({}, op.dims),
      dimensaoAlterada: dimensao, de: anterior, para: valor
    };
    if (origem && origem.tarefaId) {
      marca.tarefaId = origem.tarefaId;
      marca.tipoTarefa = origem.tipoTarefa || '';
    }
    op.snapshots.push(marca);
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

    /* Evidência do cliente acorda a nutrição sozinha.

       Nutrição existe porque a conta não estava pronta. Evidência nova é
       exatamente o sinal de que ficou — e exigir que alguém lembre de clicar
       em "Retomar" é apostar contra a memória de quem já tem trinta contas.
       A nutrição encerrada fica no histórico: quantas vezes uma conta entrou
       e saiu de nutrição é dado sobre ela, não ruído. */
    if (op.nutricao) {
      op.historicoNutricao = (op.historicoNutricao || []).concat([
        Object.assign({}, op.nutricao, { retomadaEm: hoje(),
          porque: 'Evidência nova do cliente: ' + (novo.titulo || 'sem título') })
      ]);
      op.nutricao = null;
    }

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

  /* ---------------- Sinais do comprador ----------------

     Regra que não se negocia: nada aqui toca em `op.eventos`, em `op.dims` nem
     em nota nenhuma. Sinal é observação; evidência é decisão comprovada. A
     ponte entre os dois é `promoverSinal`, e ela só existe porque alguém
     clicou nela. */
  function sinal(id) {
    return (estado.sinais || []).filter(function (s) { return s.id === id; })[0] || null;
  }

  /* A conta vem de graça quando o contato é conhecido: quem registra o sinal
     está olhando para a pessoa, não para a árvore de cadastro, e exigir que
     ele também diga a empresa é o tipo de campo que faz o registro não
     acontecer. */
  function criarSinal(dados) {
    const base = Object.assign({
      id: uid('sin'), contatoId: null, contaId: null, oportunidadeId: null,
      canal: 'outro', tipo: 'outro', peso: 1,
      quando: hoje(), hora: '', titulo: '', detalhe: '',
      /* De onde veio, quando não foi digitado: 'manual', 'whatsapp', 'ponte'.
         Serve para não duplicar o que a máquina já traz e para saber, depois,
         qual canal está realmente alimentando a carteira. */
      fonte: 'manual',
      /* Id do registro no sistema de origem. É o que impede o mesmo sinal de
         entrar duas vezes quando a captura automática roda de novo. */
      externoId: '',
      /* Qual link rastreado gerou este sinal. Campo próprio, e não enfiado no
         `detalhe`: detalhe é texto que a pessoa lê, e identificador ali vira
         "LINK1" aparecendo na tela do vendedor. Também é o que diz se a
         próxima abertura do mesmo link é uma volta. */
      linkId: '',
      /* Preenchido só quando alguém promove o sinal a evidência. */
      eventoId: '',
      criadoEm: hoje()
    }, carimbo(true), dados);

    const tipo = (global.IADPlaybook.TIPOS_SINAL || []).filter(function (t) {
      return t.id === base.tipo;
    })[0];
    if (tipo) {
      base.canal = dados.canal || tipo.canal;
      if (dados.peso == null) base.peso = tipo.peso;
      if (!base.titulo) base.titulo = tipo.rotulo;
    }

    if (!base.contaId && base.contatoId) {
      const c = contato(base.contatoId);
      if (c) base.contaId = c.contaId;
    }
    if (!base.contaId && base.oportunidadeId) {
      const op = oportunidade(base.oportunidadeId);
      if (op) base.contaId = op.contaId;
    }

    estado.sinais = estado.sinais || [];
    estado.sinais.push(base);
    salvar();
    return base;
  }

  /* Idempotência da captura automática. Sem isto, cada recarga da conversa do
     WhatsApp criaria de novo os mesmos sinais e a linha do tempo viraria um
     eco — e o alerta de "comportamento à frente do registro" dispararia com
     ruído que o próprio app fabricou. */
  function sinalExterno(fonte, externoId) {
    if (!fonte || !externoId) return null;
    return (estado.sinais || []).filter(function (s) {
      return s.fonte === fonte && String(s.externoId) === String(externoId);
    })[0] || null;
  }

  function registrarSinalUnico(dados) {
    const achado = sinalExterno(dados.fonte, dados.externoId);
    if (achado) return achado;
    return criarSinal(dados);
  }

  function ordenarSinais(lista) {
    return lista.slice().sort(function (a, b) {
      const da = String(a.quando || '') + ' ' + String(a.hora || '');
      const db = String(b.quando || '') + ' ' + String(b.hora || '');
      return db.localeCompare(da);
    });
  }

  function sinais() {
    return ordenarSinais((estado.sinais || []).filter(function (s) { return visivel(s, true); }));
  }

  function sinaisDoContato(contatoId) {
    if (!contatoId) return [];
    return ordenarSinais((estado.sinais || []).filter(function (s) {
      return s.contatoId === contatoId && visivel(s, true);
    }));
  }

  function sinaisDaConta(contaId) {
    if (!contaId) return [];
    return ordenarSinais((estado.sinais || []).filter(function (s) {
      return s.contaId === contaId && visivel(s, true);
    }));
  }

  /* O que conta como sinal DESTA negociação.

     Três caminhos, e o terceiro é o que importa: o sinal amarrado direto na
     oportunidade, o sinal de alguém do grupo comprador dela, e o sinal da
     conta que ainda não foi amarrado a negociação nenhuma. Ignorar o terceiro
     seria jogar fora exatamente o sinal que chega antes de alguém ter tido o
     trabalho de organizar o cadastro — que é quando ele vale mais. */
  function sinaisDaOportunidade(op) {
    if (!op) return [];
    const doGrupo = {};
    (op.stakeholders || []).forEach(function (id) { doGrupo[id] = true; });
    return ordenarSinais((estado.sinais || []).filter(function (s) {
      if (!visivel(s, true)) return false;
      if (s.oportunidadeId === op.id) return true;
      if (s.oportunidadeId) return false;
      if (s.contatoId && doGrupo[s.contatoId]) return true;
      return !s.contatoId && !!op.contaId && s.contaId === op.contaId;
    }));
  }

  function excluirSinal(id) {
    const antes = (estado.sinais || []).length;
    estado.sinais = (estado.sinais || []).filter(function (s) { return s.id !== id; });
    if (estado.sinais.length === antes) return false;
    registrarExclusao('sinais', id);
    salvar();
    return true;
  }

  /* Promover é a única porta entre observação e régua, e ela é humana de
     propósito: quem diz que abrir a proposta três vezes comprova Prioridade é
     uma pessoa que conhece a conta, não uma tabela de pesos.

     O sinal não morre ao virar evidência: fica marcado com o evento que gerou.
     Perder o rastro seria perder a resposta para "o que essa evidência tinha
     de verdade por trás", que é a pergunta que o histórico existe para
     responder. */
  function promoverSinal(sinalId, opId, evento) {
    const s = sinal(sinalId);
    const op = oportunidade(opId);
    if (!s || !op) return null;
    if (s.eventoId) return op;

    const novo = registrarEvento(op.id, Object.assign({
      tipo: 'decision',
      data: s.quando || hoje(),
      titulo: s.titulo || 'Sinal do comprador',
      descricao: s.detalhe || '',
      canal: s.canal,
      sinalId: s.id
    }, evento || {}));
    if (!novo) return null;

    const gravado = (op.eventos || [])[0];
    s.eventoId = gravado ? gravado.id : '';
    if (!s.oportunidadeId) s.oportunidadeId = op.id;
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

  /* ---------- Itens da oportunidade ----------

     Duas tabelas, e a confusão entre elas é o erro clássico. O CATÁLOGO é o
     que a empresa vende: uma lista só, do gestor, com preço de referência. Os
     ITENS são o que ESTE negócio leva: quantidade, preço negociado e desconto,
     que são de cada negociação e de mais ninguém.

     Por isso a linha congela `nome` e `precoTabela` no dia em que entra. Sem
     congelar, mexer no catálogo reescreve o passado: o gestor sobe o preço em
     março e a proposta enviada em janeiro passa a dizer outra coisa. */
  function itemNovo(dados) {
    const p = dados.produtoId ? produto(dados.produtoId) : null;
    return {
      id: uid('itm'),
      produtoId: dados.produtoId || '',
      nome: dados.nome || (p ? p.nome : ''),
      quantidade: Number(dados.quantidade) || 1,
      precoTabela: p ? (Number(p.precoReferencia) || 0) : 0,
      precoUnitario: dados.precoUnitario != null
        ? (Number(dados.precoUnitario) || 0)
        : (p ? (Number(p.precoReferencia) || 0) : 0),
      recorrencia: dados.recorrencia || (p && p.tipoCobranca) || 'unico',
      desconto: Number(dados.desconto) || 0
    };
  }

  function totalDoItem(i) {
    const bruto = (Number(i.precoUnitario) || 0) * (Number(i.quantidade) || 0);
    return bruto * (1 - (Number(i.desconto) || 0) / 100);
  }

  /* O único e o mensal nunca somam entre si. O que soma os dois é o total do
     contrato, e só porque ali o prazo está explícito na conta. */
  function totaisDaOportunidade(op) {
    const itens = (op && op.itens) || [];
    let unico = 0, mensal = 0;
    itens.forEach(function (i) {
      if (i.recorrencia === 'mensal') mensal += totalDoItem(i);
      else unico += totalDoItem(i);
    });
    const padrao = (global.IADPlaybook && global.IADPlaybook.PRAZO_CONTRATO_PADRAO) || 12;
    const meses = Number(op && op.prazoContratoMeses) || padrao;
    return { unico: unico, mensal: mensal, meses: meses,
             contrato: unico + mensal * meses, temItens: itens.length > 0 };
  }

  /* Sem item nenhum o valor continua sendo o que a pessoa digitou. É o que
     protege a carteira que já existe: recalcular tudo na migração zeraria
     dezenas de negócios que nunca tiveram lista de produtos. */
  function recalcularValor(op) {
    if (!op) return;
    const t = totaisDaOportunidade(op);
    if (!t.temItens) return;
    op.valor = t.contrato;
    op.valorMensal = t.mensal;
  }

  function itensDaOportunidade(opId) {
    const op = oportunidade(opId);
    return (op && op.itens) || [];
  }

  function adicionarItem(opId, dados) {
    const op = oportunidade(opId);
    if (!op) return null;
    op.itens = op.itens || [];
    const item = itemNovo(dados || {});
    if (!item.nome) return null;
    op.itens.push(item);
    recalcularValor(op);
    salvar();
    return item;
  }

  function atualizarItem(opId, itemId, mudancas) {
    const op = oportunidade(opId);
    if (!op) return null;
    const item = (op.itens || []).find(function (i) { return i.id === itemId; });
    if (!item) return null;
    Object.assign(item, mudancas);
    item.quantidade = Number(item.quantidade) || 1;
    item.precoUnitario = Number(item.precoUnitario) || 0;
    item.desconto = Number(item.desconto) || 0;
    recalcularValor(op);
    salvar();
    return item;
  }

  function removerItem(opId, itemId) {
    const op = oportunidade(opId);
    if (!op) return false;
    const antes = (op.itens || []).length;
    op.itens = (op.itens || []).filter(function (i) { return i.id !== itemId; });
    if (op.itens.length === antes) return false;
    /* Tirar o último item devolve o valor para o campo digitado, e não para
       zero: zerar um negócio porque alguém apagou uma linha seria estrago. */
    recalcularValor(op);
    salvar();
    return true;
  }

  function definirPrazoContrato(opId, meses) {
    const op = oportunidade(opId);
    if (!op) return null;
    op.prazoContratoMeses = Math.max(1, Number(meses) || 1);
    recalcularValor(op);
    salvar();
    return op;
  }

  /* ---------- Catálogos: segmentos, tipos de tarefa e produtos ---------- */
  const CATALOGOS = { segmentos: 'seg', tiposTarefa: 'tpt', produtos: 'prd', fontes: 'fnt' };

  function catalogo(nome) {
    return (estado[nome] || []).filter(function (i) { return visivel(i, false); });
  }

  function catalogoAtivos(nome) {
    return catalogo(nome).filter(function (i) { return i.ativo !== false; });
  }

  /* Sem nome repetido. O catálogo é por empresa, mas o administrador que está
     em "Todas as empresas" enxerga o de todas — e via "WhatsApp" três vezes
     numa lista de escolher um. O que fica gravado na tarefa é o nome, não o
     id, então nome repetido é ruído puro: some, e nada se perde. */
  function nomesDoCatalogo(nome) {
    const vistos = {};
    return catalogoAtivos(nome).map(function (i) { return i.nome; }).filter(function (n) {
      const chave = String(n || '').trim().toLowerCase();
      if (!chave || vistos[chave]) return false;
      vistos[chave] = true;
      return true;
    });
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

  const TABELA_DO_CATALOGO = {
    segmentos: 'segmentos', tiposTarefa: 'tipos_tarefa', produtos: 'produtos', fontes: 'fontes'
  };

  function removerDoCatalogo(nome, id) {
    estado[nome] = catalogo(nome).filter(function (i) { return i.id !== id; });
    if (TABELA_DO_CATALOGO[nome]) registrarExclusao(TABELA_DO_CATALOGO[nome], id);
    salvar();
  }

  function produto(id) { return catalogo('produtos').find(function (p) { return p.id === id; }); }

  function fonte(id) { return catalogo('fontes').find(function (f) { return f.id === id; }); }

  /* De onde o negócio veio, em texto, para quem só precisa ler. A fonte
     cadastrada manda; o texto solto antigo é o que sobra quando ela falta. */
  function origemDaOportunidade(op) {
    const f = op && op.fonteId && fonte(op.fonteId);
    return f ? f.nome : String((op && op.origem) || '');
  }

  /* ---------- Tarefas ---------- */
  /* ---------- auditoria das campanhas do Linked Helper ----------

     Quem respondeu NÃO não vira negócio, e por isso desaparecia: o lead saía
     da ponte e não sobrava registro nenhum de que a campanha tinha produzido
     aquela resposta. Vinte leads, seis recusas, e na semana seguinte a mesma
     campanha rodava igual porque ninguém tinha como saber.

     Fica fora do pipeline de propósito. Dentro dele, uma recusa é negócio
     zumbi; aqui é o que a campanha errou, que é a única coisa capaz de
     melhorar a próxima.

     A chave é o id do lead na ponte: a mesma recusa aparece em toda busca até
     o vendedor excluí-la, e sem isto a tabela contaria a mesma pessoa cinco
     vezes e a campanha pareceria pior do que é. */
  function registrarRecusa(dados) {
    const id = String(dados.leadId || '');
    if (id && (estado.recusas || []).some(function (r) { return r.leadId === id; })) return null;
    const nova = Object.assign({
      id: uid('rec'), leadId: id, campanha: '', sdr: '',
      nome: '', cargo: '', empresa: '', linkedin: '',
      texto: '', motivo: '', origem: 'regra', data: hoje(), criadoEm: hoje()
    }, carimbo(false), dados);
    estado.recusas = estado.recusas || [];
    estado.recusas.push(nova);
    salvar();
    return nova;
  }

  /* ---------- descartes ----------

     Excluir um lead apagava a entrega da ponte, e só. Funciona enquanto a
     entrega for única — mas o Linked Helper reentrega a mesma pessoa a cada
     nova mensagem, e a ponte carimba um id novo em cada entrega. O mesmo
     Gerson Ferreira volta com outro id, e o app, que só conhecia ids, não
     tem como saber que já foi descartado. Com centenas de leads isso deixa a
     tela de importação inutilizável.

     A chave é a pessoa, não a entrega: o perfil do LinkedIn quando existe,
     porque é o único identificador estável que o Linked Helper entrega; e
     nome+empresa achatados quando não existe. */
  function achatarTexto(t) {
    return String(t || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function chaveDoLead(lead) {
    const perfil = String(lead.linkedin || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '')
      .replace(/\?.*$/, '').replace(/\/+$/, '');
    const pessoa = perfil
      ? 'in:' + perfil
      : (achatarTexto(lead.nome) || achatarTexto(lead.empresa))
          ? 'p:' + achatarTexto(lead.nome) + '|' + achatarTexto(lead.empresa)
          : '';
    if (!pessoa) return '';
    /* A campanha entra na chave.

       Descartar é dizer "esta pessoa não serve para ISTO", não "esta pessoa
       não presta". O advogado que não interessa na campanha de condomínios
       pode ser exatamente o alvo da campanha de escritórios — e um descarte
       que valesse para sempre e para tudo apagaria esse lead sem ninguém
       perceber. Campanha vazia vira um balde próprio, o que é o certo: sem
       saber de qual campanha veio, não dá para saber onde o descarte vale. */
    return 'c:' + achatarTexto(lead.campanha) + '|' + pessoa;
  }

  /* Os descartes gravados antes de a campanha entrar na chave valiam para
     todas as campanhas. Reconstruir a chave com a campanha que ficou gravada
     no próprio registro os mantém valendo onde de fato foram feitos. */
  function migrarDescartesParaCampanha(dados) {
    (dados.descartes || []).forEach(function (d) {
      if (!d.chave || d.chave.indexOf('c:') === 0) return;
      d.chave = 'c:' + achatarTexto(d.campanha) + '|' + d.chave;
    });
  }

  function descartarLead(lead, porque) {
    const chave = chaveDoLead(lead);
    if (!chave) return null;
    estado.descartes = estado.descartes || [];
    if (estado.descartes.some(function (d) { return d.chave === chave; })) return null;
    const novo = Object.assign({
      id: uid('dsc'), chave: chave,
      nome: lead.nome || '', empresa: lead.empresa || '', cargo: lead.cargo || '',
      linkedin: lead.linkedin || '', campanha: lead.campanha || '', sdr: lead.sdr || '',
      porque: porque || 'Descartado na importação', data: hoje()
    }, carimbo(false));
    estado.descartes.push(novo);
    salvar();
    return novo;
  }

  function foiDescartado(lead) {
    const chave = chaveDoLead(lead);
    if (!chave) return false;
    return (estado.descartes || []).some(function (d) {
      return d.chave === chave && visivel(d);
    });
  }

  function descartes() {
    return (estado.descartes || []).filter(function (d) { return visivel(d); });
  }

  function desfazerDescarte(id) {
    estado.descartes = (estado.descartes || []).filter(function (d) { return d.id !== id; });
    salvar();
  }

  function recusas() {
    return (estado.recusas || []).filter(function (r) { return visivel(r); });
  }

  /* Agrupado por campanha porque é a campanha que se conserta, não a pessoa.
     Ordenado pela que mais produziu recusa: é por onde se começa. */
  function recusasPorCampanha() {
    const por = {};
    recusas().forEach(function (r) {
      const chave = r.campanha || '(sem campanha)';
      if (!por[chave]) por[chave] = { campanha: chave, itens: [], motivos: {}, sdrs: {} };
      por[chave].itens.push(r);
      por[chave].motivos[r.motivo || 'sem motivo'] = (por[chave].motivos[r.motivo || 'sem motivo'] || 0) + 1;
      if (r.sdr) por[chave].sdrs[r.sdr] = (por[chave].sdrs[r.sdr] || 0) + 1;
    });
    return Object.keys(por).map(function (k) {
      const g = por[k];
      g.itens.sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
      g.principal = Object.keys(g.motivos).sort(function (a, b) {
        return g.motivos[b] - g.motivos[a];
      })[0] || '';
      return g;
    }).sort(function (a, b) { return b.itens.length - a.itens.length; });
  }

  function excluirRecusa(id) {
    estado.recusas = (estado.recusas || []).filter(function (r) { return r.id !== id; });
    salvar();
  }

  function limparRecusas(campanha) {
    estado.recusas = (estado.recusas || []).filter(function (r) {
      if (!visivel(r)) return true;                    /* de outra empresa: não é minha para apagar */
      return campanha ? (r.campanha || '(sem campanha)') !== campanha : false;
    });
    salvar();
  }

  function criarTarefa(dados) {
    const nova = Object.assign({
      id: uid('tsk'), titulo: '', descricao: '', tipo: 'Reunião', oportunidadeId: null,
      contatoId: null, decisaoAlvo: '', vencimento: hoje(),
      /* A hora é opcional e existe porque agenda sem hora não é agenda: numa
         lista com trinta tarefas do mesmo dia, a ordem é a hora. */
      hora: '',
      status: 'aberta', concluidaEm: null, criadoEm: hoje(),
      origem: 'planejada', comRelato: false,
      /* Tarefa fechada em lote, sem contar o que aconteceu. Não é detalhe de
         auditoria: é dívida visível. Fechar move o funil e não move nenhuma
         das oito decisões, e sem esta marca a diferença some da tela. */
      semRegistro: false,
      adiamentos: 0
    }, carimbo(true), dados);
    estado.tarefas.push(nova);
    salvar();
    return nova;
  }

  function atualizarTarefa(id, mudancas) {
    const t = tarefa(id);
    if (!t) return null;
    Object.assign(t, mudancas || {});
    salvar();
    return t;
  }

  /* Adiar é um fato, não uma correção de digitação: a tarefa adiada quatro
     vezes é o sintoma que o vendedor não vê sozinho. Fica contado na tarefa e
     escrito no histórico do negócio. */
  function adiarTarefa(id, novaData, motivo) {
    const t = tarefa(id);
    if (!t || !novaData || novaData === t.vencimento) return null;
    const antes = t.vencimento;
    t.vencimento = novaData;
    t.adiamentos = (t.adiamentos || 0) + 1;
    if (t.oportunidadeId) {
      const op = oportunidade(t.oportunidadeId);
      if (op) {
        op.eventos.unshift({
          id: uid('evt'), tipo: 'sistema', data: hoje(),
          titulo: 'Tarefa adiada de ' + antes + ' para ' + novaData + ': ' + t.titulo +
            (motivo ? ' (' + motivo + ')' : '')
        });
      }
    }
    salvar();
    return t;
  }

  /* A data vem de fora porque a tarefa registrada depois aconteceu ontem, não
     hoje — e datar tudo como hoje faria o Evidence Age mentir. O canal entra
     no título do evento: é o que permite ler depois por onde a decisão andou. */
  function concluirTarefa(id, quando, comRelato, semRegistro) {
    const t = tarefa(id);
    if (!t) return null;
    t.status = 'concluida';
    t.concluidaEm = quando || hoje();
    if (comRelato) t.comRelato = true;
    t.semRegistro = !!semRegistro;
    if (t.oportunidadeId) {
      const op = oportunidade(t.oportunidadeId);
      if (op) {
        op.eventos.unshift({
          id: uid('evt'), tipo: 'activity', data: t.concluidaEm,
          titulo: (t.tipo ? t.tipo + ': ' : 'Tarefa concluída: ') + t.titulo,
          canal: t.tipo || '', dimensao: t.decisaoAlvo || ''
        });
      }
    }
    salvar();
    return t;
  }

  function excluirTarefa(id) {
    estado.tarefas = estado.tarefas.filter(function (t) { return t.id !== id; });
    registrarExclusao('tarefas', id);
    salvar();
  }

  /* Fechar o ciclo: o desfecho congela a foto da decisão no dia do fechamento.
     É essa foto que, somada a muitos negócios, valida ou derruba o modelo. */
  /* Perdido para concorrente virou perda; perdido por inação e adiado viraram
     desistência. O motivo antigo era texto livre e continua onde está — o que
     muda é só o tipo, para os relatórios pararem de contar três coisas que
     agora são duas. */
  function migrarDesfechos(dados) {
    const de = (global.IADPlaybook && global.IADPlaybook.DESFECHOS_RENOMEADOS) || {};
    (dados.oportunidades || []).forEach(function (op) {
      if (op.desfecho && de[op.desfecho.tipo]) {
        op.desfecho.tipoAntigo = op.desfecho.tipo;
        op.desfecho.tipo = de[op.desfecho.tipo];
      }
    });
  }

  /* ---------- nutrição ----------

     Conta que ainda não está pronta não é negócio encerrado: é negócio cedo
     demais. Encerrar seria a forma mais cara de esquecer dela — sai da
     previsão e sai da cabeça de todo mundo. Nutrição tira da previsão e
     mantém na agenda, com data para voltar a olhar.

     Não é desfecho: op.desfecho continua vazio. Uma evidência nova do cliente
     acorda o negócio sozinha, porque o cliente ter se movido é exatamente o
     sinal que a nutrição estava esperando. */
  function colocarEmNutricao(id, dados) {
    const op = oportunidade(id);
    if (!op) return null;
    op.nutricao = {
      desde: hoje(),
      motivo: dados.motivo || '',
      motivoTexto: dados.motivoTexto || '',
      revisarEm: dados.revisarEm || '',
      porQuem: (contexto().usuario || {}).id || null
    };
    op.proximoCompromisso = null;
    salvar();
    return op;
  }

  function retomarNutricao(id, porque) {
    const op = oportunidade(id);
    if (!op || !op.nutricao) return null;
    op.historicoNutricao = (op.historicoNutricao || []).concat([
      Object.assign({}, op.nutricao, { retomadaEm: hoje(), porque: porque || '' })
    ]);
    op.nutricao = null;
    salvar();
    return op;
  }

  function fecharOportunidade(id, dados) {
    const op = oportunidade(id);
    if (!op) return null;
    op.desfecho = {
      tipo: dados.tipo,
      data: dados.data || hoje(),
      motivo: dados.motivo || '',
      concorrente: dados.concorrente || '',
      motivoId: dados.motivoId || '',
      motivoRotulo: dados.motivoRotulo || '',
      valorFinal: dados.valorFinal != null ? dados.valorFinal : op.valor,
      iadFinal: dados.iadFinal,
      dimsFinal: Object.assign({}, op.dims),
      coverageFinal: dados.coverageFinal,
      evidenceAgeFinal: dados.evidenceAgeFinal,
      diasEmAberto: dados.diasEmAberto
    };
    if (dados.tipo === 'ganho') op.etapa = 'Venda';
    op.nutricao = null;   /* encerrar vence nutrição: são estados excludentes */
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

  /* ---------------- juntar duas negociações da mesma empresa ----------------

     Por que isto existe: a importação do Linked Helper abre uma negociação por
     empresa POR CAMPANHA, e duas campanhas tocando a mesma conta abriam dois
     cartões do mesmo negócio. O comentário de `oportunidadeJaExistente` já
     avisava do risco — "o índice partido ao meio" — e protegia só metade do
     caso. O resultado apareceu na carteira: a mesma Suzano com IAD 0 num
     cartão e IAD 16 no outro. Se é o mesmo negócio, um dos dois números é
     mentira, e o IAD existe exatamente para não mentir.

     Junta em vez de encerrar, e a diferença não é estética: encerrar a
     duplicata como desistência a contaria como negócio perdido, e a tela de
     Aprendizado — que existe para ensinar o que funciona — passaria a
     aprender com um erro de cadastro.

     O que se move e por quê:

       eventos, snapshots   a história do cliente é dele, não do cartão
       stakeholders         união, sem repetir
       itens                o que está sendo vendido é o mesmo
       dims                 o MAIOR dos dois, e só porque a evidência vem junto
       campos em branco     o que a que fica não tem, a outra empresta
       notas                emendadas, com separador, nunca sobrescritas
       tarefas e sinais     apontam para a que fica

     A nota fica no maior e não na soma nem na média: as duas notas descrevem a
     MESMA decisão dentro do cliente, vista por dois cartões. Se num deles
     Prioridade é 2 porque existe evidência que prova, essa evidência acabou de
     entrar aqui — a nota maior é a que a prova sustenta. Média rebaixaria uma
     decisão comprovada; soma inventaria decisão que não houve.

     O que NÃO se move, e é decisão: valor, previsão de fechamento e etapa
     ficam como estão na que sobrevive. São números que alguém escolheu, e
     mexer neles em silêncio durante uma operação de limpeza é o jeito
     conhecido de a previsão do mês mudar sem ninguém saber por quê. Se a
     que morre tinha itens, o total se recalcula sozinho a partir deles — e a
     tela avisa antes.

     Anexos ficam por conta de quem chama: eles moram no IndexedDB e não neste
     estado. Ver `App.juntarOportunidades`. */
  function podeJuntarOportunidades(ficaId, vaiId) {
    const fica = oportunidade(ficaId);
    const vai = oportunidade(vaiId);
    if (!fica || !vai) return 'Não achei uma das negociações.';
    if (fica.id === vai.id) return 'São a mesma negociação.';
    if (fica.contaId !== vai.contaId) {
      return 'As duas precisam ser da mesma empresa. Se a empresa é que está duplicada, ' +
        'junte as empresas primeiro em Configuração → Juntar empresas.';
    }
    if (fica.desfecho || vai.desfecho) {
      return 'Só junto negociações abertas. Reabra a encerrada antes, para não reescrever um desfecho.';
    }
    return '';
  }

  function juntarOportunidades(ficaId, vaiId) {
    const impedimento = podeJuntarOportunidades(ficaId, vaiId);
    if (impedimento) return { ok: false, erro: impedimento };

    const fica = oportunidade(ficaId);
    const vai = oportunidade(vaiId);
    const relatorio = { ok: true, eventos: 0, snapshots: 0, stakeholders: 0,
                        itens: 0, tarefas: 0, sinais: 0, dims: [], titulo: vai.titulo };

    /* Eventos: os dois históricos, em ordem de data, do mais novo para o mais
       velho — que é a ordem que a tela espera. Sem reordenar, a evidência de
       ontem apareceria no meio da de três meses atrás. */
    const eventos = (fica.eventos || []).concat(vai.eventos || []);
    relatorio.eventos = (vai.eventos || []).length;
    fica.eventos = eventos.sort(function (a, b) {
      return String(b.data || '').localeCompare(String(a.data || ''));
    });

    fica.snapshots = (fica.snapshots || []).concat(vai.snapshots || [])
      .sort(function (a, b) { return String(a.data || '').localeCompare(String(b.data || '')); });
    relatorio.snapshots = (vai.snapshots || []).length;

    const antesStake = semRepetir(fica.stakeholders).length;
    fica.stakeholders = semRepetir((fica.stakeholders || []).concat(vai.stakeholders || []));
    relatorio.stakeholders = fica.stakeholders.length - antesStake;

    if ((vai.itens || []).length) {
      fica.itens = (fica.itens || []).concat(vai.itens);
      relatorio.itens = vai.itens.length;
    }

    (global.IADPlaybook.DIMENSOES || []).forEach(function (d) {
      const a = fica.dims[d.id] || 0;
      const b = (vai.dims || {})[d.id] || 0;
      if (b > a) {
        fica.dims[d.id] = b;
        relatorio.dims.push({ id: d.id, nome: d.nome, de: a, para: b });
      }
    });

    completarEmBrancoNaOportunidade(fica, vai);

    const notaDaOutra = String(vai.notas || '').trim();
    if (notaDaOutra) {
      fica.notas = String(fica.notas || '').trim() +
        (String(fica.notas || '').trim() ? '\n\n' : '') +
        '--- de "' + (vai.titulo || 'negociação juntada') + '" ---\n' + notaDaOutra;
    }

    /* Compromisso: o mais recente dos dois. O antigo não some do histórico —
       ele está nos eventos —, mas o que a tela cobra é um só. */
    const cFica = fica.proximoCompromisso, cVai = vai.proximoCompromisso;
    if (cVai && cVai.data && (!cFica || !cFica.data || String(cVai.data) > String(cFica.data))) {
      fica.proximoCompromisso = cVai;
    }

    (estado.tarefas || []).forEach(function (t) {
      if (t.oportunidadeId === vai.id) { t.oportunidadeId = fica.id; relatorio.tarefas++; }
    });
    (estado.sinais || []).forEach(function (x) {
      if (x.oportunidadeId === vai.id) { x.oportunidadeId = fica.id; relatorio.sinais++; }
    });

    /* O registro de que isto aconteceu. Uma carteira em que negociações somem
       sem rastro é uma carteira em que ninguém confia, e daqui a seis meses a
       pergunta "onde foi parar aquele negócio da Suzano" precisa de resposta. */
    fica.eventos.unshift({
      id: uid('evt'), tipo: 'activity', data: hoje(), canal: 'CRM',
      titulo: 'Juntada com a negociação "' + (vai.titulo || vai.id) + '"',
      descricao: 'Eventos, contatos e tarefas daquela negociação passaram para esta. ' +
        (relatorio.dims.length
          ? 'Notas que subiram: ' + relatorio.dims.map(function (d) {
              return d.nome + ' ' + d.de + '→' + d.para;
            }).join(', ') + '.'
          : 'Nenhuma nota mudou.')
    });

    /* A que morre sai pelo caminho de sempre — mas as tarefas dela já foram
       repontadas acima, então `excluirOportunidade` não tem mais o que levar
       junto. A ordem importa: apagar antes de repontar levaria as tarefas. */
    excluirOportunidade(vai.id);
    salvar();
    return relatorio;
  }

  /* Só o que está vazio na que fica. O vendedor que escolheu a campanha, o SDR
     ou o produto não pode ver uma operação de limpeza desfazer isso. */
  function completarEmBrancoNaOportunidade(fica, vai) {
    ['campanha', 'sdr', 'sdrEmail', 'origem', 'fonteId', 'produto', 'concorrentes', 'dono']
      .forEach(function (campo) {
        if (!String(fica[campo] || '').trim() && String(vai[campo] || '').trim()) {
          fica[campo] = vai[campo];
        }
      });
    if (!fica.insight && vai.insight) fica.insight = vai.insight;
  }

  /* As empresas com mais de uma negociação aberta. Nem toda linha é erro —
     empresa grande tem dois negócios de verdade —, mas é aqui que a duplicata
     aparece, e a marca `suspeita` é a que separa as duas coisas: negociação
     sem valor, sem nota e sem evidência não é um segundo negócio, é um cartão
     que nasceu sozinho. */
  function contasComMaisDeUmNegocio() {
    const porConta = {};
    (estado.oportunidades || []).forEach(function (o) {
      if (o.desfecho || !o.contaId) return;
      if (!visivel(o, true)) return;
      (porConta[o.contaId] = porConta[o.contaId] || []).push(o);
    });

    return Object.keys(porConta).filter(function (id) { return porConta[id].length > 1; })
      .map(function (id) {
        const lista = porConta[id].slice().sort(function (a, b) {
          const ia = Object.keys(a.dims || {}).reduce(function (s, k) { return s + (a.dims[k] || 0); }, 0);
          const ib = Object.keys(b.dims || {}).reduce(function (s, k) { return s + (b.dims[k] || 0); }, 0);
          return ib - ia;
        });
        return {
          conta: conta(id),
          negociacoes: lista.map(function (o) {
            const iad = Object.keys(o.dims || {}).reduce(function (s, k) { return s + (o.dims[k] || 0); }, 0);
            const evidencias = (o.eventos || []).filter(function (e) { return e.tipo === 'decision'; }).length;
            return {
              op: o, iad: iad, evidencias: evidencias,
              suspeita: iad === 0 && !evidencias && !Number(o.valor) && !Number(o.valorMensal)
            };
          })
        };
      }).sort(function (a, b) {
        return String((a.conta || {}).nome || '').localeCompare(String((b.conta || {}).nome || ''));
      });
  }

  function excluirOportunidade(id) {
    estado.oportunidades = estado.oportunidades.filter(function (o) { return o.id !== id; });
    /* As tarefas do negócio saem junto, e cada uma precisa da própria ordem de
       apagar: o servidor não sabe que elas pertenciam a ele. */
    (estado.tarefas || []).forEach(function (t) {
      if (t.oportunidadeId === id) registrarExclusao('tarefas', t.id);
    });
    estado.tarefas = estado.tarefas.filter(function (t) { return t.oportunidadeId !== id; });
    registrarExclusao('oportunidades', id);
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
    guardarCopiaDeSeguranca, copiaDeSeguranca, restaurarCopiaDeSeguranca, descartarCopiaDeSeguranca,
    quandoMudar, semSincronizar, registrarExclusao, exclusoesPendentes, esquecerExclusoes,
    moverRegistros, esquecerEmpresa,
    conta, contato, oportunidade, tarefa, contatosDaConta, tarefasDaOportunidade,
    daquiADias, PRAZO_PADRAO_DE_FECHAMENTO,
    dados, contexto, tenantDeTrabalho, visivel, diagnostico,
    fonte, origemDaOportunidade,
    totaisDaOportunidade, totalDoItem, itensDaOportunidade,
    adicionarItem, atualizarItem, removerItem, definirPrazoContrato,
    criarConta, criarContato, criarOportunidade, atualizarOportunidade, vincularStakeholder,
    pontuar, registrarEvento, removerEvento, definirCompromisso, definirInsight,
    sinal, sinais, criarSinal, registrarSinalUnico, sinalExterno,
    sinaisDoContato, sinaisDaConta, sinaisDaOportunidade, excluirSinal, promoverSinal,
    minhasNotas, notasAbertas, nota, criarNota, atualizarNota, concluirNota, excluirNota,
    registrarRecusa, recusas, recusasPorCampanha, limparRecusas, excluirRecusa,
    descartarLead, foiDescartado, descartes, desfazerDescarte, chaveDoLead,
    criarTarefa, atualizarTarefa, adiarTarefa, concluirTarefa, excluirTarefa,
    adotarOrfaos, empresasFantasma, adotarFantasmas,
    catalogo, catalogoAtivos, nomesDoCatalogo, criarNoCatalogo, atualizarNoCatalogo,
    removerDoCatalogo, produto,
    fecharOportunidade, reabrirOportunidade, excluirOportunidade,
    juntarOportunidades, podeJuntarOportunidades, contasComMaisDeUmNegocio,
    colocarEmNutricao, retomarNutricao,
    exportar, importar, limpar
  };
})(window);
