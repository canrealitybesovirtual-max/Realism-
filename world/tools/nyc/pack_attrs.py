"""Per-building attributes for the baker, in mesh order (lod2.bin buildings, then prisms.bin):
<bake/data>/attrs.bin  f32[n*4]: construction year, roof height above street (m), feature code, BIN hash 0..1
Year comes from the footprint table (by BIN); missing -> 0.
"""
import json, os, struct
import numpy as np
from geo import CACHE, OUT


def bins(name):
    with open(os.path.join(OUT, name), 'rb') as f:
        assert f.read(4) == b'LOD2'
        nT, nB = struct.unpack('<II', f.read(8))
        f.seek(12 + nT * 40)
        b = np.frombuffer(f.read(nB * 4), np.uint32).copy()
        info = np.frombuffer(f.read(nB * 16), np.float32).reshape(nB, 4).copy()
    return b, info


# landmark facades the era rules get wrong (feature code slot carries a negative style)
OVR = {1088817: -1, 1035787: -1,      # 432 Park Avenue: white concrete grid, 3 m square windows
       1090184: -2}                    # 220 Central Park South: limestone


def main():
    rows = json.load(open(os.path.join(CACHE, 'footprints.json')))
    year, code = {}, {}
    for r in rows:
        b = int(r.get('bin') or 0)
        year[b] = int(r.get('construction_year') or 0)
        code[b] = int(r.get('feature_code') or 0)
    out = []
    for name in ('lod2.bin', 'prisms.bin'):
        B, I = bins(name)
        for k in range(len(B)):
            b = int(B[k])
            hsh = ((b * 2654435761) % 4294967296) / 4294967296.0
            out.append((year.get(b, 0), I[k, 3], OVR.get(b, code.get(b, 0)), hsh))
    A = np.asarray(out, np.float32)
    A.tofile(os.path.join(OUT, 'attrs.bin'))
    print('attrs', len(A), 'with year', int((A[:, 0] > 0).sum()))


if __name__ == '__main__':
    main()
