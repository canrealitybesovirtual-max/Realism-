// Furniture, from the reference photos (docs/references, apartment-17..20): modelled to real
// sizes, upholstered and finished with the photo-scanned materials (textures/scans). Everything
// static is merged per material (one draw call each) and given simple colliders.
// Plan frame as apartment.js: x east, y up, z south, metres; the great hall is x 0..17.6,
// z 0..6.72, north glass at z = 0.
import * as THREE from 'three';
import { Builder } from './build.js';

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

// a cushion: rounded box crowned on its big faces (the filling), seams a little pinched
export function cushion(w, h, d, r, crown, seg = 4) {
  const g = rbox(w, h, d, r, seg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), y = p.getY(i), z = p.getZ(i) / (d / 2);
    const f = Math.max(0, 1 - x * x) * Math.max(0, 1 - z * z);
    p.setY(i, y + Math.sign(y) * crown * f * Math.min(1, Math.abs(y) / (h / 2)));
  }
  return smooth(g);
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

// straight bouclé sofa (apartment-19 / -20): low, deep, rounded; loose seat and back cushions,
// throw pillows; plinth recessed so it floats
function sofa(B, M, x, z, ry, L = 2.6, D = 1.0) {
  const g = (geo, mat) => B.add(at(geo, x, 0, z, ry), mat);
  const lx = (u, v) => [u, v];
  const put = (geo, u, y, v, mat, rr = 0, rx = 0) => { at(geo, u, y, v, rr, rx); g(geo, mat); };
  const AW = 0.24, BK = 0.24;
  put(rbox(L - 0.16, 0.07, D - 0.16, 0.01), 0, 0.035, 0, M.blackMatte);
  put(rbox(L, 0.3, D, 0.05), 0, 0.22, 0, M.boucle);                          // frame
  put(rbox(AW, 0.6, D, 0.06), -L / 2 + AW / 2, 0.37, 0, M.boucle);           // arms
  put(rbox(AW, 0.6, D, 0.06), L / 2 - AW / 2, 0.37, 0, M.boucle);
  put(rbox(L - 2 * AW + 0.02, 0.42, BK, 0.09), 0, 0.58, -D / 2 + BK / 2, M.boucle);   // back
  const n = 3, sw = (L - 2 * AW) / n;
  for (let i = 0; i < n; i++) {
    const u = -L / 2 + AW + sw * (i + 0.5);
    put(cushion(sw - 0.012, 0.15, D - BK - 0.03, 0.05, 0.012), u, 0.445, (BK + 0.03) / 2, M.boucle);
    put(cushion(sw - 0.02, 0.44, 0.2, 0.07, 0.025), u, 0.73, -D / 2 + BK + 0.08, M.boucle, 0, -0.2);
  }
  put(cushion(0.5, 0.48, 0.14, 0.07, 0.06), -L / 2 + AW + 0.32, 0.72, -D / 2 + BK + 0.2, M.velvet, 0.35, -0.25);
  put(cushion(0.46, 0.44, 0.13, 0.07, 0.055), L / 2 - AW - 0.32, 0.71, -D / 2 + BK + 0.2, M.boucleTaupe, -0.3, -0.25);
  // collider: the whole sofa
  const c = Math.cos(ry), s = Math.sin(ry);
  B.colliders.push({ t: 'obox', c: [x, 0.38, z], h: [L / 2, 0.38, D / 2], yaw: ry, mat: M.boucle });
  void lx; void c; void s;
}

// square coffee table, bleached oak frame with a smoked glass top (apartment-19)
function coffeeTable(B, M, x, z, ry, S = 1.0, H = 0.4) {
  const add = (geo, mat) => B.add(at(geo, x, 0, z, ry), mat);
  const lw = 0.11, fh = 0.09;
  for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(at(rbox(lw, H - fh, lw, 0.008), u * (S / 2 - lw / 2), (H - fh) / 2, v * (S / 2 - lw / 2)), M.woodLight);
  for (const v of [-1, 1]) add(at(rbox(S, fh, lw, 0.008), 0, H - fh / 2, v * (S / 2 - lw / 2)), M.woodLight);
  for (const u of [-1, 1]) add(at(rbox(lw, fh, S - 2 * lw + 0.004, 0.008), u * (S / 2 - lw / 2), H - fh / 2, 0), M.woodLight);
  add(at(rbox(S - 2 * lw + 0.01, 0.02, S - 2 * lw + 0.01, 0.003), 0, 0.075, 0), M.woodLight);   // low shelf
  add(at(rbox(S - 2 * lw + 0.02, 0.012, S - 2 * lw + 0.02, 0.003), 0, H - 0.02, 0), M.smoke);
  B.colliders.push({ t: 'obox', c: [x, H / 2, z], h: [S / 2, H / 2, S / 2], yaw: ry, mat: M.woodLight });
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

// travertine dining table for eight on two oval pedestals (apartment-17)
function diningTable(B, M, x, z, ry, L = 2.7, Wd = 1.05, H = 0.75) {
  const add = (geo, mat) => B.add(at(geo, x, 0, z, ry), mat);
  add(at(rbox(Wd, 0.06, L, 0.012), 0, H - 0.03, 0), M.creamStone);
  for (const v of [-L / 2 + 0.55, L / 2 - 0.55]) {
    const ped = lathe([[0, 0], [0.2, 0], [0.2, 0.01], [0.16, 0.12], [0.15, H - 0.07], [0.19, H - 0.06], [0, H - 0.06]], 32);
    ped.scale(1.15, 1, 0.8);
    add(at(ped, 0, 0, v), M.creamStone);
  }
  B.colliders.push({ t: 'obox', c: [x, H / 2, z], h: [Wd / 2, H / 2, L / 2], yaw: ry, mat: M.creamStone });
}

// bouclé dining chair (apartment-17): a wide plump seat in a low upholstered shell whose back
// wraps round into arms that slope down to the front; slim black tapered legs, splayed
function diningChair(B, M, x, z, ry) {
  const add = (geo, mat) => B.add(at(geo, x, 0, z, ry), mat);
  add(at(cushion(0.5, 0.12, 0.48, 0.05, 0.018), 0, 0.47, 0.03), M.boucle);
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
}

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
  const g = new THREE.PlaneGeometry(w, h, 8, 12).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, 0.012 + 0.006 * Math.sin(p.getX(i) * 9) * (0.5 - p.getY(i) / h));
  g.computeVertexNormals();
  B.add(at(g, x, yBottom + h / 2, z, ry), M.wallRug);
  B.add(at(lathe([[0.012, -w / 2 - 0.08], [0.012, w / 2 + 0.08]], 8).rotateZ(Math.PI / 2), 0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(ry)).translate(x, yBottom + h + 0.02, z), M.bronzeLight);
}

