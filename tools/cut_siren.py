#!/usr/bin/env python3
"""Interstate: the police siren loops (interstate/sfx/siren-wail.*, siren-yelp.*).

Source: freesound 692525, newlocknew "police car siren synthesized dry" (48 kHz stereo WAV; licence not verified,
credit it). The take alternates wail sweeps (470 -> 1370 -> 470 Hz, ~4.7 s) and yelp runs (~0.33 s sweeps).
One wail sweep and a run of whole yelp periods are cut, each between two points where the pitch track repeats,
the head cross-faded with what follows the tail (so the loop seam is the take's own continuation), level-matched,
mono, then written padded like the engine loops: PAD s of the loop's tail before it and PAD s of its head after,
so the game loops [PAD, PAD + length] and codec priming never lands in the loop.

Usage: python3 tools/cut_siren.py <siren.wav> [out_dir]   (needs numpy and ffmpeg)
Prints the loop lengths for SIREN_SFX in interstate/index.html.
"""
import sys, os, wave, subprocess, tempfile
import numpy as np

PAD = .2
SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'interstate', 'sfx')

w = wave.open(SRC); sr = w.getframerate(); n = w.getnframes()
x = np.frombuffer(w.readframes(n), dtype=np.int16).reshape(-1, w.getnchannels()).astype(np.float64).mean(1) / 32768.0


def pitch_track(sig, hop):
    """Dominant frequency (300 Hz - 3 kHz) every `hop` samples, 40 ms windows, parabolic peak."""
    win = int(sr * .04); out = []
    f = np.fft.rfftfreq(win * 4, 1 / sr); m = (f > 300) & (f < 3000); fm = f[m]
    for i in range(0, len(sig) - win, hop):
        sp = np.abs(np.fft.rfft(sig[i:i + win] * np.hanning(win), win * 4))[m]
        k = int(np.argmax(sp))
        if 0 < k < len(sp) - 1:
            a, b, c = np.log(sp[k - 1] + 1e-12), np.log(sp[k] + 1e-12), np.log(sp[k + 1] + 1e-12)
            d = .5 * (a - c) / (a - 2 * b + c); out.append(fm[k] + d * (fm[1] - fm[0]))
        else: out.append(fm[k])
    return np.array(out)


HOP = int(sr * .005)
P = pitch_track(x, HOP)
t_of = lambda i: i * HOP / sr + .02


def best_period(a0, a1, lo, hi):
    """Loop length in [lo, hi] s whose pitch track from a0 best matches itself shifted (search over the start too)."""
    best = None
    for L in np.arange(lo, hi, .0025):
        k = int(round(L * sr / HOP))
        for a in np.arange(a0, a1, .01):
            i = int(a * sr / HOP)
            seg, nxt = P[i:i + 60], P[i + k:i + k + 60]
            if len(nxt) < 60: continue
            e = np.mean(np.abs(seg - nxt))
            if best is None or e < best[0]: best = (e, a, L)
    return best


def zero_up(i):
    """Nearest upward zero crossing to sample i."""
    for d in range(0, sr // 50):
        for j in (i + d, i - d):
            if 0 < j < len(x) and x[j - 1] <= 0 < x[j]: return j
    return i


def cut(name, a0, a1, lo, hi, xf):
    e, a, L = best_period(a0, a1, lo, hi)
    s = zero_up(int(a * sr)); e_ = zero_up(int((a + L) * sr)); L = (e_ - s) / sr
    loop = x[s:e_].copy(); X = int(xf * sr)
    tail = x[e_:e_ + X]                                                  # what the take does after the loop end ...
    r = np.linspace(0, 1, X); loop[:X] = loop[:X] * np.sin(r * np.pi / 2) + tail * np.cos(r * np.pi / 2)   # ... blended into the head
    loop *= 10 ** (-16 / 20) / (np.sqrt(np.mean(loop ** 2)) + 1e-12)     # -16 dBFS RMS
    pk = np.abs(loop).max()
    if pk > .89: loop *= .89 / pk
    p = int(PAD * sr); full = np.concatenate([loop[-p:], loop, loop[:p]])
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, name + '.wav')
        with wave.open(wav, 'wb') as o:
            o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr); o.writeframes((np.clip(full, -1, 1) * 32767).astype(np.int16).tobytes())
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ar', '44100', '-c:a', 'aac', '-b:a', '64k', os.path.join(OUT, name + '.m4a')], check=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libopus', '-b:a', '48k', os.path.join(OUT, name + '.ogg')], check=True)
    print(f'{name}: start {s / sr:.4f} s, loop {L:.6f} s, pitch mismatch {e:.1f} Hz')
    return L


Lw = cut('siren-wail', 36.2, 36.8, 4.4, 4.95, .03)
Ly = cut('siren-yelp', 19.0, 19.6, 3.2, 3.8, .012)
print(f'SIREN_SFX: wail {Lw:.6f}, yelp {Ly:.6f}')
