/* Service worker: cache-first do app shell. Offline no celular e no desktop. */
const CACHE = 'iad-crm-v24';
const ARQUIVOS = [
  './', './index.html', './manifest.webmanifest',
  './assets/styles.css',
  './src/config.js',
  './src/playbook.js', './src/store.js', './src/auth.js', './src/engine.js',
  './src/arquivos.js', './src/csv.js', './src/graficos.js', './src/integracoes.js', './src/nuvem.js',
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

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (resposta) {
      return resposta || fetch(e.request).then(function (rede) {
        const copia = rede.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copia); });
        return rede;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
