/* Módulo que não vem no boot precisa ser PEDIDO antes de ser usado
   ------------------------------------------------------------------
   POR QUE ESTE TESTE EXISTE

   A v286.73 (PERF-36B1) tirou `documentos.js` do `index.html` para o shell
   abrir com menos scripts, e passou a carregá-lo sob demanda. O `app.js` foi
   ajustado nos dois pontos dele. Dois pontos no `ui.js` ficaram para trás,
   chamando `global.IADDocumentos.lerVarios(...)` direto.

   O que a pessoa via: abria "Concluir tarefa", anexava a ata da reunião, e o
   recado dizia **"Lendo 1 arquivo…"** — para sempre. Por trás, um
   `Cannot read properties of undefined (reading 'lerVarios')`. Falha calada
   com cara de progresso, que é o pior formato que existe neste app: aqui o
   erro tem de gritar. Nada ficou vermelho: os testes de banco, de versão e de
   CI passavam todos, porque nenhum deles sabia que um módulo havia saído da
   página.

   O que este teste cobre não é aquele defeito — é a CLASSE dele. Toda vez que
   alguém tirar um script do `index.html` para ganhar carregamento, os usos
   dele espalhados pelos outros arquivos ficam órfãos do mesmo jeito. Então a
   regra é: para cada módulo que está no cache do `sw.js` mas não é carregado
   por nenhuma página, todo arquivo que mexe no global dele tem de,
   ANTES, ou perguntar se ele existe, ou pedir pelo carregador.

   Limite honesto desta trava: ela confere por ARQUIVO e por ordem de linha,
   não por função. Um arquivo que peça o módulo numa função e o use solto em
   outra passa. É coarse de propósito — pega o esquecimento real (um arquivo
   que não pede nunca) sem exigir um analisador de escopo.

   Rode com:  bun nuvem/testes/opcionais.test.ts
*/

import { readFile, readdir } from 'node:fs/promises';

/* Comentário é prosa: não pode violar a regra nem satisfazê-la. Apagamos o
   conteúdo dos comentários mantendo as quebras de linha, para o número da
   linha no relatório continuar apontando o lugar certo do arquivo. */
function semComentarios(fonte: string): string {
  let fora = '';
  let i = 0;
  while (i < fonte.length) {
    const dois = fonte.slice(i, i + 2);
    if (dois === '/*') {
      const fim = fonte.indexOf('*/', i + 2);
      const trecho = fonte.slice(i, fim < 0 ? fonte.length : fim + 2);
      fora += trecho.replace(/[^\n]/g, ' ');
      i += trecho.length;
    } else if (dois === '//') {
      const fim = fonte.indexOf('\n', i);
      const trecho = fonte.slice(i, fim < 0 ? fonte.length : fim);
      fora += trecho.replace(/[^\n]/g, ' ');
      i += trecho.length;
    } else {
      fora += fonte[i];
      i += 1;
    }
  }
  return fora;
}

const RAIZ = new URL('../../', import.meta.url).pathname;
const sair = (c: number) => { throw new Error('saindo com ' + c); };

let ok = 0, falhas = 0;
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { ok++; console.log('ok    ' + nome); }
  else { falhas++; console.log('FALHA ' + nome + (detalhe ? '\n      ' + detalhe : '')); }
}

const sw = await readFile(RAIZ + 'sw.js', 'utf8');

