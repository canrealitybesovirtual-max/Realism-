// Home on the desktop: your scanned room, redesigned by voice / typing.
//   npm run dev & node scripts/e2e-home.mjs [--url http://localhost:5173/]
//
// Your room comes from the headset's room scan (see e2e-home-ar.mjs). This
// test stores a scan of that shape on the page first (test data, only in this
// script). Headless Chromium has no microphone, so "voice" requests are fed in
// where the browser's speech recognition hands over its final transcript
// (home.voice.onFinal); everything after that is the real pipeline. Timing is
// measured from that hand-over with the software renderer (SwiftShader).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 640, height: 400 } });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const fetched = [];
p.on('request', (r) => fetched.push(r.url()));

// a room in the shape the room scan stores it: 4.6 x 4.0 m, window, door, couch, table
const SCAN = {
	source: 'scan', height: 2.5,
	floor: [[-2.3, -2.0], [2.3, -2.0], [2.3, 2.0], [-2.3, 2.0]], walls: [],
	openings: [{ kind: 'window', a: [-0.6, -2.0], b: [0.6, -2.0], y0: 0.9, y1: 2.1 }, { kind: 'door', a: [2.3, 0.9], b: [2.3, 1.8], y0: 0, y1: 2.05 }],
	objects: [{ label: 'couch', x: -0.4, z: 1.45, hx: 1.0, hz: 0.45, rot: 0, h: 0.85 }, { label: 'table', x: -0.4, z: 0.3, hx: 0.5, hz: 0.3, rot: 0, h: 0.45 }],
};
async function boot() {
	await p.goto(url + '?noao', { waitUntil: 'domcontentloaded', timeout: 180000 });
	await p.waitForFunction(() => window.__studio?.ready && window.__rally, null, { timeout: 600000 });
	await p.evaluate(() => { document.getElementById('overlay').style.display = 'none'; });
}
await boot();
check('Home is not downloaded or built with the office', !fetched.some((u) => /src\/home\/|home-[\w-]+\.js/.test(u)) && !(await p.evaluate(() => window.__studio.home.loaded)));
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('home.')) localStorage.removeItem(k); });
check('without a scan of your room there is no Home to enter', (await p.evaluate(async () => await window.__studio.home.enter())) === false);
await p.evaluate((s) => localStorage.setItem('home.room.scan.v1', JSON.stringify(s)), SCAN);
await boot();
const entered = await p.evaluate(async () => await window.__studio.home.enter());
await p.waitForTimeout(500);
const inside = await p.evaluate(() => {
	const S = window.__studio, h = S.home.home, c = S.camera.getWorldPosition(new S.THREE.Vector3());
	return { entered: h.active, x: +(c.x - 8000).toFixed(2), z: +c.z.toFixed(2), ui: getComputedStyle(document.getElementById('hc')).display, items: [...h.house.items.keys()], walls: h.house.items.get('room.walls').slots.main.mat.visible };
});
check('Home opens your scanned room (only what the scan has), you stand inside it, the control center is open', entered && inside.ui !== 'none' && inside.walls && Math.abs(inside.x) < 2.3 && Math.abs(inside.z) < 2 && inside.items.join() === 'room.floor,room.ceiling,room.walls,real.couch-1,real.table-1', JSON.stringify(inside));

const wallFinish = () => p.evaluate(() => JSON.stringify(window.__studio.home.home.house.items.get('room.walls').slots.main.mat.userData.finish));
const say = (text) => p.evaluate((text) => { const h = window.__studio.home.home, t = performance.now(); h.voice.onFinal(text, { speechEnd: t, final: t }); }, text);
const waitIdle = (ms = 60000) => p.waitForFunction(() => !window.__studio.home.home.status.busy, null, { timeout: ms });
const lastMetric = async () => { await p.waitForFunction(() => { const m = window.__studio.home.home.metrics[0]; return !m.ops || m.tFirstVisible > 0; }, null, { timeout: 30000 }).catch(() => {}); return p.evaluate(() => { const m = window.__studio.home.home.metrics[0]; return { ...m, first: m.tFirstVisible - (m.tSpeechEnd ?? m.tTranscript), done: m.tDone - (m.tSpeechEnd ?? m.tTranscript) }; }); };

