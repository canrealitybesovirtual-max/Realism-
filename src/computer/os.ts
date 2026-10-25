import { TextBuffer } from './textBuffer';
import { Calculator, type Op } from './calculator';
import { WindowManager, TITLE_H, type Rect, type Win } from './windowManager';

/**
 * A small desktop operating environment rendered to a 2D canvas, which the
 * 3D monitor displays as its emissive texture.
 *
 * Input is device-agnostic: callers translate a real mouse, a VR controller
 * ray hitting the screen, or the 3D desk mouse into `pointerMove/Down/Up` in
 * screen pixels, and physical or virtual key presses into `key()`.
 */

export type { Rect };
export interface KeyInput { code: string; key: string; shift: boolean; ctrl: boolean; alt: boolean; meta: boolean; }
export interface OSStorage { get(k: string): string | null; set(k: string, v: string): void; }
export type CursorStyle = 'arrow' | 'text' | 'move' | 'pointer' | 'crosshair' | 'resize';

export interface App {
	id: string;
	title: string;
	defaultRect: Rect;
	minSize?: [number, number];
	drawIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void;
	draw(ctx: CanvasRenderingContext2D, r: Rect, focused: boolean, now: number): void;
	pointerDown?(x: number, y: number, r: Rect): void;
	pointerMove?(x: number, y: number, r: Rect, down: boolean): void;
	pointerUp?(x: number, y: number, r: Rect): void;
	wheel?(dy: number): void;
	key?(k: KeyInput): boolean;
	cursor?(x: number, y: number, r: Rect): CursorStyle;
	/** does this app animate (needs redraws while focused)? */
	animating?(focused: boolean, now: number): boolean;
}

const FONT_UI = '"Inter", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';
const FONT_MONO = '"JetBrains Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
const MENU_H = 34;

export class DesktopOS {
	readonly W = 1920;
	readonly H = 1080;
	readonly canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private wallpaper: HTMLCanvasElement;
	readonly wm: WindowManager;
	private apps = new Map<string, App>();
	cursor = { x: 960, y: 540 };
	cursorStyle: CursorStyle = 'arrow';
	cursorVisible = true;
	private down = false;
	private captured: { win: Win; app: App } | null = null;
	private hoverDock = -1;
	private pressedDock = -1;
	dirty = true;
	private lastMinute = -1;
	private blinkPhase = false;
	/** set by the host: live stats for the System app */
	stats: () => Record<string, string> = () => ({});
	constructor(readonly storage: OSStorage = memoryStorage()) {
		this.canvas = document.createElement('canvas');
		this.canvas.width = this.W;
		this.canvas.height = this.H;
		this.ctx = this.canvas.getContext('2d')!;
		this.wallpaper = makeWallpaper(this.W, this.H);
		this.wm = new WindowManager({ x: 0, y: MENU_H, w: this.W, h: this.H - MENU_H });
		const notes = new NotesApp(this);
		for (const app of [notes, new CalculatorApp(this), new SketchApp(this), new SystemApp(this)]) this.apps.set(app.id, app);
		this.openApp('system');
		this.wm.minimize(this.wm.byApp('system')!.id);
		this.openApp('notes');
	}

	invalidate() { this.dirty = true; }

	/** add an app (and its dock icon, before System) */
	registerApp(app: App) {
		this.apps.set(app.id, app);
		if (!this.dockApps.includes(app.id)) {
			const i = this.dockApps.indexOf('system');
			this.dockApps.splice(i < 0 ? this.dockApps.length : i, 0, app.id);
		}
		this.invalidate();
	}

	openApp(id: string) {
		const existing = this.wm.byApp(id);
		if (existing) { this.wm.focus(existing.id); this.invalidate(); return; }
		const app = this.apps.get(id)!;
		const [mw, mh] = app.minSize ?? [360, 240];
		this.wm.open(id, app.title, { ...app.defaultRect }, mw, mh);
		this.invalidate();
	}

	// ------------------------------------------------------------------ input
	pointerMove(x: number, y: number) {
		x = Math.max(0, Math.min(this.W - 1, x));
		y = Math.max(0, Math.min(this.H - 1, y));
		if (x === this.cursor.x && y === this.cursor.y) return;
		this.cursor.x = x; this.cursor.y = y;
		this.dirty = true;
		if (this.wm.dragging) { this.wm.dragTo(x, y); this.cursorStyle = 'move'; return; }
		if (this.captured) {
			const r = this.contentRect(this.captured.win);
			this.captured.app.pointerMove?.(x - r.x, y - r.y, r, true);
			return;
		}
		this.updateHover();
	}

	moveBy(dx: number, dy: number) { this.pointerMove(this.cursor.x + dx, this.cursor.y + dy); }

	private updateHover() {
		const { x, y } = this.cursor;
		this.hoverDock = this.dockHit(x, y);
		if (this.hoverDock >= 0) { this.cursorStyle = 'pointer'; return; }
		const h = this.wm.hit(x, y);
		if (!h) { this.cursorStyle = 'arrow'; return; }
		if (h.region === 'resize') { this.cursorStyle = 'resize'; return; }
		if (h.region !== 'body') { this.cursorStyle = h.region === 'title' ? 'arrow' : 'pointer'; return; }
		const app = this.apps.get(h.win.app)!;
		const r = this.contentRect(h.win);
		this.cursorStyle = app.cursor?.(x - r.x, y - r.y, r) ?? 'arrow';
		app.pointerMove?.(x - r.x, y - r.y, r, false);
	}

