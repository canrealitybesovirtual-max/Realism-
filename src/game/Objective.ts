import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Collider, Pickup } from '../types';
import { makeItemMesh } from '../world/ItemPickups';
import { GATE_HALF, Z_MIN } from '../world/StreetZone';

const FUSE_BOX_POS = new THREE.Vector3(-7.86, 0, -15);
const GATE_Z = Z_MIN + 0.45; // gate panels sit just inside the wall opening
const WIN_Z = Z_MIN - 1.0; // through the gate and into the alley

const FUSE_SPAWNS: Array<{ x: number; z: number; y?: number; yaw?: number }> = [
  { x: -3, z: -10, yaw: 0.7 },
  { x: 12.3, z: -1.2, y: 1.0, yaw: 1.2 },
  { x: 13.6, z: -3.0, yaw: 0.3 }
];

export type InteractResult = 'none' | 'need_fuses' | 'power_restored';

export class Objective {
  readonly fusePickups: Pickup[] = [];
  fusesCollected = 0;
  powerRestored = false;

  private readonly gateCollider: Collider = {
    minX: -GATE_HALF,
    maxX: GATE_HALF,
    minZ: Z_MIN - 0.2,
    maxZ: GATE_Z + 0.08
  };
  private fuseBoxLED: THREE.MeshBasicMaterial | null = null;
  private fuseBoxLever: THREE.Mesh | null = null;
  private fuseSlots: THREE.Mesh[] = [];
  private gateLight: THREE.MeshBasicMaterial | null = null;
  private gateLeft: THREE.Mesh | null = null;
  private gateRight: THREE.Mesh | null = null;
  private gateLamp: THREE.PointLight | null = null;
  private pulse = 0;

  onPowerRestored: (() => void) | null = null;

  constructor(scene: THREE.Scene, private colliders: Collider[]) {
    this.spawnFuses(scene);
    this.buildFuseBox(scene);
    this.buildGate(scene);
    this.colliders.push(this.gateCollider);
    this.updateVisuals();
  }

  /** True while the gate panels are still sliding (so the game knows to wait). */
  get gateOpening(): boolean {
    return !!this.gateLeft && this.powerRestored && this.gateLeft.position.x > -GATE_HALF * 1.45;
  }

  addFuse(): number {
    this.fusesCollected = Math.min(CONFIG.objective.fuseCount, this.fusesCollected + 1);
    this.updateVisuals();
    return this.fusesCollected;
  }

  isNearFuseBox(pos: THREE.Vector3): boolean {
    const dx = pos.x - FUSE_BOX_POS.x;
    const dz = pos.z - FUSE_BOX_POS.z;
    const r = CONFIG.objective.interactRange;
    return dx * dx + dz * dz <= r * r;
  }

  get fuseBoxPosition(): THREE.Vector3 {
    return FUSE_BOX_POS;
  }

  getInteractHint(pos: THREE.Vector3): string | null {
    if (this.powerRestored || !this.isNearFuseBox(pos)) return null;
    if (this.fusesCollected < CONFIG.objective.fuseCount) {
      return `FUSE BOX (${this.fusesCollected}/${CONFIG.objective.fuseCount})`;
    }
    return 'INSERT FUSES';
  }

  tryInteract(pos: THREE.Vector3): InteractResult {
    if (this.powerRestored || !this.isNearFuseBox(pos)) return 'none';
    if (this.fusesCollected < CONFIG.objective.fuseCount) return 'need_fuses';
    this.setPower(true);
    this.onPowerRestored?.();
    return 'power_restored';
  }

  checkWin(playerPos: THREE.Vector3): boolean {
    return this.powerRestored && playerPos.z < WIN_Z;
  }

  getObjectiveText(): string {
    if (this.powerRestored) return 'Escape north through the gate';
    if (this.fusesCollected < CONFIG.objective.fuseCount) {
      return `Find fuse parts (${this.fusesCollected}/${CONFIG.objective.fuseCount})`;
    }
    return 'Restore power at the fuse box';
  }

  update(dt: number): void {
    this.pulse += dt;
    if (!this.powerRestored) {
      // the closed gate's indicator blinks slowly
      if (this.gateLight) {
        const on = Math.sin(this.pulse * 2.2) > 0.6 ? 1 : 0.35;
        this.gateLight.color.setRGB(0.35 * on, 0.05 * on, 0.04 * on);
      }
      return;
    }
    const glow = 0.75 + Math.sin(this.pulse * 3) * 0.25;
    if (this.gateLight) this.gateLight.color.setRGB(0.1 * glow, 0.9 * glow, 0.4 * glow);
    // panels slide into the wall: slow start, slow finish
    const target = -GATE_HALF * 1.5;
    if (this.gateLeft && this.gateRight) {
      const x = this.gateLeft.position.x;
      const step = dt * 0.55 * Math.min(1, 0.25 + Math.abs(x - target));
      this.gateLeft.position.x = Math.max(target, x - step);
      this.gateRight.position.x = -this.gateLeft.position.x;
    }
  }

  reset(): void {
    this.fusesCollected = 0;
    for (const p of this.fusePickups) {
      p.taken = false;
      p.mesh.visible = true;
    }
    this.setPower(false);
    if (this.gateLeft) this.gateLeft.position.x = -GATE_HALF / 2;
    if (this.gateRight) this.gateRight.position.x = GATE_HALF / 2;
  }

