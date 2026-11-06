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

/* 3. A regra, e por que ela é por LINHA e não por arquivo.

   A primeira versão desta trava conferia por arquivo: se o arquivo pedisse o
   módulo em ALGUMA linha anterior, todo uso posterior passava. Eu desfiz o
   conserto do `ui.js` para ver a trava pegar — e ela **não pegou**: o helper
   `lerDocumentos`, que ficou no arquivo, tem a guarda numa linha de cima, e
   isso dava passe livre aos dois usos soltos lá embaixo.

   Era o mesmo erro que a trava existe para impedir, cometido dentro dela.
   Então a regra passou a ser por linha, e estrita: um `global.X.algo(...)` só
   vale se a MESMA linha perguntar se `global.X` existe. Quem carrega pelo
   carregador recebe o módulo num parâmetro local (`D.lerVarios(...)`) e nem
   encosta nesta regra — é por isso que ela não atrapalha o jeito certo. */
const arquivos = (await readdir(RAIZ + 'src')).filter(f => f.endsWith('.js'));
const problemas: string[] = [];

for (const [modulo, g] of Object.entries(globalDe)) {
  const usa = new RegExp('(?:global|window)\\.' + g + '\\s*\\.', '');
  const guardaNaLinha = new RegExp(
    'if\\s*\\(\\s*!?\\s*(?:global|window)\\.' + g + '\\b', '');

  for (const f of arquivos) {
    if (f === modulo + '.js') continue;            /* o próprio módulo pode */
    const linhas = semComentarios(await readFile(RAIZ + 'src/' + f, 'utf8')).split('\n');
    for (let i = 0; i < linhas.length; i++) {
      if (!usa.test(linhas[i])) continue;
      if (guardaNaLinha.test(linhas[i])) continue;
      problemas.push('src/' + f + ':' + (i + 1) + ' mexe em ' + g +
        ' sem perguntar, na mesma linha, se ' + modulo + '.js já desceu');
    }
  }
}

conferir('todo uso de módulo sob demanda pergunta antes se ele desceu',
  problemas.length === 0,
  problemas.join('\n      ') + (problemas.length ? '\n      ' +
  'Esses módulos não vêm no index.html. Sem pedir, o global é undefined e o\n      ' +
  'handler estoura calado — foi assim que "Lendo 1 arquivo…" ficou eterno.' : ''));

console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
if (falhas) sair(1);
