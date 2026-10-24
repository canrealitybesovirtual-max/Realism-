// Render the scene from fixed viewpoints in headless Chromium and save PNGs.
//
//   node scripts/screenshots.mjs [--url http://localhost:5173] [--out shots] [view ...]
//
// Uses SwiftShader (software WebGL) when no GPU is present, so absolute frame
// times are meaningless here, but the image is the real renderer output.

import { createRequire } from 'node:module';
// Playwright is pre-installed globally in this environment (and pinned to its
// bundled Chromium), so resolve it through CommonJS rather than package.json.
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const url = opt('--url', 'http://localhost:5173/');
const out = opt('--out', 'shots');
const w = Number(opt('--w', 1280)), h = Number(opt('--h', 720));
const query = opt('--q', '');
const views = args.length ? args : ['door', 'seated', 'shoulder', 'corner', 'window', 'deskClose', 'low'];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url + (query ? '?' + query : ''));
await page.waitForFunction(() => window.__studio && window.__studio.ready === true, null, { timeout: 240000 });
await page.evaluate(() => document.getElementById('overlay')?.classList.add('hidden'));
for (const v of views) {
	await page.evaluate((name) => window.__studio.setView(name), v);
	// let a few frames render (shadow maps, texture uploads)
	await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n > 4 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
	await page.screenshot({ path: `${out}/${v}.png`, timeout: 300000 });
	console.log('shot', v);
}
const errs = logs.filter((l) => /error|warn/i.test(l));
if (errs.length) console.log(errs.slice(0, 30).join('\n'));
await browser.close();
