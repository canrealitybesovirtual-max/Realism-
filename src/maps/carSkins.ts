import * as THREE from 'three';

/**
 * Highway traffic: Kenney's low-poly cars dressed in photo skins, plus
 * articulated-looking lorries, all drawn with instancing.
 *
 * Skins come from paper-model sheets (an unfolded car: sides, top, front,
 * back), packed by tools/car-skins/build.py into one 1024 x 1024 atlas per
 * vehicle. A model's faces pick their panel by which way they face, and
 * their texture coordinates by where they sit in the model's bounds: the
 * same projection a paper model makes when it is folded round a block.
 *
 * Every variant (a model with a skin, or with its own palette) is one
 * instanced body plus one instanced mesh per wheel shape, so the whole
 * traffic costs a few dozen draw calls however many cars are out.
 */

/** atlas rectangles in pixels (1024 x 1024): A = side seen with the front to the right, B = front to the left */
type Rect = [number, number, number, number];
interface Layout { A: Rect; B: Rect; T: Rect; F: Rect; K: Rect; under?: Rect }
const S = 1024;
const CAR: Layout = { A: [0, 0, S, 256], B: [0, 256, S, 512], T: [0, 512, S, 768], F: [0, 768, 512, S], K: [512, 768, S, S] };
const TRAILER: Layout = { A: [0, 0, S, 256], B: [0, 256, S, 512], T: [0, 512, S, 640], F: [512, 768, S, S], K: [512, 768, S, S] };
const CAB: Layout = { A: [0, 640, 512, 768], B: [512, 640, S, 768], T: [4, 644, 12, 652], F: [0, 768, 512, S], K: [4, 644, 12, 652] };

/**
 * Texture coordinates for a point on a face with normal n, at normalised
 * position (x, y, z) in the box it is projected from (front is +Z, up +Y).
 * The views are as seen from outside: from -X the front is on the right,
 * from +X on the left; the top has the front to the right and +X up.
 */
export interface SideWarp { A?: (z: number) => number; B?: (z: number) => number }
export function atlasUV(n: THREE.Vector3, x: number, y: number, z: number, L: Layout, warp?: SideWarp): [number, number] {
	const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
	let r: Rect, u: number, v: number;
	if (ay >= ax && ay >= az) {
		if (n.y < 0) { r = L.under ?? L.T; u = 0.5; v = 0.5; } // underside: barely seen
		else { r = L.T; u = z; v = 1 - x; }
	} else if (ax >= az) {
		if (n.x < 0) { r = L.A; u = warp?.A ? warp.A(z) : z; } else { r = L.B; u = warp?.B ? warp.B(z) : 1 - z; }
		v = 1 - y;
	} else {
		if (n.z > 0) { r = L.F; u = x; } else { r = L.K; u = 1 - x; }
		v = 1 - y;
	}
	u = Math.min(1, Math.max(0, u)); v = Math.min(1, Math.max(0, v));
	return [(r[0] + (r[2] - r[0]) * u) / S, (r[1] + (r[3] - r[1]) * v) / S];
}

