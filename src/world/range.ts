import * as THREE from 'three';
import type { Physics, Prop } from '../physics/physics';
import type { Walkable } from '../interaction/shared';
import type { DesktopControls } from '../interaction/desktop';
import type { XRControls } from '../interaction/xr';
import type { BulletHit } from './gunEffects';

/**
 * Outdoor shooting range, reached through the office door (Door app on the
 * computer). It sits far from the office (RANGE_ORIGIN) so the two never meet.
 *
 * - Firing line: a covered concrete pad with a bench and sandbag rest; the
 *   AWM and the Glock are laid on the bench when you arrive.
 * - Trap house 15 m out with a clay thrower: PULL throws one clay at a random
 *   angle (left stick click in VR, P on desktop, or the green bench button);
 *   AUTO throws every few seconds (right stick click, O, orange button).
 *   Clays fly with drag and break into shards when a bullet hits them.
 * - Steel: AR500-style plates on chains from 25 m (pistol) to 1000 m. A hit
 *   rings, heard after the sound's travel time, swings the plate and leaves
 *   a lead splash. Distance boards stand in front of each frame.
 */
export const RANGE_ORIGIN = new THREE.Vector3(-5000, 0, 0);
const EYE = 1.62;

type Deps = {
	effects: import('./gunEffects').GunEffects;
	scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer;
	physics: Physics; walk: Walkable; desktop: DesktopControls | null; xr: XRControls | null;
	sun: THREE.DirectionalLight; listener: THREE.AudioListener;
	background: THREE.Texture; backgroundRotation: number; env: THREE.Texture;
	gunProps: { prop: Prop; bolted: boolean }[];
	/** shot results feed the readout */
	onRangeHit?: (text: string) => void;
};

interface Clay { mesh: THREE.Mesh; vel: THREE.Vector3; spin: number; t: number; dead: boolean; landed: number }
interface Shard { mesh: THREE.Mesh; vel: THREE.Vector3; rot: THREE.Vector3; t: number }
interface Steel { plate: THREE.Object3D; distance: number; angle: number; vel: number; splashes: THREE.Mesh[] }

export class ShootingRange {
	readonly root = new THREE.Group();
	active = false;
	private clays: Clay[] = [];
	private shards: Shard[] = [];
	private steels: Steel[] = [];
	private clayGeo: THREE.BufferGeometry;
	private clayMat: THREE.MeshStandardMaterial;
	private shardGeo: THREE.BufferGeometry;
	private trapHead = new THREE.Group();
	private trapArm = new THREE.Group();
	private armT = 0;
	private auto = false;
	private autoT = 0;
	private stats = { thrown: 0, broken: 0, steel: 0 };
	private boardCv = document.createElement('canvas');
	private boardTex!: THREE.CanvasTexture;
	private lastLine = 'Ready.';
	private exitDoor = new THREE.Group();
	private pullButton!: THREE.Mesh;
	private autoButton!: THREE.Mesh;
	private saved: any = null;
	private hint: HTMLDivElement;
	private vrHint: THREE.Mesh;
	private vrHintCv = document.createElement('canvas');
	private vrHintTex: THREE.CanvasTexture;
	private hintText = '';
	private audio: Record<string, AudioBuffer> = {};
	private voices: THREE.PositionalAudio[] = [];
	private padPrev: Record<string, boolean> = {};
	private benchTop = new THREE.Vector3();

