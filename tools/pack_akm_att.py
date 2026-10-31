# Packs the AKM attachment models (CQC step 102) from the user's packs in cqc/models/src/ into one small GLB.
# Parts (metres, body toward -z, vertices / normals / tangents baked, no node transforms):
#   ats5      rifle suppressor (silencers_pack_1.glb ATS5 tube), 42 mm x 197 mm; ats5Sleeve its outer sleeve (own material)
#   fh        3-prong flash hider (flash_hiders_pack_1.glb mesh 0, the 4652-triangle component), 22 x 56 mm
#   comp      round-port compensator (weapon_accessories.glb "Flashhider 2"), 24 x 76 mm
#   dot       open reflex sight on its Picatinny riser (weapon_accessories.glb "Sight 1")
#   holo      holographic sight (weapon_accessories.glb "Sight 3"), 97 mm long (EXPS3 class)
#   x2        compact 2x prism (weapon_accessories.glb "Scope 1"); its glass mesh is dropped (the game draws the
#             eyepiece picture and the objective itself)
# Origins: a muzzle device's rear face on the axis (the face that seats on the adapter); an optic's rail contact: the top
# of the rail it clamps (the clamp channel's ceiling), at the middle of the clamp. The three optics share the pack's
# Picatinny clamp (channel 0.2549 units across the flanks = 21.2 mm, so the dot and the 2x are at that scale); the holo
# is scaled to its real length, so its channel is cut back to the rail (jaw walls thicken; the outside is unchanged).
# Each optic's node carries extras the game reads: the dot / holo window (centre, half width / height; the window is
# the hood's opening round the pack's reticle decal, measured on the slice through it), the 2x's eyepiece and
# objective (z, radius) and its axis height. Re-finish, WebP, cropping: as tools/pack_glock_att.py (shared helpers).
# python3 tools/pack_akm_att.py            (run from the repo root; writes cqc/models/att/akm-att.glb)
import numpy as np
from pack_glock_att import load, mat4, acc, find, place, subset, textures, GLB, T, S, Ry

SRC = 'cqc/models/src/'
OUT = 'cqc/models/att/akm-att.glb'
RAIL_HALF = 0.0106                                          # Picatinny half width across the flanks (21.2 mm)
PACK_CHANNEL_HALF = 0.2549 / 2                              # the same, in the accessory pack's units


def first_mesh(j, binb, index=0):
    """mesh `index` of the scene (in node order) with its world transform baked, like find()"""
    found = []
    def rec(i, M):
        n = j['nodes'][i]; W = M @ mat4(n)
        if 'mesh' in n: found.append((n, W))
        for c in n.get('children', []): rec(c, W)
    for s in j['scenes'][j.get('scene', 0)]['nodes']: rec(s, np.eye(4))
    n, W = found[index]
    pr = j['meshes'][n['mesh']]['primitives'][0]; A = pr['attributes']
    P = acc(j, binb, A['POSITION']); N = acc(j, binb, A['NORMAL']); UV = acc(j, binb, A['TEXCOORD_0'])
    Tg = acc(j, binb, A['TANGENT']) if 'TANGENT' in A else None
    P = (W @ np.c_[P, np.ones(len(P))].T).T[:, :3]
    N = N @ np.linalg.inv(W[:3, :3]); N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    if Tg is not None:
        t3 = Tg[:, :3] @ W[:3, :3].T; t3 /= np.linalg.norm(t3, axis=1, keepdims=True) + 1e-12; Tg = np.c_[t3, Tg[:, 3]]
    return dict(P=P, N=N, UV=UV, T=Tg, I=acc(j, binb, pr['indices']).ravel(), mat=j['materials'][pr['material']])


def component(g, tris):
    """the connected piece (vertices welded by position) with this many triangles"""
    t = g['I'].reshape(-1, 3)
    _, wid = np.unique(np.round(g['P'] / 1e-4).astype(np.int64), axis=0, return_inverse=True); wid = wid.ravel()
    par = np.arange(wid.max() + 1)
    def root(x):
        while par[x] != x: par[x] = par[par[x]]; x = par[x]
        return x
    for a, b, c in wid[t]:
        ra = root(a); par[root(b)] = ra; par[root(c)] = ra
    r = np.array([root(w) for w in wid[t[:, 0]]])
    for u in np.unique(r):
        m = r == u
        if m.sum() == tris: return subset(g, m)
    raise SystemExit('no component with %d triangles' % tris)


