// Surface finish for the apartment's materials, without surface.js (that one is the world page's / ?aptsurf=on's
// heavier path; when it runs it chains onto this).
//  * Paint (walls, ceilings, the stair's white): the scanned painted plaster (textures/scans/paint_plaster, CC0) is
//    sampled with a cheap stochastic anti-tiling (a low-frequency value noise picks one of 6 offsets per patch; two
//    samples only in the blend band between patches), so a 2 m scan never shows its repeat on a 9 m wall.
//    On vertical paint faces: roller lap bands (sheen only), sparse scuffs above the skirting, hand grime and a
//    burnished sheen round door jambs and outside corners at hand height.
//  * Contact field (every apartment material, once a field is set): a top-down texture (5 cm cells) baked once from
//    the colliders at build: R / G furniture footprints on floor one / two (blurred, weighted by height), B / A wall
//    occupancy at chest height on floor one / two (gaussian 10 cm). The shader samples it 6 cm in front of each face:
//    floor-wall and ceiling-wall junctions, inside corners and the floor under and round furniture lose indirect light
//    (and a little of the unshadowed direct fill). No vertex attribute, no lights, no per-frame work.
// Positions are read in apartment coordinates (uFinInv: world -> apartment), so CQC's floating origin and its turned
// frame do not matter. Program cache keys: '|fin-<kind>'.
import * as THREE from 'three';

const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1); blank.needsUpdate = true;
export const FIN = {
  u: {
    uFinInv: { value: new THREE.Matrix4() },
    uFinCT: { value: blank },
    uFinG: { value: new THREE.Vector4(-0.2, -0.2, 1, 1) },     // field origin x, z; 1 / size x, z (metres)
    uFinK: { value: new THREE.Vector4(0, 1, 0, 4.3) },          // x field on, y wear strength, z -, w floor split height
  },
  L2: 4.6,
};

const VERT_PARS = `
varying vec3 vFinP;
varying vec3 vFinN;
uniform mat4 uFinInv;`;
const VERT_MAIN = `
  {
    vec4 finW = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
      finW = batchingMatrix * finW;
    #endif
    #ifdef USE_INSTANCING
      finW = instanceMatrix * finW;
    #endif
    vFinP = ( uFinInv * ( modelMatrix * finW ) ).xyz;
    vFinN = mat3( uFinInv ) * ( mat3( modelMatrix ) * objectNormal );
  }`;
const FRAG_PARS = `
varying vec3 vFinP;
varying vec3 vFinN;
uniform sampler2D uFinCT;
uniform vec4 uFinG;
uniform vec4 uFinK;
float finH( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float finVN( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( finH( i ), finH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( finH( i + vec2( 0.0, 1.0 ) ), finH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
#ifdef FIN_PAINT
vec2 finO1, finO2, finDx, finDy; float finW;
void finSetup( vec2 uv ) {
  finDx = dFdx( uv ); finDy = dFdy( uv );
  float l = finVN( uv * 1.6 + 7.3 ) * 6.0;                       // patches of ~0.6 repeat (1.2 m)
  float i = floor( l ), f = fract( l );
  finO1 = vec2( finH( vec2( i, 3.7 ) ), finH( vec2( 5.1, i ) ) );
  finO2 = vec2( finH( vec2( i + 1.0, 3.7 ) ), finH( vec2( 5.1, i + 1.0 ) ) );
  finW = smoothstep( 0.36, 0.64, f );
}
vec4 finT( sampler2D t, vec2 uv ) {
  if ( finW < 0.002 ) return textureGrad( t, uv + finO1, finDx, finDy );
  if ( finW > 0.998 ) return textureGrad( t, uv + finO2, finDx, finDy );
  return mix( textureGrad( t, uv + finO1, finDx, finDy ), textureGrad( t, uv + finO2, finDx, finDy ), finW );
}
#endif
float finFloorY( float y ) { return y > uFinK.w ? ${FIN.L2.toFixed(2)} : 0.0; }
vec4 finField( vec3 P, vec3 N ) { return texture2D( uFinCT, ( P.xz + N.xz * 0.06 - uFinG.xy ) * uFinG.zw ); }`;

// paint: the scan's maps through finT (expanded chunks, so the change stays in this program)
const C = THREE.ShaderChunk;
const MAP_PAINT = () => C.map_fragment.replace('texture2D( map, vMapUv )', 'finT( map, vMapUv )');
const ROUGH_PAINT = () => C.roughnessmap_fragment.replace('texture2D( roughnessMap, vRoughnessMapUv )', 'finT( roughnessMap, vRoughnessMapUv )');
const NORMAL_PAINT = () => C.normal_fragment_maps.replace('vec3 mapN = texture2D( normalMap, vNormalMapUv )', 'vec3 mapN = finT( normalMap, vNormalMapUv )');

