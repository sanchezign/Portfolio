"""Convierte el modelo 3D del tejón (.glb sin textura, generado a partir de una imagen de
referencia) en los archivos que usa js/photo-badger.js:
  img/badger/badger-mesh.bin  posiciones int16, normales int8 (la cuarta marca garras), uv uint16 e índices uint16
  img/badger/badger-tex.webp  RG = normal map (plano), B = luminancia del pelaje

Pasos: se queda con la parte de adelante (cabeza, pecho y patas), lo escala y ubica como el
modelo anterior (patas en y = 0, mirando hacia +z), arma las UV con xatlas y pinta el color
proyectando de frente la imagen de referencia (sin fondo) sobre el modelo.

Uso:  python3 tools/badger-pack.py tejon.glb referencia-sin-fondo.png img/badger
Requiere: numpy, pillow, trimesh, xatlas, fast-simplification.
"""
import struct, sys
import numpy as np
from PIL import Image
import trimesh, xatlas, fast_simplification

SRC, REF, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
CUT_Z = 0.55       # descarta el cuerpo de atrás (en unidades del .glb)
SCALE = 2.1        # ancho final ≈ 0,9 como el modelo anterior
TEX = 1024
STRIP = 32

m = trimesh.load(SRC).to_geometry()
keep = m.vertices[m.faces].mean(1)[:, 2] > CUT_Z
m = trimesh.Trimesh(m.vertices, m.faces[keep], process=True)
m.remove_unreferenced_vertices()
v = m.vertices.copy()
v[:, 0] -= (v[:, 0].min() + v[:, 0].max()) / 2
v[:, 1] -= v[:, 1].min()
v[:, 2] -= v[:, 2].max()
v *= SCALE
v[:, 2] += 0.37
m = trimesh.Trimesh(v, m.faces, process=False)
trimesh.smoothing.filter_taubin(m, lamb=0.5, nu=-0.53, iterations=12)   # quita el escalonado
m = m.subdivide_loop(1)                                                    # silueta más suave
sv, sf = fast_simplification.simplify(m.vertices, m.faces, target_reduction=1 - 46000 / len(m.faces), agg=5)
m = trimesh.Trimesh(sv, sf, process=True)                                  # liviano para la web
verts, faces, vn = m.vertices.astype(np.float32), m.faces, m.vertex_normals.astype(np.float32)
print('malla', len(verts), len(faces), m.bounds)

