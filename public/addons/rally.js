(function () {
  "use strict";
  var OFFX = 4000;            // the map lives far from the room
  var EYE = 1.62;

  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        var os = s && s.ready && ((s.computer && s.computer.os) || (s.targets && s.targets.computer && s.targets.computer.os));
        if (os && s.THREE && s.desktop) resolve({ S: s, os: os });
        else setTimeout(check, 250);
      })();
    });
  }
  function sstep(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function hash1(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function noise1(x) { var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash1(i) * (1 - u) + hash1(i + 1) * u) * 2 - 1; }

  // ---------- DOM: fade, hint, HUD ----------
  var css = document.createElement("style");
  css.textContent =
    "#rl-fade{position:fixed;inset:0;background:#05070a;opacity:0;pointer-events:none;transition:opacity .35s ease;z-index:20;display:flex;align-items:center;justify-content:center;color:#c9d3de;font:500 14px system-ui,sans-serif}" +
    "#rl-fade.on{opacity:1}" +
    "#rl-hint{position:fixed;left:50%;top:calc(50% + 34px);transform:translateX(-50%);z-index:7;padding:7px 12px;border-radius:999px;background:rgba(14,16,20,.78);color:#f2f2f2;font:500 13px system-ui,sans-serif;pointer-events:none;display:none;white-space:nowrap;max-width:calc(100% - 32px);overflow:hidden;text-overflow:ellipsis}" +
    "#rl-hint kbd{background:#3a3d45;border-radius:4px;padding:1px 6px;margin-right:6px;font:600 12px system-ui,sans-serif}" +
    "#rl-hud{position:fixed;inset:0;pointer-events:none;z-index:6;display:none;font-family:system-ui,sans-serif;color:#fff}" +
    "#rl-hud .spd{position:absolute;right:max(22px,env(safe-area-inset-right,0px));bottom:calc(20px + env(safe-area-inset-bottom,0px));text-align:right;text-shadow:0 1px 6px rgba(0,0,0,.55)}" +
    "#rl-hud .spd b{display:block;font:700 54px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:-1px}" +
    "#rl-hud .spd span{font:600 13px system-ui,sans-serif;opacity:.85}" +
    "#rl-hud .gear{display:inline-block;margin-left:10px;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,.18)}" +
    "#rl-hud .keys{position:absolute;left:max(16px,env(safe-area-inset-left,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));padding:8px 12px;border-radius:10px;background:rgba(14,16,20,.6);font:500 12px/1.7 system-ui,sans-serif;color:#dfe5ec}" +
    "#rl-hud .keys kbd{background:#3a3d45;border-radius:4px;padding:0 5px;font:600 11px system-ui,sans-serif;color:#fff}" +
    "body.rl-driving #crosshair{display:none!important}";
  document.head.appendChild(css);
  var fade = document.createElement("div"); fade.id = "rl-fade"; document.body.appendChild(fade);
  var hint = document.createElement("div"); hint.id = "rl-hint"; document.body.appendChild(hint);
  var hud = document.createElement("div"); hud.id = "rl-hud";
  hud.innerHTML = '<div class="spd"><b id="rl-kmh">0</b><span>km/h</span><span class="gear" id="rl-gear">1</span></div>' +
    '<div class="keys"><kbd>W</kbd> <kbd>S</kbd> throttle, brake &nbsp; <kbd>A</kbd> <kbd>D</kbd> steer &nbsp; <kbd>Space</kbd> handbrake<br>' +
    '<kbd>C</kbd> camera &nbsp; <kbd>R</kbd> back on the road &nbsp; <kbd>E</kbd> get out</div>';
  document.body.appendChild(hud);
  var credits = document.createElement("div");
  credits.style.cssText = "position:fixed;right:max(12px,env(safe-area-inset-right,0px));top:calc(10px + env(safe-area-inset-top,0px));z-index:6;display:none;font:500 11px/1.5 system-ui,sans-serif;color:#1d2530;background:rgba(255,255,255,.62);padding:5px 9px;border-radius:8px;text-align:right;pointer-events:none;max-width:calc(100% - 24px)";
  credits.textContent = "Car: “art of rally Latest Version 2027” by FarHandle5255 · Textures: “Snowy Mountain Road Scene” by 99.Miles · Sketchfab, CC BY 4.0";
  document.body.appendChild(credits);
  var hintText = "";
  var onHint = function () {}, onFade = function () {};
  function setHint(t) {
    if (t === hintText) return; hintText = t;
    onHint(t);
    if (!t) { hint.style.display = "none"; return; }
    hint.innerHTML = t; hint.style.display = "block";
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function fadeOut(msg) { onFade(true, msg); fade.textContent = msg || ""; fade.classList.add("on"); await sleep(380); }
  async function fadeIn() { onFade(false); fade.classList.remove("on"); await sleep(50); fade.textContent = ""; }

  waitForStudio().then(function (ctx) {
    var S = ctx.S, os = ctx.os, THREE = S.THREE, scene = S.scene, camera = S.camera, renderer = S.renderer, desk = S.desktop;
    var UI = os.fonts.ui;
    var DESTS = [
      { id: "none", title: "Keep it shut", text: "The door stays locked." },
      { id: "rally", title: "Snowy Mountain Rally", text: "5.5 km of snowy mountain road: a long loop with a shortcut through the pass. A car is waiting at the service park." }
    ];
    var dest = os.storage.get("door.dest") || "none";

    // ---------- Door app on the computer ----------
    function paintPreview(c, id, x, y, w, h) {
      c.save(); rr(c, x, y, w, h, 12); c.clip();
      if (id === "none") {
        var g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, "#3a3f47"); g.addColorStop(1, "#23262b");
        c.fillStyle = g; c.fillRect(x, y, w, h);
        var dw = h * 0.42, dh = h * 0.78, dx = x + w / 2 - dw / 2, dy = y + h - dh;
        c.fillStyle = "#e9e7e1"; c.fillRect(dx, dy, dw, dh);
        c.fillStyle = "#cfccc4"; c.fillRect(dx + dw * 0.08, dy + dh * 0.06, dw * 0.84, dh * 0.4); c.fillRect(dx + dw * 0.08, dy + dh * 0.52, dw * 0.84, dh * 0.42);
        c.fillStyle = "#1d1d1f"; c.beginPath(); c.arc(dx + dw * 0.82, dy + dh * 0.5, h * 0.025, 0, 7); c.fill();
        var lx = x + w / 2, ly = y + h * 0.42;
        c.strokeStyle = "#ffd36b"; c.lineWidth = h * 0.035; c.beginPath(); c.arc(lx, ly - h * 0.05, h * 0.07, Math.PI, 0); c.stroke();
        c.fillStyle = "#ffd36b"; rr(c, lx - h * 0.1, ly - h * 0.05, h * 0.2, h * 0.16, 8); c.fill();
      } else {
        var s = c.createLinearGradient(0, y, 0, y + h * 0.6); s.addColorStop(0, "#5f8cc4"); s.addColorStop(1, "#dbe6f1");
        c.fillStyle = s; c.fillRect(x, y, w, h);
        function ridge(base, amp, seed, col, snowcap) {
          c.beginPath(); c.moveTo(x, y + h);
          for (var i = 0; i <= 60; i++) {
            var px = x + w * i / 60, t = i / 60;
            var py = y + h * base - amp * h * (0.5 + 0.5 * Math.sin(t * 7 + seed)) * (0.6 + 0.4 * Math.sin(t * 17 + seed * 3)) - amp * h * 0.4 * Math.abs(Math.sin(t * 3.3 + seed));
            c.lineTo(px, py);
          }
          c.lineTo(x + w, y + h); c.closePath(); c.fillStyle = col; c.fill();
          if (snowcap) { c.save(); c.clip(); c.fillStyle = "rgba(255,255,255,.75)"; c.fillRect(x, y, w, y + h * (base - amp * 0.6) - y); c.restore(); }
        }
        ridge(0.62, 0.42, 1.2, "#9fb0c4", true);
        ridge(0.74, 0.28, 4.1, "#c9d4df", false);
        c.fillStyle = "#f4f7fa"; c.fillRect(x, y + h * 0.74, w, h * 0.26);
        c.strokeStyle = "#55585e"; c.lineWidth = h * 0.06; c.lineCap = "round";
        c.beginPath(); c.moveTo(x + w * 0.1, y + h * 1.02); c.bezierCurveTo(x + w * 0.55, y + h * 0.86, x + w * 0.2, y + h * 0.8, x + w * 0.62, y + h * 0.76); c.stroke();
        c.fillStyle = "#26402f";
        for (var k = 0; k < 26; k++) {
          var tx = x + w * hash1(k * 3.1), th = h * (0.1 + 0.08 * hash1(k * 7.7)), ty = y + h * (0.78 + 0.18 * hash1(k * 1.9));
          if (Math.abs(tx - (x + w * 0.4)) < w * 0.08 && ty > y + h * 0.82) continue;
          c.beginPath(); c.moveTo(tx, ty - th); c.lineTo(tx + th * 0.22, ty); c.lineTo(tx - th * 0.22, ty); c.closePath(); c.fill();
        }
        c.fillStyle = "#14171c"; rr(c, x + w * 0.56, y + h * 0.71, w * 0.09, h * 0.05, 4); c.fill();
      }
      c.restore();
    }
    class DoorApp {
      id = "door"; title = "Door"; defaultRect = { x: 360, y: 110, w: 1180, h: 760 }; minSize = [760, 560];
      constructor(o) { this.os = o; }
      cards(r) {
        var pad = 36, gap = 28, top = 104, cw = (r.w - pad * 2 - gap) / 2, ch = r.h - top - 92;
        return DESTS.map(function (d, i) { return { d: d, x: pad + i * (cw + gap), y: top, w: cw, h: ch }; });
      }
      draw(c, r) {
        c.fillStyle = "#f5f5f7"; c.fillRect(r.x, r.y, r.w, r.h);
        c.fillStyle = "#1d1d1f"; c.font = "700 30px " + UI; c.textBaseline = "alphabetic";
        c.fillText("Where should the office door lead?", r.x + 36, r.y + 58);
        c.fillStyle = "#6b6b70"; c.font = "400 19px " + UI;
        c.fillText("Pick a place, then walk to the door and press E.", r.x + 36, r.y + 86);
        this.cards(r).forEach(function (k) {
          var on = k.d.id === dest, x = r.x + k.x, y = r.y + k.y;
          c.save(); c.shadowColor = "rgba(0,0,0,.12)"; c.shadowBlur = 18; c.shadowOffsetY = 6;
          rr(c, x, y, k.w, k.h, 16); c.fillStyle = "#fff"; c.fill(); c.restore();
          rr(c, x, y, k.w, k.h, 16); c.lineWidth = on ? 4 : 1; c.strokeStyle = on ? "#0a5bd8" : "#d9d9de"; c.stroke();
          var ph = k.h - 150;
          paintPreview(c, k.d.id, x + 14, y + 14, k.w - 28, ph);
          c.fillStyle = "#1d1d1f"; c.font = "700 24px " + UI; c.fillText(k.d.title, x + 22, y + ph + 54);
          c.fillStyle = "#55555a"; c.font = "400 18px " + UI;
          var words = k.d.text.split(" "), line = "", ly = y + ph + 84;
          words.forEach(function (wd) { var t = line ? line + " " + wd : wd; if (c.measureText(t).width > k.w - 44) { c.fillText(line, x + 22, ly); ly += 25; line = wd; } else line = t; });
          if (line) c.fillText(line, x + 22, ly);
          if (on) {
            c.beginPath(); c.arc(x + k.w - 34, y + 34, 18, 0, 7); c.fillStyle = "#0a5bd8"; c.fill();
            c.strokeStyle = "#fff"; c.lineWidth = 4; c.beginPath(); c.moveTo(x + k.w - 43, y + 34); c.lineTo(x + k.w - 37, y + 41); c.lineTo(x + k.w - 25, y + 27); c.stroke();
          }
        });
        var sy = r.y + r.h - 46;
        c.fillStyle = "#ebebef"; c.fillRect(r.x, sy, r.w, 46);
        c.fillStyle = "#3a3a3e"; c.font = "500 18px " + UI; c.textBaseline = "middle";
        var cur = DESTS.find(function (d) { return d.id === dest; });
        c.fillText(dest === "none" ? "The door is locked." : "The door now leads to " + cur.title + ".", r.x + 22, sy + 23);
        c.textBaseline = "alphabetic";
      }
      cursor(x, y, r) { return this.cards(r).some(function (k) { return x > k.x && x < k.x + k.w && y > k.y && y < k.y + k.h; }) ? "pointer" : "arrow"; }
      pointerDown(x, y, r) {
        var hit = this.cards(r).find(function (k) { return x > k.x && x < k.x + k.w && y > k.y && y < k.y + k.h; });
        if (hit) { dest = hit.d.id; this.os.storage.set("door.dest", dest); this.os.invalidate(); }
      }
      drawIcon(c, x, y, s) {
        c.save(); c.shadowColor = "rgba(0,0,0,0.25)"; c.shadowBlur = 8; c.shadowOffsetY = 3;
        rr(c, x, y, s, s, s * 0.23); var g = c.createLinearGradient(0, y, 0, y + s); g.addColorStop(0, "#6aa0dc"); g.addColorStop(1, "#2f5f9c"); c.fillStyle = g; c.fill(); c.restore();
        rr(c, x, y, s, s, s * 0.23); c.clip();
        c.fillStyle = "#f3f1ec"; c.fillRect(x + s * 0.32, y + s * 0.2, s * 0.36, s * 0.66);
        c.fillStyle = "#2f5f9c"; c.beginPath(); c.arc(x + s * 0.6, y + s * 0.55, s * 0.035, 0, 7); c.fill();
        c.fillStyle = "#ffffff"; c.beginPath(); c.moveTo(x, y + s); c.lineTo(x + s * 0.3, y + s * 0.78); c.lineTo(x + s * 0.55, y + s); c.fill();
      }
    }
    var doorApp = new DoorApp(os);
    os.apps.set("door", doorApp);
    var si = os.dockApps.indexOf("system");
    os.dockApps.splice(si < 0 ? os.dockApps.length : si, 0, "door");
    os.invalidate();

    // ---------- shared state ----------
    var mode = "room";           // room | foot | drive
    var busy = false;
    var keys = new Set();
    var map = null;              // built lazily
    var saved = null;
    var roomDoor = scene.getObjectByName("door");
    var ray = new THREE.Raycaster(); ray.far = 2.6;
    var lookYaw = 0, lookPitch = 0, lookIdle = 0;

    // ---------- VR: controllers, in-headset hint + fade, rig placement ----------
    // In a headset the camera sits inside the XR rig and the headset owns its
    // pose, so everything that moves "the player" moves the rig instead.
    var xr = S.xr;
    function inXR() { return !!(xr && renderer.xr && renderer.xr.isPresenting); }
    var _e = new THREE.Euler(0, 0, 0, "YXZ"), UP = new THREE.Vector3(0, 1, 0);
    function headWorld(out) { camera.updateMatrixWorld(true); return (out || new THREE.Vector3()).setFromMatrixPosition(camera.matrixWorld); }
    function headLocalYaw() { return _e.setFromQuaternion(camera.quaternion, "YXZ").y; }
    // put the real head at world (x, z) looking along yaw, with the rig's floor at height y
    function placeHead(x, z, y, yaw) {
      var rig = xr.rig;
      rig.position.set(0, 0, 0); rig.quaternion.setFromAxisAngle(UP, yaw - headLocalYaw()); rig.scale.set(1, 1, 1);
      rig.updateMatrixWorld(true);
      var h = camera.position.clone().applyMatrix4(rig.matrixWorld);
      rig.position.set(x - h.x, y, z - h.z);
      rig.updateMatrixWorld(true);
    }
    // driver's seat: the head pose (in rig space) at the moment of sitting
    // down maps onto the driver's eye point, so leaning and looking around
    // still work; X re-centres
    var seatRef = null;
    var EYE_LOCAL = new THREE.Vector3(0.36, 1.12, -0.12); // left-hand drive: +X is the left side when +Z is forward
    function recenterSeat() { seatRef = { p: camera.position.clone(), yaw: headLocalYaw() }; }
    var _seat = new THREE.Matrix4(), _ref = new THREE.Matrix4(), _qy = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1);
    function placeSeat() {
      if (!seatRef) recenterSeat();
      var car = map.car; car.root.updateMatrixWorld(true);
      _seat.compose(EYE_LOCAL, _qy.setFromAxisAngle(UP, Math.PI), ONE).premultiply(car.root.matrixWorld);
      _ref.compose(seatRef.p, _qy.setFromAxisAngle(UP, seatRef.yaw), ONE).invert();
      _seat.multiply(_ref).decompose(xr.rig.position, xr.rig.quaternion, xr.rig.scale);
      xr.rig.scale.set(1, 1, 1);
      xr.rig.updateMatrixWorld(true);
    }
    // entering VR while on the mountain: the studio's XR code has just put the
    // rig in the room, so carry the player over once the head pose is live
    var needPlace = 0, carryPos = null;
    renderer.xr.addEventListener("sessionstart", function () {
      if (mode === "room") return;
      carryPos = mode === "foot" ? camera.position.clone() : null; // still the desktop pose here
      needPlace = 3; // frames
    });
    var lastHead = new THREE.Vector3(), lastHeadYaw = 0;
    renderer.xr.addEventListener("sessionend", function () {
      if (xr) xr.seated = false;
      dash.visible = false;
      if (mode === "foot") { camera.position.copy(lastHead); desk.yaw = lastHeadYaw; desk.pitch = 0; }
      else if (mode === "drive") map.snapCamera();
    });

    // gamepads (controllers only; tracked hands have none)
    var padPrev = {};
    function pads() {
      var out = { left: null, right: null }, ses = renderer.xr.getSession && renderer.xr.getSession();
      if (!ses) return out;
      for (var i = 0; i < ses.inputSources.length; i++) {
        var src = ses.inputSources[i];
        if (src.gamepad && !src.hand && (src.handedness === "left" || src.handedness === "right")) out[src.handedness] = src.gamepad;
      }
      return out;
    }
    function pressed(gp, i) { return !!(gp && gp.buttons[i] && gp.buttons[i].pressed); }
    function value(gp, i) { return gp && gp.buttons[i] ? gp.buttons[i].value : 0; }
    function edge(side, gp, i) { var k = side + i, now = pressed(gp, i), was = !!padPrev[k]; padPrev[k] = now; return now && !was; }
    function vrButtons() {
      var P = pads();
      return { P: P, A: edge("right", P.right, 4), B: edge("right", P.right, 5), X: edge("left", P.left, 4), Y: edge("left", P.left, 5), RT: edge("right", P.right, 0) };
    }
    function rumble(strength, ms) {
      var P = pads();
      [P.left, P.right].forEach(function (gp) {
        var a = gp && gp.hapticActuators && gp.hapticActuators[0];
        if (a && a.pulse) try { a.pulse(Math.min(1, strength), ms); } catch (e) {}
      });
    }

    // hint panel a little below the line of sight; the fade is a dark shell round the head
    var vrHintCv = document.createElement("canvas"); vrHintCv.width = 1024; vrHintCv.height = 256;
    var vrHintTex = new THREE.CanvasTexture(vrHintCv); vrHintTex.colorSpace = THREE.SRGBColorSpace;
    var vrHint = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.16), new THREE.MeshBasicMaterial({ map: vrHintTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    vrHint.name = "rally-vr-hint"; vrHint.position.set(0, -0.2, -0.9); vrHint.renderOrder = 1003; vrHint.visible = false; vrHint.frustumCulled = false;
    camera.add(vrHint);
    var vrFade = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshBasicMaterial({ color: 0x05070a, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
    vrFade.name = "rally-vr-fade"; vrFade.renderOrder = 1002; vrFade.visible = false; vrFade.frustumCulled = false;
    camera.add(vrFade);
    if (S.gun && S.gun.effects && S.gun.effects.ignore) { S.gun.effects.ignore.add(vrHint); S.gun.effects.ignore.add(vrFade); }
    var vrHintText = "", fadeTarget = 0, fadeMsg = "";
    function vrText(t) {
      // desktop hints say "E"; in VR the same action is the A (or X) button
      return (t || "").replace(/<kbd>E<\/kbd>/g, "A \u00b7 ").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
    }
    function drawVRHint(t) {
      if (t === vrHintText) return; vrHintText = t;
      var c = vrHintCv.getContext("2d");
      c.clearRect(0, 0, 1024, 256);
      if (!t) { vrHintTex.needsUpdate = true; return; }
      c.font = "600 40px system-ui, sans-serif";
      var lines = [];
      t.split("\n").forEach(function (para) {
        var line = "";
        para.split(" ").forEach(function (w) { var tt = line ? line + " " + w : w; if (c.measureText(tt).width > 940 && line) { lines.push(line); line = w; } else line = tt; });
        lines.push(line);
      });
      lines = lines.slice(0, 4);
      var h = lines.length * 52 + 34, y0 = (256 - h) / 2;
      rr(c, 12, y0, 1000, h, 28); c.fillStyle = "rgba(14,16,20,0.82)"; c.fill();
      c.fillStyle = "#ffffff"; c.textAlign = "center"; c.textBaseline = "middle";
      lines.forEach(function (l, i) { c.fillText(l, 512, y0 + 17 + 26 + i * 52); });
      vrHintTex.needsUpdate = true;
    }
    onHint = function (t) { if (!fadeMsg) drawVRHint(vrText(t)); };
    onFade = function (on, msg) { fadeTarget = on ? 1 : 0; fadeMsg = on ? (msg || "") : ""; drawVRHint(fadeMsg || vrText(hintText)); };
    function updateVRLayer(dt) {
      var on = inXR();
      var m = vrFade.material;
      m.opacity += (fadeTarget - m.opacity) * Math.min(1, dt * 14);
      vrFade.visible = on && m.opacity > 0.01;
      vrHint.visible = on && !!vrHintText;
    }

    // dashboard speedometer, shown while driving in VR
    var dashCv = document.createElement("canvas"); dashCv.width = 256; dashCv.height = 128;
    var dashTex = new THREE.CanvasTexture(dashCv); dashTex.colorSpace = THREE.SRGBColorSpace;
    var dash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshBasicMaterial({ map: dashTex, transparent: true, toneMapped: false }));
    dash.name = "rally-vr-dash"; dash.visible = false;
    // car frame: +Z forward, driver's eye at EYE_LOCAL; the panel sits above the
    // instrument binnacle, tilted back toward the driver
    dash.position.set(0.36, 0.86, 0.5); dash.rotation.set(-0.35, Math.PI, 0, "YXZ");
    var dashShown = "";
    function drawDash(kmh, gearTxt) {
      var key = kmh + "|" + gearTxt; if (key === dashShown) return; dashShown = key;
      var c = dashCv.getContext("2d"); c.clearRect(0, 0, 256, 128);
      rr(c, 4, 4, 248, 120, 18); c.fillStyle = "rgba(10,12,16,0.85)"; c.fill();
      c.fillStyle = "#fff"; c.textAlign = "right"; c.textBaseline = "alphabetic";
      c.font = "700 64px system-ui, sans-serif"; c.fillText(String(kmh), 170, 84);
      c.font = "600 22px system-ui, sans-serif"; c.fillStyle = "#c9d3de"; c.fillText("km/h", 170, 112);
      c.textAlign = "center"; c.font = "700 44px system-ui, sans-serif"; c.fillStyle = "#6cc4ff"; c.fillText(gearTxt, 214, 80);
      dashTex.needsUpdate = true;
    }

    addEventListener("keydown", function (e) {
      if (mode === "drive") {
        keys.add(e.code);
        if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) >= 0) e.preventDefault();
        if (e.repeat) return;
        if (e.code === "KeyE") exitCar();
        else if (e.code === "KeyC") { map.camMode = (map.camMode + 1) % 3; }
        else if (e.code === "KeyR") map.resetCar();
        return;
      }
      if (e.repeat || e.code !== "KeyE" || desk.mode !== "walk") return;
      act();
    });
    addEventListener("keyup", function (e) { keys.delete(e.code); });
    addEventListener("blur", function () { keys.clear(); });
    renderer.domElement.addEventListener("mousedown", function (e) {
      if (e.button !== 0 || document.pointerLockElement !== renderer.domElement) return;
      if (mode !== "drive" && desk.mode === "walk" && hintAction) act();
    });
    renderer.domElement.addEventListener("mousemove", function (e) {
      if (mode !== "drive" || document.pointerLockElement !== renderer.domElement) return;
      lookYaw = clamp(lookYaw - e.movementX * 0.003, -2.6, 2.6);
      lookPitch = clamp(lookPitch - e.movementY * 0.002, -0.5, 0.6);
      lookIdle = 0;
    });

    var hintAction = null;
    window.__rally = { enterMap: function(){ return enterMap(); }, enterCar: function(){ return enterCar(); }, exitCar: function(){ return exitCar(); }, leaveMap: function(){ return leaveMap(); }, keys: keys, get map(){ return map; }, get mode(){ return mode; } };
    function act() {
      if (busy || !hintAction) return;
      var a = hintAction;
      if (a === "door-open") enterMap();
      else if (a === "door-back") leaveMap();
      else if (a === "car") enterCar();
    }

    // ---------- render hook drives everything ----------
    var last = performance.now();
    var origRender = renderer.render.bind(renderer);
    renderer.render = function (sc, cam) {
      if (sc === scene && cam === camera) {
        var now = performance.now(), dt = Math.min((now - last) / 1000, 0.05); last = now;
        try { tick(dt, now / 1000); } catch (err) { console.error(err); }
      }
      return origRender(sc, cam);
    };

    var doorBox = new THREE.Box3(), xray = new THREE.Raycaster(); xray.far = 6;
    function rightRay() {
      var h = xr && xr.hands && xr.hands.find(function (q) { return q.source && q.source.handedness === "right" && !q.source.hand; });
      if (!h) return null;
      h.ray.updateMatrixWorld(true);
      xray.ray.origin.setFromMatrixPosition(h.ray.matrixWorld);
      xray.ray.direction.set(0, 0, -1).transformDirection(h.ray.matrixWorld);
      return xray;
    }
    function tick(dt, t) {
      var xrOn = inXR();
      updateVRLayer(dt);
      if (xrOn) { headWorld(lastHead); lastHeadYaw = _e.setFromQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()), "YXZ").y; }
      var vb = xrOn ? vrButtons() : null;
      if (xrOn && needPlace > 0 && --needPlace === 0 && map) {
        if (mode === "foot") {
          var cx0 = carryPos ? carryPos.x : OFFX + map.spawn.x, cz0 = carryPos ? carryPos.z : map.spawn.z;
          placeHead(cx0, cz0, map.groundAt(cx0 - OFFX, cz0).h, desk.yaw);
        } else if (mode === "drive") { xr.seated = true; recenterSeat(); map.car.root.add(dash); dash.visible = true; }
      } else if (!xrOn) needPlace = 0;
      if (mode === "room") {
        hintAction = null;
        if (xrOn) {
          if (busy || !roomDoor) { setHint(""); return; }
          // walk up to the door (or point at it) and press A / X, or pull the trigger at it
          doorBox.setFromObject(roomDoor);
          var hp = headWorld(), dc = doorBox.getCenter(new THREE.Vector3());
          var near = Math.hypot(hp.x - dc.x, hp.z - dc.z) < 1.5;
          var rr0 = rightRay(), aimed = !!(rr0 && rr0.ray.intersectsBox(doorBox));
          if (near || aimed) {
            if (dest === "rally") { hintAction = "door-open"; setHint("<kbd>E</kbd>Open the door to Snowy Mountain Rally"); }
            else setHint("Locked. Choose where it leads in the Door app on the computer.");
          } else setHint("");
          if (hintAction && (vb.A || vb.X || (aimed && vb.RT))) act();
          return;
        }
        if (busy || desk.mode !== "walk" || desk.held || !roomDoor || document.pointerLockElement !== renderer.domElement) { setHint(""); return; }
        ray.setFromCamera(new THREE.Vector2(0, 0), camera);
        var hit = ray.intersectObject(roomDoor, true)[0];
        if (hit) {
          if (dest === "rally") { hintAction = "door-open"; setHint("<kbd>E</kbd>Open the door to Snowy Mountain Rally"); }
          else setHint("Locked. Choose where it leads in the Door app on the computer.");
        } else setHint("");
        return;
      }
      if (!map) return;
      map.update(dt, t);
      if (xrOn && !busy) {
        if (mode === "foot" && hintAction && (vb.A || vb.X)) act();
        else if (mode === "drive") {
          if (vb.B) exitCar();
          else if (vb.Y) { map.resetCar(); flash("Back on the road"); }
          else if (vb.X) { recenterSeat(); flash("Seat re-centred"); }
        }
      }
    }

    // ---------- entering / leaving ----------
    async function enterMap() {
      if (busy) return; busy = true; setHint("");
      try {
        if (desk.held) desk.drop(false);
        if (inXR()) xr.hands.forEach(function (h) { xr.releaseAll(h); });
        await fadeOut(map ? "" : "Building the mountain…");
        if (!map) { await sleep(30); map = await buildMap(); }
        saved = {
          pos: camera.position.clone(), yaw: desk.yaw, pitch: desk.pitch,
          bounds: desk.walk.bounds.clone(), blockers: desk.walk.blockers.slice(),
          bg: scene.background, env: scene.environment, fog: scene.fog,
          envI: scene.environmentIntensity, bgI: scene.backgroundIntensity, bgB: scene.backgroundBlurriness,
          near: camera.near, far: camera.far, exposure: renderer.toneMappingExposure,
          hidden: []
        };
        scene.children.forEach(function (o) {
          if (o === map.root || o === camera || o.isCamera || !o.visible) return;
          if (o.name === "xr-rig") return;
          o.visible = false; saved.hidden.push(o);
        });
        map.root.visible = true;
        scene.background = map.sky; scene.fog = map.fog;
        if ("environmentIntensity" in scene) scene.environmentIntensity = 0.55;
        scene.backgroundIntensity = 1; scene.backgroundBlurriness = 0;
        camera.near = 0.1; camera.far = 9000; camera.updateProjectionMatrix();
        desk.walk.bounds = new THREE.Box2(new THREE.Vector2(OFFX - 1170, -1170), new THREE.Vector2(OFFX + 1170, 1170));
        map.updateBlockers();
        var sp = map.spawn;
        desk.yaw = sp.yaw; desk.pitch = -0.05;
        // in VR camera.position is the head inside the rig (the headset's), so move the rig
        if (inXR()) placeHead(OFFX + sp.x, sp.z, map.groundAt(sp.x, sp.z).h, sp.yaw);
        else camera.position.set(OFFX + sp.x, map.groundAt(sp.x, sp.z).h + EYE, sp.z);
        mode = "foot"; credits.style.display = "block";
        renderer.shadowMap.needsUpdate = true;
      } finally {
        await fadeIn(); busy = false;
      }
    }
    async function leaveMap() {
      if (busy) return; busy = true; setHint("");
      await fadeOut("");
      map.stopAudio();
      map.root.visible = false;
      saved.hidden.forEach(function (o) { o.visible = true; });
      scene.background = saved.bg; scene.environment = saved.env; scene.fog = saved.fog;
      if ("environmentIntensity" in scene) scene.environmentIntensity = saved.envI;
      scene.backgroundIntensity = saved.bgI; scene.backgroundBlurriness = saved.bgB;
      camera.near = saved.near; camera.far = saved.far; camera.updateProjectionMatrix();
      desk.walk.bounds = saved.bounds; desk.walk.blockers = saved.blockers;
      desk.yaw = Math.PI / 2; desk.pitch = 0;
      if (inXR()) placeHead(1.5, 1.55, 0, Math.PI / 2);
      else camera.position.set(1.5, EYE, 1.55);
      mode = "room"; credits.style.display = "none";
      renderer.shadowMap.needsUpdate = true;
      await fadeIn(); busy = false;
    }
    async function enterCar() {
      if (busy) return; busy = true; setHint("");
      await fadeOut("");
      desk.enabled = false; desk.keys && desk.keys.clear(); keys.clear();
      mode = "drive"; lookYaw = 0; lookPitch = 0;
      document.body.classList.add("rl-driving"); hud.style.display = "block";
      map.startAudio();
      map.snapCamera();
      if (inXR()) {
        xr.seated = true; recenterSeat(); map.car.root.add(dash); dash.visible = true;
        flash("Right trigger: gas \u00b7 Left trigger: brake / reverse\nStick: steer \u00b7 A: handbrake\nB: get out \u00b7 Y: back on the road \u00b7 X: re-centre seat", 9);
      }
      await fadeIn(); busy = false;
    }
    async function exitCar() {
      if (busy) return;
      var car = map.car;
      if (Math.abs(car.vf) > 2.5) { flash("Slow down to get out"); return; }
      busy = true;
      await fadeOut("");
      map.stopAudio();
      car.vx = car.vz = car.vy = 0; car.r = 0; car.vf = 0;
      var lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw);
      var px = car.x + lx * 2.0, pz = car.z + lz * 2.0;
      if (!inXR()) camera.position.set(OFFX + px, map.groundAt(px, pz).h + EYE, pz);
      desk.yaw = car.yaw + Math.PI; desk.pitch = -0.1;
      if (xr) xr.seated = false;
      dash.visible = false;
      if (inXR()) placeHead(OFFX + px, pz, map.groundAt(px, pz).h, car.yaw + Math.PI);
      desk.enabled = true; keys.clear();
      mode = "foot";
      document.body.classList.remove("rl-driving"); hud.style.display = "none";
      map.updateBlockers();
      await fadeIn(); busy = false;
    }
    var flashTimer = 0;
    function flash(t, secs) { setHint(t); flashTimer = secs || 1.6; }

    // ---------- data ----------
    // map + car data (packed by hand from the CC BY 4.0 sources credited above):
    // { meta, geo: base64 gzip, tex: base64 webp atlas }
    var dataPromise = null;
    function rallyData() {
      if (!dataPromise) dataPromise = fetch("addons/rally-data.json").then(function (r) {
        if (!r.ok) throw new Error("rally data " + r.status);
        return r.json();
      });
      return dataPromise;
    }
    function b64(s) {
      var bin = atob(s), u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    }
    async function gunzip(u) {
      var ds = new DecompressionStream("gzip");
      return await new Response(new Blob([u]).stream().pipeThrough(ds)).arrayBuffer();
    }
    async function webpTexture(bytes, opt) {
      opt = opt || {};
      var bmp = await createImageBitmap(new Blob([bytes], { type: "image/webp" }), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
      var t = new THREE.Texture(bmp);
      t.flipY = false; t.needsUpdate = true;
      if (opt.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
      if (opt.repeat !== false) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return t;
    }

    // ---------- build the map ----------
    async function buildMap() {
      var data = await rallyData();
      var meta = data.meta;
      var geo = await gunzip(b64(data.geo));
      var texBytes = b64(data.tex);
      var W = meta.world, WB = meta.worldBase;
      function i16(off, n) { return new Int16Array(geo, WB + off, n); }
      function i32(off, n) { return new Int32Array(geo, WB + off, n); }
      function u8(off, n) { return new Uint8Array(geo, WB + off, n); }
      var T = {};
      var tm = meta.tex.tex;
      var names = Object.keys(tm);
      await Promise.all(names.map(async function (k) {
        var e = tm[k];
        var isData = /N$|R$/.test(k);
        T[k] = await webpTexture(texBytes.subarray(e.off, e.off + e.len), { srgb: !isData, repeat: k !== "trees" });
      }));
      T.trees.wrapS = T.trees.wrapT = THREE.ClampToEdgeWrapping;

      var root = new THREE.Group(); root.name = "rally-map"; root.position.set(OFFX, 0, 0); root.visible = false;
      scene.add(root);

      // ---- terrain ----
      var N = W.N, SZ = W.S, cell = SZ / (N - 1), half = SZ / 2;
      var Hq = i16(W.H, N * N), H = new Float32Array(N * N);
      for (var i = 0; i < N * N; i++) H[i] = Hq[i] / 10;
      function terrainH(x, z) {
        var fx = (x + half) / cell, fz = (z + half) / cell;
        var i = Math.floor(fx), j = Math.floor(fz);
        if (i < 0) { i = 0; fx = 0; } if (j < 0) { j = 0; fz = 0; }
        if (i > N - 2) { i = N - 2; fx = N - 1; } if (j > N - 2) { j = N - 2; fz = N - 1; }
        fx -= i; fz -= j;
        var a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
        if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
        return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
      }
      function gridGeometry(n, size, heights, yScale, skirt) {
        var g = new THREE.BufferGeometry(), h2 = size / 2, c2 = size / (n - 1);
        var extra = skirt ? 4 * n : 0;
        var pos = new Float32Array((n * n + extra) * 3), uv = new Float32Array((n * n + extra) * 2);
        for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) {
          var k = j * n + i, x = -h2 + i * c2, z = -h2 + j * c2;
          pos[k * 3] = x; pos[k * 3 + 1] = heights[k] * yScale; pos[k * 3 + 2] = z;
          uv[k * 2] = x / 9; uv[k * 2 + 1] = z / 9;
        }
        var idx = [];
        for (var j = 0; j < n - 1; j++) for (var i = 0; i < n - 1; i++) {
          var a = j * n + i, b = a + 1, cc = a + n, d = cc + 1;
          idx.push(a, cc, b, b, cc, d);
        }
        if (skirt) {
          var edges = [];
          for (var i = 0; i < n; i++) edges.push(i);
          for (var j = 1; j < n; j++) edges.push(j * n + n - 1);
          for (var i = n - 2; i >= 0; i--) edges.push((n - 1) * n + i);
          for (var j = n - 2; j >= 1; j--) edges.push(j * n);
          var base = n * n;
          edges.forEach(function (e, q) {
            pos[(base + q) * 3] = pos[e * 3]; pos[(base + q) * 3 + 1] = pos[e * 3 + 1] - 120; pos[(base + q) * 3 + 2] = pos[e * 3 + 2];
            uv[(base + q) * 2] = uv[e * 2]; uv[(base + q) * 2 + 1] = uv[e * 2 + 1] + 6;
          });
          for (var q = 0; q < edges.length; q++) {
            var q2 = (q + 1) % edges.length, a = edges[q], b = edges[q2], a2 = base + q, b2 = base + q2;
            idx.push(a, b, a2, b, b2, a2);
          }
        }
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        g.setIndex(idx.length > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
        g.computeVertexNormals();
        return g;
      }
      function terrainMaterial(farMode) {
        var m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, normalMap: T.snowN, normalScale: new THREE.Vector2(0.55, 0.55) });
        m.onBeforeCompile = function (sh) {
          sh.uniforms.tSnow = { value: T.snow }; sh.uniforms.tRock = { value: T.rock };
          sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;")
            .replace("#include <project_vertex>", "#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);");
          sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm; uniform sampler2D tSnow; uniform sampler2D tRock;")
            .replace("#include <map_fragment>", [
              "vec3 nw = normalize(vWNrm);",
              "vec2 wuv = vWPos.xz;",
              "vec3 snow = texture2D(tSnow, wuv / 9.0).rgb;",
              "float big = texture2D(tRock, wuv / " + (farMode ? "900.0" : "211.0") + ").r;",
              "snow *= mix(0.92, 1.04, big);",
              "vec3 tw = pow(abs(nw), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);",
              "float rs = " + (farMode ? "160.0" : "16.0") + ";",
              "vec3 rock = texture2D(tRock, vWPos.zy / rs).rgb * tw.x + texture2D(tRock, wuv / rs).rgb * tw.y + texture2D(tRock, vWPos.xy / rs).rgb * tw.z;",
              "rock = pow(rock, vec3(1.15)) * vec3(0.78, 0.8, 0.84);",
              "float slope = 1.0 - nw.y;",
              "float rockAmt = smoothstep(0.30, 0.46, slope + (big - 0.5) * 0.22);",
              "diffuseColor.rgb *= mix(snow * vec3(0.97, 0.985, 1.0), rock, rockAmt);"
            ].join("\n"));
        };
        return m;
      }
      var terrain = new THREE.Mesh(gridGeometry(N, SZ, H, 1, true), terrainMaterial(false));
      terrain.receiveShadow = true; root.add(terrain);
      var NO = W.NO, HOq = i16(W.HO, NO * NO), HO = new Float32Array(NO * NO);
      for (var i = 0; i < NO * NO; i++) HO[i] = HOq[i] / 2;
      var outer = new THREE.Mesh(gridGeometry(NO, W.SO, HO, 1, false), terrainMaterial(true));
      root.add(outer);

      // ---- roads ----
      var roads = W.roads.map(function (R) {
        var xz = i32(R.xz, R.n * 2), yy = i32(R.y, R.n), n = R.n;
        var P = new Float32Array(n * 2), Y = new Float32Array(n), Tn = new Float32Array(n * 2), Sd = new Float32Array(n);
        for (var k = 0; k < n; k++) { P[k * 2] = xz[k * 2] / 20; P[k * 2 + 1] = xz[k * 2 + 1] / 20; Y[k] = yy[k] / 100; }
        for (var k = 0; k < n; k++) {
          var a = R.closed ? (k - 1 + n) % n : Math.max(0, k - 1), b = R.closed ? (k + 1) % n : Math.min(n - 1, k + 1);
          var dx = P[b * 2] - P[a * 2], dz = P[b * 2 + 1] - P[a * 2 + 1], l = Math.hypot(dx, dz) || 1;
          Tn[k * 2] = dx / l; Tn[k * 2 + 1] = dz / l;
          if (k > 0) Sd[k] = Sd[k - 1] + Math.hypot(P[k * 2] - P[k * 2 - 2], P[k * 2 + 1] - P[k * 2 - 1]);
        }
        return { n: n, closed: R.closed, P: P, Y: Y, T: Tn, S: Sd, len: Sd[n - 1] + (R.closed ? Math.hypot(P[0] - P[(n - 1) * 2], P[1] - P[(n - 1) * 2 + 1]) : 0) };
      });
      var main = roads[0], conn = roads[1];
      // lateral axis L = (-Tz, Tx)
      var J = W.junctions, park = W.park;
      var parkDir = [park.x - main.P[park.i * 2], park.z - main.P[park.i * 2 + 1]];
      var pl = Math.hypot(parkDir[0], parkDir[1]); parkDir[0] /= pl; parkDir[1] /= pl;
      function lat(rd, k) { return [-rd.T[k * 2 + 1], rd.T[k * 2]]; }
      function sideOf(rd, k, dir) { var L = lat(rd, k); return (L[0] * dir[0] + L[1] * dir[1]) > 0 ? 1 : -1; }
      var parkSide = sideOf(main, park.i, parkDir);
      var juncInfo = J.map(function (jn) {
        var ci = jn.end === 0 ? 0 : conn.n - 1, cj = jn.end === 0 ? 30 : conn.n - 31;
        var dir = [conn.P[cj * 2] - conn.P[ci * 2], conn.P[cj * 2 + 1] - conn.P[ci * 2 + 1]];
        return { i: jn.i, side: sideOf(main, jn.i, dir) };
      });
      function halfW(ri, k) {
        if (ri === 1) { var rd = conn, de = Math.min(rd.S[k], rd.len - rd.S[k]); return 4.6 + 5.0 * (1 - sstep(0, 26, de)); }
        return 4.6;
      }
      function circDist(rd, k, i) { var d = Math.abs(rd.S[k] - rd.S[i]); return rd.closed ? Math.min(d, rd.len - d) : d; }
      function bankGap(ri, k, side) {
        if (ri === 1) { var de = Math.min(conn.S[k], conn.len - conn.S[k]); return de < 24; }
        if (side === parkSide && circDist(main, k, park.i) < 34) return true;
        for (var q = 0; q < juncInfo.length; q++) if (juncInfo[q].side === side && circDist(main, k, juncInfo[q].i) < 15) return true;
        return noise1(main.S[k] / 23 + side * 50) < -0.82;
      }
      function bankH(ri, k, side) { return 0.42 + 0.22 * noise1(roads[ri].S[k] / 9 + side * 13 + ri * 7) + 0.1 * noise1(roads[ri].S[k] / 2.7 + side * 3); }
      var SH_OUT = 10.5;
      // shoulder height between road edge and terrain
      function shoulderY(ri, k, side, d, roadY, px, pz) {
        var hw = halfW(ri, k);
        if (d <= hw) return roadY;
        var t = clamp((d - hw) / (SH_OUT - hw), 0, 1);
        var L = lat(roads[ri], k);
        var ox = px + L[0] * side * (SH_OUT - d), oz = pz + L[1] * side * (SH_OUT - d);
        var ty = terrainH(ox, oz) + 0.03;
        return (roadY - 0.03) * (1 - t) + ty * t;
      }
      var BANK = [-0.25, 0.35, 0.95, 1.6, 2.4], BANKP = [0, 0.62, 1, 0.55, 0];
      function bankProfile(off) {
        if (off <= BANK[0] || off >= BANK[4]) return 0;
        for (var q = 0; q < 4; q++) if (off < BANK[q + 1]) { var t = (off - BANK[q]) / (BANK[q + 1] - BANK[q]); return BANKP[q] + (BANKP[q + 1] - BANKP[q]) * t; }
        return 0;
      }

      // spatial index of road samples
      var GC = 12, grid = new Map();
      function gkey(ix, iz) { return ix * 100003 + iz; }
      roads.forEach(function (rd, ri) {
        for (var k = 0; k < rd.n; k++) {
          var key = gkey(Math.floor(rd.P[k * 2] / GC), Math.floor(rd.P[k * 2 + 1] / GC));
          var l = grid.get(key); if (!l) grid.set(key, l = []); l.push(ri, k);
        }
      });
      function nearestRoad(x, z) {
        var ix = Math.floor(x / GC), iz = Math.floor(z / GC), best = null, bd = 1e9;
        for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) {
          var l = grid.get(gkey(ix + a, iz + b)); if (!l) continue;
          for (var q = 0; q < l.length; q += 2) {
            var ri = l[q], k = l[q + 1], rd = roads[ri];
            var k2 = k + 1; if (k2 >= rd.n) { if (!rd.closed) continue; k2 = 0; }
            var ax = rd.P[k * 2], az = rd.P[k * 2 + 1], dx = rd.P[k2 * 2] - ax, dz = rd.P[k2 * 2 + 1] - az;
            var ll = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / ll, 0, 1);
            var qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(x - qx, z - qz);
            if (d < bd) {
              bd = d;
              var cr = dx * (z - az) - dz * (x - ax); // >0 means on -L side? compute side via L
              var L = [-dz, dx], sd = ((x - qx) * L[0] + (z - qz) * L[1]) >= 0 ? 1 : -1;
              best = { ri: ri, k: k, t: t, d: d, side: sd, y: rd.Y[k] + (rd.Y[k2] - rd.Y[k]) * t, qx: qx, qz: qz };
            }
          }
        }
        return best;
      }
      // ground query used by physics and walking
      function groundAt(x, z) {
        var nr = nearestRoad(x, z);
        if (nr && nr.d < SH_OUT) {
          var hw = halfW(nr.ri, nr.k), y;
          if (nr.d <= hw) y = nr.y;
          else y = shoulderY(nr.ri, nr.k, nr.side, nr.d, nr.y, x, z);
          var surf = nr.d <= hw - 0.4 ? 0 : 1, bank = 0;
          var off = nr.d - hw;
          if (off > BANK[0] && off < BANK[4] && !bankGap(nr.ri, nr.k, nr.side)) { bank = bankProfile(off) * bankH(nr.ri, nr.k, nr.side); surf = 2; }
          return { h: y + bank * 0.85, surf: surf, road: nr };
        }
        return { h: terrainH(x, z), surf: 1, road: nr };
      }

      // ---- road, shoulder and bank meshes ----
      var roadMat = new THREE.MeshStandardMaterial({ map: T.road, normalMap: T.roadN, roughnessMap: T.roadR, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.8, 0.8) });
      var connMat = roadMat.clone(); connMat.polygonOffset = true; connMat.polygonOffsetFactor = -2; connMat.polygonOffsetUnits = -2;
      var snowMat = terrainMaterial(false);
      snowMat.polygonOffset = true; snowMat.polygonOffsetFactor = -1; snowMat.polygonOffsetUnits = -1;
      var bankMat = new THREE.MeshStandardMaterial({ map: T.bank, normalMap: T.bankN, roughness: 0.92, metalness: 0, color: 0xf4f6fa });
      var poleData = [];
      roads.forEach(function (rd, ri) {
        var n = rd.n, segs = rd.closed ? n : n - 1;
        // road ribbon
        var rp = [], ru = [], ri_ = [];
        for (var k = 0; k < n; k++) {
          var L = lat(rd, k), hw = halfW(ri, k), vmin = 0, vmax = 1;
          if (ri === 1) { var de = Math.min(rd.S[k], rd.len - rd.S[k]); vmin = 0.16 * (1 - sstep(0, 26, de)); vmax = 1 - vmin; }
          var x = rd.P[k * 2], z = rd.P[k * 2 + 1], y = rd.Y[k] + 0.02 + (ri === 1 ? 0.01 : 0);
          rp.push(x - L[0] * hw, y, z - L[1] * hw, x + L[0] * hw, y, z + L[1] * hw);
          ru.push(rd.S[k] / 9, vmin, rd.S[k] / 9, vmax);
        }
        if (rd.closed) { var k = 0, L = lat(rd, 0), hw = halfW(ri, 0); rp.push(rp[0], rp[1], rp[2], rp[3], rp[4], rp[5]); ru.push(rd.len / 9, 0, rd.len / 9, 1); }
        var nv = rp.length / 6;
        for (var k = 0; k < nv - 1; k++) { var a = k * 2; ri_.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        var g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(ru, 2));
        g.setIndex(ri_); g.computeVertexNormals();
        var m = new THREE.Mesh(g, ri === 1 ? connMat : roadMat); m.receiveShadow = true; m.renderOrder = ri === 1 ? 2 : 1; root.add(m);
        // shoulders and banks per side
        [-1, 1].forEach(function (side) {
          var COLS = [0, 0.5, 2.5, 5, 1e9];   // offsets past half width; last = SH_OUT
          var sp = [], su = [], si = [], bp = [], bu = [], bi = [], bcount = 0;
          var cols = COLS.length;
          for (var kk = 0; kk <= segs; kk++) {
            var k = kk % n, L = lat(rd, k), hw = halfW(ri, k), x = rd.P[k * 2], z = rd.P[k * 2 + 1], y = rd.Y[k];
            for (var c = 0; c < cols; c++) {
              var d = c === cols - 1 ? SH_OUT : Math.min(SH_OUT - 0.2, hw - 0.15 + COLS[c]);
              var px = x + L[0] * side * d, pz = z + L[1] * side * d;
              var py = c === 0 ? y - 0.01 : shoulderY(ri, k, side, d, y, x, z);
              sp.push(px, py, pz); su.push(px / 9, pz / 9);
            }
          }
          for (var kk = 0; kk < segs; kk++) for (var c = 0; c < cols - 1; c++) {
            var a = kk * cols + c, b = a + 1, a2 = a + cols, b2 = a2 + 1;
            if (side > 0) si.push(a, b, a2, b, b2, a2); else si.push(a, a2, b, b, a2, b2);
          }
          var g2 = new THREE.BufferGeometry();
          g2.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3)); g2.setAttribute("uv", new THREE.Float32BufferAttribute(su, 2));
          g2.setIndex(si); g2.computeVertexNormals();
          var m2 = new THREE.Mesh(g2, snowMat); m2.receiveShadow = true; root.add(m2);
          // banks: emit strips only where there is no gap
          var run = [];
          function flush() {
            if (run.length < 2) { run = []; return; }
            var start = bp.length / 3;
            run.forEach(function (k, q) {
              var L = lat(rd, k), hw = halfW(ri, k), x = rd.P[k * 2], z = rd.P[k * 2 + 1], y = rd.Y[k], bh = bankH(ri, k, side);
              for (var c = 0; c < BANK.length; c++) {
                var d = hw + BANK[c], px = x + L[0] * side * d, pz = z + L[1] * side * d;
                var base = c === 0 ? y : shoulderY(ri, k, side, d, y, x, z);
                var py = base + BANKP[c] * bh + (c === 0 || c === BANK.length - 1 ? -0.04 : 0);
                bp.push(px, py, pz); bu.push(rd.S[k] / 6, c / (BANK.length - 1));
              }
            });
            var C = BANK.length;
            for (var q = 0; q < run.length - 1; q++) for (var c = 0; c < C - 1; c++) {
              var a = start + q * C + c, b = a + 1, a2 = a + C, b2 = a2 + 1;
              if (side > 0) bi.push(a, b, a2, b, b2, a2); else bi.push(a, a2, b, b, a2, b2);
            }
            run = [];
          }
          for (var kk = 0; kk <= segs; kk++) {
            var k = kk % n;
            if (bankGap(ri, k, side)) { flush(); continue; }
            run.push(k);
            if (kk % 12 === 0 && kk < segs) {
              var L = lat(rd, k), hw = halfW(ri, k), d = hw + 0.95, x = rd.P[k * 2] + L[0] * side * d, z = rd.P[k * 2 + 1] + L[1] * side * d;
              poleData.push(x, rd.Y[k] + bankH(ri, k, side) * 0.9, z);
            }
          }
          flush();
          if (bi.length) {
            var g3 = new THREE.BufferGeometry();
            g3.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3)); g3.setAttribute("uv", new THREE.Float32BufferAttribute(bu, 2));
            g3.setIndex(bi); g3.computeVertexNormals();
            var m3 = new THREE.Mesh(g3, bankMat); m3.receiveShadow = true; m3.castShadow = true; root.add(m3);
          }
        });
      });
      // ---- snow poles ----
      (function () {
        var cv = document.createElement("canvas"); cv.width = 16; cv.height = 128;
        var c = cv.getContext("2d");
        c.fillStyle = "#1a1a1a"; c.fillRect(0, 0, 16, 128);
        c.fillStyle = "#ff6a1a"; c.fillRect(0, 0, 16, 36); c.fillRect(0, 70, 16, 20);
        c.fillStyle = "#f2f2f2"; c.fillRect(0, 36, 16, 8);
        var tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
        var g = new THREE.CylinderGeometry(0.028, 0.032, 1.7, 6, 1); g.translate(0, 0.85, 0);
        var m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ map: tx, roughness: 0.6 }), poleData.length / 3);
        var M = new THREE.Matrix4(), q = new THREE.Quaternion();
        for (var i = 0; i < poleData.length / 3; i++) {
          q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (hash1(i) - 0.5) * 0.08);
          M.compose(new THREE.Vector3(poleData[i * 3], poleData[i * 3 + 1] - 0.25, poleData[i * 3 + 2]), q, new THREE.Vector3(1, 1, 1));
          m.setMatrixAt(i, M);
        }
        m.castShadow = true; root.add(m);
      })();

      // ---- trees ----
      var trees = meta.world.trees, tN = trees.n;
      var txz = i16(trees.xz, tN * 2), tsc = u8(trees.s, tN), tty = u8(trees.t, tN);
      var tinfo = meta.tex.trees;
      var treeCol = [];  // collision: x,z,r
      (function () {
        var g = new THREE.BufferGeometry();
        var w = 0.125;
        var p = [-w, 1, 0, w, 1, 0, -w, 0, 0, w, 0, 0, 0, 1, -w, 0, 1, w, 0, 0, -w, 0, 0, w];
        var uv = [0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1];
        p = p.concat(p); uv = uv.concat(uv);
        var nm = []; for (var i = 0; i < 16; i++) nm.push(0, 1, 0);
        g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        g.setAttribute("normal", new THREE.Float32BufferAttribute(nm, 3));
        g.setIndex([0, 2, 1, 1, 2, 3, 4, 6, 5, 5, 6, 7, 8, 9, 10, 9, 11, 10, 12, 13, 14, 13, 15, 14]);
        var ty = new Float32Array(tN);
        var mesh = new THREE.InstancedMesh(g, null, tN);
        var M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
        for (var i = 0; i < tN; i++) {
          var x = txz[i * 2] / 4, z = txz[i * 2 + 1] / 4, s = tsc[i] / 100, t = tty[i] % 8;
          var info = tinfo[t], hgt = (15 + 7 * hash1(i * 1.7)) * s;
          var foot = (511 - info.bot) / 512 * hgt;
          var y = terrainH(x, z) - 0.25 - foot;
          q.setFromAxisAngle(up, hash1(i * 3.3) * Math.PI);
          M.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(hgt, hgt, hgt));
          mesh.setMatrixAt(i, M); ty[i] = t;
          treeCol.push(x, z, 0.32 * s + 0.1);
        }
        g.setAttribute("aType", new THREE.InstancedBufferAttribute(ty, 1));
        function patch(sh) {
          sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aType;")
            .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv.x = (vMapUv.x + aType) / 8.0;\n#endif");
        }
        var mat = new THREE.MeshStandardMaterial({ map: T.trees, alphaTest: 0.42, side: THREE.FrontSide, roughness: 0.95, metalness: 0, color: 0xe6ebe8 });
        mat.onBeforeCompile = patch;
        var dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T.trees, alphaTest: 0.42, side: THREE.DoubleSide });
        dmat.onBeforeCompile = patch;
        mesh.material = mat; mesh.customDepthMaterial = dmat;
        mesh.castShadow = true; mesh.receiveShadow = true;
        root.add(mesh);
      })();
      var TG = 10, treeGrid = new Map();
      for (var i = 0; i < treeCol.length; i += 3) {
        var key = gkey(Math.floor(treeCol[i] / TG), Math.floor(treeCol[i + 1] / TG));
        var l = treeGrid.get(key); if (!l) treeGrid.set(key, l = []); l.push(i);
      }

      // ---- sky, fog, light ----
      var sunDir = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
      var sky = (function () {
        var w = 1024, h = 512, cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        var c = cv.getContext("2d"), img = c.createImageData(w, h), d = img.data;
        var zen = [74, 118, 176], hor = [214, 226, 238], gnd = [224, 230, 236];
        var su = Math.atan2(sunDir.z, sunDir.x) / (2 * Math.PI) + 0.5;
        for (var y = 0; y < h; y++) {
          var v = 1 - y / (h - 1), el = (v - 0.5) * Math.PI;
          for (var x = 0; x < w; x++) {
            var u = x / w, az = (u - 0.5) * 2 * Math.PI;
            var dx = Math.cos(el) * Math.cos(az), dy = Math.sin(el), dz = Math.cos(el) * Math.sin(az);
            var cosS = dx * sunDir.x + dy * sunDir.y + dz * sunDir.z;
            var col;
            if (el >= 0) { var t = Math.pow(Math.min(1, el / 1.2), 0.55); col = [hor[0] + (zen[0] - hor[0]) * t, hor[1] + (zen[1] - hor[1]) * t, hor[2] + (zen[2] - hor[2]) * t]; }
            else col = gnd.slice();
            var glow = Math.pow(Math.max(0, cosS), 12) * 70 + Math.pow(Math.max(0, cosS), 400) * 120;
            var o = (y * w + x) * 4;
            d[o] = Math.min(255, col[0] + glow); d[o + 1] = Math.min(255, col[1] + glow * 0.95); d[o + 2] = Math.min(255, col[2] + glow * 0.85); d[o + 3] = 255;
          }
        }
        c.putImageData(img, 0, 0);
        var t = new THREE.CanvasTexture(cv); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })();
      var fog = new THREE.FogExp2(0xd3dee9, 0.00031);
      var sun = new THREE.DirectionalLight(0xfff1df, 3.1);
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      var sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
      root.add(sun); root.add(sun.target);
      var hemi = new THREE.HemisphereLight(0xd4e3f7, 0x9aa4b1, 0.85); root.add(hemi);

      // ---- falling snow ----
      var flakes = (function () {
        var n = 5000, p = new Float32Array(n * 3), r = new Float32Array(n);
        for (var i = 0; i < n; i++) { p[i * 3] = Math.random() * 70; p[i * 3 + 1] = Math.random() * 40; p[i * 3 + 2] = Math.random() * 70; r[i] = Math.random(); }
        var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("aRand", new THREE.BufferAttribute(r, 1));
        var m = new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uScale: { value: 1 } },
          vertexShader: "uniform float uTime; uniform vec3 uCam; uniform float uScale; attribute float aRand; varying float vA;\n" +
            "void main(){ vec3 p = position; p.y -= uTime * (1.1 + aRand * 0.9); p.x += uTime * 0.7 + sin(uTime * 0.6 + aRand * 40.0) * 0.8; p.z += uTime * 0.3 + cos(uTime * 0.5 + aRand * 30.0) * 0.6;\n" +
            "vec3 box = vec3(70.0, 40.0, 70.0); vec3 rel = mod(p - uCam + box * 0.5, box) - box * 0.5; vec3 w = uCam + rel;\n" +
            "vec4 mv = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp((0.9 + aRand * 1.6) * uScale / -mv.z, 1.0, 14.0); vA = smoothstep(35.0, 10.0, length(rel)) * 0.85; }",
          fragmentShader: "varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(d)) * vA; if (a < 0.02) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, a); }",
          transparent: true, depthWrite: false
        });
        var pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 5;
        return pts;
      })();
      scene.add(flakes); flakes.visible = false;

      // ---- spray particles ----
      var spray = (function () {
        var n = 400, p = new Float32Array(n * 3), a = new Float32Array(n), s = new Float32Array(n);
        var g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("aA", new THREE.BufferAttribute(a, 1)); g.setAttribute("aS", new THREE.BufferAttribute(s, 1));
        var m = new THREE.ShaderMaterial({
          uniforms: { uScale: { value: 1 } },
          vertexShader: "attribute float aA; attribute float aS; uniform float uScale; varying float vA; void main(){ vec4 mv = viewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aS * uScale / max(0.5, -mv.z); vA = aA; }",
          fragmentShader: "varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(0.95, 0.97, 1.0, a); }",
          transparent: true, depthWrite: false
        });
        var pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 6;
        var parts = []; for (var i = 0; i < n; i++) parts.push({ x: 0, y: -1e5, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1 });
        var next = 0;
        return {
          obj: pts,
          emit: function (x, y, z, vx, vy, vz, size) {
            var q = parts[next]; next = (next + 1) % n;
            q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz; q.life = 0; q.max = 0.7 + Math.random() * 0.8; q.size = size;
          },
          update: function (dt) {
            for (var i = 0; i < n; i++) {
              var q = parts[i];
              if (q.life >= q.max) { a[i] = 0; continue; }
              q.life += dt; q.vy -= 3.5 * dt; q.vx *= 1 - 1.5 * dt; q.vz *= 1 - 1.5 * dt;
              q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
              var k = q.life / q.max;
              p[i * 3] = q.x; p[i * 3 + 1] = q.y; p[i * 3 + 2] = q.z;
              a[i] = (1 - k) * 0.55; s[i] = q.size * (1 + k * 3);
            }
            g.attributes.position.needsUpdate = g.attributes.aA.needsUpdate = g.attributes.aS.needsUpdate = true;
          }
        };
      })();
      scene.add(spray.obj); spray.obj.visible = false;

      // ---- return door in the service park ----
      var pk = main.P, pi = park.i;
      var roadPt = { x: pk[pi * 2], z: pk[pi * 2 + 1] };
      var tg = { x: main.T[pi * 2], z: main.T[pi * 2 + 1] };
      var doorPos = { x: park.x + parkDir[0] * 9, z: park.z + parkDir[1] * 9 };
      var doorObj = new THREE.Group();
      (function () {
        var frameM = new THREE.MeshStandardMaterial({ color: 0x3b3e44, roughness: 0.6 });
        var panelM = new THREE.MeshStandardMaterial({ color: 0xefede8, roughness: 0.4 });
        var post = new THREE.BoxGeometry(0.1, 2.35, 0.14);
        var l = new THREE.Mesh(post, frameM); l.position.set(-0.5, 1.175, 0); var r2 = l.clone(); r2.position.x = 0.5;
        var top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.14), frameM); top.position.y = 2.3;
        var panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.24, 0.045), panelM); panel.position.y = 1.13;
        var knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), frameM); knob.position.set(0.34, 1.02, 0.05);
        [l, r2, top, panel, knob].forEach(function (m) { m.castShadow = true; m.receiveShadow = true; doorObj.add(m); });
        var cv = document.createElement("canvas"); cv.width = 256; cv.height = 64; var c = cv.getContext("2d");
        c.fillStyle = "#1d1f24"; c.fillRect(0, 0, 256, 64); c.fillStyle = "#f2f2f2"; c.font = "600 30px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("Studio", 128, 34);
        var st = new THREE.CanvasTexture(cv); st.colorSpace = THREE.SRGBColorSpace;
        var sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.15), new THREE.MeshStandardMaterial({ map: st, roughness: 0.5 }));
        sign.position.set(0, 1.85, 0.03); doorObj.add(sign);
      })();
      doorObj.position.set(doorPos.x, terrainH(doorPos.x, doorPos.z) - 0.02, doorPos.z);
      doorObj.rotation.y = Math.atan2(-parkDir[0], -parkDir[1]);
      root.add(doorObj);
      var spawnX = doorPos.x - parkDir[0] * 2.2, spawnZ = doorPos.z - parkDir[1] * 2.2;
      // desktop yaw: forward = (-sin yaw, -cos yaw); face toward the road
      var spawnYaw = Math.atan2(parkDir[0], parkDir[1]);

      // ---- car ----
      var car = await buildCar(meta.car, geo);
      root.add(car.root);
      car.x = park.x - parkDir[0] * 1.5 + tg.x * 4; car.z = park.z - parkDir[1] * 1.5 + tg.z * 4;
      car.yaw = Math.atan2(tg.x, tg.z) + 0.25 * parkSide;
      car.y = groundAt(car.x, car.z).h;

      // ---- audio ----
      var audio = null;
      function startAudio() {
        try {
          if (!audio) {
            var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
            var ac = new AC(), master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
            var lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600; lp.Q.value = 2; lp.connect(master);
            var o1 = ac.createOscillator(); o1.type = "sawtooth"; var g1 = ac.createGain(); g1.gain.value = 0.35; o1.connect(g1); g1.connect(lp);
            var o2 = ac.createOscillator(); o2.type = "square"; var g2 = ac.createGain(); g2.gain.value = 0.18; o2.connect(g2); g2.connect(lp);
            var nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), nd = nb.getChannelData(0);
            for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
            var ns = ac.createBufferSource(); ns.buffer = nb; ns.loop = true;
            var bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 0.8;
            var sg = ac.createGain(); sg.gain.value = 0; ns.connect(bp); bp.connect(sg); sg.connect(master);
            o1.start(); o2.start(); ns.start();
            audio = { ac: ac, master: master, lp: lp, o1: o1, o2: o2, skid: sg };
          }
          audio.ac.resume();
          audio.master.gain.setTargetAtTime(0.32, audio.ac.currentTime, 0.2);
        } catch (e) { audio = null; }
      }
      function stopAudio() { if (audio) audio.master.gain.setTargetAtTime(0, audio.ac.currentTime, 0.08); }

      var M = {
        root: root, sky: sky, fog: fog, car: car, camMode: 0,
        groundAt: groundAt, startAudio: startAudio, stopAudio: stopAudio,
        spawn: { x: spawnX, z: spawnZ, yaw: spawnYaw },
        updateBlockers: function () {
          var bl = [];
          var c = Math.cos(car.yaw), s = Math.sin(car.yaw), hx = Math.abs(c) * 0.95 + Math.abs(s) * 2.45, hz = Math.abs(s) * 0.95 + Math.abs(c) * 2.45;
          bl.push(new THREE.Box2(new THREE.Vector2(OFFX + car.x - hx, car.z - hz), new THREE.Vector2(OFFX + car.x + hx, car.z + hz)));
          var dx = Math.abs(parkDir[1]) * 0.6 + 0.12, dz = Math.abs(parkDir[0]) * 0.6 + 0.12;
          bl.push(new THREE.Box2(new THREE.Vector2(OFFX + doorPos.x - dx, doorPos.z - dz), new THREE.Vector2(OFFX + doorPos.x + dx, doorPos.z + dz)));
          desk.walk.blockers = bl;
        },
        snapCamera: function () { camState.init = false; },
        resetCar: function () {
          var nr = nearestRoad(car.x, car.z), best = nr;
          if (!best) {
            var bd = 1e18;
            roads.forEach(function (rd, ri) { for (var k = 0; k < rd.n; k += 4) { var d = (rd.P[k * 2] - car.x) ** 2 + (rd.P[k * 2 + 1] - car.z) ** 2; if (d < bd) { bd = d; best = { ri: ri, k: k }; } } });
          }
          var rd = roads[best.ri], k = best.k;
          var fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), tx = rd.T[k * 2], tz = rd.T[k * 2 + 1];
          var dir = fx * tx + fz * tz >= 0 ? 1 : -1;
          car.x = rd.P[k * 2]; car.z = rd.P[k * 2 + 1]; car.yaw = Math.atan2(tx * dir, tz * dir);
          car.y = groundAt(car.x, car.z).h + 0.3; car.vx = car.vz = car.vy = 0; car.r = 0; car.vf = 0; car.air = true;
          camState.init = false;
        },
        update: function (dt, t) {
          if (flashTimer > 0) { flashTimer -= dt; if (flashTimer <= 0) setHint(""); }
          var xrOn = inXR();
          var cw = xrOn ? headWorld() : camera.position;
          if (mode === "foot") {
            var lx = cw.x - OFFX, lz = cw.z;
            if (xrOn) xr.rig.position.y = groundAt(lx, lz).h; // standing on the snow
            else cw.y = groundAt(lx, lz).h + EYE;
            hintAction = null;
            if (!busy && flashTimer <= 0) {
              var dCar = Math.hypot(lx - car.x, lz - car.z), dDoor = Math.hypot(lx - doorPos.x, lz - doorPos.z);
              if (dCar < 3.6) { hintAction = "car"; setHint("<kbd>E</kbd>Drive"); }
              else if (dDoor < 2.4) { hintAction = "door-back"; setHint("<kbd>E</kbd>Go back to the studio"); }
              else setHint("");
            }
          } else if (mode === "drive") {
            stepCar(dt);
            if (!xrOn) updateCamera(dt);
          }
          car.sync(dt);
          if (mode === "drive" && xrOn) {
            placeSeat(); cw = headWorld();
            // the wheel feel: tyres slipping and hard landings come through the controllers
            if (car.air) car.wasAir = true;
            else if (car.wasAir) { car.wasAir = false; rumble(0.6, 90); }
            else if (car.slip > 0.25) rumble(car.slip * 0.45, 40);
          }
          // light follows the camera, snapped to shadow texels
          var lx = cw.x - OFFX, lz = cw.z, snap = 120 / 2048;
          lx = Math.round(lx / snap) * snap; lz = Math.round(lz / snap) * snap;
          var ly = cw.y;
          sun.target.position.set(lx, ly, lz); sun.position.set(lx + sunDir.x * 200, ly + sunDir.y * 200, lz + sunDir.z * 200);
          sun.target.updateMatrixWorld();
          renderer.shadowMap.needsUpdate = true;
          flakes.visible = true; spray.obj.visible = true;
          flakes.material.uniforms.uTime.value = t; flakes.material.uniforms.uCam.value.copy(cw);
          var focal = renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
          flakes.material.uniforms.uScale.value = focal * 0.012; spray.obj.material.uniforms.uScale.value = focal;
          spray.update(dt);
        }
      };
      var rootVisible = false;
      Object.defineProperty(root, "visible", {
        get: function () { return rootVisible; },
        set: function (v) { rootVisible = v; if (!v) { flakes.visible = false; spray.obj.visible = false; } }
      });

      // ---- vehicle dynamics ----
      var MASS = 1550, IZ = 2500, A = 1.418, B = 1.392, TRACK = 1.576, GR = 9.81;
      var steer = 0, gear = 1, rpm = 900;
      var GEARS = [0, 11, 19, 28, 38, 49, 64];
      function wheelPos(fx, fz, sx, sz, wx, wz) { return [car.x + sx * wx + fx * wz, car.z + sz * wx + fz * wz]; }
      function treeHit(x, z, r) {
        var ix = Math.floor(x / TG), iz = Math.floor(z / TG), out = null;
        for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) {
          var l = treeGrid.get(gkey(ix + a, iz + b)); if (!l) continue;
          for (var q = 0; q < l.length; q++) {
            var i = l[q], dx = x - treeCol[i], dz = z - treeCol[i + 1], rr2 = r + treeCol[i + 2], d2 = dx * dx + dz * dz;
            if (d2 < rr2 * rr2) { var d = Math.sqrt(d2) || 0.001; out = { nx: dx / d, nz: dz / d, pen: rr2 - d }; }
          }
        }
        return out;
      }
      // keyboard, plus (in VR) analog triggers and either stick
      function driveInput() {
        var I = {
          thr: keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0,
          brk: keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0,
          steer: (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0),
          hb: keys.has("Space")
        };
        if (inXR()) {
          var Pd = pads();
          var rt = value(Pd.right, 0), lt = value(Pd.left, 0);
          if (rt > 0.04) I.thr = Math.max(I.thr, rt);
          if (lt > 0.04) I.brk = Math.max(I.brk, lt);
          var sl = (Pd.left && Pd.left.axes[2]) || 0, sr = (Pd.right && Pd.right.axes[2]) || 0;
          var sx = Math.abs(sl) > Math.abs(sr) ? sl : sr, dz = 0.08;
          if (Math.abs(sx) > dz) {
            var k = (Math.abs(sx) - dz) / (1 - dz);
            I.steer = -Math.sign(sx) * Math.pow(k, 1.3); // finer near the centre
          }
          I.hb = I.hb || pressed(Pd.right, 4);
        }
        return I;
      }
      function stepCar(dtAll) {
        var steps = Math.max(1, Math.ceil(dtAll / (1 / 120))), dt = dtAll / steps;
        var I = driveInput();
        var thr = I.thr, brk = I.brk, hb = I.hb;
        for (var it = 0; it < steps; it++) {
          var fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), sx = Math.cos(car.yaw), sz = -Math.sin(car.yaw); // s = car's left
          var vF = car.vx * fx + car.vz * fz, vL = car.vx * sx + car.vz * sz, speed = Math.hypot(car.vx, car.vz);
          // steering
          var maxS = 0.58 / (1 + Math.abs(vF) * 0.05);
          var target = I.steer * maxS;
          var rate = (target === 0 || Math.sign(target) !== Math.sign(steer)) ? 4.5 : 2.6;
          steer += clamp(target - steer, -rate * dt, rate * dt);
          // ground at wheels
          var hs = [], surf = 0, roadHere = null;
          for (var w = 0; w < 4; w++) {
            var wd = car.wheels[w], p = wheelPos(fx, fz, sx, sz, wd.x, wd.z), gr = groundAt(p[0], p[1]);
            hs.push(gr.h); surf += gr.surf; if (w === 0) roadHere = gr;
          }
          surf /= 4;
          var hFront = (hs[0] + hs[1]) / 2, hRear = (hs[2] + hs[3]) / 2, hLeft = (hs[0] + hs[2]) / 2, hRight = (hs[1] + hs[3]) / 2;
          var gh = (hFront * B + hRear * A) / (A + B);
          var pitchG = Math.atan2(hFront - hRear, A + B), rollG = Math.atan2(hLeft - hRight, TRACK);
          // vertical
          var ny = car.y + car.vy * dt - 0.5 * GR * dt * dt;
          var grounded;
          if (ny <= gh + 0.002) {
            if (gh - car.y > 0.9 && !car.air) { // wall-like step: refuse
              car.vx *= -0.2; car.vz *= -0.2; car.x -= fx * vF * dt * 2; car.z -= fz * vF * dt * 2; continue;
            }
            var newVy = (gh - car.y) / dt;
            car.vy = car.air ? Math.max(newVy, 0) : clamp(newVy, -15, 15);
            car.y = gh; grounded = true; car.air = false;
          } else {
            car.prevVy = car.vy; car.vy -= GR * dt; car.y = ny; grounded = false; car.air = true;
          }
          car.pitchT = grounded ? pitchG : car.pitchT; car.rollT = grounded ? rollG : car.rollT * 0.995;
          var Fx = 0, FyF = 0, FyR = 0, torque = 0;
          if (grounded) {
            var mu = surf < 0.5 ? 0.95 : surf < 1.5 ? 0.72 : 0.6;
            var NF = MASS * GR * B / (A + B), NR = MASS * GR * A / (A + B);
            var vfa = Math.max(Math.abs(vF), 2.2);
            var aF = Math.atan2(vL + car.r * A, vfa) - steer * Math.sign(vF || 1);
            var aR = Math.atan2(vL - car.r * B, vfa);
            // longitudinal
            var drive = 0, brake = 0;
            if (thr) {
              if (vF < -0.5) brake = thr; else { var P = 150000; drive = thr * Math.min(mu * NR * 1.05, P / Math.max(Math.abs(vF), 4)); }
            }
            if (brk) {
              if (vF > 0.5) brake = Math.max(brake, brk); else drive = -brk * Math.min(MASS * GR * 0.35, 40000 / Math.max(Math.abs(vF), 4)) * (vF > -14 ? 1 : 0);
            }
            var Fbrake = brake * mu * MASS * GR * 0.9 * Math.sign(vF);
            var Fhb = hb ? mu * NR * 0.6 * Math.sign(vF) : 0;
            var drag = 0.42 * vF * Math.abs(vF) + MASS * (surf < 0.5 ? 0.12 : surf < 1.5 ? 0.45 : 1.6) * vF * 0.1;
            Fx = drive - Fbrake - Fhb - drag;
            // lateral with friction circle on rear
            var CF = 72000, CR = 80000;
            FyF = clamp(-CF * aF, -mu * NF, mu * NF);
            var rearMax = mu * NR * (hb ? 0.42 : 1);
            var used = Math.min(Math.abs(drive) * 0.65 + Math.abs(Fhb), rearMax * 0.98);
            rearMax = Math.sqrt(Math.max(rearMax * rearMax - used * used, (rearMax * 0.25) * (rearMax * 0.25)));
            FyR = clamp(-CR * aR, -rearMax, rearMax);
            torque = Math.cos(steer) * FyF * A - FyR * B;
            // stability assist (gentle): pull yaw rate toward what the steering asks for
            if (!hb) { var rIdeal = vF * Math.tan(steer) / (A + B); torque += -IZ * 2.2 * (car.r - rIdeal) * clamp(Math.abs(vF) / 8, 0, 1); }
            // slope gravity
            var gx = -(hs[0] + hs[2] - hs[1] - hs[3]) / 2 / TRACK, gF = -(hFront - hRear) / (A + B);
            var ax = (fx * (Fx - FyF * Math.sin(steer)) + sx * (FyF * Math.cos(steer) + FyR)) / MASS + (fx * gF + sx * gx) * GR * 0.9;
            var az = (fz * (Fx - FyF * Math.sin(steer)) + sz * (FyF * Math.cos(steer) + FyR)) / MASS + (fz * gF + sz * gx) * GR * 0.9;
            car.vx += ax * dt; car.vz += az * dt;
            if (!thr && !brk && Math.hypot(car.vx, car.vz) < 0.3) { car.vx *= 0.9; car.vz *= 0.9; }
            car.r += torque / IZ * dt;
            car.r *= 1 - 0.6 * dt;
            car.ax = (Fx) / MASS; car.aL = (FyF + FyR) / MASS;
            // spray
            var slip = Math.abs(aR) * Math.abs(vF) + (hb ? Math.abs(vF) * 0.3 : 0) + (thr && Math.abs(vF) < 12 ? 3 : 0);
            if (Math.abs(vF) > 3 && Math.random() < Math.min(0.9, slip * 0.05 + (surf > 0.5 ? 0.25 : 0.05) * Math.abs(vF) / 20)) {
              for (var w = 2; w < 4; w++) {
                var wd = car.wheels[w], p = wheelPos(fx, fz, sx, sz, wd.x, wd.z - 0.3);
                spray.emit(OFFX + p[0], car.y + 0.15, p[1], -fx * vF * 0.25 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, -fz * vF * 0.25 + (Math.random() - 0.5) * 2, 0.25 + Math.random() * 0.25);
              }
            }
            car.slip = Math.min(1, slip / 12);
          } else {
            car.r *= 1 - 0.3 * dt;
            car.vx *= 1 - 0.02 * dt; car.vz *= 1 - 0.02 * dt;
            car.slip = 0;
          }
          car.yaw += car.r * dt;
          car.x += car.vx * dt; car.z += car.vz * dt;
          // trees (three circles along the car)
          for (var c = -1; c <= 1; c++) {
            var cx = car.x + fx * c * 1.55, cz = car.z + fz * c * 1.55, h = treeHit(cx, cz, 0.95);
            if (h) {
              car.x += h.nx * h.pen; car.z += h.nz * h.pen;
              var vn = car.vx * h.nx + car.vz * h.nz;
              if (vn < 0) { car.vx -= 1.3 * vn * h.nx; car.vz -= 1.3 * vn * h.nz; car.vx *= 0.75; car.vz *= 0.75; car.r += c * vn * 0.08; }
            }
          }
          var LIM = 1165;
          if (Math.abs(car.x) > LIM) { car.x = clamp(car.x, -LIM, LIM); car.vx *= -0.3; }
          if (Math.abs(car.z) > LIM) { car.z = clamp(car.z, -LIM, LIM); car.vz *= -0.3; }
          car.vf = car.vx * Math.sin(car.yaw) + car.vz * Math.cos(car.yaw);
          car.steer = steer;
          if (car.y < -400) M.resetCar();
        }
        // gearbox + sound
        var v = Math.abs(car.vf);
        if (car.vf < -0.5 && brk) gear = 0;
        else { if (gear === 0) gear = 1; while (gear < 6 && v > GEARS[gear] * 0.96) gear++; while (gear > 1 && v < GEARS[gear - 1] * 0.7) gear--; }
        var gTop = GEARS[Math.max(1, gear)], gLow = gear > 1 ? GEARS[gear - 1] * 0.55 : 0;
        var target = 900 + clamp((v - gLow) / (gTop - gLow), 0, 1.05) * 6200;
        if (thr && car.slip > 0.6) target = Math.max(target, 5200);
        rpm += (target - rpm) * Math.min(1, dtAll * 8);
        document.getElementById("rl-kmh").textContent = Math.round(v * 3.6);
        document.getElementById("rl-gear").textContent = gear === 0 ? "R" : String(gear);
        if (dash.visible) drawDash(Math.round(v * 3.6), gear === 0 ? "R" : String(gear));
        if (audio) {
          var tnow = audio.ac.currentTime, f = rpm / 60 * 4;
          audio.o1.frequency.setTargetAtTime(f, tnow, 0.03); audio.o2.frequency.setTargetAtTime(f / 2, tnow, 0.03);
          audio.lp.frequency.setTargetAtTime(500 + rpm * 0.35 + thr * 900, tnow, 0.05);
          audio.skid.gain.setTargetAtTime(car.air ? 0 : car.slip * 0.35, tnow, 0.06);
        }
      }
      var camState = { init: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), yawC: 0 };
      function updateCamera(dt) {
        lookIdle += dt;
        if (lookIdle > 1.2) { lookYaw *= Math.max(0, 1 - dt * 3); lookPitch *= Math.max(0, 1 - dt * 3); }
        var cx = OFFX + car.x, cy = car.y, cz = car.z;
        if (map.camMode === 0) {
          var sp = Math.hypot(car.vx, car.vz);
          var velYaw = sp > 3 && car.vf > 0 ? Math.atan2(car.vx, car.vz) : car.yaw;
          var dy = Math.atan2(Math.sin(velYaw - car.yaw), Math.cos(velYaw - car.yaw));
          var desiredYaw = car.yaw + dy * 0.45 + lookYaw;
          if (!camState.init) { camState.yawC = desiredYaw; }
          var dyc = Math.atan2(Math.sin(desiredYaw - camState.yawC), Math.cos(desiredYaw - camState.yawC));
          camState.yawC += dyc * Math.min(1, dt * 4.5);
          var dist = 6.4 + Math.min(1.6, sp * 0.03), hgt = 2.15 + lookPitch * 3;
          var px = cx - Math.sin(camState.yawC) * dist, pz = cz - Math.cos(camState.yawC) * dist, py = cy + hgt;
          var gmin = groundAt(px - OFFX, pz).h + 0.7; if (py < gmin) py = gmin;
          var target = new THREE.Vector3(px, py, pz);
          if (!camState.init) { camState.pos.copy(target); camState.init = true; }
          camState.pos.lerp(target, Math.min(1, dt * 8));
          camera.position.copy(camState.pos);
          camState.look.set(cx + Math.sin(camState.yawC) * 2.5, cy + 1.0, cz + Math.cos(camState.yawC) * 2.5);
          camera.lookAt(camState.look);
        } else {
          var local = map.camMode === 1 ? new THREE.Vector3(-0.36, 1.12, -0.12) : new THREE.Vector3(0, 0.75, 2.45);
          car.root.updateMatrixWorld(true);
          var wpos = local.applyMatrix4(car.body.matrixWorld);
          camera.position.copy(wpos);
          var q = new THREE.Quaternion(); car.body.getWorldQuaternion(q);
          var e = new THREE.Euler(lookPitch, Math.PI + lookYaw, 0, "YXZ");
          camera.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(e));
          camState.init = false;
        }
      }
      return M;
    }

    // ---------- car model ----------
    async function buildCar(cm, geo) {
      var texCache = {};
      async function tex(i) {
        if (texCache[i]) return texCache[i];
        var t = cm.textures[i];
        texCache[i] = await webpTexture(new Uint8Array(geo, t.off, t.len), { srgb: true, repeat: true });
        return texCache[i];
      }
      var mats = await Promise.all(cm.materials.map(async function (m) {
        var name = m.name.toLowerCase(), metal = /chrome|silver|metal|disc|brake/.test(name);
        var paint = name === "body" || name.indexOf("carpaint") >= 0;
        var mat;
        if (paint) {
          mat = new THREE.MeshPhysicalMaterial({
            color: name === "body" ? new THREE.Color(0.012, 0.014, 0.018) : new THREE.Color(m.color[0], m.color[1], m.color[2]),
            metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06
          });
        } else {
          mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(m.color[0], m.color[1], m.color[2]),
            metalness: metal ? 1 : 0,
            roughness: metal ? Math.max(0.12, Math.min(m.rough, 0.45)) : Math.max(0.28, m.rough)
          });
        }
        if (m.map != null) mat.map = await tex(m.map);
        if (m.blend) { mat.transparent = true; mat.depthWrite = false; if (/106/.test(m.name)) { mat.roughness = 0.04; mat.metalness = 0; } }
        mat.side = THREE.DoubleSide;
        mat.opacity = m.color[3];
        return mat;
      }));
      var rootG = new THREE.Group(), body = new THREE.Group(); rootG.add(body);
      var wheelG = cm.wheels.map(function (w) {
        var steerG = new THREE.Group(), spin = new THREE.Group();
        steerG.position.set(w.x, w.y, w.z); steerG.add(spin); rootG.add(steerG);
        return { x: w.x, y: w.y, z: w.z, r: w.r, steer: steerG, spin: spin, base: w.y };
      });
      // merge parts by group + material
      var buckets = {};
      cm.parts.forEach(function (p) { var k = p.group + ":" + p.mat; (buckets[k] = buckets[k] || []).push(p); });
      Object.keys(buckets).forEach(function (k) {
        var ps = buckets[k], nv = 0, ni = 0;
        ps.forEach(function (p) { nv += p.vcount; ni += p.icount; });
        var pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
        var vo = 0, io = 0;
        ps.forEach(function (p) {
          var q = new Int16Array(geo, p.pos, p.vcount * 3);
          for (var i = 0; i < p.vcount; i++) for (var a = 0; a < 3; a++) pos[(vo + i) * 3 + a] = q[i * 3 + a] / 32767 * p.ps[a] + p.pc[a];
          var nq = new Int8Array(geo, p.nrm, p.vcount * 3);
          for (var i = 0; i < p.vcount * 3; i++) nrm[vo * 3 + i] = nq[i] / 127;
          if (p.uv != null) {
            var uq = new Int16Array(geo, p.uv, p.vcount * 2);
            for (var i = 0; i < p.vcount; i++) { uv[(vo + i) * 2] = uq[i * 2] / 32767 * p.us[0] + p.uc[0]; uv[(vo + i) * 2 + 1] = uq[i * 2 + 1] / 32767 * p.us[1] + p.uc[1]; }
          }
          var src = p.idx32 ? new Uint32Array(geo, p.idx, p.icount) : new Uint16Array(geo, p.idx, p.icount);
          for (var i = 0; i < p.icount; i++) idx[io + i] = src[i] + vo;
          vo += p.vcount; io += p.icount;
        });
        var g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        g.setIndex(new THREE.BufferAttribute(idx, 1));
        var mat = mats[ps[0].mat];
        var mesh = new THREE.Mesh(g, mat);
        mesh.castShadow = !mat.transparent; mesh.receiveShadow = true;
        var grp = ps[0].group;
        (grp >= 0 ? wheelG[grp].spin : body).add(mesh);
      });
      var car = {
        root: rootG, body: body, wheels: wheelG,
        x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0, r: 0, vf: 0, steer: 0, air: false, prevVy: 0, land: 0, landT: 0,
        pitchT: 0, rollT: 0, pitch: 0, roll: 0, ax: 0, aL: 0, slip: 0, spinA: 0,
        sync: function (dt) {
          var k = 0.25;
          this.pitch += (this.pitchT - this.pitch) * k; this.roll += (this.rollT - this.roll) * k;
          rootG.position.set(this.x, this.y, this.z);
          rootG.rotation.set(-this.pitch, this.yaw, this.roll, "YXZ");
          // body sway on suspension
          var sway = clamp(this.aL * 0.0045, -0.05, 0.05), dive = clamp(-this.ax * 0.004, -0.035, 0.035);
          body.rotation.set(-dive, 0, -sway); body.position.y = -0.01 - Math.abs(sway) * 0.2;
          this.spinA += this.vf * (dt || 0) / 0.34;
          wheelG.forEach(function (w, i) { w.spin.rotation.x = car.spinA; w.steer.rotation.y = i < 2 ? car.steer : 0; });
        }
      };
      return car;
    }
  });
})();
