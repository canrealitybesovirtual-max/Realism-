"""NYC 3D Building Model (OTI, LOD2 multipatch, 2014 survey) -> game-frame triangles.

usage: python3 prepare_lod2.py <DA..._Multipatch.gdb> [...]
writes <bake/data>/lod2.bin:
  header  u32 magic 'LOD2', u32 nTri, u32 nBld
  f32[nTri*9]   positions (x, y, z per vertex, game frame, y = height above the origin's street)
  u32[nTri]     building index
  per building: u32 BIN, f32 cx, f32 cz, f32 base, f32 top
Heights: NAVD88 feet -> metres, minus the origin's ground (config groundFt), minus earth curvature.
"""
import os, struct, sys
import numpy as np
import pyogrio, shapely
import mapbox_earcut as earcut
from pyproj import Transformer
from geo import CFG, OUT, ll_to_game, curvature_drop

FT = 0.3048
G0 = CFG.get('groundFt', 66.0) * FT
RMAX = CFG.get('lod2Radius', 16000)
T = Transformer.from_crs(2263, 4326, always_xy=True)


def tri_face(P):
    """P: (n,3) ring (closed or open) of one planar face, holes not handled here."""
    if np.allclose(P[0], P[-1]):
        P = P[:-1]
    n = len(P)
    if n < 3:
        return None
    # Newell normal
    nx = np.sum((P[:, 1] - np.roll(P[:, 1], -1)) * (P[:, 2] + np.roll(P[:, 2], -1)))
    ny = np.sum((P[:, 2] - np.roll(P[:, 2], -1)) * (P[:, 0] + np.roll(P[:, 0], -1)))
    nz = np.sum((P[:, 0] - np.roll(P[:, 0], -1)) * (P[:, 1] + np.roll(P[:, 1], -1)))
    N = np.array([nx, ny, nz]); L = np.linalg.norm(N)
    if L < 1e-9:
        return None
    N /= L
    a = np.array([1.0, 0, 0]) if abs(N[0]) < 0.9 else np.array([0, 1.0, 0])
    U = np.cross(N, a); U /= np.linalg.norm(U); V = np.cross(N, U)
    uv = np.stack([P @ U, P @ V], 1)
    if n == 3:
        return P[[0, 1, 2]]
    if n == 4:
        idx = np.array([0, 1, 2, 0, 2, 3])
    else:
        idx = earcut.triangulate_float64(uv, np.array([n], dtype=np.uint32))
        if len(idx) == 0:
            return None
    return P[idx]


def main(paths):
    tris, bid, blds = [], [], []
    for path in paths:
        meta, geoms = None, None
        r = pyogrio.raw.read(path)
        meta, fids, geoms, fields = r[0], r[1], r[2], r[3]
        names = list(meta['fields'])
        bins = fields[names.index('BIN')]
        print(path, len(geoms), flush=True)
        for k, wkb in enumerate(geoms):
            if wkb is None:
                continue
            g = shapely.from_wkb(wkb)
            polys = list(g.geoms) if hasattr(g, 'geoms') else [g]
            C = [np.asarray(p.exterior.coords) for p in polys if p.exterior is not None]
            if not C:
                continue
            A = np.concatenate(C)
            lon, lat = T.transform(A[:, 0], A[:, 1])
            x, z = ll_to_game(lat, lon)
            if np.hypot(x.mean(), z.mean()) > RMAX:
                continue
            y = A[:, 2] * FT - G0 - curvature_drop(x, z)
            W = np.stack([x, y, z], 1)
            o = 0; out = []
            for c in C:
                f = tri_face(W[o:o + len(c)])
                o += len(c)
                if f is not None:
                    out.append(f)
            if not out:
                continue
            F = np.concatenate(out)
            tris.append(F.astype(np.float32))
            bid.append(np.full(len(F) // 3, len(blds), np.uint32))
            blds.append((int(bins[k] or 0), float(x.mean()), float(z.mean()), float(y.min()), float(y.max())))
    P = np.concatenate(tris); I = np.concatenate(bid)
    nT = len(P) // 3
    with open(os.path.join(OUT, 'lod2.bin'), 'wb') as f:
        f.write(b'LOD2'); f.write(struct.pack('<II', nT, len(blds)))
        f.write(P.tobytes()); f.write(I.tobytes())
        f.write(np.array([[b[0]] for b in blds], np.uint32).tobytes())
        f.write(np.array([b[1:] for b in blds], np.float32).tobytes())
    print('triangles', nT, 'buildings', len(blds), 'MB', round(os.path.getsize(os.path.join(OUT, 'lod2.bin')) / 1e6, 1))


if __name__ == '__main__':
    main(sys.argv[1:])
