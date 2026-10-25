import type { App, DesktopOS, KeyInput, Rect, CursorStyle } from './os';
import type { Editor } from '../engine/editor';
import type { Gameplay } from '../engine/gameplay';
import type { ProjectFiles } from './projectFiles';
import { TextBuffer } from './textBuffer';
import { buildPrompt, parseProposal, previewProposal, sceneContext, type Proposal, type StepPreview } from '../engine/agent';
import { diffLines, hunks } from '../engine/codeTools';
import { log } from '../engine/log';

/**
 * "Assistant": ask Claude to change the game, review what it proposes,
 * approve or reject.
 *
 * Where Claude runs:
 * - local dev (`npm run dev` with ANTHROPIC_API_KEY in the server's
 *   environment): the dev server calls the API; the key never reaches the page;
 * - the published artifact on claude.ai: the page's `sample` capability, on the
 *   viewer's own Claude account (claude.ai asks the viewer first);
 * - otherwise: unavailable, and the app says so.
 * Either way the answer is only a proposal of typed ops (see engine/agent.ts):
 * previewed step by step with script diffs, applied as one all-or-nothing
 * transaction only after you press Apply, and undone with one Undo.
 */
type Hit = { x: number; y: number; w: number; h: number; cursor?: CursorStyle; up?: (moved: boolean, x: number, y: number) => void; down?: (x: number, y: number) => void };
type Sample = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string; truncated: boolean }>) & { json?: unknown };

const C = { bg: '#1b1d22', panel: '#23262c', line: '#383d46', text: '#e3e6ea', dim: '#8e97a3', accent: '#d97757', ok: '#5ad08a', warn: '#ffb648', err: '#ff6b6b', blue: '#3d8bfd' };
const EXAMPLES = [
	'Make the mug spin slowly while the game plays',
	'Add a warm light above the desk that pulses gently',
	'Put a crate on the floor that turns green when I use it',
	'Make the plant bob up and down a little',
];

export class AgentApp implements App {
	id = 'assistant';
	title = 'Assistant';
	defaultRect = { x: 120, y: 70, w: 1680, h: 880 };
	minSize: [number, number] = [1200, 640];
	private buf = new TextBuffer('');
	private hits: Hit[] = [];
	private active: { hit: Hit; moved: boolean; x0: number; y0: number } | null = null;
	private sample: Sample | null = null;
	private sampleChecked = false;
	private includeSel = true;
	private busy = false;
	private abort: AbortController | null = null;
	private streamed = '';
	status = '';
	proposal: Proposal | null = null;
	steps: StepPreview[] = [];
	private openStep = -1;
	private stepScroll = 0;
	private diffScroll = 0;
	private history: { request: string; outcome: string }[] = [];
	private lastDraw = 0;
	private sig = '';
	private mouse = { x: 0, y: 0 };
	private confirmApply = false;

	constructor(private os: DesktopOS, private ed: Editor, private gp: Gameplay, private project: ProjectFiles) {
		const w = window as any;
		if (w.claude?.use) {
			Promise.resolve(w.claude.use('sample')).then((s: Sample | null) => { this.sample = s; this.sampleChecked = true; this.os.invalidate(); }, () => { this.sampleChecked = true; });
		} else this.sampleChecked = true;
	}

	/** which backend answers, or null */
	get backend(): 'dev' | 'claude.ai' | null {
		if (this.project.state === 'ready' && this.project.agent) return 'dev';
		if (this.sample) return 'claude.ai';
		return null;
	}

	private backendNote() {
		if (this.backend === 'dev') return 'Claude via the dev server (API key stays on the server)';
		if (this.backend === 'claude.ai') return 'Claude via claude.ai (uses your Claude account; claude.ai asks first)';
		if (this.project.state === 'checking' || !this.sampleChecked) return 'Looking for Claude…';
		if (this.project.state === 'ready') return 'Unavailable: start the dev server with ANTHROPIC_API_KEY set';
		return 'Unavailable here: open the game on claude.ai, or run it with npm run dev and ANTHROPIC_API_KEY';
	}

