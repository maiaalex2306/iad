/* Router, ações e boot. */
(function (global) {
  'use strict';

  const P = global.IADPlaybook, Store = global.IADStore, E = global.IADEngine,
    U = global.IADUI, V = global.IADViews, Arq = global.IADArquivos, Csv = global.IADCsv,
    A = global.IADAuth, IA = global.IADIA;

  const ROTAS = [
    { hash: '#/hoje', ico: '⚡', nome: 'Hoje', render: V.hoje,
      ajuda: 'O que precisa de você agora, em ordem de urgência. Comece o dia por aqui.' },
    { hash: '#/painel', ico: '📊', nome: 'Painel', render: V.painel,
      ajuda: 'A carteira em números e gráficos: quanto do pipeline tem decisão madura, por mês e por segmento.' },
    { hash: '#/pipeline', ico: '🗂️', nome: 'Pipeline', render: V.pipeline,
      ajuda: 'Todos os negócios abertos, em lista ou kanban, agrupados pela saúde da decisão.' },
    { hash: '#/revisao', ico: '🔄', nome: 'Revisão', render: V.revisao,
      ajuda: 'A reunião semanal numa tela: o que mudou na decisão de cada cliente nos últimos 7 dias.' },
    { hash: '#/cadastros', ico: '📇', nome: 'Cadastros', render: V.cadastros,
      ajuda: 'Empresas, contatos, oportunidades, segmentos, tipos de tarefa, produtos e usuários.' },
    { hash: '#/contas', ico: '🏢', nome: 'Contas', render: V.contas, foraDasAbas: true },
    /* Deixou de ser tela escondida: é a teoria que o vendedor precisa antes de
       marcar a próxima reunião, e teoria fora do menu é teoria que ninguém lê. */
    { hash: '#/playbook', ico: '❓', nome: 'Método', render: V.playbook,
      ajuda: 'A teoria inteira: como uma tarefa vira avanço, o que conta como evidência em cada uma das oito decisões e o que fazer em cada canal.' }
  ];

  /* Uma função do servidor pode faltar por dois motivos, e o navegador não
     sabe distinguir os dois: ou ela não foi publicada, ou foi publicada com o
     "Verify JWT" ligado — e aí o porteiro do Supabase recusa o pedido de
     permissão que todo navegador manda antes (o preflight, que por definição
     vai sem token), o navegador bloqueia a chamada e o erro chega aqui sem
     status nenhum. Dizer só "não está publicado" manda a pessoa procurar no
     lugar errado, então a mensagem cita os dois. */
  const SEM_FUNCAO = 'não foi publicada, ou foi publicada com o "Verify JWT" ' +
    'ligado — e nesse caso o navegador nem chega a mandar o pedido.';

  let promptInstalacao = null;
  let leads = null;

  function render() {
    const conteudo = document.getElementById('conteudo');
    let logado = A.atual();

    /* Com o servidor no comando, só vale sessão que veio dele. Uma sessão local
       antiga — ou o Adm de fábrica — não pode abrir a porta de um app público. */
    if (logado && global.IADNuvem.mandaNoAcesso() && !logado.naNuvem) {
      A.encerrarSessao();
      logado = null;
    }

    /* Registro sem empresa fica invisível. Aqui, com a sessão já conhecida,
       o que tiver nascido assim é adotado antes de a tela ser desenhada. */
    if (logado) Store.adotarOrfaos();

    document.body.classList.toggle('sem-sessao', !logado);
    if (!logado) {
      conteudo.innerHTML = V.acesso();
      const primeiro = document.querySelector('.cartao-acesso input');
      if (primeiro) primeiro.focus();
      return;
    }
    pintarTopo();

    const hash = location.hash || '#/hoje';

    if (hash.indexOf('#/op/') === 0) {
      const id = hash.slice(5);
      conteudo.innerHTML = V.cockpit(id);
      pintarArquivos(id);
    } else if (hash === '#/dados') {
      conteudo.innerHTML = V.dados();
      pintarUso();
      pintarLeads();
    } else {
      const rota = ROTAS.find(function (r) { return r.hash === hash; }) || ROTAS[0];
      conteudo.innerHTML = rota.render();
      pintarUsuariosNuvem();
    }

    document.querySelectorAll('nav.tabs a').forEach(function (a) {
      const alvo = a.getAttribute('href');
      a.classList.toggle('ativo', alvo === hash || (hash.indexOf('#/op/') === 0 && alvo === '#/pipeline'));
    });

    const barra = document.getElementById('barra-admin');
    if (barra) barra.innerHTML = V.barraAdmin();
    window.scrollTo(0, 0);
  }

  /* Quem está logado e de onde: some quando ninguém está. */
  function pintarTopo() {
    const alvo = document.getElementById('quem');
    if (!alvo) return;
    const u = A.atual();
    if (!u) { alvo.innerHTML = ''; return; }
    /* Para o administrador, repetir "Administrador" nas duas linhas não diz nada;
       o que ele precisa ver é qual recorte está enxergando no momento. */
    let onde;
    if (u.papel === 'admin') {
      const f = A.filtros();
      const alvoTenant = f.tenant === 'todas' ? null : A.tenant(f.tenant);
      onde = alvoTenant ? alvoTenant.nome : 'Todas as empresas';
    } else {
      const t = A.tenant(u.tenantId);
      onde = (t && t.nome) || '';
    }
    alvo.innerHTML = '<span class="nome">' + U.esc(u.nome || u.login) + '</span>' +
      '<span class="onde">' + U.esc(onde) + '</span>';
  }

  function montarNav() {
    document.querySelector('nav.tabs').innerHTML = ROTAS.filter(function (r) { return !r.foraDasAbas; }).map(function (r) {
      return '<a href="' + r.hash + '"' + (r.ajuda ? ' data-ajuda-titulo="' + r.nome + '" data-ajuda="' + U.esc(r.ajuda) + '"' : '') +
        '><span class="ico">' + r.ico + '</span>' + r.nome + '</a>';
    }).join('');
  }

  function pintarArquivos(opId) {
    const alvo = document.getElementById('lista-arquivos');
    if (!alvo) return;
    if (!Arq.disponivel()) {
      alvo.innerHTML = '<div class="tiny muted">Este navegador não guarda anexos.</div>';
      return;
    }
    Arq.listar(opId).then(function (lista) {
      const destino = document.getElementById('lista-arquivos');
      if (!destino) return;
      destino.innerHTML = lista.length
        ? lista.map(V.itemArquivo).join('')
        : '<div class="vazio small">Nenhum anexo.</div>';
    }).catch(function (e) {
      const destino = document.getElementById('lista-arquivos');
      if (destino) destino.innerHTML = '<div class="tiny muted">Não foi possível ler os anexos: ' + U.esc(e.message) + '</div>';
    });
  }

  function pintarUso() {
    const alvo = document.getElementById('uso-anexos');
    if (!alvo || !Arq.disponivel()) return;
    Arq.uso().then(function (u) {
      const destino = document.getElementById('uso-anexos');
      if (!destino) return;
      const mb = (u.bytes / 1048576).toFixed(1);
      destino.textContent = 'Anexos: ' + u.quantidade + ' arquivo(s), ' + mb + ' MB (guardados fora do JSON).';
    }).catch(function () {});
  }

  function recadoNuvem(texto, erro) {
    const alvo = document.getElementById('recado-nuvem');
    if (!alvo) return;
    alvo.innerHTML = '<div class="' + (erro ? 'aviso' : 'faixa-delta') + '" style="margin-top:12px">' + U.esc(texto) + '</div>';
  }

  function pintarLeads() {
    const alvo = document.getElementById('caixa-linkedhelper');
    if (alvo) alvo.innerHTML = V.listaLeads(leads);
  }

  /* Os usuários do servidor só chegam por rede, então a tela desenha primeiro e
     se completa depois. Guardamos o resultado para não repetir a consulta a
     cada redesenho — que aqui acontece a cada clique. */
  let perfisNuvem = null, empresasNuvem = null, convitesNuvem = null;

  function pintarUsuariosNuvem(recarregar) {
    const alvo = document.getElementById('usuarios-nuvem');
    if (!alvo) return;
    const N = global.IADNuvem;

    if (perfisNuvem && !recarregar) {
      alvo.innerHTML = V.listaUsuariosNuvem(perfisNuvem, empresasNuvem, (N.sessao().user || {}).id, convitesNuvem);
      return;
    }
    Promise.all([N.perfisDaNuvem(), N.empresasDaNuvem(), N.convitesDaNuvem().catch(function () { return []; })])
      .then(function (r) {
        perfisNuvem = r[0] || [];
        empresasNuvem = r[1] || [];
        convitesNuvem = r[2] || [];
        pintarUsuariosNuvem();
      })
      .catch(function (e) {
        const destino = document.getElementById('usuarios-nuvem');
        if (destino) destino.innerHTML = V.listaUsuariosNuvem({ erro: e.message }, [], null, null);
      });
  }

  /* ---------- entrada pelo servidor ----------
     Duas idas: uma para a senha, outra para o perfil. Quem ainda não tem
     empresa para na tela de empresa em vez de entrar numa carteira sem dono. */
  function entrarPelaNuvem(email, senha) {
    V.definirTelaAcesso('login', null, 'Entrando…');
    render();
    global.IADNuvem.entrar(email, senha)
      .then(concluirEntradaNaNuvem)
      .catch(function (e) {
        const msg = /Invalid login/i.test(e.message) ? 'E-mail ou senha não conferem.'
          : /not confirmed/i.test(e.message) ? 'Confirme seu e-mail pelo link que enviamos.'
          : e.message;
        V.definirTelaAcesso('login', null, msg);
        render();
      });
  }

  /* Bloqueio tem de barrar na porta, não só nos dados. As políticas do banco
     já negam tudo a quem está bloqueado, mas então a pessoa entraria e veria
     um app vazio — que é a pior explicação possível. Aqui ela é recusada com o
     motivo, e a sessão é encerrada para não ficar meio dentro.

     Quem pergunta o motivo é o banco: bloqueado não consegue ler a linha da
     empresa, então a tela não teria como distinguir "você foi bloqueado" de
     "sua empresa foi bloqueada".

     O papel entra aqui porque o banco e a tela precisam concordar, e não
     concordavam: nas políticas, administrador com a empresa bloqueada continua
     entrando — é ele quem desbloqueia, e tirar o acesso dele junto tranca o
     sistema por fora. Esta função não abria essa exceção, e o primeiro
     administrador que bloqueou a própria empresa ficou de fora do próprio
     sistema. Bloqueio da PESSOA continua valendo para todos, administrador
     inclusive: aí quem destrava é outro administrador, ou o SQL Editor. */
  function recusarSeBloqueado(perfil) {
    return global.IADNuvem.minhaSituacao().then(function (s) {
      if (!s) return null;
      if (s.perfil_ativo === false) {
        return 'Seu acesso está bloqueado. Procure quem administra o sistema.';
      }
      if (s.empresa_ativa === false) {
        if (perfil && perfil.papel === 'admin') return null;
        return 'O acesso da ' + (s.empresa_nome || 'sua empresa') +
          ' está bloqueado. Procure quem administra o sistema.';
      }
      return null;
    }).catch(function () { return null; });   /* servidor sem a correção 09 não barra ninguém */
  }

  /* O perfil vem antes da checagem porque é ele que diz o papel — e sem o
     papel a checagem não sabe quem pode entrar apesar do bloqueio. */
  function concluirEntradaNaNuvem() {
    const N = global.IADNuvem;
    return N.meuPerfil().then(function (perfil) {
      return recusarSeBloqueado(perfil).then(function (motivo) {
        if (!motivo) return seguirEntradaNaNuvem(perfil);
        return N.sair().catch(function () {}).then(function () {
          V.definirTelaAcesso('login', null, motivo);
          render();
        });
      });
    });
  }

  function seguirEntradaNaNuvem(jaLido) {
    const N = global.IADNuvem;
    return Promise.resolve(jaLido !== undefined ? jaLido : N.meuPerfil()).then(function (perfil) {
      N.guardarPerfilNaSessao(perfil);
      const u = N.sessao().user;

      if (!perfil) {
        /* Autenticado e sem linha de perfil é falha de instalação, não falta de
           empresa: mandar criar empresa aqui esconderia a causa. */
        V.definirTelaAcesso('login', null,
          'Entrou, mas o seu perfil não existe no banco. Rode nuvem/schema.sql no Supabase — é ele que cria o perfil no cadastro.');
        return render();
      }
      if (!perfil.tenant_id) {
        /* Sem empresa no servidor, quem entra é o primeiro e monta a casa.
           Havendo empresas, criar mais uma é decisão de quem administra — e o
           formulário simplesmente não aparece. */
        return N.existeEmpresa().then(function (existe) {
          V.definirPrimeiraEmpresa(!existe);
          V.definirTelaAcesso('empresa', { email: u.email }, '');
          render();
        });
      }

      A.abrirSessao(A.espelharDaNuvem(u, perfil));
      V.definirTelaAcesso('login', null, '');
      location.hash = '#/hoje';
      render();

      /* Perguntar ao servidor se o assistente existe só acontecia no boot, e
         no boot ainda não havia sessão para perguntar. Quem entrava agora
         ficava sem IA até recarregar a página — e nada dizia isso, porque o
         desenho é justamente não mostrar botão morto. Ausência silenciosa por
         defeito é indistinguível de ausência silenciosa por escolha. */
      IA.verificar().then(function (mudou) { if (mudou) render(); });

      /* Trazer o que já existe no servidor é o que faz a troca de aparelho
         funcionar; falhar aqui não impede de usar o app com a cópia local. */
      return N.puxar().then(render, function () {});
    });
  }

  /* O perfil fica guardado na sessão para não pedir ao servidor a cada envio —
     mas isso fazia mudança de papel ou de empresa só valer depois de sair e
     entrar. Quem administra move alguém e a pessoa continua vendo a carteira
     antiga até fechar o app: pior do que lento, é enganoso. Relemos ao abrir. */
  function atualizarPerfilDaNuvem() {
    const N = global.IADNuvem;
    if (!N.conectado()) return Promise.resolve();

    /* Bloqueio aplicado com a pessoa já dentro só valeria no próximo login, e
       sessão do Supabase dura muito. Relemos ao abrir, junto com o perfil —
       e depois dele, porque a checagem precisa do papel para saber quem entra
       apesar da empresa bloqueada. */
    const lendo = N.meuPerfil().then(function (perfil) {
      return recusarSeBloqueado(perfil).then(function (motivo) {
        if (!motivo) return perfil;
        return N.sair().catch(function () {}).then(function () {
          A.encerrarSessao();
          V.definirTelaAcesso('login', null, motivo);
          render();
          return null;
        });
      });
    }).then(function (perfil) {
      if (!perfil) return;
      const antes = N.estado().perfil || {};
      N.guardarPerfilNaSessao(perfil);
      const u = N.sessao().user;
      A.espelharDaNuvem(u, perfil);
      if (antes.papel !== perfil.papel || antes.tenant_id !== perfil.tenant_id) render();
    }).catch(function () {});

    /* A função do assistente é publicada à mão, num passo separado do login.
       Perguntamos ao servidor se ela existe antes de oferecer a caixa ✨.
       Esta não entra na promessa devolvida: ninguém deve esperar por ela para
       ver a tela — se o assistente estiver no ar, a caixa aparece sozinha. */
    IA.verificar().then(function (mudou) { if (mudou) render(); });

    return lendo;
  }

  /* ---------- chegada pelo link do e-mail ---------- */

  /* O convite e o "esqueci a senha" trazem a pessoa de volta com tudo depois
     do #, no formato de um formulário: access_token, refresh_token, type. O
     roteador do app também usa o #, e não reconhecia nada disso — a pessoa
     clicava no link, chegava com a credencial na mão e via a tela de login,
     que é exatamente o que ela não consegue passar: ela não tem senha ainda. */
  function credencialNoEndereco() {
    const bruto = (location.hash || '').replace(/^#/, '');
    if (bruto.indexOf('access_token=') === -1 && bruto.indexOf('error=') === -1) return null;
    const p = new URLSearchParams(bruto);
    return {
      access_token: p.get('access_token') || '',
      refresh_token: p.get('refresh_token') || '',
      expires_in: p.get('expires_in') || '',
      tipo: p.get('type') || '',
      erro: p.get('error_code') || p.get('error') || '',
      detalhe: (p.get('error_description') || '').replace(/\+/g, ' ')
    };
  }

  /* Fora do endereço assim que lido. Um access_token no histórico do navegador
     vaza pelo botão de voltar, pelos favoritos e por qualquer captura de tela —
     e ele vale como senha até expirar. */
  function limparEndereco() {
    const limpo = location.pathname + location.search;
    if (history.replaceState) history.replaceState(null, '', limpo);
    else location.hash = '';
  }

  function recusaDoLink(c) {
    if (/expired/i.test(c.erro) || /expired/i.test(c.detalhe)) {
      return 'O link deste e-mail já expirou.\n\n' +
        'Peça ao administrador para enviar o convite de novo — o link novo funciona.';
    }
    if (/access_denied|otp/i.test(c.erro)) {
      return 'Este link não vale mais. Ele serve uma vez só, e já foi usado ou substituído.\n\n' +
        'Se você ainda não definiu sua senha, peça um convite novo ao administrador.';
    }
    return 'O servidor recusou este link: ' + (c.detalhe || c.erro || 'motivo não informado') + '.';
  }

  /* Depois de entrar pelo link, escolher a senha é o único passo que falta —
     e é o que transforma um acesso de uma vez só em conta de verdade. Quem
     desiste continua dentro, com a sessão válida, mas fica sem como voltar
     amanhã: por isso a desistência avisa onde terminar depois, em vez de
     empurrar a caixa de novo. */
  function pedirSenhaNova(nome) {
    /* Quem foi convidado pode chegar sem nome: o convite do GoTrue cria a conta
       só com o e-mail. Perguntamos aqui, que é a única tela por onde essa
       pessoa passa antes de virar um usuário como os outros — e ela é a fonte
       certa para o próprio nome. Quem já tem nome não é perguntado de novo. */
    const faltaNome = !nome;
    const campos = [];
    if (faltaNome) campos.push({ id: 'nome', rotulo: 'Seu nome', tipo: 'text' });
    campos.push({ id: 'nova', rotulo: 'Sua senha', tipo: 'password', placeholder: 'mínimo 8 caracteres' });
    campos.push({ id: 'confere', rotulo: 'Repita a senha', tipo: 'password' });

    U.formulario('Bem-vindo' + (nome ? ', ' + nome : '') + ' — escolha sua senha', campos, {}, function (d) {
      if (d.nova.length < 8) { alert('A senha precisa ter pelo menos 8 caracteres.'); pedirSenhaNova(nome); return; }
      if (d.nova !== d.confere) { alert('As duas senhas não são iguais. Tente de novo.'); pedirSenhaNova(nome); return; }

      /* O nome vai primeiro, e sozinho não impede nada: se ele falhar, a senha
         ainda precisa ser gravada — sem senha a pessoa não volta amanhã, e é
         esse o passo que não pode se perder. */
      const gravarNome = (faltaNome && d.nome)
        ? global.IADNuvem.salvarMeuNome({ nome: d.nome, whatsapp: '' }).catch(function () {})
        : Promise.resolve();

      gravarNome.then(function () {
        return global.IADNuvem.trocarMinhaSenha(d.nova);
      }).then(function () {
        alert('Senha definida. A partir de agora você entra com o seu e-mail e esta senha, ' +
          'em qualquer aparelho.');
        atualizarPerfilDaNuvem();
        render();
      }).catch(function (e) {
        alert('Não consegui gravar a senha: ' + e.message + '\n\nTente de novo.');
        pedirSenhaNova(nome);
      });
    }, null, function () {
      alert('Você está dentro, mas ainda sem senha — e sem ela não dá para voltar amanhã.\n\n' +
        'Defina a sua em ⚙︎ → Minha conta, antes de fechar o app.');
    });
  }

  /* Roda antes de qualquer desenho de tela. Devolve promessa porque o boot
     precisa esperar: desenhar a tela de login e só depois descobrir que a
     pessoa já estava autenticada faria a tela piscar do errado para o certo. */
  function adotarCredencialDoEndereco() {
    const c = credencialNoEndereco();
    if (!c) return Promise.resolve('');
    limparEndereco();

    if (c.erro || !c.access_token) {
      alert(recusaDoLink(c));
      return Promise.resolve('');
    }

    return global.IADNuvem.adotarTokens(c).then(function (u) {
      /* Convite e recuperação chegam pelo mesmo caminho e terminam igual: nos
         dois casos a pessoa está sem senha utilizável. Quem pede a senha é o
         boot, depois de desenhar a tela — pedir agora poria a caixa sobre a
         tela de login, que é justamente a que vai sumir. */
      return (u && u.user_metadata && u.user_metadata.nome) || ' ';
    }).catch(function (e) {
      alert('Entrei no servidor com o seu link, mas não consegui carregar a sua conta: ' +
        e.message + '\n\nTente abrir o link de novo.');
      return '';
    });
  }

  function textoDoConvite(email) {
    const c = (convitesNuvem || []).find(function (x) { return x.email === email; }) || {};
    const t = (empresasNuvem || []).find(function (x) { return x.id === c.tenant_id; });
    const endereco = location.origin + location.pathname;
    return 'Olá,\n\n' +
      'Criei o seu acesso ao IAD CRM' + (t ? ', na ' + t.nome : '') + '.\n\n' +
      'Para entrar, uma vez só:\n\n' +
      '1. Abra ' + endereco + '\n' +
      '2. Clique em "Criar meu acesso"\n' +
      '3. Use este e-mail: ' + email + '\n' +
      '4. Escolha a senha que quiser\n\n' +
      'A empresa já está definida — você não precisa escolher nada. ' +
      'Depois disso é só entrar com o e-mail e a senha.\n\n' +
      'Qualquer dúvida, me chame.';
  }

  const OPCOES_SIM_NAO = [{ valor: 'nao', rotulo: 'Não' }, { valor: 'sim', rotulo: 'Sim' }];

  const App = {
    ir: function (hash) { location.hash = hash; },
    abrir: function (id) { location.hash = '#/op/' + id; },
    filtrar: function (grupo) { V.definirFiltro(grupo); render(); },
    filtrarHistorico: function (tipo) { V.definirFiltroHistorico(tipo); render(); },
    filtrarHoje: function (chave) { V.definirFiltroHoje(chave); render(); },
    modoPipeline: function (modo) { V.definirModoPipeline(modo); render(); },
    abaCadastro: function (aba) { V.definirAbaCadastro(aba); render(); },

    /* Buscar re-renderiza a tela; devolvemos o foco e o cursor ao campo. */
    buscarCadastro: function (texto) {
      V.definirBuscaCadastro(texto);
      render();
      const campo = document.getElementById('busca-cadastro');
      if (campo) { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }
    },

    /* O segmento carrega o mapa do mercado; o tipo de tarefa é só um nome.
       Os três campos existem para responder o que o vendedor se pergunta ao
       abrir um prospect novo: isto é desse segmento? o que vendo? com quem
       falo? Cada empresa tem os seus — a tabela é por empresa desde sempre. */
    camposDoCatalogo: function (nome) {
      const campos = [{ id: 'nome', rotulo: 'Nome' }];
      if (nome !== 'segmentos') return campos;
      return campos.concat([
        { id: 'subsegmentos', rotulo: 'Subsegmentos', tipo: 'textarea',
          placeholder: 'Frigoríficos; abatedouros; laticínios; massas' },
        { id: 'oportunidades', rotulo: 'Oportunidades', tipo: 'textarea',
          placeholder: 'Água de processo; CIP; ETA; ETE; reúso' },
        { id: 'personas', rotulo: 'Principais personas', tipo: 'textarea',
          placeholder: 'Gerente de Utilidades; Gerente de Qualidade' }
      ]);
    },

    novoItemCatalogo: function (nome) {
      const titulo = nome === 'segmentos' ? 'Novo segmento' : 'Novo tipo de tarefa';
      U.formulario(titulo, App.camposDoCatalogo(nome), {}, function (d) {
        if (!d.nome) return;
        Store.criarNoCatalogo(nome, {
          nome: d.nome,
          subsegmentos: d.subsegmentos || '',
          oportunidades: d.oportunidades || '',
          personas: d.personas || ''
        });
        render();
      });
    },

    editarItemCatalogo: function (nome, id) {
      const item = Store.catalogo(nome).find(function (i) { return i.id === id; });
      if (!item) return;
      const campos = App.camposDoCatalogo(nome).concat([
        { id: 'ativo', rotulo: 'Situação', tipo: 'select', opcoes: [{ valor: 'sim', rotulo: 'Ativo' }, { valor: 'nao', rotulo: 'Inativo' }] }
      ]);
      U.formulario('Editar', campos, {
        nome: item.nome,
        subsegmentos: item.subsegmentos || '',
        oportunidades: item.oportunidades || '',
        personas: item.personas || '',
        ativo: item.ativo === false ? 'nao' : 'sim'
      }, function (d) {
        const mudancas = { nome: d.nome, ativo: d.ativo === 'sim' };
        if (nome === 'segmentos') {
          mudancas.subsegmentos = d.subsegmentos || '';
          mudancas.oportunidades = d.oportunidades || '';
          mudancas.personas = d.personas || '';
        }
        Store.atualizarNoCatalogo(nome, id, mudancas);
        render();
      });
    },

    excluirItemCatalogo: function (nome, id) {
      if (nome === 'produtos' && !podeMexerEmProduto()) return;
      if (!U.confirmar('Excluir este item do cadastro? Os registros que já o usam continuam como estão.')) return;
      Store.removerDoCatalogo(nome, id);
      render();
    },

    /* A tela esconde os botões; isto recusa a ação. Esconder não impede: a
       função continua no window. Mesma dupla dos usuários. */
    novoProduto: function () {
      if (!podeMexerEmProduto()) return;
      U.formulario('Novo produto', camposProduto(), {}, function (d) {
        if (!d.nome) return;
        Store.criarNoCatalogo('produtos', Object.assign({}, d, { precoReferencia: U.numeroDigitado(d.precoReferencia) }));
        render();
      });
    },

    editarProduto: function (id) {
      if (!podeMexerEmProduto()) return;
      const p = Store.produto(id);
      if (!p) return;
      U.formulario('Editar produto', camposProduto().concat([
        { id: 'ativo', rotulo: 'Situação', tipo: 'select', opcoes: [{ valor: 'sim', rotulo: 'Ativo' }, { valor: 'nao', rotulo: 'Inativo' }] }
      ]), Object.assign({}, p, { ativo: p.ativo === false ? 'nao' : 'sim' }), function (d) {
        Store.atualizarNoCatalogo('produtos', id, Object.assign({}, d, {
          precoReferencia: U.numeroDigitado(d.precoReferencia), ativo: d.ativo === 'sim'
        }));
        render();
      });
    },

    /* Cadastro rápido: empresa, contato e oportunidade em um formulário só.
       É o que evita abrir três telas para registrar uma conversa de cinco minutos. */
    cadastroRapido: function (etapa) {
      const est = Store.dados();
      const contas = est.contas.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); });
      const produtos = Store.catalogoAtivos('produtos');

      const campos = [
        { id: 'atalhoNegocio', tipo: 'ia', extrair: 'oportunidade',
          rotulo: 'Conte de onde veio este negócio',
          placeholder: 'Ex.: Indicação na feira. Agro Verde, agroindústria em Sorocaba. Falei com o Marcelo Prates, o CFO, que está tocando o assunto internamente.',
          nunca: ['valor', 'fechamentoPrevisto'],
          contexto: function () { return IA.contextoDaConta(null); } },
        { id: 'contaId', rotulo: 'Empresa', tipo: 'select',
          opcoes: [{ valor: '', rotulo: '— cadastrar nova abaixo —' }]
            .concat(contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; })) },
        { id: 'empresaNova', rotulo: 'Nome da nova empresa', placeholder: 'preencha só se for empresa nova' },
        { id: 'segmento', rotulo: 'Segmento da nova empresa', tipo: 'select',
          opcoes: [{ valor: '', rotulo: '— sem segmento —' }]
            .concat(Store.nomesDoCatalogo('segmentos').map(function (n) { return { valor: n, rotulo: n }; })) },
        { id: 'titulo', rotulo: 'Oportunidade' },
        { id: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda' },
        { id: 'fechamentoPrevisto', rotulo: 'Fechamento previsto', tipo: 'date' },
        { id: 'contatoNome', rotulo: 'Contato (opcional)' },
        { id: 'contatoCargo', rotulo: 'Cargo do contato' },
        { id: 'contatoPapel', rotulo: 'Papel na compra', tipo: 'select', opcoes: P.PAPEIS },
        { id: 'contatoPerfil', rotulo: 'Perfil (Challenger)', tipo: 'select',
          opcoes: P.PERFIS.map(function (x) { return { valor: x.id, rotulo: x.rotulo }; }) }
      ];
      if (produtos.length) {
        campos.push({ id: 'produtoId', rotulo: 'Produto', tipo: 'select',
          opcoes: [{ valor: '', rotulo: '— nenhum —' }]
            .concat(produtos.map(function (p) { return { valor: p.id, rotulo: p.nome }; })) });
      }

      U.formulario('Cadastro rápido — ' + etapa, campos, {}, function (d) {
        if (!d.titulo) { alert('Dê um título à oportunidade.'); return; }

        let contaId = d.contaId;
        if (!contaId) {
          if (!d.empresaNova) { alert('Escolha uma empresa ou informe o nome da nova.'); return; }
          if (d.segmento) Store.criarNoCatalogo('segmentos', { nome: d.segmento });
          contaId = Store.criarConta({ nome: d.empresaNova, segmento: d.segmento || '' }).id;
        }

        const op = Store.criarOportunidade({
          contaId: contaId, titulo: d.titulo, valor: U.numeroDigitado(d.valor),
          etapa: etapa, fechamentoPrevisto: d.fechamentoPrevisto || ''
        });

        if (d.contatoNome) {
          const contato = Store.criarContato({
            contaId: contaId, nome: d.contatoNome, cargo: d.contatoCargo,
            papel: d.contatoPapel, perfil: d.contatoPerfil
          });
          op.stakeholders.push(contato.id);
        }

        if (d.produtoId) {
          const prod = Store.produto(d.produtoId);
          op.itens.push({ produtoId: d.produtoId, quantidade: 1, precoUnitario: prod ? prod.precoReferencia : 0 });
          if (!op.valor && prod) op.valor = prod.precoReferencia || 0;
        }

        Store.salvar();
        render();
      });
    },

    /* Kanban: arrastar move a etapa — e o histórico registra que foi só a etapa. */
    arrastar: function (evento, opId) {
      evento.dataTransfer.setData('text/plain', opId);
      evento.dataTransfer.effectAllowed = 'move';
    },

    soltar: function (evento, etapa) {
      evento.preventDefault();
      const opId = evento.dataTransfer.getData('text/plain');
      if (opId) App.moverEtapa(opId, etapa);
    },

    /* Mudar de etapa é uma declaração: "este negócio avançou". O IAD existe
       para perguntar se a decisão do cliente avançou junto. Por isso a
       análise acontece aqui, no gesto, e não numa tela que ninguém abre. */
    moverEtapa: function (opId, etapa) {
      const op = Store.oportunidade(opId);
      if (!op || op.etapa === etapa) return;
      Store.atualizarOportunidade(opId, { etapa: etapa });
      render();
      if (IA.disponivel()) App.planejar(opId, etapa);
    },

    /* Análise sob demanda. Não roda ao abrir o cockpit: cada chamada custa, e
       abrir a tela não é pedir análise. */
    planejar: function (opId, etapaNova) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      if (!IA.disponivel()) { alert('Não consegui falar com o assistente. A função "assistente" ' +
        SEM_FUNCAO + '\n\nVeja nuvem/IA.md.');  return; }

      const r = E.resumo(op);
      const dlg = document.createElement('dialog');
      dlg.className = 'revisao-ia';
      dlg.innerHTML = '<div class="corpo"><h2>Lendo este negócio…</h2>' +
        '<p class="small muted">' + U.esc(op.titulo) + ' · IAD ' + r.iad + '/16' +
        (etapaNova ? ' · agora em ' + U.esc(etapaNova) : '') + '</p></div>';
      document.body.appendChild(dlg);
      dlg.showModal();

      IA.planoDaOportunidade(op, r, etapaNova).then(function (plano) {
        dlg.close(); dlg.remove();
        if (!plano) { alert('Não consegui falar com o assistente agora.'); return; }
        V.definirPlano(opId, plano);

        /* Vindo da mudança de etapa, o resultado é uma janela — o vendedor
           acabou de agir e a resposta tem de encontrá-lo ali. Vindo do botão,
           preenche o bloco do cockpit, sem interromper. */
        if (etapaNova) {
          const janela = document.createElement('dialog');
          janela.className = 'revisao-ia';
          janela.innerHTML = '<form method="dialog"><div class="corpo">' +
            '<h2>O que a etapa ' + U.esc(etapaNova) + ' exige</h2>' +
            '<p class="small muted">Etapa mudou. Estas decisões ainda não acompanham.</p>' +
            V.planoDaIA(op, plano) +
            '</div><div class="rodape">' +
            '<button class="btn" value="ok" type="submit">Entendi</button>' +
            '</div></form>';
          document.body.appendChild(janela);
          janela.addEventListener('close', function () { janela.remove(); });
          janela.showModal();
          return;
        }

        render();   /* o bloco se redesenha com o plano guardado */
      });
    },

    /* Ler o que está registrado e propor as oito notas de uma vez.

       Isto não quebra a regra de que a IA não pontua. Ela propõe, o vendedor
       confere as oito numa tela e confirma — e a trava do motor continua de
       pé: nota 2 sem evidência confirmada cai para 1, venha de onde vier.
       O que muda é o custo. Oito formulários é o motivo de ninguém pontuar. */
    lerDecisoes: function (opId) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      if (!IA.disponivel()) { alert('Não consegui falar com o assistente. A função "assistente" ' +
        SEM_FUNCAO + '\n\nVeja nuvem/IA.md.');  return; }

      U.formulario('Ler as oito decisões', [
        { id: 'texto', rotulo: 'Cole uma reunião, se tiver (opcional)', tipo: 'textarea', voz: true,
          placeholder: 'Deixe vazio para o assistente ler só o que já está registrado nesta oportunidade.' }
      ], {}, function (d) {
        const r = E.resumo(op);
        const espera = document.createElement('dialog');
        espera.innerHTML = '<div class="corpo"><h2>Lendo as evidências…</h2>' +
          '<p class="small muted">Comparando o que o cliente disse com as oito decisões.</p></div>';
        document.body.appendChild(espera);
        espera.showModal();

        IA.sugerirNotas(op, r, d.texto).then(function (resp) {
          espera.close(); espera.remove();
          if (!resp || resp.erro) { alert((resp && resp.erro) || 'O servidor respondeu vazio.'); return; }
          App.revisarNotas(opId, resp.decisoes || []);
        });
      });
    },

    revisarNotas: function (opId, decisoes) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      const dlg = document.createElement('dialog');
      dlg.className = 'revisao-ia';
      dlg.innerHTML = V.revisaoDasNotas(op, decisoes);
      document.body.appendChild(dlg);

      dlg.addEventListener('close', function () {
        if (dlg.returnValue === 'ok') {
          let mudadas = 0, rebaixadas = 0;
          P.DIMENSOES.forEach(function (d) {
            const campo = dlg.querySelector('[data-nota="' + d.id + '"]');
            if (!campo || campo.value === 'manter') return;
            const alvo = Store.oportunidade(opId);
            const pedida = Number(campo.value);
            /* A mesma regra de sempre, aplicada aqui também: 2 é "comprovado",
               e só relato não comprova. Vale para a IA como vale para todo mundo. */
            const permitida = (pedida === 2 && !E.podeComprovar(alvo, d.id))
              ? Math.max(1, alvo.dims[d.id] || 0)
              : pedida;
            if (permitida !== (alvo.dims[d.id] || 0)) {
              Store.pontuar(opId, d.id, permitida, 'Lido pelo assistente e confirmado');
              mudadas++;
              if (permitida !== pedida) rebaixadas++;
            }
          });
          const depois = E.iad(Store.oportunidade(opId));
          alert(mudadas
            ? mudadas + (mudadas === 1 ? ' decisão gravada' : ' decisões gravadas') +
              '. IAD agora: ' + depois + '/16.' +
              (rebaixadas ? '\n\n' + rebaixadas + ' ficou em 1: para 2 é preciso evidência confirmada ou documentada.' : '')
            : 'Nada mudou.');
          render();
        }
        dlg.remove();
      });
      dlg.showModal();
    },

    /* Um passo vira tarefa com a decisão-alvo já preenchida: é isso que liga
       a sugestão ao mapa, em vez de deixá-la como texto na tela. */
    tarefaDoPasso: function (opId, indice) {
      const plano = V.planoGuardado ? V.planoGuardado(opId) : null;
      const passo = plano && plano.passos[indice];
      if (!passo) return;
      Store.criarTarefa({
        oportunidadeId: opId, titulo: passo.acao.slice(0, 160),
        tipo: 'Preparar', decisaoAlvo: passo.dimensao, vencimento: Store.hoje()
      });
      alert('Tarefa criada, mirando ' + passo.dimensao + '. Ajuste o prazo em Hoje.');
      render();
    },

    definirInsight: function (opId) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      U.formulario('Insight comercial', [
        /* Aqui a IA não extrai: ela escreve um rascunho. A caixa já vem com o
           que o cliente disse sobre o problema, para o rascunho nascer do caso
           real e não de um lugar-comum de setor. */
        { id: 'baseInsight', tipo: 'ia', extrair: 'insight',
          rotulo: 'Rascunhar o reenquadramento a partir do caso',
          placeholder: 'Descreva o problema do cliente e o setor dele.',
          padrao: baseDoInsight(op),
          contexto: function () { return IA.contextoDaOportunidade(op); } },
        { id: 'texto', rotulo: 'O que o cliente não enxerga sozinho', tipo: 'textarea', voz: true,
          placeholder: 'Ex.: a perda não está na colheita, está no intervalo entre lotes — e ela cresce com o volume.' },
        { id: 'estado', rotulo: 'Em que ponto está', tipo: 'select',
          opcoes: P.ESTADOS_INSIGHT.map(function (e) { return { valor: e.id, rotulo: e.rotulo }; }) }
      ], op.insight || {}, function (d) {
        Store.definirInsight(opId, d);
        render();
      });
    },
    filtrarPeriodo: function (periodo) { V.definirPeriodo(periodo); render(); },
    filtrarSegmento: function (segmento) { V.definirSegmento(segmento); render(); },

    /* ---------- Contas e contatos ---------- */
    /* `depois` existe para quem chegou aqui no meio de outra coisa — cadastrar
       a empresa dentro da oportunidade. Sem ele, salvar a conta jogava a pessoa
       na lista de contas e o negócio que ela estava criando se perdia. */
    novaConta: function (depois) {
      U.formulario('Nova conta', camposConta(), {}, function (d, docs, pessoas) {
        if (!d.nome) { if (depois) depois(null); return; }
        const nova = Store.criarConta(d);
        anexarAoRegistro(docs, { contaId: nova.id });
        const n = criarContatosPropostos(nova.id, pessoas);
        if (!depois) location.hash = '#/contas';
        render();
        if (n) {
          alert(nova.nome + ' cadastrada com ' +
            (n === 1 ? '1 contato' : n + ' contatos') + '.\n\n' +
            'Confira o papel de cada um na compra — é ele que alimenta a cobertura do grupo comprador.');
        }
        if (depois) depois(nova);
      }, null, function () { if (depois) depois(null); });
    },

    editarConta: function (id) {
      const c = Store.conta(id);
      if (!c) return;
      U.formulario('Editar conta', camposConta(), c, function (d, docs, pessoas) {
        Object.assign(c, d);
        Store.salvar();
        anexarAoRegistro(docs, { contaId: id });
        criarContatosPropostos(id, pessoas);
        render();
      });
    },

    /* Documentos da empresa, como no RD Station: o que se carregou uma vez
       continua ali para quem abrir depois. Não confundir com o que a IA leu —
       ler é momento, anexar é memória, e são gestos diferentes ainda que o
       arquivo seja o mesmo. */
    arquivosDaConta: function (contaId) {
      const c = Store.conta(contaId);
      if (!c) return;
      if (!Arq.disponivel()) { alert('Este navegador não guarda anexos.'); return; }

      const dlg = document.createElement('dialog');
      dlg.innerHTML = '<div class="corpo"><h2>Documentos · ' + U.esc(c.nome) + '</h2>' +
        '<p class="nota-form">Ficam neste aparelho, ligados a esta empresa. ' +
        'Word, Excel, PowerPoint, PDF, imagem — o que for.</p>' +
        '<input type="file" multiple hidden id="anexos-conta-arquivo">' +
        '<div class="row"><button class="btn alt mini" type="button" id="anexos-conta-add">📎 Carregar documentos</button></div>' +
        '<div id="anexos-conta-lista"><p class="tiny muted">Carregando…</p></div></div>' +
        '<div class="rodape"><button class="btn" value="ok" type="submit">Fechar</button></div>';
      dlg.innerHTML = '<form method="dialog">' + dlg.innerHTML + '</form>';
      document.body.appendChild(dlg);
      dlg.addEventListener('close', function () { dlg.remove(); render(); });

      const lista = dlg.querySelector('#anexos-conta-lista');
      const entrada = dlg.querySelector('#anexos-conta-arquivo');

      function pintar() {
        Arq.listar({ contaId: contaId }).then(function (itens) {
          if (!itens.length) {
            lista.innerHTML = '<div class="vazio small">Nenhum documento ainda.</div>';
            return;
          }
          lista.innerHTML = '<table><tbody>' + itens.map(function (a) {
            return '<tr><td><strong>' + U.esc(a.nome) + '</strong>' +
              '<span class="tiny muted">' + U.esc(a.data) + '</span></td>' +
              '<td class="right tiny muted">' + Math.max(1, Math.round(a.tamanho / 1024)) + ' kB</td>' +
              '<td class="right" style="white-space:nowrap">' +
              '<button type="button" class="btn ghost mini" data-abre="' + a.id + '">Abrir</button> ' +
              '<button type="button" class="btn ghost mini" data-tira="' + a.id + '">Excluir</button></td></tr>';
          }).join('') + '</tbody></table>';

          lista.querySelectorAll('[data-abre]').forEach(function (b) {
            b.addEventListener('click', function () { Arq.abrir(b.getAttribute('data-abre')); });
          });
          lista.querySelectorAll('[data-tira]').forEach(function (b) {
            b.addEventListener('click', function () {
              if (!U.confirmar('Excluir este documento? Não tem volta.')) return;
              Arq.excluir(b.getAttribute('data-tira')).then(pintar);
            });
          });
        });
      }

      dlg.querySelector('#anexos-conta-add').addEventListener('click', function () { entrada.click(); });
      entrada.addEventListener('change', function () {
        const escolhidos = Array.prototype.slice.call(entrada.files || []);
        entrada.value = '';
        if (!escolhidos.length) return;
        Promise.all(escolhidos.map(function (a) {
          return Arq.salvar(a, { contaId: contaId }).catch(function (e) {
            alert('Não consegui guardar ' + a.name + ': ' + e.message);
          });
        })).then(pintar);
      });

      pintar();
      dlg.showModal();
    },

    /* Mesma regra da oportunidade: o formulário que a pessoa pediu abre
       sempre, e a empresa que falta se cadastra de dentro dele. */
    novoContato: function (contaId, valores) {
      const contas = Store.dados().contas;
      const campos = contaId ? camposContato(contaId) : [{
        id: 'contaId', rotulo: 'Empresa', tipo: 'select',
        padrao: (contas[0] && contas[0].id) || '',
        opcoes: (contas.length ? [] : [{ valor: '', rotulo: '— nenhuma empresa cadastrada ainda —' }])
          .concat(contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; }))
          .concat([{ valor: NOVA_CONTA, rotulo: '+ Cadastrar nova empresa…' }])
      }].concat(camposContato(null));

      U.formulario('Novo contato', campos, valores || {}, function (d) {
        if (!d.nome) return;
        const alvo = contaId || d.contaId;
        if (!alvo || alvo === NOVA_CONTA) {
          alert('Escolha a empresa desta pessoa.\n\n' +
            'Se ela ainda não existe, use "+ Cadastrar nova empresa" no próprio campo.');
          return App.novoContato(contaId, d);
        }
        Store.criarContato(Object.assign({}, d, {
          contaId: alvo, reportaA: d.reportaA || null
        }));
        render();
      }, function (dlg) {
        const sel = dlg.querySelector('[name="contaId"]');
        if (!sel) return;
        sel.addEventListener('change', function () {
          if (sel.value !== NOVA_CONTA) return;
          const guardado = valoresDoFormulario(dlg, campos);
          dlg.close('cancelar');
          App.novaConta(function (nova) {
            App.novoContato(contaId, Object.assign(guardado, nova ? { contaId: nova.id } : {}));
          });
        });
      });
    },

    editarContato: function (id) {
      const c = Store.contato(id);
      if (!c) return;
      U.formulario('Editar contato', camposContato(c.contaId, c.id), c, function (d) {
        Object.assign(c, d, { reportaA: d.reportaA || null, influencia: Number(d.influencia) || 2 });
        Store.salvar();
        render();
      });
    },

    /* ---------- Oportunidades ---------- */
    /* Sem conta cadastrada, isto dizia "cadastre uma conta primeiro" e abria o
       formulário de conta — e ali acabava. Quem clicou em "+ Oportunidade"
       tinha de clicar de novo depois, se lembrasse. Beco sem saída com aviso
       educado continua sendo beco sem saída.

       Agora o caminho não se interrompe: cadastra a empresa e volta para a
       oportunidade, com ela já escolhida. O que a pessoa tinha digitado antes
       volta junto — perder o título porque faltava a empresa seria trocar um
       aborrecimento por outro. */
    novaOportunidade: function (contaId, valores) {
      const contas = Store.dados().contas;

      /* Sem empresa nenhuma, isto abria o cadastro de empresa antes da
         oportunidade. Funcionava, mas inverte o que a pessoa pediu: ela
         clicou em oportunidade, quer ver a oportunidade. Agora o formulário do
         negócio abre sempre, e a empresa se cadastra de dentro dele — pelo
         próprio campo Empresa, que é onde ela olha ao perceber que falta. */
      const campos = camposOportunidade(contas, contaId);
      U.formulario('Nova oportunidade', campos, valores || {}, function (d, docs, pessoas, empresaNova) {
        if (!d.titulo) return;

        /* A empresa que a IA achou e não existia entra aqui, se ficou marcada.
           Antes do negócio, porque o negócio precisa do id dela. */
        let alvo = d.contaId;
        let criada = null;
        if ((!alvo || alvo === NOVA_CONTA) && empresaNova) {
          criada = Store.criarConta(empresaNova);
          alvo = criada.id;
        }
        if (!alvo || alvo === NOVA_CONTA) {
          alert('Escolha a empresa deste negócio.\n\n' +
            'Se ela ainda não existe, use "+ Cadastrar nova empresa" no próprio campo.');
          return App.novaOportunidade(contaId, d);
        }

        const op = Store.criarOportunidade(Object.assign({}, d, { contaId: alvo }));
        anexarAoRegistro(docs, { oportunidadeId: op.id, contaId: alvo });
        const quantos = criarContatosPropostos(alvo, pessoas);
        location.hash = '#/op/' + op.id;
        render();
        /* "criada" e não "empresaNova": a pessoa pode ter escolhido outra
           empresa no select depois de a IA propor uma nova, e aí a ficha
           proposta não vira cadastro nenhum. Anunciar que virou seria mentir
           sobre o que ficou no banco. */
        if (criada || quantos) {
          alert('Pronto:' +
            (criada ? '\n· empresa ' + criada.nome + ' cadastrada' : '') +
            (quantos ? '\n· ' + (quantos === 1 ? '1 contato' : quantos + ' contatos') + ' adicionados' : '') +
            '\n· negócio criado.\n\nConfira o papel de cada pessoa na compra — é ele que alimenta a cobertura do grupo comprador.');
        }
      }, function (dlg) {
        /* A opção "+ Nova empresa" no próprio select: é onde a pessoa está
           olhando quando descobre que a empresa não existe. */
        const sel = dlg.querySelector('[name="contaId"]');
        if (!sel) return;
        sel.addEventListener('change', function () {
          if (sel.value !== NOVA_CONTA) {
            /* Escolheu uma empresa de verdade: a ficha que a IA propôs deixa
               de valer, e o convite some da tela junto. */
            dlg.empresaNovaIA = null;
            const caixa = dlg.querySelector('[data-empresa-ia]');
            if (caixa && caixa.querySelector('[data-cria-empresa]')) caixa.innerHTML = '';
            return;
          }
          const guardado = valoresDoFormulario(dlg, campos);
          dlg.close('cancelar');
          App.novaConta(function (nova) {
            App.novaOportunidade(nova ? nova.id : contaId, guardado);
          });
        });
      });
    },

    editarOportunidade: function (id) {
      const op = Store.oportunidade(id);
      if (!op) return;
      const contas = Store.dados().contas;
      U.formulario('Editar oportunidade', camposOportunidade(contas).concat([
        { id: 'notas', rotulo: 'Notas', tipo: 'textarea' }
      ]), op, function (d) {
        Store.atualizarOportunidade(id, d);
        render();
      });
    },

    /* Nota 2 significa comprovado. Sem evidência confirmada, o app explica e recusa. */
    pontuar: function (opId, dim, valor) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      if (valor === 2 && !E.podeComprovar(op, dim)) {
        const nome = P.DIMENSOES.find(function (d) { return d.id === dim; }).nome;
        if (U.confirmar(nome + ' só chega a 2 com uma evidência confirmada ou documentada do cliente.\n\nRegistrar essa evidência agora?')) {
          App.novaEvidencia(opId, null, dim);
        }
        return;
      }
      Store.pontuar(opId, dim, valor);
      render();
    },

    /* ---------- Evidências ---------- */
    /* O botão do alto da tela: "acabei de falar com um cliente". Também entra
       por tarefa — a tarefa é a evidência, e uma evidência sem a interação
       que a produziu é um efeito sem causa. A única pergunta a mais é em qual
       negócio, e ela só aparece quando há mais de um. */
    capturaRapida: function () {
      const abertas = Store.dados().oportunidades.filter(function (o) { return !o.desfecho; });
      if (!abertas.length) { alert('Nenhum negócio aberto para registrar uma tarefa.'); return; }
      if (abertas.length === 1) { App.novaTarefa(abertas[0].id, '', { situacao: 'feita' }); return; }
      U.formulario('Em qual negócio?', [{
        id: 'oportunidadeId', rotulo: 'Negócio', tipo: 'select',
        opcoes: abertas.map(function (o) {
          const c = Store.conta(o.contaId);
          return { valor: o.id, rotulo: ((c && c.nome) ? c.nome + ' — ' : '') + o.titulo };
        })
      }], {}, function (d) {
        if (d.oportunidadeId) App.novaTarefa(d.oportunidadeId, '', { situacao: 'feita' });
      });
    },

    /* Evidência = o cliente se moveu. É o único registro que altera Evidence Age. */
    novaEvidencia: function (opId, listaAbertas, dimensaoSugerida, padroes) {
      const op = opId ? Store.oportunidade(opId) : null;
      if (opId && !op) return;
      /* Quando a evidência vem de uma tarefa recém-concluída, o canal e a data
         já são conhecidos: repetir a pergunta é pedir que a pessoa erre. */
      const vindos = padroes || {};

      const sugestoes = [];
      P.DIMENSOES.forEach(function (d) {
        d.evidencias.forEach(function (ev) { sugestoes.push({ valor: d.id + '|' + ev, rotulo: d.nome + ' — ' + ev }); });
      });

      /* Compartilhados entre a montagem dos campos e o comportamento da janela. */
      let tocado = false;
      let notaTocada = false;
      let opSelecionada = op;

      const campos = [];
      if (listaAbertas) {
        campos.push({
          id: 'oportunidadeId', rotulo: 'Oportunidade', tipo: 'select',
          opcoes: listaAbertas.map(function (o) {
            const c = Store.conta(o.contaId);
            return { valor: o.id, rotulo: ((c && c.nome) ? c.nome + ' — ' : '') + o.titulo };
          })
        });
      }

      /* A caixa que preenche o resto. Um parágrafo colado vira título,
         dimensão, força, contato, canal, data e compromisso — sete campos.
         A nota fica de fora na marra: é ela que vira IAD. */
      campos.push({
        id: 'ata', tipo: 'ia', extrair: 'evidencia',
        rotulo: 'Cole a ata ou conte o que aconteceu',
        placeholder: 'Ex.: Call de ontem com a Agro Verde. Entrou o Marcelo Prates, que é CFO. Disse que a perda por contaminação está em 4% do lote e ficou de mandar os números até dia 30.',
        nunca: ['nota'],
        contexto: function () { return IA.contextoDaOportunidade(opSelecionada); },
        aoAplicar: function (dlg, r) {
          /* A IA devolve o nome de quem falou; aqui ele vira o contato certo. */
          const nome = (r.campos && r.campos.contato) || '';
          const select = dlg.querySelector('[name="contatoId"]');
          if (nome && select) {
            const achado = Array.prototype.filter.call(select.options, function (o) {
              return o.value && o.textContent.toLowerCase().indexOf(nome.toLowerCase().split(' ')[0]) !== -1;
            })[0];
            if (achado) { select.value = achado.value; U.marcarSugerido(select, nome); }
          }
          /* Força sugerida move a nota automática. Congelamos: a nota volta
             para "manter" e espera a escolha de quem esteve na reunião. */
          const nota = dlg.querySelector('[name="nota"]');
          if (nota) {
            notaTocada = true;
            nota.value = 'manter';
            U.marcarSugerido(nota, 'A nota é sua: o assistente não decide se a decisão amadureceu.');
          }
          tocado = true;
        }
      });

      const pessoas = op ? E.stakeholdersDaOp(op) : [];
      campos.push(
        { id: 'titulo', rotulo: 'O que o cliente fez', tipo: 'textarea', voz: true, placeholder: 'Ex.: CFO pediu o payback antes de aprovar' },
        { id: 'dimensao', rotulo: 'Dimensão afetada', tipo: 'select', padrao: dimensaoSugerida || 'problema', opcoes: P.DIMENSOES.map(function (d) { return { valor: d.id, rotulo: d.nome }; }) },
        { id: 'forca', rotulo: 'Força da evidência', tipo: 'select', padrao: 'confirmado', opcoes: P.FORCAS.map(function (f) { return { valor: f.id, rotulo: f.rotulo + ' — ' + f.desc }; }) },
        /* Registrar a evidência e pontuar eram dois gestos, e o segundo não era
           pedido em lugar nenhum: a pessoa lançava a evidência e o mapa continuava
           zerado, como se nada tivesse acontecido. Agora é a mesma janela. */
        { id: 'nota', rotulo: 'Como fica esta decisão', tipo: 'select', padrao: '2', opcoes: [
          { valor: 'manter', rotulo: 'Manter como está' },
          { valor: '0', rotulo: '0 — Não sabemos' },
          { valor: '1', rotulo: '1 — Parcial' },
          { valor: '2', rotulo: '2 — Comprovado pelo cliente' }
        ] },
        { id: 'sugestao', rotulo: 'Ou escolha uma evidência típica', tipo: 'select', opcoes: [{ valor: '', rotulo: '— descrever acima —' }].concat(sugestoes) }
      );
      if (pessoas.length) {
        campos.push({
          id: 'contatoId', rotulo: 'Quem produziu', tipo: 'select',
          opcoes: [{ valor: '', rotulo: '— não informado —' }].concat(pessoas.map(function (p) { return { valor: p.id, rotulo: p.nome }; }))
        });
      }
      campos.push(
        { id: 'canal', rotulo: 'Canal', tipo: 'select', padrao: vindos.canal || '',
          opcoes: ['Reunião', 'Visita', 'Telefonema', 'WhatsApp', 'E-mail', 'LinkedIn', 'Documento'] },
        { id: 'data', rotulo: 'Data', tipo: 'date', padrao: vindos.data || Store.hoje() },
        { id: 'compromissoTexto', rotulo: 'O que ficou combinado (opcional)' },
        { id: 'compromissoData', rotulo: 'Para quando', tipo: 'date' },
        { id: 'compromissoDono', rotulo: 'A vez é de quem', tipo: 'select', opcoes: [{ valor: 'cliente', rotulo: 'Do cliente' }, { valor: 'nos', rotulo: 'Nossa' }] }
      );

      U.formulario('Evidência do cliente', campos, {}, function (d) {
        let titulo = d.titulo, dimensao = d.dimensao;
        if (d.sugestao) {
          const partes = d.sugestao.split('|');
          dimensao = partes[0];
          if (!titulo) titulo = partes[1];
        }
        if (!titulo) return;
        const alvo = opId || d.oportunidadeId;
        Store.registrarEvento(alvo, {
          tipo: 'decision', titulo: titulo, dimensao: dimensao, forca: d.forca,
          contatoId: d.contatoId || null, canal: d.canal, data: d.data || Store.hoje(),
          compromisso: d.compromissoData
            ? { texto: d.compromissoTexto || 'Próximo passo combinado', data: d.compromissoData, dono: d.compromissoDono }
            : null
        });

        /* A evidência entra primeiro: é ela que autoriza o 2. */
        if (d.nota !== 'manter') {
          const nota = Number(d.nota);
          const atual = Store.oportunidade(alvo);
          if (nota === 2 && !E.podeComprovar(atual, dimensao)) {
            alert('Evidência registrada. A nota ficou em 1: só relato não comprova — para 2 é preciso uma evidência confirmada ou documentada.');
            Store.pontuar(alvo, dimensao, Math.max(1, atual.dims[dimensao] || 0));
          } else {
            Store.pontuar(alvo, dimensao, nota);
          }
        }
        render();
      }, function (dlg) {
        /* A dimensão se ajusta ao que está sendo escrito ou ditado; o vendedor pode trocar. */
        const texto = dlg.querySelector('[name="titulo"]');
        const select = dlg.querySelector('[name="dimensao"]');
        const forca = dlg.querySelector('[name="forca"]');
        const nota = dlg.querySelector('[name="nota"]');
        const escolhaOp = dlg.querySelector('[name="oportunidadeId"]');

        const opDoFormulario = function () {
          return op || (escolhaOp ? Store.oportunidade(escolhaOp.value) : null);
        };
        opSelecionada = opDoFormulario();

        /* O 2 vale "comprovado", e relato não comprova. Em vez de aceitar e
           recusar depois, a opção fica indisponível enquanto não puder valer. */
        const ajustarNota = function () {
          const alvo = opDoFormulario();
          const atual = (alvo && alvo.dims[select.value]) || 0;
          const podeDois = forca.value !== 'relato';
          const opcaoDois = nota.querySelector('option[value="2"]');

          opcaoDois.disabled = !podeDois;
          opcaoDois.textContent = podeDois
            ? '2 — Comprovado pelo cliente'
            : '2 — Comprovado (exige evidência confirmada)';

          if (notaTocada) {
            if (!podeDois && nota.value === '2') nota.value = '1';
            return;
          }
          const sugerida = podeDois ? 2 : 1;
          nota.value = String(Math.max(atual, sugerida));
        };

        nota.addEventListener('change', function () { notaTocada = true; });
        select.addEventListener('change', function () { tocado = true; ajustarNota(); });
        forca.addEventListener('change', ajustarNota);
        if (escolhaOp) escolhaOp.addEventListener('change', function () {
          opSelecionada = opDoFormulario();
          ajustarNota();
        });
        texto.addEventListener('input', function () {
          if (tocado) return;
          const palpite = E.sugerirDimensao(texto.value);
          if (palpite) { select.value = palpite; ajustarNota(); }
        });

        /* Enquanto se escreve: o palpite local acerta pelas palavras óbvias;
           o assistente acerta a diferença entre "vai levar ao CFO" e "o CFO
           participou", que é justamente o que separa relato de confirmado.
           Se a chamada falhar, fica valendo o palpite local — sem aviso. */
        if (IA.disponivel()) {
          const emFila = IA.fila();
          IA.aoParar(texto, 1000, function () {
            if (tocado || texto.value.trim().length < 20) return;
            emFila.pedir('classificar', texto.value, IA.contextoDaOportunidade(opDoFormulario()))
              .then(function (r) {
                if (!r || tocado) return;
                const c = r.campos || {};
                if (c.dimensao && select.querySelector('option[value="' + c.dimensao + '"]')) {
                  select.value = c.dimensao;
                  U.marcarSugerido(select, r.frases.dimensao);
                }
                if (c.forca && !notaTocada) {
                  forca.value = c.forca;
                  U.marcarSugerido(forca, r.frases.forca);
                }
                ajustarNota();
              });
          });
        }
        ajustarNota();
      });
    },

    processarReuniao: function (opId, texto, relerNotas, docs, depois) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      /* A ata que a IA acabou de ler fica anexada ao negócio, como no RD
         Station: ler é momento, anexar é memória. Sem isto, quem carregou o
         .docx da reunião ficava só com as evidências e perdia o documento. */
      anexarAoRegistro(docs, { oportunidadeId: opId, contaId: op.contaId,
        categoria: 'Ata de reunião' });
      const aviso = document.createElement('dialog');
      aviso.innerHTML = '<div class="corpo"><h2>Lendo a reunião…</h2>' +
        '<p class="small muted">Separando o que o cliente fez, por decisão. Leva alguns segundos.</p></div>';
      document.body.appendChild(aviso);
      aviso.showModal();

      IA.analisarReuniao(texto, IA.contextoDaOportunidade(op), op, E.resumo(op)).then(function (r) {
        aviso.close();
        aviso.remove();
        /* O motivo vem do servidor e aparece como veio. A frase única de antes
           — "não consegui falar com o assistente" — servia para tempo
           esgotado, chave da IA vencida, modelo fora do ar e material grande
           demais, e mandava procurar rede quando o problema era outro. A
           tarefa e os anexos já estão gravados: só a leitura falhou. */
        if (!r || r.erro) {
          alert('A tarefa e os documentos foram gravados. O que falhou foi a leitura:\n\n' +
            ((r && r.erro) || 'O servidor respondeu vazio.'));
          render();
          if (depois) depois();
          return;
        }
        if (!r.evidencias.length) {
          alert('Li o texto e não encontrei nada que o CLIENTE tenha feito. Atividade nossa não conta como evidência.');
          render();
          if (depois) depois();
          return;
        }
        App.aplicarLeituraDaIA(opId, r, relerNotas ? texto : null, depois);
      });
    },

    /* A lista de conferência. Nada entra na base sem alguém marcar — cada
       evidência mexe no Evidence Age, e cada nota mexe no IAD que o dono da
       empresa vê. O assistente propõe; quem esteve na reunião assina. */
    /* ---------- O assistente aplica; o vendedor só fez a tarefa ----------
       Antes havia duas telas de conferência: uma para as evidências e outra
       para as oito notas. Duas telas depois de já ter feito a reunião e já
       ter escrito a ata é onde o gesto morria — e o índice ficava zerado no
       painel do gestor não porque nada aconteceu, mas porque ninguém teve
       paciência de confirmar duas vezes.

       Agora entra sozinho, e o que segura a qualidade não é o clique da
       pessoa: é a mesma trava de sempre, do motor. Nota 2 exige evidência
       confirmada ou documentada; relato não comprova, venha de quem vier.
       Dimensão que a IA inventa é descartada dos dois lados. E nota só sobe
       sozinha — rebaixar sem ninguém olhar apagaria trabalho de quem pontuou
       à mão, e isso não se desfaz.

       O que a pessoa recebe é o relatório do que mudou, com uma porta para
       ajustar. Ler não é trabalho; preencher é. */
    aplicarLeituraDaIA: function (opId, resultado, textoParaNotas, depois) {
      const op = Store.oportunidade(opId);
      if (!op) return;

      let evidencias = 0, pessoas = 0;
      (resultado.evidencias || []).forEach(function (ev) {
        Store.registrarEvento(opId, {
          tipo: 'decision', titulo: ev.titulo, dimensao: ev.dimensao,
          forca: ev.forca || 'relato', contatoId: contatoPeloNome(op.contaId, ev.contato),
          canal: ev.canal || 'Reunião', data: ev.data || Store.hoje(),
          compromisso: ev.compromissoData
            ? { texto: ev.compromissoTexto || 'Próximo passo combinado',
                data: ev.compromissoData, dono: ev.compromissoDono || 'cliente' }
            : null
        });
        evidencias++;
      });

      (resultado.contatos || []).forEach(function (c) {
        if (!c || !c.nome) return;
        if (contatoPeloNome(op.contaId, c.nome)) return;   /* já existe */
        Store.criarContato({
          contaId: op.contaId, nome: c.nome, cargo: c.cargo || '',
          papel: c.papel || 'Usuário', sentimento: 'neutro',
          perfil: 'nao_classificado', influencia: 2
        });
        pessoas++;
      });

      const negocio = aplicarNegocioDaIA(opId, resultado.negocio);
      const base = { evidencias: evidencias, pessoas: pessoas, negocio: negocio };
      render();

      /* As oito vieram na mesma resposta: não há segunda chamada a fazer.
         A trava do 2 é aplicada aqui, depois de as evidências novas já terem
         entrado — é ela que enxerga se a prova existe. */
      if (resultado.decisoes && resultado.decisoes.length) {
        const mudancas = aplicarNotasDaIA(opId, resultado.decisoes);
        render();
        mostrarResumo(opId, base, mudancas, resultado.decisoes, depois, '');
        return;
      }
      /* Só quando não vieram — função antiga publicada, ou resposta sem elas —
         é que gastamos a segunda chamada. */
      relerAsOito(opId, textoParaNotas, base, depois);
    },

    removerEvento: function (opId, evId) {
      if (!U.confirmar('Excluir este evento?')) return;
      Store.removerEvento(opId, evId);
      render();
    },

    definirCompromisso: function (opId) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      U.formulario('Próximo compromisso', [
        { id: 'texto', rotulo: 'O que ficou combinado' },
        { id: 'data', rotulo: 'Para quando', tipo: 'date', padrao: Store.hoje() },
        { id: 'dono', rotulo: 'A vez é de quem', tipo: 'select', opcoes: [{ valor: 'cliente', rotulo: 'Do cliente' }, { valor: 'nos', rotulo: 'Nossa' }] }
      ], op.proximoCompromisso || {}, function (d) {
        Store.definirCompromisso(opId, d);
        render();
      });
    },

    /* ---------- Tarefas ---------- */
    filtrarTarefas: function (v) { V.definirFiltroTarefas(v); render(); },
    periodoTarefas: function (v) { V.definirPeriodoTarefas(v); render(); },

    /* ---------- Uma tarefa só, e reunião é um tipo dela ----------
       Antes havia dois botões: "+ Tarefa" para o que eu vou fazer e
       "Registrar reunião" para o que eu já fiz. São o mesmo objeto em dois
       momentos, e separá-los deixava metade do trabalho fora da conta: a
       reunião registrada não virava tarefa, então o painel dizia "0 tarefas"
       para quem tinha passado o dia inteiro em visita.

       Aqui a pergunta é uma: esta tarefa é para fazer, ou já foi feita? A
       resposta muda o formulário e muda o que o sistema aprende. Tarefa
       planejada que se conclui mostra disciplina de método; tarefa registrada
       depois mostra o vendedor correndo atrás do próprio histórico. As duas
       contam no funil, e não contam igual na metodologia — é por isso que a
       origem fica gravada, e não apenas o "concluída". */
    novaTarefa: function (opId, decisaoAlvo, opcoes) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      const r = E.resumo(op);
      const o = opcoes || {};
      const PERGUNTAS = P.FECHAMENTO_REUNIAO.map(function (q) { return 'q_' + q.id; });
      /* Tudo o que só faz sentido depois de a tarefa ter acontecido. Os
         documentos NÃO estão nesta lista: ficam visíveis sempre. */
      const DO_RELATO = ['secaoRelato', 'feitaEm', 'relato', 'evidenciaDireta',
        'compromissoTexto', 'compromissoData', 'compromissoDono'].concat(PERGUNTAS);

      const campos = [
        { id: 'titulo', rotulo: 'O que fazer', padrao: o.titulo || '' },
        { id: 'tipo', rotulo: 'Como (canal)', tipo: 'select', largura: 'metade',
          padrao: o.tipo || '', opcoes: Store.nomesDoCatalogo('tiposTarefa') },
        { id: 'situacao', rotulo: 'Situação', tipo: 'select', largura: 'metade',
          padrao: o.situacao || 'afazer',
          opcoes: [{ valor: 'afazer', rotulo: 'A fazer' }, { valor: 'feita', rotulo: 'Já foi feita' }] },
        /* O anexo fica aqui em cima e nunca some. É o material que carrega a
           informação — proposta, ata, planilha de consumo, dossiê — e escondê-lo
           atrás de uma escolha era escondê-lo de quem mais precisa dele. Se a
           tarefa já foi feita, a IA lê o conteúdo junto com o que foi digitado;
           em qualquer caso os arquivos ficam anexados ao negócio. */
        { id: 'arquivo', tipo: 'file',
          rotulo: 'Documentos (Word, PDF, Excel, PowerPoint, texto) — pode escolher vários' },
        {
          id: 'decisaoAlvo', rotulo: 'Decisão que pretende provocar', tipo: 'select',
          padrao: decisaoAlvo || (r.nbd.dimensao ? r.nbd.dimensao.id : 'problema'),
          opcoes: P.DIMENSOES.map(function (d) { return { valor: d.id, rotulo: d.nome }; })
        },
        { tipo: 'slot', slot: 'metodo' },
        { id: 'vencimento', rotulo: 'Para quando', tipo: 'date', padrao: Store.hoje() },

        { id: 'secaoRelato', tipo: 'secao', rotulo: 'O que aconteceu',
          ajuda: 'O assistente lê tudo junto — o que você escreveu e o conteúdo dos documentos anexados acima — separa o que o CLIENTE fez e relê as oito decisões. Preencha o que tiver; nada aqui é obrigatório.' },
        { id: 'feitaEm', rotulo: 'Quando foi feita', tipo: 'date', padrao: Store.hoje(), largura: 'metade' },
        { id: 'relato', rotulo: 'Cole a ata, a transcrição ou conte o que aconteceu', tipo: 'textarea', voz: true,
          placeholder: 'Cole aqui o resumo automático da call, a transcrição ou suas anotações. Some ao conteúdo dos documentos anexados acima.' }
      ];

      /* As quatro perguntas fechadas do fim de reunião. Cada "sim" vira
         evidência sem digitação — é o caminho de quem está no carro depois da
         visita. Somam ao que veio da ata, não substituem. */
      P.FECHAMENTO_REUNIAO.forEach(function (q) {
        campos.push({ id: 'q_' + q.id, rotulo: q.pergunta, tipo: 'select', opcoes: OPCOES_SIM_NAO });
      });

      campos.push(
        { id: 'compromissoTexto', rotulo: 'Próximo passo combinado' },
        { id: 'compromissoData', rotulo: 'Para quando', tipo: 'date', largura: 'metade' },
        { id: 'compromissoDono', rotulo: 'A vez é de quem', tipo: 'select', largura: 'metade',
          opcoes: [{ valor: 'cliente', rotulo: 'Do cliente' }, { valor: 'nos', rotulo: 'Nossa' }] },
        { id: 'evidenciaDireta', rotulo: 'Quer registrar também uma evidência específica?',
          tipo: 'select', padrao: o.evidenciaDireta || 'nao', opcoes: OPCOES_SIM_NAO }
      );

      U.formulario('Nova tarefa', campos, {}, function (d, docs) {
        if (!d.titulo) return;
        const feita = d.situacao === 'feita';
        const quando = feita ? (d.feitaEm || Store.hoje()) : (d.vencimento || Store.hoje());

        const tarefa = Store.criarTarefa({
          oportunidadeId: opId, titulo: d.titulo, tipo: d.tipo,
          decisaoAlvo: d.decisaoAlvo, vencimento: quando,
          origem: feita ? 'registrada' : 'planejada'
        });
        /* Tarefa a fazer também guarda o material: a proposta que vou enviar
           fica anexada ao negócio desde já. */
        if (!feita) {
          anexarAoRegistro(docs, { oportunidadeId: opId, contaId: op.contaId, categoria: 'Outro' });
          render();
          return;
        }
        concluirComOQueAconteceu(op, tarefa.id, d, docs, d.decisaoAlvo);
      }, function (dlg) {
        U.ligarDocumentos(dlg, 'arquivo', 'relato');
        ligarPainelDeMetodo(dlg);
        const situacao = dlg.querySelector('[name="situacao"]');
        const ajustar = function () {
          const feita = situacao.value === 'feita';
          U.mostrarCampos(dlg, DO_RELATO, feita);
          U.mostrarCampos(dlg, ['vencimento'], !feita);
        };
        situacao.addEventListener('change', ajustar);
        ajustar();
      });
    },

    /* Concluir uma tarefa que já estava aberta. Mesmos campos do "já foi
       feita", sem repetir o que a tarefa já sabe (título, canal, decisão). */
    concluirComRelato: function (opId, tarefaId) {
      const op = Store.oportunidade(opId);
      const tarefa = Store.dados().tarefas.filter(function (t) { return t.id === tarefaId; })[0];
      if (!op || !tarefa) return;

      const campos = [
        { id: 'feitaEm', rotulo: 'Quando foi feita', tipo: 'date', padrao: Store.hoje(), largura: 'metade' },
        { id: 'arquivo', tipo: 'file',
          rotulo: 'Documentos (Word, PDF, Excel, PowerPoint, texto) — pode escolher vários' },
        { id: 'relato', rotulo: 'Cole a ata, a transcrição ou conte o que aconteceu', tipo: 'textarea', voz: true,
          placeholder: 'Cole aqui o resumo automático da call, a transcrição ou suas anotações. Some ao conteúdo dos documentos anexados acima.' }
      ];
      P.FECHAMENTO_REUNIAO.forEach(function (q) {
        campos.push({ id: 'q_' + q.id, rotulo: q.pergunta, tipo: 'select', opcoes: OPCOES_SIM_NAO });
      });
      campos.push(
        { id: 'compromissoTexto', rotulo: 'Próximo passo combinado' },
        { id: 'compromissoData', rotulo: 'Para quando', tipo: 'date', largura: 'metade' },
        { id: 'compromissoDono', rotulo: 'A vez é de quem', tipo: 'select', largura: 'metade',
          opcoes: [{ valor: 'cliente', rotulo: 'Do cliente' }, { valor: 'nos', rotulo: 'Nossa' }] },
        { id: 'evidenciaDireta', rotulo: 'Quer registrar também uma evidência específica?',
          tipo: 'select', opcoes: OPCOES_SIM_NAO }
      );

      U.formulario('Concluir: ' + tarefa.titulo, campos, {}, function (d, docs) {
        d.tipo = tarefa.tipo;
        concluirComOQueAconteceu(op, tarefaId, d, docs, tarefa.decisaoAlvo);
      }, function (dlg) {
        U.ligarDocumentos(dlg, 'arquivo', 'relato');
      });
    },

    concluirTarefa: function (id) {
      Store.concluirTarefa(id);
      render();
    },

    excluirTarefa: function (id) {
      if (!U.confirmar('Excluir esta tarefa?')) return;
      Store.excluirTarefa(id);
      render();
    },

    /* ---------- Arquivos ---------- */
    anexar: function (opId) {
      if (!Arq.disponivel()) { alert('Este navegador não guarda anexos.'); return; }
      const op = Store.oportunidade(opId);
      const entrada = document.createElement('input');
      entrada.type = 'file';
      entrada.onchange = function () {
        const arquivo = entrada.files[0];
        if (!arquivo) return;
        U.formulario('Anexar “' + arquivo.name + '”', [
          { id: 'categoria', rotulo: 'Qual decisão este documento destrava', tipo: 'select', opcoes: P.CATEGORIAS_ARQUIVO },
          { id: 'enviadoPor', rotulo: 'Quem enviou', tipo: 'select', opcoes: [{ valor: 'nos', rotulo: 'Nós' }, { valor: 'cliente', rotulo: 'O cliente' }] },
          { id: 'dimensao', rotulo: 'Dimensão (se virar evidência)', tipo: 'select', opcoes: P.DIMENSOES.map(function (d) { return { valor: d.id, rotulo: d.nome }; }) }
        ], {}, function (d) {
          Arq.salvar(arquivo, {
            oportunidadeId: opId, contaId: op ? op.contaId : null,
            categoria: d.categoria, enviadoPor: d.enviadoPor
          }).then(function () {
            /* Documento que o cliente enviou é evidência documentada — a mais forte que existe. */
            if (d.enviadoPor === 'cliente') {
              Store.registrarEvento(opId, {
                tipo: 'decision', titulo: 'Cliente enviou o documento: ' + arquivo.name,
                dimensao: d.dimensao, forca: 'documentado', canal: 'Documento'
              });
            }
            render();
            /* Anexo de texto guarda muito mais do que "chegou um documento":
               guarda o que o cliente disse. Em vez de exigir que a pessoa
               lembre de analisar depois, o convite aparece na hora. */
            if (IA.disponivel() && global.IADDocumentos.aceito(arquivo)) {
              if (U.confirmar('Quer que eu leia “' + arquivo.name + '” e separe as evidências desta reunião?')) {
                global.IADDocumentos.ler(arquivo)
                  .then(function (t) {
                    if (!t || t.length < 60) { alert('Não consegui tirar texto legível deste arquivo.'); return; }
                    App.processarReuniao(opId, t);
                  })
                  .catch(function (e) { alert(e.message); });
              }
            }
          }).catch(function (e) { alert(e.message); });
        });
      };
      entrada.click();
    },

    abrirArquivo: function (id) {
      Arq.abrir(id).catch(function (e) { alert(e.message); });
    },

    excluirArquivo: function (id, opId) {
      if (!U.confirmar('Excluir este anexo definitivamente?')) return;
      Arq.excluir(id).then(function () { pintarArquivos(opId); });
    },

    /* ---------- Importação por planilha ---------- */
    importarCsv: function (tipo) {
      const entrada = document.createElement('input');
      entrada.type = 'file';
      entrada.accept = '.csv,text/csv';
      entrada.onchange = function () {
        const arquivo = entrada.files[0];
        if (!arquivo) return;
        const leitor = new FileReader();
        leitor.onload = function () {
          try {
            const analisado = Csv.parse(String(leitor.result));
            if (!analisado.registros.length) { alert('A planilha está vazia ou sem cabeçalho.'); return; }
            const prévia = Csv.analisar(tipo, analisado.registros);
            const resumo = 'Importar ' + tipo + ':\n\n' +
              '• ' + prévia.novos.length + ' registro(s) novos\n' +
              '• ' + prévia.duplicados.length + ' já existentes (serão ignorados)\n' +
              '• ' + prévia.invalidos.length + ' com problema\n' +
              (prévia.invalidos.length
                ? '\nProblemas:\n' + prévia.invalidos.slice(0, 5).map(function (i) { return 'linha ' + i.linha + ': ' + i.motivo; }).join('\n') + '\n'
                : '') +
              '\nConfirmar a importação?';
            if (!prévia.novos.length) { alert(resumo.replace('\nConfirmar a importação?', '')); return; }
            if (!U.confirmar(resumo)) return;
            const total = Csv.importar(tipo, prévia.novos);
            alert(total + ' registro(s) importados.');
            render();
          } catch (e) {
            alert('Não foi possível ler a planilha: ' + e.message);
          }
        };
        leitor.readAsText(arquivo, 'utf-8');
      };
      entrada.click();
    },

    baixarModelo: function (tipo) {
      baixar(Csv.modelo(tipo), 'modelo-' + tipo + '.csv', 'text/csv;charset=utf-8');
    },

    /* ---------- Grupo comprador, gate e desfecho ---------- */
    ligarStakeholder: function (opId) {
      const op = Store.oportunidade(opId);
      const disponiveis = Store.contatosDaConta(op.contaId).filter(function (c) { return op.stakeholders.indexOf(c.id) === -1; });
      if (!disponiveis.length) {
        if (U.confirmar('Nenhum contato disponível nesta conta. Cadastrar um agora?')) App.novoContato(op.contaId);
        return;
      }
      U.formulario('Vincular ao buying group', [
        { id: 'contatoId', rotulo: 'Pessoa', tipo: 'select', opcoes: disponiveis.map(function (c) { return { valor: c.id, rotulo: c.nome + ' — ' + c.papel }; }) }
      ], {}, function (d) {
        op.stakeholders.push(d.contatoId);
        Store.salvar();
        render();
      });
    },

    ligarTodosStakeholders: function (opId) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      const soltos = Store.contatosDaConta(op.contaId).filter(function (c) {
        return op.stakeholders.indexOf(c.id) === -1;
      });
      if (!soltos.length) return;
      soltos.forEach(function (c) { op.stakeholders.push(c.id); });
      Store.salvar();
      render();
    },

    removerStakeholder: function (opId, contatoId) {
      const op = Store.oportunidade(opId);
      op.stakeholders = op.stakeholders.filter(function (id) { return id !== contatoId; });
      Store.salvar();
      render();
    },

    liberarGate: function (opId) {
      const quem = prompt('Quem autoriza emitir a proposta sem qualificação mínima? (fica registrado)');
      if (!quem) return;
      Store.atualizarOportunidade(opId, { gateLiberadoPor: quem });
      Store.registrarEvento(opId, { tipo: 'activity', titulo: 'Proposal Gate liberado manualmente por ' + quem, canal: 'CRM' });
      render();
    },

    encerrar: function (opId) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      const r = E.resumo(op);
      U.formulario('Encerrar negócio', [
        { id: 'tipo', rotulo: 'Desfecho', tipo: 'select', opcoes: P.DESFECHOS.map(function (d) { return { valor: d.id, rotulo: d.rotulo + ' — ' + d.pergunta }; }) },
        { id: 'data', rotulo: 'Data do fechamento', tipo: 'date', padrao: Store.hoje() },
        { id: 'valorFinal', rotulo: 'Valor final (R$)', tipo: 'number', padrao: op.valor },
        { id: 'concorrente', rotulo: 'Concorrente (se houver)' },
        { id: 'motivo', rotulo: 'Por que terminou assim', tipo: 'textarea', voz: true }
      ], {}, function (d) {
        Store.fecharOportunidade(opId, Object.assign({}, d, {
          iadFinal: r.iad,
          coverageFinal: r.coverage.percentual,
          evidenceAgeFinal: r.evidenceAge,
          diasEmAberto: E.diasEntre(op.criadoEm)
        }));
        render();
      });
    },

    reabrir: function (opId) {
      if (!U.confirmar('Reabrir este negócio? A foto do fechamento será descartada.')) return;
      Store.reabrirOportunidade(opId);
      render();
    },

    /* ---------- Dados ---------- */
    exportar: function () {
      baixar(Store.exportar(), 'iad-crm-' + Store.hoje() + '.json', 'application/json');
    },

    importar: function () {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = function () {
        const arquivo = input.files[0];
        if (!arquivo) return;
        const leitor = new FileReader();
        leitor.onload = function () {
          try { Store.importar(leitor.result); render(); alert('Dados importados.'); }
          catch (e) { alert('Não foi possível importar: ' + e.message); }
        };
        leitor.readAsText(arquivo);
      };
      input.click();
    },

    limpar: function () {
      if (!U.confirmar('Apagar todos os dados deste dispositivo? Os anexos permanecem.')) return;
      Store.limpar();
      location.hash = '#/hoje';
      render();
    },

    carregarDemo: function () {
      if (Store.dados().oportunidades.length && !U.confirmar('Isso substitui os dados atuais. Continuar?')) return;
      global.IADSeed.carregar();
      location.hash = '#/hoje';
      render();
    },

    /* ---------- Nuvem ---------- */
    configurarNuvem: function () {
      const N = global.IADNuvem;
      U.formulario('Conectar ao Supabase', [
        { id: 'url', rotulo: 'URL do projeto', placeholder: 'https://xxxxxxxx.supabase.co' },
        { id: 'chave', rotulo: 'Chave pública (anon / publishable)' }
      ], N.config(), function (d) {
        if (!d.url || !d.chave) { alert('Preencha os dois campos.'); return; }
        N.salvarConfig(d);
        render();
      });
    },

    entrarNuvem: function () {
      const N = global.IADNuvem;
      U.formulario('Entrar na nuvem', [
        { id: 'email', rotulo: 'E-mail' },
        { id: 'senha', rotulo: 'Senha', tipo: 'password' }
      ], {}, function (d) {
        recadoNuvem('Entrando…');
        N.entrar(d.email, d.senha)
          .then(function () { return N.meuPerfil(); })
          .then(function (perfil) {
            N.guardarPerfilNaSessao(perfil);
            render();
            recadoNuvem(perfil && perfil.tenant_id
              ? 'Conectado. Use "Sincronizar agora" para enviar e receber.'
              : 'Conectado. Defina sua empresa antes de sincronizar.');
          })
          .catch(function (e) { render(); recadoNuvem('Não entrou: ' + e.message, true); });
      });
    },

    cadastrarNuvem: function () {
      const N = global.IADNuvem;
      U.formulario('Criar acesso na nuvem', [
        { id: 'nome', rotulo: 'Seu nome' },
        { id: 'email', rotulo: 'E-mail' },
        { id: 'whatsapp', rotulo: 'WhatsApp' },
        { id: 'senha', rotulo: 'Senha (mínimo 6 caracteres)', tipo: 'password' }
      ], {}, function (d) {
        if (!d.email || (d.senha || '').length < 6) { alert('Informe e-mail e uma senha de ao menos 6 caracteres.'); return; }
        recadoNuvem('Criando…');
        N.cadastrar(d.email, d.senha, { nome: d.nome, whatsapp: d.whatsapp })
          .then(function (r) {
            render();
            recadoNuvem(r && r.access_token
              ? 'Acesso criado e conectado. Defina sua empresa.'
              : 'Acesso criado. Confirme o e-mail que o Supabase acabou de enviar e depois clique em "Entrar na nuvem".');
          })
          .catch(function (e) { render(); recadoNuvem('Não foi possível criar: ' + e.message, true); });
      });
    },

    definirEmpresaNuvem: function () {
      const N = global.IADNuvem;
      U.formulario('Minha empresa na nuvem', [
        { id: 'nome', rotulo: 'Nome da empresa' },
        { id: 'cnpj', rotulo: 'CNPJ' }
      ], {}, function (d) {
        if (!d.nome) return;
        recadoNuvem('Criando empresa…');
        N.criarMinhaEmpresa(d.nome, d.cnpj)
          .then(function () { return N.meuPerfil(); })
          .then(function (perfil) {
            N.guardarPerfilNaSessao(perfil);
            render();
            recadoNuvem('Empresa definida. Agora pode sincronizar.');
          })
          .catch(function (e) { render(); recadoNuvem('Falhou: ' + e.message, true); });
      });
    },

    sincronizarNuvem: function () {
      recadoNuvem('Sincronizando…');
      global.IADNuvem.sincronizar()
        .then(function (r) {
          render();
          recadoNuvem('Enviados ' + r.enviados + ' registro(s), recebidos ' + r.recebidos + '.');
        })
        .catch(function (e) { render(); recadoNuvem('Não sincronizou: ' + e.message, true); });
    },

    puxarNuvem: function () {
      if (!U.confirmar('Baixar a carteira da nuvem? O que estiver só neste aparelho e ainda não foi enviado será substituído.')) return;
      recadoNuvem('Baixando…');
      global.IADNuvem.puxar()
        .then(function (n) { render(); recadoNuvem(n + ' registro(s) baixados.'); })
        .catch(function (e) { render(); recadoNuvem('Não baixou: ' + e.message, true); });
    },

    sairNuvem: function () {
      global.IADNuvem.sair().then(function () { render(); });
    },

    /* ---------- Linked Helper ---------- */
    configurarPonte: function () {
      const I = global.IADIntegracoes;
      U.formulario('Ponte do Linked Helper', [
        { id: 'url', rotulo: 'Endereço da ponte', placeholder: 'https://ponte-iad.seu-subdominio.workers.dev/' },
        { id: 'token', rotulo: 'Chave de leitura' }
      ], I.config(), function (d) {
        I.salvarConfig(d);
        leads = null;
        render();
      });
    },

    buscarLeads: function () {
      const alvo = document.getElementById('caixa-linkedhelper');
      if (alvo) alvo.innerHTML = '<div class="tiny muted" style="margin-top:10px">Buscando…</div>';
      global.IADIntegracoes.buscar().then(function (lista) {
        leads = lista;
        pintarLeads();
      }).catch(function (e) {
        leads = null;
        if (alvo) alvo.innerHTML = '<div class="aviso" style="margin-top:10px">' + U.esc(e.message) + '</div>';
      });
    },

    /* Importação em lote: busca, confere e traz de uma vez. É o mesmo caminho
       do converterLead, sem a janela por lead — o que muda é a escala. */
    importarLeads: function () {
      const espera = document.createElement('dialog');
      espera.innerHTML = '<div class="corpo"><h2>Buscando na ponte…</h2>' +
        '<p class="small muted">Procurando quem respondeu no LinkedIn.</p></div>';
      document.body.appendChild(espera);
      espera.showModal();

      global.IADIntegracoes.buscar().then(function (lista) {
        leads = lista;
        if (!lista.length) {
          espera.close(); espera.remove();
          alert('Nenhuma resposta nova na ponte.');
          return;
        }

        /* Várias SDRs mandam prospects de segmentos diferentes. Classificar
           empresa por empresa à mão é o que faz ninguém classificar — e sem
           segmento o painel por segmento não diz nada. Uma chamada só para o
           lote inteiro, e o vendedor corrige o que quiser na tela seguinte. */
        const semSegmento = lista.filter(function (l) { return l.empresa; });
        if (!IA.disponivel() || !semSegmento.length) {
          espera.close(); espera.remove();
          return App.revisarImportacao(lista);
        }

        espera.querySelector('h2').textContent = 'Classificando os segmentos…';
        espera.querySelector('p').textContent =
          semSegmento.length === 1 ? '1 empresa' : semSegmento.length + ' empresas';

        IA.classificarSegmentos(semSegmento.map(function (l) {
          return {
            nome: l.empresa, dominio: l.empresaDominio, setor: l.empresaSetor,
            descricao: l.empresaDescricao, oQueFazLa: l.oQueFazLa
          };
        })).then(function (mapa) {
          semSegmento.forEach(function (l, i) { if (mapa[i]) l.segmentoSugerido = mapa[i]; });
          espera.close(); espera.remove();
          App.revisarImportacao(lista);
        });
      }).catch(function (e) {
        espera.close(); espera.remove();
        alert(e.message);
      });
    },

    revisarImportacao: function (lista) {
      const dlg = document.createElement('dialog');
      dlg.className = 'revisao-ia';
      dlg.innerHTML = V.revisaoDaImportacao(lista);
      document.body.appendChild(dlg);

      dlg.addEventListener('close', function () {
        if (dlg.returnValue === 'ok') {
          const escolhidos = lista.filter(function (l, i) {
            const marca = dlg.querySelector('[data-lead="' + i + '"]');
            return marca && marca.checked;
          });
          const feitos = escolhidos.map(function (l) {
            const i = lista.indexOf(l);
            const escolha = dlg.querySelector('[data-segmento="' + i + '"]');
            return importarUmLead(l, escolha ? escolha.value : '');
          }).filter(Boolean);
          if (feitos.length) {
            global.IADIntegracoes.marcarProcessados(escolhidos.map(function (l) { return l.id; }));
            leads = (leads || []).filter(function (l) {
              return escolhidos.indexOf(l) === -1;
            });
            alert(feitos.length === 1
              ? '1 oportunidade criada a partir do Linked Helper.'
              : feitos.length + ' oportunidades criadas a partir do Linked Helper.');
            location.hash = '#/pipeline';
          }
          render();
        }
        dlg.remove();
      });
      dlg.showModal();
    },

    descartarLead: function (id) {
      leads = (leads || []).filter(function (l) { return l.id !== id; });
      global.IADIntegracoes.marcarProcessados([id]);
      pintarLeads();
    },

    /* A resposta no LinkedIn é evidência do cliente: entra como tal, com força
       de relato — ele disse que tem o problema, ainda não provou. */
    converterLead: function (id) {
      const lead = (leads || []).find(function (l) { return l.id === id; });
      if (!lead) return;

      /* Saiu da empresa: a conta seria criada com um único contato que não
         trabalha mais nela. Perguntamos antes de deixar o dado entrar. */
      if (lead.saiuEm && !U.confirmar(
        lead.nome + ' saiu da ' + (lead.empresa || 'empresa') + ' em ' + lead.saiuEm + '.\n\n' +
        'Criar a oportunidade assim mesmo? Cancele para descartar ou para descobrir onde a pessoa está hoje.')) {
        return;
      }

      const contas = Store.dados().contas;
      const parecida = contas.find(function (c) {
        return lead.empresa && c.nome.toLowerCase().indexOf(lead.empresa.toLowerCase().slice(0, 12)) !== -1;
      });

      U.formulario('Nova oportunidade a partir do LinkedIn', [
        { id: 'contaId', rotulo: 'Empresa', tipo: 'select', padrao: parecida ? parecida.id : '',
          opcoes: [{ valor: '', rotulo: '— cadastrar a empresa abaixo —' }]
            .concat(contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; })) },
        { id: 'empresaNova', rotulo: 'Nome da nova empresa', padrao: parecida ? '' : lead.empresa },
        { id: 'segmento', rotulo: 'Segmento', tipo: 'select',
          opcoes: [{ valor: '', rotulo: '— sem segmento —' }]
            .concat(Store.nomesDoCatalogo('segmentos').map(function (n) { return { valor: n, rotulo: n }; })) },
        { id: 'titulo', rotulo: 'Oportunidade', padrao: lead.empresa ? 'Oportunidade — ' + lead.empresa : 'Oportunidade do LinkedIn' },
        { id: 'etapa', rotulo: 'Etapa', tipo: 'select', padrao: 'Conexão', opcoes: P.ETAPAS },
        { id: 'papel', rotulo: 'Papel na compra', tipo: 'select', opcoes: P.PAPEIS },
        { id: 'perfil', rotulo: 'Perfil (Challenger)', tipo: 'select',
          opcoes: P.PERFIS.map(function (x) { return { valor: x.id, rotulo: x.rotulo }; }) },
        { id: 'evidencia', rotulo: 'Evidência (o que o cliente disse)', tipo: 'textarea', padrao: lead.resposta },
        { id: 'dimensao', rotulo: 'Dimensão afetada', tipo: 'select', padrao: 'problema',
          opcoes: P.DIMENSOES.map(function (d) { return { valor: d.id, rotulo: d.nome }; }) }
      ], {}, function (d) {
        let contaId = d.contaId;
        if (!contaId) {
          const nome = d.empresaNova || lead.empresa;
          if (!nome) { alert('Informe a empresa.'); return; }
          if (d.segmento) Store.criarNoCatalogo('segmentos', { nome: d.segmento });
          contaId = Store.criarConta({
            nome: nome, segmento: d.segmento || '',
            site: lead.empresaSite || '', cidade: lead.empresaCidade || ''
          }).id;
        }

        const contato = Store.criarContato({
          contaId: contaId, nome: lead.nome || 'Contato do LinkedIn', cargo: lead.cargo,
          papel: d.papel, perfil: d.perfil, linkedin: lead.linkedin,
          email: lead.email, telefone: lead.telefone,
          sentimento: lead.resposta ? 'neutro' : 'nao_acessado', canalPreferido: 'LinkedIn'
        });

        const op = Store.criarOportunidade({
          contaId: contaId, titulo: d.titulo, etapa: d.etapa,
          notas: lead.linkedin ? 'Origem: Linked Helper · ' + lead.linkedin : 'Origem: Linked Helper'
        });
        op.stakeholders.push(contato.id);
        Store.salvar();

        if (d.evidencia) {
          Store.registrarEvento(op.id, {
            tipo: 'decision', titulo: d.evidencia, dimensao: d.dimensao,
            forca: 'relato', contatoId: contato.id, canal: 'LinkedIn',
            /* A data é a da resposta, não a de hoje. Um lead que ficou dois
               dias na ponte nasceria com o Evidence Age zerado errado. */
            data: lead.respostaEm || Store.hoje()
          });
        }

        /* A sequência escrita para este prospect já é o reenquadramento.
           Entra como rascunho: formulado por nós, ainda não apresentado. */
        if (lead.insight) {
          Store.definirInsight(op.id, { texto: lead.insight, estado: 'formulado' });
        }

        /* O lead é de quem prospectou, não de quem clicou em importar. */
        atribuirAoOperador(lead, [Store.conta(contaId), contato, op]);

        leads = (leads || []).filter(function (l) { return l.id !== id; });
        global.IADIntegracoes.marcarProcessados([id]);
        location.hash = '#/op/' + op.id;
        render();
      });
    },

    /* ---------- acesso ---------- */
    telaAcesso: function (tela) { V.definirTelaAcesso(tela, null, ''); render(); },

    /* Trocar a própria senha. Existe porque a senha inicial de um usuário é
       entregue por outra pessoa — e senha que passou pela mão de alguém não é
       mais senha até ser trocada. */
    trocarMinhaSenha: function () {
      const N = global.IADNuvem;
      if (!N.conectado()) {
        alert('Entre com sua conta do servidor para trocar a senha.');
        return;
      }
      U.formulario('Trocar minha senha', [
        { id: 'nova', rotulo: 'Nova senha', tipo: 'password', placeholder: 'mínimo 8 caracteres' },
        { id: 'confere', rotulo: 'Repita a nova senha', tipo: 'password' }
      ], {}, function (d) {
        if (d.nova.length < 8) { alert('A senha precisa ter pelo menos 8 caracteres.'); return; }
        if (d.nova !== d.confere) { alert('As duas senhas não são iguais. Tente de novo.'); return; }
        N.trocarMinhaSenha(d.nova).then(function () {
          alert('Senha trocada. Ela vale a partir do próximo acesso, em qualquer aparelho.');
        }).catch(function (e) {
          alert('Não consegui trocar a senha: ' + e.message);
        });
      });
    },

    verSenha: function (id, botao) {
      const campo = document.getElementById(id);
      if (!campo) return;
      const escondida = campo.type === 'password';
      campo.type = escondida ? 'text' : 'password';
      botao.textContent = escondida ? '🙈' : '👁';
      botao.setAttribute('aria-label', escondida ? 'Esconder a senha' : 'Mostrar a senha');
    },

    /* Quem esperava ser ligado a uma empresa tenta de novo sem sair e voltar. */
    tentarDeNovo: function () {
      V.definirTelaAcesso('empresa', null, 'Consultando o servidor…');
      render();
      concluirEntradaNaNuvem().catch(function (e) {
        V.definirTelaAcesso('empresa', null, e.message);
        render();
      });
    },

    entrar: function () {
      const login = (document.getElementById('ac-login') || {}).value || '';
      const senha = (document.getElementById('ac-senha') || {}).value || '';
      if (!login || !senha) { V.definirTelaAcesso('login', null, 'Informe login e senha.'); return render(); }

      /* Com a nuvem configurada, quem confere a senha é o servidor — sem exceção.
         O antigo atalho local abria o app público para quem soubesse a senha de
         fábrica, que está no repositório. Offline continua funcionando: a sessão
         já aberta persiste no aparelho. */
      if (global.IADNuvem.mandaNoAcesso()) return entrarPelaNuvem(login, senha);

      A.entrar(login, senha).then(function () {
        V.definirTelaAcesso('login', null, '');
        location.hash = '#/hoje';
        render();
      }).catch(function (e) {
        /* Quem parou no meio do primeiro acesso volta para onde parou. */
        if (e.pendente === 'codigo') {
          A.gerarCodigo(e.usuario);
          V.definirTelaAcesso('codigo', e.usuario, 'Confirme seu e-mail para continuar.');
        } else if (e.pendente === 'perfil') {
          V.definirTelaAcesso('perfil', e.usuario, 'Falta completar seu cadastro.');
        } else {
          V.definirTelaAcesso('login', null, e.message);
        }
        render();
      });
    },

    criarAcesso: function () {
      const v = function (id) { return (document.getElementById(id) || {}).value || ''; };
      const nome = v('ac-nome').trim(), email = v('ac-email').trim();
      const senha1 = v('ac-senha1'), senha2 = v('ac-senha2');

      if (!nome || !email) return recado('cadastro', 'Preencha nome e e-mail.');
      if (email.indexOf('@') === -1) return recado('cadastro', 'E-mail inválido.');
      if (senha1.length < 6) return recado('cadastro', 'A senha precisa de ao menos 6 caracteres.');
      if (senha1 !== senha2) return recado('cadastro', 'As senhas não conferem.');

      const dados = { nome: nome, email: email, whatsapp: v('ac-whatsapp').trim() };

      if (global.IADNuvem.mandaNoAcesso()) {
        recado('cadastro', 'Criando acesso…');
        global.IADNuvem.cadastrar(email, senha1, dados)
          .then(function () {
            V.definirTelaAcesso('confirme', { email: email }, '');
            render();
          })
          .catch(function (e) { recado('cadastro', e.message); });
        return;
      }

      A.criarUsuario(dados, senha1)
        .then(function (u) {
          A.gerarCodigo(u);
          V.definirTelaAcesso('codigo', u, '');
          render();
        })
        .catch(function (e) { recado('cadastro', e.message); });
    },

    reenviarCodigo: function () {
      const u = pendenteAtual();
      if (!u) return;
      A.gerarCodigo(u);
      V.definirTelaAcesso('codigo', u, 'Código novo gerado.');
      render();
    },

    confirmarCodigo: function () {
      const u = pendenteAtual();
      if (!u) return;
      const digitado = (document.getElementById('ac-codigo') || {}).value || '';
      const r = A.confirmarCodigo(u, digitado);
      if (!r.ok) return recado('codigo', r.motivo, u);
      V.definirTelaAcesso('perfil', u, '');
      render();
    },

    completarPerfil: function () {
      const u = pendenteAtual();
      if (!u) return;
      const v = function (id) { return (document.getElementById(id) || {}).value || ''; };
      try {
        A.completarPerfil(u, {
          tenantId: v('ac-empresa'), empresaNova: v('ac-empresa-nova').trim(),
          cnpj: v('ac-cnpj').trim(), nome: v('ac-nome2').trim(), whatsapp: v('ac-whats2').trim()
        });
      } catch (e) {
        return recado('perfil', e.message, u);
      }
      A.abrirSessao(u);
      V.definirTelaAcesso('login', null, '');
      location.hash = '#/hoje';
      render();
    },

    sair: function (semPerguntar) {
      if (!semPerguntar && !U.confirmar('Sair do sistema?')) return;
      A.encerrarSessao();
      const N = global.IADNuvem;
      const depois = function () { V.definirTelaAcesso('login', null, ''); render(); };
      if (N.conectado()) N.sair().then(depois, depois); else depois();
    },

    /* A empresa nasce no banco, não aqui: ver criar_minha_empresa no schema. */
    criarEmpresaAcesso: function () {
      const v = function (id) { return (document.getElementById(id) || {}).value || ''; };
      const nome = v('ac-empresa-nova').trim();
      if (!nome) return recado('empresa', 'Escreva o nome da empresa.');
      recado('empresa', 'Criando empresa…');
      global.IADNuvem.criarMinhaEmpresa(nome, v('ac-cnpj').trim())
        .then(function () { return concluirEntradaNaNuvem(); })
        .catch(function (e) {
          /* "já está ligado a uma empresa" chegando nesta tela é contradição: a
             tela só aparece quando o perfil veio sem empresa. Em vez de virar
             beco sem saída, relemos o perfil — na maioria das vezes a empresa
             está lá e a pessoa simplesmente entra. */
          if (/já está ligado/i.test(e.message)) {
            return concluirEntradaNaNuvem().catch(function () {
              recado('empresa', 'O servidor diz que você já tem empresa, mas ela não veio na leitura do seu perfil. ' +
                'Saia e entre de novo; se repetir, é um problema de permissão no banco.');
            });
          }
          recado('empresa', e.message);
        });
    },

    /* ---------- administração da nuvem ---------- */
    empresaDoPerfil: function (id, tenantId) {
      global.IADNuvem.definirEmpresaDoPerfil(id, tenantId)
        .then(function () { perfisNuvem = null; pintarUsuariosNuvem(true); })
        .catch(function (e) { alert('Não foi possível ligar à empresa: ' + e.message); pintarUsuariosNuvem(true); });
    },

    papelDoPerfil: function (id, papel) {
      if (papel === 'admin' && !U.confirmar('Administrador enxerga todas as empresas e pode mover pessoas entre elas. Confirma?')) {
        return pintarUsuariosNuvem(true);
      }
      global.IADNuvem.definirPapelDoPerfil(id, papel)
        .then(function () { perfisNuvem = null; pintarUsuariosNuvem(true); })
        .catch(function (e) { alert('Não foi possível mudar o papel: ' + e.message); pintarUsuariosNuvem(true); });
    },

    /* Manda o e-mail de senha nova. O link volta para o app com os tokens
       depois do #, e o boot faz o resto — é o mesmo caminho do convite.

       A resposta é a mesma para e-mail cadastrado e não cadastrado, de
       propósito: distinguir os dois faria desta tela uma forma de descobrir
       quem usa o sistema. */
    recuperarSenha: function () {
      const N = global.IADNuvem;
      if (!N.mandaNoAcesso()) { alert('Sem servidor configurado, a senha é deste aparelho.'); return; }
      U.formulario('Esqueci minha senha', [
        { id: 'email', rotulo: 'Seu e-mail', tipo: 'email' }
      ], {}, function (d) {
        const email = (d.email || '').trim();
        if (!email || email.indexOf('@') === -1) { alert('Informe um e-mail válido.'); return; }
        N.recuperarSenha(email, location.origin + location.pathname).then(function () {
          alert('Se este e-mail tiver conta, o link para definir a senha já está a caminho.\n\n' +
            'Abra o link no mesmo navegador, e o app pede a senha nova.');
        }).catch(function (e) {
          alert('Não consegui pedir o e-mail: ' + e.message);
        });
      });
    },

    /* Editar os dados de outra pessoa, e bloquear ou desbloquear. As três
       são atribuições do administrador, e quem confere isso é o banco: a tela
       pode esconder o botão, mas esconder não é impedir. Ver a correção 09.

       Não há excluir, e é decisão, não esquecimento: desligar um vendedor não
       pode apagar a carteira que ele atendia — cliente continua cliente depois
       que o vendedor sai. Bloqueio faz o mesmo trabalho e volta atrás. */
    editarPessoaNuvem: function (id) {
      const p = (perfisNuvem || []).find(function (x) { return x.id === id; }) || {};
      U.formulario('Editar pessoa', [
        { id: 'nome', rotulo: 'Nome', tipo: 'text', padrao: p.nome || '' },
        { id: 'whatsapp', rotulo: 'WhatsApp', tipo: 'text', padrao: p.whatsapp || '',
          placeholder: '(00) 00000-0000' }
      ], {}, function (d) {
        const nome = (d.nome || '').trim();
        if (!nome) { alert('Escreva um nome.'); return; }
        global.IADNuvem.definirDadosDoPerfil(id, nome, d.whatsapp)
          .then(function () { perfisNuvem = null; pintarUsuariosNuvem(true); })
          .catch(function (e) { alert('Não foi possível gravar: ' + e.message); });
      });
    },

    bloquearPessoa: function (id, estaBloqueada) {
      const p = (perfisNuvem || []).find(function (x) { return x.id === id; }) || {};
      const quem = p.nome || 'esta pessoa';
      if (!estaBloqueada && !U.confirmar('Bloquear ' + quem + '?\n\n' +
          'Ela não entra mais no sistema. Nada é apagado: os registros dela ' +
          'continuam na empresa, e você pode desbloquear quando quiser.')) return;
      global.IADNuvem.definirBloqueioDoPerfil(id, estaBloqueada)
        .then(function () { perfisNuvem = null; pintarUsuariosNuvem(true); })
        .catch(function (e) { alert('Não foi possível: ' + e.message); });
    },

    editarEmpresaNuvem: function (id) {
      const t = (empresasNuvem || []).find(function (x) { return x.id === id; }) || {};
      U.formulario('Editar empresa', [
        { id: 'nome', rotulo: 'Nome', tipo: 'text', padrao: t.nome || '' },
        { id: 'cnpj', rotulo: 'CNPJ', tipo: 'text', padrao: t.cnpj || '' }
      ], {}, function (d) {
        const nome = (d.nome || '').trim();
        if (!nome) { alert('A empresa precisa de um nome.'); return; }
        global.IADNuvem.definirDadosDaEmpresa(id, nome, d.cnpj)
          .then(function () { empresasNuvem = null; perfisNuvem = null; pintarUsuariosNuvem(true); })
          .catch(function (e) { alert('Não foi possível gravar: ' + e.message); });
      });
    },

    bloquearEmpresa: function (id, estaBloqueada) {
      const t = (empresasNuvem || []).find(function (x) { return x.id === id; }) || {};
      const quantos = (perfisNuvem || []).filter(function (p) { return p.tenant_id === id; }).length;
      /* Bloquear a própria empresa assusta: some a carteira e parece que o
         sistema quebrou. Não é impedido — administrador continua entrando, e
         é ele quem desbloqueia —, mas tem de estar dito antes, não depois. */
      const meu = global.IADNuvem.estado().perfil || {};
      const minhaEmpresa = meu.tenant_id === id;
      if (!estaBloqueada && !U.confirmar('Bloquear a ' + (t.nome || 'empresa') + '?\n\n' +
          'Ninguém dela entra mais' + (quantos ? ' — são ' + quantos + ' pessoa' + (quantos > 1 ? 's' : '') : '') + '. ' +
          'Só quem administra continua enxergando, e é quem desbloqueia.\n\n' +
          (minhaEmpresa ? 'Atenção: esta é a SUA empresa. Você continua entrando, porque administra o sistema, mas todo o resto da equipe dela fica de fora.\n\n' : '') +
          'Nenhum registro é apagado.')) return;
      global.IADNuvem.definirBloqueioDaEmpresa(id, estaBloqueada)
        .then(function () { empresasNuvem = null; perfisNuvem = null; pintarUsuariosNuvem(true); })
        .catch(function (e) { alert('Não foi possível: ' + e.message); });
    },

    /* Repergunta ao servidor sem recarregar a página: quem acabou de mexer nos
       segredos da função quer saber agora se resolveu. */
    reverAssistente: function () {
      IA.verificar().then(function () { render(); });
    },

    recarregarUsuariosNuvem: function () { perfisNuvem = null; pintarUsuariosNuvem(true); },

    novaEmpresaNuvem: function () {
      U.formulario('Nova empresa', [
        { id: 'nome', rotulo: 'Nome da empresa' },
        { id: 'cnpj', rotulo: 'CNPJ' }
      ], {}, function (d) {
        if (!d.nome) return;
        global.IADNuvem.criarEmpresa(d.nome, d.cnpj)
          .then(function () { perfisNuvem = null; pintarUsuariosNuvem(true); })
          .catch(function (e) { alert('Não foi possível criar a empresa: ' + e.message); });
      });
    },

    /* Registrar antes de a pessoa existir é o que faz o vínculo ser decidido
       aqui, e não por ela na tela de cadastro. */
    convidarPessoa: function () {
      const empresas = empresasNuvem || [];
      if (!empresas.length) { alert('Crie uma empresa antes de registrar pessoas nela.'); return; }
      U.formulario('Registrar pessoa', [
        { id: 'nome', rotulo: 'Nome da pessoa', tipo: 'text', placeholder: 'como ela aparece na lista' },
        { id: 'email', rotulo: 'E-mail que ela vai usar', tipo: 'email' },
        { id: 'tenantId', rotulo: 'Empresa', tipo: 'select',
          opcoes: empresas.map(function (t) { return { valor: t.id, rotulo: t.nome }; }) },
        { id: 'papel', rotulo: 'Papel', tipo: 'select', opcoes: [
          { valor: 'usuario', rotulo: 'Usuário — vê o que é dele' },
          { valor: 'gestor', rotulo: 'Gestor — vê a empresa inteira' },
          { valor: 'admin', rotulo: 'Administrador — vê todas as empresas' }] }
      ], {}, function (d) {
        const email = (d.email || '').trim();
        if (!email || email.indexOf('@') === -1) { alert('Informe um e-mail válido.'); return; }
        global.IADNuvem.convidar(email, d.tenantId, d.papel, d.nome)
          .then(function () {
            perfisNuvem = null;
            pintarUsuariosNuvem(true);
            const empresa = empresas.find(function (t) { return t.id === d.tenantId; });
            if (U.confirmar('Registrada em ' + ((empresa && empresa.nome) || 'sua empresa') + '.\n\n' +
                'O sistema não envia e-mail — quem envia é você.\n\nAbrir seu e-mail com o convite pronto?')) {
              App.enviarConvite(email.toLowerCase());
            }
          })
          .catch(function (e) { alert('Não foi possível registrar: ' + e.message); });
      });
    },

    /* Envia de verdade, pelo servidor, quando a função de convite estiver
       publicada. Se ela não estiver, cai no caminho antigo — abrir o programa
       de e-mail com a mensagem pronta — em vez de deixar o botão sem efeito.

       Quem manda é o Supabase, e o remetente é o endereço configurado no SMTP
       dele. Ver nuvem/EMAIL.md. */
    enviarConvite: function (email) {
      const N = global.IADNuvem;
      if (!N.conectado()) return App.enviarPeloProgramaDeEmail(email);

      N.chamarFuncao('convite', {
        email: email,
        destino: location.origin + location.pathname
      }).then(function () {
        alert('Convite enviado para ' + email + '.\n\nA pessoa recebe um link para definir a senha dela.');
        render();
      }).catch(function (e) {
        /* Erro sem status quer dizer que a resposta nem chegou ao navegador:
           o gateway do Supabase recusou a chamada antes, e sem cabeçalho de
           CORS não há o que ler. Isso acontece tanto com função que não
           existe quanto com função publicada de Verify JWT ligado — daqui os
           dois são iguais, então a mensagem cita os dois (ver SEM_FUNCAO).

           Nos dois casos o caminho manual continua servindo, que é o que
           importa para quem está com o convite na mão. */
        if (!e.status || e.status === 404) {
          alert('Não consegui falar com o envio automático de e-mail. ' +
            'A função "convite" ' + SEM_FUNCAO + '\n\n' +
            'O passo a passo está em nuvem/EMAIL.md.\n\n' +
            'Abrindo seu programa de e-mail com a mensagem pronta.');
          return App.enviarPeloProgramaDeEmail(email);
        }
        alert('Não consegui enviar: ' + e.message);
      });
    },

    enviarPeloProgramaDeEmail: function (email) {
      const t = textoDoConvite(email);
      const url = 'mailto:' + encodeURIComponent(email) +
        '?subject=' + encodeURIComponent('Seu acesso ao IAD CRM') +
        '&body=' + encodeURIComponent(t);
      location.href = url;
    },

    copiarConvite: function (email) {
      const t = textoDoConvite(email);
      const pronto = function () { alert('Convite copiado. Cole no WhatsApp, no e-mail, onde preferir.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(pronto, function () { U.formulario('Convite', [
          { id: 'texto', rotulo: 'Copie e envie', tipo: 'textarea', padrao: t }], {}, function () {}); });
      } else {
        U.formulario('Convite', [{ id: 'texto', rotulo: 'Copie e envie', tipo: 'textarea', padrao: t }], {}, function () {});
      }
    },

    cancelarConvite: function (email) {
      if (!U.confirmar('Cancelar o registro de ' + email + '?')) return;
      global.IADNuvem.removerConvite(email)
        .then(function () { perfisNuvem = null; pintarUsuariosNuvem(true); })
        .catch(function (e) { alert('Não foi possível cancelar: ' + e.message); });
    },

    filtrarTenant: function (valor) { A.definirFiltros({ tenant: valor, usuario: 'todos' }); render(); },
    filtrarUsuarioAdmin: function (valor) { A.definirFiltros({ usuario: valor }); render(); },

    /* ---------- usuários ---------- */
    /* As três guardas abaixo repetem o que a tela já decide ao desenhar os
       botões. Não é redundância: esconder um botão não impede nada — a função
       continua no window, e o console do navegador chega nela. A tela evita o
       engano; estas linhas evitam a burla. A regra que vale de verdade é a do
       servidor, nas políticas do banco; aqui é o cadastro deste aparelho. */
    novoUsuario: function () {
      if (!A.ehAdmin()) {
        alert('Só quem administra cria acessos. Peça a quem administra o sistema.');
        return;
      }
      U.formulario('Novo usuário', camposUsuario(), {}, function (d) {
        if (!d.nome || !d.email) { alert('Nome e e-mail são obrigatórios.'); return; }
        if (!d.senha || d.senha.length < 6) { alert('Defina uma senha de ao menos 6 caracteres.'); return; }
        A.criarUsuario({
          nome: d.nome, email: d.email, login: d.login || d.email, whatsapp: d.whatsapp,
          tenantId: d.tenantId || Store.tenantDeTrabalho(), papel: d.papel,
          emailConfirmado: true
        }, d.senha).then(render).catch(function (e) { alert(e.message); });
      });
    },

    editarUsuario: function (id) {
      const u = A.usuario(id);
      if (!u) return;
      const eu = A.atual();
      if (!A.ehAdmin() && !(eu && eu.id === id)) {
        alert('Você só edita os seus próprios dados.');
        return;
      }
      U.formulario('Editar usuário', camposUsuario(u).concat([
        { id: 'ativo', rotulo: 'Situação', tipo: 'select', opcoes: [{ valor: 'sim', rotulo: 'Ativo' }, { valor: 'nao', rotulo: 'Inativo' }] }
      ]), Object.assign({}, u, { senha: '', ativo: u.ativo === false ? 'nao' : 'sim' }), function (d) {
        A.salvarUsuario(id, {
          nome: d.nome, email: d.email, login: d.login, whatsapp: d.whatsapp,
          tenantId: d.tenantId || u.tenantId, papel: d.papel, ativo: d.ativo === 'sim'
        }, d.senha || null).then(render).catch(function (e) { alert(e.message); });
      });
    },

    excluirUsuario: function (id) {
      const eu = A.atual();
      if (!A.ehAdmin()) {
        alert('Só quem administra remove acessos. Peça a quem administra o sistema.');
        return;
      }
      if (eu && eu.id === id) {
        alert('Você não pode remover o seu próprio acesso.');
        return;
      }
      if (!U.confirmar('Excluir este acesso deste aparelho?\n\n' +
          'A conta no servidor continua existindo — lá o caminho é bloquear. ' +
          'Os registros criados por ela continuam no sistema.')) return;
      try { A.excluirUsuario(id); render(); }
      catch (e) { alert(e.message); }
    },

    instalar: function () {
      if (!promptInstalacao) {
        alert('Use o menu do navegador: “Instalar aplicativo” (Chrome/Edge) ou Compartilhar → “Adicionar à Tela de Início” (Safari/iPhone).');
        return;
      }
      promptInstalacao.prompt();
      promptInstalacao = null;
    }
  };

  function pendenteAtual() {
    return V.pendenteAcesso ? V.pendenteAcesso() : null;
  }

  function recado(tela, texto, usuario) {
    V.definirTelaAcesso(tela, usuario === undefined ? undefined : usuario, texto);
    render();
  }

  function camposUsuario(u) {
    const admin = A.ehAdmin();
    const empresas = A.tenants();
    const campos = [
      { id: 'nome', rotulo: 'Nome' },
      { id: 'email', rotulo: 'E-mail' },
      { id: 'login', rotulo: 'Login (opcional, o padrão é o e-mail)' },
      { id: 'whatsapp', rotulo: 'WhatsApp' },
      { id: 'senha', rotulo: u ? 'Nova senha (deixe vazio para manter)' : 'Senha', tipo: 'password' }
    ];
    if (admin) {
      campos.push({
        id: 'tenantId', rotulo: 'Empresa', tipo: 'select',
        opcoes: empresas.map(function (t) { return { valor: t.id, rotulo: t.nome }; })
      });
      campos.push({
        id: 'papel', rotulo: 'Papel', tipo: 'select',
        opcoes: [{ valor: 'usuario', rotulo: 'Usuário' }, { valor: 'gestor', rotulo: 'Gestor' },
                 { valor: 'admin', rotulo: 'Administrador' }]
      });
    }
    return campos;
  }

  /* Um lead vira três registros. Sem janela e sem digitação: o que não veio
     do LinkedIn fica em branco para o vendedor completar depois — melhor um
     campo vazio do que um palpite virando fato no painel. */
  function importarUmLead(lead, segmento) {
    const nome = lead.empresa || ('Contato ' + (lead.nome || 'do LinkedIn'));
    if (segmento) Store.criarNoCatalogo('segmentos', { nome: segmento });

    let conta = Store.dados().contas.find(function (c) {
      return lead.empresa && c.nome.toLowerCase().indexOf(lead.empresa.toLowerCase().slice(0, 12)) !== -1;
    });
    if (!conta) {
      conta = Store.criarConta({
        nome: nome, segmento: segmento || '',
        site: lead.empresaSite || '', cidade: lead.empresaCidade || ''
      });
    } else if (segmento && !conta.segmento) {
      conta.segmento = segmento;   /* conta antiga sem segmento ganha o daqui */
    }

    const contato = Store.criarContato({
      contaId: conta.id, nome: lead.nome || 'Contato do LinkedIn', cargo: lead.cargo || '',
      linkedin: lead.linkedin || '', email: lead.email || '', telefone: lead.telefone || '',
      sentimento: lead.resposta ? 'neutro' : 'nao_acessado', canalPreferido: 'LinkedIn'
    });

    /* Quem já respondeu passou da prospecção: dizer que está em Prospecção
       seria etapa mais atrasada que a realidade, e o IAD compara as duas. */
    const op = Store.criarOportunidade({
      contaId: conta.id,
      titulo: (lead.empresa ? lead.empresa : (lead.nome || 'LinkedIn')) + ' — origem LH',
      etapa: lead.resposta ? 'Conexão' : 'Prospecção',
      /* Com várias SDRs mandando prospect, saber de quem veio e de qual
         campanha é o que permite ler o resultado depois, por pessoa e por
         campanha. Fica em campo próprio, não perdido dentro das notas. */
      origem: 'Linked Helper',
      campanha: lead.campanha || '',
      sdr: lead.operador || '',
      sdrEmail: lead.operadorEmail || '',
      notas: 'ORIGEM LH' + (lead.campanha ? ' · campanha: ' + lead.campanha : '') +
        (lead.operador ? ' · prospecção de ' + lead.operador : '') +
        (lead.linkedin ? '\n' + lead.linkedin : '') +
        (lead.headline ? '\n' + lead.headline : '')
    });
    op.stakeholders.push(contato.id);
    Store.salvar();

    if (lead.resposta) {
      Store.registrarEvento(op.id, {
        tipo: 'decision', titulo: lead.resposta.slice(0, 160), dimensao: 'problema',
        forca: 'relato', contatoId: contato.id, canal: 'LinkedIn',
        data: lead.respostaEm || Store.hoje()
      });
    }
    if (lead.insight) {
      Store.definirInsight(op.id, { texto: lead.insight, estado: 'formulado' });
    }
    atribuirAoOperador(lead, [conta, contato, op]);
    return op;
  }

  /* O lead pertence a quem prospectou, não a quem clicou em importar. Só
     funciona quando o operador do Linked Helper também é usuário do IAD —
     senão o registro fica com quem importou, que é o comportamento normal. */
  function atribuirAoOperador(lead, registros) {
    if (!lead.operadorEmail) return;
    const dono = A.porLogin(lead.operadorEmail);
    if (!dono) return;
    registros.forEach(function (r) { if (r) r.donoId = dono.id; });
    Store.salvar();
  }

  /* A IA devolve o nome de quem falou; a base trabalha com id. Casa pelo
     primeiro nome, que é como as pessoas aparecem numa transcrição. */
  function contatoPeloNome(contaId, nome) {
    if (!nome || !contaId) return null;
    const primeiro = String(nome).trim().toLowerCase().split(/\s+/)[0];
    if (primeiro.length < 3) return null;
    const achado = Store.contatosDaConta(contaId).filter(function (c) {
      return String(c.nome || '').toLowerCase().indexOf(primeiro) !== -1;
    })[0];
    return achado ? achado.id : null;
  }

  /* O material do rascunho de insight: o que o cliente já disse sobre o
     problema e o impacto. Sem isso o assistente escreveria genérico. */
  function baseDoInsight(op) {
    const conta = Store.conta(op.contaId);
    const partes = [];
    if (conta) {
      partes.push('Empresa: ' + conta.nome + (conta.segmento ? ' (' + conta.segmento + ')' : '') +
        (conta.porte ? ', porte: ' + conta.porte : '') + '.');
    }
    ['problema', 'impacto', 'prioridade'].forEach(function (dim) {
      E.evidenciasDaDimensao(op, dim).slice(-3).forEach(function (ev) {
        partes.push('O cliente: ' + ev.titulo);
      });
    });
    return partes.join('\n');
  }

  /* O método na hora de fazer a tarefa, e não numa tela que ninguém abre.

     A pergunta da decisão, o que conta como evidência dela e o que fazer no
     canal escolhido — os três mudam junto com os dois selects logo acima.
     Escrever a teoria só no Playbook é escrever para quem já sabe: quem
     precisa dela está aqui, criando a tarefa, decidindo o que vai falar. */
  function ligarPainelDeMetodo(dlg) {
    const caixa = dlg.querySelector('[data-metodo]');
    const alvo = dlg.querySelector('[name="decisaoAlvo"]');
    const canal = dlg.querySelector('[name="tipo"]');
    if (!caixa || !alvo) return;

    /* Os canais do playbook são quatro; os tipos de tarefa são nove e o
       usuário cria os dele. O de-para leva cada tipo ao conselho mais
       próximo, e o que não tem correspondência cai no de e-mail, que é o
       mais genérico dos quatro. */
    const PARA_CANAL = {
      'WhatsApp': 'whatsapp', 'Telefonema': 'whatsapp', 'Reunião': 'whatsapp', 'Visita': 'whatsapp',
      'E-mail': 'email', 'Proposta': 'email', 'Apresentação': 'email',
      'LinkedIn': 'linkedin', 'Preparação': 'linkedin', 'Cobrar retorno': 'whatsapp'
    };

    const pintar = function () {
      const d = P.DIMENSOES.filter(function (x) { return x.id === alvo.value; })[0];
      if (!d) { caixa.innerHTML = ''; return; }
      const tipo = canal ? canal.value : '';
      const chave = PARA_CANAL[tipo] || 'email';
      const nomeCanal = (P.CANAIS.filter(function (c) { return c.id === chave; })[0] || {}).nome || '';
      caixa.innerHTML = '<div class="metodo-tarefa">' +
        '<span class="rotulo">Como esta tarefa faz ' + U.esc(d.nome) + ' andar</span>' +
        '<p class="pergunta">' + U.esc(d.pergunta) + '</p>' +
        (tipo ? '<p class="conselho"><strong>' + U.esc(tipo) + '</strong> — ' +
          U.esc(d.canais[chave]) + ' <em>(cadência de ' + U.esc(nomeCanal) + ')</em></p>' : '') +
        '<p class="conta"><strong>Conta como evidência:</strong> ' +
        U.esc(d.evidencias.slice(0, 3).join(' · ')) + '</p>' +
        '<p class="tiny muted">Para a nota 2 a evidência precisa ser confirmada ou documentada. ' +
        'O que nós fizemos — apresentar, propor, cobrar — não conta.</p>' +
        '</div>';
    };

    alvo.addEventListener('change', pintar);
    if (canal) canal.addEventListener('change', pintar);
    pintar();
  }

  /* O fecho de uma tarefa, venha ele do formulário de criar ou do de concluir.

     Tudo aqui é aditivo, e é essa a diferença: antes o vendedor tinha de
     escolher UM modo de contar — ata, ou perguntas, ou evidência — e quem
     tinha a ata E queria responder as perguntas não podia. Agora ele preenche
     o que tem, e o que estiver preenchido conta.

     O texto que vai para a IA é o que ele digitou MAIS o conteúdo dos
     documentos que anexou: a caixa de documentos escreve o texto de cada
     arquivo dentro do campo de relato, anunciado pelo nome do arquivo, e é
     esse conjunto que o assistente lê. São os documentos que trazem a
     informação — proposta, dossiê, planilha de consumo —, e ler só o que foi
     digitado seria jogar fora justamente a parte mais rica. */
  function concluirComOQueAconteceu(op, tarefaId, d, docs, dimensaoAlvo) {
    const quando = d.feitaEm || Store.hoje();
    const temRelato = !!(d.relato && d.relato.length >= 60);

    Store.concluirTarefa(tarefaId, quando, temRelato);

    /* As perguntas entram antes da leitura da ata: assim a releitura das oito
       — que acontece no fim — já enxerga as evidências que elas produziram. */
    const respondidas = gravarPerguntasDoFim(op, d, quando);
    registrarFechamento(op, d, temRelato ? null : docs);

    const depois = function () {
      if (d.evidenciaDireta === 'sim') {
        App.novaEvidencia(op.id, null, dimensaoAlvo, { canal: d.tipo, data: quando });
      }
    };

    if (temRelato) {
      /* processarReuniao anexa os documentos, aplica as evidências e relê as
         oito. A evidência direta espera o fim disso para não abrir por cima. */
      App.processarReuniao(op.id, d.relato, true, docs, depois);
      return;
    }
    if (d.relato) {
      alert('Texto curto demais para eu separar evidências. A tarefa, os documentos e o resto foram gravados.');
    }
    render();
    if (respondidas) { relerAsOito(op.id, '', { evidencias: respondidas }, depois); return; }
    depois();
  }

  /* As quatro perguntas fechadas do fim de reunião. Cada "sim" vira evidência
     do cliente na dimensão da pergunta — sem digitação, que é o ponto: quem
     acabou a visita responde quatro selects, não escreve uma ata.

     A nota não sobe aqui de propósito. Evidência é o que aconteceu; nota é
     quanto a decisão amadureceu, e continua sendo escolha de quem esteve lá. */
  function gravarPerguntasDoFim(op, d, quando) {
    let n = 0;
    P.FECHAMENTO_REUNIAO.forEach(function (q) {
      if (d['q_' + q.id] !== 'sim') return;
      Store.registrarEvento(op.id, {
        tipo: 'decision', titulo: q.evidencia, dimensao: q.id,
        forca: q.forca, canal: d.tipo || 'Reunião', data: quando || Store.hoje()
      });
      n++;
    });
    return n;
  }

  /* Com evidência nova gravada, as oito são relidas sobre o retrato
     atualizado. Vale para a ata e vale para as quatro perguntas: sem isto, o
     caminho sem digitação gravava a evidência e deixava o índice parado —
     e quem respondeu "sim, entrou alguém novo" vai olhar o mapa esperando
     ver Stakeholders andar. */
  function relerAsOito(opId, textoExtra, jaFeito, depois) {
    const base = jaFeito || {};
    const atual = Store.oportunidade(opId);
    if (!IA.disponivel() || !atual) {
      if (base.evidencias || base.pessoas) mostrarResumo(opId, base, [], [], depois);
      else if (depois) depois();
      return;
    }
    IA.sugerirNotas(atual, E.resumo(atual), textoExtra || '').then(function (resp) {
      const decisoes = (resp && resp.decisoes) || [];
      const mudancas = aplicarNotasDaIA(opId, decisoes);
      render();
      /* Falhar na releitura não apaga o que já entrou: as evidências e o que
         mudou no negócio estão gravados, e é isso que o resumo mostra — com o
         motivo da releitura não ter acontecido. */
      mostrarResumo(opId, base, mudancas, decisoes, depois,
        (resp && resp.erro) ? resp.erro : '');
    });
  }

  /* O que o material disse sobre o NEGÓCIO: valor, etapa, previsão,
     concorrentes. Uma proposta anexada tem o preço lá dentro — deixar o
     vendedor redigitar isso é pedir que o pipeline do dono da empresa fique
     desatualizado, que era exatamente o caso.

     Duas travas, o mesmo espírito das notas:

     · a etapa só AVANÇA. Uma ata que menciona a proposta enviada não pode
       jogar de volta para Prospecção um negócio que já está em Validação;
     · nada entra sem o trecho literal que sustenta — o servidor já descarta
       valor e etapa sem citação.

     E avançar para Proposta NÃO é passar por cima do Proposal Gate: o gate
     continua gritando "0% de prontidão" no cockpit, que é o sinal útil. Ele
     existe para dizer que a proposta foi precoce, não para impedir o app de
     registrar que ela existe. */
  function aplicarNegocioDaIA(opId, negocio) {
    const n = negocio || {};
    const op = Store.oportunidade(opId);
    if (!op) return [];
    const mudancas = [];
    const alteracoes = {};

    if (n.valor > 0 && n.valor !== op.valor) {
      alteracoes.valor = n.valor;
      mudancas.push({ campo: 'Valor', de: U.moeda(op.valor || 0), para: U.moeda(n.valor),
        trecho: n.valorFrase || '' });
    }

    if (n.etapa && n.etapa !== op.etapa) {
      const ordem = P.ETAPAS.indexOf(n.etapa);
      const atual = P.ETAPAS.indexOf(op.etapa);
      if (ordem > atual) {
        alteracoes.etapa = n.etapa;
        mudancas.push({ campo: 'Etapa no CRM', de: op.etapa, para: n.etapa,
          trecho: n.etapaFrase || '' });
      }
    }

    if (n.previsao && n.previsao !== op.fechamentoPrevisto) {
      alteracoes.fechamentoPrevisto = n.previsao;
      mudancas.push({ campo: 'Fechamento previsto',
        de: op.fechamentoPrevisto ? U.data(op.fechamentoPrevisto) : 'sem data',
        para: U.data(n.previsao), trecho: '' });
    }

    /* Concorrente novo soma ao que já estava: quem apareceu antes não some. */
    if (n.concorrentes) {
      const tem = String(op.concorrentes || '').toLowerCase();
      const novos = String(n.concorrentes).split(/[,;]/).map(function (x) { return x.trim(); })
        .filter(function (x) { return x && tem.indexOf(x.toLowerCase()) === -1; });
      if (novos.length) {
        alteracoes.concorrentes = [op.concorrentes, novos.join(', ')].filter(Boolean).join(', ');
        mudancas.push({ campo: 'Concorrentes', de: op.concorrentes || 'nenhum',
          para: alteracoes.concorrentes, trecho: '' });
      }
    }

    if (Object.keys(alteracoes).length) Store.atualizarOportunidade(opId, alteracoes);
    return mudancas;
  }

  /* Aplica as notas propostas. Duas travas, e as duas são do motor, não da
     tela: nota 2 sem evidência confirmada ou documentada cai para 1; e nota
     nunca desce sozinha — a IA relê o mesmo retrato a cada tarefa e propor 0
     para uma decisão que alguém pontuou à mão apagaria esse trabalho sem
     ninguém ver. Devolve o que mudou, para o relatório. */
  function aplicarNotasDaIA(opId, decisoes) {
    const mudancas = [];
    (decisoes || []).forEach(function (proposta) {
      const d = P.DIMENSOES.filter(function (x) { return x.id === proposta.dimensao; })[0];
      if (!d) return;
      const alvo = Store.oportunidade(opId);
      const atual = alvo.dims[d.id] || 0;
      const pedida = Number(proposta.nota);
      if (!(pedida >= 0 && pedida <= 2)) return;

      const travada = (pedida === 2 && !E.podeComprovar(alvo, d.id));
      const permitida = travada ? Math.max(1, atual) : pedida;
      if (permitida <= atual) return;                        /* só sobe */

      Store.pontuar(opId, d.id, permitida, 'Lido pelo assistente na conclusão da tarefa');
      mudancas.push({ nome: d.nome, de: atual, para: permitida,
        travada: travada, porque: proposta.porque || '', trecho: proposta.trecho || '' });
    });
    return mudancas;
  }

  /* O relatório do que entrou. Não é uma tela de conferência: não há nada
     para marcar. Fica a porta de ajuste, para quem discordar. */
  function mostrarResumo(opId, base, mudancas, decisoes, depois, erroDaReleitura) {
    const op = Store.oportunidade(opId);
    const mexeuNoNegocio = (base.negocio || []).length;
    if (!op || (!base.evidencias && !base.pessoas && !mudancas.length && !mexeuNoNegocio && !erroDaReleitura)) {
      if (depois) depois();
      return;
    }
    const dlg = document.createElement('dialog');
    dlg.className = 'revisao-ia';
    dlg.innerHTML = V.resumoDaLeitura(op, base, mudancas, erroDaReleitura);
    document.body.appendChild(dlg);
    dlg.addEventListener('close', function () {
      const escolha = dlg.returnValue;
      dlg.remove();
      /* Quando a releitura falhou não há proposta nenhuma para ajustar: abrir
         a tela das oito ali mostrava "0 → 0" nas oito e "Gravar as notas" não
         gravava nada — um beco sem saída que parecia defeito. O botão passa a
         ser "Tentar de novo", que é o que a pessoa quer. */
      if (escolha === 'tentar') { relerAsOito(opId, '', {}, depois); return; }
      /* Discordar é a única coisa que ainda pede um clique — e é a tela que
         já existia, com as oito e o motivo de cada uma. */
      if (escolha === 'ajustar') { App.revisarNotas(opId, decisoes || []); return; }
      if (depois) depois();
    });
    dlg.showModal();
  }

  /* O que a pessoa acabou de informar ao fechar uma tarefa — o compromisso e
     os documentos — não depende da IA e grava primeiro. Se o assistente
     estiver fora do ar, ou o texto for curto demais, isto já está salvo. */
  function registrarFechamento(op, d, docs) {
    if (d.compromissoData) {
      Store.registrarEvento(op.id, {
        tipo: 'activity', titulo: 'Próximo passo combinado', canal: 'Reunião',
        data: d.feitaEm || Store.hoje(),
        compromisso: {
          texto: d.compromissoTexto || 'Próximo passo combinado',
          data: d.compromissoData, dono: d.compromissoDono || 'cliente'
        }
      });
    }
    anexarAoRegistro(docs, { oportunidadeId: op.id, contaId: op.contaId,
      categoria: 'Ata de reunião' });
  }

  /* O que foi carregado para a IA ler fica anexado ao registro. É o que o
     vendedor espera: ele carregou a proposta uma vez, ela tem de continuar
     ali. Falhar aqui não desfaz o cadastro — o registro já está salvo, e
     perder o anexo é menos grave do que perder a empresa. */
  function anexarAoRegistro(docs, alvo) {
    if (!docs || !docs.length || !Arq.disponivel()) return;
    docs.forEach(function (d) {
      if (!d.arquivo) return;
      Arq.salvar(d.arquivo, alvo).catch(function () {});
    });
  }

  /* As pessoas que o vendedor marcou na caixa do assistente viram contatos da
     conta. Nascem com papel e influência neutros de propósito: quem decide se
     alguém é o econômico ou o técnico é quem conversou com a pessoa, e chutar
     isso encheria a cobertura do grupo comprador de certeza falsa — que é
     justamente o que este CRM existe para não fazer.

     Repetido não entra: o mesmo dossiê analisado duas vezes não pode duplicar
     a Aline. */
  function criarContatosPropostos(contaId, pessoas) {
    if (!contaId || !pessoas || !pessoas.length) return 0;
    const chave = function (t) {
      return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    };
    const existentes = Store.contatosDaConta(contaId).map(function (c) { return chave(c.nome); });
    let n = 0;
    pessoas.forEach(function (p) {
      if (!p || !p.nome || existentes.indexOf(chave(p.nome)) !== -1) return;
      Store.criarContato({
        contaId: contaId,
        nome: p.nome,
        cargo: p.cargo || p.area || '',
        email: p.email || '',
        telefone: p.telefone || ''
      });
      existentes.push(chave(p.nome));
      n++;
    });
    return n;
  }

  const NOVA_CONTA = '__nova_empresa__';

  /* Depois de a IA ler o material, a empresa que ela achou já existe ou não.
     Existindo, escolhemos — o vendedor não precisa procurar num select o nome
     que ele acabou de ver na tela. Não existindo, oferecemos cadastrar junto,
     com a ficha que ela montou. É o gesto único que o vendedor pediu: um
     documento vira negócio, empresa e pessoas de uma vez.

     Oferecemos, não fazemos: a empresa só nasce se a caixa ficar marcada. */
  function resolverEmpresaDaIA(dlg, r, contas) {
    const caixa = dlg.querySelector('[data-empresa-ia]');
    if (!caixa) return;
    const ficha = r.empresa || {};
    const nome = String(ficha.nome || (r.campos && r.campos.empresaNova) || '').trim();
    dlg.empresaNovaIA = null;
    if (!nome) { caixa.innerHTML = ''; return; }

    const chave = function (t) {
      return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]/g, '');
    };
    const alvo = chave(nome);
    const achada = contas.find(function (c) {
      const k = chave(c.nome);
      return k === alvo || (k.length >= 4 && alvo.length >= 4 && (k.indexOf(alvo) === 0 || alvo.indexOf(k) === 0));
    });

    const sel = dlg.querySelector('[name="contaId"]');
    if (achada) {
      if (sel) sel.value = achada.id;
      caixa.innerHTML = '<p class="achou-empresa">Empresa reconhecida: <strong>' +
        U.esc(achada.nome) + '</strong> — já cadastrada, e já escolhida acima.</p>';
      return;
    }

    dlg.empresaNovaIA = Object.assign({}, ficha, { nome: nome });

    /* O select TEM de sair de cima da empresa que estava escolhida. Ele nasce
       na primeira da lista, e sem esta linha a tela dizia "Supermercados Mambo
       ainda não está cadastrada" logo acima de um campo Empresa mostrando
       "Marilan – Marília" — e o negócio nascia na Marilan. Duas afirmações
       contraditórias na mesma tela, e a errada era a que valia. */
    if (sel) sel.value = NOVA_CONTA;

    const detalhe = [ficha.cidade, ficha.uf, ficha.cnpj, ficha.segmento].filter(Boolean).join(' · ');
    caixa.innerHTML = '<label class="empresa-nova-ia">' +
      '<input type="checkbox" checked data-cria-empresa>' +
      '<span><strong>' + U.esc(nome) + '</strong> ainda não está cadastrada — cadastrar junto com o negócio.' +
      (detalhe ? '<em>' + U.esc(detalhe) + '</em>' : '') + '</span></label>';
    const marca = caixa.querySelector('[data-cria-empresa]');
    marca.addEventListener('change', function () {
      dlg.empresaNovaIA = marca.checked ? Object.assign({}, ficha, { nome: nome }) : null;
    });
  }

  /* O que já está digitado, para reabrir o formulário sem perder nada. Lê o
     que está na tela, não o que foi passado ao abrir: a pessoa pode ter
     mudado tudo antes de perceber que faltava a empresa. */
  function valoresDoFormulario(dlg, campos) {
    const v = {};
    campos.forEach(function (c) {
      if (!c.id || c.tipo === 'ia') return;
      const el = dlg.querySelector('[name="' + c.id + '"]');
      if (el && el.value && el.value !== NOVA_CONTA) v[c.id] = el.value;
    });
    return v;
  }

  function podeMexerEmProduto() {
    if (A.ehGestor()) return true;
    alert('Produtos são do catálogo da empresa — só o gestor cadastra e edita.\n\n' +
      'Contas, contatos e oportunidades você cria normalmente.');
    return false;
  }

  /* ---------- campos reutilizados ---------- */
  function camposProduto() {
    return [
      { id: 'nome', rotulo: 'Produto' },
      { id: 'sku', rotulo: 'Código / SKU' },
      { id: 'categoria', rotulo: 'Categoria' },
      { id: 'unidade', rotulo: 'Unidade', placeholder: 'un, kg, t, hora, mês' },
      { id: 'precoReferencia', rotulo: 'Preço de referência (R$)', tipo: 'moeda' },
      { id: 'descricao', rotulo: 'Descrição', tipo: 'textarea' }
    ];
  }

  /* A conta nasce carimbada com a empresa de quem está trabalhando e com o
     dono — isso o Store já fazia. O que faltava era estar escrito na tela:
     num sistema multiempresa, cadastrar sem saber em qual empresa a coisa vai
     cair é como assinar sem ler. */
  function ondeVaiCair() {
    const N = global.IADNuvem;
    const perfil = N.estado().perfil || {};
    const eu = A.atual() || {};
    const empresa = (perfil.tenants && perfil.tenants.nome) ||
      (Store.tenant && Store.tenant(eu.tenantId) && Store.tenant(eu.tenantId).nome) || '';
    const quem = perfil.nome || eu.nome || '';
    if (!empresa && !quem) return null;
    return { tipo: 'aviso',
      rotulo: 'Vai para ' + (empresa || 'a sua empresa') +
        (quem ? ', no nome de ' + quem : '') + '.' };
  }

  function camposConta() {
    const segmentos = Store.nomesDoCatalogo('segmentos');
    const campos = [
      { id: 'atalhoConta', tipo: 'ia', extrair: 'conta',
        rotulo: 'Cole, dite ou carregue o que você já sabe da empresa',
        placeholder: 'Cole aqui um e-mail, um trecho do site, o perfil do LinkedIn — ou carregue a proposta, a planilha de consumo, o edital. A IA lê tudo junto.',
        /* Prospect, cliente ou ex-cliente é fato comercial nosso — não sai de texto. */
        nunca: ['relacaoAtual'],
        contexto: function () { return IA.contextoDaConta(null); } }
    ];

    const onde = ondeVaiCair();
    if (onde) campos.push(onde);

    return campos.concat([
      { tipo: 'secao', rotulo: 'Identificação' },
      { id: 'nome', rotulo: 'Empresa (nome fantasia)' },
      { id: 'razaoSocial', rotulo: 'Razão social', largura: 'metade' },
      { id: 'cnpj', rotulo: 'CNPJ', largura: 'metade' },

      /* A IA escolhe o segmento de uma lista fechada — a desta empresa. Ela não
         inventa "Alimentos" se "Alimentos" não estiver cadastrado, e é por isso
         que o campo fica vazio em sistema recém-instalado: não há de onde
         escolher. Dizer isso vale mais que explicar a arquitetura. */
      { tipo: 'secao', rotulo: 'Classificação',
        ajuda: segmentos.length
          ? 'A IA escolhe entre os ' + segmentos.length + ' segmentos da sua empresa.'
          : 'Sua empresa ainda não tem segmentos cadastrados — por isso a IA não preenche este campo. Cadastre em Cadastros → Segmentos.' },
      { id: 'segmento', rotulo: 'Segmento', tipo: 'select', largura: 'metade',
        opcoes: [{ valor: '', rotulo: '— sem segmento —' }]
          .concat(segmentos.map(function (n) { return { valor: n, rotulo: n }; })) },
      { id: 'relacaoAtual', rotulo: 'Relação atual', tipo: 'select', largura: 'metade',
        opcoes: P.RELACOES_CONTA },
      /* Setor saiu da ficha: repetia o segmento aos olhos de quem preenche, e
         campo que parece repetido é campo que fica vazio. O setor que o Linked
         Helper traz continua sendo usado — como sinal para a IA escolher o
         segmento, que é onde ele de fato serve, e não como mais uma caixa. */
      { id: 'porte', rotulo: 'Porte (faturamento ou funcionários)', largura: 'metade' },

      { tipo: 'secao', rotulo: 'Onde fica e como falar' },
      { id: 'cidade', rotulo: 'Cidade', largura: 'metade' },
      { id: 'uf', rotulo: 'UF', largura: 'metade' },
      { id: 'pais', rotulo: 'País', largura: 'metade', placeholder: 'Brasil' },
      { id: 'telefone', rotulo: 'Telefone', largura: 'metade' },
      { id: 'site', rotulo: 'Site', largura: 'metade' },
      { id: 'linkedin', rotulo: 'LinkedIn da empresa', largura: 'metade',
        placeholder: 'linkedin.com/company/...' },

      { tipo: 'secao', rotulo: 'O que ela faz e do que precisa',
        ajuda: 'A descrição é de onde a IA tira o segmento. As necessidades são o que você lê antes de ligar.' },
      { id: 'descricao', rotulo: 'Descrição', tipo: 'textarea',
        placeholder: 'O que a empresa produz, para quem vende, onde opera.' },
      { id: 'necessidades', rotulo: 'Necessidades e dores', tipo: 'textarea',
        placeholder: 'O gargalo, a exigência, o prazo — com os números que aparecerem.' }
    ]);
  }

  function camposContato(contaId, exceto) {
    const colegas = (contaId ? Store.contatosDaConta(contaId) : [])
      .filter(function (c) { return c.id !== exceto; });
    return [
      { id: 'atalhoContato', tipo: 'ia', extrair: 'contato',
        rotulo: 'Cole a assinatura do e-mail, o perfil do LinkedIn ou descreva a pessoa',
        placeholder: 'Ex.: Marcelo Prates — Diretor Financeiro, Agro Verde. marcelo.prates@agroverde.com.br, (15) 99812-3344. Foi quem pediu o payback.',
        contexto: function () { return IA.contextoDaConta(contaId); } },
      { id: 'nome', rotulo: 'Nome' },
      { id: 'cargo', rotulo: 'Cargo' },
      { id: 'papel', rotulo: 'Papel na compra', tipo: 'select', opcoes: P.PAPEIS },
      { id: 'sentimento', rotulo: 'Posição', tipo: 'select', opcoes: [
        { valor: 'nao_acessado', rotulo: 'Não acessado' }, { valor: 'neutro', rotulo: 'Neutro' },
        { valor: 'favoravel', rotulo: 'Favorável' }, { valor: 'resistente', rotulo: 'Resistente' }] },
      { id: 'perfil', rotulo: 'Perfil (Challenger)', tipo: 'select',
        opcoes: P.PERFIS.map(function (x) {
          const grupo = x.grupo === 'indefinido' ? '' : ' — ' + x.grupo;
          return { valor: x.id, rotulo: x.rotulo + grupo };
        }) },
      { id: 'influencia', rotulo: 'Influência na decisão', tipo: 'select', padrao: '2', opcoes: [
        { valor: '1', rotulo: '1 — opina' }, { valor: '2', rotulo: '2 — influencia' }, { valor: '3', rotulo: '3 — decide' }] },
      { id: 'reportaA', rotulo: 'Reporta a', tipo: 'select', opcoes: [{ valor: '', rotulo: '— não informado —' }]
        .concat(colegas.map(function (c) { return { valor: c.id, rotulo: c.nome + ' (' + c.papel + ')' }; })) },
      { id: 'email', rotulo: 'E-mail' },
      { id: 'telefone', rotulo: 'Telefone / WhatsApp' },
      { id: 'linkedin', rotulo: 'LinkedIn' }
    ];
  }

  function camposOportunidade(contas, contaPadrao) {
    return [
      { id: 'atalhoOp', tipo: 'ia', extrair: 'oportunidade',
        rotulo: 'Cole, dite ou carregue o que você tem sobre este negócio',
        placeholder: 'Ata da reunião, proposta, e-mail, planilha de consumo — a IA lê tudo e monta o negócio, a empresa e as pessoas de uma vez.',
        /* Valor, etapa e fechamento previsto são o pipeline e o diagnóstico.
           Se a IA mexer na etapa, ela apaga o alerta de "falso avançado". */
        nunca: ['valor', 'etapa', 'fechamentoPrevisto'],
        contexto: function () { return IA.contextoDaConta(contaPadrao); },
        aoAplicar: function (dlg, r) { resolverEmpresaDaIA(dlg, r, contas); } },
      { id: 'titulo', rotulo: 'Título' },
      { tipo: 'slot', slot: 'empresa-ia' },
      /* A opção de cadastrar vem sempre, e primeiro quando não há nenhuma:
         é a única coisa útil a fazer ali naquele momento. */
      { id: 'contaId', rotulo: 'Empresa', tipo: 'select',
        padrao: contaPadrao || (contas[0] && contas[0].id) || '',
        opcoes: (contas.length ? [] : [{ valor: '', rotulo: '— nenhuma empresa cadastrada ainda —' }])
          .concat(contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; }))
          .concat([{ valor: NOVA_CONTA, rotulo: '+ Cadastrar nova empresa…' }]) },
      { id: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda' },
      { id: 'etapa', rotulo: 'Etapa CRM', tipo: 'select', opcoes: P.ETAPAS },
      { id: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: P.TIPOS_OPORTUNIDADE },
      { id: 'fechamentoPrevisto', rotulo: 'Fechamento previsto', tipo: 'date' },
      { id: 'concorrentes', rotulo: 'Concorrentes (inclusive “não fazer nada”)' }
    ];
  }

  function baixar(conteudo, nome, mime) {
    const blob = new Blob([conteudo], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  global.App = App;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    promptInstalacao = e;
  });

  window.addEventListener('hashchange', render);

  document.addEventListener('DOMContentLoaded', function () {
    Store.carregar();
    global.IADAjuda.ligar();
    montarNav();

    /* Antes de tudo: quem chega pelo link do e-mail já vem autenticado, e
       precisa ser reconhecido antes que a tela de login apareça. Só depois
       disso é que vale ler o perfil no servidor — a leitura depende da sessão
       que a linha de cima acabou de criar. */
    let chegouPeloLink = '';
    adotarCredencialDoEndereco().then(function (nome) {
      chegouPeloLink = nome;
      /* Esperar o perfil evita o pisca-pisca: sem isso a tela de login apareceria
         por um instante para alguém que acabou de entrar. */
      return atualizarPerfilDaNuvem();
    }).then(function () {
      return A.garantirAdministrador();
    }).then(function (adm) {
      render();
      if (chegouPeloLink) pedirSenhaNova(chegouPeloLink.trim());
      /* A senha sorteada aparece uma vez, aqui, porque não existe em lugar
         nenhum além deste aparelho: se ninguém anotar, ninguém entra. */
      if (adm && adm.senhaInicial) {
        alert('Este aparelho ainda não tinha administrador, então criei um.\n\n' +
          'Login: Adm\nSenha: ' + adm.senhaInicial + '\n\n' +
          'Anote agora — esta senha não aparece de novo. Troque-a no primeiro acesso.');
      }
    }).catch(function (e) {
      console.warn('Falha ao preparar o administrador:', e);
      render();
    });
    /* O app guarda o próprio código para funcionar offline, e é isso que faz uma
       versão nova demorar a aparecer: o primeiro recarregamento só instala a
       versão nova; quem usa o código novo é o carregamento seguinte. Duas vezes
       Ctrl+F5 não é instrução que se dê a um vendedor — então, quando a versão
       nova assume, a página se recarrega sozinha, uma vez. */
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      const jaControlado = !!navigator.serviceWorker.controller;
      let recarregando = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!jaControlado || recarregando) return;   /* na primeira visita não há o que trocar */
        recarregando = true;
        location.reload();
      });
      navigator.serviceWorker.register('sw.js')
        .then(function (registro) { registro.update(); })
        .catch(function (e) { console.warn('SW não registrado:', e); });
    }
  });
})(window);
