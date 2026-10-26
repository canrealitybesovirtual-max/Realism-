import * as THREE from 'three';
import { metreUV } from './catalog';
import { dress } from './materials';
import type { House, Item, Room, RoomId, Win } from './house';

/**
 * Your real room, from the headset's own room scan (WebXR plane and mesh
 * detection: the walls, floor, ceiling, windows, doors and furniture you
 * marked in the headset's Space Setup), or from corners you trace on the
 * floor when the scan is not available.
 *
 * It becomes a House the designer can edit like the model house:
 * - the walls, floor and ceiling are overlays that start out invisible (the
 *   "original" finish shows your real surface through the passthrough) and
 *   can be painted, tiled, floored...;
 * - windows and doors are holes in the wall overlays, and anchors for
 *   "beside the window";
 * - real furniture is a fixed item (you can put things beside it, not
 *   repaint it) whose footprint keeps new furniture clear of it, and whose
 *   box hides the overlays behind it (depth only), so painted walls do not
 *   cover your real sofa;
 * - added furniture is ordinary virtual furniture.
 *
 * Coordinates: the room frame. Origin on the floor, y up, x along the
 * room's longest floor edge; the frame's pose in the XR reference space is
 * kept by a (persistent, where supported) anchor so a saved design comes
 * back in the same place next time.
 */

export interface ScanWall { a: [number, number]; b: [number, number]; y0: number; y1: number }
export interface ScanOpening { kind: 'window' | 'door'; a: [number, number]; b: [number, number]; y0: number; y1: number }
export interface ScanObject { label: string; x: number; z: number; hx: number; hz: number; rot: number; h: number }
/** a room in its own frame (metres) */
export interface Scan { floor: [number, number][]; height: number; walls: ScanWall[]; openings: ScanOpening[]; objects: ScanObject[]; source: 'scan' | 'traced' | 'test' }

/** what each scene-understanding label is called when you talk about it */
const LABEL_NAMES: Record<string, string> = {
	couch: 'couch', sofa: 'couch', table: 'table', bed: 'bed', screen: 'TV', storage: 'cabinet', lamp: 'lamp', plant: 'plant', 'wall art': 'picture',
	shelf: 'shelf', desk: 'desk', chair: 'chair', other: 'object',
};
const IGNORE = new Set(['floor', 'ceiling', 'wall', 'global mesh', 'invisible wall face', 'door frame', 'window frame', 'inner wall face', 'wall face']);

// ------------------------------------------------------------------ from WebXR
interface RefPlane { label: string; pts: THREE.Vector3[]; normal: THREE.Vector3; m: THREE.Matrix4; local: THREE.Vector3[] }

/**
 * Read the headset's room scan in reference-space coordinates. Returns null
 * until a floor is known.
 */
