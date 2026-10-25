import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HandModel, POSES, blendPose } from '../../src/interaction/handModel';
import { graspFor } from '../../src/interaction/xrHands';

/** Pose a hand at the origin and return a few landmark points in wrist space. */
function landmarks(pose: keyof typeof POSES, side: 'left' | 'right' = 'right') {
	const h = new HandModel(side);
	h.setPose(POSES[pose]);
	h.root.updateMatrixWorld(true);
	const j = (n: string) => new THREE.Vector3().setFromMatrixPosition(h.bones.find((b) => b.name === n)!.matrixWorld);
	return { h, thumbTip: h.tipWorld('thumb'), indexTip: h.tipWorld('index'), middleTip: h.tipWorld('middle'), j };
}
const toLocal = (grasp: THREE.Matrix4, p: THREE.Vector3) => p.clone().applyMatrix4(grasp.clone().invert());

describe('hand model', () => {
	it('has 20 bones named after WebXR joints and fingertips at anatomical lengths', () => {
		const { h } = landmarks('open');
		expect(h.bones.length).toBe(20);
		expect(h.bones[0].name).toBe('wrist');
		// open hand: middle fingertip ~ 0.19 m from the wrist, pointing -Z
		const tip = h.tipWorld('middle');
		expect(tip.length()).toBeGreaterThan(0.17);
		expect(tip.length()).toBeLessThan(0.21);
		expect(tip.z).toBeLessThan(-0.16);
	});

	it('flexion curls fingers toward the palm (-Y), not the back of the hand', () => {
		const open = landmarks('open').indexTip, fist = landmarks('fist').indexTip;
		expect(fist.y).toBeLessThan(open.y - 0.01);
		expect(fist.z).toBeGreaterThan(open.z + 0.05);
	});

	it('right thumb is on -X, left thumb on +X', () => {
		expect(landmarks('open', 'right').thumbTip.x).toBeLessThan(-0.03);
		expect(landmarks('open', 'left').thumbTip.x).toBeGreaterThan(0.03);
	});

	it('point pose extends the index while the others tuck in', () => {
		const p = landmarks('point');
		expect(p.indexTip.z).toBeLessThan(-0.15);
		expect(p.middleTip.z).toBeGreaterThan(-0.11);
	});

	it('pinch brings thumb and index tips within 2.5 cm', () => {
		const p = landmarks('pinch');
		expect(p.thumbTip.distanceTo(p.indexTip)).toBeLessThan(0.025);
	});

	it('blendPose interpolates joint angles', () => {
		const b = blendPose(POSES.open, POSES.fist, 0.5);
		expect(b.index[0]).toBeCloseTo((POSES.open.index[0] + POSES.fist.index[0]) / 2);
	});
});

describe('grasps', () => {
	it('notebook sits between thumb (on the cover) and fingers (under it)', () => {
		const L = landmarks('book');
		const g = graspFor('notebook', 'right');
		const thumb = toLocal(g, L.thumbTip), under = toLocal(g, L.j('middle-finger-phalanx-intermediate'));
		console.log('book thumb', thumb.toArray().map((v) => +v.toFixed(3)), 'under', under.toArray().map((v) => +v.toFixed(3)));
		// book occupies y in [0, 0.015]; thumb just above the cover, finger just below
		expect(thumb.y).toBeGreaterThan(0.012);
		expect(thumb.y).toBeLessThan(0.03);
		expect(under.y).toBeLessThan(0.003);
		expect(under.y).toBeGreaterThan(-0.02);
		// both inside the book's footprint, near the spine edge
		for (const p of [thumb, under]) { expect(Math.abs(p.z)).toBeLessThan(0.105); expect(p.x).toBeGreaterThan(-0.074); }
	});

	it('mug handle opening is on the curled index/middle fingers', () => {
		const L = landmarks('mugHandle');
		const g = graspFor('mug', 'right');
		const f = toLocal(g, L.j('index-finger-phalanx-intermediate').add(L.j('middle-finger-phalanx-intermediate')).multiplyScalar(0.5));
		console.log('mug fingers in mug space', f.toArray().map((v) => +v.toFixed(3)));
		// handle opening: between the wall (r 0.041) and the handle (0.068), 2..8 cm high
		expect(f.x).toBeGreaterThan(0.04);
		expect(f.x).toBeLessThan(0.07);
		expect(f.y).toBeGreaterThan(0.02);
		expect(f.y).toBeLessThan(0.08);
	});

	it('pen lies between thumb and index tips', () => {
		const L = landmarks('pinch');
		const g = graspFor('pen', 'right');
		const t = toLocal(g, L.thumbTip), i = toLocal(g, L.indexTip);
		// pen axis is local X; both tips within 2 cm of the axis
		for (const p of [t, i]) expect(Math.hypot(p.y, p.z)).toBeLessThan(0.02);
	});
});

