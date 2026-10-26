import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Fleet, kenneyVariant, semiVariant, type Variant } from './carSkins';

/**
 * Procedural highway: an 8 km divided motorway loop (three lanes each way)
 * through rolling grassland, with GLB traffic driven by a car-following
 * model. This module is its own chunk: nothing here is downloaded or built
 * until the player takes the office door to the highway, and `dispose()`
 * frees it again when they leave.
 *
 * Coordinates are map-local (the caller offsets `root`). The returned world
 * speaks the same interface as the snowy rally map, so the shared driving,
 * door and camera code in addons/rally.js runs on either.
 */

export interface RoadData { n: number; closed: boolean; P: Float32Array; Y: Float32Array; T: Float32Array; S: Float32Array; len: number }
export interface RoadHit { ri: number; k: number; t: number; d: number; side: number; y: number; qx: number; qz: number }
export interface Ground { h: number; surf: number; road: RoadHit | null; bank: number }
export interface Contact { nx: number; nz: number; pen: number; vx?: number; vz?: number; push?: (jx: number, jz: number) => void }
export interface Pose { x: number; z: number; yaw: number }
export interface MapWorld {
	kind: string;
	root: THREE.Group;
	roads: RoadData[];
	nearestRoad(x: number, z: number): RoadHit | null;
	groundAt(x: number, z: number): Ground;
	hit(x: number, z: number, r: number): Contact | null;
	clearSpot(x: number, z: number): boolean;
	resetPose(x: number, z: number, yaw: number): Pose;
	sky: THREE.Texture; fog: THREE.FogExp2; env: THREE.Texture | null;
	sun: THREE.DirectionalLight; sunDir: THREE.Vector3;
	door: Pose; car: Pose; spawn: Pose;
	bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
	/** tyre grip and rolling drag for surf 0 (road), 1 (verge), 2 (bank) */
	mu: number[]; roll: number[];
	/** 0..1: how much loose surface the wheels kick up on surf 0 / 1 */
	kick: number[];
	sprayColor: number;
	credits: string;
	traffic: { cars: TrafficCar[] };
	update(dt: number, t: number, player: { x: number; z: number; vx: number; vz: number; cam?: THREE.Vector3; fwd?: THREE.Vector3 }): void;
	setActive(on: boolean): void;
	dispose(): void;
}
export interface TrafficCar {
	/** index into the fleet's variants, and its name; the wheels' turn so far */
	variant: number; model: string; spin: number;
	side: number; lane: number; target: number; p: number; v: number; v0: number;
	len: number; wid: number; truck: boolean; think: number; crash: number;
	x: number; z: number; yaw: number; vx: number; vz: number;
}

// ---------------------------------------------------------------- layout
// cross-section, metres from the centre line (same on both carriageways):
// barrier 0-0.3 | median 0.3-1.5 | shoulder 1.5-2.5 | 3 lanes 2.5-13.3 |
// hard shoulder 13.3-16.3 | gravel 16.3-18 (guardrail at 16.9) | verge to 48
const LANE = 3.6, INNER = 2.5, LANES = 3;
const ASPHALT = 16.3, EDGE = 18, BLEND = 48, BARRIER = 0.3, RAIL = 16.9;
const TEX_ACROSS = 18, TEX_ALONG = 12;
export const laneOffset = (lane: number) => INNER + LANE * (lane + 0.5);

// ---------------------------------------------------------------- noise
function hash2(i: number, j: number) {
	let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}
function hash1(i: number) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
/** value noise in [-1, 1]; with `p` the lattice wraps every p cells (tileable) */
function vnoise(x: number, z: number, p = 0) {
	let i = Math.floor(x), j = Math.floor(z);
	let fx = x - i, fz = z - j;
	fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
	let i1 = i + 1, j1 = j + 1;
	if (p) { i = ((i % p) + p) % p; j = ((j % p) + p) % p; i1 = (i + 1) % p; j1 = (j + 1) % p; }
	const a = hash2(i, j), b = hash2(i1, j), c = hash2(i, j1), d = hash2(i1, j1);
	return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz) * 2 - 1;
}
function fbm(x: number, z: number, oct = 4) {
	let s = 0, a = 0.5, f = 1;
	for (let k = 0; k < oct; k++) { s += a * vnoise(x * f + k * 17.31, z * f - k * 9.13); f *= 2.03; a *= 0.5; }
	return s;
}
/** fbm that tiles with period `p` lattice cells at the base octave */
function tfbm(x: number, z: number, p: number, oct = 4) {
	let s = 0, a = 0.5, f = 1;
	for (let k = 0; k < oct; k++) { s += a * vnoise(x * f, z * f, p * f); f *= 2; a *= 0.5; }
	return s;
}
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- the road
function centreline(): RoadData {
	const RAW = 4096, raw: number[] = [];
	for (let u = 0; u < RAW; u++) {
		const a = (2 * Math.PI * u) / RAW;
		const r = 1 + 0.16 * Math.sin(2 * a + 0.7) + 0.07 * Math.sin(3 * a + 2.1) + 0.04 * Math.sin(5 * a + 0.3);
		raw.push(1450 * r * Math.cos(a), 980 * r * Math.sin(a));
	}
	const cum = [0];
	for (let i = 0; i < RAW; i++) {
		const j = (i + 1) % RAW;
		cum.push(cum[i] + Math.hypot(raw[j * 2] - raw[i * 2], raw[j * 2 + 1] - raw[i * 2 + 1]));
	}
	const L = cum[RAW], n = Math.round(L / 4);
	const P = new Float32Array(n * 2), Y = new Float32Array(n), T = new Float32Array(n * 2), S = new Float32Array(n);
	let q = 0;
	for (let k = 0; k < n; k++) {
		const s = (k / n) * L;
		while (cum[q + 1] < s) q++;
		const f = (s - cum[q]) / (cum[q + 1] - cum[q]), j = (q + 1) % RAW;
		P[k * 2] = raw[q * 2] + (raw[j * 2] - raw[q * 2]) * f;
		P[k * 2 + 1] = raw[q * 2 + 1] + (raw[j * 2 + 1] - raw[q * 2 + 1]) * f;
		// gentle grades (under 4 %)
		const w = (2 * Math.PI * s) / L;
		Y[k] = 6 + 9 * Math.sin(2 * w + 0.5) + 4 * Math.sin(5 * w + 1.3) + 1.5 * Math.sin(11 * w + 0.2);
	}
	let len = 0;
	for (let k = 0; k < n; k++) {
		const a = (k - 1 + n) % n, b = (k + 1) % n;
		const dx = P[b * 2] - P[a * 2], dz = P[b * 2 + 1] - P[a * 2 + 1], l = Math.hypot(dx, dz) || 1;
		T[k * 2] = dx / l; T[k * 2 + 1] = dz / l;
		S[k] = len;
		len += Math.hypot(P[((k + 1) % n) * 2] - P[k * 2], P[((k + 1) % n) * 2 + 1] - P[k * 2 + 1]);
	}
	return { n, closed: true, P, Y, T, S, len };
}

// ---------------------------------------------------------------- textures
function canvas(w: number, h: number) {
	const c = document.createElement('canvas'); c.width = w; c.height = h;
	return { c, g: c.getContext('2d')! };
}
function tex(c: HTMLCanvasElement, srgb: boolean, aniso: number, repeat = true) {
	const t = new THREE.CanvasTexture(c);
	if (srgb) t.colorSpace = THREE.SRGBColorSpace;
	if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = aniso;
	return t;
}
/** a normal map from a height field (tiles if the heights do) */
function normalFrom(hgt: Float32Array, w: number, h: number, strength: number, aniso: number) {
	const { c, g } = canvas(w, h), img = g.createImageData(w, h), d = img.data;
	for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
		const l = hgt[j * w + ((i - 1 + w) % w)], r = hgt[j * w + ((i + 1) % w)];
		const u = hgt[((j - 1 + h) % h) * w + i], dn = hgt[((j + 1) % h) * w + i];
		let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1;
		const k = 1 / Math.hypot(nx, ny, nz); nx *= k; ny *= k; nz *= k;
		const o = (j * w + i) * 4;
		d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255; d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = 255;
	}
	g.putImageData(img, 0, 0);
	return tex(c, false, aniso);
}

