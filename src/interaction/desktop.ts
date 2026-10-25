import * as THREE from 'three';
import type { Physics, Prop } from '../physics/physics';
import { type Walkable, type InteractionTargets, type PointerOwner } from './shared';
import { EYE_HEIGHT_STANDING } from '../config';
import { XRHand, graspFor, GRASP_KINDS, type GraspKind } from './xrHands';

/**
 * Desktop (non-VR) controls.
 *
 * walk:     pointer-locked mouse-look, WASD to walk (collides with walls and
 *           furniture), click/E on a prop to pick it up, click on the monitor
 *           to start using the computer.
 * computer: the locked mouse now drives the OS cursor (and the 3D desk
 *           mouse), the keyboard types into the OS (and animates the 3D
 *           keys). Esc releases the pointer and returns to walking.
 */
export class DesktopControls {
	mode: 'walk' | 'computer' = 'walk';
	private yaw: number;
	private pitch: number;
	private keys = new Set<string>();
	private raycaster = new THREE.Raycaster();
	private held: { prop: Prop; dist: number; rot: THREE.Quaternion; last: THREE.Vector3; vel: THREE.Vector3; kind: GraspKind | null; age: number } | null = null;
	/** first-person right hand, shown while holding something */
	private hand: XRHand | null = null;
	private hover: 'screen' | 'prop' | null = null;
	private crosshair = document.getElementById('crosshair');
	private overlay = document.getElementById('overlay');
	enabled = true;