// tub armchair (apartment-18): bouclé shell round a deep seat, short oak legs
function armchair(B, M, x, z, ry) {
  const add = (geo, mat) => B.add(at(geo, x, 0, z, ry), mat);
  add(at(cushion(0.62, 0.14, 0.6, 0.06, 0.02), 0, 0.42, 0.03), M.boucle);
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
}

// drum side table (travertine) and a table lamp on a dark figure base (apartment-20)
function sideTable(B, M, x, z, r = 0.27, h = 0.55) {
  B.add(at(lathe([[0, 0], [r, 0], [r, h - 0.03], [r - 0.01, h], [0, h]], 36), x, 0, z), M.creamStone);
  B.colliders.push({ t: 'obox', c: [x, h / 2, z], h: [r, h / 2, r], yaw: 0, mat: M.creamStone });
}
function tableLamp(B, M, x, y, z) {
  B.add(at(lathe([[0, 0], [0.09, 0], [0.09, 0.02], [0.05, 0.05], [0.075, 0.16], [0.045, 0.3], [0.06, 0.36], [0.015, 0.42], [0, 0.42]], 24), x, y, z), M.stoneBlack);
  B.add(at(lathe([[0.006, 0.42], [0.006, 0.66]], 8), x, y, z), M.bronzeLight);
  B.add(at(lathe([[0.2, 0.6], [0.17, 0.84]], 36), x, y, z), M.shade);
}
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
function bed(B, M, x, z, ry, W = 2.05, Lb = 2.2, hbMat = null, HWx = 1.4) {
  const add = (geo, mat) => B.add(at(geo, x, 0, z, ry), mat);
  // fluted base: vertical ribs round the box
  add(at(rbox(W, 0.36, Lb, 0.03), 0, 0.2, 0), M.boucleTaupe);
  for (let i = 0; i < 40; i++) { const u = -W / 2 + 0.03 + (W - 0.06) * i / 39; add(at(rbox(0.035, 0.32, 0.02, 0.012, 2), u, 0.2, Lb / 2 + 0.005), M.boucleTaupe); }
  add(at(rbox(W - 0.06, 0.24, Lb - 0.08, 0.06), 0, 0.5, 0.02), M.linen);                   // mattress
  add(at(cushion(W + 0.02, 0.07, Lb * 0.62, 0.035, 0.02), 0, 0.64, Lb * 0.19), M.duvet);    // folded duvet
  add(at(cushion(W + 0.06, 0.04, 0.55, 0.02, 0.015), 0, 0.69, Lb * 0.35), M.throwSand);     // throw at the foot
  for (const [u, w, mat, yy, tilt] of [[-0.5, 0.9, M.linen, 0.75, -0.35], [0.5, 0.9, M.linen, 0.75, -0.35], [-0.48, 0.66, M.throwSand, 0.82, -0.25], [0.48, 0.66, M.throwSand, 0.82, -0.25], [0, 0.55, M.boucle, 0.74, -0.15]])
    add(at(cushion(w, 0.5, 0.16, 0.08, 0.06), u, yy, -Lb / 2 + 0.3 + (mat === M.boucle ? 0.18 : 0), 0, tilt), mat);
  // headboard wall panel: channels
  const HB = 1.35, HW = W + HWx, nch = Math.round(HW / 0.24);
  for (let i = 0; i < nch; i++) { const u = -HW / 2 + HW * (i + 0.5) / nch; add(at(rbox(HW / nch - 0.008, HB, 0.09, hbMat ? 0.006 : 0.035), u, 0.62 + HB / 2 - 0.1, -Lb / 2 - 0.06), hbMat || M.boucleTaupe); }
  B.colliders.push({ t: 'obox', c: [x, 0.35, z], h: [W / 2, 0.35, Lb / 2], yaw: ry, mat: M.linen });
}
function nightstand(B, M, x, z, ry) {
  const add = (geo, mat) => B.add(at(geo, x, 0, z, ry), mat);
  add(at(rbox(0.55, 0.5, 0.42, 0.01), 0, 0.27, 0), M.woodMid);
  add(at(rbox(0.5, 0.004, 0.005, 0.001, 1), 0, 0.3, 0.212), M.blackMatte);
  for (const [u, v] of [[-0.24, -0.17], [0.24, -0.17], [-0.24, 0.17], [0.24, 0.17]]) add(at(rbox(0.025, 0.03, 0.025, 0.004, 1), u, 0.015, v), M.blackMatte);
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
      sh.add(at(lathe([[0, 0], [r0 * 0.6, 0], [r0, h * 0.4], [r0 * 0.5, h * 0.85], [r0 * 0.55, h], [0, h]], 24), u + (rnd() - 0.5) * cw * 0.4, y, 0), rnd() < 0.5 ? M.ceramic : M.stoneBlack);
    } else if (k < 0.75) {    // a bowl
      bowlGeo(sh, M, u, y, 0, 0.08 + rnd() * 0.05);
    }
  }
}
function bowlGeo(sh, M, x, y, z, r) {
  sh.add(at(lathe([[0, 0], [r * 0.45, 0], [r * 0.8, r * 0.25], [r, r * 0.55], [r * 0.97, r * 0.56], [r * 0.77, r * 0.28], [r * 0.4, r * 0.06], [0, r * 0.06]], 32), x, y, z), M.ceramic);
}

