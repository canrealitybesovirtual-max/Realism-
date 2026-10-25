import type { App, DesktopOS, Rect, CursorStyle } from './os';
import type { Diagnostics, Section } from '../engine/diagnostics';
import type { Editor } from '../engine/editor';

/**
 * "Profiler": live engine diagnostics (see engine/diagnostics.ts).
 * Frame-time graph by section, renderer counters, memory, baseline and
 * regressions, overlays (colliders / bounds / frustum) and the most
 * expensive objects (click one to select it in Studio).
 */
type Hit = { x: number; y: number; w: number; h: number; up: () => void };
const C = { bg: '#15171b', panel: '#1f2228', line: '#343a44', text: '#e3e6ea', dim: '#8e97a3', ok: '#5ad08a', warn: '#ffb648', err: '#ff6b6b', blue: '#3d8bfd' };
const SEC: { k: Section; col: string; label: string }[] = [
	{ k: 'input', col: '#b48cff', label: 'input' }, { k: 'sim', col: '#5ad08a', label: 'simulation' },
	{ k: 'editor', col: '#ffb648', label: 'editor + computer' }, { k: 'render', col: '#3d8bfd', label: 'render submit' },
];
const mb = (b: number) => (b / 1048576).toFixed(1) + ' MB';
const k = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : n >= 1e3 ? (n / 1e3).toFixed(1) + ' k' : Math.round(n).toString());

export class ProfilerApp implements App {
	id = 'profiler';
	title = 'Profiler';
	defaultRect = { x: 160, y: 70, w: 1600, h: 880 };
	minSize: [number, number] = [1100, 640];
	private hits: Hit[] = [];
	private lastDraw = 0;
	private costs: ReturnType<Diagnostics['costs']> = [];
	private costsAt = 0;
	private mem: ReturnType<Diagnostics['memory']> | null = null;

	constructor(private os: DesktopOS, private d: Diagnostics, private ed: Editor, private inXR: () => boolean) {}

	drawIcon(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
		c.save();
		c.beginPath(); c.roundRect(x, y, s, s, s * 0.23); c.fillStyle = '#1b2230'; c.fill(); c.clip();
		const hs = [0.35, 0.6, 0.45, 0.8, 0.5, 0.65];
		hs.forEach((h, i) => { c.fillStyle = i === 3 ? '#ff6b6b' : '#5ad08a'; c.fillRect(x + s * (0.14 + i * 0.12), y + s * (0.86 - h * 0.7), s * 0.08, s * h * 0.7); });
		c.restore();
	}
	animating(focused: boolean, now: number) { return now - this.lastDraw > (focused ? 200 : 500); }
	cursor(x: number, y: number): CursorStyle { return this.hits.some((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) ? 'pointer' : 'arrow'; }
	pointerUp(x: number, y: number) { for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { h.up(); this.os.invalidate(); return; } } }

