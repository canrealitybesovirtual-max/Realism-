/**
 * Text tools for the code workstation: a JavaScript / TypeScript highlighter,
 * a line diff (versions, checkpoints, agent proposals) and search. Pure
 * functions with no DOM, so they are unit-tested directly.
 */
export type TokKind = 'kw' | 'str' | 'num' | 'com' | 'fn' | 'type' | 'lit' | 'punct' | 'plain';
export interface Tok { s: number; e: number; k: TokKind }

const KW = new Set(('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return '
	+ 'static super switch this throw try typeof var void while with yield async await interface type enum implements private public protected readonly declare as from get set abstract namespace keyof').split(' '));
const LIT = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);
const ID = /[A-Za-z_$][\w$]*/y, NUM = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?/y;

/** highlight every line; block comments and template strings may span lines */
export function tokenize(lines: string[], maxLines = Infinity): Tok[][] {
	const out: Tok[][] = [];
	let mode: 'code' | 'block' | 'tpl' = 'code';
	for (let li = 0; li < lines.length; li++) {
		const L = lines[li];
		const toks: Tok[] = [];
		out.push(toks);
		if (li >= maxLines) continue;
		let i = 0;
		const push = (s: number, e: number, k: TokKind) => { if (e > s) toks.push({ s, e, k }); };
		while (i < L.length) {
			if (mode === 'block') {
				const end = L.indexOf('*/', i);
				if (end < 0) { push(i, L.length, 'com'); i = L.length; break; }
				push(i, end + 2, 'com'); i = end + 2; mode = 'code'; continue;
			}
			if (mode === 'tpl') {
				let j = i;
				while (j < L.length && L[j] !== '`') { if (L[j] === '\\') j++; j++; }
				if (j >= L.length) { push(i, L.length, 'str'); i = L.length; break; }
				push(i, j + 1, 'str'); i = j + 1; mode = 'code'; continue;
			}
			const c = L[i];
			if (c === ' ' || c === '\t') { i++; continue; }
			if (c === '/' && L[i + 1] === '/') { push(i, L.length, 'com'); i = L.length; break; }
			if (c === '/' && L[i + 1] === '*') { mode = 'block'; const end = L.indexOf('*/', i + 2); if (end < 0) { push(i, L.length, 'com'); i = L.length; break; } push(i, end + 2, 'com'); i = end + 2; mode = 'code'; continue; }
			if (c === '"' || c === "'") {
				let j = i + 1;
				while (j < L.length && L[j] !== c) { if (L[j] === '\\') j++; j++; }
				push(i, Math.min(L.length, j + 1), 'str'); i = j + 1; continue;
			}
			if (c === '`') { mode = 'tpl'; i++; let j = i; while (j < L.length && L[j] !== '`') { if (L[j] === '\\') j++; j++; } if (j < L.length) { push(i - 1, j + 1, 'str'); i = j + 1; mode = 'code'; } else { push(i - 1, L.length, 'str'); i = L.length; } continue; }
			if (/\d/.test(c) || (c === '.' && /\d/.test(L[i + 1] ?? ''))) { NUM.lastIndex = i; const m = NUM.exec(L); const e = m ? i + m[0].length : i + 1; push(i, e, 'num'); i = e; continue; }
			if (/[A-Za-z_$]/.test(c)) {
				ID.lastIndex = i; const w = ID.exec(L)![0]; const e = i + w.length;
				let k: TokKind = 'plain';
				if (KW.has(w)) k = 'kw';
				else if (LIT.has(w)) k = 'lit';
				else if (/^\s*\(/.test(L.slice(e))) k = 'fn';
				else if (/^[A-Z]/.test(w)) k = 'type';
				push(i, e, k); i = e; continue;
			}
			push(i, i + 1, 'punct'); i++;
		}
	}
	return out;
}

// ---------------------------------------------------------------------- diff
export interface DiffLine { k: ' ' | '+' | '-'; text: string; a?: number; b?: number }

/** line diff (LCS) of a -> b; common prefix / suffix are trimmed first */
export function diffLines(aText: string, bText: string): DiffLine[] {
	const a = aText.split('\n'), b = bText.split('\n');
	let pre = 0;
	while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
	let suf = 0;
	while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
	const A = a.slice(pre, a.length - suf), B = b.slice(pre, b.length - suf);
	const out: DiffLine[] = [];
	for (let i = 0; i < pre; i++) out.push({ k: ' ', text: a[i], a: i + 1, b: i + 1 });
	const n = A.length, m = B.length;
	if (n * m > 4_000_000) {
		// too big for a table: show it as one replaced block (still correct, just coarse)
		A.forEach((t, i) => out.push({ k: '-', text: t, a: pre + i + 1 }));
		B.forEach((t, i) => out.push({ k: '+', text: t, b: pre + i + 1 }));
	} else {
		const T = new Uint32Array((n + 1) * (m + 1));
		for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i * (m + 1) + j] = A[i] === B[j] ? T[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(T[(i + 1) * (m + 1) + j], T[i * (m + 1) + j + 1]);
		let i = 0, j = 0;
		while (i < n || j < m) {
			if (i < n && j < m && A[i] === B[j]) { out.push({ k: ' ', text: A[i], a: pre + i + 1, b: pre + j + 1 }); i++; j++; }
			else if (j < m && (i >= n || T[i * (m + 1) + j + 1] >= T[(i + 1) * (m + 1) + j])) { out.push({ k: '+', text: B[j], b: pre + j + 1 }); j++; }
			else { out.push({ k: '-', text: A[i], a: pre + i + 1 }); i++; }
		}
	}
	for (let i = 0; i < suf; i++) out.push({ k: ' ', text: a[a.length - suf + i], a: a.length - suf + i + 1, b: b.length - suf + i + 1 });
	return out;
}

/** only the changed lines with `ctx` lines around them; null rows mark gaps */
export function hunks(d: DiffLine[], ctx = 3): (DiffLine | null)[] {
	const keep = new Uint8Array(d.length);
	d.forEach((l, i) => { if (l.k !== ' ') for (let k = Math.max(0, i - ctx); k <= Math.min(d.length - 1, i + ctx); k++) keep[k] = 1; });
	const out: (DiffLine | null)[] = [];
	let gap = false;
	d.forEach((l, i) => { if (keep[i]) { if (gap && out.length) out.push(null); gap = false; out.push(l); } else gap = true; });
	return out;
}

export function diffStats(d: DiffLine[]) { return { added: d.filter((l) => l.k === '+').length, removed: d.filter((l) => l.k === '-').length }; }

/** apply a diff back (b from a) - used to prove diffs round-trip in tests */
export function applyDiff(d: DiffLine[]) { return d.filter((l) => l.k !== '-').map((l) => l.text).join('\n'); }

// ---------------------------------------------------------------------- search
export interface Match { line: number; col: number; len: number }
export function findAll(lines: string[], q: string, caseSensitive = false, limit = 2000): Match[] {
	if (!q) return [];
	const out: Match[] = [];
	const needle = caseSensitive ? q : q.toLowerCase();
	for (let l = 0; l < lines.length && out.length < limit; l++) {
		const hay = caseSensitive ? lines[l] : lines[l].toLowerCase();
		let i = hay.indexOf(needle);
		while (i >= 0 && out.length < limit) { out.push({ line: l, col: i, len: q.length }); i = hay.indexOf(needle, i + Math.max(1, needle.length)); }
	}
	return out;
}

/** a short content hash (FNV-1a) to detect that a file changed under you */
export function hashText(s: string) {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
	return (h >>> 0).toString(16).padStart(8, '0') + ':' + s.length;
}
