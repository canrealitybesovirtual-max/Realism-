// VR hands (emulated Quest 3): an empty hand stops at the desk even when the
// controller goes into it, and fingers close onto whatever the hand holds.
//   npm run dev & node scripts/e2e-hands-vr.mjs [--url http://localhost:5173/]
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
await p.waitForFunction(() => window.__studio?.ready && window.__studio.mags, null, { timeout: 600000 });
await p.click('#VRButton', { timeout: 180000 });
await p.waitForFunction(() => window.__studio.renderer.xr.isPresenting, null, { timeout: 60000 });
const frames = (n) => p.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await p.evaluate(() => {
	const s = window.__studio, d = window.__iwer, T = s.THREE;
	const hand = (n) => s.xr.hands.find((x) => x.source?.handedness === n);
	window.__put = (n, at, dir = [0, 0, -1]) => {
		const rig = s.xr.rig; rig.updateMatrixWorld(true);
		const c = d.controllers[n], h = hand(n);
		const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, -1), new T.Vector3(...dir).normalize()).premultiply(rig.getWorldQuaternion(new T.Quaternion()).invert());
		c.quaternion.set(q.x, q.y, q.z, q.w);
		const off = h?.grip ? h.grip.getWorldPosition(new T.Vector3()).sub(rig.localToWorld(new T.Vector3(c.position.x, c.position.y, c.position.z))) : new T.Vector3();
		const local = rig.worldToLocal(new T.Vector3(...at).sub(off));
		c.position.set(local.x, local.y, local.z);
	};
	window.__btn = (n, name, v) => d.controllers[n].updateButtonValue(name, v);
	s.runtime.play();
});
const put = async (n, at, dir) => { for (let i = 0; i < 3; i++) { await p.evaluate(([n, at, dir]) => window.__put(n, at, dir), [n, at, dir]); await frames(2); } };

// 1. push the right controller 8 cm into the desk top, palm down: the hand stays on the desk
const DESK_Y = 0.735, spot = [0.45, DESK_Y - 0.08, -1.95];
await put('right', [spot[0], DESK_Y + 0.25, spot[2]], [0, -0.6, -1]);
// one big step down, straight through the 28 mm desk top
await put('right', spot, [0, -0.6, -1]);
await frames(4);
const desk = await p.evaluate((DESK_Y) => {
	const s = window.__studio, T = s.THREE, h = s.xr.hands.find((x) => x.source?.handedness === 'right');
	const v = h.visual; v.model.root.updateMatrixWorld(true);
	const palm = new T.Vector3(0, -0.006, -0.05).applyMatrix4(v.wrist);
	let lowest = 9; v.model.mesh.skeleton.bones.forEach((bn) => { lowest = Math.min(lowest, bn.getWorldPosition(new T.Vector3()).y); });
	const grip = h.grip.getWorldPosition(new T.Vector3());
	return { gripY: +grip.y.toFixed(3), palmY: +palm.y.toFixed(3), lowestJoint: +lowest.toFixed(3), blocked: +v.blocked.toFixed(3), desk: DESK_Y };
}, DESK_Y);
check('an empty hand stops at the desk top (the controller is inside it)', desk.gripY < DESK_Y - 0.03 && desk.palmY > DESK_Y + 0.02 && desk.blocked > 0.04, JSON.stringify(desk));
// lifted clear of the desk, the hand follows the controller exactly again
await put('right', [spot[0], DESK_Y + 0.35, spot[2]], [0, -0.6, -1]);
await frames(3);
const free = await p.evaluate(() => window.__studio.xr.hands.find((x) => x.source?.handedness === 'right').visual.blocked);
check('away from surfaces the hand is not held back', free === 0, String(free));

// 2. hold the Glock in the right hand, draw a magazine from the hip pouch with the left: the fingers close onto it
const g0 = await p.evaluate(() => { const fs = window.__studio.guns.find((x) => x.gun?.spec.id === 'g17'); const t = fs.prop.body.translation(); return [t.x, t.y, t.z]; });
await put('right', [g0[0], g0[1] + 0.02, g0[2]], [1, -0.3, 0]);
await p.evaluate(() => window.__btn('right', 'squeeze', 1));
await frames(4);
const head = await p.evaluate(() => window.__studio.camera.getWorldPosition(new window.__studio.THREE.Vector3()).toArray());
await put('right', [head[0] + 0.3, head[1] - 0.25, head[2] + 0.1], [1, 0, 0]);
await frames(10);
await put('left', [head[0] - 0.05, head[1] - 0.7, head[2] + 0.15], [0, -1, 0]);
await p.evaluate(() => window.__btn('left', 'squeeze', 1));
await frames(30);
const grasp = await p.evaluate(() => {
	const s = window.__studio, T = s.THREE, h = s.xr.hands.find((x) => x.source?.handedness === 'left');
	if (!h.held) return { holding: false };
	const o = h.held.prop.desc.object; o.updateMatrixWorld(true);
	const inv = o.matrixWorld.clone().invert(), box = new T.Box3();
	o.traverse((c) => { if (c.isMesh) { c.geometry.computeBoundingBox(); box.union(c.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(c.matrixWorld))); } });
	const m = h.visual.model; m.root.updateMatrixWorld(true);
	const gaps = ['thumb', 'index', 'middle', 'ring', 'pinky'].map((f) => {
		const pts = m.jointsWorld(f, [0, 0, 0, 0, 0].map(() => new T.Vector3()));
		let best = 1;
		for (let k = 0; k < 4; k++) for (let q = 0; q <= 8; q++) best = Math.min(best, box.distanceToPoint(pts[k].clone().lerp(pts[k + 1], q / 8).applyMatrix4(inv)));
		return +(best * 1000).toFixed(1);
	});
	const inside = ['index', 'middle', 'ring', 'pinky'].filter((f) => box.containsPoint(m.tipWorld(f).applyMatrix4(inv))).length;
	return { holding: true, kind: h.held.kind, gapsMm: gaps, tipsInside: inside };
});
const touching = grasp.holding ? grasp.gapsMm.filter((g) => g < 13).length : 0;
check('a held magazine: the fingers close onto it, none through it', grasp.holding && !grasp.kind && touching >= 3 && grasp.tipsInside === 0, JSON.stringify(grasp));
await p.evaluate(() => window.__btn('left', 'squeeze', 0));
await frames(4);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
