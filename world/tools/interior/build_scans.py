"""Build the apartment's surface textures from the CC0 scans in .cache/scans (fetch_scans.py).

Floors are laid board by board: every board is a window of a real oak veneer scan (grain,
pores, normal and roughness kept), turned to its direction, given its own colour from the
reference photos' measured palette (apartment-17 Versailles parquet, apartment-19 herringbone),
with eased edges and a dark hairline joint. Stones are the scans colour-matched to the photos and
cut into slabs.

Writes world/textures/scans/<name>_{diff,nor,arm}.webp (computer) and quest/<same> (half size).
arm: R = ambient occlusion, G = roughness, B = metalness (three.js reads G and B from one map).
Also <name>.json: the metres one texture repeat covers.
Run: python3 -I build_scans.py [name ...]
"""
import json, math, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, '.cache', 'scans')
DST = os.path.join(ROOT, 'textures', 'scans')
LUMW = np.array([0.2126, 0.7152, 0.0722])


def to_lin(a):
    a = a / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def to_srgb(a):
    a = np.clip(a, 0, 1)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055) * 255


def load(name, key, size=None, mode='RGB'):
    p = os.path.join(SRC, name, key + '.jpg')
    if not os.path.exists(p):
        return None
    im = Image.open(p).convert(mode)
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return np.asarray(im, np.float32)


def rng(seed):
    return np.random.default_rng(seed)


