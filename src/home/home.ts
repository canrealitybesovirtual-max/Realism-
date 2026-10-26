import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Physics } from '../physics/physics';
import type { ProjectFiles } from '../computer/projectFiles';
import { buildHouse, type House, type Item, type RoomId, kelvin } from './house';
import { buildRealHouse, readXRScan, frameFromFloor, scanToFrame, tracedScan, type Scan } from './realRoom';
import { Designer, STYLE_NAMES, styleOps, type Op, type StyleName } from './designer';
import { KIND_LIST } from './catalog';
import { PRESET_NAMES, finishOf, setAnisotropy } from './materials';
import { parse, type Intent, type IntentContext } from './intent';
import { buildDesignPrompt, readLines, DESIGN_MAX_OPS } from './homePrompt';
import { Voice } from './voice';
import { ControlCenter } from './controlCenter';
import { VRPanel } from './vrPanel';

/**
 * Home: a house you redesign by talking to it, while you walk around in it.
 *
 * The loop: words (voice or typed) -> intent (the fast local parser, or
 * Claude for anything it does not know) -> validated ops -> applied straight
 * to the running scene, a few per frame so the world keeps moving -> checked
 * -> one undo step -> saved. Every request is timed from the moment you stop
 * speaking to the first visible change and to the verified end.
 */
