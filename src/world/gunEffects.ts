import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics/physics';
import { GROUP_PROP, GROUP_STATIC } from '../physics/physics';

/**
 * Everything a shot does to the room: muzzle flash and light, recorded
 * gunshot audio (positional), the bullet (a ray that pushes physics props and
 * leaves surface-appropriate marks), impact dust, a smoke wisp, and brass
 * casings that eject as real physics bodies.
 *
 * Audio: CC0 recordings from Freesound (michorvath "9mm pistol shot",
 * brianhanson2nd "Dry Fire", hyperix6 magazine handling).
 */

type Surface = 'plaster' | 'concrete' | 'wood' | 'glass' | 'screen' | 'metal' | 'other';

/**
 * Exterior ballistics, simplified to a point mass with quadratic drag
 * (dv/dt = -k v|v| - g). k is fitted to published velocity tables:
 * 9x19 115 gr leaves at ~360 m/s and keeps ~83 % after 100 m;
 * .338 Lapua 250 gr leaves at ~900 m/s and is near 500 m/s at 1000 m.
 */
export interface Cartridge {
	v0: number; k: number; impulse: number;
	caseR: number; caseLen: number; caseMass: number;
	sound: string; volume: number; flash: number;
}
export const CARTRIDGES: Record<'9mm' | '338', Cartridge> = {
	'9mm': { v0: 360, k: 0.0019, impulse: 1.4, caseR: 0.0049, caseLen: 0.019, caseMass: 0.0045, sound: 'pistol_shot', volume: 1, flash: 1 },
	'338': { v0: 900, k: 0.00059, impulse: 6, caseR: 0.0074, caseLen: 0.0693, caseMass: 0.021, sound: 'rifle_shot', volume: 1, flash: 1.9 },
};
export interface ShotResult { hit: string | null; point: THREE.Vector3 | null; surface?: Surface; distance: number; time: number }
export interface BulletHit { point: THREE.Vector3; normal: THREE.Vector3; dir: THREE.Vector3; speed: number; object: THREE.Object3D; cart: Cartridge }
/** userData.onBulletHit on an object (or an ancestor): return false to also leave the default mark */
export type BulletHitHandler = (h: BulletHit) => boolean | void;
interface Bullet { pos: THREE.Vector3; vel: THREE.Vector3; cart: Cartridge; exclude?: RAPIER.RigidBody; res: ShotResult; travelled: number; t: number; done?: boolean }

const groups = (member: number, filter: number) => (member << 16) | filter;

/** muzzle-flash light peak; the room is exposed for daylight, so a few
 * candela at arm's length already lights the nearby walls warm for a frame */
const FLASH_LIGHT = 0.35;

export class GunEffects {
	private listener: THREE.AudioListener;
	private buffers = new Map<string, AudioBuffer>();
	private voices: THREE.PositionalAudio[] = [];
	private flash: THREE.Sprite;
	private flashLight: THREE.PointLight;
	private flashT = 0;
	/** set by shot(): the flash survives the update of the frame it was fired in */
	private flashFresh = false;
	private decals: THREE.Mesh[] = [];
	private decalTex: Record<'hole' | 'crack', THREE.Texture>;
	private puffs: { s: THREE.Sprite; t: number; life: number; v: THREE.Vector3; grow: number; base?: number }[] = [];
	private bullets: Bullet[] = [];
	private puffTex: THREE.Texture;
	private casings: { body: RAPIER.RigidBody; mesh: THREE.Mesh; t: number }[] = [];
	private casingGeo = new THREE.CylinderGeometry(0.0049, 0.0049, 0.019, 12);
	private casingMat = new THREE.MeshStandardMaterial({ color: 0xc8a052, metalness: 1, roughness: 0.28 });
	private raycaster = new THREE.Raycaster();
	/** meshes that bullets must not hit (hands, the gun, effects, sky) */
	ignore = new Set<THREE.Object3D>();

