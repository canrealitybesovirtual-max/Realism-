"""Aerial tiles -> what the baker needs about the ground.

Per aerial tile (L0, L1), into <bake/data>/ground/:
  <tile>.jpg        the photo (RGB, as delivered, q 92)
  <tile>_m.png      R water, G grass / low vegetation, B tree canopy height (0.125 m units)
L2 tiles: photo only (plus water in R of _m.png).
Terrain: <bake/data>/terrain.png, 16-bit, one 16 m cell per pixel over the L2 extent:
  value = (height + 100 m) * 100, height relative to the origin's street.

Trees: NDVI from the near-infrared band finds vegetation; canopy is the rough, darker
part of it (local contrast), lawns are smooth. Height follows the photo (sunlit crown tops
high, gaps and shade low), 9-24 m in the parks, a little less on streets.
Water: USGS hydrography (labels closed), in L0 refined by the infrared.
Terrain: building ground elevations (NYC footprints) smoothed; rivers at sea level; the New
Jersey Palisades (no data there) rise as a cliff from the Hudson's west shore north of
Weehawken.
"""
import json, os, glob
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from geo import CFG, CACHE, OUT, ll_to_game, curvature_drop

FT = 0.3048
SRC = os.path.join(CACHE, 'aerial')
DST = os.path.join(OUT, 'ground')
os.makedirs(DST, exist_ok=True)
LV = {L['name']: L for L in CFG['levels']}


def load(p, mode=None):
    im = Image.open(p)
    return np.asarray(im.convert(mode) if mode else im, dtype=np.float32)


def tile(L, name):
    base = os.path.join(SRC, name)
    rgb = load(base + '.png', 'RGB')
    nir = load(base + '_nir.png', 'L')
    hyd = load(base + '_hydro.png', 'L') / 255 if os.path.exists(base + '_hydro.png') else np.zeros(nir.shape, np.float32)
    res = L['res']
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    ndvi = (nir - r) / (nir + r + 1.0)
    # hydrography: close the label holes (text ~ 30 m), soften
    rad = max(1, int(round(25 / res)))
    wat = ndi.binary_closing(hyd > 0.5, structure=np.ones((3, 3)), iterations=rad)
    if res <= 1.0:   # pull the shore to the photo: water is dark in the infrared and not green
        near = ndi.binary_dilation(wat, iterations=max(1, int(8 / res)))
        dark = (nir < 70) & (ndvi < 0.05)
        wat = (wat & ~(ndvi > 0.25)) | (near & dark)
    wat_f = ndi.gaussian_filter(wat.astype(np.float32), 0.7)
    Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    veg = (ndvi > 0.12) & ~wat
    if L['name'] == 'L2':
        canopy = np.zeros_like(Y)
    else:
        # local contrast over ~3 m: crowns are rough, lawns smooth
        s = max(1.0, 1.5 / res)
        m1 = ndi.gaussian_filter(Y, s); m2 = ndi.gaussian_filter(Y * Y, s)
        rough = np.sqrt(np.maximum(m2 - m1 * m1, 0))
        vegd = (ndvi > 0.04) & (Y < 70) & ~wat                     # shaded leaves: weak NDVI
        tree = (veg & ((rough > 9.0) | (Y < 55))) | (vegd & ndi.binary_dilation(veg, iterations=max(1, int(2 / res))))
        tree = ndi.binary_opening(tree, iterations=1)
        tree = ndi.binary_closing(tree, iterations=max(1, int(3 / res)))
        holes = ndi.binary_fill_holes(tree) & ~tree
        lab, nh = ndi.label(holes)
        if nh:
            sz = ndi.sum(holes, lab, range(1, nh + 1)) * res * res
            tree |= np.isin(lab, np.nonzero(sz < 400)[0] + 1)
        # one rounded crown per treetop: treetops are the bright local maxima of the photo
        # (sunlit crown tops), each crown a paraboloid H - k r^2 (max over crowns = a grey
        # dilation with a non-flat structuring element); stand height from how big the stand is
        Yn = ndi.gaussian_filter(Y, max(0.6, 1.2 / res))
        win = max(3, int(round(4.0 / res)) | 1)
        peak = (Yn == ndi.maximum_filter(Yn, size=win)) & tree
        big = ndi.gaussian_filter(tree.astype(np.float32), 12 / res)
        Htop = 11 + 9 * np.clip(big * 1.4, 0, 1) + 2.5 * (np.clip((Yn - ndi.gaussian_filter(Yn, 10 / res)) / 25, -1, 1))
        R = 5.5; k = 5.0 / (R * R)
        rpx = int(np.ceil(R / res))
        yy, xx = np.mgrid[-rpx:rpx + 1, -rpx:rpx + 1] * res
        st = -k * (xx * xx + yy * yy)
        st[(xx * xx + yy * yy) > R * R] = -1e3
        P = np.where(peak, Htop, -1e3).astype(np.float32)
        crowns = ndi.grey_dilation(P, structure=st.astype(np.float32))
        d_in = ndi.distance_transform_edt(tree) * res
        edge = np.sqrt(np.clip(d_in / 2.5, 0, 1))                     # crowns round off at the stand's edge
        floor = Htop - 7.0                                               # gaps inside a stand stay leafy
        canopy = np.where(tree, np.maximum(crowns, floor) * edge, 0)
        canopy = ndi.gaussian_filter(np.clip(canopy, 0, 30), max(0.5, 0.5 / res))
    vegw = np.clip((ndvi - 0.08) / 0.25, 0, 1) * (1 - wat_f)          # how much this pixel is plant
    m = np.stack([wat_f * 255, vegw * 255, np.clip(canopy * 8, 0, 255)], -1)
    Image.fromarray(m.astype(np.uint8)).save(os.path.join(DST, name + '_m.png'))
    Image.fromarray(rgb.astype(np.uint8)).save(os.path.join(DST, name + '.jpg'), quality=92)
    return wat


