import * as THREE from 'three';
import type { Entity, EntityWorld } from './entities';
import type { Runtime, Mode } from './runtime';
import type { Physics, Prop } from '../physics/physics';
import { COMPONENTS, type GameCtx, type State } from './components';
import { GraphRunner, type GraphAPI, type GraphDoc } from './graph';
import type { BulletHit } from '../world/gunEffects';
import { log } from './log';
import { checkScript, errorLine, makeFactory, makeGuard, type Hook, type Hooks, type ScriptDoc } from './scripts';

/**
 * Runs components and script graphs while the game plays.
 *
 * Play from edit starts everything fresh (component start(), On Start).
 * Stop puts back everything gameplay changed - transforms, visibility,
 * colours, light levels - and removes gameplay copies, so playing never
 * alters the authored scene. Editing a component or a graph while playing
 * applies at once: data edits are read live; adding / removing a component or
 * changing a graph restarts just that part (hot reload).
 */
interface Inst { e: Entity; type: string; s: State }
/** one Script component running on one entity */
interface ScriptInst { e: Entity; doc: ScriptDoc; hooks: Hooks; failed: boolean; ms: number }
export interface ScriptProblem { script: string; entity: string; line: number | null; message: string; t: number }
interface Touched { trs: [THREE.Vector3, THREE.Quaternion, THREE.Vector3]; visible: boolean; colors: [THREE.Color, string][]; lights: [THREE.Light, number][] }

export class Gameplay {
	readonly graphs = new Map<string, GraphDoc>();
	readonly inventory = new Map<string, number>();
	readonly scripts = new Map<string, ScriptDoc>();
	/** api.state per entity+script, kept across hot reloads (cleared on Play from edit) */
	private scriptState = new Map<string, Record<string, unknown>>();
	scriptInsts: ScriptInst[] = [];
	/** runtime errors from scripts, newest last (the Code app shows them by line) */
	readonly scriptProblems: ScriptProblem[] = [];
	private guard = makeGuard();
	private insts: Inst[] = [];
	runners: GraphRunner[] = [];
	private touched = new Map<Entity, Touched>();
	private copies: { e: Entity; prop?: Prop }[] = [];
	private timers: { t: number; fn: () => void }[] = [];
	private running = false;
	private voices: THREE.PositionalAudio[] = [];
	private hitHooks = new Map<THREE.Object3D, unknown>();
	time = 0;
	/** called when a graph runner logs (Log node) - shown in the console */
	onLog: (m: string) => void = (m) => log.info(m);

	constructor(private w: EntityWorld, private physics: Physics | null, runtime: Runtime, private player: () => THREE.Vector3, listener: THREE.AudioListener | null) {
		runtime.listeners.push((m, prev) => this.onMode(m, prev));
		if (listener) for (let i = 0; i < 4; i++) { const v = new THREE.PositionalAudio(listener); v.setRefDistance(2); w.scene.add(v); this.voices.push(v); }
	}

	private onMode(m: Mode, prev: Mode) {
		if (m === 'play' && (prev === 'edit' || !this.running)) this.start();
		if (m === 'edit') this.stop();
	}

	// ------------------------------------------------------------------ lifecycle
	start() {
		this.stop();
		this.running = true;
		this.time = 0;
		this.inventory.clear();
		this.scriptState.clear();
		for (const e of this.w.list) {
			if (e.deleted) continue;
			for (const c of e.components) this.startComponent(e, c.type);
		}
		this.buildRunners();
		this.buildScripts();
		for (const r of this.runners) r.fire('start', 0, 0);
	}

	private startComponent(e: Entity, type: string) {
		const def = COMPONENTS.get(type);
		if (!def) return;
		this.touch(e);
		const inst: Inst = { e, type, s: {} };
		this.insts.push(inst);
		try { def.start?.(e, this.data(e, type), inst.s, this.ctx(0)); } catch (err) { log.error(`${e.name} › ${def.label}: ${(err as Error).message}`); }
		if (def.hit) this.hookHits(e);
	}

