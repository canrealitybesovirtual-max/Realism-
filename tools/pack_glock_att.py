# Packs the Glock 17 attachment models (CQC step 100) from the user's packs in cqc/models/src/ into one small GLB:
#   dot      Hex Dragonfly class pistol red dot (attachments_light_sup_scope.glb "Scope.001"), scaled to 45.5 x 28.7 mm
#            (RMR footprint size), turned to face -z (the muzzle); its lens is split off as node "dotGlass" (the rear flat
#            face only: the game draws the reticle on it); the domed front face of the lens is dropped.
#   canMD3   pistol suppressor, full size (silencers_pack_1.glb MD3), 34 mm x 148 mm
#   canSB100 pistol suppressor, compact (silencers_pack_1.glb SB100), 34 mm x 114 mm; decals and the perforation decal dropped
#   comp     thread-on compensator (weapon_accessories.glb "Compensator 1"), 22 mm x 48.5 mm, ports turned to the top
# Every part: metres, origin = the face that mates with the gun (the dot: the middle of its footprint, on its base; a can /
# the comp: the middle of its rear face), body toward -z. Vertices, normals and tangents are baked (no node transforms).
# Re-finish: base colour pressed to a dark cerakote (luminance kept as wear, 11-31 % sRGB, a hint of the original hue),
# roughness 0.45-0.60 from the source, metalness 0.8 (steel cans, comp) / 0.7 (the anodised dot); AO kept where the
# source packs it (ORM); normal maps kept. Textures re-encoded as WebP (cropped to the part's UV island first).
# python3 tools/pack_glock_att.py            (run from the repo root; writes cqc/models/att/g17-att.glb)
import json, struct, io, os, sys
import numpy as np
from PIL import Image

SRC = 'cqc/models/src/'
OUT = 'cqc/models/att/g17-att.glb'


def load(p):
    b = open(p, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L]); off = 20 + L
    BL = struct.unpack('<I', b[off:off + 4])[0]; return j, b[off + 8: off + 8 + BL]


def acc(j, binb, i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a['componentType']]
    o = v.get('byteOffset', 0) + a.get('byteOffset', 0); st = v.get('byteStride', 0); isz = np.dtype(dt).itemsize * n
    if st and st != isz:
        arr = np.frombuffer(binb[o:o + st * a['count']], dtype=np.uint8).reshape(a['count'], st)[:, :isz].copy().view(dt).reshape(a['count'], n)
    else:
        arr = np.frombuffer(binb[o:o + isz * a['count']], dtype=dt).reshape(a['count'], n)
    return arr.astype(np.float64) if dt == np.float32 else arr.astype(np.int64)


def mat4(n):
    if 'matrix' in n: return np.array(n['matrix'], dtype=np.float64).reshape(4, 4).T
    T = np.eye(4); t = n.get('translation', [0, 0, 0]); r = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
    x, y, z, w = r
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    T[:3, :3] = R * np.array(s); T[:3, 3] = t; return T


def find(j, binb, sub):
    out = []
    def rec(i, M, path):
        n = j['nodes'][i]; W = M @ mat4(n); p = path + '/' + n.get('name', '')
        if 'mesh' in n and sub in p: out.append((n, W))
        for c in n.get('children', []): rec(c, W, p)
    for s in j['scenes'][j.get('scene', 0)]['nodes']: rec(s, np.eye(4), '')
    if len(out) != 1: raise SystemExit('expected one mesh for %r, found %d' % (sub, len(out)))
    n, W = out[0]
    pr = j['meshes'][n['mesh']]['primitives'][0]
    A = pr['attributes']
    P = acc(j, binb, A['POSITION']); N = acc(j, binb, A['NORMAL']); UV = acc(j, binb, A['TEXCOORD_0'])
    T = acc(j, binb, A['TANGENT']) if 'TANGENT' in A else None
    I = acc(j, binb, pr['indices']).ravel()
    P = (W @ np.c_[P, np.ones(len(P))].T).T[:, :3]
    W3 = W[:3, :3]; Ni = np.linalg.inv(W3).T
    N = N @ Ni.T; N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    if T is not None:
        t3 = T[:, :3] @ W3.T; t3 /= np.linalg.norm(t3, axis=1, keepdims=True) + 1e-12; T = np.c_[t3, T[:, 3]]
    return dict(P=P, N=N, UV=UV, T=T, I=I, mat=j['materials'][pr['material']])


