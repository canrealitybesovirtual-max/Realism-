# Packs the user's Beretta 92X (cqc/models/src/beretta92x.glb: Sketchfab "Beretta 92X - 9mm Pistol" by KaL-ABIZZARE,
# CC-BY-4.0; 26 meshes, 3 materials, 1024 px PNGs) into the game's GLB (CQC step 120): cqc/models/beretta92x.glb.
#
# The source is already in metres at real size (slide nose to frame tang 215 mm; a 92X is ~217 mm) with +y up and the
# muzzle toward -z, x to the gun's right (the slide stop is on -x). Baked into the game's design space (no node
# transforms left): bore axis on y = 0 (the barrel's muzzle ring), x unchanged, z shifted so the web of the grip (the
# back strap's most forward point under the tang) lands where the Glock's does (design z 0.0431: EXTG.g17's bake), so
# the Glock's hand fits start on the right spot; HAND_FIT.b92 / VMH_FIT.b92 turn them by the grip-angle difference.
#
# Parts (node names; the game's EXTG.b92.keep):
#   frame   frame, magazine well, grip screws, magazine release, trigger bar, recoil guide rod, takedown lever
#   grips   the grip panels (their own node: a paint group)
#   slide   slide, front and rear sight, the slide-mounted decocker levers (they ride the slide)
#   barrel  the threaded barrel (its 7.8 mm of thread stands out of the slide)
#   hammer, trigger, catch (slide stop): separate, they move (pivots printed below, in the game's B92 table)
#   mag     magazine body, base plate, follower (the follower at its top: an empty magazine shows it)
#   rounds  one 9x19 round in the lips, on the follower, parallel to the bore (hidden when the magazine is empty)
#   wrap    the wrap-around accessory rail: bottom Picatinny rail under the dust cover, swept arm round the slide
#           (left side), optic plate over the slide
#   dot     the red dot on the wrap's optic plate; glass = its lens (the game draws the reticle shader on it)
# Not packed: the model's compensator and weapon light (the game's own comp / cans and X300 / DBAL work with the
# muzzle chain, switch and beam code).
# Textures: re-encoded as WebP (base colour, metal-roughness, normal at 1024; the gun's emissive sight inserts lossless);
# materials opaque (the source's BLEND mode dropped).
# python3 tools/pack_beretta.py            (run from the repo root)
import os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pack_glock_att as PG

SRC = 'cqc/models/src/beretta92x.glb'
OUT = 'cqc/models/beretta92x.glb'
GLOCK_WEB_Z = 0.0431          # design z of the Glock 17's web (EXTG.g17 bake: back strap's most forward point under the tang)

GROUPS = {
    'frame': ['Frame_low_6/', 'Magwell_low_15/', 'Grip pins_low_8/', 'Mag releash_low_13/', 'Trigger rod_low_24/', 'Guide rod_low_10/', 'Slide releash_low_22/'],
    'grips': ['Grip_low_9/'],
    'slide': ['Slide_low_23/', 'Front sight_low_7/', 'Rear sight_low_17/', 'Safety_low_19/'],
    'barrel': ['Barrel_low_0/'],
    'hammer': ['Hammer_low_11/'],
    'trigger': ['Trigger_low_25/'],
    'catch': ['Slide catch_low_21/'],
    'mag': ['Magazine_low_14/', 'Mag bottom_low_12/', 'Follower_low_5/'],
    'wrap': ['Mount_low_16/'],
    'dot': ['Reddot_low_18/'],
    'glass': ['Sight glass_low_20/']
}


def merge(parts):
    out = {'P': [], 'N': [], 'UV': [], 'T': [], 'I': []}
    n = 0
    for g in parts:
        out['P'].append(g['P']); out['N'].append(g['N']); out['UV'].append(g['UV'])
        out['T'].append(g['T'] if g['T'] is not None else np.c_[np.ones((len(g['P']), 1)), np.zeros((len(g['P']), 2)), np.ones((len(g['P']), 1))])
        out['I'].append(g['I'] + n); n += len(g['P'])
    return {k: np.concatenate(v) for k, v in out.items()} | {'mat': parts[0]['mat']}


def cut_z(g, ax, v):
    """points where g's triangle edges cross the plane axis = v"""
    T = g['P'][g['I'].reshape(-1, 3)]; d = T[:, :, ax] - v; out = []
    for a, c in ((0, 1), (1, 2), (2, 0)):
        m = (d[:, a] < 0) != (d[:, c] < 0); k = d[m, a] / (d[m, a] - d[m, c])
        out.append(T[m, a] + (T[m, c] - T[m, a]) * k[:, None])
    return np.concatenate(out)


