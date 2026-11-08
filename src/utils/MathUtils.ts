import type { Collider } from '../types';

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing toward a target. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Same as damp, but takes the short way round the circle. */
export function dampAngle(current: number, target: number, rate: number, dt: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-rate * dt));
}

/** Deterministic small LCG so procedural props look identical every load. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Circle-vs-AABB in the XZ plane against every collider. */
export function circleIntersectsColliders(
  x: number,
  z: number,
  radius: number,
  colliders: Collider[]
): boolean {
  const r2 = radius * radius;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const cx = x < c.minX ? c.minX : x > c.maxX ? c.maxX : x;
    const cz = z < c.minZ ? c.minZ : z > c.maxZ ? c.maxZ : z;
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}

/** Segment-vs-AABB (2D slab method) in the XZ plane. */
export function segmentIntersectsAABB2D(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  let tmin = 0;
  let tmax = 1;

  if (Math.abs(dx) < 1e-8) {
    if (ax < minX || ax > maxX) return false;
  } else {
    const t1 = (minX - ax) / dx;
    const t2 = (maxX - ax) / dx;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmin > tmax) return false;
  }

  if (Math.abs(dz) < 1e-8) {
    if (az < minZ || az > maxZ) return false;
  } else {
    const t1 = (minZ - az) / dz;
    const t2 = (maxZ - az) / dz;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmin > tmax) return false;
  }

  return true;
}

/** True if the segment A→B crosses any collider. */
export function segmentHitsColliders(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  colliders: Collider[]
): boolean {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (segmentIntersectsAABB2D(ax, az, bx, bz, c.minX, c.maxX, c.minZ, c.maxZ)) return true;
  }
  return false;
}
