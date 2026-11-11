// PSX forest film renderer. Every frame is a pure function of its frame index,
// so clip N's last frame flows straight into clip N+1's first frame.
import * as THREE from 'three';

export const W = 320, H = 240, FPS = 30;
const CHUNK = 32, RADIUS = 2, GRASS_RADIUS = 1;

// ---------- deterministic noise (JS doubles, no Math.random) ----------
function hash3(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const fade = t => t * t * (3 - 2 * t);
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi);
  const a = hash3(xi, yi, s), b = hash3(xi + 1, yi, s), c = hash3(xi, yi + 1, s), d = hash3(xi + 1, yi + 1, s);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- trail + terrain ----------
// Trail runs toward -Z forever; s = distance along Z.
export const pathX = s => 22 * Math.sin(s / 131 + 1.3) + 9 * Math.sin(s / 53 + 0.4) + 3.5 * Math.sin(s / 19 + 2.1);
const forestDensity = (x, z) => smooth(0.3, 0.62, vnoise(x / 170, z / 170, 7) * 0.8 + vnoise(x / 45, z / 45, 8) * 0.2);
function baseHeight(x, z) {
  // low hills, bigger in open meadows (ref: grassy rises), calmer in deep forest
  const open = 1 - forestDensity(x, z);
  return (vnoise(x / 70, z / 70, 1) - 0.5) * (6 + 6 * open) + (vnoise(x / 22, z / 22, 2) - 0.5) * 2.4;
}
export function height(x, z) {
  const h = baseHeight(x, z) + (vnoise(x / 6, z / 6, 3) - 0.5) * 0.5;
  const d = Math.abs(x - pathX(-z));
  // trail is worn slightly into the ground
  return h - 0.18 * (1 - smooth(0.8, 2.2, d));
}
function trailAmount(x, z) {
  const d = Math.abs(x - pathX(-z)) + (vnoise(x / 3, z / 3, 4) - 0.5) * 0.9;
  return 1 - smooth(0.7, 1.7, d);
}

// ---------- tiny procedural textures (nearest, no mips = PSX shimmer) ----------
function tex(w, h, fn, seed) {
  const d = new Uint8Array(w * h * 4), r = rng(seed);
  fn(d, w, h, r);
  const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
  return t;
}
const put = (d, w, x, y, c, a = 255) => { x = ((x % w) + w) % w; const i = (y * w + x) * 4; if (y < 0 || i >= d.length) return; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a; };
const groundTex = () => tex(64, 64, (d, w, h, r) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = vnoise(x / 4, y / 4, 11) * 0.5 + r() * 0.5, v = 150 + n * 90;
    put(d, w, x, y, [v * (0.95 + r() * 0.1), v, v * (0.85 + r() * 0.1)]);
  }
}, 1);
const barkTex = () => tex(16, 64, (d, w, h, r) => {
  for (let x = 0; x < w; x++) { const col = 0.7 + r() * 0.3; for (let y = 0; y < h; y++) { const v = col * (0.75 + r() * 0.25) * (y % 9 === 0 ? 0.7 : 1); put(d, w, x, y, [118 * v, 72 * v, 58 * v]); } }
}, 2);
// branch card: stem along +x (trunk at x=0, tip at x=w), needles fan out, alpha cutout
const branchTex = () => tex(64, 32, (d, w, h, r) => {
  for (let i = 0; i < d.length; i += 4) d[i + 3] = 0;
  for (let k = 0; k < 420; k++) {
    const sx = r() * w, spread = (1 - sx / w) * 12 + 3, side = r() < 0.5 ? -1 : 1;
    const len = 2 + r() * spread, cy = h / 2 + (r() - 0.5) * 2;
    const g = 0.55 + r() * 0.45, c = [44 * g, 78 * g, 50 * g];
    for (let j = 0; j < len; j++) put(d, w, Math.floor(sx + j * 0.45), Math.floor(cy + side * j), c);
  }
  for (let x = 0; x < w * 0.85; x++) put(d, w, x, h / 2, [70, 50, 40]);
}, 3);
const grassTex = () => tex(64, 32, (d, w, h, r) => {
  for (let i = 0; i < d.length; i += 4) d[i + 3] = 0;
  for (let k = 0; k < 34; k++) {
    let x = 3 + r() * (w - 6); const top = Math.floor(r() * h * 0.6), lean = (r() - 0.5) * 0.5, g = 0.6 + r() * 0.4;
    const c = r() < 0.15 ? [120 * g, 105 * g, 70 * g] : [80 * g, 125 * g, 70 * g];
    for (let y = h - 1; y >= top; y--) { put(d, w, Math.floor(x), y, c); x += lean; }
  }
}, 4);
const cloudTex = () => tex(64, 64, (d, w, h) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0, a = 0.5, f = 1 / 16;
    for (let o = 0; o < 4; o++) { // tileable fbm
      const p = w * f;
      const nx = x * f, ny = y * f, x0 = Math.floor(nx), y0 = Math.floor(ny), xf = fade(nx - x0), yf = fade(ny - y0);
      const hh = (i, j) => hash3(((i % p) + p) % p, ((j % p) + p) % p, 20 + o);
      const A = hh(x0, y0), B = hh(x0 + 1, y0), C = hh(x0, y0 + 1), D = hh(x0 + 1, y0 + 1);
      v += a * (A + (B - A) * xf + (C - A) * yf + (A - B - C + D) * xf * yf); a *= 0.5; f *= 2;
    }
    const c = Math.max(0, Math.min(255, v * 255)); put(d, w, x, y, [c, c, c]);
  }
}, 5);

