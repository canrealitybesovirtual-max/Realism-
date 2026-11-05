# Packs the Yamaha YZF-R6 for Interstate into interstate/cars/r6.glb + r6.json.
#   Source: the user's "Yamaha YZF-R6 RACE" (Sketchfab, dragos12_, CC-BY-4.0; asset.extras of the source GLB, kept in the output).
#   python3 tools/pack_bike.py <yamaha_yzf-r6_race.glb>        (run from the repo root; needs numpy, PIL and npx gltfpack@1.3.0)
# What it does:
#   - drops the paddock stand and stands the bike on both tyres (the source sits nose-down on the stand: it is turned back
#     about the lateral axis until both tyres touch, then the lower one is put on y 0)
#   - real scale (wheelbase 1.375 m, the source is 1.3695), the game's body frame: x right, y up, front toward -z, origin on the
#     ground half way between the axles
#   - splits the moving parts into their own nodes, each with its origin at its pivot:
#       chassis   frame, engine, fairing, tank, seat, exhaust, mirrors (mat_mirrorview: the live mirror glass), dash, glass
#       forkU     what turns with the bars: outer fork tubes, triple clamps, clip-ons, grips, levers, switchgear
#       forkL     what turns and also slides up the fork tubes (suspension): inner tubes, axle clamps, calipers, front fender
#       wheelF    front tyre, rim, discs and carriers (spins; origin on the axle)
#       swing     swingarm, rear caliper, chain (pivots about the swingarm pivot; origin there)
#       wheelR    rear tyre, rim, disc, sprocket and carrier (spins; origin on the axle)
#       head tail indFL indFR indRL indRR   lamp emitters (the game gives them glowing materials): the headlamps (central
#                 projector and the two upper lamps with their LED strips), the LED tail lamp, the mirror-mounted front
#                 indicators and the rear indicators (their amber lenses)
#     The parts are told apart by connected component (welded by position) and where they sit: the steering axis is fitted
#     to the two fork tubes; turning parts are those whose every vertex lies within 13 cm of it (side view) and 37 cm of the
#     centreline; the swingarm parts lie along the line from its pivot to the rear axle.
#   - materials keep their names and maps (texCoord sets kept); transmission / clear-coat extensions are dropped (the game
#     sets its own physical materials); the brake discs, sprockets and chain become alpha-tested (MASK) instead of blended
#   - textures resized and encoded as WebP here (colour 1024 or 512, normal / ORM 512, near-uniform images 16 px;
#     EXT_texture_webp), then gltfpack compresses the geometry (EXT_meshopt_compression + KHR_mesh_quantization, float UVs:
#     the source tiles its UVs up to 80 times, too far for 12-bit ones; the game
#     loads the decoder); the npm build of gltfpack has no WebP encoder, so the images pass through it as they are
#   - r6.json: the measurements the game uses (axles, radii, steering axis, swingarm pivot, grips (left, right), lamp centres,
#     the right mirror glass, the seat top, a rider's eye point)
import json, struct, io, os, sys, subprocess, tempfile
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pack_glock_att import load, acc, mat4

OUT = 'interstate/cars/r6.glb'
META = 'interstate/cars/r6.json'
WHEELBASE = 1.375                    # Yamaha YZF-R6 (2017-2020)
TRAIL = .097                         # published trail (rake 24 deg): sets the fork offset behind the tubes
STAND = 'mat_bikes_stand_002'
LAMP_MATS = ('mat_light638',)
LENS_MATS = ('mat_glasstint638_001', 'mat_glassDOF638_001')
WHEEL_MATS = ('mat_fronttyre001', 'mat_backtyre001', 'mat_rim638_001', 'mat_brake638', 'mat_gear638')
TURN_MATS = ('mat_mechanics638_001', 'mat_cockpit638_001')
SWING_MATS = ('mat_mechanics638_001', 'mat_chain_1_001', 'mat_livery_0_638_001')
MASK_MATS = ('mat_brake638', 'mat_gear638', 'mat_chain_1_001')


# ---------------------------------------------------------------- source
def comps(I, P):
    """connected components of the triangles, vertices welded by position (the source splits them at UV seams)"""
    q = np.round(P / 2e-5).astype(np.int64)
    _, inv = np.unique(q, axis=0, return_inverse=True); inv = inv.ravel()
    parent = np.arange(inv.max() + 1)
    t = inv[I.reshape(-1, 3)]
    def f(x):
        r = x
        while parent[r] != r: r = parent[r]
        while parent[x] != r: parent[x], x = r, parent[x]
        return r
    for a, b, c in t:
        ra = f(a); rb = f(b)
        if rb != ra: parent[rb] = ra
        rc = f(c)
        if rc != ra: parent[rc] = ra
    root = np.array([f(x) for x in range(len(parent))])
    _, lab = np.unique(root[t[:, 0]], return_inverse=True)
    return lab.ravel()


