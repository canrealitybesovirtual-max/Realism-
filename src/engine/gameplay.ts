import * as THREE from 'three';
import type { Entity, EntityWorld } from './entities';
import type { Runtime, Mode } from './runtime';
import type { Physics, Prop } from '../physics/physics';
import { COMPONENTS, type GameCtx, type State } from './components';
import { GraphRunner, type GraphAPI, type GraphDoc } from './graph';
import type { BulletHit } from '../world/gunEffects';
import { log } from './log';

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
interface Touched { trs: [THREE.Vector3, THREE.Quaternion, THREE.Vector3]; visible: boolean; colors: [THREE.Color, string][]; lights: [THREE.Light, number][] }

export class Gameplay {
	readonly graphs = new Map<string, GraphDoc>();
	readonly inventory = new Map<string, number>();
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
		for (const e of this.w.list) {
			if (e.deleted) continue;
			for (const c of e.components) this.startComponent(e, c.type);
		}
		this.buildRunners();
		for (const r of this.runners) r.fire('start', 0, 0);
	}

	private startComponent(e: Entity, type: string) {
		const def = COMPONENTS.get(type);
		if (!def) return;
		this.touch(e);
		const inst: Inst = { e, type, s: {} };
		this.insts.push(inst);
		try { def.start?.(e, this.data(e, type), inst.s, this.ctx(0)); } catch (err) { log.error(`${e.name} › ${def.label}: ${(err as Error).message}`); }
		if (def.hit && !this.hitHooks.has(e.object)) {
			this.hitHooks.set(e.object, e.object.userData.onBulletHit);
			const prev = e.object.userData.onBulletHit;
			e.object.userData.onBulletHit = (h: BulletHit) => { this.hit(e, h); return prev ? prev(h) : false; };
		}
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
	refresh(what: { entity?: Entity; graph?: string }) {
		if (!this.running) return;
		if (what.entity) {
			const e = what.entity;
			this.insts = this.insts.filter((i) => i.e !== e);
			for (const c of e.components) this.startComponent(e, c.type);
		}
		this.buildRunners();
		if (what.graph) log.info(`Graph "${this.graphs.get(what.graph)?.name ?? what.graph}" reloaded`);
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
		for (let k = this.timers.length - 1; k >= 0; k--) {
			const t = this.timers[k];
			t.t -= dt;
			if (t.t <= 0) { this.timers.splice(k, 1); t.fn(); }
		}
	}

	// ------------------------------------------------------------------ events
	emit(e: Entity, event: string, value = 0) {
		for (const r of this.runners) r.fire('entity', 0, this.time, { entity: e.id, event, value });
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
		return used;
	}
	usable(o: THREE.Object3D) { const e = this.running ? this.w.of(o) : null; return !!e && this.insts.some((i) => i.e === e && COMPONENTS.get(i.type)!.use); }

	private hit(e: Entity, h: BulletHit) {
		for (const i of this.insts) if (i.e === e) COMPONENTS.get(i.type)!.hit?.(e, this.data(e, i.type), i.s, h, this.ctx(0));
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