export function readXRScan(frame: XRFrame, ref: XRReferenceSpace): { floorY: number; floor: THREE.Vector3[]; planes: RefPlane[]; boxes: { label: string; c: THREE.Vector3; hx: number; hz: number; rot: number; top: number }[] } | null {
	const planes: RefPlane[] = [];
	const set = (frame as any).detectedPlanes as Set<any> | undefined;
	for (const p of set ?? []) {
		const pose = frame.getPose(p.planeSpace, ref); if (!pose) continue;
		const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
		const local = (p.polygon as DOMPointReadOnly[]).map((q) => new THREE.Vector3(q.x, q.y, q.z));
		const pts = local.map((q) => q.clone().applyMatrix4(m));
		const normal = new THREE.Vector3(0, 1, 0).transformDirection(m);
		const avgY = pts.reduce((s, q) => s + q.y, 0) / Math.max(1, pts.length);
		const label = (p.semanticLabel as string | undefined)?.toLowerCase() || (p.orientation === 'horizontal' ? (avgY < 0.3 ? 'floor' : avgY > 1.9 ? 'ceiling' : 'table') : 'wall');
		planes.push({ label, pts, normal, m, local });
	}
	const floors = planes.filter((p) => p.label === 'floor');
	if (!floors.length) return null;
	const area = (p: RefPlane) => { let a = 0; for (let i = 0; i < p.pts.length; i++) { const u = p.pts[i], v = p.pts[(i + 1) % p.pts.length]; a += u.x * v.z - v.x * u.z; } return Math.abs(a / 2); };
	const floor = floors.reduce((a, b) => (area(a) > area(b) ? a : b));
	const floorY = floor.pts.reduce((s, q) => s + q.y, 0) / floor.pts.length;
	const boxes: { label: string; c: THREE.Vector3; hx: number; hz: number; rot: number; top: number }[] = [];
	// table tops, couch seats... reported as horizontal planes
	for (const p of planes) {
		if (IGNORE.has(p.label) || Math.abs(p.normal.y) < 0.8) continue;
		const b = new THREE.Box3().setFromPoints(p.local);
		const c = b.getCenter(new THREE.Vector3()).applyMatrix4(p.m);
		const ax = new THREE.Vector3(1, 0, 0).transformDirection(p.m);
		boxes.push({ label: p.label, c, hx: (b.max.x - b.min.x) / 2, hz: (b.max.z - b.min.z) / 2, rot: Math.atan2(-ax.z, ax.x), top: c.y });
	}
	// furniture volumes reported as meshes
	const meshes = (frame as any).detectedMeshes as Set<any> | undefined;
	for (const mesh of meshes ?? []) {
		const label = (mesh.semanticLabel as string | undefined)?.toLowerCase() ?? 'other';
		if (IGNORE.has(label)) continue;
		const pose = frame.getPose(mesh.meshSpace, ref); if (!pose) continue;
		const m = new THREE.Matrix4().fromArray(pose.transform.matrix), v = mesh.vertices as Float32Array;
		if (!v?.length) continue;
		const b = new THREE.Box3();
		for (let i = 0; i < v.length; i += 3) b.expandByPoint(new THREE.Vector3(v[i], v[i + 1], v[i + 2]));
		const c = b.getCenter(new THREE.Vector3()).applyMatrix4(m);
		const ax = new THREE.Vector3(1, 0, 0).transformDirection(m), up = new THREE.Vector3(0, 1, 0).transformDirection(m);
		// volumes are usually upright boxes: footprint from the box's horizontal axes
		const size = b.getSize(new THREE.Vector3());
		const hor = Math.abs(up.y) > 0.7;
		const top = hor ? c.y + size.y / 2 : c.y + size.z / 2;
		boxes.push({ label, c, hx: size.x / 2, hz: (hor ? size.z : size.y) / 2, rot: Math.atan2(-ax.z, ax.x), top });
	}
	return { floorY, floor: floor.pts, planes, boxes };
}

/** the room frame from a floor outline: centre of the outline, x along the longest edge */
export function frameFromFloor(floor: { x: number; z: number }[], y = 0): { origin: THREE.Vector3; yaw: number } {
	let cx = 0, cz = 0;
	for (const p of floor) { cx += p.x; cz += p.z; }
	cx /= floor.length; cz /= floor.length;
	let best = -1, yaw = 0;
	for (let i = 0; i < floor.length; i++) {
		const a = floor[i], b = floor[(i + 1) % floor.length], l = Math.hypot(b.x - a.x, b.z - a.z);
		if (l > best) { best = l; yaw = Math.atan2(-(b.z - a.z), b.x - a.x); }
	}
	// the same edge read in either direction gives the same frame
	yaw = ((yaw % Math.PI) + Math.PI) % Math.PI;
	return { origin: new THREE.Vector3(cx, y, cz), yaw };
}

