// Office fixes: the desk lamp clears the wall; Settings changes the physical
// screen size (and remembers it).
//   npm run dev & node scripts/e2e-office.mjs [--url http://localhost:5173/]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 640, height: 400 } });
const errors = [];
const open = async () => {
	const p = await ctx.newPage();
	p.on('pageerror', (e) => errors.push(e.message));
	await p.goto(url + '?noao');
	await p.waitForFunction(() => window.__studio?.ready, null, { timeout: 600000 });
	return p;
};
let p = await open();
const lamp = await p.evaluate(() => { const s = window.__studio, T = s.THREE; s.ws.lamp.updateMatrixWorld(true); const bb = new T.Box3().setFromObject(s.ws.lamp); return { minZ: +bb.min.z.toFixed(3), wall: -2.5 }; });
check('desk lamp stays in front of the back wall (no clipping)', lamp.minZ > lamp.wall + 0.03, JSON.stringify(lamp));

// open Settings (System) and click the 32" button through the OS's own input
const size = await p.evaluate(() => {
	const s = window.__studio, os = s.computer.os, head = s.ws.monitor.head;
	os.openApp('system'); os.invalidate(); os.render(performance.now());
	const app = os.apps.get('system'), w = os.wm.byApp('system'), r = os.contentRect(w);
	const before = { scale: head.scale.x, size: os.displaySize };
	const btn = app.sizeHits.find((h) => h.inch === 32);
	os.pointerMove(r.x + btn.x + btn.w / 2, r.y + btn.y + btn.h / 2); os.pointerDown(); os.pointerUp();
	const screen = s.ws.monitor.screen; screen.updateMatrixWorld(true);
	const bb = new s.THREE.Box3().setFromObject(screen).getSize(new s.THREE.Vector3());
	return { before, after: { scale: +head.scale.x.toFixed(3), size: os.displaySize, widthM: +Math.max(bb.x, bb.z).toFixed(3) } };
});
check('Settings: choosing 32" resizes the physical monitor', size.before.scale === 1 && size.after.size === 32 && Math.abs(size.after.scale - 32 / 27) < 0.01 && size.after.widthM > 0.68, JSON.stringify(size));
await p.close();
p = await open();
const kept = await p.evaluate(() => ({ size: window.__studio.computer.os.displaySize, scale: +window.__studio.ws.monitor.head.scale.x.toFixed(3) }));
check('the screen size is remembered after a reload', kept.size === 32 && Math.abs(kept.scale - 32 / 27) < 0.01, JSON.stringify(kept));
await p.evaluate(() => window.__studio.computer.os.setDisplaySize(27));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
