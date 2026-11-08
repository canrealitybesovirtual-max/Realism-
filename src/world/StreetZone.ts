import * as THREE from 'three';
import type { Collider } from '../types';
import { getTextures } from './textures';
import {
  createDebris,
  createRoadMarkings,
  createStreetlight,
  createWindows,
  createWreck,
  type Streetlight
} from './PropFactory';

export const Z_MIN = -22;
export const Z_MAX = 22;
const ROAD_HALF = 6;
const WALK_OUTER = 8;
const WALL_H = 9;
const DOOR_Z = 1; // shop doorway half-width at x = +8
const DOOR_H = 2.6;
export const GATE_HALF = 1.7; // opening in the north wall
const EXIT_LEN = 9; // alley beyond the gate

export interface StreetBuild {
  colliders: Collider[];
  sign: THREE.Mesh;
  streetlights: Streetlight[];
}

export function buildStreet(scene: THREE.Scene): StreetBuild {
  const colliders: Collider[] = [];
  const tex = getTextures();

  // ---- road (slightly glossy: reads as damp asphalt under the lamps) ----
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF * 2, Z_MAX - Z_MIN),
    new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.42, metalness: 0.05 })
  );
  road.rotation.x = -Math.PI / 2;
  scene.add(road);
  createRoadMarkings(scene, Z_MIN, Z_MAX);

  // ---- sidewalks + kerb (15 cm step) ----
  const walkGeo = new THREE.BoxGeometry(WALK_OUTER - ROAD_HALF, 0.15, Z_MAX - Z_MIN);
  const walkMat = new THREE.MeshLambertMaterial({ map: tex.sidewalk });
  const kerbMat = new THREE.MeshLambertMaterial({ color: 0x3a3d3f });
  const kerbGeo = new THREE.BoxGeometry(0.16, 0.16, Z_MAX - Z_MIN);
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(walkGeo, walkMat);
    w.position.set(side * (ROAD_HALF + (WALK_OUTER - ROAD_HALF) / 2), 0.075, 0);
    scene.add(w);
    const k = new THREE.Mesh(kerbGeo, kerbMat);
    k.position.set(side * (ROAD_HALF + 0.08), 0.08, 0);
    scene.add(k);
  }

  const wallMat = new THREE.MeshLambertMaterial({ map: tex.wall });

  // ---- left building facade (solid) ----
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, WALL_H, Z_MAX - Z_MIN), wallMat);
  leftWall.position.set(-WALK_OUTER - 0.2, WALL_H / 2, 0);
  scene.add(leftWall);
  colliders.push({ minX: -WALK_OUTER - 0.4, maxX: -WALK_OUTER, minZ: Z_MIN, maxZ: Z_MAX });

  // ---- right facade: two segments + lintel around the shop doorway ----
  const lenA = -DOOR_Z - Z_MIN;
  const segA = new THREE.Mesh(new THREE.BoxGeometry(0.4, WALL_H, lenA), wallMat);
  segA.position.set(WALK_OUTER + 0.2, WALL_H / 2, Z_MIN + lenA / 2);
  scene.add(segA);
  colliders.push({ minX: WALK_OUTER, maxX: WALK_OUTER + 0.4, minZ: Z_MIN, maxZ: -DOOR_Z });

  const lenB = Z_MAX - DOOR_Z;
  const segB = new THREE.Mesh(new THREE.BoxGeometry(0.4, WALL_H, lenB), wallMat);
  segB.position.set(WALK_OUTER + 0.2, WALL_H / 2, DOOR_Z + lenB / 2);
  scene.add(segB);
  colliders.push({ minX: WALK_OUTER, maxX: WALK_OUTER + 0.4, minZ: DOOR_Z, maxZ: Z_MAX });

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.4, WALL_H - DOOR_H, DOOR_Z * 2), wallMat);
  lintel.position.set(WALK_OUTER + 0.2, DOOR_H + (WALL_H - DOOR_H) / 2, 0);
  scene.add(lintel);

  // door frame
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x1b1714 });
  for (const z of [-DOOR_Z, DOOR_Z]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.46, DOOR_H, 0.1), frameMat);
    jamb.position.set(WALK_OUTER + 0.2, DOOR_H / 2, z);
    scene.add(jamb);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, DOOR_Z * 2 + 0.1), frameMat);
  head.position.set(WALK_OUTER + 0.2, DOOR_H, 0);
  scene.add(head);

  // ---- south end wall (solid) ----
  const endGeo = new THREE.BoxGeometry(WALK_OUTER * 2 + 0.8, WALL_H, 0.4);
  const south = new THREE.Mesh(endGeo, wallMat);
  south.position.set(0, WALL_H / 2, Z_MAX);
  scene.add(south);
  colliders.push({ minX: -WALK_OUTER, maxX: WALK_OUTER, minZ: Z_MAX - 0.2, maxZ: Z_MAX + 0.2 });

  // ---- north end wall with the gate opening ----
  const sideLen = WALK_OUTER + 0.4 - GATE_HALF;
  const northGeo = new THREE.BoxGeometry(sideLen, WALL_H, 0.4);
  for (const s of [-1, 1]) {
    const seg = new THREE.Mesh(northGeo, wallMat);
    seg.position.set(s * (GATE_HALF + sideLen / 2), WALL_H / 2, Z_MIN);
    scene.add(seg);
    colliders.push({
      minX: s < 0 ? -WALK_OUTER - 0.4 : GATE_HALF,
      maxX: s < 0 ? -GATE_HALF : WALK_OUTER + 0.4,
      minZ: Z_MIN - 0.2,
      maxZ: Z_MIN + 0.2
    });
  }
  const over = new THREE.Mesh(new THREE.BoxGeometry(GATE_HALF * 2, WALL_H - 3.3, 0.4), wallMat);
  over.position.set(0, 3.3 + (WALL_H - 3.3) / 2, Z_MIN);
  scene.add(over);

  // ---- alley beyond the gate (the way out) ----
  const alleyFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(GATE_HALF * 2 + 0.4, EXIT_LEN),
    new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.5 })
  );
  alleyFloor.rotation.x = -Math.PI / 2;
  alleyFloor.position.set(0, 0.001, Z_MIN - EXIT_LEN / 2);
  scene.add(alleyFloor);
  const alleyWallGeo = new THREE.BoxGeometry(0.4, WALL_H, EXIT_LEN);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(alleyWallGeo, wallMat);
    w.position.set(s * (GATE_HALF + 0.4), WALL_H / 2, Z_MIN - EXIT_LEN / 2);
    scene.add(w);
    colliders.push({
      minX: s * (GATE_HALF + 0.4) - 0.2,
      maxX: s * (GATE_HALF + 0.4) + 0.2,
      minZ: Z_MIN - EXIT_LEN,
      maxZ: Z_MIN
    });
  }
  colliders.push({ minX: -GATE_HALF - 0.6, maxX: GATE_HALF + 0.6, minZ: Z_MIN - EXIT_LEN - 0.4, maxZ: Z_MIN - EXIT_LEN });

  // ---- streetlights: all three work, one is failing ----
  const streetlights: Streetlight[] = [];
  for (const [x, z, right] of [
    [-7.2, -16, true],
    [7.2, -8, false],
    [-7.2, 0, true],
    [7.2, 15, false],
    [-7.2, 12, true]
  ] as const) {
    const sl = createStreetlight(x, z, right);
    scene.add(sl.group);
    scene.add(sl.light);
    streetlights.push(sl);
    colliders.push({ minX: x - 0.18, maxX: x + 0.18, minZ: z - 0.18, maxZ: z + 0.18 });
  }

  // ---- windows ----
  createWindows(scene, -1, Z_MIN + 1, Z_MAX - 1, 3);
  createWindows(scene, 1, Z_MIN + 1, -DOOR_Z - 1, 3);
  createWindows(scene, 1, DOOR_Z + 1, Z_MAX - 1, 3);

  // ---- abandoned cars (cover) ----
  colliders.push(createWreck(scene, -3.0, -1.6, 0.12, 0x2b3236));
  colliders.push(createWreck(scene, 3.0, 4.0, -0.18, 0x3a2a24));

  // ---- debris ----
  createDebris(scene);

  // ---- shop sign above the doorway (faces the street) ----
  const signMat = new THREE.MeshBasicMaterial({ color: 0xaa4422, fog: false });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.38), signMat);
  sign.position.set(WALK_OUTER - 0.02, 3.85, 0);
  sign.rotation.y = -Math.PI / 2;
  sign.name = 'shopSign';
  scene.add(sign);

  return { colliders, sign, streetlights };
}
