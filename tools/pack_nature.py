# Packs the outdoor yard's vegetation and stones (CQC "Outpost 17") into cqc/models/nature.glb.
#   Source: the user's "Free Low-Poly Nature Assets Pack" (Sketchfab, BozhidarKN, CC-BY-4.0; asset.extras of the source GLB).
#   python3 tools/pack_nature.py nature.glb            (run from the repo root; writes cqc/models/nature.glb)
# From the pack (re-scaled to real size, origin at the base centre, +y up, metres, vertices baked):
#   leafA                   its first broadleaf tree (wood + alpha leaf cards), 10.5 m; LOD1: every fifth leaf card,
#                           enlarged, the wood vertex-clustered
#   deadB / deadC           its other two trees' wood alone (bare, dead: a birch-like and a dark one), 8-10.5 m
#   rockA / rockB           its two scanned rocks (albedo greyed toward wet granite, ORM, normal map, tangents)
#   stumpA / B / C          its three stumps
#   fernA / fernB / weed    its three ground plants (alpha cards)
# Made here (the pack has no conifers):
#   pineA / pineB / pineC   spruce-like pines, 13-21 m: tapered trunk with root flare, a branch whorl every ~0.45 m, two
#                           crossed needle cards per branch (drooping, tips turned up), dead stubs under the crown, a leader;
#                           LOD0 ~3-4.5k triangles, LOD1 ~270-420 (four to five wide cards a whorl, whorls 1.5x apart)
#   snagA / snagB           dead pines: broken top, bare dead branches
#   bushA / bushB           dwarf mountain pine / juniper clumps of needle cards
#   <tree>_2                LOD2 of every tree: two crossed cards (24 triangles) with the LOD0 drawn from two sides
#                           into the impostor atlas here (a small software rasteriser, alpha-tested, crown shading)
# Textures (WebP): pineBark (generated tileable plates and fissures: albedo, normal, ORM), needles (generated spray atlas,
# two sprays, alpha, normal), packBark (the pack's atlas + a normal and ORM derived from it), leaf / fern cards (colour
# bled into the transparent texels), rocks and stumps (the pack's), floor (generated forest floor: soil, needle litter, moss,
# small stones; albedo, normal, ORM, 2.5 m tile) on a 1 x 1 m holder quad ("floorMat"). Lichen and moss on the rocks are
# drawn by the yard shader from its own noise (triplanar), so they need no texture here.
# Foliage normals are bent toward the crown (half card normal, half the direction out from the crown's axis), so the
# cards light as a crown. Node extras: h (height), r (trunk radius at 1.3 m), top (trunk collider height), crown
# (crown radius), hull (rocks / stumps: up to 40 points for a convex collider), tris.
import json, struct, io, os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pack_glock_att import load, acc, mat4, GLB

OUT = 'cqc/models/nature.glb'
RNG = np.random.default_rng(1717)


# ---------------------------------------------------------------- source geometry
def collect(j, b, root):
    """every primitive under node root, baked to scene space: {material name: [piece dicts]}"""
    par = {}
    for k, n in enumerate(j['nodes']):
        for c in n.get('children', []): par[c] = k
    chain = [root]
    while chain[-1] in par: chain.append(par[chain[-1]])
    W0 = np.eye(4)
    for k in reversed(chain[1:]): W0 = W0 @ mat4(j['nodes'][k])
    out = {}
    def rec(i, W):
        n = j['nodes'][i]; W = W @ mat4(n)
        if 'mesh' in n:
            for pr in j['meshes'][n['mesh']]['primitives']:
                A = pr['attributes']
                P = acc(j, b, A['POSITION']); P = (W @ np.c_[P, np.ones(len(P))].T).T[:, :3]
                Ni = np.linalg.inv(W[:3, :3]).T
                N = acc(j, b, A['NORMAL']) @ Ni.T; N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
                T = None
                if 'TANGENT' in A:
                    T = acc(j, b, A['TANGENT']); t3 = T[:, :3] @ W[:3, :3].T; t3 /= np.linalg.norm(t3, axis=1, keepdims=True) + 1e-12; T = np.c_[t3, T[:, 3]]
                g = dict(P=P, N=N, UV=acc(j, b, A['TEXCOORD_0']), T=T, I=acc(j, b, pr['indices']).ravel())
                out.setdefault(j['materials'][pr['material']]['name'], []).append(g)
        for c in n.get('children', []): rec(c, W)
    rec(root, W0)
    return out


def concat(pieces):
    P, N, UV, T, I, off = [], [], [], [], [], 0
    for g in pieces:
        P.append(g['P']); N.append(g['N']); UV.append(g['UV']); I.append(g['I'] + off); off += len(g['P'])
        if g.get('T') is not None: T.append(g['T'])
    return dict(P=np.concatenate(P), N=np.concatenate(N), UV=np.concatenate(UV), I=np.concatenate(I), T=np.concatenate(T) if len(T) == len(pieces) else None)


def xform(g, s, t):
    """scale s (uniform), then translate t; normals unchanged"""
    g = dict(g); g['P'] = g['P'] * s + t; return g


def weld_cluster(g, cell):
    """vertex-clustering decimation: snap to a grid of cell metres, merge, drop collapsed triangles"""
    q = np.floor(g['P'] / cell).astype(np.int64)
    key = q[:, 0] * 73856093 ^ q[:, 1] * 19349663 ^ q[:, 2] * 83492791
    _, first, inv = np.unique(key, return_index=True, return_inverse=True)
    t = inv[g['I'].reshape(-1, 3)]
    ok = (t[:, 0] != t[:, 1]) & (t[:, 1] != t[:, 2]) & (t[:, 0] != t[:, 2])
    t = t[ok]
    P = np.zeros((len(first), 3)); np.add.at(P, inv, g['P']); P /= np.bincount(inv)[:, None]
    N = np.zeros((len(first), 3)); np.add.at(N, inv, g['N']); N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    UV = g['UV'][first]
    used, inv2 = np.unique(t.ravel(), return_inverse=True)
    return dict(P=P[used], N=N[used], UV=UV[used], I=inv2, T=None)


def tri_count(g): return len(g['I']) // 3


def bend_normals(g, centre, k=0.65, lift=0.25):
    d = g['P'] - centre; d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
    n = g['N'] * (1 - k) + d * k + np.array([0, lift, 0])
    g['N'] = n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-9); return g


