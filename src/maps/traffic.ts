import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Highway traffic: real car models (public/models/traffic/cars.json, packed by
 * scripts/pack-cars.mjs; CC-BY-4.0, see public/models/traffic/CREDITS.md), drawn with
 * instancing so the whole traffic costs a few dozen draw calls however many
 * cars are out.
 *
 * Each car is normalised when it loads: turned so it drives along +Z, scaled
 * to its real length, wheels on y = 0. Its body is merged per material; its
 * wheels become turning templates placed at each wheel's centre (an axle
 * modelled as one mesh turns as one). Cars whose wheels are part of the body
 * mesh (the Celica, made for 3D printing) get them cut out by shape.
 */

export interface WheelSet { geo: THREE.BufferGeometry; mat: THREE.Material; at: THREE.Matrix4[] }
export interface Variant {
	id: string; len: number; wid: number; truck: boolean; weight: number; wheelR: number;
	body: { geo: THREE.BufferGeometry; mat: THREE.Material }[];
	wheels: WheelSet[];
}

/** a car in the pack and how to stand it on the road */
export interface CarSpec {
	id: string; name: string;
	/** real length in metres */
	len: number;
	/** which way the model's front points as it comes out of the file */
	front: '+x' | '-x' | '+z' | '-z';
	weight: number;
	/** body colours to pick from (cars without a paint texture) */
	paints?: string[];
	/** cut the wheels out of a one-piece model */
	cutWheels?: boolean;
}

export const CARS: CarSpec[] = [
	{ id: 'bmw-e30', name: 'BMW 3 Series (E30)', len: 4.32, front: '+z', weight: 1.4 },
	{ id: 'renault-12', name: 'Renault 12', len: 4.35, front: '+z', weight: 1.2 },
	{ id: 'mercedes-w123', name: 'Mercedes-Benz W123', len: 4.73, front: '+z', weight: 1.4 },
	{ id: 'traffic-1', name: 'Traffic car 1', len: 4.4, front: '-x', weight: 1 },
	{ id: 'traffic-2', name: 'Traffic car 2', len: 4.5, front: '-x', weight: 1 },
	{ id: 'traffic-3', name: 'Traffic car 3', len: 4.6, front: '-x', weight: 1 },
	{ id: 'traffic-4', name: 'Traffic car 4', len: 4.3, front: '-x', weight: 1 },
	{ id: 'traffic-5', name: 'Traffic car 5', len: 4.4, front: '-x', weight: 1 },
	{ id: 'toyota-celica', name: 'Toyota Celica (gen 7)', len: 4.42, front: '+x', weight: 1.2, cutWheels: true, paints: ['#b3121b', '#e9e8e4', '#1d2a44', '#c9ccd0', '#f0c419'] },
];

