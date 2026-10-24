// End-to-end checks in a real browser (headless Chromium + SwiftShader).
//
//   node scripts/e2e.mjs [--url http://localhost:5173/]
//
// Desktop: real keyboard events typed into the OS through DesktopControls,
//          dock clicks, physics props resting.
// WebXR:   a virtual Meta Quest 3 (IWER, ?emulate) enters VR; the right
//          controller ray clicks the monitor, the left controller tip pokes
//          keys on the 3D keyboard, the ray grabs and drops the mug, the
//          thumbsticks teleport and snap-turn.
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
	const calc = await page.evaluate(() => {
		const os = window.__studio.computer.os;
		os.pointerMove(917, 1020); os.pointerDown(); os.pointerUp();
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
	for (const p of props) check(`physics: ${p.name} rests on the desk`, p.y > 0.73 && p.y < 0.76 && p.speed < 0.02, `y=${p.y.toFixed(4)} v=${p.speed.toFixed(4)}`);
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

	// 1. ray-click the Sketch dock icon (i = 2) on the monitor
	const iconX = 779 + 18 + 2 * 86 + 34, iconY = 1020;
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
	for (const code of ['KeyH', 'KeyI']) {
		// hover 3 cm above the key, pointing down, then press 9 mm into it, then lift
		const keyTop = await page.evaluate((code) => {
			const s = window.__studio; const THREE = s.THREE;
			const i = s.KEY_INDEX.get(code);
			const p = s.ws.keyboard.keyLocal(i, new THREE.Vector3());
			p.y += 0.001;
			return s.ws.keyboard.deck.localToWorld(p).toArray();
		}, code);
		const pose = async (dy) => {
			// ray origin is the tip origin + 3 cm back along the ray; ray points down
			await page.evaluate(([k, dy]) => window.__aim('left', [k[0], k[1] + 0.03 + 0.007 + dy, k[2]], [k[0], k[1] - 1, k[2] + 0.0001]), [keyTop, dy]);
			await frames(page, 3);
		};
		await pose(0.03); await pose(-0.004); await pose(0.03);
	}
	const notesAfter = await page.evaluate(() => window.__studio.computer.os.apps.get('notes').buf.text);
	check('xr: poking 3D keys types into Notes', notesAfter === notesBefore + 'hi', JSON.stringify(notesAfter.slice(-6)));

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
	await page.evaluate(() => window.__iwer.controllers.right.updateButtonValue('squeeze', 0));
	await frames(page, 90);
	const dropped = await page.evaluate(() => { const p = window.__studio.physics.props[0]; const t = p.body.translation(); const v = p.body.linvel(); return { held: p.held, y: t.y, v: Math.hypot(v.x, v.y, v.z) }; });
	check('xr: released mug falls and comes to rest on a surface', !dropped.held && dropped.y < lifted - 0.1 && dropped.y > -0.01 && dropped.v < 0.05, JSON.stringify(dropped));

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

	// 5. teleport: left stick forward, aim at open floor, release
	await page.evaluate(() => {
		const s = window.__studio;
		const head = s.renderer.xr.getCamera().getWorldPosition(new s.THREE.Vector3());
		window.__head0 = head.toArray();
		window.__aim('left', [head.x, 1.0, head.z], [head.x + 0.3, 0.0, head.z + 1.6]);
		window.__iwer.controllers.left.updateAxes('thumbstick', 0, -1);
	});
	await frames(page, 4);
	await page.evaluate(() => window.__iwer.controllers.left.updateAxes('thumbstick', 0, 0));
	await frames(page, 3);
	const moved = await page.evaluate(() => { const s = window.__studio; const h = s.renderer.xr.getCamera().getWorldPosition(new s.THREE.Vector3()); return Math.hypot(h.x - window.__head0[0], h.z - window.__head0[2]); });
	check('xr: thumbstick teleport moves the user to the aimed floor point', moved > 0.5, `${moved.toFixed(2)} m`);

	check('xr: no runtime errors during the session', errors.length === 0, errors.slice(0, 3).join(' | '));
	await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
