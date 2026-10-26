// Emulated-Quest walkthrough of the rally add-on in VR: Door app -> door (A)
// -> snowy mountain -> car (A) -> gas / steer / brake -> get out (B).
//   npm run dev & node scripts/e2e-rally-vr.mjs [--url ...] [--map highway]   (several minutes in software GL)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : (process.env.URL || 'http://localhost:5173/');
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 900, height: 900 } });
const errs = [];
// --map highway runs the same walk on the highway
const mapId = args.includes('--map') ? args[args.indexOf('--map') + 1] : 'rally';
p.on('pageerror', (e) => { errs.push(e.message); console.log('[pageerror]', e.message); });
p.on('console', (m) => { if (m.type() === 'error') { errs.push(m.text()); console.log('[error]', m.text().slice(0, 300)); } });
await p.goto(url + '?emulate&noao');
await p.waitForFunction(() => window.__studio?.ready && window.__rally, null, { timeout: 600000 });
await p.click('#VRButton', { timeout: 180000 });
await p.waitForFunction(() => window.__studio.renderer.xr.isPresenting, null, { timeout: 60000 });
const frames = (n) => p.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await p.evaluate((mapId) => {
  const s = window.__studio, d = window.__iwer, THREE = s.THREE;
  window.__look = (from, to) => {
    const rig = s.xr.rig; rig.updateMatrixWorld(true);
    const local = rig.worldToLocal(new THREE.Vector3(...from));
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...from), new THREE.Vector3(...to), new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m).premultiply(rig.getWorldQuaternion(new THREE.Quaternion()).invert());
    d.position.set(local.x, local.y, local.z); d.quaternion.set(q.x, q.y, q.z, q.w);
  };
  window.__btn = (hand, name, v) => window.__iwer.controllers[hand].updateButtonValue(name, v);
  // pick the rally card by id (the Door app has several destinations)
  const door = s.computer.os.apps.get('door'), r = { x: 0, y: 0, w: 1180, h: 760 }, k = door.cards(r).find((c) => c.d.id === mapId);
  door.pointerDown(k.x + k.w / 2, k.y + k.h / 2, r);
}, mapId);
const press = async (hand, name) => { await p.evaluate(([h, n]) => window.__btn(h, n, 1), [hand, name]); await frames(3); await p.evaluate(([h, n]) => window.__btn(h, n, 0), [hand, name]); await frames(2); };
// stand a metre from the door, facing it
const door = await p.evaluate(() => { const s = window.__studio; const b = new s.THREE.Box3().setFromObject(s.scene.getObjectByName('door')); const c = b.getCenter(new s.THREE.Vector3()); return c.toArray(); });
console.log('door at', door.map((v) => v.toFixed(2)).join(','));
const dir = await p.evaluate(() => { const s = window.__studio; const b = new s.THREE.Box3().setFromObject(s.scene.getObjectByName('door')); const sz = b.getSize(new s.THREE.Vector3()); return sz.x < sz.z ? 'x' : 'z'; });
const stand = dir === 'x' ? [door[0] + (door[0] > 0 ? -1.1 : 1.1), 1.6, door[2]] : [door[0], 1.6, door[2] + (door[2] > 0 ? -1.1 : 1.1)];
await p.evaluate(([a, c]) => window.__look(a, [c[0], 1.5, c[2]]), [stand, door]);
await frames(6);
check('vr: standing at the door shows the in-headset hint', await p.evaluate(() => window.__studio.scene.getObjectByName('rally-vr-hint').visible));
await p.screenshot({ path: 'shots/vr_door.png', timeout: 300000 });
await press('right', 'a-button');
await p.waitForFunction(() => window.__rally.mode === 'foot', null, { timeout: 600000 });
await frames(30);
const st = await p.evaluate(() => { const s = window.__studio; const h = new s.THREE.Vector3().setFromMatrixPosition(s.camera.matrixWorld); const m = window.__rally.map; return { head: h.toArray().map((v) => +v.toFixed(2)), ground: +m.groundAt(h.x - 4000, h.z).h.toFixed(2), car: [m.car.x + 4000, m.car.y, m.car.z].map((v) => +v.toFixed(2)) }; });
const sp = await p.evaluate(() => { const m = window.__rally.map; return [m.spawn.x + 4000, m.spawn.z]; });
check(`vr: A at the door takes you to the ${mapId === 'highway' ? 'highway' : 'mountain'}, standing at the spawn`, Math.hypot(st.head[0] - sp[0], st.head[2] - sp[1]) < 0.5 && Math.abs(st.head[1] - st.ground - 1.6) < 0.1, JSON.stringify(st));
await p.screenshot({ path: `shots/vr_${mapId}.png`, timeout: 300000 });
// walk (teleport the headset) next to the car, face it, press A
await p.evaluate((c) => { const m = window.__rally.map; const y = m.groundAt(c[0] - 4000 + 2.5, c[2]).h + 1.6; window.__look([c[0] + 2.5, y, c[2]], [c[0], y - 0.5, c[2]]); }, st.car);
await frames(6);
await press('right', 'a-button');
await p.waitForFunction(() => window.__rally.mode === 'drive', null, { timeout: 120000 });
// sit naturally: head at standing-height origin looking forward in the rig
await frames(20);
const seat = await p.evaluate(() => { const s = window.__studio, c = window.__rally.map.car; c.root.updateMatrixWorld(true); const h = new s.THREE.Vector3().setFromMatrixPosition(s.camera.matrixWorld); return { seated: s.xr.seated, local: c.root.worldToLocal(h).toArray().map((v) => +v.toFixed(2)) }; });
check("vr: A next to the car seats you at the driver's eye point", seat.seated && Math.abs(seat.local[0] - 0.36) < 0.05 && Math.abs(seat.local[1] - 1.12) < 0.05, JSON.stringify(seat));
await p.screenshot({ path: `shots/vr_cockpit_${mapId}.png`, timeout: 300000 });
await p.evaluate(() => window.__btn('right', 'trigger', 1));
await frames(120);
const drv = await p.evaluate(() => { const c = window.__rally.map.car; return { vf: +c.vf.toFixed(2), kmh: Math.round(Math.abs(c.vf) * 3.6) }; });
check('vr: right trigger accelerates the car', drv.kmh > 25, JSON.stringify(drv));
await p.evaluate(() => window.__iwer.controllers.left.updateAxes('thumbstick', -0.8, 0));
await frames(40);
const steer = await p.evaluate(() => window.__rally.map.car.steer);
check('vr: left stick to the left steers left', steer > 0.2, steer.toFixed(3));
await p.screenshot({ path: `shots/vr_driving_${mapId}.png`, timeout: 300000 });
await p.evaluate(() => { window.__iwer.controllers.left.updateAxes('thumbstick', 0, 0); window.__btn('right', 'trigger', 0); window.__btn('left', 'trigger', 1); });
await p.evaluate(() => new Promise((r) => { const f = () => { const c = window.__rally.map.car; if (Math.abs(c.vf) < 1) { window.__btn('left', 'trigger', 0); r(); } else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
check('vr: left trigger brakes to a stop', true);
await p.evaluate(() => window.__btn('left', 'trigger', 0));
await press('right', 'b-button');
await p.waitForFunction(() => window.__rally.mode === 'foot', null, { timeout: 120000 });
await frames(10);
const out = await p.evaluate(() => { const r = window.__studio.xr.rig; const up = new window.__studio.THREE.Vector3(0, 1, 0).applyQuaternion(r.quaternion); return { seated: window.__studio.xr.seated, mode: window.__rally.mode, upY: +up.y.toFixed(4) }; });
check('vr: B gets you out, standing level beside the car', !out.seated && out.mode === 'foot' && out.upY > 0.9999, JSON.stringify(out));
// the input-profiles CDN is unreachable in some sandboxes; that is not an app error
const real = errs.filter((e) => !/ERR_TUNNEL|ERR_NAME|Failed to load resource/.test(e));
check('vr: no runtime errors', real.length === 0, real.slice(0, 3).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`
${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
