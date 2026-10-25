import * as THREE from 'three';
import type { Prop } from '../physics/physics';
import type { GunEffects, ShotResult } from './gunEffects';
import { Firearm, TRIGGER } from './firearm';
import type { MagazineManager } from './magazines';

/** What the VR / desktop input code needs from any gun. */
export interface Gun {
	readonly prop: Prop;
	readonly label: string;
	readonly twoHanded: boolean;
	lastShot: ShotResult | null;
	shotsFired: number;
	owns(prop: Prop | null | undefined): boolean;
	pullTrigger(aim?: { origin: THREE.Vector3; dir: THREE.Vector3 }): 'fired' | 'click' | null;
	/** A / X in VR: magazine release */
	primary(): void;
	/** B / Y in VR: slide stop when locked back, else light / laser */
	secondary(): void;
	/** desktop R: magazine out, or (when empty) a magazine in */
	reload(): void;
	/** desktop F: rack the slide / work the bolt */
	cycle?(): void;
	/** desktop L: light / laser */
	accessory?(): unknown;
	/** one-line state for the HUD */
	status?(): string;
	update(dt: number): void;
	recoilMatrix(out?: THREE.Matrix4): THREE.Matrix4;
	setTrigger?(v: number): void;
	zoom?(factor: number): void;
	/** gun-frame eye point for aiming down the sights */
	eyePoint?(): THREE.Vector3;
	/** gun-frame point the support hand holds */
	forendPoint?(): THREE.Vector3 | null;
	renderScope?(renderer: THREE.WebGLRenderer, scene: THREE.Scene, eye: THREE.Vector3): void;
}

export function gunFor(guns: readonly Gun[] | undefined, prop: Prop | null | undefined): Gun | null {
	if (!prop || !guns) return null;
	return guns.find((g) => g.owns(prop)) ?? null;
}

/**
 * A Firearm with its physics prop and the shared shot effects. The round
 * leaves the muzzle angled up just enough to cross the line of sight at the
 * zero range (100 m through the scope, 25 m over iron sights), so where the
 * reticle or sights sit is where it hits at that distance.
 */
export class FirearmSystem implements Gun {
	lastShot: ShotResult | null = null;
	shotsFired = 0;
	readonly label: string;
	readonly twoHanded: boolean;
	private zeroAngle: number;
	private raycaster = new THREE.Raycaster();
	/** set by main: physical magazines and the belt pouch */
	mags: MagazineManager | null = null;
	/** short-lived note for the HUD ("No spare magazines") */
	note = '';
	private noteT = 0;

	constructor(readonly gun: Firearm, readonly prop: Prop, private effects: GunEffects, private scene: THREE.Scene, camera?: THREE.Camera) {
		if (camera) this.raycaster.camera = camera; // the laser's ray may cross sprites
		this.label = gun.spec.label;
		this.twoHanded = !!gun.spec.forend;
		const g = this.gun;
		const zero = g.scope ? 100 : 25;
		const h = (g.scope ? g.scope.camera.position.y : g.sight.y) - g.muzzle.y; // line of sight above the bore
		const v = g.spec.cartridge.v0 * (1 - g.spec.cartridge.k * g.spec.cartridge.v0 * zero / g.spec.cartridge.v0 / 2);
		const drop = 0.5 * 9.81 * (zero / v) ** 2;
		this.zeroAngle = (h + drop) / zero;
		g.on = (e) => {
			const at = g.world(g.port);
			const fwd = g.dirWorld(0, 0, -1), right = g.dirWorld(1, 0, 0), up = g.dirWorld(0, 1, 0);
			if (e === 'bolt') this.effects.play('bolt', at, 0.9, 1);
			else if (e === 'eject') this.effects.eject(at, right, up, fwd, g.spec.cartridge, true);
			else if (e === 'ejectLive') { this.effects.eject(at, right, up, fwd, g.spec.cartridge, true); this.effects.play('brass', at, 0.4, 1.3); }
			else if (e === 'rack') this.effects.play('bolt', at, 0.7, 1.45);
			else if (e === 'chamber') { if (!g.bolted) this.effects.play('bolt', at, 0.45, 1.7); }
			else if (e === 'slideLock') this.effects.play('bolt', at, 0.35, 1.9);
			else if (e === 'magOut') this.effects.play('mag_out', at, 0.8, g.bolted ? 0.9 : 1.05);
			else if (e === 'magIn') this.effects.play('mag_in', at, 0.8, g.bolted ? 0.9 : 1.05);
			else if (e === 'slideRelease') this.effects.play('bolt', at, 0.6, 1.5);
		};
		effects.ignore.add(g.group);
	}