// curved bouclé sofa (apartment-09 / -02): an arc of seat and back, rounded ends.
// centred on (x, z), arc radius R (to the seat front), sweep sw, facing the arc centre (ry: the
// direction the middle of the sofa faces)
function curvedSofa(B, M, x, z, ry, R = 2.2, sw = 1.1, D = 0.95) {
  const seg = 28;
  // the arc's centre lies in front of the sofa (on the side it faces)
  const cx = x + Math.sin(ry) * R, cz = z + Math.cos(ry) * R, mid = ry + Math.PI;
  const a0 = mid - sw / 2, a1 = mid + sw / 2;
  const add = (g, m) => B.add(at(g, cx, 0, cz), m);
  // seat block, back roll, plinth
  add(rboxArc(R - 0.02, R + D - 0.22, 0.08, 0.44, a0, a1, 0.06, seg), M.boucle);
  add(rboxArc(R + D - 0.3, R + D, 0.08, 0.76, a0 - 0.02, a1 + 0.02, 0.1, seg), M.boucle);
  add(rboxArc(R + 0.05, R + D - 0.05, 0.0, 0.08, a0 + 0.02, a1 - 0.02, 0.01, seg), M.blackMatte);
  // two lumbar pillows
  for (const k of [-0.25, 0.25]) { const a = mid + k * sw; add(at(cushion(0.45, 0.4, 0.13, 0.07, 0.05), Math.sin(a) * (R + D - 0.38), 0.62, Math.cos(a) * (R + D - 0.38), a + Math.PI, -0.25), M.boucle); }
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (i + 0.5) / n;
    B.colliders.push({ t: 'obox', c: [cx + Math.sin(a) * (R + D / 2), 0.38, cz + Math.cos(a) * (R + D / 2)], h: [(R + D / 2) * (a1 - a0) / n / 2, 0.38, D / 2], yaw: a, mat: M.boucle });
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
  let sd = 5; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  for (let i = 0; i < 70; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, rr = Math.sqrt(1 - u * u), R = 0.3;
    const d = new THREE.Vector3(rr * Math.cos(a), u * 0.75, rr * Math.sin(a));
    const g = new THREE.CircleGeometry(0.07 + rnd() * 0.03, 12).toNonIndexed();
    g.lookAt(d); g.translate(d.x * R, yc + d.y * R, d.z * R);
    B.add(at(g, x, 0, z), M.goldLeaf);
  }
  B.add(at(lathe([[0.006, yc], [0.006, ceil]], 8), x, 0, z), M.brass);
}

