import { lerMensagem, separarCabecalhos, decodificarPalavras, limpar, corpoEmTexto, enderecoDe, nomeDe } from '../../funcoes/email/mime.ts';

let ok = 0, falhas = 0;
function eq(nome: string, real: unknown, esperado: unknown) {
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (bate) { ok++; console.log('ok    ' + nome); }
  else { falhas++; console.log('FALHA ' + nome + '\n      esperado: ' + JSON.stringify(esperado) + '\n      veio:     ' + JSON.stringify(real)); }
}
function contem(nome: string, real: string, trecho: string) {
  if (String(real).includes(trecho)) { ok++; console.log('ok    ' + nome); }
  else { falhas++; console.log('FALHA ' + nome + '\n      não achei "' + trecho + '" em: ' + JSON.stringify(String(real).slice(0, 200))); }
}

// 1. cabeçalho quebrado em várias linhas
const dobrado = 'Subject: Informacoes para estruturacao do piloto\r\n e definicao do ROI\r\nFrom: a@b.com\r\n\r\ncorpo';
eq('cabeçalho dobrado se junta', separarCabecalhos(dobrado).cabecalhos['subject'],
   'Informacoes para estruturacao do piloto e definicao do ROI');

// 2. assunto com acento, base64 e quoted-printable, em pedaços
eq('=?UTF-8?B?', decodificarPalavras('=?UTF-8?B?SW5mb3JtYcOnw7VlcyBkbyBwaWxvdG8=?='), 'Informações do piloto');
eq('=?UTF-8?Q?', decodificarPalavras('=?UTF-8?Q?Vaz=C3=A3o_e_macromedidor?='), 'Vazão e macromedidor');
eq('dois pedaços colados', decodificarPalavras('=?UTF-8?B?Vmlhw6fDo28g?= =?UTF-8?B?ZG8gcGlsb3Rv?='), 'Viação do piloto');
eq('ISO-8859-1', decodificarPalavras('=?ISO-8859-1?Q?Informa=E7=F5es?='), 'Informações');

// 3. endereço e nome
eq('endereço de "Nome <a@b>"', enderecoDe('ANA LUIZA <ANAMIRANDA@suzano.com.br>'), 'anamiranda@suzano.com.br');
eq('endereço sem nome', enderecoDe('marco@suzano.com.br'), 'marco@suzano.com.br');
eq('nome com acento codificado', nomeDe('=?UTF-8?B?QW5hIEzDunphIEdpYWNvbg==?= <a@b.com>'), 'Ana Lúza Giacon');
eq('nome entre aspas', nomeDe('"Fuzato, Marco" <marco@suzano.com.br>'), 'Fuzato, Marco');

// 4. multipart/alternative: tem de preferir o text/plain
const alt = [
  'Message-ID: <abc@mail.gmail.com>',
  'From: Ana <ana@suzano.com.br>',
  'To: alexandre.maia@biopartners.com.br',
  'Subject: =?UTF-8?B?UGlsb3RvIExpbWVpcmE=?=',
  'Date: Wed, 16 Sep 2026 14:02:11 -0300',
  'Content-Type: multipart/alternative; boundary="LIMITE1"',
  '',
  '--LIMITE1',
  'Content-Type: text/plain; charset="UTF-8"',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Alexandre, o prazo do piloto =C3=A9 mar=C3=A7o.',
  '',
  '--LIMITE1',
  'Content-Type: text/html; charset="UTF-8"',
  '',
  '<div>Alexandre, o prazo do piloto &eacute; mar&ccedil;o.</div>',
  '--LIMITE1--'
].join('\r\n');
const m1 = lerMensagem(alt);
eq('id', m1.id, '<abc@mail.gmail.com>');
eq('de', m1.de, 'ana@suzano.com.br');
eq('assunto decodificado', m1.assunto, 'Piloto Limeira');
eq('corpo: preferiu o text/plain e decodificou', m1.corpo, 'Alexandre, o prazo do piloto é março.');
eq('thread começa nela mesma', m1.thread, '<abc@mail.gmail.com>');

// 5. multipart/mixed com anexo: o anexo NÃO pode virar corpo
const comAnexo = [
  'Message-ID: <ax@x>', 'From: a@b.com', 'Subject: Proposta',
  'Content-Type: multipart/mixed; boundary="M"', '',
  '--M', 'Content-Type: multipart/alternative; boundary="A"', '',
  '--A', 'Content-Type: text/plain; charset="UTF-8"', '', 'Segue em anexo.', '',
  '--A--', '',
  '--M', 'Content-Type: application/pdf; name="proposta.pdf"',
  'Content-Disposition: attachment; filename="proposta.pdf"',
  'Content-Transfer-Encoding: base64', '',
  'JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PC9MZW5ndGggNiAwIFI=', '',
  '--M--'
].join('\r\n');
eq('anexo não vira corpo', lerMensagem(comAnexo).corpo, 'Segue em anexo.');

// 6. só HTML
const soHtml = ['Message-ID: <h@x>', 'From: a@b.com', 'Content-Type: text/html; charset="UTF-8"', '',
  '<style>p{color:red}</style><p>Bom dia,</p><p>Segue o ROI.</p>'].join('\r\n');
eq('html vira texto, sem o style', lerMensagem(soHtml).corpo, 'Bom dia,\n\nSegue o ROI.');

// 7. base64 no corpo
const b64 = ['Message-ID: <b@x>', 'From: a@b.com', 'Content-Type: text/plain; charset="UTF-8"',
  'Content-Transfer-Encoding: base64', '', 'QWxleGFuZHJlLCBvIHByYXpvIMOpIG1hcsOnby4='].join('\r\n');
eq('corpo em base64', lerMensagem(b64).corpo, 'Alexandre, o prazo é março.');

// 8. thread: References manda, e é o PRIMEIRO
const resposta = ['Message-ID: <r3@x>', 'From: a@b.com',
  'In-Reply-To: <r2@x>', 'References: <r1@x> <r2@x>', 'Content-Type: text/plain', '', 'ok combinado'].join('\r\n');
const m8 = lerMensagem(resposta);
eq('thread = primeiro References', m8.thread, '<r1@x>');
eq('respondeA = In-Reply-To', m8.respondeA, '<r2@x>');

// 9. a cadeia citada é cortada
eq('corta "Em ... escreveu:"',
   limpar('Segue o ROI consolidado.\n\nEm 12/09/2026, Alexandre Maia escreveu:\n> texto antigo\n> mais texto'),
   'Segue o ROI consolidado.');
eq('corta "On ... wrote:"',
   limpar('Thanks.\n\nOn Sep 12, 2026, Alexandre wrote:\n> old'), 'Thanks.');
eq('corta cabeçalho de encaminhamento em português',
   limpar('Resposta nova.\n\nDe: Alexandre Maia <a@b.com>\nEnviada em: sexta\nPara: Ana'), 'Resposta nova.');
eq('tira linhas citadas soltas',
   limpar('Resposta.\n> citacao\nfim'), 'Resposta.\nfim');

// 10. data: cabeçalho quando o servidor não informa
eq('data do cabeçalho vira ISO', lerMensagem(alt).quando, new Date('Wed, 16 Sep 2026 14:02:11 -0300').toISOString());
eq('data do servidor manda', lerMensagem(alt, '2026-09-17T10:00:00.000Z').quando, '2026-09-17T10:00:00.000Z');

// 11. lixo não derruba
const quebrado = 'isto nao e um email';
const m11 = lerMensagem(quebrado);
eq('mensagem quebrada não explode', typeof m11.corpo, 'string');

console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
if (falhas) process.exit(1);