describe('pistol grasp', () => {
	// grip of the Poly Haven service pistol in its own frame (measured from the mesh)
	const grip = { x: [-0.015, 0.016], y: [-0.045, 0.035], z: [0.004, 0.036] };
	const inside = (p: THREE.Vector3, m = 0) => p.x > grip.x[0] + m && p.x < grip.x[1] - m && p.y > grip.y[0] + m && p.y < grip.y[1] - m && p.z > grip.z[0] + m && p.z < grip.z[1] - m;
	for (const side of ['right', 'left'] as const) {
		it(`${side} hand wraps the grip, index at the trigger, thumb on the far side`, () => {
			const { h, j } = landmarks('pistolGrip', side);
			const g = graspFor('pistol', side);
			const L = (p: THREE.Vector3) => toLocal(g, p);
			const s = side === 'right' ? 1 : -1;
			// palm against the grip side, fingers round the front strap
			for (const f of ['middle', 'ring', 'pinky'] as const) {
				const tip = L(h.tipWorld(f)), knuckle = L(j(`${f}-finger-phalanx-proximal`)), pip = L(j(`${f}-finger-phalanx-intermediate`));
				expect(knuckle.x * s).toBeGreaterThan(0.005); // knuckles on the palm side
				expect(tip.x * s).toBeLessThan(0.005); // tips reach round to the other side
				expect(pip.z < 0.01 || pip.x * s < -0.015).toBe(true); // middle joints round the front strap or on the far panel
				for (const p of [tip, knuckle, pip]) expect(inside(p, 0.004)).toBe(false);
				expect(tip.y).toBeGreaterThan(grip.y[0] - 0.01);
				expect(tip.y).toBeLessThan(0.01);
			}
			// index finger reaches the trigger (inside the guard: y 0..0.03, z -0.05..-0.005)
			const it_ = L(j('index-finger-phalanx-distal'));
			expect(it_.y).toBeGreaterThan(-0.005); expect(it_.y).toBeLessThan(0.035);
			expect(it_.z).toBeGreaterThan(-0.055); expect(it_.z).toBeLessThan(0.0);
			// thumb on the other side of the frame, wrist behind the grip
			expect(L(h.tipWorld('thumb')).x * s).toBeLessThan(-0.008);
			expect(L(new THREE.Vector3()).z).toBeGreaterThan(0.04);
		});
	}
});

