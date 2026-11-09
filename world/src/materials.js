// Materials for the apartment. Floors, stones and textiles are photo scans (textures/scans,
// built by tools/interior); terrace pavers and floor grilles are still generated on a canvas. Plaster uses the scanned normal map in ../textures. UVs are metric, so each
// texture's repeat is 1 / (metres the texture covers).
import * as THREE from 'three';
import { finishMat } from './finish.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

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

// coat: { clearcoat, clearcoatRoughness, quest } polished / lacquered finish: a sharp clear layer
// over the textured base (computer); the headset gets a plain material a little glossier instead.
let COAT_OK = true;
function finish(S, { C, H, R }, nk, tile, extra = {}, coat = null) {
  const map = canvasTex(S, (d) => {
    for (let i = 0; i < S * S; i++) {
      for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.max(0, Math.min(255, Math.pow(C[i * 3 + k], 1 / 2.2) * 255));
      d[i * 4 + 3] = 255;
    }
  });
  const normalMap = normalFromHeight(S, H, nk);
  const roughnessMap = grey(S, R);
  for (const t of [map, normalMap, roughnessMap]) t.repeat.set(1 / tile[0], 1 / tile[1]);
  const base = { map, normalMap, roughnessMap, roughness: 1, metalness: 0, ...extra };
  if (coat && COAT_OK) return new THREE.MeshPhysicalMaterial({ ...base, clearcoat: coat.clearcoat, clearcoatRoughness: coat.clearcoatRoughness });
  if (coat) base.roughness = coat.quest;
  return new THREE.MeshStandardMaterial(base);
}
const coated = (P, hex, rough, cc, ccr, questRough, more = {}) => (COAT_OK
  ? new THREE.MeshPhysicalMaterial({ color: hex, roughness: rough, clearcoat: cc, clearcoatRoughness: ccr, ...more })
  : new THREE.MeshStandardMaterial({ color: hex, roughness: questRough, ...more }));

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };   // linear rgb

// ---- photo-scanned surfaces (tools/interior: CC0 scans from Poly Haven and ambientCG, laid and
// colour-matched to the reference photos). metres = what one texture repeat covers.
const SCANS = {
  floor_herringbone: [1.97990, 2.37588], floor_versailles: [1.5, 1.5], floor_planks: [2.4, 2.4],
  stone_travertine: [4.8, 4.8], stone_onyx: [4.8, 4.8], stone_marble: [4.8, 4.8], stone_greymarble: [4.8, 4.8],
  stone_cream: [4.8, 4.8], fabric_boucle: [0.3, 0.3], fabric_rug: [1.7, 1.7], fabric_linen: [1.0, 1.0],
  wood_bleached: [1.0, 1.0], wood_dark: [1.0, 1.0], wood_mid: [1.0, 1.0], wood_walnut: [1.0, 1.0], wood_oak: [1.83, 1.83],
  paint_plaster: [2.0, 2.0],                        // Poly Haven painted_plaster_wall (tools/interior/build_paint.py)
};
// one loader for all of them; M.ready resolves when every scan has arrived (the reflection
// probes are baked after it)
const SCANS_KTX2 = false;                            // on once every headset scan has its .ktx2 beside it
function scanKit(Q) {
  const mgr = new THREE.LoadingManager();
  const tl = new THREE.TextureLoader(mgr);
  const dir = (Q.base || './') + 'textures/scans/' + (Q.quest ? 'quest/' : '');
  const ready = new Promise((res) => { mgr.onLoad = res; mgr.onError = (u) => console.warn('scan failed', u); });
  const cache = new Map();                          // one texture per file (paint and trim share their scans)
  // Headset: UASTC KTX2 beside each WebP (transcoded to ASTC / ETC2: a quarter of the memory at the same detail). The
  // texture handed out is a CompressedTexture filled when its file arrives; a failed KTX2 falls back to the WebP's pixels.
  let kt = null;
  const R = Q.renderer, ex = R && R.extensions;
  if (SCANS_KTX2 && Q.quest && R && Q.ktx2 !== false && ex && (Q.ktx2 === 'force' || ex.has('WEBGL_compressed_texture_astc') || ex.has('WEBGL_compressed_texture_etc'))) {   // force: tests (no ASTC / ETC2: transcoded to RGBA)
    try { kt = new KTX2Loader(mgr).setTranscoderPath('vendor/three/examples/jsm/libs/basis/').setWorkerLimit(2).detectSupport(R); } catch (e) { console.warn('KTX2 off', e); kt = null; }
  }
  const ktxTex = (url) => {
    const t = new THREE.CompressedTexture([], 4, 4);
    kt.load(url.replace(/\.webp$/, '.ktx2'), (c) => {
      t.mipmaps = c.mipmaps; t.image = c.image; t.format = c.format; t.type = c.type;
      t.generateMipmaps = false; t.minFilter = c.mipmaps.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
      t.needsUpdate = true;
    }, undefined, () => {
      new THREE.ImageLoader(mgr).load(url, (img) => {             // fallback: the WebP, one level, uncompressed
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const g = cv.getContext('2d'); g.translate(0, img.height); g.scale(1, -1); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, img.width, img.height).data;
        t.mipmaps = [{ data: new Uint8Array(d.buffer), width: img.width, height: img.height }]; t.image = { width: img.width, height: img.height };
        t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
      });
    });
    return t;
  };
  const tex = (name, k, srgb) => {
    const ck = name + '_' + k; if (cache.has(ck)) return cache.get(ck);
    const url = `${dir}${name}_${k}.webp`;
    const t = kt ? ktxTex(url) : tl.load(url); cache.set(ck, t);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = Q.quest ? 4 : 8;
    const m = SCANS[name]; t.repeat.set(1 / m[0], 1 / m[1]);
    return t;
  };
  // coat: { clearcoat, clearcoatRoughness, quest } as finish() below; fabric: sheen instead
  const scan = (name, { coat = null, fabric = null, nScale = 1, more = {} } = {}) => {
    const arm = tex(name, 'arm', false);
    const base = { map: tex(name, 'diff', true), normalMap: tex(name, 'nor', false), roughnessMap: arm, aoMap: arm, aoMapIntensity: 0.6, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(nScale, nScale), ...more };
    if (fabric && COAT_OK) return new THREE.MeshPhysicalMaterial({ ...base, sheen: 1, sheenColor: new THREE.Color(fabric), sheenRoughness: 0.55 });
    if (coat && COAT_OK) return new THREE.MeshPhysicalMaterial({ ...base, clearcoat: coat.clearcoat, clearcoatRoughness: coat.clearcoatRoughness });
    if (coat) base.roughness = coat.quest / 0.6;      // the scan's roughness is ~0.6: scale it to the headset value
    return new THREE.MeshStandardMaterial(base);
  };
  return { scan, ready, tex };
}

