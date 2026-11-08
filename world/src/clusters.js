// Meshlet-style rendering for the static apartment and furniture (web form: no mesh shaders on
// WebGL, WebGPU or the Quest browser). Each merged mesh is split by meshoptimizer into clusters of
// at most 124 triangles / 64 vertices, all kept in one BatchedMesh per material and drawn with one
// multi-draw call. Before each draw only the clusters that can be seen are listed: inside the
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
    const n = ml.meshletCount;
    let vtot = 0, itot = 0;
    for (let i = 0; i < n; i++) { vtot += ml.meshlets[i * 4 + 2]; itot += ml.meshlets[i * 4 + 3] * 3; }
    const bm = new THREE.BatchedMesh(n, vtot, itot, mat);
    const attrs = Object.keys(g.attributes);
    for (let i = 0; i < n; i++) {
      const vo = ml.meshlets[i * 4], to = ml.meshlets[i * 4 + 1], vc = ml.meshlets[i * 4 + 2], tc = ml.meshlets[i * 4 + 3];
      const cg = new THREE.BufferGeometry();
      for (const k of attrs) {
        const src = g.attributes[k], sz = src.itemSize, arr = new Float32Array(vc * sz);
        for (let v = 0; v < vc; v++) { const s = ml.vertices[vo + v]; for (let c = 0; c < sz; c++) arr[v * sz + c] = src.array[s * sz + c]; }
        cg.setAttribute(k, new THREE.BufferAttribute(arr, sz));
      }
      const ix = new Uint16Array(tc * 3);
      for (let t = 0; t < tc * 3; t++) ix[t] = ml.triangles[to + t];
      cg.setIndex(new THREE.BufferAttribute(ix, 1));
      bm.addInstance(bm.addGeometry(cg));
    }
    // cone data per cluster (meshoptimizer: culled when dot(normalize(apex - eye), axis) >= cutoff)
    const cone = new Float32Array(n * 7);
    bounds.forEach((b, i) => cone.set([b.coneApexX, b.coneApexY, b.coneApexZ, b.coneAxisX, b.coneAxisY, b.coneAxisZ, b.coneCutoff], i * 7));
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
