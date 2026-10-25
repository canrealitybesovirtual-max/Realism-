import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadPackedGltf } from '../util/packedGltf';
import { CARTRIDGES, type Cartridge } from './gunEffects';
import { Scope } from './scope';

/**
 * Firearms built from detailed glTF models (both CC BY 4.0, Sketchfab):
 * "G17 Gen 5 Handgun + Olight - NSW Police Force" by 8sianDude and
 * "Awp Sniper Rifle - Custom Scope" by M37_R.
 *
 * Each model is scaled to real size and placed in the frame every gun here
 * shares: bore along -Z, top +Y, right +X, and the trigger blade at TRIGGER,
 * the point where the animated hand's index pad lands (see xrHands pistolInHand).
 * Moving parts are the model's own nodes, animated in that frame: the G17's
 * slide and magazine; the AWP's bolt (lift, draw, push, lower), magazine and
 * trigger. Points are in the source model's units and axes ("model space").
 */

/** where the index finger's pad sits on the trigger in the shared gun frame */
export const TRIGGER = new THREE.Vector3(0, 0.022, -0.048);

export interface FirearmSpec {
	id: 'g17' | 'awp';
	label: string;
	packed: string;
	/** model units -> metres */
	scale: number;
	/** rotation about Y that turns the model's muzzle to -Z */
	yaw: number;
	trigger: THREE.Vector3;
	muzzle: THREE.Vector3;
	port: THREE.Vector3;
	/** eye point for aiming: rear sight notch, or the scope's eyepiece centre */
	sight: THREE.Vector3;
	/** eye distance behind `sight` when aiming (m) */
	eyeRelief: number;
	forend?: THREE.Vector3;
	cartridge: Cartridge;
	capacity: number;
	action: 'semi' | 'bolt';
	mass: number;
	recoil: { rise: number; back: number; decay: number };
	colliderNodes: string[];
	hideNodes: string[];
	magNode: string;
	slide?: { node: string; travel: number };
	bolt?: { handle: string; carrier: string[]; axisY: number; lift: number; travel: number };
	triggerNode?: string;
	light?: { at: THREE.Vector3; lensMesh?: string };
	laser?: { at: THREE.Vector3 };
	scope?: { eyepiece: THREE.Vector3; objective: THREE.Vector3; radius: number; minMag: number; maxMag: number };
}

export const FIREARMS: Record<'g17' | 'awp', FirearmSpec> = {
	g17: {
		id: 'g17', label: 'Glock 17 Gen 5', packed: 'g17',
		// slide 1.664 units long; a G17 Gen 5 slide is 186 mm
		scale: 0.1118, yaw: Math.PI,
		trigger: new THREE.Vector3(0, 0.69, 0.49),
		muzzle: new THREE.Vector3(0, 1.08, 0.86),
		port: new THREE.Vector3(0.06, 1.18, 0.05),
		sight: new THREE.Vector3(0, 1.27, -0.72),
		eyeRelief: 0.55,
		cartridge: CARTRIDGES['9mm'], capacity: 17, action: 'semi', mass: 0.72,
		recoil: { rise: 11, back: 0.03, decay: 10 },
		colliderNodes: ['g17_gen5_g17_gen5_frame_0', 'g17_gen5_g17_gen5_slide_0', 'body_low_olight_pl2_valkyrie_0'],
		hideNodes: ['mag_full.001', 'mag_full001', 'mag_empty'],
		magNode: 'mag_full',
		slide: { node: 'g17_gen5_g17_gen5_slide_0', travel: 0.031 },
		light: { at: new THREE.Vector3(0, 0.74, 0.95), lensMesh: 'body_low_olight_pl2_valkyrie_lens_0' },
	},
	awp: {
		id: 'awp', label: 'AWM .338 Lapua (AWP)', packed: 'awp',
		// 1.68 units overall; an AWM is about 1.2 m
		scale: 0.715, yaw: Math.PI,
		trigger: new THREE.Vector3(0, 0.03, 0.075),
		muzzle: new THREE.Vector3(0, 0.1, 1.27),
		port: new THREE.Vector3(-0.03, 0.115, 0.19),
		sight: new THREE.Vector3(0, 0.19, -0.004),
		eyeRelief: 0.085,
		forend: new THREE.Vector3(0, 0.03, 0.62),
		cartridge: CARTRIDGES['338'], capacity: 5, action: 'bolt', mass: 6.5,
		recoil: { rise: 7, back: 0.06, decay: 5 },
		colliderNodes: ['Object_5', 'Object_28'],
		hideNodes: [],
		magNode: 'mag_6',
		bolt: { handle: 'bolt_3', carrier: ['boltback_4'], axisY: 0.1112, lift: 62, travel: 0.105 },
		triggerNode: 'trigger_8',
		laser: { at: new THREE.Vector3(0.0588, 0.1946, 0.419) },
		scope: { eyepiece: new THREE.Vector3(0, 0.1898, -0.004), objective: new THREE.Vector3(0, 0.1898, 0.62), radius: 0.0265, minMag: 5, maxMag: 20 },
	},
};