const frameMs = await p.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => (++n < 8 ? requestAnimationFrame(f) : r(Math.round((performance.now() - t) / n))); requestAnimationFrame(f); }));
console.log(`(software renderer: ${frameMs} ms per frame in your room)`);
// ---- first milestone: "Make this room look more modern"
const w0 = await wallFinish();
await say('Make this room look more modern'); await waitIdle(); await p.waitForTimeout(300);
const m1 = await lastMetric(), w1 = await wallFinish();
const st1 = await p.evaluate(() => { const h = window.__studio.home.home; return { text: h.status.text, undo: h.designer.canUndo, saved: !!localStorage.getItem('home.room.design.v1') }; });
check('"Make this room look more modern" changes your room locally, verified, and autosaves', m1.path === 'local' && m1.verified && w1 !== w0 && st1.undo && st1.saved, JSON.stringify({ ...st1, ops: m1.ops }));
// the change shows on the second frame after it is applied, so slow software frames count twice
check('first visible change within 2 s (plus two software-rendered frames), finished within 5 s', m1.first > 0 && m1.first < 2000 + 2 * frameMs && m1.done < 5000, `first ${Math.round(m1.first)} ms, done ${Math.round(m1.done)} ms, frame ${frameMs} ms`);
await p.screenshot({ path: 'shots/home-modern.png', timeout: 120000 }).catch(() => console.log('(screenshot skipped: renderer too slow)'));
await say('undo'); await waitIdle(); const wu = await wallFinish();
await say('redo'); await waitIdle(); const wr = await wallFinish();
check('undo restores the room, redo brings the change back', wu === w0 && wr === w1);

