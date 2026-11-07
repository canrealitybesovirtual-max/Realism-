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
  const lw = 0.085;
  for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(at(rbox(lw, H - 0.02, lw, 0.006), u * (S / 2 - lw / 2), (H - 0.02) / 2, v * (S / 2 - lw / 2)), M.woodLight);
  for (const v of [-1, 1]) add(at(rbox(S, 0.06, lw, 0.006), 0, H - 0.05, v * (S / 2 - lw / 2)), M.woodLight);
  for (const u of [-1, 1]) add(at(rbox(lw, 0.06, S - 2 * lw, 0.006), u * (S / 2 - lw / 2), H - 0.05, 0), M.woodLight);
  for (const v of [-1, 1]) add(at(rbox(S - 2 * lw, 0.04, 0.05, 0.004), 0, 0.09, v * (S / 2 - lw / 2)), M.woodLight);   // low stretchers
  add(at(rbox(S - 0.03, 0.015, S - 0.03, 0.004), 0, H - 0.0075, 0), M.smoke);
  B.colliders.push({ t: 'obox', c: [x, H / 2, z], h: [S / 2, H / 2, S / 2], yaw: ry, mat: M.woodLight });
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
    const f = 1 + 0.16 * Math.sin(n.x * 3.1 + r(1) * 6) * Math.cos(n.z * 2.7 + r(2) * 6) + 0.1 * Math.sin(n.y * 4 + r(3) * 6);
    v.multiplyScalar(f); v.y *= 1.25; p.setXYZ(i, v.x, v.y, v.z);
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

// bouclé dining chair: rounded shell back wrapping into the arms, plump seat, black tapered legs
function diningChair(B, M, x, z, ry) {
  const add = (geo, mat) => B.add(at(geo, x, 0, z, ry), mat);
  add(at(cushion(0.5, 0.11, 0.48, 0.05, 0.015), 0, 0.47, 0.02), M.boucle);
  // shell: a band of a squashed cylinder behind and round the seat
  const a0 = Math.PI * 0.3, aL = Math.PI * 1.4;      // open at the front (+z)
  const shell = new THREE.CylinderGeometry(0.27, 0.25, 0.36, 40, 6, true, a0, aL).toNonIndexed();
  shell.scale(1, 1, 0.9);
  const thick = new THREE.CylinderGeometry(0.235, 0.215, 0.36, 40, 6, true, a0, aL).toNonIndexed();
  thick.scale(1, 1, 0.9);
  // inside face: flip winding
  const ip = thick.attributes.position.array;
  for (let i = 0; i < ip.length; i += 9) for (let k = 0; k < 3; k++) { const t = ip[i + 3 + k]; ip[i + 3 + k] = ip[i + 6 + k]; ip[i + 6 + k] = t; }
  smooth(thick);
  for (const gg of [shell, thick]) { metricUV(gg); add(at(gg, 0, 0.7, -0.02), M.boucle); }
  add(at(lathe([[0.235, 0.88], [0.255, 0.888], [0.27, 0.88]], 40, a0, aL).scale(1, 1, 0.9), 0, 0, -0.02), M.boucle);
  for (const [u, v] of [[-0.2, 0.2], [0.2, 0.2], [-0.2, -0.18], [0.2, -0.18]]) {
    const leg = lathe([[0.008, 0], [0.012, 0.2], [0.016, 0.42]], 10);
    leg.rotateX(v > 0 ? 0.08 : -0.08); leg.rotateZ(u > 0 ? -0.06 : 0.06);
    add(at(leg, u, 0, v), M.blackMatte);
  }
  B.colliders.push({ t: 'obox', c: [x, 0.42, z], h: [0.27, 0.42, 0.26], yaw: ry, mat: M.boucle });
}

