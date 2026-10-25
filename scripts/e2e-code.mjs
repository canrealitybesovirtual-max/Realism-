// Code workstation checks, driven through the in-world computer's own input
// (pointer + keys into the OS), not by calling app internals.
//   npm run dev & node scripts/e2e-code.mjs [--url http://localhost:5173/]
// Project-file checks need the dev server; against a build they verify the
// app reports project files as unavailable instead.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(url + '?noao');
await p.waitForFunction(() => window.__studio?.ready, null, { timeout: 600000 });
await p.evaluate(() => document.getElementById('overlay')?.classList.add('hidden'));
const S = (fn, arg) => p.evaluate(fn, arg);
const frames = (n) => p.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

// OS-level input helpers (coordinates are app-local)
await S(() => {
	const s = window.__studio, os = s.computer.os;
	const rect = () => os.contentRect(os.wm.byApp('workbench'));
	window.__os = {
		draw() { os.invalidate(); os.render(performance.now()); },
		click(x, y) { const r = rect(); os.pointerMove(r.x + x, r.y + y); os.pointerDown(); os.pointerUp(); this.draw(); },
		button(label) { this.draw(); const bt = s.code.buttons.find((b) => b.label.startsWith(label) && b.enabled); if (!bt) return false; this.click(bt.x + bt.w / 2, bt.y + bt.h / 2); return true; },
		key(code, key = '', mods = {}) { os.key({ code, key, shift: !!mods.shift, ctrl: !!mods.ctrl, alt: false, meta: false }); this.draw(); },
		type(str) { for (const ch of str) { if (ch === '\n') os.key({ code: 'Enter', key: 'Enter', shift: false, ctrl: false, alt: false, meta: false }); else os.key({ code: 'Key', key: ch, shift: false, ctrl: false, alt: false, meta: false }); } this.draw(); },
		text() { return s.code.cur?.buf.text ?? null; },
	};
	os.openApp('workbench');
	window.__os.draw();
});

// 1. new script from the sidebar, attached to the selected mug
const made = await S(() => { const s = window.__studio; const n = s.gameplay.scripts.size; window.__os.click(150, 56 + 10 + 42 + 17); return { n0: n, n1: s.gameplay.scripts.size, text: window.__os.text(), dbg: { st: s.code.status, side: s.code.side, hl: s.code.hits.map((h) => [h.x, h.y, h.w, h.h].join(",")).join(" "), hits: s.code.hits.length, cur: s.computer.os.cursor, foc: s.computer.os.wm.focused?.app, wins: s.computer.os.wm.windows.map((w) => w.app + ":" + w.x + "," + w.y) } }; });
check('“+ New script” makes a script and opens it in the editor', made.n1 === made.n0 + 1 && /function update/.test(made.text ?? ''), JSON.stringify({ n0: made.n0, n1: made.n1, dbg: made.dbg }));
await S(() => { const s = window.__studio; s.runtime.stop(); s.editor.select(s.editor.world.get('mug')); });
const attached = await S(() => { const ok = window.__os.button('Attach to selected'); const e = window.__studio.editor.world.get('mug'); return ok && e.components.some((c) => c.type === 'Script'); });
check('“Attach to selected” adds a Script component to the mug', attached);

// 2. typing: a syntax error is reported live and Apply refuses it
await S(() => { window.__os.click(700, 200); window.__os.key('KeyA', 'a', { ctrl: true }); window.__os.type('function update(dt) {\nself.moveBy(0, 0.5 * dt, 0\n}'); });
const bad = await S(() => { const c = window.__studio.code; window.__os.draw(); const d = c.cur.diags.find((x) => x.severity === 'error'); window.__os.key('KeyS', 's', { ctrl: true }); return { d, status: c.status, applied: window.__studio.gameplay.scripts.get(c.cur.key).source.includes('0.5 * dt') }; });
check('syntax error shows in Problems with its line, and Ctrl+S refuses to apply', !!bad.d && bad.d.line === 3 && /Not applied/.test(bad.status) && !bad.applied, JSON.stringify(bad));
// banned global
await S(() => { window.__os.key('KeyA', 'a', { ctrl: true }); window.__os.type('function start() {\nwindow.location = "x";\n}'); });
const banned = await S(() => { window.__os.draw(); return window.__studio.code.cur.diags[0]; });
check('page globals (window) are flagged as errors in the editor', banned?.severity === 'error' && /window/.test(banned.message), JSON.stringify(banned));

// 3. a working script, applied while playing -> hot reload in the running game
await S(() => { window.__studio.runtime.play(); window.__os.key('KeyA', 'a', { ctrl: true }); window.__os.type("function start() {\napi.state.n = (api.state.n || 0) + 1;\nself.setColor('#ff00ff');\n}\nfunction update(dt) {\nself.moveBy(0, 0.2 * dt, 0);\n}"); window.__os.key('KeyS', 's', { ctrl: true }); });
const y0 = await S(() => window.__studio.editor.world.get('mug').object.position.y);
// wait for 0.6 s of simulated time (frame rate under SwiftShader varies a lot)
const tPlay = await S(() => window.__studio.runtime.time);
await p.waitForFunction((t) => window.__studio.runtime.time > t + 0.6, tPlay, { timeout: 120000 });
const hot = await S(() => { const s = window.__studio, m = s.editor.world.get('mug'); let col = ''; m.object.traverse((o) => { if (o.isMesh && !col) col = o.material.color.getHexString(); }); return { y: m.object.position.y, col, status: s.code.status }; });
check('Apply while playing hot-reloads: the mug (a dynamic body, so gravity pulls against the script) rises and turns magenta', hot.y > y0 + 0.008 && hot.col === 'ff00ff' && /hot-reloaded/.test(hot.status), JSON.stringify({ y0, ...hot }));