def prims(src):
    j, b = load(src)
    par = {}
    for k, n in enumerate(j['nodes']):
        for c in n.get('children', []): par[c] = k
    def world(i):
        W = np.eye(4); k = i; chain = []
        while k is not None: chain.append(k); k = par.get(k)
        for k in reversed(chain): W = W @ mat4(j['nodes'][k])
        return W
    out = []
    for i, n in enumerate(j['nodes']):
        if 'mesh' not in n: continue
        W = world(i)
        for pr in j['meshes'][n['mesh']]['primitives']:
            A = pr['attributes']
            P = acc(j, b, A['POSITION']); P = (W @ np.c_[P, np.ones(len(P))].T).T[:, :3]
            Ni = np.linalg.inv(W[:3, :3]).T
            N = acc(j, b, A['NORMAL']) @ Ni.T; N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
            T = None
            if 'TANGENT' in A:
                T = acc(j, b, A['TANGENT']); t3 = T[:, :3] @ W[:3, :3].T; t3 /= np.linalg.norm(t3, axis=1, keepdims=True) + 1e-12; T = np.c_[t3, T[:, 3]]
            UV = [acc(j, b, A['TEXCOORD_%d' % k]) if 'TEXCOORD_%d' % k in A else None for k in range(3)]
            I = acc(j, b, pr['indices']).ravel()
            out.append(dict(node=n['name'], mat=j['materials'][pr['material']]['name'], mi=pr['material'], P=P, N=N, T=T, UV=UV, I=I, C=comps(I, P)))
    return j, b, out


# ---------------------------------------------------------------- frame
def rot_z(P, a):
    c, s = np.cos(a), np.sin(a); Q = P.copy(); Q[:, 0] = P[:, 0] * c - P[:, 1] * s; Q[:, 1] = P[:, 0] * s + P[:, 1] * c; return Q


def untilt(out):
    """the angle about z that puts both tyres on the ground (the source stands on its paddock stand)"""
    F = next(p for p in out if p['mat'] == 'mat_fronttyre001')['P']; R = next(p for p in out if p['mat'] == 'mat_backtyre001')['P']
    g = lambda a: rot_z(F, a)[:, 1].min() - rot_z(R, a)[:, 1].min()
    lo, hi = -.2, .2
    for _ in range(60):
        m = (lo + hi) / 2
        if np.sign(g(m)) == np.sign(g(lo)): lo = m
        else: hi = m
    a = (lo + hi) / 2
    y0 = min(rot_z(F, a)[:, 1].min(), rot_z(R, a)[:, 1].min())
    return a, y0


def level(out):
    """in place: the source turned upright and grounded (still the source axes: x forward, y up, z to the rider's right)"""
    a, y0 = untilt(out)
    for p in out:
        p['P'] = rot_z(p['P'], a); p['P'][:, 1] -= y0
        p['N'] = rot_z(p['N'], a)
        if p['T'] is not None: p['T'] = np.c_[rot_z(p['T'][:, :3], a), p['T'][:, 3]]
    return a


# ---------------------------------------------------------------- parts
def box(V): return V.min(0), V.max(0)


