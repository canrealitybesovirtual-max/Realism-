#!/usr/bin/env python3
"""CQC step 99: cut the user's gun handling / purchase recordings (cqc/sounds/src/) into short game sounds.

Also cuts the pick-up takes (pickup1-9) and the coat strides (cloth1-7) added later in step 99.

Run from the repository root:  python3 tools/cut_user_sfx.py
Needs ffmpeg and numpy. Writes cqc/sounds/<name>.mp3 (mono, 44.1 kHz, 128 kbit/s).

Each event is cut [a, b] seconds from its source, the tail trimmed where it falls 55 dB under the
event's peak, short fades added (in 2 ms, out up to 40 ms), and normalised per GROUP: every event of a
group shares one gain, so the loudest peak in the group lands at PEAK dBFS and their relative levels
(a rack's soft back stop vs the slam home) stay as recorded. Labels came from the envelope and spectrum
(onsets, peaks, decay), not by ear: see CLAUDE.md "CQC step 99".
"""
import os, subprocess, sys, tempfile
import numpy as np

SR = 44100
PEAK = -3.5            # dBFS of the loudest event in each group (the other sounds/*.mp3 peak at -2..0; clipped takes ring
                       # ~2-3 dB over their source peak once encoded, so this leaves room)
RMSN = {'coat': -19.0, 'pick': -17.0}   # these groups: each take on its own, loudest 50 ms at this dBFS (capped at PEAK):
                                        # random variants of one rustle / grab should sound equally loud
FLOOR = -55.0          # tail trimmed below this, dB under the event's own peak
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cqc', 'sounds')
SRC = os.path.join(ROOT, 'src')

AKC = 'ak_cocked3x_675008.wav'          # serutonin-deprivd: an AK cocked 3 times
AKH = 'ak_chambering_142892.aiff'       # ceremonialchapstick: AK handled
UZI = 'uzi_reload_empty_677160.wav'     # serutonin-deprivd: Uzi empty reload
SUP = 'pistol_suppressed_855656.wav'    # serutonin-deprivd: suppressed handgun, one shot
BUY = 'cash_register_184438.wav'        # capslok: cash register
PICK = 'pickup_762911.wav'              # ienba: game pick-up (9 takes of a hand taking something; noisy, not a tonal blip)
COAT = 'coat_sprint_369604.wav'         # evanboyerman: heavy coat sprinting foley (one rustle lump per stride)

# name, source, a, b, group[, floor dB under the peak, fade-in s]
EVENTS = [
    # AK charging handle, cocked 3x: back = the end of the pull and the rear stop (the stop ~70 ms in),
    # forward = the carrier slamming home (the loudest thing in the file).
    ('akRackBack1', AKC, 0.190, 0.470, 'akc'), ('akRackFwd1', AKC, 0.485, 0.900, 'akc'),
    ('akRackBack2', AKC, 2.280, 2.500, 'akc'), ('akRackFwd2', AKC, 2.535, 2.990, 'akc'),
    ('akRackBack3', AKC, 4.460, 4.690, 'akc'), ('akRackFwd3', AKC, 4.705, 5.150, 'akc'),
    # AK handled: two rattly rock-outs with a low thump onset (magazine out), one long rattle (a third
    # out), a tick then a snap 140 ms later (front lug hooked, rocked back until the catch snaps: in),
    # and a rattly pull + a single slam 0.6 s later (one more rack back / forward).
    ('akMagOut1', AKH, 4.570, 5.000, 'akh'), ('akMagOut2', AKH, 6.335, 6.720, 'akh'),
    ('akMagOut3', AKH, 2.225, 2.800, 'akh'), ('akMagIn1', AKH, 8.630, 9.100, 'akh'),
    ('akRackBack4', AKH, 9.815, 10.360, 'akh'), ('akRackFwd4', AKH, 10.400, 10.950, 'akh'),
    # Uzi empty reload: magazine out (button, drop), in (last of the push, the catch, the palm slap),
    # cocking knob back to the stop, knob forward.
    ('smgMagOut', UZI, 0.000, 0.560, 'uzi'), ('smgMagIn', UZI, 1.835, 2.330, 'uzi'),
    ('smgBoltBack', UZI, 3.040, 3.340, 'uzi'), ('smgBoltFwd', UZI, 3.380, 3.900, 'uzi'),
    # The same two, shorter, for pistols (played ~1.15x): the drop / the catch and the first of the slap.
    ('pstMagOut', UZI, 0.060, 0.260, 'uzi'), ('pstMagIn', UZI, 1.860, 2.110, 'uzi'),
    ('supPistol1', SUP, 0.000, 0.600, 'sup'),
    ('buy', BUY, 0.040, 1.700, 'buy'),
    # Pick-up: the nine takes, the room tail cut 45 dB down.
    ('pickup1', PICK, 0.150, 0.900, 'pick', -45), ('pickup2', PICK, 1.950, 2.700, 'pick', -45),
    ('pickup3', PICK, 3.750, 4.700, 'pick', -45), ('pickup4', PICK, 6.550, 7.300, 'pick', -45),
    ('pickup5', PICK, 9.050, 9.800, 'pick', -45), ('pickup6', PICK, 11.150, 11.800, 'pick', -45),
    ('pickup7', PICK, 12.550, 13.200, 'pick', -45), ('pickup8', PICK, 14.300, 14.900, 'pick', -45),
    ('pickup9', PICK, 16.150, 16.760, 'pick', -45),
    # Coat: one stride each (the lump of cloth and the kit tick in it), the closing thump at 2.34 s left out.
    ('cloth1', COAT, 0.030, 0.330, 'coat', -60, 0.012), ('cloth2', COAT, 0.450, 0.720, 'coat', -60, 0.012),
    ('cloth3', COAT, 0.710, 1.000, 'coat', -60, 0.012), ('cloth4', COAT, 1.010, 1.300, 'coat', -60, 0.012),
    ('cloth5', COAT, 1.300, 1.620, 'coat', -60, 0.012), ('cloth6', COAT, 1.630, 1.950, 'coat', -60, 0.012),
    ('cloth7', COAT, 1.960, 2.320, 'coat', -60, 0.012),
]


