// Geometry builder: everything static is collected per material and merged into one mesh per
// material (few draw calls), and every solid piece also records a physics collider.
// Units are metres. x = east, y = up, z = south. UVs are in metres (textures repeat per metre).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _v = new THREE.Vector3();

// An axis-aligned box with metric UVs on every face.
export function boxGeo(x0, y0, z0, x1, y1, z1) {
  const P = [], N = [], U = [];
  const quad = (a, b, c, d, n, ua, ub, uc, ud) => {
    // two triangles a b c, a c d (counter-clockwise seen from n)
    P.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) N.push(...n);
    U.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
  };
  // +x
  quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [-z1, y0], [-z0, y0], [-z0, y1], [-z1, y1]);
  // -x
  quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [z0, y0], [z1, y0], [z1, y1], [z0, y1]);
  // +y (top): u = x, v = z
  quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [x0, z1], [x1, z1], [x1, z0], [x0, z0]);
  // -y
  quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [x0, z0], [x1, z0], [x1, z1], [x0, z1]);
  // +z
  quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [x0, y0], [x1, y0], [x1, y1], [x0, y1]);
  // -z
  quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [-x1, y0], [-x0, y0], [-x0, y1], [-x1, y1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return g;
}

// A flat horizontal polygon (x, z points) at height y, facing up (or down), metric UVs.
export function flatGeo(points, y, down = false) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  return shapeFlat(shape, y, down);
}
export function shapeFlat(shape, y, down = false) {
  const g = new THREE.ShapeGeometry(shape, 24);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getY(i);
    p.setXYZ(i, x, y, z);
    uv.setXY(i, x, z);
  }
  // ShapeGeometry faces +z; after mapping y -> z the winding faces down. Flip for up-facing.
  const idx = g.index.array;
  if (!down) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}

export class Builder {
  constructor() {
    this.buckets = new Map();
    this.colliders = [];
  }
  add(geo, mat) {
    if (!mat) return;
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    }
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    let b = this.buckets.get(mat);
    if (!b) this.buckets.set(mat, b = []);
    b.push(g);
  }
  // axis-aligned solid box; col: add a collider
  box(x0, y0, z0, x1, y1, z1, mat, col = true) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    if (mat) this.add(boxGeo(x0, y0, z0, x1, y1, z1), mat);
    if (col) this.colliders.push({ t: 'box', min: [x0, y0, z0], max: [x1, y1, z1], mat });
  }
  // box rotated about y; (cx, cy, cz) centre, (hx, hy, hz) half sizes
  obox(cx, cy, cz, hx, hy, hz, yaw, mat, col = true) {
    if (mat) {
      const g = boxGeo(-hx, -hy, -hz, hx, hy, hz);
      g.rotateY(yaw); g.translate(cx, cy, cz);
      this.add(g, mat);
    }
    if (col) this.colliders.push({ t: 'obox', c: [cx, cy, cz], h: [hx, hy, hz], yaw, mat });
  }
  convex(points) { this.colliders.push({ t: 'hull', p: points }); }
  trimesh(geo) {
    const g = geo.index ? geo : geo;
    const pos = g.attributes.position.array;
    let idx;
    if (g.index) idx = Uint32Array.from(g.index.array);
    else { idx = new Uint32Array(pos.length / 3); for (let i = 0; i < idx.length; i++) idx[i] = i; }
    this.colliders.push({ t: 'tri', v: Float32Array.from(pos), i: idx });
  }
  finish(group) {
    const meshes = [];
    for (const [mat, list] of this.buckets) {
      const g = mergeGeometries(list, false);
      if (!g) continue;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      const s = mat.userData.shadow || 'both';
      m.castShadow = s === 'both' || s === 'cast';
      m.receiveShadow = s === 'both' || s === 'receive';
      if (mat.userData.order) m.renderOrder = mat.userData.order;
      m.matrixAutoUpdate = false; m.updateMatrix();
      group.add(m); meshes.push(m);
    }
    this.buckets.clear();
    return meshes;
  }
}

