import * as THREE from 'three';
import type { Entity } from './entities';
import type { BulletHit } from '../world/gunEffects';

/**
 * Component API. A component type is registered once with typed fields and
 * optional behaviour; entities carry instances as plain data (so they are
 * saved, validated and undoable like everything else). New gameplay systems
 * plug in by calling `defineComponent` - nothing in the engine changes.
 *
 * Behaviour runs only while the runtime plays. Components talk through
 * events: `emit(entity, 'died')` reaches node graphs ("On Event") and other
 * components (`commands` they accept, e.g. a Door's "open").
 */
export type FieldKind = 'number' | 'bool' | 'string' | 'entity';
export interface FieldDef { kind: FieldKind; default: number | boolean | string; min?: number; max?: number; label?: string }

export interface GameCtx {
	dt: number;
	time: number;
	player: THREE.Vector3;
	emit(e: Entity, event: string, value?: number): void;
	entity(id: string): Entity | undefined;
	/** gameplay copies (not saved; removed on Stop) */
	spawnCopy(src: Entity, at: THREE.Vector3): Entity | null;
	play(at: THREE.Vector3, freq: number, dur: number): void;
	inventory: Map<string, number>;
	log(msg: string): void;
}

export interface ComponentDef {
	type: string;
	label: string;
	description: string;
	fields: Record<string, FieldDef>;
	/** events this component emits (for the node editor's pickers) */
	events?: string[];
	/** commands it understands, sent with "Send Command" / other components */
	commands?: string[];
	start?(e: Entity, d: Data, s: State, ctx: GameCtx): void;
	update?(e: Entity, d: Data, s: State, ctx: GameCtx): void;
	command?(e: Entity, d: Data, s: State, name: string, ctx: GameCtx, value?: number): void;
	/** a bullet hit this entity */
	hit?(e: Entity, d: Data, s: State, hit: BulletHit, ctx: GameCtx): void;
	/** player used it (E / trigger); return true if handled */
	use?(e: Entity, d: Data, s: State, ctx: GameCtx): boolean;
}
export type Data = Record<string, number | boolean | string>;
export type State = Record<string, any>;

export const COMPONENTS = new Map<string, ComponentDef>();
export function defineComponent(def: ComponentDef) { COMPONENTS.set(def.type, def); }

export function defaults(type: string): Data {
	const def = COMPONENTS.get(type);
	const d: Data = {};
	if (def) for (const [k, f] of Object.entries(def.fields)) d[k] = f.default;
	return d;
}

/** null if the data fits the component's fields */
export function validateComponent(type: string, data: unknown): string | null {
	const def = COMPONENTS.get(type);
	if (!def) return `unknown component ${type}`;
	if (!data || typeof data !== 'object') return 'bad component data';
	for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
		const f = def.fields[k];
		if (!f) return `${type} has no field ${k}`;
		if (f.kind === 'number') { if (typeof v !== 'number' || !Number.isFinite(v) || (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)) return `${type}.${k} out of range`; }
		else if (f.kind === 'bool') { if (typeof v !== 'boolean') return `${type}.${k} must be true/false`; }
		else if (typeof v !== 'string' || v.length > 120) return `${type}.${k} must be text`;
	}
	return null;
}

const V = new THREE.Vector3();
const AXES: Record<string, THREE.Vector3> = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

// ------------------------------------------------------------------ built-ins
defineComponent({
	type: 'Spinner', label: 'Spinner', description: 'Turns the object continuously.',
	fields: { speed: { kind: 'number', default: 90, min: -2000, max: 2000, label: 'deg / s' }, axis: { kind: 'string', default: 'y' } },
	update(e, d, _s, ctx) { e.object.rotateOnAxis(AXES[String(d.axis)] ?? AXES.y, THREE.MathUtils.degToRad(Number(d.speed)) * ctx.dt); },
});

defineComponent({
	type: 'Bobber', label: 'Bobber', description: 'Floats up and down.',
	fields: { height: { kind: 'number', default: 0.1, min: 0, max: 5 }, period: { kind: 'number', default: 2, min: 0.1, max: 60 } },
	start(e, _d, s) { s.y0 = e.object.position.y; },
	update(e, d, s, ctx) { e.object.position.y = s.y0 + Math.sin(ctx.time * Math.PI * 2 / Number(d.period)) * Number(d.height); },
});