	draw(c: CanvasRenderingContext2D, r: Rect, _f: boolean, now: number) {
		this.lastDraw = now;
		this.hits = [];
		const W = r.w, H = r.h, ui = this.os.fonts.ui, mono = this.os.fonts.mono;
		c.save(); c.translate(r.x, r.y);
		c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
		c.textBaseline = 'middle';
		const a = this.d.averages();
		// ---- graph
		const G = { x: 20, y: 20, w: W - 460, h: 300 };
		c.fillStyle = C.panel; c.fillRect(G.x, G.y, G.w, G.h);
		const hist = this.d.history;
		const maxMs = Math.max(20, ...hist.map((s) => s.ms.frame)) * 1.1;
		const bw = G.w / 240;
		hist.forEach((s, i) => {
			let y = G.y + G.h;
			for (const sec of SEC) { const h = (s.ms[sec.k] / maxMs) * G.h; c.fillStyle = sec.col; c.fillRect(G.x + i * bw, y - h, Math.max(1, bw - 0.5), h); y -= h; }
		});
		for (const [ms, label] of [[1000 / 72, '72 Hz'], [1000 / 90, '90 Hz'], [1000 / 60, '60 Hz']] as const) {
			if (ms > maxMs) continue;
			const y = G.y + G.h - (ms / maxMs) * G.h;
			c.strokeStyle = 'rgba(255,255,255,0.18)'; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(G.x, y); c.lineTo(G.x + G.w, y); c.stroke(); c.setLineDash([]);
			c.fillStyle = C.dim; c.font = `400 13px ${ui}`; c.fillText(`${label} budget ${ms.toFixed(1)} ms`, G.x + 8, y - 9);
		}
		c.fillStyle = C.text; c.font = `600 15px ${ui}`; c.fillText('CPU ms per frame (last 240 frames)', G.x + 10, G.y + 16);
		let lx = G.x + 10;
		for (const sec of SEC) { c.fillStyle = sec.col; c.fillRect(lx, G.y + G.h + 14, 12, 12); c.fillStyle = C.dim; c.font = `400 14px ${ui}`; c.fillText(`${sec.label} ${a ? a.ms[sec.k].toFixed(2) : '–'}`, lx + 18, G.y + G.h + 20); lx += 210; }
		c.fillStyle = C.dim; c.font = `400 13px ${ui}`;
		c.fillText(this.inXR() ? 'In VR the headset paces frames; GPU time is not measured (no timer queries).' : 'CPU time only: GPU time is not measured (no timer queries in this renderer path).', G.x, G.y + G.h + 44);
		// ---- numbers (right column)
		const X = W - 420;
		let y = 30;
		const row = (label: string, value: string, col = C.text) => { c.fillStyle = C.dim; c.font = `400 16px ${ui}`; c.fillText(label, X, y); c.fillStyle = col; c.font = `600 16px ${mono}`; c.textAlign = 'right'; c.fillText(value, W - 24, y); c.textAlign = 'left'; y += 28; };
		if (a) {
			row('Frames per second', a.fps.toFixed(1), a.fps < 55 ? C.warn : C.ok);
			row('CPU per frame (avg / worst)', `${a.ms.frame.toFixed(2)} / ${a.worst.toFixed(1)} ms`);
			row('Draw calls (all passes)', k(a.calls));
			row('Triangles (all passes)', k(a.tris));
		}
		if (!this.mem || now - this.costsAt > 2000) { this.mem = this.d.memory(); }
		const m = this.mem;
		row('Geometries / textures (GPU)', `${m.geometries} / ${m.textures}`);
		row('Shader programs', String(m.programs));
		row('Scene texture memory (est.)', mb(m.texBytes));
		row('Entities', String(this.ed.world.list.filter((e) => !e.deleted).length));
		y += 8;
		// baseline + regressions
		const btn = (label: string, bx: number, by: number, bwid: number, fn: () => void, on = false) => {
			c.beginPath(); c.roundRect(bx, by, bwid, 36, 7); c.fillStyle = on ? C.blue : '#2f343c'; c.fill();
			c.fillStyle = '#fff'; c.font = `500 15px ${ui}`; c.textAlign = 'center'; c.fillText(label, bx + bwid / 2, by + 18); c.textAlign = 'left';
			this.hits.push({ x: bx, y: by, w: bwid, h: 36, up: fn });
		};
		btn(this.d.capturingBaseline ? 'Capturing (3 s)…' : this.d.baseline ? 'Re-capture baseline' : 'Capture baseline', X, y, 396, () => this.d.captureBaseline(3), this.d.capturingBaseline);
		y += 50;
		const regs = this.d.regressions();
		c.font = `500 15px ${ui}`;
		if (!this.d.baseline) { c.fillStyle = C.dim; c.fillText('No baseline yet: capture one, change things, compare.', X, y); y += 24; }
		else if (!regs.length) { c.fillStyle = C.ok; c.fillText(`No regressions vs baseline (${this.d.baseline.ms.frame.toFixed(2)} ms, ${k(this.d.baseline.calls)} calls)`, X, y); y += 24; }
		else for (const g of regs.slice(0, 6)) { c.fillStyle = C.err; c.fillText(`▲ ${g.what}: ${fmt(g.base)} → ${fmt(g.now)} (${g.pct > 0 ? '+' : ''}${g.pct.toFixed(0)}%)`, X, y); y += 24; }
		y += 14;
		c.fillStyle = C.dim; c.font = `600 13px ${ui}`; c.fillText('OVERLAYS IN THE WORLD', X, y); y += 22;
		const ov = this.d.overlays;
		btn(`${ov.colliders ? '☑' : '☐'} Colliders`, X, y, 128, () => this.d.setOverlay('colliders', !ov.colliders), ov.colliders);
		btn(`${ov.bounds ? '☑' : '☐'} Bounds`, X + 134, y, 128, () => this.d.setOverlay('bounds', !ov.bounds), ov.bounds);
		btn(`${ov.frustum ? '☑' : '☐'} Frustum`, X + 268, y, 128, () => this.d.setOverlay('frustum', !ov.frustum), ov.frustum);
		y += 46;
		c.fillStyle = C.dim; c.font = `400 13px ${ui}`; c.fillText('Frustum = the Studio viewport camera. Colliders = Rapier shapes.', X, y);
		// ---- expensive objects
		if (now - this.costsAt > 2000) { this.costs = this.d.costs(); this.costsAt = now; }
		const T = { x: 20, y: G.y + G.h + 70 };
		c.fillStyle = C.text; c.font = `600 15px ${ui}`; c.fillText('Most expensive objects (click to select in Studio)', T.x, T.y);
		const cols = [T.x, T.x + 380, T.x + 520, T.x + 620, T.x + 760];
		c.fillStyle = C.dim; c.font = `600 13px ${ui}`;
		['Object', 'Triangles', 'Meshes', 'Shadow casters', 'Textures (est.)'].forEach((h, i) => c.fillText(h, cols[i], T.y + 30));
		let ty = T.y + 56;
		const totalTris = this.costs.reduce((s, x) => s + x.tris, 0) || 1;
		for (const x of this.costs) {
			if (ty > H - 20) break;
			const sel = this.ed.selection.includes(x.e);
			if (sel) { c.fillStyle = '#264f78'; c.fillRect(T.x - 6, ty - 13, cols[4] + 160 - T.x, 26); }
			c.fillStyle = 'rgba(61,139,253,0.25)'; c.fillRect(cols[1] - 6, ty - 10, (x.tris / totalTris) * 120, 20);
			c.fillStyle = C.text; c.font = `400 15px ${ui}`; c.fillText(x.e.name.slice(0, 40), cols[0], ty);
			c.font = `400 15px ${mono}`; c.fillText(k(x.tris), cols[1], ty); c.fillText(String(x.meshes), cols[2], ty); c.fillText(String(x.casters), cols[3], ty); c.fillText(mb(x.texBytes), cols[4], ty);
			const e = x.e;
			this.hits.push({ x: T.x - 6, y: ty - 13, w: cols[4] + 160 - T.x, h: 26, up: () => this.ed.select(e) });
			ty += 28;
		}
		c.restore();
	}
}

const fmt = (v: number) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(v < 10 ? 2 : 0));
