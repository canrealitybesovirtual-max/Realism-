import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EntityWorld } from '../../src/engine/entities';
import { Runtime } from '../../src/engine/runtime';
import { Gameplay } from '../../src/engine/gameplay';
import { validateGraph, type GraphDoc } from '../../src/engine/graph';
import { opToCommand, validateOp } from '../../src/engine/ops';
import { validateComponent } from '../../src/engine/components';
import { log } from '../../src/engine/log';

function setup() {
	const scene = new THREE.Scene();
	const w = new EntityWorld(scene, null);
	const mk = (id: string, x = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.05), new THREE.MeshStandardMaterial({ color: 0xffffff })); m.position.x = x; scene.add(m); return w.add({ id, name: id, layer: 'Spawned', object: m }); };
	const door = mk('door'), plate = mk('plate', 3), lamp = mk('lamp', 6);
	const rt = new Runtime(w);
	const player = new THREE.Vector3(0, 1.6, 5);
	const gp = new Gameplay(w, null, rt, () => player, null);
	const ctx = { world: w, physics: null, scene, gameplay: gp };
	const op = (o: any) => { const why = validateOp(o, w); if (why) throw new Error(why); opToCommand(o, ctx).do(); };
	return { w, rt, gp, door, plate, lamp, player, op };
}

const useDoorGraph: GraphDoc = {
	id: 'g1', name: 'Use opens door',
	nodes: [
		{ id: 'a', type: 'OnEvent', x: 0, y: 0, params: { entity: 'plate', event: 'used' } },
		{ id: 'b', type: 'SendCommand', x: 0, y: 0, params: { entity: 'door', command: 'open', value: 0 } },
		{ id: 'c', type: 'SetColor', x: 0, y: 0, params: { entity: 'self', colour: '#00ff00' } },
	],
	links: [{ from: 'a', out: 'out', to: 'b', in: 'in' }, { from: 'b', out: 'out', to: 'c', in: 'in' }],
};

describe('graph validation', () => {
	it('accepts a good graph and rejects unknown nodes, bad params and incompatible links', () => {
		expect(validateGraph(useDoorGraph)).toBeNull();
		expect(validateGraph({ ...useDoorGraph, nodes: [...useDoorGraph.nodes, { id: 'x', type: 'Eval', x: 0, y: 0, params: {} }] })).toMatch(/unknown node/);
		expect(validateGraph({ ...useDoorGraph, nodes: [{ ...useDoorGraph.nodes[0], params: { entity: 3 } }, ...useDoorGraph.nodes.slice(1)] })).toMatch(/wrong type/);
		// exec output into a number input
		expect(validateGraph({ ...useDoorGraph, nodes: [...useDoorGraph.nodes, { id: 'd', type: 'Add', x: 0, y: 0, params: { a: 0, b: 1 } }], links: [...useDoorGraph.links, { from: 'a', out: 'out', to: 'd', in: 'a' }] })).toMatch(/cannot link exec to number/);
		expect(validateGraph({ ...useDoorGraph, links: [{ from: 'a', out: 'out', to: 'zz', in: 'in' }] })).toMatch(/missing node/);
	});
	it('component data is checked against the definition', () => {
		expect(validateComponent('Door', { angle: 90 })).toBeNull();
		expect(validateComponent('Door', { angle: 9000 })).toMatch(/range/);
		expect(validateComponent('Door', { colour: 'red' })).toMatch(/no field/);
		expect(validateComponent('Nope', {})).toMatch(/unknown/);
	});
});