	private hookHits(e: Entity) {
		if (this.hitHooks.has(e.object)) return;
		this.hitHooks.set(e.object, e.object.userData.onBulletHit);
		const prev = e.object.userData.onBulletHit;
		e.object.userData.onBulletHit = (h: BulletHit) => { this.hit(e, h); return prev ? prev(h) : false; };
	}

	private buildRunners() {
		this.runners = [];
		for (const e of this.w.list) {
			if (e.deleted) continue;
			for (const c of e.components) {
				if (c.type !== 'Graph') continue;
				const g = this.graphs.get(String(c.data.graph));
				if (!g) { if (c.data.graph) log.warn(`${e.name}: graph "${c.data.graph}" not found`); continue; }
				this.runners.push(new GraphRunner(g, e.id, this.api(), (m) => log.error(m)));
			}
		}
	}

	stop() {
		if (!this.running && !this.touched.size && !this.copies.length) return;
		this.running = false;
		this.insts = [];
		this.runners = [];
		this.scriptInsts = [];
		this.timers = [];
		for (const [o, prev] of this.hitHooks) o.userData.onBulletHit = prev;
		this.hitHooks.clear();
		for (const c of this.copies) {
			c.e.object.parent?.remove(c.e.object);
			if (c.prop) this.physics?.setPropEnabled(c.prop, false);
			this.w.remove(c.e);
		}
		this.copies = [];
		for (const [e, t] of this.touched) {
			if (!e.prop) { e.object.position.copy(t.trs[0]); e.object.quaternion.copy(t.trs[1]); e.object.scale.copy(t.trs[2]); }
			if (!e.deleted) e.object.visible = t.visible;
			for (const [c, hex] of t.colors) c.set(hex);
			for (const [l, i] of t.lights) l.intensity = i;
		}
		this.touched.clear();
	}

	/** an editor change to components / graphs: hot-apply while playing */
	refresh(what: { entity?: Entity; graph?: string; script?: string }) {
		if (!this.running) return;
		if (what.entity) {
			const e = what.entity;
			this.insts = this.insts.filter((i) => i.e !== e);
			for (const c of e.components) this.startComponent(e, c.type);
			this.buildScripts((i) => i.e === e, (x) => x === e);
		}
		if (what.script) {
			this.buildScripts((i) => i.doc.id === what.script, (_e, id) => id === what.script);
			log.info(`Script "${this.scripts.get(what.script)?.name ?? what.script}" reloaded`);
		}
		if (what.script && !what.graph && !what.entity) return;
		this.buildRunners();
		if (what.graph) log.info(`Graph "${this.graphs.get(what.graph)?.name ?? what.graph}" reloaded`);
	}

	// ------------------------------------------------------------------ scripts
	/**
	 * (Re)build script instances. With filters, only the matching ones are
	 * replaced (hot reload) and the rest keep running untouched.
	 */
	private buildScripts(drop: (i: ScriptInst) => boolean = () => true, want: (e: Entity, scriptId: string) => boolean = () => true) {
		this.scriptInsts = this.scriptInsts.filter((i) => !drop(i));
		const factories = new Map<string, ReturnType<typeof makeFactory> | null>();
		for (const e of this.w.list) {
			if (e.deleted) continue;
			for (const c of e.components) {
				if (c.type !== 'Script' || !c.data.script) continue;
				const id = String(c.data.script);
				if (!want(e, id) || this.scriptInsts.some((i) => i.e === e && i.doc.id === id)) continue;
				const doc = this.scripts.get(id);
				if (!doc) { log.warn(`${e.name}: script "${id}" not found`); continue; }
				if (!factories.has(id)) {
					const cc = checkScript(doc.source);
					try { factories.set(id, cc.ok ? makeFactory(cc) : null); } catch (err) { factories.set(id, null); this.scriptError(doc, e, err); }
					if (!cc.ok) log.error(`Script "${doc.name}" has errors and did not run`);
				}
				const f = factories.get(id);
				if (!f) continue;
				this.touch(e);
				const inst: ScriptInst = { e, doc, hooks: {}, failed: false, ms: 0 };
				const key = e.id + '|' + id;
				if (!this.scriptState.has(key)) this.scriptState.set(key, {});
				try {
					this.guard.reset();
					inst.hooks = f(this.guard.fn, this.scriptApi(e, this.scriptState.get(key)!), this.handle(e), (...a) => this.onLog(`${doc.name}: ${a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')}`));
				} catch (err) { this.scriptError(doc, e, err); inst.failed = true; }
				this.scriptInsts.push(inst);
				if (inst.hooks.onHit) this.hookHits(e);
				this.call(inst, 'start');
			}
		}
	}

