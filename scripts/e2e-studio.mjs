// Engine / editor checks in the running game (desktop + emulated Quest 3).
//   npm run dev & node scripts/e2e-studio.mjs [--url http://localhost:5173/]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];

async function open(query) {
	const p = await b.newPage({ viewport: { width: 900, height: 600 } });
	p.on('pageerror', (e) => errors.push(e.message));
	await p.goto(url + '?' + query);
	await p.waitForFunction(() => window.__studio?.ready, null, { timeout: 600000 });
	await p.evaluate(() => document.getElementById('overlay')?.classList.add('hidden'));
	return p;
}
const frames = (p, n) => p.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

// ---------------------------------------------------------------- desktop
{
	const p = await open('noao');
	const S = (fn, arg) => p.evaluate(fn, arg);
	// 1. edit mode freezes the simulation; play runs it; stop restores the edit state
	await S(() => { const s = window.__studio; s.runtime.stop(); const m = s.editor.world.get('mug'); s.editor.apply({ op: 'trs', id: 'mug', to: { p: [m.object.position.x, 1.3, m.object.position.z], r: [0, 0, 0], s: [1, 1, 1] } }); });
	await frames(p, 30);
	const frozen = await S(() => window.__studio.editor.world.get('mug').object.position.y);
	check('runtime: edit mode freezes physics (lifted mug hangs at 1.3 m)', Math.abs(frozen - 1.3) < 1e-3, frozen.toFixed(3));
	await S(() => window.__studio.runtime.play());
	await frames(p, 60);
	const fell = await S(() => window.__studio.editor.world.get('mug').object.position.y);
	check('runtime: play runs physics (the mug falls onto the desk)', fell < 0.8, fell.toFixed(3));
	await S(() => window.__studio.runtime.stop());
	await frames(p, 3);
	const back = await S(() => window.__studio.editor.world.get('mug').object.position.y);
	check('runtime: stop restores where play started', Math.abs(back - 1.3) < 1e-3, back.toFixed(3));
	await S(() => { window.__studio.editor.undo(); });
	// 2. world tool: crosshair click selects, G carries, G places (one undoable move)
	await S(() => {
		const s = window.__studio, T = s.THREE, m = s.editor.world.get('notebook').object;
		const at = m.getWorldPosition(new T.Vector3());
		s.camera.position.set(at.x, 1.5, at.z + 0.6);
		const d = at.clone().sub(s.camera.position);
		s.desktop.yaw = Math.atan2(-d.x, -d.z); s.desktop.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
		s.editor.worldTool = true;
	});
	await frames(p, 3);
	await S(() => window.__studio.desktop.primary(true));
	const picked = await S(() => window.__studio.editor.selection.map((e) => e.id).join(','));
	check('world tool (desktop): clicking with the crosshair selects the notebook', picked === 'notebook', picked);
	const nb0 = await S(() => window.__studio.editor.world.get('notebook').object.position.toArray());
	await S(() => window.__studio.targets.editorTool.desktopKey('KeyG', false, false, window.__studio.camera));
	await S(() => { window.__studio.desktop.yaw += 0.5; });
	await frames(p, 6);
	await S(() => window.__studio.targets.editorTool.desktopKey('KeyG', false, false, window.__studio.camera));
	const nb1 = await S(() => ({ p: window.__studio.editor.world.get('notebook').object.position.toArray(), undo: window.__studio.editor.history.undoLabel }));
	const movedBy = Math.hypot(nb1.p[0] - nb0[0], nb1.p[2] - nb0[2]);
	const onGrid = nb1.p.every((v, i) => i === 1 || Math.abs(Math.round(v / 0.05) * 0.05 - v) < 1e-6);
	check('world tool (desktop): G carries it with the view and G puts it down, snapped to 5 cm', movedBy > 0.15 && onGrid && nb1.undo === 'Move Notebook', `${movedBy.toFixed(2)} m, ${JSON.stringify(nb1.p.map((v) => +v.toFixed(3)))}`);
	await S(() => window.__studio.editor.undo());
	const nb2 = await S(() => window.__studio.editor.world.get('notebook').object.position.toArray());
	check('undo puts the carried notebook back', Math.hypot(nb2[0] - nb0[0], nb2[2] - nb0[2]) < 1e-3);
	// 3. spawn a box in front of the player; it has a real body and falls in play
	const spawned = await S(() => { const s = window.__studio, T = s.THREE; s.camera.position.set(0, 1.6, 0.5); s.runtime.stop(); s.editor.spawn('box', new T.Vector3(0, 1.2, -0.2)); const e = s.editor.selection[0]; return { id: e?.id, body: !!e?.prop, y: e?.object.position.y }; });
	check('spawn: a box appears selected with a physics body', !!spawned.id && spawned.body, JSON.stringify(spawned));
	await S(() => window.__studio.runtime.play());
	await frames(p, 80);
	const landed = await S((id) => window.__studio.editor.world.get(id).object.position.y, spawned.id);
	check('spawn: the box falls and rests on the floor in play', landed > 0.1 && landed < 0.14, landed.toFixed(3));
	// 4. duplicate a prop; delete spawned at once, authored only after confirmation
	const dup = await S(() => { const s = window.__studio; s.runtime.stop(); s.editor.select(s.editor.world.get('mug')); const ids = s.editor.duplicate(); const c = s.editor.world.get(ids[0]); return { ids, body: !!c?.prop, vis: c?.object.visible, name: c?.name }; });
	check('duplicate: the mug is copied with its own body', dup.ids.length === 1 && dup.body && dup.vis, JSON.stringify(dup));
	const del = await S((id) => { const s = window.__studio; s.editor.select(s.editor.world.get(id)); const r1 = s.editor.delete(false); s.editor.select(s.editor.world.get('pen')); const r2 = s.editor.delete(false); const penVisible = s.editor.world.get('pen').object.visible; const r3 = s.editor.delete(true); return { r1, r2, penVisible, r3, penAfter: s.editor.world.get('pen').object.visible }; }, dup.ids[0]);
	check('delete: spawned copies go at once; original content needs confirming', del.r1 === 'done' && del.r2 === 'confirm' && del.penVisible && del.r3 === 'done' && !del.penAfter, JSON.stringify(del));
	// 5. save, reset, load
	const sl = await S(() => {
		const s = window.__studio, ed = s.editor;
		ed.apply({ op: 'mat', id: 'mug', mi: 0, key: 'color', value: '#2f7fb8' });
		ed.save('e2e');
		ed.resetToBuilt();
		const reset = { pen: ed.world.get('pen').object.visible, color: '#' + ed.world.materials(ed.world.get('mug'))[0].color.getHexString() };
		const r = ed.load('e2e');
		return { reset, r, pen: ed.world.get('pen').object.visible, color: '#' + ed.world.materials(ed.world.get('mug'))[0].color.getHexString() };
	});
	check('save / reset / load restores the edited scene', sl.reset.pen && sl.reset.color !== '#2f7fb8' && !sl.pen && sl.color === '#2f7fb8' && sl.r.skipped === 0, JSON.stringify(sl));
	await frames(p, 100); // autosave fires 1.5 s after a change
	const auto = await S(() => window.__studio.editor.autosaveInfo());
	check('autosave is written and offered for recovery', !!auto && auto.n > 0, JSON.stringify(auto));
	// 6. the studio viewport renders onto the monitor while the app is open
	await S(() => { const os = window.__studio.computer.os; os.openApp('studio'); os.render(performance.now()); });
	await frames(p, 5);
	const vp = await S(() => ({ visible: window.__studio.viewport.visible, rect: window.__studio.viewport.rect }));
	check('viewport: Studio open -> live view composited into the monitor', vp.visible && vp.rect.w > 300, JSON.stringify(vp));
	await p.close();
}

