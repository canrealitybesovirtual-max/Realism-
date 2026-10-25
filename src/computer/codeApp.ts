import type { App, DesktopOS, KeyInput, Rect, CursorStyle } from './os';
import type { Editor } from '../engine/editor';
import type { Gameplay } from '../engine/gameplay';
import { TextBuffer } from './textBuffer';
import { checkScript, SCRIPT_TEMPLATE, type Diagnostic } from '../engine/scripts';
import { tokenize, diffLines, hunks, diffStats, findAll, type Tok, type TokKind, type DiffLine, type Match } from '../engine/codeTools';
import { ProjectFiles, parseTsc, type Checkpoint, type TaskResult, type SearchHit } from './projectFiles';
import { parse } from 'acorn';
import { log } from '../engine/log';

/**
 * "Code": the programming workstation on the in-world computer.
 *
 * Two kinds of document, kept clearly apart:
 * - Scripts: runtime behaviours stored in the scene (Script component).
 *   Checked as you type (syntax + engine rules); Apply (Ctrl+S) validates and
 *   records an undoable op, and the running game hot-reloads them. Every
 *   applied version is kept for diff / restore.
 * - Project: the game's real source files, only through the dev server's
 *   guarded API (tools/studioServer.ts) - allowlisted paths, a checkpoint
 *   before every write, conflict detection, confirmation before writing.
 *   The type check and unit tests run for real and their output is shown
 *   as it came. Without the dev server this side says it is unavailable.
 *
 * Unsaved edits are kept as drafts in the computer's storage so a page
 * reload (Vite reloads after a source write) does not lose them.
 */
type Hit = { x: number; y: number; w: number; h: number; cursor?: CursorStyle; down?: (x: number, y: number) => void; drag?: (dx: number, dy: number, x: number, y: number) => void; up?: (moved: boolean, x: number, y: number) => void };
interface Doc {
	kind: 'script' | 'file';
	key: string; // script id or file path
	buf: TextBuffer;
	/** text as last applied / read from disk */
	base: string;
	baseHash: string | null;
	edits: number;
	diags: Diagnostic[];
	toks: Tok[][];
	tokEdits: number;
	checkedEdits: number;
	scrollY: number;
	scrollX: number;
}

const C = { bg: '#1b1d22', panel: '#23262c', panel2: '#2a2e35', line: '#383d46', text: '#e3e6ea', dim: '#8e97a3', accent: '#3d8bfd', warn: '#ffb648', err: '#ff6b6b', ok: '#5ad08a', sel: '#264f78', find: 'rgba(255,200,60,0.35)' };
const TOK: Record<TokKind, string> = { kw: '#c586c0', str: '#ce9178', num: '#b5cea8', com: '#6a9955', fn: '#dcdcaa', type: '#4ec9b0', lit: '#569cd6', punct: '#b8bec7', plain: '#9cdcfe' };
const SIDE = 300, TOP = 56, BOTTOM = 240, GUT = 66, LH = 28, FS = 19;
type Tab = 'problems' | 'console' | 'versions' | 'output';

export class CodeApp implements App {
	id = 'workbench';
	title = 'Code';
	defaultRect = { x: 40, y: 50, w: 1840, h: 910 };
	minSize: [number, number] = [1200, 640];
	readonly project = new ProjectFiles();
	private side: 'scripts' | 'project' = 'scripts';
	private docs = new Map<string, Doc>();
	private cur: Doc | null = null;
	private hits: Hit[] = [];
	private active: { hit: Hit; x0: number; y0: number; lx: number; ly: number; moved: boolean } | null = null;
	private mouse = { x: 0, y: 0 };
	private charW = 0;
	private tab: Tab = 'problems';
	private find: { q: string; matches: Match[]; i: number } | null = null;
	private text: { key: string; value: string; commit: (s: string) => void } | null = null;
	private confirm: { msg: string; yes: () => void; label?: string } | null = null;
	private status = '';
	private busy = '';
	private sideScroll = 0;
	private bottomScroll = 0;
	private searchHits: { label: string; open: () => void; sub: string }[] | null = null;
	private versions: { label: string; text: () => Promise<string>; restore?: () => void }[] = [];
	private diff: { title: string; lines: (DiffLine | null)[]; stats: { added: number; removed: number } } | null = null;
	private output: TaskResult | null = null;
	private tscProblems: ReturnType<typeof parseTsc> = [];
	private selecting = false;
	private lastDraw = 0;
	private sig = '';
	private area = { x: 0, y: 0, w: 1, h: 1 };
	/** buttons drawn last frame (app-local), for tests and accessibility tooling */
	buttons: { label: string; x: number; y: number; w: number; h: number; enabled: boolean }[] = [];

	constructor(private os: DesktopOS, private ed: Editor, private gp: Gameplay) {
		void this.project.init().then(() => this.os.invalidate());
	}

	// ------------------------------------------------------------------ documents
	private draftKey(kind: string, key: string) { return `code.draft.${kind}.${key}`; }

	private makeDoc(kind: Doc['kind'], key: string, base: string, baseHash: string | null): Doc {
		const draft = this.os.storage.get(this.draftKey(kind, key));
		const d: Doc = { kind, key, buf: new TextBuffer(draft ?? base), base, baseHash, edits: 1, diags: [], toks: [], tokEdits: 0, checkedEdits: 0, scrollY: 0, scrollX: 0 };
		if (draft !== null && draft !== base) this.status = `Restored your unsaved draft of ${key}`;
		this.docs.set(kind + ':' + key, d);
		return d;
	}

	openScript(id: string) {
		const s = this.gp.scripts.get(id);
		if (!s) return;
		this.side = 'scripts';
		this.cur = this.docs.get('script:' + id) ?? this.makeDoc('script', id, s.source, null);
		this.find = null; this.diff = null;
		this.loadVersions();
	}

	async openFile(path: string, line?: number) {
		this.side = 'project';
		let d = this.docs.get('file:' + path);
		if (!d) {
			this.busy = 'Opening ' + path;
			try { const f = await this.project.read(path); d = this.makeDoc('file', path, f.text, f.hash); }
			catch (e) { this.status = `Could not open ${path}: ${(e as Error).message}`; this.busy = ''; return; }
			this.busy = '';
		}
		this.cur = d;
		this.find = null; this.diff = null;
		if (line) this.goto(line - 1, 0);
		this.loadVersions();
		this.os.invalidate();
	}

