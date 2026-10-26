// Home: the voice-controlled house editor, end to end in a real browser.
//   npm run dev & node scripts/e2e-home.mjs [--url http://localhost:5173/]
//
// Headless Chromium has no microphone, so "voice" requests are fed in where
// the browser's speech recognition hands over its final transcript
// (home.voice.onFinal); everything after that is the real pipeline. Latency
// is measured from that hand-over, with the software renderer (SwiftShader),
// so real GPUs are faster.
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

async function boot() {
	await p.goto(url + '?noao');
	await p.waitForFunction(() => window.__studio?.ready && window.__rally, null, { timeout: 600000 });
	await p.evaluate(() => { document.getElementById('overlay').style.display = 'none'; });
}
await boot();
check('home is not downloaded or built with the office', !fetched.some((u) => /src\/home\/|home-[\w-]+\.js/.test(u)) && !(await p.evaluate(() => window.__studio.home.loaded)));

// ---- enter through the office door (Door app destination "home") ----
await p.evaluate(async () => { await window.__studio.home.enter(); });
await p.waitForTimeout(500);
const inside = await p.evaluate(() => {
	const S = window.__studio, h = S.home.home, c = S.camera.getWorldPosition(new S.THREE.Vector3());
	const office = S.scene.children.filter((o) => o.visible && !o.userData.keepInHome && !['xr-rig', 'home'].includes(o.name) && o.type !== 'PerspectiveCamera' && !o.isLight).map((o) => o.name || o.type);
	return { active: h.active, room: h.room, x: c.x - 8000, z: c.z, ui: getComputedStyle(document.getElementById('hc')).display, office: office.slice(0, 6) };
});
check('entering puts you inside the living room with the control center open', inside.active && inside.room === 'living' && inside.ui !== 'none', JSON.stringify(inside));

const wallFinish = (room = 'living') => p.evaluate((room) => { const h = window.__studio.home.home; return JSON.stringify(Object.values(h.house.items.get(room + '.walls').slots).map((s) => s.mat.userData.finish)); }, room);
const say = (text) => p.evaluate((text) => { const h = window.__studio.home.home, t = performance.now(); h.voice.onFinal(text, { speechEnd: t, final: t }); }, text);
const waitIdle = (ms = 60000) => p.waitForFunction(() => { const h = window.__studio.home.home; return !h.status.busy; }, null, { timeout: ms });
const lastMetric = async () => { await p.waitForFunction(() => { const m = window.__studio.home.home.metrics[0]; return !m.ops || m.tFirstVisible > 0; }, null, { timeout: 30000 }).catch(() => {}); return p.evaluate(() => { const m = window.__studio.home.home.metrics[0]; return { ...m, first: m.tFirstVisible - (m.tSpeechEnd ?? m.tTranscript), done: m.tDone - (m.tSpeechEnd ?? m.tTranscript) }; }); };

// ---- first milestone: "Make this room look more modern" ----
const w0 = await wallFinish();
await say('Make this room look more modern');
await waitIdle();
await p.waitForTimeout(300);
const m1 = await lastMetric();
const w1 = await wallFinish();
const st1 = await p.evaluate(() => { const h = window.__studio.home.home; return { text: h.status.text, understood: h.understood, undo: h.designer.canUndo, saved: !!localStorage.getItem('home.design.v1') }; });
check('"Make this room look more modern" changes the room locally, verified, and autosaves', m1.path === 'local' && m1.verified && w1 !== w0 && st1.undo && st1.saved, JSON.stringify({ ...st1, ops: m1.ops }));
check('first visible change within 2 s, finished within 5 s (software renderer)', m1.first > 0 && m1.first < 2000 && m1.done < 5000, `first ${Math.round(m1.first)} ms, done ${Math.round(m1.done)} ms`);
await p.screenshot({ path: 'shots/home-modern.png', timeout: 120000 }).catch(() => console.log('(screenshot skipped: renderer too slow)'));

// ---- undo / redo ----
await say('undo'); await waitIdle();
const wu = await wallFinish();
await say('redo'); await waitIdle();
const wr = await wallFinish();
check('undo restores the room, redo brings the change back', wu === w0 && wr === w1);