	// ------------------------------------------------------------------ asking
	async ask(request = this.buf.text.trim()) {
		if (!request || this.busy) return;
		const be = this.backend;
		if (!be) { this.status = this.backendNote(); return; }
		this.busy = true; this.proposal = null; this.steps = []; this.openStep = -1; this.streamed = '';
		this.status = 'Thinking…';
		this.os.invalidate();
		const context = sceneContext(this.ed.world, this.gp, this.includeSel ? this.ed.selection.map((e) => e.id) : [], this.ed.runtime.mode);
		let text = '', truncated = false;
		try {
			if (be === 'dev') {
				const r = await this.project.askClaude(request, context);
				text = r.text; truncated = r.truncated;
			} else {
				this.abort = new AbortController();
				const r = await this.sample!(buildPrompt(request, context), { cache: false, signal: this.abort.signal, onText: ({ text: t }: { text: string }) => { this.streamed = t; this.status = `Claude is writing… ${t.length} characters`; this.os.invalidate(); } });
				text = r.text; truncated = r.truncated;
			}
		} catch (e: any) {
			this.busy = false; this.abort = null;
			const code = e?.code;
			this.status = code === 'cancelled' ? 'Stopped' : code === 'not_granted' ? 'Claude was not allowed for this page' : code === 'rate_limited' ? 'Too many requests right now; try again later' : `Claude could not answer: ${e?.message ?? e}`;
			if (code === 'not_granted' || code === 'sampling_disabled') this.sample = null;
			this.history.unshift({ request, outcome: this.status });
			this.os.invalidate();
			return;
		}
		this.busy = false; this.abort = null;
		if (truncated) { this.status = 'The answer was cut off; nothing to apply. Ask for a smaller change.'; this.history.unshift({ request, outcome: 'cut off' }); return; }
		const p = parseProposal(text);
		if (typeof p === 'string') { this.status = `Unusable answer: ${p}. Nothing was changed.`; this.history.unshift({ request, outcome: 'unusable answer' }); log.warn('Assistant: ' + this.status); return; }
		this.proposal = p;
		this.steps = previewProposal(p, this.ed.world, this.gp);
		const bad = this.steps.filter((s) => s.status === 'error').length;
		this.status = !p.ops.length ? 'Claude proposed no changes (see notes).' : bad ? `${bad} step(s) are invalid; this proposal cannot be applied.` : 'Review the steps, then Apply or Reject.';
		this.history.unshift({ request, outcome: `proposed ${p.ops.length} step(s)` });
		this.stepScroll = 0;
		this.os.invalidate();
	}

	stop() { this.abort?.abort(); }

	apply() {
		const p = this.proposal;
		if (!p || !p.ops.length || this.steps.some((s) => s.status === 'error')) return;
		const r = this.ed.applyBatch(p.ops, `Claude: ${p.summary.slice(0, 60)}`);
		if (r.ok) {
			this.status = `Applied ${p.ops.length} step(s) as one change. Undo (Studio or Ctrl+Z) reverts all of it.`;
			this.history[0] && (this.history[0].outcome = 'applied');
			this.proposal = null; this.steps = []; this.buf.text = '';
		} else {
			this.status = `Not applied: step ${r.index + 1}: ${r.why}. The scene is unchanged.`;
			if (r.index >= 0 && this.steps[r.index]) { this.steps[r.index].status = 'error'; this.steps[r.index].why = r.why; }
		}
		this.os.invalidate();
	}

	reject() {
		if (!this.proposal) return;
		this.proposal = null; this.steps = [];
		if (this.history[0]) this.history[0].outcome = 'rejected';
		this.status = 'Rejected; nothing was changed.';
	}

