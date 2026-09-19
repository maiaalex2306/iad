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
const segredos: Record<string, string> = {};
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

/* O que existe na caixa do servidor de mentira. Além das três de sempre, 40
   mensagens antigas — o caso que derrubou a função de verdade: primeira
   leitura, `ultimo_uid` em zero, e o pedido saindo como "me dê tudo". */
const CAIXA_DO_SERVIDOR: { uid: number; corpo: string }[] = [
  { uid: 9, corpo: ANTIGA }, { uid: 11, corpo: NORMAL }, { uid: 12, corpo: ARMADILHA }
].concat(
  Array.from({ length: 40 }, (_v, i) => ({
    uid: 100 + i,
    corpo: corpoDeUmEmail('velha' + i + '@suzano.com.br', 'ana@suzano.com.br',
      'Assunto ' + i, 'texto ' + i + '\r\n' + 'x'.repeat(200000))
  }))
);

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
      if (cmd === 'LOGIN') {
        return /"aaaabbbbccccdddd"|"ssssrrrroooossssaaaa"/.test(linha)
          ? marca + ' OK logado\r\n'
          : marca + ' NO [AUTHENTICATIONFAILED] Invalid credentials (Failure)\r\n';
      }
      if (cmd === 'SELECT') return '* 3 EXISTS\r\n' + marca + ' OK [READ-WRITE] SELECT completo\r\n';
      if (cmd === 'UID') {
        /* UID de IMAP cabe em 32 bits. Acima disso o servidor de verdade não
           recusa a busca — recusa a LINHA, e a resposta não fala de UID
           nenhum. O servidor de mentira aceitava qualquer número, e por isso
           deixou passar um `UID FETCH 9007199254740992:*` que o Gmail
           respondia com "Could not parse command". */
        const faixa = /UID (?:FETCH|SEARCH)(?: UID)? (\d+)[:,]/.exec(linha);
        if (faixa && Number(faixa[1]) > 4294967295) {
          return marca + ' BAD Could not parse command\r\n';
        }

        if (/UID SEARCH/i.test(linha)) {
          const de = Number((/UID SEARCH UID (\d+):/.exec(linha) || ['', '1'])[1]);
          const achados = CAIXA_DO_SERVIDOR.map((m) => m.uid).filter((u) => u >= de);
          return '* SEARCH ' + achados.join(' ') + '\r\n' + marca + ' OK SEARCH completo\r\n';
        }

        /* Só os UIDs pedidos, e só o pedaço pedido de cada um — como o
           servidor de verdade faz. O fake antigo devolvia a caixa inteira
           para qualquer pedido, e por isso não notava que a função pedia
           tudo de uma vez. */
        const pedidos = ((/UID FETCH ([\d,]+)/.exec(linha) || ['', ''])[1] || '')
          .split(',').filter(Boolean).map(Number);
        const pedaco = Number((/BODY\.PEEK\[\]<0\.(\d+)>/.exec(linha) || ['', '0'])[1]);
        if (!pedaco) return marca + ' BAD pedido sem limite de tamanho\r\n';

        let saida = '';
        pedidos.forEach((uid, i) => {
          const m = CAIXA_DO_SERVIDOR.filter((x) => x.uid === uid)[0];
          if (!m) return;
          const corpo = m.corpo.slice(0, pedaco);
          saida += '* ' + (i + 1) + ' FETCH (UID ' + uid +
            ' INTERNALDATE "17-Sep-2026 12:12:00 +0000" BODY[]<0> {' +
            corpo.length + '}\r\n' + corpo + ')\r\n';
        });
        return saida + marca + ' OK FETCH completo\r\n';
      }
      if (cmd === 'LOGOUT') return '* BYE\r\n' + marca + ' OK\r\n';
      return marca + ' BAD nao entendi\r\n';
    }
  };
  return s;
}

let corpoEnviado = '';
let ultimoImap: Falso | null = null;
const s_imap = () => ultimoImap || { visto: [], fala: () => null };
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
  EMAIL_SEGREDO_CRON: 'cron-de-teste',
  EMAIL_CHAVE_MESTRA: 'uma-frase-longa-e-sorteada-de-verdade-1234567890'
};

let manipulador: any = null;
(globalThis as any).Deno = {
  env: { get: (k: string) => AMBIENTE[k] },
  serve: (h: any) => { manipulador = h; },
  connectTls: async (o: any) => {
    if (o.port === 993) { ultimoImap = servidorImap(); return conexaoFalsa(ultimoImap); }
    return conexaoFalsa(servidorSmtp());
  }
};