/** float, non-indexed copy with position / normal / uv, transformed by m */
function flatten(g: THREE.BufferGeometry, m: THREE.Matrix4) {
	const src = g.index ? g.toNonIndexed() : g;
	const out = new THREE.BufferGeometry();
	for (const k of ['position', 'normal', 'uv']) {
		const a = src.getAttribute(k) as THREE.BufferAttribute | undefined;
		if (!a) continue;
		const n = a.itemSize, f = new Float32Array(a.count * n);
		for (let i = 0; i < a.count; i++) { f[i * n] = a.getX(i); f[i * n + 1] = a.getY(i); if (n > 2) f[i * n + 2] = a.getZ(i); }
		out.setAttribute(k, new THREE.BufferAttribute(f, n));
	}
	if (!out.getAttribute('normal')) out.computeVertexNormals();
	if (!out.getAttribute('uv')) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(src.getAttribute('position').count * 2), 2));
	out.applyMatrix4(m);
	if (m.determinant() < 0) flipWinding(out);
	return out;
}
function flipWinding(g: THREE.BufferGeometry) {
	for (const k of ['position', 'normal', 'uv']) {
		const a = g.getAttribute(k) as THREE.BufferAttribute | undefined; if (!a) continue;
		const n = a.itemSize, arr = a.array as Float32Array, tmp = new Float32Array(n);
		for (let t = 0; t < a.count; t += 3) { tmp.set(arr.subarray((t + 1) * n, (t + 2) * n)); arr.copyWithin((t + 1) * n, (t + 2) * n, (t + 3) * n); arr.set(tmp, (t + 2) * n); }
	}
}
function merge(list: THREE.BufferGeometry[]) {
	const out = new THREE.BufferGeometry();
	for (const k of ['position', 'normal', 'uv']) {
		if (!list.every((g) => g.getAttribute(k))) continue;
		const n = list[0].getAttribute(k).itemSize;
		const f = new Float32Array(list.reduce((a, g) => a + g.getAttribute(k).count, 0) * n);
		let o = 0;
		for (const g of list) { f.set(g.getAttribute(k).array as Float32Array, o); o += g.getAttribute(k).array.length; }
		out.setAttribute(k, new THREE.BufferAttribute(f, n));
	}
	out.computeBoundingSphere();
	return out;
}
/** split triangles by a test on their centroid */
function split(g: THREE.BufferGeometry, test: (c: THREE.Vector3) => boolean): [THREE.BufferGeometry, THREE.BufferGeometry] {
	const p = g.getAttribute('position'), keys = ['position', 'normal', 'uv'] as const;
	const yes: number[] = [], no: number[] = [], c = new THREE.Vector3();
	for (let t = 0; t < p.count; t += 3) {
		c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.x += p.getX(t + k) / 3, c.y += p.getY(t + k) / 3, c.z += p.getZ(t + k) / 3;
		(test(c) ? yes : no).push(t);
	}
	const pick = (tris: number[]) => {
		const out = new THREE.BufferGeometry();
		for (const k of keys) {
			const a = g.getAttribute(k) as THREE.BufferAttribute; const n = a.itemSize, src = a.array as Float32Array, f = new Float32Array(tris.length * 3 * n);
			tris.forEach((t, i) => f.set(src.subarray(t * n, (t + 3) * n), i * 3 * n));
			out.setAttribute(k, new THREE.BufferAttribute(f, n));
		}
		return out;
	};
	return [pick(yes), pick(no)];
}

const FRONT_YAW: Record<CarSpec['front'], number> = { '+z': 0, '-z': Math.PI, '+x': -Math.PI / 2, '-x': Math.PI / 2 };