// ---- curved pieces ------------------------------------------------------------------------

// position on a circle: theta measured from north (-z), turning toward west (-x)
export function polar(cx, cz, r, th) { return [cx - r * Math.sin(th), cz - r * Math.cos(th)]; }

// cylindrical shell (curved wall) between radii r0..r1, angles a0..a1, heights y0..y1
export function shellGeo(cx, cz, r0, r1, a0, a1, y0, y1, seg) {
  const P = [], N = [], U = [];
  const push = (p, n, u) => { P.push(...p); N.push(...n); U.push(...u); };
  const tri = (A, B, C) => { push(...A); push(...B); push(...C); };
  const at = (r, a, y) => { const [x, z] = polar(cx, cz, r, a); return [x, y, z]; };
  for (let i = 0; i < seg; i++) {
    const ta = a0 + (a1 - a0) * i / seg, tb = a0 + (a1 - a0) * (i + 1) / seg;
    for (const [r, s] of [[r0, -1], [r1, 1]]) {     // inner face looks to the centre, outer away
      const na = [-Math.sin(ta) * s, 0, -Math.cos(ta) * s], nb = [-Math.sin(tb) * s, 0, -Math.cos(tb) * s];
      const ua = r * ta, ub = r * tb;
      const A = [at(r, ta, y0), na, [ua, y0]], B = [at(r, tb, y0), nb, [ub, y0]];
      const C = [at(r, tb, y1), nb, [ub, y1]], D = [at(r, ta, y1), na, [ua, y1]];
      if (s < 0) { tri(A, C, B); tri(A, D, C); } else { tri(A, B, C); tri(A, C, D); }
    }
    for (const [y, s] of [[y1, 1], [y0, -1]]) {     // top and bottom caps
      const n = [0, s, 0];
      const A = [at(r0, ta, y), n, [0, 0]], B = [at(r1, ta, y), n, [0, 0]];
      const C = [at(r1, tb, y), n, [0, 0]], D = [at(r0, tb, y), n, [0, 0]];
      if (s > 0) { tri(A, B, C); tri(A, C, D); } else { tri(A, C, B); tri(A, D, C); }
    }
  }
  for (const [a, s] of [[a0, -1], [a1, 1]]) {        // end caps
    const t = [-Math.cos(a) * s, 0, Math.sin(a) * s];
    const A = [at(r0, a, y0), t, [r0, y0]], B = [at(r1, a, y0), t, [r1, y0]];
    const C = [at(r1, a, y1), t, [r1, y1]], D = [at(r0, a, y1), t, [r0, y1]];
    if (s < 0) { tri(A, B, C); tri(A, C, D); } else { tri(A, C, B); tri(A, D, C); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return g;
}

// Colliders for a curved wall: one oriented box per segment chord.
export function shellColliders(B, cx, cz, r0, r1, a0, a1, y0, y1, seg) {
  for (let i = 0; i < seg; i++) {
    const ta = a0 + (a1 - a0) * i / seg, tb = a0 + (a1 - a0) * (i + 1) / seg, tm = (ta + tb) / 2;
    const rm = (r0 + r1) / 2;
    const [x, z] = polar(cx, cz, rm, tm);
    const half = rm * Math.sin((tb - ta) / 2) + 0.03;
    // tangent direction at tm: d/dθ of (-sinθ, -cosθ) = (-cosθ, sinθ); yaw so local +x lies on it
    const yaw = Math.atan2(-Math.sin(tm), -Math.cos(tm));
    B.colliders.push({ t: 'obox', c: [x, (y0 + y1) / 2, z], h: [half, (y1 - y0) / 2, (r1 - r0) / 2], yaw, mat: 'shell' });
  }
}

export function tube(points, radius, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed);
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 3), radius, radial, closed);
}

export { _v };
