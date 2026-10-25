import * as THREE from 'three';
import type { App, DesktopOS, KeyInput, Rect, CursorStyle } from './os';
import type { Editor } from '../engine/editor';
import type { EditorViewport } from '../engine/viewport';
import { LAYERS, type Entity, type Layer, readTRS, writeTRS, type TRS } from '../engine/entities';
import { log } from '../engine/log';
import { COMPONENTS } from '../engine/components';

/**
 * "Studio": the editor on the in-world computer. The world around the desk is
 * the game being edited; this window is the control centre. Layout:
 * toolbar (runtime, undo, tools, snapping, spawn, save) / hierarchy (search,
 * layers) / live viewport (orbit, pick, move + rotate gizmo) / inspector
 * (transform, material, light, physics) / log and live-vs-reload status.
 *
 * Immediate mode: draw() lays out the widgets and records hit boxes; pointer
 * events look them up. Values are edited by dragging (scrub, live preview)
 * or by clicking and typing; one undoable op is recorded on release / Enter.
 */
type Hit = { x: number; y: number; w: number; h: number; cursor?: CursorStyle; down?: (x: number, y: number) => void; drag?: (dx: number, dy: number, x: number, y: number) => void; up?: (moved: boolean, x: number, y: number) => void };

const C = {
	bg: '#1d2026', panel: '#25292f', panel2: '#2c3138', line: '#3a4049', text: '#e8ebef', dim: '#9aa3ae', accent: '#3d8bfd', warn: '#ffb648', err: '#ff6b6b', ok: '#5ad08a',
	sel: '#2f4f7d', x: '#ff5a5a', y: '#62d26f', z: '#4f8dff',
};
const SWATCHES = ['#f4f1ea', '#d8d4cc', '#8a8f96', '#2b2e33', '#0f1012', '#b5282e', '#e0622a', '#e8b630', '#4e9a4e', '#2f7fb8', '#5b4bb3', '#c05a8e', '#8a6440', '#c8a052'];
const LAYER_COL: Record<Layer, string> = { Props: '#5ad08a', Furniture: '#c8a052', Lights: '#ffd34d', Architecture: '#8a8f96', Weapons: '#ff6b6b', Spawned: '#3d8bfd', Places: '#b48cff' };

export class StudioApp implements App {
	id = 'studio';
	title = 'Studio';
	defaultRect = { x: 30, y: 46, w: 1860, h: 920 };
	minSize: [number, number] = [1300, 680];
	private hits: Hit[] = [];
	private active: { hit: Hit; x0: number; y0: number; lx: number; ly: number; moved: boolean } | null = null;
	private search = '';
	private layer: Layer | 'All' = 'All';
	private listScroll = 0;
	private inspScroll = 0;
	private multi = false;
	private picking = false;
	/** set by main: open the Logic app on a graph */
	openLogic: ((graphId: string) => void) | null = null;
	/** set by main: make a starter graph, returns its id */
	makeGraph: (() => string | null) | null = null;
	/** set by main: open the Code app on a script / make a starter script */
	openCode: ((scriptId: string) => void) | null = null;
	makeScript: (() => string | null) | null = null;
	private matIndex = 0;
	private text: { id: string; value: string; commit: (s: string) => void } | null = null;
	private confirm: { msg: string; yes: () => void } | null = null;
	private lastDraw = 0;
	private lastSeen = '';
	private mouse = { x: 0, y: 0 };
	private areas = { list: { x: 0, y: 0, w: 0, h: 0 }, insp: { x: 0, y: 0, w: 0, h: 0 }, view: { x: 0, y: 0, w: 0, h: 0 } };

	constructor(private os: DesktopOS, private ed: Editor, private vp: EditorViewport, private player: () => THREE.Vector3) {}

	// ------------------------------------------------------------------ App
	drawIcon(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
		c.save();
		const g = c.createLinearGradient(0, y, 0, y + s); g.addColorStop(0, '#3a4a66'); g.addColorStop(1, '#151b26');
		rr(c, x, y, s, s, s * 0.23); c.fillStyle = g; c.fill(); c.clip();
		// a cube with move arrows
		const cx = x + s / 2, cy = y + s * 0.54, k = s * 0.2;
		c.fillStyle = '#d8dee8'; c.beginPath(); c.moveTo(cx, cy - k); c.lineTo(cx + k, cy - k / 2); c.lineTo(cx, cy); c.lineTo(cx - k, cy - k / 2); c.fill();
		c.fillStyle = '#9aa7ba'; c.beginPath(); c.moveTo(cx - k, cy - k / 2); c.lineTo(cx, cy); c.lineTo(cx, cy + k); c.lineTo(cx - k, cy + k / 2); c.fill();
		c.fillStyle = '#6f7e94'; c.beginPath(); c.moveTo(cx + k, cy - k / 2); c.lineTo(cx, cy); c.lineTo(cx, cy + k); c.lineTo(cx + k, cy + k / 2); c.fill();
		c.lineWidth = s * 0.05; c.strokeStyle = C.x; c.beginPath(); c.moveTo(cx + k * 1.1, cy + k * 0.6); c.lineTo(cx + k * 2, cy + k * 1.1); c.stroke();
		c.strokeStyle = C.y; c.beginPath(); c.moveTo(cx, cy - k * 1.2); c.lineTo(cx, cy - k * 2.1); c.stroke();
		c.restore();
	}

