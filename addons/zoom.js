// Zoom to the computer screen (desktop only).
// When you use the in-room computer (click the monitor), the camera eases over ~0.4 s to a pose square to
// the screen, at a distance and field of view that fit the monitor's bezel inside the window (letterboxed,
// never cropped). Leaving (Esc, losing the mouse, or a walking key the computer does not use) eases back.
// - Wraps the engine's desktop controller: desk.update (pose) and targets.computer.physicalKey (walk keys).
//   On the computer the mouse drives the screen's own cursor, not a ray, so clicks land the same.
// - VR is untouched: nothing runs while presenting, and entering VR snaps the camera back.
// - UI Settings switch "Zoom to the computer screen" (key zoomScreen, default on); ?zoom=off disables it.
(function () {
  "use strict";
  if (/[?&]zoom=off\b/.test(location.search)) { window.__studioZoom = { off: true }; return; }

  var DUR = 0.4, MAX_FOV = 40, MARGIN = 1.04;
  var WALK = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };

  (function wait() {
    var S = window.__studio;
    if (!(S && S.ready && S.desktop && S.targets && S.targets.screen && S.THREE && S.camera)) { setTimeout(wait, 250); return; }
    init(S);
  })();

  function init(S) {
    var T = S.THREE, desk = S.desktop, cam = S.camera, screen = S.targets.screen, renderer = S.renderer;
    var comp = (desk.targets && desk.targets.computer) || S.targets.computer;
    function enabled() { var u = window.__studioUI; return !u || u.get("zoomScreen"); }

    var k = 0;                    // 0 = your own view, 1 = at the screen
    var applied = false;          // camera currently carries our pose
    var basePos = new T.Vector3(), baseQuat = new T.Quaternion(), baseFov = cam.fov;
    var outPos = new T.Vector3(), outQuat = new T.Quaternion();
    var tPos = new T.Vector3(), tQuat = new T.Quaternion(), tFov = MAX_FOV;
    var m = new T.Matrix4(), sx = new T.Vector3(), sy = new T.Vector3(), sz = new T.Vector3(), c = new T.Vector3(), v = new T.Vector3();
    var flip = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI);
    var bezel = null;             // half extents (m) of the monitor head in the screen's plane

    function measureBezel() {
      // The bezel is the monitor head's front frame: its meshes' extents in the screen's own x / y, kept
      // within a sane range of the glass (a stand or a back shell larger than the glass is not the bezel).
      var g = screen.geometry; if (!g.boundingBox) g.computeBoundingBox();
      var gb = g.boundingBox, hw = (gb.max.x - gb.min.x) / 2, hh = (gb.max.y - gb.min.y) / 2;
      var bw = hw, bh = hh, head = screen.parent;
      screen.updateWorldMatrix(true, false);
      var inv = new T.Matrix4().copy(screen.matrixWorld).invert(), box = new T.Box3(), p = new T.Vector3();
      if (head) head.children.forEach(function (o) {
        if (!o.isMesh || o === screen || !o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.copy(o.geometry.boundingBox); o.updateWorldMatrix(true, false);
        var mx = 0, my = 0;
        for (var i = 0; i < 8; i++) {
          p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
            .applyMatrix4(o.matrixWorld).applyMatrix4(inv);
          mx = Math.max(mx, Math.abs(p.x)); my = Math.max(my, Math.abs(p.y));
        }
        if (mx <= hw * 1.2 && my <= hh * 1.35) { bw = Math.max(bw, mx); bh = Math.max(bh, my); }
      });
      if (bw === hw && bh === hh) { bw = hw + 0.012; bh = hh + 0.012; }
      bezel = { w: bw, h: bh, cx: (gb.max.x + gb.min.x) / 2, cy: (gb.max.y + gb.min.y) / 2 };
    }

    function target() {
      if (!bezel) measureBezel();
      screen.updateWorldMatrix(true, false);
      screen.matrixWorld.decompose(c, tQuat, v);
      m.extractRotation(screen.matrixWorld); m.extractBasis(sx, sy, sz);
      c.set(bezel.cx, bezel.cy, 0).applyMatrix4(screen.matrixWorld);
      // face the side you were looking from (the glass faces +z of the screen)
      if (v.subVectors(basePos, c).dot(sz) < 0) { tQuat.multiply(flip); sz.negate(); }
      var aspect = cam.aspect || (innerWidth / innerHeight);
      var halfH = Math.max(bezel.h, bezel.w / aspect) * MARGIN;
      tFov = Math.min(MAX_FOV, baseFov);
      var d = halfH / Math.tan(T.MathUtils.degToRad(tFov) / 2);
      tPos.copy(c).addScaledVector(sz, d);
    }

    function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

    function restore(snapPos) {
      if (applied) {
        if (snapPos && cam.position.equals(outPos)) cam.position.copy(basePos);
        if (cam.quaternion.equals(outQuat)) cam.quaternion.copy(baseQuat);
        cam.fov = baseFov; cam.updateProjectionMatrix();
      }
      applied = false; k = 0;
    }

    var update = desk.update.bind(desk);
    desk.update = function (dt) {
      var xr = renderer && renderer.xr && renderer.xr.isPresenting;
      if (applied) {
        // put your own view back before the engine moves it; if something else moved the camera, keep that
        if (cam.position.equals(outPos)) cam.position.copy(basePos);
        if (cam.quaternion.equals(outQuat)) cam.quaternion.copy(baseQuat);
        cam.fov = baseFov;
      } else baseFov = cam.fov;
      var r = update(dt);
      if (xr || !desk.enabled) { if (applied) { cam.updateProjectionMatrix(); applied = false; k = 0; } return r; }
      var want = desk.mode === "computer" && enabled() ? 1 : 0;
      var step = (dt > 0 ? Math.min(dt, 0.1) : 0) / DUR;
      k = want ? Math.min(1, k + step) : Math.max(0, k - step);
      basePos.copy(cam.position); baseQuat.copy(cam.quaternion);
      if (k <= 0) {
        if (applied) { cam.updateProjectionMatrix(); applied = false; }
        return r;
      }
      target();
      var e = ease(k);
      outPos.lerpVectors(basePos, tPos, e); outQuat.slerpQuaternions(baseQuat, tQuat, e);
      cam.position.copy(outPos); cam.quaternion.copy(outQuat);
      cam.fov = baseFov + (tFov - baseFov) * e; cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      applied = true;
      return r;
    };

    // a walking key the computer does not use leaves it and starts walking (the camera eases back)
    if (comp && typeof comp.physicalKey === "function") {
      var pk = comp.physicalKey.bind(comp);
      comp.physicalKey = function (e) {
        var used = pk(e);
        if (!used && enabled() && desk.mode === "computer" && WALK[e.code] && !(e.ctrlKey || e.metaKey || e.altKey)) {
          desk.exitComputer(); desk.keys.add(e.code);
          return true;
        }
        return used;
      };
    }

    if (renderer && renderer.xr && renderer.xr.addEventListener)
      renderer.xr.addEventListener("sessionstart", function () { restore(true); });

    window.__studioZoom = {
      get k() { return k; },
      get active() { return applied; },
      target: function () { basePos.copy(cam.position); target(); return { pos: tPos.toArray(), fov: tFov, bezel: bezel }; },
      remeasure: function () { bezel = null; }
    };
  }
})();