def slice_radius(g, y):
    """trunk radius at height y: where the triangle edges cross the plane, the ring nearest the trunk's base axis"""
    t = g['I'].reshape(-1, 3); pts = []
    for a, c in ((0, 1), (1, 2), (2, 0)):
        A, B = g['P'][t[:, a]], g['P'][t[:, c]]
        s = (y - A[:, 1]) / (B[:, 1] - A[:, 1] + 1e-12); m = (s >= 0) & (s <= 1)
        pts.append(A[m] + (B[m] - A[m]) * s[m, None])
    P = np.concatenate(pts)[:, [0, 2]]
    P = P[np.linalg.norm(P, axis=1) < 1.2]                            # the trunk, not a branch crossing the plane further out
    if len(P) < 3: return 0.2
    c = P.mean(0); r = np.linalg.norm(P - c, axis=1)
    return round(float(np.percentile(r, 60)), 3)


def far_points(P, n):
    """farthest-point sample of n points (hull colliders)"""
    if len(P) <= n: return P
    idx = [int(np.argmax(P[:, 1]))]; d = np.linalg.norm(P - P[idx[0]], axis=1)
    for _ in range(n - 1):
        i = int(np.argmax(d)); idx.append(i); d = np.minimum(d, np.linalg.norm(P - P[i], axis=1))
    return P[idx]


# ---------------------------------------------------------------- generated meshes
class Mesh:
    def __init__(self): self.P, self.N, self.UV, self.I = [], [], [], []

    def add(self, P, N, UV, I):
        o = sum(len(p) for p in self.P)
        self.P.append(np.asarray(P, float)); self.N.append(np.asarray(N, float)); self.UV.append(np.asarray(UV, float)); self.I.append(np.asarray(I, np.int64) + o)

    def out(self):
        if not self.P: return None
        g = dict(P=np.concatenate(self.P), N=np.concatenate(self.N), UV=np.concatenate(self.UV), I=np.concatenate(self.I), T=None)
        g['N'] /= np.linalg.norm(g['N'], axis=1, keepdims=True) + 1e-12
        return g


def tube(M, pts, radii, sides, u_tiles, v_len, closed_top=False):
    """a tube along a polyline; UV u around (u_tiles repeats), v along (metres / v_len)"""
    pts = np.asarray(pts, float); n = len(pts)
    P, N, UV, I = [], [], [], []
    vacc = 0.0
    for i in range(n):
        d = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]; d /= np.linalg.norm(d) + 1e-12
        a = np.array([1.0, 0, 0]) if abs(d[0]) < 0.9 else np.array([0, 0, 1.0])
        s = np.cross(d, a); s /= np.linalg.norm(s); t = np.cross(d, s)
        if i: vacc += np.linalg.norm(pts[i] - pts[i - 1])
        for k in range(sides + 1):
            ang = 2 * np.pi * k / sides
            nn = s * np.cos(ang) + t * np.sin(ang)
            P.append(pts[i] + nn * radii[i]); N.append(nn); UV.append([u_tiles * k / sides, vacc / v_len])
    for i in range(n - 1):
        for k in range(sides):
            a = i * (sides + 1) + k; b = a + sides + 1
            I += [a, b, a + 1, a + 1, b, b + 1]
    M.add(P, N, UV, I)


def card(M, stations, side, widths, u0, u1, normal_fn):
    """a strip card through stations (polyline), half widths, texture u0..u1 along, v 0..1 across"""
    st = np.asarray(stations, float); n = len(st)
    P, N, UV, I = [], [], [], []
    L = np.r_[0, np.cumsum(np.linalg.norm(np.diff(st, axis=0), axis=1))]; L /= L[-1]
    for i in range(n):
        for s in (-1, 1):
            p = st[i] + side * widths[i] * s
            P.append(p); N.append(normal_fn(p)); UV.append([u0 + (u1 - u0) * L[i], 0.5 + 0.5 * s])
    for i in range(n - 1):
        a = 2 * i; I += [a, a + 2, a + 1, a + 1, a + 2, a + 3]
    M.add(P, N, UV, I)


def rot_axis(v, ax, ang):
    ax = ax / np.linalg.norm(ax); c, s = np.cos(ang), np.sin(ang)
    return v * c + np.cross(ax, v) * s + ax * np.dot(ax, v) * (1 - c)


