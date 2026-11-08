// The apartment: a two-floor penthouse laid out from the reference floor plan (floor one) and
// the interior photos (floor two). See docs/references/REFERENCES.md and docs/DECISIONS.md.
// Architecture only: shell, walls, glass, columns, ceilings, floors, doors, the curved stair,
// the terrace. Furniture comes in a later pass.
//
// Plan frame: x east, z south, metres. Origin = the north-west corner of the floor plate at
// floor one level. North glass at z = 0, south glass at z = 17.55, terrace to z = 19.25.
import * as THREE from 'three';
import { Builder, boxGeo, flatGeo, shapeFlat, shellGeo, shellColliders, polar, tube } from './build.js';
import { lever as leverGeo, hinge as hingeGeo, mirrorZ, switchPlate } from './hw.js';

export const LV = { L1: 0, C1: 4.25, L2: 4.6, C2: 8.2, RF: 8.6 };
const { L1, C1, L2, C2, RF } = LV;
const XW = 0.9, XE = 16.7, XM = 17.6, ZS = 17.55, ZT = 19.25;
const DH1 = 2.74, DH2 = 2.44;                       // door heights: 9 ft on floor one, 8 ft on floor two
export const STAIR = { cx: 7.6, cz: 11.1, r0: 0.5, r1: 1.55, rw: 1.565, risers: 26, sweep: 330 * Math.PI / 180 };

