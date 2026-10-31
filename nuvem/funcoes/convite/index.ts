/* Supabase Edge Function — convite
   ------------------------------------------------------------------
   Manda o convite de acesso por e-mail, de verdade, sem programa externo.

   Como o remetente vira o endereço do administrador: quem envia é o próprio
   Supabase, e o SMTP dele é configurado no painel com a conta Gmail do
   administrador e uma Senha de app do Google. Sem essa autenticação, escrever
   o endereço no remetente seria falsificação — o Gmail recusa ou joga em spam,
   porque SPF e DKIM não batem. Ver nuvem/EMAIL.md.

   Por que esta função existe e não é chamada direta do navegador: convidar é
   uma operação de administração do GoTrue, e exige a chave service_role, que
   ignora todas as políticas RLS. Ela é segredo desta função e não pode
   aparecer em lugar nenhum do aplicativo.

   Regra que sustenta tudo: quem chama tem de ser administrador. A função
   confere isso no banco, com a própria service_role, antes de qualquer envio.
   Sem essa checagem, qualquer usuário logado criaria contas no sistema.
*/

/* O Supabase trocou o formato das chaves. As antigas eram JWT (anon e
   service_role); as novas são `sb_publishable_...` e `sb_secret_...`. Nem tudo
   no projeto virou de uma vez: o PostgREST ainda aceita a chave antiga, mas o
   GoTrue — que é quem convida — passou a exigir a nova, e recusa a antiga com
   "The apikey header matched no key configured for auth mode(s): publishable,
   secret". A frase engana, porque parece falta de chave, e é troca de formato.

   Então procuramos as três possibilidades, da mais nova para a mais velha. O
   nome IAD_* vem primeiro porque é o único que o administrador consegue
   definir à mão: o painel do Supabase recusa segredos que comecem com
   SUPABASE_, justamente para não deixar ninguém sobrescrever os automáticos.
   Sem essa saída, um projeto que injeta a chave antiga ficaria travado. */
const URL_SUPABASE = Deno.env.get('SUPABASE_URL') || '';
const PUBLICA = Deno.env.get('IAD_CHAVE_PUBLICA') ||
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE = Deno.env.get('IAD_CHAVE_SECRETA') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

/* O formato da chave, nunca a chave. Serve para o diagnóstico dizer "a que
   está aí é a antiga" sem publicar um segredo numa caixa de alerta. */
function formato(k: string): string {
  if (!k) return 'ausente';
  if (/^sb_secret_/.test(k)) return 'nova (secreta)';
  if (/^sb_publishable_/.test(k)) return 'nova (publicável)';
  if (/^ey[A-Za-z0-9_-]*\./.test(k)) return 'antiga (JWT)';
  return 'formato desconhecido';
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status: status,
    headers: Object.assign({ 'content-type': 'application/json' }, CORS)
  });
}

/* Quem está chamando, segundo o GoTrue. Só o token diz isso — nada do que o
   navegador mandar no corpo da requisição é levado em conta aqui. */
async function quemChama(req: Request): Promise<string> {
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+/i.test(auth)) return '';
  try {
    const r = await fetch(URL_SUPABASE + '/auth/v1/user', {
      headers: { apikey: PUBLICA, authorization: auth }
    });
    if (!r.ok) return '';
    const u = await r.json();
    return (u && typeof u.id === 'string') ? u.id : '';
  } catch {
    return '';
  }
}

/* O papel vem da tabela, lido com service_role — não do que o cliente afirma.
   É a diferença entre "ele diz que é admin" e "ele é admin". */
async function ehAdministrador(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const r = await fetch(
      URL_SUPABASE + '/rest/v1/perfis?id=eq.' + encodeURIComponent(id) + '&select=papel,ativo',
      { headers: { apikey: SERVICE, authorization: 'Bearer ' + SERVICE } }
    );
    if (!r.ok) return false;
    const linhas = await r.json();
    return Array.isArray(linhas) && linhas[0] && linhas[0].papel === 'admin' && linhas[0].ativo !== false;
  } catch {
    return false;
  }
}

