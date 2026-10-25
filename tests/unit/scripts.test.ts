import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EntityWorld } from '../../src/engine/entities';
import { Runtime } from '../../src/engine/runtime';
import { Gameplay } from '../../src/engine/gameplay';
import { opToCommand, validateOp } from '../../src/engine/ops';
import { checkScript, errorLine, makeFactory, makeGuard } from '../../src/engine/scripts';
import { History } from '../../src/engine/commands';
import { log } from '../../src/engine/log';

function setup() {
	const scene = new THREE.Scene();
	const w = new EntityWorld(scene, null);
	const mk = (id: string, x = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff })); m.position.x = x; scene.add(m); return w.add({ id, name: id, layer: 'Spawned', object: m }); };
	const box = mk('box'), lamp = mk('lamp', 3);
	const rt = new Runtime(w);
	const gp = new Gameplay(w, null, rt, () => new THREE.Vector3(0, 1.6, 5), null);
	const ctx = { world: w, physics: null, scene, gameplay: gp };
	const history = new History();
	const op = (o: any) => { const why = validateOp(o, w); if (why) throw new Error(why); history.run(opToCommand(o, ctx)); };
	return { w, rt, gp, box, lamp, op, history };
}

describe('script checks', () => {
	it('reports syntax errors with line and column', () => {
		const c = checkScript('function update(dt) {\n  let x = ;\n}');
		expect(c.ok).toBe(false);
		expect(c.diagnostics[0]).toMatchObject({ line: 2, severity: 'error' });
	});
	it('refuses page globals, constructor chains, imports and timers', () => {
		for (const src of ['function start(){ window.x = 1 }', 'function start(){ fetch("/x") }', 'function start(){ ({}).constructor.constructor("return 1")() }', 'function start(){ setTimeout(()=>0, 1) }', 'function start(){ import("x") }', 'function start(){ eval("1") }', 'function start(){ localStorage.clear() }']) {
			const c = checkScript(src);
			expect(c.ok, src).toBe(false);
		}
		// property names that merely share a banned name are fine
		expect(checkScript('function start(){ const o = { window: 1, fetch: 2 }; log(o.window + o.fetch) }').ok).toBe(true);
	});
	it('warns about misspelt hooks and files with no hooks', () => {
		expect(checkScript('function Update(dt) {}').diagnostics[0].message).toMatch(/not a hook/);
		expect(checkScript('const a = 1;').diagnostics[0].message).toMatch(/no hooks/);
	});
	it('an endless loop throws instead of hanging, and errors map back to script lines', () => {
		const c = checkScript('function update() {\n  let n = 0;\n  while (true) n++;\n}\nfunction start() {\n  null.x;\n}');
		expect(c.ok).toBe(true);
		const g = makeGuard(10000);
		const hooks = makeFactory(c)(g.fn, {}, {}, () => {});
		expect(() => hooks.update!()).toThrow(/loop ran more than/);
		let err: unknown;
		try { hooks.start!(); } catch (e) { err = e; }
		expect(errorLine(err)).toBe(6);
	});
});

const SPIN = `function start() { api.state.uses ??= 0; }
function update(dt) { self.moveBy(0, dt, 0); }
function onUse() { api.state.uses++; self.setColor('#ff0000'); api.entity('lamp').setVisible(false); }`;

