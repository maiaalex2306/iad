import { conexaoFalsa, type Falso } from './servidor-de-mentira.ts';

/* ---------- o mundo de mentira ---------- */
const CAIXA = {
  id: 'c1', tenant_id: 't1', dono_id: 'u1',
  endereco: 'alexandre.maia@biopartners.com.br', nome_exibicao: 'Alexandre Maia',
  provedor: 'gmail', imap_servidor: '', imap_porta: 993,
  smtp_servidor: '', smtp_porta: 465, ultimo_uid: 10, pastas: 'INBOX',
  ativo: true, envia: true
};
const CAIXA2 = { ...CAIXA, id: 'c2', endereco: 'alexandre.maia@biosolvit.com', ultimo_uid: 0, envia: false };

const patches: any[] = [];
let filaDeEnvio: any[] = [];
let gravados: any[] = [];

function corpoDeUmEmail(id: string, de: string, assunto: string, texto: string) {
  const linhas = [
    'Return-Path: <' + de + '>',
    'From: "Ana Luiza" <' + de + '>',
    'To: alexandre.maia@biopartners.com.br',
    'Subject: ' + assunto,
    'Message-ID: <' + id + '>',
    'Date: Thu, 17 Sep 2026 09:12:00 -0300',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    texto
  ];
  return linhas.join('\r\n') + '\r\n';
}

/* Uma mensagem que tenta enganar o leitor: contém, no corpo, uma linha que
   parece o fim de uma resposta de IMAP e outra que parece um novo FETCH. */
const ARMADILHA = corpoDeUmEmail('armadilha@suzano.com.br', 'ana@suzano.com.br',
  'Teste', 'Olha o que o log mostrou:\r\na3 OK FETCH completed\r\n* 99 FETCH (UID 999 BODY[] {12}\r\nlixo lixo lix\r\nAbraco, Ana\r\n');
const NORMAL = corpoDeUmEmail('normal@suzano.com.br', 'ana@suzano.com.br',
  '=?UTF-8?B?UHJlw6dv?=', 'Bom dia, pode mandar a proposta?\r\n\r\nEm 10/09 Alexandre escreveu:\r\n> coisa antiga\r\n');
const ANTIGA = corpoDeUmEmail('antiga@suzano.com.br', 'ana@suzano.com.br', 'Velha', 'ja vista\r\n');

function servidorImap(): Falso {
  let s: Falso;
  let marca = '';
  s = {
    visto: [],
    fala(linha: string) {
      if (linha === '') return '* OK Gimap ready\r\n';
      const m = /^(\S+) (\w+)/.exec(linha);
      if (!m) return null;
      marca = m[1]!;
      const cmd = m[2]!.toUpperCase();
      if (cmd === 'LOGIN') return marca + ' OK logado\r\n';
      if (cmd === 'SELECT') return '* 3 EXISTS\r\n' + marca + ' OK [READ-WRITE] SELECT completo\r\n';
      if (cmd === 'UID') {
        const item = (n: number, uid: number, corpo: string) =>
          '* ' + n + ' FETCH (UID ' + uid + ' INTERNALDATE "17-Sep-2026 12:12:00 +0000" BODY[] {' +
          corpo.length + '}\r\n' + corpo + ')\r\n';
        return item(1, 9, ANTIGA) + item(2, 11, NORMAL) + item(3, 12, ARMADILHA) +
          marca + ' OK FETCH completo\r\n';
      }
      if (cmd === 'LOGOUT') return '* BYE\r\n' + marca + ' OK\r\n';
      return marca + ' BAD nao entendi\r\n';
    }
  };
  return s;
}

let corpoEnviado = '';
function servidorSmtp(): Falso {
  let emDados = false;
  return {
    visto: [],
    fala(linha: string) {
      if (emDados) {
        if (linha === '.') { emDados = false; return '250 2.0.0 OK enviada\r\n'; }
        corpoEnviado += linha + '\r\n';
        return null;
      }
      if (linha === '') return '220 smtp.gmail.com ESMTP pronto\r\n';
      const cmd = linha.split(/[ :]/)[0]!.toUpperCase();
      /* EHLO responde em VÁRIAS linhas — o caso que quebrava antes */
      if (cmd === 'EHLO') return '250-smtp.gmail.com\r\n250-SIZE 35882577\r\n250-8BITMIME\r\n250-AUTH LOGIN PLAIN\r\n250 SMTPUTF8\r\n';
      if (cmd === 'AUTH') return '334 VXNlcm5hbWU6\r\n';
      if (/^[A-Za-z0-9+/=]+$/.test(linha) && linha.length > 8) {
        const decodificado = atob(linha);
        if (decodificado.includes('@')) return '334 UGFzc3dvcmQ6\r\n';
        return '235 2.7.0 aceito\r\n';
      }
      if (cmd === 'MAIL') return '250 2.1.0 OK\r\n';
      if (cmd === 'RCPT') return '250 2.1.5 OK\r\n';
      if (cmd === 'DATA') { emDados = true; return '354 Manda\r\n'; }
      if (cmd === 'QUIT') return '221 tchau\r\n';
      return '500 nao entendi\r\n';
    }
  };
}

