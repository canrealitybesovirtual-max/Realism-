import * as THREE from 'three';
import type { Physics, Prop } from '../physics/physics';

/**
 * The shared scene model: every editable thing in the running game is an
 * Entity that wraps the *real* three.js object (and, for movable things, its
 * real Rapier body). Gameplay and the editor read and write the same objects,
 * so an edit is visible in the world the instant it is applied.
 *
 * Components are plain data + optional behaviour, keyed by type, so new
 * systems attach to entities without changing this file (see components.ts).
 */
export type Layer = 'Props' | 'Furniture' | 'Lights' | 'Architecture' | 'Weapons' | 'Spawned' | 'Places';
export const LAYERS: Layer[] = ['Props', 'Furniture', 'Lights', 'Architecture', 'Weapons', 'Spawned', 'Places'];

export interface Component {
	type: string;
	/** editable fields (numbers, strings, booleans) shown in the inspector */
	data: Record<string, number | string | boolean>;
	/** runs every simulated frame while the game plays */
	update?(e: Entity, dt: number): void;
}

export interface Entity {
	id: string;
	name: string;
	layer: Layer;
	object: THREE.Object3D;
	/** dynamic physics body, when the object has one */
	prop?: Prop;
	/** moving it would leave baked lighting / static collision behind until reload */
	bakedStatic?: boolean;
	/** cannot be moved / deleted from the editor (room shell, whole maps) */
	locked?: boolean;
	/** spawned at runtime by the editor (serialised as such) */
	spawn?: SpawnSpec;
	deleted?: boolean;
	components: Component[];
}

export interface SpawnSpec { kind: 'box' | 'sphere' | 'cylinder' | 'ramp' | 'light' | 'clone' | 'asset'; source?: string; /** imported asset id (kind 'asset') */ asset?: string; dynamic: boolean; size: [number, number, number] }

let nextSpawn = 1;

export class EntityWorld {
	readonly list: Entity[] = [];
	private byIdMap = new Map<string, Entity>();
	private byObj = new Map<THREE.Object3D, Entity>();
	/** bumped on every structural change (add / remove / rename) for UIs */
	version = 0;

	constructor(readonly scene: THREE.Scene, readonly physics: Physics | null) {}

	add(e: Omit<Entity, 'components'> & { components?: Component[] }): Entity {
		let id = e.id, n = 2;
		while (this.byIdMap.has(id)) id = `${e.id}-${n++}`;
		const ent: Entity = { components: [], ...e, id };
		this.list.push(ent);
		this.byIdMap.set(id, ent);
		this.byObj.set(ent.object, ent);
		this.version++;
		return ent;
	}

	remove(e: Entity) {
		const i = this.list.indexOf(e);
		if (i >= 0) this.list.splice(i, 1);
		this.byIdMap.delete(e.id);
		this.byObj.delete(e.object);
		this.version++;
	}

	get(id: string) { return this.byIdMap.get(id); }

	/** the entity an object (or any of its descendants) belongs to */
	of(o: THREE.Object3D | null): Entity | null {
		for (let p = o; p; p = p.parent) { const e = this.byObj.get(p); if (e && !e.deleted) return e; }
		return null;
	}

	spawnId(kind: string) { return `${kind}-${nextSpawn++}`; }

	search(q: string, layer: Layer | 'All') {
		const s = q.trim().toLowerCase();
		return this.list.filter((e) => !e.deleted && (layer === 'All' || e.layer === layer) && (!s || e.name.toLowerCase().includes(s) || e.id.includes(s)));
	}

	/** meshes under an entity, and the distinct materials they use */
	materials(e: Entity) {
		const mats: THREE.Material[] = [];
		e.object.traverse((o) => {
			const m = (o as THREE.Mesh).material;
			if (!m) return;
			for (const x of Array.isArray(m) ? m : [m]) if (!mats.includes(x)) mats.push(x);
		});
		return mats;
	}

