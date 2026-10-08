/* As pastas da caixa de e-mail
   ------------------------------------------------------------------
   POR QUE ESTE TESTE EXISTE

   O IAD lia só a INBOX. A resposta que o vendedor escreve pelo Gmail nasce na
   pasta de ENVIADOS e nunca passa pela entrada, então a conversa aparecia com
   o cliente falando sozinho — e o assistente, que avalia a negociação pelo
   que está escrito, lia silêncio onde houve resposta. Não era um defeito de
   tela: baixava a nota de um negócio bem tocado.

   Ler a segunda pasta trouxe dois jeitos novos de errar, e os dois erram em
   SILÊNCIO, que é o que torna este arquivo necessário:

     1. ACHAR A PASTA ERRADA. A de enviados não tem nome fixo — muda com o
        idioma da conta e com o servidor. A resposta certa vem do atributo
        \Sent (RFC 6154), e o palpite por nome é só o plano B. Uma pasta
        chamada "Representante" tem "sent" no meio: sem borda de palavra, o
        IAD passaria a ler a pasta errada e a dizer que deu tudo certo.

     2. O MARCADOR ÚNICO. UID de IMAP vale dentro de uma pasta só. Com um
        `ultimo_uid` para as duas, a segunda começaria no número da primeira e
        tudo abaixo dele jamais seria lido — sem erro nenhum na tela.

   Nenhum teste de navegador pega isto: no navegador não há IMAP. O que pega é
   provar o recorte da resposta de LIST e a conta do marcador, que é o que
   este arquivo faz.

   Rode com:  bun nuvem/testes/pastas.test.ts
*/
import {
  pastasDaCaixa, ehDeEnviados, pastasDaResposta, enviadosEntre,
  marcasDaCaixa, recomecarDe, NOMES_DE_ENVIADOS
} from '../funcoes/email/pastas.ts';

let ok = 0, falhas = 0;
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { ok++; console.log('ok    ' + nome); }
  else { falhas++; console.log('FALHA ' + nome + (detalhe ? '\n      ' + detalhe : '')); }
}

/* ---------- o recorte da resposta de LIST ----------
   Três servidores de verdade, com as três formas que a linha assume: nome
   entre aspas com espaço e acento, nome cru sem aspas, e separador de pasta
   que não é barra. */
const GMAIL = [
  '* LIST (\\HasNoChildren) "/" "INBOX"',
  '* LIST (\\HasChildren \\Noselect) "/" "[Gmail]"',
  '* LIST (\\All \\HasNoChildren) "/" "[Gmail]/Todos os e-mails"',
  '* LIST (\\HasNoChildren \\Sent) "/" "[Gmail]/E-mails enviados"',
  '* LIST (\\HasNoChildren \\Trash) "/" "[Gmail]/Lixeira"',
  'x1a OK Success'
].join('\r\n');

const OUTLOOK = [
  '* LIST (\\HasNoChildren) "/" Inbox',
  '* LIST (\\HasNoChildren \\Sent) "/" "Sent Items"',
  '* LIST (\\HasNoChildren) "/" "Representante Comercial"',
  'x2a OK LIST completed'
].join('\r\n');

/* Servidor próprio antigo: não marca atributo nenhum. Só o nome salva. */
const PROPRIO = [
  '* LIST (\\HasNoChildren) "." INBOX',
  '* LIST (\\HasNoChildren) "." INBOX.Sent',
  '* LIST (\\HasNoChildren) "." INBOX.Trash',
  'x3a OK'
].join('\r\n');

conferir('leio todas as pastas do Gmail', pastasDaResposta(GMAIL).length === 5,
  pastasDaResposta(GMAIL).length + ' pastas');
conferir('e a linha final do comando não vira pasta',
  pastasDaResposta(GMAIL).filter((p) => /OK/.test(p.nome)).length === 0);

conferir('acho os enviados do Gmail pelo atributo',
  enviadosEntre(pastasDaResposta(GMAIL)) === '[Gmail]/E-mails enviados',
  enviadosEntre(pastasDaResposta(GMAIL)));
conferir('acho os enviados do Outlook',
  enviadosEntre(pastasDaResposta(OUTLOOK)) === 'Sent Items',
  enviadosEntre(pastasDaResposta(OUTLOOK)));
