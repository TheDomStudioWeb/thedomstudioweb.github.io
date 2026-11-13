// Bicisendas Mendoza · prototipo. Todo ocurre en el teléfono: el mapa y las bicisendas vienen de OpenStreetMap (Overpass), el cálculo
// del recorrido lo hace un servidor público de rutas (Valhalla) y el «nivel de seguridad» se mide acá, contra las bicisendas cargadas.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var BBOX = [-33.12, -69.02, -32.74, -68.60]; // sur, oeste, norte, este: Gran Mendoza
  var OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  var VALHALLA = 'https://valhalla1.openstreetmap.de/route';
  var NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  var CACHE_KEY = 'bici_infra_v3', CACHE_DIAS = 14; // solo lo de OpenStreetMap; los tramos agregados se guardan aparte
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
  // ── Tramos agregados a mano (reportes de usuarios que todavía no están en OpenStreetMap) ──
  // Se describen por calle y esquinas; el teléfono busca las esquinas en OpenStreetMap y dibuja el tramo real de la calle.
  // t: 'sep' ciclovía separada, 'carril' carril pintado, 'comp' bici compartida. Cuando el tramo ya esté en OpenStreetMap, se puede quitar de acá.
  // Si una esquina no tiene nombre en OpenStreetMap (por ejemplo, una calle de barrio privado), se indica con coordenadas:
  // desdePunto / hastaPunto: [lat, lon]. Se toma el punto de la calle más cercano (hasta 120 m).
  var TRAMOS_EXTRA = [
    { calle: 'Estrada', desdePunto: [-32.91899, -68.81361], hastaPunto: [-32.90133, -68.80440], t: 'carril', nota: 'Guaymallén · desde Búho (barrio privado, sin nombre en el mapa) hasta 25 de Mayo · carril pintado a mano izquierda · reportado por un usuario (12/11/2026)' }
  ];
  var MAX_PUNTO_M = 120;
  function zonaDe(x) { // recuadro alrededor de las dos puntas, con 300 m de margen
    var m = 0.003, a = x.desdePunto, c = x.hastaPunto;
    return [Math.min(a[0], c[0]) - m, Math.min(a[1], c[1]) - m, Math.max(a[0], c[0]) + m, Math.max(a[1], c[1]) + m].map(function (v) { return v.toFixed(5); }).join(',');
  }
  function consultaTramo(x) {
    if (x.desdePunto && x.hastaPunto) return '[out:json][timeout:30];way["highway"~"^(primary|secondary|tertiary|unclassified|residential|living_street|service|primary_link|secondary_link|tertiary_link|cycleway|road)$"](' + zonaDe(x) + ');out geom;';
    var b = BBOX.join(',');
    return '[out:json][timeout:30];' +
      'way["highway"]["name"~"' + x.calle + '",i](' + b + ')->.e;node(w.e)->.ne;' +
      (x.desde ? 'way["highway"]["name"~"' + x.desde + '",i](bn.ne)->.d;' : '') + (x.hasta ? 'way["highway"]["name"~"' + x.hasta + '",i](bn.ne)->.h;' : '') +
      '.e out geom;' + (x.desde ? '.d out body;' : '') + (x.hasta ? '.h out body;' : '');
  }
  // Camino más corto por la calle entre una esquina "desde" y una "hasta" (Dijkstra sobre los nodos de la calle).
  function armarTramo(json, x) {
    var el = json.elements || [], calle = new RegExp(x.calle, 'i'), rDesde = x.desde ? new RegExp(x.desde, 'i') : null, rHasta = x.hasta ? new RegExp(x.hasta, 'i') : null;
    var pos = {}, ady = {}, nodosD = {}, nodosH = {}, enCalle = {};
    el.forEach(function (w) {
      if (w.type !== 'way' || !w.nodes) return;
      var nom = (w.tags && w.tags.name) || '';
      // Con dos puntas en coordenadas entran todas las calles de la zona; las que no son la calle indicada cuestan 4 veces más,
      // así el camino sigue esa calle si está en el mapa y, si no tiene nombre, toma la más directa.
      var entra = w.geometry && (calle.test(nom) || (x.desdePunto && x.hastaPunto)), peso = calle.test(nom) ? 1 : 4;
      if (entra) {
        w.nodes.forEach(function (id, k) {
          var g = w.geometry[k]; if (!g) return; pos[id] = [g.lat, g.lon];
          if (k) { var a = w.nodes[k - 1]; (ady[a] = ady[a] || []).push([id, peso]); (ady[id] = ady[id] || []).push([a, peso]); }
        });
        if (calle.test(nom)) w.nodes.forEach(function (id) { enCalle[id] = 1; });
      }
      if (!calle.test(nom) && rDesde && rDesde.test(nom)) w.nodes.forEach(function (id) { nodosD[id] = 1; });
      if (!calle.test(nom) && rHasta && rHasta.test(nom)) w.nodes.forEach(function (id) { nodosH[id] = 1; });
    });
    // Esquina dada por coordenadas: el nodo de la calle más cercano
    function cercano(pt, destino) {
      var best = null, bd = MAX_PUNTO_M / 1000;
      // primero un nodo de la calle indicada; si no hay ninguno cerca, el de cualquier calle
      [true, false].forEach(function (soloCalle) { if (best) return; Object.keys(pos).forEach(function (id) { if (soloCalle && !enCalle[id]) return; var d = km(pt[0], pt[1], pos[id][0], pos[id][1]); if (d <= bd) { bd = d; best = id; } }); });
      if (best) destino[best] = 1;
    }
    if (x.desdePunto) cercano(x.desdePunto, nodosD);
    if (x.hastaPunto) cercano(x.hastaPunto, nodosH);
    var desde = Object.keys(nodosD).filter(function (id) { return pos[id]; }), hasta = Object.keys(nodosH).filter(function (id) { return pos[id]; });
    var mejor = null;
    desde.forEach(function (o) {
      var dist = {}, prev = {}, abiertos = [o]; dist[o] = 0;
      while (abiertos.length) {
        abiertos.sort(function (a, b) { return dist[a] - dist[b]; }); var u = abiertos.shift();
        if (dist[u] > 12) break; // tope: evita unir esquinas que no corresponden
        (ady[u] || []).forEach(function (par) {
          var v = par[0], d = dist[u] + par[1] * km(pos[u][0], pos[u][1], pos[v][0], pos[v][1]);
          if (dist[v] === undefined || d < dist[v]) { if (dist[v] === undefined) abiertos.push(String(v)); dist[v] = d; prev[v] = u; }
        });
      }
      hasta.forEach(function (h) {
        if (dist[h] === undefined || dist[h] > 12 || (mejor && dist[h] >= mejor.d)) return;
        var p = [], n = h; while (n !== undefined) { p.unshift(pos[n]); n = prev[n]; }
        mejor = { d: dist[h], p: p };
      });
    });
    return mejor && mejor.p.length > 1 ? { t: x.t, p: mejor.p.map(function (q) { return [Math.round(q[0] * 1e5) / 1e5, Math.round(q[1] * 1e5) / 1e5]; }), extra: x.nota } : null;
  }
  var EXTRA_KEY = 'bici_extra_' + JSON.stringify(TRAMOS_EXTRA).split('').reduce(function (h, c) { return (h * 31 + c.charCodeAt(0)) | 0; }, 7);
  var extrasFaltan = 0;
  function leerExtras() { try { var c = JSON.parse(localStorage.getItem(EXTRA_KEY)); if (c && c.d && c.d.length === TRAMOS_EXTRA.length && Date.now() - c.t < CACHE_DIAS * 864e5) return c.d; } catch (e) {} return null; }
  async function pedirExtras() {
    var out = [];
    for (var n = 0; n < TRAMOS_EXTRA.length; n++) {
      for (var i = 0; i < OVERPASS.length; i++) {
        try {
          var r = await fetch(OVERPASS[i], { method: 'POST', body: 'data=' + encodeURIComponent(consultaTramo(TRAMOS_EXTRA[n])), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
          if (!r.ok) throw new Error('http ' + r.status);
          var w = armarTramo(await r.json(), TRAMOS_EXTRA[n]); if (w) out.push(w); break;
        } catch (e) { /* si falla, se sigue sin ese tramo */ }
      }
    }
    extrasFaltan = TRAMOS_EXTRA.length - out.length;
    if (!extrasFaltan) try { localStorage.setItem(EXTRA_KEY, JSON.stringify({ t: Date.now(), d: out })); } catch (e) {}
    return out;
  }
  window.__bici = { armarTramo: armarTramo, consultaTramo: consultaTramo, TRAMOS_EXTRA: TRAMOS_EXTRA };

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
    var ex = forzar ? null : leerExtras();
    if (!ex) { extrasFaltan = 0; try { ex = await pedirExtras(); } catch (e) { ex = []; } } else extrasFaltan = 0;
    infra = d.concat(ex); indexar(); dibujarInfra();
    estadoCapa('Bicisendas: ' + Math.round(totalKm()) + ' km' + (extrasFaltan ? ' · ' + extrasFaltan + ' tramo sin ubicar' : ''));
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
  async function pedirRuta(m, desde) {
    var o = desde || pA, cuerpo = { locations: [{ lat: o.lat, lon: o.lon }, { lat: pB.lat, lon: pB.lon }], costing: 'bicycle', costing_options: { bicycle: { bicycle_type: 'Hybrid', cycling_speed: 16, use_roads: m.use_roads, use_hills: 0.3, avoid_bad_surfaces: 0.5 } }, directions_options: { language: 'es-ES', units: 'kilometers' } };
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
  // Distancia acumulada a lo largo de la ruta y posición de cada maniobra (para el modo en vivo).
  function preparar(r) {
    r.cum = [0]; for (var i = 0; i < r.pts.length - 1; i++) r.cum.push(r.cum[i] + km(r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]) * 1000);
    r.total = r.cum[r.cum.length - 1];
    r.man = r.pasos.map(function (p) { return { txt: p.instruction, at: r.cum[Math.min(p.begin_shape_index || 0, r.cum.length - 1)], tipo: p.type }; });
    return r;
  }
  function nivel(a) { var p = a.sep + a.carril; return p >= 70 ? ['Muy segura', 'n-ok'] : p >= 40 ? ['Con tramos de calle', 'n-warn'] : ['Mucha calle compartida', 'n-er']; }
  async function calcular() {
    if (!pA || !pB) return; var t = ++ticket; aviso('Calculando recorridos…'); $('res').hidden = true; capaRuta.clearLayers(); atenuar(false);
    var rs = await Promise.allSettled(MODOS.map(pedirRuta)); if (t !== ticket) return;
    if (rs.every(function (r) { return r.status === 'rejected'; })) { return aviso('No se pudo calcular el recorrido (' + (rs[0].reason && rs[0].reason.message || 'sin conexión') + '). Pruebe de nuevo en un momento.', 'er'); }
    rutas = rs.map(function (r) { if (r.status !== 'fulfilled') return null; var tr = r.value, pts = decodificar(tr.legs[0].shape); return preparar({ pts: pts, km: tr.summary.length, min: Math.round(tr.summary.time / 60), pasos: tr.legs[0].maneuvers || [], a: analizar(pts) }); });
    activa = rutas[0] ? 0 : 1; $('aviso').textContent = ''; mostrar(); map.fitBounds(L.latLngBounds([[pA.lat, pA.lon], [pB.lat, pB.lon]]).pad(0.3));
  }
  function dibujarRuta(r) {
    capaRuta.clearLayers(); L.polyline(r.pts, { color: '#fff', weight: 9, opacity: 0.9, interactive: false }).addTo(capaRuta);
    r.a.tramos.forEach(function (u) { L.polyline(u.p, { color: COLOR[u.t], weight: 6, opacity: 1, interactive: false }).addTo(capaRuta); });
  }
  function mostrar() {
    var r = rutas[activa]; if (!r) return; $('res').hidden = false; capaRuta.clearLayers(); atenuar(true);
    // la ruta se dibuja con un trazo blanco debajo para que resalte, y de color según el tipo de infraestructura
    dibujarRuta(r);
    [0, 1].forEach(function (i) { var q = rutas[i]; $('m' + i).setAttribute('aria-pressed', i === activa); $('t' + i).textContent = q ? q.km.toFixed(1).replace('.', ',') + ' km · ' + q.min + ' min · ' + (q.a.sep + q.a.carril) + '% bici' : 'No disponible'; $('m' + i).disabled = !q; });
    var n = nivel(r.a); $('rt').textContent = r.km.toFixed(1).replace('.', ',') + ' km · ' + r.min + ' min en bici'; var e = $('rn'); e.textContent = n[0]; e.className = 'nivel ' + n[1];
    $('rb').innerHTML = [['sep', r.a.sep], ['carril', r.a.carril], ['comp', r.a.comp], ['calle', r.a.calle]].map(function (x) { return '<i style="width:' + x[1] + '%;background:' + COLOR[x[0]] + '"></i>'; }).join('');
    $('rd').textContent = r.a.sep + '% por ciclovía separada, ' + r.a.carril + '% por carril bici, ' + r.a.comp + '% por calle con bici compartida y ' + r.a.calle + '% por calle común.' + (infra.length ? '' : ' (Sin datos de bicisendas cargados.)');
    $('gm').href = enlaceGoogle(r);
    var ol = $('pasos'); ol.innerHTML = ''; r.pasos.forEach(function (p) { var li = document.createElement('li'); li.textContent = p.instruction + (p.length ? ' (' + Math.round(p.length * 1000) + ' m)' : ''); ol.appendChild(li); });
  }
  // ── Modo en vivo ─────────────────────────────────────────────
  var nav = null;
  var FLECHA = { 1: '↑', 2: '↑', 3: '↑', 4: '⚑', 5: '⚑', 6: '⚑', 8: '↑', 9: '↗', 10: '→', 11: '↘', 12: '↩', 13: '↩', 14: '↙', 15: '←', 16: '↖', 26: '↻', 27: '↻' };
  var voz = false; try { voz = localStorage.getItem('bici_voz') === '1'; } catch (e) {}
  function hablar(t) { if (!voz || !window.speechSynthesis) return; try { var u = new SpeechSynthesisUtterance(t); u.lang = 'es-AR'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {} }
  function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : (m < 30 ? Math.round(m) : Math.round(m / 10) * 10) + ' m'; }
  function proyectar(r, lat, lon, desde) {
    var p = xy(lat, lon), mejor = null, n = r.pts.length - 1;
    function probar(i0, i1) {
      for (var i = Math.max(0, i0); i <= Math.min(n - 1, i1); i++) {
        var a = xy(r.pts[i][0], r.pts[i][1]), b = xy(r.pts[i + 1][0], r.pts[i + 1][1]), dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
        var qx = a[0] + t * dx - p[0], qy = a[1] + t * dy - p[1], d = Math.sqrt(qx * qx + qy * qy);
        if (!mejor || d < mejor.d) mejor = { d: d, s: r.cum[i] + t * (r.cum[i + 1] - r.cum[i]), seg: i };
      }
    }
    probar(desde - 3, desde + 80); if (!mejor || mejor.d > 60) probar(0, n - 1); // si se aleja, busca en toda la ruta
    return mejor;
  }
  function pedirPantalla() { try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { nav && (nav.lock = l); }).catch(function () {}); } catch (e) {} }
  function iniciarNav() {
    var r = rutas[activa]; if (!r) return;
    if (!navigator.geolocation) return aviso('Este teléfono no permite ubicarlo desde el navegador.', 'er');
    nav = { r: r, modo: activa, seg: 0, fuera: 0, hablado: {}, libre: false, recalc: 0, calculando: false, ultimo: null, lock: null };
    document.body.classList.add('nav'); $('nav').hidden = false; document.documentElement.style.setProperty('--sheet', '0px'); setTimeout(function () { map.invalidateSize(); }, 50);
    $('nvv').setAttribute('aria-pressed', voz); $('nvi').textContent = '…'; $('nvd').textContent = 'Buscando GPS'; $('nvt').textContent = 'Salga a un lugar abierto si tarda.';
    map.dragging.enable(); map.on('dragstart', alejar); pedirPantalla();
    nav.watch = navigator.geolocation.watchPosition(onPos, function (e) { $('nvt').textContent = e.code === 1 ? 'Falta el permiso de ubicación del navegador.' : 'Se perdió la señal GPS.'; }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
    hablar('Recorrido iniciado.');
  }
  function alejar() { if (nav) { nav.libre = true; $('nvc').hidden = false; } }
  function terminarNav(msg) {
    if (!nav) return; navigator.geolocation.clearWatch(nav.watch); try { nav.lock && nav.lock.release(); } catch (e) {} map.off('dragstart', alejar);
    if (nav.punto) { map.removeLayer(nav.punto); map.removeLayer(nav.circulo); }
    nav = null; document.body.classList.remove('nav'); $('nav').hidden = true; setAlto(alto); if (msg) aviso(msg, 'ok');
  }
  async function recalcular(lat, lon) {
    nav.calculando = true; $('nvt').textContent = 'Se salió del recorrido. Recalculando…'; $('nvi').textContent = '…'; hablar('Recalculando.');
    try {
      var tr = await pedirRuta(MODOS[nav.modo], { lat: lat, lon: lon }), pts = decodificar(tr.legs[0].shape);
      if (!nav) return; var r = preparar({ pts: pts, km: tr.summary.length, min: Math.round(tr.summary.time / 60), pasos: tr.legs[0].maneuvers || [], a: analizar(pts) });
      nav.r = r; nav.seg = 0; nav.fuera = 0; nav.hablado = {}; dibujarRuta(r);
    } catch (e) { if (nav) $('nvt').textContent = 'No se pudo recalcular. Siga las indicaciones del mapa.'; }
    if (nav) { nav.calculando = false; nav.recalc = Date.now(); }
  }
  function onPos(pos) {
    if (!nav) return; var c = pos.coords, lat = c.latitude, lon = c.longitude, ll = L.latLng(lat, lon);
    if (!nav.punto) { nav.circulo = L.circle(ll, { radius: c.accuracy, color: '#2F7DE1', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map); nav.punto = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="yo"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false, zIndexOffset: 1000 }).addTo(map); }
    else { nav.punto.setLatLng(ll); nav.circulo.setLatLng(ll).setRadius(c.accuracy); }
    if (!nav.libre) map.setView(ll, Math.max(map.getZoom(), 17), { animate: true });
    if (nav.calculando) return;
    var r = nav.r, pr = proyectar(r, lat, lon, nav.seg);
    if (pr.d > Math.max(40, c.accuracy) && c.accuracy < 80) { nav.fuera++; if (nav.fuera >= 3 && Date.now() - nav.recalc > 15000) return recalcular(lat, lon); } else { nav.fuera = 0; if (pr.d < 40) nav.seg = pr.seg; }
    var resta = Math.max(0, r.total - pr.s); $('nvr').textContent = fmtDist(resta); $('nvm').textContent = Math.max(1, Math.round(r.min * resta / (r.total || 1))) + ' min';
    if (resta <= 25) { hablar('Llegó a su destino.'); return terminarNav('Llegó a su destino.'); }
    var k = -1; for (var i = 0; i < r.man.length; i++) if (r.man[i].at > pr.s + 5) { k = i; break; }
    if (k < 0) k = r.man.length - 1; var m = r.man[k], dm = Math.max(0, m.at - pr.s);
    $('nvi').textContent = FLECHA[m.tipo] || '↑'; $('nvd').textContent = pr.d > 40 ? 'Fuera del recorrido' : 'En ' + fmtDist(dm); $('nvt').textContent = m.txt;
    if (dm < 110 && !nav.hablado[k + ':' + r.total]) { nav.hablado[k + ':' + r.total] = 1; hablar('En ' + fmtDist(Math.max(dm, 10)).replace(' m', ' metros').replace(' km', ' kilómetros') + ', ' + m.txt); }
  }
  document.addEventListener('visibilitychange', function () { if (nav && document.visibilityState === 'visible') pedirPantalla(); });
  $('go').onclick = iniciarNav; $('nvx').onclick = function () { terminarNav('Recorrido terminado.'); };
  $('nvc').onclick = function () { if (nav) { nav.libre = false; $('nvc').hidden = true; if (nav.punto) map.setView(nav.punto.getLatLng(), Math.max(map.getZoom(), 17)); } };
  $('nvv').onclick = function () { voz = !voz; try { localStorage.setItem('bici_voz', voz ? '1' : '0'); } catch (e) {} this.setAttribute('aria-pressed', voz); if (voz) hablar('Voz activada.'); else if (window.speechSynthesis) speechSynthesis.cancel(); };

  $('m0').onclick = function () { if (rutas[0]) { activa = 0; mostrar(); } };
  $('m1').onclick = function () { if (rutas[1]) { activa = 1; mostrar(); } };
  function aviso(t, k) { var a = $('aviso'); a.className = 'msg ' + (k || ''); a.textContent = t; }

  cargarInfra(false);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
