// Occlusion culling for the clustered apartment (PVS: potentially visible set), baked on the GPU at load.
// The apartment is static, so what can be seen from where never changes: for every 1.5 m cell of the plan, on each
// floor, at two eye heights (crouched and tall), the chunks (clusters.js) are drawn into a small ID cube map (one
// colour per chunk, 6 x 128 px faces) and read back without stalling (readRenderTargetPixelsAsync); a cell's set is
// then the union over itself and its 8 neighbours (so any spot inside the cell is covered), cached in localStorage.
// At run time the game hides chunks outside the set of the cell the camera is in (between floors: both floors'),
// keeps every chunk within NEAR (3.5) m of the camera, and draws everything where no set exists (outside, not baked yet).
// Nothing that moves is an occluder (doors, furniture props, men are not chunks), so open doorways count as open.
// The picture stays the same; only what walls and floors hide is skipped.
import * as THREE from 'three';

const VERT = /* glsl */`
attribute float aId;
varying float vId;
void main() { vId = aId; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const FRAG = /* glsl */`
varying float vId;
void main() { float i = floor( vId + 0.5 ) + 1.0; gl_FragColor = vec4( mod( i, 256.0 ) / 255.0, floor( i / 256.0 ) / 255.0, 1.0, 1.0 ); }`;

const DIRS = [[1, 0, 0, 0, -1, 0], [-1, 0, 0, 0, -1, 0], [0, 1, 0, 0, 0, 1], [0, -1, 0, 0, 0, -1], [0, 0, 1, 0, -1, 0], [0, 0, -1, 0, -1, 0]];

// the ID scene: every batch's whole buffer as one mesh with a per-vertex chunk id (shares the batch's buffers)
export function makeIdScene(batches, base, inv) {
  const scene = new THREE.Scene(), mats = [], geos = [];
  for (const bm of batches) {
    const g = new THREE.BufferGeometry(), src = bm.geometry, nv = src.attributes.position.count, id = new Float32Array(nv), b0 = base.get(bm);
    for (let i = 0; i < bm._geometryInfo.length; i++) { const G = bm._geometryInfo[i]; id.fill(b0 + i, G.vertexStart, G.vertexStart + G.vertexCount); }
    g.setAttribute('position', src.attributes.position); g.setAttribute('aId', new THREE.BufferAttribute(id, 1)); g.setIndex(src.index);
    // as the game draws it: same side and depth offset (paint bands, rugs lifted by polygonOffset would lose a depth tie
    // and never be marked seen); cut-out leaves (alphaTest) mark themselves but hide nothing (drawn last, no depth write)
    const sm = bm.material, cut = !!(sm.alphaTest > 0 || sm.alphaMap || sm.transparent || sm.alphaHash);
    const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: sm.side, toneMapped: false,
      polygonOffset: !!sm.polygonOffset, polygonOffsetFactor: sm.polygonOffsetFactor || 0, polygonOffsetUnits: sm.polygonOffsetUnits || 0, depthWrite: !cut });
    const mesh = new THREE.Mesh(g, m); mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.renderOrder = cut ? 1 : 0;
    mesh.matrix.multiplyMatrices(inv, bm.matrixWorld); scene.add(mesh); mats.push(m); geos.push(g);
  }
  scene.updateMatrixWorld(true);
  return { scene, mats, geos };
}

// batches: the clustered BatchedMeshes (children of root, the apartment group). Returns the PVS object at once; it
// fills in the background (opts.busy() true = the game is running: slower pace) unless a cached bake matches.
export function bakePVS(renderer, root, batches, opts = {}) {
  const cs = opts.cell || 1.5, S = opts.px || 256, NEAR = opts.near || 3.5;
  const levels = opts.levels || [[0, [1.0, 1.85]], [4.6, [5.6, 6.45]]];   // [floor y, eye heights]
  const split = opts.split || [3.0, 5.0];                                     // below: floor one; above: floor two; between: both
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  // global chunk ids and their spheres in the root's space
  let N = 0; const base = new Map();
  for (const bm of batches) { base.set(bm, N); N += bm._instanceInfo.length; }
  const cx = new Float32Array(N), cy = new Float32Array(N), cz = new Float32Array(N), cr = new Float32Array(N);
  const sph = new THREE.Sphere(), rel = new THREE.Matrix4();
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, sig = N * 7;
  for (const bm of batches) {
    rel.multiplyMatrices(inv, bm.matrixWorld);
    const b0 = base.get(bm);
    for (let i = 0; i < bm._instanceInfo.length; i++) {
      bm.getBoundingSphereAt(i, sph); sph.applyMatrix4(rel);
      const g = b0 + i; cx[g] = sph.center.x; cy[g] = sph.center.y; cz[g] = sph.center.z; cr[g] = sph.radius;
      x0 = Math.min(x0, sph.center.x); x1 = Math.max(x1, sph.center.x); z0 = Math.min(z0, sph.center.z); z1 = Math.max(z1, sph.center.z);
      sig = (sig * 31 + Math.round(sph.center.x * 100 + sph.center.y * 37 + sph.center.z * 71 + sph.radius * 13)) | 0;
    }
  }
  const nx = Math.max(1, Math.ceil((x1 - x0) / cs)), nz = Math.max(1, Math.ceil((z1 - z0) / cs)), NL = levels.length;
  const NB = (N + 7) >> 3, cells = nx * nz * NL;
  const P = {
    N, base, cx, cy, cz, cr, nx, nz, x0, z0, cs, NEAR, NB, ready: false, done: 0, cells,
    bits: new Uint8Array(cells * NB), key: `pvs2:${N}:${nx}x${nz}x${NL}:${cs}:${S}:${sig}`,
    _u: new Uint8Array(NB),
    // the set for a point in the root's space; null = draw everything
    setAt(x, y, z) {
      if (!P.ready) return null;
      const ix = Math.floor((x - P.x0) / cs), iz = Math.floor((z - P.z0) / cs);
      if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return null;
      const lo = y < split[0], hi = y > split[1];
      if (lo || hi) { const l = lo ? 0 : NL - 1, o = ((l * nz + iz) * nx + ix) * NB; return P.bits.subarray(o, o + NB); }
      const u = P._u; u.fill(0);
      for (let l = 0; l < NL; l++) { const o = ((l * nz + iz) * nx + ix) * NB; for (let k = 0; k < NB; k++) u[k] |= P.bits[o + k]; }
      return u;
    },
  };
  // cached?
  try {
    const s = localStorage.getItem('world.pvs');
    if (s) { const o = JSON.parse(s); if (o.key === P.key) { const b = atob(o.b); for (let i = 0; i < b.length && i < P.bits.length; i++) P.bits[i] = b.charCodeAt(i); P.ready = true; P.cached = true; return P; } }
  } catch (e) { /* bake again */ }

  const { scene, mats, geos } = makeIdScene(batches, base, inv);
  scene.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera(90, 1, 0.03, 90);
  const raw = new Uint8Array(cells * NB);          // seen from the cell's own samples
  const H = Math.max(...levels.map((L) => L[1].length)), K = 3, rts = Array.from({ length: K }, () => new THREE.WebGLRenderTarget(6 * S, H * S, { depthBuffer: true }));
  const bufs = Array.from({ length: K }, () => new Uint8Array(6 * S * H * S * 4));   // one row of six faces per eye height
  const jobs = [];
  for (let l = 0; l < NL; l++) for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) jobs.push([l, ix, iz]);
  const v = new THREE.Vector3();
  function renderCell(rt, l, ix, iz) {
    const xr = renderer.xr.enabled, sm = renderer.shadowMap.enabled, prev = renderer.getRenderTarget(), ac = renderer.autoClear, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.xr.enabled = false; renderer.shadowMap.enabled = false; renderer.autoClear = false;
    try {
      rt.scissorTest = false; rt.viewport.set(0, 0, 6 * S, H * S); renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
      levels[l][1].forEach((h, hi) => {
        for (let f = 0; f < 6; f++) {
          const D = DIRS[f];
          cam.position.set(P.x0 + (ix + 0.5) * cs, h, P.z0 + (iz + 0.5) * cs);
          cam.up.set(D[3], D[4], D[5]); cam.lookAt(v.set(cam.position.x + D[0], cam.position.y + D[1], cam.position.z + D[2])); cam.updateMatrixWorld(true);
          rt.viewport.set(f * S, hi * S, S, S); rt.scissor.set(f * S, hi * S, S, S); rt.scissorTest = true;
          renderer.setRenderTarget(rt);
          renderer.render(scene, cam);
        }
      });
    } finally {
      rt.scissorTest = false; rt.viewport.set(0, 0, 6 * S, H * S);
      renderer.setRenderTarget(prev); renderer.xr.enabled = xr; renderer.shadowMap.enabled = sm; renderer.autoClear = ac; renderer.setClearColor(cc, ca);
    }
  }
  function collect(buf, l, ix, iz) {
    const o = ((l * nz + iz) * nx + ix) * NB;
    for (let p = 0; p < buf.length; p += 4) { const i = buf[p] + buf[p + 1] * 256; if (i > 0 && i <= N) { const g = i - 1; raw[o + (g >> 3)] |= 1 << (g & 7); } }
  }
  function finish() {
    for (let l = 0; l < NL; l++) for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const o = ((l * nz + iz) * nx + ix) * NB;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const jx = ix + dx, jz = iz + dz; if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        const q = ((l * nz + jz) * nx + jx) * NB;
        for (let k = 0; k < NB; k++) P.bits[o + k] |= raw[q + k];
      }
    }
    for (const g of geos) { g.deleteAttribute('aId'); g.dispose(); }
    for (const m of mats) m.dispose();
    for (const rt of rts) rt.dispose();
    P.ready = true;
    try { let s = ''; for (let i = 0; i < P.bits.length; i++) s += String.fromCharCode(P.bits[i]); localStorage.setItem('world.pvs', JSON.stringify({ key: P.key, b: btoa(s) })); } catch (e) { /* not kept */ }
    if (opts.onReady) opts.onReady(P);
  }
  let inFlight = 0, next = 0, stopped = false;
  P.stop = () => { stopped = true; };
  function pump() {
    if (stopped) return;
    const busy = opts.busy ? opts.busy() : false;
    let started = 0;
    while (inFlight < K && next < jobs.length && started < (busy ? 1 : K)) {
      const slot = next % K, [l, ix, iz] = jobs[next++], rt = rts[slot], buf = bufs[slot];
      try { renderCell(rt, l, ix, iz); } catch (e) { console.warn('pvs bake', e); stopped = true; return; }
      inFlight++; started++;
      renderer.readRenderTargetPixelsAsync(rt, 0, 0, 6 * S, H * S, buf).then(() => { collect(buf, l, ix, iz); P.done++; }).catch(() => { /* this cell stays empty: covered by its neighbours */ P.done++; })
        .finally(() => { inFlight--; if (P.done >= jobs.length) finish(); });
    }
    if (next < jobs.length) setTimeout(pump, busy ? (renderer.xr.isPresenting ? 220 : 40) : 4);   // in the headset a cell every 220 ms (a dropped frame now and then, not a stutter)
  }
  setTimeout(pump, opts.delay || 0);
  return P;
}