// 4. a runaway loop is stopped, the game keeps running and the error points at the line
await S(() => { window.__os.key('KeyA', 'a', { ctrl: true }); window.__os.type('function update(dt) {\nlet i = 0;\nwhile (true) { i++; }\n}'); window.__os.key('KeyS', 's', { ctrl: true }); });
const t0 = await S(() => window.__studio.runtime.time);
await frames(20);
const loop = await S(() => { const s = window.__studio; return { t: s.runtime.time, prob: s.gameplay.scriptProblems.at(-1) }; });
check('an endless loop is stopped with an error on its line; the game keeps running', loop.t > t0 && loop.prob?.line === 3 && /loop ran/.test(loop.prob.message), JSON.stringify(loop));

// 5. Stop restores what scripts changed; versions keep each Apply with a diff
await S(() => window.__studio.runtime.stop());
const restored = await S(() => { const m = window.__studio.editor.world.get('mug'); let col = ''; m.object.traverse((o) => { if (o.isMesh && !col) col = o.material.color.getHexString(); }); return { y: m.object.position.y, col }; });
check('Stop puts the mug back (position and colour)', Math.abs(restored.y - y0) < 0.02 && restored.col !== 'ff00ff', JSON.stringify(restored));
const vers = await S(async () => { const s = window.__studio, c = s.code; window.__os.button('Versions'); window.__os.draw(); const n = c.versions.length; const t = await c.versions[1].text(); c.showDiff('v', t, c.cur.buf.text); window.__os.draw(); return { n, diff: c.diff.stats }; });
check('Versions lists each applied version and diffs it against the editor', vers.n >= 3 && vers.diff.added > 0 && vers.diff.removed > 0, JSON.stringify(vers));
// undo in Studio brings the previous script back
const und = await S(() => { const s = window.__studio, id = s.code.cur.key; s.editor.undo(); return /moveBy\(0, 0.2/.test(s.gameplay.scripts.get(id).source); });
check('editor Undo restores the previous script version', und);

// 6. project files (dev server only)
const proj = await S(async () => { const c = window.__studio.code; for (let i = 0; i < 50 && c.project.state === 'checking'; i++) await new Promise((r) => setTimeout(r, 100)); return { state: c.project.state, canWrite: c.project.canWrite, n: c.project.files.length, reason: c.project.reason }; });
if (proj.state !== 'ready') {
	check('without the dev server, project files are reported unavailable (not faked)', proj.state === 'unavailable' && /dev server/.test(proj.reason), JSON.stringify(proj));
} else {
	check('dev server: project file list is served from the allowlist', proj.n > 20 && proj.canWrite, JSON.stringify(proj));
	const F = 'docs/zz-e2e-code.md';
	fs.writeFileSync(F, 'line one\nline two\n');
	await S(async (F) => { const c = window.__studio.code; await c.project.refresh(); await c.openFile(F); window.__os.click(700, 200); window.__os.key('End', '', { ctrl: true }); window.__os.type('edited in VR\n'); window.__os.key('KeyS', 's', { ctrl: true }); }, F);
	const dlg = await S(() => window.__studio.code.confirm?.msg ?? null);
	check('saving a project file asks for confirmation first', !!dlg && /checkpoint/.test(dlg), dlg);
	await S(async () => { window.__os.key('Enter', 'Enter'); for (let i = 0; i < 40 && window.__studio.code.busy; i++) await new Promise((r) => setTimeout(r, 100)); });
	const disk = fs.readFileSync(F, 'utf8');
	const hist = fs.existsSync('.studio/history') ? fs.readdirSync('.studio/history').length : 0;
	check('confirmed save writes the file and keeps a checkpoint', disk.includes('edited in VR') && hist > 0, JSON.stringify({ disk, hist }));
	// a change on disk meanwhile is detected, nothing is overwritten
	fs.writeFileSync(F, 'changed by someone else\n');
	await S(async () => { window.__os.type('more\n'); window.__os.key('KeyS', 's', { ctrl: true }); window.__os.key('Enter', 'Enter'); for (let i = 0; i < 40 && window.__studio.code.busy; i++) await new Promise((r) => setTimeout(r, 100)); });
	const conflict = { disk: fs.readFileSync(F, 'utf8'), status: await S(() => window.__studio.code.status) };
	check('a file changed on disk since opening is not overwritten (conflict reported)', conflict.disk === 'changed by someone else\n' && /changed on disk/.test(conflict.status), JSON.stringify(conflict));
	// restore the checkpoint (confirmed)
	await S(async () => { const c = window.__studio.code; await c.reloadFromDisk(c.cur); c.loadVersions(); for (let i = 0; i < 30 && !c.versions.length; i++) await new Promise((r) => setTimeout(r, 100)); c.versions.at(-1).restore(); window.__os.draw(); window.__os.key('Enter', 'Enter'); for (let i = 0; i < 30 && !/Restored/.test(c.status); i++) await new Promise((r) => setTimeout(r, 100)); });
	check('restoring a checkpoint puts the old content back on disk', fs.readFileSync(F, 'utf8') === 'line one\nline two\n', JSON.stringify(fs.readFileSync(F, 'utf8')));
	// real type check
	await S(async () => { window.__studio.code.side = 'project'; window.__os.button('Type check'); for (let i = 0; i < 1200 && window.__studio.code.busy; i++) await new Promise((r) => setTimeout(r, 100)); });
	const out = await S(() => window.__studio.code.output);
	check('Type check runs the real tsc and shows its exit code', !!out && out.code === 0 && out.label.includes('tsc'), JSON.stringify(out && { code: out.code, ms: out.ms, out: out.out.slice(0, 200) }));
	fs.unlinkSync(F);
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