	// ------------------------------------------------------------------ App
	drawIcon(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
		c.save();
		c.beginPath(); c.roundRect(x, y, s, s, s * 0.23); c.fillStyle = '#f4ede4'; c.fill(); c.clip();
		// a simple asterisk-like spark
		c.translate(x + s / 2, y + s / 2); c.strokeStyle = C.accent; c.lineCap = 'round'; c.lineWidth = s * 0.09;
		for (let i = 0; i < 6; i++) { c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(0, s * 0.06); c.lineTo(0, s * 0.3); c.stroke(); }
		c.restore();
	}

	animating(focused: boolean, now: number) {
		const s = `${this.busy}|${this.status}|${this.ed.world.version}|${this.project.state}|${!!this.sample}`;
		if (s !== this.sig) { this.sig = s; return true; }
		return (focused && now - this.lastDraw > 500) || (this.busy && now - this.lastDraw > 250);
	}
	cursor(x: number, y: number): CursorStyle { return this.hitAt(x, y)?.cursor ?? 'arrow'; }
	pointerMove(x: number, y: number) { this.mouse = { x, y }; const a = this.active; if (a && Math.abs(x - a.x0) + Math.abs(y - a.y0) > 3) a.moved = true; }
	pointerDown(x: number, y: number) { this.mouse = { x, y }; const h = this.hitAt(x, y); if (!h) return; this.active = { hit: h, moved: false, x0: x, y0: y }; h.down?.(x, y); this.os.invalidate(); }
	pointerUp(x: number, y: number) { const a = this.active; this.active = null; a?.hit.up?.(a.moved, x, y); this.os.invalidate(); }
	wheel(dy: number) { if (this.mouse.x > 640) { if (this.openStep >= 0 && this.mouse.y > 470) this.diffScroll = Math.max(0, this.diffScroll + dy * 0.6); else this.stepScroll = Math.max(0, this.stepScroll + dy * 0.6); } }

