/* Todo cabeçalho que o app manda precisa estar liberado na função
   ------------------------------------------------------------------
   POR QUE ESTE TESTE EXISTE

   A função `email` ficou um dia inteiro sem funcionar por causa de uma
   palavra que faltava numa lista: `apikey`.

   O navegador, antes de mandar um pedido com cabeçalhos fora do comum, faz
   uma pergunta ao servidor — "posso mandar estes?". Se um só não estiver na
   resposta, ele nega a permissão e o pedido de verdade NUNCA SAI.

   E isso não deixa rastro: a função não é chamada, então não há log, não há
   erro, não há nada para investigar do lado do servidor. Do lado do app o
   sintoma é "a resposta não chegou" — exatamente o mesmo de uma função que
   não foi publicada. Foi nisso que eu acreditei, e mandei o Alexandre
   publicar de novo, conferir nomes e trocar a senha de aplicativo várias
   vezes, atrás de um problema que estava numa vírgula minha.

   Um teste de navegador não pegaria: ele fala com um servidor de mentira,
   sem preflight. O que pega é comparar as duas listas que precisam bater —
   a que o app manda e a que cada função libera. É o que este arquivo faz,
   lendo os arquivos de verdade.

   COMO RODAR, da pasta nuvem/testes:
     bun cors.test.ts     (ou: deno run --allow-read cors.test.ts)

   Lê os arquivos por `node:fs` e não pela API do Deno, para rodar nos dois
   sem mudar nada — o teste é sobre o conteúdo dos arquivos, não sobre quem
   os lê.
*/

import { readFile, readdir } from 'node:fs/promises';

const RAIZ = new URL('../../', import.meta.url).pathname;
const sair = (c: number) => { throw new Error('saindo com ' + c); };

let ok = 0, falhas = 0;
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { ok++; console.log('ok    ' + nome); }
  else { falhas++; console.log('FALHA ' + nome + (detalhe ? '\n      ' + detalhe : '')); }
}

/* ---------- o que o app manda ---------- */
const nuvem = await readFile(RAIZ + 'src/nuvem.js', 'utf8');
const bloco = /function cabecalhos\([^)]*\)\s*\{([\s\S]*?)\n  \}/.exec(nuvem);
if (!bloco) {
  console.log('FALHA não achei a função cabecalhos() em src/nuvem.js');
  throw new Error('sem cabeçalhos para comparar');
}

/* Os nomes literais entre aspas, mais os atribuídos como h.Nome = … */
const mandados = new Set<string>();
for (const m of (bloco[1] || '').matchAll(/['"]([A-Za-z][A-Za-z0-9-]*)['"]\s*:/g)) {
  mandados.add(m[1]!.toLowerCase());
}
for (const m of (bloco[1] || '').matchAll(/\bh\.([A-Za-z][A-Za-z0-9-]*)\s*=/g)) {
  mandados.add(m[1]!.toLowerCase());
}

console.log('O app manda: ' + [...mandados].sort().join(', ') + '\n');
conferir('achei os cabeçalhos do app', mandados.size >= 3, [...mandados].join(', '));

/* ---------- o que cada função libera ---------- */
const pasta = RAIZ + 'nuvem/funcoes';
for (const entrada of await readdir(pasta, { withFileTypes: true })) {
  if (!entrada.isDirectory()) continue;
  let codigo: string;
  try {
    codigo = await readFile(pasta + '/' + entrada.name + '/index.ts', 'utf8');
  } catch (_e) { continue; }
  if (!/Access-Control-Allow-Headers/.test(codigo)) continue;

  const m = /['"]Access-Control-Allow-Headers['"]\s*:\s*['"]([^'"]+)['"]/.exec(codigo);
  const liberados = new Set((m ? m[1]! : '').split(',').map((x) => x.trim().toLowerCase()));
  const faltando = [...mandados].filter((h) => !liberados.has(h));

  conferir('funcao ' + entrada.name + ' libera tudo o que o app manda',
    faltando.length === 0,
    faltando.length
      ? 'falta: ' + faltando.join(', ') + '\n      ' +
        'sem isso o navegador nega a permissão e o pedido nunca sai — e o app\n      ' +
        'mostra "a resposta não chegou", como se a função não existisse'
      : '');
}

console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
if (falhas) sair(1);
