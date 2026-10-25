import type { App, DesktopOS, KeyInput, Rect, CursorStyle } from './os';
import type { Editor } from '../engine/editor';
import type { Gameplay } from '../engine/gameplay';
import { NODES, NODE, compatible, portType, type GraphDoc, type GNode, type GLink, type PortType } from '../engine/graph';
import { log } from '../engine/log';

/**
 * "Logic": the node graph editor. Graphs are scene assets (saved with the
 * scene, undoable); attach one to an entity with a "Script graph" component
 * (Studio inspector) and it runs while the game plays, with that entity as
 * Self.
 *
 * - Palette (left): click a node type to add it in the middle of the view.
 * - Canvas: drag empty space to pan, wheel to zoom, drag a node by its title.
 * - Drag from an output port (right side) to an input port (left side) to
 *   link; links are type-checked (exec white, number blue, bool red, entity
 *   green, string yellow). Click a linked input to unlink it.
 * - Click a value chip to type a new value. Select a node (click its title)
 *   and press Delete to remove it.
 * - While playing, nodes that just ran glow, ports show their last values,
 *   and a node that failed turns red with the error.
 */
const COL: Record<PortType, string> = { exec: '#f2f2f2', number: '#4fa3ff', bool: '#ff6b6b', entity: '#5ad08a', string: '#ffd34d' };
const CAT: Record<string, string> = { Event: '#8a3b3b', Flow: '#4a4f57', Action: '#2d5b8a', Data: '#3a6b45' };
const NW = 230, HEAD = 30, ROW = 28;
type Hit = { x: number; y: number; w: number; h: number; cursor?: CursorStyle; down?: (x: number, y: number) => void; drag?: (dx: number, dy: number, x: number, y: number) => void; up?: (moved: boolean, x: number, y: number) => void };

export class LogicApp implements App {
	id = 'logic';
	title = 'Logic';
	defaultRect = { x: 80, y: 70, w: 1760, h: 880 };
	minSize: [number, number] = [1100, 600];
	graphId: string | null = null;
	private pan = { x: 260, y: 120 };
	private zoom = 1;
	private hits: Hit[] = [];
	private active: { hit: Hit; x0: number; y0: number; lx: number; ly: number; moved: boolean } | null = null;
	private selected: string | null = null;
	private wire: { node: string; port: string; type: PortType; x: number; y: number } | null = null;
	private text: { value: string; commit: (s: string) => void; key: string } | null = null;
	private mouse = { x: 0, y: 0 };
	private confirm: { msg: string; yes: () => void } | null = null;
	private lastDraw = 0;
	private sig = '';

	constructor(private os: DesktopOS, private ed: Editor, private gp: Gameplay) {}

	private get graph(): GraphDoc | null { return this.graphId ? this.gp.graphs.get(this.graphId) ?? null : null; }

	/** apply a change to the current graph as one undoable, validated op */
	private change(fn: (g: GraphDoc) => void, _label?: string) {
		const g = this.graph;
		if (!g) return;
		const next = structuredClone(g);
		fn(next);
		this.ed.apply({ op: 'graph', id: g.id, graph: next });
	}

	newGraph(): string {
		let n = this.gp.graphs.size + 1, id = `graph-${n}`;
		while (this.gp.graphs.has(id)) id = `graph-${++n}`;
		const g: GraphDoc = { id, name: `Graph ${n}`, nodes: [{ id: 'n1', type: 'OnEvent', x: 40, y: 60, params: { entity: 'self', event: 'used' } }], links: [] };
		this.ed.apply({ op: 'graph', id, graph: g });
		this.graphId = id;
		return id;
	}