	pointerDown() {
		this.down = true;
		this.dirty = true;
		const { x, y } = this.cursor;
		const d = this.dockHit(x, y);
		if (d >= 0) { this.pressedDock = d; return; }
		const h = this.wm.hit(x, y);
		if (!h) return;
		this.wm.focus(h.win.id);
		if (h.region === 'title') this.wm.beginDrag(h.win, x, y, 'move');
		else if (h.region === 'resize') this.wm.beginDrag(h.win, x, y, 'resize');
		else if (h.region === 'body') {
			const app = this.apps.get(h.win.app)!;
			const r = this.contentRect(h.win);
			app.pointerDown?.(x - r.x, y - r.y, r);
			this.captured = { win: h.win, app };
		}
	}

	pointerUp() {
		if (!this.down) return;
		this.down = false;
		this.dirty = true;
		const { x, y } = this.cursor;
		if (this.pressedDock >= 0) {
			if (this.dockHit(x, y) === this.pressedDock) this.dockClick(this.pressedDock);
			this.pressedDock = -1;
			return;
		}
		if (this.wm.dragging) { this.wm.endDrag(); this.updateHover(); return; }
		const h = this.wm.hit(x, y);
		if (this.captured) {
			const r = this.contentRect(this.captured.win);
			this.captured.app.pointerUp?.(x - r.x, y - r.y, r);
			this.captured = null;
		} else if (h && (h.region === 'close' || h.region === 'minimize')) {
			if (h.region === 'close') this.wm.close(h.win.id); else this.wm.minimize(h.win.id);
		}
		this.updateHover();
	}

	wheel(dy: number) {
		const h = this.wm.hit(this.cursor.x, this.cursor.y);
		if (h?.region === 'body') { this.apps.get(h.win.app)!.wheel?.(dy); this.dirty = true; }
	}

	/** Returns true if the OS consumed the key. */
	key(k: KeyInput): boolean {
		this.dirty = true;
		this.blinkPhase = false;
		const mod = k.ctrl || k.meta;
		// window shortcuts
		if (mod && k.code === 'KeyW') { const f = this.wm.focused; if (f) this.wm.close(f.id); return true; }
		if (mod && k.code === 'KeyM') { const f = this.wm.focused; if (f) this.wm.minimize(f.id); return true; }
		if ((k.alt || mod) && k.code === 'Tab') {
			// bring the bottom-most window to the front (cycle)
			const vis = this.wm.windows;
			if (vis.length > 1) this.wm.focus(vis[0].id);
			return true;
		}
		const f = this.wm.focused;
		if (!f) return false;
		return this.apps.get(f.app)!.key?.(k) ?? false;
	}

	// ------------------------------------------------------------------ dock
	private dockApps = ['notes', 'calculator', 'sketch', 'system'];
	private dockLayout() {
		const s = 68, gap = 18, n = this.dockApps.length;
		const w = n * s + (n - 1) * gap + 36, h = s + 24;
		return { x: (this.W - w) / 2, y: this.H - h - 14, w, h, s, gap };
	}
	private dockHit(x: number, y: number): number {
		const L = this.dockLayout();
		if (y < L.y || y > L.y + L.h || x < L.x || x > L.x + L.w) return -1;
		const i = Math.floor((x - L.x - 18 + L.gap / 2) / (L.s + L.gap));
		return i >= 0 && i < this.dockApps.length ? i : -1;
	}
	private dockClick(i: number) {
		const id = this.dockApps[i];
		const w = this.wm.byApp(id);
		if (!w) this.openApp(id);
		else if (w.minimized || this.wm.focused?.id !== w.id) this.wm.focus(w.id);
		else this.wm.minimize(w.id);
		this.invalidate();
	}

	contentRect(w: Win): Rect { return { x: w.x, y: w.y + TITLE_H, w: w.w, h: w.h - TITLE_H }; }

	// ------------------------------------------------------------------ frame
	/** Advance timers; marks dirty when something visible changes. */
	update(now: number) {
		const minute = Math.floor(Date.now() / 60000);
		if (minute !== this.lastMinute) { this.lastMinute = minute; this.dirty = true; }
		const blink = Math.floor(now / 530) % 2 === 0;
		if (blink !== this.blinkPhase) {
			this.blinkPhase = blink;
			const f = this.wm.focused;
			if (f && f.app === 'notes') this.dirty = true;
		}
		const f = this.wm.focused;
		for (const w of this.wm.windows) {
			if (!w.minimized && this.apps.get(w.app)!.animating?.(w === f, now)) this.dirty = true;
		}
	}