def terrain():
    L2 = LV['L2']; C = 16.0
    nx = int((L2['x1'] - L2['x0']) / C); nz = int((L2['z1'] - L2['z0']) / C)
    S = np.zeros((nz, nx), np.float64); W = np.zeros((nz, nx), np.float64)
    rows = json.load(open(os.path.join(CACHE, 'footprints.json')))
    for rr in rows:
        ge = rr.get('ground_elevation')
        if ge is None:
            continue
        c = rr['the_geom']['coordinates'][0][0][0]
        x, z = ll_to_game(c[1], c[0])
        i = int((x - L2['x0']) / C); j = int((z - L2['z0']) / C)
        if 0 <= i < nx and 0 <= j < nz:
            S[j, i] += float(ge) * FT; W[j, i] += 1
    G0 = CFG['groundFt'] * FT
    sm = ndi.gaussian_filter(S, 4); wm = ndi.gaussian_filter(W, 4)
    h = np.where(wm > 0.02, sm / np.maximum(wm, 1e-9), np.nan)
    # fill the gaps outward
    known = ~np.isnan(h)
    idx = ndi.distance_transform_edt(~known, return_distances=False, return_indices=True)
    h = h[tuple(idx)]
    dist_known = ndi.distance_transform_edt(~known) * C
    # water from the L2 hydro tiles (8 m) resampled to 16 m
    water = np.zeros((nz, nx), bool)
    T = L2['tile'] * L2['res']
    for p in glob.glob(os.path.join(SRC, 'L2_*_hydro.png')):
        nm = os.path.basename(p).split('_')
        ti, tj = int(nm[1]), int(nm[2])
        a = load(p, 'L')[::2, ::2] > 127
        a = ndi.binary_closing(a, iterations=3)
        oi, oj = int(ti * T / C), int(tj * T / C)
        water[oj:oj + a.shape[0], oi:oi + a.shape[1]] = a[:max(0, nz - oj), :max(0, nx - oi)]
    # Palisades: NJ land with no NYC data, near the Hudson, north of Weehawken
    X = L2['x0'] + (np.arange(nx) + 0.5) * C; Z = L2['z0'] + (np.arange(nz) + 0.5) * C
    XX, ZZ = np.meshgrid(X, Z)
    # distance to the big water only (Hudson, harbour): small NJ lakes and creeks make no cliffs
    lab, nl = ndi.label(water)
    if nl:
        area = ndi.sum(water, lab, range(1, nl + 1)) * C * C
        bigw = np.isin(lab, np.nonzero(area > 15e6)[0] + 1)
    else:
        bigw = water
    dw = ndi.distance_transform_edt(~bigw) * C
    nj = (dist_known > 400) & (XX < -1500)
    cliff = np.clip((dw - 40) / 260, 0, 1) ** 0.6 * np.clip((-ZZ - 300) / 3000, 0.35, 1) * 95
    inland = np.clip((dw - 3000) / 6000, 0, 1)                       # the ridge eases down to a plain inland
    njh = cliff * (1 - inland) + 25 * inland + 2
    h = np.where(nj, njh, h)
    # far from any data the land settles to a low plain, and to sea level at the extent's rim
    far = np.clip((dist_known - 4000) / 8000, 0, 1) * (~nj)
    h = h * (1 - far) + 12 * far
    edge = np.minimum.reduce([XX - L2['x0'], L2['x1'] - XX, ZZ - L2['z0'], L2['z1'] - ZZ])
    ew = np.clip(edge / 6000, 0, 1)
    h = h * ew + 2 * (1 - ew)
    h = np.where(water, -0.5, h)
    h = ndi.gaussian_filter(h, 0.8)
    h = np.where(water, -0.5, h)
    rel = h - G0 - curvature_drop(XX, ZZ)
    v = np.clip((rel + 100) * 100, 0, 65535).astype(np.uint16)
    Image.fromarray(v).save(os.path.join(OUT, 'terrain.png'))
    rel.astype(np.float32).tofile(os.path.join(OUT, 'terrain.bin'))
    json.dump({'x0': L2['x0'], 'z0': L2['z0'], 'cell': C, 'nx': nx, 'nz': nz}, open(os.path.join(OUT, 'terrain.json'), 'w'))
    print('terrain', v.shape, 'rel min/max', float(rel.min()), float(rel.max()))


