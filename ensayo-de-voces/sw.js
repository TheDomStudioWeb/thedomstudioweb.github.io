// Ensayo de Voces: guarda la app para que abra rápido y sin conexión.
const CACHE = 'ensayo-v3';
const BASE = ['./', './index.html', './manifest.webmanifest', './icono-192.png', './icono-512.png'];
const EXTRA = ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE).then(() =>
    Promise.all(EXTRA.map(u => c.add(u).catch(() => {})))))  // si falla la librería externa, se guarda después
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // la página: primero la red (para recibir actualizaciones), si no hay conexión, la copia guardada
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put('./index.html', c)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    if (res.ok && (url.origin === location.origin || url.host.includes('cdnjs') || url.host.includes('fonts.g'))) {
      const c = res.clone(); caches.open(CACHE).then(k => k.put(e.request, c));
    }
    return res;
  })));
});