	constructor(private scene: THREE.Scene, camera: THREE.Camera, private physics: Physics) {
		this.listener = new THREE.AudioListener();
		camera.add(this.listener);
		this.raycaster.camera = camera; // Sprite.raycast needs it
		const al = new THREE.AudioLoader();
		for (const n of ['pistol_shot', 'dry_fire', 'mag_out', 'mag_in', 'rifle_shot', 'bolt', 'brass']) {
			al.load(`sfx/${n}.wav`, (b) => this.buffers.set(n, b), undefined, () => console.warn('sound failed: ' + n));
		}
		for (let i = 0; i < 8; i++) { const v = new THREE.PositionalAudio(this.listener); v.setRefDistance(1.2); v.setRolloffFactor(1.2); scene.add(v); this.voices.push(v); }

		this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
		this.flash.visible = false;
		scene.add(this.flash);
		// always in the scene (intensity 0 between shots) so firing never changes
		// the light count and forces shader recompiles mid-game
		this.flashLight = new THREE.PointLight(0xffb060, 0, 4, 2);
		scene.add(this.flashLight);
		this.decalTex = { hole: holeTexture(), crack: crackTexture() };
		this.puffTex = puffTexture();
		this.ignore.add(this.flash);
	}

	play(name: string, at: THREE.Vector3, volume = 1, rate = 1) {
		const buf = this.buffers.get(name);
		if (!buf) return;
		if (this.listener.context.state === 'suspended') void this.listener.context.resume();
		const v = this.voices.find((x) => !x.isPlaying) ?? this.voices[0];
		if (v.isPlaying) v.stop();
		v.setBuffer(buf);
		v.setVolume(volume);
		v.setPlaybackRate(rate);
		v.position.copy(at);
		v.play();
	}

	/**
	 * Fire a round: muzzle effects, then a bullet that flies (gravity + drag,
	 * see Cartridge) from aimOrigin along aimDir. The returned record fills in
	 * when it hits; close hits resolve before this returns.
	 */
	shot(muzzle: THREE.Vector3, forward: THREE.Vector3, port: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, aimOrigin: THREE.Vector3, aimDir: THREE.Vector3, exclude?: RAPIER.RigidBody, cart: Cartridge = CARTRIDGES['9mm'], eject = true): ShotResult {
		this.play(cart.sound, muzzle, cart.volume, 0.96 + Math.random() * 0.08);
		// flash: a star sprite a little ahead of the muzzle + a warm light pulse
		this.flash.position.copy(muzzle).addScaledVector(forward, 0.03 * cart.flash);
		const s = (0.09 + Math.random() * 0.05) * cart.flash;
		this.flash.scale.set(s, s, s);
		(this.flash.material as THREE.SpriteMaterial).rotation = Math.random() * Math.PI;
		this.flash.visible = true;
		this.flashLight.position.copy(muzzle);
		this.flashT = 0.055;
		this.flashFresh = true;
		this.smoke(muzzle, forward, cart.flash);
		if (eject) this.ejectCasing(port, right, up, forward, cart);
		const res: ShotResult = { hit: null, point: null, distance: 0, time: 0 };
		const b: Bullet = { pos: aimOrigin.clone(), vel: aimDir.clone().normalize().multiplyScalar(cart.v0), cart, exclude, res, travelled: 0, t: 0 };
		// the first 40 ms in fine steps right away: anything in the room is hit
		// before the trigger handler returns
		for (let k = 0; k < 4 && !b.done; k++) this.stepBullet(b, 0.01);
		if (!b.done) this.bullets.push(b);
		return res;
	}

