// Furniture, from the reference photos (docs/references, apartment-17..20): modelled to real
// sizes, upholstered and finished with the photo-scanned materials (textures/scans). Everything
// static is merged per material (one draw call each) and given simple colliders.
// Plan frame as apartment.js: x east, y up, z south, metres; the great hall is x 0..17.6,
// z 0..6.72, north glass at z = 0.
import * as THREE from 'three';
import { Builder } from './build.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { barPull, counter, basin, drain, kitchenFaucet, bathFaucet, toiletSeat, flushPlate, showerSet, towelRing, outletPlate } from './hw.js';

const ART = []; let ARTY = 0;
// CQC (Q.cqc): loose pieces are built on their own (origin at their foot, unturned) and handed
// back as movables, so the game can make them physics props
let MOV = null;
function movable(kind, mass, fn, hasRy = true) {
  return function (B, M, x, ...a) {
    if (!MOV) return fn(B, M, x, ...a);
    const b = new Builder();
    if (hasRy) { const [z, ry = 0, ...r] = a; fn(b, M, 0, 0, 0, ...r); MOV.push({ kind, mass, b, x, y: ARTY, z, ry }); }
    else { const [y, z] = a; fn(b, M, 0, 0, 0); MOV.push({ kind, mass, b, x, y: ARTY + y, z, ry: 0 }); }
  };
}              // wall-hung art, for the clipping check
// CQC (Q.cqc): breakable pieces (light fittings, glass and ceramic decor) are built on their own (their own meshes, in
// apartment coordinates) and handed back as breakables, so the game can shatter, swing or drop them. A fitting's rod and
// canopy (anything reaching its ceiling) go in b.rod: they stay up when the fitting falls.
let BRK = null;
function brkOwn(kind) { const b = new Builder(); b.rod = new Builder(); BRK.push({ kind, b, y: ARTY }); return b; }
function breakable(kind, fn, fixture = false) {
  return function (B, M, ...a) {
    if (!BRK) return fn(B, M, ...a);
    const b = brkOwn(kind);
    if (fixture) { const top = a[3] - 0.05, own = { add: b.add.bind(b) }; b.add = (geo, mat) => { geo.computeBoundingBox(); (geo.boundingBox.max.y > top ? b.rod : own).add(geo, mat); }; }
    fn(b, M, ...a);
    for (const c of b.colliders) B.colliders.push(c);
  };
}
const brkAdd = (kind, x, z, ry, fall) => { if (!BRK) return fall; const b = brkOwn(kind); return (geo, m) => b.add(at(geo, x, 0, z, ry), m); };
// ---- geometry kit ----------------------------------------------------------------------------
// Rounded box centred at the origin: w x h x d, edge radius r, seg steps per rounded edge.
// Metric UVs projected from the dominant normal axis (fabric and wood read at true scale).
export function rbox(w, h, d, r, seg = 3) {
  r = Math.max(0.0005, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const n = seg * 2 + 1, hs = 0.5 / n;
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n).toNonIndexed();
  const p = g.attributes.position, N = g.attributes.normal;
  const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r;
  const v = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    q.set(v.x - Math.sign(v.x) * hs, v.y - Math.sign(v.y) * hs, v.z - Math.sign(v.z) * hs).normalize();
    p.setXYZ(i, bx * Math.sign(v.x) + q.x * r, by * Math.sign(v.y) + q.y * r, bz * Math.sign(v.z) + q.z * r);
    N.setXYZ(i, q.x, q.y, q.z);
  }
  metricUV(g);
  return g;
}

// UVs in metres from the dominant axis of each triangle's normal (per triangle, so faces never
// smear); u, v keep their direction on opposite faces
export function metricUV(g, rot = 0) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < p.count; t += 3) {
    a.fromBufferAttribute(p, t); b.fromBufferAttribute(p, t + 1); c.fromBufferAttribute(p, t + 2);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const x = p.getX(t + k), y = p.getY(t + k), z = p.getZ(t + k);
      let u, w;
      if (ay >= ax && ay >= az) { u = x; w = z; } else if (ax >= az) { u = z; w = y; } else { u = x; w = y; }
      if (rot) { const t2 = u; u = w; w = -t2; }
      uv[(t + k) * 2] = u; uv[(t + k) * 2 + 1] = w;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// smooth normals over a non-indexed geometry (vertices welded by position)
export function smooth(g) {
  const p = g.attributes.position, acc = new Map(), key = (i) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const keys = new Array(p.count);
  for (let t = 0; t < p.count; t += 3) {
    a.fromBufferAttribute(p, t); b.fromBufferAttribute(p, t + 1); c.fromBufferAttribute(p, t + 2);
    n.subVectors(c, b).cross(a.clone().sub(b));
    for (let k = 0; k < 3; k++) {
      const kk = keys[t + k] = key(t + k);
      const s = acc.get(kk); if (s) s.add(n); else acc.set(kk, n.clone());
    }
  }
  const N = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const s = acc.get(keys[i]).clone().normalize(); N[i * 3] = s.x; N[i * 3 + 1] = s.y; N[i * 3 + 2] = s.z; }
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return g;
}

// ---- soft upholstery kit ------------------------------------------------------------------------
// SOFT.step: grid spacing over the flat parts of a soft piece (metres), SOFT.edge: steps over each
// rounded edge (furnish sets the headset's coarser values)
const SOFT = { step: 0.045, edge: 3, pipe: 0.04, ring: 5 };
// coordinates along one axis of a rounded box: the rounded zones get tan-spaced steps (even angles
// once projected onto the round), the flat middle an even grid
function axisCoords(L, r, step, ne) {
  const b = Math.max(0, L / 2 - r), out = [];
  for (let i = ne; i >= 1; i--) out.push(-b - r * Math.tan(i / ne * Math.PI / 4));
  const n = Math.max(1, Math.ceil(2 * b / step));
  for (let i = 0; i <= n; i++) out.push(-b + 2 * b * i / n);
  for (let i = 1; i <= ne; i++) out.push(b + r * Math.tan(i / ne * Math.PI / 4));
  return out;
}
// a densely gridded rounded box (w x h x d, edge radius r, centred) whose every vertex can be moved
// by deform(p, n): p the point on the rounded box, n its outward normal (both Vector3, p mutable).
// skip: faces left out, e.g. ['y-'] for a cushion's underside.
// Non-indexed, smooth normals after the deformation, metric UVs.
const _sp = new THREE.Vector3(), _sn = new THREE.Vector3();
export function softBox(w, h, d, r, deform = null, step = SOFT.step, ne = SOFT.edge, skip = null) {
  r = Math.max(0.002, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const dims = [w, h, d], b = dims.map((L) => L / 2 - r);
  const C = dims.map((L) => axisCoords(L, r, step, ne));
  const P = [];
  const vert = (q) => {
    const inner = [0, 1, 2].map((k) => Math.max(-b[k], Math.min(b[k], q[k])));
    _sn.set(q[0] - inner[0], q[1] - inner[1], q[2] - inner[2]).normalize();
    _sp.set(inner[0], inner[1], inner[2]).addScaledVector(_sn, r);
    if (deform) deform(_sp, _sn);
    return [_sp.x, _sp.y, _sp.z];
  };
  for (const k of [0, 1, 2]) for (const sg of [-1, 1]) {
    if (skip && skip.includes('xyz'[k] + (sg > 0 ? '+' : '-'))) continue;     // a face nobody sees (resting on something)
    const i = (k + 1) % 3, j = (k + 2) % 3, ci = C[i], cj = C[j];
    const V = [];
    for (let a = 0; a < ci.length; a++) { const row = []; for (let c = 0; c < cj.length; c++) { const q = [0, 0, 0]; q[k] = sg * dims[k] / 2; q[i] = ci[a]; q[j] = cj[c]; row.push(vert(q)); } V.push(row); }
    // (i, j, k) is a right-handed cycle, so a -> a+1 then c -> c+1 winds toward +k
    for (let a = 0; a < ci.length - 1; a++) for (let c = 0; c < cj.length - 1; c++) {
      const A = V[a][c], B2 = V[a + 1][c], Cc = V[a + 1][c + 1], D2 = V[a][c + 1];
      if (sg > 0) P.push(...A, ...B2, ...Cc, ...A, ...Cc, ...D2); else P.push(...A, ...Cc, ...B2, ...A, ...D2, ...Cc);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  smooth(g); metricUV(g);
  return g;
}
// the seam round one face of a soft box (axis 0 x / 1 y / 2 z, side +-1): the line where the face
// panel meets the boxing strip, half way round the rounded edge. A piped welt (cord radius pr) is a
// tube along it, moved with the same deform as the box, so it rides the crowned and sagging cover.
export function piping(w, h, d, r, axis, side, deform = null, pr = 0.0038, step = SOFT.pipe) {
  r = Math.max(0.002, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const dims = [w, h, d], b = dims.map((L) => L / 2 - r), i = (axis + 1) % 3, j = (axis + 2) % 3;
  const c45 = Math.SQRT1_2, rc = r * c45, pts = [];
  // a rounded rectangle in the (i, j) plane: straight runs and quarter arcs (radius rc round the inner corners)
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let q = 0; q < 4; q++) {
    const [si, sj] = corners[q], a0 = q * Math.PI / 2;
    const arcN = SOFT.edge + 1;
    for (let t = 0; t <= arcN; t++) {
      const a = a0 + t / arcN * Math.PI / 2, di = Math.cos(a), dj = Math.sin(a);
      const pos = [0, 0, 0], n = [0, 0, 0];
      pos[i] = si * b[i] + di * rc; pos[j] = sj * b[j] + dj * rc; pos[axis] = side * (b[axis] + r * c45);
      n[i] = di * c45; n[j] = dj * c45; n[axis] = side * c45;
      // straight run to the next corner, sampled every step
      _sp.set(...pos); _sn.set(...n);
      if (deform) deform(_sp, _sn);
      pts.push(_sp.clone().addScaledVector(_sn, pr * 0.55));
      if (t === arcN) {
        const [ni, nj] = corners[(q + 1) % 4], len = Math.abs(ni * b[i] - si * b[i]) + Math.abs(nj * b[j] - sj * b[j]);
        const m = Math.max(1, Math.round(len / step));
        for (let s2 = 1; s2 < m; s2++) {
          const f = s2 / m, p2 = [0, 0, 0];
          p2[i] = (si * b[i] + (ni * b[i] - si * b[i]) * f) + di * rc; p2[j] = (sj * b[j] + (nj * b[j] - sj * b[j]) * f) + dj * rc; p2[axis] = pos[axis];
          _sp.set(...p2); _sn.set(...n);
          if (deform) deform(_sp, _sn);
          pts.push(_sp.clone().addScaledVector(_sn, pr * 0.55));
        }
      }
    }
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const g = new THREE.TubeGeometry(curve, pts.length, pr, SOFT.ring, true).toNonIndexed();
  return metricUV(g);
}
// cheap smooth noise for fill lumps and fabric (no allocation)
const snoise = (x, y, z, s) => (Math.sin(x * 1.7 + s) * Math.sin(y * 2.3 + s * 1.3) + Math.sin(z * 1.9 + x * 0.7 + s * 0.7) * Math.sin(y * 1.1 - z * 0.6 + s * 2.1)) * 0.5;
// how a filled cushion holds its shape: crowned faces (filling pushes the panels out most in the
// middle), boxing strips bulging, a seat sag where people sit, small wrinkles along the seams and
// round the sag, uneven fill. All in the cushion's own frame (y = thickness).
export function cushionDeform(w, h, d, { crown = 0.012, under = 0.4, bulge = 0.006, sag = 0, sagZ = 0.1, crease = 0.0018, lump = 0.0022, seed = 1 } = {}) {
  return (p, n) => {
    const fx = Math.max(-1, Math.min(1, p.x / (w / 2))), fy = Math.max(-1, Math.min(1, p.y / (h / 2))), fz = Math.max(-1, Math.min(1, p.z / (d / 2)));
    const px = Math.max(0, 1 - fx * fx), pz = Math.max(0, 1 - fz * fz), py = Math.max(0, 1 - fy * fy);
    const dome = Math.pow(px, 0.7) * Math.pow(pz, 0.7);
    let k = 0;
    if (n.y > 0) {
      k += crown * dome * n.y;
      if (sag) { const e = Math.exp(-(fx * fx * 2.2 + (fz - sagZ) * (fz - sagZ) * 2.6)); k -= sag * e * n.y; }
    } else k += crown * under * dome * -n.y;
    k += bulge * py * (Math.abs(n.x) * Math.pow(pz, 0.6) + Math.abs(n.z) * Math.pow(px, 0.6));
    // seam wrinkles: short folds running in from the seams, strongest at the corners where the cover gathers
    const ex = 1 - Math.abs(fx), ez = 1 - Math.abs(fz);
    const nearX = Math.exp(-ex * w / 2 / 0.045), nearZ = Math.exp(-ez * d / 2 / 0.045), up = n.y > 0 ? 1 : Math.max(0, fy) * 0.6;
    const corner = 0.5 + 1.5 * nearX * nearZ;
    k += crease * up * corner * (nearX * Math.sin(p.z * 45 + seed + 2 * snoise(p.x * 9, 0, p.z * 9, seed)) + nearZ * Math.sin(p.x * 45 + seed * 1.7 + 2 * snoise(p.z * 9, 0, p.x * 9, seed)));
    // folds round the sag (fabric compressed where it is sat on)
    if (sag && n.y > 0) { const rr = Math.hypot(fx * w / 2, (fz - sagZ) * d / 2); k += crease * 0.8 * Math.sin(Math.atan2(fz - sagZ, fx) * 9 + seed) * Math.exp(-((rr - 0.17) ** 2) / 0.004); }
    k += lump * snoise(p.x * 11, p.y * 11, p.z * 11, seed) * (0.3 + 0.7 * dome);
    p.addScaledVector(n, k);
  };
}
// a cushion: soft box crowned on its big faces, the filling's lumps, seam wrinkles; with opts.pipe
// a welt round both face seams. Same call as before (seg is ignored: the grid follows SOFT).
export function cushion(w, h, d, r, crown, seg = 4, opts = {}) {
  void seg;
  const df = cushionDeform(w, h, d, { crown, bulge: Math.min(0.006, h * 0.05), crease: Math.min(0.0018, h * 0.02), lump: Math.min(0.0022, h * 0.025), ...opts });
  const big = Math.max(w, d) > 0.4, g = softBox(w, h, d, r, df, Math.max(SOFT.step, Math.max(w, h, d) / 14), big ? SOFT.edge : Math.max(1, SOFT.edge - 1), opts.skip || null);
  if (!opts.pipe) return g;
  return merge3([g, piping(w, h, d, r, 1, 1, df), piping(w, h, d, r, 1, -1, df)]);
}

// lathe from a profile [[r, y], ...] (bottom to top), metric UVs (u round, v along)
export function lathe(profile, seg = 32, phi0 = 0, phiL = Math.PI * 2) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg, phi0, phiL).toNonIndexed();
  const p = g.attributes.position, uv = g.attributes.uv;
  const rmax = Math.max(...profile.map((q) => q[0]));
  for (let i = 0; i < p.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * rmax, p.getY(i));
  return g;
}

// place a geometry: rotate (x, then y), then move
export function at(g, x, y, z, ry = 0, rx = 0, rz = 0) {
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

// ---- pieces ----------------------------------------------------------------------------------
// each takes the builder, materials and a placement (x, z, ry: the front faces local +z
// turned by ry about y)

// ---- sofas -------------------------------------------------------------------------------------
// An upholstered sofa as real ones are made: a recessed black plinth, a sprung base, a back frame and
// (straight sofas) rolled arms, all upholstered; loose seat and back cushions with piped seams,
// crowned, a little sat-in, with gaps between them; throw pillows. Local frame: x along the sofa, the
// seat faces +z, back at -D/2, floor y 0. Returns [geometry, material key] pairs.
function sofaParts(L, D, { arms = true, n = 3, seed = 1, pillows = [['velvet', -1], ['boucleTaupe', 1]] } = {}) {
  const out = [], put = (g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { at(g, x, y, z, ry, rx, rz); out.push([g, m]); };
  const AW = arms ? 0.22 : 0, BK = 0.2, PL = 0.07, BH = 0.25, SH = 0.17, BCK = 0.74;
  const coarse = SOFT.step * 1.8;
  // plinth (recessed 9 cm so the sofa floats), sprung base, back frame
  put(softBox(L - 0.18, PL, D - 0.18, 0.012, null, 0.12, 1), 'blackMatte', 0, PL / 2, 0);
  const baseDf = cushionDeform(L, BH, D, { crown: 0.004, bulge: 0.005, crease: 0, lump: 0.0012, seed });
  put(softBox(L, BH, D, 0.035, baseDf, coarse, SOFT.edge, ['y-']), 'boucle', 0, PL + BH / 2, 0);
  const bw = L - 2 * AW, bh = BCK - PL - BH, bdf = cushionDeform(bw, bh, BK, { crown: 0.006, bulge: 0.008, crease: 0.001, lump: 0.0015, seed: seed + 3 });
  put(softBox(bw, bh, BK, arms ? 0.05 : 0.085, bdf, coarse, SOFT.edge, ['y-']), 'boucle', 0, PL + BH + bh / 2, -D / 2 + BK / 2);
  if (arms) for (const sg of [-1, 1]) {
    // rolled arm: crowned top, the inside face bowing in, a piped front panel
    const ah = 0.64 - PL, adf = cushionDeform(AW, ah, D, { crown: 0.012, bulge: 0.009, crease: 0.0012, lump: 0.0015, seed: seed + 5 + sg });
    put(softBox(AW, ah, D, 0.075, adf, coarse, SOFT.edge, ['y-']), 'boucle', sg * (L / 2 - AW / 2), PL + ah / 2, 0);
    put(piping(AW, ah, D, 0.075, 2, 1, adf, 0.0042), 'boucle', sg * (L / 2 - AW / 2), PL + ah / 2, 0);
  }
  // loose seat cushions, a 12 mm gap between them; each sat in a little differently
  const gap = 0.012, sw = (bw - gap * (n - 1)) / n, sd = D - BK - 0.015;
  for (let i = 0; i < n; i++) {
    const u = -bw / 2 + sw / 2 + i * (sw + gap), sd2 = seed * 7 + i * 13;
    const df = cushionDeform(sw, SH, sd, { crown: 0.018, under: 0.3, bulge: 0.007, sag: 0.008 + 0.006 * ((sd2 * 0.37) % 1), sagZ: 0.05, crease: 0.0018, lump: 0.0024, seed: sd2 });
    const yc = PL + BH + SH / 2 + 0.004, zc = -D / 2 + BK + sd / 2 + 0.008;
    put(softBox(sw, SH, sd, 0.05, df, SOFT.step, SOFT.edge, ['y-']), 'boucle', u, yc, zc);
    for (const sd3 of [1, -1]) put(piping(sw, SH, sd, 0.05, 1, sd3, df), 'boucle', u, yc, zc);
    // back cushion: built lying (y = thickness, z = height), stood up and leaning back 12 degrees,
    // fuller toward the bottom (lumbar), resting on the seat cushion's back edge and the frame
    const th = 0.2, tall = 0.5, bd = cushionDeform(sw, th, tall, { crown: 0.03, under: 0.5, bulge: 0.008, sag: 0, crease: 0.0016, lump: 0.0026, seed: sd2 + 5 });
    const bdf2 = (p, nn) => { bd(p, nn); if (nn.y > 0) p.y += 0.012 * Math.max(0, p.z / (tall / 2)) * nn.y; };
    const bgeo = merge3([softBox(sw, th, tall, 0.06, bdf2, SOFT.step * 1.15, SOFT.edge, ['y-']), piping(sw, th, tall, 0.06, 1, 1, bdf2)]);   // its back rests on the frame
    bgeo.rotateX(Math.PI / 2);                        // lying z (height) -> up (its -z bottom end, the lumbar, ends low), +y face -> +z (the front)
    bgeo.rotateX(-0.21);                              // leaning back
    put(bgeo, 'boucle', u, PL + BH + SH + tall / 2 - 0.03, -D / 2 + BK + th / 2 - 0.035);
  }
  // throw pillows: corner-stuffed, tipped back against the back cushions, a karate-chop dent
  for (const [mk, sg] of pillows) {
    const pg = pillowGeo(0.5, 0.48, 0.16);
    const pp = pg.attributes.position;
    for (let k = 0; k < pp.count; k++) { const y = pp.getY(k), x = pp.getX(k); if (y > 0.1) pp.setY(k, y - 0.035 * Math.exp(-x * x / 0.01) * (y - 0.1) / 0.14); }
    smooth(pg);
    put(pg, mk, sg * (bw / 2 - 0.3), PL + BH + SH + 0.21, -D / 2 + BK + 0.2 + 0.13, -0.2, sg * -0.28, sg * 0.06);
  }
  return out;
}
// bend a sofa part laid along x round an arc: local z = 0 goes to radius rm, +z (the seat front)
// toward the centre; x becomes arc length (handedness kept: both x and z flip)
function bendArc(g, rm) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = -x / rm, r = rm - z;
    p.setXYZ(i, Math.sin(a) * r, y, Math.cos(a) * r);
  }
  return smooth(g);
}
// soft contact shadow on the floor under a piece (the darkening right where it meets the floor;
// the lights' shadow maps are too coarse for it): a plane with a rounded-box falloff, multiplied in
function contact(B, M, x, y, z, ry, w, d, k = 0.55) {
  const g = new THREE.PlaneGeometry(w + 0.16, d + 0.16).toNonIndexed().rotateX(-Math.PI / 2);
  B.add(at(g, x, y + 0.0015, z, ry), M.contact[Math.max(0, Math.min(3, Math.round(k * 4) - 1))]);
}
// straight bouclé sofa (apartment-19 / -20)
function sofa(B, M, x, z, ry, L = 2.6, D = 1.0) {
  for (const [g, mk] of sofaParts(L, D, { seed: Math.round(x * 13 + z * 7) })) B.add(at(g, x, 0, z, ry), M[mk]);
  contact(B, M, x, 0, z, ry, L - 0.1, D - 0.1, 0.75);
  B.colliders.push({ t: 'obox', c: [x, 0.38, z], h: [L / 2, 0.38, D / 2], yaw: ry, mat: M.boucle });
}

// ---- solid wood --------------------------------------------------------------------------------
// every piece of wood takes its own cut of the scan (uv shifted, sometimes end for end), so no two
// boards show the same figure
let WSEED = 1;
function wcut(g, flip = null) {
  WSEED = (WSEED * 16807) % 2147483647; const a = WSEED / 2147483647;
  WSEED = (WSEED * 16807) % 2147483647; const b = WSEED / 2147483647;
  const f = flip == null ? (a > 0.5 ? -1 : 1) : flip, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, f * uv.getX(i) + a * 7.3, uv.getY(i) + b * 5.1);
  return g;
}
// grain running up a vertical member (legs, posts): metric UVs turned a quarter
const grainUp = (g) => wcut(metricUV(g, 1));
// a solid top as it is made: boards about bw wide glued along the length (grain along x), each its
// own cut of the scan, edges eased 1.5 mm (the eased edges of the glue lines read as fine joints);
// L along x, centred, T thick
function boardTop(L, T, D, bw = 0.15, r = 0.0015) {
  const n = Math.max(1, Math.round(D / bw)), w = D / n, gs = [];
  for (let i = 0; i < n; i++) gs.push(wcut(rbox(L, T, w, r, 1)).translate(0, 0, -D / 2 + w * (i + 0.5)));
  return merge3(gs);
}

// square coffee table (apartment-19): solid natural oak frame, mitred rails and legs with the grain
// running along each member, an oak slatted low shelf, a smoked glass top
function coffeeTable(B, M, x, z, ry, S = 1.0, H = 0.4, solid = false) {
  const add = (geo, mat) => B.add(at(geo, x, 0, z, ry), mat);
  const lw = 0.11, fh = 0.09;
  for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(at(grainUp(rbox(lw, H - fh, lw, 0.006)), u * (S / 2 - lw / 2), (H - fh) / 2, v * (S / 2 - lw / 2)), M.oakNat);
  for (const v of [-1, 1]) add(at(wcut(rbox(S, fh, lw, 0.006)), 0, H - fh / 2, v * (S / 2 - lw / 2)), M.oakNat);
  for (const u of [-1, 1]) add(at(wcut(rbox(S - 2 * lw + 0.004, fh, lw, 0.006)).rotateY(Math.PI / 2), u * (S / 2 - lw / 2), H - fh / 2, 0), M.oakNat);
  add(at(boardTop(S - 2 * lw + 0.01, 0.022, S - 2 * lw + 0.01, 0.13), 0, 0.075, 0), M.oakNat);   // low shelf
  if (solid) add(at(boardTop(S + 0.02, 0.03, S + 0.02, 0.17, 0.002), 0, H + 0.015, 0), M.oakNat);   // a solid oak top instead of the glass
  else brkAdd('glass top', x, z, ry, add)(at(rbox(S - 2 * lw + 0.02, 0.012, S - 2 * lw + 0.02, 0.003), 0, H - 0.02, 0), M.smoke);   // CQC: breakable
  B.colliders.push({ t: 'obox', c: [x, H / 2, z], h: [S / 2, H / 2, S / 2], yaw: ry, mat: M.oakNat });
}

// a rug with its own material (patterned)
function rugPlain(B, mat, x, z, w, d, ry = 0) {
  B.add(at(rbox(w, 0.014, d, 0.005, 2), x, 0.007, z, ry), mat);
}
// large cream rug, bound edge (apartment-19)
function rug(B, M, x, z, w, d, ry = 0) {
  B.add(at(rbox(w, 0.014, d, 0.005, 2), x, 0.007, z, ry), M.rug);
}

// grand piano (apartment-18 / -19): lacquered case, propped lid, keyboard, music desk, lyre,
// three legs, bench. Local frame: keyboard at the front (+z), bass side at -x.
function piano(B, M, x, z, ry) {
  const add = (geo, mat) => B.add(at(geo, x, 0, z, ry), mat);
  const W = 1.49, Lp = 1.6, y0 = 0.66, hR = 0.3;
  // case outline (top view, x across, -z toward the tail)
  const s = new THREE.Shape();
  // (shape y grows toward the tail; turned flat it becomes -z)
  s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(W / 2, 0.34);
  s.bezierCurveTo(W / 2, 0.7, 0.05, 0.62, 0.0, 1.2);
  s.bezierCurveTo(-0.03, 1.62, -W / 2, 1.68, -W / 2, 1.3);
  s.lineTo(-W / 2, 0);
  const rim = new THREE.ExtrudeGeometry(s, { depth: hR, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 40 });
  rim.rotateX(-Math.PI / 2); rim.translate(0, y0, 0.0);
  add(metricUV(rim.toNonIndexed()), M.lacquer);
  // plate and soundboard seen under the open lid
  const inner = new THREE.Shape(s.getPoints(40).map((p) => new THREE.Vector2(p.x * 0.9, p.y * 0.9 + 0.05)));
  const plate = new THREE.ShapeGeometry(inner, 40); plate.rotateX(-Math.PI / 2); plate.translate(0, y0 + hR - 0.02, 0);
  add(metricUV(plate.toNonIndexed()), M.brass);
  // lid, hinged along the bass side, propped about 35 degrees
  const lid = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: false, curveSegments: 40 });
  lid.rotateX(-Math.PI / 2); lid.translate(W / 2, 0, 0); lid.rotateZ(0.6); lid.translate(-W / 2, y0 + hR + 0.012, 0);
  add(metricUV(lid.toNonIndexed()), M.lacquer);
  add(at(rbox(0.018, 0.74, 0.018, 0.006), W / 2 - 0.16, y0 + hR + 0.37, -0.62, 0, 0, 0.1), M.lacquer);   // prop stick
  // keybed, cheek blocks, fallboard, music desk
  add(at(rbox(W, 0.07, 0.3, 0.008), 0, y0 + 0.03, 0.13), M.lacquer);
  for (const u of [-1, 1]) add(at(rbox(0.07, 0.16, 0.32, 0.012), u * (W / 2 - 0.035), y0 + 0.11, 0.14), M.lacquer);
  add(at(rbox(W - 0.14, 0.12, 0.03, 0.005), 0, y0 + 0.16, 0.015), M.lacquer);
  add(at(rbox(0.82, 0.3, 0.015, 0.004), 0, y0 + hR + 0.16, -0.05, 0, -0.32), M.lacquer);
  // keys: 52 white, 36 black (C-D-E: 2 black, F-G-A-B: 3 black, from A0)
  const kw = (W - 0.16) / 52, ky = y0 + 0.075;
  for (let i = 0; i < 52; i++) add(at(rbox(kw - 0.0012, 0.022, 0.15, 0.0015, 1), -W / 2 + 0.08 + kw * (i + 0.5), ky, 0.215), M.ivory);
  const names = 'ABCDEFG';
  for (let i = 0; i < 51; i++) {
    const nm = names[i % 7];
    if (nm === 'B' || nm === 'E') continue;
    add(at(rbox(kw * 0.55, 0.02, 0.095, 0.002, 1), -W / 2 + 0.08 + kw * (i + 1), ky + 0.018, 0.185), M.keyBlack);
  }
  // legs (three) and lyre with pedals
  for (const [u, v] of [[-W / 2 + 0.1, -0.08], [W / 2 - 0.1, -0.08], [-0.25, -1.3]]) {
    add(at(lathe([[0, 0], [0.04, 0], [0.045, 0.03], [0.05, 0.08], [0.06, y0 - 0.04], [0.075, y0]], 16), u, 0, v), M.lacquer);
  }
  add(at(rbox(0.32, 0.5, 0.05, 0.02), 0, 0.37, -0.22), M.lacquer);
  for (const u of [-0.07, 0, 0.07]) add(at(rbox(0.03, 0.012, 0.12, 0.004), u, 0.09, -0.17), M.brass);
  // bench
  add(at(rbox(0.8, 0.07, 0.36, 0.015), 0, 0.5, 0.75), M.lacquer);
  for (const [u, v] of [[-0.36, 0.6], [0.36, 0.6], [-0.36, 0.9], [0.36, 0.9]]) add(at(rbox(0.045, 0.47, 0.045, 0.008), u, 0.235, v), M.lacquer);
  B.colliders.push({ t: 'obox', c: [x + Math.sin(ry) * -0.7, 0.5, z + Math.cos(ry) * -0.7], h: [W / 2, 0.5, 0.85], yaw: ry, mat: M.lacquer });
}

