// Experiencia: el logo IS baja por la línea de tiempo a medida que se scrollea.
// Se ubica a la altura del centro de la pantalla mientras la lista está a la vista,
// y la parte de la línea ya recorrida se ilumina.
(function () {
  var list = document.querySelector('.exp-list');
  var tracker = list && list.querySelector('.exp-tracker');
  var bar = list && list.querySelector('.exp-progress');
  if (!tracker) return;

  var ticking = false;
  function update() {
    ticking = false;
    var r = list.getBoundingClientRect();
    var pad = parseFloat(getComputedStyle(list, '::before').top) || 24;
    var len = r.height - pad * 2;                    // largo de la línea
    var y = window.innerHeight * 0.5 - r.top - pad;  // centro de pantalla relativo al inicio de la línea
    var d = Math.max(0, Math.min(len, y));
    tracker.style.transform = 'translateY(' + d.toFixed(1) + 'px)';
    if (bar) bar.style.height = d.toFixed(1) + 'px';
    tracker.classList.toggle('on', r.bottom > 0 && r.top < window.innerHeight);
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();
