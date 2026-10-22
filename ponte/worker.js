/* Ponte entre o Linked Helper e o IAD CRM — Cloudflare Worker.

   Por que ela existe: o Linked Helper entrega a resposta do prospect por webhook,
   e webhook precisa de um endereço público. O IAD CRM roda no navegador e não
   tem endereço. Esta ponte fica no meio: recebe o POST do Linked Helper, guarda
   por 30 dias e entrega ao app quando ele busca.

   São duas chaves diferentes de propósito: a de escrita vai na URL colada dentro
   do Linked Helper; a de leitura fica no app. Vazar uma não expõe a outra.

   Como publicar:
     1. npm create cloudflare@latest ponte-iad -- --type hello-world
     2. substitua src/index.js por este arquivo
     3. crie o KV:            npx wrangler kv namespace create LEADS
        e cole o id em wrangler.toml (veja wrangler.toml.exemplo ao lado)
     4. defina as chaves:     npx wrangler secret put CHAVE_ESCRITA
                              npx wrangler secret put CHAVE_LEITURA
     5. npx wrangler deploy

   ---------- uma empresa não vê a prospecção da outra ----------

   O IAD é multiempresa: cada uma tem carteira separada e ninguém de uma
   enxerga a da outra. A ponte não sabia disso — guardava tudo num balde só,
   e a primeira empresa que mandasse buscar levava os leads de todas.

   Agora o endereço carrega o identificador da empresa no parâmetro "e", e as
   entregas ficam guardadas embaixo dele. Ler exige o mesmo identificador, e o
   app só pede o da empresa de quem está logado.

   Isso é isolamento operacional, não criptográfico: quem tiver a chave de
   leitura E souber o identificador de outra empresa consegue ler o balde dela.
   Como o identificador é um UUID que só aparece para quem administra, e a
   chave de leitura já é de dentro do sistema, o risco real que isto elimina é
   o que acontece sozinho — importar por engano a prospecção do vizinho.

   No Linked Helper, no campo Webhook URL:
     https://ponte-iad.SEU-SUBDOMINIO.workers.dev/?k=CHAVE_ESCRITA&e=IDENTIFICADOR_DA_EMPRESA
   No IAD CRM, em ⚙︎ Dados → Linked Helper:
     endereço  https://ponte-iad.SEU-SUBDOMINIO.workers.dev/
     chave     CHAVE_LEITURA
   (o identificador da empresa o app preenche sozinho)

   ---------- a ponte também conta quem abriu o documento ----------

   O IAD não hospeda arquivo nenhum, e não deve: a proposta está no Drive do
   vendedor, onde ele já a guarda. O que faltava não era hospedagem — era
   saber QUANDO o cliente abriu, que é o sinal de compra mais forte que existe
   em B2B e o único capaz de revelar o comitê que ninguém apresentou.

   Então a ponte guarda um desvio, não o arquivo:

     POST /links?token=CHAVE_LEITURA&e=EMPRESA   {destino, titulo, contatoId,
                                                  oportunidadeId}
          → devolve {id, url}. A url é o endereço curto para mandar ao cliente.

     GET  /r/ID                                   público, sem chave nenhuma.
          Anota a passagem e redireciona para o destino. Quem clica é o
          cliente, e cliente não tem credencial.

     GET  /aberturas?token=…&e=…                  o app busca o que chegou.
     POST /aberturas?token=…&e=…  {marcar:[ids]}  e dá baixa no que virou sinal.

   O identificador do link é aleatório e NÃO carrega o identificador da
   empresa: o link vai para fora, e espalhar o UUID da empresa desmontaria por
   fora o isolamento que este arquivo constrói por dentro.

   Nenhuma abertura guarda IP ou qualquer coisa que identifique a máquina.
   Sabemos de quem é o link porque nós mesmos o emitimos para uma pessoa;
   coletar mais do que isso seria dado pessoal novo sem necessidade.
*/

/* O identificador vem da URL, que é lugar de dado público e de dado inventado.
   Sanear aqui é o que impede alguém de escrever "../" ou um nome de mil
   caracteres e bagunçar as chaves do KV. Vazio quer dizer o balde antigo, o
   que mantém funcionando quem já publicou a ponte antes desta mudança. */
function balde(url) {
  const bruto = String(url.searchParams.get('e') || '').trim();
  const limpo = bruto.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  return limpo;
}

/* Chaves separadas por balde. O prefixo diferente — "e:" contra "lead:" — é
   de propósito: assim a listagem antiga não enxerga as novas, e uma ponte
   recém-atualizada não entrega a uma empresa o que ainda não é dela. */
