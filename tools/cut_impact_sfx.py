#!/usr/bin/env python3
"""CQC: bullet impact sounds from real recordings (cqc/sounds/src/impact/, licences in cqc/sounds/src/LICENSES.md).

Run from the repository root:  python3 tools/cut_impact_sfx.py
Needs ffmpeg and numpy (helpers from tools/cut_user_sfx.py). Writes cqc/sounds/imp<Kind><n>.mp3 (mono, 44.1 kHz, 128 kbit/s).

Every take is built from recordings only (no synthesis): a main hit, optionally layered with a second real hit
(a sharper transient, a heavier body) and a real debris tail (gravel / grit falling), each cut, filtered (FFT,
soft skirts), resampled for pitch, delayed and mixed. Then each take on its own: loudest 50 ms at RMS dBFS
(capped at PEAK), so random variants of one surface sound equally loud; the game scales the surfaces.

Surfaces (the game's impact kinds):
  concrete  impCon1-5   dslrguide / InMotionAudio concrete and brick hits (CC0), + lolamadeus gravel falling as grit
  plaster   impPla1-5   duller: worthahep88 rock-in-dirt hits, modusmogulus bullet into ground, a concrete hit low-passed,
                        + fine gravel trickle high-passed (gypsum crumbling)
  metal     impMet1-6   martian "Foley bullet hit metal" (CC0) takes; impMet6 = craigsmith steel target (CC0)
  wood      impWod1-5   110110010 / jackyyang09 wood hits (CC0), Kenney wood / plank hits (CC0) with a wood bite on top,
                        the user's M4 magazine-on-a-table hit (the table's knock)
  glass     impGla1-4   Kenney glass hits (the crack) + a breaking-glass take (CC0, the shards)
  water     impWat1-4   wading splashes (CC0 takes) with a small concrete tick in front (the round reaching the floor)
  card      impCrd1-4   a canvas case dropped (thump) + a paper ball (crisp skin), Kenney light impacts (CC0)
  flesh     impFle1-5   u1769092 "VisceralBulletImpacts" (CC0) takes
  debris    impDeb1-4   gravel falls (CC0), high-passed: bits landing after a round goes through (exit crumble)
"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cut_user_sfx as U

SR = U.SR
PEAK = -3.0
RMS = {'con': -13.0, 'pla': -14.0, 'met': -14.0, 'wod': -13.0, 'gla': -15.0, 'wat': -15.0, 'crd': -14.0, 'fle': -13.0, 'deb': -18.0}

N, W, K, O, UU = 'impact/ntm/', 'impact/wd/', 'impact/kenney/', 'impact/oculus/', ''
MDROP = 'm4_mag_table_drop_174058.mp3'   # the user's upload (pjkasinski3)

_cache = {}


def src(name):
    if name not in _cache:
        _cache[name] = U.load(name)
    return _cache[name]


def take(name, a=0.0, b=None, rate=1.0, lp=0, hp=0, floor=-55, fin=0.001):
    x = src(name)
    b = len(x) / SR if b is None else b
    s = U.cut(x, a, b, floor, fin)
    if rate != 1.0:                                   # resample: rate > 1 = higher and shorter
        n = int(len(s) / rate)
        s = np.interp(np.arange(n) * rate, np.arange(len(s)), s)
    if lp or hp:
        n = len(s)
        f = np.fft.rfftfreq(n, 1 / SR)
        m = np.ones_like(f)
        if lp:
            m *= 1 / np.sqrt(1 + (f / lp) ** 4)       # 2nd-order-like skirts
        if hp:
            m *= 1 / np.sqrt(1 + (hp / np.maximum(f, 1)) ** 4)
        s = np.fft.irfft(np.fft.rfft(s) * m, n)
    return s / (np.abs(s).max() + 1e-12)


def mix(*parts):
    """parts: (signal, delay s, gain dB)"""
    n = max(int(d * SR) + len(s) for s, d, g in parts)
    y = np.zeros(n)
    for s, d, g in parts:
        i = int(d * SR)
        y[i:i + len(s)] += s * 10 ** (g / 20)
    fo = min(int(0.03 * SR), len(y) // 4)
    y[-fo:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fo))
    return y


def grit(i, g=-14, d=0.018, hp=900):
    """a real gravel fall as grit after a hit (four takes)"""
    t = [(N + 'gravel3.ogg', 0, 0.26), (N + 'gravel4.ogg', 0, 0.22), (N + 'gravel5.ogg', 0, 0.35), (N + 'gravel2.ogg', 0.25, 0.62)][i % 4]
    return (take(t[0], t[1], t[2], hp=hp, floor=-40), d, g)


def build():
    T = {}
    # concrete: the hit as recorded (bright, short), grit behind it
    T['impCon1'] = ('con', mix((take(N + 'concrete1.ogg'), 0, 0), grit(0, -16)))
    T['impCon2'] = ('con', mix((take(N + 'concrete2.ogg'), 0, 0), grit(1, -15, 0.012)))
    T['impCon3'] = ('con', mix((take(N + 'concrete3.ogg', hp=180), 0, 0), (take(N + 'concrete2.ogg', 0, 0.05, hp=2500), 0, -10), grit(2, -17)))
    T['impCon4'] = ('con', mix((take(N + 'concrete4.ogg'), 0, 0), grit(3, -16, 0.022)))
    T['impCon5'] = ('con', mix((take(N + 'stone1.ogg'), 0, 0), (take(N + 'concrete3.ogg', rate=1.12, lp=2500), 0, -9), grit(0, -18, 0.03)))
    # plaster / drywall: duller, more crumble
    T['impPla1'] = ('pla', mix((take(N + 'dirt1.ogg', lp=2200), 0, 0), (take(N + 'concrete3.ogg', lp=2000), 0.002, -6), grit(2, -19, 0.04, 1800)))
    T['impPla2'] = ('pla', mix((take(N + 'dirt2.ogg', hp=120), 0, 0), grit(3, -15, 0.05, 1800)))
    T['impPla3'] = ('pla', mix((take(N + 'dirt3.ogg', 0, 0.36, lp=5000), 0, 0), grit(0, -17, 0.06, 2000)))
    T['impPla4'] = ('pla', mix((take(N + 'concrete3.ogg', rate=0.88, lp=2800), 0, 0), (take(N + 'dirt1.ogg', lp=3000), 0.004, -7), grit(1, -14, 0.035, 1800)))
    T['impPla5'] = ('pla', mix((take(N + 'stone1.ogg', rate=0.82, lp=3000), 0, 0), grit(2, -13, 0.03, 1600)))
    # metal
    for i in range(1, 6):
        T['impMet%d' % i] = ('met', mix((take(N + 'metal%d.ogg' % i), 0, 0)))
    T['impMet6'] = ('met', mix((take(N + 'steel1.ogg', 0, 0.5), 0, 0)))
    # wood
    T['impWod1'] = ('wod', mix((take(N + 'wood4.ogg'), 0, 0)))
    T['impWod2'] = ('wod', mix((take(N + 'wood5.ogg'), 0, 0), (take(N + 'wood4.ogg', 0, 0.05, hp=2500), 0, -12)))
    T['impWod3'] = ('wod', mix((take(K + 'impact_wood_medium_002.ogg', hp=90), 0, 0), (take(N + 'wood5.ogg', hp=1500), 0, -4)))
    T['impWod4'] = ('wod', mix((take(K + 'impact_plank_medium_000.ogg', 0, 0.25, hp=90), 0, 0), (take(N + 'wood4.ogg', hp=1500), 0, -5)))
    T['impWod5'] = ('wod', mix((take(UU + MDROP, 0, 0.14, lp=6000, floor=-45), 0, 0), (take(K + 'impact_wood_light_002.ogg', hp=120), 0, -4)))
    # glass: the crack, then shards
    G = W + 'imp_glass.ogg'
    T['impGla1'] = ('gla', mix((take(K + 'impact_glass_light_000.ogg'), 0, 0), (take(G, 0.0, 0.55, hp=1500), 0.006, -6)))
    T['impGla2'] = ('gla', mix((take(K + 'impact_glass_light_002.ogg'), 0, 0), (take(G, 1.258, 1.80, hp=1500), 0.008, -7)))
    T['impGla3'] = ('gla', mix((take(K + 'impact_glass_light_004.ogg'), 0, 0), (take(G, 3.218, 3.82, hp=1500), 0.005, -6)))
    T['impGla4'] = ('gla', mix((take(K + 'impact_glass_medium_001.ogg', 0, 0.3), 0, -2), (take(G, 0.0, 0.45, rate=1.08, hp=1800), 0.004, -5)))
    # water: a small hard tick (the round reaching the floor under the puddle), the slap and its drops
    F = W + 'fs_water.ogg'
    tick = take(N + 'concrete2.ogg', 0, 0.04, hp=3000)
    T['impWat1'] = ('wat', mix((tick, 0, -12), (take(F, 5.99, 6.21), 0.002, 0)))
    T['impWat2'] = ('wat', mix((tick, 0, -13), (take(F, 6.27, 6.48), 0.002, 0)))
    T['impWat3'] = ('wat', mix((tick, 0, -12), (take(F, 4.36, 4.78), 0.002, 0)))
    T['impWat4'] = ('wat', mix((tick, 0, -14), (take(F, 4.89, 5.36, rate=1.15), 0.002, 0)))
    # cardboard: a thump and a crisp papery skin
    C, P = O + 'OBJBag_CanvasCaseDrop_OS_01.ogg', O + 'PAPRImpt_PaperBallDrop_OS_01.ogg'
    T['impCrd1'] = ('crd', mix((take(C, 0, 0.22, hp=150), 0, 0), (take(P, 0, 0.06), 0, -8)))
    T['impCrd2'] = ('crd', mix((take(C, 0.245, 0.45, hp=150), 0, 0), (take(P, 0.29, 0.37), 0.004, -6)))
    T['impCrd3'] = ('crd', mix((take(K + 'impact_generic_light_000.ogg', hp=150), 0, 0), (take(P, 0, 0.06), 0, -4)))
    T['impCrd4'] = ('crd', mix((take(K + 'impact_generic_light_002.ogg', hp=150), 0, 0), (take(P, 0.23, 0.27), 0, -4)))
    # flesh: the takes as recorded
    H = W + 'hit_bullet.ogg'
    for i, (a, b) in enumerate([(0, 0.149), (0.21, 0.354), (0.415, 0.635), (0.695, 0.885), (0.945, 1.244)]):
        T['impFle%d' % (i + 1)] = ('fle', mix((take(H, a, b, hp=60), 0, 0)))
    # debris: bits landing (pen exits)
    for i in range(4):
        s, d, g = grit(i, 0, 0, 1200)
        T['impDeb%d' % (i + 1)] = ('deb', mix((s, 0, 0)))
    return T


def main():
    for name, (grp, s) in build().items():
        s = s - s.mean()
        fi = int(0.001 * SR); s[:fi] *= np.linspace(0, 1, fi)
        w = int(0.05 * SR); n = max(1, len(s) // w)
        r = np.sqrt((s[:n * w].reshape(n, w) ** 2).mean(axis=1)).max() if len(s) >= w else np.sqrt((s ** 2).mean())
        g = min(10 ** (RMS[grp] / 20) / (r + 1e-12), 10 ** (PEAK / 20) / (np.abs(s).max() + 1e-12))
        s = s * g
        U.write(name, s)
        print('%-8s %4.0f ms  peak %6.1f dBFS' % (name, len(s) / SR * 1000, 20 * np.log10(np.abs(s).max())))


if __name__ == '__main__':
    sys.exit(main())