// ---------- PSX material: vertex snap, affine UVs, Gouraud light, vertex fog ----------
const shared = {
  uWind: { value: new THREE.Vector4() }, uSunDir: { value: new THREE.Vector3(0.3, 0.8, -0.5).normalize() },
  uSunCol: { value: new THREE.Color(0.5, 0.5, 0.46) }, uAmb: { value: new THREE.Color(0.5, 0.55, 0.56) },
  uFogCol: { value: new THREE.Color(0.47, 0.55, 0.56) }, uFog: { value: new THREE.Vector2(6, 70) },
  uRes: { value: new THREE.Vector2(W, H) },
};
const VERT = /* glsl */`
uniform vec4 uWind; uniform vec3 uSunDir, uSunCol, uAmb; uniform vec2 uFog, uRes; uniform float uSway, uWrap;
#ifdef USE_INSTANCING
attribute float aPhase;
#endif
varying vec3 vCol; varying vec2 vUvW; varying float vW, vFog;
void main(){
  mat4 m = modelMatrix; float ph = 0.0; vec3 tint = vec3(1.0);
#ifdef USE_INSTANCING
  m = m * instanceMatrix; ph = aPhase;
#endif
#ifdef USE_INSTANCING_COLOR
  tint = instanceColor;
#endif
#ifdef USE_COLOR
  tint *= color;
#endif
  vec4 wp = m * vec4(position, 1.0);
  float k = uSway * position.y * position.y;
  float s1 = uWind.x * cos(ph) + uWind.y * sin(ph), s2 = uWind.z * cos(ph * 1.7) + uWind.w * sin(ph * 1.7);
  wp.x += k * (0.7 * s1 + 0.3 * s2); wp.z += k * 0.45 * s2;
  vec3 n = normalize(mat3(m) * normal);
  float d = dot(n, uSunDir); d = mix(max(d, 0.0), 0.5 + 0.5 * abs(d), uWrap);
  vCol = tint * (uAmb + uSunCol * d);
  vec4 vp = viewMatrix * wp;
  vFog = clamp((length(vp.xyz) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  vec4 c = projectionMatrix * vp;
  vec2 g = uRes * 0.5;
  c.xy = floor(c.xy / c.w * g + 0.5) / g * c.w;   // vertex jitter
  vUvW = uv * c.w; vW = c.w;                       // affine texture warp
  gl_Position = c;
}`;
const FRAG = /* glsl */`
uniform sampler2D map; uniform vec3 uFogCol;
varying vec3 vCol; varying vec2 vUvW; varying float vW, vFog;
void main(){
  vec4 t = texture2D(map, vUvW / vW);
  if (t.a < 0.5) discard;
  gl_FragColor = vec4(mix(t.rgb * vCol, uFogCol, vFog), 1.0);
}`;
function psxMat(map, { sway = 0, wrap = 0, vertexColors = false, side = THREE.FrontSide } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, map: { value: map }, uSway: { value: sway }, uWrap: { value: wrap } },
    vertexShader: VERT, fragmentShader: FRAG, vertexColors, side,
  });
}