	// ------------------------------------------------------------------ App
	drawIcon(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
		c.save();
		const g = c.createLinearGradient(0, y, 0, y + s); g.addColorStop(0, '#5a3a7a'); g.addColorStop(1, '#241634');
		c.beginPath(); c.roundRect(x, y, s, s, s * 0.23); c.fillStyle = g; c.fill(); c.clip();
		const b = (bx: number, by: number, col: string) => { c.fillStyle = col; c.beginPath(); c.roundRect(x + s * bx, y + s * by, s * 0.3, s * 0.2, 4); c.fill(); };
		c.strokeStyle = '#e8e0f2'; c.lineWidth = s * 0.04;
		c.beginPath(); c.moveTo(x + s * 0.4, y + s * 0.32); c.bezierCurveTo(x + s * 0.55, y + s * 0.32, x + s * 0.45, y + s * 0.68, x + s * 0.6, y + s * 0.68); c.stroke();
		b(0.1, 0.22, '#c25a5a'); b(0.6, 0.58, '#4f8dff');
		c.restore();
	}

	animating(_f: boolean, now: number) {
		const s = `${this.ed.world.version}|${this.ed.runtime.mode}|${log.version}|${this.graphId}`;
		if (s !== this.sig) { this.sig = s; return true; }
		// debug glow while the game runs
		return this.ed.runtime.mode === 'play' && now - this.lastDraw > 150;
	}

	cursor(x: number, y: number): CursorStyle { return this.hitAt(x, y)?.cursor ?? 'arrow'; }

	pointerMove(x: number, y: number, _r: Rect, down: boolean) {
		this.mouse = { x, y };
		const a = this.active;
		if (!down || !a) return;
		if (Math.abs(x - a.x0) + Math.abs(y - a.y0) > 3) a.moved = true;
		a.hit.drag?.(x - a.lx, y - a.ly, x, y);
		a.lx = x; a.ly = y;
		this.os.invalidate();
	}
	pointerDown(x: number, y: number) {
		this.mouse = { x, y };
		if (this.text) { const t = this.text; this.text = null; t.commit(t.value); }
		const h = this.hitAt(x, y);
		if (!h) return;
		this.active = { hit: h, x0: x, y0: y, lx: x, ly: y, moved: false };
		h.down?.(x, y);
	}
	pointerUp(x: number, y: number) { const a = this.active; this.active = null; a?.hit.up?.(a.moved, x, y); this.wire = null; this.os.invalidate(); }
	wheel(dy: number) {
		const f = Math.exp(-dy * 0.001);
		const nz = Math.min(2, Math.max(0.35, this.zoom * f));
		// zoom about the mouse
		const { x, y } = this.mouse;
		this.pan.x = x - (x - this.pan.x) * (nz / this.zoom);
		this.pan.y = y - (y - this.pan.y) * (nz / this.zoom);
		this.zoom = nz;
	}
	key(k: KeyInput): boolean {
		if (this.text) {
			if (k.code === 'Enter' || k.code === 'NumpadEnter') { const t = this.text; this.text = null; t.commit(t.value); return true; }
			if (k.code === 'Escape') { this.text = null; return true; }
			if (k.code === 'Backspace') { this.text.value = this.text.value.slice(0, -1); return true; }
			if (k.key.length === 1 && !k.ctrl && !k.meta) { this.text.value += k.key; return true; }
			return true;
		}
		const mod = k.ctrl || k.meta;
		if (mod && k.code === 'KeyZ') { if (k.shift) this.ed.redo(); else this.ed.undo(); return true; }
		if (mod && k.code === 'KeyY') { this.ed.redo(); return true; }
		if ((k.code === 'Delete' || k.code === 'Backspace') && this.selected) { this.deleteNode(this.selected); return true; }
		return false;
	}

