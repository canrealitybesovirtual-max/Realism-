// Assistant + Profiler checks.
//   node scripts/e2e-agent.mjs --url http://localhost:4173/
//
// The assistant is exercised with a TEST DOUBLE of claude.ai's `sample`
// capability (injected below, returning fixed proposals) - this checks the
// page's side: preview, validation, confirmation, the all-or-nothing apply
// and undo. It does not call Claude; a real answer needs claude.ai or the dev
// server with ANTHROPIC_API_KEY.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];

const GOOD = {
	summary: 'Spin the mug and add a green crate',
	ops: [
		{ op: 'script', id: 'spin', script: { id: 'spin', name: 'Spin', source: 'function update(dt) {\n  self.rotateBy(0, 90 * dt, 0);\n}' } },
		{ op: 'comp', id: 'mug', ctype: 'Script', data: { script: 'spin' } },
		{ op: 'spawn', id: 'agent-crate', spec: { kind: 'box', dynamic: false, size: [0.3, 0.3, 0.3] }, to: { p: [0, 0.15, 1.2], r: [0, 0, 0], s: [1, 1, 1] }, color: '#2e8b57' },
	],
};
const BAD = { summary: 'Sneaky', ops: [{ op: 'script', id: 'x', script: { id: 'x', name: 'X', source: 'function start() { fetch("https://example.com") }' } }] };

/** a minimal GLB with `tris` triangles, `s` metres across */
function glb(s, tris) {
	const pos = new Float32Array(tris * 9);
	for (let t = 0; t < tris; t++) { const a = (t / tris) * Math.PI * 2, b = ((t + 1) / tris) * Math.PI * 2; pos.set([0, s, 0, Math.cos(a) * s / 2, 0, Math.sin(a) * s / 2, Math.cos(b) * s / 2, 0, Math.sin(b) * s / 2], t * 9); }
	const bin = Buffer.from(pos.buffer);
	let jb = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ bufferView: 0, componentType: 5126, count: tris * 3, type: 'VEC3', min: [-s / 2, 0, -s / 2], max: [s / 2, s, s / 2] }], bufferViews: [{ buffer: 0, byteLength: bin.length }], buffers: [{ byteLength: bin.length }] }));
	jb = Buffer.concat([jb, Buffer.alloc((4 - (jb.length % 4)) % 4, 0x20)]);
	const head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
	const total = 12 + 8 + jb.length + 8 + bin.length;
	head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
	jh.writeUInt32LE(jb.length, 0); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
	const out = Buffer.concat([head, jh, jb, bh, bin]);
	return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
}

async function open(withClaude) {
	const p = await b.newPage({ viewport: { width: 900, height: 600 } });
	p.on('pageerror', (e) => errors.push(e.message));
	if (withClaude) await p.addInitScript(([good, bad]) => {
		// test double of claude.ai's sample capability
		window.__asked = [];
		const sample = async (prompt, opts) => { window.__asked.push(prompt); const text = JSON.stringify(/sneaky/i.test(prompt) ? bad : good); opts?.onText?.({ text, delta: text }); return { text, truncated: false }; };
		window.claude = { use: async (n) => (n === 'sample' ? sample : null) };
	}, [GOOD, BAD]);
	await p.goto(url + '?noao');
	await p.waitForFunction(() => window.__studio?.ready, null, { timeout: 600000 });
	await p.evaluate(() => document.getElementById('overlay')?.classList.add('hidden'));
	await p.evaluate(() => {
		const s = window.__studio, os = s.computer.os;
		window.__os = {
			draw() { os.invalidate(); os.render(performance.now()); },
			key(code, key = '', mods = {}) { os.key({ code, key, shift: !!mods.shift, ctrl: !!mods.ctrl, alt: false, meta: false }); this.draw(); },
			type(str) { for (const ch of str) os.key({ code: 'Key', key: ch, shift: false, ctrl: false, alt: false, meta: false }); this.draw(); },
		};
	});
	return p;
}
const frames = (p, n) => p.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

