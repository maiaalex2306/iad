/* Nuvem: Supabase como banco compartilhado, sem biblioteca.

   Estratégia deliberada: o app continua trabalhando com a cópia local, que é
   síncrona e funciona offline; a nuvem entra como sincronização — puxa ao entrar
   e empurra ao salvar. Isso mantém todo o resto do código como está, e o app
   continua abrindo sem internet, com o que foi sincronizado por último.

   O isolamento por empresa não depende deste arquivo: está nas políticas RLS do
   banco (nuvem/schema.sql). Aqui só mandamos o pedido; quem recusa é o Postgres. */
(function (global) {
  'use strict';

  const Store = global.IADStore;
  const CHAVE_CONFIG = 'iad-crm:nuvem:v1';
  const CHAVE_SESSAO = 'iad-crm:nuvem-sessao:v1';

  /* ---------- configuração ---------- */
  /* O que foi configurado neste navegador vence; o resto vem de src/config.js,
     para que quem abre o app pela primeira vez já ache o servidor. */
  function padrao() {
    const c = (global.IADConfig && global.IADConfig.supabase) || {};
    return { url: String(c.url || '').replace(/\/+$/, ''), chave: String(c.chave || '') };
  }

  /* O que está salvo no navegador vence o que veio no código — é o que permite
     apontar este app a outro projeto Supabase sem publicar nada.

     Com uma exceção: chave antiga (JWT) salva para o MESMO projeto que o código
     aponta perde para a do código. O Supabase trocou o formato, e quem tinha
     colado a antiga à mão ficaria preso a ela para sempre, com o app inteiro
     funcionando menos as Edge Functions — sem nada na tela ligando uma coisa à
     outra. A exceção é estreita de propósito: url diferente é outro projeto, e
     aí a escolha de quem configurou continua valendo. */
  function config() {
    const base = padrao();
    let salvo = null;
    try { salvo = JSON.parse(localStorage.getItem(CHAVE_CONFIG)); } catch (e) { salvo = null; }
    if (!salvo) return base;

    const url = salvo.url || base.url;
    let chave = salvo.chave || base.chave;
    const antiga = /^ey[A-Za-z0-9_-]*\./.test(chave);
    const codigoTemNova = /^sb_publishable_/.test(base.chave);
    if (antiga && codigoTemNova && url === base.url) chave = base.chave;

    return { url: url, chave: chave };
  }

  function salvarConfig(nova) {
    const url = String(nova.url || '').trim().replace(/\/+$/, '');
    localStorage.setItem(CHAVE_CONFIG, JSON.stringify({ url: url, chave: String(nova.chave || '').trim() }));
  }

  function configurada() { return !!(config().url && config().chave); }

  function sessao() {
    try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO)) || null; }
    catch (e) { return null; }
  }

  /* Guardamos QUANDO o token morre, e não quanto falta.

     O GoTrue manda `expires_in` — segundos a partir de agora — e `expires_in`
     só vale no instante em que a resposta chegou. É exatamente a aba que
     ficou três horas parada que precisa desta conta, e ali "3600" não diz
     nada. A data absoluta diz. */
  function guardarSessao(s) {
    if (s) {
      if (!s.expires_at && s.expires_in) {
        s.expires_at = Math.floor(Date.now() / 1000) + Number(s.expires_in);
      }
      localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
    } else localStorage.removeItem(CHAVE_SESSAO);
  }

  /* Um minuto de folga. Renovar o token que morre em trinta segundos evita a
     falha aparecer na tela; renovar a cada chamada seria pedir credencial
     nova o dia inteiro. Sem `expires_at` — sessão guardada por uma versão
     antiga — devolve false e o caminho do 401 continua valendo. */
  const FOLGA_DO_TOKEN = 60;

  function precisaRenovar() {
    const s = sessao();
    if (!s || !s.refresh_token || !s.expires_at) return false;
    return Number(s.expires_at) - FOLGA_DO_TOKEN <= Math.floor(Date.now() / 1000);
  }

  function conectado() { return !!(configurada() && sessao() && sessao().access_token); }

  /* Com a nuvem configurada, é ela quem manda no login: contas de verdade,
     e-mail de verdade. Sem ela, o app segue no modo local. */
  function mandaNoAcesso() { return configurada(); }

  /* ---------- chamadas ---------- */
  function cabecalhos(comAutenticacao) {
    const c = config();
    const h = { 'apikey': c.chave, 'content-type': 'application/json' };
    const s = sessao();
    h.Authorization = 'Bearer ' + ((comAutenticacao !== false && s && s.access_token) ? s.access_token : c.chave);
    return h;
  }

  /* O token do Supabase vive cerca de uma hora. Sem isto, o app funcionaria
     bem e começaria a falhar sozinho no meio do expediente, com uma mensagem
     que não diz nada ao vendedor. Numa recusa por token vencido, renovamos e
     repetimos a chamada uma vez — só uma, para um refresh inválido não virar
     laço infinito. */
  function chamar(caminho, opcoes) {
    return tentar(caminho, opcoes, true);
  }

  function tentar(caminho, opcoes, podeRenovar) {
    const c = config();
    if (!c.url) return Promise.reject(new Error('Configure o endereço do Supabase em Configuração → Nuvem.'));
    const o = opcoes || {};
    return fetch(c.url + caminho, {
      method: o.metodo || 'GET',
      headers: Object.assign(cabecalhos(o.autenticado), o.cabecalhos || {}),
      body: o.corpo ? JSON.stringify(o.corpo) : undefined
    }).catch(function () {
      /* "Failed to fetch" não ajuda ninguém: quase sempre é endereço errado ou sem internet.

         O erro sai SEM status de propósito, e quem chama usa isso: um erro
         com status veio do servidor e é resposta dele; um erro sem status
         significa que a resposta nem chegou ao navegador. Função não
         publicada cai aqui, e não num 404 — o gateway recusa antes, e o
         CORS impede o navegador de ler o que voltou. */
      throw new Error('Não foi possível falar com o servidor. Confira o endereço do projeto e sua conexão.');
    }).then(function (resposta) {
      if (resposta.status === 204) return null;
      return resposta.text().then(function (texto) {
        let corpo = null;
        try { corpo = texto ? JSON.parse(texto) : null; } catch (e) { corpo = { mensagem: texto }; }
        if (!resposta.ok) {
          /* `erro` vem primeiro porque é o campo das nossas Edge Functions —
             e era o único que faltava nesta lista. Sem ele, toda recusa
             explicada em português virava "O servidor respondeu 401", e a
             explicação que a função tinha escrito morria no caminho. Os
             outros quatro são do GoTrue e do PostgREST. */
          const msg = (corpo && (corpo.erro || corpo.error_description || corpo.msg || corpo.message || corpo.hint)) ||
            ('O servidor respondeu ' + resposta.status + '.');
          /* Renovar dependia da recusa citar "jwt" ou "token". Quem escreve a
             recusa é o servidor, e as nossas Edge Functions explicam o 401 em
             português — "não consegui confirmar quem está chamando" não casa
             com nenhuma das duas palavras. Resultado: sessão vencida na tela
             da IA nunca renovava, e o app culpava a chave pública, que estava
             certa. Um 401 numa chamada autenticada é motivo suficiente: se a
             renovação não resolver, o segundo 401 volta como estava. */
          const vencido = resposta.status === 401 && o.autenticado !== false &&
            sessao() && sessao().refresh_token;
          if (vencido && podeRenovar) {
            return renovar().then(function () { return tentar(caminho, opcoes, false); });
          }
          const erro = new Error(msg);
          erro.status = resposta.status;
          throw erro;
        }
        return corpo;
      });
    });
  }

  /* Troca da própria senha. É o GoTrue que valida a sessão: sem token válido
     ele recusa, então ninguém troca a senha de outra pessoa por aqui. */
  function trocarMinhaSenha(nova) {
    return chamar('/auth/v1/user', { metodo: 'PUT', corpo: { password: nova } });
  }

  /* Convite e "esqueci a senha" não voltam por uma resposta de chamada: o
     GoTrue manda a pessoa de volta ao app com os tokens no pedaço do endereço
     depois do #. Quem clica no link do e-mail chega aqui já autenticado, sem
     nunca ter digitado senha — e é justamente por isso que o passo seguinte,
     no app, é escolher uma.

     O fragmento traz só os tokens, não a pessoa. Então guardamos a sessão
     primeiro (senão a chamada abaixo não teria com que se autenticar) e
     perguntamos ao servidor quem é. Se essa pergunta falhar, desfazemos: uma
     sessão sem dono espalharia o problema por todo o resto do app. */
  function adotarTokens(t) {
    if (!t || !t.access_token) return Promise.reject(new Error('O link não trouxe credencial.'));
    guardarSessao({
      access_token: t.access_token,
      refresh_token: t.refresh_token || '',
      token_type: t.token_type || 'bearer',
      expires_in: Number(t.expires_in || 3600)
    });
    return chamar('/auth/v1/user').then(function (u) {
      const s = sessao();
      s.user = u;
      guardarSessao(s);
      return u;
    }).catch(function (e) {
      guardarSessao(null);
      throw e;
    });
  }

  /* Edge Functions: o pedaço de servidor que o app tem. Existe para guardar
     o que não pode viver no navegador — hoje, a chave da IA. */
  function chamarFuncao(nome, corpo) {
    return chamar('/functions/v1/' + nome, { metodo: 'POST', corpo: corpo || {} });
  }

  /* ---------- autenticação (GoTrue) ---------- */
  function cadastrar(email, senha, dados) {
    return chamar('/auth/v1/signup', {
      metodo: 'POST', autenticado: false,
      corpo: { email: email, password: senha, data: dados || {} }
    }).then(function (r) {
      /* Com confirmação de e-mail ligada, o Supabase não devolve sessão aqui:
         ele manda o e-mail e espera o clique. */
      if (r && r.access_token) guardarSessao(r);
      return r;
    });
  }

  function entrar(email, senha) {
    return chamar('/auth/v1/token?grant_type=password', {
      metodo: 'POST', autenticado: false,
      corpo: { email: email, password: senha }
    }).then(function (r) {
      guardarSessao(r);
      return r;
    });
  }

  function sair() {
    const s = sessao();
    guardarSessao(null);
    if (!s) return Promise.resolve();
    return chamar('/auth/v1/logout', { metodo: 'POST' }).catch(function () {});
  }

  /* ESTE ERA O DEFEITO, e ele explica a história inteira.

     O GoTrue devolve CREDENCIAL, e só: token novo, refresh novo, usuário.
     Gravar essa resposta crua por cima da sessão apagava o `perfil` — que é
     coisa do app, guardada ali para não perguntar ao servidor a cada envio.

     O estrago em cadeia: o app fica parado, o token de uma hora vence,
     `renovar` roda, o perfil some. A partir daí TODO envio morre em
     "Seu perfil não existe no banco" — para sempre, porque nada o repunha.
     O vendedor continua trabalhando, o app continua aceitando, e nada mais
     chega ao servidor. Foi assim que dezessete oportunidades se perderam.

     Guardar o perfil só quando é a MESMA pessoa: refresh que volta com outro
     usuário é outra sessão, e carregar o perfil de alguém para dentro dela
     seria o vazamento entre empresas pela porta dos fundos. */
  function renovar() {
    const s = sessao();
    if (!s || !s.refresh_token) return Promise.reject(new Error('Sem sessão para renovar.'));
    return chamar('/auth/v1/token?grant_type=refresh_token', {
      metodo: 'POST', autenticado: false, corpo: { refresh_token: s.refresh_token }
    }).then(function (r) {
      const nova = Object.assign({}, r);
      const antes = (s.user && s.user.id) || '';
      const agora = (nova.user && nova.user.id) || '';
      if (!nova.user && s.user) nova.user = s.user;
      if (s.perfil && (!agora || !antes || agora === antes)) nova.perfil = s.perfil;
      guardarSessao(nova);
      return nova;
    });
  }

  function eu() {
    return chamar('/auth/v1/user', {}).then(function (u) { return u; });
  }

  /* Duas leituras separadas de propósito. A pergunta "este usuário tem empresa?"
     decide se a pessoa entra ou fica presa na tela de empresa — e não pode
     depender de conseguir LER a empresa, que é outra permissão. Juntar as duas
     numa consulta só fazia uma falha na segunda derrubar a primeira. */
  function meuPerfil() {
    const s = sessao();
    if (!s || !s.user) return Promise.resolve(null);
    return chamar('/rest/v1/perfis?id=eq.' + s.user.id + '&select=*').then(function (linhas) {
      const perfil = (linhas && linhas[0]) || null;
      if (!perfil || !perfil.tenant_id) return perfil;
      /* O nome da empresa é enfeite: se não vier, o perfil continua valendo. */
      return chamar('/rest/v1/tenants?id=eq.' + perfil.tenant_id + '&select=id,nome,cnpj').then(
        function (ts) { perfil.tenants = (ts && ts[0]) || null; return perfil; },
        function () { return perfil; }
      );
    });
  }

  function salvarPerfil(dados) {
    const s = sessao();
    if (!s || !s.user) return Promise.reject(new Error('Entre na nuvem primeiro.'));
    return chamar('/rest/v1/perfis?id=eq.' + s.user.id, {
      metodo: 'PATCH', cabecalhos: { Prefer: 'return=representation' }, corpo: dados
    });
  }

  /* Criar a empresa e ligar o perfil a ela é uma coisa só, e é o banco que faz.
     Inserir em tenants daqui não funciona: o Postgres aplica as políticas de
     leitura à linha devolvida, e quem ainda não tem empresa não pode ler a que
     acabou de criar. Ver nuvem/correcao-01-criar-empresa.sql. */
  function criarMinhaEmpresa(nome, cnpj) {
    return chamar('/rest/v1/rpc/criar_minha_empresa', {
      metodo: 'POST', corpo: { p_nome: nome, p_cnpj: cnpj || '' }
    });
  }

  /* ---------- administração ----------
     As políticas do banco já deixam o administrador ler todos os perfis e
     empresas e atualizar perfis alheios. Faltava a tela — e enquanto ela não
     existia, incluir alguém no time exigia escrever SQL, que é onde o erro
     nasce. Quem não é administrador recebe lista vazia do próprio Postgres,
     não de uma checagem daqui. */
  function perfisDaNuvem() {
    return chamar('/rest/v1/perfis?select=*&order=criado_em.asc');
  }

  function empresasDaNuvem() {
    return chamar('/rest/v1/tenants?select=*&order=nome.asc');
  }

  /* ---------- as conversas do WhatsApp ----------
     Diferente de tudo que passa por `sincronizar`: estas linhas não moram no
     navegador e não sobem daqui. Quem escreve é a Edge Function `whatsapp`,
     com a chave de serviço; o app só lê, e o RLS decide o que cada empresa
     enxerga. Ver nuvem/WHATSAPP.md.

     O teto de 2000 existe porque a carga de histórico traz 6 meses de uma vez:
     sem limite, o primeiro acesso depois de conectar o número puxaria tudo de
     uma vez para dentro do navegador. As mais recentes são as que importam. */
  /* ---------------- e-mail ----------------

     Mesmo desenho do WhatsApp, e pelo mesmo motivo: conversa não cabe no
     estado que o navegador carrega inteiro. Ela vive no servidor, o app lê o
     que precisa, e o casamento com contato e negociação acontece na hora. */
  function emailsDaNuvem(quantos) {
    return chamar('/rest/v1/emails?select=*&order=enviada_em.desc&limit=' + (quantos || 1000));
  }

  /* O vínculo vale para a CONVERSA inteira, não para a linha: quem casou uma
     vez casou a thread, e as respostas seguintes já nascem no lugar certo. */
  function vincularEmail(thread, contatoId, contaId, oportunidadeId) {
    return chamar('/rest/v1/emails?thread=eq.' + encodeURIComponent(thread), {
      metodo: 'PATCH',
      cabecalhos: { prefer: 'return=minimal' },
      corpo: { contato_id: contatoId || null, conta_id: contaId || null,
               oportunidade_id: oportunidadeId || null }
    });
  }

  /* Enfileirar é gravar a mensagem com estado 'fila'. Quem manda de verdade é
     a função do servidor, que tem a senha de aplicativo; o navegador nunca vê
     credencial nenhuma e nunca fala com servidor de e-mail.

     O id é gerado aqui e é o Message-ID de verdade que vai no cabeçalho. É ele
     que faz a resposta do cliente voltar amarrada à negociação sem adivinhação
     — e é por isso que ele nasce do nosso lado, e não do servidor de e-mail. */
  function enfileirarEmail(dados) {
    return chamar('/rest/v1/emails', {
      metodo: 'POST',
      cabecalhos: { prefer: 'return=representation' },
      corpo: [dados]
    }).then(function (linhas) { return (linhas && linhas[0]) || null; });
  }

  /* A marca de "já passou pelo assistente". Vai para o servidor, e não para a
     memória, porque a análise é cara e o app abre em vários aparelhos: marcar
     só aqui faria o segundo computador reanalisar a caixa inteira. */
  function marcarEmailAnalisado(id, analise, erro) {
    const corpo = erro
      ? { analise_erro: String(erro).slice(0, 500) }
      : { analisada_em: new Date().toISOString(), analise: analise || {}, analise_erro: '' };
    return chamar('/rest/v1/emails?id=eq.' + encodeURIComponent(id), {
      metodo: 'PATCH',
      cabecalhos: { prefer: 'return=minimal' },
      corpo: corpo
    });
  }

  /* Contar as tentativas é o que impede o laço. Assistente fora do ar deixaria
     o mesmo e-mail sendo tentado a cada abertura do app, para sempre. */
  function contarTentativaDeAnalise(id, quantas) {
    return chamar('/rest/v1/emails?id=eq.' + encodeURIComponent(id), {
      metodo: 'PATCH',
      cabecalhos: { prefer: 'return=minimal' },
      corpo: { analise_tentativas: quantas }
    });
  }

  function marcarLidosEmail(ids) {
    const lista = (ids || []).filter(Boolean);
    if (!lista.length) return Promise.resolve(null);
    const alvo = lista.map(function (i) { return '"' + String(i).replace(/"/g, '') + '"'; }).join(',');
    return chamar('/rest/v1/emails?id=in.(' + encodeURIComponent(alvo) + ')', {
      metodo: 'PATCH',
      cabecalhos: { prefer: 'return=minimal' },
      corpo: { lida: true }
    });
  }

  function caixasDeEmail() {
    return chamar('/rest/v1/caixas_email?select=*&order=criado_em.asc');
  }

  /* A senha de aplicativo faz UMA viagem: daqui para a Edge Function, por TLS.
     Ela não é guardada em lugar nenhum do navegador — nem em variável que
     sobreviva a esta chamada, nem em localStorage, nem no estado do app. O
     servidor a cifra e guarda; o que volta é só "deu certo" ou o motivo.

     Antes disto, a senha de cada pessoa tinha de ser digitada no painel do
     Supabase por quem o administra — ou seja, a Rosa teria de MANDAR a senha
     dela para alguém. Senha que viaja por mensagem já está queimada, por
     melhor que seja o cofre do outro lado. */
  function guardarSenhaDaCaixa(endereco, senha) {
    return chamarFuncao('email', { acao: 'guardar-senha', endereco: endereco, senha: senha });
  }

  function esquecerSenhaDaCaixa(endereco) {
    return chamarFuncao('email', { acao: 'esquecer-senha', endereco: endereco });
  }

  function salvarCaixaDeEmail(caixa) {
    return chamar('/rest/v1/caixas_email?on_conflict=dono_id,endereco', {
      metodo: 'POST',
      cabecalhos: { prefer: 'resolution=merge-duplicates,return=representation' },
      corpo: [caixa]
    }).then(function (linhas) { return (linhas && linhas[0]) || null; });
  }

  function mensagensWhatsapp(quantas) {
    return chamar('/rest/v1/mensagens_whatsapp?select=*&order=enviada_em.desc&limit=' +
      (quantas || 2000));
  }

  /* Marcar lida é do app, não da função: só quem abriu a conversa sabe que ela
     foi lida. `in.(...)` porque são várias de uma vez, e uma chamada por
     mensagem seria trinta chamadas ao abrir uma conversa. */
  function marcarLidasWhatsapp(ids) {
    const lista = (ids || []).filter(Boolean);
    if (!lista.length) return Promise.resolve(null);
    const alvo = lista.map(function (i) { return '"' + String(i).replace(/"/g, '') + '"'; }).join(',');
    return chamar('/rest/v1/mensagens_whatsapp?id=in.(' + encodeURIComponent(alvo) + ')', {
      metodo: 'PATCH',
      cabecalhos: { prefer: 'return=minimal' },
      corpo: { lida: true }
    });
  }

  /* O casamento da conversa com quem já está no CRM. Vale para o telefone
     inteiro, não para uma mensagem: quem descobriu de quem é a conversa
     descobriu de quem são todas as mensagens dela, inclusive as que ainda vão
     chegar — por isso a próxima leitura reaproveita o vínculo. */
  function vincularWhatsapp(telefoneCurto, contatoId, oportunidadeId) {
    return chamar('/rest/v1/mensagens_whatsapp?telefone_curto=eq.' +
      encodeURIComponent(telefoneCurto), {
      metodo: 'PATCH',
      cabecalhos: { prefer: 'return=minimal' },
      corpo: { contato_id: contatoId || null, oportunidade_id: oportunidadeId || null }
    });
  }

  /* Empresa e papel passam por funções que conferem quem está pedindo, e não
     por PATCH direto: escrever nessas duas colunas foi revogado no banco. Um
     PATCH em perfis deixava qualquer um se promover a administrador com a chave
     pública que vem no app. Ver nuvem/correcao-04-permissoes.sql. */
  function definirEmpresaDoPerfil(id, tenantId) {
    return chamar('/rest/v1/rpc/definir_empresa_do_perfil', {
      metodo: 'POST', corpo: { p_id: id, p_tenant: tenantId || null }
    });
  }

  /* Bloquear e desbloquear: atribuição do administrador, conferida no banco.
     Não existe excluir de propósito — desligar um vendedor não pode apagar a
     carteira que ele atendia. Ver nuvem/correcao-09-bloqueio.sql. */
  function definirBloqueioDoPerfil(id, ativo) {
    return chamar('/rest/v1/rpc/definir_bloqueio_do_perfil', {
      metodo: 'POST', corpo: { p_id: id, p_ativo: !!ativo }
    });
  }

  function definirBloqueioDaEmpresa(id, ativo) {
    return chamar('/rest/v1/rpc/definir_bloqueio_da_empresa', {
      metodo: 'POST', corpo: { p_id: id, p_ativo: !!ativo }
    });
  }

  function definirDadosDaEmpresa(id, nome, cnpj) {
    return chamar('/rest/v1/rpc/definir_dados_da_empresa', {
      metodo: 'POST', corpo: { p_id: id, p_nome: nome, p_cnpj: cnpj || '' }
    });
  }

  /* A ponte do Linked Helper é da empresa, não do aparelho: é o que faz a
     configuração existir em qualquer computador em que alguém entre. Passa por
     função no banco porque quem pode mudar é quem administra ou quem gerencia
     aquela empresa — o vendedor enxerga, não configura. */
  function definirPonteDaEmpresa(id, url, chave) {
    return chamar('/rest/v1/rpc/definir_ponte_da_empresa', {
      metodo: 'POST', corpo: { p_id: id, p_url: url || '', p_chave: chave || '' }
    });
  }

  function definirDadosDoPerfil(id, nome, whatsapp) {
    return chamar('/rest/v1/rpc/definir_dados_do_perfil', {
      metodo: 'POST', corpo: { p_id: id, p_nome: nome, p_whatsapp: whatsapp || '' }
    });
  }

  /* Por que não entrei. Quem está bloqueado não lê a linha da empresa — as
     políticas já negaram —, então sem esta pergunta o app saberia que a pessoa
     não tem acesso e não saberia dizer o motivo. */
  function minhaSituacao() {
    return chamar('/rest/v1/rpc/minha_situacao', { metodo: 'POST', corpo: {} })
      .then(function (r) { return (Array.isArray(r) ? r[0] : r) || null; });
  }

  /* Pergunta ao servidor o que ELE acha de quem está chamando. É a única forma
     de separar, de dentro do app, as três causas de "o pipeline está vazio":
     a correção que dá ao gestor a visão da empresa nunca foi aplicada (a função
     não existe), o servidor não considera a pessoa gestora, ou os registros
     estão em outra empresa. Sem isto a resposta só sai abrindo o SQL Editor. */
  function comoOServidorMeVe() {
    const perguntar = function (nome) {
      return chamar('/rest/v1/rpc/' + nome, { metodo: 'POST', corpo: {} })
        .then(function (r) { return { existe: true, valor: Array.isArray(r) ? r[0] : r }; },
              function (e) {
                /* 404 é a função não existir — o sinal de que a correção não
                   rodou. Qualquer outro erro é outra coisa, e vai como está. */
                return { existe: e.status !== 404, erro: e.message, status: e.status || 0 };
              });
    };
    return Promise.all([perguntar('sou_gestor'), perguntar('meu_tenant'), perguntar('sou_admin')])
      .then(function (r) {
        return { souGestor: r[0], meuTenant: r[1], souAdmin: r[2] };
      });
  }

  /* O servidor devolve alguma linha desta tabela para quem está chamando?

     A primeira versão lia o total do cabeçalho content-range, que é o jeito
     certo de contar — e o navegador não enxerga esse cabeçalho a menos que o
     servidor o exponha por CORS. Dava "NaN" na tela, ou seja, a ferramenta de
     diagnóstico com um defeito de diagnóstico. Buscar as primeiras linhas
     responde a mesma pergunta sem depender de nada. */
  function primeirasLinhas(tabela, quantas) {
    return chamar('/rest/v1/' + tabela + '?select=id&limit=' + (quantas || 5))
      .then(function (linhas) {
        const n = Array.isArray(linhas) ? linhas.length : 0;
        return { tem: n > 0, quantas: n, limite: quantas || 5 };
      }, function (e) { return { erro: e.message, status: e.status || 0 }; });
  }

  /* Onde estão os registros, por empresa. Só o administrador consegue — o RLS
     devolve as linhas das outras empresas apenas para ele. Para quem é gestor,
     esta pergunta não tem resposta de dentro do app: é o SQL Editor. */
  function ondeEstaoOsRegistros() {
    const buscar = function (tabela) {
      return chamar('/rest/v1/' + tabela + '?select=tenant_id&limit=2000')
        .then(function (linhas) {
          const por = {};
          (linhas || []).forEach(function (l) {
            const k = l.tenant_id || '(sem empresa)';
            por[k] = (por[k] || 0) + 1;
          });
          return { tabela: tabela, por: por, total: (linhas || []).length };
        }, function (e) { return { tabela: tabela, erro: e.message }; });
    };
    return Promise.all([buscar('contas'), buscar('oportunidades')]);
  }

  function definirPapelDoPerfil(id, papel) {
    return chamar('/rest/v1/rpc/definir_papel_do_perfil', {
      metodo: 'POST', corpo: { p_id: id, p_papel: papel }
    });
  }

  /* Nome e WhatsApp continuam sendo do próprio dono. */
  function salvarMeuNome(dados) {
    const s = sessao();
    if (!s || !s.user) return Promise.reject(new Error('Entre na nuvem primeiro.'));
    return chamar('/rest/v1/perfis?id=eq.' + s.user.id, {
      metodo: 'PATCH', cabecalhos: { Prefer: 'return=representation' },
      corpo: { nome: dados.nome, whatsapp: dados.whatsapp }
    });
  }

  /* Existe alguma empresa no servidor? Decide se quem entra sem vínculo monta a
     casa ou espera ser ligado. A leitura é limitada pelas políticas, então um
     usuário comum de uma empresa existente vê a dele — o que já basta para a
     resposta ser "não é a primeira". */
  function existeEmpresa() {
    return chamar('/rest/v1/tenants?select=id&limit=1').then(
      function (linhas) { return !!(linhas && linhas.length); },
      function () { return true; }   /* na dúvida, não ofereça criar */
    );
  }

  function convitesDaNuvem() {
    return chamar('/rest/v1/convites?select=*&order=criado_em.desc');
  }

  /* O nome viaja junto porque o convite do GoTrue não passa pela tela de
     cadastro: ele cria a conta a partir do e-mail e nada mais. Sem isto a
     pessoa nasce sem nome, e só ela mesma poderia consertar — entrando, que é
     justamente o que ela ainda não conseguiu fazer. */
  function convidar(email, tenantId, papel, nome) {
    const s = sessao();
    return chamar('/rest/v1/convites', {
      metodo: 'POST',
      cabecalhos: { Prefer: 'resolution=merge-duplicates,return=representation' },
      corpo: {
        email: String(email || '').trim().toLowerCase(),
        nome: String(nome || '').trim(),
        tenant_id: tenantId,
        papel: papel || 'usuario',
        criado_por: (s && s.user) ? s.user.id : null
      }
    });
  }

  /* "Esqueci minha senha". Chega de volta pelo mesmo caminho do convite — o
     GoTrue devolve os tokens depois do # e o app pede a senha nova —, então
     quem já tem conta e nunca definiu senha se resolve por aqui, sem depender
     de outro convite.

     Não é autenticado, e responde igual para e-mail que existe e e-mail que
     não existe: dizer "esta conta não existe" transformaria a tela numa lista
     de quem usa o sistema. */
  function recuperarSenha(email, destino) {
    return chamar('/auth/v1/recover' + (destino ? '?redirect_to=' + encodeURIComponent(destino) : ''), {
      metodo: 'POST', autenticado: false,
      corpo: { email: String(email || '').trim().toLowerCase() }
    });
  }

  function removerConvite(email) {
    return chamar('/rest/v1/convites?email=eq.' + encodeURIComponent(String(email).toLowerCase()), { metodo: 'DELETE' });
  }

  /* Duas empresas com o mesmo nome escrito diferente são dois cofres, e
     ninguém percebe até a carteira sumir dentro de um deles. Foi o que
     aconteceu: "acP", "AcP", "Advanced Channel Partners" e "AcP - Advanced
     Channel Partners" viraram quatro empresas, e a carteira ficou numa.

     Comparar é do jeito que o olho compara: sem acento, sem maiúscula, sem
     pontuação e sem espaço repetido. "AcP" e "acP" são a mesma coisa para
     qualquer pessoa, e passam a ser para o app também. */
  function achatarNome(v) {
    return String(v || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function soDigitosCnpj(v) { return String(v || '').replace(/\D/g, ''); }

  /* A regra, separada da rede de propósito: assim ela é testável sem servidor,
     e a tela pode avisar enquanto a pessoa digita, antes de ela clicar. */
  function empresaParecida(lista, nome, cnpj) {
    const nomeNovo = achatarNome(nome);
    const cnpjNovo = soDigitosCnpj(cnpj);
    if (!nomeNovo && !cnpjNovo) return null;

    return (lista || []).filter(function (t) {
      if (nomeNovo && achatarNome(t.nome) === nomeNovo) return true;
      return !!cnpjNovo && soDigitosCnpj(t.cnpj) === cnpjNovo;
    })[0] || null;
  }

  function recusaDeDuplicada(igual, cnpj) {
    const mesmoCnpj = !!soDigitosCnpj(cnpj) &&
      soDigitosCnpj(igual.cnpj) === soDigitosCnpj(cnpj);
    return 'Já existe a empresa "' + igual.nome + '"' +
      (mesmoCnpj ? ' com este mesmo CNPJ' : '') + '.\n\n' +
      'Criar outra parecida separa a carteira em dois cofres, e descobrir isso ' +
      'depois é caro. Use a que já existe, ou mude o nome para algo que ' +
      'distinga as duas de verdade.';
  }

  function criarEmpresa(nome, cnpj) {
    return empresasDaNuvem().then(function (jaExistem) {
      const igual = empresaParecida(jaExistem, nome, cnpj);
      if (igual) throw new Error(recusaDeDuplicada(igual, cnpj));

      return chamar('/rest/v1/tenants', {
        metodo: 'POST', cabecalhos: { Prefer: 'return=representation' },
        corpo: { nome: String(nome).trim(), cnpj: cnpj || '' }
      }).then(function (linhas) { return (linhas && linhas[0]) || null; });
    });
  }

  function souAdminNaNuvem() {
    const perfil = sessaoPerfil();
    return !!(perfil && perfil.papel === 'admin');
  }

  /* ---------- tradução entre o formato local e o do banco ---------- */
  const TABELAS = [
    { local: 'contas', remota: 'contas' },
    { local: 'contatos', remota: 'contatos' },
    { local: 'oportunidades', remota: 'oportunidades' },
    { local: 'tarefas', remota: 'tarefas' },
    { local: 'produtos', remota: 'produtos' },
    { local: 'segmentos', remota: 'segmentos' },
    { local: 'tiposTarefa', remota: 'tipos_tarefa' },
    { local: 'fontes', remota: 'fontes' },
    { local: 'sinais', remota: 'sinais' },
    /* Notas rápidas viajam como tudo o mais. A diferença está na política do
       banco, que só devolve as do próprio dono — o app não precisa saber. */
    { local: 'notas', remota: 'notas' }
  ];

  /* camelCase no app, snake_case no Postgres: a conversão é mecânica. */
  function paraColuna(nome) { return nome.replace(/[A-Z]/g, function (l) { return '_' + l.toLowerCase(); }); }
  function paraCampo(nome) { return nome.replace(/_([a-z])/g, function (_, l) { return l.toUpperCase(); }); }

  /* `criadaAgora` é o nome antigo da marca de trabalho que hoje se chama
     `_criadaAgora`. Renomear protegeu os registros novos e não os que já
     estavam guardados no navegador — e são justamente esses que travavam a
     sincronização. Fica aqui para sempre: o aparelho de alguém pode ficar
     meses sem abrir o app. */
  const IGNORAR_AO_ENVIAR = ['donoId', 'criadaAgora'];

  function paraBanco(registro, tenantId, donoId) {
    const saida = {};
    Object.keys(registro).forEach(function (campo) {
      if (IGNORAR_AO_ENVIAR.indexOf(campo) !== -1) return;
      /* Campo que começa com underscore é marca de trabalho do app, não dado:
         serve a um passo do código e morre ali. Se subir, o banco não tem a
         coluna e recusa a TABELA inteira — a carteira para de sincronizar por
         causa de uma variável temporária. É convenção, e está escrita aqui
         porque é aqui que ela é cobrada. */
      if (campo.charAt(0) === '_') return;
      const valor = registro[campo];
      if (valor === undefined) return;
      saida[paraColuna(campo)] = valor === '' && /Em$|previsto$|vencimento$|^quando$/i.test(campo) ? null : valor;
    });
    saida.tenant_id = tenantId;
    if (donoId && ('donoId' in registro || 'dono_id' in saida)) saida.dono_id = donoId;
    saida.atualizado_em = new Date().toISOString();
    return saida;
  }

  /* O PostgREST recusa um lote em que os objetos não têm exatamente as mesmas
     colunas: "All object keys must match". E os registros de um app que mudou
     ao longo do tempo NÃO têm: a conta cadastrada em julho não conhece o campo
     que nasceu em setembro. Uma carteira antiga, restaurada de uma cópia,
     esbarra nisso e a sincronização inteira falha.

     Preencher o que falta com null resolveria o erro e criaria outro, pior: no
     merge o PostgREST só toca nas colunas que vieram, então mandar `cnpj: null`
     para um registro que não tinha o campo apagaria o CNPJ que está no
     servidor. Silenciosamente.

     Então não se preenche nada: separam-se os lotes por formato. Cada grupo vai
     com as colunas que ele realmente tem, e o que não veio fica como está lá. */
  function porFormato(linhas) {
    const grupos = {};
    linhas.forEach(function (l) {
      const assinatura = Object.keys(l).sort().join('|');
      (grupos[assinatura] = grupos[assinatura] || []).push(l);
    });
    return Object.keys(grupos).map(function (k) { return grupos[k]; });
  }

  function paraApp(linha) {
    const saida = {};
    Object.keys(linha).forEach(function (coluna) {
      if (coluna === 'atualizado_em') return;
      saida[paraCampo(coluna)] = linha[coluna] === null ? '' : linha[coluna];
    });
    return saida;
  }

  /* O app se atualiza sozinho, pelo navegador; o banco não. Quando um campo
     novo nasce no código, ele só existe do lado de lá depois que alguém roda o
     SQL — e até lá o PostgREST recusa a tabela INTEIRA, não a coluna. Uma
     carteira de trezentos registros para de subir por causa de um campo que
     ninguém usa ainda.

     O erro cru é `Could not find the 'nutricao' column of 'oportunidades' in
     the schema cache`, e ele manda a pessoa procurar no lugar errado: parece
     defeito do app, e é banco desatualizado. Aqui ele vira a frase que diz o
     que fazer. */
  function explicarFalhas(falhas) {
    const faltando = [];
    falhas.forEach(function (f) {
      const m = /Could not find the '([^']+)' column of '([^']+)'/.exec(f.erro || '');
      if (m) faltando.push(m[2] + '.' + m[1]);
    });

    if (faltando.length) {
      return 'O banco está atrás do aplicativo: ' +
        (faltando.length === 1 ? 'falta a coluna ' : 'faltam as colunas ') +
        faltando.join(', ') + '.\n\n' +
        'Nada foi perdido — os registros continuam neste aparelho. ' +
        'Rode nuvem/correcao-16-tudo-em-dia.sql no SQL Editor do Supabase ' +
        'e sincronize de novo. Ele junta tudo o que está pendente e pode ser ' +
        'repetido sem estragar nada.';
    }
    return falhas.map(function (f) { return f.tabela + ': ' + f.erro; }).join(' — ');
  }

  /* ---------- sincronização ---------- */

  /* O perfil fica na sessão para não pedir ao servidor a cada envio. Quando
     ele não está lá, a saída não é desistir: é PERGUNTAR.

     Antes, a falta do perfil era um beco sem saída — a mensagem "Seu perfil
     não existe no banco" acusava o banco de um problema que estava aqui
     dentro, e só sair e entrar de novo consertava. Quem não soubesse disso
     trabalhava o dia inteiro sem nada subir.

     Isto conserta sozinho também quem já está preso nesse estado: a próxima
     tentativa relê o perfil e segue. */
  function perfilParaEnviar() {
    const p = sessaoPerfil();
    if (p) return Promise.resolve(p);
    if (!conectado()) return Promise.reject(new Error('Você não está conectado ao servidor.'));
    return meuPerfil().then(function (perfil) {
      if (!perfil) {
        throw new Error('O seu usuário não tem perfil no banco. ' +
          'Peça a quem administra para criá-lo — sem ele o servidor não sabe de quem é o que sobe.');
      }
      guardarPerfilNaSessao(perfil);
      return perfil;
    });
  }

  function empurrar() {
    return perfilParaEnviar().then(empurrarComPerfil);
  }

  function empurrarComPerfil(perfil) {

    /* Sem empresa no perfil, o envio parava aqui — para todo mundo. Certo para
       o vendedor: o RLS do banco confere `tenant_id = meu_tenant()`, e com
       `meu_tenant()` nulo nenhuma linha dele passaria; recusar aqui, com o
       motivo na tela, é melhor do que deixar o servidor recusar em silêncio.

       Errado para o ADMINISTRADOR, e custou caro: `sou_admin()` deixa ele
       gravar em qualquer empresa, e `donoDoRegistro` abaixo carimba cada linha
       com a empresa DELA — não com a do perfil. Ou seja, o envio funcionaria
       perfeitamente. O que acontecia era o administrador ver a carteira
       inteira na tela (porque `sou_admin()` deixa LER tudo) e não conseguir
       gravar nada, com uma faixa laranja que dizia “falta empresa” enquanto o
       que faltava era só esta linha.

       Ele passa. O que não passa é o registro sem carimbo de servidor: sem
       UUID próprio e sem empresa no perfil, não há de quem ele seja, e inventar
       aqui é exatamente o erro que `donoDoRegistro` existe para não cometer.
       Esse fica retido, e a tela diz quantos. */
    const souAdmin = String(perfil.papel || '') === 'admin';
    if (!perfil.tenant_id && !souAdmin) {
      return Promise.reject(new Error('Seu usuário ainda não tem empresa na nuvem.'));
    }

    const estado = Store.obter();
    const donoId = (sessao().user || {}).id;

    /* Só sobe o que é desta empresa.

       paraBanco carimba tenant_id em tudo o que passa por ele. Enquanto a
       cópia local for de uma empresa só, isso é inofensivo. Mas este app é
       multiempresa e o mesmo navegador atende várias: quem trabalhou na AcP,
       entrou como Bio Water Care e clicou em Sincronizar mandava a carteira da
       AcP para dentro da Bio Water Care, recarimbada. A demonstração vai pelo
       mesmo caminho.

       Registro sem empresa sobe: é o do vendedor que cadastrou offline antes
       de o carimbo existir, e o dono dele é quem está logado agora. */
    /* Quem é "outra empresa" e quem é só registro sem carimbo de servidor:

       a empresa do servidor tem id UUID, criado pelo Postgres. O carimbo que o
       próprio app inventa quando encontra registro órfão tem a forma
       `ten_xxx`, e nunca existiu em servidor nenhum — é do vendedor que
       cadastrou antes de haver empresa. Segurar esse é perdê-lo para sempre,
       porque nenhum login vai casar com ele.

       Então só fica retido o que está carimbado com um UUID diferente do meu:
       aquilo é carteira de outra empresa de verdade. */
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    /* O administrador é a exceção, e a falta dela custou caro uma vez.

       Ele enxerga todas as empresas e é quem socorre quando alguma carteira
       fica no lugar errado — mas o envio olhava só a empresa do PERFIL dele.
       Resultado: o administrador via os registros na tela, o app dizia "186
       são de outra empresa e não foram enviados", e a única saída que sobrava
       era escrever SQL à mão. Quem administra tem de conseguir resgatar pelo
       aplicativo; é para isso que ele é administrador.

       Aqui não se perde isolamento: o carimbo de cada registro vai junto e o
       RLS do banco decide de novo do lado de lá. O que muda é só quem tem
       permissão de empurrar carimbo de outra empresa — e é o administrador,
       que já pode ler e escrever em todas. */
    const daEmpresa = function (r) {
      const dele = String(r.tenantId || '');
      /* Administrador sem empresa no perfil: só sobe o que tem carimbo de
         servidor. O resto não tem para onde ir — e mandar com `tenant_id`
         nulo esbarraria no NOT NULL e derrubaria a TABELA inteira, levando
         junto as linhas que estavam certas. */
      if (!perfil.tenant_id) return UUID.test(dele);
      if (!dele) return true;
      if (dele === String(perfil.tenant_id)) return true;
      if (souAdmin && UUID.test(dele)) return true;
      return !UUID.test(dele);
    };

    /* Uma tabela que falha não pode esconder as outras. Com Promise.all, o
       primeiro erro aborta tudo e o problema seguinte só aparece depois de
       consertar este — descobrir de um em um custa uma rodada por defeito.
       Aqui todas as tabelas são tentadas e os erros voltam juntos. */
    /* De quem é cada registro na hora de subir.

       Antes ia tudo carimbado com a empresa do perfil, e enquanto só subia a
       carteira da própria empresa isso dava no mesmo. Com o administrador
       podendo empurrar as outras, deixar assim seria o desastre silencioso:
       ele sincroniza para socorrer a AcP e derruba a carteira dela dentro da
       empresa DELE, recarimbada, sem erro nenhum na tela.

       Carimbo de servidor manda. Sem carimbo, ou com carimbo local `ten_xxx`,
       o dono é a empresa de quem está sincronizando — é o registro criado
       offline antes de haver empresa. */
    const donoDoRegistro = function (r) {
      const dele = String(r.tenantId || '');
      return UUID.test(dele) ? dele : perfil.tenant_id;
    };

    /* Apagar vai na frente. O envio é `upsert`, então uma linha excluída aqui
       e ainda presente lá voltaria na descida seguinte como se nada tivesse
       acontecido — e com o servidor mandando isso é a diferença entre excluir
       e não excluir. */
    const paraApagar = Store.exclusoesPendentes();
    const exclusoes = paraApagar.length
      ? Promise.all(paraApagar.map(function (x) {
          return chamar('/rest/v1/' + x.tabela + '?id=eq.' + encodeURIComponent(x.id), {
            metodo: 'DELETE', cabecalhos: { Prefer: 'return=minimal' }
          }).then(function () { return { ok: x }; }, function (e) { return { erro: e.message, tabela: x.tabela }; });
        }))
      : Promise.resolve([]);

    let retidos = 0;
    const envios = TABELAS.map(function (t) {
      const minhas = (estado[t.local] || []).filter(daEmpresa);
      retidos += ((estado[t.local] || []).length - minhas.length);
      const linhas = minhas.map(function (r) { return paraBanco(r, donoDoRegistro(r), donoId); });
      if (!linhas.length) return Promise.resolve({ tabela: t.remota, enviados: 0 });

      return Promise.all(porFormato(linhas).map(function (lote) {
        return chamar('/rest/v1/' + t.remota, {
          metodo: 'POST',
          cabecalhos: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          corpo: lote
        });
      })).then(
        function () { return { tabela: t.remota, enviados: linhas.length }; },
        function (e) { return { tabela: t.remota, enviados: 0, erro: e.message }; }
      );
    });

    return exclusoes.then(function (saidas) {
      /* Só esquece o que o servidor confirmou ter apagado: o que falhou fica
         na fila e tenta de novo no próximo envio. */
      Store.esquecerExclusoes(saidas.filter(function (r) { return r.ok; }).map(function (r) { return r.ok; }));
      const erroAoApagar = saidas.filter(function (r) { return r.erro; });

      return Promise.all(envios).then(function (resultados) {
        const falhas = resultados.filter(function (r) { return r.erro; })
          .concat(erroAoApagar.map(function (r) { return { tabela: r.tabela + ' (apagar)', erro: r.erro }; }));
        if (falhas.length) {
          throw new Error(explicarFalhas(falhas));
        }
        return {
          enviados: resultados.reduce(function (s, r) { return s + r.enviados; }, 0),
          retidos: retidos
        };
      });
    });
  }

  /* Tabelas de movimento — o trabalho do vendedor. As de configuração
     (segmentos, tipos de tarefa, produtos) são listas que o servidor pode
     legitimamente devolver sozinhas. */
  const MOVIMENTO = ['contas', 'contatos', 'oportunidades', 'tarefas'];

  function quantoDeMovimento(fonte) {
    return MOVIMENTO.reduce(function (soma, nome) {
      return soma + ((fonte[nome] || []).length);
    }, 0);
  }

  /* Baixar substitui a cópia local pela do servidor. Enquanto o servidor
     devolve a carteira, é o que se espera de uma sincronização.

     Só que ele também devolve vazio — usuário sem carimbo de empresa, papel
     que o RLS não reconhece, empresa recém-criada. Aí "substituir pelo que
     veio" apaga o trabalho de quem estava trabalhando offline. Foi o que
     aconteceu: a faixa avisava que o servidor não tinha devolvido nada e
     oferecia um botão "Baixar de novo" que, a cada clique, gravava esse nada
     por cima da carteira.

     Agora vazio não passa por cima de cheio. A cópia local fica, o erro sobe
     com nome, e quem quiser mesmo substituir precisa dizer isso — é o que o
     `forcar` significa. */
  function puxar(forcar) {
    const buscas = TABELAS.map(function (t) {
      return chamar('/rest/v1/' + t.remota + '?select=*').then(
        function (linhas) { return { local: t.local, linhas: (linhas || []).map(paraApp) }; },
        function (e) { return { local: t.local, tabela: t.remota, erro: e.message }; }
      );
    });

    return Promise.all(buscas).then(function (resultados) {
      const falhas = resultados.filter(function (r) { return r.erro; });
      if (falhas.length) {
        throw new Error(falhas.map(function (f) { return f.tabela + ': ' + f.erro; }).join(' — '));
      }
      /* Só troca a cópia local depois que todas as tabelas vieram: substituir
         parte delas deixaria a carteira pela metade, com contas sem contatos. */
      const estado = Store.obter();

      const veio = {};
      resultados.forEach(function (r) { veio[r.local] = r.linhas; });
      const aqui = quantoDeMovimento(estado);
      if (!forcar && aqui && !quantoDeMovimento(veio)) {
        const e = new Error('O servidor não devolveu nenhuma conta, contato, ' +
          'oportunidade ou tarefa, e existem ' + aqui + ' aqui neste aparelho. ' +
          'Não baixei: gravar o vazio por cima apagaria esse trabalho.');
        e.vazioSobreCheio = true;
        e.locais = aqui;
        throw e;
      }

      /* Escrever o que acabou de chegar não pode disparar um envio de volta:
         seria um laço, e um laço que reescreve o servidor com a cópia que ele
         mesmo mandou. */
      Store.semSincronizar(function () {
        resultados.forEach(function (r) { estado[r.local] = r.linhas; });
        Store.salvar();
      });
      return resultados.reduce(function (s, r) { return s + r.linhas.length; }, 0);
    });
  }

  function sincronizar() {
    return empurrar().then(function (subida) {
      return puxar().then(function (recebidos) {
        localStorage.setItem('iad-crm:nuvem-ultima', new Date().toISOString());
        return { enviados: subida.enviados, retidos: subida.retidos, recebidos: recebidos };
      });
    });
  }

  /* A entrada no app.

     Antes ela só baixava. Subir dependia de alguém lembrar de clicar em
     Sincronizar, e a descida era automática — então bastava não clicar uma vez
     para a carteira existir só neste aparelho, e o login seguinte a apagava.
     Assimetria entre o que sobe e o que desce é o defeito; a perda foi o
     sintoma.

     Subir primeiro, e sem deixar a falha da subida impedir a descida: quem
     acabou de entrar precisa ver a carteira mesmo que o envio tenha falhado. */
  function sincronizarNaEntrada() {
    return empurrar().then(
      function (subida) { return subida; },
      function (e) { return { enviados: 0, retidos: 0, erroAoEnviar: e.message }; }
    ).then(function (subida) {
      return puxar().then(function (recebidos) {
        localStorage.setItem('iad-crm:nuvem-ultima', new Date().toISOString());
        return { enviados: subida.enviados, retidos: subida.retidos,
          erroAoEnviar: subida.erroAoEnviar, recebidos: recebidos };
      }, function (e) {
        /* A descida falhando NÃO apaga o que a subida descobriu.

           Era o mesmo defeito de origem, um andar acima: a subida engole o
           erro de propósito, guarda em `erroAoEnviar`, e quem lê isso é o
           ramo de sucesso. Quando a descida recusava por vazio-sobre-cheio, o
           ramo de sucesso nunca rodava e a notícia mais grave da tela morria
           calada — exatamente a combinação mais provável, porque as duas têm
           a mesma causa: servidor sem a carteira desta empresa.

           A pessoa ficava com "sincronize para mandar esta carteira" como
           único conselho, sem saber que sincronizar já tinha sido tentado e
           tinha falhado, ou que aqueles registros são de outra empresa e
           nunca vão subir por este login. */
        e.subida = subida;
        throw e;
      });
    });
  }

  function ultimaSincronizacao() { return localStorage.getItem('iad-crm:nuvem-ultima') || ''; }

  /* O perfil fica junto da sessão para não pedir ao servidor a cada envio. */
  function sessaoPerfil() {
    const s = sessao();
    return s ? s.perfil : null;
  }

  function guardarPerfilNaSessao(perfil) {
    const s = sessao();
    if (!s) return;
    s.perfil = perfil;
    guardarSessao(s);
  }

  function estado() {
    return {
      configurada: configurada(),
      conectado: conectado(),
      email: (sessao() && sessao().user && sessao().user.email) || '',
      perfil: sessaoPerfil(),
      ultima: ultimaSincronizacao()
    };
  }

  global.IADNuvem = {
    config, salvarConfig, configurada, conectado, mandaNoAcesso, estado, sessao,
    cadastrar, entrar, sair, renovar, precisaRenovar, eu, meuPerfil, salvarPerfil, criarMinhaEmpresa,
    guardarPerfilNaSessao, empurrar, puxar, sincronizar, ultimaSincronizacao,
    perfisDaNuvem, empresasDaNuvem, souAdminNaNuvem, existeEmpresa,
    definirEmpresaDoPerfil, definirPapelDoPerfil, salvarMeuNome,
    definirBloqueioDoPerfil, definirBloqueioDaEmpresa, definirPonteDaEmpresa,
    sincronizarNaEntrada, definirDadosDaEmpresa, definirDadosDoPerfil, minhaSituacao, comoOServidorMeVe, primeirasLinhas, ondeEstaoOsRegistros,
    convitesDaNuvem, convidar, removerConvite, recuperarSenha, criarEmpresa, chamarFuncao,
    mensagensWhatsapp, marcarLidasWhatsapp, vincularWhatsapp,
    emailsDaNuvem, vincularEmail, enfileirarEmail, marcarLidosEmail,
    marcarEmailAnalisado, contarTentativaDeAnalise,
    caixasDeEmail, salvarCaixaDeEmail, guardarSenhaDaCaixa, esquecerSenhaDaCaixa,
    empresaParecida, achatarNome, porFormato, explicarFalhas,
    adotarTokens,
    trocarMinhaSenha,
    paraBanco, paraApp
  };
})(window);
