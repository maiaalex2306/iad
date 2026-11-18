/* O leitor de PDF, contra as formas que o mundo real usa
   ------------------------------------------------------------------
   POR QUE ESTE TESTE EXISTE

   O vendedor anexou o infográfico executivo de um cliente e o app respondeu
   "não deu para ler — provavelmente é digitalizado (foto do papel). Salve como
   Word". O arquivo não era foto de papel nenhuma: tinha 3 mil caracteres de
   texto, com acento, incluindo os números que sustentavam a proposta.

   A frase era a MESMA para quatro causas diferentes, e em três delas era
   mentira — mentira cara, porque manda converter um arquivo que não tem
   problema de conversão, e a pessoa volta com o mesmo erro.

   Um PDF não guarda texto: guarda instruções de desenho. Entre o arquivo e a
   frase que o vendedor escreveu há cinco camadas, e cada uma tem um jeito de
   falhar calada:

     1. A CADEIA DE FILTROS. `/Filter [/ASCII85Decode /FlateDecode]` são dois
        filtros, nesta ordem. O app só conhecia o Flate e entregava ao
        descompressor um texto ASCII85 — que ele recusa. Era esta a causa do
        arquivo do GELITA, e é o padrão do Inkscape e do Cairo, que geram quase
        todo material de marketing.
     2. OS OBJETOS DENTRO DE UM /ObjStm. Desde o PDF 1.5 as fontes podem morar
        comprimidas dentro de um fluxo. Sem abri-lo elas não existem, e sem
        fonte não há tabela para traduzir glifo em letra.
     3. O /Font COMO REFERÊNCIA INDIRETA — `/Font 1 0 R` em vez do dicionário
        escrito. Metade dos editores gráficos faz assim.
     4. O NOME DO RECURSO. `/F2+0` tem um `+`, que não é letra. O nome saía
        cortado em "F2", o mapa ficava guardado em "F2+0", e os dois nunca se
        encontravam.
     5. O QUE NÃO DÁ PARA LER MESMO. PDF protegido por senha e PDF cujo texto
        virou contorno. Aqui a resposta certa é dizer qual dos dois é.

   Os arquivos são GERADOS AQUI, em código, e não guardados como binário. Um
   PDF de teste comitado é um arquivo que ninguém relê: daqui a um ano ninguém
   sabe o que ele tem dentro nem por que foi escolhido. Em código, cada forma
   está escrita ao lado do que ela prova.

   Rode com:  bun nuvem/testes/pdf.test.ts
*/
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

let ok = 0, falhas = 0;
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { ok++; console.log('ok    ' + nome); }
  else { falhas++; console.log('FALHA ' + nome + (detalhe ? '\n      ' + detalhe : '')); }
}

/* ---------- o módulo do app, carregado num `window` de mentira ----------
   src/documentos.js é um IIFE que se pendura no window. Lido como texto e
   executado com um objeto no lugar do window, ele entrega a mesma API que o
   navegador usa — ou seja, o teste exercita o código que é PUBLICADO. */
const fonte = readFileSync(new URL('../../src/documentos.js', import.meta.url).pathname, 'utf8');
const janela: Record<string, unknown> = {};
new Function('window', fonte)(janela);
const Doc = janela.IADDocumentos as { ler: (f: File) => Promise<string> };
conferir('carreguei o leitor do app', !!Doc && typeof Doc.ler === 'function');

/* ---------- a montagem dos PDFs ---------- */
const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const texto = (u: Uint8Array) => Array.from(u, (b) => String.fromCharCode(b)).join('');

function emAscii85(u: Uint8Array): string {
  let saida = '';
  for (let i = 0; i < u.length; i += 4) {
    const resto = Math.min(4, u.length - i);
    let n = 0;
    for (let k = 0; k < 4; k++) n = (n * 256) + (k < resto ? u[i + k] : 0);
    if (n === 0 && resto === 4) { saida += 'z'; continue; }
    const cinco: string[] = [];
    let v = n >>> 0;
    for (let k = 4; k >= 0; k--) { cinco[k] = String.fromCharCode(33 + (v % 85)); v = Math.floor(v / 85); }
    saida += cinco.join('').slice(0, resto + 1);
  }
  return saida + '~>';
}

