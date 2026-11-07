"""Download the CC0 photo-scanned materials the apartment uses (Poly Haven, ambientCG) into
world/.cache/scans/<name>/ : diff.jpg, nor.jpg (OpenGL), rough.jpg, ao.jpg (when the source has them).
Sources are CC0; only processed copies (build_scans.py) ship in world/textures/scans/.
Run: python3 -I fetch_scans.py [name ...]
"""
import io, os, sys, zipfile, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, '.cache', 'scans')
UA = {'User-Agent': 'Mozilla/5.0 (scan-fetch)'}

# name: (library, asset id, resolution)
SCANS = {
    # board sources for the floors (grain runs along u)
    'oak_grey1': ('ph', 'grey_oak_veneer_01', '4k'),
    'oak_grey2': ('ph', 'grey_oak_veneer_02', '4k'),
    'oak_washed': ('ph', 'washed_grey_oak_veneer', '4k'),
    'oak_silver': ('ph', 'silver_oak_veneer_01', '4k'),
    'oak_white': ('ph', 'white_oak_veneer', '4k'),
    # stones
    'travertine_vein': ('acg', 'Travertine007', '2K'),     # vein-cut silver travertine (guest bath)
    'travertine_cream': ('acg', 'Travertine009', '2K'),    # cream travertine (plinths, tables)
    'onyx_white': ('acg', 'Onyx004', '2K'),                # white onyx (primary bath)
    'marble_white': ('acg', 'Marble021', '2K'),            # stair treads, limestone landing
    'marble_grey': ('acg', 'Marble024', '2K'),             # shower room
    # textiles, walls
    'boucle': ('acg', 'Fabric045', '2K'),
    'rug_cream': ('acg', 'Carpet016', '2K'),
    'linen': ('acg', 'Fabric034', '2K'),
    'plaster': ('ph', 'white_plaster_02', '2k'),
    'leaf': ('acg', 'Leaf001', '2K'),                      # photographed leaves (the fig in the great hall)
}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()


def fetch(name):
    lib, aid, res = SCANS[name]
    out = os.path.join(CACHE, name)
    if os.path.exists(os.path.join(out, 'diff.jpg')):
        return
    os.makedirs(out, exist_ok=True)
    if lib == 'ph':
        base = f'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/{res}/{aid}/{aid}'
        for key, suf in (('diff', 'diff'), ('nor', 'nor_gl'), ('rough', 'rough'), ('ao', 'ao')):
            try:
                open(os.path.join(out, key + '.jpg'), 'wb').write(get(f'{base}_{suf}_{res}.jpg'))
            except Exception as e:
                print('  no', key, e)
    else:
        z = zipfile.ZipFile(io.BytesIO(get(f'https://ambientcg.com/get?file={aid}_{res}-JPG.zip')))
        for n in z.namelist():
            for key, tag in (('diff', '_Color'), ('nor', '_NormalGL'), ('rough', '_Roughness'), ('ao', '_AmbientOcclusion'), ('alpha', '_Opacity')):
                if tag in n and n.endswith('.jpg'):
                    open(os.path.join(out, key + '.jpg'), 'wb').write(z.read(n))
    print(name, sorted(os.listdir(out)))


if __name__ == '__main__':
    for n in (sys.argv[1:] or SCANS):
        fetch(n)