	// ------------------------------------------------------------------ draw
	draw(c: CanvasRenderingContext2D, r: Rect, _f: boolean, now: number) {
		this.lastDraw = now;
		this.hits = [];
		const W = r.w, H = r.h, ui = this.os.fonts.ui;
		c.save(); c.translate(r.x, r.y);
		c.fillStyle = '#17191d'; c.fillRect(0, 0, W, H);
		// grid
		c.strokeStyle = 'rgba(255,255,255,0.04)'; c.lineWidth = 1;
		const gs = 40 * this.zoom;
		for (let gx = ((this.pan.x % gs) + gs) % gs; gx < W; gx += gs) { c.beginPath(); c.moveTo(gx, 0); c.lineTo(gx, H); c.stroke(); }
		for (let gy = ((this.pan.y % gs) + gs) % gs; gy < H; gy += gs) { c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke(); }
		// canvas pan (lowest hit)
		this.hits.push({ x: 230, y: 56, w: W - 230, h: H - 56, cursor: 'move', drag: (dx, dy) => { this.pan.x += dx; this.pan.y += dy; }, up: (moved) => { if (!moved) this.selected = null; } });
		const g = this.graph;
		if (g) this.drawGraph(c, g, now);
		this.palette(c, H);
		this.topBar(c, W);
		if (!g) {
			c.fillStyle = '#9aa3ae'; c.font = `400 20px ${ui}`; c.textBaseline = 'middle';
			c.fillText(this.gp.graphs.size ? 'Pick a graph above, or make a new one.' : 'No graphs yet. "New graph" makes one; attach it to an object with a Script graph component in Studio.', 260, 140);
		}
		if (this.confirm) this.dialog(c, W, H);
		c.restore();
	}

	private topBar(c: CanvasRenderingContext2D, W: number) {
		c.fillStyle = '#25292f'; c.fillRect(0, 0, W, 56);
		let x = 12;
		const ids = [...this.gp.graphs.keys()];
		const btn = (label: string, w: number, fn: () => void, on = false, enabled = true) => { this.button(c, label, x, 9, w, 38, fn, on, enabled); x += w + 8; };
		btn('New graph', 120, () => this.newGraph());
		for (const id of ids.slice(0, 7)) btn(this.gp.graphs.get(id)!.name.slice(0, 16), 150, () => { this.graphId = id; }, id === this.graphId);
		const g = this.graph;
		if (g) {
			x += 10;
			this.textChip(c, 'name', g.name, x, 13, 200, (s) => { if (s.trim()) this.change((gg) => { gg.name = s.trim().slice(0, 60); }); });
			x += 210;
			btn('Delete graph', 140, () => { this.confirm = { msg: `Delete graph "${g.name}"? Objects using it stop running it (undo brings it back).`, yes: () => { this.ed.apply({ op: 'graph', id: g.id, graph: null }); this.graphId = null; } }; });
		}
		const runner = this.gp.runners.find((rr) => rr.graph.id === this.graphId);
		c.fillStyle = runner ? '#5ad08a' : '#9aa3ae'; c.font = `500 15px ${this.os.fonts.ui}`; c.textAlign = 'right'; c.textBaseline = 'middle';
		c.fillText(runner ? `running on ${this.gp.runners.filter((rr) => rr.graph.id === this.graphId).length} object(s)` : this.ed.runtime.mode === 'play' ? 'not attached to any object' : `game ${this.ed.runtime.mode}`, W - 16, 28);
		c.textAlign = 'left';
	}

	private palette(c: CanvasRenderingContext2D, H: number) {
		c.fillStyle = '#20232a'; c.fillRect(0, 56, 230, H - 56);
		let y = 66;
		for (const cat of ['Event', 'Flow', 'Action', 'Data']) {
			c.fillStyle = '#9aa3ae'; c.font = `700 13px ${this.os.fonts.ui}`; c.textBaseline = 'middle'; c.fillText(cat.toUpperCase(), 14, y + 8); y += 22;
			for (const d of NODES.filter((n) => n.category === cat)) {
				this.button(c, d.title, 10, y, 210, 26, () => this.addNode(d.type), false, !!this.graph, CAT[cat]);
				y += 29;
			}
			y += 6;
		}
	}

	private nodePos(n: GNode) { return { x: this.pan.x + n.x * this.zoom, y: this.pan.y + n.y * this.zoom }; }
	private portPos(n: GNode, port: string, dir: 'in' | 'out') {
		const def = NODE.get(n.type)!;
		const list = dir === 'in' ? def.inputs : def.outputs;
		const i = list.findIndex((p) => p.name === port);
		const p = this.nodePos(n);
		return { x: p.x + (dir === 'in' ? 0 : NW * this.zoom), y: p.y + (HEAD + ROW * i + ROW / 2) * this.zoom };
	}

