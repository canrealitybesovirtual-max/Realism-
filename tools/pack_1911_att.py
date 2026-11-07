# Packs the M1911 attachment models (CQC step 108) from the user's packs in cqc/models/src/ into one small GLB:
#   can45    .45 ACP pistol suppressor (weapon_accessories.glb "Silencer 1"), 36 mm x 155 mm, bore opened to 12.8 mm
#            (a 9 mm can's bore would put a .45 bullet into the baffles); flat dark earth cerakote, the rear thread collar
#            in black nitride
#   comp45   .45 ACP slotted compensator (weapon_accessories.glb "Compensator 4"), 24 mm x 50 mm (length pressed to 0.55:
#            a pistol comp, not the rifle part), 12 mm bore, black nitride
# The red dot, its cover and the 9 mm cans stay in models/att/g17-att.glb (step 100): the 1911 reuses them.
# Every part: metres, origin = the middle of its rear face (it seats on the barrel's shoulder), body toward -z.
# Helpers (GLB reader / writer, re-finish, WebP) come from tools/pack_glock_att.py.
# python3 tools/pack_1911_att.py            (run from the repo root; writes cqc/models/att/m1911-att.glb)
import os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pack_glock_att as PG

SRC = 'cqc/models/src/'
OUT = 'cqc/models/att/m1911-att.glb'
BORE45 = 0.0064                                            # m: bore radius at a can's / comp's front (.45 = 11.5 mm, 0.65 mm clearance)


def refinish_fde(im, collar_mask=None):
    """flat dark earth cerakote: the source's luminance kept as wear (sRGB ~0.42..0.58 x the FDE tint)"""
    a = np.asarray(im.convert('RGB')).astype(np.float64) / 255
    L = a @ np.array([0.2126, 0.7152, 0.0722])
    k = 0.78 + 0.45 * (L - L.mean())
    out = np.array([0.56, 0.47, 0.35])[None, None, :] * np.clip(k, 0.55, 1.15)[..., None]
    if collar_mask is not None:                            # the brass thread collar: black nitride like the comp
        dark = (0.11 + 0.2 * L)[..., None] * np.array([0.98, 0.99, 1.02])
        out = np.where(collar_mask[..., None], dark, out)
    return Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8))


def open_bore(g, r_new, front_len):
    """push the front cap's bore ring out to r_new (vertices within front_len of the front, inside 1.6 x r_new)"""
    P = g['P'].copy(); zf = P[:, 2].min(); r = np.hypot(P[:, 0], P[:, 1])
    cap = (P[:, 2] < zf + front_len) & (r < 1.6 * r_new)
    if not cap.any(): return g, 0.0
    rh = r[cap].min(); R1 = 1.6 * r_new
    rr = r[cap]; k = np.where(rr < R1, r_new + (rr - rh) * (R1 - r_new) / max(1e-9, R1 - rh), rr) / np.maximum(rr, 1e-9)
    P[cap, 0] *= k; P[cap, 1] *= k
    g = dict(g); g['P'] = P
    return g, rh


def main():
    G = PG.GLB()
    G.j['asset']['generator'] = 'tools/pack_1911_att.py'
    j, binb = PG.load(SRC + 'weapon_accessories.glb')
    # --- the .45 can (rear = the source's +z end, where its thread collar is) ---
    g = PG.find(j, binb, 'Silencer 1/')
    P = g['P']; ctr = (P.min(0) + P.max(0)) / 2; zr = P[:, 2].max()
    k = 0.036 / (P[:, 0].max() - P[:, 0].min())
    g = PG.place(g, PG.S(k) @ PG.T(-ctr[0], -ctr[1], -zr))
    g, rh = open_bore(g, BORE45, 0.004)
    pb = g['mat']['pbrMetallicRoughness']
    ims = [PG.image(j, binb, pb['baseColorTexture']['index']), PG.image(j, binb, pb['metallicRoughnessTexture']['index']), PG.image(j, binb, g['mat']['normalTexture']['index'])]
    ims = PG.crop_uv([g], ims)
    a = np.asarray(ims[0].convert('RGB')).astype(np.float64) / 255
    collar = (a[..., 0] - a[..., 2] > 0.12) & (a[..., 0] > 0.3)          # the brass collar in the source texture
    has_ao = 'occlusionTexture' in g['mat']
    bt = G.tex(PG.webp(refinish_fde(ims[0], collar), 512)); ot = G.tex(PG.webp(PG.refinish_orm(ims[1], 0.75, has_ao), 256)); nt = G.tex(PG.webp(ims[2].convert('RGB'), 512))
    G.node('can45', [(g, G.material('can45', bt, ot, nt, has_ao))])
    L = -g['P'][:, 2].min()
    print('can45 %.1f x %.1f mm, bore %.2f -> %.2f mm' % (0.036e3, L * 1e3, 2 * rh * 1e3, 2 * BORE45 * 1e3))
    # --- the .45 compensator (rear = the source's +z end, the collar) ---
    g = PG.find(j, binb, 'Compensator 4/')
    P = g['P']; ctr = (P.min(0) + P.max(0)) / 2; zr = P[:, 2].max()
    k = 0.024 / (P[:, 0].max() - P[:, 0].min()); kz = k * 0.55
    g = PG.place(g, PG.S(k, k, kz) @ PG.T(-ctr[0], -ctr[1], -zr))
    rb = np.hypot(g['P'][:, 0], g['P'][:, 1]).min()
    bt, ot, nt, ao = PG.textures(G, j, binb, g['mat'], [g], (512, 256, 512), 0.8)
    G.node('comp45', [(g, G.material('comp45', bt, ot, nt, ao))])
    print('comp45 24 x %.1f mm, bore %.2f mm' % (-g['P'][:, 2].min() * 1e3, 2 * rb * 1e3))
    n = G.write(OUT)
    print(OUT, n // 1024, 'KB')


if __name__ == '__main__':
    main()
