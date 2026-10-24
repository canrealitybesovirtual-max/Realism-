/**
 * Plain-text editing model for the Notes app: multi-line buffer with caret,
 * shift-selection, word movement, undo and an internal clipboard.
 * No DOM or canvas dependencies, so it is unit-tested directly.
 */
export interface Pos { line: number; col: number; }

const cmp = (a: Pos, b: Pos) => (a.line - b.line) || (a.col - b.col);

export class TextBuffer {
	lines: string[];
	caret: Pos = { line: 0, col: 0 };
	anchor: Pos | null = null;
	/** preferred column for vertical movement */
	private goalCol = 0;
	private undoStack: { text: string; caret: Pos }[] = [];
	private lastEditKind = '';
	static clipboard = '';

	constructor(text = '') {
		this.lines = text.split('\n');
	}

	get text(): string { return this.lines.join('\n'); }

	set text(t: string) {
		this.lines = t.split('\n');
		this.caret = { line: 0, col: 0 };
		this.anchor = null;
	}

	hasSelection(): boolean { return !!this.anchor && cmp(this.anchor, this.caret) !== 0; }

	selectionRange(): [Pos, Pos] | null {
		if (!this.hasSelection()) return null;
		const a = this.anchor!, c = this.caret;
		return cmp(a, c) < 0 ? [{ ...a }, { ...c }] : [{ ...c }, { ...a }];
	}

	selectedText(): string {
		const r = this.selectionRange();
		if (!r) return '';
		const [s, e] = r;
		if (s.line === e.line) return this.lines[s.line].slice(s.col, e.col);
		const parts = [this.lines[s.line].slice(s.col)];
		for (let l = s.line + 1; l < e.line; l++) parts.push(this.lines[l]);
		parts.push(this.lines[e.line].slice(0, e.col));
		return parts.join('\n');
	}

	private snapshot(kind: string) {
		// coalesce consecutive typing into one undo step
		if (kind === 'type' && this.lastEditKind === 'type') return;
		this.undoStack.push({ text: this.text, caret: { ...this.caret } });
		if (this.undoStack.length > 200) this.undoStack.shift();
		this.lastEditKind = kind;
	}

	undo(): boolean {
		const s = this.undoStack.pop();
		if (!s) return false;
		this.lines = s.text.split('\n');
		this.caret = this.clamp(s.caret);
		this.anchor = null;
		this.lastEditKind = '';
		return true;
	}

	private clamp(p: Pos): Pos {
		const line = Math.max(0, Math.min(this.lines.length - 1, p.line));
		return { line, col: Math.max(0, Math.min(this.lines[line].length, p.col)) };
	}

	private deleteSelection(): boolean {
		const r = this.selectionRange();
		if (!r) { this.anchor = null; return false; }
		const [s, e] = r;
		const head = this.lines[s.line].slice(0, s.col), tail = this.lines[e.line].slice(e.col);
		this.lines.splice(s.line, e.line - s.line + 1, head + tail);
		this.caret = s;
		this.anchor = null;
		return true;
	}

	insert(text: string) {
		this.snapshot(text.length === 1 && text !== '\n' ? 'type' : 'insert');
		this.deleteSelection();
		const { line, col } = this.caret;
		const cur = this.lines[line];
		const parts = text.replace(/\r\n?/g, '\n').split('\n');
		const head = cur.slice(0, col), tail = cur.slice(col);
		if (parts.length === 1) {
			this.lines[line] = head + parts[0] + tail;
			this.caret = { line, col: col + parts[0].length };
		} else {
			const newLines = [head + parts[0], ...parts.slice(1, -1), parts[parts.length - 1] + tail];
			this.lines.splice(line, 1, ...newLines);
			this.caret = { line: line + parts.length - 1, col: parts[parts.length - 1].length };
		}
		this.goalCol = this.caret.col;
	}

	newline() {
		// keep the current line's indentation
		const indent = /^[\t ]*/.exec(this.lines[this.caret.line])![0];
		this.insert('\n' + indent.slice(0, Math.min(indent.length, this.caret.col)));
	}

