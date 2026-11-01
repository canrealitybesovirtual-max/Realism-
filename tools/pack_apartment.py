# Packs the user's apartment (cqc/models/src/appartement.glb: Sketchfab "Appartement" by SrMonteiro,
# https://sketchfab.com/3d-models/appartement-6a7a5fe208344b2e8123a88923dbd5b3, CC-BY-4.0: credit needed) into
# cqc/models/apartment.glb for the CQC apartment start.
# Source: 6 meshes, 5 baked (KHR_materials_unlit) JPEG textures, already metres (2.5 m ceilings), +y up after its two
# cancelling root rotations. Output: node translations baked in, floor at y 0, NORMAL and the lightmap-UV sets dropped
# (unlit), positions quantized to uint16 (KHR_mesh_quantization, node scale/offset), UVs uint16 normalized, uint16
# indices, textures WebP 1024. Source licence kept in asset.extras.
# python3 -I tools/pack_apartment.py   (from the repo root)
import json, struct, io, sys
import numpy as np
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else 'cqc/models/src/appartement.glb'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'cqc/models/apartment.glb'
TEX = 1024

d = open(SRC, 'rb').read()
jl = struct.unpack('<I', d[12:16])[0]
j = json.loads(d[20:20 + jl])
b0 = 20 + jl
binb = d[b0 + 8:b0 + 8 + struct.unpack('<I', d[b0:b0 + 4])[0]]
CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}

def acc(i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]; n = NC[a['type']]
    dt = np.dtype(CT[a['componentType']]); st = bv.get('byteStride', dt.itemsize * n)
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    raw = np.frombuffer(binb, np.uint8, count=st * (a['count'] - 1) + dt.itemsize * n, offset=off)
    return np.lib.stride_tricks.as_strided(raw.view(np.uint8), (a['count'], n * dt.itemsize), (st, 1)).copy().view(dt).reshape(a['count'], n)

# world matrix of every mesh node
def walk(ni, M, out):
    n = j['nodes'][ni]
    L = np.array(n['matrix']).reshape(4, 4).T if 'matrix' in n else np.eye(4)
    if 'translation' in n: L = L.copy(); L[:3, 3] += n['translation']
    W = M @ L
    if 'mesh' in n: out.append((n['mesh'], W))
    for c in n.get('children', []): walk(c, W, out)
items = []
for r in j['scenes'][j.get('scene', 0)]['nodes']: walk(r, np.eye(4), items)

prims = []
for mi, W in items:
    for p in j['meshes'][mi]['primitives']:
        P = acc(p['attributes']['POSITION']).astype(np.float64)
        P = (np.c_[P, np.ones(len(P))] @ W.T)[:, :3]
        prims.append({'P': P, 'UV': acc(p['attributes']['TEXCOORD_0']), 'I': acc(p['indices']).ravel(), 'mat': p['material']})
lo = np.min([p['P'].min(0) for p in prims], 0); hi = np.max([p['P'].max(0) for p in prims], 0)
for p in prims: p['P'] -= [0, lo[1], 0]
lo[1], hi[1] = 0, hi[1] - lo[1]
print('bounds', lo.round(3), hi.round(3))

out = bytearray(); bvs = []; accs = []; meshes = []; nodes = []
def add(data, target=None):
    while len(out) % 4: out.append(0)
    bvs.append({'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)} | ({'target': target} if target else {}))
    out.extend(data); return len(bvs) - 1
for p in prims:
    plo = p['P'].min(0); ext = np.maximum(p['P'].max(0) - plo, 1e-6)
    q = np.round((p['P'] - plo) / ext * 65535).astype(np.uint16)
    q4 = np.c_[q, np.zeros(len(q), np.uint16)]
    ap = len(accs); accs.append({'bufferView': add(q4.tobytes(), 34962), 'componentType': 5123, 'count': len(q), 'type': 'VEC3', 'min': [0, 0, 0], 'max': q.max(0).tolist()})
    bvs[-1]['byteStride'] = 8
    uv = np.clip(p['UV'], 0, 1)
    au = len(accs); accs.append({'bufferView': add(np.round(uv * 65535).astype(np.uint16).tobytes(), 34962), 'componentType': 5123, 'normalized': True, 'count': len(uv), 'type': 'VEC2'})
    ai = len(accs); accs.append({'bufferView': add(p['I'].astype(np.uint16 if len(q) < 65536 else np.uint32).tobytes(), 34963), 'componentType': 5123 if len(q) < 65536 else 5125, 'count': len(p['I']), 'type': 'SCALAR'})
    meshes.append({'primitives': [{'attributes': {'POSITION': ap, 'TEXCOORD_0': au}, 'indices': ai, 'material': p['mat']}]})
    nodes.append({'name': 'apt%d' % len(nodes), 'mesh': len(meshes) - 1, 'translation': plo.tolist(), 'scale': (ext / 65535).tolist()})
images = []
for im in j['images']:
    bv = j['bufferViews'][im['bufferView']]
    I = Image.open(io.BytesIO(binb[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])).convert('RGB')
    if max(I.size) > TEX: I = I.resize((TEX, TEX * I.size[1] // I.size[0]), Image.LANCZOS)
    b = io.BytesIO(); I.save(b, 'WEBP', quality=82, method=6)
    images.append({'bufferView': add(b.getvalue()), 'mimeType': 'image/webp'})
mats = []
for m in j['materials']:
    mats.append({'name': m.get('name', ''), 'doubleSided': bool(m.get('doubleSided')), 'extensions': {'KHR_materials_unlit': {}},
                 'pbrMetallicRoughness': {'baseColorTexture': {'index': m['pbrMetallicRoughness']['baseColorTexture']['index']}, 'metallicFactor': 0}})
G = {'asset': {'version': '2.0', 'generator': 'tools/pack_apartment.py', 'extras': j['asset'].get('extras', {})},
     'extensionsUsed': ['KHR_materials_unlit', 'KHR_mesh_quantization', 'EXT_texture_webp'],
     'extensionsRequired': ['KHR_mesh_quantization', 'EXT_texture_webp'],
     'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes, 'materials': mats,
     'textures': [{'sampler': 0, 'extensions': {'EXT_texture_webp': {'source': i}}} for i in range(len(images))],
     'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}], 'images': images,
     'accessors': accs, 'bufferViews': bvs, 'buffers': [{'byteLength': len(out)}]}
while len(out) % 4: out.append(0)
js = json.dumps(G, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
with open(OUT, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(out)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(out), 0x004E4942)); f.write(out)
print(OUT, 28 + len(js) + len(out), 'bytes')
