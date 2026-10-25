import * as THREE from 'three';
import { HandModel, POSES, blendPose, type HandPose } from './handModel';

/**
 * What a VR hand looks like and does each frame: placement relative to the
 * controller (or tracked joints), pose animation from analog input and
 * context, and where a held object sits in the hand.
 */

export type GraspKind = 'mug' | 'notebook' | 'pen' | 'pistol';
export const GRASP_KINDS: readonly GraspKind[] = ['mug', 'notebook', 'pen', 'pistol'];

export interface HandInputs {
	trigger: number; // 0..1 analog
	squeeze: number; // 0..1 analog
	thumbTouch: boolean; // thumb resting on stick / face buttons
}

export interface HandContext {
	/** index finger extended: near the keyboard or pointing at the screen */
	point: boolean;
	holding: GraspKind | 'mouse' | null;
}

// Wrist pose in the controller's target-ray space (-Z forward, +Y up when the
// controller is held level). Quest-style grip: the handle sits in the palm
// tilted ~40 degrees, the back of the hand faces outward, the thumb on top.
export function rayToWrist(handedness: 'left' | 'right'): THREE.Matrix4 {
	const s = handedness === 'right' ? 1 : -1;
	const fingers = new THREE.Vector3(0, -0.45, -0.89).normalize(); // hand -Z, ~27 deg below the ray
	const dorsal = new THREE.Vector3(0.93 * s, 0.32, -0.1); // hand +Y
	const z = fingers.clone().negate();
	const x = new THREE.Vector3().crossVectors(dorsal, z).normalize();
	const y = new THREE.Vector3().crossVectors(z, x).normalize();
	const m = new THREE.Matrix4().makeBasis(x, y, z);
	m.setPosition(0.018 * s, -0.035, 0.105);
	return m;
}

// Wrist pose relative to the desk mouse (mouse front is -Z, origin on the desk):
// palm resting on the shell, fingers on the buttons.
function mouseToWrist(handedness: 'left' | 'right'): THREE.Matrix4 {
	const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0, handedness === 'right' ? 0.12 : -0.12));
	return new THREE.Matrix4().compose(new THREE.Vector3(0.004, 0.047, 0.095), q, new THREE.Vector3(1, 1, 1));
}

/** Circle through three points (centre), for fitting finger arcs. */
function circumcentre(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
	const ab = b.clone().sub(a), ac = c.clone().sub(a);
	const n = new THREE.Vector3().crossVectors(ab, ac);
	const t = new THREE.Vector3().crossVectors(n, ab).multiplyScalar(ac.lengthSq())
		.add(new THREE.Vector3().crossVectors(ac, n).multiplyScalar(ab.lengthSq()))
		.divideScalar(2 * n.lengthSq());
	return a.clone().add(t);
}

/**
 * Pistol pose in wrist space. The middle, ring and little fingers of the
 * pistolGrip pose wrap a tube: each finger's arc is fitted with a circle,
 * and the line through the circle centres is where the grip's axis goes.
 * The gun's right side faces the palm (left side for a left hand), the
 * muzzle points the way the fingers would extend, and the grip height is
 * set so the middle finger sits just under the trigger guard.
 */
function pistolInHand(handedness: 'left' | 'right'): THREE.Matrix4 {
	const h = new HandModel(handedness);
	h.setPose(POSES.pistolGrip);
	h.root.updateMatrixWorld(true);
	const joint = (name: string) => new THREE.Vector3().setFromMatrixPosition(h.bones.find((b) => b.name === name)!.matrixWorld);
	const centre = (f: 'middle' | 'ring' | 'pinky') => circumcentre(
		joint(`${f}-finger-phalanx-proximal`),
		joint(`${f}-finger-phalanx-intermediate`).lerp(joint(`${f}-finger-phalanx-distal`), 0.5),
		h.tipWorld(f),
	);
	const cm = centre('middle'), cp = centre('pinky');
	const up = cm.clone().sub(cp).normalize(); // grip axis, toward the slide
	const fwd = new THREE.Vector3(0, 0, -1).addScaledVector(up, up.z).normalize(); // muzzle, square to the grip
	// grip axis in the gun frame rakes back slightly (bottom further back)
	const rake = Math.atan2(0.006, 0.06);
	const Y = up.clone().applyAxisAngle(new THREE.Vector3().crossVectors(up, fwd).normalize(), -rake);
	const Z = fwd.clone().negate().addScaledVector(Y, fwd.dot(Y)).normalize();
	const X = new THREE.Vector3().crossVectors(Y, Z);
	const m = new THREE.Matrix4().makeBasis(X, Y, Z);
	// grip centre under the middle finger (gun frame: front strap z~0.004,
	// back strap z~0.035, trigger guard bottom y~0) lands on the middle arc centre
	const gripAtMiddle = new THREE.Vector3(0, -0.012, 0.02).applyMatrix4(new THREE.Matrix4().extractRotation(m));
	m.setPosition(cm.sub(gripAtMiddle));
	// the index finger runs above the knuckle line of the others, so the bore
	// sits pitched up relative to the wrapped fingers (a real grip angle)
	const c = new THREE.Vector3(0, -0.012, 0.02);
	const pitch = THREE.MathUtils.degToRad(18); // puts the index pad on the trigger (fitted in tests/unit/hands)
	return m.multiply(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z)).multiply(new THREE.Matrix4().makeRotationX(pitch)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
}

