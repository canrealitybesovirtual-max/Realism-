import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadPackedGltf } from '../util/packedGltf';

/**
 * Service pistol (Walther P38 pattern; CC0 model by Mateusz Sadek, Poly Haven).
 *
 * Model frame: bore along -Z, top +Y, origin above the grip. The scan is a
 * single mesh, so the slide is separated geometrically (the open-top slide
 * is everything above the frame rail behind the exposed barrel) and animated
 * on its own: it cycles back 22 mm per shot and locks back on an empty
 * magazine. Eight-round single-stack magazine plus one in the chamber is
 * simplified to eight rounds.
 */
export const PISTOL = {
	capacity: 8,
	muzzle: new THREE.Vector3(0, 0.068, -0.176),
	ejectionPort: new THREE.Vector3(0.012, 0.075, -0.035),
	/** grip centre, where the palm wraps */
	grip: new THREE.Vector3(0, -0.006, 0.012),
	slideTravel: 0.022,
	mass: 0.95,
};

export class Pistol {
	readonly group = new THREE.Group();
	private slide: THREE.Mesh | null = null;
	ammo = PISTOL.capacity;
	/** 0 = in battery, 1 = fully back */
	private slidePos = 0;
	private slideVel = 0;
	private cycling = 0;
	/** recoil 0..1, decays quickly; consumers apply it to the hold pose */
	recoil = 0;
	private reloadT = -1;
	onReloadStage: (stage: 'out' | 'in') => void = () => {};

	static async load(loader: GLTFLoader): Promise<Pistol> {
		const gltf = await loadPackedGltf(loader, 'service_pistol');
		const p = new Pistol();
		let mesh: THREE.Mesh | null = null;
		gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh; });
		if (!mesh) throw new Error('pistol mesh missing');
		const [frame, slide] = splitSlide(mesh);
		p.group.add(frame, slide);
		p.slide = slide;
		p.group.name = 'pistol';
		p.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = m.receiveShadow = true; } });
		return p;
	}

	get empty() { return this.ammo <= 0; }
	get reloading() { return this.reloadT >= 0; }

	/** Pull the trigger. Returns 'fired', 'click' (empty) or null (busy). */
	trigger(): 'fired' | 'click' | null {
		if (this.reloading || this.cycling > 0) return null;
		if (this.ammo <= 0) return 'click';
		this.ammo--;
		this.cycling = 0.09; // seconds before it can fire again (slide cycle)
		this.slideVel = 9; // slide snaps back under recoil
		this.recoil = 1;
		return 'fired';
	}

	reload() {
		if (this.reloading || this.ammo === PISTOL.capacity) return;
		this.reloadT = 0;
		this.onReloadStage('out');
	}

	update(dt: number) {
		this.cycling = Math.max(0, this.cycling - dt);
		this.recoil = Math.max(0, this.recoil - dt * 9);
		// slide: driven back by the shot, returned by its spring, held back when empty
		const lockedBack = this.ammo <= 0 && !this.reloading;
		if (this.slideVel > 0) {
			this.slidePos += this.slideVel * dt * 8;
			if (this.slidePos >= 1) { this.slidePos = 1; this.slideVel = 0; }
		} else if (!lockedBack) {
			this.slidePos = Math.max(0, this.slidePos - dt * 14);
		}
		if (this.slide) this.slide.position.z = this.slidePos * PISTOL.slideTravel;
		if (this.reloading) {
			this.reloadT += dt;
			if (this.reloadT > 0.55 && this.reloadT - dt <= 0.55) this.onReloadStage('in');
			if (this.reloadT > 0.9) { this.ammo = PISTOL.capacity; this.reloadT = -1; }
		}
	}

	muzzleWorld(out = new THREE.Vector3()) { return out.copy(PISTOL.muzzle).applyMatrix4(this.group.matrixWorld); }
	portWorld(out = new THREE.Vector3()) { return out.copy(PISTOL.ejectionPort).applyMatrix4(this.group.matrixWorld); }
	forwardWorld(out = new THREE.Vector3()) { return out.set(0, 0, -1).transformDirection(this.group.matrixWorld); }
	rightWorld(out = new THREE.Vector3()) { return out.set(1, 0, 0).transformDirection(this.group.matrixWorld); }
	upWorld(out = new THREE.Vector3()) { return out.set(0, 1, 0).transformDirection(this.group.matrixWorld); }

	/**
	 * Recoil as a transform in the pistol's own frame, pivoting about the grip:
	 * muzzle rises ~9 degrees and the gun moves back ~2.5 cm at the peak.
	 */
	recoilMatrix(out = new THREE.Matrix4()) {
		const r = this.recoil * this.recoil * (3 - 2 * this.recoil); // ease
		const pivot = PISTOL.grip;
		const rot = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(9) * r);
		return out.makeTranslation(pivot.x, pivot.y, pivot.z + 0.025 * r).multiply(rot).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
	}
}

/**
 * Split the slide off the single scanned mesh: triangles whose vertices are
 * all above the frame rail (y > 0.05) and behind the exposed barrel
 * (z > -0.105). Both halves keep the original material.
 */
function splitSlide(mesh: THREE.Mesh): [THREE.Mesh, THREE.Mesh] {
	const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
	g.applyMatrix4(mesh.matrixWorld);
	const pos = g.getAttribute('position');
	const isSlide = (i: number) => pos.getY(i) > 0.05 && pos.getZ(i) > -0.105;
	const keepA: number[] = [], keepB: number[] = [];
	for (let t = 0; t < pos.count; t += 3) {
		(isSlide(t) && isSlide(t + 1) && isSlide(t + 2) ? keepB : keepA).push(t, t + 1, t + 2);
	}
	const pick = (idx: number[]) => {
		const out = new THREE.BufferGeometry();
		for (const name of Object.keys(g.attributes)) {
			const src = g.getAttribute(name) as THREE.BufferAttribute;
			const arr = new Float32Array(idx.length * src.itemSize);
			idx.forEach((v, k) => { for (let c = 0; c < src.itemSize; c++) arr[k * src.itemSize + c] = src.getComponent(v, c); });
			out.setAttribute(name, new THREE.BufferAttribute(arr, src.itemSize, src.normalized));
		}
		return out;
	};
	const mat = mesh.material as THREE.MeshStandardMaterial;
	const frame = new THREE.Mesh(pick(keepA), mat);
	frame.name = 'pistol-frame';
	const slide = new THREE.Mesh(pick(keepB), mat);
	slide.name = 'pistol-slide';
	return [frame, slide];
}