export function buildApartment(M, Q) {
  const B = new Builder();
  // CQC (Q.cqc): every window pane is its own instance (one draw for all) with its own collider (c.pane), so the
  // game can shatter it; the long glass runs are cut at their mullions
  const PANES = [];
  if (Q && Q.cqc) {
    const box0 = B.box.bind(B);
    B.box = (x0, y0, z0, x1, y1, z1, mat, col = true) => {
      if (mat !== M.glass) return box0(x0, y0, z0, x1, y1, z1, mat, col);
      const mn = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], mx = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
      if (mx[0] - mn[0] < 1e-4 || mx[1] - mn[1] < 1e-4 || mx[2] - mn[2] < 1e-4) return;
      B.colliders.push({ t: 'box', min: mn, max: mx, mat, pane: PANES.length });
      PANES.push({ min: mn, max: mx });
    };
  }
  const group = new THREE.Group();
  group.name = 'apartment';

  // ---- helpers ----------------------------------------------------------------------------
  const skirt = (x0, z0, x1, z1, y, faces) => {
    // dark oak skirting, 10 cm tall, 1.2 cm proud, on the given faces of a box footprint
    const h = 0.1, t = 0.012;
    if (faces.includes('n')) B.box(x0, y, z0 - t, x1, y + h, z0, M.darkOak, false);
    if (faces.includes('s')) B.box(x0, y, z1, x1, y + h, z1 + t, M.darkOak, false);
    if (faces.includes('w')) B.box(x0 - t, y, z0, x0, y + h, z1, M.darkOak, false);
    if (faces.includes('e')) B.box(x1, y, z0, x1 + t, y + h, z1, M.darkOak, false);
  };
  const solid = (x0, z0, x1, z1, y0, y1, mat = M.plaster, sk = 'nsew') => {
    B.box(x0, y0, z0, x1, y1, z1, mat);
    if (sk) { skirt(x0, z0, x1, z1, y0, sk); if (y0 < L2 - 0.01 && y1 > L2 + 0.11) skirt(x0, z0, x1, z1, L2, sk); }
  };
  // A wall along x (axis 'x', thickness z0..z1) or along z (axis 'z', thickness x0..x1), from
  // s0 to s1, heights y0..y1, with openings {a, b, lo, hi, win}: the part of the wall between a
  // and b and heights lo..hi is left open; win puts a framed glass pane in it.
  const wall = (axis, t0, t1, s0, s1, y0, y1, ops = [], mat = M.plaster, floorY = y0) => {
    const cuts = new Set([s0, s1]);
    for (const o of ops) { cuts.add(o.a); cuts.add(o.b); }
    const xs = [...cuts].filter((v) => v >= s0 && v <= s1).sort((p, q) => p - q);
    const piece = (a, b, lo, hi) => {
      if (axis === 'x') B.box(a, lo, t0, b, hi, t1, mat); else B.box(t0, lo, a, t1, hi, b, mat);
      const sk = (y) => { if (axis === 'x') skirt(a, t0, b, t1, y, 'ns'); else skirt(t0, a, t1, b, y, 'we'); };
      if (lo <= floorY + 1e-3) sk(floorY);
      if (floorY < L2 - 0.01 && lo < L2 - 0.01 && hi > L2 + 0.11) sk(L2);
    };
    for (let k = 0; k < xs.length - 1; k++) {
      const a = xs[k], b = xs[k + 1], m = (a + b) / 2;
      const gaps = ops.filter((o) => o.a <= m && o.b >= m).map((o) => [o.lo, o.hi]).sort((p, q) => p[0] - q[0]);
      let y = y0;
      for (const [lo, hi] of gaps) { if (lo > y) piece(a, b, y, lo); y = Math.max(y, hi); }
      if (y < y1) piece(a, b, y, y1);
    }
    for (const o of ops) if (!o.win && o.lo <= floorY + 0.01 && o.hi - o.lo > 1.8) jamb(axis, t0, t1, o.a, o.b, o.lo, o.hi);
    for (const o of ops) if (o.win) {
      // glass near the outer face (o.win = outer side coordinate), bronze frame inside the reveal
      const g0 = o.win - 0.03, g1 = o.win + 0.03;
      ribbon(axis, o.win, (o.win - t0) < (t1 - o.win) ? -1 : 1, o.a, o.b, o.lo, o.hi);
      if (axis === 'x') {
        B.box(o.a, o.lo, Math.min(g0, g1), o.b, o.hi, Math.max(g0, g1), M.glass);
        frame('x', (g0 + g1) / 2, o.a, o.b, o.lo, o.hi);
      } else {
        B.box(Math.min(g0, g1), o.lo, o.a, Math.max(g0, g1), o.hi, o.b, M.glass);
        frame('z', (g0 + g1) / 2, o.a, o.b, o.lo, o.hi);
      }
    }
  };
  // door opening finish: lacquered liners on the jambs and head, slim casings on both faces
  // (proud of the skirting), a switch plate beside the latch side
  const jamb = (axis, t0, t1, a, b, lo, hi) => {
    const j = 0.022, c = 0.055, p = 0.018, L = M.doorWhite;
    const bx = (s0, s1, y0, y1, u0, u1) => { if (axis === 'x') B.box(s0, y0, u0, s1, y1, u1, L, false); else B.box(u0, y0, s0, u1, y1, s1, L, false); };
    bx(a, a + j, lo, hi, t0, t1); bx(b - j, b, lo, hi, t0, t1); bx(a, b, hi - j, hi, t0, t1);
    for (const [u0, u1] of [[t0 - p, t0], [t1, t1 + p]]) { bx(a - c, a, lo, hi + c, u0, u1); bx(b, b + c, lo, hi + c, u0, u1); bx(a - c, b + c, hi, hi + c, u0, u1); }
    // decorator switch on the t1 face, 1.1 m up, beside the casing
    const sw = switchPlate(), sx = b + c + 0.13, sy = lo + 1.1;
    for (const [k, m] of [['plate', L], ['rocker', L], ['body', M.blackMetal]]) {
      const g = sw[k];
      if (axis === 'x') g.translate(sx, sy, t1); else g.rotateY(Math.PI / 2).translate(t1, sy, sx);
      B.add(g, m);
    }
  };
  // the tower's bronze filigree: a curved ribbon outside every slot window
  const ribbon = (axis, wplane, out, a, b, lo, hi) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, e = t * t * (3 - 2 * t);
      const along = a + 0.07 + (b - a - 0.14) * e, off = wplane + out * (0.09 + 0.05 * Math.sin(Math.PI * t));
      const y = lo + 0.05 + (hi - lo - 0.1) * t;
      pts.push(axis === 'z' ? [off, y, along] : [along, y, off]);
    }
    B.add(tube(pts, 0.022, 6), M.bronze);
  };
  const frame = (axis, t, a, b, lo, hi, w = 0.05, d = 0.1) => {
    if (axis === 'x') {
      B.box(a, lo, t - d / 2, a + w, hi, t + d / 2, M.bronze, false);
      B.box(b - w, lo, t - d / 2, b, hi, t + d / 2, M.bronze, false);
      B.box(a, hi - w, t - d / 2, b, hi, t + d / 2, M.bronze, false);
      B.box(a, lo, t - d / 2, b, lo + w, t + d / 2, M.bronze, false);
    } else {
      B.box(t - d / 2, lo, a, t + d / 2, hi, a + w, M.bronze, false);
      B.box(t - d / 2, lo, b - w, t + d / 2, hi, b, M.bronze, false);
      B.box(t - d / 2, hi - w, a, t + d / 2, hi, b, M.bronze, false);
      B.box(t - d / 2, lo, a, t + d / 2, lo + w, b, M.bronze, false);
    }
  };
  // floor-to-ceiling glass wall along x (at z = t) or z (at x = t), mullions every ~step metres,
  // per-floor bands [y0, y1]; spandrels (bronze) between bands. Doors: [{a, b, lo, hi}] gaps.
  const glassRun = (axis, t, s0, s1, bands, step, doors = [], inward = 1) => {
    const n = Math.max(1, Math.round((s1 - s0) / step)), st = (s1 - s0) / n;
    const md = 0.16 * inward;                       // mullion depth into the room
    for (const [y0, y1] of bands) {
      // glass panes (skip door gaps)
      const cuts = new Set([s0, s1]); if (Q && Q.cqc) for (let k = 1; k < n; k++) cuts.add(s0 + k * st);
      for (const d of doors) if (d.lo < y1 && d.hi > y0) { cuts.add(d.a); cuts.add(d.b); }
      const xs = [...cuts].sort((p, q) => p - q);
      for (let k = 0; k < xs.length - 1; k++) {
        const a = xs[k], b = xs[k + 1], m = (a + b) / 2;
        const d = doors.find((o) => o.a <= m && o.b >= m && o.lo < y1 && o.hi > y0);
        const segs = d ? [[d.hi, y1]] : [[y0, y1]];
        for (const [lo, hi] of segs) if (hi - lo > 0.01) {
          if (axis === 'x') B.box(a, lo, t - 0.012, b, hi, t + 0.012, M.glass);
          else B.box(t - 0.012, lo, a, t + 0.012, hi, b, M.glass);
        }
        if (d) {                                     // door frame head + jambs
          if (axis === 'x') { B.box(a, d.hi - 0.06, t, b, d.hi, t + md, M.bronze, false); }
          else B.box(t, d.hi - 0.06, a, t + md, d.hi, b, M.bronze, false);
        }
      }
      const inDoor = (v) => doors.some((d) => d.lo < y1 && d.hi > y0 && v > d.a - 0.05 && v < d.b + 0.05);
      const posts = [];
      for (let i = 0; i <= n; i++) if (!inDoor(s0 + i * st)) posts.push(s0 + i * st);
      for (const d of doors) if (d.lo < y1 && d.hi > y0) posts.push(d.a, d.b);
      for (const s of posts) {
        const w = 0.065;
        const a = Math.max(s0, s - w / 2), b = Math.min(s1, s + w / 2);
        if (axis === 'x') B.box(a, y0, Math.min(t, t + md), b, y1, Math.max(t, t + md), M.bronze, false);
        else B.box(Math.min(t, t + md), y0, a, Math.max(t, t + md), y1, b, M.bronze, false);
        // profiled cap on the room side (wider than the fin) and glazing beads at the glass
        const cw = 0.048, ce = t + md, cd = 0.02 * inward;
        const c0 = Math.max(s0, s - cw), c1 = Math.min(s1, s + cw);
        if (axis === 'x') B.box(c0, y0, Math.min(ce, ce + cd), c1, y1, Math.max(ce, ce + cd), M.blackMetal, false);
        else B.box(Math.min(ce, ce + cd), y0, c0, Math.max(ce, ce + cd), y1, c1, M.blackMetal, false);
      }
      // sill and head frames
      if (axis === 'x') { B.box(s0, y0, Math.min(t, t + md), s1, y0 + 0.05, Math.max(t, t + md), M.bronze, false); B.box(s0, y1 - 0.08, Math.min(t, t + md), s1, y1, Math.max(t, t + md), M.bronze, false); }
      else { B.box(Math.min(t, t + md), y0, s0, Math.max(t, t + md), y0 + 0.05, s1, M.bronze, false); B.box(Math.min(t, t + md), y1 - 0.08, s0, Math.max(t, t + md), y1, s1, M.bronze, false); }
    }
  };
  const ceil = (x0, z0, x1, z1, y, lights = 1.7) => {
    B.box(x0, y, z0, x1, y + 0.04, z1, M.ceiling, false);
    // shadow gap where the ceiling meets the walls
    const g = 0.012, gh = 0.016;
    B.box(x0, y - gh, z0, x1, y, z0 + g, M.slot, false); B.box(x0, y - gh, z1 - g, x1, y, z1, M.slot, false);
    B.box(x0, y - gh, z0 + g, x0 + g, y, z1 - g, M.slot, false); B.box(x1 - g, y - gh, z0 + g, x1, y, z1 - g, M.slot, false);
    if (lights) downlights(x0, z0, x1, z1, y, lights);
  };
  // recessed downlight: the ceiling is cut open round it (surface.js holes); a black can 8 cm
  // deep (inside faces), a dark reflector ring and the lamp's lens at its top
  const canGeo = (() => {
    const g = new THREE.CylinderGeometry(0.05, 0.05, 0.08, 24, 1, true).toNonIndexed();
    const a = g.attributes.position.array, nn = g.attributes.normal.array;
    for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; const u = nn[i + 3 + k]; nn[i + 3 + k] = nn[i + 6 + k]; nn[i + 6 + k] = u; }
    for (let i = 0; i < nn.length; i++) nn[i] = -nn[i];
    g.translate(0, 0.04, 0);
    return g;
  })();
  const ringGeo = new THREE.RingGeometry(0.026, 0.05, 24).rotateX(Math.PI / 2).translate(0, 0.068, 0);
  const lensGeo = new THREE.CircleGeometry(0.027, 20).rotateX(Math.PI / 2).translate(0, 0.066, 0);
  const lamps = [];                                   // every downlight: [x, y, z] (lit in the probe bake)
  const downlights = (x0, z0, x1, z1, y, step) => {
    const nx = Math.max(1, Math.round((x1 - x0) / step)), nz = Math.max(1, Math.round((z1 - z0) / step));
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const x = x0 + (i + 0.5) * (x1 - x0) / nx, z = z0 + (k + 0.5) * (z1 - z0) / nz;
      B.add(canGeo.clone().translate(x, y, z), M.slot);
      B.add(ringGeo.clone().translate(x, y, z), M.slot);
      B.add(lensGeo.clone().translate(x, y, z), M.lens);
      lamps.push([x, y - 0.02, z]);
    }
  };
  const floor = (x0, z0, x1, z1, y, mat) => B.box(x0, y - 0.03, z0, x1, y, z1, mat, false);
  // door leaf standing open: hinge at (hx, hz), the leaf runs from the hinge in direction yaw
  const leaf = (hx, hz, y0, w, h, yaw, mat = M.doorWhite) => {
    const dx = Math.cos(yaw), dz = -Math.sin(yaw);
    B.obox(hx + dx * w / 2, y0 + h / 2, hz + dz * w / 2, w / 2, h / 2, 0.025, yaw, mat);
    // bronze levers on both faces at the free end (arm toward the hinge), hinge knuckles
    const place = (g, lx, ly, lz) => { g.translate(lx, ly, lz); g.rotateY(yaw); g.translate(hx + dx * w / 2, y0 + h / 2, hz + dz * w / 2); B.add(g, M.bronzeLight); };
    place(leverGeo(-1), w / 2 - 0.065, 1.0 - h / 2, 0.025);
    place(mirrorZ(leverGeo(-1)), w / 2 - 0.065, 1.0 - h / 2, -0.025);
    for (const hy of [0.22, h * 0.5, h - 0.22]) place(hingeGeo().rotateY(Math.PI / 2).scale(1, 1, 0.6), -w / 2 - 0.004, hy - h / 2, 0);
  };
  // closed door panel flush in a wall face: axis of the wall face, t = face coordinate, normal sign
  const panel = (axis, t, a, b, y0, y1, mat, n = 1) => {
    const d = 0.03 * n;
    if (mat !== M.bronzeLight) {
      // lever on the room face, the arm toward the hinge side (a)
      let g = leverGeo(-1);                  // arm -x, face +z
      if (axis === 'x') { if (n < 0) g = mirrorZ(g); g.translate(b - 0.075, y0 + 1.0, t + d); }
      else { if (n > 0) g = mirrorZ(g); g.rotateY(-Math.PI / 2); g.translate(t + d, y0 + 1.0, b - 0.075); }
      B.add(g, M.bronzeLight);
    }
    if (axis === 'x') { B.box(a, y0, t, b, y1, t + d, mat); B.box(a - 0.03, y0, t, b + 0.03, y1 + 0.03, t + d * 0.5, M.bronze, false); }
    else { B.box(t, y0, a, t + d, y1, b, mat); B.box(t, y0, a - 0.03, t + d * 0.5, y1 + 0.03, b + 0.03, M.bronze, false); }
  };
  // linear floor grilles at the glass, with real depth: the floor is cut open over the strip
  // (surface.js holes), a black trough 6 cm down, aluminium bars along the run, end frames
  const grilles = [];
  const grilleRun = (axis, t0, t1, s0, s1, y) => {
    grilles.push([s0, t0, s1, t1, y]);
    B.box(s0, y - 0.07, t0, s1, y - 0.06, t1, M.slot, false);
    const n = Math.round((t1 - t0) / 0.018);
    for (let k = 0; k < n; k++) { const t = t0 + (t1 - t0) * (k + 0.5) / n; B.box(s0, y - 0.028, t - 0.0022, s1, y - 0.0005, t + 0.0022, M.bronze, false); }
    for (let a = s0; a <= s1 + 1e-6; a += Math.min(1.2, s1 - a) || 1.2) {
      B.box(a - 0.004, y - 0.03, t0, a + 0.004, y - 0.0005, t1, M.bronze, false);
      if (a >= s1) break;
    }
    B.box(s0, y - 0.03, t0 - 0.004, s1, y - 0.0005, t0, M.bronze, false); B.box(s0, y - 0.03, t1, s1, y - 0.0005, t1 + 0.004, M.bronze, false);
  };

  // ---- structure: slabs (colliders), roof, tower shaft stub ---------------------------------
  B.colliders.push({ t: 'box', min: [-2, -0.5, -2], max: [XM + 2, 0, ZT + 0.3] });   // floor one slab
  B.box(-0.05, C2 + 0.04, -0.05, XM + 0.05, RF, ZS + 0.05, M.ceiling, false);       // roof slab
  B.box(-0.05, -0.6, -0.05, XM + 0.05, -0.03, ZT, M.ceiling, false);               // floor one slab body

  // floor two slab: outline minus the stair void (a 330 degree sector; the last 30 degrees are
  // the arrival landing)
  const S = STAIR;
  const voidPts = [[S.cx, S.cz]];
  for (let i = 0; i <= 44; i++) { voidPts.push(polar(S.cx, S.cz, S.r1, S.sweep * i / 44)); }
  {
    const shape = new THREE.Shape([[0, 0], [XM, 0], [XM, ZS], [0, ZS]].map(([x, z]) => new THREE.Vector2(x, z)));
    shape.holes.push(new THREE.Path(voidPts.map(([x, z]) => new THREE.Vector2(x, z))));
    const ex = new THREE.ExtrudeGeometry(shape, { depth: L2 - C1, bevelEnabled: false, curveSegments: 32 });
    const p = ex.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getY(i), y = p.getZ(i); p.setXYZ(i, x, C1 + y, z); }
    const idx = ex.index ? ex.index.array : null;
    let g = ex;
    if (!idx) {                                       // ExtrudeGeometry is non-indexed: swap winding (the y/z swap mirrored it)
      const a = p.array;
      for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
    }
    g.computeVertexNormals();
    B.trimesh(g);
    const vis = g.clone(); vis.translate(0, -0.035, 0);
    B.add(vis, M.stairWhite);                         // slab edge round the void (top and bottom are covered)
  }

  // ---- facades ----------------------------------------------------------------------------
  // north: floor-to-ceiling glass both floors, bronze spandrel at the slab, corner glass wraps
  glassRun('x', 0, 0, XM, [[L1, C1], [L2, C2]], 1.467);
  B.box(0, C1, -0.05, XM, L2, 0.02, M.bronze, false);
  B.box(0, C2, -0.05, XM, RF, 0.02, M.bronze, false);
  glassRun('z', 0, 0, 1.6, [[L1, C1], [L2, C2]], 1.6, [], 1);
  glassRun('z', XM, 0, 1.6, [[L1, C1], [L2, C2]], 1.6, [], -1);
  for (const x of [0, XM]) { B.box(x - 0.05, C1, 0, x + 0.05, L2, 1.6, M.bronze, false); B.box(x - 0.05, C2, 0, x + 0.05, RF, 1.6, M.bronze, false); }
  B.box(-0.04, L1, -0.04, 0.08, RF, 0.08, M.bronze, false); B.box(XM - 0.08, L1, -0.04, XM + 0.04, RF, 0.08, M.bronze, false);
  grilleRun('x', 0.18, 0.46, 0.2, XM - 0.2, L1); grilleRun('x', 0.18, 0.46, 0.2, XM - 0.2, L2);

  // west / east: the tower's thick walls with full-height slot windows (glass near the outside)
  const slot = (a, lo, hi) => ({ a, b: a + 0.6, lo, hi });
  wall('z', 0, XW, 1.6, ZS, L1, RF, [
    ...(Q.cqc ? [{ a: 12.55, b: 13.55, lo: L1, hi: DH1 }] : []),
    { ...slot(2.55, 0.0, 3.6), win: 0.06 }, { ...slot(4.85, 0.0, 3.6), win: 0.06 }, { ...slot(15.6, 0.0, 3.6), win: 0.06 },
    { ...slot(2.55, L2 + 0.1, L2 + 3.3), win: 0.06 }, { ...slot(4.85, L2 + 0.1, L2 + 3.3), win: 0.06 }, { ...slot(15.6, L2 + 0.1, L2 + 3.3), win: 0.06 },
  ]);
  wall('z', XE, XM, 1.6, ZS, L1, RF, [
    ...(Q.cqc ? [{ a: 7.95, b: 8.95, lo: L1, hi: 2.2 }] : []),
    { ...slot(2.55, 0.0, 3.6), win: XM - 0.06 }, { ...slot(4.85, 0.0, 3.6), win: XM - 0.06 },
    { ...slot(11.2, 0.95, 3.6), win: XM - 0.06 }, { ...slot(13.4, 0.95, 3.6), win: XM - 0.06 },
    { ...slot(2.55, L2 + 0.1, L2 + 3.3), win: XM - 0.06 }, { ...slot(4.85, L2 + 0.1, L2 + 3.3), win: XM - 0.06 },
    { ...slot(7.9, L2 + 0.1, L2 + 3.3), win: XM - 0.06 }, { ...slot(15.6, L2 + 0.1, L2 + 3.3), win: XM - 0.06 },
  ]);
  // south: glass both floors, doors to the terrace from the media room and the breakfast room
  const tDoors = [{ a: 2.0, b: 2.95, lo: L1, hi: DH1 }, { a: 14.75, b: 15.7, lo: L1, hi: DH1 }];
  glassRun('x', ZS, XW, XE, [[L1, C1], [L2, C2]], 1.45, tDoors, -1);
  B.box(XW, C1, ZS - 0.02, XE, L2, ZS + 0.05, M.bronze, false);
  B.box(XW, C2, ZS - 0.02, XE, RF, ZS + 0.05, M.bronze, false);
  grilleRun('x', ZS - 0.46, ZS - 0.18, XW + 0.2, XE - 0.2, L1); grilleRun('x', ZS - 0.46, ZS - 0.18, XW + 0.2, XE - 0.2, L2);
  // open glass door leaves on the terrace side
  leaf(2.95, ZS + 0.04, L1, 0.95, DH1 - 0.05, -Math.PI * 0.5 - 0.15, M.bronze);
  leaf(14.75, ZS + 0.04, L1, 0.95, DH1 - 0.05, -Math.PI * 0.5 + 0.15, M.bronze);

  // terrace: pavers, glass balustrade, wing walls
  floor(XW, ZS, XE, ZT, L1, M.pavers);
  B.box(XW, L1, ZT - 0.06, XE, 1.1, ZT - 0.04, M.balGlass);
  B.box(XW, 1.08, ZT - 0.08, XE, 1.13, ZT - 0.02, M.bronze);
  for (let x = XW + 1.4; x < XE; x += 1.45) B.box(x - 0.025, L1, ZT - 0.09, x + 0.025, 1.08, ZT - 0.03, M.bronze, false);
  solid(0, ZS, XW, ZT, L1, C1, M.plasterWarm, 'e'); solid(XE, ZS, XM, ZT, L1, C1, M.plasterWarm, 'w');
  B.box(0, -0.6, ZS, XM, -0.03, ZT, M.plasterWarm, false);

  // columns at the north glass (both floors)
  for (const [a, b] of [[4.25, 5.63], [12.0, 13.4]]) solid(a, 0.15, b, 1.35, L1, C2);

  // ---- floor one ----------------------------------------------------------------------------
  // great hall: herringbone oak in the living area (apartment-19), Versailles parquet in the
  // dining end past the east columns (apartment-17), a bronze threshold between; perimeter
  // soffit, raised centre field
  const XD = 12.7;
  floor(0, 0, XD, 6.72, L1, M.herring);
  floor(XD, 0, XM, 6.72, L1, M.parquet);
  B.box(XD - 0.015, L1, 1.35, XD + 0.015, L1 + 0.002, 6.72, M.bronzeLight, false);
  B.box(0, 4.2, 0, XM, 4.24, 6.72, M.ceiling, false);
  for (const [x0, z0, x1, z1] of [[0, 0, XM, 0.85], [XW, 5.92, XE, 6.72], [XW, 0.85, XW + 0.8, 5.92], [XE - 0.8, 0.85, XE, 5.92]])
    B.box(x0, 3.82, z0, x1, 4.2, z1, M.ceiling, false);
  B.box(0, 3.81, 0.1, XM, 3.82, 0.2, M.slot, false);              // curtain pocket at the glass
  B.box(XW + 0.4, 3.812, 0.5, XE - 0.4, 3.82, 0.53, M.slot, false); B.box(XW + 0.4, 3.812, 0.58, XE - 0.4, 3.82, 0.61, M.slot, false);   // linear diffusers
  downlights(XW + 1.2, 1.2, XE - 1.2, 5.6, 4.2, 2.2);
  downlights(1.2, 0.3, XM - 1.2, 0.75, 3.82, 1.467);
  // great hall south wall: hallway door, gallery opening, kitchen passage
  wall('x', 6.72, 6.92, XW, XE, L1, C1, [
    { a: 3.46, b: 4.74, lo: L1, hi: DH1 }, { a: 7.91, b: 9.88, lo: L1, hi: DH1 + 0.3 }, { a: 14.03, b: 15.12, lo: L1, hi: DH1 },
  ]);
  leaf(3.46, 6.92, L1, 1.0, DH1, -Math.PI / 2 + 0.05);           // hallway door, open toward the hallway
  leaf(15.12, 6.92, L1, 1.0, DH1, -Math.PI / 2 - 0.05);          // kitchen passage door

  // fire stair (closed core, both floors)
  if (Q.cqc) {
    // inside CQC: the front door's vestibule runs through the fire-stair core to the west wall, where CQC's own
    // door leads on (the loop); the old fire door panel goes
    solid(XW, 6.92, 3.46, 12.55, L1, C2, M.plaster, 'e'); solid(XW, 13.55, 3.46, 14.33, L1, C2, M.plaster, 'e');
    solid(XW, 12.55, 3.46, 13.55, DH1, C2, M.plaster, '');
    B.box(XW, L1 - 0.03, 12.55, 3.46, L1, 13.55, M.stone, false);
    for (const [z0, z1] of [[12.53, 12.55], [13.55, 13.57]]) skirt(XW, z0, 3.46, z1, L1, z0 < 13 ? 'n' : 's');
  } else solid(XW, 6.92, 3.46, 14.33, L1, C2, M.plaster, 'e');
  if (!Q.cqc) panel('z', 3.46, 12.55, 13.55, L1, DH1, M.woodDark, 1);           // the front door (hub.js: its panel beside it)
  panel('z', 3.46, 12.6, 13.5, L2, L2 + DH2, M.fireDoor, 1);
  // hallway (floor one) between the fire stair and the west core
  floor(3.46, 6.72, 4.74, 14.48, L1, M.stone);
  ceil(3.46, 6.92, 4.74, 14.33, 3.4, 1.8);
  solid(4.74, 6.92, 6.03, 14.33, L1, C1, M.plaster, 'w');          // west core: shafts, services

  // duplex elevator (both floors) and the stair hall
  solid(6.03, 6.92, 7.91, 8.95, L1, C2, M.plaster, 'es');
  for (const y of [L1, L2]) panel('z', 7.91, 7.4, 8.4, y, y + 2.4, M.bronzeLight, 1);
  solid(6.03, 8.95, 7.6, 9.42, L1, C2, M.plaster, '');
  B.add(shellGeo(S.cx, S.cz, S.r1, S.rw, 0, 190 * Math.PI / 180, L1, C2, 192), M.plasterStair);   // 1 deg facets: no saw-tooth where it meets the flat walls
  shellColliders(B, S.cx, S.cz, S.r1, S.rw, 0, 190 * Math.PI / 180, L1, C2, 24);
  solid(6.03, 12.75, 7.91, 12.95, L1, C2, M.plaster, '');
  floor(6.03, 8.95, 7.91, 12.95, L1, M.stone);

  // powder room
  solid(6.03, 12.95, 6.18, 14.33, L1, C1, M.plaster, 'e');
  wall('z', 7.81, 7.91, 12.95, 14.33, L1, C1, [{ a: 13.25, b: 14.05, lo: L1, hi: DH1 - 0.2 }]);
  leaf(7.81, 13.25, L1, 0.8, DH1 - 0.2, Math.PI + 0.15);
  floor(6.18, 12.95, 7.81, 14.33, L1, M.marbleGrey);
  ceil(6.18, 12.95, 7.81, 14.18, 3.0, 1.0);
  solid(6.03, 14.18, 7.91, 14.33, L1, C1, M.plaster, 'n');

  // AV and coat closets (closed doors into the media room)
  solid(5.7, 14.33, 7.91, 15.2, L1, C1, M.plaster, 's');
  panel('x', 15.2, 5.8, 6.75, L1, DH1 - 0.3, M.doorWhite, 1);
  panel('x', 15.2, 6.86, 7.81, L1, DH1 - 0.3, M.doorWhite, 1);

  // the north / south view gallery (double height round the stair)
  floor(7.91, 6.72, 9.88, ZS, L1, M.stone);
  {
    const R = 1.75, x = 7.91, dz = Math.sqrt(R * R - (x - S.cx) ** 2);
    const pts = [[7.91, 6.92], [9.88, 6.92], [9.88, ZS], [7.91, ZS], [7.91, S.cz + dz]];
    for (let i = 1; i < 24; i++) { const z = S.cz + dz - (2 * dz) * i / 24; pts.push([S.cx + Math.sqrt(Math.max(0, R * R - (z - S.cz) ** 2)), z]); }
    pts.push([7.91, S.cz - dz]);
    B.add(flatGeo(pts, 3.4, true), M.ceiling);
    downlights(8.2, 13.2, 9.6, 17.0, 3.4, 1.4);
    downlights(8.2, 7.1, 9.6, 8.8, 3.4, 1.4);
  }
  // media room
  wall('x', 14.33, 14.48, XW, 5.7, L1, C1, [{ a: 3.46, b: 4.74, lo: L1, hi: DH1 }]);
  wall('z', 7.81, 7.91, 15.2, ZS, L1, C1, [{ a: 15.6, b: 16.8, lo: L1, hi: DH1 }]);
  floor(XW, 14.33, 7.91, ZS, L1, M.oak);
  ceil(XW, 14.48, 7.81, ZS - 0.6, 3.4, 1.7);
  B.box(XW, 3.15, ZS - 0.6, XE, 3.4, ZS, M.ceiling, false);
  B.box(XW, 3.14, ZS - 0.2, XE, 3.15, ZS - 0.12, M.slot, false);

  // private elevators, pantry, kitchen, breakfast room
  solid(9.88, 6.92, 14.03, 9.98, L1, C1, M.plaster, 'ws');
  solid(9.88, 9.98, 13.34, 14.03, L1, C1, M.plaster, 'wes');
  panel('z', 9.88, 8.2, 9.2, L1, 2.6, M.bronzeLight, -1);
  panel('z', 9.88, 11.4, 12.4, L1, 2.6, M.bronzeLight, -1);
  if (Q.cqc) {   // inside CQC: a passage from the pantry corridor east through to the armory (CQC's safe room)
    solid(15.12, 6.92, XE, 7.95, L1, C1, M.plaster, 'ws'); solid(15.12, 8.95, XE, 9.98, L1, C1, M.plaster, 'ws');
    solid(15.12, 7.95, XE, 8.95, 2.2, C1, M.plaster, '');
    B.box(15.12, L1 - 0.03, 7.95, XM, L1, 8.95, M.oak, false);
  } else solid(15.12, 6.92, XE, 9.98, L1, C1, M.plaster, 'ws');
  wall('z', 9.88, 9.98, 14.03, ZS, L1, C1, [{ a: 14.45, b: 15.85, lo: L1, hi: DH1 }]);
  floor(14.03, 6.72, 15.12, 9.98, L1, M.oak);
  floor(13.34, 9.98, XE, ZS, L1, M.oak);
  floor(9.88, 14.03, 13.34, ZS, L1, M.oak);
  ceil(14.03, 6.92, 15.12, 9.98, 3.4, 1.4);
  ceil(13.34, 9.98, XE, ZS - 0.6, 3.4, 1.6);
  ceil(9.98, 14.03, 13.34, ZS - 0.6, 3.4, 1.6);

  // ---- the curved stair -----------------------------------------------------------------------
  buildStair(B, M);

  // ---- floor two ------------------------------------------------------------------------------
  // north band: primary bath | primary bedroom | library
  floor(0, 0, 4.94, 6.72, L2, M.onyx);
  floor(4.94, 0, 12.7, 6.72, L2, M.oak);
  floor(12.7, 0, XM, 6.72, L2, M.oak);
  wall('z', 4.84, 5.04, 1.35, 6.72, L2, C2, [{ a: 5.0, b: 5.85, lo: L2, hi: L2 + DH2 }]);
  leaf(5.04, 5.0, L2, 0.85, DH2, -0.1);
  wall('z', 12.62, 12.78, 1.35, 6.72, L2, C2);
  wall('x', 6.72, 6.92, XW, XE, L2, C2, [
    { a: 3.75, b: 4.6, lo: L2, hi: L2 + DH2 }, { a: 8.4, b: 9.4, lo: L2, hi: L2 + DH2 }, { a: 13.55, b: 14.45, lo: L2, hi: L2 + DH2 },
  ]);
  leaf(8.4, 6.72, L2, 1.0, DH2, Math.PI / 2 + 0.1);               // into the primary bedroom
  leaf(13.55, 6.72, L2, 0.9, DH2, Math.PI / 2 + 0.1);             // into the library
  leaf(3.75, 6.92, L2, 0.85, DH2, -Math.PI / 2 + 0.1);            // into the closet
  // primary closet and second bath (west core)
  floor(3.46, 6.72, 6.13, 9.75, L2, M.oak);
  wall('x', 9.6, 9.75, 3.46, 6.13, L2, C2);
  floor(3.46, 9.75, 6.13, 14.33, L2, M.travertine);
  solid(6.03, 9.42, 6.13, 12.75, L2, C2, M.plaster, 'w');
  // linen closet over the powder room
  solid(6.03, 12.95, 7.91, 14.33, L2, C2, M.plaster, 'e');
  // upper gallery and landing (stone, with the stair void)
  {
    const shape = new THREE.Shape([[6.03, 6.72], [10.3, 6.72], [10.3, 14.33], [6.03, 14.33]].map(([x, z]) => new THREE.Vector2(x, z)));
    shape.holes.push(new THREE.Path(voidPts.map(([x, z]) => new THREE.Vector2(x, z))));
    B.add(shapeFlat(shape, L2 + 0.001), M.stone);
  }
  floor(7.91, 14.33, 9.88, ZS, L2, M.oak);
  // floor two elevator core, corridor, east hall
  solid(10.3, 6.92, 13.34, 12.9, L2, C2, M.plaster, 'wes');
  floor(10.3, 12.9, 13.34, 14.33, L2, M.oak);
  floor(13.34, 6.72, 14.6, 14.33, L2, M.oak);
  // third bath (grey marble) and the closet of bedroom three
  wall('z', 14.6, 14.75, 6.92, 9.6, L2, C2, [{ a: 7.5, b: 8.35, lo: L2, hi: L2 + DH2 }]);
  leaf(14.75, 7.5, L2, 0.85, DH2, -0.15);
  wall('x', 9.6, 9.75, 14.6, XE, L2, C2);
  floor(14.75, 6.72, XE, 9.6, L2, M.marbleGrey);
  wall('z', 14.6, 14.75, 9.75, 14.33, L2, C2);
  floor(14.75, 9.75, XE, 14.33, L2, M.oak);
  // south band: bedroom two | sitting nook | bedroom three
  wall('x', 14.33, 14.48, XW, 7.91, L2, C2, [{ a: 4.0, b: 4.8, lo: L2, hi: L2 + DH2 }]);
  leaf(4.8, 14.48, L2, 0.8, DH2, -Math.PI / 2 - 0.1);
  wall('x', 14.33, 14.48, 9.88, XE, L2, C2, [{ a: 13.55, b: 14.45, lo: L2, hi: L2 + DH2 }, { a: 15.1, b: 16.2, lo: L2, hi: L2 + DH2 }]);
  leaf(14.45, 14.48, L2, 0.9, DH2, -Math.PI / 2 - 0.22);   // clear of bedroom three's bed
  wall('z', 7.81, 7.91, 14.33, ZS, L2, C2, [{ a: 15.0, b: 15.9, lo: L2, hi: L2 + DH2 }]);
  leaf(7.81, 15.0, L2, 0.9, DH2, Math.PI + 0.1);
  wall('z', 9.88, 9.98, 14.33, ZS, L2, C2, [{ a: 15.0, b: 15.9, lo: L2, hi: L2 + DH2 }]);
  leaf(9.98, 15.9, L2, 0.9, DH2, 0.1);
  floor(XW, 14.33, 7.91, ZS, L2, M.oak);
  floor(9.88, 14.33, XE, ZS, L2, M.oak);

  // floor two ceilings: one plane, soffits with curtain pockets at the north and south glass
  B.box(0, C2, 0, XM, C2 + 0.04, ZS, M.ceiling, false);
  B.box(0, 7.9, 0, XM, C2, 0.6, M.ceiling, false);
  B.box(0, 7.89, 0.1, XM, 7.9, 0.2, M.slot, false);
  B.box(XW + 0.4, 7.892, 0.38, XE - 0.4, 7.9, 0.41, M.slot, false); B.box(XW + 0.4, 7.892, 0.46, XE - 0.4, 7.9, 0.49, M.slot, false);
  B.box(XW, 7.9, ZS - 0.6, XE, C2, ZS, M.ceiling, false);
  B.box(XW, 7.89, ZS - 0.2, XE, 7.9, ZS - 0.12, M.slot, false);
  B.box(XW + 0.4, 7.892, ZS - 0.44, XE - 0.4, 7.9, ZS - 0.41, M.slot, false);
  for (const [x0, z0, x1, z1] of [[1.2, 0.9, 4.6, 6.4], [5.3, 0.9, 12.3, 6.4], [13.1, 0.9, 16.3, 6.4], [XW + 0.3, 14.7, 7.5, ZS - 0.8],
    [10.3, 14.7, 16.4, ZS - 0.8], [8.1, 7.1, 10.1, 9.0], [3.7, 10.0, 5.9, 14.0], [15.0, 7.0, 16.4, 9.4], [13.5, 7.0, 14.4, 14.0]])
    downlights(x0, z0, x1, z1, C2, 1.8);
  downlights(3.8, 7.3, 5.8, 9.3, C2, 1.0);                         // dressing hall (apartment-07): two by two
  B.box(3.85, C2 - 0.008, 9.32, 4.85, C2, 9.35, M.slot, false);   // linear slot diffuser over the vanity

  // tray ceilings with LED coves (apartment-08, -10, -04): a 45 cm band dropped 22 cm round the
  // room, its inner face carrying a lit strip that washes the raised centre
  const tray = (x0, z0, x1, z1, top, w = 0.45, drop = 0.22) => {
    const y0 = top - drop;
    B.box(x0, y0, z0, x1, top, z0 + w, M.ceiling, false); B.box(x0, y0, z1 - w, x1, top, z1, M.ceiling, false);
    B.box(x0, y0, z0 + w, x0 + w, top, z1 - w, M.ceiling, false); B.box(x1 - w, y0, z0 + w, x1, top, z1 - w, M.ceiling, false);
    const e = 0.012, h0 = top - 0.05, h1 = top - 0.02;
    B.box(x0 + w, h0, z0 + w - 0.004, x1 - w, h1, z0 + w + e - 0.004, M.light, false); B.box(x0 + w, h0, z1 - w - e + 0.004, x1 - w, h1, z1 - w + 0.004, M.light, false);
    B.box(x0 + w - 0.004, h0, z0 + w, x0 + w + e - 0.004, h1, z1 - w, M.light, false); B.box(x1 - w - e + 0.004, h0, z0 + w, x1 - w + 0.004, h1, z1 - w, M.light, false);
  };
  tray(0.9, 0.6, 4.84, 6.72, C2);          // primary bath
  tray(5.04, 0.6, 12.62, 6.72, C2);        // primary bedroom
  tray(12.78, 0.6, 16.7, 6.72, C2);        // library
  tray(XW, 14.48, 7.81, ZS - 0.6, C2);     // bedroom two
  tray(9.98, 14.48, XE, ZS - 0.6, C2);     // bedroom three

  const meshes = B.finish(group);
  let panes = null;
  if (PANES.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.glass, PANES.length), o = new THREE.Object3D();
    PANES.forEach((q, i) => { o.position.set((q.min[0] + q.max[0]) / 2, (q.min[1] + q.max[1]) / 2, (q.min[2] + q.max[2]) / 2); o.scale.set(q.max[0] - q.min[0], q.max[1] - q.min[1], q.max[2] - q.min[2]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.name = 'panes'; im.castShadow = false; im.receiveShadow = false; im.renderOrder = M.glass.userData.order || 0;
    group.add(im); panes = { mesh: im, list: PANES };
  }
  return { group, meshes, colliders: B.colliders, lamps, grilles, panes };
}

// The helical stair: 26 risers over 330 degrees, from floor one (north of the centre, heading
// west) to the floor two landing. White plaster body with a smooth helical soffit, marble treads,
// black balusters and an oak handrail; an outer guard where it flies over the gallery; a guard
// round the void on floor two. Walking uses a smooth ramp collider through the tread middles.
function buildStair(B, M) {
  const S = STAIR, n = S.risers - 1, dA = S.sweep / n, rise = LV.L2 / S.risers;
  const at = (r, a, y) => { const [x, z] = polar(S.cx, S.cz, r, a); return [x, y, z]; };
  const top = (i) => (i + 1) * rise;                       // tread i top
  const soffit = (a) => (a / dA) * rise + rise - 0.3;     // underside, smooth
  const ramp = (a) => (a / dA + 0.5) * rise;              // walking surface for physics
  const rail = (a) => (a / dA) * rise + rise + 0.9;
  const R1 = STAIR.r1 - 0.005;   // the outer stringer face stands 5 mm off the curved wall (no z-fighting)
  const SW = 0.07, strTop = (a) => (a / dA) * rise + rise + 0.12;   // stringer width, smooth top line

  const P = [], N = [];
  const quad = (a, b, c, d) => {
    const v1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = v1[1] * v2[2] - v1[2] * v2[1], ny = v1[2] * v2[0] - v1[0] * v2[2], nz = v1[0] * v2[1] - v1[1] * v2[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    P.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let k = 0; k < 6; k++) N.push(nx, ny, nz);
  };
  const body = { P: [], N: [] }, cap = { P: [], N: [] };
  const use = (o) => { P.length = 0; N.length = 0; return () => { o.P.push(...P); o.N.push(...N); }; };

  for (let i = 0; i < n; i++) {
    const a0 = i * dA, a1 = (i + 1) * dA, sub = 4, t = top(i);
    // plaster body: top just under the marble, smooth soffit below
    let done = use(body);
    for (let k = 0; k < sub; k++) {
      const pa = a0 + (a1 - a0) * k / sub, pb = a0 + (a1 - a0) * (k + 1) / sub;
      quad(at(S.r0, pa, soffit(pa)), at(R1, pa, soffit(pa)), at(R1, pb, soffit(pb)), at(S.r0, pb, soffit(pb)));   // soffit (faces down)
      // closed stringers (apartment-12): both sides rise to a smooth helix 12 cm over the nosing
      // line, 7 cm thick, the treads run into them
      const ha = strTop(pa), hb = strTop(pb);
      quad(at(R1, pa, soffit(pa)), at(R1, pa, ha), at(R1, pb, hb), at(R1, pb, soffit(pb)));       // outer face
      quad(at(S.r0, pb, soffit(pb)), at(S.r0, pb, hb), at(S.r0, pa, ha), at(S.r0, pa, soffit(pa)));       // inner face
      const ri = S.r0 + SW, ro = R1 - SW;
      quad(at(ri, pa, t), at(ri, pa, ha), at(ri, pb, hb), at(ri, pb, t));                                 // inner stringer, tread side
      quad(at(ro, pb, t), at(ro, pb, hb), at(ro, pa, ha), at(ro, pa, t));                                 // outer stringer, tread side
      quad(at(S.r0, pb, hb), at(ri, pb, hb), at(ri, pa, ha), at(S.r0, pa, ha));                           // stringer caps
      quad(at(ro, pb, hb), at(R1, pb, hb), at(R1, pa, ha), at(ro, pa, ha));
    }
    quad(at(S.r0, a0, soffit(a0)), at(S.r0, a0, t), at(R1, a0, t), at(R1, a0, soffit(a0)));                      // riser face
    done();
    // marble tread, 4 cm, with a 2 cm nosing
    done = use(cap);
    const n0 = a0 - 0.02 / 1.0, tr0 = S.r0 + SW - 0.01, tr1 = S.r1 - SW + 0.01;   // ends run 1 cm into the stringers
    for (let k = 0; k < sub; k++) {
      const pa = n0 + (a1 - n0) * k / sub, pb = n0 + (a1 - n0) * (k + 1) / sub;
      quad(at(tr0, pb, t), at(tr1, pb, t), at(tr1, pa, t), at(tr0, pa, t));
      quad(at(tr1, pa, t - 0.04), at(tr1, pa, t), at(tr1, pb, t), at(tr1, pb, t - 0.04));
      quad(at(tr0, pb, t - 0.04), at(tr0, pb, t), at(tr0, pa, t), at(tr0, pa, t - 0.04));
    }
    quad(at(tr0, n0, t - 0.04), at(tr0, n0, t), at(tr1, n0, t), at(tr1, n0, t - 0.04));
    done();
    // physics: smooth ramp body (top = ramp line, bottom = soffit)
    const hp = [];
    for (const r of [S.r0, S.r1]) for (const a of [a0, a1]) { hp.push(...at(r, a, ramp(a))); hp.push(...at(r, a, soffit(a) - 0.02)); }
    B.convex(hp);
    // inner guard collider (the balustrade) and, over the gallery, the outer guard
    const gp = [];
    for (const r of [S.r0 - 0.02, S.r0 + 0.05]) for (const a of [a0, a1]) { gp.push(...at(r, a, top(i))); gp.push(...at(r, a, rail(a))); }
    B.convex(gp); railTag(B, S.r0 - 0.02, S.r0 + 0.05, a0, a1, top(i), rail(a1));
    if (a0 >= 190 * Math.PI / 180) {
      const op = [];
      for (const r of [S.r1 - 0.05, S.r1 + 0.02]) for (const a of [a0, a1]) { op.push(...at(r, a, top(i))); op.push(...at(r, a, rail(a))); }
      B.convex(op); railTag(B, S.r1 - 0.05, S.r1 + 0.02, a0, a1, top(i), rail(a1));
    }
  }
  const mk = (o) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(o.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(o.N, 3)); return g; };
  B.add(mk(body), M.stairWhite);
  B.add(mk(cap), M.treadStone);

  // balusters and handrails
  const balG = new THREE.CylinderGeometry(0.0085, 0.0085, 1, 10, 1, true).toNonIndexed();          // 17 mm round bar
  const bal = (x, y0, z, y1) => B.add(balG.clone().scale(1, y1 - y0, 1).translate(x, (y0 + y1) / 2, z), M.blackMetal);
  const innerR = S.r0 + 0.04, outerR = S.r1 - 0.04;
  const rIn = [], rOut = [];
  for (let i = 0; i < n; i++) {
    for (const f of [0.25, 0.75]) {
      const a = (i + f) * dA;
      const [x, z] = polar(S.cx, S.cz, innerR, a); bal(x, strTop(a) - 0.01, z, rail(a));
      if (a > 190 * Math.PI / 180) { const [xo, zo] = polar(S.cx, S.cz, outerR, a); bal(xo, strTop(a) - 0.01, zo, rail(a)); }
    }
  }
  for (let k = 0; k <= 60; k++) { const a = -0.05 + (S.sweep + 0.05) * k / 60; rIn.push([...polar(S.cx, S.cz, innerR, a)].flatMap((v, j) => (j === 0 ? [v, rail(Math.max(0, a))] : [v]))); }
  for (let k = 0; k <= 24; k++) { const a = 190 * Math.PI / 180 + (S.sweep - 190 * Math.PI / 180) * k / 24; rOut.push([...polar(S.cx, S.cz, outerR, a)].flatMap((v, j) => (j === 0 ? [v, rail(a)] : [v]))); }
  B.add(tube(rIn, 0.028), M.darkOak);
  B.add(tube(rOut, 0.028), M.darkOak);

  // floor two guard round the void: along the arc from 190 degrees to the arrival, and along
  // the radial edge at 0 degrees (the landing's side)
  const gR = S.r1 + 0.04, gy0 = LV.L2, gy1 = LV.L2 + 1.05;
  const arc = [];
  const a0g = 190 * Math.PI / 180, a1g = S.sweep;
  const len = gR * (a1g - a0g), nb = Math.round(len / 0.11);
  for (let k = 0; k <= nb; k++) { const a = a0g + (a1g - a0g) * k / nb; const [x, z] = polar(S.cx, S.cz, gR, a); bal(x, gy0, z, gy1); arc.push([x, gy1, z]); }
  B.add(tube(arc, 0.03), M.darkOak);
  const nc0 = B.colliders.length;
  shellColliders(B, S.cx, S.cz, gR - 0.03, gR + 0.03, a0g, a1g, gy0, gy1 + 0.05, 12);
  for (let k = nc0; k < B.colliders.length; k++) B.colliders[k].rail = true;
  const rad = [];
  for (let k = 0; k <= 14; k++) { const r = 0.05 + (S.r1 - 0.05) * k / 14; const [x, z] = polar(S.cx, S.cz, r, 0.012); bal(x, gy0, z, gy1); rad.push([x, gy1, z]); }
  B.add(tube(rad, 0.03), M.darkOak);
  B.box(S.cx - 0.04, gy0, S.cz - S.r1, S.cx + 0.03, gy1, S.cz - 0.02, null, true);
  B.colliders[B.colliders.length - 1].rail = true;
}
// A baluster guard: rounds pass between the bars. The hull just pushed is tagged `rail`, with the same guard
// as an oriented box (its chord, flat top at the higher end) in `ob`, so a game can keep bodies out with a
// walk box and let bullets through (CQC: no Rapier collider for rails). The world page ignores the tag.
function railTag(B, r0, r1, a0, a1, y0, y1) {
  const c = B.colliders[B.colliders.length - 1], tm = (a0 + a1) / 2, rm = (r0 + r1) / 2;
  const [x, z] = polar(STAIR.cx, STAIR.cz, rm, tm);
  c.rail = true;
  c.ob = { c: [x, (y0 + y1) / 2, z], h: [rm * Math.sin((a1 - a0) / 2) + 0.02, (y1 - y0) / 2, (r1 - r0) / 2], yaw: Math.atan2(-Math.sin(tm), -Math.cos(tm)) };
}
