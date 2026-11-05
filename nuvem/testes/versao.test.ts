/* O número da versão precisa ser o mesmo nos dois lugares
   ------------------------------------------------------------------
   POR QUE ESTE TESTE EXISTE

   O número da versão vive em dois arquivos, e por um bom motivo:

     sw.js         → `CACHE`, o que está GUARDADO no aparelho
     src/config.js → `IADVersao`, o que está RODANDO agora

   Quando os dois discordam, o navegador está no meio de uma troca — e saber
   disso vale mais do que a coincidência dos dois números. Os dois comentários,
   um em cada arquivo, dizem desde sempre que eles têm de ser trocados no mesmo
   commit.

   Por sete versões seguidas só um foi. O `sw.js` andou de v204 até v211, o
   `config.js` ficou parado em v204 — e o carimbo do alto do Manual, que sai do
   `config.js`, anunciava **v204 com o conteúdo da v210**. Quem viu foi o
   Alexandre, olhando um índice de 28 itens debaixo de um carimbo velho.

   Não é vaidade de número. Aquele carimbo é o que a pessoa usa para saber se o
   aparelho dela pegou a versão nova. Um número velho ali manda alguém limpar
   cache atrás de um problema que não existe — e faz duvidar do resto da tela.

   Um teste de navegador não pega: no navegador os dois números vêm de fontes
   diferentes e nenhuma tela comparava as duas. O que pega é ler os dois
   arquivos e exigir que batam, que é o que este arquivo faz.

   Rode com:  bun nuvem/testes/versao.test.ts
*/

import { readFile } from 'node:fs/promises';

const RAIZ = new URL('../../', import.meta.url).pathname;
const sair = (c: number) => { throw new Error('saindo com ' + c); };

let ok = 0, falhas = 0;
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { ok++; console.log('ok    ' + nome); }
  else { falhas++; console.log('FALHA ' + nome + (detalhe ? '\n      ' + detalhe : '')); }
}

const sw = await readFile(RAIZ + 'sw.js', 'utf8');
const config = await readFile(RAIZ + 'src/config.js', 'utf8');

/* O FORMATO DO NÚMERO MUDOU, E ISSO QUASE DESLIGOU ESTE TESTE
   ------------------------------------------------------------------
   Estes dois `exec` liam `v\d+` — só dígitos depois do `v`. Quando a versão
   passou a ter uma segunda parte (`v286.48`), nenhum dos dois achou nada: o
   `if` logo abaixo não rodou, e a COMPARAÇÃO ENTRE OS DOIS NÚMEROS deixou de
   acontecer. O teste continuou vermelho, então ninguém perdeu o aviso — mas
   vermelho por não saber ler, não por ter encontrado desacordo.

   Essa é a falha pior das duas. Um teste que falha diz "olhe aqui". Um teste
   que não consegue ler diz a MESMA COISA quer os números batam, quer tenham
   voltado a derivar sete versões seguidas — que é exatamente o que ele existe
   para pegar. Enquanto esteve cego, a trava estava desligada.

   Daí `(?:\.\d+)*`: aceita `v286`, `v286.48` e o que vier depois, sem
   abrir mão de exigir que os dois lados digam a mesma coisa. E as duas
   primeiras verificações passam a dizer "não consegui LER o número" em vez de
   "não achei a linha", porque com a linha presente e o formato novo a causa
   era a leitura, não a ausência. */
const NUMERO = '(v\\d+(?:\\.\\d+)*)';
const doCache = new RegExp("const CACHE = ['\"]iad-crm-" + NUMERO + "['\"]").exec(sw);
const doConfig = new RegExp(
  "window\\.IADVersao\\s*=\\s*\\{\\s*numero:\\s*['\"]" + NUMERO +
  "['\"]\\s*,\\s*data:\\s*['\"]([\\d-]+)['\"]").exec(config);

conferir('li o número do CACHE em sw.js', !!doCache,
  'a linha existe mas o número não foi lido. Esperava algo como:\n      ' +
  'const CACHE = \'iad-crm-v286.48\';  (ou \'iad-crm-v286\')\n      ' +
  'Se o formato do número mudou de novo, conserte o NUMERO aqui em cima — ' +
  'senão\n      a comparação dos dois lados para de acontecer.');
conferir('li o número do IADVersao em src/config.js', !!doConfig,
  'a linha existe mas o número não foi lido. Esperava algo como:\n      ' +
  'window.IADVersao = { numero: \'v286.48\', data: \'2026-11-05\' };\n      ' +
  'Se o formato do número mudou de novo, conserte o NUMERO aqui em cima — ' +
  'senão\n      a comparação dos dois lados para de acontecer.');

if (doCache && doConfig) {
  conferir('os dois números são o mesmo', doCache[1] === doConfig[1],
    'sw.js diz ' + doCache[1] + ' e src/config.js diz ' + doConfig[1] + '.\n      ' +
    'O carimbo do alto do Manual sai do config.js — com ele atrasado, o Manual\n      ' +
    'anuncia uma versão que não é a que está rodando, e a pessoa limpa cache\n      ' +
    'atrás de um problema que não existe. Troque os dois no mesmo commit.');

  /* A data não precisa ser hoje — o commit pode sair na madrugada seguinte —,
     mas uma data de semanas atrás num número novo é o mesmo esquecimento com
     outra cara. */
  const data = new Date(doConfig[2] + 'T00:00:00');
  const dias = Math.floor((Date.now() - data.getTime()) / 86400000);
  conferir('a data da versão não está velha', Number.isFinite(dias) && dias <= 30,
    'src/config.js diz ' + doConfig[2] + ', ' + dias + ' dia(s) atrás. ' +
    'Se o número mudou, a data muda junto.');
}

console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
if (falhas) sair(1);
