"""Arma el tejón de la miel 3D que usa js/photo-badger.js, todo por código (sin modelos externos):
  img/badger/badger-mesh.bin  posiciones int16, normales int8, uv uint16 e índices uint16
  img/badger/badger-tex.webp  RG = normal map (detalle fino), B = luminancia del pelaje

Cómo: el tejón se describe como una función de distancia (SDF) hecha de formas suaves
(cabeza, cachetes, hocico, nariz, boca, ojos, orejas, cuerpo, brazos, patas, dedos y garras).
Se convierte en malla con marching cubes, se simplifica, se le arman las UV con xatlas y
se hornea en la textura el color (capa clara, cara negra, garras claras, brillo de los ojos)
y el relieve fino (orificios de la nariz, pelaje de la capa, separación de los dedos).

Uso:  python3 tools/badger-build.py img/badger
Requiere: numpy, pillow, scikit-image, fast-simplification, trimesh, xatlas.
Ejes: x a la derecha, y arriba (y = 0 es el corte del cuerpo), z hacia la cámara.
"""
import struct, sys
import numpy as np
from PIL import Image
from skimage.measure import marching_cubes
import fast_simplification, trimesh, xatlas

OUT = sys.argv[1] if len(sys.argv) > 1 else 'img/badger'
H = 0.0036            # tamaño del voxel para marching cubes
TARGET_FACES = 52000  # triángulos después de simplificar
TEX = 1024            # lado de la textura
STRIP = 32            # filas de abajo reservadas (color de los bigotes)

f32 = np.float32
def V(*a): return np.array(a, f32)
def length(v): return np.sqrt((v * v).sum(-1))
def ell(p, c, r):
    q = (p - c) / r
    k0 = length(q); k1 = length(q / r)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)
def sph(p, c, r): return length(p - c) - r
def rcone(p, a, b, ra, rb):
    pa = p - a; ba = b - a
    h = np.clip((pa * ba).sum(-1) / float(ba @ ba), 0, 1)
    return length(pa - ba * h[:, None]) - (ra + (rb - ra) * h)
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)
def smax(a, b, k): return -smin(-a, -b, k)
def mirror(p):
    q = p.copy(); q[:, 0] = np.abs(q[:, 0]); return q
