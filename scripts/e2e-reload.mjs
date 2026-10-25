// Real reloading: magazines as objects, slide lock, racking, bolt by hand.
//   npm run dev & node scripts/e2e-reload.mjs [--url http://localhost:5173/]
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
await p.goto(url + '?noao');
await p.waitForFunction(() => window.__studio?.ready && window.__studio.mags, null, { timeout: 600000 });
const S = (fn, a) => p.evaluate(fn, a);
// advance the guns' mechanisms by simulated time (no rendering needed)
await S(() => { window.__tick = (fs, s) => { for (let i = 0; i < s * 120; i++) fs.update(1 / 120); }; });

// ---------------------------------------------------------------- Glock
const g = await S(() => {
	const s = window.__studio, fs = s.guns.find((x) => x.gun?.spec.id === 'g17'), g = fs.gun;
	const out = { start: { mag: g.magazine, ch: g.chambered, magIn: g.magIn } };
	let shots = 0;
	for (let i = 0; i < 25; i++) { const r = fs.pullTrigger(); if (r === 'fired') shots++; window.__tick(fs, 0.2); }
	out.empty = { shots, locked: g.slideLocked, ch: g.chambered, mag: g.magazine, fireWhenLocked: fs.pullTrigger() };
	// R: magazine out (a real object), R again: a spare from the pouch
	const loose0 = s.mags.loose.size;
	fs.reload();
	out.dropped = { magIn: g.magIn, loose: s.mags.loose.size - loose0, rounds: [...s.mags.loose.values()].at(-1)?.rounds };
	fs.reload();
	window.__tick(fs, 0.6);
	out.inserted = { magIn: g.magIn, mag: g.magazine, ch: g.chambered, locked: g.slideLocked, pouch: s.mags.pouch.get('g17').length };
	fs.secondary(); // slide stop
	window.__tick(fs, 0.3);
	out.released = { ch: g.chambered, mag: g.magazine, inBattery: g.inBattery, fired: fs.pullTrigger() };
	window.__tick(fs, 0.3);
	// rack by hand with a round chambered: the live round is ejected, the next one fed
	const m0 = g.magazine;
	g.handSlide = 0.5; window.__tick(fs, 0.05); g.handSlide = 1; window.__tick(fs, 0.05); g.handSlide = null; window.__tick(fs, 0.3);
	out.racked = { ch: g.chambered, magBefore: m0, magAfter: g.magazine };
	// no magazine: the chambered round still fires, then the slide stays forward on an empty chamber
	fs.primary(); // VR A: release
	window.__tick(fs, 0.2);
	out.noMag = { magIn: g.magIn, fired: fs.pullTrigger() };
	window.__tick(fs, 0.3);
	out.noMag.after = { ch: g.chambered, locked: g.slideLocked, click: fs.pullTrigger() };
	return out;
});
check('G17: 17 + 1 rounds, then the slide locks back on the empty magazine', g.empty.shots === 18 && g.empty.locked && !g.empty.ch && g.empty.fireWhenLocked === null, JSON.stringify(g.empty));
check('G17: R drops the magazine as a loose object (keeps its rounds)', !g.dropped.magIn && g.dropped.loose === 1 && g.dropped.rounds === 0, JSON.stringify(g.dropped));
check('G17: R seats a spare from the pouch; the slide stays locked, chamber empty', g.inserted.magIn && g.inserted.mag === 17 && !g.inserted.ch && g.inserted.locked && g.inserted.pouch === 1, JSON.stringify(g.inserted));
check('G17: slide stop chambers a round and it fires', g.released.ch !== undefined && g.released.mag === 16 && g.released.fired === 'fired', JSON.stringify(g.released));
check('G17: racking by hand ejects the live round and feeds the next', g.racked.ch && g.racked.magAfter === g.racked.magBefore - 1, JSON.stringify(g.racked));
check('G17: with the magazine out the chambered round fires, then click', g.noMag.fired === 'fired' && !g.noMag.after.ch && !g.noMag.after.locked && g.noMag.after.click === 'click', JSON.stringify(g.noMag));

// a loose magazine seats when brought to the magwell (what a VR hand does)
const seat = await S(() => {
	const s = window.__studio, fs = s.guns.find((x) => x.gun?.spec.id === 'g17'), g = fs.gun, T = s.THREE;
	const prop = s.mags.nearestLoose('g17', g.world(g.port), 3) ?? [...s.mags.loose.keys()].find((k) => s.mags.loose.get(k).gun === 'g17');
	const pose = s.mags.seatedPose(fs);
	const far = pose.clone().multiply(new T.Matrix4().makeTranslation(0, -0.2, 0));
	const P = new T.Vector3(), Q = new T.Quaternion();
	far.decompose(P, Q, new T.Vector3()); s.physics.teleport(prop, P, Q); prop.desc.object.updateMatrixWorld(true);
	const farFits = s.mags.fits(prop, fs);
	pose.decompose(P, Q, new T.Vector3()); s.physics.teleport(prop, P, Q); prop.desc.object.updateMatrixWorld(true);
	const fits = s.mags.fits(prop, fs);
	const rounds = s.mags.loose.get(prop).rounds;
	const ok = s.mags.insert(prop, fs);
	return { farFits, fits, ok, magIn: g.magIn, mag: g.magazine, rounds };
});
check('magazine seats only when lined up at the magwell, with its own round count', !seat.farFits && seat.fits && seat.ok && seat.magIn && seat.mag === seat.rounds, JSON.stringify(seat));

// ---------------------------------------------------------------- AWP bolt by hand
const a = await S(() => {
	const s = window.__studio, fs = s.guns.find((x) => x.gun?.spec.id === 'awp'), g = fs.gun;
	const out = {};
	out.first = fs.pullTrigger(); window.__tick(fs, 0.3);
	out.second = fs.pullTrigger(); // spent case still in the chamber
	const bolt = (lift, draw) => { g.handBolt = { lift, draw }; window.__tick(fs, 0.05); };
	bolt(0, 0.6); out.drawWhileDown = g.boltDraw; // cannot slide while the handle is down
	bolt(1, 0); bolt(1, 0.5); bolt(1, 1); out.open = { ch: g.chambered, spent: g.needsCycle, fire: fs.pullTrigger() };
	bolt(1, 0.5); bolt(1, 0); bolt(0, 0); g.handBolt = null;
	out.closed = { ch: g.chambered, mag: g.magazine, fire: fs.pullTrigger() };
	return out;
});
check('AWP: fires once, then the spent case blocks the next shot', a.first === 'fired' && a.second === 'click', JSON.stringify(a));
check('AWP: the bolt only slides with the handle lifted; open bolt cannot fire', a.drawWhileDown < 0.05 && !a.open.ch && !a.open.spent && a.open.fire === null, JSON.stringify(a.open));
check('AWP: bolt forward and down chambers the next round from the magazine', a.closed.ch !== undefined && a.closed.mag === 4 && a.closed.fire === 'fired', JSON.stringify(a.closed));

// ammo can refills the pouch
const can = await S(() => { const s = window.__studio; const c = s.scene.getObjectByName('ammo-can'); c.userData.onUse(); return [...s.mags.pouch.entries()].map(([k, v]) => k + ':' + v.join('/')); });
check('ammo can refills every pouch with full magazines', can.includes('g17:17/17/17') && can.includes('awp:5/5/5'), can.join(' '));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
