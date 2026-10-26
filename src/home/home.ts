import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Physics } from '../physics/physics';
import type { ProjectFiles } from '../computer/projectFiles';
import { type House, type Item, type RoomId, kelvin } from './house';
import { buildRealHouse, readXRScan, frameFromFloor, scanToFrame, type Scan } from './realRoom';
import { Designer, STYLE_NAMES, styleOps, type Op, type StyleName } from './designer';
import { KIND_LIST } from './catalog';
import { PRESET_NAMES, dress, finishOf, setAnisotropy, setPassthroughMode } from './materials';
import { parse, type Intent, type IntentContext } from './intent';
import { buildDesignPrompt, readLines, DESIGN_MAX_OPS } from './homePrompt';
import { Voice } from './voice';
import { ControlCenter } from './controlCenter';
import { VRPanel } from './vrPanel';

/**
 * Home: your own room, scanned by your headset, redesigned by talking to it.
 *
 * There is no made-up house. The room comes from the headset's room scan
 * (AR HOME, see realRoom.ts) and is kept on this device, so you can also
 * walk around it and keep redesigning it on the desktop or in VR.
 *
 * The loop: words (voice or typed) -> intent (the fast local parser, or
 * Claude for anything it does not know) -> validated ops -> applied straight
 * to the running scene, a few per frame so the world keeps moving -> checked
 * -> one undo step -> saved. Every request is timed from the moment you stop
 * speaking to the first visible change and to the verified end.
 */
export const HOME_ORIGIN = new THREE.Vector3(8000, 0, 0);
const EYE = 1.62;
const SCAN_KEY = 'home.room.scan.v1', SAVE_KEY = 'home.room.design.v1', SNAP_KEY = 'home.room.snapshots.v1', ANCHOR_KEY = 'home.room.anchor.v1';

export interface Metric {
	id: number; text: string; source: 'voice' | 'typed' | 'button';
	path: 'local' | 'claude' | 'control' | '-';
	/** ms timestamps (performance.now) */
	tSpeechEnd?: number; tTranscript: number; tParsed?: number; tPlanFirst?: number; tPlanDone?: number; tFirstVisible?: number; tDone?: number;
	ops: number; verified?: boolean; outcome: string;
}
export interface Deps {
	scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer;
	walk: any; desktop: any; xr: any; physics: Physics | null; project: ProjectFiles | null;
}
type Sample = ((input: string, opts?: any) => Promise<{ text: string; truncated?: boolean }>) | null;