describe('skin detail and contact', () => {
	it('every vertex carries skin coordinates: palm, fingers with creases at the joints, nails', () => {
		const h = new HandModel('right');
		const g = h.mesh.geometry, sk = g.getAttribute('aSkin'), jd = g.getAttribute('aJd'), kn = g.getAttribute('aKnuckle');
		expect(sk.count).toBe(g.getAttribute('position').count);
		const regions = new Set<number>();
		let nearCrease = 0, knuckles = 0;
		for (let i = 0; i < sk.count; i++) {
			regions.add(sk.getW(i));
			const near = Math.min(Math.abs(jd.getX(i)), Math.abs(jd.getY(i)), Math.abs(jd.getZ(i)));
			if (sk.getW(i) === 1 && near < 0.0025) nearCrease++;
			if (Math.max(kn.getX(i), kn.getY(i), kn.getZ(i)) > 0.9 && near < 0.004) knuckles++;
		}
		expect([...regions].sort()).toEqual([0, 1, 2]);
		expect(nearCrease).toBeGreaterThan(100); // rings at every joint, on all five digits
		expect(knuckles).toBeGreaterThan(100);
	});

	it('holding an object, each finger closes until it meets the surface', async () => {
		const { XRHand } = await import('../../src/interaction/xrHands');
		const scene = new THREE.Scene();
		const hand = new XRHand('right', scene);
		// a 5 x 3 x 12 cm box (a magazine-ish block) across the palm, below the knuckles
		const box = new THREE.Box3(new THREE.Vector3(-0.025, -0.015, -0.06), new THREE.Vector3(0.025, 0.015, 0.06));
		const ray = new THREE.Matrix4();
		const wristFromRay = new THREE.Matrix4(); // the box sits in wrist space; find the wrist first
		hand.updateController(ray, { trigger: 0, squeeze: 1, thumbTouch: false }, { point: false, holding: null }, null, 1);
		wristFromRay.copy(hand.wrist);
		const obj = wristFromRay.clone().multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0)).setPosition(
			new THREE.Vector3(0, -0.035, -0.075).applyMatrix4(wristFromRay));
		for (let i = 0; i < 30; i++) hand.updateController(ray, { trigger: 0, squeeze: 1, thumbTouch: false }, { point: false, holding: null, object: { box, matrix: obj } }, null, 1 / 60);
		hand.model.root.updateMatrixWorld(true);
		const inv = obj.clone().invert();
		const gaps = (['index', 'middle', 'ring', 'pinky'] as const).map((f) => {
			// nearest point of the finger (sampled along its bones) to the box
			const pts = hand.model.jointsWorld(f, [0, 0, 0, 0, 0].map(() => new THREE.Vector3()));
			let best = 1;
			for (let k = 0; k < 4; k++) for (let q = 0; q <= 8; q++) best = Math.min(best, box.distanceToPoint(pts[k].clone().lerp(pts[k + 1], q / 8).applyMatrix4(inv)));
			return best;
		});
		// every finger reaches the surface (skin radius ~9 mm) and none sinks deep into it
		for (const g of gaps) { expect(g).toBeLessThan(0.013); }
		const tipsInside = (['index', 'middle', 'ring', 'pinky'] as const).filter((f) => box.containsPoint(hand.model.tipWorld(f).applyMatrix4(inv)));
		expect(tipsInside.length).toBe(0);
	});

	it('an empty hand stops at a surface the controller passes through', async () => {
		const { XRHand } = await import('../../src/interaction/xrHands');
		const hand = new XRHand('right', new THREE.Scene());
		// a desk top 3 cm thick at y = 0 (solid from -0.03 to 0); the palm sweeps down onto it
		const above = (c: THREE.Vector3, r: number) => c.y - r < 0 && c.y + r > -0.03;
		hand.blocker = {
			push: (c, r) => (above(c, r) ? new THREE.Vector3(0, r - c.y, 0) : null),
			sweep: (a, b, r) => (a.y >= r && b.y < r ? new THREE.Vector3(b.x, r, b.z) : b.clone()),
		};
		const at = (y: number) => new THREE.Matrix4().makeTranslation(0, y, 0);
		// the controller comes down from 20 cm above to 12 cm below the top, past the slab in one step
		hand.updateController(at(0.2), { trigger: 0, squeeze: 0, thumbTouch: false }, { point: false, holding: null }, null, 1 / 60);
		const ray = at(-0.12);
		hand.updateController(ray, { trigger: 0, squeeze: 0, thumbTouch: false }, { point: false, holding: null }, null, 1 / 60);
		hand.model.root.updateMatrixWorld(true);
		const palm = new THREE.Vector3(0, -0.006, -0.05).applyMatrix4(hand.wrist);
		expect(palm.y).toBeGreaterThan(0.029);
		expect(hand.blocked).toBeGreaterThan(0.05);
		// pointing at keys or holding something: no blocking (the finger has to reach the keys)
		hand.updateController(ray, { trigger: 0, squeeze: 0, thumbTouch: false }, { point: true, holding: null }, null, 1 / 60);
		expect(hand.blocked).toBe(0);
	});
});