// ---------- geometry templates ----------
function addQuad(pos, uv, nrm, a, b, c, d, n) {
  for (const [p, t] of [[a, [0, 0]], [b, [1, 0]], [c, [1, 1]], [a, [0, 0]], [c, [1, 1]], [d, [0, 1]]]) { pos.push(...p); uv.push(...t); nrm.push(...n); }
}
function pineFoliage(seed) {
  const r = rng(seed), pos = [], uv = [], nrm = [];
  const tiers = 9;
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1), y = 0.28 + f * 0.7, len = 0.36 * (1 - f) + 0.05, n = 7 - Math.floor(f * 3);
    for (let j = 0; j < n; j++) {
      const a = (j / n + r() * 0.15 + i * 0.37) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      const droop = len * (0.35 + r() * 0.3), wdt = len * 0.32, tx = -dz, tz = dx;
      const tip = [dx * len, y - droop, dz * len];
      // tilted card (seen from below/above)
      addQuad(pos, uv, nrm, [-tx * wdt * 0.3, y + 0.01, -tz * wdt * 0.3], [tip[0] - tx * wdt, tip[1], tip[2] - tz * wdt], [tip[0] + tx * wdt, tip[1], tip[2] + tz * wdt], [tx * wdt * 0.3, y + 0.01, tz * wdt * 0.3], [0, 1, 0]);
      // vertical card (seen from the side)
      addQuad(pos, uv, nrm, [0, y - wdt * 0.4, 0], [tip[0], tip[1] - wdt, tip[2]], [tip[0], tip[1] + wdt, tip[2]], [0, y + wdt * 0.4, 0], [tx, 0, tz]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}
function trunkGeo() {
  const g = new THREE.CylinderGeometry(0.008, 0.022, 1, 6, 1, true).translate(0, 0.5, 0);
  const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setY(i, u.getY(i) * 6);
  return g;
}
function tuftGeo() {
  const pos = [], uv = [], nrm = [];
  for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3, x = Math.cos(a) * 0.5, z = Math.sin(a) * 0.5; addQuad(pos, uv, nrm, [-x, 0, -z], [x, 0, z], [x, 1, z], [-x, 1, -z], [0, 1, 0]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

// ---------- world ----------
export function createWorld(renderer) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, W / H, 0.1, 400);
  camera.rotation.order = 'YXZ';
  const T = { ground: groundTex(), bark: barkTex(), branch: branchTex(), grass: grassTex(), cloud: cloudTex() };
  const M = {
    ground: psxMat(T.ground, { vertexColors: true }),
    trunk: psxMat(T.bark, { sway: 0.25 }),
    pine: psxMat(T.branch, { sway: 0.25, wrap: 1, side: THREE.DoubleSide }),
    grass: psxMat(T.grass, { sway: 0.12, wrap: 1, side: THREE.DoubleSide }),
  };
  const G = { pines: [0, 1, 2].map(i => pineFoliage(100 + i)), trunk: trunkGeo(), tuft: tuftGeo() };

  // sky dome: scrolling low-res clouds + overcast sun glow
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { map: { value: T.cloud }, uOff: { value: new THREE.Vector2() }, uSunDir: shared.uSunDir, uFogCol: shared.uFogCol, uCover: { value: 0.5 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = (projectionMatrix * modelViewMatrix * vec4(position,1.0)).xyww; }`,
    fragmentShader: `uniform sampler2D map; uniform vec2 uOff; uniform vec3 uSunDir, uFogCol; uniform float uCover; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float y = max(d.y, 0.0);
        vec2 p = d.xz / (y + 0.12) * 0.09 + uOff;
        float c = texture2D(map, p).r * 0.65 + texture2D(map, p * 2.3 + uOff * 0.7).r * 0.35;
        c = smoothstep(uCover - 0.25, uCover + 0.25, c);
        vec3 top = vec3(0.42, 0.53, 0.56), cl = vec3(0.62, 0.68, 0.68), dk = vec3(0.36, 0.45, 0.48);
        vec3 col = mix(top, mix(cl, dk, smoothstep(0.6, 1.0, c) * 0.5), c);
        float s = max(dot(d, uSunDir), 0.0); col += vec3(0.5, 0.52, 0.5) * pow(s, 24.0) * (1.0 - c * 0.5) + vec3(0.12) * pow(s, 4.0);
        gl_FragColor = vec4(mix(uFogCol, col, smoothstep(0.0, 0.22, y)), 1.0); }`,
  }));
  sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);

  const chunks = new Map();
  function buildChunk(cx, cz) {
    const grp = new THREE.Group(), ox = cx * CHUNK, oz = cz * CHUNK, seed = (cx * 73856093) ^ (cz * 19349663);
    // ground mesh: big PSX triangles, analytic normals so chunk seams match exactly
    const N = 16, step = CHUNK / N, pos = [], col = [], nrm = [], uv = [], idx = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = ox + i * step, z = oz + j * step, h = height(x, z);
      const nx = height(x - 0.5, z) - height(x + 0.5, z), nz = height(x, z - 0.5) - height(x, z + 0.5), l = Math.hypot(nx, 1, nz);
      pos.push(i * step, h, j * step); nrm.push(nx / l, 1 / l, nz / l); uv.push(x / 4, z / 4);
      const tr = trailAmount(x, z), bare = smooth(0.55, 0.75, vnoise(x / 14, z / 14, 5)) * 0.6, v = 0.85 + vnoise(x / 3, z / 3, 6) * 0.3;
      const grass = [0.42 * v, 0.52 * v, 0.3 * v], dirt = [0.55, 0.46, 0.38], k = Math.max(tr, bare);
      col.push(grass[0] + (dirt[0] - grass[0]) * k, grass[1] + (dirt[1] - grass[1]) * k, grass[2] + (dirt[2] - grass[2]) * k);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv.map((v, i) => v - (i % 2 ? oz : ox) / 4), 2));
    gg.setIndex(idx); grp.add(new THREE.Mesh(gg, M.ground));

    // trees on a jittered grid, density from forest noise, kept off the trail
    const r = rng(seed), trees = [[], [], []];
    for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) {
      const x = ox + (i + r()) * CHUNK / 9, z = oz + (j + r()) * CHUNK / 9, roll = r(), pick = Math.floor(r() * 3), hs = r(), ph = r() * 6.28, tn = r();
      if (roll > forestDensity(x, z) * 0.95 + 0.04) continue;
      if (Math.abs(x - pathX(-z)) < 2.6) continue;
      const hgt = 7 + hs * hs * 16;
      trees[pick].push({ x: x - ox, y: height(x, z) - 0.2, z: z - oz, s: hgt, ph, rot: tn * 6.28, tint: 0.8 + tn * 0.35 });
    }
    const all = trees.flat(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c3 = new THREE.Color();
    const inst = (geo, mat, list) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length), ph = new Float32Array(list.length);
      list.forEach((t, k) => { q.setFromEuler(e.set(0, t.rot, 0)); m4.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.sw ?? t.s, t.s, t.sw ?? t.s)); im.setMatrixAt(k, m4); im.setColorAt(k, c3.setRGB(t.tint * (t.tr ?? 1), t.tint, t.tint * (t.tb ?? 1))); ph[k] = t.ph; });
      geo = im.geometry; im.geometry = geo.clone(); im.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
      im.frustumCulled = false; grp.add(im);
    };
    trees.forEach((l, k) => inst(G.pines[k], M.pine, l));
    inst(G.trunk, M.trunk, all.map(t => ({ ...t, sw: t.s * 1.3 })));
    grp.userData = { ox, oz, grassBuilt: false, r };
    return grp;
  }
  function buildGrass(grp) {
    const { ox, oz } = grp.userData, r = rng((ox * 31 + oz * 17) | 0), list = [];
    for (let k = 0; k < 2200; k++) {
      const x = ox + r() * CHUNK, z = oz + r() * CHUNK, a = r(), sz = r(), ph = r() * 6.28, tn = r();
      const fd = forestDensity(x, z), tr = trailAmount(x, z), bare = smooth(0.55, 0.75, vnoise(x / 14, z / 14, 5));
      const want = (1 - fd * 0.75) * (1 - tr) * (1 - bare * 0.7) * 0.75 + tr * 0.03;
      if (a > want) continue;
      const tall = vnoise(x / 9, z / 9, 9) > 0.55 && fd < 0.5; // meadow brush patches
      const s = (tall ? 0.6 + sz * 0.5 : 0.28 + sz * 0.35) * (1 - tr * 0.6);
      list.push({ x: x - ox, y: height(x, z) - 0.05, z: z - oz, s, sw: s * 0.8, ph, rot: tn * 6.28, tint: 0.8 + tn * 0.4, tr: 0.95 + sz * 0.15, tb: 0.9 });
    }
    if (!list.length) return;
    const im = new THREE.InstancedMesh(G.tuft.clone(), M.grass, list.length), ph = new Float32Array(list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c3 = new THREE.Color();
    list.forEach((t, k) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot); m4.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.sw, t.s, t.sw)); im.setMatrixAt(k, m4); im.setColorAt(k, c3.setRGB(t.tint * t.tr, t.tint, t.tint * t.tb)); ph[k] = t.ph; });
    im.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
    im.frustumCulled = false; grp.add(im); grp.userData.grassBuilt = true;
  }
  function updateChunks(px, pz) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK), keep = new Set();
    for (let j = -RADIUS; j <= RADIUS; j++) for (let i = -RADIUS; i <= RADIUS; i++) {
      const key = `${ccx + i},${ccz + j}`; keep.add(key);
      let g = chunks.get(key);
      if (!g) { g = buildChunk(ccx + i, ccz + j); chunks.set(key, g); scene.add(g); }
      if (!g.userData.grassBuilt && Math.abs(i) <= GRASS_RADIUS && Math.abs(j) <= GRASS_RADIUS) buildGrass(g);
    }
    for (const [k, g] of chunks) if (!keep.has(k)) { scene.remove(g); g.traverse(o => o.geometry?.dispose()); chunks.delete(k); }
    return { ox: ccx * CHUNK, oz: ccz * CHUNK };
  }

  // ---------- camera choreography: walking, occasional stops to look around ----------
  const V = 1.3, SEG = 45, B = 17; // B = seconds of walking lost per stop (analytic)
  const iS = u => u * u * u - u * u * u * u / 2; // ∫ smoothstep
  const stopW = tau => smooth(8, 11, tau) * (1 - smooth(25, 28, tau));
  const stopInt = tau => { // ∫0..tau stopW
    let v = 0; if (tau > 8) v += 3 * iS(Math.min(1, (tau - 8) / 3));
    if (tau > 11) v += Math.min(tau, 25) - 11;
    if (tau > 25) v += 3 * (Math.min(1, (tau - 25) / 3) - iS(Math.min(1, (tau - 25) / 3)));
    return v;
  };
  const isStop = k => hash3(k, 0, 99) < 0.3;
  let stopCache = { k: 0, n: 0 };
  function stopsBefore(k) {
    if (k < stopCache.k) stopCache = { k: 0, n: 0 };
    for (let i = stopCache.k; i < k; i++) stopCache.n += isStop(i) ? 1 : 0;
    stopCache.k = k; return stopCache.n;
  }
  function pose(t) {
    const k = Math.floor(t / SEG), tau = t - k * SEG, st = isStop(k);
    const s = V * (SEG * k - B * stopsBefore(k) + tau - (st ? stopInt(tau) : 0));
    const walk = st ? 1 - stopW(tau) : 1;
    const wander = (vnoise(s / 9, 0, 30) - 0.5) * 0.9;
    const x = pathX(s) + wander, z = -s;
    const ahead = pathX(s + 4) + (vnoise((s + 4) / 9, 0, 30) - 0.5) * 0.9;
    let yaw = Math.atan2(-(ahead - x), 4);
    let pitch = -0.06 + (vnoise(t / 7, 0, 31) - 0.5) * 0.12;
    yaw += (vnoise(t / 11, 0, 32) - 0.5) * 0.5 * walk;
    if (st) { // a stop: either crane up at the canopy or scan the treeline
      const look = smooth(12, 15.5, tau) * (1 - smooth(21.5, 25.5, tau)), type = hash3(k, 1, 99);
      if (type < 0.5) { pitch += look * (0.95 + type * 0.4); yaw += look * Math.sin(tau * 0.18) * 0.35; }
      else { yaw += look * (type < 0.75 ? 1 : -1) * (0.9 + Math.sin((tau - 12) * 0.25) * 0.4); pitch += look * 0.08; }
    }
    // footstep bob tied to distance, so it fades out when standing still
    const ph = s / 0.72 * Math.PI, h = (height(x, z) * 2 + height(x + 0.5, z) + height(x - 0.5, z) + height(x, z + 0.5) + height(x, z - 0.5)) / 6;
    const breathe = Math.sin(t * 1.6) * 0.008;
    const y = h + 1.62 + walk * 0.028 * (1 - Math.cos(2 * ph)) + breathe;
    const lat = walk * 0.018 * Math.sin(ph);
    return { x: x + Math.cos(yaw) * lat, y, z: -Math.sin(yaw) * lat + z, yaw, pitch: pitch + walk * 0.006 * Math.sin(2 * ph), roll: walk * 0.006 * Math.sin(ph) };
  }

  function setFrame(frame) {
    const t = frame / FPS, p = pose(t);
    const { ox, oz } = updateChunks(p.x, p.z);
    for (const g of chunks.values()) g.position.set(g.userData.ox - ox, 0, g.userData.oz - oz);
    camera.position.set(p.x - ox, p.y, p.z - oz); camera.rotation.set(p.pitch, p.yaw, p.roll);
    sky.position.copy(camera.position);
    // wind: computed on CPU in doubles, so 100h of time never loses float precision in the shader
    const gust = 0.6 + 0.4 * vnoise(t / 6, 0, 40), w1 = 1.3, w2 = 2.9;
    shared.uWind.value.set(Math.sin(w1 * t) * gust, Math.cos(w1 * t) * gust, Math.sin(w2 * t) * gust * 0.5, Math.cos(w2 * t) * gust * 0.5);
    // slow weather drift over hours: fog thickens/thins, cloud cover changes
    const wx = vnoise(t / 900, 0, 41);
    shared.uFog.value.set(6 + wx * 6, 55 + wx * 45);
    sky.material.uniforms.uCover.value = 0.38 + (1 - wx) * 0.3;
    sky.material.uniforms.uOff.value.set((t * 0.0021) % 1, (t * 0.0013) % 1);
  }
  return { scene, camera, setFrame };
}

// ---------- post: 15-bit colour + 4x4 Bayer dither (PSX framebuffer) ----------
export function createPost() {
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  const mat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: rt.texture } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform sampler2D tex; varying vec2 vUv;
      float bayer(vec2 p){ int x = int(mod(p.x,4.0)), y = int(mod(p.y,4.0)); int i = x + y*4;
        int m[16]; m[0]=0;m[1]=8;m[2]=2;m[3]=10;m[4]=12;m[5]=4;m[6]=14;m[7]=6;m[8]=3;m[9]=11;m[10]=1;m[11]=9;m[12]=15;m[13]=7;m[14]=13;m[15]=5;
        for(int k=0;k<16;k++) if(k==i) return float(m[k])/16.0; return 0.0; }
      void main(){ vec3 c = texture2D(tex, vUv).rgb; c = floor(c * 31.0 + bayer(gl_FragCoord.xy)) / 31.0; gl_FragColor = vec4(c, 1.0); }`,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const out = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  return { rt, out, render(renderer) { renderer.setRenderTarget(out); renderer.render(scene, cam); renderer.setRenderTarget(null); } };
}
