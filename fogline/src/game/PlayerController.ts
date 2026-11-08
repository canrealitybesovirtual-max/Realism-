import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Collider } from '../types';
import { circleIntersectsColliders, clamp, damp } from '../utils/MathUtils';
import type { InputManager } from './InputManager';

export class PlayerController {
  readonly position: THREE.Vector3;
  yaw = 0;
  pitch = 0;
  stamina: number = CONFIG.player.maxStamina;
  health: number = CONFIG.health.max;
  readonly maxHealth: number = CONFIG.health.max;

  /** Look multiplier and inversion from the settings menu. */
  lookScale = 1;
  invertY = false;
  /** Height of the floor under the player (kerbs); set by the game each step. */
  groundFn: ((x: number, z: number) => number) | null = null;

  onFootstep: ((sprinting: boolean, indoors: boolean) => void) | null = null;

  private readonly vel = new THREE.Vector2();
  private staminaDelay = 0;
  private exhausted = false;
  private bobPhase = 0;
  private bobAmount = 0;
  private groundY = 0;
  private hurtKick = 0;
  private readonly radius = CONFIG.player.radius;

  constructor(spawn: THREE.Vector3) {
    this.position = spawn.clone();
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.y);
  }

  get isSprinting(): boolean {
    return this.speed > CONFIG.player.walkSpeed * 1.3;
  }

  damage(n: number): void {
    this.health = Math.max(0, this.health - n);
    this.hurtKick = 1;
  }

  heal(n: number): void {
    this.health = Math.min(this.maxHealth, this.health + n);
  }

  applyLook(dx: number, dy: number): void {
    const s = CONFIG.player.lookSensitivity * this.lookScale;
    this.yaw -= dx * s;
    this.pitch -= dy * s * (this.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -CONFIG.player.maxPitch, CONFIG.player.maxPitch);
  }

  step(dt: number, input: InputManager, colliders: Collider[]): void {
    const p = CONFIG.player;
    const mx = input.move.x;
    const my = input.move.y;
    const inLen = Math.min(1, Math.hypot(mx, my));

    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);

    let dirX = fx * my + rx * mx;
    let dirZ = fz * my + rz * mx;
    const dLen = Math.hypot(dirX, dirZ);
    if (dLen > 1) {
      dirX /= dLen;
      dirZ /= dLen;
    }

    // Sprint only forwards-ish, and not again until stamina recovers a bit after running dry.
    const forwardish = my > 0.3;
    if (this.stamina <= 0.5) this.exhausted = true;
    if (this.exhausted && this.stamina > 25) this.exhausted = false;
    const wantsSprint = input.sprint && forwardish && inLen > 0.3 && !this.exhausted;

    if (wantsSprint && this.speed > 0.5) {
      this.stamina = Math.max(0, this.stamina - p.staminaDrainPerSec * dt);
      this.staminaDelay = p.staminaRegenDelay;
    } else {
      this.staminaDelay = Math.max(0, this.staminaDelay - dt);
      if (this.staminaDelay <= 0) {
        // recover faster when standing still
        const rate = p.staminaRegenPerSec * (this.speed < 0.2 ? 1.5 : 1);
        this.stamina = Math.min(p.maxStamina, this.stamina + rate * dt);
      }
    }

    // a hurt or exhausted body is slower
    const hurt = 0.8 + 0.2 * (this.health / this.maxHealth);
    const tired = this.exhausted ? 0.85 : 1;
    const top = (wantsSprint ? p.sprintSpeed : p.walkSpeed) * hurt * tired;
    // backpedalling and strafing are slower than walking forwards
    const dirScale = my < -0.1 ? 0.7 : 1;

    this.vel.x = damp(this.vel.x, dirX * top * dirScale, p.accel, dt);
    this.vel.y = damp(this.vel.y, dirZ * top * dirScale, p.accel, dt);

    this.moveAxis(this.vel.x * dt, 0, colliders);
    this.moveAxis(0, this.vel.y * dt, colliders);

    // head bob is driven by distance walked: one footfall every strideLength metres
    const sp = this.speed;
    this.bobAmount = damp(this.bobAmount, Math.min(sp / p.walkSpeed, 1.6), 8, dt);
    const prev = this.bobPhase;
    this.bobPhase += ((sp * dt) / p.strideLength) * Math.PI;
    if (sp > 0.35 && Math.floor(this.bobPhase / Math.PI) !== Math.floor(prev / Math.PI)) {
      this.onFootstep?.(this.isSprinting, this.position.x > 8.4);
    }

    const g = this.groundFn ? this.groundFn(this.position.x, this.position.z) : 0;
    this.groundY = damp(this.groundY, g, 14, dt);
    this.hurtKick = Math.max(0, this.hurtKick - dt * 3);
  }

  applyToCamera(camera: THREE.PerspectiveCamera): void {
    const p = CONFIG.player;
    // footfall = bottom of the bob (|sin| shape, like a real gait)
    const bobY = -Math.abs(Math.sin(this.bobPhase)) * p.bobAmp * this.bobAmount;
    const sway = Math.sin(this.bobPhase * 0.5) * p.bobSway * this.bobAmount;
    const roll = Math.sin(this.bobPhase * 0.5) * p.bobRoll * this.bobAmount;
    // laboured breathing when low on stamina
    const t = performance.now() / 1000;
    const breath = (1 - this.stamina / p.maxStamina) * 0.006 * Math.sin(t * 5.5);
    const kick = this.hurtKick * this.hurtKick;

    camera.position.set(this.position.x, this.groundY + p.eyeHeight + bobY + breath, this.position.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.pitch - kick * 0.06, this.yaw, roll + kick * 0.04);
    camera.translateX(sway);
  }

  respawn(spawn: THREE.Vector3, hp: number): void {
    this.position.copy(spawn);
    this.health = hp;
    this.stamina = CONFIG.player.maxStamina;
    this.exhausted = false;
    this.vel.set(0, 0);
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.hurtKick = 0;
    this.yaw = 0;
    this.pitch = 0;
  }

  setPose(x: number, z: number, yaw: number, pitch: number): void {
    this.position.set(x, 0, z);
    this.yaw = yaw;
    this.pitch = clamp(pitch, -CONFIG.player.maxPitch, CONFIG.player.maxPitch);
    this.vel.set(0, 0);
  }

  private moveAxis(dx: number, dz: number, colliders: Collider[]): void {
    if (dx === 0 && dz === 0) return;
    const nx = this.position.x + dx;
    const nz = this.position.z + dz;
    if (!circleIntersectsColliders(nx, nz, this.radius, colliders)) {
      this.position.x = nx;
      this.position.z = nz;
    } else if (dx !== 0) {
      this.vel.x = 0;
    } else {
      this.vel.y = 0;
    }
  }
}
