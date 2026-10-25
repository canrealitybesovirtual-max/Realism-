import * as THREE from 'three';

/**
 * Procedural, skinned human hand.
 *
 * One smooth SkinnedMesh (palm, five fingers, fingernails, a forearm that
 * dithers out) on a 20-bone skeleton laid out in the WebXR hand-joint
 * convention: every bone's -Z points along the bone toward the fingertip and
 * +Y points out of the back of the hand. That lets the same rig be driven
 * either by named poses (controllers) or directly by tracked joint poses
 * (WebXR hand input).
 *
 * Dimensions are an average adult hand (palm 95 mm, middle finger 96 mm).
 * Origin: centre of the wrist joint.
 */

export type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
export const FINGERS: Finger[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

/** Flexion per joint in degrees (thumb: [cmc flex, cmc opposition, mcp, ip]). */
export interface HandPose {
	thumb: [number, number, number, number];
	index: [number, number, number];
	middle: [number, number, number];
	ring: [number, number, number];
	pinky: [number, number, number];
	/** finger spread in degrees (abduction at the knuckles) */
	spread: number;
}

const P = (thumb: HandPose['thumb'], index: HandPose['index'], middle: HandPose['middle'], ring: HandPose['ring'], pinky: HandPose['pinky'], spread = 0): HandPose =>
	({ thumb, index, middle, ring, pinky, spread });

export const POSES = {
	relaxed: P([8, 12, 12, 10], [14, 18, 10], [18, 22, 12], [22, 26, 14], [26, 28, 16], 3),
	open: P([-5, 0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], 8),
	fist: P([22, 38, 38, 40], [82, 98, 58], [84, 100, 60], [86, 100, 60], [88, 98, 58], 0),
	/** index straight for poking keys and the screen; others tucked */
	point: P([20, 34, 30, 32], [2, 4, 2], [80, 98, 58], [84, 100, 60], [86, 98, 58], 0),
	/** wrapped around a controller grip, trigger finger relaxed */
	gripController: P([18, 28, 20, 18], [30, 38, 18], [70, 82, 44], [74, 84, 46], [76, 82, 44], 0),
	/** thumb + index meeting, others loosely curled (pen) */
	pinch: P([20, 38, 26, 28], [38, 46, 24], [52, 64, 36], [58, 70, 40], [62, 72, 42], 0),
	/** three fingers through a mug handle, thumb resting on top of it */
	mugHandle: P([8, 18, 14, 20], [62, 88, 52], [66, 92, 56], [70, 92, 54], [64, 76, 42], 0),
	/** flat thumb-over-fingers grip on a book cover */
	book: P([34, 52, 8, 4], [18, 14, 6], [20, 16, 6], [22, 18, 8], [24, 20, 10], 2),
	/** palm resting over a mouse, index/middle on the buttons */
	mouse: P([4, 30, 12, 10], [22, 22, 12], [24, 24, 12], [34, 36, 18], [40, 40, 20], 5),
} satisfies Record<string, HandPose>;
export type PoseName = keyof typeof POSES;

export function blendPose(a: HandPose, b: HandPose, t: number, out?: HandPose): HandPose {
	const o = out ?? structuredClone(a);
	const l = (x: number, y: number) => x + (y - x) * t;
	for (const f of FINGERS) {
		const av = a[f] as number[], bv = b[f] as number[], ov = o[f] as number[];
		for (let i = 0; i < av.length; i++) ov[i] = l(av[i], bv[i]);
	}
	o.spread = l(a.spread, b.spread);
	return o;
}

// ------------------------------------------------------------------ skeleton layout (right hand)

interface FingerDef {
	name: Exclude<Finger, 'thumb'>;
	base: [number, number, number]; // metacarpal start
	mcp: [number, number, number]; // knuckle
	lengths: [number, number, number]; // proximal, intermediate, distal
	radii: [number, number, number, number]; // at mcp, pip, dip, tip
}

const FINGER_DEFS: FingerDef[] = [
	{ name: 'index', base: [-0.014, 0.004, -0.012], mcp: [-0.025, 0.002, -0.088], lengths: [0.041, 0.024, 0.021], radii: [0.0098, 0.0088, 0.0079, 0.0068] },
	{ name: 'middle', base: [-0.003, 0.005, -0.012], mcp: [-0.004, 0.003, -0.092], lengths: [0.046, 0.028, 0.022], radii: [0.0102, 0.0092, 0.0082, 0.007] },
	{ name: 'ring', base: [0.008, 0.004, -0.012], mcp: [0.016, 0.001, -0.087], lengths: [0.043, 0.027, 0.021], radii: [0.0096, 0.0086, 0.0076, 0.0066] },
	{ name: 'pinky', base: [0.017, 0.002, -0.01], mcp: [0.034, -0.004, -0.077], lengths: [0.033, 0.02, 0.019], radii: [0.0085, 0.0076, 0.0068, 0.0058] },
];
const THUMB = {
	cmc: [-0.02, -0.009, -0.02] as [number, number, number],
	dir: new THREE.Vector3(-0.56, -0.24, -0.79).normalize(),
	lengths: [0.046, 0.033, 0.028] as [number, number, number],
	radii: [0.0138, 0.0118, 0.0104, 0.0084] as [number, number, number, number],
	nailUp: new THREE.Vector3(-0.62, 0.78, 0.0),
};

/** WebXR joint names for each bone, in the order bones are created. */
export const JOINT_NAMES = [
	'wrist',
	'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal',
	...['index', 'middle', 'ring', 'pinky'].flatMap((f) => [
		`${f}-finger-metacarpal`, `${f}-finger-phalanx-proximal`, `${f}-finger-phalanx-intermediate`, `${f}-finger-phalanx-distal`,
	]),
] as const;

const SKIN = { color: 0xc8987c, nail: 0xd2a091 };

export class HandModel {
	readonly root = new THREE.Group();
	readonly mesh: THREE.SkinnedMesh;
	readonly bones: THREE.Bone[] = [];
	private restQ: THREE.Quaternion[] = [];
	private restP: THREE.Vector3[] = [];
	/** bone index per finger: [metacarpal(thumb: cmc), proximal, (intermediate), distal] */
	private chain: Record<Finger, number[]> = { thumb: [], index: [], middle: [], ring: [], pinky: [] };
	private tipOffset: Record<Finger, number> = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
	readonly current: HandPose = structuredClone(POSES.relaxed);
	private sign: number;

	constructor(readonly handedness: 'left' | 'right') {
		this.sign = handedness === 'right' ? 1 : -1;
		this.root.name = `hand-${handedness}`;
		const { geometry, groups } = this.build();
		const skin = new THREE.MeshPhysicalMaterial({
			name: 'skin', color: SKIN.color, roughness: 0.52, sheen: 0.35, sheenRoughness: 0.6,
			sheenColor: new THREE.Color(0xff9a7a),
		});
		const nail = new THREE.MeshPhysicalMaterial({
			name: 'nail', color: SKIN.nail, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.3,
		});
		geometry.clearGroups();
		for (const g of groups) geometry.addGroup(g.start, g.count, g.mat);
		this.mesh = new THREE.SkinnedMesh(geometry, [skin, nail]);
		this.mesh.castShadow = true;
		this.mesh.frustumCulled = false; // bones move the hand well outside its bind bounds
		this.mesh.add(this.bones[0]);
		this.mesh.bind(new THREE.Skeleton(this.bones));
		this.root.add(this.mesh);
		this.setPose(POSES.relaxed);
	}

	// ---------------------------------------------------------------- construction
	private build() {
		const s = this.sign;
		const v = (p: readonly number[]) => new THREE.Vector3(p[0] * s, p[1], p[2]);
		const up = new THREE.Vector3(0, 1, 0);
		// bone helpers: world rest frames, then converted to local
		const worldPos: THREE.Vector3[] = [], worldQ: THREE.Quaternion[] = [], parent: number[] = [];
		const frame = (dir: THREE.Vector3, upHint: THREE.Vector3) => {
			const z = dir.clone().normalize().negate(); // bone -Z points along dir
			const x = new THREE.Vector3().crossVectors(upHint, z).normalize();
			const y = new THREE.Vector3().crossVectors(z, x).normalize();
			return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
		};
		const addBone = (pos: THREE.Vector3, q: THREE.Quaternion, par: number) => {
			worldPos.push(pos.clone()); worldQ.push(q.clone()); parent.push(par);
			return worldPos.length - 1;
		};
		addBone(new THREE.Vector3(), new THREE.Quaternion(), -1); // wrist

		// tube specs: list of joints (positions), radii, bone index per segment
		interface Tube { pts: THREE.Vector3[]; radii: number[]; bones: number[]; up: THREE.Vector3; startInside: number; nail: boolean }
		const tubes: Tube[] = [];

		// thumb
		{
			const dir = THUMB.dir.clone(); dir.x *= s;
			const nailUp = THUMB.nailUp.clone(); nailUp.x *= s;
			const q = frame(dir, nailUp);
			const p0 = v(THUMB.cmc);
			const p1 = p0.clone().addScaledVector(dir, THUMB.lengths[0]);
			const p2 = p1.clone().addScaledVector(dir, THUMB.lengths[1]);
			const p3 = p2.clone().addScaledVector(dir, THUMB.lengths[2]);
			const b0 = addBone(p0, q, 0), b1 = addBone(p1, q, b0), b2 = addBone(p2, q, b1);
			this.chain.thumb = [b0, b1, b2];
			this.tipOffset.thumb = THUMB.lengths[2];
			tubes.push({ pts: [p0, p1, p2, p3], radii: [...THUMB.radii], bones: [b0, b1, b2], up: nailUp, startInside: 0.004, nail: true });
		}
		// fingers
		for (const f of FINGER_DEFS) {
			const base = v(f.base), mcp = v(f.mcp);
			const meta = mcp.clone().sub(base);
			const dir = meta.clone().normalize();
			const q = frame(dir, up);
			const p1 = mcp.clone().addScaledVector(dir, f.lengths[0]);
			const p2 = p1.clone().addScaledVector(dir, f.lengths[1]);
			const p3 = p2.clone().addScaledVector(dir, f.lengths[2]);
			const bm = addBone(base, frame(meta, up), 0);
			const b1 = addBone(mcp, q, bm), b2 = addBone(p1, q, b1), b3 = addBone(p2, q, b2);
			this.chain[f.name] = [bm, b1, b2, b3];
			this.tipOffset[f.name] = f.lengths[2];
			tubes.push({ pts: [mcp, p1, p2, p3], radii: [...f.radii], bones: [b1, b2, b3], up, startInside: 0.014, nail: true });
		}

		// bones: local transforms from world rest frames
		for (let i = 0; i < worldPos.length; i++) {
			const b = new THREE.Bone();
			b.name = JOINT_NAMES[i];
			if (parent[i] < 0) { b.position.copy(worldPos[i]); b.quaternion.copy(worldQ[i]); }
			else {
				const pq = worldQ[parent[i]].clone().invert();
				b.position.copy(worldPos[i]).sub(worldPos[parent[i]]).applyQuaternion(pq);
				b.quaternion.copy(pq).multiply(worldQ[i]);
				this.bones[parent[i]].add(b);
			}
			this.bones.push(b);
			this.restQ.push(b.quaternion.clone());
			this.restP.push(b.position.clone());
		}

		// geometry buffers
		const pos: number[] = [], nor: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [];
		const skinIdx: number[] = [], nailIdx: number[] = [];
		const vert = (p: THREE.Vector3, b0: number, b1: number, w1: number, alpha = 1) => {
			pos.push(p.x, p.y, p.z); nor.push(0, 0, 0); col.push(1, 1, 1, alpha);
			si.push(b0, b1, 0, 0); sw.push(1 - w1, w1, 0, 0);
			return pos.length / 3 - 1;
		};
		const RING = 14;

		// --- fingers / thumb as smooth tubes with rounded tips
		for (const t of tubes) {
			const segLen = [t.pts[1].distanceTo(t.pts[0]), t.pts[2].distanceTo(t.pts[1]), t.pts[3].distanceTo(t.pts[2])];
			const total = segLen[0] + segLen[1] + segLen[2];
			const joints = [0, segLen[0], segLen[0] + segLen[1], total];
			const dirAt = (d: number) => {
				const k = d < joints[1] ? 0 : d < joints[2] ? 1 : 2;
				return t.pts[k + 1].clone().sub(t.pts[k]).normalize();
			};
			const pointAt = (d: number) => {
				if (d <= 0) return t.pts[0].clone().addScaledVector(dirAt(0), d);
				const k = d < joints[1] ? 0 : d < joints[2] ? 1 : 2;
				return t.pts[k].clone().lerp(t.pts[k + 1], (d - joints[k]) / segLen[k]);
			};
			const radiusAt = (d: number) => {
				const k = Math.max(0, d < joints[1] ? 0 : d < joints[2] ? 1 : 2);
				const u = THREE.MathUtils.clamp((d - joints[k]) / segLen[k], 0, 1);
				let r = THREE.MathUtils.lerp(t.radii[k], t.radii[k + 1], u);
				// knuckles slightly fuller than the shafts
				for (const j of [joints[1], joints[2]]) r += 0.0007 * Math.exp(-(((d - j) / 0.004) ** 2));
				return r;
			};
			const weightAt = (d: number): [number, number, number] => {
				// returns [boneA, boneB, wB] blending across joints (8 mm band)
				const w = 0.004;
				const bm = this.bones[t.bones[0]].parent ? this.bones.indexOf(this.bones[t.bones[0]].parent as THREE.Bone) : 0;
				const seq = [bm, ...t.bones];
				const js = [0, joints[1], joints[2]];
				for (let i = js.length - 1; i >= 0; i--) {
					if (d >= js[i] - w) {
						const wB = THREE.MathUtils.smoothstep(d, js[i] - w, js[i] + w);
						return [seq[i], seq[i + 1], wB];
					}
				}
				return [seq[0], seq[0], 0];
			};
			const rings: number[][] = [];
			const nSamples = 30;
			const start = -t.startInside, end = total;
			for (let i = 0; i <= nSamples; i++) {
				const d = start + (end - start) * (i / nSamples);
				const c = pointAt(d), dir = dirAt(Math.max(0, d)), r = radiusAt(Math.max(0, d));
				const x = new THREE.Vector3().crossVectors(t.up, dir.clone().negate()).normalize();
				const y = new THREE.Vector3().crossVectors(dir.clone().negate(), x).normalize();
				const [ba, bb, wb] = weightAt(d);
				const ring: number[] = [];
				for (let j = 0; j < RING; j++) {
					const a = (j / RING) * Math.PI * 2;
					// slightly flattened, fuller on the palm (pad) side
					const sy = Math.sin(a) > 0 ? 0.84 : 0.92;
					const p = c.clone().addScaledVector(x, Math.cos(a) * r).addScaledVector(y, Math.sin(a) * r * sy);
					ring.push(vert(p, ba, bb, wb));
				}
				rings.push(ring);
			}
			// rounded tip: shrinking rings past the end
			const tipDir = dirAt(total), tipC = t.pts[3];
			const lastBone = t.bones[t.bones.length - 1];
			for (let i = 1; i <= 5; i++) {
				const ang = (i / 5) * (Math.PI / 2);
				const r = t.radii[3] * Math.cos(ang);
				const c = tipC.clone().addScaledVector(tipDir, t.radii[3] * 0.95 * Math.sin(ang));
				const x = new THREE.Vector3().crossVectors(t.up, tipDir.clone().negate()).normalize();
				const y = new THREE.Vector3().crossVectors(tipDir.clone().negate(), x).normalize();
				const ring: number[] = [];
				for (let j = 0; j < RING; j++) {
					const a = (j / RING) * Math.PI * 2;
					const sy = Math.sin(a) > 0 ? 0.84 : 0.92;
					ring.push(vert(c.clone().addScaledVector(x, Math.cos(a) * Math.max(r, 1e-4)).addScaledVector(y, Math.sin(a) * Math.max(r, 1e-4) * sy), lastBone, lastBone, 0));
				}
				rings.push(ring);
			}
			for (let k = 0; k < rings.length - 1; k++) for (let j = 0; j < RING; j++) {
				const a = rings[k][j], b = rings[k][(j + 1) % RING], c = rings[k + 1][j], d = rings[k + 1][(j + 1) % RING];
				skinIdx.push(a, c, b, b, c, d);
			}
			// close the base of the tube (it starts inside the palm but can show at the knuckles)
			{
				const r0 = rings[0];
				const cen = new THREE.Vector3();
				for (const i of r0) cen.add(new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
				cen.divideScalar(r0.length).addScaledVector(dirAt(0), -0.004);
				const [ba, bb, wb] = weightAt(-t.startInside);
				const ci = vert(cen, ba, bb, wb);
				for (let j = 0; j < RING; j++) skinIdx.push(ci, r0[j], r0[(j + 1) % RING]);
			}
			// fingernail: a curved plate on the back of the distal phalanx
			if (t.nail) {
				const d0 = joints[2] + segLen[2] * 0.32, d1 = total + t.radii[3] * 0.35;
				const nRows = 5, nCols = 6, span = 0.75; // radians either side of dorsal
				const grid: number[][] = [];
				for (let i = 0; i <= nRows; i++) {
					const d = d0 + (d1 - d0) * (i / nRows);
					const dd = Math.min(d, total);
					const c = pointAt(dd).addScaledVector(tipDir, Math.max(0, d - total));
					const r = radiusAt(dd) * (d > total ? Math.cos(((d - total) / t.radii[3]) * 1.2) : 1) + 0.00035;
					const dir = dirAt(dd);
					const x = new THREE.Vector3().crossVectors(t.up, dir.clone().negate()).normalize();
					const y = new THREE.Vector3().crossVectors(dir.clone().negate(), x).normalize();
					const row: number[] = [];
					for (let j = 0; j <= nCols; j++) {
						const a = Math.PI / 2 + span * (j / nCols * 2 - 1);
						row.push(vert(c.clone().addScaledVector(x, Math.cos(a) * r).addScaledVector(y, Math.sin(a) * r * 0.84), lastBone, lastBone, 0));
					}
					grid.push(row);
				}
				for (let i = 0; i < nRows; i++) for (let j = 0; j < nCols; j++) {
					const a = grid[i][j], b = grid[i][j + 1], c = grid[i + 1][j], d = grid[i + 1][j + 1];
					nailIdx.push(a, b, c, b, d, c);
				}
			}
		}

		// --- palm + wrist: lofted rounded cross-sections, forearm dithers out
		{
			const thumbBone = this.chain.thumb[0];
			const stations = [
				// rounded, closed wrist end (a dithered fade looked grainy in the headset)
				{ z: 0.05, w: 0.004, h: 0.003, cx: 0.0, cy: -0.002, a: 1 },
				{ z: 0.047, w: 0.034, h: 0.025, cx: 0.0, cy: -0.002, a: 1 },
				{ z: 0.04, w: 0.05, h: 0.036, cx: 0.0, cy: -0.002, a: 1 },
				{ z: 0.03, w: 0.055, h: 0.038, cx: 0.0, cy: -0.002, a: 1 },
				{ z: 0.012, w: 0.058, h: 0.035, cx: 0.0, cy: -0.003, a: 1 },
				{ z: -0.012, w: 0.066, h: 0.034, cx: -0.001, cy: -0.004, a: 1 },
				{ z: -0.04, w: 0.078, h: 0.032, cx: 0.002, cy: -0.004, a: 1 },
				{ z: -0.066, w: 0.084, h: 0.03, cx: 0.004, cy: -0.003, a: 1 },
				{ z: -0.084, w: 0.083, h: 0.026, cx: 0.004, cy: -0.001, a: 1 },
				{ z: -0.093, w: 0.07, h: 0.018, cx: 0.004, cy: 0.0, a: 1 },
				{ z: -0.097, w: 0.04, h: 0.008, cx: 0.004, cy: 0.0, a: 1 },
			];
			const N = 28;
			const rings: number[][] = [];
			const thumbSeg = [worldPos[thumbBone], worldPos[thumbBone].clone().addScaledVector(new THREE.Vector3(THUMB.dir.x * s, THUMB.dir.y, THUMB.dir.z), THUMB.lengths[0])];
			const segDist = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => {
				const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
				return p.distanceTo(a.clone().addScaledVector(ab, t));
			};
			for (const st of stations) {
				const ring: number[] = [];
				for (let j = 0; j < N; j++) {
					const a = (j / N) * Math.PI * 2;
					// superellipse cross-section: flat-ish back and palm, rounded sides
					const c = Math.cos(a), sn = Math.sin(a);
					const ex = 2.6;
					const px = Math.sign(c) * Math.pow(Math.abs(c), 2 / ex) * st.w / 2;
					const py = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / ex) * st.h / 2;
					const p = new THREE.Vector3((st.cx + px) * 1, st.cy + py, st.z);
					p.x = st.cx * s + px; // mirror the centre offset only
					// thenar eminence near the thumb: blend toward the thumb metacarpal
					const dThumb = segDist(p, thumbSeg[0], thumbSeg[1]);
					const wT = (p.x * s < 0 && st.z < 0.01) ? 0.75 * THREE.MathUtils.smoothstep(-dThumb, -0.03, -0.012) : 0;
					ring.push(vert(p, 0, thumbBone, wT, st.a));
				}
				rings.push(ring);
			}
			for (let k = 0; k < rings.length - 1; k++) for (let j = 0; j < N; j++) {
				const a = rings[k][j], b = rings[k][(j + 1) % N], c = rings[k + 1][j], d = rings[k + 1][(j + 1) % N];
				skinIdx.push(a, b, c, b, d, c);
			}
		}

		// mirror: flipping X reverses triangle winding
		if (s < 0) {
			for (const list of [skinIdx, nailIdx]) for (let i = 0; i < list.length; i += 3) [list[i + 1], list[i + 2]] = [list[i + 2], list[i + 1]];
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
		geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
		geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
		geometry.setIndex([...skinIdx, ...nailIdx]);
		geometry.computeVertexNormals();
		return { geometry, groups: [{ start: 0, count: skinIdx.length, mat: 0 }, { start: skinIdx.length, count: nailIdx.length, mat: 1 }] };
	}

	// ---------------------------------------------------------------- posing
	private _q = new THREE.Quaternion();
	private _e = new THREE.Euler();

	/** Apply a pose (degrees). Bones keep their rest lengths. */
	setPose(p: HandPose) {
		if (p !== this.current) blendPose(p, p, 0, this.current);
		const D = THREE.MathUtils.DEG2RAD, s = this.sign;
		const set = (bi: number, flex: number, abd = 0, twist = 0) => {
			const b = this.bones[bi];
			b.position.copy(this.restP[bi]);
			// flexion curls -Z toward the palm (-Y): negative rotation about local X
			this._e.set(-flex * D, abd * D * s, twist * D * s, 'YXZ');
			b.quaternion.copy(this.restQ[bi]).multiply(this._q.setFromEuler(this._e));
		};
		const [tc, to, tm, ti] = p.thumb;
		const [t0, t1, t2] = this.chain.thumb;
		// opposition swings the thumb across the palm and rolls the nail outward
		set(t0, tc, -to * 0.55, -to * 0.6);
		set(t1, tm);
		set(t2, ti);
		const fan: Record<string, number> = { index: -1, middle: 0, ring: 0.7, pinky: 1.6 };
		for (const f of ['index', 'middle', 'ring', 'pinky'] as const) {
			const [m, a, b, c] = this.chain[f];
			this.bones[m].quaternion.copy(this.restQ[m]);
			this.bones[m].position.copy(this.restP[m]);
			const [f1, f2, f3] = p[f];
			// spread only when the fingers are straight-ish; curled fingers converge
			const spread = p.spread * fan[f] * (1 - Math.min(1, f1 / 70));
			set(a, f1, -spread);
			set(b, f2);
			set(c, f3);
		}
	}

	/** Drive the skeleton from WebXR joint world matrices (hand tracking). */
	setFromJoints(joints: Record<string, THREE.Object3D | undefined>, rootInverse: THREE.Matrix4) {
		const world: THREE.Matrix4[] = [];
		const m = new THREE.Matrix4(), inv = new THREE.Matrix4();
		for (let i = 0; i < this.bones.length; i++) {
			const j = joints[JOINT_NAMES[i]];
			const b = this.bones[i];
			if (!j || !j.visible) {
				b.updateMatrix();
				world.push(i === 0 ? b.matrix.clone() : world[this.parentIndex(i)].clone().multiply(b.matrix));
				continue;
			}
			// joint world -> this hand's root space
			const w = rootInverse.clone().multiply(j.matrixWorld);
			world.push(w);
			const parentW = i === 0 ? m.identity() : world[this.parentIndex(i)];
			inv.copy(parentW).invert();
			const local = inv.multiply(w);
			local.decompose(b.position, b.quaternion, new THREE.Vector3());
		}
	}

	private parentIdx: number[] | null = null;
	private parentIndex(i: number) {
		this.parentIdx ??= this.bones.map((b) => this.bones.indexOf(b.parent as THREE.Bone));
		return this.parentIdx[i];
	}

	/** World position of a fingertip (end of the distal bone). */
	tipWorld(f: Finger, out = new THREE.Vector3()): THREE.Vector3 {
		const chain = this.chain[f];
		const b = this.bones[chain[chain.length - 1]];
		b.updateWorldMatrix(true, false);
		return out.set(0, 0, -this.tipOffset[f]).applyMatrix4(b.matrixWorld);
	}

	/** World direction the given finger points (distal bone -Z). */
	fingerDir(f: Finger, out = new THREE.Vector3()): THREE.Vector3 {
		const chain = this.chain[f];
		const b = this.bones[chain[chain.length - 1]];
		b.updateWorldMatrix(true, false);
		return out.set(0, 0, -1).transformDirection(b.matrixWorld);
	}
}
