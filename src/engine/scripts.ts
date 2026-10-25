import { parse, type Node } from 'acorn';

/**
 * Runtime scripts: small JavaScript behaviours attached to entities through
 * the Script component, saved with the scene and hot-reloaded while playing.
 *
 * A script defines any of these functions (all optional):
 *   start()                      play begins, or the script was reloaded
 *   update(dt)                   every simulated frame
 *   onUse()                      the player used the object (E / trigger)
 *   onEvent(entityId, event, v)  any entity emitted an event
 *   onHit(hit)                   a bullet hit the object {x,y,z,speed}
 * and can use `self` (this entity), `api` (world, player, timers, state) and
 * `log(...)`. Top-level variables reset on reload; keep values that should
 * survive a hot reload in `api.state`.
 *
 * What the checks here are: acorn parses the code (real syntax errors with
 * line / column), a lint refuses page globals (window, document, fetch,
 * storage, eval, timers, constructor chains) so scripts stay within the
 * engine API, and every loop is instrumented with an iteration guard so an
 * endless loop throws instead of freezing the headset. A failing hook is
 * contained: the error is logged with its line, that script stops on that
 * entity, and the game carries on.
 *
 * What they are not: a security sandbox. Scripts run in the page with the
 * page's privileges; the lint keeps honest code honest but determined code
 * can get around it. That is why code that did not come from you (imported
 * saves, the Claude agent) is shown as a diff and only runs after you
 * approve it.
 */
export interface ScriptDoc { id: string; name: string; source: string }
export interface Diagnostic { line: number; col: number; endCol?: number; severity: 'error' | 'warning'; message: string }

export const HOOKS = ['start', 'update', 'onUse', 'onEvent', 'onHit'] as const;
export type Hook = typeof HOOKS[number];
export type Hooks = Partial<Record<Hook, (...a: any[]) => unknown>>;

export const MAX_SOURCE = 60000;
export const LOOP_LIMIT = 1_000_000;

const BANNED = new Set(['window', 'document', 'globalThis', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'localStorage', 'sessionStorage', 'indexedDB', 'caches',
	'eval', 'Function', 'importScripts', 'navigator', 'location', 'parent', 'top', 'opener', 'frames', 'postMessage', 'Worker', 'SharedWorker',
	'setTimeout', 'setInterval', 'requestAnimationFrame', 'queueMicrotask', '__guard', 'Reflect', 'Proxy', 'WebAssembly']);
const BANNED_PROPS = new Set(['constructor', '__proto__', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__']);

type AnyNode = Node & Record<string, any>;

function walk(n: AnyNode, visit: (n: AnyNode, parent: AnyNode | null) => void, parent: AnyNode | null = null) {
	visit(n, parent);
	for (const k in n) {
		if (k === 'loc') continue;
		const v = n[k];
		if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, visit, n); }
		else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, visit, n);
	}
}

function lineCol(src: string, pos: number) {
	let line = 1, last = -1;
	for (let i = 0; i < pos && i < src.length; i++) if (src.charCodeAt(i) === 10) { line++; last = i; }
	return { line, col: pos - last };
}

export interface Compiled { ok: boolean; diagnostics: Diagnostic[]; /** instrumented code (if ok) */ code?: string; hooks: Hook[] }