	animating(_focused: boolean, now: number) {
		// redraw when the scene, selection, log or runtime changed, and often
		// enough that the viewport hole stays "shown"
		const sig = `${this.ed.selectionVersion}|${this.ed.world.version}|${log.version}|${this.ed.runtime.mode}|${this.ed.history.canUndo}|${!!this.ed.moving}`;
		if (sig !== this.lastSeen) { this.lastSeen = sig; return true; }
		if (this.ed.moving || this.ed.selection.some((e) => e.prop && !e.prop.body.isSleeping())) return now - this.lastDraw > 120;
		return now - this.lastDraw > 250;
	}

	cursor(x: number, y: number): CursorStyle {
		const h = this.hitAt(x, y);
		return h?.cursor ?? 'arrow';
	}

	pointerMove(x: number, y: number, _r: Rect, down: boolean) {
		this.mouse = { x, y };
		const a = this.active;
		if (!down || !a) return;
		const dx = x - a.lx, dy = y - a.ly;
		if (Math.abs(x - a.x0) + Math.abs(y - a.y0) > 3) a.moved = true;
		a.lx = x; a.ly = y;
		a.hit.drag?.(dx, dy, x, y);
		this.os.invalidate();
	}

	pointerDown(x: number, y: number) {
		this.mouse = { x, y };
		const h = this.hitAt(x, y);
		if (this.text && (!h || !(h as any).keepText)) this.commitText();
		if (!h) return;
		this.active = { hit: h, x0: x, y0: y, lx: x, ly: y, moved: false };
		h.down?.(x, y);
		this.os.invalidate();
	}

	pointerUp(x: number, y: number) {
		const a = this.active;
		this.active = null;
		if (a) a.hit.up?.(a.moved, x, y);
		this.os.invalidate();
	}

	wheel(dy: number) {
		const { x, y } = this.mouse;
		const inside = (r: { x: number; y: number; w: number; h: number }) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
		if (inside(this.areas.view)) this.vp.zoom(Math.exp(dy * 0.0012));
		else if (inside(this.areas.list)) this.listScroll = Math.max(0, this.listScroll + dy * 0.6);
		else if (inside(this.areas.insp)) this.inspScroll = Math.max(0, this.inspScroll + dy * 0.6);
	}

	key(k: KeyInput): boolean {
		if (this.text) {
			const t = this.text;
			if (k.code === 'Enter' || k.code === 'NumpadEnter') { this.commitText(); return true; }
			if (k.code === 'Escape') { this.text = null; return true; }
			if (k.code === 'Backspace') { t.value = t.value.slice(0, -1); return true; }
			if (k.key.length === 1 && !k.ctrl && !k.meta) { t.value += k.key; return true; }
			return true;
		}
		const mod = k.ctrl || k.meta;
		if (mod && k.code === 'KeyZ') { if (k.shift) this.ed.redo(); else this.ed.undo(); return true; }
		if (mod && k.code === 'KeyY') { this.ed.redo(); return true; }
		if (mod && k.code === 'KeyD') { this.ed.duplicate(); return true; }
		if (mod && k.code === 'KeyS') { this.ed.save(); return true; }
		if (k.code === 'Delete' || k.code === 'Backspace') { this.askDelete(); return true; }
		if (k.code === 'KeyF') { this.frameSelection(); return true; }
		if (k.code === 'Escape') { this.ed.select(null); return true; }
		// typing anywhere else searches the hierarchy
		if (k.key.length === 1 && !mod) { this.search += k.key; this.listScroll = 0; return true; }
		return false;
	}

	// ------------------------------------------------------------------ draw
	draw(c: CanvasRenderingContext2D, r: Rect, _focused: boolean, now: number) {
		this.lastDraw = now;
		this.hits = [];
		const W = r.w, H = r.h;
		c.save();
		c.translate(r.x, r.y);
		c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
		const TB = 100, LW = 340, IW = 460, LOG = 132;
		this.toolbar(c, W, TB);
		this.hierarchy(c, 0, TB, LW, H - TB - LOG);
		this.inspector(c, W - IW, TB, IW, H - TB - LOG);
		this.viewport(c, r, LW, TB, W - LW - IW, H - TB - LOG);
		this.logPanel(c, 0, H - LOG, W, LOG);
		if (this.confirm) this.dialog(c, W, H);
		c.restore();
	}

