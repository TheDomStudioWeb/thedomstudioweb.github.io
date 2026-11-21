/* =====================================================================
   DOMino Ruta · Navegación 3D — The DOM Studio Web
   Mapa: MapLibre + OpenFreeMap (OpenStreetMap) · Relieve: AWS Terrarium
   Rutas: Valhalla (FOSSGIS) · Búsqueda: Photon + Nominatim · Radares: Overpass
   Sin claves ni servidores propios. Se abre desde el Hub X5 con parámetros:
     ?destino=Texto&lat=&lng=&cliente=&id=&tel=&asesor=&volver=URL&marca=x5
     ?paradas=<base64url JSON [{c,d,lat,lng,id,t,h}]>&asesor=&volver=&marca=x5
   ===================================================================== */
(function () {
  'use strict';

  /* ── Configuración ─────────────────────────────────────────────── */
  var VALHALLA = 'https://valhalla1.openstreetmap.de';
  var PHOTON = 'https://photon.komoot.io/api/';
  var NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  var OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  var REGION = [-71.8, -41.6, -64.2, -27.5]; // Cuyo + Neuquén (oeste, sur, este, norte)
  var CENTRO = [-68.8458, -32.8895];         // Ciudad de Mendoza
  var ESTILOS = {
    claro: 'https://tiles.openfreemap.org/styles/liberty',
    oscuro: 'https://tiles.openfreemap.org/styles/dark',
    satelite: {
      version: 8,
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sources: { sat: { type: 'raster', tileSize: 256, maxzoom: 19, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] },
        rot: { type: 'raster', tileSize: 256, maxzoom: 19,
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'] } },
      layers: [{ id: 'sat', type: 'raster', source: 'sat' }, { id: 'rot', type: 'raster', source: 'rot', paint: { 'raster-opacity': .8 } }]
    }
  };
  var DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

  /* ── Utilidades ────────────────────────────────────────────────── */
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var z2 = function (n) { return String(n).padStart(2, '0'); };
  var hhmm = function (d) { return z2(d.getHours()) + ':' + z2(d.getMinutes()); };
  var RAD = Math.PI / 180;
  function dist(a, b) { // metros entre [lng,lat]
    var dLat = (b[1] - a[1]) * RAD, dLng = (b[0] - a[0]) * RAD;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 12742000 * Math.asin(Math.sqrt(s));
  }
  function rumbo(a, b) {
    var y = Math.sin((b[0] - a[0]) * RAD) * Math.cos(b[1] * RAD);
    var x = Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) - Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos((b[0] - a[0]) * RAD);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }
  function decode6(str) { // polyline con precisión 6 (Valhalla) → [[lng,lat]]
    var i = 0, lat = 0, lng = 0, out = [];
    while (i < str.length) {
      var b, s = 0, r = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32);
      lat += (r & 1) ? ~(r >> 1) : (r >> 1);
      s = 0; r = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32);
      lng += (r & 1) ? ~(r >> 1) : (r >> 1);
      out.push([lng / 1e6, lat / 1e6]);
    }
    return out;
  }
  function telAR(t) { // 549 + área + número (formato WhatsApp Argentina)
    var d = String(t || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('54') === 0) { d = d.slice(2); if (d[0] === '9') d = d.slice(1); }
    if (d[0] === '0') d = d.slice(1);
    if (d.length === 12) d = d.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2');
    return '549' + d;
  }
  // Las indicaciones de Valhalla vienen en español neutro ("Gire"): se pasan a voseo rioplatense.
  var VOSEO = [[/\bGire\b/g, 'Doblá'], [/\bgire\b/g, 'doblá'], [/\bContinúe\b/g, 'Seguí'], [/\bcontinúe\b/g, 'seguí'], [/\bSiga\b/g, 'Seguí'], [/\bsiga\b/g, 'seguí'],
    [/\bManténgase\b/g, 'Mantenete'], [/\bmanténgase\b/g, 'mantenete'], [/\bTome\b/g, 'Tomá'], [/\btome\b/g, 'tomá'], [/\bSalga\b/g, 'Salí'], [/\bsalga\b/g, 'salí'],
    [/\bDiríjase\b/g, 'Andá'], [/\bdiríjase\b/g, 'andá'], [/\bConduzca\b/g, 'Manejá'], [/\bconduzca\b/g, 'manejá'], [/\bEntre\b/g, 'Entrá'], [/\bIncorpórese\b/g, 'Incorporate'], [/\bincorpórese\b/g, 'incorporate'],
    [/\bHaga\b/g, 'Hacé'], [/\bhaga\b/g, 'hacé'], [/\bUsted ha llegado\b/gi, 'Llegaste'], [/\bHa llegado\b/g, 'Llegaste'], [/\bsu destino\b/g, 'tu destino'], [/\bSu destino\b/g, 'Tu destino'],
    [/\bestá a la derecha\b/g, 'queda a la derecha'], [/\bestá a la izquierda\b/g, 'queda a la izquierda']];
  function voseo(t) { t = String(t || ''); VOSEO.forEach(function (p) { t = t.replace(p[0], p[1]); }); return t; }
  function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1).replace('.', ',') + ' km' : (m >= 100 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10)) + ' m'; }
  var toastT;
  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, ms || 2800); }
  async function fetchJSON(url, opt, ms) {
    var c = new AbortController(), to = setTimeout(function () { c.abort(); }, ms || 15000);
    try { var r = await fetch(url, Object.assign({ signal: c.signal }, opt || {})); var j = await r.json(); if (!r.ok) { var e = new Error((j && (j.error || j.status_message)) || 'http ' + r.status); e.datos = j; throw e; } return j; }
    finally { clearTimeout(to); }
  }

  /* ── Parámetros (enlace desde el Hub) ──────────────────────────── */
  var P = new URLSearchParams(location.search);
  var ctx = { asesor: P.get('asesor') || '', volver: P.get('volver') || '', marca: P.get('marca') || '' };
  if (ctx.marca === 'x5') { document.body.classList.add('x5'); $('marca').textContent = 'X5 Ruta'; document.querySelector('meta[name=theme-color]').content = '#161618'; }
  var paradas = [];
  try {
    if (P.get('paradas')) {
      var b = P.get('paradas').replace(/-/g, '+').replace(/_/g, '/');
      paradas = JSON.parse(decodeURIComponent(escape(atob(b + '==='.slice((b.length + 3) % 4)))));
    } else if (P.get('destino') || (P.get('lat') && P.get('lng'))) {
      paradas = [{ d: P.get('destino') || '', lat: P.get('lat'), lng: P.get('lng'), c: P.get('cliente') || '', id: P.get('id') || '', t: P.get('tel') || '', h: P.get('hora') || '' }];
    }
  } catch (e) { paradas = []; }
  paradas = (Array.isArray(paradas) ? paradas : []).map(function (p, i) {
    var lat = parseFloat(p.lat), lng = parseFloat(p.lng);
    return { n: i + 1, c: p.c || '', d: p.d || '', id: p.id || '', t: p.t || '', h: p.h || '', pos: isFinite(lat) && isFinite(lng) && lat && lng ? [lng, lat] : null, hecha: !!p.ok };
  });
  var llegadasHoy = store.get('ruta_llegadas_hoy', {});
  if (llegadasHoy.fecha !== new Date().toDateString()) llegadasHoy = { fecha: new Date().toDateString(), ids: {} };
  paradas.forEach(function (p) { if (p.id && llegadasHoy.ids[p.id]) p.hecha = true; });
  if (ctx.volver) { $('dia-volver').href = ctx.volver; $('l-volver').href = ctx.volver; }

  /* ── Mapa ──────────────────────────────────────────────────────── */
  var pref = store.get('ruta_pref', { estilo: 'oscuro', d3: true, relieve: true, radares: true, voz: true });
  var map = new maplibregl.Map({
    container: 'map', style: ESTILOS[pref.estilo] || ESTILOS.oscuro, center: CENTRO, zoom: 13, pitch: pref.d3 ? 55 : 0, maxPitch: 75,
    attributionControl: false, hash: false, dragRotate: true, cooperativeGestures: false
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap · OpenFreeMap · Valhalla' }), 'bottom-left');
  map.touchZoomRotate.enableRotation();
  setTimeout(function () { var a = document.querySelector('.maplibregl-ctrl-attrib'); if (a) a.classList.remove('maplibregl-compact-show', 'maplibregl-compact'); if (a) a.classList.add('maplibregl-compact'); }, 1500);

  function svgYo() { return '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#3D8BFF33"/><path d="M20 6 31 32 20 26 9 32Z" fill="#3D8BFF" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>'; }
  var elYo = document.createElement('div'); elYo.className = 'yo'; elYo.innerHTML = svgYo();
  var mkYo = new maplibregl.Marker({ element: elYo, rotationAlignment: 'map', pitchAlignment: 'map' });
  var mkDest = null, mkParadas = [], mkRadares = [];

  function hayCapa(id) { return !!map.getLayer(id); }
  function overlays() { // se vuelven a poner cada vez que cambia el estilo
    if (!map.getSource('dem')) map.addSource('dem', { type: 'raster-dem', tiles: [DEM], tileSize: 256, maxzoom: 14, encoding: 'terrarium', attribution: 'Relieve: Mapzen/AWS Terrain' });
    if (pref.relieve && pref.d3) { try { map.setTerrain({ source: 'dem', exaggeration: 1.25 }); } catch (e) {} } else { try { map.setTerrain(null); } catch (e) {} }
    if (pref.relieve && !hayCapa('dom-sombras')) {
      var primera = (map.getStyle().layers || []).find(function (l) { return l.type === 'symbol'; });
      map.addLayer({ id: 'dom-sombras', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': .35, 'hillshade-shadow-color': '#000' } }, primera && primera.id);
    }
    // Edificios 3D: si el estilo no trae extrusión, se agrega una propia.
    var capas = map.getStyle().layers || [];
    var tieneExt = capas.some(function (l) { return l.type === 'fill-extrusion'; });
    if (!tieneExt && map.getSource('openmaptiles') && !hayCapa('dom-edificios')) {
      map.addLayer({ id: 'dom-edificios', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
        paint: { 'fill-extrusion-color': pref.estilo === 'oscuro' ? '#2a2d33' : '#d9d4c7', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': .85 } });
    }
    capas.forEach(function (l) { if (l.type === 'fill-extrusion') { try { map.setLayoutProperty(l.id, 'visibility', pref.d3 ? 'visible' : 'none'); } catch (e) {} } });
    if (!map.getSource('ruta-alt')) map.addSource('ruta-alt', { type: 'geojson', data: vacio() });
    if (!map.getSource('ruta')) map.addSource('ruta', { type: 'geojson', data: vacio(), lineMetrics: true });
    if (!hayCapa('ruta-alt')) map.addLayer({ id: 'ruta-alt', type: 'line', source: 'ruta-alt', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#8a93a6', 'line-width': 6, 'line-opacity': .6 } });
    if (!hayCapa('ruta-borde')) map.addLayer({ id: 'ruta-borde', type: 'line', source: 'ruta', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0b2a5c', 'line-width': 11 } });
    if (!hayCapa('ruta')) map.addLayer({ id: 'ruta', type: 'line', source: 'ruta', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#3D8BFF', 'line-width': 7 } });
    if (ruta) pintarRuta();
    try { if (map.setSky) map.setSky({ 'sky-color': pref.estilo === 'claro' ? '#9cc4ef' : '#0b1020', 'horizon-color': pref.estilo === 'claro' ? '#e6eef8' : '#1c2233', 'fog-color': pref.estilo === 'claro' ? '#e6eef8' : '#10131a', 'sky-horizon-blend': .5, 'horizon-fog-blend': .6, 'fog-ground-blend': .4 }); } catch (e) {}
  }
  function vacio() { return { type: 'FeatureCollection', features: [] }; }
  map.on('style.load', overlays);
  map.on('error', function (e) { if (e && e.error && /dem|terrarium/i.test(String(e.error.message || ''))) return; });

  function guardarPref() { store.set('ruta_pref', pref); }
  function marcarCapas() {
    document.querySelectorAll('[data-estilo]').forEach(function (b) { b.classList.toggle('on', b.dataset.estilo === pref.estilo); });
    $('cap-relieve').classList.toggle('on', pref.relieve);
    $('btn-3d').classList.toggle('on', pref.d3); $('btn-radar').classList.toggle('on', pref.radares);
  }
  marcarCapas();
  $('btn-capas').onclick = function () { $('capas').hidden = !$('capas').hidden; };
  document.querySelectorAll('[data-estilo]').forEach(function (b) {
    b.onclick = function () { pref.estilo = b.dataset.estilo; guardarPref(); marcarCapas(); map.setStyle(ESTILOS[pref.estilo]); $('capas').hidden = true; };
  });
  $('cap-relieve').onclick = function () { pref.relieve = !pref.relieve; guardarPref(); marcarCapas(); if (!pref.relieve && hayCapa('dom-sombras')) map.removeLayer('dom-sombras'); overlays(); };
  $('btn-3d').onclick = function () {
    pref.d3 = !pref.d3; guardarPref(); marcarCapas(); overlays();
    map.easeTo({ pitch: pref.d3 ? 55 : 0, duration: 600 });
  };
  $('btn-radar').onclick = function () { pref.radares = !pref.radares; guardarPref(); marcarCapas(); pintarRadares(); toast(pref.radares ? 'Avisos de radares activados' : 'Avisos de radares apagados'); };

  /* ── Ubicación ─────────────────────────────────────────────────── */
  var yo = null, yoRumbo = 0, yoVel = 0, watchId = null, primeraVez = true;
  function iniciarGPS() {
    if (!('geolocation' in navigator) || watchId != null) return;
    watchId = navigator.geolocation.watchPosition(onPos, function (err) {
      if (err.code === 1) toast('Activá el permiso de ubicación para navegar.', 4000);
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  }
  function onPos(p) {
    var nuevo = [p.coords.longitude, p.coords.latitude];
    var vel = p.coords.speed != null && p.coords.speed >= 0 ? p.coords.speed : (yo && p.timestamp && yo.t ? dist(yo.p, nuevo) / Math.max(1, (p.timestamp - yo.t) / 1000) : 0);
    if (!isFinite(vel) || vel > 70) vel = yoVel; // descarta saltos del GPS
    vel = yoVel ? yoVel * .4 + vel * .6 : vel;
    if (p.coords.heading != null && !isNaN(p.coords.heading) && vel > 1.5) yoRumbo = p.coords.heading;
    else if (yo && dist(yo.p, nuevo) > 6) yoRumbo = rumbo(yo.p, nuevo);
    yoVel = vel; yo = { p: nuevo, t: p.timestamp, acc: p.coords.accuracy };
    mkYo.setLngLat(nuevo).setRotation(yoRumbo); if (!mkYo._map) mkYo.addTo(map);
    if (primeraVez) { primeraVez = false; if (!paradas.length && !ruta) map.easeTo({ center: nuevo, zoom: 15, duration: 900 }); }
    if (nav.on) pasoNav();
  }
  $('btn-yo').onclick = function () {
    iniciarGPS();
    if (yo) map.easeTo({ center: yo.p, zoom: Math.max(map.getZoom(), 16), duration: 700 }); else toast('Buscando tu ubicación…');
    if (nav.on) { nav.seguir = true; }
  };
  function esperarUbicacion(ms) {
    return new Promise(function (res) {
      if (yo) return res(yo.p);
      iniciarGPS();
      var t0 = Date.now(), iv = setInterval(function () { if (yo || Date.now() - t0 > (ms || 12000)) { clearInterval(iv); res(yo ? yo.p : null); } }, 300);
    });
  }

  /* ── Búsqueda ──────────────────────────────────────────────────── */
  var qT, qN = 0;
  $('q').addEventListener('input', function () {
    var v = this.value.trim(); $('btn-limpiar').hidden = !v;
    clearTimeout(qT); if (v.length < 3) { $('sug').hidden = true; return; }
    qT = setTimeout(function () { sugerir(v); }, 350);
  });
  $('q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var v = this.value.trim(); if (v) buscarYIr(v); } });
  $('btn-limpiar').onclick = function () { $('q').value = ''; $('sug').hidden = true; this.hidden = true; $('q').focus(); };
  function etiquetaPhoton(f) {
    var p = f.properties || {};
    var linea1 = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || 'Lugar';
    if (p.name && p.street && p.osm_key !== 'highway') linea1 = p.name;
    var linea2 = [p.name && p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : '', p.district || p.locality, p.city || p.county, p.state].filter(Boolean).join(', ');
    return { t: linea1, s: linea2 };
  }
  async function sugerir(v, cerca) {
    var n = ++qN, c = yo ? yo.p : map.getCenter().toArray();
    var url = PHOTON + '?q=' + encodeURIComponent(v) + '&limit=7&lat=' + c[1].toFixed(4) + '&lon=' + c[0].toFixed(4) + '&bbox=' + REGION.join(',') + (cerca ? '&location_bias_scale=0.9&zoom=15' : '');
    try {
      var j = await fetchJSON(url, null, 9000); if (n !== qN) return;
      var fs = (j.features || []).filter(function (f) { return f.geometry && f.geometry.coordinates; });
      if (cerca && yo) fs.sort(function (a, b) { return dist(yo.p, a.geometry.coordinates) - dist(yo.p, b.geometry.coordinates); });
      mostrarSug(fs.map(function (f) { var e = etiquetaPhoton(f); return { t: e.t, s: e.s, pos: f.geometry.coordinates }; }));
    } catch (e) { if (n === qN) mostrarSug([], 'No se pudo buscar. Revisá la conexión.'); }
  }
  function mostrarSug(items, err) {
    var s = $('sug');
    if (!items.length) { s.innerHTML = '<button disabled><small>' + esc(err || 'Sin resultados. Probá con calle y número, y la localidad.') + '</small></button>'; s.hidden = false; return; }
    s.innerHTML = items.map(function (it, i) {
      var km = yo ? ' · ' + fmtDist(dist(yo.p, it.pos)) : '';
      return '<button data-i="' + i + '"><b>' + esc(it.t) + '</b><small>' + esc(it.s) + km + '</small></button>';
    }).join('');
    s.hidden = false;
    s.querySelectorAll('button[data-i]').forEach(function (b) {
      b.onclick = function () { var it = items[+b.dataset.i]; s.hidden = true; $('q').value = it.t; $('q').blur(); irA({ pos: it.pos, titulo: it.t, sub: it.s }); };
    });
  }
  document.querySelectorAll('[data-cerca]').forEach(function (b) {
    b.onclick = async function () { $('q').value = b.dataset.cerca; $('btn-limpiar').hidden = false; await esperarUbicacion(4000); sugerir(b.dataset.cerca, true); };
  });
  async function geocodificar(texto) {
    var m = String(texto).match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || String(texto).match(/[?&](?:query|q|destination)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i);
    if (m) return { pos: [parseFloat(m[2]), parseFloat(m[1])], titulo: texto };
    var limpio = String(texto).replace(/^https?:\/\/\S+$/, '');
    if (!limpio) return null;
    var base = NOMINATIM + '?format=jsonv2&limit=1&accept-language=es&countrycodes=ar&q=';
    var intentos = [base + encodeURIComponent(limpio) + '&viewbox=' + REGION.join(',') + '&bounded=1', base + encodeURIComponent(limpio)];
    for (var i = 0; i < intentos.length; i++) {
      try { var j = await fetchJSON(intentos[i], null, 12000); if (j && j[0]) return { pos: [parseFloat(j[0].lon), parseFloat(j[0].lat)], titulo: limpio, sub: j[0].display_name }; } catch (e) {}
      await new Promise(function (r) { setTimeout(r, 1100); }); // Nominatim pide 1 consulta por segundo
    }
    try { // último recurso: Photon
      var p = await fetchJSON(PHOTON + '?limit=1&q=' + encodeURIComponent(limpio) + '&bbox=' + REGION.join(','), null, 9000);
      if (p.features && p.features[0]) return { pos: p.features[0].geometry.coordinates, titulo: limpio, sub: etiquetaPhoton(p.features[0]).s };
    } catch (e) {}
    return null;
  }
  async function buscarYIr(v) {
    $('sug').hidden = true; toast('Buscando…');
    var g = await geocodificar(v);
    if (!g) return toast('No encontré esa dirección. Probá agregando la localidad.', 4000);
    irA({ pos: g.pos, titulo: v, sub: g.sub || '' });
  }
  map.on('contextmenu', function (e) { if (nav.on) return; irA({ pos: e.lngLat.toArray(), titulo: 'Punto marcado en el mapa', sub: e.lngLat.lat.toFixed(5) + ', ' + e.lngLat.lng.toFixed(5) }); });

  // Búsqueda por voz (Chrome / Android)
  var Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Reco) $('btn-voz-buscar').hidden = true;
  $('btn-voz-buscar').onclick = function () {
    try {
      var r = new Reco(); r.lang = 'es-AR'; r.interimResults = false; r.maxAlternatives = 1;
      r.onresult = function (e) { var t = e.results[0][0].transcript; $('q').value = t; $('btn-limpiar').hidden = false; sugerir(t); };
      r.onerror = function () { toast('No te escuché. Probá de nuevo.'); };
      r.start(); toast('Decí la dirección…', 3000);
    } catch (e) { toast('La búsqueda por voz no está disponible acá.'); }
  };

  /* ── Vistas de la hoja inferior ────────────────────────────────── */
  var VISTAS = ['v-inicio', 'v-dia', 'v-ruta', 'v-nav', 'v-llegada'];
  function vista(id) {
    VISTAS.forEach(function (v) { $(v).hidden = v !== id; });
    document.body.classList.toggle('nav', id === 'v-nav');
    requestAnimationFrame(function () {
      var h = $('sheet').getBoundingClientRect().height;
      document.documentElement.style.setProperty('--sheet', Math.round(h) + 'px');
    });
  }
  new ResizeObserver(function () { var h = $('sheet').getBoundingClientRect().height; document.documentElement.style.setProperty('--sheet', Math.round(h) + 'px'); }).observe($('sheet'));

  function pintarRecientes() {
    var rec = store.get('ruta_recientes', []);
    $('recientes').innerHTML = rec.length ? '<ol class="paradas">' + rec.slice(0, 4).map(function (r, i) {
      return '<li class="parada" data-r="' + i + '" role="button"><span class="num" style="background:#3a372c;color:var(--tx)">↺</span><div class="tx"><b>' + esc(r.titulo) + '</b><small>' + esc(r.sub || '') + '</small></div></li>';
    }).join('') + '</ol>' : '';
    $('recientes').querySelectorAll('[data-r]').forEach(function (li) { li.onclick = function () { var r = rec[+li.dataset.r]; irA(r); }; });
  }
  function guardarReciente(d) {
    if (!d || !d.pos || d.parada) return;
    var rec = store.get('ruta_recientes', []).filter(function (r) { return r.titulo !== d.titulo; });
    rec.unshift({ pos: d.pos, titulo: d.titulo, sub: d.sub || '' }); store.set('ruta_recientes', rec.slice(0, 8));
  }

  /* ── Ruta del día (paradas desde el Hub) ───────────────────────── */
  function marcadorParada(p) {
    var el = document.createElement('div'); el.className = 'pinp'; el.innerHTML = '<span>' + (p.hecha ? '✓' : p.n) + '</span>';
    if (p.hecha) el.style.background = '#4CC38A';
    el.onclick = function (e) { e.stopPropagation(); irAParada(p); };
    return new maplibregl.Marker({ element: el, anchor: 'bottom-left' }).setLngLat(p.pos).addTo(map);
  }
  function pintarParadas() {
    mkParadas.forEach(function (m) { m.remove(); }); mkParadas = [];
    paradas.forEach(function (p) { if (p.pos) mkParadas.push(marcadorParada(p)); });
  }
  function proxima() { return paradas.find(function (p) { return !p.hecha; }) || null; }
  function renderDia() {
    var pend = paradas.filter(function (p) { return !p.hecha; }).length;
    $('dia-info').textContent = paradas.length === 1 ? 'Entrevista a domicilio' + (ctx.asesor ? ' · ' + ctx.asesor : '') : paradas.length + ' entrevistas a domicilio · ' + pend + ' pendientes' + (ctx.asesor ? ' · ' + ctx.asesor : '');
    var px = proxima();
    $('dia-lista').innerHTML = paradas.map(function (p, i) {
      return '<li class="parada' + (p.hecha ? ' hecha' : '') + (px === p ? ' actual' : '') + '" data-p="' + i + '" role="button">' +
        '<span class="num"' + (p.hecha ? ' style="background:#4CC38A"' : '') + '>' + (p.hecha ? '✓' : p.n) + '</span>' +
        '<div class="tx"><b>' + esc((p.h ? p.h.slice(0, 5) + ' · ' : '') + (p.c || 'Entrevista')) + '</b><small>' + esc(p.d || (p.pos ? 'Ubicación marcada' : '')) + (p.pos ? '' : ' · buscando…') + '</small></div></li>';
    }).join('');
    $('dia-lista').querySelectorAll('[data-p]').forEach(function (li) { li.onclick = function () { irAParada(paradas[+li.dataset.p]); }; });
    $('dia-ir').disabled = !px; $('dia-ir').textContent = px ? (paradas.length === 1 ? 'Ver recorrido' : 'Ir a la próxima (' + px.n + ')') : 'Todas visitadas ✓';
    $('dia-opt').hidden = paradas.length < 3;
    $('dia-volver-w').hidden = !ctx.volver;
  }
  async function prepararParadas() {
    vista('v-dia'); renderDia();
    for (var i = 0; i < paradas.length; i++) {
      var p = paradas[i];
      if (!p.pos && p.d) { var g = await geocodificar(p.d); if (g) p.pos = g.pos; else $('dia-msg').textContent = 'No encontré el domicilio de ' + (p.c || 'una parada') + '. Revisalo en el Hub.'; renderDia(); }
    }
    pintarParadas();
    var con = paradas.filter(function (p) { return p.pos; });
    if (con.length === 1) map.easeTo({ center: con[0].pos, zoom: 15, pitch: pref.d3 ? 55 : 0, duration: 900 });
    else if (con.length > 1) { var bb = new maplibregl.LngLatBounds(); con.forEach(function (p) { bb.extend(p.pos); }); map.fitBounds(bb, { padding: { top: 120, bottom: 300, left: 50, right: 70 }, duration: 900 }); }
    if (paradas.length === 1 && paradas[0].pos && !paradas[0].hecha) irAParada(paradas[0]);
  }
  function irAParada(p) {
    if (!p) return;
    if (!p.pos) return toast('Todavía no tengo la ubicación de esa parada.');
    irA({ pos: p.pos, titulo: p.c || p.d || 'Entrevista', sub: [p.h ? p.h.slice(0, 5) + ' hs' : '', p.d].filter(Boolean).join(' · '), parada: p });
  }
  $('dia-ir').onclick = function () { irAParada(proxima()); };
  $('dia-opt').onclick = async function () {
    var pend = paradas.filter(function (p) { return !p.hecha && p.pos; });
    var desde = await esperarUbicacion(6000);
    if (!desde) return toast('Necesito tu ubicación para ordenar las paradas.');
    if (pend.length < 2) return;
    $('dia-msg').textContent = 'Ordenando por cercanía…';
    try {
      var locs = [{ lat: desde[1], lon: desde[0] }].concat(pend.map(function (p) { return { lat: p.pos[1], lon: p.pos[0] }; }));
      var j = await fetchJSON(VALHALLA + '/optimized_route?json=' + encodeURIComponent(JSON.stringify({ locations: locs, costing: 'auto', directions_options: { units: 'kilometers' } })), null, 25000);
      var orden = (j.trip.locations || []).map(function (l) { return l.original_index; }).filter(function (k) { return k > 0; });
      var nuevas = orden.map(function (k) { return pend[k - 1]; });
      var hechas = paradas.filter(function (p) { return p.hecha || !p.pos; });
      paradas = hechas.filter(function (p) { return p.hecha; }).concat(nuevas, hechas.filter(function (p) { return !p.hecha; }));
      paradas.forEach(function (p, i) { p.n = i + 1; });
      $('dia-msg').textContent = 'Listo: orden más corto desde donde estás (' + (j.trip.summary.length).toFixed(1).replace('.', ',') + ' km en total). Ojo con los horarios pactados.';
      renderDia(); pintarParadas();
    } catch (e) { $('dia-msg').textContent = 'No se pudo ordenar ahora. Seguí el orden por horario.'; }
  };

  /* ── Calcular recorrido ────────────────────────────────────────── */
  var destino = null, ruta = null, alternativas = [], radares = [];
  async function irA(d) {
    destino = d; $('capas').hidden = true; $('sug').hidden = true;
    if (mkDest) mkDest.remove(); mkDest = null;
    if (!d.parada) mkDest = new maplibregl.Marker({ color: getComputedStyle(document.body).getPropertyValue('--acc').trim() || '#D4AF37' }).setLngLat(d.pos).addTo(map);
    vista('v-ruta');
    $('r-titulo').textContent = d.titulo; $('r-sub').textContent = d.sub || '';
    $('r-min').textContent = '…'; $('r-km').textContent = ''; $('r-eta').textContent = ''; $('r-alts').innerHTML = ''; $('r-radares').textContent = ''; $('r-msg').textContent = 'Calculando recorrido…';
    $('r-iniciar').disabled = true;
    $('r-gmaps').href = 'https://www.google.com/maps/dir/?api=1&destination=' + d.pos[1].toFixed(6) + ',' + d.pos[0].toFixed(6) + '&travelmode=driving';
    pintarCamino($('r-camino'), d.parada, null);
    var desde = await esperarUbicacion(12000);
    if (!desde) { $('r-msg').textContent = 'No tengo tu ubicación. Activá el GPS y el permiso de ubicación.'; $('r-msg').className = 'msg er'; map.easeTo({ center: d.pos, zoom: 15 }); return; }
    $('r-msg').className = 'msg';
    try {
      var rs = await calcular(desde, d.pos, true);
      alternativas = rs; elegir(0);
      $('r-msg').textContent = ''; $('r-iniciar').disabled = false;
      guardarReciente(d);
      buscarRadares();
    } catch (e) { $('r-msg').textContent = 'No se pudo calcular el recorrido (' + e.message + '). Probá de nuevo o abrí Google Maps.'; $('r-msg').className = 'msg er'; }
  }
  async function calcular(desde, hasta, conAlternativas, rumboInicial) {
    var o = { lat: desde[1], lon: desde[0] };
    if (rumboInicial != null) { o.heading = Math.round(rumboInicial); o.heading_tolerance = 60; }
    var cuerpo = { locations: [o, { lat: hasta[1], lon: hasta[0] }], costing: 'auto', directions_options: { language: 'es-ES', units: 'kilometers' } };
    if (conAlternativas) cuerpo.alternates = 2;
    var j = await fetchJSON(VALHALLA + '/route?json=' + encodeURIComponent(JSON.stringify(cuerpo)), null, 20000);
    var trips = [j.trip].concat((j.alternates || []).map(function (a) { return a.trip; })).filter(Boolean);
    return trips.map(armarRuta);
  }
  function armarRuta(trip) {
    var leg = trip.legs[0], coords = decode6(leg.shape), cum = [0];
    for (var i = 1; i < coords.length; i++) cum.push(cum[i - 1] + dist(coords[i - 1], coords[i]));
    var mans = (leg.maneuvers || []).map(function (m) { return Object.assign({}, m, { at: cum[m.begin_shape_index] || 0 }); });
    return { coords: coords, cum: cum, total: cum[cum.length - 1], tiempo: trip.summary.time, km: trip.summary.length, mans: mans };
  }
  function elegir(i) {
    ruta = alternativas[i];
    var otras = alternativas.filter(function (_, k) { return k !== i; });
    if (map.getSource('ruta-alt')) map.getSource('ruta-alt').setData({ type: 'FeatureCollection', features: otras.map(function (r) { return { type: 'Feature', geometry: { type: 'LineString', coordinates: r.coords } }; }) });
    pintarRuta();
    var min = Math.round(ruta.tiempo / 60);
    $('r-min').textContent = min; $('r-km').textContent = ruta.km.toFixed(1).replace('.', ',');
    $('r-eta').textContent = hhmm(new Date(Date.now() + ruta.tiempo * 1000));
    $('r-alts').innerHTML = alternativas.length > 1 ? alternativas.map(function (r, k) {
      return '<button class="alt' + (k === i ? ' on' : '') + '" data-a="' + k + '">' + (k === 0 ? 'Más rápida' : 'Alternativa ' + k) + ' · ' + Math.round(r.tiempo / 60) + ' min · ' + r.km.toFixed(1).replace('.', ',') + ' km</button>';
    }).join('') : '';
    $('r-alts').querySelectorAll('[data-a]').forEach(function (b) { b.onclick = function () { elegir(+b.dataset.a); ubicarRadares(); }; });
    pintarCamino($('r-camino'), destino && destino.parada, ruta.tiempo);
    var bb = new maplibregl.LngLatBounds(); ruta.coords.forEach(function (c) { bb.extend(c); });
    map.fitBounds(bb, { padding: { top: 110, bottom: Math.min(innerHeight * .5, 360), left: 40, right: 70 }, pitch: pref.d3 ? 40 : 0, duration: 900, maxZoom: 16 });
  }
  function pintarRuta() { if (map.getSource('ruta') && ruta) map.getSource('ruta').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: ruta.coords } }); }
  function limpiarRuta() {
    ruta = null; alternativas = [];
    if (map.getSource('ruta')) map.getSource('ruta').setData(vacio());
    if (map.getSource('ruta-alt')) map.getSource('ruta-alt').setData(vacio());
    if (mkDest) mkDest.remove(); mkDest = null;
  }
  $('r-cancelar').onclick = function () { limpiarRuta(); destino = null; volverInicio(); };
  function volverInicio() { if (paradas.length) { vista('v-dia'); renderDia(); } else { vista('v-inicio'); pintarRecientes(); } }

  /* ── "Voy en camino" por WhatsApp ──────────────────────────────── */
  function textoCamino(p, seg) {
    var nombre = (p && p.c ? String(p.c).trim().split(/\s+/)[0] : '');
    var min = seg ? Math.max(1, Math.round(seg / 60)) : null;
    var quien = ctx.asesor ? 'Soy ' + ctx.asesor + ' de X5 Argentina. ' : (ctx.marca === 'x5' ? 'Te escribo de X5 Argentina. ' : '');
    return 'Hola' + (nombre ? ' ' + nombre : '') + ', ¿cómo estás? ' + quien + 'Ya estoy en camino' + (min ? ': llego en unos ' + min + ' minutos (' + hhmm(new Date(Date.now() + seg * 1000)) + ' aprox.)' : '') + '. ¡Nos vemos!';
  }
  function pintarCamino(a, p, seg) {
    if (!p) { a.hidden = true; return; }
    a.hidden = false;
    var n = telAR(p.t);
    a.href = 'https://wa.me/' + (n || '') + '?text=' + encodeURIComponent(textoCamino(p, seg));
  }

  /* ── Radares (OpenStreetMap) ───────────────────────────────────── */
  async function buscarRadares() {
    if (!ruta) return;
    var bb = new maplibregl.LngLatBounds(); ruta.coords.forEach(function (c) { bb.extend(c); });
    var s = bb.getSouth() - .01, w = bb.getWest() - .01, n = bb.getNorth() + .01, e = bb.getEast() + .01;
    var clave = [s, w, n, e].map(function (x) { return x.toFixed(2); }).join(',');
    var cache = store.get('ruta_radares', { t: 0, items: {} });
    var q = '[out:json][timeout:20];(node["highway"="speed_camera"](' + [s, w, n, e].join(',') + ');node["enforcement"="maxspeed"](' + [s, w, n, e].join(',') + '););out body;';
    for (var i = 0; i < OVERPASS.length; i++) {
      try {
        var j = await fetchJSON(OVERPASS[i], { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 22000);
        (j.elements || []).forEach(function (el) { if (el.lat) cache.items[el.id] = { id: el.id, pos: [el.lon, el.lat], max: parseInt((el.tags || {}).maxspeed, 10) || null }; });
        cache.t = Date.now(); store.set('ruta_radares', cache); break;
      } catch (err) {}
    }
    radares = Object.keys(cache.items).map(function (k) { return cache.items[k]; }).concat(store.get('ruta_radares_propios', []));
    ubicarRadares(); pintarRadares(); void clave;
  }
  function ubicarRadares() { // posición de cada radar a lo largo del recorrido (solo los que quedan sobre la ruta)
    if (!ruta) return;
    var sobre = 0;
    radares.forEach(function (r) {
      r.along = null; var best = 1e9, at = 0, c = ruta.coords, kx = Math.cos(r.pos[1] * RAD) * 111320, ky = 110540;
      for (var i = 0; i < c.length - 1; i++) {
        var ax = (c[i][0] - r.pos[0]) * kx, ay = (c[i][1] - r.pos[1]) * ky, dx = (c[i + 1][0] - c[i][0]) * kx, dy = (c[i + 1][1] - c[i][1]) * ky;
        var L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0, px = ax + t * dx, py = ay + t * dy, dd = Math.sqrt(px * px + py * py);
        if (dd < best) { best = dd; at = ruta.cum[i] + t * (ruta.cum[i + 1] - ruta.cum[i]); }
      }
      if (best < 45) { r.along = at; sobre++; }
      r.avisado = false;
    });
    $('r-radares').textContent = pref.radares ? (sobre ? '📡 ' + sobre + (sobre === 1 ? ' radar' : ' radares') + ' de velocidad en el recorrido (datos de OpenStreetMap).' : 'Sin radares cargados en este recorrido.') : '';
  }
  function pintarRadares() {
    mkRadares.forEach(function (m) { m.remove(); }); mkRadares = [];
    if (!pref.radares) return;
    radares.forEach(function (r) {
      var el = document.createElement('div'); el.className = 'radar-pin'; el.textContent = r.max || '📷'; el.title = 'Radar de velocidad';
      mkRadares.push(new maplibregl.Marker({ element: el }).setLngLat(r.pos).addTo(map));
    });
  }

  /* ── Voz ───────────────────────────────────────────────────────── */
  var vozES = null;
  function elegirVoz() {
    if (!('speechSynthesis' in window)) return;
    var vs = speechSynthesis.getVoices();
    vozES = vs.find(function (v) { return /es[-_]AR/i.test(v.lang); }) || vs.find(function (v) { return /es[-_](US|MX|419)/i.test(v.lang); }) || vs.find(function (v) { return /^es/i.test(v.lang); }) || null;
  }
  if ('speechSynthesis' in window) { elegirVoz(); speechSynthesis.onvoiceschanged = elegirVoz; }
  function hablar(t, urgente) {
    if (!pref.voz || !('speechSynthesis' in window) || !t) return;
    try {
      if (urgente) speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(voseo(t)); u.lang = vozES ? vozES.lang : 'es-AR'; if (vozES) u.voice = vozES; u.rate = 1.02;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function pintarVoz() { $('n-voz').textContent = pref.voz ? '🔊' : '🔇'; $('n-voz').classList.toggle('on', !pref.voz); }
  $('n-voz').onclick = function () { pref.voz = !pref.voz; guardarPref(); pintarVoz(); if (!pref.voz && 'speechSynthesis' in window) speechSynthesis.cancel(); };

  /* ── Navegación giro a giro ────────────────────────────────────── */
  var nav = { on: false, idx: 0, along: 0, fuera: 0, ultRecalc: 0, manIdx: -1, avisos: {}, seguir: true, recalculando: false, wake: null };
  function iconoGiro(m) {
    var t = m ? m.type : 8, ang = 0, rot = '';
    var mapa = { 9: 40, 10: 90, 11: 135, 12: 180, 13: -180, 14: -135, 15: -90, 16: -40, 18: 40, 19: -40, 20: 40, 21: -40, 23: 25, 24: -25, 37: 30, 38: -30 };
    if (t === 26 || t === 27) return '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="22" r="9"/><path d="M24 44V31M33 22h9M38 17l4 5-4 5"/></svg>';
    if (t === 4 || t === 5 || t === 6) return '<svg viewBox="0 0 48 48"><path d="M24 4c-8 0-14 6-14 14 0 10 14 26 14 26s14-16 14-26c0-8-6-14-14-14z" fill="#fff"/><circle cx="24" cy="18" r="5" fill="#0d3b2a"/></svg>';
    ang = mapa[t] || 0;
    if (Math.abs(ang) === 180) return '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"' + (ang < 0 ? ' transform="scale(-1,1)"' : '') + '><path d="M32 44V20a8 8 0 0 0-16 0v10"/><path d="M10 24l6 7 6-7"/></svg>';
    rot = ' style="transform:rotate(' + ang + 'deg)"';
    return '<svg viewBox="0 0 48 48"' + rot + ' fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="M24 44V8"/><path d="M12 19 24 7l12 12"/></svg>';
  }
  async function pedirWake() { try { if ('wakeLock' in navigator) nav.wake = await navigator.wakeLock.request('screen'); } catch (e) {} }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && nav.on) pedirWake(); });
  function iniciarNav() {
    if (!ruta) return;
    nav.on = true; nav.idx = 0; nav.along = 0; nav.fuera = 0; nav.manIdx = -1; nav.avisos = {}; nav.seguir = true; nav.radarAlerta = null;
    radares.forEach(function (r) { r.avisado = false; });
    if (map.getSource('ruta-alt')) map.getSource('ruta-alt').setData(vacio());
    $('giro').hidden = false; $('vel').hidden = false;
    vista('v-nav'); pintarVoz();
    var p = destino && destino.parada;
    $('n-cliente').hidden = !p;
    pedirWake();
    if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (e) {} }
    hablar((ruta.mans[0] && (ruta.mans[0].verbal_pre_transition_instruction || ruta.mans[0].instruction)) || 'Comenzamos', true);
    if (yo) pasoNav(); else iniciarGPS();
  }
  $('r-iniciar').onclick = iniciarNav;
  function terminarNav() {
    nav.on = false; $('giro').hidden = true; $('luego').hidden = true; $('vel').hidden = true; $('limite').hidden = true; $('alerta').hidden = true;
    try { if (nav.wake) nav.wake.release(); } catch (e) {} nav.wake = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    map.easeTo({ pitch: pref.d3 ? 55 : 0, bearing: 0, zoom: 14, duration: 700 });
  }
  $('n-salir').onclick = function () { terminarNav(); limpiarRuta(); volverInicio(); };
  $('n-vista').onclick = function () {
    nav.seguir = !nav.seguir;
    if (!nav.seguir && ruta) { var bb = new maplibregl.LngLatBounds(); ruta.coords.slice(nav.idx).forEach(function (c) { bb.extend(c); }); map.fitBounds(bb, { padding: { top: 140, bottom: 220, left: 40, right: 70 }, bearing: 0, pitch: 0, duration: 800 }); }
  };
  map.on('dragstart', function () { if (nav.on) nav.seguir = false; });

  function proyectar() { // ubica la posición sobre la ruta (busca cerca del último tramo)
    var c = ruta.coords, best = { d: 1e9, i: nav.idx, along: nav.along };
    var desde = Math.max(0, nav.idx - 3), hasta = Math.min(c.length - 1, nav.idx + 250);
    for (var i = desde; i < hasta; i++) {
      var a = c[i], b = c[i + 1], kx = Math.cos(yo.p[1] * RAD) * 111320, ky = 110540;
      var ax = (a[0] - yo.p[0]) * kx, ay = (a[1] - yo.p[1]) * ky, bx = (b[0] - yo.p[0]) * kx, by = (b[1] - yo.p[1]) * ky;
      var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
      var px = ax + t * dx, py = ay + t * dy, d = Math.sqrt(px * px + py * py);
      if (d < best.d) best = { d: d, i: i, along: ruta.cum[i] + t * (ruta.cum[i + 1] - ruta.cum[i]), seg: rumbo(a, b) };
    }
    return best;
  }
  function pasoNav() {
    if (!ruta || !yo) return;
    var pr = proyectar();
    if (pr.d > Math.max(45, (yo.acc || 0) * 1.2)) nav.fuera++; else { nav.fuera = 0; nav.idx = pr.i; nav.along = Math.max(nav.along - 20, pr.along); }
    var restante = Math.max(0, ruta.total - nav.along);
    var dDest = dist(yo.p, ruta.coords[ruta.coords.length - 1]);
    if (restante < 30 || dDest < 35) return llegar();
    if (nav.fuera >= 3 && !nav.recalculando && Date.now() - nav.ultRecalc > 12000) return recalcular();

    // Próxima maniobra
    var mi = ruta.mans.findIndex(function (m, k) { return k > 0 && m.at > nav.along + 3; });
    if (mi < 0) mi = ruta.mans.length - 1;
    var m = ruta.mans[mi], dMan = Math.max(0, m.at - nav.along);
    $('giro-ico').innerHTML = iconoGiro(m); $('giro-d').textContent = fmtDist(dMan); $('giro-i').textContent = voseo(m.instruction || '');
    var sig = ruta.mans[mi + 1];
    if (sig && sig.at - m.at < 250 && sig.type !== 4 && sig.type !== 5 && sig.type !== 6) { $('luego').hidden = false; $('luego').textContent = 'Después: ' + voseo(sig.instruction); } else $('luego').hidden = true;

    // Avisos de voz (según velocidad)
    var v = Math.max(yoVel, 8), lejos = Math.max(300, Math.min(900, v * 30)), cerca = Math.max(60, Math.min(200, v * 9));
    var av = nav.avisos[mi] || (nav.avisos[mi] = {});
    if (!av.lejos && dMan <= lejos && dMan > cerca * 1.6 && m.length !== undefined) { av.lejos = true; hablar('En ' + fmtDist(dMan).replace(' m', ' metros').replace(' km', ' kilómetros') + ', ' + (m.verbal_transition_alert_instruction || m.instruction)); }
    if (!av.cerca && dMan <= cerca) { av.cerca = true; hablar(m.verbal_pre_transition_instruction || m.instruction, true); }

    // ETA
    var frac = ruta.total ? restante / ruta.total : 0, seg = ruta.tiempo * frac;
    $('n-eta').textContent = hhmm(new Date(Date.now() + seg * 1000));
    $('n-rest').textContent = Math.max(1, Math.round(seg / 60)) + ' min · ' + fmtDist(restante);
    nav.seg = seg;
    if (destino && destino.parada) pintarCamino($('n-camino'), destino.parada, seg);

    // Velocidad y radares
    var kmh = Math.round(yoVel * 3.6); $('vel-n').textContent = kmh;
    var rad = null;
    if (pref.radares) radares.forEach(function (r) { if (r.along != null) { var adelante = r.along - nav.along; if (adelante > -10 && adelante < 600 && (!rad || adelante < rad.adelante)) rad = { r: r, adelante: adelante }; } });
    if (rad && rad.adelante > 0) {
      $('alerta').hidden = false; $('alerta').innerHTML = '📡 Radar a ' + fmtDist(rad.adelante) + (rad.r.max ? ' · máx. ' + rad.r.max + ' km/h' : '');
      if (rad.r.max) { $('limite').hidden = false; $('limite').textContent = rad.r.max; }
      $('vel').classList.toggle('rapido', !!(rad.r.max && kmh > rad.r.max + 3));
      if (!rad.r.avisado && rad.adelante < 450) { rad.r.avisado = true; hablar('Atención: radar de velocidad a ' + Math.round(rad.adelante / 50) * 50 + ' metros' + (rad.r.max ? '. Máxima ' + rad.r.max : ''), true); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {} }
    } else { $('alerta').hidden = true; $('limite').hidden = true; $('vel').classList.remove('rapido'); }

    // Cámara que sigue al vehículo
    if (nav.seguir) {
      var br = yoVel > 2 ? yoRumbo : (pr.seg != null ? pr.seg : map.getBearing());
      var zoom = yoVel > 22 ? 15.6 : yoVel > 12 ? 16.3 : 17;
      map.easeTo({ center: yo.p, bearing: br, pitch: pref.d3 ? 62 : 0, zoom: zoom, duration: 950, padding: { top: Math.round(innerHeight * .42), bottom: 0, left: 0, right: 0 } });
    }
  }
  async function recalcular() {
    nav.recalculando = true; nav.ultRecalc = Date.now(); toast('Recalculando…', 2000); hablar('Recalculando', true);
    try {
      var rs = await calcular(yo.p, destino.pos, false, yoVel > 2 ? yoRumbo : null);
      ruta = rs[0]; nav.idx = 0; nav.along = 0; nav.fuera = 0; nav.avisos = {}; pintarRuta(); ubicarRadares();
    } catch (e) { toast('Sin conexión para recalcular. Seguí la línea azul.', 3500); }
    nav.recalculando = false;
  }

  /* ── Llegada y registro ────────────────────────────────────────── */
  function llegar() {
    terminarNav();
    hablar('Llegaste a destino', true);
    var p = destino && destino.parada;
    vista('v-llegada');
    $('l-dest').textContent = destino ? destino.titulo + (destino.sub ? ' · ' + destino.sub : '') : '';
    $('l-llegue').hidden = !p || p.hecha; $('l-msg').textContent = p && p.hecha ? 'Llegada ya registrada.' : '';
    var queda = paradas.filter(function (x) { return !x.hecha && x !== p; }).length;
    $('l-sig').hidden = !p || !queda;
    $('l-volver').hidden = !ctx.volver;
  }
  function registrarLlegada(p) {
    if (!p || p.hecha) return;
    var ahora = new Date();
    p.hecha = true;
    llegadasHoy.ids[p.id || p.c] = hhmm(ahora); store.set('ruta_llegadas_hoy', llegadasHoy);
    // Cola compartida con el Hub (mismo sitio): el Hub la toma y la anota en la entrevista.
    if (p.id) {
      var cola = store.get('x5_llegadas', []);
      cola.push({ id: p.id, hora: hhmm(ahora), fecha: ahora.toISOString().slice(0, 10), lat: yo ? +yo.p[1].toFixed(6) : '', lng: yo ? +yo.p[0].toFixed(6) : '', dist: yo && p.pos ? Math.round(dist(yo.p, p.pos)) : '' });
      store.set('x5_llegadas', cola);
    }
    if (ctx.volver && p.id) {
      var u = ctx.volver + (ctx.volver.indexOf('?') > -1 ? '&' : '?') + 'llegada=' + encodeURIComponent(p.id) + '&hora=' + encodeURIComponent(hhmm(ahora)) + (yo && p.pos ? '&dist=' + Math.round(dist(yo.p, p.pos)) : '');
      $('l-volver').href = u; $('dia-volver').href = u;
    }
    pintarParadas(); renderDia();
    toast('Llegada registrada: ' + hhmm(ahora) + (ctx.volver ? '. Volvé al Hub para guardarla.' : ''), 3500);
  }
  $('l-llegue').onclick = function () { var p = destino && destino.parada; registrarLlegada(p); $('l-llegue').hidden = true; $('l-msg').textContent = 'Llegada registrada a las ' + hhmm(new Date()) + '.'; };
  $('n-llegue').onclick = function () { var p = destino && destino.parada; llegar(); registrarLlegada(p); $('l-llegue').hidden = true; $('l-msg').textContent = 'Llegada registrada.'; };
  $('l-sig').onclick = function () { limpiarRuta(); irAParada(proxima()); };
  $('l-cerrar').onclick = function () { limpiarRuta(); destino = null; volverInicio(); };

  /* ── Arranque ──────────────────────────────────────────────────── */
  if (paradas.length) prepararParadas();
  else { vista('v-inicio'); pintarRecientes(); }
  iniciarGPS();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