	/** Redraw if needed. Returns true when the canvas changed. */
	render(now: number): boolean {
		if (!this.dirty) return false;
		this.dirty = false;
		const ctx = this.ctx;
		ctx.drawImage(this.wallpaper, 0, 0);
		const focused = this.wm.focused;
		for (const w of this.wm.windows) if (!w.minimized) this.drawWindow(ctx, w, w === focused, now);
		this.drawMenuBar(ctx, focused);
		this.drawDock(ctx);
		if (this.cursorVisible) drawCursor(ctx, this.cursor.x, this.cursor.y, this.cursorStyle);
		return true;
	}

	get caretOn() { return this.blinkPhase; }

	private drawWindow(ctx: CanvasRenderingContext2D, w: Win, focused: boolean, now: number) {
		const app = this.apps.get(w.app)!;
		ctx.save();
		ctx.shadowColor = focused ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.18)';
		ctx.shadowBlur = focused ? 50 : 24;
		ctx.shadowOffsetY = focused ? 18 : 8;
		roundRect(ctx, w.x, w.y, w.w, w.h, 14);
		ctx.fillStyle = '#fbfbfb';
		ctx.fill();
		ctx.restore();
		ctx.save();
		roundRect(ctx, w.x, w.y, w.w, w.h, 14);
		ctx.clip();
		// title bar
		const tg = ctx.createLinearGradient(0, w.y, 0, w.y + TITLE_H);
		tg.addColorStop(0, focused ? '#f1f1f1' : '#f6f6f6');
		tg.addColorStop(1, focused ? '#e4e4e4' : '#efefef');
		ctx.fillStyle = tg;
		ctx.fillRect(w.x, w.y, w.w, TITLE_H);
		ctx.fillStyle = '#d4d4d4';
		ctx.fillRect(w.x, w.y + TITLE_H - 1, w.w, 1);
		const btn = (cx: number, col: string) => {
			ctx.beginPath(); ctx.arc(w.x + cx, w.y + TITLE_H / 2, 8, 0, Math.PI * 2);
			ctx.fillStyle = focused ? col : '#cfcfcf'; ctx.fill();
			ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.stroke();
		};
		btn(24, '#ff5f57'); btn(52, '#febc2e'); btn(80, '#d0d0d0');
		ctx.fillStyle = focused ? '#3a3a3a' : '#9a9a9a';
		ctx.font = `600 19px ${FONT_UI}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(w.title, w.x + w.w / 2, w.y + TITLE_H / 2 + 1);
		ctx.textAlign = 'left';
		// content
		const r = this.contentRect(w);
		ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
		app.draw(ctx, r, focused, now);
		ctx.restore();
		// hairline border
		roundRect(ctx, w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1, 14);
		ctx.strokeStyle = 'rgba(0,0,0,0.18)';
		ctx.lineWidth = 1;
		ctx.stroke();
	}

	private drawMenuBar(ctx: CanvasRenderingContext2D, focused?: Win) {
		ctx.fillStyle = 'rgba(245,245,247,0.82)';
		ctx.fillRect(0, 0, this.W, MENU_H);
		ctx.fillStyle = 'rgba(0,0,0,0.12)';
		ctx.fillRect(0, MENU_H - 1, this.W, 1);
		ctx.fillStyle = '#1d1d1f';
		ctx.textBaseline = 'middle';
		ctx.font = `700 19px ${FONT_UI}`;
		ctx.fillText('◐', 22, MENU_H / 2 + 1);
		ctx.fillText(focused ? this.apps.get(focused.app)!.title : 'Desktop', 58, MENU_H / 2 + 1);
		ctx.font = `500 18px ${FONT_UI}`;
		const items = ['File', 'Edit', 'View', 'Window', 'Help'];
		let x = 58 + ctx.measureText(focused ? this.apps.get(focused.app)!.title : 'Desktop').width + 34;
		for (const it of items) { ctx.fillText(it, x, MENU_H / 2 + 1); x += ctx.measureText(it).width + 28; }
		const d = new Date();
		const t = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + '   ' +
			d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
		ctx.textAlign = 'right';
		ctx.fillText(t, this.W - 22, MENU_H / 2 + 1);
		ctx.textAlign = 'left';
	}

	private drawDock(ctx: CanvasRenderingContext2D) {
		const L = this.dockLayout();
		ctx.save();
		ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
		roundRect(ctx, L.x, L.y, L.w, L.h, 26);
		ctx.fillStyle = 'rgba(250,250,252,0.55)';
		ctx.fill();
		ctx.restore();
		roundRect(ctx, L.x + 0.5, L.y + 0.5, L.w - 1, L.h - 1, 26);
		ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.stroke();
		this.dockApps.forEach((id, i) => {
			const app = this.apps.get(id)!;
			const lift = i === this.hoverDock ? 6 : 0;
			const press = i === this.pressedDock ? 0.92 : 1;
			const s = L.s * press;
			const x = L.x + 18 + i * (L.s + L.gap) + (L.s - s) / 2, y = L.y + 12 - lift + (L.s - s) / 2;
			ctx.save();
			app.drawIcon(ctx, x, y, s);
			ctx.restore();
			const w = this.wm.byApp(id);
			if (w) {
				ctx.beginPath(); ctx.arc(L.x + 18 + i * (L.s + L.gap) + L.s / 2, L.y + L.h - 6, 3, 0, Math.PI * 2);
				ctx.fillStyle = '#3a3a3c'; ctx.fill();
			}
			if (i === this.hoverDock) {
				ctx.font = `500 17px ${FONT_UI}`;
				const tw = ctx.measureText(app.title).width + 24;
				const tx = L.x + 18 + i * (L.s + L.gap) + L.s / 2 - tw / 2;
				roundRect(ctx, tx, L.y - 44, tw, 32, 8);
				ctx.fillStyle = 'rgba(40,40,42,0.85)'; ctx.fill();
				ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
				ctx.fillText(app.title, tx + 12, L.y - 28);
			}
		});
	}

	// shared drawing helpers for apps
	get fonts() { return { ui: FONT_UI, mono: FONT_MONO }; }
}

// ====================================================================== apps

class NotesApp implements App {
	id = 'notes';
	title = 'Notes';
	defaultRect = { x: 330, y: 120, w: 1060, h: 720 };
	minSize: [number, number] = [420, 260];
	buf: TextBuffer;
	private scrollY = 0; // in lines
	private scrollX = 0; // px
	private lineH = 34;
	private charW = 0;
	private selecting = false;
	private saved = true;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private pad = { l: 72, t: 18 };

	constructor(private os: DesktopOS) {
		const stored = os.storage.get('notes.text');
		this.buf = new TextBuffer(stored ?? WELCOME);
		this.buf.move('docEnd');
	}

	drawIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
		iconBase(ctx, x, y, s, ['#fff7d6', '#ffe59a']);
		ctx.fillStyle = '#e8b730'; ctx.fillRect(x, y + s * 0.0, s, s * 0.22);
		ctx.strokeStyle = 'rgba(120,100,40,0.35)'; ctx.lineWidth = 2;
		for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + s * 0.18, y + s * (0.38 + i * 0.14)); ctx.lineTo(x + s * 0.82, y + s * (0.38 + i * 0.14)); ctx.stroke(); }
	}

	private measure(ctx: CanvasRenderingContext2D) {
		ctx.font = `400 23px ${this.os.fonts.mono}`;
		this.charW = ctx.measureText('MMMMMMMMMM').width / 10;
	}

	private visibleLines(r: Rect) { return Math.floor((r.h - this.pad.t - 44) / this.lineH); }

	private ensureCaretVisible(r: Rect) {
		const vis = this.visibleLines(r);
		const l = this.buf.caret.line;
		if (l < this.scrollY) this.scrollY = l;
		if (l >= this.scrollY + vis) this.scrollY = l - vis + 1;
		const cx = this.buf.caret.col * this.charW;
		const textW = r.w - this.pad.l - 24;
		if (cx - this.scrollX > textW) this.scrollX = cx - textW + this.charW * 8;
		if (cx < this.scrollX) this.scrollX = Math.max(0, cx - this.charW * 8);
	}

	private lastRect: Rect = { x: 0, y: 0, w: 1, h: 1 };

	draw(ctx: CanvasRenderingContext2D, r: Rect, focused: boolean) {
		this.lastRect = r;
		if (!this.charW) this.measure(ctx);
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(r.x, r.y, r.w, r.h);
		// gutter
		ctx.fillStyle = '#f6f6f6';
		ctx.fillRect(r.x, r.y, this.pad.l - 14, r.h);
		const vis = this.visibleLines(r);
		const sel = this.buf.selectionRange();
		ctx.font = `400 23px ${this.os.fonts.mono}`;
		ctx.textBaseline = 'alphabetic';
		const tx = r.x + this.pad.l - this.scrollX;
		for (let i = 0; i <= vis && this.scrollY + i < this.buf.lines.length; i++) {
			const li = this.scrollY + i;
			const y = r.y + this.pad.t + i * this.lineH;
			const line = this.buf.lines[li];
			if (sel && li >= sel[0].line && li <= sel[1].line) {
				const a = li === sel[0].line ? sel[0].col : 0;
				const b = li === sel[1].line ? sel[1].col : line.length + 1;
				ctx.fillStyle = focused ? '#b3d7ff' : '#dcdcdc';
				ctx.fillRect(Math.max(r.x + this.pad.l - 4, tx + a * this.charW), y, (b - a) * this.charW, this.lineH);
			}
			if (li === this.buf.caret.line && focused) {
				ctx.fillStyle = 'rgba(0,0,0,0.025)';
				ctx.fillRect(r.x + this.pad.l - 14, y, r.w, this.lineH);
			}
			ctx.save();
			ctx.beginPath(); ctx.rect(r.x + this.pad.l - 4, y, r.w - this.pad.l, this.lineH); ctx.clip();
			ctx.fillStyle = line.startsWith('#') ? '#0a5bd8' : '#1f1f1f';
			if (line.startsWith('#')) ctx.font = `700 23px ${this.os.fonts.mono}`;
			ctx.fillText(line, tx, y + 25);
			ctx.font = `400 23px ${this.os.fonts.mono}`;
			ctx.restore();
			ctx.fillStyle = li === this.buf.caret.line ? '#6a6a6a' : '#b4b4b4';
			ctx.font = `400 17px ${this.os.fonts.mono}`;
			ctx.textAlign = 'right';
			ctx.fillText(String(li + 1), r.x + this.pad.l - 26, y + 24);
			ctx.textAlign = 'left';
			ctx.font = `400 23px ${this.os.fonts.mono}`;
		}
		// caret
		if (focused && this.os.caretOn) {
			const ci = this.buf.caret.line - this.scrollY;
			if (ci >= 0 && ci <= vis) {
				ctx.fillStyle = '#0a5bd8';
				ctx.fillRect(tx + this.buf.caret.col * this.charW - 1, r.y + this.pad.t + ci * this.lineH + 3, 2.5, this.lineH - 6);
			}
		}
		// status bar
		ctx.fillStyle = '#f3f3f3';
		ctx.fillRect(r.x, r.y + r.h - 40, r.w, 40);
		ctx.fillStyle = '#dadada'; ctx.fillRect(r.x, r.y + r.h - 40, r.w, 1);
		ctx.fillStyle = '#666';
		ctx.font = `500 17px ${this.os.fonts.ui}`;
		ctx.textBaseline = 'middle';
		const status = `Ln ${this.buf.caret.line + 1}, Col ${this.buf.caret.col + 1}    ${this.buf.wordCount()} words    ${this.saved ? 'Saved' : 'Edited'}`;
		ctx.fillText(status, r.x + 18, r.y + r.h - 20);
		ctx.textAlign = 'right';
		ctx.fillText('UTF-8 · Plain text', r.x + r.w - 18, r.y + r.h - 20);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
	}

	private posAt(x: number, y: number) {
		const line = Math.max(0, Math.floor((y - this.pad.t) / this.lineH) + this.scrollY);
		const col = Math.max(0, Math.round((x - this.pad.l + this.scrollX) / (this.charW || 14)));
		return { line, col };
	}

	cursor(x: number, y: number, r: Rect): CursorStyle { return x > this.pad.l - 14 && y < r.h - 40 ? 'text' : 'arrow'; }

	pointerDown(x: number, y: number, r: Rect) {
		if (y > r.h - 40) return;
		this.buf.setCaret(this.posAt(x, y));
		this.selecting = true;
	}
	pointerMove(x: number, y: number, r: Rect, down: boolean) {
		if (!down || !this.selecting) return;
		this.buf.setCaret(this.posAt(x, y), true);
		this.ensureCaretVisible(r);
	}
	pointerUp() { this.selecting = false; }

	wheel(dy: number) {
		this.scrollY = Math.max(0, Math.min(this.buf.lines.length - 1, this.scrollY + Math.sign(dy) * 3));
	}

	private changed() {
		this.saved = false;
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => this.save(), 1200);
	}
	private save() {
		this.os.storage.set('notes.text', this.buf.text);
		this.saved = true;
		this.os.invalidate();
	}

	key(k: KeyInput): boolean {
		const b = this.buf;
		const mod = k.ctrl || k.meta;
		const nav: Record<string, Parameters<TextBuffer['move']>[0]> = {
			ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Home: 'home', End: 'end',
		};
		let edited = false;
		if (nav[k.code]) {
			let dir = nav[k.code];
			if (mod && dir === 'home') dir = 'docStart';
			if (mod && dir === 'end') dir = 'docEnd';
			b.move(dir, k.shift, mod || k.alt);
		} else if (k.code === 'PageUp' || k.code === 'PageDown') {
			for (let i = 0; i < this.visibleLines(this.lastRect); i++) b.move(k.code === 'PageUp' ? 'up' : 'down', k.shift);
		} else if (mod && k.code === 'KeyA') b.selectAll();
		else if (mod && k.code === 'KeyC') b.copy();
		else if (mod && k.code === 'KeyX') { b.cut(); edited = true; }
		else if (mod && k.code === 'KeyV') { b.paste(); edited = true; }
		else if (mod && k.code === 'KeyZ') { b.undo(); edited = true; }
		else if (mod && k.code === 'KeyS') { this.save(); }
		else if (k.code === 'Backspace') { b.backspace(mod || k.alt); edited = true; }
		else if (k.code === 'Delete') { b.deleteForward(mod || k.alt); edited = true; }
		else if (k.code === 'Enter' || k.code === 'NumpadEnter') { b.newline(); edited = true; }
		else if (k.code === 'Tab') { b.insert('    '); edited = true; }
		else if (!mod && k.key.length === 1) { b.insert(k.key); edited = true; }
		else return false;
		if (edited) this.changed();
		this.ensureCaretVisible(this.lastRect);
		return true;
	}
}

class CalculatorApp implements App {
	id = 'calculator';
	title = 'Calculator';
	defaultRect = { x: 1440, y: 160, w: 360, h: 560 };
	minSize: [number, number] = [360, 560];
	calc = new Calculator();
	private hover = -1;
	private pressed = -1;
	private flash = { i: -1, t: 0 };
	private readonly keys: { label: string; act: () => void; kind: 'fn' | 'op' | 'num'; w?: number }[];

	constructor(_os: DesktopOS) {
		const c = this.calc;
		const op = (o: Op) => ({ label: o, act: () => c.operator(o), kind: 'op' as const });
		const num = (d: string, w = 1) => ({ label: d, act: () => c.digit(d), kind: 'num' as const, w });
		this.keys = [
			{ label: 'AC', act: () => c.clear(), kind: 'fn' }, { label: '±', act: () => c.negate(), kind: 'fn' }, { label: '%', act: () => c.percent(), kind: 'fn' }, op('÷'),
			num('7'), num('8'), num('9'), op('×'),
			num('4'), num('5'), num('6'), op('-'),
			num('1'), num('2'), num('3'), op('+'),
			num('0', 2), num('.'), { label: '=', act: () => c.equals(), kind: 'op' },
		];
	}

	drawIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
		iconBase(ctx, x, y, s, ['#5b5b60', '#2d2d30']);
		const g = s * 0.17;
		for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
			ctx.beginPath(); ctx.arc(x + s * 0.27 + i * g * 1.35, y + s * 0.3 + j * g * 1.35, g * 0.5, 0, Math.PI * 2);
			ctx.fillStyle = i === 2 ? '#ff9f0a' : '#a5a5a5'; ctx.fill();
		}
	}

	private layout(r: Rect) {
		const pad = 14, top = 150, cols = 4, rows = 5;
		const cw = (r.w - pad * (cols + 1)) / cols, ch = (r.h - top - pad * (rows + 1)) / rows;
		const cells: Rect[] = [];
		let col = 0, row = 0;
		for (const k of this.keys) {
			const w = k.w ?? 1;
			cells.push({ x: pad + col * (cw + pad), y: top + pad + row * (ch + pad), w: cw * w + pad * (w - 1), h: ch });
			col += w;
			if (col >= cols) { col = 0; row++; }
		}
		return cells;
	}

	draw(ctx: CanvasRenderingContext2D, r: Rect, _f: boolean, now: number) {
		ctx.fillStyle = '#1c1c1e';
		ctx.fillRect(r.x, r.y, r.w, r.h);
		ctx.fillStyle = '#fff';
		ctx.textAlign = 'right';
		ctx.textBaseline = 'alphabetic';
		let size = 76;
		ctx.font = `300 ${size}px ${FONT_UI}`;
		while (ctx.measureText(this.calc.display).width > r.w - 40 && size > 30) { size -= 4; ctx.font = `300 ${size}px ${FONT_UI}`; }
		ctx.fillText(this.calc.display, r.x + r.w - 22, r.y + 128);
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		this.layout(r).forEach((c, i) => {
			const k = this.keys[i];
			const active = i === this.pressed || (i === this.flash.i && now - this.flash.t < 120);
			const pending = k.kind === 'op' && k.label === this.calc.pendingOp;
			let col = k.kind === 'op' ? '#ff9f0a' : k.kind === 'fn' ? '#a5a5a5' : '#333336';
			if (pending) col = '#ffd9a0';
			if (i === this.hover) col = shade(col, 18);
			if (active) col = shade(col, 50);
			roundRect(ctx, r.x + c.x, r.y + c.y, c.w, c.h, Math.min(c.h, c.w) / 2);
			ctx.fillStyle = col; ctx.fill();
			ctx.fillStyle = k.kind === 'fn' || pending ? '#111' : '#fff';
			ctx.font = `${k.kind === 'num' ? 400 : 500} 34px ${FONT_UI}`;
			ctx.fillText(k.label, r.x + c.x + c.w / 2, r.y + c.y + c.h / 2 + 1);
		});
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
	}

	private at(x: number, y: number, r: Rect) {
		return this.layout(r).findIndex((c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
	}
	cursor(x: number, y: number, r: Rect): CursorStyle { return this.at(x, y, r) >= 0 ? 'pointer' : 'arrow'; }
	pointerMove(x: number, y: number, r: Rect) { this.hover = this.at(x, y, r); }
	pointerDown(x: number, y: number, r: Rect) { this.pressed = this.at(x, y, r); }
	pointerUp(x: number, y: number, r: Rect) {
		if (this.pressed >= 0 && this.pressed === this.at(x, y, r)) this.keys[this.pressed].act();
		this.pressed = -1;
	}
	key(k: KeyInput): boolean {
		const handled = this.calc.key(k.key === 'Enter' ? 'Enter' : k.key);
		if (handled) {
			const map: Record<string, string> = { '*': '×', '/': '÷', Enter: '=', Escape: 'AC' };
			const label = map[k.key] ?? k.key;
			this.flash = { i: this.keys.findIndex((x) => x.label === label), t: performance.now() };
		}
		return handled;
	}
	animating(_f: boolean, now: number) { return now - this.flash.t < 200; }
}

class SketchApp implements App {
	id = 'sketch';
	title = 'Sketch';
	defaultRect = { x: 220, y: 90, w: 1100, h: 780 };
	minSize: [number, number] = [500, 360];
	private paper: HTMLCanvasElement;
	private pctx: CanvasRenderingContext2D;
	private colors = ['#1f1f1f', '#d1462f', '#e8a33d', '#2f7d4f', '#2b62c4', '#8a4fc7', '#ffffff'];
	private color = 0;
	private size = 6;
	private last: { x: number; y: number } | null = null;

	constructor(_os: DesktopOS) {
		this.paper = document.createElement('canvas');
		this.paper.width = 1880; this.paper.height = 1000;
		this.pctx = this.paper.getContext('2d')!;
		this.clear();
	}
	private clear() { this.pctx.fillStyle = '#fffdf8'; this.pctx.fillRect(0, 0, this.paper.width, this.paper.height); }

	drawIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
		iconBase(ctx, x, y, s, ['#ffffff', '#e9e9ee']);
		ctx.lineCap = 'round';
		ctx.lineWidth = s * 0.08;
		ctx.strokeStyle = '#d1462f';
		ctx.beginPath(); ctx.moveTo(x + s * 0.2, y + s * 0.7); ctx.bezierCurveTo(x + s * 0.35, y + s * 0.2, x + s * 0.6, y + s * 0.9, x + s * 0.8, y + s * 0.3); ctx.stroke();
		ctx.strokeStyle = '#2b62c4';
		ctx.beginPath(); ctx.moveTo(x + s * 0.25, y + s * 0.35); ctx.lineTo(x + s * 0.55, y + s * 0.3); ctx.stroke();
	}

	private toolbarH = 64;
	draw(ctx: CanvasRenderingContext2D, r: Rect) {
		ctx.drawImage(this.paper, 0, 0, r.w, r.h - this.toolbarH, r.x, r.y + this.toolbarH, r.w, r.h - this.toolbarH);
		ctx.fillStyle = '#f2f2f4';
		ctx.fillRect(r.x, r.y, r.w, this.toolbarH);
		ctx.fillStyle = '#dcdcdc'; ctx.fillRect(r.x, r.y + this.toolbarH - 1, r.w, 1);
		this.colors.forEach((c, i) => {
			ctx.beginPath(); ctx.arc(r.x + 40 + i * 52, r.y + 32, 18, 0, Math.PI * 2);
			ctx.fillStyle = c; ctx.fill();
			ctx.lineWidth = i === this.color ? 4 : 1.5; ctx.strokeStyle = i === this.color ? '#0a84ff' : 'rgba(0,0,0,0.25)'; ctx.stroke();
		});
		[3, 6, 14].forEach((s, i) => {
			const x = r.x + 430 + i * 52;
			ctx.beginPath(); ctx.arc(x, r.y + 32, s, 0, Math.PI * 2);
			ctx.fillStyle = this.size === s ? '#0a84ff' : '#555'; ctx.fill();
		});
		roundRect(ctx, r.x + r.w - 120, r.y + 14, 100, 36, 8);
		ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#c9c9c9'; ctx.lineWidth = 1; ctx.stroke();
		ctx.fillStyle = '#333'; ctx.font = `500 18px ${FONT_UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillText('Clear', r.x + r.w - 70, r.y + 33);
		ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
	}

