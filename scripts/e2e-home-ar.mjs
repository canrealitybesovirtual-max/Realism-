// AR Home in an emulated Quest 3 (IWER): your room from the headset's room
// scan, edited by voice through the passthrough.
//
// The emulator has no room scan of its own, so after checking what happens
// without one, the test hands the page a scan through the same WebXR calls a
// Quest uses (frame.detectedPlanes / detectedMeshes / getPose). That scan is
// test data that lives only in this script.
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
const say = async (text) => { await p.evaluate((t) => { const h = window.__studio.home.home, n = performance.now(); h.voice.onFinal(t, { speechEnd: n, final: n }); }, text); await p.waitForFunction(() => !window.__studio.home.home.status.busy, null, { timeout: 60000 }); await frames(2); };

// ---- before any scan
const noScan = await p.evaluate(async () => await window.__studio.home.enter());
check('Home on the desktop refuses to show anything before your room is scanned', noScan === false);
check('an AR HOME button is offered when the headset supports immersive-ar', !!(await p.$('#ar-button')));
await p.click('#ar-button', { force: true, timeout: 180000 });
await p.waitForFunction(() => window.__studio.renderer.xr.isPresenting && window.__studio.home.home?.ar, null, { timeout: 120000 });
await p.waitForFunction(() => window.__studio.home.home.ar.state === 'noscan', null, { timeout: 30000 }).catch(() => {});
const ns = await p.evaluate(() => { const h = window.__studio.home.home; return { state: h.ar.state, house: h.house, text: h.status.text, bg: window.__studio.scene.background }; });
check('in AR with no room scan: no room is invented, it says how to scan one', ns.state === 'noscan' && ns.house === null && ns.bg === null && /scan/i.test(ns.text), JSON.stringify(ns));