	/** Advance a bullet by dt, testing the segment it sweeps. */
	private stepBullet(b: Bullet, dt: number) {
		const from = b.pos.clone();
		const speed = b.vel.length();
		// drag: dv/dt = -k v |v|; gravity
		b.vel.multiplyScalar(1 / (1 + b.cart.k * speed * dt));
		b.vel.y -= 9.81 * dt;
		const to = from.clone().addScaledVector(b.vel, dt);
		const seg = to.clone().sub(from), len = seg.length();
		const dir = seg.divideScalar(len || 1);
		b.t += dt;
		// physics props (to push them) and rendered surfaces (exact marks)
		const phit = this.physics.enabled
			? this.physics.world.castRayAndGetNormal(new RAPIER.Ray(from, dir), len, true, undefined, groups(GROUP_PROP, GROUP_STATIC | GROUP_PROP), undefined, b.exclude)
			: null;
		this.raycaster.set(from, dir);
		this.raycaster.far = len;
		const vhit = this.raycaster.intersectObjects(this.scene.children, true).find((h) => this.hittable(h.object));
		const done = (hit: string, point: THREE.Vector3, surface?: Surface) => {
			b.done = true;
			Object.assign(b.res, { hit, point, surface, distance: b.travelled + from.distanceTo(point), time: b.t });
		};
		if (phit) {
			const body = phit.collider.parent();
			const prop = this.physics.props.find((p) => p.body === body);
			if (prop && (!vhit || phit.timeOfImpact <= vhit.distance + 0.05)) {
				const p = from.clone().addScaledVector(dir, phit.timeOfImpact);
				// momentum: a 9 mm round carries ~2.5 N s, a .338 ~20 N s; props absorb part of it
				body!.applyImpulseAtPoint(dir.clone().multiplyScalar(b.cart.impulse), p, true);
				this.puff(p, new THREE.Vector3(phit.normal.x, phit.normal.y, phit.normal.z), 'other');
				done(prop.desc.name, p);
				return;
			}
		}
		if (vhit && vhit.face) {
			const n = vhit.face.normal.clone().transformDirection(vhit.object.matrixWorld);
			if (n.dot(dir) > 0) n.negate();
			// targets (clays, steel) react themselves; anything else gets a mark
			let handled = false;
			for (let o: THREE.Object3D | null = vhit.object; o && !handled; o = o.parent) {
				const cb = o.userData.onBulletHit as BulletHitHandler | undefined;
				if (cb) handled = cb({ point: vhit.point.clone(), normal: n, dir: dir.clone(), speed: b.vel.length(), object: vhit.object, cart: b.cart }) !== false;
			}
			const surf = classify(vhit.object);
			if (!handled) {
				this.decal(vhit.point, n, surf);
				this.puff(vhit.point, n, surf, Math.max(1, vhit.point.distanceTo(this.listener.getWorldPosition(new THREE.Vector3())) / 25));
			}
			done(vhit.object.name || 'surface', vhit.point.clone(), surf);
			return;
		}
		b.pos.copy(to);
		b.travelled += len;
		if (b.travelled > 2500 || b.pos.y < -200 || b.t > 6) { b.done = true; b.res.distance = b.travelled; }
	}

	/** Eject a spent case (bolt guns do this when the bolt is pulled back). */
	eject(port: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, forward: THREE.Vector3, cart: Cartridge, gentle = false) {
		this.ejectCasing(port, right, up, forward, cart, gentle ? 0.45 : 1);
	}

	private hittable(o: THREE.Object3D): boolean {
		if (!(o as THREE.Mesh).isMesh || !o.visible) return false;
		for (let p: THREE.Object3D | null = o; p; p = p.parent) {
			if (this.ignore.has(p) || p.name === 'sky' || p.name.startsWith('contact-shadow') || p.name.startsWith('hand-') || p.name === 'pistol' || p.name.startsWith('gun-') || p.name === 'decal' || p.userData.noBullet) return false;
		}
		return true;
	}

	private decal(p: THREE.Vector3, n: THREE.Vector3, surf: Surface) {
		const crack = surf === 'glass' || surf === 'screen';
		const size = crack ? 0.09 + Math.random() * 0.04 : surf === 'wood' ? 0.035 : 0.045;
		const mat = new THREE.MeshStandardMaterial({
			map: crack ? this.decalTex.crack : this.decalTex.hole, transparent: true, depthWrite: false,
			polygonOffset: true, polygonOffsetFactor: -4, roughness: crack ? 0.1 : 1,
			color: crack ? 0xffffff : surf === 'wood' ? 0x6b5038 : surf === 'plaster' ? 0xd8d4cc : 0x8a8580,
			emissive: surf === 'screen' ? 0x223344 : 0x000000,
		});
		const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
		m.name = 'decal';
		m.position.copy(p).addScaledVector(n, 0.0008);
		m.lookAt(p.clone().add(n));
		m.rotateZ(Math.random() * Math.PI * 2);
		this.scene.add(m);
		this.decals.push(m);
		if (this.decals.length > 60) { const old = this.decals.shift()!; this.scene.remove(old); old.geometry.dispose(); (old.material as THREE.Material).dispose(); }
	}