/** float, non-indexed copy with position / normal (/ uv) only, transformed by m */
function flatten(g: THREE.BufferGeometry, m: THREE.Matrix4, keepUV: boolean) {
	const src = g.index ? g.toNonIndexed() : g;
	const out = new THREE.BufferGeometry();
	for (const k of keepUV ? ['position', 'normal', 'uv'] : ['position', 'normal']) {
		const a = src.getAttribute(k) as THREE.BufferAttribute | undefined;
		if (!a) continue;
		const n = a.itemSize, f = new Float32Array(a.count * n);
		for (let i = 0; i < a.count; i++) { f[i * n] = a.getX(i); f[i * n + 1] = a.getY(i); if (n > 2) f[i * n + 2] = a.getZ(i); }
		out.setAttribute(k, new THREE.BufferAttribute(f, n));
	}
	out.applyMatrix4(m);
	return out;
}
function merge(list: THREE.BufferGeometry[]) {
	const out = new THREE.BufferGeometry();
	for (const k of ['position', 'normal', 'uv', 'color']) {
		if (!list.every((g) => g.getAttribute(k))) continue;
		const n = list[0].getAttribute(k).itemSize;
		const total = list.reduce((a, g) => a + g.getAttribute(k).count, 0);
		const f = new Float32Array(total * n);
		let o = 0;
		for (const g of list) { f.set(g.getAttribute(k).array as Float32Array, o); o += g.getAttribute(k).array.length; }
		out.setAttribute(k, new THREE.BufferAttribute(f, n));
	}
	out.computeBoundingSphere();
	return out;
}
/** project an atlas onto a flattened geometry, face by face, within bounds `b` */
function project(g: THREE.BufferGeometry, b: THREE.Box3, L: Layout, warp?: SideWarp) {
	const p = g.getAttribute('position'), count = p.count;
	const uv = new Float32Array(count * 2), col = new Float32Array(count * 3);
	const a = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3();
	const size = b.getSize(new THREE.Vector3());
	for (let t = 0; t < count; t += 3) {
		a.fromBufferAttribute(p, t); c.fromBufferAttribute(p, t + 1); d.fromBufferAttribute(p, t + 2);
		n.subVectors(c, a).cross(d.clone().sub(a)).normalize();
		const shade = n.y < -0.6 ? 0.18 : 1; // undersides dark
		for (let k = 0; k < 3; k++) {
			const q = k === 0 ? a : k === 1 ? c : d;
			const [u, v] = atlasUV(n, (q.x - b.min.x) / size.x, (q.y - b.min.y) / size.y, (q.z - b.min.z) / size.z, L, warp);
			uv[(t + k) * 2] = u; uv[(t + k) * 2 + 1] = v;
			col[(t + k) * 3] = col[(t + k) * 3 + 1] = col[(t + k) * 3 + 2] = shade;
		}
	}
	g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	g.setAttribute('color', new THREE.BufferAttribute(col, 3));
	return g;
}

export interface WheelSet { geo: THREE.BufferGeometry; mat: THREE.Material; at: THREE.Matrix4[] }
export interface Variant {
	id: string; len: number; wid: number; truck: boolean; weight: number; wheelR: number;
	body: { geo: THREE.BufferGeometry; mat: THREE.Material }[];
	wheels: WheelSet[];
}

/** Kenney model -> variant: body merged (skinned with an atlas, or its own palette), wheels as templates */
/** piecewise-linear map through (x, y) anchor pairs, 0 -> 0 and 1 -> 1 at the ends */
function pw(pts: [number, number][]) {
	const P: [number, number][] = [[0, 0], ...pts, [1, 1]];
	return (x: number) => {
		for (let i = 1; i < P.length; i++) if (x <= P[i][0] || i === P.length - 1) {
			const [x0, y0] = P[i - 1], [x1, y1] = P[i];
			return y0 + ((y1 - y0) * (x - x0)) / Math.max(1e-6, x1 - x0);
		}
		return x;
	};
}

/**
 * Kenney model -> variant: body merged (skinned with an atlas, or its own
 * palette), wheels as templates. `wheelsU`: where the sheet's painted tyres
 * sit along each side panel, so the panel is stretched to put them on the
 * model's real wheels.
 */
