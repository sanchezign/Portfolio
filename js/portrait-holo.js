/* Retrato 3D holográfico para la foto de "Sobre mí".
   La foto se convierte en una malla en relieve (img/profile-depth.webp, generada con
   tools/portrait-depth.py: profundidad, luminancia y máscara) y se dibuja con WebGL como un
   holograma violeta: grilla luminosa sobre la superficie, borde brillante (fresnel), curvas de
   nivel y una franja de escaneo.
   - La cabeza y el cuerpo giran hacia el mouse (la cabeza un poco más, como si mirara).
   - En pantallas táctiles sigue el dedo mientras se toca la foto; si no, se balancea despacio.
   - Con prefers-reduced-motion se dibuja un solo cuadro quieto.
   - Botón para ver la foto real. Sin WebGL o sin JS queda la foto.
   Sin dependencias. La malla se arma cuando la sección se acerca. */
(function () {
  var box = document.querySelector('.about-photo');
  if (!box || !window.requestAnimationFrame || !window.IntersectionObserver) return;
  if (/[?&]retrato=off\b/.test(location.search)) return;
  var img = box.querySelector('img');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var canvas = document.createElement('canvas');
  canvas.className = 'ph-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  var gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true }) ||
           canvas.getContext('experimental-webgl');
  if (!gl || !gl.getExtension('OES_standard_derivatives')) return;

  // ── HUD + botón ──
  var hud = document.createElement('div');
  hud.className = 'ph-hud';
  hud.setAttribute('aria-hidden', 'true');
  hud.innerHTML = '<span class="ph-corner ph-tl"></span><span class="ph-corner ph-tr"></span>' +
    '<span class="ph-corner ph-bl"></span><span class="ph-corner ph-br"></span>' +
    '<span class="ph-label"></span><span class="ph-readout"></span>';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ph-toggle';
  box.appendChild(canvas);
  box.appendChild(hud);
  box.appendChild(btn);
  var elLabel = hud.querySelector('.ph-label'), elRead = hud.querySelector('.ph-readout');
  var T = {
    es: { name: 'RETRATO 3D', track: 'SIGUIENDO', idle: 'REPOSO', photo: 'Ver foto', holo: 'Ver 3D' },
    en: { name: '3D PORTRAIT', track: 'TRACKING', idle: 'IDLE', photo: 'View photo', holo: 'View 3D' }
  };
  function lang() { return document.documentElement.lang === 'en' ? 'en' : 'es'; }
  var photoMode = false, tracking = false;
  function renderHud() {
    var t = T[lang()];
    elLabel.textContent = '[' + t.name + ' · ' + (tracking && !reduce ? t.track : t.idle) + ']';
    btn.textContent = photoMode ? t.holo : t.photo;
    btn.setAttribute('aria-pressed', String(photoMode));
  }
  new MutationObserver(renderHud).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  btn.addEventListener('click', function () {
    photoMode = !photoMode;
    box.classList.toggle('ph-photo', photoMode);
    renderHud();
    kick();
  });

  // ── shaders ──
  var VS = [
    'attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUv; attribute float aHead;',
    'uniform mat4 uProj; uniform mat3 uBody; uniform mat3 uHead; uniform vec3 uPivot;',
    'varying vec3 vObj; varying vec3 vN; varying vec3 vW; varying vec2 vUv;',
    'void main() {',
    '  vec3 pb = uBody * aPos;',
    '  vec3 ph = uBody * (uHead * (aPos - uPivot) + uPivot);',
    '  vec3 p = mix(pb, ph, aHead);',
    '  vN = mix(uBody * aNor, uBody * (uHead * aNor), aHead);',
    '  vObj = aPos; vW = p; vUv = aUv;',
    '  gl_Position = uProj * vec4(p - vec3(0.0, 0.0, 4.2), 1.0);',
    '}'
  ].join('\n');
  var FS = [
    '#extension GL_OES_standard_derivatives : enable',
    'precision mediump float;',
    'uniform sampler2D uTex; uniform float uTime; uniform vec3 uLight; uniform float uScan; uniform float uFade;',
    'varying vec3 vObj; varying vec3 vN; varying vec3 vW; varying vec2 vUv;',
    'float line(float f, float w) { float d = abs(fract(f - 0.5) - 0.5) / max(fwidth(f), 1e-4); return 1.0 - clamp(d / w, 0.0, 1.0); }',
    'void main() {',
    '  vec4 tx = texture2D(uTex, vUv);',
    '  float a = smoothstep(0.35, 0.65, tx.b) * smoothstep(1.0, 0.86, vUv.y) * uFade;',
    '  if (a < 0.01) discard;',
    '  vec3 N = normalize(vN);',
    '  vec3 V = normalize(vec3(0.0, 0.0, 4.2) - vW);',
    '  float ndv = clamp(dot(N, V), 0.0, 1.0);',
    '  float fres = pow(1.0 - ndv, 2.2);',
    '  float dif = clamp(dot(N, normalize(uLight)), 0.0, 1.0);',
    '  float lum = pow(tx.g, 1.35);',
    '  float g = max(line(vObj.x * 26.0, 0.9), line(vObj.y * 26.0, 0.9));',
    '  float g2 = max(line(vObj.x * 130.0, 0.6), line(vObj.y * 130.0, 0.6));',
    '  float iso = line(vObj.z * 34.0, 0.8);',
    '  float scan = exp(-pow((vObj.y - uScan) * 9.0, 2.0));',
    '  vec3 deep = vec3(0.23, 0.15, 0.62);',
    '  vec3 accent = vec3(0.486, 0.416, 0.969);',
    '  vec3 light = vec3(0.80, 0.75, 1.0);',
    '  vec3 c = deep * (0.10 + 0.45 * dif);',
    '  c += accent * lum * (0.55 + 0.95 * dif);',
    '  c += light * g * (0.16 + 0.42 * lum) * (0.5 + 0.7 * dif);',
    '  c += accent * g2 * 0.10 * (0.4 + lum);',
    '  c += accent * iso * 0.22;',
    '  c += light * fres * 1.15;',
    '  c += light * scan * (0.18 + 0.35 * g);',
    '  c *= 0.92 + 0.08 * sin(gl_FragCoord.y * 1.6 + uTime * 6.0);',
    '  gl_FragColor = vec4(c * a, a);',
    '}'
  ].join('\n');

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog, loc = {}, nIdx = 0, ready = false;

  // ── malla a partir del mapa de relieve ──
  var W = 1.5, H = 2.0, DZ = 0.62;              // ancho, alto y profundidad del busto
  var PIVOT = [0.49, 0.56];                       // cuello, en uv
  function build(im) {
    var c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    var cx = c.getContext('2d');
    cx.drawImage(im, 0, 0);
    var d = cx.getImageData(0, 0, c.width, c.height).data, iw = c.width, ih = c.height;
    function sample(u, v, ch) {             // bilineal
      var x = Math.min(Math.max(u * (iw - 1), 0), iw - 1), y = Math.min(Math.max(v * (ih - 1), 0), ih - 1);
      var x0 = x | 0, y0 = y | 0, x1 = Math.min(x0 + 1, iw - 1), y1 = Math.min(y0 + 1, ih - 1), fx = x - x0, fy = y - y0;
      function p(xx, yy) { return d[(yy * iw + xx) * 4 + ch]; }
      return ((p(x0, y0) * (1 - fx) + p(x1, y0) * fx) * (1 - fy) + (p(x0, y1) * (1 - fx) + p(x1, y1) * fx) * fy) / 255;
    }
    var small = Math.min(window.innerWidth, window.innerHeight) < 600;
    var GX = small ? 90 : 135, GY = small ? 120 : 180;
    var n = GX * GY, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3),
        uv = new Float32Array(n * 2), head = new Float32Array(n), mask = new Float32Array(n);
    var i, j, k;
    for (j = 0; j < GY; j++) for (i = 0; i < GX; i++) {
      k = j * GX + i;
      var u = i / (GX - 1), v = j / (GY - 1);
      pos[k * 3] = (u - 0.5) * W;
      pos[k * 3 + 1] = (0.5 - v) * H;
      pos[k * 3 + 2] = sample(u, v, 0) * DZ;
      mask[k] = sample(u, v, 2);
      uv[k * 2] = u; uv[k * 2 + 1] = v;
      var t = Math.min(Math.max((0.62 - v) / 0.12, 0), 1);
      head[k] = t * t * (3 - 2 * t);
    }
    for (j = 0; j < GY; j++) for (i = 0; i < GX; i++) {
      k = j * GX + i;
      var l = j * GX + Math.max(i - 1, 0), r = j * GX + Math.min(i + 1, GX - 1),
          up = Math.max(j - 1, 0) * GX + i, dn = Math.min(j + 1, GY - 1) * GX + i;
      var dzx = (pos[r * 3 + 2] - pos[l * 3 + 2]) / (pos[r * 3] - pos[l * 3]);
      var dzy = (pos[up * 3 + 2] - pos[dn * 3 + 2]) / (pos[up * 3 + 1] - pos[dn * 3 + 1]);
      var len = Math.sqrt(dzx * dzx + dzy * dzy + 1);
      nor[k * 3] = -dzx / len; nor[k * 3 + 1] = -dzy / len; nor[k * 3 + 2] = 1 / len;
    }
    var idx = [];
    for (j = 0; j < GY - 1; j++) for (i = 0; i < GX - 1; i++) {
      var a = j * GX + i, b = a + 1, c2 = a + GX, d2 = c2 + 1;
      if (mask[a] + mask[b] + mask[c2] + mask[d2] < 0.2) continue;
      idx.push(a, c2, b, b, c2, d2);
    }
    nIdx = idx.length;

    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    function attr(name, data, size) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      var l = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0);
    }
    attr('aPos', pos, 3); attr('aNor', nor, 3); attr('aUv', uv, 2); attr('aHead', head, 1);
    var ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    ['uProj', 'uBody', 'uHead', 'uPivot', 'uTex', 'uTime', 'uLight', 'uScan', 'uFade'].forEach(function (n) {
      loc[n] = gl.getUniformLocation(prog, n);
    });
    gl.uniform1i(loc.uTex, 0);
    gl.uniform3f(loc.uPivot, (PIVOT[0] - 0.5) * W, (0.5 - PIVOT[1]) * H, 0.25);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    ready = true;
    box.classList.add('ph-on');
    renderHud();
    resize();
    kick();
  }

  // ── tamaño ──
  var aspect = 0.75;
  function resize() {
    var r = box.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    aspect = r.width / Math.max(r.height, 1);
    gl.viewport(0, 0, canvas.width, canvas.height);
    kick();
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(box);
  else window.addEventListener('resize', resize);

  // ── seguimiento del puntero ──
  var target = { x: 0, y: 0 }, cur = { x: 0.18, y: -0.05 }, lastMove = -1e9;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  function aim(e) {
    var r = box.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height * 0.3;
    var sx = Math.max(window.innerWidth - cx, cx), sy = window.innerHeight * 0.6;
    target.x = Math.max(-1, Math.min(1, (e.clientX - cx) / sx));
    target.y = Math.max(-1, Math.min(1, (e.clientY - cy) / sy));
    lastMove = performance.now();
    if (!tracking) { tracking = true; renderHud(); }
    kick();
  }
  if (!reduce) {
    if (finePointer) window.addEventListener('pointermove', aim, { passive: true });
    else {
      box.addEventListener('pointerdown', aim);
      box.addEventListener('pointermove', aim);
    }
  }

  // ── matrices ──
  function rotYX(yaw, pitch) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // R = Rx(pitch) * Ry(yaw), en orden de columnas
    return new Float32Array([cy, sp * sy, -cp * sy, 0, cp, sp, sy, -sp * cy, cp * cy]);
  }
  function perspective(fovy, asp, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }

  // ── animación ──
  var visible = false, raf = 0, t0 = performance.now(), last = t0, boot = reduce ? 1 : 0;
  function kick() { if (ready && !raf && (visible || reduce) && !document.hidden) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    var dt = Math.min((now - last) / 1000, 0.05); last = now;
    var t = (now - t0) / 1000;
    var idle = now - lastMove > 3500;
    if (idle && tracking) { tracking = false; renderHud(); }
    var tx = target.x, ty = target.y;
    if (reduce) { tx = 0.35; ty = -0.1; cur.x = tx; cur.y = ty; }
    else if (idle) { tx = Math.sin(t * 0.45) * 0.45; ty = Math.sin(t * 0.31) * 0.18 - 0.05; }
    var k = 1 - Math.exp(-dt * (idle ? 1.5 : 5));
    if (!reduce) { cur.x += (tx - cur.x) * k; cur.y += (ty - cur.y) * k; }
    boot = reduce ? 1 : Math.min(1, boot + dt / 1.4);

    // en pantallas angostas la cámara se aleja un poco para que el busto no se corte al girar
    var fov = 0.52;
    var hh = Math.tan(fov / 2) * 4.2;                      // media altura visible en z = 0
    if (aspect < W / H) fov = 2 * Math.atan(hh * (W / H) / aspect / 4.2);
    gl.uniformMatrix4fv(loc.uProj, false, perspective(fov, aspect, 0.1, 20));
    gl.uniformMatrix3fv(loc.uBody, false, rotYX(cur.x * 0.22, cur.y * 0.10));
    gl.uniformMatrix3fv(loc.uHead, false, rotYX(cur.x * 0.36, cur.y * 0.26));
    gl.uniform3f(loc.uLight, 0.35 + cur.x * 0.9, 0.55 - cur.y * 0.6, 1.0);
    gl.uniform1f(loc.uTime, reduce ? 0 : t);
    gl.uniform1f(loc.uScan, reduce ? 0.2 : 1.25 - ((t * 0.32) % 1) * 2.6);
    gl.uniform1f(loc.uFade, boot * boot * (3 - 2 * boot));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_SHORT, 0);

    if (elRead && !reduce) {
      var deg = function (r) { var s = (r * 180 / Math.PI).toFixed(1); return (r >= 0 ? '+' : '') + s + '°'; };
      elRead.textContent = 'YAW ' + deg(cur.x * 0.58) + '  PITCH ' + deg(-cur.y * 0.36);
    }
    if (!reduce && visible && !photoMode && !document.hidden) raf = requestAnimationFrame(frame);
  }

  new IntersectionObserver(function (es) {
    visible = es[0].isIntersecting;
    kick();
  }).observe(box);
  document.addEventListener('visibilitychange', kick);

  // carga perezosa: el mapa de relieve recién cuando la sección se acerca
  var started = false;
  new IntersectionObserver(function (es, io) {
    if (!es[0].isIntersecting || started) return;
    started = true;
    io.disconnect();
    var im = new Image();
    im.decoding = 'async';
    im.onload = function () {
      try { build(im); } catch (err) { if (window.console) console.warn('[holo]', err); box.classList.remove('ph-on'); }
    };
    im.src = '/img/profile-depth.webp';
  }, { rootMargin: '400px 0px' }).observe(box);
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); box.classList.remove('ph-on'); ready = false; });
})();