/** a loaded car file -> a traffic variant (one per paint for painted cars) */
export function carVariants(spec: CarSpec, model: THREE.Object3D): Variant[] {
	model.updateMatrixWorld(true);
	// turn to face +Z, then scale to length, centre, wheels on y = 0
	const rot = new THREE.Matrix4().makeRotationY(FRONT_YAW[spec.front]);
	const box = new THREE.Box3();
	model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) box.union(new THREE.Box3().setFromBufferAttribute(m.geometry.getAttribute('position') as THREE.BufferAttribute).applyMatrix4(rot.clone().multiply(m.matrixWorld))); });
	const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), s = spec.len / size.z;
	const base = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z)).multiply(rot);
	const wheelNodes: THREE.Object3D[] = [];
	model.traverse((o) => { if (/^wheel\d/.test(o.name)) wheelNodes.push(o); });
	const inWheel = (o: THREE.Object3D) => { for (let q: THREE.Object3D | null = o; q; q = q.parent) if (wheelNodes.includes(q)) return true; return false; };
	// body: merged per material
	const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
	model.traverse((o) => {
		const m = o as THREE.Mesh;
		if (!m.isMesh || inWheel(m)) return;
		const mat = m.material as THREE.Material;
		if (!byMat.has(mat)) byMat.set(mat, []);
		byMat.get(mat)!.push(flatten(m.geometry, base.clone().multiply(m.matrixWorld)));
	});
	let body = [...byMat].map(([mat, list]) => ({ geo: merge(list), mat }));
	const wid = size.x * s;
	// wheels: each one centred on itself so it turns about its own axle
	const wheels: WheelSet[] = [];
	let wheelR = 0.31;
	const addWheel = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
		geo.computeBoundingBox();
		const bb = geo.boundingBox!, ctr = bb.getCenter(new THREE.Vector3());
		geo.translate(-ctr.x, -ctr.y, -ctr.z);
		wheelR = (bb.max.y - bb.min.y) / 2;
		wheels.push({ geo, mat, at: [new THREE.Matrix4().makeTranslation(ctr.x, ctr.y, ctr.z)] });
	};
	for (const w of wheelNodes) {
		const parts: THREE.BufferGeometry[] = []; let mat: THREE.Material | null = null;
		w.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { parts.push(flatten(m.geometry, base.clone().multiply(m.matrixWorld))); mat ??= m.material as THREE.Material; } });
		if (parts.length) addWheel(merge(parts), mat!);
	}
	if (spec.cutWheels && !wheelNodes.length) {
		// the wheels are part of the body: find them low on each side, front and back, and cut them out
		const tyre = new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 0.85 });
		const g = body[0].geo; g.computeBoundingBox();
		const b = g.boundingBox!, halfW = (b.max.x - b.min.x) / 2;
		const p = g.getAttribute('position');
		// wheel centres along z: the lowest points near each end
		const low: number[] = [];
		for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.04 && Math.abs(p.getX(i)) > halfW * 0.55) low.push(p.getZ(i));
		const mid = (b.min.z + b.max.z) / 2, rear = low.filter((z) => z < mid), front = low.filter((z) => z >= mid);
		const avg = (l: number[]) => l.reduce((a, v) => a + v, 0) / Math.max(1, l.length);
		if (rear.length && front.length) {
			const r = Math.min(0.36, Math.max(0.26, spec.len * 0.07));
			for (const zc of [avg(rear), avg(front)]) for (const side of [-1, 1]) {
				const inside = (q: THREE.Vector3) => Math.hypot(q.y - r, q.z - zc) < r * 1.02 && q.x * side > halfW - 0.3;
				const [wheel, rest] = split(body[0].geo, inside);
				if (wheel.getAttribute('position').count < 30) continue;
				body[0].geo = rest;
				addWheel(wheel, tyre);
			}
		}
	}
	for (const b of body) b.geo.computeBoundingSphere();
	shareWheels(wheels);
	const one = (paint?: string): Variant => ({
		id: paint ? `${spec.id}-${paint.slice(1)}` : spec.id, len: spec.len, wid, truck: false, wheelR,
		weight: spec.weight / (spec.paints?.length ?? 1),
		body: paint ? body.map((b, i) => ({ geo: b.geo, mat: i === 0 ? paintOf(b.mat, paint) : b.mat })) : body,
		wheels,
	});
	return spec.paints ? spec.paints.map(one) : [one()];
}
/**
 * Wheels of the same shape (same size of mesh and material) share one
 * template: one draw call for all four. The other side's wheels are the
 * template mirrored, so the template is drawn double sided.
 */
function shareWheels(wheels: WheelSet[]) {
	const groups: WheelSet[] = [];
	for (const w of wheels) {
		const n = w.geo.getAttribute('position').count;
		const g = groups.find((q) => q.mat === w.mat && q.geo.getAttribute('position').count === n);
		if (!g) { groups.push({ geo: w.geo, mat: w.mat, at: [...w.at] }); continue; }
		// mirrored when it sits on the other side of the car from the template
		const tx = new THREE.Vector3().setFromMatrixPosition(g.at[0]).x, wx = new THREE.Vector3().setFromMatrixPosition(w.at[0]).x;
		const m = w.at[0].clone();
		if (Math.sign(tx) !== Math.sign(wx) && Math.abs(wx) > 0.2) { m.multiply(new THREE.Matrix4().makeScale(-1, 1, 1)); g.mat.side = THREE.DoubleSide; }
		g.at.push(m);
		w.geo.dispose();
	}
	wheels.length = 0; wheels.push(...groups);
}
function paintOf(m: THREE.Material, color: string) {
	const p = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.12 });
	p.name = `${m.name || 'paint'} ${color}`;
	return p;
}

/** load every car (one JSON of base64 GLBs: the artifact host serves .json but not .glb) */
export async function loadCars(url = 'models/traffic/cars.json'): Promise<{ spec: CarSpec; scene: THREE.Group }[]> {
	const pack: { models: Record<string, string> } = await (await fetch(url)).json();
	const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
	return Promise.all(CARS.filter((spec) => pack.models[spec.id]).map(async (spec) => {
		const bin = atob(pack.models[spec.id]), u = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
		return { spec, scene: (await loader.parseAsync(u.buffer, '')).scene };
	}));
}

