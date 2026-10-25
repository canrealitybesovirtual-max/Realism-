// Maps behind the office door load on demand and free themselves on the way
// back: the highway (procedural road + GLB traffic), the snowy rally map and
// the shooting range.
//   npm run dev & node scripts/e2e-maps.mjs [--url http://localhost:5173/]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const fetched = [];
p.on('request', (r) => fetched.push(r.url()));
await p.goto(url + '?noao');
await p.waitForFunction(() => window.__studio?.ready && window.__rally, null, { timeout: 600000 });
await p.evaluate(() => { document.getElementById('overlay').style.display = 'none'; });

const loadedBefore = {
	highway: fetched.some((u) => /maps\/highway|traffic\.json/.test(u)),
	snow: fetched.some((u) => /rally-(snow|car)\.json/.test(u)),
	range: fetched.some((u) => /world\/range\.ts|range-[\w-]+\.js/.test(u)),
	rangeBuilt: await p.evaluate(() => !!window.__studio.scene.getObjectByName('range')),
};
check('nothing behind the door is downloaded or built with the office', !loadedBefore.highway && !loadedBefore.snow && !loadedBefore.range && !loadedBefore.rangeBuilt, JSON.stringify(loadedBefore));

// ---- highway ----
await p.evaluate(() => window.__rally.enterMap('highway'));
const hw = await p.evaluate(() => {
	const m = window.__rally.map, W = m.world, c = m.car;
	const g = m.groundAt(c.x, c.z);
	return { kind: m.kind, mode: window.__rally.mode, cars: W.traffic.cars.length, models: new Set(W.traffic.cars.map((t) => t.model)).size, carOnShoulder: g.surf === 0 && g.road.d > 13 && g.road.d < 16.3 };
});
check('highway: built on entry, with GLB traffic and the car on the hard shoulder', hw.kind === 'highway' && hw.mode === 'foot' && hw.cars >= 24 && hw.models >= 4 && hw.carOnShoulder, JSON.stringify(hw));
check('highway: its code and models were fetched only now', fetched.some((u) => /traffic\.json/.test(u)) && !fetched.some((u) => /rally-snow\.json/.test(u)));

// simulated time, independent of the (slow) software renderer
const sim = (secs, fn) => p.evaluate(([secs, fn]) => {
	const m = window.__rally.map, f = fn ? new Function('m', 'i', fn) : null;
	for (let i = 0; i < secs * 60; i++) { if (f) f(m, i); m.update(1 / 60, i / 60); }
}, [secs, fn]);

// traffic: moves, keeps its distance, keeps to lanes
const t0 = await p.evaluate(() => window.__rally.map.world.traffic.cars.map((c) => [c.x, c.z]));
await sim(40);
const tr = await p.evaluate((t0) => {
	const W = window.__rally.map.world, cars = W.traffic.cars, L = W.roads[0].len;
	let moved = 0, minGap = 1e9, offLane = 0;
	cars.forEach((c, i) => {
		if (Math.hypot(c.x - t0[i][0], c.z - t0[i][1]) > 100) moved++;
		const nr = W.nearestRoad(c.x, c.z);
		if (!nr || nr.d < 2.5 || nr.d > 13.3) offLane++;
		for (const o of cars) {
			if (o === c || o.side !== c.side || Math.abs(o.lane - c.lane) > 0.5) continue;
			let g = ((o.p - c.p) % L + L) % L; if (g > L / 2) continue;
			minGap = Math.min(minGap, g - (o.len + c.len) / 2);
		}
	});
	return { moved, n: cars.length, minGap: +minGap.toFixed(2), offLane, speeds: cars.slice(0, 6).map((c) => Math.round(c.v * 3.6)) };
}, t0);
check('traffic drives on, in its lanes, without running into each other', tr.moved >= tr.n * 0.7 && tr.minGap > 0.5 && tr.offLane === 0, JSON.stringify(tr));

// drive: a simple lane keeper on the throttle for 12 s
await p.evaluate(() => window.__rally.enterCar());
const keeper = `
	const c = m.car, W = m.world, nr = W.nearestRoad(c.x, c.z), rd = W.roads[0], k = nr.k;
	const tx = rd.T[k * 2] * nr.side, tz = rd.T[k * 2 + 1] * nr.side;           // the carriageway's direction
	const want = 13.3 - 1.8;                                                     // the slow lane
	const err = nr.d - want;                                                     // + : too far out (outward is to the right, so steer left)
	const head = Math.atan2(Math.sin(c.yaw) * tz - Math.cos(c.yaw) * tx, Math.sin(c.yaw) * tx + Math.cos(c.yaw) * tz);
	m.inputOverride = () => ({ thr: i < 600 ? 1 : 0, brk: 0, steer: Math.max(-1, Math.min(1, -head * 3 + err * 0.12)), hb: false });
`;
await sim(0.2, 'const c = m.car; m.inputOverride = () => ({ thr: 0, brk: 0, steer: 0, hb: false });');
let maxKmh = 0, minD = 99, maxD = 0;
for (let s = 0; s < 12; s++) {
	await sim(1, keeper);
	const st = await p.evaluate(() => { const m = window.__rally.map, c = m.car, nr = m.world.nearestRoad(c.x, c.z); return { kmh: c.vf * 3.6, d: nr ? nr.d : 99 }; });
	maxKmh = Math.max(maxKmh, st.kmh); minD = Math.min(minD, st.d); maxD = Math.max(maxD, st.d);
}
check('driving: the car pulls hard on tarmac and stays on the carriageway', maxKmh > 110 && minD > 0.3 && maxD < 16.9, JSON.stringify({ maxKmh: Math.round(maxKmh), minD: +minD.toFixed(1), maxD: +maxD.toFixed(1) }));