function chaveDoLead(bucket, id) {
  return bucket ? 'e:' + bucket + ':lead:' + id : 'lead:' + id;
}

function prefixoDoBalde(bucket) {
  return bucket ? 'e:' + bucket + ':lead:' : 'lead:';
}

/* ---------- links rastreados ----------

   O IAD não hospeda documento nenhum: a proposta está no Drive do vendedor,
   no anexo do e-mail, onde ele quiser. O que faltava não era hospedagem — era
   saber QUANDO o cliente abriu. Então a ponte não guarda o arquivo: guarda um
   desvio. O vendedor manda o link da ponte, a ponte anota a passagem e joga a
   pessoa no endereço de verdade.

   O identificador do link NÃO carrega o identificador da empresa, e isto é
   deliberado. O link vai para fora — para o prospect, para a caixa de e-mail
   dele, para quem ele encaminhar. O UUID da empresa é o que separa um balde
   do outro nesta ponte; espalhá-lo por aí desmontaria por fora o isolamento
   que o resto do arquivo constrói. Então o identificador é aleatório e a
   empresa mora DENTRO do valor, onde só a ponte lê.

   O que NÃO é guardado, de propósito: IP e qualquer coisa que identifique a
   máquina. Sabemos de quem é o link porque nós mesmos o emitimos para uma
   pessoa; não precisamos coletar nada além disso, e coletar seria dado
   pessoal novo sem necessidade nenhuma. */
function chaveDoLink(id) { return 'link:' + id; }

function chaveDaAbertura(bucket, id) {
  return bucket ? 'e:' + bucket + ':abertura:' + id : 'abertura:' + id;
}

function prefixoDasAberturas(bucket) {
  return bucket ? 'e:' + bucket + ':abertura:' : 'abertura:';
}

/* 22 caracteres de alfabeto seguro para URL: curto o bastante para caber numa
   mensagem de WhatsApp sem virar duas linhas, e longo o bastante para não ser
   adivinhado por quem tentar. */
function novoIdDeLink() {
  const alfabeto = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(22));
  let saida = '';
  for (const b of bytes) saida += alfabeto[b % alfabeto.length];
  return saida;
}

/* O verificador de links da caixa de e-mail corporativa abre tudo o que passa
   por ela, antes de a pessoa ver. Contar isso como abertura faria o app
   anunciar "é a hora" por causa de um antivírus — o jeito mais rápido de
   ensinar alguém a não confiar no alerta.

   Não dá para reconhecer todos, e não é o objetivo: os que se anunciam saem
   daqui marcados, e o app não os transforma em sinal. O que escapar vira um
   sinal a mais, que é bem menos grave do que perder as aberturas de verdade
   por excesso de zelo. */
const ROBOS = /bot|crawler|spider|preview|scanner|monitor|curl|wget|python-requests|okhttp|headless|slackbot|whatsapp|facebookexternalhit|bingpreview|proofpoint|mimecast|barracuda|symantec|forcepoint/i;