// floor lamp: a dark sculptural base, bronze stem, linen drum shade (apartment-19)
function floorLamp(B, M, x, z) {
  B.add(at(lathe([[0, 0], [0.13, 0], [0.13, 0.03], [0.09, 0.06], [0.11, 0.22], [0.08, 0.4], [0.05, 0.5], [0.07, 0.6], [0.02, 0.66], [0, 0.66]], 28), x, 0, z), M.stoneBlack);
  B.add(at(lathe([[0.008, 0.66], [0.008, 1.42]], 10), x, 0, z), M.bronzeLight);
  const shade = lathe([[0.24, 1.32], [0.24, 1.62]], 40);
  B.add(at(shade, x, 0, z), M.shade);
  B.colliders.push({ t: 'obox', c: [x, 0.4, z], h: [0.15, 0.4, 0.15], yaw: 0, mat: M.stoneBlack });
}

// smoked glass pendant (apartment-19): an irregular blown form on a slim rod
function pendant(B, M, x, z, yBottom, ceil, seed) {
  const g = new THREE.IcosahedronGeometry(0.2, 4).toNonIndexed();
  const p = g.attributes.position, v = new THREE.Vector3();
  const r = (k) => Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453 % 1;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const phi = Math.atan2(n.z, n.x), lobes = 1 + 0.2 * Math.pow(Math.abs(Math.sin(phi * 2.5 + r(1) * 3)), 0.6) * (1 - n.y * n.y);
    const f = lobes * (1 + 0.07 * Math.sin(n.y * 5 + r(3) * 6)) * (n.y > 0 ? 1 - 0.25 * n.y * n.y : 1);
    v.multiplyScalar(f); v.y *= 1.2; p.setXYZ(i, v.x, v.y, v.z);
  }
  smooth(g); metricUV(g);
  B.add(at(g, x, yBottom + 0.25, z), M.smoke);
  B.add(at(lathe([[0.004, yBottom + 0.45], [0.004, ceil]], 6), x, 0, z), M.blackMatte);
  B.add(at(lathe([[0, ceil - 0.01], [0.05, ceil - 0.01], [0.05, ceil]], 16), x, 0, z), M.blackMatte);
}

// dining table for eight (apartment-17): a 45 mm solid walnut top of glued boards, lacquered, its
// edge eased and undercut (a knife edge seen from the side), on two oval travertine pedestals
function diningTable(B, M, x, z, ry, L = 2.7, Wd = 1.05, H = 0.75) {
  const add = (geo, mat) => B.add(at(geo, x, 0, z, ry), mat);
  add(at(boardTop(L, 0.03, Wd, 0.175, 0.002).rotateY(Math.PI / 2), 0, H - 0.015, 0), M.walnut);
  add(at(boardTop(L - 0.06, 0.03, Wd - 0.06, 0.175, 0.004).rotateY(Math.PI / 2), 0, H - 0.045, 0), M.walnut);   // the undercut under the eased edge
  for (const v of [-L / 2 + 0.55, L / 2 - 0.55]) {
    const ped = lathe([[0, 0], [0.2, 0], [0.2, 0.01], [0.16, 0.12], [0.15, H - 0.07], [0.19, H - 0.06], [0, H - 0.06]], 32);
    ped.scale(1.15, 1, 0.8);
    add(at(ped, 0, 0, v), M.creamStone);
  }
  B.colliders.push({ t: 'obox', c: [x, H / 2, z], h: [Wd / 2, H / 2, L / 2], yaw: ry, mat: M.walnut });
}

// bouclé dining chair (apartment-17): a wide plump seat in a low upholstered shell whose back
// wraps round into arms that slope down to the front; slim black tapered legs, splayed
const diningChair = movable('dining chair', 7, function (B, M, x, z, ry) {
  const add = (geo, mat) => B.add(at(geo, x, 0, z, ry), mat);
  add(at(cushion(0.5, 0.12, 0.48, 0.05, 0.018, 4, { skip: ['y-'] }), 0, 0.47, 0.03), M.boucle);
  add(at(rbox(0.54, 0.07, 0.5, 0.03), 0, 0.41, 0.02), M.boucle);
  // shell: a band round a superellipse, open at the front; top height falls from back to arms
  const seg = 44, a0 = 0.62, a1 = Math.PI * 2 - 0.62, rx = 0.29, rz = 0.27, th = 0.055, yb = 0.44;
  const top = (a) => { const back = 0.5 + 0.5 * Math.cos(a - Math.PI); return 0.6 + 0.2 * Math.pow(back, 1.3); };
  const ring = (a, r) => { const c = Math.sin(a), d = Math.cos(a); const k = Math.pow(Math.pow(Math.abs(c), 3) + Math.pow(Math.abs(d), 3), -1 / 3); return [c * k * (rx + r), d * k * (rz + r)]; };
  const P = [];
  for (let i = 0; i < seg; i++) {
    const A = a0 + (a1 - a0) * i / seg, Bn = a0 + (a1 - a0) * (i + 1) / seg;
    for (const [r, flip] of [[0, false], [-th, true]]) {
      const [x0, z0] = ring(A, r), [x1, z1] = ring(Bn, r);
      const q = [[x0, yb, z0], [x1, yb, z1], [x1, top(Bn), z1], [x0, top(A), z0]];
      if (!flip) P.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]); else P.push(...q[0], ...q[2], ...q[1], ...q[0], ...q[3], ...q[2]);
    }
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); smooth(sg); metricUV(sg);
  add(at(sg, 0, 0, -0.02), M.boucle);
  // rolled top edge and the arm ends
  const rim = []; for (let i = 0; i <= seg; i++) { const A = a0 + (a1 - a0) * i / seg, [xx, zz] = ring(A, -th / 2); rim.push([xx, top(A), zz - 0.02]); }
  add(tubeGeo(rim, th / 2 + 0.006), M.boucle);
  for (const A of [a0, a1]) { const [xx, zz] = ring(A, -th / 2); add(at(lathe([[0, 0], [th / 2 + 0.006, 0.0], [th / 2 + 0.006, top(A) - yb], [0, top(A) - yb]], 12), xx, yb, zz - 0.02), M.boucle); }
  for (const [u, v] of [[-0.2, 0.2], [0.2, 0.2], [-0.19, -0.17], [0.19, -0.17]]) {
    const leg = lathe([[0.007, 0], [0.011, 0.2], [0.016, 0.41]], 10);
    leg.rotateX(v > 0 ? -0.1 : 0.14); leg.rotateZ(u > 0 ? -0.07 : 0.07);
    add(at(leg, u, 0, v), M.blackMatte);
  }
  B.colliders.push({ t: 'obox', c: [x, 0.4, z], h: [0.29, 0.4, 0.28], yaw: ry, mat: M.boucle });
});

// tiered chandelier of hanging glass leaves (apartment-17): rings of leaves on a brass frame
function chandelier(B, M, x, z, yBottom, ceil) {
  const tiers = 9, H = 1.05, R = 0.25;
  for (let t = 0; t < tiers; t++) {
    const y = yBottom + H * (t / tiers), r = R * (0.94 + 0.06 * t / tiers);
    const n = 26;
    B.add(at(lathe([[r - 0.01, y + H / tiers + 0.02], [r - 0.004, y + H / tiers + 0.024]], 40), x, 0, z), M.brass);
    for (let i = 0; i < n; i++) {
      const a = (i + (t % 2) * 0.5) / n * Math.PI * 2;
      const leaf = new THREE.PlaneGeometry(0.062, 0.15).toNonIndexed();
      leaf.translate(0, -0.075, 0);                      // hangs from its top edge
      leaf.rotateX(0.16 + 0.05 * Math.sin(i * 1.7 + t)); leaf.rotateY(a);
      B.add(at(leaf, x + Math.sin(a) * r, y + H / tiers + 0.02, z + Math.cos(a) * r), M.leafGlass);
    }
  }
  B.add(at(lathe([[0.008, yBottom + H], [0.008, ceil]], 8), x, 0, z), M.brass);
  B.add(at(lathe([[0, ceil - 0.012], [0.07, ceil - 0.012], [0.07, ceil]], 20), x, 0, z), M.brass);
}

// framed abstract canvas on a wall (normal along +x / -x / +z / -z): an original painting
// made at load, in the palette of the one in apartment-17
function painting(B, M, x, y, z, w, h, face) {
  const ry = { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': 0, '-z': Math.PI }[face];
  ART.push({ k: 'painting', x, y: y + ARTY, z, w, h, face });
  const cv = new THREE.PlaneGeometry(w, h).toNonIndexed();
  B.add(at(cv, x, y, z, ry), M.canvas);
  const f = 0.022, d = 0.045;
  for (const [u, v, ww, hh] of [[0, h / 2 + f / 2, w + 2 * f, f], [0, -h / 2 - f / 2, w + 2 * f, f], [-w / 2 - f / 2, 0, f, h], [w / 2 + f / 2, 0, f, h]]) {
    const g = rbox(ww, hh, d, 0.003, 1);
    g.translate(u, v, -d / 2 + 0.006);
    B.add(at(g, x, y, z, ry), M.brass);
  }
}

// plinth with a bust on top (apartment-17, -11)
function plinth(B, M, x, z, w, h, mat) {
  B.add(at(rbox(w, h, w, 0.004, 1), x, h / 2, z), mat);
  B.colliders.push({ t: 'box', min: [x - w / 2, 0, z - w / 2], max: [x + w / 2, h, z + w / 2], mat });
}

// curtains bunched at a column or a corner (apartment-20): floor-length white linen in deep
// soft folds hanging from the ceiling pocket; x0..x1 along x at depth z
function curtain(B, M, x0, x1, z, yTop, folds = 7, mat = null) {
  const nx = folds * 8, ny = 10, W = x1 - x0, H = yTop - 0.01, P = [], U = [];
  const pt = (i, j) => {
    const u = i / nx, t = j / ny, x = x0 + W * u, y = 0.01 + H * t;
    const a = 0.055 * (1 + 0.25 * (1 - t));                       // folds open a little toward the hem
    const dz = a * Math.sin(u * folds * Math.PI * 2 + 0.6 * Math.sin(t * 3.1 + u * 9)) + 0.012 * Math.sin(u * 37 + t * 5);
    return [x, y, z + dz];
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
    P.push(...a, ...b, ...c, ...a, ...c, ...d);
    const uv = (q) => [q[0] * 1.6 + q[2], q[1]];
    U.push(...uv(a), ...uv(b), ...uv(c), ...uv(a), ...uv(c), ...uv(d));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  smooth(g);
  B.add(g, mat || M.linen);
}

// fiddle-leaf fig in a big weathered stone pot (apartment-18 / -19): slender trunk, branches
// toward the top, broad leaves bunched at their ends
function figTree(B, M, x, z, seed = 3) {
  let sd = seed; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  B.add(at(lathe([[0, 0], [0.2, 0], [0.24, 0.03], [0.3, 0.3], [0.36, 0.52], [0.37, 0.56], [0.34, 0.56], [0.33, 0.53], [0, 0.53]], 40), x, 0, z), M.potStone);
  B.add(at(lathe([[0, 0.535], [0.33, 0.535]], 30), x, 0, z), M.moss);
  const trunk = [[0, 0.53, 0], [0.02, 0.95, 0.01], [-0.02, 1.45, 0.03], [0.03, 1.95, -0.02], [0.0, 2.35, 0.02]];
  const tube = (pts, r0, r1) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, 24, 1, 7, false).toNonIndexed();
    const p = g.attributes.position;
    // taper: scale each ring about the curve (TubeGeometry uses radius 1: rebuild by lerp)
    const frames = curve.computeFrenetFrames(24, false), q = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      q.fromBufferAttribute(p, i);
      let best = 0, bd = 1e9;
      for (let k = 0; k <= 24; k++) { const c = curve.getPointAt(k / 24); const dd = c.distanceToSquared(q); if (dd < bd) { bd = dd; best = k; } }
      const c = curve.getPointAt(best / 24), r = r0 + (r1 - r0) * best / 24;
      q.sub(c).multiplyScalar(r).add(c); p.setXYZ(i, q.x, q.y, q.z);
    }
    void frames;
    g.computeVertexNormals(); metricUV(g);
    return g;
  };
  B.add(at(tube(trunk, 0.034, 0.014), x, 0, z), M.bark);
  const leaves = [];
  for (let b = 0; b < 24; b++) {
    const y0 = 1.15 + rnd() * 1.15, a = rnd() * Math.PI * 2, L = 0.3 + rnd() * 0.4;
    const base = [0.02 * Math.sin(y0 * 3), y0, 0.02 * Math.cos(y0 * 3)];
    const tip = [base[0] + Math.cos(a) * L, y0 + 0.15 + rnd() * 0.25, base[2] + Math.sin(a) * L];
    const mid = [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2 + 0.06, (base[2] + tip[2]) / 2];
    B.add(at(tube([base, mid, tip], 0.009, 0.004), x, 0, z), M.bark);
    const nl = 12 + Math.floor(rnd() * 8);
    for (let k = 0; k < nl; k++) {
      const t = 0.45 + 0.55 * k / nl, px = base[0] + (tip[0] - base[0]) * t, py = base[1] + (tip[1] - base[1]) * t + 0.05 * Math.sin(t * 3), pz = base[2] + (tip[2] - base[2]) * t;
      leaves.push([px + (rnd() - 0.5) * 0.06, py + (rnd() - 0.5) * 0.05, pz + (rnd() - 0.5) * 0.06, a + (rnd() - 0.5) * 2.6, 0.17 + rnd() * 0.11]);
    }
  }
  for (const [px, py, pz, yaw, sz] of leaves) {
    // a leaf blade: a 4 x 6 grid on the photographed leaf (atlas half), cupped along the midrib
    // and drooping toward the tip, hung from its stalk
    const half = rnd() < 0.5 ? 0 : 0.5, w = sz * 0.55, l = sz, cup = 0.18 + rnd() * 0.12, droop = 0.25 + rnd() * 0.35;
    const P = [], U = [];
    const pt = (i, j) => { const u = i / 4 - 0.5, v = j / 6; return [u * w, v * l - droop * l * v * v, Math.abs(u) * w * cup * 2 - 0.0]; };
    const uv = (i, j) => [half + 0.5 * (i / 4), j / 6];
    for (let j = 0; j < 6; j++) for (let i = 0; i < 4; i++) {
      const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      P.push(...a, ...b, ...c, ...a, ...c, ...d);
      U.push(...uv(i, j), ...uv(i + 1, j), ...uv(i + 1, j + 1), ...uv(i, j), ...uv(i + 1, j + 1), ...uv(i, j + 1));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    smooth(g);
    g.rotateX(-0.75 - rnd() * 0.7); g.rotateZ((rnd() - 0.5) * 0.6); g.rotateY(yaw);
    B.add(at(g, x + px, py, z + pz), M.leaf);
  }
  B.colliders.push({ t: 'obox', c: [x, 0.3, z], h: [0.36, 0.3, 0.36], yaw: 0, mat: M.potStone });
}