	private toolbar(c: CanvasRenderingContext2D, W: number, H: number) {
		c.fillStyle = C.panel; c.fillRect(0, 0, W, H);
		c.fillStyle = C.line; c.fillRect(0, H - 1, W, 1);
		const ed = this.ed, rt = ed.runtime;
		let x = 12;
		const row1 = 8, row2 = 54, bh = 38;
		const btn = (label: string, w: number, y: number, fn: () => void, on = false, enabled = true) => { this.button(c, label, x, y, w, bh, fn, on, enabled); x += w + 6; };
		btn('▶ Play', 96, row1, () => rt.play(), rt.mode === 'play');
		btn('⏸ Pause', 104, row1, () => rt.pause(), rt.mode === 'paused');
		btn('⏭ Step', 96, row1, () => rt.step());
		btn('■ Stop', 92, row1, () => rt.stop(), rt.mode === 'edit');
		x += 10;
		btn('↶ Undo', 100, row1, () => ed.undo(), false, ed.history.canUndo);
		btn('↷ Redo', 100, row1, () => ed.redo(), false, ed.history.canRedo);
		x += 10;
		btn(ed.worldTool ? '✥ World tool ON' : '✥ World tool', 176, row1, () => { ed.worldTool = !ed.worldTool; }, ed.worldTool);
		x += 10;
		c.fillStyle = C.dim; c.font = `500 17px ${this.os.fonts.ui}`; c.textBaseline = 'middle'; c.fillText('Snap', x, row1 + bh / 2); x += 50;
		for (const g of [0, 0.05, 0.1, 0.25]) btn(g === 0 ? 'off' : g * 100 + ' cm', 74, row1, () => { ed.snap.grid = g; }, ed.snap.grid === g);
		btn(ed.snap.angle ? '15°' : 'free °', 80, row1, () => { ed.snap.angle = ed.snap.angle ? 0 : 15; }, !!ed.snap.angle);
		// row 2: create / edit / file
		x = 12;
		const front = () => this.inFront();
		for (const [k, label] of [['box', '+ Box'], ['sphere', '+ Sphere'], ['cylinder', '+ Cylinder'], ['ramp', '+ Ramp'], ['light', '+ Light']] as const) btn(label, 112, row2, () => ed.spawn(k, front()));
		x += 10;
		btn('Duplicate', 120, row2, () => ed.duplicate(), false, ed.selection.length > 0);
		btn('Delete', 96, row2, () => this.askDelete(), false, ed.selection.length > 0);
		btn('Frame', 86, row2, () => this.frameSelection(), false, ed.selection.length > 0);
		x += 10;
		btn('Save', 80, row2, () => ed.save());
		btn('Load', 80, row2, () => { const s = ed.slots(); if (!s.length) log.warn('No saved scenes yet'); else this.ask(`Load "${s[0].slot}" (${s[0].n} changes)? Unsaved changes are undone first.`, () => ed.load(s[0].slot)); });
		const auto = ed.autosaveInfo();
		btn(auto ? `Recover (${auto.n})` : 'Recover', 140, row2, () => { if (auto) this.ask(`Restore the autosave from ${auto.saved.slice(0, 19).replace('T', ' ')} (${auto.n} changes)?`, () => ed.load(null)); }, false, !!auto);
		// mode badge
		const mode = rt.mode.toUpperCase();
		c.font = `700 18px ${this.os.fonts.ui}`;
		const mw = c.measureText(mode).width + 28;
		rr(c, W - mw - 14, row1 + 4, mw, 30, 15); c.fillStyle = rt.mode === 'play' ? '#1f6f43' : rt.mode === 'edit' ? '#7a4f12' : '#4a4f57'; c.fill();
		c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(mode, W - mw / 2 - 14, row1 + 20); c.textAlign = 'left';
	}

	private hierarchy(c: CanvasRenderingContext2D, X: number, Y: number, W: number, H: number) {
		c.fillStyle = C.panel; c.fillRect(X, Y, W, H);
		c.fillStyle = C.line; c.fillRect(X + W - 1, Y, 1, H);
		const ui = this.os.fonts.ui;
		// search box
		rr(c, X + 10, Y + 10, W - 20, 36, 8); c.fillStyle = C.panel2; c.fill();
		c.font = `400 17px ${ui}`; c.textBaseline = 'middle';
		c.fillStyle = this.search ? C.text : C.dim;
		c.fillText(this.search ? this.search + '▏' : 'Search (type)…', X + 22, Y + 28);
		if (this.search) this.hits.push({ x: X + W - 46, y: Y + 10, w: 36, h: 36, cursor: 'pointer', up: () => { this.search = ''; } });
		if (this.search) { c.fillStyle = C.dim; c.fillText('✕', X + W - 36, Y + 28); }
		// layer chips
		let cx = X + 10, cy = Y + 54;
		for (const l of ['All', ...LAYERS] as const) {
			c.font = `500 15px ${ui}`;
			const w = c.measureText(l).width + 20;
			if (cx + w > X + W - 10) { cx = X + 10; cy += 30; }
			rr(c, cx, cy, w, 26, 13); c.fillStyle = this.layer === l ? C.accent : C.panel2; c.fill();
			c.fillStyle = this.layer === l ? '#fff' : C.dim; c.fillText(l, cx + 10, cy + 13);
			const L = l;
			this.hits.push({ x: cx, y: cy, w, h: 26, cursor: 'pointer', up: () => { this.layer = L; this.listScroll = 0; } });
			cx += w + 6;
		}
		cy += 36;
		this.button(c, this.multi ? 'Multi-select ON' : 'Multi-select', X + 10, cy, 150, 30, () => { this.multi = !this.multi; }, this.multi);
		cy += 40;
		// rows
		const rows = this.ed.world.search(this.search, this.layer);
		const top = cy, rowH = 34, viewH = Y + H - top;
		this.areas.list = { x: X, y: top, w: W, h: viewH };
		this.listScroll = Math.min(this.listScroll, Math.max(0, rows.length * rowH - viewH));
		c.save(); c.beginPath(); c.rect(X, top, W, viewH); c.clip();
		rows.forEach((e, i) => {
			const y = top + i * rowH - this.listScroll;
			if (y + rowH < top || y > top + viewH) return;
			const sel = this.ed.selection.includes(e);
			if (sel) { c.fillStyle = C.sel; c.fillRect(X, y, W - 1, rowH); }
			c.fillStyle = LAYER_COL[e.layer]; c.fillRect(X + 12, y + 11, 10, 12);
			c.fillStyle = C.text; c.font = `500 17px ${ui}`;
			c.fillText(e.name, X + 32, y + rowH / 2);
			c.fillStyle = C.dim; c.font = `400 14px ${ui}`;
			const tags = (e.locked ? '🔒 ' : '') + (e.prop ? 'physics ' : '') + (e.bakedStatic ? 'baked' : '');
			c.textAlign = 'right'; c.fillText(tags, X + W - 12, y + rowH / 2); c.textAlign = 'left';
			this.hits.push({ x: X, y, w: W, h: rowH, cursor: 'pointer', up: () => { this.ed.select(e, this.multi); this.matIndex = 0; this.inspScroll = 0; } });
		});
		c.restore();
		c.fillStyle = C.dim; c.font = `400 14px ${ui}`;
		c.fillText(`${rows.length} objects`, X + 170, cy - 25);
	}