	constructor(private d: Deps) {
		const R = RANGE_ORIGIN;
		this.root.name = 'range';
		this.root.position.copy(R);
		this.root.visible = false;
		d.scene.add(this.root);
		this.clayGeo = clayGeometry();
		// open underneath, so both faces (a shot from below meets the inside)
		this.clayMat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.7, side: THREE.DoubleSide });
		this.shardGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.03, 0.004, 0.01), new THREE.Vector3(0.01, 0, 0.035)]);
		this.shardGeo.setIndex([0, 1, 2, 0, 2, 1]);
		this.shardGeo.computeVertexNormals();
		this.buildGround();
		this.buildFiringLine();
		this.buildTrap();
		this.buildSteel();
		this.buildExit();
		this.root.traverse((o) => {
			const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
			if (m && 'envMap' in m && !m.envMap) { m.envMap = d.env; m.envMapIntensity = 0.8; m.needsUpdate = true; }
		});
		// physics: ground and bench
		d.physics.addStatic({ center: new THREE.Vector3(R.x, -0.5, R.z - 500), half: new THREE.Vector3(1300, 0.5, 1300) });
		const bt = this.benchTop.clone().add(R);
		d.physics.addStatic({ center: new THREE.Vector3(bt.x, bt.y - 0.03, bt.z), half: new THREE.Vector3(0.9, 0.03, 0.42) });
		// clays are hit-tested in their own moving frame (they cross more than
		// their own width in one frame): the bullet's motion relative to the clay
		// against a 110 x 25 mm disc (an oblate ellipsoid)
		d.effects.sweepers.push((from, to, dt, offset) => {
			if (!this.active) return null;
			let best: { f: number; name: string; onHit: () => void } | null = null;
			for (const c of this.clays) {
				if (c.dead || c.landed > 0) continue;
				const centre = c.mesh.position.clone().add(RANGE_ORIGIN).addScaledVector(c.vel, offset);
				const rel = to.clone().sub(from).addScaledVector(c.vel, -dt);
				const o = from.clone().sub(centre);
				const k = 0.055 / 0.0125; // squash: disc -> sphere
				o.y *= k; rel.y *= k;
				const a = rel.lengthSq(), bq = 2 * o.dot(rel), cq = o.lengthSq() - 0.055 * 0.055;
				const disc = bq * bq - 4 * a * cq;
				if (disc < 0 || a === 0) continue;
				const f = (-bq - Math.sqrt(disc)) / (2 * a);
				if (f >= 0 && f <= 1 && (!best || f < best.f)) best = { f, name: 'clay', onHit: () => this.breakClay(c) };
			}
			return best;
		});
		// sounds are made here (no recordings needed): clay break, steel ring, trap throw
		const ac = d.listener.context;
		this.audio.clay = synth(ac, 0.25, (t) => (Math.random() * 2 - 1) * Math.exp(-t * 38) * 0.9);
		this.audio.ring = synth(ac, 1.6, (t) => (Math.sin(2 * Math.PI * 830 * t) * 0.6 + Math.sin(2 * Math.PI * 1390 * t) * 0.3 + Math.sin(2 * Math.PI * 2270 * t) * 0.2) * Math.exp(-t * 2.6) * (1 - Math.exp(-t * 600)));
		this.audio.trap = synth(ac, 0.35, (t) => ((Math.random() * 2 - 1) * 0.6 * Math.exp(-t * 30) + Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 12)));
		for (let i = 0; i < 6; i++) { const v = new THREE.PositionalAudio(d.listener); v.setRefDistance(4); v.setRolloffFactor(0.9); v.setMaxDistance(3000); this.root.add(v); this.voices.push(v); }
		// hint (desktop) and its in-headset twin
		this.hint = document.createElement('div');
		this.hint.style.cssText = 'position:fixed;left:50%;bottom:calc(64px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:7;display:none;padding:9px 14px;border-radius:10px;background:rgba(14,16,20,.78);color:#fff;font:500 14px/1.45 system-ui,sans-serif;text-align:center;max-width:calc(100% - 32px)';
		document.body.appendChild(this.hint);
		this.vrHintCv.width = 1024; this.vrHintCv.height = 256;
		this.vrHintTex = new THREE.CanvasTexture(this.vrHintCv); this.vrHintTex.colorSpace = THREE.SRGBColorSpace;
		this.vrHint = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.16), new THREE.MeshBasicMaterial({ map: this.vrHintTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
		this.vrHint.position.set(0, -0.22, -0.9); this.vrHint.renderOrder = 1003; this.vrHint.visible = false; this.vrHint.frustumCulled = false;
		this.vrHint.userData.noBullet = true;
		d.camera.add(this.vrHint);
		addEventListener('keydown', (e) => {
			if (!this.active || e.repeat) return;
			if (e.code === 'KeyP') this.pull();
			else if (e.code === 'KeyO') this.toggleAuto();
			else if (e.code === 'KeyE' && this.nearExit()) this.leave();
		});
		d.renderer.domElement.addEventListener('mousedown', (e) => {
			// clicking a bench button with the crosshair (hands free)
			if (!this.active || e.button !== 0 || d.desktop?.heldGun()) return;
			const rc = new THREE.Raycaster(); rc.far = 2.5;
			rc.setFromCamera(new THREE.Vector2(0, 0), d.camera);
			const hit = rc.intersectObjects([this.pullButton, this.autoButton], false)[0];
			if (hit?.object === this.pullButton) this.pull(); else if (hit?.object === this.autoButton) this.toggleAuto();
		});
	}

	// ------------------------------------------------------------------ building
	private buildGround() {
		const grass = canvasTexture(512, (c, n) => {
			c.fillStyle = '#5d6b3a'; c.fillRect(0, 0, n, n);
			for (let i = 0; i < 9000; i++) {
				const g = 70 + Math.random() * 60;
				c.fillStyle = `rgba(${g * 0.8 | 0},${g + 20 | 0},${g * 0.45 | 0},${0.25 + Math.random() * 0.35})`;
				c.fillRect(Math.random() * n, Math.random() * n, 1 + Math.random() * 2, 2 + Math.random() * 5);
			}
		}, 1300); // ~2 m per tile
		const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95, color: 0xd8dccb }));
		ground.rotation.x = -Math.PI / 2;
		ground.position.set(0, 0, -500);
		ground.receiveShadow = true;
		ground.name = 'range-ground';
		this.root.add(ground);
		// a mown lane down the middle and the backstop berm
		const laneTex = grass.clone(); laneTex.repeat.set(30, 540);
		const lane = new THREE.Mesh(new THREE.PlaneGeometry(60, 1080), new THREE.MeshStandardMaterial({ map: laneTex, roughness: 0.95, color: 0xe6ebd8 }));
		lane.rotation.x = -Math.PI / 2; lane.position.set(0, 0.005, -540); lane.receiveShadow = true; lane.name = 'range-ground';
		this.root.add(lane);
		const dirt = new THREE.MeshStandardMaterial({ color: 0x7a6a52, roughness: 1 });
		const berm = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), dirt);
		berm.scale.set(140, 26, 30); berm.position.set(0, 0, -1080); berm.name = 'range-ground';
		this.root.add(berm);
		for (const side of [-1, 1]) {
			const wall = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), dirt);
			wall.scale.set(10, 5, 540); wall.position.set(side * 70, 0, -540); wall.name = 'range-ground';
			this.root.add(wall);
		}
	}

	private buildFiringLine() {
		const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b5ac, roughness: 0.85 });
		const wood = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.6 });
		const steel = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.8 });
		const pad = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 5), concrete);
		pad.position.set(0, 0.06, 1.2); pad.receiveShadow = true; pad.castShadow = true;
		this.root.add(pad);
		// roof on four posts
		for (const [x, z] of [[-3.8, -1.1], [3.8, -1.1], [-3.8, 3.5], [3.8, 3.5]]) {
			const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.8, 0.12), steel);
			post.position.set(x, 1.52, z); post.castShadow = true; this.root.add(post);
		}
		const roof = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.1, 5.2), new THREE.MeshStandardMaterial({ color: 0x6d7175, roughness: 0.7, metalness: 0.3 }));
		roof.position.set(0, 2.97, 1.2); roof.castShadow = true; roof.receiveShadow = true; this.root.add(roof);
		// bench with a sandbag rest
		const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.84), wood);
		top.position.set(0, 0.84, -0.2); top.castShadow = true; top.receiveShadow = true; this.root.add(top);
		this.benchTop.set(0, 0.87, -0.2);
		for (const [x, z] of [[-0.8, -0.55], [0.8, -0.55], [-0.8, 0.15], [0.8, 0.15]]) {
			const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), wood);
			leg.position.set(x, 0.48, z); leg.castShadow = true; this.root.add(leg);
		}
		const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.18, 6, 12), new THREE.MeshStandardMaterial({ color: 0x6b5d45, roughness: 1 }));
		bag.rotation.z = Math.PI / 2; bag.scale.set(1, 1, 0.75); bag.position.set(0.25, 0.92, -0.5); bag.castShadow = true;
		this.root.add(bag);
		// bench buttons and readout
		const btn = (color: number, x: number) => {
			const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.035, 24), new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 }));
			b.position.set(x, 0.89, 0.12); b.userData.noBullet = true;
			this.root.add(b);
			return b;
		};
		this.pullButton = btn(0x2fbf4a, -0.75);
		this.autoButton = btn(0xff9a1f, -0.6);
		this.boardCv.width = 512; this.boardCv.height = 256;
		this.boardTex = new THREE.CanvasTexture(this.boardCv); this.boardTex.colorSpace = THREE.SRGBColorSpace;
		const board = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false }));
		board.position.set(-0.55, 1.12, 0.2); board.rotation.x = -0.35; board.userData.noBullet = true;
		this.root.add(board);
		this.drawBoard();
	}

	private buildTrap() {
		const concrete = new THREE.MeshStandardMaterial({ color: 0x9c9890, roughness: 0.9 });
		const metal = new THREE.MeshStandardMaterial({ color: 0x2f5d3a, roughness: 0.45, metalness: 0.6 });
		const house = new THREE.Group();
		house.position.set(-2, 0, -15);
		const walls = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.6), concrete);
		walls.position.y = 0.4; walls.castShadow = true; walls.receiveShadow = true; walls.userData.noBullet = false;
		house.add(walls);
		// machine on top: base, turning head, spring arm and a stack of clays
		const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.12, 24), metal);
		base.position.y = 0.86; house.add(base);
		this.trapHead.position.y = 0.95; house.add(this.trapHead);
		const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.62), metal);
		plate.position.set(0, 0.03, -0.15); this.trapHead.add(plate);
		const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 20), this.clayMat);
		stack.position.set(0.18, 0.2, 0.12); this.trapHead.add(stack);
		this.trapArm.position.set(0, 0.06, 0.05); this.trapHead.add(this.trapArm);
		const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.55), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.7 }));
		arm.position.z = -0.27; this.trapArm.add(arm);
		house.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
		this.root.add(house);
		// a low wall in front of the house for the eye to read distance
		const sign = boardMesh('TRAP', 0.6, 0.22);
		sign.position.set(-2, 1.0, -14.15); this.root.add(sign);
	}

	private buildSteel() {
		const post = new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.6, metalness: 0.7 });
		const paint = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.55, metalness: 0.1 });
		// distance (m), plate diameter (m), lateral offset (m)
		const lines: [number, number, number][] = [[25, 0.2, -4], [25, 0.2, -2.6], [25, 0.2, -1.2], [50, 0.25, 3], [100, 0.3, -6], [200, 0.4, 7], [300, 0.5, -10], [500, 0.6, 12], [800, 0.8, -16], [1000, 1.0, 0]];
		for (const [dist, size, x] of lines) {
			const frame = new THREE.Group();
			frame.position.set(x, 0, -dist);
			const h = Math.max(1.0, size + 0.6), w = size + 0.5;
			for (const s of [-1, 1]) {
				const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025 + size * 0.02, 0.025 + size * 0.02, h, 8), post);
				p.position.set(s * w / 2, h / 2, 0); frame.add(p);
			}
			const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02 + size * 0.015, 0.02 + size * 0.015, w + 0.08, 8), post);
			bar.rotation.z = Math.PI / 2; bar.position.y = h; frame.add(bar);
			// plate hangs from two chains; pivot at the bar
			const pivot = new THREE.Group(); pivot.position.y = h; frame.add(pivot);
			const chainLen = h - size - 0.35;
			for (const s of [-1, 1]) {
				const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, chainLen, 6), post);
				ch.position.set(s * size * 0.3, -chainLen / 2, 0); pivot.add(ch);
			}
			const plate = new THREE.Mesh(new THREE.CylinderGeometry(size / 2, size / 2, 0.012, 40), paint);
			plate.rotation.x = Math.PI / 2;
			plate.position.y = -chainLen - size / 2;
			plate.name = 'steel-plate';
			pivot.add(plate);
			frame.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
			const steel: Steel = { plate: pivot, distance: dist, angle: 0, vel: 0, splashes: [] };
			plate.userData.onBulletHit = (hit: BulletHit) => this.steelHit(steel, plate, hit);
			this.steels.push(steel);
			// distance board in front
			const b = boardMesh(dist + ' m', 0.5 + dist / 500, 0.22 + dist / 1100);
			b.position.set(x - w / 2 - 0.4 - dist / 400, 0.4 + dist / 2000, -dist + 1.5);
			this.root.add(frame, b);
		}
	}

	private buildExit() {
		const frameM = new THREE.MeshStandardMaterial({ color: 0x3b3e44, roughness: 0.6 });
		const panelM = new THREE.MeshStandardMaterial({ color: 0xefede8, roughness: 0.4 });
		const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.35, 0.14), frameM); l.position.set(-0.5, 1.175, 0);
		const r = l.clone(); r.position.x = 0.5;
		const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.14), frameM); top.position.y = 2.3;
		const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.24, 0.045), panelM); panel.position.y = 1.13;
		this.exitDoor.add(l, r, top, panel);
		const sign = boardMesh('Studio', 0.6, 0.15); sign.position.set(0, 1.85, 0.03); this.exitDoor.add(sign);
		this.exitDoor.position.set(3.0, 0.12, 3.6);
		this.exitDoor.rotation.y = Math.PI;
		this.exitDoor.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
		this.root.add(this.exitDoor);
	}

	// ------------------------------------------------------------------ actions
	pull() {
		if (!this.active) return;
		const head = this.trapHead;
		head.rotation.y = (Math.random() - 0.5) * THREE.MathUtils.degToRad(50);
		this.armT = 0.0001;
		const clay = new THREE.Mesh(this.clayGeo, this.clayMat);
		clay.castShadow = true;
		head.updateMatrixWorld(true);
		const start = new THREE.Vector3(0, 0.1, -0.5).applyMatrix4(head.matrixWorld).sub(RANGE_ORIGIN);
		clay.position.copy(start);
		// ~27 m/s, 10-22 degrees up, away from the shooter
		const elev = THREE.MathUtils.degToRad(10 + Math.random() * 12);
		const dir = new THREE.Vector3(0, Math.sin(elev), -Math.cos(elev)).applyAxisAngle(new THREE.Vector3(0, 1, 0), head.rotation.y);
		const c: Clay = { mesh: clay, vel: dir.multiplyScalar(26 + Math.random() * 3), spin: 30 + Math.random() * 10, t: 0, dead: false, landed: 0 };
		clay.userData.onBulletHit = () => { this.breakClay(c); return true; };
		this.root.add(clay);
		this.clays.push(c);
		this.stats.thrown++;
		this.play('trap', head.getWorldPosition(new THREE.Vector3()), 0.9);
		this.drawBoard();
	}

	toggleAuto() { this.auto = !this.auto; this.autoT = 0.6; (this.autoButton.material as THREE.MeshStandardMaterial).emissiveIntensity = this.auto ? 1.2 : 0.25; this.drawBoard(); }

	private breakClay(c: Clay) {
		if (c.dead) return;
		c.dead = true;
		this.root.remove(c.mesh);
		this.stats.broken++;
		const at = c.mesh.position.clone();
		for (let i = 0; i < 14; i++) {
			const s = new THREE.Mesh(this.shardGeo, i % 4 === 0 ? new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.8, side: THREE.DoubleSide }) : this.clayMat);
			s.position.copy(at);
			s.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
			const v = c.vel.clone().multiplyScalar(0.6).add(new THREE.Vector3((Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9));
			this.root.add(s);
			this.shards.push({ mesh: s, vel: v, rot: new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20), t: 0 });
		}
		this.play('clay', at.clone().add(RANGE_ORIGIN), 1, 0.9 + Math.random() * 0.2, at.clone().add(RANGE_ORIGIN).distanceTo(this.d.camera.getWorldPosition(new THREE.Vector3())) / 343);
		this.lastLine = `Clay broken at ${Math.round(at.length())} m`;
		this.drawBoard();
	}

	private steelHit(s: Steel, plate: THREE.Mesh, hit: BulletHit) {
		// swing: a .338 at 1000 m still carries several hundred joules
		s.vel += Math.min(4, hit.speed * hit.cart.impulse / 900) * (Math.random() * 0.3 + 0.85);
		// lead splash on the paint
		const local = plate.worldToLocal(hit.point.clone());
		const splash = new THREE.Mesh(new THREE.CircleGeometry(0.02 + hit.cart.impulse * 0.002, 10), new THREE.MeshStandardMaterial({ color: 0x5a5d62, roughness: 0.7, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
		splash.position.set(local.x, 0.0065 * Math.sign(local.y || 1), local.z);
		splash.rotation.x = Math.sign(local.y || 1) > 0 ? -Math.PI / 2 : Math.PI / 2;
		splash.userData.noBullet = true;
		plate.add(splash);
		s.splashes.push(splash);
		if (s.splashes.length > 15) plate.remove(s.splashes.shift()!);
		const delay = hit.point.distanceTo(this.d.camera.getWorldPosition(new THREE.Vector3())) / 343;
		this.play('ring', hit.point, 1.4, 0.9 + s.distance / 4000, delay);
		this.stats.steel++;
		this.lastLine = `HIT ${s.distance} m`;
		this.drawBoard();
		return true;
	}

	private play(name: string, at: THREE.Vector3, vol: number, rate = 1, delay = 0) {
		const buf = this.audio[name];
		if (!buf) return;
		const go = () => {
			const v = this.voices.find((x) => !x.isPlaying) ?? this.voices[0];
			if (v.isPlaying) v.stop();
			v.setBuffer(buf); v.setVolume(vol); v.setPlaybackRate(rate);
			v.position.copy(at).sub(RANGE_ORIGIN);
			v.play();
		};
		if (delay > 0.02) setTimeout(go, delay * 1000); else go();
	}

	private drawBoard() {
		const c = this.boardCv.getContext('2d')!;
		c.fillStyle = '#101418'; c.fillRect(0, 0, 512, 256);
		c.fillStyle = '#9fe870'; c.font = '700 34px system-ui, sans-serif'; c.fillText(this.lastLine, 22, 58);
		c.fillStyle = '#d7dde4'; c.font = '500 26px system-ui, sans-serif';
		c.fillText(`Clays ${this.stats.broken} / ${this.stats.thrown}   Steel hits ${this.stats.steel}`, 22, 110);
		c.fillText(`AUTO ${this.auto ? 'ON' : 'off'}`, 22, 158);
		c.fillStyle = '#8b96a3'; c.font = '400 20px system-ui, sans-serif';
		c.fillText('Green: PULL   Orange: AUTO', 22, 212);
		this.boardTex.needsUpdate = true;
	}

	// ------------------------------------------------------------------ enter / leave
	enter() {
		if (this.active) return;
		const { scene, camera, renderer, sun, walk, desktop, xr } = this.d;
		this.saved = {
			bg: scene.background, bgRot: scene.backgroundRotation.clone(), env: scene.environment, fog: scene.fog, far: camera.far,
			bounds: walk.bounds.clone(), blockers: (walk as any).blockers.slice(),
			sunPos: sun.position.clone(), sunTarget: sun.target.position.clone(),
			hidden: [] as THREE.Object3D[],
			cam: camera.position.clone(),
		};
		for (const o of scene.children) {
			if (o === this.root || o === camera || o.name === 'xr-rig' || !o.visible) continue;
			if ((o as THREE.Light).isLight || o.type === 'Object3D' && sun.target === o || (o as THREE.Sprite).isSprite || (o as any).isAudio) continue;
			if (o.name.startsWith('gun-') || o.name === 'pistol' || o.name === 'decal' || o.userData.keepInRange) continue;
			if (this.d.gunProps.some((g) => g.prop.desc.object === o)) continue;
			o.visible = false; this.saved.hidden.push(o);
		}
		this.root.visible = true;
		scene.background = this.d.background;
		scene.backgroundRotation.set(0, this.d.backgroundRotation, 0);
		scene.fog = new THREE.Fog(0xc4ccd2, 250, 3800);
		camera.far = 5000; camera.updateProjectionMatrix();
		// the sun's shadow follows us to the firing line
		const off = RANGE_ORIGIN.clone().add(new THREE.Vector3(0, 0, 1)).sub(this.saved.sunTarget);
		sun.position.add(off); sun.target.position.add(off); sun.target.updateMatrixWorld();
		renderer.shadowMap.needsUpdate = true;
		walk.bounds.min.set(RANGE_ORIGIN.x - 60, RANGE_ORIGIN.z - 1060);
		walk.bounds.max.set(RANGE_ORIGIN.x + 60, RANGE_ORIGIN.z + 3.4);
		(walk as any).blockers = [new THREE.Box2(new THREE.Vector2(RANGE_ORIGIN.x - 0.9, RANGE_ORIGIN.z - 0.62), new THREE.Vector2(RANGE_ORIGIN.x + 0.9, RANGE_ORIGIN.z + 0.22))];
		// guns onto the bench
		desktop?.dropAll?.();
		xr?.releaseEverything?.();
		this.d.gunProps.forEach((g, i) => {
			const p = this.benchTop.clone().add(RANGE_ORIGIN).add(new THREE.Vector3(g.bolted ? 0.12 : -0.5 + i * 0.25, g.bolted ? 0.06 : 0.025, g.bolted ? -0.05 : 0.05));
			// lying on the left side (bolt / ejection port up), muzzle downrange
			const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
			this.d.physics.teleport(g.prop, p, q);
		});
		this.placePlayer(new THREE.Vector3(RANGE_ORIGIN.x, 0, RANGE_ORIGIN.z + 0.75), 0);
		this.active = true;
		this.drawBoard();
	}

	leave() {
		if (!this.active || !this.saved) return;
		const { scene, camera, renderer, sun, walk } = this.d;
		this.auto = false;
		for (const c of this.clays) this.root.remove(c.mesh);
		this.clays = [];
		this.saved.hidden.forEach((o: THREE.Object3D) => { o.visible = true; });
		this.root.visible = false;
		scene.background = this.saved.bg; scene.backgroundRotation.copy(this.saved.bgRot); scene.fog = this.saved.fog;
		camera.far = this.saved.far; camera.updateProjectionMatrix();
		sun.position.copy(this.saved.sunPos); sun.target.position.copy(this.saved.sunTarget); sun.target.updateMatrixWorld();
		renderer.shadowMap.needsUpdate = true;
		walk.bounds.copy(this.saved.bounds); (walk as any).blockers = this.saved.blockers;
		// back in the office by the door; the guns come home to the sideboard
		this.d.desktop?.dropAll?.();
		this.d.xr?.releaseEverything?.();
		this.d.gunProps.forEach((g, i) => {
			const home = g.bolted ? new THREE.Vector3(1.6, 0.05, 0.85) : new THREE.Vector3(1.96, 0.69, -0.62 - i * 0.0);
			this.d.physics.teleport(g.prop, home, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)));
		});
		this.placePlayer(new THREE.Vector3(1.5, 0, 1.55), Math.PI / 2);
		this.active = false;
		this.setHint('');
	}

	private placePlayer(feet: THREE.Vector3, yaw: number) {
		const { camera, renderer, desktop, xr } = this.d;
		if (renderer.xr.isPresenting && xr) {
			const rig = xr.rig;
			const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
			rig.position.set(0, 0, 0); rig.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw - e.y); rig.updateMatrixWorld(true);
			const h = camera.position.clone().applyMatrix4(rig.matrixWorld);
			rig.position.set(feet.x - h.x, feet.y, feet.z - h.z);
			rig.updateMatrixWorld(true);
		} else {
			camera.position.set(feet.x, feet.y + EYE, feet.z);
			if (desktop) { (desktop as any).yaw = yaw; (desktop as any).pitch = 0; }
		}
	}

	private nearExit() {
		const head = this.d.camera.getWorldPosition(new THREE.Vector3());
		const door = this.exitDoor.getWorldPosition(new THREE.Vector3());
		return Math.hypot(head.x - door.x, head.z - door.z) < 1.6;
	}

	private setHint(t: string) {
		if (t === this.hintText) return;
		this.hintText = t;
		this.hint.textContent = t; this.hint.style.display = t ? 'block' : 'none';
		const c = this.vrHintCv.getContext('2d')!;
		c.clearRect(0, 0, 1024, 256);
		if (t) {
			c.font = '600 40px system-ui, sans-serif';
			const w = Math.min(1000, c.measureText(t).width + 60);
			c.fillStyle = 'rgba(14,16,20,0.82)'; c.beginPath(); c.roundRect(512 - w / 2, 90, w, 76, 26); c.fill();
			c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, 512, 129);
		}
		this.vrHintTex.needsUpdate = true;
	}

	// ------------------------------------------------------------------ per frame
	update(dt: number) {
		if (!this.active) { this.vrHint.visible = false; return; }
		const xrOn = this.d.renderer.xr.isPresenting;
		// controller shortcuts: left stick click = PULL, right stick click = AUTO, A / X at the door = leave
		if (xrOn) {
			const ses = this.d.renderer.xr.getSession();
			for (const src of ses?.inputSources ?? []) {
				const gp = src.gamepad; if (!gp || src.hand) continue;
				const edge = (i: number) => { const k = src.handedness + i, now = !!gp.buttons[i]?.pressed, was = !!this.padPrev[k]; this.padPrev[k] = now; return now && !was; };
				const stick = edge(3), face = edge(4);
				if (stick) { if (src.handedness === 'left') this.pull(); else this.toggleAuto(); }
				if (face && this.nearExit() && !this.d.xr?.hands.some((h: any) => h.held)) this.leave();
				// fingertip poke on the bench buttons
			}
			for (const h of this.d.xr?.hands ?? []) {
				const tip = (h as any).visual?.indexTip?.();
				if (!tip) continue;
				for (const [b, fn] of [[this.pullButton, () => this.pull()], [this.autoButton, () => this.toggleAuto()]] as const) {
					const near = tip.distanceTo(b.getWorldPosition(new THREE.Vector3())) < 0.05;
					const key = 'poke' + b.uuid + (h as any).index;
					if (near && !this.padPrev[key]) fn();
					this.padPrev[key] = near;
				}
			}
		}
		this.vrHint.visible = xrOn && !!this.hintText;
		this.setHint(this.nearExit() ? (xrOn ? 'A · Back to the studio' : 'E · Back to the studio') : '');
		if (!this.active) return;
		// trap arm swing and auto throws
		if (this.armT > 0) { this.armT += dt; this.trapArm.rotation.y = -Math.sin(Math.min(1, this.armT / 0.18) * Math.PI) * 1.9; if (this.armT > 0.6) { this.armT = 0; this.trapArm.rotation.y = 0; } }
		if (this.auto) { this.autoT -= dt; if (this.autoT <= 0) { this.pull(); this.autoT = 3 + Math.random() * 1.5; } }
		// clays: drag, a little lift from the spin, gravity
		for (let i = this.clays.length - 1; i >= 0; i--) {
			const c = this.clays[i];
			c.t += dt;
			if (c.dead) { this.clays.splice(i, 1); continue; }
			if (c.landed > 0) { c.landed += dt; if (c.landed > 4) { this.root.remove(c.mesh); this.clays.splice(i, 1); } continue; }
			const sp = c.vel.length();
			c.vel.multiplyScalar(1 / (1 + 0.012 * sp * dt));
			c.vel.y -= (9.81 - Math.min(3, sp * 0.1)) * dt;
			c.mesh.position.addScaledVector(c.vel, dt);
			c.mesh.rotation.y += c.spin * dt;
			c.mesh.rotation.x = 0.15;
			if (c.mesh.position.y <= 0.02) { c.mesh.position.y = 0.02; c.landed = 0.001; }
		}
		for (let i = this.shards.length - 1; i >= 0; i--) {
			const s = this.shards[i];
			s.t += dt;
			if (s.mesh.position.y > 0.01) {
				s.vel.y -= 9.81 * dt; s.vel.multiplyScalar(1 - 0.6 * dt);
				s.mesh.position.addScaledVector(s.vel, dt);
				s.mesh.rotation.x += s.rot.x * dt; s.mesh.rotation.y += s.rot.y * dt;
			}
			if (s.t > 6) { this.root.remove(s.mesh); this.shards.splice(i, 1); }
		}
		// steel swings on its chains (damped pendulum)
		for (const s of this.steels) {
			if (Math.abs(s.vel) < 1e-4 && Math.abs(s.angle) < 1e-4) continue;
			s.vel += (-9.81 / 0.6 * Math.sin(s.angle) - 0.9 * s.vel) * dt;
			s.angle += s.vel * dt;
			s.plate.rotation.x = s.angle; // swings away from the shooter
		}
		this.d.renderer.shadowMap.needsUpdate = true;
	}
}