def place(g, M):
    """apply a 4x4 (rotation, positive scales, translation) to positions, normals, tangents"""
    g = dict(g); M3 = M[:3, :3]
    g['P'] = (M @ np.c_[g['P'], np.ones(len(g['P']))].T).T[:, :3]
    Ni = np.linalg.inv(M3).T
    n = g['N'] @ Ni.T; g['N'] = n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-12)
    if g['T'] is not None:
        t = g['T'][:, :3] @ M3.T; t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-12; g['T'] = np.c_[t, g['T'][:, 3]]
    return g


def T(x, y, z): M = np.eye(4); M[:3, 3] = [x, y, z]; return M
def S(x, y=None, z=None): return np.diag([x, x if y is None else y, x if z is None else z, 1.0])
def Ry(a): c, s = np.cos(a), np.sin(a); return np.array([[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1.0]])
def Rz(a): c, s = np.cos(a), np.sin(a); return np.array([[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1.0]])


def subset(g, tri_mask):
    t = g['I'].reshape(-1, 3)[tri_mask]
    used, inv = np.unique(t.ravel(), return_inverse=True)
    h = {k: (v[used] if isinstance(v, np.ndarray) and k != 'I' else v) for k, v in g.items()}
    h['I'] = inv.astype(np.int64); return h


def image(j, binb, ti):
    im = j['images'][j['textures'][ti]['source']]; v = j['bufferViews'][im['bufferView']]
    return Image.open(io.BytesIO(binb[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]))


