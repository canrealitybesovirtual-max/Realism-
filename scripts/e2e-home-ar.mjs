// AR Home in an emulated Quest 3 (IWER): editing your real room through the
// passthrough. The emulator has no room scan, so the test traces the floor
// with the controller (the fallback a real headset without Space Setup also
// uses), then also feeds a scanned room (walls, window, door, couch, table)
// through the same path the headset's plane / mesh detection takes.
//   npm run dev & node scripts/e2e-home-ar.mjs [--url http://localhost:5173/]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 480, height: 300 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(url + '?emulate&noao');
await p.waitForFunction(() => window.__studio?.ready, null, { timeout: 600000 });
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('home.')) localStorage.removeItem(k); const o = document.getElementById('overlay'); if (o) o.style.display = 'none'; });
const frames = (n) => p.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const H = () => 'window.__studio.home.home';

async function startAR() {
	await p.click('#ar-button', { force: true, timeout: 180000 });
	await p.waitForFunction(() => window.__studio.renderer.xr.isPresenting && window.__studio.home.home?.ar, null, { timeout: 120000 });
	await frames(4);
}
check('an AR HOME button is offered when the headset supports immersive-ar', !!(await p.$('#ar-button')));
await startAR();
const st = await p.evaluate(() => {
	const S = window.__studio, h = S.home.home;
	return { mode: h.mode, bg: S.scene.background, clearA: S.renderer.getClearAlpha(), modelHouse: h.stash?.house.root.visible, seated: S.xr.seated, state: h.ar.state };
});
check('AR starts on your room: passthrough background, the model house put away, stick walking off', st.mode === 'real' && st.bg === null && st.clearA === 0 && st.modelHouse === false && st.seated, JSON.stringify(st));

// no room scan in the emulator: it falls back to tracing the floor
await p.waitForFunction(() => window.__studio.home.home.ar.state === 'tracing', null, { timeout: 30000 }).catch(() => {});
check('without a room scan it asks you to trace the floor', await p.evaluate(() => window.__studio.home.home.ar.state === 'tracing'), await p.evaluate(() => window.__studio.home.home.status.text));

// point the right controller at four floor corners (rig space) and pull the trigger at each
const corners = [[-1.5, -3.2], [1.6, -3.2], [1.6, -0.6], [-1.5, -0.6]];
const aimAt = (x, z) => p.evaluate(([x, z]) => {
	const S = window.__studio, T = S.THREE, d = window.__iwer, rig = S.xr.rig;
	const from = new T.Vector3(0.2, 1.2, -0.2), to = new T.Vector3(x, 0, z);
	// emulator poses are in the reference space = rig space
	d.controllers.right.position.set(from.x, from.y, from.z);
	const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, -1), to.clone().sub(from).normalize());
	d.controllers.right.quaternion.set(q.x, q.y, q.z, q.w);
}, [x, z]);
const pull = async () => { await p.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 1)); await frames(3); await p.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 0)); await frames(3); };
for (const [x, z] of corners) { await aimAt(x, z); await frames(3); await pull(); }
const traced = await p.evaluate(() => { const ar = window.__studio.home.home.ar; return { n: ar.corners.length, pts: ar.corners.map((c) => [+c.x.toFixed(2), +c.z.toFixed(2)]) }; });
check('each trigger pull at a floor corner adds that corner', traced.n === 4 && traced.pts.every((q, i) => Math.hypot(q[0] - corners[i][0], q[1] - corners[i][1]) < 0.05), JSON.stringify(traced));
await aimAt(...corners[0]); await frames(3); await pull(); // back at the first corner closes the outline
const room = await p.evaluate(() => {
	const h = window.__studio.home.home, it = (id) => h.house.items.get(id);
	return { state: h.ar.state, walls: it('living.walls')?.slots.main.meshes.length, overlayVisible: it('living.walls')?.slots.main.mat.visible, w: +(h.house.rooms.living.x1 - h.house.rooms.living.x0).toFixed(2), d: +(h.house.rooms.living.z1 - h.house.rooms.living.z0).toFixed(2), info: h.ar.scanInfo };
});
check('closing the outline makes your room: 4 walls, a floor and a ceiling, all still showing the real surfaces', room.state === 'ready' && room.walls === 4 && room.overlayVisible === false && Math.abs(room.w - 3.1) < 0.1 && Math.abs(room.d - 2.6) < 0.1, JSON.stringify(room));