function pareceRobo(requisicao) {
  const ua = String(requisicao.headers.get('user-agent') || '');
  if (!ua) return true;             /* sem user-agent nenhum não é navegador */
  return ROBOS.test(ua);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

const json = (dados, status) => new Response(JSON.stringify(dados), {
  status: status || 200,
  headers: { 'content-type': 'application/json; charset=utf-8', ...CORS }
});

/* Chaves por empresa, e por que elas não são secrets separados.

   Até aqui o par de chaves era do WORKER: as duas empresas que passam por
   esta ponte usavam a mesma chave de escrita e a mesma de leitura, e o que
   separava uma da outra era só o `e=` na URL. Quem tivesse a chave de leitura
   de uma conseguia ler o balde da outra trocando o identificador — o
   isolamento existia por combinação, não por credencial.

   Um secret por empresa (CHAVE_ESCRITA_ACP, CHAVE_LEITURA_ACP, …) obrigaria a
   mexer no worker a cada empresa nova, que é exatamente a manutenção que
   ninguém faz. Um secret só, com um mapa dentro, resolve as duas coisas: cada
   empresa ganha o próprio par e criar a próxima é editar um JSON.

   CHAVES_POR_EMPRESA, no Cloudflare, é assim:

     {
       "3325b557-cdb3-4ea9-b82d-aae86ff04fd4": {
         "escrita": "...", "leitura": "..."
       },
       "26506113-....": { "escrita": "...", "leitura": "..." }
     }

   Empresa sem entrada no mapa continua valendo as chaves antigas — é o que
   deixa a troca acontecer sem derrubar quem já estava entregando, e é o que
   mantém o balde antigo (sem `e=`) alcançável para resgate. */
function chavesDoBalde(bucket, ambiente) {
  let mapa = {};
  try { mapa = JSON.parse(ambiente.CHAVES_POR_EMPRESA || '{}'); } catch (e) { mapa = {}; }
  const dela = (bucket && mapa[bucket]) || null;
  return {
    escrita: (dela && dela.escrita) || ambiente.CHAVE_ESCRITA,
    leitura: (dela && dela.leitura) || ambiente.CHAVE_LEITURA
  };
}

export default {
  async fetch(requisicao, ambiente) {
    const url = new URL(requisicao.url);

    if (requisicao.method === 'OPTIONS') return new Response(null, { headers: CORS });

    /* 0. O desvio. Público, sem chave nenhuma — quem clica é o cliente, e o
          cliente não tem credencial. É a única rota assim, e por isso ela não
          lê nem escreve nada além da própria passagem. */
    const desvio = url.pathname.match(/^\/r\/([A-Za-z0-9]{8,64})$/);
    if (desvio && (requisicao.method === 'GET' || requisicao.method === 'HEAD')) {
      const bruto = await ambiente.LEADS.get(chaveDoLink(desvio[1]));
      if (!bruto) return new Response('Link não encontrado ou expirado.', { status: 404 });
      const link = JSON.parse(bruto);

      /* HEAD é conferência de link, não leitura: responder o desvio sem
         registrar nada é o certo. */
      if (requisicao.method === 'GET') {
        const id = crypto.randomUUID();
        await ambiente.LEADS.put(
          chaveDaAbertura(link.empresa, id),
          JSON.stringify({
            id: id, linkId: link.id, titulo: link.titulo || '',
            contatoId: link.contatoId || '', oportunidadeId: link.oportunidadeId || '',
            quando: new Date().toISOString(),
            robo: pareceRobo(requisicao)
          }),
          { expirationTtl: 60 * 60 * 24 * 30 }
        );
      }

      /* 302 e não 301: o navegador guarda o permanente para sempre e as
         aberturas seguintes nunca mais chegariam aqui — perderíamos
         exatamente a informação de que a pessoa VOLTOU ao documento, que é o
         sinal mais forte da lista. */
      return new Response(null, { status: 302, headers: { Location: link.destino, 'Cache-Control': 'no-store' } });
    }

    /* 1. Entrada: o Linked Helper posta aqui, com a chave de escrita na URL. */
    if (requisicao.method === 'POST' && url.searchParams.get('k')) {
      const esperada = chavesDoBalde(balde(url), ambiente).escrita;
      if (url.searchParams.get('k') !== esperada) return json({ erro: 'chave de escrita inválida' }, 401);

      /* Lemos como texto primeiro: se vier algo que não é JSON, guardamos o
         conteúdo cru em vez de perder a entrega. */
      const texto = await requisicao.text();
      let corpo;
      try { corpo = JSON.parse(texto); } catch (e) { corpo = { conteudo_bruto: texto }; }

      /* O Linked Helper manda ora um objeto, ora um array, conforme a ação. */
      const lista = Array.isArray(corpo) ? corpo : (corpo.data || corpo.items || [corpo]);
      if (!lista.length) return json({ ok: true, recebidos: 0 });

      const bucket = balde(url);
      await Promise.all(lista.map((item) => {
        const id = crypto.randomUUID();
        return ambiente.LEADS.put(
          chaveDoLead(bucket, id),
          JSON.stringify({ id, recebidoEm: new Date().toISOString(), dados: item }),
          { expirationTtl: 60 * 60 * 24 * 30 }
        );
      }));

      return json({ ok: true, recebidos: lista.length });
    }

    /* Daqui para baixo é o app, que usa a chave de leitura. */
    const token = url.searchParams.get('token') || requisicao.headers.get('x-token');
    if (token !== chavesDoBalde(balde(url), ambiente).leitura) return json({ erro: 'não autorizado' }, 401);

    /* 1-B. Emitir um link rastreado.

       Autorizado pela chave de LEITURA porque é ela que o app carrega — a de
       escrita mora dentro da campanha do Linked Helper e não passa por aqui.
       Quem tem a de leitura já enxerga o balde inteiro da empresa, então isto
       não abre porta nova para ler nada.

       O que ela passa a permitir é criar um desvio no domínio da ponte, e
       isso merece ser dito em voz alta: é um redirecionador, e redirecionador
       serve para disfarçar destino. O destino é limitado a http(s) e quem
       emite já é de dentro — a mesma pessoa poderia mandar o link ruim
       direto, sem a ponte. O que a ponte acrescenta é o disfarce do domínio,
       e o domínio aqui é um `workers.dev`, que não empresta confiança a
       ninguém. */
    if (url.pathname === '/links' && requisicao.method === 'POST') {
      const corpo = await requisicao.json().catch(() => ({}));
      const destino = String(corpo.destino || '').trim();
      if (!/^https?:\/\//i.test(destino)) return json({ erro: 'destino precisa ser um endereço http ou https' }, 400);
      if (destino.length > 2000) return json({ erro: 'destino longo demais' }, 400);

      const id = novoIdDeLink();
      const link = {
        id: id, empresa: balde(url), destino: destino,
        titulo: String(corpo.titulo || '').slice(0, 200),
        contatoId: String(corpo.contatoId || '').slice(0, 64),
        oportunidadeId: String(corpo.oportunidadeId || '').slice(0, 64),
        criadoEm: new Date().toISOString()
      };
      /* 90 dias, e não os 30 dos leads: proposta fica em cima da mesa do
         cliente por mais tempo do que uma resposta de campanha, e link morto
         no meio da negociação é o app estragando a venda que ele existe para
         ajudar. */
      await ambiente.LEADS.put(chaveDoLink(id), JSON.stringify(link), { expirationTtl: 60 * 60 * 24 * 90 });

      return json({ ok: true, id: id, url: url.origin + '/r/' + id });
    }

    /* 1-C. As aberturas que ainda não viraram sinal. Mesmo desenho dos leads:
            o app busca, transforma, e avisa o que já processou. */
    if (url.pathname === '/aberturas' && requisicao.method === 'GET') {
      const prefixo = prefixoDasAberturas(balde(url));
      const chaves = [];
      let cursor;
      do {
        const pagina = await ambiente.LEADS.list({ prefix: prefixo, limit: 1000, cursor });
        chaves.push(...pagina.keys);
        cursor = pagina.list_complete ? null : pagina.cursor;
      } while (cursor && chaves.length < 500);

      const itens = await Promise.all(chaves.slice(0, 500).map(async (k) => {
        const bruto = await ambiente.LEADS.get(k.name);
        return bruto ? JSON.parse(bruto) : null;
      }));
      return json({ itens: itens.filter(Boolean) });
    }

    if (url.pathname === '/aberturas' && requisicao.method === 'POST') {
      const corpo = await requisicao.json().catch(() => ({}));
      const ids = Array.isArray(corpo.marcar) ? corpo.marcar : [];
      const bucket = balde(url);
      await Promise.all(ids.map((id) => ambiente.LEADS.delete(chaveDaAbertura(bucket, id))));
      return json({ ok: true, removidos: ids.length });
    }

    /* 2. Leitura: o app busca o que chegou e ainda não foi processado. */
    if (requisicao.method === 'GET') {
      /* A listagem do KV vem em páginas de 1000 no máximo e devolve um
         cursor quando sobra. Sem seguir o cursor, uma campanha que acumulou
         mais leads do que cabe numa página some do app sem erro nenhum —
         ninguém descobre que faltou, porque a resposta é 200 e a lista
         parece completa. Teto de 500 para a resposta não ficar gigante. */
      const prefixo = prefixoDoBalde(balde(url));
      const chaves = [];
      let cursor;
      do {
        const pagina = await ambiente.LEADS.list({ prefix: prefixo, limit: 1000, cursor });
        chaves.push(...pagina.keys);
        cursor = pagina.list_complete ? null : pagina.cursor;
      } while (cursor && chaves.length < 500);

      const itens = await Promise.all(chaves.slice(0, 500).map(async (k) => {
        const bruto = await ambiente.LEADS.get(k.name);
        return bruto ? JSON.parse(bruto) : null;
      }));
      return json({ itens: itens.filter(Boolean) });
    }

    /* 3. Baixa: o app avisa o que já virou oportunidade, para não repetir. */
    if (requisicao.method === 'POST') {
      const corpo = await requisicao.json().catch(() => ({}));
      const ids = Array.isArray(corpo.marcar) ? corpo.marcar : [];
      const bucket = balde(url);
      await Promise.all(ids.map((id) => ambiente.LEADS.delete(chaveDoLead(bucket, id))));
      return json({ ok: true, removidos: ids.length });
    }

    return json({ erro: 'método não suportado' }, 405);
  }
};