// ---------------------------------------------------------------- assistant
{
	const p = await open(true);
	const S = (fn, a) => p.evaluate(fn, a);
	await S(() => { const s = window.__studio; s.computer.os.openApp('assistant'); s.editor.select(s.editor.world.get('mug')); window.__os.draw(); });
	await p.waitForFunction(() => window.__studio.assistant.backend === 'claude.ai', null, { timeout: 15000 });
	await S(async () => { window.__os.type('make the mug spin and add a crate'); window.__os.key('Enter', 'Enter'); for (let i = 0; i < 50 && !window.__studio.assistant.proposal; i++) await new Promise((r) => setTimeout(r, 50)); window.__os.draw(); });
	const prop = await S(() => { const a = window.__studio.assistant; return { steps: a.steps.map((s) => s.status), diff: a.steps[0]?.diff?.added, asked: window.__asked[0] ?? '' }; });
	check('typed request goes to Claude with the scene and selection in the prompt', /REQUEST: make the mug spin/.test(prop.asked) && /Selected: mug/.test(prop.asked) && /mug \| /.test(prop.asked));
	check('proposal is previewed step by step (all steps valid, new 3-line script shown as +3)', prop.steps.join() === 'ok,ok,ok' && prop.diff === 3, JSON.stringify(prop));
	const before = await S(() => ({ crate: !!window.__studio.editor.world.get('agent-crate'), comps: window.__studio.editor.world.get('mug').components.length }));
	check('nothing changes before approval', !before.crate && before.comps === 0, JSON.stringify(before));
	await S(() => { const a = window.__studio.assistant; a.confirmApply = true; window.__os.draw(); window.__os.key('Enter', 'Enter'); });
	const after = await S(() => { const s = window.__studio; const c = s.editor.world.get('agent-crate'); return { crate: !!c && !c.deleted, script: s.gameplay.scripts.has('spin'), comp: s.editor.world.get('mug').components.some((x) => x.type === 'Script'), undo: s.editor.history.undoLabel, status: s.assistant.status }; });
	check('approved proposal is applied as one transaction (one undo step)', after.crate && after.script && after.comp && /^Claude:/.test(after.undo), JSON.stringify(after));
	await S(() => window.__studio.runtime.play());
	const r0 = await S(() => window.__studio.editor.world.get('mug').object.rotation.y);
	await frames(p, 30);
	const r1 = await S(() => window.__studio.editor.world.get('mug').object.rotation.y);
	check('the applied script runs on the mug while playing', Math.abs(r1 - r0) > 0.01, `${r0.toFixed(3)} → ${r1.toFixed(3)}`);
	await S(() => { window.__studio.runtime.stop(); window.__studio.editor.undo(); });
	const undone = await S(() => { const s = window.__studio; const c = s.editor.world.get('agent-crate'); return { crate: !!c && !c.deleted, script: s.gameplay.scripts.has('spin'), comps: s.editor.world.get('mug').components.length }; });
	check('one Undo reverts the whole proposal', !undone.crate && !undone.script && undone.comps === 0, JSON.stringify(undone));
	// a proposal containing code that breaks the script rules cannot be applied
	await S(async () => { const a = window.__studio.assistant; await a.ask('sneaky: send data somewhere'); window.__os.draw(); });
	const bad = await S(() => { const a = window.__studio.assistant; const n = window.__studio.editor.history.undoLabel; a.apply(); return { steps: a.steps.map((s) => s.status + ':' + (s.why ?? '')), status: a.status, unchanged: window.__studio.editor.history.undoLabel === n && !window.__studio.gameplay.scripts.has('x') }; });
	check('a proposal with a rule-breaking script is marked invalid and cannot be applied', bad.steps[0].startsWith('error') && /fetch/.test(bad.steps[0]) && bad.unchanged, JSON.stringify(bad));
	await p.close();
}
{
	// no claude.ai and no dev-server key: the assistant says it is unavailable
	const p = await open(false);
	await p.waitForTimeout(500);
	const st = await p.evaluate(async () => { const a = window.__studio.assistant; for (let i = 0; i < 40 && a.project.state === 'checking'; i++) await new Promise((r) => setTimeout(r, 100)); await a.ask('anything'); return { backend: a.backend, status: a.status }; });
	check('without claude.ai or a server key the assistant reports unavailable (no fake answer)', st.backend === null && /Unavailable|Looking/.test(st.status), JSON.stringify(st));

	// ---------------------------------------------------------------- profiler
	const S = (fn, a) => p.evaluate(fn, a);
	await S(() => { window.__studio.computer.os.openApp('profiler'); window.__os.draw(); });
	await frames(p, 60);
	const av = await S(() => window.__studio.diag.averages());
	check('profiler measures frame sections, draw calls and triangles', av && av.ms.frame > 0 && av.ms.render > 0 && av.calls > 10 && av.tris > 1000, JSON.stringify(av && { frame: av.ms.frame.toFixed(2), calls: Math.round(av.calls), tris: Math.round(av.tris) }));
	const costs = await S(() => window.__studio.diag.costs().slice(0, 3).map((c) => `${c.e.name}:${c.tris}`));
	check('expensive objects are ranked by triangles', costs.length === 3, costs.join(', '));
	await S(() => { const d = window.__studio.diag; d.setOverlay('colliders', true); d.setOverlay('bounds', true); d.setOverlay('frustum', true); });
	await frames(p, 20);
	const ov = await S(() => { const sc = window.__studio.scene; const col = sc.getObjectByName('diag-colliders'); const bounds = sc.getObjectByName('diag-bounds'); return { colliderVerts: col?.geometry.attributes.position?.count ?? 0, bounds: bounds?.children.length ?? 0, frustum: sc.children.some((c) => c.type === 'CameraHelper') }; });
	check('overlays draw Rapier colliders, entity bounds and the viewport frustum', ov.colliderVerts > 100 && ov.bounds > 5 && ov.frustum, JSON.stringify(ov));
	await S(() => { const d = window.__studio.diag; d.setOverlay('colliders', false); d.setOverlay('bounds', false); d.setOverlay('frustum', false); });
	const gone = await S(() => { const sc = window.__studio.scene; return !sc.getObjectByName('diag-colliders') && !sc.getObjectByName('diag-bounds') && !sc.children.some((c) => c.type === 'CameraHelper'); });
	check('overlays are removed when switched off', gone);
	// baseline, then a real load increase -> regression flagged
	await S(() => window.__studio.diag.captureBaseline(1.5));
	await p.waitForFunction(() => !window.__studio.diag.capturingBaseline && window.__studio.diag.baseline, null, { timeout: 60000 });
	await S(() => { const s = window.__studio, T = s.THREE; const g = new T.Group(); g.name = 'load-test'; for (let i = 0; i < 400; i++) { const m = new T.Mesh(new T.SphereGeometry(0.05, 48, 32), new T.MeshStandardMaterial()); m.position.set((i % 20) * 0.1, 1 + Math.floor(i / 20) * 0.1, -1); g.add(m); } s.scene.add(g); });
	await frames(p, 130);
	const regs = await S(() => window.__studio.diag.regressions().map((r) => `${r.what} +${r.pct.toFixed(0)}%`));
	check('adding 400 meshes is flagged as a regression (draw calls / triangles)', regs.some((r) => /draw calls|triangles/.test(r)), regs.join(', '));
	await S(() => { const s = window.__studio; s.scene.remove(s.scene.getObjectByName('load-test')); });

	// ---------------------------------------------------------------- assets
	await S(() => { window.__studio.computer.os.openApp('assets'); window.__os.draw(); });
	await p.waitForFunction(() => window.__studio.assets.ready, null, { timeout: 30000 });
	const imp = await S(async (bytes) => {
		const a = window.__studio.assetsApp, buf = new Uint8Array(bytes).buffer;
		await a.importFile({ name: 'pyramid.glb', arrayBuffer: async () => buf });
		const ok = a.status;
		await a.importFile({ name: 'evil.glb', arrayBuffer: async () => new TextEncoder().encode('<script>alert(1)</script>').buffer });
		return { ok, bad: a.status, list: window.__studio.assets.list.map((x) => x.name + ':' + x.tris) };
	}, [...new Uint8Array(glb(2, 4))]);
	check('a valid GLB is imported after checks; a fake one is refused', /Imported pyramid/.test(imp.ok) && /Refused evil.glb: not a GLB/.test(imp.bad) && imp.list.includes('pyramid:4'), JSON.stringify(imp));
	const placed = await S(() => { const s = window.__studio, a = s.assetsApp; a.placeAsset(s.assets.list[0].id); const e = s.editor.world.list.find((x) => x.spawn?.kind === 'asset' && !x.deleted); return e ? { id: e.id, name: e.name, prop: !!e.prop } : null; });
	check('placing the model spawns it in the world with a physics body', !!placed && placed.name === 'pyramid' && placed.prop, JSON.stringify(placed));
	const round = await S(async (id) => { const s = window.__studio, ed = s.editor; ed.save('asset-test'); ed.resetToBuilt(); const gone = s.editor.world.get(id).deleted; const r = ed.load('asset-test'); return { gone, r, back: !s.editor.world.get(id).deleted }; }, placed?.id);
	check('scenes with imported models save and load (model kept in IndexedDB)', round.gone && round.back && round.r.skipped === 0, JSON.stringify(round));
	const pf = await S(() => { const s = window.__studio, a = s.assetsApp; s.editor.select(s.editor.world.list.find((x) => x.spawn?.kind === 'asset' && !x.deleted)); a.saveSelectionAsPrefab(); const p = s.assets.prefabs.at(-1); const n = s.editor.world.list.filter((x) => x.spawn?.kind === 'asset' && !x.deleted).length; a.placePrefab(p); return { name: p?.name, before: n, after: s.editor.world.list.filter((x) => x.spawn?.kind === 'asset' && !x.deleted).length }; });
	check('save as prefab, then place the prefab', pf.name === 'pyramid' && pf.after === pf.before + 1, JSON.stringify(pf));
	const env = await S(() => { const s = window.__studio, r = s.renderer, e0 = r.toneMappingExposure; s.editor.apply({ op: 'env', id: 'environment', key: 'exposure', value: 1.6 }); const e1 = r.toneMappingExposure; s.editor.undo(); return { e0, e1, e2: r.toneMappingExposure }; });
	check('environment exposure changes live and undoes', env.e1 === 1.6 && env.e2 === env.e0, JSON.stringify(env));
	await p.close();
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