/** parse + lint + instrument; never runs the code */
export function checkScript(source: string): Compiled {
	const diagnostics: Diagnostic[] = [];
	if (typeof source !== 'string') return { ok: false, diagnostics: [{ line: 1, col: 1, severity: 'error', message: 'source must be text' }], hooks: [] };
	if (source.length > MAX_SOURCE) return { ok: false, diagnostics: [{ line: 1, col: 1, severity: 'error', message: `script is longer than ${MAX_SOURCE} characters` }], hooks: [] };
	let ast: AnyNode;
	try {
		ast = parse(source, { ecmaVersion: 2022, sourceType: 'script', locations: true }) as AnyNode;
	} catch (err: any) {
		const loc = err.loc ?? { line: 1, column: 0 };
		return { ok: false, diagnostics: [{ line: loc.line, col: loc.column + 1, severity: 'error', message: String(err.message).replace(/\s*\(\d+:\d+\)$/, '') }], hooks: [] };
	}
	const at = (n: AnyNode, severity: Diagnostic['severity'], message: string) => {
		const p = lineCol(source, n.start);
		diagnostics.push({ line: p.line, col: p.col, endCol: n.loc && n.loc.start.line === n.loc.end.line ? n.loc.end.column + 1 : undefined, severity, message });
	};
	const inserts: [number, string][] = [];
	const hooks: Hook[] = [];
	const declared = new Set<string>();
	walk(ast, (n, parent) => {
		switch (n.type) {
			case 'Identifier': {
				// a reference to a page global (not a property name or a local declaration of the same name)
				const isProp = parent?.type === 'MemberExpression' && parent.property === n && !parent.computed;
				const isKey = parent?.type === 'Property' && parent.key === n && !parent.computed;
				if (!isProp && !isKey && BANNED.has(n.name)) at(n, 'error', `"${n.name}" is not available to scripts; use the api (see the header)`);
				break;
			}
			case 'MemberExpression': {
				const name = n.computed ? (n.property.type === 'Literal' ? String(n.property.value) : null) : n.property.name;
				if (name && BANNED_PROPS.has(name)) at(n.property, 'error', `".${name}" is not allowed in scripts`);
				if (n.computed && n.property.type !== 'Literal' && n.property.type !== 'Identifier' && n.property.type !== 'BinaryExpression' && n.property.type !== 'UpdateExpression') { /* dynamic keys are fine for arrays / maps */ }
				break;
			}
			case 'ImportExpression': case 'ImportDeclaration': case 'ExportNamedDeclaration': case 'ExportDefaultDeclaration':
				at(n, 'error', 'scripts cannot import or export modules');
				break;
			case 'WithStatement': at(n, 'error', '"with" is not allowed'); break;
			case 'FunctionDeclaration':
				if (parent === ast) {
					declared.add(n.id.name);
					if ((HOOKS as readonly string[]).includes(n.id.name)) hooks.push(n.id.name as Hook);
					else if (/^on[A-Z]|^(Start|Update|awake|tick)$/.test(n.id.name)) at(n.id, 'warning', `"${n.id.name}" is not a hook the engine calls (hooks: ${HOOKS.join(', ')})`);
				}
				break;
			case 'ForStatement': case 'WhileStatement': case 'DoWhileStatement': case 'ForInStatement': case 'ForOfStatement': {
				const b = n.body as AnyNode;
				if (b.type === 'BlockStatement') inserts.push([b.start + 1, '__guard();']);
				else { inserts.push([b.start, '{__guard();']); inserts.push([b.end, '}']); }
				break;
			}
		}
	});
	if (!hooks.length && !diagnostics.some((d) => d.severity === 'error')) diagnostics.push({ line: 1, col: 1, severity: 'warning', message: `no hooks defined - the engine calls ${HOOKS.join(', ')}` });
	const ok = !diagnostics.some((d) => d.severity === 'error');
	if (!ok) return { ok, diagnostics, hooks };
	// splice the guards in from the end so earlier offsets stay valid; no
	// newlines are added, so line numbers in runtime errors still match
	let code = source;
	for (const [pos, s] of inserts.sort((a, b) => b[0] - a[0])) code = code.slice(0, pos) + s + code.slice(pos);
	return { ok, diagnostics, code, hooks };
}

/** a ScriptDoc as stored in a save - validated before it is applied */
export function validateScriptDoc(d: any, id: string): string | null {
	if (!d || typeof d !== 'object') return 'bad script';
	if (d.id !== id) return 'script id mismatch';
	if (typeof d.name !== 'string' || !d.name.length || d.name.length > 60) return 'bad script name';
	const c = checkScript(d.source);
	const e = c.diagnostics.find((x) => x.severity === 'error');
	return e ? `script "${d.name}" line ${e.line}: ${e.message}` : null;
}

// --------------------------------------------------------------------- running

let lineOffset: number | null = null;
/** how many lines new Function() puts before the body (engine-dependent; measured once) */
function functionLineOffset() {
	if (lineOffset !== null) return lineOffset;
	try { new Function('"use strict";\nthrow new Error("probe")')(); } catch (e: any) {
		const m = /<anonymous>:(\d+):\d+/.exec(String(e.stack));
		lineOffset = m ? Number(m[1]) - 2 : 2;
	}
	return lineOffset ?? 2;
}

/** the script line an error came from, if the stack says */
export function errorLine(err: unknown): number | null {
	const m = /(?:<anonymous>|anonymous):(\d+):\d+/.exec(String((err as Error)?.stack ?? ''));
	if (!m) return null;
	const l = Number(m[1]) - functionLineOffset() - 1;
	return l >= 1 ? l : null;
}

export type Factory = (guard: () => void, api: unknown, self: unknown, log: (...a: unknown[]) => void) => Hooks;

/** turn checked code into a factory; each call gives one entity its own closure */
export function makeFactory(c: Compiled): Factory {
	if (!c.ok || c.code === undefined) throw new Error('script has errors');
	const ret = HOOKS.map((h) => `${h}: typeof ${h} === 'function' ? ${h} : undefined`).join(', ');
	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	return new Function('__guard', 'api', 'self', 'log', `"use strict";\n${c.code}\n;return { ${ret} };`) as Factory;
}

/** an iteration counter shared by every loop in one hook call */
export function makeGuard(limit = LOOP_LIMIT) {
	const g = { n: 0, reset() { g.n = 0; }, fn: () => { if (++g.n > limit) throw new Error(`a loop ran more than ${limit.toLocaleString('en')} times in one call - stopped so the game keeps running`); } };
	return g;
}

export const SCRIPT_TEMPLATE = `// Runs while the game plays. Hooks: start, update(dt), onUse,
// onEvent(entityId, event, value), onHit(hit).
// self: this object  ·  api: world, player, timers, state  ·  log(...)

function start() {
  api.state.spins ??= 0;
  log(self.name + ' is ready');
}

function update(dt) {
  self.rotateBy(0, 45 * dt, 0);
}

function onUse() {
  api.state.spins++;
  self.setColor(api.state.spins % 2 ? '#3d8bfd' : '#e8b630');
  api.tone(440 + 110 * (api.state.spins % 4), 0.2);
  log('used ' + api.state.spins + ' times');
}
`;