// an antique rug hung on a wall (apartment-18 / -19): faded field and borders, on a rod
function wallRug(B, M, x, z, w, h, yBottom, face) {
  const ry = { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': 0, '-z': Math.PI }[face];
  ART.push({ k: 'wallRug', x, y: yBottom + h / 2 + ARTY, z, w, h, face });
  const g = new THREE.PlaneGeometry(w, h, 8, 12).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, 0.012 + 0.006 * Math.sin(p.getX(i) * 9) * (0.5 - p.getY(i) / h));
  g.computeVertexNormals();
  B.add(at(g, x, yBottom + h / 2, z, ry), M.wallRug);
  B.add(at(lathe([[0.012, -w / 2 - 0.08], [0.012, w / 2 + 0.08]], 8).rotateZ(Math.PI / 2), 0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(ry)).translate(x, yBottom + h + 0.02, z), M.bronzeLight);
}

// tub armchair (apartment-18): bouclé shell round a deep seat, short oak legs
const armchair = movable('armchair', 16, function (B, M, x, z, ry) {
  const add = (geo, mat) => B.add(at(geo, x, 0, z, ry), mat);
  add(at(cushion(0.62, 0.14, 0.6, 0.06, 0.02, 4, { skip: ['y-'], pipe: true, sag: 0.01 }), 0, 0.42, 0.03), M.boucle);
  add(at(rbox(0.66, 0.16, 0.64, 0.05), 0, 0.3, 0), M.boucle);
  const a0 = Math.PI * 0.28, aL = Math.PI * 1.44;
  const shell = new THREE.CylinderGeometry(0.36, 0.34, 0.42, 40, 4, true, a0, aL).toNonIndexed();
  const inner = new THREE.CylinderGeometry(0.29, 0.28, 0.42, 40, 4, true, a0, aL).toNonIndexed();
  const ip = inner.attributes.position.array;
  for (let i = 0; i < ip.length; i += 9) for (let k = 0; k < 3; k++) { const t = ip[i + 3 + k]; ip[i + 3 + k] = ip[i + 6 + k]; ip[i + 6 + k] = t; }
  smooth(inner);
  for (const gg of [shell, inner]) { metricUV(gg); add(at(gg, 0, 0.59, -0.02), M.boucle); }
  add(at(lathe([[0.29, 0.8], [0.325, 0.825], [0.36, 0.8]], 40, a0, aL), 0, 0, -0.02), M.boucle);
  for (const [u, v] of [[-0.24, 0.22], [0.24, 0.22], [-0.24, -0.22], [0.24, -0.22]]) add(at(lathe([[0.016, 0], [0.02, 0.22]], 10), u, 0, v), M.woodMid);
  B.colliders.push({ t: 'obox', c: [x, 0.4, z], h: [0.36, 0.4, 0.36], yaw: ry, mat: M.boucle });
});

// drum side table (travertine) and a table lamp on a dark figure base (apartment-20)
const sideTable = movable('side table', 30, function (B, M, x, z, ry, r = 0.27, h = 0.55) {
  B.add(at(lathe([[0, 0], [r, 0], [r, h - 0.03], [r - 0.01, h], [0, h]], 36), x, 0, z), M.creamStone);
  B.colliders.push({ t: 'obox', c: [x, h / 2, z], h: [r, h / 2, r], yaw: 0, mat: M.creamStone });
});
const tableLamp = movable('table lamp', 3.5, function (B, M, x, y, z) {
  B.add(at(lathe([[0, 0], [0.09, 0], [0.09, 0.02], [0.05, 0.05], [0.075, 0.16], [0.045, 0.3], [0.06, 0.36], [0.015, 0.42], [0, 0.42]], 24), x, y, z), M.stoneBlack);
  B.add(at(lathe([[0.006, 0.42], [0.006, 0.66]], 8), x, y, z), M.bronzeLight);
  B.add(at(lathe([[0.2, 0.6], [0.17, 0.84]], 36), x, y, z), M.shade);
}, false);
// coffee table things: a stack of books, a white ceramic bowl
function books(B, M, x, y, z, ry, n = 3) {
  const cols = [M.bookCream, M.bookGrey, M.bookBlack];
  let yy = y;
  for (let i = 0; i < n; i++) {
    const w = 0.24 + 0.04 * ((i * 7) % 3), d = 0.31 + 0.03 * ((i * 5) % 3), h = 0.022 + 0.008 * (i % 2);
    B.add(at(rbox(w, h, d, 0.003, 1), x, yy + h / 2, z, ry + 0.06 * (i - 1)), cols[i % 3]);
    yy += h;
  }
  return yy;
}
function bowl(B, M, x, y, z, r = 0.16) {
  B.add(at(lathe([[0, 0], [r * 0.45, 0], [r * 0.8, r * 0.25], [r, r * 0.55], [r * 0.97, r * 0.56], [r * 0.77, r * 0.28], [r * 0.4, r * 0.06], [0, r * 0.06]], 40), x, y, z), M.ceramic);
}

// king bed (apartment-10): upholstered channel headboard, fluted base, layered bedding, pillows.
// Local: head at -z, foot at +z
// a smooth grid surface from fn(s, t) -> [x, y, z] (s, t in 0..1), uvs in metres (su, sv: spans)
function gridGeo(nu, nv, fn, su, sv) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { pos.push(...fn(i / nu, j / nv)); uv.push(su * i / nu, sv * j / nv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}
const hash1 = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
// a duvet laid over a mattress top (width W, from z0 at the turn-down to the foot z1 at height top)
// that rounds over the sides and the foot and hangs `hang` m, with folds that grow as it drops;
// the corners hang lower. Returns { cloth, hem } (hem: the rolled edge along sides and foot).
function duvetGeo(W, z0, z1, top, hang, seed = 1) {
  const rc = 0.05, arc = rc * Math.PI / 2;
  const bend = (e) => e <= arc ? [rc * Math.sin(e / rc), rc * (1 - Math.cos(e / rc))] : [rc + 0.04 * (e - arc), rc + (e - arc)];
  const ph = [hash1(seed) * 6, hash1(seed + 1) * 6, hash1(seed + 2) * 6];
  const fn = (s, t) => {
    const a = (s - 0.5) * (W + 2 * hang), l = t * (z1 - z0 + hang);
    const ea = Math.max(0, Math.abs(a) - W / 2), el = Math.max(0, l - (z1 - z0));
    const [oa, da] = bend(ea), [ol, dl] = bend(el);
    let x = Math.sign(a) * (Math.min(Math.abs(a), W / 2) + oa), z = z0 + Math.min(l, z1 - z0) + ol;
    let y = top - da - dl * (1 + 0.15 * Math.min(1, ea / 0.1));
    // folds: hanging cloth swings in and out, more as it drops; soft wrinkles on top
    const fa = Math.min(1, da / 0.25), fl = Math.min(1, dl / 0.25);
    x += Math.sign(a) * fa * (0.018 * Math.sin(z * 9.5 + ph[0]) + 0.01 * Math.sin(z * 23 + ph[1]));
    z += fl * (0.018 * Math.sin(x * 9 + ph[1]) + 0.01 * Math.sin(x * 21 + ph[2]));
    if (!ea && !el) y += 0.007 * Math.sin(a * 13 + ph[2]) * Math.sin(l * 7 + ph[0]) + 0.004 * Math.sin(a * 31 + l * 17);
    return [x, Math.max(0.08, y), z];
  };
  const cloth = gridGeo(72, 64, fn, W + 2 * hang, z1 - z0 + hang);
  const pts = [];
  for (let i = 0; i <= 60; i++) pts.push(fn(0, Math.min(1, i / 60 * 1.02)));
  for (let i = 1; i <= 60; i++) pts.push(fn(i / 60, 1));
  for (let i = 59; i >= 0; i--) pts.push(fn(1, i / 60));
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1] + 0.012, p[2])));
  const hem = new THREE.TubeGeometry(curve, 240, 0.016, 8, false).toNonIndexed();
  return { cloth, hem: metricUV(hem) };
}
// a filled pillow: puffed both faces, corners pinched, a seam flange round the edge (w across,
// h tall, d thick; frame: centred, faces +-z)
function pillowGeo(w, h, d, flange = 0.012) {
  const face = (sg) => gridGeo(24, 18, (s, t) => {
    const u = s * 2 - 1, v = t * 2 - 1;
    const f = Math.pow(Math.max(0, (1 - u * u) * (1 - v * v)), 0.42) * (1 + 0.05 * Math.sin(u * 5.3 + v * 3.1));   // domed, slightly lumpy
    const pinch = 1 - 0.06 * Math.abs(u * v);                                  // corners draw in
    return [u * w / 2 * pinch, v * h / 2 * pinch - 0.02 * f * f, sg * (d / 2) * f];
  }, w, h);
  const back = face(-1); const p = back.attributes.position;           // flip winding of the back
  for (let i = 0; i < p.count; i += 3) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)); p.setXYZ(i + 1, x, y, z); }
  back.computeVertexNormals();
  const ring = [];
  for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); const k = 1 / Math.max(Math.abs(c), Math.abs(sn)); ring.push(new THREE.Vector3(c * k * w / 2 * 0.97, sn * k * h / 2 * 0.97, 0)); }
  const seam = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring, true), 128, flange / 2, 6, true).toNonIndexed();
  return merge3([face(1), back, metricUV(seam)]);
}
const merge3 = (gs) => mergeGeometries(gs.map((g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }), false);
function bed(B, M, x, z, ry, W = 2.05, Lb = 2.2, hbMat = null, HWx = 1.4) {
  const add = (geo, mat) => B.add(at(geo, x, 0, z, ry), mat);
  // fluted base: vertical ribs round the box
  add(at(rbox(W, 0.36, Lb, 0.03), 0, 0.2, 0), M.boucleTaupe);
  for (let i = 0; i < 40; i++) { const u = -W / 2 + 0.03 + (W - 0.06) * i / 39; add(at(rbox(0.035, 0.32, 0.02, 0.012, 2), u, 0.2, Lb / 2 + 0.005), M.boucleTaupe); }
  add(at(rbox(W - 0.06, 0.24, Lb - 0.08, 0.06), 0, 0.5, 0.02), M.linen);                   // mattress
  // sheet over the mattress top, duvet turned down and draped, folded throw at the foot
  const top = 0.62, zt = -Lb / 2 + 0.62;
  const dv = duvetGeo(W - 0.06, zt, Lb / 2 - 0.04, top + 0.035, 0.3, x * 7 + z);
  add(dv.cloth, M.duvet); add(dv.hem, M.duvet);
  add(at(cushion(W + 0.02, 0.06, 0.2, 0.03, 0.02), 0, top + 0.06, zt + 0.06), M.linen);        // turn-down
  add(at(rbox(W - 0.04, 0.012, 0.75, 0.006), 0, top + 0.006, -Lb / 2 + 0.38), M.linen);         // sheet under the pillows
  const tf = duvetGeo(W + 0.1, Lb / 2 - 0.5, Lb / 2 - 0.02, top + 0.075, 0.12, x + 3 * z);       // throw over the foot
  add(tf.cloth, M.throwSand); add(tf.hem, M.throwSand);
  // pillows: two euro shams against the headboard, two sleeping pillows, two shams, a lumbar
  const P = (w, h, d, u, y, v, tilt, mat, yaw = 0) => { const g = pillowGeo(w, h, d); g.rotateX(tilt); g.rotateY(yaw); add(at(g, u, y, v), mat); };
  for (const u of [-0.47, 0.47]) P(0.66, 0.66, 0.2, u * (W / 2.05), top + 0.36, -Lb / 2 + 0.16, -0.28, M.linen);
  for (const u of [-0.48, 0.48]) P(0.9, 0.5, 0.2, u * (W / 2.05), top + 0.22, -Lb / 2 + 0.34, -0.75, M.duvet);
  for (const u of [-0.42, 0.42]) P(0.6, 0.45, 0.17, u * (W / 2.05), top + 0.23, -Lb / 2 + 0.47, -0.36, M.throwSand, -u * 0.12);
  P(0.56, 0.3, 0.15, 0, top + 0.15, -Lb / 2 + 0.7, -0.22, M.boucle);
  // headboard wall panel: channels
  const HB = 1.35, HW = W + HWx, nch = Math.round(HW / 0.24);
  for (let i = 0; i < nch; i++) { const u = -HW / 2 + HW * (i + 0.5) / nch; add(at(rbox(HW / nch - 0.008, HB, 0.09, hbMat ? 0.006 : 0.035), u, 0.62 + HB / 2 - 0.1, -Lb / 2 - 0.06), hbMat || M.boucleTaupe); }
  contact(B, M, x, 0, z, ry, W - 0.06, Lb - 0.06, 0.7);
  B.colliders.push({ t: 'obox', c: [x, 0.35, z], h: [W / 2, 0.35, Lb / 2], yaw: ry, mat: M.linen });
}
// counter stool (plan: three at the kitchen peninsula): upholstered round seat with a crowned
// top and a welt, four slim bronze legs splayed, a foot ring
const counterStool = movable('counter stool', 6, function (B, M, x, z, ry = 0) {
  const add = (g, m) => B.add(at(g, x, 0, z, ry), m);
  const H = 0.66;
  add(lathe([[0, 0], [0.2, 0], [0.215, 0.02], [0.21, 0.055], [0.18, 0.075], [0.1, 0.085], [0, 0.088]], 32).translate(0, H - 0.06, 0), M.boucleTaupe);
  add(lathe([[0.2, 0], [0.212, 0.004], [0.2, 0.008]], 32).translate(0, H - 0.04, 0), M.boucleTaupe);   // welt
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, c = Math.cos(a), sn = Math.sin(a);
    add(tubeGeo([[c * 0.24, 0.0, sn * 0.24], [c * 0.2, H * 0.5, sn * 0.2], [c * 0.15, H - 0.06, sn * 0.15]], 0.011), M.bronzeLight);
  }
  const ring = []; for (let i = 0; i <= 32; i++) { const a = i / 32 * Math.PI * 2; ring.push([Math.cos(a) * 0.2, 0.24, Math.sin(a) * 0.2]); }
  add(tubeGeo(ring, 0.008), M.bronzeLight);
  B.colliders.push({ t: 'obox', c: [x, H / 2, z], h: [0.22, H / 2, 0.22], yaw: ry, mat: M.boucleTaupe });
});
// stair-foot table (apartment-12): round bronze top on a hammered brass trumpet pedestal; a
// matte black ceramic vase with leafy branches, two books, an open magazine
function pedestalTable(B, M, x, z, seed = 7) {
  const add = (g, m) => B.add(at(g, x, 0, z), m);
  const H = 0.7, R = 0.46;
  add(lathe([[0, 0], [0.235, 0], [0.24, 0.012], [0.2, 0.08], [0.13, 0.2], [0.085, 0.36], [0.075, 0.48], [0.09, 0.6], [0.13, 0.665], [0.14, H - 0.02], [0, H - 0.02]], 48), M.brassHammered);
  add(lathe([[0, H - 0.022], [R - 0.004, H - 0.022], [R, H - 0.016], [R, H - 0.004], [R - 0.004, H], [0, H]], 64), M.brassTop);
  B.colliders.push({ t: 'obox', c: [x, H / 2, z], h: [R * 0.72, H / 2, R * 0.72], yaw: 0, mat: M.bronzeLight });
  // vase: wide shoulder, narrow neck, lip
  const vx = 0.12, vz = -0.08;
  add(at(lathe([[0, 0], [0.07, 0], [0.11, 0.05], [0.135, 0.13], [0.13, 0.2], [0.1, 0.26], [0.05, 0.3], [0.042, 0.33], [0.048, 0.345], [0.04, 0.35], [0.035, 0.33]], 40), vx, H, vz), M.vaseBlack);
  let sd = seed; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  for (let b = 0; b < 7; b++) {
    const a = rnd() * Math.PI * 2, lean = 0.25 + rnd() * 0.45, L = 0.35 + rnd() * 0.3;
    const p0 = [vx, H + 0.32, vz], p2 = [vx + Math.cos(a) * Math.sin(lean) * L, H + 0.32 + Math.cos(lean) * L, vz + Math.sin(a) * Math.sin(lean) * L];
    const p1 = [(p0[0] + p2[0]) / 2 + (rnd() - 0.5) * 0.05, (p0[1] + p2[1]) / 2 + 0.03, (p0[2] + p2[2]) / 2 + (rnd() - 0.5) * 0.05];
    B.add(at(tubeGeo([p0, p1, p2], 0.0035), x, 0, z), M.bark);
    for (let k = 0; k < 9; k++) {
      const t = 0.3 + 0.7 * k / 9, q = [p0[0] + (p2[0] - p0[0]) * t, p0[1] + (p2[1] - p0[1]) * t + 0.02 * Math.sin(t * 3), p0[2] + (p2[2] - p0[2]) * t];
      const sz = 0.05 + rnd() * 0.035, g = leafBlade(sz, rnd);
      g.rotateX(-0.6 - rnd() * 0.9); g.rotateZ((rnd() - 0.5) * 0.8); g.rotateY(a + (rnd() - 0.5) * 2.8);
      B.add(at(g, x + q[0], q[1], z + q[2]), M.leaf);
    }
  }
  add(at(rbox(0.26, 0.022, 0.19, 0.003, 1), -0.16, H + 0.011, 0.04, 0.3), M.bookBlack);
  add(at(rbox(0.23, 0.018, 0.17, 0.003, 1), -0.15, H + 0.031, 0.05, 0.45), M.bookCream);
  add(at(rbox(0.28, 0.006, 0.21, 0.002, 1), 0.02, H + 0.003, 0.2, -0.25), M.ivory);
}
// one leaf blade on the photographed leaf atlas: a 4 x 6 grid, cupped, drooping (frame: stalk at
// the origin, along +y)
function leafBlade(sz, rnd) {
  const half = rnd() < 0.5 ? 0 : 0.5, w = sz * 0.55, l = sz, cup = 0.18 + rnd() * 0.12, droop = 0.25 + rnd() * 0.35;
  const P = [], U = [];
  const pt = (i, j) => { const u = i / 4 - 0.5, v = j / 6; return [u * w, v * l - droop * l * v * v, Math.abs(u) * w * cup * 2]; };
  const uv = (i, j) => [half + 0.5 * (i / 4), j / 6];
  for (let j = 0; j < 6; j++) for (let i = 0; i < 4; i++) {
    const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
    P.push(...a, ...b, ...c, ...a, ...c, ...d);
    U.push(...uv(i, j), ...uv(i + 1, j), ...uv(i + 1, j + 1), ...uv(i, j), ...uv(i + 1, j + 1), ...uv(i, j + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return smooth(g);
}
function nightstand(B, M, x, z, ry) {
  // walnut case on a recessed plinth, two drawers with 3 mm reveals, bronze bar pulls
  const add = (geo, mat) => B.add(at(geo, x, 0, z, ry), mat);
  const W = 0.55, D = 0.42, H = 0.56, pl = 0.06;
  add(at(rbox(W - 0.06, pl, D - 0.06, 0.004, 1), 0, pl / 2, -0.01), M.blackMatte);
  add(at(wcut(rbox(W, H - pl - 0.025, D - 0.02, 0.004, 2)), 0, pl + (H - pl - 0.025) / 2, -0.01), M.walnut);
  add(at(boardTop(W + 0.006, 0.025, D - 0.014, 0.21, 0.0025), 0, H - 0.0125, -0.008), M.walnut);   // solid top, a hair proud
  const fh = (H - pl - 0.05 - 0.003) / 2;
  for (const k of [0, 1]) {
    const y = pl + 0.025 + fh / 2 + k * (fh + 0.003);
    add(at(rbox(W - 0.03, fh, 0.004, 0.0015, 1), 0, y, D / 2 - 0.022), M.blackMatte);          // reveal shadow
    add(at(wcut(rbox(W - 0.036, fh - 0.006, 0.019, 0.003, 2)), 0, y, D / 2 - 0.0095), M.walnut);     // drawer front
    add(at(barPull(0.12, 0.0055, 0.022, 0.018).rotateZ(Math.PI / 2), 0, y + fh * 0.18, D / 2), M.bronzeLight);
  }
  B.colliders.push({ t: 'obox', c: [x, H / 2, z], h: [W / 2, H / 2, D / 2], yaw: ry, mat: M.walnut });
}

// open shelving wall (apartment-09 bleached oak, apartment-13 dark oak): a frame of shelves and
// uprights on cabinets, along x at depth z0..z0+d facing +z (turned by ry)
function shelving(B, M, x, z, ry, W, H, d, mat, cols = 4, rows = 5) {
  const add = (geo, m) => B.add(at(geo, x, 0, z, ry), m);
  const t = 0.035, cab = 0.7;
  add(at(rbox(W, cab, d, 0.004, 1), 0, cab / 2, 0), mat);
  for (let c = 1; c < cols; c++) add(at(rbox(0.004, cab - 0.06, 0.003, 0.001, 1), -W / 2 + W * c / cols, cab / 2, d / 2 + 0.001), M.blackMatte);
  for (let c = 0; c <= cols; c++) add(at(rbox(t, H - cab, d - 0.04, 0.003, 1), -W / 2 + t / 2 + (W - t) * c / cols, cab + (H - cab) / 2, -0.02), mat);
  for (let r = 1; r <= rows; r++) add(at(rbox(W, t, d - 0.04, 0.003, 1), 0, cab + (H - cab) * r / rows - t / 2, -0.02), mat);
  add(at(rbox(W, H - cab, 0.02, 0.002, 1), 0, cab + (H - cab) / 2, -d / 2 + 0.01), mat);
  B.colliders.push({ t: 'obox', c: [x, H / 2, z], h: [W / 2, H / 2, d / 2], yaw: ry, mat });
  return { add, cab, rows, cols, t };
}
// shelf objects: vases, book rows, bowls on shelf r column c
function shelfDecor(B, M, sh, x, z, ry, W, H, d, seed) {
  let sd = seed; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const cw = W / sh.cols, rh = (H - sh.cab) / sh.rows;
  for (let r = 0; r < sh.rows; r++) for (let c = 0; c < sh.cols; c++) {
    const k = rnd(), u = -W / 2 + cw * (c + 0.5), y = sh.cab + rh * r + sh.t / 2;
    if (k < 0.35) {           // a row of books
      let uu = u - cw * 0.35; const n = 4 + Math.floor(rnd() * 8);
      for (let i = 0; i < n; i++) { const w = 0.025 + rnd() * 0.02, h = Math.min(rh - 0.06, 0.2 + rnd() * 0.1); sh.add(at(rbox(w, h, 0.17 + rnd() * 0.05, 0.002, 1), uu + w / 2, y + h / 2, 0), [M.bookCream, M.bookGrey, M.bookBlack][Math.floor(rnd() * 3)]); uu += w + 0.002; }
    } else if (k < 0.6) {     // a vase
      const r0 = 0.05 + rnd() * 0.05, h = 0.14 + rnd() * 0.18;
      brkAdd('vase', x, z, ry, sh.add)(at(lathe([[0, 0], [r0 * 0.6, 0], [r0, h * 0.4], [r0 * 0.5, h * 0.85], [r0 * 0.55, h], [0, h]], 24), u + (rnd() - 0.5) * cw * 0.4, y, 0), rnd() < 0.5 ? M.ceramic : M.stoneBlack);   // CQC: breakable
    } else if (k < 0.75) {    // a bowl
      bowlGeo(BRK ? { add: brkAdd('bowl', x, z, ry) } : sh, M, u, y, 0, 0.08 + rnd() * 0.05);   // CQC: breakable
    }
  }
}
function bowlGeo(sh, M, x, y, z, r) {
  sh.add(at(lathe([[0, 0], [r * 0.45, 0], [r * 0.8, r * 0.25], [r, r * 0.55], [r * 0.97, r * 0.56], [r * 0.77, r * 0.28], [r * 0.4, r * 0.06], [0, r * 0.06]], 32), x, y, z), M.ceramic);
}

// curved bouclé sofa (apartment-09 / -02): the straight sofa's parts (no arms, rounded ends) bent
// round an arc. Centred on (x, z), arc radius R (to the seat front), sweep sw, facing the arc centre
// (ry: the direction the middle of the sofa faces)
function curvedSofa(B, M, x, z, ry, R = 2.2, sw = 1.1, D = 0.95) {
  const cx = x + Math.sin(ry) * R, cz = z + Math.cos(ry) * R, mid = ry + Math.PI;
  const a0 = mid - sw / 2, a1 = mid + sw / 2, rm = R + D / 2, L = rm * sw;
  const parts = sofaParts(L, D, { arms: false, n: L > 2.4 ? 3 : 2, seed: Math.round(x * 5 + z * 3), pillows: [['boucleTaupe', -1], ['boucleTaupe', 1]] });
  // the parts lie along x round the middle of the arc (which bends to angle 0, +z); turn it to mid
  for (const [g, mk] of parts) { bendArc(g, rm); g.rotateY(mid); B.add(at(g, cx, 0, cz), M[mk]); }
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (i + 0.5) / n, ax = cx + Math.sin(a) * (R + D / 2), az = cz + Math.cos(a) * (R + D / 2);
    B.colliders.push({ t: 'obox', c: [ax, 0.38, az], h: [(R + D / 2) * (a1 - a0) / n / 2, 0.38, D / 2], yaw: a, mat: M.boucle });
    contact(B, M, ax, 0, az, a, (R + D / 2) * (a1 - a0) / n, D - 0.12, 0.6);
  }
}
// an annular sector with rounded edges: inner radius r0, outer r1, heights y0..y1, angles a0..a1
// (angle measured as in three: x = r sin a, z = r cos a), corner radius rr
function rboxArc(r0, r1, y0, y1, a0, a1, rr, seg) {
  // build a straight rounded box along x then bend it round the arc
  const Lm = (r0 + r1) / 2 * (a1 - a0), W = r1 - r0, H = y1 - y0;
  const g = rbox(Lm, H, W, rr, 3);
  const p = g.attributes.position, N = g.attributes.normal, v = new THREE.Vector3(), n = new THREE.Vector3();
  const rm = (r0 + r1) / 2;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); n.fromBufferAttribute(N, i);
    const a = (a0 + a1) / 2 + v.x / rm, r = rm + v.z;
    p.setXYZ(i, Math.sin(a) * r, y0 + H / 2 + v.y, Math.cos(a) * r);
    // normal: rotate the box frame (x along the arc tangent, z outward) to the arc point
    const tx = Math.cos(a), tz = -Math.sin(a), ox = Math.sin(a), oz = Math.cos(a);
    N.setXYZ(i, n.x * tx + n.z * ox, n.y, n.x * tz + n.z * oz);
  }
  return g;
}