	cursor(_x: number, y: number): CursorStyle { return y > this.toolbarH ? 'crosshair' : 'pointer'; }

	pointerDown(x: number, y: number, r: Rect) {
		if (y < this.toolbarH) {
			const ci = Math.round((x - 40) / 52);
			if (ci >= 0 && ci < this.colors.length && Math.abs(x - 40 - ci * 52) < 22) this.color = ci;
			const si = Math.round((x - 430) / 52);
			if (si >= 0 && si < 3 && Math.abs(x - 430 - si * 52) < 22) this.size = [3, 6, 14][si];
			if (x > r.w - 120 && x < r.w - 20) this.clear();
			return;
		}
		this.last = { x, y: y - this.toolbarH };
		this.stroke(x, y - this.toolbarH);
	}
	pointerMove(x: number, y: number, _r: Rect, down: boolean) {
		if (down && this.last) this.stroke(x, y - this.toolbarH);
	}
	pointerUp() { this.last = null; }
	private stroke(x: number, y: number) {
		const p = this.pctx;
		p.strokeStyle = this.colors[this.color];
		p.lineWidth = this.size;
		p.lineCap = 'round'; p.lineJoin = 'round';
		p.beginPath(); p.moveTo(this.last!.x, this.last!.y); p.lineTo(x, y); p.stroke();
		this.last = { x, y };
	}
}

