import * as THREE from 'three';
import type { Prop } from '../physics/physics';
import type { GunEffects, ShotResult } from './gunEffects';
import { Firearm, TRIGGER } from './firearm';

/** What the VR / desktop input code needs from any gun. */
export interface Gun {
	readonly prop: Prop;
	readonly label: string;
	readonly twoHanded: boolean;
	lastShot: ShotResult | null;
	shotsFired: number;
	owns(prop: Prop | null | undefined): boolean;
	pullTrigger(aim?: { origin: THREE.Vector3; dir: THREE.Vector3 }): 'fired' | 'click' | null;
	/** A / X in VR, R / F on desktop */
	primary(): void;
	/** B / Y in VR, F on desktop */
	secondary(): void;
	reload(): void;
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

	constructor(readonly gun: Firearm, readonly prop: Prop, private effects: GunEffects, private scene: THREE.Scene) {
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

	primary() {
		const g = this.gun;
		if (g.bolted) {
			// work the bolt; with an empty magazine and nothing chambered, reload instead
			if (g.magazine === 0 && !g.chambered) g.reload(); else g.cycle();
		} else g.reload();
	}

	secondary() {
		const g = this.gun;
		if (g.bolted) g.reload(); else g.toggleAccessory();
	}

	/** desktop F: the bolt on a bolt gun, the light on a pistol */
	reload() { this.gun.reload(); }
	accessory() { return this.gun.toggleAccessory(); }
	cycle() { this.gun.cycle(); }

	setTrigger(v: number) { this.gun.setTrigger(v); }
	zoom(factor: number) { const s = this.gun.scope; if (s) s.setMagnification(s.magnification * factor); }
	eyePoint() { return this.gun.sight.clone().add(new THREE.Vector3(0, 0, this.gun.spec.eyeRelief)); }
	forendPoint() { return this.gun.forend; }
	renderScope(renderer: THREE.WebGLRenderer, scene: THREE.Scene, eye: THREE.Vector3) {
		if (this.gun.scope && this.gun.group.visible) this.gun.scope.render(renderer, scene, eye);
	}
	update(dt: number) { this.gun.update(dt, this.scene, this.raycaster); }
	recoilMatrix(out = new THREE.Matrix4()) { return this.gun.recoilMatrix(out); }
}

export { TRIGGER };