// ---- the headset's room scan (test data, in the shape a Quest reports it)
await p.evaluate(() => {
	const S = window.__studio, T = S.THREE, xr = S.renderer.xr;
	const space = (m) => ({ __m: m });
	const plane = (label, orientation, m, poly) => ({ semanticLabel: label, orientation, planeSpace: space(m), polygon: poly.map(([x, z]) => ({ x, y: 0, z, w: 1 })) });
	const at = (x, y, z) => new T.Matrix4().makeTranslation(x, y, z);
	// a vertical plane: local x along the wall, local y = normal into the room
	const wall = (ax, az, bx, bz, nx, nz, y0, y1, label = 'wall') => {
		const t = new T.Vector3(bx - ax, 0, bz - az), len = t.length(); t.normalize();
		const n = new T.Vector3(nx, 0, nz), zz = new T.Vector3().crossVectors(t, n);
		const m = new T.Matrix4().makeBasis(t, n, zz).setPosition((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
		const h = (y1 - y0) / 2;
		return plane(label, 'vertical', m, [[-len / 2, -h], [len / 2, -h], [len / 2, h], [-len / 2, h]]);
	};
	const X0 = -2.3, X1 = 2.1, Z0 = -4.4, Z1 = -0.4;
	const planes = new Set([
		plane('floor', 'horizontal', at(0, 0, 0), [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]]),
		plane('ceiling', 'horizontal', at(0, 2.55, 0), [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]]),
		wall(X0, Z0, X1, Z0, 0, 1, 0, 2.55), wall(X1, Z0, X1, Z1, -1, 0, 0, 2.55), wall(X1, Z1, X0, Z1, 0, -1, 0, 2.55), wall(X0, Z1, X0, Z0, 1, 0, 0, 2.55),
		wall(-0.5, Z0, 0.7, Z0, 0, 1, 0.9, 2.1, 'window frame'),
		wall(X1, -1.6, X1, -0.7, -1, 0, 0, 2.05, 'door frame'),
		plane('table', 'horizontal', at(0.1, 0.45, -2.0), [[-0.5, -0.3], [0.5, -0.3], [0.5, 0.3], [-0.5, 0.3]]),
	]);
	// the couch as a volume (a box mesh)
	const v = []; for (const x of [-1, 1]) for (const y of [0, 0.85]) for (const z of [-0.45, 0.45]) v.push(x, y, z);
	const meshes = new Set([{ semanticLabel: 'couch', meshSpace: space(at(0.1, 0, -0.95)), vertices: new Float32Array(v) }]);
	const real = xr.getFrame.bind(xr);
	xr.getFrame = () => {
		const f = real(); if (!f) return f;
		return new Proxy(f, { get(t, k) {
			if (k === 'detectedPlanes') return planes;
			if (k === 'detectedMeshes') return meshes;
			if (k === 'getPose') return (s, ref) => (s && s.__m ? { transform: { matrix: s.__m.toArray() } } : t.getPose(s, ref));
			const val = t[k]; return typeof val === 'function' ? val.bind(t) : val;
		} });
	};
	window.__scanArea = { X0, X1, Z0, Z1 };
});
await p.evaluate(() => window.__studio.home.home.arRescan());
await p.waitForFunction(() => window.__studio.home.home.ar.state === 'ready', null, { timeout: 30000 }).catch(() => {});
const room = await p.evaluate(() => {
	const S = window.__studio, h = S.home.home, it = (id) => h.house?.items.get(id), T = S.THREE;
	if (!h.house) return { state: h.ar.state, text: h.status.text };
	const floor = it('room.floor').object; floor.updateMatrixWorld(true);
	const box = new T.Box3().setFromObject(floor), A = window.__scanArea, rig = S.xr.rig;
	const want = new T.Box3().expandByPoint(rig.localToWorld(new T.Vector3(A.X0, 0, A.Z0))).expandByPoint(rig.localToWorld(new T.Vector3(A.X1, 0, A.Z1)));
	return {
		state: h.ar.state, info: h.ar.scanInfo, walls: it('room.walls')?.slots.main.meshes.length, overlay: it('room.walls')?.slots.main.mat.visible,
		couch: it('real.couch-1')?.kind, table: it('real.table-1')?.kind, win: h.house.rooms.room.windows.length, door: h.house.rooms.room.doors.length,
		added: [...h.house.items.values()].filter((i) => !i.fixed).length, fit: +(box.min.distanceTo(want.min) + box.max.distanceTo(want.max)).toFixed(3),
		couchBoxDrawn: it('real.couch-1')?.object.children[0].material.colorWrite, saved: !!localStorage.getItem('home.room.scan.v1'),
	};
});
check('your scanned room appears where it really is: 4 walls, window, door, couch, table, nothing invented', room.state === 'ready' && room.walls === 4 && room.win === 1 && room.door === 1 && room.couch === 'real' && room.table === 'real' && room.added === 0 && room.fit < 0.08, JSON.stringify(room));
check('unpainted surfaces and your real furniture are not drawn over the passthrough', room.overlay === false && room.couchBoxDrawn === false);
check('the scan is kept on this device', room.saved);

