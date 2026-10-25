import * as THREE from 'three';
import type { Physics, Prop } from '../physics/physics';
import type { Entity, EntityWorld, SpawnSpec, TRS } from './entities';
import { readTRS } from './entities';
import { COMPONENTS, defaults, validateComponent, type Data } from './components';
import { validateGraph, type GraphDoc } from './graph';
import type { Gameplay } from './gameplay';
import { type Command, applyTRS, makeMaterialUnique, setLight, setMaterial, setPhysics, rename, type MatKey, type PhysKey } from './commands';

/**
 * Scene operations as plain data. The editor (UI, VR tools, the Claude
 * agent) only ever produces Ops; an Op becomes a Command to run it, and the
 * saved scene is the list of Ops, replayed on load. validateOp() checks every
 * field first, so a bad or tampered save is rejected op by op instead of
 * corrupting the scene.
 */
export type Op =
	| { op: 'trs'; id: string; to: TRS; from?: TRS }
	| { op: 'mat'; id: string; mi: number; key: MatKey; value: number | string }
	| { op: 'unique'; id: string; mi: number }
	| { op: 'light'; id: string; li: number; key: 'intensity' | 'color'; value: number | string }
	| { op: 'phys'; id: string; key: PhysKey; value: number }
	| { op: 'static'; id: string; value: boolean }
	| { op: 'rename'; id: string; name: string }
	| { op: 'delete'; id: string }
	| { op: 'spawn'; id: string; spec: SpawnSpec; to: TRS; color: string }
	| { op: 'comp'; id: string; ctype: string; data: Data | null }
	| { op: 'graph'; id: string; graph: GraphDoc | null };

export interface OpContext { world: EntityWorld; physics: Physics | null; scene: THREE.Scene; onMoved?(e: Entity): void; gameplay?: Gameplay }

