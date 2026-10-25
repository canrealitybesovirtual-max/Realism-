// Real reloading in VR (emulated Quest 3): hold the Glock, A drops the
// magazine, the other hand draws a spare at the hip and seats it at the
// magwell, then racks the slide by hand.
//   npm run dev & node scripts/e2e-reload-vr.mjs [--url http://localhost:5173/]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(url + '?emulate&noao');
await p.waitForFunction(() => window.__studio?.ready && window.__studio.mags, null, { timeout: 600000 });
await p.click('#VRButton', { timeout: 180000 });
await p.waitForFunction(() => window.__studio.renderer.xr.isPresenting, null, { timeout: 60000 });
const frames = (n) => p.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await p.evaluate(() => {
	const s = window.__studio, d = window.__iwer, T = s.THREE;
	const hand = (n) => s.xr.hands.find((x) => x.source?.handedness === n);
	// put a controller so its grip lands on a world point, with the ray along `dir`
	window.__put = (n, at, dir = [0, 0, -1]) => {
		const rig = s.xr.rig; rig.updateMatrixWorld(true);
		const c = d.controllers[n], h = hand(n);
		const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, -1), new T.Vector3(...dir).normalize()).premultiply(rig.getWorldQuaternion(new T.Quaternion()).invert());
		c.quaternion.set(q.x, q.y, q.z, q.w);
		// correct for the grip's offset from the controller origin (measured last frame)
		const off = h?.grip ? h.grip.getWorldPosition(new T.Vector3()).sub(rig.localToWorld(new T.Vector3(c.position.x, c.position.y, c.position.z))) : new T.Vector3();
		const local = rig.worldToLocal(new T.Vector3(...at).sub(off));
		c.position.set(local.x, local.y, local.z);
	};
	window.__btn = (n, name, v) => d.controllers[n].updateButtonValue(name, v);
	window.__grip = (n) => hand(n).grip.getWorldPosition(new T.Vector3()).toArray();
	s.runtime.play();
});
const put = async (n, at, dir) => { for (let i = 0; i < 3; i++) { await p.evaluate(([n, at, dir]) => window.__put(n, at, dir), [n, at, dir]); await frames(2); } };
const press = async (n, name) => { await p.evaluate(([n, b]) => window.__btn(n, b, 1), [n, name]); await frames(3); await p.evaluate(([n, b]) => window.__btn(n, b, 0), [n, name]); await frames(3); };

// pick up the Glock with the right hand
const g0 = await p.evaluate(() => { const fs = window.__studio.guns.find((x) => x.gun?.spec.id === 'g17'); const t = fs.prop.body.translation(); return [t.x, t.y, t.z]; });
await put('right', [g0[0], g0[1] + 0.02, g0[2]], [1, -0.3, 0]);
await p.evaluate(() => window.__btn('right', 'squeeze', 1));
await frames(4);
// hold it out in front at chest height, pointing at the wall (+X)
const head = await p.evaluate(() => window.__studio.camera.getWorldPosition(new window.__studio.THREE.Vector3()).toArray());
await put('right', [head[0] + 0.3, head[1] - 0.25, head[2] + 0.1], [1, 0, 0]);
await frames(30);
const held = await p.evaluate(() => { const fs = window.__studio.guns.find((x) => x.gun?.spec.id === 'g17'); return { held: fs.prop.held, magIn: fs.gun.magIn }; });
check('vr: right hand holds the Glock', held.held && held.magIn, JSON.stringify(held));

// A: magazine release
await press('right', 'a-button');
await frames(20);
const rel = await p.evaluate(() => { const s = window.__studio, fs = s.guns.find((x) => x.gun?.spec.id === 'g17'); return { magIn: fs.gun.magIn, loose: s.mags.loose.size }; });
check('vr: A drops the magazine out of the gun as an object', !rel.magIn && rel.loose >= 1, JSON.stringify(rel));

