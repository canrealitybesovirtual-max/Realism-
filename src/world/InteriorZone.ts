import * as THREE from 'three';
import type { Collider } from '../types';
import { getTextures } from './textures';

export const SHOP = { minX: 8.4, maxX: 14, minZ: -4, maxZ: 4, height: 3.2 } as const;

export interface InteriorBuild {
  colliders: Collider[];
  bulb: THREE.PointLight;
  bulbMesh: THREE.Mesh;
}

export function buildInterior(scene: THREE.Scene): InteriorBuild {
  const colliders: Collider[] = [];
  const tex = getTextures();
  const { minX, maxX, minZ, maxZ, height } = SHOP;
  const cx = (minX + maxX) / 2;

  // ---- floor / ceiling ----
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
    new THREE.MeshLambertMaterial({ map: tex.wood })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.012, 0);
  scene.add(floor);

  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
    new THREE.MeshLambertMaterial({ map: tex.plaster, color: 0x777777 })
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, height, 0);
  scene.add(ceil);

  const plasterMat = new THREE.MeshLambertMaterial({ map: tex.plaster });

  // ---- back wall ----
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, height, maxZ - minZ + 0.4), plasterMat);
  back.position.set(maxX + 0.2, height / 2, 0);
  scene.add(back);
  colliders.push({ minX: maxX, maxX: maxX + 0.4, minZ, maxZ });

  // ---- side walls ----
  const sideGeo = new THREE.BoxGeometry(maxX - minX, height, 0.4);
  for (const z of [minZ, maxZ]) {
    const wall = new THREE.Mesh(sideGeo, plasterMat);
    wall.position.set(cx, height / 2, z);
    scene.add(wall);
    colliders.push({ minX: minX - 0.4, maxX, minZ: z - 0.2, maxZ: z + 0.2 });
  }

  // ---- counter (top at 1.0 m) ----
  const woodMat = new THREE.MeshLambertMaterial({ map: tex.wood, color: 0x9a9a9a });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.95, 3.0), woodMat);
  counter.position.set(12.4, 0.475, -2.2);
  scene.add(counter);
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.05, 3.1),
    new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.5 })
  );
  top.position.set(12.4, 0.975, -2.2);
  scene.add(top);
  colliders.push({ minX: 11.75, maxX: 13.05, minZ: -3.75, maxZ: -0.65 });

  // old till on the counter
  const till = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.22, 0.34),
    new THREE.MeshLambertMaterial({ color: 0x1d2022 })
  );
  till.position.set(12.4, 1.11, -3.1);
  till.rotation.y = 0.3;
  scene.add(till);

  // ---- waist-high cabinet against the back wall (items sit on top) ----
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.2, 2.4), woodMat);
  cabinet.position.set(13.45, 0.6, 2.5);
  scene.add(cabinet);
  colliders.push({ minX: 13.15, maxX: 13.75, minZ: 1.28, maxZ: 3.72 });

  // ---- a bare bulb on a cord: the only light in here ----
  const bulbMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe2b0 })
  );
  bulbMesh.position.set(11, 2.55, 0);
  scene.add(bulbMesh);
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, height - 2.6, 4),
    new THREE.MeshBasicMaterial({ color: 0x111111 })
  );
  cord.position.set(11, 2.6 + (height - 2.6) / 2, 0);
  scene.add(cord);

  const bulb = new THREE.PointLight(0xffd59a, 5, 8, 2);
  bulb.position.set(11, 2.5, 0);
  scene.add(bulb);

  return { colliders, bulb, bulbMesh };
}