def pine(H, seed, lod, dead=False):
    R = np.random.default_rng(seed)
    r0 = 0.018 * H + 0.04 * R.random()                              # ~0.3 m base radius at 16 m
    cb = (0.16 + 0.12 * R.random()) * H                             # crown base (forest-edge trees keep low branches)
    lean = R.normal(0, 0.012, 2) * H
    top = H * (0.62 + 0.12 * R.random()) if dead else H
    axis = lambda y: np.array([lean[0] * (y / H) ** 1.5, y, lean[1] * (y / H) ** 1.5])
    rad = lambda y: r0 * (1 - y / H) ** 0.85 + 0.012 + r0 * 0.45 * math.exp(-y / 0.35)
    wood, nd = Mesh(), Mesh()
    sides = 9 if lod == 0 else 5
    ys = np.linspace(0, top, max(3, int(top / (0.9 if lod == 0 else 3.0)) + 1))
    if lod == 0: ys = np.unique(np.r_[0, 0.12, 0.3, 0.6, ys])
    tube(wood, [axis(y) for y in ys], [rad(y) for y in ys], sides, max(2, round(2 * np.pi * r0 / 0.5)), 1.1)
    if dead:                                                          # jagged break: a few splinters up from the top ring
        for k in range(3 if lod == 0 else 1):
            a = R.random() * 6.28; base = axis(top) + np.array([np.cos(a), 0, np.sin(a)]) * rad(top) * 0.5
            tube(wood, [base, base + np.array([np.cos(a) * 0.05, 0.25 + 0.4 * R.random(), np.sin(a) * 0.05])], [rad(top) * 0.4, 0.01], 3, 1, 1.1)
    Lmax = (0.15 + 0.03 * R.random()) * H
    y, ga = cb, R.random() * 6.28
    while y < top - 0.35:
        t = (y - cb) / max(1e-3, H - cb)
        nb = (6 + int(R.random() * 3)) if lod == 0 else 5
        for k in range(nb):
            a = ga + 2 * np.pi * k / nb + R.normal(0, 0.25)
            d = np.array([np.cos(a), 0, np.sin(a)])
            L = (Lmax * (1 - t) ** 1.05 * (0.8 + 0.4 * R.random()) + 0.3) * (0.8 if dead else 1)
            pitch = (-0.42 + 0.75 * t + R.normal(0, 0.08)) if not dead else (-0.25 + 0.5 * t + R.normal(0, 0.15))
            dp = d * np.cos(pitch) + np.array([0, np.sin(pitch), 0])
            p0 = axis(y) + d * rad(y) * 0.8
            droop = (0.18 + 0.1 * R.random()) * L * (1 - t * 0.6)
            p1 = p0 + dp * L * 0.5 - np.array([0, droop * 0.6, 0])
            p2 = p0 + dp * L - np.array([0, droop * 0.7, 0]) + np.array([0, 0.12 * L * (1 - t), 0])   # tip turned up
            if dead or (lod == 0 and t < 0.75):
                rb = 0.012 + 0.03 * (1 - t) * (L / Lmax)
                tube(wood, [p0, p1, p2 if dead else p0 + (p1 - p0) * 1.4], [rb, rb * 0.6, 0.006], 3 if lod == 0 else 2, 1, 1.1)
            if dead:
                if lod == 0 and R.random() < 0.7:                    # a side twig on dead branches
                    q0 = p0 + (p1 - p0) * (0.4 + 0.4 * R.random()); qd = rot_axis(dp, np.array([0, 1, 0]), R.choice([-1, 1]) * (0.6 + 0.4 * R.random()))
                    tube(wood, [q0, q0 + qd * L * 0.35 + np.array([0, 0.05, 0])], [0.008, 0.003], 3, 1, 1.1)
                continue
            side = np.cross(dp, np.array([0, 1.0, 0])); side /= np.linalg.norm(side) + 1e-9
            ctr = axis(y + 0.2)
            nfn = lambda p, ctr=ctr: (lambda v: v / (np.linalg.norm(v) + 1e-9))(np.array([0, 0.75, 0]) * 0.35 + (lambda q: q / (np.linalg.norm(q) + 1e-9))(p - ctr) * 0.65 + np.array([0, 0.3, 0]))
            w = np.clip(0.22 + 0.26 * L, 0.28, 1.0) * (1.0 if lod == 0 else 2.2)
            u0 = 0.0 if (k + int(y * 7)) % 2 == 0 else 0.5
            for roll in ((R.normal(0, 0.12), 0.9 + R.normal(0, 0.15)) if lod == 0 else ((0.25 if k % 2 else 0.85) + R.normal(0, 0.1),)):
                sd = rot_axis(side, dp, roll)
                card(nd, [p0 - dp * 0.05, p1, p2], sd, [w * 0.35, w * 0.85, w * 0.55], u0 + 0.01, u0 + 0.49, nfn)
        ga += 2.399 + R.normal(0, 0.2)
        y += (0.42 + 0.12 * R.random()) * (1.0 if lod == 0 else 1.55)
    if not dead:                                                      # the leader: a small crossed pair at the top
        for roll in (0, np.pi / 2) if lod == 0 else (0,):
            sd = rot_axis(np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), roll + ga)
            top_p = axis(H)
            card(nd, [top_p - np.array([0, 0.9, 0]), top_p - np.array([0, 0.35, 0]), top_p + np.array([0, 0.15, 0])], sd, [0.25, 0.2, 0.06], 0.51, 0.99,
                 lambda p: np.array([0.0, 1.0, 0.0]) * 0.3 + (p - axis(H - 0.5)) / (np.linalg.norm(p - axis(H - 0.5)) + 1e-9) * 0.7)
        if lod == 0:                                                  # dead stubs under the crown
            yy = 0.9
            while yy < cb:
                for k in range(3):
                    a = R.random() * 6.28; d = np.array([np.cos(a), -0.25, np.sin(a)]); p0 = axis(yy) + d * rad(yy) * 0.8
                    tube(wood, [p0, p0 + d * (0.15 + 0.45 * R.random())], [0.014, 0.004], 3, 1, 1.1)
                yy += 0.5 + 0.3 * R.random()
    wo, no = wood.out(), nd.out()
    reach = np.linalg.norm((no if no is not None else wo)['P'][:, [0, 2]], axis=1)
    meta = dict(h=round(float(top), 3), r=round(float(rad(1.3)), 3), top=round(float(min(top, max(cb + 1.5, 0.55 * top))), 3), crown=round(float(np.percentile(reach, 99.5)), 3),
                cb=round(float(cb), 3))
    return wo, no, meta


def bush(seed, size):
    R = np.random.default_rng(seed); M = Mesh(); wood = Mesh()
    c = np.array([0, size * 0.35, 0])
    for k in range(int(16 + 8 * R.random())):
        a = R.random() * 6.28; el = 0.15 + R.random() * 0.9
        d = np.array([np.cos(a) * np.cos(el), np.sin(el), np.sin(a) * np.cos(el)])
        L = size * (0.55 + 0.45 * R.random())
        p0 = np.array([0, 0.05, 0]) + d * 0.08
        p1 = p0 + d * L * 0.55 + np.array([0, 0.06, 0]); p2 = p0 + d * L
        side = np.cross(d, np.array([0, 1.0, 0])) if abs(d[1]) < 0.95 else np.array([1.0, 0, 0]); side /= np.linalg.norm(side)
        sd = rot_axis(side, d, R.normal(0, 0.6))
        u0 = 0.0 if k % 2 else 0.5
        card(M, [p0, p1, p2], sd, [0.08, size * 0.32, size * 0.2], u0 + 0.01, u0 + 0.49,
             lambda p: (lambda v: v / np.linalg.norm(v))((p - c) / (np.linalg.norm(p - c) + 1e-9) * 0.75 + np.array([0, 0.35, 0])))
        if k % 3 == 0: tube(wood, [np.array([0, 0, 0]), p1], [0.018, 0.008], 3, 1, 1.1)
    return wood.out(), M.out(), dict(h=round(size * 0.9, 3), r=0.0, top=0.0, crown=round(size, 3))


