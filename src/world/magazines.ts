import * as THREE from 'three';
import type { Physics, Prop } from '../physics/physics';
import type { FirearmSystem } from './firearmSystem';

/**
 * Real magazines. A magazine is its own object: pressing the release drops
 * it out of the gun as a physics prop that keeps the rounds it still holds;
 * a magazine is loaded by bringing it to the magwell (in VR, with the other
 * hand) where it seats when it lines up. Spare magazines ride in a belt
 * pouch (in VR: reach to your hip and squeeze to draw one, let a magazine go
 * at your hip to put it back); ammo cans refill the pouch.
 */
interface Template { holder: THREE.Group; inGun: THREE.Matrix4; half: [number, number, number]; mass: number }
export interface MagInfo { gun: string; rounds: number }

export class MagazineManager {
	private templates = new Map<string, Template>();
	/** loose magazines in the world */
	readonly loose = new Map<Prop, MagInfo>();
	/** spare magazines on the belt, per gun id (rounds in each) */
	readonly pouch = new Map<string, number[]>();
	readonly maxPouch = 3;
	onChange: () => void = () => {};

	constructor(private physics: Physics, private scene: THREE.Scene) {}

	register(fs: FirearmSystem) {
		const g = fs.gun, node = g.magNode();
		if (!node) return;
		g.group.updateMatrixWorld(true);
		const rel = new THREE.Matrix4().copy(g.group.matrixWorld).invert().multiply(node.matrixWorld);
		const clone = node.clone(true);
		clone.matrixAutoUpdate = true;
		rel.decompose(clone.position, clone.quaternion, clone.scale);
		clone.visible = true;
		clone.traverse((o) => { o.visible = true; if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
		const holder = new THREE.Group();
		holder.add(clone);
		holder.updateMatrixWorld(true);
		const box = new THREE.Box3().setFromObject(holder);
		const c = box.getCenter(new THREE.Vector3()), h = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
		clone.position.sub(c);
		this.templates.set(g.spec.id, {
			holder, inGun: new THREE.Matrix4().makeTranslation(c.x, c.y, c.z),
			half: [Math.max(0.005, h.x), Math.max(0.005, h.y), Math.max(0.005, h.z)],
			mass: g.bolted ? 0.32 : 0.12,
		});
		this.pouch.set(g.spec.id, [g.spec.capacity, g.spec.capacity]);
	}

	has(gunId: string) { return this.templates.has(gunId); }
	info(prop: Prop | null | undefined) { return prop ? this.loose.get(prop) ?? null : null; }

	/** where a magazine sits when seated in this gun (world) */
	seatedPose(fs: FirearmSystem, out = new THREE.Matrix4()) {
		fs.gun.group.updateMatrixWorld(true);
		return out.multiplyMatrices(fs.gun.group.matrixWorld, this.templates.get(fs.gun.spec.id)!.inGun);
	}

	/** make a loose magazine at a world pose */
	spawn(gunId: string, rounds: number, pose: THREE.Matrix4, vel?: THREE.Vector3): Prop | null {
		const t = this.templates.get(gunId);
		if (!t || !this.physics.enabled) return null;
		const obj = t.holder.clone(true);
		obj.name = 'magazine-' + gunId;
		pose.decompose(obj.position, obj.quaternion, new THREE.Vector3());
		this.scene.add(obj);
		const prop = this.physics.addProp({ name: 'magazine', object: obj, mass: t.mass, friction: 0.6, restitution: 0.2, shapes: [{ kind: 'cuboid', size: [...t.half] }] });
		if (vel) prop.body.setLinvel(vel, true);
		obj.userData.mag = { gun: gunId, rounds };
		this.loose.set(prop, { gun: gunId, rounds });
		this.trimLoose();
		this.onChange();
		return prop;
	}

	/** magazine release: the magazine drops out of the gun */
	drop(fs: FirearmSystem, vel = new THREE.Vector3(0, -0.6, 0)): Prop | null {
		const rounds = fs.gun.releaseMag();
		if (rounds === null) return null;
		const body = fs.prop.body.linvel();
		return this.spawn(fs.gun.spec.id, rounds, this.seatedPose(fs).multiply(new THREE.Matrix4().makeTranslation(0, -0.02, 0)), vel.clone().add(new THREE.Vector3(body.x, body.y, body.z)));
	}

	/** would this loose magazine seat in that gun now? (close to the magwell and lined up) */
	fits(prop: Prop, fs: FirearmSystem, posTol = 0.06, angTol = 0.6, at?: { p: THREE.Vector3; q: THREE.Quaternion }) {
		const m = this.loose.get(prop);
		if (!m || m.gun !== fs.gun.spec.id || fs.gun.magIn) return false;
		const want = this.seatedPose(fs), wp = new THREE.Vector3(), wq = new THREE.Quaternion();
		want.decompose(wp, wq, new THREE.Vector3());
		// `at`: where the hand is putting it (a held magazine can be knocked about by the gun on the way in)
		const o = prop.desc.object, p = at?.p ?? o.getWorldPosition(new THREE.Vector3()), q = at?.q ?? o.getWorldQuaternion(new THREE.Quaternion());
		return p.distanceTo(wp) < posTol && q.angleTo(wq) < angTol;
	}

	/** seat a loose magazine in the gun (removes the loose object) */
	insert(prop: Prop, fs: FirearmSystem, animate = false) {
		const m = this.loose.get(prop);
		if (!m || !fs.gun.insertMag(m.rounds, animate)) return false;
		this.loose.delete(prop);
		this.physics.removeProp(prop);
		this.onChange();
		return true;
	}

	/** take the fullest spare from the pouch (rounds), or null */
	takeFromPouch(gunId: string): number | null {
		const p = this.pouch.get(gunId);
		if (!p?.length) return null;
		p.sort((a, b) => b - a);
		const r = p.shift()!;
		this.onChange();
		return r;
	}

	/** put a loose magazine on the belt */
	stow(prop: Prop) {
		const m = this.loose.get(prop);
		if (!m) return false;
		const p = this.pouch.get(m.gun) ?? [];
		if (p.length >= this.maxPouch) return false;
		p.push(m.rounds);
		this.pouch.set(m.gun, p);
		this.loose.delete(prop);
		this.physics.removeProp(prop);
		this.onChange();
		return true;
	}

	/** nearest loose magazine for a gun within reach (with at least `minRounds`) */
	nearestLoose(gunId: string, at: THREE.Vector3, reach: number, minRounds = 0): Prop | null {
		let best: Prop | null = null, bd = reach;
		for (const [p, m] of this.loose) {
			if (m.gun !== gunId || p.held || m.rounds < minRounds) continue;
			const d = p.desc.object.getWorldPosition(new THREE.Vector3()).distanceTo(at);
			if (d < bd) { bd = d; best = p; }
		}
		return best;
	}

	/** ammo can: every pouch back to full magazines */
	refill(capacity: (gunId: string) => number) {
		for (const id of this.templates.keys()) this.pouch.set(id, Array(this.maxPouch).fill(capacity(id)));
		this.onChange();
	}

	/** keep the floor from filling up: the oldest empties go first */
	private trimLoose() {
		if (this.loose.size <= 14) return;
		for (const [p, m] of this.loose) {
			if (p.held) continue;
			if (m.rounds === 0 || this.loose.size > 20) { this.loose.delete(p); this.physics.removeProp(p); }
			if (this.loose.size <= 14) break;
		}
	}

	summary(gunId: string) {
		const p = this.pouch.get(gunId) ?? [];
		return p.length ? `${p.length} spare (${p.join('/')})` : 'no spares';
	}
}

/** A box of ammunition: use it (E / trigger) to refill the belt pouch. */
export function makeAmmoCan(onUse: () => void): THREE.Group {
	const g = new THREE.Group();
	g.name = 'ammo-can';
	const olive = new THREE.MeshStandardMaterial({ color: 0x4b5233, roughness: 0.55, metalness: 0.35 });
	const steel = new THREE.MeshStandardMaterial({ color: 0x6d6f6a, roughness: 0.35, metalness: 0.9 });
	const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.12), olive);
	body.position.y = 0.09;
	const lid = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.02, 0.13), olive);
	lid.position.y = 0.19;
	const latch = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.012), steel);
	latch.position.set(0.11, 0.15, 0.066);
	const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.005, 6, 16, Math.PI), steel);
	handle.position.y = 0.2; handle.rotation.y = Math.PI / 2;
	// stencil
	const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
	const c = cv.getContext('2d')!;
	c.fillStyle = '#4b5233'; c.fillRect(0, 0, 256, 128);
	c.fillStyle = '#e8e2c8'; c.font = 'bold 38px sans-serif'; c.textAlign = 'center'; c.fillText('AMMO', 128, 58); c.font = 'bold 22px sans-serif'; c.fillText('9MM · .338 LM', 128, 96);
	const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
	const label = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
	label.position.set(0, 0.095, 0.0605);
	for (const m of [body, lid, latch, handle, label]) { m.castShadow = true; m.receiveShadow = true; m.userData.onUse = onUse; g.add(m); }
	g.userData.onUse = onUse;
	return g;
}
