// Screenshot the app as-is for a given query string (no fixed view applied).
//   node scripts/shot-url.mjs "handpreview=fist&noao" out.png [w] [h]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [query = '', out = 'shot.png', w = '1280', h = '720'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5173/?' + query);
await p.waitForFunction(() => window.__studio?.ready, null, { timeout: 300000 });
await p.evaluate(() => document.getElementById('overlay')?.classList.add('hidden'));
await p.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n > 3 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
await p.screenshot({ path: out, timeout: 300000 });
await b.close();
