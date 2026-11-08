import * as THREE from 'three';
import { ITEMS } from '../game/items';
import type { ItemId, Pickup } from '../types';

interface SpawnSpec {
  id: ItemId;
  x: number;
  z: number;
  y?: number; // surface height the item rests on
  yaw?: number;
}

/** A real-looking object per item type, resting on its surface (origin at the bottom). */
export function makeItemMesh(id: ItemId): THREE.Mesh {
  const def = ITEMS[id];
  let geo: THREE.BufferGeometry;
  switch (id) {
    case 'battery':
      geo = new THREE.CylinderGeometry(0.017, 0.017, 0.062, 12);
      geo.rotateZ(Math.PI / 2);
      geo.translate(0, 0.017, 0);
      break;
    case 'cloth':
      geo = new THREE.BoxGeometry(0.34, 0.025, 0.26);
      geo.translate(0, 0.0125, 0);
      break;
    case 'wood':
      geo = new THREE.BoxGeometry(0.75, 0.035, 0.11);
      geo.translate(0, 0.0175, 0);
      break;
    case 'wire':
      geo = new THREE.TorusGeometry(0.09, 0.012, 6, 18);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, 0.012, 0);
      break;
    case 'bandage':
      geo = new THREE.CylinderGeometry(0.035, 0.035, 0.07, 14);
      geo.translate(0, 0.035, 0);
      break;
    case 'fuse_part':
      geo = new THREE.CylinderGeometry(0.022, 0.022, 0.11, 10);
      geo.rotateZ(Math.PI / 2);
      geo.translate(0, 0.022, 0);
      break;
    default:
      geo = new THREE.BoxGeometry(0.2, 0.08, 0.14);
      geo.translate(0, 0.04, 0);
  }
  // Lit by the world like everything else; a faint self-glow so a sweep of the
  // flashlight (or the fuse's own glow) makes it catch the eye.
  const mat = new THREE.MeshStandardMaterial({
    color: def.color,
    roughness: id === 'battery' || id === 'wire' || id === 'fuse_part' ? 0.35 : 0.85,
    metalness: id === 'battery' || id === 'wire' ? 0.6 : 0,
    emissive: def.color,
    emissiveIntensity: id === 'fuse_part' ? 0.55 : 0.06
  });
  return new THREE.Mesh(geo, mat);
}

export function spawnPickups(scene: THREE.Scene): Pickup[] {
  const specs: SpawnSpec[] = [
    { id: 'battery', x: -6.6, z: 3.2, y: 0.15 },
    { id: 'battery', x: -7.0, z: 17.5, y: 0.15 },
    { id: 'battery', x: 0.5, z: -18.0 },
    { id: 'cloth', x: 4.5, z: 10.0, yaw: 0.6 },
    { id: 'wood', x: -3.5, z: -6.5, yaw: 1.1 },
    { id: 'wood', x: 3.8, z: 15.5, yaw: -0.4 },
    { id: 'cloth', x: 10.5, z: -2.5, yaw: 0.2 },
    { id: 'wire', x: 12.4, z: -2.4, y: 1.0 },
    { id: 'wire', x: 13.45, z: 2.5, y: 1.2 },
    { id: 'bandage', x: 13.45, z: 3.25, y: 1.2 },
    { id: 'bandage', x: 13.45, z: 1.75, y: 1.2 }
  ];

  const pickups: Pickup[] = [];
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    const mesh = makeItemMesh(s.id);
    mesh.position.set(s.x, s.y ?? 0, s.z);
    mesh.rotation.y = s.yaw ?? (i * 1.7) % Math.PI;
    mesh.name = `pickup:${s.id}:${i}`;
    scene.add(mesh);
    pickups.push({ itemId: s.id, mesh, taken: false });
  }
  return pickups;
}
