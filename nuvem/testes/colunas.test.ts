/* Todo campo que o app grava tem de existir como coluna no banco
   ------------------------------------------------------------------
   POR QUE ESTE TESTE EXISTE

   O campo `historicoNutricao` nasceu no aplicativo quando a nutrição passou a
   guardar as passagens — entrou quando, por quê, por que voltou. Funcionou
   por semanas, porque em memória funciona sempre. Ninguém escreveu a coluna
   no banco.

   Quebrou no dia em que alguém tirou a primeira negociação da nutrição. E não
   quebrou só a nutrição: o envio manda a tabela INTEIRA de uma vez, e o
   PostgREST recusa o lote todo quando encontra uma chave que não conhece.
   Uma coluna esquecida derrubou as 166 negociações da carteira, com uma faixa
   laranja que não saía mais.

   O que torna isto perigoso é a distância entre a causa e o efeito: o campo é
   criado num commit, e o erro aparece semanas depois, na mão de quem usa a
   função nova. Nenhum teste de navegador pega — no navegador não existe
   banco. O que pega é ler os dois lados e comparar, que é o que este arquivo
   faz.

   A REGRA: todo nome de campo que o `src/store.js` grava num registro tem de
   existir como coluna em ALGUMA tabela do SQL. Deliberadamente não exige a
   tabela certa: variáveis com nomes parecidos dariam falso positivo, e um
   teste que grita à toa é um teste que se aprende a ignorar. O que ele pega —
   campo que não existe em lugar nenhum — é exatamente o defeito que aconteceu.

   Rode com:  bun nuvem/testes/colunas.test.ts
*/

import { readFile, readdir } from 'node:fs/promises';

const RAIZ = new URL('../../', import.meta.url).pathname;
/* `throw` não serve aqui: este arquivo usa `await` no topo, e num módulo
   assíncrono o lançamento vira rejeição não tratada — o bun imprime o erro e
   SAI COM ZERO. O teste acusava a falha na tela e a CI passava assim mesmo,
   que é o pior dos dois mundos: parece protegido e não está. */
const sair = (c: number) => { process.exit(c); };

let ok = 0, falhas = 0;
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { ok++; console.log('ok    ' + nome); }
  else { falhas++; console.log('FALHA ' + nome + (detalhe ? '\n      ' + detalhe : '')); }
}

const paraColuna = (s: string) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

/* ---------- o que o SQL cria ---------- */
const arquivos = (await readdir(RAIZ + 'nuvem')).filter((f) => f.endsWith('.sql'));
const sql = (await Promise.all(
  arquivos.map((f) => readFile(RAIZ + 'nuvem/' + f, 'utf8'))
)).join('\n');

const colunas = new Set<string>();
sql.replace(/create table if not exists public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/g, (m, _tab, corpo) => {
  String(corpo).replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').forEach((linha) => {
    const c = linha.trim().match(/^([a-z_][a-z0-9_]*)\s+/);
    if (c && !/^(primary|unique|constraint|check|foreign|references)$/.test(c[1])) colunas.add(c[1]);
  });
  return m;
});
sql.replace(/add column if not exists\s+([a-z_][a-z0-9_]*)/g, (m, col) => {
  colunas.add(String(col));
  return m;
});

conferir('li as colunas do SQL', colunas.size > 50, colunas.size + ' colunas em ' + arquivos.length + ' arquivos');

/* ---------- o que o app grava ----------
   Só o store.js: é o único lugar que pode mexer em registro que viaja para o
   servidor. Marcas de trabalho (`_alguma`) não sobem e ficam de fora. */
const store = await readFile(RAIZ + 'src/store.js', 'utf8');
const semComentario = store.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/* Os nomes das funções que ACHAM um registro: o que sai delas é registro que
   viaja, e o que se atribui nele tem de ter coluna. */
const ACHADORES = ['oportunidade', 'conta', 'contato', 'tarefa', 'sinal', 'nota'];
const variaveis = new Set<string>();
ACHADORES.forEach((fn) => {
  const re = new RegExp('(?:const|let|var)\\s+([a-zA-Z][a-zA-Z0-9]*)\\s*=\\s*' + fn + '\\(', 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(semComentario)) !== null) variaveis.add(m[1]);
});

conferir('achei as variáveis de registro no store.js', variaveis.size >= 3,
  [...variaveis].join(', ') || 'nenhuma');

const gravados = new Set<string>();
variaveis.forEach((v) => {
  const re = new RegExp('\\b' + v + '\\.([a-zA-Z][a-zA-Z0-9]*)\\s*=(?!=)', 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(semComentario)) !== null) {
    const campo = m[1];
    if (campo === 'id' || campo.startsWith('_')) continue;
    gravados.add(campo);
  }
});

conferir('achei os campos gravados', gravados.size >= 10, gravados.size + ' campos');

/* ---------- a comparação ---------- */
const orfaos = [...gravados]
  .filter((c) => !colunas.has(paraColuna(c)) && !colunas.has(c))
  .sort();

conferir('todo campo gravado tem coluna no banco', orfaos.length === 0,
  orfaos.length
    ? 'Sem coluna em nenhuma tabela:\n      ' +
      orfaos.map((c) => '· ' + c + '  →  ' + paraColuna(c)).join('\n      ') +
      '\n\n      Escreva a migração em nuvem/correcao-NN-*.sql, acrescente a coluna\n' +
      '      ao nuvem/schema.sql para banco novo nascer certo, e termine com\n' +
      "      notify pgrst, 'reload schema'; — sem ele o PostgREST continua\n" +
      '      servindo o desenho antigo e recusa a coluna que já existe.\n\n' +
      '      Não é um campo só que para de subir: o envio manda a tabela\n' +
      '      inteira, e uma chave desconhecida faz o servidor recusar o lote.'
    : '');

console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
if (falhas) sair(1);
