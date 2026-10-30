// Wrist tablet and VR helpers (Phase 5D part 2). VR only, Editor mode only (Game Editor open, in the office).
// - Wrist tablet: a small panel above the left wrist (controller or tracked hand) that turns to face your
//   head. Starts folded to a tab; point the right hand at the tab and pull the trigger (or pinch) to open
//   or fold it. The open/folded state is remembered. It carries the status line, Undo, Redo, Play/Pause,
//   Stop, Recenter, the door picker and the last Console lines.
// - Laser tooltips: while Editor mode is on, a short "Pick up <name>" label next to the right hand's
//   pointer dot when it rests on a prop (switch: Pointer labels).
// - Recenter: turns you, where you stand, to face the computer.
// Input is read from the gamepad here with its own edge state (the game's buttons() keeps its own, so it
// is never called from here). A hand holding a gun is ignored, so a press can never fire a shot.
// Placement constants are first guesses for Quest 3S and need a headset check.
(function () {
  "use strict";
  var PANEL_W = 0.17, PANEL_H = 0.117, CANVAS_W = 512, CANVAS_H = 352;
  var TAB_W = 0.07, TAB_H = 0.022, TAB_CW = 256, TAB_CH = 80;
  var LIFT = 0.075, BACK = 0.08, TOWARD_HEAD = 0.02; // metres: above the wrist, from palm back to wrist, toward the eyes

  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        var os = s && s.ready && ((s.computer && s.computer.os) || (s.targets && s.targets.computer && s.targets.computer.os));
        if (os && s.xr && s.THREE && window.__studioUI && window.__studioEditorMode) resolve({ S: s, os: os });
        else setTimeout(check, 250);
      })();
    });
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  waitForStudio().then(function (ctx) {
    var S = ctx.S, os = ctx.os, THREE = S.THREE, UI = window.__studioUI, XR = S.xr, renderer = S.renderer, scene = S.scene;
    var FONT = os.fonts.ui;

    // ---------- meshes ----------
    function canvasMesh(cw, ch, w, h) {
      var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
      var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false });
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.frustumCulled = false; // placed by hand each frame m.renderOrder = 1001; m.visible = false;
      m.userData.noBullet = true; m.name = "wrist-tablet";
      m.raycast = function () {}; // the game's own rays pass through
      scene.add(m);
      return { mesh: m, canvas: cv, ctx: cv.getContext("2d"), tex: tex, w: w, h: h };
    }
    var panel = canvasMesh(CANVAS_W, CANVAS_H, PANEL_W, PANEL_H);
    var tab = canvasMesh(TAB_CW, TAB_CH, TAB_W, TAB_H);
    var tip = canvasMesh(256, 64, 0.11, 0.0275); tip.mesh.name = "laser-tooltip";
    var open = os.storage.get("ui.tablet.open") === "1";

    // ---------- buttons ----------
    var BTN = [];
    function layoutButtons() {
      var R = S.runtime, rally = window.__rally, d = rally && rally.dests && rally.dests.find(function (x) { return x.id === rally.dest; });
      var bw = 156, bh = 50, x0 = 16, y0 = 98, gap = 6;
      var RS = window.__studioReset, RT = window.__studioRotate, st = RT ? RT.step() : 45;
      var defs = [
        ["undo", "↶ Undo"], ["redo", "↷ Redo"], ["recenter", "◎ Recenter"],
        ["play", R && R.mode === "play" ? "❚❚ Pause" : "▶ Play"], ["stop", "■ Stop"], ["door", "Door: " + (d ? (d.id === "none" ? "shut" : d.id === "rally" ? "Rally" : d.id === "cqc" ? "CQC" : "Interstate") : "–")],
        ["enemy", "+ Enemy"], ["turn", "Turn: " + (st ? st + "°" : "free")], ["reset", RS && RS.armed() ? "Sure? Reset!" : "Reset studio"]
      ];
      BTN = defs.map(function (b, i) { return { id: b[0], label: b[1], x: x0 + (i % 3) * (bw + gap), y: y0 + Math.floor(i / 3) * (bh + gap), w: bw, h: bh }; });
      BTN.push({ id: "fold", label: "▾", x: CANVAS_W - 64, y: 8, w: 52, h: 44 });
    }
    function enabled(id) {
      var H = S.editor && S.editor.history, R = S.runtime;
      if (id === "undo") return !!(H && H.canUndo);
      if (id === "redo") return !!(H && H.canRedo);
      if (id === "stop") return !!(R && R.mode !== "edit");
      if (id === "door") return !!(window.__rally && window.__rally.setDest);
      if (id === "enemy") return !!(window.__studioEnemies && window.__studioEnemies.spawn);
      if (id === "turn") return !!window.__studioRotate;
      if (id === "reset") return !!window.__studioReset;
      return true;
    }
    function press(id) {
      var ed = S.editor, R = S.runtime, rally = window.__rally;
      if (id === "fold") { setOpen(false); return; }
      if (!enabled(id)) return;
      if (id === "undo") ed.undo();
      else if (id === "redo") ed.redo();
      else if (id === "play") { if (R.mode === "play") R.pause(); else R.play(); }
      else if (id === "stop") R.stop();
      else if (id === "recenter") recenter();
      else if (id === "enemy") window.__studioEnemies.spawn();
      else if (id === "turn") { var STEPS = [0, 15, 45, 90], cur = window.__studioRotate.step(); window.__studioRotate.setStep(STEPS[(STEPS.indexOf(cur) + 1) % STEPS.length]); }
      else if (id === "reset") window.__studioReset.press();
      else if (id === "door") {
        var ids = rally.dests.map(function (d) { return d.id; });
        rally.setDest(ids[(ids.indexOf(rally.dest) + 1) % ids.length]);
      }
      if (S.log) S.log.info("Wrist tablet: " + id);
    }
    function setOpen(v) { open = v; os.storage.set("ui.tablet.open", v ? "1" : "0"); sig = ""; }

    // ---------- drawing (only when something shown changed) ----------
    var sig = "", hoverId = null, tabHover = false;
    function statusText() {
      var R = S.runtime, n = window.__studioProps ? window.__studioProps.count() : 0;
      return (R ? (R.mode === "edit" ? "Stopped" : R.mode === "paused" ? "Paused" : "Playing") : "") + "  ·  " + n + (n === 1 ? " prop" : " props");
    }
    function lastLog() {
      var L = S.log && S.log.entries; if (!L) return [];
      return L.slice(-3).map(function (e) { return e.msg; });
    }
    function drawPanel() {
      layoutButtons();
      var c = panel.ctx;
      var s = [statusText(), hoverId, BTN.map(function (b) { return b.label + enabled(b.id); }).join(), S.log ? S.log.version : 0].join("|");
      if (s === sig) return;
      sig = s;
      c.clearRect(0, 0, CANVAS_W, CANVAS_H);
      rr(c, 2, 2, CANVAS_W - 4, CANVAS_H - 4, 22); c.fillStyle = "rgba(24,25,30,0.94)"; c.fill();
      c.strokeStyle = "rgba(255,255,255,0.14)"; c.lineWidth = 2; c.stroke();
      c.fillStyle = "#ffffff"; c.font = "700 26px " + FONT; c.textBaseline = "middle"; c.fillText("Editor tools", 20, 32);
      c.fillStyle = "#a1a1a8"; c.font = "500 21px " + FONT; c.fillText(statusText(), 20, 76);
      BTN.forEach(function (b) {
        var on = enabled(b.id), hot = hoverId === b.id;
        rr(c, b.x, b.y, b.w, b.h, 12);
        var danger = b.id === "reset" && window.__studioReset && window.__studioReset.armed();
        c.fillStyle = danger ? "#d70015" : hot && on ? (b.id === "reset" ? "#c62828" : "#0a84ff") : b.id === "fold" ? "rgba(255,255,255,0.08)" : b.id === "reset" ? "rgba(255,80,80,0.22)" : "rgba(255,255,255,0.12)"; c.fill();
        c.fillStyle = on ? "#ffffff" : "#6e6e75"; c.font = "600 22px " + FONT; c.textAlign = "center";
        c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1); c.textAlign = "left";
      });
      c.font = "400 17px " + FONT; c.fillStyle = "#8e8e93";
      lastLog().slice(-2).forEach(function (m, i) {
        var t = String(m); while (t.length > 4 && c.measureText(t).width > CANVAS_W - 40) t = t.slice(0, -2);
        c.fillText(t === String(m) ? t : t + "…", 20, 300 + i * 24);
      });
      c.textBaseline = "alphabetic";
      panel.tex.needsUpdate = true;
    }
    var tabSig = "";
    function drawTab() {
      var s = String(tabHover);
      if (s === tabSig) return;
      tabSig = s;
      var c = tab.ctx;
      c.clearRect(0, 0, TAB_CW, TAB_CH);
      rr(c, 2, 2, TAB_CW - 4, TAB_CH - 4, 34); c.fillStyle = tabHover ? "rgba(10,132,255,0.95)" : "rgba(24,25,30,0.9)"; c.fill();
      c.fillStyle = "#ffffff"; c.font = "600 34px " + FONT; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText("▸ Tools", TAB_CW / 2, TAB_CH / 2 + 1);
      tab.tex.needsUpdate = true;
    }
    var tipText = "";
    function drawTip(t) {
      if (t === tipText) return;
      tipText = t;
      var c = tip.ctx; c.clearRect(0, 0, 256, 64);
      if (!t) return;
      c.font = "600 26px " + FONT; var w = Math.min(250, c.measureText(t).width + 32);
      rr(c, (256 - w) / 2, 6, w, 52, 26); c.fillStyle = "rgba(10,12,16,0.72)"; c.fill();
      c.fillStyle = "#ffffff"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(t, 128, 33);
      tip.tex.needsUpdate = true;
    }

    // ---------- placement ----------
    var _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _z = new THREE.Vector3(), _head = new THREE.Vector3(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
    function hand(side) { return XR.hands && XR.hands.find(function (h) { return h.source && h.source.handedness === side; }); }
    function wristPoint(h, out) {
      var wj = h.source.hand && h.handSpace && h.handSpace.joints && h.handSpace.joints.wrist;
      if (wj) return wj.getWorldPosition(out);
      h.grip.getWorldPosition(out);
      _z.set(0, 0, 1).transformDirection(h.grip.matrixWorld); // grip -Z points out of the fist; +Z runs to the wrist
      return out.addScaledVector(_z, BACK);
    }
    function place(m, at) {
      S.camera.getWorldPosition(_head);
      _p.copy(at);
      _z.copy(_head).sub(_p).normalize();
      _p.addScaledVector(_z, TOWARD_HEAD);
      _m.lookAt(_head, _p, _up); // +Z of the panel toward the head
      _q.setFromRotationMatrix(_m);
      m.matrixWorld.compose(_p, _q, m.scale);
      m.matrix.copy(m.matrixWorld);
    }

    // ---------- ray input ----------
    var prevPress = false, _o = new THREE.Vector3(), _d = new THREE.Vector3(), _inv = new THREE.Matrix4(), _lo = new THREE.Vector3(), _ld = new THREE.Vector3();
    function rayHit(h, m, w, ht) {
      h.ray.updateMatrixWorld();
      _o.setFromMatrixPosition(h.ray.matrixWorld);
      _d.set(0, 0, -1).transformDirection(h.ray.matrixWorld);
      _inv.copy(m.matrixWorld).invert();
      _lo.copy(_o).applyMatrix4(_inv); _ld.copy(_d).transformDirection(_inv);
      if (Math.abs(_ld.z) < 1e-6) return null;
      var t = -_lo.z / _ld.z; if (t < 0 || t > 3) return null;
      var x = _lo.x + _ld.x * t, y = _lo.y + _ld.y * t;
      if (Math.abs(x) > w / 2 || Math.abs(y) > ht / 2) return null;
      return { u: x / w + 0.5, v: 0.5 - y / ht, dist: t };
    }
    function pressed(h) {
      if (h.source.hand) return !!h.pinching;
      var b = h.source.gamepad && h.source.gamepad.buttons;
      return !!(b && b[0] && b[0].pressed);
    }
    function pulse(h) { try { XR.pulse(h, 0.25, 12); } catch (e) {} }
    function holdingGun(h) { return !!(h.held && S.guns && h.held.prop && [].concat(S.guns).some(function (g) { return g && (g.prop === h.held.prop || g === h.held.prop); })) || !!(h.held && h.held.kind); }

    // ---------- recenter ----------
    function recenter() {
      var rig = XR.rig, screen = S.targets && (S.targets.screen || (S.targets.computer && S.targets.computer.screen));
      if (!rig || !screen) return;
      var head = S.camera.getWorldPosition(new THREE.Vector3()), target = screen.getWorldPosition(new THREE.Vector3());
      var fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.camera.getWorldQuaternion(new THREE.Quaternion()));
      var now = Math.atan2(-fwd.x, -fwd.z), want = Math.atan2(-(target.x - head.x), -(target.z - head.z));
      var turn = want - now;
      rig.rotation.y += turn;
      // turn around the head, not the rig origin
      var off = rig.position.clone().sub(head); off.applyAxisAngle(_up, turn);
      rig.position.copy(head).add(off);
      rig.updateMatrixWorld(true);
    }

    // ---------- per frame (piggy-backs on renderer.render, as rally.js does) ----------
    var frameRender = renderer.render.bind(renderer);
    var lastFrame = -1;
    renderer.render = function (sc, cam) {
      if (sc === scene && cam === S.camera) { try { tick(); } catch (e) { console.error(e); } }
      return frameRender(sc, cam);
    };
    function tick() {
      var f = renderer.info.render.frame; if (f === lastFrame) return; lastFrame = f;
      var inXR = renderer.xr && renderer.xr.isPresenting;
      var active = inXR && window.__studioEditorMode.on && UI.get("wristTablet");
      var L = active && hand("left"), Rh = inXR && hand("right");
      panel.mesh.visible = !!(L && open);
      tab.mesh.visible = !!(L && !open);
      // laser tooltip
      var showTip = !!(inXR && window.__studioEditorMode.on && UI.get("pointerLabels") && Rh && Rh.pointing === "prop" && Rh.pointProp && !Rh.held);
      tip.mesh.visible = showTip;
      if (showTip) {
        var d = Rh.pointProp.desc, e = d && S.editor && S.editor.world && S.editor.world.of && S.editor.world.of(d.object);
        drawTip("Pick up" + ((e && e.name) ? " " + e.name : ""));
        Rh.dot.getWorldPosition(_p); _p.y += 0.05; place(tip.mesh, _p);
      }
      if (!L) { prevPress = false; return; }
      wristPoint(L, _p); _p.y += LIFT;
      var target = open ? panel : tab;
      place(target.mesh, _p.clone());
      // input from the right hand
      var hitId = null, onTab = false;
      if (Rh && !holdingGun(Rh)) {
        var hit = rayHit(Rh, target.mesh, target.w, target.h);
        if (hit) {
          if (open) {
            var px = hit.u * CANVAS_W, py = hit.v * CANVAS_H;
            var b = BTN.find(function (b) { return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h; });
            hitId = b ? b.id : null;
          } else onTab = true;
        }
        var now = pressed(Rh);
        if (now && !prevPress) {
          if (onTab) { setOpen(true); pulse(Rh); }
          else if (hitId) { press(hitId); pulse(Rh); }
        }
        prevPress = now;
      }
      if (hitId !== hoverId) { hoverId = hitId; sig = ""; }
      if (onTab !== tabHover) tabHover = onTab;
      if (open) drawPanel(); else drawTab();
    }
    drawTab();
    window.__studioTablet = { get open() { return open; }, setOpen: setOpen, press: press, recenter: recenter, _tick: tick };
  });
})();
