/* Ponte com o Linked Helper.

   Um PWA não recebe webhook: webhook precisa de um endereço público que fique
   de pé o tempo todo, e este app roda dentro do navegador. Então o Linked Helper
   publica num coletor (ponte/worker.js, um Cloudflare Worker de 60 linhas) e o
   app busca de lá quando você manda buscar.

   Os nomes dos campos variam conforme a ação e as opções de exportação do
   Linked Helper, então a normalização aceita várias grafias em vez de exigir uma. */
(function (global) {
  'use strict';

  const CHAVE = 'iad-crm:ponte:v1';

  function config() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE)) || { url: '', token: '' };
    } catch (e) {
      return { url: '', token: '' };
    }
  }

  function salvarConfig(nova) {
    localStorage.setItem(CHAVE, JSON.stringify({ url: nova.url || '', token: nova.token || '' }));
  }

  function configurada() {
    const c = config();
    return !!c.url;
  }

  /* "Head line", "head_line" e "headline" são o mesmo campo: comparamos sem
     separadores para não depender da grafia que o Linked Helper usar. */
  function chave(nome) { return String(nome).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function primeiro(objeto, nomes) {
    for (let i = 0; i < nomes.length; i++) {
      const valor = objeto[chave(nomes[i])];
      if (valor != null && String(valor).trim() !== '') return String(valor).trim();
    }
    return '';
  }

  /* ---------- a conversa ----------
     Vem inteira — o que a SDR mandou e o que o prospect respondeu —, porque
     quem abre a oportunidade depois precisa ler a pergunta para entender a
     resposta. O que muda por autor é o uso: só o lado do cliente vira
     evidência.

     ---------- de quem é a mensagem ----------
     O Linked Helper nomeia as mensagens do ponto de vista do prospect:
     "sent" é o que ELE enviou — e que nós recebemos —, e "received" é o que
     ele recebeu, ou seja, a nossa própria prospecção.

     Ler o campo errado aqui gravaria a mensagem que o vendedor mandou como se
     fosse evidência do cliente. É exatamente o que o método proíbe: atividade
     nossa virando avanço da decisão, e o IAD da carteira inteira subindo
     sozinho. Por isso a escolha é por autor, nunca por nome de campo. */
  function mensagensDaConversa(plano, nomeDoLead, meuNome) {
    const nosso = chave(meuNome || '');
    const dele = chave(nomeDoLead || '');
    const todas = [];
    const vistas = {};

    const juntar = function (de, texto, quando) {
      if (!texto || !String(texto).trim()) return;
      const autor = chave(de || '');
      const limpo = String(texto).replace(/\s+/g, ' ').trim();
      const assinatura = autor + '|' + limpo;
      if (vistas[assinatura]) return;              /* o mesmo texto em dois campos */
      vistas[assinatura] = true;
      todas.push({
        de: de || '',
        texto: limpo,
        quando: String(quando || ''),
        /* Quem falou decide tudo o que vem depois: só o lado do cliente vira
           evidência, e só o nosso lado explica o que a SDR perguntou. */
        nosso: !!(nosso && autor === nosso),
        dele: !!(dele && autor === dele)
      });
    };

    for (let i = 1; i <= 10; i++) {
      juntar(plano['repliedmessage' + i + 'from'], plano['repliedmessage' + i + 'text'],
        plano['repliedmessage' + i + 'sendatiso']);
      juntar(plano['message' + i + 'from'], plano['message' + i + 'text'],
        plano['message' + i + 'sendatiso']);
    }
    juntar(plano.lastsentmessagefrom, plano.lastsentmessagetext, plano.lastsentmessagesendatiso);

    /* Algumas ações entregam a resposta num campo solto, sem autor. Só valem
       os nomes que já dizem que é resposta DELE — "reply", "answer". Nomes
       ambíguos como "message" e "last_message" ficam de fora de propósito:
       podem ser a nossa própria mensagem, e o preço de errar aqui é alto. */
    if (!todas.some(function (m) { return !m.nosso; })) {
      const solta = primeiro(plano, ['reply', 'reply_text', 'last_reply', 'reply_message', 'answer']);
      if (solta) {
        juntar(nomeDoLead || '', solta,
          primeiro(plano, ['reply_date', 'replied_at', 'reply_send_at']));
      }
    }

    todas.sort(function (a, b) { return a.quando.localeCompare(b.quando); });
    return todas;
  }

  /* As que valem como evidência: nem nossas, nem de terceiro. */
  function mensagensDoCliente(conversa, temNomeDoLead) {
    return conversa.filter(function (m) {
      if (m.nosso) return false;
      if (temNomeDoLead && chave(m.de) && !m.dele) return false;   /* terceiro */
      return true;
    });
  }

  /* ---------- emprego atual ----------
     current_company costuma vir vazio em perfil recém-raspado — foi o que
     fez a importação nascer sem empresa. O emprego mais recente de verdade
     está em organization_1. */
  function empregoAtual(plano) {
    return {
      nome: primeiro(plano, ['company_name', 'company', 'current_company',
        'organization_name', 'organization_1']),
      cargo: primeiro(plano, ['organization_title_1', 'current_company_position',
        'position', 'title', 'job_title']),
      site: primeiro(plano, ['organization_website_1']),
      dominio: primeiro(plano, ['organization_domain_1']),
      cidade: primeiro(plano, ['organization_location_1']),
      setor: primeiro(plano, ['current_company_industry', 'industry']),
      descricao: primeiro(plano, ['organization_description_1']),
      fim: primeiro(plano, ['organization_end_1'])
    };
  }

  /* "2026.08" já passou → a pessoa saiu. Criar a conta a partir dela produz
     uma conta cujo único contato não trabalha mais lá. */
  function saidaNoPassado(fim) {
    const m = /^(\d{4})[.\-\/](\d{1,2})/.exec(String(fim || ''));
    if (!m) return '';
    const meses = Number(m[1]) * 12 + Number(m[2]);
    const hoje = new Date();
    if (meses >= hoje.getFullYear() * 12 + (hoje.getMonth() + 1)) return '';
    return String(Number(m[2])).padStart(2, '0') + '/' + m[1];
  }

  /* Campos personalizados cs_msg-*: a sequência que o vendedor escreveu para
     este prospect. O de "interesse" é o reenquadramento — insight pronto. */
  const ORDEM_INSIGHT = ['csmsginteresse', 'csmsgdesejo', 'csmsgatencao', 'csmsgacao'];

  function insightDaCampanha(plano) {
    for (let i = 0; i < ORDEM_INSIGHT.length; i++) {
      const v = plano[ORDEM_INSIGHT[i]];
      if (v && String(v).trim()) return String(v).replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  /* Aceita o objeto achatado (opção "flat objects", igual ao CSV) e o aninhado. */
  function normalizar(bruto) {
    const d = bruto && bruto.dados ? bruto.dados : (bruto || {});
    const plano = {};
    Object.keys(d).forEach(function (k) { plano[chave(k)] = d[k]; });

    const nome = primeiro(plano, ['full_name', 'fullname', 'name', 'profile_name']) ||
      [primeiro(plano, ['first_name', 'firstname', 'given_name']),
       primeiro(plano, ['last_name', 'lastname', 'family_name'])].filter(Boolean).join(' ');

    const emprego = empregoAtual(plano);
    const meuNome = primeiro(plano, ['my_full_name']);
    const conversa = mensagensDaConversa(plano, nome, meuNome);
    const dele = mensagensDoCliente(conversa, !!nome);
    const ultima = dele[dele.length - 1] || null;

    /* O headline do LinkedIn é vitrine, não cargo: "Gerente de Produção |
       Coordenador | Operações Industriais | ..." tem 199 caracteres. Só serve
       de cargo quando não há nada melhor, e mesmo assim cortado. */
    const headline = primeiro(plano, ['headline', 'original_headline']);
    const cargo = emprego.cargo || primeiro(plano, ['position', 'title', 'job_title']) ||
      headline.split(/\s*\|\s*/)[0].slice(0, 80);

    return {
      id: bruto && bruto.id ? bruto.id : primeiro(plano, ['id', 'member_id', 'profile_id', 'public_identifier']),
      recebidoEm: (bruto && bruto.recebidoEm) || '',

      /* pessoa */
      nome: nome,
      cargo: cargo,
      headline: headline,
      linkedin: primeiro(plano, ['profile_url', 'linkedin_url', 'url', 'profile_link', 'public_profile_url']),
      email: primeiro(plano, ['email', 'email_address', 'work_email', 'third_party_email_1']),
      emailTipo: primeiro(plano, ['email_type']),
      telefone: primeiro(plano, ['phone', 'phone_number', 'mobile', 'phone_1', 'phone_2']),
      local: primeiro(plano, ['location_name', 'location', 'address', 'city', 'country', 'region']),
      resumo: primeiro(plano, ['summary']),
      competencias: primeiro(plano, ['skills']),

      /* empresa onde trabalha (ou trabalhava) */
      empresa: emprego.nome,
      empresaSite: emprego.site,
      empresaDominio: emprego.dominio,
      empresaCidade: emprego.cidade,
      empresaSetor: emprego.setor,
      /* Matéria-prima para classificar o segmento sem sair para a internet:
         na maioria das vezes a descrição que o próprio LinkedIn traz basta. */
      empresaDescricao: String(emprego.descricao || '').replace(/\s+/g, ' ').slice(0, 600),
      oQueFazLa: String(primeiro(plano, ['position_description_1']) || '').replace(/\s+/g, ' ').slice(0, 300),
      saiuEm: saidaNoPassado(emprego.fim),

      /* conversa — a única camada que é evidência do cliente.
         A troca inteira vem junto: quem abre a oportunidade três semanas
         depois precisa da pergunta da SDR para entender a resposta. */
      resposta: ultima ? ultima.texto : '',
      respostaEm: ultima ? String(ultima.quando).slice(0, 10) : '',
      mensagensDele: dele.length,
      conversa: conversa.map(function (m) {
        return { de: m.de, texto: m.texto, quando: String(m.quando).slice(0, 10), nosso: m.nosso };
      }),

      /* relacionamento */
      grau: primeiro(plano, ['member_distance']),
      mutuos: primeiro(plano, ['mutual_count']),
      conexoes: primeiro(plano, ['connections_count']),
      conectadoEm: String(primeiro(plano, ['connected_at_iso'])).slice(0, 10),

      /* operação */
      campanha: primeiro(plano, ['campaign', 'campaign_name', 'list', 'list_name']),
      operador: meuNome,
      operadorEmail: primeiro(plano, ['my_email']),
      insight: insightDaCampanha(plano),

      bruto: d
    };
  }

  /* ---------- de qual empresa é esta prospecção ----------

     O IAD é multiempresa e a ponte não sabia disso: guardava tudo num balde só,
     e a primeira empresa que mandasse buscar levava os leads de todas. Agora o
     identificador da empresa vai na URL, e o app pede sempre o da empresa de
     quem está logado — não há campo para digitar, justamente para não haver
     como digitar o da empresa errada. */
  /* Qual empresa está lendo a ponte — e a resposta tem de ser inequívoca.

     tenantDeTrabalho() serve para decidir onde um registro NOVO nasce, e para
     isso ele tem um palpite razoável: se o administrador está vendo "Todas as
     empresas", usa a primeira da lista. Aqui esse palpite é veneno. Ler a
     ponte com a empresa errada devolve o balde de outra pessoa — ou, como
     aconteceu, o balde de uma empresa morta, e o app diz "nenhuma resposta
     nova" com toda a convicção enquanto os leads estão ali do lado.

     Então: administrador em "Todas" não tem empresa definida, e a leitura
     recusa em vez de chutar. */
  function empresaAtual() {
    const Store = global.IADStore;
    if (!Store || !Store.contexto) return '';
    const ctx = Store.contexto();
    if (!ctx.usuario) return '';
    if (ctx.admin) {
      const escolhida = ctx.filtros && ctx.filtros.tenant;
      return (escolhida && escolhida !== 'todas') ? escolhida : '';
    }
    return ctx.tenantId || '';
  }

  /* O nome da empresa que está lendo, para as mensagens dizerem de quem é o
     balde. "Nenhuma resposta nova" sem dizer de quem é a metade da informação. */
  function nomeDaEmpresaAtual() {
    const Store = global.IADStore;
    const id = empresaAtual();
    if (!id || !Store) return '';
    const t = (Store.obter().tenants || []).filter(function (x) { return x.id === id; })[0];
    return (t && t.nome) || id;
  }

  /* O endereço que a SDR cola no Linked Helper. Precisa da chave de escrita,
     que NÃO é a que fica no app: são duas de propósito, e vazar uma não expõe
     a outra. Por isso a chave de escrita entra aqui como parâmetro — ela vive
     no Cloudflare e na cabeça de quem administra, nunca guardada no navegador. */
  function enderecoDeEntrada(chaveDeEscrita, empresaId) {
    const c = config();
    if (!c.url) return '';
    const base = c.url.replace(/[?#].*$/, '');
    const partes = [];
    if (chaveDeEscrita) partes.push('k=' + encodeURIComponent(chaveDeEscrita));
    if (empresaId) partes.push('e=' + encodeURIComponent(empresaId));
    return base + (partes.length ? '?' + partes.join('&') : '');
  }

  function requisitar(metodo, corpo) {
    const c = config();
    if (!c.url) return Promise.reject(new Error('Configure o endereço da ponte em Configuração → Linked Helper.'));
    if (!empresaAtual()) {
      return Promise.reject(new Error('Escolha uma empresa antes de buscar. Cada empresa tem o próprio ' +
        'balde na ponte, e com o recorte em "Todas as empresas" eu não sei qual ler — ' +
        'ler o balde errado devolveria a prospecção de outra pessoa.'));
    }
    const separador = c.url.indexOf('?') === -1 ? '?' : '&';
    const empresa = empresaAtual();
    const endereco = c.url +
      (c.token ? separador + 'token=' + encodeURIComponent(c.token) : '') +
      (empresa ? (c.token ? '&' : separador) + 'e=' + encodeURIComponent(empresa) : '');

    return fetch(endereco, {
      method: metodo,
      headers: corpo ? { 'content-type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined
    }).then(function (resposta) {
      if (resposta.status === 401) throw new Error('A ponte recusou a chave de leitura.');
      if (!resposta.ok) throw new Error('A ponte respondeu ' + resposta.status + '.');
      return resposta.json();
    });
  }

  function buscar() {
    return requisitar('GET').then(function (corpo) {
      const lista = Array.isArray(corpo) ? corpo : (corpo.itens || corpo.items || corpo.data || []);
      return lista.map(normalizar).filter(function (i) { return i.nome || i.empresa || i.linkedin; });
    });
  }

  function marcarProcessados(ids) {
    if (!ids || !ids.length) return Promise.resolve();
    return requisitar('POST', { marcar: ids }).catch(function (e) {
      console.warn('Não foi possível marcar como processado na ponte:', e);
    });
  }

  global.IADIntegracoes = { config, salvarConfig, configurada, buscar, marcarProcessados,
    normalizar, empresaAtual, nomeDaEmpresaAtual, enderecoDeEntrada };
})(window);
