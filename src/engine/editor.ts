import * as THREE from 'three';
import type { Entity, EntityWorld, SpawnSpec, TRS } from './entities';
import { readTRS, writeTRS } from './entities';
import { History, type Command } from './commands';
import { type Op, type OpContext, opToCommand, validateOp, compactOps } from './ops';
import type { Runtime } from './runtime';
import { log } from './log';

/**
 * The editor: selection, undo/redo, scene save / load / autosave, spawning,
 * and the in-world tools (pick with the desktop crosshair or a VR ray, move
 * an object with snapping). Everything goes through Ops (see ops.ts), so the
 * UI, the VR tools and the Claude agent all change the scene the same way.
 */
const SAVE_PREFIX = 'studio.scene.';
const AUTOSAVE = 'studio.autosave';
const FORMAT = 1;

interface DocFile { format: number; saved: string; ops: Op[] }

export class Editor {
	readonly history = new History();
	selection: Entity[] = [];
	/** ops evicted from the undo history still belong to the scene */
	private committed: Op[] = [];
	snap = { grid: 0.05, angle: 15 };
	/** in-world tools on: clicks / trigger select instead of grabbing */
	worldTool = false;
	private highlights = new Map<Entity, THREE.BoxHelper>();
	private autosaveTimer = 0;
	/** set while an object is being moved in the world */
	moving: { e: Entity; from: TRS; dist: number; source: 'desktop' | number; offset: THREE.Matrix4 } | null = null;
	selectionVersion = 0;
	private storage: Storage | null = null;

	constructor(readonly world: EntityWorld, readonly runtime: Runtime, private ctx: OpContext, private scene: THREE.Scene) {
		try { this.storage = window.localStorage; } catch { this.storage = null; }
		this.history.onChange = () => this.scheduleAutosave();
		this.history.onEvict = (c) => { const op = (c as any).op as Op | undefined; if (op) this.committed.push(op); if ((c as any).ops) this.committed.push(...(c as any).ops); };
		runtime.onChange = (m) => { this.worldTool = m === 'edit'; };
	}

	// ------------------------------------------------------------------ ops
	/** validate, run, record. Returns false (and logs why) if refused. */
	apply(op: Op, label?: string): boolean {
		const why = validateOp(op, this.world);
		if (why) { log.warn(`Refused ${op.op} on ${op.id}: ${why}`); return false; }
		let cmd: Command;
		try { cmd = opToCommand(op, this.ctx); } catch (err) { log.error(`${op.op} failed: ${(err as Error).message}`); return false; }
		if (label) cmd.label = label;
		(cmd as any).op = op;
		const ok = this.history.run(cmd);
		if (ok && op.op === 'spawn') this.select(this.world.get(op.id) ?? null);
		if (ok && op.op === 'delete') this.selection = this.selection.filter((e) => e.id !== op.id);
		this.selectionVersion++;
		return ok;
	}

	/**
	 * Several ops as one transaction (agent proposals, imports): each op is
	 * validated against the scene as the earlier ones left it; if any is
	 * refused or fails, everything already applied is undone and nothing
	 * stays. On success it is a single undo step.
	 */
	applyBatch(ops: Op[], label: string): { ok: true } | { ok: false; index: number; why: string } {
		let fail: { index: number; why: string } | null = null;
		let done: Command[] = [];
		const ctx = this.ctx, world = this.world;
		const batch: Command & { ops: Op[] } = {
			label, live: true, ops,
			do() {
				done = [];
				for (let i = 0; i < ops.length; i++) {
					const why = validateOp(ops[i], world);
					if (why) { fail = { index: i, why }; break; }
					try { const c = opToCommand(ops[i], ctx); c.do(); done.push(c); if (!c.live) batch.note = c.note; }
					catch (err) { fail = { index: i, why: (err as Error).message }; break; }
				}
				if (fail) {
					for (const c of done.reverse()) { try { c.undo(); } catch { /* best effort */ } }
					done = [];
					throw new Error(`step ${fail.index + 1} (${ops[fail.index]?.op}): ${fail.why} - nothing was changed`);
				}
			},
			undo() { for (const c of [...done].reverse()) c.undo(); },
		};
		const ok = this.history.run(batch);
		this.selectionVersion++;
		return ok ? { ok: true } : { ok: false, ...(fail ?? { index: -1, why: 'failed' }) };
	}

	undo() { this.history.undo(); this.selectionVersion++; }
	redo() { this.history.redo(); this.selectionVersion++; }

	/** the scene as data: everything applied since load */
	ops(): Op[] {
		const live = (this.history as any).done as (Command & { op?: Op; ops?: Op[] })[];
		return compactOps([...this.committed, ...live.flatMap((c) => c.ops ?? (c.op ? [c.op] : []))]);
	}

