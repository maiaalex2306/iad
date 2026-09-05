/* Service worker: cache-first do app shell. Offline no celular e no desktop. */
const CACHE = 'iad-crm-v4';
const ARQUIVOS = [
  './', './index.html', './manifest.webmanifest',
  './assets/styles.css',
  './src/playbook.js', './src/store.js', './src/engine.js',
  './src/arquivos.js', './src/csv.js', './src/graficos.js',
  './src/ui.js', './src/seed.js', './src/views.js', './src/app.js',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); }));
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
