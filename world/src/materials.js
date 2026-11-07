// Materials for the apartment. Surface textures are generated once at load on a canvas
// (no downloads): smoke-grey oak planks, Versailles parquet, stones, terrace pavers, floor
// grilles. Plaster uses the scanned normal map in ../textures. UVs are metric, so each
// texture's repeat is 1 / (metres the texture covers).
import * as THREE from 'three';

// ---- small noise kit --------------------------------------------------------------------------
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s, period) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const P = period || 1e9, w = (a) => ((a % P) + P) % P;
  const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// tileable fbm: x, y in cells of a period
function fbm(x, y, s, oct, period) {
  let t = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { t += amp * vnoise(x * f, y * f, s + i * 17, period * f); n += amp; amp *= 0.5; f *= 2; }
  return t / n;
}
const rnd = (s) => { let a = s >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ---- canvas -> textures ----------------------------------------------------------------------
function canvasTex(S, fill, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  fill(img.data);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}
// normal map from a tileable height field
function normalFromHeight(S, H, k) {
  return canvasTex(S, (d) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const xl = (x - 1 + S) % S, xr = (x + 1) % S, yu = (y - 1 + S) % S, yd = (y + 1) % S;
      let nx = (H[y * S + xl] - H[y * S + xr]) * k, ny = (H[yu * S + x] - H[yd * S + x]) * k, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * S + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }, false);
}
function grey(S, G) {
  return canvasTex(S, (d) => { for (let i = 0; i < S * S; i++) { const v = Math.max(0, Math.min(255, G[i] * 255)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } }, false);
}

// ---- generators -------------------------------------------------------------------------------
// Smoke-grey solid oak planks, 2.4 m x 2.4 m tile, boards 0.2 m wide running along u.
function genOak(S, seed, tone) {
  const C = new Float32Array(S * S * 3), H = new Float32Array(S * S), R = new Float32Array(S * S);
  const rows = 12, rowH = S / rows, r = rnd(seed);
  const rowOff = [], rowSeed = [];
  for (let i = 0; i < rows; i++) { rowOff.push(Math.floor(r() * S)); rowSeed.push(Math.floor(r() * 1e6)); }
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / rowH), yl = (y - row * rowH) / rowH;
    for (let x = 0; x < S; x++) {
      const xs = (x + rowOff[row]) % S, board = xs < S / 2 ? 0 : 1, bseed = rowSeed[row] + board * 31;
      const b = hash(bseed, 7, 3);
      // grain: long streaks along u, wavy
      const warp = fbm(x / S * 3, yl * 2 + row, bseed, 3, 3) * 6;
      const g = fbm(x / S * 4, yl * 18 + warp, bseed + 5, 4, 4);
      const ring = 0.5 + 0.5 * Math.sin((yl * 9 + warp * 1.4 + g * 3) * Math.PI * 2);
      let v = 0.78 + 0.22 * g + 0.1 * (ring - 0.5) + (b - 0.5) * 0.22;
      // joints: long edges and board ends
      const ex = Math.min(xs % (S / 2), S / 2 - (xs % (S / 2)));
      const ey = Math.min(y - row * rowH, (row + 1) * rowH - 1 - y);
      const joint = ey < 1.2 || ex < 1.2;
      if (joint) v *= 0.45;
      const i = y * S + x;
      C[i * 3] = tone[0] * v; C[i * 3 + 1] = tone[1] * v; C[i * 3 + 2] = tone[2] * v;
      H[i] = joint ? 0 : 0.85 + 0.15 * ring * g;
      R[i] = 0.55 + 0.2 * (1 - g) + (joint ? 0.2 : 0);
    }
  }
  return { C, H, R };
}

