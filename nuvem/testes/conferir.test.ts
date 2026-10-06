/* conferir.sql tem de conhecer TUDO o que os outros arquivos SQL criam.
   ==================================================================
   O conferir.sql responde "o banco está em dia?". Ele só consegue responder
   isso se souber o que esperar — e a lista do que esperar está escrita dentro
   dele, à mão. Lista escrita à mão envelhece: basta alguém criar a correção 26
   com uma coluna nova e esquecer de acrescentá-la aqui, e o conferir passa a
   dizer "tudo ok" para um banco que não está.

   Este teste lê os arquivos SQL de verdade, extrai toda tabela, coluna e
   função que eles criam, e exige que cada uma apareça no conferir. É o mesmo
   remédio do colunas.test.ts, um nível acima: em vez de comparar o app com o
   SQL, compara o SQL com o conferidor. */
import { readFileSync, readdirSync } from 'node:fs';

let ok = 0, falhas = 0;
function certo(cond: boolean, nome: string, extra = '') {
  if (cond) { ok++; console.log('ok    ' + nome); }
  else { falhas++; console.log('FALHA ' + nome + (extra ? '  → ' + extra : '')); }
}

const pasta = 'nuvem';
const arquivos = ['schema.sql']
  .concat(readdirSync(pasta).filter((f) => /^correcao-\d+.*\.sql$/.test(f)).sort())
  .concat(['whatsapp.sql'])
  .filter((f) => { try { readFileSync(pasta + '/' + f); return true; } catch { return false; } });

const tabelas = new Set<string>();
const colunas = new Set<string>();
const funcoes = new Set<string>();

for (const f of arquivos) {
  const s = readFileSync(pasta + '/' + f, 'utf8');
  for (const m of s.matchAll(/create table (?:if not exists )?public\.(\w+)/g)) tabelas.add(m[1]);
  for (const m of s.matchAll(/alter table public\.(\w+)\s+add column if not exists (\w+)/gs)) {
    colunas.add(m[1] + '.' + m[2]);
  }
  for (const m of s.matchAll(/create (?:or replace )?function public\.(\w+)/g)) funcoes.add(m[1]);
}

certo(arquivos.length > 10, 'li os arquivos SQL', String(arquivos.length));
certo(tabelas.size > 10, 'achei as tabelas', String(tabelas.size));
certo(colunas.size > 30, 'achei as colunas acrescentadas', String(colunas.size));
certo(funcoes.size > 5, 'achei as funções', String(funcoes.size));

const conf = readFileSync(pasta + '/conferir.sql', 'utf8');

/* O conferir não cria nada. Se um dia alguém puser um `alter table` aqui, a
   promessa do cabeçalho ("não muda nada") deixa de valer — e é justamente
   essa promessa que faz a pessoa rodar sem medo. A função temporária é a
   única exceção, e ela morre com a sessão. */
const escreve = /\b(alter table|drop |insert into|update |delete from|create table|create index|create policy)\b/i;
certo(!escreve.test(conf), 'conferir.sql não altera nada',
  (conf.match(escreve) || [''])[0]);
certo(/create or replace function pg_temp\./.test(conf),
  'a única função que ele cria é temporária');

const faltamT = [...tabelas].filter((t) => !new RegExp("'tabela', '" + t + "'").test(conf));
certo(faltamT.length === 0, 'toda tabela criada no SQL está no conferir', faltamT.join(', '));

const faltamC = [...colunas].filter((c) => {
  const [t, col] = c.split('.');
  return !new RegExp("'coluna', '" + t + "', '" + col + "'").test(conf);
});
certo(faltamC.length === 0, 'toda coluna acrescentada está no conferir', faltamC.join(', '));

const faltamF = [...funcoes].filter((f) => !new RegExp("'funcao', '" + f + "'").test(conf));
certo(faltamF.length === 0, 'toda função está no conferir', faltamF.join(', '));

/* Cada item aponta um arquivo que existe de verdade — mandar rodar um arquivo
   que não está no repositório é pior do que não mandar nada. */
const apontados = [...conf.matchAll(/'(nuvem\/[\w.-]+\.sql)'/g)].map((m) => m[1]);
const inexistentes = [...new Set(apontados)].filter((a) => {
  try { readFileSync(a); return false; } catch { return true; }
});
certo(apontados.length > 20, 'os itens apontam arquivos', String(apontados.length));
certo(inexistentes.length === 0, 'e todos os arquivos apontados existem', inexistentes.join(', '));

/* ---------- e a mesma lista dentro do aplicativo ----------
   `src/conferencia.js` é a tela "O banco está em dia?". A lista dele é gerada
   dos mesmos .sql — mas gerada uma vez, e arquivo gerado que ninguém confere
   vira arquivo errado. Aqui ele é comparado item a item com o conferir.sql: os
   dois respondem a mesma pergunta e têm de responder igual, senão o app diz
   "tudo em dia" para um banco que o SQL diria que não está. */
const app = readFileSync('src/conferencia.js', 'utf8');

const faltamAppT = [...tabelas].filter((t) => !new RegExp('"tabela", "' + t + '"').test(app));
certo(faltamAppT.length === 0, 'toda tabela está também no app', faltamAppT.join(', '));

const faltamAppC = [...colunas].filter((c) => {
  const [t, col] = c.split('.');
  return !new RegExp('"coluna", "' + t + '", "' + col + '"').test(app);
});
certo(faltamAppC.length === 0, 'toda coluna está também no app', faltamAppC.join(', '));

const faltamAppF = [...funcoes].filter((f) => !new RegExp('"funcao", "' + f + '"').test(app));
certo(faltamAppF.length === 0, 'toda função está também no app', faltamAppF.join(', '));

const itensSql = [...conf.matchAll(/\('[^']*', '(tabela|coluna|funcao)', '(\w+)', '(\w*)'/g)]
  .map((m) => m[1] + ':' + m[2] + ':' + m[3]).sort();
const itensApp = [...app.matchAll(/\["[^"]*", "(tabela|coluna|funcao)", "(\w+)", "(\w*)"/g)]
  .map((m) => m[1] + ':' + m[2] + ':' + m[3]).sort();
certo(itensSql.length === itensApp.length && itensSql.join('|') === itensApp.join('|'),
  'o SQL e o app conferem exatamente a mesma lista',
  itensSql.length + ' no sql contra ' + itensApp.length + ' no app');

/* O app também não pode escrever no banco ao "conferir". */
const escreveApp = /\b(metodo:\s*'(POST|PATCH|DELETE|PUT)')/g;
const escritas = [...app.matchAll(escreveApp)].map((m) => m[0]);
certo(escritas.length === 0 || app.includes("chamarFuncao('assistente'"),
  'a conferência do app só lê (a única chamada que posta é a sonda do assistente)',
  escritas.join(', '));

console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
