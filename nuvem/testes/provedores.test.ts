/* A fila de provedores de IA
   ------------------------------------------------------------------
   POR QUE ESTE TESTE EXISTE

   O assistente tinha um provedor só. Chave recusada, cota do mês estourada ou
   provedor fora do ar, e ele sumia da tela no meio do dia — sem nada a fazer
   além de esperar. Agora são vários, tentados em ordem.

   Encadeamento é a espécie de código que só é exercitada no pior dia: quando o
   primeiro provedor cai. Se a ordem estiver errada, ou se a configuração antiga
   deixar de valer, ninguém descobre no dia em que o commit é feito — descobre
   semanas depois, com o assistente mudo e nenhuma pista de por quê.

   O QUE ESTE ARQUIVO PROVA, sem tocar em provedor nenhum:

     · a ordem em que a fila é montada, e que IA_ORDEM manda nela;
     · que a configuração ANTIGA (IA_CHAVE + IA_PROVEDOR) continua valendo —
       é o que impede a mudança de desligar o assistente de quem já o tinha;
     · que a chave nova ganha da antiga, e que nenhuma chave com dono fica
       fora da fila em silêncio;
     · que um 400 nosso NÃO cai para o próximo provedor, e todo o resto cai.

   A chave de verdade nunca entra aqui, e nada neste arquivo faz chamada de
   rede. São as duas funções puras que decidem a fila, lidas do index.ts com um
   `Deno` de mentira no lugar — o mesmo recurso do teste das pastas de e-mail,
   e pelo mesmo motivo: testar o código que é PUBLICADO, não uma cópia dele.

   Rode com:  bun nuvem/testes/provedores.test.ts
*/

let ok = 0, falhas = 0;
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { ok++; console.log('ok    ' + nome); }
  else { falhas++; console.log('FALHA ' + nome + (detalhe ? '\n      ' + detalhe : '')); }
}

/* O ambiente é trocado ANTES de cada import, e o import tem de ser novo a cada
   vez: a lista de provedores é montada quando o módulo carrega, então um
   módulo em cache devolveria sempre a primeira configuração. A query no
   caminho é o que obriga o bun a carregar de novo. */
let volta = 0;
async function comAmbiente(vars: Record<string, string>) {
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: (n: string) => vars[n] || '' },
    serve: () => undefined,
    connectTls: () => { throw new Error('este teste não abre conexão'); }
  };
  volta++;
  return await import('../funcoes/assistente/index.ts?v=' + volta);
}

/* ---------- a ordem padrão ---------- */
let m = await comAmbiente({
  IA_CHAVE_OPENAI: 'sk-teste',
  IA_CHAVE_ANTHROPIC: 'sk-ant-teste',
  IA_CHAVE_GROQ: 'gsk_teste'
});
let fila = m.PROVEDORES.map((p: { id: string }) => p.id);
conferir('sem IA_ORDEM, a OpenAI vem primeiro', fila.join(',') === 'openai,anthropic,groq', fila.join(','));

/* ---------- IA_ORDEM manda ---------- */
m = await comAmbiente({
  IA_CHAVE_OPENAI: 'sk-teste',
  IA_CHAVE_ANTHROPIC: 'sk-ant-teste',
  IA_ORDEM: 'anthropic,openai'
});
fila = m.PROVEDORES.map((p: { id: string }) => p.id);
conferir('IA_ORDEM inverte a fila', fila.join(',') === 'anthropic,openai', fila.join(','));

m = await comAmbiente({
  IA_CHAVE_OPENAI: 'sk-teste', IA_CHAVE_ANTHROPIC: 'sk-ant-teste',
  IA_ORDEM: ' OpenAI , anthropic '
});
fila = m.PROVEDORES.map((p: { id: string }) => p.id);
conferir('com espaço e maiúscula também', fila.join(',') === 'openai,anthropic', fila.join(','));

/* Chave configurada e esquecida fora da ordem escrita entra no fim. Pôr uma
   chave e ela nunca ser usada, sem nada dizendo isso, é o pior silêncio. */
m = await comAmbiente({
  IA_CHAVE_OPENAI: 'sk-teste', IA_CHAVE_ANTHROPIC: 'sk-ant-teste', IA_CHAVE_GROQ: 'gsk_teste',
  IA_ORDEM: 'anthropic'
});
fila = m.PROVEDORES.map((p: { id: string }) => p.id);
conferir('chave fora da ordem escrita não some: vai para o fim',
  fila.length === 3 && fila[0] === 'anthropic', fila.join(','));

/* ---------- só quem tem chave entra ---------- */
m = await comAmbiente({ IA_CHAVE_ANTHROPIC: 'sk-ant-teste' });
fila = m.PROVEDORES.map((p: { id: string }) => p.id);
conferir('provedor sem chave não entra na fila', fila.join(',') === 'anthropic', fila.join(','));

m = await comAmbiente({});
conferir('sem chave nenhuma, a fila é vazia', m.PROVEDORES.length === 0);

/* ---------- a configuração antiga continua valendo ---------- */
m = await comAmbiente({ IA_CHAVE: 'gsk_antiga' });
conferir('IA_CHAVE sozinha ainda liga o assistente (padrão groq)',
  m.PROVEDORES.length === 1 && m.PROVEDORES[0].id === 'groq',
  JSON.stringify(m.PROVEDORES.map((p: { id: string }) => p.id)));