/**
 * Controller ray -> wrist while holding the pistol: the barrel lies along
 * the pointing ray (aiming is where you point) and the wrist stays where it
 * is when holding the bare controller.
 */
function rayToPistolWrist(handedness: 'left' | 'right'): THREE.Matrix4 {
	const gunToWrist = pistolInHand(handedness).invert();
	const wristPos = new THREE.Vector3().setFromMatrixPosition(rayToWrist(handedness));
	const t = wristPos.sub(new THREE.Vector3().setFromMatrixPosition(gunToWrist));
	return new THREE.Matrix4().makeTranslation(t.x, t.y, t.z).multiply(gunToWrist);
}

/** Controller ray -> gun pose (bore along the ray), for any gun held in the pistol grip. */
export function rayToGun(handedness: 'left' | 'right'): THREE.Matrix4 {
	return rayToPistolWrist(handedness).multiply(pistolInHand(handedness));
}

/** Object pose in wrist space for a natural grip, derived from the posed hand itself. */
function computeGrasp(kind: GraspKind, handedness: 'left' | 'right'): THREE.Matrix4 {
	if (kind === 'pistol') return pistolInHand(handedness);
	const h = new HandModel(handedness);
	h.setPose(kind === 'mug' ? POSES.mugHandle : kind === 'notebook' ? POSES.book : POSES.pinch);
	h.root.updateMatrixWorld(true);
	const tip = (f: 'thumb' | 'index' | 'middle') => h.tipWorld(f);
	const joint = (name: string) => new THREE.Vector3().setFromMatrixPosition(h.bones.find((b) => b.name === name)!.matrixWorld);
	const thumbSide = joint('index-finger-phalanx-proximal').sub(joint('pinky-finger-phalanx-proximal')).normalize();
	const dorsal = new THREE.Vector3(0, 1, 0), forward = new THREE.Vector3(0, 0, -1);
	// "up" while the controller is held level, expressed in wrist space: objects
	// that have an obvious upright (mug, notebook) stay upright in a level hand
	const levelUp = new THREE.Vector3(0, 1, 0).transformDirection(rayToWrist(handedness).invert());
	const basis = (x: THREE.Vector3, yHint: THREE.Vector3) => {
		const X = x.clone().normalize();
		const Y = yHint.clone().addScaledVector(X, -yHint.dot(X)).normalize();
		const Z = new THREE.Vector3().crossVectors(X, Y);
		return new THREE.Matrix4().makeBasis(X, Y, Z);
	};
	let m: THREE.Matrix4, local: THREE.Vector3, at: THREE.Vector3;
	if (kind === 'pen') {
		// between thumb and index tips, nib forward along the index finger
		at = tip('thumb').add(tip('index')).multiplyScalar(0.5);
		const along = tip('index').sub(joint('index-finger-phalanx-proximal')).normalize().lerp(forward, 0.4);
		m = basis(along, dorsal);
		local = new THREE.Vector3(-0.015, 0, 0); // hold it a little behind its centre
	} else if (kind === 'mug') {
		// fingers through the handle: handle opening centre on the curled fingers
		at = joint('index-finger-phalanx-intermediate').add(joint('middle-finger-phalanx-intermediate')).multiplyScalar(0.5).addScaledVector(dorsal, -0.004);
		// mug +X (toward the handle) points from the mug body to the palm: +Y of the hand;
		// mug up is the thumb side
		m = basis(dorsal, levelUp.clone().lerp(thumbSide, 0.15));
		local = new THREE.Vector3(0.052, 0.05, 0);
	} else {
		// notebook: thumb on the cover, fingers under it, spine toward the wrist
		const under = joint('middle-finger-phalanx-intermediate');
		at = tip('thumb').add(under).multiplyScalar(0.5);
		const normal = tip('thumb').sub(under).normalize().lerp(levelUp, 0.6).normalize();
		m = basis(forward.clone().addScaledVector(normal, -forward.dot(normal)), normal);
		// basis() made X = into the book, Y = cover normal; book local Y is the thickness axis
		local = new THREE.Vector3(-0.074 + 0.035, 0.0075, 0);
	}
	const q = new THREE.Quaternion().setFromRotationMatrix(m);
	const origin = at.sub(local.clone().applyQuaternion(q));
	return new THREE.Matrix4().compose(origin, q, new THREE.Vector3(1, 1, 1));
}

