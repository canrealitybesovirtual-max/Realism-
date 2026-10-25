// Screenshot what an emulated Quest 3 sees, with scripted controller poses.
//   node scripts/xr-shot.mjs out.png '<js run in page after entering VR>'
// The page helper __aim(hand, from[], to[]) points a controller (world coords).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [out = 'xr.png', script = ''] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 1000 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5173/?emulate&noao');
await p.waitForFunction(() => window.__studio?.ready, null, { timeout: 300000 });
await p.click('#VRButton', { timeout: 180000 });
await p.waitForFunction(() => window.__studio.renderer.xr.isPresenting, null, { timeout: 60000 });
const frames = (n) => p.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await p.evaluate(() => {
	const s = window.__studio, d = window.__iwer, THREE = s.THREE;
	window.__aim = (hand, from, to, roll = 0) => {
		const rig = s.xr.rig;
		const local = rig.worldToLocal(new THREE.Vector3(...from));
		const dir = new THREE.Vector3(...to).sub(new THREE.Vector3(...from)).normalize().applyQuaternion(rig.getWorldQuaternion(new THREE.Quaternion()).invert());
		const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
		if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), roll));
		const c = d.controllers[hand]; c.position.set(local.x, local.y, local.z); c.quaternion.set(q.x, q.y, q.z, q.w);
	};
	window.__look = (from, to) => {
		const rig = s.xr.rig;
		const local = rig.worldToLocal(new THREE.Vector3(...from));
		const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...from), new THREE.Vector3(...to), new THREE.Vector3(0, 1, 0));
		const q = new THREE.Quaternion().setFromRotationMatrix(m).premultiply(rig.getWorldQuaternion(new THREE.Quaternion()).invert());
		d.position.set(local.x, local.y, local.z); d.quaternion.set(q.x, q.y, q.z, q.w);
	};
});
await frames(3);
if (script) await p.evaluate(script);
const g0 = await p.evaluate(() => { const t = window.__studio.gun.prop.body.translation(); return [t.x, t.y, t.z]; });
await p.evaluate((g) => { window.__look([1.2, 1.55, -0.05], [2.4, 1.3, -0.32]); window.__aim("right", [g[0] - 0.3, g[1] + 0.3, g[2]], [g[0], g[1] + 0.02, g[2]]); }, g0);
await frames(3);
await p.evaluate(() => window.__iwer.controllers.right.updateButtonValue("squeeze", 1));
await frames(3);
await p.evaluate(() => window.__aim("right", [1.5, 1.3, -0.15], [3.5, 1.35, -0.4]));
await frames(30);
for (let i = 0; i < 3; i++) { await p.evaluate(() => window.__iwer.controllers.right.updateButtonValue("trigger", 1)); await frames(2); await p.evaluate(() => window.__iwer.controllers.right.updateButtonValue("trigger", 0)); await frames(12); await p.evaluate(() => window.__aim("right", [1.5, 1.3, -0.15], [3.5, 1.3 + Math.random() * 0.1, -0.35 - Math.random() * 0.15])); }
await frames(30);
await p.evaluate(() => { const e = window.__studio.gun.effects; const u = e.update.bind(e); e.update = (dt) => { u(dt); if (window.__holdFlash) { e.flash.visible = true; e.flashLight.intensity = 0.35; } }; });
await p.evaluate(() => window.__iwer.controllers.right.updateButtonValue("trigger", 1));
await p.evaluate(() => new Promise((r) => { const g = window.__studio.gun; const n = g.shotsFired; const f = () => (g.shotsFired > n ? (window.__holdFlash = true, r()) : requestAnimationFrame(f)); requestAnimationFrame(f); }));
await frames(2);
await p.screenshot({ path: out, timeout: 300000 });
await b.close(); process.exit(0);
await frames(14);
await p.screenshot({ path: out, timeout: 300000 });
await b.close();