function fluxo(dado: Uint8Array | string, dic = '', ascii85 = false): string {
  const cru = typeof dado === 'string' ? bytes(dado) : dado;
  const z = new Uint8Array(deflateSync(cru));
  const corpo = ascii85 ? emAscii85(z) : texto(z);
  const filtro = ascii85 ? '/Filter [ /ASCII85Decode /FlateDecode ]' : '/Filter /FlateDecode';
  return '<< ' + dic + ' ' + filtro + ' /Length ' + corpo.length + ' >>\nstream\n' + corpo + '\nendstream';
}

function montar(objs: [number, string][], extraTrailer = ''): File {
  let saida = '%PDF-1.5\n';
  const offs: Record<number, number> = {};
  objs.forEach(([num, corpo]) => {
    offs[num] = saida.length;
    saida += num + ' 0 obj\n' + corpo + '\nendobj\n';
  });
  const xref = saida.length;
  saida += 'xref\n';
  objs.forEach(([num]) => {
    saida += num + ' 1\n' + String(offs[num]).padStart(10, '0') + ' 00000 n \n';
  });
  saida += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R ' + extraTrailer +
    '>>\nstartxref\n' + xref + '\n%%EOF\n';
  return new File([bytes(saida)], 'teste.pdf', { type: 'application/pdf' });
}

/* O CMap que traduz índice de glifo em letra, com acento de propósito: é onde
   o encoding de verdade quebra, e "VISÃO" virando "VISO" passa despercebido. */
const FRASE = 'VISÃO EXECUTIVA ÁGUA 62,3 m³/t';
function cmapDe(frase: string): string {
  const linhas = ['/CIDInit /ProcSet findresource begin 12 dict begin begincmap',
    '1 begincodespacerange <0000> <FFFF> endcodespacerange',
    frase.length + ' beginbfchar'];
  for (let i = 0; i < frase.length; i++) {
    linhas.push('<' + (i + 1).toString(16).padStart(4, '0').toUpperCase() + '> <' +
      frase.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase() + '>');
  }
  linhas.push('endbfchar', 'endcmap CMapName currentdict /CMap defineresource pop end end');
  return linhas.join('\n');
}
const HEX = Array.from(FRASE, (_, i) => (i + 1).toString(16).padStart(4, '0').toUpperCase()).join('');
const CONTEUDO = 'BT /F5+0 12 Tf 72 720 Td <' + HEX + '> Tj ET';
const FONTE_TIPO0 = '<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+Lato ' +
  '/Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>';
const FONTE_FILHA = '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /AAAAAA+Lato >>';

async function lerEsperando(arquivo: File): Promise<{ ok: boolean; saida: string }> {
  try { return { ok: true, saida: await Doc.ler(arquivo) }; }
  catch (e) { return { ok: false, saida: String((e as Error).message || e) }; }
}