def bilinear(img, x, y):
    """img HxWxC (wraps), x, y float pixel coords (any shape)"""
    H, W = img.shape[:2]
    x0 = np.floor(x).astype(np.int64); y0 = np.floor(y).astype(np.int64)
    fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    x0 %= W; y0 %= H; x1 = (x0 + 1) % W; y1 = (y0 + 1) % H
    a = img[y0, x0]; b = img[y0, x1]; c = img[y1, x0]; d = img[y1, x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def save(name, diff_lin, nrm, rough, ao, metres, quest=True):
    """diff_lin HxWx3 linear, nrm HxWx3 unit (x right, y up, z out), rough / ao HxW 0..1"""
    os.makedirs(os.path.join(DST, 'quest'), exist_ok=True)
    d = Image.fromarray(to_srgb(diff_lin).astype(np.uint8), 'RGB')
    n = Image.fromarray(np.clip((nrm * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8), 'RGB')
    arm = np.stack([ao, rough, np.zeros_like(rough)], -1)
    a = Image.fromarray(np.clip(arm * 255, 0, 255).astype(np.uint8), 'RGB')
    for im, k, q in ((d, 'diff', 90), (n, 'nor', 92), (a, 'arm', 90)):
        im.save(os.path.join(DST, f'{name}_{k}.webp'), quality=q, method=6)
        if quest:
            im.resize((im.width // 2, im.height // 2), Image.LANCZOS).save(os.path.join(DST, 'quest', f'{name}_{k}.webp'), quality=q, method=6)
    json.dump({'metres': metres, 'px': [d.width, d.height]}, open(os.path.join(DST, name + '.json'), 'w'))
    print(name, d.size, 'metres', metres, 'mean albedo', diff_lin.reshape(-1, 3).mean(0).round(3))


# ---- board sources -----------------------------------------------------------------------
# (scan, quarter turns so the grain runs along u, weight); the scans are 1 m x 1 m
OAKS = [('oak_grey2', 0, 3), ('oak_silver', 0, 2), ('oak_white', 1, 2), ('oak_grey1', 0, 1), ('oak_washed', 0, 1)]


class Boards:
    def __init__(self, ppm):
        """ppm: output pixels per metre; sources are resampled to that density"""
        self.src = []
        S = int(round(ppm))
        for name, rot, w in OAKS:
            c = to_lin(load(name, 'diff', (S, S)))
            n = load(name, 'nor', (S, S)) / 127.5 - 1
            r = load(name, 'rough', (S, S), 'L') / 255
            if rot:
                c = np.rot90(c, rot); n = np.rot90(n, rot); r = np.rot90(r, rot)
                # rotate the tangent vector too (image y down: (x, y_up) turns with the image)
                for _ in range(rot):
                    n = np.stack([-n[..., 1], n[..., 0], n[..., 2]], -1)
            lum = c @ LUMW
            self.src.append(dict(c=np.ascontiguousarray(c), n=np.ascontiguousarray(n), r=np.ascontiguousarray(r),
                                 rel=np.ascontiguousarray(lum / lum.mean()), cmean=c.reshape(-1, 3).mean(0), w=w))
        self.S = S
        ws = np.array([s['w'] for s in self.src], float)
        self.cum = np.cumsum(ws) / ws.sum()


def lay(boards, ids, along, across, ang, edge, tint, H, W, ppm, seed, contrast=1.0, rough=(0.5, 0.66), bevel=0.0011, mir=None):
    """Fill a floor from a board layout.
    ids: int board id per pixel; along / across: metres inside the board; ang: grain angle (rad,
    image coords, y down); edge: metres to the nearest board edge; tint(id_count, rng) -> per-board
    linear colours (n x 3); mir: True where the board's across axis is the mirror of
    (-sin a, cos a) (left-handed local frame), so the normal's across component flips."""
    R = rng(seed)
    uid, inv = np.unique(ids, return_inverse=True)
    inv = inv.reshape(ids.shape)
    nb = len(uid)
    pick = np.searchsorted(boards.cum, R.random(nb))
    offx = R.random(nb) * boards.S; offy = R.random(nb) * boards.S
    flip = R.random(nb) < 0.5
    col = tint(nb, R)
    out_c = np.zeros((H, W, 3), np.float32); out_n = np.zeros((H, W, 3), np.float32); out_r = np.zeros((H, W), np.float32)
    for si, s in enumerate(boards.src):
        m = pick[inv] == si
        if not m.any():
            continue
        b = inv[m]
        al = along[m] * ppm; ac = across[m] * ppm
        sgn = np.where(flip[b], -1.0, 1.0)
        sx = offx[b] + sgn * al; sy = offy[b] + sgn * ac
        rel = bilinear(s['rel'][..., None], sx, sy)[..., 0]
        nn = bilinear(s['n'], sx, sy)
        rr = bilinear(s['r'][..., None], sx, sy)[..., 0]
        # grain detail on the board's own colour
        out_c[m] = col[b] * (1 + contrast * (rel - 1))[:, None]
        # tangent vector: source (x right, y up) -> board (along, across); flip = half turn
        tx = nn[:, 0] * sgn; ty = nn[:, 1] * sgn
        if mir is not None:
            ty = np.where(mir[m], -ty, ty)
        a = ang[m]; ca, sa = np.cos(a), np.sin(a)
        # along = (ca, sa) in image coords (y down); source x -> along, source y_up -> -across_img
        # across_img = (-sa, ca); image y_up component = -image y
        ix = tx * ca + ty * sa          # image x
        iy_up = -(tx * sa - ty * ca)    # image y up
        out_n[m] = np.stack([ix, iy_up, nn[:, 2]], -1)
        out_r[m] = rough[0] + (rough[1] - rough[0]) * np.clip((rr - 0.4) / 0.5, 0, 1)
    # eased edges and hairline joints
    e = np.clip(edge / bevel, 0, 1)
    h = np.sin(e * math.pi / 2)
    gy, gx = np.gradient(np.pad(h, 1, mode='wrap'))
    gx = gx[1:-1, 1:-1]; gy = gy[1:-1, 1:-1]
    k = bevel * ppm * 0.9
    n = out_n.copy()
    n[..., 0] -= gx * k; n[..., 1] += gy * k
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    groove = 0.25 + 0.75 * np.clip(edge / (bevel * 0.9), 0, 1) ** 0.6
    out_c *= groove[..., None]
    out_r = np.where(edge < bevel * 0.6, 0.85, out_r)
    ao = 0.55 + 0.45 * np.clip(edge / bevel, 0, 1)
    return out_c, n, out_r, ao


def palette(lum_med, spread, chroma, cjit, wood_jit=0.02):
    """per-board colours: luminance log-normal about lum_med, chroma from the photo"""
    ch = np.array(chroma, float); ch /= ch.sum()
    base = ch / (ch @ LUMW)
    def tint(n, R):
        L = lum_med * np.exp(R.normal(0, spread, n))
        warm = R.normal(0, cjit, n)
        c = base[None, :] * L[:, None]
        c[:, 0] *= 1 + warm; c[:, 2] *= 1 - warm
        return c.astype(np.float32)
    return tint


# ---- floors ------------------------------------------------------------------------------
def herringbone(name='floor_herringbone', W=0.14, n=6, K1=10, K2=2, ppm=1034):
    """45 degree herringbone, boards W x nW; lattice t1 = (1, -1), t2 = (n, n) in board units,
    V boards offset (0, n); rotated so t1 runs along u."""
    tu = K1 * math.sqrt(2) * W; tv = K2 * n * math.sqrt(2) * W
    Wp, Hp = int(round(tu * ppm)), int(round(tv * ppm))
    yy, xx = np.mgrid[0:Hp, 0:Wp].astype(np.float64)
    u = (xx + 0.5) / Wp * tu; v = (yy + 0.5) / Hp * tv
    x = (u + v) / math.sqrt(2) / W; y = (v - u) / math.sqrt(2) / W
    fy = np.floor(y)
    j = np.floor((x + fy) / (2 * n))
    i = j * n - fy
    alongH = x - (i + j * n)
    isH = alongH < n
    # V boards: offset (0, n)
    fx = np.floor(x)
    jv = np.floor((y - n + fx) / (2 * n))
    iv = fx - jv * n
    alongV = (y - n) - (-iv + jv * n)
    ii = np.where(isH, i, iv) % K1; jj = np.where(isH, j, jv) % K2
    ids = (np.where(isH, 0, 1) * 100000 + ii * 1000 + jj).astype(np.int64)
    along = np.where(isH, alongH, alongV) * W
    across = np.where(isH, y - fy, x - fx) * W
    L = n * W
    edge = np.minimum(np.minimum(along, L - along), np.minimum(across, W - across))
    # grain directions in image coords (y down; v grows downward in the image)
    ang = np.where(isH, math.pi / 4, 3 * math.pi / 4)
    B = Boards(ppm)
    c, nn, r, ao = lay(B, ids, along, across, ang, edge, palette(0.27, 0.17, (0.398, 0.327, 0.275), 0.03), Hp, Wp, ppm, 7, contrast=1.1, mir=~isH)
    save(name, c, nn, r, ao, [tu, tv])


def versailles(name='floor_versailles', T=1.5, fw=0.11, lw=0.085, cells=4, ppm=1365):
    """Versailles panel: frame boards round the edge, a 45 degree lattice of boards crossing the
    panel and diagonal infill between (apartment-17)."""
    S = int(round(T * ppm))
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float64)
    u = (xx + 0.5) / S * T; v = (yy + 0.5) / S * T
    de = np.minimum(np.minimum(u, v), np.minimum(T - u, T - v))
    inner = T - 2 * fw
    Lc = inner * math.sqrt(2) / cells          # lattice pitch along the diagonals
    cu = u - T / 2; cv = v - T / 2
    a = (cu + cv) / math.sqrt(2); b = (cu - cv) / math.sqrt(2)
    am = np.mod(a + lw / 2, Lc); bm = np.mod(b + lw / 2, Lc)
    ia = np.floor((a + lw / 2) / Lc); ib = np.floor((b + lw / 2) / Lc)
    frame = de < fw
    horiz = np.minimum(v, T - v) < np.minimum(u, T - u)
    onA = am < lw; onB = (~onA) & (bm < lw)
    # ids
    fid = np.where(horiz, np.where(v < T / 2, 1, 2), np.where(u < T / 2, 3, 4))
    ids = np.where(frame, fid, np.where(onA, 10 + ia, np.where(onB, 300 + ib, 1000 + (ia + 50) * 100 + (ib + 50)))).astype(np.int64)
    # board-local coords
    alongF = np.where(horiz, u, v); acrossF = np.where(horiz, v, u) % fw
    alongA = b; acrossA = am
    alongB = a; acrossB = bm
    alt = ((ia + ib) % 2) == 0
    alongI = np.where(alt, a, b); acrossI = np.where(alt, bm, am)
    along = np.where(frame, alongF, np.where(onA, alongA, np.where(onB, alongB, alongI)))
    across = np.where(frame, acrossF, np.where(onA, acrossA, np.where(onB, acrossB, acrossI)))
    # grain angles (image y down): a-axis = (1, 1)/sqrt2 -> 45 deg; b-axis = (1, -1)/sqrt2 -> -45 deg
    angF = np.where(horiz, 0.0, math.pi / 2)
    ang = np.where(frame, angF, np.where(onA, -math.pi / 4, np.where(onB, math.pi / 4, np.where(alt, math.pi / 4, -math.pi / 4))))
    # edges: frame: to the inner frame line and the mitre; lattice: to its sides and the frame;
    # infill: to the lattice boards
    mitre = np.abs(np.minimum(u, T - u) - np.minimum(v, T - v)) / math.sqrt(2)
    eF = np.minimum(np.minimum(fw - de, de), mitre)
    eA = np.minimum(np.minimum(am, lw - am), de - fw)
    eB = np.minimum(np.minimum(bm, lw - bm), de - fw)
    eB = np.minimum(eB, np.minimum(am - lw, Lc - am))   # B is cut where A runs through
    eI = np.minimum(np.minimum(am - lw, Lc - am), np.minimum(bm - lw, Lc - bm))
    eI = np.minimum(eI, de - fw)
    # infill planks inside each diamond: 3 strips
    strip = (Lc - lw) / 3
    sI = np.where(alt, bm - lw, am - lw)
    eI = np.minimum(eI, np.abs(((sI + strip / 2) % strip) - strip / 2))
    ids = np.where(frame | onA | onB, ids, ids * 10 + np.floor(sI / strip).astype(np.int64))
    edge = np.where(frame, eF, np.where(onA, eA, np.where(onB, eB, eI)))
    edge = np.maximum(edge, 0)
    B = Boards(ppm)
    mir = (frame & ~horiz) | (~frame & onB) | (~frame & ~onA & ~onB & alt)
    c, nn, r, ao = lay(B, ids, along, across, ang, edge, palette(0.27, 0.19, (0.405, 0.324, 0.271), 0.03), S, S, ppm, 11, contrast=1.15, mir=mir)
    save(name, c, nn, r, ao, [T, T])


def planks(name='floor_planks', T=2.4, W=0.2, ppm=853):
    """long oak planks for the bedrooms: rows W wide, lengths 0.9-2.4 m, staggered"""
    S = int(round(T * ppm))
    R = rng(5)
    rows = int(round(T / W))
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float64)
    u = (xx + 0.5) / S * T; v = (yy + 0.5) / S * T
    row = np.floor(v / W).astype(np.int64)
    ids = np.zeros((S, S), np.int64); along = np.zeros((S, S)); edge = np.zeros((S, S))
    for r_ in range(rows):
        cuts = [0.0]
        while True:
            L = R.uniform(0.9, 2.2)
            if cuts[-1] + L > T - 0.6:
                break
            cuts.append(cuts[-1] + L)
        off = R.random() * T
        m = row == r_
        uu = np.mod(u[m] - off, T)
        k = np.searchsorted(cuts, uu, side='right') - 1
        st = np.array(cuts)[k]; en = np.array(cuts + [T])[k + 1]
        ids[m] = r_ * 100 + k
        along[m] = uu - st
        edge[m] = np.minimum(uu - st, en - uu)
    across = v - row * W
    edge = np.minimum(edge, np.minimum(across, W - across))
    ang = np.zeros((S, S))
    Bd = Boards(ppm)
    c, nn, r, ao = lay(Bd, ids, along, across, ang, edge, palette(0.25, 0.13, (0.40, 0.324, 0.276), 0.025), S, S, ppm, 13, contrast=1.3)
    save(name, c, nn, r, ao, [T, T])


# ---- stones --------------------------------------------------------------------------------
def stone(name, scan, metres_scan, slab, tile, target_lum, chroma, contrast, rough_rng, rot=0, ppm=640, seed=1, cut='seq'):
    """Cut a scan into slabs, colour-matched: luminance median and chroma from the photo, scan
    detail kept (scaled by contrast). cut 'book': one window mirrored slab to slab (bookmatched,
    as onyx and marble are laid); 'seq': consecutive windows along the block (vein-cut stone)."""
    R = rng(seed)
    Sx, Sy = int(round(tile[0] * ppm)), int(round(tile[1] * ppm))
    src_px = int(round(metres_scan * ppm))
    c = to_lin(load(scan, 'diff', (src_px, src_px)))
    n = load(scan, 'nor', (src_px, src_px)) / 127.5 - 1
    r = load(scan, 'rough', (src_px, src_px), 'L') / 255
    if rot:
        c = np.rot90(c, rot); n = np.rot90(n, rot); r = np.rot90(r, rot)
        for _ in range(rot):
            n = np.stack([-n[..., 1], n[..., 0], n[..., 2]], -1)
    lum = c @ LUMW
    rel = lum / np.median(lum)
    ch = np.array(chroma, float); ch /= ch.sum(); base = ch / (ch @ LUMW)
    # keep a little of the scan's own colour variation (veins tinted differently)
    own = c / np.maximum(lum[..., None], 1e-4); own = own / own.reshape(-1, 3).mean(0)
    yy, xx = np.mgrid[0:Sy, 0:Sx].astype(np.float64)
    u = (xx + 0.5) / ppm; v = (yy + 0.5) / ppm
    su = np.floor(u / slab[0]); sv = np.floor(v / slab[1])
    ns = int(round(tile[0] / slab[0])) * int(round(tile[1] / slab[1]))
    sid = (su * 100 + sv).astype(np.int64)
    uid, inv = np.unique(sid, return_inverse=True); inv = inv.reshape(sid.shape)
    lu = u - su * slab[0]; lv = v - sv * slab[1]
    if cut == 'book':
        # each 2 x 2 group of slabs is one bookmatched set from its own window of the block
        gid = (np.floor(su / 2) * 31 + np.floor(sv / 2) * 7).astype(np.int64)
        ug, gi = np.unique(gid, return_inverse=True); gi = gi.reshape(gid.shape)
        oxs, oys = R.random(len(ug)) * src_px, R.random(len(ug)) * src_px
        ox, oy = oxs[gi], oys[gi]
        mx = np.where(su % 2 == 1, -1.0, 1.0); my = np.where(sv % 2 == 1, -1.0, 1.0)
        sx = ox + np.where(mx < 0, slab[0] - lu, lu) * ppm; sy = oy + np.where(my < 0, slab[1] - lv, lv) * ppm
    else:
        k = (su + sv * 7) % max(1, int(round(metres_scan / slab[0])))
        mx = my = np.ones_like(u)
        sx = (k * slab[0] + lu) * ppm + R.random() * 4; sy = (R.random() * metres_scan + lv) * ppm
        sy = sy + (sv * 0.37 * src_px)
    relS = bilinear(rel[..., None], sx, sy)[..., 0]
    ownS = bilinear(own, sx, sy)
    nn = bilinear(n, sx, sy); nn[..., 0] *= mx; nn[..., 1] *= my
    rr = bilinear(r[..., None], sx, sy)[..., 0]
    col = base[None, None, :] * target_lum * (1 + contrast * (relS - 1))[..., None] * (1 + 0.5 * (ownS - 1))
    edge = np.minimum(np.minimum(lu, slab[0] - lu), np.minimum(lv, slab[1] - lv))
    j = np.clip(edge / 0.0008, 0, 1)
    col *= (0.6 + 0.4 * j)[..., None]
    nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
    rough = rough_rng[0] + (rough_rng[1] - rough_rng[0]) * np.clip(rr, 0, 1)
    rough = np.where(edge < 0.0006, 0.8, rough)
    ao = 0.6 + 0.4 * j
    save(name, col.astype(np.float32), nn, rough, ao, list(tile))


def fabric(name, scan, metres_scan, out_m, target_lum, chroma, contrast, rough_rng, ppm=1024):
    """a woven / pile textile, tiled as scanned, colour-matched"""
    px = int(round(out_m * ppm))
    reps = out_m / metres_scan
    c = to_lin(load(scan, 'diff', (int(round(px / reps)),) * 2))
    n = load(scan, 'nor', c.shape[1::-1]) / 127.5 - 1
    r = load(scan, 'rough', c.shape[1::-1], 'L') / 255
    k = int(round(reps))
    c = np.tile(c, (k, k, 1)); n = np.tile(n, (k, k, 1)); r = np.tile(r, (k, k))
    lum = c @ LUMW; rel = lum / np.median(lum)
    ch = np.array(chroma, float); ch /= ch.sum(); base = ch / (ch @ LUMW)
    col = base[None, None, :] * target_lum * (1 + contrast * (rel - 1))[..., None]
    rough = rough_rng[0] + (rough_rng[1] - rough_rng[0]) * r
    ao = np.clip(0.5 + 0.5 * rel, 0, 1)
    save(name, col.astype(np.float32), n / np.linalg.norm(n, axis=-1, keepdims=True), rough, ao, [out_m, out_m])


def veneer(name, scan, rot, lum, chroma, contrast, rough_rng, metres=1.0, ppm=1024):
    """plain veneer (furniture, panels): one scan, colour-matched, grain along u"""
    px = int(round(metres * ppm))
    c = to_lin(load(scan, 'diff', (px, px)))
    n = load(scan, 'nor', (px, px)) / 127.5 - 1
    r = load(scan, 'rough', (px, px), 'L') / 255
    if rot:
        c = np.rot90(c, rot); n = np.rot90(n, rot); r = np.rot90(r, rot)
        for _ in range(rot):
            n = np.stack([-n[..., 1], n[..., 0], n[..., 2]], -1)
    lum_ = c @ LUMW; rel = lum_ / np.median(lum_)
    ch = np.array(chroma, float); ch /= ch.sum(); base = ch / (ch @ LUMW)
    col = base[None, None, :] * lum * (1 + contrast * (rel - 1))[..., None]
    rough = rough_rng[0] + (rough_rng[1] - rough_rng[0]) * np.clip((r - 0.4) / 0.5, 0, 1)
    save(name, col.astype(np.float32), n / np.linalg.norm(n, axis=-1, keepdims=True), rough, np.ones_like(rough), [metres, metres])


def leaves(name='leaf_ficus', scan='leaf'):
    """leaf atlas: the two photographed leaves side by side (256 x 512 each), alpha cut out,
    darkened toward the glossy green of the fig in apartment-18 / -19"""
    c = Image.open(os.path.join(SRC, scan, 'diff.jpg')).convert('RGB')
    a = Image.open(os.path.join(SRC, scan, 'alpha.jpg')).convert('L')
    n = Image.open(os.path.join(SRC, scan, 'nor.jpg')).convert('RGB')
    outc = Image.new('RGBA', (512, 512)); outn = Image.new('RGB', (512, 512), (128, 128, 255))
    for k, box in enumerate([(90, 200, 950, 1785), (1106, 200, 1966, 1785)]):
        cc = c.crop(box).resize((256, 512), Image.LANCZOS); aa = a.crop(box).resize((256, 512), Image.LANCZOS)
        nn = n.crop(box).resize((256, 512), Image.LANCZOS)
        lin = to_lin(np.asarray(cc, np.float32))
        lum = lin @ LUMW
        green = np.array([0.05, 0.11, 0.035]) / 0.09
        col = green[None, None, :] * (0.09 * (lum / max(np.median(lum[np.asarray(aa) > 128]), 1e-4)) ** 1.1)[..., None]
        col = 0.75 * col + 0.25 * lin * 0.55
        rgba = np.dstack([to_srgb(col), np.asarray(aa, np.float32)]).astype(np.uint8)
        outc.paste(Image.fromarray(rgba, 'RGBA'), (k * 256, 0)); outn.paste(nn, (k * 256, 0))
    os.makedirs(os.path.join(DST, 'quest'), exist_ok=True)
    outc.save(os.path.join(DST, name + '_diff.webp'), quality=92, method=6)
    outn.save(os.path.join(DST, name + '_nor.webp'), quality=92, method=6)
    outc.resize((256, 256), Image.LANCZOS).save(os.path.join(DST, 'quest', name + '_diff.webp'), quality=92, method=6)
    outn.resize((256, 256), Image.LANCZOS).save(os.path.join(DST, 'quest', name + '_nor.webp'), quality=92, method=6)
    print(name, 'atlas 512')


JOBS = {
    'floor_herringbone': herringbone,
    'floor_versailles': versailles,
    'floor_planks': planks,
    # vein-cut silver travertine (apartment-03): slabs 0.6 x 1.2 m with the bands vertical
    'stone_travertine': lambda: stone('stone_travertine', 'travertine_vein', 0.8, (0.6, 1.2), (4.8, 4.8), 0.56, (0.343, 0.335, 0.322), 0.75, (0.28, 0.42), rot=1, seed=3),
    # white onyx (apartment-08): big slabs, warm cream with amber veins
    'stone_onyx': lambda: stone('stone_onyx', 'onyx_white', 1.2, (1.2, 1.2), (4.8, 4.8), 0.66, (0.357, 0.334, 0.309), 0.5, (0.05, 0.12), seed=5, cut='book'),
    # white marble (stair treads, landing)
    'stone_marble': lambda: stone('stone_marble', 'marble_white', 1.2, (1.2, 0.6), (4.8, 4.8), 0.70, (0.338, 0.334, 0.328), 1.0, (0.06, 0.14), seed=7, cut='book'),
    # grey marble (apartment-05)
    'stone_greymarble': lambda: stone('stone_greymarble', 'marble_grey', 1.2, (0.6, 0.6), (4.8, 4.8), 0.24, (0.343, 0.333, 0.324), 1.2, (0.07, 0.15), seed=9, cut='book'),
    # cream travertine (plinths, table tops; apartment-17)
    'stone_cream': lambda: stone('stone_cream', 'travertine_cream', 1.2, (1.2, 1.2), (4.8, 4.8), 0.55, (0.357, 0.334, 0.309), 1.0, (0.35, 0.5), seed=11, cut='book'),
    # bleached oak (coffee tables, plinths; apartment-19, -17), dark wire-brushed oak (vanity,
    # shelving; apartment-03, -13), mid oak (bed, consoles)
    'wood_bleached': lambda: veneer('wood_bleached', 'oak_washed', 0, 0.42, (0.382, 0.333, 0.285), 1.4, (0.45, 0.6)),
    'wood_dark': lambda: veneer('wood_dark', 'oak_white', 1, 0.075, (0.385, 0.33, 0.285), 1.6, (0.5, 0.65)),
    'wood_mid': lambda: veneer('wood_mid', 'oak_grey2', 0, 0.16, (0.39, 0.326, 0.284), 1.4, (0.45, 0.6)),
    'leaf_ficus': leaves,
    'fabric_boucle': lambda: fabric('fabric_boucle', 'boucle', 0.15, 0.3, 0.62, (0.353, 0.334, 0.313), 0.8, (0.85, 1.0)),
    'fabric_rug': lambda: fabric('fabric_rug', 'rug_cream', 1.7, 1.7, 0.58, (0.348, 0.335, 0.317), 0.9, (0.9, 1.0), ppm=600),
    'fabric_linen': lambda: fabric('fabric_linen', 'linen', 0.5, 1.0, 0.62, (0.344, 0.334, 0.322), 0.8, (0.8, 0.95), ppm=512),
}

if __name__ == '__main__':
    for k in (sys.argv[1:] or JOBS):
        JOBS[k]()
