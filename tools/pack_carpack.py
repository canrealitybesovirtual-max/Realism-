# Packs the traffic passenger cars for Interstate into interstate/cars/traffic-pack.glb + traffic-pack.json.
#   Source: the user's "Generic passenger car pack" (Sketchfab, Comrade1280, CC-BY-4.0; the source GLB's asset.extras are
#   kept in the output).
#   python3 tools/pack_carpack.py <pack.glb>            (run from the repo root; needs numpy, PIL and npx gltfpack@1.3.0)
# What it does:
#   - ten bodies (Compact, Coupe, Hatchback, minivan, Offroad, Pickup, Sedan, Sport, SUV, Wagon) each laid out somewhere in
#     the pack at its own yaw: each is put in the game's body frame: metres (the Sketchfab root matrix already gives
#     them), x right, y up, front toward -z, ground (the wheels' bottom) at y 0, origin on the ground under the body's
#     centre. The heading comes from its four wheels (PCA of their centres); the front is the end away from the red
#     (tail) lamps of its optics.
#   - the pack's wheels are measured (axle z, radius, width, track half x) and dropped: the game draws its own wheels
#   - optics split by what the lamp photo under each triangle shows: head (white, front), tail (red), indL / indR
#     (amber, by side), rev (white, rear); one primitive / material each (Optics_<kind>), so the game can light them
#   - glass primitives kept (the game gives them its own dark traffic glass)
#   - body base colour 1024 px RGBA WebP: alpha = paint mask (1 = paint, from the metallicRoughness map: roughness
#     under 1/4 and no metal), the paint turned to a neutral grey of the same luminance normalised so its 95th
#     percentile is white, so the shader multiplies each car's colour in there; trim, bumpers, chrome and badges keep
#     their colours. metallicRoughness 512 px, the optics photo atlas (one image shared by every body) 512 px
#   - geometry compressed by gltfpack (EXT_meshopt_compression + KHR_mesh_quantization; the game loads the decoder)
#   - traffic-pack.json: per class len, wid (with mirrors), hw (half width without mirrors), hgt, wheels, triangles
import json, struct, io, os, sys, subprocess, tempfile
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pack_glock_att import load, acc, mat4
from pack_bike import Out

OUT = 'interstate/cars/traffic-pack.glb'
META = 'interstate/cars/traffic-pack.json'
CLASSES = {'Compact Body': 'compact', 'Coupe Body': 'coupe', 'Hatchback Body': 'hatch', 'minivan body': 'minivan', 'Offroad Body': 'offroad',
           'Pickup Body': 'pickup', 'Sedan Body': 'sedan', 'Sport body': 'sport', 'SUV Body': 'suv', 'Wagon Body': 'wagon'}
PAINT_ROUGH = 64        # metallicRoughness G under this (of 255) = paint; the trim is 128+
PAINT_METAL = 200       # chrome / mirrors are 240+


def world_prims(j, b):
    par = {}
    for k, n in enumerate(j['nodes']):
        for c in n.get('children', []): par[c] = k
    def world(i):
        W = np.eye(4); k = i; chain = []
        while k is not None: chain.append(k); k = par.get(k)
        for k in reversed(chain): W = W @ mat4(j['nodes'][k])
        return W
    out = []
    for i, n in enumerate(j['nodes']):
        if 'mesh' not in n: continue
        W = world(i); pname = j['nodes'][par[i]]['name'] if i in par else ''
        for pr in j['meshes'][n['mesh']]['primitives']:
            A = pr['attributes']
            P = acc(j, b, A['POSITION']); P = (W @ np.c_[P, np.ones(len(P))].T).T[:, :3]
            Ni = np.linalg.inv(W[:3, :3]).T
            N = acc(j, b, A['NORMAL']) @ Ni.T; N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
            UV = acc(j, b, A['TEXCOORD_0'])
            I = acc(j, b, pr['indices']).ravel()
            out.append(dict(node=n['name'], parent=pname, mi=pr['material'], mat=j['materials'][pr['material']]['name'], P=P, N=N, UV=UV, I=I))
    return out