/* ---------- 1. o clássico, que sempre funcionou ---------- */
let r = await lerEsperando(montar([
  [1, '<< /Type /Catalog /Pages 2 0 R >>'],
  [2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
  [3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'],
  [4, fluxo('BT /F1 12 Tf 72 720 Td (Proposta: R$ 840.000 por ano) Tj ET')],
  [5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
]));
conferir('texto literal continua saindo', r.ok && /840\.000/.test(r.saida), r.saida.slice(0, 120));

/* ---------- 2. a CADEIA DE FILTROS: o caso do arquivo real ---------- */
r = await lerEsperando(montar([
  [1, '<< /Type /Catalog /Pages 2 0 R >>'],
  [2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
  [3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F5+0 5 0 R >> >> /Contents 4 0 R >>'],
  [4, fluxo(CONTEUDO, '', true)],
  [5, FONTE_TIPO0],
  [6, FONTE_FILHA],
  [7, fluxo(cmapDe(FRASE), '', true)]
]));
conferir('ASCII85 + Flate em cadeia: o texto sai', r.ok && r.saida.indexOf('VISÃO EXECUTIVA') !== -1,
  r.saida.slice(0, 160));
conferir('e o acento atravessa inteiro', r.ok && r.saida.indexOf('ÁGUA') !== -1 && r.saida.indexOf('m³') !== -1,
  r.saida.slice(0, 160));

/* ---------- 3. o /Font como referência indireta ---------- */
r = await lerEsperando(montar([
  [1, '<< /Type /Catalog /Pages 2 0 R >>'],
  [2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
  [3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font 8 0 R >> /Contents 4 0 R >>'],
  [4, fluxo(CONTEUDO)],
  [5, FONTE_TIPO0],
  [6, FONTE_FILHA],
  [7, fluxo(cmapDe(FRASE))],
  [8, '<< /F5+0 5 0 R >>']
]));
conferir('/Font 1 0 R (dicionário em outro objeto) é seguido',
  r.ok && r.saida.indexOf('VISÃO EXECUTIVA') !== -1, r.saida.slice(0, 160));

/* ---------- 4. o nome com `+`, que não é letra ---------- */
conferir('o nome /F5+0 casa dos dois lados — se não casasse, nada acima teria passado',
  r.ok && r.saida.indexOf('62,3') !== -1, r.saida.slice(0, 160));

/* ---------- 5. os objetos dentro de um /ObjStm ----------
   Num arquivo de verdade os objetos de dentro NÃO existem como "N 0 obj" em
   lugar nenhum: o xref aponta para dentro do fluxo. É o que esta montagem
   reproduz — sem isso o teste passaria pelo objeto clássico e não provaria
   nada. */
const dentro: [number, string][] = [
  [3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F5+0 5 0 R >> >> /Contents 4 0 R >>'],
  [5, FONTE_TIPO0],
  [6, FONTE_FILHA]
];
let corpoStm = '', pares: string[] = [];
dentro.forEach(([num, dado]) => { pares.push(num + ' ' + corpoStm.length); corpoStm += dado + ' '; });
const cabStm = pares.join(' ') + '\n';
r = await lerEsperando(montar([
  [1, '<< /Type /Catalog /Pages 2 0 R >>'],
  [2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
  [4, fluxo(CONTEUDO)],
  [7, fluxo(cmapDe(FRASE))],
  [8, fluxo(cabStm + corpoStm, '/Type /ObjStm /N ' + dentro.length + ' /First ' + cabStm.length)]
]));
conferir('fontes que moram dentro de um /ObjStm são encontradas',
  r.ok && r.saida.indexOf('VISÃO EXECUTIVA') !== -1, r.saida.slice(0, 160));

/* ---------- 6. o que NÃO dá para ler: cada um com o seu motivo ---------- */
r = await lerEsperando(montar([
  [1, '<< /Type /Catalog /Pages 2 0 R >>'],
  [2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
  [3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>'],
  [4, fluxo('\u009a?\u0011 lixo cifrado \u0012')],
  [5, '<< /Filter /Standard /V 4 /R 4 /P -1340 >>']
], '/Encrypt 5 0 R /ID [<0102> <0304>] '));
conferir('PDF protegido é chamado de protegido', !r.ok && /PROTEGIDO/.test(r.saida), r.saida.slice(0, 120));
conferir('e NÃO é chamado de digitalizado', !/digitalizado/i.test(r.saida));

r = await lerEsperando(montar([
  [1, '<< /Type /Catalog /Pages 2 0 R >>'],
  [2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
  [3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>'],
  [4, fluxo('0 0 1 rg 72 700 m 200 700 l 200 600 l f')]
]));
conferir('texto virado contorno: "só desenho", que é a verdade',
  !r.ok && /só desenho/.test(r.saida), r.saida.slice(0, 120));
conferir('e a saída oferecida é a certa (colar, ou o Word de origem)',
  /cole na caixa/.test(r.saida) && /Word/.test(r.saida));

/* ---------- 7. as peças soltas que custaram caro ---------- */
/* A frase antiga, exata, como ela era lançada. Procurar só por
   "digitalizado" acusaria o comentário que conta a história — e um teste que
   proíbe contar a história é um teste que apaga o motivo. */
conferir('a mensagem única para quatro causas não é mais lançada',
  fonte.indexOf('Este PDF não tem texto que eu consiga ler') === -1);
conferir('o nome de PDF aceita o que não é letra',
  /NOME_PDF/.test(fonte) && fonte.indexOf("'[^\\\\s/<>\\\\[\\\\]{}()%]+'") !== -1);
conferir('a cadeia de filtros entende ASCII85 e ASCIIHex',
  /ASCII85Decode/.test(fonte) && /ASCIIHexDecode/.test(fonte));
conferir('e para numa imagem em vez de entregar bytes de foto ao leitor de texto',
  /DCTDecode é JPEG/.test(fonte));

console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
