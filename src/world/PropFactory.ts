import * as THREE from 'three';
import type { Collider } from '../types';
import { makeRng } from '../utils/MathUtils';

const rng = makeRng(90210);

const SODIUM = 0xffa04a;

export interface Streetlight {
  group: THREE.Group;
  light: THREE.PointLight;
  lampMat: THREE.MeshBasicMaterial;
}

/** Cobra-head streetlight: pole, arm, head, lit lens and a real sodium point light under it. */
export function createStreetlight(x: number, z: number, facingRight: boolean): Streetlight {
  const group = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: 0x1a1f23 });
  const dir = facingRight ? 1 : -1;

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 5.4, 8, 1), metal);
  pole.position.y = 2.7;
  group.add(pole);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.35, 8, 1), metal);
  base.position.y = 0.175;
  group.add(base);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.08), metal);
  arm.position.set(dir * 0.5, 5.32, 0);
  group.add(arm);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.13, 0.28), metal);
  head.position.set(dir * 1.0, 5.25, 0);
  group.add(head);

  const lampMat = new THREE.MeshBasicMaterial({ color: SODIUM, side: THREE.DoubleSide });
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.2), lampMat);
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(dir * 1.0, 5.18, 0);
  group.add(lamp);

  group.position.set(x, 0, z);

  const light = new THREE.PointLight(SODIUM, 10, 14, 2);
  light.position.set(x + dir * 1.0, 5.0, z);

  return { group, light, lampMat };
}

/** Scattered rubble as one InstancedMesh (1 draw call). Kept off the walking lines. */
export function createDebris(scene: THREE.Scene): void {
  const count = 60;
  const geo = new THREE.DodecahedronGeometry(0.5, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x2b2d2e });
  const mesh = new THREE.InstancedMesh(geo, mat, count);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    // gutters and kerbs collect most of the rubble
    const side = rng() < 0.5 ? -1 : 1;
    const x = rng() < 0.7 ? side * (5.2 + rng() * 2.5) : (rng() - 0.5) * 10;
    const z = (rng() - 0.5) * 42;
    const size = 0.05 + rng() * 0.2;
    p.set(x, size * 0.3, z);
    e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI);
    q.setFromEuler(e);
    s.set(size, size * (0.4 + rng() * 0.5), size * (0.6 + rng() * 0.7));
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    c.setHSL(0.08, 0.05, 0.1 + rng() * 0.08);
    mesh.setColorAt(i, c);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
}

/** Facade windows (frame + pane) as InstancedMeshes; a few rooms still have a lamp on. */
export function createWindows(
  scene: THREE.Scene,
  side: -1 | 1,
  zFrom: number,
  zTo: number,
  floors: number
): void {
  const perFloor = Math.max(1, Math.floor((zTo - zFrom) / 3));
  const count = perFloor * floors;

  const paneGeo = new THREE.PlaneGeometry(0.9, 1.3);
  const paneMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const panes = new THREE.InstancedMesh(paneGeo, paneMat, count);

  const frameGeo = new THREE.BoxGeometry(1.08, 1.5, 0.04);
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x15181a });
  const frames = new THREE.InstancedMesh(frameGeo, frameMat, count);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const c = new THREE.Color();
  q.setFromEuler(new THREE.Euler(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0));

  let i = 0;
  for (let f = 0; f < floors; f++) {
    for (let w = 0; w < perFloor; w++) {
      const z = zFrom + (w + 0.5) * ((zTo - zFrom) / perFloor);
      pos.set(side * 8.0, 1.9 + f * 2.6, z);
      m.compose(pos, q, one);
      frames.setMatrixAt(i, m);

      pos.set(side * 7.975, 1.9 + f * 2.6, z);
      m.compose(pos, q, one);
      panes.setMatrixAt(i, m);

      const r = rng();
      if (r < 0.1) c.setRGB(0.03, 0.017, 0.006); // warm lamp behind a curtain
      else if (r < 0.14) c.setRGB(0.006, 0.01, 0.016); // TV glow
      else c.setRGB(0.006, 0.008, 0.011).multiplyScalar(0.7 + rng() * 0.6); // dark glass
      panes.setColorAt(i, c);
      i++;
    }
  }

  for (const mesh of [panes, frames]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
  if (panes.instanceColor) panes.instanceColor.needsUpdate = true;
}

/** Faded dashed centre line and edge lines (thin quads lying on the road). */
export function createRoadMarkings(scene: THREE.Scene, zMin: number, zMax: number): void {
  const mat = new THREE.MeshLambertMaterial({ color: 0x6d6a5a, transparent: true, opacity: 0.55 });
  const dashGeo = new THREE.PlaneGeometry(0.12, 2.2);
  const dashes: number[] = [];
  for (let z = zMin + 2; z < zMax - 2; z += 5) dashes.push(z);
  const mesh = new THREE.InstancedMesh(dashGeo, mat, dashes.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  dashes.forEach((z, i) => {
    s.set(1, 0.7 + rng() * 0.3, 1); // worn, uneven lengths
    p.set(0, 0.006, z);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);

  const edgeGeo = new THREE.PlaneGeometry(0.1, zMax - zMin);
  for (const x of [-5.6, 5.6]) {
    const edge = new THREE.Mesh(edgeGeo, mat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(x, 0.005, (zMin + zMax) / 2);
    scene.add(edge);
  }
}

/**
 * Abandoned sedan: body, cabin, dark glass, wheels sunk on flat tyres.
 * Returns its footprint as a collider (cars are cover for the player).
 */
export function createWreck(scene: THREE.Scene, x: number, z: number, yaw: number, color: number): Collider {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a0d10, roughness: 0.15, metalness: 0.6 });
  const rubber = new THREE.MeshLambertMaterial({ color: 0x0b0b0b });
  const rust = new THREE.MeshLambertMaterial({ color: 0x2a1a12 });

  const L = 4.3;
  const W = 1.78;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, 0.62, L), paint);
  body.position.y = 0.6;
  g.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.5, L * 0.48), paint);
  cabin.position.set(0, 1.15, -0.15);
  g.add(cabin);

  const glassBand = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.36, L * 0.46), glass);
  glassBand.position.set(0, 1.14, -0.15);
  g.add(glassBand);

  const sill = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.12, L * 0.6), rust);
  sill.position.y = 0.32;
  g.add(sill);

  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [
    [-W / 2 + 0.05, L * 0.32],
    [W / 2 - 0.05, L * 0.32],
    [-W / 2 + 0.05, -L * 0.32],
    [W / 2 - 0.05, -L * 0.32]
  ]) {
    const w = new THREE.Mesh(wheelGeo, rubber);
    w.position.set(wx, 0.26, wz); // flat tyres: axle below radius
    g.add(w);
  }

  g.position.set(x, 0, z);
  g.rotation.set(0, yaw, 0.03);
  scene.add(g);

  // axis-aligned footprint of the rotated car
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  const hx = (W / 2) * c + (L / 2) * s;
  const hz = (W / 2) * s + (L / 2) * c;
  return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz };
}