	private drawGraph(c: CanvasRenderingContext2D, g: GraphDoc, now: number) {
		const z = this.zoom, ui = this.os.fonts.ui;
		const runner = this.gp.runners.find((r) => r.graph.id === g.id);
		const byId = new Map(g.nodes.map((n) => [n.id, n]));
		// links
		for (const l of g.links) {
			const a = byId.get(l.from), b = byId.get(l.to);
			if (!a || !b) continue;
			const p = this.portPos(a, l.out, 'out'), q = this.portPos(b, l.in, 'in');
			const t = portType(a, l.out, 'out') ?? 'exec';
			c.strokeStyle = COL[t]; c.lineWidth = (t === 'exec' ? 3 : 2) * z;
			c.beginPath(); c.moveTo(p.x, p.y); c.bezierCurveTo(p.x + 80 * z, p.y, q.x - 80 * z, q.y, q.x, q.y); c.stroke();
		}
		if (this.wire) {
			const p = this.portPos(byId.get(this.wire.node)!, this.wire.port, 'out');
			c.strokeStyle = COL[this.wire.type]; c.lineWidth = 2; c.setLineDash([6, 4]);
			c.beginPath(); c.moveTo(p.x, p.y); c.bezierCurveTo(p.x + 80, p.y, this.mouse.x - 80, this.mouse.y, this.mouse.x, this.mouse.y); c.stroke(); c.setLineDash([]);
		}
		// nodes
		for (const n of g.nodes) {
			const def = NODE.get(n.type)!;
			const p = this.nodePos(n);
			const rows = Math.max(def.inputs.length, def.outputs.length);
			const h = (HEAD + ROW * rows + 8) * z, w = NW * z;
			const ran = runner?.debug.lastRun.get(n.id);
			const err = runner?.debug.errors.get(n.id);
			const glow = ran !== undefined && now - ran < 350;
			c.save();
			if (glow) { c.shadowColor = '#ffd34d'; c.shadowBlur = 24; }
			c.beginPath(); c.roundRect(p.x, p.y, w, h, 10 * z); c.fillStyle = '#2a2e35'; c.fill();
			c.restore();
			c.lineWidth = 2; c.strokeStyle = err ? '#ff6b6b' : this.selected === n.id ? '#ffffff' : glow ? '#ffd34d' : '#3a4049';
			c.beginPath(); c.roundRect(p.x, p.y, w, h, 10 * z); c.stroke();
			c.beginPath(); c.roundRect(p.x, p.y, w, HEAD * z, [10 * z, 10 * z, 0, 0]); c.fillStyle = CAT[def.category]; c.fill();
			c.fillStyle = '#fff'; c.font = `600 ${15 * z}px ${ui}`; c.textBaseline = 'middle';
			c.fillText(def.title, p.x + 10 * z, p.y + HEAD * z / 2);
			if (err) { c.fillStyle = '#ff6b6b'; c.font = `400 ${12 * z}px ${ui}`; c.fillText(err.slice(0, 40), p.x, p.y + h + 12 * z); }
			// drag by title / select
			let moved0 = { x: n.x, y: n.y };
			this.hits.push({
				x: p.x, y: p.y, w, h: HEAD * z, cursor: 'move',
				down: () => { this.selected = n.id; moved0 = { x: n.x, y: n.y }; },
				drag: (dx, dy) => { n.x += dx / z; n.y += dy / z; }, // preview on the live doc
				up: (moved) => { if (!moved) return; const nx = Math.round(n.x), ny = Math.round(n.y); n.x = moved0.x; n.y = moved0.y; this.change((gg) => { const m = gg.nodes.find((q) => q.id === n.id)!; m.x = nx; m.y = ny; }); },
			});
			// inputs (with value chips when not linked)
			def.inputs.forEach((port, i) => {
				const py = p.y + (HEAD + ROW * i + ROW / 2) * z;
				const linked = g.links.find((l) => l.to === n.id && l.in === port.name);
				c.fillStyle = COL[port.type]; c.beginPath(); c.arc(p.x, py, 6 * z, 0, 7); c.fill();
				c.fillStyle = '#c8ced6'; c.font = `400 ${13 * z}px ${ui}`; c.fillText(port.name === 'in' ? '' : port.name, p.x + 12 * z, py);
				if (linked) this.hits.push({ x: p.x - 10 * z, y: py - 10 * z, w: 20 * z, h: 20 * z, cursor: 'pointer', up: (moved) => { if (!moved) this.change((gg) => { gg.links = gg.links.filter((l) => !(l.to === n.id && l.in === port.name)); }); } });
				else if (port.type !== 'exec' && port.name in n.params) this.valueChip(c, n, port.name, p.x + 92 * z, py - 11 * z, 128 * z, 22 * z);
				const dv = runner?.debug.values.get(`${n.id}.${port.name}`);
				if (linked && dv !== undefined) { c.fillStyle = '#7f8893'; c.fillText('= ' + fmt(dv), p.x + 92 * z, py); }
			});
			// params that are not inputs (event filters, constants)
			let extra = def.inputs.length;
			for (const key of Object.keys(def.params)) {
				if (def.inputs.some((ip) => ip.name === key)) continue;
				const py = p.y + (HEAD + ROW * extra + ROW / 2) * z;
				c.fillStyle = '#c8ced6'; c.font = `400 ${13 * z}px ${ui}`; c.fillText(key, p.x + 12 * z, py);
				this.valueChip(c, n, key, p.x + 92 * z, py - 11 * z, 128 * z, 22 * z);
				extra++;
			}
			// outputs
			def.outputs.forEach((port, i) => {
				const q = this.portPos(n, port.name, 'out');
				c.fillStyle = COL[port.type]; c.beginPath(); c.arc(q.x, q.y, 6 * z, 0, 7); c.fill();
				c.fillStyle = '#c8ced6'; c.font = `400 ${13 * z}px ${ui}`; c.textAlign = 'right';
				c.fillText(port.name === 'out' ? '' : port.name, q.x - 12 * z, q.y); c.textAlign = 'left';
				this.hits.push({
					x: q.x - 12 * z, y: q.y - 12 * z, w: 24 * z, h: 24 * z, cursor: 'pointer',
					down: () => { this.wire = { node: n.id, port: port.name, type: port.type, x: q.x, y: q.y }; },
					drag: () => {},
					up: (_m, x, y) => this.dropWire(g, x, y),
				});
				void i;
			});
		}
	}

