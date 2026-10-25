import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EntityWorld, readTRS } from '../../src/engine/entities';
import { History } from '../../src/engine/commands';
import { validateOp, opToCommand, compactOps, type Op } from '../../src/engine/ops';
import { Runtime } from '../../src/engine/runtime';
import { Editor } from '../../src/engine/editor';

function world() {
	const scene = new THREE.Scene();
	const w = new EntityWorld(scene, null);
	const shared = new THREE.MeshStandardMaterial({ color: 0xffffff, name: 'paint' });
	const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared); a.name = 'crate';
	const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared); b.name = 'shelf';
	scene.add(a, b);
	const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()); wall.name = 'room'; scene.add(wall);
	w.add({ id: 'crate', name: 'Crate', layer: 'Props', object: a });
	w.add({ id: 'shelf', name: 'Shelf', layer: 'Furniture', object: b, bakedStatic: true });
	w.add({ id: 'room', name: 'Room', layer: 'Architecture', object: wall, locked: true });
	const light = new THREE.PointLight(0xffffff, 2); light.name = 'lamp'; scene.add(light);
	w.add({ id: 'lamp', name: 'Lamp', layer: 'Lights', object: light });
	return { w, scene, a, b, shared };
}
const trs = (x: number): Op & { op: 'trs' } => ({ op: 'trs', id: 'crate', to: { p: [x, 0, 0], r: [0, 0, 0], s: [1, 1, 1] } });

