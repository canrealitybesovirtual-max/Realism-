import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import type { Physics, Prop } from '../physics/physics';
import type { Walkable, InteractionTargets, PointerOwner } from './shared';
import { KEYS } from '../computer/keyLayout';
import { KB } from '../world/furniture/keyboard';
import { XRHand, graspFor, GRASP_KINDS, type GraspKind } from './xrHands';

/**
 * WebXR controls.
 *
 * Per controller, in priority order:
 *  1. Holding something (prop or the desk mouse): follow the grip.
 *  2. Poke typing: the controller tip pressing a key on the 3D keyboard.
 *  3. Pointing ray: monitor (absolute cursor; trigger = click, stick = scroll),
 *     keycaps (trigger = type), props / desk mouse (squeeze or trigger = grab).
 *  4. Locomotion (independent of 1-3, so you can walk while holding things):
 *     left stick walks smoothly in the direction you are looking, sliding
 *     along walls and furniture; right stick flicks snap-turn 30 degrees, and
 *     scrolls instead while the right ray points at the monitor. A mild
 *     vignette narrows the view only while moving, for comfort.
 *
 * Hands: by default the controllers are drawn as animated human hands
 * (see xrHands.ts / handModel.ts): fingers follow the analog trigger, grip
 * and thumb rest; the index finger extends near the keyboard and screen and
 * does the key presses; held objects settle into a natural grasp. With
 * WebXR hand tracking the skeleton follows the tracked joints and a
 * thumb-index pinch acts as the trigger. ?controllers shows plain
 * controller models instead.
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
	held: { prop: Prop; offset: THREE.Matrix4; kind: GraspKind | null; age: number } | null;
	visual: XRHand | null;
	handSpace: THREE.XRHandSpace;
	ctrlVisuals: THREE.Object3D[];
	pinching: boolean;
	holdingMouse: boolean;
	mouseGrabOffset: THREE.Vector3;
	velHistory: { p: THREE.Vector3; t: number }[];
	pokeKey: number;
	pointing: 'screen' | 'key' | 'prop' | 'mouse' | null;
	pointKey: number;
	pointProp: Prop | null;
	screenClick: boolean;
	turnReady: boolean;
	scrollAcc: number;
}

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class XRControls {
	readonly rig = new THREE.Group();
	private hands: Hand[] = [];
	private raycaster = new THREE.Raycaster();
	private walkVel = new THREE.Vector2();
	private vignette: THREE.Mesh;
	readonly handsEnabled = !new URLSearchParams(location.search).has('controllers');

	constructor(
		private renderer: THREE.WebGLRenderer,
		private scene: THREE.Scene,
		private camera: THREE.PerspectiveCamera,
		private physics: Physics,
		private targets: InteractionTargets,
		private walk: Walkable,
		private owner: PointerOwner,
	) {
		this.rig.name = 'xr-rig';
		scene.add(this.rig);
		const factory = new XRControllerModelFactory();
		for (let i = 0; i < 2; i++) this.hands.push(this.makeHand(i, factory));

		// comfort vignette: a dark ring just in front of the eyes, faded in with walking speed
		this.vignette = new THREE.Mesh(
			new THREE.RingGeometry(0.05, 0.6, 48),
			new THREE.ShaderMaterial({
				transparent: true, depthTest: false, depthWrite: false,
				uniforms: { uStrength: { value: 0 } },
				vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
				fragmentShader: 'uniform float uStrength; varying vec2 vP; void main() { float r = length(vP); gl_FragColor = vec4(0.0, 0.0, 0.0, uStrength * smoothstep(0.065, 0.14, r)); }',
			}),
		);
		this.vignette.position.z = -0.1;
		this.vignette.renderOrder = 999;
		this.vignette.frustumCulled = false;
		this.vignette.visible = false;
		camera.add(this.vignette);

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
		// Official controller meshes come from the WebXR input-profiles CDN. If
		// that cannot be reached, show a neutral built-in controller instead so
		// the hands never disappear.
		const model = factory.createControllerModel(grip);
		grip.add(model);
		const fallback = fallbackController();
		grip.add(fallback);
		const check = setInterval(() => {
			if (model.children.length > 0) { fallback.visible = false; clearInterval(check); }
		}, 500);
		const handSpace = this.renderer.xr.getHand(i);
		this.rig.add(ray, grip, handSpace);
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
			screenClick: false, turnReady: true, scrollAcc: 0,
			visual: null, handSpace, ctrlVisuals: [model, fallback, tip], pinching: false,
		};
		ray.addEventListener('connected', (e: any) => {
			hand.source = e.data;
			const side = (e.data as XRInputSource).handedness === 'left' ? 'left' : 'right';
			if (this.handsEnabled && (!hand.visual || hand.visual.handedness !== side)) {
				if (hand.visual) this.scene.remove(hand.visual.model.root);
				hand.visual = new XRHand(side, this.scene);
			}
		});
		ray.addEventListener('disconnected', () => { this.releaseAll(hand); hand.source = null; if (hand.visual) hand.visual.visible = false; });
		return hand;
	}

	update(dt: number, now: number) {
		if (!this.renderer.xr.isPresenting) return;
		this.rig.updateMatrixWorld(true);
		for (const h of this.hands) this.updateHand(h, dt, now);
		this.locomotion(dt);
	}

	private buttons(h: Hand) {
		const gp = h.source?.hand ? undefined : h.source?.gamepad;
		const b = gp?.buttons ?? [];
		const pressed = b.map((x) => x.pressed);
		if (h.source?.hand) {
			// tracked hand: a thumb-index pinch is both "trigger" and "grip"
			// (closes under 1.5 cm, opens over 3 cm so it does not flicker)
			const tt = h.handSpace.joints['thumb-tip'], it = h.handSpace.joints['index-finger-tip'];
			if (tt && it) {
				const d = tt.getWorldPosition(_v).distanceTo(it.getWorldPosition(new THREE.Vector3()));
				h.pinching = h.pinching ? d < 0.03 : d < 0.015;
			}
			pressed[0] = pressed[1] = h.pinching;
		}
		const was = h.prevButtons;
		h.prevButtons = pressed;
		const axes = gp?.axes ?? [];
		return {
			trigger: !!pressed[0], triggerDown: !!pressed[0] && !was[0], triggerUp: !pressed[0] && !!was[0],
			squeeze: !!pressed[1], squeezeDown: !!pressed[1] && !was[1], squeezeUp: !pressed[1] && !!was[1],
			stickX: axes[2] ?? 0, stickY: axes[3] ?? 0,
			triggerValue: h.source?.hand ? (h.pinching ? 1 : 0) : (b[0]?.value ?? 0),
			squeezeValue: h.source?.hand ? 0 : (b[1]?.value ?? 0),
			thumbTouch: [3, 4, 5].some((i) => b[i]?.touched || b[i]?.pressed),
			// A / X: reload while holding the pistol
			faceDown: !!pressed[4] && !was[4],
		};
	}

	private pulse(h: Hand, intensity = 0.3, ms = 15) {
		const act = h.source?.gamepad?.hapticActuators?.[0] as any;
		act?.pulse?.(intensity, ms);
	}

	private updateHand(h: Hand, dt: number, now: number) {
		if (!h.source) { h.line.visible = false; h.dot.visible = false; return; }
		const tracked = !!h.source.hand;
		if (h.visual) {
			h.visual.visible = true;
			for (const o of h.ctrlVisuals) o.visible = false;
			if (tracked) h.visual.updateTracked(h.handSpace.joints);
		} else for (const o of h.ctrlVisuals) o.visible = !tracked;
		const btn = this.buttons(h);
		this.handLogic(h, btn, dt, now);
		if (h.visual && !tracked) {
			const tipW = h.visual.indexTip();
			const local = (this.targets.keycaps.parent as THREE.Object3D).worldToLocal(tipW);
			const nearKeys = Math.abs(local.x) < 0.3 && Math.abs(local.z) < 0.26 && local.y < 0.2 && local.y > -0.04;
			h.visual.updateController(
				h.ray.matrixWorld,
				{ trigger: btn.triggerValue, squeeze: btn.squeezeValue, thumbTouch: btn.thumbTouch },
				{ point: !h.held && !h.holdingMouse && (nearKeys || h.pointing === 'screen' || h.pointing === 'key'), holding: h.holdingMouse ? 'mouse' : h.held?.kind ?? null },
				h.holdingMouse ? this.targets.mouse.object.matrixWorld : null,
				dt,
			);
		}
	}

	/** Reference frame objects are held relative to: the tracked wrist, else the target ray. */
	private handFrame(h: Hand): THREE.Matrix4 {
		const w = h.handSpace.joints['wrist'];
		return h.source?.hand && w ? w.matrixWorld : h.ray.matrixWorld;
	}

	/** Grab/press point: between thumb and index when tracked, else the grip. */
	private grabPoint(h: Hand, out = new THREE.Vector3()) {
		const tt = h.handSpace.joints['thumb-tip'], it = h.handSpace.joints['index-finger-tip'];
		if (h.source?.hand && tt && it) return tt.getWorldPosition(out).add(it.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
		return h.grip.getWorldPosition(out);
	}

	private handLogic(h: Hand, btn: ReturnType<XRControls['buttons']>, dt: number, now: number) {
		if (!h.source) return;
		const gripPos = this.grabPoint(h);
		h.velHistory.push({ p: gripPos.clone(), t: now });
		while (h.velHistory.length > 6) h.velHistory.shift();

		// ---------------------------------------------------- 1. holding
		if (h.held) {
			h.held.age += dt; // simulated seconds
			// where the object was relative to the hand when grabbed...
			_m.multiplyMatrices(this.handFrame(h), h.held.offset);
			_m.decompose(_v, _q, new THREE.Vector3());
			// ...eases over 0.25 s into a natural grasp in the animated hand
			if (h.visual && h.held.kind && !h.source.hand) {
				const g = new THREE.Matrix4().multiplyMatrices(h.visual.wrist, graspFor(h.held.kind, h.visual.handedness));
				const gp = new THREE.Vector3(), gq = new THREE.Quaternion();
				g.decompose(gp, gq, new THREE.Vector3());
				const k = THREE.MathUtils.smoothstep(Math.min(1, h.held.age / 0.25), 0, 1);
				_v.lerp(gp, k); _q.slerp(gq, k);
			}
			const gun = this.targets.gun;
			if (gun?.isPistol(h.held.prop)) {
				// recoil kicks the held gun up and back about its grip
				_m.compose(_v, _q, new THREE.Vector3(1, 1, 1)).multiply(gun.pistol.recoilMatrix());
				_m.decompose(_v, _q, new THREE.Vector3());
				if (btn.triggerDown) {
					const r = gun.pullTrigger();
					if (r === 'fired') this.pulse(h, 1.0, 60); else if (r === 'click') this.pulse(h, 0.2, 10);
				}
				if (btn.faceDown) gun.reload();
			}
			this.physics.setHoldTarget(h.held.prop, _v, _q);
			// the pistol is held with the grip (trigger fires); other objects can be
			// carried with either button
			const releasing = btn.squeezeUp || (btn.triggerUp && !btn.squeeze && !this.targets.gun?.isPistol(h.held.prop));
			if (releasing) this.releaseProp(h);
			else if (h.held.age > 0.6 && this.physics.holdError(h.held.prop) > 0.4) this.releaseProp(h, false); // stuck: let go in place
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
		const tipW = h.visual ? h.visual.indexTip() : h.tip.getWorldPosition(new THREE.Vector3());
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
			else {
				const cand = near ?? (h.pointing === 'prop' && h.pointProp && hit!.distance < 1.2 ? h.pointProp : null);
				// a gun is only picked up with the grip, so a trigger pull never grabs (or fires) by accident
				if (cand && !(this.targets.gun?.isPistol(cand) && !btn.squeezeDown)) this.grabProp(h, cand);
			}
			if (h.held || h.holdingMouse) return;
		}

		// right stick scrolls the screen while this ray points at it (see locomotion)
		if (h.pointing === 'screen' && h.source.handedness !== 'left') {
			h.scrollAcc += btn.stickY * dt * 1200;
			if (Math.abs(h.scrollAcc) > 40) { os.wheel(h.scrollAcc); h.scrollAcc = 0; }
		}
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
		const kind = GRASP_KINDS.find((k) => k === prop.desc.name) ?? null;
		h.held = { prop, offset: this.handFrame(h).clone().invert().multiply(objM), kind, age: 0 };
		this.pulse(h, 0.45, 25);
	}

	private releaseProp(h: Hand, toss = true) {
		if (!h.held) return;
		const hist = h.velHistory;
		let vel = new THREE.Vector3();
		if (hist.length >= 2) {
			const a = hist[0], b = hist[hist.length - 1];
			const t = (b.t - a.t) / 1000;
			if (t > 0) vel = b.p.clone().sub(a.p).divideScalar(t);
		}
		this.physics.release(h.held.prop, toss ? vel : new THREE.Vector3());
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
	}

	// ------------------------------------------------------------------ locomotion
	private locomotion(dt: number) {
		let moveX = 0, moveY = 0, turnX = 0, turnHand: Hand | null = null;
		for (const h of this.hands) {
			const ax = h.source?.gamepad?.axes;
			if (!ax) continue;
			const x = ax[2] ?? 0, y = ax[3] ?? 0;
			// left stick walks; right stick turns. With one controller, it does both.
			if (h.source!.handedness === 'left' || this.hands.filter((o) => o.source).length === 1) { moveX = x; moveY = y; }
			if (h.source!.handedness !== 'left') { turnX = x; turnHand = h; }
		}
		// snap turn (not while the right ray is scrolling the monitor)
		if (turnHand && turnHand.pointing !== 'screen') {
			if (Math.abs(turnX) > 0.75 && turnHand.turnReady) { this.snapTurn(turnX > 0 ? -Math.PI / 6 : Math.PI / 6); turnHand.turnReady = false; }
			if (Math.abs(turnX) < 0.3) turnHand.turnReady = true;
		}
		// smooth walk relative to where the head faces, with a radial dead zone
		const mag = Math.min(1, Math.hypot(moveX, moveY));
		const dead = 0.15;
		const want = new THREE.Vector2();
		if (mag > dead) {
			const k = ((mag - dead) / (1 - dead)) / mag;
			const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.headQuat());
			f.y = 0;
			if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
			f.normalize();
			const fwd = -moveY * k, side = moveX * k;
			want.set(f.x * fwd - f.z * side, f.z * fwd + f.x * side).multiplyScalar(XRControls.WALK_SPEED);
		}
		// ease in/out (about 0.15 s) instead of instant starts and stops
		this.walkVel.lerp(want, 1 - Math.exp(-dt * 12));
		if (this.walkVel.lengthSq() < 1e-6) this.walkVel.set(0, 0);
		const speed = this.walkVel.length();
		if (speed > 0) {
			const head = this.headPos();
			const dx = this.walkVel.x * dt, dz = this.walkVel.y * dt;
			// slide along walls/furniture; if the head is already inside a footprint
			// (leaning over the desk), do not trap the user there
			const [nx, nz] = this.walk.ok(head.x, head.z, 0.2) ? this.walk.slide(head.x, head.z, dx, dz, 0.2) : [head.x + dx, head.z + dz];
			this.rig.position.x += nx - head.x;
			this.rig.position.z += nz - head.z;
		}
		const v = Math.min(1, speed / XRControls.WALK_SPEED);
		this.vignette.visible = v > 0.02;
		(this.vignette.material as THREE.ShaderMaterial).uniforms.uStrength.value = 0.55 * v;
	}

	/*
	 * Head pose in world space. Use the scene camera (a child of the rig, posed
	 * by the XR manager each frame), not renderer.xr.getCamera(): that
	 * ArrayCamera has no parent, so getWorldPosition() on it rebuilds its matrix
	 * without the rig and silently drops every turn and step taken so far.
	 */
	private headPos() { this.camera.updateMatrixWorld(true); return new THREE.Vector3().setFromMatrixPosition(this.camera.matrixWorld); }
	private headQuat() { this.camera.updateMatrixWorld(true); return this.camera.getWorldQuaternion(new THREE.Quaternion()); }

	/** Comfortable indoor walking pace, m/s. */
	static WALK_SPEED = 1.3;

	private snapTurn(angle: number) {
		// rotate about the head so the user does not swing around the rig origin
		const head = this.headPos();
		const offset = this.rig.position.clone().sub(head).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
		this.rig.position.copy(head).add(offset);
		this.rig.position.y = 0;
		this.rig.rotation.y += angle;
	}
}

/** Simple stand-in controller: grip handle with a ring, in matte graphite. */
function fallbackController(): THREE.Group {
	const g = new THREE.Group();
	const mat = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.55 });
	const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 0.07, 6, 16), mat);
	handle.rotation.x = -0.35;
	handle.position.set(0, -0.01, 0.045);
	const ring = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.007, 10, 40), mat);
	ring.rotation.x = Math.PI / 2 - 0.5;
	ring.position.set(0, 0.012, -0.01);
	g.add(handle, ring);
	return g;
}

function isChildOf(o: THREE.Object3D, parent: THREE.Object3D): boolean {
	for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === parent) return true;
	return false;
}
