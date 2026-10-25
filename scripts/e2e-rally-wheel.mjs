// Rally in VR: steering with your hands on the wheel, live gauges, and the
// door home that follows you on foot.
//   npm run dev & node scripts/e2e-rally-wheel.mjs [--url http://localhost:5173/]
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
await p.waitForFunction(() => window.__studio?.ready && window.__rally, null, { timeout: 600000 });
await p.click('#VRButton', { timeout: 180000 });
await p.waitForFunction(() => window.__studio.renderer.xr.isPresenting, null, { timeout: 60000 });
const frames = (n) => p.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await p.evaluate(async () => {
	const s = window.__studio, d = window.__iwer, T = s.THREE;
	window.__put = (n, at) => {
		const rig = s.xr.rig; rig.updateMatrixWorld(true);
		const c = d.controllers[n], h = s.xr.hands.find((x) => x.source?.handedness === n);
		const off = h?.grip ? h.grip.getWorldPosition(new T.Vector3()).sub(rig.localToWorld(new T.Vector3(c.position.x, c.position.y, c.position.z))) : new T.Vector3();
		const local = rig.worldToLocal(new T.Vector3(...at).sub(off));
		c.position.set(local.x, local.y, local.z);
	};
	window.__btn = (n, name, v) => d.controllers[n].updateButtonValue(name, v);
	await window.__rally.enterMap();
});
await p.waitForFunction(() => window.__rally.mode === 'foot', null, { timeout: 600000 });
await p.evaluate(() => window.__rally.enterCar());
await p.waitForFunction(() => window.__rally.mode === 'drive', null, { timeout: 120000 });
await frames(10);
const put = async (n, at) => { for (let i = 0; i < 3; i++) { await p.evaluate(([n, at]) => window.__put(n, at), [n, at]); await frames(2); } };
// a point on the rim at `deg` (0 = top, + = toward the driver's left)
const rim = (deg) => p.evaluate((deg) => {
	const s = window.__studio, T = s.THREE, car = window.__rally.map.car, sw = car.steerWheel;
	sw.updateMatrixWorld(true);
	const c = new T.Vector3().setFromMatrixPosition(sw.matrixWorld);
	const axis = sw.userData.axis.clone().transformDirection(car.body.matrixWorld);
	const u = new T.Vector3(0, 1, 0).transformDirection(car.body.matrixWorld); u.addScaledVector(axis, -u.dot(axis)).normalize();
	const v = new T.Vector3().crossVectors(axis, u);
	const a = deg * Math.PI / 180, R = sw.userData.radius;
	return c.clone().addScaledVector(u, Math.cos(a) * R).addScaledVector(v, Math.sin(a) * R).toArray();
}, deg);

// grab the rim at the top with the right hand and turn the wheel to the left
await put('right', await rim(0));
await p.evaluate(() => window.__btn('right', 'squeeze', 1));
await frames(3);
for (let deg = 10; deg <= 90; deg += 10) { await put('right', await rim(deg)); await frames(2); }
const turned = await p.evaluate(() => { const m = window.__rally.map, c = m.car; return { wheel: Math.round(c.wheelAngle * 57.3), steer: +m.input().steer.toFixed(2) }; });
check('vr: hand on the rim turns the steering wheel and steers (left)', turned.wheel > 70 && turned.wheel < 110 && turned.steer > 0.35, JSON.stringify(turned));
// let go: the wheel follows the (centred) stick back to straight
await p.evaluate(() => window.__btn('right', 'squeeze', 0));
await frames(40);
const centred = await p.evaluate(() => Math.round(window.__rally.map.car.wheelAngle * 57.3));
check('vr: letting go, the wheel returns to centre', Math.abs(centred) < 10, String(centred));

// gauges follow the car: gas for a while
await p.evaluate(() => window.__btn('right', 'trigger', 1));
await frames(90);
const g = await p.evaluate(() => { const c = window.__rally.map.car; return { kmh: Math.round(c.gaugeKmh), rpm: Math.round(c.gaugeRpm), needles: c.needles.map((n) => n.userData.kind + ':' + Math.round(new window.__studio.THREE.Euler().setFromQuaternion(n.quaternion).toArray().slice(0, 3).reduce((a, b) => a + Math.abs(b), 0) * 57.3)) }; });
await p.evaluate(() => window.__btn('right', 'trigger', 0));
check('vr: speedometer and tachometer needles move with speed and revs', g.kmh > 10 && g.rpm > 1500 && g.needles.length === 2 && g.needles.every((n) => +n.split(':')[1] > 5), JSON.stringify(g));

// stop, get out: the door home comes to you
await p.evaluate(() => { const c = window.__rally.map.car; c.vx = c.vz = 0; c.vf = 0; return window.__rally.exitCar(); });
await p.waitForFunction(() => window.__rally.mode === 'foot', null, { timeout: 120000 });
await frames(30);
const near = await p.evaluate(() => { const s = window.__studio, m = window.__rally.map, h = s.camera.getWorldPosition(new s.THREE.Vector3()); const d = m.doorPos(); return Math.hypot(h.x - 4000 - d.x, h.z - d.z); });
check('vr: after getting out, the door home is a few steps away', near < 8, near.toFixed(1) + ' m');
// walk 40 m down the road (move the rig): the door turns up near you again
await p.evaluate(() => { const s = window.__studio; s.xr.rig.position.x += 30; s.xr.rig.position.z += 25; });
await frames(30);
const follow = await p.evaluate(() => { const s = window.__studio, m = window.__rally.map, h = s.camera.getWorldPosition(new s.THREE.Vector3()); const d = m.doorPos(); return { dist: +Math.hypot(h.x - 4000 - d.x, h.z - d.z).toFixed(1), hint: !!window.__studio.scene.getObjectByName('rally-vr-hint') }; });
check('vr: walking away, the door follows and appears near you', follow.dist < 8, JSON.stringify(follow));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