describe('scene ops', () => {
	it('validates every field and refuses bad or tampered input', () => {
		const { w } = world();
		expect(validateOp(trs(1), w)).toBeNull();
		expect(validateOp({ ...trs(1), to: { p: [NaN, 0, 0], r: [0, 0, 0], s: [1, 1, 1] } } as any, w)).toMatch(/transform/);
		expect(validateOp({ ...trs(1), to: { p: [0, 0, 0], r: [0, 0, 0], s: [0, 1, 1] } } as any, w)).toMatch(/transform/);
		expect(validateOp({ op: 'trs', id: 'nope', to: trs(1).to }, w)).toMatch(/unknown/);
		expect(validateOp({ op: 'trs', id: 'room', to: trs(1).to }, w)).toMatch(/locked/);
		expect(validateOp({ op: 'mat', id: 'crate', mi: 0, key: 'color', value: 'red' } as any, w)).toMatch(/colour/);
		expect(validateOp({ op: 'mat', id: 'crate', mi: 0, key: 'roughness', value: 4 } as any, w)).toMatch(/value/);
		expect(validateOp({ op: 'light', id: 'lamp', li: 0, key: 'intensity', value: 5 }, w)).toBeNull();
		expect(validateOp({ op: 'eval', id: 'crate', code: 'x' } as any, w)).toBe('unknown op');
		expect(validateOp(null, w)).toBe('malformed');
	});

	it('commands change the real objects, undo restores them exactly', () => {
		const { w, a } = world();
		const h = new History();
		h.run(opToCommand(trs(2), { world: w, physics: null, scene: w.scene }));
		expect(a.position.x).toBe(2);
		h.run(opToCommand({ op: 'mat', id: 'crate', mi: 0, key: 'color', value: '#ff0000' }, { world: w, physics: null, scene: w.scene }));
		expect((a.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('ff0000');
		h.undo(); h.undo();
		expect(a.position.x).toBe(0);
		expect((a.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('ffffff');
		h.redo();
		expect(a.position.x).toBe(2);
	});

	it('reports shared materials and moves of baked statics as not fully live', () => {
		const { w } = world();
		const mat = opToCommand({ op: 'mat', id: 'crate', mi: 0, key: 'color', value: '#00ff00' }, { world: w, physics: null, scene: w.scene });
		expect(mat.note).toMatch(/shared by 2/);
		const mv = opToCommand({ op: 'trs', id: 'shelf', to: { p: [1, 0, 0], r: [0, 0, 0], s: [1, 1, 1] } }, { world: w, physics: null, scene: w.scene });
		expect(mv.live).toBe(false);
		expect(mv.note).toMatch(/reload/);
	});

	it('make unique detaches only this object, and compaction keeps edits on the right material', () => {
		const { w, a, b, shared } = world();
		const ctx = { world: w, physics: null, scene: w.scene };
		const ops: Op[] = [
			{ op: 'mat', id: 'crate', mi: 0, key: 'color', value: '#111111' },
			{ op: 'unique', id: 'crate', mi: 0 },
			{ op: 'mat', id: 'crate', mi: 0, key: 'color', value: '#222222' },
		];
		const c = compactOps(ops);
		expect(c).toHaveLength(3); // not merged across "unique"
		for (const o of c) opToCommand(o, ctx).do();
		expect((b.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('111111');
		expect((a.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('222222');
		expect(a.material).not.toBe(shared);
	});

	it('compacts repeated edits of a field to the last value, keeping the first "from"', () => {
		const from = { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] } as any;
		const c = compactOps([{ ...trs(1), from }, trs(2), trs(3)]);
		expect(c).toHaveLength(1);
		expect((c[0] as any).to.p[0]).toBe(3);
		expect((c[0] as any).from).toBe(from);
	});

	it('a failing command is rolled back and not recorded', () => {
		const h = new History();
		let v = 0;
		const ok = h.run({ label: 'boom', live: true, do() { v = 1; throw new Error('x'); }, undo() { v = 0; } });
		expect(ok).toBe(false);
		expect(v).toBe(0);
		expect(h.canUndo).toBe(false);
	});
});

describe('editor save / load', () => {
	it('round-trips through storage: reset, replay, same result; damaged ops are skipped', () => {
		const { w, a } = world();
		const store = new Map<string, string>();
		(globalThis as any).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), key: (i: number) => [...store.keys()][i], get length() { return store.size; } }, setTimeout: () => 0 };
		const rt = new Runtime(w);
		const ed = new Editor(w, rt, { world: w, physics: null, scene: w.scene }, w.scene);
		ed.apply(trs(1.5));
		ed.apply({ op: 'mat', id: 'crate', mi: 0, key: 'roughness', value: 0.2 });
		ed.apply({ op: 'light', id: 'lamp', li: 0, key: 'intensity', value: 9 });
		ed.save('t');
		ed.resetToBuilt();
		expect(a.position.x).toBe(0);
		const r = ed.load('t');
		expect(r).toEqual({ applied: 3, skipped: 0 });
		expect(a.position.x).toBe(1.5);
		expect((a.material as THREE.MeshStandardMaterial).roughness).toBeCloseTo(0.2);
		// tamper with the save: one bad op among good ones
		const doc = JSON.parse(store.get('studio.scene.t')!);
		doc.ops.push({ op: 'trs', id: 'crate', to: { p: [1e9, 0, 0], r: [0, 0, 0], s: [1, 1, 1] } });
		store.set('studio.scene.t', JSON.stringify(doc));
		expect(ed.load('t')).toEqual({ applied: 3, skipped: 1 });
		expect(a.position.x).toBe(1.5);
		store.set('studio.scene.t', '{not json');
		expect(ed.load('t')).toEqual({ applied: 0, skipped: 0 });
		expect(readTRS(a).p[0]).toBe(1.5); // a broken file changes nothing
	});

	it('a saved spawn comes back after reset + load (same entity, no "id exists")', () => {
		const { w } = world();
		const store = new Map<string, string>();
		(globalThis as any).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), key: (i: number) => [...store.keys()][i], get length() { return store.size; } }, setTimeout: () => 0 };
		const ed = new Editor(w, new Runtime(w), { world: w, physics: null, scene: w.scene }, w.scene);
		expect(ed.spawn('box', new THREE.Vector3(1, 0.5, 2))).toBe(true);
		const id = ed.selection[0].id;
		ed.save('s');
		ed.resetToBuilt();
		expect(w.get(id)!.object.visible).toBe(false);
		expect(ed.load('s')).toEqual({ applied: 1, skipped: 0 });
		expect(w.get(id)!.object.visible).toBe(true);
		expect(w.get(id)!.object.position.x).toBeCloseTo(1);
	});

	it('runtime: stop puts bodies back where play started; frameDt is 0 while editing', () => {
		const { w } = world();
		const rt = new Runtime(w);
		rt.edit();
		expect(rt.frameDt(0.016)).toBe(0);
		rt.step();
		expect(rt.frameDt(0.016)).toBeCloseTo(1 / 120);
		expect(rt.frameDt(0.016)).toBe(0);
		rt.play();
		expect(rt.frameDt(0.016)).toBe(0.016);
	});
});