export const HOME_ORIGIN = new THREE.Vector3(8000, 0, 0);
const EYE = 1.62;
const SAVE_KEY = 'home.design.v1', SNAP_KEY = 'home.snapshots.v1';
const REAL_SAVE_KEY = 'home.real.design.v1', REAL_SNAP_KEY = 'home.real.snapshots.v1', ANCHOR_KEY = 'home.real.anchor.v1';

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
	house!: House;
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
	room: RoomId = 'living';
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
	 * AR: your real home through the headset's passthrough. The room comes
	 * from the headset's room scan (or corners you trace), becomes a house the
	 * designer edits (paint the real walls and floor, add furniture around
	 * your real furniture), and keeps its place through an anchor.
	 */
	ar: {
		session: XRSession; state: 'scanning' | 'tracing' | 'ready'; t0: number;
		hit: XRHitTestSource | null; cursor: THREE.Vector3 | null; corners: THREE.Vector3[];
		anchor: XRAnchor | null; restoring: boolean; origin: THREE.Vector3 | null; yaw: number; scanInfo: string;
	} | null = null;
	/** which house is being edited: the model house, or your real room (AR) */
	mode: 'house' | 'real' = 'house';
	private scan: Scan | null = null;
	private stash: { house: House; designer: Designer } | null = null;
	private reticle: THREE.Mesh;
	private markers = new THREE.Group();
	private tint: THREE.Mesh;

	constructor(private d: Deps) {
		setAnisotropy(Math.min(8, d.renderer.capabilities.getMaxAnisotropy()));
		this.highlight = new THREE.BoxHelper(new THREE.Object3D(), 0xffd166);
		this.highlight.visible = false; (this.highlight.material as THREE.LineBasicMaterial).depthTest = false; this.highlight.renderOrder = 10;
		this.highlight.userData.keepInHome = true; this.highlight.name = 'home-highlight';
		d.scene.add(this.highlight);
		this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, depthTest: false }));
		this.reticle.visible = false; this.reticle.renderOrder = 12; this.reticle.userData.keepInHome = true; this.reticle.name = 'home-ar-reticle';
		this.markers.name = 'home-ar-corners';
		d.scene.add(this.reticle);
		// the light "mood" over your real room: drawn first, so it only tints what the passthrough shows
		this.tint = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
			uniforms: { uColor: { value: new THREE.Color(0, 0, 0) }, uAlpha: { value: 0 } },
			vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
			fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; void main() { gl_FragColor = vec4(uColor * uAlpha, uAlpha); }',
			depthTest: false, depthWrite: false, blending: THREE.NoBlending,
		}));
		this.tint.frustumCulled = false; this.tint.renderOrder = -1000; this.tint.visible = false; this.tint.name = 'home-ar-tint'; this.tint.userData.keepInHome = true;
		d.camera.add(this.tint);
		this.build(this.readSave(SAVE_KEY));
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

	// ------------------------------------------------------------------ the house
	/** (re)build the house and replay a saved design onto it */
	private build(data: any) {
		if (this.house) {
			this.removeColliders();
			this.house.root.removeFromParent();
			this.house.root.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mm = m.material as THREE.Material | THREE.Material[] | undefined; for (const x of mm ? (Array.isArray(mm) ? mm : [mm]) : []) x.dispose(); });
		}
		if (this.mode === 'real') {
			this.house = buildRealHouse(this.scan ?? { floor: [], height: 2.5, walls: [], openings: [], objects: [], source: 'test' });
			// the room frame lives in the XR reference space, i.e. under the rig
			const parent: THREE.Object3D = this.d.xr?.rig ?? this.d.scene;
			parent.add(this.house.root);
			this.placeRealRoot();
		} else {
			this.house = buildHouse();
			this.house.root.position.copy(HOME_ORIGIN);
			this.house.root.visible = this.active;
			this.d.scene.add(this.house.root);
		}
		this.designer = new Designer(this.house);
		this.designer.onLight = (r) => { if (this.mode === 'real' && r === 'living') this.updateTint(); };
		if (data?.ops) {
			const r = this.designer.load(data);
			if (r.skipped) this.status.text = `Restored your design (${r.skipped} change(s) no longer applied).`;
		}
		this.designer.onLayout = (it, gone) => { if (this.mode === 'house' && this.active) { this.updateCollider(it, gone || !this.house.items.has(it.id)); this.updateBlockers(); } };
		this.designer.onChange = () => { this.autosave(); this.d.renderer.shadowMap.needsUpdate = true; this.changed(); };
		if (this.active && this.mode === 'house') { this.addColliders(); this.updateBlockers(); }
		if (this.mode === 'real') this.updateTint();
	}
	private get saveKey() { return this.mode === 'real' ? REAL_SAVE_KEY : SAVE_KEY; }
	private get snapKey() { return this.mode === 'real' ? REAL_SNAP_KEY : SNAP_KEY; }
	private readSave(key: string) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; } }
	private autosave() { try { localStorage.setItem(this.saveKey, JSON.stringify(this.designer.serialize())); } catch { /* storage off: still works this session */ } }
	snapshots(): Record<string, { at: number; data: any }> { return this.readSave(this.snapKey) ?? {}; }
	saveSnapshot(name: string) {
		const all = this.snapshots(); all[name] = { at: Date.now(), data: this.designer.serialize() };
		try { localStorage.setItem(this.snapKey, JSON.stringify(all)); localStorage.setItem(this.saveKey, JSON.stringify(all[name].data)); return true; } catch { return false; }
	}
	restoreSnapshot(name: string) {
		const all = this.snapshots(), key = Object.keys(all).find((k) => k.toLowerCase() === name.toLowerCase()) ?? Object.keys(all).find((k) => k.toLowerCase().includes(name.toLowerCase()));
		if (!key) return null;
		this.build(all[key].data); this.autosave(); this.changed();
		return key;
	}
	deleteSnapshot(name: string) { const all = this.snapshots(); delete all[name]; try { localStorage.setItem(this.snapKey, JSON.stringify(all)); } catch { /* */ } this.changed(); }
	resetHome() { this.build(null); this.autosave(); this.changed(); }

	// ------------------------------------------------------------------ physics and walking
	private worldBox(c: THREE.Vector3, h: THREE.Vector3, obj: THREE.Object3D) {
		const p = c.clone().applyMatrix4(obj.matrixWorld);
		const rotY = new THREE.Euler().setFromQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
		return { center: p, half: h.clone().multiplyScalar(obj.getWorldScale(new THREE.Vector3()).x), rotationY: rotY };
	}
	private itemBoxes(it: Item) {
		it.object.updateMatrixWorld(true);
		if (it.boxes) return it.boxes.map((b) => ({ center: b.c.clone().add(HOME_ORIGIN), half: b.h.clone(), rotationY: 0 }));
		if (it.fixed || it.kind === 'rug' || it.mount === 'ceiling') return [];
		const half = new THREE.Vector3(it.half[0], it.height / 2, it.half[1]);
		return [this.worldBox(new THREE.Vector3(0, it.height / 2, 0), half, it.object)];
	}
	private addColliders() { if (!this.d.physics?.enabled) return; for (const it of this.house.items.values()) this.updateCollider(it, false); }
	private removeColliders() { for (const list of this.colliders.values()) for (const c of list) this.d.physics?.removeStatic(c); this.colliders.clear(); }
	private updateCollider(it: Item, gone?: boolean) {
		const ph = this.d.physics; if (!ph?.enabled) return;
		for (const c of this.colliders.get(it.id) ?? []) ph.removeStatic(c);
		this.colliders.delete(it.id);
		if (gone || it.door) return;
		this.colliders.set(it.id, this.itemBoxes(it).map((b) => ph.addStatic(b)));
	}
	/** what the walking player bumps into: walls, furniture on the floor, closed doors */
	private updateBlockers() {
		const bl: THREE.Box2[] = [];
		for (const it of this.house.items.values()) {
			if (it.kind === 'floor' || it.kind === 'ceiling' || it.kind === 'rug' || it.mount === 'ceiling' || it.mount === 'wall') continue;
			if (it.door) {
				if (it.door.open) continue;
				const p = it.object.position, x = p.x + HOME_ORIGIN.x;
				bl.push(new THREE.Box2(new THREE.Vector2(x, p.z - 0.06), new THREE.Vector2(x + 0.92, p.z + 0.06)));
				continue;
			}
			for (const b of this.itemBoxes(it)) {
				if (b.center.y - b.half.y > 1.6 || b.center.y + b.half.y < 0.15) continue; // lintels, sills under knee height count
				const c = Math.abs(Math.cos(b.rotationY)), s = Math.abs(Math.sin(b.rotationY));
				const hx = c * b.half.x + s * b.half.z, hz = s * b.half.x + c * b.half.z;
				bl.push(new THREE.Box2(new THREE.Vector2(b.center.x - hx, b.center.z - hz), new THREE.Vector2(b.center.x + hx, b.center.z + hz)));
			}
		}
		this.d.walk.blockers = bl;
	}

	// ------------------------------------------------------------------ enter / leave
	enter() {
		if (this.active) return;
		const { scene, camera, renderer, walk } = this.d;
		this.saved = {
			bg: scene.background, env: scene.environment, fog: scene.fog, envI: scene.environmentIntensity, far: camera.far,
			exposure: renderer.toneMappingExposure, bounds: walk.bounds.clone(), blockers: walk.blockers?.slice?.() ?? [], hidden: [] as THREE.Object3D[],
		};
		for (const o of scene.children) {
			if (o === this.house.root || o === camera || o.name === 'xr-rig' || !o.visible) continue;
			if (/^hand-/.test(o.name) || o.userData.keepInHome) continue;
			o.visible = false; this.saved.hidden.push(o);
		}
		this.d.desktop?.dropAll?.(); this.d.xr?.releaseEverything?.();
		this.house.root.visible = true;
		const pmrem = new THREE.PMREMGenerator(renderer);
		this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose();
		scene.environment = this.envTex; scene.environmentIntensity = 0.35;
		scene.background = new THREE.Color(0xbcd3e6); scene.fog = null;
		camera.far = 400; camera.updateProjectionMatrix();
		renderer.toneMappingExposure = 1.0;
		walk.bounds.min.set(HOME_ORIGIN.x + 0.1, HOME_ORIGIN.z - 10.4); walk.bounds.max.set(HOME_ORIGIN.x + 11.4, HOME_ORIGIN.z - 0.1);
		this.active = true;
		this.addColliders(); this.updateBlockers();
		const sp = this.house.spawn;
		this.placePlayer(new THREE.Vector3(HOME_ORIGIN.x + sp.x, 0, HOME_ORIGIN.z + sp.z), sp.yaw);
		renderer.shadowMap.needsUpdate = true;
		this.ui.show(true); this.vr.show(true);
		this.status.text = this.voice.supported ? 'Hold V (or click the microphone) and say what to change.' : 'Type what to change (press T), or use the buttons.';
		this.changed();
	}
	leave() {
		if (!this.active || !this.saved) return;
		if (this.ar) { const s = this.ar.session; this.exitAR(); s.end().catch(() => {}); }
		const { scene, camera, renderer, walk } = this.d;
		this.cancel();
		this.voice.abort();
		this.removeColliders();
		this.house.root.visible = false;
		this.saved.hidden.forEach((o: THREE.Object3D) => { o.visible = true; });
		scene.background = this.saved.bg; scene.environment = this.saved.env; scene.fog = this.saved.fog; scene.environmentIntensity = this.saved.envI;
		camera.far = this.saved.far; camera.updateProjectionMatrix();
		renderer.toneMappingExposure = this.saved.exposure;
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

	// ------------------------------------------------------------------ AR: your real home
	/** start AR with a session the page requested from a click (the request needs the click) */
	async enterAR(session: XRSession) {
		const { renderer, scene } = this.d;
		if (!this.active) this.enter();
		this.removeColliders(); this.d.walk.blockers = [];
		this.ar = { session, state: 'scanning', t0: performance.now(), hit: null, cursor: null, corners: [], anchor: null, restoring: false, origin: null, yaw: 0, scanInfo: '' };
		const ar = this.ar;
		session.requestReferenceSpace('viewer').then((vs) => session.requestHitTestSource?.({ space: vs })).then((src) => { if (src) ar.hit = src; }).catch(() => { /* no hit test: the controller ray meets the floor instead */ });
		// the room keeps its place between visits through a persistent anchor (where the browser has them)
		const uuid = this.readSave(ANCHOR_KEY) as string | null, restore = (session as any).restorePersistentAnchor;
		if (uuid && restore) {
			ar.restoring = true;
			Promise.resolve(restore.call(session, uuid)).then((a: XRAnchor) => { ar.anchor = a; }, () => { try { localStorage.removeItem(ANCHOR_KEY); } catch { /* */ } }).finally(() => { ar.restoring = false; });
		}
		session.addEventListener('end', () => { if (this.ar?.session === session) this.exitAR(); });
		// phones: tapping the screen is the trigger
		session.addEventListener('select', (e: XRInputSourceEvent) => { if (e.inputSource.targetRayMode === 'screen') this.arTap(); });
		scene.background = null;
		this.saved.clear = renderer.getClearAlpha();
		renderer.setClearColor(0x000000, 0);
		if (this.d.xr) this.d.xr.seated = true; // you walk for real: no stick walking or snap turns
		// put the model house away and edit your room instead
		this.house.root.visible = false;
		this.stash = { house: this.house, designer: this.designer };
		this.house = undefined as any;
		this.mode = 'real'; this.scan = null; this.room = 'living';
		this.build(null);
		(this.d.xr?.rig ?? scene).add(this.markers);
		renderer.xr.setReferenceSpaceType('local-floor');
		await renderer.xr.setSession(session);
		this.status.text = 'Reading your room from the headset’s room scan…';
		this.changed();
	}
	private exitAR() {
		if (!this.ar) return;
		this.ar.hit?.cancel();
		this.ar = null;
		this.reticle.visible = false; this.tint.visible = false;
		this.markers.clear(); this.markers.removeFromParent();
		if (this.stash) {
			this.removeColliders();
			this.house.root.removeFromParent();
			this.house.root.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mm = m.material as THREE.Material | THREE.Material[] | undefined; for (const x of mm ? (Array.isArray(mm) ? mm : [mm]) : []) x.dispose(); });
			this.house = this.stash.house; this.designer = this.stash.designer; this.stash = null;
		}
		this.mode = 'house'; this.scan = null;
		if (this.d.xr) this.d.xr.seated = false;
		if (this.active) {
			this.house.root.visible = true;
			this.d.scene.background = new THREE.Color(0xbcd3e6);
			this.d.renderer.setClearColor(0x000000, this.saved?.clear ?? 1);
			this.addColliders(); this.updateBlockers();
			const sp = this.house.spawn;
			this.placePlayer(new THREE.Vector3(HOME_ORIGIN.x + sp.x, 0, HOME_ORIGIN.z + sp.z), sp.yaw);
		}
		this.changed();
	}
	/** the room frame -> the real house's root (in the XR reference space) */
	private placeRealRoot() {
		const ar = this.ar; if (!ar?.origin || this.mode !== 'real') return;
		this.house.root.position.copy(ar.origin); this.house.root.rotation.set(0, ar.yaw, 0);
		this.house.root.updateMatrixWorld(true);
	}
	/** use a room (scanned or traced) and replay your saved design onto it */
	useScan(scan: Scan, origin: THREE.Vector3, yaw: number) {
		const ar = this.ar; if (!ar) return;
		ar.origin = origin.clone(); ar.yaw = yaw; ar.state = 'ready'; ar.corners = []; this.markers.clear(); this.reticle.visible = false;
		this.scan = scan;
		this.build(this.readSave(this.saveKey));
		const n = (l: string) => scan.objects.filter((o) => o.label === l).length;
		const things = [...new Set(scan.objects.map((o) => o.label))].map((l) => (n(l) > 1 ? `${n(l)} ${l}s` : `a ${l}`));
		const w = scan.walls.length || scan.floor.length, win = scan.openings.filter((o) => o.kind === 'window').length;
		ar.scanInfo = `${scan.source === 'traced' ? 'Traced' : 'Scanned'}: ${w} walls${win ? `, ${win} window${win > 1 ? 's' : ''}` : ''}${things.length ? `, ${things.join(', ')}` : ''}.`;
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
				(a as any).requestPersistentHandle?.().then((id: string) => { try { localStorage.setItem(ANCHOR_KEY, JSON.stringify(id)); } catch { /* */ } }, () => {});
			}, () => {});
		} catch { /* anchors not available: the frame comes from the scan each time */ }
	}
	/** trigger / screen tap in AR: add a traced corner (or close the outline) */
	arTap() {
		const ar = this.ar; if (!ar || ar.state !== 'tracing' || !ar.cursor) return false;
		if (ar.corners.length >= 3 && ar.cursor.distanceTo(ar.corners[0]) < 0.3) { this.arTraceDone(); return true; }
		ar.corners.push(ar.cursor.clone());
		const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0x7fd67f }));
		pole.position.copy(ar.cursor).setY(ar.cursor.y + 0.25); this.markers.add(pole);
		if (ar.corners.length > 1) {
			const a = ar.corners[ar.corners.length - 2], b = ar.cursor;
			const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a.clone().setY(a.y + 0.01), b.clone().setY(b.y + 0.01)]), new THREE.LineBasicMaterial({ color: 0x7fd67f }));
			this.markers.add(line);
		}
		this.status.text = `${ar.corners.length} corner${ar.corners.length > 1 ? 's' : ''}. ${ar.corners.length >= 3 ? 'Next corner, or the first one again (or Done) to finish.' : 'Next corner.'}`;
		this.changed();
		return true;
	}
	arTraceDone() {
		const ar = this.ar; if (!ar || ar.corners.length < 3) return;
		const t = tracedScan(ar.corners);
		this.useScan(t.scan, t.origin, t.yaw);
		const frame = this.d.renderer.xr.getFrame(), ref = this.d.renderer.xr.getReferenceSpace();
		if (frame && ref && !ar.anchor) this.makeAnchor(frame, ref, t.origin, t.yaw);
	}
	arUndoCorner() { const ar = this.ar; if (!ar || !ar.corners.length) return; ar.corners.pop(); this.markers.remove(...this.markers.children.slice(-2)); this.changed(); }
	/** read the room again (the design is kept and replayed) */
	arRescan() { const ar = this.ar; if (!ar) return; ar.state = 'scanning'; ar.t0 = performance.now(); ar.corners = []; this.markers.clear(); this.status.text = 'Reading your room again…'; this.changed(); }
	arTrace() { const ar = this.ar; if (!ar) return; ar.state = 'tracing'; ar.corners = []; this.markers.clear(); this.status.text = 'Trace your floor: point at each corner and pull the trigger. Finish at the first corner, or press Done.'; this.changed(); }
	private arUpdate() {
		const ar = this.ar!, { renderer } = this.d;
		const frame = renderer.xr.getFrame(), ref = renderer.xr.getReferenceSpace();
		if (!frame || !ref) return;
		if (ar.state === 'scanning' && !ar.restoring) {
			const raw = readXRScan(frame, ref);
			if (raw) {
				let origin: THREE.Vector3 | null = null, yaw = 0;
				const pose = ar.anchor ? frame.getPose(ar.anchor.anchorSpace, ref) : null;
				if (pose) { const p = pose.transform.position, o = pose.transform.orientation; origin = new THREE.Vector3(p.x, raw.floorY, p.z); yaw = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w), 'YXZ').y; }
				if (!origin) { const f = frameFromFloor(raw.floor.map((q) => ({ x: q.x, z: q.z })), raw.floorY); origin = f.origin; yaw = f.yaw; }
				this.useScan(scanToFrame(raw, origin, yaw), origin, yaw);
				if (!ar.anchor) this.makeAnchor(frame, ref, origin, yaw);
			} else if (performance.now() - ar.t0 > ((frame as any).detectedPlanes ? 6000 : 1500)) {
				this.arTrace();
				this.status.text = `${(frame as any).detectedPlanes ? 'The headset has no room scan yet (set one up in its Space Setup for walls and furniture), so' : 'This browser cannot share the room scan, so'} trace your floor: point at each corner and pull the trigger; finish at the first corner or press Done.`;
			}
		}
		if (ar.state === 'tracing') {
			// where you point on the floor: hit test, else the controller ray meeting the floor
			let p: THREE.Vector3 | null = null;
			const hit = ar.hit ? frame.getHitTestResults(ar.hit)[0]?.getPose(ref) : null;
			if (hit && hit.transform.position.y < 0.4) p = new THREE.Vector3(hit.transform.position.x, hit.transform.position.y, hit.transform.position.z);
			const right = (this.d.xr?.hands ?? []).find((h: any) => h.source?.handedness === 'right');
			if (right?.source) {
				const rig: THREE.Object3D = this.d.xr.rig, inv = rig.matrixWorld.clone().invert();
				const m = right.ray.matrixWorld.clone().premultiply(inv);
				const o = new THREE.Vector3().setFromMatrixPosition(m), dir = new THREE.Vector3(0, 0, -1).transformDirection(m);
				if (dir.y < -0.05) { const t = -o.y / dir.y; if (t < 12) p = o.addScaledVector(dir, t); }
			}
			ar.cursor = p;
			if (p) {
				const near = ar.corners.length >= 3 && p.distanceTo(ar.corners[0]) < 0.3;
				this.reticle.position.copy(p).applyMatrix4(this.d.xr.rig.matrixWorld).setY(this.reticle.position.y + 0.005);
				(this.reticle.material as THREE.MeshBasicMaterial).color.set(near ? 0x7fd67f : 0xffd166);
			}
			this.reticle.visible = !!p;
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
	/** warmth and brightness of your real room: a tint over the passthrough (virtual furniture is lit for real) */
	private updateTint() {
		const l = this.designer.light.living, u = (this.tint.material as THREE.ShaderMaterial).uniforms;
		const dark = THREE.MathUtils.clamp((1 - l.brightness) * 0.7, 0, 0.75), warm = THREE.MathUtils.clamp(Math.abs(l.warmth - 4500) / 2700 * 0.2, 0, 0.22);
		const a = 1 - (1 - dark) * (1 - warm);
		u.uAlpha.value = a;
		(u.uColor.value as THREE.Color).copy(kelvin(l.warmth)).multiplyScalar(a > 0 ? warm * (1 - dark) / a : 0);
	}

	// ------------------------------------------------------------------ per frame
	update(dt: number) {
		if (!this.active) return;
		if (this.designer.update(dt)) this.d.renderer.shadowMap.needsUpdate = true;
		const cam = new THREE.Vector3(); this.d.camera.getWorldPosition(cam);
		const lx = cam.x - HOME_ORIGIN.x, lz = cam.z - HOME_ORIGIN.z;
		if (this.ar) { this.arUpdate(); if (this.room !== 'living') { this.room = 'living'; this.changed(); } }
		else for (const r of Object.values(this.house.rooms)) if (lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1) { if (this.room !== r.id) { this.room = r.id; this.changed(); } }
		// what you are looking (or pointing) at
		const vrRay = this.vr.rightRay();
		if (vrRay) this.ray.set(vrRay.origin, vrRay.dir); else this.ray.setFromCamera(new THREE.Vector2(0, 0), this.d.camera);
		this.ray.far = 12;
		const hits = this.ray.intersectObject(this.house.root, true);
		let aimed: Item | null = null;
		for (const h of hits) {
			if (h.object === this.highlight || !shown(h.object)) continue;
			for (let o: THREE.Object3D | null = h.object; o && o !== this.house.root; o = o.parent) { const it = this.house.items.get(o.name); if (it) { aimed = it; break; } }
			if (aimed) break;
		}
		if (aimed !== this.aimed) {
			this.aimed = aimed;
			const show = !!aimed && !aimed.fixed;
			this.highlight.visible = show;
			if (show) this.highlight.setFromObject(aimed!.object);
			this.changed();
		} else if (aimed && this.highlight.visible) this.highlight.setFromObject(aimed.object);
		this.vr.update(dt);
		this.ui.tick();
	}

	/** near the front door (to go back to the studio)? */
	nearExit() {
		const d = this.house.items.get('door.front'); if (!d) return false;
		const cam = new THREE.Vector3(); this.d.camera.getWorldPosition(cam);
		return Math.hypot(cam.x - HOME_ORIGIN.x - (d.object.position.x + 0.46), cam.z - HOME_ORIGIN.z - d.object.position.z) < 1.6;
	}

	private key(e: KeyboardEvent, down: boolean) {
		if (!this.active || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
		if (e.code === 'KeyV' && !e.repeat) { if (down) this.voice.start(); else this.voice.stop(); return; }
		if (!down || e.repeat) return;
		if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); this.submit(e.shiftKey ? 'redo' : 'undo', 'button'); return; }
		if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); this.submit('redo', 'button'); return; }
		if (e.code === 'KeyT' || e.code === 'Enter') { e.preventDefault(); this.ui.focusInput(); return; }
		if (e.code === 'Escape' && this.status.busy) { this.cancel(); return; }
		if (e.code === 'KeyE') {
			if (this.nearExit()) { this.leave(); return; }
			if (this.aimed?.door && !this.aimed.door.exit) this.submit(this.aimed.door.open ? 'close the door' : 'open the door', 'button');
		}
	}

	// ------------------------------------------------------------------ requests
	private ctx(): IntentContext {
		return {
			room: this.room, aimed: this.aimed?.id ?? null, last: this.last, lastStyle: this.lastStyle,
			items: [...this.house.items.values()].map((i) => ({ id: i.id, kind: i.kind, room: i.room, name: i.name })), light: this.designer.light,
		};
	}

	/** a request in words: from the microphone, the text box or a button */
	async submit(text: string, source: Metric['source'], speechEnd?: number, final = performance.now()) {
		text = text.trim();
		if (!text) return;
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
		if (c.action === 'reset') { this.saveSnapshot('Before reset'); this.resetHome(); return done('Back to the original home (your previous design is saved as "Before reset")'); }
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
		const r2 = (v: number) => Math.round(v * 100) / 100;
		const rooms = Object.values(this.house.rooms).map((r) => { const l = this.designer.light[r.id]; return `${r.id}: ${r2(r.x1 - r.x0)} x ${r2(r.z1 - r.z0)} m, x ${r.x0}..${r.x1}, z ${r.z0}..${r.z1}, light ${l.warmth} K brightness ${l.brightness} soft ${l.soft}, ${r.windows.length} windows`; });
		const items = [...this.house.items.values()].map((i) => {
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
