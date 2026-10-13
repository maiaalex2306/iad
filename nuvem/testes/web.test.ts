/* O que a função busca na internet antes de preencher a ficha
   ------------------------------------------------------------------
   POR QUE ESTE TESTE EXISTE

   O vendedor carregou o dossiê da GELITA e o app gravou "Eberbach" como
   município do cliente. Eberbach é a sede da GELITA AG, na Alemanha; o
   cliente dele tem fábrica em Cotia, Mococa e Maringá.

   Ninguém inventou nada — o endereço estava no documento. O defeito era
   outro, e tinha duas partes:

     · a busca na internet só rodava no cadastro de EMPRESA. Quem cadastra a
       mesma empresa junto com o negócio, que é como se trabalha com um dossiê
       na mão, não ganhava busca nenhuma: a ficha saía do documento, e
       documento de multinacional fala da matriz;
     · mesmo buscando, o site global responde em inglês com o endereço de lá.
       O endereço brasileiro de uma empresa não está num site institucional:
       está na Receita.

   O QUE ESTE ARQUIVO PROVA, sem tocar na internet:

     · que o CNPJ escrito no material ou no rodapé do site vence a busca;
     · que o CNPJ ACHADO numa busca não vale por ter sido achado — ele é
       consultado, e a razão social tem de falar o nome da empresa. Sem isso,
       procurar "GELITA CNPJ" e pegar o primeiro número de um site de raspagem
       gravaria a ficha de outra empresa, que é pior do que não achar nada;
     · que as rotas brasileiras do site global são lidas;
     · que o bloco da Receita chega ao modelo com a origem escrita.

   O `fetch` é de mentira e está escrito aqui no arquivo: cada endereço
   responde o que a gente mandou responder. Rede de verdade num teste é teste
   que falha por motivo que não é o dele.

   Rode com:  bun nuvem/testes/web.test.ts
*/

let ok = 0, falhas = 0;
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) { ok++; console.log('ok    ' + nome); }
  else { falhas++; console.log('FALHA ' + nome + (detalhe ? '\n      ' + detalhe : '')); }
}

(globalThis as unknown as { Deno: unknown }).Deno = {
  env: { get: (n: string) => (n === 'IA_CHAVE_OPENAI' ? 'sk-teste' : '') },
  serve: () => undefined,
  connectTls: () => { throw new Error('este teste não abre conexão'); }
};

const m = await import('../funcoes/assistente/index.ts?web=1');

/* ---------- o fetch de mentira ---------- */

const CNPJ_CERTO = '11111111000191';
const CNPJ_DE_OUTRA = '22222222000191';

type Resposta = { ok: boolean; texto: string };
let rotas: Record<string, Resposta> = {};
let pedidos: string[] = [];

const fetchOriginal = globalThis.fetch;
(globalThis as unknown as { fetch: unknown }).fetch = (url: string | URL) => {
  const u = String(url);
  pedidos.push(u);
  for (const [chave, r] of Object.entries(rotas)) {
    if (u.indexOf(chave) !== -1) {
      return Promise.resolve({
        ok: r.ok,
        text: () => Promise.resolve(r.texto),
        json: () => Promise.resolve(JSON.parse(r.texto))
      } as unknown as Response);
    }
  }
  return Promise.resolve({ ok: false, text: () => Promise.resolve(''), json: () => Promise.resolve({}) } as unknown as Response);
};

const receita = (razao: string, municipio: string, uf: string, cnpj: string) => JSON.stringify({
  razao_social: razao, nome_fantasia: razao.split(' ')[0],
  cnae_fiscal_descricao: 'Fabricação de gelatina',
  descricao_tipo_de_logradouro: 'Rua', logradouro: 'Philip Leiner', numero: '200',
  bairro: 'Parque Alexandre', municipio: municipio, uf: uf, cep: '06714285',
  ddd_telefone_1: '1146168016', descricao_situacao_cadastral: 'Ativa', cnpj: cnpj
});

const DOSSIE = 'Infográfico executivo GELITA Brasil. Eficiência industrial, água e efluentes. ' +
  'Contato: caio.freitas@gelita.com. 62,3 m3/t de água captada.';

/* ---------- 1. o CNPJ no rodapé do site brasileiro ---------- */
rotas = {
  'gelita.com.br/': { ok: true, texto: '<html>GELITA do Brasil Ltda. Rua Philip Leiner, 200, Cotia SP. CNPJ 11.111.111/0001-91</html>' },
  'gelita.com/': { ok: true, texto: '<html>GELITA AG, Uferstrasse 7, 69412 Eberbach, Germany</html>' },
  ['brasilapi.com.br/api/cnpj/v1/' + CNPJ_CERTO]: { ok: true, texto: receita('GELITA DO BRASIL LTDA', 'COTIA', 'SP', CNPJ_CERTO) }
};
pedidos = [];
let extras = await m.blocosDaWeb(DOSSIE, '', 'GELITA');

conferir('o site brasileiro entra nos blocos', /gelita\.com\.br/.test(extras), extras.slice(0, 200));
conferir('e a Receita também, com a origem escrita',
  /\[Receita Federal, consulta pública\]/.test(extras), extras.slice(-400));
conferir('com o município BRASILEIRO, que é o que faltava',
  /COTIA \/ SP/.test(extras), extras.slice(-300));
