// Scene budget + CPU cost per frame, measured in headless Chromium.
// GPU time is NOT measurable here (software rasteriser); see docs for on-device profiling.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
await p.goto(url + '?view=door');
await p.waitForFunction(() => window.__studio?.ready, null, { timeout: 300000 });
const r = await p.evaluate(async () => {
	const s = window.__studio;
	const frames = (n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
	await frames(3);
	const out = {};
	for (const v of ['door', 'seated']) {
		s.setView(v); await frames(2);
		out[v] = { drawCalls: s.renderer.info.render.calls, triangles: s.renderer.info.render.triangles };
	}
	out.memory = { geometries: s.renderer.info.memory.geometries, textures: s.renderer.info.memory.textures, programs: s.renderer.info.programs.length };
	// CPU time of the non-render per-frame work (physics, contact shadows, OS)
	const t = (fn, n = 200) => { const t0 = performance.now(); for (let i = 0; i < n; i++) fn(); return (performance.now() - t0) / n; };
	out.cpuMsPerFrame = {
		physicsStep: +t(() => s.physics.step(1 / 72)).toFixed(3),
		osUpdate: +t(() => s.computer.os.update(performance.now())).toFixed(3),
		osFullRedraw: +t(() => { s.computer.os.invalidate(); s.computer.os.render(performance.now()); }, 30).toFixed(2),
	};
	let n = 0; s.scene.traverse((o) => { if (o.isMesh) n++; });
	out.meshes = n;
	return out;
});
console.log(JSON.stringify(r, null, 2));
await b.close();