# ── retoques de forma: hocico más largo y cabeza más grande ──
def sst(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
HEAD_PIV, HEAD_GROW, SNOUT, HEAD_LIFT = np.array([0, 0.24, 0.0], np.float32), 0.14, 0.09, 0.08
def deform(p):
    p = p.copy()
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    ws = sst(z, 0.14, 0.30) * (1 - sst(np.abs(x), 0.10, 0.20)) * sst(y, 0.17, 0.24) * (1 - sst(y, 0.50, 0.58))
    p[:, 2] += SNOUT * ws
    hw = sst(y, 0.17, 0.31) * sst(z, -0.30, -0.05) * (1 - sst(np.abs(x), 0.26, 0.40))
    p = HEAD_PIV + (p - HEAD_PIV) * (1 + HEAD_GROW * hw)[:, None]
    # sube la cabeza para que la mandíbula de abajo no quede tapada por el borde de la foto
    lift = sst(y, 0.10, 0.24) * sst(z, -0.30, -0.05) * (1 - sst(np.abs(x), 0.26, 0.40))
    p[:, 1] += HEAD_LIFT * lift
    return p
verts_o, vn_o = verts, vn
verts = deform(verts_o).astype(np.float32)
vn = trimesh.Trimesh(verts, faces, process=False).vertex_normals.astype(np.float32)

atlas = xatlas.Atlas()
atlas.add_mesh(verts, faces)
po = xatlas.PackOptions(); po.resolution = TEX; po.padding = 4; po.bilinear = True
atlas.generate(xatlas.ChartOptions(), po)
vmap, idx, uv = atlas[0]
P3, N3, uv = verts[vmap], vn[vmap], uv.astype(np.float32)
P3o, N3o = verts_o[vmap], vn_o[vmap]          # posiciones antes del retoque: para el color
uv[:, 1] *= (TEX - STRIP) / TEX              # franja de abajo libre: color claro de colmillos y garras
print('con uv', len(P3), len(idx))
assert len(P3) < 65536

# ── imagen de referencia: luminancia y silueta ──
ref = np.asarray(Image.open(REF).convert('RGBA')).astype(np.float32) / 255
lum_img = ref[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
alpha = ref[..., 3]
ys, xs = np.nonzero(alpha > 0.5)
ib = (xs.min(), xs.max(), ys.min(), ys.max())
# silueta de frente del modelo (solo lo que mira a la cámara)
front = P3o[N3o[:, 2] > 0.2]
mb = (front[:, 0].min(), front[:, 0].max(), front[:, 1].min(), front[:, 1].max())
def project(p):
    u = ib[0] + (p[:, 0] - mb[0]) / (mb[1] - mb[0]) * (ib[1] - ib[0])
    w = ib[3] - (p[:, 1] - mb[2]) / (mb[3] - mb[2]) * (ib[3] - ib[2])
    return u, w
def sample(u, w):
    H, W = lum_img.shape
    u = np.clip(u, 0, W - 1.001); w = np.clip(w, 0, H - 1.001)
    x0, y0 = u.astype(int), w.astype(int); fx, fy = u - x0, w - y0
    def g(a): return (a[y0, x0] * (1 - fx) * (1 - fy) + a[y0, x0 + 1] * fx * (1 - fy) +
                      a[y0 + 1, x0] * (1 - fx) * fy + a[y0 + 1, x0 + 1] * fx * fy)
    return g(lum_img * alpha), g(alpha)

# ── horneado ──
tex_a = np.zeros((TEX, TEX), np.float32); got = np.zeros((TEX, TEX), bool)
Qs, Ts, Bs = [], [], []
for t, (i0, i1, i2) in enumerate(idx):
    u = uv[[i0, i1, i2]] * TEX - 0.5
    lo = np.clip(np.floor(u.min(0)).astype(int) - 1, 0, TEX - 1); hi = np.clip(np.ceil(u.max(0)).astype(int) + 1, 0, TEX - 1)
    gx, gy = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1))
    q = np.stack([gx.ravel(), gy.ravel()], -1).astype(np.float32)
    e1, e2 = u[1] - u[0], u[2] - u[0]
    den = e1[0] * e2[1] - e1[1] * e2[0]
    if abs(den) < 1e-12: continue
    r = q - u[0]
    b1 = (r[:, 0] * e2[1] - r[:, 1] * e2[0]) / den; b2 = (e1[0] * r[:, 1] - e1[1] * r[:, 0]) / den; b0 = 1 - b1 - b2
    ok = (b0 >= -0.02) & (b1 >= -0.02) & (b2 >= -0.02)
    if not ok.any(): continue
    Qs.append(q[ok].astype(np.int32)); Ts.append(np.full(ok.sum(), t, np.int32))
    Bs.append(np.clip(np.stack([b0[ok], b1[ok], b2[ok]], -1), 0, 1))
Q = np.concatenate(Qs); TT = np.concatenate(Ts); BB = np.concatenate(Bs); BB /= BB.sum(1, keepdims=True)
tri = idx[TT]
p = (P3o[tri] * BB[:, :, None]).sum(1)
l, a = sample(*project(p))
lum = np.where(a > 0.05, l / np.maximum(a, 1e-3), 0.2)
tex_a[Q[:, 1], Q[:, 0]] = lum; got[Q[:, 1], Q[:, 0]] = True
for _ in range(8):
    acc = np.zeros_like(tex_a); cnt = np.zeros_like(tex_a)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx or dy:
                sg = np.roll(np.roll(got, dy, 0), dx, 1)
                acc += np.roll(np.roll(tex_a, dy, 0), dx, 1) * sg; cnt += sg
    new = (~got) & (cnt > 0); tex_a[new] = acc[new] / cnt[new]; got |= new
tex_a[~got] = 0.2
tex_a[TEX - STRIP:] = 0.95
rgb = np.dstack([np.full_like(tex_a, 128), np.full_like(tex_a, 128), tex_a * 255])
Image.fromarray(np.round(rgb).clip(0, 255).astype(np.uint8)).save(OUT + '/badger-tex.webp', 'WEBP', quality=90, method=6)

# ── colmillos y garras: tubos curvos que se suman a la malla ──
def tube(pts, radii, ring=8, seg=20):
    pts = np.asarray(pts, np.float64); radii = np.asarray(radii, np.float64)
    t = np.linspace(0, 1, len(pts)); ts = np.linspace(0, 1, seg + 1)
    C = np.stack([np.interp(ts, t, pts[:, k]) for k in range(3)], -1)
    for _ in range(2):                                  # suaviza la curva
        C[1:-1] = (C[:-2] + 2 * C[1:-1] + C[2:]) / 4
    R = np.interp(ts, t, radii)
    V, N = [], []
    for i in range(seg + 1):
        tg = C[min(i + 1, seg)] - C[max(i - 1, 0)]; tg /= np.linalg.norm(tg)
        a = np.cross(tg, [1.0, 0, 0]); a /= np.linalg.norm(a); b = np.cross(tg, a)
        for j in range(ring):
            g = 2 * np.pi * j / ring; nn = np.cos(g) * a + np.sin(g) * b
            V.append(C[i] + R[i] * nn); N.append(nn)
    F = []
    for i in range(seg):
        for j in range(ring):
            a0 = i * ring + j; a1 = i * ring + (j + 1) % ring
            F += [[a0, a1 + ring, a1], [a0, a0 + ring, a1 + ring]]
    return np.array(V, np.float32), np.array(N, np.float32), np.array(F, np.int64)
