/* Retrato de partículas para la foto de "Sobre mí".
   La foto se convierte en una nube de puntos violeta con profundidad (los tonos claros
   quedan más cerca), que se arma al entrar la sección en pantalla.
   Dos variantes para comparar (parámetro ?foto=a | ?foto=b, por defecto "a"):
   - a "lente": los puntos se arman y se revelan en la foto real; al pasar el mouse
     aparece una lente que muestra la nube de puntos debajo.
   - b "nube 3D": queda como nube de puntos que gira siguiendo el mouse; al pasar el
     mouse (o tocar en móvil) se ve la foto real.
   Sin dependencias. Con prefers-reduced-motion no hace nada y se ve la foto normal. */
(function () {
  var box = document.querySelector('.about-photo');
  if (!box) return;
  var img = box.querySelector('img');
  if (!img || !window.requestAnimationFrame) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var param = (location.search.match(/[?&]foto=([a-z]+)/) || [])[1];
  if (param === 'off') return;
  var MODE = param === 'b' ? 'b' : 'a';
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  var canvas = document.createElement('canvas');
  canvas.className = 'pp-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  box.insertBefore(canvas, img.nextSibling);
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Paleta violeta del sitio, de oscuro a claro (por luminancia)
  var STOPS = [[46, 36, 110], [124, 106, 247], [167, 139, 250], [196, 181, 253], [240, 236, 255]];
  function palette(t) {
    var p = t * (STOPS.length - 1), i = Math.min(Math.floor(p), STOPS.length - 2), f = p - i;
    var a = STOPS[i], b = STOPS[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  var W = 0, H = 0, dpr = 1, parts = [], raf = null, built = false, started = false;
  var t0 = 0, ASSEMBLE = 1900, HOLD = 450;
  var progress = 0;                       // 0 = dispersos, 1 = armados
  var rot = { x: 0, y: 0 }, rotT = { x: 0, y: 0 };
  var mouse = { x: 0, y: 0, in: false };
  var lens = 0, lensT = 0;                // radio de la lente (a) / mezcla con la foto (b)
  var reveal = 0, revealT = 0;            // b: 1 = foto real visible
  var FOCAL = 700, LENS_R = 95;

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function loadMask(cb) {
    var m = new Image();
    m.onload = function () { cb(m); };
    m.onerror = function () { cb(null); };
    m.src = '/img/profile-mask.png';
  }

  function build(mask) {
    var r = box.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    if (!W || !H) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // misma geometría que object-fit: cover + object-position: center 20%
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var s = Math.max(W / iw, H / ih);
    var ox = (W - iw * s) * 0.5, oy = (H - ih * s) * 0.2;

    var off = document.createElement('canvas');
    off.width = W; off.height = H;
    var octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(img, ox, oy, iw * s, ih * s);
    var px = octx.getImageData(0, 0, W, H).data;
    var mk = null;
    if (mask) {
      octx.clearRect(0, 0, W, H);
      octx.drawImage(mask, ox, oy, iw * s, ih * s);
      mk = octx.getImageData(0, 0, W, H).data;
    }

    var step = W < 380 ? 4 : 5;
    var cx = W / 2, cy = H * 0.42;
    parts = [];
    for (var y = step / 2; y < H; y += step) {
      for (var x = step / 2; x < W; x += step) {
        var i = ((y | 0) * W + (x | 0)) * 4;
        var inside = mk ? mk[i] / 255 : 1;
        if (inside < 0.5) continue;
        var lum = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
        // normalizado al rango real de la foto (traje muy oscuro) para que todo se lea
        var t = Math.pow(Math.min(Math.max((lum - 0.03) / 0.72, 0), 1), 0.5);
        var c = palette(t);
        // profundidad: claros adelante + "volumen" del cuerpo (centro más cerca)
        var dx = (x - cx) / W, dy = (y - cy) / H;
        var z = -(t - 0.4) * 70 + (dx * dx * 2.2 + dy * dy * 0.6) * 160;
        var a = Math.random() * Math.PI * 2, rr = 0.6 + Math.random() * 0.9;
        parts.push({
          x: x, y: y, z: z,
          sx: cx + Math.cos(a) * W * rr, sy: cy + Math.sin(a) * H * rr * 0.8, sz: (Math.random() - 0.5) * 900,
          size: 1.1 + t * 1.4,
          rgb: (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0),
          al: 0.5 + t * 0.5,
          d: Math.random() * 0.35        // retraso individual al armarse
        });
      }
    }
    built = true;
  }

  function frame(now) {
    raf = null;
    if (!built) return;
    var el = now - t0;
    var raw = Math.min(el / ASSEMBLE, 1);
    progress = raw;

    // objetivos según variante
    if (MODE === 'b') {
      if (mouse.in && finePointer) {
        rotT.y = ((mouse.x / W) - 0.5) * 0.7;
        rotT.x = -((mouse.y / H) - 0.5) * 0.35;
      } else {
        rotT.y = Math.sin(now / 2600) * 0.18;
        rotT.x = Math.sin(now / 3700) * 0.05;
      }
      reveal += (revealT - reveal) * 0.12;
      box.style.setProperty('--pp-reveal', reveal.toFixed(3));
    } else {
      rotT.x = rotT.y = 0;
      lensT = mouse.in && el >= ASSEMBLE + HOLD + 900 ? LENS_R : 0;
      lens += (lensT - lens) * 0.18;
      box.style.setProperty('--pp-r', lens.toFixed(1) + 'px');
      box.style.setProperty('--pp-x', mouse.x.toFixed(0) + 'px');
      box.style.setProperty('--pp-y', mouse.y.toFixed(0) + 'px');
    }
    rot.x += (rotT.x - rot.x) * 0.07;
    rot.y += (rotT.y - rot.y) * 0.07;

    // entrada: giro que se acomoda mientras los puntos llegan
    var spin = (1 - easeOut(raw)) * 0.9;
    var ry = rot.y + spin, rx = rot.x;
    var cyR = Math.cos(ry), syR = Math.sin(ry), cxR = Math.cos(rx), sxR = Math.sin(rx);
    var cx = W / 2, cy = H * 0.42;

    ctx.clearRect(0, 0, W, H);
    var globalA = 1;
    // a: se sostiene armado un momento y se funde con la foto real; después solo queda la lente
    var fade = Math.min(Math.max((el - ASSEMBLE - HOLD) / 900, 0), 1);
    if (MODE === 'a') globalA = 1 - fade;
    if (MODE === 'b') globalA = 1 - reveal;

    var lensOn = MODE === 'a' && lens > 1;
    if (globalA > 0.01 || lensOn) {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var k = Math.min(Math.max((raw - p.d) / (1 - p.d), 0), 1);
        k = easeOut(k);
        var x = p.sx + (p.x - p.sx) * k - cx;
        var y = p.sy + (p.y - p.sy) * k - cy;
        var z = p.sz + (p.z - p.sz) * k;
        // rotación Y luego X
        var x1 = x * cyR + z * syR, z1 = -x * syR + z * cyR;
        var y1 = y * cxR - z1 * sxR, z2 = y * sxR + z1 * cxR;
        var sc = FOCAL / (FOCAL + z2);
        var X = cx + x1 * sc, Y = cy + y1 * sc;
        var a = p.al * (0.25 + 0.75 * k);

        if (mouse.in && finePointer && k >= 1) {
          // pequeña repulsión alrededor del cursor
          var mx = X - mouse.x, my = Y - mouse.y, md = mx * mx + my * my;
          if (md < 3600 && md > 0.01) {
            var f = (1 - md / 3600) * 6 / Math.sqrt(md);
            X += mx * f; Y += my * f;
          }
        }

        var alpha = a * globalA;
        if (lensOn) {
          var lx = X - mouse.x, ly = Y - mouse.y;
          var ld = Math.sqrt(lx * lx + ly * ly);
          if (ld < lens) alpha = Math.max(alpha, a * Math.min(1, (lens - ld) / 18));
        }
        if (alpha < 0.02) continue;
        var s = p.size * sc;
        ctx.fillStyle = 'rgba(' + p.rgb + ',' + alpha.toFixed(2) + ')';
        ctx.fillRect(X - s / 2, Y - s / 2, s, s);
      }
    }

    if (MODE === 'a' && el >= ASSEMBLE + HOLD && !box.classList.contains('pp-done')) box.classList.add('pp-done');

    // seguir animando solo cuando hace falta
    var busy = el < ASSEMBLE + HOLD + 950 || MODE === 'b' || lens > 0.5 || lensT > 0;
    if (busy && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function kick() { if (!raf && built && started) raf = requestAnimationFrame(frame); }

  var visible = false;
  function start() {
    if (started || !built) return;
    started = true; t0 = performance.now();
    kick();
  }

  function local(e) {
    var r = box.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  }
  if (finePointer) {
    box.addEventListener('pointerenter', function (e) { local(e); mouse.in = true; if (MODE === 'b') revealT = 1; kick(); });
    box.addEventListener('pointermove', function (e) { local(e); mouse.in = true; kick(); });
    box.addEventListener('pointerleave', function () { mouse.in = false; if (MODE === 'b') revealT = 0; kick(); });
  } else if (MODE === 'b') {
    box.addEventListener('click', function () { revealT = revealT ? 0 : 1; kick(); });
  }

  var io = new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    if (visible && entries[0].intersectionRatio >= 0.3) start();
    if (visible) kick();
  }, { threshold: [0, 0.3] });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var r = box.getBoundingClientRect();
      if (Math.round(r.width) !== W || Math.round(r.height) !== H) { build(maskImg); kick(); }
    }, 200);
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });

  var maskImg = null;
  function init() {
    loadMask(function (m) {
      maskImg = m;
      build(m);
      if (!built) return;
      box.classList.add('pp-on', 'pp-' + MODE);
      io.observe(box);
    });
  }
  // la foto es lazy: forzar carga y esperar
  img.loading = 'eager';
  if (img.complete && img.naturalWidth) init();
  else img.addEventListener('load', init, { once: true });
})();
