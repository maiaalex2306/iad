/* Supabase Edge Function — whatsapp
   ------------------------------------------------------------------
   Recebe os webhooks da Cloud API e grava as mensagens no banco.

   Um PWA não recebe webhook: webhook precisa de um endereço público que fique
   de pé o tempo todo, e o IAD roda dentro do navegador. Esta função é esse
   endereço — o mesmo papel que o Worker faz para o Linked Helper, só que aqui
   dá para usar o Postgres direto, com o isolamento por empresa que já existe.

   Ela trata três eventos, e os três importam:

     messages            o cliente escreveu
     smb_message_echoes  o vendedor escreveu, do celular dele
     history             a carga dos 6 meses, enviada UMA VEZ SÓ

   O `history` é o motivo de a ordem dos passos ser obrigatória. Ele chega nos
   minutos seguintes à conexão do número e não é reenviado. Função publicada e
   testada ANTES; número por último. Ver nuvem/WHATSAPP.md.

   A parte mais importante desta função não é gravar: é conferir a assinatura.
   Ela escreve com a chave de serviço, que ignora RLS. Sem a conferência,
   quem descobrisse o endereço gravaria mensagem falsa no CRM de qualquer
   cliente — e mensagem falsa vira evidência falsa, que vira nota errada.
*/

const URL_SUPABASE = Deno.env.get('SUPABASE_URL') || '';
/* Mesma ordem de procura do convite: o nome IAD_* vem primeiro porque é o
   único que o administrador consegue definir à mão — o painel do Supabase
   recusa segredos começando em SUPABASE_. */
const SERVICE = Deno.env.get('IAD_CHAVE_SECRETA') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

/* Os dois segredos da Meta. O token de verificação é inventado por você e
   repetido no painel do aplicativo; o segredo do app é o que assina cada
   entrega. Nenhum dos dois entra no repositório nem no navegador. */
const TOKEN_VERIFICACAO = Deno.env.get('WA_TOKEN_VERIFICACAO') || '';
const SEGREDO_APP = Deno.env.get('WA_SEGREDO_APP') || '';

function texto(corpo: string, status = 200): Response {
  return new Response(corpo, { status: status, headers: { 'content-type': 'text/plain' } });
}

/* ---------------- assinatura ----------------
   A Meta manda X-Hub-Signature-256: sha256=<hmac do corpo cru com o segredo>.
   Precisa ser o corpo CRU, byte a byte — reserializar o JSON muda espaços e a
   assinatura deixa de bater. */
async function assinaturaConfere(cru: string, cabecalho: string): Promise<boolean> {
  if (!SEGREDO_APP) return false;
  const enviada = String(cabecalho || '').replace(/^sha256=/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(enviada)) return false;

  const chave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SEGREDO_APP),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(cru))
  );
  const calculada = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  /* Comparação de tempo constante. Comparar com === vaza, pelo tempo de
     resposta, quantos caracteres iniciais o atacante acertou. */
  if (calculada.length !== enviada.length) return false;
  let diferenca = 0;
  for (let i = 0; i < calculada.length; i++) {
    diferenca |= calculada.charCodeAt(i) ^ enviada.charCodeAt(i);
  }
  return diferenca === 0;
}

/* ---------------- banco ---------------- */
async function consultar(caminho: string): Promise<unknown[]> {
  const r = await fetch(URL_SUPABASE + '/rest/v1/' + caminho, {
    headers: { apikey: SERVICE, authorization: 'Bearer ' + SERVICE }
  });
  if (!r.ok) return [];
  return await r.json().catch(() => []);
}

/* upsert com resolution=ignore-duplicates: a Meta reentrega quando não recebe
   200 rápido, e o wamid é a chave primária. Reentrega vira no-op, não erro. */
async function gravar(linhas: Record<string, unknown>[]): Promise<number> {
  if (!linhas.length) return 0;
  const r = await fetch(URL_SUPABASE + '/rest/v1/mensagens_whatsapp', {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      authorization: 'Bearer ' + SERVICE,
      'content-type': 'application/json',
      prefer: 'resolution=ignore-duplicates,return=minimal'
    },
    body: JSON.stringify(linhas)
  });
  if (!r.ok) {
    console.error('gravar falhou', r.status, await r.text().catch(() => ''));
    return 0;
  }
  return linhas.length;
}