// round travertine coffee table on a drum (apartment-09)
function roundTable(B, M, x, z, r = 0.55, h = 0.38) {
  B.add(at(lathe([[0, h - 0.05], [r, h - 0.05], [r, h - 0.01], [r - 0.01, h], [0, h]], 48), x, 0, z), M.creamStone);
  B.add(at(lathe([[0, 0], [r * 0.45, 0], [r * 0.42, h - 0.05], [0, h - 0.05]], 40), x, 0, z), M.creamStone);
  B.colliders.push({ t: 'obox', c: [x, h / 2, z], h: [r * 0.75, h / 2, r * 0.75], yaw: 0, mat: M.creamStone });
}

// beaded crystal chandelier (apartment-10): tiers of hanging strands
function beadChandelier(B, M, x, z, yBottom, ceil) {
  const tiers = 4, H = 0.75;
  for (let t = 0; t < tiers; t++) {
    const r = 0.18 + 0.1 * t, y = yBottom + H * t / tiers * 0.6, len = H - 0.15 * t;
    B.add(at(lathe([[r, y + len], [r + 0.012, y + len + 0.01]], 40), x, 0, z), M.nickel);
    const n = Math.round(r * 90);
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; B.add(at(lathe([[0.004, 0], [0.004, len]], 4), x + Math.sin(a) * r, y, z + Math.cos(a) * r), M.crystal); }
  }
  B.add(at(lathe([[0.006, yBottom + H], [0.006, ceil]], 8), x, 0, z), M.nickel);
}
// gold leaf chandelier (apartment-09): brass discs on a sphere
function goldChandelier(B, M, x, z, yc, ceil) {
  // apartment-09: a cluster of cupped brass leaves round a small core, overlapping like petals
  let sd = 5; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  for (let i = 0; i < 130; i++) {
    const u = rnd() * 1.9 - 0.95, a = rnd() * Math.PI * 2, rr = Math.sqrt(1 - u * u), R = 0.24 + rnd() * 0.06;
    const d = new THREE.Vector3(rr * Math.cos(a), u * 0.8, rr * Math.sin(a)).normalize();
    const L = 0.12 + rnd() * 0.05, W = L * 0.55;
    const g = new THREE.PlaneGeometry(W, L, 4, 6).toNonIndexed();
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const px = p.getX(k) / (W / 2), py = p.getY(k) / L + 0.5;
      const edge = Math.sin(py * Math.PI);                        // leaf outline: narrow at both ends
      p.setX(k, p.getX(k) * edge);
      p.setZ(k, 0.025 * px * px * edge + 0.03 * py * py);         // cupped across, curling out at the tip
    }
    g.computeVertexNormals(); metricUV(g);
    g.translate(0, L / 2, 0); g.rotateX(-0.6 - rnd() * 0.5); g.rotateZ((rnd() - 0.5) * 0.8);
    g.lookAt(d); g.translate(d.x * R * 0.6, yc + d.y * R * 0.6, d.z * R * 0.6);
    B.add(at(g, x, 0, z), M.goldLeaf);
  }
  B.add(at(lathe([[0, -0.06], [0.06, -0.04], [0.07, 0], [0.06, 0.04], [0, 0.06]], 20), x, yc, z), M.brass);
  B.add(at(lathe([[0.006, yc], [0.006, ceil]], 8), x, 0, z), M.brass);
}

// framed print / art on a wall: tex is a canvas texture; face as painting()
function print(B, M, x, y, z, w, h, face, mat) {
  const ry = { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': 0, '-z': Math.PI }[face];
  ART.push({ k: 'print', x, y: y + ARTY, z, w, h, face });
  B.add(at(new THREE.PlaneGeometry(w, h).toNonIndexed(), x, y, z, ry), mat);
  const f = 0.02, d = 0.03;
  for (const [u, v, ww, hh] of [[0, h / 2 + f / 2, w + 2 * f, f], [0, -h / 2 - f / 2, w + 2 * f, f], [-w / 2 - f / 2, 0, f, h], [w / 2 + f / 2, 0, f, h]]) {
    const g = rbox(ww, hh, d, 0.003, 1); g.translate(u, v, -d / 2 + 0.005);
    B.add(at(g, x, y, z, ry), M.woodLight);
  }
}

// TV in a dark oak media wall (apartment-13)
function tv(B, M, x, y, z, ry, w = 1.45, h = 0.83) {
  B.add(at(rbox(w, h, 0.03, 0.004, 1), x, y, z, ry), M.tvGlass);
}

// ---- kitchen (apartment-15): dark oak base run, stone counter and splash, white lacquer uppers;
// local x along the run, the front faces +z (turned by ry)
// ---- openable interiors (kitchen) ----------------------------------------------------------------
// Cabinet doors, drawers, the fridge and pantry doors and the oven doors are their own parts: each is built in its own
// frame (pivot at the origin: a hinge line, a drawer's back plane, an oven door's bottom edge) and handed back as an
// openable { kind, type: 'hinge' | 'drawer' | 'flap', group (the pivot, placed in apartment coordinates), max }, so the
// game can swing / slide / drop it. Behind them the carcasses are hollow: shelves, racks, liners, and what is kept there.
let OPN = [];
const _ov = new THREE.Vector3(), _oy = new THREE.Vector3(0, 1, 0);
function opnPart(kind, x, z, ry, lx, ly, lz, spec) {
  _ov.set(lx, 0, lz).applyAxisAngle(_oy, ry);
  const b = new Builder();
  OPN.push({ kind, b, x: x + _ov.x, y: ARTY + ly, z: z + _ov.z, ry, ...spec });
  return b;
}
// a hollow box (open at the front, +z): back, bottom, top, two sides; t = panel thickness
function hollow(add, x0, x1, y0, y1, z0, z1, t, m, top = true) {
  const box = (a0, a1, b0, b1, c0, c1) => add(at(rbox(a1 - a0, b1 - b0, c1 - c0, 0.001, 1), (a0 + a1) / 2, (b0 + b1) / 2, (c0 + c1) / 2), m);
  box(x0, x1, y0, y1, z0, z0 + t); box(x0, x1, y0, y0 + t, z0, z1); if (top) box(x0, x1, y1 - t, y1, z0, z1);
  box(x0, x0 + t, y0, y1, z0, z1); box(x1 - t, x1, y0, y1, z0, z1);
}
// things kept inside (simple, real sizes)
function stackPlates(add, M, x, y, z, n = 6, r = 0.13) { for (let i = 0; i < n; i++) add(at(lathe([[0, 0], [r * 0.62, 0], [r * 0.7, 0.008], [r, 0.02], [r - 0.004, 0.022], [r * 0.66, 0.012], [0, 0.012]], 32), x, y + i * 0.014, z), M.ceramic); }
function bowls(add, M, x, y, z, n = 3) { for (let i = 0; i < n; i++) add(at(lathe([[0, 0], [0.04, 0], [0.075, 0.05], [0.072, 0.052], [0.037, 0.006], [0, 0.006]], 28), x, y + i * 0.022, z), M.ceramic); }
function pot(add, M, x, y, z, r = 0.1, h = 0.11) {
  add(at(lathe([[0, 0], [r, 0], [r, h], [r - 0.003, h], [r - 0.003, 0.004], [0, 0.004]], 32), x, y, z), M.steel);
  add(at(lathe([[0, h + 0.012], [r * 0.25, h + 0.01], [r + 0.004, h], [r + 0.004, h - 0.003], [0, h - 0.003]], 32), x, y, z), M.steel);
  add(at(lathe([[0, h + 0.012], [0.012, h + 0.012], [0.012, h + 0.03], [0, h + 0.03]], 12), x, y, z), M.blackMatte);
}
function glasses(add, M, x, y, z, nx = 3, nz = 2) { for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) add(at(lathe([[0, 0], [0.034, 0], [0.036, 0.11], [0.033, 0.11], [0.031, 0.006], [0, 0.006]], 20), x + i * 0.085, y, z + j * 0.085), M.glass); }
function jar(add, M, x, y, z, r, h, lid) { add(at(lathe([[0, 0], [r, 0], [r, h], [r * 0.85, h + 0.01], [0, h + 0.01]], 20), x, y, z), M.glass); add(at(lathe([[0, h + 0.01], [r * 0.88, h + 0.01], [r * 0.88, h + 0.025], [0, h + 0.025]], 20), x, y, z), lid); }
function carton(add, m, x, y, z, w, h, d) { add(at(rbox(w, h, d, 0.004, 1), x, y + h / 2, z), m); }
function bottle(add, m, cap, x, y, z, r = 0.035, h = 0.26) { add(at(lathe([[0, 0], [r, 0], [r, h * 0.62], [r * 0.4, h * 0.82], [r * 0.32, h], [0, h]], 20), x, y, z), m); add(at(lathe([[0, h], [r * 0.34, h], [r * 0.34, h + 0.02], [0, h + 0.02]], 12), x, y, z), cap); }
function can(add, M, x, y, z, r = 0.037, h = 0.11, label) { add(at(lathe([[0, 0], [r, 0], [r, h], [0, h]], 20), x, y, z), label || M.steel); }