	newScript(): string {
		let n = this.gp.scripts.size + 1, id = `script-${n}`;
		while (this.gp.scripts.has(id)) id = `script-${++n}`;
		this.ed.apply({ op: 'script', id, script: { id, name: `Script ${n}`, source: SCRIPT_TEMPLATE } });
		this.saveVersion(id, SCRIPT_TEMPLATE);
		this.openScript(id);
		return id;
	}

	private dirty(d: Doc | null = this.cur) { return !!d && d.buf.text !== d.base; }

	private changed() {
		const d = this.cur!;
		d.edits++;
		const t = d.buf.text;
		if (t === d.base) this.os.storage.set(this.draftKey(d.kind, d.key), '');
		else this.os.storage.set(this.draftKey(d.kind, d.key), t);
		if (this.find) this.find.matches = findAll(d.buf.lines, this.find.q);
	}

	/** syntax / rule checks for the current document (scripts: full engine rules; .js: syntax) */
	private check(d: Doc) {
		if (d.checkedEdits === d.edits) return;
		d.checkedEdits = d.edits;
		if (d.kind === 'script') d.diags = checkScript(d.buf.text).diagnostics;
		else if (/\.(js|mjs)$/.test(d.key)) {
			try { parse(d.buf.text, { ecmaVersion: 'latest', sourceType: d.key.endsWith('.mjs') ? 'module' : 'script', locations: true }); d.diags = []; }
			catch (e: any) { d.diags = [{ line: e.loc?.line ?? 1, col: (e.loc?.column ?? 0) + 1, severity: 'error', message: String(e.message).replace(/\s*\(\d+:\d+\)$/, '') }]; }
		} else {
			// TypeScript is checked by the real compiler (Run type check); show its last results for this file
			d.diags = this.tscProblems.filter((p) => p.path === d.key).map((p) => ({ line: p.line, col: p.col, severity: 'error' as const, message: p.message }));
		}
	}

	// ------------------------------------------------------------------ actions
	private apply() {
		const d = this.cur;
		if (!d) return;
		if (d.kind === 'script') {
			const s = this.gp.scripts.get(d.key);
			if (!s) { this.status = 'This script was deleted (undo in Studio brings it back)'; return; }
			const src = d.buf.text;
			const c = checkScript(src);
			const err = c.diagnostics.find((x) => x.severity === 'error');
			if (err) { this.status = `Not applied: line ${err.line}: ${err.message}`; this.tab = 'problems'; this.goto(err.line - 1, err.col - 1); return; }
			if (src === d.base) { this.status = 'No changes to apply'; return; }
			if (this.ed.apply({ op: 'script', id: d.key, script: { ...s, source: src } })) {
				d.base = src;
				this.os.storage.set(this.draftKey('script', d.key), '');
				this.saveVersion(d.key, src);
				this.status = this.ed.runtime.mode === 'play' ? 'Applied - hot-reloaded in the running game' : 'Applied - runs when you press Play';
				this.loadVersions();
			}
			return;
		}
		if (!this.project.canWrite) { this.status = 'Writing is only allowed from the computer running the dev server'; return; }
		if (!this.dirty(d)) { this.status = 'No changes to save'; return; }
		const st = diffStats(diffLines(d.base, d.buf.text));
		this.confirm = {
			msg: `Write ${d.key} to disk (+${st.added} / -${st.removed} lines)? The old version is kept as a checkpoint you can restore.${d.key.startsWith('src/') ? ' The dev server reloads the game after source changes; your scene autosave and drafts are kept.' : ''}`,
			label: 'Write file',
			yes: () => { void this.writeFile(d); },
		};
	}

	private async writeFile(d: Doc) {
		this.busy = 'Writing ' + d.key;
		try {
			const text = d.buf.text;
			const r = await this.project.write(d.key, text, d.baseHash, 'Code app save');
			d.base = text; d.baseHash = r.hash;
			this.os.storage.set(this.draftKey('file', d.key), '');
			this.status = `Wrote ${d.key}${r.checkpoint ? ' (checkpoint kept)' : ''}`;
			log.info(`Code: wrote ${d.key}`);
			this.loadVersions();
		} catch (e) {
			const err = e as Error & { status?: number };
			if (err.status === 409) {
				this.status = `${d.key} changed on disk since you opened it - nothing written`;
				this.confirm = { msg: `${d.key} changed on disk since you opened it. Load the disk version? (Your edits stay in a draft you can diff against in Versions.)`, label: 'Load disk version', yes: () => void this.reloadFromDisk(d) };
			} else this.status = `Write failed: ${err.message}`;
		}
		this.busy = '';
		this.os.invalidate();
	}

	private async reloadFromDisk(d: Doc) {
		const mine = d.buf.text;
		const f = await this.project.read(d.key);
		d.base = f.text; d.baseHash = f.hash; d.buf.text = f.text; d.edits++;
		this.versions.unshift({ label: 'your unsaved edits', text: async () => mine });
		this.showDiff('disk version → your edits', f.text, mine);
	}

	private revert() {
		const d = this.cur;
		if (!d || !this.dirty(d)) return;
		this.confirm = { msg: `Throw away your unsaved changes to ${d.kind === 'script' ? this.gp.scripts.get(d.key)?.name : d.key}?`, label: 'Revert', yes: () => { d.buf.text = d.base; d.edits++; this.os.storage.set(this.draftKey(d.kind, d.key), ''); this.status = 'Reverted'; } };
	}

	private attach() {
		const d = this.cur;
		const e = this.ed.selection[0];
		if (!d || d.kind !== 'script') return;
		if (!e) { this.status = 'Select an object first (Studio, or point at it with the world tool)'; return; }
		if (this.ed.apply({ op: 'comp', id: e.id, ctype: 'Script', data: { script: d.key } })) this.status = `Attached to ${e.name}`;
	}

	private async runTask(task: string) {
		if (this.busy) return;
		this.busy = `Running ${this.project.tasks[task] ?? task}…`;
		this.tab = 'output';
		this.os.invalidate();
		try {
			this.output = await this.project.run(task);
			if (task === 'typecheck') { this.tscProblems = parseTsc(this.output.out); for (const d of this.docs.values()) d.checkedEdits = -1; }
			this.status = `${this.output.label}: ${this.output.timedOut ? 'timed out' : this.output.code === 0 ? 'passed' : `failed (exit ${this.output.code})`} in ${(this.output.ms / 1000).toFixed(1)} s`;
		} catch (e) { this.status = `Could not run: ${(e as Error).message}`; }
		this.busy = '';
		this.bottomScroll = 0;
		this.os.invalidate();
	}

