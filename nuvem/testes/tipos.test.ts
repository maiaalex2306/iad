/* Todo tipo que a função sabe RESPONDER tem de estar na lista do que ela ACEITA
   ------------------------------------------------------------------
   POR QUE ESTE TESTE EXISTE

   O tipo `quadro` nasceu com tudo escrito: o prompt de duas páginas, o
   validador de cem linhas, o despacho no handler, o teto de saída, o limite
   de entrada. Cinco lugares, todos certos.

   E o pedido morria antes de chegar em qualquer um deles, com três palavras:

       Não consegui montar o quadro: tipo desconhecido

   Porque existe um PORTÃO logo no começo do handler:

       if (!FORMATOS[tipo]) return responder({ erro: 'tipo desconhecido' }, 400);

   `FORMATOS` é, para a maioria dos tipos, a tabela de regras de cada campo da
   ficha. Mas ela é TAMBÉM — e isso não está no nome dela — a lista do que a
   função aceita. Tipos cuja saída não é uma ficha entram ali com um objeto
   vazio, só para passar pelo portão. Era o caso do `quadro`, e a linha de uma
   chave e duas chaves foi a única das seis que faltou.

   POR QUE NENHUM OUTRO TESTE PEGA

   `deno check` não pega: `FORMATOS` é um registro de execução, não um tipo —
   uma chave a menos é um objeto menor, não um erro de tipagem. Os testes de
   navegador não pegam: eles substituem a chamada à IA, então nunca passam
   pelo portão. E o teste só aparece na mão de quem usa, depois do deploy, que
   é o pior lugar possível para um `if` esquecido.

   A REGRA: todo `tipo === 'x'` que o construtor de prompts conhece tem de ser
   uma chave de FORMATOS. O contrário não vale e não é exigido — um tipo pode
   existir sem prompt próprio e cair no prompt base.

   Rode com:  bun nuvem/testes/tipos.test.ts
*/

import { readFile } from 'node:fs/promises';

const RAIZ = new URL('../../', import.meta.url).pathname;
const sair = (c: number) => { process.exit(c); };

let ok = 0, falhas = 0;
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { ok++; console.log('ok    ' + nome); }
  else { falhas++; console.log('FALHA ' + nome + (detalhe ? '\n      ' + detalhe : '')); }
}

const fonte = await readFile(RAIZ + 'nuvem/funcoes/assistente/index.ts', 'utf8');

/* ---------- o que a função ACEITA ----------
   As chaves de primeiro nível do objeto FORMATOS. Pegamos o bloco inteiro e
   lemos só o que está na coluna de indentação de dois espaços: nomes mais
   fundos são campos de uma ficha, não tipos. */
const bloco = /const FORMATOS: Record<string, Record<string, Regra>> = \{([\s\S]*?)\n\};/.exec(fonte);
conferir('achei a tabela FORMATOS', !!bloco);

const aceitos = new Set<string>();
if (bloco) {
  /* Comentários fora primeiro: eles citam nomes de tipo em prosa, e um
     "o `quadro` entra aqui" dentro de um comentário faria o teste passar
     justamente no caso que ele existe para pegar. */
  bloco[1].replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').forEach((linha) => {
    const m = /^ {2}([a-zA-Z][a-zA-Z0-9]*)\s*:/.exec(linha);
    if (m) aceitos.add(m[1]);
  });
}
conferir('e li os tipos que ela aceita', aceitos.size >= 8,
  [...aceitos].sort().join(', ') || 'nenhum');

/* ---------- o que a função sabe RESPONDER ----------
   Os ramos do construtor de prompts. Só o que está dentro de `promptDe`, para
   não arrastar os `tipo === 'x'` do handler, que decidem teto e limite e não
   significam "a função sabe responder isto". */
const inicio = fonte.indexOf('function promptDe(');
conferir('achei o construtor de prompts', inicio > 0);

const corpoDoPrompt = inicio > 0 ? fonte.slice(inicio, fonte.indexOf('\nfunction ', inicio + 10)) : '';
const semComentario = corpoDoPrompt.replace(/\/\*[\s\S]*?\*\//g, ' ');

const respondidos = new Set<string>();
let m: RegExpExecArray | null;
const re = /tipo === '([a-zA-Z][a-zA-Z0-9]*)'/g;
while ((m = re.exec(semComentario)) !== null) respondidos.add(m[1]);

conferir('e os tipos que ele sabe responder', respondidos.size >= 8,
  [...respondidos].sort().join(', ') || 'nenhum');

/* ---------- a comparação ---------- */
const semPortao = [...respondidos].filter((t) => !aceitos.has(t)).sort();

conferir('todo tipo com prompt passa pelo portão', semPortao.length === 0,
  semPortao.length
    ? 'Tem prompt e NÃO está em FORMATOS:\n      ' +
      semPortao.map((t) => '· ' + t).join('\n      ') +
      '\n\n      O pedido morre em "tipo desconhecido" antes de chegar ao prompt,\n' +
      '      ao validador e ao despacho — todos eles escritos e todos inúteis.\n' +
      '      Conserto: acrescente `' + (semPortao[0] || 'x') + ': {},` em FORMATOS, com um\n' +
      '      comentário dizendo quem valida a saída.'
    : '');

/* E o quadro, nomeado, porque foi ele que custou o deploy. */
conferir('o quadro financeiro está no portão', aceitos.has('quadro'),
  'Era esta a linha que faltava quando a aba Propostas foi ao ar.');

console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
if (falhas) sair(1);