	private dropWire(g: GraphDoc, x: number, y: number) {
		const w = this.wire;
		this.wire = null;
		if (!w) return;
		for (const n of g.nodes) {
			const def = NODE.get(n.type)!;
			for (const port of def.inputs) {
				const q = this.portPos(n, port.name, 'in');
				if (Math.hypot(q.x - x, q.y - y) > 16 * this.zoom) continue;
				if (n.id === w.node) { log.warn('A node cannot link to itself'); return; }
				if (!compatible(w.type, port.type)) { log.warn(`Cannot link ${w.type} to ${port.type}`); return; }
				const link: GLink = { from: w.node, out: w.port, to: n.id, in: port.name };
				this.change((gg) => {
					// a data input has one source; exec inputs may have many
					if (port.type !== 'exec') gg.links = gg.links.filter((l) => !(l.to === n.id && l.in === port.name));
					// an exec output drives one chain
					if (w.type === 'exec') gg.links = gg.links.filter((l) => !(l.from === w.node && l.out === w.port));
					gg.links.push(link);
				});
				return;
			}
		}
	}

	private valueChip(c: CanvasRenderingContext2D, n: GNode, key: string, x: number, y: number, w: number, h: number) {
		const v = n.params[key];
		const k = `${n.id}.${key}`;
		const editing = this.text?.key === k;
		c.beginPath(); c.roundRect(x, y, w, h, 5); c.fillStyle = editing ? '#0f1114' : '#1b1e23'; c.fill();
		c.fillStyle = '#e8ebef'; c.font = `400 ${13 * this.zoom}px ${this.os.fonts.mono}`; c.textBaseline = 'middle';
		c.fillText(editing ? this.text!.value + '▏' : String(v).slice(0, 16), x + 6, y + h / 2);
		this.hits.push({
			x, y, w, h, cursor: 'text',
			up: (moved) => {
				if (moved) return;
				if (typeof v === 'boolean') { this.change((gg) => { gg.nodes.find((q) => q.id === n.id)!.params[key] = !v; }); return; }
				this.text = { key: k, value: String(v), commit: (s) => {
					let nv: number | string = s;
					if (typeof v === 'number') { nv = parseFloat(s); if (!Number.isFinite(nv)) { log.warn('Not a number: ' + s); return; } }
					this.change((gg) => { gg.nodes.find((q) => q.id === n.id)!.params[key] = nv; });
				} };
			},
		});
	}