// ---- point at a chair: "make this chair blue" ----
const aim = (id) => p.evaluate((id) => {
	const S = window.__studio, h = S.home.home, T = S.THREE, it = h.house.items.get(id);
	const target = new T.Box3().setFromObject(it.object).getCenter(new T.Vector3());
	const cam = S.camera.getWorldPosition(new T.Vector3());
	const dir = target.clone().sub(cam);
	S.desktop.yaw = Math.atan2(-dir.x, -dir.z); S.desktop.pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
}, id);
await aim('living.armchair');
await p.waitForFunction(() => window.__studio.home.home.aimed?.id === 'living.armchair', null, { timeout: 20000 }).catch(() => {});
const aimed = await p.evaluate(() => window.__studio.home.home.aimed?.id ?? null);
await say('make this chair blue'); await waitIdle();
const m2 = await lastMetric();
const chair = await p.evaluate(() => { const h = window.__studio.home.home; return Object.values(h.house.items.get('living.armchair').slots).map((s) => s.mat.userData.finish?.color); });
check('gaze targeting: "make this chair blue" changes the chair you look at', aimed === 'living.armchair' && m2.verified && chair.some((c) => c && /^#/.test(c)), JSON.stringify({ aimed, chair, first: Math.round(m2.first) }));

// ---- move with collisions ----
const before = await p.evaluate(() => window.__studio.home.home.house.items.get('living.armchair').object.position.toArray());
await say('move the armchair beside the window'); await waitIdle();
const mv = await p.evaluate(() => {
	const S = window.__studio, h = S.home.home, T = S.THREE, a = h.house.items.get('living.armchair');
	const box = new T.Box3().setFromObject(a.object).expandByScalar(-0.03);
	const hits = [...h.house.items.values()].filter((o) => o !== a && o.room === 'living' && !o.fixed && o.kind !== 'rug' && o.mount !== 'wall' && o.mount !== 'ceiling').filter((o) => {
		const ob = new T.Box3().setFromObject(o.object); return box.min.x < ob.max.x && box.max.x > ob.min.x && box.min.z < ob.max.z && box.max.z > ob.min.z;
	}).map((o) => o.id);
	return { pos: a.object.position.toArray(), hits, verified: h.metrics[0].verified };
});
check('"move the armchair beside the window" finds a free spot (no overlaps)', mv.verified && mv.hits.length === 0 && Math.hypot(mv.pos[0] - before[0], mv.pos[2] - before[2]) > 0.2, JSON.stringify(mv));
const walkOk = await p.evaluate(() => {
	const S = window.__studio, h = S.home.home, a = h.house.items.get('living.armchair').object.position, sofa = h.house.items.get('living.sofa').object.position, O = 8000;
	return { chair: S.home.home.d.walk.ok(O + a.x, a.z), sofa: S.home.home.d.walk.ok(O + sofa.x, sofa.z), floor: S.home.home.d.walk.ok(O + 3.5, -3.0), wall: S.home.home.d.walk.ok(O + 7, -1.0) };
});
check('walking is blocked by furniture (also where it moved) and walls', !walkOk.chair && !walkOk.sofa && walkOk.floor && !walkOk.wall, JSON.stringify(walkOk));

// ---- cancel mid-request rolls back ----
const wc0 = await wallFinish('bedroom'), undoN = await p.evaluate(() => window.__studio.home.home.designer.history.length);
await p.evaluate(() => { const h = window.__studio.home.home; h.submit('make the whole house industrial', 'typed'); h.submit('cancel', 'button'); });
await waitIdle();
const wc1 = await wallFinish('bedroom'), undoN1 = await p.evaluate(() => window.__studio.home.home.designer.history.length);
const cst = await p.evaluate(() => window.__studio.home.home.metrics.find((m) => /industrial/.test(m.text))?.outcome);
check('cancel stops a running request and leaves nothing half-changed', wc1 === wc0 && undoN1 === undoN && /cancel/i.test(cst ?? ''), JSON.stringify({ outcome: cst }));

// ---- ambiguity: one short question ----
await p.evaluate(() => { const S = window.__studio, h = S.home.home; h.placePlayer(new S.THREE.Vector3(8000 + 9.2, 0, -3), 0); });
await p.waitForFunction(() => window.__studio.home.home.room === 'kitchen', null, { timeout: 20000 }).catch(() => {});
await p.evaluate(() => { window.__studio.desktop.pitch = 1.4; }); // look at the ceiling: nothing aimed
await p.waitForTimeout(400);
await say('make the chair red'); await waitIdle();
await p.waitForFunction(() => document.querySelectorAll('#hc [data-c]').length > 0, null, { timeout: 20000 }).catch(() => {});
const q = await p.evaluate(() => { const h = window.__studio.home.home; return { room: h.room, q: h.question?.say, n: h.question?.choices.length, buttons: document.querySelectorAll('#hc [data-c]').length }; });
await p.evaluate(() => window.__studio.home.home.choose(1)); await waitIdle();
const qa = await p.evaluate(() => { const h = window.__studio.home.home; return { verified: h.metrics[0].verified, c: h.house.items.get('kitchen.chair-2').slots && Object.values(h.house.items.get('kitchen.chair-2').slots).map((s) => s.mat.userData.finish?.color) }; });
check('ambiguous "the chair" asks one short question; picking an answer applies it', q.room === 'kitchen' && q.n > 1 && q.buttons === q.n && qa.verified, JSON.stringify({ ...q, ...qa }));

// ---- alternatives ----
await say('show me three alternatives'); await waitIdle();
const alts = await p.evaluate(() => window.__studio.home.home.alts?.options.map((o) => o.label));
await say('the second one'); await waitIdle();
const alt2 = await p.evaluate(() => window.__studio.home.home.alts?.applied);
check('three alternatives offered; "the second one" applies it', alts?.length === 3 && alt2 === 1, JSON.stringify(alts));

// ---- Claude path: honest when not available ----
await say('design a reading nook for someone who loves birds'); await waitIdle(120000);
const cl = await p.evaluate(() => { const h = window.__studio.home.home; return { path: h.metrics[0].path, outcome: h.metrics[0].outcome, note: h.claudeNote(), backend: h.claudeBackend }; });
check('open-ended request goes to Claude when available, or says plainly that it is not', cl.path === 'claude' && (cl.backend ? true : /not available/i.test(cl.outcome)), JSON.stringify(cl));

// ---- speed view ----
await p.evaluate(() => { window.__studio.home.home.ui.openTab('perf'); window.__studio.home.home.ui.invalidate(); });
await p.waitForFunction(() => document.querySelectorAll('#hc table tr').length > 5, null, { timeout: 20000 }).catch(() => {});
const perf = await p.evaluate(() => document.querySelectorAll('#hc table tr').length);
check('the speed view lists the timed requests', perf > 5, `${perf - 1} rows`);
await p.screenshot({ path: 'shots/home-panel.png', timeout: 120000 }).catch(() => console.log('(screenshot skipped: renderer too slow)'));

// ---- save, reload, restore across sessions ----
await say('save as e2e look'); await waitIdle();
const designNow = await p.evaluate(() => JSON.stringify(window.__studio.home.home.designer.serialize()));
const wl = await wallFinish();
await boot();
await p.evaluate(async () => { await window.__studio.home.enter(); });
await p.waitForTimeout(300);
const back = await p.evaluate(() => { const h = window.__studio.home.home; return { snaps: Object.keys(h.snapshots()), undo: h.designer.canUndo }; });
const wl2 = await wallFinish();
check('after a page reload the design comes back, and the named save is listed', wl2 === wl && back.snaps.includes('e2e look'), JSON.stringify(back));
await say('reset'); await waitIdle();
const wReset = await wallFinish();
await say('restore e2e look'); await waitIdle();
const wRest = await wallFinish();
check('reset to the original home, then restore the named design', wReset !== wl && wRest === wl, JSON.stringify({ designLen: designNow.length }));

// ---- a door ----
await p.evaluate(() => { const S = window.__studio, h = S.home.home; h.placePlayer(new S.THREE.Vector3(8000 + 2.5, 0, -4.5), Math.PI); });
await say('open the bedroom door'); await waitIdle();
await p.waitForFunction(() => Math.abs(window.__studio.home.home.house.items.get('door.bedroom').door.leaf.rotation.y) > 1.4, null, { timeout: 30000 }).catch(() => {});
const door = await p.evaluate(() => Math.abs(window.__studio.home.home.house.items.get('door.bedroom').door.leaf.rotation.y));
check('"open the bedroom door" swings it open', door > 0.8, door.toFixed(2));

// ---- leave ----
await p.evaluate(() => window.__studio.home.leave());
await p.waitForTimeout(300);
const out = await p.evaluate(() => { const S = window.__studio; return { active: S.home.active, house: S.home.home.house.root.visible, ui: getComputedStyle(document.getElementById('hc')).display, desk: S.scene.children.some((o) => o.visible && /desk|room|workstation/i.test(o.name)) }; });
check('leaving returns you to the office and hides the house', !out.active && !out.house && out.ui === 'none', JSON.stringify(out));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await p.evaluate(() => { localStorage.removeItem('home.design.v1'); localStorage.removeItem('home.snapshots.v1'); });
await b.close();
const passed = results.filter((r) => r.ok).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