	owns(prop: Prop | null | undefined) { return !!prop && prop === this.prop; }

	pullTrigger(aim?: { origin: THREE.Vector3; dir: THREE.Vector3 }) {
		const g = this.gun;
		g.group.updateMatrixWorld(true);
		const r = g.fire();
		if (r === 'click') this.effects.play('dry_fire', g.world(g.muzzle), 0.9);
		if (r === 'fired') {
			const muzzle = g.world(g.muzzle), fwd = g.dirWorld(0, 0, -1);
			const launch = g.dirWorld(0, Math.sin(this.zeroAngle), -Math.cos(this.zeroAngle));
			this.lastShot = this.effects.shot(muzzle, fwd, g.world(g.port), g.dirWorld(1, 0, 0), g.dirWorld(0, 1, 0),
				aim?.origin ?? muzzle, aim?.dir ?? launch, this.prop.body, g.spec.cartridge, !g.bolted);
			this.shotsFired++;
			// the gun kicks back against whatever holds it
			this.prop.body.applyImpulse(fwd.clone().multiplyScalar(-g.spec.cartridge.impulse * 0.1), true);
		}
		return r;
	}

	/** VR A: press the magazine release (it drops out as a real object) */
	primary() {
		if (this.mags) this.mags.drop(this);
		else this.gun.reload();
	}

	/** VR B: slide stop on a locked-back pistol, else light / laser */
	secondary() {
		const g = this.gun;
		if (!g.bolted && g.slideLocked) g.slideRelease(); else g.toggleAccessory();
	}

	/**
	 * Desktop R. With a magazine in: release it. Without: take a matching
	 * magazine lying within reach, else the fullest spare from the pouch, and
	 * seat it (it still needs a rack / bolt stroke if the chamber is empty).
	 */
	reload() {
		const g = this.gun, m = this.mags;
		if (!m) { g.reload(); return; }
		if (g.magIn) { m.drop(this); return; }
		// the fullest of: a loaded magazine lying within reach, or the best spare on the belt
		const near = m.nearestLoose(g.spec.id, g.world(g.port), 1.6, 1);
		const best = Math.max(0, ...(m.pouch.get(g.spec.id) ?? []));
		if (near && (m.info(near)?.rounds ?? 0) >= best && m.insert(near, this, true)) return;
		const r = m.takeFromPouch(g.spec.id);
		if (r === null) { this.say('No spare magazines - use an ammo can'); return; }
		g.insertMag(r, true);
	}

	cycle() { this.gun.cycle(); }
	accessory() { return this.gun.toggleAccessory(); }

	status() {
		const g = this.gun;
		const ch = g.chambered && !g.needsCycle ? '+1' : g.needsCycle ? ' (spent case)' : ' (empty chamber)';
		const mag = g.magIn ? `${g.magazine}${ch}` : `no magazine${g.chambered ? ', 1 chambered' : ''}`;
		const act = g.bolted ? (g.inBattery ? '' : ' · bolt open') : g.slideLocked ? ' · slide locked back' : '';
		const spare = this.mags ? ' · ' + this.mags.summary(g.spec.id) : '';
		return `${this.label}: ${mag}${act}${spare}${this.noteT > 0 ? ' · ' + this.note : ''}`;
	}

	say(t: string) { this.note = t; this.noteT = 2.5; }

	setTrigger(v: number) { this.gun.setTrigger(v); }
	zoom(factor: number) { const s = this.gun.scope; if (s) s.setMagnification(s.magnification * factor); }
	eyePoint() { return this.gun.sight.clone().add(new THREE.Vector3(0, 0, this.gun.spec.eyeRelief)); }
	forendPoint() { return this.gun.forend; }
	renderScope(renderer: THREE.WebGLRenderer, scene: THREE.Scene, eye: THREE.Vector3) {
		if (this.gun.scope && this.gun.group.visible) this.gun.scope.render(renderer, scene, eye);
	}
	update(dt: number) { this.noteT = Math.max(0, this.noteT - dt); this.gun.update(dt, this.scene, this.raycaster); }
	recoilMatrix(out = new THREE.Matrix4()) { return this.gun.recoilMatrix(out); }
}

export { TRIGGER };