	private viewport(c: CanvasRenderingContext2D, r: Rect, X: number, Y: number, W: number, H: number) {
		this.areas.view = { x: X, y: Y, w: W, h: H };
		// the hole: transparent pixels show the live render on the monitor
		c.clearRect(X, Y, W, H);
		this.vp.rect = { x: r.x + X, y: r.y + Y, w: W, h: H };
		this.vp.shownAt = performance.now();
		const sel = this.ed.selection[0];
		// gizmo: axis arrows + a yaw ring at the selection
		if (sel && !sel.deleted) {
			const o = sel.object;
			const box = new THREE.Box3().setFromObject(o);
			const pivot = box.isEmpty() ? o.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
			const len = this.vp.dist * 0.18;
			const P = this.vp.project(pivot);
			if (!P.behind) {
				const axes: [string, THREE.Vector3, string][] = [['x', new THREE.Vector3(1, 0, 0), C.x], ['y', new THREE.Vector3(0, 1, 0), C.y], ['z', new THREE.Vector3(0, 0, 1), C.z]];
				for (const [name, dir, col] of axes) {
					const Q = this.vp.project(pivot.clone().addScaledVector(dir, len));
					c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.moveTo(X + P.x, Y + P.y); c.lineTo(X + Q.x, Y + Q.y); c.stroke();
					c.fillStyle = col; c.beginPath(); c.arc(X + Q.x, Y + Q.y, 9, 0, 7); c.fill();
					if (sel.locked) continue;
					const sx = Q.x - P.x, sy = Q.y - P.y, sl2 = sx * sx + sy * sy || 1;
					let from: TRS;
					this.hits.push({
						x: X + Q.x - 14, y: Y + Q.y - 14, w: 28, h: 28, cursor: 'move',
						down: () => { from = readTRS(o); },
						drag: (dx, dy) => {
							// mouse motion along the arrow's screen direction -> world distance
							const k = (dx * sx + dy * sy) / sl2 * len;
							const t = readTRS(o); t.p[name === 'x' ? 0 : name === 'y' ? 1 : 2] += k;
							this.preview(sel, t);
						},
						up: () => { const t = readTRS(o); t.p = t.p.map((v) => this.ed.snapV(v)) as any; writeTRS(o, from); this.ed.setTRS(sel, t, from); },
					});
				}
				// yaw ring
				c.strokeStyle = '#ffd34d'; c.lineWidth = 3; c.beginPath(); c.arc(X + P.x, Y + P.y, 34, 0, 7); c.stroke();
				if (!sel.locked) {
					let from: TRS, acc = 0;
					this.hits.push({
						x: X + P.x - 40, y: Y + P.y - 40, w: 80, h: 80, cursor: 'move',
						down: () => { from = readTRS(o); acc = 0; },
						drag: (dx) => { acc += dx * 0.6; const t = { ...from, r: [from.r[0], this.ed.snapA(from.r[1] + acc), from.r[2]] as [number, number, number] }; this.preview(sel, t); },
						up: () => { const t = readTRS(o); writeTRS(o, from); this.ed.setTRS(sel, t, from); },
					});
				}
			}
		}
		// orbit / pick (below the gizmo in hit order)
		this.hits.unshift({
			x: X, y: Y, w: W, h: H, cursor: 'crosshair',
			drag: (dx, dy) => this.vp.orbit(dx, dy),
			up: (moved, x, y) => {
				if (moved) return;
				const rc = this.vp.ray(x - X, y - Y);
				const hit = rc.intersectObjects(this.ed.world.scene.children, true).find((h) => (h.object as THREE.Mesh).isMesh && visible(h.object) && h.object.name !== 'editor-highlight' && !h.object.userData.noBullet);
				this.ed.select(hit ? this.ed.world.of(hit.object) : null, this.multi);
			},
		});
		// overlay text
		c.font = `500 15px ${this.os.fonts.ui}`; c.fillStyle = 'rgba(0,0,0,0.55)';
		rr(c, X + 10, Y + 10, 360, 28, 8); c.fill();
		c.fillStyle = '#fff'; c.textBaseline = 'middle';
		c.fillText('Drag: orbit · Wheel: zoom · Click: select · F: frame', X + 20, Y + 24);
	}