	private async searchAll(q: string) {
		if (q.length < 2) { this.searchHits = null; return; }
		if (this.side === 'scripts') {
			const hits: NonNullable<CodeApp['searchHits']> = [];
			for (const s of this.gp.scripts.values()) s.source.split('\n').forEach((l, i) => { if (l.toLowerCase().includes(q.toLowerCase())) hits.push({ label: `${s.name}:${i + 1}`, sub: l.trim().slice(0, 40), open: () => { this.openScript(s.id); this.goto(i, 0); } }); });
			this.searchHits = hits;
		} else if (this.project.state === 'ready') {
			this.busy = 'Searching…';
			try { const h: SearchHit[] = await this.project.search(q); this.searchHits = h.map((x) => ({ label: `${x.path.split('/').pop()}:${x.line}`, sub: x.text.slice(0, 40), open: () => void this.openFile(x.path, x.line) })); }
			catch (e) { this.status = (e as Error).message; }
			this.busy = '';
		}
		this.sideScroll = 0;
		this.os.invalidate();
	}

	// ---------------------------------------------------------------- versions
	private versionKey(id: string) { return `code.versions.${id}`; }
	private saveVersion(id: string, source: string) {
		let list: { t: string; source: string }[] = [];
		try { list = JSON.parse(this.os.storage.get(this.versionKey(id)) ?? '[]'); } catch { /* start over */ }
		if (list[0]?.source === source) return;
		list.unshift({ t: new Date().toISOString(), source });
		this.os.storage.set(this.versionKey(id), JSON.stringify(list.slice(0, 25)));
	}

	private loadVersions() {
		const d = this.cur;
		this.versions = [];
		if (!d) return;
		if (d.kind === 'script') {
			let list: { t: string; source: string }[] = [];
			try { list = JSON.parse(this.os.storage.get(this.versionKey(d.key)) ?? '[]'); } catch { /* none */ }
			this.versions = list.map((v, i) => ({ label: `${i === 0 ? 'applied ' : ''}${new Date(v.t).toLocaleString()}`, text: async () => v.source, restore: () => { d.buf.text = v.source; this.changed(); this.status = 'Loaded that version into the editor - Apply to use it'; } }));
		} else if (this.project.state === 'ready') {
			void this.project.history(d.key).then((cps: Checkpoint[]) => {
				if (this.cur !== d) return;
				this.versions = cps.map((cp) => ({
					label: `${new Date(cp.time).toLocaleString()} · ${cp.reason}`,
					text: async () => (await this.project.checkpoint(cp.id)).text,
					restore: () => { this.confirm = { msg: `Restore ${d.key} on disk to the checkpoint from ${new Date(cp.time).toLocaleString()}? The current file is checkpointed first.`, label: 'Restore', yes: () => void this.restoreCheckpoint(d, cp.id) }; },
				}));
				this.os.invalidate();
			}).catch(() => {});
		}
	}

	private async restoreCheckpoint(d: Doc, id: string) {
		try {
			await this.project.restore(id);
			const f = await this.project.read(d.key);
			d.base = f.text; d.baseHash = f.hash; d.buf.text = f.text; d.edits++;
			this.os.storage.set(this.draftKey('file', d.key), '');
			this.status = `Restored ${d.key}`;
			this.loadVersions();
		} catch (e) { this.status = 'Restore failed: ' + (e as Error).message; }
		this.os.invalidate();
	}

	private showDiff(title: string, a: string, b: string) {
		const dl = diffLines(a, b);
		this.diff = { title, lines: hunks(dl, 3), stats: diffStats(dl) };
		this.tab = 'versions';
		this.bottomScroll = 0;
	}

	// ------------------------------------------------------------------ App
	drawIcon(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
		c.save();
		const g = c.createLinearGradient(0, y, 0, y + s); g.addColorStop(0, '#2b3a55'); g.addColorStop(1, '#0f141d');
		c.beginPath(); c.roundRect(x, y, s, s, s * 0.23); c.fillStyle = g; c.fill(); c.clip();
		c.font = `700 ${Math.round(s * 0.36)}px ${this.os.fonts.mono}`; c.textAlign = 'center'; c.textBaseline = 'middle';
		c.fillStyle = '#c586c0'; c.fillText('{', x + s * 0.3, y + s * 0.5);
		c.fillStyle = '#4ec9b0'; c.fillText('}', x + s * 0.7, y + s * 0.5);
		c.fillStyle = '#dcdcaa'; c.fillRect(x + s * 0.42, y + s * 0.6, s * 0.16, s * 0.05);
		c.restore();
	}

	animating(focused: boolean, now: number) {
		const s = `${this.ed.world.version}|${log.version}|${this.gp.scriptProblems.length}|${this.project.state}|${this.busy}`;
		if (s !== this.sig) { this.sig = s; return true; }
		return (focused && now - this.lastDraw > 500) || (!!this.busy && now - this.lastDraw > 300);
	}

	cursor(x: number, y: number): CursorStyle { return this.hitAt(x, y)?.cursor ?? 'arrow'; }

	pointerDown(x: number, y: number) {
		this.mouse = { x, y };
		const h = this.hitAt(x, y);
		if (this.text && !(h as any)?.keepText) { const t = this.text; this.text = null; t.commit(t.value); }
		if (!h) return;
		this.active = { hit: h, x0: x, y0: y, lx: x, ly: y, moved: false };
		h.down?.(x, y);
		this.os.invalidate();
	}
	pointerMove(x: number, y: number, _r: Rect, down: boolean) {
		this.mouse = { x, y };
		const a = this.active;
		if (!down || !a) return;
		if (Math.abs(x - a.x0) + Math.abs(y - a.y0) > 3) a.moved = true;
		a.hit.drag?.(x - a.lx, y - a.ly, x, y);
		a.lx = x; a.ly = y;
		this.os.invalidate();
	}
	pointerUp(x: number, y: number) { const a = this.active; this.active = null; this.selecting = false; a?.hit.up?.(a.moved, x, y); this.os.invalidate(); }

	wheel(dy: number) {
		const { x, y } = this.mouse;
		const ar = this.area;
		if (x < SIDE) this.sideScroll = Math.max(0, this.sideScroll + dy * 0.6);
		else if (y > ar.y + ar.h) this.bottomScroll = Math.max(0, this.bottomScroll + dy * 0.6);
		else if (this.cur) this.cur.scrollY = Math.max(0, Math.min(this.cur.buf.lines.length - 1, this.cur.scrollY + Math.sign(dy) * 3));
	}