def surf_z(x, y, r=0.012):                         # z de la superficie de adelante en (x, y)
    d = np.hypot(verts_o[:, 0] - x, verts_o[:, 1] - y)
    return float(verts_o[d < r, 2].max())
def img_to_model(u, w):
    x = mb[0] + (u - ib[0]) / (ib[1] - ib[0]) * (mb[1] - mb[0])
    y = mb[2] + (ib[3] - w) / (ib[3] - ib[2]) * (mb[3] - mb[2])
    return x, y
extra = []
for u in (209.0, 264.0):                               # colmillos de arriba (posición en la imagen)
    x, y = img_to_model(u, 233.0)
    z0 = surf_z(x, y) - 0.006
    L = 0.06
    zt = max(z0 + 0.004, surf_z(x, y - L) + 0.01)
    pts = np.array([[x, y + 0.012, z0 - 0.01], [x, y, z0], [x, y - L * 0.5, (z0 + zt) / 2 + 0.004], [x, y - L, zt - 0.004]])
    extra.append(tube(deform(pts.astype(np.float32)), [0.012, 0.011, 0.007, 0.0008]) + (False,))
for u in (224.0, 252.0):                               # colmillos de abajo: salen de la mandíbula hacia arriba
    x, y = img_to_model(u, 284.0)
    z0 = surf_z(x, y) - 0.002
    L = 0.065
    pts = np.array([[x, y - 0.012, z0 - 0.01], [x, y, z0], [x, y + L * 0.5, z0 + 0.01], [x, y + L, z0 + 0.006]])
    extra.append(tube(deform(pts.astype(np.float32)), [0.014, 0.013, 0.0085, 0.001]) + (False,))
PAWY = 0.05
for sgn in (-1, 1):                                    # garras: 4 por pata, curvas, en abanico y colgando sobre el borde
    pv = verts_o[(verts_o[:, 1] < 0.1) & (verts_o[:, 2] > 0.15) & (sgn * verts_o[:, 0] > 0.06)]
    a, b = np.sort(np.abs(pv[:, 0]))[[int(len(pv) * 0.05), int(len(pv) * 0.95)]]
    cx = sgn * (a + b) / 2
    for f, ln in ((0.18, 0.85), (0.39, 1.0), (0.61, 1.0), (0.82, 0.85)):
        x = sgn * (a + (b - a) * f)
        z0 = surf_z(x, PAWY) - 0.012
        fan = (x - cx) * 0.45
        pts = np.array([[x, PAWY, z0], [x + fan * 0.15, PAWY + 0.008, z0 + 0.04], [x + fan * 0.45, PAWY - 0.025 * ln, z0 + 0.08],
                        [x + fan * 0.8, PAWY - 0.075 * ln, z0 + 0.09], [x + fan, PAWY - 0.115 * ln, z0 + 0.06]])
        extra.append(tube(pts, [0.014, 0.012, 0.0085, 0.0045, 0.0008]) + (True,))
suv = np.array([0.5, 1 - STRIP / 2 / TEX], np.float32)
claw = np.zeros(len(P3), bool)
for V, N, F, is_claw in extra:
    claw = np.concatenate([claw, np.full(len(V), is_claw)])
    idx = np.concatenate([idx, (F + len(P3)).astype(idx.dtype)])
    P3 = np.concatenate([P3, V]); N3 = np.concatenate([N3, N]); uv = np.concatenate([uv, np.tile(suv, (len(V), 1))])
assert len(P3) < 65536

mn, mx = P3.min(0), P3.max(0)
print('bbox', mn, mx)
q = np.round((P3 - mn) / (mx - mn) * 65535 - 32768).astype(np.int16)
nq = np.zeros((len(N3), 4), np.int8); nq[:, :3] = np.round(N3 * 127); nq[claw, 3] = 127   # w marca las garras
uq = np.round(np.clip(uv, 0, 1) * 65535).astype(np.uint16)
pos = q.tobytes(); pos += b'\0' * (-len(pos) % 4)
hdr = struct.pack('<8f', len(P3), idx.size, *mn, *mx)
open(OUT + '/badger-mesh.bin', 'wb').write(hdr + pos + nq.tobytes() + uq.tobytes() + idx.astype(np.uint16).tobytes())
print('listo')