describe('scripts at runtime', () => {
	it('runs hooks on its entity; Stop restores everything the script changed', () => {
		const { rt, gp, box, lamp, op } = setup();
		op({ op: 'script', id: 's1', script: { id: 's1', name: 'Spin', source: SPIN } });
		op({ op: 'comp', id: 'box', ctype: 'Script', data: { script: 's1' } });
		rt.edit(); rt.play();
		for (let i = 0; i < 10; i++) gp.update(0.1);
		expect(box.object.position.y).toBeCloseTo(1);
		expect(gp.usable(box.object)).toBe(true);
		expect(gp.use(box.object)).toBe(true);
		expect((box.object as THREE.Mesh<any, THREE.MeshStandardMaterial>).material.color.getHexString()).toBe('ff0000');
		expect(lamp.object.visible).toBe(false);
		rt.stop();
		expect(box.object.position.y).toBeCloseTo(0);
		expect((box.object as THREE.Mesh<any, THREE.MeshStandardMaterial>).material.color.getHexString()).toBe('ffffff');
		expect(lamp.object.visible).toBe(true);
	});

	it('hot reload: editing while playing swaps the code and keeps api.state', () => {
		const { rt, gp, box, op } = setup();
		op({ op: 'script', id: 's1', script: { id: 's1', name: 'Spin', source: SPIN } });
		op({ op: 'comp', id: 'box', ctype: 'Script', data: { script: 's1' } });
		rt.edit(); rt.play();
		gp.use(box.object); gp.use(box.object);
		op({ op: 'script', id: 's1', script: { id: 's1', name: 'Spin', source: SPIN.replace('moveBy(0, dt, 0)', 'moveBy(dt, 0, 0)') + '\nfunction onEvent(id, ev, v) { if (ev === "ask") self.emit("uses", api.state.uses); }' } });
		gp.update(0.5);
		expect(box.object.position.x).toBeCloseTo(0.5);
		const seen: number[] = [];
		op({ op: 'script', id: 's2', script: { id: 's2', name: 'Listen', source: 'function onEvent(id, ev, v) { if (ev === "uses") api.state.v = v; }\nfunction update() { if (api.state.v !== undefined) log("v" + api.state.v); }' } });
		gp.onLog = (m) => { const k = /v(\d+)$/.exec(m); if (k) seen.push(+k[1]); };
		op({ op: 'comp', id: 'lamp', ctype: 'Script', data: { script: 's2' } });
		gp.emit(box, 'ask');
		gp.update(0.02);
		expect(seen.at(-1)).toBe(2); // state survived the reload
	});

	it('a script that throws is stopped on that entity, logged with its line, and the game keeps going', () => {
		const { rt, gp, box, lamp, op } = setup();
		op({ op: 'script', id: 'bad', script: { id: 'bad', name: 'Bad', source: 'function update(dt) {\n  self.moveBy(0, dt, 0);\n  api.entity("nobody").setVisible(false);\n}' } });
		op({ op: 'script', id: 'good', script: { id: 'good', name: 'Good', source: 'function update(dt) { self.moveBy(dt, 0, 0); }' } });
		op({ op: 'comp', id: 'box', ctype: 'Script', data: { script: 'bad' } });
		op({ op: 'comp', id: 'lamp', ctype: 'Script', data: { script: 'good' } });
		const before = log.errors;
		rt.edit(); rt.play();
		for (let i = 0; i < 5; i++) gp.update(0.1);
		expect(box.object.position.y).toBeCloseTo(0.1); // ran once, then stopped
		expect(lamp.object.position.x).toBeCloseTo(3.5);
		expect(log.errors).toBe(before + 1);
		expect(gp.scriptProblems.at(-1)).toMatchObject({ script: 'bad', line: 3 });
	});

	it('invalid scripts are refused as ops; undo restores the previous version', () => {
		const { gp, op, history } = setup();
		expect(() => op({ op: 'script', id: 's1', script: { id: 's1', name: 'X', source: 'function start( {' } })).toThrow(/line 1/);
		expect(() => op({ op: 'script', id: 's1', script: { id: 's1', name: 'X', source: 'function start(){ document.body.remove() }' } })).toThrow(/not available/);
		op({ op: 'script', id: 's1', script: { id: 's1', name: 'A', source: 'function start(){}' } });
		op({ op: 'script', id: 's1', script: { id: 's1', name: 'A', source: 'function start(){ log(1) }' } });
		history.undo();
		expect(gp.scripts.get('s1')!.source).toBe('function start(){}');
	});
});