defineComponent({
	type: 'Patrol', label: 'Patrol (NPC walk)', description: 'Walks back and forth along its facing direction, turning at each end.',
	fields: { distance: { kind: 'number', default: 2, min: 0.1, max: 200 }, speed: { kind: 'number', default: 0.8, min: 0, max: 20 } },
	start(e, _d, s) { s.origin = e.object.position.clone(); s.dir = new THREE.Vector3(0, 0, 1).applyQuaternion(e.object.quaternion).setY(0).normalize(); s.t = 0; s.sign = 1; },
	update(e, d, s, ctx) {
		s.t += s.sign * Number(d.speed) * ctx.dt;
		if (s.t > Number(d.distance)) { s.t = Number(d.distance); s.sign = -1; e.object.rotateY(Math.PI); }
		if (s.t < 0) { s.t = 0; s.sign = 1; e.object.rotateY(Math.PI); }
		e.object.position.copy(s.origin).addScaledVector(s.dir, s.t);
		e.object.position.y = s.origin.y + Math.abs(Math.sin(s.t * 6)) * 0.02; // a little step bounce
	},
});

defineComponent({
	type: 'Trigger', label: 'Trigger volume', description: 'Fires "enter" / "exit" when the player walks into / out of a box around the object.',
	fields: { sizeX: { kind: 'number', default: 1.5, min: 0.05, max: 100 }, sizeY: { kind: 'number', default: 2.2, min: 0.05, max: 100 }, sizeZ: { kind: 'number', default: 1.5, min: 0.05, max: 100 }, once: { kind: 'bool', default: false } },
	events: ['enter', 'exit'],
	start(_e, _d, s) { s.inside = false; s.done = false; },
	update(e, d, s, ctx) {
		const local = e.object.worldToLocal(V.copy(ctx.player));
		// box sits on the object's origin, rising from it (the head is ~1.6 m up)
		const inside = Math.abs(local.x) < Number(d.sizeX) / 2 && Math.abs(local.z) < Number(d.sizeZ) / 2 && local.y > -0.3 && local.y < Number(d.sizeY);
		if (inside !== s.inside && !s.done) {
			s.inside = inside;
			ctx.emit(e, inside ? 'enter' : 'exit');
			if (d.once && !inside) s.done = true;
		}
	},
});

defineComponent({
	type: 'Door', label: 'Door (hinged)', description: 'Swings open / closed about a vertical hinge at its left edge. Commands: open, close, toggle.',
	fields: { angle: { kind: 'number', default: 95, min: -180, max: 180, label: 'open deg' }, speed: { kind: 'number', default: 120, min: 1, max: 2000, label: 'deg / s' }, hinge: { kind: 'number', default: -0.45, min: -5, max: 5, label: 'hinge x' }, startOpen: { kind: 'bool', default: false } },
	commands: ['open', 'close', 'toggle'],
	events: ['opened', 'closed'],
	start(e, d, s) { s.base = e.object.matrix.clone(); s.pos = e.object.position.clone(); s.quat = e.object.quaternion.clone(); s.a = d.startOpen ? Number(d.angle) : 0; s.target = s.a; },
	command(_e, d, s, name) { s.target = name === 'open' ? Number(d.angle) : name === 'close' ? 0 : (s.target ? 0 : Number(d.angle)); },
	use(e, d, s, ctx) { this.command!(e, d, s, 'toggle', ctx); return true; },
	update(e, d, s, ctx) {
		const step = Number(d.speed) * ctx.dt;
		const before = s.a;
		s.a += THREE.MathUtils.clamp(s.target - s.a, -step, step);
		if (before !== s.a && s.a === s.target) ctx.emit(e, s.a === 0 ? 'closed' : 'opened');
		// rotate about the hinge line (object-local x = hinge, vertical)
		const hinge = new THREE.Vector3(Number(d.hinge), 0, 0).applyQuaternion(s.quat).add(s.pos);
		const q = new THREE.Quaternion().setFromAxisAngle(AXES.y, THREE.MathUtils.degToRad(s.a));
		e.object.quaternion.copy(q).multiply(s.quat);
		e.object.position.copy(s.pos).sub(hinge).applyQuaternion(q).add(hinge);
	},
});