// ---------------------------------------------------------------------- helpers
function clayGeometry() {
	// a 110 mm clay: shallow dome with a rim, 25 mm high
	const pts = [new THREE.Vector2(0, 0.025), new THREE.Vector2(0.03, 0.024), new THREE.Vector2(0.045, 0.02), new THREE.Vector2(0.052, 0.012), new THREE.Vector2(0.055, 0.0), new THREE.Vector2(0.05, 0.0)];
	const g = new THREE.LatheGeometry(pts, 28);
	g.translate(0, -0.012, 0);
	return g;
}

function canvasTexture(n: number, draw: (c: CanvasRenderingContext2D, n: number) => void, repeat: number) {
	const cv = document.createElement('canvas'); cv.width = cv.height = n;
	draw(cv.getContext('2d')!, n);
	const t = new THREE.CanvasTexture(cv);
	t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
	t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
	return t;
}

function boardMesh(text: string, w: number, h: number) {
	const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * h / w);
	const c = cv.getContext('2d')!;
	c.fillStyle = '#f4f1e8'; c.fillRect(0, 0, cv.width, cv.height);
	c.strokeStyle = '#2a2a2a'; c.lineWidth = 10; c.strokeRect(5, 5, cv.width - 10, cv.height - 10);
	c.fillStyle = '#1b1b1b'; c.font = `700 ${Math.round(cv.height * 0.6)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
	c.fillText(text, cv.width / 2, cv.height / 2 + 4);
	const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
	const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
	m.castShadow = true;
	return m;
}

function synth(ac: BaseAudioContext, seconds: number, f: (t: number) => number) {
	const n = Math.round(ac.sampleRate * seconds), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
	for (let i = 0; i < n; i++) d[i] = Math.max(-1, Math.min(1, f(i / ac.sampleRate)));
	return b;
}
