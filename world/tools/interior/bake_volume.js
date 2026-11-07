// Bake the apartment's irradiance volume (headless Chromium, SwiftShader): loads the game page,
// waits for its room probes, then captures a small cube at every volume probe (outside at daylight
// level, the room's downlights on) and projects it on L1 spherical harmonics.
// needs: python3 -m http.server 8765 in the repo root.
// usage: node bake_volume.js [--size 16] [--url http://127.0.0.1:8765/world/index.html]
// writes world/textures/light/volume.json (grid) and volume.bin (12 half floats per probe:
// L0, L1y, L1z, L1x as rgb, irradiance convolution folded in)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const WORLD = path.resolve(__dirname, '..', '..');
const OUT = path.join(WORLD, 'textures', 'light');
const size = +arg('size', 16);
const url = arg('url', 'http://127.0.0.1:8765/world/index.html') + '?volume=off';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=8192'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.exposeFunction('__progress', (f, ms) => { process.stdout.write(`\r${(f * 100).toFixed(1)}%  ${(ms / 1000).toFixed(0)} s   `); });
  await page.goto(url, { waitUntil: 'commit', timeout: 300000 });
  for (let i = 0; i < 600; i++) {
    if (await page.evaluate(() => !!(window.__world && window.__world.surf && window.__world.surf.bakeMs)).catch(() => false)) break;
    await page.waitForTimeout(1000);
  }
  const r = await page.evaluate(async (size) => {
    const W = window.__world; W.renderer.setAnimationLoop(null);
    const v = await W.surf.bakeVolume({ size, onProgress: (f, ms) => window.__progress(f, ms) });
    const n = v.data.length / 16, h = new Uint16Array(n * 12), f16 = W.THREE.DataUtils.toHalfFloat;
    for (let j = 0; j < n; j++) for (let m = 0; m < 4; m++) for (let c = 0; c < 3; c++) h[j * 12 + m * 3 + c] = f16(v.data[j * 16 + m * 4 + c]);
    let s = ''; const b = new Uint8Array(h.buffer);
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return { meta: v.meta, ms: v.ms, bin: btoa(s) };
  }, size);
  fs.writeFileSync(path.join(OUT, 'volume.json'), JSON.stringify(r.meta));
  fs.writeFileSync(path.join(OUT, 'volume.bin'), Buffer.from(r.bin, 'base64'));
  console.log('\nvolume', r.meta.nx, 'x', r.meta.nz, 'x', r.meta.layers.length, 'probes in', (r.ms / 1000).toFixed(0), 's');
  await browser.close();
})();
