"""Convierte el modelo de la nutria (apolo.glb de otterslabs.dev) en los archivos que usa
js/photo-otter.js:
  img/otter/otter-mesh.bin  posiciones int16, normales int8, uv uint16 e índices uint16
  img/otter/otter-tex.webp  RG = normal map, B = luminancia del color base

Uso:  python3 tools/otter-pack.py apolo.glb img/otter
Requiere: numpy, pillow.
"""
import struct, json, io, sys
import numpy as np
from PIL import Image
src, outdir = sys.argv[1], sys.argv[2]
d = open(src, 'rb').read()
cl, = struct.unpack('<I', d[12:16]); j = json.loads(d[20:20 + cl])
off = 20 + cl; bl, = struct.unpack('<I', d[off:off + 4]); B = d[off + 8:off + 8 + bl]
def acc(i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]; dt = {5126: np.float32, 5125: np.uint32}[a['componentType']]
    o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    st = bv.get('byteStride')
    if st:
        raw = np.frombuffer(B, np.uint8, st * (a['count'] - 1) + 4 * n, o)
        r = np.lib.stride_tricks.as_strided(raw, (a['count'], 4 * n), (st, 1)).copy().view(dt)
        return r.astype(np.float64)
    r = np.frombuffer(B, dt, a['count'] * n, o)
    return r.reshape(-1, n).astype(np.float64) if n > 1 else r
def img(i):
    bv = j['bufferViews'][j['images'][i]['bufferView']]; o = bv.get('byteOffset', 0)
    return Image.open(io.BytesIO(B[o:o + bv['byteLength']])).convert('RGB')
P, N, UV, I = acc(0), acc(1), acc(2), acc(3)
nd = j['nodes'][0]; x, y, z, w = nd['rotation']
R = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
              [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
              [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
s = np.array(nd['scale']); t = np.array(nd['translation'])
P = (P * s) @ R.T + t
N = N @ R.T; N /= np.linalg.norm(N, axis=1, keepdims=True)
print('raw min y', P[:, 1].min())
mn, mx = P.min(0), P.max(0)
print('bbox', mn, mx, 'uv', UV.min(0), UV.max(0), 'verts', len(P), 'idx', len(I), 'maxidx', I.max())
q = np.round((P - mn) / (mx - mn) * 65535 - 32768).astype(np.int16)
nq = np.zeros((len(N), 4), np.int8); nq[:, :3] = np.round(N * 127)
uq = np.round(np.clip(UV, 0, 1) * 65535).astype(np.uint16)
idx = I.astype(np.uint16)
pos = q.tobytes(); pos += b'\0' * (-len(pos) % 4)
hdr = struct.pack('<8f', len(P), len(I), *mn, *mx)
open(outdir + '/otter-mesh.bin', 'wb').write(hdr + pos + nq.tobytes() + uq.tobytes() + idx.tobytes())
# textura: RG = normal map (tangente), B = luminancia del color base
nm = np.array(img(2 if j['materials'][0]['normalTexture']['index'] == 1 and j['textures'][1]['source'] == 2 else 1), np.float32)
base = np.array(img(0), np.float32)
lum = base @ np.array([0.299, 0.587, 0.114])
out = np.dstack([nm[..., 0], nm[..., 1], lum]).clip(0, 255).astype(np.uint8)
Image.fromarray(out).save(outdir + '/otter-tex.webp', 'WEBP', quality=88, method=6)
print('normal tex source', j['textures'][1]['source'], j['images'][j['textures'][1]['source']]['name'])