def classify(out):
    """a label per triangle per primitive (None = dropped), and the measured axes. Source axes, levelled."""
    tf = next(p for p in out if p['mat'] == 'mat_fronttyre001'); tb = next(p for p in out if p['mat'] == 'mat_backtyre001')
    lo, hi = box(tf['P']); aF = (lo + hi) / 2; rF = (hi[1] - lo[1]) / 2; wF = hi[2] - lo[2]
    lo, hi = box(tb['P']); aR = (lo + hi) / 2; rR = (hi[1] - lo[1]) / 2; wR = hi[2] - lo[2]
    aF[2] = aR[2] = 0
    # fork tubes: the long thin mechanics components ahead of the engine, leaning back 15-35 deg
    tube = []
    for p in out:
        if p['mat'] != 'mat_mechanics638_001': continue
        T = p['I'].reshape(-1, 3)
        for c in range(p['C'].max() + 1):
            V = p['P'][np.unique(T[p['C'] == c].ravel())]
            if len(V) < 20 or V[:, 0].mean() < .35 or V[:, 1].mean() < .4: continue
            X = V - V.mean(0); w, v = np.linalg.eigh(X.T @ X / len(V)); d = v[:, 2] * np.sign(v[1, 2])
            ang = np.degrees(np.arctan2(-d[0], d[1])); L = 2 * np.sqrt(w[2]) * 1.73
            if np.sqrt(w[2] / (w[1] + 1e-12)) > 8 and L > .45 and 15 < ang < 35: tube.append(V)
    if len(tube) < 2: raise SystemExit('fork tubes not found (%d)' % len(tube))
    V = np.concatenate(tube)[:, :2]; c = V.mean(0); w, v = np.linalg.eigh((V - c).T @ (V - c)); d = v[:, 1] * np.sign(v[1, 1])
    nrm = np.array([d[1], -d[0]])                                   # perpendicular, toward the front
    e = (aF[:2] - c) @ nrm                                          # the axle ahead of the tube line (m)
    rake = np.arctan2(-d[0], d[1])
    off = rF * np.sin(rake) - TRAIL * np.cos(rake)                  # steering axis behind the axle (perpendicular)
    cs = c + nrm * (e - off)                                        # a point on the steering axis
    sF = lambda P: (P[:, :2] - aF[:2]) @ d                           # along the axis from the axle
    qT = lambda P: np.abs((P[:, :2] - c) @ nrm)                     # side-view distance from the tube line
    # swingarm: the long mechanics component that spans the bike's width from the rear axle forward; its front end is the pivot
    best = None
    for p in out:
        if p['mat'] != 'mat_mechanics638_001': continue
        T = p['I'].reshape(-1, 3)
        for k in range(p['C'].max() + 1):
            V = p['P'][np.unique(T[p['C'] == k].ravel())]
            l, h = box(V)
            if l[0] < aR[0] + .12 and aR[0] + .35 < h[0] < .1 and h[1] < .75 and l[2] < -.1 and h[2] > .1:
                if best is None or h[0] - l[0] > best[1][0] - best[0][0]: best = (l, h, V)
    if best is None: raise SystemExit('swingarm not found')
    al, ah, V = best
    front = V[V[:, 0] > ah[0] - .03]
    piv = np.array([front[:, 0].mean(), front[:, 1].mean(), 0.0])
    sw_lo = np.array([al[0] - .1, al[1] - .03, al[2] - .02]); sw_hi = np.array([piv[0] - .05, ah[1] + .1, ah[2] + .02])
    labels = []
    for p in out:
        T = p['I'].reshape(-1, 3); lab = np.array(['body'] * len(T), dtype=object)
        if p['mat'] == STAND: labels.append(None); continue
        for k in range(p['C'].max() + 1):
            m = p['C'] == k; V = p['P'][np.unique(T[m].ravel())]; l, h = box(V); ctr = (l + h) / 2; size = (h - l).max()
            dF = np.linalg.norm(ctr[:2] - aF[:2]); dR = np.linalg.norm(ctr[:2] - aR[:2])
            L = 'body'
            if p['mat'] in WHEEL_MATS:
                if p['mat'] == 'mat_fronttyre001': L = 'wheelF'
                elif p['mat'] == 'mat_backtyre001': L = 'wheelR'
                elif dF < .06 and size < .7: L = 'wheelF'
                elif dR < .06 and size < .75: L = 'wheelR'
            elif p['mat'] in LAMP_MATS:
                if ctr[0] > .6 and ctr[1] < .86: L = 'head'
                elif ctr[0] < -.6 and ctr[1] > .93: L = 'tail'
            elif p['mat'] in LENS_MATS and abs(ctr[2]) > .12:
                if ctr[0] > .6 and ctr[1] > .93: L = 'indFR' if ctr[2] > 0 else 'indFL'
                elif ctr[0] < -.8 and ctr[1] < .9: L = 'indRR' if ctr[2] > 0 else 'indRL'
            if L == 'body' and (p['mat'] in TURN_MATS or p['mat'] == 'mat_livery_0_638_001'):
                s = sF(V); q = qT(V)
                fender = p['mat'] == 'mat_livery_0_638_001' and h[1] < .64 and l[0] > aF[0] - .32
                turn = fender or (p['mat'] in TURN_MATS and q.max() < .13 and np.abs(V[:, 2]).max() < .37 and l[0] > .3 and s.min() > -.15 and s.max() < .82)
                if turn: L = 'forkL' if (fender or s.min() < .13) else 'forkU'
            if L == 'body' and p['mat'] in SWING_MATS:
                arm = np.allclose(l, al) and np.allclose(h, ah)
                if arm or p['mat'] == 'mat_chain_1_001' or (np.all(l > sw_lo) and np.all(h < sw_hi)): L = 'swing'
            lab[m] = L
        labels.append(lab)
    info = dict(aF=aF, aR=aR, rF=rF, rR=rR, wF=wF, wR=wR, d=np.array([d[0], d[1], 0.0]), cs=np.array([cs[0], cs[1], 0.0]), rake=np.degrees(rake), off=off, e=e, piv=piv,
                axes=[(np.r_[cs - d * .5, 0], np.r_[cs + d * .9, 0]), (aR, piv)])
    return labels, info


