/**
 * Window manager model: z-order, focus, minimise/restore, title-bar dragging
 * and hit testing, in screen pixels. Pure logic, no drawing.
 */
export interface Rect { x: number; y: number; w: number; h: number; }

export interface Win extends Rect {
	id: number;
	app: string;
	title: string;
	minimized: boolean;
	minW: number;
	minH: number;
}

export type HitRegion = 'close' | 'minimize' | 'title' | 'body' | 'resize';

export const TITLE_H = 44;
export const BTN = 16; // traffic-light button radius-ish hit size

export class WindowManager {
	windows: Win[] = []; // back-to-front
	private nextId = 1;
	private drag: { id: number; dx: number; dy: number; mode: 'move' | 'resize'; ox: number; oy: number; ow: number; oh: number } | null = null;

	constructor(public desk: Rect) {}

	open(app: string, title: string, r: Rect, minW = 320, minH = 200): Win {
		const w: Win = { id: this.nextId++, app, title, minimized: false, minW, minH, ...r };
		this.clamp(w);
		this.windows.push(w);
		return w;
	}

	close(id: number) { this.windows = this.windows.filter((w) => w.id !== id); }

	get focused(): Win | undefined {
		for (let i = this.windows.length - 1; i >= 0; i--) if (!this.windows[i].minimized) return this.windows[i];
		return undefined;
	}

	focus(id: number) {
		const i = this.windows.findIndex((w) => w.id === id);
		if (i < 0) return;
		const [w] = this.windows.splice(i, 1);
		w.minimized = false;
		this.windows.push(w);
	}

	minimize(id: number) {
		const w = this.windows.find((x) => x.id === id);
		if (w) w.minimized = true;
	}

	byApp(app: string): Win | undefined { return this.windows.find((w) => w.app === app); }

	/** Topmost visible window under the point, and which part of it. */
	hit(x: number, y: number): { win: Win; region: HitRegion } | null {
		for (let i = this.windows.length - 1; i >= 0; i--) {
			const w = this.windows[i];
			if (w.minimized) continue;
			if (x < w.x || y < w.y || x >= w.x + w.w || y >= w.y + w.h) continue;
			const ly = y - w.y, lx = x - w.x;
			if (ly < TITLE_H) {
				// macOS-style buttons at the left of the title bar
				const cy = TITLE_H / 2;
				if (Math.hypot(lx - 24, ly - cy) <= BTN) return { win: w, region: 'close' };
				if (Math.hypot(lx - 52, ly - cy) <= BTN) return { win: w, region: 'minimize' };
				return { win: w, region: 'title' };
			}
			if (lx > w.w - 24 && ly > w.h - 24) return { win: w, region: 'resize' };
			return { win: w, region: 'body' };
		}
		return null;
	}

	beginDrag(w: Win, x: number, y: number, mode: 'move' | 'resize') {
		this.drag = { id: w.id, dx: x - w.x, dy: y - w.y, mode, ox: x, oy: y, ow: w.w, oh: w.h };
	}

	get dragging(): boolean { return !!this.drag; }

	dragTo(x: number, y: number) {
		if (!this.drag) return;
		const w = this.windows.find((v) => v.id === this.drag!.id);
		if (!w) { this.drag = null; return; }
		if (this.drag.mode === 'move') { w.x = x - this.drag.dx; w.y = y - this.drag.dy; }
		else { w.w = Math.max(w.minW, this.drag.ow + x - this.drag.ox); w.h = Math.max(w.minH, this.drag.oh + y - this.drag.oy); }
		this.clamp(w);
	}

	endDrag() { this.drag = null; }

	/** keep the title bar reachable inside the desktop area */
	private clamp(w: Win) {
		const d = this.desk;
		w.w = Math.min(w.w, d.w); w.h = Math.min(w.h, d.h);
		w.x = Math.max(d.x - w.w + 120, Math.min(d.x + d.w - 120, w.x));
		w.y = Math.max(d.y, Math.min(d.y + d.h - TITLE_H, w.y));
	}
}
