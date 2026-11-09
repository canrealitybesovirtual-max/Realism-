// Bake the city view panoramas (headless Chromium, SwiftShader).
// needs: python3 -m http.server 8765 in the repo root; data from the prepare_*.py steps.
// usage: node bake_probes.js [--sun afternoon|morning] [--probes 0,1,...] [--size 2048] [--ss 2] [--dsize 256]
// writes <world>/.cache/nyc/probes/<sun>/p<id>_<face>.rgba (rows bottom-up), .dist (float32), meta.json
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const WORLD = path.resolve(__dirname, '..', '..');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const sunName = arg('sun', 'afternoon');
const SUN = cfg.suns[sunName];
const OUT = path.join(WORLD, '.cache', 'nyc', 'probes', sunName);
fs.mkdirSync(OUT, { recursive: true });
const size = +arg('size', 2048), ss = +arg('ss', 2), dsize = +arg('dsize', 256);
const only = arg('probes', null);
const probes = cfg.probes.filter((p) => !only || only.split(',').map(Number).includes(p.id));
const faces = (arg('faces', '0,1,3,4,5')).split(',').map(Number);   // +y (2) sees only sky from these heights

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=8192'] });
  const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text().slice(0, 300)); });
  await page.goto('http://127.0.0.1:8765/world/bake/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  console.log('init', JSON.stringify(await page.evaluate(() => window.__bake.init())));
  await page.evaluate((o) => window.__bake.set(o), { sunAz: SUN.az, sunEl: SUN.el });
  const meta = await page.evaluate(() => ({ look: window.__bake.LOOK, sun: window.__bake.U.uSun.value.toArray(), faces: window.__bake.FACES }));
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ ...meta, size, ss, dsize, sunName, hour: SUN.hour }, null, 1));
  const [ax, az] = cfg.anchor, [cx, cz] = cfg.aptCenter;
  for (const p of probes) {
    const pos = [ax + p.apt[0] - cx, cfg.street + p.apt[1], az + p.apt[2] - cz];
    for (const fi of faces) {
      const base = path.join(OUT, `p${p.id}_${fi}`);
      if (fs.existsSync(base + '.dist') && !process.argv.includes('--force')) { console.log('skip', base); continue; }
      const r = await page.evaluate(([pos, fi, size, ss, dsize]) => window.__bake.face(pos, fi, size, ss, dsize), [pos, fi, size, ss, dsize]);
      fs.writeFileSync(base + '.rgba', Buffer.from(r.rgba, 'base64'));
      fs.writeFileSync(base + '.dist', Buffer.from(r.dist, 'base64'));
      console.log(`probe ${p.id} face ${fi} ${r.ms} ms`);
    }
  }
  await browser.close();
})();
