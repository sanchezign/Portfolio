"""Genera el mapa de relieve del retrato 3D de "Sobre mí" (img/profile-depth.webp) a partir de
img/profile.webp y de los puntos de la cara (tools/profile-landmarks.json).

Uso:  python3 tools/portrait-depth.py [preview.png]
Requiere: numpy, opencv-python-headless, scikit-image, pillow.

Salida: imagen RGB de 300x400 (sin pérdida), un canal por dato:
  R = profundidad (0 = atrás, 255 = lo más cerca de la cámara)
  G = luminancia de la foto (para teñir la superficie)
  B = máscara de la persona
js/portrait-holo.js arma con eso una malla en relieve y la dibuja con WebGL.

La profundidad no viene de un modelo: se arma a mano con formas simples.
  - cuerpo y cabeza se "inflan" desde su silueta (distancia al borde -> perfil redondeado);
  - la cara suma nariz, pómulos, cejas, labios y mentón, y resta las cuencas de los ojos,
    ubicados con los puntos de la malla facial;
  - un poco de detalle de la foto (pliegues del saco, pelo) para que la superficie no sea lisa.
"""
import json, os, sys
import numpy as np, cv2
from PIL import Image
from skimage import morphology

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'img/profile.webp')
OUT = os.path.join(ROOT, 'img/profile-depth.webp')
PREVIEW = sys.argv[1] if len(sys.argv) > 1 else None

# recorte tipo busto y resolución de trabajo: los puntos de la cara
# (tools/profile-landmarks.json, malla facial de MediaPipe) están en esas coordenadas
CROP = (150, 30, 660, 710)
PW, PH = 765, 1020
OW, OH = 300, 400
src = Image.open(SRC).convert('RGB').crop(CROP)
img = np.array(src.resize((PW, PH), Image.LANCZOS))
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
hsv = cv2.cvtColor(cv2.bilateralFilter(img, 9, 50, 9), cv2.COLOR_RGB2HSV).astype(int)
h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
yy, xx = np.mgrid[:PH, :PW].astype(np.float32)

# ── máscara de la persona: el fondo es gris liso ──
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

LM = np.array(json.load(open(os.path.join(ROOT, 'tools/profile-landmarks.json'))), np.float32)
def P(i): return LM[i]
chin = P(152); top = P(10)
face_w = np.linalg.norm(P(234) - P(454))          # ancho de la cara (pómulo a pómulo)

# ── cabeza y cuerpo ──
neck_y = chin[1] + 0.25 * face_w
fcx = (P(234)[0] + P(454)[0]) / 2
head = m & (yy < neck_y) & (np.abs(xx - fcx) < face_w * 0.8)
n, lab, st, _ = cv2.connectedComponentsWithStats(head.astype(np.uint8))
head = lab == 1 + np.argmax(st[1:, 4])
body = m & ~head

def inflate(mask, radius):
    d = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 5) / radius
    d = np.clip(d, 0, 1)
    return np.sqrt(1 - (1 - d) ** 2)                  # perfil de cuarto de círculo

def gauss(c, sx, sy=None, ang=0.0):
    sy = sx if sy is None else sy
    dx, dy = xx - c[0], yy - c[1]
    ca, sa = np.cos(ang), np.sin(ang)
    u, w = dx * ca + dy * sa, -dx * sa + dy * ca
    return np.exp(-(u * u) / (2 * sx * sx) - (w * w) / (2 * sy * sy))

# cuerpo: hombros redondeados, el pecho adelante
zb = 0.42 * inflate(m, 150) + 0.10 * inflate(m, 60)
zb += 0.05 * gauss((fc0 := ((P(234) + P(454)) / 2)) + [0, face_w * 1.9], face_w * 1.3, face_w * 0.9) * m  # pecho
# cabeza: elipsoide alrededor del centro de la cara, más adelante que el pecho
fc = (P(234) + P(454)) / 2
fc[1] = (top[1] + chin[1]) / 2
rx, ry = face_w * 0.62, (chin[1] - top[1]) * 0.62
ell = np.clip(1 - ((xx - fc[0]) / rx) ** 2 - ((yy - fc[1]) / ry) ** 2, 0, 1)
ell = cv2.GaussianBlur(ell * (2 - ell), (0, 0), 6)
zh = 0.30 + 0.30 * inflate(head, 70) + 0.28 * ell

# rasgos (en fracciones del ancho de la cara)
fw = face_w
nose_tip, bridge = P(4), P(168)
L = np.linalg.norm(nose_tip - bridge); ang = np.arctan2(*(nose_tip - bridge)[::-1])
mid = (nose_tip + bridge) / 2
feat = 0.11 * gauss(mid, L * 0.62, fw * 0.07, ang) * np.clip((yy - bridge[1]) / max(L, 1) * 0.7 + 0.45, 0, 1)
feat += 0.07 * gauss(nose_tip, fw * 0.09, fw * 0.07)              # punta de la nariz
feat += 0.03 * gauss(P(2), fw * 0.14, fw * 0.05)                  # aletas
for ec in (P(468), P(473)):
    feat -= 0.06 * gauss(ec, fw * 0.11, fw * 0.07)                # cuencas
for br in (P(105), P(334)):
    feat += 0.035 * gauss(br, fw * 0.14, fw * 0.05)               # cejas
for ck in (P(50), P(280)):
    feat += 0.035 * gauss(ck, fw * 0.12, fw * 0.10)               # pómulos
feat += 0.035 * gauss((P(13) + P(14)) / 2, fw * 0.15, fw * 0.06)  # labios
feat += 0.04 * gauss(P(152) - [0, fw * 0.08], fw * 0.14, fw * 0.09)  # mentón
zh = zh + feat * np.clip(ell * 4, 0, 1)

# unir cabeza y cuerpo con una transición suave en el cuello
blend = cv2.GaussianBlur(head.astype(np.float32), (0, 0), 14)
z = np.where(m, blend * zh + (1 - blend) * zb, 0).astype(np.float32)
z = np.maximum(z, zb * m)                                          # el cuello no se hunde

# detalle fino de la foto: pasa-altos de la luminancia
hp = gray - cv2.GaussianBlur(gray, (0, 0), 9)
z += 0.06 * cv2.GaussianBlur(hp, (0, 0), 1.5) * m * (1 - 0.7 * np.clip(ell * 4, 0, 1))
z *= inflate(m, 22)                                                # bordes redondeados, sin paredes
z = cv2.GaussianBlur(z, (0, 0), 2.5)
z = np.clip(z / z[m].max(), 0, 1) * m

# ── salida ──
def down(a): return cv2.resize(a.astype(np.float32), (OW, OH), interpolation=cv2.INTER_AREA)
mask_o = down(m)
depth_o = down(z) / np.maximum(mask_o, 1e-3)                       # sin oscurecer el borde
lum = cv2.createCLAHE(2.0, (8, 8)).apply((gray * 255).astype(np.uint8))
lum_o = down(lum / 255)
rgb = np.dstack([depth_o, lum_o, mask_o])
rgb = (np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(rgb).save(OUT, 'WEBP', lossless=True, quality=100, method=6)
print('ok', OUT, os.path.getsize(OUT), 'bytes')
if PREVIEW:
    shade = cv2.normalize(cv2.Laplacian(cv2.GaussianBlur(z, (0, 0), 2), cv2.CV_32F), None, 0, 1, cv2.NORM_MINMAX)
    Image.fromarray((np.hstack([z, shade * m]) * 255).astype(np.uint8)).save(PREVIEW)
