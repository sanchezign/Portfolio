// Hero: las letras aparecen de a poco al cargar, se desvanecen al bajar
// y vuelven a aparecer al subir. Sin librerías; un solo bucle requestAnimationFrame.
(function () {
  var root = document.documentElement;
  var left = document.querySelector('.hero-left');
  if (!left || !root.classList.contains('hero-anim')) return; // movimiento reducido: todo estático

  var badge = left.querySelector('.hero-badge');
  var hi = left.querySelector('.hero-title > span[data-en]');
  var name = left.querySelector('.hero-title .name-highlight');
  var role = left.querySelector('.hero-role');
  var sub = left.querySelector('.hero-sub');

  // Cuándo empieza cada bloque (ms) y cuánto tarda en aparecer cada letra respecto a la anterior
  var plan = [
    { el: hi,   start: 150,  step: 45 },
    { el: name, start: 450,  step: 60 },
    { el: role, start: 1050, step: 14 },
    { el: sub,  start: 1350, step: 4 }
  ];
  var FADE = 650;  // duración de la aparición de cada letra
  var items = [];  // { el, k, start, big, last }
  var t0 = null;

  function textOf(el) {
    var out = '';
    el.childNodes.forEach(function (n) { out += n.nodeType === 3 ? n.textContent : (n.nodeName === 'BR' ? ' ' : n.textContent); });
    return out.replace(/\s+/g, ' ').trim();
  }

  // Parte el texto en palabras (que no se cortan) y letras. Los <br> se mantienen.
  // Lo partido queda aria-hidden y se agrega una copia sr-only para lectores de pantalla.
  function split(el) {
    if (!el) return [];
    var done = el.querySelectorAll('.ch');
    if (done.length) return Array.prototype.slice.call(done); // ya estaba partido (p. ej. el nombre al cambiar idioma)
    var plain = textOf(el);
    var wrap = document.createElement('span');
    wrap.setAttribute('aria-hidden', 'true');
    var chars = [];
    Array.prototype.slice.call(el.childNodes).forEach(function (n) {
      if (n.nodeType !== 3) { wrap.appendChild(n.cloneNode(true)); return; }
      n.textContent.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { wrap.appendChild(document.createTextNode(' ')); return; }
        var w = document.createElement('span');
        w.className = 'w';
        Array.from(part).forEach(function (c) {
          var s = document.createElement('span');
          s.className = 'ch';
          s.textContent = c;
          w.appendChild(s);
          chars.push(s);
        });
        wrap.appendChild(w);
      });
    });
    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = plain;
    el.textContent = '';
    el.appendChild(wrap);
    el.appendChild(sr);
    return chars;
  }

  function build(introDone) {
    items = [];
    if (badge) items.push({ el: badge, start: 0, last: '' });
    plan.forEach(function (b) {
      var chars = split(b.el);
      var big = b.el === hi || b.el === name;
      chars.forEach(function (c, k) {
        items.push({ el: c, start: introDone ? -1e9 : b.start + k * b.step, big: big, fs: big ? parseFloat(getComputedStyle(c).fontSize) : 0, last: '' });
      });
    });
    syncGradient();
    measure();
  }

  // Cada letra del nombre pinta su tramo del degradado del bloque completo
  function syncGradient() {
    if (!name) return;
    var box = name.getBoundingClientRect();
    var letters = name.querySelectorAll('.ch');
    for (var i = 0; i < letters.length; i++) {
      var r = letters[i].getBoundingClientRect();
      // compensa el desplazamiento vertical de la animación para usar la posición final
      var dy = parseFloat(letters[i].dataset.dy || 0);
      letters[i].style.setProperty('--bw', box.width + 'px');
      letters[i].style.setProperty('--bh', box.height + 'px');
      letters[i].style.setProperty('--bx', -(r.left - box.left) + 'px');
      letters[i].style.setProperty('--by', -(r.top - dy - box.top) + 'px');
    }
  }

  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(v) { return 1 - Math.pow(1 - v, 3); }

  // Para cada letra: a partir de qué scroll empieza a desvanecerse.
  // Depende de su posición real en la página (las de arriba se van primero)
  // y, dentro de la misma línea, de izquierda a derecha.
  function measure() {
    var vh = window.innerHeight, sy = window.scrollY;
    var lb = left.getBoundingClientRect();
    for (var k = 0; k < items.length; k++) {
      var it = items[k], r = it.el.getBoundingClientRect();
      var top = r.top + sy - parseFloat(it.el.dataset.dy || 0);
      var xf = lb.width ? clamp((r.left - lb.left) / lb.width) : 0;
      it.trigger = Math.max(0, top - vh * 0.45) + xf * vh * 0.08;
    }
  }

  function render(now) {
    if (t0 === null) t0 = now;
    var t = now - t0;
    var sy = window.scrollY, L = Math.max(window.innerHeight * 0.3, 180);
    var n = items.length;
    var pending = false;

    for (var k = 0; k < n; k++) {
      var it = items[k];
      var a = ease(clamp((t - it.start) / FADE));            // aparición inicial
      if (a < 1) pending = true;
      var g = ease(clamp((sy - it.trigger) / L));           // desaparición por scroll
      var o = a * (1 - g);
      var hidden = 1 - o;
      var css;
      if (it.big) {
        var y = (1 - a) * 0.35 - g * 0.25;                  // entra desde abajo, sale hacia arriba
        it.el.dataset.dy = (y * it.fs).toFixed(2);
        css = o.toFixed(3) + '|translateY(' + y.toFixed(3) + 'em)|' + (hidden > 0.01 ? 'blur(' + (hidden * 8).toFixed(1) + 'px)' : '');
      } else {
        css = o.toFixed(3) + '||' + (hidden > 0.01 ? 'blur(' + (hidden * 4).toFixed(1) + 'px)' : '');
      }
      if (css !== it.last) {
        var v = css.split('|');
        it.el.style.opacity = v[0];
        it.el.style.transform = v[1] === 'translateY(0.000em)' ? '' : v[1];
        it.el.style.filter = v[2];
        it.last = css;
      }
    }
    if (pending) requestAnimationFrame(render);
    else ticking = false;
  }

  var ticking = true;
  function kick() { if (!ticking) { ticking = true; requestAnimationFrame(render); } }

  build(false);
  root.classList.add('hero-ready');
  requestAnimationFrame(render);
  window.addEventListener('scroll', kick, { passive: true });
  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { syncGradient(); measure(); kick(); }, 100); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { syncGradient(); measure(); kick(); });

  // El cambio de idioma reemplaza el texto del saludo y la presentación: se vuelven a partir.
  var origSetLang = window.setLang;
  if (typeof origSetLang === 'function') {
    window.setLang = function () {
      var r = origSetLang.apply(this, arguments);
      build(true);
      kick();
      return r;
    };
  }
})();