conferir('e no servidor que não marca nada, pelo nome',
  enviadosEntre(pastasDaResposta(PROPRIO)) === 'INBOX.Sent',
  enviadosEntre(pastasDaResposta(PROPRIO)));

conferir('o nome sai VERBATIM, com acento e espaço',
  pastasDaResposta(GMAIL).filter((p) => p.nome === '[Gmail]/Todos os e-mails').length === 1);

conferir('quando não há pasta de enviados, devolvo vazio',
  enviadosEntre(pastasDaResposta('* LIST (\\HasNoChildren) "/" "INBOX"\r\nx9 OK')) === '');

/* ---------- a armadilha do "sent" no meio da palavra ---------- */
conferir('"Representante" NÃO é pasta de enviados', !ehDeEnviados('Representante Comercial'));
conferir('"Presentes" NÃO é pasta de enviados', !ehDeEnviados('Presentes'));
conferir('"INBOX" NÃO é pasta de enviados', !ehDeEnviados('INBOX'));
conferir('"Sent Items" é', ehDeEnviados('Sent Items'));
conferir('"INBOX.Sent" é', ehDeEnviados('INBOX.Sent'));
conferir('"[Gmail]/E-mails enviados" é', ehDeEnviados('[Gmail]/E-mails enviados'));
conferir('todo nome da lista se reconhece a si mesmo',
  NOMES_DE_ENVIADOS.filter((n) => !ehDeEnviados(n)).length === 0,
  NOMES_DE_ENVIADOS.filter((n) => !ehDeEnviados(n)).join(', '));

/* ---------- a lista de pastas da caixa ---------- */
conferir('caixa sem nada lê a INBOX',
  pastasDaCaixa({}).join(',') === 'INBOX');
conferir('caixa com vírgula solta não cria pasta vazia',
  pastasDaCaixa({ pastas: 'INBOX, ,[Gmail]/Sent Mail,' }).join('|') === 'INBOX|[Gmail]/Sent Mail',
  pastasDaCaixa({ pastas: 'INBOX, ,[Gmail]/Sent Mail,' }).join('|'));
conferir('e pasta repetida entra uma vez só',
  pastasDaCaixa({ pastas: 'INBOX,inbox,INBOX' }).length === 1);

/* ---------- o marcador, que é por pasta ---------- */
const migrada = marcasDaCaixa({ pastas: 'INBOX', ultimo_uid: 1841, marcas: {} });
conferir('a caixa migrada NÃO recomeça do zero',
  migrada.INBOX && migrada.INBOX.uid === 1841,
  JSON.stringify(migrada));

const duas = marcasDaCaixa({
  pastas: 'INBOX,[Gmail]/E-mails enviados', ultimo_uid: 1841,
  marcas: { 'INBOX': { uid: 1900, validade: 17 }, '[Gmail]/E-mails enviados': { uid: 623, validade: 11 } }
});
conferir('cada pasta guarda o próprio número',
  duas['INBOX'].uid === 1900 && duas['[Gmail]/E-mails enviados'].uid === 623,
  JSON.stringify(duas));
conferir('e a marca gravada ganha do ultimo_uid antigo', duas['INBOX'].uid === 1900);

const semMarca = marcasDaCaixa({ pastas: 'INBOX,[Gmail]/E-mails enviados', ultimo_uid: 1841, marcas: {} });
conferir('pasta nova começa sem marca — e vai ler as mais recentes',
  semMarca['[Gmail]/E-mails enviados'] === undefined,
  JSON.stringify(semMarca));

/* ---------- UIDVALIDITY ---------- */
conferir('validade igual: continua de onde parou',
  recomecarDe({ uid: 900, validade: 17 }, 17) === 900);
conferir('validade diferente: recomeça do zero',
  recomecarDe({ uid: 900, validade: 17 }, 99) === 0);
conferir('validade desconhecida (caixa migrada) NÃO recomeça',
  recomecarDe({ uid: 900, validade: 0 }, 17) === 900);
conferir('servidor que não informa validade também não recomeça',
  recomecarDe({ uid: 900, validade: 17 }, 0) === 900);

console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
