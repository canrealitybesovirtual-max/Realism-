import * as THREE from 'three';
import type { Entity, EntityWorld, TRS } from './entities';
import { readTRS, writeTRS } from './entities';
import { log } from './log';

/**
 * Every editor change is a Command with do/undo, so it can be undone, redone,
 * recorded in the scene document and replayed on load. `live` says whether
 * the running game fully reflects it now, or whether part of it (baked
 * lighting, static collision) only catches up after a reload.
 */
export interface Command {
	label: string;
	live: boolean;
	note?: string;
	do(): void;
	undo(): void;
}

export class History {
	private done: Command[] = [];
	private undone: Command[] = [];
	/** called after every do / undo / redo (autosave, UI refresh) */
	onChange: (c: Command | null, kind: 'do' | 'undo' | 'redo') => void = () => {};
	readonly limit = 300;
	/** a change too old to undo (still part of the scene) */
	onEvict: (c: Command) => void = () => {};

	run(c: Command) {
		try {
			c.do();
		} catch (err) {
			// a failed command must not leave a half-applied change behind
			try { c.undo(); } catch { /* best effort */ }
			log.error(`${c.label} failed: ${(err as Error).message}`);
			return false;
		}
		this.done.push(c);
		if (this.done.length > this.limit) this.onEvict(this.done.shift()!);
		this.undone.length = 0;
		log.info(c.label + (c.live ? '' : ` (${c.note ?? 'part of this applies after a reload'})`));
		this.onChange(c, 'do');
		return true;
	}
	undo() { const c = this.done.pop(); if (!c) return null; c.undo(); this.undone.push(c); log.info('Undo: ' + c.label); this.onChange(c, 'undo'); return c; }
	redo() { const c = this.undone.pop(); if (!c) return null; c.do(); this.done.push(c); log.info('Redo: ' + c.label); this.onChange(c, 'redo'); return c; }
	get canUndo() { return this.done.length > 0; }
	get canRedo() { return this.undone.length > 0; }
	get undoLabel() { return this.done[this.done.length - 1]?.label ?? ''; }
	get redoLabel() { return this.undone[this.undone.length - 1]?.label ?? ''; }
	clear() { this.done.length = 0; this.undone.length = 0; }
}

/** move a whole entity: the object, and its physics body when it has one */
export function applyTRS(w: EntityWorld, e: Entity, t: TRS) {
	writeTRS(e.object, t);
	if (e.prop && w.physics?.enabled) w.physics.teleport(e.prop, e.object.position.clone(), e.object.quaternion.clone());
}

const sameTRS = (a: TRS, b: TRS) => [...a.p, ...a.r, ...a.s].every((v, i) => Math.abs(v - [...b.p, ...b.r, ...b.s][i]) < 1e-6);

export function setTransform(w: EntityWorld, entries: { e: Entity; before: TRS; after: TRS }[], label?: string): Command | null {
	const changed = entries.filter((x) => !sameTRS(x.before, x.after));
	if (!changed.length) return null;
	const baked = changed.some((x) => x.e.bakedStatic);
	const scaledProp = changed.some((x) => x.e.prop && x.after.s.some((v, i) => Math.abs(v - x.before.s[i]) > 1e-6));
	return {
		label: label ?? (changed.length === 1 ? `Move ${changed[0].e.name}` : `Move ${changed.length} objects`),
		live: !baked && !scaledProp,
		note: baked ? 'baked shadows and static collision stay at the old place until reload' : scaledProp ? 'the collision shape keeps its size until reload' : undefined,
		do() { for (const x of changed) applyTRS(w, x.e, x.after); },
		undo() { for (const x of changed) applyTRS(w, x.e, x.before); },
	};
}

export type MatKey = 'color' | 'emissive' | 'roughness' | 'metalness' | 'opacity' | 'emissiveIntensity';
export function setMaterial(mat: THREE.Material, key: MatKey, value: number | string, label: string): Command {
	const m = mat as THREE.MeshStandardMaterial;
	const read = () => (key === 'color' || key === 'emissive') ? '#' + (m[key] as THREE.Color).getHexString() : (m as any)[key] as number;
	const before = read();
	const write = (v: number | string) => {
		if (key === 'color' || key === 'emissive') (m[key] as THREE.Color).set(v as string);
		else { (m as any)[key] = v; if (key === 'opacity') { m.transparent = (v as number) < 1; m.needsUpdate = true; } }
	};
	return { label, live: true, do() { write(value); }, undo() { write(before); } };
}

export function makeMaterialUnique(e: Entity, mat: THREE.Material): Command {
	const users: { mesh: THREE.Mesh; index: number }[] = [];
	e.object.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.material) return;
		if (Array.isArray(mesh.material)) mesh.material.forEach((m, i) => { if (m === mat) users.push({ mesh, index: i }); });
		else if (mesh.material === mat) users.push({ mesh, index: -1 });
	});
	const copy = mat.clone();
	copy.name = (mat.name || 'material') + ` (${e.name})`;
	const put = (m: THREE.Material) => { for (const u of users) { if (u.index < 0) u.mesh.material = m; else (u.mesh.material as THREE.Material[])[u.index] = m; } };
	return { label: `Unique material for ${e.name}`, live: true, do() { put(copy); }, undo() { put(mat); } };
}

export function setLight(light: THREE.Light, key: 'intensity' | 'color', value: number | string, label: string): Command {
	const before = key === 'color' ? '#' + light.color.getHexString() : light.intensity;
	const write = (v: number | string) => { if (key === 'color') light.color.set(v as string); else light.intensity = v as number; };
	return { label, live: true, do() { write(value); }, undo() { write(before); } };
}

export type PhysKey = 'mass' | 'friction' | 'restitution' | 'gravity';
export function setPhysics(e: Entity, key: PhysKey, value: number): Command {
	const p = e.prop!;
	const col = () => { const c: any[] = []; for (let i = 0; i < p.body.numColliders(); i++) c.push(p.body.collider(i)); return c; };
	const read = () => key === 'gravity' ? p.body.gravityScale() : key === 'mass' ? p.body.mass() : key === 'friction' ? col()[0].friction() : col()[0].restitution();
	const before = read();
	const write = (v: number) => {
		if (key === 'gravity') p.body.setGravityScale(v, true);
		else if (key === 'mass') { const m0 = p.body.mass() || 1; for (const c of col()) c.setMass(c.mass() * v / m0); }
		else if (key === 'friction') for (const c of col()) c.setFriction(v);
		else for (const c of col()) c.setRestitution(v);
		p.body.wakeUp();
	};
	return { label: `${e.name}: ${key} ${value.toFixed(2)}`, live: true, do() { write(value); }, undo() { write(before); } };
}

export function rename(e: Entity, name: string, w: EntityWorld): Command {
	const before = e.name;
	return { label: `Rename ${before} to ${name}`, live: true, do() { e.name = name; w.version++; }, undo() { e.name = before; w.version++; } };
}

export { readTRS };