# ---------------------------------------------------------------- textures
def bleed(rgba):
    """fill the colour of transparent texels from their opaque neighbours (no dark fringes in the mips)"""
    a = rgba[..., 3:4].astype(np.float64) / 255; c = rgba[..., :3].astype(np.float64)
    out = c.copy(); have = a[..., 0] > 0.5
    acc_c, acc_w = c * a, a.copy()
    for r in (2, 4, 8, 16, 32, 64):
        bc = np.asarray(Image.fromarray(np.clip(acc_c, 0, 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(r))).astype(np.float64)
        bw = np.asarray(Image.fromarray(np.clip(acc_w[..., 0] * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(r))).astype(np.float64)[..., None] / 255
        fill = (~have) & (bw[..., 0] > 0.01)
        out[fill] = (bc[fill] / bw[fill])
        have = have | fill
        acc_c = out * have[..., None]; acc_w = have[..., None].astype(np.float64)
    res = rgba.copy(); res[..., :3] = np.clip(out, 0, 255).astype(np.uint8); return res


def normal_from_height(h, strength, wrap=True):
    if wrap:
        dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5; dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    else:
        dx = np.gradient(h, axis=1); dy = np.gradient(h, axis=0)
    # image rows run down; a normal map's green is +v up (glTF / OpenGL): rows down = -y
    n = np.dstack([-dx * strength, dy * strength, np.ones_like(h)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    return Image.fromarray(np.clip((n * 0.5 + 0.5) * 255 + 0.5, 0, 255).astype(np.uint8))


def blur(a, r, wrap=True):
    """separable gaussian (sigma r px), wrapped (tileable) or mirrored at the edges"""
    k = int(r * 3) + 1; x = np.arange(-k, k + 1); w = np.exp(-x * x / (2 * r * r)); w /= w.sum()
    p = np.pad(np.asarray(a, np.float64), k, mode='wrap' if wrap else 'reflect')
    p = sum(w[i] * p[:, i:i + p.shape[1] - 2 * k] for i in range(2 * k + 1))
    p = sum(w[i] * p[i:i + p.shape[0] - 2 * k, :] for i in range(2 * k + 1))
    return p


def tile_noise(W, H, cells_x, cells_y, seed):
    """tileable value noise, smooth, 0..1"""
    R = np.random.default_rng(seed); g = R.random((cells_y, cells_x))
    y, x = np.mgrid[0:H, 0:W]
    fx = x / W * cells_x; fy = y / H * cells_y
    x0 = np.floor(fx).astype(int); y0 = np.floor(fy).astype(int); tx = fx - x0; ty = fy - y0
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty)
    x1 = (x0 + 1) % cells_x; y1 = (y0 + 1) % cells_y; x0 %= cells_x; y0 %= cells_y
    a = g[y0, x0] + (g[y0, x1] - g[y0, x0]) * tx; b = g[y1, x0] + (g[y1, x1] - g[y1, x0]) * tx
    return a + (b - a) * ty


def fbm(W, H, base, octaves, seed, aspect=1.0):
    v, amp, tot = np.zeros((H, W)), 1.0, 0.0
    for o in range(octaves):
        cx = int(base * 2 ** o); cy = max(1, int(base * 2 ** o * aspect))
        v += tile_noise(W, H, cx, cy, seed + o) * amp; tot += amp; amp *= 0.5
    return v / tot


def worley(W, H, cx, cy, seed, stretch=1.0):
    """tileable cellular noise: F1, F2 (in cell units) and the cell id, cells cx x cy"""
    R = np.random.default_rng(seed); pts = R.random((cy, cx, 2))
    y, x = np.mgrid[0:H, 0:W]; fx = x / W * cx; fy = y / H * cy
    ix = np.floor(fx).astype(int); iy = np.floor(fy).astype(int)
    F1 = np.full((H, W), 9.0); F2 = np.full((H, W), 9.0); ID = np.zeros((H, W), int)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            jx = (ix + ox) % cx; jy = (iy + oy) % cy
            px = ix + ox + pts[jy, jx, 0]; py = iy + oy + pts[jy, jx, 1]
            d = np.sqrt(((fx - px)) ** 2 + ((fy - py) * stretch) ** 2)
            n2 = np.where(d < F1, F1, np.minimum(F2, d)); ID = np.where(d < F1, jy * cx + jx, ID); F1 = np.minimum(F1, d); F2 = n2
    return F1, F2, ID


def tex_pine_bark(W=512, H=1024):
    """tileable spruce / pine bark: flaking plates split by deep fissures (0.5 m wide x 1.1 m tall a tile)"""
    F1, F2, ID = worley(W, H, 7, 9, 31, stretch=0.55)
    edge = F2 - F1                                                    # 0 on the fissures
    R = np.random.default_rng(32); cellh = R.random(7 * 9)[ID]
    flake = fbm(W, H, 16, 4, 33, aspect=2.0)
    fine = fbm(W, H, 64, 3, 34, aspect=2.0)
    fiss = np.clip(edge / 0.16, 0, 1) ** 0.6
    h = fiss * (0.75 + 0.25 * cellh) + (flake - 0.5) * 0.25 + (fine - 0.5) * 0.08
    lich = np.clip((fbm(W, H, 6, 4, 35, 2.0) - 0.62) * 6, 0, 1) * fiss
    base = np.array([0.135, 0.112, 0.094]) * (0.75 + 0.35 * cellh[..., None]) * (0.8 + 0.4 * flake[..., None])
    base = base * (0.25 + 0.75 * fiss[..., None])                     # dark fissures
    base = base * (1 - lich[..., None]) + np.array([0.42, 0.45, 0.38]) * lich[..., None] * (0.8 + 0.3 * fine[..., None])
    alb = Image.fromarray(np.clip((base ** (1 / 2.2)) * 255, 0, 255).astype(np.uint8))
    nor = normal_from_height(blur(h, 0.8), 9.0)
    ao = 0.35 + 0.65 * fiss; rough = 0.92 - 0.15 * fiss * (1 - lich)
    orm = Image.fromarray(np.clip(np.dstack([ao, rough, np.zeros_like(ao)]) * 255, 0, 255).astype(np.uint8))
    return alb, nor, orm


def tex_needles(W=1024, H=512):
    """two needle sprays side by side (u 0..0.5, 0.5..1; base at the left of each, tip at the right), alpha"""
    S = 2; im = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    hgt = Image.new('L', (W * S, H * S), 0); dh = ImageDraw.Draw(hgt)
    R = np.random.default_rng(41)
    for k in range(2):
        x0, x1 = k * W * S // 2 + 6 * S, (k + 1) * W * S // 2 - 8 * S
        cy = H * S / 2; Lx = x1 - x0
        twig = lambda u: (x0 + u * Lx, cy + math.sin(u * 3.1) * H * S * 0.04 * (1 if k else -1))
        def needles(ax, ay, bx, by, n_len, dens, w):
            L = math.hypot(bx - ax, by - ay); n = int(L / dens)
            tx, ty = (bx - ax) / (L + 1e-9), (by - ay) / (L + 1e-9)
            for i in range(n):
                u = i / max(1, n - 1); px, py = ax + (bx - ax) * u, ay + (by - ay) * u
                for s in (-1, 1):
                    ang = (0.95 + R.normal(0, 0.18)) * s
                    c, sn = math.cos(ang), math.sin(ang)
                    dx, dy = tx * c - ty * sn, tx * sn + ty * c
                    ln = n_len * (0.75 + 0.45 * R.random()) * (1 - 0.45 * u)
                    g = 0.55 + 0.45 * R.random()
                    col = (int(26 * g + 8 * k), int(52 * g + 6 * k), int(36 * g), 255)
                    dr.line([(px, py), (px + dx * ln, py + dy * ln)], fill=col, width=w)
                    dh.line([(px, py), (px + dx * ln, py + dy * ln)], fill=int(150 + 100 * R.random()), width=w)
        # main twig + side twigs (alternating, angled forward)
        main = [twig(u) for u in np.linspace(0, 1, 40)]
        dr.line(main, fill=(58, 46, 34, 255), width=5 * S); dh.line(main, fill=110, width=5 * S)
        u = 0.06
        while u < 0.92:
            ax, ay = twig(u); s = 1 if int(u * 100) % 2 else -1
            ang = s * (0.62 + R.normal(0, 0.1)); ln = Lx * (0.36 - 0.24 * u) * (0.85 + 0.3 * R.random())
            bx, by = ax + math.cos(ang) * ln, ay + math.sin(ang) * ln
            bx, by = min(bx, x1), max(4 * S, min(H * S - 4 * S, by))
            dr.line([(ax, ay), (bx, by)], fill=(64, 52, 38, 255), width=3 * S); dh.line([(ax, ay), (bx, by)], fill=100, width=3 * S)
            needles(ax, ay, bx, by, 30 * S, 3.2 * S, 2 * S)
            u += 0.045 + 0.025 * R.random()
        needles(*twig(0.0), *twig(1.0), 34 * S, 3.0 * S, 2 * S)
    im = im.convert('RGBa').resize((W, H), Image.LANCZOS).convert('RGBA')
    a = np.asarray(im).copy()
    a[..., 3] = np.clip(a[..., 3].astype(np.float64) * 1.25, 0, 255).astype(np.uint8)   # thin needles keep coverage in the mips
    a = bleed(a)
    h = np.asarray(hgt.resize((W, H), Image.LANCZOS)).astype(np.float64) / 255
    nor = normal_from_height(blur(h, 0.7, wrap=False), 3.0, wrap=False)
    return Image.fromarray(a), nor


def tex_floor(N=1024):
    """forest floor, 2.5 m a tile: dark soil, needle litter, moss mats, small stones"""
    soil = fbm(N, N, 8, 5, 51); moss_n = fbm(N, N, 5, 5, 52); grit = fbm(N, N, 96, 2, 53)
    R = np.random.default_rng(54)
    img = Image.new('RGB', (N, N), 0); hgt = np.zeros((N, N))
    lit = Image.new('L', (N, N), 0); dl = ImageDraw.Draw(lit); col = Image.new('RGB', (N, N), (0, 0, 0)); dc = ImageDraw.Draw(col)
    for i in range(9000):                                              # needles: 15-30 mm, 2.5 m / 1024 px = 2.4 mm a texel
        x, y = R.random() * N, R.random() * N; a = R.random() * 6.28; L = 6 + R.random() * 7
        x2, y2 = x + math.cos(a) * L, y + math.sin(a) * L
        g = R.random(); c = (int(70 + 50 * g), int(48 + 30 * g), int(30 + 16 * g)) if R.random() < 0.7 else (int(40 + 20 * g), int(34 + 14 * g), int(24 + 10 * g))
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                dl.line([(x + ox, y + oy), (x2 + ox, y2 + oy)], fill=200, width=1); dc.line([(x + ox, y + oy), (x2 + ox, y2 + oy)], fill=c, width=1)
    stones = np.zeros((N, N)); st_col = np.zeros((N, N))
    yy, xx = np.mgrid[0:N, 0:N]
    for i in range(140):
        cx, cy, r = R.random() * N, R.random() * N, 3 + R.random() ** 2 * 14
        dx = (xx - cx + N / 2) % N - N / 2; dy = (yy - cy + N / 2) % N - N / 2
        d = np.sqrt(dx * dx + dy * dy * (1 + R.random() * 0.6)) / r
        m = np.clip(1 - d, 0, 1); stones = np.maximum(stones, np.sqrt(m)); st_col = np.where(m > 0, 0.4 + 0.3 * R.random(), st_col)
    litter = np.asarray(lit).astype(np.float64) / 255; lc = np.asarray(col).astype(np.float64) / 255
    moss = np.clip((moss_n - 0.5) * 5, 0, 1)
    base = np.array([0.085, 0.065, 0.05]) * (0.7 + 0.6 * soil[..., None]) * (0.85 + 0.3 * grit[..., None])
    base = base * (1 - litter[..., None] * 0.9) + lc ** 2.2 * litter[..., None] * 0.9
    mosscol = np.array([0.05, 0.075, 0.025]) * (0.7 + 0.6 * fbm(N, N, 40, 3, 55)[..., None])
    base = base * (1 - moss[..., None]) + mosscol * moss[..., None]
    sg = stones > 0.05
    base[sg] = (base[sg] * (1 - stones[sg, None]) + (np.array([0.16, 0.16, 0.15]) * st_col[sg, None]) * stones[sg, None])
    h = soil * 0.4 + litter * 0.25 + moss * 0.35 * (0.6 + 0.4 * grit) + stones * 0.8
    rough = 0.95 - 0.25 * stones - 0.05 * litter
    ao = 0.55 + 0.45 * np.clip(blur(h, 3) * 1.4, 0, 1)
    alb = Image.fromarray(np.clip(base ** (1 / 2.2) * 255, 0, 255).astype(np.uint8))
    return alb, normal_from_height(blur(h, 0.7), 6.0), Image.fromarray(np.clip(np.dstack([ao, rough, np.zeros_like(h)]) * 255, 0, 255).astype(np.uint8))



def regrade_rock(im, sat=0.45, tint=(0.96, 0.99, 1.03), gain=0.85):
    a = np.asarray(im.convert('RGB')).astype(np.float64) / 255; L = (a @ np.array([0.2126, 0.7152, 0.0722]))[..., None]
    out = (L + (a - L) * sat) * np.array(tint) * gain
    return Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8))


def bark_from_photo(im):
    """a normal and an ORM (AO from the dark cracks, roughness) derived from the pack's bark photo atlas"""
    a = np.asarray(im.convert('RGB')).astype(np.float64) / 255; L = a @ np.array([0.2126, 0.7152, 0.0722])
    hp = L - blur(L, 6, wrap=False)
    h = blur(hp, 0.8, wrap=False)
    nor = normal_from_height(h, 14.0, wrap=False)
    ao = np.clip(0.55 + hp * 3.0 + 0.45, 0.3, 1); rough = np.clip(0.9 - hp * 0.6, 0.7, 1)
    return nor, Image.fromarray(np.clip(np.dstack([ao, rough, np.zeros_like(L)]) * 255, 0, 255).astype(np.uint8))


def enc(im, size=None, lossless=False, q=86):
    if size and max(im.size) > size:
        k = size / max(im.size); im = im.resize((max(4, round(im.size[0] * k)), max(4, round(im.size[1] * k))), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=q, method=6, lossless=lossless, exact=True); return b.getvalue()


def src_img(j, b, ti):
    im = j['images'][j['textures'][ti]['source']]; v = j['bufferViews'][im['bufferView']]
    return Image.open(io.BytesIO(b[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]))


# ---------------------------------------------------------------- impostors (LOD2: two crossed cards)
def raster(prims, W, H, x0, x1, y0, y1, axis=2):
    """orthographic side view (looking along -axis), alpha-tested albedo + a lambert-ish crown term; RGBA float"""
    img = np.zeros((H, W, 4)); zb = np.full((H, W), -1e9)
    for g, T, alpha in prims:
        P = g['P']; X = P[:, 0] if axis == 2 else -P[:, 2]; Y = P[:, 1]; Z = P[:, 2] if axis == 2 else P[:, 0]
        sx = (X - x0) / (x1 - x0) * W; sy = (y1 - Y) / (y1 - y0) * H
        sh = 0.62 + 0.38 * np.clip(g['N'] @ np.array([0.0, 0.55, 0.83]) * 0.5 + 0.5, 0, 1)
        Th, Tw = T.shape[:2]
        for t in g['I'].reshape(-1, 3):
            bx0, bx1 = int(max(0, np.floor(sx[t].min()))), int(min(W - 1, np.ceil(sx[t].max())))
            by0, by1 = int(max(0, np.floor(sy[t].min()))), int(min(H - 1, np.ceil(sy[t].max())))
            if bx1 < bx0 or by1 < by0: continue
            yy, xx = np.mgrid[by0:by1 + 1, bx0:bx1 + 1] + 0.5
            (ax, ay), (bx, by), (qx, qy) = [(sx[k], sy[k]) for k in t]
            d = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy)
            if abs(d) < 1e-9: continue
            w0 = ((by - qy) * (xx - qx) + (qx - bx) * (yy - qy)) / d; w1 = ((qy - ay) * (xx - qx) + (ax - qx) * (yy - qy)) / d; w2 = 1 - w0 - w1
            ins = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
            if not ins.any(): continue
            u = w0 * g['UV'][t[0], 0] + w1 * g['UV'][t[1], 0] + w2 * g['UV'][t[2], 0]
            v = w0 * g['UV'][t[0], 1] + w1 * g['UV'][t[1], 1] + w2 * g['UV'][t[2], 1]
            c = T[(np.mod(v, 1) * (Th - 1)).astype(int), (np.mod(u, 1) * (Tw - 1)).astype(int)]
            ok = ins & ((c[..., 3] > 0.5) if alpha else True)
            z = w0 * Z[t[0]] + w1 * Z[t[1]] + w2 * Z[t[2]]
            k = w0 * sh[t[0]] + w1 * sh[t[1]] + w2 * sh[t[2]]
            ys, xs = yy.astype(int)[ok], xx.astype(int)[ok]; zz = z[ok]
            m = zz > zb[ys, xs]; ys, xs = ys[m], xs[m]
            zb[ys, xs] = zz[m]
            img[ys, xs, :3] = c[..., :3][ok][m] * k[ok][m, None]; img[ys, xs, 3] = 1
    return img


