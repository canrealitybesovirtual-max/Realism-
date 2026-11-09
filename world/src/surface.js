// Surface realism for the apartment (master list: "Surface realism"). Three things on every
// apartment material, through one shader patch:
//  1. Room reflections: fifteen reflection probes baked at load, one in each room with a
//     reflective floor or walls and one on the terrace, kept in one atlas texture and
//     box-projected so reflections sit at the right distance; whole-floor boxes catch the
//     closets and corners. Each surface uses the room its reflected ray
//     goes into; beyond every box (the outside faces) the sky's image light stays.
//  2. Darkness where light cannot reach: contact / corner occlusion from a top-down field of the
//     walls (floor and ceiling edges, inside corners, door heads, under the stair), and a
//     daylight field (how much window each spot sees), so deep core rooms get less sky fill.
//     Both darken only the indirect light; the sun and its shadows are untouched.
//  3. Wet looks: the terrace pavers darken, turn glossy and hold puddles (uWet, 0 dry .. 1 just
//     rained). Glass is real glass: Fresnel reflection on top, a grey absorption below (no
//     milky haze), so a window reflects the room at a glance and shows the city head on.
// The fields are baked on the CPU at load from the apartment's colliders and triangles (~0.2 s).
import * as THREE from 'three';

const GRID = { x0: -0.3, z0: -0.3, x1: 17.9, z1: 19.55, cs: 0.05 };   // 5 cm cells
const TEST_Y = [1.2, 5.8];                                         // floor one / two: a wall at chest height
const BAND = [[0.25, 4.6], [4.85, 9.0]];                           // overhead search per floor

// Reflection probes: one per room with a reflective floor or walls, plus the terrace (wet pavers
// mirror the facade); [min, max] is the room's box (box projection), pos where it is captured.
// The two fallbacks catch the rest of each floor with that floor's main probe.
const PROBES = [
  { min: [0, 0, 0], max: [17.6, 4.25, 6.72], pos: [8.8, 1.6, 3.2] },            // 0 great hall (parquet)
  { min: [7.91, 0, 6.72], max: [9.88, 4.45, 17.55], pos: [8.9, 1.5, 15.0] },    // 1 view gallery (stone)
  { min: [3.46, 0, 6.72], max: [4.74, 3.4, 14.48], pos: [4.1, 1.5, 10.6] },     // 2 hallway (stone)
  { min: [0.9, 0, 14.33], max: [7.91, 3.4, 17.55], pos: [4.4, 1.5, 16.0] },     // 3 media room
  { min: [9.98, 0, 9.98], max: [16.7, 3.4, 17.55], pos: [13.4, 1.5, 14.0] },    // 4 kitchen / breakfast
  { min: [6.18, 0, 12.95], max: [7.81, 3.0, 14.18], pos: [7.0, 1.4, 13.6] },    // 5 powder room (marble)
  { min: [0, 4.6, 0], max: [4.84, 8.2, 6.72], pos: [2.8, 6.1, 3.8] },           // 6 primary bath (onyx)
  { min: [5.04, 4.6, 0], max: [12.62, 8.2, 6.72], pos: [8.8, 6.1, 3.4] },       // 7 primary bedroom
  { min: [12.78, 4.6, 0], max: [17.6, 8.2, 6.72], pos: [15.0, 6.1, 3.4] },      // 8 library
  { min: [6.03, 4.6, 6.72], max: [10.3, 8.2, 14.33], pos: [9.4, 6.1, 8.0] },    // 9 upper gallery (stone)
  { min: [3.46, 4.6, 9.75], max: [6.03, 8.2, 14.33], pos: [4.7, 6.1, 12.0] },   // 10 second bath (travertine)
  { min: [14.75, 4.6, 6.72], max: [16.7, 8.2, 9.6], pos: [15.7, 6.1, 8.2] },    // 11 third bath (marble)
  { min: [0.9, 4.6, 14.48], max: [7.81, 8.2, 17.55], pos: [4.4, 6.1, 16.0] },   // 12 bedroom two
  { min: [9.98, 4.6, 14.48], max: [16.7, 8.2, 17.55], pos: [13.3, 6.1, 16.0] }, // 13 bedroom three
  { min: [0, -0.05, 17.55], max: [17.6, 4.25, 19.3], pos: [9.0, 1.3, 18.45] },  // 14 terrace
];
const FALLBACK = [
  { min: [0, 0, 0], max: [17.6, 4.6, 17.55], tex: 0 },
  { min: [0, 4.6, 0], max: [17.6, 8.6, 17.55], tex: 9 },
];
const NB = PROBES.length + FALLBACK.length;
const PSIZE = 128, COLS = 4;                       // probe cube size; atlas columns
const TW = 3 * Math.max(PSIZE, 112), TH = 4 * PSIZE;  // one PMREM tile (three's cube-UV layout)

// ---- spherical harmonics ---------------------------------------------------------------------
const SHN = 32;                                    // irradiance capture size (per cube face)
let SH_BUF = new Uint16Array(SHN * SHN * 4);
// read a cube capture back and project it on 9 SH coefficients, returned with the irradiance
// convolution and the basis constants folded in, ready for srSH(): E(n) = sum c_i * poly_i(n)
function projectSH(renderer, rt, cubeCam, SHN_ = SHN) {
  const SHN = SHN_;
  if (SH_BUF.length < SHN * SHN * 4) SH_BUF = new Uint16Array(SHN * SHN * 4);
  const L = Array.from({ length: 9 }, () => new THREE.Vector3());
  const d = new THREE.Vector3(), o = new THREE.Vector3();
  cubeCam.getWorldPosition(o);
  const f16 = THREE.DataUtils.fromHalfFloat;
  let wsum = 0;
  for (let face = 0; face < 6; face++) {
    const fc = cubeCam.children[face];
    fc.updateMatrixWorld(true);
    renderer.readRenderTargetPixels(rt, 0, 0, SHN, SHN, SH_BUF, face);
    for (let y = 0; y < SHN; y++) for (let x = 0; x < SHN; x++) {
      const u = (x + 0.5) / SHN * 2 - 1, v = (y + 0.5) / SHN * 2 - 1;
      d.set(u, v, 0.5).unproject(fc).sub(o).normalize();
      const w = 4 / (SHN * SHN) / Math.pow(1 + u * u + v * v, 1.5);
      const i = (y * SHN + x) * 4, r = f16(SH_BUF[i]) * w, g = f16(SH_BUF[i + 1]) * w, b = f16(SH_BUF[i + 2]) * w;
      const Y = [0.282095, 0.488603 * d.y, 0.488603 * d.z, 0.488603 * d.x, 1.092548 * d.x * d.y, 1.092548 * d.y * d.z, 0.315392 * (3 * d.z * d.z - 1), 1.092548 * d.x * d.z, 0.546274 * (d.x * d.x - d.y * d.y)];
      for (let k = 0; k < 9; k++) { L[k].x += r * Y[k]; L[k].y += g * Y[k]; L[k].z += b * Y[k]; }
      wsum += w;
    }
  }
  const norm = 4 * Math.PI / wsum;
  const A = [Math.PI, 2 * Math.PI / 3, 2 * Math.PI / 3, 2 * Math.PI / 3, Math.PI / 4, Math.PI / 4, Math.PI / 4, Math.PI / 4, Math.PI / 4];
  const C = [0.282095, 0.488603, 0.488603, 0.488603, 1.092548, 1.092548, 0.315392, 1.092548, 0.546274];
  return L.map((l, k) => l.multiplyScalar(norm * A[k] * C[k]));
}

