/* City map worker: runs the user's Brutalist Complex generator (gen.js, unchanged) off the main thread,
 * bakes its lighting, trees and skyline, builds its texture atlas, and posts plain typed arrays back:
 * geometry buckets, terrain (+ a 5 m triangle index for ground height and colliders), trees, collision
 * boxes / ramps, window and door kits, water, ladders and a clear street spawn. */
importScripts('gen.js', 'atlas.js');

function post(msg) { self.postMessage({ type: 'progress', msg }); }

self.onmessage = () => {
  const t0 = Date.now();
  const r = WG.buildWorld(post, { defer: true });
  post('Lighting');
  let f; do { f = WG.finishStep([WG.SAFE.x, 0, WG.SAFE.z], 1e9); } while (!f.done);
  const tr = [];
  const buckets = [];
  for (const b of WG.BUCK.values()) {
    if (!b.n || !b.ni) continue;
    const o = { mat: b.mat, P: b.P.slice(0, b.n * 3), N: b.N.slice(0, b.n * 4), C: b.C.slice(0, b.n * 4), I: b.I.slice(0, b.ni), min: b.min, max: b.max };
    buckets.push(o); tr.push(o.P.buffer, o.N.buffer, o.C.buffer, o.I.buffer);
  }
  const trees = [];
  for (const t of f.trees.values()) {
    if (!t.n) continue;
    const o = { P: new Float32Array(t.P), U: new Float32Array(t.U), C: new Uint8Array(t.C), min: t.min, max: t.max, n: t.n };
    trees.push(o); tr.push(o.P.buffer, o.U.buffer, o.C.buffer);
  }
  // terrain + its triangle index (5 m cells over -1000..1000; the far skirt ring is left out)
  const T = r.terrain, G = 400, CS = 5, O = -1000, cnt = new Uint32Array(G * G + 1);
  const nt = T.I.length / 3, cells = (t, fn) => {
    const a = T.I[t * 3], b = T.I[t * 3 + 1], c = T.I[t * 3 + 2];
    const x0 = Math.min(T.P[a * 3], T.P[b * 3], T.P[c * 3]), x1 = Math.max(T.P[a * 3], T.P[b * 3], T.P[c * 3]);
    const z0 = Math.min(T.P[a * 3 + 2], T.P[b * 3 + 2], T.P[c * 3 + 2]), z1 = Math.max(T.P[a * 3 + 2], T.P[b * 3 + 2], T.P[c * 3 + 2]);
    if (x1 - x0 > 60 || z1 - z0 > 60) return;
    for (let i = Math.max(0, Math.floor((x0 - O) / CS)); i <= Math.min(G - 1, Math.floor((x1 - O) / CS)); i++)
      for (let k = Math.max(0, Math.floor((z0 - O) / CS)); k <= Math.min(G - 1, Math.floor((z1 - O) / CS)); k++) fn(i * G + k);
  };
  for (let t = 0; t < nt; t++) cells(t, (c) => cnt[c + 1]++);
  for (let i = 1; i <= G * G; i++) cnt[i] += cnt[i - 1];
  const fill = cnt.slice(0, G * G), list = new Uint32Array(cnt[G * G]);
  for (let t = 0; t < nt; t++) cells(t, (c) => { list[fill[c]++] = t; });
  tr.push(T.P.buffer, T.N.buffer, T.C.buffer, T.I.buffer, cnt.buffer, list.buffer);
  // collision: every unique box / ramp
  const seen = new Set(), sol = [];
  for (const L of WG.HASH.values()) for (const o of L) if (!seen.has(o)) { seen.add(o); sol.push(o.cx, o.cz, o.c, o.s, o.hx, o.hz, o.y0, o.y1, o.ramp ? 1 : 0); }
  const solids = new Float32Array(sol); tr.push(solids.buffer);
  const flat = (K, n) => { const a = new Float32Array(K.length * n); K.forEach((k, i) => { for (let j = 0; j < n; j++) a[i * n + j] = +k[j] || 0; }); tr.push(a.buffer); return a; };
  const KW = flat(WG.KW, 15), KD = flat(WG.KD, 16);
  // spawn: an open, roofless, level street spot near the safe house with 5 m clear round it
  const cell = (x, z) => WG.HASH.get(WG.hk(Math.floor(x / 8), Math.floor(z / 8))) || [];
  const clear = (x, z, g) => {
    for (let a = 0; a < 12; a++) for (const rr of [0, 2.5, 5]) {
      const px = x + Math.cos(a * 0.5236) * rr, pz = z + Math.sin(a * 0.5236) * rr;
      if (Math.abs(WG.groundAt(px, pz, g + 1) - g) > 0.35 || WG.coveredAt(px, g, pz)) return false;
      for (const o of cell(px, pz)) {
        if (o.y1 < g + 0.25 || o.y0 > g + 3) continue;
        const dx = px - o.cx, dz = pz - o.cz, u = dx * o.c + dz * o.s, v = -dx * o.s + dz * o.c;
        if (Math.abs(u) < o.hx + 0.5 && Math.abs(v) < o.hz + 0.5) return false;
      }
    }
    return true;
  };
  let spawn = null;
  const sx = WG.SAFE.x, sz = WG.SAFE.z;
  for (let rad = 14; rad < 400 && !spawn; rad += 3) for (let a = 0; a < 24 && !spawn; a++) {
    const x = sx + Math.cos(a / 24 * 6.283) * rad, z = sz + Math.sin(a / 24 * 6.283) * rad, g = WG.groundAt(x, z, 1e4);
    if (g > -50 && clear(x, z, g) && clear(x, z + 3.5, WG.groundAt(x, z + 3.5, 1e4))) spawn = { x, y: g, z };
  }
  if (!spawn) spawn = { x: sx + 20, y: WG.groundAt(sx + 20, sz, 1e4), z: sz };
  self.postMessage({
    type: 'done', ms: Date.now() - t0, buckets, trees, solids, KW, KD, spawn, atlas: cityAtlas(),
    terrain: { P: T.P, N: T.N, C: T.C, I: T.I, cnt, list, G, CS, O },
    water: WG.WATER, ladders: WG.LADDERS, places: WG.UNDER.map((p) => [String(p[0]), +p[1], +p[2], +p[3]])
  }, tr);
};
