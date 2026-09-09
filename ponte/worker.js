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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

const json = (dados, status) => new Response(JSON.stringify(dados), {
  status: status || 200,
  headers: { 'content-type': 'application/json; charset=utf-8', ...CORS }
});

export default {
  async fetch(requisicao, ambiente) {
    const url = new URL(requisicao.url);

    if (requisicao.method === 'OPTIONS') return new Response(null, { headers: CORS });

    /* 1. Entrada: o Linked Helper posta aqui, com a chave de escrita na URL. */
    if (requisicao.method === 'POST' && url.searchParams.get('k')) {
      if (url.searchParams.get('k') !== ambiente.CHAVE_ESCRITA) return json({ erro: 'chave de escrita inválida' }, 401);

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
    if (token !== ambiente.CHAVE_LEITURA) return json({ erro: 'não autorizado' }, 401);

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
