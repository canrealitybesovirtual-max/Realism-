// End-to-end checks in a real browser (headless Chromium + SwiftShader).
//
//   node scripts/e2e.mjs [--url http://localhost:5173/]
//
// Desktop: real keyboard events typed into the OS through DesktopControls,
//          dock clicks, physics props resting.
// WebXR:   a virtual Meta Quest 3 (IWER, ?emulate) enters VR; the right
//          controller ray clicks the monitor, the left controller tip pokes
//          keys on the 3D keyboard, the ray grabs and drops the mug, the
//          left stick walks smoothly (blocked by walls/furniture), right stick snap-turns.
// Exits non-zero if any check fails.

import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const url = (args[args.indexOf('--url') + 1] && args.includes('--url')) ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(query) {
	const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !/profiles|Failed to load resource|fetch/i.test(m.text())) errors.push(m.text()); });
	await page.goto(url + (query ? '?' + query : ''));
	await page.waitForFunction(() => window.__studio?.ready === true, null, { timeout: 300000 });
	return { page, errors };
}
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

// ====================================================================== desktop
{
	const { page, errors } = await open('');
	check('desktop: page loads without errors', errors.length === 0, errors.slice(0, 3).join(' | '));

	// put the controls into "using the computer" mode (pointer lock is not
	// available headless) and type with real keyboard events
	await page.evaluate(() => { const s = window.__studio; s.desktop.mode = 'computer'; });
	const before = await page.evaluate(() => window.__studio.computer.os.apps.get('notes').buf.text);
	await page.keyboard.type('Hello room');
	await page.keyboard.press('Enter');
	await page.keyboard.type('2+2');
	const after = await page.evaluate(() => window.__studio.computer.os.apps.get('notes').buf.text);
	check('desktop: physical keyboard types into Notes', after === before + 'Hello room\n2+2', JSON.stringify(after.slice(-16)));
	await page.keyboard.down('Shift'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift');
	await page.keyboard.press('Backspace');
	const sel = await page.evaluate(() => window.__studio.computer.os.apps.get('notes').buf.text);
	check('desktop: shift-selection + backspace edits text', sel.endsWith('Hello room\n2'), JSON.stringify(sel.slice(-12)));

	// 3D key animation follows real key presses
	await page.keyboard.down('KeyJ');
	await frames(page, 4);
	const amt = await page.evaluate(() => window.__studio.ws.keyboard.pressedAmount(window.__studio.KEY_INDEX.get('KeyJ')));
	await page.keyboard.up('KeyJ');
	await frames(page, 6);
	const amtUp = await page.evaluate(() => window.__studio.ws.keyboard.pressedAmount(window.__studio.KEY_INDEX.get('KeyJ')));
	check('desktop: real key press animates the 3D key down and back up', amt > 0.9 && amtUp < 0.05, `down=${amt.toFixed(2)} up=${amtUp.toFixed(2)}`);
	await page.keyboard.press('Backspace'); // remove the typed "j"

	// click the Calculator dock icon (OS pixel coords), then compute 7*6=
	// (icon centres come from the dock's layout: add-ons can add icons)
	const calc = await page.evaluate(() => {
		const os = window.__studio.computer.os;
		const L = os.dockLayout(), i = os.dockApps.indexOf('calculator');
		os.pointerMove(L.x + 18 + i * (L.s + L.gap) + L.s / 2, L.y + 12 + L.s / 2); os.pointerDown(); os.pointerUp();
		return os.wm.focused?.app;
	});
	check('desktop: dock click opens Calculator', calc === 'calculator', String(calc));
	await page.keyboard.type('7*6=');
	const disp = await page.evaluate(() => window.__studio.computer.os.apps.get('calculator').calc.display);
	check('desktop: Calculator computes from keyboard', disp === '42', disp);

	// screen texture actually updates
	const uploaded = await page.evaluate(async () => {
		const t = window.__studio.computer.texture; const v0 = t.version;
		window.__studio.computer.os.moveBy(40, 0);
		await new Promise((r) => { let i = 0; const f = () => (++i >= 3 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
		return t.version > v0;
	});
	check('desktop: monitor texture re-uploads when the OS changes', uploaded);

	// physics: props at rest after load, on the desk
	await frames(page, 30);
	const props = await page.evaluate(() => window.__studio.physics.props.map((p) => {
		const t = p.body.translation(), v = p.body.linvel();
		return { name: p.desc.name, y: t.y, speed: Math.hypot(v.x, v.y, v.z) };
	}));
	for (const p of props) {
		// the pistol lies on its side on the sideboard (top 0.662 m, half-width of the gun 0.016 m)
		// the pistols lie on their sides on the sideboard (top 0.662 m); the rifle on the floor
		const [lo, hi, where] = p.name === 'pistol' || p.name === 'g17' ? [0.67, 0.69, 'sideboard'] : p.name === 'awp' ? [0.01, 0.06, 'floor'] : [0.73, 0.76, 'desk'];
		check(`physics: ${p.name} rests on the ${where}`, p.y > lo && p.y < hi && p.speed < 0.02, `y=${p.y.toFixed(4)} v=${p.speed.toFixed(4)}`);
	}
	await page.close();
}

// ====================================================================== WebXR (emulated Quest 3)
{
	const { page, errors } = await open('emulate');
	const hasBtn = await page.evaluate(() => !!document.getElementById('VRButton'));
	check('xr: VR button offered by the emulated runtime', hasBtn);
	await page.click('#VRButton');
	await page.waitForFunction(() => window.__studio.renderer.xr.isPresenting, null, { timeout: 60000 });
	check('xr: immersive-vr session starts', true);
	await frames(page, 5);

	// helper in the page: aim a controller from a world position at a world target
	await page.evaluate(() => {
		const s = window.__studio; const d = window.__iwer;
		const THREE = s.THREE;
		window.__aim = (hand, from, to) => {
			const rig = s.xr.rig;
			const local = rig.worldToLocal(new THREE.Vector3(...from));
			const dir = new THREE.Vector3(...to).sub(new THREE.Vector3(...from)).normalize();
			const rigQ = rig.getWorldQuaternion(new THREE.Quaternion()).invert();
			dir.applyQuaternion(rigQ);
			const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
			const c = d.controllers[hand];
			c.position.set(local.x, local.y, local.z);
			c.quaternion.set(q.x, q.y, q.z, q.w);
		};
		window.__screenPoint = (px, py) => {
			const scr = s.ws.monitor.screen;
			const W = 0.5967, H = 0.3357;
			const v = new THREE.Vector3((px / 1920 - 0.5) * W, (0.5 - py / 1080) * H, 0.0055 + 0.0004);
			return scr.localToWorld(v).toArray();
		};
	});

	// 0. hands replace the controllers, and the trigger curls the index finger
	const handState = () => page.evaluate(() => window.__studio.xr.hands.map((h) => ({ side: h.source?.handedness, hand: !!h.visual?.model.root.visible, ctrl: h.ctrlVisuals.some((o) => o.visible), index: h.visual?.pose.index[0] ?? null })));
	await page.evaluate(() => window.__aim('right', [1.2, 1.2, 0.5], [1.2, 1.2, 2]));
	const hs0 = await handState();
	check('xr: animated hands are shown instead of controller models', hs0.every((h) => h.hand && !h.ctrl), JSON.stringify(hs0));
	await page.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 1));
	await frames(page, 6);
	const curled = (await handState()).find((h) => h.side === 'right').index;
	await page.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 0));
	await frames(page, 6);
	const relaxed = (await handState()).find((h) => h.side === 'right').index;
	check('xr: pulling the trigger curls the index finger, releasing relaxes it', curled > 70 && relaxed < 45, `flex ${curled.toFixed(0)}° -> ${relaxed.toFixed(0)}°`);

	// 1. ray-click the Sketch dock icon on the monitor
	const [iconX, iconY] = await page.evaluate(() => {
		const os = window.__studio.computer.os, L = os.dockLayout(), i = os.dockApps.indexOf('sketch');
		return [L.x + 18 + i * (L.s + L.gap) + L.s / 2, L.y + 12 + L.s / 2];
	});
	await page.evaluate(([x, y]) => { const t = window.__screenPoint(x, y); window.__aim('right', [t[0] + 0.05, t[1] + 0.1, t[2] + 0.7], t); }, [iconX, iconY]);
	await frames(page, 4);
	const cursor = await page.evaluate(() => ({ ...window.__studio.computer.os.cursor }));
	check('xr: controller ray moves the OS cursor to the hit point', Math.abs(cursor.x - iconX) < 6 && Math.abs(cursor.y - iconY) < 6, `${cursor.x.toFixed(1)},${cursor.y.toFixed(1)}`);
	await page.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 1));
	await frames(page, 3);
	await page.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 0));
	await frames(page, 3);
	const app = await page.evaluate(() => window.__studio.computer.os.wm.focused?.app);
	check('xr: trigger on the monitor clicks (opens Sketch)', app === 'sketch', String(app));

	// 2. focus Notes via API, then poke "h", "i" on the 3D keyboard with the left tip
	await page.evaluate(() => { const os = window.__studio.computer.os; os.openApp('notes'); });
	const notesBefore = await page.evaluate(() => window.__studio.computer.os.apps.get('notes').buf.text);
	// the animated hand's index fingertip does the pressing: steer the
	// controller so that fingertip hovers over the key, then press and lift
	const leftTip = () => page.evaluate(() => { const h = window.__studio.xr.hands.find((x) => x.source?.handedness === 'left'); return h.visual.indexTip().toArray(); });
	for (const code of ['KeyH', 'KeyI']) {
		const keyTop = await page.evaluate((code) => {
			const s = window.__studio; const THREE = s.THREE;
			const p = s.ws.keyboard.keyLocal(s.KEY_INDEX.get(code), new THREE.Vector3());
			p.y += 0.001;
			return s.ws.keyboard.deck.localToWorld(p).toArray();
		}, code);
		// controller held ~20 cm above and behind the key, pointing down-forward at it
		let ray = [keyTop[0], keyTop[1] + 0.16, keyTop[2] + 0.1];
		const place = async (dy) => {
			for (let it = 0; it < 4; it++) {
				await page.evaluate(([r]) => window.__aim('left', r, [r[0], r[1] - 0.8, r[2] - 0.5]), [ray]);
				await frames(page, 2);
				const t = await leftTip();
				const want = [keyTop[0], keyTop[1] + 0.007 + dy, keyTop[2]];
				ray = ray.map((v, k) => v + (want[k] - t[k]));
			}
		};
		await place(0.025); await place(-0.004); await place(0.025);
	}
	const notesAfter = await page.evaluate(() => window.__studio.computer.os.apps.get('notes').buf.text);
	check('xr: poking 3D keys with the hand\'s index fingertip types into Notes', notesAfter === notesBefore + 'hi', JSON.stringify(notesAfter.slice(-6)));

	// 3. grab the mug with the ray + squeeze, lift it 25 cm, drop it
	const mug0 = await page.evaluate(() => { const t = window.__studio.physics.props[0].body.translation(); return [t.x, t.y, t.z]; });
	const from = [mug0[0] + 0.25, mug0[1] + 0.25, mug0[2] + 0.25];
	await page.evaluate(([f, m]) => window.__aim('right', f, [m[0], m[1] + 0.05, m[2]]), [from, mug0]);
	await frames(page, 3);
	await page.evaluate(() => window.__iwer.controllers.right.updateButtonValue('squeeze', 1));
	await frames(page, 3);
	const held = await page.evaluate(() => window.__studio.physics.props[0].held);
	check('xr: squeeze while pointing at the mug grabs it', held);
	await page.evaluate(([f, m]) => window.__aim('right', [f[0], f[1] + 0.25, f[2]], [m[0], m[1] + 0.3, m[2]]), [from, mug0]);
	await frames(page, 12);
	const lifted = await page.evaluate(() => window.__studio.physics.props[0].body.translation().y);
	check('xr: held mug follows the hand upward', lifted > mug0[1] + 0.18, `y ${mug0[1].toFixed(3)} -> ${lifted.toFixed(3)}`);
	const grasp = await page.evaluate(() => {
		const s = window.__studio, T = s.THREE;
		const h = s.xr.hands.find((x) => x.source?.handedness === 'right');
		const bone = (n) => new T.Vector3().setFromMatrixPosition(h.visual.model.bones.find((b) => b.name === n).matrixWorld);
		const f = bone('index-finger-phalanx-intermediate').add(bone('middle-finger-phalanx-intermediate')).multiplyScalar(0.5);
		const mug = s.physics.props[0].desc.object;
		mug.updateMatrixWorld(true);
		return { kind: h.held?.kind, local: mug.worldToLocal(f).toArray() };
	});
	const gl = grasp.local;
	check('xr: held mug settles with its handle on the curled fingers', grasp.kind === 'mug' && gl[0] > 0.035 && gl[0] < 0.075 && gl[1] > 0.015 && gl[1] < 0.085 && Math.abs(gl[2]) < 0.03, JSON.stringify(gl.map((v) => +v.toFixed(3))));
	await page.evaluate(() => window.__iwer.controllers.right.updateButtonValue('squeeze', 0));
	await frames(page, 90);
	const dropped = await page.evaluate(() => { const p = window.__studio.physics.props[0]; const t = p.body.translation(); const v = p.body.linvel(); return { held: p.held, y: t.y, v: Math.hypot(v.x, v.y, v.z) }; });
	check('xr: released mug falls and comes to rest on a surface', !dropped.held && dropped.y < lifted - 0.1 && dropped.y > -0.01 && dropped.v < 0.05, JSON.stringify(dropped));

	// 3b. pick up the pistol from the sideboard, fire at the wall, empty it, reload
	const gun0 = await page.evaluate(() => { const t = window.__studio.gun.prop.body.translation(); return [t.x, t.y, t.z]; });
	await page.evaluate((g) => window.__aim('right', [g[0] - 0.3, g[1] + 0.3, g[2]], [g[0], g[1] + 0.02, g[2]]), gun0);
	await frames(page, 3);
	await page.evaluate(() => window.__iwer.controllers.right.updateButtonValue('squeeze', 1));
	await frames(page, 3);
	const gunHeld = await page.evaluate(() => { const h = window.__studio.xr.hands.find((x) => x.source?.handedness === 'right'); return { held: window.__studio.gun.prop.held, kind: h.held?.kind }; });
	check('xr: squeeze at the pistol picks it up in a pistol grip', gunHeld.held && gunHeld.kind === 'pistol', JSON.stringify(gunHeld));
	// raise it and point at the wall behind the sideboard (+X)
	await page.evaluate((g) => window.__aim('right', [g[0] - 0.35, 1.25, g[2]], [3.5, 1.25, g[2]]), gun0);
	await frames(page, 40);
	const aimErr = await page.evaluate(() => { const s = window.__studio; const g = s.gun.pistol; g.group.updateMatrixWorld(true); const f = g.forwardWorld(); return Math.acos(Math.min(1, f.x)) * 180 / Math.PI; });
	check('xr: held pistol\'s barrel lines up with the controller ray (< 6°)', aimErr < 6, `${aimErr.toFixed(1)}°`);
	const pull = async () => { await page.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 1)); await frames(page, 3); await page.evaluate(() => window.__iwer.controllers.right.updateButtonValue('trigger', 0)); await frames(page, 14); };
	await pull();
	const shot1 = await page.evaluate(() => { const g = window.__studio.gun; return { ammo: g.pistol.ammo, fired: g.shotsFired, hit: g.lastShot?.hit ?? null, held: g.prop.held, x: g.lastShot?.point?.x }; });
	check('xr: trigger fires one round and the bullet hits the wall', shot1.ammo === 7 && shot1.fired === 1 && shot1.hit && shot1.x > 2.0 && shot1.held, JSON.stringify(shot1));
	for (let i = 0; i < 8; i++) await pull();
	const dry = await page.evaluate(() => { const g = window.__studio.gun; return { ammo: g.pistol.ammo, fired: g.shotsFired }; });
	check('xr: magazine holds 8 rounds, then the trigger only clicks', dry.ammo === 0 && dry.fired === 8, JSON.stringify(dry));
	await page.evaluate(() => window.__iwer.controllers.right.updateButtonValue('a-button', 1));
	await frames(page, 3);
	await page.evaluate(() => window.__iwer.controllers.right.updateButtonValue('a-button', 0));
	await frames(page, 90);
	const reloaded = await page.evaluate(() => window.__studio.gun.pistol.ammo);
	check('xr: A button reloads a full magazine', reloaded === 8, String(reloaded));
	await page.evaluate(() => window.__iwer.controllers.right.updateButtonValue('squeeze', 0));
	await frames(page, 30);

	// 4. snap turn with the right stick
	await page.evaluate(() => window.__aim('right', [1.5, 1.0, 1.5], [1.5, 1.0, 3])); // point away from everything
	await frames(page, 2);
	const r0 = await page.evaluate(() => window.__studio.xr.rig.rotation.y);
	await page.evaluate(() => window.__iwer.controllers.right.updateAxes('thumbstick', 1, 0));
	await frames(page, 3);
	await page.evaluate(() => window.__iwer.controllers.right.updateAxes('thumbstick', 0, 0));
	await frames(page, 3);
	const r1 = await page.evaluate(() => window.__studio.xr.rig.rotation.y);
	check('xr: thumbstick flick snap-turns 30 degrees', Math.abs(Math.abs(r1 - r0) - Math.PI / 6) < 1e-3, `${(r1 - r0).toFixed(3)} rad`);

	// 5. smooth walking: left stick forward moves the head the way it faces
	const headPos = () => page.evaluate(() => { const s = window.__studio; return s.camera.getWorldPosition(new s.THREE.Vector3()).toArray(); });
	const headFwd = () => page.evaluate(() => { const s = window.__studio; const f = new s.THREE.Vector3(0, 0, -1).applyQuaternion(s.camera.getWorldQuaternion(new s.THREE.Quaternion())); return [f.x, f.z]; });
	const h0 = await headPos(), f0 = await headFwd();
	await page.evaluate(() => window.__iwer.controllers.left.updateAxes('thumbstick', 0, -1));
	await frames(page, 10);
	const vigOn = await page.evaluate(() => window.__studio.xr.vignette.visible);
	await page.evaluate(() => window.__iwer.controllers.left.updateAxes('thumbstick', 0, 0));
	await frames(page, 25);
	const h1 = await headPos();
	const d = [h1[0] - h0[0], h1[2] - h0[2]], dist = Math.hypot(d[0], d[1]);
	const along = (d[0] * f0[0] + d[1] * f0[1]) / (dist * Math.hypot(f0[0], f0[1]) || 1);
	check('xr: left stick walks smoothly in the looking direction', dist > 0.2 && along > 0.95, `${dist.toFixed(2)} m, cos=${along.toFixed(3)}`);
	const settled = await page.evaluate(() => ({ v: window.__studio.xr.walkVel.length(), vig: window.__studio.xr.vignette.visible }));
	check('xr: comfort vignette shows while walking and clears after stopping', vigOn && !settled.vig && settled.v === 0, JSON.stringify({ vigOn, ...settled }));
	// keep walking toward the north wall for a long time: must stop at it
	await page.evaluate(() => { const s = window.__studio; s.xr.rig.rotation.y = 0; window.__iwer.controllers.left.updateAxes('thumbstick', 0, -1); });
	await frames(page, 160);
	await page.evaluate(() => window.__iwer.controllers.left.updateAxes('thumbstick', 0, 0));
	await frames(page, 10);
	const h2 = await headPos();
	check('xr: walking into a wall or desk is blocked (no passing through)', h2[2] > -2.5 + 0.15 && Math.abs(h2[0]) < 2.2, `head at x=${h2[0].toFixed(2)} z=${h2[2].toFixed(2)}`);

	// 6. hand tracking: the skeleton follows the tracked joints, a pinch at the notebook grabs it
	await page.evaluate(() => { window.__iwer.primaryInputMode = 'hand'; });
	await frames(page, 6);
	const tr = await page.evaluate(() => {
		const s = window.__studio, T = s.THREE;
		return s.xr.hands.map((h) => {
			const j = h.handSpace.joints['index-finger-tip'];
			const jt = j ? new T.Vector3().setFromMatrixPosition(j.matrixWorld) : null;
			const mt = h.visual?.model.tipWorld('index');
			return { tracked: !!h.source?.hand, visible: !!h.visual?.model.root.visible, tipError: jt && mt ? jt.distanceTo(mt) : 1 };
		});
	});
	check('xr: tracked hands follow the joints (index tip within 1.5 cm)', tr.every((t) => t.tracked && t.visible && t.tipError < 0.015), JSON.stringify(tr.map((t) => ({ ...t, tipError: +t.tipError.toFixed(4) }))));
	// put the right hand's pinch point on the notebook, then pinch
	// a corner of the notebook, away from the pen lying across it
	const nb = await page.evaluate(() => { const s = window.__studio; const o = s.physics.props[1].desc.object; o.updateMatrixWorld(true); return o.localToWorld(new s.THREE.Vector3(0.05, 0.02, 0.08)).toArray(); });
	for (let it = 0; it < 4; it++) {
		const pp = await page.evaluate(() => { const s = window.__studio; const h = s.xr.hands.find((x) => x.source?.handedness === 'right'); return s.xr.grabPoint(h).toArray(); });
		await page.evaluate(([nb, pp]) => { const s = window.__studio, d = window.__iwer; const c = d.hands.right.position; const rigQ = s.xr.rig.getWorldQuaternion(new s.THREE.Quaternion()).invert(); const delta = new s.THREE.Vector3(nb[0] - pp[0], nb[1] - pp[1], nb[2] - pp[2]).applyQuaternion(rigQ); c.set(c.x + delta.x, c.y + delta.y, c.z + delta.z); }, [nb, pp]);
		await frames(page, 2);
	}
	await page.evaluate(() => { window.__iwer.hands.right.poseId = 'pinch'; });
	await frames(page, 6);
	const pinchHeld = await page.evaluate(() => { const s = window.__studio; const h = s.xr.hands.find((x) => x.source?.handedness === 'right'); return { pinching: h.pinching, held: h.held?.prop.desc.name ?? null }; });
	check('xr: a tracked pinch at the notebook picks it up', pinchHeld.pinching && pinchHeld.held === 'notebook', JSON.stringify(pinchHeld));
	await page.evaluate(() => { window.__iwer.hands.right.poseId = 'default'; window.__iwer.primaryInputMode = 'controller'; });
	await frames(page, 6);

	check('xr: no runtime errors during the session', errors.length === 0, errors.slice(0, 3).join(' | '));
	await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