	// ------------------------------------------------------------------ selection
	select(e: Entity | null, additive = false) {
		if (!additive) this.selection = [];
		if (e) {
			const i = this.selection.indexOf(e);
			if (i >= 0 && additive) this.selection.splice(i, 1); else if (i < 0) this.selection.push(e);
		}
		this.selectionVersion++;
		this.syncHighlights();
	}

	private syncHighlights() {
		for (const [e, h] of this.highlights) if (!this.selection.includes(e)) { this.scene.remove(h); h.dispose(); this.highlights.delete(e); }
		for (const e of this.selection) if (!this.highlights.has(e)) {
			const h = new THREE.BoxHelper(e.object, 0xffc21a);
			h.name = 'editor-highlight';
			h.userData.noBullet = true;
			(h.material as THREE.LineBasicMaterial).depthTest = false;
			h.renderOrder = 998;
			this.scene.add(h);
			this.highlights.set(e, h);
		}
	}

	/** call every frame: highlights follow moving things */
	update() {
		for (const [e, h] of this.highlights) { h.visible = !e.deleted && e.object.visible; if (h.visible) h.setFromObject(e.object); }
	}

	// ------------------------------------------------------------------ actions
	spawn(kind: SpawnSpec['kind'], at: THREE.Vector3, opts: { dynamic?: boolean; color?: string; size?: [number, number, number] } = {}) {
		const size = opts.size ?? (kind === 'ramp' ? [0.6, 0.25, 0.8] : kind === 'light' ? [0.1, 0.1, 0.1] : [0.25, 0.25, 0.25]);
		const id = this.world.spawnId(kind);
		const to: TRS = { p: [this.snapV(at.x), Math.max(at.y, size[1] / 2 + 0.01), this.snapV(at.z)], r: [0, 0, 0], s: [1, 1, 1] };
		return this.apply({ op: 'spawn', id, spec: { kind, dynamic: opts.dynamic ?? kind !== 'ramp', size }, to, color: opts.color ?? '#d8d4cc' });
	}

	duplicate() {
		const made: string[] = [];
		for (const e of [...this.selection]) {
			if (e.locked) { log.warn(`${e.name} cannot be duplicated`); continue; }
			if (e.layer === 'Weapons') { log.warn(`${e.name}: weapons carry a firing system that is not cloned; not duplicated`); continue; }
			const t = readTRS(e.object);
			t.p = [t.p[0] + 0.15, t.p[1] + 0.05, t.p[2]];
			const id = this.world.spawnId('copy');
			if (this.apply({ op: 'spawn', id, spec: { kind: 'clone', source: e.id, dynamic: !!e.prop, size: [1, 1, 1] }, to: t, color: '#ffffff' })) made.push(id);
		}
		return made;
	}

	/** deleting authored scene content asks first (`confirmed`); spawned things go straight away */
	delete(confirmed = false): 'done' | 'confirm' | 'nothing' {
		const victims = this.selection.filter((e) => !e.locked);
		if (!victims.length) return 'nothing';
		if (!confirmed && victims.some((e) => !e.spawn)) return 'confirm';
		for (const e of victims) this.apply({ op: 'delete', id: e.id });
		this.select(null);
		return 'done';
	}

	setTRS(e: Entity, to: TRS, from?: TRS) {
		return this.apply({ op: 'trs', id: e.id, to, from });
	}

	snapV(v: number) { return this.snap.grid > 0 ? Math.round(v / this.snap.grid) * this.snap.grid : v; }
	snapA(deg: number) { return this.snap.angle > 0 ? Math.round(deg / this.snap.angle) * this.snap.angle : deg; }

	// ------------------------------------------------------------------ save / load
	private write(key: string, ops: Op[]) {
		if (!this.storage) { log.error('Saving is unavailable here (no browser storage)'); return false; }
		const doc: DocFile = { format: FORMAT, saved: new Date().toISOString(), ops };
		try { this.storage.setItem(key, JSON.stringify(doc)); return true; } catch (err) { log.error('Save failed: ' + (err as Error).message); return false; }
	}

	save(slot = 'main') {
		const ops = this.ops();
		if (this.write(SAVE_PREFIX + slot, ops)) log.info(`Saved scene "${slot}" (${ops.length} changes)`);
	}

	private scheduleAutosave() {
		clearTimeout(this.autosaveTimer);
		this.autosaveTimer = window.setTimeout(() => this.write(AUTOSAVE, this.ops()), 1500);
	}