/** asphalt, lane paint, tyre wear and the gravel edge: u runs across one carriageway (0-18 m), v along (12 m) */
function roadTextures(aniso: number) {
	const W = 1024, H = 512;
	const col = canvas(W, H), rgh = canvas(W, H);
	const ci = col.g.createImageData(W, H), ri = rgh.g.createImageData(W, H), hgt = new Float32Array(W * H);
	const paint = (d: number, v: number) => {
		const solid = (a: number, b: number) => d >= a && d < b;
		if (solid(INNER, INNER + 0.2) || solid(INNER + LANE * LANES - 0.2, INNER + LANE * LANES)) return 1;
		for (let l = 1; l < LANES; l++) { const c = INNER + LANE * l; if (d >= c - 0.075 && d < c + 0.075 && v < 3) return 1; }
		return 0;
	};
	for (let j = 0; j < H; j++) {
		const v = ((j + 0.5) / H) * TEX_ALONG;
		for (let i = 0; i < W; i++) {
			const d = ((i + 0.5) / W) * TEX_ACROSS, o = (j * W + i) * 4;
			const grain = hash2(i * 7 + 3, j * 13 + 1), grain2 = hash2(i + 911, j + 77);
			// blotches tile along the road (period 8 cells over 12 m)
			const blot = tfbm((i / W) * 12, (j / H) * 8, 8, 3);
			let r: number, g: number, b: number, rough = 0.9, h = grain * 0.6 + blot * 0.3;
			if (d < BARRIER + 0.02) { r = 150; g = 148; b = 140; rough = 0.85; h = grain * 0.3; }
			else if (d >= ASPHALT) {
				// gravel: coarse stones
				const st = hash2(Math.floor(i / 3), Math.floor(j / 3));
				const base = 105 + st * 60 + grain * 18;
				r = base; g = base * 0.96; b = base * 0.88; rough = 0.95; h = st * 1.4 + grain * 0.4;
			} else {
				let base = 58 + grain * 26 + (grain2 > 0.985 ? 40 : 0);
				if (d < INNER || d > INNER + LANE * LANES) base += 6; // shoulders: lighter, less polished
				// tyre tracks in each lane: darker and smoother
				for (let l = 0; l < LANES; l++) {
					const c = laneOffset(l);
					const w = Math.exp(-(((d - c - 0.85) / 0.32) ** 2)) + Math.exp(-(((d - c + 0.85) / 0.32) ** 2));
					base *= 1 - 0.13 * w; rough -= 0.12 * w;
				}
				base *= 0.92 + 0.14 * blot;
				r = base; g = base * 1.005; b = base * 1.02;
				if (paint(d, v)) {
					const wear = 0.82 + 0.18 * grain;
					r = 222 * wear; g = 222 * wear; b = 214 * wear; rough = 0.6; h += 0.6;
				}
			}
			ci.data[o] = r; ci.data[o + 1] = g; ci.data[o + 2] = b; ci.data[o + 3] = 255;
			const rv = clamp(rough + (grain - 0.5) * 0.08, 0, 1) * 255;
			ri.data[o] = rv; ri.data[o + 1] = rv; ri.data[o + 2] = rv; ri.data[o + 3] = 255;
			hgt[j * W + i] = h;
		}
	}
	col.g.putImageData(ci, 0, 0); rgh.g.putImageData(ri, 0, 0);
	const map = tex(col.c, true, aniso), roughnessMap = tex(rgh.c, false, aniso), normalMap = normalFrom(hgt, W, H, 1.6, aniso);
	for (const t of [map, roughnessMap, normalMap]) t.wrapS = THREE.ClampToEdgeWrapping;
	return { map, roughnessMap, normalMap };
}

function grassTextures(aniso: number) {
	const W = 512, col = canvas(W, W), ci = col.g.createImageData(W, W), hgt = new Float32Array(W * W);
	for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
		const n1 = tfbm((i / W) * 8, (j / W) * 8, 8, 4), n2 = tfbm((i / W) * 32, (j / W) * 32, 32, 2);
		const blade = hash2(i, j), tuft = Math.max(0, n2) * 0.6;
		const dry = sstep(0.15, 0.45, n1);
		let r = 62 + 30 * blade + 40 * dry, g = 88 + 34 * blade + 18 * dry - 10 * tuft, b = 38 + 16 * blade + 14 * dry;
		const o = (j * W + i) * 4;
		r *= 0.9 + 0.2 * n2; g *= 0.9 + 0.2 * n2; b *= 0.9 + 0.2 * n2;
		ci.data[o] = r; ci.data[o + 1] = g; ci.data[o + 2] = b; ci.data[o + 3] = 255;
		hgt[j * W + i] = blade * 0.7 + n2 * 0.6;
	}
	col.g.putImageData(ci, 0, 0);
	// large-scale tint (fields, patches): sampled at 1/220 m in the shader
	const M = 256, mac = canvas(M, M), mi = mac.g.createImageData(M, M);
	for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
		const a = tfbm((i / M) * 6, (j / M) * 6, 6, 5), b = tfbm((i / M) * 3 + 5, (j / M) * 3, 3, 3);
		const o = (j * M + i) * 4;
		mi.data[o] = (a * 0.5 + 0.5) * 255; mi.data[o + 1] = (b * 0.5 + 0.5) * 255; mi.data[o + 2] = 128; mi.data[o + 3] = 255;
	}
	mac.g.putImageData(mi, 0, 0);
	return { map: tex(col.c, true, aniso), normalMap: normalFrom(hgt, W, W, 2.2, aniso), macro: tex(mac.c, false, 1) };
}

function concreteTexture(aniso: number) {
	const W = 256, H = 64, c = canvas(W, H), img = c.g.createImageData(W, H);
	for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
		const n = tfbm((i / W) * 16, (j / H) * 4, 16, 3), g = hash2(i, j);
		// a dark joint every 6 m (texture spans 6 m)
		const joint = i < 2 ? 0.55 : 1;
		const v = (168 + 30 * n + 14 * g) * joint, o = (j * W + i) * 4;
		img.data[o] = v; img.data[o + 1] = v * 0.99; img.data[o + 2] = v * 0.95; img.data[o + 3] = 255;
	}
	c.g.putImageData(img, 0, 0);
	return tex(c.c, true, aniso);
}