// ---- fields --------------------------------------------------------------------------------
function bakeFields(meshes, colliders, M) {
  const { x0, z0, x1, z1, cs } = GRID;
  const W = Math.ceil((x1 - x0) / cs), D = Math.ceil((z1 - z0) / cs), N = W * D;
  const solid = [new Uint8Array(N), new Uint8Array(N)];             // 0 free, 1 wall, 2 glass
  const over = [new Float32Array(N).fill(99), new Float32Array(N).fill(99)];
  const cell = (x, z) => [Math.floor((x - x0) / cs), Math.floor((z - z0) / cs)];

  // walls, columns, cores, door leaves, the stair shell (boxes and oriented boxes standing
  // through chest height); glass marked separately (it lets daylight in, it does not occlude)
  for (const c of colliders) {
    if (!c.mat || (c.t !== 'box' && c.t !== 'obox')) continue;
    const g = c.mat === M.glass ? 2 : 1;
    for (let f = 0; f < 2; f++) {
      const ty = TEST_Y[f];
      if (c.t === 'box') {
        if (c.min[1] > ty || c.max[1] < ty) continue;
        const [i0, k0] = cell(c.min[0] + cs * 0.5, c.min[2] + cs * 0.5), [i1, k1] = cell(c.max[0] - cs * 0.5, c.max[2] - cs * 0.5);
        for (let k = Math.max(0, k0); k <= Math.min(D - 1, Math.max(k0, k1)); k++)
          for (let i = Math.max(0, i0); i <= Math.min(W - 1, Math.max(i0, i1)); i++) {
            const j = k * W + i; if (solid[f][j] !== 1) solid[f][j] = g;
          }
      } else {
        if (c.c[1] - c.h[1] > ty || c.c[1] + c.h[1] < ty) continue;
        const r = Math.hypot(c.h[0], c.h[2]), co = Math.cos(c.yaw), si = Math.sin(c.yaw);
        const [i0, k0] = cell(c.c[0] - r, c.c[2] - r), [i1, k1] = cell(c.c[0] + r, c.c[2] + r);
        const hx = Math.max(c.h[0], cs * 0.5), hz = Math.max(c.h[2], cs * 0.5);
        for (let k = Math.max(0, k0); k <= Math.min(D - 1, k1); k++)
          for (let i = Math.max(0, i0); i <= Math.min(W - 1, i1); i++) {
            const dx = x0 + (i + 0.5) * cs - c.c[0], dz = z0 + (k + 0.5) * cs - c.c[2];
            // world -> local for a rotation about y by yaw: local x = dx cos + (-dz) sin ... (Rapier / three: x' = x c - z s)
            const lx = dx * co - dz * si, lz = dx * si + dz * co;
            if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) { const j = k * W + i; if (solid[f][j] !== 1) solid[f][j] = g; }
          }
      }
    }
  }

  // overhead: the lowest down-facing surface above each cell's floor (ceilings, soffits, door
  // heads, the stair's underside)
  const P = new THREE.Vector3(), Q = new THREE.Vector3(), R = new THREE.Vector3();
  for (const m of meshes) {
    if (m.material === M.glass || m.material === M.light || m.material.transparent || m.geometry.index || m.userData.noField || m.userData.noOver) continue;
    const a = m.geometry.attributes.position.array;
    for (let t = 0; t < a.length; t += 9) {
      P.set(a[t], a[t + 1], a[t + 2]); Q.set(a[t + 3], a[t + 4], a[t + 5]); R.set(a[t + 6], a[t + 7], a[t + 8]);
      const ux = Q.x - P.x, uy = Q.y - P.y, uz = Q.z - P.z, vx = R.x - P.x, vy = R.y - P.y, vz = R.z - P.z;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz); if (nl < 1e-9 || ny / nl > -0.3) continue;
      const ymin = Math.min(P.y, Q.y, R.y), ymax = Math.max(P.y, Q.y, R.y);
      for (let f = 0; f < 2; f++) {
        if (ymax < BAND[f][0] || ymin > BAND[f][1]) continue;
        const [i0, k0] = cell(Math.min(P.x, Q.x, R.x), Math.min(P.z, Q.z, R.z)), [i1, k1] = cell(Math.max(P.x, Q.x, R.x), Math.max(P.z, Q.z, R.z));
        // barycentric in xz
        const d = (Q.z - R.z) * (P.x - R.x) + (R.x - Q.x) * (P.z - R.z); if (Math.abs(d) < 1e-12) continue;
        for (let k = Math.max(0, k0); k <= Math.min(D - 1, k1); k++)
          for (let i = Math.max(0, i0); i <= Math.min(W - 1, i1); i++) {
            const x = x0 + (i + 0.5) * cs, z = z0 + (k + 0.5) * cs;
            const l1 = ((Q.z - R.z) * (x - R.x) + (R.x - Q.x) * (z - R.z)) / d;
            const l2 = ((R.z - P.z) * (x - R.x) + (P.x - R.x) * (z - R.z)) / d;
            const l3 = 1 - l1 - l2;
            if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
            const y = l1 * P.y + l2 * Q.y + l3 * R.y;
            if (y < BAND[f][0] || y > BAND[f][1]) continue;
            const j = k * W + i; if (y < over[f][j]) over[f][j] = y;
          }
      }
    }
  }

  // blur: occupancy (box blur twice, 0.4 m) -> how much wall surrounds a spot; overhead lightly
  const blur = (src, r, passes) => {
    let a = Float32Array.from(src), b = new Float32Array(N);
    for (let p = 0; p < passes; p++) {
      for (let k = 0; k < D; k++) {                 // along x
        let s = 0; const row = k * W;
        for (let i = -r; i <= r; i++) s += a[row + Math.min(W - 1, Math.max(0, i))];
        for (let i = 0; i < W; i++) {
          b[row + i] = s / (2 * r + 1);
          s += a[row + Math.min(W - 1, i + r + 1)] - a[row + Math.max(0, i - r)];
        }
      }
      for (let i = 0; i < W; i++) {                 // along z
        let s = 0;
        for (let k = -r; k <= r; k++) s += b[Math.min(D - 1, Math.max(0, k)) * W + i];
        for (let k = 0; k < D; k++) {
          a[k * W + i] = s / (2 * r + 1);
          s += b[Math.min(D - 1, k + r + 1) * W + i] - b[Math.max(0, k - r) * W + i];
        }
      }
    }
    return a;
  };
  const occ = solid.map((s) => blur(Array.from(s, (v) => (v === 1 ? 1 : 0)), 8, 2));
  const ovN = over.map((o, f) => blur(Array.from(o, (y) => Math.min(1, (y - (f ? 4.6 : 0)) / 6)), 2, 1));
  const ao = new Uint8Array(N * 4);
  for (let j = 0; j < N; j++) {
    ao[j * 4] = occ[0][j] * 255; ao[j * 4 + 1] = ovN[0][j] * 255;
    ao[j * 4 + 2] = occ[1][j] * 255; ao[j * 4 + 3] = ovN[1][j] * 255;
  }
  const aoTex = new THREE.DataTexture(ao, W, D, THREE.RGBAFormat);
  aoTex.magFilter = aoTex.minFilter = THREE.LinearFilter; aoTex.needsUpdate = true;

  // daylight: on a 20 cm grid, 24 horizontal rays per spot; a ray that meets glass or leaves
  // the building counts 1 / (1 + d / 2.5); a wall stops it
  const C = 4, Wc = Math.ceil(W / C), Dc = Math.ceil(D / C), dl = new Uint8Array(Wc * Dc * 4);
  const RAYS = 24, step = cs * 2, maxD = 14;
  const dirs = []; for (let r = 0; r < RAYS; r++) { const a = (r + 0.5) / RAYS * Math.PI * 2; dirs.push([Math.cos(a), Math.sin(a)]); }
  for (let f = 0; f < 2; f++) {
    const S = solid[f], val = new Float32Array(Wc * Dc), free = new Uint8Array(Wc * Dc);
    for (let kc = 0; kc < Dc; kc++) for (let ic = 0; ic < Wc; ic++) {
      const x = x0 + (ic + 0.5) * C * cs, z = z0 + (kc + 0.5) * C * cs;
      const [i, k] = cell(x, z);
      if (i < 0 || k < 0 || i >= W || k >= D || S[k * W + i] === 1) continue;
      free[kc * Wc + ic] = 1;
      let sum = 0;
      for (const [dx, dz] of dirs) {
        for (let d = step; d < maxD; d += step) {
          const xi = Math.floor((x + dx * d - x0) / cs), zi = Math.floor((z + dz * d - z0) / cs);
          if (xi < 0 || zi < 0 || xi >= W || zi >= D) { sum += 1 / (1 + d / 2.5); break; }
          const v = S[zi * W + xi];
          if (v === 2) { sum += 1 / (1 + d / 2.5); break; }
          if (v === 1) break;
        }
      }
      val[kc * Wc + ic] = Math.min(1, Math.sqrt(sum / RAYS * 4.5));
    }
    // fill wall cells from their free neighbours so wall faces read the room beside them
    for (let pass = 0; pass < 3; pass++) {
      const nv = Float32Array.from(val), nf = Uint8Array.from(free);
      for (let kc = 0; kc < Dc; kc++) for (let ic = 0; ic < Wc; ic++) {
        const j = kc * Wc + ic; if (free[j]) continue;
        let s = 0, n = 0;
        for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
          const a = ic + di, b = kc + dk; if (a < 0 || b < 0 || a >= Wc || b >= Dc) continue;
          const q = b * Wc + a; if (free[q]) { s += val[q]; n++; }
        }
        if (n) { nv[j] = s / n; nf[j] = 1; }
      }
      val.set(nv); free.set(nf);
    }
    for (let j = 0; j < Wc * Dc; j++) dl[j * 4 + f] = val[j] * 255;
  }
  for (let j = 0; j < Wc * Dc; j++) dl[j * 4 + 3] = 255;
  const dlTex = new THREE.DataTexture(dl, Wc, Dc, THREE.RGBAFormat);
  dlTex.magFilter = dlTex.minFilter = THREE.LinearFilter; dlTex.needsUpdate = true;
  // contact shadows: furniture standing on the floor darkens the floor round its footprint and
  // its own base (5 cm grid, blurred 15 cm twice), taller pieces darker
  const ct = [new Float32Array(N), new Float32Array(N)];
  for (const c of colliders) {
    if (!c.furn) continue;
    const bot = c.t === 'box' ? c.min[1] : c.c[1] - c.h[1], top = c.t === 'box' ? c.max[1] : c.c[1] + c.h[1];
    const f = bot > 4.45 ? 1 : 0, lv = f ? 4.6 : 0;
    if (bot - lv > 0.2 || top - bot < 0.05) continue;
    const wgt = Math.min(1, 0.45 + (top - bot) / 0.9);
    const cx = c.t === 'box' ? (c.min[0] + c.max[0]) / 2 : c.c[0], cz = c.t === 'box' ? (c.min[2] + c.max[2]) / 2 : c.c[2];
    const hx = c.t === 'box' ? (c.max[0] - c.min[0]) / 2 : c.h[0], hz = c.t === 'box' ? (c.max[2] - c.min[2]) / 2 : c.h[2];
    const yaw = c.t === 'box' ? 0 : c.yaw, co = Math.cos(yaw), si = Math.sin(yaw), r = Math.hypot(hx, hz);
    const [i0, k0] = cell(cx - r, cz - r), [i1, k1] = cell(cx + r, cz + r);
    for (let k = Math.max(0, k0); k <= Math.min(D - 1, k1); k++)
      for (let i = Math.max(0, i0); i <= Math.min(W - 1, i1); i++) {
        const dx = x0 + (i + 0.5) * cs - cx, dz = z0 + (k + 0.5) * cs - cz;
        const lx = dx * co - dz * si, lz = dx * si + dz * co;
        if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) { const j = k * W + i; ct[f][j] = Math.max(ct[f][j], wgt); }
      }
  }
  const ctb = ct.map((a) => blur(a, 3, 2));
  const ctd = new Uint8Array(N * 4);
  for (let j = 0; j < N; j++) { ctd[j * 4] = Math.min(1, ctb[0][j]) * 255; ctd[j * 4 + 1] = Math.min(1, ctb[1][j]) * 255; ctd[j * 4 + 3] = 255; }
  const ctTex = new THREE.DataTexture(ctd, W, D, THREE.RGBAFormat);
  ctTex.magFilter = ctTex.minFilter = THREE.LinearFilter; ctTex.needsUpdate = true;
  return { aoTex, dlTex, ctTex, W, D, solid };
}