// guardrail: aim the car at the rail at 70 km/h; it must stay on the road side
const rail = await p.evaluate(() => {
	const m = window.__rally.map, c = m.car, W = m.world, nr = W.nearestRoad(c.x, c.z), rd = W.roads[0], k = nr.k;
	const L = [-rd.T[k * 2 + 1] * nr.side, rd.T[k * 2] * nr.side];
	const tx = rd.T[k * 2] * nr.side, tz = rd.T[k * 2 + 1] * nr.side;
	// 30 degrees off the road direction, toward the outside
	const dx = tx * Math.cos(0.5) + L[0] * Math.sin(0.5), dz = tz * Math.cos(0.5) + L[1] * Math.sin(0.5);
	c.yaw = Math.atan2(dx, dz); c.vx = dx * 19; c.vz = dz * 19; c.r = 0;
	m.inputOverride = () => ({ thr: 0.3, brk: 0, steer: 0, hb: false });
	let maxD = 0;
	for (let i = 0; i < 240; i++) { m.update(1 / 60, i / 60); const q = W.nearestRoad(c.x, c.z); if (q) maxD = Math.max(maxD, q.d); }
	m.inputOverride = null;
	return { maxD: +maxD.toFixed(2), kmh: Math.round(Math.hypot(c.vx, c.vz) * 3.6) };
});
check('the guardrail stops the car (it scrapes along, it does not pass through)', rail.maxD < 16.9 && rail.kmh < 70, JSON.stringify(rail));

// rear-end a traffic car: no overlap afterwards, and the other car is shoved
const crash = await p.evaluate(() => {
	const m = window.__rally.map, c = m.car, W = m.world;
	const t = W.traffic.cars.find((q) => q.crash <= 0 && q.v > 15);
	const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
	c.x = t.x - fx * (t.len / 2 + 2.6); c.z = t.z - fz * (t.len / 2 + 2.6); c.yaw = t.yaw;
	c.vx = fx * (t.v + 12); c.vz = fz * (t.v + 12); c.r = 0; c.y = m.groundAt(c.x, c.z).h;
	const v0 = t.v;
	m.inputOverride = () => ({ thr: 0, brk: 0, steer: 0, hb: false });
	for (let i = 0; i < 60; i++) m.update(1 / 60, i / 60);
	m.inputOverride = null;
	const gap = Math.hypot(c.x - t.x, c.z - t.z);
	return { gap: +gap.toFixed(2), minGap: +(t.len / 2 + 1.9 - 0.6).toFixed(2), crash: t.crash > 0, v0: Math.round(v0 * 3.6), rel: Math.round((c.vf - t.v) * 3.6) };
});
check('hitting a traffic car pushes it and does not drive through it', crash.gap > crash.minGap && crash.crash && crash.rel <= 5, JSON.stringify(crash));

// back home: the map is freed
await p.evaluate(() => { const c = window.__rally.map.car; c.vx = c.vz = 0; c.vf = 0; c.r = 0; return window.__rally.exitCar(); });
await p.evaluate(() => window.__rally.leaveMap());
const home = await p.evaluate(() => ({ mode: window.__rally.mode, map: !!window.__rally.map, inScene: !!window.__studio.scene.getObjectByName('highway-map') }));
check('leaving frees the highway (nothing of it stays in the scene)', home.mode === 'room' && !home.map && !home.inScene, JSON.stringify(home));

// ---- the snowy map still works, and loads only its own data ----
await p.evaluate(() => window.__rally.enterMap('rally'));
const snow = await p.evaluate(() => ({ kind: window.__rally.map.kind, mode: window.__rally.mode, trees: !!window.__rally.map.world.hit }));
check('rally map: builds from its own data file after the highway', snow.kind === 'rally' && snow.mode === 'foot' && fetched.some((u) => /rally-snow\.json/.test(u)), JSON.stringify(snow));
await p.evaluate(() => window.__rally.leaveMap());

// ---- the range: its chunk loads when you first go there ----
const rg = await p.evaluate(async () => {
	const r = window.__studio.range;
	if (!r) return { skipped: true };
	const before = r.loaded;
	await r.enter();
	const s = { before, loaded: r.loaded, active: r.active, built: !!window.__studio.scene.getObjectByName('range') };
	r.leave();
	return s;
});
check('range: built on first entry only', rg.skipped || (!rg.before && rg.loaded && rg.active && rg.built), JSON.stringify(rg));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