	backspace(word = false) {
		this.snapshot('delete');
		if (this.deleteSelection()) return;
		const { line, col } = this.caret;
		if (col > 0) {
			const n = word ? col - this.wordLeft(line, col) : 1;
			const s = this.lines[line];
			this.lines[line] = s.slice(0, col - n) + s.slice(col);
			this.caret.col -= n;
		} else if (line > 0) {
			const prevLen = this.lines[line - 1].length;
			this.lines[line - 1] += this.lines[line];
			this.lines.splice(line, 1);
			this.caret = { line: line - 1, col: prevLen };
		}
		this.goalCol = this.caret.col;
	}

	deleteForward(word = false) {
		this.snapshot('delete');
		if (this.deleteSelection()) return;
		const { line, col } = this.caret;
		const s = this.lines[line];
		if (col < s.length) {
			const n = word ? this.wordRight(line, col) - col : 1;
			this.lines[line] = s.slice(0, col) + s.slice(col + n);
		} else if (line < this.lines.length - 1) {
			this.lines[line] = s + this.lines[line + 1];
			this.lines.splice(line + 1, 1);
		}
	}

	private wordLeft(line: number, col: number): number {
		const s = this.lines[line];
		let i = col;
		while (i > 0 && /\s/.test(s[i - 1])) i--;
		while (i > 0 && /\w/.test(s[i - 1])) i--;
		if (i === col && i > 0) i--; // punctuation
		return i;
	}

	private wordRight(line: number, col: number): number {
		const s = this.lines[line];
		let i = col;
		while (i < s.length && /\s/.test(s[i])) i++;
		while (i < s.length && /\w/.test(s[i])) i++;
		if (i === col && i < s.length) i++;
		return i;
	}

	private beginMove(select: boolean) {
		if (select) { if (!this.anchor) this.anchor = { ...this.caret }; }
		else this.anchor = null;
		this.lastEditKind = '';
	}

	move(dir: 'left' | 'right' | 'up' | 'down' | 'home' | 'end' | 'docStart' | 'docEnd', select = false, word = false) {
		const collapse = !select && this.hasSelection() && (dir === 'left' || dir === 'right');
		const range = this.selectionRange();
		this.beginMove(select);
		if (collapse && range) { this.caret = dir === 'left' ? range[0] : range[1]; this.goalCol = this.caret.col; return; }
		const c = this.caret;
		switch (dir) {
			case 'left':
				if (c.col > 0) c.col = word ? this.wordLeft(c.line, c.col) : c.col - 1;
				else if (c.line > 0) { c.line--; c.col = this.lines[c.line].length; }
				this.goalCol = c.col; break;
			case 'right':
				if (c.col < this.lines[c.line].length) c.col = word ? this.wordRight(c.line, c.col) : c.col + 1;
				else if (c.line < this.lines.length - 1) { c.line++; c.col = 0; }
				this.goalCol = c.col; break;
			case 'up':
				if (c.line > 0) { c.line--; c.col = Math.min(this.goalCol, this.lines[c.line].length); } else c.col = 0;
				break;
			case 'down':
				if (c.line < this.lines.length - 1) { c.line++; c.col = Math.min(this.goalCol, this.lines[c.line].length); } else c.col = this.lines[c.line].length;
				break;
			case 'home': {
				// smart home: first non-blank, then column 0
				const ind = /^\s*/.exec(this.lines[c.line])![0].length;
				c.col = c.col === ind ? 0 : ind; this.goalCol = c.col; break;
			}
			case 'end': c.col = this.lines[c.line].length; this.goalCol = c.col; break;
			case 'docStart': c.line = 0; c.col = 0; this.goalCol = 0; break;
			case 'docEnd': c.line = this.lines.length - 1; c.col = this.lines[c.line].length; this.goalCol = c.col; break;
		}
	}

	setCaret(p: Pos, select = false) {
		this.beginMove(select);
		this.caret = this.clamp(p);
		this.goalCol = this.caret.col;
	}

	selectAll() {
		this.anchor = { line: 0, col: 0 };
		this.caret = { line: this.lines.length - 1, col: this.lines[this.lines.length - 1].length };
	}

	copy(): string { if (this.hasSelection()) TextBuffer.clipboard = this.selectedText(); return TextBuffer.clipboard; }
	cut() { if (!this.hasSelection()) return; this.copy(); this.snapshot('cut'); this.deleteSelection(); }
	paste() { if (TextBuffer.clipboard) this.insert(TextBuffer.clipboard); }

	wordCount(): number { return (this.text.match(/\S+/g) ?? []).length; }
}