// base cabinet bay: a hollow carcass, a shelf, a hinged door (lower) and a drawer (upper); w = bay width
function baseBay(B, M, x, z, ry, cx, w, D, H, i, contents) {
  const add = (g, m) => B.add(at(g, x, 0, z, ry), m);
  const fz = D / 2 - 0.02, back = -D / 2 + 0.01;
  hollow((g, m) => add(at(g, cx, 0, 0), m), -w / 2 + 0.002, w / 2 - 0.002, 0.1, H, back, fz, 0.018, M.melamine, false);
  add(at(rbox(w - 0.04, 0.018, D - 0.08, 0.001, 1), cx, 0.33, -0.02), M.melamine);           // shelf
  add(at(rbox(w - 0.04, 0.018, D - 0.06, 0.001, 1), cx, 0.556, -0.02), M.melamine);          // rail under the drawer
  if (contents) contents((g, m) => add(at(g, cx, 0, 0), m));
  // door: hinged on the side away from the neighbour's hinge (alternating), opens 105 deg
  const left = i % 2 === 0, hx = cx + (left ? -w / 2 + 0.002 : w / 2 - 0.002);
  const d = opnPart('cab', x, z, ry, hx, 0, fz, { type: 'hinge', max: (left ? -1 : 1) * 1.83, w: w - 0.004, h: 0.42, handle: [(left ? 1 : -1) * (w - 0.06), 0.54, 0.02] });
  d.add(at(rbox(w - 0.004, 0.42, 0.02, 0.002, 1), (left ? 1 : -1) * (w / 2 - 0.002), 0.33, 0.01), M.woodDark);
  // drawer: front + box (sides, bottom, back) 0.48 deep, slides out 0.42
  const dr = opnPart('drawer', x, z, ry, cx, 0, fz, { type: 'drawer', max: 0.42, w: w - 0.004, h: 0.24, handle: [0, 0.81, 0.02] });
  dr.add(at(rbox(w - 0.004, 0.24, 0.02, 0.002, 1), 0, 0.7, 0.01), M.woodDark);
  hollow((g, m) => dr.add(g, m), -w / 2 + 0.035, w / 2 - 0.035, 0.6, 0.78, -0.48, 0, 0.012, M.melamine, false);
  // cutlery insert: grey tray with dividers
  dr.add(at(rbox(w - 0.1, 0.006, 0.4, 0.001, 1), 0, 0.615, -0.24), M.frameGrey);
  for (let k = -2; k <= 2; k++) dr.add(at(rbox(0.004, 0.04, 0.38, 0.001, 1), k * (w - 0.12) / 5, 0.635, -0.24), M.frameGrey);
}
// wall cabinet bay (white lacquer, 0.35 deep): two shelves, a hinged door
function upperBay(B, M, x, z, ry, cx, w, y0, h, dz, i, contents) {
  const add = (g, m) => B.add(at(g, x, 0, z, ry), m);
  const D = 0.35, fz = dz + D / 2 - 0.018, back = dz - D / 2;
  hollow((g, m) => add(at(g, cx, 0, 0), m), -w / 2 + 0.002, w / 2 - 0.002, y0, y0 + h, back, fz, 0.018, M.melamine, true);
  for (const k of [1, 2]) add(at(rbox(w - 0.04, 0.016, D - 0.05, 0.001, 1), cx, y0 + h * k / 3, dz - 0.01), M.melamine);
  if (contents) contents((g, m) => add(at(g, cx, 0, 0), m), y0, h, dz);
  const left = i % 2 === 0, hx = cx + (left ? -w / 2 + 0.002 : w / 2 - 0.002);
  const d = opnPart('cab', x, z, ry, hx, 0, fz, { type: 'hinge', max: (left ? -1 : 1) * 1.83, w: w - 0.004, h, handle: [(left ? 1 : -1) * (w - 0.05), y0 + 0.04, 0.02] });
  d.add(at(rbox(w - 0.004, h - 0.004, 0.018, 0.003, 1), (left ? 1 : -1) * (w / 2 - 0.002), y0 + h / 2, 0.009), M.lacquerWhite);
}
// tall units: an integrated fridge (French doors over a freezer drawer) and a pantry behind wood panel doors, or an oven stack
function tallUnitOpen(B, M, x, z, ry, W, H, ovens) {
  const add = (g, m) => B.add(at(g, x, 0, z, ry), m);
  const D = 0.62, fz = D / 2 - 0.02, back = -D / 2;
  if (ovens) {
    // carcass with two oven niches; each oven: black enamel cavity, two racks, a lamp, a drop-down steel and smoked-glass door
    const ys = [0.95, 1.55];
    const solid = (y0, y1) => add(at(rbox(W, y1 - y0, D - 0.02, 0.003, 1), 0, (y0 + y1) / 2, -0.01), M.woodDark);
    solid(0, ys[0]); solid(ys[0] + 0.58, ys[1]); solid(ys[1] + 0.58, H);
    for (const yy of ys) {
      add(at(rbox(W, 0.58, 0.02, 0.002, 1), 0, yy + 0.29, back + 0.01), M.woodDark);
      add(at(rbox(0.02, 0.58, D - 0.02, 0.002, 1), -W / 2 + 0.01, yy + 0.29, -0.01), M.woodDark); add(at(rbox(0.02, 0.58, D - 0.02, 0.002, 1), W / 2 - 0.01, yy + 0.29, -0.01), M.woodDark);
      const cw = W - 0.16, ch = 0.38, cy0 = yy + 0.08, cz0 = -0.24, cz1 = fz - 0.03;
      hollow(add, -cw / 2, cw / 2, cy0, cy0 + ch, cz0, cz1, 0.01, M.ovenEnamel, true);
      add(at(rbox(W - 0.04, 0.1, 0.02, 0.003, 1), 0, yy + 0.51, fz), M.steel);                        // control strip
      for (const k of [-1, 1]) add(at(lathe([[0, 0], [0.018, 0], [0.018, 0.018], [0, 0.022]], 20).rotateX(Math.PI / 2), k * 0.22, yy + 0.51, fz + 0.01), M.blackMatte);
      add(at(rbox(0.12, 0.03, 0.004, 0.002, 1), 0, yy + 0.51, fz + 0.011), M.ledStrip);               // display
      for (const r of [0.13, 0.25]) for (let k = 0; k < 9; k++) add(at(lathe([[0.0025, 0], [0.0025, cz1 - cz0 - 0.04]], 6).rotateX(Math.PI / 2), -cw / 2 + 0.03 + k * (cw - 0.06) / 8, cy0 + r, (cz0 + cz1) / 2), M.steel);
      add(at(lathe([[0, 0], [0.018, 0], [0.018, 0.006], [0, 0.012]], 16).rotateX(Math.PI / 2), -cw / 2 + 0.05, cy0 + ch - 0.04, cz0 + 0.012), M.ledStrip);   // oven lamp
      const d = opnPart('oven', x, z, ry, 0, yy + 0.02, fz, { type: 'flap', max: 1.48, w: W - 0.04, h: 0.44, handle: [0, 0.4, 0.05] });
      d.add(at(rbox(W - 0.04, 0.44, 0.022, 0.004, 1), 0, 0.22, 0.011), M.steel);
      d.add(at(rbox(W - 0.14, 0.27, 0.006, 0.004, 1), 0, 0.2, 0.025), M.smoke);
      d.add(at(barPull(W - 0.2, 0.009, 0.04, 0.03).rotateZ(Math.PI / 2), 0, 0.4, 0.023), M.steel);
    }
    B.colliders.push({ t: 'obox', c: [x, H / 2, z], h: [W / 2, H / 2, D / 2], yaw: ry, mat: M.woodDark });
    return;
  }
  const n = Math.max(1, Math.round(W / 0.6)), dw = W / n, fr = n >= 4 ? 2 : 0;       // the first two doors: the fridge
  add(at(rbox(W, 0.1, D - 0.06, 0.002, 1), 0, 0.05, -0.03), M.blackMatte);              // plinth
  add(at(rbox(W, 0.12, D - 0.02, 0.002, 1), 0, H - 0.06, -0.01), M.woodDark);            // top panel
  add(at(rbox(W, H - 0.22, 0.02, 0.002, 1), 0, (H - 0.22) / 2 + 0.1, back + 0.01), M.woodDark);
  add(at(rbox(0.02, H, D - 0.02, 0.002, 1), -W / 2 + 0.01, H / 2, -0.01), M.woodDark); add(at(rbox(0.02, H, D - 0.02, 0.002, 1), W / 2 - 0.01, H / 2, -0.01), M.woodDark);
  if (fr) {
    const fw = dw * fr, x0 = -W / 2 + 0.02, x1 = x0 + fw - 0.03, fc = (x0 + x1) / 2, yF = 0.82, yT = H - 0.13;
    add(at(rbox(0.02, H - 0.22, D - 0.02, 0.002, 1), x1 + 0.01, (H - 0.22) / 2 + 0.1, -0.01), M.woodDark);   // division to the pantry
    hollow(add, x0, x1, yF, yT, back + 0.03, fz - 0.03, 0.02, M.fridgeLiner, true);                         // fridge liner
    add(at(rbox(x1 - x0, 0.03, D - 0.1, 0.004, 1), fc, yF - 0.015, -0.03), M.fridgeLiner);
    add(at(rbox(x1 - x0 - 0.06, 0.012, 0.02, 0.004, 1), fc, yT - 0.05, fz - 0.06), M.ledStrip);             // LED along the top front
    for (const sy of [1.12, 1.42, 1.72, 2.0]) {                                                             // glass shelves, aluminium nosing
      add(at(rbox(x1 - x0 - 0.05, 0.005, D - 0.16, 0.001, 1), fc, sy, -0.05), M.glass);
      add(at(rbox(x1 - x0 - 0.05, 0.016, 0.012, 0.003, 1), fc, sy - 0.004, fz - 0.115), M.nickel);
    }
    for (const cx of [fc - (x1 - x0) / 4, fc + (x1 - x0) / 4]) {                                            // crisper bins with vegetables
      add(at(rbox((x1 - x0) / 2 - 0.05, 0.2, D - 0.18, 0.012, 2), cx, yF + 0.12, -0.05), M.smokeClear);
      for (let k = 0; k < 5; k++) add(at(new THREE.SphereGeometry(0.035 + (k % 3) * 0.006, 12, 8), cx - 0.1 + k * 0.05, yF + 0.06, -0.05 + (k % 2) * 0.08), k % 2 ? M.vegRed : M.vegGreen);
    }
    // what is in it
    carton(add, M.milk, fc - 0.4, 1.125, -0.05, 0.07, 0.24, 0.07); carton(add, M.juice, fc - 0.3, 1.125, -0.08, 0.07, 0.22, 0.07);
    for (let k = 0; k < 3; k++) jar(add, M, fc - 0.12 + k * 0.1, 1.425, -0.04 - (k % 2) * 0.06, 0.04, 0.09, k % 2 ? M.blackMatte : M.brass);
    carton(add, M.eggs, fc + 0.2, 1.425, -0.05, 0.3, 0.07, 0.11); carton(add, M.takeout, fc + 0.3, 1.725, -0.08, 0.18, 0.08, 0.14);
    for (let k = 0; k < 4; k++) bottle(add, k % 2 ? M.glass : M.amberGlass, M.blackMatte, fc - 0.35 + k * 0.09, 1.725, -0.15, 0.03, 0.22);
    // French doors (wood panel outside, liner and bins inside), hinged at the outer edges
    for (const side of [-1, 1]) {
      const hx = side < 0 ? x0 - 0.018 : x1 + 0.018, w = (fw - 0.004) / 2;
      const d = opnPart('fridge', x, z, ry, hx, 0, fz, { type: 'hinge', max: side < 0 ? -1.9 : 1.9, w, h: H - 0.12 - 0.84, handle: [side < 0 ? w - 0.06 : -(w - 0.06), 1.5, 0.05] });
      const sx = side < 0 ? w / 2 : -w / 2;
      d.add(at(rbox(w, yT - yF + 0.02, 0.02, 0.002, 1), sx, (yF + yT) / 2, 0.01), M.woodDark);
      d.add(at(rbox(w - 0.03, yT - yF - 0.04, 0.03, 0.006, 1), sx, (yF + yT) / 2, -0.016), M.fridgeLiner);
      for (const by of [1.0, 1.4, 1.8]) {
        d.add(at(rbox(w - 0.08, 0.07, 0.08, 0.006, 2), sx, by, -0.07), M.smokeClear);
        for (let k = 0; k < 3; k++) bottle(d.add.bind(d), k === 1 ? M.juice : M.glass, M.blackMatte, sx - 0.12 + k * 0.12, by - 0.03, -0.07, 0.028, 0.2 - k * 0.02);
      }
      d.add(at(barPull(0.9, 0.0095, 0.04, 0.03), side < 0 ? w - 0.06 : -(w - 0.06), 1.5, 0.02), M.steel);
    }
    // freezer drawer
    const fd = opnPart('freezer', x, z, ry, fc, 0, fz, { type: 'drawer', max: 0.45, w: fw - 0.034, h: 0.68, handle: [0, 0.74, 0.05] });
    fd.add(at(rbox(fw - 0.034, 0.68, 0.02, 0.002, 1), 0, 0.46, 0.01), M.woodDark);
    hollow((g, m) => fd.add(g, m), -(fw - 0.12) / 2, (fw - 0.12) / 2, 0.16, 0.72, -0.5, 0, 0.012, M.fridgeLiner, false);
    for (let k = 0; k < 6; k++) carton((g, m) => fd.add(g, m), k % 2 ? M.frost : M.takeout, -0.4 + (k % 3) * 0.3, 0.18, -0.12 - Math.floor(k / 3) * 0.24, 0.24, 0.07 + (k % 2) * 0.03, 0.2);
    fd.add(at(barPull(fw - 0.3, 0.0095, 0.04, 0.03).rotateZ(Math.PI / 2), 0, 0.74, 0.02), M.steel);
  }
  // pantry: shelves with tins, jars, boxes and bottles, behind panel doors
  const p0 = -W / 2 + dw * fr + 0.02, p1 = W / 2 - 0.02, pc = (p0 + p1) / 2, pw = p1 - p0;
  hollow(add, p0, p1, 0.1, H - 0.12, back + 0.02, fz, 0.018, M.melamine, false);
  const shelves = [0.5, 0.92, 1.34, 1.76];
  for (const sy of shelves) add(at(rbox(pw - 0.04, 0.018, D - 0.08, 0.001, 1), pc, sy, -0.02), M.melamine);
  const shelfItems = (sy, kind) => {
    for (let k = 0; k < 6; k++) {
      const u = p0 + 0.1 + k * (pw - 0.2) / 5, v = -0.12 + (k % 2) * 0.12;
      if (kind === 0) can(add, M, u, sy + 0.009, v, 0.037, 0.11, k % 3 ? M.steel : M.canRed);
      else if (kind === 1) carton(add, k % 2 ? M.cereal : M.pasta, u, sy + 0.009, v - 0.06, 0.07 + (k % 2) * 0.12, 0.28 - (k % 2) * 0.06, 0.07);
      else if (kind === 2) jar(add, M, u, sy + 0.009, v, 0.05, 0.16, M.brass);
      else bottle(add, k % 2 ? M.amberGlass : M.glass, M.blackMatte, u, sy + 0.009, v, 0.035, 0.28);
    }
  };
  shelfItems(0.1 + 0.018, 3); shelves.forEach((sy, k) => shelfItems(sy, k % 3));
  for (let i = fr; i < n; i++) {
    const left = (i - fr) % 2 === 0, hx = -W / 2 + dw * (left ? i : i + 1) + (left ? 0.002 : -0.002);
    const w = dw - 0.004, d = opnPart('pantry', x, z, ry, hx, 0, fz, { type: 'hinge', max: left ? -1.9 : 1.9, w, h: H - 0.12, handle: [left ? w - 0.06 : -(w - 0.06), H * 0.52, 0.05] });
    d.add(at(rbox(w, H - 0.12, 0.02, 0.002, 1), left ? w / 2 : -w / 2, (H - 0.12) / 2 + 0.1, 0.01), M.woodDark);
    d.add(at(barPull(H * 0.55, 0.0095, 0.04, 0.03), left ? w - 0.06 : -(w - 0.06), H * 0.52, 0.02), M.steel);
  }
  B.colliders.push({ t: 'obox', c: [x, H / 2, z], h: [W / 2, H / 2, D / 2], yaw: ry, mat: M.woodDark });
}
function kitchenRun(B, M, x, z, ry, L, { uppers = true, sink = null, outlets = true, splash = true } = {}) {
  const add = (g, m) => B.add(at(g, x, 0, z, ry), m);
  const D = 0.62, H = 0.89;
  add(at(rbox(L, 0.1, D - 0.08, 0.002, 1), 0, 0.05, -0.04), M.blackMatte);
  const n = Math.max(1, Math.round(L / 0.6)), w = L / n;
  const lowItems = [
    (a) => { stackPlates(a, M, -0.08, 0.118, -0.05, 6); stackPlates(a, M, 0.12, 0.118, -0.08, 4, 0.11); bowls(a, M, 0, 0.348, -0.06, 4); },
    (a) => { pot(a, M, -0.1, 0.118, -0.06, 0.11, 0.12); pot(a, M, 0.13, 0.118, -0.1, 0.08, 0.09); pot(a, M, 0.02, 0.348, -0.06, 0.12, 0.08); },
    (a) => { for (let k = 0; k < 4; k++) bottle(a, k % 2 ? M.amberGlass : M.glass, M.blackMatte, -0.16 + k * 0.1, 0.118, -0.08, 0.035, 0.27); for (let k = 0; k < 3; k++) jar(a, M, -0.12 + k * 0.12, 0.348, -0.06, 0.05, 0.12, M.brass); },
  ];
  for (let i = 0; i < n; i++) {
    const cx = -L / 2 + w * (i + 0.5);
    if (sink != null && Math.abs(cx - sink) < w / 2 + 0.33) {     // under the sink: no drawer box (the bowl hangs there), a false front, the trap
      hollow((g, m) => add(at(g, cx, 0, 0), m), -w / 2 + 0.002, w / 2 - 0.002, 0.1, H - 0.26, -D / 2 + 0.01, D / 2 - 0.02, 0.018, M.melamine, false);
      add(at(rbox(w - 0.004, 0.24, 0.02, 0.002, 1), cx, 0.7, D / 2 - 0.01), M.woodDark);
      if (Math.abs(cx - sink) < w / 2) add(at(tubeGeo([[0.1, H - 0.24, 0.04], [0.1, 0.5, 0.04], [0.1, 0.42, 0.08], [0.1, 0.5, 0.12], [0.1, 0.56, 0.12], [0.1, 0.56, -0.28]], 0.02), sink, 0, 0), M.steel);
      const left = i % 2 === 0, hx = cx + (left ? -w / 2 + 0.002 : w / 2 - 0.002);
      const d = opnPart('cab', x, z, ry, hx, 0, D / 2 - 0.02, { type: 'hinge', max: (left ? -1 : 1) * 1.83, w: w - 0.004, h: 0.42, handle: [(left ? 1 : -1) * (w - 0.06), 0.54, 0.02] });
      d.add(at(rbox(w - 0.004, 0.42, 0.02, 0.002, 1), (left ? 1 : -1) * (w / 2 - 0.002), 0.33, 0.01), M.woodDark);
    } else baseBay(B, M, x, z, ry, cx, w, D, H, i, lowItems[i % 3]);
  }
  for (const yy of [0.565, H - 0.035]) add(at(rbox(L, 0.03, 0.012, 0.001, 1), 0, yy, D / 2 - 0.022), M.blackMatte);   // recessed pull channels
  const holes = sink != null ? [[sink, 0.03, 0.58, 0.4, 0.035]] : [];
  add(at(counter(L, D + 0.02, 0.03, holes), 0, H + 0.03, 0.01), M.stone);
  if (splash) add(at(rbox(L, 0.58, 0.015, 0.002, 1), 0, H + 0.03 + 0.29, -D / 2 + 0.008), M.stone);
  if (outlets) for (const u of [-L / 2 + 0.35, L / 2 - 0.35]) {
    const o = outletPlate(), y = H + 0.03 + 0.24, v = -D / 2 + 0.0155;
    add(at(o.plate, u, y, v), M.lacquerWhite); add(at(o.face, u, y, v), M.lacquerWhite); add(at(o.cavity, u, y, v), M.blackMatte);
  }
  const upItems = (a, y0, h, dz) => { stackPlates(a, M, -0.08, y0 + 0.018, dz - 0.02, 5, 0.12); glasses(a, M, -0.15, y0 + h / 3 + 0.008, dz - 0.07, 3, 2); bowls(a, M, 0.02, y0 + 2 * h / 3 + 0.008, dz - 0.02, 3); };
  if (uppers) for (let i = 0; i < n; i++) upperBay(B, M, x, z, ry, -L / 2 + w * (i + 0.5), w, 1.5, 0.86, -D / 2 + 0.175, i, upItems);
  if (sink != null) {
    add(at(basin(0.6, 0.42, 0.22, 0.04), sink, H, 0.04), M.sinkSteel);
    add(at(drain(0.045), sink + 0.1, H - 0.22, 0.04), M.steel);
    add(at(kitchenFaucet(), sink, H + 0.03, -0.24), M.nickel);
  }
  B.colliders.push({ t: 'obox', c: [x, H / 2, z], h: [L / 2, H / 2 + 0.02, D / 2], yaw: ry, mat: M.woodDark });
}
function tubeGeo(pts, r) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, pts.length * 3, r, 10, false).toNonIndexed();
  return metricUV(g);
}
function tallUnit(B, M, x, z, ry, W, H, ovens = false) { tallUnitOpen(B, M, x, z, ry, W, H, ovens); }
// oval dark oak breakfast table and an upholstered banquette (apartment-14)
function ovalTable(B, M, x, z, ry, L = 1.9, W = 1.05) {
  const top = lathe([[0, 0.72], [0.47, 0.72], [0.5, 0.735], [0.5, 0.75], [0.494, 0.756], [0, 0.756]], 64); top.scale(L, 1, W);
  B.add(at(wcut(metricUV(top)), x, 0, z, ry), M.walnut);              // planar UVs: the grain runs the length of the oval
  for (const v of [-0.45, 0.45]) { const p = lathe([[0, 0], [0.22, 0], [0.12, 0.05], [0.09, 0.7], [0.15, 0.72], [0, 0.72]], 24); p.scale(1, 1, 0.7); B.add(at(grainUp(p), x + Math.cos(ry) * v * L * 0.6, 0, z - Math.sin(ry) * v * L * 0.6), M.walnut); }
  B.colliders.push({ t: 'obox', c: [x, 0.38, z], h: [L / 2, 0.38, W / 2], yaw: ry, mat: M.walnut });
}
function banquette(B, M, x, z, ry, L) {
  const add = (g, m) => B.add(at(g, x, 0, z, ry), m);
  add(at(rbox(L - 0.06, 0.1, 0.5, 0.004), 0, 0.05, 0.0), M.blackMatte);
  add(at(rbox(L, 0.3, 0.56, 0.03), 0, 0.25, 0), M.boucleTaupe);
  add(at(cushion(L - 0.02, 0.1, 0.52, 0.04, 0.012, 4, { skip: ['y-'], pipe: true, sag: 0.006 }), 0, 0.44, 0.01), M.boucleTaupe);
  const n = Math.round(L / 0.16);                       // vertical channels on the back
  for (let i = 0; i < n; i++) add(at(cushion(L / n - 0.008, 0.52, 0.11, 0.045, 0.02), -L / 2 + L / n * (i + 0.5), 0.78, -0.24, 0, -0.1), M.boucleTaupe);
  B.colliders.push({ t: 'obox', c: [x, 0.3, z], h: [L / 2, 0.3, 0.28], yaw: ry, mat: M.boucleTaupe });
}
// faceted glass pendant (apartment-14)
function facetPendant(B, M, x, z, yBottom, ceil) {
  const g = new THREE.IcosahedronGeometry(0.17, 1).toNonIndexed(); g.scale(1, 1.3, 1); g.computeVertexNormals(); metricUV(g);
  B.add(at(g, x, yBottom + 0.22, z), M.smoke);
  B.add(at(lathe([[0.003, yBottom + 0.44], [0.003, ceil]], 6), x, 0, z), M.brass);
}

// ---- baths --------------------------------------------------------------------------------------
// stone cladding on a room's walls: [axis, face coordinate, s0, s1, y0, y1, into-room sign].
// Each slab is its own piece (slab = [width, height]) with a 1.5 mm reveal over a dark setting
// bed, cut on world multiples of the slab size so the real joints fall on the scan's joints
function clad(B, mat, segs, t = 0.016, slab = [1.2, 1.2]) {
  const gap = 0.0015;
  const cuts = (a, b, step) => { const c = [a]; for (let v = Math.floor(a / step + 1e-6) * step + step; v < b - 0.02; v += step) c.push(v); c.push(b); return c; };
  for (const [axis, f, s0, s1, y0, y1, dir] of segs) {
    if (s1 - s0 < 0.01 || y1 - y0 < 0.01) continue;
    const bed0 = f, bed1 = f + dir * 0.006, sl0 = bed1, sl1 = f + dir * t;
    const box = (a0, a1, b0, b1, c0, c1, m) => {
      if (axis === 'x') B.box(a0, b0, Math.min(c0, c1), a1, b1, Math.max(c0, c1), m, false);
      else B.box(Math.min(c0, c1), b0, a0, Math.max(c0, c1), b1, a1, m, false);
    };
    box(s0, s1, y0, y1, bed0, bed1, M_BED);
    const cs = cuts(s0, s1, slab[0]), cy = cuts(y0, y1, slab[1]);
    for (let i = 0; i < cs.length - 1; i++) for (let j = 0; j < cy.length - 1; j++) {
      const a0 = cs[i] + (i ? gap / 2 : 0), a1 = cs[i + 1] - (i < cs.length - 2 ? gap / 2 : 0);
      const b0 = cy[j] + (j ? gap / 2 : 0), b1 = cy[j + 1] - (j < cy.length - 2 ? gap / 2 : 0);
      box(a0, a1, b0, b1, sl0, sl1, mat);
    }
  }
}
let M_BED = null;
// freestanding bateau tub (apartment-08): polished nickel outside, white enamel inside
function tub(B, M, x, y, z, ry, L = 1.7, W = 0.78) {
  const prof = [[0, 0], [0.23, 0], [0.26, 0.03], [0.3, 0.2], [0.36, 0.5], [0.385, 0.6], [0.4, 0.62]];
  const outer = lathe(prof, 48); const inner = lathe([[0.37, 0.6], [0.34, 0.5], [0.28, 0.2], [0.2, 0.08], [0, 0.08]], 48);
  for (const g of [outer, inner]) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const px = p.getX(i), py = p.getY(i); p.setY(i, py + Math.pow(Math.abs(px) / 0.4, 4) * 0.1 * (py / 0.62)); }
    g.scale(L / 0.8, 1, W / 0.8); g.computeVertexNormals();
  }
  B.add(at(outer, x, y, z, ry), M.nickel);
  B.add(at(inner, x, y, z, ry), M.enamel);
  B.add(at(lathe([[0.37, 0.6], [0.4, 0.62]], 48).scale(L / 0.8, 1, W / 0.8), x, y, z, ry), M.enamel);
  B.colliders.push({ t: 'obox', c: [x, y + 0.31, z], h: [L / 2, 0.31, W / 2], yaw: ry, mat: M.nickel });
}
// bath vanity on a wall: drawers, stone top with undermount basins, a backlit mirror above
function vanity(B, M, x, y, z, ry, L, top, body, basins = [0], wall = 0) {
  const add = (g, m) => B.add(at(g, x, y, z, ry), m);
  const D = 0.56, H = 0.86;
  // carcass: solid below the basins, a frame round them (front, back and end panels, 18 mm) so the
  // bowls hang open in the cabinet under the stone, as undermount basins are fitted
  const y0 = H - 0.2, pt = 0.018;
  add(at(rbox(L, y0 - 0.12, D - 0.02, 0.004, 1), 0, 0.12 + (y0 - 0.12) / 2, -0.01), body);
  add(at(rbox(L, H - y0, pt, 0.002, 1), 0, (y0 + H) / 2, D / 2 - 0.02 - pt / 2), body);
  add(at(rbox(L, H - y0, pt, 0.002, 1), 0, (y0 + H) / 2, -D / 2 + pt / 2), body);
  for (const sg of [-1, 1]) add(at(rbox(pt, H - y0, D - 0.02, 0.002, 1), sg * (L / 2 - pt / 2), (y0 + H) / 2, -0.01), body);
  add(at(rbox(L - 2 * pt, 0.006, D - 0.02 - 2 * pt, 0.001, 1), 0, y0 + 0.003, -0.01), M.blackMatte);   // the shadowed shelf under the bowls
  add(at(rbox(L - 0.04, 0.12, D - 0.06, 0.002, 1), 0, 0.06, -0.03), M.blackMatte);          // recessed toe kick
  // drawer fronts: columns per basin, two drawers each, 3 mm gaps, slim bronze pulls
  const cols = Math.max(1, basins.length), cw = L / cols;
  for (let c = 0; c < cols; c++) for (const [y0, y1] of [[0.12, 0.5], [0.503, H - 0.003]]) {
    const u = -L / 2 + cw * (c + 0.5);
    add(at(rbox(cw - 0.003, y1 - y0 - 0.003, 0.02, 0.002, 1), u, (y0 + y1) / 2, D / 2 - 0.01), body);
    add(at(barPull(0.13, 0.006, 0.026, 0.02).rotateZ(Math.PI / 2), u, y1 - 0.05, D / 2), M.bronzeLight);
  }
  let vm = null;                                   // the basins' mirrors share one plane (one mirror material)
  // stone top cut over undermount basins (150 mm deep), deck faucets behind them
  add(at(counter(L + 0.02, D + 0.02, 0.04, basins.map((u) => [u, 0.04, 0.44, 0.32, 0.06])), 0, H + 0.04, 0.01), top);
  for (const u of basins) {
    add(at(basin(0.46, 0.34, 0.15, 0.07), u, H, 0.05), M.enamel);
    add(at(drain(0.019), u, H - 0.15, 0.05), M.bronzeLight);
    add(at(new THREE.CircleGeometry(0.0085, 20).scale(1.9, 1, 1).rotateY(Math.PI), u, H - 0.028, 0.05 + 0.17 - 0.0012), M.slot);   // overflow slot in the front wall
    add(at(bathFaucet(), u, H + 0.04, -D / 2 + 0.07), M.bronzeLight);
    if (!wall) {
      add(at(rbox(0.6, 0.9, 0.012, 0.004, 1), u, H + 0.62, -D / 2 - 0.01), vm || (vm = mirrorMat(M, x, y, z, ry, 0, H + 0.62, -D / 2 - 0.004)));
      add(at(rbox(0.012, 0.9, 0.02, 0.004, 1), u - 0.31, H + 0.62, -D / 2), M.ledStrip);
      add(at(rbox(0.012, 0.9, 0.02, 0.004, 1), u + 0.31, H + 0.62, -D / 2), M.ledStrip);
    }
  }
  if (wall) {
    // a mirror wall from the backsplash up (apartment-08), amber backlit glass panels at the ends
    // and between the basins
    const mh = wall - H - 0.12, my = H + 0.12 + mh / 2;
    add(at(rbox(L, 0.1, 0.02, 0.002, 1), 0, H + 0.09, -D / 2 + 0.01), top);
    add(at(rbox(L, mh, 0.012, 0.002, 1), 0, my, -D / 2 - 0.004), mirrorMat(M, x, y, z, ry, 0, my, -D / 2 + 0.002));
    const posts = [-L / 2 + 0.06, L / 2 - 0.06, ...basins.slice(1).map((b, i) => (basins[i] + b) / 2)];
    for (const u of posts) add(at(rbox(0.11, mh, 0.03, 0.006, 1), u, my, -D / 2 + 0.012), M.amberGlass);
  }
  B.colliders.push({ t: 'obox', c: [x, y + H / 2, z], h: [L / 2, H / 2, D / 2], yaw: ry, mat: body });
}
// built-in tub (apartment-03): stone apron and deck with a rounded cut-out, enamel basin, a spout
function builtInTub(B, M, x0, z0, x1, z1, y, stone) {
  const H = 0.56, t = 0.04, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = x1 - x0, L = z1 - z0;
  for (const [a, b, c, d] of [[x0, z0, x1, z0 + t], [x0, z1 - t, x1, z1], [x0, z0, x0 + t, z1], [x1 - t, z0, x1, z1]]) B.box(a, y, b, c, y + H - t, d, stone);
  const sh = new THREE.Shape([[-W / 2, -L / 2], [W / 2, -L / 2], [W / 2, L / 2], [-W / 2, L / 2]].map(([u, v]) => new THREE.Vector2(u, v)));
  const hw = W / 2 - 0.08, hl = L / 2 - 0.09, r = 0.16, hole = new THREE.Path();
  hole.moveTo(-hw + r, -hl); hole.lineTo(hw - r, -hl); hole.quadraticCurveTo(hw, -hl, hw, -hl + r); hole.lineTo(hw, hl - r); hole.quadraticCurveTo(hw, hl, hw - r, hl);
  hole.lineTo(-hw + r, hl); hole.quadraticCurveTo(-hw, hl, -hw, hl - r); hole.lineTo(-hw, -hl + r); hole.quadraticCurveTo(-hw, -hl, -hw + r, -hl);
  sh.holes.push(hole);
  const deck = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 12 }).toNonIndexed();
  deck.rotateX(-Math.PI / 2); metricUV(deck);
  B.add(at(deck, cx, y + H - t, cz), stone);
  const basin = lathe([[0.4, 0.5], [0.385, 0.42], [0.33, 0.2], [0.24, 0.07], [0, 0.06]], 40);
  basin.scale(hw * 2 / 0.8, 1, hl * 2 / 0.8); basin.computeVertexNormals();
  B.add(at(basin, cx, y + H - 0.5 - t, cz), M.enamel);
  B.add(tubeGeo([[x0 + 0.03, y + H + 0.18, cz], [x0 + 0.1, y + H + 0.2, cz], [x0 + 0.16, y + H + 0.15, cz]], 0.012), M.bronzeLight);
  B.colliders.push({ t: 'box', min: [x0, y, z0], max: [x1, y + H, z1], mat: stone });
}

