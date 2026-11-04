/* Nutria holográfica que se asoma sobre la foto de "Sobre mí".
   - Entrada: al pasar el mouse por la foto, la nutria salta desde atrás del borde superior con
     un resorte (se pasa un poco y rebota), las patitas llegan primero al borde y, al rato,
     hace un gesto con la cabeza.
   - Afuera: la cabeza sigue al mouse con un resorte suave y respira.
   - Salida: al sacar el mouse (con medio segundo de gracia), no se esconde: da un pulso de
     luz y después se apaga de a poco, de arriba hacia abajo, titilando como holograma.
   - En pantallas táctiles se asoma cuando la foto está bien a la vista y mira al dedo.
   - Con prefers-reduced-motion aparece y desaparece sin animación y no sigue el mouse.
   Se dibuja con WebGL en un shader (formas suaves con raymarching), sin dependencias.
   Es decorativa: aria-hidden y sin eventos de puntero. Sin WebGL no aparece. */
(function () {
  var photo = document.querySelector('.about-photo');
  var col = photo && photo.parentNode;
  if (!col || !window.requestAnimationFrame || !window.IntersectionObserver) return;
  if (/[?&]nutria=off\b/.test(location.search)) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  var canvas = document.createElement('canvas');
  canvas.className = 'otter-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  var gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl || !gl.getExtension('OES_standard_derivatives')) return;
  col.insertBefore(canvas, photo);

  var VS = 'attribute vec2 aP; varying vec2 vP; void main(){ vP = aP; gl_Position = vec4(aP, 0.0, 1.0); }';
  var FS = [
    '#extension GL_OES_standard_derivatives : enable',
    'precision highp float;',
    'varying vec2 vP;',
    'uniform vec2 uSpan;     // media extensión visible (mundo)',
    'uniform float uEdge;    // altura del borde de la foto',
    'uniform float uBase;    // desplazamiento vertical del cuerpo (0 = afuera)',
    'uniform float uPawOff;  // las patitas se adelantan al cuerpo',
    'uniform float uPawOk;   // cuánto pueden bajar las patitas por delante del borde',
    'uniform mat3 uRot;      // giro de la cabeza (inversa)',
    'uniform vec3 uBody;     // x = corrimiento, y = inclinación, z = respiración',
    'uniform vec2 uSquash;',
    'uniform float uHolo;    // 0 = sólida; 0..1 = apagándose',
    'uniform float uPulse;   // pulso de luz antes de apagarse',
    'uniform float uTime;',
    'uniform float uBlink;',
    'uniform vec2 uEye;      // brillo de los ojos, sigue la mirada',
    'float sdEll(vec3 p, vec3 r){ float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-4); }',
    'float sdCap(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }',
    'float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }',
    'const vec3 PIV = vec3(0.0, 0.85, -0.05);   // cuello',
    'const vec3 HEAD = vec3(0.0, 1.62, 0.0);    // centro de la cabeza',
    // espacio del cuerpo: origen en el borde, sin el salto ni la inclinación
    'vec3 toBody(vec3 p) {',
    '  p.y -= uEdge + uBase; p.x -= uBody.x;',
    '  float c = cos(uBody.y), s = sin(uBody.y);',
    '  p.xy = mat2(c, -s, s, c) * p.xy;',
    '  p.xy /= uSquash;',
    '  return p;',
    '}',
    'vec3 toHead(vec3 b) { return uRot * (b - PIV) + PIV - HEAD; }',
    // x = distancia, y = material (0 pelaje, 1 ojo, 2 nariz, 3 bigote, 4 pata, 5 hocico)
    'vec2 map(vec3 p) {',
    '  vec3 b = toBody(p);',
    '  vec3 q = toHead(b);',
    '  vec3 qa = vec3(abs(q.x), q.y, q.z);',
    '  float d = sdEll(q - vec3(0.0, 0.02, 0.0), vec3(1.06, 0.78, 0.84));',
    '  d = smin(d, sdEll(qa - vec3(0.42, -0.22, 0.32), vec3(0.42, 0.36, 0.5)), 0.2);',     // mejillas
    '  vec3 e = qa - vec3(0.76, 0.48, -0.2);',                                                // orejas
    '  float ear = max(sdEll(e, vec3(0.2, 0.17, 0.12)), -sdEll(e - vec3(-0.01, -0.02, 0.11), vec3(0.11, 0.09, 0.07)));',
    '  d = smin(d, ear, 0.07);',
    '  d = smin(d, sdEll(qa - vec3(0.38, 0.36, 0.52), vec3(0.2, 0.08, 0.16)), 0.12);',        // cejas
    '  d = smin(d, sdEll(q - vec3(0.0, -0.56, 0.58), vec3(0.2, 0.12, 0.17)), 0.08);',        // mentón
    '  vec2 r = vec2(d, 0.0);',
    '  float pad = sdEll(qa - vec3(0.2, -0.3, 0.72), vec3(0.29, 0.22, 0.21));',            // almohadillas del hocico
    '  if (pad < r.x + 0.03) r = vec2(smin(r.x, pad, 0.06), 5.0);',
    '  float nose = sdEll(q - vec3(0.0, -0.1, 0.93), vec3(0.22, 0.14, 0.12));',
    '  nose = max(nose, -(q.y + 0.2));',
    '  if (nose < r.x) r = vec2(nose, 2.0);',
    '  float eye = sdEll(qa - vec3(0.4, 0.12, 0.7), vec3(0.16, 0.18 * uBlink + 0.012, 0.09));',
    '  if (eye < r.x) r = vec2(eye, 1.0);',
    '  for (int k = 0; k < 4; k++) { float fk = float(k);',                                 // bigotes, curvos
    '    vec3 a = vec3(0.38, -0.25 - fk * 0.05, 0.86);',
    '    vec3 m = vec3(0.9, -0.2 - fk * 0.11, 0.7);',
    '    vec3 z = vec3(1.42, -0.1 - fk * 0.2 + fk * fk * 0.015, 0.5);',
    '    float w = min(sdCap(qa, a, m, 0.009), sdCap(qa, m, z, 0.007));',
    '    if (w < r.x) r = vec2(w, 3.0);',
    '  }',
    '  float body = sdEll(b - vec3(0.0, 0.62, -0.2), vec3(0.86, 0.55, 0.6));',              // cuello y pecho
    '  body = smin(body, sdEll(b - vec3(0.0, 0.05, -0.15), vec3(1.12, 0.8, 0.72)), 0.3);',
    '  body *= 1.0 - 0.012 * uBody.z * step(b.y, 1.0);',
    '  r.x = smin(r.x, body, 0.22);',
    '  float clipY = p.y - uEdge;',
    '  r.x = max(r.x, -clipY);',
    // patitas: van por su cuenta, pueden asomar por delante del borde
    '  vec3 pp = vec3(abs(b.x), b.y - uPawOff, b.z) - vec3(0.92, 0.13, 0.68);',
    '  float pw = sdEll(pp, vec3(0.36, 0.19, 0.36));',
    '  for (int k = 0; k < 4; k++) { float fk = float(k) - 1.5;',
    '    pw = smin(pw, length(pp - vec3(fk * 0.165, 0.0, 0.29)) - 0.095, 0.05); }',
    '  pw = max(pw, -(clipY + 0.32 * uPawOk));',
    '  if (pw < r.x) r = vec2(pw, 4.0);',
    '  return r;',
    '}',
    'vec3 nrm(vec3 p){ vec2 e = vec2(0.002, -0.002);',
    '  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x); }',
    'void main() {',
    '  vec3 ro = vec3(0.0, 0.0, 9.0);',
    '  vec3 rd = normalize(vec3(vP * uSpan, 0.0) - ro);',
    '  float t = 6.0, md = 1e3; vec2 h = vec2(1.0, -1.0);',
    '  for (int i = 0; i < 96; i++) {',
    '    h = map(ro + rd * t);',
    '    md = min(md, h.x);',
    '    if (h.x < 0.0015 || t > 12.0) break;',
    '    t += h.x * 0.9;',
    '  }',
    '  vec3 sig = vec3(0.55, 0.36, 0.98), glow = vec3(0.86, 0.78, 1.0), deep = vec3(0.13, 0.07, 0.3);',
    '  float holoOn = step(0.001, uHolo);',
    '  float line = uEdge + mix(2.9, -0.6, uHolo);',
    '  if (h.x > 0.0015) {',
    '    float halo = exp(-md * 10.0) * (0.28 + 0.5 * uPulse) * (1.0 - holoOn * smoothstep(0.2, 0.8, uHolo));',
    '    gl_FragColor = vec4(sig * halo, halo);',
    '    return;',
    '  }',
    '  vec3 p = ro + rd * t, n = nrm(p), v = -rd;',
    '  vec3 q = toHead(toBody(p));',
    '  vec3 L = normalize(vec3(-0.5, 0.75, 0.75));',
    '  float dif = clamp(dot(n, L), 0.0, 1.0);',
    '  float back = clamp(dot(n, normalize(vec3(0.7, 0.3, -0.6))), 0.0, 1.0);',
    '  float frc = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.0);',
    '  float spec = pow(clamp(dot(n, normalize(L + v)), 0.0, 1.0), 48.0);',
    '  float lum;',
    '  if (h.y > 0.5 && h.y < 1.5) lum = 0.04;',
    '  else if (h.y > 1.5 && h.y < 2.5) lum = 0.1 + 0.25 * dif;',
    '  else if (h.y > 2.5 && h.y < 3.5) lum = 0.9;',
    '  else if (h.y > 4.5) lum = 0.55 + 0.45 * dif;',
    '  else lum = 0.16 + 0.58 * dif + 0.05 * back;',
    // pelaje: rayitas muy finas que siguen la forma, sin cuadrícula marcada
    '  float fur = sin(q.y * 110.0 + sin(q.x * 9.0) * 3.0 + sin(q.z * 7.0) * 2.0) * 0.5 + 0.5;',
    '  if (h.y < 0.5 || h.y > 3.5) lum *= 0.97 + 0.03 * fur;',
    '  if (h.y > 4.5) {',                                                // puntitos de los bigotes
    '    vec2 dp = vec2(abs(q.x), q.y) - vec2(0.26, -0.27);',
    '    float dots = smoothstep(0.03, 0.018, length(vec2(mod(dp.x, 0.09) - 0.045, mod(dp.y, 0.08) - 0.04)));',
    '    lum *= 1.0 - 0.3 * dots * step(abs(dp.x), 0.14) * step(abs(dp.y), 0.1);',
    '  }',
    '  float wave = smoothstep(0.75, 1.0, sin(p.y * 7.0 - uTime * 2.4));',
    '  vec3 c = sig * (0.22 + lum * 0.95) + mix(sig, glow, 0.4) * (frc * 1.1 + wave * 0.22);',
    '  if (h.y > 0.5 && h.y < 1.5) {',                                   // ojos: brillo que sigue la mirada
    '    vec2 hl = vec2(abs(q.x), q.y) - vec2(0.36 - sign(q.x) * uEye.x * 0.03, 0.19 - uEye.y * 0.03 - 0.0);',
    '    c = deep * 0.5 + glow * (smoothstep(0.05, 0.03, length(hl)) * 1.3 + spec * 0.8) + sig * frc * 0.5;',
    '  }',
    '  if (h.y > 1.5 && h.y < 2.5) c += glow * spec * 1.2;',
    '  if (h.y > 2.5 && h.y < 3.5) c = glow * 0.95;',
    '  float mY = -0.4 - 0.5 * q.x * q.x;',
    '  float mline = smoothstep(0.022, 0.008, abs(q.y - mY)) * step(abs(q.x), 0.2) * step(0.62, q.z) * step(h.y, 0.5);',
    '  c = mix(c, deep * 0.6, mline);',
    '  float a = 1.0;',
    '  if (h.y < 0.5 && p.y < uEdge + 0.006) c = deep * 0.7 + sig * 0.08;',   // corte del cuerpo contra el borde
    // salida: primero un pulso de luz y después se apaga de a poco, de arriba hacia abajo,
    // con un borde suave que titila como holograma
    '  c = mix(c, glow * 1.25, uPulse * 0.75);',
    '  float above = p.y - line;',
    '  if (holoOn > 0.5) {',
    '    float band = floor(p.y * 38.0);',
    '    float jit = (fract(sin(band * 91.7 + floor(uTime * 24.0) * 13.1) * 43758.5) - 0.5) * 0.35;',
    '    float k = smoothstep(-0.15, 0.75, above + jit);',
    '    float fringe = (1.0 - smoothstep(0.0, 0.5, abs(above + jit - 0.12))) * (1.0 - smoothstep(0.85, 1.0, uHolo));',
    '    c = mix(c, mix(sig * 1.3, glow, 0.5), fringe * 0.6);',
    '    a = 1.0 - k;',
    '    if (a < 0.01) discard;',
    '  }',
    '  gl_FragColor = vec4(c * a, a);',
    '}'
  ].join('\n');

  function sh(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog, U = {};
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) {
    if (window.console) console.warn('[nutria]', err);
    canvas.remove();
    return;
  }
  gl.useProgram(prog);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var aP = gl.getAttribLocation(prog, 'aP');
  gl.enableVertexAttribArray(aP);
  gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
  ['uSpan', 'uEdge', 'uBase', 'uPawOff', 'uPawOk', 'uRot', 'uBody', 'uSquash', 'uHolo', 'uPulse', 'uTime', 'uBlink', 'uEye']
    .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

  // ── tamaño: ancho según la foto, el canvas baja un poco sobre el borde (patitas) ──
  var SPAN_Y = 1.95;                    // media altura visible, en unidades del mundo
  function resize() {
    var pw = photo.getBoundingClientRect().width;
    var w = Math.round(Math.min(300, Math.max(190, pw * 0.56)));
    var hgt = Math.round(w * 0.88), over = Math.round(w * 0.115);
    canvas.style.width = w + 'px';
    canvas.style.height = hgt + 'px';
    canvas.style.bottom = 'calc(100% - ' + over + 'px)';
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U.uSpan, SPAN_Y * w / hgt, SPAN_Y);
    gl.uniform1f(U.uEdge, -SPAN_Y + 2 * SPAN_Y * (over / hgt));
    draw(performance.now());
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(photo);
  else window.addEventListener('resize', resize);

  // ── estado ──
  var hover = false, out = 0;          // out: 1 mientras tiene que estar afuera
  var M = 0, S = 0;                    // subida (resorte) y su velocidad
  var holo = -1, holoM = 0, OUT_T = 1.9; // salida: segundos desde que empezó (-1 = no)
  var E = { x: 0, y: 0 }, H = { x: 0, y: 0 }, T = { x: 0, y: 0.3 }, idleT = { x: 0, y: 0.3 }, nextIdle = 0;
  var nodAt = -1, nod = 0, calm = 1, graceT = 0;
  var raf = 0, last = performance.now(), active = false, nextBlink = 0, blinkT = -1;

  function setHover(on) {
    hover = on;
    clearTimeout(graceT);
    if (on) { out = 1; nodAt = performance.now() + 900; }
    else graceT = setTimeout(function () { if (!hover) { out = 0; kick(); } }, reduce ? 0 : 450);
    kick();
  }
  function onPointer(e) {
    var r = canvas.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height * 0.55;
    T.x = Math.max(-1, Math.min(1, (e.clientX - cx) / 400));
    T.y = Math.max(-1, Math.min(1, (e.clientY - cy) / 300));
  }
  if (finePointer) {
    photo.addEventListener('pointerenter', function () { setHover(true); });
    photo.addEventListener('pointerleave', function () { setHover(false); });
    if (!reduce) window.addEventListener('pointermove', onPointer, { passive: true });
  } else {
    new IntersectionObserver(function (es) { setHover(es[0].intersectionRatio > 0.55); },
      { threshold: [0, 0.55, 0.8] }).observe(photo);
    if (!reduce) {
      photo.addEventListener('pointerdown', function (e) { onPointer(e); pointerSeen = true; });
      photo.addEventListener('pointermove', onPointer);
    }
  }
  var pointerSeen = finePointer;
  new IntersectionObserver(function (es) {
    active = es[0].isIntersecting;
    if (active) kick(); else { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: '100px' }).observe(col);
  document.addEventListener('visibilitychange', kick);

  function idle() { return !out && holo < 0 && M === 0; }
  function kick() {
    if (raf || !active || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sstep(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }

  function frame(now) {
    raf = 0;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (reduce) {
      M = out ? 1 : 0; S = 0; holo = -1;
    } else if (out) {
      if (holo >= 0 && holo < OUT_T * 0.85) M = 1;   // volvió antes de apagarse: sigue ahí
      holo = -1;
      S += (17 * (1 - M) - 6.2 * S) * dt;            // resorte: se pasa un poco y rebota
      M += S * dt;
    } else if (M > 0 || holo >= 0) {
      if (holo < 0) { holo = 0; holoM = M; }
      holo += dt; S = 0;
      M = holoM;
      if (holo >= OUT_T) { M = 0; holo = -1; }
    }
    draw(now, dt);
    if (!idle() && active && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function draw(now, dt) {
    dt = dt || 0;
    var i = clamp(1.8 * M, 0, 1.03), n = i * i * (3 - 2 * Math.min(i, 1));
    // mirada: sigue al puntero cuando está encima; si no, mira alrededor de a ratos
    if (now > nextIdle) {
      nextIdle = now + 1400 + Math.random() * 2600;
      idleT.x = (Math.random() - 0.5) * 0.5; idleT.y = 0.25 + Math.random() * 0.35;
    }
    var follow = hover && pointerSeen && !reduce;
    var tx = (follow ? T.x : idleT.x) + 0.02 * Math.sin(now / 700);
    var ty = (follow ? 0.8 * T.y + 0.3 : idleT.y) + 0.015 * Math.sin(now / 900);
    if (reduce) { tx = 0; ty = 0.3; E.x = 0; E.y = 0.3; }
    else {
      H.x += (60 * (tx - E.x) - 9 * H.x) * dt; H.y += (60 * (ty - E.y) - 9 * H.y) * dt;
      E.x += H.x * dt; E.y += H.y * dt;
    }
    calm += ((out ? 0 : 1) - calm) * Math.min(1, 3 * dt);
    if (nodAt > 0 && now > nodAt) { nod = 1; nodAt = -1; }
    nod = Math.max(0, nod - 1.4 * dt);
    var o = reduce ? 0 : Math.sin((1 - nod) * Math.PI * 2) * nod * 0.16;
    var pitch = (0.42 * E.y + o) * (1 - 0.4 * calm) + 0.05 * calm;
    var yaw = 0.6 * E.x;
    var roll = -0.12 * E.x + (reduce ? 0 : 0.04 * Math.sin(now / 1800 + 1));
    // rotación YXZ; el shader necesita la inversa (transpuesta)
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll);
    var m = [
      cy * cz + sy * sx * sz, cx * sz, -sy * cz + cy * sx * sz,
      -cy * sz + sy * sx * cz, cx * cz, sy * sz + cy * sx * cz,
      sy * cx, -sx, cy * cx
    ];
    // m está en filas; pasar la transpuesta en orden de columnas = m tal cual en filas
    gl.uniformMatrix3fv(U.uRot, false, new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]));
    gl.uniform1f(U.uBase, -3.0 * (1 - M));
    gl.uniform1f(U.uPawOff, 3.0 * (Math.min(n, 1) - M));
    gl.uniform1f(U.uPawOk, sstep(0.75, 0.98, i));
    var breath = reduce ? 0 : Math.sin(now / 900);
    gl.uniform3f(U.uBody, 0.075 * E.x * M, -0.06 * E.x * M, breath);
    gl.uniform2f(U.uSquash, 1 - 0.008 * Math.max(0, S), 1 + 0.014 * Math.max(0, S));
    // salida: pulso (0 a 0,45 s) y después se apaga de a poco (hasta OUT_T)
    var pulse = holo >= 0 ? Math.sin(Math.PI * clamp(holo / 0.45, 0, 1)) : 0;
    var fade = holo >= 0 ? clamp((holo - 0.3) / (OUT_T - 0.3), 0, 1) : 0;
    gl.uniform1f(U.uPulse, pulse);
    gl.uniform1f(U.uHolo, holo >= 0 && holo > 0.3 ? 0.02 + 0.98 * sstep(0, 1, fade) : 0);
    gl.uniform1f(U.uTime, reduce ? 0 : now / 1000);
    gl.uniform2f(U.uEye, E.x, E.y - 0.3);
    var blink = 1;
    if (!reduce) {
      if (blinkT < 0 && now > nextBlink) { blinkT = 0; }
      if (blinkT >= 0) {
        blinkT += dt;
        blink = Math.abs(1 - blinkT / 0.08);
        if (blinkT > 0.16) { blinkT = -1; blink = 1; nextBlink = now + 2500 + Math.random() * 3000; }
      }
    }
    gl.uniform1f(U.uBlink, clamp(blink, 0, 1));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (M > 0.001 || holo >= 0) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  nextBlink = performance.now() + 2500;
  resize();
})();