  /** Call after the pickups' taken flags were restored from a save. */
  applySave(powerRestored: boolean): void {
    this.fusesCollected = this.fusePickups.filter((p) => p.taken).length;
    this.setPower(powerRestored);
    if (powerRestored && this.gateLeft && this.gateRight) {
      this.gateLeft.position.x = -GATE_HALF * 1.5;
      this.gateRight.position.x = GATE_HALF * 1.5;
    } else if (this.gateLeft && this.gateRight) {
      this.gateLeft.position.x = -GATE_HALF / 2;
      this.gateRight.position.x = GATE_HALF / 2;
    }
  }

  private setPower(on: boolean): void {
    this.powerRestored = on;
    const idx = this.colliders.indexOf(this.gateCollider);
    if (on && idx >= 0) this.colliders.splice(idx, 1);
    if (!on && idx < 0) this.colliders.push(this.gateCollider);
    this.updateVisuals();
  }

  private spawnFuses(scene: THREE.Scene): void {
    FUSE_SPAWNS.forEach((s, i) => {
      const mesh = makeItemMesh('fuse_part');
      mesh.position.set(s.x, s.y ?? 0, s.z);
      mesh.rotation.y = s.yaw ?? 0;
      mesh.name = `fuse:${i}`;
      scene.add(mesh);
      this.fusePickups.push({ itemId: 'fuse_part', mesh, taken: false });
    });
  }

  private updateVisuals(): void {
    const ready = this.fusesCollected >= CONFIG.objective.fuseCount;
    const ledColor = this.powerRestored ? 0x3aff6a : ready ? 0xffaa22 : 0xff3322;
    this.fuseBoxLED?.color.setHex(ledColor);
    if (this.fuseBoxLever) this.fuseBoxLever.rotation.z = this.powerRestored ? -0.6 : 0.6;
    this.fuseSlots.forEach((slot, i) => {
      const filled = this.powerRestored || i < this.fusesCollected;
      (slot.material as THREE.MeshBasicMaterial).color.setHex(filled ? 0x2ea870 : 0x0a0c0d);
    });
    if (this.gateLamp) this.gateLamp.intensity = this.powerRestored ? 4 : 0;
  }

  private buildFuseBox(scene: THREE.Scene): void {
    const { x, z } = FUSE_BOX_POS;
    // grey steel cabinet bolted to the left facade, door facing the street (+x)
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.8, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x3a4044, roughness: 0.6, metalness: 0.5 })
    );
    box.position.set(x, 1.25, z);
    scene.add(box);

    const conduit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 9 - 1.65, 6),
      new THREE.MeshLambertMaterial({ color: 0x2a2e30 })
    );
    conduit.position.set(x - 0.06, 1.65 + (9 - 1.65) / 2, z + 0.2);
    scene.add(conduit);

    // warning label
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x9a7a1a })
    );
    label.position.set(x + 0.121, 1.52, z + 0.14);
    label.rotation.y = Math.PI / 2;
    scene.add(label);

    // three fuse slots fill as you find parts
    for (let i = 0; i < CONFIG.objective.fuseCount; i++) {
      const slot = new THREE.Mesh(
        new THREE.PlaneGeometry(0.05, 0.12),
        new THREE.MeshBasicMaterial({ color: 0x0a0c0d })
      );
      slot.position.set(x + 0.121, 1.3, z - 0.14 + i * 0.09);
      slot.rotation.y = Math.PI / 2;
      scene.add(slot);
      this.fuseSlots.push(slot);
    }

    const ledMat = new THREE.MeshBasicMaterial({ color: 0xff3322, fog: false });
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.018, 10), ledMat);
    led.position.set(x + 0.121, 1.55, z - 0.18);
    led.rotation.y = Math.PI / 2;
    scene.add(led);
    this.fuseBoxLED = ledMat;

    const lever = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.22, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x8a2a1a, roughness: 0.5 })
    );
    lever.geometry.translate(0, 0.09, 0);
    lever.position.set(x + 0.15, 1.05, z + 0.17);
    scene.add(lever);
    this.fuseBoxLever = lever;

    this.colliders.push({ minX: x - 0.12, maxX: x + 0.14, minZ: z - 0.32, maxZ: z + 0.32 });
  }

  private buildGate(scene: THREE.Scene): void {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x151a1d, roughness: 0.6, metalness: 0.6 });
    for (const x of [-GATE_HALF, GATE_HALF]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.3, 0.5), frameMat);
      post.position.set(x, 1.65, Z_MIN + 0.1);
      scene.add(post);
    }

    // corrugated steel roller panels
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1c2226, roughness: 0.5, metalness: 0.7 });
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x252c31, roughness: 0.45, metalness: 0.7 });
    const makePanel = (x: number) => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(GATE_HALF, 3.1, 0.08), panelMat);
      for (let i = 0; i < 9; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(GATE_HALF - 0.04, 0.05, 0.03), ribMat);
        rib.position.set(0, -1.4 + i * 0.35, 0.05);
        panel.add(rib);
      }
      panel.position.set(x, 1.55, GATE_Z);
      scene.add(panel);
      return panel;
    };
    this.gateLeft = makePanel(-GATE_HALF / 2);
    this.gateRight = makePanel(GATE_HALF / 2);

    const lightMat = new THREE.MeshBasicMaterial({ color: 0x442222, fog: false });
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.08), lightMat);
    light.position.set(0, 3.5, Z_MIN + 0.25);
    scene.add(light);
    this.gateLight = lightMat;

    // when the power comes back a work lamp in the alley shows the way out
    this.gateLamp = new THREE.PointLight(0xbfe8ff, 0, 10, 2);
    this.gateLamp.position.set(0, 3.0, Z_MIN - 3);
    scene.add(this.gateLamp);
  }
}
