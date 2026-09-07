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

const URL_SUPABASE = Deno.env.get('SUPABASE_URL') || '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

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
      headers: { apikey: ANON, authorization: auth }
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
      URL_SUPABASE + '/rest/v1/perfis?id=eq.' + encodeURIComponent(id) + '&select=papel',
      { headers: { apikey: SERVICE, authorization: 'Bearer ' + SERVICE } }
    );
    if (!r.ok) return false;
    const linhas = await r.json();
    return Array.isArray(linhas) && linhas[0] && linhas[0].papel === 'admin';
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

  /* Para onde a pessoa volta depois de definir a senha. Só endereços http(s),
     e sem nada além do endereço — um redirect_to livre viraria um jeito de
     levar o convidado para fora. */
  const destinoBruto = String(pedido.destino || '');
  const destino = /^https?:\/\/[^\s"'<>]+$/.test(destinoBruto) ? destinoBruto : '';

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
        body: JSON.stringify({ email: email })
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
    return responder({ erro: msg || ('O servidor respondeu ' + r.status + '.') }, 502);
  } catch (e) {
    return responder({ erro: String((e as Error).message || e) }, 502);
  }
});