// Versailles parquet panel, 1.2 m tile: frame boards round the edge, a 45 degree lattice and
// infill squares; each board its own tone and grain direction.
function genParquet(S, seed, tone) {
  const C = new Float32Array(S * S * 3), H = new Float32Array(S * S), R = new Float32Array(S * S);
  const T = 1.2, fw = 0.075, L = 0.3, lw = 0.055;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S * T, v = y / S * T;
    let id, gu, gv, edge;
    const de = Math.min(u, v, T - u, T - v);
    if (de < fw) {
      const horiz = Math.min(v, T - v) < Math.min(u, T - u);
      id = horiz ? (v < T / 2 ? 1 : 2) : (u < T / 2 ? 3 : 4);
      gu = horiz ? u : v; gv = horiz ? v : u;
      edge = Math.min(fw - de, de, Math.abs(Math.min(u, T - u) - Math.min(v, T - v)) / 1.414);
    } else {
      const cu = u - T / 2, cv = v - T / 2;
      const a = (cu + cv) / Math.SQRT2, b = (cu - cv) / Math.SQRT2;
      const am = ((a % L) + L) % L, bm = ((b % L) + L) % L;
      const ia = Math.floor(a / L), ib = Math.floor(b / L);
      if (am < lw) { id = 10 + ia * 3; gu = b; gv = a; edge = Math.min(am, lw - am); }
      else if (bm < lw) { id = 200 + ib * 3; gu = a; gv = b; edge = Math.min(bm, lw - bm); }
      else { id = 500 + ia * 37 + ib; const alt = (ia + ib) & 1; gu = alt ? a : b; gv = alt ? b : a; edge = Math.min(am - lw, L - am, bm - lw, L - bm); }
      edge = Math.min(edge, de - fw);
    }
    const s = seed + id * 13;
    const b0 = hash(s, 1, 9);
    const warp = fbm(gu * 3, gv * 3, s, 2, 1e6) * 2;
    const g = fbm(gu * 2.5, gv * 40 + warp, s + 3, 4, 1e6);
    let val = 0.76 + 0.26 * g + (b0 - 0.5) * 0.26;
    const joint = edge < T / S * 1.1;
    if (joint) val *= 0.5;
    const i = y * S + x;
    C[i * 3] = tone[0] * val; C[i * 3 + 1] = tone[1] * val; C[i * 3 + 2] = tone[2] * val;
    H[i] = joint ? 0 : 0.9 + 0.1 * g;
    R[i] = 0.5 + 0.2 * (1 - g);
  }
  return { C, H, R };
}

// Stone slabs: base colour, veins (warped fbm iso-lines), optional banding (vein-cut
// travertine), slab joints. tile metres, slab w x h metres.
function genStone(S, seed, o) {
  const C = new Float32Array(S * S * 3), H = new Float32Array(S * S), R = new Float32Array(S * S);
  const per = 4;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const w1 = fbm(u * per, v * per, seed, 4, per) * 2;
    let n = fbm(u * per + w1, v * per + w1 * 0.7, seed + 7, 5, per);
    let vein = 0;
    if (o.band) {
      const b = Math.sin((v * o.band + fbm(u * per, v * per, seed + 3, 3, per) * 1.6) * Math.PI * 2);
      vein = Math.pow(Math.abs(b), 6);
      n = 0.5 + 0.5 * b * 0.4 + (n - 0.5) * 0.6;
    } else {
      const m = Math.abs(fbm(u * per * 0.8 + w1 * 1.3, v * per * 0.8, seed + 11, 5, per * 0.8) - 0.5);
      vein = Math.max(0, 1 - m / o.veinW);
    }
    const t = 0.5 + (n - 0.5) * o.mottle;
    const c = [0, 1, 2].map((k) => o.base[k] * (0.92 + 0.16 * t));
    for (let k = 0; k < 3; k++) c[k] = c[k] * (1 - vein * o.veinK) + o.vein[k] * vein * o.veinK;
    // slab joints
    const ju = (u * o.tile) % o.slab[0], jv = (v * o.tile) % o.slab[1];
    const px = o.tile / S;
    const joint = ju < px * 1.1 || jv < px * 1.1;
    const i = y * S + x;
    for (let k = 0; k < 3; k++) C[i * 3 + k] = joint ? c[k] * 0.72 : c[k];
    H[i] = joint ? 0.2 : 1 - 0.04 * n;
    R[i] = (joint ? 0.6 : o.rough) + 0.06 * n;
  }
  return { C, H, R };
}

function finish(S, { C, H, R }, nk, tile, extra = {}) {
  const map = canvasTex(S, (d) => {
    for (let i = 0; i < S * S; i++) {
      for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.max(0, Math.min(255, Math.pow(C[i * 3 + k], 1 / 2.2) * 255));
      d[i * 4 + 3] = 255;
    }
  });
  const normalMap = normalFromHeight(S, H, nk);
  const roughnessMap = grey(S, R);
  for (const t of [map, normalMap, roughnessMap]) t.repeat.set(1 / tile[0], 1 / tile[1]);
  return new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: 1, metalness: 0, ...extra });
}

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };   // linear rgb

