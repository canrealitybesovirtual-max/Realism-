import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Collider } from '../types';
import { circleIntersectsColliders, dampAngle, segmentHitsColliders } from '../utils/MathUtils';

export type EnemyState = 'patrol' | 'investigate' | 'chase';

const WAYPOINTS: Array<{ x: number; z: number }> = [
  { x: 0, z: -18 },
  { x: -5.5, z: -12 },
  { x: -5.5, z: 8 },
  { x: 0, z: 18 },
  { x: 5.5, z: 8 },
  { x: 5.5, z: -12 },
  { x: 7, z: 0 },
  { x: 11, z: 0 },
  { x: 7, z: 0 }
];

const FOV_COS = Math.cos((115 / 2) * (Math.PI / 180));

function insideShop(x: number, z: number): boolean {
  return x > 8.4 && z > -4 && z < 4;
}

export interface PerceptionInput {
  playerPos: THREE.Vector3;
  playerAlive: boolean;
  /** 0..1: how loud the player is right now (sprinting ~1, walking ~0.3, still 0) */
  noise: number;
  /** 0..1: flashlight output (a lit torch is visible from much further) */
  light: number;
}

export class Enemy {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();

  private state: EnemyState = 'patrol';
  private waypointIdx = 0;
  private readonly lastKnown = new THREE.Vector3();
  private stateTimer = 0;
  private losTimer = 0;
  private damageCooldown = 0;
  private lookAroundTimer = 0;
  private stuckTimer = 0;
  private walkPhase = 0;
  private eyePhase = 0;
  private facing = 0;
  private moveSpeed = 0;
  private _hasLOS = false;
  private _sees = false;
  private readonly radius = 0.4;
  private readonly eyes: THREE.Mesh[] = [];
  private readonly limbs: { armL: THREE.Object3D; armR: THREE.Object3D; legL: THREE.Object3D; legR: THREE.Object3D; torso: THREE.Object3D; head: THREE.Object3D };
  private lastStepIdx = 0;

  onContact: ((damage: number) => void) | null = null;
  onAlert: (() => void) | null = null;
  onStep: ((pos: THREE.Vector3, running: boolean) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.limbs = this.buildMesh();
    this.reset();
    scene.add(this.group);
  }

  /** Clear line between the enemy and the player within detection range. */
  get hasLOS(): boolean {
    return this._hasLOS;
  }

  /** Actually perceives the player (LOS + in view or close enough to hear). */
  get seesPlayer(): boolean {
    return this._sees;
  }

  get currentState(): EnemyState {
    return this.state;
  }

  get isMoving(): boolean {
    return this.moveSpeed > 0.1;
  }

  reset(): void {
    this.state = 'patrol';
    this.waypointIdx = 0;
    this.position.set(WAYPOINTS[0].x, 0, WAYPOINTS[0].z);
    this.group.position.copy(this.position);
    this.facing = 0;
    this.group.rotation.y = 0;
    this._hasLOS = false;
    this._sees = false;
    this.stateTimer = 0;
    this.stuckTimer = 0;
    this.damageCooldown = 1.5;
    this.moveSpeed = 0;
  }

  /** Something made a noise (e.g. the fuse box): come and look. */
  hear(pos: THREE.Vector3): void {
    if (this.state === 'chase') return;
    this.state = 'investigate';
    this.stateTimer = 0;
    this.lookAroundTimer = 0;
    this.lastKnown.set(pos.x, 0, pos.z);
  }