// tiered chandelier of hanging glass leaves (apartment-17): rings of leaves on a brass frame
function chandelier(B, M, x, z, yBottom, ceil) {
  const tiers = 5, H = 1.0, R = 0.26;
  for (let t = 0; t < tiers; t++) {
    const y = yBottom + H * (t / tiers), r = R * (0.92 + 0.08 * t / tiers);
    const n = 30;
    B.add(at(lathe([[r, y + H / tiers - 0.004], [r + 0.006, y + H / tiers]], 40), x, 0, z), M.brass);
    for (let i = 0; i < n; i++) {
      const a = (i + (t % 2) * 0.5) / n * Math.PI * 2;
      const leaf = new THREE.PlaneGeometry(0.07, H / tiers + 0.04).toNonIndexed();
      leaf.rotateX(0.12); leaf.rotateY(a);
      B.add(at(leaf, x + Math.sin(a) * r, y + H / tiers / 2 - 0.01, z + Math.cos(a) * r), M.leafGlass);
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
function curtain(B, M, x0, x1, z, yTop, folds = 7) {
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
  B.add(g, M.linen);
}

// fiddle-leaf fig in a big weathered stone pot (apartment-18 / -19): slender trunk, branches
// toward the top, broad leaves bunched at their ends
function figTree(B, M, x, z, seed = 3) {
  let sd = seed; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  B.add(at(lathe([[0, 0], [0.2, 0], [0.24, 0.03], [0.3, 0.3], [0.36, 0.52], [0.37, 0.56], [0.34, 0.56], [0.33, 0.53], [0, 0.53]], 40), x, 0, z), M.potStone);
  B.add(at(lathe([[0, 0.535], [0.33, 0.535]], 30), x, 0, z), M.moss);
  const trunk = [[0, 0.53, 0], [0.02, 0.9, 0.01], [-0.02, 1.35, 0.03], [0.03, 1.8, -0.02], [0.0, 2.15, 0.02]];
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
  B.add(at(tube(trunk, 0.028, 0.012), x, 0, z), M.bark);
  const leaves = [];
  for (let b = 0; b < 11; b++) {
    const y0 = 1.25 + rnd() * 0.85, a = rnd() * Math.PI * 2, L = 0.25 + rnd() * 0.35;
    const base = [0.02 * Math.sin(y0 * 3), y0, 0.02 * Math.cos(y0 * 3)];
    const tip = [base[0] + Math.cos(a) * L, y0 + 0.15 + rnd() * 0.25, base[2] + Math.sin(a) * L];
    const mid = [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2 + 0.06, (base[2] + tip[2]) / 2];
    B.add(at(tube([base, mid, tip], 0.009, 0.004), x, 0, z), M.bark);
    const nl = 6 + Math.floor(rnd() * 6);
    for (let k = 0; k < nl; k++) {
      const t = 0.45 + 0.55 * k / nl, px = base[0] + (tip[0] - base[0]) * t, py = base[1] + (tip[1] - base[1]) * t + 0.05 * Math.sin(t * 3), pz = base[2] + (tip[2] - base[2]) * t;
      leaves.push([px, py, pz, a + (rnd() - 0.5) * 2.4, 0.16 + rnd() * 0.12]);
    }
  }
  for (const [px, py, pz, yaw, sz] of leaves) {
    // a leaf: two triangles folded along the midrib, drooping from its stalk
    const g = new THREE.BufferGeometry();
    const w = sz * 0.75, l = sz, fold = 0.25;
    const P = [0, 0, 0, w / 2, l * 0.55, -w * fold, 0, l, 0, 0, 0, 0, 0, l, 0, -w / 2, l * 0.55, -w * fold];
    const Uv = [0.5, 0, 1, 0.55, 0.5, 1, 0.5, 0, 0.5, 1, 0, 0.55];
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(Uv, 2));
    g.computeVertexNormals();
    g.rotateX(-0.9 - rnd() * 0.6); g.rotateY(yaw);
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

// fiddle-leaf fig leaf: broad violin shape, glossy mid green, pale veins; alpha outside
function leafTexture() {
  const W = 256, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, W, H);
  c.beginPath();
  c.moveTo(128, 250);
  c.bezierCurveTo(30, 230, 10, 120, 50, 70); c.bezierCurveTo(70, 40, 100, 10, 128, 6);
  c.bezierCurveTo(156, 10, 186, 40, 206, 70); c.bezierCurveTo(246, 120, 226, 230, 128, 250);
  const gr = c.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, '#3d6a2b'); gr.addColorStop(1, '#2c5320');
  c.fillStyle = gr; c.fill();
  c.strokeStyle = 'rgba(190,210,150,0.55)'; c.lineWidth = 3; c.beginPath(); c.moveTo(128, 250); c.lineTo(128, 12); c.stroke();
  c.lineWidth = 1.4;
  for (let i = 0; i < 9; i++) { const y = 220 - i * 23; for (const sgn of [-1, 1]) { c.beginPath(); c.moveTo(128, y); c.quadraticCurveTo(128 + sgn * 40, y - 18, 128 + sgn * 90, y - 40); c.stroke(); } }
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
    for (let k = 0; k < 3; k++) d[i + k] = d[i + k] * (0.82 + 0.18 * fade) + 40 * fade + n;
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
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
  M.leafGlass = new THREE.MeshStandardMaterial({ color: '#8f959b', roughness: 0.08, metalness: 0.55, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  M.leafGlass.userData = { shadow: 'cast', order: 6 };
  M.shade = M.linen.clone(); M.shade.color = new THREE.Color('#efe6d6');
  M.canvas = new THREE.MeshStandardMaterial({ map: paintingTexture(), roughness: 0.85 });
  M.leaf = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.45 });
  M.bark = new THREE.MeshStandardMaterial({ color: '#7a6c5c', roughness: 0.8 });
  M.potStone = M.creamStone.clone(); M.potStone.color = new THREE.Color('#77706a');
  M.moss = new THREE.MeshStandardMaterial({ color: '#3f4a2a', roughness: 1 });
  M.wallRug = new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 0.95, side: THREE.DoubleSide });
}

// ---- the rooms ---------------------------------------------------------------------------------
export function furnish(M, Q) {
  furnitureMaterials(M, Q);
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
  floorLamp(B, M, 11.55, 1.75);

  // piano corner, west end (apartment-18 / -19): the grand on its own rug, a lamp beside it
  rug(B, M, 2.75, 3.9, 3.0, 2.6, 0);
  piano(B, M, 2.6, 4.3, 0.55);
  floorLamp(B, M, 1.5, 1.9);
  wallRug(B, M, 0.905, 4.0, 1.5, 2.3, 0.6, '+x');
  figTree(B, M, 1.45, 5.95);
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

  const meshes = B.finish(group);
  return { group, meshes, colliders: B.colliders, busts: [[13.95, 1.05, 1.35, -2.2], [16.3, 1.15, 6.25, -1.2]] };
}
