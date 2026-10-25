import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { StaticCollider } from '../world/room';

/**
 * Rigid-body physics (Rapier, metres / kilograms / seconds).
 *
 * - Architecture and furniture are fixed cuboid colliders.
 * - Small props are dynamic with per-object mass, friction, restitution and
 *   damping, CCD on, sleeping allowed.
 * - Fixed 120 Hz step with an accumulator; render poses are interpolated.
 * - Held objects stay dynamic and are driven by velocity toward the hand
 *   pose, so walls, the desk and other props still block them (no tunnelling
 *   through geometry, no teleporting). Releasing keeps the hand's velocity.
 */

export const GROUP_STATIC = 0x0001;
export const GROUP_PROP = 0x0002;
const groups = (member: number, filter: number) => (member << 16) | filter;

export interface PropShape {
	kind: 'cuboid' | 'cylinder' | 'capsuleX' | 'ball';
	/** cuboid: half extents; cylinder: [radius, halfHeight]; capsuleX: [radius, halfLength]; ball: [radius] */
	size: number[];
	offset?: [number, number, number];
}

export interface PropDesc {
	name: string;
	object: THREE.Object3D;
	shapes: PropShape[];
	mass: number;
	friction: number;
	restitution: number;
	linearDamping?: number;
	angularDamping?: number;
}

export interface Prop {
	desc: PropDesc;
	body: RAPIER.RigidBody;
	prevPos: THREE.Vector3;
	prevRot: THREE.Quaternion;
	held: boolean;
}

let rapierReady = false;
/** Load Rapier's WASM. Returns false (instead of throwing) where WebAssembly is blocked. */
export async function initPhysics(): Promise<boolean> {
	try { await RAPIER.init(); rapierReady = true; } catch (e) { console.warn('Physics unavailable:', e); }
	return rapierReady;
}

export class Physics {
	world: RAPIER.World;
	props: Prop[] = [];
	readonly dt = 1 / 120;
	private acc = 0;
	private holds = new Map<Prop, { target: THREE.Vector3; targetRot: THREE.Quaternion; maxSpeed: number }>();

	/** false when the WASM engine could not start: props then stay where they are */
	readonly enabled = rapierReady;

	constructor() {
		if (!this.enabled) { this.world = null as unknown as RAPIER.World; return; }
		this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
		this.world.timestep = this.dt;
		// a few more solver iterations for stable stacked resting contacts, and
		// extra friction passes so things resting on slopes / each other don't creep
		const ip = this.world.integrationParameters as any;
		ip.numSolverIterations = 8;
		if ('numAdditionalFrictionIterations' in ip) ip.numAdditionalFrictionIterations = 4;
		if ('numInternalPgsIterations' in ip) ip.numInternalPgsIterations = 2;
	}