class SystemApp implements App {
	id = 'system';
	title = 'System';
	defaultRect = { x: 1300, y: 640, w: 560, h: 330 };
	minSize: [number, number] = [420, 260];
	private lastSec = -1;
	constructor(private os: DesktopOS) {}
	drawIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
		iconBase(ctx, x, y, s, ['#3b3f46', '#16181c']);
		ctx.strokeStyle = '#30d158'; ctx.lineWidth = s * 0.06; ctx.lineJoin = 'round';
		ctx.beginPath(); ctx.moveTo(x + s * 0.15, y + s * 0.6);
		[[0.3, 0.6], [0.4, 0.3], [0.52, 0.75], [0.64, 0.45], [0.85, 0.45]].forEach(([a, b]) => ctx.lineTo(x + s * a, y + s * b));
		ctx.stroke();
	}
	draw(ctx: CanvasRenderingContext2D, r: Rect, _f: boolean, now: number) {
		this.lastSec = Math.floor(now / 1000);
		ctx.fillStyle = '#ffffff'; ctx.fillRect(r.x, r.y, r.w, r.h);
		const st = this.os.stats();
		ctx.font = `600 20px ${FONT_UI}`; ctx.fillStyle = '#1d1d1f';
		ctx.fillText('This computer', r.x + 24, r.y + 40);
		ctx.font = `400 18px ${FONT_UI}`;
		let y = r.y + 80;
		for (const [k, v] of Object.entries(st)) {
			ctx.fillStyle = '#8a8a8e'; ctx.fillText(k, r.x + 24, y);
			ctx.fillStyle = '#1d1d1f'; ctx.fillText(v, r.x + 200, y);
			y += 32;
		}
	}
	animating(_f: boolean, now: number) { return Math.floor(now / 1000) !== this.lastSec; }
}