# mosaics the baker samples (raw RGBA8, rows = z, columns = x): RGB = photo,
# A = 0 water, 1 ground, 2 + 8 * canopy height (m)
def delight(lin, wat, res):
    """Lift the aerial's own cast shadows (they point the wrong way for the game's sun):
    a pixel much darker than its surroundings, and bluer (lit by the sky only), is brought up
    toward a sunlit level; the bake then casts the game's own shadows."""
    Y = lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    s = max(2.0, 10.0 / res)
    M = ndi.gaussian_filter(Y, s) + 1e-4
    blue = lin[..., 2] / (lin.sum(-1) + 1e-4)
    r = Y / M
    sh = np.clip((0.62 - r) / 0.32, 0, 1) * np.clip((blue - 0.30) / 0.08, 0, 1) * (1 - wat)
    sh = ndi.gaussian_filter(sh, max(0.6, 0.7 / res))
    k = 1 + sh * 2.2                                 # sun / sky ~ 3.2 under a clear sky
    out = lin * k[..., None]
    out[..., 2] /= 1 + sh * 0.35                     # shadows are bluer: take that back out
    return np.clip(out, 0, 1)


GRADE = (1.85, 1.08, 0.36)      # linear gain on plants (measured against apartment-21's park)
GRADE_K = 1.0
MOS = [
    ('G0', 'L0', -1536, 1536, -4608, 1536, 0.75),
    ('G1', 'L1', -4096, 4096, -8192, 4096, 2.0),
    ('G2', 'L1', -8192, 8192, -16384, 8192, 4.0),
    ('G3', 'L2', -32768, 32768, -40960, 24576, 16.0),
]


def mosaic():
    meta = []
    for name, src, x0, x1, z0, z1, res in MOS:
        L = LV[src]
        W, H = int(round((x1 - x0) / res)), int(round((z1 - z0) / res))
        out = np.zeros((H, W, 4), np.uint8); out[..., 3] = 1
        T = L['tile'] * L['res']
        k = L['res'] / res
        for p in sorted(glob.glob(os.path.join(DST, src + '_*_m.png'))):
            nm = os.path.basename(p)[:-6]
            ti, tj = int(nm.split('_')[1]), int(nm.split('_')[2])
            tx0 = L['x0'] + ti * T; tz0 = L['z0'] + tj * T
            if tx0 >= x1 or tx0 + T <= x0 or tz0 >= z1 or tz0 + T <= z0:
                continue
            rgb = Image.open(os.path.join(DST, nm + '.jpg')).convert('RGB')
            m = Image.open(p).convert('RGB')
            n = int(round(L['tile'] * k))
            rgb = np.asarray(rgb.resize((n, n), Image.LANCZOS if k < 1 else Image.BILINEAR))
            m = np.asarray(m.resize((n, n), Image.BILINEAR)).astype(np.float32)
            wat, vg, can = m[..., 0] / 255, m[..., 1] / 255, m[..., 2] / 8
            lin = (rgb.astype(np.float32) / 255) ** 2.2
            lin = delight(lin, wat, res)
            gain = np.array(GRADE, np.float32)
            g = 1 + (gain - 1) * vg[..., None] * GRADE_K
            rgb = np.clip(((lin * g) ** (1 / 2.2)) * 255, 0, 255).astype(np.uint8)
            a = np.where(can > 0.3, 2 + can * 8, 1.0) * (1 - wat)
            a = np.clip(np.round(a), 0, 255).astype(np.uint8)
            ox = int(round((tx0 - x0) / res)); oz = int(round((tz0 - z0) / res))
            sx0, sz0 = max(0, -ox), max(0, -oz)
            dx0, dz0 = max(0, ox), max(0, oz)
            w = min(n - sx0, W - dx0); h = min(n - sz0, H - dz0)
            if w <= 0 or h <= 0:
                continue
            out[dz0:dz0 + h, dx0:dx0 + w, :3] = rgb[sz0:sz0 + h, sx0:sx0 + w]
            out[dz0:dz0 + h, dx0:dx0 + w, 3] = a[sz0:sz0 + h, sx0:sx0 + w]
        out.tofile(os.path.join(OUT, name + '.rgba'))
        Image.fromarray(out[::8, ::8, :3]).save(os.path.join(DST, name + '_preview.jpg'))
        meta.append({'name': name, 'x0': x0, 'x1': x1, 'z0': z0, 'z1': z1, 'res': res, 'w': W, 'h': H})
        print('mosaic', name, W, H, flush=True)
    json.dump(meta, open(os.path.join(OUT, 'mosaics.json'), 'w'), indent=1)


def main():
    import sys
    if '--terrain' in sys.argv:
        terrain(); return
    for p in sorted(glob.glob(os.path.join(SRC, 'L[01]_*_nir.png'))) + sorted(glob.glob(os.path.join(SRC, 'L2_*_nir.png'))):
        name = os.path.basename(p)[:-8]
        if os.path.exists(os.path.join(DST, name + '_m.png')):
            continue
        tile(LV[name.split('_')[0]], name)
        print(name, flush=True)
    terrain()
    mosaic()


if __name__ == '__main__':
    main()
