// AR Home in an emulated Quest 3 (IWER): passthrough session, the room's
// furniture placed on the real floor, voice edits, the tablet, exit.
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
await p.evaluate(() => { localStorage.removeItem('home.design.v1'); const o = document.getElementById('overlay'); if (o) o.style.display = 'none'; });
const btn = await p.$('#ar-button');
check('an AR HOME button is offered when the headset supports immersive-ar', !!btn);
await p.click('#ar-button', { force: true, timeout: 180000 });
await p.waitForFunction(() => window.__studio.renderer.xr.isPresenting && window.__studio.home.home?.ar, null, { timeout: 120000 });
const frames = (n) => p.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await frames(6);

const st = await p.evaluate(() => {
	const S = window.__studio, h = S.home.home, s = S.renderer.xr.getSession();
	const vis = (id) => { let o = h.house.items.get(id)?.object; for (; o; o = o.parent) if (!o.visible) return false; return true; };
	return { mode: s.environmentBlendMode ?? '?', bg: S.scene.background, clearA: S.renderer.getClearAlpha(), walls: vis('living.walls'), floor: vis('living.floor'), door: vis('door.front'), sofa: vis('living.sofa'), bed: vis('bedroom.bed'), catcher: S.scene.getObjectByName('home-ar-shadows').visible, seated: S.xr.seated, placing: h.ar.placing };
});
check('passthrough: transparent background, walls/floor/doors hidden, living-room furniture shown, shadow catcher on', st.bg === null && st.clearA === 0 && !st.walls && !st.floor && !st.door && st.sofa && !st.bed && st.catcher && st.seated, JSON.stringify(st));

// while placing, the room centre follows the floor point in front of you
const pl = await p.evaluate(() => {
	const S = window.__studio, h = S.home.home, T = S.THREE, r = h.house.rooms.living;
	const c = new T.Vector3(8000 + (r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2);
	const head = S.camera.getWorldPosition(new T.Vector3()), dir = S.camera.getWorldDirection(new T.Vector3()); dir.y = 0; dir.normalize();
	const to = c.clone().sub(head); to.y = 0;
	return { dist: to.length(), ahead: to.normalize().dot(dir), reticle: S.scene.getObjectByName('home-ar-reticle').visible };
});
check('placing: the room centre sits on the floor about 1.8 m in front of you', pl.reticle && Math.abs(pl.dist - 1.8) < 0.3 && pl.ahead > 0.9, JSON.stringify(pl));

// right trigger (pointing at the floor, not the tablet) puts it down
await p.evaluate(() => {
	const d = window.__iwer; d.controllers.right.position.set(0.25, 1.1, -0.3);
	const T = window.__studio.THREE, q = new T.Quaternion().setFromEuler(new T.Euler(-1.1, 0, 0)); d.controllers.right.quaternion.set(q.x, q.y, q.z, q.w);
});
await frames(3);
await p.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 1)); await frames(3);
await p.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 0)); await frames(3);
const rigBefore = await p.evaluate(() => window.__studio.xr.rig.position.toArray());
await p.evaluate(() => { window.__iwer.position.set(0.4, 1.6, -0.5); }); await frames(4); // walk for real
const placed = await p.evaluate((rb) => { const S = window.__studio, h = S.home.home; return { placing: h.ar.placing, rigStill: S.xr.rig.position.distanceTo(new S.THREE.Vector3(...rb)) < 1e-6, text: h.status.text }; }, rigBefore);
check('right trigger places the room; it then stays put while you walk', !placed.placing && placed.rigStill, JSON.stringify(placed));

// the tablet is on the left hand
const tab = await p.evaluate(() => window.__studio.scene.getObjectByName('home-vr-panel').visible);
check('the control tablet shows above the left hand', tab);

// a voice request in AR
await p.evaluate(() => { const h = window.__studio.home.home, t = performance.now(); h.voice.onFinal('make this room look more modern', { speechEnd: t, final: t }); });
await p.waitForFunction(() => !window.__studio.home.home.status.busy, null, { timeout: 60000 });
const ed = await p.evaluate(() => { const h = window.__studio.home.home, m = h.metrics[0]; return { ok: m.verified, ops: m.ops, sofa: h.house.items.get('living.sofa').slots && Object.values(h.house.items.get('living.sofa').slots)[0].mat.userData.finish, walls: (() => { let o = h.house.items.get('living.walls').object; for (; o; o = o.parent) if (!o.visible) return false; return true; })() }; });
check('"make this room look more modern" restyles the furniture in AR (walls stay hidden)', ed.ok && ed.ops > 0 && !ed.walls, JSON.stringify(ed));

// next room
await p.evaluate(() => window.__studio.home.home.arNextRoom()); await frames(3);
const nr = await p.evaluate(() => { const h = window.__studio.home.home; const vis = (id) => { let o = h.house.items.get(id)?.object; for (; o; o = o.parent) if (!o.visible) return false; return true; }; return { room: h.room, sofa: vis('living.sofa'), table: vis('kitchen.table'), placing: h.ar.placing }; });
check('"Next room" swaps in the kitchen furniture to place', nr.room === 'kitchen' && !nr.sofa && nr.table && nr.placing, JSON.stringify(nr));

// exit AR
await p.evaluate(() => window.__studio.renderer.xr.getSession().end());
await p.waitForFunction(() => !window.__studio.renderer.xr.isPresenting, null, { timeout: 30000 });
await frames(3);
const out = await p.evaluate(() => { const S = window.__studio, h = S.home.home; return { ar: h.ar, active: h.active, walls: h.house.items.get('living.walls').object.visible, bg: !!S.scene.background, seated: S.xr.seated }; });
check('leaving AR brings the whole house back on screen', out.ar === null && out.active && out.walls && out.bg && !out.seated, JSON.stringify(out));
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await p.evaluate(() => { localStorage.removeItem('home.design.v1'); });
await b.close();
const passed = results.filter((r) => r.ok).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