// the traced walls sit where the corners were (in world space)
const fit = await p.evaluate((corners) => {
	const S = window.__studio, h = S.home.home, T = S.THREE, rig = S.xr.rig;
	const floor = h.house.items.get('living.floor').object; floor.updateMatrixWorld(true);
	const box = new T.Box3().setFromObject(floor);
	const want = new T.Box3(); for (const [x, z] of corners) want.expandByPoint(rig.localToWorld(new T.Vector3(x, 0, z)));
	return { d: box.min.distanceTo(want.min) + box.max.distanceTo(want.max) };
}, corners);
check('the room overlays line up with the traced corners', fit.d < 0.08, JSON.stringify(fit));

// voice: paint your walls, floor; add furniture; mood light
const say = async (text) => { await p.evaluate((t) => { const h = window.__studio.home.home, n = performance.now(); h.voice.onFinal(t, { speechEnd: n, final: n }); }, text); await p.waitForFunction(() => !window.__studio.home.home.status.busy, null, { timeout: 60000 }); await frames(2); };
await say('paint the walls sage green');
await say('give me an oak floor');
const painted = await p.evaluate(() => { const h = window.__studio.home.home; const w = h.house.items.get('living.walls').slots.main.mat, f = h.house.items.get('living.floor').slots.main.mat; return { walls: w.visible && w.userData.finish, floor: f.visible && f.userData.finish.preset, m: h.metrics.slice(0, 2).map((m) => Math.round(m.tFirstVisible - m.tTranscript)) }; });
check('“paint the walls sage green” / “oak floor” paint over your real walls and floor', painted.walls?.color && painted.floor === 'oak', JSON.stringify(painted));
await say('add a sofa against the wall');
await say('put a plant in the corner');
const furn = await p.evaluate(() => { const h = window.__studio.home.home; return [...h.house.items.values()].filter((i) => !i.fixed).map((i) => i.kind); });
check('virtual furniture goes into your room', furn.includes('sofa') && furn.includes('plant'), JSON.stringify(furn));
await say('dim the lights and make them warmer');
const tint = await p.evaluate(() => { const t = window.__studio.camera.getObjectByName('home-ar-tint'); return { visible: t.visible, a: +t.material.uniforms.uAlpha.value.toFixed(2) }; });
check('dimmer, warmer light tints the passthrough', tint.visible && tint.a > 0.1, JSON.stringify(tint));
await say('undo');
const undone = await p.evaluate(() => +window.__studio.camera.getObjectByName('home-ar-tint').material.uniforms.uAlpha.value.toFixed(2));
check('undo takes the light back', undone < tint.a, `${undone}`);
const saved = await p.evaluate(() => !!localStorage.getItem('home.real.design.v1') && !localStorage.getItem('home.design.v1')?.includes('sage'));
check('your room’s design autosaves separately from the model house', saved);

