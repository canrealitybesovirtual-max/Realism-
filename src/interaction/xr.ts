import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import type { Physics, Prop } from '../physics/physics';
import type { Walkable, InteractionTargets, PointerOwner } from './shared';
import { KEYS } from '../computer/keyLayout';
import { KB } from '../world/furniture/keyboard';

/**
 * WebXR controls.
 *
 * Per controller, in priority order:
 *  1. Holding something (prop or the desk mouse): follow the grip.
 *  2. Poke typing: the controller tip pressing a key on the 3D keyboard.
 *  3. Pointing ray: monitor (absolute cursor; trigger = click, stick = scroll),
 *     keycaps (trigger = type), props / desk mouse (squeeze or trigger = grab).
 *  4. Locomotion on the thumbstick when not pointing at the monitor:
 *     push forward to aim a teleport arc, release to go; flick left/right to
 *     snap-turn 30 degrees.
 *
 * Input ownership: a controller that starts a click on the monitor owns the
 * OS pointer until the trigger is released; the other controller's ray then
 * cannot move the cursor. Grabs and pokes never fall through to locomotion.
 */

interface Hand {
	index: number;
	ray: THREE.Group; // target-ray space
	grip: THREE.Group;
	source: XRInputSource | null;
	line: THREE.Line;
	dot: THREE.Mesh;
	tip: THREE.Mesh;
	prevButtons: boolean[];
	held: { prop: Prop; offset: THREE.Matrix4 } | null;
	holdingMouse: boolean;
	mouseGrabOffset: THREE.Vector3;
	velHistory: { p: THREE.Vector3; t: number }[];
	pokeKey: number;
	pointing: 'screen' | 'key' | 'prop' | 'mouse' | null;
	pointKey: number;
	pointProp: Prop | null;
	screenClick: boolean;
	teleportAim: boolean;
	turnReady: boolean;
	scrollAcc: number;
}

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class XRControls {
	readonly rig = new THREE.Group();
	private hands: Hand[] = [];
	private raycaster = new THREE.Raycaster();
	private arc: THREE.Line;
	private marker: THREE.Mesh;
	private teleportTarget: THREE.Vector3 | null = null;

	constructor(
		private renderer: THREE.WebGLRenderer,
		private scene: THREE.Scene,
		camera: THREE.PerspectiveCamera,
		private physics: Physics,
		private targets: InteractionTargets,
		private walk: Walkable,
		private owner: PointerOwner,
	) {
		this.rig.name = 'xr-rig';
		scene.add(this.rig);
		const factory = new XRControllerModelFactory();
		for (let i = 0; i < 2; i++) this.hands.push(this.makeHand(i, factory));

		// teleport arc + landing marker
		const arcGeo = new THREE.BufferGeometry().setFromPoints(new Array(40).fill(0).map(() => new THREE.Vector3()));
		this.arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: 0x7fd3ff, transparent: true, opacity: 0.85 }));
		this.arc.frustumCulled = false;
		this.arc.visible = false;
		scene.add(this.arc);
		this.marker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fd3ff, transparent: true, opacity: 0.9 }));
		this.marker.visible = false;
		scene.add(this.marker);

		renderer.xr.addEventListener('sessionstart', () => {
			// stand the user in the room facing the desk, a step back from the chair
			this.rig.position.set(0.2, 0, -0.55);
			this.rig.rotation.set(0, 0, 0);
			this.rig.add(camera);
		});
		renderer.xr.addEventListener('sessionend', () => {
			this.rig.remove(camera);
			scene.add(camera);
			for (const h of this.hands) this.releaseAll(h);
		});
	}

	private makeHand(i: number, factory: XRControllerModelFactory): Hand {
		const ray = this.renderer.xr.getController(i);
		const grip = this.renderer.xr.getControllerGrip(i);
		grip.add(factory.createControllerModel(grip));
		this.rig.add(ray, grip);
		const line = new THREE.Line(
			new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
			new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
		);
		line.scale.z = 1.5;
		ray.add(line);
		const dot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), new THREE.MeshBasicMaterial({ color: 0x8fd8ff }));
		dot.visible = false;
		this.scene.add(dot);
		// fingertip: a small sphere at the front of the controller used for poking keys
		const tip = new THREE.Mesh(new THREE.SphereGeometry(0.007, 16, 12), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 }));
		tip.position.set(0, 0, -0.03);
		ray.add(tip);
		const hand: Hand = {
			index: i, ray, grip, source: null, line, dot, tip, prevButtons: [], held: null, holdingMouse: false,
			mouseGrabOffset: new THREE.Vector3(), velHistory: [], pokeKey: -1, pointing: null, pointKey: -1, pointProp: null,
			screenClick: false, teleportAim: false, turnReady: true, scrollAcc: 0,
		};
		ray.addEventListener('connected', (e: any) => { hand.source = e.data; });
		ray.addEventListener('disconnected', () => { this.releaseAll(hand); hand.source = null; });
		return hand;
	}

	update(dt: number, now: number) {
		if (!this.renderer.xr.isPresenting) return;
		this.rig.updateMatrixWorld(true);
		for (const h of this.hands) this.updateHand(h, dt, now);
	}

	private buttons(h: Hand) {
		const gp = h.source?.gamepad;
		const b = gp?.buttons ?? [];
		const pressed = b.map((x) => x.pressed);
		const was = h.prevButtons;
		h.prevButtons = pressed;
		const axes = gp?.axes ?? [];
		return {
			trigger: !!pressed[0], triggerDown: !!pressed[0] && !was[0], triggerUp: !pressed[0] && !!was[0],
			squeeze: !!pressed[1], squeezeDown: !!pressed[1] && !was[1], squeezeUp: !pressed[1] && !!was[1],
			stickX: axes[2] ?? 0, stickY: axes[3] ?? 0,
		};
	}

	private pulse(h: Hand, intensity = 0.3, ms = 15) {
		const act = h.source?.gamepad?.hapticActuators?.[0] as any;
		act?.pulse?.(intensity, ms);
	}

	private updateHand(h: Hand, dt: number, now: number) {
		if (!h.source) { h.line.visible = false; h.dot.visible = false; return; }
		const btn = this.buttons(h);
		const gripPos = h.grip.getWorldPosition(new THREE.Vector3());
		h.velHistory.push({ p: gripPos.clone(), t: now });
		while (h.velHistory.length > 6) h.velHistory.shift();

		// ---------------------------------------------------- 1. holding
		if (h.held) {
			_m.multiplyMatrices(h.grip.matrixWorld, h.held.offset);
			_m.decompose(_v, _q, new THREE.Vector3());
			this.physics.setHoldTarget(h.held.prop, _v, _q);
			const releasing = btn.squeezeUp || (btn.triggerUp && !btn.squeeze);
			if (releasing || this.physics.holdError(h.held.prop) > 0.4) this.releaseProp(h);
			h.line.visible = false; h.dot.visible = false;
			return;
		}
		if (h.holdingMouse) {
			const target = gripPos.clone().add(h.mouseGrabOffset);
			const [dx, dy] = this.targets.mouse.slideTo(target.x, target.z);
			if ((dx || dy) && this.owner.claim('xr-mouse-' + h.index)) this.targets.computer.os.moveBy(dx, dy);
			if (btn.triggerDown) { this.targets.computer.os.pointerDown(); this.pulse(h, 0.2, 10); }
			if (btn.triggerUp) this.targets.computer.os.pointerUp();
			if (btn.squeezeUp) {
				h.holdingMouse = false;
				this.targets.computer.os.pointerUp();
				this.owner.release('xr-mouse-' + h.index);
			}
			h.line.visible = false; h.dot.visible = false;
			return;
		}

		// ---------------------------------------------------- 2. poke typing
		const tipW = h.tip.getWorldPosition(new THREE.Vector3());
		const poked = this.pokeKey(tipW, h.pokeKey);
		if (poked !== h.pokeKey) {
			if (poked >= 0) {
				this.targets.computer.virtualKey(poked);
				this.targets.computer.onKeyVisual(poked, true);
				this.pulse(h, 0.35, 12);
			}
			if (h.pokeKey >= 0) this.targets.computer.onKeyVisual(h.pokeKey, false);
			h.pokeKey = poked;
		}

		// ---------------------------------------------------- 3. pointing
		const origin = h.ray.getWorldPosition(new THREE.Vector3());
		const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(h.ray.getWorldQuaternion(new THREE.Quaternion()));
		this.raycaster.set(origin, dir);
		this.raycaster.far = 3;
		const objs: THREE.Object3D[] = [this.targets.screen, this.targets.keycaps, this.targets.mouse.object, ...this.physics.props.map((p) => p.desc.object)];
		const hit = this.raycaster.intersectObjects(objs, true)[0];
		h.pointing = null; h.pointProp = null; h.pointKey = -1;
		if (hit) {
			if (hit.object === this.targets.screen) h.pointing = 'screen';
			else if (hit.object === this.targets.keycaps) {
				h.pointing = 'key';
				const ki = (hit.object as THREE.Mesh).geometry.getAttribute('keyIndex');
				h.pointKey = hit.face ? ki.getX(hit.face.a) : -1;
			} else if (isChildOf(hit.object, this.targets.mouse.object)) h.pointing = 'mouse';
			else { h.pointProp = this.physics.propForObject(hit.object); if (h.pointProp) h.pointing = 'prop'; }
		}
		// near grab: grip within 9 cm of a prop wins over the ray
		const near = this.physics.propNear(gripPos, 0.09);
		const mouseNear = gripPos.distanceTo(this.targets.mouse.object.getWorldPosition(_v)) < 0.09;

		// ray visuals
		h.line.visible = true;
		if (hit && h.pointing) {
			h.line.scale.z = hit.distance;
			h.dot.visible = true;
			h.dot.position.copy(hit.point);
			(h.line.material as THREE.LineBasicMaterial).opacity = 0.75;
		} else {
			h.line.scale.z = 1.2;
			h.dot.visible = false;
			(h.line.material as THREE.LineBasicMaterial).opacity = 0.3;
		}

		// screen pointer
		const os = this.targets.computer.os;
		const id = 'xr-' + h.index;
		if (h.pointing === 'screen' && hit?.uv && (this.owner.is(id) || this.owner.free)) {
			const p = this.targets.computer.uvToPixel(hit.uv);
			os.pointerMove(p.x, p.y);
		}
		if (btn.triggerDown && h.pointing === 'screen' && this.owner.claim(id)) {
			os.pointerDown(); h.screenClick = true; this.pulse(h, 0.25, 10);
		}
		if (btn.triggerUp && h.screenClick) { os.pointerUp(); h.screenClick = false; this.owner.release(id); }
		// ray typing
		if (btn.triggerDown && h.pointing === 'key' && h.pointKey >= 0) {
			this.targets.computer.virtualKey(h.pointKey);
			this.targets.computer.onKeyVisual(h.pointKey, true);
			const k = h.pointKey;
			setTimeout(() => this.targets.computer.onKeyVisual(k, false), 110);
			this.pulse(h, 0.3, 10);
		}
		// grabbing
		const grabPressed = btn.squeezeDown || (btn.triggerDown && (h.pointing === 'prop' || h.pointing === 'mouse' || near || mouseNear) && h.pointing !== 'screen');
		if (grabPressed) {
			if (mouseNear || h.pointing === 'mouse') this.grabMouse(h, gripPos);
			else if (near) this.grabProp(h, near);
			else if (h.pointing === 'prop' && h.pointProp && hit!.distance < 1.2) this.grabProp(h, h.pointProp);
			if (h.held || h.holdingMouse) return;
		}

		// ---------------------------------------------------- 4. locomotion / scrolling
		if (h.pointing === 'screen') {
			h.scrollAcc += btn.stickY * dt * 1200;
			if (Math.abs(h.scrollAcc) > 40) { os.wheel(h.scrollAcc); h.scrollAcc = 0; }
			if (h.teleportAim) this.cancelTeleport(h);
			return;
		}
		this.locomotion(h, btn.stickX, btn.stickY, origin, dir);
	}

	/**
	 * Which key the fingertip is pressing, with hysteresis: a key goes down
	 * when the tip sphere sinks 2 mm into its top and only comes back up
	 * once the tip rises 4 mm above that, so a hovering hand does not chatter.
	 */
	private pokeKey(tipWorld: THREE.Vector3, current: number): number {
		const deck = this.targets.keycaps.parent as THREE.Object3D;
		const local = deck.worldToLocal(tipWorld.clone());
		const kw = 18.25 * 0.01905, kd = 6.25 * 0.01905;
		if (Math.abs(local.x) > kw / 2 + 0.01 || Math.abs(local.z) > kd / 2 + 0.01 || local.y < -0.03) return -1;
		const tipR = 0.007, capTop = 0.001 + KB.capHeight;
		const tipBottom = local.y - tipR;
		const ux = (local.x + kw / 2) / 0.01905, uz = (local.z + kd / 2) / 0.01905;
		const inKey = (i: number, m: number) => { const k = KEYS[i]; return ux >= k.x + m && ux <= k.x + k.w - m && uz >= k.y + m && uz <= k.y + 1 - m; };
		if (current >= 0 && inKey(current, -0.1) && tipBottom < capTop + 0.002) return current;
		if (tipBottom > capTop - 0.002) return -1;
		return KEYS.findIndex((_, i) => inKey(i, 0.06));
	}

	private grabProp(h: Hand, prop: Prop) {
		// keep the object where it is relative to the hand: offset = grip^-1 * object
		this.physics.grab(prop, 6);
		const objM = new THREE.Matrix4().compose(this.physics.pos(prop), this.physics.rot(prop), new THREE.Vector3(1, 1, 1));
		h.held = { prop, offset: new THREE.Matrix4().copy(h.grip.matrixWorld).invert().multiply(objM) };
		this.pulse(h, 0.45, 25);
	}

	private releaseProp(h: Hand) {
		if (!h.held) return;
		const hist = h.velHistory;
		let vel = new THREE.Vector3();
		if (hist.length >= 2) {
			const a = hist[0], b = hist[hist.length - 1];
			const t = (b.t - a.t) / 1000;
			if (t > 0) vel = b.p.clone().sub(a.p).divideScalar(t);
		}
		this.physics.release(h.held.prop, vel);
		h.held = null;
	}

	private grabMouse(h: Hand, gripPos: THREE.Vector3) {
		h.holdingMouse = true;
		h.mouseGrabOffset.copy(this.targets.mouse.object.getWorldPosition(new THREE.Vector3())).sub(gripPos);
		this.pulse(h, 0.3, 15);
	}

	private releaseAll(h: Hand) {
		this.releaseProp(h);
		if (h.holdingMouse) { h.holdingMouse = false; this.targets.computer.os.pointerUp(); this.owner.release('xr-mouse-' + h.index); }
		if (h.screenClick) { this.targets.computer.os.pointerUp(); h.screenClick = false; this.owner.release('xr-' + h.index); }
		this.cancelTeleport(h);
	}

	// ------------------------------------------------------------------ locomotion
	private locomotion(h: Hand, sx: number, sy: number, origin: THREE.Vector3, dir: THREE.Vector3) {
		// snap turn
		if (Math.abs(sx) > 0.75 && h.turnReady && !h.teleportAim) {
			this.snapTurn(sx > 0 ? -Math.PI / 6 : Math.PI / 6);
			h.turnReady = false;
		}
		if (Math.abs(sx) < 0.3) h.turnReady = true;
		// teleport
		if (sy < -0.6) {
			h.teleportAim = true;
			this.aimTeleport(origin, dir);
		} else if (h.teleportAim && sy > -0.3) {
			h.teleportAim = false;
			if (this.teleportTarget) this.teleportTo(this.teleportTarget);
			this.arc.visible = false; this.marker.visible = false;
		}
	}

	private cancelTeleport(h: Hand) {
		h.teleportAim = false;
		this.arc.visible = false; this.marker.visible = false; this.teleportTarget = null;
	}

	private aimTeleport(origin: THREE.Vector3, dir: THREE.Vector3) {
		// ballistic arc, 7 m/s launch, sampled until it reaches the floor
		const pts: THREE.Vector3[] = [];
		const v = dir.clone().multiplyScalar(7);
		const p = origin.clone();
		let landed: THREE.Vector3 | null = null;
		for (let i = 0; i < 40; i++) {
			pts.push(p.clone());
			const next = p.clone().addScaledVector(v, 0.03);
			v.y -= 9.81 * 0.03;
			if (next.y <= 0) {
				const t = p.y / (p.y - next.y);
				landed = p.clone().lerp(next, t);
				pts.push(landed.clone());
				break;
			}
			p.copy(next);
		}
		while (pts.length < 40) pts.push(pts[pts.length - 1].clone());
		(this.arc.geometry as THREE.BufferGeometry).setFromPoints(pts.slice(0, 40));
		const valid = !!landed && this.walk.ok(landed.x, landed.z, 0.2);
		const col = valid ? 0x7fd3ff : 0xff6b6b;
		(this.arc.material as THREE.LineBasicMaterial).color.set(col);
		this.arc.visible = true;
		this.marker.visible = !!landed;
		if (landed) { this.marker.position.set(landed.x, 0.003, landed.z); (this.marker.material as THREE.MeshBasicMaterial).color.set(col); }
		this.teleportTarget = valid ? landed : null;
	}

	/** Move the rig so the user's head (not the rig origin) lands on the target. */
	private teleportTo(target: THREE.Vector3) {
		const head = this.renderer.xr.getCamera().getWorldPosition(new THREE.Vector3());
		this.rig.position.x += target.x - head.x;
		this.rig.position.z += target.z - head.z;
	}

	private snapTurn(angle: number) {
		// rotate about the head so the user does not swing around the rig origin
		const head = this.renderer.xr.getCamera().getWorldPosition(new THREE.Vector3());
		const offset = this.rig.position.clone().sub(head).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
		this.rig.position.copy(head).add(offset);
		this.rig.position.y = 0;
		this.rig.rotation.y += angle;
	}
}

function isChildOf(o: THREE.Object3D, parent: THREE.Object3D): boolean {
	for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === parent) return true;
	return false;
}
