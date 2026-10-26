import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildHouse } from '../../src/home/house';
import { Designer, STYLE_NAMES } from '../../src/home/designer';
import { finishOf } from '../../src/home/materials';
import { parse, parseColor, type IntentContext } from '../../src/home/intent';
import { readLines, buildDesignPrompt } from '../../src/home/homePrompt';

function setup() {
	const house = buildHouse();
	const d = new Designer(house);
	const ctx = (over: Partial<IntentContext> = {}): IntentContext => ({
		room: 'living', aimed: null, last: [], items: [...house.items.values()].map((i) => ({ id: i.id, kind: i.kind, room: i.room, name: i.name })), light: d.light, ...over,
	});
	return { house, d, ctx };
}
const ops = (i: ReturnType<typeof parse>) => (i.kind === 'ops' ? i.ops : []);

describe('home intent parser', () => {
	it('"make this chair blue" with the armchair aimed is one direct finish op', () => {
		const { ctx } = setup();
		const i = parse('make this chair blue', ctx({ aimed: 'living.armchair' }));
		expect(i.kind).toBe('ops');
		const o = ops(i)[0] as any;
		expect(o.op).toBe('finish'); expect(o.target).toBe('living.armchair'); expect(o.color).toMatch(/^#/);
	});
	it('room styles are local and target the room you are in', () => {
		const { ctx } = setup();
		const i = parse('Make this room look more modern', ctx({ room: 'bedroom' }));
		expect(i.kind).toBe('ops');
		expect(ops(i)[0]).toMatchObject({ op: 'style', room: 'bedroom', style: 'modern' });
	});
	it('control words', () => {
		const { ctx } = setup();
		for (const [w, a] of [['undo', 'undo'], ['undo that', 'undo'], ['redo', 'redo'], ['cancel', 'cancel'], ['stop', 'cancel']] as const) {
			const i = parse(w, ctx()); expect(i.kind).toBe('control'); expect((i as any).action).toBe(a);
		}
		const s = parse('save as cosy evening', ctx()); expect(s).toMatchObject({ kind: 'control', action: 'save', name: 'cosy evening' });
	});
	it('lighting', () => {
		const { ctx } = setup();
		const i = parse('make the light warmer', ctx());
		const o = ops(i)[0] as any;
		expect(o.op).toBe('light'); expect(o.warmth).toBeLessThan(3200);
	});
	it('ambiguous targets ask one short question', () => {
		const { ctx } = setup();
		const i = parse('make the chair red', ctx({ room: 'kitchen' }));
		expect(i.kind).toBe('question');
		expect((i as any).choices.length).toBeGreaterThan(1);
		const r = (i as any).resume((i as any).choices[0].id);
		expect(r.kind).toBe('ops');
	});
	it('falls back to Claude for open-ended requests', () => {
		const { ctx } = setup();
		expect(parse('design a reading nook for my grandmother who loves birds', ctx()).kind).toBe('claude');
	});
	it('every control-center / VR tablet button phrase is handled locally', () => {
		const { ctx } = setup();
		for (const t of ['make this room modern', 'make this room warm', 'make this room scandinavian', 'make this room luxury', 'make this room industrial', 'make this room japandi',
			'make the light warmer', 'make the light cooler', 'brighter', 'dimmer', 'show me three alternatives', 'remove the armchair', 'restore my look', 'save as VR 10:30', 'open the door', 'close the door']) {
			expect(parse(t, ctx()).kind, t).not.toBe('claude');
		}
	});
	it('colours', () => {
		expect(parseColor('sage green walls')).toMatch(/^#/);
		expect(parseColor('#12ab34')).toBe('#12ab34');
		expect(parseColor('nothing here')).toBeNull();
	});
});

describe('home designer', () => {
	it('finish changes are undoable and redoable', () => {
		const { d, house } = setup();
		const it0 = house.items.get('living.armchair')!;
		const mat = Object.values(it0.slots)[0].mat;
		const before = mat.color.getHex();
		const r = d.run([{ op: 'finish', target: 'living.armchair', color: '#2050c0' } as any], 'blue chair');
		expect(r.ok).toBe(true);
		expect(mat.color.getHex()).not.toBe(before);
		d.undo(); expect(mat.color.getHex()).toBe(before);
		d.redo(); expect(mat.color.getHex()).not.toBe(before);
	});
	it('a failing step rolls back the whole request', () => {
		const { d, house } = setup();
		const mat = Object.values(house.items.get('living.sofa')!.slots)[0].mat;
		const before = mat.color.getHex();
		const r = d.run([{ op: 'finish', target: 'living.sofa', color: '#ff0000' } as any, { op: 'remove', target: 'living.walls' } as any], 'bad');
		expect(r.ok).toBe(false);
		expect(mat.color.getHex()).toBe(before);
		expect(d.canUndo).toBe(false);
	});
	it('rejects unknown objects and code-like input', () => {
		const { d } = setup();
		expect(d.validate({ op: 'finish', target: 'nope' } as any)).toBeTruthy();
		expect(d.validate({ op: 'eval', code: 'alert(1)' } as any)).toBeTruthy();
		expect(d.validate({ op: 'scale', target: 'living.sofa', factor: 50 } as any)).toBeTruthy();
	});
	it('moves land on a free spot inside the room', () => {
		const { d, house } = setup();
		const r = d.run([{ op: 'move', target: 'living.armchair', near: 'window' } as any], 'move');
		expect(r.ok).toBe(true);
		const p = house.items.get('living.armchair')!.object.position, room = house.rooms.living;
		expect(p.x).toBeGreaterThan(room.x0); expect(p.x).toBeLessThan(room.x1);
		expect(p.z).toBeGreaterThan(room.z0); expect(p.z).toBeLessThan(room.z1);
		// no overlap with the sofa's footprint
		const a = new THREE.Box3().setFromObject(house.items.get('living.armchair')!.object), b = new THREE.Box3().setFromObject(house.items.get('living.sofa')!.object);
		a.expandByScalar(-0.02);
		expect(a.min.x < b.max.x && a.max.x > b.min.x && a.min.z < b.max.z && a.max.z > b.min.z).toBe(false);
	});
	it('every style applies cleanly in every room and undoes in one step', () => {
		for (const style of STYLE_NAMES) {
			const { d, house } = setup();
			const wall = Object.values(house.items.get('living.walls')!.slots)[0].mat;
			const before = JSON.stringify(finishOf(wall));
			const r = d.run([{ op: 'style', room: 'all', style } as any], style);
			expect(r.ok, `${style}: ${r.error}`).toBe(true);
			d.undo();
			expect(JSON.stringify(finishOf(wall))).toBe(before);
		}
	});
	it('add, duplicate and remove furniture', () => {
		const { d, house } = setup();
		const n = house.items.size;
		expect(d.run([{ op: 'add', kind: 'plant', room: 'bedroom', near: 'corner' } as any], 'add').ok).toBe(true);
		expect(house.items.size).toBe(n + 1);
		expect(d.run([{ op: 'duplicate', target: 'living.armchair' } as any], 'dup').ok).toBe(true);
		expect(house.items.size).toBe(n + 2);
		expect(d.run([{ op: 'remove', target: 'living.plant' } as any], 'rm').ok).toBe(true);
		expect(house.items.size).toBe(n + 1);
		d.undo(); d.undo(); d.undo();
		expect(house.items.size).toBe(n);
	});
	it('a saved design replays onto a fresh house', () => {
		const a = setup();
		a.d.run([{ op: 'style', room: 'living', style: 'scandinavian' } as any, { op: 'move', target: 'living.armchair', near: 'window' } as any, { op: 'add', kind: 'floor lamp', room: 'living', near: 'corner' } as any], 'x');
		const save = JSON.parse(JSON.stringify(a.d.serialize()));
		const b = setup();
		b.d.load(save);
		const wa = finishOf(Object.values(a.house.items.get('living.walls')!.slots)[0].mat), wb = finishOf(Object.values(b.house.items.get('living.walls')!.slots)[0].mat);
		expect(wb).toEqual(wa);
		expect(b.house.items.size).toBe(a.house.items.size);
		const pa = a.house.items.get('living.armchair')!.object.position, pb = b.house.items.get('living.armchair')!.object.position;
		expect(pb.distanceTo(pa)).toBeLessThan(1e-6);
	});
	it('doors open and close', () => {
		const { d, house } = setup();
		expect(d.run([{ op: 'door', target: 'door.bedroom', open: true } as any], 'open').ok).toBe(true);
		for (let i = 0; i < 100; i++) d.update(0.02);
		expect(Math.abs(house.items.get('door.bedroom')!.door!.leaf.rotation.y)).toBeGreaterThan(1);
	});
});

describe('home Claude prompt', () => {
	it('streams complete JSON lines only', () => {
		const r1 = readLines('{"say":"ok"}\n{"op":"fin', 0);
		expect(r1.items).toEqual([{ say: 'ok' }]);
		const r2 = readLines('{"say":"ok"}\n{"op":"finish"}\n', r1.next);
		expect(r2.items).toEqual([{ op: 'finish' }]);
	});
	it('prompt carries the request and the lists', () => {
		const p = buildDesignPrompt('cosy reading nook', 'ctx', { presets: ['oak'], kinds: ['sofa'], styles: ['modern'] }, []);
		expect(p).toContain('cosy reading nook'); expect(p).toContain('oak'); expect(p).toContain('JSON Lines');
	});
});