conferir('as rotas brasileiras do site global são lidas',
  pedidos.some((u) => /\/pt-br$/.test(u)) && pedidos.some((u) => /\/br$/.test(u)),
  pedidos.filter((u) => /gelita/.test(u)).join(' | '));
conferir('e nenhuma busca foi feita — o CNPJ estava no rodapé',
  !pedidos.some((u) => /duckduckgo/.test(u)),
  pedidos.filter((u) => /duckduckgo/.test(u)).join(' | '));

/* ---------- 2. sem CNPJ em lugar nenhum: procura, e CONFERE ---------- */
rotas = {
  'gelita.com.br/': { ok: false, texto: '' },
  'gelita.com/': { ok: true, texto: '<html>GELITA AG, Uferstrasse 7, Eberbach, Germany. Gelatine and collagen.</html>' },
  'duckduckgo.com/html': { ok: true, texto:
    'resultados: 22.222.222/0001-91 ... 11.111.111/0001-91 ...' },
  ['brasilapi.com.br/api/cnpj/v1/' + CNPJ_DE_OUTRA]: { ok: true, texto: receita('COMERCIAL SAO JOAO LTDA', 'SAO PAULO', 'SP', CNPJ_DE_OUTRA) },
  ['brasilapi.com.br/api/cnpj/v1/' + CNPJ_CERTO]: { ok: true, texto: receita('GELITA DO BRASIL LTDA', 'COTIA', 'SP', CNPJ_CERTO) }
};
pedidos = [];
extras = await m.blocosDaWeb(DOSSIE, '', 'GELITA');

conferir('sem CNPJ no material, a busca acontece',
  pedidos.some((u) => /duckduckgo/.test(u)));
conferir('o primeiro número achado NÃO vence por ser o primeiro',
  !/COMERCIAL SAO JOAO/.test(extras), extras.slice(-400));
conferir('vence o que a Receita confirma ser a empresa certa',
  /GELITA DO BRASIL LTDA/.test(extras) && /COTIA \/ SP/.test(extras), extras.slice(-400));

/* ---------- 3. nenhum CNPJ confere: nada de Receita ---------- */
rotas = {
  'gelita.com/': { ok: true, texto: '<html>GELITA AG, Eberbach, Germany.</html>' },
  'duckduckgo.com/html': { ok: true, texto: 'resultados: 22.222.222/0001-91' },
  ['brasilapi.com.br/api/cnpj/v1/' + CNPJ_DE_OUTRA]: { ok: true, texto: receita('COMERCIAL SAO JOAO LTDA', 'SAO PAULO', 'SP', CNPJ_DE_OUTRA) }
};
extras = await m.blocosDaWeb(DOSSIE, '', 'GELITA');
conferir('razão social que não fala o nome da empresa é descartada',
  !/Receita Federal/.test(extras), extras.slice(-300));
conferir('e o que veio do site continua valendo', /gelita\.com/.test(extras));

/* ---------- 4. a conferência isolada ---------- */
rotas = {
  ['brasilapi.com.br/api/cnpj/v1/' + CNPJ_DE_OUTRA]: { ok: true, texto: receita('COMERCIAL SAO JOAO LTDA', 'SAO PAULO', 'SP', CNPJ_DE_OUTRA) },
  ['brasilapi.com.br/api/cnpj/v1/' + CNPJ_CERTO]: { ok: true, texto: receita('GELITA DO BRASIL LTDA', 'COTIA', 'SP', CNPJ_CERTO) }
};
conferir('receitaConferida percorre os candidatos até achar o que casa',
  /GELITA/.test(await m.receitaConferida(CNPJ_DE_OUTRA + ',' + CNPJ_CERTO, 'gelita')));
conferir('e devolve vazio quando nenhum casa',
  (await m.receitaConferida(CNPJ_DE_OUTRA, 'gelita')) === '');

/* ---------- 5. o palpite do domínio brasileiro ---------- */
const dominios = m.dominiosNoTexto('contato: caio.freitas@gelita.com', 'GELITA');
conferir('o .com do material entra', dominios.indexOf('gelita.com') !== -1, dominios.join(', '));
conferir('e o irmão .com.br é tentado junto — é onde mora o CNPJ',
  dominios.indexOf('gelita.com.br') !== -1, dominios.join(', '));

/* ---------- 6. a busca de CNPJ pede pelo nome entre aspas ---------- */
rotas = { 'duckduckgo.com/html': { ok: true, texto: '11.111.111/0001-91' } };
pedidos = [];
await m.cnpjPelaBusca('GELITA', 'gelita');
const consulta = pedidos.filter((u) => /duckduckgo/.test(u))[0] || '';
conferir('o nome vai entre aspas, para não trazer homônimo',
  /%22GELITA%22/.test(consulta), consulta);
conferir('e a busca pede a matriz brasileira',
  /CNPJ/.test(decodeURIComponent(consulta)) && /Brasil/i.test(decodeURIComponent(consulta)),
  decodeURIComponent(consulta));

/* ---------- 7. nome curto demais não vale chute ---------- */
conferir('nome de três letras não sai procurando CNPJ',
  (await m.cnpjPelaBusca('ACP', 'acp')) === '');

(globalThis as unknown as { fetch: unknown }).fetch = fetchOriginal;

console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