# ---------------------------------------------------------------- output
def to_body(P, s, z0):
    """source (x fwd, y up, z right) -> game body (x right, y up, z back), scaled, centred between the axles"""
    Q = np.c_[P[:, 2], P[:, 1], -P[:, 0]] * s; Q[:, 2] -= z0; return Q


def tex_webp(im, size):
    if im.mode == 'P': im = im.convert('RGBA' if 'transparency' in im.info else 'RGB')
    if im.mode not in ('RGB', 'RGBA', 'L'): im = im.convert('RGB')
    a = np.asarray(im).astype(np.float64)
    if a.reshape(-1, a.shape[-1] if a.ndim == 3 else 1).std(0).max() < 1.0: size = 16      # near-uniform: a tiny swatch
    if max(im.size) > size: im = im.resize((size, size), Image.LANCZOS)
    if im.mode == 'RGBA' and np.asarray(im)[..., 3].min() == 255: im = im.convert('RGB')
    b = io.BytesIO(); im.save(b, 'WEBP', quality=84, method=6); return b.getvalue()


SIZE = {'mat_livery_0_638_001': (1024, 1024, 512), 'mat_mechanics638_001': (1024, 512, 512), 'mat_cockpit638_001': (1024, 512, 512),
        'mat_fronttyre001': (1024, 512, 512), 'mat_backtyre001': (1024, 512, 512), 'exmanifold638_638': (512, 512, 512), 'mat_muffler638_001': (512, 512, 512)}


class Out:
    def __init__(self, asset):
        self.j = {'asset': {'version': '2.0', 'generator': 'tools/pack_bike.py', 'extras': asset.get('extras', {})}, 'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
                  'materials': [], 'textures': [], 'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
                  'accessors': [], 'bufferViews': [], 'buffers': []}
        self.bin = bytearray()

    def view(self, data, target=None):
        while len(self.bin) % 4: self.bin.append(0)
        v = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target: v['target'] = target
        self.bin += data; self.j['bufferViews'].append(v); return len(self.j['bufferViews']) - 1

    def acc(self, arr, kind, comp, target, minmax=False):
        a = np.ascontiguousarray(arr); d = {'bufferView': self.view(a.tobytes(), target), 'componentType': comp, 'count': len(a), 'type': kind}
        if minmax: d['min'] = a.min(0).tolist(); d['max'] = a.max(0).tolist()
        self.j['accessors'].append(d); return len(self.j['accessors']) - 1

    def image(self, data):
        self.j['images'].append({'bufferView': self.view(data), 'mimeType': 'image/webp'})
        self.j['textures'].append({'sampler': 0, 'extensions': {'EXT_texture_webp': {'source': len(self.j['images']) - 1}}})
        self.j.setdefault('extensionsUsed', ['EXT_texture_webp']); self.j.setdefault('extensionsRequired', ['EXT_texture_webp'])
        return len(self.j['textures']) - 1

    def write(self, path):
        while len(self.bin) % 4: self.bin.append(0)
        self.j['buffers'] = [{'byteLength': len(self.bin)}]
        js = json.dumps(self.j, separators=(',', ':')).encode()
        while len(js) % 4: js += b' '
        open(path, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(self.bin)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(self.bin), 0x004E4942) + bytes(self.bin))