export function makeMaterials(Q) {
  const S = Q.tex, SS = Q.stoneTex, M = {};
  // floors
  M.oak = finish(S, genOak(S, 11, lin('#8b7d6d')), 3.0, [2.4, 2.4]);
  M.parquet = finish(S, genParquet(S, 21, lin('#8f8170')), 3.0, [1.2, 1.2]);
  M.stone = finish(SS, genStone(SS, 3, { base: lin('#ece9e2'), vein: lin('#9aa29a'), veinW: 0.012, veinK: 0.55, mottle: 0.35, tile: 2.4, slab: [1.2, 0.6], rough: 0.32 }), 1.5, [2.4, 2.4]);
  M.onyx = finish(SS, genStone(SS, 5, { base: lin('#efe6d8'), vein: lin('#c9a77b'), veinW: 0.03, veinK: 0.45, mottle: 0.6, tile: 2.4, slab: [1.2, 1.2], rough: 0.2 }), 1.2, [2.4, 2.4]);
  M.travertine = finish(SS, genStone(SS, 9, { base: lin('#d8d2c8'), vein: lin('#a59d92'), band: 22, veinK: 0.5, mottle: 0.5, tile: 2.4, slab: [0.6, 1.2], rough: 0.45 }), 1.5, [2.4, 2.4]);
  M.marbleGrey = finish(SS, genStone(SS, 13, { base: lin('#8f9093'), vein: lin('#d8d8d6'), veinW: 0.01, veinK: 0.6, mottle: 0.5, tile: 2.4, slab: [0.6, 0.6], rough: 0.3 }), 1.5, [2.4, 2.4]);
  M.pavers = finish(SS, genStone(SS, 17, { base: lin('#b9b6ae'), vein: lin('#9d9a93'), veinW: 0.01, veinK: 0.2, mottle: 0.7, tile: 2.4, slab: [0.6, 0.6], rough: 0.8 }), 2.5, [2.4, 2.4]);
  M.treadStone = M.stone.clone(); M.treadStone.side = THREE.DoubleSide;

  // plaster walls and ceilings: warm white paint over the scanned plaster normal map
  const tl = new THREE.TextureLoader();
  const pn = tl.load('./textures/plaster_nor.jpg');
  pn.wrapS = pn.wrapT = THREE.RepeatWrapping; pn.repeat.set(1 / 1.5, 1 / 1.5); pn.anisotropy = 8;
  M.plaster = new THREE.MeshStandardMaterial({ color: '#e9e4db', roughness: 0.92, normalMap: pn, normalScale: new THREE.Vector2(0.12, 0.12) });
  M.plasterWarm = new THREE.MeshStandardMaterial({ color: '#ddd3c6', roughness: 0.92, normalMap: pn, normalScale: new THREE.Vector2(0.12, 0.12) });
  M.ceiling = new THREE.MeshStandardMaterial({ color: '#f1efea', roughness: 0.95 });
  M.stairWhite = new THREE.MeshStandardMaterial({ color: '#eeebe5', roughness: 0.75, side: THREE.DoubleSide });

  // metals, wood trim, glass
  M.bronze = new THREE.MeshStandardMaterial({ color: '#3b3029', metalness: 0.75, roughness: 0.38 });
  M.bronzeLight = new THREE.MeshStandardMaterial({ color: '#7a6248', metalness: 0.85, roughness: 0.3 });
  M.blackMetal = new THREE.MeshStandardMaterial({ color: '#141414', metalness: 0.5, roughness: 0.45 });
  M.darkOak = new THREE.MeshStandardMaterial({ color: '#3a2b21', roughness: 0.5 });
  M.doorWhite = new THREE.MeshStandardMaterial({ color: '#efece6', roughness: 0.35 });
  M.fireDoor = new THREE.MeshStandardMaterial({ color: '#b9b5ad', roughness: 0.55, metalness: 0.2 });
  M.slot = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 });
  M.glass = new THREE.MeshStandardMaterial({ color: '#cfdde3', roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.6 });
  M.glass.userData = { shadow: 'none', order: 10 };
  M.balGlass = M.glass;
  M.light = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4e2', emissiveIntensity: 2.2, roughness: 1 });
  M.light.userData = { shadow: 'none' };

  // linear floor grille along the window walls (fan-coil HVAC), slots across the strip
  const gS = 256;
  const gC = new Float32Array(gS * gS * 3), gH = new Float32Array(gS * gS), gR = new Float32Array(gS * gS);
  for (let y = 0; y < gS; y++) for (let x = 0; x < gS; x++) {
    const i = y * gS + x;
    const slot = (x % 16) > 5 && y > 18 && y < gS - 18;
    const c = slot ? 0.012 : 0.07;
    gC[i * 3] = c * 1.05; gC[i * 3 + 1] = c * 0.9; gC[i * 3 + 2] = c * 0.75;
    gH[i] = slot ? 0 : 1; gR[i] = slot ? 0.9 : 0.4;
  }
  M.grille = finish(gS, { C: gC, H: gH, R: gR }, 4, [0.48, 0.3], { metalness: 0.6 });
  return M;
}