/* ---------- os stubs de plataforma ---------- */
const AMBIENTE: Record<string, string> = {
  SUPABASE_URL: 'https://exemplo.supabase.co',
  IAD_CHAVE_SECRETA: 'segredo-de-teste',
  IAD_CHAVE_PUBLICA: 'publica-de-teste',
  EMAIL_SENHAS: JSON.stringify({ 'alexandre.maia@biopartners.com.br': 'aaaabbbbccccdddd' }),
  EMAIL_SEGREDO_CRON: 'cron-de-teste'
};

let manipulador: any = null;
(globalThis as any).Deno = {
  env: { get: (k: string) => AMBIENTE[k] },
  serve: (h: any) => { manipulador = h; },
  connectTls: async (o: any) => {
    if (o.port === 993) return conexaoFalsa(servidorImap());
    return conexaoFalsa(servidorSmtp());
  }
};

const fetchDeVerdade = globalThis.fetch;
(globalThis as any).fetch = async (url: string, op: any = {}) => {
  const u = String(url);
  const ok = (dados: any) => new Response(JSON.stringify(dados), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.includes('/rest/v1/caixas_email') && (!op.method || op.method === 'GET')) {
    return ok(u.includes('dono_id=eq.') ? [CAIXA] : [CAIXA, CAIXA2]);
  }
  if (u.includes('/rest/v1/caixas_email') && op.method === 'PATCH') {
    patches.push({ url: u, corpo: JSON.parse(op.body) }); return new Response('', { status: 204 });
  }
  if (u.includes('/rest/v1/emails') && op.method === 'POST') {
    gravados = gravados.concat(JSON.parse(op.body)); return new Response('', { status: 201 });
  }
  if (u.includes('/rest/v1/emails') && op.method === 'PATCH') {
    patches.push({ url: u, corpo: JSON.parse(op.body) }); return new Response('', { status: 204 });
  }
  if (u.includes('/rest/v1/emails')) return ok(filaDeEnvio);
  if (u.includes('/auth/v1/user')) return ok({ id: 'u1' });
  return new Response('nao esperado: ' + u, { status: 500 });
};

/* ---------- os testes ---------- */
let ok = 0, falhas = 0;
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { ok++; console.log('  ok   ' + nome); }
  else { falhas++; console.log('  FALHA ' + nome + (detalhe ? '  → ' + detalhe : '')); }
}

await import('../../funcoes/email/index.ts');

/* ===== rodada do cron: as duas caixas ===== */
filaDeEnvio = [];
let r: any = await manipulador(new Request('https://x/', { method: 'POST', headers: { 'x-cron': 'cron-de-teste' } }));
let corpo = await r.json();

console.log('\n1. A leitura da caixa');
conferir('a rodada respondeu 200', r.status === 200, String(r.status));
conferir('duas caixas na resposta', corpo.caixas?.length === 2, JSON.stringify(corpo).slice(0, 300));
conferir('a caixa sem senha ficou sem-credencial',
  patches.some((p) => p.corpo.estado === 'sem-credencial'),
  JSON.stringify(patches.map((p) => p.corpo)).slice(0, 300));
conferir('gravou 2 mensagens (a de UID 9 ficou de fora)', gravados.length === 2,
  gravados.map((g) => g.id).join(' | '));
conferir('a mensagem antiga nao entrou', !gravados.some((g) => g.id.includes('antiga')));
conferir('a armadilha nao virou mensagem falsa',
  !gravados.some((g) => g.id.includes('999') || g.corpo === 'lixo lixo lix'),
  gravados.map((g) => g.id).join(' | '));
conferir('o corpo da armadilha chegou inteiro',
  (gravados.find((g) => g.id.includes('armadilha'))?.corpo || '').includes('a3 OK FETCH completed'),
  JSON.stringify(gravados.find((g) => g.id.includes('armadilha'))?.corpo));