/** A node moved by a transform given in the gun's frame, about its loaded pose. */
class Part {
	private base: THREE.Matrix4;
	private parentToGun: THREE.Matrix4;
	private parentToGunInv: THREE.Matrix4;
	constructor(readonly node: THREE.Object3D, gun: THREE.Object3D) {
		node.updateMatrix();
		this.base = node.matrix.clone();
		node.matrixAutoUpdate = false;
		gun.updateMatrixWorld(true);
		this.parentToGun = new THREE.Matrix4().copy(gun.matrixWorld).invert().multiply(node.parent!.matrixWorld);
		this.parentToGunInv = this.parentToGun.clone().invert();
	}
	set(delta: THREE.Matrix4) {
		this.node.matrix.copy(this.parentToGunInv).multiply(delta).multiply(this.parentToGun).multiply(this.base);
		this.node.matrixWorldNeedsUpdate = true;
	}
}

type Phase = { t: number; dur: number; kind: 'bolt' | 'rack' };

export class Firearm {
	readonly group = new THREE.Group();
	readonly spec: FirearmSpec;
	/** model space -> gun frame */
	private toGun = new THREE.Matrix4();
	readonly muzzle = new THREE.Vector3();
	readonly port = new THREE.Vector3();
	readonly sight = new THREE.Vector3();
	readonly forend: THREE.Vector3 | null = null;
	/** cuboids for physics, in the gun frame */
	readonly colliders: { half: [number, number, number]; offset: [number, number, number] }[] = [];
	scope: Scope | null = null;
	light: THREE.SpotLight | null = null;
	private lens: THREE.Mesh | null = null;
	private laserDot: THREE.Sprite | null = null;
	private laserFrom = new THREE.Vector3();
	laserOn = false;

	// state
	/** rounds in the inserted magazine (0 when none is inserted) */
	magazine: number;
	/** is a magazine in the magwell? */
	magIn = true;
	chambered = true;
	/** pistol: slide held open (empty magazine) until released or racked */
	slideLocked = false;
	/** set by a hand on the slide (0 forward .. 1 back), or null when let go */
	handSlide: number | null = null;
	/** set by a hand on the bolt handle: lift 0..1, draw 0..1 */
	handBolt: { lift: number; draw: number } | null = null;
	/** bolt position (0 = closed) */
	boltLift = 0;
	boltDraw = 0;
	private boltOpened = false;
	private slideRacked = false;
	/** inserting a magazine (desktop): 1 = just under the gun .. 0 = seated */
	private magSeat = 0;
	/** bolt gun: the spent case is still in the chamber until the bolt is worked */
	needsCycle = false;
	recoil = 0;
	private slideT = 0; // 0 forward .. 1 back
	private slideVel = 0;
	private cycling = 0;
	private phase: Phase | null = null;
	private triggerPull = 0;
	private slidePart: Part | null = null;
	private handlePart: Part | null = null;
	private carrierParts: Part[] = [];
	private magPart: Part | null = null;
	private triggerPart: Part | null = null;
	/** events for sound and brass, set by the owner */
	on: (e: 'bolt' | 'eject' | 'ejectLive' | 'magOut' | 'magIn' | 'slideRelease' | 'slideLock' | 'chamber' | 'rack') => void = () => {};

