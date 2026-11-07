// Real-shaped hardware and fixtures: levers, hinges, bar pulls, countertops cut for basins,
// undermount basins with depth, drains, faucets, toilet seat and lid, flush plates. Every part is
// modelled to catalogue sizes (millimetres noted) with round sections, not boxes. Each function
// returns one BufferGeometry (non-indexed) in its own local frame; the caller places it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const flat = (g) => (g.index ? g.toNonIndexed() : g);
const merge = (list) => {
  const gs = list.map((g) => { g = flat(g); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; });
  return mergeGeometries(gs, false);
};
// a lathe around the z axis (profile [r, z])
const latheZ = (prof, seg = 24) => new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), seg).rotateX(Math.PI / 2);
// a round bar along a path with domed ends
function bar(points, r, seg = 12) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const tube = new THREE.TubeGeometry(curve, Math.max(8, points.length * 6), r, seg, false);
  const a = new THREE.SphereGeometry(r, seg, 8).translate(...points[0]);
  const b = new THREE.SphereGeometry(r, seg, 8).translate(...points[points.length - 1]);
  return merge([tube, a, b]);
}

// lever handle on a round rose (door face = z 0, +z out of the door): rose 54 mm, neck 18 mm,
// a 130 mm lever of 17 mm round bar, gently returned toward the door at its tip.
// dir: the way the lever points along x (+1 / -1)
export function lever(dir = -1) {
  const rose = latheZ([[0, 0], [0.027, 0], [0.027, 0.004], [0.024, 0.009], [0, 0.009]], 32);
  const neck = latheZ([[0.009, 0.009], [0.0095, 0.05], [0, 0.05]], 20);
  const arm = bar([[0, 0, 0.05], [dir * 0.05, -0.002, 0.058], [dir * 0.1, -0.004, 0.057], [dir * 0.128, -0.004, 0.048]], 0.0085);
  return merge([rose, neck, arm]);
}
// butt hinge 100 x 75 mm: two leaves and a knuckle barrel with finials (frame: barrel along y at
// the origin, leaves in the x-y plane on either side)
export function hinge() {
  const leafA = new THREE.BoxGeometry(0.034, 0.1, 0.003).translate(-0.019, 0, 0);
  const leafB = new THREE.BoxGeometry(0.034, 0.1, 0.003).translate(0.019, 0, 0);
  const barrel = new THREE.CylinderGeometry(0.0055, 0.0055, 0.1, 16);
  const tip = (y) => new THREE.SphereGeometry(0.0055, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1).translate(0, y, 0);
  return merge([leafA, leafB, barrel, tip(0.05), tip(-0.05).rotateX(Math.PI)]);
}
// bar pull: round bar of radius r on two standoffs, length L between centres (frame: mounting
// face z 0, +z out; the bar runs along y)
export function barPull(L, r = 0.0095, out = 0.035, over = 0.04) {
  const so = (y) => latheZ([[r * 0.75, 0], [r * 0.75, out - r * 0.5], [0, out - r * 0.5]], 16).translate(0, y, 0);
  const b = bar([[0, -L / 2 - over, out], [0, L / 2 + over, out]], r, 16);
  return merge([so(-L / 2), so(L / 2), b]);
}
// a countertop slab with rounded edges and rectangular cut-outs with rounded corners
// (frame: top at y 0, centred, x along the run, z across); holes: [cx, cz, w, d, r]
export function counter(L, D, t, holes = [], edge = 0.003) {
  const s = new THREE.Shape([[-L / 2, -D / 2], [L / 2, -D / 2], [L / 2, D / 2], [-L / 2, D / 2]].map(([x, z]) => new THREE.Vector2(x, z)));
  for (const [cx, cz, w, d, r] of holes) {
    const p = new THREE.Path(), x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    p.moveTo(x0 + r, z0); p.lineTo(x1 - r, z0); p.quadraticCurveTo(x1, z0, x1, z0 + r); p.lineTo(x1, z1 - r); p.quadraticCurveTo(x1, z1, x1 - r, z1);
    p.lineTo(x0 + r, z1); p.quadraticCurveTo(x0, z1, x0, z1 - r); p.lineTo(x0, z0 + r); p.quadraticCurveTo(x0, z0, x0 + r, z0);
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: t - 2 * edge, bevelEnabled: true, bevelThickness: edge, bevelSize: edge, bevelSegments: 2, curveSegments: 10 });
  g.rotateX(Math.PI / 2); g.translate(0, -edge, 0);      // shape z -> world z, extrusion goes down
  // metric UVs from the top view
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  return flat(g);
}
// undermount basin: an open rounded bowl, faces looking inward (frame: rim at y 0, centred);
// w x d opening, depth, corner radius r, a drain at the bottom
export function basin(w, d, depth, r) {
  const n = 6, P = [];
  // rounded-rectangle ring at height y, inset k (the walls taper 1 cm toward the bottom)
  const ring = (y, k) => {
    const pts = [];
    const ww = w / 2 - k, dd = d / 2 - k, rr = Math.max(0.005, r - k * 0.5);
    for (const [cx, cz, a0] of [[ww - rr, dd - rr, 0], [-ww + rr, dd - rr, Math.PI / 2], [-ww + rr, -dd + rr, Math.PI], [ww - rr, -dd + rr, Math.PI * 1.5]])
      for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; pts.push([cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr]); }
    return pts;
  };
  const rows = [[0, 0], [-depth * 0.5, 0.004], [-depth * 0.85, 0.01], [-depth, 0.03]];
  const R = rows.map(([y, k]) => ring(y, k));
  const m = R[0].length;
  for (let j = 0; j < R.length - 1; j++) for (let i = 0; i < m; i++) {
    const a = R[j][i], b = R[j][(i + 1) % m], c = R[j + 1][(i + 1) % m], e = R[j + 1][i];
    P.push(...a, ...e, ...c, ...a, ...c, ...b);        // facing inward
  }
  const bot = R[R.length - 1], cy = -depth;
  for (let i = 0; i < m; i++) { const a = bot[i], b = bot[(i + 1) % m]; P.push(0, cy, 0, ...b, ...a); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals();
  const uv = new Float32Array(P.length / 3 * 2); for (let i = 0; i < P.length / 3; i++) { uv[i * 2] = P[i * 3]; uv[i * 2 + 1] = P[i * 3 + 2] + P[i * 3 + 1]; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
export function drain(r = 0.022) {
  return merge([new THREE.CylinderGeometry(r, r, 0.004, 24).translate(0, 0.002, 0), new THREE.TorusGeometry(r, 0.002, 6, 24).rotateX(Math.PI / 2).translate(0, 0.004, 0)]);
}
// kitchen pull-down faucet (frame: deck at y 0, the spout reaching toward +z): a 32 mm column
// arching over 220 mm, the lever on the side
export function kitchenFaucet() {
  const base = new THREE.CylinderGeometry(0.027, 0.03, 0.02, 32).translate(0, 0.01, 0);
  const col = bar([[0, 0.02, 0], [0, 0.25, 0], [0, 0.36, 0.04], [0, 0.38, 0.12], [0, 0.34, 0.2], [0, 0.29, 0.22]], 0.014);
  const head = new THREE.CylinderGeometry(0.017, 0.015, 0.06, 24).translate(0, 0.27, 0.22);
  const lev = bar([[0.016, 0.12, 0], [0.04, 0.14, 0], [0.075, 0.15, 0]], 0.0055);
  return merge([base, col, head, lev]);
}
// deck-mounted bath faucet: short spout and a single lever (frame as kitchenFaucet)
export function bathFaucet() {
  const base = new THREE.CylinderGeometry(0.022, 0.025, 0.015, 32).translate(0, 0.0075, 0);
  const col = new THREE.CylinderGeometry(0.016, 0.018, 0.16, 32).translate(0, 0.095, 0);
  const spout = bar([[0, 0.15, 0.005], [0, 0.155, 0.08], [0, 0.135, 0.12]], 0.009);
  const lev = bar([[0, 0.178, 0], [0, 0.19, -0.04], [0, 0.192, -0.08]], 0.005);
  const cap = new THREE.SphereGeometry(0.016, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.175, 0);
  return merge([base, col, spout, lev, cap]);
}
// toilet seat ring and closed lid (frame: seat on y 0, the hinge at z 0, the bowl toward +z)
export function toiletSeat(L = 0.5, W = 0.37) {
  const ring = latheZ([[0.11, 0], [0.155, 0], [0.16, 0.012], [0.15, 0.022], [0.115, 0.02], [0.11, 0.012]], 40).rotateX(-Math.PI / 2);
  ring.scale(W / 0.32, 1, L / 0.32); ring.translate(0, 0, L / 2 + 0.02);
  const lid = latheZ([[0, 0.022], [0.15, 0.022], [0.163, 0.03], [0.16, 0.045], [0.14, 0.05], [0, 0.05]], 40).rotateX(-Math.PI / 2);
  lid.scale(W / 0.32, 1, L / 0.32); lid.translate(0, 0.002, L / 2 + 0.02);
  const hingeCaps = [-0.08, 0.08].map((x) => new THREE.CylinderGeometry(0.012, 0.012, 0.03, 16).rotateZ(Math.PI / 2).translate(x, 0.035, 0.015));
  return merge([ring, lid, ...hingeCaps]);
}
// dual-flush plate (frame: wall face z 0): a rounded slab and two buttons, half and full
export function flushPlate() {
  const s = new THREE.Shape(); const w = 0.12, h = 0.075, r = 0.012;
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  const plate = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 6 });
  const b1 = new THREE.BoxGeometry(0.07, 0.07, 0.004).translate(-0.042, 0, 0.009), b2 = new THREE.BoxGeometry(0.1, 0.07, 0.004).translate(0.035, 0, 0.009);
  return merge([plate, b1, b2]);
}