def impostor_cell(prims, W, H):
    """two views (along z and along x), each W/2 x H: (rgba image, half width, height)"""
    allP = np.concatenate([g['P'] for g, _, _ in prims])
    hw = float(max(np.abs(allP[:, 0]).max(), np.abs(allP[:, 2]).max())) * 1.02; ht = float(allP[:, 1].max()) * 1.01
    out = []
    for axis in (2, 0):
        im = raster(prims, W, H * 2, -hw, hw, 0, ht, axis) if False else raster(prims, W * 2, H * 2, -hw, hw, 0, ht, axis)
        a = Image.fromarray(np.clip(np.dstack([im[..., :3] ** (1 / 1.0), im[..., 3]]) * 255, 0, 255).astype(np.uint8), 'RGBA')
        out.append(a.convert('RGBa').resize((W, H), Image.LANCZOS).convert('RGBA'))
    return out, hw, ht


def impostor_mesh(hw, ht, cell_uv):
    """two crossed vertical cards (z-facing, x-facing), 3 x 4 vertices each, normals bent like a crown"""
    M = Mesh()
    for q, (u0, v0, u1, v1) in enumerate(cell_uv):
        P, N, UV, I = [], [], [], []
        for iy in range(4):
            for ix in range(3):
                fx, fy = ix / 2, iy / 3
                x = (fx * 2 - 1) * hw; y = fy * ht
                p = np.array([x, y, 0.0]) if q == 0 else np.array([0.0, y, -x])
                side = np.array([fx * 2 - 1, 0, 0]) if q == 0 else np.array([0, 0, -(fx * 2 - 1)])
                n = (np.array([0, 0, 1.0]) if q == 0 else np.array([1.0, 0, 0])) * 0.55 + side * 0.6 + np.array([0, 0.25 + 0.3 * fy, 0])
                P.append(p); N.append(n); UV.append([u0 + (u1 - u0) * fx, v1 + (v0 - v1) * fy])
        for iy in range(3):
            for ix in range(2):
                a = iy * 3 + ix; I += [a, a + 1, a + 3, a + 1, a + 4, a + 3]
        M.add(P, N, UV, I)
    return M.out()