export function makeMaterials(Q) {
  const M = {};
  COAT_OK = !Q.quest;
  const { scan, ready, tex } = scanKit(Q);
  M.ready = ready;
  // floors: oiled smoke-grey oak laid as herringbone (great hall), Versailles panels (dining),
  // long planks (bedrooms); polished stones (sharp reflections), honed travertine (soft); the
  // headset gets plain materials a little glossier instead of a coat
  M.herring = scan('floor_herringbone', { coat: { clearcoat: 0.5, clearcoatRoughness: 0.16, quest: 0.8 } });
  M.parquet = scan('floor_versailles', { coat: { clearcoat: 0.6, clearcoatRoughness: 0.13, quest: 0.75 } });
  M.oak = scan('floor_planks', { coat: { clearcoat: 0.5, clearcoatRoughness: 0.16, quest: 0.8 } });
  M.stone = scan('stone_marble', { coat: { clearcoat: 0.85, clearcoatRoughness: 0.07, quest: 0.5 } });
  M.onyx = scan('stone_onyx', { coat: { clearcoat: 1, clearcoatRoughness: 0.04, quest: 0.45 } });
  M.travertine = scan('stone_travertine', { coat: { clearcoat: 0.25, clearcoatRoughness: 0.3, quest: 0.85 } });
  M.marbleGrey = scan('stone_greymarble', { coat: { clearcoat: 0.85, clearcoatRoughness: 0.06, quest: 0.5 } });
  M.creamStone = scan('stone_cream', { coat: { clearcoat: 0.2, clearcoatRoughness: 0.35, quest: 0.85 } });
  M.boucle = scan('fabric_boucle', { fabric: '#f2ece2', nScale: 0.7 });
  M.rug = scan('fabric_rug', { fabric: '#efe8dc', nScale: 2.2 });
  M.linen = scan('fabric_linen', { fabric: '#f5f1ea', more: { side: THREE.DoubleSide } });
  M.boucleTaupe = scan('fabric_boucle', { fabric: '#cdbfae', nScale: 0.7, more: { color: '#b7a896' } });
  M.velvet = scan('fabric_linen', { fabric: '#e2a46e', nScale: 0.4, more: { color: '#a4673d' } });
  // furniture woods: oiled (satin), the headset plain
  M.woodLight = scan('wood_bleached', { coat: { clearcoat: 0.25, clearcoatRoughness: 0.3, quest: 0.85 } });
  M.woodDark = scan('wood_dark', { coat: { clearcoat: 0.3, clearcoatRoughness: 0.25, quest: 0.8 } });
  M.woodMid = scan('wood_mid', { coat: { clearcoat: 0.3, clearcoatRoughness: 0.25, quest: 0.8 } });
  // table tops: warm American walnut and natural white oak scans (Poly Haven, CC0), grain along u;
  // walnut under a satin-gloss lacquer, oak oiled to a soft sheen (furniture.js lays them as glued boards)
  M.walnut = scan('wood_walnut', { coat: { clearcoat: 0.75, clearcoatRoughness: 0.09, quest: 0.42 }, nScale: 0.8 });
  M.oakNat = scan('wood_oak', { coat: { clearcoat: 0.4, clearcoatRoughness: 0.2, quest: 0.6 }, nScale: 0.9 });
  const SS = Q.stoneTex;
  M.pavers = finish(SS, genStone(SS, 17, { base: lin('#b9b6ae'), vein: lin('#9d9a93'), veinW: 0.01, veinK: 0.2, mottle: 0.7, tile: 2.4, slab: [0.6, 0.6], rough: 0.8 }), 2.5, [2.4, 2.4]);
  M.treadStone = M.stone.clone(); M.treadStone.side = THREE.DoubleSide;

  // walls and ceilings: one coat of paint over plaster, from a scan (Poly Haven painted_plaster_wall, 2 x 2 m): its
  // normal map is the roller stipple and the trowel waves under the paint, its roughness map the sheen that varies
  // with them, its grey diffuse the faint unevenness of the coat. The colour is the paint (the grey map averages 0.85
  // linear, so the colour is divided by it). finish.js samples it without visible repeats and wears it.
  const paint = (hex, rough, nS, more = {}) => {
    const c = new THREE.Color(hex).multiplyScalar(1 / 0.85);
    const m = scan('paint_plaster', { nScale: nS, more: { color: c, roughness: rough, aoMapIntensity: 0.5, ...more } });
    return finishMat(m, 'paint');
  };
  M.plaster = paint('#e9e4db', 1.0, 0.32);                       // eggshell (roughness ~0.8)
  M.plasterWarm = paint('#ddd3c6', 1.0, 0.32);
  M.plasterStair = paint('#c9b9aa', 1.04, 0.42, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });   // greige plaster of the stair hall (apartment-12); wins where the shell meets the hall walls' faces
  M.ceiling = paint('#f1efea', 1.2, 0.16);                       // flat ceiling white (roughness ~0.95), the stipple faint
  M.stairWhite = paint('#eeebe5', 0.95, 0.2, { side: THREE.DoubleSide });

  // metals, wood trim, glass
  M.bronze = new THREE.MeshStandardMaterial({ color: '#3b3029', metalness: 0.75, roughness: 0.38 });
  M.bronzeLight = new THREE.MeshStandardMaterial({ color: '#7a6248', metalness: 0.85, roughness: 0.3 });
  M.blackMetal = new THREE.MeshStandardMaterial({ color: '#141414', metalness: 0.5, roughness: 0.45 });
  // trim: dark oak skirting and casings under a satin lacquer (the scan's grain runs along u = along the board);
  // doors and their casings lacquered white over wood: the grain shows only in the sheen
  M.darkOak = scan('wood_dark', { coat: { clearcoat: 0.55, clearcoatRoughness: 0.14, quest: 0.42 }, nScale: 0.6, more: { color: new THREE.Color(0.5, 0.34, 0.25) } });   // the scan x this = the old #3a2b21 on average
  M.doorWhite = coated(0, '#efece6', 0.42, 0.65, 0.1, 0.3, { normalMap: tex('wood_mid', 'nor', false), normalScale: new THREE.Vector2(0.14, 0.14) });
  M.fireDoor = new THREE.MeshStandardMaterial({ color: '#b9b5ad', roughness: 0.55, metalness: 0.2 });
  M.slot = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 });
  M.glass = new THREE.MeshStandardMaterial({ color: '#000000', roughness: 0.02, metalness: 0.0, transparent: true, opacity: 1, depthWrite: false });
  M.glass.userData = { shadow: 'none', order: 10 };
  M.balGlass = M.glass;
  M.light = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4e2', emissiveIntensity: 2.2, roughness: 1 });
  M.lens = new THREE.MeshStandardMaterial({ color: '#3a3936', roughness: 0.25, metalness: 0.1 });   // downlight lens, off by day (the photos' dark dots)
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