/**
 * Draws every car of every variant with instancing; refill each frame.
 * Cars near the camera get turning wheels and cast shadows; the rest are one
 * shadowless instanced mesh per body part (wheels merged in, at rest).
 */
export class Fleet {
	private bodies: THREE.InstancedMesh[][] = [];
	private wheels: THREE.InstancedMesh[][] = [];
	private far: THREE.InstancedMesh[][] = [];
	private n: number[] = [];
	private nf: number[] = [];
	private m = new THREE.Matrix4();
	private spin = new THREE.Matrix4();
	private farGeos: THREE.BufferGeometry[] = [];

	constructor(root: THREE.Object3D, readonly variants: Variant[], cap: number) {
		for (const v of variants) {
			this.bodies.push(v.body.map((b) => this.im(root, b.geo, b.mat, cap, true)));
			this.wheels.push(v.wheels.map((w) => this.im(root, w.geo, w.mat, cap * w.at.length, true)));
			// far: the body parts as they are, the wheels (at rest) merged per material
			const wheelMats = new Map<THREE.Material, THREE.BufferGeometry[]>();
			for (const w of v.wheels) for (const at of w.at) { if (!wheelMats.has(w.mat)) wheelMats.set(w.mat, []); wheelMats.get(w.mat)!.push(w.geo.clone().applyMatrix4(at)); }
			const farW = [...wheelMats].map(([mat, l]) => { const g = merge(l); this.farGeos.push(g); return this.im(root, g, mat, cap, false); });
			this.far.push([...v.body.map((b) => this.im(root, b.geo, b.mat, cap, false)), ...farW]);
			this.n.push(0); this.nf.push(0);
		}
	}
	private im(root: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, cap: number, shadow: boolean) {
		const im = new THREE.InstancedMesh(g, m, cap);
		im.count = 0; im.frustumCulled = false; im.castShadow = shadow; im.receiveShadow = true;
		im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		root.add(im);
		return im;
	}
	begin() { this.n.fill(0); this.nf.fill(0); }
	/** one car of variant `vi` at pose `at`, wheels turned `spin` radians; `near` the camera gets the detailed version */
	add(vi: number, at: THREE.Matrix4, spin: number, near = true) {
		if (!near) { const i = this.nf[vi]++; for (const im of this.far[vi]) im.setMatrixAt(i, at); return; }
		const i = this.n[vi]++;
		for (const b of this.bodies[vi]) b.setMatrixAt(i, at);
		this.spin.makeRotationX(spin);
		this.variants[vi].wheels.forEach((w, wi) => {
			const im = this.wheels[vi][wi];
			w.at.forEach((wm, k) => im.setMatrixAt(i * w.at.length + k, this.m.multiplyMatrices(at, wm).multiply(this.spin)));
		});
	}
	end() {
		// variants with nobody out on the road this frame cost nothing (hidden, no draw call)
		const set = (im: THREE.InstancedMesh, n: number) => { im.count = n; im.visible = n > 0; im.instanceMatrix.needsUpdate = true; };
		this.bodies.forEach((list, vi) => list.forEach((im) => set(im, this.n[vi])));
		this.wheels.forEach((list, vi) => list.forEach((im, wi) => set(im, this.n[vi] * this.variants[vi].wheels[wi].at.length)));
		this.far.forEach((list, vi) => list.forEach((im) => set(im, this.nf[vi])));
	}
	dispose() {
		for (const im of [...this.bodies.flat(), ...this.wheels.flat(), ...this.far.flat()]) { im.removeFromParent(); im.dispose(); }
		for (const g of this.farGeos) g.dispose();
		const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
		for (const v of this.variants) { for (const b of v.body) { geos.add(b.geo); mats.add(b.mat); } for (const w of v.wheels) { geos.add(w.geo); mats.add(w.mat); } }
		for (const g of geos) g.dispose();
		for (const m of mats) { for (const t of Object.values(m)) if ((t as THREE.Texture)?.isTexture) (t as THREE.Texture).dispose(); m.dispose(); }
	}
}