	private puff(p: THREE.Vector3, n: THREE.Vector3, surf: Surface, scale = 1) {
		const col = surf === 'wood' ? 0x9a7a55 : surf === 'plaster' ? 0xf0ede6 : surf === 'glass' || surf === 'screen' ? 0xe8f0f8 : 0xb0aca6;
		for (let i = 0; i < 6; i++) {
			const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTex, color: col, transparent: true, depthWrite: false, opacity: 0.8 }));
			s.position.copy(p).addScaledVector(n, 0.01);
			s.scale.setScalar(0.015 * scale);
			const v = n.clone().multiplyScalar(0.5 + Math.random() * 0.8).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6)).multiplyScalar(Math.sqrt(scale));
			this.scene.add(s);
			this.puffs.push({ s, t: 0, life: (0.45 + Math.random() * 0.35) * Math.min(3, Math.sqrt(scale)), v, grow: 0.16 * scale, base: 0.015 * scale });
		}
	}

	private smoke(p: THREE.Vector3, fwd: THREE.Vector3, amount = 1) {
		for (let i = 0; i < Math.round(3 * amount); i++) {
			const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTex, color: 0xd6d6d6, transparent: true, depthWrite: false, opacity: 0.35 }));
			s.position.copy(p).addScaledVector(fwd, 0.02 + i * 0.015);
			s.scale.setScalar(0.02);
			this.scene.add(s);
			this.puffs.push({ s, t: 0, life: 1.2 + i * 0.3, v: fwd.clone().multiplyScalar(0.25).add(new THREE.Vector3(0, 0.12, 0)), grow: 0.18 });
		}
	}

	private ejectCasing(port: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, fwd: THREE.Vector3, cart: Cartridge = CARTRIDGES['9mm'], force = 1) {
		if (!this.physics.enabled) return;
		this.play('brass', port, 0.25, 0.9 + Math.random() * 0.2);
		const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), right);
		const body = this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
			.setTranslation(port.x, port.y, port.z).setRotation(q).setCcdEnabled(true).setLinearDamping(0.1).setAngularDamping(0.2));
		this.physics.world.createCollider(RAPIER.ColliderDesc.cylinder(cart.caseLen / 2, cart.caseR).setMass(cart.caseMass).setRestitution(0.45).setFriction(0.4)
			.setCollisionGroups(groups(GROUP_PROP, GROUP_STATIC)), body);
		// out to the right and up, a little back, spinning end over end
		const v = right.clone().multiplyScalar((2.2 + Math.random() * 0.8) * force).addScaledVector(up, (1.6 + Math.random() * 0.6) * force).addScaledVector(fwd, -0.4 * force);
		body.setLinvel(v, true);
		body.setAngvel(fwd.clone().multiplyScalar(25 + Math.random() * 15), true);
		const mesh = new THREE.Mesh(this.casingGeo, this.casingMat);
		mesh.scale.set(cart.caseR / 0.0049, cart.caseLen / 0.019, cart.caseR / 0.0049);
		mesh.castShadow = true;
		mesh.name = 'decal'; // not a bullet target
		this.scene.add(mesh);
		this.casings.push({ body, mesh, t: 0 });
		if (this.casings.length > 24) this.removeCasing(0);
	}

	private removeCasing(i: number) {
		const c = this.casings[i];
		this.physics.world.removeRigidBody(c.body);
		this.scene.remove(c.mesh);
		this.casings.splice(i, 1);
	}

	/** true while any casing is still moving (the sun shadow map must follow) */
	get active() { return this.casings.some((c) => !c.body.isSleeping()); }

	update(dt: number) {
		// bullets in flight (long range): one swept segment per frame
		for (let i = this.bullets.length - 1; i >= 0; i--) {
			const b = this.bullets[i];
			this.stepBullet(b, Math.min(dt, 1 / 30));
			if (b.done) this.bullets.splice(i, 1);
		}
		if (this.flashFresh) {
			this.flashFresh = false;
			this.flashLight.intensity = FLASH_LIGHT;
		} else if (this.flashT > 0) {
			this.flashT -= dt;
			this.flashLight.intensity = Math.max(0, this.flashT / 0.055) * FLASH_LIGHT;
			if (this.flashT <= 0.03) this.flash.visible = false;
		} else { this.flashLight.intensity = 0; this.flash.visible = false; }
		for (let i = this.puffs.length - 1; i >= 0; i--) {
			const p = this.puffs[i];
			p.t += dt;
			const k = p.t / p.life;
			p.s.position.addScaledVector(p.v, dt);
			p.v.multiplyScalar(Math.exp(-dt * 3));
			p.s.scale.setScalar((p.base ?? 0.015) + p.grow * k * (p.life > 1 ? 0.6 : 0.3));
			(p.s.material as THREE.SpriteMaterial).opacity = (1 - k) * (p.life > 1 ? 0.3 : 0.75);
			if (k >= 1) { this.scene.remove(p.s); (p.s.material as THREE.Material).dispose(); this.puffs.splice(i, 1); }
		}
		for (let i = this.casings.length - 1; i >= 0; i--) {
			const c = this.casings[i];
			c.t += dt;
			const t = c.body.translation(), r = c.body.rotation();
			c.mesh.position.set(t.x, t.y, t.z);
			c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
			if (c.t > 45 || t.y < -1) this.removeCasing(i);
		}
	}
}

