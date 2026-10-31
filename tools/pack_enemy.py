# Packs an enemy character GLB for the Quest: drops the model's own weapon meshes and animations,
# strips transmission/specular (no extra render pass), resizes textures (big cloth base colours 1024,
# everything else 512) to WebP, and drops every buffer view nothing uses any more.
# python3 pack_enemy.py in.glb out.glb "MatToDrop,Other" "BigMat1,BigMat2"
import json, struct, io, sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
drop = set(filter(None, sys.argv[3].split(','))) if len(sys.argv) > 3 else set()
big = set(filter(None, sys.argv[4].split(','))) if len(sys.argv) > 4 else set()
b = open(src, 'rb').read()
L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L]); off = 20 + L
BL = struct.unpack('<I', b[off:off + 4])[0]; binb = b[off + 8: off + 8 + BL]
views = [binb[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']] for v in j['bufferViews']]
mats = j['materials']
dropIdx = {i for i, m in enumerate(mats) if m.get('name') in drop}

# meshes: drop primitives using dropped materials; a mesh left empty is detached from its node
for m in j['meshes']:
    m['primitives'] = [p for p in m['primitives'] if p.get('material') not in dropIdx]
for n in j['nodes']:
    if 'mesh' in n and not j['meshes'][n['mesh']]['primitives']:
        del n['mesh']; n.pop('skin', None)
j.pop('animations', None)

# materials: no transmission / specular
for m in mats:
    ex = m.get('extensions', {})
    ex.pop('KHR_materials_transmission', None); ex.pop('KHR_materials_specular', None)
    if not ex: m.pop('extensions', None)
j['extensionsUsed'] = [e for e in j.get('extensionsUsed', []) if e not in ('KHR_materials_transmission', 'KHR_materials_specular')]
if not j['extensionsUsed']: j.pop('extensionsUsed')
j.pop('extensionsRequired', None)

# which textures are used, and at what size
usedMat = set()
for m in j['meshes']:
    for p in m['primitives']: usedMat.add(p['material'])
texSize = {}
for i in usedMat:
    m = mats[i]; pb = m.get('pbrMetallicRoughness', {})
    for key, t in [('base', pb.get('baseColorTexture')), ('mr', pb.get('metallicRoughnessTexture')), ('n', m.get('normalTexture')), ('o', m.get('occlusionTexture')), ('e', m.get('emissiveTexture'))]:
        if t: texSize[t['index']] = max(texSize.get(t['index'], 0), 1024 if (key == 'base' and m.get('name') in big) else 512)
usedImg = {}
for ti, s in texSize.items():
    si = j['textures'][ti]['source']; usedImg[si] = max(usedImg.get(si, 0), s)

# re-encode used images; unused ones become 1 px
for ii, im in enumerate(j['images']):
    img = Image.open(io.BytesIO(views[im['bufferView']]))
    s = usedImg.get(ii, 1)
    if max(img.size) > s: img = img.resize((max(1, img.size[0] * s // max(img.size)), max(1, img.size[1] * s // max(img.size))), Image.LANCZOS)
    if img.mode not in ('RGB', 'RGBA'): img = img.convert('RGBA' if 'A' in img.mode or img.mode == 'P' else 'RGB')
    if img.mode == 'RGBA' and img.getchannel('A').getextrema()[0] == 255: img = img.convert('RGB')
    out = io.BytesIO(); img.save(out, 'WEBP', quality=88, method=6)
    views[im['bufferView']] = out.getvalue(); im['mimeType'] = 'image/webp'

# drop accessors / buffer views nothing references
accUsed = set()
for m in j['meshes']:
    for p in m['primitives']:
        accUsed.update(p['attributes'].values())
        if 'indices' in p: accUsed.add(p['indices'])
        for t in p.get('targets', []): accUsed.update(t.values())
for s in j.get('skins', []):
    if 'inverseBindMatrices' in s: accUsed.add(s['inverseBindMatrices'])
accMap = {}; accs = []
for i, a in enumerate(j['accessors']):
    if i in accUsed: accMap[i] = len(accs); accs.append(a)
j['accessors'] = accs
for m in j['meshes']:
    for p in m['primitives']:
        p['attributes'] = {k: accMap[v] for k, v in p['attributes'].items()}
        if 'indices' in p: p['indices'] = accMap[p['indices']]
        if 'targets' in p: p['targets'] = [{k: accMap[v] for k, v in t.items()} for t in p['targets']]
for s in j.get('skins', []):
    if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = accMap[s['inverseBindMatrices']]
bvUsed = {a['bufferView'] for a in accs if 'bufferView' in a} | {im['bufferView'] for im in j['images']}
bvMap = {}; nb = bytearray(); newViews = []
for i, v in enumerate(j['bufferViews']):
    if i not in bvUsed: continue
    while len(nb) % 4: nb.append(0)
    v['byteOffset'] = len(nb); v['byteLength'] = len(views[i]); nb += views[i]
    bvMap[i] = len(newViews); newViews.append(v)
while len(nb) % 4: nb.append(0)
j['bufferViews'] = newViews
for a in accs:
    if 'bufferView' in a: a['bufferView'] = bvMap[a['bufferView']]
for im in j['images']: im['bufferView'] = bvMap[im['bufferView']]
j['buffers'] = [{'byteLength': len(nb)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(nb)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(nb), 0x004E4942) + bytes(nb)
open(dst, 'wb').write(glb)
print(len(b) // 1024, 'KB ->', len(glb) // 1024, 'KB')