	key(k: KeyInput): boolean {
		const mod = k.ctrl || k.meta, b = this.buf;
		if (this.confirmApply) { if (k.code === 'Enter') { this.confirmApply = false; this.apply(); } else if (k.code === 'Escape') this.confirmApply = false; return true; }
		if ((k.code === 'Enter' || k.code === 'NumpadEnter') && (mod || !k.shift)) { void this.ask(); return true; }
		if (k.code === 'Enter' && k.shift) { b.newline(); return true; }
		if (k.code === 'Escape') { if (this.busy) this.stop(); return true; }
		const nav: Record<string, Parameters<TextBuffer['move']>[0]> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Home: 'home', End: 'end' };
		if (nav[k.code]) b.move(nav[k.code], k.shift, mod || k.alt);
		else if (mod && k.code === 'KeyA') b.selectAll();
		else if (mod && k.code === 'KeyC') b.copy();
		else if (mod && k.code === 'KeyX') b.cut();
		else if (mod && k.code === 'KeyV') b.paste();
		else if (mod && k.code === 'KeyZ') b.undo();
		else if (k.code === 'Backspace') b.backspace(mod || k.alt);
		else if (k.code === 'Delete') b.deleteForward(mod || k.alt);
		else if (!mod && k.key.length === 1) { if (b.text.length < 2000) b.insert(k.key); }
		else return false;
		return true;
	}

	draw(c: CanvasRenderingContext2D, r: Rect, focused: boolean, now: number) {
		this.lastDraw = now;
		this.hits = [];
		const W = r.w, H = r.h, ui = this.os.fonts.ui;
		c.save(); c.translate(r.x, r.y);
		c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
		// header
		c.fillStyle = C.panel; c.fillRect(0, 0, W, 56);
		c.fillStyle = C.text; c.font = `600 20px ${ui}`; c.textBaseline = 'middle'; c.fillText('Ask Claude to change the game', 20, 28);
		c.fillStyle = this.backend ? C.ok : C.warn; c.font = `500 15px ${ui}`; c.textAlign = 'right'; c.fillText(this.backendNote(), W - 20, 28); c.textAlign = 'left';
		// left: request
		const LW = 620;
		c.fillStyle = C.dim; c.font = `600 13px ${ui}`; c.fillText('WHAT SHOULD CHANGE?', 20, 80);
		const box = { x: 20, y: 96, w: LW - 40, h: 220 };
		c.beginPath(); c.roundRect(box.x, box.y, box.w, box.h, 10); c.fillStyle = '#14161a'; c.fill();
		c.strokeStyle = focused ? C.accent : C.line; c.lineWidth = 1.5; c.stroke();
		c.font = `400 19px ${ui}`; c.fillStyle = this.buf.text ? C.text : C.dim;
		const lines = this.wrapLines(c, this.buf.text || 'e.g. "' + EXAMPLES[0] + '"', box.w - 32);
		lines.slice(-7).forEach((l, i) => c.fillText(l, box.x + 16, box.y + 26 + i * 28));
		if (focused && this.os.caretOn && !this.busy) { const last = lines.slice(-7); const li = Math.max(0, last.length - 1); c.fillStyle = C.accent; c.fillRect(box.x + 16 + (this.buf.text ? c.measureText(last[li] ?? '').width : 0) + 2, box.y + 12 + li * 28, 2, 26); }
		let y = box.y + box.h + 14;
		this.button(c, this.busy ? 'Stop' : 'Ask Claude  ⏎', 20, y, 200, 42, () => (this.busy ? this.stop() : void this.ask()), !this.busy, (!!this.buf.text.trim() || this.busy) && !!this.backend);
		this.button(c, `${this.includeSel ? '☑' : '☐'} Include selection${this.ed.selection.length ? ` (${this.ed.selection.map((e) => e.name).join(', ').slice(0, 24)})` : ''}`, 232, y, LW - 252, 42, () => { this.includeSel = !this.includeSel; });
		y += 64;
		c.fillStyle = C.dim; c.font = `600 13px ${ui}`; c.fillText('TRY', 20, y); y += 16;
		for (const ex of EXAMPLES) { this.button(c, ex, 20, y, LW - 40, 34, () => { this.buf.text = ex; this.buf.move('docEnd'); }, false, true, true); y += 40; }
		y += 14;
		c.fillStyle = C.dim; c.font = `600 13px ${ui}`; c.fillText('THIS SESSION', 20, y); y += 18;
		for (const h of this.history.slice(0, 6)) {
			c.font = `400 15px ${ui}`; c.fillStyle = C.text; c.fillText(trunc(h.request, 48), 20, y + 8);
			c.fillStyle = h.outcome === 'applied' ? C.ok : h.outcome.startsWith('proposed') ? C.blue : C.dim; c.textAlign = 'right'; c.fillText(trunc(h.outcome, 22), LW - 20, y + 8); c.textAlign = 'left';
			y += 26;
		}
		c.fillStyle = C.line; c.fillRect(LW, 56, 1, H - 56);
		// right: proposal
		this.drawProposal(c, LW + 1, 56, W - LW - 1, H - 56);
		// status bar
		c.fillStyle = C.panel; c.fillRect(0, H - 40, W, 40);
		c.fillStyle = /Not applied|invalid|Unusable|could not|Unavailable/.test(this.status) ? C.err : this.busy ? C.accent : C.dim;
		c.font = `500 15px ${ui}`; c.fillText(trunc(this.status, 160), 20, H - 20);
		if (this.confirmApply) this.dialog(c, W, H);
		c.restore();
	}

	private drawProposal(c: CanvasRenderingContext2D, X: number, Y: number, W: number, H: number) {
		const ui = this.os.fonts.ui, mono = this.os.fonts.mono, p = this.proposal;
		c.save(); c.beginPath(); c.rect(X, Y, W, H - 40); c.clip();
		if (!p) {
			c.fillStyle = C.dim; c.font = `400 18px ${ui}`;
			if (this.busy) {
				c.fillText(this.streamed ? 'Claude is writing the proposal…' : 'Thinking…', X + 30, Y + 40);
				c.font = `400 14px ${mono}`; c.fillStyle = '#6e7681';
				this.wrapLines(c, this.streamed.slice(-1400), W - 60).slice(-18).forEach((l, i) => c.fillText(l, X + 30, Y + 76 + i * 20));
			} else ['Claude answers with a proposal: a list of scene changes', '(moves, materials, lights, physics, new objects, components, graphs, scripts).', 'Nothing changes until you press Apply. Apply is all-or-nothing,', 'and one Undo reverts it.'].forEach((t, i) => c.fillText(t, X + 30, Y + 40 + i * 30));
			c.restore();
			return;
		}
		c.fillStyle = C.text; c.font = `600 19px ${ui}`; c.textBaseline = 'middle';
		this.wrapLines(c, p.summary, W - 60).slice(0, 2).forEach((l, i) => c.fillText(l, X + 30, Y + 28 + i * 26));
		let y = Y + 70;
		if (p.notes) { c.fillStyle = C.warn; c.font = `400 15px ${ui}`; for (const l of this.wrapLines(c, 'Note: ' + p.notes, W - 60).slice(0, 3)) { c.fillText(l, X + 30, y); y += 22; } y += 6; }
		const bad = this.steps.some((s) => s.status === 'error');
		this.button(c, `Apply ${p.ops.length} step${p.ops.length === 1 ? '' : 's'}`, X + 30, y, 190, 40, () => { this.confirmApply = true; }, true, !bad && p.ops.length > 0);
		this.button(c, 'Reject', X + 232, y, 120, 40, () => this.reject());
		y += 54;
		// steps
		const listH = this.openStep >= 0 ? 150 : H - (y - Y) - 50;
		c.save(); c.beginPath(); c.rect(X, y, W, listH); c.clip();
		let sy = y - this.stepScroll;
		for (const s of this.steps) {
			const col = s.status === 'error' ? C.err : s.status === 'later' ? C.warn : C.ok;
			const mark = s.status === 'error' ? '✖' : s.status === 'later' ? '…' : '✓';
			if (s.i === this.openStep) { c.fillStyle = '#264f78'; c.fillRect(X, sy, W, 30); }
			c.fillStyle = col; c.font = `600 16px ${ui}`; c.fillText(mark, X + 30, sy + 15);
			c.fillStyle = C.text; c.font = `400 15px ${ui}`; c.fillText(trunc(`${s.i + 1}. ${s.label}${s.diff ? `  (+${s.diff.added} −${s.diff.removed}, click for diff)` : ''}`, 110), X + 54, sy + 15);
			if (s.why) { c.fillStyle = col; c.textAlign = 'right'; c.fillText(trunc(s.status === 'later' ? 'checked when applied' : s.why, 50), X + W - 20, sy + 15); c.textAlign = 'left'; }
			const i = s.i;
			if (sy + 30 > y && sy < y + listH) this.hits.push({ x: X, y: Math.max(y, sy), w: W, h: 30, cursor: 'pointer', up: (m) => { if (!m) { this.openStep = this.openStep === i ? -1 : i; this.diffScroll = 0; } } });
			if (s.status === 'later' && !s.why) { c.fillStyle = C.warn; c.textAlign = 'right'; c.fillText('checked when applied', X + W - 20, sy + 15); c.textAlign = 'left'; }
			sy += 32;
		}
		c.restore();
		this.stepScroll = Math.min(this.stepScroll, Math.max(0, this.steps.length * 32 - listH));
		// detail: script diff or op JSON
		const s = this.steps[this.openStep];
		if (s) {
			const dy = y + listH + 10;
			c.fillStyle = '#16181c'; c.fillRect(X + 20, dy, W - 40, H - (dy - Y) - 50);
			c.save(); c.beginPath(); c.rect(X + 20, dy, W - 40, H - (dy - Y) - 50); c.clip();
			c.font = `400 14px ${mono}`;
			let ly = dy + 16 - this.diffScroll;
			const rows: { t: string; col: string; bg?: string }[] = [];
			if (s.diff) {
				for (const l of hunks(diffLines(s.diff.before, s.diff.after), 4)) rows.push(l ? { t: `${l.k} ${l.text}`, col: l.k === '+' ? C.ok : l.k === '-' ? C.err : C.dim, bg: l.k === '+' ? 'rgba(90,208,138,0.12)' : l.k === '-' ? 'rgba(255,107,107,0.12)' : undefined } : { t: '⋯', col: C.dim });
			} else for (const l of JSON.stringify(p.ops[s.i], null, 2).split('\n')) rows.push({ t: l, col: C.text });
			for (const row of rows) { if (row.bg) { c.fillStyle = row.bg; c.fillRect(X + 20, ly - 10, W - 40, 20); } c.fillStyle = row.col; c.fillText(row.t.slice(0, 150), X + 34, ly); ly += 20; }
			c.restore();
			this.diffScroll = Math.min(this.diffScroll, Math.max(0, rows.length * 20 - (H - (dy - Y) - 80)));
		}
		c.restore();
	}

	private dialog(c: CanvasRenderingContext2D, W: number, H: number) {
		const p = this.proposal!;
		c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, W, H);
		this.hits.push({ x: 0, y: 0, w: W, h: H });
		const w = 700, h = 200, x = (W - w) / 2, y = (H - h) / 2;
		c.beginPath(); c.roundRect(x, y, w, h, 14); c.fillStyle = '#2a2e35'; c.fill();
		c.fillStyle = C.text; c.font = `500 18px ${this.os.fonts.ui}`; c.textBaseline = 'middle';
		const scripts = p.ops.filter((o) => o.op === 'script' && o.script).length;
		const deletes = p.ops.filter((o) => o.op === 'delete').length;
		this.wrapLines(c, `Apply ${p.ops.length} change(s) from Claude?${scripts ? ` ${scripts} script(s) will run while the game plays.` : ''}${deletes ? ` ${deletes} object(s) will be deleted.` : ''} One Undo reverts everything.`, w - 48).forEach((l, i) => c.fillText(l, x + 24, y + 40 + i * 26));
		this.button(c, 'Apply', x + w - 290, y + h - 58, 130, 40, () => { this.confirmApply = false; this.apply(); }, true);
		this.button(c, 'Cancel', x + w - 150, y + h - 58, 130, 40, () => { this.confirmApply = false; });
	}

	private wrapLines(c: CanvasRenderingContext2D, text: string, maxW: number) {
		const out: string[] = [];
		for (const para of text.split('\n')) {
			let line = '';
			for (const w of para.split(' ')) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
			out.push(line);
		}
		return out;
	}

	private button(c: CanvasRenderingContext2D, label: string, x: number, y: number, w: number, h: number, fn: () => void, primary = false, enabled = true, quiet = false) {
		c.beginPath(); c.roundRect(x, y, w, h, 8);
		c.fillStyle = !enabled ? '#25282d' : primary ? C.accent : quiet ? '#20232a' : '#2f343c'; c.fill();
		c.fillStyle = enabled ? (quiet ? '#c9ced6' : '#fff') : '#5d636b'; c.font = `500 ${quiet ? 15 : 16}px ${this.os.fonts.ui}`; c.textBaseline = 'middle';
		if (quiet) c.fillText(trunc(label, 70), x + 14, y + h / 2 + 1); else { c.textAlign = 'center'; c.fillText(label, x + w / 2, y + h / 2 + 1); c.textAlign = 'left'; }
		if (enabled) this.hits.push({ x, y, w, h, cursor: 'pointer', up: (_m, ux, uy) => { if (ux >= x && ux <= x + w && uy >= y && uy <= y + h) fn(); } });
	}

	private hitAt(x: number, y: number) {
		for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h; }
		return null;
	}
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