const num = (v: unknown, lo = -1e5, hi = 1e5) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const vec = (v: unknown, lo?: number, hi?: number) => Array.isArray(v) && v.length === 3 && v.every((x) => num(x, lo, hi));
const trsOk = (t: any) => t && vec(t.p, -6000, 6000) && vec(t.r, -720, 720) && vec(t.s, 0.001, 100);
const colorOk = (c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/** null if fine, else the reason */
export function validateOp(o: any, w: EntityWorld): string | null {
	if (!o || typeof o !== 'object' || typeof o.op !== 'string' || typeof o.id !== 'string' || o.id.length > 80) return 'malformed';
	if (o.op === 'graph') {
		if (!/^[\w-]{1,40}$/.test(o.id)) return 'bad graph id';
		if (o.graph === null) return null;
		const why = validateGraph(o.graph);
		return why ?? (o.graph.id === o.id ? null : 'graph id mismatch');
	}
	const e = w.get(o.id);
	if (o.op !== 'spawn' && !e) return `unknown entity ${o.id}`;
	if (e?.locked && o.op !== 'light' && o.op !== 'mat' && o.op !== 'rename') return `${e.name} is locked`;
	switch (o.op) {
		case 'trs': return trsOk(o.to) ? null : 'bad transform';
		case 'mat':
			if (!num(o.mi, 0, 64)) return 'bad material index';
			if (o.key === 'color' || o.key === 'emissive') return colorOk(o.value) ? null : 'bad colour';
			if (o.key === 'emissiveIntensity') return num(o.value, 0, 50) ? null : 'bad value';
			return ['roughness', 'metalness', 'opacity'].includes(o.key) && num(o.value, 0, 1) ? null : 'bad material value';
		case 'unique': return num(o.mi, 0, 64) ? null : 'bad material index';
		case 'light': return num(o.li, 0, 64) && (o.key === 'color' ? colorOk(o.value) : o.key === 'intensity' && num(o.value, 0, 1e5)) ? null : 'bad light value';
		case 'phys':
			if (!e?.prop) return 'no physics body';
			return o.key === 'mass' ? (num(o.value, 0.001, 5000) ? null : 'bad mass') : num(o.value, o.key === 'gravity' ? -5 : 0, o.key === 'gravity' ? 5 : 2) ? null : 'bad physics value';
		case 'static': return e?.prop && typeof o.value === 'boolean' ? null : 'no physics body';
		case 'rename': return typeof o.name === 'string' && o.name.length > 0 && o.name.length <= 60 ? null : 'bad name';
		case 'comp':
			if (e?.locked) return `${e.name} is locked`;
			if (typeof o.ctype !== 'string' || !COMPONENTS.has(o.ctype)) return `unknown component ${o.ctype}`;
			return o.data === null ? null : validateComponent(o.ctype, o.data);
		case 'delete': return null;
		case 'spawn': {
			const s = o.spec;
			if (!s || !['box', 'sphere', 'cylinder', 'ramp', 'light', 'clone'].includes(s.kind) || typeof s.dynamic !== 'boolean' || !vec(s.size, 0.01, 50)) return 'bad spawn spec';
			if (s.kind === 'clone' && (typeof s.source !== 'string' || !w.get(s.source))) return 'clone source missing';
			// replaying a save after a reset: the same spawned entity, currently undone, comes back
			const ex = w.get(o.id);
			if (ex && !(ex.spawn && ex.deleted)) return 'id already exists';
			return trsOk(o.to) && colorOk(o.color) ? null : 'bad spawn transform';
		}
	}
	return 'unknown op';
}

export function opToCommand(o: Op, ctx: OpContext): Command {
	const w = ctx.world;
	const e = o.op === 'spawn' ? null : w.get(o.id)!;
	switch (o.op) {
		case 'trs': {
			const before = o.from ?? readTRS(e!.object);
			const move = (t: TRS) => { applyTRS(w, e!, t); ctx.onMoved?.(e!); };
			const scaled = !!e!.prop && o.to.s.some((v, i) => Math.abs(v - before.s[i]) > 1e-6);
			return { label: `Move ${e!.name}`, live: !e!.bakedStatic && !scaled, note: e!.bakedStatic ? 'baked shadows and static collision stay at the old place until reload' : scaled ? 'its collision shape keeps the old size until reload' : undefined, do() { move(o.to); }, undo() { move(before); } };
		}
		case 'mat': {
			const mat = w.materials(e!)[o.mi];
			if (!mat) throw new Error('no such material');
			const users = w.materialUsers(mat);
			const c = setMaterial(mat, o.key, o.value, `${e!.name}: ${o.key} ${typeof o.value === 'number' ? o.value.toFixed(2) : o.value}`);
			if (users > 1) { c.note = `this material is shared by ${users} meshes; use "Make unique" to change only this object`; }
			return c;
		}
		case 'unique': return makeMaterialUnique(e!, w.materials(e!)[o.mi]);
		case 'light': {
			const l = w.lights(e!)[o.li];
			if (!l) throw new Error('no such light');
			return setLight(l, o.key, o.value, `${e!.name}: ${o.key} ${o.value}`);
		}
		case 'phys': return setPhysics(e!, o.key, o.value);
		case 'static': {
			const before = ctx.physics!.isPropStatic(e!.prop!);
			const set = (v: boolean) => ctx.physics!.setPropStatic(e!.prop!, v);
			return { label: `${e!.name}: ${o.value ? 'static' : 'dynamic'}`, live: true, do() { set(o.value); }, undo() { set(before); } };
		}
		case 'rename': return rename(e!, o.name, w);
		case 'comp': {
			const ent = e!;
			const prev = ent.components.find((c) => c.type === o.ctype);
			const before = prev ? { ...prev.data } : null;
			const set = (d: Data | null) => {
				const i = ent.components.findIndex((c) => c.type === o.ctype);
				if (d === null) { if (i >= 0) ent.components.splice(i, 1); }
				else if (i >= 0) ent.components[i].data = { ...defaults(o.ctype), ...d };
				else ent.components.push({ type: o.ctype, data: { ...defaults(o.ctype), ...d } });
				w.version++;
				ctx.gameplay?.refresh({ entity: ent });
			};
			const label = o.data === null ? `Remove ${o.ctype} from ${ent.name}` : prev ? `${ent.name}: edit ${o.ctype}` : `Add ${o.ctype} to ${ent.name}`;
			return { label, live: true, do() { set(o.data); }, undo() { set(before); } };
		}
		case 'graph': {
			const graphs = ctx.gameplay?.graphs;
			if (!graphs) throw new Error('graphs are unavailable');
			const prev = graphs.get(o.id);
			const before = prev ? structuredClone(prev) : null;
			const set = (g: GraphDoc | null) => { if (g) graphs.set(o.id, structuredClone(g)); else graphs.delete(o.id); w.version++; ctx.gameplay?.refresh({ graph: o.id }); };
			return { label: o.graph === null ? `Delete graph ${prev?.name ?? o.id}` : `${prev ? 'Edit' : 'New'} graph ${o.graph.name}`, live: true, do() { set(o.graph); }, undo() { set(before); } };
		}
		case 'delete': {
			const ent = e!;
			const set = (gone: boolean) => {
				ent.deleted = gone;
				ent.object.visible = !gone;
				if (ent.prop && ctx.physics?.enabled) ctx.physics.setPropEnabled(ent.prop, !gone);
				w.version++;
			};
			return { label: `Delete ${ent.name}`, live: !ent.bakedStatic, note: ent.bakedStatic ? 'its baked shadow and static collision remain until reload' : undefined, do() { set(true); }, undo() { set(false); } };
		}
		case 'spawn': {
			const existing = w.get(o.id);
			let made: Entity | null = existing && existing.spawn && existing.deleted ? existing : null;
			if (made) applyTRS(w, made, o.to);
			return {
				label: `Spawn ${o.spec.kind === 'clone' ? 'copy of ' + w.get(o.spec.source!)!.name : o.spec.kind}`,
				live: true,
				do() {
					if (made) { made.deleted = false; made.object.visible = true; if (made.prop) ctx.physics?.setPropEnabled(made.prop, true); w.version++; return; }
					made = spawn(o, ctx);
				},
				undo() {
					if (!made) return;
					made.deleted = true; made.object.visible = false;
					if (made.prop) ctx.physics?.setPropEnabled(made.prop, false);
					w.version++;
				},
			};
		}
	}
}

/** Build a spawned entity: a primitive (or a copy of an existing one) with a real body. */
function spawn(o: Extract<Op, { op: 'spawn' }>, ctx: OpContext): Entity {
	const { world: w, physics, scene } = ctx;
	const s = o.spec;
	let obj: THREE.Object3D;
	let shapes: { kind: 'cuboid' | 'ball' | 'cylinder'; size: number[]; offset?: number[] }[] = [];
	if (s.kind === 'clone') {
		const src = w.get(s.source!)!;
		obj = src.object.clone(true);
		obj.traverse((m) => { if ((m as THREE.Mesh).isMesh) { const mesh = m as THREE.Mesh; mesh.castShadow = true; } });
		if (src.prop) shapes = src.prop.desc.shapes.map((x) => ({ kind: x.kind === 'capsuleX' ? 'cuboid' : x.kind, size: x.kind === 'capsuleX' ? [x.size[1] + x.size[0], x.size[0], x.size[0]] : [...x.size], offset: x.offset ? [...x.offset] : undefined } as any));
	} else if (s.kind === 'light') {
		const l = new THREE.PointLight(new THREE.Color(o.color), 3, 6, 2);
		const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), new THREE.MeshStandardMaterial({ color: o.color, emissive: o.color, emissiveIntensity: 2 }));
		obj = new THREE.Group(); obj.add(l, bulb);
	} else {
		const [x, y, z] = s.size;
		const geo = s.kind === 'box' ? new THREE.BoxGeometry(x, y, z)
			: s.kind === 'sphere' ? new THREE.SphereGeometry(x / 2, 32, 20)
			: s.kind === 'cylinder' ? new THREE.CylinderGeometry(x / 2, x / 2, y, 32)
			: rampGeometry(x, y, z);
		const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.55, metalness: 0.05 }));
		mesh.castShadow = true; mesh.receiveShadow = true;
		obj = mesh;
		shapes = s.kind === 'sphere' ? [{ kind: 'ball', size: [x / 2] }] : s.kind === 'cylinder' ? [{ kind: 'cylinder', size: [x / 2, y / 2] }] : [{ kind: 'cuboid', size: [x / 2, y / 2, z / 2] }];
	}
	const t = o.to;
	obj.position.fromArray(t.p);
	obj.rotation.set(...(t.r.map(THREE.MathUtils.degToRad) as [number, number, number]));
	obj.scale.fromArray(t.s);
	obj.name = o.id;
	scene.add(obj);
	let prop: Prop | undefined;
	if (shapes.length && physics?.enabled) {
		const vol = s.size[0] * s.size[1] * s.size[2];
		prop = physics.addProp({ name: o.id, object: obj, mass: Math.max(0.05, Math.min(200, vol * 600)), friction: 0.6, restitution: 0.15, shapes: shapes as any });
		if (!s.dynamic) physics.setPropStatic(prop, true);
	}
	return w.add({ id: o.id, name: s.kind === 'clone' ? w.get(s.source!)!.name + ' copy' : cap(s.kind), layer: 'Spawned', object: obj, prop, spawn: s, components: [] });
}

