/**
 * Node-based logic ("Script graphs").
 *
 * A graph is data: nodes with typed ports and links between them. Events
 * (On Start, On Tick, On Event) start "exec" chains; action nodes do things
 * and pass the exec on; data inputs are pulled from linked nodes when needed
 * (or use the node's own parameter value). Graphs are reusable: the same
 * graph runs once per entity that has a "Script graph" component, with that
 * entity as Self.
 *
 * Validation checks node types, parameter types, and that every link joins
 * an output to a compatible input (exec to exec; data of the same type, or
 * anything into a string). Execution errors are caught per node: the node is
 * marked, the message logged, and the rest of the game keeps running.
 */
export type PortType = 'exec' | 'number' | 'bool' | 'entity' | 'string';
export interface Port { name: string; type: PortType }
export interface GNode { id: string; type: string; x: number; y: number; params: Record<string, number | string | boolean> }
export interface GLink { from: string; out: string; to: string; in: string }
export interface GraphDoc { id: string; name: string; nodes: GNode[]; links: GLink[] }

export interface RunCtx {
	self: string;
	dt: number;
	time: number;
	/** event payload of the event that started this chain */
	eventValue: number;
	api: GraphAPI;
	state: Record<string, any>;
}
export interface GraphAPI {
	command(entity: string, name: string, value: number): void;
	emit(entity: string, event: string, value: number): void;
	setVisible(entity: string, on: boolean): void;
	moveBy(entity: string, x: number, y: number, z: number): void;
	setColor(entity: string, hex: string): void;
	setLight(entity: string, intensity: number): void;
	impulse(entity: string, x: number, y: number, z: number): void;
	tone(freq: number, seconds: number, at?: string): void;
	log(msg: string): void;
	spawnCopy(entity: string): void;
	addItem(item: string, n: number): void;
	itemCount(item: string): number;
	distanceToPlayer(entity: string): number;
	after(seconds: number, fn: () => void): void;
}

export interface NodeDef {
	type: string;
	title: string;
	category: 'Event' | 'Flow' | 'Action' | 'Data';
	inputs: Port[];
	outputs: Port[];
	/** editable values (also the default for unlinked data inputs of the same name) */
	params: Record<string, number | string | boolean>;
	/** for event nodes: what starts them */
	event?: 'start' | 'tick' | 'entity';
	/** run on exec; return the exec outputs to continue */
	exec?(n: GNode, get: (port: string) => any, c: RunCtx, cont: (out: string) => void): string[] | void;
	/** produce a data output */
	value?(n: GNode, get: (port: string) => any, c: RunCtx, out: string): any;
}

const X: Port = { name: 'in', type: 'exec' };
const O: Port = { name: 'out', type: 'exec' };
const ent = (name = 'entity'): Port => ({ name, type: 'entity' });
const num = (name: string): Port => ({ name, type: 'number' });
const str = (name: string): Port => ({ name, type: 'string' });