	/** run one hook inside the error boundary */
	private call(i: ScriptInst, hook: Hook, ...args: unknown[]) {
		const fn = i.hooks[hook];
		if (!fn || i.failed || i.e.deleted) return undefined;
		const t0 = performance.now();
		try { this.guard.reset(); return fn(...args); }
		catch (err) { i.failed = true; this.scriptError(i.doc, i.e, err); return undefined; }
		finally { i.ms = i.ms * 0.9 + (performance.now() - t0) * 0.1; }
	}

	private scriptError(doc: ScriptDoc, e: Entity, err: unknown) {
		const line = errorLine(err);
		const message = (err as Error)?.message ?? String(err);
		this.scriptProblems.push({ script: doc.id, entity: e.id, line, message, t: performance.now() });
		if (this.scriptProblems.length > 100) this.scriptProblems.shift();
		log.error(`Script "${doc.name}" on ${e.name}${line ? ` line ${line}` : ''}: ${message} - stopped on this object until you fix it`);
	}

	/** a script's view of an entity: only the safe, restorable operations */
	private handle(e: Entity) {
		const api = this.api();
		const id = e.id;
		const self = this;
		return Object.freeze({
			id, get name() { return e.name; },
			get position() { const p = e.object.position; return { x: p.x, y: p.y, z: p.z }; },
			get visible() { return e.object.visible; },
			moveBy: (x: number, y: number, z: number) => api.moveBy(id, +x, +y, +z),
			moveTo: (x: number, y: number, z: number) => { const p = e.object.position; api.moveBy(id, +x - p.x, +y - p.y, +z - p.z); },
			rotateBy: (x: number, y: number, z: number) => { self.touch(e); const d = THREE.MathUtils.degToRad; e.object.rotateX(d(+x)); e.object.rotateY(d(+y)); e.object.rotateZ(d(+z)); if (e.prop) self.physics?.teleport(e.prop, e.object.position.clone(), e.object.quaternion.clone()); },
			setVisible: (on: boolean) => api.setVisible(id, !!on),
			setColor: (hex: string) => api.setColor(id, String(hex)),
			setLight: (i: number) => api.setLight(id, Math.max(0, Math.min(1e4, +i))),
			impulse: (x: number, y: number, z: number) => api.impulse(id, +x, +y, +z),
			distanceToPlayer: () => api.distanceToPlayer(id),
			emit: (event: string, value = 0) => api.emit(id, String(event), +value),
			command: (name: string, value = 0) => api.command(id, String(name), +value),
		});
	}

	private scriptApi(e: Entity, state: Record<string, unknown>) {
		const g = this.api();
		const self = this;
		return Object.freeze({
			state,
			get time() { return self.time; },
			get player() { const p = self.player(); return { x: p.x, y: p.y, z: p.z }; },
			entity: (id: string) => { const x = self.w.get(String(id)); return x && !x.deleted ? self.handle(x) : null; },
			find: (name: string) => { const x = self.w.list.find((y) => !y.deleted && y.name === name); return x ? self.handle(x) : null; },
			tone: (freq: number, seconds = 0.2) => g.tone(Math.max(30, Math.min(8000, +freq)), Math.max(0.02, Math.min(5, +seconds)), e.id),
			after: (seconds: number, fn: () => void) => {
				const inst = () => self.scriptInsts.find((i) => i.e === e);
				g.after(Math.max(0, +seconds), () => { const i = inst(); if (!i || i.failed) return; try { self.guard.reset(); fn(); } catch (err) { i.failed = true; self.scriptError(i.doc, e, err); } });
			},
			addItem: (item: string, n = 1) => g.addItem(String(item), +n),
			itemCount: (item: string) => g.itemCount(String(item)),
			spawnCopy: (id: string) => g.spawnCopy(String(id)),
		});
	}