describe('components + graphs at runtime', () => {
	it('a graph on the plate: using it opens the door (Door component) and turns the plate green; stop restores', () => {
		const { rt, gp, door, plate, op } = setup();
		op({ op: 'comp', id: 'door', ctype: 'Door', data: { angle: 90, speed: 900, hinge: -0.5 } });
		op({ op: 'comp', id: 'plate', ctype: 'Interactable', data: {} });
		op({ op: 'graph', id: 'g1', graph: useDoorGraph });
		op({ op: 'comp', id: 'plate', ctype: 'Graph', data: { graph: 'g1' } });
		rt.edit(); rt.play();
		expect(gp.use(plate.object)).toBe(true);
		for (let i = 0; i < 20; i++) gp.update(0.02);
		const yaw = new THREE.Euler().setFromQuaternion(door.object.quaternion).y;
		expect(THREE.MathUtils.radToDeg(yaw)).toBeCloseTo(90, 0);
		expect((plate.object as THREE.Mesh<any, THREE.MeshStandardMaterial>).material.color.getHexString()).toBe('00ff00');
		rt.stop();
		expect(new THREE.Euler().setFromQuaternion(door.object.quaternion).y).toBeCloseTo(0);
		expect((plate.object as THREE.Mesh<any, THREE.MeshStandardMaterial>).material.color.getHexString()).toBe('ffffff');
	});

	it('trigger volume: walking in emits "enter" -> graph hides the lamp after a delay', () => {
		const { rt, gp, lamp, player, op } = setup();
		op({ op: 'comp', id: 'plate', ctype: 'Trigger', data: { sizeX: 2, sizeY: 2.5, sizeZ: 2 } });
		op({ op: 'graph', id: 'g2', graph: { id: 'g2', name: 'trap', nodes: [
			{ id: 'a', type: 'OnEvent', x: 0, y: 0, params: { entity: 'plate', event: 'enter' } },
			{ id: 'b', type: 'Delay', x: 0, y: 0, params: { seconds: 0.5 } },
			{ id: 'c', type: 'SetVisible', x: 0, y: 0, params: { entity: 'lamp', visible: false } },
		], links: [{ from: 'a', out: 'out', to: 'b', in: 'in' }, { from: 'b', out: 'out', to: 'c', in: 'in' }] } });
		op({ op: 'comp', id: 'lamp', ctype: 'Graph', data: { graph: 'g2' } });
		rt.edit(); rt.play();
		gp.update(0.1);
		expect(lamp.object.visible).toBe(true);
		player.set(3, 1.6, 0); // into the plate's box
		gp.update(0.1);
		gp.update(0.3);
		expect(lamp.object.visible).toBe(true); // still waiting
		gp.update(0.3);
		expect(lamp.object.visible).toBe(false);
		rt.stop();
		expect(lamp.object.visible).toBe(true);
	});

	it('Health: damage commands from a graph emit "died" and hide it; a failing node is contained', () => {
		const { rt, gp, plate, op } = setup();
		op({ op: 'comp', id: 'plate', ctype: 'Health', data: { max: 25 } });
		op({ op: 'graph', id: 'g3', graph: { id: 'g3', name: 'hurt', nodes: [
			{ id: 'a', type: 'OnTick', x: 0, y: 0, params: {} },
			{ id: 'b', type: 'SendCommand', x: 0, y: 0, params: { entity: 'self', command: 'damage', value: 10 } },
			{ id: 'c', type: 'SetColor', x: 0, y: 0, params: { entity: 'nobody', colour: '#ff0000' } },
		], links: [{ from: 'a', out: 'out', to: 'b', in: 'in' }, { from: 'b', out: 'out', to: 'c', in: 'in' }] } });
		op({ op: 'comp', id: 'plate', ctype: 'Graph', data: { graph: 'g3' } });
		const errors = log.errors;
		rt.edit(); rt.play();
		for (let i = 0; i < 3; i++) gp.update(0.02);
		expect(plate.object.visible).toBe(false); // 25 hp, 10 per tick
		const r = gp.runners[0];
		expect(r.debug.errors.get('c')).toMatch(/no entity "nobody"/);
		expect(log.errors).toBe(errors + 1); // logged once, not every tick
	});

	it('an exec loop is stopped instead of hanging the game', () => {
		const { rt, gp, op } = setup();
		op({ op: 'graph', id: 'g4', graph: { id: 'g4', name: 'loop', nodes: [
			{ id: 'a', type: 'OnStart', x: 0, y: 0, params: {} },
			{ id: 'b', type: 'Sequence', x: 0, y: 0, params: {} },
		], links: [{ from: 'a', out: 'out', to: 'b', in: 'in' }, { from: 'b', out: 'first', to: 'b', in: 'in' }] } });
		op({ op: 'comp', id: 'door', ctype: 'Graph', data: { graph: 'g4' } });
		rt.edit(); rt.play();
		expect(gp.runners[0].debug.errors.get('b')).toMatch(/2000 steps/);
	});

	it('editing a graph while playing hot-reloads it', () => {
		const { rt, gp, op, door } = setup();
		op({ op: 'graph', id: 'g5', graph: { id: 'g5', name: 'mover', nodes: [
			{ id: 'a', type: 'OnTick', x: 0, y: 0, params: {} },
			{ id: 'b', type: 'MoveBy', x: 0, y: 0, params: { entity: 'self', x: 0, y: 0.1, z: 0 } },
		], links: [{ from: 'a', out: 'out', to: 'b', in: 'in' }] } });
		op({ op: 'comp', id: 'door', ctype: 'Graph', data: { graph: 'g5' } });
		rt.edit(); rt.play();
		gp.update(0.02);
		expect(door.object.position.y).toBeCloseTo(0.1);
		op({ op: 'graph', id: 'g5', graph: { id: 'g5', name: 'mover', nodes: [
			{ id: 'a', type: 'OnTick', x: 0, y: 0, params: {} },
			{ id: 'b', type: 'MoveBy', x: 0, y: 0, params: { entity: 'self', x: 0, y: -0.05, z: 0 } },
		], links: [{ from: 'a', out: 'out', to: 'b', in: 'in' }] } });
		gp.update(0.02);
		expect(door.object.position.y).toBeCloseTo(0.05);
		rt.stop();
		expect(door.object.position.y).toBeCloseTo(0);
	});
});