/* 1. Quais módulos o sw.js guarda, e quais alguma página realmente carrega. */
const noCache = [...sw.matchAll(/['"]\.\/src\/([a-z0-9-]+)\.js['"]/g)].map(m => m[1]);
conferir('li a lista de arquivos do sw.js', noCache.length > 10,
  'achei ' + noCache.length + ' arquivos em sw.js');

const paginas = (await readdir(RAIZ)).filter(f => f.endsWith('.html'));
conferir('achei as páginas html', paginas.length >= 1, 'páginas: ' + paginas.join(', '));

let htmlTodo = '';
for (const p of paginas) htmlTodo += await readFile(RAIZ + p, 'utf8');

const opcionais = [...new Set(noCache)].filter(n => !htmlTodo.includes('src/' + n + '.js'));
conferir('achei pelo menos um módulo sob demanda', opcionais.length >= 1,
  'nenhum módulo opcional: se o app voltou a carregar tudo no boot, este teste\n      ' +
  'perdeu o objeto e vira verde vazio — confira antes de apagá-lo');

/* 2. Que global cada um define. */
const globalDe: Record<string, string> = {};
for (const n of opcionais) {
  const fonte = await readFile(RAIZ + 'src/' + n + '.js', 'utf8');
  const m = /global\.(IAD[A-Za-z]+)\s*=/.exec(fonte);
  if (m) globalDe[n] = m[1];
}
conferir('cada módulo sob demanda publica um global',
  opcionais.every(n => globalDe[n]),
  'sem global: ' + opcionais.filter(n => !globalDe[n]).join(', '));

/* 3. A regra, e as DUAS vezes que eu errei ao escrevê-la.

   Primeira tentativa: por ARQUIVO — se o arquivo pedisse o módulo em alguma
   linha anterior, todo uso posterior passava. Desfiz o conserto do `ui.js`
   para ver a trava pegar e ela **não pegou**: o helper que ficou no arquivo
   tem a guarda numa linha de cima, e isso dava passe livre aos usos soltos lá
   embaixo. Era o mesmo erro que a trava existe para impedir, cometido dentro
   dela.

   Segunda tentativa: estrita, só valendo guarda na MESMA linha. Uma hora
   depois, o PERF-36K1 pôs `views-manual.js` sob demanda e escreveu o uso na
   forma normal e correta:

       if (global.IADViewsManual && typeof ... === 'function') {
         return global.IADViewsManual.playbook();
       }

   A trava reprovou isso. Ou seja: reprovaria todo uso certo em bloco `if`,
   virando vermelho permanente que não quer dizer nada — a MESMA doença dos
   três testes de versão que eu tinha acabado de consertar, reintroduzida por
   mim, na trava contra reintroduzir coisas.

   Terceira forma, a que ficou: a guarda vale se estiver na mesma linha OU em
   até 8 linhas acima COM INDENTAÇÃO MENOR — isto é, abrindo um bloco que
   contém o uso. Aceita a forma em bloco, continua recusando uma guarda solta
   numa função distante, e quem usa o carregador recebe o módulo num parâmetro
   local (`D.lerVarios(...)`) e nem encosta nesta regra.

   Limite honesto: é indentação, não escopo de verdade. Um `if` guardando
   outra coisa, logo acima e menos indentado, passaria. Troquei precisão por
   uma regra que não grita à toa — porque trava que grita à toa é pior que
   trava nenhuma. */
const JANELA = 8;
const arquivos = (await readdir(RAIZ + 'src')).filter(f => f.endsWith('.js'));
const problemas: string[] = [];

function indent(linha: string): number {
  const m = /^[ \t]*/.exec(linha);
  return m ? m[0].length : 0;
}

for (const [modulo, g] of Object.entries(globalDe)) {
  const usa = new RegExp('(?:global|window)\\.' + g + '\\s*\\.', '');
  const guarda = new RegExp(
    '(?:if|&&|\\|\\||\\?)\\s*\\(?\\s*!?\\s*(?:global|window)\\.' + g + '\\b', '');

  for (const f of arquivos) {
    if (f === modulo + '.js') continue;            /* o próprio módulo pode */
    const linhas = semComentarios(await readFile(RAIZ + 'src/' + f, 'utf8')).split('\n');
    for (let i = 0; i < linhas.length; i++) {
      if (!usa.test(linhas[i])) continue;
      if (guarda.test(linhas[i])) continue;        /* guarda na mesma linha */
      let protegido = false;
      for (let j = i - 1; j >= 0 && j >= i - JANELA; j--) {
        if (!linhas[j].trim()) continue;
        if (guarda.test(linhas[j]) && indent(linhas[j]) < indent(linhas[i])) {
          protegido = true;                        /* o uso está dentro do bloco */
          break;
        }
      }
      if (protegido) continue;
      problemas.push('src/' + f + ':' + (i + 1) + ' mexe em ' + g +
        ' sem nenhuma guarda de ' + modulo + '.js por perto');
    }
  }
}

conferir('todo uso de módulo sob demanda está sob uma guarda',
  problemas.length === 0,
  problemas.join('\n      ') + (problemas.length ? '\n      ' +
  'Esses módulos não vêm no index.html. Sem pedir, o global é undefined e o\n      ' +
  'handler estoura calado — foi assim que "Lendo 1 arquivo…" ficou eterno.' : ''));

console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
if (falhas) sair(1);
