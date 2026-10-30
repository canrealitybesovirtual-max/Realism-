// Turning held props (VR and desktop), on top of the engine's own grab.
// VR, holding a prop (not the pistol or its parts):
//   - thumbstick left/right: turn it about the vertical; up/down: tip it toward / away from you;
//     stick pressed in + left/right: roll it. That hand's stick does not walk or snap-turn while it holds.
//   - B / Y: stand it upright (keeps its heading).
//   - two hands: hold the prop in one hand, squeeze the other grip in the air (away from any prop) and move
//     that hand around the first: the prop turns with the line between your hands, like a steering wheel.
// Desktop, holding a prop (E / click): Q / R turn left / right, Z / C tip away / toward you, V upright,
//   Alt + mouse wheel turns it (or the plain wheel, with "Mouse wheel while holding: Rotate").
//   Not holding anything: Q / R / V turn or stand up the selection or what the dot rests on (one Undo step,
//   through the command runner: "rotate it 45", "stand it upright").
// Step: Settings > Holding props > "Turn step": Free (smooth while held) / 15 / 45 / 90 degrees.
// API: window.__studioRotate = { step(), setStep(deg), rotateHeld(hand|"desktop", axis, deg), upright(hand|"desktop") }.
(function () {
  "use strict";
  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        if (s && s.ready && s.xr && s.desktop && s.THREE && window.__studioUI) resolve(s);
        else setTimeout(check, 250);
      })();
    });
  }
  waitForStudio().then(function (S) {
    var THREE = S.THREE, XR = S.xr, desk = S.desktop, UI = window.__studioUI, renderer = S.renderer, camera = S.camera;
    var UP = new THREE.Vector3(0, 1, 0), DEG = Math.PI / 180;
    var _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
    var _qa = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, "YXZ");

    function step() { var v = Number(UI.value("rotateStep")); return isFinite(v) ? v : 45; }
    function stickRotates() { return UI.value("heldStick") !== "move"; }
    function inXR() { return !!(renderer.xr && renderer.xr.isPresenting); }
    function turnable(held) { return !!(held && held.prop && !held.kind); } // the pistol and its parts keep their fitted grip
    function toast(msg) { if (S.log) S.log.info(msg); }

    // ---------- VR ----------
    function headAxes(h) {
      camera.updateMatrixWorld(true);
      var fwd = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld); fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
      var right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
      return { fwd: fwd, right: right };
    }
    // turn what hand h holds by the world rotation q, about the prop's own origin
    function applyVR(h, q) {
      var H = XR.handFrame(h).clone();
      _m.multiplyMatrices(H, h.held.offset);
      _m.decompose(_p, _q, _s);
      _q.premultiply(q).normalize();
      _m.compose(_p, _q, _s);
      h.held.offset.copy(H.invert().multiply(_m));
    }
    function heldWorldQuat(h) { _m.multiplyMatrices(XR.handFrame(h), h.held.offset); _m.decompose(_p, _q, _s); return _q.clone(); }
    function uprightVR(h) {
      var q = heldWorldQuat(h); _e.setFromQuaternion(q, "YXZ");
      var target = new THREE.Quaternion().setFromAxisAngle(UP, _e.y);
      applyVR(h, target.multiply(q.invert()));
      if (XR.pulse) XR.pulse(h, 0.3, 20);
    }
    var vs = new WeakMap(); // per hand: snap edge state, two-hand line
    function stateOf(h) { var s = vs.get(h); if (!s) { s = { readyX: true, readyY: true, line: null }; vs.set(h, s); } return s; }
    function vrUpdate(h, b, dt) {
      if (!h || !h.source || h.source.hand) return;
      var st = stateOf(h);
      if (!turnable(h.held)) { st.line = null; st.readyX = st.readyY = true; return; }
      var gp = h.source.gamepad, ax = headAxes(h), sn = step();
      if (b.faceUp) uprightVR(h);
      if (stickRotates()) {
        var click = !!(gp && gp.buttons[3] && gp.buttons[3].pressed);
        var x = b.stickX || 0, y = b.stickY || 0, q = new THREE.Quaternion();
        var axisX = click ? ax.fwd : UP;           // left/right: turn (or roll with the stick pressed in)
        var signX = click ? 1 : -1;
        if (sn > 0) {
          if (Math.abs(x) > 0.7 && st.readyX) { st.readyX = false; q.setFromAxisAngle(axisX, signX * Math.sign(x) * sn * DEG); applyVR(h, q); if (XR.pulse) XR.pulse(h, 0.2, 12); }
          if (Math.abs(x) < 0.3) st.readyX = true;
          if (Math.abs(y) > 0.7 && st.readyY && !click) { st.readyY = false; q.setFromAxisAngle(ax.right, -Math.sign(y) * sn * DEG); applyVR(h, q); if (XR.pulse) XR.pulse(h, 0.2, 12); }
          if (Math.abs(y) < 0.3) st.readyY = true;
        } else {
          var dz = function (v) { return Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82; };
          var rx = dz(x), ry = click ? 0 : dz(y), rate = 2.4 * dt; // ~140 deg/s at full stick
          if (rx) { q.setFromAxisAngle(axisX, signX * rx * rate); applyVR(h, q); }
          if (ry) { q.setFromAxisAngle(ax.right, -ry * rate); applyVR(h, q); }
        }
      }
      // two hands: the other hand squeezes in the air
      var other = XR.hands.find(function (o) { return o !== h && o.source && !o.source.hand; });
      var og = other && other.source.gamepad;
      var squeezing = !!(og && og.buttons[1] && og.buttons[1].pressed) && !other.held && !other.manip && !other.holdingMouse && UI.value("twoHandTurn") !== "off";
      if (squeezing) {
        var a = XR.grabPoint ? XR.grabPoint(h) : h.grip.getWorldPosition(new THREE.Vector3());
        var c = XR.grabPoint ? XR.grabPoint(other) : other.grip.getWorldPosition(new THREE.Vector3());
        var line = c.clone().sub(a);
        if (line.lengthSq() > 0.0025) {
          line.normalize();
          if (st.line) { _qa.setFromUnitVectors(st.line, line); if (2 * Math.acos(Math.min(1, Math.abs(_qa.w))) < 0.6) applyVR(h, _qa); }
          st.line = line;
        }
      } else st.line = null;
    }
    if (typeof XR.handLogic === "function") {
      var handLogic = XR.handLogic;
      XR.handLogic = function (h, b, dt) {
        try { vrUpdate(h, b, dt); } catch (err) { console.error(err); }
        return handLogic.apply(this, arguments);
      };
    }
    // the holding hand's stick turns the prop, so it must not walk or snap-turn at the same time
    if (typeof XR.locomotion === "function") {
      var locomotion = XR.locomotion;
      var ZERO = { axes: [0, 0, 0, 0], buttons: [] };
      XR.locomotion = function () {
        var all = this.hands;
        if (!stickRotates() || !all || !all.some(function (h) { return h.source && turnable(h.held); })) return locomotion.apply(this, arguments);
        var stand = all.map(function (h) {
          if (!(h.source && turnable(h.held))) return h;
          return { source: { handedness: h.source.handedness, gamepad: ZERO, hand: h.source.hand }, pointing: h.pointing, index: h.index, turnReady: false, held: h.held };
        });
        this.hands = stand;
        try { return locomotion.apply(this, arguments); }
        finally { this.hands = all; }
      };
    }

    // ---------- desktop ----------
    function deskHeld() { return desk && desk.mode === "walk" && turnable(desk.held) ? desk.held : null; }
    function applyDesk(q) {
      var held = desk.held, cq = camera.quaternion;
      // world = cam * rot  ->  rot' = cam^-1 * q * cam * rot
      held.rot.copy(cq.clone().invert().multiply(q).multiply(cq.clone().multiply(held.rot))).normalize();
    }
    function deskAxis(name) {
      if (name === "yaw") return UP.clone();
      var f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); f.y = 0; if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize();
      return name === "roll" ? f : new THREE.Vector3().crossVectors(f, UP).normalize();
    }
    function rotateDesk(axis, deg) { if (!deskHeld()) return false; applyDesk(new THREE.Quaternion().setFromAxisAngle(deskAxis(axis), deg * DEG)); return true; }
    function uprightDesk() {
      if (!deskHeld()) return false;
      var w = camera.quaternion.clone().multiply(desk.held.rot); _e.setFromQuaternion(w, "YXZ");
      var target = new THREE.Quaternion().setFromAxisAngle(UP, _e.y);
      applyDesk(target.multiply(w.invert()));
      return true;
    }
    var KEYS = { KeyQ: ["yaw", 1], KeyR: ["yaw", -1], KeyZ: ["pitch", 1], KeyC: ["pitch", -1] };
    var down = new Set();
    function typing() { var a = document.activeElement; return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable); }
    addEventListener("keydown", function (e) {
      if (inXR() || typing() || !desk || desk.mode !== "walk" || document.pointerLockElement !== renderer.domElement) return;
      if (e.ctrlKey || e.metaKey) return;
      var k = KEYS[e.code];
      if (deskHeld()) {
        if (k) { down.add(e.code); if (!e.repeat && step() > 0) rotateDesk(k[0], k[1] * step()); e.preventDefault(); }
        else if (e.code === "KeyV" && !e.repeat) uprightDesk();
        return;
      }
      if (desk.held || e.repeat) return;
      // nothing in the hand: turn the selection or what the dot rests on, as a command (undoable)
      var C = window.__studioCommands;
      if (!C || !C.run) return;
      var r = null, sn = step() || 15;
      if (e.code === "KeyQ") r = C.run("rotate it " + sn);
      else if (e.code === "KeyR" && !(desk.heldGun && desk.heldGun())) r = C.run("rotate it -" + sn);
      else if (e.code === "KeyV") r = C.run("stand it upright");
      if (r && r.reply) toast(r.reply);
    });
    addEventListener("keyup", function (e) { down.delete(e.code); });
    addEventListener("blur", function () { down.clear(); });
    addEventListener("wheel", function (e) {
      if (inXR() || !deskHeld() || document.pointerLockElement !== renderer.domElement) return;
      var useWheel = e.altKey || UI.value("wheelMode") === "rotate";
      if (!useWheel) return;
      var d = e.deltaY || e.deltaX; if (!d) return;
      var sn = step();
      rotateDesk(e.shiftKey ? "pitch" : "yaw", sn > 0 ? -Math.sign(d) * sn : -d * 0.12);
      e.stopImmediatePropagation();
    }, { capture: true, passive: true });
    // free step: keys held turn smoothly
    var last = performance.now();
    var render = renderer.render.bind(renderer);
    renderer.render = function (sc, cam) {
      if (cam === camera) {
        var now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (down.size && step() === 0 && deskHeld()) down.forEach(function (code) { var k = KEYS[code]; if (k) rotateDesk(k[0], k[1] * 120 * dt); });
      }
      return render(sc, cam);
    };

    window.__studioRotate = {
      step: step,
      setStep: function (d) { UI.setValue("rotateStep", d); },
      rotateHeld: function (who, axis, deg) {
        if (who === "desktop") return rotateDesk(axis, deg);
        var h = typeof who === "number" ? XR.hands[who] : who; if (!h || !turnable(h.held)) return false;
        var ax = headAxes(h), a = axis === "yaw" ? UP : axis === "roll" ? ax.fwd : ax.right;
        applyVR(h, new THREE.Quaternion().setFromAxisAngle(a, deg * DEG)); return true;
      },
      upright: function (who) {
        if (who === "desktop") return uprightDesk();
        var h = typeof who === "number" ? XR.hands[who] : who; if (!h || !turnable(h.held)) return false;
        uprightVR(h); return true;
      },
      _vrUpdate: vrUpdate
    };
  });
})();