function rampGeometry(x: number, y: number, z: number) {
	const g = new THREE.BufferGeometry();
	const hx = x / 2, hz = z / 2;
	const v = [-hx, 0, hz, hx, 0, hz, hx, 0, -hz, -hx, 0, -hz, -hx, y, -hz, hx, y, -hz];
	g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
	g.setIndex([0, 2, 1, 0, 3, 2, 3, 4, 5, 3, 5, 2, 0, 1, 5, 0, 5, 4, 0, 4, 3, 1, 2, 5]);
	g.computeVertexNormals();
	return g;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Merge an op list for saving: successive edits of the same field keep only
 * the last value (with the first "from" for transforms).
 */
export function compactOps(ops: Op[]): Op[] {
	const out: Op[] = [];
	const key = (o: Op) => o.op === 'trs' ? `trs|${o.id}` : o.op === 'mat' ? `mat|${o.id}|${o.mi}|${o.key}` : o.op === 'light' ? `light|${o.id}|${o.li}|${o.key}` : o.op === 'phys' ? `phys|${o.id}|${o.key}` : o.op === 'static' ? `static|${o.id}` : o.op === 'rename' ? `rename|${o.id}` : o.op === 'comp' ? `comp|${o.id}|${o.ctype}` : o.op === 'graph' ? `graph|${o.id}` : null;
	const last = new Map<string, number>();
	for (const o of ops) {
		// after "make unique" the material index points at a new material: do not
		// merge edits from before it into edits after it
		if (o.op === 'unique') for (const k of [...last.keys()]) if (k.startsWith(`mat|${o.id}|${o.mi}|`)) last.delete(k);
		const k = key(o);
		if (k && last.has(k)) {
			const i = last.get(k)!;
			const prev = out[i];
			out[i] = o.op === 'trs' && prev.op === 'trs' ? { ...o, from: prev.from } : o;
		} else {
			if (k) last.set(k, out.length);
			out.push(o);
		}
	}
	return out;
}

export { readTRS };
export type { PhysKey, MatKey };
