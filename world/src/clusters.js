// Meshlet-style rendering for the static apartment and furniture (web form: no mesh shaders on
// WebGL, WebGPU or the Quest browser). Each merged mesh is split by meshoptimizer into clusters of
// at most 124 triangles / 64 vertices, grouped into spatial chunks of ~3k triangles (one draw each:
// most WebGL drivers loop multi-draw), all kept in one BatchedMesh per material. Before each draw only the clusters that can be seen are listed: inside the
// camera's frustum (three's per-object culling on each cluster's sphere) and not facing away from
// the camera (meshoptimizer's normal cone). Shadow passes draw every cluster (they render back
// faces). Transparent meshes stay as they are (they need sorting by object).
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptClusterizer } from '../vendor/meshopt/meshopt_clusterizer.js';

const _cam = new THREE.Vector3(), _inv = new THREE.Matrix4();

// Plain materials (standard, no maps, opaque, front side, no emissive) differ only in colour, roughness and metalness:
// their meshes are merged into one mesh with those per vertex (color + aRM), drawn by one shared material, so they
// become one batch (one draw) instead of one per material. opts.prep(mat) patches the shared material (finish.js).
const PLAIN_MAT = { m: null };
function isPlain(m) {
  return m && m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial && !m.map && !m.normalMap && !m.roughnessMap && !m.metalnessMap &&
    !m.emissiveMap && !m.alphaMap && !m.aoMap && !m.transparent && !m.alphaTest && m.side === THREE.FrontSide && !m.userData.mirror &&
    m.emissive.r + m.emissive.g + m.emissive.b === 0 && !m.vertexColors && !(m.userData && m.userData.order);
}
function plainMaterial(prep) {
  if (PLAIN_MAT.m) return PLAIN_MAT.m;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
  m.name = 'plain (merged)';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aRM;\nvarying vec2 vRM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * vRM.y;');
  };
  m.customProgramCacheKey = () => 'plainRM';
  if (prep) prep(m);
  return (PLAIN_MAT.m = m);
}
function mergePlain(meshes, prep) {
  const groups = new Map(), rest = [];
  for (const m of meshes) {
    if (!m.isMesh || m.isBatchedMesh || !m.parent || m.geometry.index || !isPlain(m.material) || !m.geometry.attributes.normal || !m.geometry.attributes.uv) { rest.push(m); continue; }
    const k = m.parent.uuid + (m.castShadow ? 'c' : '') + (m.receiveShadow ? 'r' : '');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  const out = [...rest];
  for (const list of groups.values()) {
    if (list.length < 2) { out.push(...list); continue; }
    const parts = list.map((m) => {
      const g = new THREE.BufferGeometry(), n = m.geometry.attributes.position.count, mat = m.material, col = new Float32Array(n * 3), rm = new Float32Array(n * 2);
      for (const a of ['position', 'normal', 'uv']) g.setAttribute(a, m.geometry.attributes[a]);
      for (let i = 0; i < n; i++) { col[i * 3] = mat.color.r; col[i * 3 + 1] = mat.color.g; col[i * 3 + 2] = mat.color.b; rm[i * 2] = mat.roughness; rm[i * 2 + 1] = mat.metalness; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
      if (!m.matrix.equals(new THREE.Matrix4())) g.applyMatrix4(m.matrix);
      return g;
    });
    const geo = mergeGeometries(parts, false);
    if (!geo) { out.push(...list); continue; }
    const mm = new THREE.Mesh(geo, plainMaterial(prep));
    mm.castShadow = list[0].castShadow; mm.receiveShadow = list[0].receiveShadow; mm.userData = { plainMerged: list.length };
    mm.matrixAutoUpdate = false; mm.updateMatrix();
    list[0].parent.add(mm);
    for (const m of list) { m.parent.remove(m); m.geometry.dispose(); }
    out.push(mm);
  }
  return out;
}

export async function clusterize(meshes, opts = {}) {
  await MeshoptClusterizer.ready;
  const stats = { meshes: 0, clusters: 0, tris: 0, plain: 0 };
  const replaced = [];
  if (opts.mergePlain) { const n0 = meshes.length; meshes = mergePlain(meshes, opts.prep); stats.plain = n0 - meshes.length; }
  for (const m of meshes) {
    const mat = m.material;
    if (!m.isMesh || m.isBatchedMesh || mat.transparent || m.userData.mirror || !m.geometry.attributes.normal || m.geometry.index) continue;
    if (!m.parent) continue;
    const g0 = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv', 'color', 'aRM']) if (m.geometry.attributes[k]) g0.setAttribute(k, m.geometry.attributes[k]);
    const g = mergeVertices(g0, 1e-5);
    const pos = g.attributes.position.array, idx = Uint32Array.from(g.index.array);
    const ml = MeshoptClusterizer.buildMeshlets(idx, pos, 3, 64, 124, 0.25);
    const bounds = MeshoptClusterizer.computeMeshletBounds(ml, pos, 3);
    // PERF: WebGL has no real multi-draw on most drivers (ANGLE on Metal / D3D, the Quest browser loop over the list), so
    // 124-triangle clusters meant thousands of draws a frame. Meshlets are grouped into spatial chunks of about CHUNK
    // triangles (sorted along a Morton curve of their centres, a chunk stops at CHUNK or when it would span more than
    // SPAN metres), each one instance with its own sphere for frustum culling and a merged normal cone (kept only when
    // its members face one way, e.g. one wall).
    const CHUNK = opts.chunk ?? 4096, SPAN = opts.span ?? 6, nm = ml.meshletCount;
    const order = Array.from({ length: nm }, (_, i) => i);
    const q = (v) => Math.max(0, Math.min(1023, Math.floor((v + 64) / 0.5)));
    const spread = (x) => { x &= 1023; x = (x | (x << 16)) & 0x30000ff; x = (x | (x << 8)) & 0x300f00f; x = (x | (x << 4)) & 0x30c30c3; x = (x | (x << 2)) & 0x9249249; return x; };
    const mort = new Float64Array(nm);
    for (let i = 0; i < nm; i++) { const b = bounds[i]; mort[i] = spread(q(b.centerX)) | (spread(q(b.centerY)) << 1) | (spread(q(b.centerZ)) << 2); }
    order.sort((a, b) => mort[a] - mort[b]);
    const groups = [];
    { let cur = null;
      for (const i of order) {
        const b = bounds[i], tc = ml.meshlets[i * 4 + 3], r = b.radius;
        if (cur) {
          const x0 = Math.min(cur.x0, b.centerX - r), x1 = Math.max(cur.x1, b.centerX + r), y0 = Math.min(cur.y0, b.centerY - r), y1 = Math.max(cur.y1, b.centerY + r), z0 = Math.min(cur.z0, b.centerZ - r), z1 = Math.max(cur.z1, b.centerZ + r);
          if (cur.t + tc > CHUNK || Math.max(x1 - x0, y1 - y0, z1 - z0) > SPAN) cur = null;
          else { Object.assign(cur, { x0, x1, y0, y1, z0, z1 }); cur.t += tc; cur.m.push(i); continue; }
        }
        cur = { m: [i], t: tc, x0: b.centerX - r, x1: b.centerX + r, y0: b.centerY - r, y1: b.centerY + r, z0: b.centerZ - r, z1: b.centerZ + r };
        groups.push(cur);
      }
    }
    const n = groups.length;
    let vtot = 0, itot = 0;
    for (const G of groups) for (const i of G.m) { vtot += ml.meshlets[i * 4 + 2]; itot += ml.meshlets[i * 4 + 3] * 3; }
    const bm = new THREE.BatchedMesh(n, vtot, itot, mat);
    const attrs = Object.keys(g.attributes);
    const cone = new Float32Array(n * 7);
    groups.forEach((G, gi) => {
      let vc = 0, tc = 0; for (const i of G.m) { vc += ml.meshlets[i * 4 + 2]; tc += ml.meshlets[i * 4 + 3]; }
      const cg = new THREE.BufferGeometry();
      const arrs = attrs.map((k) => new Float32Array(vc * g.attributes[k].itemSize));
      const ix = vc < 65536 ? new Uint16Array(tc * 3) : new Uint32Array(tc * 3);
      let vb = 0, tb = 0;
      for (const i of G.m) {
        const vo = ml.meshlets[i * 4], to = ml.meshlets[i * 4 + 1], mvc = ml.meshlets[i * 4 + 2], mtc = ml.meshlets[i * 4 + 3];
        attrs.forEach((k, ai) => { const src = g.attributes[k], sz = src.itemSize, arr = arrs[ai]; for (let v = 0; v < mvc; v++) { const sI = ml.vertices[vo + v]; for (let c = 0; c < sz; c++) arr[(vb + v) * sz + c] = src.array[sI * sz + c]; } });
        for (let t = 0; t < mtc * 3; t++) ix[tb + t] = vb + ml.triangles[to + t];
        vb += mvc; tb += mtc * 3;
      }
      attrs.forEach((k, ai) => cg.setAttribute(k, new THREE.BufferAttribute(arrs[ai], g.attributes[k].itemSize)));
      cg.setIndex(new THREE.BufferAttribute(ix, 1));
      bm.addInstance(bm.addGeometry(cg));
      // merged cone: mean axis; the chunk can be culled only if every member cone fits inside it
      let ax = 0, ay = 0, az = 0, ok = true;
      for (const i of G.m) { const b = bounds[i]; if (b.coneCutoff >= 1) { ok = false; break; } ax += b.coneAxisX; ay += b.coneAxisY; az += b.coneAxisZ; }
      let cut = 1;
      if (ok) {
        const l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l;
        let worst = 0;   // the widest member half-angle plus its axis' angle from the mean, as a sine-free cutoff bound
        for (const i of G.m) { const b = bounds[i]; const d = Math.min(1, Math.max(-1, b.coneAxisX * ax + b.coneAxisY * ay + b.coneAxisZ * az)); const ang = Math.acos(d) + Math.asin(Math.min(1, Math.sqrt(Math.max(0, 1 - b.coneCutoff * b.coneCutoff)))); worst = Math.max(worst, ang); }
        cut = worst < Math.PI / 2 - 0.1 ? Math.min(1, Math.sin(worst) + 0.06) : 1;   // the chunk centre stands in for meshopt's apex: a little margin
      }
      cone.set([(G.x0 + G.x1) / 2, (G.y0 + G.y1) / 2, (G.z0 + G.z1) / 2, ax, ay, az, cut], gi * 7);
      G.r = Math.hypot(G.x1 - G.x0, G.y1 - G.y0, G.z1 - G.z0) / 2;
    });
    bm.matrixAutoUpdate = m.matrixAutoUpdate; bm.matrix.copy(m.matrix); bm.matrix.decompose(bm.position, bm.quaternion, bm.scale);
    bm.castShadow = m.castShadow; bm.receiveShadow = m.receiveShadow; bm.renderOrder = m.renderOrder;
    bm.perObjectFrustumCulled = true;
    bm.userData = { ...m.userData, clusters: n };
    let shadowPass = false;
    const baseRender = bm.onBeforeRender.bind(bm), baseShadow = bm.onBeforeShadow.bind(bm);
    bm.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      const info = bm._instanceInfo;
      if (shadowPass || material.side === THREE.DoubleSide || mat.side === THREE.DoubleSide) {
        for (let i = 0; i < n; i++) info[i].visible = true;
      } else {
        _cam.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(_inv.copy(bm.matrixWorld).invert());   // cone data is in the mesh's own space
        for (let i = 0; i < n; i++) {
          const o = i * 7, cut = cone[o + 6];
          if (cut >= 1) { info[i].visible = true; continue; }
          let dx = cone[o] - _cam.x, dy = cone[o + 1] - _cam.y, dz = cone[o + 2] - _cam.z;
          const l = Math.hypot(dx, dy, dz) || 1;
          info[i].visible = (dx * cone[o + 3] + dy * cone[o + 4] + dz * cone[o + 5]) / l < cut + 0.02;
        }
      }
      bm._visibilityChanged = true;
      baseRender(renderer, scene, camera, geometry, material, group);
    };
    bm.onBeforeShadow = (...a) => { shadowPass = true; baseShadow(...a); shadowPass = false; };
    m.parent.add(bm);
    m.parent.remove(m);
    replaced.push([m, bm]);
    stats.meshes++; stats.clusters += n; stats.tris += idx.length / 3;
    g.dispose(); g0.dispose(); m.geometry.dispose();
  }
  return { replaced, stats };
}
