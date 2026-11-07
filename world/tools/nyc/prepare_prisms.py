"""Building footprints (NYC Open Data 5zhs-2jue) -> extruded prisms for every building
the LOD2 model does not have (outside its districts, or built after the 2014 survey).

reads <cache>/footprints.json and <bake/data>/lod2.bin (for its BINs)
writes <bake/data>/prisms.bin in the lod2.bin layout.
"""
import json, os, struct
import numpy as np
import mapbox_earcut as earcut
from geo import CFG, CACHE, OUT, ll_to_game, curvature_drop

FT = 0.3048
G0 = CFG['groundFt'] * FT


def lod2_bins():
    p = os.path.join(OUT, 'lod2.bin')
    with open(p, 'rb') as f:
        assert f.read(4) == b'LOD2'
        nT, nB = struct.unpack('<II', f.read(8))
        f.seek(12 + nT * 36 + nT * 4)
        bins = np.frombuffer(f.read(nB * 4), np.uint32)
        info = np.frombuffer(f.read(nB * 16), np.float32).reshape(nB, 4)
    return bins, info


def main():
    rows = json.load(open(os.path.join(CACHE, 'footprints.json')))
    lbins, linfo = lod2_bins()
    have = set(int(b) for b in lbins)
    tris, bid, blds = [], [], []
    skipped = 0
    for r in rows:
        b = int(r.get('bin') or 0)
        yr = int(r.get('construction_year') or 0)
        h = float(r.get('height_roof') or 0) * FT
        if h < 3 or h > 560:          # bad records (one says 649 km)
            continue
        if b == CFG['ownBin']:
            continue
        # keep the LOD2 building unless it was (re)built after the survey
        if b in have and yr < 2014:
            skipped += 1
            continue
        ge = float(r.get('ground_elevation') or CFG['groundFt']) * FT
        for poly in r['the_geom']['coordinates']:
            ring = np.asarray(poly[0], np.float64)
            if np.allclose(ring[0], ring[-1]):
                ring = ring[:-1]
            if len(ring) < 3:
                continue
            x, z = ll_to_game(ring[:, 1], ring[:, 0])
            cx, cz = x.mean(), z.mean()
            drop = float(curvature_drop(cx, cz))
            y0 = ge - G0 - drop - 1.0           # a metre into the ground (aerial sits at street level)
            y1 = ge + h - G0 - drop
            # orient rings counter-clockwise seen from above (x right, z down -> check signed area)
            area = np.sum(x * np.roll(z, -1) - np.roll(x, -1) * z) / 2
            if area > 0:
                x, z = x[::-1], z[::-1]
            n = len(x)
            out = []
            for i in range(n):
                j = (i + 1) % n
                a0 = (x[i], y0, z[i]); a1 = (x[j], y0, z[j]); b0 = (x[i], y1, z[i]); b1 = (x[j], y1, z[j])
                out += [a0, a1, b1, a0, b1, b0]
            idx = earcut.triangulate_float64(np.stack([x, z], 1), np.array([n], np.uint32))
            for k in range(0, len(idx), 3):
                i0, i1, i2 = idx[k], idx[k + 1], idx[k + 2]
                out += [(x[i0], y1, z[i0]), (x[i2], y1, z[i2]), (x[i1], y1, z[i1])]
            tris.append(np.asarray(out, np.float32))
            bid.append(np.full(len(out) // 3, len(blds), np.uint32))
            blds.append((b, cx, cz, y0, y1))
    P = np.concatenate(tris); I = np.concatenate(bid); nT = len(P) // 3
    with open(os.path.join(OUT, 'prisms.bin'), 'wb') as f:
        f.write(b'LOD2'); f.write(struct.pack('<II', nT, len(blds)))
        f.write(P.tobytes()); f.write(I.tobytes())
        f.write(np.array([b[0] for b in blds], np.uint32).tobytes())
        f.write(np.array([b[1:] for b in blds], np.float32).tobytes())
    print('prisms', len(blds), 'triangles', nT, 'kept LOD2', skipped)


if __name__ == '__main__':
    main()