/* ---------------- normalização ---------------- */
function soDigitos(v: unknown): string {
  return String(v || '').replace(/\D/g, '');
}

/* Os últimos 8 dígitos. É o que casa "+55 19 99123-4567", "19991234567" e
   "019 9123-4567" sem inventar regra de DDD nem de nono dígito. */
function curto(telefone: string): string {
  return telefone.length > 8 ? telefone.slice(-8) : telefone;
}

/* A Meta manda o carimbo em segundos, como texto. */
function quando(ts: unknown): string {
  const n = Number(ts);
  if (!isFinite(n) || n <= 0) return new Date().toISOString();
  return new Date(n * 1000).toISOString();
}

/* O texto de cada tipo de mensagem. Imagem, áudio e documento entram com o id
   da mídia e a legenda: baixar o arquivo é outro assunto, e gravar meia coisa
   é melhor do que perder a mensagem inteira por causa do anexo. */
function conteudo(m: Record<string, unknown>): { tipo: string; texto: string; midia: string } {
  const tipo = String(m.type || 'text');
  const parte = (m as Record<string, Record<string, unknown>>)[tipo] || {};

  if (tipo === 'text') return { tipo, texto: String(parte.body || ''), midia: '' };
  if (tipo === 'button') return { tipo, texto: String(parte.text || ''), midia: '' };
  if (tipo === 'reaction') return { tipo, texto: String(parte.emoji || ''), midia: '' };
  if (tipo === 'location') {
    const nome = String(parte.name || parte.address || '');
    return { tipo, texto: nome || (parte.latitude + ', ' + parte.longitude), midia: '' };
  }
  if (tipo === 'interactive') {
    const alvo = (parte.button_reply || parte.list_reply || {}) as Record<string, unknown>;
    return { tipo, texto: String(alvo.title || ''), midia: '' };
  }
  return {
    tipo,
    texto: String(parte.caption || parte.filename || ''),
    midia: String(parte.id || '')
  };
}

function linha(
  m: Record<string, unknown>,
  tenantId: string,
  phoneNumberId: string,
  direcao: 'entrada' | 'saida',
  origem: 'api' | 'celular' | 'historico',
  nomes: Record<string, string>
): Record<string, unknown> | null {
  const id = String(m.id || '');
  if (!id) return null;

  /* O outro lado da conversa é sempre quem não é a gente. Numa mensagem de
     entrada isso é o `from`; numa de saída, o `to` — e no histórico as duas
     formas aparecem no mesmo lote. */
  const de = soDigitos(m.from);
  const para = soDigitos(m.to || (Array.isArray(m.recipients) ? m.recipients[0] : ''));
  const outro = direcao === 'entrada' ? de : (para || de);
  if (!outro) return null;

  const c = conteudo(m);
  return {
    id: id,
    tenant_id: tenantId,
    phone_number_id: phoneNumberId,
    telefone: outro,
    telefone_curto: curto(outro),
    nome_exibicao: nomes[outro] || '',
    direcao: direcao,
    origem: origem,
    tipo: c.tipo,
    texto: c.texto,
    midia_id: c.midia,
    enviada_em: quando(m.timestamp),
    lida: direcao === 'saida'
  };
}

/* De quem é este número. Número desconhecido é descartado, não adivinhado:
   gravar no tenant errado é pior do que não gravar. */
