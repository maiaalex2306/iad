/* Supabase Edge Function — email
   ------------------------------------------------------------------
   O transporte. É a única parte do sistema que toca a senha da caixa de
   e-mail, e por isso ela é a mais conservadora de todas:

   1. A senha nunca sai daqui. Não volta na resposta, não vai para log, não
      entra em mensagem de erro. Erro de autenticação diz "a caixa recusou a
      senha", e ponto.
   2. Sem biblioteca. Toda dependência que entrasse aqui passaria a poder ler
      a correspondência de todos os clientes no dia em que fosse comprometida,
      e biblioteca de e-mail é alvo clássico exatamente por isso. IMAP e SMTP
      são protocolos de linha, antigos e chatos — não difíceis.
   3. Cada caixa é uma conexão isolada. Uma que falha não derruba as outras, e
      o motivo fica escrito na linha dela.

   O que ela faz, nesta ordem:

     receber  → conecta por IMAP, baixa o que chegou depois do último UID
                conhecido, grava em `emails` e avança a marca da caixa.
     enviar   → pega o que está em `emails` com estado 'fila', manda por SMTP
                e marca 'enviada' — ou 'erro' com o motivo, nunca sumindo.

   A senha de cada caixa vem de um de dois lugares, nesta ordem:

     1. `segredos_email` — guardada pela própria pessoa, pela tela do app,
        cifrada aqui dentro com a EMAIL_CHAVE_MESTRA. É o caminho normal, e é
        o único que funciona para uma equipe: ninguém precisa mandar a própria
        senha para o administrador do painel.
     2. `EMAIL_SENHAS` — o mapa de endereço para senha, editado à mão no painel
        do Supabase. Nasceu antes do caminho 1 e continua valendo para quem já
        o usava:

          {"alexandre.maia@biopartners.com.br":"as16letrasjuntas"}

   Caixa sem senha em nenhum dos dois é ignorada e marcada 'sem-credencial' —
   em vez de tentar, falhar e parecer defeito. */

import { lerMensagem, dataISO } from './mime.ts';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL') || '';
/* Formatos de chave novo e antigo, na mesma ordem das outras funções: o
   painel do Supabase recusa segredos com nome começando em SUPABASE_, então
   IAD_CHAVE_SECRETA é a saída manual. */
const SERVICE = Deno.env.get('IAD_CHAVE_SECRETA') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANON = Deno.env.get('IAD_CHAVE_PUBLICA') ||
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_ANON_KEY') || '';
/* Quem agenda a rodada automática prova que é ela com este segredo. Sem ele
   definido, só chamada de gente logada roda — que é o padrão seguro: um
   endereço público que lê caixa de e-mail sem prova nenhuma seria o convite
   para alguém de fora mandar a função trabalhar de graça. */
const SEGREDO_CRON = Deno.env.get('EMAIL_SEGREDO_CRON') || '';
/* Com o que as senhas das caixas são cifradas antes de irem para o banco.
   Uma só, para o sistema inteiro, definida uma vez. Trocá-la torna ilegível
   tudo o que já foi guardado — cada pessoa teria de digitar a senha de novo. */
const CHAVE_MESTRA = Deno.env.get('EMAIL_CHAVE_MESTRA') || '';

/* Qual código está publicado.

   Esta função é colada à mão no painel do Supabase, e não sobe junto com o
   app. Resultado: quando alguma coisa falha, ninguém sabe se o servidor tem a
   correção ou a versão de antes — e eu passei a tarde inteira sem saber, o
   que é pior do que o defeito. O carimbo volta em toda resposta e aparece na
   tela, e aí a pergunta "você republicou?" tem resposta em vez de palpite. */
const VERSAO_DA_FUNCAO = '2026-09-19-c';

/* A lista tem de conter TODO cabeçalho que o app manda. O navegador pede
   permissão para eles antes de enviar o pedido de verdade (o "preflight"), e
   basta um faltando para a permissão ser negada e a requisição nunca sair.

   Do lado de cá isso não aparece como erro nenhum: a função não é chamada, e
   não há o que registrar. Do lado do app aparece "a resposta não chegou" — o
   mesmo sintoma de função não publicada, que foi exatamente onde eu fui
   procurar. `apikey` faltava aqui, e o app o manda em toda chamada. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
};
const json = (dados: unknown, status = 200) =>
  new Response(JSON.stringify(dados), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS }
  });

function senhas(): Record<string, string> {
  try { return JSON.parse(Deno.env.get('EMAIL_SENHAS') || '{}'); } catch (_e) { return {}; }
}

/* ---------------- a cifra ----------------

   AES-256-GCM, com a chave derivada da EMAIL_CHAVE_MESTRA por SHA-256. GCM e
   não CBC porque ele ACUSA adulteração: bytes trocados no banco viram erro de
   decifragem, e não uma senha diferente sendo mandada para um servidor.

   O vetor de inicialização é sorteado a cada gravação e viaja junto, no
   começo. Reaproveitar um vetor em GCM é a falha clássica do modo — e ela não
   é sutil: dois textos cifrados com o mesmo vetor se revelam um ao outro. */