def load(name):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(SRC, name), '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    ch = int(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels',
                             '-of', 'csv=p=0', os.path.join(SRC, name)], capture_output=True, text=True, check=True).stdout.strip())
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    return x.reshape(-1, ch).mean(axis=1)          # average the channels (no summing over full scale)


def cut(x, a, b, floor=FLOOR, fin=0.002):
    s = x[int(a * SR):int(b * SR)].copy()
    s -= s.mean()                                   # no DC step at the fades
    w = int(0.005 * SR)
    n = len(s) // w
    env = 20 * np.log10(np.sqrt((s[:n * w].reshape(n, w) ** 2).mean(axis=1)) + 1e-12)
    keep = np.nonzero(env > env.max() + floor)[0]
    end = min(len(s), (keep[-1] + 2) * w) if len(keep) else len(s)
    s = s[:end]
    fi, fo = int(fin * SR), min(int(0.04 * SR), len(s) // 4)
    s[:fi] *= np.linspace(0, 1, fi)
    s[-fo:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fo))
    return s


def write(name, s):
    out = os.path.join(ROOT, name + '.mp3')
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
        tmp = t.name
    try:
        pcm = (np.clip(s, -1, 1) * 32767).astype('<i2').tobytes()
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-', tmp],
                       input=pcm, check=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame',
                        '-b:a', '128k', '-map_metadata', '-1', out], check=True)
    finally:
        os.unlink(tmp)
    return out


def main():
    srcs, cuts = {}, {}
    for name, src, a, b, grp, *opt in EVENTS:
        if src not in srcs:
            srcs[src] = load(src)
        cuts[name] = (cut(srcs[src], a, b, *opt), grp)
    gpk = {}
    for s, grp in cuts.values():
        gpk[grp] = max(gpk.get(grp, 0), np.abs(s).max())
    for name, (s, grp) in cuts.items():
        g = 10 ** (PEAK / 20) / gpk[grp]
        if grp in RMSN:
            w = int(0.05 * SR); n = max(1, len(s) // w)
            r = np.sqrt((s[:n * w].reshape(n, w) ** 2).mean(axis=1)).max()
            g = min(10 ** (RMSN[grp] / 20) / r, 10 ** (PEAK / 20) / np.abs(s).max())
        s = s * g
        write(name, s)
        print('%-12s %5.0f ms  peak %6.1f dBFS  gain %+5.1f dB' % (name, len(s) / SR * 1000, 20 * np.log10(np.abs(s).max()), 20 * np.log10(g)))


if __name__ == '__main__':
    sys.exit(main())