export const NODES: NodeDef[] = [
	// events
	{ type: 'OnStart', title: 'On Start', category: 'Event', inputs: [], outputs: [O], params: {}, event: 'start' },
	{ type: 'OnTick', title: 'On Tick', category: 'Event', inputs: [], outputs: [O, num('dt')], params: {}, event: 'tick', value: (_n, _g, c) => c.dt },
	{ type: 'OnEvent', title: 'On Event', category: 'Event', inputs: [], outputs: [O, num('value')], params: { entity: 'self', event: 'used' }, event: 'entity', value: (_n, _g, c) => c.eventValue },
	// flow
	{ type: 'Branch', title: 'Branch', category: 'Flow', inputs: [X, { name: 'condition', type: 'bool' }], outputs: [{ name: 'true', type: 'exec' }, { name: 'false', type: 'exec' }], params: { condition: true }, exec: (_n, get) => [get('condition') ? 'true' : 'false'] },
	{ type: 'Delay', title: 'Delay', category: 'Flow', inputs: [X, num('seconds')], outputs: [O], params: { seconds: 1 }, exec: (_n, get, c, cont) => { c.api.after(Math.max(0, Number(get('seconds'))), () => cont('out')); } },
	{ type: 'Sequence', title: 'Sequence', category: 'Flow', inputs: [X], outputs: [{ name: 'first', type: 'exec' }, { name: 'then', type: 'exec' }], params: {}, exec: () => ['first', 'then'] },
	{ type: 'DoOnce', title: 'Do Once', category: 'Flow', inputs: [X], outputs: [O], params: {}, exec: (n, _g, c) => { if (c.state[n.id]) return []; c.state[n.id] = true; return ['out']; } },
	{ type: 'FlipFlop', title: 'Flip Flop', category: 'Flow', inputs: [X], outputs: [{ name: 'A', type: 'exec' }, { name: 'B', type: 'exec' }], params: {}, exec: (n, _g, c) => { c.state[n.id] = !c.state[n.id]; return [c.state[n.id] ? 'A' : 'B']; } },
	// actions
	{ type: 'SendCommand', title: 'Send Command', category: 'Action', inputs: [X, ent(), str('command'), num('value')], outputs: [O], params: { entity: 'self', command: 'toggle', value: 10 }, exec: (_n, get, c) => { c.api.command(String(get('entity')), String(get('command')), Number(get('value'))); return ['out']; } },
	{ type: 'Emit', title: 'Emit Event', category: 'Action', inputs: [X, ent(), str('event'), num('value')], outputs: [O], params: { entity: 'self', event: 'custom', value: 0 }, exec: (_n, get, c) => { c.api.emit(String(get('entity')), String(get('event')), Number(get('value'))); return ['out']; } },
	{ type: 'SetVisible', title: 'Set Visible', category: 'Action', inputs: [X, ent(), { name: 'visible', type: 'bool' }], outputs: [O], params: { entity: 'self', visible: true }, exec: (_n, get, c) => { c.api.setVisible(String(get('entity')), !!get('visible')); return ['out']; } },
	{ type: 'MoveBy', title: 'Move By', category: 'Action', inputs: [X, ent(), num('x'), num('y'), num('z')], outputs: [O], params: { entity: 'self', x: 0, y: 0.1, z: 0 }, exec: (_n, get, c) => { c.api.moveBy(String(get('entity')), Number(get('x')), Number(get('y')), Number(get('z'))); return ['out']; } },
	{ type: 'SetColor', title: 'Set Colour', category: 'Action', inputs: [X, ent(), str('colour')], outputs: [O], params: { entity: 'self', colour: '#ff3b30' }, exec: (_n, get, c) => { c.api.setColor(String(get('entity')), String(get('colour'))); return ['out']; } },
	{ type: 'SetLight', title: 'Set Light', category: 'Action', inputs: [X, ent(), num('intensity')], outputs: [O], params: { entity: 'self', intensity: 2 }, exec: (_n, get, c) => { c.api.setLight(String(get('entity')), Number(get('intensity'))); return ['out']; } },
	{ type: 'Impulse', title: 'Push (impulse)', category: 'Action', inputs: [X, ent(), num('x'), num('y'), num('z')], outputs: [O], params: { entity: 'self', x: 0, y: 2, z: 0 }, exec: (_n, get, c) => { c.api.impulse(String(get('entity')), Number(get('x')), Number(get('y')), Number(get('z'))); return ['out']; } },
	{ type: 'PlayTone', title: 'Play Tone', category: 'Action', inputs: [X, num('frequency'), num('seconds')], outputs: [O], params: { frequency: 660, seconds: 0.2 }, exec: (_n, get, c) => { c.api.tone(Number(get('frequency')), Number(get('seconds')), c.self); return ['out']; } },
	{ type: 'Log', title: 'Log', category: 'Action', inputs: [X, str('text'), num('value')], outputs: [O], params: { text: 'Hello', value: 0 }, exec: (n, get, c) => { const linked = (n as any)._valueLinked; c.api.log(String(get('text')) + (linked ? ' ' + get('value') : '')); return ['out']; } },
	{ type: 'SpawnCopy', title: 'Spawn Copy', category: 'Action', inputs: [X, ent()], outputs: [O], params: { entity: 'self' }, exec: (_n, get, c) => { c.api.spawnCopy(String(get('entity'))); return ['out']; } },
	{ type: 'AddItem', title: 'Add Item', category: 'Action', inputs: [X, str('item'), num('amount')], outputs: [O], params: { item: 'coin', amount: 1 }, exec: (_n, get, c) => { c.api.addItem(String(get('item')), Number(get('amount'))); return ['out']; } },
	// data
	{ type: 'Number', title: 'Number', category: 'Data', inputs: [], outputs: [num('value')], params: { value: 1 }, value: (n) => Number(n.params.value) },
	{ type: 'Add', title: 'Add', category: 'Data', inputs: [num('a'), num('b')], outputs: [num('sum')], params: { a: 0, b: 1 }, value: (_n, get) => Number(get('a')) + Number(get('b')) },
	{ type: 'Multiply', title: 'Multiply', category: 'Data', inputs: [num('a'), num('b')], outputs: [num('product')], params: { a: 1, b: 2 }, value: (_n, get) => Number(get('a')) * Number(get('b')) },
	{ type: 'Greater', title: 'Greater Than', category: 'Data', inputs: [num('a'), num('b')], outputs: [{ name: 'result', type: 'bool' }], params: { a: 0, b: 0 }, value: (_n, get) => Number(get('a')) > Number(get('b')) },
	{ type: 'Not', title: 'Not', category: 'Data', inputs: [{ name: 'in', type: 'bool' }], outputs: [{ name: 'out', type: 'bool' }], params: { in: false }, value: (_n, get) => !get('in') },
	{ type: 'Random', title: 'Random', category: 'Data', inputs: [num('min'), num('max')], outputs: [num('value')], params: { min: 0, max: 1 }, value: (_n, get) => Number(get('min')) + Math.random() * (Number(get('max')) - Number(get('min'))) },
	{ type: 'Time', title: 'Time', category: 'Data', inputs: [], outputs: [num('seconds')], params: {}, value: (_n, _g, c) => c.time },
	{ type: 'Distance', title: 'Distance to Player', category: 'Data', inputs: [ent()], outputs: [num('metres')], params: { entity: 'self' }, value: (_n, get, c) => c.api.distanceToPlayer(String(get('entity'))) },
	{ type: 'ItemCount', title: 'Item Count', category: 'Data', inputs: [str('item')], outputs: [num('count')], params: { item: 'coin' }, value: (_n, get, c) => c.api.itemCount(String(get('item'))) },
];
export const NODE = new Map(NODES.map((n) => [n.type, n]));