	private inspector(c: CanvasRenderingContext2D, X: number, Y: number, W: number, H: number) {
		c.fillStyle = C.panel; c.fillRect(X, Y, W, H);
		c.fillStyle = C.line; c.fillRect(X, Y, 1, H);
		this.areas.insp = { x: X, y: Y, w: W, h: H };
		const ui = this.os.fonts.ui;
		const e = this.ed.selection[0];
		c.save(); c.beginPath(); c.rect(X, Y, W, H); c.clip();
		let y = Y + 14 - this.inspScroll;
		const head = (t: string) => { c.fillStyle = C.dim; c.font = `700 14px ${ui}`; c.fillText(t.toUpperCase(), X + 16, y + 10); y += 28; };
		c.textBaseline = 'middle';
		if (!e) {
			c.fillStyle = C.dim; c.font = `400 17px ${ui}`;
			['Select an object in the hierarchy, in the viewport,', 'or in the world (World tool: click with the', 'crosshair / pull the trigger on it in VR).'].forEach((l, i) => c.fillText(l, X + 16, Y + 30 + i * 26));
			c.restore();
			return;
		}
		if (this.ed.selection.length > 1) { c.fillStyle = C.warn; c.font = `500 15px ${ui}`; c.fillText(`${this.ed.selection.length} selected; editing the first`, X + 16, y); y += 26; }
		// name
		c.font = `700 22px ${ui}`; c.fillStyle = C.text;
		this.textField(c, 'name', e.name, X + 12, y, W - 24, 36, (s) => { if (s.trim()) this.ed.apply({ op: 'rename', id: e.id, name: s.trim().slice(0, 60) }); }, 22);
		y += 44;
		c.font = `400 14px ${ui}`; c.fillStyle = C.dim;
		c.fillText(`${e.id} · ${e.layer}${e.locked ? ' · locked' : ''}${e.bakedStatic ? ' · baked into lighting' : ''}`, X + 16, y); y += 26;
		// transform
		head('Transform');
		const t = readTRS(e.object);
		const rows: [string, 'p' | 'r' | 's', number][] = [['Position', 'p', 0.005], ['Rotation', 'r', 0.5], ['Scale', 's', 0.005]];
		for (const [label, key, step] of rows) {
			c.fillStyle = C.text; c.font = `500 15px ${ui}`; c.fillText(label, X + 16, y + 16);
			for (let i = 0; i < 3; i++) {
				const fx = X + 104 + i * 114;
				this.numField(c, `${key}${i}`, t[key][i], fx, y, 108, 32, step, ['x', 'y', 'z'][i], e.locked, (v, live) => {
					const tt = readTRS(e.object); tt[key][i] = v;
					if (live) this.preview(e, tt);
					else { const from = (this as any)._from ?? t; writeTRS(e.object, from); this.ed.setTRS(e, tt, from); (this as any)._from = null; }
				}, () => { (this as any)._from = readTRS(e.object); });
			}
			y += 40;
		}
		// material
		const mats = this.ed.world.materials(e);
		if (mats.length) {
			y += 6; head('Material');
			this.matIndex = Math.min(this.matIndex, mats.length - 1);
			const m = mats[this.matIndex] as THREE.MeshStandardMaterial;
			const users = this.ed.world.materialUsers(m);
			c.fillStyle = C.text; c.font = `500 15px ${ui}`;
			c.fillText(`${m.name || m.type} (${this.matIndex + 1}/${mats.length})`, X + 16, y + 14);
			this.button(c, '◀', X + W - 112, y, 44, 30, () => { this.matIndex = (this.matIndex + mats.length - 1) % mats.length; });
			this.button(c, '▶', X + W - 62, y, 44, 30, () => { this.matIndex = (this.matIndex + 1) % mats.length; });
			y += 36;
			if (users > 1) {
				c.fillStyle = C.warn; c.font = `400 14px ${ui}`; c.fillText(`Shared by ${users} meshes: edits change all of them`, X + 16, y + 12);
				this.button(c, 'Make unique', X + W - 150, y - 2, 132, 28, () => this.ed.apply({ op: 'unique', id: e.id, mi: this.matIndex }));
				y += 34;
			}
			if ('color' in m && m.color) {
				this.swatches(c, X + 16, y, W - 32, '#' + m.color.getHexString(), (hex) => this.ed.apply({ op: 'mat', id: e.id, mi: this.matIndex, key: 'color', value: hex }));
				y += 44;
				c.fillStyle = C.text; c.font = `500 15px ${ui}`; c.fillText('Colour', X + 16, y + 16);
				this.textField(c, 'hex', '#' + m.color.getHexString(), X + 104, y, 140, 32, (s) => { const v = s.startsWith('#') ? s : '#' + s; if (/^#[0-9a-f]{6}$/i.test(v)) this.ed.apply({ op: 'mat', id: e.id, mi: this.matIndex, key: 'color', value: v.toLowerCase() }); else log.warn('Colour must look like #a1b2c3'); });
				y += 40;
			}
			for (const key of ['roughness', 'metalness', 'opacity'] as const) {
				if (typeof (m as any)[key] !== 'number') continue;
				this.slider(c, key[0].toUpperCase() + key.slice(1), (m as any)[key], 0, 1, X + 16, y, W - 32, (v, live) => {
					if (live) { (m as any)[key] = v; if (key === 'opacity') m.transparent = v < 1; }
					else { const before = (this as any)._sv; (m as any)[key] = before; this.ed.apply({ op: 'mat', id: e.id, mi: this.matIndex, key, value: +v.toFixed(3) }); }
				}, () => { (this as any)._sv = (m as any)[key]; });
				y += 40;
			}
			if ('emissive' in m && m.emissive) {
				c.fillStyle = C.text; c.font = `500 15px ${ui}`; c.fillText('Glow', X + 16, y + 14); y += 26;
				this.swatches(c, X + 16, y, W - 32, '#' + m.emissive.getHexString(), (hex) => this.ed.apply({ op: 'mat', id: e.id, mi: this.matIndex, key: 'emissive', value: hex }), true);
				y += 44;
			}
		}
		// lights
		const lights = this.ed.world.lights(e);
		lights.forEach((l, li) => {
			y += 6; head(`Light ${lights.length > 1 ? li + 1 : ''} (${l.type.replace('Light', '')})`);
			const max = l.intensity > 20 ? l.intensity * 4 : 20;
			this.slider(c, 'Intensity', l.intensity, 0, max, X + 16, y, W - 32, (v, live) => {
				if (live) l.intensity = v; else { l.intensity = (this as any)._sv; this.ed.apply({ op: 'light', id: e.id, li, key: 'intensity', value: +v.toFixed(3) }); }
			}, () => { (this as any)._sv = l.intensity; });
			y += 40;
			this.swatches(c, X + 16, y, W - 32, '#' + l.color.getHexString(), (hex) => this.ed.apply({ op: 'light', id: e.id, li, key: 'color', value: hex }), false, ['#ffffff', '#fff1dc', '#ffd9a8', '#ffb46b', '#dbe8ff', '#a8c8ff', '#ff6b6b', '#6bff9a']);
			y += 44;
		});
		// physics
		if (e.prop) {
			y += 6; head('Physics (Rapier)');
			const ph = this.ed.world.physics!;
			const fixed = ph.isPropStatic(e.prop);
			this.button(c, 'Dynamic', X + 16, y, 120, 30, () => this.ed.apply({ op: 'static', id: e.id, value: false }), !fixed);
			this.button(c, 'Static', X + 142, y, 120, 30, () => this.ed.apply({ op: 'static', id: e.id, value: true }), fixed);
			y += 40;
			const b = e.prop.body, col = b.collider(0);
			const items: [string, 'mass' | 'friction' | 'restitution' | 'gravity', number, number, number][] = [
				['Mass kg', 'mass', b.mass(), 0.01, Math.max(20, b.mass() * 4)],
				['Friction', 'friction', col.friction(), 0, 2],
				['Bounce', 'restitution', col.restitution(), 0, 1],
				['Gravity ×', 'gravity', b.gravityScale(), -1, 3],
			];
			for (const [label, key, val, lo, hi] of items) {
				this.slider(c, label, val, lo, hi, X + 16, y, W - 32, (v, live) => { if (!live) this.ed.apply({ op: 'phys', id: e.id, key, value: +v.toFixed(3) }); });
				y += 40;
			}
		}
		// components (gameplay behaviour; runs while playing)
		if (!e.locked) {
			y += 6; head('Components');
			for (const comp of e.components) {
				const def = COMPONENTS.get(comp.type);
				c.fillStyle = C.text; c.font = `600 16px ${ui}`; c.fillText(def?.label ?? comp.type, X + 16, y + 14);
				this.button(c, '✕', X + W - 52, y, 36, 28, () => this.ed.apply({ op: 'comp', id: e.id, ctype: comp.type, data: null }));
				y += 32;
				if (def) {
					c.fillStyle = C.dim; c.font = `400 13px ${ui}`; wrap(c, def.description, X + 16, y + 8, W - 32, 18);
					y += 18 * Math.ceil(c.measureText(def.description).width / (W - 32)) + 8;
					for (const [k, f] of Object.entries(def.fields)) {
						const v = comp.data[k];
						const set = (nv: number | string | boolean) => this.ed.apply({ op: 'comp', id: e.id, ctype: comp.type, data: { ...comp.data, [k]: nv } });
						c.fillStyle = C.text; c.font = `500 15px ${ui}`; c.fillText(f.label ?? k, X + 28, y + 16);
						if (f.kind === 'bool') this.button(c, v ? 'On' : 'Off', X + 200, y, 90, 30, () => set(!v), !!v);
						else if (f.kind === 'number') {
							const lo = f.min ?? -1e4, hi = f.max ?? 1e4;
							this.numField(c, `${comp.type}.${k}`, Number(v), X + 200, y, 160, 30, Math.max(0.001, Math.min(1, (hi - lo) / 600)), 'none', false, (nv, live) => {
								const cl = THREE.MathUtils.clamp(+nv.toFixed(4), lo, hi);
								if (live) comp.data[k] = cl; // preview (read live by the running component)
								else { comp.data[k] = (this as any)._cv; set(cl); }
							}, () => { (this as any)._cv = comp.data[k]; });
						} else this.textField(c, `${comp.type}.${k}`, String(v), X + 200, y, W - 216, 30, (sv) => set(sv.slice(0, 120)));
						y += 38;
					}
					if (comp.type === 'Graph') {
						this.button(c, 'New graph', X + 28, y, 130, 30, () => this.newGraphFor(e));
						this.button(c, 'Edit in Logic', X + 166, y, 150, 30, () => this.openLogic?.(String(comp.data.graph)), false, !!comp.data.graph);
						y += 40;
					}
					if (comp.type === 'Script') {
						this.button(c, 'New script', X + 28, y, 130, 30, () => this.newScriptFor(e));
						this.button(c, 'Edit in Code', X + 166, y, 150, 30, () => this.openCode?.(String(comp.data.script)), false, !!comp.data.script);
						y += 40;
					}
				}
				y += 6;
			}
			// add a component
			if (this.picking) {
				const free = [...COMPONENTS.values()].filter((d) => !e.components.some((c2) => c2.type === d.type));
				for (const d of free) { this.button(c, '+ ' + d.label, X + 16, y, W - 32, 30, () => { this.picking = false; this.ed.apply({ op: 'comp', id: e.id, ctype: d.type, data: {} }); }); y += 34; }
				this.button(c, 'Cancel', X + 16, y, 120, 30, () => { this.picking = false; }); y += 38;
			} else { this.button(c, '+ Add component', X + 16, y, 200, 32, () => { this.picking = true; }); y += 40; }
		}
		const contentH = y + this.inspScroll - Y;
		this.inspScroll = Math.min(this.inspScroll, Math.max(0, contentH - H + 20));
		c.restore();
	}

	private logPanel(c: CanvasRenderingContext2D, X: number, Y: number, W: number, H: number) {
		c.fillStyle = '#16181c'; c.fillRect(X, Y, W, H);
		c.fillStyle = C.line; c.fillRect(X, Y, W, 1);
		const ui = this.os.fonts.mono;
		const items = log.entries.slice(-5);
		c.font = `400 16px ${ui}`; c.textBaseline = 'middle';
		items.forEach((e, i) => {
			c.fillStyle = e.level === 'error' ? C.err : e.level === 'warn' ? C.warn : C.dim;
			c.fillText(`${e.level === 'info' ? '·' : e.level === 'warn' ? '!' : '✕'} ${e.msg}${e.count > 1 ? `  ×${e.count}` : ''}`.slice(0, 190), X + 14, Y + 18 + i * 24);
		});
		// undo label
		c.textAlign = 'right'; c.fillStyle = C.dim; c.font = `400 15px ${this.os.fonts.ui}`;
		const u = this.ed.history.undoLabel;
		c.fillText(u ? `Undo: ${u}` : 'Nothing to undo', X + W - 14, Y + 18);
		c.textAlign = 'left';
	}

	private dialog(c: CanvasRenderingContext2D, W: number, H: number) {
		const d = this.confirm!;
		c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, W, H);
		const w = 640, h = 190, x = (W - w) / 2, y = (H - h) / 2;
		this.hits.push({ x: 0, y: 0, w: W, h: H }); // modal
		rr(c, x, y, w, h, 16); c.fillStyle = C.panel; c.fill();
		c.fillStyle = C.text; c.font = `500 19px ${this.os.fonts.ui}`; c.textBaseline = 'middle';
		wrap(c, d.msg, x + 26, y + 40, w - 52, 26);
		this.button(c, 'Confirm', x + w - 300, y + h - 62, 130, 42, () => { this.confirm = null; d.yes(); }, true);
		this.button(c, 'Cancel', x + w - 156, y + h - 62, 130, 42, () => { this.confirm = null; });
	}

	// ------------------------------------------------------------------ widgets
	private button(c: CanvasRenderingContext2D, label: string, x: number, y: number, w: number, h: number, fn: () => void, on = false, enabled = true) {
		rr(c, x, y, w, h, 8);
		c.fillStyle = on ? C.accent : enabled ? C.panel2 : '#22252a'; c.fill();
		c.fillStyle = enabled ? (on ? '#fff' : C.text) : '#5d636b';
		c.font = `500 16px ${this.os.fonts.ui}`; c.textBaseline = 'middle'; c.textAlign = 'center';
		c.fillText(label, x + w / 2, y + h / 2 + 1); c.textAlign = 'left';
		if (enabled) this.hits.push({ x, y, w, h, cursor: 'pointer', up: (_m, ux, uy) => { if (ux >= x && ux <= x + w && uy >= y && uy <= y + h) fn(); } });
	}

	private numField(c: CanvasRenderingContext2D, id: string, value: number, x: number, y: number, w: number, h: number, step: number, axis: string, locked: boolean | undefined, set: (v: number, live: boolean) => void, begin: () => void) {
		const editing = this.text?.id === id;
		rr(c, x, y, w, h, 6); c.fillStyle = editing ? '#0f1114' : C.panel2; c.fill();
		if (axis !== 'none') { c.fillStyle = axis === 'x' ? C.x : axis === 'y' ? C.y : C.z; c.fillRect(x, y + 6, 3, h - 12); }
		c.font = `400 16px ${this.os.fonts.mono}`; c.fillStyle = locked ? '#5d636b' : C.text; c.textBaseline = 'middle';
		c.fillText(editing ? this.text!.value + '▏' : fmt(value), x + 10, y + h / 2 + 1);
		if (locked) return;
		let acc = 0;
		this.hits.push({
			x, y, w, h, cursor: 'resize',
			down: () => { acc = 0; begin(); },
			drag: (dx) => { acc += dx; set(value + acc * step, true); },
			up: (moved) => {
				if (moved) { set(value + acc * step, false); return; }
				this.text = { id, value: fmt(value), commit: (s) => { const v = parseFloat(s); if (Number.isFinite(v)) { begin(); set(v, false); } else log.warn('Not a number: ' + s); } };
				(this.text as any).keep = true;
			},
		});
	}

	private textField(c: CanvasRenderingContext2D, id: string, value: string, x: number, y: number, w: number, h: number, commit: (s: string) => void, size = 16) {
		const editing = this.text?.id === id;
		rr(c, x, y, w, h, 6); c.fillStyle = editing ? '#0f1114' : 'rgba(255,255,255,0.03)'; c.fill();
		c.font = `${size > 18 ? 700 : 400} ${size}px ${this.os.fonts.ui}`; c.fillStyle = C.text; c.textBaseline = 'middle';
		c.fillText(editing ? this.text!.value + '▏' : value, x + 8, y + h / 2 + 1);
		this.hits.push({ x, y, w, h, cursor: 'text', up: () => { this.text = { id, value, commit }; } });
	}

	private slider(c: CanvasRenderingContext2D, label: string, value: number, lo: number, hi: number, x: number, y: number, w: number, set: (v: number, live: boolean) => void, begin?: () => void) {
		c.fillStyle = C.text; c.font = `500 15px ${this.os.fonts.ui}`; c.textBaseline = 'middle';
		c.fillText(label, x, y + 16);
		const tx = x + 100, tw = w - 170;
		rr(c, tx, y + 13, tw, 6, 3); c.fillStyle = C.panel2; c.fill();
		const k = THREE.MathUtils.clamp((value - lo) / (hi - lo), 0, 1);
		rr(c, tx, y + 13, Math.max(6, tw * k), 6, 3); c.fillStyle = C.accent; c.fill();
		c.beginPath(); c.arc(tx + tw * k, y + 16, 10, 0, 7); c.fillStyle = '#fff'; c.fill();
		c.fillStyle = C.dim; c.font = `400 15px ${this.os.fonts.mono}`; c.textAlign = 'right';
		c.fillText(fmt(value), x + w, y + 16); c.textAlign = 'left';
		const at = (px: number) => lo + THREE.MathUtils.clamp((px - tx) / tw, 0, 1) * (hi - lo);
		this.hits.push({ x: tx - 12, y, w: tw + 24, h: 32, cursor: 'pointer', down: (px) => { begin?.(); set(at(px), true); }, drag: (_dx, _dy, px) => set(at(px), true), up: (_m, px) => set(at(px), false) });
	}

	private swatches(c: CanvasRenderingContext2D, x: number, y: number, w: number, current: string, pick: (hex: string) => void, glow = false, list = SWATCHES) {
		const items = glow ? ['#000000', ...list.slice(4)] : list;
		const s = Math.min(34, (w - (items.length - 1) * 4) / items.length);
		items.forEach((hex, i) => {
			const sx = x + i * (s + 4);
			rr(c, sx, y, s, s, 6); c.fillStyle = hex; c.fill();
			if (hex.toLowerCase() === current.toLowerCase()) { c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke(); }
			this.hits.push({ x: sx, y, w: s, h: s, cursor: 'pointer', up: () => pick(hex) });
		});
	}

	// ------------------------------------------------------------------ helpers
	private hitAt(x: number, y: number) {
		for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h; }
		return null;
	}

	private commitText() { const t = this.text; this.text = null; if (t) t.commit(t.value); }

	/** live preview of a transform while dragging (not recorded) */
	private preview(e: Entity, t: TRS) {
		writeTRS(e.object, t);
		if (e.prop) this.ed.world.physics?.teleport(e.prop, e.object.position.clone(), e.object.quaternion.clone());
	}

	private ask(msg: string, yes: () => void) { this.confirm = { msg, yes }; }
	private newGraphFor(e: Entity) {
		const id = this.makeGraph?.();
		if (!id) return;
		const comp = e.components.find((c) => c.type === 'Graph');
		this.ed.apply({ op: 'comp', id: e.id, ctype: 'Graph', data: { ...(comp?.data ?? {}), graph: id } });
		this.openLogic?.(id);
	}
	private newScriptFor(e: Entity) {
		const id = this.makeScript?.();
		if (!id) return;
		this.ed.apply({ op: 'comp', id: e.id, ctype: 'Script', data: { script: id } });
		this.openCode?.(id);
	}
	private askDelete() {
		const r = this.ed.delete(false);
		if (r === 'confirm') this.ask(`Delete ${this.ed.selection.map((e) => e.name).join(', ')}? It is part of the original scene (undo brings it back).`, () => this.ed.delete(true));
	}

	private frameSelection() {
		const box = new THREE.Box3();
		for (const e of this.ed.selection) box.expandByObject(e.object);
		this.vp.frame(box);
	}

	/** a spot on the floor 1.2 m in front of the player */
	private inFront() {
		const p = this.player();
		return new THREE.Vector3(p.x, 0.6, p.z).add(this.playerForward().multiplyScalar(1.2));
	}
	playerForward = () => new THREE.Vector3(0, 0, -1);
}

function visible(o: THREE.Object3D) { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false; return true; }
function fmt(v: number) { return Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 10 ? v.toFixed(2) : v.toFixed(3); }
function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, lh: number) {
	let line = '', yy = y;
	for (const word of text.split(' ')) { const t = line ? line + ' ' + word : word; if (c.measureText(t).width > w && line) { c.fillText(line, x, yy); yy += lh; line = word; } else line = t; }
	if (line) c.fillText(line, x, yy);
}