// wall-hung toilet with a flush plate (apartment-03)
function toilet(B, M, x, y, z, ry) {
  const add = (g, m) => B.add(at(g, x, y, z, ry), m);
  const bowlG = lathe([[0, 0.22], [0.1, 0.22], [0.15, 0.25], [0.18, 0.31], [0.19, 0.37], [0.185, 0.41], [0, 0.41]], 32); bowlG.scale(1, 1, 1.45); bowlG.translate(0, 0, 0.29);
  add(at(rbox(0.32, 0.3, 0.12, 0.05), 0, 0.33, 0.06), M.enamel);
  add(bowlG, M.enamel);
  add(at(toiletSeat(0.5, 0.37), 0, 0.41, 0.03), M.enamel);
  add(at(flushPlate(), 0, 1.02, 0.0), M.flushPlate);
}

// Mirrors: each one gets its own material (so it is its own mesh after the merge) carrying its plane in
// userData.mirror { p, n } (apartment coordinates: a point on the glass, the normal into the room);
// mirrors.js reflects the nearest one you face for real and gives the others a cube capture.
// (x, y, z, ry): the piece's placement as at(); (u, v, w): the glass face point in the piece's frame.
let MIRRORS = [];
function mirrorMat(M, x, y, z, ry, u, v, w) {
  const m = M.mirror.clone(), c = Math.cos(ry), sn = Math.sin(ry);
  m.userData = { mirror: { p: [x + u * c + w * sn, y + v + ARTY, z - u * sn + w * c], n: [sn, 0, c] } };
  MIRRORS.push(m);
  return m;
}
// a free-form mirror on a wall (apartment-06): an organic outline, thin bronze edge
function blobMirror(B, M, x, y, z, w, h, face) {
  const ry = { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': 0, '-z': Math.PI }[face];
  ART.push({ k: 'blobMirror', x, y: y + ARTY, z, w, h, face });
  const sh = new THREE.Shape();
  for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, k = 1 + 0.09 * Math.sin(a * 3 + 0.7) + 0.05 * Math.cos(a * 5); const px = Math.cos(a) * w / 2 * k, py = Math.sin(a) * h / 2 * k; if (i) sh.lineTo(px, py); else sh.moveTo(px, py); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 2, curveSegments: 48 }).toNonIndexed();
  metricUV(g); B.add(at(g, x, y, z, ry), mirrorMat(M, x, y, z, ry, 0, 0, 0.016));
}
// dark wood console (apartment-06)
function console_(B, M, x, z, ry, L = 1.6, stone = null) {
  const add = (g, m) => B.add(at(g, x, 0, z, ry), m);
  if (stone) {
    // travertine waterfall console (apartment-11): a 6 cm slab top on two slab legs, eased edges
    add(at(rbox(L, 0.06, 0.36, 0.006, 2), 0, 0.82, 0), stone);
    for (const u of [-1, 1]) add(at(rbox(0.06, 0.79, 0.34, 0.006, 2), u * (L / 2 - 0.03), 0.395, 0), stone);
    B.colliders.push({ t: 'obox', c: [x, 0.42, z], h: [L / 2, 0.42, 0.18], yaw: ry, mat: stone });
    return;
  }
  add(at(boardTop(L, 0.05, 0.4, 0.2, 0.003), 0, 0.8, 0), M.walnut);
  for (const u of [-1, 1]) add(at(grainUp(rbox(0.05, 0.78, 0.4, 0.003)), u * (L / 2 - 0.025), 0.39, 0), M.walnut);
  add(at(boardTop(L - 0.1, 0.02, 0.36, 0.18, 0.002), 0, 0.2, 0), M.walnut);
  B.colliders.push({ t: 'obox', c: [x, 0.42, z], h: [L / 2, 0.42, 0.2], yaw: ry, mat: M.walnut });
}
// a stoneware vase of dried flowers (apartment-11): ribbed ochre vase, wiry stems with round
// seed heads, and a small brass sphere beside it (frame: on a top at y)
function driedVase(B, M, x, y, z, seed = 5) {
  let sd = seed; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  B.add(at(smooth(lathe([[0, 0], [0.05, 0], [0.085, 0.05], [0.095, 0.11], [0.08, 0.17], [0.045, 0.21], [0.04, 0.23], [0.046, 0.24], [0.038, 0.245], [0.032, 0.23]], 48)), x, y, z), M.vaseOchre);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, lean = 0.15 + rnd() * 0.5, L = 0.22 + rnd() * 0.22;
    const p0 = [x, y + 0.22, z], p2 = [x + Math.cos(a) * Math.sin(lean) * L, y + 0.22 + Math.cos(lean) * L, z + Math.sin(a) * Math.sin(lean) * L];
    const p1 = [(p0[0] + p2[0]) / 2 + (rnd() - 0.5) * 0.04, (p0[1] + p2[1]) / 2, (p0[2] + p2[2]) / 2 + (rnd() - 0.5) * 0.04];
    B.add(tubeGeo([p0, p1, p2], 0.0022), M.bark);
    B.add(new THREE.IcosahedronGeometry(0.018 + rnd() * 0.012, 1).toNonIndexed().translate(...p2), M.driedHead);
  }
  B.add(new THREE.SphereGeometry(0.035, 24, 16).toNonIndexed().translate(x - 0.22, y + 0.035, z + 0.04), M.brassTop);
}

// crumpled relief artwork (apartment-11): a black panel pushed into folds and creases, real
// geometry (a 96 x 112 grid displaced by ridged noise), in a thin white float frame
function reliefArt(B, M, x, y, z, w, h, face) {
  const ry = { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': 0, '-z': Math.PI }[face];
  ART.push({ k: 'reliefArt', x, y: y + ARTY, z, w, h, face });
  const g = new THREE.PlaneGeometry(w * 0.8, h * 0.8, 96, 112).toNonIndexed();
  const p = g.attributes.position;
  const nz = (a, b) => Math.sin(a * 7.1 + Math.sin(b * 3.3) * 2) * Math.cos(b * 6.3 + Math.sin(a * 2.7) * 2);
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i) / w, b = p.getY(i) / h, r = Math.hypot(a, b * 0.9);
    const ridge = 1 - Math.abs(nz(a * 2.2, b * 2.2)), fold = Math.abs(nz(a * 5 + 3, b * 5 + 1));
    p.setZ(i, (0.05 * ridge * ridge + 0.018 * fold) * Math.max(0, 1 - r * 1.6) + 0.004);
  }
  g.computeVertexNormals(); metricUV(g);
  B.add(at(g, x, y, z, ry), M.reliefBlack);
  const f = 0.025, d = 0.05;
  B.add(at(new THREE.PlaneGeometry(w, h).toNonIndexed(), x, y, z, ry), M.ceramic);
  for (const [u, v, ww, hh] of [[0, h / 2 + f / 2, w + 2 * f, f], [0, -h / 2 - f / 2, w + 2 * f, f], [-w / 2 - f / 2, 0, f, h], [w / 2 + f / 2, 0, f, h]]) {
    const gg = rbox(ww, hh, d, 0.003, 1); gg.translate(u, v, d / 2 - 0.005); B.add(at(gg, x, y, z, ry), M.lacquerWhite);
  }
}
// cooktop: black glass with burner rings
function cooktop(B, M, x, y, z, ry) {
  B.add(at(rbox(0.78, 0.006, 0.52, 0.004, 1), x, y + 0.003, z, ry), M.tvGlass);
  for (const [u, v, r] of [[-0.2, -0.12, 0.09], [0.2, -0.12, 0.07], [-0.2, 0.12, 0.07], [0.2, 0.12, 0.11]]) {
    const ring = new THREE.RingGeometry(r - 0.004, r, 32).rotateX(-Math.PI / 2).toNonIndexed();
    B.add(at(ring, x + Math.cos(ry) * u + Math.sin(ry) * v, y + 0.0065, z - Math.sin(ry) * u + Math.cos(ry) * v), M.steel);
  }
}



// ---- the computer (library, floor two): dark oak writing desk on slim bronze legs, a 27 inch
// monitor on a stand (its screen is drawn by hub.js), a slim keyboard; local x along the desk,
// the front faces +z
function desk(B, M, x, z, ry, L = 1.5, D = 0.7, H = 0.75) {
  const add = (g, m) => B.add(at(g, x, 0, z, ry), m);
  add(at(boardTop(L, 0.035, D, 0.175, 0.002), 0, H - 0.0175, 0), M.walnut);                       // solid walnut top
  add(at(wcut(rbox(L - 0.16, 0.09, D - 0.12, 0.004, 1)), 0, H - 0.08, -0.02), M.walnut);             // apron with a shallow drawer
  add(at(rbox(0.5, 0.003, 0.002, 0.001, 1), 0, H - 0.08, D / 2 - 0.079), M.slot);              // drawer reveal
  for (const u of [-1, 1]) for (const v of [-1, 1]) add(at(lathe([[0, 0], [0.014, 0], [0.011, H - 0.035], [0, H - 0.035]], 16), u * (L / 2 - 0.06), 0, v * (D / 2 - 0.06)), M.bronzeLight);
  // monitor: arm stand, thin body, bezel; screen plane is hub.js's
  add(at(rbox(0.24, 0.012, 0.18, 0.004, 1), 0, H + 0.006, -0.18), M.blackMetal);
  add(at(rbox(0.04, 0.34, 0.025, 0.006, 1), 0, H + 0.18, -0.2), M.blackMetal);
  add(at(rbox(0.64, 0.385, 0.03, 0.008, 2), 0, H + 0.43, -0.17), M.blackMetal);
  add(at(rbox(0.38, 0.012, 0.13, 0.004, 1), 0, H + 0.006, 0.08), M.blackMetal);                 // keyboard
  add(at(rbox(0.36, 0.004, 0.11, 0.002, 1), 0, H + 0.013, 0.08), M.slot);
  add(at(cushion(0.065, 0.025, 0.11, 0.012, 0.006), 0.3, H + 0.012, 0.09), M.blackMetal);       // mouse
  B.colliders.push({ t: 'obox', c: [x, H / 2, z], h: [L / 2, H / 2, D / 2], yaw: ry, mat: M.walnut });
}

// ---- dressing hall (apartment-07) -----------------------------------------------------------
// vanity table: white lacquer top on two fluted pill-section pedestals (two grooves a face);
// local x along the wall, the front faces +z
function flutedLeg(w, d, h) {
  const sh = new THREE.Shape(), N = 96, r = d / 2, half = w / 2 - r;
  for (let i = 0; i <= N; i++) {
    const t = i / N * Math.PI * 2;
    // stadium outline (two half circles joined by flats), grooves cut into the flats
    let px, py;
    const per = 4 * half + 2 * Math.PI * r, s = t / (Math.PI * 2) * per;
    if (s < 2 * half) { px = -half + s; py = -r; }
    else if (s < 2 * half + Math.PI * r) { const a = -Math.PI / 2 + (s - 2 * half) / r; px = half + Math.cos(a) * r; py = Math.sin(a) * r; }
    else if (s < 4 * half + Math.PI * r) { px = half - (s - 2 * half - Math.PI * r); py = r; }
    else { const a = Math.PI / 2 + (s - 4 * half - Math.PI * r) / r; px = -half + Math.cos(a) * r; py = Math.sin(a) * r; }
    if (Math.abs(py) > r * 0.99) { const g = Math.exp(-Math.pow((Math.abs(px) - half * 0.0) / (w * 0.07), 2)); py -= Math.sign(py) * 0.007 * g; }
    if (i) sh.lineTo(px, py); else sh.moveTo(px, py);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 8 }).toNonIndexed();
  g.rotateX(-Math.PI / 2); g.translate(0, 0.006, 0); g.computeVertexNormals(); metricUV(g);
  return g;
}
function dressVanity(B, M, x, z, ry, L = 1.15, D = 0.45) {
  const add = (g, m) => B.add(at(g, x, 0, z, ry), m);
  add(at(rbox(L, 0.045, D, 0.012, 3), 0, 0.735, 0), M.lacquerWhite);
  for (const u of [-1, 1]) add(at(flutedLeg(0.17, 0.12, 0.7), u * (L / 2 - 0.16), 0, 0), M.lacquerWhite);
  // on top: two books, a small tray with a bottle
  add(at(rbox(0.3, 0.025, 0.21, 0.003, 1), -L / 2 + 0.22, 0.77, 0.04, 0.06), M.bookCream);
  add(at(rbox(0.27, 0.02, 0.19, 0.003, 1), -L / 2 + 0.22, 0.793, 0.04, -0.03), M.bookBlack);
  add(at(rbox(0.22, 0.012, 0.13, 0.004, 1), L / 2 - 0.25, 0.764, -0.05), M.brass);
  add(at(lathe([[0, 0], [0.024, 0], [0.026, 0.06], [0.01, 0.075], [0.008, 0.09], [0, 0.09]], 24), L / 2 - 0.28, 0.77, -0.05), M.lacquer);
  B.colliders.push({ t: 'obox', c: [x, 0.38, z], h: [L / 2, 0.38, D / 2], yaw: ry, mat: M.lacquerWhite });
}
// barrel stool: white bouclé tub, the back higher than the sides (apartment-07)
const barrelStool = movable('barrel stool', 9, function (B, M, x, z, ry) {
  const add = (g, m) => B.add(at(g, x, 0, z, ry), m);
  add(lathe([[0, 0.02], [0.2, 0.02], [0.225, 0.06], [0.23, 0.3], [0.215, 0.44], [0.17, 0.465], [0, 0.47]], 40), M.boucle);
  // the back: a thick curved band round the rear 200 degrees, rounded top
  add(rboxArc(0.15, 0.235, 0.42, 0.78, Math.PI - 1.75, Math.PI + 1.75, 0.035, 40), M.boucle);
  add(lathe([[0, 0], [0.19, 0], [0.19, 0.02], [0, 0.02]], 32), M.blackMetal);
  B.colliders.push({ t: 'obox', c: [x, 0.39, z], h: [0.23, 0.39, 0.23], yaw: ry, mat: M.boucle });
});
// big floor-standing-height mirror hung on the wall over the vanity, pale grey lacquered frame
function framedMirror(B, M, x, y, z, w, h, face) {
  const ry = { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': 0, '-z': Math.PI }[face];
  ART.push({ k: 'framedMirror', x, y: y + ARTY, z, w, h, face });
  B.add(at(new THREE.PlaneGeometry(w, h).toNonIndexed().translate(0, 0, 0.012), x, y, z, ry), mirrorMat(M, x, y, z, ry, 0, 0, 0.012));
  const f = 0.055, d = 0.045;
  for (const [u, v, ww, hh] of [[0, h / 2 + f / 2, w + 2 * f, f], [0, -h / 2 - f / 2, w + 2 * f, f], [-w / 2 - f / 2, 0, f, h], [w / 2 + f / 2, 0, f, h]]) {
    B.add(at(rbox(ww, hh, d, 0.008, 2).translate(u, v, d / 2), x, y, z, ry), M.frameGrey);
  }
}
// onyx plinth with a white carved sculpture on a black puck (apartment-07)
function sculpturePlinth(B, M, x, z, w = 0.3, h = 1.02, seed = 3) {
  B.add(at(rbox(w, h, w, 0.004, 1), x, h / 2, z), M.onyx);
  B.colliders.push({ t: 'box', min: [x - w / 2, 0, z - w / 2], max: [x + w / 2, h, z + w / 2], mat: M.onyx });
  B.add(at(lathe([[0, 0], [0.05, 0], [0.05, 0.08], [0, 0.08]], 32), x, h, z), M.blackMetal);
  // two leaning petals (pinched ovoids), sheared and turned against each other
  for (const [k, lean, tw, sc] of [[0, 0.16, 0.4, 1], [1, -0.22, -0.9, 0.82]]) {
    const pr = []; for (let i = 0; i <= 18; i++) { const t = i / 18; pr.push([0.055 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.8) * (1 - 0.35 * t) + 0.002, t * 0.42 * sc]); }
    pr[pr.length - 1][0] = 0;
    const g = lathe(pr, 32); g.scale(1.35, 1, 0.55);
    const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) { const yy = pos.getY(i); pos.setX(i, pos.getX(i) + lean * yy * yy / 0.42); }
    g.computeVertexNormals();
    B.add(at(g, x + (k ? 0.025 : -0.02), h + 0.075, z, tw), M.sculpt);
  }
}
// upholstered bench: soft cushioned top on a dark recessed plinth
function dressBench(B, M, x, z, ry, L = 1.45, D = 0.42) {
  const add = (g, m) => B.add(at(g, x, 0, z, ry), m);
  add(at(cushion(L, 0.2, D, 0.09, 0.025), 0, 0.27, 0), M.benchFabric);
  add(at(rbox(L - 0.18, 0.17, D - 0.14, 0.03, 2), 0, 0.085, 0), M.woodDark);
  B.colliders.push({ t: 'obox', c: [x, 0.22, z], h: [L / 2, 0.22, D / 2], yaw: ry, mat: M.benchFabric });
}

