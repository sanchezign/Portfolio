/* Fondo de puntos conectados: red de partículas en canvas, sin dependencias.
   - Los puntos se unen con líneas cuando están cerca y también con el cursor.
   - Respeta prefers-reduced-motion (dibuja un fotograma estático).
   - Menos puntos en pantallas chicas y se pausa cuando la pestaña no está visible. */
(function () {
  var canvas = document.getElementById('dots-bg');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  var DOT = '167,139,250';   // --accent2
  var LINE = '124,106,247';  // --accent
  var LINK_DIST = 130;       // distancia máxima entre puntos para unirlos
  var MOUSE_DIST = 170;      // radio de conexión con el cursor
  var SPEED = 0.25;

  var dpr, w, h, dots = [], raf = null;
  var mouse = { x: -9999, y: -9999, active: false };

  function count() {
    // densidad por área, con tope para no castigar pantallas grandes ni móviles
    var n = Math.round((w * h) / (w < 768 ? 16000 : 11000));
    return Math.max(28, Math.min(n, w < 768 ? 45 : 110));
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var target = count();
    while (dots.length < target) dots.push(makeDot());
    if (dots.length > target) dots.length = target;
    dots.forEach(function (d) {
      if (d.x > w) d.x = Math.random() * w;
      if (d.y > h) d.y = Math.random() * h;
    });
  }

  function makeDot() {
    var a = Math.random() * Math.PI * 2;
    var s = SPEED * (0.4 + Math.random() * 0.8);
    return { x: Math.random() * w, y: Math.random() * h, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1 + Math.random() * 1.2 };
  }

  function step() {
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0) { d.x = 0; d.vx *= -1; } else if (d.x > w) { d.x = w; d.vx *= -1; }
      if (d.y < 0) { d.y = 0; d.vy *= -1; } else if (d.y > h) { d.y = h; d.vy *= -1; }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    var i, j, a, b, dx, dy, dist;
    ctx.lineWidth = 1;

    for (i = 0; i < dots.length; i++) {
      a = dots[i];
      for (j = i + 1; j < dots.length; j++) {
        b = dots[j];
        dx = a.x - b.x; dy = a.y - b.y;
        if (dx > LINK_DIST || dx < -LINK_DIST || dy > LINK_DIST || dy < -LINK_DIST) continue;
        dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINK_DIST) {
          ctx.strokeStyle = 'rgba(' + LINE + ',' + (0.22 * (1 - dist / LINK_DIST)).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      if (mouse.active) {
        dx = a.x - mouse.x; dy = a.y - mouse.y;
        dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MOUSE_DIST) {
          ctx.strokeStyle = 'rgba(' + DOT + ',' + (0.65 * (1 - dist / MOUSE_DIST)).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
      }
    }

    ctx.fillStyle = 'rgba(' + DOT + ',0.55)';
    for (i = 0; i < dots.length; i++) {
      a = dots[i];
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function loop() {
    step(); draw();
    raf = requestAnimationFrame(loop);
  }

  function start() {
    stop();
    if (reduceMq.matches) { draw(); return; }
    raf = requestAnimationFrame(loop);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }

  if (finePointer) {
    window.addEventListener('pointermove', function (e) {
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
      if (!raf) draw();
    }, { passive: true });
    document.addEventListener('pointerleave', function () { mouse.active = false; if (!raf) draw(); });
    window.addEventListener('blur', function () { mouse.active = false; });
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { resize(); if (!raf) draw(); }, 150);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });
  if (reduceMq.addEventListener) reduceMq.addEventListener('change', start);

  resize();
  start();
})();
