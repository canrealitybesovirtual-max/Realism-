import * as THREE from 'three';
import { KINDS, KIND_LIST, type Kind } from './catalog';
import { makeItem, kelvin, type House, type Item, type Room, type RoomId } from './house';
import { PRESETS, PRESET_NAMES, dress, finishOf, type Finish, type PresetName } from './materials';

/**
 * The home's live editing engine.
 *
 * Every change is a plain-data op (below). Ops are validated, then applied
 * straight to the running scene: a new finish re-dresses the existing
 * material, a move sets the existing object's transform, a light change sets
 * the existing lights. Nothing is rebuilt and nothing reloads.
 *
 * A request becomes one transaction: its ops are applied one by one (so a
 * long plan shows progress as it goes), and the whole transaction undoes and
 * redoes as a single step. If any op fails, everything the transaction did
 * is rolled back. The saved design is the list of *resolved* ops ("put the
 * chair at x, z" rather than "beside the window"), replayed on load.
 */

export type Side = 'beside' | 'left' | 'right' | 'front' | 'behind';
export type Where = 'window' | 'door' | 'wall' | 'center' | 'corner';
export type Op =
	| { op: 'finish'; target: string; slot?: string; preset?: PresetName; color?: string }
	| { op: 'light'; room: RoomId | 'all'; warmth?: number; brightness?: number; soft?: number }
	| { op: 'move'; target: string; to?: [number, number]; rot?: number; near?: string; side?: Side }
	| { op: 'turn'; target: string; deg: number }
	| { op: 'scale'; target: string; factor?: number; s?: number }
	| { op: 'add'; kind: Kind; room: RoomId; id?: string; to?: [number, number]; rot?: number; y?: number; near?: string; side?: Side; finishes?: Record<string, Finish> }
	| { op: 'remove'; target: string }
	| { op: 'duplicate'; target: string; id?: string }
	| { op: 'door'; target: string; open: boolean }
	| { op: 'style'; room: RoomId | 'all'; style: StyleName; variant?: number };