/** reference-space scan -> room-frame Scan */
export function scanToFrame(raw: NonNullable<ReturnType<typeof readXRScan>>, origin: THREE.Vector3, yaw: number): Scan {
	const inv = new THREE.Matrix4().makeRotationY(yaw).setPosition(origin).invert();
	const P = (v: THREE.Vector3) => v.clone().applyMatrix4(inv);
	const xz = (v: THREE.Vector3): [number, number] => { const q = P(v); return [q.x, q.z]; };
	const floor = raw.floor.map(xz);
	const ceil = raw.planes.filter((p) => p.label === 'ceiling');
	const height = ceil.length ? Math.max(2, Math.min(5, ceil[0].pts.reduce((s, q) => s + q.y, 0) / ceil[0].pts.length - raw.floorY)) : 2.5;
	const vertical = (p: RefPlane) => {
		const n = p.normal.clone(); n.y = 0; n.normalize();
		const t = new THREE.Vector3(-n.z, 0, n.x);
		const c = p.pts.reduce((s, q) => s.add(q), new THREE.Vector3()).multiplyScalar(1 / p.pts.length);
		let lo = Infinity, hi = -Infinity, y0 = Infinity, y1 = -Infinity;
		for (const q of p.pts) { const d = q.clone().sub(c).dot(t); lo = Math.min(lo, d); hi = Math.max(hi, d); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
		return { a: xz(c.clone().addScaledVector(t, lo)), b: xz(c.clone().addScaledVector(t, hi)), y0: y0 - raw.floorY, y1: y1 - raw.floorY };
	};
	const walls = raw.planes.filter((p) => p.label === 'wall' && Math.abs(p.normal.y) < 0.3).map(vertical);
	const openings = raw.planes.filter((p) => (p.label === 'window frame' || p.label === 'door frame') && Math.abs(p.normal.y) < 0.3)
		.map((p) => ({ kind: p.label === 'door frame' ? 'door' as const : 'window' as const, ...vertical(p) }));
	const objects: ScanObject[] = [];
	for (const b of raw.boxes) {
		const c = P(b.c), name = LABEL_NAMES[b.label] ?? b.label;
		const o = { label: name, x: c.x, z: c.z, hx: Math.max(0.1, b.hx), hz: Math.max(0.1, b.hz), rot: b.rot - yaw, h: Math.max(0.05, b.top - raw.floorY) };
		// a table reported as a plane and as a volume: keep one
		const dup = objects.find((q) => q.label === o.label && Math.hypot(q.x - o.x, q.z - o.z) < 0.4);
		if (dup) { if (o.h > dup.h) Object.assign(dup, o); continue; }
		objects.push(o);
	}
	return { floor, height, walls, openings, objects, source: 'scan' };
}

/** a traced outline (reference space) -> room-frame Scan with walls along the outline */
export function tracedScan(points: THREE.Vector3[], height = 2.5): { scan: Scan; origin: THREE.Vector3; yaw: number } {
	const f = frameFromFloor(points.map((p) => ({ x: p.x, z: p.z })), points.reduce((s, p) => s + p.y, 0) / points.length);
	const inv = new THREE.Matrix4().makeRotationY(f.yaw).setPosition(f.origin).invert();
	const floor = points.map((p) => { const q = p.clone().applyMatrix4(inv); return [q.x, q.z] as [number, number]; });
	return { scan: { floor, height, walls: [], openings: [], objects: [], source: 'traced' }, ...f };
}

// ------------------------------------------------------------------ build
const EPS = 0.006;

function inside(poly: [number, number][], x: number, z: number) {
	let c = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, zi] = poly[i], [xj, zj] = poly[j];
		if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
	}
	return c;
}

