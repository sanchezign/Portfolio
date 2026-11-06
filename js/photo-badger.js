/* Tejón de la miel holográfico violeta que se asoma sobre la foto de "Sobre mí".
   Modelo: img/badger/badger-mesh.bin + img/badger/badger-tex.webp, generados con
   tools/badger-pack.py a partir del .glb del tejón (forma generada desde una imagen de
   referencia, pintada proyectando esa imagen de frente).
   - Entrada: al pasar el mouse por la foto sube con un resorte; las patas con garras llegan
     primero al borde y al rato hace un gesto con la cabeza.
   - Afuera: la cabeza sigue al mouse (con resorte) y respira; sin mouse, mira alrededor.
   - Salida: medio segundo de gracia y se apaga como holograma: una línea de luz baja y lo de
     arriba queda como un fantasma que se desvanece.
   - En pantallas táctiles se asoma cuando la foto está bien a la vista.
   - Con prefers-reduced-motion no aparece. Sin WebGL tampoco.
   WebGL sin dependencias; el modelo se baja recién cuando la sección se acerca. */
(function () {
  var photo = document.querySelector('.about-photo');
  var col = photo && photo.parentNode;
  if (!col || !window.requestAnimationFrame || !window.IntersectionObserver || !window.fetch) return;
  if (/[?&]tejon=off\b/.test(location.search)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // colores: señal (violeta) y brillo (lavanda)
  var SIGNAL = [0.545, 0.361, 0.965], GLOW = [0.769, 0.710, 0.992];

  var VS = [
    'attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUv;',
    'uniform vec3 uMin; uniform vec3 uMax;',
    'uniform mat3 uRot; uniform mat4 uGroup; uniform mat4 uProj; uniform vec3 uCam;',
    'uniform float uBreath; uniform float uPawOff;',
    'varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying float vPaw;',
    'const vec3 PIV = vec3(0.0, 0.30, -0.05);',
    'void main() {',
    '  vec3 p = mix(uMin, uMax, aPos * 0.5 + 0.5);',          // posición cuantizada a la caja
    '  vec3 n = normalize(aNor);',
    '  float w = smoothstep(0.17, 0.31, p.y) * smoothstep(-0.30, -0.05, p.z) * (1.0 - smoothstep(0.26, 0.40, abs(p.x)));',  // peso de la cabeza
    '  float body = (1.0 - w) * smoothstep(0.03, 0.16, p.y);',
    '  vec3 t = p;',
    '  t.xz *= 1.0 + uBreath * 0.018 * body;',
    '  t.y += uBreath * 0.006 * body;',
    '  t = mix(t, uRot * (t - PIV) + PIV, w);',
    '  n = normalize(mix(n, uRot * n, w));',
    '  float ax = abs(p.x);',
    '  float pm = smoothstep(0.05, 0.09, ax) * smoothstep(0.08, 0.14, p.z) * (1.0 - smoothstep(0.10, 0.15, p.y));',
    '  t.y += uPawOff * pm;',
    '  vPaw = (1.0 - step(0.13, p.y)) * step(0.06, ax) * step(0.10, p.z);',
    '  t.y -= 0.075;',
    '  vec4 wp = uGroup * vec4(t, 1.0);',
    '  vW = wp.xyz; vN = normalize(mat3(uGroup) * n); vUv = aUv;',
    '  gl_Position = uProj * vec4(wp.xyz - uCam, 1.0);',
    '}'
  ].join('\n');
  var FS = [
    '#extension GL_OES_standard_derivatives : enable',
    'precision highp float;',
    'uniform sampler2D uTex; uniform vec3 uCam;',
    'uniform float uEdge; uniform float uPawOk; uniform float uHolo; uniform float uTime;',
    'uniform vec3 uSignal; uniform vec3 uGlow;',
    'varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying float vPaw;',
    'vec3 perturb(vec3 n, vec3 pos, vec2 uv, vec3 mapN) {',  // normal map sin tangentes precalculadas
    '  vec3 q0 = dFdx(pos), q1 = dFdy(pos); vec2 s0 = dFdx(uv), s1 = dFdy(uv);',
    '  vec3 r1 = cross(q1, n), r2 = cross(n, q0);',
    '  vec3 Tg = r1 * s0.x + r2 * s1.x, Bg = r1 * s0.y + r2 * s1.y;',
    '  float det = max(dot(Tg, Tg), dot(Bg, Bg));',
    '  float sc = det == 0.0 ? 0.0 : inversesqrt(det);',
    '  return normalize(mat3(Tg * sc, Bg * sc, n) * mapN);',
    '}',
    'void main() {',
    '  bool pawZone = vPaw > 0.5 && vW.y > uEdge - 0.11 * uPawOk;',
    '  float clipA = pawZone ? 1.0 : smoothstep(uEdge - 0.0045, uEdge + 0.0015, vW.y);',
    '  if (clipA <= 0.0) discard;',
    '  float line = mix(0.86, -0.16, uHolo);',
    '  float above = vW.y - line;',
    '  float on = step(0.001, uHolo);',
    '  float ghost = on * step(0.0, above);',
    '  float ghostA = (1.0 - smoothstep(0.0, 0.45, above)) * (1.0 - smoothstep(0.78, 1.0, uHolo));',
    '  if (ghost > 0.5 && ghostA <= 0.01) discard;',
    '  float edge = on * (1.0 - smoothstep(0.0, 0.01, abs(above)));',
    '  vec4 tx = texture2D(uTex, vUv);',
    '  vec3 V = normalize(uCam - vW);',
    '  vec3 n = normalize(vN);',
    '  if (!gl_FrontFacing) n = -n;',
    '  vec3 mapN = vec3(tx.rg * 2.0 - 1.0, 0.0); mapN.z = sqrt(max(0.0, 1.0 - dot(mapN.xy, mapN.xy)));',
    '  vec3 N = perturb(n, vW, vUv, mapN);',
    // luz parecida a la escena original: tono de la textura iluminado y con tone mapping
    '  float alb = pow(tx.b, 2.2) * 0.8;',
    '  float key = max(dot(N, normalize(vec3(-1.2, 1.6, 2.2))), 0.0);',
    '  float rim1 = max(dot(N, normalize(vec3(1.6, 0.9, -1.8))), 0.0);',
    '  float rim2 = max(dot(N, normalize(vec3(-1.8, 0.4, -1.2))), 0.0);',
    '  float hemi = mix(0.25, 1.0, N.y * 0.5 + 0.5);',
    '  float lit = alb * (hemi * 1.1 + key * 2.2 + rim1 * 1.4 + rim2 * 0.8) * 1.05;',
    '  lit = clamp((lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14), 0.0, 1.0);',
    '  float lum = pow(lit, 1.0 / 2.2);',
    '  vec3 c;',
    '  float a = 1.0;',
    '  if (ghost < 0.5) {',
    '    float frc = pow(1.0 - abs(dot(N, V)), 2.0);',
    '    vec2 gp = vW.xy * 62.0; vec2 gd = abs(fract(gp) - 0.5);',
    '    float grid = 1.0 - smoothstep(0.0, 0.05, 0.5 - max(gd.x, gd.y));',
    '    float wave = smoothstep(0.75, 1.0, sin(vW.y * 22.0 - uTime * 2.4));',
    '    c = uSignal * (0.22 + lum * 0.55) + uSignal * grid * 0.22 + mix(uSignal, uGlow, 0.35) * (frc * 1.1 + wave * 0.35);',
    '  } else {',
    '    float fr = pow(1.0 - abs(dot(n, V)), 2.2);',
    '    float fine = smoothstep(0.86, 1.0, sin(vW.y * 900.0 - uTime * 10.0));',
    '    float g = clamp(fr * 1.25 + fine * 0.22 + 0.05, 0.0, 1.0);',
    '    c = uSignal * (0.75 + g * 0.9) + uGlow * fr * fr * 0.18;',
    '    a = ghostA * g;',
    '  }',
    '  a *= clipA;',
    '  c = mix(c, mix(uSignal * 1.35, uGlow, 0.45), edge);',
    '  a = max(a, edge * clipA);',
    '  gl_FragColor = vec4(c * a, a);',
    '}'
  ].join('\n');

  var canvas, gl, prog, U = {}, nIdx = 0, ready = false, loading = false;

  // ── tamaño: como en el original, ancho según la tarjeta y unos px sobre el borde ──
  var FOV = 17.5 * Math.PI / 180, DIST = 3.1;
  function resize() {
    if (!ready) return;
    var pw = photo.getBoundingClientRect().width;
    var w = Math.round(Math.min(300, Math.max(200, 0.45 * pw)));
    var h = Math.round(0.88 * w), over = Math.round(w * (34 / 300) * 10) / 10;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.style.bottom = 'calc(100% - ' + over + 'px)';
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    var aspect = w / h;
    var hh = DIST * Math.tan(FOV / 2);
    var camY = hh - 2 * hh * (34 / 264);       // el borde (y = 0) queda a 34/264 del fondo
    var f = 1 / Math.tan(FOV / 2), near = 0.1, far = 50, nf = 1 / (near - far);
    gl.uniformMatrix4fv(U.uProj, false, new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]));
    gl.uniform3f(U.uCam, 0, camY, DIST);
    if (idle()) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
  }

  function sh(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function setup(bin, img) {
    canvas = document.createElement('canvas');
    canvas.className = 'badger-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl || !gl.getExtension('OES_standard_derivatives')) return;
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    // formato: 8 floats (vértices, índices, caja min, caja max), posiciones int16 x3,
    // normales int8 x4, uv uint16 x2, índices uint16
    var hdr = new Float32Array(bin, 0, 8);
    var nV = hdr[0], nI = hdr[1], o = 32;
    var posBytes = nV * 6;
    function attr(name, data, size, type, stride) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      var l = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, type, true, stride, 0);
    }
    attr('aPos', new Int16Array(bin, o, nV * 3), 3, gl.SHORT, 0); o += posBytes + ((4 - posBytes % 4) % 4);
    attr('aNor', new Int8Array(bin, o, nV * 4), 3, gl.BYTE, 4); o += nV * 4;
    attr('aUv', new Uint16Array(bin, o, nV * 2), 2, gl.UNSIGNED_SHORT, 0); o += nV * 4;
    var ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(bin, o, nI), gl.STATIC_DRAW);
    nIdx = nI;

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    ['uMin', 'uMax', 'uRot', 'uGroup', 'uProj', 'uCam', 'uBreath', 'uPawOff', 'uTex', 'uEdge', 'uPawOk',
     'uHolo', 'uTime', 'uSignal', 'uGlow'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.uniform3f(U.uMin, hdr[2], hdr[3], hdr[4]);
    gl.uniform3f(U.uMax, hdr[5], hdr[6], hdr[7]);
    gl.uniform1i(U.uTex, 0);
    gl.uniform1f(U.uEdge, 0);
    gl.uniform3fv(U.uSignal, SIGNAL);
    gl.uniform3fv(U.uGlow, GLOW);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); ready = false; canvas.remove(); });

    col.insertBefore(canvas, photo);
    ready = true;
    resize();
    kick();
  }
  function load() {
    if (loading) return;
    loading = true;
    var img = new Image();
    var imgReady = new Promise(function (res, rej) { img.onload = res; img.onerror = rej; });
    img.src = '/img/badger/badger-tex.webp';
    Promise.all([fetch('/img/badger/badger-mesh.bin').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }), imgReady]).then(function (rs) {
      try { setup(rs[0], img); } catch (err) { if (window.console) console.warn('[tejon]', err); }
    }).catch(function (err) { if (window.console) console.warn('[tejon]', err); });
  }
  new IntersectionObserver(function (es, io) {
    if (es[0].isIntersecting) { io.disconnect(); load(); }
  }, { rootMargin: '800px 0px' }).observe(col);

  if (window.ResizeObserver) new ResizeObserver(resize).observe(photo);
  window.addEventListener('resize', resize);

  // ── estado (mismas animaciones que el original) ──
  var out = 0, hover = false;           // out: tiene que estar afuera; hover: el puntero está encima
  var M = 0, S = 0, w = -1, R = 0, holo = 0, calm = 1, nod = 0, nodAt = -1, roll = 0;
  var B = { x: 0, y: 0.3 }, nextB = 0, T = { x: 0, y: 0 }, E = { x: 0, y: 0 }, H = { x: 0, y: 0 };
  var grace = 0, raf = 0, last = performance.now(), active = false;

  function idle() { return out === 0 && w < 0 && M === 0; }
  function setHover(on) {
    hover = on;
    clearTimeout(grace);
    if (on) { out = 1; nodAt = performance.now() + 900; }
    else grace = setTimeout(function () { if (!hover) { out = 0; kick(); } }, 450);
    kick();
  }
  function onPointer(e) {
    if (!canvas) return;
    var r = canvas.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + 0.55 * r.height;
    T.x = clamp((e.clientX - cx) / 400, -1, 1);
    T.y = clamp((e.clientY - cy) / 300, -1, 1);
  }
  if (finePointer) {
    photo.addEventListener('pointerenter', function () { setHover(true); });
    photo.addEventListener('pointerleave', function () { setHover(false); });
    window.addEventListener('pointermove', onPointer, { passive: true });
  } else {
    new IntersectionObserver(function (es) { setHover(es[0].intersectionRatio > 0.55); },
      { threshold: [0, 0.55, 0.8] }).observe(photo);
  }
  new IntersectionObserver(function (es) {
    active = es[0].isIntersecting;
    if (active) kick(); else { cancelAnimationFrame(raf); raf = 0; }
  }).observe(col);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else kick();
  });

  function kick() {
    if (raf || !ready || !active || document.hidden || idle()) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sstep(x, a, b) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }

  function frame(now) {
    raf = 0;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (out) {
      if (w >= 0 && w < 0.85) M = 1;            // volvió antes de apagarse
      w = -1; holo = 0;
      S += (17 * (1 - M) - 6.2 * S) * dt;       // resorte
      M += S * dt;
    } else if (M > 0 || w >= 0) {
      if (w < 0) { w = 0; R = M; }
      w += dt; S = 0;
      var e = Math.min(1, w / 1.6);
      holo = e < 1 ? 0.98 * sstep(e, 0, 1) + 0.02 : 0;
      M = R;
      if (e >= 1) { M = 0; holo = 0; w = -1; }
    }
    draw(now, dt);
    if (active && !document.hidden && !idle()) raf = requestAnimationFrame(frame);
  }

  function draw(now, dt) {
    var i = clamp(1.8 * M, 0, 1.03), n = i * i * (3 - 2 * Math.min(i, 1));
    calm += ((out ? 0 : 1) - calm) * Math.min(1, 3 * dt);
    if (now > nextB) {
      nextB = now + 1400 + 2600 * Math.random();
      B.x = (Math.random() - 0.5) * 0.5; B.y = 0.25 + 0.35 * Math.random();
    }
    var tx = (hover ? T.x : B.x) + 0.02 * Math.sin(now / 700);
    var ty = (hover ? 0.8 * T.y + 0.3 : B.y) + 0.015 * Math.sin(now / 900);
    H.x += (60 * (tx - E.x) - 9 * H.x) * dt; H.y += (60 * (ty - E.y) - 9 * H.y) * dt;
    E.x += H.x * dt; E.y += H.y * dt;
    if (nodAt > 0 && now > nodAt) { nod = 1; nodAt = -1; }
    nod = Math.max(0, nod - 1.4 * dt);
    var o = Math.sin((1 - nod) * Math.PI * 2) * nod * 0.16;
    roll += ((hover ? 0.16 : 0.06) - roll) * Math.min(1, 2 * dt);
    var pitch = (0.42 * E.y + o) * (1 - 0.4 * calm) + 0.06 * calm;
    var yaw = 0.55 * E.x;
    var rz = -(0.12 * E.x) + roll * Math.sin(now / 1800 + 1) * 0.6 + 0.4 * roll;
    // Euler en orden YXZ → matriz en orden de columnas
    var cx = Math.cos(pitch), sx = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw), cz = Math.cos(rz), sz = Math.sin(rz);
    gl.uniformMatrix3fv(U.uRot, false, new Float32Array([
      cy * cz + sy * sx * sz, cx * sz, -sy * cz + cy * sx * sz,
      -cy * sz + sy * sx * cz, cx * cz, sy * sz + cy * sx * cz,
      sy * cx, -sx, cy * cx
    ]));
    // grupo: sube, se inclina y se estira con la velocidad del resorte
    var gz = -(0.06 * E.x) * M, gx = 0.025 * E.x * M, gy = -0.95 + 0.95 * M;
    var scx = 1 - 0.008 * Math.max(0, S), scy = 1 + 0.014 * Math.max(0, S);
    var c = Math.cos(gz), s = Math.sin(gz);
    gl.uniformMatrix4fv(U.uGroup, false, new Float32Array([
      c * scx, s * scx, 0, 0,
      -s * scy, c * scy, 0, 0,
      0, 0, 1, 0,
      gx, gy, 0, 1
    ]));
    gl.uniform1f(U.uPawOff, 0.95 * (Math.min(n, 1) - M));
    gl.uniform1f(U.uPawOk, sstep(i, 0.75, 0.98));
    gl.uniform1f(U.uHolo, holo);
    gl.uniform1f(U.uBreath, Math.sin(now / 900));
    gl.uniform1f(U.uTime, now / 1000);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!idle()) gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_SHORT, 0);
  }
})();