export const MAX_OPS = 40;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const isHex = (c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export interface LightState { warmth: number; brightness: number; soft: number }
interface Change { label: string; undo(): void; redo(): void; verify(): boolean; resolved: Op; layout?: Item }
export interface Txn { label: string; changes: Change[] }

export class Designer {
	readonly light: Record<RoomId, LightState> = { living: { warmth: 3200, brightness: 1, soft: 0.3 }, kitchen: { warmth: 3600, brightness: 1, soft: 0.3 }, bedroom: { warmth: 2900, brightness: 1, soft: 0.3 } };
	private done: Txn[] = [];
	private undone: Txn[] = [];
	/** called when an item's footprint changed (collision, walking) or it came / went */
	onLayout: (it: Item, gone?: boolean) => void = () => {};
	onChange: () => void = () => {};
	private seq = 1;

	constructor(readonly house: House) {
		for (const id of Object.keys(this.light) as RoomId[]) this.applyLight(id);
	}

	get items() { return this.house.items; }
	item(id: string) { return this.house.items.get(id) ?? null; }
	get canUndo() { return this.done.length > 0; }
	get canRedo() { return this.undone.length > 0; }
	get undoLabel() { return this.done[this.done.length - 1]?.label ?? ''; }
	get redoLabel() { return this.undone[this.undone.length - 1]?.label ?? ''; }
	get history() { return this.done.map((t) => t.label); }

	// ---------------------------------------------------------------- validation
	/** null when the op can run against the current home, else why not */
	validate(o: Op): string | null {
		if (!o || typeof o !== 'object') return 'not an op';
		const needItem = (id: unknown) => (typeof id === 'string' && this.item(id) ? null : `no such object "${String(id)}"`);
		const room = (r: unknown, all = false) => (r === 'all' && all) || r === 'living' || r === 'kitchen' || r === 'bedroom' ? null : `no such room "${String(r)}"`;
		switch (o.op) {
			case 'finish': {
				const e = needItem(o.target); if (e) return e;
				const it = this.item(o.target)!;
				if (o.slot !== undefined && o.slot !== '*' && !it.slots[o.slot]) return `${it.name} has no "${o.slot}" part (has ${Object.keys(it.slots).join(', ')})`;
				if (o.preset !== undefined && !PRESET_NAMES.includes(o.preset)) return `unknown material "${o.preset}"`;
				if (o.color !== undefined && !isHex(o.color)) return `bad colour "${o.color}"`;
				if (o.preset === undefined && o.color === undefined) return 'nothing to change';
				return null;
			}
			case 'light':
				return room(o.room, true) ?? (o.warmth !== undefined && !num(o.warmth, 1800, 6500) ? 'warmth must be 1800..6500 K' : o.brightness !== undefined && !num(o.brightness, 0, 3) ? 'brightness must be 0..3' : o.soft !== undefined && !num(o.soft, 0, 1) ? 'soft must be 0..1' : null);
			case 'move': {
				const e = needItem(o.target); if (e) return e;
				const it = this.item(o.target)!;
				if (it.fixed) return `${it.name} cannot be moved`;
				if (o.to && !(Array.isArray(o.to) && o.to.length === 2 && o.to.every((v) => num(v, -50, 50)))) return 'bad position';
				if (o.rot !== undefined && !num(o.rot, -720, 720)) return 'bad rotation';
				if (o.near !== undefined && typeof o.near !== 'string') return 'bad "near"';
				if (!o.to && !o.near && o.rot === undefined) return 'nowhere to move to';
				return null;
			}
			case 'turn': { const e = needItem(o.target); if (e) return e; if (this.item(o.target)!.fixed) return 'cannot turn that'; return num(o.deg, -360, 360) ? null : 'bad angle'; }
			case 'scale': { const e = needItem(o.target); if (e) return e; if (this.item(o.target)!.fixed) return 'cannot resize that'; return (o.factor !== undefined && num(o.factor, 0.4, 2.5)) || (o.s !== undefined && num(o.s, 0.4, 2.5)) ? null : 'size change must be between 0.4x and 2.5x'; }
			case 'add':
				if (!KIND_LIST.includes(o.kind)) return `cannot make a "${String(o.kind)}" (can make: ${KIND_LIST.join(', ')})`;
				if (o.id !== undefined && (typeof o.id !== 'string' || !/^[a-z0-9.-]{1,40}$/.test(o.id) || this.item(o.id))) return 'bad or used id';
				return room(o.room);
			case 'remove': { const e = needItem(o.target); if (e) return e; return this.item(o.target)!.fixed ? `${this.item(o.target)!.name} cannot be removed` : null; }
			case 'duplicate': { const e = needItem(o.target); if (e) return e; const it = this.item(o.target)!; return it.fixed || !KIND_LIST.includes(it.kind as Kind) ? `${it.name} cannot be copied` : null; }
			case 'door': { const e = needItem(o.target); if (e) return e; return this.item(o.target)!.door ? null : 'that is not a door'; }
			case 'style': return room(o.room, true) ?? (STYLE_NAMES.includes(o.style) ? null : `unknown style "${o.style}" (know: ${STYLE_NAMES.join(', ')})`);
		}
		return `unknown op "${(o as any).op}"`;
	}

	// ---------------------------------------------------------------- transactions
	/** start a transaction; apply ops to it (progressively), then commit or roll back */
	begin(label: string) {
		const t: Txn = { label, changes: [] };
		const self = this;
		return {
			txn: t,
			/** apply one op now; returns an error (and leaves the scene as it was) or null */
			apply(o: Op): string | null {
				if (o?.op === 'style') {
					for (const x of styleOps(self, o)) { const e = this.apply(x); if (e) return e; }
					return null;
				}
				const why = self.validate(o);
				if (why) return why;
				try {
					const c = self.exec(o);
					if (c) { t.changes.push(c); if (c.layout) self.onLayout(c.layout); }
					return null;
				} catch (e) { return (e as Error).message; }
			},
			rollback() { for (const c of [...t.changes].reverse()) { try { c.undo(); if (c.layout) self.onLayout(c.layout); } catch { /* best effort */ } } t.changes.length = 0; },
			/** all changes still hold? */
			verify() { return t.changes.every((c) => { try { return c.verify(); } catch { return false; } }); },
			commit() {
				if (!t.changes.length) return false;
				self.done.push(t); self.undone.length = 0;
				if (self.done.length > 200) self.done.shift();
				self.onChange();
				return true;
			},
		};
	}

	/** apply a whole list as one step; rolls back everything if one op fails */
	run(ops: Op[], label: string): { ok: boolean; error?: string; changed: number } {
		const tx = this.begin(label);
		for (const o of ops.slice(0, MAX_OPS * 3)) {
			const e = tx.apply(o);
			if (e) { tx.rollback(); return { ok: false, error: e, changed: 0 }; }
		}
		const n = tx.txn.changes.length;
		tx.commit();
		return { ok: true, changed: n };
	}

	undo() {
		const t = this.done.pop(); if (!t) return null;
		for (const c of [...t.changes].reverse()) { c.undo(); if (c.layout) this.onLayout(c.layout, !this.items.has(c.layout.id)); }
		this.undone.push(t); this.onChange(); return t.label;
	}
	redo() {
		const t = this.undone.pop(); if (!t) return null;
		for (const c of t.changes) { c.redo(); if (c.layout) this.onLayout(c.layout, !this.items.has(c.layout.id)); }
		this.done.push(t); this.onChange(); return t.label;
	}

	/** the saved design: resolved ops of everything currently applied */
	serialize(): { v: 1; light: Record<RoomId, LightState>; ops: Op[] } {
		return { v: 1, light: JSON.parse(JSON.stringify(this.light)), ops: this.done.flatMap((t) => t.changes.map((c) => c.resolved)) };
	}
	/** replay a saved design on a fresh house (ops that no longer apply are skipped) */
	load(d: { ops: Op[]; light?: Record<RoomId, LightState> }) {
		let skipped = 0;
		const tx = this.begin('Saved design');
		for (const o of d.ops ?? []) if (tx.apply(o)) skipped++;
		if (d.light) for (const id of Object.keys(this.light) as RoomId[]) if (d.light[id]) { Object.assign(this.light[id], d.light[id]); this.applyLight(id); }
		tx.commit();
		this.done.length = 0; this.undone.length = 0; // loading is not something to undo
		if (tx.txn.changes.length) this.done.push(tx.txn);
		return { applied: tx.txn.changes.length, skipped };
	}

	// ---------------------------------------------------------------- ops
	private exec(o: Op): Change | null {
		switch (o.op) {
			case 'finish': return this.execFinish(o);
			case 'light': return this.execLight(o);
			case 'move': return this.execMove(o.target, o);
			case 'turn': { const it = this.item(o.target)!; return this.execMove(o.target, { rot: THREE.MathUtils.radToDeg(it.object.rotation.y) + o.deg }); }
			case 'scale': return this.execScale(o);
			case 'add': return this.execAdd(o);
			case 'remove': return this.execRemove(o.target);
			case 'duplicate': {
				const src = this.item(o.target)!;
				const finishes: Record<string, Finish> = {};
				for (const [k, s] of Object.entries(src.slots)) { const f = finishOf(s.mat); if (f) finishes[k] = f; }
				return this.execAdd({ op: 'add', kind: src.kind as Kind, room: src.room, id: o.id, near: src.id, side: 'beside', finishes, y: src.object.position.y > 0.2 ? src.object.position.y : undefined });
			}
			case 'door': return this.execDoor(o.target, o.open);
		}
		return null;
	}

	private pickSlot(it: Item, o: { slot?: string; preset?: PresetName }): string[] {
		const slots = Object.keys(it.slots);
		if (o.slot === '*') return slots;
		if (o.slot) return [o.slot];
		if (slots.length === 1) return slots;
		const cat = o.preset ? PRESETS[o.preset].category : null;
		const prefer: Record<string, string[]> = {
			fabric: ['fabric', 'seat', 'bedding', 'shade', 'books'],
			wood: ['frame', 'top', 'legs', 'cabinets', 'seat'],
			metal: ['frame', 'legs', 'body', 'shade'],
			stone: ['top', 'worktop', 'frame'],
			floor: ['top', 'worktop', 'frame'],
			wall: ['frame', 'cabinets', 'body', 'fabric'],
			other: ['frame', 'cabinets', 'body', 'fabric', 'pot'],
		};
		for (const s of cat ? prefer[cat] : []) if (slots.includes(s)) return [s];
		return [slots[0]]; // the main part (fabric for seats, top for tables...)
	}

	private execFinish(o: Extract<Op, { op: 'finish' }>): Change {
		const it = this.item(o.target)!;
		const slots = this.pickSlot(it, o);
		const before = slots.map((s) => ({ s, f: finishOf(it.slots[s].mat) ?? { preset: 'paint' as PresetName } }));
		const after = before.map(({ s, f }) => ({ s, f: { preset: o.preset ?? f.preset, color: o.color ?? (o.preset ? undefined : f.color) } as Finish }));
		const set = (list: { s: string; f: Finish }[]) => { for (const { s, f } of list) dress(f, it.slots[s].mat); };
		set(after);
		const what = [o.preset, o.color].filter(Boolean).join(' ');
		return {
			label: `${it.name}: ${what}`, undo: () => set(before), redo: () => set(after),
			verify: () => after.every(({ s, f }) => { const cur = finishOf(it.slots[s].mat); return !!cur && cur.preset === f.preset && cur.color === f.color; }),
			resolved: { op: 'finish', target: it.id, slot: slots.length === 1 ? slots[0] : '*', preset: after[0].f.preset, color: after[0].f.color },
		};
	}

	applyLight(room: RoomId) {
		const st = this.light[room], r = this.house.rooms[room], warm = kelvin(st.warmth);
		r.fill.color.copy(warm); r.fill.intensity = 6 * st.brightness;
		for (const it of this.items.values()) if (it.room === room && it.light) { it.light.color.copy(kelvin(st.warmth - 300)); it.light.intensity = (it.lightBase ?? 1) * st.brightness; }
		// softness is shared (the sun): the average over the rooms
		const soft = (this.light.living.soft + this.light.kitchen.soft + this.light.bedroom.soft) / 3;
		this.house.sun.shadow.radius = 1 + soft * 9; this.house.sun.shadow.needsUpdate = true;
		this.house.hemi.intensity = 0.45 + soft * 0.5;
	}

	private execLight(o: Extract<Op, { op: 'light' }>): Change {
		const rooms = o.room === 'all' ? (Object.keys(this.light) as RoomId[]) : [o.room];
		const before = rooms.map((r) => ({ r, s: { ...this.light[r] } }));
		const after = before.map(({ r, s }) => ({ r, s: { warmth: o.warmth ?? s.warmth, brightness: o.brightness ?? s.brightness, soft: o.soft ?? s.soft } }));
		const set = (list: { r: RoomId; s: LightState }[]) => { for (const { r, s } of list) { Object.assign(this.light[r], s); this.applyLight(r); } };
		set(after);
		return {
			label: `Lighting (${o.room === 'all' ? 'everywhere' : this.house.rooms[o.room].name})`, undo: () => set(before), redo: () => set(after),
			verify: () => after.every(({ r, s }) => Math.abs(this.light[r].warmth - s.warmth) < 1 && Math.abs(this.house.rooms[r].fill.intensity - 6 * s.brightness) < 1e-3),
			resolved: { op: 'light', room: o.room, warmth: o.warmth, brightness: o.brightness, soft: o.soft },
		};
	}

	// ---------------------------------------------------------------- placement
	inner(r: Room): [number, number, number, number] { return [r.x0 + 0.13, r.z0 + 0.13, r.x1 - 0.13, r.z1 - 0.13]; }

	/** footprint box (x0, z0, x1, z1) of an item at a pose */
	footprint(it: Item, x: number, z: number, rotY: number, scale = it.object.scale.x): [number, number, number, number] {
		const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
		const hx = (c * it.half[0] + s * it.half[1]) * scale, hz = (s * it.half[0] + c * it.half[1]) * scale;
		return [x - hx, z - hz, x + hx, z + hz];
	}
	/** things that take floor space (not rugs, wall art, lamps on tables) */
	private blocks(it: Item) { return !it.fixed && it.mount === 'floor' && it.kind !== 'rug' && it.object.position.y < 0.2; }
	/** where an item can stand: inside its room, clear of furniture and of doorways */
	free(it: Item, x: number, z: number, rotY: number, scale?: number): boolean {
		if (!this.blocks(it)) return true;
		const r = this.house.rooms[it.room], [ix0, iz0, ix1, iz1] = this.inner(r), f = this.footprint(it, x, z, rotY, scale);
		if (f[0] < ix0 || f[1] < iz0 || f[2] > ix1 || f[3] > iz1) return false;
		const hit = (a: number[], b: number[]) => a[0] < b[2] - 0.01 && a[2] > b[0] + 0.01 && a[1] < b[3] - 0.01 && a[3] > b[1] + 0.01;
		for (const c of r.clear) if (hit(f, c)) return false;
		for (const o of this.items.values()) {
			if (o === it || o.room !== it.room || !this.blocks(o)) continue;
			if (hit(f, this.footprint(o, o.object.position.x, o.object.position.z, o.object.rotation.y))) return false;
		}
		return true;
	}
	/** nearest free spot to a wish, spiralling out (null when the room has no room) */
	findSpot(it: Item, x: number, z: number, rotY: number, scale?: number): [number, number] | null {
		if (this.free(it, x, z, rotY, scale)) return [x, z];
		for (let r = 0.1; r <= 4; r += 0.1) for (let k = 0; k < 24; k++) {
			const a = (k / 24) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
			if (this.free(it, px, pz, rotY, scale)) return [px, pz];
		}
		return null;
	}

	/** a wished-for pose next to something ("beside the window", "in front of the sofa") */
	private wish(it: Item, near: string, side: Side | undefined): { x: number; z: number; rot: number } | null {
		const r = this.house.rooms[it.room], [ix0, iz0, ix1, iz1] = this.inner(r), cur = it.object.position;
		const depth = it.half[1] * it.object.scale.x;
		if (near === 'window') {
			const w = r.windows.reduce((a, b) => (a.centre.distanceTo(cur) < b.centre.distanceTo(cur) ? a : b), r.windows[0]);
			if (!w) return null;
			// beside the window: in front of it, facing into the room, a little to one side for seats
			const along = new THREE.Vector3(-w.normal.z, 0, w.normal.x);
			const off = side === 'left' ? -0.6 : side === 'right' ? 0.6 : 0.45;
			const p = w.centre.clone().addScaledVector(w.normal, depth + 0.3).addScaledVector(along, off * Math.min(1, w.width / 2));
			return { x: p.x, z: p.z, rot: Math.atan2(w.normal.x, w.normal.z) };
		}
		if (near === 'center') return { x: (ix0 + ix1) / 2, z: (iz0 + iz1) / 2, rot: it.object.rotation.y };
		if (near === 'corner') {
			const cs: [number, number][] = [[ix0, iz0], [ix1, iz0], [ix0, iz1], [ix1, iz1]];
			const c = cs.reduce((a, b) => (Math.hypot(a[0] - cur.x, a[1] - cur.z) < Math.hypot(b[0] - cur.x, b[1] - cur.z) ? a : b));
			return { x: c[0] + Math.sign((ix0 + ix1) / 2 - c[0]) * (depth + 0.3), z: c[1] + Math.sign((iz0 + iz1) / 2 - c[1]) * (depth + 0.3), rot: it.object.rotation.y };
		}
		if (near === 'wall') {
			// the nearest wall, back against it
			const d = [cur.x - ix0, ix1 - cur.x, cur.z - iz0, iz1 - cur.z], k = d.indexOf(Math.min(...d));
			const rot = [Math.PI / 2, -Math.PI / 2, 0, Math.PI][k];
			const x = k === 0 ? ix0 + depth + 0.02 : k === 1 ? ix1 - depth - 0.02 : cur.x, z = k === 2 ? iz0 + depth + 0.02 : k === 3 ? iz1 - depth - 0.02 : cur.z;
			return { x, z, rot };
		}
		if (near === 'door') {
			const doors = [...this.items.values()].filter((o) => o.door && (o.room === it.room || (o.id === 'door.bedroom' && it.room === 'bedroom')));
			const d = doors[0]; if (!d) return null;
			const p = d.object.position;
			return { x: p.x + 1.2, z: p.z + (it.room === 'bedroom' ? -1.2 : -1.2), rot: it.object.rotation.y };
		}
		const o = this.item(near);
		if (!o) return null;
		const op = o.object.position, orot = o.object.rotation.y;
		const right = new THREE.Vector3(Math.cos(orot), 0, -Math.sin(orot)), front = new THREE.Vector3(Math.sin(orot), 0, Math.cos(orot));
		const ow = o.half[0] * o.object.scale.x, od = o.half[1] * o.object.scale.x, iw = it.half[0] * it.object.scale.x;
		if (side === 'front') { const p = op.clone().addScaledVector(front, od + depth + 0.35); return { x: p.x, z: p.z, rot: orot + Math.PI }; }
		if (side === 'behind') { const p = op.clone().addScaledVector(front, -(od + depth + 0.25)); return { x: p.x, z: p.z, rot: orot }; }
		// beside: whichever side is free and nearer
		const cands = (side === 'left' ? [-1] : side === 'right' ? [1] : [1, -1]).map((sg) => { const p = op.clone().addScaledVector(right, sg * (ow + iw + 0.12)); return { x: p.x, z: p.z, rot: orot }; });
		cands.sort((a, b) => Math.hypot(a.x - cur.x, a.z - cur.z) - Math.hypot(b.x - cur.x, b.z - cur.z));
		return cands.find((c) => this.free(it, c.x, c.z, c.rot)) ?? cands[0];
	}

	private setPose(it: Item, x: number, z: number, rot: number) {
		it.object.position.x = x; it.object.position.z = z; it.object.rotation.y = rot;
		it.object.updateMatrixWorld(true);
	}

	private execMove(id: string, o: { to?: [number, number]; rot?: number; near?: string; side?: Side }): Change {
		const it = this.item(id)!, p = it.object.position;
		const before = { x: p.x, z: p.z, rot: it.object.rotation.y };
		let want = { x: p.x, z: p.z, rot: o.rot !== undefined ? THREE.MathUtils.degToRad(o.rot) : before.rot };
		if (o.to) want = { x: o.to[0], z: o.to[1], rot: want.rot };
		else if (o.near) {
			const w = this.wish(it, o.near, o.side);
			if (!w) throw new Error(`cannot find "${o.near}" in the ${this.house.rooms[it.room].name}`);
			want = { x: w.x, z: w.z, rot: o.rot !== undefined ? want.rot : w.rot };
		}
		const spot = it.mount === 'floor' ? this.findSpot(it, want.x, want.z, want.rot) : [want.x, want.z] as [number, number];
		if (!spot) throw new Error(`there is no free space for the ${it.name} there`);
		const after = { x: spot[0], z: spot[1], rot: want.rot };
		this.setPose(it, after.x, after.z, after.rot);
		return {
			label: `Move ${it.name}`, layout: it,
			undo: () => this.setPose(it, before.x, before.z, before.rot), redo: () => this.setPose(it, after.x, after.z, after.rot),
			verify: () => Math.abs(it.object.position.x - after.x) < 1e-4 && Math.abs(it.object.position.z - after.z) < 1e-4,
			resolved: { op: 'move', target: id, to: [r3(after.x), r3(after.z)], rot: r3(THREE.MathUtils.radToDeg(after.rot)) },
		};
	}

	private execScale(o: Extract<Op, { op: 'scale' }>): Change {
		const it = this.item(o.target)!, before = it.object.scale.x, after = o.s ?? before * (o.factor ?? 1);
		if (!num(after, 0.4, 2.5)) throw new Error('that would make it too big or too small');
		const p = it.object.position;
		const spot = it.mount === 'floor' ? this.findSpot(it, p.x, p.z, it.object.rotation.y, after) : [p.x, p.z];
		if (!spot) throw new Error(`there is no room for a bigger ${it.name}`);
		const bp = { x: p.x, z: p.z };
		const set = (s: number, x: number, z: number) => { it.object.scale.setScalar(s); it.object.position.x = x; it.object.position.z = z; it.object.updateMatrixWorld(true); };
		set(after, spot[0], spot[1]);
		return {
			label: `${after > before ? 'Enlarge' : 'Shrink'} ${it.name}`, layout: it,
			undo: () => set(before, bp.x, bp.z), redo: () => set(after, spot[0], spot[1]),
			verify: () => Math.abs(it.object.scale.x - after) < 1e-4,
			resolved: { op: 'scale', target: it.id, s: r3(after) },
		};
	}

	private execAdd(o: Extract<Op, { op: 'add' }>): Change {
		const room = this.house.rooms[o.room];
		let id = o.id ?? `${o.room}.${o.kind.replace(/ /g, '-')}-${this.seq++}`;
		while (this.item(id)) id = `${o.room}.${o.kind.replace(/ /g, '-')}-${this.seq++}`;
		const [ix0, iz0, ix1, iz1] = this.inner(room);
		const it = makeItem(id, o.kind, o.kind, o.room, (ix0 + ix1) / 2, (iz0 + iz1) / 2, THREE.MathUtils.degToRad(o.rot ?? 0), o.finishes, o.y ?? (o.kind === 'pendant light' ? 2.7 : 0));
		this.items.set(id, it); this.house.root.add(it.object);
		try {
			let want = { x: (ix0 + ix1) / 2, z: (iz0 + iz1) / 2, rot: it.object.rotation.y };
			if (o.to) want = { x: o.to[0], z: o.to[1], rot: want.rot };
			else if (o.near) { const w = this.wish(it, o.near, o.side); if (w) want = { x: w.x, z: w.z, rot: o.rot !== undefined ? want.rot : w.rot }; }
			else if (it.mount === 'wall') { const w = this.wish(it, 'wall', undefined); if (w) want = w; }
			const spot = it.mount === 'floor' ? this.findSpot(it, want.x, want.z, want.rot) : [want.x, want.z] as [number, number];
			if (!spot) throw new Error(`there is no free space for a ${o.kind} in the ${room.name}`);
			this.setPose(it, spot[0], spot[1], want.rot);
		} catch (e) { this.items.delete(id); this.house.root.remove(it.object); throw e; }
		if (it.light) this.applyLight(o.room);
		const put = () => { this.items.set(id, it); this.house.root.add(it.object); if (it.light) this.applyLight(o.room); };
		const take = () => { this.items.delete(id); this.house.root.remove(it.object); };
		const finishes: Record<string, Finish> = {};
		for (const [k, s] of Object.entries(it.slots)) { const f = finishOf(s.mat); if (f) finishes[k] = f; }
		return {
			label: `Add ${o.kind}`, layout: it, undo: take, redo: put,
			verify: () => this.items.get(id) === it && !!it.object.parent,
			resolved: { op: 'add', kind: o.kind, room: o.room, id, to: [r3(it.object.position.x), r3(it.object.position.z)], rot: r3(THREE.MathUtils.radToDeg(it.object.rotation.y)), y: it.object.position.y || undefined, finishes },
		};
	}

	private execRemove(id: string): Change {
		const it = this.item(id)!, parent = it.object.parent!;
		const take = () => { this.items.delete(id); parent.remove(it.object); };
		const put = () => { this.items.set(id, it); parent.add(it.object); };
		take();
		return { label: `Remove ${it.name}`, layout: it, undo: put, redo: take, verify: () => !this.items.has(id), resolved: { op: 'remove', target: id } };
	}

	private execDoor(id: string, open: boolean): Change {
		const it = this.item(id)!, before = it.door!.open;
		const set = (v: boolean) => { it.door!.open = v; };
		set(open);
		return { label: `${open ? 'Open' : 'Close'} ${it.name}`, layout: it, undo: () => set(before), redo: () => set(open), verify: () => it.door!.open === open, resolved: { op: 'door', target: id, open } };
	}

	/** animate doors (called every frame) */
	/** animates doors; true while something moved */
	update(dt: number) {
		let moved = false;
		for (const it of this.items.values()) {
			const d = it.door; if (!d) continue;
			const goal = d.open ? 1 : 0;
			if (d.t !== goal) { moved = true; d.t += Math.sign(goal - d.t) * Math.min(Math.abs(goal - d.t), dt * 1.6); d.leaf.rotation.y = -d.t * 1.45 * (d.exit ? -1 : 1); }
		}
		return moved;
	}
}

// ------------------------------------------------------------------ styles
/**
 * Room styles as coordinated, deterministic recipes: walls, floor, ceiling,
 * textiles, wood and metal, lighting, and sometimes a piece to add. Variants
 * (0..2) give alternatives within a style.
 */
export type StyleName = 'modern' | 'minimal' | 'luxury' | 'scandinavian' | 'industrial' | 'rustic' | 'warm' | 'japandi' | 'coastal' | 'cool';
interface Recipe { walls: Finish; floor: Finish; ceiling?: Finish; fabric: Finish; wood: Finish; metal: Finish; stone?: Finish; accent?: string; warmth: number; brightness: number; soft: number; add?: Kind[] }
const RECIPES: Record<StyleName, Recipe[]> = {
	modern: [
		{ walls: { preset: 'paint', color: '#e9e9e6' }, floor: { preset: 'concrete', color: '#c4c2be' }, fabric: { preset: 'linen', color: '#8d9196' }, wood: { preset: 'walnut' }, metal: { preset: 'black metal' }, stone: { preset: 'marble' }, accent: '#2f3a4a', warmth: 4000, brightness: 1.15, soft: 0.25, add: ['floor lamp', 'plant'] },
		{ walls: { preset: 'paint', color: '#f2f1ee' }, floor: { preset: 'terrazzo' }, fabric: { preset: 'velvet', color: '#3c5a6b' }, wood: { preset: 'oak' }, metal: { preset: 'brushed steel' }, stone: { preset: 'marble' }, accent: '#c96f3b', warmth: 3800, brightness: 1.1, soft: 0.3, add: ['plant'] },
		{ walls: { preset: 'paint', color: '#d9d8d4' }, floor: { preset: 'oak' }, fabric: { preset: 'leather', color: '#3a2d26' }, wood: { preset: 'walnut' }, metal: { preset: 'chrome' }, stone: { preset: 'slate' }, accent: '#1f2a36', warmth: 4200, brightness: 1.2, soft: 0.2 },
	],
	minimal: [
		{ walls: { preset: 'paint', color: '#f4f3f0' }, floor: { preset: 'whitewashed oak' }, fabric: { preset: 'linen', color: '#e2ded6' }, wood: { preset: 'whitewashed oak' }, metal: { preset: 'brushed steel' }, warmth: 4300, brightness: 1.2, soft: 0.5 },
		{ walls: { preset: 'plaster', color: '#eceae5' }, floor: { preset: 'concrete', color: '#d6d4cf' }, fabric: { preset: 'wool', color: '#d8d4cc' }, wood: { preset: 'oak' }, metal: { preset: 'black metal' }, warmth: 4000, brightness: 1.15, soft: 0.5 },
		{ walls: { preset: 'paint', color: '#ffffff' }, floor: { preset: 'white tile', color: '#f1f0ec' }, fabric: { preset: 'linen', color: '#cfcac1' }, wood: { preset: 'oak' }, metal: { preset: 'chrome' }, warmth: 4500, brightness: 1.25, soft: 0.45 },
	],
	luxury: [
		{ walls: { preset: 'plaster', color: '#e4dccd' }, floor: { preset: 'marble' }, fabric: { preset: 'velvet', color: '#1f3b4d' }, wood: { preset: 'walnut' }, metal: { preset: 'brass' }, stone: { preset: 'marble' }, accent: '#b08d4f', warmth: 2900, brightness: 0.95, soft: 0.45, add: ['floor lamp', 'plant', 'rug'] },
		{ walls: { preset: 'paint', color: '#2e3a35' }, floor: { preset: 'herringbone' }, fabric: { preset: 'velvet', color: '#6b2d3a' }, wood: { preset: 'walnut' }, metal: { preset: 'brass' }, stone: { preset: 'marble' }, accent: '#c9a24a', warmth: 2800, brightness: 0.9, soft: 0.5, add: ['floor lamp'] },
		{ walls: { preset: 'paint', color: '#ebe6dd' }, floor: { preset: 'travertine' }, fabric: { preset: 'leather', color: '#7a4b2c' }, wood: { preset: 'walnut' }, metal: { preset: 'brass' }, stone: { preset: 'travertine' }, warmth: 3000, brightness: 1, soft: 0.4 },
	],
	scandinavian: [
		{ walls: { preset: 'paint', color: '#f3f1ec' }, floor: { preset: 'whitewashed oak' }, fabric: { preset: 'wool', color: '#c9c4ba' }, wood: { preset: 'oak' }, metal: { preset: 'black metal' }, accent: '#9caf8f', warmth: 3600, brightness: 1.2, soft: 0.55, add: ['plant', 'rug'] },
		{ walls: { preset: 'paint', color: '#e7ebe8' }, floor: { preset: 'oak' }, fabric: { preset: 'linen', color: '#a9b4ad' }, wood: { preset: 'whitewashed oak' }, metal: { preset: 'brushed steel' }, warmth: 3800, brightness: 1.2, soft: 0.6 },
		{ walls: { preset: 'paint', color: '#efe8de' }, floor: { preset: 'oak' }, fabric: { preset: 'wool', color: '#d8c7b0' }, wood: { preset: 'oak' }, metal: { preset: 'brass' }, warmth: 3400, brightness: 1.15, soft: 0.55 },
	],
	industrial: [
		{ walls: { preset: 'brick' }, floor: { preset: 'concrete', color: '#9d9a95' }, fabric: { preset: 'leather', color: '#5b3a28' }, wood: { preset: 'walnut' }, metal: { preset: 'black metal' }, stone: { preset: 'concrete' }, warmth: 3200, brightness: 1, soft: 0.25 },
		{ walls: { preset: 'concrete', color: '#b5b2ac' }, floor: { preset: 'oak' }, fabric: { preset: 'linen', color: '#5e6266' }, wood: { preset: 'walnut' }, metal: { preset: 'black metal' }, warmth: 3500, brightness: 1.05, soft: 0.2 },
		{ walls: { preset: 'brick', color: '#cbbcb0' }, floor: { preset: 'slate' }, fabric: { preset: 'leather', color: '#2b2522' }, wood: { preset: 'oak' }, metal: { preset: 'brushed steel' }, warmth: 3000, brightness: 0.95, soft: 0.3 },
	],
	rustic: [
		{ walls: { preset: 'plaster', color: '#e6dccb' }, floor: { preset: 'natural stone' }, fabric: { preset: 'wool', color: '#a88b6a' }, wood: { preset: 'walnut' }, metal: { preset: 'black metal' }, stone: { preset: 'natural stone' }, warmth: 2700, brightness: 0.9, soft: 0.5, add: ['rug'] },
		{ walls: { preset: 'brick', color: '#e8d8c6' }, floor: { preset: 'herringbone' }, fabric: { preset: 'linen', color: '#b9a084' }, wood: { preset: 'oak' }, metal: { preset: 'brass' }, warmth: 2800, brightness: 0.95, soft: 0.5 },
		{ walls: { preset: 'plaster', color: '#d8c9b4' }, floor: { preset: 'oak' }, fabric: { preset: 'leather', color: '#8a5a3b' }, wood: { preset: 'walnut' }, metal: { preset: 'black metal' }, warmth: 2600, brightness: 0.9, soft: 0.55 },
	],
	warm: [
		{ walls: { preset: 'paint', color: '#eadbc6' }, floor: { preset: 'oak' }, fabric: { preset: 'wool', color: '#b07e5a' }, wood: { preset: 'walnut' }, metal: { preset: 'brass' }, accent: '#c0643f', warmth: 2700, brightness: 0.95, soft: 0.6, add: ['rug', 'floor lamp'] },
		{ walls: { preset: 'plaster', color: '#e9d2b8' }, floor: { preset: 'herringbone' }, fabric: { preset: 'velvet', color: '#8a4b2e' }, wood: { preset: 'walnut' }, metal: { preset: 'brass' }, warmth: 2600, brightness: 0.9, soft: 0.65 },
		{ walls: { preset: 'paint', color: '#efe0c8' }, floor: { preset: 'oak' }, fabric: { preset: 'linen', color: '#c9a27e' }, wood: { preset: 'oak' }, metal: { preset: 'brass' }, warmth: 2800, brightness: 1, soft: 0.6 },
	],
	japandi: [
		{ walls: { preset: 'plaster', color: '#e7e1d6' }, floor: { preset: 'oak' }, fabric: { preset: 'linen', color: '#bdb3a4' }, wood: { preset: 'oak' }, metal: { preset: 'black metal' }, stone: { preset: 'slate' }, warmth: 3200, brightness: 1, soft: 0.6, add: ['plant'] },
		{ walls: { preset: 'paint', color: '#dcd5c8' }, floor: { preset: 'whitewashed oak' }, fabric: { preset: 'wool', color: '#7d7466' }, wood: { preset: 'walnut' }, metal: { preset: 'black metal' }, warmth: 3000, brightness: 0.95, soft: 0.65 },
		{ walls: { preset: 'plaster', color: '#efe9df' }, floor: { preset: 'oak' }, fabric: { preset: 'linen', color: '#9c9585' }, wood: { preset: 'oak' }, metal: { preset: 'brass' }, warmth: 3100, brightness: 1, soft: 0.6 },
	],
	coastal: [
		{ walls: { preset: 'paint', color: '#eef2f2' }, floor: { preset: 'whitewashed oak' }, fabric: { preset: 'linen', color: '#8fb3c8' }, wood: { preset: 'whitewashed oak' }, metal: { preset: 'brushed steel' }, accent: '#2f6c8f', warmth: 4500, brightness: 1.25, soft: 0.5, add: ['plant'] },
		{ walls: { preset: 'paint', color: '#dfeaf0' }, floor: { preset: 'oak' }, fabric: { preset: 'linen', color: '#f0ece2' }, wood: { preset: 'whitewashed oak' }, metal: { preset: 'chrome' }, warmth: 4800, brightness: 1.3, soft: 0.5 },
		{ walls: { preset: 'paint', color: '#f4efe4' }, floor: { preset: 'travertine' }, fabric: { preset: 'linen', color: '#a9c7d6' }, wood: { preset: 'oak' }, metal: { preset: 'brass' }, warmth: 4300, brightness: 1.2, soft: 0.5 },
	],
	cool: [
		{ walls: { preset: 'paint', color: '#e2e7ec' }, floor: { preset: 'slate' }, fabric: { preset: 'linen', color: '#7d8c9a' }, wood: { preset: 'whitewashed oak' }, metal: { preset: 'chrome' }, warmth: 5200, brightness: 1.2, soft: 0.3 },
		{ walls: { preset: 'paint', color: '#d9e1e6' }, floor: { preset: 'concrete', color: '#b8bcc0' }, fabric: { preset: 'velvet', color: '#3d4f63' }, wood: { preset: 'oak' }, metal: { preset: 'brushed steel' }, warmth: 5000, brightness: 1.15, soft: 0.3 },
		{ walls: { preset: 'paint', color: '#eef1f4' }, floor: { preset: 'white tile', color: '#e8ecef' }, fabric: { preset: 'linen', color: '#9fb0bf' }, wood: { preset: 'whitewashed oak' }, metal: { preset: 'chrome' }, warmth: 5500, brightness: 1.25, soft: 0.35 },
	],
};
export const STYLE_NAMES = Object.keys(RECIPES) as StyleName[];

/** a style for a room (or every room) as ordinary ops */
export function styleOps(d: Designer, o: { room: RoomId | 'all'; style: StyleName; variant?: number }): Op[] {
	const rooms = o.room === 'all' ? (['living', 'kitchen', 'bedroom'] as RoomId[]) : [o.room];
	const r = RECIPES[o.style][((o.variant ?? 0) % 3 + 3) % 3];
	const ops: Op[] = [];
	for (const room of rooms) {
		ops.push({ op: 'finish', target: `${room}.walls`, slot: 'main', ...r.walls });
		// kitchens keep a wipeable floor unless the style brings stone
		const floor = room === 'kitchen' && PRESETS[r.floor.preset].category === 'wood' ? (r.stone ?? { preset: 'white tile' as PresetName }) : r.floor;
		ops.push({ op: 'finish', target: `${room}.floor`, slot: 'main', ...floor });
		if (r.ceiling) ops.push({ op: 'finish', target: `${room}.ceiling`, slot: 'main', ...r.ceiling });
		for (const it of d.items.values()) {
			if (it.room !== room || it.fixed) continue;
			for (const [slot] of Object.entries(it.slots)) {
				const f = slotFinish(it, slot, r);
				if (f) ops.push({ op: 'finish', target: it.id, slot, ...f });
			}
		}
		ops.push({ op: 'light', room, warmth: r.warmth, brightness: r.brightness, soft: r.soft });
		for (const k of r.add ?? []) {
			// only what the room lacks
			if ([...d.items.values()].some((it) => it.room === room && it.kind === k)) continue;
			ops.push({ op: 'add', kind: k, room, near: k === 'floor lamp' ? (room === 'living' ? 'living.sofa' : 'corner') : 'corner', side: 'beside' });
		}
	}
	return ops;
}
function slotFinish(it: Item, slot: string, r: Recipe): Finish | null {
	const k = it.kind;
	if (slot === 'fabric' || slot === 'bedding' || (slot === 'seat' && k === 'bar stool')) return slot === 'bedding' ? { preset: 'linen', color: r.fabric.color && lighten(r.fabric.color) } : r.fabric;
	if (slot === 'shade') return k === 'pendant light' ? r.metal : { preset: 'linen', color: '#efe6d6' };
	if (slot === 'legs' || (slot === 'frame' && (k === 'coffee table' || k === 'side table' || k === 'desk' || k === 'floor lamp' || k === 'bar stool' || k === 'artwork'))) return r.metal;
	if (slot === 'top' && r.stone && (k === 'coffee table' || k === 'side table')) return r.stone;
	if (slot === 'worktop') return r.stone ?? { preset: 'marble' };
	if (slot === 'frame' || slot === 'top' || slot === 'seat') return r.wood;
	if (slot === 'cabinets') return { preset: 'lacquer', color: r.accent && k === 'kitchen counter' ? mix(r.walls.color ?? '#eeeeee', r.accent, 0.25) : r.walls.color ?? '#eeeeee' };
	if (slot === 'art' && r.accent) return { preset: 'paint', color: r.accent };
	if (slot === 'pot') return { preset: 'lacquer', color: r.accent ? mix('#e8e4dc', r.accent, 0.4) : '#e8e4dc' };
	return null;
}
const mix = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
const lighten = (c: string) => mix(c, '#f5f2ec', 0.65);

/** alternatives to show for "show me three alternatives": the same style's three variants */
export function alternatives(room: RoomId | 'all', style: StyleName): { label: string; op: Op }[] {
	return [0, 1, 2].map((v) => ({ label: `${style[0].toUpperCase() + style.slice(1)} ${['A', 'B', 'C'][v]}: ${describeRecipe(RECIPES[style][v])}`, op: { op: 'style', room, style, variant: v } }));
}
function describeRecipe(r: Recipe) { return `${r.walls.preset === 'paint' ? 'painted' : r.walls.preset} walls, ${r.floor.preset} floor, ${r.fabric.preset}, ${r.metal.preset}`; }

export { KINDS };
