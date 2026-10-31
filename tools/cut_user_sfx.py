#!/usr/bin/env python3
"""CQC step 99: cut the user's gun handling / purchase recordings (cqc/sounds/src/) into short game sounds.

Also cuts the pick-up takes (pickup1-9) and the coat strides (cloth1-7) added later in step 99, and
(step 101) the second batch: two Glock 17 reloads (glk*), pistol dry fire clicks and trigger reset ticks
(dry*, dryReset*), an M4 magazine dropped on a table (magDrop*), button clicks (btn*) and the server room
bed (ambServer: one seamless loop, see LOOPS).

Step 115: the grenade takes. From ryanconway's "grenade throw": the pin ring pulled (nadePin1 / 2), the spoon
flying with the striker snap (nadeSpoon), that snap alone (nadeTick: the steel of a landing grenade, pitched down in
the game), the arm's swing (nadeThrow, see DERIVED), and its explosion (nadeBoom2); knova's "grenade" (nadeBoom1).

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
RMSN = {'coat': -19.0, 'pick': -17.0, 'throw': -18.0}   # these groups: each take on its own, loudest 50 ms at this dBFS (capped at PEAK):
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
GLK1 = 'glock17_reload_121766.wav'      # kno-sfx: Glock 17 reload (mag out, in, slide release, rack)
GLK2 = 'glock17_reload2_121765.wav'     # kno-sfx: Glock 17 reload 2 (mag out, in, a palm tap, rack)
DRY = 'pistol_dry_fire_486226.wav'      # ruben_uitenweerde: pistols dry-fired (clicks, trigger / slide resets)
MDROP = 'm4_mag_table_drop_174058.mp3'  # pjkasinski3: M4 magazine dropped on a table (hit + bounces)
BTN = 'button_click_395541.wav'         # alayan: one button press and its release
SRV = 'amb_server_room_712564.wav'      # newlocknew: server room / data centre machine and vent noise (wide)
NTH = 'grenade_throw_161622.wav'        # ryanconway: grenade throw (pin, spoon, the swing; an explosion spliced in at 1.79 s)
NBM = 'grenade_172334.wav'              # knova: grenade (one explosion, bassy: 87 % of it under 150 Hz, little over 1 kHz)

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
    # The same two, shorter, for pistols (step 101: no longer loaded; the Glock takes replaced them).
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
    # --- step 101 ---
    # Glock 17, two reloads. Magazine out = the release press and the slide out of the well (a bright rattle,
    # centroid 6-6.5 kHz). In = the last of the push (40-75 ms lead) and the catch (the click at 3.296 / 2.29 s).
    # glkMagTap = the palm tap on the baseplate (low onset, 2.98 s). Slide release = the single slam with a
    # 1.3 kHz ring (3.49 s). Rack = two lumps: back (rear stop), then forward 0.2 s later (the louder slam).
    ('glkMagOut1', GLK1, 0.655, 0.920, 'glk'), ('glkMagOut2', GLK2, 0.175, 0.450, 'glk'),
    ('glkMagIn1', GLK1, 3.255, 3.470, 'glk'), ('glkMagIn2', GLK2, 2.255, 2.490, 'glk'),
    ('glkMagTap', GLK2, 2.965, 3.200, 'glk'), ('glkSlideRel', GLK1, 3.485, 3.850, 'glk'),
    ('glkRackBack1', GLK1, 4.895, 5.125, 'glk'), ('glkRackFwd1', GLK1, 5.130, 5.450, 'glk'),
    ('glkRackBack2', GLK2, 4.525, 4.700, 'glk'), ('glkRackFwd2', GLK2, 4.700, 4.980, 'glk'),
    # Dry fire: eight striker / hammer falls across the take (several pistols, centroids 8.5-10.5 kHz), room tail
    # cut 45 dB down; the faint take-up tick before some is kept. Reset ticks = the small events 0.3-0.9 s after
    # a click (25 dB under it): trigger / slide reset.
    ('dry1', DRY, 0.630, 0.930, 'dry', -45), ('dry2', DRY, 2.445, 2.740, 'dry', -45),
    ('dry3', DRY, 6.270, 6.560, 'dry', -45), ('dry4', DRY, 7.665, 7.980, 'dry', -45),
    ('dry5', DRY, 10.830, 11.140, 'dry', -45), ('dry6', DRY, 13.995, 14.230, 'dry', -45),
    ('dry7', DRY, 22.150, 22.440, 'dry', -45), ('dry8', DRY, 35.380, 35.660, 'dry', -45),
    ('dryReset1', DRY, 8.570, 8.740, 'dry', -40), ('dryReset2', DRY, 19.800, 19.980, 'dry', -40),
    ('dryReset3', DRY, 23.010, 23.180, 'dry', -40), ('dryReset4', DRY, 27.690, 27.840, 'dry', -40),
    # M4 magazine on a table: the first hit with its bounces; the first hit and one bounce (lands flatter); the
    # double hit at 0.43 / 0.455 s on (the table rings under it).
    ('magDrop1', MDROP, 0.000, 0.620, 'mdrop', -45), ('magDrop2', MDROP, 0.000, 0.330, 'mdrop', -45),
    ('magDrop3', MDROP, 0.420, 0.980, 'mdrop', -45),
    # Button: the press (two contacts, then the click 0.13 s) and the release (0.31 s); the electronic hum after
    # 0.4 s left out. btnClick3 / 4 = the main click of each alone.
    ('btnClick1', BTN, 0.085, 0.255, 'btn', -40), ('btnClick2', BTN, 0.258, 0.420, 'btn', -40),
    ('btnClick3', BTN, 0.124, 0.250, 'btn', -40), ('btnClick4', BTN, 0.302, 0.420, 'btn', -40),
    # --- step 115 ---
    # Grenade arming, all over 2.5 kHz (centroid ~8 kHz): the ring pulled = five clicks 28-74 ms (pin1 all of them, pin2
    # from the loudest at 42 ms); the spoon = the striker snap at 148 ms with its ring, and the lever landing at 226 ms;
    # nadeTick = that snap alone (26 ms).
    ('nadePin1', NTH, 0.024, 0.100, 'narm', -45), ('nadePin2', NTH, 0.039, 0.100, 'narm', -45),
    ('nadeSpoon', NTH, 0.144, 0.250, 'narm', -45), ('nadeTick', NTH, 0.145, 0.172, 'narm', -40),
    # The explosions: knova's from its onset (4 ms); the throw take's from 1.791 s (digital silence before the splice,
    # clipped flat at -0.2 dBFS, 150-400 Hz body, a 2.6 s roll). Normalised together (both are clipped at full scale).
    ('nadeBoom1', NBM, 0.002, 1.880, 'boom', -50), ('nadeBoom2', NTH, 1.788, 4.450, 'boom', -50),
]
# The swing: the take is only the wind of the arm on the microphone (81 % under 60 Hz, nothing over 1 kHz), which small
# speakers drop. nadeThrow keeps it (highpassed at 28 Hz) and adds a whoosh it shapes: seeded noise in two bands
# (bright while the arm comes through, darker as it goes), on the take's own 10 ms envelope.
DERIVED = [
    ('nadeThrow', NTH, 0.462, 0.950, 'throw'),
]
# name, source, a, b, crossfade s, pad s, RMS dBFS. A seamless loop: [a, b] with its last xf s faded (equal power,
# uncorrelated noise) into its first, then padded both sides with its own wrap (pad s) so the game can loop from
# pad to pad + period: an MP3 decoder's start delay (< 30 ms) only shifts the loop inside periodic material.
LOOPS = [
    ('ambServer', SRV, 0.300, 17.900, 1.500, 0.300, -20.0),
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


def make_loop(x, a, b, xf, pad):
    s = x[int(a * SR):int(b * SR)].copy()
    s -= s.mean()
    nx = int(xf * SR)
    n = len(s) - nx                                 # the period
    t = np.linspace(0, 1, nx)
    L = s[:n].copy()
    L[:nx] = s[:nx] * np.sin(0.5 * np.pi * t) + s[n:n + nx] * np.cos(0.5 * np.pi * t)
    npd = int(pad * SR)
    return np.concatenate([L[-npd:], L, L[:npd]]), n


def band(n, lo, hi, rng):
    # seeded noise with a soft band (raised-cosine skirts an octave wide in log frequency)
    f = np.fft.rfftfreq(n, 1 / SR)
    lf = np.log2(np.maximum(f, 1.0))
    m = np.clip(np.minimum(lf - np.log2(lo) + 1, np.log2(hi) - lf + 1), 0, 1)
    X = np.fft.rfft(rng.standard_normal(n)) * (0.5 - 0.5 * np.cos(np.pi * m))
    y = np.fft.irfft(X, n)
    return y / (np.sqrt((y ** 2).mean()) + 1e-12)


def make_whoosh(x, a, b):
    s = cut(x, a, b, -50)
    n = len(s)
    f = np.fft.rfftfreq(n, 1 / SR)
    s = np.fft.irfft(np.fft.rfft(s) * np.clip((f - 20) / 16, 0, 1), n)       # under 28 Hz: rumble nothing plays
    w = int(0.01 * SR)
    k = n // w
    env = np.sqrt((s[:k * w].reshape(k, w) ** 2).mean(axis=1))
    env = np.interp(np.arange(n), np.arange(k) * w + w / 2, env)
    env = np.convolve(env, np.ones(w) / w, 'same')
    env /= env.max()
    rng = np.random.default_rng(161622)
    pk = np.argmax(env) / n                                                  # the arm passing the microphone
    t = np.arange(n) / n
    bright = np.clip(1 - (t - pk) / max(1e-3, 1 - pk), 0, 1) ** 1.5           # bright coming through, darker after
    wh = (bright * band(n, 700, 3200, rng) + (1 - bright) * band(n, 250, 1100, rng)) * env ** 1.3
    wh *= 0.7 * np.sqrt((s ** 2).mean()) / (np.sqrt((wh ** 2).mean()) + 1e-12)
    return s + wh


def main():
    srcs, cuts = {}, {}
    for name, src, a, b, xf, pad, rms in LOOPS:
        if src not in srcs:
            srcs[src] = load(src)
        s, n = make_loop(srcs[src], a, b, xf, pad)
        g = 10 ** (rms / 20) / np.sqrt((s ** 2).mean())
        s = s * g
        write(name, s)
        print('%-12s loop %.6f s from %.3f s (pad), peak %6.1f dBFS, RMS %.1f dBFS' % (name, n / SR, pad, 20 * np.log10(np.abs(s).max()), rms))
    for name, src, a, b, grp, *opt in EVENTS:
        if src not in srcs:
            srcs[src] = load(src)
        cuts[name] = (cut(srcs[src], a, b, *opt), grp)
    for name, src, a, b, grp in DERIVED:
        if src not in srcs:
            srcs[src] = load(src)
        cuts[name] = (make_whoosh(srcs[src], a, b), grp)
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
