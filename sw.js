/* Service worker: cache-first do app shell. Offline no celular e no desktop. */
const CACHE = 'iad-crm-v138';
const ARQUIVOS = [
  './', './index.html', './manifest.webmanifest',
  './assets/styles.css',
  './src/config.js',
  './src/playbook.js', './src/store.js', './src/auth.js', './src/engine.js',
  './src/arquivos.js', './src/csv.js', './src/graficos.js', './src/integracoes.js', './src/nuvem.js', './src/ia.js', './src/documentos.js',
  './src/ui.js', './src/ajuda.js', './src/seed.js', './src/views.js', './src/app.js',
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

/* Rede primeiro, cache como rede de segurança.
   Era cache primeiro, o que é mais rápido e foi a causa de metade dos problemas
   de uma noite inteira: correções publicadas e invisíveis, "não aparece" que era
   código velho, gente vendo telas que já não existiam. A diferença de velocidade
   num app deste tamanho é imperceptível; a diferença de confiança não é.
   Offline continua funcionando: sem rede, responde o que está guardado. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  /* cache: 'no-cache' revalida com o servidor em vez de aceitar o que o cache
     HTTP do navegador tiver. Sem isto, "rede primeiro" ainda entrega arquivo
     velho: o service worker busca, e quem responde é o cache do navegador.
     Não é download completo — vai com ETag, e o servidor responde 304 quando
     nada mudou. */
  const mesmaOrigem = e.request.url.indexOf(self.location.origin) === 0;
  const pedido = mesmaOrigem
    ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : e.request;

  e.respondWith(
    fetch(pedido).then(function (rede) {
      const copia = rede.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copia); }).catch(function () {});
      return rede;
    }).catch(function () {
      return caches.match(e.request).then(function (guardado) {
        return guardado || caches.match('./index.html');
      });
    })
  );
});