async function chaveDaCifra(): Promise<CryptoKey> {
  /* O `as BufferSource` existe só para o verificador de tipos: TextEncoder
     devolve bytes que qualquer motor aceita aqui, mas as definições mais
     novas do TypeScript não provam isso sozinhas. Nada muda em execução. */
  const material = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(CHAVE_MESTRA) as BufferSource);
  return await crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function paraBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}

function deBase64(texto: string): Uint8Array {
  const cru = atob(texto);
  const bytes = new Uint8Array(cru.length);
  for (let i = 0; i < cru.length; i++) bytes[i] = cru.charCodeAt(i);
  return bytes;
}

async function cifrar(texto: string): Promise<string> {
  const vetor = crypto.getRandomValues(new Uint8Array(12));
  const fechado = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: vetor }, await chaveDaCifra(),
    new TextEncoder().encode(texto) as BufferSource));
  const junto = new Uint8Array(vetor.length + fechado.length);
  junto.set(vetor, 0);
  junto.set(fechado, vetor.length);
  return paraBase64(junto);
}

async function decifrar(guardado: string): Promise<string> {
  const bytes = deBase64(guardado);
  const aberto = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.subarray(0, 12) as BufferSource },
    await chaveDaCifra(), bytes.subarray(12) as BufferSource);
  return new TextDecoder().decode(aberto);
}

/* Gmail e Outlook têm endereço conhecido, e obrigar cada vendedor a saber o
   nome do servidor de IMAP da própria empresa é obrigar a não usar. */
const SERVIDORES: Record<string, { imap: string; smtp: string }> = {
  gmail: { imap: 'imap.gmail.com', smtp: 'smtp.gmail.com' },
  outlook: { imap: 'outlook.office365.com', smtp: 'smtp.office365.com' }
};

interface Caixa {
  id: string; tenant_id: string; dono_id: string; endereco: string; nome_exibicao: string;
  provedor: string; imap_servidor: string; imap_porta: number;
  smtp_servidor: string; smtp_porta: number; ultimo_uid: number; pastas: string;
  ativo: boolean; envia: boolean;
}

/* ---------------- banco ---------------- */
async function consultar(caminho: string): Promise<any[]> {
  const r = await fetch(URL_SUPABASE + '/rest/v1/' + caminho, {
    headers: { apikey: SERVICE, authorization: 'Bearer ' + SERVICE }
  });
  if (!r.ok) {
    console.error('consulta falhou', caminho, r.status);
    return [];
  }
  return await r.json().catch(() => []);
}

async function alterar(caminho: string, corpo: unknown): Promise<boolean> {
  const r = await fetch(URL_SUPABASE + '/rest/v1/' + caminho, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE, authorization: 'Bearer ' + SERVICE,
      'content-type': 'application/json', prefer: 'return=minimal'
    },
    body: JSON.stringify(corpo)
  });
  if (!r.ok) console.error('patch falhou', caminho, r.status, await r.text().catch(() => ''));
  return r.ok;
}

/* resolution=ignore-duplicates porque o Message-ID é a chave primária: a mesma
   mensagem reentregue pelo servidor vira no-op, não erro. */
async function gravarEmails(linhas: Record<string, unknown>[]): Promise<number> {
  if (!linhas.length) return 0;
  const r = await fetch(URL_SUPABASE + '/rest/v1/emails', {
    method: 'POST',
    headers: {
      apikey: SERVICE, authorization: 'Bearer ' + SERVICE,
      'content-type': 'application/json',
      prefer: 'resolution=ignore-duplicates,return=minimal'
    },
    body: JSON.stringify(linhas)
  });
  if (!r.ok) {
    console.error('gravar e-mails falhou', r.status, await r.text().catch(() => ''));
    return 0;
  }
  return linhas.length;
}

/* O segredo de uma caixa, de onde estiver. A tabela primeiro: é onde a
   própria pessoa guardou. O mapa do painel depois, para não quebrar quem já
   estava funcionando por ele. */
async function senhaDaCaixa(caixa: Caixa, mapa: Record<string, string>): Promise<string> {
  const linhas = await consultar('segredos_email?select=senha_cifrada&caixa_id=eq.' + caixa.id);
  const guardada = (linhas[0] || {}).senha_cifrada || '';
  if (guardada && CHAVE_MESTRA) {
    try {
      return await decifrar(guardada);
    } catch (_e) {
      /* Chave-mestra trocada, ou linha adulterada. Cair no mapa seria pior do
         que falhar: a pessoa continuaria vendo "ok" sem entender que a senha
         que ela guardou parou de valer. */
      throw new Error('a senha guardada não pôde ser lida; guarde-a de novo na tela "Minha caixa"');
    }
  }
  return mapa[String(caixa.endereco || '').toLowerCase()] || mapa[caixa.endereco] || '';
}