def image_of(j, b, ti):
    src = j['textures'][ti]['source']; im = j['images'][src]; v = j['bufferViews'][im['bufferView']]
    return src, Image.open(io.BytesIO(bytes(b[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']])))


def webp(im, size, quality=84):
    if max(im.size) > size: im = im.resize((size, size), Image.LANCZOS)
    o = io.BytesIO(); im.save(o, 'WEBP', quality=quality, method=6); return o.getvalue()


def srgb_to_lin(c):
    c = c / 255.0; return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)


def lin_to_srgb(l):
    return np.where(l <= .0031308, l * 12.92, 1.055 * np.power(np.maximum(l, 0), 1 / 2.4) - .055) * 255.0


def paint_texture(bc, mr):
    """RGBA: rgb = the photo, the paint turned grey (its luminance, 95th percentile = white); a = paint mask."""
    bc = bc.convert('RGB'); mr = mr.convert('RGB')
    if mr.size != bc.size: mr = mr.resize(bc.size, Image.BILINEAR)
    A = np.asarray(bc).astype(np.float64); M = np.asarray(mr).astype(np.float64)
    mask = (M[..., 1] < PAINT_ROUGH) & (M[..., 2] < PAINT_METAL)   # glossy, not chrome (metallic paint is allowed)
    # a matte paint (the off-roader) is as rough as the trim: take the body's dominant hue as paint too
    mx, mn = A.max(-1), A.min(-1); S = (mx - mn) / np.maximum(mx, 1); V = mx / 255
    hue = np.degrees(np.arctan2(np.sqrt(3) * (A[..., 1] - A[..., 2]), 2 * A[..., 0] - A[..., 1] - A[..., 2])) % 360
    sat = (S > .35) & (V > .15)
    if sat.mean() > .05:
        h = np.histogram(hue[sat], bins=36, range=(0, 360))[0]; h0 = (np.argmax(h) + .5) * 10
        dh = np.abs((hue - h0 + 180) % 360 - 180)
        mask |= (dh < 25) & (S > .25) & (M[..., 2] < PAINT_METAL)
    lin = srgb_to_lin(A); L = lin @ np.array([.2126, .7152, .0722])
    used = mask & (L > .002)                                           # the atlas background is black too: not part of the normalisation
    ref = np.percentile(L[used], 95) if used.any() else 1.0
    grey = lin_to_srgb(np.clip(L / max(ref, 1e-4), 0, 1))
    out = A.copy()
    for c in range(3): out[..., c] = np.where(mask, grey, A[..., c])
    # soften the mask's edge one texel so the tint does not alias along panel edges
    m = mask.astype(np.float64)
    m = (m + np.roll(m, 1, 0) + np.roll(m, -1, 0) + np.roll(m, 1, 1) + np.roll(m, -1, 1)) / 5
    a = np.clip(m * 1.25, 0, 1) * 255
    return Image.fromarray(np.dstack([out.clip(0, 255), a]).astype(np.uint8), 'RGBA'), float(mask.mean())


def lamp_kind(rgb):
    r, g, b = rgb
    if r > 50 and r > 1.6 * g and r > 1.6 * b: return 'tail'
    if r > 60 and g > .25 * r and g < .82 * r and b < .55 * g: return 'ind'
    return 'white'


BARY = [(1, 0, 0), (0, 1, 0), (0, 0, 1), (1 / 3, 1 / 3, 1 / 3), (.5, .5, 0), (0, .5, .5), (.5, 0, .5), (.6, .2, .2), (.2, .6, .2), (.2, .2, .6)]


def classify_optics(p, tex, z_front, merge=True):
    """per triangle: the lamp photo under it (sampled at the corners and the centroid, majority), the end it sits on"""
    T = p['I'].reshape(-1, 3); W, H = tex.size; px = np.asarray(tex.convert('RGB'))
    kinds = []
    for t in T:
        uv = p['UV'][t]; votes = {'tail': 0, 'ind': 0, 'white': 0}
        for w in BARY:
            u, v = uv[0] * w[0] + uv[1] * w[1] + uv[2] * w[2]
            x = int(np.clip((u % 1) * W, 0, W - 1)); y = int(np.clip((v % 1) * H, 0, H - 1))
            votes[lamp_kind(px[y, x].astype(int))] += 1
        k = 'tail' if votes['tail'] >= 3 else 'ind' if votes['ind'] >= 3 else 'white'   # a coloured lens over a chrome bowl still counts
        c = p['Pb'][t].mean(0)
        if k == 'ind': k = 'indL' if c[0] < 0 else 'indR'
        elif k == 'white': k = 'head' if c[2] < z_front else 'tail' if merge else 'rev'   # rear clear lenses glow red when lit too
        kinds.append(k)
    return np.array(kinds)


def main():
    if len(sys.argv) < 2: raise SystemExit('usage: python3 tools/pack_carpack.py <pack.glb>')
    j, b = load(sys.argv[1])
    prims = world_prims(j, b)
    bodies = {}
    for p in prims:
        if p['parent'] in CLASSES: bodies.setdefault(p['parent'], []).append(p)
    wheels = [p for p in prims if p['parent'].startswith('Wheel_') and p['mat'].startswith('Whee')]
    G = Out(j['asset']); G.j['asset']['generator'] = 'tools/pack_carpack.py'
    G.j['asset']['extras'] = dict(j['asset'].get('extras', {}), credit='Generic passenger car pack by Comrade1280 (Sketchfab), CC-BY-4.0; re-framed, wheels measured and dropped, optics split, paint masked by tools/pack_carpack.py')
    imgs = {}; mats = {}; meta = {}
    glass_mi = None
    for bname, cls in CLASSES.items():
        ps = bodies[bname]
        body = next(p for p in ps if p['mat'].startswith('Body')); glass = next(p for p in ps if p['mat'].startswith('Glass')); opt = next(p for p in ps if p['mat'].startswith('Optics'))
        allP = np.concatenate([p['P'] for p in ps]); lo, hi = allP.min(0), allP.max(0)
        # the four wheels under this body
        ws = []
        for w in wheels:
            c = (w['P'].min(0) + w['P'].max(0)) / 2
            if lo[0] - .35 < c[0] < hi[0] + .35 and lo[2] - .35 < c[2] < hi[2] + .35 and c[1] < hi[1]: ws.append(w)
        assert len(ws) == 4, (bname, len(ws))
        C = np.array([(w['P'].min(0) + w['P'].max(0)) / 2 for w in ws])
        c0 = C.mean(0); X = C[:, [0, 2]] - c0[[0, 2]]
        ev, evec = np.linalg.eigh(X.T @ X); d = evec[:, 1]           # the long axis (largest eigenvalue)
        d3 = np.array([d[0], 0, d[1]]); x3 = np.array([d[1], 0, -d[0]])
        def frame(P): Q = P - c0; return np.c_[Q @ x3, Q[:, 1], Q @ d3]
        # which end is the front: the tail lamps are red
        opt['Pb'] = frame(opt['P']); ti = j['materials'][opt['mi']]['pbrMetallicRoughness']['baseColorTexture']['index']
        oimg_i, otex = image_of(j, b, ti)
        k0 = classify_optics(opt, otex, 0, merge=False)
        redz = opt['Pb'][opt['I'].reshape(-1, 3)[k0 == 'tail']].reshape(-1, 3)[:, 2]
        gz0 = glass['P'] - c0; gz0 = (gz0 @ d3).mean()
        back = redz.mean() if len(redz) >= 3 else gz0                 # no red lenses: the cabin sits behind the middle
        print(' ', cls, 'red tris', len(redz) // 3, 'red z', round(float(redz.mean()), 2) if len(redz) else None, 'cabin z', round(float(gz0), 2))
        if back < 0: d3, x3 = -d3, -x3                                 # the tail is at -z: turn round (front is -z)
        for p in ps + ws: p['Pb'] = frame(p['P']); p['Nb'] = np.c_[p['N'] @ x3, p['N'][:, 1], p['N'] @ d3]
        # origin: body centre along z and x, the wheels' bottom at y 0
        zc = (min(p['Pb'][:, 2].min() for p in ps) + max(p['Pb'][:, 2].max() for p in ps)) / 2
        y0 = min(w['Pb'][:, 1].min() for w in ws)
        for p in ps + ws: p['Pb'] = p['Pb'] - np.array([0, y0, zc])
        # measurements
        B = np.concatenate([p['Pb'] for p in ps]); gy = glass['Pb'][:, 1].min()
        side = body['Pb'][body['Pb'][:, 1] < gy - .02]
        hw = float(np.abs(side[:, 0]).max()); wid = float(B[:, 0].max() - B[:, 0].min()); ln = float(B[:, 2].max() - B[:, 2].min()); hgt = float(B[:, 1].max())
        W = []
        for w in ws:
            P = w['Pb']; lo_, hi_ = P.min(0), P.max(0)
            W.append(dict(z=float((lo_[2] + hi_[2]) / 2), x=float(abs((lo_[0] + hi_[0]) / 2)), r=float((hi_[1] - lo_[1]) / 2), w=float(hi_[0] - lo_[0])))
        W.sort(key=lambda w: w['z']); fr, rr = W[:2], W[2:]
        wheels_m = dict(zf=np.mean([w['z'] for w in fr]), zr=np.mean([w['z'] for w in rr]), x=np.mean([w['x'] for w in W]), rf=np.mean([w['r'] for w in fr]), rr=np.mean([w['r'] for w in rr]), w=np.mean([w['w'] for w in W]))
        wheels_m = {k: round(float(v), 4) for k, v in wheels_m.items()}
        # textures
        pb = j['materials'][body['mi']]['pbrMetallicRoughness']
        bi, bimg = image_of(j, b, pb['baseColorTexture']['index']); mi_, mimg = image_of(j, b, pb['metallicRoughnessTexture']['index'])
        rgba, share = paint_texture(bimg, mimg)
        tex_bc = G.image(webp(rgba, 1024, 86)); tex_mr = G.image(webp(mimg.convert('RGB'), 512, 80))
        if oimg_i not in imgs: imgs[oimg_i] = G.image(webp(otex.convert('RGB'), 512, 84))
        G.j['materials'].append({'name': 'body_' + cls, 'pbrMetallicRoughness': {'baseColorTexture': {'index': tex_bc}, 'metallicRoughnessTexture': {'index': tex_mr}, 'metallicFactor': 1, 'roughnessFactor': 1}})
        body_mi = len(G.j['materials']) - 1
        if glass_mi is None:
            G.j['materials'].append({'name': 'glass', 'pbrMetallicRoughness': {'baseColorFactor': [0, 0, 0, 1], 'metallicFactor': 0, 'roughnessFactor': .05}}); glass_mi = len(G.j['materials']) - 1
        prims_out = []
        def add_prim(P, N, UV, I, mi):
            I = np.asarray(I, dtype=np.uint32); used = np.unique(I); remap = np.full(len(P), -1, np.int64); remap[used] = np.arange(len(used))
            P, N, UV, I = P[used], N[used], UV[used], remap[I]
            a = {'POSITION': G.acc(P.astype(np.float32), 'VEC3', 5126, 34962, True), 'NORMAL': G.acc(N.astype(np.float32), 'VEC3', 5126, 34962), 'TEXCOORD_0': G.acc(UV.astype(np.float32), 'VEC2', 5126, 34962)}
            prims_out.append({'attributes': a, 'indices': G.acc(I.astype(np.uint32), 'SCALAR', 5125, 34963), 'material': mi, 'mode': 4})
            return len(I) // 3
        tris = {'body': add_prim(body['Pb'], body['Nb'], body['UV'], body['I'], body_mi), 'glass': add_prim(glass['Pb'], glass['Nb'], glass['UV'], glass['I'], glass_mi)}
        kinds = classify_optics(opt, otex, 0); T = opt['I'].reshape(-1, 3)
        for k in ('head', 'tail', 'indL', 'indR'):
            sel = T[kinds == k]
            if not len(sel): continue
            mk = 'optics_' + k
            if mk not in mats:
                G.j['materials'].append({'name': mk, 'pbrMetallicRoughness': {'baseColorTexture': {'index': imgs[oimg_i]}, 'metallicFactor': 0, 'roughnessFactor': .15}}); mats[mk] = len(G.j['materials']) - 1
            tris[k] = add_prim(opt['Pb'], opt['Nb'], opt['UV'], sel.ravel(), mats[mk])
        G.j['meshes'].append({'name': cls, 'primitives': prims_out})
        G.j['nodes'].append({'name': cls, 'mesh': len(G.j['meshes']) - 1}); G.j['scenes'][0]['nodes'].append(len(G.j['nodes']) - 1)
        gz = float(glass['Pb'][:, 2].mean())                        # the cabin: behind the middle on most cars (ahead on the pickup and the minivan)
        meta[cls] = dict(len=round(ln, 3), cabinZ=round(gz, 3), wid=round(wid, 3), hw=round(hw, 3), hgt=round(hgt, 3), wheels=wheels_m, paintShare=round(share, 3), tris={k: int(v) for k, v in tris.items()})
        print(cls, json.dumps(meta[cls]))
    tmp = tempfile.mkdtemp(); stage = os.path.join(tmp, 'pack-stage.glb'); G.write(stage)
    cmd = ['npx', '--yes', 'gltfpack@1.3.0', '-i', stage, '-o', os.path.abspath(OUT), '-cc', '-kn', '-km', '-ke', '-vtf']
    print(' '.join(cmd)); subprocess.run(cmd, check=True)
    json.dump({'source': 'Generic passenger car pack by Comrade1280 (Sketchfab), CC-BY-4.0', 'cars': meta}, open(META, 'w'), indent=1)
    print('wrote', OUT, os.path.getsize(OUT), 'bytes; stage', os.path.getsize(stage))


if __name__ == '__main__':
    main()