/** the house the designer edits, built from a room-frame Scan */
export function buildRealHouse(scan: Scan): House & { catcher: THREE.Mesh } {
	const root = new THREE.Group(); root.name = 'home-real';
	const items = new Map<string, Item>();
	const add = (it: Item) => { items.set(it.id, it); root.add(it.object); return it; };
	const poly = scan.floor.length >= 3 ? scan.floor : ([[-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, 1.5]] as [number, number][]);
	const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
	const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
	const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, H = scan.height;
	const mkRoom = (id: RoomId, name: string, rx0: number, rz0: number, rx1: number, rz1: number): Room => {
		const fill = new THREE.PointLight(0xfff0dc, 6, 14, 1.6); fill.position.set((rx0 + rx1) / 2, H - 0.3, (rz0 + rz1) / 2); fill.name = id + '.fill'; root.add(fill);
		return { id, name, x0: rx0, z0: rz0, x1: rx1, z1: rz1, fill, windows: [], clear: [] };
	};
	// one real room; the other two room ids exist (empty, far away) so every code path keeps working
	const rooms: Record<RoomId, Room> = {
		living: mkRoom('living', 'your room', x0, z0, x1, z1),
		kitchen: mkRoom('kitchen', 'kitchen (not scanned)', 1000, 1000, 1000.1, 1000.1),
		bedroom: mkRoom('bedroom', 'bedroom (not scanned)', 2000, 2000, 2000.1, 2000.1),
	};
	const overlay = (): THREE.MeshPhysicalMaterial => dress({ preset: 'original' });

	// floor and ceiling: the outline as a flat shape (shape space x, y = room x, -z)
	const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
	const floorMat = overlay();
	const floor = new THREE.Mesh(metreUV(new THREE.ShapeGeometry(shape)), floorMat);
	floor.rotation.x = -Math.PI / 2; floor.position.y = EPS; floor.receiveShadow = true; floor.name = 'living.floor';
	add({ id: 'living.floor', name: 'floor', kind: 'floor', room: 'living', object: floor, slots: { main: { meshes: [floor], mat: floorMat } }, fixed: true, mount: 'surface', half: [0, 0], height: 0, overlay: true });
	const ceilMat = overlay();
	const ceil = new THREE.Mesh(metreUV(new THREE.ShapeGeometry(new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, z))))), ceilMat);
	ceil.rotation.x = Math.PI / 2; ceil.position.y = H - EPS; ceil.name = 'living.ceiling';
	add({ id: 'living.ceiling', name: 'ceiling', kind: 'ceiling', room: 'living', object: ceil, slots: { main: { meshes: [ceil], mat: ceilMat } }, fixed: true, mount: 'surface', half: [0, 0], height: 0, overlay: true });
	// shadows of added furniture on your real floor
	const catcher = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.ShadowMaterial({ opacity: 0.32 }));
	catcher.rotation.x = -Math.PI / 2; catcher.position.y = EPS / 2; catcher.receiveShadow = true; catcher.name = 'home-real-shadows';
	root.add(catcher);

	// walls: one overlay per wall, with holes for its windows and doors
	const walls: ScanWall[] = scan.walls.length ? scan.walls : poly.map((p, i) => ({ a: p, b: poly[(i + 1) % poly.length], y0: 0, y1: H }));
	const wallMat = overlay();
	const wallGroup = new THREE.Group(); wallGroup.name = 'living.walls';
	const wallMeshes: THREE.Mesh[] = [];
	for (const w of walls) {
		let a = new THREE.Vector3(w.a[0], 0, w.a[1]), b = new THREE.Vector3(w.b[0], 0, w.b[1]);
		const len = a.distanceTo(b); if (len < 0.2) continue;
		let t = b.clone().sub(a).normalize();
		let n = new THREE.Vector3(-t.z, 0, t.x);
		// face into the room
		const mid = a.clone().add(b).multiplyScalar(0.5);
		if (!inside(poly, mid.x + n.x * 0.3, mid.z + n.z * 0.3) && inside(poly, mid.x - n.x * 0.3, mid.z - n.z * 0.3)) n.negate();
		else if (!inside(poly, mid.x + n.x * 0.3, mid.z + n.z * 0.3) && !inside(poly, mid.x - n.x * 0.3, mid.z - n.z * 0.3)) { if (n.dot(new THREE.Vector3(cx - mid.x, 0, cz - mid.z)) < 0) n.negate(); }
		// local x along the wall, y up, z = into the room (right-handed)
		if (new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).dot(n) < 0) { [a, b] = [b, a]; t.negate(); }
		const s = new THREE.Shape([new THREE.Vector2(0, w.y0), new THREE.Vector2(len, w.y0), new THREE.Vector2(len, w.y1), new THREE.Vector2(0, w.y1)]);
		for (const o of scan.openings) {
			const oa = new THREE.Vector3(o.a[0], 0, o.a[1]), ob = new THREE.Vector3(o.b[0], 0, o.b[1]), om = oa.clone().add(ob).multiplyScalar(0.5);
			if (Math.abs(om.clone().sub(a).dot(n)) > 0.3 || Math.abs(ob.clone().sub(oa).normalize().dot(t)) < 0.8) continue;
			const u0 = Math.max(0.01, Math.min(oa.clone().sub(a).dot(t), ob.clone().sub(a).dot(t))), u1 = Math.min(len - 0.01, Math.max(oa.clone().sub(a).dot(t), ob.clone().sub(a).dot(t)));
			const v0 = Math.max(w.y0 + 0.01, o.y0), v1 = Math.min(w.y1 - 0.01, o.y1);
			if (u1 - u0 < 0.1 || v1 - v0 < 0.1) continue;
			s.holes.push(new THREE.Path([new THREE.Vector2(u0, v0), new THREE.Vector2(u0, v1), new THREE.Vector2(u1, v1), new THREE.Vector2(u1, v0)]));
		}
		const m = new THREE.Mesh(metreUV(new THREE.ShapeGeometry(s)), wallMat);
		m.matrixAutoUpdate = true;
		m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, new THREE.Vector3(0, 1, 0), n));
		m.position.copy(a).addScaledVector(n, EPS);
		m.receiveShadow = true;
		wallGroup.add(m); wallMeshes.push(m);
	}
	add({ id: 'living.walls', name: 'walls', kind: 'walls', room: 'living', object: wallGroup, slots: { main: { meshes: wallMeshes, mat: wallMat } }, fixed: true, mount: 'surface', half: [0, 0], height: H, overlay: true });

	// windows (for "beside the window") and doors (kept clear)
	for (const o of scan.openings) {
		const a = new THREE.Vector3(o.a[0], 0, o.a[1]), b = new THREE.Vector3(o.b[0], 0, o.b[1]), c = a.clone().add(b).multiplyScalar(0.5);
		const t = b.clone().sub(a).normalize(); const n = new THREE.Vector3(-t.z, 0, t.x);
		if (n.dot(new THREE.Vector3(cx - c.x, 0, cz - c.z)) < 0) n.negate();
		const width = a.distanceTo(b);
		if (o.kind === 'window') rooms.living.windows.push({ room: 'living', centre: c.clone().setY((o.y0 + o.y1) / 2), normal: n, width } as Win);
		else {
			const p = c.clone().addScaledVector(n, 0.55), hw = Math.max(width / 2, 0.45) + 0.1;
			rooms.living.clear.push([p.x - hw, p.z - hw, p.x + hw, p.z + hw]);
		}
	}

	// your real furniture: fixed, a footprint to keep clear, and a depth-only box so overlays do not paint over it
	const occluder = new THREE.MeshBasicMaterial({ colorWrite: false });
	const count = new Map<string, number>();
	for (const o of scan.objects) {
		const k = (count.get(o.label) ?? 0) + 1; count.set(o.label, k);
		const id = `real.${o.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${k}`;
		const g = new THREE.Group(); g.name = id; g.position.set(o.x, 0, o.z); g.rotation.y = o.rot;
		const box = new THREE.Mesh(new THREE.BoxGeometry(o.hx * 2, o.h, o.hz * 2), occluder); box.position.y = o.h / 2; box.renderOrder = -10; g.add(box);
		add({ id, name: k > 1 ? `${o.label} ${k}` : o.label, kind: 'real', room: 'living', object: g, slots: {}, fixed: true, mount: 'floor', half: [o.hx, o.hz], height: o.h });
		const c = Math.abs(Math.cos(o.rot)), s = Math.abs(Math.sin(o.rot)), hx = c * o.hx + s * o.hz, hz = s * o.hx + c * o.hz;
		rooms.living.clear.push([o.x - hx - 0.05, o.z - hz - 0.05, o.x + hx + 0.05, o.z + hz + 0.05]);
	}

	// light for the virtual furniture (it cannot light your real room)
	const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
	sun.position.set(cx + 3, H + 4, cz + 2); sun.target.position.set(cx, 0, cz); sun.castShadow = true;
	const r = Math.max(x1 - x0, z1 - z0) / 2 + 1;
	sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: H + 12 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
	root.add(sun, sun.target);
	const hemi = new THREE.HemisphereLight(0xeef2f8, 0x8a7c66, 0.7); root.add(hemi);
	return { root, rooms, items, spawn: { x: cx, z: cz, yaw: 0 }, sun, hemi, catcher };
}

/** a plain test room: 4.2 x 3.6 m, a window, a door, a couch and a table */
export function testScan(): Scan {
	return {
		source: 'test', height: 2.5,
		floor: [[-2.1, -1.8], [2.1, -1.8], [2.1, 1.8], [-2.1, 1.8]],
		walls: [],
		openings: [
			{ kind: 'window', a: [-0.6, -1.8], b: [0.6, -1.8], y0: 0.9, y1: 2.1 },
			{ kind: 'door', a: [2.1, 0.8], b: [2.1, 1.7], y0: 0, y1: 2.05 },
		],
		objects: [
			{ label: 'couch', x: -0.3, z: 1.3, hx: 1.0, hz: 0.45, rot: 0, h: 0.85 },
			{ label: 'table', x: -0.3, z: 0.2, hx: 0.5, hz: 0.3, rot: 0, h: 0.45 },
		],
	};
}
