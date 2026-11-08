import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Pickup } from '../types';

/** Finds the pickup the player is aiming at (ray first, then a forgiving cone for touch). */
export class Interaction {
  private readonly raycaster = new THREE.Raycaster();
  private readonly dir = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly meshes: THREE.Object3D[] = [];
  private timer = 0;
  private _target: Pickup | null = null;
  onTargetChange: ((p: Pickup | null) => void) | null = null;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private pickups: Pickup[]
  ) {}

  get target(): Pickup | null {
    return this._target;
  }

  forceRefresh(): void {
    this.timer = 1;
    this.update(0);
  }

  update(dt: number): void {
    this.timer += dt;
    if (this.timer < 1 / CONFIG.interact.hz) return;
    this.timer = 0;

    this.camera.getWorldDirection(this.dir);
    const eye = this.camera.position;

    this.meshes.length = 0;
    for (const p of this.pickups) if (!p.taken) this.meshes.push(p.mesh);
    if (this.meshes.length === 0) {
      this.setTarget(null);
      return;
    }

    // 1. straight ahead
    this.raycaster.set(eye, this.dir);
    this.raycaster.far = CONFIG.interact.maxRange;
    const hits = this.raycaster.intersectObjects(this.meshes, false);
    if (hits.length > 0) {
      const hit = hits[0].object;
      this.setTarget(this.pickups.find((p) => p.mesh === hit) ?? null);
      return;
    }

    // 2. proximity cone (small objects are hard to hit exactly, especially on touch)
    const cos = CONFIG.interact.proximityCos;
    const range = CONFIG.interact.proximityRange;
    let best: Pickup | null = null;
    let bestScore = -Infinity;
    for (const p of this.pickups) {
      if (p.taken) continue;
      this.tmp.copy(p.mesh.position).sub(eye);
      const dist = this.tmp.length();
      if (dist > range || dist < 1e-4) continue;
      const dot = this.tmp.dot(this.dir) / dist;
      if (dot < cos) continue;
      const score = dot * 2 - dist; // favour what is centred, then what is near
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    this.setTarget(best);
  }

  private setTarget(p: Pickup | null): void {
    if (p === this._target) return;
    this._target = p;
    this.onTargetChange?.(p);
  }
}