	/** how many meshes in the whole scene use this material (edits are shared) */
	materialUsers(mat: THREE.Material) {
		let n = 0;
		this.scene.traverse((o) => { const m = (o as THREE.Mesh).material; if (m === mat || (Array.isArray(m) && m.includes(mat))) n++; });
		return n;
	}

	lights(e: Entity) {
		const out: THREE.Light[] = [];
		e.object.traverse((o) => { if ((o as THREE.Light).isLight) out.push(o as THREE.Light); });
		return out;
	}
}

/** Register the existing game's objects. Names are what the scene builders set. */
export function registerScene(w: EntityWorld, opts: {
	props: Prop[]; lamp?: THREE.Object3D; plant?: THREE.Object3D; clock?: THREE.Object3D; range?: THREE.Object3D;
}) {
	const s = w.scene;
	const propOf = (o: THREE.Object3D) => opts.props.find((p) => p.desc.object === o);
	const label: Record<string, [string, Layer, boolean?]> = {
		// name -> [label, layer, baked static?]
		room: ['Room shell', 'Architecture'],
		glazing: ['Window glazing', 'Architecture'],
		door: ['Office door', 'Architecture', true],
		desk: ['Desk', 'Furniture', true],
		chair: ['Task chair', 'Furniture', true],
		credenza: ['Sideboard', 'Furniture', true],
		monitor: ['Monitor', 'Furniture', true],
		keyboard: ['Keyboard', 'Furniture', true],
		mouse: ['Desk mouse', 'Furniture'],
		pc: ['PC tower', 'Furniture', true],
		'art-print': ['Art print', 'Furniture', true],
		socket: ['Wall socket', 'Furniture'],
		mug: ['Mug', 'Props'],
		notebook: ['Notebook', 'Props'],
		pen: ['Pen', 'Props'],
		pistol: ['Walther P38', 'Weapons'],
		'gun-g17': ['Glock 17 Gen 5', 'Weapons'],
		'gun-awp': ['AWM .338 (AWP)', 'Weapons'],
		sun: ['Sun', 'Lights'],
		'window-sky': ['Window skylight', 'Lights'],
		downlights: ['Ceiling downlights', 'Lights'],
		range: ['Shooting range', 'Places'],
		'rally-map': ['Snowy mountain', 'Places'],
	};
	const seen = new Set<THREE.Object3D>();
	const reg = (o: THREE.Object3D, name: string, layer: Layer, baked = false) => {
		if (seen.has(o)) return;
		seen.add(o);
		w.add({ id: o.name || name.toLowerCase().replace(/\W+/g, '-'), name, layer, object: o, prop: propOf(o), bakedStatic: baked && !propOf(o), locked: o.name === 'room' || layer === 'Places' });
	};
	s.traverse((o) => {
		const l = label[o.name];
		if (l) reg(o, l[0], l[1], l[2]);
	});
	if (opts.lamp) reg(opts.lamp, 'Desk lamp', 'Furniture', true);
	if (opts.plant) reg(opts.plant, 'Potted plant', 'Furniture', true);
	if (opts.clock) reg(opts.clock, 'Wall clock', 'Furniture', true);
	for (const p of opts.props) if (!seen.has(p.desc.object)) reg(p.desc.object, p.desc.name, 'Props');
}

/** Transform as plain numbers (position m, rotation degrees XYZ, scale) */
export interface TRS { p: [number, number, number]; r: [number, number, number]; s: [number, number, number] }
export function readTRS(o: THREE.Object3D): TRS {
	const d = THREE.MathUtils.radToDeg;
	return { p: o.position.toArray() as any, r: [d(o.rotation.x), d(o.rotation.y), d(o.rotation.z)], s: o.scale.toArray() as any };
}
export function writeTRS(o: THREE.Object3D, t: TRS) {
	const r = THREE.MathUtils.degToRad;
	o.position.fromArray(t.p);
	o.rotation.set(r(t.r[0]), r(t.r[1]), r(t.r[2]));
	o.scale.fromArray(t.s);
	o.updateMatrixWorld(true);
}