export function kenneyVariant(id: string, model: THREE.Object3D, len: number, opts: { atlas?: THREE.Texture; truck?: boolean; weight: number; paint?: THREE.Material; wheelsU?: { A: number[] | null; B: number[] | null } }): Variant {
	model.updateMatrixWorld(true);
	const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
	const s = len / size.z;
	// model space: length `len`, centred in x/z, wheels on y = 0
	const base = new THREE.Matrix4().makeTranslation(-centre.x * s, -box.min.y * s, -centre.z * s).multiply(new THREE.Matrix4().makeScale(s, s, s));
	const wheelNodes: THREE.Object3D[] = [];
	model.traverse((o) => { if (/^wheel/.test(o.name) && !/^wheel/.test(o.parent?.name ?? '')) wheelNodes.push(o); });
	const inWheel = (o: THREE.Object3D) => { for (let q: THREE.Object3D | null = o; q; q = q.parent) if (wheelNodes.includes(q)) return true; return false; };
	const body: THREE.BufferGeometry[] = [];
	let bodyMat: THREE.Material | null = null;
	model.traverse((o) => {
		const m = o as THREE.Mesh;
		if (!m.isMesh || inWheel(m)) return;
		body.push(flatten(m.geometry, base.clone().multiply(m.matrixWorld), !opts.atlas));
		bodyMat ??= m.material as THREE.Material;
	});
	let geo = merge(body), mat: THREE.Material;
	if (opts.atlas) {
		geo.computeBoundingBox();
		const b = geo.boundingBox!.clone();
		b.min.y = 0; // sides run from the road to the roof, as the sheets do
		const wz = wheelNodes.map((w) => (new THREE.Vector3().setFromMatrixPosition(base.clone().multiply(w.matrixWorld)).z - b.min.z) / (b.max.z - b.min.z));
		const zr = Math.min(...wz), zf = Math.max(...wz), warp: SideWarp = {};
		const A = opts.wheelsU?.A, B = opts.wheelsU?.B;
		if (wz.length >= 2 && A) warp.A = pw([[zr, A[0]], [zf, A[1]]]);
		if (wz.length >= 2 && B) { const f = pw([[1 - zf, B[0]], [1 - zr, B[1]]]); warp.B = (z) => f(1 - z); }
		geo = project(geo, b, CAR, warp);
		mat = new THREE.MeshStandardMaterial({ map: opts.atlas, vertexColors: true, roughness: 0.4, metalness: 0.12, envMapIntensity: 1.1 });
	} else mat = opts.paint ?? bodyMat!;
	// wheels: one template per distinct wheel mesh, placed by each wheel node
	const sets = new Map<string, WheelSet>();
	let wheelR = 0.35;
	for (const w of wheelNodes) {
		const inv = w.matrixWorld.clone().invert(), parts: THREE.BufferGeometry[] = [];
		let key = '', wm: THREE.Material | null = null;
		w.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { parts.push(flatten(m.geometry, inv.clone().multiply(m.matrixWorld), true)); key += m.geometry.uuid; wm ??= m.material as THREE.Material; } });
		if (!parts.length) continue;
		if (!sets.has(key)) sets.set(key, { geo: merge(parts), mat: wm!, at: [] });
		const at = base.clone().multiply(w.matrixWorld);
		sets.get(key)!.at.push(at);
		wheelR = new THREE.Vector3().setFromMatrixPosition(at).y;
	}
	geo.computeBoundingBox();
	return { id, len, wid: geo.boundingBox!.max.x - geo.boundingBox!.min.x, truck: !!opts.truck, weight: opts.weight, wheelR, body: [{ geo, mat }], wheels: [...sets.values()] };
}

/** A box with its five visible faces projected from an atlas layout */
function skinnedBox(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, L: Layout) {
	const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
	g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
	g.deleteAttribute('uv');
	return project(g, new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)), L);
}