function skyTexture(sunDir: THREE.Vector3) {
	const w = 1024, h = 512, { c, g } = canvas(w, h), img = g.createImageData(w, h), d = img.data;
	const zen = [58, 104, 176], hor = [196, 214, 232], gnd = [150, 156, 150];
	for (let y = 0; y < h; y++) {
		const v = 1 - y / (h - 1), el = (v - 0.5) * Math.PI;
		for (let x = 0; x < w; x++) {
			const az = (x / w - 0.5) * 2 * Math.PI;
			const dx = Math.cos(el) * Math.cos(az), dy = Math.sin(el), dz = Math.cos(el) * Math.sin(az);
			const cosS = dx * sunDir.x + dy * sunDir.y + dz * sunDir.z;
			let col: number[];
			if (el >= 0) {
				const t = Math.pow(Math.min(1, el / 1.25), 0.5);
				col = [hor[0] + (zen[0] - hor[0]) * t, hor[1] + (zen[1] - hor[1]) * t, hor[2] + (zen[2] - hor[2]) * t];
				// fair-weather cumulus, thinning toward the zenith and the horizon
				if (el > 0.02) {
					const px = dx / (dy + 0.25), pz = dz / (dy + 0.25);
					const cl = sstep(0.08, 0.5, fbm(px * 2.2 + 3, pz * 2.2, 5) + 0.12) * sstep(0.02, 0.2, el) * (1 - sstep(0.9, 1.4, el));
					const lit = 0.85 + 0.15 * Math.max(0, cosS);
					col = [col[0] + (248 * lit - col[0]) * cl, col[1] + (248 * lit - col[1]) * cl, col[2] + (250 * lit - col[2]) * cl];
				}
			} else col = gnd.slice();
			const glow = Math.pow(Math.max(0, cosS), 10) * 60 + Math.pow(Math.max(0, cosS), 600) * 200;
			const o = (y * w + x) * 4;
			d[o] = Math.min(255, col[0] + glow); d[o + 1] = Math.min(255, col[1] + glow * 0.95); d[o + 2] = Math.min(255, col[2] + glow * 0.85); d[o + 3] = 255;
		}
	}
	g.putImageData(img, 0, 0);
	const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

// ---------------------------------------------------------------- models
interface Pack { license: string; images: Record<string, string>; models: Record<string, string> }
function b64(s: string) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
async function loadModels(aniso: number) {
	const pack: Pack = await (await fetch('models/traffic/traffic.json')).json();
	// images were pulled out of the GLBs when packing: decode them here (no blob or data URLs)
	const images: Record<string, THREE.Texture> = {};
	await Promise.all(Object.entries(pack.images).map(async ([id, s]) => {
		const bmp = await createImageBitmap(new Blob([b64(s)], { type: 'image/png' }), { imageOrientation: 'none', premultiplyAlpha: 'none' } as ImageBitmapOptions);
		const t = new THREE.Texture(bmp as unknown as HTMLImageElement);
		t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.needsUpdate = true;
		t.magFilter = THREE.NearestFilter; // palette texture: keep the colour cells crisp
		images[id] = t;
	}));
	const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
	const models: Record<string, THREE.Group> = {};
	await Promise.all(Object.entries(pack.models).map(async ([name, s]) => {
		const u = b64(s);
		const gltf = await loader.parseAsync(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer, '');
		gltf.scene.traverse((o) => {
			const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
			if (m && m.userData.map) { m.map = images[m.userData.map]; m.needsUpdate = true; }
		});
		models[name] = gltf.scene;
	}));
	// photo skins for the traffic (tools/car-skins): which model each one dresses
	// (optional: the sheets are third-party and stay out of the public repository; without them the traffic keeps Kenney's paint)
	type Skins = { cars: Record<string, { model: string; wheelsA: number[] | null; wheelsB: number[] | null }>; semis: Record<string, { cab: string }> };
	let skins: Skins = { cars: {}, semis: {} };
	try { const r = await fetch('models/traffic/skins/skins.json'); if (r.ok) skins = await r.json(); } catch { /* no skins */ }
	const atlases: Record<string, THREE.Texture> = {};
	await Promise.all([...Object.keys(skins.cars), ...Object.keys(skins.semis)].map(async (name) => {
		const blob = await (await fetch(`models/traffic/skins/${name}.webp`)).blob();
		const bmp = await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none' } as ImageBitmapOptions);
		const t = new THREE.Texture(bmp as unknown as HTMLImageElement);
		t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.needsUpdate = true;
		atlases[name] = t;
	}));
	return { models, license: pack.license, images, skins, atlases };
}

const FLEET: { name: string; len: number; w: number; truck?: boolean }[] = [
	{ name: 'sedan', len: 4.8, w: 4 }, { name: 'suv', len: 4.9, w: 3 }, { name: 'taxi', len: 4.8, w: 0.8 },
	{ name: 'police_car', len: 4.9, w: 0.3 }, { name: 'van', len: 5.3, w: 1.5 }, { name: 'truck', len: 7.5, w: 1.2, truck: true },
	{ name: 'delivery_van', len: 5.8, w: 1.2 }, { name: 'ambulance', len: 6.2, w: 0.15 }, { name: 'hatchback_sports', len: 4.3, w: 2 },
	{ name: 'sedan_sports', len: 4.6, w: 1 }, { name: 'suv_luxury', len: 5.0, w: 2 }, { name: 'truck_flat', len: 7.5, w: 1, truck: true },
	{ name: 'garbage_truck', len: 8.5, w: 0.2, truck: true }, { name: 'race_car', len: 4.6, w: 0.15 },
];

/** merge one model's meshes (node transforms baked) into a geometry per material */
function mergeByMaterial(root: THREE.Object3D) {
	root.updateMatrixWorld(true);
	const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
	root.traverse((o) => {
		const m = o as THREE.Mesh;
		if (!m.isMesh) return;
		const g = m.geometry.clone();
		for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
		const ng = g.index ? g.toNonIndexed() : g;
		// quantized attributes: bring them to float first (a transform would clamp them)
		for (const k of ['position', 'normal']) {
			const a = ng.getAttribute(k) as THREE.BufferAttribute;
			const f = new Float32Array(a.count * 3);
			for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
			ng.setAttribute(k, new THREE.BufferAttribute(f, 3));
		}
		ng.applyMatrix4(m.matrixWorld);
		const mat = m.material as THREE.Material;
		if (!parts.has(mat)) parts.set(mat, []);
		parts.get(mat)!.push(ng);
	});
	const out: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
	for (const [mat, list] of parts) {
		let n = 0; for (const g of list) n += g.getAttribute('position').count;
		const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
		let o = 0;
		for (const g of list) {
			pos.set(g.getAttribute('position').array as Float32Array, o * 3);
			nrm.set(g.getAttribute('normal').array as Float32Array, o * 3);
			o += g.getAttribute('position').count;
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
		geo.computeBoundingBox();
		out.push({ geo, mat });
	}
	return out;
}

// ================================================================ build
export async function buildHighway(opts: { renderer: THREE.WebGLRenderer; offsetX: number }): Promise<MapWorld> {
	const { renderer } = opts;
	const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
	const modelsP = loadModels(aniso);
	const disposables: { dispose(): void }[] = [];
	const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

	const root = new THREE.Group(); root.name = 'highway-map'; root.position.set(opts.offsetX, 0, 0);
	const road = centreline(), roads = [road], n = road.n;
	const lat = (k: number) => [-road.T[k * 2 + 1], road.T[k * 2]];

	// ---- spatial index of the centre line ----
	const GC = 50, grid = new Map<number, number[]>();
	const gkey = (ix: number, iz: number) => ix * 100003 + iz;
	for (let k = 0; k < n; k++) {
		const key = gkey(Math.floor(road.P[k * 2] / GC), Math.floor(road.P[k * 2 + 1] / GC));
		let l = grid.get(key); if (!l) grid.set(key, (l = [])); l.push(k);
	}
	function nearestRoad(x: number, z: number): RoadHit | null {
		const ix = Math.floor(x / GC), iz = Math.floor(z / GC);
		let best: RoadHit | null = null, bd = 1e9;
		for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
			const l = grid.get(gkey(ix + a, iz + b)); if (!l) continue;
			for (const k of l) {
				const k2 = (k + 1) % n;
				const ax = road.P[k * 2], az = road.P[k * 2 + 1], dx = road.P[k2 * 2] - ax, dz = road.P[k2 * 2 + 1] - az;
				const ll = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / ll, 0, 1);
				const qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(x - qx, z - qz);
				if (d < bd) {
					bd = d;
					const side = (x - qx) * -dz + (z - qz) * dx >= 0 ? 1 : -1;
					best = { ri: 0, k, t, d, side, y: road.Y[k] + (road.Y[k2] - road.Y[k]) * t, qx, qz };
				}
			}
		}
		return best;
	}
	/** position along the loop: centre, lateral axis and height at arc length s */
	function sample(s: number) {
		s = ((s % road.len) + road.len) % road.len;
		const u = (s / road.len) * n, k = Math.floor(u) % n, f = u - Math.floor(u), k2 = (k + 1) % n;
		const tx = road.T[k * 2] + (road.T[k2 * 2] - road.T[k * 2]) * f, tz = road.T[k * 2 + 1] + (road.T[k2 * 2 + 1] - road.T[k * 2 + 1]) * f;
		const tl = Math.hypot(tx, tz) || 1;
		return {
			x: road.P[k * 2] + (road.P[k2 * 2] - road.P[k * 2]) * f, z: road.P[k * 2 + 1] + (road.P[k2 * 2 + 1] - road.P[k * 2 + 1]) * f,
			y: road.Y[k] + (road.Y[k2] - road.Y[k]) * f, tx: tx / tl, tz: tz / tl,
		};
	}
	const arcOf = (h: RoadHit) => road.S[h.k] + h.t * ((road.S[(h.k + 1) % n] || road.len) - road.S[h.k]);

	// ---- the lay-by where the door and the car wait ----
	const PAD_S = 60, padA = sample(PAD_S), padL = [-padA.tz, padA.tx];
	const pad = { x: padA.x + padL[0] * 32, z: padA.z + padL[1] * 32, y: padA.y - 0.06 };
	const railGap = (s: number, side: number) => side > 0 && Math.abs(s - PAD_S) < 22;

	// ---- ground ----
	function terrainBase(x: number, z: number) {
		const r = Math.hypot(x / 1.45, z / 0.98);
		let h = 8 + 14 * fbm(x / 520, z / 520, 4) + 3 * fbm(x / 90 + 7, z / 90, 2);
		h += 70 * sstep(1350, 2600, r) * (0.6 + 0.4 * fbm(x / 800 + 3, z / 800, 3));
		return h;
	}
	function surfaceY(x: number, z: number, nr: RoadHit | null) {
		let y: number;
		if (!nr || nr.d >= BLEND) y = terrainBase(x, z);
		else if (nr.d <= EDGE) y = nr.y;
		else y = nr.y - 0.06 + (terrainBase(x, z) - nr.y + 0.06) * sstep(EDGE, BLEND, nr.d);
		const pw = 1 - sstep(24, 40, Math.hypot(x - pad.x, z - pad.z));
		return pw > 0 ? y + (pad.y - y) * pw : y;
	}
	function groundAt(x: number, z: number): Ground {
		const nr = nearestRoad(x, z);
		const h = surfaceY(x, z, nr);
		return { h, surf: nr && nr.d < ASPHALT && nr.d > BARRIER ? 0 : 1, road: nr, bank: 0 };
	}

	// ---- sky, light ----
	const sunDir = new THREE.Vector3(0.42, 0.62, -0.66).normalize();
	const sky = keep(skyTexture(sunDir));
	const pmrem = new THREE.PMREMGenerator(renderer);
	const env = keep(pmrem.fromEquirectangular(sky).texture); pmrem.dispose();
	const fog = new THREE.FogExp2(0xc4d3e2, 0.0006);
	const sun = new THREE.DirectionalLight(0xfff4e4, 3.4);
	sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
	const sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
	sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
	root.add(sun, sun.target);
	root.add(new THREE.HemisphereLight(0xc9dcf2, 0x6f6a55, 0.7));

	// ---- terrain: grass everywhere, cut away under the road corridor ----
	const grass = grassTextures(aniso); disposables.push(grass.map, grass.normalMap, grass.macro);
	function grassMaterial(far: boolean) {
		const m = keep(new THREE.MeshStandardMaterial({ map: grass.map, roughness: 0.95, metalness: 0 }));
		if (!far) { m.normalMap = grass.normalMap; m.normalScale = new THREE.Vector2(0.6, 0.6); }
		// the two variants patch the shader differently: keep their programs apart
		m.customProgramCacheKey = () => (far ? 'hw-grass-far' : 'hw-grass-near');
		m.onBeforeCompile = (sh) => {
			sh.uniforms.tMacro = { value: grass.macro };
			// world-space UVs: the terrain has no uv attribute
			sh.vertexShader = sh.vertexShader
				.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; attribute float aRoadD; varying float vRoadD;')
				.replace('#include <uv_vertex>', [
					'#include <uv_vertex>',
					'vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;',
					`vMapUv = wp0.xz / ${far ? '40.0' : '4.0'};`,
					far ? '' : 'vNormalMapUv = wp0.xz / 4.0;',
				].join('\n'))
				.replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vRoadD = aRoadD;');
			sh.fragmentShader = sh.fragmentShader
				.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying float vRoadD; uniform sampler2D tMacro;')
				.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + (far ? '' : 'if (vRoadD < 46.0) discard;'))
				.replace('#include <map_fragment>', [
					'vec4 sampledDiffuseColor = texture2D(map, vMapUv);',
					'vec4 mac = texture2D(tMacro, vWPos.xz / 900.0 + 0.3);',
					'vec3 c = sampledDiffuseColor.rgb;',
					'c *= mix(vec3(0.82, 0.86, 0.78), vec3(1.12, 1.04, 0.9), mac.r);',      // patches
					'c = mix(c, c * vec3(1.25, 1.1, 0.78), smoothstep(0.55, 0.8, mac.g) * 0.6);', // dry fields
					'diffuseColor.rgb *= c;',
				].join('\n'));
		};
		return m;
	}
	// coarse distance to the road (for the terrain cut-away and tree placement)
	const X0 = -2240, X1 = 2400, Z0 = -1600, Z1 = 1600;
	const DC = 32, DW = Math.round((X1 - X0) / DC) + 1, DH = Math.round((Z1 - Z0) / DC) + 1, dist = new Float32Array(DW * DH).fill(1e9);
	{
		const step = 5; // every 20 m of road
		for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) {
			const x = X0 + i * DC, z = Z0 + j * DC;
			let bd = 1e18;
			for (let k = 0; k < n; k += step) { const dx = road.P[k * 2] - x, dz = road.P[k * 2 + 1] - z, d = dx * dx + dz * dz; if (d < bd) bd = d; }
			dist[j * DW + i] = Math.sqrt(bd);
		}
	}
	function roadDist(x: number, z: number) {
		const nr = nearestRoad(x, z);
		if (nr) return nr.d;
		const i = clamp(Math.round((x - X0) / DC), 0, DW - 1), j = clamp(Math.round((z - Z0) / DC), 0, DH - 1);
		return Math.max(GC, dist[j * DW + i]);
	}
	const CELL = 16, NX = Math.round((X1 - X0) / CELL) + 1, NZ = Math.round((Z1 - Z0) / CELL) + 1;
	const H = new Float32Array(NX * NZ), RD = new Float32Array(NX * NZ);
	for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
		const x = X0 + i * CELL, z = Z0 + j * CELL, k = j * NX + i, nr = nearestRoad(x, z);
		H[k] = surfaceY(x, z, nr);
		RD[k] = nr ? nr.d : 999;
	}
	{
		// normals from the whole height field, so the tiles shade without seams
		const NRM = new Float32Array(NX * NZ * 3);
		for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
			const hl = H[j * NX + Math.max(0, i - 1)], hr = H[j * NX + Math.min(NX - 1, i + 1)];
			const hd = H[Math.max(0, j - 1) * NX + i], hu = H[Math.min(NZ - 1, j + 1) * NX + i];
			const nx = (hl - hr) / (2 * CELL), nz = (hd - hu) / (2 * CELL), l = Math.hypot(nx, 1, nz), k = (j * NX + i) * 3;
			NRM[k] = nx / l; NRM[k + 1] = 1 / l; NRM[k + 2] = nz / l;
		}
		// 512 m tiles: the frustum skips the ones you are not looking at
		const T = 32, mat = grassMaterial(false);
		for (let tj = 0; tj < NZ - 1; tj += T) for (let ti = 0; ti < NX - 1; ti += T) {
			const w = Math.min(T, NX - 1 - ti) + 1, h = Math.min(T, NZ - 1 - tj) + 1;
			const pos = new Float32Array(w * h * 3), nrm = new Float32Array(w * h * 3), rd = new Float32Array(w * h), idx: number[] = [];
			for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
				const src = (tj + j) * NX + ti + i, k = j * w + i;
				pos[k * 3] = X0 + (ti + i) * CELL; pos[k * 3 + 1] = H[src]; pos[k * 3 + 2] = Z0 + (tj + j) * CELL;
				nrm.set(NRM.subarray(src * 3, src * 3 + 3), k * 3); rd[k] = RD[src];
			}
			for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) { const a = j * w + i, b = a + 1, c = a + w, d = c + 1; idx.push(a, c, b, b, c, d); }
			const g = keep(new THREE.BufferGeometry());
			g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
			g.setAttribute('aRoadD', new THREE.BufferAttribute(rd, 1)); g.setIndex(idx);
			g.computeBoundingSphere();
			const tile = new THREE.Mesh(g, mat); tile.receiveShadow = true; tile.name = 'terrain';
			root.add(tile);
		}
		// skirt round the edge hides the seam with the far terrain
		const edges: number[] = [];
		for (let i = 0; i < NX; i++) edges.push(i);
		for (let j = 1; j < NZ; j++) edges.push(j * NX + NX - 1);
		for (let i = NX - 2; i >= 0; i--) edges.push((NZ - 1) * NX + i);
		for (let j = NZ - 2; j >= 1; j--) edges.push(j * NX);
		const E = edges.length, pos = new Float32Array(E * 2 * 3), rd = new Float32Array(E * 2).fill(999), idx: number[] = [];
		edges.forEach((e, q) => {
			const x = X0 + (e % NX) * CELL, z = Z0 + Math.floor(e / NX) * CELL;
			pos.set([x, H[e], z, x, H[e] - 40, z], q * 6);
		});
		for (let q = 0; q < E; q++) { const q2 = (q + 1) % E; idx.push(q * 2, q2 * 2, q * 2 + 1, q2 * 2, q2 * 2 + 1, q * 2 + 1); }
		const g = keep(new THREE.BufferGeometry());
		g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aRoadD', new THREE.BufferAttribute(rd, 1));
		g.setIndex(idx); g.computeVertexNormals();
		const skirtMat = grassMaterial(false); skirtMat.side = THREE.DoubleSide;
		root.add(new THREE.Mesh(g, skirtMat));
	}
	// far hills to the horizon (160 m cells; lowered under the detailed terrain)
	{
		const C = 160, N2 = 101, half = 8000;
		const pos = new Float32Array(N2 * N2 * 3), rd = new Float32Array(N2 * N2).fill(999);
		for (let j = 0; j < N2; j++) for (let i = 0; i < N2; i++) {
			const x = -half + i * C, z = -half + j * C, k = j * N2 + i;
			const r = Math.hypot(x / 1.45, z / 0.98);
			let h = terrainBase(x, z) + 160 * sstep(2600, 6000, r) * (0.55 + 0.45 * fbm(x / 1400, z / 1400, 4));
			if (x > X0 && x < X1 && z > Z0 && z < Z1) h -= 30;
			pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
		}
		const idx: number[] = [];
		for (let j = 0; j < N2 - 1; j++) for (let i = 0; i < N2 - 1; i++) { const a = j * N2 + i, b = a + 1, c = a + N2, d = c + 1; idx.push(a, c, b, b, c, d); }
		const g = keep(new THREE.BufferGeometry());
		g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		g.setAttribute('aRoadD', new THREE.BufferAttribute(rd, 1));
		g.setIndex(idx); g.computeVertexNormals();
		root.add(new THREE.Mesh(g, grassMaterial(true)));
	}
	function terrainH(x: number, z: number) {
		let fx = (x - X0) / CELL, fz = (z - Z0) / CELL;
		let i = Math.floor(fx), j = Math.floor(fz);
		if (i < 0 || j < 0 || i > NX - 2 || j > NZ - 2) return terrainBase(x, z);
		fx -= i; fz -= j;
		const a = H[j * NX + i], b = H[j * NX + i + 1], c = H[(j + 1) * NX + i], d = H[(j + 1) * NX + i + 1];
		return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
	}

	// ---- road surface, verges ----
	const rt = roadTextures(aniso); disposables.push(rt.map, rt.roughnessMap, rt.normalMap);
	const roadMat = keep(new THREE.MeshStandardMaterial({ map: rt.map, roughnessMap: rt.roughnessMap, normalMap: rt.normalMap, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.7, 0.7) }));
	const vergeMat = grassMaterial(false);
	vergeMat.polygonOffset = true; vergeMat.polygonOffsetFactor = -1; vergeMat.polygonOffsetUnits = -2;
	// everything along the road is built in 512 m chunks so the frustum culls what is behind you
	const CH = 128;
	const chunks: [number, number][] = [];
	for (let c0 = 0; c0 < n; c0 += CH) chunks.push([c0, Math.min(n, c0 + CH)]);
	const VC = [EDGE - 0.2, 21, 25, 30, 36, 42, BLEND + 2, BLEND + 2.01];
	for (const side of [-1, 1]) for (const [k0, k1] of chunks) {
		const rp: number[] = [], ru: number[] = [], ri: number[] = [];
		const vp: number[] = [], vd: number[] = [], vi: number[] = [];
		for (let kk = k0; kk <= k1; kk++) {
			const k = kk % n, L = lat(k), x = road.P[k * 2], z = road.P[k * 2 + 1], y = road.Y[k] + 0.01;
			const s = kk === n ? road.len : road.S[k];
			rp.push(x, y, z, x + L[0] * side * EDGE, y, z + L[1] * side * EDGE);
			ru.push(0, s / TEX_ALONG, 1, s / TEX_ALONG);
			VC.forEach((d, c) => {
				const px = x + L[0] * side * d, pz = z + L[1] * side * d;
				let py = surfaceY(px, pz, { ri: 0, k, t: 0, d, side, y: road.Y[k], qx: x, qz: z });
				if (c === 0) py = y - 0.03;
				if (c === VC.length - 1) py -= 3; // skirt
				vp.push(px, py, pz); vd.push(99);
			});
		}
		for (let q = 0; q < k1 - k0; q++) {
			const a = q * 2;
			if (side > 0) ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else ri.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
			const C = VC.length;
			for (let c = 0; c < C - 1; c++) {
				const p = q * C + c, r = p + 1, p2 = p + C, r2 = p2 + 1;
				if (side > 0) vi.push(p, r, p2, r, r2, p2); else vi.push(p, p2, r, r, p2, r2);
			}
		}
		const g = keep(new THREE.BufferGeometry());
		g.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2));
		g.setIndex(ri); g.computeVertexNormals();
		const m = new THREE.Mesh(g, roadMat); m.receiveShadow = true; m.name = 'road'; root.add(m);
		const g2 = keep(new THREE.BufferGeometry());
		g2.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3)); g2.setAttribute('aRoadD', new THREE.Float32BufferAttribute(vd, 1));
		g2.setIndex(vi); g2.computeVertexNormals();
		const m2 = new THREE.Mesh(g2, vergeMat); m2.receiveShadow = true; root.add(m2);
	}

	// ---- extrusions along the road: median barrier, guardrails ----
	function extrude(profile: number[][], side: number, offset: number, mat: THREE.Material, skip?: (s: number) => boolean, uScale = 6) {
		const C = profile.length;
		for (const [k0, k1] of chunks) {
			const pos: number[] = [], uv: number[] = [], idx: number[] = [];
			let run = 0, start = 0;
			const flush = () => {
				for (let q = 0; q < run - 1; q++) for (let c = 0; c < C - 1; c++) {
					const a = (start + q) * C + c, b = a + 1, a2 = a + C, b2 = a2 + 1;
					if (side >= 0) idx.push(a, a2, b, b, a2, b2); else idx.push(a, b, a2, b, b2, a2);
				}
				run = 0;
			};
			for (let kk = k0; kk <= k1; kk++) {
				const k = kk % n, s = kk === n ? road.len : road.S[k];
				if (skip && skip(s)) { flush(); continue; }
				if (!run) start = pos.length / 3 / C;
				run++;
				const L = lat(k), x = road.P[k * 2], z = road.P[k * 2 + 1], y = road.Y[k];
				let acc = 0;
				profile.forEach((p, c) => {
					// profile x runs outward from the centre line on either side
					const d = (offset + p[0]) * side;
					pos.push(x + L[0] * d, y + p[1], z + L[1] * d);
					if (c > 0) acc += Math.hypot(p[0] - profile[c - 1][0], p[1] - profile[c - 1][1]);
					uv.push(s / uScale, acc);
				});
			}
			flush();
			if (!idx.length) continue;
			const g = keep(new THREE.BufferGeometry());
			g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
			g.setIndex(idx); g.computeVertexNormals();
			const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; root.add(m);
		}
	}
	const concrete = keep(concreteTexture(aniso));
	const barrierMat = keep(new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.88, metalness: 0, side: THREE.DoubleSide }));
	// jersey barrier profile (lateral, height), from one face over the top to the other
	extrude([[-0.3, 0.01], [-0.21, 0.08], [-0.09, 0.33], [-0.075, 0.81], [0.075, 0.81], [0.09, 0.33], [0.21, 0.08], [0.3, 0.01]], 1, 0, barrierMat);
	const steel = keep(new THREE.MeshStandardMaterial({ color: 0xb9bec2, roughness: 0.42, metalness: 0.85, side: THREE.DoubleSide }));
	// W-beam: the corrugated rail facing the traffic
	const wbeam = [[0.0, 0.48], [-0.07, 0.53], [-0.03, 0.6], [-0.07, 0.68], [0.0, 0.76], [0.06, 0.76], [0.06, 0.48], [0.0, 0.48]];
	for (const side of [-1, 1]) extrude(wbeam, side, RAIL, steel, (s) => railGap(s, side));
	// posts every 4 m, lamp posts in the median every 72 m
	{
		const postG = keep(new THREE.BoxGeometry(0.1, 0.8, 0.15)); postG.translate(0, 0.4, 0);
		const M = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
		for (const [k0, k1] of chunks) {
			const mats: THREE.Matrix4[] = [];
			for (const side of [-1, 1]) for (let k = k0; k < k1; k++) {
				if (railGap(road.S[k], side)) continue;
				const L = lat(k), d = RAIL + 0.13;
				q.setFromAxisAngle(Y, Math.atan2(road.T[k * 2], road.T[k * 2 + 1]));
				mats.push(M.compose(new THREE.Vector3(road.P[k * 2] + L[0] * d * side, road.Y[k] - 0.05, road.P[k * 2 + 1] + L[1] * d * side), q, one).clone());
			}
			const posts = new THREE.InstancedMesh(postG, steel, mats.length);
			mats.forEach((m, i) => posts.setMatrixAt(i, m));
			posts.computeBoundingSphere();
			posts.castShadow = true; root.add(posts);
		}

		const poleMat = keep(new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.5, metalness: 0.7 }));
		const poleG = keep(new THREE.CylinderGeometry(0.09, 0.14, 12, 8)); poleG.translate(0, 6.8, 0);
		const armG = keep(new THREE.BoxGeometry(0.08, 0.08, 4.2)); armG.translate(0, 12.6, 0);
		const headG = keep(new THREE.BoxGeometry(0.34, 0.12, 0.7));
		const headMat = keep(new THREE.MeshStandardMaterial({ color: 0x6d7175, roughness: 0.4, metalness: 0.6, emissive: 0x111111 }));
		const every = 18, count = Math.floor(n / every);
		const poles = new THREE.InstancedMesh(poleG, poleMat, count), arms = new THREE.InstancedMesh(armG, poleMat, count), heads = new THREE.InstancedMesh(headG, headMat, count * 2);
		for (const m of [poles, arms, heads]) m.frustumCulled = false;
		for (let i = 0; i < count; i++) {
			const k = i * every, L = lat(k);
			q.setFromAxisAngle(Y, Math.atan2(L[0], L[1]));
			const p = new THREE.Vector3(road.P[k * 2], road.Y[k] + 0.8, road.P[k * 2 + 1]);
			poles.setMatrixAt(i, M.compose(p, q, one)); arms.setMatrixAt(i, M.compose(p, q, one));
			for (const side of [-1, 1]) heads.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), M.compose(new THREE.Vector3(p.x + L[0] * 2.05 * side, p.y + 12.5, p.z + L[1] * 2.05 * side), q, one));
		}
		for (const m of [poles, arms, heads]) { m.castShadow = true; root.add(m); }
	}

	// ---- overhead signs ----
	const signs: { s: number; side: number; lines: string[] }[] = [
		{ s: 900, side: 1, lines: ['Ring Road', 'Lay-by 7 km'] }, { s: 4300, side: 1, lines: ['Studio', 'next exit: none'] },
		{ s: 2600, side: -1, lines: ['Ring Road', 'all directions'] }, { s: 6400, side: -1, lines: ['Lay-by', '6 km'] },
	];
	for (const sg of signs) {
		const k = Math.floor((sg.s / road.len) * n), L = lat(k), x = road.P[k * 2], z = road.P[k * 2 + 1], y = road.Y[k];
		const g = new THREE.Group();
		const { c, g: cx } = canvas(512, 160);
		cx.fillStyle = '#0d5a2c'; cx.fillRect(0, 0, 512, 160);
		cx.strokeStyle = '#f2f2f2'; cx.lineWidth = 6; cx.strokeRect(8, 8, 496, 144);
		cx.fillStyle = '#f2f2f2'; cx.textBaseline = 'middle';
		cx.font = '700 54px system-ui, sans-serif'; cx.fillText(sg.lines[0], 34, 54);
		cx.font = '500 40px system-ui, sans-serif'; cx.fillText(sg.lines[1], 34, 114);
		cx.font = '700 70px system-ui, sans-serif'; cx.textAlign = 'right'; cx.fillText('↑', 486, 80);
		const st = keep(tex(c, true, aniso, false));
		const face = new THREE.Mesh(keep(new THREE.PlaneGeometry(7.2, 2.25)), keep(new THREE.MeshStandardMaterial({ map: st, roughness: 0.6, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 0.08 })));
		face.position.set(-(INNER + 7.5), 7.6, 0); face.rotation.y = Math.PI; g.add(face);
		const back = new THREE.Mesh(keep(new THREE.BoxGeometry(7.3, 2.35, 0.08)), steel); back.position.set(-(INNER + 7.5), 7.6, 0.06); g.add(back);
		const beam = new THREE.Mesh(keep(new THREE.BoxGeometry(17.2, 0.35, 0.35)), steel); beam.position.set(-8.9, 6.4, 0.25); g.add(beam);
		for (const px of [-0.45, -17.4]) { const post = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.16, 0.2, 6.6, 10)), steel); post.position.set(px, 3.3, 0.25); g.add(post); }
		g.traverse((o) => { o.castShadow = true; });
		g.position.set(x, y, z);
		// local -x points across the carriageway; faces traffic travelling with (side>0) or against (side<0) the tangent
		const dir = sg.side > 0 ? 1 : -1;
		g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
			new THREE.Vector3(-L[0] * sg.side, 0, -L[1] * sg.side), new THREE.Vector3(0, 1, 0), new THREE.Vector3(road.T[k * 2] * dir, 0, road.T[k * 2 + 1] * dir)));
		root.add(g);
	}
	// lay-by sign
	{
		const { c, g: cx } = canvas(128, 128);
		cx.fillStyle = '#1c4fa0'; cx.fillRect(0, 0, 128, 128); cx.fillStyle = '#fff'; cx.font = '700 96px system-ui, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('P', 64, 70);
		const st = keep(tex(c, true, aniso, false));
		const k = Math.floor(((PAD_S - 40) / road.len) * n), L = lat(k), d = ASPHALT + 0.6;
		const sgn = new THREE.Group();
		const plate = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.9, 0.9)), keep(new THREE.MeshStandardMaterial({ map: st, roughness: 0.5 })));
		plate.position.y = 2.3; plate.rotation.y = Math.PI; sgn.add(plate);
		const post = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8)), steel); post.position.y = 1.15; sgn.add(post);
		sgn.position.set(road.P[k * 2] + L[0] * d, road.Y[k], road.P[k * 2 + 1] + L[1] * d);
		sgn.rotation.y = Math.atan2(road.T[k * 2], road.T[k * 2 + 1]);
		sgn.traverse((o) => { o.castShadow = true; });
		root.add(sgn);
	}

	// ---- models: trees and traffic ----
	const { models, license, images, skins, atlases } = await modelsP;
	for (const t of Object.values(images)) disposables.push(t);
	const treeCol: number[] = [];
	const treeSets: { src: Float32Array; count: number; meshes: THREE.InstancedMesh[] }[] = [];
	let cullTimer = 0;
	const lastCull = new THREE.Vector3(1e9, 0, 0);
	function cullTrees(cx: number, cz: number, fx: number, fz: number) {
		const R2 = 900 * 900;
		for (const set of treeSets) {
			const dst = set.meshes[0].instanceMatrix.array as Float32Array;
			let k = 0;
			for (let i = 0; i < set.count; i++) {
				const o = i * 16, dx = set.src[o + 12] - cx, dz = set.src[o + 14] - cz, d2 = dx * dx + dz * dz;
				if (d2 > R2) continue;
				// behind the camera: only the nearest (they still cast shadows into view)
				if (d2 > 3600 && dx * fx + dz * fz < -0.35 * Math.sqrt(d2)) continue;
				for (let j = 0; j < 16; j++) dst[k * 16 + j] = set.src[o + j];
				k++;
			}
			set.meshes.forEach((m, mi) => {
				if (mi > 0) (m.instanceMatrix.array as Float32Array).set(dst.subarray(0, k * 16));
				m.count = k; m.instanceMatrix.needsUpdate = true;
				m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, k * 16);
			});
		}
	}
	{
		const kinds = ['tree_pine_tall', 'tree_pine', 'tree_oak', 'tree_fat', 'bush_large', 'rock_large'];
		const heights = [14, 11, 10, 8, 1.6, 1.4];
		const tint: Record<string, number> = { leafsDark: 0x2c4424, leafsGreen: 0x4a6a2c, woodBarkDark: 0x3e3026, woodBark: 0x5b4634, grass: 0x56743a, dirt: 0x6f6252 };
		for (const k of kinds) models[k].traverse((o) => {
			const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
			if (m && tint[m.name] !== undefined) { m.color.setHex(tint[m.name]); m.roughness = 0.92; m.metalness = 0; }
		});
		const merged = kinds.map((k) => mergeByMaterial(models[k]));
		const unit = merged.map((parts) => { const b = new THREE.Box3(); parts.forEach((p) => b.union(p.geo.boundingBox!)); return b; });
		// all trees of a kind share one instanced mesh per material; each update
		// fills it with only the trees near the camera and in front of it
		const M = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
		const STEP = 22, all: number[][] = kinds.map(() => []);
		for (let z = Z0 + 40; z < Z1 - 40; z += STEP) for (let x = X0 + 40; x < X1 - 40; x += STEP) {
			const px = x + (hash2(x | 0, z | 0) - 0.5) * STEP, pz = z + (hash2((z | 0) + 5, (x | 0) - 3) - 0.5) * STEP;
			const rd = roadDist(px, pz);
			if (rd < 30 || rd > 430 || Math.hypot(px - pad.x, pz - pad.z) < 40) continue;
			const forest = fbm(px / 260 + 11, pz / 260, 3);
			const r = hash2((px * 3) | 0, (pz * 7) | 0);
			if (!(forest > 0.1 || r < 0.05)) continue;
			let kind: number;
			const pick = hash2((px | 0) + 99, (pz | 0) - 41);
			if (forest > 0.1) kind = pick < 0.35 ? 0 : pick < 0.6 ? 1 : pick < 0.8 ? 2 : pick < 0.92 ? 3 : 4;
			else kind = pick < 0.5 ? 2 : pick < 0.75 ? 3 : pick < 0.9 ? 4 : 5;
			const b = unit[kind], hgt = heights[kind] * (0.75 + 0.5 * hash2((px | 0) - 7, (pz | 0) + 13));
			const s = hgt / (b.max.y - b.min.y);
			q.setFromAxisAngle(Y, hash2(px | 0, (pz | 0) + 1) * Math.PI * 2);
			M.compose(new THREE.Vector3(px, terrainH(px, pz) - 0.15 - b.min.y * s, pz), q, new THREE.Vector3(s, s * (0.9 + 0.2 * hash2(pz | 0, px | 0)), s));
			all[kind].push(...M.elements);
			if (kind < 4) treeCol.push(px, pz, kind < 2 ? 0.35 : 0.5);
		}
		kinds.forEach((_, kind) => {
			const src = new Float32Array(all[kind]), count = src.length / 16;
			if (!count) return;
			const meshes = merged[kind].map((part) => {
				const im = new THREE.InstancedMesh(part.geo, part.mat, count);
				im.count = 0; im.frustumCulled = false;
				im.castShadow = kind !== 5; im.receiveShadow = true;
				root.add(im);
				return im;
			});
			treeSets.push({ src, count, meshes });
		});
		merged.forEach((parts) => parts.forEach((p) => { disposables.push(p.geo, p.mat); }));
	}
	const TG = 10, treeGrid = new Map<number, number[]>();
	for (let i = 0; i < treeCol.length; i += 3) {
		const key = gkey(Math.floor(treeCol[i] / TG), Math.floor(treeCol[i + 1] / TG));
		let l = treeGrid.get(key); if (!l) treeGrid.set(key, (l = [])); l.push(i);
	}

	// ---- traffic ----
	const cars: TrafficCar[] = [];
	// variants: every skinned car, the lorries, and the plain Kenney cars less often
	const variants: Variant[] = [];
	for (const f of FLEET) {
		models[f.name].traverse((o) => {
			const m = o as THREE.Mesh;
			if (!m.isMesh) return;
			const mat = m.material as THREE.MeshStandardMaterial;
			mat.roughness = 0.42; mat.metalness = 0.12; mat.envMapIntensity = 1.2; disposables.push(mat, m.geometry);
		});
		variants.push(kenneyVariant(f.name, models[f.name], f.len, { truck: f.truck, weight: f.w * 0.45 }));
	}
	for (const [name, sk] of Object.entries(skins.cars)) {
		const f = FLEET.find((q) => q.name === sk.model) ?? { len: 4.8, truck: false };
		variants.push(kenneyVariant(name, models[sk.model], f.len, { atlas: atlases[name], truck: f.truck, weight: 1.6, wheelsU: { A: sk.wheelsA, B: sk.wheelsB } }));
	}
	const truckWheel = kenneyVariant('_wheel', models.truck, 6, { weight: 0 }).wheels[0];
	for (const name of Object.keys(skins.semis)) variants.push(semiVariant(name, atlases[name], truckWheel, 1.3));
	for (const v of variants) for (const b of v.body) disposables.push(b.mat);
	for (const t of Object.values(atlases)) disposables.push(t);
	const fleetW = variants.reduce((a, v) => a + v.weight, 0);
	const pickVariant = () => { let a = Math.random() * fleetW; for (let i = 0; i < variants.length; i++) { a -= variants[i].weight; if (a <= 0) return i; } return 0; };
	const TRAFFIC = 32;
	const fleet = new Fleet(root, variants, TRAFFIC);
	let camX = 0, camZ = 0;
	function spawnCar(c: TrafficCar | null, side: number, p: number, lane: number): TrafficCar {
		const vi = pickVariant(), v = variants[vi];
		if (!c) c = { variant: vi, model: v.id, spin: 0, side, lane, target: lane, p, v: 0, v0: 0, len: v.len, wid: v.wid, truck: v.truck, think: Math.random() * 2, crash: 0, x: 0, z: 0, yaw: 0, vx: 0, vz: 0 };
		else { c.variant = vi; c.model = v.id; c.len = v.len; c.wid = v.wid; c.truck = v.truck; }
		if (c.truck) lane = Math.max(1, lane);
		c.side = side; c.lane = c.target = lane; c.p = ((p % road.len) + road.len) % road.len;
		c.v0 = c.truck ? 22 + Math.random() * 3 : [34, 30, 27][lane] + (Math.random() - 0.4) * 5;
		c.v = c.v0 * 0.95; c.crash = 0;
		return c;
	}
	// progress along each carriageway: side +1 drives with the tangent, side -1 against it
	const arcAt = (side: number, p: number) => (side > 0 ? p : road.len - p);
	const progressOf = (side: number, s: number) => (side > 0 ? s : road.len - s);
	const wrap = (d: number) => { d %= road.len; if (d > road.len / 2) d -= road.len; if (d < -road.len / 2) d += road.len; return d; };
	let player = { s: 0, d: 0, side: 1, v: 0, on: false };
	function placeTraffic(start: number) {
		for (let i = 0; i < TRAFFIC; i++) {
			const side = i % 2 ? 1 : -1, lane = Math.floor(Math.random() * LANES);
			const p = progressOf(side, start) + (i / TRAFFIC - 0.5) * 1400 + (Math.random() - 0.5) * 30;
			cars.push(spawnCar(null, side, p, lane)!);
		}
	}
	function leaderGap(c: TrafficCar, lane: number) {
		let gap = 400, lv = c.v0;
		for (const o of cars) {
			if (o === c || o.side !== c.side) continue;
			if (Math.abs(o.lane - lane) > 0.7 && Math.abs(o.target - lane) > 0.1) continue;
			const g = wrap(o.p - c.p) - (o.len + c.len) / 2;
			if (g > -c.len * 0.5 && g < gap) { gap = Math.max(0.1, g); lv = o.v; }
		}
		// the player (on foot or driving) counts as a vehicle in the lane
		if (player.on && player.side === c.side) {
			const pl = (player.d - INNER) / LANE - 0.5;
			if (Math.abs(pl - lane) < 0.8) {
				const g = wrap(progressOf(c.side, player.s) - c.p) - c.len / 2 - 2.3;
				if (g > -c.len * 0.5 && g < gap) { gap = Math.max(0.1, g); lv = player.v; }
			}
		}
		return { gap, lv };
	}
	function followerAfter(c: TrafficCar, lane: number) {
		// the nearest car behind in `lane`: what it would have to brake if we moved in
		let worst = 0;
		for (const o of cars) {
			if (o === c || o.side !== c.side || Math.abs(o.lane - lane) > 0.7) continue;
			const g = wrap(c.p - o.p) - (o.len + c.len) / 2;
			if (g < -c.len * 0.5 || g > 120) continue;
			worst = Math.min(worst, idm(o.v, o.v0, Math.max(0.1, g), c.v));
			if (g < 4) return -99;
		}
		return worst;
	}
	function idm(v: number, v0: number, gap: number, lv: number) {
		const a = 1.5, b = 2.4, s0 = 2.5, T = 1.25;
		const ss = s0 + Math.max(0, v * T + (v * (v - lv)) / (2 * Math.sqrt(a * b)));
		return a * (1 - Math.pow(v / v0, 4) - (ss / gap) ** 2);
	}
	const pose = new THREE.Matrix4(), pq = new THREE.Quaternion(), pp = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), UPV = new THREE.Vector3(0, 1, 0);
	function updateTraffic(dt: number) {
		fleet.begin();
		for (const c of cars) {
			if (c.crash > 0) {
				c.crash -= dt; c.v = Math.max(0, c.v - 7 * dt);
			} else {
				const { gap, lv } = leaderGap(c, c.target);
				const acc = clamp(idm(c.v, c.v0, gap, lv), -9, 2);
				c.v = Math.max(0, c.v + acc * dt);
				// lane changes: go where the car ahead lets you go faster, keep right otherwise
				c.think -= dt;
				if (c.think <= 0 && c.lane === c.target) {
					c.think = 1.5 + Math.random() * 2;
					let best = c.target, bestGain = 0.35;
					for (const nl of [c.target - 1, c.target + 1]) {
						if (nl < 0 || nl >= LANES || (c.truck && nl === 0)) continue;
						const here = acc, there = idm(c.v, c.v0, leaderGap(c, nl).gap, leaderGap(c, nl).lv);
						const gain = there - here + (nl > c.target ? 0.22 : -0.05);
						if (gain > bestGain && followerAfter(c, nl) > -3) { best = nl; bestGain = gain; }
					}
					c.target = best;
				}
			}
			const dl = c.target - c.lane;
			c.lane += clamp(dl, -dt * 0.33, dt * 0.33);
			c.p = (c.p + c.v * dt) % road.len;
			// recycle cars that drift out of the bubble round the player
			const rel = wrap(c.p - progressOf(c.side, player.s));
			if (Math.abs(rel) > 820) {
				for (let tries = 0; tries < 6; tries++) {
					const dir = Math.random() < 0.5 ? 1 : -1, np = progressOf(c.side, player.s) + dir * (620 + Math.random() * 160);
					const lane = Math.floor(Math.random() * LANES);
					if (cars.every((o) => o === c || o.side !== c.side || Math.abs(o.lane - lane) > 0.7 || Math.abs(wrap(o.p - np)) > 45)) { spawnCar(c, c.side, np, lane); break; }
				}
			}
			// pose
			const s = arcAt(c.side, c.p), a = sample(s), L = [-a.tz, a.tx], off = laneOffset(c.lane) * c.side;
			const dirx = a.tx * c.side, dirz = a.tz * c.side;
			const latV = (clamp(dl, -1, 1) !== 0 ? Math.sign(dl) * 0.33 * LANE : 0) * c.side;
			c.x = a.x + L[0] * off; c.z = a.z + L[1] * off;
			c.vx = dirx * c.v + L[0] * latV; c.vz = dirz * c.v + L[1] * latV;
			c.yaw = c.v > 1 ? Math.atan2(c.vx, c.vz) : Math.atan2(dirx, dirz);
			c.spin = (c.spin + (c.v * dt) / variants[c.variant].wheelR) % (Math.PI * 2);
			if (Math.abs(rel) > 700) continue; // out in the haze: not drawn
			pose.compose(pp.set(c.x, a.y + 0.01, c.z), pq.setFromAxisAngle(UPV, c.yaw), one);
			fleet.add(c.variant, pose, c.spin, (c.x - camX) ** 2 + (c.z - camZ) ** 2 < 90 * 90);
		}
		fleet.end();
	}
	placeTraffic(PAD_S + 200);

	// ---- collisions for the player's car ----
	function hit(x: number, z: number, r: number): Contact | null {
		let out: Contact | null = null;
		const better = (c: Contact) => { if (!out || c.pen > out.pen) out = c; };
		const nr = nearestRoad(x, z);
		if (nr) {
			const k = nr.k, L = lat(k), s = arcOf(nr);
			// median barrier
			if (nr.d < BARRIER + r) better({ nx: L[0] * nr.side, nz: L[1] * nr.side, pen: BARRIER + r - nr.d });
			// guardrails (except at the lay-by)
			if (nr.d > RAIL - r && nr.d < RAIL + 0.6 && !railGap(s, nr.side)) better({ nx: -L[0] * nr.side, nz: -L[1] * nr.side, pen: nr.d - (RAIL - r) });
		}
		// trees
		const ix = Math.floor(x / TG), iz = Math.floor(z / TG);
		for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
			const l = treeGrid.get(gkey(ix + a, iz + b)); if (!l) continue;
			for (const i of l) {
				const dx = x - treeCol[i], dz = z - treeCol[i + 1], rr = r + treeCol[i + 2], d2 = dx * dx + dz * dz;
				if (d2 < rr * rr) { const d = Math.sqrt(d2) || 0.001; better({ nx: dx / d, nz: dz / d, pen: rr - d }); }
			}
		}
		// traffic: two circles along each car
		for (const c of cars) {
			const dx0 = x - c.x, dz0 = z - c.z;
			if (dx0 * dx0 + dz0 * dz0 > 100) continue;
			const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), cr = c.wid / 2, reach = c.len / 2 - cr;
			for (const u of [-reach, reach]) {
				const dx = dx0 - fx * u, dz = dz0 - fz * u, rr = r + cr, d2 = dx * dx + dz * dz;
				if (d2 < rr * rr) {
					const d = Math.sqrt(d2) || 0.001;
					better({
						nx: dx / d, nz: dz / d, pen: rr - d, vx: c.vx, vz: c.vz,
						push: (jx, jz) => {
							// the other car takes the hit along its heading, then pulls over to a stop
							const along = jx * fx + jz * fz;
							c.v = Math.max(0, c.v + along * 0.6);
							if (Math.hypot(jx, jz) > 2) c.crash = 4;
						},
					});
				}
			}
		}
		return out;
	}

	// ---- poses ----
	const padT = { x: padA.tx, z: padA.tz };
	const door: Pose = { x: pad.x + padL[0] * 4, z: pad.z + padL[1] * 4, yaw: Math.atan2(-padL[0], -padL[1]) };
	const carK = sample(PAD_S + 8), carL = [-carK.tz, carK.tx];
	const car: Pose = { x: carK.x + carL[0] * 14.9, z: carK.z + carL[1] * 14.9, yaw: Math.atan2(padT.x, padT.z) };
	const spawn: Pose = { x: door.x - padL[0] * 2.2, z: door.z - padL[1] * 2.2, yaw: Math.atan2(padL[0], padL[1]) };
	function resetPose(x: number, z: number, yaw: number): Pose {
		const nr = nearestRoad(x, z);
		let s = 0, side = 1;
		if (nr) { s = arcOf(nr); side = nr.side; }
		else {
			let bd = 1e18;
			for (let k = 0; k < n; k += 4) { const d = (road.P[k * 2] - x) ** 2 + (road.P[k * 2 + 1] - z) ** 2; if (d < bd) { bd = d; s = road.S[k]; } }
			const a = sample(s); side = (x - a.x) * -a.tz + (z - a.z) * a.tx >= 0 ? 1 : -1;
		}
		void yaw;
		// the hard shoulder on that side, facing the way that carriageway runs
		const a = sample(s), L = [-a.tz, a.tx], d = (ASPHALT - 1.6) * side;
		return { x: a.x + L[0] * d, z: a.z + L[1] * d, yaw: Math.atan2(a.tx * side, a.tz * side) };
	}
	function clearSpot(x: number, z: number) {
		const d = roadDist(x, z);
		if (d < 20 && Math.hypot(x - pad.x, z - pad.z) > 26) return false;
		const ix = Math.floor(x / TG), iz = Math.floor(z / TG);
		for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
			const l = treeGrid.get(gkey(ix + a, iz + b)); if (!l) continue;
			for (const i of l) if (Math.hypot(x - treeCol[i], z - treeCol[i + 1]) < treeCol[i + 2] + 1.2) return false;
		}
		return true;
	}

	return {
		kind: 'highway', root, roads, nearestRoad, groundAt, hit, clearSpot, resetPose,
		sky, fog, env, sun, sunDir, door, car, spawn,
		bounds: { minX: X0 + 20, maxX: X1 - 20, minZ: Z0 + 20, maxZ: Z1 - 20 },
		mu: [1.05, 0.62, 0.6], roll: [0.1, 0.55, 1.6], kick: [0, 0.35], sprayColor: 0x8d8a82,
		credits: 'Car: “art of rally Latest Version 2027” by FarHandle5255 (Sketchfab, CC BY 4.0) · Traffic and trees: ' + license.split(',')[0] + ', CC0',
		traffic: { cars },
		update(dt, _t, pl) {
			if (pl.cam) { camX = pl.cam.x - opts.offsetX; camZ = pl.cam.z; } else { camX = pl.x; camZ = pl.z; }
			// trees: refill the visible set when the view has moved or turned
			cullTimer -= dt;
			const cam = pl.cam, fwd = pl.fwd;
			if (cam && fwd && (cullTimer <= 0 || lastCull.distanceToSquared(cam) > 400)) {
				cullTimer = 0.25; lastCull.copy(cam);
				const fl = Math.hypot(fwd.x, fwd.z) || 1;
				cullTrees(cam.x - opts.offsetX, cam.z, fwd.x / fl, fwd.z / fl);
			}
			const nr = nearestRoad(pl.x, pl.z);
			if (nr) {
				const s = arcOf(nr), a = sample(s), dir = nr.side;
				player = { s, d: nr.d, side: nr.side, v: Math.max(0, (pl.vx * a.tx + pl.vz * a.tz) * dir), on: nr.d > BARRIER && nr.d < INNER + LANE * LANES + 0.5 };
			} else player.on = false;
			updateTraffic(Math.min(dt, 0.05));
		},
		setActive() {},
		dispose() {
			root.removeFromParent();
			fleet.dispose();
			root.traverse((o) => { const m = o as THREE.Mesh; if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose(); });
			for (const d of disposables) d.dispose();
		},
	};
}

/** for tests: the pure road geometry without building anything */
export const _internals = { centreline, laneOffset, LANES, INNER, LANE, RAIL, hash1 };