	private textChip(c: CanvasRenderingContext2D, key: string, value: string, x: number, y: number, w: number, commit: (s: string) => void) {
		const editing = this.text?.key === key;
		c.beginPath(); c.roundRect(x, y, w, 30, 6); c.fillStyle = editing ? '#0f1114' : '#2c3138'; c.fill();
		c.fillStyle = '#e8ebef'; c.font = `500 16px ${this.os.fonts.ui}`; c.textBaseline = 'middle';
		c.fillText(editing ? this.text!.value + '▏' : value, x + 8, y + 15);
		this.hits.push({ x, y, w, h: 30, cursor: 'text', up: () => { this.text = { key, value, commit }; } });
	}

	private addNode(type: string) {
		const g = this.graph;
		if (!g) return;
		const def = NODE.get(type)!;
		let i = g.nodes.length + 1, id = 'n' + i;
		while (g.nodes.some((n) => n.id === id)) id = 'n' + ++i;
		// in the middle of the visible canvas
		const x = Math.round((900 - this.pan.x) / this.zoom - NW / 2 + (Math.random() - 0.5) * 60), y = Math.round((400 - this.pan.y) / this.zoom + (Math.random() - 0.5) * 60);
		this.change((gg) => { gg.nodes.push({ id, type, x, y, params: structuredClone(def.params) }); });
		this.selected = id;
	}

	private deleteNode(id: string) {
		this.change((gg) => { gg.nodes = gg.nodes.filter((n) => n.id !== id); gg.links = gg.links.filter((l) => l.from !== id && l.to !== id); });
		this.selected = null;
	}

	private dialog(c: CanvasRenderingContext2D, W: number, H: number) {
		const d = this.confirm!;
		c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, W, H);
		this.hits.push({ x: 0, y: 0, w: W, h: H });
		const w = 620, h = 170, x = (W - w) / 2, y = (H - h) / 2;
		c.beginPath(); c.roundRect(x, y, w, h, 14); c.fillStyle = '#25292f'; c.fill();
		c.fillStyle = '#e8ebef'; c.font = `500 18px ${this.os.fonts.ui}`; c.textBaseline = 'middle';
		c.fillText(d.msg.slice(0, 70), x + 24, y + 40); c.fillText(d.msg.slice(70, 140), x + 24, y + 66);
		this.button(c, 'Confirm', x + w - 290, y + h - 58, 130, 40, () => { this.confirm = null; d.yes(); }, true);
		this.button(c, 'Cancel', x + w - 150, y + h - 58, 130, 40, () => { this.confirm = null; });
	}

	private button(c: CanvasRenderingContext2D, label: string, x: number, y: number, w: number, h: number, fn: () => void, on = false, enabled = true, color?: string) {
		c.beginPath(); c.roundRect(x, y, w, h, 7);
		c.fillStyle = on ? '#3d8bfd' : enabled ? (color ?? '#2c3138') : '#22252a'; c.fill();
		c.fillStyle = enabled ? '#fff' : '#5d636b'; c.font = `500 15px ${this.os.fonts.ui}`; c.textAlign = 'center'; c.textBaseline = 'middle';
		c.fillText(label, x + w / 2, y + h / 2 + 1); c.textAlign = 'left';
		if (enabled) this.hits.push({ x, y, w, h, cursor: 'pointer', up: (_m, ux, uy) => { if (ux >= x && ux <= x + w && uy >= y && uy <= y + h) fn(); } });
	}

	private hitAt(x: number, y: number) {
		for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h; }
		return null;
	}
}

function fmt(v: unknown) { return typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) : String(v).slice(0, 12); }