// wear on vertical paint faces (after the roughness map: diffuseColor and roughnessFactor are both known)
const WEAR = `
  {
    vec3 fN = normalize( vFinN );
    if ( abs( fN.y ) < 0.5 && uFinK.y > 0.0 ) {
      float fy = vFinP.y - finFloorY( vFinP.y );
      float s = abs( fN.x ) > 0.5 ? vFinP.z : vFinP.x;              // along the wall
      float lap = finVN( vec2( s / 0.23, vFinP.y * 0.45 ) );        // roller passes: the sheen differs a little lap to lap
      roughnessFactor *= 0.95 + 0.1 * lap;
      float band = smoothstep( 0.1, 0.13, fy ) * ( 1.0 - smoothstep( 0.32, 0.55, fy ) );
      float sc = finVN( vec2( s * 7.0, fy * 55.0 ) ) * finVN( vec2( s * 1.1 + 3.0, 1.7 ) );
      float scuff = band * smoothstep( 0.5, 0.72, sc ) * uFinK.y;    // shoes and the vacuum above the skirting
      diffuseColor.rgb *= 1.0 - 0.09 * scuff;
      roughnessFactor *= 1.0 - 0.18 * scuff;
      if ( uFinK.x > 0.5 ) {                                        // outside corners and jambs at hand height
        vec4 fF = finField( vFinP, fN );
        float w = vFinP.y > uFinK.w ? fF.a : fF.b;
        float outC = clamp( ( 0.2 - w ) / 0.1, 0.0, 1.0 );
        float hand = smoothstep( 0.75, 0.95, fy ) * ( 1.0 - smoothstep( 1.45, 1.75, fy ) );
        float g = outC * hand * ( 0.55 + 0.45 * finVN( vec2( s * 18.0, fy * 9.0 ) ) ) * uFinK.y;
        diffuseColor.rgb *= 1.0 - 0.06 * g;
        roughnessFactor *= 1.0 - 0.22 * g;
      }
    }
  }`;

// contact field: indirect light (and a little of the direct, for the unshadowed fill lights) at junctions and furniture
const AO = `
  if ( uFinK.x > 0.5 ) {
    vec3 fN = normalize( vFinN );
    vec4 fF = finField( vFinP, fN );
    bool up2 = vFinP.y > uFinK.w;
    float fy = max( vFinP.y - finFloorY( vFinP.y ), 0.0 );
    float w = up2 ? fF.a : fF.b, c = up2 ? fF.g : fF.r;
    float ao = 1.0;
    if ( fN.y > 0.5 ) ao *= 1.0 - 0.5 * w * exp( - fy / 0.08 );          // floor along the walls (and tops near walls)
    else if ( fN.y < -0.5 ) ao *= 1.0 - 0.4 * w;                         // ceiling along the walls
    else {
      ao *= 1.0 - 0.38 * clamp( ( w - 0.24 ) / 0.18, 0.0, 1.0 );          // inside corners, full height
      ao *= 1.0 - 0.28 * exp( - fy / 0.16 );                             // where the wall meets the floor
    }
    ao *= 1.0 - 0.72 * c * exp( - fy / 0.22 );                           // under and round furniture
    reflectedLight.indirectDiffuse *= ao;
    reflectedLight.indirectSpecular *= mix( 1.0, ao, 0.8 );
    reflectedLight.directDiffuse *= mix( 1.0, ao, 0.35 );
  }`;

// kind: 'paint' (scan through finT + wear) or 'ao' (contact field only)
const DONE = new WeakSet();                          // (not userData: a clone copies userData but not the patch)
export function finishMat(mat, kind = 'ao') {
  if (!mat || !mat.isMeshStandardMaterial || mat.transparent || DONE.has(mat)) return mat;
  DONE.add(mat);
  const base = mat.onBeforeCompile, key = mat.customProgramCacheKey;
  const paint = kind === 'paint' && !!mat.map;
  mat.onBeforeCompile = (sh, r) => {
    if (base) base.call(mat, sh, r);
    Object.assign(sh.uniforms, FIN.u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + VERT_PARS)
      .replace('#include <project_vertex>', '#include <project_vertex>' + VERT_MAIN);
    let f = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + (paint ? '#define FIN_PAINT\n' : '') + FRAG_PARS);
    if (paint) {
      f = f.replace('#include <map_fragment>', 'finSetup( vMapUv );\n' + MAP_PAINT())
        .replace('#include <roughnessmap_fragment>', ROUGH_PAINT() + WEAR)
        .replace('#include <normal_fragment_maps>', NORMAL_PAINT())
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>' + AO);   // the scan's AO at its plain uv (subtle; surface.js hooks this include)
    } else f = f.replace('#include <aomap_fragment>', '#include <aomap_fragment>' + AO);
    sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => (key ? key.call(mat) : '') + '|fin-' + (paint ? 'paint' : 'ao');
  mat.needsUpdate = true;
  return mat;
}
// every lit, opaque material under a group (furniture.js makes its own besides M)
export function finishAll(root) {
  const seen = new Set();
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!seen.has(m)) { seen.add(m); finishMat(m, 'ao'); }
  });
}
// world -> apartment (the group whose children are in apartment coordinates)
export function finishFrame(group) {
  group.updateWorldMatrix(true, false);
  FIN.u.uFinInv.value.copy(group.matrixWorld).invert();
}