	slots() {
		const out: { slot: string; saved: string; n: number }[] = [];
		if (!this.storage) return out;
		for (let i = 0; i < this.storage.length; i++) {
			const k = this.storage.key(i)!;
			if (!k.startsWith(SAVE_PREFIX)) continue;
			try { const d = JSON.parse(this.storage.getItem(k)!); out.push({ slot: k.slice(SAVE_PREFIX.length), saved: d.saved, n: d.ops?.length ?? 0 }); } catch { /* skip */ }
		}
		return out;
	}

	autosaveInfo() {
		try { const d = JSON.parse(this.storage?.getItem(AUTOSAVE) ?? 'null'); return d?.ops?.length ? { saved: d.saved as string, n: d.ops.length as number } : null; } catch { return null; }
	}

	/**
	 * Back to the scene as the game built it (undo everything), then replay a
	 * saved document. Each op is validated; invalid ones are skipped and
	 * logged, so a damaged save cannot leave the scene half-broken.
	 */
	load(slot: string | null): { applied: number; skipped: number } {
		const raw = this.storage?.getItem(slot === null ? AUTOSAVE : SAVE_PREFIX + slot);
		if (!raw) { log.warn('Nothing saved' + (slot ? ` in "${slot}"` : '')); return { applied: 0, skipped: 0 }; }
		let doc: DocFile;
		try { doc = JSON.parse(raw); } catch { log.error('Save is not valid JSON; nothing loaded'); return { applied: 0, skipped: 0 }; }
		if (doc.format !== FORMAT || !Array.isArray(doc.ops)) { log.error('Unknown save format; nothing loaded'); return { applied: 0, skipped: 0 }; }
		this.resetToBuilt();
		let applied = 0, skipped = 0;
		for (const op of doc.ops) {
			if (this.apply(op)) applied++; else skipped++;
		}
		log.info(`Loaded ${slot === null ? 'autosave' : `"${slot}"`}: ${applied} changes${skipped ? `, ${skipped} skipped (see warnings)` : ''}`);
		this.select(null);
		return { applied, skipped };
	}

	/** undo everything there is (back to the scene as built) */
	resetToBuilt() {
		while (this.history.canUndo) this.history.undo();
		if (this.committed.length) log.warn(`${this.committed.length} early changes are older than the undo history and stay applied`);
		this.history.clear();
	}

	exportJSON() { return JSON.stringify({ format: FORMAT, saved: new Date().toISOString(), ops: this.ops() }, null, 1); }

	// ------------------------------------------------------------------ in-world moving
	/** begin moving the first selected entity with a pose source (desktop view or a VR hand) */
	beginMove(source: 'desktop' | number, holder: THREE.Matrix4) {
		const e = this.selection[0];
		if (!e || e.locked) return false;
		const offset = holder.clone().invert().multiply(e.object.matrixWorld);
		this.moving = { e, from: readTRS(e.object), dist: 0, source, offset };
		if (e.prop) this.ctx.physics?.setPropEnabled(e.prop, false);
		return true;
	}

	/** follow the holder, snapped; physics off while carried */
	updateMove(holder: THREE.Matrix4, extraYawDeg = 0) {
		const m = this.moving;
		if (!m) return;
		const M = holder.clone().multiply(m.offset);
		const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
		M.decompose(p, q, s);
		const eul = new THREE.Euler().setFromQuaternion(q, 'YXZ');
		const d = THREE.MathUtils.radToDeg;
		const t: TRS = {
			p: [this.snapV(p.x), Math.max(0, this.snapV(p.y)), this.snapV(p.z)],
			r: [0, 0, 0],
			s: readTRS(m.e.object).s,
		};
		// keep the object's own tilt, turn about the vertical with the hand / view (snapped)
		const from = new THREE.Euler(...(m.from.r.map(THREE.MathUtils.degToRad) as [number, number, number]));
		const yaw = this.snapA(d(eul.y) + extraYawDeg);
		const qq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(yaw)).multiply(new THREE.Quaternion().setFromEuler(from).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -from.y)));
		const e2 = new THREE.Euler().setFromQuaternion(qq);
		t.r = [d(e2.x), d(e2.y), d(e2.z)];
		writeTRS(m.e.object, t);
	}

	endMove(commit = true) {
		const m = this.moving;
		if (!m) return;
		this.moving = null;
		const to = readTRS(m.e.object);
		writeTRS(m.e.object, m.from);
		if (m.e.prop) this.ctx.physics?.setPropEnabled(m.e.prop, true);
		if (commit) this.setTRS(m.e, to, m.from);
		else if (m.e.prop) this.ctx.physics?.teleport(m.e.prop, m.e.object.position.clone(), m.e.object.quaternion.clone());
	}
}
