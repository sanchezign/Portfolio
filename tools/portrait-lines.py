"""Genera el retrato de líneas de "Sobre mí" (js/portrait-lines-data.js) a partir de img/profile.webp.

Uso:  python3 tools/portrait-lines.py [preview.png]
Requiere: numpy, opencv-python-headless, scikit-image, pillow.

Pasos:
  1. Recorte tipo busto (cabeza y hombros) y máscara de la persona con GrabCut.
  2. Regiones por color: piel, pelo, camisa, corbata y saco.
  3. Capas de líneas, todas como polilíneas en un lienzo de 600x800:
     0 = silueta exterior
     1 = rasgos: bordes de la cara (ojos, cejas, nariz, boca, oreja) y límites entre regiones
     2 = flujo: líneas paralelas que siguen la forma del cuerpo (campo de orientación
         suavizado + trazado de líneas de corriente con separación pareja)
"""
import json, os, sys
from collections import deque
import numpy as np, cv2
from PIL import Image
from skimage import measure, morphology

JAW_LEVELS = [float(x) for x in os.environ.get('JAW', '95').split(',')]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'img/profile.webp')
OUT = os.path.join(ROOT, 'js/portrait-lines-data.js')
PREVIEW = sys.argv[1] if len(sys.argv) > 1 else None

# ── 1. recorte y escala ──
CROP = (150, 30, 660, 710)            # x0, y0, x1, y1 sobre la foto de 800x840 (3:4)
OW, OH = 600, 800                      # lienzo de salida
PW, PH = 765, 1020                     # resolución de trabajo
src = Image.open(SRC).convert('RGB').crop(CROP)
img = np.array(src.resize((PW, PH), Image.LANCZOS))
SC = OW / PW
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
hsv = cv2.cvtColor(cv2.bilateralFilter(img, 9, 50, 9), cv2.COLOR_RGB2HSV).astype(int)
h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
yy, xx = np.mgrid[:PH, :PW]

# ── máscara: el fondo es gris liso, más claro arriba ──
bg_like = (s < 40) & (v > 45) & (v < 120)
gc = np.full((PH, PW), cv2.GC_PR_BGD, np.uint8)
gc[~bg_like & (yy > PH * 0.08)] = cv2.GC_PR_FGD
gc[:, :12] = gc[:, -12:] = gc[:8, :] = cv2.GC_BGD
skin0 = (h <= 22) & (s > 45) & (v > 70)
gc[skin0 & (yy < PH * 0.5)] = cv2.GC_FGD
gc[int(PH * 0.62):, int(PW * 0.25):int(PW * 0.85)] = cv2.GC_FGD
b1, f1 = np.zeros((1, 65)), np.zeros((1, 65))
cv2.grabCut(cv2.cvtColor(img, cv2.COLOR_RGB2BGR), gc, None, b1, f1, 10, cv2.GC_INIT_WITH_MASK)
m = np.isin(gc, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.uint8)
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(m)
m = lab == 1 + np.argmax(st[1:, 4])
m = morphology.remove_small_holes(m, max_size=3000)