// ---- shader patch ----------------------------------------------------------------------------
const VERT_PARS = /* glsl */`
varying vec3 vSrPos;
varying vec3 vSrNrm;`;
const VERT_MAIN = /* glsl */`
vSrPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vSrNrm = normalize( mat3( modelMatrix ) * objectNormal );`;
// framed (the apartment inside another world, e.g. CQC): apartment coordinates = uSrInv x world
const VERT_PARS_F = VERT_PARS + `
uniform mat4 uSrInv;`;
const VERT_MAIN_F = /* glsl */`
vSrPos = ( uSrInv * modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vSrNrm = normalize( mat3( uSrInv ) * mat3( modelMatrix ) * objectNormal );`;
// SR_A: a world direction into apartment axes; SR_W: back (rotation only, so the inverse is the transpose)
const FRAME_ID = '#define SR_A( v ) ( v )\n#define SR_W( v ) ( v )\n';
const FRAME_ON = 'uniform mat4 uSrInv;\n#define SR_A( v ) ( mat3( uSrInv ) * ( v ) )\n#define SR_W( v ) ( ( v ) * mat3( uSrInv ) )\n';

const FRAG_PARS = /* glsl */`
varying vec3 vSrPos;
varying vec3 vSrNrm;
uniform sampler2D uSrAO;
uniform sampler2D uSrCT;
uniform sampler2D uSrDL;
uniform vec4 uSrG;
uniform float uSrOn;
uniform float uSrDLMin;
uniform float uWet;
uniform float uGlassAbs;
uniform sampler2D uLamp0, uLamp1;
uniform vec3 uLampG;
uniform vec2 uLampSz;
uniform vec4 uHoleR[ 4 ];
uniform float uHoleY[ 4 ];
// real openings: down-facing surfaces round a downlight (its can shows through) and floor
// surfaces over the window grilles (the trough and bars show through)
void srHoles( vec3 p, vec3 n ) {
  if ( n.y < - 0.7 ) {
    vec2 c = ( p.xz - uLampG.xy ) / uLampG.z;
    vec2 cell = floor( c );
    vec2 tuv = ( cell + 0.5 ) / uLampSz;
    vec4 L = p.y > 4.45 ? texture2D( uLamp1, tuv ) : texture2D( uLamp0, tuv );
    vec2 lc = uLampG.xy + ( cell + 0.5 ) * uLampG.z + L.xy;
    if ( L.w > 0.5 && p.y > L.z - 0.03 && p.y < L.z + 0.045 && distance( p.xz, lc ) < 0.05 ) discard;   // the ceiling and the slab face above it
  } else if ( n.y > 0.7 ) {
    for ( int i = 0; i < 4; i ++ ) {
      vec4 r = uHoleR[ i ];
      if ( p.x > r.x && p.x < r.z && p.z > r.y && p.z < r.w && abs( p.y - uHoleY[ i ] ) < 0.004 ) discard;
    }
  }
}
float srHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float srNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( srHash( i ), srHash( i + vec2( 1, 0 ) ), u.x ), mix( srHash( i + vec2( 0, 1 ) ), srHash( i + vec2( 1, 1 ) ), u.x ), u.y );
}
// corner / contact occlusion from the wall field and the overhead height
float srAO( vec3 p, vec3 n ) {
  bool f2 = p.y > 4.45;
  float lv = f2 ? 4.6 : 0.0;
  vec4 t = texture2D( uSrAO, ( p.xz + n.xz * 0.06 - uSrG.xy ) * uSrG.zw );
  float occ = f2 ? t.b : t.r;
  float oh = lv + ( f2 ? t.a : t.g ) * 6.0;
  float up = oh - p.y; up = up < -0.05 ? 9.0 : max( up, 0.0 );       // nothing overhead counts if it is below us
  float h = max( p.y - lv, 0.0 );
  float ao;
  if ( n.y > 0.6 ) {
    ao = ( 1.0 - 0.62 * pow( occ, 1.15 ) ) * ( 1.0 - 0.5 * exp( - up / 0.9 ) );
  } else if ( n.y < - 0.6 ) {
    ao = 1.0 - 0.5 * pow( occ, 1.15 );
  } else {
    float corner = clamp( ( occ - 0.36 ) * 1.7, 0.0, 1.0 );
    ao = ( 1.0 - 0.42 * exp( - h / 0.2 ) ) * ( 1.0 - 0.32 * exp( - up / 0.2 ) ) * ( 1.0 - 0.45 * corner );
  }
  // contact shadow from furniture on the floor (sampled just outside the surface)
  vec4 ctt = texture2D( uSrCT, ( p.xz + n.xz * 0.05 - uSrG.xy ) * uSrG.zw );
  float ctc = f2 ? ctt.g : ctt.r;
  if ( n.y > 0.6 ) ao *= 1.0 - 0.6 * ctc * ( 1.0 - smoothstep( 0.02, 0.08, h ) );
  else if ( n.y > - 0.6 ) ao *= 1.0 - 0.4 * ctc * exp( - h / 0.14 );
  return clamp( ao, 0.0, 1.0 );
}
float srDay( vec3 p, vec3 n ) {
  vec4 t = texture2D( uSrDL, ( p.xz + n.xz * 0.12 - uSrG.xy ) * uSrG.zw );
  return mix( uSrDLMin, 1.0, p.y > 4.45 ? t.g : t.r );
}`;

