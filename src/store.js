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

  function estadoVazio() {
    return {
      versao: VERSAO, tenants: [], usuarios: [],
      contas: [], contatos: [], oportunidades: [], tarefas: [],
      segmentos: [], tiposTarefa: [], produtos: [], config: { moeda: 'BRL' },
      /* Auditoria das campanhas do Linked Helper. Não é carteira: são as
         respostas que dizem NÃO, guardadas fora do pipeline de propósito.
         Dentro dele elas seriam negócio; aqui elas são o que a campanha
         produziu de errado, que é a única coisa capaz de melhorar a próxima. */
      recusas: []
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
    migrarParaCincoDegraus(dados);
    migrarDesfechos(dados);

    /* Multiempresa: o que já existia passa a pertencer a uma primeira empresa,
       criada aqui, para nada ficar órfão e invisível depois do login. */
    const temRegistros = dados.contas.length || dados.oportunidades.length;
    if (!dados.tenants.length && temRegistros) {
      dados.tenants.push({ id: uid('ten'), nome: 'Minha empresa', cnpj: '', ativo: true, criadoEm: hoje() });
    }
    const primeiro = dados.tenants[0] ? dados.tenants[0].id : null;
    ['contas', 'contatos', 'oportunidades', 'tarefas', 'segmentos', 'tiposTarefa', 'produtos', 'recusas']
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
    /* Tarefa nasce planejada (marquei para fazer) ou registrada (aconteceu e
       eu anotei depois). As duas concluídas contam igual no funil e não contam
       igual na metodologia: a primeira mostra disciplina de planejamento, a
       segunda mostra o vendedor correndo atrás do próprio histórico. */
    dados.tarefas.forEach(function (t) {
      if (!t.origem) t.origem = 'planejada';
      if (t.comRelato == null) t.comRelato = false;
      if (t.hora == null) t.hora = '';
      if (t.descricao == null) t.descricao = '';
      if (t.semRegistro == null) t.semRegistro = false;
      if (t.adiamentos == null) t.adiamentos = 0;
    });
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
        alert('O armazenamento do navegador encheu. Exporte um backup em Configuração → Backup e apague anexos antigos.');
      }
    }
    ouvintes.forEach(function (fn) { fn(estado); });
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

  function guardarCopiaDeSeguranca(porque) {
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
      return { em: c.em, porque: c.porque || '',
        contas: (c.estado.contas || []).length,
        oportunidades: (c.estado.oportunidades || []).length,
        tarefas: (c.estado.tarefas || []).length };
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

    ['contas', 'contatos', 'segmentos', 'tiposTarefa', 'produtos'].forEach(function (colecao) {
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
    const colecoes = ['contas', 'contatos', 'oportunidades', 'tarefas', 'segmentos', 'tiposTarefa', 'produtos'];

    const linhas = colecoes.map(function (nome) {
      const todos = estado[nome] || [];
      const comDono = ['contas', 'contatos', 'oportunidades', 'tarefas'].indexOf(nome) !== -1;
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
  function moverRegistros(deId, paraId) {
    if (!deId || !paraId || deId === paraId) return 0;
    const colecoes = ['contas', 'contatos', 'oportunidades', 'tarefas', 'segmentos', 'tiposTarefa', 'produtos'];
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
    const usada = ['contas', 'contatos', 'oportunidades', 'tarefas', 'segmentos', 'tiposTarefa', 'produtos']
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
      config: estado.config
    };
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
    ['contas', 'contatos', 'oportunidades', 'tarefas', 'segmentos', 'tiposTarefa', 'produtos', 'recusas']
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
      email: '', telefone: '', linkedin: '', influencia: 2, reportaA: null,
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
      campanha: '',
      sdr: '',
      sdrEmail: '',
      criadoEm: hoje(),
      fechamentoPrevisto: daquiADias(PRAZO_PADRAO_DE_FECHAMENTO),
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
    guardarCopiaDeSeguranca, copiaDeSeguranca, restaurarCopiaDeSeguranca, descartarCopiaDeSeguranca,
    moverRegistros, esquecerEmpresa,
    conta, contato, oportunidade, tarefa, contatosDaConta, tarefasDaOportunidade,
    daquiADias, PRAZO_PADRAO_DE_FECHAMENTO,
    dados, contexto, tenantDeTrabalho, visivel, diagnostico,
    criarConta, criarContato, criarOportunidade, atualizarOportunidade, vincularStakeholder,
    pontuar, registrarEvento, removerEvento, definirCompromisso, definirInsight,
    registrarRecusa, recusas, recusasPorCampanha, limparRecusas, excluirRecusa,
    criarTarefa, atualizarTarefa, adiarTarefa, concluirTarefa, excluirTarefa,
    adotarOrfaos,
    catalogo, catalogoAtivos, nomesDoCatalogo, criarNoCatalogo, atualizarNoCatalogo,
    removerDoCatalogo, produto,
    fecharOportunidade, reabrirOportunidade, excluirOportunidade,
    colocarEmNutricao, retomarNutricao,
    exportar, importar, limpar
  };
})(window);