def main():
    j, binb = PG.load(SRC)
    src = {k: [PG.find(j, binb, s) for s in v] for k, v in GROUPS.items()}
    # bore: the barrel's muzzle ring
    B = src['barrel'][0]['P']; m = B[:, 2] < B[:, 2].min() + 0.004
    bore_y = (B[m, 1].min() + B[m, 1].max()) / 2
    # web: the back strap's most forward point between 6 and 3.4 cm under the bore (under the tang)
    F = src['frame'][0]
    web = min(cut_z(F, 1, y)[:, 2].max() for y in np.arange(bore_y - 0.06, bore_y - 0.034, 0.0025))
    z0 = web - GLOCK_WEB_Z
    D = PG.T(0, -bore_y, -z0)
    print('bore y %.5f  web z %.5f  ->  design = source - (0, %.5f, %.5f)' % (bore_y, web, bore_y, z0))
    parts = {k: merge([PG.place(g, D) for g in v]) for k, v in src.items()}
    # the top round: case + bullet, in the lips on the follower (centre 5 mm over the follower's top), case head 1.2 mm off
    # the back wall at that height, parallel to the bore
    rnd = merge([PG.place(PG.find(j, binb, s), np.eye(4)) for s in ['Catridge_low_2/', 'Bullet_low_1/']])
    fol = src['mag'][2]['P'] - [0, bore_y, z0]
    yc = cut_z(PG.place(src['mag'][2], D), 0, 0.0)[:, 1].max() + 0.0050
    mg = PG.place(src['mag'][0], D); back = cut_z(mg, 1, yc)
    back = back[np.abs(back[:, 0]) < 0.004][:, 2].max()
    zc = back - 0.0012 - rnd['P'][:, 2].max()
    parts['rounds'] = PG.place(rnd, PG.T(0, yc, zc))
    print('top round centre y %.4f, z %.4f..%.4f (follower top %.4f)' % (yc, parts['rounds']['P'][:, 2].min(), parts['rounds']['P'][:, 2].max(), fol[:, 1].max()))
    # pivots (design space): the hammer's round foot, the trigger's top, the slide stop's rear end
    for k in ('hammer', 'trigger', 'catch', 'wrap', 'dot', 'glass', 'mag', 'slide', 'frame', 'barrel', 'grips'):
        P = parts[k]['P']; print('%-7s min %s max %s' % (k, np.round(P.min(0), 4), np.round(P.max(0), 4)))

    G = PG.GLB(); G.j['asset']['generator'] = 'tools/pack_beretta.py'
    G.j['asset']['extras'] = {'source': 'Beretta 92X - 9mm Pistol, KaL-ABIZZARE (sketchfab.com/WPthai), CC-BY-4.0', 'bore_y': round(float(bore_y), 6), 'z0': round(float(z0), 6)}
    G.j['samplers'][0].update({'wrapS': 10497, 'wrapT': 10497})

    def mat(name, mi, emissive=False, sizes=(1024, 1024, 1024)):
        M = j['materials'][mi]; pb = M['pbrMetallicRoughness']
        b = G.tex(PG.webp(PG.image(j, binb, pb['baseColorTexture']['index']).convert('RGB'), sizes[0]))
        o = G.tex(PG.webp(PG.image(j, binb, pb['metallicRoughnessTexture']['index']).convert('RGB'), sizes[1]))
        n = G.tex(PG.webp(PG.image(j, binb, M['normalTexture']['index']).convert('RGB'), sizes[2]))
        i = G.material(name, b, o, n)
        if emissive:
            e = G.tex(PG.webp(PG.image(j, binb, M['emissiveTexture']['index']).convert('RGB'), 1024, lossless=True))
            G.j['materials'][i]['emissiveTexture'] = {'index': e}; G.j['materials'][i]['emissiveFactor'] = [1, 1, 1]
        return i
    mGun = mat('b92', 0, emissive=True)
    mAcc = mat('b92acc', 1, sizes=(1024, 512, 1024))
    mGlass = G.material('b92glass', factors={'baseColorFactor': [0.05, 0.12, 0.14, 1], 'metallicFactor': 0, 'roughnessFactor': 0.05})
    for k in ('frame', 'grips', 'slide', 'barrel', 'hammer', 'trigger', 'catch', 'mag', 'rounds'):
        G.node(k, [(parts[k], mGun)])
    G.node('wrap', [(parts['wrap'], mAcc)])
    G.node('dot', [(parts['dot'], mAcc)])
    G.node('glass', [(parts['glass'], mGlass)])
    n = G.write(OUT)
    print(OUT, n // 1024, 'KB')


if __name__ == '__main__':
    main()