# ---------------------------------------------------------------- the GLB
class Out(GLB):
    def __init__(self, src_asset):
        super().__init__()
        self.j['asset']['generator'] = 'tools/pack_nature.py'
        self.j['asset']['extras'] = {'source': src_asset, 'made': 'pines, snags, bushes, pine bark, needles, floor and rock detail generated by tools/pack_nature.py'}
        self.j['samplers'].append({'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497})   # 1: repeat

    def tex2(self, data, repeat=False):
        t = self.tex(data)
        if repeat: self.j['textures'][t]['sampler'] = 1
        return t

    def node2(self, name, prims, extras):
        self.node(name, prims); self.j['nodes'][-1]['extras'] = extras


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'nature.glb'
    j, b = load(src)
    G = Out(j['asset'].get('extras', {}))
    names = {}
    for k, n in enumerate(j['nodes']): names[n.get('name')] = k
    TX = {}
    def mat_of(name): return next(m for m in j['materials'] if m['name'] == name)
    # --- textures ---
    pb = src_img(j, b, mat_of('trees')['pbrMetallicRoughness']['baseColorTexture']['index'])
    pbn, pbo = bark_from_photo(pb)
    TX['packBark'] = (G.tex2(enc(pb.convert('RGB'), 1024, q=80)), G.tex2(enc(pbn, 512)), G.tex2(enc(pbo, 256)))
    alb, nor, orm = tex_pine_bark()
    TX['pineBark'] = (G.tex2(enc(alb), True), G.tex2(enc(nor), True), G.tex2(enc(orm, 256), True))
    nd, ndn = tex_needles()
    TX['needles'] = (G.tex2(enc(nd, lossless=False, q=90)), G.tex2(enc(ndn, 512)))
    for m in ('leaf_1', 'plant', 'plant2', 'plant3'):
        im = np.asarray(src_img(j, b, mat_of(m)['pbrMetallicRoughness']['baseColorTexture']['index']).convert('RGBA')).copy()
        TX[m] = (G.tex2(enc(Image.fromarray(bleed(im)), 512, q=88)),)
    for m in ('rock_Final', 'rock2_low', 'stump_final', 'stump2_final', 'stump4_final'):
        mm = mat_of(m); p = mm['pbrMetallicRoughness']
        base = src_img(j, b, p['baseColorTexture']['index']); ormi = src_img(j, b, p['metallicRoughnessTexture']['index']).convert('RGB')
        o = np.asarray(ormi).astype(np.float64) / 255; o[..., 2] = 0            # no metal
        rock = m.startswith('rock')
        big = m == 'rock_Final'
        TX[m] = (G.tex2(enc(regrade_rock(base) if rock else regrade_rock(base, 0.7, (1.0, 0.98, 0.95), 0.9), 1024 if big else 512)),
                 G.tex2(enc(src_img(j, b, mm['normalTexture']['index']).convert('RGB'), 1024 if big else 512)),
                 G.tex2(enc(Image.fromarray(np.clip(o * 255, 0, 255).astype(np.uint8)), 512)))
    fa, fn, fo = tex_floor()
    TX['floor'] = (G.tex2(enc(fa), True), G.tex2(enc(fn, 512), True), G.tex2(enc(fo, 256), True))
    # --- materials (the game builds its own from these textures; names say which) ---
    MI = {}
    def mat(name, t, alpha=False):
        m = {'name': name, 'pbrMetallicRoughness': {'baseColorTexture': {'index': t[0]}, 'metallicFactor': 0.0, 'roughnessFactor': 1.0}, 'doubleSided': alpha}
        if len(t) > 1: m['normalTexture'] = {'index': t[1]}
        if len(t) > 2: m['pbrMetallicRoughness']['metallicRoughnessTexture'] = {'index': t[2]}; m['occlusionTexture'] = {'index': t[2]}
        if alpha: m['alphaMode'] = 'MASK'; m['alphaCutoff'] = 0.5
        G.j['materials'].append(m); MI[name] = len(G.j['materials']) - 1
    mat('packBark', TX['packBark']); mat('pineBark', TX['pineBark']); mat('needles', TX['needles'], True)
    for k, m in (('leaf1', 'leaf_1'), ('fern1', 'plant'), ('weed', 'plant2'), ('fern2', 'plant3')): mat(k, TX[m], True)
    for k, m in (('rock1', 'rock_Final'), ('rock2', 'rock2_low'), ('stump1', 'stump_final'), ('stump2', 'stump2_final'), ('stump3', 'stump4_final')): mat(k, TX[m])
    mat('floor', TX['floor'])
    report = []; LOD0 = {}
    def emit(name, prims, extras):
        if name.endswith('_0'): LOD0[name[:-2]] = (list(prims), dict(extras))
        prims = [(g, MI[m]) for g, m in prims if g is not None and len(g['I'])]
        extras['tris'] = int(sum(tri_count(g) for g, _ in prims))
        G.node2(name, prims, extras); report.append((name, extras['tris'], extras.get('h')))
    # --- the pack's trees: leafy (two LODs) and dead (wood only) ---
    for key, node, leafmat, H, Hd, leafy_too in (('A', 'tree_001_Final', 'leaf1', 10.5, 9.0, True), ('B', 'tree_002_final', 'leaf2', 9.5, 8.0, False), ('C', 'tree_003_final', 'leaf3', 11.5, 10.5, False)):
        parts = collect(j, b, names[node])
        wood = concat(parts['trees']); leaves = parts[next(k for k in parts if k != 'trees')]
        y0 = wood['P'][:, 1].min(); low = wood['P'][wood['P'][:, 1] < y0 + 0.02]; bc = low.mean(0); bc[1] = y0
        top = max(wood['P'][:, 1].max(), max(l['P'][:, 1].max() for l in leaves)) - y0
        for leafy, Ht in ((True, H),) if leafy_too else ((False, Hd),):
            s = Ht / top
            w = xform(wood, s, -bc * s)
            r13 = slice_radius(w, 1.3)
            ex = dict(h=round(Ht, 3), r=round(r13, 3), top=round(Ht * 0.45, 3))
            w1 = weld_cluster(w, 0.2 * Ht / 10)
            if leafy:
                L = [xform(l, s, -bc * s) for l in leaves]
                allp = np.concatenate([l['P'] for l in L]); cc = allp.mean(0)
                ex['crown'] = round(float(np.percentile(np.linalg.norm(allp[:, [0, 2]] - cc[[0, 2]], axis=1), 90)), 3)
                L0 = concat([bend_normals(dict(l), cc) for l in L])
                L1p = []
                for i, l in enumerate(L):
                    if i % 5: continue
                    l = dict(l); c = l['P'].mean(0); l['P'] = c + (l['P'] - c) * 1.9; L1p.append(bend_normals(l, cc))
                emit('leaf%s_0' % key, [(w, 'packBark'), (L0, leafmat)], dict(ex))
                emit('leaf%s_1' % key, [(w1, 'packBark'), (concat(L1p), leafmat)], dict(ex))
            else:
                ex['crown'] = round(float(np.percentile(np.linalg.norm(w['P'][:, [0, 2]], axis=1), 95)), 3)
                emit('dead%s_0' % key, [(w, 'packBark')], dict(ex))
                emit('dead%s_1' % key, [(w1, 'packBark')], dict(ex))
    # --- generated pines, snags, bushes ---
    for key, H, seed in (('A', 16.5, 101), ('B', 20.5, 202), ('C', 13.0, 303)):
        for lod in (0, 1):
            wd, nd_, ex = pine(H, seed, lod)
            emit('pine%s_%d' % (key, lod), [(wd, 'pineBark'), (nd_, 'needles')], ex)
    for key, H, seed in (('A', 14.0, 404), ('B', 10.0, 505)):
        for lod in (0, 1):
            wd, _, ex = pine(H, seed, lod, dead=True)
            emit('snag%s_%d' % (key, lod), [(wd if lod == 0 else weld_cluster(wd, 0.06), 'pineBark')], ex)
    for key, sz, seed in (('A', 1.1, 606), ('B', 0.75, 707)):
        wd, nd_, ex = bush(seed, sz)
        emit('bush%s' % key, [(wd, 'pineBark'), (nd_, 'needles')], ex)
    # --- impostors: every tree's LOD0 rendered from two sides into one atlas (cells 192 x 384) ---
    IMG = {}
    for m in G.j['materials']:
        ti = m['pbrMetallicRoughness']['baseColorTexture']['index']; v = G.j['bufferViews'][G.j['images'][G.j['textures'][ti]['source']]['bufferView']]
        IMG[m['name']] = (np.asarray(Image.open(io.BytesIO(bytes(G.bin[v['byteOffset']:v['byteOffset'] + v['byteLength']]))).convert('RGBA')).astype(np.float64) / 255, m.get('alphaMode') == 'MASK')
    kinds = [k for k in LOD0 if not k.startswith('bush')]
    CW, CH, cols = 192, 384, 4
    rows = (len(kinds) * 2 + cols - 1) // cols
    atlas = Image.new('RGBA', (CW * cols, CH * rows), (0, 0, 0, 0)); cells = {}
    for i, k in enumerate(kinds):
        prims, ex = LOD0[k]
        ims, hw, ht = impostor_cell([(g, IMG[m][0], IMG[m][1]) for g, m in prims], CW, CH)
        uv = []
        for q in range(2):
            c = i * 2 + q; cx, cy = (c % cols) * CW, (c // cols) * CH
            atlas.paste(ims[q], (cx, cy)); uv.append(((cx + 1) / atlas.size[0], (cy + 1) / atlas.size[1], (cx + CW - 1) / atlas.size[0], (cy + CH - 1) / atlas.size[1]))
        cells[k] = (hw, ht, uv)
    a = bleed(np.asarray(atlas).copy())
    TX['impostor'] = (G.tex2(enc(Image.fromarray(a), q=88)),)
    mat('impostor', TX['impostor'], True)
    for k in kinds:
        hw, ht, uv = cells[k]; ex = dict(LOD0[k][1]); ex['hw'] = round(hw, 3)
        emit(k + '_2', [(impostor_mesh(hw, ht, uv), 'impostor')], ex)
    # --- rocks, stumps, plants ---
    for key, node, m, size, sink in (('rockA', 'rock', 'rock1', 1.6, 0.14), ('rockB', 'rock2', 'rock2', 1.2, 0.12),
                                      ('stumpA', 'stump', 'stump1', 0.75, 0.06), ('stumpB', 'stump2', 'stump2', 0.6, 0.05), ('stumpC', 'stump3', 'stump3', 0.55, 0.05)):
        g = concat(collect(j, b, names[node])[{'rock1': 'rock_Final', 'rock2': 'rock2_low', 'stump1': 'stump_final', 'stump2': 'stump2_final', 'stump3': 'stump4_final'}[m]])
        lo, hi = g['P'].min(0), g['P'].max(0); c = (lo + hi) / 2; s = size / max(hi[0] - lo[0], hi[2] - lo[2])
        c[1] = lo[1] + (hi[1] - lo[1]) * sink
        g = xform(g, s, -c * s)
        above = g['P'][g['P'][:, 1] > -0.02]
        hull = far_points(np.unique(np.round(above, 3), axis=0), 40)
        lo2, hi2 = g['P'].min(0), g['P'].max(0)
        emit(key, [(g, m)], dict(h=round(float(hi2[1]), 3), r=round(float(max(hi2[0] - lo2[0], hi2[2] - lo2[2]) / 2), 3), size=[round(float(v), 3) for v in (hi2 - lo2)],
                                 hull=[round(float(v), 3) for v in hull.ravel()]))
    for key, node, m, size in (('fernA', 'plant', 'fern1', 1.0), ('fernB', 'plant3', 'fern2', 1.3), ('weed', 'plant2', 'weed', 0.5)):
        g = concat(collect(j, b, names[node])[{'fern1': 'plant', 'fern2': 'plant3', 'weed': 'plant2'}[m]])
        lo, hi = g['P'].min(0), g['P'].max(0); c = (lo + hi) / 2; c[1] = lo[1]; s = size / max(hi[0] - lo[0], hi[2] - lo[2])
        g = xform(g, s, -c * s); g = bend_normals(g, np.array([0, -0.2 * size, 0]), 0.5, 0.4)
        emit(key, [(g, m)], dict(h=round(float(g['P'][:, 1].max()), 3), r=0.0, crown=round(size / 2, 3)))
    # --- material holders: the forest floor and the rock detail (1 m quads) ---
    q = dict(P=np.array([[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]]),
             N=np.tile([0, 1.0, 0], (4, 1)), UV=np.array([[0, 0], [1, 0], [1, 1], [0, 1.0]]), I=np.array([0, 2, 1, 0, 3, 2]), T=None)
    emit('floorMat', [(q, 'floor')], dict(tile=2.5))
    n = G.write(OUT)
    for r in report: print('%-10s %6d tris  h %s' % r)
    print(OUT, n, 'bytes')


if __name__ == '__main__':
    main()
