import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Designer, STYLE_NAMES } from '../../src/home/designer';
import { finishOf, setPassthroughMode } from '../../src/home/materials';
import { parse, parseColor, type IntentContext } from '../../src/home/intent';
import { readLines, buildDesignPrompt } from '../../src/home/homePrompt';
import { buildRealHouse, frameFromFloor, scanToFrame, type Scan } from '../../src/home/realRoom';

/**
 * Test fixture only (never shipped): a room in the shape the headset's room
 * scan produces (4.2 x 3.6 m, a window, a door, a couch and a table).
 */
const fixture = (): Scan => ({
	source: 'scan', height: 2.5,
	floor: [[-2.1, -1.8], [2.1, -1.8], [2.1, 1.8], [-2.1, 1.8]],
	walls: [],
	openings: [
		{ kind: 'window', a: [-0.6, -1.8], b: [0.6, -1.8], y0: 0.9, y1: 2.1 },
		{ kind: 'door', a: [2.1, 0.8], b: [2.1, 1.7], y0: 0, y1: 2.05 },
	],
	objects: [
		{ label: 'couch', x: -0.3, z: 1.3, hx: 1.0, hz: 0.45, rot: 0, h: 0.85 },
		{ label: 'table', x: -0.3, z: 0.2, hx: 0.5, hz: 0.3, rot: 0, h: 0.45 },
	],
});
function setup(passthrough = false) {
	setPassthroughMode(passthrough);
	const house = buildRealHouse(fixture());
	const d = new Designer(house);
	const ctx = (over: Partial<IntentContext> = {}): IntentContext => ({
		room: 'room', aimed: null, last: [], items: [...house.items.values()].map((i) => ({ id: i.id, kind: i.kind, room: i.room, name: i.name })), light: d.light, ...over,
	});
	return { house, d, ctx };
}
const ops = (i: ReturnType<typeof parse>) => (i.kind === 'ops' ? i.ops : []);
const addAll = (d: Designer, list: any[]) => { const r = d.run(list, 'setup'); expect(r.ok, r.error).toBe(true); };

describe('your room from the scan', () => {
	it('walls / floor / ceiling are paint layers over the real surfaces; real furniture is kept as scanned', () => {
		const { house } = setup(true);
		for (const id of ['room.walls', 'room.floor', 'room.ceiling']) {
			const it = house.items.get(id)!;
			expect(it.overlay).toBe(true);
			expect(it.slots.main.mat.visible).toBe(false); // AR: nothing drawn, the passthrough shows the real one
		}
		expect(house.items.get('real.couch-1')?.kind).toBe('real');
		expect(house.items.get('real.table-1')?.fixed).toBe(true);
		expect(house.rooms.room.windows.length).toBe(1);
		expect(house.rooms.room.doors.length).toBe(1);
		expect(house.items.get('room.walls')!.slots.main.meshes.length).toBe(4);
		// nothing made up: no furniture until you add some
		expect([...house.items.values()].filter((i) => !i.fixed)).toEqual([]);
	});
	it('outside AR the unpainted surfaces are drawn plain, as scanned', () => {
		const { house } = setup(false);
		expect(house.items.get('room.walls')!.slots.main.mat.visible).toBe(true);
	});
	it('the room frame does not depend on which way the outline was walked', () => {
		const pts = [{ x: 1, z: 1 }, { x: 5, z: 2 }, { x: 4.5, z: 5 }, { x: 0.6, z: 4 }];
		const f1 = frameFromFloor(pts), f2 = frameFromFloor([...pts].reverse());
		expect(Math.abs(f1.yaw - f2.yaw)).toBeLessThan(1e-9);
		expect(f1.origin.distanceTo(f2.origin)).toBeLessThan(1e-9);
	});
	it('a reference-space scan converts into the room frame (walls, window, ceiling height, furniture)', () => {
		const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
		const raw = {
			floorY: 0, floor: [V(1, 0, 1), V(5, 0, 1), V(5, 0, 4), V(1, 0, 4)],
			planes: [
				{ label: 'wall', pts: [V(1, 0, 1), V(5, 0, 1), V(5, 2.6, 1), V(1, 2.6, 1)], normal: V(0, 0, 1) },
				{ label: 'window frame', pts: [V(2, 1, 1.01), V(3, 1, 1.01), V(3, 2, 1.01), V(2, 2, 1.01)], normal: V(0, 0, 1) },
				{ label: 'ceiling', pts: [V(1, 2.6, 1), V(5, 2.6, 1), V(5, 2.6, 4), V(1, 2.6, 4)], normal: V(0, -1, 0) },
			],
			boxes: [{ label: 'couch', c: V(3, 0.4, 3.4), hx: 1, hz: 0.45, rot: 0, top: 0.85 }],
		};
		const f = frameFromFloor(raw.floor.map((p) => ({ x: p.x, z: p.z })));
		const s = scanToFrame(raw as any, f.origin, f.yaw);
		expect(s.walls.length).toBe(1);
		expect(Math.abs(s.height - 2.6)).toBeLessThan(1e-6);
		expect(s.openings).toEqual([expect.objectContaining({ kind: 'window' })]);
		expect(s.objects[0]).toMatchObject({ label: 'couch' });
		expect(Math.abs(s.objects[0].h - 0.85)).toBeLessThan(1e-6);
		// the couch is 0.9 m from the room's centre line, as in the scan
		expect(Math.abs(Math.hypot(s.objects[0].x, s.objects[0].z) - Math.hypot(3 - 3, 3.4 - 2.5))).toBeLessThan(1e-6);
	});
});