m = await comAmbiente({ IA_PROVEDOR: 'anthropic', IA_CHAVE: 'sk-ant-antiga', IA_MODELO: 'claude-sonnet-5-5' });
conferir('IA_PROVEDOR + IA_CHAVE + IA_MODELO continuam valendo',
  m.PROVEDORES.length === 1 && m.PROVEDORES[0].id === 'anthropic' &&
  m.PROVEDORES[0].modelo === 'claude-sonnet-5-5',
  JSON.stringify(m.PROVEDORES));

/* E a nova ganha da antiga, sem duplicar o provedor. */
m = await comAmbiente({
  IA_PROVEDOR: 'anthropic', IA_CHAVE: 'sk-ant-antiga', IA_MODELO: 'claude-velho',
  IA_CHAVE_ANTHROPIC: 'sk-ant-nova', IA_MODELO_ANTHROPIC: 'claude-opus-5'
});
conferir('a chave nova ganha da antiga, e o provedor não aparece duas vezes',
  m.PROVEDORES.length === 1 && m.PROVEDORES[0].modelo === 'claude-opus-5',
  JSON.stringify(m.PROVEDORES.map((p: { id: string; modelo: string }) => p.id + ':' + p.modelo)));

/* A antiga convive com a de OUTRO provedor: é o caminho de quem acrescenta a
   OpenAI sem mexer no que já estava no ar. */
m = await comAmbiente({
  IA_PROVEDOR: 'groq', IA_CHAVE: 'gsk_antiga',
  IA_CHAVE_OPENAI: 'sk-nova'
});
fila = m.PROVEDORES.map((p: { id: string }) => p.id);
conferir('acrescentar a OpenAI não desliga a Groq que já estava lá',
  fila.join(',') === 'openai,groq', fila.join(','));

/* ---------- os modelos ---------- */
m = await comAmbiente({ IA_CHAVE_OPENAI: 'sk-teste' });
conferir('sem IA_MODELO_OPENAI, usa o padrão do código',
  !!m.PROVEDORES[0].modelo && m.PROVEDORES[0].modelo === m.CATALOGO.openai.modelo,
  m.PROVEDORES[0].modelo);
conferir('e o rápido tem padrão próprio, não vira o modelo bom',
  m.PROVEDORES[0].modeloRapido !== m.PROVEDORES[0].modelo,
  m.PROVEDORES[0].modeloRapido);

m = await comAmbiente({
  IA_CHAVE_OPENAI: 'sk-teste',
  IA_MODELO_OPENAI: 'meu-modelo', IA_MODELO_RAPIDO_OPENAI: 'meu-modelo-mini'
});
conferir('o segredo ganha do padrão',
  m.PROVEDORES[0].modelo === 'meu-modelo' && m.PROVEDORES[0].modeloRapido === 'meu-modelo-mini');

/* ---------- quando vale tentar o próximo ---------- */
m = await comAmbiente({ IA_CHAVE_OPENAI: 'sk-teste' });
conferir('401 (chave recusada) cai para o próximo', m.valeOutroProvedor(401));
conferir('429 (cota) cai para o próximo', m.valeOutroProvedor(429));
conferir('404 (modelo que não existe) cai para o próximo', m.valeOutroProvedor(404));
conferir('529 (sobrecarregado) cai para o próximo', m.valeOutroProvedor(529));
conferir('500 (queda do provedor) cai para o próximo', m.valeOutroProvedor(500));
conferir('413 (material grande) cai para o próximo — o outro pode ter janela maior',
  m.valeOutroProvedor(413));
conferir('400 NÃO cai: é o nosso pedido, e o próximo recusaria igual',
  !m.valeOutroProvedor(400));

/* ---------- o catálogo ---------- */
conferir('todo provedor do catálogo tem prefixo, base e modelos',
  Object.keys(m.CATALOGO).every((id: string) => {
    const c = m.CATALOGO[id];
    return c.nome && c.prefixo && /^https:\/\//.test(c.base) && c.modelo && c.rapido;
  }),
  JSON.stringify(Object.keys(m.CATALOGO)));

conferir('a OpenAI e a Groq falam o mesmo protocolo, em endereços diferentes',
  m.CATALOGO.openai.base !== m.CATALOGO.groq.base &&
  /openai\.com/.test(m.CATALOGO.openai.base) && /groq\.com/.test(m.CATALOGO.groq.base));

/* ---------- a chave nunca sai ---------- */
const fonte = await Bun.file(new URL('../funcoes/assistente/index.ts', import.meta.url).pathname).text();
const blocoDiag = fonte.slice(fonte.indexOf("if (tipo === 'diagnostico')"), fonte.indexOf("if (!FORMATOS[tipo])"));
conferir('o diagnóstico devolve nome e modelo',
  /nome: p\.nome/.test(blocoDiag) && /modelo: p\.modelo/.test(blocoDiag));
conferir('e NUNCA devolve a chave, nem um pedaço dela',
  !/chave:/.test(blocoDiag) && !/\.chave\.slice/.test(blocoDiag) && !/\.chave\.substr/.test(blocoDiag),
  blocoDiag.split('\n').filter((l) => /chave/.test(l)).join(' | '));

console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
