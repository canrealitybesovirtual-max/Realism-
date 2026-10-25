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

const groups = (member: number, filter: number) => (member << 16) | filter;

export class GunEffects {
	private listener: THREE.AudioListener;
	private buffers = new Map<string, AudioBuffer>();
	private voices: THREE.PositionalAudio[] = [];
	private flash: THREE.Sprite;
	private flashLight: THREE.PointLight;
	private flashT = 0;
	private decals: THREE.Mesh[] = [];
	private decalTex: Record<'hole' | 'crack', THREE.Texture>;
	private puffs: { s: THREE.Sprite; t: number; life: number; v: THREE.Vector3; grow: number }[] = [];
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
		for (const n of ['pistol_shot', 'dry_fire', 'mag_out', 'mag_in']) {
			al.load(`sfx/${n}.wav`, (b) => this.buffers.set(n, b), undefined, () => console.warn('sound failed: ' + n));
		}
		for (let i = 0; i < 4; i++) { const v = new THREE.PositionalAudio(this.listener); v.setRefDistance(1.2); v.setRolloffFactor(1.2); scene.add(v); this.voices.push(v); }

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
	 * Fire from `origin` along `dir`. Visual surface hits come from the render
	 * meshes (exact surface), physics hits from Rapier (to push props).
	 */
	shot(muzzle: THREE.Vector3, forward: THREE.Vector3, port: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, aimOrigin: THREE.Vector3, aimDir: THREE.Vector3, exclude?: RAPIER.RigidBody) {
		this.play('pistol_shot', muzzle, 1, 0.96 + Math.random() * 0.08);
		// flash: a star sprite a little ahead of the muzzle + a warm light pulse
		this.flash.position.copy(muzzle).addScaledVector(forward, 0.03);
		const s = 0.09 + Math.random() * 0.05;
		this.flash.scale.set(s, s, s);
		(this.flash.material as THREE.SpriteMaterial).rotation = Math.random() * Math.PI;
		this.flash.visible = true;
		this.flashLight.position.copy(muzzle);
		this.flashT = 0.055;
		this.smoke(muzzle, forward);
		this.ejectCasing(port, right, up, forward);

		// physics: does the bullet strike a movable prop first?
		const ray = new RAPIER.Ray(aimOrigin, aimDir);
		const phit = this.physics.enabled
			? this.physics.world.castRayAndGetNormal(ray, 60, true, undefined, groups(GROUP_PROP, GROUP_STATIC | GROUP_PROP), undefined, exclude)
			: null;
		// visuals: the exact rendered surface
		this.raycaster.set(aimOrigin, aimDir);
		this.raycaster.far = 60;
		const vhit = this.raycaster.intersectObjects(this.scene.children, true).find((h) => this.hittable(h.object));
		if (phit) {
			const body = phit.collider.parent();
			const prop = this.physics.props.find((p) => p.body === body);
			if (prop && (!vhit || phit.timeOfImpact <= vhit.distance + 0.05)) {
				const p = new THREE.Vector3().copy(aimOrigin).addScaledVector(aimDir, phit.timeOfImpact);
				// a 9 mm round carries ~2.5 N s; props absorb part of it
				body!.applyImpulseAtPoint(new THREE.Vector3().copy(aimDir).multiplyScalar(1.4), p, true);
				this.puff(p, new THREE.Vector3(phit.normal.x, phit.normal.y, phit.normal.z), 'other');
				return { hit: prop.desc.name, point: p };
			}
		}
		if (vhit && vhit.face) {
			const n = vhit.face.normal.clone().transformDirection(vhit.object.matrixWorld);
			if (n.dot(aimDir) > 0) n.negate();
			const surf = classify(vhit.object);
			this.decal(vhit.point, n, surf);
			this.puff(vhit.point, n, surf);
			return { hit: vhit.object.name || 'surface', point: vhit.point.clone(), surface: surf };
		}
		return { hit: null };
	}

	private hittable(o: THREE.Object3D): boolean {
		if (!(o as THREE.Mesh).isMesh || !o.visible) return false;
		for (let p: THREE.Object3D | null = o; p; p = p.parent) {
			if (this.ignore.has(p) || p.name === 'sky' || p.name.startsWith('contact-shadow') || p.name.startsWith('hand-') || p.name === 'pistol' || p.name === 'decal') return false;
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

	private puff(p: THREE.Vector3, n: THREE.Vector3, surf: Surface) {
		const col = surf === 'wood' ? 0x9a7a55 : surf === 'plaster' ? 0xf0ede6 : surf === 'glass' || surf === 'screen' ? 0xe8f0f8 : 0xb0aca6;
		for (let i = 0; i < 6; i++) {
			const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTex, color: col, transparent: true, depthWrite: false, opacity: 0.8 }));
			s.position.copy(p).addScaledVector(n, 0.01);
			s.scale.setScalar(0.015);
			const v = n.clone().multiplyScalar(0.5 + Math.random() * 0.8).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6));
			this.scene.add(s);
			this.puffs.push({ s, t: 0, life: 0.45 + Math.random() * 0.35, v, grow: 0.16 });
		}
	}

	private smoke(p: THREE.Vector3, fwd: THREE.Vector3) {
		for (let i = 0; i < 3; i++) {
			const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTex, color: 0xd6d6d6, transparent: true, depthWrite: false, opacity: 0.35 }));
			s.position.copy(p).addScaledVector(fwd, 0.02 + i * 0.015);
			s.scale.setScalar(0.02);
			this.scene.add(s);
			this.puffs.push({ s, t: 0, life: 1.2 + i * 0.3, v: fwd.clone().multiplyScalar(0.25).add(new THREE.Vector3(0, 0.12, 0)), grow: 0.18 });
		}
	}

	private ejectCasing(port: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, fwd: THREE.Vector3) {
		if (!this.physics.enabled) return;
		const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), right);
		const body = this.physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
			.setTranslation(port.x, port.y, port.z).setRotation(q).setCcdEnabled(true).setLinearDamping(0.1).setAngularDamping(0.2));
		this.physics.world.createCollider(RAPIER.ColliderDesc.cylinder(0.0095, 0.0049).setMass(0.0045).setRestitution(0.45).setFriction(0.4)
			.setCollisionGroups(groups(GROUP_PROP, GROUP_STATIC)), body);
		// out to the right and up, a little back, spinning end over end
		const v = right.clone().multiplyScalar(2.2 + Math.random() * 0.8).addScaledVector(up, 1.6 + Math.random() * 0.6).addScaledVector(fwd, -0.4);
		body.setLinvel(v, true);
		body.setAngvel(fwd.clone().multiplyScalar(25 + Math.random() * 15), true);
		const mesh = new THREE.Mesh(this.casingGeo, this.casingMat);
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
		if (this.flashT > 0) {
			this.flashT -= dt;
			this.flashLight.intensity = Math.max(0, this.flashT / 0.055) * 7;
			if (this.flashT <= 0.03) this.flash.visible = false;
		} else { this.flashLight.intensity = 0; this.flash.visible = false; }
		for (let i = this.puffs.length - 1; i >= 0; i--) {
			const p = this.puffs[i];
			p.t += dt;
			const k = p.t / p.life;
			p.s.position.addScaledVector(p.v, dt);
			p.v.multiplyScalar(Math.exp(-dt * 3));
			p.s.scale.setScalar(0.015 + p.grow * k * (p.life > 1 ? 0.6 : 0.3));
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