const ENV_PARS = /* glsl */`
#ifdef USE_ENVMAP
uniform sampler2D uPAtlas;
uniform vec2 uPAtlasSize;
uniform vec3 uBMin[ ${NB} ];
uniform vec3 uBMax[ ${NB} ];
uniform vec3 uBPos[ ${NB} ];
uniform float uBTex[ ${NB} ];
uniform float uProbeOn;
uniform float uIrrOn;
uniform float uIrrK;
uniform vec3 uSH[ ${PROBES.length * 9} ];
// irradiance volume: probes every uIVS metres in x / z on 8 layers (4 per floor), L1 spherical
// harmonics in four textures (layers side by side); trilinear inside a floor
uniform float uIVOn;
uniform sampler2D uIV0, uIV1, uIV2, uIV3;
uniform vec4 uIVG;              // x0, z0, spacing, nx
uniform vec2 uIVT;              // texture width, height
uniform float uIVY[ 8 ];
vec3 srIVLayer( int l, vec2 g, vec3 n ) {
  vec2 uv = vec2( ( float( l ) * uIVG.w + g.x + 0.5 ) / uIVT.x, ( g.y + 0.5 ) / uIVT.y );
  vec3 c0 = texture2D( uIV0, uv ).rgb, c1 = texture2D( uIV1, uv ).rgb, c2 = texture2D( uIV2, uv ).rgb, c3 = texture2D( uIV3, uv ).rgb;
  return c0 + c1 * n.y + c2 * n.z + c3 * n.x;
}
vec3 srIV( vec3 p, vec3 n ) {
  vec3 q = p + n * 0.18;
  vec2 g = clamp( ( q.xz - uIVG.xy ) / uIVG.z, vec2( 0.0 ), vec2( uIVG.w - 1.0, uIVT.y - 1.0 ) );
  int lo = p.y > 4.45 ? 4 : 0;
  float y = clamp( q.y, uIVY[ lo ], uIVY[ lo + 3 ] );
  int l = lo;
  if ( y > uIVY[ lo + 1 ] ) l = lo + 1;
  if ( y > uIVY[ lo + 2 ] ) l = lo + 2;
  float t = clamp( ( y - uIVY[ l ] ) / ( uIVY[ l + 1 ] - uIVY[ l ] ), 0.0, 1.0 );
  return max( vec3( 0.0 ), mix( srIVLayer( l, g, n ), srIVLayer( l + 1, g, n ), t ) );
}
// irradiance from probe t's spherical harmonics (band constants folded in on the CPU)
vec3 srSH( int t, vec3 n ) {
  int b = t * 9;
  return max( vec3( 0.0 ), uSH[ b ] + uSH[ b + 1 ] * n.y + uSH[ b + 2 ] * n.z + uSH[ b + 3 ] * n.x
    + uSH[ b + 4 ] * ( n.x * n.y ) + uSH[ b + 5 ] * ( n.y * n.z ) + uSH[ b + 6 ] * ( 3.0 * n.z * n.z - 1.0 )
    + uSH[ b + 7 ] * ( n.x * n.z ) + uSH[ b + 8 ] * ( n.x * n.x - n.y * n.y ) );
}
// the first box (room) containing q, or -1
int srBox( vec3 q ) {
  int k = - 1;
  for ( int i = 0; i < ${NB}; i ++ ) {
    if ( k < 0 && all( greaterThanEqual( q, uBMin[ i ] - 0.03 ) ) && all( lessThanEqual( q, uBMax[ i ] + 0.03 ) ) ) k = i;
  }
  return k;
}
#ifdef ENVMAP_TYPE_CUBE_UV
// three's cube-UV lookup, reading one tile of the probe atlas
#define SR_MAX_MIP ${Math.log2(TH) - 2}.0
vec3 srBil( vec2 org, vec3 direction, float mipInt ) {
  float face = getFace( direction );
  float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
  mipInt = max( mipInt, cubeUV_minMipLevel );
  float faceSize = exp2( mipInt );
  highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
  if ( face > 2.0 ) { uv.y += faceSize; face -= 3.0; }
  uv.x += face * faceSize;
  uv.x += filterInt * 3.0 * cubeUV_minTileSize;
  uv.y += 4.0 * ( exp2( SR_MAX_MIP ) - faceSize );
  return texture2D( uPAtlas, ( org + uv ) / uPAtlasSize ).rgb;
}
vec3 srProbe( float t, vec3 d, float r ) {
  vec2 org = vec2( mod( t, ${COLS}.0 ), floor( t / ${COLS}.0 ) ) * vec2( ${TW}.0, ${TH}.0 );
  float mip = clamp( roughnessToMip( r ), cubeUV_m0, SR_MAX_MIP );
  float mipF = fract( mip ), mipInt = floor( mip );
  vec3 c0 = srBil( org, d, mipInt );
  if ( mipF == 0.0 ) return c0;
  return mix( c0, srBil( org, d, mipInt + 1.0 ), mipF );
}
#endif
// diffuse light: once the probes are baked, the room's own probe (what this room sees: the
// windows at daylight level, the city, the sunlit floor, walls and ceiling) as 9 spherical
// harmonics, so light bounces as it does in the photos; before that (first bake pass) the
// sky's image light
vec3 getIBLIrradiance( const in vec3 normal ) {
  #ifdef ENVMAP_TYPE_CUBE_UV
    vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
    if ( uIrrOn > 0.5 ) {
      if ( uIVOn > 0.5 && vSrPos.z < 19.3 ) return srIV( vSrPos, SR_A( worldNormal ) ) * uIrrK;
      int k = srBox( vSrPos + SR_A( worldNormal ) * 0.1 );
      if ( k >= 0 ) return srSH( int( uBTex[ k ] + 0.5 ), worldNormal ) * uIrrK;
    }
    vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
    return PI * envMapColor.rgb * envMapIntensity;
  #else
    return vec3( 0.0 );
  #endif
}
vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
  #ifdef ENVMAP_TYPE_CUBE_UV
    vec3 reflectVec = reflect( - viewDir, normal );
    reflectVec = normalize( mix( reflectVec, normal, roughness * roughness ) );
    reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
    if ( uProbeOn > 0.5 ) {
      // the room the reflected ray goes into: a point just along it (so a wall or a pane
      // between two rooms, or between a room and outside, reflects the side the eye is on)
      vec3 srRA = SR_A( reflectVec );
      int k = srBox( vSrPos + srRA * 0.12 );
      if ( k >= 0 ) {
        vec3 bmin = uBMin[ k ] - 0.03, bmax = uBMax[ k ] + 0.03;
        vec3 rv = srRA + vec3( equal( srRA, vec3( 0.0 ) ) ) * 1e-4;
        vec3 tf = max( ( bmax - vSrPos ) / rv, ( bmin - vSrPos ) / rv );
        float dd = max( min( min( tf.x, tf.y ), tf.z ), 0.0 );
        vec3 bp = normalize( vSrPos + rv * dd - uBPos[ k ] );
        vec3 d = normalize( mix( bp, srRA, roughness ) );
        return srProbe( uBTex[ k ], SR_W( d ), roughness );
      }
    }
    vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
    return envMapColor.rgb * envMapIntensity;
  #else
    return vec3( 0.0 );
  #endif
}
#endif`;