// ---------------------------------------------------------------- VR
{
	const p = await open('emulate&noao');
	await p.click('#VRButton', { timeout: 180000 });
	await p.waitForFunction(() => window.__studio.renderer.xr.isPresenting, null, { timeout: 60000 });
	await p.evaluate(() => {
		const s = window.__studio, d = window.__iwer, THREE = s.THREE;
		window.__aim = (hand, from, to) => {
			const rig = s.xr.rig;
			const local = rig.worldToLocal(new THREE.Vector3(...from));
			const dir = new THREE.Vector3(...to).sub(new THREE.Vector3(...from)).normalize().applyQuaternion(rig.getWorldQuaternion(new THREE.Quaternion()).invert());
			const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
			const c = d.controllers[hand]; c.position.set(local.x, local.y, local.z); c.quaternion.set(q.x, q.y, q.z, q.w);
		};
		s.runtime.stop(); // edit mode: world tool on
	});
	const mug = await p.evaluate(() => window.__studio.editor.world.get('mug').object.position.toArray());
	await p.evaluate((m) => window.__aim('right', [m[0] + 0.3, m[1] + 0.35, m[2] + 0.35], [m[0], m[1] + 0.04, m[2]]), mug);
	await frames(p, 3);
	await p.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 1));
	await frames(p, 3);
	await p.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 0));
	await frames(p, 2);
	const sel = await p.evaluate(() => window.__studio.editor.selection.map((e) => e.id).join(','));
	check('world tool (VR): trigger on the mug selects it (does not grab it)', sel === 'mug', sel);
	await p.evaluate(() => window.__iwer.controllers.right.updateButtonValue('squeeze', 1));
	await frames(p, 3);
	await p.evaluate((m) => window.__aim('right', [m[0] - 0.1, m[1] + 0.45, m[2] + 0.35], [m[0] - 0.4, m[1] + 0.04, m[2]]), mug);
	await frames(p, 6);
	await p.evaluate(() => window.__iwer.controllers.right.updateButtonValue('squeeze', 0));
	await frames(p, 3);
	const after = await p.evaluate(() => ({ p: window.__studio.editor.world.get('mug').object.position.toArray(), undo: window.__studio.editor.history.undoLabel }));
	check('world tool (VR): squeeze carries the selected mug and release places it', Math.hypot(after.p[0] - mug[0], after.p[1] - mug[1]) > 0.1 && after.undo === 'Move Mug', JSON.stringify({ from: mug.map((v) => +v.toFixed(2)), to: after.p.map((v) => +v.toFixed(2)) }));
	await p.close();
}

const real = errors.filter((e) => !/ERR_TUNNEL|Failed to load resource/.test(e));
check('no runtime errors', real.length === 0, real.slice(0, 3).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