// ---- add a chair, look at it, "make this chair blue"
await say('add an armchair by the window'); await waitIdle();
const chairId = await p.evaluate(() => [...window.__studio.home.home.house.items.values()].find((i) => i.kind === 'armchair')?.id);
if (!chairId) console.log('add armchair:', await p.evaluate(() => window.__studio.home.home.metrics[0].outcome + ' / ' + window.__studio.home.home.understood));
await p.evaluate((id) => {
	const S = window.__studio, h = S.home.home, T = S.THREE, it = h.house.items.get(id);
	const target = new T.Box3().setFromObject(it.object).getCenter(new T.Vector3()), cam = S.camera.getWorldPosition(new T.Vector3()), dir = target.clone().sub(cam);
	S.desktop.yaw = Math.atan2(-dir.x, -dir.z); S.desktop.pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
}, chairId);
await p.waitForFunction((id) => window.__studio.home.home.aimed?.id === id, chairId, { timeout: 20000 }).catch(() => {});
const aimed = await p.evaluate(() => window.__studio.home.home.aimed?.id ?? null);
await say('make this chair blue'); await waitIdle();
const chair = await p.evaluate((id) => Object.values(window.__studio.home.home.house.items.get(id).slots).map((s) => s.mat.userData.finish?.color), chairId);
check('looking at the chair you added: "make this chair blue" changes it', !!chairId && aimed === chairId && chair.some((c) => c && /^#/.test(c)), JSON.stringify({ aimed, chair }));

// ---- move with collisions, walking blocked by your real furniture
await say('move the armchair beside the couch'); await waitIdle();
const mv = await p.evaluate((id) => {
	const S = window.__studio, h = S.home.home, d = h.designer, a = h.house.items.get(id);
	const f = d.footprint(a, a.object.position.x, a.object.position.z, a.object.rotation.y);
	const hits = h.house.rooms.room.clear.filter((c) => f[0] < c[2] - 0.01 && f[2] > c[0] + 0.01 && f[1] < c[3] - 0.01 && f[3] > c[1] + 0.01);
	return { q: h.question?.say ?? null, ok: h.metrics[0].verified, hits: hits.length, pos: [a.object.position.x, a.object.position.z].map((v) => +v.toFixed(2)) };
}, chairId);
check('"move the armchair beside the couch" finds a free spot next to your real couch', mv.ok && mv.hits === 0, JSON.stringify(mv));
const walkOk = await p.evaluate(() => { const S = window.__studio, h = S.home.home, w = h.d.walk, O = 8000; return { couch: w.ok(O - 0.4, 1.45), table: w.ok(O - 0.4, 0.3), free: w.ok(O + 1.6, -1.2), outside: w.ok(O + 3, 0) }; });
check('walking is blocked by your real couch and table and by the walls', !walkOk.couch && !walkOk.table && walkOk.free && !walkOk.outside, JSON.stringify(walkOk));

// ---- cancel mid-request
const wc0 = await wallFinish(), n0 = await p.evaluate(() => window.__studio.home.home.designer.history.length);
// test hook: each step takes 15 ms, so the request is still running when "cancel" arrives
await p.evaluate(() => {
	const h = window.__studio.home.home, d = h.designer, begin = d.begin.bind(d);
	d.begin = (label) => { const tx = begin(label), apply = tx.apply.bind(tx); tx.apply = (o) => { const t = performance.now(); while (performance.now() - t < 15); return apply(o); }; return tx; };
	h.submit('make this room industrial', 'typed'); h.submit('cancel', 'button');
	window.__unhook = () => { d.begin = begin; };
});
await waitIdle();
const wc1 = await wallFinish(), n1 = await p.evaluate(() => window.__studio.home.home.designer.history.length);
const cst = await p.evaluate(() => { window.__unhook(); return window.__studio.home.home.metrics.find((m) => /industrial/.test(m.text))?.outcome; });
check('cancel stops a running request and leaves nothing half-changed', wc1 === wc0 && n1 === n0 && /cancel/i.test(cst ?? ''), JSON.stringify({ outcome: cst }));

// ---- ambiguity: an added sofa and your real couch
await say('add a sofa against the wall'); await waitIdle();
await p.evaluate(() => { window.__studio.desktop.pitch = 1.4; }); await p.waitForTimeout(400);
await say('make the couch red'); await waitIdle();
await p.waitForFunction(() => document.querySelectorAll('#hc [data-c]').length > 0, null, { timeout: 20000 }).catch(() => {});
const q = await p.evaluate(() => { const h = window.__studio.home.home; return { q: h.question?.say, n: h.question?.choices.length, buttons: document.querySelectorAll('#hc [data-c]').length }; });
await p.evaluate(() => { const h = window.__studio.home.home; h.choose(h.question.choices.findIndex((c) => !/real/.test(c.label))); }); await waitIdle();
const qa = await p.evaluate(() => { const h = window.__studio.home.home, s = [...h.house.items.values()].find((i) => i.kind === 'sofa'); return { verified: h.metrics[0].verified, c: Object.values(s.slots).map((x) => x.mat.userData.finish?.color) }; });
check('"the couch" asks one short question (your real couch or the new sofa); answering applies it', q.n === 2 && q.buttons === 2 && /real couch/.test(q.q) && qa.verified, JSON.stringify({ ...q, ...qa }));

// ---- alternatives
await say('show me three alternatives'); await waitIdle();
const alts = await p.evaluate(() => window.__studio.home.home.alts?.options.map((o) => o.label));
await say('the second one'); await waitIdle();
check('three alternatives offered; "the second one" applies it', alts?.length === 3 && (await p.evaluate(() => window.__studio.home.home.alts?.applied)) === 1, JSON.stringify(alts));

// ---- Claude path
await say('design a reading nook for someone who loves birds'); await waitIdle(120000);
const cl = await p.evaluate(() => { const h = window.__studio.home.home; return { path: h.metrics[0].path, outcome: h.metrics[0].outcome, backend: h.claudeBackend }; });
check('open-ended request goes to Claude when available, or says plainly that it is not', cl.path === 'claude' && (cl.backend ? true : /not available/i.test(cl.outcome)), JSON.stringify(cl));

// ---- speed view
await p.evaluate(() => { window.__studio.home.home.ui.openTab('perf'); });
await p.waitForFunction(() => document.querySelectorAll('#hc table tr').length > 5, null, { timeout: 20000 }).catch(() => {});
const perf = await p.evaluate(() => document.querySelectorAll('#hc table tr').length);
check('the speed view lists the timed requests', perf > 5, `${perf - 1} rows`);
await p.screenshot({ path: 'shots/home-panel.png', timeout: 120000 }).catch(() => console.log('(screenshot skipped: renderer too slow)'));

// ---- save, reload, restore
await say('save as e2e look'); await waitIdle();
const wl = await wallFinish();
await boot();
await p.evaluate(async () => { await window.__studio.home.enter(); });
const back = await p.evaluate(() => Object.keys(window.__studio.home.home.snapshots()));
check('after a page reload your room comes back with its design, and the named save is listed', (await wallFinish()) === wl && back.includes('e2e look'), JSON.stringify(back));
await say('reset'); await waitIdle();
const wReset = await wallFinish(), nReset = await p.evaluate(() => [...window.__studio.home.home.house.items.values()].filter((i) => !i.fixed).length);
await say('restore e2e look'); await waitIdle();
check('reset to your room as scanned (no paint, no added furniture), then restore the named design', /original/.test(wReset) && nReset === 0 && (await wallFinish()) === wl, wReset);

// ---- leave
await p.evaluate(() => window.__studio.home.leave());
await p.waitForTimeout(300);
const out = await p.evaluate(() => { const S = window.__studio; return { active: S.home.active, house: S.home.home.house.root.visible, ui: getComputedStyle(document.getElementById('hc')).display }; });
check('leaving returns you to the office and hides your room', !out.active && !out.house && out.ui === 'none', JSON.stringify(out));
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('home.')) localStorage.removeItem(k); });
await b.close();
const passed = results.filter((r) => r.ok).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
