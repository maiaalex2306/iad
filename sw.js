/* Service worker: cache-first do app shell. Offline no celular e no desktop. */
/* Trocar este número obriga a trocar `window.IADVersao` em src/config.js, no
   mesmo commit: um diz o que está guardado no aparelho, o outro o que está
   rodando, e é a discordância entre os dois que denuncia uma troca pela
   metade. */
const CACHE = 'iad-crm-v272';
const ARQUIVOS = [
  './', './index.html', './recuperar.html', './manifest.webmanifest',
  './src/recuperacao.js',
  './assets/styles.css',
  './src/config.js', './src/performance.js', './src/localidades.js',
  './src/playbook.js', './src/store.js', './src/auth.js', './src/engine.js', './src/perf-02.js', './src/pipeline-performance.js',
  './src/funis.js', './src/orientacao.js', './src/conferencia.js', './src/arquivos.js', './src/pendencias.js', './src/csv.js', './src/graficos.js', './src/integracoes.js', './src/nuvem.js', './src/sincronia.js', './src/ia.js', './src/documentos.js', './src/quadro.js',
  './src/ui.js', './src/ajuda.js', './src/seed.js', './src/whatsapp.js', './src/email.js', './src/conversa.js', './src/views.js', './src/perf-hoje.js', './src/app.js',
  './icons/icon-192.png', './icons/icon-512.png'
];

/* cache: 'reload' força buscar da rede: sem isso o cache HTTP do navegador pode
   entregar o arquivo velho para dentro do cache novo, e a versão nova nasce
   com código antigo. */
self.addEventListener('install', function (e) {
  const pedidos = ARQUIVOS.map(function (u) { return new Request(u, { cache: 'reload' }); });
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(pedidos); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (chaves) {
    return Promise.all(chaves.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* PERF-03A / P0: cache restrito ao app shell versionado.
   Nunca interceptar nem persistir APIs, URLs de terceiros, tokens ou respostas
   autenticadas. O cache é partilhado entre sessões do mesmo navegador. */
const CAMINHOS_ESTATICOS = new Set(ARQUIVOS.map(function (p) {
  return new URL(p, self.registration.scope).pathname;
}));
const CHAVES_SENSIVEIS = /^(access_token|refresh_token|token|token_hash|code|apikey|authorization|error|error_code|type)$/i;

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (!CAMINHOS_ESTATICOS.has(url.pathname)) return;
  if ([...url.searchParams.keys()].some(function (k) { return CHAVES_SENSIVEIS.test(k); })) return;

  /* Um único objeto de cache para a rota, inclusive com parâmetros UTM.
     Não armazenar dados de usuário nem páginas de recuperação com tokens. */
  const chave = new URL(url.pathname, self.location.origin).href;
  e.respondWith(
    fetch(new Request(e.request, { cache: 'no-cache' })).then(function (resposta) {
      const controle = resposta.headers.get('cache-control') || '';
      if (resposta.ok && resposta.type === 'basic' &&
          !/no-store|private/i.test(controle)) {
        const copia = resposta.clone();
        caches.open(CACHE).then(function (c) { return c.put(chave, copia); }).catch(function () {});
      }
      return resposta;
    }).catch(function () {
      return caches.match(chave).then(function (guardado) {
        return guardado || Response.error();
      });
    })
  );
});
