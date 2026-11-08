import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Collider, Pickup } from '../types';
import { buildStreet, Z_MAX, Z_MIN } from '../world/StreetZone';
import { buildInterior, SHOP } from '../world/InteriorZone';
import { spawnPickups } from '../world/ItemPickups';
import type { Streetlight } from '../world/PropFactory';

export class World {
  readonly scene = new THREE.Scene();
  readonly colliders: Collider[] = [];
  readonly spawn = new THREE.Vector3(0, 0, 14);
  readonly pickups: Pickup[];
  fogScale = 1;

  private readonly shopSign: THREE.Mesh;
  private readonly streetlights: Streetlight[];
  private readonly bulb: THREE.PointLight;
  private time = 0;
  private flickerUntil = 0;
  private nextFlicker = 4;

  constructor() {
    this.scene.background = new THREE.Color(CONFIG.render.fogColor);
    this.scene.fog = new THREE.FogExp2(CONFIG.render.fogColor, CONFIG.render.fogDensityOutdoor);

    // overcast night sky glow from above, near-black bounce from below
    this.scene.add(new THREE.HemisphereLight(0x5a7086, 0x24211d, 2.4));
    // moonlight through thin cloud: gives walls and cars their shape
    const moon = new THREE.DirectionalLight(0xa8bcd6, 0.9);
    moon.position.set(-6, 14, 8);
    this.scene.add(moon);

    const street = buildStreet(this.scene);
    this.colliders.push(...street.colliders);
    this.shopSign = street.sign;
    this.streetlights = street.streetlights;

    const interior = buildInterior(this.scene);
    this.colliders.push(...interior.colliders);
    this.bulb = interior.bulb;

    this.pickups = spawnPickups(this.scene);
  }

  isIndoors(p: THREE.Vector3): boolean {
    return p.x > SHOP.minX && p.x < SHOP.maxX && p.z > SHOP.minZ && p.z < SHOP.maxZ;
  }

  /** Floor height: the pavements are a kerb step above the road. */
  groundAt = (x: number, z: number): number => {
    const ax = Math.abs(x);
    return ax > 6.08 && ax < 8 && z > Z_MIN && z < Z_MAX ? 0.15 : 0;
  };

  update(dt: number, playerPos: THREE.Vector3): void {
    this.time += dt;
    const fog = this.scene.fog as THREE.FogExp2;
    const base = this.isIndoors(playerPos) ? CONFIG.render.fogDensityIndoor : CONFIG.render.fogDensityOutdoor;
    const target = base * this.fogScale;
    fog.density += (target - fog.density) * (1 - Math.exp(-4 * dt));

    // shop sign: brief deep dips at irregular intervals
    const cycle = this.time % 5.3;
    const flick = cycle < 0.07 || (cycle > 2.15 && cycle < 2.18) ? 0.15 : 1;
    (this.shopSign.material as THREE.MeshBasicMaterial).color.setRGB(0.68 * flick, 0.26 * flick, 0.14 * flick);

    // the third streetlight is dying: random stutters, then steady again
    const sl = this.streetlights[3];
    if (sl) {
      if (this.time > this.nextFlicker) {
        this.flickerUntil = this.time + 0.4 + Math.random() * 1.2;
        this.nextFlicker = this.flickerUntil + 3 + Math.random() * 9;
      }
      const on = this.time < this.flickerUntil ? (Math.random() < 0.5 ? 0.05 : 0.7) : 1;
      sl.light.intensity = 30 * on;
      sl.lampMat.color.setRGB(1 * on, 0.63 * on, 0.29 * on);
    }

    // the bare bulb sways very slightly on its cord: light breathes
    this.bulb.intensity = 14 * (0.94 + Math.sin(this.time * 1.3) * 0.04 + Math.sin(this.time * 7.1) * 0.02);
  }
}
