"""Download USGS NAIP aerial photos (public domain) and resample them into
game-grid tiles: <cache>/aerial/<level>_<i>_<j>.png (RGB) and _nir.png (near infrared).

One exportImage request per output tile (Web Mercator chunk around it), then a
bilinear remap into the rotated game grid. Re-runnable: finished tiles are skipped.
usage: python3 fetch_aerial.py [level ...]
"""
import io, os, sys, time, urllib.request
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates
from geo import CFG, CACHE, game_to_ll, ll_to_merc

SVC = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage'
DIR = os.path.join(CACHE, 'aerial')
os.makedirs(DIR, exist_ok=True)


HYDRO = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroCached/MapServer/export'


def fetch(bbox, w, h, bands):
    q = (f'?bbox={bbox[0]:.2f},{bbox[1]:.2f},{bbox[2]:.2f},{bbox[3]:.2f}&bboxSR=3857&imageSR=3857'
         f'&size={w},{h}&format=png&bandIds={bands}&interpolation=RSP_BilinearInterpolation&f=image')
    url = SVC + q
    if bands == 'hydro':
        url = HYDRO + (f'?bbox={bbox[0]:.2f},{bbox[1]:.2f},{bbox[2]:.2f},{bbox[3]:.2f}&bboxSR=3857&imageSR=3857'
                       f'&size={w},{h}&format=png&transparent=false&f=image')
        bands = '0,1,2'
    for t in range(5):
        try:
            d = urllib.request.urlopen(url, timeout=180).read()
            im = Image.open(io.BytesIO(d))
            return np.asarray(im.convert('RGB' if ',' in bands else 'L'), dtype=np.float32)
        except Exception as e:
            print('  retry', t, e); time.sleep(3 + 4 * t)
    raise RuntimeError('fetch failed')


def tile(L, i, j):
    res, T = L['res'], L['tile']
    x0 = L['x0'] + i * T * res; z0 = L['z0'] + j * T * res
    base = os.path.join(DIR, f"{L['name']}_{i}_{j}")
    if HYDRO_ONLY:
        if os.path.exists(base + '_hydro.png'):
            return
    elif os.path.exists(base + '.png') and (not L['nir'] or os.path.exists(base + '_nir.png')):
        return
    # output pixel centres
    px = x0 + (np.arange(T) + 0.5) * res
    pz = z0 + (np.arange(T) + 0.5) * res
    X, Z = np.meshgrid(px, pz)
    lat, lon = game_to_ll(X, Z)
    MX, MY = ll_to_merc(lat, lon)
    pad = 4 * res * 1.4
    bb = (MX.min() - pad, MY.min() - pad, MX.max() + pad, MY.max() + pad)
    mres = res * 1.33                        # mercator metres per ground metre here
    w = int(min(4000, np.ceil((bb[2] - bb[0]) / mres)))
    h = int(min(4000, np.ceil((bb[3] - bb[1]) / mres)))
    cols = (MX - bb[0]) / (bb[2] - bb[0]) * w - 0.5
    rows = (bb[3] - MY) / (bb[3] - bb[1]) * h - 0.5
    if HYDRO_ONLY:
        # water map: light blue fills (labels are closed later); 2x coarser is plenty
        w2, h2 = max(64, w // 2), max(64, h // 2)
        hy = fetch(bb, w2, h2, 'hydro')
        wat = ((hy[..., 2] > 200) & (hy[..., 2] - hy[..., 0] > 25)).astype(np.float32) * 255
        o = map_coordinates(wat, [rows * h2 / h, cols * w2 / w], order=1, mode='nearest')
        Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).save(base + '_hydro.png')
        print(L['name'], i, j, 'hydro', flush=True)
        return
    rgb = fetch(bb, w, h, '0,1,2')
    out = np.stack([map_coordinates(rgb[..., c], [rows, cols], order=1, mode='nearest') for c in range(3)], -1)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(base + '.png', optimize=False)
    if L['nir']:
        nir = fetch(bb, w, h, '3')
        o = map_coordinates(nir, [rows, cols], order=1, mode='nearest')
        Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).save(base + '_nir.png')
    print(L['name'], i, j, f'{w}x{h}', flush=True)


HYDRO_ONLY = False


def main(names):
    for L in CFG['levels']:
        if names and L['name'] not in names:
            continue
        nx = round((L['x1'] - L['x0']) / (L['tile'] * L['res']))
        nz = round((L['z1'] - L['z0']) / (L['tile'] * L['res']))
        for j in range(nz):
            for i in range(nx):
                tile(L, i, j)


if __name__ == '__main__':
    a = sys.argv[1:]
    if '--hydro' in a:
        HYDRO_ONLY = True; a.remove('--hydro')
    main(a)