const graspCache = new Map<string, THREE.Matrix4>();
export function graspFor(kind: GraspKind, handedness: 'left' | 'right'): THREE.Matrix4 {
	const k = kind + handedness;
	if (!graspCache.has(k)) graspCache.set(k, computeGrasp(kind, handedness));
	return graspCache.get(k)!;
}

export class XRHand {
	readonly model: HandModel;
	private pose: HandPose = structuredClone(POSES.gripController);
	private target: HandPose = structuredClone(POSES.gripController);
	private rayWrist: THREE.Matrix4;
	private pistolWrist: THREE.Matrix4;
	private gunWrist: THREE.Matrix4;
	private mouseWrist: THREE.Matrix4;
	/** wrist (hand root) in world space, valid after update */
	readonly wrist = new THREE.Matrix4();

	constructor(readonly handedness: 'left' | 'right', scene: THREE.Object3D) {
		this.model = new HandModel(handedness);
		this.model.root.matrixAutoUpdate = false;
		scene.add(this.model.root);
		this.rayWrist = rayToWrist(handedness);
		this.pistolWrist = rayToPistolWrist(handedness);
		this.gunWrist = pistolInHand(handedness).invert();
		this.mouseWrist = mouseToWrist(handedness);
	}

	set visible(v: boolean) { this.model.root.visible = v; }

	/** Controller-driven hand. */
	updateController(rayWorld: THREE.Matrix4, input: HandInputs, ctx: HandContext, mouseWorld: THREE.Matrix4 | null, dt: number) {
		// placement
		if (ctx.holding === 'mouse' && mouseWorld) this.wrist.multiplyMatrices(mouseWorld, this.mouseWrist);
		// a gun: the hand sits on its grip wherever the gun actually is (recoil, a
		// supporting hand steering a rifle)
		else if (ctx.holding === 'pistol' && mouseWorld) this.wrist.multiplyMatrices(mouseWorld, this.gunWrist);
		else this.wrist.multiplyMatrices(rayWorld, ctx.holding === 'pistol' ? this.pistolWrist : this.rayWrist);
		this.model.root.matrix.copy(this.wrist);
		this.model.root.matrixWorldNeedsUpdate = true;

		// target pose
		const t = this.target;
		if (ctx.holding === 'mug') blendPose(POSES.mugHandle, POSES.mugHandle, 0, t);
		else if (ctx.holding === 'notebook') blendPose(POSES.book, POSES.book, 0, t);
		else if (ctx.holding === 'pen') blendPose(POSES.pinch, POSES.pinch, 0, t);
		else if (ctx.holding === 'pistol') {
			blendPose(POSES.pistolGrip, POSES.pistolGrip, 0, t);
			// trigger finger squeezes with the analog trigger
			t.index[1] += input.trigger * 12; t.index[2] += input.trigger * 10;
		}
		else if (ctx.holding === 'mouse') {
			blendPose(POSES.mouse, POSES.mouse, 0, t);
			// clicking presses the index finger down onto the left button
			t.index[0] += input.trigger * 8; t.index[1] += input.trigger * 6;
		} else {
			// fingers wrap the handle; squeeze closes them to a fist
			blendPose(POSES.gripController, POSES.fist, input.squeeze, t);
			// the trigger finger follows the analog trigger...
			const idx = blendPose(POSES.gripController, POSES.fist, input.trigger);
			t.index = idx.index;
			// ...unless the hand is pointing (keyboard / screen), then it extends
			if (ctx.point && input.trigger < 0.5) t.index = blendPose(POSES.point, POSES.gripController, input.trigger * 2).index;
			// thumb lifts off the face buttons when not touching them
			t.thumb = input.thumbTouch ? [...POSES.gripController.thumb] : [-4, 8, 6, 6];
		}
		// critically damped approach: quick but never snapping (about 60 ms)
		blendPose(this.pose, t, 1 - Math.exp(-dt * 18), this.pose);
		this.model.setPose(this.pose);
	}

	/** Hand-tracking: copy the tracked joints onto the skeleton. */
	updateTracked(joints: Record<string, THREE.Object3D | undefined>) {
		this.wrist.identity();
		this.model.root.matrix.identity();
		this.model.root.matrixWorldNeedsUpdate = true;
		this.model.root.updateMatrixWorld(true);
		this.model.setFromJoints(joints, new THREE.Matrix4());
		const w = joints['wrist'];
		if (w) this.wrist.copy(w.matrixWorld);
	}

	indexTip(out = new THREE.Vector3()) { this.model.root.updateMatrixWorld(true); return this.model.tipWorld('index', out); }
}