def crop_uv(prims, imgs, margin=6):
    """crop every image of a part to the UV box its triangles use (UVs in 0..1, no tiling), remapping the UVs"""
    uv = np.concatenate([p['UV'] for p in prims])
    if uv.min() < -0.001 or uv.max() > 1.001: return imgs
    W, H = imgs[0].size
    u0, v0 = uv.min(0); u1, v1 = uv.max(0)
    x0, x1 = max(0, int(u0 * W) - margin), min(W, int(np.ceil(u1 * W)) + margin)
    y0, y1 = max(0, int(v0 * H) - margin), min(H, int(np.ceil(v1 * H)) + margin)
    if (x1 - x0) * (y1 - y0) > 0.6 * W * H: return imgs
    for p in prims:
        p['UV'] = np.c_[(p['UV'][:, 0] * W - x0) / (x1 - x0), (p['UV'][:, 1] * H - y0) / (y1 - y0)]
    return [im.crop((x0 * im.size[0] // W, y0 * im.size[1] // H, x1 * im.size[0] // W, y1 * im.size[1] // H)) for im in imgs]


def refinish_base(im, hue=0.12):
    a = np.asarray(im.convert('RGB')).astype(np.float64) / 255
    L = a @ np.array([0.2126, 0.7152, 0.0722])
    g = 0.11 + 0.20 * L                                       # sRGB 28..79: black cerakote, the wear keeps its shape
    out = g[..., None] * (1 - hue) + (a * (0.11 + 0.20 * L.mean()) / max(1e-3, a.mean())) * hue
    out = out * np.array([0.98, 0.99, 1.02])                  # a cool neutral black
    return Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8))


def refinish_orm(im, metal, has_ao):
    a = np.asarray(im.convert('RGB')).astype(np.float64) / 255
    ao = a[..., 0] if has_ao else np.ones(a.shape[:2])
    r = 0.45 + 0.15 * a[..., 1]                               # roughness 0.45..0.60 from the source's own variation
    m = metal * (0.85 + 0.15 * (a[..., 2] > 0.5))             # metalness ~metal, a touch lower where the source was dielectric
    return Image.fromarray(np.clip(np.dstack([ao, r, m]) * 255 + 0.5, 0, 255).astype(np.uint8))


def webp(im, size, lossless=False):
    if max(im.size) > size:
        k = size / max(im.size); im = im.resize((max(4, round(im.size[0] * k)), max(4, round(im.size[1] * k))), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=86, method=6, lossless=lossless); return b.getvalue()


class GLB:
    def __init__(self): self.j = {'asset': {'version': '2.0', 'generator': 'tools/pack_glock_att.py'}, 'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
                                    'materials': [], 'textures': [], 'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
                                    'accessors': [], 'bufferViews': [], 'buffers': []}; self.bin = bytearray()

    def view(self, data, target=None):
        while len(self.bin) % 4: self.bin.append(0)
        v = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target: v['target'] = target
        self.bin += data; self.j['bufferViews'].append(v); return len(self.j['bufferViews']) - 1

    def acc(self, arr, kind, comp, target, minmax=False):
        a = np.ascontiguousarray(arr)
        v = self.view(a.tobytes(), target)
        d = {'bufferView': v, 'componentType': comp, 'count': len(a), 'type': kind}
        if minmax: d['min'] = a.min(0).tolist(); d['max'] = a.max(0).tolist()
        self.j['accessors'].append(d); return len(self.j['accessors']) - 1

    def tex(self, data):
        v = self.view(data); self.j['images'].append({'bufferView': v, 'mimeType': 'image/webp'})
        self.j['textures'].append({'source': len(self.j['images']) - 1, 'sampler': 0}); return len(self.j['textures']) - 1

    def material(self, name, base=None, orm=None, normal=None, ao=False, factors=None):
        m = {'name': name, 'pbrMetallicRoughness': {}}
        pb = m['pbrMetallicRoughness']
        if base is not None: pb['baseColorTexture'] = {'index': base}
        if orm is not None: pb['metallicRoughnessTexture'] = {'index': orm}
        if normal is not None: m['normalTexture'] = {'index': normal}
        if ao and orm is not None: m['occlusionTexture'] = {'index': orm}
        if factors: pb.update(factors)
        self.j['materials'].append(m); return len(self.j['materials']) - 1

    def node(self, name, prims):
        out = []
        for g, mi in prims:
            A = {'POSITION': self.acc(g['P'].astype(np.float32), 'VEC3', 5126, 34962, True), 'NORMAL': self.acc(g['N'].astype(np.float32), 'VEC3', 5126, 34962),
                 'TEXCOORD_0': self.acc(g['UV'].astype(np.float32), 'VEC2', 5126, 34962)}
            if g.get('T') is not None: A['TANGENT'] = self.acc(g['T'].astype(np.float32), 'VEC4', 5126, 34962)
            I = g['I'].astype(np.uint16 if len(g['P']) < 65536 else np.uint32)
            out.append({'attributes': A, 'indices': self.acc(I, 'SCALAR', 5123 if I.dtype == np.uint16 else 5125, 34963), 'material': mi})
        self.j['meshes'].append({'name': name, 'primitives': out})
        self.j['nodes'].append({'name': name, 'mesh': len(self.j['meshes']) - 1})
        self.j['scenes'][0]['nodes'].append(len(self.j['nodes']) - 1)

    def write(self, path):
        while len(self.bin) % 4: self.bin.append(0)
        self.j['buffers'] = [{'byteLength': len(self.bin)}]
        js = json.dumps(self.j, separators=(',', ':')).encode()
        while len(js) % 4: js += b' '
        glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(self.bin)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(self.bin), 0x004E4942) + bytes(self.bin)
        os.makedirs(os.path.dirname(path), exist_ok=True); open(path, 'wb').write(glb); return len(glb)


def textures(G, j, binb, mat, prims, sizes, metal):
    pb = mat['pbrMetallicRoughness']
    ims = [image(j, binb, pb['baseColorTexture']['index']), image(j, binb, pb['metallicRoughnessTexture']['index']), image(j, binb, mat['normalTexture']['index'])]
    ims = crop_uv(prims, ims)
    has_ao = 'occlusionTexture' in mat
    b = G.tex(webp(refinish_base(ims[0]), sizes[0]))
    o = G.tex(webp(refinish_orm(ims[1], metal, has_ao), sizes[1]))
    n = G.tex(webp(ims[2].convert('RGB'), sizes[2]))
    return b, o, n, has_ao