// a scanned room through the same path the headset's room scan takes
await p.evaluate(async () => {
	const h = window.__studio.home.home, m = await import('/src/home/realRoom.ts');
	h.useScan(m.testScan(), new window.__studio.THREE.Vector3(0, 0, -2), 0.3);
});
await frames(3);
const scanned = await p.evaluate(() => {
	const h = window.__studio.home.home, it = (id) => h.house.items.get(id);
	return { couch: it('real.couch-1')?.kind, table: it('real.table-1')?.kind, win: h.house.rooms.living.windows.length, walls: it('living.walls').slots.main.mat.userData.finish.color, sofa: [...h.house.items.values()].some((i) => i.kind === 'sofa'), info: h.ar.scanInfo };
});
check('a scanned room: real couch and table become things you can refer to, and your design is replayed onto it', scanned.couch === 'real' && scanned.table === 'real' && scanned.win === 1 && !!scanned.walls && scanned.sofa, JSON.stringify(scanned));
const pickReal = async () => {
	const q = await p.evaluate(() => { const h = window.__studio.home.home; return h.question ? h.question.choices.map((c) => c.label) : null; });
	if (q) { await p.evaluate((i) => window.__studio.home.home.choose(i), q.findIndex((l) => /real/.test(l))); await p.waitForFunction(() => !window.__studio.home.home.status.busy, null, { timeout: 60000 }); await frames(2); }
	return q;
};
// look up at the ceiling, so nothing is "this"
await p.evaluate(() => { const T = window.__studio.THREE, q = new T.Quaternion().setFromEuler(new T.Euler(1.4, 0, 0)); window.__iwer.quaternion.set(q.x, q.y, q.z, q.w); });
await p.evaluate(() => window.__iwer.controllers.right.position.set(5, -5, 5)); // and point the controller away
await frames(4);
await say('make the couch blue');
const asked = await pickReal();
check('with a new sofa and your real couch, “the couch” gets one short question', asked?.length === 2 && asked.some((l) => /real couch/.test(l)), JSON.stringify(asked));
const refuse = await p.evaluate(() => window.__studio.home.home.status.text);
check('your real couch is not repainted, and it says why', /real couch/.test(refuse), refuse);
await say('add a floor lamp beside the couch');
await pickReal();
const lamp = await p.evaluate(() => {
	const h = window.__studio.home.home, l = [...h.house.items.values()].reverse().find((i) => i.kind === 'floor lamp'), c = h.house.items.get('real.couch-1');
	return l ? { d: +Math.hypot(l.object.position.x - c.object.position.x, l.object.position.z - c.object.position.z).toFixed(2), ok: h.metrics[0].verified } : null;
});
check('“add a floor lamp beside the couch” places it next to your real couch', lamp && lamp.ok && lamp.d < 1.6 && lamp.d > 0.9, JSON.stringify(lamp));

// the tablet
check('the control tablet shows above the left hand', await p.evaluate(() => window.__studio.scene.getObjectByName('home-vr-panel').visible));

// exit and come back: the room design is still there
await p.evaluate(() => window.__studio.renderer.xr.getSession().end());
await p.waitForFunction(() => !window.__studio.renderer.xr.isPresenting, null, { timeout: 30000 });
await frames(3);
const out = await p.evaluate(() => { const S = window.__studio, h = S.home.home; return { mode: h.mode, ar: h.ar, house: h.house.items.has('living.sofa'), visible: h.house.root.visible, bg: !!S.scene.background, seated: S.xr.seated, real: !!S.xr.rig.getObjectByName('home-real') }; });
check('leaving AR brings back the model house and removes your room from the scene', out.mode === 'house' && out.ar === null && out.house && out.visible && out.bg && !out.seated && !out.real, JSON.stringify(out));
await startAR();
await p.evaluate(async () => { const h = window.__studio.home.home, m = await import('/src/home/realRoom.ts'); h.useScan(m.testScan(), new window.__studio.THREE.Vector3(0, 0, -2), 0.3); });
await frames(2);
const back = await p.evaluate(() => { const h = window.__studio.home.home; return { walls: h.house.items.get('living.walls').slots.main.mat.userData.finish, lamp: [...h.house.items.values()].some((i) => i.kind === 'floor lamp') }; });
check('next time in AR your room comes back with its design', back.walls.color && back.lamp, JSON.stringify(back));
await p.evaluate(() => window.__studio.renderer.xr.getSession().end());
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('home.')) localStorage.removeItem(k); });
await b.close();
const passed = results.filter((r) => r.ok).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