// ---- the painting's texture ----------------------------------------------------------------
function paintingTexture() {
  // an original abstract in apartment-17's palette, painted as layers of translucent brush
  // strokes (bristle streaks, ragged edges) over a primed canvas; returns colour + relief
  const W = 1024, H = 800;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const hv = document.createElement('canvas'); hv.width = W; hv.height = H;
  const c = cv.getContext('2d'), h = hv.getContext('2d');
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  c.fillStyle = '#ece7dc'; c.fillRect(0, 0, W, H); h.fillStyle = '#404040'; h.fillRect(0, 0, W, H);
  // one stroke: a band of bristle lines along a gently curved path
  const stroke = (x, y, ang, len, wid, col, alpha, load = 1) => {
    const n = Math.max(6, Math.round(wid / 2.2));
    for (let k = 0; k < n; k++) {
      const off = (k / (n - 1) - 0.5) * wid, a2 = alpha * (0.5 + 0.5 * rnd()) * load;
      c.strokeStyle = col; c.globalAlpha = a2; c.lineWidth = 1.2 + rnd() * 2.2;
      h.strokeStyle = `rgb(${120 + rnd() * 100 | 0},0,0)`; h.globalAlpha = 0.25 * load; h.lineWidth = c.lineWidth;
      const L = len * (0.75 + 0.25 * rnd()), bend = (rnd() - 0.5) * 0.25;
      for (const g of [c, h]) {
        g.beginPath();
        const sx = x - Math.sin(ang) * off, sy = y + Math.cos(ang) * off;
        g.moveTo(sx, sy);
        g.quadraticCurveTo(sx + Math.cos(ang + bend) * L * 0.5, sy + Math.sin(ang + bend) * L * 0.5, sx + Math.cos(ang) * L, sy + Math.sin(ang) * L);
        g.stroke();
      }
    }
    c.globalAlpha = 1; h.globalAlpha = 1;
  };
  // a colour field built from many overlapping strokes inside a ragged blob
  const field = (cx, cy, rx, ry, col, dir, count) => {
    for (let i = 0; i < count; i++) {
      const t = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
      const x = cx + Math.cos(t) * rx * r - rx * 0.35, y = cy + Math.sin(t) * ry * r;
      stroke(x, y, dir + (rnd() - 0.5) * 0.5, rx * (0.5 + rnd() * 0.6), 14 + rnd() * 22, col, 0.32, 0.9);
    }
  };
  for (let i = 0; i < 160; i++) stroke(rnd() * W - 100, rnd() * H, (rnd() - 0.5) * 0.3, 260, 30, '#f4f0e7', 0.18, 0.5);
  field(330, 520, 280, 150, '#e3c97e', 0.1, 140);
  field(690, 430, 210, 240, '#3d7660', 1.4, 160);
  field(560, 290, 140, 110, '#1b1b19', 0.6, 120);
  field(820, 240, 120, 100, '#9ec4be', -0.3, 90);
  field(250, 250, 130, 80, '#c8d6cd', 0.2, 80);
  field(470, 640, 110, 60, '#d6ae58', 0.0, 70);
  for (let k = 0; k < 7; k++) {
    let x = rnd() * W, y = rnd() * H, ang = rnd() * 6.28;
    const col = ['#1c1c1a', '#f6f2ea', '#b48a2e', '#2d5d4b'][k % 4];
    for (let i = 0; i < 14; i++) { stroke(x, y, ang, 40, 4 + rnd() * 3, col, 0.85, 1.2); x += Math.cos(ang) * 36; y += Math.sin(ang) * 36; ang += (rnd() - 0.5) * 0.9; }
  }
  // canvas weave
  const img = c.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, n = ((x % 3) === 0 ? -5 : 0) + ((y % 3) === 0 ? -5 : 0) + (rnd() - 0.5) * 6; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  c.putImageData(img, 0, 0);
  // relief: height -> normal map
  const hd = h.getImageData(0, 0, W, H).data, nm = new ImageData(W, H);
  const H0 = (x, y) => hd[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255 + (((x % 3) === 0) || ((y % 3) === 0) ? -0.03 : 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let nx = (H0(x - 1, y) - H0(x + 1, y)) * 2.2, ny = (H0(x, y + 1) - H0(x, y - 1)) * 2.2; const l = Math.hypot(nx, ny, 1);
    const i = (y * W + x) * 4; nm.data[i] = (nx / l * 0.5 + 0.5) * 255; nm.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; nm.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; nm.data[i + 3] = 255;
  }
  const nc = document.createElement('canvas'); nc.width = W; nc.height = H; nc.getContext('2d').putImageData(nm, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const tn = new THREE.CanvasTexture(nc); tn.anisotropy = 8;
  return { map: t, normalMap: tn };
}

// a pressed glass scale for the chandeliers: rounded tip, ribbed, clear-grey with brighter edges
function glassLeafTexture() {
  const W = 128, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, W, H);
  c.beginPath(); c.moveTo(8, 0); c.lineTo(120, 0); c.lineTo(120, 180); c.quadraticCurveTo(64, 268, 8, 180); c.closePath();
  const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(235,238,240,0.95)'); g.addColorStop(0.15, 'rgba(160,166,172,0.6)'); g.addColorStop(0.85, 'rgba(160,166,172,0.6)'); g.addColorStop(1, 'rgba(235,238,240,0.95)');
  c.fillStyle = g; c.fill();
  c.globalCompositeOperation = 'source-atop';
  for (let x = 14; x < W; x += 9) { c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x, 0, 2, H); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// a faded antique rug (an original pattern): ivory field, soft rose and sage medallion and borders
function rugTexture() {
  const W = 640, H = 1024, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  let s = 11; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  c.fillStyle = '#d8cfbf'; c.fillRect(0, 0, W, H);
  const band = (inset, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.strokeRect(inset, inset, W - 2 * inset, H - 2 * inset); };
  band(18, '#9d8f7d', 22); band(44, '#c4ae9b', 26); band(66, '#8e9c8c', 6); band(80, '#b7a08e', 14);
  for (let i = 0; i < 26; i++) { c.fillStyle = i % 2 ? '#a99886' : '#c9b6a4'; const y = 30 + i * (H - 60) / 26; c.fillRect(38, y, 14, 18); c.fillRect(W - 52, y, 14, 18); }
  c.save(); c.translate(W / 2, H / 2);
  for (let r = 5; r > 0; r--) { c.fillStyle = ['#cbb6a3', '#a5b3a3', '#d4c3ae', '#b49787', '#e1d6c4'][r - 1]; c.beginPath();
    for (let k = 0; k <= 64; k++) { const a = k / 64 * Math.PI * 2, rr = r * 46 * (1 + 0.18 * Math.cos(a * 8)); c.lineTo(Math.cos(a) * rr * 0.85, Math.sin(a) * rr * 1.25); } c.fill(); }
  c.restore();
  for (const [x, y] of [[110, 110], [W - 110, 110], [110, H - 110], [W - 110, H - 110]]) { c.fillStyle = '#b8a493'; c.beginPath(); c.ellipse(x, y, 60, 46, 0, 0, Math.PI * 2); c.fill(); }
  // wear: faded patches and the weave
  const img = c.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, fade = 0.5 + 0.5 * Math.sin(x * 0.011 + Math.sin(y * 0.007) * 3) * Math.cos(y * 0.006);
    const n = (rnd() - 0.5) * 18 + ((x + y) % 4 < 2 ? -5 : 4);
    for (let k = 0; k < 3; k++) d[i + k] = (d[i + k] * (0.62 + 0.18 * fade) + 205 * 0.38 - 10 + 28 * fade + n);
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// line drawing prints (apartment-10): ink lines on warm paper, matted
function lineArtTexture(seed) {
  const W = 512, H = 640, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  c.fillStyle = '#f2ede3'; c.fillRect(0, 0, W, H);
  c.strokeStyle = '#d9d2c6'; c.lineWidth = 2; c.strokeRect(70, 80, W - 140, H - 160);
  c.strokeStyle = '#3b3833'; c.lineWidth = 1.6; c.lineCap = 'round';
  for (let k = 0; k < 5; k++) { c.beginPath(); let x = 120 + rnd() * 270, y = 140 + rnd() * 360; c.moveTo(x, y);
    for (let i = 0; i < 5; i++) { const nx = 110 + rnd() * 290, ny = 130 + rnd() * 380; c.bezierCurveTo(x + (rnd() - 0.5) * 160, y + (rnd() - 0.5) * 160, nx + (rnd() - 0.5) * 160, ny + (rnd() - 0.5) * 160, nx, ny); x = nx; y = ny; } c.stroke(); }
  c.fillStyle = 'rgba(160,120,80,0.25)'; c.beginPath(); c.ellipse(260, 330, 70, 50, 0.3, 0, Math.PI * 2); c.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// an original graphic abstract (apartment-09): black and gold shards on ivory
function shardTexture() {
  const W = 640, H = 840, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#efe9de'; c.fillRect(0, 0, W, H);
  const poly = (pts, col) => { c.fillStyle = col; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); };
  poly([[0, 0], [380, 0], [150, 520], [0, 700]], '#161514');
  poly([[640, 120], [640, 840], [300, 840], [470, 380]], '#1d1b19');
  poly([[200, 840], [420, 300], [470, 380], [330, 840]], '#b89a62');
  poly([[380, 0], [560, 0], [300, 460], [210, 520]], '#c9b07d');
  poly([[0, 760], [140, 600], [180, 840], [0, 840]], '#3a3632');
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// grey abstract linework rug (apartment-10)
function bedroomRugTexture() {
  // tone-on-tone distressed weave: a cream ground, soft tonal clouds, many fine broken grey
  // strokes along the warp and weft (apartment-10's rug, an original pattern)
  const W = 1024, H = 1024, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  let s = 23; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  c.fillStyle = '#e7e1d6'; c.fillRect(0, 0, W, H);
  for (let k = 0; k < 40; k++) { const g = c.createRadialGradient(rnd() * W, rnd() * H, 0, rnd() * W, rnd() * H, 120 + rnd() * 220); g.addColorStop(0, `rgba(${170 + rnd() * 30},${165 + rnd() * 30},${158 + rnd() * 30},0.18)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  c.lineCap = 'butt';
  for (let k = 0; k < 2600; k++) {
    const hz = rnd() < 0.55, x = rnd() * W, y = rnd() * H, L = 8 + rnd() * 70;
    c.strokeStyle = `rgba(${95 + rnd() * 40},${92 + rnd() * 40},${88 + rnd() * 40},${0.08 + rnd() * 0.22})`; c.lineWidth = 1 + rnd() * 2.2;
    c.beginPath(); c.moveTo(x, y); if (hz) c.lineTo(x + L, y + (rnd() - 0.5) * 2); else c.lineTo(x + (rnd() - 0.5) * 2, y + L); c.stroke();
  }
  const img = c.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, n = (rnd() - 0.5) * 16 + ((x + y * 3) % 5 < 2 ? -4 : 3); d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 2.5, 1 / 2.5); return t;
}
// hammered metal: overlapping shallow round dents as a normal map (4 cm tile, metric UVs)
function hammerNormal() {
  const N = 256, h = new Float32Array(N * N);
  let s = 41; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let k = 0; k < 90; k++) {
    const cx = rnd() * N, cy = rnd() * N, r = 14 + rnd() * 18, d = 0.6 + rnd() * 0.4;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const q = (x * x + y * y) / (r * r); if (q >= 1) continue;
      const i = ((Math.floor(cy + y) % N + N) % N) * N + ((Math.floor(cx + x) % N + N) % N);
      h[i] = Math.min(h[i], -d * (1 - q));
    }
  }
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const H = (a, b) => h[((b + N) % N) * N + ((a + N) % N)];
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    data[i] = (-dx / l * 0.5 + 0.5) * 255; data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; data[i + 2] = (1 / l * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 0.08, 1 / 0.08); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
  return t;
}
// ---- materials the furniture adds ----------------------------------------------------------------
function furnitureMaterials(M, Q) {
  const pc = !Q.quest;
  const phys = (o, cc) => (pc && cc ? new THREE.MeshPhysicalMaterial({ ...o, ...cc }) : new THREE.MeshStandardMaterial(o));
  M.lacquer = phys({ color: '#060606', roughness: pc ? 0.2 : 0.1 }, { clearcoat: 1, clearcoatRoughness: 0.03 });
  M.ivory = new THREE.MeshStandardMaterial({ color: '#efe9dd', roughness: 0.32 });
  M.keyBlack = new THREE.MeshStandardMaterial({ color: '#0b0b0b', roughness: 0.4 });
  M.brass = new THREE.MeshStandardMaterial({ color: '#b28a4c', metalness: 1, roughness: 0.32 });
  M.blackMatte = new THREE.MeshStandardMaterial({ color: '#141312', roughness: 0.55, metalness: 0.2 });
  M.stoneBlack = new THREE.MeshStandardMaterial({ color: '#1a1918', roughness: 0.42 });
  M.smoke = new THREE.MeshPhysicalMaterial({ color: '#5d6166', roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
  M.smoke.userData = { shadow: 'cast', order: 5 };
  M.leafGlass = new THREE.MeshStandardMaterial({ map: glassLeafTexture(), color: '#a3a9ae', roughness: 0.08, metalness: 0.55, transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.05 });
  M.leafGlass.userData = { shadow: 'cast', order: 6 };
  M.shade = M.linen.clone(); M.shade.color = new THREE.Color('#efe6d6');
  { const pt = paintingTexture(); M.canvas = new THREE.MeshStandardMaterial({ map: pt.map, normalMap: pt.normalMap, roughness: 0.7 }); }
  const tl = new THREE.TextureLoader(), dir = (Q.base || './') + 'textures/scans/' + (Q.quest ? 'quest/' : '');
  const lmap = tl.load(dir + 'leaf_ficus_diff.webp'); lmap.colorSpace = THREE.SRGBColorSpace; lmap.anisotropy = 4;
  const lnor = tl.load(dir + 'leaf_ficus_nor.webp'); lnor.anisotropy = 4;
  M.leaf = new THREE.MeshStandardMaterial({ map: lmap, normalMap: lnor, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.42 });
  M.bark = new THREE.MeshStandardMaterial({ color: '#7a6c5c', roughness: 0.8 });
  M.vaseBlack = new THREE.MeshStandardMaterial({ color: '#141312', roughness: 0.62 });         // matte black stoneware
  M.vaseOchre = new THREE.MeshStandardMaterial({ color: '#a7865c', roughness: 0.7 });          // ribbed stoneware (apartment-11)
  M.driedHead = new THREE.MeshStandardMaterial({ color: '#c9a77e', roughness: 0.9 });          // dried seed heads
  M.brassTop = new THREE.MeshStandardMaterial({ color: '#a8977a', metalness: 1, roughness: 0.42 });   // spun brass table top (champagne, as apartment-12)
  M.brassHammered = new THREE.MeshStandardMaterial({ color: '#9f8a66', metalness: 1, roughness: 0.32, normalMap: hammerNormal(), normalScale: new THREE.Vector2(0.9, 0.9) });
  M.potStone = M.creamStone.clone(); M.potStone.color = new THREE.Color('#77706a');
  M.moss = new THREE.MeshStandardMaterial({ color: '#3f4a2a', roughness: 1 });
  M.wallRug = new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 0.95, side: THREE.DoubleSide });
  M.reliefBlack = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.55, metalness: 0.1 });
  M.ceramic = phys({ color: '#f1eee8', roughness: 0.35 }, { clearcoat: 0.6, clearcoatRoughness: 0.15 });
  M.bookCream = new THREE.MeshStandardMaterial({ color: '#d9cfbf', roughness: 0.7 });
  M.bookGrey = new THREE.MeshStandardMaterial({ color: '#8a8580', roughness: 0.7 });
  M.bookBlack = new THREE.MeshStandardMaterial({ color: '#1d1c1b', roughness: 0.6 });
  M.frameGrey = phys({ color: '#c9c6c0', roughness: 0.35 }, { clearcoat: 0.5, clearcoatRoughness: 0.15 });
  M.sculpt = new THREE.MeshStandardMaterial({ color: '#eeebe5', roughness: 0.42 });
  M.benchFabric = M.boucle;
  M.duvet = M.linen.clone(); M.duvet.color = new THREE.Color('#ece5da');
  M.throwSand = M.linen.clone(); M.throwSand.color = new THREE.Color('#c9b39a');
  M.nickel = new THREE.MeshStandardMaterial({ color: '#8e8a83', metalness: 1, roughness: 0.06 });
  M.crystal = new THREE.MeshStandardMaterial({ color: '#e9eef2', metalness: 0.6, roughness: 0.04, transparent: true, opacity: 0.75, depthWrite: false });
  M.crystal.userData = { shadow: 'cast', order: 6 };
  M.goldLeaf = new THREE.MeshStandardMaterial({ color: '#c8a35a', metalness: 1, roughness: 0.28, side: THREE.DoubleSide });
  M.tvGlass = phys({ color: '#050607', roughness: 0.08 }, { clearcoat: 1, clearcoatRoughness: 0.02 });
  M.lineArt1 = new THREE.MeshStandardMaterial({ map: lineArtTexture(3), roughness: 0.9 });
  M.lineArt2 = new THREE.MeshStandardMaterial({ map: lineArtTexture(17), roughness: 0.9 });
  M.shardArt = new THREE.MeshStandardMaterial({ map: shardTexture(), roughness: 0.8 });
  M.bedRug = new THREE.MeshStandardMaterial({ map: bedroomRugTexture(), normalMap: M.rug.normalMap, normalScale: new THREE.Vector2(1.6, 1.6), roughness: 1 });
  M.lacquerWhite = phys({ color: '#ece7de', roughness: 0.3 }, { clearcoat: 0.8, clearcoatRoughness: 0.08 });
  M.steel = new THREE.MeshStandardMaterial({ color: '#b9b7b2', metalness: 1, roughness: 0.28 });
  M.sinkDark = new THREE.MeshStandardMaterial({ color: '#2a2a29', metalness: 0.6, roughness: 0.35 });
  M.sinkSteel = new THREE.MeshStandardMaterial({ color: '#c7c5c0', metalness: 1, roughness: 0.32, side: THREE.DoubleSide });
  M.enamel = phys({ color: '#f6f4ef', roughness: 0.12 }, { clearcoat: 1, clearcoatRoughness: 0.04 });
  M.mirror = new THREE.MeshStandardMaterial({ color: '#e4e6e3', metalness: 1, roughness: 0.012 });
  M.mirror.name = 'mirror';
  // contact shadows: four strengths of a soft rounded-rectangle falloff (multiplied over the floor)
  { const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S; const cx = cv.getContext('2d'), im = cx.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = Math.abs((x + 0.5) / S * 2 - 1), v = Math.abs((y + 0.5) / S * 2 - 1);
      const e = Math.min(1 - u, 1 - v) * (S / 2) / 5.5;                    // ~ the 8 cm margin, in texels
      const a = Math.pow(Math.max(0, Math.min(1, e)), 1.6) * 255, i = (y * S + x) * 4;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = a; im.data[i + 3] = 255;
    }
    cx.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    M.contact = [0.25, 0.4, 0.55, 0.7].map((o) => { const m = new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: t, transparent: true, opacity: o, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }); m.userData = { shadow: 'none', order: 2 }; return m; });
  }
  M.ledStrip = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffe6c4', emissiveIntensity: 1.6, roughness: 0.5 });
  // kitchen interiors (openable cabinets, fridge, pantry, ovens)
  const S = (c, r, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...o });
  M.melamine = S('#e7e3dc', 0.55);                                // carcass interior board
  M.fridgeLiner = S('#f4f5f3', 0.22);                             // moulded white liner
  M.ovenEnamel = S('#16181c', 0.38, { metalness: 0.1 });          // dark blue-black cavity enamel
  M.smokeClear = new THREE.MeshStandardMaterial({ color: '#dfe6ea', roughness: 0.08, transparent: true, opacity: 0.35, depthWrite: false });
  M.smokeClear.userData = { shadow: 'none', order: 5 };
  M.vegRed = S('#9c2a1d', 0.45); M.vegGreen = S('#4f7a2c', 0.5);
  M.milk = S('#f2f2ee', 0.6); M.juice = S('#d9881e', 0.5); M.eggs = S('#a9a49a', 0.95); M.takeout = S('#bfa98a', 0.85);
  M.frost = S('#d8e2e6', 0.7); M.canRed = S('#8e1f1a', 0.35, { metalness: 0.4 }); M.cereal = S('#c5a03a', 0.8); M.pasta = S('#2f4f8a', 0.7);
  M.ledStrip.userData = { shadow: 'none' };
  M.flushPlate = new THREE.MeshStandardMaterial({ color: '#d8d8d6', metalness: 0.4, roughness: 0.25 });
  M.amberGlass = new THREE.MeshStandardMaterial({ color: '#8a7656', emissive: '#d9b27c', emissiveIntensity: 0.3, roughness: 0.16, metalness: 0.4 });
  M.towel = M.boucle.clone(); M.towel.color = new THREE.Color('#fbf8f2');
  M.towelSand = M.boucle.clone(); M.towelSand.color = new THREE.Color('#c9b298');
  M.settingBed = new THREE.MeshStandardMaterial({ color: '#4a4540', roughness: 0.9 });
  M.marbleHoned = M.marbleGrey.isMeshPhysicalMaterial ? new THREE.MeshStandardMaterial({ map: M.marbleGrey.map, normalMap: M.marbleGrey.normalMap, roughnessMap: M.marbleGrey.roughnessMap, roughness: 2.2 }) : M.marbleGrey.clone();
  if (!M.marbleGrey.isMeshPhysicalMaterial) M.marbleHoned.roughness = 2.2;
  // textured bronze wallcovering (grasscloth-like): the linen scan's weave, dark bronze, metallic sheen
  M.wallcovering = new THREE.MeshStandardMaterial({ map: M.linen.map, normalMap: M.linen.normalMap, roughnessMap: M.linen.roughnessMap, color: '#6b5440', metalness: 0.35, roughness: 0.9 });
  M.sheer = M.linen.clone(); M.sheer.transparent = true; M.sheer.opacity = 0.5; M.sheer.depthWrite = false; M.sheer.userData = { shadow: 'none', order: 4 };
}

// ---- the rooms ---------------------------------------------------------------------------------
// CQC breakables (see brkOwn): light fittings (rods stay up) and decor
pendant = breakable('pendant', pendant, true); facetPendant = breakable('facet pendant', facetPendant, true);
chandelier = breakable('leaf chandelier', chandelier, true); beadChandelier = breakable('bead chandelier', beadChandelier, true);
goldChandelier = breakable('gold chandelier', goldChandelier, true); bowl = breakable('bowl', bowl); driedVase = breakable('vase', driedVase);
const floorLampM = movable('floor lamp', 8, floorLamp);
export function furnish(M, Q) {
  furnitureMaterials(M, Q);
  MIRRORS = [];
  const qq = !!(Q && Q.quest);
  SOFT.step = qq ? 0.08 : 0.045; SOFT.edge = qq ? 2 : 3; SOFT.pipe = qq ? 0.06 : 0.04; SOFT.ring = qq ? 4 : 5; WSEED = 12345;
  M_BED = M.settingBed;
  const B = new Builder();
  MOV = Q && Q.cqc ? [] : null; BRK = Q && Q.cqc ? [] : null; OPN = [];
  const group = new THREE.Group(); group.name = 'furniture';
  const ceil = 4.2;

  // great hall, living area (apartment-19 / -20): sofas either side of the north-south axis
  // through the centre window bay, two coffee tables between, a big cream rug, three smoked
  // glass pendants over it
  rug(B, M, 8.8, 3.55, 4.6, 3.7);
  sofa(B, M, 7.0, 3.55, Math.PI / 2);
  sofa(B, M, 10.6, 3.55, -Math.PI / 2);
  coffeeTable(B, M, 8.55, 2.95, 0.05);
  coffeeTable(B, M, 9.05, 4.15, -0.04, 1.0, 0.4, true);
  for (const [px, s] of [[7.7, 1], [8.8, 2], [9.9, 3]]) pendant(B, M, px, 3.55, 2.35 + 0.15 * (s % 2), ceil, s);
  for (const sx of [6.3, 11.3]) { sideTable(B, M, sx, 1.0); tableLamp(B, M, sx, 0.55, 1.0); }
  bowl(B, M, 8.45, 0.4, 2.85, 0.17);
  books(B, M, 8.75, 0.4, 3.15, 0.3);
  books(B, M, 9.15, 0.43, 4.05, -0.4, 2);

  // piano corner, west end (apartment-18 / -19): the grand on its own rug, a lamp beside it
  rug(B, M, 2.75, 3.9, 3.0, 2.6, 0);
  piano(B, M, 2.6, 4.3, 0.55);
  floorLampM(B, M, 1.5, 1.9);
  wallRug(B, M, 0.905, 4.0, 1.5, 2.5, 0.75, '+x');
  figTree(B, M, 1.5, 5.9);
  armchair(B, M, 1.0, 0.95, 2.4); armchair(B, M, 2.25, 0.85, 3.6);
  armchair(B, M, 16.5, 1.0, -2.4);
  // curtains bunched at the columns and the corner glass (apartment-20)
  for (const [a, b] of [[0.25, 0.75], [3.8, 4.25], [5.63, 6.08], [11.55, 12.0], [13.4, 13.85], [16.85, 17.35]]) curtain(B, M, a, b, 0.16, 3.81);

  // dining end, east of the columns (apartment-17): travertine table for eight, bouclé shell
  // chairs, two leaf chandeliers, an abstract canvas between the slot windows, two plinths
  diningTable(B, M, 14.75, 3.6, 0);
  // on the walnut: a wide stoneware bowl and two brass candlesticks with ivory candles
  bowl(B, M, 14.75, 0.75, 3.6, 0.21);
  for (const zz of [2.95, 4.25]) {
    B.add(at(lathe([[0, 0], [0.045, 0], [0.045, 0.006], [0.014, 0.02], [0.009, 0.2], [0.022, 0.212], [0.016, 0.224], [0, 0.224]], 24), 14.75, 0.75, zz), M.brass);
    B.add(at(lathe([[0.0105, 0.214], [0.0105, 0.42], [0.006, 0.426], [0, 0.427]], 16), 14.75, 0.75, zz), M.ivory);
  }
  for (const zz of [2.75, 3.6, 4.45]) { diningChair(B, M, 14.0, zz, Math.PI / 2); diningChair(B, M, 15.5, zz, -Math.PI / 2); }
  diningChair(B, M, 14.75, 2.05, 0); diningChair(B, M, 14.75, 5.15, Math.PI);
  chandelier(B, M, 14.75, 3.0, 2.0, ceil);
  chandelier(B, M, 14.75, 4.2, 2.0, ceil);
  painting(B, M, 16.69, 1.75, 4.0, 1.6, 1.25, '-x');
  plinth(B, M, 13.95, 0.9 + 0.45, 0.42, 1.05, M.woodLight);
  plinth(B, M, 16.3, 6.25, 0.34, 1.15, M.creamStone);

  // ---- floor two ---------------------------------------------------------------------------
  const F2 = 4.6, C2c = 8.2, L1v = 0, DH1v = 2.74;
  const up = (fn) => { const B0 = new Builder(); ARTY = F2; fn(B0); ARTY = 0; for (const [mat, list] of B0.buckets) for (const g of list) B.add(g.translate(0, F2, 0), mat); for (const c of B0.colliders) { if (c.t === 'obox') c.c[1] += F2; else { c.min[1] += F2; c.max[1] += F2; } B.colliders.push(c); } };
  // primary bedroom (apartment-10): bed head against the east wall, the park ahead at the north
  // glass, lounge chairs at the west glass, patterned rug, beaded chandelier, two line prints
  up((b) => {
    rugPlain(b, M.bedRug, 10.0, 3.8, 4.4, 3.8);
    bed(b, M, 11.3, 3.8, -Math.PI / 2);
    nightstand(b, M, 12.3, 2.45, -Math.PI / 2); nightstand(b, M, 12.3, 5.15, -Math.PI / 2);
    tableLamp(b, M, 12.3, 0.53, 2.45); tableLamp(b, M, 12.3, 0.53, 5.15);
    armchair(b, M, 6.3, 2.2, 2.3); armchair(b, M, 7.6, 5.4, -2.6);
    sideTable(b, M, 6.0, 3.3, 0, 0.22, 0.5);
    for (const [a, c] of [[5.66, 6.1], [11.55, 11.98]]) curtain(b, M, a, c, 0.16, 3.29, 6, M.linen);   // sheers bunched at the corners (apartment-10)
    print(b, M, 12.61, 2.35, 3.2, 0.5, 0.62, '-x', M.lineArt1); print(b, M, 12.61, 2.3, 4.4, 0.42, 0.52, '-x', M.lineArt2);
  });
  beadChandelier(B, M, 9.7, 3.8, F2 + 2.15, C2c);
  // library (apartment-09): bleached oak shelving on the south wall, the abstract on the west
  // partition, curved bouclé sofa facing the north glass (east half, clear of the door), round travertine table, armchair and
  // lamp at the corner, gold leaf chandelier
  up((b) => {
    const sh = shelving(b, M, 15.55, 6.5, Math.PI, 2.1, 3.1, 0.4, M.woodLight, 3, 5);      // east of the door swing
    shelfDecor(b, M, sh, 15.55, 6.5, Math.PI, 2.1, 3.1, 0.4, 7);
    // seating group in the east half (the door's walk north from 13.55..14.45 stays open, >= 1.3 m to the gun
    // rack / desk side): a shorter curved sofa (outer chord 2.0 m, x 14.55..16.55) facing the north glass
    rugPlain(b, M.rug, 15.5, 3.6, 2.3, 3.2);
    curvedSofa(b, M, 15.55, 4.85, Math.PI, 2.4, 0.6);
    roundTable(b, M, 15.55, 3.45, 0.5, 0.36);
    books(b, M, 15.5, 0.36, 3.4, 0.2, 2); bowl(b, M, 15.75, 0.36, 3.7, 0.12);
    desk(b, M, 13.17, 2.9, Math.PI / 2);                               // the computer (hub.js draws its screen)
    diningChair(b, M, 13.92, 2.9, -Math.PI / 2);
    print(b, M, 12.79, 1.95, Q && Q.cqc ? 6.05 : 5.3, 0.9, 1.2, '+x', M.shardArt);   // CQC: moved south for the gun rack beside the desk
    for (const [a, c] of [[13.42, 13.86], [16.2, 16.65]]) curtain(b, M, a, c, 0.16, 3.29, 6, M.linen);
  });
  goldChandelier(B, M, 15.55, 3.5, F2 + 2.75, C2c);

  // ---- media room, floor one (apartment-13): dark oak media wall with the TV on the north wall,
  // curvy bouclé sofa facing it from the glass, a lounge chair, rug, lamp, a print on the west wall
  {
    const sh = shelving(B, M, 4.5, 14.7, 0, 2.3, 3.3, 0.42, M.woodDark, 3, 4);
    shelfDecor(B, M, sh, 4.5, 14.7, 0, 2.3, 3.3, 0.42, 21);
    tv(B, M, 4.5, 1.55, 14.93, 0);
    rugPlain(B, M.rug, 4.6, 16.0, 3.4, 2.4);
    curvedSofa(B, M, 4.4, 16.6, Math.PI, 2.2, 0.85, 0.9);
    armchair(B, M, 6.4, 16.3, -2.5);
    sideTable(B, M, 1.45, 15.1, 0, 0.22, 0.5); tableLamp(B, M, 1.45, 0.5, 15.1);
    print(B, M, 0.91, 1.7, 14.98, 0.72, 0.95, '+x', M.lineArt2);   // clear of the slot window
  }

  // ---- bedrooms two and three (apartment-04, -06), floor two south
  up((b) => {
    // bedroom two: pale oak headboard wall on the west, sheer curtains along the glass
    rugPlain(b, M.rug, 3.4, 16.0, 3.2, 2.6);
    bed(b, M, 2.2, 16.0, Math.PI / 2, 1.65, 2.1, M.woodLight, 1.0);
    nightstand(b, M, 1.38, 14.85, Math.PI / 2); nightstand(b, M, 1.38, 17.15, Math.PI / 2);
    tableLamp(b, M, 1.38, 0.53, 14.85);
    curtain(b, M, 1.0, 7.7, 17.43, 3.29, 22, M.sheer);
    armchair(b, M, 6.6, 16.6, -2.5);
    // bedroom three: bed head on the east wall, dark console and a free-form mirror on the north
    // wall, prints, sheer curtains
    rugPlain(b, M.bedRug, 14.6, 16.0, 3.2, 2.6);
    bed(b, M, 15.45, 16.0, -Math.PI / 2, 1.8, 2.1, null, 1.2);
    nightstand(b, M, 16.27, 14.8, -Math.PI / 2); nightstand(b, M, 16.27, 17.2, -Math.PI / 2);
    tableLamp(b, M, 16.27, 0.53, 17.2);
    console_(b, M, 11.6, 14.72, 0, 1.5);
    print(b, M, 11.2, 1.55, 14.49, 0.42, 0.52, '+z', M.lineArt1);
    print(b, M, 12.0, 1.55, 14.49, 0.42, 0.52, '+z', M.lineArt2);
    curtain(b, M, 10.1, 16.6, 17.43, 3.29, 20, M.sheer);
  });
  blobMirror(B, M, 10.45, F2 + 1.55, 14.495, 0.7, 1.0, '+z');

  // dressing hall (apartment-07), the primary closet: vanity and a tall mirror on the south wall,
  // barrel stool, onyx plinth with a sculpture at the opening, bench and prints on the west wall
  up((b) => {
    dressVanity(b, M, 4.35, 9.36, Math.PI);
    barrelStool(b, M, 4.35, 8.95, 0);
    framedMirror(b, M, 4.35, 1.66, 9.6, 1.05, 1.62, '-z');
    sculpturePlinth(b, M, 5.85, 9.3);
    dressBench(b, M, 3.7, 8.45, Math.PI / 2, 1.2, 0.4);
    print(b, M, 3.47, 2.15, 8.45, 0.46, 0.52, '+x', M.lineArt1); print(b, M, 3.47, 1.42, 8.45, 0.56, 0.5, '+x', M.lineArt2);
  });
  // upper landing (apartment-11): a bust on a travertine plinth by the tall door; foot of the
  // stair (apartment-12): a bronze drum table
  up((b) => {
    plinth(b, M, 9.95, 7.35, 0.36, 1.1, M.creamStone);
    reliefArt(b, M, 10.29, 1.75, 9.6, 1.1, 1.3, '-x');
    console_(b, M, 10.08, 9.6, -Math.PI / 2, 1.4, M.creamStone);
    driedVase(b, M, 10.08, 0.85, 9.85);
  });
  // hallway, floor one: two line prints
  print(B, M, 4.73, 1.6, 9.8, 0.5, 0.65, '-x', M.lineArt1); print(B, M, 4.73, 1.6, 11.6, 0.5, 0.65, '-x', M.lineArt2);
  pedestalTable(B, M, 9.35, 13.45);                                                   // foot of the stair (apartment-12)
  figTree(B, M, 8.9, 16.75, 11);                                                    // planter at the gallery's south end (floor plan)

  // ---- kitchen, floor one (apartment-15): galley from the passage south to the glass; base run
  // with sink on the east wall, white uppers, an oven stack; tall integrated fridge / pantry
  // units on the west wall
  kitchenRun(B, M, 16.39, 13.0, -Math.PI / 2, 4.6, { sink: -0.4 });
  cooktop(B, M, 16.39, 0.92, 14.4, -Math.PI / 2);
  // on the counter: an end-grain-edged walnut board leaning on the splash, a stoneware crock of tools
  B.add(at(boardTop(0.5, 0.028, 0.34, 0.085, 0.003).rotateX(-1.32), 16.62, 0.92 + 0.17, 13.45, Math.PI / 2), M.walnut);
  B.add(at(lathe([[0, 0], [0.06, 0], [0.065, 0.02], [0.062, 0.16], [0.056, 0.165], [0.052, 0.12], [0, 0.12]], 28), 16.4, 0.92, 13.9), M.vaseBlack);
  for (const [dx, dz, tl] of [[0.01, 0.005, 0.3], [-0.015, 0.012, 0.27], [0.004, -0.016, 0.32]]) B.add(at(lathe([[0.007, 0], [0.007, tl]], 8), 16.4 + dx, 0.92 + 0.08, 13.9 + dz, 0, dz * 6, -dx * 6), M.woodMid);
  tallUnit(B, M, 16.39, 10.35, -Math.PI / 2, 0.66, 2.35, true);
  tallUnit(B, M, 13.65, 11.4, Math.PI / 2, 2.4, 2.35);
  kitchenRun(B, M, 13.65, 13.35, Math.PI / 2, 1.5, { uppers: false });
  kitchenRun(B, M, 15.4, 15.61, Math.PI, 2.6, { uppers: false, outlets: false, splash: false });     // the L-return toward the window (apartment-15)
  B.add(at(counter(2.6, 0.3, 0.03), 15.4, 0.92, 16.06), M.stone);                    // seating overhang on the window side
  for (const u of [14.65, 15.4, 16.15]) counterStool(B, M, u, 16.36);
  // breakfast room (apartment-14): banquette on the pantry wall, oval dark oak table, chairs,
  // faceted glass pendants
  banquette(B, M, 11.65, 14.35, 0, 2.6);
  ovalTable(B, M, 11.65, 15.15, 0);
  for (const u of [10.95, 11.65, 12.35]) diningChair(B, M, u, 16.0, Math.PI);
  for (const u of [11.1, 11.65, 12.2]) facetPendant(B, M, u, 15.15, 1.9, 3.4);

  // ---- baths: stone cladding floor to ceiling on the bath side, fixtures (apartment-03, -05, -08)
  // primary bath (floor two, white onyx): tub at the north glass, double vanity on the east wall
  clad(B, M.onyx, [
    ['x', 6.72, 0.9, 4.84, F2, C2c, -1],
    ['z', 4.84, 1.35, 5.0, F2, C2c, -1], ['z', 4.84, 5.85, 6.72, F2, C2c, -1], ['z', 4.84, 5.0, 5.85, F2 + 2.44, C2c, -1],
    ['z', 0.9, 1.6, 2.55, F2, C2c, 1], ['z', 0.9, 3.15, 4.85, F2, C2c, 1], ['z', 0.9, 5.45, 6.72, F2, C2c, 1],
    ['z', 0.9, 2.55, 3.15, F2, F2 + 0.1, 1], ['z', 0.9, 4.85, 5.45, F2, F2 + 0.1, 1], ['z', 0.9, 2.55, 3.15, F2 + 3.3, C2c, 1], ['z', 0.9, 4.85, 5.45, F2 + 3.3, C2c, 1],
    ['z', 4.25, 0.15, 1.35, F2, C2c, -1], ['x', 1.35, 4.25, 4.84, F2, C2c, 1],
  ], 0.016, [1.2, 1.2]);
  tub(B, M, 2.4, F2, 1.45, 0);
  vanity(B, M, 4.52, F2, 3.4, -Math.PI / 2, 2.6, M.onyx, M.lacquerWhite, [-0.62, 0.62], 2.55);
  // wood block stool by the tub, folded towels on a bar, a travertine drum stool (apartment-08)
  B.add(at(rbox(0.32, 0.42, 0.3, 0.02, 2), 3.75, F2 + 0.21, 1.25, 0.3), M.woodDark);
  B.add(at(lathe([[0, 0], [0.17, 0], [0.18, 0.02], [0.17, 0.42], [0, 0.42]], 32), 1.45, F2, 5.9), M.creamStone);
  B.add(at(lathe([[0.008, -0.3], [0.008, 0.3]], 8).rotateZ(Math.PI / 2), 1.0, F2 + 1.15, 4.2, Math.PI / 2), M.bronzeLight);
  B.add(at(cushion(0.34, 0.5, 0.05, 0.02, 0.01), 1.0, F2 + 0.92, 4.2, Math.PI / 2), M.towel);
  // second bath (floor two, vein-cut travertine): tub, vanity in dark oak, wall-hung toilet
  clad(B, M.travertine, [
    ['z', 3.46, 9.75, 14.33, F2, C2c, 1], ['z', 6.03, 9.75, 14.33, F2, C2c, -1],
    ['x', 9.75, 3.46, 6.03, F2, C2c, 1],
    ['x', 14.33, 3.46, 4.0, F2, C2c, -1], ['x', 14.33, 4.8, 6.03, F2, C2c, -1], ['x', 14.33, 4.0, 4.8, F2 + 2.44, C2c, -1],
  ], 0.016, [0.6, 1.2]);
  vanity(B, M, 5.72, F2, 10.9, -Math.PI / 2, 1.0, M.creamStone, M.woodDark);
  toilet(B, M, 3.476, F2, 12.0, Math.PI / 2);
  builtInTub(B, M, 3.48, 12.55, 4.3, 14.31, F2, M.travertine);
  B.add(at(showerSet(), 3.477, F2 + 1.1, 13.5, Math.PI / 2), M.bronzeLight);          // over the tub, on the west wall
  B.add(at(towelRing(), 3.477, F2 + 1.35, 11.3, Math.PI / 2), M.bronzeLight);
  B.add(at(cushion(0.24, 0.4, 0.035, 0.015, 0.008), 3.55, F2 + 1.04, 11.3, Math.PI / 2), M.towelSand);
  // third bath (floor two, grey marble to chair height, as apartment-05)
  clad(B, M.marbleHoned, [
    ['x', 6.92, 14.75, 16.7, F2, F2 + 1.2, 1], ['x', 9.6, 14.75, 16.7, F2, F2 + 1.2, -1],
    ['z', 14.75, 6.92, 7.5, F2, F2 + 1.2, 1], ['z', 14.75, 8.35, 9.6, F2, F2 + 1.2, 1],
    ['z', 16.7, 6.92, 7.9, F2, F2 + 1.2, -1], ['z', 16.7, 8.5, 9.6, F2, F2 + 1.2, -1],
  ], 0.016, [0.6, 0.6]);
  clad(B, M.wallcovering, [
    ['x', 6.92, 14.75, 16.7, F2 + 1.2, C2c, 1], ['x', 9.6, 14.75, 16.7, F2 + 1.2, C2c, -1],
    ['z', 14.75, 6.92, 7.5, F2 + 1.2, C2c, 1], ['z', 14.75, 8.35, 9.6, F2 + 1.2, C2c, 1],
    ['z', 16.7, 6.92, 7.9, F2 + 1.2, C2c, -1], ['z', 16.7, 8.5, 9.6, F2 + 1.2, C2c, -1], ['z', 14.75, 7.5, 8.35, F2 + 2.44, C2c, 1],
  ], 0.004, [0.9, 3.6]);
  vanity(B, M, 16.42, F2, 8.9, -Math.PI / 2, 0.9, M.marbleGrey, M.woodMid);
  // powder room (floor one, apartment-05): honed grey marble to 1.2 m, a textured bronze
  // wallcovering above
  const pw = [['z', 6.18, 12.95, 14.18, 1], ['x', 12.95, 6.18, 7.81, 1], ['x', 14.18, 6.18, 7.81, -1], ['z', 7.81, 12.95, 13.25, -1], ['z', 7.81, 14.05, 14.18, -1]];
  clad(B, M.marbleHoned, pw.map(([a, f, s0, s1, d]) => [a, f, s0, s1, L1v, 1.2, d]), 0.016, [0.6, 0.6]);
  clad(B, M.wallcovering, pw.map(([a, f, s0, s1, d]) => [a, f, s0, s1, 1.2, 3.0, d]), 0.004, [0.9, 3.0]);
  clad(B, M.wallcovering, [['z', 7.81, 13.25, 14.05, DH1v - 0.2, 3.0, -1]], 0.004, [0.9, 3.0]);
  B.box(6.18, 1.2, 12.95, 7.81, 1.215, 12.975, M.bronzeLight, false); B.box(6.18, 1.2, 14.155, 7.81, 1.215, 14.18, M.bronzeLight, false);
  vanity(B, M, 6.47, 0, 13.55, Math.PI / 2, 0.75, M.marbleGrey, M.woodDark);

  const meshes = B.finish(group);
  const movables = (MOV || []).map((m) => {
    const g = new THREE.Group(); g.name = m.kind; const ms = m.b.finish(g);
    const bb = new THREE.Box3(); for (const k of ms) { k.geometry.computeBoundingBox(); bb.union(k.geometry.boundingBox); }
    return { kind: m.kind, mass: m.mass, group: g, meshes: ms, box: bb, x: m.x, y: m.y, z: m.z, ry: m.ry };
  });
  MOV = null;
  // openables: each part's pivot group in apartment coordinates (rotation ry), its meshes in the part's own frame
  const openables = OPN.map((o) => {
    const g = new THREE.Group(); g.name = o.kind; g.position.set(o.x, o.y, o.z); g.rotation.y = o.ry;
    const ms = o.b.finish(g); group.add(g);
    return { ...o, b: undefined, group: g, meshes: ms, open: 0 };
  });
  OPN = [];
  const breakables = (BRK || []).map((k) => {                    // CQC: own meshes, apartment coordinates
    for (const bb of [k.b, k.b.rod]) for (const list of bb.buckets.values()) for (const g of list) if (k.y) g.translate(0, k.y, 0);
    const g = new THREE.Group(); g.name = k.kind; const ms = k.b.finish(g), rod = new THREE.Group(), rs = k.b.rod.finish(rod);
    const box = new THREE.Box3(); for (const m of [...ms, ...rs]) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
    return { kind: k.kind, group: g, rod, meshes: ms, rods: rs, box };
  });
  BRK = null;
  for (const m of meshes) if (m.material.userData && m.material.userData.mirror) m.userData.mirror = m.material.userData.mirror;
  return { group, meshes, movables, breakables, openables, mirrors: meshes.filter((m) => m.userData.mirror), colliders: B.colliders, art: ART, screen: { x: 12.835 + 0.17 + 0.016, y: 4.6 + 0.75 + 0.43, z: 2.9, w: 0.6, h: 0.34, face: '+x' }, busts: [[13.95, 1.05, 1.35, -2.2], [16.3, 1.15, 6.25, -1.2], [9.95, 4.6 + 1.1, 7.35, -1.9]] };
}