const AO_APPLY = /* glsl */`
if ( uSrOn > 0.5 ) {
  vec3 srN = normalize( vSrNrm ) * ( gl_FrontFacing ? 1.0 : - 1.0 );
  float srA = srAO( vSrPos, srN );
  reflectedLight.indirectDiffuse *= srA * srDay( vSrPos, srN );
  reflectedLight.indirectSpecular *= mix( 1.0, srA, 0.75 );
  #ifdef USE_CLEARCOAT
    clearcoatSpecularIndirect *= mix( 1.0, srA, 0.75 );
  #endif
}`;

// wet pavers: darker (water fills the pores), glossy film, puddles in the low spots and joints
const WET_ROUGH = /* glsl */`
float srPud = 0.0;
if ( uWet > 0.001 ) {
  vec2 q = vSrPos.xz;
  float n = srNoise( q * 1.1 ) * 0.55 + srNoise( q * 3.3 + 7.0 ) * 0.3 + srNoise( q * 9.0 + 3.0 ) * 0.15;
  float th = mix( 1.15, 0.5, uWet );
  srPud = smoothstep( th, th + 0.03, n );
  diffuseColor.rgb *= mix( 1.0, 0.42, uWet ) * mix( 1.0, 0.7, srPud );
  roughnessFactor = mix( roughnessFactor, 0.1, uWet * 0.9 );
  roughnessFactor = mix( roughnessFactor, 0.02, srPud );
}`;
const WET_NORMAL = /* glsl */`
normal = normalize( mix( normal, nonPerturbedNormal, max( srPud, uWet * 0.55 ) ) );`;

