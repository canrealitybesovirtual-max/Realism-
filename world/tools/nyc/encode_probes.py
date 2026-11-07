"""Baked faces -> what the game loads (world/city/):
  <res>/p<id>_<face>_<sun>.webp   colour, sRGB, alpha = coverage (sky transparent), rows top-down
  p<id>_<face>.d16          distance at the (dsize+1)^2 grid corners, uint16 log-encoded
                            (0 = sky; d = 5 m * exp(v / 65535 * ln(40000))), rows bottom-up
  manifest.json
A corner takes the nearest of its four texels, so a tower's edge keeps the tower's distance.
"""
import json, math, os, sys
import numpy as np
from PIL import Image
from geo import CFG, CACHE, WORLD

SRC = os.path.join(CACHE, 'probes')
DST = os.path.join(WORLD, 'city')
RES = {'pc': 2048, 'quest': 1024}
LOGMAX = math.log(200000 / 5)


def main():
    suns = sorted(d for d in os.listdir(SRC) if os.path.exists(os.path.join(SRC, d, 'meta.json')))
    metas = {sn: json.load(open(os.path.join(SRC, sn, 'meta.json'))) for sn in suns}
    m0 = metas[suns[0]]
    size, dsize = m0['size'], m0['dsize']
    for r in RES:
        os.makedirs(os.path.join(DST, r), exist_ok=True)
    probes = []
    for p in CFG['probes']:
        have = []
        for fi in range(6):
            got = [sn for sn in suns if os.path.exists(os.path.join(SRC, sn, f"p{p['id']}_{fi}.dist"))]
            if len(got) != len(suns):
                continue
            empty = True
            for sn in suns:
                base = os.path.join(SRC, sn, f"p{p['id']}_{fi}")
                px = np.fromfile(base + '.rgba', np.uint8).reshape(size, size, 4)[::-1]       # top-down
                empty = empty and px[..., 3].max() == 0
                im = Image.fromarray(px, 'RGBA')
                for r, n in RES.items():
                    (im if n == size else im.resize((n, n), Image.LANCZOS)).save(os.path.join(DST, r, f"p{p['id']}_{fi}_{sn}.webp"), quality=90, method=6)
            if empty:
                continue
            d = np.fromfile(os.path.join(SRC, suns[0], f"p{p['id']}_{fi}.dist"), np.float32).reshape(dsize, dsize)   # bottom-up
            big = np.where(d > 0, d, 1e9)
            pad = np.pad(big, 1, mode='edge')
            c = np.minimum(np.minimum(pad[:-1, :-1], pad[1:, :-1]), np.minimum(pad[:-1, 1:], pad[1:, 1:]))   # (dsize+1)^2 corners
            enc = np.where(c < 1e8, np.clip(np.log(np.maximum(c, 5.0) / 5.0) / LOGMAX * 65535, 1, 65535), 0).astype('<u2')
            enc.tofile(os.path.join(DST, f"p{p['id']}_{fi}.d16"))
            have.append(fi)
        if have:
            probes.append({'id': p['id'], 'name': p.get('name', ''), 'apt': p['apt'], 'faces': have})
        print('probe', p['id'], have)
    man = {
        'version': 2, 'source': 'NYC 3D Building Model (OTI), NYC Building Footprints, USGS NAIP 2019, USGS hydrography',
        'faces': m0['faces'], 'res': 'pc', 'questRes': 'quest', 'dsize': dsize,
        'anchor': CFG['anchor'], 'aptCenter': CFG['aptCenter'], 'street': CFG['street'],
        'suns': [{'name': sn, 'hour': metas[sn].get('hour', 12), 'sun': metas[sn]['sun']} for sn in sorted(suns, key=lambda k: metas[k].get('hour', 12))],
        'look': m0['look'], 'probes': probes,
    }
    json.dump(man, open(os.path.join(DST, 'manifest.json'), 'w'), indent=1)
    print('manifest', len(probes), 'probes', suns)


if __name__ == '__main__':
    main()
