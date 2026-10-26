import * as THREE from 'three';
import { build, metreUV, type Kind } from './catalog';
import { dress, type Finish } from './materials';

/**
 * The house: a living room, an open kitchen / dining room and a bedroom,
 * built procedurally in house-local metres (x right, y up, the front of the
 * house along z = 0, rooms toward -z). Every wall set, floor, ceiling, door
 * and piece of furniture is an Item with a stable id ("living.sofa",
 * "kitchen.walls", "door.bedroom") that the designer targets.
 */

export type RoomId = 'living' | 'kitchen' | 'bedroom';
export const ROOM_NAMES: Record<RoomId, string> = { living: 'living room', kitchen: 'kitchen', bedroom: 'bedroom' };
export const H = 2.7;           // ceiling height
const T = 0.12;                 // wall thickness (each room's own leaf)

export interface Opening { at: number; width: number; y0: number; y1: number; kind: 'door' | 'window' | 'arch'; outside?: boolean }
export interface Win { room: RoomId; centre: THREE.Vector3; normal: THREE.Vector3 /** into the room */; width: number }
export interface Room {
	id: RoomId; name: string;
	x0: number; z0: number; x1: number; z1: number;
	/** ceiling fill light */
	fill: THREE.PointLight;
	windows: Win[];
	/** keep-clear zones in front of doors and openings (x0, z0, x1, z1) */
	clear: [number, number, number, number][];
}

export interface Slot { meshes: THREE.Mesh[]; mat: THREE.MeshPhysicalMaterial }
export interface Item {
	id: string; name: string; kind: Kind | 'walls' | 'floor' | 'ceiling' | 'door' | 'real';
	room: RoomId;
	object: THREE.Object3D;
	slots: Record<string, Slot>;
	/** walls, floors, ceilings and doors stay where they are */
	fixed: boolean;
	mount: 'floor' | 'wall' | 'ceiling' | 'flat' | 'surface';
	light?: THREE.PointLight;
	/** the light's own intensity before room brightness */
	lightBase?: number;
	/** footprint half extents (x, z) and height, unrotated, for placement */
	half: [number, number]; height: number;
	/** collision boxes in item space (walls have one per segment) */
	boxes?: { c: THREE.Vector3; h: THREE.Vector3 }[];
	/** doors: the leaf that swings, open or not */
	door?: { leaf: THREE.Object3D; open: boolean; t: number; hinge: number; exit?: boolean };
	/** AR: a painted layer over a real surface ("original" shows the real one) */
	overlay?: boolean;
}

export interface House {
	root: THREE.Group;
	rooms: Record<RoomId, Room>;
	items: Map<string, Item>;
	/** where you arrive (by the front door, looking in) */
	spawn: { x: number; z: number; yaw: number };
	sun: THREE.DirectionalLight;
	hemi: THREE.HemisphereLight;
}

const box = (w: number, h: number, d: number) => metreUV(new THREE.BoxGeometry(w, h, d));

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

/** wall leaf from a to b (house metres, along x or z) with openings, inset into the room by T/2 */
function wallRun(group: THREE.Group, boxes: Item['boxes'], a: [number, number], b: [number, number], inward: [number, number], openings: Opening[]) {
	const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
	const along = Math.abs(dx) > 0.5; // runs along x
	const seg = (s0: number, s1: number, y0: number, y1: number) => {
		if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
		const cx = a[0] + dx * (s0 + s1) / 2 + inward[0] * T / 2, cz = a[1] + dz * (s0 + s1) / 2 + inward[1] * T / 2;
		const w = s1 - s0, g = along ? box(w, y1 - y0, T) : box(T, y1 - y0, w);
		// UVs in house metres so wallpaper / brick line up across segments
		g.translate(cx, (y0 + y1) / 2, cz); metreUV(g); g.translate(-cx, -(y0 + y1) / 2, -cz);
		const m = new THREE.Mesh(g); m.position.set(cx, (y0 + y1) / 2, cz); m.castShadow = true; m.receiveShadow = true;
		group.add(m);
		boxes!.push({ c: new THREE.Vector3(cx, (y0 + y1) / 2, cz), h: along ? new THREE.Vector3(w / 2, (y1 - y0) / 2, T / 2) : new THREE.Vector3(T / 2, (y1 - y0) / 2, w / 2) });
	};
	const ops = [...openings].sort((p, q) => p.at - q.at);
	let s = 0;
	for (const o of ops) {
		const o0 = o.at - o.width / 2, o1 = o.at + o.width / 2;
		seg(s, o0, 0, H);
		seg(o0, o1, 0, o.y0);
		seg(o0, o1, o.y1, H);
		s = o1;
	}
	seg(s, len, 0, H);
}

