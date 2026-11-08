#!/usr/bin/env python3
"""Painted wall scan for the apartment (CC0, Poly Haven "painted_plaster_wall", 2 x 2 m).

Downloads the 2k maps into world/.cache/scans (gitignored) and writes
world/textures/scans/paint_plaster_{diff,nor,arm}.webp (2048 px) + quest/ (1024 px):
  diff  the scan's luminance only, as a grey ratio around a linear mean of 0.85 (the paint colour is
        the material's colour; contrast x0.55 so it reads as one even coat, not a stained wall)
  nor   OpenGL normal map as scanned (roller stipple, trowel waves of the plaster under the paint)
  arm   R ambient occlusion (scan), G roughness (scan, remapped to a matte / eggshell paint, mean 0.8),
        B 0 (no metal)
Re-runnable: python3 tools/interior/build_paint.py
"""
import os, sys, urllib.request
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CACHE = os.path.join(ROOT, 'world', '.cache', 'scans')
OUT = os.path.join(ROOT, 'world', 'textures', 'scans')
A = 'painted_plaster_wall'
BASE = f'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/{A}/{A}_'
MAPS = {'diff': 'diff_2k.jpg', 'nor': 'nor_gl_2k.jpg', 'rough': 'rough_2k.jpg', 'ao': 'ao_2k.jpg'}


def fetch():
    os.makedirs(CACHE, exist_ok=True)
    got = {}
    for k, f in MAPS.items():
        p = os.path.join(CACHE, f'{A}_{f}')
        if not os.path.exists(p):
            print('download', f)
            urllib.request.urlretrieve(BASE + f, p)
        got[k] = p
    return got


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def main():
    p = fetch()
    d = srgb_to_lin(np.asarray(Image.open(p['diff']).convert('RGB'), np.float32) / 255)
    L = d @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    # remove the lowest frequencies (lighting in the photo): divide by a heavy blur
    # (periodic gaussian through the FFT, sigma 40 px = 4 cm, so the map still tiles)
    fy, fx = np.fft.fftfreq(L.shape[0])[:, None], np.fft.fftfreq(L.shape[1])[None, :]
    big = np.real(np.fft.ifft2(np.fft.fft2(L) * np.exp(-2 * (np.pi * 40) ** 2 * (fx * fx + fy * fy)))).astype(np.float32)
    r = L / np.maximum(big, 1e-4)
    r = 1 + (r / r.mean() - 1) * 0.55
    diff = lin_to_srgb(np.clip(r * 0.85, 0, 1))
    rough = np.asarray(Image.open(p['rough']).convert('L'), np.float32) / 255
    rough = 0.8 + (rough - rough.mean()) * 0.6
    ao = np.asarray(Image.open(p['ao']).convert('L'), np.float32) / 255
    ao = 1 - (1 - ao) * 0.6
    arm = np.stack([ao, np.clip(rough, 0.3, 1), np.zeros_like(ao)], -1)
    nor = Image.open(p['nor']).convert('RGB')
    os.makedirs(os.path.join(OUT, 'quest'), exist_ok=True)
    imgs = {
        'diff': Image.fromarray((np.repeat(diff[..., None], 3, -1) * 255 + 0.5).astype(np.uint8)),
        'nor': nor,
        'arm': Image.fromarray((arm * 255 + 0.5).astype(np.uint8)),
    }
    for k, im in imgs.items():
        im.resize((2048, 2048), Image.LANCZOS).save(os.path.join(OUT, f'paint_plaster_{k}.webp'), quality=86 if k != 'nor' else 92, method=6)
        im.resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, 'quest', f'paint_plaster_{k}.webp'), quality=84 if k != 'nor' else 90, method=6)
    with open(os.path.join(OUT, 'paint_plaster.json'), 'w') as f:
        f.write('{"metres": [2.0, 2.0], "px": [2048, 2048], "source": "Poly Haven painted_plaster_wall (CC0)"}')
    print('ok', {k: v.size for k, v in imgs.items()}, 'diff mean', float(diff.mean()), 'rough mean', float(rough.mean()))


if __name__ == '__main__':
    sys.exit(main())
