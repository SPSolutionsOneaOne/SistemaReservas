// Service Worker — Reserva de Salas
// Estrategia: precache de la portada (/) + red con fallback a caché.
const CACHE = 'reservas-v1';
const PRECACHE = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Navegación: red primero; si falta la red, responder la portada cacheada.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
    return;
  }

  // Assets estáticos: caché primero; si no está, red (y guardar).
  if (/\.(?:js|css|png|jpg|jpeg|svg|webp|woff2?)$/.test(new URL(event.request.url).pathname)) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            const copia = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copia));
            return response;
          })
      )
    );
    return;
  }

  // Resto: solo red.
});