// framed print / art on a wall: tex is a canvas texture; face as painting()
function print(B, M, x, y, z, w, h, face, mat) {
  const ry = { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': 0, '-z': Math.PI }[face];
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
function kitchenRun(B, M, x, z, ry, L, { uppers = true, sink = null } = {}) {
  const add = (g, m) => B.add(at(g, x, 0, z, ry), m);
  const D = 0.62, H = 0.89;
  add(at(rbox(L, 0.1, D - 0.08, 0.002, 1), 0, 0.05, -0.04), M.blackMatte);
  add(at(rbox(L, H - 0.1, D - 0.04, 0.002, 1), 0, 0.1 + (H - 0.1) / 2, -0.02), M.woodDark);
  const n = Math.max(1, Math.round(L / 0.6)), w = L / n;
  for (let i = 0; i < n; i++) {
    add(at(rbox(w - 0.004, 0.42, 0.02, 0.002, 1), -L / 2 + w * (i + 0.5), 0.33, D / 2 - 0.01), M.woodDark);
    add(at(rbox(w - 0.004, 0.24, 0.02, 0.002, 1), -L / 2 + w * (i + 0.5), 0.7, D / 2 - 0.01), M.woodDark);
  }
  for (const yy of [0.565, H - 0.035]) add(at(rbox(L, 0.03, 0.012, 0.001, 1), 0, yy, D / 2 - 0.022), M.blackMatte);   // recessed pull channels
  add(at(rbox(L, 0.03, D + 0.02, 0.003, 1), 0, H + 0.015, 0.01), M.stone);
  add(at(rbox(L, 0.58, 0.015, 0.002, 1), 0, H + 0.03 + 0.29, -D / 2 + 0.008), M.stone);
  if (uppers) for (let i = 0; i < n; i++) add(at(rbox(w - 0.004, 0.86, 0.35, 0.003, 1), -L / 2 + w * (i + 0.5), 1.5 + 0.43, -D / 2 + 0.175), M.lacquerWhite);
  if (sink != null) {
    add(at(rbox(0.62, 0.004, 0.4, 0.004, 1), sink, H + 0.031, 0.02), M.sinkDark);
    add(at(lathe([[0.022, 0], [0.018, 0.04], [0.013, 0.3]], 16), sink, H + 0.03, -0.22), M.nickel);
    const arc = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10 * Math.PI; arc.push([sink, H + 0.33 + Math.sin(t) * 0.1, -0.22 + (1 - Math.cos(t)) * 0.11]); }
    add(tubeGeo(arc, 0.011), M.nickel);
  }
  B.colliders.push({ t: 'obox', c: [x, H / 2, z], h: [L / 2, H / 2 + 0.02, D / 2], yaw: ry, mat: M.woodDark });
}
function tubeGeo(pts, r) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, pts.length * 3, r, 10, false).toNonIndexed();
  return metricUV(g);
}
// tall units: integrated fridge / pantry panels or an oven stack (two ovens)
function tallUnit(B, M, x, z, ry, W, H, ovens = false) {
  const add = (g, m) => B.add(at(g, x, 0, z, ry), m);
  const D = 0.62;
  add(at(rbox(W, H, D - 0.02, 0.003, 1), 0, H / 2, -0.01), M.woodDark);
  if (ovens) {
    for (const yy of [0.95, 1.55]) {
      add(at(rbox(W - 0.04, 0.56, 0.02, 0.004, 1), 0, yy + 0.28, D / 2), M.steel);
      add(at(rbox(W - 0.12, 0.36, 0.006, 0.004, 1), 0, yy + 0.25, D / 2 + 0.012), M.tvGlass);
      add(at(rbox(W - 0.16, 0.016, 0.02, 0.008, 1), 0, yy + 0.49, D / 2 + 0.03), M.steel);
    }
  } else {
    const n = Math.max(1, Math.round(W / 0.6));
    for (let i = 0; i < n; i++) add(at(rbox(W / n - 0.004, H - 0.12, 0.02, 0.002, 1), -W / 2 + W / n * (i + 0.5), (H - 0.12) / 2 + 0.1, D / 2), M.woodDark);
    for (let i = 0; i < n; i++) add(at(rbox(0.012, H * 0.6, 0.02, 0.006, 1), -W / 2 + W / n * (i + 0.5) + (i % 2 ? -1 : 1) * (W / n / 2 - 0.05), H * 0.5, D / 2 + 0.02), M.steel);
  }
  B.colliders.push({ t: 'obox', c: [x, H / 2, z], h: [W / 2, H / 2, D / 2], yaw: ry, mat: M.woodDark });
}
// oval dark oak breakfast table and an upholstered banquette (apartment-14)
function ovalTable(B, M, x, z, ry, L = 1.9, W = 1.05) {
  const top = lathe([[0, 0.72], [0.5, 0.72], [0.5, 0.75], [0.49, 0.755], [0, 0.755]], 48); top.scale(L, 1, W);
  B.add(at(top, x, 0, z, ry), M.woodDark);
  for (const v of [-0.45, 0.45]) { const p = lathe([[0, 0], [0.22, 0], [0.12, 0.05], [0.09, 0.7], [0.15, 0.72], [0, 0.72]], 24); p.scale(1, 1, 0.7); B.add(at(p, x + Math.cos(ry) * v * L * 0.6, 0, z - Math.sin(ry) * v * L * 0.6), M.woodDark); }
  B.colliders.push({ t: 'obox', c: [x, 0.38, z], h: [L / 2, 0.38, W / 2], yaw: ry, mat: M.woodDark });
}
function banquette(B, M, x, z, ry, L) {
  const add = (g, m) => B.add(at(g, x, 0, z, ry), m);
  add(at(rbox(L - 0.06, 0.1, 0.5, 0.004), 0, 0.05, 0.0), M.blackMatte);
  add(at(rbox(L, 0.3, 0.56, 0.03), 0, 0.25, 0), M.boucleTaupe);
  add(at(cushion(L - 0.02, 0.1, 0.52, 0.04, 0.012), 0, 0.44, 0.01), M.boucleTaupe);
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
function vanity(B, M, x, y, z, ry, L, top, body, basins = [0]) {
  const add = (g, m) => B.add(at(g, x, y, z, ry), m);
  const D = 0.56, H = 0.86;
  add(at(rbox(L, H - 0.12, D - 0.02, 0.004, 1), 0, 0.12 + (H - 0.12) / 2, -0.01), body);
  add(at(rbox(L - 0.04, 0.12, D - 0.06, 0.002, 1), 0, 0.06, -0.03), M.blackMatte);          // recessed toe kick
  // drawer fronts: columns per basin, two drawers each, 3 mm gaps, slim bronze pulls
  const cols = Math.max(1, basins.length), cw = L / cols;
  for (let c = 0; c < cols; c++) for (const [y0, y1] of [[0.12, 0.5], [0.503, H - 0.003]]) {
    const u = -L / 2 + cw * (c + 0.5);
    add(at(rbox(cw - 0.003, y1 - y0 - 0.003, 0.02, 0.002, 1), u, (y0 + y1) / 2, D / 2 - 0.01), body);
    add(at(rbox(0.16, 0.012, 0.012, 0.005, 1), u, y1 - 0.045, D / 2 + 0.008), M.bronzeLight);
  }
  add(at(rbox(L + 0.02, 0.04, D + 0.02, 0.004, 1), 0, H + 0.02, 0.01), top);
  for (const u of basins) {
    add(at(rbox(0.46, 0.004, 0.32, 0.004, 1), u, H + 0.041, 0.04), M.enamel);
    add(at(lathe([[0.016, 0], [0.012, 0.22]], 12), u, H + 0.04, -D / 2 + 0.06), M.bronzeLight);
    add(tubeGeo([[u, H + 0.26, -D / 2 + 0.06], [u, H + 0.28, -D / 2 + 0.12], [u, H + 0.24, -D / 2 + 0.18]], 0.009), M.bronzeLight);
    add(at(rbox(0.6, 0.9, 0.012, 0.004, 1), u, H + 0.62, -D / 2 - 0.01), M.mirror);
    add(at(rbox(0.012, 0.9, 0.02, 0.004, 1), u - 0.31, H + 0.62, -D / 2), M.ledStrip);
    add(at(rbox(0.012, 0.9, 0.02, 0.004, 1), u + 0.31, H + 0.62, -D / 2), M.ledStrip);
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
  add(at(cushion(0.37, 0.035, 0.55, 0.05, 0.006), 0, 0.43, 0.29), M.enamel);
  add(at(rbox(0.22, 0.14, 0.012, 0.01), 0, 1.02, 0.006), M.flushPlate);
}

// a free-form mirror on a wall (apartment-06): an organic outline, thin bronze edge
function blobMirror(B, M, x, y, z, w, h, face) {
  const ry = { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': 0, '-z': Math.PI }[face];
  const sh = new THREE.Shape();
  for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, k = 1 + 0.09 * Math.sin(a * 3 + 0.7) + 0.05 * Math.cos(a * 5); const px = Math.cos(a) * w / 2 * k, py = Math.sin(a) * h / 2 * k; if (i) sh.lineTo(px, py); else sh.moveTo(px, py); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 2, curveSegments: 48 }).toNonIndexed();
  metricUV(g); B.add(at(g, x, y, z, ry), M.mirror);
}
// dark wood console (apartment-06)
function console_(B, M, x, z, ry, L = 1.6) {
  const add = (g, m) => B.add(at(g, x, 0, z, ry), m);
  add(at(rbox(L, 0.05, 0.4, 0.008), 0, 0.8, 0), M.woodDark);
  for (const u of [-1, 1]) add(at(rbox(0.05, 0.78, 0.4, 0.006), u * (L / 2 - 0.025), 0.39, 0), M.woodDark);
  add(at(rbox(L - 0.1, 0.02, 0.36, 0.004), 0, 0.2, 0), M.woodDark);
  B.colliders.push({ t: 'obox', c: [x, 0.42, z], h: [L / 2, 0.42, 0.2], yaw: ry, mat: M.woodDark });
}

// ---- the painting's texture ----------------------------------------------------------------
function paintingTexture() {
  const W = 1024, H = 800, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  c.fillStyle = '#ebe6da'; c.fillRect(0, 0, W, H);
  // soft grounds
  const blob = (x, y, rx, ry, col, a) => { c.save(); c.globalAlpha = a; c.fillStyle = col; c.beginPath();
    for (let i = 0; i <= 40; i++) { const t = i / 40 * Math.PI * 2, k = 1 + 0.12 * Math.sin(t * 3 + rnd() * 2) + 0.06 * Math.sin(t * 7); c.lineTo(x + Math.cos(t) * rx * k, y + Math.sin(t) * ry * k); }
    c.fill(); c.restore(); };
  blob(330, 520, 300, 170, '#e7cf8c', 0.95);
  blob(690, 420, 220, 260, '#3f7a63', 0.9);
  blob(560, 290, 150, 120, '#1c1c1a', 0.92);
  blob(820, 240, 130, 110, '#9fc6c1', 0.85);
  blob(240, 250, 140, 90, '#c9d7cf', 0.8);
  blob(470, 640, 120, 70, '#d9b45e', 0.85);
  // gestural lines
  c.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    c.strokeStyle = ['#1c1c1a', '#f4f1e8', '#b8892e', '#2e5f4c'][k % 4]; c.globalAlpha = 0.85; c.lineWidth = 3 + rnd() * 9;
    c.beginPath(); let x = rnd() * W, y = rnd() * H; c.moveTo(x, y);
    for (let i = 0; i < 6; i++) { const nx = x + (rnd() - 0.5) * 360, ny = y + (rnd() - 0.5) * 260; c.quadraticCurveTo(x + (rnd() - 0.5) * 200, y + (rnd() - 0.5) * 200, nx, ny); x = nx; y = ny; }
    c.stroke();
  }
  // canvas weave and brush texture
  const img = c.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, n = ((x % 3) === 0 ? -6 : 0) + ((y % 3) === 0 ? -6 : 0) + (rnd() - 0.5) * 10;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
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
  const W = 1024, H = 1024, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  let s = 23; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  c.fillStyle = '#e4dfd6'; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(120,116,110,0.55)'; c.lineCap = 'round';
  for (let k = 0; k < 220; k++) { c.lineWidth = 2 + rnd() * 6; c.beginPath(); const x = rnd() * W, y = rnd() * H, a = (rnd() < 0.5 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.25, L = 30 + rnd() * 160; c.moveTo(x, y); c.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); c.stroke(); }
  const img = c.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 4, 1 / 4); return t;
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
  M.canvas = new THREE.MeshStandardMaterial({ map: paintingTexture(), roughness: 0.85 });
  const tl = new THREE.TextureLoader(), dir = './textures/scans/' + (Q.quest ? 'quest/' : '');
  const lmap = tl.load(dir + 'leaf_ficus_diff.webp'); lmap.colorSpace = THREE.SRGBColorSpace; lmap.anisotropy = 4;
  const lnor = tl.load(dir + 'leaf_ficus_nor.webp'); lnor.anisotropy = 4;
  M.leaf = new THREE.MeshStandardMaterial({ map: lmap, normalMap: lnor, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.42 });
  M.bark = new THREE.MeshStandardMaterial({ color: '#7a6c5c', roughness: 0.8 });
  M.potStone = M.creamStone.clone(); M.potStone.color = new THREE.Color('#77706a');
  M.moss = new THREE.MeshStandardMaterial({ color: '#3f4a2a', roughness: 1 });
  M.wallRug = new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 0.95, side: THREE.DoubleSide });
  M.ceramic = phys({ color: '#f1eee8', roughness: 0.35 }, { clearcoat: 0.6, clearcoatRoughness: 0.15 });
  M.bookCream = new THREE.MeshStandardMaterial({ color: '#d9cfbf', roughness: 0.7 });
  M.bookGrey = new THREE.MeshStandardMaterial({ color: '#8a8580', roughness: 0.7 });
  M.bookBlack = new THREE.MeshStandardMaterial({ color: '#1d1c1b', roughness: 0.6 });
  M.duvet = M.linen.clone(); M.duvet.color = new THREE.Color('#ece5da');
  M.throwSand = M.linen.clone(); M.throwSand.color = new THREE.Color('#c9b39a');
  M.nickel = new THREE.MeshStandardMaterial({ color: '#c4c0b9', metalness: 1, roughness: 0.04 });
  M.crystal = new THREE.MeshStandardMaterial({ color: '#e9eef2', metalness: 0.6, roughness: 0.04, transparent: true, opacity: 0.75, depthWrite: false });
  M.crystal.userData = { shadow: 'cast', order: 6 };
  M.goldLeaf = new THREE.MeshStandardMaterial({ color: '#c8a35a', metalness: 1, roughness: 0.28, side: THREE.DoubleSide });
  M.tvGlass = phys({ color: '#050607', roughness: 0.08 }, { clearcoat: 1, clearcoatRoughness: 0.02 });
  M.lineArt1 = new THREE.MeshStandardMaterial({ map: lineArtTexture(3), roughness: 0.9 });
  M.lineArt2 = new THREE.MeshStandardMaterial({ map: lineArtTexture(17), roughness: 0.9 });
  M.shardArt = new THREE.MeshStandardMaterial({ map: shardTexture(), roughness: 0.8 });
  M.bedRug = new THREE.MeshStandardMaterial({ map: bedroomRugTexture(), roughness: 1 });
  M.lacquerWhite = phys({ color: '#ece7de', roughness: 0.3 }, { clearcoat: 0.8, clearcoatRoughness: 0.08 });
  M.steel = new THREE.MeshStandardMaterial({ color: '#b9b7b2', metalness: 1, roughness: 0.28 });
  M.sinkDark = new THREE.MeshStandardMaterial({ color: '#2a2a29', metalness: 0.6, roughness: 0.35 });
  M.enamel = phys({ color: '#f6f4ef', roughness: 0.12 }, { clearcoat: 1, clearcoatRoughness: 0.04 });
  M.mirror = new THREE.MeshStandardMaterial({ color: '#f2f2f2', metalness: 1, roughness: 0.015 });
  M.ledStrip = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffe6c4', emissiveIntensity: 1.6, roughness: 0.5 });
  M.ledStrip.userData = { shadow: 'none' };
  M.flushPlate = new THREE.MeshStandardMaterial({ color: '#d8d8d6', metalness: 0.4, roughness: 0.25 });
  M.settingBed = new THREE.MeshStandardMaterial({ color: '#4a4540', roughness: 0.9 });
  M.sheer = M.linen.clone(); M.sheer.transparent = true; M.sheer.opacity = 0.5; M.sheer.depthWrite = false; M.sheer.userData = { shadow: 'none', order: 4 };
}