export function buildHouse(): House {
	const root = new THREE.Group(); root.name = 'home';
	const items = new Map<string, Item>();
	const rooms = {} as Record<RoomId, Room>;
	const add = (it: Item) => { items.set(it.id, it); root.add(it.object); return it; };

	const R: Record<RoomId, [number, number, number, number]> = { living: [0, -6, 7, 0], kitchen: [7, -6, 11.5, 0], bedroom: [0, -10.5, 5, -6] };
	// openings per room wall: [x0,z0]->[x1,z1] runs, with positions along the run (metres from its start)
	const DOOR = (at: number, extra: Partial<Opening> = {}): Opening => ({ at, width: 0.92, y0: 0, y1: 2.1, kind: 'door', ...extra });
	const WIN = (at: number, width: number): Opening => ({ at, width, y0: 0.85, y1: 2.25, kind: 'window', outside: true });
	const ARCH = (at: number, width: number): Opening => ({ at, width, y0: 0, y1: 2.35, kind: 'arch' });
	const walls: Record<RoomId, { a: [number, number]; b: [number, number]; open: Opening[] }[]> = {
		living: [
			{ a: [0, 0], b: [7, 0], open: [WIN(1.8, 1.6), WIN(4.1, 1.4), DOOR(6.05, { outside: true })] },
			{ a: [0, -6], b: [0, 0], open: [WIN(3.2, 1.6)] },
			{ a: [0, -6], b: [7, -6], open: [DOOR(4.05)] },
			{ a: [7, -6], b: [7, 0], open: [ARCH(3.0, 3.0)] },
		],
		kitchen: [
			{ a: [7, 0], b: [11.5, 0], open: [WIN(2.25, 1.8)] },
			{ a: [11.5, -6], b: [11.5, 0], open: [WIN(3.0, 1.6)] },
			{ a: [7, -6], b: [11.5, -6], open: [] },
			{ a: [7, -6], b: [7, 0], open: [ARCH(3.0, 3.0)] },
		],
		bedroom: [
			{ a: [0, -6], b: [5, -6], open: [DOOR(4.05)] },
			{ a: [0, -10.5], b: [0, -6], open: [WIN(2.25, 1.4)] },
			{ a: [0, -10.5], b: [5, -10.5], open: [WIN(2.3, 1.8)] },
			{ a: [5, -10.5], b: [5, -6], open: [] },
		],
	};
	const WALL_FINISH: Record<RoomId, Finish> = { living: { preset: 'paint', color: '#e8e2d6' }, kitchen: { preset: 'paint', color: '#eeeae2' }, bedroom: { preset: 'paint', color: '#dcd6cc' } };
	const FLOOR_FINISH: Record<RoomId, Finish> = { living: { preset: 'oak' }, kitchen: { preset: 'white tile', color: '#ece9e3' }, bedroom: { preset: 'oak' } };
	const wins: Win[] = [];

	for (const id of Object.keys(R) as RoomId[]) {
		const [x0, z0, x1, z1] = R[id];
		const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
		// walls
		const wg = new THREE.Group(); wg.name = id + '.walls';
		const boxes: Item['boxes'] = [];
		for (const w of walls[id]) {
			const mid: [number, number] = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
			const inward: [number, number] = Math.abs(w.a[1] - w.b[1]) < 1e-6 ? [0, Math.sign(cz - mid[1])] : [Math.sign(cx - mid[0]), 0];
			wallRun(wg, boxes, w.a, w.b, inward, w.open);
			const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), dx = (w.b[0] - w.a[0]) / len, dz = (w.b[1] - w.a[1]) / len;
			for (const o of w.open) if (o.kind === 'window') wins.push({ room: id, centre: new THREE.Vector3(w.a[0] + dx * o.at + inward[0] * T, (o.y0 + o.y1) / 2, w.a[1] + dz * o.at + inward[1] * T), normal: new THREE.Vector3(inward[0], 0, inward[1]), width: o.width });
		}
		const wallMat = dress(WALL_FINISH[id]);
		wg.traverse((m) => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).material = wallMat; });
		const wallMeshes: THREE.Mesh[] = []; wg.traverse((m) => { if ((m as THREE.Mesh).isMesh) wallMeshes.push(m as THREE.Mesh); });
		add({ id: id + '.walls', name: ROOM_NAMES[id] + ' walls', kind: 'walls', room: id, object: wg, slots: { main: { meshes: wallMeshes, mat: wallMat } }, fixed: true, mount: 'surface', half: [0, 0], height: H, boxes });
		// floor and ceiling
		const fg = box(x1 - x0, 0.04, z1 - z0); fg.translate(cx, -0.02, cz); metreUV(fg); fg.translate(-cx, 0.02, -cz);
		const floor = new THREE.Mesh(fg, dress(FLOOR_FINISH[id])); floor.position.set(cx, -0.02, cz); floor.receiveShadow = true; floor.name = id + '.floor';
		add({ id: id + '.floor', name: ROOM_NAMES[id] + ' floor', kind: 'floor', room: id, object: floor, slots: { main: { meshes: [floor], mat: floor.material as THREE.MeshPhysicalMaterial } }, fixed: true, mount: 'surface', half: [0, 0], height: 0, boxes: [{ c: new THREE.Vector3(cx, -0.05, cz), h: new THREE.Vector3((x1 - x0) / 2, 0.05, (z1 - z0) / 2) }] });
		const cg = box(x1 - x0, 0.04, z1 - z0); cg.translate(cx, H + 0.02, cz); metreUV(cg); cg.translate(-cx, -H - 0.02, -cz);
		const ceil = new THREE.Mesh(cg, dress({ preset: 'paint', color: '#f4f2ee' })); ceil.position.set(cx, H + 0.02, cz); ceil.name = id + '.ceiling'; ceil.receiveShadow = true;
		add({ id: id + '.ceiling', name: ROOM_NAMES[id] + ' ceiling', kind: 'ceiling', room: id, object: ceil, slots: { main: { meshes: [ceil], mat: ceil.material as THREE.MeshPhysicalMaterial } }, fixed: true, mount: 'surface', half: [0, 0], height: 0 });
		const fill = new THREE.PointLight(0xfff0dc, 6, 14, 1.6); fill.position.set(cx, H - 0.3, cz); fill.name = id + '.fill';
		root.add(fill);
		rooms[id] = { id, name: ROOM_NAMES[id], x0, z0, x1, z1, fill, windows: [], clear: [] };
	}
	for (const w of wins) rooms[w.room].windows.push(w);
	// keep-clear zones in front of doors and the arch
	rooms.living.clear.push([5.4, -1.3, 6.7, 0], [3.4, -6, 4.7, -4.8], [5.8, -4.6, 7, -1.4]);
	rooms.kitchen.clear.push([7, -4.6, 8.2, -1.4]);
	rooms.bedroom.clear.push([3.4, -7.2, 4.7, -6]);

	// windows: glass and frames, once per opening (from the room side)
	const glassMat = dress({ preset: 'glass' }), frameMat = dress({ preset: 'paint', color: '#f4f2ee' });
	for (const w of wins) {
		const along = Math.abs(w.normal.z) > 0.5;
		const g = new THREE.Mesh(along ? new THREE.BoxGeometry(w.width, 1.4, 0.02) : new THREE.BoxGeometry(0.02, 1.4, w.width), glassMat);
		g.position.copy(w.centre).addScaledVector(w.normal, -T * 0.5); root.add(g);
		for (const [ox, oy, sx, sy] of [[0, 0.71, w.width + 0.08, 0.06], [0, -0.71, w.width + 0.08, 0.06], [-w.width / 2 - 0.02, 0, 0.06, 1.48], [w.width / 2 + 0.02, 0, 0.06, 1.48], [0, 0, 0.04, 1.4]] as const) {
			const f = new THREE.Mesh(along ? new THREE.BoxGeometry(sx, sy, 0.08) : new THREE.BoxGeometry(0.08, sy, sx), frameMat);
			f.position.copy(w.centre).addScaledVector(w.normal, -T * 0.5); f.position.y += oy;
			if (along) f.position.x += ox; else f.position.z += ox;
			f.castShadow = true; root.add(f);
		}
	}

	// doors: the bedroom door and the front door (which takes you back to the studio)
	const doorFinish: Finish = { preset: 'lacquer', color: '#f2efe9' };
	const mkDoor = (id: string, name: string, room: RoomId, hingeX: number, z: number, exit: boolean) => {
		const pivot = new THREE.Group(); pivot.position.set(hingeX, 0, z); pivot.name = id;
		const leaf = new THREE.Group(); pivot.add(leaf);
		const slab = new THREE.Mesh(box(0.9, 2.08, 0.045)); slab.position.set(0.45, 1.04, 0); slab.castShadow = true; slab.receiveShadow = true; leaf.add(slab);
		const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 10)); knob.position.set(0.8, 1.0, 0.05); leaf.add(knob);
		const knob2 = knob.clone(); knob2.position.z = -0.05; leaf.add(knob2);
		const mat = dress(doorFinish), km = dress({ preset: 'brass' });
		slab.material = mat; knob.material = km; knob2.material = km;
		const it: Item = { id, name, kind: 'door', room, object: pivot, slots: { main: { meshes: [slab], mat }, handle: { meshes: [knob, knob2], mat: km } }, fixed: true, mount: 'surface', half: [0.45, 0.03], height: 2.1, door: { leaf, open: false, t: 0, hinge: hingeX, exit } };
		return add(it);
	};
	mkDoor('door.front', 'front door', 'living', 5.59, -0.06, true);
	mkDoor('door.bedroom', 'bedroom door', 'living', 3.59, -6.0, false);

	// furniture
	const put = (id: string, name: string, kind: Kind, room: RoomId, x: number, z: number, rot = 0, f?: Record<string, Finish>, y = 0) => add(makeItem(id, name, kind, room, x, z, rot, f, y));
	put('living.rug', 'rug', 'rug', 'living', 2.6, -3.0);
	put('living.sofa', 'sofa', 'sofa', 'living', 2.6, -1.35, Math.PI);
	put('living.armchair', 'armchair', 'armchair', 'living', 0.95, -3.2, Math.PI / 2);
	put('living.coffee-table', 'coffee table', 'coffee table', 'living', 2.6, -2.75);
	put('living.side-table', 'side table', 'side table', 'living', 4.05, -1.25);
	put('living.floor-lamp', 'floor lamp', 'floor lamp', 'living', 0.55, -1.0);
	put('living.tv', 'TV stand', 'tv stand', 'living', 2.6, -5.7);
	put('living.bookshelf', 'bookshelf', 'bookshelf', 'living', 6.6, -5.7, 0);
	put('living.plant', 'plant', 'plant', 'living', 5.0, -5.5);
	put('living.artwork', 'artwork', 'artwork', 'living', 0.08, -4.6, Math.PI / 2);
	put('kitchen.counter', 'kitchen counter', 'kitchen counter', 'kitchen', 9.85, -5.62);
	put('kitchen.fridge', 'fridge', 'fridge', 'kitchen', 11.05, -5.6);
	put('kitchen.table', 'dining table', 'dining table', 'kitchen', 9.3, -2.2, Math.PI / 2);
	for (const [i, x, z, r] of [[1, 8.75, -2.75, Math.PI / 2], [2, 8.75, -1.65, Math.PI / 2], [3, 9.85, -2.75, -Math.PI / 2], [4, 9.85, -1.65, -Math.PI / 2]] as const) put(`kitchen.chair-${i}`, `dining chair ${i}`, 'dining chair', 'kitchen', x, z, r);
	put('kitchen.pendant', 'pendant light', 'pendant light', 'kitchen', 9.3, -2.2, 0, undefined, H);
	put('kitchen.plant', 'kitchen plant', 'plant', 'kitchen', 11.05, -0.5);
	put('bedroom.bed', 'bed', 'bed', 'bedroom', 2.3, -9.35);
	put('bedroom.nightstand-1', 'left nightstand', 'nightstand', 'bedroom', 1.1, -10.2);
	put('bedroom.nightstand-2', 'right nightstand', 'nightstand', 'bedroom', 3.5, -10.2);
	put('bedroom.lamp', 'bedside lamp', 'table lamp', 'bedroom', 1.1, -10.2, 0, undefined, 0.56);
	put('bedroom.wardrobe', 'wardrobe', 'wardrobe', 'bedroom', 4.62, -8.0, -Math.PI / 2);
	put('bedroom.desk', 'desk', 'desk', 'bedroom', 0.45, -7.1, Math.PI / 2);
	put('bedroom.artwork', 'bedroom artwork', 'artwork', 'bedroom', 2.3, -10.42, 0, undefined, 0.35);

	// outside: garden and sky light through the windows
	const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x6f8a55, roughness: 1 }));
	ground.rotation.x = -Math.PI / 2; ground.position.set(5, -0.06, -5); ground.receiveShadow = true; root.add(ground);
	const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x4d6b3c, roughness: 1 });
	for (const [x, z, w, d] of [[5, 6, 30, 1.2], [-8, -5, 1.2, 30], [18, -5, 1.2, 30]] as const) { const hd = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, d), hedgeMat); hd.position.set(x, 0.8, z); root.add(hd); }
	const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
	sun.position.set(14, 18, 12); sun.target.position.set(5, 0, -5); sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 60; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
	root.add(sun, sun.target);
	const hemi = new THREE.HemisphereLight(0xdfe9f5, 0x8a7c66, 0.6); root.add(hemi);

	return { root, rooms, items, spawn: { x: 6.05, z: -1.0, yaw: 0 }, sun, hemi };
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
