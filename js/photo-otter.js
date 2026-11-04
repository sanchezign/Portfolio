/* Nutria holográfica que se asoma sobre la foto de "Sobre mí".
   - Al pasar el mouse por la foto, la nutria sube desde atrás del borde superior y apoya las
     patitas en el borde; al salir, vuelve a esconderse.
   - Mientras está afuera, la cabeza y los ojos siguen al mouse.
   - En pantallas táctiles se asoma cuando la foto está en pantalla, o al tocarla, y sigue el dedo.
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
    'uniform vec2 uSpan;      // media extensión visible en x e y (mundo)',
    'uniform float uYc;       // centro vertical de la vista',
    'uniform float uEdge;     // altura del borde de la foto',
    'uniform float uRise;     // 0 escondida, 1 afuera (cuerpo)',
    'uniform float uPaw;      // 0..1 patitas',
    'uniform vec2 uLook;      // giro de la cabeza (yaw, pitch)',
    'uniform float uTime;',
    'uniform float uBlink;',
    'mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }',
    'mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }',
    'float sdEll(vec3 p, vec3 r){ float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-4); }',
    'float sdCap(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }',
    'float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }',
    'mat3 headR; vec3 headP; float bodyY; float pawY;',
    // mapa: x = distancia, y = material (0 pelaje, 1 ojo, 2 nariz, 3 bigote, 4 pata)
    'vec2 map(vec3 p) {',
    '  vec3 q = headR * (p - headP);',
    '  float d = sdEll(q, vec3(1.05, 0.9, 0.88));',
    '  for (int i = 0; i < 2; i++) { float s = i == 0 ? -1.0 : 1.0;',
    '    vec3 e = q - vec3(s * 0.8, 0.58, -0.12);',
    '    float ear = sdEll(e, vec3(0.24, 0.21, 0.14));',
    '    ear = max(ear, -sdEll(e - vec3(0.0, -0.02, 0.12), vec3(0.13, 0.11, 0.08)));',
    '    d = smin(d, ear, 0.1);',
    '    d = smin(d, sdEll(q - vec3(s * 0.22, -0.36, 0.72), vec3(0.3, 0.24, 0.24)), 0.12);',
    '  }',
    '  d = smin(d, sdEll(q - vec3(0.0, -0.3, 0.55), vec3(0.55, 0.36, 0.38)), 0.18);',
    '  vec2 r = vec2(d, 0.0);',
    '  float nose = sdEll(q - vec3(0.0, -0.17, 0.98), vec3(0.2, 0.12, 0.12));',
    '  if (nose < r.x) r = vec2(nose, 2.0);',
    '  for (int i = 0; i < 2; i++) { float s = i == 0 ? -1.0 : 1.0;',
    '    float eye = sdEll(q - vec3(s * 0.42, 0.13, 0.73), vec3(0.155, 0.17 * uBlink + 0.012, 0.09));',
    '    if (eye < r.x) r = vec2(eye, 1.0);',
    '    for (int k = 0; k < 3; k++) { float fk = float(k);',
    '      vec3 a = vec3(s * 0.42, -0.3 - fk * 0.07, 0.88);',
    '      vec3 b = vec3(s * 1.65, -0.08 - fk * 0.2 + fk * fk * 0.02, 0.45 - fk * 0.05);',
    '      float w = sdCap(q, a, b, 0.011);',
    '      if (w < r.x) r = vec2(w, 3.0);',
    '    }',
    '  }',
    '  float body = sdEll(p - vec3(0.0, bodyY, -0.25), vec3(1.15, 1.0, 0.78));',
    '  r.x = smin(r.x, body, 0.25);',
    '  r.x = max(r.x, uEdge - p.y);',
    '  for (int i = 0; i < 2; i++) { float s = i == 0 ? -1.0 : 1.0;',
    '    vec3 c = vec3(s * 0.82, pawY, 0.62);',
    '    float pw = sdEll(p - c, vec3(0.36, 0.2, 0.34));',
    '    for (int k = 0; k < 3; k++) { float fk = float(k) - 1.0;',
    '      pw = smin(pw, length(p - c - vec3(fk * 0.17, 0.02, 0.27)) - 0.1, 0.06); }',
    '    pw = max(pw, uEdge - 0.16 - p.y);',
    '    if (pw < r.x) r = vec2(pw, 4.0);',
    '  }',
    '  return r;',
    '}',
    'vec3 nrm(vec3 p){ vec2 e = vec2(0.002, -0.002);',
    '  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x); }',
    'float ln(float f, float w){ float d = abs(fract(f - 0.5) - 0.5) / max(fwidth(f), 1e-4); return 1.0 - clamp(d / w, 0.0, 1.0); }',
    'void main() {',
    '  headR = rotX(-uLook.y) * rotY(-uLook.x);',
    '  float rise = uRise;',
    '  headP = vec3(0.0, mix(uEdge - 2.4, uEdge + 1.55, rise), 0.0);',
    '  bodyY = headP.y - 1.25;',
    '  pawY = mix(uEdge - 0.5, uEdge + 0.12, uPaw);',
    '  vec3 ro = vec3(0.0, uYc, 9.0);',
    '  vec3 pt = vec3(vP.x * uSpan.x, uYc + vP.y * uSpan.y, 0.0);',
    '  vec3 rd = normalize(pt - ro);',
    '  float t = 6.0, md = 1e3; vec2 h = vec2(1.0, -1.0);',
    '  for (int i = 0; i < 90; i++) {',
    '    vec3 p = ro + rd * t; h = map(p);',
    '    md = min(md, h.x);',
    '    if (h.x < 0.0015 || t > 12.5) break;',
    '    t += h.x * 0.9;',
    '  }',
    '  vec3 violet = vec3(0.55, 0.36, 0.98), light = vec3(0.86, 0.8, 1.0), deep = vec3(0.16, 0.08, 0.38);',
    '  if (h.x > 0.0015) {',
    '    float glow = exp(-md * 9.0) * 0.35 * max(rise, uPaw);',
    '    gl_FragColor = vec4(violet * glow, glow);',
    '    return;',
    '  }',
    '  vec3 p = ro + rd * t, n = nrm(p), v = -rd;',
    '  vec3 q = headR * (p - headP);',
    '  vec3 L = normalize(vec3(-0.4 + uLook.x, 0.7 - uLook.y, 0.8));',
    '  float dif = clamp(dot(n, L), 0.0, 1.0);',
    '  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.4);',
    '  float spec = pow(clamp(dot(n, normalize(L + v)), 0.0, 1.0), 40.0);',
    '  vec3 g = h.y > 3.5 ? p * 1.0 : q;',
    '  float grid = max(ln(g.x * 9.0, 0.8), ln(g.y * 9.0, 0.8));',
    '  float fine = max(ln(g.x * 36.0, 0.6), ln(g.y * 36.0, 0.6));',
    '  float fur = ln((g.y + 0.35 * sin(g.x * 3.0)) * 22.0 + sin(g.x * 41.0) * 0.4, 0.7);',
    '  vec3 c;',
    '  if (h.y > 0.5 && h.y < 1.5) {',            // ojo
    '    c = deep * 0.35 + light * pow(spec, 2.0) * 2.5 + violet * fres * 0.6;',
    '    vec2 hl = q.xy - vec2(sign(q.x) * 0.42 - 0.05 + uLook.x * 0.04, 0.2 - uLook.y * 0.04);',
    '    c += light * smoothstep(0.045, 0.025, length(hl)) * 1.4;',
    '  } else if (h.y > 1.5 && h.y < 2.5) {',     // nariz
    '    c = deep * 0.6 + violet * dif * 0.35 + light * spec * 1.8 + violet * fres;',
    '  } else if (h.y > 2.5 && h.y < 3.5) {',     // bigotes
    '    c = light * 0.95;',
    '  } else {',
    '    float muzzle = smoothstep(0.62, 0.3, length((q - vec3(0.0, -0.33, 0.7)) * vec3(1.0, 1.25, 1.0)));',
    '    c = deep * (0.3 + 0.4 * dif) + violet * (0.12 + 0.62 * dif) * (0.65 + 0.7 * muzzle) + light * muzzle * 0.12;',
    '    c += light * grid * 0.34 + violet * fine * 0.14 + light * fur * 0.12 * dif;',
    '    c += mix(violet, light, 0.55) * fres * 1.1 + light * spec * 0.4;',
    '    float mouth = abs(q.y - (-0.5 + 0.35 * q.x * q.x)) ;',
    '    c = mix(c, deep * 0.4, smoothstep(0.03, 0.012, mouth) * step(abs(q.x), 0.28) * step(0.6, q.z));',
    '  }',
    '  float scan = exp(-pow((p.y - mod(uTime * 1.1, 6.0) + 2.5 - uEdge) * 4.0, 2.0));',
    '  c += light * scan * 0.25;',
    '  c *= 0.93 + 0.07 * sin(gl_FragCoord.y * 1.4 + uTime * 5.0);',
    '  gl_FragColor = vec4(c, 1.0);',
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
  ['uSpan', 'uYc', 'uEdge', 'uRise', 'uPaw', 'uLook', 'uTime', 'uBlink'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

  // ── tamaño: el canvas se apoya sobre el borde superior de la foto ──
  var OVER = 22;                       // px del canvas que bajan sobre la foto (patitas)
  var SPAN_Y = 1.85;                   // media altura visible, en unidades del mundo
  var cssH = 1;
  function resize() {
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    cssH = r.height || 1;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U.uSpan, SPAN_Y * r.width / cssH, SPAN_Y);
    gl.uniform1f(U.uYc, 0.0);
    gl.uniform1f(U.uEdge, -SPAN_Y + 2 * SPAN_Y * (OVER / cssH));
    kick();
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);

  // ── estado ──
  var want = false, rise = 0, paw = 0, look = { x: 0, y: 0 }, aim = { x: 0, y: 0 };
  var raf = 0, last = performance.now(), t0 = last, nextBlink = 2500, blinkT = -1;
  function show(on) {
    if (want === on) return;
    want = on;
    canvas.classList.toggle('is-out', on);
    if (reduce) { rise = paw = on ? 1 : 0; }
    kick();
  }
  function onPointer(e) {
    var r = canvas.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height * 0.45;
    aim.x = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth * 0.3)));
    aim.y = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight * 0.4)));
    if (want) kick();
  }
  if (finePointer) {
    photo.addEventListener('pointerenter', function () { show(true); });
    col.addEventListener('pointerleave', function () { show(false); });
    if (!reduce) window.addEventListener('pointermove', onPointer, { passive: true });
  } else {
    // táctil: se asoma cuando la foto está bien a la vista; tocarla la hace mirar al dedo
    new IntersectionObserver(function (es) { show(es[0].intersectionRatio > 0.55); },
      { threshold: [0, 0.55, 0.8] }).observe(photo);
    if (!reduce) {
      photo.addEventListener('pointerdown', onPointer);
      photo.addEventListener('pointermove', onPointer);
    }
  }
  var visible = false;
  new IntersectionObserver(function (es) { visible = es[0].isIntersecting; kick(); }, { rootMargin: '100px' }).observe(col);
  document.addEventListener('visibilitychange', kick);

  function kick() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); }
  function ease(x) { return x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x); }
  function back(x) { x = Math.max(0, Math.min(1, x)); var c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }
  function frame(now) {
    raf = 0;
    var dt = Math.min((now - last) / 1000, 0.05); last = now;
    var t = (now - t0) / 1000;
    if (!reduce) {
      rise += ((want ? 1 : 0) - rise) * Math.min(1, dt * (want ? 4.5 : 6));
      paw += ((want && rise > 0.45 ? 1 : 0) - paw) * Math.min(1, dt * (want ? 7 : 9));
      // si no hay mouse (táctil sin tocar), mira alrededor despacio
      var tx = aim.x, ty = aim.y;
      if (!finePointer && !want) { tx = 0; ty = 0; }
      look.x += (tx * 0.7 - look.x) * Math.min(1, dt * 6);
      look.y += (ty * 0.4 - look.y) * Math.min(1, dt * 6);
    }
    // parpadeo cada tanto
    var blink = 1;
    if (!reduce) {
      if (blinkT < 0 && now - t0 > nextBlink) { blinkT = 0; }
      if (blinkT >= 0) {
        blinkT += dt;
        blink = Math.abs(1 - blinkT / 0.08);
        if (blinkT > 0.16) { blinkT = -1; blink = 1; nextBlink = now - t0 + 2500 + Math.random() * 3000; }
      }
    }
    var r = reduce ? rise : back(rise);
    gl.uniform1f(U.uRise, r);
    gl.uniform1f(U.uPaw, reduce ? paw : back(paw));
    gl.uniform2f(U.uLook, look.x + (reduce ? 0 : Math.sin(t * 1.3) * 0.03 * rise), look.y);
    gl.uniform1f(U.uTime, reduce ? 0 : t);
    gl.uniform1f(U.uBlink, Math.min(1, Math.max(0, blink)));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (rise > 0.002 || paw > 0.002) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    var moving = !reduce && (Math.abs((want ? 1 : 0) - rise) > 0.002 || Math.abs((want ? 1 : 0) - paw) > 0.002 || want);
    if (moving && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  resize();
})();