async function donoDoNumero(phoneNumberId: string): Promise<string> {
  if (!phoneNumberId) return '';
  const achados = await consultar(
    'whatsapp_numeros?phone_number_id=eq.' + encodeURIComponent(phoneNumberId) +
    '&ativo=is.true&select=tenant_id&limit=1'
  ) as Record<string, string>[];
  return achados.length ? String(achados[0].tenant_id || '') : '';
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  /* A verificação do painel da Meta: um GET com o token que você inventou.
     Devolver o challenge em texto puro é o que liga o webhook. */
  if (req.method === 'GET') {
    const modo = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const desafio = url.searchParams.get('hub.challenge') || '';
    if (modo === 'subscribe' && TOKEN_VERIFICACAO && token === TOKEN_VERIFICACAO) {
      return texto(desafio);
    }
    return texto('nao', 403);
  }

  if (req.method !== 'POST') return texto('metodo', 405);
  if (!URL_SUPABASE || !SERVICE) return texto('sem banco', 500);

  const cru = await req.text();
  if (!await assinaturaConfere(cru, req.headers.get('x-hub-signature-256') || '')) {
    return texto('assinatura', 401);
  }

  let corpo: Record<string, unknown>;
  try { corpo = JSON.parse(cru); } catch (e) { return texto('json', 400); }

  const linhas: Record<string, unknown>[] = [];
  const entradas = Array.isArray(corpo.entry) ? corpo.entry : [];

  for (const entrada of entradas) {
    const mudancas = Array.isArray((entrada as Record<string, unknown>).changes)
      ? (entrada as Record<string, unknown[]>).changes : [];

    for (const mudanca of mudancas) {
      const campo = String((mudanca as Record<string, unknown>).field || '');
      const valor = ((mudanca as Record<string, unknown>).value || {}) as Record<string, unknown>;
      const meta = (valor.metadata || {}) as Record<string, unknown>;
      const phoneNumberId = String(meta.phone_number_id || '');

      const tenantId = await donoDoNumero(phoneNumberId);
      if (!tenantId) continue;

      const nosso = soDigitos(meta.display_phone_number);

      /* O nome que a pessoa usa no WhatsApp vem separado das mensagens. */
      const nomes: Record<string, string> = {};
      (Array.isArray(valor.contacts) ? valor.contacts : []).forEach((c) => {
        const ct = c as Record<string, unknown>;
        const perfil = (ct.profile || {}) as Record<string, unknown>;
        const tel = soDigitos(ct.wa_id);
        if (tel) nomes[tel] = String(perfil.name || '');
      });

      /* 1. O cliente escreveu. */
      if (campo === 'messages') {
        (Array.isArray(valor.messages) ? valor.messages : []).forEach((m) => {
          const l = linha(m as Record<string, unknown>, tenantId, phoneNumberId,
            'entrada', 'api', nomes);
          if (l) linhas.push(l);
        });
      }

      /* 2. O vendedor escreveu, do celular dele. Sem isto o CRM veria metade
         do diálogo: o que o cliente disse, sem o que foi perguntado. */
      if (campo === 'smb_message_echoes') {
        (Array.isArray(valor.message_echoes) ? valor.message_echoes : []).forEach((m) => {
          const l = linha(m as Record<string, unknown>, tenantId, phoneNumberId,
            'saida', 'celular', nomes);
          if (l) linhas.push(l);
        });
      }

      /* 3. A carga dos 6 meses. Chega uma vez só e traz as duas direções, cada
         fio numa thread. Entra marcada como histórico: o app não conta estas
         como não lidas nem cria tarefa com elas — quem escolhe o que importa é
         o vendedor. */
      if (campo === 'history') {
        (Array.isArray(valor.history) ? valor.history : []).forEach((h) => {
          const bloco = h as Record<string, unknown>;
          (Array.isArray(bloco.threads) ? bloco.threads : []).forEach((t) => {
            const fio = t as Record<string, unknown>;
            (Array.isArray(fio.messages) ? fio.messages : []).forEach((m) => {
              const msg = m as Record<string, unknown>;
              /* No histórico, quem mandou diz a direção: se o `from` é o nosso
                 próprio número, a mensagem é nossa. */
              const daCasa = soDigitos(msg.from) === nosso && !!nosso;
              const l = linha(msg, tenantId, phoneNumberId,
                daCasa ? 'saida' : 'entrada', 'historico', nomes);
              if (l) linhas.push(l);
            });
          });
        });
      }
    }
  }

  const gravadas = await gravar(linhas);
  /* 200 sempre que a assinatura bateu, mesmo sem nada a gravar. Status de erro
     faz a Meta reentregar em laço, e reentregar não conserta payload que a
     gente simplesmente não trata. */
  console.log('whatsapp: recebidas ' + linhas.length + ', gravadas ' + gravadas);
  return texto('ok');
});