function emailValido(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ erro: 'metodo' }, 405);

  if (!SERVICE) {
    return responder({ erro: 'A função está no ar, mas sem a chave de serviço configurada.' }, 503);
  }

  const id = await quemChama(req);
  if (!id) return responder({ erro: 'Entre no sistema para convidar alguém.' }, 401);
  if (!(await ehAdministrador(id))) {
    return responder({ erro: 'Só o administrador convida pessoas.' }, 403);
  }

  let pedido: Record<string, unknown>;
  try {
    pedido = await req.json();
  } catch {
    return responder({ erro: 'pedido inválido' }, 400);
  }

  const email = String(pedido.email || '').trim().toLowerCase();
  if (!emailValido(email)) return responder({ erro: 'E-mail inválido.' }, 400);

  /* Uma única operação administrativa: gravar reserva e convidar.
     O navegador NÃO grava em convites diretamente nem conhece senha temporária.
     Convite pendente pode ser reenviado com apenas o e-mail (retomada idempotente).
     Novos cadastros exigem nome, empresa e papel válidos. */
  const nome = String(pedido.nome || '').trim();
  const whatsapp = String(pedido.whatsapp || '').trim();
  const tenantId = String(pedido.tenant_id || '').trim();
  const papel = String(pedido.papel || 'usuario').trim();
  const papeis = ['usuario', 'gestor', 'admin'];
  let dadosEmail: Record<string,string> = { nome, whatsapp, papel };
  if (!papeis.includes(papel)) return responder({ erro: 'Papel inválido.' }, 400);
  if (nome.length > 160 || whatsapp.length > 45) {
    return responder({ erro: 'Nome ou WhatsApp excede o tamanho permitido.' }, 400);
  }
  const cab = {
    apikey: SERVICE,
    authorization: 'Bearer ' + SERVICE
  };
  const respostaJson = async (r: Response): Promise<Record<string, unknown>> => {
    return await r.json().catch(() => ({}));
  };

  if (tenantId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId) ||
        nome.length < 2) {
      return responder({ erro: 'Informe nome e empresa válidos.' }, 400);
    }
    const tr = await fetch(
      URL_SUPABASE + '/rest/v1/tenants?id=eq.' + encodeURIComponent(tenantId) + '&select=id,ativo,nome',
      { headers: cab }
    ).catch(() => null);
    if (!tr || !tr.ok) return responder({ erro: 'Não foi possível verificar a empresa.' }, 502);
    const tenants = await tr.json().catch(() => []);
    if (!Array.isArray(tenants) || tenants.length !== 1 || tenants[0].ativo === false) {
      return responder({ erro: 'Empresa inexistente ou bloqueada.' }, 400);
    }
    dadosEmail.empresa = String(tenants[0].nome || '');
    const reserva = await fetch(URL_SUPABASE + '/rest/v1/convites?on_conflict=email', {
      method: 'POST',
      headers: {
        ...cab,
        'content-type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify({
        email, nome, whatsapp, tenant_id: tenantId,
        papel, criado_por: id
      })
    }).catch(() => null);
    if (!reserva || !reserva.ok) {
      const detalhe = reserva ? await respostaJson(reserva) : {};
      return responder({ erro: 'Não foi possível registrar o convite: ' +
        String(detalhe.message || detalhe.error || 'verifique as migrações do banco.') }, 502);
    }
  } else {
    /* Reenvio só de um convite já aprovado pelo administrador. */
    const r = await fetch(
      URL_SUPABASE + '/rest/v1/convites?email=eq.' +
        encodeURIComponent(email) + '&select=email,nome,whatsapp,papel,tenant_id',
      { headers: cab }
    ).catch(() => null);
    if (!r || !r.ok) return responder({ erro: 'Falha ao consultar o convite existente.' }, 502);
    const linhas = await r.json().catch(() => []);
    if (!Array.isArray(linhas) || linhas.length !== 1) {
      return responder({ erro: 'Não há convite pendente para esse e-mail. Use a recuperação de senha se a conta já existir.' }, 404);
    }
    const p = linhas[0];
    dadosEmail = {
      nome: String(p.nome || ''), whatsapp: String(p.whatsapp || ''),
      papel: String(p.papel || 'usuario')
    };
    const empresa = await fetch(
      URL_SUPABASE + '/rest/v1/tenants?id=eq.' +
        encodeURIComponent(String(p.tenant_id || '')) + '&select=nome',
      { headers: cab }
    ).catch(() => null);
    if (empresa && empresa.ok) {
      const lista = await empresa.json().catch(() => []);
      dadosEmail.empresa = Array.isArray(lista) ? String(lista[0]?.nome || '') : '';
    }
  }

  /* Para onde a pessoa volta depois de definir a senha. Só endereços http(s),
     e sem nada além do endereço — um redirect_to livre viraria um jeito de
     levar o convidado para fora. */
  const origemPermitida = Deno.env.get('IAD_URL_SITE') || 'https://www.iadcrm.com.br';
  const destino = origemPermitida.replace(/\/+$/, '') + '/';

  /* O convite do GoTrue cria a conta e manda o e-mail com o link de definição
     de senha. O gatilho ao_criar_usuario aplica a empresa e o papel que já
     estão na tabela convites — por isso a linha é gravada antes disto. */
  try {
    const r = await fetch(
      URL_SUPABASE + '/auth/v1/invite' + (destino ? '?redirect_to=' + encodeURIComponent(destino) : ''),
      {
        method: 'POST',
        headers: {
          apikey: SERVICE,
          authorization: 'Bearer ' + SERVICE,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ email: email, data: dadosEmail })
      }
    );
    const corpo = await r.json().catch(() => ({}));

    if (r.ok) return responder({ ok: true, email: email });

    /* Duas recusas comuns merecem frase própria: continuar dizendo "422" para
       um vendedor não ajuda ninguém a resolver. */
    const msg = String(corpo?.msg || corpo?.message || corpo?.error_description || '');
    if (/already been registered|already exists/i.test(msg)) {
      return responder({
        erro: 'Esta pessoa já tem conta no servidor. Ela deve entrar pelo login, ou usar "esqueci a senha".'
      }, 409);
    }
    if (r.status === 429 || /rate limit|too many/i.test(msg)) {
      return responder({
        erro: 'Limite de envio atingido. Configure o SMTP próprio no Supabase, ou tente daqui a pouco.'
      }, 429);
    }
    if (/smtp|mailer|email provider/i.test(msg)) {
      return responder({
        erro: 'O Supabase não conseguiu enviar. Confira o SMTP em Authentication → Emails. Detalhe: ' + msg
      }, 502);
    }
    /* A recusa por formato de chave chega em inglês e parece falar de cabeçalho
       HTTP. Quem lê vai conferir o cabeçalho, que está certo. O que está errado
       é a chave, e a função sabe qual formato ela tem na mão — então ela diz. */
    if (/matched no key|auth mode/i.test(msg)) {
      return responder({
        erro: 'O Supabase recusou a chave da função: ela é do formato ' +
          formato(SERVICE) + ', e este projeto exige a chave secreta nova.\n\n' +
          'Correção: painel do Supabase → Settings → API Keys → copie a chave ' +
          '"secret" (começa com sb_secret_). Depois Edge Functions → convite → ' +
          'Secrets → crie IAD_CHAVE_SECRETA com esse valor. O nome precisa ser ' +
          'esse: o painel recusa segredos que comecem com SUPABASE_.'
      }, 502);
    }
    return responder({ erro: msg || ('O servidor respondeu ' + r.status + '.') }, 502);
  } catch (e) {
    return responder({ erro: String((e as Error).message || e) }, 502);
  }
});
