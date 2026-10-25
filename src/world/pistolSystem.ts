import * as THREE from 'three';
import type { Physics, Prop } from '../physics/physics';
import type { Pistol } from './pistol';
import { GunEffects } from './gunEffects';

/**
 * The pistol as a usable object: its physics prop, its mechanism and the
 * effects of firing. Input code (VR / desktop) calls pullTrigger() and
 * reload() while holding it.
 */
export class PistolSystem {
	readonly effects: GunEffects;
	lastShot: ReturnType<GunEffects['shot']> | null = null;
	shotsFired = 0;

	constructor(readonly pistol: Pistol, readonly prop: Prop, scene: THREE.Scene, camera: THREE.Camera, physics: Physics) {
		this.effects = new GunEffects(scene, camera, physics);
		pistol.onReloadStage = (stage) => this.effects.play(stage === 'out' ? 'mag_out' : 'mag_in', pistol.group.getWorldPosition(new THREE.Vector3()), 0.8);
	}

	/**
	 * Fire along the barrel; `aim` overrides the bullet ray (desktop aims at
	 * the crosshair while the gun is held at the hip). Returns the result.
	 */
	pullTrigger(aim?: { origin: THREE.Vector3; dir: THREE.Vector3 }): 'fired' | 'click' | null {
		const p = this.pistol;
		p.group.updateMatrixWorld(true);
		const r = p.trigger();
		if (r === 'click') this.effects.play('dry_fire', p.muzzleWorld(), 0.9);
		if (r === 'fired') {
			const muzzle = p.muzzleWorld(), fwd = p.forwardWorld();
			this.lastShot = this.effects.shot(muzzle, fwd, p.portWorld(), p.rightWorld(), p.upWorld(), aim?.origin ?? muzzle, aim?.dir ?? fwd, this.prop.body);
			this.shotsFired++;
			// the gun itself kicks back against whatever holds it
			this.prop.body.applyImpulse(fwd.clone().multiplyScalar(-0.15), true);
		}
		return r;
	}

	reload() { this.pistol.reload(); }

	update(dt: number) {
		this.pistol.update(dt);
		this.effects.update(dt);
	}

	isPistol(prop: Prop | null | undefined) { return !!prop && prop === this.prop; }
}
