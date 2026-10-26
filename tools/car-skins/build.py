"""Build the highway traffic skins from paper-model sheets.

Each sheet is an unfolded car (sides, top, front, back). For every panel in
skins.json this crops it, turns it upright, replaces the paper background
round the car with the body colour, trims to the car's outline and packs the
panels into one 1024 x 1024 atlas per vehicle:

    cars                                semis
    0-256     side A (front to the right)   trailer side A
    256-512   side B (front to the left)    trailer side B
    512-768   top (front to the right)      trailer top 512-640 | cab sides 640-768
    768-1024  front | back                  cab front | trailer back

The page maps the atlas onto the Kenney models by face direction
(src/maps/carSkins.ts). Output: public/models/traffic/skins/<name>.webp and
skins.json (which model each skin dresses).

    python3 tools/car-skins/build.py
"""
import json, os
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'models', 'traffic', 'skins')
spec = json.load(open(os.path.join(HERE, 'skins.json')))
os.makedirs(OUT, exist_ok=True)
S = 1024


def body_colour(im):
    a = np.asarray(im).reshape(-1, 3).astype(int)
    keep = a[(a.min(1) < 225) & (a.max(1) - a.min(1) > 8)]
    if len(keep) < 50: keep = a[a.min(1) < 225]
    if len(keep) < 50: return (200, 200, 200)
    return tuple(int(v) for v in np.median(keep, 0))


def panel(sheet, p, fill=None):
    """Crop, rotate upright, swap the paper background for the body colour, trim."""
    im = sheet.crop(tuple(p['rect'])).convert('RGB')
    if p.get('rot'): im = im.rotate(p['rot'], expand=True, resample=Image.BICUBIC, fillcolor=(255, 255, 255))
    col = fill or body_colour(im)
    # flood the near-white paper in from the border (marker colour), then measure the car
    marker = (255, 0, 254)
    w, h = im.size
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)] + [(int(w * f), 0) for f in (0.25, 0.5, 0.75)] + [(int(w * f), h - 1) for f in (0.25, 0.5, 0.75)] + [(0, int(h * f)) for f in (0.25, 0.5, 0.75)] + [(w - 1, int(h * f)) for f in (0.25, 0.5, 0.75)]:
        r, g, b = im.getpixel((x, y))
        if min(r, g, b) > 215: ImageDraw.floodfill(im, (x, y), marker, thresh=60)
    a = np.asarray(im).copy()
    bg = (a[..., 0] == 255) & (a[..., 1] == 0) & (a[..., 2] == 254)
    ys, xs = np.where(~bg)
    if len(xs):
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        a[bg] = col
        im = Image.fromarray(a[y0:y1, x0:x1])
    return im, col


def shade_wheels(im, centres):
    """Paint over the printed tyres with a dark wheel arch: the model's own
    wheels sit inset from the body and a printed one would show twice."""
    if not centres: return im
    im = im.copy(); w, h = im.size; d = ImageDraw.Draw(im)
    # centres: [x, r] pairs as fractions of the panel width / height, tyre bottom on the panel's bottom edge
    for x, r in centres:
        R = r * h * 1.12
        d.ellipse([x * w - R, h - 2 * R, x * w + R, h], fill=(22, 22, 25))
    return im


def place(atlas, im, box):
    x0, y0, x1, y1 = box
    atlas.paste(im.resize((x1 - x0, y1 - y0), Image.LANCZOS), (x0, y0))


def cab_side(colour, front_right, w=512, h=128):
    """A plain cab side: body colour, a dark window up front, a door line."""
    im = Image.new('RGB', (w, h), colour)
    d = ImageDraw.Draw(im)
    wx = (int(w * 0.55), int(w * 0.95)) if front_right else (int(w * 0.05), int(w * 0.45))
    d.rectangle([wx[0], int(h * 0.12), wx[1], int(h * 0.45)], fill=(28, 32, 38))
    dx = wx[0] - 6 if front_right else wx[1] + 6
    d.line([dx, int(h * 0.1), dx, int(h * 0.8)], fill=tuple(max(0, c - 40) for c in colour), width=3)
    d.rectangle([0, int(h * 0.82), w, h], fill=(40, 40, 42))
    return im