def axial(g):
    """a turned part: centre on its long axis (x, y), rear (+z end) at z = 0"""
    P = g['P']; c = (P.min(0) + P.max(0)) / 2
    return place(g, T(-c[0], -c[1], -P[:, 2].max()))


def slice_pts(P, I, ax, v):
    t = I.reshape(-1, 3); out = []
    for a, b in ((0, 1), (1, 2), (2, 0)):
        p, q = P[t[:, a]], P[t[:, b]]
        s = (p[:, ax] - v) * (q[:, ax] - v) < 0
        k = (v - p[s, ax]) / (q[s, ax] - p[s, ax]); out.append(p[s] + (q[s] - p[s]) * k[:, None])
    return np.concatenate(out)


def cut_channel(g, k):
    """an optic's clamp channel (pack units, under y = 0) cut to the rail at scale k: inner faces to the rail's flanks,
    the outside of the clamp kept (piecewise-linear in |x|), the jaws as deep as the rail's head (5.6 mm), not deeper"""
    P = g['P'].copy(); a_in = PACK_CHANNEL_HALF; a_new = RAIL_HALF / k
    base = P[:, 1] < 0.0
    a_out = np.abs(P[base, 0]).max()
    if abs(a_new - a_in) < 1e-4: return g
    x = np.abs(P[base, 0]); s = np.sign(P[base, 0])
    P[base, 0] = s * np.where(x <= a_in, x * a_new / a_in, a_new + (x - a_in) * (a_out - a_new) / (a_out - a_in))
    P[base, 1] *= a_new / a_in
    h = dict(g); h['P'] = P; return h


def optic(j, binb, name, k=None, length=None):
    """an optic at its scale: origin on the rail top (the channel ceiling, pack y = 0), middle of the clamp in z"""
    g = find(j, binb, name + '/' + name + '_' + name.replace(' ', '') + '_0')      # 'Sight 1/Sight 1_Sight1_0': the body
    P = g['P']
    if k is None: k = length / (P[:, 2].max() - P[:, 2].min())
    g = cut_channel(g, k)
    clamp = P[P[:, 1] < 0]; cz = (clamp[:, 2].min() + clamp[:, 2].max()) / 2
    return g, k, cz


def window(j, binb, name, g, k, cz, aspect):
    """the sight window round the pack's reticle decal: centre and half sizes in metres, game frame (origin as optic()).
    Rays from the decal's centre on the slice just in front of it: the hood's opening is the nearest metal within 15 deg
    of the horizontal (half width) and of the vertical (half height)"""
    aim = find(j, binb, name + '/' + name + '_Aim')['P']
    c = (aim.min(0) + aim.max(0)) / 2
    s = slice_pts(g['P'], g['I'], 2, c[2] + 0.002)[:, :2] - c[:2]
    ang = np.degrees(np.arctan2(s[:, 1], s[:, 0])); r = np.hypot(s[:, 0], s[:, 1])
    def reach(dirs):
        w = np.zeros(len(r), bool)
        for a in dirs: w |= np.abs((ang - a + 180) % 360 - 180) < 15
        return r[w].min()
    hx = reach((0, 180)); hy = min(reach((90, -90)), aspect * hx)   # aspect: the real window (holo: EXPS3, 30 x 21 mm)
    # game frame: x' = x, y' = y, z' = z - cz (no turn: the pack's front is already -z), times k
    return {'win': [round(c[0] * k, 5), round(c[1] * k, 5), round((c[2] - cz) * k, 5)], 'half': [round(hx * k * 0.96, 5), round(hy * k * 0.96, 5)]}