// ---- talk to it
await say('paint the walls sage green');
await say('give me an oak floor');
const painted = await p.evaluate(() => { const h = window.__studio.home.home; const w = h.house.items.get('room.walls').slots.main.mat, f = h.house.items.get('room.floor').slots.main.mat; return { walls: w.visible && w.userData.finish, floor: f.visible && f.userData.finish.preset, ms: h.metrics.slice(0, 2).map((m) => Math.round(m.tFirstVisible - m.tTranscript)) }; });
check('“paint the walls sage green” / “oak floor” paint over your real walls and floor', painted.walls?.color && painted.floor === 'oak', JSON.stringify(painted));
await say('add a sofa against the wall');
await p.evaluate(() => { const T = window.__studio.THREE, q = new T.Quaternion().setFromEuler(new T.Euler(1.4, 0, 0)); window.__iwer.quaternion.set(q.x, q.y, q.z, q.w); window.__iwer.controllers.right.position.set(5, -5, 5); });
await frames(4);
await say('add a floor lamp beside the couch');
const q = await p.evaluate(() => window.__studio.home.home.question?.choices.map((c) => c.label));
if (q) { await p.evaluate((i) => window.__studio.home.home.choose(i), q.findIndex((l) => /real/.test(l))); await p.waitForFunction(() => !window.__studio.home.home.status.busy, null, { timeout: 60000 }); await frames(2); }
const lamp = await p.evaluate(() => {
	const h = window.__studio.home.home, l = [...h.house.items.values()].find((i) => i.kind === 'floor lamp'), c = h.house.items.get('real.couch-1');
	return l ? { d: +Math.hypot(l.object.position.x - c.object.position.x, l.object.position.z - c.object.position.z).toFixed(2) } : null;
});
check('“the couch” asks: your real couch or the new sofa; the lamp goes beside your real couch', q?.length === 2 && lamp && lamp.d > 0.9 && lamp.d < 1.6, JSON.stringify({ q, lamp }));
await say('make the couch blue');
const q2 = await p.evaluate(() => window.__studio.home.home.question?.choices.map((c) => c.label));
if (q2) { await p.evaluate((i) => window.__studio.home.home.choose(i), q2.findIndex((l) => /real/.test(l))); await p.waitForFunction(() => !window.__studio.home.home.status.busy, null, { timeout: 60000 }); await frames(2); }
const refuse = await p.evaluate(() => window.__studio.home.home.status.text);
check('your real couch is not repainted, and it says why', /real couch/.test(refuse), refuse);
await say('dim the lights and make them warmer');
const tint = await p.evaluate(() => { const t = window.__studio.camera.getObjectByName('home-ar-tint'); return { visible: t.visible, a: +t.material.uniforms.uAlpha.value.toFixed(2) }; });
check('dimmer, warmer light tints the passthrough', tint.visible && tint.a > 0.1, JSON.stringify(tint));
await say('undo');
const undone = await p.evaluate(() => +window.__studio.camera.getObjectByName('home-ar-tint').material.uniforms.uAlpha.value.toFixed(2));
check('undo takes the light back', undone < tint.a, `${undone}`);
check('the control tablet shows above the left hand', await p.evaluate(() => window.__studio.scene.getObjectByName('home-vr-panel').visible));

// ---- out of AR: the same room, with its design, on screen
await p.evaluate(() => window.__studio.renderer.xr.getSession().end());
await p.waitForFunction(() => !window.__studio.renderer.xr.isPresenting, null, { timeout: 30000 });
await frames(3);
const out = await p.evaluate(() => {
	const S = window.__studio, h = S.home.home, it = (id) => h.house?.items.get(id);
	return { active: h.active, ar: h.ar, walls: it('room.walls')?.slots.main.mat.userData.finish.color, wallsDrawn: it('room.walls')?.slots.main.mat.visible, ceilingDrawn: it('room.ceiling')?.slots.main.mat.visible, couchDrawn: it('real.couch-1')?.object.children[0].material.colorWrite, lamp: [...(h.house?.items.values() ?? [])].some((i) => i.kind === 'floor lamp'), bg: !!S.scene.background, seated: S.xr.seated };
});
check('after AR you are in the same room on screen, with your design, real surfaces drawn plain', out.active && out.ar === null && !!out.walls && out.wallsDrawn && out.ceilingDrawn && out.couchDrawn && out.lamp && out.bg && !out.seated, JSON.stringify(out));
await p.evaluate(() => window.__studio.home.leave());
const again = await p.evaluate(async () => { const ok = await window.__studio.home.enter(); const h = window.__studio.home.home; return { ok, lamp: [...(h.house?.items.values() ?? [])].some((i) => i.kind === 'floor lamp') }; });
check('later, Home on the desktop opens your scanned room with its design', again.ok && again.lamp, JSON.stringify(again));
await p.evaluate(() => window.__studio.home.leave());
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('home.')) localStorage.removeItem(k); });
await b.close();
const passed = results.filter((r) => r.ok).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