manifest = {'cars': {}, 'semis': {}}
for name, c in spec['cars'].items():
    sheet = Image.open(os.path.join(HERE, 'sheets', c['sheet']))
    atlas = Image.new('RGB', (S, S), (128, 128, 128))
    sa, col = panel(sheet, c['sideA'])
    sb, _ = panel(sheet, c['sideB'], col)
    # side A must face right, side B left (mirror if the sheet has them the other way)
    if c['sideA']['front'] == 'L': sa = sa.transpose(Image.FLIP_LEFT_RIGHT)
    if c['sideB']['front'] == 'R': sb = sb.transpose(Image.FLIP_LEFT_RIGHT)
    top, _ = panel(sheet, c['top'], col)
    top = top.rotate(-90, expand=True)  # front up -> front right
    fr, _ = panel(sheet, c['front'], col)
    bk, _ = panel(sheet, c['back'], col)
    wa, wb = c.get('wheelsA'), c.get('wheelsB')
    sa, sb = shade_wheels(sa, wa), shade_wheels(sb, wb)
    place(atlas, sa, (0, 0, S, 256)); place(atlas, sb, (0, 256, S, 512)); place(atlas, top, (0, 512, S, 768))
    place(atlas, fr, (0, 768, 512, S)); place(atlas, bk, (512, 768, S, S))
    atlas.save(os.path.join(OUT, name + '.webp'), quality=82, method=6)
    manifest['cars'][name] = {'model': c['model'], 'colour': '#%02x%02x%02x' % col, 'wheelsA': [w[0] for w in wa] if wa else None, 'wheelsB': [w[0] for w in wb] if wb else None}

for name, c in spec['semis'].items():
    sheet = Image.open(os.path.join(HERE, 'sheets', c['sheet']))
    cab = tuple(int(c['cab'][i:i + 2], 16) for i in (1, 3, 5))
    atlas = Image.new('RGB', (S, S), (235, 235, 232))
    if c.get('trailerSideA'):
        sa, tcol = panel(sheet, c['trailerSideA'])
        sb, _ = panel(sheet, c['trailerSideB'], tcol)
        if c['trailerSideA']['front'] == 'L': sa = sa.transpose(Image.FLIP_LEFT_RIGHT)
        if c['trailerSideB']['front'] == 'R': sb = sb.transpose(Image.FLIP_LEFT_RIGHT)
        place(atlas, sa, (0, 0, S, 256)); place(atlas, sb, (0, 256, S, 512))
        if c.get('trailerTop'):
            tp, _ = panel(sheet, c['trailerTop'], tcol); place(atlas, tp.rotate(-90, expand=True), (0, 512, S, 640))
        else: atlas.paste(tcol, (0, 512, S, 640))
        if c.get('trailerBack'):
            bk, _ = panel(sheet, c['trailerBack'], tcol); place(atlas, bk, (512, 768, S, S))
        else: atlas.paste(tcol, (512, 768, S, S))
    else:
        # no trailer on the sheet: a plain white box trailer with a grey roof
        atlas.paste((236, 236, 232), (0, 0, S, 512)); atlas.paste((200, 200, 198), (0, 512, S, 640)); atlas.paste((225, 225, 222), (512, 768, S, S))
        d = ImageDraw.Draw(atlas)
        for y0 in (0, 256): d.rectangle([0, y0 + 236, S, y0 + 256], fill=(60, 60, 62))
    fr, _ = panel(sheet, c['cabFront'], cab)
    place(atlas, fr, (0, 768, 512, S))
    if c.get('cabSideA'):
        ca, _ = panel(sheet, c['cabSideA'], cab); cb, _ = panel(sheet, c['cabSideB'], cab)
        if c['cabSideA']['front'] == 'L': ca = ca.transpose(Image.FLIP_LEFT_RIGHT)
        if c['cabSideB']['front'] == 'R': cb = cb.transpose(Image.FLIP_LEFT_RIGHT)
    else:
        ca, cb = cab_side(cab, True), cab_side(cab, False)
    place(atlas, ca, (0, 640, 512, 768)); place(atlas, cb, (512, 640, S, 768))
    atlas.save(os.path.join(OUT, name + '.webp'), quality=82, method=6)
    manifest['semis'][name] = {'cab': c['cab']}

json.dump(manifest, open(os.path.join(OUT, 'skins.json'), 'w'), indent=1)
print('\n'.join('%s %d KB' % (f, os.path.getsize(os.path.join(OUT, f)) // 1024) for f in sorted(os.listdir(OUT))))
