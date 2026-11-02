/* Bicisendas Mendoza · service worker. Subir VERSION al publicar cambios. */
var VERSION = 'bici-v3';
var ARCHIVOS = ['./', 'index.html', 'app.js', 'manifest.json', 'libs/leaflet.js', 'libs/leaflet.css', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r.url, { cache: 'no-cache' }).then(function (res) { if (res && res.ok) { var c = res.clone(); caches.open(VERSION).then(function (ca) { ca.put(r, c); }); } return res; })
    .catch(function () { return caches.match(r).then(function (h) { return h || caches.match('index.html'); }); }));
});