// ====================================================================== drawing helpers

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function iconBase(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, [a, b]: [string, string]) {
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
	roundRect(ctx, x, y, s, s, s * 0.23);
	const g = ctx.createLinearGradient(0, y, 0, y + s);
	g.addColorStop(0, a); g.addColorStop(1, b);
	ctx.fillStyle = g; ctx.fill();
	ctx.restore();
	// caller wraps drawIcon in save/restore, which also removes this clip
	roundRect(ctx, x, y, s, s, s * 0.23);
	ctx.clip();
}

function shade(hex: string, amt: number) {
	const n = parseInt(hex.slice(1), 16);
	const c = (v: number) => Math.max(0, Math.min(255, v + amt));
	return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number, style: CursorStyle) {
	ctx.save();
	ctx.translate(Math.round(x), Math.round(y));
	ctx.lineJoin = 'round';
	if (style === 'text') {
		ctx.strokeStyle = '#000'; ctx.lineWidth = 2.2;
		ctx.beginPath();
		ctx.moveTo(-6, -14); ctx.lineTo(-2, -14); ctx.moveTo(2, -14); ctx.lineTo(6, -14);
		ctx.moveTo(0, -12); ctx.lineTo(0, 12);
		ctx.moveTo(-6, 14); ctx.lineTo(-2, 14); ctx.moveTo(2, 14); ctx.lineTo(6, 14);
		ctx.stroke();
	} else if (style === 'crosshair') {
		ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
		ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.stroke();
	} else {
		// arrow (pointer/move/resize use the arrow for clarity at texture res)
		ctx.scale(1.35, 1.35);
		ctx.beginPath();
		ctx.moveTo(0, 0); ctx.lineTo(0, 21); ctx.lineTo(5, 16.5); ctx.lineTo(8.5, 24.5); ctx.lineTo(12, 23);
		ctx.lineTo(8.6, 15.2); ctx.lineTo(15, 15.2); ctx.closePath();
		ctx.fillStyle = '#000'; ctx.fill();
		ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke();
		if (style === 'pointer') { ctx.fillStyle = '#0a84ff'; ctx.beginPath(); ctx.arc(14, 20, 3, 0, Math.PI * 2); ctx.fill(); }
	}
	ctx.restore();
}

