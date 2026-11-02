/* Retrato circuito para la foto de "Sobre mí".
   La foto se dibuja como una ilustración de líneas (silueta, rasgos y líneas de flujo que
   siguen la forma del cuerpo), generada con tools/portrait-lines.py. Encima:
   - encendido: las líneas se trazan solas cuando la sección entra en pantalla;
   - pulsos de luz que recorren las líneas, muchos salen del chip de la solapa;
   - sonda: con el mouse (o el dedo) las líneas cercanas se iluminan y aparecen nodos,
     con una lectura de coordenadas;
   - pistas de circuito tenues en el fondo;
   - al seguir bajando, el dibujo se apaga de abajo hacia arriba;
   - botón para ver la foto real.
   Canvas 2D, sin dependencias. Los datos (js/portrait-lines-data.js) se cargan cuando la
   sección se acerca. Con prefers-reduced-motion queda el dibujo quieto. Sin JS queda la foto. */
(function () {
  var box = document.querySelector('.about-photo');
  if (!box || !window.requestAnimationFrame || !window.IntersectionObserver) return;
  var img = box.querySelector('img');
  var probeCanvas = document.createElement('canvas');
  if (!probeCanvas.getContext) return;
  if (/[?&]retrato=off\b/.test(location.search)) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DW = 600, DH = 800;                       // espacio de los datos
  var CHIP = { x: 452, y: 548 };                // chip en la solapa
  var C = {
    flow: '124,106,247', feat: '196,181,253', sil: '237,233,254',
    head: '245,243,255', tail: '167,139,250', trace: '124,106,247'
  };

  // ── DOM: canvas + HUD ──
  var canvas = document.createElement('canvas');
  canvas.className = 'pc-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  var hud = document.createElement('div');
  hud.className = 'pc-hud';
  hud.setAttribute('aria-hidden', 'true');
  hud.innerHTML =
    '<span class="pc-corner pc-tl"></span><span class="pc-corner pc-tr"></span>' +
    '<span class="pc-corner pc-bl"></span><span class="pc-corner pc-br"></span>' +
    '<span class="pc-label"></span>' +
    '<span class="pc-readout"><i class="pc-k"></i> <b class="pc-pulses">[—]</b></span>' +
    '<span class="pc-reading"></span>';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pc-toggle';
  box.appendChild(canvas);
  box.appendChild(hud);
  box.appendChild(btn);
  var elLabel = hud.querySelector('.pc-label'), elK = hud.querySelector('.pc-k'),
      elPulses = hud.querySelector('.pc-pulses'), elReading = hud.querySelector('.pc-reading');

  var T = {
    es: { name: 'RETRATO CIRCUITO', boot: 'ENCENDIENDO', rest: 'REPOSO', active: 'ACTIVO', pulses: 'PULSOS',
          probe: 'SONDA', photo: 'Ver foto', circuit: 'Ver circuito' },
    en: { name: 'PORTRAIT CIRCUIT', boot: 'BOOTING', rest: 'IDLE', active: 'ACTIVE', pulses: 'PULSES',
          probe: 'PROBE', photo: 'View photo', circuit: 'View circuit' }
  };
  function lang() { return document.documentElement.lang === 'en' ? 'en' : 'es'; }
  var state = 'boot', shownState = '', pulseCount = 0, shownCount = -1, photoMode = false;
  function renderHud(force) {
    var t = T[lang()];
    if (force || shownState !== state) {
      elLabel.textContent = '[' + t.name + ' · ' + t[state] + ']';
      elK.textContent = t.pulses;
      btn.textContent = photoMode ? t.circuit : t.photo;
      btn.setAttribute('aria-pressed', String(photoMode));
      shownState = state;
    }
    if (force || shownCount !== pulseCount) {
      elPulses.textContent = pulseCount ? '[' + String(pulseCount).padStart(2, '0') + ']' : '[—]';
      shownCount = pulseCount;
    }
  }
  renderHud(true);
  // el sitio cambia de idioma con setLang(): seguimos el atributo lang del <html>
  new MutationObserver(function () { renderHud(true); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  btn.addEventListener('click', function () {
    photoMode = !photoMode;
    box.classList.toggle('pc-photo', photoMode);
    renderHud(true);
    kick();
  });

  // ── carga diferida de los datos ──
  var lines = null, sil = null, nodes = null, traces = [], chipLines = [];
  var loading = false, visible = false;
  function load() {
    if (loading) return;
    loading = true;
    if (window.PORTRAIT_LINES) return setup();
    var s = document.createElement('script');
    s.src = '/js/portrait-lines-data.js';
    s.async = true;
    s.onload = setup;
    document.head.appendChild(s);
  }
  new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) load();
    });
  }, { rootMargin: '600px 0px' }).observe(box);
  new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      visible = e.isIntersecting;
      if (visible) { if (lines && bootStart < 0) bootStart = performance.now(); kick(); }
    });
  }, { threshold: 0.15 }).observe(box);

  // ── geometría ──
  function makeLine(layer, flat) {
    var n = flat.length / 2, pts = new Float32Array(flat), cum = new Float32Array(n), len = 0,
        miny = 1e9, maxy = -1e9;
    for (var i = 0; i < n; i++) {
      if (i) len += Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
      cum[i] = len;
      if (pts[2 * i + 1] < miny) miny = pts[2 * i + 1];
      if (pts[2 * i + 1] > maxy) maxy = pts[2 * i + 1];
    }
    return { layer: layer, pts: pts, cum: cum, len: len, n: n, miny: miny, maxy: maxy };
  }
  function pointAt(L, d, out) {
    if (d <= 0) { out[0] = L.pts[0]; out[1] = L.pts[1]; return; }
    if (d >= L.len) { out[0] = L.pts[2 * L.n - 2]; out[1] = L.pts[2 * L.n - 1]; return; }
    var lo = 0, hi = L.n - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (L.cum[mid] < d) lo = mid; else hi = mid; }
    var f = (d - L.cum[lo]) / ((L.cum[hi] - L.cum[lo]) || 1);
    out[0] = L.pts[2 * lo] + (L.pts[2 * hi] - L.pts[2 * lo]) * f;
    out[1] = L.pts[2 * lo + 1] + (L.pts[2 * hi + 1] - L.pts[2 * lo + 1]) * f;
  }
  function pathPartial(ctx, L, d0, d1) {
    var P = [0, 0];
    pointAt(L, d0, P); ctx.moveTo(P[0], P[1]);
    for (var i = 1; i < L.n; i++) {
      if (L.cum[i] <= d0) continue;
      if (L.cum[i] >= d1) break;
      ctx.lineTo(L.pts[2 * i], L.pts[2 * i + 1]);
    }
    pointAt(L, d1, P); ctx.lineTo(P[0], P[1]);
  }
  function pathFull(ctx, L) {
    ctx.moveTo(L.pts[0], L.pts[1]);
    for (var i = 1; i < L.n; i++) ctx.lineTo(L.pts[2 * i], L.pts[2 * i + 1]);
  }

  // pistas de circuito del fondo (pseudoaleatorias pero fijas)
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  function makeTraces() {
    var r = rng(7), out = [], dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    for (var k = 0; k < 34; k++) {
      var x = Math.round(r() * 12) * 50, y = Math.round(r() * 16) * 50, d = Math.floor(r() * 4) * 2;
      var flat = [x, y];
      for (var s = 0; s < 3; s++) {
        var len = 30 + Math.round(r() * 4) * 25, v = dirs[d];
        var k45 = (v[0] && v[1]) ? 0.7071 : 1;
        x += v[0] * len * k45; y += v[1] * len * k45;
        flat.push(x, y);
        d = (d + (r() < 0.5 ? 1 : 7)) % 8;
      }
      out.push(makeLine(3, flat));
    }
    return out;
  }

  function setup() {
    var D = window.PORTRAIT_LINES;
    if (!D) return;
    lines = D.l.map(function (a) { return makeLine(a[0], a.slice(1)); });
    sil = lines.filter(function (L) { return L.layer === 0; });
    traces = makeTraces();
    // nodos: puntos cada ~13 unidades sobre las líneas (para la sonda y los destellos)
    var arr = [], P = [0, 0];
    lines.forEach(function (L) {
      for (var d = 6; d < L.len; d += 13) { pointAt(L, d, P); arr.push(P[0], P[1], L.layer); }
    });
    nodes = new Float32Array(arr);
    // líneas que pasan cerca del chip: de ahí salen pulsos
    lines.forEach(function (L, idx) {
      if (L.layer === 0) return;
      var best = 1e9, at = 0;
      for (var i = 0; i < L.n; i++) {
        var dd = Math.hypot(L.pts[2 * i] - CHIP.x, L.pts[2 * i + 1] - CHIP.y);
        if (dd < best) { best = dd; at = L.cum[i]; }
      }
      if (best < 34) chipLines.push({ L: L, at: at });
    });
    box.classList.add('pc-on');
    resize();
    if (visible && bootStart < 0) bootStart = performance.now();
    if (reduce) { bootStart = -1; state = 'rest'; renderHud(); }
    kick();
  }

  // ── lienzos ──
  var ctx = canvas.getContext('2d');
  var base = document.createElement('canvas'), bctx = base.getContext('2d');
  var bright = document.createElement('canvas'), brctx = bright.getContext('2d');
  var pctx = probeCanvas.getContext('2d');
  var cw = 0, ch = 0, dpr = 1, sc = 1;
  function resize() {
    if (!lines) return;
    var r = box.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = r.width; ch = r.height;
    sc = Math.max(cw / DW, ch / DH);           // cubre la caja (3:4)
    [canvas, base, bright].forEach(function (c) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); });
    drawStatic(bctx, false);
    drawStatic(brctx, true);
    kick();
  }
  if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(box);
  else window.addEventListener('resize', resize);

  function toData(c) {   // transforma un contexto a coordenadas de datos
    var ox = (cw - DW * sc) / 2, oy = (ch - DH * sc) / 2;
    c.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);
  }
  function silPath(c) {
    c.beginPath();
    sil.forEach(function (L) { pathFull(c, L); });
    c.closePath();
  }
  function styleFor(c, layer, hi) {
    var px = 1 / sc;
    if (layer === 0) { c.strokeStyle = 'rgba(' + C.sil + ',' + (hi ? 1 : 0.95) + ')'; c.lineWidth = (hi ? 2.2 : 1.6) * px; }
    else if (layer === 1) { c.strokeStyle = 'rgba(' + C.feat + ',' + (hi ? 1 : 0.8) + ')'; c.lineWidth = (hi ? 1.8 : 1.15) * px; }
    else if (layer === 2) { c.strokeStyle = hi ? 'rgba(221,214,254,1)' : 'rgba(' + C.flow + ',0.62)'; c.lineWidth = (hi ? 1.6 : 1) * px; }
    else { c.strokeStyle = 'rgba(' + C.trace + ',0.13)'; c.lineWidth = 1 * px; }
  }
  function drawTraces(c) {
    c.save();
    // solo en el fondo: fuera de la silueta
    c.beginPath(); c.rect(-50, -50, DW + 100, DH + 100);
    sil.forEach(function (L) { pathFull(c, L); });
    c.clip('evenodd');
    styleFor(c, 3);
    c.beginPath(); traces.forEach(function (L) { pathFull(c, L); }); c.stroke();
    c.fillStyle = 'rgba(' + C.trace + ',0.22)';
    traces.forEach(function (L) {
      c.beginPath(); c.arc(L.pts[2 * L.n - 2], L.pts[2 * L.n - 1], 2.4 / sc, 0, 7); c.fill();
    });
    c.restore();
  }
  function drawChip(c, t, hi) {
    var s = 13, pulse = 0.5 + 0.5 * Math.sin(t / 650);
    c.save();
    c.translate(CHIP.x, CHIP.y); c.rotate(-0.42);
    var g = c.createRadialGradient(0, 0, 0, 0, 0, 46);
    g.addColorStop(0, 'rgba(167,139,250,' + (0.30 + 0.18 * pulse + (hi ? 0.15 : 0)) + ')');
    g.addColorStop(1, 'rgba(124,106,247,0)');
    c.fillStyle = g; c.fillRect(-46, -46, 92, 92);
    c.strokeStyle = 'rgba(' + C.feat + ',0.95)'; c.lineWidth = 1.1 / sc;
    c.beginPath();
    for (var i = -2; i <= 2; i++) {
      var o = i * 4.6;
      c.moveTo(o, -s); c.lineTo(o, -s - 5); c.moveTo(o, s); c.lineTo(o, s + 5);
      c.moveTo(-s, o); c.lineTo(-s - 5, o); c.moveTo(s, o); c.lineTo(s + 5, o);
    }
    c.stroke();
    c.fillStyle = 'rgba(16,14,30,0.92)';
    c.fillRect(-s, -s, 2 * s, 2 * s);
    c.strokeRect(-s, -s, 2 * s, 2 * s);
    c.strokeRect(-s + 4, -s + 4, 2 * s - 8, 2 * s - 8);
    c.fillStyle = 'rgba(237,233,254,' + (0.55 + 0.45 * pulse) + ')';
    c.shadowColor = 'rgba(167,139,250,1)'; c.shadowBlur = 14 * dpr;
    c.fillRect(-4.5, -4.5, 9, 9);
    c.restore();
  }
  function drawStatic(c, hi) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    toData(c);
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (!hi) drawTraces(c);
    [2, 1, 0].forEach(function (layer) {
      styleFor(c, layer, hi);
      if (layer === 0 || hi) { c.shadowColor = 'rgba(124,106,247,0.9)'; c.shadowBlur = (hi ? 6 : 8) * dpr; }
      c.beginPath();
      lines.forEach(function (L) { if (L.layer === layer) pathFull(c, L); });
      c.stroke();
      c.shadowBlur = 0;
    });
    if (!hi) {   // nodos fijos sobre la silueta
      c.fillStyle = 'rgba(' + C.sil + ',0.9)';
      var P = [0, 0];
      sil.forEach(function (L) {
        for (var d = 40; d < L.len; d += 95) { pointAt(L, d, P); c.beginPath(); c.arc(P[0], P[1], 1.9 / sc, 0, 7); c.fill(); }
      });
    }
  }

  // ── pulsos ──
  var pulses = [], flashes = [], lastSpawn = 0;
  function spawn(now) {
    var L, from, dir;
    if (chipLines.length && Math.random() < 0.55) {
      var cl = chipLines[(Math.random() * chipLines.length) | 0];
      L = cl.L; from = cl.at; dir = Math.random() < 0.5 ? 1 : -1;
    } else if (Math.random() < 0.12) {
      L = traces[(Math.random() * traces.length) | 0]; from = 0; dir = 1;
    } else {
      // líneas largas con más probabilidad
      for (var tries = 0; tries < 6; tries++) {
        L = lines[(Math.random() * lines.length) | 0];
        if (L.len > 80 && (L.layer !== 1 || Math.random() < 0.5)) break;
      }
      dir = Math.random() < 0.5 ? 1 : -1; from = dir > 0 ? 0 : L.len;
    }
    pulses.push({ L: L, d: from, dir: dir, v: 120 + Math.random() * 110, tail: 34 + Math.random() * 26, born: now });
    pulseCount++;
  }
  var P0 = [0, 0], P1 = [0, 0];
  function drawPulse(c, p) {
    var L = p.L, head = p.d, slices = 8, dim = L.layer === 3 ? 0.45 : 1;
    for (var i = 0; i < slices; i++) {
      var a = head - p.dir * p.tail * (i + 1) / slices, b = head - p.dir * p.tail * i / slices;
      var lo = Math.max(0, Math.min(a, b)), hi = Math.min(L.len, Math.max(a, b));
      if (hi <= lo) continue;
      c.strokeStyle = 'rgba(' + (i < 2 ? C.head : C.tail) + ',' + ((1 - i / slices) * 0.95 * dim) + ')';
      c.lineWidth = (2.3 - i * 0.18) / sc;
      c.beginPath(); pathPartial(c, L, lo, hi); c.stroke();
    }
    pointAt(L, Math.max(0, Math.min(L.len, head)), P0);
    c.fillStyle = 'rgba(' + C.head + ',' + dim + ')';
    c.beginPath(); c.arc(P0[0], P0[1], 2 / sc, 0, 7); c.fill();
  }

  // ── sonda ──
  var probe = { x: 0, y: 0, tx: 0, ty: 0, a: 0, ta: 0, until: 0 };
  var R = 130, LENS = 80;          // radio de la sonda y de la lente (unidades de datos)
  function local(e) {
    var r = box.getBoundingClientRect();
    var ox = (cw - DW * sc) / 2, oy = (ch - DH * sc) / 2;
    return [(e.clientX - r.left - ox) / sc, (e.clientY - r.top - oy) / sc];
  }
  function onMove(e) {
    if (!lines || reduce) return;
    var p = local(e);
    probe.tx = p[0]; probe.ty = p[1];
    if (probe.a < 0.02) { probe.x = p[0]; probe.y = p[1]; }
    probe.ta = 1;
    probe.until = e.pointerType === 'mouse' ? 0 : performance.now() + 1600;
    kick();
  }
  box.addEventListener('pointermove', onMove);
  box.addEventListener('pointerdown', onMove);
  box.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') probe.ta = 0; });

  function drawProbe(c, t) {
    var a = probe.a;
    if (a < 0.01) return;
    var pw = Math.ceil(2 * R * sc * dpr), x = probe.x, y = probe.y;
    if (probeCanvas.width !== pw) { probeCanvas.width = probeCanvas.height = pw; }
    // líneas iluminadas dentro de un círculo con borde suave
    var ox = (cw - DW * sc) / 2, oy = (ch - DH * sc) / 2;
    var sx = (ox + (x - R) * sc) * dpr, sy = (oy + (y - R) * sc) * dpr;
    pctx.globalCompositeOperation = 'source-over';
    pctx.clearRect(0, 0, pw, pw);
    pctx.drawImage(bright, -sx, -sy);
    pctx.globalCompositeOperation = 'destination-in';
    var g = pctx.createRadialGradient(pw / 2, pw / 2, 0, pw / 2, pw / 2, pw / 2);
    g.addColorStop(0, 'rgba(0,0,0,' + a + ')'); g.addColorStop(0.55, 'rgba(0,0,0,' + (0.8 * a) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
    pctx.fillStyle = g; pctx.fillRect(0, 0, pw, pw);
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'lighter';
    c.drawImage(probeCanvas, sx, sy);
    c.restore();
    // nodos
    c.fillStyle = 'rgba(' + C.head + ',1)';
    for (var i = 0; i < nodes.length; i += 3) {
      var dx = nodes[i] - x, dy = nodes[i + 1] - y, d2 = dx * dx + dy * dy;
      if (d2 > R * R) continue;
      var k = 1 - Math.sqrt(d2) / R;
      c.globalAlpha = a * Math.min(1, k * 1.6);
      c.beginPath(); c.arc(nodes[i], nodes[i + 1], (1.2 + 1.4 * k) / sc, 0, 7); c.fill();
    }
    c.globalAlpha = 1;
    // lente: en modo circuito se abre un hueco y debajo se ve la foto (máscara CSS en el <img>);
    // en modo foto el canvas entero queda enmascarado al círculo (CSS) y muestra el circuito
    var ox2 = (cw - DW * sc) / 2, oy2 = (ch - DH * sc) / 2;
    var cx = ox2 + x * sc, cy = oy2 + y * sc;
    box.style.setProperty('--pc-x', cx.toFixed(1) + 'px');
    box.style.setProperty('--pc-y', cy.toFixed(1) + 'px');
    box.style.setProperty('--pc-r', ((photoMode ? R : LENS) * sc * a).toFixed(1) + 'px');
    if (!photoMode) {
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-out';
      var lr = LENS * sc * a * dpr, eg = c.createRadialGradient(cx * dpr, cy * dpr, 0, cx * dpr, cy * dpr, lr);
      eg.addColorStop(0, 'rgba(0,0,0,1)'); eg.addColorStop(0.72, 'rgba(0,0,0,1)'); eg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = eg; c.beginPath(); c.arc(cx * dpr, cy * dpr, lr, 0, 7); c.fill();
      c.restore();
    }
    // anillo, guía y lectura
    var rr = Math.max(1, LENS * sc * a * (photoMode ? 0.62 : 0.9) + 1.5 * Math.sin(t / 220));
    c.strokeStyle = 'rgba(' + C.head + ',' + (0.9 * a) + ')'; c.lineWidth = 1.2 / sc;
    c.beginPath(); c.arc(x, y, rr / sc * (sc > 0.9 ? 1 : 1.2), 0, 7); c.stroke();
    // la guía sale hacia el lado con más espacio
    var left = (cw - DW * sc) / 2 + x * sc > cw / 2, dirx = left ? -1 : 1, k45 = 26 / sc;
    var ex = x + dirx * (rr / sc + k45), ey = y - k45, fx = ex + dirx * 46 / sc;
    c.beginPath(); c.moveTo(x + dirx * rr / sc * 0.7, y - rr / sc * 0.7); c.lineTo(ex, ey); c.lineTo(fx, ey); c.stroke();
    c.fillStyle = 'rgba(' + C.head + ',' + a + ')';
    c.beginPath(); c.arc(fx, ey, 2.2 / sc, 0, 7); c.fill();
    var lx = (cw - DW * sc) / 2 + fx * sc, ly = (ch - DH * sc) / 2 + ey * sc;
    var dec = lang() === 'en' ? '.' : ',';
    var nx = Math.max(0, Math.min(1, x / DW)).toFixed(2).replace('.', dec), ny = Math.max(0, Math.min(1, y / DH)).toFixed(2).replace('.', dec);
    elReading.textContent = T[lang()].probe + ' · [X ' + nx + '] [Y ' + ny + ']';
    var lw = elReading.offsetWidth, rx = left ? lx - lw - 8 : lx + 8;
    rx = Math.max(8, Math.min(cw - lw - 8, rx));            // que no se corte en el borde
    elReading.style.transform = 'translate(' + rx + 'px,' + (ly - 18) + 'px)';
    elReading.style.opacity = a;
  }

  // ── bucle ──
  var raf = 0, bootStart = -1, BOOT = 2600, lastT = 0;
  function kick() { if (!raf && lines) raf = requestAnimationFrame(frame); }
  function scrollFade() {   // 0 = entero, 1 = apagado (cuando la foto sale por arriba)
    var r = box.getBoundingClientRect();
    var p = (-r.top - r.height * 0.05) / (r.height * 0.85);
    return Math.max(0, Math.min(1, p));
  }
  function bootDraw(c, p) {
    // la silueta primero, después rasgos y por último el flujo de arriba hacia abajo
    c.lineCap = 'round'; c.lineJoin = 'round';
    var tips = [];
    [2, 1, 0].forEach(function (layer) {
      styleFor(c, layer, false);
      if (layer === 0) { c.shadowColor = 'rgba(124,106,247,0.9)'; c.shadowBlur = 8 * dpr; }
      c.beginPath();
      lines.forEach(function (L) {
        if (L.layer !== layer) return;
        var d0 = layer === 0 ? 0 : layer === 1 ? 0.28 : 0.22 + 0.45 * (L.miny / DH);
        var dur = layer === 0 ? 0.55 : layer === 1 ? 0.5 : 0.33;
        var f = Math.max(0, Math.min(1, (p - d0) / dur));
        if (f <= 0) return;
        f = 1 - Math.pow(1 - f, 2);
        pathPartial(c, L, 0, L.len * f);
        if (f < 1 && layer !== 2) tips.push(L, L.len * f);
      });
      c.stroke(); c.shadowBlur = 0;
    });
    c.fillStyle = 'rgba(' + C.head + ',1)';
    for (var i = 0; i < tips.length; i += 2) {
      pointAt(tips[i], tips[i + 1], P0);
      c.beginPath(); c.arc(P0[0], P0[1], 2.2 / sc, 0, 7); c.fill();
    }
  }
  function frame(t) {
    raf = 0;
    if (!lines || !cw) return;
    var dt = Math.min(64, t - (lastT || t)); lastT = t;
    var fade = scrollFade();
    var running = visible && !document.hidden && fade < 1 && (!photoMode || probe.a > 0.01);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (photoMode) { ctx.fillStyle = '#0d0b18'; ctx.fillRect(0, 0, canvas.width, canvas.height); }

    var booting = !reduce && bootStart >= 0 && t - bootStart < BOOT;
    if (bootStart < 0 && !reduce) { renderHud(); return; }   // todavía no entró en pantalla
    if (booting) {
      state = 'boot';
      toData(ctx);
      bootDraw(ctx, (t - bootStart) / BOOT);
      if ((t - bootStart) / BOOT > 0.5) drawChip(ctx, t, false);
    } else {
      ctx.drawImage(base, 0, 0);
      toData(ctx);
      drawChip(ctx, reduce ? 0 : t, probe.a > 0.3);
      if (!reduce) {
        // sonda (suavizada)
        if (probe.until && t > probe.until) { probe.ta = 0; probe.until = 0; }
        probe.x += (probe.tx - probe.x) * Math.min(1, dt / 70);
        probe.y += (probe.ty - probe.y) * Math.min(1, dt / 70);
        probe.a += (probe.ta - probe.a) * Math.min(1, dt / 160);
        state = probe.a > 0.5 ? 'active' : 'rest';
        // pulsos
        var active = probe.a > 0.5, gap = active ? 140 : 520, max = active ? 14 : 5;
        if (running && t - lastSpawn > gap && pulses.length < max) { spawn(t); lastSpawn = t; }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (var i = pulses.length - 1; i >= 0; i--) {
          var p = pulses[i];
          p.d += p.dir * p.v * dt / 1000;
          if ((p.dir > 0 && p.d - p.tail > p.L.len) || (p.dir < 0 && p.d + p.tail < 0)) {
            pointAt(p.L, p.dir > 0 ? p.L.len : 0, P1);
            flashes.push({ x: P1[0], y: P1[1], t: t });
            pulses.splice(i, 1); continue;
          }
          drawPulse(ctx, p);
        }
        for (var j = flashes.length - 1; j >= 0; j--) {
          var f = flashes[j], k = 1 - (t - f.t) / 500;
          if (k <= 0) { flashes.splice(j, 1); continue; }
          ctx.fillStyle = 'rgba(' + C.head + ',' + k + ')';
          ctx.beginPath(); ctx.arc(f.x, f.y, (1.5 + 3 * (1 - k)) / sc, 0, 7); ctx.fill();
        }
        ctx.restore();
        drawProbe(ctx, t);
      }
    }
    if (probe.a < 0.01) { elReading.style.opacity = 0; box.style.setProperty('--pc-r', '0px'); }
    // apagado con el scroll: se borra de abajo hacia arriba
    if (fade > 0) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      var H = canvas.height, cut = H * (1 - fade * 1.15), band = H * 0.25;
      var g = ctx.createLinearGradient(0, cut - band, 0, cut);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = g; ctx.fillRect(0, cut - band, canvas.width, band);
      ctx.fillStyle = '#000'; ctx.fillRect(0, cut, canvas.width, H - cut);
      ctx.restore();
    }
    renderHud();
    if (reduce) return;
    if (running || booting || probe.a > 0.01) raf = requestAnimationFrame(frame);
  }
  window.addEventListener('scroll', function () { if (visible) kick(); }, { passive: true });
  document.addEventListener('visibilitychange', kick);
})();