// mirror a geometry through z = 0 keeping faces outward (winding swapped)
export function mirrorZ(g) {
  g = flat(g); g.scale(1, 1, -1);
  const a = g.attributes.position.array;
  for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
  for (const key of ['uv']) { const u = g.attributes[key]; if (!u) continue; const b = u.array; for (let i = 0; i < b.length; i += 6) for (let k = 0; k < 2; k++) { const t = b[i + 2 + k]; b[i + 2 + k] = b[i + 4 + k]; b[i + 4 + k] = t; } }
  g.computeVertexNormals();
  return g;
}

// shower set (apartment-03), wall face z 0, +z out, origin at the mixer: a round trim plate with
// a lever, a wall arm and a 200 mm head 0.9 m above it, a hand shower on its hose and holder
export function showerSet() {
  const trim = latheZ([[0, 0], [0.075, 0], [0.075, 0.006], [0.07, 0.012], [0, 0.012]], 40);
  const valve = latheZ([[0.022, 0.012], [0.022, 0.05], [0, 0.05]], 24);
  const lev = bar([[0, 0, 0.045], [0, -0.03, 0.055], [0, -0.075, 0.06]], 0.006);
  const arm = bar([[0, 0.9, 0.0], [0, 0.92, 0.12], [0, 0.95, 0.3]], 0.011);
  const flange = latheZ([[0, 0], [0.03, 0], [0.03, 0.01], [0, 0.01]], 24).translate(0, 0.9, 0);
  const head = new THREE.CylinderGeometry(0.1, 0.1, 0.012, 48).translate(0, 0.93, 0.3);
  const holder = latheZ([[0, 0], [0.025, 0], [0.025, 0.03], [0, 0.03]], 20).translate(0.22, 0.25, 0);
  const handle = bar([[0.22, 0.2, 0.045], [0.22, 0.38, 0.05]], 0.013);
  const hhead = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 24).rotateX(Math.PI / 2).translate(0.22, 0.4, 0.06);
  const hose = bar([[0.22, 0.2, 0.045], [0.2, 0.05, 0.06], [0.12, -0.25, 0.05], [0.04, -0.1, 0.03], [0.02, -0.02, 0.02]], 0.007, 8);
  return merge([trim, valve, lev, arm, flange, head, holder, handle, hhead, hose]);
}
// towel ring on a round rose (wall face z 0)
export function towelRing() {
  const rose = latheZ([[0, 0], [0.025, 0], [0.025, 0.008], [0, 0.008]], 24);
  const post = latheZ([[0.007, 0.008], [0.007, 0.05], [0, 0.05]], 12);
  const ring = new THREE.TorusGeometry(0.09, 0.006, 10, 40).translate(0, -0.09, 0.055);
  return merge([rose, post, ring]);
}
// screwless decorator wall plate 70 x 115 mm, 6 mm deep, bevelled edge (frame: wall face z 0,
// +z out, centred); opening for one decorator device 33.5 x 67 mm
const plateGeo = (w = 0.0656, h = 0.1106, open = true) => {
  const s = new THREE.Shape(); const r = 0.004;
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  if (open) { const p = new THREE.Path(); p.moveTo(-0.01675, -0.0335); p.lineTo(0.01675, -0.0335); p.lineTo(0.01675, 0.0335); p.lineTo(-0.01675, 0.0335); p.lineTo(-0.01675, -0.0335); s.holes.push(p); }
  return new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.0022, bevelSegments: 3, curveSegments: 4 }).translate(0, 0, 0.0025);
};
// light switch: plate + a rocker paddle (33 x 66 mm) that is rocked 2.5 degrees (top in) and
// stands 2-4 mm proud of the plate, set in a dark device body
export function switchPlate() {
  const body = new THREE.BoxGeometry(0.0335, 0.067, 0.006).translate(0, 0, 0.003);
  const pad = new THREE.Shape(); const w = 0.0158, h = 0.0325, r = 0.002;
  pad.moveTo(-w + r, -h); pad.lineTo(w - r, -h); pad.quadraticCurveTo(w, -h, w, -h + r); pad.lineTo(w, h - r); pad.quadraticCurveTo(w, h, w - r, h); pad.lineTo(-w + r, h); pad.quadraticCurveTo(-w, h, -w, h - r); pad.lineTo(-w, -h + r); pad.quadraticCurveTo(-w, -h, -w + r, -h);
  const rocker = new THREE.ExtrudeGeometry(pad, { depth: 0.002, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.0008, bevelSegments: 2, curveSegments: 3 }).rotateX(-0.044).translate(0, 0, 0.0065);
  return { plate: merge([plateGeo()]), rocker: merge([rocker]), body: merge([body]) };
}
// duplex decorator receptacle: plate + device face 2 mm proud with two outlets, each with two
// vertical slots (one wider: neutral) and a ground hole cut through, a dark cavity behind
export function outletPlate() {
  const f = new THREE.Shape(); const w = 0.0164, h = 0.0328;
  f.moveTo(-w, -h); f.lineTo(w, -h); f.lineTo(w, h); f.lineTo(-w, h); f.lineTo(-w, -h);
  const slot = (cx, cy, sw, sh) => { const p = new THREE.Path(); p.moveTo(cx - sw / 2, cy - sh / 2); p.lineTo(cx + sw / 2, cy - sh / 2); p.lineTo(cx + sw / 2, cy + sh / 2); p.lineTo(cx - sw / 2, cy + sh / 2); p.lineTo(cx - sw / 2, cy - sh / 2); f.holes.push(p); };
  for (const cy of [0.0135, -0.0175]) {
    slot(-0.0063, cy + 0.003, 0.0017, 0.0075); slot(0.0063, cy + 0.003, 0.0022, 0.0085);
    const gr = new THREE.Path(); gr.absarc(0, cy - 0.0075, 0.0024, 0, Math.PI, false); gr.lineTo(-0.0024, cy - 0.0095); gr.lineTo(0.0024, cy - 0.0095); gr.lineTo(0.0024, cy - 0.0075); f.holes.push(gr);
  }
  const face = new THREE.ExtrudeGeometry(f, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0005, bevelSegments: 1, curveSegments: 6 }).translate(0, 0, 0.0055);
  const cavity = new THREE.BoxGeometry(0.03, 0.064, 0.002).translate(0, 0, 0.0045);
  return { plate: merge([plateGeo()]), face: merge([face]), cavity: merge([cavity]) };
}