	static async load(loader: GLTFLoader, spec: FirearmSpec): Promise<Firearm> {
		const gltf = await loadPackedGltf(loader, spec.packed);
		return new Firearm(spec, gltf.scene);
	}

	private constructor(spec: FirearmSpec, model: THREE.Object3D) {
		this.spec = spec;
		this.magazine = spec.capacity;
		this.group.name = 'gun-' + spec.id;
		// scale + turn, then shift so the trigger lands on TRIGGER
		const rs = new THREE.Matrix4().makeRotationY(spec.yaw).multiply(new THREE.Matrix4().makeScale(spec.scale, spec.scale, spec.scale));
		const t = TRIGGER.clone().sub(spec.trigger.clone().applyMatrix4(rs));
		this.toGun.makeTranslation(t.x, t.y, t.z).multiply(rs);
		const inner = new THREE.Group();
		inner.matrixAutoUpdate = false;
		inner.matrix.copy(this.toGun);
		inner.add(model);
		this.group.add(inner);
		this.group.updateMatrixWorld(true);
		const P = (v: THREE.Vector3) => v.clone().applyMatrix4(this.toGun);
		this.muzzle.copy(P(spec.muzzle));
		this.port.copy(P(spec.port));
		this.sight.copy(P(spec.sight));
		if (spec.forend) this.forend = P(spec.forend);

		const byName = (n: string) => model.getObjectByName(n) ?? model.getObjectByName(n.replace(/\./g, ''));
		for (const n of spec.hideNodes) { const o = byName(n); if (o) o.visible = false; }
		model.traverse((o) => {
			const m = o as THREE.Mesh;
			if (!m.isMesh) return;
			m.castShadow = true; m.receiveShadow = true;
			const mat = m.material as THREE.MeshStandardMaterial;
			// glass in these models uses transmission; a plain transparent coat
			// is far cheaper and reads the same at this size
			if ((mat as THREE.MeshPhysicalMaterial).transmission) {
				const g = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false });
				m.material = g;
				m.castShadow = false;
			}
		});
		// physics hull from the named parts' bounds
		const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
		for (const n of spec.colliderNodes) {
			const o = byName(n);
			if (!o) continue;
			const box = new THREE.Box3();
			o.updateWorldMatrix(true, true);
			box.setFromObject(o).applyMatrix4(inv);
			const c = box.getCenter(new THREE.Vector3()), h = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
			this.colliders.push({ half: [Math.max(0.006, h.x * 0.9), Math.max(0.006, h.y * 0.9), Math.max(0.006, h.z)], offset: [c.x, c.y, c.z] });
		}
		const part = (n?: string) => { const o = n ? byName(n) : undefined; return o ? new Part(o, this.group) : null; };
		this.slidePart = part(spec.slide?.node);
		this.handlePart = part(spec.bolt?.handle);
		this.carrierParts = (spec.bolt?.carrier ?? []).map((n) => part(n)).filter((x): x is Part => !!x);
		this.magPart = part(spec.magNode);
		this.triggerPart = part(spec.triggerNode);

		if (spec.scope) this.scope = new Scope(this.group, P(spec.scope.eyepiece), P(spec.scope.objective), spec.scope.radius, spec.scope.minMag, spec.scope.maxMag);
		if (spec.light) {
			const at = P(spec.light.at);
			const l = new THREE.SpotLight(0xfff4e6, 0, 40, 0.32, 0.55, 2);
			l.position.copy(at);
			l.target.position.copy(at).add(new THREE.Vector3(0, 0, -1));
			this.group.add(l, l.target);
			this.light = l;
			const lens = spec.light.lensMesh ? byName(spec.light.lensMesh) : undefined;
			if (lens && (lens as THREE.Mesh).isMesh) {
				const mesh = lens as THREE.Mesh;
				mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
				this.lens = mesh;
			}
		}
		if (spec.laser) {
			this.laserFrom.copy(P(spec.laser.at));
			const cv = document.createElement('canvas'); cv.width = cv.height = 64;
			const c = cv.getContext('2d')!;
			const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
			g.addColorStop(0, 'rgba(255,240,240,1)'); g.addColorStop(0.2, 'rgba(255,40,30,0.9)'); g.addColorStop(1, 'rgba(255,0,0,0)');
			c.fillStyle = g; c.fillRect(0, 0, 64, 64);
			this.laserDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, sizeAttenuation: true }));
			this.laserDot.name = 'decal';
			this.laserDot.userData.noBullet = true;
			this.laserDot.visible = false;
		}
	}

	get loaded() { return this.chambered && !this.needsCycle; }
	get busy() { return this.cycling > 0 || !!this.phase; }
	get roundsLeft() { return this.magazine + (this.chambered && !this.needsCycle ? 1 : 0); }
	get bolted() { return this.spec.action === 'bolt'; }
	/** the action is closed and ready (slide forward / bolt down) */
	get inBattery() { return this.bolted ? this.boltLift < 0.05 && this.boltDraw < 0.02 : this.slideT < 0.08 && !this.slideLocked && this.handSlide === null; }

	/** analog trigger position, 0..1 (animates the trigger blade) */
	setTrigger(v: number) { this.triggerPull = v; }

	/** Pull the trigger: 'fired', 'click' (nothing to fire) or null (mechanism busy). */
	fire(): 'fired' | 'click' | null {
		if (this.busy) return null;
		if (!this.inBattery) return null; // the action is open: the trigger does nothing
		if (!this.chambered || this.needsCycle) return 'click';
		this.recoil = 1;
		if (this.bolted) {
			// the case stays in the chamber until the bolt is worked
			this.needsCycle = true;
			this.cycling = 0.15;
		} else {
			// recoil-operated: the slide cycles, ejects the case and feeds the next
			// round; with an empty magazine the follower locks the slide open
			this.cycling = 0.07;
			this.slideVel = 14;
			if (this.magIn && this.magazine > 0) this.magazine--;
			else { this.chambered = false; if (this.magIn) this.slideLocked = true; }
		}
		return 'fired';
	}

	/** Magazine release: out it comes with whatever it still holds (null if none in). */
	releaseMag(): number | null {
		if (!this.magIn) return null;
		const rounds = this.magazine;
		this.magIn = false; this.magazine = 0; this.magSeat = 0;
		this.on('magOut');
		return rounds;
	}

	/** Seat a magazine. `animate` lifts it into the magwell over a moment (desktop). */
	insertMag(rounds: number, animate = false) {
		if (this.magIn) return false;
		this.magIn = true; this.magazine = Math.max(0, Math.min(this.spec.capacity, rounds));
		this.magSeat = animate ? 1 : 0;
		this.on('magIn');
		return true;
	}

	/** Pistol slide stop: let a locked-back slide run forward (it chambers if it can). */
	slideRelease() {
		if (this.bolted || !this.slideLocked) return;
		this.slideLocked = false;
		this.slideRacked = true;
		this.on('slideRelease');
	}

	/** Work the bolt / rack the slide as one quick motion (desktop, buttons). */
	cycle() {
		if (this.busy) return;
		if (this.bolted) { this.phase = { t: 0, dur: 0.85, kind: 'bolt' }; this.on('bolt'); }
		else { this.phase = { t: 0, dur: 0.32, kind: 'rack' }; this.on('rack'); }
	}

	/** the old one-button reload (kept for scripts): swap in a full magazine */
	reload() {
		if (this.busy) return;
		this.releaseMag();
		this.insertMag(this.spec.capacity, true);
	}

	/** slide pulled to the rear by a hand / the rack motion: the chamber empties */
	private slideBack() {
		if (this.chambered) { this.chambered = false; this.on('ejectLive'); }
		this.slideRacked = true;
		if (this.slideLocked) this.slideLocked = false;
	}
	/** slide back home after a rack: feed a round, or lock open on an empty magazine */
	private slideHome() {
		this.slideRacked = false;
		if (this.magIn && this.magazine > 0 && !this.chambered) { this.magazine--; this.chambered = true; this.on('chamber'); }
	}

	/** bolt drawn fully back: the case (or a live round) comes out */
	private boltBack() {
		if (this.chambered || this.needsCycle) this.on(this.needsCycle ? 'eject' : 'ejectLive');
		this.chambered = false; this.needsCycle = false;
		this.boltOpened = true;
	}
	/** bolt pushed forward: it strips the top round from the magazine */
	private boltForward() {
		this.boltOpened = false;
		if (this.magIn && this.magazine > 0) { this.magazine--; this.chambered = true; this.on('chamber'); }
	}

	toggleAccessory() {
		if (this.light) {
			const on = this.light.intensity === 0;
			this.light.intensity = on ? 60 : 0;
			const m = this.lens?.material as THREE.MeshStandardMaterial | undefined;
			if (m) { m.emissive = new THREE.Color(on ? 0xfff4e6 : 0x000000); m.emissiveIntensity = on ? 3 : 0; }
			return on;
		}
		if (this.laserDot) { this.laserOn = !this.laserOn; return this.laserOn; }
		return false;
	}

	update(dt: number, scene: THREE.Scene, raycaster: THREE.Raycaster) {
		const s = this.spec;
		this.cycling = Math.max(0, this.cycling - dt);
		this.recoil = Math.max(0, this.recoil - dt * s.recoil.decay);
		const M = new THREE.Matrix4();
		// slide: blown back by a shot, pulled by a hand, returned by its spring
		if (s.slide) {
			const was = this.slideT;
			let hand = this.handSlide;
			if (this.phase?.kind === 'rack') { const u = this.phase.t / this.phase.dur; hand = u < 0.5 ? THREE.MathUtils.smoothstep(u, 0, 0.45) : null; }
			if (hand !== null) {
				this.slideVel = 0;
				this.slideT = THREE.MathUtils.clamp(hand, 0, 1);
			} else if (this.slideVel > 0) {
				this.slideT += this.slideVel * dt * 6;
				if (this.slideT >= 1) { this.slideT = 1; this.slideVel = 0; if (this.slideLocked) this.on('slideLock'); }
			} else if (!this.slideLocked) this.slideT = Math.max(0, this.slideT - dt * 16);
			if (hand !== null && was < 0.9 && this.slideT >= 0.9) this.slideBack();
			if (this.slideRacked && this.slideT <= 0.02 && hand === null) this.slideHome();
			// racked with an empty magazine: the follower catches the slide
			if (this.slideRacked && hand === null && this.slideT > 0.5 && this.magIn && this.magazine === 0 && !this.chambered && !this.slideLocked) { this.slideLocked = true; this.slideRacked = false; this.slideT = 1; this.on('slideLock'); }
			if (this.slidePart) this.slidePart.set(M.makeTranslation(0, 0, this.slideT * s.slide.travel));
		}
		if (this.triggerPart) this.triggerPart.set(this.pivot(new THREE.Vector3(0, 0.03, -0.05), new THREE.Vector3(1, 0, 0), -this.triggerPull * 0.25));
		// bolt: driven by a hand, or by the quick bolt motion
		if (s.bolt) {
			let lift = this.boltLift, draw = this.boltDraw;
			if (this.handBolt) {
				lift = THREE.MathUtils.clamp(this.handBolt.lift, 0, 1);
				draw = THREE.MathUtils.clamp(this.handBolt.draw, 0, 1);
				// a turn-bolt only slides when the handle is up, and only turns down when home
				if (this.boltLift < 0.9) draw = Math.min(draw, this.boltDraw);
				if (this.boltDraw > 0.05) lift = Math.max(lift, 0.92);
			} else if (this.phase?.kind === 'bolt') {
				const u = this.phase.t / this.phase.dur, seg = (a: number, b: number) => THREE.MathUtils.smoothstep(u, a, b);
				lift = seg(0, 0.18) * (1 - seg(0.82, 1));
				draw = seg(0.2, 0.45) * (1 - seg(0.55, 0.8));
			} else {
				// let go: the handle stays where it was (a bolt does not spring back)
			}
			if (this.boltDraw < 0.85 && draw >= 0.85) this.boltBack();
			if (this.boltOpened && this.boltDraw >= 0.3 && draw < 0.3) this.boltForward();
			if (this.boltLift < 0.1 && lift >= 0.1 && !this.phase) this.on('bolt');
			this.boltLift = lift; this.boltDraw = draw;
		}
		if (this.phase) { this.phase.t += dt; if (this.phase.t >= this.phase.dur) this.phase = null; }
		const lift = this.boltLift, draw = this.boltDraw;
		this.magSeat = Math.max(0, this.magSeat - dt * 3);
		const magDrop = this.magIn ? THREE.MathUtils.smoothstep(this.magSeat, 0, 1) : 1;
		if (this.handlePart && s.bolt) {
			const R = this.pivot(new THREE.Vector3(0, this.boltAxisY(), 0), new THREE.Vector3(0, 0, 1), -THREE.MathUtils.degToRad(s.bolt.lift) * lift);
			const T = new THREE.Matrix4().makeTranslation(0, 0, draw * s.bolt.travel);
			this.handlePart.set(T.clone().multiply(R));
			for (const c of this.carrierParts) c.set(T);
		}
		if (this.magPart) {
			this.magPart.node.visible = this.magIn;
			this.magPart.set(M.makeTranslation(0, -0.12 * magDrop, 0.015 * magDrop));
		}
		// laser dot on whatever the beam meets
		if (this.laserDot) {
			if (!this.laserDot.parent) scene.add(this.laserDot);
			this.laserDot.visible = false;
			if (this.laserOn && this.group.visible) {
				this.group.updateMatrixWorld(true);
				const o = this.laserFrom.clone().applyMatrix4(this.group.matrixWorld);
				const d = new THREE.Vector3(0, 0, -1).transformDirection(this.group.matrixWorld);
				raycaster.set(o, d); raycaster.far = 300;
				const hit = raycaster.intersectObjects(scene.children, true).find((h) => (h.object as THREE.Mesh).isMesh && h.object.visible && !isInside(h.object, this.group) && h.object.name !== 'decal' && h.object.name !== 'sky');
				if (hit) {
					this.laserDot.visible = true;
					this.laserDot.position.copy(hit.point).addScaledVector(d, -0.01);
					this.laserDot.scale.setScalar(0.012 + hit.distance * 0.0016);
				}
			}
		}
	}

	private boltAxisY() {
		// the bolt's axis height in the gun frame
		return new THREE.Vector3(0, this.spec.bolt!.axisY, 0).applyMatrix4(this.toGun).y;
	}

	private pivot(p: THREE.Vector3, axis: THREE.Vector3, angle: number) {
		return new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)
			.multiply(new THREE.Matrix4().makeRotationAxis(axis, angle))
			.multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
	}

	/** the magazine's mesh, its pose in the gun frame, and the bolt handle / slide grip points (gun frame) */
	magNode() { return this.magPart?.node ?? null; }
	slideGripPoint() { return this.spec.slide ? this.sight.clone().add(new THREE.Vector3(0, -0.012, 0.05)) : null; }
	boltHandlePoint() {
		if (!this.handlePart) return null;
		const b = new THREE.Box3().setFromObject(this.handlePart.node), inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
		return b.getCenter(new THREE.Vector3()).applyMatrix4(inv);
	}
	/** where the bolt axis is (gun frame), for turning the handle */
	boltAxis() { return new THREE.Vector3(0, this.boltAxisY(), 0); }

	world(local: THREE.Vector3, out = new THREE.Vector3()) { this.group.updateMatrixWorld(true); return out.copy(local).applyMatrix4(this.group.matrixWorld); }
	dirWorld(x: number, y: number, z: number, out = new THREE.Vector3()) { return out.set(x, y, z).transformDirection(this.group.matrixWorld); }

	/** Recoil as a transform in the gun frame, pivoting about the grip. */
	recoilMatrix(out = new THREE.Matrix4()) {
		const r = this.recoil * this.recoil * (3 - 2 * this.recoil);
		const pivot = new THREE.Vector3(0, -0.006, 0.012);
		const rot = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(this.spec.recoil.rise) * r);
		return out.makeTranslation(pivot.x, pivot.y, pivot.z + this.spec.recoil.back * r).multiply(rot).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
	}
}

function isInside(o: THREE.Object3D, root: THREE.Object3D) {
	for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === root) return true;
	return false;
}
