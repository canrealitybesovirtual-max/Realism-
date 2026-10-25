import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EntityWorld } from '../../src/engine/entities';
import { Runtime } from '../../src/engine/runtime';
import { Gameplay } from '../../src/engine/gameplay';
import { Editor } from '../../src/engine/editor';
import { parseProposal, previewProposal, sceneContext, buildPrompt } from '../../src/engine/agent';

function setup() {
	const store = new Map<string, string>();
	(globalThis as any).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), key: (i: number) => [...store.keys()][i], get length() { return store.size; } }, setTimeout: () => 0 };
	const scene = new THREE.Scene();
	const w = new EntityWorld(scene, null);
	const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff }));
	scene.add(m);
	const mug = w.add({ id: 'mug', name: 'Mug', layer: 'Props', object: m });
	const rt = new Runtime(w);
	const gp = new Gameplay(w, null, rt, () => new THREE.Vector3(), null);
	const ed = new Editor(w, rt, { world: w, physics: null, scene, gameplay: gp }, scene);
	return { w, gp, ed, mug };
}

const GOOD = {
	summary: 'Spin the mug',
	ops: [
		{ op: 'script', id: 'spin', script: { id: 'spin', name: 'Spin', source: 'function update(dt) { self.rotateBy(0, 90 * dt, 0); }' } },
		{ op: 'comp', id: 'mug', ctype: 'Script', data: { script: 'spin' } },
		{ op: 'spawn', id: 'agent-box', spec: { kind: 'box', dynamic: false, size: [0.2, 0.2, 0.2] }, to: { p: [0, 0.1, 0], r: [0, 0, 0], s: [1, 1, 1] }, color: '#00ff00' },
		{ op: 'mat', id: 'agent-box', mi: 0, key: 'roughness', value: 0.3 },
	],
};

describe('agent proposals', () => {
	it('parses fenced or bare JSON and rejects malformed replies', () => {
		expect(parseProposal('```json\n' + JSON.stringify(GOOD) + '\n```')).toMatchObject({ summary: 'Spin the mug' });
		expect(parseProposal('Sure! ' + JSON.stringify(GOOD))).toMatchObject({ ops: GOOD.ops });
		expect(parseProposal('no json here')).toMatch(/not valid JSON/);
		expect(parseProposal({ summary: 'x' })).toMatch(/no ops/);
		expect(parseProposal({ summary: 'x', ops: Array(61).fill({ op: 'delete', id: 'mug' }) })).toMatch(/too many/);
	});

	it('previews steps: valid, deferred (depends on a spawn), script diff, and invalid', () => {
		const { w, gp } = setup();
		const p = parseProposal(GOOD) as any;
		const s = previewProposal(p, w, gp);
		expect(s.map((x) => x.status)).toEqual(['ok', 'ok', 'ok', 'later']);
		expect(s[0].diff?.added).toBe(1);
		const bad = previewProposal({ summary: 'x', ops: [{ op: 'script', id: 'e', script: { id: 'e', name: 'E', source: 'function start(){ fetch("/") }' } } as any, { op: 'mat', id: 'nobody', mi: 0, key: 'color', value: '#fff' } as any] }, w, gp);
		expect(bad.map((x) => x.status)).toEqual(['error', 'error']);
		expect(bad[0].why).toMatch(/fetch/);
	});

	it('applies a proposal as one transaction and one undo step', () => {
		const { w, gp, ed, mug } = setup();
		const r = ed.applyBatch((parseProposal(GOOD) as any).ops, 'Claude: spin');
		expect(r.ok).toBe(true);
		expect(gp.scripts.has('spin')).toBe(true);
		expect(mug.components.some((c) => c.type === 'Script')).toBe(true);
		expect(w.get('agent-box')?.object.visible).toBe(true);
		expect(ed.ops().length).toBe(4); // saved with the scene
		ed.undo();
		expect(gp.scripts.has('spin')).toBe(false);
		expect(mug.components.length).toBe(0);
		expect(w.get('agent-box')?.deleted).toBe(true);
		ed.redo();
		expect(gp.scripts.has('spin')).toBe(true);
	});

	it('a failing step rolls back everything before it', () => {
		const { gp, ed, mug } = setup();
		const ops = [...GOOD.ops.slice(0, 2), { op: 'trs', id: 'mug', to: { p: [0, 1e9, 0], r: [0, 0, 0], s: [1, 1, 1] } }] as any;
		const r = ed.applyBatch(ops, 'Claude: bad');
		expect(r).toMatchObject({ ok: false, index: 2 });
		expect(gp.scripts.has('spin')).toBe(false);
		expect(mug.components.length).toBe(0);
		expect(ed.history.canUndo).toBe(false);
	});

	it('the prompt carries the scene and the request', () => {
		const { w, gp } = setup();
		const ctx = sceneContext(w, gp, ['mug'], 'play');
		expect(ctx).toMatch(/mug \| Mug \| Props/);
		expect(ctx).toMatch(/Selected: mug/);
		expect(buildPrompt('make it red', ctx)).toMatch(/REQUEST: make it red/);
	});
});