function classify(o: THREE.Object3D): Surface {
	const n = (o.name + ' ' + ((o as THREE.Mesh).material as THREE.Material)?.name).toLowerCase();
	if (n.includes('glass')) return 'glass';
	if (n.includes('screen') || n.includes('lcd')) return 'screen';
	if (n.includes('oak') || n.includes('desk-top') || n.includes('wood')) return 'wood';
	if (n.includes('floor') || n.includes('concrete') || n.includes('terrace')) return 'concrete';
	if (['north', 'south', 'east', 'west', 'ceiling'].includes(o.name) || n.includes('paint') || n.includes('plaster')) return 'plaster';
	if (n.includes('aluminium') || n.includes('powder') || n.includes('chrome')) return 'metal';
	return 'other';
}

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
	const c = document.createElement('canvas');
	c.width = c.height = size;
	draw(c.getContext('2d')!);
	const t = new THREE.CanvasTexture(c);
	if (srgb) t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

function flashTexture() {
	return canvasTex(128, (g) => {
		const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
		grd.addColorStop(0, 'rgba(255,250,230,1)'); grd.addColorStop(0.18, 'rgba(255,210,120,0.95)');
		grd.addColorStop(0.45, 'rgba(255,140,40,0.35)'); grd.addColorStop(1, 'rgba(255,100,20,0)');
		g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
		g.globalCompositeOperation = 'lighter';
		for (let i = 0; i < 5; i++) {
			const a = (i / 5) * Math.PI * 2 + 0.3;
			g.strokeStyle = 'rgba(255,200,110,0.55)'; g.lineWidth = 7 - i % 2 * 3;
			g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); g.stroke();
		}
	});
}

function holeTexture() {
	return canvasTex(128, (g) => {
		// pale chipped crater (tinted per surface by the material colour), dark core
		const rim = g.createRadialGradient(64, 64, 6, 64, 64, 62);
		rim.addColorStop(0, 'rgba(60,55,50,0.9)'); rim.addColorStop(0.35, 'rgba(120,115,110,0.55)');
		rim.addColorStop(0.7, 'rgba(160,155,150,0.18)'); rim.addColorStop(1, 'rgba(160,155,150,0)');
		g.fillStyle = rim; g.fillRect(0, 0, 128, 128);
		g.fillStyle = 'rgba(12,10,9,1)';
		g.beginPath(); g.arc(64, 64, 9, 0, Math.PI * 2); g.fill();
		g.fillStyle = 'rgba(30,26,24,0.8)';
		for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28, r = 10 + Math.random() * 10; g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 2 + Math.random() * 3, 0, 6.28); g.fill(); }
	});
}

function crackTexture() {
	return canvasTex(256, (g) => {
		g.strokeStyle = 'rgba(255,255,255,0.85)';
		g.lineCap = 'round';
		// radial cracks
		for (let i = 0; i < 11; i++) {
			const a = (i / 11) * Math.PI * 2 + Math.random() * 0.3;
			let x = 128, y = 128;
			g.lineWidth = 1.6;
			g.beginPath(); g.moveTo(x, y);
			const len = 70 + Math.random() * 55;
			for (let d = 0; d < len; d += 12) { x += Math.cos(a + (Math.random() - 0.5) * 0.5) * 12; y += Math.sin(a + (Math.random() - 0.5) * 0.5) * 12; g.lineTo(x, y); }
			g.stroke();
		}
		// concentric rings
		g.lineWidth = 1;
		for (const r of [26, 52]) {
			g.beginPath();
			for (let k = 0; k <= 22; k++) { const a = (k / 22) * Math.PI * 2; const rr = r + (Math.random() - 0.5) * 8; k ? g.lineTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr) : g.moveTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr); }
			g.stroke();
		}
		const core = g.createRadialGradient(128, 128, 0, 128, 128, 16);
		core.addColorStop(0, 'rgba(20,20,22,0.95)'); core.addColorStop(0.5, 'rgba(230,235,240,0.9)'); core.addColorStop(1, 'rgba(255,255,255,0)');
		g.fillStyle = core; g.beginPath(); g.arc(128, 128, 16, 0, Math.PI * 2); g.fill();
	});
}

function puffTexture() {
	return canvasTex(64, (g) => {
		const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
		grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
		g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
	});
}