// glass: Fresnel reflection on top, grey absorption below, nothing scattered
const GLASS_OUT = /* glsl */`
// the room seen in the glass is weighed against daylight outside, which is ~20x brighter than the
// room: the photos show only a faint ghost, strongest at grazing angles
float srF = 0.04 + 0.96 * pow( 1.0 - saturate( dot( normal, geometryViewDir ) ), 5.0 );
float srK = mix( 0.22, 1.0, srF );
gl_FragColor = vec4( totalSpecular * srK, srF * srK + ( 1.0 - srF * srK ) * uGlassAbs );`;

function patch(mat, kind, U, framed = false) {
  const base = mat.userData.srBase !== undefined ? mat.userData.srBase : (mat.userData.srBase = mat.onBeforeCompile || null);   // finish.js (paint, wear) stays under it
  const baseKey = mat.userData.srKey !== undefined ? mat.userData.srKey : (mat.userData.srKey = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey : null);
  mat.onBeforeCompile = (sh, r) => {
    if (base) base.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + (framed ? VERT_PARS_F : VERT_PARS))
      .replace('#include <fog_vertex>', '#include <fog_vertex>' + (framed ? VERT_MAIN_F : VERT_MAIN));
    let f = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + (framed ? FRAME_ON : FRAME_ID) + FRAG_PARS)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if ( uSrOn > 0.5 ) srHoles( vSrPos, normalize( vSrNrm ) * ( gl_FrontFacing ? 1.0 : - 1.0 ) );')
      .replace('#include <envmap_physical_pars_fragment>', ENV_PARS);
    if (kind !== 'glass') f = f.replace('#include <aomap_fragment>', '#include <aomap_fragment>' + AO_APPLY);
    if (kind === 'wet') {
      f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>' + WET_ROUGH)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + WET_NORMAL);
    }
    if (kind === 'glass') f = f.replace('#include <opaque_fragment>', GLASS_OUT).replace('#include <premultiplied_alpha_fragment>', '');
    sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => (baseKey ? baseKey.call(mat) + '|' : '') + (framed ? 'sr5f-' : 'sr5-') + kind;
  mat.needsUpdate = true;
}