  update(dt: number, input: PerceptionInput, colliders: Collider[]): void {
    const { playerPos, playerAlive } = input;
    if (!playerAlive && this.state === 'chase') {
      this.state = 'investigate';
      this.stateTimer = 0;
      this.lookAroundTimer = 0;
    }

    this.eyePhase += dt * (this.state === 'chase' ? 9 : 3);

    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dist = Math.hypot(dx, dz);

    // ---- perception at 10 Hz ----
    this.losTimer += dt;
    if (this.losTimer >= 0.1) {
      this.losTimer = 0;
      const range = CONFIG.enemy.detectRange + (CONFIG.enemy.detectRangeLit - CONFIG.enemy.detectRange) * input.light;
      if (dist > Math.max(range, CONFIG.enemy.detectRange * 1.4)) {
        this._hasLOS = false;
      } else {
        this._hasLOS = !segmentHitsColliders(this.position.x, this.position.z, playerPos.x, playerPos.z, colliders);
      }
      const fx = Math.sin(this.facing);
      const fz = Math.cos(this.facing);
      const inView = dist < 0.01 || (dx * fx + dz * fz) / dist > FOV_COS;
      const heard = dist < 2.2 + 6 * input.noise;
      const chasing = this.state === 'chase';
      // once it has you it keeps tracking without needing you in its narrow view cone
      this._sees =
        playerAlive && this._hasLOS && ((inView && dist < range) || heard || (chasing && dist < range * 1.4));
      if (playerAlive && !this._hasLOS && this.state === 'patrol' && dist < 6 * input.noise) {
        this.hear(playerPos); // heard footsteps through a wall
      }
    }

    // ---- state transitions ----
    this.stateTimer += dt;
    if (this._sees) {
      if (this.state !== 'chase') {
        this.state = 'chase';
        this.onAlert?.();
      }
      this.stateTimer = 0;
      this.lastKnown.set(playerPos.x, 0, playerPos.z);
    } else if (this.state === 'chase') {
      // lost sight: run to where it last saw you, then search
      const toLast = Math.hypot(this.lastKnown.x - this.position.x, this.lastKnown.z - this.position.z);
      if (
        (this.stateTimer > CONFIG.enemy.chaseLoseTime && dist > CONFIG.enemy.chaseLoseRange) ||
        (toLast < 0.6 && this.stateTimer > 0.5)
      ) {
        this.state = 'investigate';
        this.stateTimer = 0;
        this.lookAroundTimer = 0;
      }
    }

    // ---- movement target ----
    let tx = this.position.x;
    let tz = this.position.z;
    let speed = 0;

    if (this.state === 'patrol') {
      const wp = WAYPOINTS[this.waypointIdx];
      tx = wp.x;
      tz = wp.z;
      speed = CONFIG.enemy.patrolSpeed;
      if (Math.hypot(tx - this.position.x, tz - this.position.z) < 0.6) this.nextWaypoint();
    } else if (this.state === 'investigate') {
      tx = this.lastKnown.x;
      tz = this.lastKnown.z;
      speed = CONFIG.enemy.investigateSpeed;
      if (Math.hypot(tx - this.position.x, tz - this.position.z) < 0.7) {
        speed = 0;
        this.lookAroundTimer += dt;
        this.facing += Math.sin(this.lookAroundTimer * 1.6) * dt * 1.6; // head-and-shoulders sweep
        if (this.lookAroundTimer > 4.5) {
          this.state = 'patrol';
          this.stateTimer = 0;
          this.lookAroundTimer = 0;
          this.waypointIdx = this.closestWaypoint();
        }
      }
    } else {
      tx = this.lastKnown.x;
      tz = this.lastKnown.z;
      speed = CONFIG.enemy.chaseSpeed;
      if (dist < CONFIG.enemy.contactRange * 0.8) speed = 0; // don't walk through you
    }

    // ---- doorway routing between street and shop ----
    if (speed > 0 && insideShop(this.position.x, this.position.z) !== insideShop(tx, tz)) {
      const inside = insideShop(this.position.x, this.position.z);
      const nearDoor = Math.abs(this.position.z) < 0.7;
      if (inside) {
        tx = nearDoor && this.position.x < 9.8 ? 6.8 : 9.8;
      } else {
        tx = nearDoor && this.position.x > 6.8 ? 9.6 : 7.0;
      }
      tz = 0;
    }

    // ---- apply movement ----
    let moved = 0;
    if (speed > 0) {
      const mx = tx - this.position.x;
      const mz = tz - this.position.z;
      const len = Math.hypot(mx, mz);
      if (len > 0.001) {
        const nx = mx / len;
        const nz = mz / len;
        const ox = this.position.x;
        const oz = this.position.z;
        this.moveWithCollision(nx * speed * dt, nz * speed * dt, colliders);
        moved = Math.hypot(this.position.x - ox, this.position.z - oz);
        this.facing = dampAngle(this.facing, Math.atan2(nx, nz), 7, dt);
      }
    }
    if (this.state === 'chase' && dist < 4) {
      this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 10, dt); // keep eyes on you up close
    }
    this.moveSpeed = dt > 0 ? moved / dt : 0;