async function gravarSegredo(caixaId: string, cifrada: string): Promise<boolean> {
  const r = await fetch(URL_SUPABASE + '/rest/v1/segredos_email?on_conflict=caixa_id', {
    method: 'POST',
    headers: {
      apikey: SERVICE, authorization: 'Bearer ' + SERVICE,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([{ caixa_id: caixaId, senha_cifrada: cifrada, atualizado_em: new Date().toISOString() }])
  });
  if (!r.ok) console.error('gravar segredo falhou', r.status, await r.text().catch(() => ''));
  return r.ok;
}

async function apagarSegredo(caixaId: string): Promise<void> {
  await fetch(URL_SUPABASE + '/rest/v1/segredos_email?caixa_id=eq.' + caixaId, {
    method: 'DELETE',
    headers: { apikey: SERVICE, authorization: 'Bearer ' + SERVICE, prefer: 'return=minimal' }
  });
}

/* ---------------- conversa de linha sobre TLS ----------------

   IMAP e SMTP são os dois um diálogo de linhas terminadas em CRLF. O que muda
   é a gramática. Isto aqui é o encanamento comum: escrever uma linha, ler até
   achar o que se espera, e nunca ficar esperando para sempre. */
class Conversa {
  private conexao: Deno.TlsConn;
  private leitor: ReadableStreamDefaultReader<Uint8Array>;
  /* O acumulado como texto latin-1, e não como bytes: aqui ainda não se sabe o
     charset de nada, e decodificar como UTF-8 cedo demais corromperia o corpo
     antes de o MIME dizer como lê-lo. Um byte é um caractere, sempre; o
     mime.ts decodifica depois, com a informação certa. */
  private buffer = '';
  private fimDoTempo: number;

  constructor(conexao: Deno.TlsConn, segundos = 30) {
    this.conexao = conexao;
    this.leitor = conexao.readable.getReader();
    this.fimDoTempo = Date.now() + segundos * 1000;
  }

  async escrever(texto: string): Promise<void> {
    const w = this.conexao.writable.getWriter();
    try { await w.write(new TextEncoder().encode(texto)); } finally { w.releaseLock(); }
  }

  /* Lê mais bytes do socket. O prazo existe porque servidor de e-mail que para
     de responder no meio deixaria a função presa até o tempo da plataforma
     acabar — e aí a caixa inteira falharia sem motivo escrito. */
  private async mais(): Promise<boolean> {
    if (Date.now() > this.fimDoTempo) throw new Error('o servidor demorou demais');
    const { value, done } = await this.leitor.read();
    if (done || !value) return false;
    /* Em pedaços: fromCharCode com um array de megabytes estoura a pilha. */
    for (let i = 0; i < value.length; i += 8192) {
      this.buffer += String.fromCharCode(...value.subarray(i, i + 8192));
    }
    return true;
  }

  /* Só o fim do que chegou. A linha que encerra a resposta é sempre a última,
     e reexaminar a caixa inteira a cada pedaço de 8 KB transformaria a leitura
     de mil mensagens em trabalho quadrático — a função estouraria o tempo com
     o servidor respondendo normalmente. O corte cai depois de uma quebra de
     linha para o `^` das expressões continuar significando começo de linha de
     verdade. */
  private cauda(): string {
    if (this.buffer.length <= 16384) return this.buffer;
    const corte = this.buffer.indexOf('\n', this.buffer.length - 16384);
    return corte < 0 ? '' : this.buffer.slice(corte + 1);
  }

  async lerAte(pronto: (texto: string) => boolean): Promise<string> {
    while (!pronto(this.cauda())) {
      if (!(await this.mais())) break;
    }
    const t = this.buffer;
    this.buffer = '';
    return t;
  }

  fechar() {
    try { this.leitor.releaseLock(); } catch (_e) { /* já solto */ }
    try { this.conexao.close(); } catch (_e) { /* já fechada */ }
  }
}

/* Cabeçalho não aceita quebra de linha: quem conseguisse pôr um \r\n no
   assunto ou no destinatário escreveria cabeçalhos próprios na mensagem — o
   jeito clássico de transformar um formulário de contato em disparador de
   spam. Aqui os valores vêm do banco do próprio cliente, mas a regra vale
   igual: nada do que veio de fora atravessa uma quebra de linha. */
function umaLinha(valor: unknown): string {
  return String(valor == null ? '' : valor).replace(/[\r\n]+/g, ' ').trim();
}

/* INTERNALDATE vem como "18-Sep-2026 14:22:01 +0000". Os traços no meio da
   data não são padrão em lugar nenhum, e `new Date` de texto que ele não
   entende devolve NaN — que viraria exceção na hora de gravar e derrubaria a
   caixa inteira por causa de um formato de data. */
function dataDoServidor(valor?: string): string {
  if (!valor) return '';
  return dataISO(valor.replace(/^(\d{1,2})-(\w{3})-(\d{4})/, '$1 $2 $3'));
}

/* ---------------- IMAP ----------------

   Só o necessário: entrar, escolher a pasta, baixar o que é novo. Nada de
   marcar como lido (BODY.PEEK), nada de apagar, nada de mover. Esta função lê
   a caixa do vendedor e não mexe nela — se ela mexesse, um defeito aqui
   estragaria a caixa de e-mail de alguém, e isso não se desfaz. */
/* Entrar na caixa e escolher a pasta. Tudo o que se faz por IMAP começa
   assim, então isto é o começo compartilhado — e a duplicata que existia aqui
   foi o que deixou o teste de senha mandar um comando inválido sem ninguém
   notar. `fazer` recebe a função de comando e faz o resto. */
async function naCaixa<T>(
  caixa: Caixa, senha: string, segundos: number,
  fazer: (comando: (passo: string, linha: string) => Promise<string>) => Promise<T>
): Promise<T> {
  const servidor = caixa.imap_servidor || SERVIDORES[caixa.provedor]?.imap || '';
  if (!servidor) throw new Error('não sei o servidor de entrada desta caixa');

  const conexao = await Deno.connectTls({ hostname: servidor, port: caixa.imap_porta || 993 });
  const c = new Conversa(conexao, segundos);

  try {
    await c.lerAte((t) => /^\* OK/m.test(t));

    /* A marca de cada comando é sorteada na conexão. Ela é o que diz "a
       resposta acabou", e corpo de e-mail é texto arbitrário: com marcas fixas
       (a1, a2, a3), bastaria alguém mandar uma mensagem contendo uma linha
       "a3 OK" para a leitura parar no meio e o resto da caixa virar lixo. Com
       seis caracteres sorteados, ninguém tem como escrever a marca de hoje. */
    const sorteio = 'x' + Math.random().toString(36).slice(2, 8);
    const comando = async (passo: string, linha: string) => {
      const marca = sorteio + passo;
      await c.escrever(marca + ' ' + linha + '\r\n');
      const re = new RegExp('^' + marca + ' (OK|NO|BAD)', 'm');
      const resposta = await c.lerAte((t) => re.test(t));
      const m = re.exec(resposta);
      if (!m || m[1] !== 'OK') {
        /* A mensagem do servidor entra, a senha nunca. */
        const motivo = (new RegExp('^' + marca + ' (?:NO|BAD) (.*)$', 'm').exec(resposta) || [])[1] || '';
        throw new Error(motivo.slice(0, 160) || 'o servidor recusou ' + linha.split(' ')[0]);
      }
      return resposta;
    };

    /* A senha vai entre aspas porque senha de aplicativo do Google não tem
       caracteres especiais, mas caixa de servidor próprio tem. */
    await comando('1', 'LOGIN "' + caixa.endereco.replace(/"/g, '') + '" "' + senha.replace(/"/g, '\\"') + '"');

    const pasta = (caixa.pastas || 'INBOX').split(',')[0].trim() || 'INBOX';
    await comando('2', 'SELECT "' + pasta.replace(/"/g, '') + '"');

    const saida = await fazer(comando);
    await c.escrever(sorteio + '9 LOGOUT\r\n');
    return saida;
  } finally {
    c.fechar();
  }
}

/* Só provar que a senha abre a caixa. Entra, escolhe a pasta, sai.

   Antes isto chamava a leitura com `ultimo_uid` no máximo que um número
   seguro comporta, para não baixar nada — e aí o comando saía como
   `UID FETCH 9007199254740992:*`. UID de IMAP cabe em 32 bits, e o Gmail
   respondia "Could not parse command": a senha estava certa e o app dizia que
   não. Testar não é ler com um truque; é um comando a menos. */
async function testarCaixa(caixa: Caixa, senha: string): Promise<void> {
  await naCaixa(caixa, senha, 30, async () => undefined);
}

/* Quantas mensagens uma rodada traz, e quanto de cada uma.

   Os dois limites existem pelo mesmo motivo, e ele custou caro: a primeira
   leitura de uma caixa tem `ultimo_uid` em zero, então o comando era "me dê
   TUDO". Numa caixa de verdade isso é a correspondência de anos inteira
   chegando de uma vez, e a função morria com
   "Function failed due to not having enough compute resources" — que não diz
   nada sobre e-mail e manda procurar no lugar errado.

   25 por rodada, com o agendador de 5 em 5 minutos, drena uma caixa antiga
   sozinho: cada rodada avança a marca, e a seguinte continua de onde parou.
   E 64 KB por mensagem é de sobra para o que o IAD guarda — só o texto, sem
   anexo e sem imagem. Anexo de 30 MB não entra na memória por acidente. */
const POR_RODADA = 25;
const BYTES_POR_MENSAGEM = 65536;

async function lerCaixa(caixa: Caixa, senha: string):
    Promise<{ mensagens: any[]; maiorUid: number; restantes: number }> {
  const mensagens: any[] = [];
  let maiorUid = Number(caixa.ultimo_uid) || 0;
  let restantes = 0;

  await naCaixa(caixa, senha, 40, async (comando) => {
    /* Primeiro PERGUNTAR quais existem, e só depois buscar as escolhidas.

       SEARCH devolve só números — uma caixa com dez mil mensagens responde uns
       70 KB. É o que torna possível limitar: com `UID FETCH n:*` não há como
       pedir "as 25 primeiras", porque quem decide quantas vêm é o servidor.

       O teto é o que cabe num UID: 32 bits. Acima disso o servidor não recusa
       a busca, recusa a LINHA — e a mensagem que volta não fala de UID
       nenhum. */
    const desde = Math.min(maiorUid + 1, 4294967295);
    const achados = await comando('3', 'UID SEARCH UID ' + desde + ':*');

    const todos = ((/^\* SEARCH([ \d]*)/m.exec(achados) || [])[1] || '')
      .trim().split(/\s+/).map(Number)
      .filter((u) => u > (Number(caixa.ultimo_uid) || 0))
      .sort((a, b) => a - b);

    /* A PRIMEIRA leitura é diferente das outras, e essa diferença é uma
       decisão de produto, não um detalhe:

         primeira vez  → as mais RECENTES, e o resto do arquivo fica para trás
                         de propósito.
         daí em diante → as mais antigas primeiro, para a marca avançar sempre
                         e um atraso ser drenado em ordem.

       Trazer dez anos de caixa de 25 em 25 levaria meses, e ninguém precisa
       disso: o que move uma negociação é o que foi escrito nas últimas
       semanas. O histórico continua no Gmail, onde sempre esteve. */
    const primeiraVez = !(Number(caixa.ultimo_uid) || 0);
    const desta = primeiraVez ? todos.slice(-POR_RODADA) : todos.slice(0, POR_RODADA);
    restantes = primeiraVez ? 0 : todos.length - desta.length;
    if (!desta.length) return;

    /* `<0.65536>` é o pedaço que se quer de cada mensagem: do byte zero em
       diante, no máximo isso. O servidor manda só esse pedaço. */
    const bruto = await comando('4', 'UID FETCH ' + desta.join(',') +
      ' (UID INTERNALDATE BODY.PEEK[]<0.' + BYTES_POR_MENSAGEM + '>)');

    /* Cada item vem como `* N FETCH (UID u INTERNALDATE "..." BODY[]<0> {n}`
       seguido de exatamente `n` bytes. É o tamanho que manda: procurar o fim
       por texto quebraria em qualquer mensagem que contivesse `)` — ou seja,
       em quase todas. O `<0>` só aparece quando se pede um pedaço. */
    const re = /\* \d+ FETCH \(([^)]*?)BODY\[\](?:<\d+>)? \{(\d+)\}\r?\n/g;
    let achado: RegExpExecArray | null;
    while ((achado = re.exec(bruto)) !== null) {
      const meta = achado[1] || '';
      const tamanho = parseInt(achado[2] || '0', 10);
      const inicio = achado.index + achado[0].length;
      /* Pular o corpo ANTES de qualquer decisão sobre a mensagem. Se a busca
         continuasse de onde o cabeçalho acabou, o texto do e-mail entraria na
         varredura e um `* 2 FETCH (` escrito dentro dele seria lido como
         mensagem — o que acontece sozinho em qualquer conversa sobre e-mail. */
      re.lastIndex = inicio + tamanho;
      const cru = bruto.slice(inicio, inicio + tamanho);

      const uid = parseInt((/UID (\d+)/.exec(meta) || ['', '0'])[1] || '0', 10) || 0;
      if (uid <= (Number(caixa.ultimo_uid) || 0)) continue;
      if (uid > maiorUid) maiorUid = uid;

      const bytes = new Uint8Array(cru.length);
      for (let i = 0; i < cru.length; i++) bytes[i] = cru.charCodeAt(i) & 0xff;
      const texto = new TextDecoder('latin1').decode(bytes);

      const m = lerMensagem(texto, dataDoServidor((/INTERNALDATE "([^"]+)"/.exec(meta) || [])[1]));
      if (!m.id) continue;   /* sem Message-ID não há chave e não há dedução */
      mensagens.push({ ...m, uid });
    }
  });

  return { mensagens, maiorUid, restantes };
}

/* ---------------- SMTP ----------------

   Porta 465, TLS desde o primeiro byte. A alternativa (587 com STARTTLS)
   começa a conversa em claro e depois negocia — mais código e uma janela a
   mais para errar. Gmail e Outlook aceitam as duas; aqui vale a simples. */
async function mandar(caixa: Caixa, senha: string, msg: any): Promise<void> {
  const servidor = caixa.smtp_servidor || SERVIDORES[caixa.provedor]?.smtp || '';
  if (!servidor) throw new Error('não sei o servidor de saída desta caixa');

  const conexao = await Deno.connectTls({ hostname: servidor, port: caixa.smtp_porta === 587 ? 587 : 465 });
  const c = new Conversa(conexao, 40);

  /* Resposta de SMTP pode ter várias linhas: as do meio vêm com traço
     (`250-SIZE`) e só a última com espaço (`250 HELP`). Parar na primeira
     deixaria o resto das linhas no socket, e elas apareceriam como resposta do
     comando seguinte — o erro que faz o envio falhar só em servidor que
     anuncia muita extensão. Por isso o espaço na expressão. */
  const fala = async (linha: string | null, esperado: string) => {
    if (linha !== null) await c.escrever(linha + '\r\n');
    const re = new RegExp('^' + esperado + ' ', 'm');
    const ruim = /^[45]\d\d /m;
    const r = await c.lerAte((t) => re.test(t) || ruim.test(t));
    if (!re.test(r)) {
      const erro = (/^[45]\d\d (.*)$/m.exec(r) || [])[1] || 'recusado';
      throw new Error(erro.slice(0, 160));
    }
    return r;
  };

  try {
    await fala(null, '220');
    await fala('EHLO iad', '250');
    await fala('AUTH LOGIN', '334');
    await fala(btoa(caixa.endereco), '334');
    await fala(btoa(senha), '235');
    await fala('MAIL FROM:<' + caixa.endereco + '>', '250');
    for (const destino of String(msg.para || '').split(',').map((x: string) => x.trim()).filter(Boolean)) {
      await fala('RCPT TO:<' + destino + '>', '250');
    }
    await fala('DATA', '354');
    await c.escrever(montar(caixa, msg) + '\r\n.\r\n');
    await fala(null, '250');
    await c.escrever('QUIT\r\n');
  } finally {
    c.fechar();
  }
}

/* A mensagem, montada à mão.

   O Message-ID é o que o app já gerou e gravou — não se inventa outro aqui. É
   ele que a resposta do cliente devolve em In-Reply-To, e é por isso que ela
   volta amarrada à negociação sem ninguém adivinhar. Trocá-lo no envio
   quebraria justamente isso.

   O corpo vai em base64 porque SMTP tem limite de linha e uma linha com um
   ponto sozinho encerra a mensagem no meio. Base64 não tem linha longa nem
   ponto solto — e resolve o acento de graça. */
function montar(caixa: Caixa, msg: any): string {
  const nome = String(caixa.nome_exibicao || '').replace(/["\\]/g, '');
  const de = nome ? '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(nome))) + '?= <' + caixa.endereco + '>'
    : caixa.endereco;
  const assunto = '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(umaLinha(msg.assunto)))) + '?=';
  const corpo = btoa(unescape(encodeURIComponent(String(msg.corpo || '')))).replace(/(.{76})/g, '$1\r\n');

  const cabecalhos = [
    'From: ' + de,
    'To: ' + umaLinha(msg.para),
    'Subject: ' + assunto,
    'Message-ID: ' + umaLinha(msg.id),
    'Date: ' + new Date().toUTCString(),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64'
  ];
  if (msg.responde_a) {
    const respondeA = umaLinha(msg.responde_a);
    const thread = umaLinha(msg.thread);
    cabecalhos.push('In-Reply-To: ' + respondeA);
    /* References carrega a cadeia; sem ela o cliente de e-mail do outro lado
       abre uma conversa nova e a thread se parte em duas na caixa DELE. */
    cabecalhos.push('References: ' + (thread && thread !== respondeA
      ? thread + ' ' + respondeA : respondeA));
  }
  return cabecalhos.join('\r\n') + '\r\n\r\n' + corpo;
}

/* ---------------- a rodada ---------------- */
async function rodar(donoId?: string): Promise<Record<string, unknown>> {
  const mapa = senhas();
  const filtro = donoId ? '&dono_id=eq.' + encodeURIComponent(donoId) : '';
  const caixas = await consultar('caixas_email?select=*&ativo=is.true' + filtro) as Caixa[];

  const relatorio: Record<string, unknown>[] = [];

  for (const caixa of caixas) {
    let senha = '';
    try {
      senha = await senhaDaCaixa(caixa, mapa);
    } catch (e) {
      const motivo = String((e as Error).message || 'falhou').slice(0, 300);
      await alterar('caixas_email?id=eq.' + caixa.id, { estado: 'erro', erro: motivo });
      relatorio.push({ caixa: caixa.endereco, erro: motivo });
      continue;
    }
    if (!senha) {
      await alterar('caixas_email?id=eq.' + caixa.id,
        { estado: 'sem-credencial',
          erro: 'Falta a senha de aplicativo desta caixa. Abra "Minha caixa" e guarde-a.' });
      relatorio.push({ caixa: caixa.endereco, erro: 'sem credencial' });
      continue;
    }

    const linha: Record<string, unknown> = { caixa: caixa.endereco, recebidos: 0, enviados: 0 };

    /* Receber e enviar são independentes de propósito: IMAP fora do ar não
       pode impedir a resposta que o vendedor já escreveu de sair. */
    try {
      const { mensagens, maiorUid, restantes } = await lerCaixa(caixa, senha);
      if (restantes) linha.faltam = restantes;
      if (mensagens.length) {
        linha.recebidos = await gravarEmails(mensagens.map((m) => ({
          id: m.id, tenant_id: caixa.tenant_id, dono_id: caixa.dono_id, caixa: caixa.endereco,
          direcao: enderecoIgual(m.de, caixa.endereco) ? 'saida' : 'entrada',
          de: m.de, de_nome: m.deNome, para: m.para, copia: m.copia,
          assunto: m.assunto, corpo: m.corpo, thread: m.thread, responde_a: m.respondeA,
          enviada_em: m.quando || new Date().toISOString(), estado: 'recebida'
        })));
      }
      if (maiorUid > (Number(caixa.ultimo_uid) || 0)) {
        await alterar('caixas_email?id=eq.' + caixa.id,
          { ultimo_uid: maiorUid, estado: 'ok', erro: '', ultima_leitura: new Date().toISOString() });
      } else {
        await alterar('caixas_email?id=eq.' + caixa.id,
          { estado: 'ok', erro: '', ultima_leitura: new Date().toISOString() });
      }
    } catch (e) {
      const motivo = String((e as Error).message || 'falhou').slice(0, 300);
      linha.erroAoReceber = motivo;
      await alterar('caixas_email?id=eq.' + caixa.id, { estado: 'erro', erro: motivo });
    }

    if (caixa.envia !== false) {
      const fila = await consultar('emails?select=*&estado=eq.fila&caixa=eq.' +
        encodeURIComponent(caixa.endereco) + '&order=enviada_em.asc&limit=20');
      for (const msg of fila) {
        try {
          await mandar(caixa, senha, msg);
          await alterar('emails?id=eq.' + encodeURIComponent(msg.id),
            { estado: 'enviada', erro: '', enviada_em: new Date().toISOString() });
          linha.enviados = (linha.enviados as number) + 1;
        } catch (e) {
          /* Marcada com o motivo, nunca sumindo: mensagem que o vendedor
             escreveu e desapareceu sem explicação é a pior falha possível
             aqui. Ela fica na tela, em vermelho, com o que o servidor disse. */
          await alterar('emails?id=eq.' + encodeURIComponent(msg.id),
            { estado: 'erro', erro: String((e as Error).message || 'falhou').slice(0, 300) });
        }
      }
    }

    relatorio.push(linha);
  }

  return { ok: true, versao: VERSAO_DA_FUNCAO, caixas: relatorio };
}

/* ---------------- guardar a senha de uma caixa ----------------

   Esta é a razão de a função aceitar mais de uma ação. Sem ela, a senha de
   cada vendedor teria de ser digitada no painel do Supabase por quem o
   administra — ou seja, a Rosa teria de MANDAR a senha dela para alguém. Uma
   senha que viaja por mensagem já está queimada, por melhor que seja o cofre
   do outro lado.

   Aqui ela faz uma viagem só: do computador dela para este servidor, por TLS,
   e sai cifrada para o banco. Ninguém no meio, e nada guardado no navegador.

   A senha é TESTADA antes de ser guardada. Guardar sem testar empurraria a
   descoberta do erro de digitação para a próxima rodada automática, que
   acontece sem ninguém olhando — e aí a pessoa só descobriria pela ausência
   de e-mails, que é o sintoma mais difícil de notar que existe. */
async function guardarSenha(donoId: string, endereco: string, senha: string): Promise<Record<string, unknown>> {
  if (!CHAVE_MESTRA) {
    return { erro: 'o servidor está sem a EMAIL_CHAVE_MESTRA; quem administra precisa criá-la uma vez' };
  }
  if (!senha) return { erro: 'a senha veio vazia' };

  const caixas = await consultar('caixas_email?select=*&dono_id=eq.' + encodeURIComponent(donoId) +
    '&endereco=eq.' + encodeURIComponent(endereco.toLowerCase())) as Caixa[];
  const caixa = caixas[0];
  /* Só as caixas de quem chamou: o filtro por dono_id é o que impede alguém
     de gravar uma senha na caixa de outra pessoa — ou de descobrir, pela
     resposta, que aquela caixa existe. */
  if (!caixa) return { erro: 'não achei esta caixa entre as suas' };

  try {
    await testarCaixa(caixa, senha);
  } catch (e) {
    const motivo = String((e as Error).message || 'falhou').slice(0, 300);
    await alterar('caixas_email?id=eq.' + caixa.id, { estado: 'erro', erro: motivo });
    return { erro: motivo };
  }

  if (!(await gravarSegredo(caixa.id, await cifrar(senha)))) {
    return { erro: 'a senha foi aceita pela caixa, mas não consegui guardá-la' };
  }
  await alterar('caixas_email?id=eq.' + caixa.id,
    { estado: 'ok', erro: '', senha_em: new Date().toISOString() });
  return { ok: true, caixa: caixa.endereco };
}

async function esquecerSenha(donoId: string, endereco: string): Promise<Record<string, unknown>> {
  const caixas = await consultar('caixas_email?select=id,endereco&dono_id=eq.' + encodeURIComponent(donoId) +
    '&endereco=eq.' + encodeURIComponent(endereco.toLowerCase())) as Caixa[];
  const caixa = caixas[0];
  if (!caixa) return { erro: 'não achei esta caixa entre as suas' };
  await apagarSegredo(caixa.id);
  await alterar('caixas_email?id=eq.' + caixa.id,
    { estado: 'sem-credencial', erro: '', senha_em: null });
  return { ok: true, caixa: caixa.endereco };
}

function enderecoIgual(a: string, b: string): boolean {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/* ---------------- quem pode chamar ----------------

   Duas portas, e nenhuma aberta:

     gente logada  → roda só as caixas dela.
     o agendador   → com o segredo EMAIL_SEGREDO_CRON, roda todas.

   Sem prova nenhuma não roda. Um endereço público que lê caixa de e-mail a
   pedido de qualquer um seria o convite para alguém de fora mandar a função
   trabalhar — e, no limite, para descobrir quais endereços existem. */
async function quemChamou(req: Request): Promise<{ ok: boolean; donoId?: string; erro?: string }> {
  if (SEGREDO_CRON && req.headers.get('x-cron') === SEGREDO_CRON) return { ok: true };

  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token || token === ANON) return { ok: false, erro: 'entre na sua conta antes' };

  const r = await fetch(URL_SUPABASE + '/auth/v1/user', {
    headers: { apikey: ANON, authorization: 'Bearer ' + token }
  });
  if (!r.ok) return { ok: false, erro: 'sessão inválida' };
  const u = await r.json().catch(() => null);
  if (!u || !u.id) return { ok: false, erro: 'sessão inválida' };
  return { ok: true, donoId: u.id };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'método não suportado' }, 405);
  if (!URL_SUPABASE || !SERVICE) return json({ erro: 'a função está sem configuração de banco' }, 503);
  /* Nenhum dos dois caminhos de senha configurado: a função não teria como
     abrir caixa nenhuma, e dizer isso agora é melhor do que marcar todas as
     caixas como 'sem-credencial' e deixar a pessoa procurar. */
  if (!CHAVE_MESTRA && !Deno.env.get('EMAIL_SENHAS')) {
    return json({ erro: 'falta o segredo EMAIL_CHAVE_MESTRA' }, 503);
  }

  const quem = await quemChamou(req);
  if (!quem.ok) return json({ erro: quem.erro }, 401);

  const pedido = await req.json().catch(() => ({})) as Record<string, string>;
  const acao = String(pedido.acao || 'rodar');

  try {
    if (acao === 'guardar-senha' || acao === 'esquecer-senha') {
      /* Só gente logada mexe em senha. O agendador roda a caixa; ele não tem
         dono, e uma ação sem dono aqui seria uma ação sobre a caixa de
         qualquer um. */
      if (!quem.donoId) return json({ erro: 'esta ação é de quem está logado' }, 403);
      const endereco = String(pedido.endereco || '').trim().toLowerCase();
      if (!endereco) return json({ erro: 'falta o endereço da caixa' }, 400);

      const r = acao === 'guardar-senha'
        ? await guardarSenha(quem.donoId, endereco, String(pedido.senha || ''))
        : await esquecerSenha(quem.donoId, endereco);
      return json(r, r.erro ? 400 : 200);
    }
    return json(await rodar(quem.donoId));
  } catch (e) {
    console.error('a ação ' + acao + ' falhou', e);
    return json({ erro: String((e as Error).message || 'falhou') }, 500);
  }
});
