/* DOMino Ruta · service worker. Subir VERSION al publicar cambios. */
var VERSION = 'ruta-v2';
var TESELAS = 'ruta-teselas-v1';
var MAX_TESELAS = 2500;
var ARCHIVOS = ['./', 'index.html', 'app.js', 'manifest.json', 'libs/maplibre-gl.js', 'libs/maplibre-gl.css', 'libs/pmtiles.js', 'icon-192.png', 'icon-512.png'];
var HOSTS_MAPA = ['tiles.openfreemap.org', 's3.amazonaws.com', 'server.arcgisonline.com'];
var SIN_CACHE = /\.pmtiles$|catalog\.json$/; // archivos grandes con pedidos parciales: van directo a la red
self.addEventListener('install', function (e) { e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION && k !== TESELAS; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
function recortar() { caches.open(TESELAS).then(function (c) { c.keys().then(function (ks) { if (ks.length > MAX_TESELAS) for (var i = 0; i < ks.length - MAX_TESELAS; i++) c.delete(ks[i]); }); }); }
var cuenta = 0;
self.addEventListener('fetch', function (e) {
  var r = e.request; if (r.method !== 'GET') return;
  var u = new URL(r.url);
  if (r.headers.has('range') || SIN_CACHE.test(u.pathname)) return;
  // Mapas y relieve: primero lo guardado (sirve sin señal en zonas ya vistas), si no, de la red.
  if (HOSTS_MAPA.indexOf(u.hostname) > -1) {
    e.respondWith(caches.open(TESELAS).then(function (c) {
      return c.match(r).then(function (hit) {
        var red = fetch(r).then(function (res) { if (res && (res.ok || res.type === 'opaque')) { c.put(r, res.clone()); if (++cuenta % 200 === 0) recortar(); } return res; });
        // Los estilos (JSON) se refrescan siempre que haya red.
        if (hit && !/\/styles\//.test(u.pathname)) return hit;
        return red.catch(function () { return hit || Response.error(); });
      });
    }));
    return;
  }
  if (u.origin !== location.origin) return;
  e.respondWith(fetch(r.url, { cache: 'no-cache' }).then(function (res) { if (res && res.ok) { var c = res.clone(); caches.open(VERSION).then(function (ca) { ca.put(r, c); }); } return res; })
    .catch(function () { return caches.match(r, { ignoreSearch: true }).then(function (h) { return h || caches.match('index.html'); }); }));
});
