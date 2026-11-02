// Bicisendas Mendoza · prototipo. Todo ocurre en el teléfono: el mapa y las bicisendas vienen de OpenStreetMap (Overpass), el cálculo
// del recorrido lo hace un servidor público de rutas (Valhalla) y el «nivel de seguridad» se mide acá, contra las bicisendas cargadas.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var BBOX = [-33.12, -69.02, -32.74, -68.60]; // sur, oeste, norte, este: Gran Mendoza
  var OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  var VALHALLA = 'https://valhalla1.openstreetmap.de/route';
  var NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  var CACHE_KEY = 'bici_infra_v1', CACHE_DIAS = 14;
  var COLOR = { sep: '#0E9F5A', carril: '#5CCB8C', comp: '#2F7DE1', calle: '#E8710A' };

  // ── Mapa ─────────────────────────────────────────────────────
  var map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([-32.8908, -68.8272], 13);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  var capaInfra = L.layerGroup().addTo(map), capaRuta = L.layerGroup().addTo(map);

  // ── Hoja inferior (se arrastra) ──────────────────────────────
  var alto = Math.round(Math.min(window.innerHeight * 0.46, 380));
  function setAlto(h) { alto = Math.max(120, Math.min(window.innerHeight - 140, h)); document.documentElement.style.setProperty('--sheet', alto + 'px'); setTimeout(function () { map.invalidateSize(); }, 50); }
  setAlto(alto);
  (function () {
    var y0 = null, h0 = 0, g = $('grip');
    g.addEventListener('pointerdown', function (e) { y0 = e.clientY; h0 = alto; g.setPointerCapture(e.pointerId); });
    g.addEventListener('pointermove', function (e) { if (y0 !== null) setAlto(h0 + (y0 - e.clientY)); });
    g.addEventListener('pointerup', function () { y0 = null; });
  })();

  // ── Bicisendas (Overpass) ────────────────────────────────────
  var infra = [];       // [{t:'sep'|'carril'|'comp', p:[[lat,lon],...]}]
  var grilla = {};      // índice espacial para medir distancias
  var LAT0 = -32.9, K_LAT = 110540, K_LON = 111320 * Math.cos(LAT0 * Math.PI / 180), CELDA = 40;
  function xy(lat, lon) { return [(lon + 68.8) * K_LON, (lat - LAT0) * K_LAT]; }
  function clave(i, j) { return i + ',' + j; }

  function consulta() {
    var b = BBOX.join(','), T = '^(track|lane|opposite_track|opposite_lane|share_busway|opposite_share_busway)$';
    return '[out:json][timeout:90];(' +
      'way["highway"="cycleway"](' + b + ');' +
      'way["cycleway"~"' + T + '"](' + b + ');' +
      'way["cycleway:left"~"' + T + '"](' + b + ');' +
      'way["cycleway:right"~"' + T + '"](' + b + ');' +
      'way["cycleway:both"~"' + T + '"](' + b + ');' +
      'way["highway"~"path|footway|pedestrian|track"]["bicycle"="designated"](' + b + ');' +
      ');out geom;';
  }
  function tipoDe(t) {
    t = t || {};
    if (t.highway === 'cycleway' || t.highway === 'path' || t.highway === 'footway' || t.highway === 'pedestrian' || t.highway === 'track') return 'sep';
    var v = [t.cycleway, t['cycleway:left'], t['cycleway:right'], t['cycleway:both']].join(' ');
    if (/track/.test(v)) return 'sep';
    if (/lane/.test(v)) return 'carril';
    return 'comp';
  }
  function comprimir(json) {
    return (json.elements || []).filter(function (e) { return e.type === 'way' && e.geometry && e.geometry.length > 1; }).map(function (e) {
      return { t: tipoDe(e.tags), p: e.geometry.map(function (g) { return [Math.round(g.lat * 1e5) / 1e5, Math.round(g.lon * 1e5) / 1e5]; }) };
    });
  }
  function leerCache() { try { var c = JSON.parse(localStorage.getItem(CACHE_KEY)); if (c && c.d && Date.now() - c.t < CACHE_DIAS * 864e5) return c.d; } catch (e) {} return null; }
  function guardarCache(d) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {} }
  async function pedirOverpass() {
    var ultimo;
    for (var i = 0; i < OVERPASS.length; i++) {
      try {
        var c = new AbortController(), to = setTimeout(function () { c.abort(); }, 60000);
        var r = await fetch(OVERPASS[i], { method: 'POST', body: 'data=' + encodeURIComponent(consulta()), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: c.signal });
        clearTimeout(to); if (!r.ok) throw new Error('http ' + r.status);
        return comprimir(await r.json());
      } catch (e) { ultimo = e; }
    }
    throw ultimo || new Error('sin respuesta');
  }
  function indexar() {
    grilla = {};
    infra.forEach(function (w, wi) {
      for (var k = 0; k < w.p.length - 1; k++) {
        var a = xy(w.p[k][0], w.p[k][1]), b = xy(w.p[k + 1][0], w.p[k + 1][1]);
        var i0 = Math.floor(Math.min(a[0], b[0]) / CELDA), i1 = Math.floor(Math.max(a[0], b[0]) / CELDA), j0 = Math.floor(Math.min(a[1], b[1]) / CELDA), j1 = Math.floor(Math.max(a[1], b[1]) / CELDA);
        for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) { var c = clave(i, j); (grilla[c] = grilla[c] || []).push([wi, a[0], a[1], b[0], b[1]]); }
      }
    });
  }
  function distSeg(px, py, s) {
    var dx = s[3] - s[1], dy = s[4] - s[2], l2 = dx * dx + dy * dy, t = l2 ? ((px - s[1]) * dx + (py - s[2]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    var qx = s[1] + t * dx - px, qy = s[2] + t * dy - py; return Math.sqrt(qx * qx + qy * qy);
  }
  // Tipo de infraestructura a menos de 15 m de un punto ('sep' > 'carril' > 'comp'), o 'calle'.
  var RANGO = { sep: 3, carril: 2, comp: 1 };
  function tipoCerca(lat, lon) {
    var p = xy(lat, lon), i = Math.floor(p[0] / CELDA), j = Math.floor(p[1] / CELDA), mejor = null;
    for (var a = i - 1; a <= i + 1; a++) for (var b = j - 1; b <= j + 1; b++) {
      var l = grilla[clave(a, b)]; if (!l) continue;
      for (var n = 0; n < l.length; n++) { if (distSeg(p[0], p[1], l[n]) <= 15) { var t = infra[l[n][0]].t; if (!mejor || RANGO[t] > RANGO[mejor]) mejor = t; } }
    }
    return mejor || 'calle';
  }
  function dibujarInfra() {
    capaInfra.clearLayers(); var r = L.canvas({ padding: 0.3 });
    infra.forEach(function (w) { L.polyline(w.p, { color: COLOR[w.t], weight: w.t === 'sep' ? 4 : 3, opacity: 0.9, renderer: r, interactive: false }).addTo(capaInfra); });
  }
  // Con un recorrido dibujado, las demás bicisendas pasan a un segundo plano para que no confundan.
  function atenuar(on) { capaInfra.eachLayer(function (l) { l.setStyle({ opacity: on ? 0.14 : 0.9, weight: on ? 2 : (l.options.color === COLOR.sep ? 4 : 3) }); }); }
  function km(lat1, lon1, lat2, lon2) { var a = xy(lat1, lon1), b = xy(lat2, lon2); return Math.hypot(a[0] - b[0], a[1] - b[1]) / 1000; }
  function totalKm() { var s = 0; infra.forEach(function (w) { for (var k = 0; k < w.p.length - 1; k++) s += km(w.p[k][0], w.p[k][1], w.p[k + 1][0], w.p[k + 1][1]); }); return s; }
  function estadoCapa(txt) { $('capa').textContent = txt; }
  async function cargarInfra(forzar) {
    var d = forzar ? null : leerCache();
    if (!d) { estadoCapa('Bicisendas: descargando…'); try { d = await pedirOverpass(); guardarCache(d); } catch (e) { estadoCapa('Bicisendas: sin datos (tocar)'); aviso('No se pudieron descargar las bicisendas. Puede intentar de nuevo tocando el botón de arriba.', 'er'); return; } }
    infra = d; indexar(); dibujarInfra(); estadoCapa('Bicisendas: ' + Math.round(totalKm()) + ' km');
    if (pA && pB) calcular();
  }
  $('capa').onclick = function () {
    if (!infra.length) return cargarInfra(true);
    var on = this.getAttribute('aria-pressed') !== 'true'; this.setAttribute('aria-pressed', on);
    if (on) map.addLayer(capaInfra); else map.removeLayer(capaInfra);
  };

  // ── Puntos A y B ─────────────────────────────────────────────
  var pA = null, pB = null, mA = null, mB = null;
  function pin(txt, bg) { return L.divIcon({ className: '', html: '<div class="pin" style="background:' + bg + '">' + txt + '</div>', iconSize: [30, 30], iconAnchor: [15, 15] }); }
  function poner(cual, ll, texto) {
    var esA = cual === 'a', m = esA ? mA : mB;
    if (m) m.setLatLng(ll); else {
      m = L.marker(ll, { icon: pin(esA ? 'A' : 'B', esA ? '#4CC38A' : '#D4AF37'), draggable: true }).addTo(map);
      m.on('dragend', function () { var p = m.getLatLng(); fijar(cual, p, p.lat.toFixed(5) + ', ' + p.lng.toFixed(5)); });
      if (esA) mA = m; else mB = m;
    }
    fijar(cual, ll, texto);
  }
  function fijar(cual, ll, texto) { var v = { lat: ll.lat, lon: ll.lng }; if (cual === 'a') pA = v; else pB = v; if (texto != null) $(cual === 'a' ? 'qa' : 'qb').value = texto; if (pA && pB) calcular(); }
  map.on('click', function (e) {
    var t = e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5);
    if (!pA) poner('a', e.latlng, t); else if (!pB) poner('b', e.latlng, t); else poner('b', e.latlng, t);
  });
  $('gps').onclick = function () {
    if (!navigator.geolocation) return aviso('Este teléfono no permite ubicarlo desde el navegador.', 'er');
    aviso('Buscando su ubicación…');
    navigator.geolocation.getCurrentPosition(function (p) { var ll = L.latLng(p.coords.latitude, p.coords.longitude); poner('a', ll, 'Mi ubicación'); map.setView(ll, 15); }, function () { aviso('No se pudo obtener la ubicación. Revise el permiso del navegador.', 'er'); }, { enableHighAccuracy: true, timeout: 12000 });
  };
  $('inv').onclick = function () {
    if (!pA || !pB) return;
    var a = pA, b = pB, ta = $('qa').value, tb = $('qb').value;
    mA.setLatLng([b.lat, b.lon]); mB.setLatLng([a.lat, a.lon]); pA = b; pB = a; $('qa').value = tb; $('qb').value = ta; calcular();
  };

  // ── Buscador de direcciones (Nominatim) ──────────────────────
  function buscador(inp, sug, cual) {
    var tm;
    inp.addEventListener('input', function () {
      clearTimeout(tm); var q = inp.value.trim(); sug.hidden = true; if (q.length < 4 || /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(q)) return;
      tm = setTimeout(async function () {
        try {
          var u = NOMINATIM + '?format=jsonv2&limit=5&countrycodes=ar&bounded=1&viewbox=' + BBOX[1] + ',' + BBOX[2] + ',' + BBOX[3] + ',' + BBOX[0] + '&q=' + encodeURIComponent(q + ', Mendoza');
          var r = await fetch(u, { headers: { 'Accept-Language': 'es' } }); var j = await r.json();
          sug.innerHTML = ''; if (!j.length) { sug.hidden = true; return aviso('No encontré esa dirección. Pruebe con calle, número y departamento, o toque el mapa.', 'er'); }
          j.forEach(function (it) { var b = document.createElement('button'); b.type = 'button'; b.textContent = it.display_name.split(',').slice(0, 3).join(','); b.onclick = function () { sug.hidden = true; var ll = L.latLng(+it.lat, +it.lon); poner(cual, ll, b.textContent); map.setView(ll, 15); }; sug.appendChild(b); });
          sug.hidden = false;
        } catch (e) { aviso('No se pudo buscar la dirección. Toque el mapa para marcar el punto.', 'er'); }
      }, 700);
    });
  }
  buscador($('qa'), $('sa'), 'a'); buscador($('qb'), $('sb'), 'b');

  // ── Recorrido (Valhalla) ─────────────────────────────────────
  var MODOS = [{ use_roads: 0.05, nombre: 'segura' }, { use_roads: 0.7, nombre: 'directa' }];
  var rutas = [null, null], activa = 0, ticket = 0;
  function decodificar(s) { // polilínea codificada con 6 decimales
    var i = 0, lat = 0, lon = 0, out = [];
    while (i < s.length) {
      for (var k = 0; k < 2; k++) { var sh = 0, r = 0, b; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); var d = (r & 1) ? ~(r >> 1) : (r >> 1); if (k === 0) lat += d; else lon += d; }
      out.push([lat / 1e6, lon / 1e6]);
    }
    return out;
  }
  async function pedirRuta(m) {
    var cuerpo = { locations: [{ lat: pA.lat, lon: pA.lon }, { lat: pB.lat, lon: pB.lon }], costing: 'bicycle', costing_options: { bicycle: { bicycle_type: 'Hybrid', cycling_speed: 16, use_roads: m.use_roads, use_hills: 0.3, avoid_bad_surfaces: 0.5 } }, directions_options: { language: 'es-ES', units: 'kilometers' } };
    var c = new AbortController(), to = setTimeout(function () { c.abort(); }, 25000);
    try { var r = await fetch(VALHALLA + '?json=' + encodeURIComponent(JSON.stringify(cuerpo)), { signal: c.signal }); var j = await r.json(); if (!r.ok || !j.trip) throw new Error((j && (j.error || j.status_message)) || 'http ' + r.status); return j.trip; } finally { clearTimeout(to); }
  }
  // Recorre la ruta cada ~10 m y mide cuánto va por cada tipo de infraestructura.
  function analizar(pts) {
    var tramos = [], acum = { sep: 0, carril: 0, comp: 0, calle: 0 }, total = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var d = km(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) * 1000, n = Math.max(1, Math.round(d / 10));
      for (var s = 0; s < n; s++) {
        var f = (s + 0.5) / n, lat = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, lon = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f, t = infra.length ? tipoCerca(lat, lon) : 'calle', len = d / n;
        acum[t] += len; total += len;
        var u = tramos[tramos.length - 1]; if (u && u.t === t) { u.p.push([lat, lon]); } else tramos.push({ t: t, p: [u ? u.p[u.p.length - 1] : pts[i], [lat, lon]] });
      }
    }
    var pct = function (x) { return total ? Math.round(100 * x / total) : 0; };
    return { tramos: tramos, total: total, sep: pct(acum.sep), carril: pct(acum.carril), comp: pct(acum.comp), calle: pct(acum.calle), enInfra: pct(acum.sep + acum.carril) };
  }
  // Google Maps recalcula por su cuenta entre origen y destino. Para que siga el mismo camino se le pasan puntos intermedios:
  // se eligen los que más se apartan de una recta (las esquinas y desvíos que definen la ruta), hasta WAY_MAX.
  var WAY_MAX = 8;
  function puntosClave(pts, max) {
    var P = pts.map(function (p) { return xy(p[0], p[1]); }), sel = [0, pts.length - 1];
    while (sel.length < max + 2) {
      var mejor = 0, bi = -1;
      for (var s = 0; s < sel.length - 1; s++) for (var i = sel[s] + 1; i < sel[s + 1]; i++) { var d = distSeg(P[i][0], P[i][1], [0, P[sel[s]][0], P[sel[s]][1], P[sel[s + 1]][0], P[sel[s + 1]][1]]); if (d > mejor) { mejor = d; bi = i; } }
      if (bi < 0 || mejor < 20) break; sel.push(bi); sel.sort(function (x, y) { return x - y; });
    }
    return sel.slice(1, -1).map(function (i) { return pts[i]; });
  }
  function enlaceGoogle(r) {
    var w = puntosClave(r.pts, WAY_MAX), f = function (p) { return p[0].toFixed(5) + ',' + p[1].toFixed(5); };
    return 'https://www.google.com/maps/dir/?api=1&origin=' + pA.lat.toFixed(5) + ',' + pA.lon.toFixed(5) + '&destination=' + pB.lat.toFixed(5) + ',' + pB.lon.toFixed(5) + '&travelmode=bicycling' + (w.length ? '&waypoints=' + w.map(f).join('%7C') : '');
  }
  function nivel(a) { var p = a.sep + a.carril; return p >= 70 ? ['Muy segura', 'n-ok'] : p >= 40 ? ['Con tramos de calle', 'n-warn'] : ['Mucha calle compartida', 'n-er']; }
  async function calcular() {
    if (!pA || !pB) return; var t = ++ticket; aviso('Calculando recorridos…'); $('res').hidden = true; capaRuta.clearLayers(); atenuar(false);
    var rs = await Promise.allSettled(MODOS.map(pedirRuta)); if (t !== ticket) return;
    if (rs.every(function (r) { return r.status === 'rejected'; })) { return aviso('No se pudo calcular el recorrido (' + (rs[0].reason && rs[0].reason.message || 'sin conexión') + '). Pruebe de nuevo en un momento.', 'er'); }
    rutas = rs.map(function (r) { if (r.status !== 'fulfilled') return null; var tr = r.value, pts = decodificar(tr.legs[0].shape); return { pts: pts, km: tr.summary.length, min: Math.round(tr.summary.time / 60), pasos: tr.legs[0].maneuvers || [], a: analizar(pts) }; });
    activa = rutas[0] ? 0 : 1; $('aviso').textContent = ''; mostrar(); map.fitBounds(L.latLngBounds([[pA.lat, pA.lon], [pB.lat, pB.lon]]).pad(0.3));
  }
  function mostrar() {
    var r = rutas[activa]; if (!r) return; $('res').hidden = false; capaRuta.clearLayers(); atenuar(true);
    // la ruta se dibuja con un trazo blanco debajo para que resalte, y de color según el tipo de infraestructura
    L.polyline(r.pts, { color: '#fff', weight: 9, opacity: 0.9, interactive: false }).addTo(capaRuta);
    r.a.tramos.forEach(function (u) { L.polyline(u.p, { color: COLOR[u.t], weight: 6, opacity: 1, interactive: false }).addTo(capaRuta); });
    [0, 1].forEach(function (i) { var q = rutas[i]; $('m' + i).setAttribute('aria-pressed', i === activa); $('t' + i).textContent = q ? q.km.toFixed(1).replace('.', ',') + ' km · ' + q.min + ' min · ' + (q.a.sep + q.a.carril) + '% bici' : 'No disponible'; $('m' + i).disabled = !q; });
    var n = nivel(r.a); $('rt').textContent = r.km.toFixed(1).replace('.', ',') + ' km · ' + r.min + ' min en bici'; var e = $('rn'); e.textContent = n[0]; e.className = 'nivel ' + n[1];
    $('rb').innerHTML = [['sep', r.a.sep], ['carril', r.a.carril], ['comp', r.a.comp], ['calle', r.a.calle]].map(function (x) { return '<i style="width:' + x[1] + '%;background:' + COLOR[x[0]] + '"></i>'; }).join('');
    $('rd').textContent = r.a.sep + '% por ciclovía separada, ' + r.a.carril + '% por carril bici, ' + r.a.comp + '% por calle con bici compartida y ' + r.a.calle + '% por calle común.' + (infra.length ? '' : ' (Sin datos de bicisendas cargados.)');
    $('gm').href = enlaceGoogle(r);
    var ol = $('pasos'); ol.innerHTML = ''; r.pasos.forEach(function (p) { var li = document.createElement('li'); li.textContent = p.instruction + (p.length ? ' (' + Math.round(p.length * 1000) + ' m)' : ''); ol.appendChild(li); });
  }
  $('m0').onclick = function () { if (rutas[0]) { activa = 0; mostrar(); } };
  $('m1').onclick = function () { if (rutas[1]) { activa = 1; mostrar(); } };
  function aviso(t, k) { var a = $('aviso'); a.className = 'msg ' + (k || ''); a.textContent = t; }

  cargarInfra(false);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
