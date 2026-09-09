/* Telas. Cada função devolve HTML; as ações chamam window.App.*  */
(function (global) {
  'use strict';

  const P = global.IADPlaybook, Store = global.IADStore, E = global.IADEngine, U = global.IADUI;
  const esc = U.esc;

  /* ---------------- Acesso: login, primeiro acesso e confirmação ---------------- */
  let telaAcesso = 'login';
  let primeiraEmpresa = false;   /* nenhuma empresa no servidor: quem entra monta a casa */
  let pendente = null;      /* usuário no meio do primeiro acesso */
  let recadoAcesso = '';

  function definirPrimeiraEmpresa(sim) { primeiraEmpresa = !!sim; }

  function definirTelaAcesso(tela, usuario, recado) {
    telaAcesso = tela;
    if (usuario !== undefined) pendente = usuario;
    recadoAcesso = recado || '';
  }

  function acesso() {
    const A = global.IADAuth;
    const naNuvem = global.IADNuvem.mandaNoAcesso();
    const corpo = (naNuvem
      ? { login: telaLogin, cadastro: telaCadastroNuvem, confirme: telaConfirmeNuvem, empresa: telaEmpresaNuvem }
      : { login: telaLogin, cadastro: telaCadastro, codigo: telaCodigo, perfil: telaPerfil }
    )[telaAcesso] || telaLogin;

    return '<div class="acesso">' +
      painelAcesso() +
      '<div class="acesso-forma"><div class="cartao-acesso">' +
      '<div class="marca-acesso">IAD <span>CRM</span></div>' +
      '<p class="tiny muted lema-mobile" style="margin:0 0 18px">Gestão comercial orientada à decisão</p>' +
      (recadoAcesso ? '<div class="aviso" style="margin-bottom:14px">' + esc(recadoAcesso) + '</div>' : '') +
      corpo(A) +
      '</div></div></div>';
  }

  /* O painel escuro é a única chance de explicar o método antes de a pessoa
     usar. Listar características não explica: o que prende é a pergunta que o
     modelo responde e que nenhum CRM de funil responde. Some abaixo de 940px,
     onde viraria uma parede de texto antes do campo de senha. */
  function painelAcesso() {
    const decisoes = P.DIMENSOES.map(function (d) {
      return '<span class="chip">' + esc(d.nome) + '</span>';
    }).join('');

    const passos = [
      ['Oito decisões, não oito etapas',
       'Antes de comprar, o cliente toma oito decisões dentro da empresa dele. Elas são o negócio; a etapa do funil é só onde você anotou.'],
      ['De 0 a ' + P.IAD_MAXIMO,
       'Cada decisão vale de 0 a ' + P.NOTA_MAXIMA + ', e o que decide o degrau é de onde a informação veio: ' +
       P.NIVEIS_DA_ESCADA.map(function (n) { return n.n + ' ' + n.rotulo.toLowerCase(); }).join(', ') +
       '. A soma é o IAD. Com ' + P.IAD_MADURO + ' ou mais, decisão madura.'],
      ['Só o cliente move o índice',
       'Proposta enviada, follow-up feito, reunião marcada por você: nada disso conta. Conta o que ele fez — mandou o dado, apresentou ao financeiro, marcou a reunião interna.'],
      ['O app diz o que falta',
       'Cruzando IAD, tempo sem evidência, cobertura do grupo comprador e etapa, ele classifica cada negócio e aponta qual decisão provocar agora.']
    ];

    return '<div class="acesso-painel">' +
      '<div><div class="marca-acesso">IAD <span>CRM</span></div>' +
      '<p class="lema">O funil organiza. A decisão fecha.</p></div>' +

      '<p class="tese">Todo CRM sabe em que etapa o negócio está. ' +
      'Nenhum sabe se o cliente já decidiu — e é a decisão dele que fecha a venda, ou não.</p>' +

      '<div class="chips">' + decisoes + '</div>' +

      '<ul>' + passos.map(function (p, i) {
        return '<li><span class="num">' + (i + 1) + '</span>' +
          '<span><strong>' + esc(p[0]) + '</strong>' +
          '<span class="diz">' + esc(p[1]) + '</span></span></li>';
      }).join('') + '</ul>' +

      '<p class="fecho">Um pipeline de dois milhões com IAD médio 6 não é um pipeline de dois milhões. ' +
      'É a conta que ninguém fez.</p>' +
      '</div>';
  }

  function campo(id, rotulo, tipo, valor, extra) {
    /* Senha digitada às cegas é onde nasce o "não consigo entrar" que é só erro
       de digitação. O olho revela o que foi escrito, sem guardar nada. */
    if (tipo === 'password') {
      return '<label class="campo"><span>' + esc(rotulo) + '</span>' +
        '<span class="campo-senha">' +
        '<input id="' + id + '" type="password" value="' + esc(valor || '') + '"' + (extra || '') + '>' +
        '<button type="button" class="olho" onclick="App.verSenha(\'' + id + '\', this)"' +
        ' aria-label="Mostrar a senha" data-ajuda="Mostra ou esconde a senha digitada.">👁</button>' +
        '</span></label>';
    }
    return '<label class="campo"><span>' + esc(rotulo) + '</span>' +
      '<input id="' + id + '" type="' + (tipo || 'text') + '" value="' + esc(valor || '') + '"' +
      (extra || '') + '></label>';
  }

  function telaLogin() {
    const naNuvem = global.IADNuvem.mandaNoAcesso();
    return '<h2 style="margin-bottom:' + (naNuvem ? '6' : '14') + 'px">Entrar</h2>' +
      (naNuvem ? '<p class="tiny muted" style="margin-bottom:14px">Sua conta é verificada no servidor.</p>' : '') +
      campo('ac-login', naNuvem ? 'E-mail' : 'Login ou e-mail', 'text', '', ' autocomplete="username"') +
      campo('ac-senha', 'Senha', 'password', '', ' autocomplete="current-password" onkeydown="if(event.key===\'Enter\')App.entrar()"') +
      '<button class="btn alt" style="width:100%;margin-top:6px" onclick="App.entrar()">Entrar</button>' +
      '<p class="small muted" style="margin:16px 0 0">Primeiro acesso? ' +
      '<a href="#" onclick="event.preventDefault();App.telaAcesso(\'cadastro\')">Criar meu acesso</a></p>' +
      /* Quem foi convidado e perdeu o link cai aqui: a conta já existe, então
         um convite novo é recusado, e sem este caminho não haveria nenhum. */
      (naNuvem ? '<p class="small muted" style="margin:6px 0 0">' +
        '<a href="#" onclick="event.preventDefault();App.recuperarSenha()">Esqueci minha senha</a></p>' : '');
  }

  function telaCadastro() {
    return '<h2 style="margin-bottom:6px">Criar acesso</h2>' +
      '<p class="tiny muted" style="margin-bottom:14px">Depois disso confirmamos seu e-mail com um código.</p>' +
      campo('ac-nome', 'Seu nome', 'text') +
      campo('ac-email', 'E-mail', 'email', '', ' autocomplete="email"') +
      campo('ac-whatsapp', 'WhatsApp', 'text', '', ' placeholder="(00) 00000-0000"') +
      campo('ac-senha1', 'Senha', 'password', '', ' autocomplete="new-password"') +
      campo('ac-senha2', 'Repita a senha', 'password') +
      '<button class="btn alt" style="width:100%;margin-top:6px" onclick="App.criarAcesso()">Continuar</button>' +
      '<p class="small muted" style="margin:16px 0 0">' +
      '<a href="#" onclick="event.preventDefault();App.telaAcesso(\'login\')">Voltar para o login</a></p>';
  }

  /* ---------- primeiro acesso com servidor ----------
     Aqui não há código na tela: quem confirma o e-mail é o Supabase, pelo link
     que ele manda. O código de seis dígitos existia só porque, sem servidor,
     não havia como mandar e-mail nenhum. */
  function telaCadastroNuvem() {
    return '<h2 style="margin-bottom:6px">Criar acesso</h2>' +
      '<p class="tiny muted" style="margin-bottom:14px">Você vai receber um e-mail para confirmar.</p>' +
      campo('ac-nome', 'Seu nome', 'text') +
      campo('ac-email', 'E-mail', 'email', '', ' autocomplete="email"') +
      campo('ac-whatsapp', 'WhatsApp', 'text', '', ' placeholder="(00) 00000-0000"') +
      campo('ac-senha1', 'Senha', 'password', '', ' autocomplete="new-password"') +
      campo('ac-senha2', 'Repita a senha', 'password') +
      '<button class="btn alt" style="width:100%;margin-top:6px" onclick="App.criarAcesso()">Criar acesso</button>' +
      '<p class="small muted" style="margin:16px 0 0">' +
      '<a href="#" onclick="event.preventDefault();App.telaAcesso(\'login\')">Voltar para o login</a></p>';
  }

  function telaConfirmeNuvem() {
    return '<h2 style="margin-bottom:6px">Confirme seu e-mail</h2>' +
      '<p class="small muted">Enviamos um e-mail para <strong>' +
      esc((pendente && pendente.email) || '') + '</strong>. Abra e clique no link.</p>' +
      '<div class="aviso" style="margin:12px 0">Ao clicar, o navegador pode mostrar uma página de erro. ' +
      'A confirmação já aconteceu assim mesmo — o link tenta voltar para um endereço que não existe aqui.</div>' +
      '<button class="btn alt" style="width:100%" onclick="App.telaAcesso(\'login\')">Já confirmei, quero entrar</button>';
  }

  /* Duas telas diferentes, e a diferença importa: quem monta a casa cria a
     primeira empresa; quem chega depois não cria nada, espera ser ligado. Dar o
     formulário a todo mundo foi o que produziu empresas paralelas e carteiras
     divididas. */
  function telaEmpresaNuvem() {
    if (!primeiraEmpresa) {
      return '<h2 style="margin-bottom:6px">Falta ligar você a uma empresa</h2>' +
        '<p class="small muted" style="margin-bottom:14px">Sua conta existe e a senha está certa. ' +
        'O que falta é quem administra o sistema ligar você à empresa — sem isso não há carteira para mostrar.</p>' +
        '<div class="aviso" style="margin-bottom:14px">Avise quem administra e diga o e-mail que você usou. ' +
        'Leva um minuto do lado dele.</div>' +
        '<button class="btn alt" style="width:100%" onclick="App.tentarDeNovo()">Já me ligaram, tentar de novo</button>' +
        '<p class="small muted" style="margin:14px 0 0">' +
        '<a href="#" onclick="event.preventDefault();App.sair(true)">Sair</a></p>';
    }
    return '<h2 style="margin-bottom:6px">Sua empresa</h2>' +
      '<p class="tiny muted" style="margin-bottom:14px">Você é o primeiro a entrar, então cria a empresa e passa a administrá-la. ' +
      'Quem vier depois não cria: você liga cada pessoa à empresa dela.</p>' +
      campo('ac-empresa-nova', 'Nome da empresa', 'text') +
      campo('ac-cnpj', 'CNPJ', 'text') +
      '<button class="btn alt" style="width:100%;margin-top:6px" onclick="App.criarEmpresaAcesso()">Criar e entrar</button>' +
      '<p class="small muted" style="margin:14px 0 0">' +
      '<a href="#" onclick="event.preventDefault();App.sair(true)">Sair</a></p>';
  }

  function telaCodigo() {
    const codigo = pendente && pendente.codigo;
    return '<h2 style="margin-bottom:6px">Confirme seu e-mail</h2>' +
      '<p class="small muted">Enviamos um código de seis dígitos para <strong>' +
      esc((pendente && pendente.email) || '') + '</strong>.</p>' +
      (codigo
        ? '<div class="aviso" style="margin:12px 0"><strong>Modo local:</strong> este app roda sem servidor, ' +
          'então o e-mail não sai de verdade. Seu código é <span class="mono-destaque">' + esc(codigo) + '</span>.</div>'
        : '') +
      campo('ac-codigo', 'Código de seis dígitos', 'text', '', ' inputmode="numeric" maxlength="6" onkeydown="if(event.key===\'Enter\')App.confirmarCodigo()"') +
      '<button class="btn alt" style="width:100%;margin-top:6px" onclick="App.confirmarCodigo()">Confirmar</button>' +
      '<p class="small muted" style="margin:14px 0 0">' +
      '<a href="#" onclick="event.preventDefault();App.reenviarCodigo()">Gerar outro código</a> · ' +
      '<a href="#" onclick="event.preventDefault();App.telaAcesso(\'login\')">Voltar</a></p>';
  }

  function telaPerfil(A) {
    const empresas = A.tenants();
    return '<h2 style="margin-bottom:6px">Complete seu cadastro</h2>' +
      '<p class="tiny muted" style="margin-bottom:14px">Você vai enxergar as oportunidades da sua empresa.</p>' +
      (empresas.length
        ? '<label class="campo"><span>Empresa</span><select id="ac-empresa">' +
          '<option value="">— cadastrar nova abaixo —</option>' +
          empresas.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.nome) + '</option>'; }).join('') +
          '</select></label>'
        : '') +
      campo('ac-empresa-nova', 'Nome da empresa', 'text') +
      campo('ac-cnpj', 'CNPJ da empresa', 'text') +
      campo('ac-nome2', 'Seu nome', 'text', (pendente && pendente.nome) || '') +
      campo('ac-whats2', 'WhatsApp', 'text', (pendente && pendente.whatsapp) || '') +
      '<button class="btn alt" style="width:100%;margin-top:6px" onclick="App.completarPerfil()">Concluir e entrar</button>';
  }

  /* Barra do administrador: o único que escolhe empresa e usuário. */
  /* ---------------- Menu da conta ----------------

     "Trocar de empresa" e "trocar de usuário" são duas coisas de naturezas
     diferentes neste app, e o menu diz qual é qual em vez de fingir que são a
     mesma:

     · empresa — quem é administrador escolhe qual empresa está enxergando, e
       a escolha vale para o app inteiro: o que ele criar a partir dali nasce
       nela. Para quem não é, a empresa é uma só, porque o cadastro da pessoa
       pertence a uma empresa. Dizer isso é melhor do que oferecer uma lista
       com um item;

     · usuário — trocar de pessoa é trocar de conta, e conta se troca entrando
       com ela. Não existe "virar outro vendedor" com um clique: o dono de
       cada registro é quem está logado, e um app que deixasse alternar sem
       senha estaria dizendo que a senha não importa. */
  function menuDoUsuario() {
    const A = global.IADAuth;
    const u = A.atual();
    if (!u) return '';

    const naNuvem = global.IADNuvem.mandaNoAcesso();
    const papel = { admin: 'Administrador', gestor: 'Gestor' }[u.papel] || 'Vendedor';
    const iniciais = iniciaisDe(u.nome || u.login || u.email || '?');

    /* Empresa ativa: para o administrador é escolha; para o resto é fato. */
    let bloco;
    if (A.ehAdmin()) {
      const f = A.filtros();
      const empresas = A.tenants();
      bloco = '<div class="menu-secao"><span>Empresa que estou vendo</span></div>' +
        '<div class="menu-lista">' +
        [{ id: 'todas', nome: 'Todas as empresas' }].concat(empresas).map(function (t) {
          const ativa = f.tenant === t.id;
          return '<button class="menu-item' + (ativa ? ' ativo' : '') + '"' +
            ' onclick="App.trocarEmpresa(\'' + esc(t.id) + '\')">' +
            '<span class="marca-ativa">' + (ativa ? '✓' : '') + '</span>' + esc(t.nome) + '</button>';
        }).join('') + '</div>' +
        '<p class="menu-nota">O que você cadastrar passa a pertencer à empresa escolhida. Com “Todas”, nasce na primeira da lista.</p>';
    } else {
      const t = A.tenant(u.tenantId);
      bloco = '<div class="menu-secao"><span>Empresa</span></div>' +
        '<div class="menu-empresa"><strong>' + esc((t && t.nome) || 'Sem empresa') + '</strong></div>' +
        '<p class="menu-nota">Sua conta pertence a esta empresa. Para trabalhar em outra, entre com a conta dela — é o botão abaixo.</p>';
    }

    return '<div class="menu-topo">' +
      '<span class="avatar grande">' + esc(iniciais) + '</span>' +
      '<div><strong>' + esc(u.nome || u.login) + '</strong>' +
      '<span class="tiny muted">' + esc(u.email || u.login || '') + '</span>' +
      '<span class="pill tiny">' + esc(papel) + '</span></div></div>' +

      bloco +

      '<div class="menu-secao"><span>Conta</span></div>' +
      '<button class="menu-item" onclick="App.trocarDeConta()">' +
      '<span class="marca-ativa">⇄</span>Trocar de conta</button>' +
      (naNuvem
        ? '<button class="menu-item" onclick="App.trocarSenha()">' +
          '<span class="marca-ativa">🔑</span>Trocar minha senha</button>'
        : '') +
      '<button class="menu-item" onclick="App.irDoMenu(\'#/dados\')">' +
      '<span class="marca-ativa">⚙</span>Configuração</button>' +
      '<button class="menu-item saida" onclick="App.sair()">' +
      '<span class="marca-ativa">⏻</span>Sair</button>';
  }

  function barraAdmin() {
    const A = global.IADAuth;
    if (!A.ehAdmin()) return '';
    /* No Pipeline o filtro por pessoa já está dentro da barra de filtros, com
       o resto. Repeti-lo aqui em cima daria dois controles para a mesma
       pergunta, e mudar um sem mudar o outro é como se inventa contradição. */
    if ((location.hash || '') === '#/pipeline') return '';
    const f = A.filtros();
    const empresas = A.tenants();
    const pessoas = A.usuarios().filter(function (u) {
      return u.papel !== 'admin' && (f.tenant === 'todas' || u.tenantId === f.tenant);
    });

    /* A empresa saiu daqui: ela é escopo, não filtro de tela, e passou a viver
       no menu da conta, que é onde a pessoa olha para saber onde está. Ter os
       dois seria o mesmo problema de sempre — duas portas para o mesmo estado,
       e uma delas sempre esquecida. */
    return '<div class="barra-admin">' +
      '<span class="etiqueta">Administrador</span>' +
      '<span class="tiny">' + esc(f.tenant === 'todas' ? 'Todas as empresas'
        : ((A.tenant(f.tenant) || {}).nome || 'Empresa')) + '</span>' +
      '<label>Usuário<select onchange="App.filtrarUsuarioAdmin(this.value)">' +
        '<option value="todos"' + (f.usuario === 'todos' ? ' selected' : '') + '>Todos os usuários</option>' +
        pessoas.map(function (u) {
          return '<option value="' + esc(u.id) + '"' + (f.usuario === u.id ? ' selected' : '') + '>' + esc(u.nome || u.email || u.login) + '</option>';
        }).join('') + '</select></label>' +
      '</div>';
  }

  /* ---------------- Hoje: a tela do vendedor ---------------- */
  const URGENCIAS = [
    { chave: 3, rotulo: 'Urgente', classe: 'dead', cor: 'var(--dead)' },
    { chave: 2, rotulo: 'Prioridade', classe: 'warn', cor: 'var(--risk)' },
    { chave: 'resto', rotulo: 'Em dia', classe: 'ok', cor: 'var(--ok)' }
  ];
  let filtroHoje = 'todos';

  function hoje() {
    const est = Store.dados();
    if (!est.oportunidades.length) return boasVindas();

    const G = global.IADGraficos;
    const foco = E.focoDoDia(est.oportunidades, est.tarefas);
    if (!foco.itens.length) {
      return '<h1>Hoje</h1><div class="card"><div class="vazio">Nenhum negócio aberto. Toda a carteira está encerrada.</div></div>';
    }

    const balde = function (i) { return i.urgencia >= 3 ? 3 : (i.urgencia === 2 ? 2 : 'resto'); };
    const grupos = URGENCIAS.map(function (u) {
      const itens = foco.itens.filter(function (i) { return balde(i) === u.chave; });
      return Object.assign({}, u, {
        qtd: itens.length,
        valor: itens.reduce(function (s, i) { return s + (i.resumo.op.valor || 0); }, 0)
      });
    });

    const cartoesResumo = grupos.map(function (g) {
      const ativo = String(filtroHoje) === String(g.chave);
      return '<button class="tile ' + g.classe + (ativo ? ' ativo' : '') + '" onclick="App.filtrarHoje(\'' + g.chave + '\')">' +
        '<span class="qtd">' + g.qtd + '</span>' +
        '<span class="rot">' + esc(g.rotulo) + '</span>' +
        '<span class="val">' + U.compacto(g.valor) + '</span></button>';
    }).join('');

    const visiveis = foco.itens.filter(function (i) {
      return filtroHoje === 'todos' || String(balde(i)) === String(filtroHoje);
    });

    const itens = visiveis.slice(0, 15).map(cartaoFoco).join('') ||
      '<div class="vazio">Nada neste filtro.</div>';

    return '<div class="row"><h1>Hoje</h1><span class="espaco"></span>' +
      '<button class="btn alt mini" onclick="App.capturaRapida()" data-ajuda-titulo="Nova tarefa" data-ajuda="Acabei de falar com um cliente. A tarefa é a evidência: escolha o negócio, o canal, e conte o que aconteceu — o assistente separa o que o CLIENTE fez e relê as oito decisões.">+ Tarefa</button>' +
      '<button class="btn ghost mini" onclick="location.hash=\'#/playbook\'" aria-label="O método"' +
      ' data-ajuda-titulo="O método" data-ajuda="Como uma tarefa vira avanço, o que conta como evidência em cada uma das oito decisões, e o que fazer em cada canal.">?</button></div>' +
      '<p class="muted small">' + (grupos[0].qtd
        ? grupos[0].qtd + ' negócio(s) precisam de você agora · ' + U.compacto(grupos[0].valor) + ' envolvidos'
        : 'Nada urgente hoje.') + '</p>' +
      '<div class="tiles">' + cartoesResumo +
        '<button class="tile todos' + (filtroHoje === 'todos' ? ' ativo' : '') + '" onclick="App.filtrarHoje(\'todos\')">' +
        '<span class="qtd">' + foco.itens.length + '</span><span class="rot">Todos</span>' +
        '<span class="val">' + U.compacto(foco.itens.reduce(function (s, i) { return s + (i.resumo.op.valor || 0); }, 0)) + '</span></button>' +
      '</div>' +
      '<div class="card" style="padding:14px 16px">' +
        G.composicao(grupos.filter(function (g) { return g.valor > 0; }).map(function (g) {
          return { rotulo: g.rotulo, valor: g.valor, cor: g.cor };
        })) + '</div>' +
      '<div class="lista-foco">' + itens + '</div>';
  }

  function cartaoFoco(i) {
    const r = i.resumo;
    const rotulos = ['', 'Atenção', 'Prioridade', 'Urgente'];
    const classes = ['', '', 'warn', 'dead'];
    const tarefas = (i.tarefas || []).slice(0, 3).map(function (t) {
      const atrasada = t.vencimento < Store.hoje();
      return '<div class="tarefa-linha"><button class="quadro" onclick="event.stopPropagation();App.concluirTarefa(\'' + t.id + '\')" title="Concluir"></button>' +
        '<span class="small">' + esc(t.titulo) + '</span>' +
        '<span class="espaco"></span><span class="tiny ' + (atrasada ? 'atrasado' : 'muted') + '">' + U.data(t.vencimento) + '</span></div>';
    }).join('');

    const falta = r.lacunas.length
      ? r.lacunas.slice(0, 3).map(function (l) { return esc(l.titulo); }).join(' · ') +
        (r.lacunas.length > 3 ? ' · +' + (r.lacunas.length - 3) : '')
      : 'nada — resta formalizar';

    return '<div class="foco u' + i.urgencia + '">' +
      '<div class="row"><strong>' + esc(r.op.titulo) + '</strong><span class="espaco"></span>' +
      (i.urgencia ? '<span class="pill ' + classes[i.urgencia] + '">' + rotulos[i.urgencia] + '</span>' : '') +
      '<span class="pill navy">' + U.compacto(r.op.valor) + '</span></div>' +
      '<div class="small muted">' + esc((r.conta && r.conta.nome) || '') + ' · ' + esc(r.op.etapa) + '</div>' +

      '<div class="linha-avanco">' + tiraDecisao(r.op) +
        '<span class="iad">' + r.iad + '<span class="de">/' + P.IAD_MAXIMO + '</span></span>' +
        '<span class="espaco"></span>' +
        '<span class="pill ' + r.faixa.classe + '">' + r.evidenceAge + 'd</span>' +
        '<span class="pill">grupo ' + r.coverage.percentual + '%</span>' +
      '</div>' +

      '<div class="motivo"><strong>' + esc(i.motivo) + '</strong><br><span class="muted">' + esc(i.acao) + '</span></div>' +
      '<div class="tiny muted" style="margin-top:6px">Falta: ' + falta + '</div>' +
      (tarefas ? '<div class="tarefas">' + tarefas + '</div>' : '') +
      '<div class="row" style="margin-top:10px">' +
      '<button class="btn alt mini" onclick="App.novaTarefa(\'' + r.op.id + '\',\'\',{situacao:\'feita\'})" data-ajuda-titulo="Nova tarefa" data-ajuda="O que aconteceu com este cliente nesta semana. Se nada mudou do lado dele, não houve avanço — e é isso que a revisão quer expor.">+ Tarefa</button>' +
      '<button class="btn ghost mini" onclick="App.abrir(\'' + r.op.id + '\')">Abrir</button></div></div>';
  }

  /* ---------------- Painel executivo ---------------- */
  let filtroPeriodo = 'todos';
  let filtroSegmento = 'todos';

  function painel() {
    const est = Store.dados();
    if (!est.oportunidades.length) return boasVindas();

    const G = global.IADGraficos;
    const abertas = est.oportunidades.filter(function (o) { return !o.desfecho; });
    const meses = E.mesesDisponiveis(est.oportunidades);
    const segmentos = E.segmentosDisponiveis(est.oportunidades);

    /* Se o filtro apontar para um mês que sumiu, volta para tudo. */
    if (filtroPeriodo !== 'todos' && meses.indexOf(filtroPeriodo) === -1) filtroPeriodo = 'todos';
    if (filtroSegmento !== 'todos' && segmentos.indexOf(filtroSegmento) === -1) filtroSegmento = 'todos';

    const selecionadas = E.filtrar(abertas, { periodo: filtroPeriodo, segmento: filtroSegmento });
    const c = E.carteira(selecionadas);
    const resumos = c.resumos;

    const filtros =
      '<div class="filtros">' +
        '<div class="grupo-filtro"><span class="rot">Período</span>' +
          pill('todos', filtroPeriodo, 'App.filtrarPeriodo', 'Todos', 'Sem recorte de mês: o painel inteiro considera toda a carteira aberta.') +
          meses.map(function (m) { return pill(m, filtroPeriodo, 'App.filtrarPeriodo', E.rotuloMes(m),
            'Recorta o painel inteiro pelos negócios com fechamento previsto para ' + E.rotuloMes(m) + '.'); }).join('') +
        '</div>' +
        '<div class="grupo-filtro"><span class="rot">Segmento</span>' +
          pill('todos', filtroSegmento, 'App.filtrarSegmento', 'Todos', 'Sem recorte de segmento: todos os mercados juntos.') +
          segmentos.map(function (seg) { return pill(seg, filtroSegmento, 'App.filtrarSegmento', seg,
            'Recorta o painel inteiro pelas empresas do segmento ' + seg + '.'); }).join('') +
        '</div>' +
      '</div>';

    if (!resumos.length) {
      return '<h1>Painel de decisão</h1>' + filtros +
        '<div class="card"><div class="vazio">Nenhuma oportunidade aberta neste recorte.</div></div>';
    }

    const composicao = G.composicao([
      { rotulo: 'Saudável', valor: c.saudavel, cor: G.CORES_SAUDE.saudavel },
      { rotulo: 'Em risco', valor: c.emRisco, cor: G.CORES_SAUDE.risco },
      { rotulo: 'Zumbi', valor: c.zumbi, cor: G.CORES_SAUDE.zumbi }
    ]);

    const porMes = E.porMes(resumos);
    const porEtapa = E.porEtapa(resumos).map(function (e) {
      return { rotulo: e.etapa, valor: e.valor, saudavel: e.saudavel, risco: e.valor - e.saudavel, zumbi: 0,
               nota: e.qtd + ' neg. · IAD médio ' + U.numero(e.iadMedio, 1) };
    });
    const porSegmento = E.porSegmento(resumos).map(function (seg) {
      return { rotulo: seg.segmento, valor: seg.valor, saudavel: seg.saudavel, risco: seg.risco, zumbi: seg.zumbi,
               nota: seg.qtd + ' neg. · IAD médio ' + U.numero(seg.iadMedio, 1) };
    });
    const travas = c.travas.slice(0, 8).map(function (t) {
      return { rotulo: t.nome, valor: t.valor, nota: t.qtd + ' negócio(s)' };
    });
    const evidencia = E.distribuicaoEvidencia(resumos);

    const kpi = function (rot, val, obs, classe) {
      return '<div class="kpi ' + (classe || '') + '"><div class="rot">' + esc(rot) + '</div><div class="val">' + val + '</div>' +
        '<div class="obs">' + esc(obs || '') + '</div></div>';
    };

    return '<div class="row"><h1>Painel de decisão</h1><span class="espaco"></span>' +
      '<span class="tiny muted">' + (filtroPeriodo === 'todos' ? 'todos os meses' : E.rotuloMes(filtroPeriodo)) +
      ' · ' + (filtroSegmento === 'todos' ? 'todos os segmentos' : esc(filtroSegmento)) + '</span></div>' +
      filtros +

      '<div class="grid k4">' +
        kpi('Pipeline aberto', U.compacto(c.total), c.qtd + ' oportunidades') +
        kpi('Saudável', U.compacto(c.saudavel), 'decisão madura e em movimento', 'bom') +
        kpi('Em risco', U.compacto(c.emRisco), 'decisão imatura para a etapa', 'atencao') +
        kpi('Zumbi', U.compacto(c.zumbi), 'sem evidência há +30 dias', 'ruim') +
      '</div>' +
      '<div class="card"><h2>Composição do pipeline</h2>' + composicao +
        '<div class="grid k4" style="margin-top:14px">' +
          kpi('IAD médio', U.numero(c.iadMedio, 1) + '<span class="small muted">/' + P.IAD_MAXIMO + '</span>', 'maturidade da decisão') +
          kpi('Evidence Age médio', U.numero(c.evidenceAgeMedio, 1) + '<span class="small muted">d</span>', 'sem movimento do cliente') +
          kpi('Coverage', Math.round(c.coverageMedio) + '%', 'papéis críticos cobertos') +
          kpi('Prontidão', Math.round(c.prontidaoMedia) + '%', 'para emitir proposta') +
        '</div></div>' +

      '<div class="card"><h2>Como estão os negócios por mês</h2>' +
        '<p class="tiny muted">Por mês de fechamento previsto. Toque em um mês para filtrar o painel inteiro.</p>' +
        G.colunasPorMes(porMes, 'App.filtrarPeriodo') + '</div>' +

      '<div class="grid k2">' +
        '<div class="card"><h2>Por etapa do funil</h2>' +
          '<p class="tiny muted">O comprimento é o dinheiro; a cor diz quanto dele tem decisão madura.</p>' +
          G.barrasHorizontais(porEtapa, { descricao: 'Valor por etapa, separado por saúde da decisão' }) + '</div>' +
        '<div class="card"><h2>Por segmento</h2>' +
          '<p class="tiny muted">Onde a carteira está concentrada e com que qualidade.</p>' +
          G.barrasHorizontais(porSegmento, { descricao: 'Valor por segmento, separado por saúde da decisão' }) + '</div>' +
      '</div>' +

      '<div class="card"><h2>Cada oportunidade e suas 8 decisões</h2>' +
        '<p class="tiny muted">Uma linha por negócio, do maior valor para o menor. Toque para abrir.</p>' +
        G.matriz(E.matrizDecisoes(resumos, 14), P.DIMENSOES) + '</div>' +

      '<div class="grid k2">' +
        '<div class="card"><h2>O que está travando a receita</h2>' +
          '<p class="tiny muted">Valor que só anda quando esta decisão acontecer dentro do cliente.</p>' +
          G.barrasHorizontais(travas, { semLegenda: true, descricao: 'Valor parado por decisão pendente' }) + '</div>' +
        '<div class="card"><h2>Tempo sem evidência do cliente</h2>' +
          '<p class="tiny muted">Quanto do pipeline está parado, e há quanto tempo.</p>' +
          G.composicao(evidencia.map(function (f) {
            return { rotulo: f.rotulo + ' (' + f.qtd + ')', valor: f.valor,
                     cor: { ok: 'var(--ok)', warn: 'var(--warn)', risk: 'var(--risk)', dead: 'var(--dead)' }[f.classe] };
          })) + '</div>' +
      '</div>' +

      riscosCriticos(resumos) +
      evolucaoDaCarteira() +
      aprendizado();
  }

  function pill(valor, atual, acao, rotulo, ajuda) {
    return '<button class="pill' + (String(valor) === String(atual) ? ' orange' : '') + '" onclick="' + acao + '(\'' +
      String(valor).replace(/'/g, "\\'") + '\')"' + (ajuda ? ' data-ajuda="' + esc(ajuda) + '"' : '') +
      '>' + esc(rotulo) + '</button>';
  }

  function riscosCriticos(resumos) {
    const criticos = resumos
      .map(function (r) { return { r: r, altos: r.alertas.filter(function (a) { return a.nivel === 'alto'; }) }; })
      .filter(function (x) { return x.altos.length; })
      .sort(function (a, b) { return (b.r.op.valor || 0) - (a.r.op.valor || 0); })
      .slice(0, 6)
      .map(function (x) {
        return '<button class="item g-' + x.r.classe.id + '" onclick="App.abrir(\'' + x.r.op.id + '\')">' +
          '<div class="row"><span class="tit">' + esc(x.r.op.titulo) + '</span><span class="espaco"></span>' +
          '<span class="pill navy">' + U.compacto(x.r.op.valor) + '</span></div>' +
          '<div class="small muted">' + esc((x.r.conta && x.r.conta.nome) || '') + ' · ' + esc(x.r.op.etapa) + '</div>' +
          '<div class="row" style="margin-top:7px;gap:8px">' + tiraDecisao(x.r.op) + '<span class="tiny muted">' + x.r.iad + '/' + P.IAD_MAXIMO + '</span></div>' +
          '<div class="small" style="margin-top:6px">⚠ ' + esc(x.altos[0].texto) + '</div></button>';
      }).join('');

    if (!criticos) return '';
    return '<div class="sec-titulo"><h2>Riscos críticos</h2><span class="tiny muted">maior valor primeiro</span></div>' +
      '<div class="lista">' + criticos + '</div>';
  }

  /* ---------------- Plano de desenvolvimento constante ----------------

     O aprendizado antigo respondia uma pergunta só: o que separou os negócios
     ganhos dos perdidos. Boa pergunta, e lenta — precisa de negócio fechado, e
     quem está começando não tem nenhum. Enquanto isso a carteira ensina toda
     semana, e ninguém estava lendo.

     Este bloco lê. Semana a semana, sempre contra a semana anterior, porque
     um número sozinho não ensina: "ticket médio de R$ 42 mil" só quer dizer
     alguma coisa ao lado dos R$ 51 mil da semana passada. */

  let semanasDoAprendizado = 8;

  /* O glifo diz para onde o número foi; a cor diz se isso é bom. Separar os
     dois é obrigatório aqui: ciclo de vendas caindo é uma seta para BAIXO em
     verde, e uma seta verde para cima nesse caso seria mentira em cima de
     mentira — a pessoa leria "o ciclo aumentou, que bom". */
  function setaDe(v) {
    if (v.direcao === 'igual') return '<span class="tend igual">=</span>';
    if (v.direcao === 'sem-base') return '<span class="tend muted">—</span>';
    const glifo = v.delta > 0 ? '▲' : '▼';
    const cor = v.direcao === 'melhorou' ? 'subiu' : 'caiu';
    const titulo = (v.delta > 0 ? 'subiu' : 'caiu') +
      (v.direcao === 'melhorou' ? ', e para este indicador isso é melhora' : ', e para este indicador isso é piora');
    return '<span class="tend ' + cor + '" title="' + titulo + '">' + glifo + '</span>';
  }

  function valorDoIndicador(ind, v) {
    if (v == null) return '—';
    if (ind.unidade === '%') return Math.round(v * 100) + '%';
    if (ind.unidade === 'R$') return U.compacto(v);
    if (ind.unidade === 'd') return U.numero(v, 0) + 'd';
    return U.numero(v, ind.id === 'pontos' ? 0 : 0);
  }

  /* A faixa de destaque: os três que o usuário pediu pelo nome, mais o número
     que fecha o ciclo (pontos de decisão). Cada um com o valor da última semana
     fechada e a comparação com a anterior. */
  function destaquesDoAprendizado(ev) {
    const escolhidos = ['pontos', 'ticket', 'ciclo', 'parado'];
    return '<div class="grid k4">' + escolhidos.map(function (id) {
      const ind = ev.indicadores.filter(function (i) { return i.id === id; })[0];
      if (!ind) return '';
      const v = ind.variacao;
      const antes = ind.antes == null ? '' :
        'semana anterior: ' + valorDoIndicador(ind, ind.antes);
      return '<div class="kpi"><div class="rot">' + esc(ind.nome) + '</div>' +
        '<div class="val">' + valorDoIndicador(ind, ind.agora) + ' ' + setaDe(v) + '</div>' +
        '<div class="obs">' + (antes || 'sem base de comparação ainda') + '</div></div>';
    }).join('') + '</div>';
  }

  function tabelaDaEvolucao(ev) {
    const cabecalho = ev.semanas.map(function (sem, i) {
      const corrente = i === ev.semanas.length - 1;
      return '<th class="right' + (corrente ? ' semana-corrente' : '') + '">' + esc(sem.rotulo) +
        (corrente ? '<span class="tiny muted"> em curso</span>' : '') + '</th>';
    }).join('');

    const linhas = ev.indicadores.map(function (ind) {
      const celulas = ind.serie.map(function (v, i) {
        const corrente = i === ev.semanas.length - 1;
        return '<td class="right' + (corrente ? ' semana-corrente' : '') + '">' +
          valorDoIndicador(ind, v) + '</td>';
      }).join('');
      return '<tr><td><strong>' + esc(ind.nome) + '</strong>' +
        '<span class="tiny muted">' + esc(ind.oQue) + '</span></td>' +
        celulas + '<td class="right">' + setaDe(ind.variacao) + '</td></tr>';
    }).join('');

    return '<div class="tabela-rolagem"><table class="tabela-evolucao"><thead><tr>' +
      '<th>Indicador</th>' + cabecalho + '<th class="right">Tend.</th>' +
      '</tr></thead><tbody>' + linhas + '</tbody></table></div>' +
      '<p class="tiny muted" style="margin-top:8px">A seta compara as duas últimas semanas <strong>fechadas</strong>. ' +
      'A semana em curso fica de fora da comparação — meia semana sempre parece queda.</p>';
  }

  /* A tabela que responde a pergunta central do sistema: executar move decisão?
     E qual execução move? Trinta e-mails que renderam zero ponto e duas visitas
     que renderam seis é a informação que muda a semana seguinte. */
  function rendimentoDasTarefas(ev) {
    const r = ev.rendimento;
    if (!r.linhas.length) {
      return '<div class="card" style="margin-top:12px"><h3>O que cada tipo de tarefa rendeu</h3>' +
        '<div class="vazio small">Nenhuma tarefa concluída nas últimas ' + semanasDoAprendizado +
        ' semanas. Esta tabela é o elo entre execução e decisão: sem tarefa fechada, não há o que ligar.</div></div>';
    }
    const linhas = r.linhas.map(function (l) {
      const seco = l.pontos === 0 && l.feitas >= 3;
      return '<tr' + (seco ? ' class="linha-seca"' : '') + '><td><strong>' + esc(l.tipo) + '</strong></td>' +
        '<td class="right">' + l.feitas + '</td>' +
        '<td class="right">' + (l.feitas ? Math.round((l.comRelato / l.feitas) * 100) : 0) + '%</td>' +
        '<td class="right' + (l.pontos ? ' subiu' : '') + '">' + (l.pontos ? '+' + l.pontos : '0') + '</td>' +
        '<td class="right">' + U.numero(l.porTarefa, 2) + '</td></tr>';
    }).join('');

    return '<div class="card" style="margin-top:12px"><h3>O que cada tipo de tarefa rendeu</h3>' +
      '<p class="tiny muted">Últimas ' + semanasDoAprendizado + ' semanas. Pontos de decisão que subiram ' +
      'nos negócios daquelas tarefas — é o que separa execução que move de execução que só ocupa a agenda.</p>' +
      '<div class="tabela-rolagem"><table><thead><tr><th>Tipo</th><th class="right">Feitas</th>' +
      '<th class="right">Com relato</th><th class="right">Pontos</th><th class="right">Por tarefa</th>' +
      '</tr></thead><tbody>' + linhas + '</tbody></table></div>' +
      (r.estimado
        ? '<p class="tiny muted" style="margin-top:8px">Parte da atribuição é estimada: tarefas concluídas antes ' +
          'desta versão não carimbavam qual delas moveu a nota, então elas casam pela data. As novas são exatas.</p>'
        : '') +
      '<p class="tiny muted" style="margin-top:6px">Tarefa fechada sem relato nunca move decisão — por definição, ' +
      'não porque o app puna: sem contar o que o cliente fez, não há o que reler.</p>' +
      '</div>';
  }

  function blocoDoPlano() {
    return '<div class="card" style="margin-top:12px"><div class="row">' +
      '<h3 style="margin:0">Plano de desenvolvimento</h3><span class="espaco"></span>' +
      (global.IADIA && global.IADIA.disponivel()
        ? '<button class="btn alt mini" onclick="App.planoDeDesenvolvimento()"' +
          ' data-ajuda-titulo="Plano de desenvolvimento" data-ajuda="A IA lê a série das últimas semanas e o' +
          ' rendimento por tipo de tarefa, e escreve o que está melhorando, o que está piorando e o que mudar' +
          ' na semana que vem.">Gerar o plano da semana</button>'
        : '<span class="tiny muted">assistente fora do ar</span>') +
      '</div>' +
      '<p class="tiny muted">A IA lê os mesmos números da tabela acima — nada além deles — e diz o que ' +
      'está melhorando, o que está piorando e o que mudar na semana que vem.</p>' +
      '<div id="plano-desenvolvimento"></div></div>';
  }

  function evolucaoDaCarteira() {
    const est = Store.dados();
    const ops = est.oportunidades.filter(function (o) { return true; });
    const ev = E.evolucao(ops, est.tarefas || [], semanasDoAprendizado);

    const seletor = [4, 8, 12].map(function (n) {
      return '<button class="pill' + (n === semanasDoAprendizado ? ' orange' : '') +
        '" onclick="App.semanasDoAprendizado(' + n + ')">' + n + ' semanas</button>';
    }).join('');

    return '<div class="sec-titulo"><h2>Aprendizado da carteira</h2>' +
      '<span class="espaco"></span><div class="row">' + seletor + '</div></div>' +
      (ev.temBase
        ? ''
        : '<div class="aviso">Ainda não há duas semanas fechadas para comparar. Os números abaixo já valem; ' +
          'as setas começam a valer na semana que vem.</div>') +
      destaquesDoAprendizado(ev) +
      '<div class="card" style="margin-top:12px"><h3>Semana a semana</h3>' +
      '<p class="tiny muted">Só entra aqui o que aconteceu dentro da semana e ficou datado — por isso a série ' +
      'é exata também para trás. Valor de negócio não entra: o campo é sobrescrito quando muda, e devolver o ' +
      'valor de hoje com data de julho seria pior do que não responder.</p>' +
      tabelaDaEvolucao(ev) + '</div>' +
      rendimentoDasTarefas(ev) +
      blocoDoPlano();
  }

  /* O que a carteira fechada já ensinou. Com pouca amostra, diz que é pouca amostra. */
  function aprendizado() {
    const a = E.aprendizado(Store.dados().oportunidades);
    if (!a.total) {
      return '<div class="sec-titulo"><h2>Ganhos contra perdas</h2></div>' +
        '<div class="card"><div class="vazio small">Nenhum negócio encerrado ainda. Ao fechar uma oportunidade — ganha ou perdida — o app congela a foto das oito decisões daquele dia. É a comparação entre essas fotos que valida o modelo.</div></div>';
    }

    const pct = function (v) { return v == null ? '—' : Math.round(v * 100) + '%'; };
    const num = function (v, c) { return v == null ? '—' : U.numero(v, c || 1); };

    const linhas = a.porDimensao.map(function (d) {
      return '<tr><td>' + esc(d.nome) + '</td><td class="right">' + num(d.ganho) + '</td>' +
        '<td class="right">' + num(d.perdido) + '</td>' +
        '<td class="right">' + (d.diferenca == null ? '—' : (d.diferenca > 0 ? '+' : '') + num(d.diferenca)) + '</td></tr>';
    }).join('');

    const top = a.porDimensao.filter(function (d) { return d.diferenca != null && d.diferenca > 0; })[0];

    return '<div class="sec-titulo"><h2>Ganhos contra perdas</h2><span class="tiny muted">' + a.total + ' negócio(s) encerrado(s)</span></div>' +
      '<div class="grid k4">' +
        '<div class="kpi"><div class="rot">Taxa de ganho</div><div class="val">' + pct(a.taxaGanho) + '</div><div class="obs">' + a.ganhos + ' ganhos</div></div>' +
        '<div class="kpi"><div class="rot">Perdas por inação</div><div class="val">' + pct(a.taxaInacao) + '</div><div class="obs">' + a.perdidosInacao + ' clientes não decidiram</div></div>' +
        '<div class="kpi"><div class="rot">IAD no fechamento</div><div class="val">' + num(a.iadGanhos) + '<span class="small muted"> × ' + num(a.iadPerdidos) + '</span></div><div class="obs">ganhos × perdidos</div></div>' +
        '<div class="kpi"><div class="rot">Coverage no fechamento</div><div class="val">' + (a.coverageGanhos == null ? '—' : Math.round(a.coverageGanhos) + '%') + '<span class="small muted"> × ' + (a.coveragePerdidos == null ? '—' : Math.round(a.coveragePerdidos) + '%') + '</span></div><div class="obs">ganhos × perdidos</div></div>' +
      '</div>' +
      '<div class="card" style="margin-top:12px"><h3>Quais decisões separaram ganho de perda</h3>' +
      (a.confiavel
        ? (top ? '<p class="small">Maior diferença até aqui: <strong>' + esc(top.nome) + '</strong>.</p>' : '')
        : '<div class="aviso" style="margin-bottom:10px">Amostra pequena (' + a.ganhos + ' ganhos, ' + (a.perdidosConcorrente + a.perdidosInacao) + ' perdas). Leia como indício, não como conclusão — a partir de cerca de cinco de cada lado os números começam a significar algo.</div>') +
      '<div class="tabela-rolagem"><table><thead><tr><th>Decisão</th><th class="right">Ganhos</th><th class="right">Perdidos</th><th class="right">Diferença</th></tr></thead><tbody>' + linhas + '</tbody></table></div>' +
      '<p class="tiny muted" style="margin-top:8px">Nota média (0 a 2) de cada dimensão no dia em que o negócio foi encerrado.</p></div>';
  }

  function boasVindas() {
    return '<div class="card"><h1>Bem-vindo ao IAD CRM</h1>' +
      '<p>Este CRM não mede o que o vendedor fez. Mede o que mudou na decisão do comprador.</p>' +
      '<p class="small muted">Comece com dados de demonstração para entender o modelo, cadastre sua primeira conta ou importe sua carteira de uma planilha.</p>' +
      '<div class="row"><button class="btn alt" onclick="App.carregarDemo()" data-ajuda-titulo="Demonstração" data-ajuda="Carrega uma carteira fictícia com os cinco grupos de pipeline, para treinar a leitura do modelo. Substitui o que está aqui.">Carregar demonstração</button>' +
      '<button class="btn ghost" onclick="App.novaConta()" data-ajuda-titulo="Primeira empresa" data-ajuda="Cadastre a empresa. Depois vêm os contatos e a oportunidade — ou faça tudo de uma vez pelo botão + Oportunidade.">Criar primeira conta</button>' +
      '<button class="btn ghost" onclick="App.ir(\'#/dados\')" data-ajuda-titulo="Importar planilha" data-ajuda="Traz empresas, contatos ou oportunidades de um CSV. Os modelos ficam em Configuração → Importar planilha.">Importar planilha</button></div></div>';
  }

  /* ---------------- Pipeline ---------------- */
  let filtroGrupo = 'todos';
  /* A regra que move um negócio entre estes grupos é a lógica central do app, e
     estava invisível: o vendedor via o rótulo e não sabia o que o tirava dali.
     Cada balão diz o que é, o que faz entrar e o que faz sair — que é como as
     oportunidades navegam entre as alternativas.

     A ordem importa: o app testa de cima para baixo e o negócio fica no
     primeiro grupo que servir. Por isso Zumbi ganha de todos. */
  const FILTROS = [
    ['todos', 'Todos', {
      oQue: 'Toda a carteira aberta. Os cinco grupos abaixo são exclusivos.',
      entra: 'O app testa as regras nesta ordem e o negócio fica na primeira que servir: Zumbi, Falso avançado, Oculto promissor, Negócio real, Em construção.',
      sai: 'Nada muda de grupo por decisão sua: muda quando a decisão do cliente, o tempo sem evidência ou a etapa mudam.',
      faca: 'Comece pelos vermelhos: Falso avançado e Zumbi são os que distorcem a previsão.'
    }],
    ['real', 'Negócio real', {
      oQue: 'Decisão madura, movimento recente e consenso em construção. É o que a previsão pode contar.',
      entra: 'IAD ' + P.IAD_MADURO + ' ou mais · até 14 dias sem evidência do cliente · metade ou mais dos papéis críticos mapeados.',
      sai: 'Passar de 14 dias sem evidência devolve para Em construção; passar de 30 vira Zumbi.',
      faca: 'Mantenha o ritmo e proteja a data. Aqui o risco é achar que está ganho.'
    }],
    ['oculto', 'Oculto promissor', {
      oQue: 'A decisão amadureceu mais rápido do que a etapa do funil indica. A previsão está subestimando este negócio.',
      entra: 'IAD ' + P.IAD_MADURO + ' ou mais, com a etapa ainda antes de Proposta.',
      sai: 'Ao mover para Proposta: vira Negócio real se o gate estiver liberado e houver decisor econômico; senão cai em Falso avançado.',
      faca: 'Acelere. Leve à proposta antes que o interesse esfrie.'
    }],
    ['construcao', 'Em construção', {
      oQue: 'A decisão ainda está sendo formada. É onde o negócio fica quando nenhuma outra regra serve.',
      entra: 'Nenhuma das outras condições se aplica — normalmente IAD abaixo de ' + P.IAD_MADURO + '.',
      sai: 'Chegar a IAD ' + P.IAD_MADURO + ' com evidência dos últimos 14 dias e metade dos papéis críticos leva a Negócio real.',
      faca: 'Ataque a lacuna que o cockpit aponta como primeira. Resolver uma costuma destravar as seguintes.'
    }],
    ['falso', 'Falso avançado', {
      oQue: 'Etapa adiantada com decisão imatura. É o maior destruidor de previsão de vendas.',
      entra: 'Etapa em Proposta ou adiante e ao menos um destes: IAD abaixo de ' + P.IAD_MADURO + ', Proposal Gate não liberado, ou nenhum decisor econômico mapeado.',
      sai: 'Resolvendo as três condições — ou voltando a etapa para onde a decisão realmente está.',
      faca: 'Pare de empurrar a proposta e volte a comprovar. Insistir aqui gasta o negócio.'
    }],
    ['zumbi', 'Zumbi', {
      oQue: 'Mais de 30 dias sem nenhuma evidência do comprador. Ocupa lugar na previsão e na sua cabeça.',
      entra: 'Mais de 30 dias sem evidência do cliente — não importa o IAD nem a etapa. Esta regra vence todas as outras.',
      sai: 'Qualquer evidência nova do cliente zera o relógio e devolve o negócio ao grupo que a decisão dele indicar.',
      faca: 'Requalifique com uma tentativa clara, ou encerre como perdido por inação.'
    }],
    ['fechados', 'Encerrados', {
      oQue: 'Negócios com desfecho registrado: ganho, perdido para concorrente, perdido por inação ou adiado.',
      entra: 'Ao clicar em Encerrar no cockpit. O retrato das oito decisões fica congelado naquele momento.',
      sai: 'Reabrir no cockpit devolve o negócio à carteira ativa.',
      faca: 'É daqui que sai o Aprendizado do painel: quais decisões estavam fracas nos negócios perdidos.'
    }]
  ];

  let modoPipeline = 'lista';

  /* ---------------- Pipeline: a barra de filtros ----------------

     Quem vê o quê é regra de negócio, não de tela, e já está no Store: o
     vendedor só enxerga o que é dele, o gestor enxerga a empresa inteira e o
     administrador escolhe a empresa. O que faltava era o vendedor GESTOR ter
     como separar por pessoa aquilo que ele já podia ver — sem isso, "a
     carteira do time" é uma lista onde ninguém acha a própria.

     Os filtros são de duas naturezas e ficam em dois lugares por isso:
     · o que se troca o tempo todo — responsável, status, ordem — fica na
       linha de cima, à mão;
     · o que se usa para responder uma pergunta específica — quem está sem
       tarefa, quem esfriou, quanto vale a faixa de IAD — fica na gaveta, que
       abre, responde e fecha. */

  const ORDENS_PIPELINE = [
    ['saude', 'Saúde da decisão'],
    ['iad', 'IAD (maior primeiro)'],
    ['valor', 'Valor (maior primeiro)'],
    ['esfriando', 'Sem evidência há mais tempo'],
    ['previsao', 'Fechamento previsto'],
    ['recentes', 'Criadas por último']
  ];

  const STATUS_PIPELINE = [
    ['abertas', 'Em andamento'],
    ['ganhas', 'Ganhas'],
    ['perdidas', 'Perdidas'],
    ['todas', 'Todas']
  ];

  const VAZIO_PIPELINE = {
    responsavel: 'todos',   /* todos | meu | <id> */
    status: 'abertas',
    ordem: 'saude',
    busca: '',
    conta: '',
    segmento: '',
    etapa: '',
    produto: '',
    origem: '',
    sdr: '',
    semTarefa: false,
    semCompromisso: false,
    esfriando: false,
    gateAberto: false,
    iadMin: '', iadMax: '',
    valorMin: '', valorMax: '',
    semEvidenciaDias: '',
    previsaoDe: '', previsaoAte: ''
  };
  let pipelineFiltro = Object.assign({}, VAZIO_PIPELINE);

  function pipelineEstado() { return pipelineFiltro; }
  function pipelineFiltrar(mudancas) { Object.assign(pipelineFiltro, mudancas || {}); }
  function pipelineLimparTudo() { pipelineFiltro = Object.assign({}, VAZIO_PIPELINE); }

  /* Quantos filtros da gaveta estão ligados. É o número no botão — sem ele, a
     pessoa filtra, esquece, e depois jura que o pipeline sumiu. */
  const DA_GAVETA = ['busca', 'conta', 'segmento', 'etapa', 'produto', 'origem', 'sdr',
    'semTarefa', 'semCompromisso', 'esfriando', 'gateAberto',
    'iadMin', 'iadMax', 'valorMin', 'valorMax', 'semEvidenciaDias', 'previsaoDe', 'previsaoAte'];

  function quantosNaGaveta() {
    return DA_GAVETA.filter(function (k) {
      const v = pipelineFiltro[k];
      return v === true || (v !== false && v !== '' && v != null);
    }).length;
  }

  /* As pessoas que este usuário pode separar. Vendedor não tem esta pergunta:
     tudo o que ele enxerga já é dele. */
  function pessoasDoFiltro() {
    const A = global.IADAuth;
    if (!A.ehGestor()) return [];
    const eu = A.atual();
    const escopo = A.ehAdmin() ? A.filtros().tenant : (eu && eu.tenantId);
    return A.usuarios().filter(function (u) {
      if (u.papel === 'admin') return false;
      if (!escopo || escopo === 'todas') return true;
      return u.tenantId === escopo;
    }).sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome)); });
  }

  function nomeDoDono(id) {
    const u = global.IADAuth.usuarios().filter(function (x) { return x.id === id; })[0];
    return u ? (u.nome || u.email || u.login) : '';
  }

  function passaNoFiltroPipeline(r, f) {
    const op = r.op, conta = r.conta;
    const A = global.IADAuth;
    const eu = A.atual();

    if (f.responsavel === 'meu') { if (op.donoId && eu && op.donoId !== eu.id) return false; }
    else if (f.responsavel !== 'todos') { if (op.donoId !== f.responsavel) return false; }

    if (f.status === 'abertas' && op.desfecho) return false;
    if (f.status === 'ganhas' && (!op.desfecho || op.desfecho.tipo !== 'ganho')) return false;
    if (f.status === 'perdidas' && (!op.desfecho || op.desfecho.tipo === 'ganho')) return false;

    if (f.conta && op.contaId !== f.conta) return false;
    if (f.segmento && E.segmentoDe(op) !== f.segmento) return false;
    if (f.etapa && op.etapa !== f.etapa) return false;
    if (f.origem && (op.origem || 'Manual') !== f.origem) return false;
    if (f.sdr && op.sdr !== f.sdr) return false;
    if (f.produto && !(op.itens || []).some(function (i) { return i.produtoId === f.produto; })) return false;

    if (f.busca) {
      const alvo = [op.titulo, conta && conta.nome, op.campanha, op.sdr, op.concorrentes]
        .filter(Boolean).join(' ').toLowerCase();
      if (alvo.indexOf(f.busca.toLowerCase()) === -1) return false;
    }

    /* "Sem tarefa" é a pergunta do RD; "sem próximo passo combinado" é a
       nossa, e é mais dura: tarefa é o que EU marquei, compromisso é o que o
       cliente aceitou. As duas existem porque respondem coisas diferentes. */
    if (f.semTarefa) {
      const abertas = Store.tarefasDaOportunidade(op.id).filter(function (t) { return t.status === 'aberta'; });
      if (abertas.length) return false;
    }
    if (f.semCompromisso && op.proximoCompromisso && op.proximoCompromisso.data) return false;
    /* Esfriando: passou de duas semanas sem o cliente fazer nada. As duas
       faixas de baixo do playbook — "Risco" e "Requalificar". */
    if (f.esfriando && ['risk', 'dead'].indexOf(r.faixa.classe) === -1) return false;
    /* Proposta na rua sem qualificação: o gate existe para dizer que ela foi
       precoce, e este filtro junta todas as que estão nessa situação. */
    if (f.gateAberto && !(E.depoisDaProposta(op) && !r.gates.liberado && !op.gateLiberadoPor)) return false;

    const num = function (v) { return v === '' || v == null ? null : Number(v); };
    const iadMin = num(f.iadMin), iadMax = num(f.iadMax);
    if (iadMin != null && r.iad < iadMin) return false;
    if (iadMax != null && r.iad > iadMax) return false;

    const vMin = num(f.valorMin), vMax = num(f.valorMax);
    if (vMin != null && (op.valor || 0) < vMin) return false;
    if (vMax != null && (op.valor || 0) > vMax) return false;

    const dias = num(f.semEvidenciaDias);
    if (dias != null && r.evidenceAge < dias) return false;

    if (f.previsaoDe && (!op.fechamentoPrevisto || op.fechamentoPrevisto < f.previsaoDe)) return false;
    if (f.previsaoAte && (!op.fechamentoPrevisto || op.fechamentoPrevisto > f.previsaoAte)) return false;

    return true;
  }

  function ordenarPipeline(resumos, ordem) {
    const chave = {
      saude: function (r) { return -r.saude; },
      iad: function (r) { return -r.iad; },
      valor: function (r) { return -(r.op.valor || 0); },
      esfriando: function (r) { return -r.evidenceAge; },
      previsao: function (r) { return r.op.fechamentoPrevisto || '9999-99-99'; },
      recentes: function (r) { return (r.op.criadoEm || '') === '' ? '' : invertido(r.op.criadoEm); }
    }[ordem] || function (r) { return -r.saude; };

    return resumos.slice().sort(function (a, b) {
      const x = chave(a), y = chave(b);
      return (typeof x === 'number') ? x - y : String(x).localeCompare(String(y));
    });
  }

  /* Data invertida para ordenar do mais novo ao mais velho sem duplicar a
     comparação: 2026-09-08 vira 7973-90-91. */
  function invertido(data) {
    return String(data).replace(/\d/g, function (d) { return String(9 - Number(d)); });
  }

  function resumosDoPipeline(est) {
    const f = pipelineFiltro;
    return ordenarPipeline(
      est.oportunidades.map(E.resumo)
        .filter(function (r) { return passaNoFiltroPipeline(r, f); })
        .filter(function (r) { return filtroGrupo === 'todos' || r.classe.id === filtroGrupo; }),
      f.ordem);
  }

  function seletor(rotulo, acao, opcoes, valor, largura) {
    return '<label class="campo mini' + (largura ? ' ' + largura : '') + '"><span>' + esc(rotulo) + '</span>' +
      '<select onchange="' + acao + '">' + opcoes.map(function (o) {
        const val = typeof o === 'string' ? o : o.valor;
        const rot = typeof o === 'string' ? o : o.rotulo;
        return '<option value="' + esc(val) + '"' + (String(val) === String(valor) ? ' selected' : '') + '>' +
          esc(rot) + '</option>';
      }).join('') + '</select></label>';
  }

  function chipsDoPipeline() {
    const f = pipelineFiltro;
    const A = global.IADAuth;
    const chip = function (rotulo, alvo) {
      return '<span class="chip">' + esc(rotulo) +
        '<button type="button" onclick="App.pipelineLimpar(\'' + alvo + '\')" aria-label="Remover filtro">✕</button></span>';
    };
    const c = [];
    /* O recorte do administrador vira chip como qualquer outro: ele é global e
       silencioso, e filtro que não aparece é filtro que a pessoa esquece que
       ligou — depois jura que sumiu negócio da carteira. */
    if (A.ehAdmin()) {
      const g = A.filtros();
      if (g.tenant !== 'todas') {
        const t = A.tenants().filter(function (x) { return x.id === g.tenant; })[0];
        c.push(chip(t ? t.nome : 'Empresa do sistema', 'tenant'));
      }
      if (g.usuario !== 'todos') c.push(chip(nomeDoDono(g.usuario) || 'Responsável', 'usuarioAdmin'));
    }
    if (f.responsavel === 'meu') c.push(chip((A.atual() || {}).nome || 'Minhas', 'responsavel'));
    else if (f.responsavel !== 'todos') c.push(chip(nomeDoDono(f.responsavel) || 'Responsável', 'responsavel'));
    if (f.status !== 'abertas') {
      const st = STATUS_PIPELINE.filter(function (x) { return x[0] === f.status; })[0];
      c.push(chip(st ? st[1] : f.status, 'status'));
    }
    if (f.busca) c.push(chip('“' + f.busca + '”', 'busca'));
    if (f.conta) { const x = Store.conta(f.conta); c.push(chip(x ? x.nome : 'Empresa', 'conta')); }
    if (f.segmento) c.push(chip(f.segmento, 'segmento'));
    if (f.etapa) c.push(chip('Etapa ' + f.etapa, 'etapa'));
    if (f.produto) { const p = Store.produto(f.produto); c.push(chip(p ? p.nome : 'Produto', 'produto')); }
    if (f.origem) c.push(chip('Origem ' + f.origem, 'origem'));
    if (f.sdr) c.push(chip('SDR ' + f.sdr, 'sdr'));
    if (f.semTarefa) c.push(chip('Sem tarefa aberta', 'semTarefa'));
    if (f.semCompromisso) c.push(chip('Sem próximo passo', 'semCompromisso'));
    if (f.esfriando) c.push(chip('Esfriando', 'esfriando'));
    if (f.gateAberto) c.push(chip('Proposta sem gate', 'gateAberto'));
    if (f.iadMin !== '' || f.iadMax !== '') {
      c.push(chip('IAD ' + (f.iadMin || 0) + '–' + (f.iadMax || P.IAD_MAXIMO), 'iad'));
    }
    if (f.valorMin !== '' || f.valorMax !== '') {
      c.push(chip('Valor ' + (f.valorMin ? U.compacto(f.valorMin) : '0') + '–' +
        (f.valorMax ? U.compacto(f.valorMax) : '∞'), 'valor'));
    }
    if (f.semEvidenciaDias !== '') c.push(chip('Sem evidência há ' + f.semEvidenciaDias + '+ dias', 'semEvidenciaDias'));
    if (f.previsaoDe || f.previsaoAte) {
      c.push(chip('Previsão ' + (f.previsaoDe ? U.data(f.previsaoDe) : '…') + ' – ' +
        (f.previsaoAte ? U.data(f.previsaoAte) : '…'), 'previsao'));
    }
    return c.join('');
  }

  function barraDoPipeline(resumos, total) {
    const A = global.IADAuth;
    const f = pipelineFiltro;
    const pessoas = pessoasDoFiltro();
    const valor = resumos.reduce(function (s, r) { return s + (r.op.valor || 0); }, 0);
    const n = quantosNaGaveta();

    /* Vendedor não escolhe responsável: tudo o que ele enxerga já é dele, e o
       campo daria a impressão de que existe carteira escondida.

       Para o administrador este select É o filtro global — o mesmo que a
       barra de administrador usa nas outras telas. Se fosse um filtro local
       à parte, o app teria duas verdades sobre a mesma pergunta: o global
       recortando o que carrega e o local dizendo "todas as pessoas" sobre um
       recorte que já exclui gente. */
    const doResponsavel = !pessoas.length ? ''
      : A.ehAdmin()
        ? seletor('Responsável', 'App.filtrarUsuarioAdmin(this.value)',
            [{ valor: 'todos', rotulo: 'Todos os usuários' }]
              .concat(pessoas.map(function (u) { return { valor: u.id, rotulo: u.nome || u.email || u.login }; })),
            A.filtros().usuario)
        : seletor('Responsável', 'App.pipelineCampo(\'responsavel\', this.value)',
            [{ valor: 'todos', rotulo: 'Todas as pessoas' }, { valor: 'meu', rotulo: 'Minhas negociações' }]
              .concat(pessoas.map(function (u) { return { valor: u.id, rotulo: u.nome || u.email || u.login }; })),
            f.responsavel);

    /* A empresa não está aqui de propósito: trocar de empresa não é filtrar
       uma tela, é mudar onde a pessoa está trabalhando — e isso mora no menu
       da conta, no topo, junto do nome dela. Um controle por pergunta. */
    const doTenant = '';

    return '<div class="filtros-tarefa filtros-negocio">' +
      doTenant + doResponsavel +
      seletor('Status', 'App.pipelineCampo(\'status\', this.value)',
        STATUS_PIPELINE.map(function (x) { return { valor: x[0], rotulo: x[1] }; }), f.status) +
      seletor('Ordenar por', 'App.pipelineCampo(\'ordem\', this.value)',
        ORDENS_PIPELINE.map(function (x) { return { valor: x[0], rotulo: x[1] }; }), f.ordem) +
      '<label class="campo mini cresce"><span>Buscar</span>' +
      '<input type="search" value="' + esc(f.busca) + '" placeholder="negócio, empresa, campanha, SDR"' +
      ' oninput="App.pipelineBusca(this.value)"></label>' +
      '<div class="campo mini botao-gaveta"><span>&nbsp;</span>' +
      '<button class="btn ghost" onclick="App.pipelineFiltros()"' +
      ' data-ajuda-titulo="Mais filtros" data-ajuda="Quem está sem tarefa, quem esfriou, faixa de IAD e de valor, segmento, produto, origem e previsão.">' +
      '⚙ Filtros' + (n ? ' <span class="pill navy">' + n + '</span>' : ' (0)') + '</button></div>' +
      '</div>' +

      '<div class="row chips">' +
      '<span class="chip forte">' + resumos.length +
      (resumos.length === 1 ? ' negociação' : ' negociações') +
      (resumos.length !== total ? ' de ' + total : '') + ' · ' + U.moeda(valor) + '</span>' +
      chipsDoPipeline() + '</div>';
  }

  /* A gaveta. Abre, responde uma pergunta, fecha. O que está aqui dentro é o
     que se usa uma vez por semana; o que está na barra é o do dia. */
  function gavetaDeFiltros() {
    const f = pipelineFiltro;
    const est = Store.dados();
    const contas = est.contas.slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome)); });
    const segmentos = E.segmentosDisponiveis(est.oportunidades);
    const produtos = Store.catalogoAtivos('produtos');
    const sdrs = {};
    est.oportunidades.forEach(function (o) { if (o.sdr) sdrs[o.sdr] = true; });

    const marca = function (id, rotulo, ajuda) {
      return '<label class="item-multi"><input type="checkbox"' + (f[id] ? ' checked' : '') +
        ' onchange="App.pipelineCampo(\'' + id + '\', this.checked)"> <span>' + esc(rotulo) +
        '<em>' + esc(ajuda) + '</em></span></label>';
    };
    const faixa = function (id1, id2, rotulo, tipo, dica) {
      return '<div class="campo mini"><span>' + esc(rotulo) + '</span><div class="row faixa">' +
        '<input type="' + tipo + '" value="' + esc(f[id1]) + '" placeholder="' + esc(dica[0]) +
        '" onchange="App.pipelineCampo(\'' + id1 + '\', this.value)">' +
        '<span class="tiny muted">até</span>' +
        '<input type="' + tipo + '" value="' + esc(f[id2]) + '" placeholder="' + esc(dica[1]) +
        '" onchange="App.pipelineCampo(\'' + id2 + '\', this.value)"></div></div>';
    };

    return '<form method="dialog"><div class="corpo">' +
      '<div class="row"><h2 style="margin:0">Filtros</h2><span class="espaco"></span>' +
      '<button class="btn ghost mini" type="button" onclick="App.pipelineLimpar(\'tudo\')">Limpar tudo</button></div>' +

      '<div class="secao-form"><span>O que está travado</span>' +
      '<em>As quatro perguntas que a carteira responde sozinha quando alguém pergunta.</em></div>' +
      '<div class="lista-multi">' +
      marca('semTarefa', 'Sem tarefa aberta', 'Ninguém combinou o próximo movimento nosso.') +
      marca('semCompromisso', 'Sem próximo passo combinado', 'Sem data aceita pelo cliente não dá para saber se atrasou.') +
      marca('esfriando', 'Esfriando', 'Mais de 14 dias sem o cliente fazer nada.') +
      marca('gateAberto', 'Proposta sem qualificação', 'Já está em Proposta ou depois, e o Proposal Gate não fechou.') +
      '</div>' +

      '<div class="secao-form"><span>Onde</span></div>' +
      seletor('Empresa', 'App.pipelineCampo(\'conta\', this.value)',
        [{ valor: '', rotulo: 'Todas' }].concat(contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; })), f.conta) +
      seletor('Segmento', 'App.pipelineCampo(\'segmento\', this.value)',
        [{ valor: '', rotulo: 'Todos' }].concat(segmentos.map(function (x) { return { valor: x, rotulo: x }; })), f.segmento) +
      seletor('Etapa CRM', 'App.pipelineCampo(\'etapa\', this.value)',
        [{ valor: '', rotulo: 'Todas' }].concat(P.ETAPAS.map(function (x) { return { valor: x, rotulo: x }; })), f.etapa) +
      seletor('Produto ou serviço', 'App.pipelineCampo(\'produto\', this.value)',
        [{ valor: '', rotulo: 'Todos' }].concat(produtos.map(function (p) { return { valor: p.id, rotulo: p.nome }; })), f.produto) +

      '<div class="secao-form"><span>De onde veio</span></div>' +
      seletor('Origem', 'App.pipelineCampo(\'origem\', this.value)',
        [{ valor: '', rotulo: 'Todas' }, { valor: 'Linked Helper', rotulo: 'Linked Helper' },
         { valor: 'Manual', rotulo: 'Cadastro manual' }], f.origem) +
      seletor('SDR', 'App.pipelineCampo(\'sdr\', this.value)',
        [{ valor: '', rotulo: 'Todos' }].concat(Object.keys(sdrs).sort().map(function (x) { return { valor: x, rotulo: x }; })), f.sdr) +

      '<div class="secao-form"><span>Faixas</span>' +
      '<em>Deixe em branco o lado que não importa.</em></div>' +
      faixa('iadMin', 'iadMax', 'IAD (0 a ' + P.IAD_MAXIMO + ')', 'number', ['0', String(P.IAD_MAXIMO)]) +
      faixa('valorMin', 'valorMax', 'Valor (R$)', 'number', ['0', 'sem teto']) +
      '<label class="campo mini"><span>Sem evidência do cliente há mais de</span>' +
      '<input type="number" value="' + esc(f.semEvidenciaDias) + '" placeholder="dias"' +
      ' onchange="App.pipelineCampo(\'semEvidenciaDias\', this.value)"></label>' +
      faixa('previsaoDe', 'previsaoAte', 'Fechamento previsto', 'date', ['', '']) +

      '</div><div class="rodape">' +
      '<button class="btn" value="ok" type="submit">Ver o resultado</button></div></form>';
  }

  function pipeline() {
    const est = Store.dados();
    const filtros = FILTROS.map(function (f) {
      return '<button class="pill tem-ajuda' + (filtroGrupo === f[0] ? ' orange' : '') +
        '" onclick="App.filtrar(\'' + f[0] + '\')">' + esc(f[1]) +
        ajudaDoGrupo(f[1], f[2]) + '</button>';
    }).join(' ');

    /* O grupo "Encerrados" era um filtro à parte com lista própria. Agora é o
       Status da barra que decide isso, e a pill continua ali como atalho:
       clicar nela é o mesmo que escolher "Todas" no status. */
    if (filtroGrupo === 'fechados') {
      return cabecalhoPipeline(filtros) + listaFechados(est);
    }

    const resumos = resumosDoPipeline(est);
    const total = est.oportunidades.filter(function (o) {
      return pipelineFiltro.status !== 'abertas' || !o.desfecho;
    }).length;

    const corpo = resumos.length
      ? (modoPipeline === 'kanban'
          ? kanban(resumos)
          : '<div class="lista">' + resumos.map(cardOportunidade).join('') + '</div>')
      : '<div class="vazio">Nenhuma negociação com estes filtros.' +
        (quantosNaGaveta() || pipelineFiltro.responsavel !== 'todos' || pipelineFiltro.busca
          ? ' <button class="link" onclick="App.pipelineLimpar(\'tudo\')">Limpar os filtros</button>'
          : '') + '</div>';

    return cabecalhoPipeline(filtros) + barraDoPipeline(resumos, total) + corpo;
  }

  function cabecalhoPipeline(filtros) {
    const alternar = ['lista', 'kanban'].map(function (m) {
      return '<button class="pill' + (modoPipeline === m ? ' orange' : '') + '" onclick="App.modoPipeline(\'' + m + '\')" data-ajuda="' +
        (m === 'lista' ? 'Lista ordenada pela saúde da decisão, com IAD, tempo sem evidência e cobertura em cada linha.'
                       : 'Colunas por etapa do funil. A cor da borda continua sendo a decisão: arrastar o cartão não move a decisão do cliente.') +
        '">' +
        (m === 'lista' ? '☰ Lista' : '▦ Kanban') + '</button>';
    }).join(' ');

    /* A ponte é a fila de espera: o Linked Helper entrega lá e o lead fica
       guardado 30 dias. O botão vive aqui, e não em Configuração, porque é aqui
       que o vendedor está quando pensa em pipeline. */
    const importar = global.IADIntegracoes.configurada()
      ? '<button class="btn mini" onclick="App.importarLeads()"' +
        ' data-ajuda-titulo="Importar do Linked Helper" data-ajuda="Traz quem respondeu no LinkedIn.' +
        ' Você confere a lista e importa de uma vez: empresa, contato, oportunidade e a resposta como evidência.">Importar LH</button>'
      : '';

    return '<div class="row"><h1>Pipeline</h1><span class="espaco"></span>' + alternar + importar +
      '<button class="btn alt mini" onclick="App.novaOportunidade()" data-ajuda-titulo="Nova oportunidade" data-ajuda="Cria o negócio. Se a empresa ainda não existir, escolha &quot;+ Cadastrar nova empresa&quot; no próprio campo: você cadastra e volta para cá, sem perder o que digitou.">+ Oportunidade</button></div>' +
      '<div class="row filtros-pipeline" style="margin:8px 0 14px">' + filtros + '</div>';
  }

  /* Kanban por etapa do funil. A cor da borda continua sendo a decisão,
     não a etapa — mover o cartão não move a decisão. */
  function kanban(resumos) {
    const etapas = P.ETAPAS.filter(function (e) { return e !== 'Venda'; });
    const colunas = etapas.map(function (etapa) {
      const doGrupo = resumos.filter(function (r) { return r.op.etapa === etapa; });
      const valor = doGrupo.reduce(function (s, r) { return s + (r.op.valor || 0); }, 0);
      const cartoes = doGrupo.map(function (r) { return cartaoKanban(r, etapas); }).join('') ||
        '<div class="vazio tiny">—</div>';
      return '<section class="coluna" ondragover="event.preventDefault()" ondrop="App.soltar(event,\'' + etapa + '\')">' +
        '<header><div class="row" style="gap:6px"><strong>' + esc(etapa) + '</strong><span class="espaco"></span>' +
        '<button class="mais" title="Cadastro rápido nesta etapa" onclick="App.cadastroRapido(\'' + etapa + '\')">+</button></div>' +
        '<span class="tiny muted">' + doGrupo.length + ' · ' + U.compacto(valor) + '</span></header>' +
        '<div class="cartoes">' + cartoes + '</div></section>';
    }).join('');

    return '<div class="kanban">' + colunas + '</div>' +
      '<p class="tiny muted" style="margin-top:8px">Arraste o cartão para mudar a etapa, ou use as setas. A mudança fica registrada no histórico.</p>';
  }

  function cartaoKanban(r, etapas) {
    const i = etapas.indexOf(r.op.etapa);
    const seta = function (destino, simbolo, titulo) {
      if (destino < 0 || destino >= etapas.length) return '';
      return '<button class="seta" title="' + esc(titulo + etapas[destino]) + '" ' +
        'onclick="event.stopPropagation();App.moverEtapa(\'' + r.op.id + '\',\'' + etapas[destino] + '\')">' + simbolo + '</button>';
    };

    return '<article class="mini g-' + r.classe.id + '" draggable="true" ' +
      'ondragstart="App.arrastar(event,\'' + r.op.id + '\')" onclick="App.abrir(\'' + r.op.id + '\')">' +
      '<div class="titulo">' + esc(r.op.titulo) + '</div>' +
      '<div class="tiny muted">' + esc((r.conta && r.conta.nome) || '') + '</div>' +
      '<div class="row" style="margin:7px 0 4px;gap:6px">' + tiraDecisao(r.op) + '</div>' +
      '<div class="row tiny" style="gap:6px">' +
        '<strong>' + U.compacto(r.op.valor) + '</strong>' +
        '<span class="muted">IAD ' + r.iad + '</span>' +
        '<span class="espaco"></span>' +
        '<span class="pill ' + r.faixa.classe + '">' + r.evidenceAge + 'd</span>' +
      '</div>' +
      '<div class="rodape-mini">' + seta(i - 1, '‹', 'Voltar para ') + seta(i + 1, '›', 'Avançar para ') + '</div>' +
      '</article>';
  }

  function listaFechados(est) {
    const fechadas = est.oportunidades.filter(function (o) { return o.desfecho; })
      .sort(function (a, b) { return b.desfecho.data.localeCompare(a.desfecho.data); });

    const itens = fechadas.map(function (op) {
      const d = P.DESFECHOS.find(function (x) { return x.id === op.desfecho.tipo; }) || { rotulo: op.desfecho.tipo, classe: '' };
      const conta = Store.conta(op.contaId);
      return '<button class="item" onclick="App.abrir(\'' + op.id + '\')">' +
        '<div class="row"><span class="tit">' + esc(op.titulo) + '</span>' +
        (op.origem === 'Linked Helper' ? '<span class="pill">LH</span>' : '') +
        '<span class="espaco"></span>' +
        '<span class="pill ' + d.classe + '">' + esc(d.rotulo) + '</span></div>' +
        '<div class="small muted">' + esc((conta && conta.nome) || '') + ' · ' + U.compacto(op.desfecho.valorFinal) + ' · encerrado em ' + U.data(op.desfecho.data) + '</div>' +
        '<div class="tiny muted" style="margin-top:6px">IAD no fechamento: ' + op.desfecho.iadFinal + '/' + P.IAD_MAXIMO + ' · grupo comprador ' + (op.desfecho.coverageFinal || 0) + '%' +
        (op.desfecho.motivo ? ' · ' + esc(op.desfecho.motivo) : '') + '</div></button>';
    }).join('') || '<div class="vazio">Nenhum negócio encerrado ainda.</div>';

    return '<div class="lista">' + itens + '</div>';
  }

  /* Tira compacta: o mesmo mapa das 8 decisões, do tamanho de uma linha. */
  function tiraDecisao(op) {
    return '<span class="tira" aria-hidden="true">' + P.DIMENSOES.map(function (d) {
      const n = op.dims[d.id] || 0;
      const provado = n < 3 || E.podeComprovar(op, d.id, n);
      return '<i class="t' + n + (provado ? '' : ' sem-prova') + '" title="' + esc(d.nome) + '"></i>';
    }).join('') + '</span>';
  }

  function cardOportunidade(r) {
    const comp = r.compromisso;
    return '<button class="item g-' + r.classe.id + '" onclick="App.abrir(\'' + r.op.id + '\')">' +
      '<div class="row"><span class="tit">' + esc(r.op.titulo) + '</span><span class="espaco"></span>' +
      '<span class="pill navy">' + U.compacto(r.op.valor) + '</span></div>' +
      '<div class="small muted" style="margin:2px 0 8px">' + esc((r.conta && r.conta.nome) || 'Sem conta') + ' · ' + esc(r.op.etapa) + ' · ' + r.tempoNaEtapa + 'd nesta etapa</div>' +
      '<div class="row tiny">' +
        '<span class="pill">IAD ' + r.iad + '/' + P.IAD_MAXIMO + '</span>' +
        '<span class="pill ' + r.faixa.classe + '">' + r.evidenceAge + 'd sem evidência</span>' +
        '<span class="pill">Grupo ' + r.coverage.percentual + '%</span>' +
        (comp && comp.vencido ? '<span class="pill dead">compromisso vencido</span>' : '') +
        ((r.op.adiamentos || 0) >= 2 ? '<span class="pill warn">' + r.op.adiamentos + ' adiamentos</span>' : '') +
      '</div>' +
      '<div class="row" style="margin-top:9px;gap:8px">' + tiraDecisao(r.op) +
      '<span class="tiny muted">' + r.iad + '/' + P.IAD_MAXIMO + '</span></div>' +
      '<div class="tiny muted" style="margin-top:6px">Falta: ' +
      esc(r.lacunas.length ? r.lacunas.slice(0, 2).map(function (l) { return l.titulo; }).join(', ') +
        (r.lacunas.length > 2 ? ' e mais ' + (r.lacunas.length - 2) : '') : 'nada — resta formalizar') + '</div>' +
      '</button>';
  }

  /* ---------------- Curva do IAD ----------------
     Série única, degraus: o IAD só muda quando uma decisão muda. */
  function curvaIAD(op) {
    const pontos = E.curva(op);
    if (pontos.length < 2) {
      return '<div class="vazio small">A curva aparece a partir da segunda mudança de pontuação.</div>';
    }

    const L = 40, T = 14, larg = 620, alt = 170, D = 26;
    const x0 = L, x1 = larg - 16, y0 = T, y1 = alt - D;
    const datas = pontos.map(function (p) { return new Date(p.data + 'T00:00:00').getTime(); });
    const min = Math.min.apply(null, datas), max = Math.max.apply(null, datas);
    const px = function (t) { return max === min ? x1 : x0 + ((t - min) / (max - min)) * (x1 - x0); };
    const py = function (v) { return y1 - (Math.max(0, Math.min(P.IAD_MAXIMO, v)) / P.IAD_MAXIMO) * (y1 - y0); };

    let d = '';
    pontos.forEach(function (p, i) {
      const X = px(datas[i]), Y = py(p.iad);
      if (i === 0) d += 'M' + X.toFixed(1) + ' ' + Y.toFixed(1);
      else d += ' H' + X.toFixed(1) + ' V' + Y.toFixed(1);
    });

    const grade = [0, P.IAD_MAXIMO / 2, P.IAD_MAXIMO].map(function (v) {
      return '<line x1="' + x0 + '" y1="' + py(v) + '" x2="' + x1 + '" y2="' + py(v) + '" stroke="var(--line)" stroke-width="1" fill="none"/>' +
        '<text x="' + (x0 - 8) + '" y="' + (py(v) + 4) + '" text-anchor="end" font-size="10" fill="var(--muted)">' + v + '</text>';
    }).join('');

    const marcas = pontos.map(function (p, i) {
      if (!p.dimensao && i !== pontos.length - 1) return '';
      const X = px(datas[i]), Y = py(p.iad);
      const titulo = U.data(p.data) + ' · IAD ' + p.iad +
        (p.dimensao ? ' · ' + p.dimensao + ' ' + p.de + '→' + p.para : '');
      return '<circle cx="' + X.toFixed(1) + '" cy="' + Y.toFixed(1) + '" r="4.5" fill="var(--surface)" stroke="var(--navy-2)" stroke-width="2">' +
        '<title>' + esc(titulo) + '</title></circle>';
    }).join('');

    const ultimo = pontos[pontos.length - 1];
    const ux = px(datas[datas.length - 1]), uy = py(ultimo.iad);

    return '<div class="grafico"><svg viewBox="0 0 ' + larg + ' ' + alt + '" width="100%" height="' + alt + '" role="img" ' +
      'aria-label="Evolução do IAD ao longo do tempo, de ' + U.data(pontos[0].data) + ' a ' + U.data(ultimo.data) + '">' +
      grade +
      '<path d="' + d + '" fill="none" stroke="var(--navy-2)" stroke-width="2" stroke-linejoin="round"/>' +
      marcas +
      '<text x="' + Math.min(ux + 8, larg - 60) + '" y="' + Math.max(uy - 8, 14) + '" font-size="11" font-weight="700" fill="var(--navy-2)">IAD ' + ultimo.iad + '</text>' +
      '<text x="' + x0 + '" y="' + (alt - 8) + '" font-size="10" fill="var(--muted)">' + U.data(pontos[0].data) + '</text>' +
      '<text x="' + x1 + '" y="' + (alt - 8) + '" font-size="10" fill="var(--muted)" text-anchor="end">' + U.data(ultimo.data) + '</text>' +
      '</svg></div>' +
      '<p class="tiny muted">Cada degrau é uma decisão que mudou. Passe o ponteiro sobre um ponto para ver qual.</p>';
  }

  /* ---------------- Cockpit da oportunidade ---------------- */
  function cockpit(id) {
    const op = Store.oportunidade(id);
    if (!op) return '<div class="vazio">Oportunidade não encontrada.</div>';
    const r = E.resumo(op);
    const conta = r.conta;

    const desf = op.desfecho ? P.DESFECHOS.find(function (x) { return x.id === op.desfecho.tipo; }) : null;
    const banner = desf
      ? '<div class="card" style="margin-top:10px"><div class="row"><span class="pill ' + desf.classe + '">' + esc(desf.rotulo) + '</span>' +
        '<span class="small muted">encerrado em ' + U.data(op.desfecho.data) + ' · IAD ' + op.desfecho.iadFinal + '/' + P.IAD_MAXIMO + ' · ' + (op.desfecho.diasEmAberto || 0) + ' dias em aberto</span>' +
        '<span class="espaco"></span><button class="btn ghost mini" onclick="App.reabrir(\'' + op.id + '\')">Reabrir</button></div>' +
        (op.desfecho.motivo ? '<p class="small" style="margin:10px 0 0">' + esc(op.desfecho.motivo) + '</p>' : '') +
        (op.desfecho.concorrente ? '<p class="tiny muted" style="margin:6px 0 0">Concorrente: ' + esc(op.desfecho.concorrente) + '</p>' : '') + '</div>'
      : '';

    return '<div class="row"><button class="btn ghost mini" onclick="App.ir(\'#/pipeline\')">← Pipeline</button>' +
      '<span class="espaco"></span><button class="btn ghost mini" onclick="App.editarOportunidade(\'' + op.id + '\')" data-ajuda-titulo="Editar" data-ajuda="Muda título, valor, etapa, tipo, previsão e concorrentes. Não mexe nas decisões.">Editar</button>' +
      (op.desfecho ? '' : '<button class="btn ghost mini" onclick="App.encerrar(\'' + op.id + '\')" data-ajuda-titulo="Encerrar" data-ajuda="Registra o desfecho e congela o retrato das oito decisões. É daqui que sai o Aprendizado do painel.">Encerrar</button>') + '</div>' +
      banner +
      '<h1 style="margin-top:10px">' + esc(op.titulo) + '</h1>' +
      '<p class="muted small">' + esc((conta && conta.nome) || 'Sem conta') + ' · ' + U.moeda(op.valor) + ' · ' + esc(op.tipo || 'Novo negócio') +
      ' · Etapa CRM: ' + esc(op.etapa) + ' há ' + r.tempoNaEtapa + ' dias' +
      (op.fechamentoPrevisto ? ' · previsão ' + U.data(op.fechamentoPrevisto) : '') + '</p>' +
      (op.concorrentes
        ? '<p class="tiny muted" style="margin:-6px 0 0">Contra: ' + esc(op.concorrentes) + '</p>'
        : '') +
      /* O que está sendo vendido. Ficava só guardado em op.itens e não
         aparecia em lugar nenhum: escolher produto no cadastro e não ver o
         que se escolheu é a mesma coisa que não ter escolhido. */
      itensDaOportunidade(op) +
      /* De onde veio e de quem: com várias SDRs prospectando, é isso que
         permite ler o resultado por pessoa e por campanha depois. */
      (op.origem
        ? '<p class="tiny muted" style="margin:2px 0 0">Origem: ' + esc(op.origem) +
          (op.campanha ? ' \u00b7 campanha ' + esc(op.campanha) : '') +
          (op.sdr ? ' \u00b7 SDR ' + esc(op.sdr) : '') + '</p>'
        : '') +

      painelTarefas(op) +
      blocoAvanco(op, r) +
      blocoPlanoIA(op) +
      blocoLacunas(op, r) +
      blocoInsight(op, r) +
      blocoProximoPasso(op, r) +
      blocoAlertas(r) +
      detalhe('As 8 decisões', 'pontue aqui', blocoDimensoes(op)) +
      detalhe('Proposal Gate', r.gates.prontidao + '% de prontidão', blocoGate(op, r)) +
      detalhe('Buying group', r.coverage.mapeados + ' pessoa(s) · ' + r.coverage.percentual + '% dos papéis críticos', blocoGrupo(op, r)) +
      detalhe('Tarefas', contarTarefas(op), blocoTarefas(op)) +
      detalhe('Arquivos', 'anexos por decisão', blocoArquivos(op)) +
      detalhe('Evolução da decisão', 'a curva do IAD', curvaIAD(op)) +
      detalhe('Histórico', 'tudo o que aconteceu', blocoHistorico(op));
  }

  function contarTarefas(op) {
    const abertas = Store.tarefasDaOportunidade(op.id).filter(function (t) { return t.status === 'aberta'; });
    return abertas.length ? abertas.length + ' aberta(s)' : 'nenhuma aberta';
  }

  /* Seções de detalhe ficam recolhidas: o topo responde, o resto aprofunda. */
  function detalhe(titulo, resumo, conteudo) {
    return '<details class="bloco"><summary><span class="tit">' + esc(titulo) + '</span>' +
      '<span class="resumo">' + esc(resumo) + '</span></summary>' +
      '<div class="corpo">' + conteudo + '</div></details>';
  }

  /* Mesmo balão das oito decisões, com o vocabulário dos grupos de pipeline. */
  function ajudaDoGrupo(nome, a) {
    const linha = function (rotulo, texto) {
      return '<span class="ajuda-rot">' + rotulo + '</span><span class="ajuda-linha">' + esc(texto) + '</span>';
    };
    return '<span class="ajuda" role="tooltip">' +
      '<span class="ajuda-titulo">' + esc(nome) + '</span>' +
      '<span class="ajuda-pergunta">' + esc(a.oQue) + '</span>' +
      linha('Entra quando', a.entra) +
      linha('Sai quando', a.sai) +
      linha('O que fazer', a.faca) +
      '</span>';
  }

  /* ---------------- Avanço: o mapa das 8 decisões ---------------- */
  const ESTADOS = P.NIVEIS_DA_ESCADA.map(function (n) { return n.rotulo; });

  function mapaDecisao(op, clicavel) {
    return '<div class="mapa-decisao">' + P.DIMENSOES.map(function (d) {
      const n = op.dims[d.id] || 0;
      const provado = n < 3 || E.podeComprovar(op, d.id, n);
      const classe = 'q' + n + (provado ? '' : ' sem-prova');
      /* A marca conta a origem: nada quando não se sabe, meia-lua quando é
         suposição nossa, visto quando veio do cliente, visto duplo no papel. */
      const marca = !provado ? '!' : ['', '◐', '✓', '✓', '✓✓'][n];
      /* Tocar na decisão abre a tarefa já marcada como feita e já apontada
         para a evidência direta: dois cliques a menos que o formulário
         completo, e mesmo assim a evidência nasce com um canal atrás dela. */
      const abre = clicavel
        ? ' onclick="App.novaTarefa(\'' + op.id + '\',\'' + d.id +
          '\',{situacao:\'feita\',evidenciaDireta:\'sim\',titulo:\'' + esc(d.nome) + '\'})"'
        : '';
      return '<button class="celula tem-ajuda ' + classe + '"' + abre + '>' +
        '<span class="marca">' + marca + '</span>' +
        '<span class="rot">' + esc(d.nome) + '</span>' +
        '<span class="estado">' + esc(n === 2 && !provado ? 'sem prova' : ESTADOS[n]) + '</span>' +
        ajudaDaDimensao(d, n, provado) +
        '</button>';
    }).join('') + '</div>';
  }

  /* Ajuda pelo contexto: o nome da decisão sozinho não diz o que ela quer saber,
     e ninguém abre o Playbook no meio de uma pontuação. O balão traz a pergunta,
     o que cada nota significa — com a atual em destaque — e o que comprova.

     Vai dentro do <button>, então só pode conter conteúdo de frase: spans com
     display block, nunca div ou ul. */
  function ajudaDaDimensao(d, n, provado) {
    const niveis = d.niveis.map(function (texto, i) {
      return '<span class="nivel' + (i === n ? ' agora' : '') + '">' +
        '<span class="n">' + i + '</span>' + esc(texto) + '</span>';
    }).join('');

    const comprova = d.evidencias.slice(0, 3).map(function (e) {
      return '<span class="ev">' + esc(e) + '</span>';
    }).join('');

    return '<span class="ajuda" role="tooltip">' +
      '<span class="ajuda-titulo">' + esc(d.nome) + '</span>' +
      '<span class="ajuda-pergunta">' + esc(d.pergunta) + '</span>' +
      '<span class="ajuda-rot">O que cada nota significa</span>' +
      '<span class="niveis">' + niveis + '</span>' +
      '<span class="ajuda-rot">O que comprova</span>' +
      '<span class="evs">' + comprova + '</span>' +
      (n === 2 && !provado
        ? '<span class="ajuda-alerta">Está em 2 sem evidência confirmada ou documentada.</span>'
        : '') +
      '</span>';
  }

  function blocoAvanco(op, r) {
    const notas = P.DIMENSOES.map(function (d) { return op.dims[d.id] || 0; });
    const provadas = notas.filter(function (n) { return n === 2; }).length;
    const parciais = notas.filter(function (n) { return n === 1; }).length;
    const zeros = notas.filter(function (n) { return n === 0; }).length;
    const faltam = 16 - r.iad;
    const d = r.delta;

    const resumoDelta = d.mudancas.length || d.evidencias
      ? (d.iadDelta > 0 ? '+' + d.iadDelta + ' esta semana · ' : '') + d.evidencias + ' evidência(s) em 7 dias' +
        (d.mudancas.length ? ' · ' + d.mudancas.map(function (m) { return m.nome + ' ' + m.de + '→' + m.para; }).join(', ') : '')
      : 'Nada mudou na decisão nos últimos 7 dias.';

    return '<div class="card destaque-avanco">' +
      '<div class="row"><h2 style="margin:0">Avanço da decisão</h2><span class="espaco"></span>' +
      '<span class="pill ' + r.faixa.classe + '">' + r.evidenceAge + 'd sem evidência</span>' +
      '<span class="pill">' + esc(r.classe.rotulo) + '</span></div>' +

      '<div class="medidor">' +
        '<div class="numero">' + r.iad + '<span class="de">/' + P.IAD_MAXIMO + '</span></div>' +
        '<div class="trilho">' + U.barra((r.iad / 16) * 100) +
          '<div class="legenda tiny muted">' + provadas + ' comprovadas · ' + parciais + ' parciais · ' + zeros + ' em branco · faltam ' + faltam + ' pontos</div>' +
        '</div>' +
      '</div>' +

      mapaDecisao(op, !op.desfecho) +
      '<p class="tiny muted" style="margin:8px 0 0">Toque em uma decisão para registrar, por uma tarefa, a evidência que a comprova.</p>' +
      '<div class="faixa-delta ' + (d.mudancas.length || d.evidencias ? '' : 'parado') + '">' + esc(resumoDelta) + '</div>' +
      '</div>';
  }

  /* ---------------- O que falta ---------------- */
  function blocoLacunas(op, r) {
    if (op.desfecho) return '';
    const lacunas = r.lacunas;
    if (!lacunas.length) {
      return '<div class="card"><h2>O que falta</h2>' +
        '<p class="small">Nada. As oito decisões estão comprovadas, o grupo comprador está coberto e há um próximo passo combinado. O que resta é formalizar.</p></div>';
    }

    const itens = lacunas.map(function (l, i) {
      const rotulo = l.tipo === 'dimensao'
        ? (l.nota === 0 ? 'não sabemos' : 'falta comprovar')
        : ({ comprovacao: 'sem prova', papel: 'papel ausente', mobilizador: 'sem mobilizador',
             insight: 'Teach', compromisso: 'sem data' }[l.tipo] || 'pendente');
      const classe = l.tipo === 'dimensao' && l.nota === 1 ? 'warn' : (l.tipo === 'papel' ? 'risk' : 'dead');

      /* O mesmo texto para as oito decisões não ajuda: o que muda é o que conta
         como evidência em cada uma. Os balões saem do próprio playbook. */
      const d = l.dimensao;
      /* Um botão por decisão, e não dois. "Registrar evidência" e "Criar
         tarefa" eram o mesmo gesto em dois tempos — o que vou fazer e o que
         já fiz — e separá-los fazia a evidência entrar sem interação nenhuma
         atrás dela: ninguém sabia depois se aquilo veio de uma visita ou de
         um WhatsApp. A escolha "a fazer / já foi feita" está dentro. */
      const acoes = d
        ? '<button class="btn alt mini" onclick="App.novaTarefa(\'' + op.id + '\',\'' + d.id + '\')"' +
            ' data-ajuda-titulo="Tarefa para ' + esc(d.nome) + '"' +
            ' data-ajuda="' + esc('O que move esta decisão. Se ainda vai acontecer, por exemplo: ' +
                d.canais.whatsapp + ' Se já aconteceu, marque “já foi feita” e conte o que o CLIENTE fez — conta, por exemplo: ' +
                d.evidencias.slice(0, 2).join('; ').toLowerCase() + '. O que você apresentou não conta.') + '">+ Tarefa</button>'
        : (l.tipo === 'compromisso'
            ? '<button class="btn alt mini" onclick="App.definirCompromisso(\'' + op.id + '\')" data-ajuda-titulo="Combinar data" data-ajuda="Registra o próximo passo e a data. Negócio sem próximo passo combinado é negócio no ar.">Combinar data</button>'
            : (l.tipo === 'insight'
                ? '<button class="btn alt mini" onclick="App.definirInsight(\'' + op.id + '\')" data-ajuda-titulo="Definir insight" data-ajuda="O reenquadramento do Challenger: o que você ensina a este cliente que ele não veria sozinho.">Definir insight</button>'
                : '<button class="btn ghost mini" onclick="App.ligarStakeholder(\'' + op.id + '\')" data-ajuda-titulo="Vincular pessoa" data-ajuda="Traz um contato da empresa para o grupo comprador deste negócio.">Vincular pessoa</button>'));

      return '<li class="lacuna">' +
        '<span class="ordem">' + (i + 1) + '</span>' +
        '<div class="conteudo">' +
          '<div class="row"><strong>' + esc(l.titulo) + '</strong><span class="pill ' + classe + '">' + rotulo + '</span></div>' +
          '<p class="small muted">' + esc(l.falta) + '</p>' +
          (l.pergunta ? '<p class="tiny"><span class="muted">A responder:</span> ' + esc(l.pergunta) + '</p>' : '') +
          '<p class="tiny"><span class="muted">O que resolve:</span> ' + esc(l.comoProvar) + '</p>' +
          '<div class="row">' + acoes + '</div>' +
        '</div></li>';
    }).join('');

    return '<div class="card"><div class="row"><h2 style="margin:0">O que falta</h2><span class="espaco"></span>' +
      '<span class="pill">' + lacunas.length + ' item(ns)</span></div>' +
      '<p class="tiny muted" style="margin:6px 0 12px">Em ordem de prioridade: resolver o primeiro costuma destravar os seguintes.</p>' +
      '<ol class="lacunas">' + itens + '</ol></div>';
  }

  /* Teach, do Challenger: o reenquadramento que o cliente não teria sozinho. */
  function blocoInsight(op, r) {
    const ins = op.insight || { estado: 'nenhum', texto: '' };
    const estado = P.ESTADOS_INSIGHT.find(function (e) { return e.id === ins.estado; }) || P.ESTADOS_INSIGHT[0];
    const classe = { nenhum: 'dead', formulado: 'warn', apresentado: 'warn', aceito: 'ok' }[ins.estado] || '';

    return '<div class="card"><div class="row"><h2 style="margin:0">Insight comercial</h2><span class="espaco"></span>' +
      '<span class="pill ' + classe + '">' + esc(estado.rotulo) + '</span>' +
      '<button class="btn ghost mini" onclick="App.definirInsight(\'' + op.id + '\')"' +
      ' data-ajuda-titulo="Insight comercial" data-ajuda="O reenquadramento do Challenger: a verdade sobre o negócio do cliente que ele não enxerga sozinho. Sem isso a conversa começa no problema que ele já conhece — e aí quem decide é o preço.">' +
      (ins.texto ? 'Editar' : 'Definir') + '</button></div>' +
      (ins.texto
        ? '<p class="small" style="margin:10px 0 0">' + esc(ins.texto) + '</p>'
        : '<p class="small muted" style="margin:10px 0 0">Qual verdade sobre o negócio do cliente ele não enxerga sozinho? Sem isso, a conversa começa no problema que ele já sabe que tem — e aí o preço decide.</p>') +
      dicasDoInsight(op, r, ins) +
      '</div>';
  }

  /* ---------------- Dicas: o que fazer agora, tiradas deste negócio ----------------
     O bloco dizia o que é um insight e parava aí. Estas dicas são montadas com o
     que já está gravado — a lacuna do topo, o compromisso, quem está no grupo,
     o concorrente declarado — em vez de conselho genérico de venda. */
  function dicasDoInsight(op, r, ins) {
    if (!r) return '';
    const dicas = [];
    const conta = r.conta;

    if (ins.estado === 'nenhum') {
      dicas.push({ urgencia: 'agora', texto: 'Escreva o reenquadramento antes da próxima conversa. Comece por: "o que ' +
        ((conta && conta.nome) || 'este cliente') + ' trata como custo de operação e na verdade é perda de receita?"' });
      if (op.concorrentes) {
        dicas.push({ urgencia: '', texto: 'Você anotou "' + op.concorrentes + '" como concorrência. O insight precisa mudar o critério de escolha, senão a comparação vira preço.' });
      }
    } else if (ins.estado === 'formulado') {
      dicas.push({ urgencia: 'agora', texto: 'O insight existe mas não foi apresentado. Leve-o à próxima conversa e registre a reação como evidência.' });
    } else if (ins.estado === 'apresentado') {
      dicas.push({ urgencia: 'agora', texto: 'Apresentado, ainda não adotado. Só conta quando o cliente repetir o reenquadramento como se fosse dele — ouça isso e registre como evidência de Problema.' });
    } else {
      dicas.push({ urgencia: '', texto: 'O cliente adotou o reenquadramento. Agora use os critérios dele: peça que a avaliação inclua o que o insight revelou.' });
    }

    const primeira = (r.lacunas || [])[0];
    if (primeira) {
      dicas.push({ urgencia: 'depois', texto: 'A lacuna do topo é ' + primeira.titulo + '. ' + primeira.comoProvar + '.' });
    }

    const c = r.compromisso;
    if (!c) {
      dicas.push({ urgencia: 'agora', texto: 'Não há próximo passo combinado com data. Sem isso não dá para saber se o negócio atrasou.' });
    } else if (c.vencido) {
      dicas.push({ urgencia: 'agora', texto: 'O compromisso "' + c.texto + '" venceu há ' + c.diasAtraso + ' dia(s). Retome ou combine outro.' });
    }

    if (r.coverage && r.coverage.mapeados <= 1) {
      dicas.push({ urgencia: 'depois', texto: 'O negócio depende de uma pessoa só. Peça a ela a apresentação a quem paga e a quem usa.' });
    }

    return '<div class="dicas">' +
      '<span class="dicas-rot">O que fazer agora</span>' +
      dicas.slice(0, 4).map(function (d) {
        return '<span class="dica' + (d.urgencia === 'agora' ? ' urgente' : '') + '">' +
          (d.urgencia === 'agora' ? '<span class="sino">!</span>' : '<span class="sino">·</span>') +
          '<span>' + esc(d.texto) + '</span></span>';
      }).join('') + '</div>';
  }

  /* ---------------- Próximo passo: compromisso + recomendação ---------------- */
  function blocoProximoPasso(op, r) {
    const c = r.compromisso;
    const compromisso = c
      ? '<div class="row"><span class="pill ' + (c.vencido ? 'dead' : 'ok') + '">' +
          (c.vencido ? 'vencido há ' + c.diasAtraso + 'd' : 'em ' + c.diasAte + 'd') + '</span>' +
          '<strong>' + esc(c.texto) + '</strong></div>' +
        '<p class="tiny muted" style="margin:6px 0 0">' + U.data(c.data) + ' · a vez é ' + (c.dono === 'cliente' ? 'do cliente' : 'nossa') + '.</p>'
      : '<p class="small muted" style="margin:0">Nenhum próximo passo combinado com data.</p>';

    const canais = r.nbd.canais ? P.CANAIS.map(function (canal) {
      return '<tr><td><strong>' + esc(canal.nome) + '</strong></td><td>' + esc(r.nbd.canais[canal.id]) + '</td></tr>';
    }).join('') : '';

    return '<div class="card"><div class="row"><h2 style="margin:0">Próximo passo</h2><span class="espaco"></span>' +
      '<button class="btn ghost mini" onclick="App.definirCompromisso(\'' + op.id + '\')">' + (c ? 'Atualizar' : 'Combinar data') + '</button></div>' +
      '<div style="margin:10px 0 14px">' + compromisso + '</div>' +
      (r.nbd.critico ? '<div class="aviso" style="margin-bottom:10px">Risco crítico nesta oportunidade.</div>' : '') +
      '<p class="small"><span class="muted">Decisão a provocar:</span> <strong>' + esc(r.nbd.decisao) + '</strong></p>' +
      '<p class="small muted">' + esc(r.nbd.acao) + '</p>' +
      (canais ? detalhe('Como fazer em cada canal', r.nbd.conteudo || '', '<div class="tabela-rolagem"><table><tbody>' + canais + '</tbody></table></div>') : '') +
      /* Um botão. Registrar evidência, analisar reunião, fechamento de reunião
         e atividade eram quatro portas para o mesmo lugar — e nenhuma delas
         guardava por qual canal a decisão andou. Agora tudo entra por uma
         tarefa, e é dentro dela que se escolhe como contar o que aconteceu. */
      '<div class="row" style="margin-top:12px">' +
      '<button class="btn alt" onclick="App.novaTarefa(\'' + op.id + '\',\'' +
        (r.nbd.dimensao ? r.nbd.dimensao.id : '') + '\')"' +
      ' data-ajuda-titulo="Nova tarefa" data-ajuda="Uma porta só. Reunião, visita, telefonema, WhatsApp ou e-mail — a fazer ou já feita. Se já aconteceu, escolha como contar: colar a ata (o assistente lê e relê as oito decisões), responder quatro perguntas, ou registrar uma evidência direta.">+ Tarefa</button>' +
      '</div></div>';
  }

  let filtroHistorico = 'tudo';

  /* "O que falta" já lista compromisso, papéis e provas pendentes.
     Aqui ficam só os riscos que aquela lista não cobre. */
  const ALERTAS_JA_COBERTOS = ['compromisso', 'comprovacao', 'papel'];

  function blocoAlertas(r) {
    const html = r.alertas.filter(function (a) {
      return ALERTAS_JA_COBERTOS.indexOf(a.tipo) === -1;
    }).map(function (a) {
      return '<div class="aviso" style="margin-bottom:6px">' + (a.nivel === 'alto' ? '🔴 ' : '🟡 ') + esc(a.texto) + '</div>';
    }).join('');
    return html ? '<div class="card"><h2>Alertas</h2>' + html + '</div>' : '';
  }

  /* ---------- o que sustenta cada nota ----------

     O painel dizia "2 evidência(s), ao menos uma confirmada" e parava aí. O
     número responde "quantas", que é a pergunta menos útil das três. As que
     importam são "o que o cliente disse" e "onde ele disse" — e as duas
     estavam guardadas no histórico, misturadas com as outras oito decisões,
     onde ninguém procura.

     Sem elas, a nota é uma afirmação que não se confere. Três semanas depois
     ninguém lembra por que Prioridade está em 2, e o vendedor que herda a
     conta não tem como saber se aquilo ainda vale.

     Fica fechado por padrão: oito listas abertas viram uma página de rolagem
     em que não se acha nada. Aberto, mostra a frase do cliente, quem falou,
     por qual canal, com que força, quando, e de qual tarefa ou documento
     aquilo veio. */
  const FORCA_ROTULO = {};
  P.FORCAS.forEach(function (f) { FORCA_ROTULO[f.id] = f.rotulo; });

  function provaDaDimensao(op, e) {
    const quem = e.contatoId ? Store.contato(e.contatoId) : null;
    const ficha = [
      quem ? quem.nome + (quem.cargo ? ' — ' + quem.cargo : '') : '',
      e.canal || '',
      FORCA_ROTULO[e.forca] || e.forca || '',
      e.data ? U.data(e.data) : ''
    ].filter(Boolean).join(' · ');

    /* De onde veio. É o que separa "o cliente disse" de "alguém escreveu que
       o cliente disse": quem quiser conferir sabe qual reunião reabrir. */
    const origem = e.origemTitulo
      ? '<div class="tiny muted">de: ' + esc(e.origemTitulo) + '</div>'
      : '';

    const combinado = (e.compromisso && e.compromisso.texto)
      ? '<div class="tiny">Combinado: ' + esc(e.compromisso.texto) +
        (e.compromisso.data ? ' · ' + U.data(e.compromisso.data) : '') + '</div>'
      : '';

    return '<li class="prova">' +
      '<div class="fala">“' + esc(e.titulo || '(sem texto)') + '”</div>' +
      '<div class="tiny muted">' + esc(ficha) + '</div>' +
      origem + combinado +
      '</li>';
  }

  /* O que falta, decisão por decisão. Vem do mesmo cálculo que alimenta "O
     que ainda falta" da leitura da IA — não é um segundo texto escrito à mão
     que amanhã diverge do primeiro.

     E aparece em toda decisão abaixo de 2, não só nas vazias. Uma decisão em
     1 é o caso mais comum e era o menos servido: a tela dizia o que já tinha
     e nada sobre o que ainda faltava para fechar. */
  function oQueFaltaNaDimensao(op, d) {
    const lacuna = E.lacunas(op).filter(function (l) {
      return l.dimensao && l.dimensao.id === d.id &&
        (l.tipo === 'dimensao' || l.tipo === 'comprovacao');
    })[0];
    if (!lacuna) return '';

    return '<div class="falta-dim">' +
      '<div><strong>Falta:</strong> ' + esc(lacuna.falta) + '</div>' +
      (lacuna.pergunta ? '<div><strong>Pergunte:</strong> ' + esc(lacuna.pergunta) + '</div>' : '') +
      (lacuna.comoProvar ? '<div><strong>Conta como prova:</strong> ' + esc(lacuna.comoProvar) + '</div>' : '') +
      /* O conselho do canal já vem escrito como frase pronta no playbook —
         rotular de "no canal" fazia parecer que ali ia o nome do canal. */
      (lacuna.canal ? '<div class="muted" style="margin-top:3px">Como abordar: ' + esc(lacuna.canal) + '</div>' : '') +
      '</div>';
  }

  /* A escada inteira, com o critério objetivo de cada degrau nesta decisão.
     É o que o vendedor precisa para saber o que fazer, e é o que impede o
     otimismo: em "suposto" está escrito que somos nós que achamos. */
  function escadaDaDimensao(d, atual) {
    return '<div class="escada">' + P.NIVEIS_DA_ESCADA.map(function (nivel) {
      const n = nivel.n;
      return '<div class="degrau' + (n === atual ? ' aqui' : '') + (n < atual ? ' feito' : '') + '">' +
        '<span class="n">' + n + '</span>' +
        '<span class="txt"><strong>' + esc(nivel.rotulo) + ':</strong> ' + esc(d.niveis[n]) + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  function blocoDimensoes(op) {
    const dims = P.DIMENSOES.map(function (d) {
      const v = op.dims[d.id] || 0;
      const provas = E.evidenciasDaDimensao(op, d.id);
      const pode = E.podeComprovar(op, d.id, 3);
      /* Cinco degraus, e o bloqueio agora acompanha o degrau: 3 exige evidência
         confirmada, 4 exige documentada. O título do botão traz o critério
         objetivo daquele degrau nesta decisão — é onde o vendedor lê o que
         precisa acontecer, sem sair da tela. */
      const notas = P.NIVEIS_DA_ESCADA.map(function (nivel) {
        const n = nivel.n;
        const bloqueado = n >= 3 && !E.podeComprovar(op, d.id, n);
        return '<button class="' + (v === n ? 'on' + n : '') + (bloqueado ? ' bloqueado' : '') + '" ' +
          'onclick="App.pontuar(\'' + op.id + '\',\'' + d.id + '\',' + n + ')" ' +
          'title="' + esc(nivel.rotulo + ' — ' + d.niveis[n] +
            (bloqueado ? ' (exige evidência ' + (n === 4 ? 'documentada' : 'confirmada ou documentada') + ')' : '')) +
          '">' + n + '</button>';
      }).join('');

      /* Da mais recente para a mais antiga: é a última fala do cliente que
         diz se a nota ainda vale hoje. */
      const emOrdem = provas.slice().sort(function (a, b) {
        return String(b.data || '').localeCompare(String(a.data || ''));
      });

      /* As duas metades da mesma pergunta: o que as reuniões já produziram, e
         o que ainda falta para a decisão fechar. Separadas, porque uma é
         registro do passado e a outra é instrução para a próxima conversa. */
      const jaTem = provas.length
        ? '<div class="ja-tem"><div class="rotulo">O que as reuniões já provaram</div>' +
          '<ul>' + emOrdem.map(function (e) { return provaDaDimensao(op, e); }).join('') + '</ul></div>'
        : '<div class="ja-tem"><div class="rotulo">O que as reuniões já provaram</div>' +
          '<p class="tiny muted" style="margin:4px 0 0">Nada ainda: nenhuma fala do cliente foi registrada nesta decisão.</p></div>';

      const detalhe = '<details class="provas"><summary>' +
        (provas.length ? provas.length + ' registro(s) · ' : '') +
        (v < 2 ? 'ver o que falta' : 'ver de onde veio a nota') + '</summary>' +
        jaTem + oQueFaltaNaDimensao(op, d) + '</details>';

      return '<div class="dim"><div class="cab"><span class="nome">' + esc(d.nome) + '</span><div class="notas">' + notas + '</div></div>' +
        '<div class="small muted" style="margin-top:4px">' + esc(d.pergunta) + '</div>' +
        '<div class="tiny muted" style="margin-top:3px">' + esc(d.niveis[v]) +
        ' · ' + provas.length + ' evidência(s)' + (pode ? ', ao menos uma confirmada' : ', nenhuma confirmada') + '</div>' +
        escadaDaDimensao(d, v) +
        detalhe + '</div>';
    }).join('');

    return '<div class="card"><h2>As 8 decisões</h2>' +
      '<p class="tiny muted">' +
      P.NIVEIS_DA_ESCADA.map(function (n) { return n.n + ' = ' + n.rotulo.toLowerCase(); }).join(' · ') +
      '. O que decide o degrau é DE ONDE a informação veio, não o quanto sabemos. ' +
      'Os degraus 3 e 4 exigem evidência do cliente com essa força. ' +
      'Abra cada decisão para ver o que já foi provado e o que falta.</p>' +
      dims + '</div>';
  }

  function blocoGate(op, r) {
    const gatesHtml = r.gates.itens.map(function (i) {
      return '<span class="pill ' + (i.ok ? 'ok' : 'dead') + '">' + esc(i.nome) + ' ' + i.atual + '/' + i.min + '</span>';
    }).join(' ');

    return '<div class="card"><h2>Proposal Gate</h2>' +
      '<div class="row"><span class="pill ' + (r.gates.liberado ? 'ok' : 'risk') + '">Prontidão ' + r.gates.prontidao + '%</span>' +
      (op.gateLiberadoPor ? '<span class="pill warn">Liberado manualmente por ' + esc(op.gateLiberadoPor) + '</span>' : '') + '</div>' +
      '<div style="margin:10px 0">' + U.barra(r.gates.prontidao, !r.gates.liberado) + '</div>' +
      '<div class="row">' + gatesHtml + '</div>' +
      (r.gates.liberado
        ? '<p class="small" style="margin-top:10px">Qualificação mínima atendida: a proposta agora formaliza decisões já tomadas.</p>'
        : '<p class="small" style="margin-top:10px">Faltam: ' + esc(r.gates.pendentes.map(function (p) { return p.nome; }).join(', ')) + '.</p>' +
          '<button class="btn ghost mini" onclick="App.liberarGate(\'' + op.id + '\')" data-ajuda-titulo="Liberar mesmo assim" data-ajuda="Emite proposta sem a qualificação mínima. Fica registrado quem autorizou — proposta cedo demais é o jeito mais caro de descobrir que o cliente não estava comprando.">Liberar proposta mesmo assim (fica registrado)</button>') +
      '</div>';
  }

  function blocoGrupo(op, r) {
    /* Quem decide primeiro: influência era preenchida e não ordenava nada. */
    const pessoas = E.stakeholdersDaOp(op).slice().sort(function (a, b) {
      return (b.influencia || 2) - (a.influencia || 2);
    }).map(function (p) {
      const chefe = p.reportaA ? Store.contato(p.reportaA) : null;
      return '<div class="pessoa"><div class="nome"><span class="dot ' + p.sentimento + '"></span>' + esc(p.nome) + '</div>' +
        '<div class="tiny muted">' + esc(p.cargo || '—') + '</div>' +
        '<div class="tiny" style="margin-top:5px">' + esc(p.papel) + ' · influência ' + (p.influencia || 2) + '/3</div>' +
        perfilEtiqueta(p) +
        (chefe ? '<div class="tiny muted">reporta a ' + esc(chefe.nome) + '</div>' : '') +
        (p.canalPreferido ? '<div class="tiny muted">fala melhor por ' + esc(p.canalPreferido) + '</div>' : '') +
        '<div class="row tiny" style="margin-top:7px"><button class="btn ghost mini" onclick="App.editarContato(\'' + p.id + '\')">Editar</button>' +
        '<button class="btn ghost mini" onclick="App.removerStakeholder(\'' + op.id + '\',\'' + p.id + '\')">Remover</button></div></div>';
    }).join('') || '<div class="vazio small">Nenhum stakeholder ligado. Venda single-threaded é o maior risco silencioso.</div>';

    const aut = r.autoria;
    const cobPerfis = r.coverage;
    const notaPerfis = '<p class="tiny muted" style="margin:0 0 8px">' +
      cobPerfis.mobilizadores + ' mobilizador(es) · ' + cobPerfis.bloqueadores + ' bloqueador(es) · ' +
      cobPerfis.naoClassificados + ' sem perfil.</p>';
    const notaAutoria = aut.total
      ? '<p class="tiny muted" style="margin:0 0 10px">' + aut.total + ' evidência(s) de ' + aut.pessoas + ' pessoa(s)' +
        (aut.principal ? ' · ' + Math.round(aut.concentracao * 100) + '% vieram de ' + esc(aut.principal.nome) : '') + '.</p>'
      : '';

    /* Contato cadastrado na empresa e não ligado a este negócio some da conta
       da cobertura. Em vez de deixar isso silencioso, o botão diz quantos são. */
    const soltos = Store.contatosDaConta(op.contaId).filter(function (c) {
      return (op.stakeholders || []).indexOf(c.id) === -1;
    });

    return '<div class="card"><div class="row"><h2 style="margin:0">Buying group</h2><span class="espaco"></span>' +
      (soltos.length
        ? '<button class="btn alt mini" onclick="App.ligarTodosStakeholders(\'' + op.id + '\')" data-ajuda-titulo="Vincular todos" data-ajuda="Traz para este negócio os contatos já cadastrados na empresa. Sem eles, a cobertura fica em zero e o app acusa venda de uma perna só.">+ Vincular os ' +
          soltos.length + ' da empresa</button>'
        : '') +
      '<button class="btn ghost mini" onclick="App.ligarStakeholder(\'' + op.id + '\')" data-ajuda-titulo="Vincular pessoa" data-ajuda="Escolhe um contato da empresa para o grupo comprador deste negócio.">+ Vincular pessoa</button></div>' +
      '<p class="tiny muted" style="margin:6px 0 4px">Papéis críticos faltando: ' + (r.coverage.faltando.length ? esc(r.coverage.faltando.join(', ')) : 'nenhum') + '</p>' +
      notaPerfis + notaAutoria +
      '<div class="mapa">' + pessoas + '</div></div>';
  }

  function perfilEtiqueta(p) {
    const perfil = P.PERFIS.find(function (x) { return x.id === (p.perfil || 'nao_classificado'); });
    if (!perfil || perfil.grupo === 'indefinido') return '<div class="tiny muted">perfil não classificado</div>';
    const classe = { mobilizador: 'ok', falador: 'warn', bloqueador: 'dead' }[perfil.grupo] || '';
    return '<div style="margin-top:5px"><span class="pill ' + classe + '" title="' + esc(perfil.dica) + '">' + esc(perfil.rotulo) + '</span></div>';
  }

  /* ---------------- Painel de tarefas, no topo do cockpit ----------------
     Fica antes do avanço da decisão porque é o que o vendedor abriu a tela
     para fazer: ver o que deve, e registrar o que aconteceu. E é aqui que a
     reunião entra — no gesto de fechar a tarefa, que ele já faz de qualquer
     jeito, em vez de num formulário separado que ninguém procura. */
  let filtroTarefas = 'abertas';
  let periodoTarefas = 'tudo';

  const SITUACOES_TAREFA = [
    ['abertas', 'Abertas'], ['atrasadas', 'Atrasadas'],
    ['concluidas', 'Concluídas'], ['todas', 'Todas']
  ];
  const PERIODOS_TAREFA = [
    ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano'], ['tudo', 'Tudo']
  ];

  function dentroDoPeriodo(data, periodo) {
    if (periodo === 'tudo' || !data) return true;
    const dias = { semana: 7, mes: 31, ano: 365 }[periodo] || 99999;
    const limite = new Date();
    limite.setDate(limite.getDate() - dias);
    const adiante = new Date();
    adiante.setDate(adiante.getDate() + dias);
    return data >= limite.toISOString().slice(0, 10) && data <= adiante.toISOString().slice(0, 10);
  }

  function itensDaOportunidade(op) {
    const itens = (op.itens || []).map(function (i) {
      const p = Store.produto(i.produtoId);
      return p ? p.nome : null;
    }).filter(Boolean);
    if (!itens.length) return '';
    return '<p class="tiny muted" style="margin:2px 0 0">Compõe: ' +
      itens.map(esc).join(' \u00b7 ') + '</p>';
  }

  function painelTarefas(op) {
    const hoje = Store.hoje();
    const todas = Store.tarefasDaOportunidade(op.id)
      .sort(function (a, b) { return a.vencimento.localeCompare(b.vencimento); });

    const abertas = todas.filter(function (t) { return t.status === 'aberta'; });
    const atrasadas = abertas.filter(function (t) { return t.vencimento < hoje; });
    const concluidas = todas.filter(function (t) { return t.status !== 'aberta'; });

    const visiveis = todas.filter(function (t) {
      /* Para a tarefa feita, o que situa no tempo é quando foi feita, não
         quando venceria. Filtrar "esta semana" pelo vencimento esconderia
         justamente o que se concluiu esta semana. */
      if (!dentroDoPeriodo(t.concluidaEm || t.vencimento, periodoTarefas)) return false;
      if (filtroTarefas === 'abertas') return t.status === 'aberta';
      if (filtroTarefas === 'atrasadas') return t.status === 'aberta' && t.vencimento < hoje;
      if (filtroTarefas === 'concluidas') return t.status !== 'aberta';
      return true;
    });

    const pill = function (chave, rotulo, ativo, acao) {
      return '<button class="pill' + (ativo ? ' orange' : '') + '" onclick="App.' + acao +
        '(\'' + chave + '\')">' + esc(rotulo) + '</button>';
    };

    const linhas = visiveis.map(function (t) {
      const d = P.DIMENSOES.filter(function (x) { return x.id === t.decisaoAlvo; })[0];
      const feita = t.status !== 'aberta';
      const atrasada = !feita && t.vencimento < hoje;
      /* O canal fica visível na linha: é o que permite ler depois por onde a
         decisão andou — e uma lista de tarefas sem canal é uma lista de
         lembretes. A marca "registrada" distingue a tarefa que eu planejei e
         cumpri da que eu anotei depois de acontecer; contam igual no funil e
         não contam igual na metodologia. */
      return '<div class="tarefa-linha">' +
        (feita
          ? '<span class="quadro feito" title="Concluída">\u2713</span>'
          : '<button class="quadro" onclick="App.concluirTarefa(\'' + t.id + '\')" title="Concluir sem registrar o que aconteceu"></button>') +
        '<span class="small' + (feita ? ' muted' : '') + '">' +
        (t.tipo ? '<span class="pill tiny">' + esc(t.tipo) + '</span> ' : '') + esc(t.titulo) +
        (d ? ' <span class="tiny muted">\u2192 ' + esc(d.nome) + '</span>' : '') +
        (feita && t.origem === 'registrada' ? ' <span class="tiny muted" title="Anotada depois de acontecer">· registrada</span>' : '') +
        (feita && t.comRelato ? ' <span class="tiny muted" title="Teve ata lida pelo assistente">· com ata</span>' : '') +
        (feita && t.semRegistro ? ' <span class="tiny atrasado" title="Fechada sem contar o que aconteceu: não moveu nenhuma das oito decisões">· sem relato</span>' : '') + '</span>' +
        '<span class="espaco"></span>' +
        '<span class="tiny ' + (atrasada ? 'atrasado' : 'muted') + '">' +
        (feita ? 'feita ' + U.data(t.concluidaEm || t.vencimento) : U.data(t.vencimento)) + '</span>' +
        (feita ? '' : '<button class="btn ghost mini" onclick="App.concluirComRelato(\'' + op.id + '\',\'' + t.id + '\')"' +
          ' data-ajuda-titulo="Concluir com o que aconteceu" data-ajuda="Cole ou anexe o que aconteceu. O assistente separa as evidências, relê as oito decisões e registra o próximo passo — tudo no mesmo gesto de concluir a tarefa.">Concluir</button>') +
        '<button class="btn ghost mini" onclick="App.excluirTarefa(\'' + t.id + '\')">\u2715</button></div>';
    }).join('');

    /* Um botão só. Reunião não é um gesto à parte: é um tipo de tarefa, e a
       pergunta "a fazer ou já foi feita?" está dentro do formulário. */
    return '<div class="card"><div class="row"><h2 style="margin:0">Tarefas</h2>' +
      '<span class="espaco"></span>' +
      '<button class="btn ghost mini" onclick="IADUI.fecharDialogos();location.hash=\'#/playbook\'"' +
      ' data-ajuda-titulo="O método" data-ajuda="A teoria inteira: o que conta como evidência em cada uma das oito decisões, o que fazer em cada canal, e por que atividade nossa não move o índice.">? Método</button>' +
      '<button class="btn mini" onclick="App.novaTarefa(\'' + op.id + '\')"' +
      ' data-ajuda-titulo="Nova tarefa" data-ajuda="Reunião, visita, telefonema, WhatsApp ou e-mail. Se já aconteceu, marque “Já foi feita” e conte o que aconteceu: cole a ata, responda quatro perguntas, ou registre uma evidência direta. O assistente relê as oito decisões.">+ Tarefa</button></div>' +

      '<p class="small muted" style="margin:8px 0 0">' +
      abertas.length + ' aberta(s) \u00b7 ' +
      '<span class="' + (atrasadas.length ? 'atrasado' : '') + '">' + atrasadas.length + ' atrasada(s)</span> \u00b7 ' +
      concluidas.length + ' concluída(s)</p>' +

      '<div class="row filtros-pipeline" style="margin:10px 0 4px">' +
      SITUACOES_TAREFA.map(function (f) {
        return pill(f[0], f[1], filtroTarefas === f[0], 'filtrarTarefas');
      }).join(' ') + '</div>' +
      '<div class="row filtros-pipeline" style="margin:0 0 10px">' +
      '<span class="tiny muted" style="align-self:center">Período:</span> ' +
      PERIODOS_TAREFA.map(function (f) {
        return pill(f[0], f[1], periodoTarefas === f[0], 'periodoTarefas');
      }).join(' ') + '</div>' +

      (linhas || '<div class="vazio small">Nenhuma tarefa neste filtro.</div>') +
      '</div>';
  }

  function blocoTarefas(op) {
    const tarefas = Store.tarefasDaOportunidade(op.id)
      .sort(function (a, b) { return a.vencimento.localeCompare(b.vencimento); });
    const abertas = tarefas.filter(function (t) { return t.status === 'aberta'; });

    const linhas = abertas.map(function (t) {
      const d = P.DIMENSOES.find(function (x) { return x.id === t.decisaoAlvo; });
      const atrasada = t.vencimento < Store.hoje();
      return '<div class="tarefa-linha"><button class="quadro" onclick="App.concluirTarefa(\'' + t.id + '\')" title="Concluir"></button>' +
        '<span class="small">' + esc(t.titulo) + (d ? ' <span class="tiny muted">→ ' + esc(d.nome) + '</span>' : '') + '</span>' +
        '<span class="espaco"></span>' +
        '<span class="tiny ' + (atrasada ? 'atrasado' : 'muted') + '">' + U.data(t.vencimento) + '</span>' +
        '<button class="btn ghost mini" onclick="App.excluirTarefa(\'' + t.id + '\')">✕</button></div>';
    }).join('') || '<div class="vazio small">Nenhuma tarefa aberta.</div>';

    return '<div class="card"><div class="row"><h2 style="margin:0">Tarefas</h2><span class="espaco"></span>' +
      '<button class="btn ghost mini" onclick="App.novaTarefa(\'' + op.id + '\')">+ Tarefa</button></div>' +
      '<p class="tiny muted" style="margin:6px 0 10px">Toda tarefa aponta para a decisão que pretende provocar. Tarefa sem decisão-alvo é agenda, não venda.</p>' +
      '<div class="tarefas">' + linhas + '</div></div>';
  }

  function blocoArquivos(op) {
    return '<div class="card"><div class="row"><h2 style="margin:0">Arquivos</h2><span class="espaco"></span>' +
      '<button class="btn ghost mini" onclick="App.anexar(\'' + op.id + '\')">+ Anexar</button></div>' +
      '<p class="tiny muted" style="margin:6px 0 10px">Organizados pela decisão que destravam. Documento enviado pelo cliente vira evidência.</p>' +
      '<div id="lista-arquivos" class="lista-arquivos"><div class="tiny muted">Carregando anexos…</div></div></div>';
  }

  function itemArquivo(a) {
    const kb = a.tamanho > 1048576
      ? (a.tamanho / 1048576).toFixed(1) + ' MB'
      : Math.max(1, Math.round(a.tamanho / 1024)) + ' KB';
    return '<div class="arquivo"><div class="row"><strong class="small">' + esc(a.nome) + '</strong>' +
      '<span class="espaco"></span><span class="pill">' + esc(a.categoria) + '</span></div>' +
      '<div class="tiny muted">' + kb + ' · ' + U.data(a.data) + ' · ' + (a.enviadoPor === 'cliente' ? 'enviado pelo cliente' : 'enviado por nós') + '</div>' +
      '<div class="row" style="margin-top:6px"><button class="btn ghost mini" onclick="App.abrirArquivo(\'' + a.id + '\')">Abrir</button>' +
      '<button class="btn ghost mini" onclick="App.excluirArquivo(\'' + a.id + '\',\'' + a.oportunidadeId + '\')">Excluir</button></div></div>';
  }


  function blocoHistorico(op) {
    const tipos = [['tudo', 'Tudo'], ['decision', 'Evidências'], ['pontuacao', 'Pontuação'], ['activity', 'Atividades'], ['sistema', 'Sistema']];
    const filtros = tipos.map(function (t) {
      return '<button class="pill' + (filtroHistorico === t[0] ? ' orange' : '') + '" onclick="App.filtrarHistorico(\'' + t[0] + '\')">' + esc(t[1]) + '</button>';
    }).join(' ');

    const eventos = E.historico(op)
      .filter(function (e) { return filtroHistorico === 'tudo' || e.tipo === filtroHistorico; })
      .slice(0, 40)
      .map(function (e) {
        const dim = P.DIMENSOES.find(function (d) { return d.id === e.dimensao; });
        const forca = e.forca ? P.FORCAS.find(function (f) { return f.id === e.forca; }) : null;
        const quem = e.contatoId ? Store.contato(e.contatoId) : null;

        let rotulo, classe;
        if (e.tipo === 'decision') { rotulo = 'Evidência do cliente'; classe = 'ev'; }
        else if (e.tipo === 'pontuacao') { rotulo = 'Pontuação'; classe = 'pt'; }
        else if (e.tipo === 'sistema') { rotulo = 'Sistema'; classe = 'sis'; }
        else { rotulo = 'Atividade do vendedor (não conta como avanço)'; classe = 'at'; }

        const titulo = e.tipo === 'pontuacao' && dim ? dim.nome + ' ' + esc(e.titulo) : esc(e.titulo);

        return '<div class="evento ' + classe + '">' +
          '<div class="quando">' + U.data(e.data) + ' · ' + rotulo +
          (dim && e.tipo !== 'pontuacao' ? ' · ' + esc(dim.nome) : '') +
          (e.canal ? ' · ' + esc(e.canal) : '') + '</div>' +
          '<div class="small">' + titulo + '</div>' +
          /* A transcrição da conversa vem aqui. Guardar a troca com a SDR e
             não mostrá-la é o mesmo que não guardar: quem abre a conta
             precisa ler a pergunta para entender a resposta. */
          (e.detalhe ? '<div class="tiny muted transcricao">' + esc(e.detalhe) + '</div>' : '') +
          (forca || quem
            ? '<div class="tiny muted">' + (forca ? esc(forca.rotulo) : '') + (quem ? (forca ? ' · ' : '') + 'por ' + esc(quem.nome) : '') + '</div>'
            : '') +
          (e.justificativa ? '<div class="tiny muted">' + esc(e.justificativa) + '</div>' : '') +
          (e.compromisso && e.compromisso.data ? '<div class="tiny muted">Combinado: ' + esc(e.compromisso.texto) + ' até ' + U.data(e.compromisso.data) + '</div>' : '') +
          (e.tipo === 'sistema' || e.tipo === 'pontuacao' ? '' :
            '<button class="btn ghost mini" style="margin-top:5px" onclick="App.removerEvento(\'' + op.id + '\',\'' + e.id + '\')">Excluir</button>') +
          '</div>';
      }).join('') || '<div class="vazio small">Nenhum evento neste filtro.</div>';

    return '<div class="card"><h2>Histórico</h2>' +
      '<div class="row" style="margin:6px 0 12px">' + filtros + '</div>' +
      '<div class="timeline">' + eventos + '</div></div>';
  }

  /* ---------------- Tarefas: a tela inteira ----------------

     A tarefa é a unidade de trabalho do vendedor e era a única coisa do app
     sem tela própria: vivia dentro do cockpit de UM negócio. Quem tem trinta
     contas não trabalha assim — abre a lista do dia, filtra o que atrasou,
     age em bloco.

     A regra que esta tela não pode afrouxar: concluir uma tarefa é o momento
     em que a decisão avança, e quem faz a decisão avançar é o que o CLIENTE
     fez — não o fato de a linha ficar riscada. Por isso "Concluir" abre o
     relato, e o fechamento em lote existe mas se identifica como o que é:
     dívida, marcada na linha e filtrável. */

  const VAZIO_TAREFAS = {
    responsavel: 'meu',      /* meu | todos | <id de usuário> */
    /* Empresa e negociação são dois filtros, e não um: a mesma empresa tem
       várias negociações abertas, e "as tarefas da Marilan" e "as tarefas da
       proposta de reúso da Marilan" são perguntas diferentes. */
    empresa: '',
    negocio: '',
    /* A tela abre no que ainda está de pé — atrasado e por vencer juntos.
       Abrir em "atrasadas" fazia quem acabou de importar do LinkedIn, com as
       tarefas todas vencendo hoje, cair num "nenhuma tarefa neste filtro" que
       se lê como perda de dado. O atrasado continua no topo: a ordem é a data. */
    status: 'abertas',       /* abertas | atrasadas | pendentes | concluidas | sem-registro | todos */
    tipos: [],               /* vazio = todos */
    de: '', ate: '',
    busca: '',
    ordem: 'data',           /* data | valor | empresa */
    crescente: true,
    pagina: 1,
    porPagina: 25,
    resumoAberto: true
  };
  let tarefasFiltro = Object.assign({}, VAZIO_TAREFAS);
  let tarefasMarcadas = {};

  const STATUS_TAREFA = [
    ['abertas', 'A fazer', '◻'],
    ['atrasadas', 'Atrasadas', '⚠'],
    ['pendentes', 'Pendentes', '◴'],
    ['concluidas', 'Concluídas', '✓'],
    ['sem-registro', 'Concluídas sem relato', '⚡'],
    ['todos', 'Todos os status', '▦']
  ];

  /* O ícone diz o canal antes de a pessoa ler o título. Tipo que o usuário
     criou e não está aqui cai no genérico — nunca some da lista. */
  const ICONE_TIPO = {
    'Reunião': '\u{1F91D}', 'Visita': '\u{1F697}', 'Telefonema': '\u{1F4DE}',
    'WhatsApp': '\u{1F4AC}', 'E-mail': '✉️', 'Apresentação': '\u{1F4CA}',
    'Proposta': '\u{1F4C4}', 'Preparação': '\u{1F9F0}', 'Cobrar retorno': '\u{1F501}',
    'LinkedIn': '\u{1F517}'
  };
  function iconeDoTipo(tipo) { return ICONE_TIPO[tipo] || '\u{1F4CC}'; }

  function iniciaisDe(nome) {
    const partes = String(nome || '?').trim().split(/\s+/);
    return ((partes[0] || '?')[0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
  }

  /* Todas as tarefas visíveis ao usuário, já com o negócio e a conta juntos:
     a linha da tabela precisa dos três, e buscar um por um a cada render é o
     tipo de coisa que trava a lista em carteira grande. */
  function tarefasComContexto() {
    const est = Store.dados();
    const contas = {}, ops = {};
    est.contas.forEach(function (c) { contas[c.id] = c; });
    est.oportunidades.forEach(function (o) { ops[o.id] = o; });
    return est.tarefas.map(function (t) {
      const op = ops[t.oportunidadeId] || null;
      return { t: t, op: op, conta: op ? (contas[op.contaId] || null) : null };
    });
  }

  function statusDaTarefa(t) {
    if (t.status === 'aberta') return t.vencimento < Store.hoje() ? 'atrasada' : 'pendente';
    return t.semRegistro ? 'sem-registro' : 'concluida';
  }

  const ROTULO_STATUS = {
    atrasada: ['ATRASADA', 'dead'], pendente: ['PENDENTE', 'warn'],
    concluida: ['CONCLUÍDA', 'ok'], 'sem-registro': ['SEM RELATO', 'risk']
  };

  function tarefaPassaNoFiltro(linha, f, eu) {
    const t = linha.t;
    const situacao = statusDaTarefa(t);

    if (f.responsavel === 'meu') { if (t.donoId && eu && t.donoId !== eu.id) return false; }
    else if (f.responsavel !== 'todos') { if (t.donoId !== f.responsavel) return false; }

    if (f.status === 'abertas' && t.status !== 'aberta') return false;
    if (f.status === 'atrasadas' && situacao !== 'atrasada') return false;
    if (f.status === 'pendentes' && situacao !== 'pendente') return false;
    if (f.status === 'concluidas' && t.status === 'aberta') return false;
    if (f.status === 'sem-registro' && situacao !== 'sem-registro') return false;

    if (f.empresa && (!linha.conta || linha.conta.id !== f.empresa)) return false;
    if (f.negocio && (!linha.op || linha.op.id !== f.negocio)) return false;

    if (f.tipos.length && f.tipos.indexOf(t.tipo) === -1) return false;

    /* Feita se situa pela data em que foi feita; aberta, pelo vencimento.
       Filtrar tudo pelo vencimento esconderia o que se concluiu na semana. */
    const quando = t.status === 'aberta' ? t.vencimento : (t.concluidaEm || t.vencimento);
    if (f.de && quando < f.de) return false;
    if (f.ate && quando > f.ate) return false;

    if (f.busca) {
      const alvo = [t.titulo, t.tipo, linha.op && linha.op.titulo, linha.conta && linha.conta.nome]
        .filter(Boolean).join(' ').toLowerCase();
      if (alvo.indexOf(f.busca.toLowerCase()) === -1) return false;
    }
    return true;
  }

  /* Mesma regra do pipeline: id que não resolve é filtro que cai. */
  function sanearFiltrosDeTarefa() {
    const f = tarefasFiltro;
    if (f.empresa && !Store.conta(f.empresa)) { f.empresa = ''; f.negocio = ''; }
    if (f.negocio && !Store.oportunidade(f.negocio)) f.negocio = '';
    if (f.responsavel !== 'todos' && f.responsavel !== 'meu' &&
        !global.IADAuth.usuarios().some(function (u) { return u.id === f.responsavel; })) {
      f.responsavel = 'todos';
    }
    const tipos = Store.nomesDoCatalogo('tiposTarefa');
    if (f.tipos.length) f.tipos = f.tipos.filter(function (t) { return tipos.indexOf(t) !== -1; });
  }

  function tarefasFiltradas() {
    sanearFiltrosDeTarefa();
    const f = tarefasFiltro;
    const eu = global.IADAuth.atual();
    const lista = tarefasComContexto().filter(function (l) { return tarefaPassaNoFiltro(l, f, eu); });

    const chave = function (l) {
      if (f.ordem === 'valor') return (l.op && l.op.valor) || 0;
      if (f.ordem === 'empresa') return (l.conta && l.conta.nome ? l.conta.nome : '~').toLowerCase();
      return (l.t.status === 'aberta' ? l.t.vencimento : (l.t.concluidaEm || l.t.vencimento)) +
        ' ' + (l.t.hora || '00:00');
    };
    lista.sort(function (a, b) {
      const x = chave(a), y = chave(b);
      const r = (typeof x === 'number') ? x - y : String(x).localeCompare(String(y));
      return f.crescente ? r : -r;
    });
    return lista;
  }

  function chipsDoFiltro() {
    const f = tarefasFiltro;
    const chips = [];
    const eu = global.IADAuth.atual();
    const chip = function (rotulo, acao) {
      return '<span class="chip">' + esc(rotulo) +
        '<button type="button" onclick="App.tarefasLimpar(\'' + acao + '\')" aria-label="Remover filtro">✕</button></span>';
    };

    if (f.responsavel === 'meu') chips.push(chip(eu ? eu.nome : 'Minhas tarefas', 'responsavel'));
    else if (f.responsavel !== 'todos') {
      const u = global.IADAuth.usuarios().filter(function (x) { return x.id === f.responsavel; })[0];
      chips.push(chip(u ? u.nome : 'Responsável', 'responsavel'));
    }
    if (f.de || f.ate) {
      chips.push(chip('Agendamento: ' + (f.de ? U.data(f.de) : '…') + ' – ' + (f.ate ? U.data(f.ate) : '…'), 'periodo'));
    }
    if (f.empresa) {
      const c = Store.conta(f.empresa);
      chips.push(chip(c ? c.nome : 'Empresa', 'empresa'));
    }
    if (f.negocio) {
      const o = Store.oportunidade(f.negocio);
      chips.push(chip(o ? o.titulo : 'Negociação', 'negocio'));
    }
    f.tipos.forEach(function (t) { chips.push(chip(t, 'tipo:' + t)); });
    if (f.status !== 'todos') {
      const s = STATUS_TAREFA.filter(function (x) { return x[0] === f.status; })[0];
      chips.push(chip(s ? s[1] : f.status, 'status'));
    }
    if (f.busca) chips.push(chip('“' + f.busca + '”', 'busca'));
    return chips.join('');
  }

  /* O resumo da semana existe para responder, antes de qualquer filtro, a
     pergunta com que o vendedor abre a tela: em que pé eu estou? */
  function resumoDaSemana() {
    const eu = global.IADAuth.atual();
    const hoje = Store.hoje();
    const limite = new Date(); limite.setDate(limite.getDate() + 7);
    const emSete = limite.toISOString().slice(0, 10);
    const inicio = new Date(); inicio.setDate(inicio.getDate() - 7);
    const seteAtras = inicio.toISOString().slice(0, 10);

    const minhas = tarefasComContexto().filter(function (l) {
      return !l.t.donoId || !eu || l.t.donoId === eu.id;
    });
    const atrasadas = minhas.filter(function (l) { return statusDaTarefa(l.t) === 'atrasada'; });
    const hojeAte = minhas.filter(function (l) {
      return l.t.status === 'aberta' && l.t.vencimento >= hoje && l.t.vencimento <= emSete;
    });
    const feitas = minhas.filter(function (l) {
      return l.t.status !== 'aberta' && (l.t.concluidaEm || '') >= seteAtras;
    });
    const semRelato = feitas.filter(function (l) { return l.t.semRegistro; });

    const valorParado = atrasadas.reduce(function (s, l) { return s + ((l.op && l.op.valor) || 0); }, 0);

    /* O número que fecha o ciclo: das tarefas concluídas, quanto de decisão
       de fato andou. Tarefa fechada é esforço; ponto de IAD é resultado, e é
       ele que diz se as tarefas da semana valeram alguma coisa. */
    const negocios = {};
    feitas.forEach(function (l) { if (l.op) negocios[l.op.id] = l.op; });
    const pontos = Object.keys(negocios).reduce(function (soma, id) {
      return soma + Math.max(0, E.deltaSemana(negocios[id]).iadDelta);
    }, 0);

    const numero = function (n, rotulo, classe) {
      return '<div class="kpi-tarefa"><strong class="' + (classe || '') + '">' + n + '</strong>' +
        '<span class="tiny muted">' + esc(rotulo) + '</span></div>';
    };

    return '<details class="card resumo-tarefas"' + (tarefasFiltro.resumoAberto ? ' open' : '') +
      ' ontoggle="App.tarefasResumo(this.open)">' +
      '<summary><strong>Resumo das tarefas da semana</strong></summary>' +
      '<div class="row kpis-tarefa">' +
      numero(atrasadas.length, 'atrasadas', atrasadas.length ? 'atrasado' : '') +
      numero(hojeAte.length, 'nos próximos 7 dias') +
      numero(feitas.length, 'concluídas nos últimos 7 dias') +
      numero('+' + pontos, 'pontos de decisão que andaram', pontos ? 'subiu' : 'muted') +
      numero(semRelato.length, 'fechadas sem relato', semRelato.length ? 'atrasado' : '') +
      '<div class="kpi-tarefa"><strong>' + U.moeda(valorParado) + '</strong>' +
      '<span class="tiny muted">em negócios com tarefa atrasada</span></div>' +
      '</div>' +
      (semRelato.length
        ? '<p class="aviso" style="margin:10px 0 0">' + semRelato.length +
          (semRelato.length === 1 ? ' tarefa foi fechada' : ' tarefas foram fechadas') +
          ' sem contar o que aconteceu. Elas moveram o funil e não moveram nenhuma das oito decisões. ' +
          '<button class="btn ghost mini" onclick="App.tarefasStatus(\'sem-registro\')">Ver e completar</button></p>'
        : '') +
      '</details>';
  }

  /* O que esta tarefa deveria destravar. É a ponte entre a lista e o método:
     sem ela a tela vira agenda, e agenda não faz conta andar. */
  function faltaNaLinha(linha) {
    if (!linha.op) return '<span class="tiny muted">sem negócio</span>';
    const alvo = P.DIMENSOES.filter(function (d) { return d.id === linha.t.decisaoAlvo; })[0];
    const lacunas = E.lacunas(linha.op);
    const primeira = lacunas[0];
    if (alvo) {
      const nota = linha.op.dims[alvo.id] || 0;
      return '<span class="tiny">' + esc(alvo.nome) + ' <span class="muted">' + nota + '/2</span></span>';
    }
    if (!primeira) return '<span class="tiny muted">nada em aberto</span>';
    return '<span class="tiny muted">falta: ' + esc(primeira.dimensao ? primeira.dimensao.nome : primeira.tipo) + '</span>';
  }

  function linhaDeTarefa(linha) {
    const t = linha.t, op = linha.op, conta = linha.conta;
    const situacao = statusDaTarefa(t);
    const rot = ROTULO_STATUS[situacao];
    const dono = global.IADAuth.usuarios().filter(function (u) { return u.id === t.donoId; })[0];
    const quando = t.status === 'aberta' ? t.vencimento : (t.concluidaEm || t.vencimento);
    const marcada = !!tarefasMarcadas[t.id];

    return '<tr class="' + (marcada ? 'marcada' : '') + '">' +
      '<td class="col-marca"><input type="checkbox" data-tarefa="' + t.id + '"' + (marcada ? ' checked' : '') +
      ' onchange="App.tarefasMarcar(\'' + t.id + '\',this.checked)" aria-label="Selecionar"></td>' +

      '<td class="col-tarefa"><span class="icone-tipo" title="' + esc(t.tipo || '') + '">' + iconeDoTipo(t.tipo) + '</span> ' +
      (op
        ? '<a href="#/op/' + op.id + '"><strong>' + esc(t.titulo) + '</strong></a>'
        : '<strong>' + esc(t.titulo) + '</strong>') +
      (t.adiamentos ? '<span class="tiny atrasado"> · adiada ' + t.adiamentos + 'x</span>' : '') +
      (t.status !== 'aberta' && t.comRelato ? '<span class="tiny muted"> · com relato</span>' : '') +
      (t.descricao ? '<span class="tiny muted">' + esc(t.descricao.slice(0, 120)) +
        (t.descricao.length > 120 ? '…' : '') + '</span>' : '') +
      '</td>' +

      '<td><span class="pill ' + rot[1] + '">' + rot[0] + '</span></td>' +
      '<td class="nowrap">' + U.data(quando) + (t.hora ? ' <span class="tiny muted">às ' + esc(t.hora) + '</span>' : '') + '</td>' +
      '<td><span class="avatar" title="' + esc(dono ? dono.nome : 'sem responsável') + '">' +
      esc(dono ? iniciaisDe(dono.nome) : '—') + '</span></td>' +

      '<td class="col-negocio">' + (op
        ? '<a href="#/op/' + op.id + '">' + esc(op.titulo) + '</a>' +
          '<span class="tiny muted">' + esc(conta ? conta.nome : '') + '</span>'
        : '<span class="tiny muted">—</span>') + '</td>' +

      '<td>' + faltaNaLinha(linha) + '</td>' +
      '<td class="right nowrap">' + U.moeda(op ? op.valor : 0) + '</td>' +
      '<td class="nowrap">' +
      (t.status === 'aberta' && op
        ? '<button class="btn mini" onclick="App.concluirComRelato(\'' + op.id + '\',\'' + t.id + '\')"' +
          ' data-ajuda-titulo="Concluir contando o que aconteceu" data-ajuda="É aqui que a conta anda: o assistente lê o que você escrever e anexar, separa o que o CLIENTE fez e relê as oito decisões.">Concluir</button>'
        : '') +
      '<button class="btn ghost mini" onclick="App.editarTarefa(\'' + t.id + '\')">Editar</button>' +
      '</td></tr>';
  }

  function barraDeLote(total) {
    const n = Object.keys(tarefasMarcadas).length;
    if (!n) return '';
    return '<div class="barra-lote">' +
      '<strong>' + n + ' selecionada' + (n > 1 ? 's' : '') + '</strong>' +
      '<button class="link" onclick="App.tarefasLimparSelecao()">Limpar seleção</button>' +
      '<span class="espaco"></span>' +
      '<button class="link" onclick="App.tarefasAdiar()">Adiar</button>' +
      '<button class="link" onclick="App.tarefasAtribuir()">Atribuir responsável</button>' +
      '<button class="link verde" onclick="App.tarefasConcluir()"' +
      ' data-ajuda-titulo="Concluir em lote" data-ajuda="Fechar em lote não move nenhuma das oito decisões — quem move é o que o cliente fez, e isso está no relato. O app pergunta antes e oferece contar uma a uma.">Marcar como concluída</button>' +
      '</div>' +
      (n < total
        ? '<div class="lote-tudo"><label><input type="checkbox" onchange="App.tarefasMarcarTudo(this.checked)"> ' +
          'Selecionar todas as ' + total + ' tarefas deste filtro</label></div>'
        : '');
  }

  function tarefas() {
    const eu = global.IADAuth.atual();
    const f = tarefasFiltro;
    const lista = tarefasFiltradas();
    const paginas = Math.max(1, Math.ceil(lista.length / f.porPagina));
    const pagina = Math.min(f.pagina, paginas);
    const daPagina = lista.slice((pagina - 1) * f.porPagina, pagina * f.porPagina);

    const usuarios = global.IADAuth.usuarios();
    const tipos = Store.nomesDoCatalogo('tiposTarefa');

    const opcaoResponsavel = [{ valor: 'meu', rotulo: 'Minhas tarefas' }, { valor: 'todos', rotulo: 'Todas as pessoas' }]
      .concat(usuarios.map(function (u) { return { valor: u.id, rotulo: u.nome }; }))
      .map(function (o) {
        return '<option value="' + esc(o.valor) + '"' + (f.responsavel === o.valor ? ' selected' : '') + '>' +
          esc(o.rotulo) + '</option>';
      }).join('');

    /* Só as empresas que têm tarefa: filtro que oferece cem empresas onde
       noventa não têm nada é ruído com cara de opção. */
    const comTarefa = {};
    tarefasComContexto().forEach(function (l) { if (l.conta) comTarefa[l.conta.id] = l.conta; });
    const empresas = Object.keys(comTarefa).map(function (k) { return comTarefa[k]; })
      .sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome)); });

    const opcaoEmpresa = [{ valor: '', rotulo: 'Todas as empresas' }]
      .concat(empresas.map(function (c) { return { valor: c.id, rotulo: c.nome }; }))
      .map(function (o) {
        return '<option value="' + esc(o.valor) + '"' + (f.empresa === o.valor ? ' selected' : '') + '>' +
          esc(o.rotulo) + '</option>';
      }).join('');

    /* A negociação segue a empresa: uma empresa tem várias, e listar as da
       carteira inteira aqui devolveria o problema que a cascata resolve. */
    const negocios = f.empresa
      ? Store.dados().oportunidades.filter(function (o) { return o.contaId === f.empresa; })
      : [];
    const opcaoNegocio = [{ valor: '', rotulo: f.empresa ? 'Todas as negociações' : 'Escolha a empresa' }]
      .concat(negocios.map(function (o) { return { valor: o.id, rotulo: o.titulo + ' · ' + o.etapa }; }))
      .map(function (o) {
        return '<option value="' + esc(o.valor) + '"' + (f.negocio === o.valor ? ' selected' : '') + '>' +
          esc(o.rotulo) + '</option>';
      }).join('');

    const opcaoStatus = STATUS_TAREFA.map(function (sx) {
      return '<option value="' + sx[0] + '"' + (f.status === sx[0] ? ' selected' : '') + '>' +
        sx[2] + ' ' + esc(sx[1]) + '</option>';
    }).join('');

    const caixasTipo = tipos.map(function (t) {
      return '<label class="caixa-tipo"><input type="checkbox"' +
        (f.tipos.indexOf(t) !== -1 ? ' checked' : '') +
        ' onchange="App.tarefasTipo(\'' + esc(t).replace(/'/g, '&#39;') + '\',this.checked)"> ' +
        iconeDoTipo(t) + ' ' + esc(t) + '</label>';
    }).join('');

    const ordenar = function (chave, rotulo, extra) {
      const ativo = f.ordem === chave;
      return '<th class="' + (extra || '') + '"><button class="ordenador' + (ativo ? ' ativo' : '') +
        '" onclick="App.tarefasOrdenar(\'' + chave + '\')">' + esc(rotulo) +
        (ativo ? (f.crescente ? ' ▲' : ' ▼') : '') + '</button></th>';
    };

    const corpo = daPagina.map(linhaDeTarefa).join('') ||
      '<tr><td colspan="9"><div class="vazio small">Nenhuma tarefa neste filtro.</div></td></tr>';

    return '<div class="row" style="align-items:center">' +
      '<h1 style="margin:0">Tarefas</h1><span class="espaco"></span>' +
      '<button class="btn ghost mini" onclick="IADUI.fecharDialogos();location.hash=\'#/playbook\'"' +
      ' data-ajuda-titulo="O método" data-ajuda="Por que concluir uma tarefa sem contar o que aconteceu não move nenhuma das oito decisões.">? Método</button>' +
      '<button class="btn" onclick="App.novaTarefaLivre()">+ Criar tarefa</button></div>' +

      '<div class="filtros-tarefa">' +
      '<label class="campo mini"><span>Responsável</span>' +
      '<select onchange="App.tarefasResponsavel(this.value)">' + opcaoResponsavel + '</select></label>' +
      '<label class="campo mini"><span>Empresa</span>' +
      '<select onchange="App.tarefasEmpresa(this.value)">' + opcaoEmpresa + '</select></label>' +
      '<label class="campo mini"><span>Negociação</span>' +
      '<select onchange="App.tarefasNegocio(this.value)"' + (f.empresa ? '' : ' disabled') + '>' +
      opcaoNegocio + '</select></label>' +
      '<label class="campo mini"><span>De</span><input type="date" value="' + esc(f.de) +
      '" onchange="App.tarefasPeriodo(this.value, null)"></label>' +
      '<label class="campo mini"><span>Até</span><input type="date" value="' + esc(f.ate) +
      '" onchange="App.tarefasPeriodo(null, this.value)"></label>' +
      '<label class="campo mini"><span>Status</span>' +
      '<select onchange="App.tarefasStatus(this.value)">' + opcaoStatus + '</select></label>' +
      '<label class="campo mini cresce"><span>Buscar</span><input type="search" value="' + esc(f.busca) +
      '" placeholder="tarefa, empresa ou negócio" oninput="App.tarefasBusca(this.value)"></label>' +
      '</div>' +

      (tipos.length ? '<details class="tipos-tarefa"><summary>Tipos de tarefa' +
        (f.tipos.length ? ' <span class="pill navy">' + f.tipos.length + '</span>' : ' <span class="tiny muted">todos</span>') +
        '</summary><div class="row">' + caixasTipo + '</div></details>' : '') +

      '<div class="row chips">' + chipsDoFiltro() + '</div>' +

      resumoDaSemana() +

      barraDeLote(lista.length) +

      '<div class="card" style="padding:0"><div class="tabela-rolagem"><table class="tabela-tarefas"><thead><tr>' +
      '<th class="col-marca"><input type="checkbox" onchange="App.tarefasMarcarPagina(this.checked)" aria-label="Selecionar a página"></th>' +
      '<th class="col-tarefa">Tarefa</th><th>Status</th>' +
      ordenar('data', 'Data e hora', 'nowrap') +
      '<th>Responsável</th>' +
      ordenar('empresa', 'Negociação') +
      '<th>O que ela destrava</th>' +
      ordenar('valor', 'Valor', 'right') +
      '<th></th>' +
      '</tr></thead><tbody>' + corpo + '</tbody></table></div></div>' +

      '<div class="row paginacao">' +
      '<span class="tiny muted">Exibindo ' + daPagina.length + ' de ' + lista.length +
      (lista.length === 1 ? ' tarefa' : ' tarefas') + '</span>' +
      '<select onchange="App.tarefasPorPagina(this.value)">' +
      [10, 25, 50, 100].map(function (n) {
        return '<option value="' + n + '"' + (f.porPagina === n ? ' selected' : '') + '>' + n + ' por página</option>';
      }).join('') + '</select>' +
      '<span class="espaco"></span>' +
      '<button class="btn ghost mini"' + (pagina <= 1 ? ' disabled' : '') +
      ' onclick="App.tarefasPagina(' + (pagina - 1) + ')">Anterior</button>' +
      '<span class="tiny muted">' + pagina + ' / ' + paginas + '</span>' +
      '<button class="btn ghost mini"' + (pagina >= paginas ? ' disabled' : '') +
      ' onclick="App.tarefasPagina(' + (pagina + 1) + ')">Próxima</button>' +
      '</div>';
  }

  /* ---------------- Revisão semanal ---------------- */
  function revisao() {
    const est = Store.dados();
    const resumos = est.oportunidades
      .filter(function (o) { return !o.desfecho; })
      .map(E.resumo)
      .sort(function (a, b) { return b.evidenceAge - a.evidenceAge; });

    if (!resumos.length) return '<h1>Revisão semanal</h1><div class="vazio">Sem oportunidades abertas.</div>';

    const cards = resumos.map(function (r) {
      const d = r.delta;
      const comp = r.compromisso;
      return '<div class="card"><div class="row"><h3 style="margin:0">' + esc(r.op.titulo) + '</h3><span class="espaco"></span>' +
        '<span class="pill ' + r.faixa.classe + '">' + r.evidenceAge + 'd</span></div>' +
        '<div class="small muted">' + esc((r.conta && r.conta.nome) || '') + ' · ' + esc(r.op.etapa) + ' · ' + U.compacto(r.op.valor) + ' · IAD ' + r.iad + '/' + P.IAD_MAXIMO + '</div>' +
        '<p class="small" style="margin-top:10px"><strong>O que mudou na decisão do cliente nos últimos 7 dias?</strong></p>' +
        (d.evidencias || d.mudancas.length
          ? '<ul class="small" style="margin:0 0 8px 18px">' +
            (d.mudancas.map(function (m) { return '<li>' + esc(m.nome) + ': ' + m.de + ' → ' + m.para + '</li>'; }).join('')) +
            '<li>' + d.evidencias + ' evidência(s) registrada(s)</li></ul>'
          : '<div class="aviso" style="margin-bottom:8px">Nada mudou. Sem evidência nova do lado do cliente, não houve avanço real.</div>') +
        (comp
          ? '<p class="tiny ' + (comp.vencido ? 'atrasado' : 'muted') + '">Compromisso: ' + esc(comp.texto) + ' — ' + U.data(comp.data) +
            (comp.vencido ? ' (vencido há ' + comp.diasAtraso + 'd)' : '') + '</p>'
          : '<p class="tiny atrasado">Sem próximo passo combinado com data.</p>') +
        '<p class="small muted">Próxima decisão a provocar: ' + esc(r.nbd.decisao) + '</p>' +
        '<div class="row"><button class="btn alt mini" onclick="App.novaTarefa(\'' + r.op.id + '\',\'\',{situacao:\'feita\'})" data-ajuda-titulo="Nova tarefa" data-ajuda="O que aconteceu com este cliente nesta semana. Se nada mudou do lado dele, não houve avanço — e é isso que a revisão quer expor.">+ Tarefa</button>' +
        '<button class="btn ghost mini" onclick="App.definirCompromisso(\'' + r.op.id + '\')" data-ajuda-titulo="Definir compromisso" data-ajuda="O próximo passo e a data. Sem isso o negócio fica no ar e o app marca em vermelho.">Definir compromisso</button>' +
        '<button class="btn ghost mini" onclick="App.abrir(\'' + r.op.id + '\')" data-ajuda-titulo="Abrir cockpit" data-ajuda="A tela completa do negócio: as oito decisões, lacunas, grupo comprador, gate e histórico.">Abrir cockpit</button></div></div>';
    }).join('');

    return '<h1>Revisão semanal</h1>' +
      '<p class="muted small">Uma pergunta só, por negócio. Respostas que começam com “nós” não valem.</p>' + cards;
  }

  /* ---------------- Contas e contatos ---------------- */
  function contas() {
    const est = Store.dados();
    if (!est.contas.length) {
      return '<div class="row"><h1>Contas</h1><span class="espaco"></span><button class="btn alt mini" onclick="App.novaConta()">+ Conta</button></div><div class="vazio">Nenhuma conta cadastrada.</div>';
    }
    const lista = est.contas.map(function (c) {
      const pessoas = Store.contatosDaConta(c.id);
      const ops = est.oportunidades.filter(function (o) { return o.contaId === c.id; });
      const abertas = ops.filter(function (o) { return !o.desfecho; });
      const valor = abertas.reduce(function (s, o) { return s + (o.valor || 0); }, 0);
      const ultima = abertas.map(function (o) { return E.evidenceAge(o); }).sort(function (a, b) { return a - b; })[0];

      const chips = pessoas.map(function (p) {
        return '<button class="pill" onclick="App.editarContato(\'' + p.id + '\')"><span class="dot ' + p.sentimento + '"></span>' + esc(p.nome) + ' · ' + esc(p.papel) + '</button>';
      }).join(' ') || '<span class="tiny muted">Nenhum contato.</span>';

      const local = [c.cidade, c.uf].filter(Boolean).join('/');
      const ficha = [c.segmento, c.porte, local, c.relacaoAtual].filter(Boolean).join(' · ');

      return '<div class="card"><div class="row"><h3 style="margin:0">' + esc(c.nome) + '</h3><span class="espaco"></span>' +
        '<span class="pill">' + abertas.length + ' aberta(s)</span>' +
        (valor ? '<span class="pill navy">' + U.compacto(valor) + '</span>' : '') + '</div>' +
        '<div class="tiny muted">' + esc(ficha || '—') + (ultima != null ? ' · última evidência há ' + ultima + 'd' : '') + '</div>' +
        '<div class="row" style="margin-top:10px">' + chips + '</div>' +
        '<div class="row" style="margin-top:10px"><button class="btn ghost mini" onclick="App.novoContato(\'' + c.id + '\')" data-ajuda-titulo="Novo contato" data-ajuda="Adiciona uma pessoa a esta empresa. O papel na compra e a posição alimentam a cobertura e os alertas.">+ Contato</button>' +
        '<button class="btn ghost mini" onclick="App.novaOportunidade(\'' + c.id + '\')">+ Oportunidade</button>' +
        '<button class="btn ghost mini" onclick="App.editarConta(\'' + c.id + '\')" data-ajuda="Muda os dados da empresa. O segmento aqui é o que agrupa o painel.">Editar</button></div></div>';
    }).join('');
    return '<div class="row"><h1>Contas</h1><span class="espaco"></span><button class="btn alt mini" onclick="App.novaConta()">+ Conta</button></div>' + lista;
  }

  /* ---------------- Cadastros ---------------- */
  const AJUDA_NOVO = {
    empresas: 'Cadastra uma conta — uma empresa cliente.', contatos: 'Cadastra uma pessoa e a liga a uma empresa.',
    oportunidades: 'Cria um negócio.', segmentos: 'Acrescenta um segmento à lista.',
    tiposTarefa: 'Acrescenta um tipo de tarefa.', produtos: 'Cadastra um produto com preço de referência.',
    usuarios: 'Cadastra um usuário neste aparelho. Com a nuvem ligada, as contas ficam no servidor.'
  };

  const AJUDA_CADASTRO = {
    empresas: 'As empresas clientes que você atende. Não confundir com as empresas que usam o sistema, que ficam no painel do administrador.',
    contatos: 'As pessoas. O papel na compra e a posição são o que alimenta a cobertura e os alertas do grupo comprador.',
    oportunidades: 'Os negócios. A etapa organiza o funil; quem mede o avanço são as oito decisões dentro de cada um.',
    segmentos: 'A lista que alimenta o campo Segmento das empresas e a análise por segmento no painel.',
    tiposTarefa: 'A lista de tipos que aparece ao criar uma tarefa.',
    produtos: 'O catálogo com preço de referência, para compor o valor das oportunidades.',
    usuarios: 'Quem tem acesso. Com a nuvem ligada, as contas ficam no servidor — cadastrar aqui só afeta este aparelho.'
  };

  /* "Empresa" era duas coisas com o mesmo nome: a empresa cliente e a empresa
     que usa o sistema. Aqui a aba passa a se chamar Contas — que é o cliente —,
     e as empresas do sistema ficam no painel do administrador, onde só ele mexe. */
  const ABAS_CADASTRO = [
    ['empresas', 'Contas'], ['contatos', 'Contatos'], ['oportunidades', 'Oportunidades'],
    ['segmentos', 'Segmentos'], ['tiposTarefa', 'Tipos de tarefa'], ['produtos', 'Produtos'],
    ['usuarios', 'Usuários']
  ];
  let abaCadastro = 'empresas';
  let buscaCadastro = '';

  function cadastros() {
    const est = Store.dados();
    const abas = ABAS_CADASTRO.map(function (a) {
      return '<button class="pill' + (abaCadastro === a[0] ? ' orange' : '') + '" onclick="App.abaCadastro(\'' + a[0] + '\')" data-ajuda="' + esc(AJUDA_CADASTRO[a[0]] || '') + '">' + esc(a[1]) + '</button>';
    }).join(' ');

    const criar = {
      empresas: 'App.novaConta()', contatos: 'App.novoContato()', oportunidades: 'App.novaOportunidade()',
      segmentos: "App.novoItemCatalogo('segmentos')", tiposTarefa: "App.novoItemCatalogo('tiposTarefa')",
      produtos: 'App.novoProduto()', usuarios: 'App.novoUsuario()'
    }[abaCadastro];

    const corpo = {
      empresas: listaEmpresas, contatos: listaContatos, oportunidades: listaOportunidades,
      segmentos: function (e) { return listaCatalogo(e, 'segmentos'); },
      tiposTarefa: function (e) { return listaCatalogo(e, 'tiposTarefa'); },
      produtos: listaProdutos, usuarios: listaUsuarios
    }[abaCadastro](est);

    /* Duas portas diferentes. Pessoa é do administrador. Produto é do gestor:
       mexer no preço de referência muda o valor de toda oportunidade que usar
       o item — não é trabalho do dia, é decisão comercial. Conta, contato e
       oportunidade continuam de todos, porque são o trabalho. */
    const podeCriar =
      abaCadastro === 'usuarios' ? global.IADAuth.ehAdmin() :
      abaCadastro === 'produtos' ? global.IADAuth.ehGestor() : true;

    return '<div class="row"><h1>Cadastros</h1><span class="espaco"></span>' +
      (podeCriar
        ? '<button class="btn alt mini" onclick="' + criar + '" data-ajuda="' + esc(AJUDA_NOVO[abaCadastro] || 'Cria um item nesta aba.') + '">+ Novo</button>'
        : '') + '</div>' +
      '<div class="row" style="margin:8px 0 10px">' + abas + '</div>' +
      '<input id="busca-cadastro" class="busca" type="search" placeholder="Buscar…" value="' + esc(buscaCadastro) +
      '" oninput="App.buscarCadastro(this.value)">' +
      corpo;
  }

  function combina(texto) {
    if (!buscaCadastro) return true;
    return String(texto || '').toLowerCase().indexOf(buscaCadastro.toLowerCase()) !== -1;
  }

  function tabela(colunas, linhas, vazio) {
    if (!linhas) return '<div class="vazio">' + esc(vazio) + '</div>';
    return '<div class="card" style="padding:0"><div class="tabela-rolagem"><table><thead><tr>' +
      colunas.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + linhas + '</tbody></table></div></div>';
  }

  function listaEmpresas(est) {
    const linhas = est.contas.filter(function (c) {
      return combina(c.nome) || combina(c.razaoSocial) || combina(c.cnpj) || combina(c.segmento) || combina(c.cidade);
    }).map(function (c) {
      const ops = est.oportunidades.filter(function (o) { return o.contaId === c.id && !o.desfecho; });
      const valor = ops.reduce(function (s, o) { return s + (o.valor || 0); }, 0);
      return '<tr><td><strong>' + esc(c.nome) + '</strong>' +
        (c.razaoSocial ? '<span class="tiny muted">' + esc(c.razaoSocial) + '</span>' : '') +
        (c.cnpj ? '<span class="tiny muted">' + esc(c.cnpj) + '</span>' : '') + '</td>' +
        '<td>' + esc(c.segmento || '—') + '</td>' +
        '<td>' + esc([c.cidade, c.uf].filter(Boolean).join('/') || '—') + '</td>' +
        '<td>' + esc(c.relacaoAtual || '—') + '</td>' +
        '<td class="right">' + Store.contatosDaConta(c.id).length + '</td>' +
        '<td class="right">' + ops.length + (valor ? '<span class="tiny muted">' + U.compacto(valor) + '</span>' : '') + '</td>' +
        '<td class="right" style="white-space:nowrap">' +
          '<button class="btn ghost mini" onclick="App.editarConta(\'' + c.id + '\')" data-ajuda="Muda os dados da empresa. O segmento aqui é o que agrupa o painel.">Editar</button> ' +
          '<button class="btn ghost mini" onclick="App.novoContato(\'' + c.id + '\')" data-ajuda-titulo="Novo contato" data-ajuda="Adiciona uma pessoa a esta empresa. O papel na compra e a posição alimentam a cobertura e os alertas.">+ Contato</button> ' +
          '<button class="btn ghost mini" onclick="App.novaOportunidade(\'' + c.id + '\')" data-ajuda-titulo="Nova oportunidade" data-ajuda="Cria um negócio para esta empresa. Os contatos já cadastrados entram no grupo comprador.">+ Op.</button> ' +
          '<button class="btn ghost mini" onclick="App.arquivosDaConta(\'' + c.id + '\')" data-ajuda-titulo="Documentos" data-ajuda="Contrato, proposta, laudo, planilha — o que ficar aqui continua ligado a esta empresa e pode ser aberto depois.">📎 Documentos</button>' +
        '</td></tr>';
    }).join('');
    return tabela(['Empresa', 'Segmento', 'Cidade', 'Relação', 'Contatos', 'Oportunidades', ''], linhas, 'Nenhuma empresa encontrada.');
  }

  function listaContatos(est) {
    const linhas = est.contatos.filter(function (c) {
      const conta = Store.conta(c.contaId);
      return combina(c.nome) || combina(c.cargo) || combina(c.email) || combina(conta && conta.nome);
    }).map(function (c) {
      const conta = Store.conta(c.contaId);
      const perfil = P.PERFIS.find(function (x) { return x.id === (c.perfil || 'nao_classificado'); });
      const classePerfil = { mobilizador: 'ok', falador: 'warn', bloqueador: 'dead' }[perfil.grupo] || '';
      return '<tr><td><strong>' + esc(c.nome) + '</strong>' +
        '<span class="tiny muted">' + esc(c.cargo || '—') + '</span></td>' +
        '<td>' + esc((conta && conta.nome) || '—') + '</td>' +
        '<td>' + esc(c.papel) + '</td>' +
        '<td>' + (perfil.grupo === 'indefinido' ? '<span class="tiny muted">sem perfil</span>'
          : '<span class="pill ' + classePerfil + '">' + esc(perfil.rotulo) + '</span>') + '</td>' +
        '<td><span class="dot ' + c.sentimento + '"></span><span class="tiny">' + esc(c.email || c.telefone || '—') + '</span></td>' +
        '<td class="right"><button class="btn ghost mini" onclick="App.editarContato(\'' + c.id + '\')" data-ajuda="Muda os dados da pessoa, inclusive papel na compra, posição e perfil Challenger.">Editar</button></td></tr>';
    }).join('');
    return tabela(['Contato', 'Empresa', 'Papel', 'Perfil', 'Contato', ''], linhas, 'Nenhum contato encontrado.');
  }

  function listaOportunidades(est) {
    const linhas = est.oportunidades.filter(function (o) {
      const conta = Store.conta(o.contaId);
      return combina(o.titulo) || combina(conta && conta.nome) || combina(o.etapa);
    }).sort(function (a, b) { return (b.valor || 0) - (a.valor || 0); }).map(function (o) {
      const conta = Store.conta(o.contaId);
      const r = E.resumo(o);
      return '<tr><td><strong>' + esc(o.titulo) + '</strong>' +
        '<span class="tiny muted">' + esc(o.tipo || '') + '</span></td>' +
        '<td>' + esc((conta && conta.nome) || '—') + '</td>' +
        '<td>' + (o.desfecho ? '<span class="pill">encerrada</span>' : esc(o.etapa)) + '</td>' +
        '<td class="right">' + U.compacto(o.valor) + '</td>' +
        '<td class="right">' + r.iad + '/' + P.IAD_MAXIMO + '</td>' +
        '<td class="right" style="white-space:nowrap">' +
          '<button class="btn ghost mini" onclick="App.abrir(\'' + o.id + '\')">Abrir</button> ' +
          '<button class="btn ghost mini" onclick="App.editarOportunidade(\'' + o.id + '\')">Editar</button></td></tr>';
    }).join('');
    return tabela(['Oportunidade', 'Empresa', 'Etapa', 'Valor', 'IAD', ''], linhas, 'Nenhuma oportunidade encontrada.');
  }

  /* Listas longas separadas por ponto e vírgula viram etiquetas: o vendedor
     bate o olho e acha "frigoríficos" sem ler a linha inteira. Um parágrafo
     corrido de quinze itens ninguém lê — e é justamente para ser consultado
     de relance que este cadastro existe. */
  function etiquetas(texto) {
    const itens = String(texto || '').split(';').map(function (t) { return t.trim(); })
      .filter(function (t) { return t; });
    if (!itens.length) return '<span class="tiny muted">—</span>';
    return '<div class="etiquetas">' + itens.map(function (t) {
      return '<span>' + esc(t) + '</span>';
    }).join('') + '</div>';
  }

  function listaCatalogo(est, nome) {
    const usos = function (item) {
      if (nome === 'segmentos') return est.contas.filter(function (c) { return c.segmento === item.nome; }).length;
      return est.tarefas.filter(function (t) { return t.tipo === item.nome; }).length;
    };
    /* A busca do segmento vale para os três campos novos: procurar
       "frigorífico" e não achar Alimentos seria pior do que não ter busca. */
    const cabe = function (i) {
      if (combina(i.nome)) return true;
      if (nome !== 'segmentos') return false;
      return combina(i.subsegmentos) || combina(i.oportunidades) || combina(i.personas);
    };
    const acoes = function (i) {
      return '<td class="right" style="white-space:nowrap">' +
        '<button class="btn ghost mini" onclick="App.editarItemCatalogo(\'' + nome + '\',\'' + i.id + '\')">Editar</button> ' +
        '<button class="btn ghost mini" onclick="App.excluirItemCatalogo(\'' + nome + '\',\'' + i.id + '\')">Excluir</button></td>';
    };
    const situacao = function (i) {
      return '<td>' + (i.ativo === false ? '<span class="pill">inativo</span>' : '<span class="pill ok">ativo</span>') + '</td>';
    };

    const itens = Store.catalogo(nome).filter(cabe);

    if (nome === 'segmentos') {
      const linhas = itens.map(function (i) {
        return '<tr><td style="min-width:150px"><strong>' + esc(i.nome) + '</strong>' +
          '<span class="tiny muted">' + usos(i) + ' conta' + (usos(i) === 1 ? '' : 's') + '</span></td>' +
          '<td>' + etiquetas(i.subsegmentos) + '</td>' +
          '<td>' + etiquetas(i.oportunidades) + '</td>' +
          '<td>' + etiquetas(i.personas) + '</td>' +
          situacao(i) + acoes(i) + '</tr>';
      }).join('');
      return '<p class="tiny muted" style="margin:0 0 8px">Os segmentos são <strong>desta empresa</strong>. ' +
        'Outra empresa no sistema tem os seus, e uma não enxerga os da outra.</p>' +
        tabela(['Segmento', 'Subsegmentos', 'Oportunidades', 'Principais personas', 'Situação', ''],
          linhas, 'Nenhum segmento cadastrado ainda.');
    }

    const linhas = itens.map(function (i) {
      return '<tr><td><strong>' + esc(i.nome) + '</strong></td>' +
        situacao(i) +
        '<td class="right">' + usos(i) + '</td>' +
        acoes(i) + '</tr>';
    }).join('');
    return tabela(['Tipo de tarefa', 'Situação', 'Em uso', ''], linhas, 'Nada cadastrado ainda.');
  }

  function listaProdutos(est) {
    const linhas = Store.catalogo('produtos').filter(function (p) {
      return combina(p.nome) || combina(p.sku) || combina(p.categoria);
    }).map(function (p) {
      const usos = est.oportunidades.filter(function (o) {
        return (o.itens || []).some(function (i) { return i.produtoId === p.id; });
      }).length;
      return '<tr><td><strong>' + esc(p.nome) + '</strong>' +
        (p.descricao ? '<span class="tiny muted">' + esc(p.descricao) + '</span>' : '') + '</td>' +
        '<td>' + esc(p.sku || '—') + '</td>' +
        '<td>' + esc(p.categoria || '—') + '</td>' +
        '<td>' + esc(p.unidade || '—') + '</td>' +
        '<td class="right">' + (p.precoReferencia ? U.moeda(p.precoReferencia) : '—') + '</td>' +
        '<td class="right">' + usos + '</td>' +
        '<td class="right" style="white-space:nowrap">' +
          (global.IADAuth.ehGestor()
            ? '<button class="btn ghost mini" onclick="App.editarProduto(\'' + p.id + '\')">Editar</button> '
            : '<span class="tiny muted" data-ajuda="Produtos são do catálogo da empresa: só o gestor cadastra e edita.">só o gestor edita</span>') +
          (global.IADAuth.ehGestor()
            ? '<button class="btn ghost mini" onclick="App.excluirItemCatalogo(\'produtos\',\'' + p.id + '\')">Excluir</button>'
            : '') + '</td></tr>';
    }).join('');
    return tabela(['Produto', 'SKU', 'Categoria', 'Unidade', 'Preço de referência', 'Em uso', ''], linhas, 'Nenhum produto cadastrado.');
  }

  function listaUsuarios() {
    const A = global.IADAuth;
    const eu = A.atual();
    const todos = A.usuarios().filter(function (u) {
      if (A.ehAdmin()) return true;
      return u.tenantId === (eu && eu.tenantId);
    }).filter(function (u) {
      const t = A.tenant(u.tenantId);
      return combina(u.nome) || combina(u.email) || combina(u.login) || combina(t && t.nome);
    });

    const podeAdministrar = A.ehAdmin();

    const linhas = todos.map(function (u) {
      const t = A.tenant(u.tenantId);
      const souEu = eu && eu.id === u.id;
      return '<tr><td><strong>' + esc(u.nome || '—') + (souEu ? ' <span class="pill">você</span>' : '') + '</strong>' +
        '<span class="tiny muted">' + esc(u.login ? 'login: ' + u.login : u.email) + '</span></td>' +
        '<td>' + esc(u.papel === 'admin' ? 'Todas as empresas' : ((t && t.nome) || '—')) + '</td>' +
        '<td>' + esc(u.email || '—') + '</td>' +
        '<td>' + esc(u.whatsapp || '—') + '</td>' +
        /* Só existiam dois papéis aqui, e Gestor aparecia como Usuário — o
           servidor certo e a tela errada, que é a divergência que ninguém
           confere porque as duas telas nunca ficam lado a lado. */
        '<td><span class="pill' + (u.papel === 'admin' ? ' navy' : '') + '">' +
          esc(rotuloDoPapel(u.papel)) + '</span></td>' +
        '<td>' + (u.ativo === false ? '<span class="pill dead">inativo</span>'
          : (u.emailConfirmado ? '<span class="pill ok">ativo</span>' : '<span class="pill warn">e-mail pendente</span>')) + '</td>' +
        /* Quem não administra editava e excluía qualquer linha que enxergasse
           — inclusive a própria conta, que é como alguém se apaga do sistema
           sem querer. Agora: editar, só a sua; excluir e criar, só quem
           administra. Isto é o espelho da regra do servidor, não a regra: lá
           quem decide são as políticas do banco. */
        '<td class="right" style="white-space:nowrap">' +
          ((podeAdministrar || souEu)
            ? '<button class="btn ghost mini" onclick="App.editarUsuario(\'' + u.id + '\')"' +
              ' data-ajuda="' + (souEu ? 'Corrige os seus dados neste aparelho.' : 'Corrige os dados desta pessoa neste aparelho.') + '">Editar</button>'
            : '') +
          ((podeAdministrar && !souEu && u.papel !== 'admin')
            ? ' <button class="btn ghost mini" onclick="App.excluirUsuario(\'' + u.id + '\')"' +
              ' data-ajuda="Remove esta pessoa deste aparelho. A conta no servidor continua existindo — lá o caminho é bloquear.">Excluir</button>'
            : '') +
        '</td></tr>';
    }).join('');

    /* Com a nuvem no comando, criar usuário aqui não cria conta nenhuma: quem
       guarda contas é o Supabase. Para o administrador existe a tela de baixo,
       que lê e edita os perfis do servidor; para os demais, fica o aviso. */
    const N = global.IADNuvem;
    const aviso = N.mandaNoAcesso()
      ? (N.souAdminNaNuvem()
          ? '<div id="usuarios-nuvem"><p class="tiny muted">Carregando os usuários do servidor…</p></div>' +
            '<p class="tiny muted" style="margin:14px 0 6px">Abaixo, os usuários deste aparelho — não são contas do servidor.</p>'
          : '<div class="aviso" style="margin-bottom:12px">As contas ficam no servidor, e ' +
            'quem cria, bloqueia e muda papéis é quem administra o sistema. ' +
            'Para incluir alguém na sua equipe, peça a ele.</div>')
      : '';

    return aviso + tabela(['Usuário', 'Empresa', 'E-mail', 'WhatsApp', 'Papel', 'Situação', ''], linhas, 'Nenhum usuário encontrado.');
  }

  /* Painel do administrador: os usuários que existem no servidor, com a empresa
     de cada um editável. É o que substitui escrever SQL para incluir alguém —
     e é ali que os enganos aconteciam. */
  function listaUsuariosNuvem(perfis, empresas, eu) {
    if (!perfis) return '<p class="tiny muted">Carregando os usuários do servidor…</p>';
    if (perfis.erro) {
      return '<div class="aviso">Não foi possível ler os usuários do servidor: ' + esc(perfis.erro) + '</div>';
    }
    if (!perfis.length) return '<div class="vazio small">Nenhum usuário no servidor.</div>';

    const opcoes = function (atual) {
      return '<option value="">— sem empresa —</option>' +
        empresas.map(function (t) {
          return '<option value="' + esc(t.id) + '"' + (t.id === atual ? ' selected' : '') + '>' + esc(t.nome) + '</option>';
        }).join('');
    };

    const linhas = perfis.map(function (p) {
      const souEu = eu && p.id === eu;
      /* Nome vazio acontece com quem entrou pelo convite antes da correção 8:
         a conta do GoTrue nasce só com o e-mail. Um traço sozinho não diz de
         quem é a linha, e a própria pessoa só consertaria entrando — o que ela
         talvez ainda não consiga. Então quem administra escreve o nome aqui. */
      const bloqueado = p.ativo === false;
      return '<tr' + (bloqueado ? ' class="bloqueada"' : '') + '><td>' +
        '<strong>' + esc(p.nome || 'Sem nome') + (souEu ? ' <span class="pill">você</span>' : '') + '</strong>' +
        '<span class="tiny muted">' + esc(p.id.slice(0, 8)) + '…</span></td>' +
        '<td><select onchange="App.empresaDoPerfil(\'' + p.id + '\', this.value)"' +
          ' data-ajuda="Liga esta pessoa a uma empresa. É a empresa que decide qual carteira ela enxerga.">' +
          opcoes(p.tenant_id) + '</select></td>' +
        '<td><select onchange="App.papelDoPerfil(\'' + p.id + '\', this.value)"' +
          (souEu ? ' disabled' : '') +
          ' data-ajuda="Usuário vê só a própria carteira. Gestor vê a de toda a empresa. Administrador vê todas as empresas e move pessoas entre elas.">' +
          '<option value="usuario"' + (p.papel === 'usuario' || !p.papel ? ' selected' : '') + '>Usuário — vê o que é dele</option>' +
          '<option value="gestor"' + (p.papel === 'gestor' ? ' selected' : '') + '>Gestor — vê a empresa inteira</option>' +
          '<option value="admin"' + (p.papel === 'admin' ? ' selected' : '') + '>Administrador — vê todas as empresas</option>' +
          '</select></td>' +
        /* A coluna dizia "ativo" para todo mundo, olhando só se a pessoa tinha
           empresa. Agora ela diz o que de fato decide a entrada — e as duas
           informações são diferentes: dá para estar liberada e sem empresa. */
        '<td>' + (bloqueado
          ? '<span class="pill warn">bloqueado</span>'
          : (p.tenant_id ? '<span class="pill ok">ativo</span>' : '<span class="pill warn">sem empresa</span>')) + '</td>' +
        '<td class="right" style="white-space:nowrap">' +
        '<button class="btn ghost mini" onclick="App.editarPessoaNuvem(\'' + p.id + '\')"' +
        ' data-ajuda="Corrige o nome e o WhatsApp desta pessoa. Serve para quem entrou pelo convite e chegou sem nome.">Editar</button> ' +
        (souEu
          ? '<span class="tiny muted" data-ajuda="Bloquear a si mesmo trancaria o sistema por fora: não sobraria quem desbloqueasse.">—</span>'
          : '<button class="btn ' + (bloqueado ? 'alt' : 'ghost') + ' mini"' +
            ' onclick="App.bloquearPessoa(\'' + p.id + '\', ' + (bloqueado ? 'true' : 'false') + ')"' +
            ' data-ajuda-titulo="' + (bloqueado ? 'Desbloquear' : 'Bloquear') + '"' +
            ' data-ajuda="' + (bloqueado
              ? 'Devolve o acesso desta pessoa. Ela volta a ver o que era dela — nada foi apagado.'
              : 'Tira o acesso desta pessoa. Ela não entra mais, e os registros dela continuam na empresa. Dá para desbloquear depois.') + '">' +
            (bloqueado ? 'Desbloquear' : 'Bloquear') + '</button>') +
        '</td></tr>';
    }).join('');

    return listaEmpresasDoSistema(empresas) +
      '<div class="card" style="margin-bottom:14px"><div class="row"><h3 style="margin:0">Usuários no servidor</h3>' +
      '<span class="espaco"></span><span class="pill navy">administrador</span>' +
      '<button class="btn alt mini" onclick="App.novaEmpresaNuvem()"' +
      ' data-ajuda-titulo="Nova empresa" data-ajuda="Cria uma empresa no servidor. Só quem administra pode.">+ Empresa</button>' +
      '<button class="btn alt mini" onclick="App.convidarPessoa()"' +
      ' data-ajuda-titulo="Registrar pessoa" data-ajuda="Reserva o e-mail da pessoa numa empresa. Quando ela criar o acesso, entra já ligada — sem escolher empresa e sem poder escolher errado.">+ Pessoa</button>' +
      '<button class="btn ghost mini" onclick="App.recarregarUsuariosNuvem()"' +
      ' data-ajuda="Relê a lista do servidor.">Atualizar</button></div>' +
      '<p class="tiny muted" style="margin:6px 0 10px">Quem está sem empresa entra no app mas não enxerga carteira nenhuma. ' +
      'Ligue a pessoa à empresa aqui em vez de escrever SQL.</p>' +
      tabela(['Pessoa', 'Empresa', 'Papel', 'Situação', ''], linhas, 'Nenhum usuário.') +
      listaConvites(arguments[3], empresas) + '</div>';
  }

  /* As empresas que USAM o sistema — não as empresas clientes, que são as
     Contas. Duas coisas diferentes que dividiam a mesma palavra e por isso
     produziram carteiras em empresas paralelas. */
  function listaEmpresasDoSistema(empresas) {
    if (!empresas || !empresas.length) return '';
    const linhas = empresas.map(function (t) {
      const bloqueada = t.ativo === false;
      return '<tr' + (bloqueada ? ' class="bloqueada"' : '') + '>' +
        '<td><strong>' + esc(t.nome) + '</strong></td>' +
        '<td>' + esc(t.cnpj || '—') + '</td>' +
        '<td>' + (bloqueada
          ? '<span class="pill warn">bloqueada</span>'
          : '<span class="pill ok">ativa</span>') + '</td>' +
        '<td class="tiny muted">' + esc(String(t.id).slice(0, 8)) + '…</td>' +
        '<td class="right" style="white-space:nowrap">' +
        '<button class="btn ghost mini" onclick="App.editarEmpresaNuvem(\'' + t.id + '\')"' +
        ' data-ajuda="Corrige o nome e o CNPJ desta empresa.">Editar</button> ' +
        '<button class="btn ' + (bloqueada ? 'alt' : 'ghost') + ' mini"' +
        ' onclick="App.bloquearEmpresa(\'' + t.id + '\', ' + (bloqueada ? 'true' : 'false') + ')"' +
        ' data-ajuda-titulo="' + (bloqueada ? 'Desbloquear empresa' : 'Bloquear empresa') + '"' +
        ' data-ajuda="' + (bloqueada
          ? 'Devolve o acesso da empresa inteira. Todo mundo dela volta a entrar — nada foi apagado.'
          : 'Tira o acesso de todo mundo desta empresa de uma vez. Só quem administra continua enxergando, e é quem pode desbloquear. Nenhum registro é apagado.') + '">' +
        (bloqueada ? 'Desbloquear' : 'Bloquear') + '</button></td></tr>';
    }).join('');
    return '<div class="card" style="margin-bottom:14px"><div class="row"><h3 style="margin:0">Empresas que usam o sistema</h3>' +
      '<span class="espaco"></span><span class="pill">' + empresas.length + '</span></div>' +
      '<p class="tiny muted" style="margin:6px 0 10px">Cada uma tem carteira separada: ninguém de uma enxerga a da outra. ' +
      'Não confundir com as <strong>Contas</strong>, que são as empresas clientes que sua equipe atende.</p>' +
      tabela(['Empresa', 'CNPJ', 'Situação', 'Identificador', ''], linhas, 'Nenhuma.') + '</div>';
  }

  /* Pessoas registradas que ainda não criaram o acesso. Ficar de olho nelas é o
     que evita a pergunta "cadastrei e não entrou" virar mistério. */
  /* Três papéis desde a correção 5. A lista mostrava só dois, e quem fosse
     convidado como Gestor aparecia como Usuário — o convite estava certo no
     banco e errado na tela, que é o tipo de divergência que ninguém confere. */
  function rotuloDoPapel(papel) {
    if (papel === 'admin') return 'Administrador';
    if (papel === 'gestor') return 'Gestor';
    return 'Usuário';
  }

  function listaConvites(convites, empresas) {
    if (!convites || !convites.length) return '';
    const nomeDa = function (id) {
      const t = empresas.find(function (x) { return x.id === id; });
      return t ? t.nome : '—';
    };
    const linhas = convites.map(function (c) {
      return '<tr><td><strong>' + esc(c.nome || '—') + '</strong>' +
        '<span class="tiny muted">' + esc(c.email) + '</span></td>' +
        '<td>' + esc(nomeDa(c.tenant_id)) + '</td>' +
        '<td>' + esc(rotuloDoPapel(c.papel)) + '</td>' +
        '<td class="right" style="white-space:nowrap">' +
        '<button class="btn alt mini" onclick="App.enviarConvite(\'' + esc(c.email) + '\')"' +
        ' data-ajuda-titulo="Enviar convite" data-ajuda="Manda o e-mail pelo servidor, com o link para a pessoa definir a senha. Se o envio automático ainda não estiver publicado, abre seu programa de e-mail com a mensagem pronta.">Enviar</button> ' +
        '<button class="btn ghost mini" onclick="App.copiarConvite(\'' + esc(c.email) + '\')"' +
        ' data-ajuda="Copia o texto do convite para colar no WhatsApp ou em outro lugar.">Copiar</button> ' +
        '<button class="btn ghost mini" onclick="App.cancelarConvite(\'' + esc(c.email) + '\')"' +
        ' data-ajuda="Cancela o registro. A pessoa ainda poderá criar acesso, mas entrará sem empresa.">Cancelar</button></td></tr>';
    }).join('');
    return '<h4 style="margin:18px 0 6px">Aguardando primeiro acesso</h4>' +
      '<p class="tiny muted" style="margin:0 0 8px">Já registradas. Quando criarem o acesso com este e-mail, entram direto na empresa indicada. ' +
      '<strong>Enviar</strong> manda o e-mail pelo servidor, com o link para a pessoa criar a senha dela. ' +
      'Enquanto o envio automático não estiver publicado, o botão abre seu programa de e-mail com a mensagem pronta.</p>' +
      tabela(['Pessoa', 'Empresa', 'Papel', ''], linhas, '');
  }

  /* ---------------- Playbook ---------------- */
  /* ---------------- O manual, dentro do app ----------------

     Existia um manual bom fora daqui, numa página na web. Fora daqui é o
     problema: este app funciona offline, é usado no carro depois da visita e
     no celular sem sinal, e o manual que só abre com internet é o manual que
     não está lá na hora da dúvida. Então ele mora aqui.

     A tela do Método já explicava o MÉTODO. O que faltava era o SISTEMA: o que
     cada tela faz, de onde sai cada número, e onde a IA entra e onde ela não
     entra. As duas coisas agora dividem a mesma tela, com um índice no alto —
     porque manual sem índice é manual que ninguém volta a abrir. */

  const SECOES_DO_MANUAL = [
    ['m-regra', 'A regra'],
    ['m-oito', 'As oito decisões'],
    ['m-avanco', 'Como o IAD anda'],
    ['m-faixas', 'O que o número diz'],
    ['m-etapas', 'O que cada etapa pede'],
    ['m-tarefa', 'Tudo entra por tarefa'],
    ['m-contar', 'Como contar o que aconteceu'],
    ['m-telas', 'As telas, uma a uma'],
    ['m-pipeline', 'Os grupos do pipeline'],
    ['m-tarefas', 'A tela de Tarefas'],
    ['m-aprendizado', 'Aprendizado e plano'],
    ['m-config', 'Configuração'],
    ['m-ia-vendedor', 'A IA no seu dia'],
    ['m-ia', 'As tarefas da IA'],
    ['m-limites', 'O que a IA não faz'],
    ['m-perfis', 'Quem move por dentro'],
    ['m-cadencia', 'As 8 decisões, canal a canal']
  ];

  function indiceDoManual() {
    return '<div class="card indice-manual"><h2 style="margin-top:0">Neste manual</h2>' +
      '<ol>' + SECOES_DO_MANUAL.map(function (s) {
        return '<li><a href="#/playbook" onclick="App.irNoManual(\'' + s[0] + '\');return false;">' +
          esc(s[1]) + '</a></li>';
      }).join('') + '</ol></div>';
  }

  /* Uma linha por tela, na ordem do menu. O que ela responde vem antes do que
     ela mostra: quem abre o manual está com uma pergunta, não com vontade de
     ler a lista de campos. */
  const TELAS = [
    ['⚡', 'Hoje', 'O que fazer agora.',
     'As tarefas do dia e o que está atrasado, com o negócio de cada uma ao lado. É a tela de abrir de manhã.'],
    ['📊', 'Painel', 'Como está a carteira, e o que ela está me ensinando.',
     'Pipeline por saúde da decisão, o que está travando a receita, tempo sem evidência, riscos críticos — e, no fim, o Aprendizado da carteira com a evolução semana a semana e o plano de desenvolvimento.'],
    ['🗂️', 'Pipeline', 'Quais negócios são reais.',
     'A carteira lida pela decisão do comprador, não pela etapa. Sete grupos, filtros no topo e a gaveta de filtros finos. Em lista ou em kanban.'],
    ['✅', 'Tarefas', 'O que foi executado, e o que aquilo rendeu.',
     'Toda tarefa presa a uma empresa e a uma negociação. Filtros como os do pipeline, resumo da semana, e a coluna que diz qual decisão cada tarefa destrava.'],
    ['🔄', 'Revisão', 'O que precisa da minha decisão, não do meu esforço.',
     'A fila do que está fora do lugar: negócio sem próximo passo, papel crítico ausente, evidência velha, etapa adiantada demais.'],
    ['📇', 'Cadastros', 'Onde ficam as empresas, as pessoas e as listas.',
     'Empresas, contatos, oportunidades, e os catálogos: segmentos, tipos de tarefa e produtos. Produtos só o gestor cadastra.'],
    ['⚙️', 'Configuração', 'Instalação, dados, nuvem, IA e diagnóstico.',
     'Nove blocos, detalhados adiante neste manual.'],
    ['❓', 'Método', 'Por que o sistema funciona assim.',
     'Esta tela.']
  ];

  function manualDasTelas() {
    const linhas = TELAS.map(function (t) {
      return '<tr><td class="rotulo-manual"><span class="icone-tipo">' + t[0] + '</span> <strong>' + esc(t[1]) + '</strong></td>' +
        '<td><strong>' + esc(t[2]) + '</strong><span class="tiny muted">' + esc(t[3]) + '</span></td></tr>';
    }).join('');
    return '<div class="card" id="m-telas"><h2>As telas, uma a uma</h2>' +
      '<p class="small">Cada tela responde uma pergunta. Se você não souber em qual entrar, escolha pela pergunta.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + linhas + '</tbody></table></div></div>';
  }

  function manualDoPipeline() {
    const linhas = FILTROS.map(function (f) {
      const d = f[2];
      return '<tr><td class="rotulo-manual"><strong>' + esc(f[1]) + '</strong></td>' +
        '<td>' + esc(d.oQue) +
        '<span class="tiny muted"><strong>Entra:</strong> ' + esc(d.entra) + '</span>' +
        '<span class="tiny muted"><strong>Sai:</strong> ' + esc(d.sai) + '</span>' +
        '<span class="tiny muted"><strong>O que fazer:</strong> ' + esc(d.faca) + '</span></td></tr>';
    }).join('');
    return '<div class="card" id="m-pipeline"><h2>Os grupos do pipeline</h2>' +
      '<p class="small">A classificação é <strong>regra fixa</strong>, não é a IA. Mesmo dado, mesmo grupo, sempre — ' +
      'se um modelo decidisse isso, o cartão poderia mudar de cor entre duas visitas sem nada ter acontecido.</p>' +
      '<p class="small"><strong>A ordem importa.</strong> O app testa de cima para baixo e o negócio fica no primeiro ' +
      'grupo que servir. Por isso Zumbi vence todos: um negócio com IAD alto e quarenta dias de silêncio é zumbi, ' +
      'não é real.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + linhas + '</tbody></table></div></div>';
  }

  function manualDasTarefas() {
    return '<div class="card" id="m-tarefas"><h2>A tela de Tarefas</h2>' +
      '<p class="small">Toda tarefa está presa a uma <strong>empresa</strong> e a uma <strong>negociação</strong> — ' +
      'uma empresa tem várias negociações, e "as tarefas da Marilan" e "as tarefas da proposta de reúso da Marilan" ' +
      'são perguntas diferentes.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      '<tr><td class="rotulo-manual"><strong>Status: A fazer</strong></td><td>Como a tela abre: atrasado e por vencer juntos, ' +
      'com o atrasado no topo, porque a ordem é a data. Abrir só em "Atrasadas" fazia quem tinha tudo em dia ver ' +
      '"nenhuma tarefa neste filtro", que se lê como dado perdido.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Pontos de decisão que andaram</strong></td><td>O número que fecha o ciclo, no resumo ' +
      'da semana. Tarefa fechada é esforço; ponto de IAD é resultado. É ele que diz se a semana valeu.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Fechadas sem relato</strong></td><td>Dívida visível. Fechar em lote move o funil e ' +
      'não move nenhuma das oito decisões — sem contar o que o cliente fez, não há o que reler.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>O que ela destrava</strong></td><td>Se a tarefa tem decisão-alvo, mostra a dimensão e a ' +
      'nota atual. Se não tem, mostra a primeira lacuna do negócio. É o que impede a lista de virar lista de afazeres solta.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Adiar</strong></td><td>Adiar é um fato, não correção de data: fica contado na tarefa ' +
      '("adiada 4x") e escrito no histórico. Mudar a data pela edição é correção e não conta.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Vinda do Linked Helper</strong></td><td>Toda empresa importada do LH abre uma tarefa de ' +
      'Apresentação vencendo no dia da importação, com campanha, SDR e a conversa inteira do LinkedIn na descrição.</td></tr>' +
      '</tbody></table></div></div>';
  }

  function manualDoAprendizado() {
    return '<div class="card" id="m-aprendizado"><h2>Aprendizado da carteira e plano de desenvolvimento</h2>' +
      '<p class="small">No fim do Painel. Oito indicadores em série <strong>semanal</strong>, sempre contra a semana ' +
      'anterior — porque um número sozinho não ensina: "ticket médio de R$ 42 mil" só quer dizer alguma coisa ao lado ' +
      'dos R$ 51 mil da semana passada.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      '<tr><td class="rotulo-manual"><strong>Por que só estes indicadores</strong></td><td>Só entra o que aconteceu <em>dentro</em> ' +
      'da semana e ficou datado. Por isso a série é exata também para trás. O valor de um negócio é sobrescrito quando ' +
      'muda — devolver o valor de hoje com data de julho seria pior do que não responder, então ele fica de fora.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>A seta</strong></td><td>O glifo diz para onde o número foi; a cor diz se isso é bom. ' +
      'Ciclo de vendas caindo é seta para baixo <strong>em verde</strong>.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>A semana em curso</strong></td><td>Fica marcada e fora da comparação. Comparar ' +
      'quarta-feira com uma semana inteira é o erro clássico deste tipo de tela: meia semana sempre parece queda.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>O que cada tipo de tarefa rendeu</strong></td><td>A tabela que fecha o ciclo do sistema. ' +
      'Dez e-mails com zero ponto ao lado de três visitas com sete pontos é a informação que muda a semana seguinte. ' +
      'A atribuição é exata para o que foi pontuado a partir desta versão; o que veio antes casa pela data e vai ' +
      'marcado como estimativa.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Plano de desenvolvimento</strong></td><td>A IA lê exatamente os números da tabela — ' +
      'nada além deles — e devolve o que melhorou, o que piorou, e no máximo três mudanças, cada uma com o número ' +
      'que a justifica e o indicador que vai dizer se deu certo.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Ganhos contra perdas</strong></td><td>O aprendizado lento, logo abaixo: compara a foto ' +
      'das oito decisões no dia do fechamento entre ganhos e perdas. Precisa de uns cinco de cada lado para significar ' +
      'algo, e o app avisa enquanto não tem.</td></tr>' +
      '</tbody></table></div></div>';
  }

  function manualDaConfiguracao() {
    const blocos = [
      ['Instalar', 'O IAD é um PWA: instala como aplicativo e funciona offline com a última cópia baixada.'],
      ['Importar planilha', 'CSV, e a ordem importa: empresas, depois contatos, depois oportunidades. Leitura literal de colunas — nada é adivinhado.'],
      ['Assistente de IA', 'O interruptor de tudo. Fora do ar, as caixas ✨ somem e o sistema inteiro continua funcionando: você digita à mão. A chave do modelo fica no servidor, nunca no navegador.'],
      ['Nuvem (Supabase)', 'Sincronizar sobe e desce. Só baixar traz do servidor por cima do que está aqui — é o botão de "esta máquina está com dados de outra conta". A frase "Sincronizando para [empresa]" é literal: o que subir passa a pertencer a ela.'],
      ['Minha conta', 'Troca de senha, válida em todos os aparelhos. Senha que circulou por e-mail ou mensagem deixou de ser secreta no momento em que circulou.'],
      ['Linked Helper', 'A ponte recebe o webhook do LH e o app busca de lá. Cada lead vira empresa, contato, oportunidade e tarefa. Aqui também aparece o aviso de importações antigas que ficaram sem tarefa.'],
      ['Diagnóstico dos dados', 'A resposta para "a tela está vazia". Guardados é o que existe neste aparelho; visíveis é o que as permissões deixam ver — a diferença entre as duas colunas é o diagnóstico inteiro. "Perguntar ao servidor por quê" vai além e escreve o veredito.'],
      ['Backup', 'Exporta em JSON. Anexos não entram — a contagem aparece embaixo para você não achar que levou tudo.'],
      ['Demonstração', 'Carteira fictícia com os cinco grupos, para treinar a leitura sem tocar em dado real. "Apagar tudo" limpa este aparelho, não o servidor.']
    ];
    const linhas = blocos.map(function (b) {
      return '<tr><td class="rotulo-manual"><strong>' + esc(b[0]) + '</strong></td><td>' + esc(b[1]) + '</td></tr>';
    }).join('');
    return '<div class="card" id="m-config"><h2>Configuração, bloco a bloco</h2>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + linhas + '</tbody></table></div></div>';
  }

  /* Os dez pedidos que o app faz ao assistente. A coluna do meio é o nome
     técnico de verdade — o mesmo que viaja na chamada — porque quando alguma
     coisa der errado é esse nome que vai aparecer no diagnóstico. */
  const TAREFAS_DA_IA = [
    ['conta', '✨ no formulário de empresa',
     'Extrai a ficha de um texto colado. O segmento sai da sua lista fechada, escolhido por julgamento do que a empresa faz — não por achar a palavra no texto.'],
    ['contato', '✨ no formulário de contato',
     'Deduz o papel na compra a partir do cargo (Suprimentos → Compras; CFO → Decisor econômico). Perfil Challenger só se o texto mostrar como a pessoa age.'],
    ['oportunidade', '✨ no formulário de negócio',
     'Título, empresa, segmento, tipo e concorrentes — incluindo "não fazer nada". Não devolve valor, etapa nem data de fechamento: isso é seu.'],
    ['evidencia', '✨ no registro de evidência',
     'Extrai UMA evidência do que o cliente fez, começando pelo lado dele. Dimensão, força, pessoa, canal, data e o próximo passo combinado. Não devolve a nota.'],
    ['classificar', 'enquanto você digita a evidência',
     'Só dimensão e força do que você acabou de escrever. Nada mais.'],
    ['reuniao', 'ata ou transcrição colada',
     'Separa TUDO em várias evidências, uma por dimensão — um documento rende de duas a seis. Num documento nosso, o que o cliente forneceu é evidência dele; nossa recomendação e nosso preço não são.'],
    ['notas', 'ao concluir uma tarefa com relato',
     'Propõe a nota das oito. Três travas: só o que o cliente fez conta; cada nota precisa de trecho literal, e sem trecho é 0; na dúvida entre dois níveis, usa o menor.'],
    ['plano', 'cartão Próximos passos',
     'Até 4 passos na ordem de execução, cada um com dimensão-alvo, ação, uma pergunta pronta e o porquê citando o cliente. Proibida de sugerir nota e de passo genérico.'],
    ['segmentos', 'importação do Linked Helper',
     'Todos os leads de uma vez: segmento da lista da equipe, papel provável na compra e o insight comercial.'],
    ['desenvolvimento', 'Plano de desenvolvimento, no Painel',
     'Lê a série semanal e o rendimento por tipo de tarefa e escreve o que melhorou, o que piorou e até três mudanças. Proibida de estimar, projetar ou comparar com "mercado".'],
    ['insight', 'campo de insight do negócio',
     'Rascunho do reenquadramento Challenger em duas ou três frases, para você editar.']
  ];

  function manualDaIA() {
    const linhas = TAREFAS_DA_IA.map(function (t) {
      return '<tr><td class="rotulo-manual"><code>' + esc(t[0]) + '</code></td>' +
        '<td class="onde-manual tiny muted">' + esc(t[1]) + '</td>' +
        '<td>' + esc(t[2]) + '</td></tr>';
    }).join('');
    return '<div class="card" id="m-ia"><h2>As tarefas da IA</h2>' +
      '<p class="small">Não existe "a IA do sistema" em geral. Existem pedidos de escopo fechado, cada um com regras ' +
      'próprias e um lugar onde aparece. Esta é a lista inteira.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><thead><tr><th>Pedido</th><th>Onde aparece</th>' +
      '<th>O que faz — e o que é proibida de fazer</th></tr></thead><tbody>' + linhas + '</tbody></table></div></div>';
  }

  function manualDosLimites() {
    const itens = [
      ['Não classifica o pipeline', 'Zumbi, Falso avançado, Oculto promissor e os outros saem de regra fixa com os números do negócio. Mesmo dado, mesmo grupo, sempre.'],
      ['Não pontua sozinha', 'Ela propõe; quem confirma é você. Toda mudança de nota grava um retrato com data e dimensão — o histórico responde por que o negócio valia 8 e vale 12.'],
      ['Não inventa pessoa, número ou prazo', 'Está escrito em cada pedido, e a resposta é validada antes de chegar na tela: segmento fora da lista é recusado, pessoa que não existe na conta é descartada.'],
      ['Não é obrigatória', 'Com o assistente fora do ar, o sistema inteiro continua de pé — só some o atalho. O que sustenta o IAD é a evidência do cliente, não o modelo.'],
      ['Não sai do navegador com a sua chave', 'A chave do modelo fica no servidor. O app manda o texto, recebe os campos, e nada mais.']
    ];
    const linhas = itens.map(function (i) {
      return '<tr><td class="rotulo-manual"><strong>' + esc(i[0]) + '</strong></td><td>' + esc(i[1]) + '</td></tr>';
    }).join('');
    return '<div class="card" id="m-limites"><h2>O que a IA não faz</h2>' +
      '<p class="small">Tão importante quanto a lista anterior: é o que garante que duas pessoas vejam o mesmo ' +
      'número, e que o painel do dono da empresa signifique alguma coisa.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + linhas + '</tbody></table></div>' +
      '<div class="aviso" style="margin-top:12px">Se for para lembrar de uma frase: a IA <strong>lê e propõe</strong>, ' +
      'o motor <strong>calcula</strong>, você <strong>decide</strong> — e só o que o <strong>cliente</strong> fez ' +
      'move a nota.</div></div>';
  }

  function manualDasOito() {
    const linhas = P.DIMENSOES.map(function (d, i) {
      return '<tr><td class="rotulo-manual"><span class="tiny muted">' + (i + 1) + '</span> <strong>' + esc(d.nome) + '</strong></td>' +
        '<td>' + esc(d.pergunta) + '</td></tr>';
    }).join('');
    return '<div class="card" id="m-oito"><h2>As oito decisões, e a régua</h2>' +
      '<p class="small">Uma venda B2B não avança porque você mandou proposta. Avança quando oito decisões acontecem ' +
      '<strong>dentro do cliente</strong>. Cada uma vale de 0 a ' + P.NOTA_MAXIMA + ', e a soma é o <strong>IAD</strong>, de 0 a ' + P.IAD_MAXIMO + '. ' +
      'Com ' + P.IAD_MADURO + ' ou mais, decisão madura.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + linhas + '</tbody></table></div>' +
      '<div class="escada-manual">' +
      '<div><span class="nota-manual n0">0</span><div><strong>Não sabemos</strong><span class="tiny muted">Nada do lado do cliente sustenta esta decisão.</span></div></div>' +
      '<div><span class="nota-manual n1">1</span><div><strong>Parcial</strong><span class="tiny muted">Há sinal, mas vago, indireto, ou dito por uma pessoa só.</span></div></div>' +
      '<div><span class="nota-manual n2">2</span><div><strong>Comprovado pelo cliente</strong><span class="tiny muted">Ele descreveu, mostrou, mandou ou fez. Exige evidência confirmada ou documentada.</span></div></div>' +
      '</div>' +
      '<p class="small" style="margin-top:10px">Dois números derivam daí. <strong>Evidence Age</strong> é há quantos ' +
      'dias o cliente não produz evidência — o relógio não para por atividade sua. <strong>Cobertura</strong> é quanto ' +
      'dos papéis críticos da compra você tem mapeado.</p></div>';
  }

  /* ---------------- Como o IAD anda ----------------

     A seção que faltava, e ela precisa ser gerada do playbook — não escrita à
     mão. Um manual que descreve o gate da proposta em texto fixo fica errado
     no dia em que alguém mudar GATES_PROPOSTA, e ninguém vai lembrar de vir
     aqui. Tudo o que é regra sai da constante que a regra usa. */

  function manualDoAvanco() {
    const niveis = P.DIMENSOES.map(function (d, i) {
      return '<tr><td class="rotulo-manual"><span class="tiny muted">' + (i + 1) + '</span> <strong>' +
        esc(d.nome) + '</strong><span class="tiny muted">' + esc(d.pergunta) + '</span></td>' +
        '<td>' + d.niveis.map(function (n, k) {
          return '<span class="nivel-linha"><b class="nota-manual n' + k + '">' + k + '</b> ' + esc(n) + '</span>';
        }).join('') + '</td></tr>';
    }).join('');

    /* A ordem de trabalho não é a ordem em que as oito aparecem na tela. É a
       do motor, e ela existe porque decisão tem pré-requisito. */
    const ordem = ['problema', 'prioridade', 'impacto', 'stakeholders', 'criterios', 'processo', 'consenso', 'risco']
      .map(function (id, i) {
        const d = P.DIMENSOES.filter(function (x) { return x.id === id; })[0];
        return '<span class="passo-ordem"><b>' + (i + 1) + '</b>' + esc(d ? d.nome : id) + '</span>';
      }).join('<span class="seta-ordem">→</span>');

    const gate = P.GATES_PROPOSTA.map(function (g) {
      const d = P.DIMENSOES.filter(function (x) { return x.id === g.dim; })[0];
      return '<tr><td class="rotulo-manual"><strong>' + esc(d ? d.nome : g.dim) + '</strong></td>' +
        '<td class="nowrap">precisa de <strong>' + g.min + '</strong> ou mais</td>' +
        '<td>' + esc(d ? d.niveis[g.min] : '') + '</td></tr>';
    }).join('');

    const foraDoGate = P.DIMENSOES.filter(function (d) {
      return !P.GATES_PROPOSTA.some(function (g) { return g.dim === d.id; });
    }).map(function (d) { return d.nome; });

    const forcas = P.FORCAS.map(function (f) {
      const comprova = f.peso >= P.FORCA_MINIMA_PARA_COMPROVAR;
      return '<tr><td class="rotulo-manual"><strong>' + esc(f.rotulo) + '</strong></td>' +
        '<td>' + esc(f.desc) + '</td>' +
        '<td class="nowrap">' + (comprova
          ? '<span class="pill ok">sustenta nota 2</span>'
          : '<span class="pill">teto: nota 1</span>') + '</td></tr>';
    }).join('');

    const evid = P.FAIXAS_EVIDENCIA.map(function (f, i) {
      const de = i === 0 ? 0 : P.FAIXAS_EVIDENCIA[i - 1].max + 1;
      const ate = f.max === Infinity ? 'ou mais' : 'a ' + f.max + ' dias';
      return '<tr><td class="rotulo-manual"><span class="pill ' + f.classe + '">' + esc(f.rotulo) + '</span></td>' +
        '<td class="nowrap">' + de + ' ' + ate + '</td>' +
        '<td>' + esc([
          'O cliente se moveu esta semana. É o ritmo que fecha negócio.',
          'Passou uma semana sem sinal dele. Ainda não é problema; é o momento de provocar.',
          'Duas semanas ou mais em silêncio. O negócio está saindo da mão sem ninguém perceber.',
          'Mais de um mês. O app chama de Zumbi: requalifique com uma tentativa clara, ou encerre por inação.'
        ][i]) + '</td></tr>';
    }).join('');

    const naoContam = P.ATIVIDADES_QUE_NAO_CONTAM.map(function (a) {
      return '<span class="pill dead">' + esc(a) + '</span>';
    }).join(' ');

    return '<div class="card" id="m-avanco"><h2>Como o IAD anda</h2>' +

      '<p class="small">O IAD é a soma das oito notas: de <strong>0 a ' + P.IAD_MAXIMO + '</strong>. Ele não sobe porque ' +
      'você trabalhou. Sobe quando uma das oito decisões amadurece <strong>dentro do cliente</strong>, ' +
      'e isso acontece de um jeito só: uma evidência nova do cliente entra, e a nota daquela decisão sobe.</p>' +

      '<h3>O caminho de um ponto, do começo ao fim</h3>' +
      '<ol class="caminho-iad">' +
      '<li><strong>Você marca uma tarefa</strong> — e diz qual das oito ela pretende provocar.</li>' +
      '<li><strong>A tarefa acontece</strong> — reunião, visita, telefonema, e-mail.</li>' +
      '<li><strong>Você conclui contando o que aconteceu</strong> — colando a ata, respondendo as quatro ' +
      'perguntas, ou escrevendo em duas linhas.</li>' +
      '<li><strong>O que o CLIENTE fez vira evidência</strong>, com uma força: relato, confirmado ou documentado.</li>' +
      '<li><strong>A nota sobe</strong> — e com ela o IAD, o grupo do negócio no pipeline e o painel do gestor.</li>' +
      '</ol>' +
      '<div class="aviso">Fechar a tarefa sem contar o que aconteceu fecha a tarefa e <strong>não move nada</strong>. ' +
      'Não é punição do app: sem o relato não existe evidência para reler, e sem evidência não há o que subir.</div>' +

      '<h3>Os três níveis, decisão por decisão</h3>' +
      '<p class="small">Esta é a régua inteira. A coluna da direita é o que precisa ser verdade para a nota valer.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + niveis + '</tbody></table></div>' +

      '<h3>A força da evidência — e a única trava que o app não deixa você furar</h3>' +
      '<p class="small">Toda evidência entra com uma força. Ela decide até onde a nota pode ir: ' +
      '<strong>nota 2 exige evidência confirmada ou documentada</strong>. Se você marcar 2 com só relatos, ' +
      'o motor trava em 1 e diz por quê — vale para você e vale para a IA, sem exceção.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + forcas + '</tbody></table></div>' +

      '<h3>A ordem em que as oito devem ser trabalhadas</h3>' +
      '<p class="small">Não é a ordem em que elas aparecem na tela. É a do motor, e ela existe porque ' +
      'decisão tem pré-requisito: ninguém prioriza o que não reconhece como problema, e ninguém aprova ' +
      'orçamento sem impacto. O cartão <strong>Próximos passos</strong> aponta sempre a primeira lacuna ' +
      'nesta ordem.</p>' +
      '<div class="ordem-decisao">' + ordem + '</div>' +

      '<h3>O que NÃO sobe o índice</h3>' +
      '<p class="small">Trabalho nosso é trabalho, e trabalho não é avanço. Nada disto move uma nota:</p>' +
      '<div class="row" style="gap:6px;flex-wrap:wrap">' + naoContam + '</div>' +
      '</div>';
  }

  function manualDasEtapas() {
    const etapas = [
      ['Prospecção', 'Você achou a conta. O cliente ainda não se moveu.',
       'Nada é exigido para entrar aqui — é onde todo negócio nasce.',
       'Uma resposta dele. Qualquer sinal de vida do comprador tira o negócio daqui.'],
      ['Conexão', 'Há conversa com alguém do lado do cliente.',
       'Uma pessoa mapeada e uma troca registrada.',
       'Problema reconhecido com as palavras dele — a primeira das oito.'],
      ['Diagnóstico', 'Você está entendendo a operação dele, com dados dele.',
       'Problema em 1 ou 2. É aqui que Impacto costuma nascer.',
       'Impacto e Prioridade saindo do zero, e uma segunda pessoa na conversa.'],
      ['Benefícios', 'O cliente já enxerga o que ganha, e começa a comparar.',
       'Problema, Prioridade e Impacto com sinal; Critérios começando.',
       'Critérios definidos por ele e o caminho de compra (Processo) aparecendo.'],
      ['Proposta', 'O preço está na mesa.',
       'ESTA É A ÚNICA ETAPA COM PORTÃO NO SISTEMA — as seis condições abaixo.',
       'Consenso do grupo e os riscos dele endereçados.'],
      ['Validação', 'O cliente está checando internamente — jurídico, compras, alçada.',
       'Decisor econômico mapeado. Sem ele, o app marca falso avançado.',
       'Processo comprovado: você sabe o caminho exato até a assinatura.'],
      ['Fechamento', 'Falta a assinatura.',
       'Consenso e Risco resolvidos, ou o negócio volta.',
       'O desfecho registrado — é ele que congela a foto das oito e alimenta o Aprendizado.']
    ].map(function (e) {
      return '<tr><td class="rotulo-manual"><strong>' + esc(e[0]) + '</strong>' +
        '<span class="tiny muted">' + esc(e[1]) + '</span></td>' +
        '<td><span class="tiny muted"><strong>Para estar aqui de verdade:</strong> ' + esc(e[2]) + '</span>' +
        '<span class="tiny muted"><strong>Para sair daqui:</strong> ' + esc(e[3]) + '</span></td></tr>';
    }).join('');

    const gate = P.GATES_PROPOSTA.map(function (g) {
      const d = P.DIMENSOES.filter(function (x) { return x.id === g.dim; })[0];
      return '<tr><td class="rotulo-manual"><strong>' + esc(d ? d.nome : g.dim) + '</strong></td>' +
        '<td class="nowrap"><strong>' + g.min + '</strong> ou mais</td>' +
        '<td>' + esc(d ? d.niveis[g.min] : '') + '</td></tr>';
    }).join('');
    const fora = P.DIMENSOES.filter(function (d) {
      return !P.GATES_PROPOSTA.some(function (g) { return g.dim === d.id; });
    }).map(function (d) { return d.nome; }).join(' e ');

    return '<div class="card" id="m-etapas"><h2>O que cada etapa pede</h2>' +

      '<div class="aviso">Uma verdade que o manual precisa dizer antes da tabela: <strong>o app não impede ' +
      'você de arrastar um cartão para onde quiser</strong>. Etapa é onde você anotou; decisão é onde o ' +
      'cliente está. Só existe uma trava no sistema inteiro, e é a da Proposta — e mesmo ela não bloqueia: ' +
      'ela denuncia, marcando o negócio como <strong>Falso avançado</strong>. A tabela abaixo é o que ' +
      'costuma ser verdade em cada etapa quando o negócio é real.</div>' +

      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + etapas + '</tbody></table></div>' +

      '<h3>O portão da proposta — as seis condições</h3>' +
      '<p class="small">A proposta é consequência da qualificação, não ferramenta de descoberta. O app ' +
      'chama de <strong>Prontidão</strong> o percentual destas seis condições cumpridas, e ela aparece no ' +
      'painel e no cockpit.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + gate + '</tbody></table></div>' +
      '<p class="small" style="margin-top:10px">Repare em quem <strong>não</strong> está no portão: ' +
      esc(fora) + '. Não é esquecimento — essas duas amadurecem <em>durante</em> a proposta, e exigi-las ' +
      'antes travaria negócio bom. Mas elas são o que decide na Validação: negócio que chega ali sem ' +
      'consenso e com risco em aberto é o que some do forecast na última semana.</p>' +

      '<h3>Depois da proposta, três coisas fazem o app gritar</h3>' +
      '<p class="small">Estando em Proposta ou adiante, qualquer uma destas marca o negócio como ' +
      '<strong>Falso avançado</strong> — que é o maior destruidor de previsão de vendas:</p>' +
      '<ul class="limpa-manual">' +
      '<li>IAD abaixo de <strong>' + P.IAD_MADURO + '</strong>;</li>' +
      '<li>o portão acima <strong>não liberado</strong>;</li>' +
      '<li>nenhum <strong>decisor econômico</strong> mapeado no grupo comprador.</li>' +
      '</ul>' +
      '</div>';
  }

  function manualDasFaixas() {
    const evid = P.FAIXAS_EVIDENCIA.map(function (f, i) {
      const de = i === 0 ? 0 : P.FAIXAS_EVIDENCIA[i - 1].max + 1;
      const ate = f.max === Infinity ? ' dias ou mais' : ' a ' + f.max + ' dias';
      return '<tr><td class="rotulo-manual"><span class="pill ' + f.classe + '">' + esc(f.rotulo) + '</span></td>' +
        '<td class="nowrap">' + de + ate + '</td>' +
        '<td>' + esc([
          'O cliente se moveu esta semana. É o ritmo de quem fecha.',
          'Passou uma semana sem sinal dele. Ainda não é problema — é a hora de provocar.',
          'Duas semanas ou mais em silêncio. O negócio está saindo da mão sem ninguém perceber.',
          'Mais de um mês. O app chama de Zumbi. Requalifique com uma tentativa clara, ou encerre por inação — negócio parado no funil é previsão falsa.'
        ][i]) + '</td></tr>';
    }).join('');

    return '<div class="card" id="m-faixas"><h2>O que o número do IAD diz</h2>' +

      '<p class="small">De 0 a ' + P.IAD_MAXIMO + '. E o sistema tem <strong>um único limiar</strong>, não uma escala de ' +
      'cores: <strong>' + P.IAD_MADURO + '</strong>. Abaixo dele a decisão está sendo formada; a partir dele ela está ' +
      'madura. Tudo o mais que o app classifica cruza esse número com outras duas coisas — há quanto tempo ' +
      'o cliente não se move, e quanto do grupo comprador você tem mapeado.</p>' +

      '<div class="escada-manual escada-iad">' +
      '<div><span class="faixa-iad f0">0–11</span><div><strong>Você ainda não sabe se existe negócio</strong>' +
      '<span class="tiny muted">Média abaixo de 1,5 por decisão: o que existe é suposição nossa e alguma coisa ' +
      'declarada. Aqui o trabalho é diagnóstico. Um valor grande com IAD 6 não é pipeline, é esperança.</span></div></div>' +
      '<div><span class="faixa-iad f1">12–19</span><div><strong>O cliente falou, ninguém conferiu</strong>' +
      '<span class="tiny muted">É a faixa do que o cliente DISSE. A mais comum e a mais traiçoeira, porque parece ' +
      'pronta: cada frase daquelas ainda pode cair quando alguém for verificar. O trabalho aqui não é descobrir ' +
      'mais, é testar o que já se sabe.</span></div></div>' +
      '<div><span class="faixa-iad f2">' + P.IAD_MADURO + '–27</span><div><strong>Decisão madura — dá para contar no forecast</strong>' +
      '<span class="tiny muted">É o limiar do sistema: média 3, ou seja, a maioria das oito foi testada com o ' +
      'cliente e resistiu. A partir daqui, se o cliente se moveu nos últimos 14 dias e metade dos papéis críticos ' +
      'está mapeada, o app chama de <strong>Negócio real</strong>. Antes da proposta, chama de ' +
      '<strong>Oculto promissor</strong> — o achado mais valioso do pipeline.</span></div></div>' +
      '<div><span class="faixa-iad f3">28–' + P.IAD_MAXIMO + '</span><div><strong>Documentado quase por inteiro</strong>' +
      '<span class="tiny muted">Raro, e quando acontece o que falta costuma não ser decisão: é prazo, alçada ou ' +
      'assinatura. Se um negócio está em 30 há semanas, o problema não está nas oito — está no Processo, ' +
      'ou em alguém que ninguém mapeou.</span></div></div>' +
      '</div>' +

      '<div class="aviso" style="margin-top:14px"><strong>O número sozinho não classifica nada.</strong> ' +
      'Um negócio com IAD 28 e quarenta dias de silêncio é <strong>Zumbi</strong>, não é real — a regra do ' +
      'tempo vence todas as outras. É por isso que a tela mostra sempre os três juntos: o índice, os dias ' +
      'sem evidência e a cobertura do grupo.</div>' +

      '<h3>A segunda régua: há quanto tempo o cliente não se move</h3>' +
      '<p class="small">O relógio conta desde a <strong>última evidência do cliente</strong> — e não para ' +
      'porque você mandou e-mail. Atividade nossa não zera contador, por definição.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + evid + '</tbody></table></div>' +

      '<h3>A terceira: cobertura do grupo comprador</h3>' +
      '<p class="small">Percentual dos papéis críticos que você tem mapeado e com relacionamento. ' +
      '<strong>50% ou mais</strong> é uma das três condições de Negócio real. E há um alerta que vale por ' +
      'si: venda que depende de <strong>uma pessoa só</strong> é o maior risco silencioso do funil — se ' +
      'ela sair da empresa, o negócio sai junto.</p>' +
      '</div>';
  }

  /* ---------------- A IA vista de quem vende ----------------

     Já existe a seção técnica com os onze pedidos e o que cada um é proibido
     de fazer. Esta é outra pergunta: em que MOMENTO do dia a IA aparece, o
     que ela tira das costas de quem vende, e o que continua sendo dele.

     A ordem aqui é a do dia de trabalho, não a da arquitetura. */

  function manualDaIAParaOVendedor() {
    const momento = function (quando, gatilho, faz, seu, ganho) {
      return '<tr><td class="rotulo-manual"><strong>' + esc(quando) + '</strong>' +
        '<span class="tiny muted">' + esc(gatilho) + '</span></td>' +
        '<td><span class="faz-ia">' + faz + '</span>' +
        '<span class="tiny muted seu-lado"><strong>Seu:</strong> ' + esc(seu) + '</span></td>' +
        '<td class="nowrap tiny muted">' + esc(ganho) + '</td></tr>';
    };

    const linhas = [
      momento('Chega um lead do LinkedIn',
        'Configuração → Buscar respostas',
        'Cria a <strong>empresa</strong>, o <strong>contato</strong> com papel na compra, a ' +
        '<strong>oportunidade</strong> e a <strong>tarefa</strong> de fazer contato. Classifica o segmento, ' +
        'guarda a conversa com a SDR no histórico e escreve um rascunho de reenquadramento.',
        'conferir o segmento e o papel na tela de importação, e marcar quem entra.',
        '4 cadastros por lead'),

      momento('Você vai criar um negócio',
        'Pipeline → + Oportunidade, colando o que tem',
        'Lê a ata, a proposta ou o e-mail e <strong>monta o negócio, a ficha da empresa e as pessoas</strong>. ' +
        'Se o material for grande, ainda separa as evidências e propõe as oito notas — o negócio nasce com ' +
        'histórico em vez de zerado.',
        'valor, etapa e data de fechamento. A IA não mexe nesses três.',
        'a digitação inteira'),

      momento('Você está preenchendo qualquer ficha',
        'a caixa ✨ no alto do formulário',
        'Preenche os campos a partir de um texto colado, de um documento carregado ou do que você ditar. ' +
        'Deduz o <strong>papel na compra pelo cargo</strong> e marca cada campo que sugeriu.',
        'conferir e clicar em Salvar. Nada é gravado antes disso.',
        'o preenchimento'),

      momento('Você acabou uma reunião',
        'Tarefas → Concluir, colando a ata',
        'Este é o momento que mais rende. Ela <strong>separa o que o CLIENTE fez do que você fez</strong>, ' +
        'transforma a parte dele em evidências com dimensão, força, pessoa, canal e data, relê as oito ' +
        'decisões, completa a ficha da empresa e das pessoas com o que apareceu, e atualiza valor, etapa, ' +
        'previsão e concorrentes quando o material comprova.',
        'contar o que aconteceu. Uma ata colada, quatro perguntas respondidas ou duas linhas escritas.',
        'a leitura e o lançamento'),

      momento('Você está com pressa, no carro',
        'Tarefas → Concluir → as quatro perguntas',
        'Cada "sim" nas quatro perguntas vira evidência sem você digitar, e as oito são relidas em seguida.',
        'quatro toques.',
        'o relato escrito'),

      momento('Você abriu um negócio e não sabe o que fazer',
        'cockpit → Próximos passos',
        'Lê o retrato inteiro e devolve <strong>até 4 passos na ordem</strong>, cada um com a decisão que ' +
        'pretende mover, a ação começando por verbo, <strong>uma pergunta pronta para fazer ao cliente</strong> ' +
        'e o porquê citando o que ele disse. Mais até 3 alertas de risco de perder.',
        'escolher o passo e fazer. Virar tarefa é um clique.',
        'o planejamento da conta'),

      momento('Você precisa de um ângulo para a conversa',
        'campo de insight do negócio',
        'Escreve um rascunho do reenquadramento — a verdade sobre o negócio dele que ele não enxerga ' +
        'sozinho, na linguagem do setor.',
        'editar. É rascunho, e o cliente vai ouvir na sua voz.',
        'a página em branco'),

      momento('Fim de semana, olhando a carteira',
        'Painel → Gerar o plano da semana',
        'Lê a série das últimas semanas e o rendimento por tipo de tarefa, e diz o que melhorou, o que ' +
        'piorou e <strong>até três mudanças</strong> no jeito de trabalhar — cada uma com o número que a ' +
        'justifica e o indicador que vai dizer se deu certo.',
        'decidir se muda.',
        'a análise')
    ].join('');

    return '<div class="card" id="m-ia-vendedor"><h2>A IA no seu dia — o que ela tira das suas costas</h2>' +

      '<p class="small">A seção seguinte lista os onze pedidos por dentro. Esta responde outra pergunta: ' +
      '<strong>em que momento do dia ela aparece, o que ela faz por você, e o que continua sendo seu</strong>.</p>' +

      '<div class="tabela-rolagem"><table class="tabela-manual"><thead><tr>' +
      '<th>Quando</th><th>O que ela faz — e o que fica com você</th><th>Poupa</th>' +
      '</tr></thead><tbody>' + linhas + '</tbody></table></div>' +

      '<h3>A regra que resume as oito linhas acima</h3>' +
      '<div class="aviso"><strong>Ela lê e propõe. Você conta o que aconteceu. O motor calcula. ' +
      'E só o que o CLIENTE fez move a nota.</strong></div>' +

      '<h3>Então o que é fundamental que VOCÊ faça</h3>' +
      '<p class="small">Se for para guardar quatro coisas deste manual inteiro, são estas — e as quatro ' +
      'são justamente o que a IA <em>não</em> pode fazer no seu lugar:</p>' +

      '<div class="escada-manual">' +
      '<div><span class="nota-manual n2">1</span><div><strong>Contar o que aconteceu, sempre</strong>' +
      '<span class="tiny muted">É o combustível de tudo. Sem relato não há evidência, sem evidência não há ' +
      'nota, sem nota o índice não anda e a conta parece parada mesmo tendo andado. Tarefa fechada sem ' +
      'relato move o funil e não move nenhuma das oito — e o app marca isso.</span></div></div>' +

      '<div><span class="nota-manual n2">2</span><div><strong>Fazer o cliente produzir prova</strong>' +
      '<span class="tiny muted">Nota 2 exige evidência confirmada ou documentada. Isso não se consegue ' +
      'falando: consegue-se pedindo. "Você me manda esse número por e-mail?" vale mais para o índice do ' +
      'que uma hora de conversa boa. A IA lê o que existe; quem faz existir é você.</span></div></div>' +

      '<div><span class="nota-manual n2">3</span><div><strong>Trazer gente nova para a conversa</strong>' +
      '<span class="tiny muted">A IA reconhece quem aparece no material, mas não faz ninguém aparecer. ' +
      'Venda que depende de uma pessoa só é o maior risco silencioso do funil, e cobertura do grupo é uma ' +
      'das três condições de Negócio real.</span></div></div>' +

      '<div><span class="nota-manual n2">4</span><div><strong>Discordar quando ela errar</strong>' +
      '<span class="tiny muted">A IA propõe nota; quem esteve na reunião é você. O relatório da leitura ' +
      'tem o botão <strong>Ajustar as oito</strong>, e cada mudança fica gravada com data no histórico. ' +
      'Nota inflada vira previsão falsa no painel do dono da empresa, e ninguém descobre a tempo.</span></div></div>' +
      '</div>' +

      '<h3>E o que ela não faz, por mais que pareça</h3>' +
      '<p class="small">Ela não classifica o pipeline — Zumbi, Falso avançado e os outros saem de regra ' +
      'fixa. Ela não pontua sozinha em definitivo: propõe, e a nota 2 continua exigindo prova. Ela nunca ' +
      '<strong>rebaixa</strong> uma nota — corrigir para baixo é sempre humano. E, com o assistente fora ' +
      'do ar, o sistema inteiro continua de pé: some o atalho, não o método.</p>' +
      '</div>';
  }

  function playbook() {
    const dims = P.DIMENSOES.map(function (d) {
      const canais = P.CANAIS.map(function (c) {
        return '<tr><td style="white-space:nowrap"><strong>' + esc(c.nome) + '</strong></td><td>' + esc(d.canais[c.id]) + '</td></tr>';
      }).join('');
      return '<div class="card"><h3>' + esc(d.nome) + '</h3>' +
        '<p class="small"><strong>' + esc(d.pergunta) + '</strong></p>' +
        '<p class="tiny muted">Evidências que contam: ' + esc(d.evidencias.join(' · ')) + '</p>' +
        '<div class="tabela-rolagem"><table><tbody>' + canais + '</tbody></table></div>' +
        '<p class="tiny muted" style="margin-top:8px">Material: ' + esc(d.conteudo) + '</p></div>';
    }).join('');

    const naoContam = P.ATIVIDADES_QUE_NAO_CONTAM.map(function (a) { return '<span class="pill dead">' + esc(a) + '</span>'; }).join(' ');
    const forcas = P.FORCAS.map(function (f) {
      return '<tr><td><strong>' + esc(f.rotulo) + '</strong></td><td>' + esc(f.desc) + '</td></tr>';
    }).join('');

    /* A teoria toda numa tela só, e começando pela parte que o vendedor usa
       todo dia: como uma tarefa vira avanço. Antes esta tela abria pelas oito
       decisões, que é o fim da história — quem chega aqui quer saber o que
       fazer amanhã de manhã, não a taxonomia. */
    const tiposDeTarefa = Store.nomesDoCatalogo('tiposTarefa').map(function (t) {
      return '<span class="pill">' + esc(t) + '</span>';
    }).join(' ');

    return '<h1>Manual do IAD CRM</h1>' +
      '<p class="small muted" style="margin:-6px 0 14px">O método e o sistema, na mesma tela. ' +
      'Funciona offline: está tudo guardado no aparelho.</p>' +
      indiceDoManual() +
      '<div class="card" id="m-regra"><h2>A regra</h2>' +
      '<p>O estágio mostra onde a oportunidade está. As decisões mostram se ela realmente avançou.</p>' +
      '<p class="small">Só o cliente move o índice. O que <strong>nós</strong> fazemos — apresentar, ' +
      'propor, cobrar, dar follow-up — é trabalho, e trabalho não é avanço.</p>' +
      '<p class="small muted">Não conta como avanço:</p><div class="row">' + naoContam + '</div></div>' +

      manualDasOito() +
      manualDoAvanco() +
      manualDasFaixas() +
      manualDasEtapas() +
      '<div class="card" id="m-tarefa"><h2>Tudo entra por tarefa</h2>' +
      '<p class="small">Uma evidência nunca aparece do nada: ela vem de uma conversa, uma visita, ' +
      'um e-mail. Por isso há um botão só — <strong>+ Tarefa</strong> — e a tarefa é o lugar onde ' +
      'a decisão anda. Sem isso, o sistema registra o efeito e perde a causa: ninguém sabe depois ' +
      'por qual canal aquele negócio andou, nem qual canal funciona nesta conta.</p>' +
      '<p class="small"><strong>A fazer</strong> é o que você marcou para fazer. ' +
      '<strong>Já foi feita</strong> é o que aconteceu e você está anotando. As duas contam no ' +
      'funil e não contam igual no método: a primeira mostra planejamento, a segunda mostra ' +
      'corrida atrás do histórico. O sistema guarda a diferença e o assistente a lê.</p>' +
      '<p class="small muted" style="margin-top:10px">Canais disponíveis (você edita a lista em Cadastros):</p>' +
      '<div class="row">' + tiposDeTarefa + '</div></div>' +

      '<div class="card" id="m-contar"><h2>Quando a tarefa já aconteceu, há quatro modos de contar</h2>' +
      '<div class="tabela-rolagem"><table><tbody>' +
      '<tr><td style="white-space:nowrap"><strong>Colar a ata</strong></td>' +
      '<td>Cole a transcrição ou anexe os documentos (Word, PDF, Excel, vários de uma vez). ' +
      'O assistente separa o que o <em>cliente</em> fez, propõe uma evidência por decisão e depois ' +
      'relê as oito com as evidências novas. É o caminho mais completo: uma reunião costuma mover ' +
      'três ou quatro decisões de uma vez.</td></tr>' +
      '<tr><td style="white-space:nowrap"><strong>Quatro perguntas</strong></td>' +
      '<td>Entrou alguém novo? Ficou número acordado? Ficou próximo passo com data? Apareceu ' +
      'bloqueio novo? Cada “sim” vira evidência sem você digitar — é o caminho de quem está no ' +
      'carro depois da visita. As oito são relidas em seguida, do mesmo jeito.</td></tr>' +
      '<tr><td style="white-space:nowrap"><strong>Evidência direta</strong></td>' +
      '<td>Uma coisa só aconteceu e você sabe qual decisão ela move. Abre a tela de evidência já ' +
      'com o canal e a data da tarefa.</td></tr>' +
      '<tr><td style="white-space:nowrap"><strong>Nada a registrar</strong></td>' +
      '<td>A tarefa aconteceu e o cliente não se moveu. Isso também é informação: o negócio ' +
      'consumiu trabalho e não andou.</td></tr>' +
      '</tbody></table></div></div>' +

      '<div class="card"><h2>O que faz uma reunião valer</h2>' +
      '<p class="small">Quanto mais reuniões <em>com evidência</em> uma conta acumula, melhor ela fica — ' +
      'e reunião sem evidência é reunião que não aconteceu, para o índice. Três perguntas antes de ' +
      'marcar a próxima:</p>' +
      '<p class="small">1. <strong>Qual das oito eu vou provocar?</strong> A tarefa pede isso no ' +
      'campo “decisão que pretende provocar”, e o painel ali mostra o que conta como evidência dela ' +
      'e o que fazer no canal escolhido.</p>' +
      '<p class="small">2. <strong>Quem precisa estar?</strong> Venda que depende de uma pessoa só é ' +
      'o maior risco silencioso — o alerta do cockpit avisa.</p>' +
      '<p class="small">3. <strong>O que vai ficar combinado, com data e com dono?</strong> Negócio ' +
      'sem próximo passo combinado não dá para saber se atrasou.</p></div>' +
      '<div class="card"><h2>Força da evidência</h2>' +
      '<p class="small">Uma decisão só chega a 2 com evidência confirmada ou documentada.</p>' +
      '<div class="tabela-rolagem"><table><tbody>' + forcas + '</tbody></table></div></div>' +
      manualDasTelas() +
      manualDoPipeline() +
      manualDasTarefas() +
      manualDoAprendizado() +
      manualDaConfiguracao() +
      manualDaIAParaOVendedor() +
      manualDaIA() +
      manualDosLimites() +
      '<div class="card" id="m-perfis"><h2>Quem move a decisão por dentro</h2>' +
      '<p class="small">Do <em>Challenger Customer</em>: nem todo contato acessível move a compra. Três perfis mobilizam, três apenas conversam, um bloqueia.</p>' +
      '<div class="tabela-rolagem"><table><thead><tr><th>Perfil</th><th>Grupo</th><th>Como trabalhar</th></tr></thead><tbody>' +
      P.PERFIS.filter(function (x) { return x.grupo !== 'indefinido'; }).map(function (x) {
        const classe = { mobilizador: 'ok', falador: 'warn', bloqueador: 'dead' }[x.grupo];
        return '<tr><td><strong>' + esc(x.rotulo) + '</strong></td>' +
          '<td><span class="pill ' + classe + '">' + esc(x.grupo) + '</span></td>' +
          '<td>' + esc(x.dica) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="tiny muted" style="margin-top:8px">A pesquisa por trás desses perfis vem da CEB/Gartner e é defendida sobretudo por quem a produziu. Use como hipótese de trabalho, não como lei.</p></div>' +
      '<div class="sec-titulo" id="m-cadencia"><h2>As 8 decisões e a cadência multicanal</h2></div>' + dims;
  }

  /* ---------------- Dados ---------------- */
  /* Onde se descobre por que o assistente não apareceu. Ele é invisível de
     propósito quando está fora do ar — botão morto é pior que botão nenhum —,
     mas invisível sem explicação deixa quem publicou a função sem saída além
     do console do navegador. Aqui a resposta está escrita. */
  function blocoAssistente() {
    if (!global.IADIA || !global.IADIA.diagnostico) return '';
    const d = global.IADIA.diagnostico();
    const cor = d.situacao === 'ok' ? 'ok' : (d.situacao === 'desconhecido' ? '' : 'warn');
    return '<div class="card"><div class="row"><h2 style="margin:0">Assistente de IA</h2>' +
      '<span class="espaco"></span><span class="pill ' + cor + '">' + esc(d.titulo) + '</span></div>' +
      /* pre-line porque os diagnósticos separam sintoma de correção com uma
         linha em branco, e um parágrafo corrido junta as duas coisas. */
      '<p class="small" style="margin:8px 0 0;white-space:pre-line">' + esc(d.texto) + '</p>' +
      (d.situacao === 'ok'
        ? '<p class="tiny muted" style="margin:8px 0 0">Onde ele aparece: o cartão ' +
          '<strong>Próximos passos</strong> no cockpit, a tarefa marcada como ' +
          '<strong>já foi feita</strong> (ou o botão <strong>Concluir</strong> de uma tarefa aberta), ' +
          'e a caixa ✨ no alto dos formulários de conta, contato, oportunidade e evidência.</p>'
        : '<div class="row" style="margin-top:10px">' +
          '<button class="btn ghost mini" onclick="App.reverAssistente()"' +
          ' data-ajuda="Pergunta ao servidor de novo, sem recarregar a página.">Verificar de novo</button></div>') +
      '</div>';
  }

  /* O que está guardado, o que está visível e por quê. Existe porque "sumiu
     tudo" é um print, e um print não distingue as três causas — o servidor não
     mandou, veio carimbado com outra empresa, ou está tudo aqui e um filtro
     escondeu. As três têm correções diferentes. */
  function blocoDiagnostico() {
    const d = Store.diagnostico();
    if (!d.usuario) return '';

    const linhas = d.colecoes.map(function (c) {
      const some = c.guardados > 0 && c.visiveis === 0;
      return '<tr' + (some ? ' class="linha-alerta"' : '') + '><td>' + esc(c.colecao) + '</td>' +
        '<td class="right">' + c.guardados + '</td>' +
        '<td class="right' + (some ? ' atrasado' : '') + '">' + c.visiveis + '</td></tr>';
    }).join('');

    const empresas = Object.keys(d.registrosPorEmpresa).map(function (id) {
      const t = (d.empresasEspelhadas.filter(function (x) { return x.id === id; })[0] || {});
      const minha = id === d.meuTenantId;
      return '<li' + (minha ? '' : ' class="muted"') + '>' +
        esc(t.nome || id) + ' — ' + d.registrosPorEmpresa[id] + ' registro(s)' +
        (minha ? ' <strong>(a sua)</strong>' : ' <span class="atrasado">(de outra conta — invisível para você)</span>') +
        '</li>';
    }).join('');

    const escondidos = d.colecoes.some(function (c) { return c.guardados > 0 && c.visiveis === 0; });

    /* O outro retrato, e mais difícil de ler sem ajuda: as listas de
       configuração vieram e as de trabalho não. Aí não há nada escondido — o
       servidor respondeu que esta conta não tem empresa nem oportunidade
       nenhuma, e a causa está no banco. */
    const conta = function (nome) {
      const c = d.colecoes.filter(function (x) { return x.colecao === nome; })[0];
      return c ? c.guardados : 0;
    };
    const nadaDeTrabalho = !conta('contas') && !conta('oportunidades') &&
      (conta('segmentos') || conta('tiposTarefa'));

    return '<div class="card"><h2>Diagnóstico dos dados</h2>' +
      '<p class="small muted">Se a tela estiver vazia, a resposta está aqui. Guardados é o que existe ' +
      'neste aparelho; visíveis é o que as suas permissões e a sua empresa deixam ver.</p>' +

      (escondidos
        ? '<div class="aviso">Há registros guardados que você não está vendo. Quase sempre é porque eles ' +
          'pertencem à empresa de outra conta que já entrou neste navegador. Use <strong>Só baixar</strong> ' +
          'na Nuvem para trazer a carteira desta conta por cima.</div>'
        : '') +

      (nadaDeTrabalho
        ? '<div class="aviso">As listas de configuração vieram do servidor e as de trabalho não: ' +
          'zero empresas e zero oportunidades. Não há nada escondido aqui — <strong>o servidor respondeu ' +
          'que esta conta não tem nenhuma</strong>. As duas causas possíveis estão no banco: os registros ' +
          'estão carimbados com outra empresa, ou a correção que dá ao gestor a visão da empresa inteira ' +
          '(<code>nuvem/correcao-05-gestor.sql</code>) ainda não foi aplicada. ' +
          'O arquivo <code>nuvem/diagnostico.sql</code> responde qual das duas em uma consulta.</div>'
        : '') +

      '<div class="tabela-rolagem"><table><thead><tr><th>Coleção</th>' +
      '<th class="right">Guardados</th><th class="right">Visíveis</th></tr></thead>' +
      '<tbody>' + linhas + '</tbody></table></div>' +

      '<p class="small" style="margin-top:12px"><strong>Você:</strong> ' + esc(d.usuario) +
      ' · ' + esc(d.papel || '') + ' · empresa <strong>' + esc(d.minhaEmpresa || '(nenhuma)') + '</strong>' +
      (d.filtrosDoAdmin
        ? ' · recorte de administrador: empresa ' + esc(d.filtrosDoAdmin.tenant) +
          ', usuário ' + esc(d.filtrosDoAdmin.usuario)
        : '') + '</p>' +

      (empresas ? '<p class="small" style="margin:10px 0 4px"><strong>Registros por empresa:</strong></p>' +
        '<ul class="small">' + empresas + '</ul>' : '') +

      '<p class="small" style="margin:10px 0 0"><strong>Empresas espelhadas neste aparelho:</strong> ' +
      (d.empresasEspelhadas.length
        ? d.empresasEspelhadas.map(function (t) { return esc(t.nome || t.id); }).join(' · ')
        : '(nenhuma)') + '</p>' +

      '<div class="row" style="margin-top:12px">' +
      (global.IADNuvem.conectado()
        ? '<button class="btn" onclick="App.perguntarAoServidor()"' +
          ' data-ajuda-titulo="Perguntar ao servidor" data-ajuda="O app pergunta ao banco o que ele acha de você: se a correção do gestor está aplicada, qual empresa ele diz que é a sua, e quantos registros ele deixa você ler. É o que separa as três causas de tela vazia.">Perguntar ao servidor por quê</button>'
        : '') +
      '<button class="btn ghost mini" onclick="App.copiarDiagnostico()">Copiar diagnóstico</button>' +
      '<button class="btn ghost mini" onclick="App.tentarBaixarDeNovo()">Baixar do servidor de novo</button>' +
      '</div><div id="resposta-servidor"></div></div>';
  }

  function dados() {
    const est = Store.dados();
    return '<h1>Configuração e instalação</h1>' +
      '<div class="card"><h2>Instalar no desktop e no celular</h2>' +
      '<p class="small">Este é um PWA: o mesmo código roda no navegador, instala no Windows/macOS/Linux e vira ícone no Android e no iPhone.</p>' +
      '<ul class="small"><li><strong>Android/Chrome/Edge:</strong> menu ⋮ → “Instalar aplicativo”.</li>' +
      '<li><strong>iPhone/Safari:</strong> Compartilhar → “Adicionar à Tela de Início”.</li>' +
      '<li><strong>Desktop:</strong> ícone de instalar na barra de endereço.</li></ul>' +
      '<button class="btn alt" onclick="App.instalar()" data-ajuda-titulo="Instalar" data-ajuda="Cria um ícone próprio no computador ou celular. O app passa a abrir em janela separada e a funcionar sem internet.">Instalar aplicativo</button></div>' +

      '<div class="card"><h2>Importar planilha</h2>' +
      '<p class="small muted">Traga a carteira que já existe. Importe nesta ordem: empresas, depois contatos, depois oportunidades — contatos e oportunidades precisam da empresa já cadastrada.</p>' +
      '<div class="row"><button class="btn" onclick="App.importarCsv(\'empresas\')" data-ajuda="Importa empresas de um CSV. Comece por aqui: contatos e oportunidades precisam da empresa já cadastrada.">Empresas</button>' +
      '<button class="btn" onclick="App.importarCsv(\'contatos\')" data-ajuda="Importa contatos. Cada linha precisa nomear uma empresa que já exista.">Contatos</button>' +
      '<button class="btn" onclick="App.importarCsv(\'oportunidades\')" data-ajuda="Importa oportunidades. As oito decisões começam em zero: quem as pontua é a evidência.">Oportunidades</button></div>' +
      '<div class="row" style="margin-top:10px"><span class="tiny muted">Modelos:</span>' +
      '<button class="btn ghost mini" onclick="App.baixarModelo(\'empresas\')" data-ajuda="Baixa um CSV de exemplo com as colunas certas para empresas.">empresas.csv</button>' +
      '<button class="btn ghost mini" onclick="App.baixarModelo(\'contatos\')" data-ajuda="Baixa um CSV de exemplo com as colunas certas para contatos.">contatos.csv</button>' +
      '<button class="btn ghost mini" onclick="App.baixarModelo(\'oportunidades\')" data-ajuda="Baixa um CSV de exemplo com as colunas certas para oportunidades.">oportunidades.csv</button></div></div>' +

      blocoAssistente() +
      blocoNuvem() +
      blocoMinhaConta() +
      blocoLinkedHelper() +

      blocoDiagnostico() +

      '<div class="card"><h2>Backup</h2>' +
      '<p class="small muted">Os dados ficam no dispositivo (offline). Exporte para levar de máquina ou compartilhar com o time. Anexos não entram no JSON.</p>' +
      '<div class="row"><button class="btn" onclick="App.exportar()" data-ajuda-titulo="Exportar" data-ajuda="Baixa toda a carteira num arquivo, para backup ou para levar de máquina. Anexos não entram.">Exportar JSON</button>' +
      '<button class="btn ghost" onclick="App.importar()" data-ajuda-titulo="Importar" data-ajuda="Substitui a carteira deste aparelho pelo conteúdo do arquivo. Suas contas de acesso são preservadas.">Importar JSON</button></div>' +
      '<p class="tiny muted" style="margin-top:10px">' + est.contas.length + ' contas · ' + est.contatos.length + ' contatos · ' +
      est.oportunidades.length + ' oportunidades · ' + est.tarefas.length + ' tarefas.</p>' +
      '<p class="tiny muted" id="uso-anexos">Anexos: calculando…</p></div>' +

      '<div class="card"><h2>Demonstração</h2>' +
      '<p class="small muted">Carrega uma carteira fictícia com os grupos de pipeline para treinar a leitura do modelo.</p>' +
      '<div class="row"><button class="btn ghost" onclick="App.carregarDemo()" data-ajuda-titulo="Demonstração" data-ajuda="Carrega uma carteira fictícia com os cinco grupos de pipeline, para treinar a leitura do modelo. Substitui o que está aqui.">Carregar demonstração</button>' +
      '<button class="btn ghost" onclick="App.limpar()" data-ajuda-titulo="Apagar tudo" data-ajuda="Apaga a carteira deste aparelho. Não apaga o que já foi sincronizado no servidor, nem os acessos.">Apagar tudo</button></div></div>' +

      auditoriaDasCampanhas();
  }

  /* ---------- não conformidades das campanhas do Linked Helper ----------

     A recusa some duas vezes: o lead é desmarcado na importação e depois
     excluído da ponte. Some certo — ela não é negócio —, e some errado, porque
     era o único sinal de que a campanha estava falando com o público errado.
     Vinte leads e seis recusas é um dado sobre a campanha, não sobre as seis
     pessoas.

     Por campanha, e não por pessoa, porque é a campanha que se conserta. O
     motivo mais frequente vem em destaque: é ele que diz o que corrigir na
     próxima lista. */
  function auditoriaDasCampanhas() {
    const grupos = Store.recusasPorCampanha();
    if (!grupos.length) {
      return '<div class="card"><h2>Não conformidades das campanhas</h2>' +
        '<p class="small muted">Toda resposta do Linked Helper lida como uma recusa fica registrada aqui, ' +
        'fora do pipeline, para que os motivos possam ser estudados depois. Nenhuma até agora.</p></div>';
    }
    const total = grupos.reduce(function (n, g) { return n + g.itens.length; }, 0);

    const corpo = grupos.map(function (g) {
      const sdrs = Object.keys(g.sdrs).sort(function (a, b) { return g.sdrs[b] - g.sdrs[a]; });
      const linhas = g.itens.map(function (r) {
        return '<tr>' +
          '<td>' + U.data(r.data) + '</td>' +
          '<td><strong>' + esc(r.nome || 'sem nome') + '</strong>' +
            (r.empresa ? '<br><span class="tiny muted">' + esc(r.empresa) + '</span>' : '') + '</td>' +
          '<td>' + esc(r.motivo) +
            '<br><span class="tiny muted">lido por ' + (r.origem === 'ia' ? 'assistente' : 'regra') + '</span></td>' +
          '<td class="tiny">' + esc(String(r.texto || '').slice(0, 220)) + '</td>' +
          '<td><button class="btn ghost mini" onclick="App.excluirRecusa(\'' + r.id + '\')">Excluir</button></td>' +
        '</tr>';
      }).join('');

      return '<details style="margin-top:12px"><summary>' +
        '<strong>' + esc(g.campanha) + '</strong> · ' +
        g.itens.length + (g.itens.length === 1 ? ' recusa' : ' recusas') +
        (g.principal ? ' · mais comum: ' + esc(g.principal) : '') +
        (sdrs.length ? ' · ' + esc(sdrs.join(', ')) : '') +
        '</summary>' +
        '<div class="tabela-rolagem"><table class="tabela"><thead><tr>' +
        '<th>Quando</th><th>Quem</th><th>O que foi lido</th><th>O que a pessoa disse</th><th></th>' +
        '</tr></thead><tbody>' + linhas + '</tbody></table></div>' +
        '<div class="row" style="margin-top:8px">' +
        '<button class="btn ghost mini" onclick="App.limparRecusas(\'' + esc(g.campanha).replace(/'/g, "\\'") + '\')">' +
        'Apagar as desta campanha</button></div>' +
        '</details>';
    }).join('');

    return '<div class="card"><h2>Não conformidades das campanhas</h2>' +
      '<p class="small muted">' + total + (total === 1 ? ' resposta lida' : ' respostas lidas') +
      ' como recusa em ' + grupos.length + (grupos.length === 1 ? ' campanha' : ' campanhas') +
      '. Elas ficam fora do pipeline de propósito: dentro dele seriam negócio nascido de um não. ' +
      'Aqui servem para descobrir com quem a campanha está falando por engano.</p>' +
      corpo + '</div>';
  }

  /* Senha só é senha depois de trocada por quem vai usá-la: a inicial passou
     pela mão de quem criou o acesso. Por isso este bloco existe, e é o
     primeiro a ser visto por quem acabou de entrar pela primeira vez. */
  function blocoMinhaConta() {
    const N = global.IADNuvem;
    const e = N.estado();
    if (!e.conectado) return '';
    return '<div class="card"><h2>Minha conta</h2>' +
      '<p class="small muted">Conectado como <strong>' + esc(e.email) + '</strong>.</p>' +
      '<p class="small">Se a sua senha foi criada por outra pessoa, ou se ela já circulou em ' +
      'e-mail, mensagem ou arquivo, troque agora. A troca vale em todos os aparelhos.</p>' +
      '<button class="btn alt" onclick="App.trocarMinhaSenha()"' +
      ' data-ajuda-titulo="Trocar minha senha" data-ajuda="Define uma nova senha para o seu acesso no servidor. ' +
      'Vale a partir do próximo login, em qualquer aparelho.">Trocar minha senha</button></div>';
  }

  /* A nuvem é opcional: sem ela o app segue local, como sempre foi. */
  function blocoNuvem() {
    const N = global.IADNuvem;
    const e = N.estado();

    if (!e.configurada) {
      return '<div class="card"><div class="row"><h2 style="margin:0">Nuvem (Supabase)</h2><span class="espaco"></span>' +
        '<button class="btn ghost mini" onclick="App.configurarNuvem()" data-ajuda-titulo="Configurar nuvem" data-ajuda="Endereço e chave pública do Supabase. Já vêm preenchidos; só troque para apontar a outro banco.">Configurar</button></div>' +
        '<p class="small muted" style="margin:8px 0 0">Ligue o app a um banco na nuvem para a equipe compartilhar a mesma carteira e para o login passar a ser verificado no servidor. ' +
        'O passo a passo e o arquivo do banco estão na pasta <code>nuvem/</code> do projeto.</p></div>';
    }

    if (!e.conectado) {
      return '<div class="card"><div class="row"><h2 style="margin:0">Nuvem (Supabase)</h2><span class="espaco"></span>' +
        '<span class="pill warn">desconectado</span>' +
        '<button class="btn ghost mini" onclick="App.configurarNuvem()" data-ajuda-titulo="Alterar nuvem" data-ajuda="Troca o endereço e a chave pública do banco. Só mexa para apontar a outro projeto Supabase.">Alterar</button></div>' +
        '<p class="small muted" style="margin:8px 0 12px">Configurada, mas ninguém entrou nesta máquina.</p>' +
        '<div class="row"><button class="btn alt mini" onclick="App.entrarNuvem()" data-ajuda-titulo="Entrar na nuvem" data-ajuda="Autentica no servidor com o e-mail e senha da sua conta, para sincronizar a carteira.">Entrar na nuvem</button>' +
        '<button class="btn ghost mini" onclick="App.cadastrarNuvem()" data-ajuda-titulo="Criar acesso" data-ajuda="Cria a conta no servidor. Chega um e-mail de confirmação — a confirmação vale mesmo que o link mostre página de erro.">Criar acesso na nuvem</button></div></div>';
    }

    const perfil = e.perfil || {};
    const semEmpresa = !perfil.tenant_id;
    /* O botão de alterar só existia enquanto desconectado — e é justamente
       conectado que se descobre que a chave é a errada: o app entra, lê e
       grava, e só as Edge Functions recusam. Sem este botão a saída era
       editar src/config.js e publicar de novo. */
    return '<div class="card"><div class="row"><h2 style="margin:0">Nuvem (Supabase)</h2><span class="espaco"></span>' +
      '<span class="pill ok">conectado</span>' +
      '<button class="btn ghost mini" onclick="App.configurarNuvem()"' +
      ' data-ajuda-titulo="Alterar nuvem" data-ajuda="Endereço e chave pública do projeto. Troque a chave se as Edge Functions recusarem a chamada — o Supabase mudou o formato, e a antiga (eyJ...) já não vale para elas.">Alterar</button></div>' +
      '<p class="small muted" style="margin:8px 0 4px">' + esc(e.email) +
      (perfil.nome ? ' · ' + esc(perfil.nome) : '') +
      (perfil.papel === 'admin' ? ' · <strong>administrador</strong>' : '') + '</p>' +
      (e.ultima ? '<p class="tiny muted" style="margin:0 0 12px">Última sincronização: ' + esc(e.ultima.replace('T', ' ').slice(0, 16)) + '</p>' : '') +
      (semEmpresa
        ? '<div class="aviso" style="margin-bottom:12px">Seu usuário ainda não tem empresa na nuvem. Defina antes de sincronizar — é ela que separa a sua carteira das outras.</div>' +
          '<button class="btn alt mini" onclick="App.definirEmpresaNuvem()">Definir minha empresa</button>'
        : '<div class="aviso-empresa">Sincronizando para <strong>' +
            esc((perfil.tenants && perfil.tenants.nome) || 'sua empresa') + '</strong>. ' +
            'Tudo que subir daqui passa a pertencer a ela.</div>' +
          '<div class="row"><button class="btn alt mini" onclick="App.sincronizarNuvem()" data-ajuda-titulo="Sincronizar" data-ajuda="Envia a sua carteira e traz o que os outros mudaram. Nada sobe sozinho: sincronize ao começar e ao terminar o dia.">Sincronizar agora</button>' +
          '<button class="btn ghost mini" onclick="App.puxarNuvem()" data-ajuda-titulo="Só baixar" data-ajuda="Traz do servidor sem enviar nada daqui. Útil ao abrir o app noutro aparelho.">Só baixar</button>' +
          '<button class="btn ghost mini" onclick="App.sairNuvem()">Sair da nuvem</button></div>' +
          '<p class="tiny muted" style="margin:10px 0 0">Sincronizar envia a sua carteira e traz o que os outros mudaram. ' +
          'O app continua funcionando offline com a última cópia baixada.</p>') +
      '<div id="recado-nuvem"></div></div>';
  }

  /* O app não recebe webhook — quem recebe é a ponte. Aqui só buscamos o que chegou. */
  function blocoLinkedHelper() {
    const c = global.IADIntegracoes.config();
    return '<div class="card"><div class="row"><h2 style="margin:0">Linked Helper</h2><span class="espaco"></span>' +
      '<button class="btn ghost mini" onclick="App.configurarPonte()" data-ajuda-titulo="Ponte do Linked Helper" data-ajuda="Endereço e chave de leitura da ponte no Cloudflare. É por onde as respostas do LinkedIn chegam.">' + (c.url ? 'Alterar ponte' : 'Configurar ponte') + '</button>' +
      (c.url ? '<button class="btn alt mini" onclick="App.buscarLeads()" data-ajuda-titulo="Buscar respostas" data-ajuda="Procura na ponte quem respondeu no LinkedIn. Cada resposta vira empresa, contato e oportunidade com um clique.">Buscar respostas</button>' : '') + '</div>' +
      (c.url
        ? '<p class="tiny muted" style="margin:8px 0 0">Ponte: ' + esc(c.url) + '</p>'
        : '<p class="small muted" style="margin:8px 0 0">Quando alguém responde no LinkedIn, o Linked Helper dispara um webhook. Como este app roda no navegador, ele não tem endereço para receber: quem recebe é uma ponte, e o app busca de lá. O código da ponte está na pasta <code>ponte/</code> do projeto.</p>') +
      avisoDeTarefasDoLH() +
      '<div id="caixa-linkedhelper"></div></div>';
  }

  /* As importações feitas antes de a tarefa existir. Não crio sozinho ao abrir
     a tela: inventar tarefa no dado de alguém é pior que faltar uma. O app
     conta quantas são e deixa o botão — quem decide é quem vai ligar. */
  function oportunidadesDoLHSemTarefa() {
    return Store.dados().oportunidades.filter(function (op) {
      if (op.origem !== 'Linked Helper' || op.desfecho) return false;
      return !Store.tarefasDaOportunidade(op.id).length;
    });
  }

  function avisoDeTarefasDoLH() {
    const faltando = oportunidadesDoLHSemTarefa();
    if (!faltando.length) return '';
    return '<div class="aviso" style="margin-top:10px">' +
      faltando.length + (faltando.length === 1
        ? ' negociação veio do Linked Helper e não tem nenhuma tarefa marcada'
        : ' negociações vieram do Linked Helper e não têm nenhuma tarefa marcada') +
      ' — foram importadas antes de o app passar a abrir a tarefa de contato. ' +
      '<button class="btn ghost mini" onclick="App.criarTarefasDoLH()">Criar as tarefas que faltam</button></div>';
  }

  function listaLeads(leads) {
    if (!leads) return '';
    if (!leads.length) return '<div class="vazio small">Nenhuma resposta nova na ponte.</div>';
    return '<div class="lista" style="margin-top:12px">' + leads.map(function (l) {
      /* Quem saiu da empresa não é comprador daquela conta. O aviso vem antes
         do botão de converter, não depois de a conta já ter sido criada. */
      const saiu = l.saiuEm
        ? '<div class="aviso" style="margin-top:8px">Saiu da ' + esc(l.empresa || 'empresa') +
          ' em ' + esc(l.saiuEm) + '. Confirme onde a pessoa está hoje antes de criar a conta.</div>'
        : '';

      const rede = [
        l.grau === 'DISTANCE_1' ? '1\u00ba grau' : '',
        l.mutuos ? l.mutuos + ' em comum' : '',
        l.mensagensDele ? l.mensagensDele + (l.mensagensDele === 1 ? ' resposta dele' : ' respostas dele') : '',
        l.respostaEm ? '\u00faltima em ' + U.data(l.respostaEm) : ''
      ].filter(Boolean).join(' \u00b7 ');

      return '<div class="foco ' + (l.saiuEm ? 'u3' : 'u0') + '">' +
        '<div class="row"><strong>' + esc(l.nome || 'Sem nome') + '</strong>' +
        (l.cargo ? '<span class="tiny muted">' + esc(l.cargo) + '</span>' : '') +
        '<span class="espaco"></span>' +
        (l.campanha ? '<span class="pill">' + esc(l.campanha) + '</span>' : '') + '</div>' +
        '<div class="small muted">' + esc(l.empresa || 'empresa n\u00e3o informada') +
        (l.local ? ' \u00b7 ' + esc(l.local) : '') + '</div>' +
        (rede ? '<div class="tiny muted" style="margin-top:4px">' + esc(rede) +
          (l.operador ? ' \u00b7 prospec\u00e7\u00e3o de ' + esc(l.operador) : '') + '</div>' : '') +
        saiu +
        (l.resposta ? '<div class="motivo" style="margin-top:8px">\u201c' + esc(l.resposta) + '\u201d</div>' : '') +
        (l.insight ? '<p class="tiny muted" style="margin:6px 0 0">Insight da campanha pronto para usar.</p>' : '') +
        '<div class="row" style="margin-top:10px">' +
        '<button class="btn ' + (l.saiuEm ? 'ghost' : 'alt') + ' mini" onclick="App.converterLead(\'' + esc(l.id) + '\')">Criar oportunidade</button>' +
        (l.linkedin ? '<a class="btn ghost mini" href="' + esc(l.linkedin) + '" target="_blank" rel="noopener">Abrir perfil</a>' : '') +
        '<button class="btn ghost mini" onclick="App.descartarLead(\'' + esc(l.id) + '\')">Descartar</button>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  /* ---------------- Conferência da importação do Linked Helper ----------------
     Importar tudo sem olhar encheria o pipeline de oportunidade que não é
     oportunidade — e um pipeline assim derruba o IAD médio e faz a
     classificação mentir. Então vem tudo marcado, menos o que tem problema:
     quem saiu da empresa e quem ainda não respondeu nada. */
  /* Quem respondeu dizendo NÃO. É a resposta mais valiosa da lista e a que o
     sistema tratava pior: "não tenho relação alguma com isso", "me retire da
     lista", "não moro em condomínio" chegavam marcadas igual a "pode enviar",
     e viravam empresa, contato, oportunidade e tarefa — pipeline nascido de
     uma recusa, que é a definição de negócio zumbi.

     A leitura é do texto do cliente, sem IA, porque tem de funcionar mesmo
     com o assistente fora do ar — e porque é justamente no lote grande, que é
     quando o assistente falha, que ninguém lê as vinte conversas.

     Ela não descarta ninguém: desmarca e diz por quê. Recusa não é sempre
     recusa, e quem decide isso é quem vende. */
  const RECUSAS = [
    { re: /\bn[ãa]o (tenho|possuo) (rela[çc][ãa]o|nada|interesse|v[íi]nculo)/i, diz: 'disse que não tem relação com o tema' },
    { re: /\b(me )?(retir[ae]|remov[ae]|tir[ae])[^.]{0,20}(da lista|do mailing|das mensagens)/i, diz: 'pediu para sair da lista' },
    { re: /\bn[ãa]o me envi/i, diz: 'pediu para não receber mensagens' },
    { re: /\bn[ãa]o (moro|resido|trabalho)\b/i, diz: 'disse que não é o caso dele' },
    { re: /\bn[ãa]o (tenho|temos) interesse/i, diz: 'disse que não tem interesse' },
    { re: /\bmoro (em casa|na ro[çc]a|fora de condom[íi]nio)/i, diz: 'disse que não é o caso dele' }
  ];

  function recusaDoCliente(l) {
    const dele = (l.conversa || []).filter(function (m) { return !m.nosso; });
    const texto = dele.length ? dele.map(function (m) { return m.texto; }).join(' ') : (l.resposta || '');
    if (!texto) return '';
    const achada = RECUSAS.filter(function (r) { return r.re.test(texto); })[0];
    if (achada) return achada.diz;
    /* A regra pega a recusa que usa as palavras de sempre. A IA pega a que
       não usa nenhuma — "que legal, mas não é para mim", "hoje moro em casa",
       "não é bem a minha praia". Uma não substitui a outra: a regra funciona
       com o assistente fora do ar, e é o lote grande, onde ele falha, que
       ninguém lê à mão. */
    if (l.respostaDaIA === 'negativa') {
      return l.porqueRecusa || 'o assistente leu a resposta como uma recusa';
    }
    return '';
  }

  /* O lead que já virou registro numa importação anterior. Ele não deveria
     voltar — a ponte apaga o que foi importado —, mas volta quando o Linked
     Helper reenvia a mesma pessoa com uma interação nova, que é o caso 02.

     E aí ele NÃO vem desmarcado: pelas regras de reconciliação, trazer é o
     certo, porque é isso que atualiza o negócio com a fala nova. O que muda é
     o que a tela diz. Sem este aviso o vendedor lê "20 leads" como "20
     negócios novos" e vai procurar no pipeline vinte cartões que não existem. */
  function jaNoCRM(l) {
    const perfil = /linkedin\.com\/in\/([^/?#]+)/i.exec(String(l.linkedin || ''));
    if (!perfil) return '';
    const chave = perfil[1].toLowerCase();
    const contato = Store.dados().contatos.filter(function (c) {
      const m = /linkedin\.com\/in\/([^/?#]+)/i.exec(String(c.linkedin || ''));
      return m && m[1].toLowerCase() === chave;
    })[0];
    if (!contato) return '';
    const conta = Store.conta(contato.contaId);
    return conta ? conta.nome : '';
  }

  function motivoDeDuvida(l) {
    if (l.saiuEm) return 'Saiu da ' + (l.empresa || 'empresa') + ' em ' + l.saiuEm;
    if (!l.resposta) return 'Ainda não respondeu — não há evidência do cliente';
    const recusa = recusaDoCliente(l);
    if (recusa) return 'Respondeu NÃO: ' + recusa + '. Trazer assim mesmo cria negócio a partir de uma recusa.';
    if (!l.empresa) return 'Sem empresa identificada';
    return '';
  }

  /* "Usuário" é o padrão neutro: o cargo diz que a pessoa usa, nunca que ela
     decide. Promover por gentileza mataria o alerta de papel crítico ausente,
     que é justamente o que faz o vendedor procurar quem assina. */
  /* Confiança é o que diz ONDE olhar. Sem ela o vendedor confere os vinte ou
     nenhum; com ela, confere os três que a IA marcou como palpite. */
  function rotuloDaSugestao(l) {
    if (!l.segmentoSugerido) return '';
    if (l.confiancaSegmento === 'baixa') return ' \u00b7 palpite';
    if (l.confiancaSegmento === 'media') return ' \u00b7 por proximidade';
    return ' \u00b7 sugerido';
  }

  /* Quando nada coube, o mais próximo vira um botão: "Outros" resolvido num
     clique vale mais que "Outros" com um conselho embaixo. */
  function motivoDoSegmento(l, i) {
    const partes = [];
    if (l.porqueSegmento) partes.push(esc(l.porqueSegmento));
    if (l.maisProximoSegmento) {
      partes.push('mais pr\u00f3ximo: <button type="button" class="pill mini" ' +
        'onclick="App.usarSegmentoProximo(' + i + ',this)">' + esc(l.maisProximoSegmento) + '</button>');
    }
    return partes.length ? '<span class="origem">' + partes.join(' \u00b7 ') + '</span>' : '';
  }

  function opcoesPapel(escolhido) {
    const alvo = (escolhido && P.PAPEIS.indexOf(escolhido) !== -1) ? escolhido : 'Usuário';
    return P.PAPEIS.map(function (n) {
      return '<option value="' + esc(n) + '"' + (n === alvo ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
  }

  function opcoesSegmento(escolhido) {
    /* "Outros" existe sempre: é onde cai o que a IA não soube classificar, e
       de onde a pessoa move depois. Melhor "Outros" do que segmento errado —
       o agrupamento do painel é lido pelo dono da empresa.

       Sem sugestão, o padrão é "Outros" e não o primeiro da lista. Sem esta
       linha, um select sem nada marcado faz o navegador escolher o primeiro
       item sozinho: com o assistente desligado, toda empresa importada sairia
       carimbada com o segmento que por acaso estivesse no topo do catálogo. */
    const lista = Store.nomesDoCatalogo('segmentos').slice();
    if (lista.indexOf('Outros') === -1) lista.push('Outros');
    const alvo = (escolhido && lista.indexOf(escolhido) !== -1) ? escolhido : 'Outros';
    return lista.map(function (n) {
      return '<option value="' + esc(n) + '"' + (n === alvo ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
  }

  /* A IA reconheceu que a empresa deste lead é uma que já está na carteira.
     Vem marcado, porque na maioria das vezes está certo e desmarcado por
     padrão viraria a caixa que ninguém marca. Mas vem VISÍVEL e com o motivo
     escrito, porque juntar duas empresas erradas é o erro que não se desfaz:
     o contato de uma entra no grupo comprador da outra e nunca mais sai.

     A caixa de conferência da tela de importação é o único lugar onde isso
     ainda custa um clique. Depois de importado, custa uma limpeza. */
  function juntarNaConta(l, i) {
    if (!l.contaSugerida) return '';
    const conta = Store.conta(l.contaSugerida);
    if (!conta) return '';
    return '<label class="linha-achado" style="margin-top:6px">' +
      '<input type="checkbox" data-conta="' + i + '" checked>' +
      '<span class="tiny">Entra na empresa que já existe: <strong>' + esc(conta.nome) + '</strong>' +
      (l.porqueConta ? ' <span class="muted">— ' + esc(l.porqueConta) + '</span>' : '') +
      '</span></label>';
  }

  function revisaoDaImportacao(leads, avisoSegmento) {
    const linhas = leads.map(function (l, i) {
      const duvida = motivoDeDuvida(l);
      const rede = [
        l.grau === 'DISTANCE_1' ? '1\u00ba grau' : '',
        l.mutuos ? l.mutuos + ' em comum' : '',
        l.mensagensDele ? l.mensagensDele + (l.mensagensDele === 1 ? ' resposta dele' : ' respostas dele') : '',
        l.respostaEm ? '\u00faltima em ' + U.data(l.respostaEm) : ''
      ].filter(Boolean).join(' \u00b7 ');

      return '<li class="achado">' +
        '<label class="linha-achado"><input type="checkbox" data-lead="' + i + '"' +
        (duvida ? '' : ' checked') + '>' +
        '<strong>' + esc(l.nome || 'Sem nome') + '</strong>' +
        (l.cargo ? '<span class="tiny muted">' + esc(l.cargo) + '</span>' : '') +
        '<span class="espaco"></span>' +
        '<span class="pill' + (duvida ? '' : ' navy') + '">' + esc(l.empresa || 'sem empresa') + '</span>' +
        '<button type="button" class="btn ghost mini" data-excluir="' + i + '" ' +
        'title="Tira este lead da ponte para sempre. Ele não volta na próxima busca.">Excluir</button>' +
        '</label>' +
        '<div class="row escolhas">' +
          '<label class="campo mini"><span>Segmento' + rotuloDaSugestao(l) + '</span>' +
          '<select data-segmento="' + i + '">' + opcoesSegmento(l.segmentoSugerido) + '</select>' +
          motivoDoSegmento(l, i) + '</label>' +
          /* O papel é o que a cobertura do grupo comprador conta. Sugerido pelo
             cargo, conferido aqui: o cargo diz muito e não diz tudo. */
          '<label class="campo mini"><span>Papel na compra' + (l.papelSugerido ? ' \u00b7 sugerido' : '') + '</span>' +
          '<select data-papel="' + i + '">' + opcoesPapel(l.papelSugerido) + '</select></label>' +
        '</div>' +
        (jaNoCRM(l)
          ? '<p class="tiny" style="margin:6px 0 0"><b>Já está no CRM</b> em ' + esc(jaNoCRM(l)) +
            ' — este lead ATUALIZA o que existe, não cria negócio novo.</p>'
          : '') +
        '<p class="small muted" style="margin:6px 0 0">' +
          (l.operador ? 'SDR: <strong>' + esc(l.operador) + '</strong>' : 'SDR não identificado') +
          (l.campanha ? ' \u00b7 campanha: ' + esc(l.campanha) : '') +
          (rede ? ' \u00b7 ' + esc(rede) : '') + '</p>' +
        (duvida ? '<p class="compromisso small" style="margin:6px 0 0">' + esc(duvida) + '</p>' : '') +
        (l.conversa && l.conversa.length
          ? '<p class="conversa">' + l.conversa.map(function (m) {
              return '<b>' + esc(m.nosso ? (l.operador || 'SDR') : (m.de || l.nome || 'Prospect')) + ':</b> ' + esc(m.texto);
            }).join('\n') + '</p>'
          : (l.resposta ? '<p class="origem">\u201c' + esc(l.resposta) + '\u201d</p>' : '')) +
        juntarNaConta(l, i) +
        (l.insight
          ? '<p class="tiny muted" style="margin:6px 0 0"><b>Reenquadramento (rascunho):</b> ' + esc(l.insight) + '</p>'
          : '') +
      '</li>';
    }).join('');

    const comDuvida = leads.filter(motivoDeDuvida).length;

    return '<form method="dialog"><div class="corpo">' +
      '<h2>Importar do Linked Helper</h2>' +
      '<p class="small muted">Cada marcado vira empresa, contato e oportunidade em ' +
      '<strong>Prospec\u00e7\u00e3o</strong> \u2014 ou <strong>Conex\u00e3o</strong>, se a pessoa j\u00e1 respondeu \u2014 ' +
      'com origem Linked Helper. A resposta entra como evid\u00eancia de for\u00e7a relato, na data em que ela aconteceu.</p>' +
      (comDuvida
        ? '<div class="aviso">' + comDuvida + (comDuvida === 1 ? ' lead veio desmarcado' : ' leads vieram desmarcados') +
          ': quem respondeu que n\u00e3o, quem saiu da empresa ou quem ainda n\u00e3o respondeu. ' +
          'Marque se quiser trazer assim mesmo.</div>'
        : '') +
      (avisoSegmento ? '<div class="aviso">' + esc(avisoSegmento) + '</div>' : '') +
      /* Com vinte leads na tela, decidir o que entra é vinte cliques — ou dois,
         se der para começar do extremo certo. Quem trouxe um lote quase todo
         bom desmarca as exceções; quem trouxe um lote quase todo ruim limpa
         tudo e marca as três que valem. O contador ao lado existe porque o
         botão muda o que está fora da vista: sem ele, marcar todos numa lista
         rolada é um clique sem retorno visível. */
      '<div class="row barra-marcar">' +
        '<button type="button" class="btn ghost mini" data-marcar="todos">Marcar todos</button>' +
        '<button type="button" class="btn ghost mini" data-marcar="nenhum">Desmarcar todos</button>' +
        /* O fluxo real de um lote de vinte: desmarca o lixo, importa o que
           presta e apaga o resto num clique. Sem isto o lixo volta na busca
           seguinte, e volta de novo na outra, até a lista ficar impossível
           de ler — que é o que faz o vendedor parar de importar. */
        '<button type="button" class="btn ghost mini" data-excluir-desmarcados>Excluir os desmarcados</button>' +
        '<span class="espaco"></span>' +
        '<span class="tiny muted" data-conta-marcados></span>' +
      '</div>' +
      '<ul class="achados">' + linhas + '</ul>' +
      '</div><div class="rodape">' +
      '<button class="btn ghost" value="cancelar" type="submit">Cancelar</button>' +
      '<button class="btn" value="ok" type="submit">Importar os marcados</button>' +
      '</div></form>';
  }

  /* ---------------- Plano sugerido pela IA ----------------
     O bloco nasce vazio com um botão: análise custa chamada, e abrir o
     cockpit não é pedir análise. O que volta vem sempre amarrado a uma das
     oito decisões — passo solto, que não diz qual decisão pretende mover, é
     conselho de LinkedIn, não método. */
  /* O plano vive aqui, e não no app, porque render() reconstrói a tela: se o
     resultado fosse injetado no DOM depois, criar uma tarefa a partir de um
     passo apagaria os outros — e a pessoa só conseguiria usar o primeiro. */
  let planoIA = null;

  function definirPlano(opId, plano) { planoIA = plano ? { opId: opId, plano: plano } : null; }
  function planoGuardado(opId) {
    return (planoIA && planoIA.opId === opId) ? planoIA.plano : null;
  }

  function blocoPlanoIA(op) {
    if (!U.assistenteAtivo()) return '';
    const guardado = planoGuardado(op.id);
    return '<div class="card" id="plano-ia"><div class="row"><h2 style="margin:0">Próximos passos</h2>' +
      '<span class="espaco"></span>' +
      '<button class="btn ghost mini" onclick="App.lerDecisoes(\'' + op.id + '\')"' +
      ' data-ajuda-titulo="Ler as oito decisões" data-ajuda="Lê o que já está registrado — e a reunião que você colar — e propõe a nota de cada uma das oito. Você confere as oito numa tela só e grava.">Ler as 8 decisões</button>' +
      '<button class="btn alt mini" onclick="App.planejar(\'' + op.id + '\')"' +
      ' data-ajuda-titulo="Analisar com IA" data-ajuda="Lê as evidências deste negócio — o que o cliente disse, com as palavras dele — e propõe o que fazer agora, cada passo ligado a uma das oito decisões.">' +
      (guardado ? 'Analisar de novo' : 'Analisar com IA') + '</button></div>' +
      (guardado
        ? planoDaIA(op, guardado)
        : '<p class="small muted" style="margin:10px 0 0">O assistente lê as evidências deste negócio e propõe o que fazer agora. As notas ele já grava sozinho ao concluir uma tarefa — só sobe, e nota 2 continua exigindo evidência confirmada ou documentada.</p>') +
      '</div>';
  }

  function planoDaIA(op, plano) {
    if (!plano || !plano.passos.length) {
      return '<p class="small muted" style="margin:10px 0 0">O assistente não encontrou passo novo a propor com o que está registrado. Registre uma evidência e tente de novo.</p>';
    }
    const passos = plano.passos.map(function (pa, i) {
      const dim = P.DIMENSOES.filter(function (d) { return d.id === pa.dimensao; })[0];
      return '<li class="achado">' +
        '<div class="row"><span class="pill navy">' + esc(dim ? dim.nome : pa.dimensao) + '</span>' +
        '<strong>' + esc(pa.acao) + '</strong></div>' +
        (pa.porque ? '<p class="small muted" style="margin:6px 0 0">' + esc(pa.porque) + '</p>' : '') +
        (pa.pergunta ? '<p class="origem">Pergunte: \u201c' + esc(pa.pergunta) + '\u201d</p>' : '') +
        '<div class="row" style="margin-top:8px">' +
        '<button class="btn ghost mini" onclick="App.tarefaDoPasso(\'' + op.id + '\',' + i + ')">Criar tarefa</button>' +
        '</div></li>';
    }).join('');

    const atencao = (plano.atencao || []).map(function (a) {
      return '<li>' + esc(a) + '</li>';
    }).join('');

    return '<ul class="achados" style="margin-top:12px">' + passos + '</ul>' +
      (atencao ? '<div class="aviso" style="margin-top:12px"><strong>Atenção</strong><ul class="small" style="margin:6px 0 0;padding-left:18px">' + atencao + '</ul></div>' : '');
  }

  /* O relatório do que o assistente aplicou. Não tem caixa para marcar nem
     select para escolher: já está gravado. Isso é de propósito — a função do
     vendedor é fazer a tarefa e concluir; conferir duas telas depois de já ter
     feito a reunião e escrito a ata era exatamente onde o gesto morria, e o
     índice ficava zerado no painel do gestor não porque nada aconteceu, mas
     porque ninguém teve paciência de confirmar duas vezes.

     O que ele precisa é ver o que mudou e por quê, com o trecho que originou
     cada nota. Discordar continua possível, num clique. */
  function resumoDaLeitura(op, base, mudancas, erroDaReleitura) {
    const r = E.resumo(op);
    const entrou = [];
    if (base.evidencias) entrou.push(base.evidencias + (base.evidencias === 1 ? ' evidência do cliente' : ' evidências do cliente'));
    if (base.pessoas) entrou.push(base.pessoas + (base.pessoas === 1 ? ' pessoa nova' : ' pessoas novas'));
    if (base.completados) entrou.push(base.completados +
      (base.completados === 1 ? ' ficha de contato completada' : ' fichas de contato completadas'));

    const linhas = mudancas.map(function (m) {
      return '<li class="achado">' +
        '<div class="row"><span class="pill navy">' + esc(m.nome) + '</span>' +
        '<strong>' + m.de + ' \u2192 ' + m.para + '</strong><span class="espaco"></span></div>' +
        (m.porque ? '<p class="small muted" style="margin:6px 0 0">' + esc(m.porque) + '</p>' : '') +
        (m.trecho ? '<p class="origem">\u201c' + esc(m.trecho) + '\u201d</p>' : '') +
        (m.travada ? '<p class="compromisso small" style="margin:6px 0 0">O assistente propôs 2. Ficou em 1: as evidências desta decisão são todas de relato, e relato não comprova.</p>' : '') +
        '</li>';
    }).join('');

    /* As mudanças no próprio negócio vêm primeiro no relatório: valor e etapa
       são o que o dono da empresa vê no painel, e é ali que o vendedor mais
       precisa conferir se o assistente entendeu certo. */
    const doNegocio = (base.negocio || []).map(function (m) {
      return '<li class="achado">' +
        '<div class="row"><span class="pill orange">' + esc(m.campo) + '</span>' +
        '<strong>' + esc(m.de) + ' \u2192 ' + esc(m.para) + '</strong><span class="espaco"></span></div>' +
        (m.trecho ? '<p class="origem">\u201c' + esc(m.trecho) + '\u201d</p>' : '') +
      '</li>';
    }).join('');

    /* A ficha da empresa. Vem depois do negócio e antes das decisões porque é
       contexto: uma ata de uma hora costuma dizer quantas plantas o cliente
       tem, onde ficam e o que ele precisa resolver — e isso ia embora junto
       com o texto. Só aparece o que estava EM BRANCO e foi preenchido; o
       assistente não corrige o que alguém digitou. */
    const daEmpresa = (base.empresa || []).map(function (m) {
      return '<li class="achado">' +
        '<div class="row"><span class="pill">' + esc(m.campo) + '</span>' +
        '<strong>' + esc(m.para) + '</strong><span class="espaco"></span></div></li>';
    }).join('');

    /* O QUE AINDA FALTA.

       O relatório mostrava só o que subiu. Quem acabou de contar uma reunião
       inteira lia "3 decisões subiram" e não ficava sabendo que outras cinco
       continuam em zero — nem o que precisaria acontecer para cada uma delas
       andar. É a pergunta que a pessoa tem na cabeça naquele exato segundo, e
       a resposta já estava calculada no motor, em lacunas(): a nota atual, o
       que falta, a pergunta a fazer e o que serve de prova.

       Três, e não todas. A lista já vem na ordem de trabalho do motor —
       problema antes de impacto, stakeholders antes de consenso —, então as
       três primeiras são as três que vêm agora. Oito lacunas numa tela de fim
       de reunião é a mesma coisa que nenhuma. */
    const pendentes = E.lacunas(op).filter(function (l) {
      return l.tipo === 'dimensao' || l.tipo === 'comprovacao';
    }).slice(0, 3);

    const oQueFalta = pendentes.map(function (l) {
      return '<li class="achado">' +
        '<div class="row"><span class="pill ' + (l.nota === 0 ? 'dead' : 'warn') + '">' +
          esc(l.titulo) + ' · ' + l.nota + '/2</span><span class="espaco"></span></div>' +
        '<p class="small" style="margin:6px 0 0">' + esc(l.falta) + '</p>' +
        (l.pergunta
          ? '<p class="small" style="margin:4px 0 0"><strong>Pergunte:</strong> \u201c' + esc(l.pergunta) + '\u201d</p>'
          : '') +
        (l.comoProvar
          ? '<p class="tiny muted" style="margin:4px 0 0">Serve de prova: ' + esc(l.comoProvar) + '</p>'
          : '') +
      '</li>';
    }).join('');

    return '<form method="dialog"><div class="corpo">' +
      '<h2>Pronto — o assistente já registrou</h2>' +
      (doNegocio
        ? '<p class="small"><strong>O negócio mudou.</strong></p><ul class="achados">' + doNegocio + '</ul>'
        : '') +
      (daEmpresa
        ? '<p class="small"><strong>A ficha da empresa ganhou o que estava em branco.</strong></p>' +
          '<ul class="achados">' + daEmpresa + '</ul>'
        : '') +
      (entrou.length
        ? '<p class="small">Entrou nesta oportunidade: <strong>' + esc(entrou.join(' e ')) + '</strong>.</p>'
        : '') +
      (mudancas.length
        ? '<p class="small"><strong>' + mudancas.length +
          (mudancas.length === 1 ? ' decisão subiu' : ' decisões subiram') +
          '.</strong> IAD agora: <strong>' + r.iad + '/' + P.IAD_MAXIMO + '</strong>.</p>' +
          '<ul class="achados">' + linhas + '</ul>'
        : erroDaReleitura
          /* Releitura que falhou não é "nada subiu": é uma pergunta sem
             resposta, e dizer "falta evidência do cliente" aqui seria culpar
             o vendedor por um erro do servidor. */
          ? '<div class="aviso">As oito não foram relidas: ' + esc(erroDaReleitura) +
            '<br><span class="tiny">O que está acima já ficou gravado. Use <strong>Ler as 8 decisões</strong> para tentar de novo.</span></div>'
          /* Quando o valor e a etapa mudaram e nenhuma das oito subiu, a causa
             quase sempre é a mesma: o material era NOSSO. Dizer só "falta
             evidência do cliente" nesse caso soa como defeito, porque o
             vendedor acabou de ver o negócio inteiro se atualizar na tela. */
          : (base.negocio || []).length
            ? '<div class="aviso">O negócio andou, mas <strong>nenhuma das oito subiu</strong> — e isso costuma estar certo: ' +
              'proposta, apresentação e material nosso não são evidência de que o cliente decidiu. ' +
              'O que sobe as oito é o que <strong>ele</strong> fez: confirmou um número, apresentou alguém, marcou uma data.</div>'
            : '<div class="aviso">Nenhuma das oito subiu. O que entrou não sustenta uma nota maior — e isso é uma resposta, não uma falha: falta evidência do cliente.</div>') +
      (oQueFalta
        ? '<p class="small" style="margin-top:14px"><strong>O que ainda falta</strong> — as próximas ' +
          'na ordem em que o método trabalha:</p><ul class="achados">' + oQueFalta + '</ul>'
        : '<p class="small" style="margin-top:14px">Nenhuma das oito está em aberto. O que falta neste ' +
          'negócio não é decisão — é prazo, alçada ou assinatura.</p>') +
      '<p class="tiny muted">Nota só sobe sozinha, e nota 2 continua exigindo evidência confirmada ou documentada. ' +
      'Se discordar de alguma, ajuste — as oito ficam abertas para edição.</p>' +
      '</div><div class="rodape">' +
      (erroDaReleitura
        ? '<button class="btn ghost" value="tentar" type="submit">Tentar de novo</button>'
        : '<button class="btn ghost" value="ajustar" type="submit">Ajustar as oito</button>') +
      '<button class="btn" value="ok" type="submit">Fechar</button>' +
      '</div></form>';
  }

  /* ---------------- Conferência das oito notas ----------------
     A tela existe porque a alternativa é o vendedor não pontuar. Oito
     formulários viram oito linhas com a nota proposta, o trecho literal em
     que ela se apoia e um select para discordar. Quem grava é ele. */
  function revisaoDasNotas(op, decisoes) {
    const linhas = P.DIMENSOES.map(function (d) {
      const s = decisoes.filter(function (x) { return x.dimensao === d.id; })[0] ||
        { dimensao: d.id, nota: 0, porque: '', trecho: '' };
      const atual = op.dims[d.id] || 0;
      const podeDois = E.podeComprovar(op, d.id);

      /* A proposta é rebaixada aqui, na tela, e não escondida atrás de um
         "manter" sem explicação: 2 significa comprovado, e só relato não
         comprova. Mostrar "0 → 2" com o select em "manter" seria a tela se
         contradizendo na frente de quem vai gravar. */
      const rebaixada = (s.nota === 2 && !podeDois);
      const proposta = rebaixada ? 1 : s.nota;
      const sobe = proposta > atual;

      const opcoes = ['manter'].concat([0, 1, 2]).map(function (v) {
        if (v === 'manter') {
          return '<option value="manter"' + (sobe ? '' : ' selected') + '>Manter em ' + atual + '</option>';
        }
        const bloqueada = (v === 2 && !podeDois);
        return '<option value="' + v + '"' +
          (bloqueada ? ' disabled' : '') +
          (sobe && v === proposta ? ' selected' : '') + '>' +
          v + ' \u2014 ' + esc(d.niveis[v]) + (bloqueada ? ' (exige prova confirmada)' : '') +
          '</option>';
      }).join('');

      return '<li class="achado">' +
        '<div class="row"><span class="pill' + (sobe ? ' navy' : '') + '">' + esc(d.nome) + '</span>' +
        '<strong>' + atual + ' \u2192 ' + (sobe ? proposta : atual) + '</strong>' +
        '<span class="espaco"></span>' +
        (sobe ? '' : '<span class="tiny muted">sem mudança</span>') + '</div>' +
        (s.porque ? '<p class="small muted" style="margin:6px 0 0">' + esc(s.porque) + '</p>' : '') +
        (rebaixada ? '<p class="compromisso small" style="margin:6px 0 0">O assistente propôs 2. Fica em 1: as evidências desta decisão são todas de relato, e relato não comprova.</p>' : '') +
        (s.trecho ? '<p class="origem">\u201c' + esc(s.trecho) + '\u201d</p>' : '') +
        '<div class="row escolhas">' +
          '<label class="campo mini"><span>Como fica</span>' +
          '<select data-nota="' + d.id + '">' + opcoes + '</select></label>' +
        '</div></li>';
    }).join('');

    const sobem = decisoes.filter(function (s) {
      const podeDois = E.podeComprovar(op, s.dimensao);
      const proposta = (s.nota === 2 && !podeDois) ? 1 : s.nota;
      return proposta > (op.dims[s.dimensao] || 0);
    }).length;

    return '<form method="dialog"><div class="corpo">' +
      '<h2>As oito decisões, lidas do que está registrado</h2>' +
      '<p class="small muted">O assistente propõe; quem grava \u00e9 voc\u00ea. Cada nota acima de zero precisou citar ' +
      'um trecho literal \u2014 sem citação, ela volta a zero. Nota 2 continua exigindo evid\u00eancia confirmada ou documentada.</p>' +
      (sobem
        ? '<p class="small"><strong>' + sobem + (sobem === 1 ? ' decisão sobe' : ' decisões sobem') + '</strong> com o que já está registrado.</p>'
        : '<div class="aviso">Nada sobe. O que está registrado não sustenta nenhuma das oito \u2014 e isso é uma resposta, não uma falha: falta evid\u00eancia do cliente.</div>') +
      (avisoSegmento ? '<div class="aviso">' + esc(avisoSegmento) + '</div>' : '') +
      '<ul class="achados">' + linhas + '</ul>' +
      '</div><div class="rodape">' +
      '<button class="btn ghost" value="cancelar" type="submit">Cancelar</button>' +
      '<button class="btn" value="ok" type="submit">Gravar as notas</button>' +
      '</div></form>';
  }

  /* A tela é redesenhada pelo router a cada ação; o filtro e a seleção vivem
     aqui para sobreviver a isso. O app mexe neles só por estas portas. */
  function tarefasFiltrar(mudancas) {
    Object.assign(tarefasFiltro, mudancas || {});
    /* Trocar de filtro com dez linhas marcadas fecharia, no lote seguinte,
       tarefas que já saíram da tela. A seleção morre com o filtro. */
    if (mudancas && ('responsavel' in mudancas || 'status' in mudancas || 'tipos' in mudancas ||
        'de' in mudancas || 'ate' in mudancas || 'busca' in mudancas ||
        'empresa' in mudancas || 'negocio' in mudancas)) {
      tarefasMarcadas = {};
    }
  }
  function tarefasEstado() { return tarefasFiltro; }
  function tarefasVisiveis() { return tarefasFiltradas().map(function (l) { return l.t.id; }); }
  function tarefasDaPagina() {
    const f = tarefasFiltro;
    const lista = tarefasFiltradas();
    const paginas = Math.max(1, Math.ceil(lista.length / f.porPagina));
    const pagina = Math.min(f.pagina, paginas);
    return lista.slice((pagina - 1) * f.porPagina, pagina * f.porPagina)
      .map(function (l) { return l.t.id; });
  }
  function tarefasSelecionadas() {
    /* Só as que ainda estão no filtro: marcar tudo, mudar o filtro e concluir
       não pode alcançar uma tarefa que a pessoa não está vendo. */
    const visiveis = {};
    tarefasVisiveis().forEach(function (id) { visiveis[id] = true; });
    return Object.keys(tarefasMarcadas).filter(function (id) { return visiveis[id]; });
  }
  function tarefasMarcar(ids, ligado) {
    if (ids === null) { tarefasMarcadas = {}; return; }
    ids.forEach(function (id) {
      if (ligado) tarefasMarcadas[id] = true;
      else delete tarefasMarcadas[id];
    });
  }

  /* ---------------- Filtros pertencem a quem os ligou ----------------

     Todo filtro de tela vive em variável de módulo, para sobreviver ao render
     — e sobrevivia também ao logout, que é onde estava o defeito. Quem
     filtrava "as negociações do Alexandre", trocava de conta e entrava como
     outra pessoa via um pipeline vazio: o filtro continuava valendo, apontando
     para alguém que não existe na empresa nova. A tela dizia "0 negociações" e
     não tinha como estar mais certa nem mais inútil.

     A correção não é limpar em cada lugar que troca de sessão — é lembrar de
     quem são os filtros. Mudou a pessoa, os filtros dela vão junto. Assim
     qualquer caminho novo de troca de conta já nasce coberto. */
  let donoDosFiltros = null;

  function zerarFiltros() {
    filtroHoje = 'todos';
    filtroPeriodo = 'todos';
    filtroSegmento = 'todos';
    filtroGrupo = 'todos';
    modoPipeline = 'lista';
    filtroHistorico = 'tudo';
    filtroTarefas = 'abertas';
    periodoTarefas = 'tudo';
    abaCadastro = 'empresas';
    buscaCadastro = '';
    planoIA = null;
    pipelineFiltro = Object.assign({}, VAZIO_PIPELINE);
    tarefasFiltro = Object.assign({}, VAZIO_TAREFAS);
    tarefasMarcadas = {};
    semanasDoAprendizado = 8;
  }

  function conferirSessao(usuarioId) {
    if (usuarioId === donoDosFiltros) return false;
    donoDosFiltros = usuarioId;
    zerarFiltros();
    return true;
  }

  global.IADViews = {
    hoje, painel, pipeline, tarefas, cockpit, revisao, contas, cadastros, playbook, dados, itemArquivo, listaLeads,
    revisaoDaImportacao, recusaDoCliente, resumoDaLeitura, planoDaIA, definirPlano, planoGuardado, revisaoDasNotas,
    acesso, barraAdmin, menuDoUsuario, definirTelaAcesso, definirPrimeiraEmpresa, listaUsuariosNuvem,
    pendenteAcesso: function () { return pendente; },
    tarefasFiltrar, tarefasEstado, tarefasVisiveis, tarefasDaPagina, tarefasSelecionadas, tarefasMarcar,
    pipelineEstado, pipelineFiltrar, pipelineLimparTudo, gavetaDeFiltros, conferirSessao, zerarFiltros,
    definirSemanasDoAprendizado: function (n) { semanasDoAprendizado = n; },
    semanasDoAprendizado: function () { return semanasDoAprendizado; },
    oportunidadesDoLHSemTarefa,
    definirFiltro: function (f) { filtroGrupo = f; },
    definirFiltroHistorico: function (f) { filtroHistorico = f; },
    definirFiltroHoje: function (f) { filtroHoje = f; },
    definirFiltroTarefas: function (f) { filtroTarefas = f; },
    definirPeriodoTarefas: function (f) { periodoTarefas = f; },
    definirModoPipeline: function (m) { modoPipeline = m; },
    definirAbaCadastro: function (a) { abaCadastro = a; buscaCadastro = ''; },
    definirBuscaCadastro: function (b) { buscaCadastro = b; },
    definirPeriodo: function (f) { filtroPeriodo = f; },
    definirSegmento: function (f) { filtroSegmento = f; }
  };
})(window);
