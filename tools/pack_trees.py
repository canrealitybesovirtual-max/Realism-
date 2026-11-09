# Repacks the snow tree pack: PNG textures -> WebP (alpha kept), bufferViews re-laid out. Geometry untouched.
import json, struct, io, sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L]); off = 20 + L
BL = struct.unpack('<I', b[off:off + 4])[0]; binb = b[off + 8: off + 8 + BL]
views = [binb[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']] for v in j['bufferViews']]
for im in j['images']:
    data = views[im['bufferView']]
    img = Image.open(io.BytesIO(data)); out = io.BytesIO()
    img.save(out, 'WEBP', quality=86, method=6, exact=False)
    views[im['bufferView']] = out.getvalue(); im['mimeType'] = 'image/webp'
nb = bytearray()
for i, v in enumerate(j['bufferViews']):
    while len(nb) % 4: nb.append(0)
    v['byteOffset'] = len(nb); v['byteLength'] = len(views[i]); nb += views[i]
while len(nb) % 4: nb.append(0)
j['buffers'] = [{'byteLength': len(nb)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(nb)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(nb), 0x004E4942) + bytes(nb)
open(dst, 'wb').write(glb); print(len(b) // 1024, 'KB ->', len(glb) // 1024, 'KB')