const compatible = (from: PortType, to: PortType) => from === to || (to === 'string' && from !== 'exec');

/** null if the graph is well formed */
export function validateGraph(g: any): string | null {
	if (!g || typeof g !== 'object' || typeof g.id !== 'string' || !/^[\w-]{1,40}$/.test(g.id) || typeof g.name !== 'string' || g.name.length > 60) return 'bad graph header';
	if (!Array.isArray(g.nodes) || !Array.isArray(g.links) || g.nodes.length > 300 || g.links.length > 600) return 'bad graph body';
	const ids = new Set<string>();
	for (const n of g.nodes) {
		const def = n && NODE.get(n.type);
		if (!def) return `unknown node type ${n?.type}`;
		if (typeof n.id !== 'string' || ids.has(n.id) || !Number.isFinite(n.x) || !Number.isFinite(n.y)) return 'bad node';
		ids.add(n.id);
		if (!n.params || typeof n.params !== 'object') return 'bad node params';
		for (const [k, v] of Object.entries(n.params)) {
			if (!(k in def.params)) return `${def.title} has no parameter ${k}`;
			if (typeof v !== typeof def.params[k]) return `${def.title}.${k} has the wrong type`;
			if (typeof v === 'number' && !Number.isFinite(v)) return `${def.title}.${k} is not a number`;
			if (typeof v === 'string' && v.length > 200) return `${def.title}.${k} is too long`;
		}
	}
	const byId = new Map(g.nodes.map((n: GNode) => [n.id, n]));
	for (const l of g.links) {
		const a = byId.get(l?.from) as GNode | undefined, b = byId.get(l?.to) as GNode | undefined;
		if (!a || !b) return 'link to a missing node';
		const op = NODE.get(a.type)!.outputs.find((p) => p.name === l.out);
		const ip = NODE.get(b.type)!.inputs.find((p) => p.name === l.in);
		if (!op || !ip) return 'link to a missing port';
		if (!compatible(op.type, ip.type)) return `cannot link ${op.type} to ${ip.type}`;
	}
	return null;
}

export function portType(n: GNode, name: string, dir: 'in' | 'out') {
	const def = NODE.get(n.type)!;
	return (dir === 'in' ? def.inputs : def.outputs).find((p) => p.name === name)?.type;
}
export { compatible };

/** Debug info the editor shows on nodes */
export interface Debug { lastRun: Map<string, number>; values: Map<string, any>; errors: Map<string, string> }

