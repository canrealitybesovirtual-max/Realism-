// Mirrors that work. furniture.js gives every mirror its own material carrying its plane
// (material.userData.mirror { p, n }: a point on the glass and the normal into the room, apartment
// coordinates; furnish() copies it to mesh.userData.mirror). Here:
//  - the nearest mirror you face (within RANGE, in view, you in front of it) is a real planar
//    reflection: the scene drawn from the camera mirrored in its plane (oblique near plane on the
//    glass, so nothing behind the wall shows), at half the screen's size on a computer and 512 px on
//    the headset, read back on the glass by projective texturing (each eye in VR, as three's
//    Reflector: the reflection is drawn just before the glass, from that eye's camera);
//  - every other mirror shows a cube capture of the room taken once from in front of it (opts.cubes;
//    the world page has its own box-projected room probes and passes cubes: false).
// setupMirrors(group, renderer, Q, meshes, opts) -> tick(camera): call once a frame with the camera
// the scene is drawn with (the XR camera while presenting), or null to switch them off.
import * as THREE from 'three';

const RANGE = 6, KEEP = 0.6;

const VERT = /* glsl */`
uniform mat4 textureMatrix;
varying vec4 vUv;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = textureMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  #include <logdepthbuf_vertex>
}`;
// silvered glass reflects ~90 % with a faint green-grey cast; the glass face adds a little of the
// front surface's own (Fresnel) reflection at grazing angles
const FRAG = /* glsl */`
uniform vec3 color;
uniform sampler2D tDiffuse;
varying vec4 vUv;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec4 base = texture2DProj( tDiffuse, vUv );
  gl_FragColor = vec4( color * base.rgb, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function setupMirrors(group, renderer, Q = {}, meshes = null, opts = {}) {
  const xrLow = !!Q.quest;
  const list = [];
  const src = meshes || [];
  if (!meshes) group.traverse((o) => { if (o.isMesh && o.userData.mirror) src.push(o); });
  for (const m of src) {
    if (!m.isMesh || !(m.userData.mirror || (m.material && m.material.userData && m.material.userData.mirror))) continue;
    const info = m.userData.mirror || m.material.userData.mirror;
    m.geometry.computeBoundingSphere();
    list.push({ mesh: m, base: m.material, lp: new THREE.Vector3(...info.p), ln: new THREE.Vector3(...info.n).normalize(),
      p: new THREE.Vector3(), n: new THREE.Vector3(), sphere: new THREE.Sphere(), cube: null, cubeWanted: false });
  }
  if (!list.length) return () => {};

  // one planar reflection at a time: its render target, mirrored camera and glass material
  const size = new THREE.Vector2();
  const rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: xrLow ? 0 : 4 });
  rt.texture.generateMipmaps = false;
  const textureMatrix = new THREE.Matrix4();
  const mat = new THREE.ShaderMaterial({
    name: 'mirror-planar',
    uniforms: { color: { value: new THREE.Color(0.86, 0.885, 0.87) }, tDiffuse: { value: rt.texture }, textureMatrix: { value: textureMatrix } },
    vertexShader: VERT, fragmentShader: FRAG,
  });
  const vcam = new THREE.PerspectiveCamera();
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), q4 = new THREE.Vector4();
  const vPos = new THREE.Vector3(), cPos = new THREE.Vector3(), look = new THREE.Vector3(), tgt = new THREE.Vector3(), rot = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  let active = null, tickCam = null, busy = false, frame = 0, lastFrame = -1, lastCam = null;
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), toM = new THREE.Vector3(), fwd = new THREE.Vector3();

  function place(e) {
    const w = e.mesh.matrixWorld;
    e.p.copy(e.lp).applyMatrix4(w);
    e.n.copy(e.ln).applyMatrix3(nm.getNormalMatrix(w)).normalize();
    e.sphere.copy(e.mesh.geometry.boundingSphere).applyMatrix4(w);
  }
  function camOK(cam) {
    if (!tickCam || !cam) return false;
    if (cam === tickCam) return true;
    return !!(tickCam.cameras && tickCam.cameras.includes(cam));
  }
  // the reflection, drawn just before the glass for the camera about to draw it (each eye in VR)
  function onBefore(r, scene, camera) {
    if (busy || !active || this !== active.mesh || !camOK(camera) || scene.overrideMaterial) return;
    if (camera === lastCam && frame === lastFrame) return;          // drawn already for this camera this frame (a second pass)
    lastCam = camera; lastFrame = frame;
    const e = active;
    cPos.setFromMatrixPosition(camera.matrixWorld);
    vPos.subVectors(e.p, cPos);
    if (vPos.dot(e.n) > 0) return;                                 // behind the glass
    vPos.reflect(e.n).negate().add(e.p);
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(cPos);
    tgt.subVectors(e.p, look).reflect(e.n).negate().add(e.p);
    vcam.position.copy(vPos);
    vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(e.n);
    vcam.lookAt(tgt);
    vcam.far = camera.far; vcam.near = camera.near;
    vcam.layers.mask = camera.layers.mask;
    vcam.updateMatrixWorld();
    vcam.projectionMatrix.copy(camera.projectionMatrix);
    vcam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    textureMatrix.multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse).multiply(e.mesh.matrixWorld);
    // oblique near plane on the glass (Lengyel): nothing behind the mirror is drawn
    plane.setFromNormalAndCoplanarPoint(e.n, e.p).applyMatrix4(vcam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const P = vcam.projectionMatrix.elements;
    q4.set((Math.sign(clip.x) + P[8]) / P[0], (Math.sign(clip.y) + P[9]) / P[5], -1, (1 + P[10]) / P[14]);
    clip.multiplyScalar(2 / clip.dot(q4));
    P[2] = clip.x; P[6] = clip.y; P[10] = clip.z + 1 - 0.003; P[14] = clip.w;
    // draw it: xr off (one plain camera), shadows as they are, then put everything back
    busy = true;
    const prevRT = r.getRenderTarget(), prevXR = r.xr.enabled, prevAuto = r.shadowMap.autoUpdate, prevNeed = r.shadowMap.needsUpdate;
    const vis = e.mesh.visible;
    e.mesh.visible = false;
    r.xr.enabled = false; r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false;
    try {
      r.setRenderTarget(rt);
      r.state.buffers.depth.setMask(true);
      if (r.autoClear === false) r.clear();
      r.render(scene, vcam);
    } finally {
      r.xr.enabled = prevXR; r.shadowMap.autoUpdate = prevAuto; r.shadowMap.needsUpdate = prevNeed;
      r.setRenderTarget(prevRT);
      if (camera.viewport !== undefined) r.state.viewport(camera.viewport);
      e.mesh.visible = vis;
      busy = false;
    }
  }
  for (const e of list) e.mesh.onBeforeRender = onBefore;

  // cube fallback: one capture per mirror, from 1.2 m in front of the glass at eye height, taken
  // the first time you come near it (one per tick, outside the frame's own render)
  let root = null;
  function capture(e) {
    if (!root) { root = group; while (root.parent) root = root.parent; }
    const n = xrLow ? 64 : 128;
    const crt = new THREE.WebGLCubeRenderTarget(n, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(0.05, 200, crt);
    cc.position.copy(e.p).addScaledVector(e.n, 1.2); cc.position.y = Math.max(cc.position.y, e.p.y);
    root.add(cc); cc.updateMatrixWorld(true);
    const vis = e.mesh.visible, xr = renderer.xr.enabled, prevRT = renderer.getRenderTarget(), na = renderer.shadowMap.needsUpdate;
    e.mesh.visible = false; renderer.xr.enabled = false; busy = true;
    try { cc.update(renderer, root); } catch (err) { console.warn('mirror capture', err); }
    busy = false; e.mesh.visible = vis; renderer.xr.enabled = xr; renderer.setRenderTarget(prevRT); renderer.shadowMap.needsUpdate = na;
    root.remove(cc);
    const m = e.base.clone();
    m.envMap = crt.texture; m.envMapIntensity = 1; m.roughness = 0.0; m.needsUpdate = true;
    e.cube = m;
    if (e.mesh.material === e.base) e.mesh.material = m;
    e.base = m;
  }

  const cubes = opts.cubes !== false;
  let pendingCube = null;
  const tick = function (camera) {
    tickCam = camera; frame++;
    let best = null;
    if (camera) {
      camera.updateMatrixWorld();
      const c = camera.isArrayCamera && camera.cameras.length ? camera.cameras[0] : camera;
      cPos.setFromMatrixPosition(camera.matrixWorld);
      pv.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
      camera.getWorldDirection(fwd);
      let bd = Infinity;
      for (const e of list) {
        if (!e.mesh.visible || !e.mesh.parent) continue;          // shattered (the game hides it): never the live one
        place(e);
        toM.subVectors(cPos, e.p);
        const front = toM.dot(e.n), d = e.sphere.distanceToPoint(cPos);
        if (cubes && !e.cube && !pendingCube && d < RANGE * 1.6 && front > 0) pendingCube = e;
        if (front < 0.03 || d > RANGE + (e === active ? KEEP : 0)) continue;
        if (!frustum.intersectsSphere(e.sphere) && !(camera.isArrayCamera)) continue;
        if (camera.isArrayCamera && toM.copy(e.sphere.center).sub(cPos).normalize().dot(fwd) < 0.1) continue;
        const score = d - (e === active ? KEEP : 0);
        if (score < bd) { bd = score; best = e; }
      }
    }
    if (best !== active) {
      if (active) active.mesh.material = active.base;
      active = best;
      if (active) active.mesh.material = mat;
    }
    if (active) {
      // reflection size: half the drawing buffer on a computer, 512 square per eye on the headset
      let w = 512, h = 512;
      if (!(renderer.xr.isPresenting || xrLow)) { renderer.getDrawingBufferSize(size); w = Math.max(256, Math.round(size.x * 0.5)); h = Math.max(256, Math.round(size.y * 0.5)); }
      if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    }
    if (pendingCube) { const e = pendingCube; pendingCube = null; if (!e.cube) capture(e); }
  };
  if (typeof location !== 'undefined' && /[?&]dev\b/.test(location.search)) globalThis.__aptMirrors = { tick, list, get active() { return active; } };   // tests
  return tick;
}
