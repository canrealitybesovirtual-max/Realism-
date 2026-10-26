import * as THREE from 'three';
import { build, type Kind } from './catalog';
import { dress, type Finish } from './materials';

/**
 * What the designer edits: your room (see realRoom.ts, built from the
 * headset's room scan) as Items with stable ids ("room.walls",
 * "room.floor", "real.couch-1", "room.sofa-3"), plus the furniture
 * catalog's pieces placed into it.
 */

/** there is one room: yours */
export type RoomId = 'room';
export interface Win { room: RoomId; centre: THREE.Vector3; normal: THREE.Vector3 /** into the room */; width: number }
export interface Room {
	id: RoomId; name: string;
	x0: number; z0: number; x1: number; z1: number;
	/** ceiling fill light */
	fill: THREE.PointLight;
	windows: Win[];
	/** points just inside each door (for "by the door") */
	doors: THREE.Vector3[];
	/** keep-clear zones: in front of doors, and your real furniture (x0, z0, x1, z1) */
	clear: [number, number, number, number][];
}

export interface Slot { meshes: THREE.Mesh[]; mat: THREE.MeshPhysicalMaterial }
export interface Item {
	id: string; name: string; kind: Kind | 'walls' | 'floor' | 'ceiling' | 'real';
	room: RoomId;
	object: THREE.Object3D;
	slots: Record<string, Slot>;
	/** walls, floors, ceilings and your real furniture stay where they are */
	fixed: boolean;
	mount: 'floor' | 'wall' | 'ceiling' | 'flat' | 'surface';
	light?: THREE.PointLight;
	/** the light's own intensity before room brightness */
	lightBase?: number;
	/** footprint half extents (x, z) and height, unrotated, for placement */
	half: [number, number]; height: number;
	/** a layer over a real surface ("original" shows the real one) */
	overlay?: boolean;
}

export interface House {
	root: THREE.Group;
	rooms: Record<RoomId, Room>;
	items: Map<string, Item>;
	/** where you arrive (the middle of the room) */
	spawn: { x: number; z: number; yaw: number };
	sun: THREE.DirectionalLight;
	hemi: THREE.HemisphereLight;
}


/** per-item finish slots: one material per slot, shared by the slot's meshes */
function slotsFrom(meshes: Record<string, THREE.Mesh[]>, finishes: Record<string, Finish>): Record<string, Slot> {
	const out: Record<string, Slot> = {};
	for (const [k, list] of Object.entries(meshes)) {
		const mat = dress(finishes[k] ?? { preset: 'paint' });
		for (const m of list) m.material = mat;
		out[k] = { meshes: list, mat };
	}
	return out;
}

/** place a catalog piece as an item */
export function makeItem(id: string, name: string, kind: Kind, room: RoomId, x: number, z: number, rotY = 0, finishes?: Record<string, Finish>, y = 0): Item {
	const p = build(kind);
	const slots = slotsFrom(p.slots, { ...p.defaults, ...(finishes ?? {}) });
	p.group.position.set(x, y, z); p.group.rotation.y = rotY;
	p.group.name = id; p.group.userData.homeItem = id;
	const bb = new THREE.Box3().setFromObject(p.group, true);
	const local = bb.clone().translate(new THREE.Vector3(-x, -y, -z));
	// footprint in the piece's own frame (unrotated)
	const rb = new THREE.Box3();
	p.group.updateMatrixWorld(true);
	const inv = new THREE.Matrix4().makeRotationY(-rotY);
	for (const c of [[local.min.x, local.min.z], [local.max.x, local.min.z], [local.min.x, local.max.z], [local.max.x, local.max.z]]) rb.expandByPoint(new THREE.Vector3(c[0], 0, c[1]).applyMatrix4(inv));
	const half: [number, number] = [Math.max(0.05, (rb.max.x - rb.min.x) / 2), Math.max(0.05, (rb.max.z - rb.min.z) / 2)];
	return { id, name, kind, room, object: p.group, slots, fixed: false, mount: p.mount, light: p.light, lightBase: p.light?.intensity, half, height: local.max.y };
}

/** colour temperature (kelvin) -> RGB, for "warmer" / "cooler" light */
export function kelvin(k: number): THREE.Color {
	const t = k / 100;
	let r: number, g: number, b: number;
	if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
	else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
	const c = (v: number) => Math.min(255, Math.max(0, v)) / 255;
	return new THREE.Color(c(r), c(g), c(b));
}