const shown = (o: THREE.Object3D | null) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export class Home {
	active = false;
	/** your room (null until it has been scanned) */
	house: House | null = null;
	designer!: Designer;
	readonly voice = new Voice();
	ui: ControlCenter;
	vr: VRPanel;
	metrics: Metric[] = [];
	/** status line, progress (0..1 or null), busy */
	status = { text: 'Say what you would like to change.', progress: null as number | null, busy: false };
	transcript = '';
	understood = '';
	question: Extract<Intent, { kind: 'question' }> | null = null;
	alts: { options: { label: string; op: Op }[]; style: StyleName; applied: number } | null = null;
	aimed: Item | null = null;
	room: RoomId = 'room';
	private last: string[] = [];
	private lastStyle?: StyleName;
	private recent: string[] = [];
	private job: { cancel: () => void } | null = null;
	private seq = 1;
	private colliders = new Map<string, any[]>();
	private saved: any = null;
	private highlight: THREE.BoxHelper;
	private ray = new THREE.Raycaster();
	private sample: Sample = null;
	private sampleChecked = false;
	private envTex: THREE.Texture | null = null;
	onChange: () => void = () => {};
	/**
	 * AR: your room through the headset's passthrough, read from the
	 * headset's room scan and kept in place by an anchor.
	 */
	ar: { session: XRSession; state: 'scanning' | 'noscan' | 'ready'; t0: number; anchor: XRAnchor | null; restoring: boolean; origin: THREE.Vector3 | null; yaw: number; scanInfo: string } | null = null;
	private scan: Scan | null = null;
	private tint: THREE.Mesh;

	constructor(private d: Deps) {
		setAnisotropy(Math.min(8, d.renderer.capabilities.getMaxAnisotropy()));
		this.highlight = new THREE.BoxHelper(new THREE.Object3D(), 0xffd166);
		this.highlight.visible = false; (this.highlight.material as THREE.LineBasicMaterial).depthTest = false; this.highlight.renderOrder = 10;
		this.highlight.userData.keepInHome = true; this.highlight.name = 'home-highlight';
		d.scene.add(this.highlight);
		// the light "mood" over your real room in AR: drawn first, so it only tints what the passthrough shows
		this.tint = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
			uniforms: { uColor: { value: new THREE.Color(0, 0, 0) }, uAlpha: { value: 0 } },
			vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
			fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; void main() { gl_FragColor = vec4(uColor * uAlpha, uAlpha); }',
			depthTest: false, depthWrite: false, blending: THREE.NoBlending,
		}));
		this.tint.frustumCulled = false; this.tint.renderOrder = -1000; this.tint.visible = false; this.tint.name = 'home-ar-tint'; this.tint.userData.keepInHome = true;
		d.camera.add(this.tint);
		this.scan = this.readSave(SCAN_KEY);
		this.voice.onFinal = (text, t) => this.submit(text, 'voice', t.speechEnd, t.final);
		this.voice.onChange = () => this.changed();
		this.ui = new ControlCenter(this);
		this.vr = new VRPanel(this, d);
		const w = window as any;
		if (w.claude?.use) Promise.resolve(w.claude.use('sample')).then((s: Sample) => { this.sample = s; this.sampleChecked = true; this.changed(); }, () => { this.sampleChecked = true; });
		else this.sampleChecked = true;
		addEventListener('keydown', (e) => this.key(e, true));
		addEventListener('keyup', (e) => this.key(e, false));
	}

	/** has your room been scanned (on this device)? */
	get hasScan() { return !!this.scan; }
	get roomName() { return this.house ? 'your room' : 'no room yet'; }

	// ------------------------------------------------------------------ your room
	/** (re)build your room from its scan and replay a saved design onto it */
	private build(data: any) {
		this.disposeHouse();
		if (!this.scan) return;
		const h = buildRealHouse(this.scan);
		this.house = h;
		if (this.ar) {
			// AR: the room frame lives in the XR reference space, i.e. under the rig
			(this.d.xr?.rig ?? this.d.scene).add(h.root);
			this.placeRealRoot();
		} else {
			h.root.position.copy(HOME_ORIGIN);
			this.d.scene.add(h.root);
		}
		h.root.visible = this.active;
		this.designer = new Designer(h);
		this.designer.onLight = () => this.updateTint();
		if (data?.ops) {
			const r = this.designer.load(data);
			if (r.skipped) this.status.text = `Restored your design (${r.skipped} change(s) no longer fit the room).`;
		}
		this.designer.onLayout = (it, gone) => { if (this.active && !this.ar) { this.updateCollider(it, gone || !h.items.has(it.id)); this.updateBlockers(); } };
		this.designer.onChange = () => { this.autosave(); this.d.renderer.shadowMap.needsUpdate = true; this.changed(); };
		this.applyPassthrough();
		if (this.active && !this.ar) { this.addColliders(); this.updateBlockers(); }
		this.updateTint();		this.prewarm();
	}
	/**
	 * Compile the shaders for every finish now, in the background, so the
	 * first "paint the walls" does not wait for the GPU to build one.
	 */
	private prewarm() {
		if (!this.house || !this.active) return;
		const g = new THREE.Group(), geo = new THREE.PlaneGeometry(0.01, 0.01);
		for (const preset of PRESET_NAMES) { if (preset === 'original') continue; const m = new THREE.Mesh(geo, dress({ preset })); m.receiveShadow = m.castShadow = true; g.add(m); }
		const done = () => { g.traverse((o) => { const m = o as THREE.Mesh; (m.material as THREE.Material | undefined)?.dispose(); }); geo.dispose(); };
		try { Promise.resolve(this.d.renderer.compileAsync(g, this.d.camera, this.d.scene)).then(done, done); } catch { done(); }
	}
	private disposeHouse() {
		if (!this.house) return;
		this.removeColliders();
		this.house.root.removeFromParent();
		this.house.root.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mm = m.material as THREE.Material | THREE.Material[] | undefined; for (const x of mm ? (Array.isArray(mm) ? mm : [mm]) : []) x.dispose(); });
		this.house = null; this.aimed = null; this.highlight.visible = false;
	}
	/** AR: unpainted surfaces and your real furniture are not drawn (you see the real ones); elsewhere they are plain */
	private applyPassthrough() {
		const on = !!this.ar;
		setPassthroughMode(on);
		if (!this.house) return;
		for (const it of this.house.items.values()) if (it.overlay) for (const sl of Object.values(it.slots)) { const f = finishOf(sl.mat); if (f) dress(f, sl.mat); }
		this.house.root.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m?.userData?.realBox) { m.colorWrite = !on; m.needsUpdate = true; } });
		this.d.renderer.shadowMap.needsUpdate = true;
	}
	private readSave(key: string) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; } }
	private write(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; /* storage off: still works this session */ } }
	private autosave() { if (this.house) this.write(SAVE_KEY, this.designer.serialize()); }
	snapshots(): Record<string, { at: number; data: any }> { return this.readSave(SNAP_KEY) ?? {}; }
	saveSnapshot(name: string) {
		if (!this.house) return false;
		const all = this.snapshots(); all[name] = { at: Date.now(), data: this.designer.serialize() };
		return this.write(SNAP_KEY, all) && this.write(SAVE_KEY, all[name].data);
	}
	restoreSnapshot(name: string) {
		const all = this.snapshots(), key = Object.keys(all).find((k) => k.toLowerCase() === name.toLowerCase()) ?? Object.keys(all).find((k) => k.toLowerCase().includes(name.toLowerCase()));
		if (!key || !this.scan) return null;
		this.build(all[key].data); this.autosave(); this.changed();
		return key;
	}
	deleteSnapshot(name: string) { const all = this.snapshots(); delete all[name]; this.write(SNAP_KEY, all); this.changed(); }
	/** back to your room as scanned: no paint, no added furniture */
	resetHome() { this.build(null); this.autosave(); this.changed(); }

	// ------------------------------------------------------------------ physics and walking (desktop / VR)
	private worldBox(c: THREE.Vector3, h: THREE.Vector3, obj: THREE.Object3D) {
		const p = c.clone().applyMatrix4(obj.matrixWorld);
		const rotY = new THREE.Euler().setFromQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
		return { center: p, half: h.clone().multiplyScalar(obj.getWorldScale(new THREE.Vector3()).x), rotationY: rotY };
	}
	/** furniture you bump into: your real furniture and the pieces you added */
	private itemBoxes(it: Item) {
		it.object.updateMatrixWorld(true);
		if ((it.fixed && it.kind !== 'real') || it.kind === 'rug' || it.mount === 'ceiling') return [];
		const half = new THREE.Vector3(it.half[0], it.height / 2, it.half[1]);
		return [this.worldBox(new THREE.Vector3(0, it.height / 2, 0), half, it.object)];
	}
	private addColliders() { if (!this.d.physics?.enabled || !this.house) return; for (const it of this.house.items.values()) this.updateCollider(it, false); }
	private removeColliders() { for (const list of this.colliders.values()) for (const c of list) this.d.physics?.removeStatic(c); this.colliders.clear(); }
	private updateCollider(it: Item, gone?: boolean) {
		const ph = this.d.physics; if (!ph?.enabled) return;
		for (const c of this.colliders.get(it.id) ?? []) ph.removeStatic(c);
		this.colliders.delete(it.id);
		if (gone) return;
		this.colliders.set(it.id, this.itemBoxes(it).map((b) => ph.addStatic(b)));
	}
	/** what the walking player bumps into: your furniture (the room's outline bounds the rest) */
	private updateBlockers() {
		const bl: THREE.Box2[] = [];
		for (const it of this.house?.items.values() ?? []) {
			if (it.mount === 'ceiling' || it.mount === 'wall') continue;
			for (const b of this.itemBoxes(it)) {
				if (b.center.y - b.half.y > 1.6 || b.center.y + b.half.y < 0.15) continue;
				const c = Math.abs(Math.cos(b.rotationY)), s = Math.abs(Math.sin(b.rotationY));
				const hx = c * b.half.x + s * b.half.z, hz = s * b.half.x + c * b.half.z;
				bl.push(new THREE.Box2(new THREE.Vector2(b.center.x - hx, b.center.z - hz), new THREE.Vector2(b.center.x + hx, b.center.z + hz)));
			}
		}
		this.d.walk.blockers = bl;
	}

	// ------------------------------------------------------------------ enter / leave
	/** hide the office and set up the room's light (shared by desktop / VR and AR) */
	private enterScene() {
		const { scene, camera, renderer, walk } = this.d;
		this.saved = {
			bg: scene.background, env: scene.environment, fog: scene.fog, envI: scene.environmentIntensity, far: camera.far, clear: renderer.getClearAlpha(),
			exposure: renderer.toneMappingExposure, bounds: walk.bounds.clone(), blockers: walk.blockers?.slice?.() ?? [], hidden: [] as THREE.Object3D[],
		};
		for (const o of scene.children) {
			if (o === this.house?.root || o === camera || o.name === 'xr-rig' || !o.visible) continue;
			if (/^hand-/.test(o.name) || o.userData.keepInHome) continue;
			o.visible = false; this.saved.hidden.push(o);
		}
		this.d.desktop?.dropAll?.(); this.d.xr?.releaseEverything?.();
		const pmrem = new THREE.PMREMGenerator(renderer);
		this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose();
		scene.environment = this.envTex; scene.environmentIntensity = 0.35;
		scene.background = new THREE.Color(0x2a2d31); scene.fog = null;
		camera.far = 400; camera.updateProjectionMatrix();
		renderer.toneMappingExposure = 1.0;
		this.active = true;
		this.ui.show(true); this.vr.show(true);
	}
	/** desktop / VR: walk around your scanned room. False when there is no scan yet. */
	enter(): boolean {
		if (this.active) return true;
		if (!this.scan) return false;
		this.enterScene();
		this.build(this.readSave(SAVE_KEY));
		this.walkHere();
		this.status.text = this.voice.supported ? 'Your room. Hold V (or click the microphone) and say what to change.' : 'Your room. Type what to change (press T), or use the buttons.';
		this.changed();
		return true;
	}
	/** walk bounds and colliders for your room at HOME_ORIGIN, and stand in a free spot in it */
	private walkHere() {
		const h = this.house; if (!h) return;
		const r = h.rooms.room, { walk } = this.d;
		walk.bounds.min.set(HOME_ORIGIN.x + r.x0 + 0.15, HOME_ORIGIN.z + r.z0 + 0.15); walk.bounds.max.set(HOME_ORIGIN.x + r.x1 - 0.15, HOME_ORIGIN.z + r.z1 - 0.15);
		this.addColliders(); this.updateBlockers();
		let x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2;
		outer: for (let rad = 0; rad < 4; rad += 0.2) for (let k = 0; k < 16; k++) {
			const px = x + Math.cos(k / 16 * Math.PI * 2) * rad, pz = z + Math.sin(k / 16 * Math.PI * 2) * rad;
			if (walk.ok(HOME_ORIGIN.x + px, HOME_ORIGIN.z + pz)) { x = px; z = pz; break outer; }
			if (rad === 0) break;
		}
		this.placePlayer(new THREE.Vector3(HOME_ORIGIN.x + x, 0, HOME_ORIGIN.z + z), 0);
		this.d.renderer.shadowMap.needsUpdate = true;
	}
	leave() {
		if (!this.active || !this.saved) return;
		if (this.ar) { const s = this.ar.session; this.exitAR(true); s.end().catch(() => {}); }
		const { scene, camera, renderer, walk } = this.d;
		this.cancel();
		this.voice.abort();
		this.removeColliders();
		if (this.house) this.house.root.visible = false;
		this.saved.hidden.forEach((o: THREE.Object3D) => { o.visible = true; });
		scene.background = this.saved.bg; scene.environment = this.saved.env; scene.fog = this.saved.fog; scene.environmentIntensity = this.saved.envI;
		camera.far = this.saved.far; camera.updateProjectionMatrix();
		renderer.toneMappingExposure = this.saved.exposure;
		renderer.setClearColor(0x000000, this.saved.clear ?? 1);
		walk.bounds.copy(this.saved.bounds); walk.blockers = this.saved.blockers;
		this.envTex?.dispose(); this.envTex = null;
		this.active = false;
		this.placePlayer(new THREE.Vector3(1.5, 0, 1.55), Math.PI / 2);
		renderer.shadowMap.needsUpdate = true;
		this.ui.show(false); this.vr.show(false); this.highlight.visible = false; this.aimed = null;
		this.changed();
	}
	private placePlayer(feet: THREE.Vector3, yaw: number) {
		const { camera, renderer, desktop, xr } = this.d;
		if (renderer.xr.isPresenting && xr) {
			const rig = xr.rig;
			const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
			rig.position.set(0, 0, 0); rig.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw - e.y); rig.updateMatrixWorld(true);
			const h = camera.position.clone().applyMatrix4(rig.matrixWorld);
			rig.position.set(feet.x - h.x, feet.y, feet.z - h.z); rig.updateMatrixWorld(true);
		} else {
			camera.position.set(feet.x, feet.y + EYE, feet.z);
			if (desktop) { desktop.yaw = yaw; desktop.pitch = 0; }
		}
	}

	// ------------------------------------------------------------------ AR: your room through the passthrough
	/** start AR with a session the page requested from a click (the request needs the click) */
	async enterAR(session: XRSession) {
		const { renderer, scene } = this.d;
		if (!this.active) this.enterScene();
		this.disposeHouse(); // rebuilt from the live scan, in the place it really is
		this.removeColliders(); this.d.walk.blockers = [];
		this.ar = { session, state: 'scanning', t0: performance.now(), anchor: null, restoring: false, origin: null, yaw: 0, scanInfo: '' };
		const ar = this.ar;
		// the room keeps its place between visits through a persistent anchor (where the browser has them)
		const uuid = this.readSave(ANCHOR_KEY) as string | null, restore = (session as any).restorePersistentAnchor;
		if (uuid && restore) {
			ar.restoring = true;
			Promise.resolve(restore.call(session, uuid)).then((a: XRAnchor) => { ar.anchor = a; }, () => { try { localStorage.removeItem(ANCHOR_KEY); } catch { /* */ } }).finally(() => { ar.restoring = false; });
		}
		session.addEventListener('end', () => { if (this.ar?.session === session) this.exitAR(false); });
		scene.background = null;
		renderer.setClearColor(0x000000, 0);
		if (this.d.xr) this.d.xr.seated = true; // you walk for real: no stick walking or snap turns
		setPassthroughMode(true);
		renderer.xr.setReferenceSpaceType('local-floor');
		await renderer.xr.setSession(session);
		this.status.text = 'Reading your room from the headset’s room scan…';
		this.changed();
	}
	/** AR ended: keep going with the scanned room on screen (or leave, when there is none) */
	private exitAR(leaving: boolean) {
		if (!this.ar) return;
		this.ar = null;
		this.tint.visible = false;
		if (this.d.xr) this.d.xr.seated = false;
		setPassthroughMode(false);
		this.disposeHouse();
		if (leaving) return;
		if (!this.scan) { this.leave(); return; }
		this.d.scene.background = new THREE.Color(0x2a2d31);
		this.d.renderer.setClearColor(0x000000, this.saved?.clear ?? 1);
		this.build(this.readSave(SAVE_KEY));
		this.walkHere();
		this.changed();
	}
	/** the room frame -> the room's root (in the XR reference space) */
	private placeRealRoot() {
		const ar = this.ar; if (!ar?.origin || !this.house) return;
		this.house.root.position.copy(ar.origin); this.house.root.rotation.set(0, ar.yaw, 0);
		this.house.root.updateMatrixWorld(true);
	}
	/** use the room just read from the headset's scan, and replay your saved design onto it */
	private useScan(scan: Scan, origin: THREE.Vector3, yaw: number) {
		const ar = this.ar; if (!ar) return;
		ar.origin = origin.clone(); ar.yaw = yaw; ar.state = 'ready';
		this.scan = scan; this.write(SCAN_KEY, scan);
		this.build(this.readSave(SAVE_KEY));
		const n = (l: string) => scan.objects.filter((o) => o.label === l).length;
		const things = [...new Set(scan.objects.map((o) => o.label))].map((l) => (n(l) > 1 ? `${n(l)} ${l}s` : `a ${l}`));
		const w = scan.walls.length || scan.floor.length, win = scan.openings.filter((o) => o.kind === 'window').length, doors = scan.openings.filter((o) => o.kind === 'door').length;
		ar.scanInfo = `Your room: ${w} walls${win ? `, ${win} window${win > 1 ? 's' : ''}` : ''}${doors ? `, ${doors} door${doors > 1 ? 's' : ''}` : ''}${things.length ? `, ${things.join(', ')}` : ''}.`;
		this.status.text = `${ar.scanInfo} Try “paint the walls sage green”, “oak floor”, or “add a plant beside the ${scan.objects[0]?.label ?? 'window'}”.`;
		this.d.renderer.shadowMap.needsUpdate = true;
		this.changed();
	}
	/** keep the frame where it is next time: an anchor at the room origin, made persistent if the browser can */
	private makeAnchor(frame: XRFrame, ref: XRReferenceSpace, origin: THREE.Vector3, yaw: number) {
		const ar = this.ar; if (!ar || !(frame as any).createAnchor) return;
		const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
		try {
			Promise.resolve((frame as any).createAnchor(new XRRigidTransform({ x: origin.x, y: origin.y, z: origin.z }, { x: q.x, y: q.y, z: q.z, w: q.w }), ref)).then((a: XRAnchor) => {
				if (this.ar !== ar) return;
				ar.anchor = a;
				(a as any).requestPersistentHandle?.().then((id: string) => this.write(ANCHOR_KEY, id), () => {});
			}, () => {});
		} catch { /* anchors not available: the frame comes from the scan each time */ }
	}
	/** read the room again (the design is kept and replayed) */
	arRescan() { const ar = this.ar; if (!ar) return; ar.state = 'scanning'; ar.t0 = performance.now(); this.status.text = 'Reading your room again…'; this.changed(); }
	/** no scan yet: start the headset's own room setup (Quest browser), then read it */
	arRoomSetup() {
		const ar = this.ar; if (!ar) return;
		const go = (ar.session as any).initiateRoomCapture;
		if (!go) { this.status.text = 'This browser cannot start the room setup. Set up your room in the headset’s settings (Space Setup), then press Rescan.'; this.changed(); return; }
		Promise.resolve(go.call(ar.session)).then(() => this.arRescan(), (e: Error) => { this.status.text = `Room setup did not start: ${e?.message ?? e}`; this.changed(); });
	}
	private arUpdate() {
		const ar = this.ar!, { renderer } = this.d;
		const frame = renderer.xr.getFrame(), ref = renderer.xr.getReferenceSpace();
		if (!frame || !ref) return;
		if (ar.state !== 'ready' && !ar.restoring) {
			const raw = readXRScan(frame, ref);
			if (raw) {
				let origin: THREE.Vector3 | null = null, yaw = 0;
				const pose = ar.anchor ? frame.getPose(ar.anchor.anchorSpace, ref) : null;
				if (pose) { const p = pose.transform.position, o = pose.transform.orientation; origin = new THREE.Vector3(p.x, raw.floorY, p.z); yaw = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w), 'YXZ').y; }
				if (!origin) { const f = frameFromFloor(raw.floor.map((q) => ({ x: q.x, z: q.z })), raw.floorY); origin = f.origin; yaw = f.yaw; }
				this.useScan(scanToFrame(raw, origin, yaw), origin, yaw);
				if (!ar.anchor) this.makeAnchor(frame, ref, origin, yaw);
			} else if (ar.state === 'scanning' && performance.now() - ar.t0 > 5000) {
				ar.state = 'noscan';
				this.status.text = (frame as any).detectedPlanes
					? 'Your headset has no room scan yet. Press “Scan room” to set one up (walls, windows, doors, furniture), then it appears here.'
					: 'This browser does not share the headset’s room scan, so your room cannot be read here. Use the Quest browser on a Quest 3 / 3S / Pro.';
				this.changed();
			}
		}
		if (ar.state === 'ready' && ar.anchor) {
			// the anchor may be refined as tracking improves: follow it
			const pose = frame.getPose(ar.anchor.anchorSpace, ref);
			if (pose && ar.origin) {
				const p = pose.transform.position;
				if (Math.hypot(p.x - ar.origin.x, p.z - ar.origin.z) > 0.002) { ar.origin.set(p.x, ar.origin.y, p.z); this.placeRealRoot(); }
			}
		}
		this.tint.visible = ar.state === 'ready';
	}
	/** warmth and brightness of your real room in AR: a tint over the passthrough (added furniture is lit for real) */
	private updateTint() {
		if (!this.house) return;
		const l = this.designer.light.room, u = (this.tint.material as THREE.ShaderMaterial).uniforms;
		const dark = THREE.MathUtils.clamp((1 - l.brightness) * 0.7, 0, 0.75), warm = THREE.MathUtils.clamp(Math.abs(l.warmth - 4500) / 2700 * 0.2, 0, 0.22);
		const a = 1 - (1 - dark) * (1 - warm);
		u.uAlpha.value = a;
		(u.uColor.value as THREE.Color).copy(kelvin(l.warmth)).multiplyScalar(a > 0 ? warm * (1 - dark) / a : 0);
	}

	// ------------------------------------------------------------------ per frame
	update(dt: number) {
		if (!this.active) return;
		if (this.ar) this.arUpdate();
		const h = this.house;
		if (h) {
			if (this.designer.update(dt)) this.d.renderer.shadowMap.needsUpdate = true;
			// what you are looking (or pointing) at
			const vrRay = this.vr.rightRay();
			if (vrRay) this.ray.set(vrRay.origin, vrRay.dir); else this.ray.setFromCamera(new THREE.Vector2(0, 0), this.d.camera);
			this.ray.far = 12;
			const hits = this.ray.intersectObject(h.root, true);
			let aimed: Item | null = null;
			for (const hit of hits) {
				if (hit.object === this.highlight || !shown(hit.object)) continue;
				for (let o: THREE.Object3D | null = hit.object; o && o !== h.root; o = o.parent) { const it = h.items.get(o.name); if (it) { aimed = it; break; } }
				if (aimed) break;
			}
			if (aimed !== this.aimed) {
				this.aimed = aimed;
				const show = !!aimed && !aimed.fixed;
				this.highlight.visible = show;
				if (show) this.highlight.setFromObject(aimed!.object);
				this.changed();
			} else if (aimed && this.highlight.visible) this.highlight.setFromObject(aimed.object);
		}
		this.vr.update(dt);
		this.ui.tick();
	}

	private key(e: KeyboardEvent, down: boolean) {
		if (!this.active || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
		if (e.code === 'KeyV' && !e.repeat) { if (down) this.voice.start(); else this.voice.stop(); return; }
		if (!down || e.repeat) return;
		if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); this.submit(e.shiftKey ? 'redo' : 'undo', 'button'); return; }
		if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); this.submit('redo', 'button'); return; }
		if (e.code === 'KeyT' || e.code === 'Enter') { e.preventDefault(); this.ui.focusInput(); return; }
		if (e.code === 'Escape' && this.status.busy) { this.cancel(); return; }
		if (e.code === 'KeyE' && !this.ar) { this.leave(); return; }
	}

	// ------------------------------------------------------------------ requests
	private ctx(): IntentContext {
		return {
			room: this.room, aimed: this.aimed?.id ?? null, last: this.last, lastStyle: this.lastStyle,
			items: [...(this.house?.items.values() ?? [])].map((i) => ({ id: i.id, kind: i.kind, room: i.room, name: i.name })), light: this.designer.light,
		};
	}

	/** a request in words: from the microphone, the text box or a button */
	async submit(text: string, source: Metric['source'], speechEnd?: number, final = performance.now()) {
		text = text.trim();
		if (!text) return;
		if (!this.house) { this.transcript = text; this.status.text = 'Your room has not been scanned yet: press AR HOME in the Quest browser on your headset.'; this.changed(); return; }
		this.transcript = text;
		const m: Metric = { id: this.seq++, text, source, path: '-', tSpeechEnd: speechEnd, tTranscript: final, ops: 0, outcome: '' };
		this.metrics.unshift(m); if (this.metrics.length > 40) this.metrics.pop();
		this.recent.push(text); if (this.recent.length > 6) this.recent.shift();
		let intent = parse(text, this.ctx());
		// answering a question ("the first one") or picking an alternative
		if (intent.kind === 'pick' && this.question) {
			const ch = this.question.choices[intent.index];
			if (ch) { intent = this.question.resume(ch.id); this.question = null; }
		} else if (this.question && intent.kind !== 'control') {
			// naming one of the choices ("the armchair")
			const ch = this.question.choices.find((c) => text.toLowerCase().includes(c.label.toLowerCase()));
			if (ch) { intent = this.question.resume(ch.id); }
			this.question = null;
		}
		m.tParsed = performance.now();
		await this.handle(intent, m, text);
		this.changed();
	}

	/** ops straight from a button, slider or picker (no words to parse) */
	async runOps(ops: Op[], label: string) {
		if (!this.house) return;
		const m: Metric = { id: this.seq++, text: label, source: 'button', path: 'local', tTranscript: performance.now(), ops: 0, outcome: '' };
		m.tParsed = m.tTranscript;
		this.metrics.unshift(m); if (this.metrics.length > 40) this.metrics.pop();
		this.understood = label;
		await this.applyOps(ops, label, m);
	}

	/** pick a question's choice or an alternative by clicking */
	choose(i: number) { this.submit(`option ${i + 1}`, 'button'); }

	private async handle(intent: Intent, m: Metric, text: string) {
		switch (intent.kind) {
			case 'control': return this.control(intent, m);
			case 'question':
				this.question = intent.choices.length ? intent : null;
				this.understood = intent.say; this.status.text = intent.say; m.path = 'local'; m.outcome = 'asked'; m.tDone = performance.now();
				this.voice.say(intent.say);
				return;
			case 'alternatives': {
				this.alts = { options: intent.options, style: intent.style, applied: -1 };
				this.understood = intent.say; this.status.text = intent.say; m.path = 'local'; m.outcome = 'options'; m.tDone = performance.now();
				this.voice.say('Here are three options. Say option one, two or three.');
				return;
			}
			case 'pick': {
				if (!this.alts) { this.status.text = 'There is nothing to choose from right now.'; m.outcome = 'nothing to pick'; m.tDone = performance.now(); return; }
				const o = this.alts.options[intent.index];
				if (!o) { this.status.text = `There are only ${this.alts.options.length} options.`; return; }
				// trying another option replaces the previous one
				if (this.alts.applied >= 0 && this.designer.undoLabel.startsWith('Option')) this.designer.undo();
				this.alts.applied = intent.index;
				this.understood = `Option ${intent.index + 1}: ${o.label}`;
				m.path = 'local';
				await this.applyOps([o.op], `Option ${intent.index + 1}: ${o.label.split(':')[0]}`, m);
				return;
			}
			case 'ops': {
				this.understood = intent.say; m.path = 'local';
				if (intent.style) this.lastStyle = intent.style;
				const ok = await this.applyOps(intent.ops, intent.say, m);
				if (ok) { this.last = intent.targets.length ? intent.targets : this.last; this.voice.say(intent.say.replace(/^(Making|Moving|Adding|Turning|Removing|Copying|Adjusting)/, (w) => w)); }
				return;
			}
			case 'claude': return this.askClaude(text, m);
		}
	}

	private control(c: Extract<Intent, { kind: 'control' }>, m: Metric) {
		m.path = 'control';
		const done = (s: string) => { this.status.text = s; this.understood = c.say; m.outcome = s; m.tFirstVisible = m.tDone = performance.now(); m.verified = true; this.voice.say(s); };
		if (c.action === 'undo') { const l = this.designer.undo(); return done(l ? `Undid: ${l}` : 'Nothing to undo'); }
		if (c.action === 'redo') { const l = this.designer.redo(); return done(l ? `Redid: ${l}` : 'Nothing to redo'); }
		if (c.action === 'cancel') { const was = !!this.job; this.cancel(); this.question = null; this.voice.abort(); return done(was ? 'Stopped. Nothing from that request was kept.' : 'OK'); }
		if (c.action === 'save') { const name = c.name ?? `Design ${new Date().toLocaleString()}`; return done(this.saveSnapshot(name) ? `Saved as "${name}"` : 'Could not save (storage is blocked here); your changes stay for this visit'); }
		if (c.action === 'restore') { const k = this.restoreSnapshot(c.name ?? ''); return done(k ? `Restored "${k}"` : `No saved design called "${c.name}"`); }
		if (c.action === 'listSaves') { const n = Object.keys(this.snapshots()); this.ui.openTab('designs'); return done(n.length ? `${n.length} saved: ${n.join(', ')}` : 'No saved designs yet. Say "save as" and a name.'); }
		if (c.action === 'reset') { this.saveSnapshot('Before reset'); this.resetHome(); return done('Back to your room as scanned (your previous design is saved as "Before reset")'); }
	}

	cancel() { this.job?.cancel(); this.job = null; }

	/**
	 * Apply ops as one transaction, a few at a time so the frame rate holds:
	 * the first change shows on the next frame, long plans show progress, and
	 * cancel rolls everything back.
	 */
	private async applyOps(ops: Op[], label: string, m: Metric): Promise<boolean> {
		// styles become their individual steps, so they can be spread over frames
		const flat = ops.flatMap((o) => (o.op === 'style' && !this.designer.validate(o) ? styleOps(this.designer, o) : [o]));
		const tx = this.designer.begin(label);
		let cancelled = false;
		this.job = { cancel: () => { cancelled = true; } };
		this.status.busy = true; this.status.progress = 0;
		let budget = performance.now();
		for (let i = 0; i < flat.length; i++) {
			if (cancelled) { tx.rollback(); this.finish(m, 'cancelled', false); return false; }
			const e = tx.apply(flat[i]);
			if (e) {
				// one bad step undoes the whole request: the home is never left half-changed
				tx.rollback();
				this.finish(m, `Could not do that: ${e}`, false); this.voice.say(`Sorry, ${e}`);
				return false;
			}
			m.ops++;
			if (m.tFirstVisible === undefined) this.markVisible(m);
			this.status.progress = (i + 1) / flat.length;
			this.status.text = `${label}… ${i + 1} / ${flat.length}`;
			if (performance.now() - budget > 8) { this.changed(); await nextFrame(); budget = performance.now(); }
		}
		const ok = tx.verify();
		const committed = tx.commit();
		this.finish(m, committed ? (ok ? `Done: ${label}` : `${label} (applied; check failed)`) : 'Nothing needed changing', ok);
		return committed;
	}
	private markVisible(m: Metric) { m.tFirstVisible = -1; requestAnimationFrame(() => requestAnimationFrame(() => { m.tFirstVisible = performance.now(); this.changed(); })); }
	private finish(m: Metric, outcome: string, verified: boolean) {
		m.outcome = outcome; m.verified = verified; m.tDone = performance.now();
		this.status.busy = false; this.status.progress = null; this.status.text = outcome; this.job = null;
		this.changed();
	}

	// ------------------------------------------------------------------ Claude
	get claudeBackend(): 'dev' | 'claude.ai' | null {
		if (this.d.project?.state === 'ready' && (this.d.project as any).agent) return 'dev';
		if (this.sample) return 'claude.ai';
		return null;
	}
	claudeNote() {
		const b = this.claudeBackend;
		if (b === 'dev') return 'Claude: via the dev server (the API key stays on the server)';
		if (b === 'claude.ai') return 'Claude: via claude.ai (asks your permission the first time)';
		if (!this.sampleChecked || this.d.project?.state === 'checking') return 'Claude: looking…';
		return 'Claude: not available here (everyday requests still work without it)';
	}
	private context() {
		if (!this.house) return '';
		const r2 = (v: number) => Math.round(v * 100) / 100;
		const house = this.house;
		const rooms = Object.values(house.rooms).map((r) => { const l = this.designer.light[r.id]; return `${r.id}: ${r2(r.x1 - r.x0)} x ${r2(r.z1 - r.z0)} m, x ${r.x0}..${r.x1}, z ${r.z0}..${r.z1}, light ${l.warmth} K brightness ${l.brightness} soft ${l.soft}, ${r.windows.length} windows`; });
		const items = [...house.items.values()].map((i) => {
			const parts = Object.entries(i.slots).map(([k, s]) => { const f = finishOf(s.mat); return `${k}=${f?.preset ?? '?'}${f?.color ? ' ' + f.color : ''}`; }).join(', ');
			const p = i.object.position;
			return `${i.id} | ${i.kind} | ${i.room} | ${i.fixed ? 'fixed' : `at ${r2(p.x)},${r2(p.z)} rot ${Math.round(THREE.MathUtils.radToDeg(i.object.rotation.y))}`} | ${parts}`;
		});
		return [`The person is in the ${this.room} room${this.aimed ? `, looking at ${this.aimed.id} (${this.aimed.name})` : ''}.`, 'ROOMS', ...rooms, 'OBJECTS (id | kind | room | place | parts)', ...items].join('\n');
	}

	/** open-ended requests: Claude plans, each op line is applied as it arrives */
	private async askClaude(text: string, m: Metric) {
		const be = this.claudeBackend;
		m.path = 'claude';
		if (!be) { this.finish(m, "I didn't understand that, and Claude is not available here. Try: “make the walls sage green”, “softer lighting”, “move the armchair beside the window”.", false); this.voice.say("Sorry, I didn't understand that."); return; }
		const prompt = buildDesignPrompt(text, this.context(), { presets: PRESET_NAMES, kinds: KIND_LIST, styles: STYLE_NAMES }, this.recent.slice(0, -1));
		const tx = this.designer.begin(`Claude: ${text.slice(0, 50)}`);
		const ac = new AbortController();
		let cancelled = false;
		this.job = { cancel: () => { cancelled = true; ac.abort(); } };
		this.status.busy = true; this.status.progress = null; this.status.text = 'Claude is thinking…';
		this.understood = 'Asking Claude…';
		this.changed();
		let read = 0, n = 0, skipped: string[] = [];
		const take = (chunk: string) => {
			const r = readLines(chunk, read); read = r.next;
			for (const item of r.items) {
				const o = item as any;
				if (m.tPlanFirst === undefined) m.tPlanFirst = performance.now();
				if (typeof o.say === 'string') { this.understood = o.say; this.changed(); continue; }
				if (cancelled || n >= DESIGN_MAX_OPS || !o.op) continue;
				const e = tx.apply(o as Op);
				if (e) { skipped.push(e); continue; }
				n++; m.ops++;
				if (m.tFirstVisible === undefined) this.markVisible(m);
				this.status.text = `Claude: ${n} change(s) so far…`; this.changed();
			}
		};
		try {
			let full = '';
			if (be === 'dev') { const r = await this.d.project!.design(prompt); full = r.text; }
			else {
				const r = await this.sample!(prompt, { cache: false, signal: ac.signal, modelTier: 'quick', onText: ({ text: t }: { text: string }) => { full = t; take(t); } });
				full = r.text;
			}
			if (cancelled) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
			take(full + '\n');
			m.tPlanDone = performance.now();
		} catch (e: any) {
			tx.rollback();
			const code = e?.code;
			this.finish(m, code === 'cancelled' || cancelled ? 'Stopped. Nothing from that request was kept.' : code === 'not_granted' ? 'Claude was not allowed for this page.' : code === 'rate_limited' ? 'Claude is busy right now; try again in a moment.' : `Claude could not answer: ${e?.message ?? e}`, false);
			if (code === 'not_granted' || code === 'sampling_disabled') this.sample = null;
			return;
		}
		const ok = tx.verify(), committed = tx.commit();
		const note = skipped.length ? ` (${skipped.length} step(s) skipped: ${skipped[0]})` : '';
		this.finish(m, committed ? `Done: ${this.understood}${note}` : `${this.understood || 'Claude made no changes'}${note}`, ok && committed);
		if (committed) this.voice.say(this.understood);
	}

	changed() { this.onChange(); this.ui?.invalidate(); this.vr?.invalidate(); }
}