/** Tractor unit and box trailer (one rigid body for the traffic model), 16.4 m long */
export function semiVariant(id: string, atlas: THREE.Texture, wheel: WheelSet, weight: number): Variant {
	const H = 16.4 / 2;
	const parts = [
		skinnedBox(-1.25, 1.25, 0.6, 3.45, H - 2.35, H, CAB), // cab
		skinnedBox(-1.28, 1.28, 1.2, 4.0, -H, H - 3.0, TRAILER), // trailer box
	];
	const chassis = new THREE.BoxGeometry(1.9, 0.5, 6.0).toNonIndexed(); chassis.translate(0, 0.75, H - 3.6); chassis.deleteAttribute('uv');
	const ch = project(chassis, new THREE.Box3(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 1, 1)), CAB);
	(ch.getAttribute('color').array as Float32Array).fill(0.12);
	const mat = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.5, metalness: 0.1 });
	const geo = merge([...parts, ch]);
	// wheels: the Kenney truck's wheel, scaled to a 0.5 m radius
	const r0 = 1; // the template is a unit wheel (node space)
	const k = 0.5 / (r0 * 1.0);
	const at = (x: number, z: number, flip: boolean) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0.5, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), flip ? Math.PI : 0), new THREE.Vector3(k, k, k));
	const zs = [H - 1.2, H - 3.6, H - 4.9, -H + 3.4, -H + 2.1, -H + 0.8];
	const wheels: WheelSet = { geo: wheel.geo, mat: wheel.mat, at: zs.flatMap((z) => [at(-1.05, z, false), at(1.05, z, true)]) };
	return { id, len: 16.4, wid: 2.56, truck: true, weight, wheelR: 0.5, body: [{ geo, mat }], wheels: [wheels] };
}

/**
 * Body and wheels (at rest) in one geometry for the distant version. Wheels
 * that would need another material are tinted dark through the body's
 * vertex colours instead.
 */
function farGeometry(v: Variant) {
	const body = v.body[0].geo, skinned = !!body.getAttribute('color');
	const parts: THREE.BufferGeometry[] = [body.clone()];
	for (const w of v.wheels) for (const at of w.at) {
		const g = w.geo.clone().applyMatrix4(at);
		const n = g.getAttribute('position').count;
		if (skinned) {
			g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2).fill(0.5), 2));
			g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.08), 3));
		} else if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
		parts.push(g);
	}
	return merge(parts);
}

/**
 * Draws every car of every variant with instancing; refill each frame.
 * Cars near the camera get turning wheels and cast shadows; the rest are one
 * merged, shadowless mesh per variant (one draw call each).
 */
export class Fleet {
	private bodies: THREE.InstancedMesh[][] = [];
	private wheels: THREE.InstancedMesh[][] = [];
	private far: THREE.InstancedMesh[] = [];
	private n: number[] = [];
	private nf: number[] = [];
	private m = new THREE.Matrix4();
	private spin = new THREE.Matrix4();

	constructor(root: THREE.Object3D, readonly variants: Variant[], cap: number) {
		for (const v of variants) {
			this.bodies.push(v.body.map((b) => this.im(root, b.geo, b.mat, cap, true)));
			this.wheels.push(v.wheels.map((w) => this.im(root, w.geo, w.mat, cap * w.at.length, true)));
			this.far.push(this.im(root, farGeometry(v), v.body[0].mat, cap, false));
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
		if (!near) { this.far[vi].setMatrixAt(this.nf[vi]++, at); return; }
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
		this.bodies.forEach((list, vi) => list.forEach((im) => { im.count = this.n[vi]; im.visible = im.count > 0; im.instanceMatrix.needsUpdate = true; }));
		this.wheels.forEach((list, vi) => list.forEach((im, wi) => { im.count = this.n[vi] * this.variants[vi].wheels[wi].at.length; im.visible = im.count > 0; im.instanceMatrix.needsUpdate = true; }));
		this.far.forEach((im, vi) => { im.count = this.nf[vi]; im.visible = im.count > 0; im.instanceMatrix.needsUpdate = true; });
	}
	dispose() {
		for (const im of [...this.bodies.flat(), ...this.wheels.flat(), ...this.far]) { im.removeFromParent(); im.dispose(); }
		for (const v of this.variants) { for (const b of v.body) b.geo.dispose(); }
		for (const im of this.far) im.geometry.dispose();
	}
}
