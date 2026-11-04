# Outdoor start sky: the user's "Forest Clearing 1 Ground Skybox" GLB (Sketchfab, Luis Vidal, CC-BY-4.0)
# -> cqc/sky/sky.webp (4096 x 2048), sky2k.webp (2048 x 1024, headset), sky.json (mapping + colours).
# The GLB is one UV sphere (radius 30 after its node matrices) with an unlit 4096 x 2048 PNG. Checked from its
# vertices: u = 0.25 + az / 360 (az = atan2(x, -z), 0 = -z), v = 0.5 + el / 180 with v counted from the image
# TOP, so the image is an equirect stored upside down. It is flipped here: row 0 = zenith, column u as above.
#   python3 tools/pack_sky.py skybox.glb cqc/sky
import json, struct, io, sys, math
import numpy as np
from PIL import Image, ImageFilter
src, out = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L]); off = 20 + L
binb = b[off + 8:]
im = j['images'][0]; v = j['bufferViews'][im['bufferView']]
img = Image.open(io.BytesIO(binb[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']])).convert('RGB')
img = img.transpose(Image.FLIP_TOP_BOTTOM)
W, H = img.size
img.save(f'{out}/sky.webp', 'WEBP', quality=80, method=6)
img.resize((2048, 1024), Image.LANCZOS).save(f'{out}/sky2k.webp', 'WEBP', quality=80, method=6)
# Colours (sRGB 0..1) and the sun (brightest blurred spot above the horizon): the moon / key light direction.
s = img.resize((512, 256), Image.BOX)
a = np.asarray(s).astype(np.float64) / 255
row = lambda el: int(round((0.5 - el / 180) * 255))
band = lambda e0, e1: a[row(e1):row(e0) + 1].reshape(-1, 3).mean(0)
bl = np.asarray(s.filter(ImageFilter.GaussianBlur(6))).astype(np.float64).mean(2)
bl[row(5):] = 0
y, x = np.unravel_index(np.argmax(bl), bl.shape)
el = 90 - (y + 0.5) / 256 * 180; u = (x + 0.5) / 512; az = (u - 0.25) * 360
meta = {
  'source': j['asset'].get('extras', {}), 'size': [W, H],
  'mapping': 'equirect, row 0 = zenith; u = 0.25 + az / 360, az = atan2(x, -z) in degrees (0 = -z, 90 = +x)',
  'zenith': band(60, 90).round(4).tolist(), 'sky': band(15, 40).round(4).tolist(), 'horizon': band(-2, 6).round(4).tolist(),
  'ground': band(-60, -10).round(4).tolist(), 'sun': {'az': round(az, 1), 'el': round(el, 1)}
}
json.dump(meta, open(f'{out}/sky.json', 'w'), indent=1)
print(json.dumps(meta, indent=1))