function makeWallpaper(w: number, h: number): HTMLCanvasElement {
	const c = document.createElement('canvas');
	c.width = w; c.height = h;
	const ctx = c.getContext('2d')!;
	const g = ctx.createLinearGradient(0, 0, 0, h);
	g.addColorStop(0, '#9fb6c9'); g.addColorStop(0.55, '#d9c9b4'); g.addColorStop(1, '#c79a7a');
	ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
	// soft layered dunes
	const dune = (y0: number, amp: number, col: string, ph: number) => {
		ctx.beginPath(); ctx.moveTo(0, h);
		for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y0 + Math.sin(x / 260 + ph) * amp + Math.sin(x / 97 + ph * 2) * amp * 0.25);
		ctx.lineTo(w, h); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
	};
	dune(h * 0.62, 28, 'rgba(190,140,108,0.55)', 0.3);
	dune(h * 0.72, 36, 'rgba(160,110,86,0.6)', 1.7);
	dune(h * 0.84, 30, 'rgba(110,78,66,0.7)', 2.9);
	const sun = ctx.createRadialGradient(w * 0.68, h * 0.38, 10, w * 0.68, h * 0.38, 220);
	sun.addColorStop(0, 'rgba(255,240,215,0.95)'); sun.addColorStop(0.3, 'rgba(255,225,190,0.5)'); sun.addColorStop(1, 'rgba(255,225,190,0)');
	ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
	return c;
}

function memoryStorage() {
	const m = new Map<string, string>();
	return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) };
}

const WELCOME = `# Welcome to Studio

This is a working computer inside the room.

- Type here with your keyboard, or with the 3D keyboard in VR
  (poke the keys with a controller, or point and pull the trigger).
- Click the dock icons to open Calculator, Sketch and System.
- Drag windows by their title bar; the red dot closes one.
- Ctrl+S saves (notes also save automatically).

`;