/** Runs one graph for one entity (Self). */
export class GraphRunner {
	readonly debug: Debug = { lastRun: new Map(), values: new Map(), errors: new Map() };
	state: Record<string, any> = {};
	private byId: Map<string, GNode>;
	private linksTo = new Map<string, GLink>();     // `${node}.${in}` -> link (data inputs)
	private linksFrom = new Map<string, GLink[]>(); // `${node}.${out}` -> links (exec)
	private steps = 0;

	constructor(readonly graph: GraphDoc, readonly self: string, private api: GraphAPI, private onError: (msg: string) => void) {
		this.byId = new Map(graph.nodes.map((n) => [n.id, n]));
		for (const l of graph.links) {
			this.linksTo.set(`${l.to}.${l.in}`, l);
			const k = `${l.from}.${l.out}`;
			(this.linksFrom.get(k) ?? this.linksFrom.set(k, []).get(k)!).push(l);
			const tn = this.byId.get(l.to);
			if (tn && tn.type === 'Log' && l.in === 'value') (tn as any)._valueLinked = true;
		}
	}

	private ctx(dt: number, time: number, eventValue = 0): RunCtx {
		return { self: this.self, dt, time, eventValue, api: this.api, state: this.state };
	}

	/** fire the event nodes of a kind (and for 'entity', matching entity + event) */
	fire(kind: 'start' | 'tick' | 'entity', dt: number, time: number, match?: { entity: string; event: string; value?: number }) {
		for (const n of this.graph.nodes) {
			const def = NODE.get(n.type)!;
			if (def.event !== kind) continue;
			if (kind === 'entity') {
				const want = String(n.params.entity) === 'self' ? this.self : String(n.params.entity);
				if (!match || want !== match.entity || String(n.params.event) !== match.event) continue;
			}
			this.steps = 0;
			const c = this.ctx(dt, time, match?.value ?? 0);
			this.debug.lastRun.set(n.id, performance.now());
			this.follow(n, 'out', c);
		}
	}

	private follow(from: GNode, out: string, c: RunCtx) {
		for (const l of this.linksFrom.get(`${from.id}.${out}`) ?? []) {
			const n = this.byId.get(l.to);
			if (n) this.run(n, c);
		}
	}

	private run(n: GNode, c: RunCtx) {
		if (++this.steps > 2000) { this.fail(n, 'more than 2000 steps from one event (a loop?)'); return; }
		const def = NODE.get(n.type)!;
		this.debug.lastRun.set(n.id, performance.now());
		try {
			const outs = def.exec?.(n, (p) => this.input(n, p, c, 0), c, (o) => { this.steps = 0; this.follow(n, o, c); }) ?? [];
			this.debug.errors.delete(n.id);
			for (const o of outs) this.follow(n, o, c);
		} catch (err) {
			this.fail(n, (err as Error).message);
		}
	}

	private input(n: GNode, port: string, c: RunCtx, depth: number): any {
		const l = this.linksTo.get(`${n.id}.${port}`);
		let v: any;
		if (l && depth < 64) {
			const src = this.byId.get(l.from)!;
			const def = NODE.get(src.type)!;
			v = def.value?.(src, (p) => this.input(src, p, c, depth + 1), c, l.out);
			this.debug.values.set(`${src.id}.${l.out}`, v);
		} else v = n.params[port];
		if (port === 'entity' && (v === 'self' || v === '' || v === undefined)) v = this.self;
		this.debug.values.set(`${n.id}.${port}`, v);
		return v;
	}

	private fail(n: GNode, msg: string) {
		const def = NODE.get(n.type)!;
		if (this.debug.errors.get(n.id) !== msg) this.onError(`Graph "${this.graph.name}" › ${def.title}: ${msg}`);
		this.debug.errors.set(n.id, msg);
	}
}

/** A starter graph: when Self is used, toggle it (a door) and play a tone. */
export function sampleGraph(id: string): GraphDoc {
	return {
		id, name: 'Use toggles',
		nodes: [
			{ id: 'n1', type: 'OnEvent', x: 60, y: 80, params: { entity: 'self', event: 'used' } },
			{ id: 'n2', type: 'SendCommand', x: 340, y: 60, params: { entity: 'self', command: 'toggle', value: 0 } },
			{ id: 'n3', type: 'PlayTone', x: 640, y: 80, params: { frequency: 520, seconds: 0.15 } },
		],
		links: [{ from: 'n1', out: 'out', to: 'n2', in: 'in' }, { from: 'n2', out: 'out', to: 'n3', in: 'in' }],
	};
}