	constructor(
		private camera: THREE.PerspectiveCamera,
		private dom: HTMLElement,
		private physics: Physics,
		private targets: InteractionTargets,
		private walk: Walkable,
		private owner: PointerOwner,
	) {
		const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
		this.yaw = e.y; this.pitch = e.x;
		this.raycaster.far = 2.2;

		dom.addEventListener('click', () => {
			if (!this.enabled) return;
			if (document.pointerLockElement !== dom) { dom.requestPointerLock(); return; }
		});
		document.addEventListener('pointerlockchange', () => {
			const locked = document.pointerLockElement === dom;
			this.overlay?.classList.toggle('hidden', locked);
			this.crosshair?.classList.toggle('on', locked && this.mode === 'walk');
			if (!locked) this.exitComputer();
		});
		dom.addEventListener('mousemove', (e) => {
			if (document.pointerLockElement !== dom) return;
			if (this.mode === 'computer') {
				const os = this.targets.computer.os;
				const s = 1.15; // pointer speed
				const before = { ...os.cursor };
				os.moveBy(e.movementX * s, e.movementY * s);
				this.targets.mouse.nudgePixels(os.cursor.x - before.x, os.cursor.y - before.y);
			} else {
				this.yaw -= e.movementX * 0.0022;
				this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.45, 1.45);
			}
		});
		dom.addEventListener('mousedown', (e) => {
			if (document.pointerLockElement !== dom) return;
			if (this.mode === 'computer') { if (e.button === 0) this.targets.computer.os.pointerDown(); return; }
			if (e.button === 0) this.primary(true);
		});
		dom.addEventListener('mouseup', (e) => {
			if (this.mode === 'computer' && e.button === 0) this.targets.computer.os.pointerUp();
		});
		dom.addEventListener('wheel', (e) => {
			if (this.mode === 'computer') { this.targets.computer.os.wheel(e.deltaY); return; }
			if (this.held) this.held.dist = THREE.MathUtils.clamp(this.held.dist - e.deltaY * 0.0006, 0.3, 1.2);
		}, { passive: true });
		addEventListener('keydown', (e) => {
			if (!this.enabled) return;
			if (this.mode === 'computer') {
				// keep browser shortcuts (Ctrl+W etc.) from firing while typing into the OS
				if (this.targets.computer.physicalKey(e)) e.preventDefault();
				return;
			}
			this.keys.add(e.code);
			if (e.code === 'KeyE' && !e.repeat) this.primary();
			if (e.code === 'KeyR' && !e.repeat && this.held && this.targets.gun?.isPistol(this.held.prop)) this.targets.gun.reload();
		});
		addEventListener('keyup', (e) => {
			this.keys.delete(e.code);
			if (this.mode === 'computer') this.targets.computer.physicalKeyUp(e);
		});
		addEventListener('blur', () => this.keys.clear());
	}

	private primary(fromClick = false) {
		const gun = this.targets.gun;
		if (this.held && fromClick && gun?.isPistol(this.held.prop)) {
			// holding the pistol: click fires at the crosshair, E puts it down
			const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
			gun.pullTrigger({ origin: this.camera.position.clone(), dir });
			return;
		}
		if (this.held) { this.drop(); return; }
		const hit = this.pick();
		if (!hit) return;
		if (hit.kind === 'screen') this.enterComputer(hit.uv!);
		else if (hit.kind === 'prop') this.grab(hit.prop!, hit.distance);
	}

	private pick(): { kind: 'screen' | 'prop'; distance: number; uv?: THREE.Vector2; prop?: Prop } | null {
		this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
		const objs: THREE.Object3D[] = [this.targets.screen, ...this.physics.props.map((p) => p.desc.object)];
		const hits = this.raycaster.intersectObjects(objs, true);
		for (const h of hits) {
			if (h.object === this.targets.screen) return { kind: 'screen', distance: h.distance, uv: h.uv };
			const prop = this.physics.propForObject(h.object);
			if (prop) return { kind: 'prop', distance: h.distance, prop };
		}
		return null;
	}

	private enterComputer(uv: THREE.Vector2) {
		if (!this.owner.claim('desktop')) return;
		this.mode = 'computer';
		const p = this.targets.computer.uvToPixel(uv);
		this.targets.computer.os.pointerMove(p.x, p.y);
		this.crosshair?.classList.remove('on');
	}

	private exitComputer() {
		if (this.mode !== 'computer') return;
		this.mode = 'walk';
		this.targets.computer.os.pointerUp();
		this.owner.release('desktop');
		if (document.pointerLockElement === this.dom) this.crosshair?.classList.add('on');
	}

	private grab(prop: Prop, distance: number) {
		const camQ = this.camera.quaternion.clone();
		// remember the prop's orientation relative to the view so it turns with you
		const rel = camQ.clone().invert().multiply(this.physics.rot(prop));
		this.physics.grab(prop, 5);
		const kind = GRASP_KINDS.find((k) => k === prop.desc.name) ?? null;
		this.held = { prop, dist: THREE.MathUtils.clamp(distance, 0.45, 0.9), rot: rel, last: this.physics.pos(prop), vel: new THREE.Vector3(), kind, age: 0 };
	}

	private drop(toss = true) {
		if (!this.held) return;
		this.physics.release(this.held.prop, toss ? this.held.vel : new THREE.Vector3());
		this.held = null;
		if (this.hand) this.hand.visible = false;
	}

	update(dt: number) {
		if (!this.enabled) return;
		// look
		this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
		// walk
		if (this.mode === 'walk') {
			const f = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
			const s = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
			if (f || s) {
				const speed = this.keys.has('ShiftLeft') ? 2.2 : 1.3; // m/s, normal walking pace
				const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
				const dx = (-sin * f + cos * s) * speed * dt, dz = (-cos * f - sin * s) * speed * dt;
				const [nx, nz] = this.walk.slide(this.camera.position.x, this.camera.position.z, dx, dz);
				this.camera.position.x = nx; this.camera.position.z = nz;
			}
			this.camera.position.y = EYE_HEIGHT_STANDING;
		}
		// held prop follows a point in front of the view
		if (this.held) {
			this.held.age += dt; // simulated time, so slow frames do not count as "stuck"
			const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
			let target = this.camera.position.clone().addScaledVector(fwd, this.held.dist).add(new THREE.Vector3(0, -0.08, 0));
			let rot = this.camera.quaternion.clone().multiply(this.held.rot);
			if (this.held.kind && this.camera.parent) {
				// show a right hand holding it, low and to the right of the view, the
				// way you would carry it; the object eases into the hand's grasp
				this.hand ??= new XRHand('right', this.camera.parent);
				this.hand.visible = true;
				const camQ = this.camera.quaternion;
				const rayPos = this.camera.position.clone().add(new THREE.Vector3(0.13, -0.12, -(this.held.dist - 0.1)).applyQuaternion(camQ));
				const rayQ = camQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15, 0.12, 0)));
				const ray = new THREE.Matrix4().compose(rayPos, rayQ, new THREE.Vector3(1, 1, 1));
				this.hand.updateController(ray, { trigger: 0, squeeze: 0, thumbTouch: true }, { point: false, holding: this.held.kind }, null, dt);
				const g = new THREE.Matrix4().multiplyMatrices(this.hand.wrist, graspFor(this.held.kind, 'right'));
				const gp = new THREE.Vector3(), gq = new THREE.Quaternion();
				g.decompose(gp, gq, new THREE.Vector3());
				const k = THREE.MathUtils.smoothstep(Math.min(1, this.held.age / 0.25), 0, 1);
				target = target.lerp(gp, k);
				rot = rot.slerp(gq, k);
			}
			const gun = this.targets.gun;
			if (gun?.isPistol(this.held.prop)) {
				const m = new THREE.Matrix4().compose(target, rot, new THREE.Vector3(1, 1, 1)).multiply(gun.pistol.recoilMatrix());
				m.decompose(target, rot, new THREE.Vector3());
			}
			this.physics.setHoldTarget(this.held.prop, target, rot);
			const p = this.physics.pos(this.held.prop);
			this.held.vel.copy(p).sub(this.held.last).divideScalar(Math.max(dt, 1e-3));
			this.held.last.copy(p);
			// if it is stuck behind something, let go rather than drag it through
			// (after it has had time to travel from where it was picked up)
			if (this.held.age > 0.6 && this.physics.holdError(this.held.prop) > 0.45) this.drop(false);
		}
		// hover feedback on the crosshair
		if (this.mode === 'walk' && document.pointerLockElement === this.dom) {
			const h = this.held ? null : this.pick();
			const hv = h?.kind ?? null;
			if (hv !== this.hover) { this.hover = hv; this.crosshair?.classList.toggle('hot', !!hv); }
		}
	}
}