export function setupSurfaces({ scene, renderer, apt, M, Q, hemi = null, hemiGI = 0.12, viewGain = null, daylight = 8, whiteBalance = [1.1, 1.0, 0.93], lamps = [], lampPower = 16, frame = null, bakeLamps = true }) {
  const t0 = performance.now();
  // frame: the apartment's group when it is placed inside another world (CQC); positions / directions
  // given here are apartment coordinates, so captures go through frame.matrixWorld and the shaders
  // through its inverse (uSrInv). No frame = world == apartment (the world page), the identity path.
  const FM = new THREE.Matrix4(), _fv = new THREE.Vector3();
  const toW = (a) => (frame ? _fv.set(a[0], a[1], a[2]).applyMatrix4(FM) : _fv.set(a[0], a[1], a[2]));
  function syncFrame() {
    if (!frame) return false;
    frame.updateWorldMatrix(true, false);
    if (FM.equals(frame.matrixWorld)) return false;
    FM.copy(frame.matrixWorld); U.uSrInv.value.copy(FM).invert();
    return true;
  }
  const F = bakeFields(apt.meshes, apt.colliders, M);
  const env = scene.environment;
  const vec = (a) => new THREE.Vector3(...a);
  const boxes = [...PROBES.map((p, i) => ({ ...p, tex: i })), ...FALLBACK.map((b) => ({ ...b, pos: PROBES[b.tex].pos }))];
  const U = {
    uSrAO: { value: F.aoTex }, uSrCT: { value: F.ctTex }, uSrDL: { value: F.dlTex },
    uSrG: { value: new THREE.Vector4(GRID.x0, GRID.z0, 1 / (F.W * GRID.cs), 1 / (F.D * GRID.cs)) },
    uSrOn: { value: 1 }, uSrDLMin: { value: 0.7 }, uWet: { value: 0.8 }, uGlassAbs: { value: 0.08 },
    uPAtlas: { value: null }, uPAtlasSize: { value: new THREE.Vector2(1, 1) },
    uBMin: { value: boxes.map((b) => vec(b.min)) }, uBMax: { value: boxes.map((b) => vec(b.max)) },
    uBPos: { value: boxes.map((b) => vec(b.pos)) }, uBTex: { value: boxes.map((b) => b.tex) },
    uProbeOn: { value: 0 }, uIrrOn: { value: 0 }, uIrrK: { value: 1 },
    uSH: { value: Array.from({ length: PROBES.length * 9 }, () => new THREE.Vector3()) },
    uIVOn: { value: 0 }, uIV0: { value: null }, uIV1: { value: null }, uIV2: { value: null }, uIV3: { value: null },
    uIVG: { value: new THREE.Vector4() }, uIVT: { value: new THREE.Vector2(1, 1) }, uIVY: { value: new Array(8).fill(0) },
  };
  if (frame) { U.uSrInv = { value: new THREE.Matrix4() }; FM.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); syncFrame(); }
  // openings: lamp cans (per floor: nearest lamp offset, its height, a flag) and grille strips
  const LC = 0.05, LW = Math.ceil((GRID.x1 - GRID.x0) / LC), LD = Math.ceil((GRID.z1 - GRID.z0) / LC);
  const lampTex = [0, 1].map((fl) => {
    const d = new Float32Array(LW * LD * 4);
    for (const [x, y, z] of apt.lamps || []) {
      if ((y > 4.45 ? 1 : 0) !== fl) continue;
      const ci = Math.floor((x - GRID.x0) / LC), ck = Math.floor((z - GRID.z0) / LC);
      for (let k = ck - 2; k <= ck + 2; k++) for (let i = ci - 2; i <= ci + 2; i++) {
        if (i < 0 || k < 0 || i >= LW || k >= LD) continue;
        const j = (k * LW + i) * 4, cx = GRID.x0 + (i + 0.5) * LC, cz = GRID.z0 + (k + 0.5) * LC;
        const dd = Math.hypot(x - cx, z - cz);
        if (d[j + 3] > 0.5 && Math.hypot(d[j], d[j + 1]) <= dd) continue;
        d[j] = x - cx; d[j + 1] = z - cz; d[j + 2] = y + 0.02; d[j + 3] = 1;
      }
    }
    const t = new THREE.DataTexture(d, LW, LD, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
    return t;
  });
  const gr = (apt.grilles || []).slice(0, 4);
  U.uLamp0 = { value: lampTex[0] }; U.uLamp1 = { value: lampTex[1] };
  U.uLampG = { value: new THREE.Vector3(GRID.x0, GRID.z0, LC) }; U.uLampSz = { value: new THREE.Vector2(LW, LD) };
  U.uHoleR = { value: [0, 1, 2, 3].map((i) => (gr[i] ? new THREE.Vector4(gr[i][0], gr[i][1], gr[i][2], gr[i][3]) : new THREE.Vector4(1e5, 1e5, -1e5, -1e5))) };
  U.uHoleY = { value: [0, 1, 2, 3].map((i) => (gr[i] ? gr[i][4] : -99)) };

  const mats = new Set(apt.meshes.map((m) => m.material));
  for (const mat of mats) {
    if (mat === M.light || !mat.isMeshStandardMaterial) continue;     // contact-shadow cards are plain MeshBasic
    patch(mat, mat === M.glass ? 'glass' : mat === M.pavers ? 'wet' : 'in', U, !!frame);
  }
  // glass blends as premultiplied: reflection added, the view behind dimmed by alpha
  M.glass.blending = THREE.CustomBlending;
  M.glass.blendSrc = THREE.OneFactor; M.glass.blendDst = THREE.OneMinusSrcAlphaFactor;
  M.glass.blendSrcAlpha = THREE.ZeroFactor; M.glass.blendDstAlpha = THREE.OneFactor;
  M.glass.opacity = 1; M.glass.color.set('#000000');

  // probes: bake once the scene (and its shadow map) has been drawn; each probe is rendered with
  // a cube camera, prefiltered by PMREM and copied into its tile of one atlas (one sampler)
  const rows = Math.ceil(PROBES.length / COLS);
  const atlas = new THREE.WebGLRenderTarget(COLS * TW, rows * TH, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  U.uPAtlas.value = atlas.texture; U.uPAtlasSize.value.set(COLS * TW, rows * TH);
  // pass 0: diffuse light from the sky image and the hemisphere fill; later passes: from the
  // probes the pass before made (light bounces once more each pass); the fill drops to a trace
  function bakeProbes(pass) {
    const t = performance.now();
    syncFrame();
    U.uProbeOn.value = 0;
    U.uIrrOn.value = pass > 0 ? 1 : 0;
    if (hemi) hemi.intensity = pass > 0 ? hemiGI : hemi.userData.full ?? (hemi.userData.full = hemi.intensity);
    const rt = new THREE.WebGLCubeRenderTarget(PSIZE, { type: THREE.HalfFloatType, generateMipmaps: false });
    const cam = new THREE.CubeCamera(0.05, 100000, rt);   // far enough for the baked city (to the horizon)
    scene.add(cam);
    const pm = new THREE.PMREMGenerator(renderer);
    const copy = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { t: { value: null } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main() { gl_FragColor = texture2D( t, vUv ); }',
    }));
    copy.frustumCulled = false;
    const cs = new THREE.Scene(); cs.add(copy);
    const oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const xr = renderer.xr.enabled, ac = renderer.autoClear, prev = renderer.getRenderTarget();
    renderer.xr.enabled = false;
    let out = null;
    const shRT = new THREE.WebGLCubeRenderTarget(SHN, { type: THREE.HalfFloatType, generateMipmaps: false });
    const shCam = new THREE.CubeCamera(0.05, 100000, shRT); scene.add(shCam);
    const shNew = [];
    // the ceiling downlights light the rooms through the probes: a pool of 8 spots moves to the
    // lamps nearest each probe (inside its room) for that probe's captures
    const pool = [];
    for (let k = 0; bakeLamps && k < 8; k++) {
      const L = new THREE.SpotLight('#fffaf4', 0, 0, 1.05, 0.7, 2);
      L.castShadow = false; scene.add(L, L.target); pool.push(L);
    }
    const lampsFor = (p) => lamps.filter(([x, y, z]) => x >= p.min[0] && x <= p.max[0] && z >= p.min[2] && z <= p.max[2] && y >= p.min[1] && y <= p.max[1] + 0.3)
      .sort((a, b) => Math.hypot(a[0] - p.pos[0], a[2] - p.pos[2]) - Math.hypot(b[0] - p.pos[0], b[2] - p.pos[2])).slice(0, 8);
    PROBES.forEach((p, i) => {
      const near = lampsFor(p);
      pool.forEach((L, k) => {
        const q = near[k];
        if (q) { L.position.copy(toW(q)); L.target.position.copy(toW([q[0], q[1] - 3, q[2]])); L.intensity = lampPower; } else L.intensity = 0;
        L.updateMatrixWorld(); L.target.updateMatrixWorld();
      });
      // irradiance: the outside at daylight level, projected on 9 spherical harmonics
      shCam.position.copy(toW(p.pos)); shCam.updateMatrixWorld(true);
      if (viewGain) viewGain(whiteBalance.map((c) => c * daylight));   // daylight level, white-balanced as the photos are
      shCam.update(renderer, scene);
      if (viewGain) viewGain(1);
      shNew.push(projectSH(renderer, shRT, shCam));
      cam.position.copy(toW(p.pos)); cam.updateMatrixWorld(true);
      cam.update(renderer, scene);
      out = pm.fromCubemap(rt.texture, out);
      copy.material.uniforms.t.value = out.texture;
      atlas.viewport.set((i % COLS) * TW, Math.floor(i / COLS) * TH, TW, TH);
      renderer.setRenderTarget(atlas); renderer.autoClear = false;
      renderer.render(cs, oc);
      renderer.autoClear = ac;
    });
    renderer.setRenderTarget(prev);
    renderer.xr.enabled = xr;
    shNew.forEach((c, i) => c.forEach((v, j) => U.uSH.value[i * 9 + j].copy(v)));
    for (const L of pool) { scene.remove(L, L.target); L.dispose(); }
    scene.remove(cam, shCam); rt.dispose(); shRT.dispose(); if (out) out.dispose(); pm.dispose(); copy.geometry.dispose(); copy.material.dispose();
    U.uProbeOn.value = 1; U.uIrrOn.value = 1;
    return performance.now() - t;
  }
  // ---- irradiance volume (baked offline: tools/interior/bake_volume.js) ------------------------
  const IV = { x0: -0.25, z0: -0.25, step: 0.5, nx: 37, nz: 41, layers: [0.35, 1.2, 2.2, 3.3, 4.95, 5.8, 6.8, 7.8] };
  const inside = (q) => {
    if (q[0] < 0.02 || q[0] > 17.58 || q[2] < 0.02 || q[2] > 19.2) return false;
    for (const c of apt.colliders) {
      if (c.t === 'box') { if (q[0] > c.min[0] && q[0] < c.max[0] && q[1] > c.min[1] && q[1] < c.max[1] && q[2] > c.min[2] && q[2] < c.max[2]) return false; }
      else if (c.t === 'obox') {
        const dx = q[0] - c.c[0], dz = q[2] - c.c[2], co = Math.cos(c.yaw), si = Math.sin(c.yaw);
        const lx = dx * co - dz * si, lz = dx * si + dz * co;
        if (Math.abs(lx) < c.h[0] && Math.abs(q[1] - c.c[1]) < c.h[1] && Math.abs(lz) < c.h[2]) return false;
      }
    }
    return true;
  };
  async function bakeVolume({ size = 16, onProgress = null } = {}) {
    const { nx, nz, layers } = IV, n = nx * nz * layers.length;
    const out = new Float32Array(n * 16), ok = new Uint8Array(n);
    const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    const cam = new THREE.CubeCamera(0.05, 100000, rt); scene.add(cam);
    const pool = [];
    for (let k = 0; k < 8; k++) { const L = new THREE.SpotLight('#fffaf4', 0, 0, 1.05, 0.7, 2); L.castShadow = false; scene.add(L, L.target); pool.push(L); }
    const xr = renderer.xr.enabled; renderer.xr.enabled = false;
    if (viewGain) viewGain(whiteBalance.map((c) => c * daylight));
    const t0 = performance.now();
    for (let l = 0; l < layers.length; l++) for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        const j = (l * nz + k) * nx + i, q = [IV.x0 + i * IV.step, layers[l], IV.z0 + k * IV.step];
        if (!inside(q)) continue;
        const box = PROBES.find((p) => q[0] >= p.min[0] && q[0] <= p.max[0] && q[2] >= p.min[2] && q[2] <= p.max[2] && q[1] >= p.min[1] && q[1] <= p.max[1]);
        const near = box ? lamps.filter(([x, y, z]) => x >= box.min[0] && x <= box.max[0] && z >= box.min[2] && z <= box.max[2] && y >= box.min[1] && y <= box.max[1] + 0.3)
          .sort((a, b) => Math.hypot(a[0] - q[0], a[2] - q[2]) - Math.hypot(b[0] - q[0], b[2] - q[2])).slice(0, 8) : [];
        pool.forEach((L, m) => { const w = near[m]; if (w) { L.position.copy(toW(w)); L.target.position.copy(toW([w[0], w[1] - 3, w[2]])); L.intensity = lampPower; } else L.intensity = 0; L.updateMatrixWorld(); L.target.updateMatrixWorld(); });
        cam.position.copy(toW(q)); cam.updateMatrixWorld(true);
        cam.update(renderer, scene);
        const c = projectSH(renderer, rt, cam, size);
        for (let m = 0; m < 4; m++) { out[j * 16 + m * 4] = c[m].x; out[j * 16 + m * 4 + 1] = c[m].y; out[j * 16 + m * 4 + 2] = c[m].z; }
        ok[j] = 1;
      }
      if (onProgress) await onProgress((l * nz + k + 1) / (layers.length * nz), performance.now() - t0);
    }
    if (viewGain) viewGain(1);
    renderer.xr.enabled = xr;
    for (const L of pool) { scene.remove(L, L.target); L.dispose(); }
    scene.remove(cam); rt.dispose();
    // probes in walls, furniture or outside: filled from their valid neighbours (same layer)
    for (let pass = 0; pass < 6; pass++) {
      const nok = Uint8Array.from(ok);
      for (let l = 0; l < layers.length; l++) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        const j = (l * nz + k) * nx + i; if (ok[j]) continue;
        const acc = new Float32Array(16); let w = 0;
        for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
          const a = i + di, b = k + dk; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
          const jj = (l * nz + b) * nx + a; if (!ok[jj]) continue;
          for (let m = 0; m < 16; m++) acc[m] += out[jj * 16 + m]; w++;
        }
        if (w) { for (let m = 0; m < 16; m++) out[j * 16 + m] = acc[m] / w; nok[j] = 1; }
      }
      ok.set(nok);
    }
    return { meta: { ...IV, size }, data: out, ms: performance.now() - t0 };
  }
  // runtime: four RGBA half-float textures, layers side by side
  function useVolume(meta, data) {
    const { nx, nz, layers } = meta, W = nx * layers.length, H = nz;
    const tex = [0, 1, 2, 3].map((m) => {
      const a = new Uint16Array(W * H * 4), h = THREE.DataUtils.toHalfFloat;
      for (let l = 0; l < layers.length; l++) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        const j = (l * nz + k) * nx + i, o = (k * W + l * nx + i) * 4;
        a[o] = h(data[j * 16 + m * 4]); a[o + 1] = h(data[j * 16 + m * 4 + 1]); a[o + 2] = h(data[j * 16 + m * 4 + 2]); a[o + 3] = h(1);
      }
      const t = new THREE.DataTexture(a, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
      t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
      return t;
    });
    U.uIV0.value = tex[0]; U.uIV1.value = tex[1]; U.uIV2.value = tex[2]; U.uIV3.value = tex[3];
    U.uIVG.value.set(meta.x0, meta.z0, meta.step, nx); U.uIVT.value.set(W, H); U.uIVY.value = layers.slice();
    U.uIVOn.value = 1;
  }

  const api = {
    U, fields: F, bakeMs: 0, fieldMs: performance.now() - t0, atlas,
    bakeVolume, useVolume, IV, syncFrame,
    bake(passes = 3) { api.bakeMs = 0; for (let i = 0; i < passes; i++) api.bakeMs += bakeProbes(i); return api.bakeMs; },
    setWet(v) { U.uWet.value = Math.max(0, Math.min(1, v)); },
    get wet() { return U.uWet.value; },
  };
  return api;
}