def sstep(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

# ── cabeza base (sirve para ubicar ojos, nariz, boca y colmillos sobre la superficie) ──
def head_base(p):
    m = mirror(p)
    d = ell(p, V(0, 0.452, -0.025), V(0.322, 0.190, 0.245))                         # cráneo ancho y chato
    d = smin(d, ell(m, V(0.120, 0.405, 0.050), V(0.140, 0.110, 0.150)), 0.05)     # cachetes
    d = smin(d, ell(p, V(0, 0.448, 0.110), V(0.100, 0.070, 0.150)), 0.05)          # caña de la nariz
    d = smin(d, ell(p, V(0, 0.402, 0.165), V(0.112, 0.085, 0.140)), 0.05)          # hocico
    d = smin(d, ell(p, V(0, 0.322, 0.185), V(0.075, 0.045, 0.080)), 0.04)          # mentón
    return d

def ray_z(fn, x, y, z0=0.6):
    p = np.array([[x, y, z0]], f32)
    for _ in range(200):
        d = float(fn(p)[0])
        if abs(d) < 1e-5: break
        p[0, 2] -= d
    return float(p[0, 2])

EYE_R = 0.043
EYE = V(0.122, 0.487, ray_z(head_base, 0.122, 0.487) - 0.019)
NOSE_C = V(0, 0.418, ray_z(head_base, 0, 0.418) - 0.018)
MOUTH_Y = 0.352
PHIL_A = V(0, NOSE_C[1] - 0.030, ray_z(head_base, 0, NOSE_C[1] - 0.030))
PHIL_B = V(0, MOUTH_Y, ray_z(head_base, 0, MOUTH_Y))
# boca cerrada en forma de ω (dos arcos), proyectada sobre el hocico
SMILE = []
for i in range(9):
    t = i / 8
    x, y = 0.050 * t, MOUTH_Y - 0.011 * np.sin(np.pi * t) + 0.006 * t
    SMILE.append(V(x, y, ray_z(head_base, x, y)))
FANG_X = 0.025
_fy0, _fy1 = MOUTH_Y - 0.006, MOUTH_Y - 0.030
FANG_A = V(FANG_X, _fy0, ray_z(head_base, FANG_X, _fy0) - 0.004)
FANG_B = V(FANG_X - 0.002, _fy1, max(ray_z(head_base, FANG_X, _fy0), ray_z(head_base, FANG_X, _fy1)) + 0.002)

PAW = V(0.335, 0.060, 0.155)
TOE_DX = (-0.066, -0.022, 0.022, 0.066)
def toe_pos(dx): return V(PAW[0] + dx, 0.073, 0.243 - 3.0 * dx * dx)
def claw_pts(dx):
    t = toe_pos(dx); xi = -0.35 * dx           # la punta se curva hacia el centro de la pata
    prof = [(-0.002, 0.016, 0.0160), (0.002, 0.052, 0.0125), (-0.024, 0.088, 0.0090),
            (-0.064, 0.104, 0.0058), (-0.102, 0.096, 0.0030), (-0.126, 0.074, 0.0007)]
    n = len(prof) - 1
    return [(V(t[0] + xi * (i / n) ** 2, t[1] + oy, t[2] + oz), r) for i, (oy, oz, r) in enumerate(prof)]

def parts(p):
    m = mirror(p)
    P = {}
    P['head'] = head_base(p)
    nose = ell(p, NOSE_C + V(0, 0.010, 0), V(0.068, 0.034, 0.042))                 # parte de arriba
    P['nose'] = smin(nose, ell(m, NOSE_C + V(0.028, -0.010, 0.006), V(0.040, 0.030, 0.036)), 0.02)  # alas
    P['nostril'] = ell(m, NOSE_C + V(0.030, -0.017, 0.036), V(0.014, 0.0075, 0.016))
    P['eye'] = sph(m, EYE, EYE_R)
    P['ear'] = ell(m, V(0.312, 0.505, -0.075), V(0.050, 0.047, 0.028))
    P['earcav'] = ell(m, V(0.318, 0.508, -0.055), V(0.031, 0.029, 0.017))
    mouth = np.full(len(p), 9.0, f32)
    for a_, b_ in zip(SMILE[:-1], SMILE[1:]):
        mouth = np.minimum(mouth, rcone(m, a_, b_, 0.0045, 0.0045))
    P['mouth'] = mouth
    P['phil'] = np.minimum(rcone(p, PHIL_A, PHIL_B, 0.0045, 0.0045),
                           rcone(p, NOSE_C + V(0, -0.004, 0.044), NOSE_C + V(0, -0.036, 0.034), 0.0035, 0.004))
    P['fang'] = rcone(m, FANG_A, FANG_B, 0.0078, 0.0012)
    body = ell(p, V(0, 0.100, -0.055), V(0.312, 0.275, 0.255))
    body = smin(body, ell(p, V(0, 0.225, -0.035), V(0.270, 0.125, 0.210)), 0.06)
    P['body'] = np.maximum(body, -p[:, 1])
    P['arm'] = rcone(m, V(0.215, 0.225, 0.000), V(0.330, 0.088, 0.122), 0.088, 0.070)
    P['paw'] = ell(m, PAW, V(0.110, 0.062, 0.112))
    toes = np.full(len(p), 9.0, f32)
    claws = np.full(len(p), 9.0, f32)
    for dx in TOE_DX:
        toes = np.minimum(toes, sph(m, toe_pos(dx), 0.031))
        c = claw_pts(dx)
        for (a_, ra), (b_, rb) in zip(c[:-1], c[1:]):
            claws = np.minimum(claws, rcone(m, a_, b_, ra, rb))
    P['toe'] = toes
    P['claw'] = claws
    return P

def combine(P):
    d = smin(P['head'], P['nose'], 0.012)
    d = smax(d, -P['nostril'], 0.005)
    d = smax(d, -P['phil'], 0.003)
    d = smax(d, -P['mouth'], 0.003)
    d = smin(d, P['fang'], 0.002)
    d = smin(d, P['eye'], 0.008)
    ear = smax(P['ear'], -P['earcav'], 0.012)
    d = smin(d, ear, 0.025)
    d = smin(d, P['body'], 0.07)
    d = smin(d, P['arm'], 0.045)
    paw = smin(P['paw'], P['toe'], 0.016)
    d = smin(d, paw, 0.03)
    d = smin(d, P['claw'], 0.006)
    return d

def sdf(p): return combine(parts(p))

def grad(p, e=0.0008):
    g = np.zeros_like(p)
    for i in range(3):
        o = np.zeros(3, f32); o[i] = e
        g[:, i] = (sdf(p + o) - sdf(p - o)) / (2 * e)
    return g / np.maximum(length(g), 1e-9)[:, None]

# ── bigotes: tubos finos que se suman a la malla después de armar las UV ──
def whiskers():
    P, N, F = [], [], []
    seg, ring = 18, 6
    for side in (-1, 1):
        for k in range(3):
            y0 = 0.414 - 0.017 * k
            x0 = 0.082 + 0.006 * k
            root = np.array([x0, y0, ray_z(head_base, x0, y0) - 0.004])
            tilt = (0.035, 0.0, -0.035)[k]
            pts = []
            for i in range(seg + 1):
                t = i / seg
                pts.append(root + np.array([0.15 * t, tilt * t - 0.03 * t * t, 0.012 * t - 0.05 * t * t]))
            pts = np.array(pts); pts[:, 0] *= side
            base = sum(len(q) for q in P)
            ring_p, ring_n = [], []
            for i in range(seg + 1):
                tg = pts[min(i + 1, seg)] - pts[max(i - 1, 0)]; tg /= np.linalg.norm(tg)
                a = np.cross(tg, [0, 0, 1.0]); a /= np.linalg.norm(a); b = np.cross(tg, a)
                r = 0.0034 * (1 - i / seg) + 0.0008
                for j in range(ring):
                    ang = 2 * np.pi * j / ring
                    nn = np.cos(ang) * a + np.sin(ang) * b
                    ring_p.append(pts[i] + r * nn); ring_n.append(nn)
            for i in range(seg):
                for j in range(ring):
                    a0 = base + i * ring + j; a1 = base + i * ring + (j + 1) % ring
                    b0, b1 = a0 + ring, a1 + ring
                    F += [[a0, b0, a1], [a1, b0, b1]] if side > 0 else [[a0, a1, b0], [a1, b1, b0]]
            P.append(np.array(ring_p)); N.append(np.array(ring_n))
    return np.concatenate(P).astype(f32), np.concatenate(N).astype(f32), np.array(F, np.uint32)

# ── color (luminancia) del pelaje ──
CREAM, DARK = 0.93, 0.17
def albedo(p, n):
    P = parts(p)
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    ax = np.abs(x)
    phi = np.degrees(np.arctan2(ax, z + 0.03))                 # 0 = de frente, 90 = costado
    # cara negra: banda de los ojos hasta las orejas y cara que se angosta hacia el hocico;
    # la capa clara cubre el cráneo y baja por los costados de la cara
    yb = 0.548 + 0.040 * sstep(phi, 40, 100) + 0.004 * np.sin(phi * 0.45) + 0.004 * np.sin(ax * 140.0)
    face_w = np.interp(y, [0.24, 0.30, 0.36, 0.42, 0.452, 0.478, 0.60], [42, 42, 46, 52, 60, 112, 112])
    face_w = face_w + 2.5 * np.sin(y * 160.0)                   # borde con mechones
    in_face = sstep(yb - y, -0.006, 0.006) * sstep(face_w - phi, -3, 3)
    # pecho negro entre los brazos, costados claros (la capa baja por los flancos)
    chest_w = np.interp(y, [0.0, 0.12, 0.24], [44, 42, 44]) + 2.0 * np.sin(y * 140.0)
    in_chest = sstep(0.27 - y, -0.01, 0.01) * sstep(chest_w - phi, -3, 3)
    dark = np.maximum(in_face, in_chest)
    limbs = np.maximum(sstep(0.03 - P['arm'], 0, 0.02), sstep(0.03 - np.minimum(P['paw'], P['toe']), 0, 0.03))
    dark = np.maximum(dark, limbs)
    a = CREAM + (DARK - CREAM) * dark
    # orejas: borde claro, adentro oscuro
    ear = sstep(0.006 - P['ear'], 0, 0.01)
    cav = sstep(0.004 - P['earcav'], 0, 0.008)
    a = np.where(ear > 0, a * (1 - ear) + (CREAM * (1 - cav) + 0.16 * cav) * ear, a)
    # nariz, boca, colmillos, garras, ojos
    nose = sstep(0.006 - np.minimum(P['nose'], P['nostril']), 0, 0.006)
    a = a + (0.06 - a) * nose
    a = a + (0.04 - a) * sstep(0.004 - np.minimum(P['mouth'], P['phil']), 0, 0.004) * (1 - nose)
    a = a + (0.95 - a) * sstep(0.003 - P['fang'], 0, 0.003)
    a = a + (0.90 - a) * sstep(0.004 - P['claw'], 0, 0.004)
    eye = sstep(0.004 - P['eye'], 0, 0.004)
    a = a + (0.03 - a) * eye
    m = mirror(p)
    ed = (m - EYE) / EYE_R
    ed = ed / np.maximum(length(ed), 1e-9)[:, None]
    hl = sstep((ed * V(-0.42, 0.55, 0.72) / np.linalg.norm([-0.42, 0.55, 0.72])).sum(-1), 0.93, 0.95)
    hl2 = sstep((ed * V(0.35, -0.35, 0.87) / np.linalg.norm([0.35, -0.35, 0.87])).sum(-1), 0.975, 0.985) * 0.6
    a = a + (1.0 - a) * eye * np.maximum(hl, hl2)
    nd = (p - NOSE_C - V(0, 0.010, 0)) / V(0.068, 0.034, 0.042)
    nd = nd / np.maximum(length(nd), 1e-9)[:, None]
    nhl = sstep((nd * V(-0.3, 0.8, 0.5) / np.linalg.norm([-0.3, 0.8, 0.5])).sum(-1), 0.92, 0.97)
    a = a + (0.5 - a) * nose * nhl
    return np.clip(a, 0, 1)

# ── pelaje: surcos finos en la capa (solo para el normal map) ──
def fur_normal(p, n, a):
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    phi = np.arctan2(x, z + 0.03)
    s = np.sin(phi * 70.0 + 18.0 * y + 3.0 * np.sin(y * 31.0)) * np.sin(y * 9.0 + phi * 5.0) ** 2
    w = sstep(a, 0.6, 0.85) * 0.18                       # solo en la parte clara
    t = np.stack([np.cos(phi), np.zeros_like(phi), -np.sin(phi)], -1)   # tangente horizontal
    nn = n + (w * s)[:, None] * t
    return nn / length(nn)[:, None]

def main():
    xs = np.arange(-0.48, 0.48 + H, H, dtype=f32)
    ys = np.arange(-0.06, 0.74 + H, H, dtype=f32)
    zs = np.arange(-0.34, 0.39 + H, H, dtype=f32)
    vol = np.empty((len(xs), len(ys), len(zs)), f32)
    YY, ZZ = np.meshgrid(ys, zs, indexing='ij')
    for i, xv in enumerate(xs):
        pts = np.stack([np.full(YY.size, xv, f32), YY.ravel(), ZZ.ravel()], -1)
        vol[i] = sdf(pts).reshape(YY.shape)
    print('grid', vol.shape)
    verts, faces, _, _ = marching_cubes(vol, 0.0, spacing=(H, H, H), gradient_direction='ascent')
    verts = (verts + V(xs[0], ys[0], zs[0])).astype(np.float64)
    print('marching cubes', len(verts), len(faces))
    red = 1 - TARGET_FACES / len(faces)
    verts, faces = fast_simplification.simplify(verts, faces, target_reduction=red, agg=6)
    mesh = trimesh.Trimesh(verts, faces, process=True)
    # orientación: normales hacia afuera
    g = grad(mesh.vertices.astype(f32))
    if (mesh.vertex_normals * g).sum(1).mean() < 0: mesh.invert()
    verts, faces, vn = mesh.vertices.astype(f32), mesh.faces, mesh.vertex_normals.astype(f32)
    print('simplificado', len(verts), len(faces))

    atlas = xatlas.Atlas()
    atlas.add_mesh(verts, faces)
    po = xatlas.PackOptions(); po.resolution = TEX; po.padding = 4; po.bilinear = True
    co = xatlas.ChartOptions()
    atlas.generate(co, po)
    vmap, idx, uv = atlas[0]
    P3, N3 = verts[vmap], vn[vmap]
    uv = uv.astype(f32)
    uv[:, 1] *= (TEX - STRIP) / TEX            # deja libre la franja de abajo para los bigotes
    print('con uv', len(P3), len(idx))
    assert len(P3) < 65536

    # ── horneado de la textura ──
    tex_a = np.zeros((TEX, TEX), f32); tex_n = np.zeros((TEX, TEX, 2), f32); got = np.zeros((TEX, TEX), bool)
    T_i, T_t, T_b = [], [], []
    for t, (i0, i1, i2) in enumerate(idx):
        u = uv[[i0, i1, i2]] * TEX - 0.5
        lo = np.floor(u.min(0)).astype(int) - 1; hi = np.ceil(u.max(0)).astype(int) + 1
        lo = np.clip(lo, 0, TEX - 1); hi = np.clip(hi, 0, TEX - 1)
        gx, gy = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1))
        q = np.stack([gx.ravel(), gy.ravel()], -1).astype(f32)
        e1, e2 = u[1] - u[0], u[2] - u[0]
        den = e1[0] * e2[1] - e1[1] * e2[0]
        if abs(den) < 1e-12: continue
        r = q - u[0]
        b1 = (r[:, 0] * e2[1] - r[:, 1] * e2[0]) / den
        b2 = (e1[0] * r[:, 1] - e1[1] * r[:, 0]) / den
        b0 = 1 - b1 - b2
        ok = (b0 >= -0.02) & (b1 >= -0.02) & (b2 >= -0.02)
        if not ok.any(): continue
        T_i.append(q[ok].astype(np.int32)); T_t.append(np.full(ok.sum(), t, np.int32))
        T_b.append(np.clip(np.stack([b0[ok], b1[ok], b2[ok]], -1), 0, 1))
    Q = np.concatenate(T_i); TT = np.concatenate(T_t); BB = np.concatenate(T_b)
    BB /= BB.sum(1, keepdims=True)
    tri = idx[TT]
    p = (P3[tri] * BB[:, :, None]).sum(1)
    n = (N3[tri] * BB[:, :, None]).sum(1); n /= length(n)[:, None]
    for _ in range(2):                                 # proyecta a la superficie real
        d = sdf(p); p = p - d[:, None] * grad(p)
    nh = grad(p)
    a = albedo(p, nh)
    nh = fur_normal(p, nh, a)
    # marco tangente como en el shader: gradientes de u y v sobre el triángulo
    A, B_, C = P3[tri[:, 0]], P3[tri[:, 1]], P3[tri[:, 2]]
    ua, ub, uc = uv[tri[:, 0]], uv[tri[:, 1]], uv[tri[:, 2]]
    e1, e2 = B_ - A, C - A
    d1, d2 = ub - ua, uc - ua
    g11 = (e1 * e1).sum(1); g12 = (e1 * e2).sum(1); g22 = (e2 * e2).sum(1)
    det = g11 * g22 - g12 * g12
    det = np.where(np.abs(det) < 1e-20, 1e-20, det)
    def surf_grad(k):
        a_ = (g22 * d1[:, k] - g12 * d2[:, k]) / det
        b_ = (g11 * d2[:, k] - g12 * d1[:, k]) / det
        return e1 * a_[:, None] + e2 * b_[:, None]
    Tg, Bg = surf_grad(0), surf_grad(1)
    sc = 1 / np.sqrt(np.maximum((Tg * Tg).sum(1), (Bg * Bg).sum(1)))
    M = np.stack([Tg * sc[:, None], Bg * sc[:, None], n], -1)       # columnas
    mN = np.linalg.solve(M, nh[:, :, None])[:, :, 0]
    mN[:, 2] = np.maximum(mN[:, 2], 0.05)
    mN /= length(mN)[:, None]
    cx, cy = Q[:, 0], Q[:, 1]
    tex_a[cy, cx] = a; tex_n[cy, cx] = mN[:, :2]; got[cy, cx] = True
    # dilata para que no se vean costuras
    for _ in range(8):
        acc_a = np.zeros_like(tex_a); acc_n = np.zeros_like(tex_n); cnt = np.zeros_like(tex_a)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0: continue
                sg = np.roll(np.roll(got, dy, 0), dx, 1)
                acc_a += np.roll(np.roll(tex_a, dy, 0), dx, 1) * sg
                acc_n += np.roll(np.roll(tex_n, dy, 0), dx, 1) * sg[..., None]
                cnt += sg
        new = (~got) & (cnt > 0)
        tex_a[new] = acc_a[new] / cnt[new]; tex_n[new] = acc_n[new] / cnt[new][:, None]
        got |= new
    tex_a[~got] = DARK
    tex_a[TEX - STRIP:] = 0.95; tex_n[TEX - STRIP:] = 0; got[TEX - STRIP:] = True
    rgb = np.dstack([(tex_n[..., 0] * 0.5 + 0.5) * 255, (tex_n[..., 1] * 0.5 + 0.5) * 255, tex_a * 255])
    rgb[~got, 0] = 128; rgb[~got, 1] = 128
    Image.fromarray(np.round(rgb).clip(0, 255).astype(np.uint8)).save(OUT + '/badger-tex.webp', 'WEBP', quality=90, method=6)

    # ── malla: cuerpo + bigotes ──
    wp, wn, wf = whiskers()
    wuv = np.tile(np.array([[0.5, 1 - STRIP / 2 / TEX]], f32), (len(wp), 1))
    idx = np.concatenate([idx, wf + len(P3)])
    P3 = np.concatenate([P3, wp]); N3 = np.concatenate([N3, wn]); uv = np.concatenate([uv, wuv])
    assert len(P3) < 65536
    mn, mx = P3.min(0), P3.max(0)
    print('bbox', mn, mx)
    q = np.round((P3 - mn) / (mx - mn) * 65535 - 32768).astype(np.int16)
    nq = np.zeros((len(N3), 4), np.int8); nq[:, :3] = np.round(N3 * 127)
    uq = np.round(np.clip(uv, 0, 1) * 65535).astype(np.uint16)
    pos = q.tobytes(); pos += b'\0' * (-len(pos) % 4)
    hdr = struct.pack('<8f', len(P3), idx.size, *mn, *mx)
    open(OUT + '/badger-mesh.bin', 'wb').write(hdr + pos + nq.tobytes() + uq.tobytes() + idx.astype(np.uint16).tobytes())
    print('listo')

if __name__ == '__main__':
    main()