const nova = gravados.find((g) => g.id.includes('normal'));
console.log('\n2. O que foi gravado');
conferir('assunto decodificado', nova?.assunto === 'Preço', nova?.assunto);
conferir('remetente limpo', nova?.de === 'ana@suzano.com.br', nova?.de);
conferir('nome de exibicao', nova?.de_nome === 'Ana Luiza', nova?.de_nome);
conferir('direcao entrada', nova?.direcao === 'entrada', nova?.direcao);
conferir('a citacao antiga foi cortada', !String(nova?.corpo).includes('coisa antiga'), nova?.corpo);
conferir('o que ele escreveu agora ficou', String(nova?.corpo).includes('pode mandar a proposta'), nova?.corpo);
conferir('a data do servidor virou ISO valida',
  /^2026-09-17T12:12:00\.000Z$/.test(String(nova?.enviada_em)), String(nova?.enviada_em));
conferir('nasce sem analise', nova?.analisada_em === undefined);
conferir('thread amarrada', nova?.thread === '<normal@suzano.com.br>', nova?.thread);

console.log('\n3. A marca do ultimo UID');
const marcaUid = patches.filter((p) => p.url.includes('caixas_email') && p.corpo.ultimo_uid);
conferir('avancou para 12', marcaUid.some((p) => p.corpo.ultimo_uid === 12),
  JSON.stringify(marcaUid.map((p) => p.corpo)));
conferir('a caixa ficou ok', patches.some((p) => p.corpo.estado === 'ok'));

/* ===== o envio ===== */
console.log('\n4. O envio');
patches.length = 0; gravados = []; corpoEnviado = '';
filaDeEnvio = [{
  id: '<iad-msgabc@biopartners.com.br>', caixa: CAIXA.endereco, estado: 'fila',
  para: 'ana@suzano.com.br', assunto: 'Proposta da Suzano — versão 2',
  corpo: 'Ana, segue a proposta.\n\nAbraço,\nAlexandre',
  thread: '<normal@suzano.com.br>', responde_a: '<normal@suzano.com.br>'
}];
/* só a caixa que envia deve mandar: chamada de gente logada devolve só a c1 */
r = await manipulador(new Request('https://x/', { method: 'POST', headers: { authorization: 'Bearer token-de-gente' } }));
corpo = await r.json();
conferir('respondeu 200', r.status === 200, String(r.status));
conferir('contou 1 enviado', corpo.caixas?.[0]?.enviados === 1, JSON.stringify(corpo));
conferir('marcou enviada', patches.some((p) => p.url.includes('emails') && p.corpo.estado === 'enviada'),
  JSON.stringify(patches.map((p) => p.corpo)).slice(0, 300));
conferir('nenhuma marcada com erro', !patches.some((p) => p.corpo.estado === 'erro'),
  JSON.stringify(patches.map((p) => p.corpo)).slice(0, 400));

console.log('\n5. A mensagem que saiu');
conferir('From com nome codificado', /^From: =\?UTF-8\?B\?[^\s]+\?= <alexandre\.maia@biopartners\.com\.br>$/m.test(corpoEnviado),
  (corpoEnviado.split('\r\n')[0] || ''));
conferir('o Message-ID do app foi preservado',
  corpoEnviado.includes('Message-ID: <iad-msgabc@biopartners.com.br>'), corpoEnviado.slice(0, 400));
conferir('In-Reply-To presente', corpoEnviado.includes('In-Reply-To: <normal@suzano.com.br>'));
conferir('References presente', /^References: <normal@suzano\.com\.br>$/m.test(corpoEnviado));
const b64 = corpoEnviado.split('\r\n\r\n')[1] || '';
conferir('o corpo decodifica de volta com acento',
  decodeURIComponent(escape(atob(b64.replace(/\r\n/g, '')))).includes('Abraço,'),
  b64.slice(0, 80));
conferir('assunto com acento codificado', /^Subject: =\?UTF-8\?B\?/m.test(corpoEnviado));

console.log('\n6. Quem pode chamar');
const semNada = await manipulador(new Request('https://x/', { method: 'POST' }));
conferir('sem prova nenhuma: 401', semNada.status === 401, String(semNada.status));
const soAnon = await manipulador(new Request('https://x/', { method: 'POST', headers: { authorization: 'Bearer publica-de-teste' } }));
conferir('só a chave publica: 401', soAnon.status === 401, String(soAnon.status));
const cronErrado = await manipulador(new Request('https://x/', { method: 'POST', headers: { 'x-cron': 'chute' } }));
conferir('segredo de cron errado: 401', cronErrado.status === 401, String(cronErrado.status));
const get = await manipulador(new Request('https://x/', { method: 'GET' }));
conferir('GET: 405', get.status === 405, String(get.status));

console.log('\n7. A senha nunca aparece');
const tudo = JSON.stringify({ corpo, patches, gravados }) + corpoEnviado;
conferir('a senha nao esta em nada do que sai', !tudo.includes('aaaabbbbccccdddd'));

console.log('\n' + ok + ' ok, ' + falhas + ' falhas');
if (falhas) process.exit(1);