describe('talking to your room', () => {
	it('"make this chair blue" with a chair you added aimed is one direct finish op', () => {
		const { d, house, ctx } = setup();
		addAll(d, [{ op: 'add', kind: 'armchair', room: 'room', near: 'window' }]);
		const chair = [...house.items.values()].find((i) => i.kind === 'armchair')!;
		const o = ops(parse('make this chair blue', ctx({ aimed: chair.id })))[0] as any;
		expect(o).toMatchObject({ op: 'finish', target: chair.id }); expect(o.color).toMatch(/^#/);
	});
	it('"make this room look more modern" is a style for your room, applied locally, undoable', () => {
		const { d, house, ctx } = setup();
		const i = parse('Make this room look more modern', ctx());
		expect(ops(i)[0]).toMatchObject({ op: 'style', room: 'room', style: 'modern' });
		const r = d.run(ops(i), 'modern'); expect(r.ok, r.error).toBe(true);
		expect(finishOf(house.items.get('room.walls')!.slots.main.mat)?.preset).not.toBe('original');
		d.undo();
		expect(finishOf(house.items.get('room.walls')!.slots.main.mat)?.preset).toBe('original');
	});
	it('control words', () => {
		const { ctx } = setup();
		for (const [w, a] of [['undo', 'undo'], ['undo that', 'undo'], ['redo', 'redo'], ['cancel', 'cancel'], ['stop', 'cancel']] as const) {
			const i = parse(w, ctx()); expect(i.kind).toBe('control'); expect((i as any).action).toBe(a);
		}
		expect(parse('save as cosy evening', ctx())).toMatchObject({ kind: 'control', action: 'save', name: 'cosy evening' });
	});
	it('lighting', () => {
		const { ctx } = setup();
		const o = ops(parse('make the light warmer', ctx()))[0] as any;
		expect(o).toMatchObject({ op: 'light', room: 'room' }); expect(o.warmth).toBeLessThan(3600);
	});
	it('"the couch" with your real couch and an added sofa asks which one', () => {
		const { d, ctx } = setup();
		addAll(d, [{ op: 'add', kind: 'sofa', room: 'room', near: 'wall' }]);
		const i = parse('make the couch red', ctx());
		expect(i.kind).toBe('question');
		expect((i as any).choices.map((c: any) => c.label).join('|')).toMatch(/your real couch/);
	});
	it('"add a lamp beside the couch" asks which couch too, then places it there', () => {
		const { d, house, ctx } = setup();
		addAll(d, [{ op: 'add', kind: 'sofa', room: 'room', near: 'wall' }]);
		const i = parse('add a floor lamp beside the couch', ctx());
		expect(i.kind).toBe('question');
		const real = (i as any).choices.find((c: any) => /real/.test(c.label));
		const r = (i as any).resume(real.id);
		expect(ops(r)[0]).toMatchObject({ op: 'add', kind: 'floor lamp', near: 'real.couch-1' });
		addAll(d, ops(r));
		const l = [...house.items.values()].find((x) => x.kind === 'floor lamp')!, c = house.items.get('real.couch-1')!;
		expect(Math.hypot(l.object.position.x - c.object.position.x, l.object.position.z - c.object.position.z)).toBeLessThan(1.6);
	});
	it('"add an armchair" (an, not a) adds one', () => {
		const { ctx } = setup();
		expect(ops(parse('add an armchair by the window', ctx()))[0]).toMatchObject({ op: 'add', kind: 'armchair', near: 'window' });
		expect(ops(parse('put an armchair in the corner', ctx()))[0]).toMatchObject({ op: 'add', kind: 'armchair', near: 'corner' });
	});
	it('falls back to Claude for open-ended requests', () => {
		const { ctx } = setup();
		expect(parse('design a reading nook for my grandmother who loves birds', ctx()).kind).toBe('claude');
	});
	it('every control-center / VR tablet button phrase is handled locally', () => {
		const { ctx } = setup();
		for (const t of ['make this room modern', 'make this room warm', 'make this room scandinavian', 'make this room luxury', 'make this room industrial', 'make this room japandi',
			'make the light warmer', 'make the light cooler', 'make the light brighter', 'make the light dimmer', 'brighter', 'dimmer', 'show me three alternatives', 'restore my look', 'save as VR 10:30']) {
			expect(parse(t, ctx()).kind, t).not.toBe('claude');
		}
	});
	it('colours', () => {
		expect(parseColor('sage green walls')).toMatch(/^#/);
		expect(parseColor('#12ab34')).toBe('#12ab34');
		expect(parseColor('nothing here')).toBeNull();
	});
});

describe('the design engine on your room', () => {
	it('painting the walls shows the layer; "original" shows the real wall again; undo / redo', () => {
		const { d, house, ctx } = setup(true);
		expect(d.run(ops(parse('paint the walls sage green', ctx())), 'paint').ok).toBe(true);
		const mat = house.items.get('room.walls')!.slots.main.mat;
		expect(mat.visible).toBe(true);
		const back = parse('make the walls original again', ctx());
		expect(ops(back)[0]).toMatchObject({ op: 'finish', target: 'room.walls', preset: 'original' });
		d.run(ops(back), 'original'); expect(mat.visible).toBe(false);
		d.undo(); expect(mat.visible).toBe(true);
		d.undo(); expect(mat.visible).toBe(false);
		d.redo(); expect(mat.visible).toBe(true);
	});
	it('a failing step rolls back the whole request', () => {
		const { d, house } = setup();
		const mat = house.items.get('room.floor')!.slots.main.mat, before = JSON.stringify(finishOf(mat));
		const r = d.run([{ op: 'finish', target: 'room.floor', preset: 'oak' } as any, { op: 'remove', target: 'room.walls' } as any], 'bad');
		expect(r.ok).toBe(false);
		expect(JSON.stringify(finishOf(mat))).toBe(before);
		expect(d.canUndo).toBe(false);
	});
	it('rejects unknown objects, code-like input, other rooms, and changes to your real furniture', () => {
		const { d } = setup();
		expect(d.validate({ op: 'finish', target: 'nope' } as any)).toBeTruthy();
		expect(d.validate({ op: 'eval', code: 'alert(1)' } as any)).toBeTruthy();
		expect(d.validate({ op: 'finish', target: 'real.couch-1', color: '#ff0000' } as any)).toMatch(/real couch/);
		expect(d.validate({ op: 'move', target: 'real.couch-1', near: 'center' } as any)).toBeTruthy();
		expect(d.validate({ op: 'remove', target: 'real.couch-1' } as any)).toBeTruthy();
		expect(d.validate({ op: 'add', kind: 'plant', room: 'kitchen' } as any)).toBeTruthy();
	});
	it('added furniture lands inside your room, clear of your real furniture and the doorway', () => {
		const { d, house, ctx } = setup();
		const i = parse('add a plant beside the couch', ctx());
		expect(ops(i)[0]).toMatchObject({ op: 'add', kind: 'plant', near: 'real.couch-1' });
		addAll(d, ops(i));
		addAll(d, [{ op: 'add', kind: 'armchair', room: 'room', near: 'door' }, { op: 'add', kind: 'floor lamp', room: 'room', near: 'window' }]);
		const room = house.rooms.room;
		for (const it of [...house.items.values()].filter((x) => !x.fixed)) {
			const f = d.footprint(it, it.object.position.x, it.object.position.z, it.object.rotation.y);
			expect(f[0]).toBeGreaterThan(room.x0); expect(f[2]).toBeLessThan(room.x1); expect(f[1]).toBeGreaterThan(room.z0); expect(f[3]).toBeLessThan(room.z1);
			for (const c of room.clear) expect(f[0] < c[2] - 0.01 && f[2] > c[0] + 0.01 && f[1] < c[3] - 0.01 && f[3] > c[1] + 0.01, it.id).toBe(false);
		}
	});
	it('every style applies to your room and undoes in one step', () => {
		for (const style of STYLE_NAMES) {
			const { d, house } = setup();
			const n = house.items.size;
			const r = d.run([{ op: 'style', room: 'room', style } as any], style);
			expect(r.ok, `${style}: ${r.error}`).toBe(true);
			d.undo();
			expect(finishOf(house.items.get('room.walls')!.slots.main.mat)?.preset).toBe('original');
			expect(house.items.size).toBe(n);
		}
	});
	it('add, duplicate and remove furniture', () => {
		const { d, house } = setup();
		const n = house.items.size;
		addAll(d, [{ op: 'add', kind: 'plant', room: 'room', near: 'corner' }]);
		const plant = [...house.items.values()].find((x) => x.kind === 'plant')!;
		addAll(d, [{ op: 'duplicate', target: plant.id }]);
		expect(house.items.size).toBe(n + 2);
		addAll(d, [{ op: 'remove', target: plant.id }]);
		expect(house.items.size).toBe(n + 1);
		d.undo(); d.undo(); d.undo();
		expect(house.items.size).toBe(n);
	});
	it('a saved design replays onto the same room scanned again', () => {
		const a = setup();
		addAll(a.d, [{ op: 'finish', target: 'room.floor', preset: 'herringbone' }, { op: 'add', kind: 'floor lamp', room: 'room', near: 'window' }]);
		const save = JSON.parse(JSON.stringify(a.d.serialize()));
		const b = setup(); b.d.load(save);
		expect(finishOf(b.house.items.get('room.floor')!.slots.main.mat)?.preset).toBe('herringbone');
		const la = [...a.house.items.values()].find((x) => x.kind === 'floor lamp')!, lb = [...b.house.items.values()].find((x) => x.kind === 'floor lamp')!;
		expect(lb.object.position.distanceTo(la.object.position)).toBeLessThan(1e-3);
	});
});

describe('Claude prompt', () => {
	it('streams complete JSON lines only', () => {
		const r1 = readLines('{"say":"ok"}\n{"op":"fin', 0);
		expect(r1.items).toEqual([{ say: 'ok' }]);
		const r2 = readLines('{"say":"ok"}\n{"op":"finish"}\n', r1.next);
		expect(r2.items).toEqual([{ op: 'finish' }]);
	});
	it('prompt carries the request and the lists', () => {
		const p = buildDesignPrompt('cosy reading nook', 'ctx', { presets: ['oak'], kinds: ['sofa'], styles: ['modern'] }, []);
		expect(p).toContain('cosy reading nook'); expect(p).toContain('oak'); expect(p).toContain('JSON Lines'); expect(p).toContain('real room');
	});
});