	// ------------------------------------------------------------------ frame
	update(dt: number) {
		if (!this.running || dt <= 0) return;
		this.time += dt;
		const ctx = this.ctx(dt);
		for (const i of this.insts) {
			if (i.e.deleted) continue;
			const def = COMPONENTS.get(i.type)!;
			if (!def.update) continue;
			try { def.update(i.e, this.data(i.e, i.type), i.s, ctx); } catch (err) { log.error(`${i.e.name} › ${def.label}: ${(err as Error).message}`); }
		}
		for (const r of this.runners) r.fire('tick', dt, this.time);
		for (const i of this.scriptInsts) this.call(i, 'update', dt);
		for (let k = this.timers.length - 1; k >= 0; k--) {
			const t = this.timers[k];
			t.t -= dt;
			if (t.t <= 0) { this.timers.splice(k, 1); t.fn(); }
		}
	}

	// ------------------------------------------------------------------ events
	emit(e: Entity, event: string, value = 0) {
		for (const r of this.runners) r.fire('entity', 0, this.time, { entity: e.id, event, value });
		for (const i of this.scriptInsts) this.call(i, 'onEvent', e.id, event, value);
	}

	command(e: Entity, name: string, value = 0) {
		let handled = false;
		for (const i of this.insts) {
			if (i.e !== e) continue;
			const def = COMPONENTS.get(i.type)!;
			if (def.command && (!def.commands || def.commands.includes(name))) { def.command(e, this.data(e, i.type), i.s, name, this.ctx(0), value); handled = true; }
		}
		if (!handled) log.warn(`${e.name} has no component that understands "${name}"`);
	}

	/** the player used an object (E / trigger) - true if something on it reacted */
	use(o: THREE.Object3D): boolean {
		if (!this.running) return false;
		const e = this.w.of(o);
		if (!e) return false;
		let used = false;
		for (const i of this.insts) if (i.e === e) { const def = COMPONENTS.get(i.type)!; if (def.use?.(e, this.data(e, i.type), i.s, this.ctx(0))) used = true; }
		for (const i of this.scriptInsts) if (i.e === e && i.hooks.onUse && !i.failed) { this.call(i, 'onUse'); used = true; }
		return used;
	}
	usable(o: THREE.Object3D) { const e = this.running ? this.w.of(o) : null; return !!e && (this.insts.some((i) => i.e === e && COMPONENTS.get(i.type)!.use) || this.scriptInsts.some((i) => i.e === e && !!i.hooks.onUse && !i.failed)); }

	private hit(e: Entity, h: BulletHit) {
		for (const i of this.insts) if (i.e === e) COMPONENTS.get(i.type)!.hit?.(e, this.data(e, i.type), i.s, h, this.ctx(0));
		for (const i of this.scriptInsts) if (i.e === e) this.call(i, 'onHit', Object.freeze({ x: h.point.x, y: h.point.y, z: h.point.z, speed: h.speed }));
	}

	// ------------------------------------------------------------------ helpers
	private data(e: Entity, type: string) { return e.components.find((c) => c.type === type)?.data ?? {}; }