defineComponent({
	type: 'Health', label: 'Health', description: 'Takes damage from bullets (by impact energy) and "damage" commands; emits "hurt" and "died", then hides.',
	fields: { max: { kind: 'number', default: 100, min: 1, max: 1e6 }, hideOnDeath: { kind: 'bool', default: true } },
	events: ['hurt', 'died'],
	commands: ['damage', 'heal'],
	start(_e, d, s) { s.hp = Number(d.max); },
	hit(e, d, s, hit, ctx) { this.command!(e, d, s, 'damage', ctx, Math.round(hit.cart.impulse * hit.speed / 30)); },
	command(e, d, s, name, ctx, value = 10) {
		if (s.hp <= 0) return;
		s.hp = name === 'heal' ? Math.min(Number(d.max), s.hp + value) : s.hp - value;
		ctx.emit(e, 'hurt', s.hp);
		if (s.hp <= 0) { s.hp = 0; ctx.emit(e, 'died'); if (d.hideOnDeath) e.object.visible = false; }
	},
});

defineComponent({
	type: 'Interactable', label: 'Interactable', description: 'Press E (desktop) or pull the trigger at it (VR) to emit "used".',
	fields: { prompt: { kind: 'string', default: 'Use' } },
	events: ['used'],
	use(e, _d, _s, ctx) { ctx.emit(e, 'used'); return true; },
});

defineComponent({
	type: 'Pickup', label: 'Pickup (inventory)', description: 'Walk into it to collect it: adds to the inventory item and hides it.',
	fields: { item: { kind: 'string', default: 'coin' }, amount: { kind: 'number', default: 1, min: 1, max: 1000 }, radius: { kind: 'number', default: 0.6, min: 0.05, max: 10 } },
	events: ['collected'],
	start(_e, _d, s) { s.taken = false; },
	update(e, d, s, ctx) {
		if (s.taken || !e.object.visible) return;
		const p = e.object.getWorldPosition(V);
		if (Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z) < Number(d.radius) && ctx.player.y - p.y < 2.2) {
			s.taken = true; e.object.visible = false;
			const item = String(d.item);
			ctx.inventory.set(item, (ctx.inventory.get(item) ?? 0) + Number(d.amount));
			ctx.emit(e, 'collected', ctx.inventory.get(item));
			ctx.play(p, 1320, 0.12);
			ctx.log(`Picked up ${d.amount} ${item} (${ctx.inventory.get(item)})`);
		}
	},
});

defineComponent({
	type: 'Spawner', label: 'Spawner', description: 'Makes gameplay copies of another entity every few seconds (copies vanish on Stop).',
	fields: { template: { kind: 'entity', default: '' }, every: { kind: 'number', default: 3, min: 0.2, max: 600, label: 'seconds' }, max: { kind: 'number', default: 5, min: 1, max: 50 } },
	events: ['spawned'],
	commands: ['spawn'],
	start(_e, _d, s) { s.t = 0; s.n = 0; },
	command(e, d, s, _name, ctx) {
		const src = ctx.entity(String(d.template));
		if (!src || s.n >= Number(d.max)) return;
		if (ctx.spawnCopy(src, e.object.getWorldPosition(new THREE.Vector3()))) { s.n++; ctx.emit(e, 'spawned', s.n); }
	},
	update(e, d, s, ctx) { s.t += ctx.dt; if (s.t >= Number(d.every)) { s.t = 0; this.command!(e, d, s, 'spawn', ctx); } },
});

defineComponent({
	type: 'Sound', label: 'Sound (tone)', description: 'Plays a short synthesised tone on the "play" command.',
	fields: { frequency: { kind: 'number', default: 660, min: 30, max: 8000 }, seconds: { kind: 'number', default: 0.25, min: 0.02, max: 5 } },
	commands: ['play'],
	command(e, d, _s, _n, ctx) { ctx.play(e.object.getWorldPosition(new THREE.Vector3()), Number(d.frequency), Number(d.seconds)); },
});

defineComponent({
	type: 'LightPulse', label: 'Light pulse', description: 'Makes the lights under the object pulse.',
	fields: { rate: { kind: 'number', default: 1, min: 0.01, max: 30, label: 'Hz' }, depth: { kind: 'number', default: 0.8, min: 0, max: 1 } },
	start(e, _d, s) { s.lights = []; e.object.traverse((o) => { if ((o as THREE.Light).isLight) s.lights.push([o, (o as THREE.Light).intensity]); }); },
	update(_e, d, s, ctx) { const k = 1 - Number(d.depth) * (0.5 + 0.5 * Math.sin(ctx.time * Math.PI * 2 * Number(d.rate))); for (const [l, i0] of s.lights) l.intensity = i0 * k; },
});

defineComponent({
	type: 'Graph', label: 'Script graph', description: 'Runs a node graph with this entity as "Self".',
	fields: { graph: { kind: 'string', default: '' } },
});