const fetchDeVerdade = globalThis.fetch;
(globalThis as any).fetch = async (url: string, op: any = {}) => {
  const u = String(url);
  const ok = (dados: any) => new Response(JSON.stringify(dados), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.includes('/rest/v1/caixas_email') && (!op.method || op.method === 'GET')) {
    /* Os filtros valem de verdade. Um banco de mentira que devolve a mesma
       coisa para qualquer consulta transforma em "ok" justamente os testes
       que existem para provar isolamento — e foi o que ele fez na primeira
       versão: a senha da segunda caixa foi parar na primeira, e "mexer na
       caixa de outro" passou. */
    const filtro = (campo: string) => {
      const m = new RegExp(campo + '=eq\\.([^&]+)').exec(u);
      return m ? decodeURIComponent(m[1]!) : null;
    };
    const dono = filtro('dono_id');
    const endereco = filtro('endereco');
    return ok([CAIXA, CAIXA2].filter((c) =>
      (!dono || c.dono_id === dono) && (!endereco || c.endereco === endereco)));
  }
  if (u.includes('/rest/v1/caixas_email') && op.method === 'PATCH') {
    patches.push({ url: u, corpo: JSON.parse(op.body) }); return new Response('', { status: 204 });
  }
  if (u.includes('/rest/v1/segredos_email') && op.method === 'POST') {
    const linha = JSON.parse(op.body)[0];
    segredos[linha.caixa_id] = linha.senha_cifrada;
    return new Response('', { status: 201 });
  }
  if (u.includes('/rest/v1/segredos_email') && op.method === 'DELETE') {
    const m = /caixa_id=eq\.([^&]+)/.exec(u);
    if (m) delete segredos[m[1]!];
    return new Response('', { status: 204 });
  }
  if (u.includes('/rest/v1/segredos_email')) {
    const m = /caixa_id=eq\.([^&]+)/.exec(u);
    const guardada = m ? segredos[m[1]!] : '';
    return ok(guardada ? [{ senha_cifrada: guardada }] : []);
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
conferir('trouxe no máximo 25 numa rodada', gravados.length === 25, String(gravados.length));
conferir('a resposta carimba a versão do código', /^\d{4}-\d{2}-\d{2}/.test(String(corpo.versao)),
  String(corpo.versao));
/* Caixa com ultimo_uid 10: não é a primeira leitura, então drena do mais
   antigo e avisa quantas faltam. */
conferir('e disse quantas faltam', corpo.caixas?.some((l: any) => l.faltam === 17),
  JSON.stringify(corpo.caixas));
conferir('drenou do mais antigo (11 entrou)', gravados.some((g) => g.id.includes('normal')),
  gravados.map((g) => g.id).slice(0, 4).join(' | '));
conferir('pediu só um pedaço de cada mensagem',
  s_imap().visto.some((l) => /BODY\.PEEK\[\]<0\.65536>/.test(l)),
  s_imap().visto.filter((l) => /FETCH/.test(l)).join(' | ').slice(0, 160));
conferir('perguntou antes de pedir (SEARCH veio primeiro)',
  s_imap().visto.findIndex((l) => /UID SEARCH/.test(l)) <
  s_imap().visto.findIndex((l) => /UID FETCH/.test(l)),
  s_imap().visto.map((l) => l.split(' ').slice(1, 3).join(' ')).join(' | '));
conferir('nunca pediu a caixa inteira',
  !s_imap().visto.some((l) => /UID FETCH \d+:\*/.test(l)),
  s_imap().visto.filter((l) => /FETCH/.test(l)).join(' | ').slice(0, 160));
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
/* 11, 12 e depois 100..122 — vinte e cinco, a mais alta é 122. A próxima
   rodada começa em 123 e drena o resto. */
conferir('avancou para 122', marcaUid.some((p) => p.corpo.ultimo_uid === 122),
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

/* ===== a senha guardada pela própria pessoa ===== */
console.log('\n8. Cada um guarda a própria senha');
patches.length = 0;
const logada = (corpo: unknown) => new Request('https://x/', {
  method: 'POST', headers: { authorization: 'Bearer token-de-gente', 'content-type': 'application/json' },
  body: JSON.stringify(corpo)
});

r = await manipulador(logada({ acao: 'guardar-senha', endereco: CAIXA.endereco, senha: 'aaaabbbbccccdddd' }));
corpo = await r.json();
conferir('guardou', r.status === 200 && corpo.ok === true, JSON.stringify(corpo));
const cifrada = segredos[CAIXA.id] || '';
conferir('guardou ALGUMA coisa', !!cifrada);
conferir('o que foi guardado NÃO é a senha', !cifrada.includes('aaaabbbbccccdddd'), cifrada.slice(0, 40));
conferir('o que foi guardado não é a senha em base64',
  !cifrada.includes(btoa('aaaabbbbccccdddd')), cifrada.slice(0, 40));
conferir('cada gravação sai diferente (vetor sorteado)', await (async () => {
  const antes = segredos[CAIXA.id];
  await manipulador(logada({ acao: 'guardar-senha', endereco: CAIXA.endereco, senha: 'aaaabbbbccccdddd' }));
  return segredos[CAIXA.id] !== antes;
})());
conferir('marcou a data na caixa',
  patches.some((p) => p.url.includes('caixas_email') && p.corpo.senha_em), '');

conferir('guardar a senha não pediu mensagem nenhuma',
  !s_imap().visto.some((l) => /UID FETCH/.test(l)),
  s_imap().visto.join(' | ').slice(0, 200));
conferir('mas entrou e escolheu a pasta',
  s_imap().visto.some((l) => /LOGIN/.test(l)) && s_imap().visto.some((l) => /SELECT/.test(l)),
  s_imap().visto.map((l) => l.split(' ')[1]).join(' '));

console.log('\n9. A senha guardada é a que vale');
/* o mapa do painel não tem a senha da caixa2; a guardada tem de bastar */
delete (AMBIENTE as any).EMAIL_SENHAS_DESLIGADO;
r = await manipulador(logada({ acao: 'guardar-senha', endereco: CAIXA2.endereco, senha: 'ssssrrrroooossssaaaa' }));
corpo = await r.json();
conferir('a segunda caixa aceitou a senha dela', corpo.ok === true, JSON.stringify(corpo));
gravados = []; patches.length = 0;
r = await manipulador(new Request('https://x/', { method: 'POST', headers: { 'x-cron': 'cron-de-teste' } }));
corpo = await r.json();
conferir('nenhuma caixa ficou sem credencial',
  !patches.some((p) => p.corpo.estado === 'sem-credencial'),
  JSON.stringify(patches.map((p) => p.corpo)).slice(0, 300));

console.log('\n9b. A primeira leitura pega as recentes');
gravados = []; patches.length = 0;
/* caixa nova: ultimo_uid zero */
(CAIXA2 as any).ultimo_uid = 0;
r = await manipulador(new Request('https://x/', { method: 'POST', headers: { 'x-cron': 'cron-de-teste' } }));
corpo = await r.json();
const daSegunda = gravados.filter((g) => g.caixa === CAIXA2.endereco);
conferir('trouxe 25', daSegunda.length === 25, String(daSegunda.length));
conferir('as MAIS RECENTES (a de uid 139 entrou)',
  daSegunda.some((g) => g.id.includes('velha39')),
  daSegunda.map((g) => g.id).slice(-3).join(' | '));
conferir('e não as mais antigas (uid 9 ficou de fora)',
  !daSegunda.some((g) => g.id.includes('antiga')), '');
conferir('não promete drenar o arquivo inteiro',
  !corpo.caixas?.some((l: any) => l.caixa === CAIXA2.endereco && l.faltam),
  JSON.stringify(corpo.caixas));

console.log('\n10. Senha errada não entra');
const antesDoErro = segredos[CAIXA.id];
r = await manipulador(logada({ acao: 'guardar-senha', endereco: CAIXA.endereco, senha: 'chute-errado' }));
corpo = await r.json();
conferir('recusou', r.status === 400 && !!corpo.erro, JSON.stringify(corpo));
conferir('o motivo é o do servidor', /credential/i.test(String(corpo.erro)), String(corpo.erro));
conferir('não trocou a senha boa que já estava lá', segredos[CAIXA.id] === antesDoErro);

console.log('\n11. Ninguém mexe na caixa de outro');
r = await manipulador(logada({ acao: 'guardar-senha', endereco: 'rosa.oliveira@acp.tec.br', senha: 'aaaabbbbccccdddd' }));
corpo = await r.json();
conferir('caixa que não é minha: recusa', r.status === 400 && /não achei/.test(String(corpo.erro)), JSON.stringify(corpo));
r = await manipulador(new Request('https://x/', {
  method: 'POST', headers: { 'x-cron': 'cron-de-teste', 'content-type': 'application/json' },
  body: JSON.stringify({ acao: 'guardar-senha', endereco: CAIXA.endereco, senha: 'xxxx' })
}));
conferir('o agendador não guarda senha de ninguém', r.status === 403, String(r.status));

console.log('\n12. Esquecer a senha');
r = await manipulador(logada({ acao: 'esquecer-senha', endereco: CAIXA.endereco }));
corpo = await r.json();
conferir('esqueceu', corpo.ok === true, JSON.stringify(corpo));
conferir('o segredo sumiu', !segredos[CAIXA.id]);
conferir('a caixa voltou a sem-credencial',
  patches.some((p) => p.corpo.estado === 'sem-credencial'),
  JSON.stringify(patches.map((p) => p.corpo)).slice(0, 200));

console.log('\n13. A senha continua sem aparecer');
const tudo2 = JSON.stringify({ patches, gravados, segredos });
conferir('nem a do Alexandre', !tudo2.includes('aaaabbbbccccdddd'));
conferir('nem a da segunda caixa', !tudo2.includes('ssssrrrroooossssaaaa'));

console.log('\n' + ok + ' ok, ' + falhas + ' falhas');
if (falhas) process.exit(1);