	/** remember an entity's state before gameplay changes it (restored on Stop) */
	private touch(e: Entity) {
		if (this.touched.has(e)) return;
		const colors: [THREE.Color, string][] = [];
		for (const m of this.w.materials(e)) for (const k of ['color', 'emissive'] as const) { const c = (m as any)[k] as THREE.Color | undefined; if (c?.isColor) colors.push([c, '#' + c.getHexString()]); }
		this.touched.set(e, { trs: [e.object.position.clone(), e.object.quaternion.clone(), e.object.scale.clone()], visible: e.object.visible, colors, lights: this.w.lights(e).map((l) => [l, l.intensity]) });
	}

	private ctx(dt: number): GameCtx {
		return {
			dt, time: this.time, player: this.player(), inventory: this.inventory,
			emit: (e, ev, v) => this.emit(e, ev, v),
			entity: (id) => this.w.get(id),
			spawnCopy: (src, at) => this.spawnCopy(src, at),
			play: (at, f, s) => this.tone(at, f, s),
			log: (m) => this.onLog(m),
		};
	}

	private spawnCopy(src: Entity, at: THREE.Vector3): Entity | null {
		if (this.copies.length >= 100) return null;
		const obj = src.object.clone(true);
		obj.position.copy(at);
		obj.visible = true;
		this.w.scene.add(obj);
		let prop: Prop | undefined;
		if (src.prop && this.physics?.enabled) prop = this.physics.addProp({ ...src.prop.desc, object: obj });
		const e = this.w.add({ id: src.id + '-run', name: src.name + ' (runtime)', layer: 'Spawned', object: obj, prop, components: [] });
		this.copies.push({ e, prop });
		return e;
	}

	private tone(at: THREE.Vector3, freq: number, seconds: number) {
		const v = this.voices.find((x) => !x.isPlaying) ?? this.voices[0];
		if (!v) return;
		const ac = v.context;
		const n = Math.max(1, Math.round(ac.sampleRate * seconds)), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
		for (let i = 0; i < n; i++) { const t = i / ac.sampleRate; d[i] = Math.sin(2 * Math.PI * freq * t) * Math.min(1, t * 200) * Math.exp(-t * 4 / seconds) * 0.5; }
		if (v.isPlaying) v.stop();
		v.setBuffer(buf); v.position.copy(at); v.play();
	}

	private api(): GraphAPI {
		const get = (id: string) => { const e = this.w.get(id); if (!e) throw new Error(`no entity "${id}"`); return e; };
		return {
			command: (id, name, v) => this.command(get(id), name, v),
			emit: (id, ev, v) => this.emit(get(id), ev, v),
			setVisible: (id, on) => { const e = get(id); this.touch(e); e.object.visible = on; },
			moveBy: (id, x, y, z) => { const e = get(id); this.touch(e); e.object.position.add(new THREE.Vector3(x, y, z)); if (e.prop) this.physics?.teleport(e.prop, e.object.position.clone(), e.object.quaternion.clone()); },
			setColor: (id, hex) => { const e = get(id); this.touch(e); if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('colour must look like #a1b2c3'); for (const m of this.w.materials(e)) (m as any).color?.set?.(hex); },
			setLight: (id, i) => { const e = get(id); this.touch(e); for (const l of this.w.lights(e)) l.intensity = i; },
			impulse: (id, x, y, z) => { const e = get(id); if (!e.prop) throw new Error(`${e.name} has no physics body`); e.prop.body.applyImpulse({ x, y, z }, true); },
			tone: (f, s, at) => this.tone(at ? (this.w.get(at)?.object.getWorldPosition(new THREE.Vector3()) ?? this.player()) : this.player(), f, s),
			log: (m) => this.onLog(m),
			spawnCopy: (id) => { const e = get(id); this.spawnCopy(e, e.object.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0))); },
			addItem: (item, n) => this.inventory.set(item, (this.inventory.get(item) ?? 0) + n),
			itemCount: (item) => this.inventory.get(item) ?? 0,
			distanceToPlayer: (id) => get(id).object.getWorldPosition(new THREE.Vector3()).distanceTo(this.player()),
			after: (s, fn) => { if (this.timers.length < 500) this.timers.push({ t: s, fn }); },
		};
	}
}