    // stuck on a car or corner while patrolling: give up on this waypoint
    if (speed > 0 && moved < speed * dt * 0.25) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.5) {
        this.stuckTimer = 0;
        if (this.state === 'patrol') this.nextWaypoint();
        else if (this.state === 'investigate') this.lookAroundTimer = 5;
      }
    } else {
      this.stuckTimer = 0;
    }

    // ---- contact damage ----
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    if (playerAlive && this.state === 'chase' && dist < CONFIG.enemy.contactRange && this.damageCooldown <= 0 && this._hasLOS) {
      this.damageCooldown = CONFIG.enemy.contactCooldown;
      this.onContact?.(CONFIG.enemy.contactDamage);
    }

    this.animate(dt);
  }

  private nextWaypoint(): void {
    this.waypointIdx = (this.waypointIdx + 1) % WAYPOINTS.length;
  }

  private closestWaypoint(): number {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < WAYPOINTS.length; i++) {
      const d = Math.hypot(WAYPOINTS[i].x - this.position.x, WAYPOINTS[i].z - this.position.z);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  private moveWithCollision(dx: number, dz: number, colliders: Collider[]): void {
    const nx = this.position.x + dx;
    if (!circleIntersectsColliders(nx, this.position.z, this.radius, colliders)) this.position.x = nx;
    const nz = this.position.z + dz;
    if (!circleIntersectsColliders(this.position.x, nz, this.radius, colliders)) this.position.z = nz;
  }

  /** Gait: limbs swing with distance covered, body hunches forward when running. */
  private animate(dt: number): void {
    const run = Math.min(1, this.moveSpeed / CONFIG.enemy.chaseSpeed);
    this.walkPhase += this.moveSpeed * dt * 3.4;
    const swing = Math.sin(this.walkPhase) * (0.35 + 0.45 * run) * Math.min(1, this.moveSpeed * 2);

    const L = this.limbs;
    L.legL.rotation.x = swing;
    L.legR.rotation.x = -swing;
    L.armL.rotation.x = -swing * 0.8 - 0.15 * run;
    L.armR.rotation.x = swing * 0.8 - 0.15 * run;
    L.torso.rotation.x = 0.08 + 0.22 * run;
    // idle: the head tilts and twitches
    L.head.rotation.z = Math.sin(this.eyePhase * 0.37) * 0.12 * (1 - run);
    L.head.rotation.x = -0.1 * run;

    const bounce = Math.abs(Math.sin(this.walkPhase)) * 0.04 * Math.min(1, this.moveSpeed);
    this.group.position.set(this.position.x, bounce, this.position.z);
    this.group.rotation.y = this.facing;

    const stepIdx = Math.floor(this.walkPhase / Math.PI);
    if (stepIdx !== this.lastStepIdx) {
      this.lastStepIdx = stepIdx;
      if (this.moveSpeed > 0.2) this.onStep?.(this.position, run > 0.6);
    }

    const eyePulse = 1 + Math.sin(this.eyePhase) * 0.18;
    for (const e of this.eyes) e.scale.setScalar(eyePulse);
  }

  private buildMesh() {
    const skin = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.9 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a15, fog: false });

    const torso = new THREE.Group();
    torso.position.y = 1.0;
    this.group.add(torso);

    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.55, 4, 10), skin);
    chest.scale.set(1.15, 1, 0.7);
    chest.position.y = 0.38;
    torso.add(chest);

    const head = new THREE.Group();
    head.position.y = 0.92;
    torso.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), skin);
    skull.scale.set(0.9, 1.15, 0.95);
    head.add(skull);
    for (const sx of [-0.055, 0.055]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), eyeMat);
      eye.position.set(sx, 0.02, 0.135);
      head.add(eye);
      this.eyes.push(eye);
    }

    const limb = (len: number, r: number) => {
      const pivot = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 8), skin);
      m.position.y = -len / 2 - r;
      pivot.add(m);
      return pivot;
    };

    // long, thin arms: unsettling proportions
    const armL = limb(0.72, 0.05);
    armL.position.set(-0.29, 0.7, 0);
    torso.add(armL);
    const armR = limb(0.72, 0.05);
    armR.position.set(0.29, 0.7, 0);
    torso.add(armR);

    const legL = limb(0.78, 0.075);
    legL.position.set(-0.12, 1.0, 0);
    this.group.add(legL);
    const legR = limb(0.78, 0.075);
    legR.position.set(0.12, 1.0, 0);
    this.group.add(legR);

    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    this.group.add(blob);

    return { armL, armR, legL, legR, torso, head };
  }
}