def materials(G, j, b, used):
    """source materials (only those used), maps resized and re-saved as PNG; returns name -> (index, uv sets used)"""
    from pack_glock_att import image
    cache, out = {}, {}
    for mi, m in enumerate(j['materials']):
        name = m['name']
        if name not in used: continue
        sz = SIZE.get(name, (512, 512, 512)); pb = m.get('pbrMetallicRoughness', {}); o = {'name': name, 'pbrMetallicRoughness': {}}; uvs = {0}
        def tx(ref, size):
            key = (ref['index'], size)
            if key not in cache: cache[key] = G.image(tex_webp(image(j, b, ref['index']), size))
            r = {'index': cache[key]}
            if ref.get('texCoord'): r['texCoord'] = ref['texCoord']; uvs.add(ref['texCoord'])
            return r
        for k in ('baseColorFactor', 'metallicFactor', 'roughnessFactor'):
            if k in pb: o['pbrMetallicRoughness'][k] = pb[k]
        if 'baseColorTexture' in pb: o['pbrMetallicRoughness']['baseColorTexture'] = tx(pb['baseColorTexture'], sz[0])
        if 'metallicRoughnessTexture' in pb: o['pbrMetallicRoughness']['metallicRoughnessTexture'] = tx(pb['metallicRoughnessTexture'], sz[2])
        if 'normalTexture' in m: o['normalTexture'] = tx(m['normalTexture'], sz[1])
        if m.get('alphaMode') == 'BLEND':
            if name in MASK_MATS: o['alphaMode'] = 'MASK'; o['alphaCutoff'] = .5
            else: o['alphaMode'] = 'BLEND'
        G.j['materials'].append(o); out[name] = (len(G.j['materials']) - 1, sorted(uvs))
    return out