	key(k: KeyInput): boolean {
		const mod = k.ctrl || k.meta;
		if (this.confirm) {
			if (k.code === 'Escape') { this.confirm = null; return true; }
			if (k.code === 'Enter') { const c = this.confirm; this.confirm = null; c.yes(); return true; }
			return true;
		}
		if (this.text) {
			const t = this.text;
			if (k.code === 'Enter' || k.code === 'NumpadEnter') { this.text = null; t.commit(t.value); return true; }
			if (k.code === 'Escape') { this.text = null; return true; }
			if (k.code === 'Backspace') t.value = t.value.slice(0, -1);
			else if (k.key.length === 1 && !mod) t.value += k.key;
			if (t.key === 'find' && this.find && this.cur) { this.find.q = t.value; this.find.matches = findAll(this.cur.buf.lines, t.value); this.find.i = 0; this.jumpMatch(0); }
			return true;
		}
		if (mod && k.code === 'KeyS') { this.apply(); return true; }
		if (mod && k.code === 'KeyF') { this.openFind(); return true; }
		if (k.code === 'F3' || (mod && k.code === 'KeyG')) { this.jumpMatch(k.shift ? -1 : 1); return true; }
		if (k.code === 'Escape' && this.find) { this.find = null; return true; }
		const d = this.cur;
		if (!d) return false;
		const b = d.buf;
		const nav: Record<string, Parameters<TextBuffer['move']>[0]> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Home: 'home', End: 'end' };
		let edited = false;
		if (nav[k.code]) {
			let dir = nav[k.code];
			if (mod && dir === 'home') dir = 'docStart';
			if (mod && dir === 'end') dir = 'docEnd';
			b.move(dir, k.shift, mod || k.alt);
		} else if (k.code === 'PageUp' || k.code === 'PageDown') {
			for (let i = 0; i < this.visible(); i++) b.move(k.code === 'PageUp' ? 'up' : 'down', k.shift);
		} else if (mod && k.code === 'KeyA') b.selectAll();
		else if (mod && k.code === 'KeyC') b.copy();
		else if (mod && k.code === 'KeyX') { b.cut(); edited = true; }
		else if (mod && k.code === 'KeyV') { b.paste(); edited = true; }
		else if (mod && k.code === 'KeyZ') { b.undo(); edited = true; }
		else if (mod && k.code === 'Slash') { this.toggleComment(); edited = true; }
		else if (k.code === 'Backspace') { b.backspace(mod || k.alt); edited = true; }
		else if (k.code === 'Delete') { b.deleteForward(mod || k.alt); edited = true; }
		else if (k.code === 'Enter' || k.code === 'NumpadEnter') {
			// keep the indent; one level deeper after an opening bracket
			const line = b.lines[b.caret.line];
			const indent = /^\s*/.exec(line)![0] + (/[{[(]\s*$/.test(line.slice(0, b.caret.col)) ? '  ' : '');
			b.newline(); if (indent) b.insert(indent);
			edited = true;
		} else if (k.code === 'Tab') { b.insert('  '); edited = true; }
		else if (!mod && k.key.length === 1) { b.insert(k.key); edited = true; }
		else return false;
		if (edited) this.changed();
		this.reveal();
		return true;
	}

	private toggleComment() {
		const b = this.cur!.buf;
		const r = b.selectionRange();
		const from = r ? r[0].line : b.caret.line, to = r ? r[1].line : b.caret.line;
		const all = b.lines.slice(from, to + 1).every((l) => /^\s*\/\//.test(l) || !l.trim());
		const lines = [...b.lines];
		for (let i = from; i <= to; i++) lines[i] = all ? lines[i].replace(/^(\s*)\/\/ ?/, '$1') : lines[i].replace(/^(\s*)/, '$1// ');
		const caret = { ...b.caret };
		b.selectAll(); b.insert(lines.join('\n'));
		b.setCaret({ line: caret.line, col: Math.min(caret.col, b.lines[caret.line].length) });
	}

	private openFind() {
		if (!this.cur) return;
		const q = this.cur.buf.selectedText().split('\n')[0] || this.find?.q || '';
		this.find = { q, matches: findAll(this.cur.buf.lines, q), i: 0 };
		this.text = { key: 'find', value: q, commit: () => this.jumpMatch(1) };
	}

	private jumpMatch(step: number) {
		const f = this.find, d = this.cur;
		if (!f || !d || !f.matches.length) return;
		if (step === 0) {
			// first match at or after the caret
			const c = d.buf.caret;
			const i = f.matches.findIndex((m) => m.line > c.line || (m.line === c.line && m.col >= c.col));
			f.i = i < 0 ? 0 : i;
		} else f.i = (f.i + step + f.matches.length) % f.matches.length;
		const m = f.matches[f.i];
		d.buf.setCaret({ line: m.line, col: m.col });
		d.buf.setCaret({ line: m.line, col: m.col + m.len }, true);
		this.reveal(true);
	}

	private goto(line: number, col: number) {
		const d = this.cur;
		if (!d) return;
		const l = Math.max(0, Math.min(d.buf.lines.length - 1, line));
		d.buf.setCaret({ line: l, col: Math.max(0, Math.min(d.buf.lines[l].length, col)) });
		this.reveal(true);
	}

	private visible() { return Math.max(1, Math.floor((this.area.h - 8) / LH)); }
	private reveal(center = false) {
		const d = this.cur;
		if (!d) return;
		const vis = this.visible(), l = d.buf.caret.line;
		if (center && (l < d.scrollY || l >= d.scrollY + vis)) d.scrollY = Math.max(0, l - Math.floor(vis / 2));
		if (l < d.scrollY) d.scrollY = l;
		if (l >= d.scrollY + vis) d.scrollY = l - vis + 1;
		const cx = d.buf.caret.col * this.charW, tw = this.area.w - GUT - 20;
		if (cx - d.scrollX > tw) d.scrollX = cx - tw + this.charW * 10;
		if (cx < d.scrollX) d.scrollX = Math.max(0, cx - this.charW * 10);
	}

	// ------------------------------------------------------------------ draw
	draw(c: CanvasRenderingContext2D, r: Rect, focused: boolean, now: number) {
		this.lastDraw = now;
		this.hits = [];
		this.buttons = [];
		const W = r.w, H = r.h;
		if (!this.charW) { c.font = `400 ${FS}px ${this.os.fonts.mono}`; this.charW = c.measureText('MMMMMMMMMM').width / 10; }
		// a script deleted (or undone) under us
		if (this.cur?.kind === 'script' && !this.gp.scripts.has(this.cur.key)) this.cur = null;
		c.save(); c.translate(r.x, r.y);
		c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
		this.area = { x: SIDE, y: TOP + (this.find ? 44 : 0), w: W - SIDE, h: H - TOP - BOTTOM - (this.find ? 44 : 0) };
		this.drawEditor(c, focused);
		this.drawSide(c, H);
		this.drawBottom(c, W, H);
		this.drawTop(c, W);
		if (this.find) this.drawFind(c, W);
		if (this.confirm) this.dialog(c, W, H);
		c.restore();
	}

	private drawTop(c: CanvasRenderingContext2D, W: number) {
		c.fillStyle = C.panel; c.fillRect(0, 0, W, TOP);
		c.fillStyle = C.line; c.fillRect(0, TOP - 1, W, 1);
		this.button(c, 'Scripts', 10, 9, 135, 38, () => { this.side = 'scripts'; this.searchHits = null; }, this.side === 'scripts');
		this.button(c, 'Project', 152, 9, 135, 38, () => { this.side = 'project'; this.searchHits = null; }, this.side === 'project');
		let x = SIDE + 12;
		const d = this.cur;
		const btn = (label: string, w: number, fn: () => void, enabled = true, on = false) => { this.button(c, label, x, 9, w, 38, fn, on, enabled); x += w + 8; };
		if (d) {
			const name = d.kind === 'script' ? this.gp.scripts.get(d.key)?.name ?? d.key : d.key;
			c.fillStyle = C.text; c.font = `600 18px ${this.os.fonts.ui}`; c.textBaseline = 'middle';
			const label = (this.dirty(d) ? '● ' : '') + name;
			c.fillText(label.length > 34 ? '…' + label.slice(-33) : label, x, 28);
			x += Math.min(380, c.measureText(label).width + 24);
			const errs = d.diags.filter((g) => g.severity === 'error').length;
			btn(d.kind === 'script' ? 'Apply  ⌃S' : 'Save  ⌃S', 120, () => this.apply(), this.dirty(d) && (d.kind === 'script' ? errs === 0 : this.project.canWrite));
			btn('Revert', 90, () => this.revert(), this.dirty(d));
			btn('Find  ⌃F', 110, () => this.openFind());
			if (d.kind === 'script') {
				btn('Attach to selected', 180, () => this.attach(), this.ed.selection.length > 0);
				this.textChip(c, 'rename', this.gp.scripts.get(d.key)?.name ?? '', x, 13, 170, (s) => { const sc = this.gp.scripts.get(d.key); if (sc && s.trim()) this.ed.apply({ op: 'script', id: sc.id, script: { ...sc, name: s.trim().slice(0, 60) } }); });
				x += 180;
				btn('Delete script', 140, () => { const sc = this.gp.scripts.get(d.key); if (sc) this.confirm = { msg: `Delete script "${sc.name}"? Objects using it stop running it (Undo in Studio brings it back).`, label: 'Delete', yes: () => { this.ed.apply({ op: 'script', id: sc.id, script: null }); this.cur = null; } }; });
			}
		}
		if (this.side === 'project' && this.project.state === 'ready') {
			x = Math.max(x, W - 360);
			btn('Type check', 140, () => void this.runTask('typecheck'), !this.busy && this.project.canWrite);
			btn('Unit tests', 130, () => void this.runTask('test'), !this.busy && this.project.canWrite);
		}
		// runtime state, right edge
		const m = this.ed.runtime.mode;
		c.fillStyle = m === 'play' ? C.ok : C.warn; c.font = `600 14px ${this.os.fonts.ui}`; c.textAlign = 'right';
		c.fillText(m === 'play' ? '● PLAYING' : m === 'paused' ? '❚❚ PAUSED' : '■ EDITING', W - 12, TOP - 10);
		c.textAlign = 'left';
	}

	private drawSide(c: CanvasRenderingContext2D, H: number) {
		c.fillStyle = C.panel; c.fillRect(0, TOP, SIDE, H - TOP);
		c.fillStyle = C.line; c.fillRect(SIDE - 1, TOP, 1, H - TOP);
		const ui = this.os.fonts.ui;
		let y = TOP + 10;
		this.textChip(c, 'search', this.searchHits ? '' : '', 10, y, SIDE - 20, (s) => void this.searchAll(s.trim()), this.side === 'scripts' ? 'Search all scripts…' : 'Search project files…');
		y += 42;
		c.save(); c.beginPath(); c.rect(0, y, SIDE, H - y); c.clip();
		const rowH = 34;
		let ry = y - this.sideScroll;
		const row = (label: string, sub: string, on: boolean, fn: () => void, col = C.text, indent = 0) => {
			if (ry + rowH > y && ry < H) {
				if (on) { c.fillStyle = C.sel; c.fillRect(0, ry, SIDE, rowH); }
				c.fillStyle = col; c.font = `500 16px ${ui}`; c.textBaseline = 'middle';
				c.fillText(label.slice(0, 30 - indent / 9), 14 + indent, ry + rowH / 2);
				if (sub) { c.fillStyle = C.dim; c.font = `400 13px ${ui}`; c.textAlign = 'right'; c.fillText(sub, SIDE - 10, ry + rowH / 2); c.textAlign = 'left'; }
				this.hits.push({ x: 0, y: Math.max(y, ry), w: SIDE, h: rowH, cursor: 'pointer', up: (moved) => { if (!moved) fn(); } });
			}
			ry += rowH;
		};
		const heading = (t: string) => { c.fillStyle = C.dim; c.font = `700 12px ${ui}`; c.textBaseline = 'middle'; c.fillText(t.toUpperCase(), 14, ry + 14); ry += 28; };
		if (this.searchHits) {
			heading(`${this.searchHits.length} result${this.searchHits.length === 1 ? '' : 's'}  ·  click to open`);
			row('× clear search', '', false, () => { this.searchHits = null; }, C.accent);
			for (const h of this.searchHits) row(h.label, '', false, h.open, C.text);
		} else if (this.side === 'scripts') {
			row('+ New script', '', false, () => this.newScript(), C.accent);
			heading('Scripts in this scene');
			for (const s of this.gp.scripts.values()) {
				const users = this.ed.world.list.filter((e) => !e.deleted && e.components.some((k) => k.type === 'Script' && k.data.script === s.id)).length;
				const failing = this.gp.scriptInsts.some((i) => i.doc.id === s.id && i.failed);
				const d = this.docs.get('script:' + s.id);
				row((this.dirty(d ?? null) ? '● ' : '') + s.name, failing ? 'error' : `${users} obj`, this.cur?.key === s.id && this.cur.kind === 'script', () => this.openScript(s.id), failing ? C.err : C.text);
			}
			if (!this.gp.scripts.size) { c.fillStyle = C.dim; c.font = `400 14px ${ui}`; c.fillText('No scripts yet.', 14, ry + 14); }
		} else if (this.project.state !== 'ready') {
			c.fillStyle = C.dim; c.font = `400 15px ${ui}`;
			wrap(c, this.project.state === 'checking' ? 'Looking for the dev server…' : this.project.reason, 14, ry + 14, SIDE - 28, 22);
		} else {
			let lastDir = '';
			for (const f of this.project.files) {
				const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
				if (dir !== lastDir) { heading(dir || '/'); lastDir = dir; }
				const d = this.docs.get('file:' + f.path);
				row((this.dirty(d ?? null) ? '● ' : '') + f.path.slice(dir ? dir.length + 1 : 0), this.tscProblems.some((p) => p.path === f.path) ? 'errors' : '', this.cur?.key === f.path, () => void this.openFile(f.path), this.tscProblems.some((p) => p.path === f.path) ? C.err : C.text, 6);
			}
			if (!this.project.canWrite) { ry += 8; c.fillStyle = C.warn; c.font = `400 13px ${ui}`; wrap(c, 'Read-only here: writes and commands are only accepted from the computer running the dev server.', 14, ry + 10, SIDE - 28, 18); }
		}
		c.restore();
		this.sideScroll = Math.min(this.sideScroll, Math.max(0, ry + this.sideScroll - H + 40));
	}

	private drawEditor(c: CanvasRenderingContext2D, focused: boolean) {
		const a = this.area, d = this.cur, mono = this.os.fonts.mono;
		c.fillStyle = '#1e1f24'; c.fillRect(a.x, a.y, a.w, a.h);
		if (!d) {
			c.fillStyle = C.dim; c.font = `400 19px ${this.os.fonts.ui}`; c.textBaseline = 'middle';
			const msg = this.side === 'scripts'
				? ['Scripts are JavaScript behaviours that run on objects while the game plays.', '“+ New script” makes one from a template; “Attach to selected” puts it on the object', 'selected in Studio. Apply (Ctrl+S) hot-reloads it in the running game.']
				: this.project.state === 'ready' ? ['Pick a file on the left. Saving writes it to disk (a checkpoint is kept);', 'Type check and Unit tests run the real tools on the dev server.'] : ['Project files are unavailable in this build.', this.project.reason];
			msg.forEach((m, i) => c.fillText(m, a.x + 40, a.y + 60 + i * 30));
			this.hits.push({ x: a.x, y: a.y, w: a.w, h: a.h });
			return;
		}
		this.check(d);
		if (d.tokEdits !== d.edits) { d.toks = tokenize(d.buf.lines, 20000); d.tokEdits = d.edits; }
		const vis = this.visible();
		const tx = a.x + GUT - d.scrollX;
		const sel = d.buf.selectionRange();
		const diagAt = new Map<number, Diagnostic>();
		for (const g of d.diags) if (!diagAt.has(g.line - 1) || g.severity === 'error') diagAt.set(g.line - 1, g);
		const runtimeErr = d.kind === 'script' ? this.gp.scriptProblems.filter((p) => p.script === d.key && p.line) : [];
		for (const p of runtimeErr) if (!diagAt.has(p.line! - 1)) diagAt.set(p.line! - 1, { line: p.line!, col: 1, severity: 'error', message: 'runtime: ' + p.message });
		c.save(); c.beginPath(); c.rect(a.x, a.y, a.w, a.h); c.clip();
		c.font = `400 ${FS}px ${mono}`; c.textBaseline = 'alphabetic';
		for (let i = 0; i <= vis; i++) {
			const li = d.scrollY + i;
			if (li >= d.buf.lines.length) break;
			const y = a.y + 4 + i * LH;
			const line = d.buf.lines[li];
			if (li === d.buf.caret.line) { c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(a.x, y, a.w, LH); }
			if (sel && li >= sel[0].line && li <= sel[1].line) {
				const s0 = li === sel[0].line ? sel[0].col : 0, s1 = li === sel[1].line ? sel[1].col : line.length + 1;
				c.fillStyle = focused ? C.sel : '#33373e'; c.fillRect(Math.max(a.x + GUT - 2, tx + s0 * this.charW), y, (s1 - s0) * this.charW, LH);
			}
			if (this.find) for (const m of this.find.matches) if (m.line === li) { c.fillStyle = C.find; c.fillRect(tx + m.col * this.charW, y + 2, m.len * this.charW, LH - 4); }
			// text
			c.save(); c.beginPath(); c.rect(a.x + GUT - 2, y, a.w - GUT, LH); c.clip();
			const toks = d.toks[li] ?? [];
			if (!toks.length && line) { c.fillStyle = TOK.plain; c.fillText(line, tx, y + 20); }
			for (const t of toks) {
				const sx = tx + t.s * this.charW;
				if (sx > a.x + a.w) break;
				c.fillStyle = TOK[t.k]; c.fillText(line.slice(t.s, t.e), sx, y + 20);
			}
			// squiggle
			const g = diagAt.get(li);
			if (g) {
				const s0 = Math.max(0, g.col - 1), s1 = g.endCol ? g.endCol - 1 : Math.max(s0 + 1, line.length);
				c.strokeStyle = g.severity === 'error' ? C.err : C.warn; c.lineWidth = 1.5; c.beginPath();
				for (let px = tx + s0 * this.charW; px < tx + Math.max(s1, s0 + 1) * this.charW; px += 4) c.lineTo(px, y + LH - 3 + ((px / 4) % 2 ? 2 : 0));
				c.stroke();
			}
			c.restore();
			// gutter
			c.fillStyle = '#1e1f24'; c.fillRect(a.x, y, GUT - 8, LH);
			c.fillStyle = li === d.buf.caret.line ? '#c8ccd2' : '#5d646e'; c.font = `400 15px ${mono}`; c.textAlign = 'right';
			c.fillText(String(li + 1), a.x + GUT - 16, y + 19);
			c.textAlign = 'left'; c.font = `400 ${FS}px ${mono}`;
			if (g) { c.fillStyle = g.severity === 'error' ? C.err : C.warn; c.beginPath(); c.arc(a.x + 9, y + LH / 2, 4, 0, Math.PI * 2); c.fill(); }
		}
		// caret
		if (focused && this.os.caretOn && !this.text) {
			const ci = d.buf.caret.line - d.scrollY;
			if (ci >= 0 && ci <= vis) { c.fillStyle = '#aeafad'; c.fillRect(tx + d.buf.caret.col * this.charW - 1, a.y + 4 + ci * LH + 3, 2, LH - 6); }
		}
		// hovering a marked line shows its message
		const hl = Math.floor((this.mouse.y - a.y - 4) / LH) + d.scrollY;
		const hg = this.mouse.x > a.x && this.mouse.x < a.x + a.w && this.mouse.y > a.y && this.mouse.y < a.y + a.h ? diagAt.get(hl) : undefined;
		if (hg) {
			const msg = `${hg.severity === 'error' ? '✖' : '▲'} ${hg.message}`;
			c.font = `500 15px ${this.os.fonts.ui}`;
			const w = Math.min(a.w - 40, c.measureText(msg).width + 24), yy = a.y + 4 + (hl - d.scrollY + 1) * LH + 4;
			c.fillStyle = '#2d3139'; c.strokeStyle = hg.severity === 'error' ? C.err : C.warn; c.beginPath(); c.roundRect(a.x + GUT, yy, w, 30, 6); c.fill(); c.stroke();
			c.fillStyle = C.text; c.textBaseline = 'middle'; c.fillText(msg, a.x + GUT + 12, yy + 15);
		}
		c.restore();
		// text area hit: click to place the caret, drag to select
		const pos = (x: number, y: number) => ({ line: Math.max(0, Math.min(d.buf.lines.length - 1, Math.floor((y - a.y - 4) / LH) + d.scrollY)), col: Math.max(0, Math.round((x - tx) / this.charW)) });
		this.hits.push({ x: a.x, y: a.y, w: a.w, h: a.h, cursor: 'text', down: (x, y) => { const p = pos(x, y); p.col = Math.min(p.col, d.buf.lines[p.line].length); d.buf.setCaret(p); this.selecting = true; }, drag: (_dx, _dy, x, y) => { if (!this.selecting) return; const p = pos(x, y); p.col = Math.min(p.col, d.buf.lines[p.line].length); d.buf.setCaret(p, true); this.reveal(); } });
	}

	private drawFind(c: CanvasRenderingContext2D, W: number) {
		const y = TOP, f = this.find!;
		c.fillStyle = C.panel2; c.fillRect(SIDE, y, W - SIDE, 44);
		c.fillStyle = C.dim; c.font = `500 15px ${this.os.fonts.ui}`; c.textBaseline = 'middle'; c.fillText('Find', SIDE + 14, y + 22);
		this.textChip(c, 'find', f.q, SIDE + 60, y + 7, 360, () => this.jumpMatch(1));
		c.fillStyle = f.matches.length ? C.text : (f.q ? C.err : C.dim); c.font = `500 15px ${this.os.fonts.ui}`;
		c.fillText(f.q ? (f.matches.length ? `${f.i + 1} of ${f.matches.length}` : 'no matches') : '', SIDE + 436, y + 22);
		this.button(c, '↑', SIDE + 560, y + 6, 40, 32, () => this.jumpMatch(-1));
		this.button(c, '↓', SIDE + 606, y + 6, 40, 32, () => this.jumpMatch(1));
		this.button(c, '×', SIDE + 652, y + 6, 40, 32, () => { this.find = null; this.text = null; });
	}

	private drawBottom(c: CanvasRenderingContext2D, W: number, H: number) {
		const y0 = H - BOTTOM, ui = this.os.fonts.ui, mono = this.os.fonts.mono;
		c.fillStyle = C.panel; c.fillRect(SIDE, y0, W - SIDE, BOTTOM);
		c.fillStyle = C.line; c.fillRect(SIDE, y0, W - SIDE, 1);
		const d = this.cur;
		const probs = d ? d.diags.length + (d.kind === 'script' ? this.gp.scriptProblems.filter((p) => p.script === d.key).length : 0) : 0;
		let x = SIDE + 10;
		const tab = (t: Tab, label: string) => { this.button(c, label, x, y0 + 8, 150, 32, () => { this.tab = t; this.bottomScroll = 0; }, this.tab === t); x += 158; };
		tab('problems', `Problems${probs ? ` (${probs})` : ''}`);
		tab('console', 'Console');
		tab('versions', d?.kind === 'file' ? 'Checkpoints' : 'Versions');
		tab('output', 'Task output');
		// status line
		c.fillStyle = this.busy ? C.accent : C.dim; c.font = `500 15px ${ui}`; c.textBaseline = 'middle'; c.textAlign = 'right';
		const st = this.busy || this.status;
		c.fillText(st.length > 90 ? st.slice(0, 89) + '…' : st, W - 14, y0 + 24);
		c.textAlign = 'left';
		const top = y0 + 48, h = BOTTOM - 52;
		c.save(); c.beginPath(); c.rect(SIDE, top, W - SIDE, h); c.clip();
		let y = top - this.bottomScroll;
		const RH = 24;
		const line = (text: string, col: string, fn?: () => void, font = `400 15px ${mono}`, indent = 0) => {
			if (y + RH > top && y < top + h) {
				c.fillStyle = col; c.font = font; c.textBaseline = 'middle';
				c.fillText(text.length > 170 ? text.slice(0, 169) + '…' : text, SIDE + 16 + indent, y + RH / 2);
				if (fn) this.hits.push({ x: SIDE, y: Math.max(top, y), w: W - SIDE, h: RH, cursor: 'pointer', up: (m) => { if (!m) fn(); } });
			}
			y += RH;
		};
		if (this.tab === 'problems') {
			if (!d) line('Open a script or file to see its problems.', C.dim, undefined, `400 15px ${ui}`);
			else {
				for (const g of d.diags) line(`${g.severity === 'error' ? '✖' : '▲'}  line ${g.line}:${g.col}  ${g.message}`, g.severity === 'error' ? C.err : C.warn, () => this.goto(g.line - 1, g.col - 1));
				if (d.kind === 'script') for (const p of this.gp.scriptProblems.filter((q) => q.script === d.key).slice(-12).reverse()) line(`✖  runtime${p.line ? ` line ${p.line}` : ''} on ${this.ed.world.get(p.entity)?.name ?? p.entity}: ${p.message}`, C.err, p.line ? () => this.goto(p.line! - 1, 0) : undefined);
				if (!probs) line(d.kind === 'file' && d.key.endsWith('.ts') ? (this.tscProblems.length || this.output ? 'No type errors in this file from the last type check.' : 'TypeScript files are checked by the real compiler: press “Type check”.') : 'No problems.', C.ok, undefined, `400 15px ${ui}`);
			}
		} else if (this.tab === 'console') {
			for (const e of log.entries.slice(-120).reverse()) line(`${e.level === 'error' ? '✖' : e.level === 'warn' ? '▲' : '·'} ${e.msg}${e.count > 1 ? `  ×${e.count}` : ''}`, e.level === 'error' ? C.err : e.level === 'warn' ? C.warn : C.text);
		} else if (this.tab === 'versions') {
			if (this.diff) {
				line(`${this.diff.title}   +${this.diff.stats.added}  −${this.diff.stats.removed}    (click here to go back to the list)`, C.accent, () => { this.diff = null; }, `600 15px ${ui}`);
				for (const l of this.diff.lines) {
					if (!l) { line('⋯', C.dim); continue; }
					if (y + RH > top && y < top + h && l.k !== ' ') { c.fillStyle = l.k === '+' ? 'rgba(90,208,138,0.13)' : 'rgba(255,107,107,0.13)'; c.fillRect(SIDE, y, W - SIDE, RH); }
					line(`${l.k} ${String(l.k === '-' ? l.a : l.b).padStart(4)}  ${l.text}`, l.k === '+' ? C.ok : l.k === '-' ? C.err : C.dim);
				}
			} else if (!d) line('Open a script or file.', C.dim, undefined, `400 15px ${ui}`);
			else {
				if (this.dirty(d)) line('Unsaved edits vs the applied/saved text  →  show diff', C.accent, () => this.showDiff('saved → your edits', d.base, d.buf.text), `600 15px ${ui}`);
				if (!this.versions.length) line(d.kind === 'script' ? 'No versions yet - each Apply keeps one.' : 'No checkpoints yet - one is kept before every write.', C.dim, undefined, `400 15px ${ui}`);
				for (const v of this.versions) {
					line(`${v.label}`, C.text, () => void v.text().then((t) => { this.showDiff(`${v.label} → editor`, t, d.buf.text); this.os.invalidate(); }), `500 15px ${ui}`);
					if (v.restore) { this.button(c, d.kind === 'script' ? 'Load into editor' : 'Restore on disk', W - 200, y - RH, 180, RH - 2, v.restore); }
				}
			}
		} else {
			const o = this.output;
			if (!o) line(this.project.state === 'ready' ? 'Run “Type check” or “Unit tests” (Project side) - their real output appears here.' : 'Commands need the local dev server (npm run dev); nothing runs in this build.', C.dim, undefined, `400 15px ${ui}`);
			else {
				line(`${o.label} · exit ${o.code ?? '—'}${o.timedOut ? ' (timed out)' : ''} · ${(o.ms / 1000).toFixed(1)} s`, o.code === 0 ? C.ok : C.err, undefined, `600 15px ${ui}`);
				const tsc = parseTsc(o.out);
				for (const l of (o.out.trim() || '(no output)').split('\n')) {
					const m = tsc.find((p) => l.startsWith(`${p.path}(${p.line},${p.col})`));
					line(l, m ? C.err : /fail|error|✗|×/i.test(l) ? C.err : /pass|✓/i.test(l) ? C.ok : C.text, m ? () => void this.openFile(m.path, m.line) : undefined);
				}
			}
		}
		c.restore();
		this.bottomScroll = Math.min(this.bottomScroll, Math.max(0, y + this.bottomScroll - top - h + 20));
		this.hits.unshift({ x: SIDE, y: top, w: W - SIDE, h });
	}

	private dialog(c: CanvasRenderingContext2D, W: number, H: number) {
		const d = this.confirm!;
		c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, W, H);
		this.hits.push({ x: 0, y: 0, w: W, h: H });
		const w = 700, h = 210, x = (W - w) / 2, y = (H - h) / 2;
		c.beginPath(); c.roundRect(x, y, w, h, 14); c.fillStyle = C.panel2; c.fill();
		c.fillStyle = C.text; c.font = `500 18px ${this.os.fonts.ui}`; c.textBaseline = 'middle';
		wrap(c, d.msg, x + 24, y + 36, w - 48, 26);
		this.button(c, d.label ?? 'Confirm', x + w - 330, y + h - 58, 170, 40, () => { this.confirm = null; d.yes(); }, true);
		this.button(c, 'Cancel', x + w - 150, y + h - 58, 130, 40, () => { this.confirm = null; });
	}

	private textChip(c: CanvasRenderingContext2D, key: string, value: string, x: number, y: number, w: number, commit: (s: string) => void, placeholder = '') {
		const editing = this.text?.key === key;
		c.beginPath(); c.roundRect(x, y, w, 30, 6); c.fillStyle = editing ? '#14161a' : '#2c3138'; c.fill();
		if (editing) { c.strokeStyle = C.accent; c.lineWidth = 1.5; c.stroke(); }
		c.font = `400 15px ${this.os.fonts.ui}`; c.textBaseline = 'middle';
		const v = editing ? this.text!.value : value;
		c.fillStyle = v ? C.text : C.dim;
		c.save(); c.beginPath(); c.rect(x, y, w - 6, 30); c.clip();
		c.fillText((v || placeholder) + (editing && this.os.caretOn ? '▏' : ''), x + 9, y + 15);
		c.restore();
		const hit: Hit & { keepText?: boolean } = { x, y, w, h: 30, cursor: 'text', up: () => { if (!editing) this.text = { key, value, commit }; } };
		hit.keepText = editing;
		this.hits.push(hit);
	}

	private button(c: CanvasRenderingContext2D, label: string, x: number, y: number, w: number, h: number, fn: () => void, on = false, enabled = true) {
		this.buttons.push({ label, x, y, w, h, enabled });
		c.beginPath(); c.roundRect(x, y, w, h, 7);
		c.fillStyle = on ? C.accent : enabled ? '#2f343c' : '#25282d'; c.fill();
		c.fillStyle = enabled ? '#fff' : '#5d636b'; c.font = `500 15px ${this.os.fonts.ui}`; c.textAlign = 'center'; c.textBaseline = 'middle';
		c.fillText(label, x + w / 2, y + h / 2 + 1); c.textAlign = 'left';
		if (enabled) this.hits.push({ x, y, w, h, cursor: 'pointer', up: (_m, ux, uy) => { if (ux >= x && ux <= x + w && uy >= y && uy <= y + h) fn(); } });
	}

	private hitAt(x: number, y: number) {
		for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h; }
		return null;
	}
}

function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
	let line = '', yy = y;
	for (const w of text.split(' ')) {
		const t = line ? line + ' ' + w : w;
		if (c.measureText(t).width > maxW && line) { c.fillText(line, x, yy); line = w; yy += lh; } else line = t;
	}
	if (line) c.fillText(line, x, yy);
	return yy;
}
