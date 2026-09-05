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

   No Linked Helper, no campo Webhook URL:
     https://ponte-iad.SEU-SUBDOMINIO.workers.dev/?k=CHAVE_ESCRITA
   No IAD CRM, em ⚙︎ Dados → Linked Helper:
     endereço  https://ponte-iad.SEU-SUBDOMINIO.workers.dev/
     chave     CHAVE_LEITURA
*/

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

      await Promise.all(lista.map((item) => {
        const id = crypto.randomUUID();
        return ambiente.LEADS.put(
          'lead:' + id,
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
      const chaves = await ambiente.LEADS.list({ prefix: 'lead:', limit: 100 });
      const itens = await Promise.all(chaves.keys.map(async (k) => {
        const bruto = await ambiente.LEADS.get(k.name);
        return bruto ? JSON.parse(bruto) : null;
      }));
      return json({ itens: itens.filter(Boolean) });
    }

    /* 3. Baixa: o app avisa o que já virou oportunidade, para não repetir. */
    if (requisicao.method === 'POST') {
      const corpo = await requisicao.json().catch(() => ({}));
      const ids = Array.isArray(corpo.marcar) ? corpo.marcar : [];
      await Promise.all(ids.map((id) => ambiente.LEADS.delete('lead:' + id)));
      return json({ ok: true, removidos: ids.length });
    }

    return json({ erro: 'método não suportado' }, 405);
  }
};
