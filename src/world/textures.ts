import * as THREE from 'three';
import { makeRng } from '../utils/MathUtils';

interface NoiseOpts {
  size?: number;
  base: string;
  variance?: number;
  blotches?: number;
  blotchColor?: string;
  speckles?: number;
  speckleColors?: string[];
  cracks?: number;
  crackColor?: string;
  planks?: number;
  repeat?: [number, number];
  seed?: number;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Canvas texture: fine grain + large stains + speckles + cracks (+ plank seams). Generated once. */
function makeNoiseTexture(opts: NoiseOpts): THREE.CanvasTexture {
  const size = opts.size ?? 256;
  const rng = makeRng(opts.seed ?? 1337);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = opts.base;
  ctx.fillRect(0, 0, size, size);

  // large soft stains (water, oil, grime) break up obvious tiling
  const blotches = opts.blotches ?? 10;
  for (let i = 0; i < blotches; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = size * (0.08 + rng() * 0.22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, opts.blotchColor ?? 'rgba(0,0,0,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const variance = opts.variance ?? 24;
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * variance;
    d[i] = clamp255(d[i] + n);
    d[i + 1] = clamp255(d[i + 1] + n);
    d[i + 2] = clamp255(d[i + 2] + n);
  }
  ctx.putImageData(img, 0, 0);

  const planks = opts.planks ?? 0;
  if (planks > 0) {
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    for (let i = 1; i < planks; i++) {
      const y = (i / planks) * size;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
  }

  const speckles = opts.speckles ?? 0;
  const colors = opts.speckleColors ?? ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.06)'];
  for (let i = 0; i < speckles; i++) {
    ctx.fillStyle = colors[(rng() * colors.length) | 0];
    const r = 0.6 + rng() * 3;
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const cracks = opts.cracks ?? 0;
  ctx.strokeStyle = opts.crackColor ?? 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1;
  for (let i = 0; i < cracks; i++) {
    ctx.beginPath();
    let x = rng() * size;
    let y = rng() * size;
    ctx.moveTo(x, y);
    const segs = 3 + ((rng() * 4) | 0);
    for (let s = 0; s < segs; s++) {
      x += (rng() - 0.5) * 46;
      y += (rng() - 0.5) * 46;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const [rx, ry] = opts.repeat ?? [1, 1];
  tex.repeat.set(rx, ry);
  tex.needsUpdate = true;
  return tex;
}

export interface TextureSet {
  asphalt: THREE.CanvasTexture;
  sidewalk: THREE.CanvasTexture;
  wall: THREE.CanvasTexture;
  plaster: THREE.CanvasTexture;
  wood: THREE.CanvasTexture;
}

let cache: TextureSet | null = null;

export function getTextures(): TextureSet {
  if (cache) return cache;
  cache = {
    asphalt: makeNoiseTexture({
      base: '#1b1e21',
      variance: 30,
      blotches: 14,
      blotchColor: 'rgba(0,0,0,0.3)',
      speckles: 160,
      speckleColors: ['rgba(0,0,0,0.35)', 'rgba(120,130,140,0.08)'],
      cracks: 9,
      repeat: [3, 11],
      seed: 11
    }),
    sidewalk: makeNoiseTexture({
      base: '#2c3033',
      variance: 20,
      blotches: 8,
      speckles: 60,
      cracks: 5,
      planks: 4,
      repeat: [1, 22],
      seed: 27
    }),
    wall: makeNoiseTexture({
      base: '#262a2c',
      variance: 18,
      blotches: 16,
      blotchColor: 'rgba(0,0,0,0.28)',
      speckles: 70,
      speckleColors: ['rgba(0,0,0,0.3)', 'rgba(160,170,175,0.05)'],
      cracks: 4,
      repeat: [6, 3],
      seed: 43
    }),
    plaster: makeNoiseTexture({
      base: '#2e2e2a',
      variance: 22,
      blotches: 12,
      blotchColor: 'rgba(40,30,10,0.25)',
      speckles: 110,
      speckleColors: ['rgba(0,0,0,0.32)', 'rgba(190,180,160,0.05)'],
      cracks: 6,
      repeat: [3, 1.5],
      seed: 61
    }),
    wood: makeNoiseTexture({
      base: '#2c241f',
      variance: 16,
      blotches: 6,
      speckles: 30,
      cracks: 8,
      crackColor: 'rgba(0,0,0,0.35)',
      planks: 6,
      repeat: [3, 2],
      seed: 89
    })
  };
  return cache;
}
