// Multiview check (CQC's patched three.js): render a scene once with an ArrayCamera into a 2-layer
// multiview target, and each eye on its own into an ordinary target, then compare the pixels.
// mvCompare(THREE, renderer, scene, eyes[2], w, h, prep?(arrayCamera)) -> { maxDiff, meanDiff, bad, px: [Uint8Array, Uint8Array], ref }
export function mvCompare(THREE, renderer, scene, eyes, w, h, prep) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('OCULUS_multiview') || gl.getExtension('OVR_multiview2');
  if (!ext) return { error: 'no multiview extension' };
  const state = renderer.state;
  const color = gl.createTexture(); state.bindTexture(gl.TEXTURE_2D_ARRAY, color);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, w, h, 2);
  const depth = gl.createTexture(); state.bindTexture(gl.TEXTURE_2D_ARRAY, depth);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH24_STENCIL8, w, h, 2);
  state.unbindTexture();
  const fb = gl.createFramebuffer(); state.bindFramebuffer(gl.FRAMEBUFFER, fb);
  ext.framebufferTextureMultiviewOVR(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, color, 0, 0, 2);
  ext.framebufferTextureMultiviewOVR(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, depth, 0, 0, 2);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, stencilBuffer: false, colorSpace: THREE.SRGBColorSpace });
  rt.multiview = true; rt.isXRRenderTarget = true;
  renderer.setRenderTargetFramebuffer(rt, fb);
  const arr = new THREE.ArrayCamera(eyes);
  arr.layers.enableAll();
  eyes.forEach((e) => { e.viewport = new THREE.Vector4(0, 0, w, h); e.updateMatrixWorld(); });
  // the common camera: midway, union-ish projection (only culling depends on it)
  arr.position.copy(eyes[0].position).add(eyes[1].position).multiplyScalar(0.5); arr.quaternion.copy(eyes[0].quaternion);
  arr.projectionMatrix.copy(eyes[0].projectionMatrix); arr.projectionMatrixInverse.copy(eyes[0].projectionMatrixInverse);
  arr.updateMatrixWorld(); arr.matrixWorldInverse.copy(arr.matrixWorld).invert();
  if (prep) prep(arr);
  const prevRT = renderer.getRenderTarget(), prevXR = renderer.xr.enabled;
  renderer.xr.enabled = false;
  const t0 = performance.now();
  renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, arr);
  gl.finish(); const tMv = performance.now() - t0;
  const err0 = gl.getError();
  // read both layers
  const rfb = gl.createFramebuffer(), px = [];
  for (let i = 0; i < 2; i++) {
    state.bindFramebuffer(gl.FRAMEBUFFER, rfb);
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, color, 0, i);
    const b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); px.push(b);
  }
  // reference: each eye alone (same output colour space / tone mapping as an XR target)
  const ref = [];
  const t1 = performance.now();
  for (let i = 0; i < 2; i++) {
    const r2 = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace });
    r2.isXRRenderTarget = true; r2.texture.internalFormat = 'RGBA8';   // stored as the XR layer stores it (the shader encodes sRGB)
    renderer.setRenderTarget(r2); renderer.clear(); renderer.render(scene, eyes[i]);
    const b = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(r2, 0, 0, w, h, b); ref.push(b); r2.dispose();
  }
  gl.finish(); const tRef = performance.now() - t1;
  renderer.setRenderTarget(prevRT); renderer.xr.enabled = prevXR;
  let max = 0, sum = 0, bad = 0;
  for (let i = 0; i < 2; i++) for (let k = 0; k < px[i].length; k += 4) {
    const d = Math.max(Math.abs(px[i][k] - ref[i][k]), Math.abs(px[i][k + 1] - ref[i][k + 1]), Math.abs(px[i][k + 2] - ref[i][k + 2]));
    max = Math.max(max, d); sum += d; if (d > 8) bad++;
  }
  gl.deleteFramebuffer(fb); gl.deleteFramebuffer(rfb); gl.deleteTexture(color); gl.deleteTexture(depth);
  return { status: status === gl.FRAMEBUFFER_COMPLETE, glError: err0, maxDiff: max, meanDiff: sum / (w * h * 2), bad, badShare: bad / (w * h * 2), px, ref, tMv, tRef };
}