# ── 2. regiones ──
def clean(r, k=5, mn=300):
    r = cv2.morphologyEx(r.astype(np.uint8), cv2.MORPH_OPEN, np.ones((k, k), np.uint8))
    r = cv2.morphologyEx(r, cv2.MORPH_CLOSE, np.ones((k + 4, k + 4), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(r)
    return np.isin(lab, [i for i in range(1, n) if st[i, 4] >= mn])
skin = clean(m & skin0, 5, 1500)
n, lab, st, _ = cv2.connectedComponentsWithStats(skin.astype(np.uint8))
skin = lab == 1 + np.argmax(st[1:, 4])                     # cara + cuello
skin = morphology.remove_small_holes(skin, max_size=6000)  # barba, boca y ojos quedan adentro
shirt = clean(m & (v > 150) & (s < 60), 3, 300)
tie_c = clean(m & (h >= 100) & (h <= 130) & (s > 105) & (v < 95) & (yy > PH * 0.42), 5, 600)
n, lab, st, _ = cv2.connectedComponentsWithStats(tie_c.astype(np.uint8))
tie = np.zeros_like(m)
if n > 1:  # la corbata es la componente que más toca la camisa
    near_shirt = cv2.dilate(shirt.astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
    k = max(range(1, n), key=lambda i: np.count_nonzero(near_shirt & (lab == i))); tie = lab == k
hair = clean(m & (v < 70) & (yy < PH * 0.42) & ~skin, 5, 1500)
suit = m & ~skin & ~shirt & ~tie & ~hair
REG = {'hair': hair, 'skin': skin, 'shirt': shirt, 'tie': tie, 'suit': suit}

# ── utilidades de polilíneas ──
def simplify(c, tol):
    return cv2.approxPolyDP(np.asarray(c, np.float32).reshape(-1, 1, 2), tol, False).reshape(-1, 2)
def chaikin(c, it=2):
    c = np.asarray(c, np.float32)
    for _ in range(it):
        if len(c) < 3: break
        q = .75 * c[:-1] + .25 * c[1:]; r = .25 * c[:-1] + .75 * c[1:]
        c = np.vstack([c[:1], np.column_stack([q, r]).reshape(-1, 2), c[-1:]])
    return c
def plen(c):
    c = np.asarray(c, float); return float(np.sum(np.hypot(*np.diff(c, axis=0).T))) if len(c) > 1 else 0.0
def split_valid(c, ok, minlen):
    out, cur = [], []
    for p, k in zip(c, ok):
        if k: cur.append(p)
        else:
            if plen(cur) > minlen: out.append(np.array(cur))
            cur = []
    if plen(cur) > minlen: out.append(np.array(cur))
    return out
def at(mask, c):
    return mask[np.clip(c[:, 1].astype(int), 0, PH - 1), np.clip(c[:, 0].astype(int), 0, PW - 1)]

lines = []
def add(layer, c, tol=1.0, it=2, minlen=14):
    c = simplify(c, tol)
    if len(c) >= 2 and plen(c) >= minlen: lines.append((layer, chaikin(c, it) * SC))

notbottom = lambda c: c[:, 1] < PH - 3

# ── 3a. silueta ──
for c in measure.find_contours(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 2.5), 0.5):
    c = c[:, ::-1]
    for seg in split_valid(c, notbottom(c), 60): add(0, seg, 0.8)

# ── 3b. límites entre regiones ──
inner = cv2.erode(m.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
for name in ('hair', 'skin', 'shirt', 'tie'):
    for c in measure.find_contours(cv2.GaussianBlur(REG[name].astype(np.float32), (0, 0), 3), 0.5):
        c = c[:, ::-1]
        for seg in split_valid(c, at(inner, c) & notbottom(c), 30): add(1, seg, 1.0)

# ── 3c. rasgos de la cara (Canny + trazado del esqueleto) ──
def chains(edges, minlen):
    sk = morphology.skeletonize(cv2.dilate(edges.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0)
    nb = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    def deg(y, x):
        return sum(1 for dy, dx in nb if 0 <= y + dy < PH and 0 <= x + dx < PW and sk[y + dy, x + dx])
    ys, xs = np.nonzero(sk); out = []
    for y, x in sorted(zip(ys, xs), key=lambda p: deg(*p)):
        if not sk[y, x]: continue
        path = [(x, y)]; sk[y, x] = False
        while True:
            for dy, dx in nb:
                ny, nx = y + dy, x + dx
                if 0 <= ny < PH and 0 <= nx < PW and sk[ny, nx]:
                    sk[ny, nx] = False; y, x = ny, nx; path.append((x, y)); break
            else: break
        if plen(path) >= minlen: out.append(np.array(path, np.float32))
    return out
# mandíbula: curva de nivel de la sombra entre la cara y el cuello
lumb = cv2.GaussianBlur(gray.astype(np.float32), (0, 0), 4)
jaw_zone = (cv2.erode(skin.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0) & (yy > PH * 0.40) & (yy < PH * 0.60)
for lv in JAW_LEVELS:
    for c in measure.find_contours(lumb, lv):
        c = c[:, ::-1]
        for seg in split_valid(c, at(jaw_zone, c), 70): add(1, seg, 1.2)
face = cv2.erode(skin.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
FS, FLO, FHI, FMIN, FTOL = [float(x) for x in os.environ.get('FACE', '3.2,14,34,34,1.8').split(',')]
e_face = (cv2.Canny(cv2.GaussianBlur(gray, (0, 0), FS), FLO, FHI) > 0) & face
for c in chains(e_face, FMIN):
    # en la zona de la barba (debajo de la boca) solo quedan los trazos largos
    if np.median(c[:, 1]) > PH * 0.43 and plen(c) < 90: continue
    add(1, c, FTOL, 3)
suit_in = cv2.erode(suit.astype(np.uint8), np.ones((11, 11), np.uint8)) > 0
e_suit = (cv2.Canny(cv2.GaussianBlur(gray, (0, 0), 2.6), 14, 34) > 0) & suit_in
for c in chains(e_suit, 70): add(1, c, 1.4)

# ── 3d. flujo: líneas de corriente sobre un campo de orientación suave ──
labimg = np.zeros((PH, PW), np.float32)
for i, k in enumerate(('hair', 'skin', 'shirt', 'tie', 'suit')): labimg[REG[k]] = (i + 1) * 0.25
f = (cv2.GaussianBlur(gray.astype(np.float32) / 255, (0, 0), 4) * 0.5
     + cv2.GaussianBlur(labimg, (0, 0), 5) + cv2.GaussianBlur(m.astype(np.float32), (0, 0), 8))
gx = cv2.Sobel(f, cv2.CV_32F, 1, 0, ksize=5); gy = cv2.Sobel(f, cv2.CV_32F, 0, 1, ksize=5)
SIG = 13
Jxx = cv2.GaussianBlur(gx * gx, (0, 0), SIG); Jyy = cv2.GaussianBlur(gy * gy, (0, 0), SIG)
Jxy = cv2.GaussianBlur(gx * gy, (0, 0), SIG)
ang = 0.5 * np.arctan2(2 * Jxy, Jxx - Jyy) + np.pi / 2
TX, TY = np.cos(ang), np.sin(ang)
# zona donde corre el flujo: todo el cuerpo menos el interior de la cara
dskin = cv2.distanceTransform(skin.astype(np.uint8), cv2.DIST_L2, 5)
flow_ok = inner & ~(dskin > 16)
DSEP, DTEST, CELL = 11.0, 5.5, 3
GH, GW = PH // CELL + 1, PW // CELL + 1
grid = [[[] for _ in range(GW)] for _ in range(GH)]
def near(x, y, d, sid):
    cx, cy, r = int(x / CELL), int(y / CELL), int(d / CELL) + 1
    for j in range(max(0, cy - r), min(GH, cy + r + 1)):
        for i in range(max(0, cx - r), min(GW, cx + r + 1)):
            for px, py, s_ in grid[j][i]:
                if s_ != sid and (px - x) ** 2 + (py - y) ** 2 < d * d: return True
    return False
def trace(x0, y0, sid):
    pts = []
    for sgn in (1, -1):
        x, y, pv, seg = x0, y0, None, []
        for _ in range(1400):
            if not (0 <= x < PW - 1 and 0 <= y < PH - 1) or not flow_ok[int(y), int(x)]: break
            vx, vy = TX[int(y), int(x)], TY[int(y), int(x)]
            if pv is None: vx, vy = vx * sgn, vy * sgn
            elif vx * pv[0] + vy * pv[1] < 0: vx, vy = -vx, -vy
            if seg and near(x, y, DTEST, sid): break
            seg.append((x, y)); pv = (vx, vy); x += vx; y += vy
        pts = seg if sgn == 1 else seg[::-1][:-1] + pts
    return pts
flow, sid, q = [], 0, deque()
for sy in range(8, PH, 29):
    for sx in range(8, PW, 29):
        q.append((sx, sy))
        while q:
            x, y = q.popleft()
            if not (0 <= x < PW - 1 and 0 <= y < PH - 1 and flow_ok[int(y), int(x)]): continue
            if near(x, y, DSEP, -1): continue
            pts = trace(x, y, sid)
            if len(pts) < 24: continue
            for k in range(0, len(pts), 2): grid[int(pts[k][1] / CELL)][int(pts[k][0] / CELL)].append((pts[k][0], pts[k][1], sid))
            flow.append(np.array(pts, np.float32)); sid += 1
            for k in range(0, len(pts), 6):
                x1, y1 = pts[k]; vx, vy = TX[int(y1), int(x1)], TY[int(y1), int(x1)]
                q.append((x1 - vy * DSEP, y1 + vx * DSEP)); q.append((x1 + vy * DSEP, y1 - vx * DSEP))
for c in flow: add(2, c, 1.0, 2, 20)

# ── salida ──
# orden: silueta, rasgos, flujo; cada línea como [capa, x0, y0, x1, y1, ...] con 1 decimal
lines.sort(key=lambda l: l[0])
def num(v):
    r = round(float(v), 1); return str(int(r)) if r == int(r) else str(r)
body = ','.join('[' + str(layer) + ',' + ','.join(num(v) for v in pts.reshape(-1)) + ']' for layer, pts in lines)
js = ('/* Generado por tools/portrait-lines.py a partir de img/profile.webp. No editar a mano. */\n'
      'window.PORTRAIT_LINES={"w":%d,"h":%d,"l":[%s]};\n' % (OW, OH, body))
open(OUT, 'w').write(js)
print('líneas por capa', [sum(1 for l in lines if l[0] == k) for k in range(3)], '· puntos', sum(len(p) for _, p in lines), '· bytes', len(js))

if PREVIEW:
    S = 2; cv = np.zeros((OH * S, OW * S, 3), np.uint8); cv[:] = (18, 10, 10)
    col = {0: (255, 225, 240), 1: (250, 180, 205), 2: (220, 110, 130)}
    for layer, pts in lines:
        cv2.polylines(cv, [np.int32(pts * S)], False, col[layer], 2 if layer == 0 else 1, cv2.LINE_AA)
    cv2.imwrite(PREVIEW, cv)