def main():
    G = GLB()
    # --- the red dot ---
    j, binb = load(SRC + 'attachments_light_sup_scope.glb')
    g = find(j, binb, 'Scope.001')
    P = g['P']; t = g['I'].reshape(-1, 3)
    base = image(j, binb, g['mat']['pbrMetallicRoughness']['baseColorTexture']['index']).convert('RGB')
    Tx = np.asarray(base).astype(np.float64) / 255; H, Wd = Tx.shape[:2]
    cu = g['UV'][t].mean(1)
    col = Tx[np.clip((cu[:, 1] % 1) * H, 0, H - 1).astype(int), np.clip((cu[:, 0] % 1) * Wd, 0, Wd - 1).astype(int)]
    lens = (col[:, 2] > col[:, 0] + 0.15) & (col[:, 1] > col[:, 0] + 0.05)            # the cyan lens in the texture
    a, b2, c = P[t[:, 0]], P[t[:, 1]], P[t[:, 2]]
    nz = np.cross(b2 - a, c - a); nz = nz[:, 2] / (np.linalg.norm(nz, axis=1) + 1e-15)
    rearFace = lens & (nz < -0.7)                                                       # the flat face toward the eye (source -z)
    yb = P[:, 1].min(); bot = P[P[:, 1] < yb + 0.0015]
    cx = (P[:, 0].min() + P[:, 0].max()) / 2; cz = (bot[:, 2].min() + bot[:, 2].max()) / 2
    K = 0.76                                                                            # 59.9 x 37.8 mm -> 45.5 x 28.7 (RMR / 507C size)
    M = Ry(np.pi) @ S(K) @ T(-cx, -yb, -cz)
    body = place(subset(g, ~lens), M); glass = place(subset(g, rearFace), M)
    bt, ot, nt, ao = textures(G, j, binb, g['mat'], [body], (1024, 512, 1024), 0.7)
    mBody = G.material('dot', bt, ot, nt, ao)
    mGlass = G.material('dotGlass', factors={'baseColorFactor': [0.05, 0.12, 0.14, 1], 'metallicFactor': 0, 'roughnessFactor': 0.05})
    G.node('dot', [(body, mBody)])
    G.node('dotGlass', [(glass, mGlass)])
    # --- the cans (34 mm tubes; rear = the source's +z end) ---
    j, binb = load(SRC + 'silencers_pack_1.glb')
    for name, sub in [('canMD3', 'MD3_low/MD3_low_MD3'), ('canSB100', 'SB100_low/SB100_low_SB100')]:
        g = find(j, binb, sub)
        P = g['P']; ctr = (P.min(0) + P.max(0)) / 2; zr = P[:, 2].max()
        k = 0.034 / (P[:, 0].max() - P[:, 0].min())
        g = place(g, S(k) @ T(-ctr[0], -ctr[1], -zr))
        bt, ot, nt, ao = textures(G, j, binb, g['mat'], [g], (512, 256, 512), 0.8)
        G.node(name, [(g, G.material(name, bt, ot, nt, ao))])
    # --- the compensator (ports to the top, 22 x 48.5 mm; rear = the source's +z end) ---
    j, binb = load(SRC + 'weapon_accessories.glb')
    g = find(j, binb, 'Compensator 1/')
    P = g['P']; ctr = (P.min(0) + P.max(0)) / 2; zr = P[:, 2].max()
    k = 0.022 / (P[:, 0].max() - P[:, 0].min()); kz = k * 0.8
    g = place(g, S(k, k, kz) @ Rz(np.pi / 2) @ T(-ctr[0], -ctr[1], -zr))
    bt, ot, nt, ao = textures(G, j, binb, g['mat'], [g], (512, 256, 512), 0.8)
    G.node('comp', [(g, G.material('comp', bt, ot, nt, ao))])
    n = G.write(OUT)
    print(OUT, n // 1024, 'KB')


if __name__ == '__main__':
    main()