def main():
    G = GLB(); G.j['asset']['generator'] = 'tools/pack_akm_att.py'
    # --- the rifle can (rear = the pack's +z end, like the MD3) ---
    j, binb = load(SRC + 'silencers_pack_1.glb')
    tube = find(j, binb, 'ATS5-2_low/'); sleeve = find(j, binb, 'ATS5_low/')
    P = tube['P']; c = (P.min(0) + P.max(0)) / 2; zr = P[:, 2].max()
    D = 2 * max(np.hypot(q['P'][:, 0] - c[0], q['P'][:, 1] - c[1]).max() for q in (tube, sleeve))
    M = S(0.042 / D) @ T(-c[0], -c[1], -zr)
    for name, g in (('ats5', tube), ('ats5Sleeve', sleeve)):
        g = place(g, M)
        bt, ot, nt, ao = textures(G, j, binb, g['mat'], [g], (512, 256, 512), 0.8)
        G.node(name, [(g, G.material(name, bt, ot, nt, ao))])
    # --- the 3-prong flash hider: long axis x in the pack; the prongs (open slots) are the front ---
    j, binb = load(SRC + 'flash_hiders_pack_1.glb')
    g = component(first_mesh(j, binb), 4652)
    P = g['P']; c = (P.min(0) + P.max(0)) / 2
    g = place(g, T(-c[0], -c[1], -c[2]))
    P = g['P']; L = P[:, 0].max() - P[:, 0].min()
    def fill(x):                                             # share of the ring that is metal at this x
        s = slice_pts(P, g['I'], 0, x); a = np.floor((np.arctan2(s[:, 2], s[:, 1]) + np.pi) / (np.pi / 18)).astype(int)
        return len(np.unique(a)) / 36
    front = 1 if fill(P[:, 0].max() - 0.15 * L) < fill(P[:, 0].min() + 0.15 * L) else -1
    g = place(g, Ry(front * np.pi / 2))                      # front end (prongs) to -z
    D = 2 * np.hypot(g['P'][:, 0], g['P'][:, 1]).max()
    g = axial(place(g, S(0.022 / D)))
    bt, ot, nt, ao = textures(G, j, binb, g['mat'], [g], (512, 256, 512), 0.8)
    G.node('fh', [(g, G.material('fh', bt, ot, nt, ao))])
    # --- the compensator (rear = the pack's +z end, like the Glock's comp) ---
    j, binb = load(SRC + 'weapon_accessories.glb')
    g = find(j, binb, 'Flashhider 2/')
    P = g['P']; c = (P.min(0) + P.max(0)) / 2
    g = axial(place(g, S(0.024 / (P[:, 0].max() - P[:, 0].min())) @ T(-c[0], -c[1], 0)))
    bt, ot, nt, ao = textures(G, j, binb, g['mat'], [g], (512, 256, 512), 0.8)
    G.node('comp', [(g, G.material('comp', bt, ot, nt, ao))])
    # --- the optics ---
    k_rail = RAIL_HALF / PACK_CHANNEL_HALF
    for node, name, k, length, size in (('dot', 'Sight 1', k_rail, None, (512, 256, 512)), ('holo', 'Sight 3', None, 0.097, (1024, 512, 1024)),
                                        ('x2', 'Scope 1', k_rail, None, (1024, 512, 1024))):
        g, k, cz = optic(j, binb, name, k, length)
        ex = {'scale': round(float(k), 6)}
        if node == 'x2':
            gl = find(j, binb, 'Scope 1/Scope 1_Material')['P']
            r = lambda s: float(np.hypot(gl[s, 0], gl[s, 1] - (gl[:, 1].min() + gl[:, 1].max()) / 2).max())
            zf, zb = gl[:, 2].min(), gl[:, 2].max(); band = 0.03 * (zb - zf)
            ex.update({'axisY': round((gl[:, 1].min() + gl[:, 1].max()) / 2 * k, 5), 'eyeZ': round((zb - cz) * k, 5), 'eyeR': round(r(gl[:, 2] > zb - band) * k, 5),
                       'objZ': round((zf - cz) * k, 5), 'objR': round(r(gl[:, 2] < zf + band) * k, 5)})
        else:
            ex.update(window(j, binb, name, g, k, cz, 0.7 if node == "holo" else 1.0))
        g = place(g, S(k) @ T(0, 0, -cz))
        bt, ot, nt, ao = textures(G, j, binb, g['mat'], [g], size, 0.75)
        G.node(node, [(g, G.material(node, bt, ot, nt, ao))])
        G.j['nodes'][-1]['extras'] = ex
        P = g['P']; print(node, 'size mm', np.round((P.max(0) - P.min(0)) * 1000, 1), ex)
    n = G.write(OUT)
    print(OUT, n // 1024, 'KB')


if __name__ == '__main__':
    main()