// ---- the contact field --------------------------------------------------------------------------
// colliders: the apartment's (walls, cores, columns, door leaves; glass skipped) and the furniture's (c.furn true).
const FG = { x0: -0.2, z0: -0.2, x1: 17.8, z1: 19.45, cs: 0.05 };
export function bakeContactField(colliders, glass, L2 = FIN.L2) {
  const { x0, z0, x1, z1, cs } = FG;
  const W = Math.ceil((x1 - x0) / cs), D = Math.ceil((z1 - z0) / cs), N = W * D;
  const wall = [new Float32Array(N), new Float32Array(N)], furn = [new Float32Array(N), new Float32Array(N)];
  const testY = [1.2, L2 + 1.2], floors = [0, L2];
  const paint = (arr, c, v) => {
    if (c.t === 'box') {
      const i0 = Math.max(0, Math.round((c.min[0] - x0) / cs)), i1 = Math.min(W, Math.round((c.max[0] - x0) / cs));
      const k0 = Math.max(0, Math.round((c.min[2] - z0) / cs)), k1 = Math.min(D, Math.round((c.max[2] - z0) / cs));
      for (let k = k0; k < k1; k++) for (let i = i0; i < i1; i++) arr[k * W + i] = Math.max(arr[k * W + i], v);
    } else if (c.t === 'obox') {
      const r = Math.hypot(c.h[0], c.h[2]), co = Math.cos(c.yaw), si = Math.sin(c.yaw);
      const i0 = Math.max(0, Math.floor((c.c[0] - r - x0) / cs)), i1 = Math.min(W - 1, Math.ceil((c.c[0] + r - x0) / cs));
      const k0 = Math.max(0, Math.floor((c.c[2] - r - z0) / cs)), k1 = Math.min(D - 1, Math.ceil((c.c[2] + r - z0) / cs));
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
        const dx = x0 + (i + 0.5) * cs - c.c[0], dz = z0 + (k + 0.5) * cs - c.c[2];
        const lx = dx * co - dz * si, lz = dx * si + dz * co;          // into the box's frame (rotation about y by yaw)
        if (Math.abs(lx) <= c.h[0] && Math.abs(lz) <= c.h[2]) arr[k * W + i] = Math.max(arr[k * W + i], v);
      }
    }
  };
  const yr = (c) => (c.t === 'box' ? [c.min[1], c.max[1]] : c.t === 'obox' ? [c.c[1] - c.h[1], c.c[1] + c.h[1]] : null);
  for (const c of colliders) {
    const r = yr(c); if (!r || c.mat === glass || c.pane !== undefined) continue;
    for (let f = 0; f < 2; f++) {
      if (c.furn) {
        if (Math.abs(r[0] - floors[f]) > 0.2 || r[1] - r[0] < 0.04) continue;      // stands on this floor
        paint(furn[f], c, Math.min(1, 0.35 + (r[1] - r[0]) / 0.9));               // taller pieces shut out more sky
      } else if (r[0] <= testY[f] && r[1] >= testY[f]) paint(wall[f], c, 1);
    }
  }
  // separable gaussian blur (wrap-free, clamped)
  const blur = (a, sig) => {
    const R = Math.ceil(sig * 3 / cs), k = []; let s = 0;
    for (let j = -R; j <= R; j++) { const v = Math.exp(-0.5 * (j * cs / sig) ** 2); k.push(v); s += v; }
    for (let j = 0; j < k.length; j++) k[j] /= s;
    const t = new Float32Array(N);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) { let v = 0; for (let j = -R; j <= R; j++) v += a[z * W + Math.min(W - 1, Math.max(0, x + j))] * k[j + R]; t[z * W + x] = v; }
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) { let v = 0; for (let j = -R; j <= R; j++) v += t[Math.min(D - 1, Math.max(0, z + j)) * W + x] * k[j + R]; a[z * W + x] = v; }
    return a;
  };
  const out = new Uint8Array(N * 4);
  const fb = furn.map((a) => { const b = blur(Float32Array.from(a), 0.12); for (let j = 0; j < N; j++) b[j] = Math.max(b[j], a[j] * 0.85); return b; });   // full under it, soft round it
  const wb = wall.map((a) => blur(a, 0.1));
  for (let j = 0; j < N; j++) {
    out[j * 4] = Math.round(Math.min(1, fb[0][j]) * 255); out[j * 4 + 1] = Math.round(Math.min(1, fb[1][j]) * 255);
    out[j * 4 + 2] = Math.round(Math.min(1, wb[0][j]) * 255); out[j * 4 + 3] = Math.round(Math.min(1, wb[1][j]) * 255);
  }
  const tex = new THREE.DataTexture(out, W, D, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return { tex, W, D, data: out };
}
export function useContactField(F) {
  const { x0, z0, cs } = FG;
  FIN.u.uFinCT.value = F.tex;
  FIN.u.uFinG.value.set(x0, z0, 1 / (F.W * cs), 1 / (F.D * cs));
  FIN.u.uFinK.value.x = 1;
}
