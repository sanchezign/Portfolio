// Animación de entrada del hero.
// 1) Mantiene el degradado continuo del nombre aunque esté partido en letras:
//    cada letra pinta el mismo degradado del bloque completo, desplazado a su posición.
// 2) Efecto "decodificar" en la línea del rol (Full Stack Developer · AI Automation).
(function () {
  var name = document.querySelector('.hero-title .name-highlight');
  var role = document.querySelector('.hero-role');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function syncGradient() {
    if (!name) return;
    var box = name.getBoundingClientRect();
    var letters = name.querySelectorAll('.ch');
    // offsetLeft/Top no incluyen transform, así que la posición es la final aunque la letra esté animando
    var ox = name.offsetLeft, oy = name.offsetTop;
    var parent = name.offsetParent;
    for (var i = 0; i < letters.length; i++) {
      var el = letters[i];
      var x = 0, y = 0, n = el;
      while (n && n !== parent) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      el.style.setProperty('--bw', box.width + 'px');
      el.style.setProperty('--bh', box.height + 'px');
      el.style.setProperty('--bx', -(x - ox) + 'px');
      el.style.setProperty('--by', -(y - oy) + 'px');
    }
  }

  syncGradient();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncGradient);
  var t;
  window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(syncGradient, 100); });

  if (!role || reduce) return;
  var finalText = role.textContent;
  var glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+<>/';
  var startDelay = 950, duration = 900, start = null;
  role.setAttribute('aria-label', finalText);

  function frame(now) {
    if (start === null) start = now;
    var p = Math.min((now - start) / duration, 1);
    var revealed = Math.floor(p * finalText.length);
    var out = '';
    for (var i = 0; i < finalText.length; i++) {
      var c = finalText[i];
      if (i < revealed || c === ' ' || c === '·') out += c;
      else out += glyphs[(Math.random() * glyphs.length) | 0];
    }
    role.textContent = out;
    if (p < 1) requestAnimationFrame(frame);
    else role.textContent = finalText;
  }
  setTimeout(function () { requestAnimationFrame(frame); }, startDelay);
})();
