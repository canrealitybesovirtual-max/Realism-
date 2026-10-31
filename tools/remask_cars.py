# Re-masks the traffic car pack (interstate/traffic-cars.json): paint mask R gets the panels the original mask
# missed (colour match against the car's own paint for coloured cars) and its small holes closed; G (roughness)
# follows: newly found paint gets the paint value. B (lamp lenses) is untouched. Textures stay WebP.
import json, base64, io, sys, colorsys
from PIL import Image, ImageFilter, ImageChops
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
def load(uri): return Image.open(io.BytesIO(base64.b64decode(uri.split(',')[1])))
def save(img, lossless=False):
    o = io.BytesIO(); img.save(o, 'WEBP', quality=92, lossless=lossless, method=6); return 'data:image/webp;base64,' + base64.b64encode(o.getvalue()).decode()
for m in d['models']:
    col = load(d['textures'][m['map']]['uri']).convert('RGB'); mk = load(d['textures'][m['mask']]['uri']).convert('RGB')
    R, G, B = mk.split(); w, h = col.size
    # the paint's own colour in the photo: median of pixels the original mask calls paint
    px = list(col.getdata()); rp = list(R.getdata())
    paint = sorted([p for p, r in zip(px, rp) if r > 128], key=lambda p: sum(p))
    if not paint: continue
    med = paint[len(paint) // 2]; ph, ps, pv = colorsys.rgb_to_hsv(*[c / 255 for c in med])
    add = Image.new('L', (w, h), 0)
    if ps > .22:  # a coloured car: same hue and saturation, not too dark (glass) and not a lamp
        A = add.load()
        for y in range(h):
            for x in range(w):
                r, g, b = col.getpixel((x, y)); hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
                dh = min(abs(hh - ph), 1 - abs(hh - ph))
                if dh < .05 and ss > ps * .6 and vv > max(.2, pv * .45): A[x, y] = 255
    near = R.point(lambda v: 255 if v > 128 else 0).filter(ImageFilter.MaxFilter(21))   # only fill gaps next to known paint
    add = ImageChops.multiply(add, near)
    newR = ImageChops.lighter(R, add)
    # close small holes (highlights, seams), then drop isolated specks
    k = 25 if ps > .22 else 9
    newR = newR.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))
    newR = newR.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    newR = newR.point(lambda v: 255 if v > 128 else 0)
    Bl = B.point(lambda v: 255 if v > 100 else 0); newR = ImageChops.subtract(newR, Bl)   # lenses stay lenses
    if pv > .3:  # glass is dark and grey: never paint (the original masks painted some rear windows)
        dark = Image.new('L', (w, h), 0); D = dark.load()
        for y in range(h):
            for x in range(w):
                r, g, b = col.getpixel((x, y)); mx, mn = max(r, g, b), min(r, g, b)
                if mx < 70 and (mx - mn) < 22: D[x, y] = 255
        newR = ImageChops.subtract(newR, dark.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(5)))
    # glass in the original mask (glossy and not paint) is never painted by the fills above
    glass = ImageChops.multiply(G.point(lambda v: 255 if v < 52 else 0), R.point(lambda v: 0 if v > 128 else 255)).filter(ImageFilter.MaxFilter(3))
    newR = ImageChops.subtract(newR, glass)
    gained = ImageChops.subtract(newR, R.point(lambda v: 255 if v > 128 else 0))
    newG = Image.composite(Image.new('L', (w, h), 77), G, gained)                          # new paint: roughness 0.30 like the rest
    before = sum(1 for v in R.getdata() if v > 128); after = sum(1 for v in newR.getdata() if v > 128)
    d['textures'][m['mask']]['uri'] = save(Image.merge('RGB', (newR, newG, B)), lossless=True)
    print(m['id'], 'paint sat %.2f' % ps, 'paint px', before, '->', after)
json.dump(d, open(dst, 'w'), separators=(',', ':'))
