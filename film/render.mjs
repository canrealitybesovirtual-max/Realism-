// Usage: node film/render.mjs <firstClip> [count]
// Renders 5 s clips (150 frames @30fps) at 320x240, nearest-upscaled to 960x720,
// and appends them to film/out/film.mp4 (concat, no re-encode, frame-exact joins).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'film/out'); fs.mkdirSync(OUT, { recursive: true });
const first = +(process.argv[2] ?? 0), count = +(process.argv[3] ?? 1), FPC = 150, W = 320, H = 240;
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(f).pipe(s); }).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage(); page.on('pageerror', e => console.error(e)); page.on('console', m => m.type() === 'error' && console.error(m.text()));
await page.goto(`http://127.0.0.1:${port}/film/index.html`); await page.waitForFunction('window.ready');
for (let c = first; c < first + count; c++) {
  const name = path.join(OUT, `clip_${String(c).padStart(6, '0')}.mp4`), t0 = Date.now();
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', '30', '-i', '-',
    '-vf', 'vflip,scale=960:720:flags=neighbor', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-g', '30', '-movflags', '+faststart', name], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = c * FPC; f < (c + 1) * FPC; f++) { const b = Buffer.from(await page.evaluate(f => window.renderFrame(f), f), 'base64'); if (!ff.stdin.write(b)) await new Promise(r => ff.stdin.once('drain', r)); }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  console.log(`clip ${c} done in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${name}`);
}
await browser.close(); srv.close();
// rebuild the continuous master from every consecutive clip starting at 0
const list = []; for (let c = 0; fs.existsSync(path.join(OUT, `clip_${String(c).padStart(6, '0')}.mp4`)); c++) list.push(`file 'clip_${String(c).padStart(6, '0')}.mp4'`);
if (list.length) { fs.writeFileSync(path.join(OUT, 'list.txt'), list.join('\n')); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', path.join(OUT, 'film.mp4')]); console.log(`film.mp4 = ${list.length} clips (${list.length * 5}s)`); }