// left hand to the hip, squeeze: a spare comes out of the pouch into the hand
await put('left', [head[0] - 0.05, head[1] - 0.7, head[2] + 0.15], [0, -1, 0]);
await p.evaluate(() => window.__btn('left', 'squeeze', 1));
await frames(4);
const drawn = await p.evaluate(() => { const s = window.__studio, h = s.xr.hands.find((x) => x.source?.handedness === 'left'); return { holding: !!h.held && !!s.mags.info(h.held.prop), rounds: h.held && s.mags.info(h.held.prop)?.rounds, pouch: s.mags.pouch.get('g17').length }; });
check('vr: squeezing at the hip draws a full spare magazine into the hand', drawn.holding && drawn.rounds === 17 && drawn.pouch === 1, JSON.stringify(drawn));

// bring it to the magwell: it seats
const well = await p.evaluate(() => { const s = window.__studio, T = s.THREE, fs = s.guns.find((x) => x.gun?.spec.id === 'g17'); const P = new T.Vector3(); s.mags.seatedPose(fs).decompose(P, new T.Quaternion(), new T.Vector3()); const h = s.xr.hands.find((x) => x.source?.handedness === 'left'); const mag = h.held.prop.desc.object.getWorldPosition(new T.Vector3()); const grip = h.grip.getWorldPosition(new T.Vector3()); return { well: P.toArray(), magFromGrip: mag.sub(grip).toArray() }; });
const target = well.well.map((v, i) => v - well.magFromGrip[i]);
for (let i = 0; i < 6; i++) { await put('left', target, [0, -1, 0]); await frames(4); const done = await p.evaluate(() => window.__studio.guns.find((x) => x.gun?.spec.id === 'g17').gun.magIn); if (done) break; }
const seated = await p.evaluate(() => { const s = window.__studio, T = s.THREE, fs = s.guns.find((x) => x.gun?.spec.id === 'g17'), h = s.xr.hands.find((x) => x.source?.handedness === 'left');
	const dbg = {};
	if (h.held) { const want = s.mags.seatedPose(fs), wp = new T.Vector3(), wq = new T.Quaternion(); want.decompose(wp, wq, new T.Vector3()); const o = h.held.prop.desc.object; dbg.dist = +o.getWorldPosition(new T.Vector3()).distanceTo(wp).toFixed(3); dbg.ang = +o.getWorldQuaternion(new T.Quaternion()).angleTo(wq).toFixed(2); dbg.grip = +h.grip.getWorldPosition(new T.Vector3()).distanceTo(wp).toFixed(3); }
	return { magIn: fs.gun.magIn, mag: fs.gun.magazine, leftEmpty: !h.held, dbg }; });
check('vr: the magazine seats when the hand brings it to the magwell', seated.magIn && seated.mag === 17 && seated.leftEmpty, JSON.stringify(seated));
await p.evaluate(() => window.__btn('left', 'squeeze', 0));
await frames(4);

// rack: left hand on the slide's rear, squeeze, pull back 5 cm, let go
const slide = await p.evaluate(() => { const s = window.__studio, fs = s.guns.find((x) => x.gun?.spec.id === 'g17'), g = fs.gun; g.group.updateMatrixWorld(true); const w = g.slideGripPoint().applyMatrix4(g.group.matrixWorld).toArray(); const back = new s.THREE.Vector3(0, 0, 1).transformDirection(g.group.matrixWorld).toArray(); return { w, back, ch: g.chambered, mag: g.magazine }; });
await put('left', slide.w, [1, 0, 0]);
await p.evaluate(() => window.__btn('left', 'squeeze', 1));
await frames(3);
const gripping = await p.evaluate(() => window.__studio.xr.hands.find((x) => x.source?.handedness === 'left').manip?.kind ?? null);
for (let k = 1; k <= 5; k++) { await put('left', slide.w.map((v, i) => v + slide.back[i] * 0.012 * k), [1, 0, 0]); await frames(2); }
const back = await p.evaluate(() => window.__studio.guns.find((x) => x.gun?.spec.id === 'g17').gun.handSlide);
await p.evaluate(() => window.__btn('left', 'squeeze', 0));
await frames(20);
const racked = await p.evaluate(() => { const g = window.__studio.guns.find((x) => x.gun?.spec.id === 'g17').gun; return { ch: g.chambered, mag: g.magazine, inBattery: g.inBattery }; });
check('vr: grabbing the slide and pulling it back racks the pistol', gripping === 'slide' && back > 0.9 && racked.inBattery && racked.mag === slide.mag - 1, JSON.stringify({ gripping, back, before: slide, racked }));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