def main():
    if len(sys.argv) < 2: raise SystemExit(__doc__ or 'usage: python3 tools/pack_bike.py <yamaha_yzf-r6_race.glb>')
    src = sys.argv[1]
    j, b, out = prims(src)
    tilt = level(out)
    labels, I = classify(out)
    aF, aR = I['aF'], I['aR']
    s = WHEELBASE / np.linalg.norm((aF - aR)[:2])
    z0 = -(aF[0] + aR[0]) / 2 * s                                     # body z of the axle midpoint (front is -z)
    B = lambda P: to_body(np.atleast_2d(P), s, z0)
    piv = {'wheelF': B(aF)[0], 'wheelR': B(aR)[0], 'swing': B(I['piv'])[0]}
    # the steering pivot: the point of the steering axis nearest the front axle
    cs, d = I['cs'], I['d']; t = (aF - cs)[:2] @ d[:2]; foot = cs + d * t
    piv['forkU'] = piv['forkL'] = B(foot)[0]
    G = Out(j['asset'])
    used = {p['mat'] for p, l in zip(out, labels) if l is not None}
    M = materials(G, j, b, used)
    nodes, stats = {}, {}
    for p, lab in zip(out, labels):
        if lab is None: continue
        for L in np.unique(lab):
            nodes.setdefault(L, []).append((p, lab == L))
    lamp = {}
    for L, parts in nodes.items():
        o = piv.get(L)
        if o is None:                                                  # chassis and lamps: origin at their centre (lamps) / body origin (chassis)
            if L == 'body': o = np.zeros(3)
            else:
                V = np.concatenate([B(p['P'][np.unique(p['I'].reshape(-1, 3)[m].ravel())]) for p, m in parts]); o = (V.min(0) + V.max(0)) / 2; lamp[L] = o
        prs = []
        for p, m in parts:
            T = p['I'].reshape(-1, 3)[m]; used_v, inv = np.unique(T.ravel(), return_inverse=True)
            P = B(p['P'][used_v]) - o
            N = np.c_[p['N'][used_v][:, 2], p['N'][used_v][:, 1], -p['N'][used_v][:, 0]]
            mi, uvs = M[p['mat']]
            A = {'POSITION': G.acc(P.astype(np.float32), 'VEC3', 5126, 34962, True), 'NORMAL': G.acc(N.astype(np.float32), 'VEC3', 5126, 34962)}
            if p['T'] is not None:
                Tg = p['T'][used_v]; A['TANGENT'] = G.acc(np.c_[Tg[:, 2], Tg[:, 1], -Tg[:, 0], Tg[:, 3]].astype(np.float32), 'VEC4', 5126, 34962)
            for k in uvs:
                if p['UV'][k] is not None: A['TEXCOORD_%d' % k] = G.acc(p['UV'][k][used_v].astype(np.float32), 'VEC2', 5126, 34962)
            idx = inv.reshape(-1).astype(np.uint16 if len(used_v) < 65536 else np.uint32)
            prs.append({'attributes': A, 'indices': G.acc(idx, 'SCALAR', 5123 if idx.dtype == np.uint16 else 5125, 34963), 'material': mi})
            stats[L] = stats.get(L, 0) + len(T)
        name = 'chassis' if L == 'body' else L
        G.j['meshes'].append({'name': name, 'primitives': prs})
        G.j['nodes'].append({'name': name, 'mesh': len(G.j['meshes']) - 1, 'translation': [float(x) for x in o]})
        G.j['scenes'][0]['nodes'].append(len(G.j['nodes']) - 1)
    # measurements (body frame)
    allP = np.concatenate([B(p['P']) for p, l in zip(out, labels) if l is not None])
    lo, hi = allP.min(0), allP.max(0)
    def comp_ctr(mat, sel):
        for p in out:
            if p['mat'] != mat: continue
            T = p['I'].reshape(-1, 3); res = []
            for k in range(p['C'].max() + 1):
                V = p['P'][np.unique(T[p['C'] == k].ravel())]
                if sel(V): res.append(B((V.min(0) + V.max(0)) / 2)[0])
            return res
        return []
    grips = comp_ctr('mat_cockpit638_001', lambda V: len(V) > 300 and abs(V[:, 2]).max() > .3 and V[:, 1].mean() > .75 and V[:, 0].mean() < .5)
    mir = comp_ctr('mat_mirrorview', lambda V: V[:, 2].mean() > 0)
    gl = [g for g in grips if g[0] < 0]; gr = [g for g in grips if g[0] > 0]
    grips = [np.mean(gl, 0), np.mean(gr, 0)] if gl and gr else grips             # each grip: its rubber and the bar end / throttle tube
    # the seat: the highest point of the bodywork in a narrow strip along the centreline over the rider's seat (source x -0.42..-0.22, behind the tank)
    SP = np.concatenate([p['P'][np.unique(p['I'])] for p in out if p['mat'] == 'mat_livery_0_638_001'])
    SP = SP[(SP[:, 0] > -.42) & (SP[:, 0] < -.22) & (np.abs(SP[:, 2]) < .04)]
    seat = B(SP[np.argmax(SP[:, 1])])[0] if len(SP) else np.array([0, .83, .2])
    eye = seat + np.array([0, .56, -.34])                           # a rider tucked in a little: eyes 56 cm over the seat, 34 cm ahead
    dB = np.array([0, d[1], -d[0]]); dB /= np.linalg.norm(dB)
    meta = {
        'source': 'Yamaha YZF-R6 RACE by dragos12_ (Sketchfab), CC-BY-4.0', 'len': float(hi[2] - lo[2]), 'wid': float(hi[0] - lo[0]), 'hgt': float(hi[1]), 'zone': [float(lo[2]), float(hi[2])],
        'scale': float(s), 'tilt': float(tilt),
        'wheels': {'zf': float(piv['wheelF'][2]), 'zr': float(piv['wheelR'][2]), 'x': 0, 'rf': float(I['rF'] * s), 'rr': float(I['rR'] * s), 'wf': float(I['wF'] * s), 'wr': float(I['wR'] * s), 'yf': float(piv['wheelF'][1]), 'yr': float(piv['wheelR'][1])},
        'steer': {'p': [float(x) for x in piv['forkU']], 'd': [float(x) for x in dB], 'rake': float(I['rake']), 'offset': float(I['off'] * s), 'tubeAhead': float(I['e'] * s)},
        'swing': {'p': [float(x) for x in piv['swing']]},
        'grips': [[float(x) for x in g] for g in grips],
        'mirror': [float(x) for x in mir[0]] if mir else None,
        'seat': [float(x) for x in seat], 'eye': [float(x) for x in eye],
        'lamps': {k: [float(x) for x in v] for k, v in lamp.items()},
        'tris': {('chassis' if k == 'body' else k): int(v) for k, v in stats.items()},
    }
    tmp = tempfile.mkdtemp()
    stage = os.path.join(tmp, 'r6-stage.glb'); G.write(stage)
    cmd = ['npx', '--yes', 'gltfpack@1.3.0', '-i', stage, '-o', os.path.abspath(OUT), '-cc', '-kn', '-km', '-ke', '-vtf']
    print(' '.join(cmd)); subprocess.run(cmd, check=True)
    json.dump(meta, open(META, 'w'), indent=1)
    print(json.dumps(meta, indent=1)); print('wrote', OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