// ---- the rooms ---------------------------------------------------------------------------------
export function furnish(M, Q) {
  furnitureMaterials(M, Q);
  M_BED = M.settingBed;
  const B = new Builder();
  const group = new THREE.Group(); group.name = 'furniture';
  const ceil = 4.2;

  // great hall, living area (apartment-19 / -20): sofas either side of the north-south axis
  // through the centre window bay, two coffee tables between, a big cream rug, three smoked
  // glass pendants over it
  rug(B, M, 8.8, 3.55, 4.6, 3.7);
  sofa(B, M, 7.0, 3.55, Math.PI / 2);
  sofa(B, M, 10.6, 3.55, -Math.PI / 2);
  coffeeTable(B, M, 8.55, 2.95, 0.05);
  coffeeTable(B, M, 9.05, 4.15, -0.04);
  for (const [px, s] of [[7.7, 1], [8.8, 2], [9.9, 3]]) pendant(B, M, px, 3.55, 2.35 + 0.15 * (s % 2), ceil, s);
  for (const sx of [6.3, 11.3]) { sideTable(B, M, sx, 1.0); tableLamp(B, M, sx, 0.55, 1.0); }
  bowl(B, M, 8.45, 0.4, 2.85, 0.17);
  books(B, M, 8.75, 0.4, 3.15, 0.3);
  books(B, M, 9.15, 0.4, 4.05, -0.4, 2);

  // piano corner, west end (apartment-18 / -19): the grand on its own rug, a lamp beside it
  rug(B, M, 2.75, 3.9, 3.0, 2.6, 0);
  piano(B, M, 2.6, 4.3, 0.55);
  floorLamp(B, M, 1.5, 1.9);
  wallRug(B, M, 0.905, 4.0, 1.5, 2.5, 0.75, '+x');
  figTree(B, M, 1.5, 5.9);
  armchair(B, M, 1.0, 0.95, 2.4); armchair(B, M, 2.25, 0.85, 3.6);
  armchair(B, M, 16.5, 1.0, -2.4);
  // curtains bunched at the columns and the corner glass (apartment-20)
  for (const [a, b] of [[0.25, 0.75], [3.8, 4.25], [5.63, 6.08], [11.55, 12.0], [13.4, 13.85], [16.85, 17.35]]) curtain(B, M, a, b, 0.16, 3.81);

  // dining end, east of the columns (apartment-17): travertine table for eight, bouclé shell
  // chairs, two leaf chandeliers, an abstract canvas between the slot windows, two plinths
  diningTable(B, M, 14.75, 3.6, 0);
  for (const zz of [2.75, 3.6, 4.45]) { diningChair(B, M, 14.0, zz, Math.PI / 2); diningChair(B, M, 15.5, zz, -Math.PI / 2); }
  diningChair(B, M, 14.75, 2.05, 0); diningChair(B, M, 14.75, 5.15, Math.PI);
  chandelier(B, M, 14.75, 3.0, 2.0, ceil);
  chandelier(B, M, 14.75, 4.2, 2.0, ceil);
  painting(B, M, 16.69, 1.75, 4.0, 1.6, 1.25, '-x');
  plinth(B, M, 13.95, 0.9 + 0.45, 0.42, 1.05, M.woodLight);
  plinth(B, M, 16.3, 6.25, 0.34, 1.15, M.creamStone);

  // ---- floor two ---------------------------------------------------------------------------
  const F2 = 4.6, C2c = 8.2, L1v = 0, DH1v = 2.74;
  const up = (fn) => { const B0 = new Builder(); fn(B0); for (const [mat, list] of B0.buckets) for (const g of list) B.add(g.translate(0, F2, 0), mat); for (const c of B0.colliders) { if (c.t === 'obox') c.c[1] += F2; else { c.min[1] += F2; c.max[1] += F2; } B.colliders.push(c); } };
  // primary bedroom (apartment-10): bed head against the east wall, the park ahead at the north
  // glass, lounge chairs at the west glass, patterned rug, beaded chandelier, two line prints
  up((b) => {
    rugPlain(b, M.bedRug, 10.0, 3.8, 4.4, 3.8);
    bed(b, M, 11.3, 3.8, -Math.PI / 2);
    nightstand(b, M, 12.3, 2.45, -Math.PI / 2); nightstand(b, M, 12.3, 5.15, -Math.PI / 2);
    tableLamp(b, M, 12.3, 0.53, 2.45); tableLamp(b, M, 12.3, 0.53, 5.15);
    armchair(b, M, 6.3, 2.2, 2.3); armchair(b, M, 7.6, 5.4, -2.6);
    sideTable(b, M, 6.0, 3.3, 0.22, 0.5);
    print(b, M, 12.61, 2.35, 3.2, 0.5, 0.62, '-x', M.lineArt1); print(b, M, 12.61, 2.3, 4.4, 0.42, 0.52, '-x', M.lineArt2);
  });
  beadChandelier(B, M, 9.7, 3.8, F2 + 2.15, C2c);
  // library (apartment-09): bleached oak shelving on the south wall, the abstract on the west
  // partition, curved bouclé sofa facing the north glass, round travertine table, armchair and
  // lamp at the corner, gold leaf chandelier
  up((b) => {
    const sh = shelving(b, M, 14.75, 6.5, Math.PI, 3.6, 3.1, 0.4, M.woodLight, 4, 5);
    shelfDecor(b, M, sh, 14.75, 6.5, Math.PI, 3.6, 3.1, 0.4, 7);
    rugPlain(b, M.rug, 14.8, 3.6, 3.2, 3.4);
    curvedSofa(b, M, 14.8, 4.85, Math.PI, 2.4, 0.95);
    roundTable(b, M, 14.8, 3.45, 0.5, 0.36);
    books(b, M, 14.75, 0.36, 3.4, 0.2, 2); bowl(b, M, 15.0, 0.36, 3.7, 0.12);
    armchair(b, M, 13.55, 1.75, 0.7);
    sideTable(b, M, 13.15, 0.95, 0.22, 0.55); tableLamp(b, M, 13.15, 0.55, 0.95);
    print(b, M, 12.79, 1.8, 3.6, 1.05, 1.4, '+x', M.shardArt);
  });
  goldChandelier(B, M, 14.8, 3.5, F2 + 2.75, C2c);

  // ---- media room, floor one (apartment-13): dark oak media wall with the TV on the north wall,
  // curvy bouclé sofa facing it from the glass, a lounge chair, rug, lamp, a print on the west wall
  {
    const sh = shelving(B, M, 5.4, 14.7, 0, 2.8, 3.3, 0.42, M.woodDark, 3, 4);
    shelfDecor(B, M, sh, 5.4, 14.7, 0, 2.8, 3.3, 0.42, 21);
    tv(B, M, 5.4, 1.55, 14.93, 0);
    rugPlain(B, M.rug, 4.6, 16.0, 3.4, 2.4);
    curvedSofa(B, M, 4.4, 16.75, Math.PI, 2.2, 0.85, 0.9);
    armchair(B, M, 6.4, 16.3, -2.5);
    sideTable(B, M, 1.45, 15.1, 0.22, 0.5); tableLamp(B, M, 1.45, 0.5, 15.1);
    print(B, M, 0.91, 1.75, 15.9, 1.0, 1.25, '+x', M.lineArt2);
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
    nightstand(b, M, 16.27, 14.88, -Math.PI / 2); nightstand(b, M, 16.27, 17.12, -Math.PI / 2);
    tableLamp(b, M, 16.27, 0.53, 17.12);
    console_(b, M, 11.6, 14.72, 0, 1.5);
    print(b, M, 11.2, 1.55, 14.49, 0.42, 0.52, '+z', M.lineArt1);
    print(b, M, 12.0, 1.55, 14.49, 0.42, 0.52, '+z', M.lineArt2);
    curtain(b, M, 10.1, 16.6, 17.43, 3.29, 20, M.sheer);
  });
  blobMirror(B, M, 10.45, F2 + 1.55, 14.495, 0.7, 1.0, '+z');

  // upper landing (apartment-11): a bust on a travertine plinth by the tall door; foot of the
  // stair (apartment-12): a bronze drum table
  up((b) => { plinth(b, M, 9.95, 7.35, 0.36, 1.1, M.creamStone); });
  B.add(at(lathe([[0, 0], [0.24, 0], [0.25, 0.02], [0.25, 0.46], [0.24, 0.48], [0, 0.48]], 40), 9.45, 0, 13.4), M.bronzeLight);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; B.add(at(rbox(0.012, 0.42, 0.008, 0.003, 1), 9.45 + Math.sin(a) * 0.252, 0.24, 13.4 + Math.cos(a) * 0.252, a), M.bronzeLight); }
  B.colliders.push({ t: 'obox', c: [9.45, 0.24, 13.4], h: [0.25, 0.24, 0.25], yaw: 0, mat: M.bronzeLight });

  // ---- kitchen, floor one (apartment-15): galley from the passage south to the glass; base run
  // with sink on the east wall, white uppers, an oven stack; tall integrated fridge / pantry
  // units on the west wall
  kitchenRun(B, M, 16.39, 13.0, -Math.PI / 2, 4.6, { sink: -0.4 });
  tallUnit(B, M, 16.39, 10.35, -Math.PI / 2, 0.66, 2.35, true);
  tallUnit(B, M, 13.65, 11.4, Math.PI / 2, 2.4, 2.35);
  kitchenRun(B, M, 13.65, 13.35, Math.PI / 2, 1.5, { uppers: false });
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
  vanity(B, M, 4.52, F2, 3.4, -Math.PI / 2, 2.4, M.onyx, M.lacquerWhite, [-0.6, 0.6]);
  // second bath (floor two, vein-cut travertine): tub, vanity in dark oak, wall-hung toilet
  clad(B, M.travertine, [
    ['z', 3.46, 9.75, 14.33, F2, C2c, 1], ['z', 6.03, 9.75, 14.33, F2, C2c, -1],
    ['x', 9.75, 3.46, 6.03, F2, C2c, 1],
    ['x', 14.33, 3.46, 4.0, F2, C2c, -1], ['x', 14.33, 4.8, 6.03, F2, C2c, -1], ['x', 14.33, 4.0, 4.8, F2 + 2.44, C2c, -1],
  ], 0.016, [0.6, 1.2]);
  vanity(B, M, 5.74, F2, 10.9, -Math.PI / 2, 1.0, M.creamStone, M.woodDark);
  toilet(B, M, 3.476, F2, 12.0, Math.PI / 2);
  builtInTub(B, M, 3.48, 12.55, 4.3, 14.31, F2, M.travertine);
  // third bath (floor two, grey marble to chair height, as apartment-05)
  clad(B, M.marbleGrey, [
    ['x', 6.92, 14.75, 16.7, F2, F2 + 1.2, 1], ['x', 9.6, 14.75, 16.7, F2, F2 + 1.2, -1],
    ['z', 14.75, 6.92, 7.5, F2, F2 + 1.2, 1], ['z', 14.75, 8.35, 9.6, F2, F2 + 1.2, 1],
    ['z', 16.7, 6.92, 7.9, F2, F2 + 1.2, -1], ['z', 16.7, 8.5, 9.6, F2, F2 + 1.2, -1],
  ], 0.016, [0.6, 0.6]);
  vanity(B, M, 16.42, F2, 8.9, -Math.PI / 2, 0.9, M.marbleGrey, M.woodMid);
  // powder room (floor one, grey marble)
  clad(B, M.marbleGrey, [
    ['z', 6.18, 12.95, 14.18, L1v, 3.0, 1], ['x', 12.95, 6.18, 7.81, L1v, 3.0, 1], ['x', 14.18, 6.18, 7.81, L1v, 3.0, -1],
    ['z', 7.81, 12.95, 13.25, L1v, 3.0, -1], ['z', 7.81, 14.05, 14.18, L1v, 3.0, -1], ['z', 7.81, 13.25, 14.05, DH1v - 0.2, 3.0, -1],
  ], 0.016, [0.6, 0.6]);
  vanity(B, M, 6.47, 0, 13.55, Math.PI / 2, 0.75, M.marbleGrey, M.woodDark);

  const meshes = B.finish(group);
  return { group, meshes, colliders: B.colliders, busts: [[13.95, 1.05, 1.35, -2.2], [16.3, 1.15, 6.25, -1.2], [9.95, 4.6 + 1.1, 7.35, -1.9]] };
}
