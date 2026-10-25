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