	addStatic(c: StaticCollider) {
		if (!this.enabled) return;
		const desc = RAPIER.ColliderDesc.cuboid(c.half.x, c.half.y, c.half.z)
			.setTranslation(c.center.x, c.center.y, c.center.z)
			.setFriction(0.7)
			.setCollisionGroups(groups(GROUP_STATIC, GROUP_PROP));
		if (c.rotationY) {
			const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rotationY);
			desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
		}
		this.world.createCollider(desc);
	}

	addProp(d: PropDesc): Prop {
		const o = d.object;
		o.updateMatrixWorld(true);
		const p = o.getWorldPosition(new THREE.Vector3());
		const q = o.getWorldQuaternion(new THREE.Quaternion());
		const bd = RAPIER.RigidBodyDesc.dynamic()
			.setTranslation(p.x, p.y, p.z)
			.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
			.setLinearDamping(d.linearDamping ?? 0.05)
			.setAngularDamping(d.angularDamping ?? 0.35)
			.setCcdEnabled(true)
			.setCanSleep(true);
		const body = this.world.createRigidBody(bd);
		// distribute mass across shapes by volume
		const vols = d.shapes.map(shapeVolume);
		const total = vols.reduce((a, b) => a + b, 0);
		d.shapes.forEach((s, i) => {
			let cd: RAPIER.ColliderDesc;
			switch (s.kind) {
				case 'cuboid': cd = RAPIER.ColliderDesc.cuboid(s.size[0], s.size[1], s.size[2]); break;
				case 'cylinder': cd = RAPIER.ColliderDesc.cylinder(s.size[1], s.size[0]); break;
				case 'capsuleX': {
					cd = RAPIER.ColliderDesc.capsule(s.size[1], s.size[0]);
					const r = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
					cd.setRotation({ x: r.x, y: r.y, z: r.z, w: r.w });
					break;
				}
				case 'ball': cd = RAPIER.ColliderDesc.ball(s.size[0]); break;
			}
			const off = s.offset ?? [0, 0, 0];
			cd.setTranslation(off[0], off[1], off[2])
				.setMass(d.mass * (vols[i] / total))
				.setFriction(d.friction)
				.setRestitution(d.restitution)
				.setCollisionGroups(groups(GROUP_PROP, GROUP_STATIC | GROUP_PROP));
			this.world.createCollider(cd, body);
		});
		// object is driven by the body from now on: reparent to world space
		if (o.parent && o.parent.type !== 'Scene') {
			o.parent.remove(o);
		}
		const prop: Prop = { desc: d, body, prevPos: p.clone(), prevRot: q.clone(), held: false };
		this.props.push(prop);
		return prop;
	}

	// ------------------------------------------------------------------ holding
	grab(prop: Prop, maxSpeed = 12) {
		prop.held = true;
		prop.body.wakeUp();
		prop.body.setGravityScale(0, true);
		this.holds.set(prop, { target: this.pos(prop), targetRot: this.rot(prop), maxSpeed });
	}

	/** Update where the hand wants the held object to be (world pose of the object). */
	setHoldTarget(prop: Prop, pos: THREE.Vector3, rot: THREE.Quaternion) {
		const h = this.holds.get(prop);
		if (h) { h.target.copy(pos); h.targetRot.copy(rot); }
	}

	/** Distance between the held object and where the hand wants it. */
	holdError(prop: Prop): number {
		const h = this.holds.get(prop);
		return h ? this.pos(prop).distanceTo(h.target) : 0;
	}

	/**
	 * Let go. A throw takes the hand's velocity (a hard overarm throw is
	 * 10-15 m/s) and, when given, its spin; otherwise the object keeps a
	 * little of the spin it had.
	 */
	release(prop: Prop, throwVel?: THREE.Vector3, throwSpin?: THREE.Vector3) {
		this.holds.delete(prop);
		prop.held = false;
		prop.body.setGravityScale(1, true);
		if (throwVel) {
			const v = throwVel.clone();
			if (v.length() > 14) v.setLength(14);
			prop.body.setLinvel(v, true);
		}
		if (throwSpin) {
			const w = throwSpin.clone();
			if (w.length() > 25) w.setLength(25);
			prop.body.setAngvel(w, true);
		} else {
			const w = prop.body.angvel();
			prop.body.setAngvel({ x: w.x * 0.5, y: w.y * 0.5, z: w.z * 0.5 }, true);
		}
	}

	private _v = new THREE.Vector3();
	private _q = new THREE.Quaternion();
	private driveHeld() {
		for (const [prop, h] of this.holds) {
			const b = prop.body;
			// linear: critically-damped approach, capped speed
			const p = this.pos(prop);
			const err = this._v.copy(h.target).sub(p);
			// follows a fast hand closely; when far off its target it is being
			// blocked (pressed into a wall), so it pushes gently instead of tunnelling
			const cap = err.length() > 0.2 ? Math.min(5, h.maxSpeed) : h.maxSpeed;
			const v = err.divideScalar(this.dt * 3);
			if (v.length() > cap) v.setLength(cap);
			b.setLinvel(v, true);
			// angular: shortest rotation to target over a few steps
			const q = this.rot(prop);
			const dq = this._q.copy(h.targetRot).multiply(q.invert()).normalize();
			if (dq.w < 0) { dq.x *= -1; dq.y *= -1; dq.z *= -1; dq.w *= -1; }
			// float error can push w a hair past 1: clamp, or sqrt/acos return NaN
			// and a NaN angular velocity silently freezes the body in Rapier
			const cw = Math.min(1, dq.w);
			const angle = 2 * Math.acos(cw);
			const s = Math.sqrt(1 - cw * cw);
			const axis = s < 1e-4 ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(dq.x / s, dq.y / s, dq.z / s);
			const w = axis.multiplyScalar(Math.min(angle / (this.dt * 3), 25));
			b.setAngvel(w, true);
		}
	}

	/** Remove a prop for good (e.g. a magazine pushed into a gun). */
	removeProp(prop: Prop) {
		if (!this.enabled) return;
		this.holds.delete(prop);
		const i = this.props.indexOf(prop);
		if (i >= 0) this.props.splice(i, 1);
		this.world.removeRigidBody(prop.body);
		prop.desc.object.parent?.remove(prop.desc.object);
	}

	/** Take a prop out of the simulation (or put it back), keeping it for undo. */
	setPropEnabled(prop: Prop, on: boolean) {
		prop.body.setEnabled(on);
		if (on) prop.body.wakeUp();
	}

	/** Static props hold their place (and still collide); dynamic ones fall and can be carried. */
	setPropStatic(prop: Prop, fixed: boolean) {
		prop.body.setBodyType(fixed ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic, true);
		(prop as any).fixed = fixed;
	}
	isPropStatic(prop: Prop) { return !!(prop as any).fixed; }

	/** Move a prop instantly (no sweep), at rest. */
	teleport(prop: Prop, pos: THREE.Vector3, rot: THREE.Quaternion) {
		this.holds.delete(prop);
		prop.held = false;
		prop.body.setGravityScale(1, true);
		prop.body.setTranslation(pos, true);
		prop.body.setRotation(rot, true);
		prop.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
		prop.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
		prop.prevPos.copy(pos); prop.prevRot.copy(rot);
		prop.desc.object.position.copy(pos); prop.desc.object.quaternion.copy(rot);
	}

	pos(prop: Prop, out = new THREE.Vector3()) { const t = prop.body.translation(); return out.set(t.x, t.y, t.z); }
	rot(prop: Prop, out = new THREE.Quaternion()) { const r = prop.body.rotation(); return out.set(r.x, r.y, r.z, r.w); }

	// ------------------------------------------------------------------ stepping
	step(frameDt: number) {
		if (!this.enabled) return;
		this.acc += Math.min(frameDt, 0.1);
		let n = 0;
		while (this.acc >= this.dt && n < 8) {
			for (const p of this.props) { this.pos(p, p.prevPos); this.rot(p, p.prevRot); }
			this.driveHeld();
			this.world.step();
			this.acc -= this.dt;
			n++;
		}
		if (n === 8) this.acc = 0; // never spiral; drop time instead
		// interpolate render poses
		const a = this.acc / this.dt;
		const p = new THREE.Vector3(), q = new THREE.Quaternion();
		for (const prop of this.props) {
			if (!prop.body.isEnabled()) continue; // taken out (deleted, or carried by the editor)
			this.pos(prop, p); this.rot(prop, q);
			prop.desc.object.position.lerpVectors(prop.prevPos, p, a);
			prop.desc.object.quaternion.slerpQuaternions(prop.prevRot, q, a);
		}
	}

	/** The prop whose collider surface is nearest to a point, within radius. */
	propNear(point: THREE.Vector3, radius: number): Prop | null {
		if (!this.enabled) return null;
		let best: Prop | null = null, bestD = radius;
		const ball = new RAPIER.Ball(radius);
		this.world.intersectionsWithShape(point, { x: 0, y: 0, z: 0, w: 1 }, ball, (col) => {
			const body = col.parent();
			const prop = this.props.find((pp) => pp.body === body);
			if (prop) {
				// distance to the collider's surface (0 inside), not to the body origin:
				// a pen lying on a notebook must not win just because its centre is closer
				const proj = col.projectPoint(point, true);
				const d = proj ? Math.hypot(proj.point.x - point.x, proj.point.y - point.y, proj.point.z - point.z) : Infinity;
				if (d < bestD || !best) { best = prop; bestD = d; }
			}
			return true;
		}, undefined, groups(GROUP_STATIC | GROUP_PROP, GROUP_PROP));
		return best;
	}

	/** Prop owning a three.js object (walks up the parent chain). */
	propForObject(o: THREE.Object3D | null): Prop | null {
		while (o) {
			const p = this.props.find((pp) => pp.desc.object === o);
			if (p) return p;
			o = o.parent;
		}
		return null;
	}
}

function shapeVolume(s: PropShape): number {
	switch (s.kind) {
		case 'cuboid': return 8 * s.size[0] * s.size[1] * s.size[2];
		case 'cylinder': return Math.PI * s.size[0] ** 2 * 2 * s.size[1];
		case 'capsuleX': return Math.PI * s.size[0] ** 2 * (2 * s.size[1] + (4 / 3) * s.size[0]);
		case 'ball': return (4 / 3) * Math.PI * s.size[0] ** 3;
	}
}
