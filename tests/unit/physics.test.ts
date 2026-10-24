import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { Physics, initPhysics, type Prop } from '../../src/physics/physics';
import { mugDesc, notebookDesc, penDesc } from '../../src/physics/propDefs';

// A minimal replica of the room: slab, one wall, and the desk top at 0.735 m.
const DESK_Y = 0.735;
function makeWorld() {
	const ph = new Physics();
	ph.addStatic({ center: new THREE.Vector3(0, -0.06, 0), half: new THREE.Vector3(5, 0.06, 5) });
	ph.addStatic({ center: new THREE.Vector3(0, 1.4, -2.6), half: new THREE.Vector3(5, 1.4, 0.1) }); // wall at z = -2.5
	ph.addStatic({ center: new THREE.Vector3(0, DESK_Y - 0.014, -2.1), half: new THREE.Vector3(0.8, 0.014, 0.375) });
	return ph;
}
function obj(x: number, y: number, z: number) {
	const o = new THREE.Object3D();
	o.position.set(x, y, z);
	new THREE.Scene().add(o);
	return o;
}
function run(ph: Physics, seconds: number, onStep?: (t: number) => void) {
	const frame = 1 / 72; // Quest-like frame rate drives the fixed 120 Hz step
	for (let t = 0; t < seconds; t += frame) { onStep?.(t); ph.step(frame); }
}
const speed = (p: Prop) => { const v = p.body.linvel(); return Math.hypot(v.x, v.y, v.z); };

beforeAll(async () => { await initPhysics(); });

describe('physics: props at rest', () => {
	it('a mug dropped from 20 cm settles upright on the desk without jitter', () => {
		const ph = makeWorld();
		const mug = ph.addProp(mugDesc(obj(0, DESK_Y + 0.2, -2.0)));
		run(ph, 2.5);
		const p = ph.pos(mug);
		expect(p.y).toBeGreaterThan(DESK_Y - 0.002);
		expect(p.y).toBeLessThan(DESK_Y + 0.004);
		expect(speed(mug)).toBeLessThan(0.01);
		// upright: local up still points up
		const up = new THREE.Vector3(0, 1, 0).applyQuaternion(ph.rot(mug));
		expect(up.y).toBeGreaterThan(0.99);
		// stays put for another 5 s (no creeping / jitter)
		const before = p.clone();
		run(ph, 5);
		expect(ph.pos(mug).distanceTo(before)).toBeLessThan(0.001);
	});

	it('notebook and pen come to rest on the desk; the pen stops rolling', () => {
		const ph = makeWorld();
		const nb = ph.addProp(notebookDesc(obj(-0.3, DESK_Y + 0.05, -2.0)));
		const pen = ph.addProp(penDesc(obj(-0.3, DESK_Y + 0.15, -2.0)));
		run(ph, 4);
		expect(ph.pos(nb).y).toBeCloseTo(DESK_Y, 2);
		expect(speed(pen)).toBeLessThan(0.01);
		// pen landed on the notebook (top at DESK_Y + 15 mm) or the desk, never inside either
		expect(ph.pos(pen).y).toBeGreaterThan(DESK_Y + 0.004);
	});
});

describe('physics: holding and throwing', () => {
	it('a held mug follows the hand smoothly and settles after release', () => {
		const ph = makeWorld();
		const mug = ph.addProp(mugDesc(obj(0, DESK_Y, -2.0)));
		run(ph, 0.5);
		ph.grab(mug);
		const target = new THREE.Vector3(0.3, 1.2, -1.5);
		run(ph, 1.0, () => ph.setHoldTarget(mug, target, new THREE.Quaternion()));
		expect(ph.pos(mug).distanceTo(target)).toBeLessThan(0.01);
		ph.release(mug);
		run(ph, 3);
		// fell to the floor (upright: y ~ 0, on its side: y ~ radius) and is at rest there
		expect(ph.pos(mug).y).toBeLessThan(0.06);
		expect(speed(mug)).toBeLessThan(0.02);
		// never below the slab: lowest point of the body cylinder (r 40.8 mm, half-height 47.5 mm)
		const q = ph.rot(mug);
		const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
		const centre = ph.pos(mug).add(axis.clone().multiplyScalar(0.0475));
		const lowest = centre.y - (0.0475 * Math.abs(axis.y) + 0.0408 * Math.sqrt(Math.max(0, 1 - axis.y * axis.y)));
		expect(lowest).toBeGreaterThan(-0.005);
		expect(lowest).toBeLessThan(0.005);
	});

	it('a slightly non-unit target rotation (float error from matrices) does not freeze the body', () => {
		const ph = makeWorld();
		const mug = ph.addProp(mugDesc(obj(0, DESK_Y, -2.0)));
		run(ph, 0.3);
		ph.grab(mug);
		// w a hair above 1, as produced by decomposing grip * offset matrices
		const q = new THREE.Quaternion(0, 0, 0, 1.0000002);
		run(ph, 0.5, () => ph.setHoldTarget(mug, new THREE.Vector3(0, 1.0, -2.0), q));
		const w = mug.body.angvel();
		expect(Number.isFinite(w.x) && Number.isFinite(w.y) && Number.isFinite(w.z)).toBe(true);
		expect(ph.pos(mug).y).toBeGreaterThan(0.98);
	});

	it('a held object pushed into a wall is blocked by it, not passed through', () => {
		const ph = makeWorld();
		const nb = ph.addProp(notebookDesc(obj(1.5, 1.0, -1.5)));
		ph.grab(nb);
		// hand moves 1 m beyond the wall face at z = -2.5
		run(ph, 1.0, () => ph.setHoldTarget(nb, new THREE.Vector3(1.5, 1.2, -3.5), new THREE.Quaternion()));
		expect(ph.pos(nb).z).toBeGreaterThan(-2.5);
		expect(ph.holdError(nb)).toBeGreaterThan(0.5); // caller uses this to auto-release
	});

	it('a hard throw at the wall bounces back instead of tunnelling (CCD)', () => {
		const ph = makeWorld();
		const pen = ph.addProp(penDesc(obj(1.5, 1.2, -1.5)));
		ph.grab(pen);
		run(ph, 0.1, () => ph.setHoldTarget(pen, new THREE.Vector3(1.5, 1.2, -1.5), new THREE.Quaternion()));
		ph.release(pen, new THREE.Vector3(0, 0, -20)); // clamped to 5 m/s internally
		run(ph, 2);
		expect(ph.pos(pen).z).toBeGreaterThan(-2.5);
		expect(ph.pos(pen).y).toBeGreaterThan(-0.005);
	});
});
