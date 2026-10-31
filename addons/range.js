// Range: the CQC Loop's guns in the studio office (Glock 17, M1911, AKM, M4A1-S, AWM), real ballistics and a
// target lane that runs from the office out through the open middle window pane onto the terrace and the field.
//   Guns    cqc/models/*.glb through the bundle's own GLTFLoader chunk, baked once per type into the bundle's held-gun
//           frame (the old desk pistol's: middle finger on the grip at (0, -0.012, 0.02), bore along -z) so the engine's
//           grab, two-hand support (forendPoint), recoil (recoilMatrix), trigger and A/X / B/Y routing drive them.
//           Each gun is a physics prop in S.guns; a gun controller implements the bundle's interface.
//   Handling  desktop: E pick up, click fire (held for auto), right mouse aim, R reload, F rack / work the bolt,
//           L or V fire selector, B magazine out + reload.  VR: grip to hold, trigger fires, other hand on the handguard
//           steadies a rifle, B / Y reload, A / X rack (or bolt).
//   Ballistics  muzzle velocity, mass and G1 BC per cartridge, drag by Mach number + gravity, integrated per frame with a
//           time of flight; each gun zeroed numerically (pistols 25 m, rifles 100 m). Rays: Rapier (room, props) + THREE
//           (targets, enemy capsules). Props take the bullet's momentum.
//   Sound   recorded shots from cqc/sounds (pistol1, ak1-5, awp1, supPistol1 style), handling takes, a room reverb indoors and a
//           field echo outdoors; steel rings with the speed-of-sound delay.
//   Targets  (lane, from the bench line at x 1.2): paper bullseyes (holes drawn into the paper, ring score) and AR500 plates
//           that swing and ring, at 5 / 10 / 25 m and 50-300 m. The far plane is raised to 420 m when long steel is up.
//   Part 2  ejected casings (one pooled InstancedMesh, ballistic arc, Rapier-ray bounces, brass tinks), the AWM scope
//           (VR: picture in picture on the eyepiece; computer: full-screen scope while aiming, wheel zoom), a scoreboard by
//           the bench (last hits, distance, ring, time of flight), guns that fall out of the world come back to the bench.
//   Not built yet: magazines as separate props (VR mag change by hand), VR racking by grabbing the slide, clays and birds,
//           the wall rack.
// API: window.__studioRange = { ready, types, spawn(type) -> Promise<gun>, clearGuns(), returnGuns(), setup(), resetTargets(),
//      score(), cards(), stats }.
(function () {
  "use strict";
  var LOADER_URL = "assets/GLTFLoader-d80uIKQK.js";
  var api = window.__studioRange = { ready: false, guns: [], types: [] };
  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        if (s && s.ready && s.scene && s.THREE && s.physics && s.guns && s.camera) resolve(s);
        else setTimeout(check, 300);
      })();
    });
  }

  // ---------- data (design space: bore on y = 0, back of the slide / receiver at z = 0, muzzle toward -z, metres) ----------
  var CART = {   // m kg, v m/s, G1 BC lb/in², d bore m
    "9mm": { label: "9×19 mm", m: 0.008, v: 355, bc: 0.15, d: 0.009 },
    "45": { label: ".45 ACP", m: 0.0149, v: 255, bc: 0.19, d: 0.0115 },
    "762": { label: "7.62×39 mm", m: 0.008, v: 715, bc: 0.29, d: 0.0078 },
    "556": { label: "5.56×45 mm", m: 0.004, v: 880, bc: 0.30, d: 0.0057 },
    "338": { label: ".338 Lapua Magnum", m: 0.0162, v: 905, bc: 0.67, d: 0.0086 }
  };
  var GUNS = {
    g17: { label: "Glock 17", file: "cqc/models/g17-glb.glb", bake: { kind: "ext", S: 0.113, yb: 1.11, z0: -0.302 },
      parts: function (n) { return /frame_0$/.test(n) ? "body" : /slide_0$/.test(n) ? "slide" : /^mag_full_g17/.test(n) ? "mag" : null; },
      palm: [0, -0.06, 0.01], muzzle: [0, 0, -0.13], eye: [0, 0.01385, 0.473], zero: 25, eject: [0.013, 0.017, -0.035], support: null,
      cap: 17, mass: 0.9, cart: "9mm", action: "slide", travel: 0.03, rpm: 0, modes: null, rec: { back: 0.9, rise: 6.5, kick: 0.035 },
      snd: { shot: ["pistol1"], rate: 1, fam: "pistol" }, reload: 1.3 },
    m1911: { label: "M1911", file: "cqc/models/m1911-glb.glb", bake: { kind: "glb", off: [0, -0.06761393, -0.02040091] },
      parts: function (n) { return n === "Slide" ? "slide" : n === "Magazine" || n === "Rounds" ? "mag" : n === "ChamberRound" ? null : "body"; },
      palm: [0, -0.06791, -0.02176], muzzle: [0, 0, -0.1914], eye: [0, 0.0141, 0.47], zero: 25, eject: [0.0125, 0.008, -0.078], support: null,
      cap: 7, mass: 1.1, cart: "45", action: "slide", travel: 0.044, rpm: 0, modes: null, rec: { back: 0.95, rise: 6.8, kick: 0.04 },
      snd: { shot: ["pistol1"], rate: 0.91, fam: "pistol" }, reload: 1.4 },
    akmn: { label: "AKM", file: "cqc/models/akmn-glb.glb", bake: { kind: "x64", S: 1, x0: 0, yb: 0.085, z0: -0.264 },
      parts: function (n) { var p = n.split("~")[0]; return p === "mag" || p === "rounds" ? "mag" : p === "ch" ? "slide" : "body"; },
      palm: [0, -0.088, 0.004], muzzle: [0, 0, -0.615], eye: [0, 0.047, 0.06], zero: 100, eject: [0.02, 0.01, -0.15], support: [0, -0.045, -0.3],
      cap: 30, mass: 3.6, cart: "762", action: "recip", travel: 0.11, rpm: 600, modes: ["semi", "auto", "safe"], rec: { back: 0.48, rise: 1.6, kick: 0.018 },
      snd: { shot: ["ak1", "ak2", "ak3", "ak4", "ak5"], rate: 1, fam: "ak" }, reload: 2.0 },
    m4a1s: { label: "M4A1-S", file: "cqc/models/m4-glb.glb", bake: { kind: "ext", S: 0.78, yb: 0.12, z0: -0.004, compact: true },
      parts: function (n) { return n === "ChargingHandle" ? "slide" : n === "Magazine" || n === "Rounds" ? "mag" : /silencer_0$/.test(n) ? "body" : null; },
      palm: [0, -0.088, 0.004], muzzle: [0, 0, -0.655], eye: [0, 0.066, 0.045], zero: 100, eject: [0.016, 0.004, -0.088], support: [0, -0.05, -0.36],
      cap: 30, mass: 3.4, cart: "556", action: "handle", travel: 0.085, rpm: 800, modes: ["semi", "auto", "safe"], rec: { back: 0.4, rise: 0.9, kick: 0.011 },
      snd: { shot: ["ak1", "ak2", "ak3", "ak4", "ak5"], rate: 0.78 * 1.12, gain: 0.32, fam: "m4", suppressed: true }, reload: 2.0 },
    awp: { label: "AWM", file: "cqc/models/awp-glb.glb", bake: { kind: "x64", S: 0.76, x0: 0, yb: 0.111, z0: 0.013 },
      parts: function (n) { var p = n.split("~")[0]; return p === "mag" || p === "rounds" ? "mag" : p === "bolt" || p === "shroud" ? "slide" : "body"; },
      palm: [0, -0.088, 0.004], muzzle: [0, 0, -0.958], eye: [0, 0.09, 0.12], zero: 100, eject: [0.02, 0.01, -0.14], support: [0, -0.06, -0.4],
      cap: 5, mass: 6.5, cart: "338", action: "bolt", travel: 0.12, rpm: 0, modes: null, rec: { back: 0.6, rise: 1.8, kick: 0.06 },
      snd: { shot: ["awp1"], rate: 1, fam: "awp" }, reload: 2.2, scope: true }
  };
  var HANDLING = {   // event -> [file, rate]
    pistol: { magOut: ["glkMagOut1", 1], magIn: ["glkMagIn1", 1], back: ["glkRackBack1", 1], fwd: ["glkRackFwd1", 1], rel: ["glkSlideRel", 1] },
    ak: { magOut: ["akMagOut1", 1], magIn: ["akMagIn1", 1], back: ["akRackBack1", 1], fwd: ["akRackFwd1", 1], rel: ["akRackFwd2", 1] },
    m4: { magOut: ["smgMagOut", 1], magIn: ["smgMagIn", 1], back: ["smgBoltBack", 1], fwd: ["smgBoltFwd", 1], rel: ["smgBoltFwd", 1.05] },
    awp: { magOut: ["akMagOut2", 1.1], magIn: ["akMagIn1", 1.1], back: ["smgBoltBack", 0.8], fwd: ["smgBoltFwd", 0.8], rel: ["smgBoltFwd", 0.8] }
  };
  var HOLD = [0, -0.012, 0.02];          // the bundle's grip point (middle finger) in its held-gun frame
  var LANE = { x: 1.2, z: -0.1 };        // the bench line in the office; targets run toward -x through the open pane
  api.types = Object.keys(GUNS).map(function (k) { return { id: k, label: GUNS[k].label, cart: CART[GUNS[k].cart].label }; });

  waitForStudio().then(function (S) {
    var THREE = S.THREE, scene = S.scene, camera = S.camera, renderer = S.renderer, P = S.physics, XR = S.xr, desk = S.desktop, log = S.log;
    var V = THREE.Vector3, _v = new V(), _v2 = new V(), _v3 = new V(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
    var root = new THREE.Group(); root.name = "range"; scene.add(root);
    function info(msg) { if (log) log.info(msg); }
    function floorY(x) { return x > -2.4 ? 0 : x > -5.7 ? -0.02 : -0.07; }

    // ---------- audio ----------
    var AC = window.AudioContext || window.webkitAudioContext, ctx = null, master = null, verbIn = null, verbOut = null, bufs = {}, loading = {};
    function audio() {
      if (ctx || !AC) return ctx;
      ctx = new AC();
      master = ctx.createDynamicsCompressor(); master.threshold.value = -10; master.ratio.value = 6; master.connect(ctx.destination);
      // indoor: a short bright room (hard walls, 0.8 s); outdoor: the treeline answering 0.45 s later, darker each time
      verbIn = ctx.createConvolver(); var n = Math.floor(ctx.sampleRate * 0.8), ir = ctx.createBuffer(2, n, ctx.sampleRate);
      for (var c = 0; c < 2; c++) { var d = ir.getChannelData(c); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2) * (i < 220 ? 0.2 : 1); }
      verbIn.buffer = ir; var gi = ctx.createGain(); gi.gain.value = 0.5; verbIn.connect(gi); gi.connect(master);
      var dl = ctx.createDelay(2), fb = ctx.createGain(), lp = ctx.createBiquadFilter(); dl.delayTime.value = 0.45; fb.gain.value = 0.32; lp.type = "lowpass"; lp.frequency.value = 1600;
      dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(master); verbOut = dl;
      return ctx;
    }
    ["pointerdown", "keydown"].forEach(function (ev) { addEventListener(ev, function () { if (audio() && ctx.state === "suspended") ctx.resume(); }, true); });
    function load(name) {
      if (bufs[name] || loading[name] || !audio()) return;
      loading[name] = fetch("cqc/sounds/" + name + ".mp3").then(function (r) { return r.arrayBuffer(); })
        .then(function (a) { return ctx.decodeAudioData(a); }).then(function (b) { bufs[name] = b; }).catch(function () {});
    }
    function preload(fam, shots) { shots.forEach(load); var H = HANDLING[fam]; for (var k in H) load(H[k][0]); ["dry1", "dry2", "dry3", "magDrop1", "pickup1"].forEach(load); }
    // play a buffer (or a file name) at a world point; opts: gain, rate, delay (s), lowpass (Hz)
    function play(b, pos, opts) {
      opts = opts || {};
      if (!audio() || ctx.state !== "running") return;
      if (typeof b === "string") { if (!bufs[b]) { load(b); return; } b = bufs[b]; }
      var src = ctx.createBufferSource(), g = ctx.createGain(), node = g;
      src.buffer = b; src.playbackRate.value = (opts.rate || 1) * (0.97 + Math.random() * 0.06); g.gain.value = opts.gain === undefined ? 1 : opts.gain;
      src.connect(g);
      if (opts.lowpass) { var f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = opts.lowpass; g.connect(f); node = f; }
      if (pos) {
        var p = ctx.createPanner(); p.panningModel = "equalpower"; p.distanceModel = "inverse"; p.refDistance = opts.ref || 2; p.rolloffFactor = 1;
        p.positionX ? (p.positionX.value = pos.x, p.positionY.value = pos.y, p.positionZ.value = pos.z) : p.setPosition(pos.x, pos.y, pos.z);
        node.connect(p); node = p;
      }
      node.connect(master);
      var send = ctx.createGain(); send.gain.value = (opts.verb === undefined ? 0.35 : opts.verb); node.connect(send);
      send.connect(pos && pos.x < -2.25 ? verbOut : verbIn);
      src.start(ctx.currentTime + (opts.delay || 0));
    }
    var listenerF = new V(), listenerU = new V();
    function updateListener() {
      if (!ctx) return;
      camera.updateMatrixWorld(); _v.setFromMatrixPosition(camera.matrixWorld);
      listenerF.set(0, 0, -1).transformDirection(camera.matrixWorld); listenerU.set(0, 1, 0).transformDirection(camera.matrixWorld);
      var L = ctx.listener;
      if (L.positionX) { L.positionX.value = _v.x; L.positionY.value = _v.y; L.positionZ.value = _v.z; L.forwardX.value = listenerF.x; L.forwardY.value = listenerF.y; L.forwardZ.value = listenerF.z; L.upX.value = listenerU.x; L.upY.value = listenerU.y; L.upZ.value = listenerU.z; }
      else { L.setPosition(_v.x, _v.y, _v.z); L.setOrientation(listenerF.x, listenerF.y, listenerF.z, listenerU.x, listenerU.y, listenerU.z); }
    }
    // synthesized steel ring (free circular plate modes 1 : 2.08 : 3.41 : 3.89 : 5.0) and a soft impact thud
    var synth = {};
    function ringBuf() {
      if (synth.ring || !audio()) return synth.ring;
      var sr = ctx.sampleRate, n = Math.floor(sr * 2.2), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), f0 = 820, R = [1, 2.08, 3.41, 3.89, 5.0], A = [1, 0.6, 0.35, 0.3, 0.18];
      for (var i = 0; i < n; i++) { var t = i / sr, s = 0; for (var k = 0; k < R.length; k++) s += A[k] * Math.sin(2 * Math.PI * f0 * R[k] * t) * Math.exp(-t * (1.6 + k * 1.1)); if (i < sr * 0.004) s += (Math.random() * 2 - 1) * (1 - i / (sr * 0.004)); d[i] = s * 0.3; }
      return (synth.ring = b);
    }
    function thudBuf() {
      if (synth.thud || !audio()) return synth.thud;
      var sr = ctx.sampleRate, n = Math.floor(sr * 0.12), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), lp = 0;
      for (var i = 0; i < n; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.15; d[i] = lp * Math.exp(-i / (sr * 0.025)) * 2.2; }
      return (synth.thud = b);
    }

    // ---------- ballistics ----------
    var RHO = 1.204, SOUND = 343, G1 = [[0, 0.263], [0.5, 0.203], [0.7, 0.217], [0.8, 0.255], [0.9, 0.342], [1.0, 0.481], [1.1, 0.589], [1.2, 0.639], [1.4, 0.662], [1.75, 0.637], [2.0, 0.613], [2.5, 0.561], [3.0, 0.52], [5, 0.48]];
    function cdG1(M) { for (var i = 1; i < G1.length; i++) if (M < G1[i][0]) { var a = G1[i - 1], b = G1[i]; return a[1] + (b[1] - a[1]) * (M - a[0]) / (b[0] - a[0]); } return 0.48; }
    function dragK(c, v) { return RHO * cdG1(v / SOUND) * Math.PI / (8 * c.bc * 703.07); }   // deceleration = k v²
    // the bore angle above the sight line that makes the round cross it at the zero (sight h above the bore)
    function zeroAngle(c, h, Z) {
      var lo = -0.002, hi = 0.02;
      for (var it = 0; it < 24; it++) {
        var a = (lo + hi) / 2, x = 0, y = 0, vx = c.v * Math.cos(a), vy = c.v * Math.sin(a), dt = 0.0005;
        while (x < Z && vx > 50) { var v = Math.hypot(vx, vy), k = dragK(c, v) * v; vx -= k * vx * dt; vy -= (k * vy + 9.81) * dt; x += vx * dt; y += vy * dt; }
        if (y > h) hi = a; else lo = a;
      }
      return (lo + hi) / 2;
    }
    var BULLETS = [], NB = 48;
    for (var bi = 0; bi < NB; bi++) BULLETS.push({ on: false, p: new V(), v: new V(), p0: new V(), t: 0, c: null, gun: null, travelled: 0 });
    var ray = new THREE.Raycaster(), rhits = [], rapierRay = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 } };
    var shootables = [];               // meshes with userData.onBulletHit (targets, enemy capsules)
    function refreshShootables() {
      shootables.length = 0;
      for (var i = 0; i < targets.length; i++) shootables.push(targets[i].hitMesh);
      var EN = window.__studioEnemies;
      if (EN && EN.list) for (i = 0; i < EN.list.length; i++) { var e = EN.list[i]; if (e.root.visible) for (var j = 0; j < e.proxies.length; j++) shootables.push(e.proxies[j]); }
    }
    var liveBullets = 0;
    function fireBullet(gun, origin, dir) {
      var b = null; for (var i = 0; i < NB; i++) if (!BULLETS[i].on) { b = BULLETS[i]; break; }
      if (!b) b = BULLETS[0];
      b.on = true; b.c = CART[gun.d.cart]; b.gun = gun; b.t = 0; b.travelled = 0;
      b.p.copy(origin); b.v.copy(dir).multiplyScalar(b.c.v);
      stats.shots++; stats.ver++; liveBullets++;
    }
    var seg = { t0: 0, dt: 0, s0: 0, s1: 0 };   // the frame's flight: start time, step, speed at both ends (a hit interpolates)
    function stepBullets(dt) {
      if (!liveBullets) return false;
      refreshShootables(); liveBullets = 0;
      for (var i = 0; i < NB; i++) {
        var b = BULLETS[i]; if (!b.on) continue;
        b.p0.copy(b.p); seg.s0 = b.v.length(); seg.t0 = b.t; seg.dt = dt;
        for (var s = 0; s < 4; s++) {   // drag + gravity, 4 sub-steps a frame
          var h = dt / 4, sp = b.v.length(), k = dragK(b.c, sp) * sp;
          b.v.x -= k * b.v.x * h; b.v.y -= (k * b.v.y + 9.81) * h; b.v.z -= k * b.v.z * h;
          b.p.addScaledVector(b.v, h);
        }
        b.t += dt; seg.s1 = b.v.length();
        _v.copy(b.p).sub(b.p0); var len = _v.length(); if (len < 1e-6) { liveBullets++; continue; } _v.divideScalar(len);
        var hit = traceSegment(b, b.p0, _v, len);
        b.travelled += hit ? hit.d : len;
        if (hit || b.t > 3 || b.p.y < -3 || b.travelled > 900) b.on = false; else liveBullets++;
      }
      return liveBullets > 0;
    }
    var hitInfo = { point: new V(), normal: new V(), dir: new V(), speed: 0, mass: 0, distance: 0, time: 0, gun: null, d: 0 };
    function traceSegment(b, o, dir, len) {
      var best = null, bestD = len;
      // THREE: targets and enemy capsules
      ray.set(o, dir); ray.far = len; rhits.length = 0;
      if (shootables.length) ray.intersectObjects(shootables, false, rhits);
      if (rhits.length && rhits[0].distance < bestD) { best = { kind: "obj", h: rhits[0] }; bestD = rhits[0].distance; }
      // Rapier: the room, the bench, every prop (not the gun that fired)
      if (P.world) {
        rapierRay.origin.x = o.x; rapierRay.origin.y = o.y; rapierRay.origin.z = o.z; rapierRay.dir.x = dir.x; rapierRay.dir.y = dir.y; rapierRay.dir.z = dir.z;
        var r = null;
        try { r = P.world.castRayAndGetNormal(rapierRay, bestD, true, undefined, undefined, undefined, b.gun && b.gun.prop ? b.gun.prop.body : undefined); } catch (e) { r = null; }
        if (r && r.timeOfImpact < bestD) { best = { kind: "rapier", r: r }; bestD = r.timeOfImpact; }
      }
      if (!best) return null;
      var f = bestD / len;   // where in this frame's flight it struck: speed and time of flight at that point
      hitInfo.point.copy(o).addScaledVector(dir, bestD); hitInfo.dir.copy(dir); hitInfo.speed = seg.s0 + (seg.s1 - seg.s0) * f; hitInfo.mass = b.c.m;
      hitInfo.time = seg.t0 + seg.dt * f; hitInfo.distance = b.travelled + bestD; hitInfo.gun = b.gun;
      stats.lastFlight = b.t; stats.lastSpeed = hitInfo.speed;
      if (best.kind === "obj") {
        var obj = best.h.object; hitInfo.normal.copy(best.h.face ? best.h.face.normal : dir).transformDirection(obj.matrixWorld);
        for (var q = obj; q; q = q.parent) if (q.userData && typeof q.userData.onBulletHit === "function") { q.userData.onBulletHit(hitInfo); break; }
      } else {
        var rr = best.r, n = rr.normal; hitInfo.normal.set(n.x, n.y, n.z);
        var body = rr.collider.parent ? rr.collider.parent() : null, prop = null;
        if (body) for (var i = 0; i < P.props.length; i++) if (P.props[i].body === body) { prop = P.props[i]; break; }
        if (prop) {
          var imp = hitInfo.mass * hitInfo.speed * 0.6;
          prop.body.applyImpulseAtPoint({ x: dir.x * imp, y: dir.y * imp, z: dir.z * imp }, { x: hitInfo.point.x, y: hitInfo.point.y, z: hitInfo.point.z }, true);
          play(thudBuf(), hitInfo.point, { gain: 0.5, rate: 1.6 });
        } else {
          decal(hitInfo.point, hitInfo.normal);
          dust(hitInfo.point, hitInfo.normal);
          play(thudBuf(), hitInfo.point, { gain: 0.7 });
        }
      }
      return { d: bestD };
    }

    // ---------- effects: holes, dust, muzzle flash ----------
    function radialTex(stops, size) {
      var c = document.createElement("canvas"); c.width = c.height = size || 64; var x = c.getContext("2d"), r = c.width / 2, g = x.createRadialGradient(r, r, 0, r, r, r);
      stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
      var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    }
    var holeMat = new THREE.MeshBasicMaterial({ map: radialTex([[0, "rgba(8,7,6,1)"], [0.28, "rgba(20,18,16,0.95)"], [0.42, "rgba(70,66,60,0.55)"], [1, "rgba(120,115,105,0)"]]), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    var holeGeo = new THREE.PlaneGeometry(0.03, 0.03), HOLES = [], holeI = 0, ZAX = new V(0, 0, 1);
    for (var hi = 0; hi < 64; hi++) { var hm = new THREE.Mesh(holeGeo, holeMat); hm.visible = false; hm.raycast = function () {}; hm.userData.noBullet = true; hm.matrixAutoUpdate = false; root.add(hm); HOLES.push(hm); }
    function decal(p, n) {
      var m = HOLES[holeI++ % HOLES.length];
      _q.setFromUnitVectors(ZAX, n); _q.multiply(_qz.setFromAxisAngle(ZAX, Math.random() * 6.28));
      _v3.copy(p).addScaledVector(n, 0.001); var s = 0.7 + Math.random() * 0.5;
      m.matrix.compose(_v3, _q, _v2.set(s, s, s)); m.matrixWorldNeedsUpdate = true; m.visible = true;
    }
    var _qz = new THREE.Quaternion();
    var dustTex = radialTex([[0, "rgba(200,190,175,0.7)"], [1, "rgba(200,190,175,0)"]]), PUFFS = [];
    for (var pi = 0; pi < 16; pi++) { var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false })); sp.visible = false; sp.raycast = function () {}; root.add(sp); PUFFS.push({ s: sp, t: 9, v: new V() }); }
    var puffI = 0;
    function dust(p, n) { var u = PUFFS[puffI++ % PUFFS.length]; u.s.position.copy(p).addScaledVector(n, 0.02); u.v.copy(n).multiplyScalar(0.4); u.t = 0; u.s.visible = true; }
    function stepPuffs(dt) {
      for (var i = 0; i < PUFFS.length; i++) {
        var u = PUFFS[i]; if (u.t > 0.9) { u.s.visible = false; continue; }
        u.t += dt; u.s.position.addScaledVector(u.v, dt); u.s.scale.setScalar(0.04 + u.t * 0.35); u.s.material.opacity = Math.max(0, 0.8 - u.t);
      }
    }
    var flashTex = radialTex([[0, "rgba(255,250,225,1)"], [0.25, "rgba(255,190,90,0.9)"], [0.6, "rgba(255,120,30,0.35)"], [1, "rgba(255,80,0,0)"]]);
    var flashMat = new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

    // ---------- ejected casings: one InstancedMesh (pool of 96), ballistic arc, bounces off what a Rapier ray finds ----------
    var CASE = { "9mm": { L: 0.0192, r: 0.0049, f: 1 }, "45": { L: 0.0228, r: 0.006, f: 0.82 }, "762": { L: 0.0386, r: 0.0056, f: 0.78 },
      "556": { L: 0.0446, r: 0.0048, f: 0.86 }, "338": { L: 0.0693, r: 0.0074, f: 0.6 } };   // f: tink pitch
    var NC = 96, caseGeo = new THREE.CylinderGeometry(1, 0.94, 1, 10, 1).rotateX(Math.PI / 2);   // unit case along z, mouth toward -z
    var caseMat = new THREE.MeshStandardMaterial({ color: 0xc9953f, metalness: 1, roughness: 0.3 });
    var caseMesh = new THREE.InstancedMesh(caseGeo, caseMat, NC); caseMesh.name = "range-casings";
    caseMesh.frustumCulled = false; caseMesh.castShadow = false; caseMesh.raycast = function () {}; caseMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    var ZERO = new THREE.Matrix4().makeScale(0, 0, 0), CASES = [], caseI = 0, casesMoving = 0, casesDirty = false, tinkAt = 0;
    for (var ci = 0; ci < NC; ci++) { caseMesh.setMatrixAt(ci, ZERO); CASES.push({ on: false, rest: false, p: new V(), v: new V(), w: new V(), q: new THREE.Quaternion(), s: new V(), c: null, age: 0, bounces: 0 }); }
    root.add(caseMesh);
    var _cq = new THREE.Quaternion(), _cv = new V(), _cn = new V(), caseRay = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 } };
    function benchTop(x, z) { return Math.abs(x - LANE.x) < 0.31 && Math.abs(z - LANE.z) < 0.9 ? 0.95 : -Infinity; }
    // out of the ejection port: right, up and a little back, plus a spread; spinning end over end
    function ejectCase(gun, live) {
      var c = CASE[gun.d.cart], k = CASES[caseI]; caseI = (caseI + 1) % NC;
      gun.object.updateMatrixWorld();
      if (!k.on || k.rest) casesMoving++;
      k.on = true; k.rest = false; k.c = c; k.age = 0; k.bounces = 0; k.live = !!live;
      k.p.copy(gun.T.eject).applyMatrix4(gun.object.matrixWorld);
      var rifle = gun.d.cart !== "9mm" && gun.d.cart !== "45", sp = live ? 1.2 : rifle ? 3.4 : 2.6;
      _cv.set(sp * (0.85 + Math.random() * 0.3), sp * (0.45 + Math.random() * 0.25), sp * (0.12 + Math.random() * 0.15));
      k.v.copy(_cv).transformDirection(gun.object.matrixWorld).multiplyScalar(_cv.length());
      if (gun.prop) { var lv = gun.prop.body.linvel(); k.v.x += lv.x; k.v.y += lv.y; k.v.z += lv.z; }
      gun.object.getWorldQuaternion(k.q);
      k.w.set(-14 - Math.random() * 10, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 6).applyQuaternion(k.q);
      k.s.set(c.r, c.r, c.L * (live ? 1.45 : 1));
      casesDirty = true;
    }
    function notGun(col) {   // casings fly through the guns' own box colliders
      var b = col.parent && col.parent(); if (!b) return true;
      for (var i = 0; i < api.guns.length; i++) if (api.guns[i].prop && api.guns[i].prop.body === b) return false;
      return true;
    }
    function caseGround(x, z) { return Math.max(benchTop(x, z), x < -5.7 && !groundCollider ? -50 : floorY(x)); }
    function stepCases(dt) {
      if (!casesMoving && !casesDirty) return;
      var rays = 0;
      for (var i = 0; i < NC; i++) {
        var k = CASES[i]; if (!k.on) continue;
        if (!k.rest) {
          k.age += dt; k.v.y -= 9.81 * dt;
          var len = k.v.length() * dt, hitN = null, hitD = 0;
          // walls, the bench, props: one ray along the step while it is quick (a few a frame)
          if (len > 0.004 && rays < 8 && P.world) {
            rays++;
            _cn.copy(k.v).normalize();
            caseRay.origin.x = k.p.x; caseRay.origin.y = k.p.y; caseRay.origin.z = k.p.z; caseRay.dir.x = _cn.x; caseRay.dir.y = _cn.y; caseRay.dir.z = _cn.z;
            var r = null; try { r = P.world.castRayAndGetNormal(caseRay, len + k.c.r, true, undefined, undefined, undefined, undefined, notGun); } catch (e) { r = null; }
            if (r) { hitD = Math.max(0, r.timeOfImpact - k.c.r); _cn.set(r.normal.x, r.normal.y, r.normal.z); hitN = _cn; }
          }
          if (hitN) k.p.addScaledVector(k.v, hitD / Math.max(1e-6, k.v.length()));
          else k.p.addScaledVector(k.v, dt);
          var gy = caseGround(k.p.x, k.p.z) + k.c.r;
          if (!hitN && k.p.y < gy) { k.p.y = gy; hitN = _cn.set(0, 1, 0); }
          if (hitN) {
            var vn = k.v.dot(hitN);
            if (vn < 0) {
              if (-vn > 0.5) tink(k, -vn);
              k.v.addScaledVector(hitN, -vn * 1.38);   // restitution 0.38
              k.v.multiplyScalar(0.62);                 // scrape along the surface
              k.w.multiplyScalar(0.55); k.bounces++;
              if (hitN.y > 0.7 && k.v.lengthSq() < 0.09) {   // lies down on its side, keeps its heading
                k.rest = true; casesMoving--;
                _cv.set(0, 0, 1).applyQuaternion(k.q); _cv.y = 0; if (_cv.lengthSq() < 1e-6) _cv.set(1, 0, 0);
                k.q.setFromUnitVectors(ZAX, _cv.normalize());
              }
            }
          }
          if (!k.rest) {
            var wl = k.w.length();
            if (wl > 1e-4) { _cq.setFromAxisAngle(_cv.copy(k.w).divideScalar(wl), wl * dt); k.q.premultiply(_cq); }
            if (k.p.y < -40 || k.age > 8) { k.rest = true; casesMoving--; if (k.p.y < -40) { k.on = false; caseMesh.setMatrixAt(i, ZERO); continue; } }
          }
        }
        _m.compose(k.p, k.q, k.s); caseMesh.setMatrixAt(i, _m);
      }
      caseMesh.instanceMatrix.needsUpdate = true; casesDirty = false;
    }
    function clearCases() {
      for (var i = 0; i < NC; i++) { CASES[i].on = false; CASES[i].rest = false; caseMesh.setMatrixAt(i, ZERO); }
      caseMesh.instanceMatrix.needsUpdate = true; casesMoving = 0; caseI = 0;
    }
    // brass tink: a short inharmonic ring (thin-walled tube modes), lower for the long rifle cases
    function tinkBuf() {
      if (synth.tink || !audio()) return synth.tink;
      var sr = ctx.sampleRate, n = Math.floor(sr * 0.32), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), F = [3150, 5480, 7930, 10650], A = [1, 0.7, 0.45, 0.25], T = [0.09, 0.06, 0.04, 0.025];
      for (var i = 0; i < n; i++) { var t = i / sr, s = 0; for (var j = 0; j < F.length; j++) s += A[j] * Math.sin(2 * Math.PI * F[j] * t + j) * Math.exp(-t / T[j]); if (i < sr * 0.002) s += (Math.random() * 2 - 1) * 0.6 * (1 - i / (sr * 0.002)); d[i] = s * 0.32; }
      return (synth.tink = b);
    }
    function tink(k, vn) {
      var now = performance.now(); if (now - tinkAt < 30) return; tinkAt = now;
      var soft = k.p.y > 0.5 && benchTop(k.p.x, k.p.z) > 0 ? 0.55 : 1;   // on the wooden bench: duller
      play(tinkBuf(), k.p, { gain: Math.min(0.5, 0.08 + vn * 0.09) * soft * (k.bounces ? 0.7 : 1), rate: k.c.f * (0.9 + Math.random() * 0.2) * (soft < 1 ? 0.8 : 1), verb: 0.12, ref: 1.2, lowpass: soft < 1 ? 3500 : 0 });
    }

    // ---------- loading and baking a gun type (once) ----------
    var loaderP = null, tpl = {};
    function loader() { if (!loaderP) loaderP = import(new URL(LOADER_URL, document.baseURI).href).then(function (m) { return new m.t(); }); return loaderP; }
    function toFloat(g) {   // quantized attributes (KHR_mesh_quantization) as floats, so the bake matrix applies
      ["position", "normal", "uv"].forEach(function (n) {
        var a = g.attributes[n]; if (!a || (a.array instanceof Float32Array && !a.normalized && !a.isInterleavedBufferAttribute)) return;
        var out = new Float32Array(a.count * a.itemSize);
        for (var i = 0; i < a.count; i++) for (var c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
        g.setAttribute(n, new THREE.BufferAttribute(out, a.itemSize));
      });
      if (!g.attributes.normal) g.computeVertexNormals();
      return g;
    }
    function compact(src) {   // a mesh split out of a bigger one keeps the whole buffer: keep the vertices its index uses
      var idx = src.index; if (!idx) return src;
      var n = src.attributes.position.count, map = new Int32Array(n).fill(-1), order = [];
      for (var i = 0; i < idx.count; i++) { var v = idx.getX(i); if (map[v] < 0) { map[v] = order.length; order.push(v); } }
      if (order.length === n) return src;
      var out = new THREE.BufferGeometry();
      Object.keys(src.attributes).forEach(function (name) {
        var a = src.attributes[name], arr = new Float32Array(order.length * a.itemSize);
        for (var i = 0; i < order.length; i++) for (var c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(order[i], c);
        out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
      });
      var ni = new (order.length > 65535 ? Uint32Array : Uint16Array)(idx.count);
      for (i = 0; i < idx.count; i++) ni[i] = map[idx.getX(i)];
      out.setIndex(new THREE.BufferAttribute(ni, 1));
      return out;
    }
    function bakeMatrix(B) {
      if (B.kind === "glb") return new THREE.Matrix4().makeTranslation(B.off[0], B.off[1], B.off[2]);
      var x0 = B.x0 || 0;
      return new THREE.Matrix4().set(-B.S, 0, 0, B.S * x0, 0, B.S, 0, -B.S * B.yb, 0, 0, -B.S, B.S * B.z0, 0, 0, 0, 1);
    }
    function hold(d, a) { return new V(a[0] - d.palm[0] + HOLD[0], a[1] - d.palm[1] + HOLD[1], a[2] - d.palm[2] + HOLD[2]); }
    function loadType(type) {
      if (tpl[type]) return tpl[type];
      var d = GUNS[type];
      return (tpl[type] = loader().then(function (L) {
        return new Promise(function (res, rej) { L.load(new URL(d.file, document.baseURI).href, res, undefined, rej); });
      }).then(function (gltf) {
        var src = gltf.scene; src.updateMatrixWorld(true);
        var D = bakeMatrix(d.bake).premultiply(new THREE.Matrix4().makeTranslation(HOLD[0] - d.palm[0], HOLD[1] - d.palm[1], HOLD[2] - d.palm[2]));
        var parts = { body: [], slide: [], mag: [] }, box = new THREE.Box3();
        src.traverse(function (o) {
          if (!o.isMesh) return;
          var part = d.parts(o.name); if (!part) return;
          var g = o.geometry.clone(); if (d.bake.compact) g = compact(g);
          g = toFloat(g).applyMatrix4(_m.multiplyMatrices(D, o.matrixWorld));
          g.computeBoundingBox(); if (part !== "mag") box.union(g.boundingBox);
          var mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(function (m) { m.side = part === "mag" ? THREE.DoubleSide : THREE.FrontSide; ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap"].forEach(function (k) { if (m[k]) m[k].anisotropy = renderer.capabilities.getMaxAnisotropy(); }); if (/glass/i.test(m.name || "") || o.name.indexOf("glass") === 0) { m.transparent = true; m.depthWrite = false; } });
          parts[part].push({ g: g, m: o.material, name: o.name });
        });
        if (!parts.body.length) throw new Error(d.label + ": no parts found in " + d.file);
        var c = CART[d.cart], eye = hold(d, d.eye), scopeT = null;
        if (d.scope) {   // AWM: the sight line is the scope axis (the rear cluster of its glass)
          var y0 = Infinity, y1 = -Infinity, zMax = -Infinity;
          parts.body.forEach(function (p) { if (p.name.indexOf("glass") !== 0) return; var A = p.g.attributes.position; for (var i = 0; i < A.count; i++) { var z = A.getZ(i); if (z > hold(d, [0, 0, -0.08]).z) { y0 = Math.min(y0, A.getY(i)); y1 = Math.max(y1, A.getY(i)); zMax = Math.max(zMax, z); } } });
          if (isFinite(zMax)) eye.set(0, (y0 + y1) / 2, zMax + 0.085);
          // the lenses: eyepiece = the rear cluster of the scope glass, objective = the front one (radius off the axis)
          var sc = { y: eye.y, zR: zMax, rR: 0, zF: Infinity, rF: 0 };
          parts.body.forEach(function (p) {
            if (p.name.indexOf("glass") !== 0) return; var A = p.g.attributes.position;
            for (var i = 0; i < A.count; i++) {
              var z = A.getZ(i), r = Math.hypot(A.getX(i), A.getY(i) - sc.y);
              if (r > 0.06) continue;
              if (z > sc.zR - 0.03) sc.rR = Math.max(sc.rR, r); else if (z < hold(d, [0, 0, -0.2]).z) { sc.zF = Math.min(sc.zF, z); sc.rF = Math.max(sc.rF, r); }
            }
          });
          if (isFinite(zMax) && sc.rR > 0.005) { if (!isFinite(sc.zF)) sc.zF = sc.zR - 0.4; scopeT = sc; }
        }
        var bore = hold(d, [0, 0, 0]);
        return { d: d, parts: parts, box: box, muzzle: hold(d, d.muzzle), eye: eye, eject: hold(d, d.eject), support: d.support ? hold(d, d.support) : null,
          bore: bore, zero: zeroAngle(c, eye.y - bore.y, d.zero), scope: scopeT };
      }));
    }

    // ---------- the gun controller (the bundle's held-gun interface) ----------
    var stats = { shots: 0, hits: 0, points: 0, steel: 0, lastFlight: 0, lastSpeed: 0, last: "", since: performance.now(), ver: 1, log: [] };
    // one line per hit for the scoreboard (newest first, 6 kept)
    function logHit(gun, what, h, ring) {
      stats.log.unshift({ gun: gun ? gun.label : "", what: what, dist: Math.round(h.distance), tof: h.time, v: h.speed, ring: ring });
      if (stats.log.length > 6) stats.log.length = 6;
      stats.ver++;
    }
    function RangeGun(type, T) {
      var d = GUNS[type]; this.type = type; this.d = d; this.T = T; this.label = d.label; this.twoHanded = !!T.support;
      var obj = new THREE.Group(); obj.name = "range-gun-" + type;
      function meshes(list, parent) { list.forEach(function (p) { var m = new THREE.Mesh(p.g, p.m); m.castShadow = false; m.receiveShadow = true; parent.add(m); }); }
      meshes(T.parts.body, obj);
      this.slide = new THREE.Group(); meshes(T.parts.slide, this.slide); obj.add(this.slide);
      this.magG = new THREE.Group(); meshes(T.parts.mag, this.magG); obj.add(this.magG);
      this.flash = new THREE.Sprite(flashMat); this.flash.position.copy(T.muzzle).add(_v.set(0, 0, -0.03)); this.flash.visible = false; this.flash.raycast = function () {}; obj.add(this.flash);
      this.keys = "click fire · right mouse aim" + (T.scope ? " (scope, wheel zoom; zeroed 100 m, 300 m: one dot high)" : "") + " · R reload · F " + (d.action === "bolt" ? "work the bolt" : "rack") + (d.modes ? " · V selector" : "") + " · E put down";
      this.object = obj; this.rounds = d.cap; this.hasMag = true; this.chamber = true; this.locked = false; this.mode = d.modes ? d.modes[0] : "semi";
      this.slideOff = 0; this.cycleT = 1; this.task = null; this.trigger = 0; this.held = false; this.nextShot = 0; this.clock = 0; this.flashT = 0; this.needsCycle = false;
      this.rec = { z: 0, vz: 0, p: 0, vp: 0, y: 0, vy: 0 }; this.recM = new THREE.Matrix4(); this.spent = false; this.hidden = false;
      if (T.scope) {   // AWM: a picture in picture on the eyepiece (VR) and the magnification the wheel / stick sets
        var sc = T.scope, mat = new THREE.ShaderMaterial({ uniforms: { map: { value: null }, uOn: { value: 0 }, uOff: { value: new THREE.Vector2() } }, vertexShader: SCOPE_VS, fragmentShader: SCOPE_FS, toneMapped: true });
        var disc = new THREE.Mesh(new THREE.CircleGeometry(sc.rR * 0.97, 40), mat); disc.position.set(0, sc.y, sc.zR + 0.0008); disc.raycast = function () {}; obj.add(disc);
        this.scope = { T: sc, mat: mat, disc: disc, rt: null, cam: new THREE.PerspectiveCamera(5, 1, 0.05, 700), mag: 6, on: false };
        this.zoom = function (f) { var s = this.scope; s.mag = Math.min(25, Math.max(3, s.mag * f)); deskScopeLabel(s.mag); };
      }
    }
    RangeGun.prototype = {
      owns: function (p) { return !!p && p === this.prop; },
      world: function (local, out) { this.object.updateMatrixWorld(); return out.copy(local).applyMatrix4(this.object.matrixWorld); },
      sound: function (ev) { var H = HANDLING[this.d.snd.fam][ev]; if (H) play(H[0], this.world(this.T.bore, _v3), { rate: H[1], gain: 0.8, verb: 0.15 }); },
      // fire from the muzzle along the bore (raised by the zero angle), or toward the given direction (desktop hip fire)
      pullTrigger: function (aim) {
        if (S.runtime && S.runtime.mode !== "play") return null;
        if (this.mode === "safe") return "click";
        this.trigDown = true;
        return this.fire(aim);
      },
      fire: function (aim) {
        var d = this.d, now = this.clock;   // game time (the update's dt): the cycle rate holds at any frame rate
        if (now < this.nextShot) return null;
        if (!this.chamber || this.locked || this.needsCycle || this.task) { play("dry" + (1 + Math.floor(Math.random() * 3)), this.world(this.T.bore, _v3), { gain: 0.5, verb: 0.05 }); return "click"; }
        this.object.updateMatrixWorld();
        var o = _v.copy(this.T.muzzle).applyMatrix4(this.object.matrixWorld), dir = _v2;
        if (aim && aim.dir) {
          // hip fire on a computer: from the muzzle toward the point under the crosshair, with a hand's worth of scatter
          var far = 40; try { var rr = P.world.castRay({ origin: aim.origin, dir: aim.dir }, 300, true, undefined, undefined, undefined, this.prop.body); if (rr) far = rr.timeOfImpact; } catch (e) {}
          refreshShootables(); ray.set(aim.origin, aim.dir); ray.far = far; rhits.length = 0;   // targets are not in Rapier
          if (shootables.length) ray.intersectObjects(shootables, false, rhits);
          if (rhits.length) far = rhits[0].distance;
          dir.copy(aim.origin).addScaledVector(aim.dir, far).sub(o).normalize();
          dir.x += (Math.random() - 0.5) * 0.02; dir.y += (Math.random() - 0.5) * 0.02; dir.z += (Math.random() - 0.5) * 0.02; dir.normalize();
        } else dir.set(0, Math.sin(this.T.zero), -Math.cos(this.T.zero)).transformDirection(this.object.matrixWorld);
        fireBullet(this, o, dir);
        var c = CART[d.cart];
        // the next round: self-loaders feed from the magazine, the AWM leaves the case in the chamber for the bolt
        this.chamber = false;
        if (d.action === "bolt") { this.needsCycle = true; this.spent = true; }   // the case stays until the bolt is worked
        else {
          ejectCase(this, false);
          if (this.hasMag && this.rounds > 0) { this.rounds--; this.chamber = true; this.cycleT = 0; }
          else { this.cycleT = 0; if (d.action !== "recip") this.locked = true; }   // the AKM's bolt closes on an empty magazine
        }
        this.nextShot = now + (d.rpm ? 60 / d.rpm : 0.09);
        var sh = d.snd.shot[Math.floor(Math.random() * d.snd.shot.length)];
        play(sh, o, { rate: d.snd.rate, gain: d.snd.gain || 1, verb: d.snd.suppressed ? 0.2 : 0.5, ref: 3, lowpass: d.snd.suppressed ? 2600 : 0 });
        if (!d.snd.suppressed) { this.flash.visible = true; this.flashT = 0.035; this.flash.material.rotation = Math.random() * 6.28; this.flash.scale.setScalar(c.v > 600 ? 0.16 : 0.09); }
        // recoil: momentum of the bullet and the powder gas into the hand's spring; a second hand halves the climb
        var two = this.supported(), R = d.rec;
        this.rec.vz += R.back; this.rec.vp += R.rise * (two ? 0.5 : 1) * (0.85 + Math.random() * 0.3); this.rec.vy += (Math.random() - 0.5) * R.rise * 0.3;
        if (!renderer.xr.isPresenting && desk && desk.heldGun && desk.heldGun() === this) { desk.pitch = Math.min(1.45, desk.pitch + R.kick * (0.8 + Math.random() * 0.4)); desk.yaw += (Math.random() - 0.5) * R.kick * 0.4; this.kickBack = R.kick * 0.55; }
        if (this.prop) this.prop.body.wakeUp();
        return "fired";
      },
      supported: function () { var self = this; return !!(XR && XR.hands && XR.hands.some(function (h) { return h.supporting === self; })); },
      setTrigger: function (v) { this.trigger = v; if (v < 0.35) this.trigDown = false; },
      primary: function () { if (this.locked) this.release(); else if (this.d.modes) this.accessory(); else this.cycle(); },   // VR A / X
      secondary: function () { this.reload(); },                                                                          // VR B / Y, desktop B
      accessory: function () {
        if (!this.d.modes) return;
        var M = this.d.modes; this.mode = M[(M.indexOf(this.mode) + 1) % M.length];
        play("btnClick2", this.world(this.T.bore, _v3), { gain: 0.5, rate: 0.75, verb: 0 }); info(this.label + ": " + this.mode);
      },
      release: function () { if (!this.locked) return; this.locked = false; if (this.hasMag && this.rounds > 0) { this.rounds--; this.chamber = true; } this.slideOff = 0; this.sound("rel"); },
      // rack / work the bolt: anything in the chamber comes out, a round goes in from the magazine
      cycle: function () {
        if (this.task) return;
        var self = this; this.sound("back");
        if (this.chamber || this.spent) { ejectCase(this, this.chamber && !this.spent); this.chamber = false; this.spent = false; }
        this.task = { t: 0, dur: this.d.action === "bolt" ? 0.55 : 0.32, end: function () {
          self.chamber = false; self.needsCycle = false; self.locked = false;
          if (self.hasMag && self.rounds > 0) { self.rounds--; self.chamber = true; }
          self.sound("fwd");
        }, anim: function (u) { self.slideOff = self.d.travel * Math.sin(Math.PI * Math.min(1, u)); } };
      },
      // magazine out, a fresh one in from the range bag, then the slide / bolt goes home if it has to
      reload: function () {
        if (this.task) return;
        var self = this, d = this.d, T = d.reload;
        this.sound("magOut"); this.hasMag = false; this.magG.visible = false;
        play("magDrop" + (1 + Math.floor(Math.random() * 3)), this.world(this.T.bore, _v3).setY(floorY(_v3.x)), { delay: 0.45, gain: 0.5 });
        this.task = { t: 0, dur: T, end: function () {
          self.hasMag = true; self.magG.visible = true; self.rounds = d.cap; self.sound("magIn");
          // then the slide stop / charging handle / bolt, a moment later (game time)
          if (self.locked) self.pend = { t: 0.18, fn: "release" };
          else if (!self.chamber) self.pend = { t: 0.2, fn: "cycle" };
        } };
      },
      status: function () {
        var m = this.hasMag ? this.rounds + (this.chamber ? "+1" : "") : "no magazine" + (this.chamber ? ", 1 chambered" : "");
        return this.label + " · " + CART[this.d.cart].label + ": " + m + (this.locked ? " · slide locked back" : this.needsCycle ? " · work the bolt" : "") + (this.d.modes ? " · " + this.mode : "") + "   ·   hits " + stats.hits + "/" + stats.shots;
      },
      zoom: null,
      inHand: function () { if (!XR || !XR.hands) return false; for (var i = 0; i < XR.hands.length; i++) { var h = XR.hands[i]; if (h.held && h.held.prop === this.prop) return true; } return false; },
      // called by the engine before the main render: in the headset, with an eye behind the eyepiece, the scope's own camera
      // draws what is ahead (magnified) into a small target shown on the eyepiece glass
      renderScope: function (rnd, scn, eyeW) {
        var s = this.scope; if (!s) return;
        var on = false, dz = 0, lx = 0, ly = 0;
        if (rnd.xr.isPresenting && this.object.visible && this.prop && this.inHand()) {
          this.object.updateMatrixWorld();
          _sv.copy(eyeW); this.object.worldToLocal(_sv);
          dz = _sv.z - s.T.zR; lx = _sv.x; ly = _sv.y - s.T.y;
          on = dz > 0.02 && dz < 0.3 && lx * lx + ly * ly < 0.0025;
        }
        s.mat.uniforms.uOn.value = on ? 1 : 0;
        if (!on) return;
        if (!s.rt) { s.rt = new THREE.WebGLRenderTarget(SCOPE_PX, SCOPE_PX, { type: THREE.HalfFloatType }); s.mat.uniforms.map.value = s.rt.texture; }
        s.mat.uniforms.uOff.value.set(Math.max(-1, Math.min(1, -lx / 0.035)), Math.max(-1, Math.min(1, -ly / 0.035)));
        var c = s.cam;
        c.position.set(0, s.T.y, s.T.zF - 0.02).applyMatrix4(this.object.matrixWorld);
        this.object.getWorldQuaternion(c.quaternion);
        // the disc covers 2 atan(r / dz) of your view; the scope shows 1/mag of that: true magnification at any eye relief
        c.fov = THREE.MathUtils.radToDeg(2 * Math.atan(s.T.rR / Math.max(0.04, dz))) / s.mag; c.updateProjectionMatrix(); c.updateMatrixWorld();
        var xrOn = rnd.xr.enabled, rt0 = rnd.getRenderTarget(), sh = rnd.shadowMap.needsUpdate;
        rnd.xr.enabled = false; this.object.visible = false;   // (it was visible: checked above)
        rnd.setRenderTarget(s.rt); rnd.render(scn, c); rnd.setRenderTarget(rt0);
        rnd.xr.enabled = xrOn; this.object.visible = true; rnd.shadowMap.needsUpdate = sh;
      },
      eyePoint: function () { return (this._eye || (this._eye = new V())).copy(this.T.eye); },   // read every frame while aiming: no new vector
      forendPoint: function () { return this.T.support; },
      recoilMatrix: function (out) { out = out || this.recM; var r = this.rec; return out.makeRotationFromEuler(_eul.set(r.p, r.y, 0)).setPosition(0, r.p * 0.02, r.z); },
      update: function (dt) {
        var r = this.rec, d = this.d; this.clock += dt;
        // the hand's spring back to the grip (critically damped), position and climb
        // sub-stepped (4 ms): one Euler step of a long frame (50 ms) is unstable at this stiffness and the gun flew off
        var ns = Math.min(20, Math.ceil(dt / 0.004)), h = dt / ns;
        for (var si = 0; si < ns; si++) {
          r.vz += (-420 * r.z - 40 * r.vz) * h; r.z += r.vz * h;
          r.vp += (-300 * r.p - 32 * r.vp) * h; r.p += r.vp * h;
          r.vy += (-300 * r.y - 32 * r.vy) * h; r.y += r.vy * h;
        }
        if (!(Math.abs(r.z) < 0.15 && Math.abs(r.p) < 0.6 && Math.abs(r.y) < 0.6)) { r.z = r.vz = r.p = r.vp = r.y = r.vy = 0; }   // runaway guard
        if (this.kickBack > 0 && desk) { var k = Math.min(this.kickBack, this.kickBack * dt * 9); desk.pitch -= k; this.kickBack -= k; }
        if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
        if (this.pend && (this.pend.t -= dt) <= 0) { var pf = this.pend.fn; this.pend = null; this[pf](); }
        if (this.task) { var t = this.task; t.t += dt; if (t.anim) t.anim(t.t / t.dur); if (t.t >= t.dur) { this.task = null; t.end(); } }
        else if (this.locked) this.slideOff = d.travel;
        else if (this.cycleT < 1) { this.cycleT = Math.min(1, this.cycleT + dt / 0.06); if (d.action !== "handle" && d.action !== "bolt") this.slideOff = d.travel * Math.sin(Math.PI * this.cycleT); }
        else if (!this.task) this.slideOff = 0;
        this.slide.position.z = this.slideOff;
        // full auto: keep firing while the trigger is held (VR trigger value, or the desktop button)
        if (this.mode === "auto" && this.trigDown !== false && this.clock >= this.nextShot && this.chamber &&
            (renderer.xr.isPresenting ? this.trigger > 0.55 : mouseDown && desk && desk.held && desk.held.prop === this.prop)) {
          var aim = null;
          if (!renderer.xr.isPresenting && !desk.ads) { aim = autoAim; aim.origin.copy(camera.position); aim.dir.set(0, 0, -1).applyQuaternion(camera.quaternion); }
          if (this.fire(aim) === "fired" && renderer.xr.isPresenting && XR && XR.hands) for (var hi = 0; hi < XR.hands.length; hi++) { var hh = XR.hands[hi]; if (hh.held && hh.held.prop === this.prop) XR.pulse(hh, 0.9, 45); }
        }
      }
    };
    var _sv = new V(), SCOPE_PX = /OculusBrowser|Quest/i.test(navigator.userAgent) ? 256 : 384;
    var SCOPE_VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
    // the picture, a mil-dot reticle (second focal plane: same size at every power), the exit pupil going dark off the axis
    var SCOPE_FS = [
      "uniform sampler2D map; uniform float uOn; uniform vec2 uOff; varying vec2 vUv;",
      "float bar(float d, float w, float aa){ return 1.0 - smoothstep(w, w + aa, d); }",
      "void main(){",
      "  vec2 p = vUv * 2.0 - 1.0; float r = length(p); float aa = fwidth(p.x) * 1.5;",
      "  vec3 c;",
      "  if (uOn > 0.5) {",
      "    c = texture2D(map, vUv).rgb;",
      "    c *= smoothstep(1.08, 0.62, length(p - uOff * 0.9));",
      "    float post = step(0.55, abs(p.x)), postY = step(0.55, abs(p.y));",
      "    float ret = bar(abs(p.y), mix(0.004, 0.02, post), aa);",
      "    ret = max(ret, bar(abs(p.x), mix(0.004, 0.02, postY), aa));",
      "    vec2 qx = vec2(mod(p.x + 0.05, 0.1) - 0.05, p.y), qy = vec2(p.x, mod(p.y + 0.05, 0.1) - 0.05);",
      "    float dots = max(bar(length(qx), 0.011, aa) * step(abs(p.x), 0.52), bar(length(qy), 0.011, aa) * step(abs(p.y), 0.52));",
      "    c = mix(c, vec3(0.0), max(ret, dots));",
      "  } else {",
      "    c = vec3(0.012, 0.016, 0.022) + vec3(0.05, 0.06, 0.08) * smoothstep(0.2, 1.0, 1.0 - length(p - vec2(-0.35, 0.4)));",
      "  }",
      "  c *= smoothstep(1.0, 0.95, r);",
      "  gl_FragColor = vec4(c, 1.0);",
      "  #include <tonemapping_fragment>",
      "  #include <colorspace_fragment>",
      "}"].join("\n");
    var _eul = new THREE.Euler(), autoAim = { origin: new V(), dir: new V() };
    var mouseDown = false;
    renderer.domElement.addEventListener("mousedown", function (e) { if (e.button === 0 && document.pointerLockElement === renderer.domElement) mouseDown = true; });
    addEventListener("mouseup", function (e) { if (e.button === 0) { mouseDown = false; var g = desk && desk.heldGun && desk.heldGun(); if (g && g.setTrigger) g.setTrigger(0); } });
    addEventListener("keydown", function (e) { if (e.code !== "KeyV" || e.repeat || !desk || desk.mode !== "walk") return; var g = desk.heldGun && desk.heldGun(); if (g instanceof RangeGun) g.accessory(); });
    // the HUD names this gun's keys, not the old desk pistol's
    if (desk && desk.updateHud) {
      var updateHud = desk.updateHud.bind(desk);
      desk.updateHud = function () {
        updateHud();
        var g = this.heldGun && this.heldGun();
        if (g instanceof RangeGun && this.hud) { var t = g.status() + "   ·   " + g.keys; if (this.hud.textContent !== t) this.hud.textContent = t; }
      };
    }

    // ---------- spawning ----------
    var gen = 0, SLOTS = 6, MAXGUNS = 8;
    // the bench slot (0..5 along it) furthest from any gun lying there
    function freeSlot() {
      var best = 0, bestD = -1;
      for (var i = 0; i < SLOTS; i++) {
        var z = LANE.z - 0.75 + i * 0.3, dmin = 9;
        for (var j = 0; j < api.guns.length; j++) { var o = api.guns[j].object.position; if (Math.abs(o.x - LANE.x) < 0.4 && o.y > 0.8 && o.y < 1.4) dmin = Math.min(dmin, Math.abs(o.z - z)); }
        if (dmin > bestD + 0.01) { bestD = dmin; best = i; }
      }
      return { i: best, free: bestD > 0.14 };
    }
    function homePose(g, slot, high) {   // on the bench line, lying on its right side, muzzle down the lane
      var half = g.T.box.getSize(_v3).multiplyScalar(0.5);
      g.home.p.set(LANE.x + 0.05, 0.95 + half.x + 0.004 + (high ? 0.25 : 0), LANE.z - 0.75 + slot * 0.3);
      g.home.q.setFromEuler(_eul.set(0, Math.PI / 2, -Math.PI / 2, "YXZ"));
    }
    api.spawn = function (type) {
      if (!GUNS[type]) return Promise.reject(new Error("unknown gun " + type));
      if (window.__studioProps && window.__studioProps.full()) return Promise.resolve(null);
      if (api.guns.length >= MAXGUNS) { info("The bench holds " + MAXGUNS + " guns. Put some away first."); return Promise.resolve(null); }
      info("Bringing out the " + GUNS[type].label + "…");
      preload(GUNS[type].snd.fam, GUNS[type].snd.shot);
      var my = gen;
      return loadType(type).then(function (T) {
        if (my !== gen || api.guns.length >= MAXGUNS) return null;   // put away while it loaded
        var g = new RangeGun(type, T), b = T.box, half = b.getSize(new V()).multiplyScalar(0.5), ctr = b.getCenter(new V());
        var sl = freeSlot(); g.home = { p: new V(), q: new THREE.Quaternion(), slot: sl.i };
        homePose(g, sl.i, !sl.free);
        g.object.position.copy(g.home.p); g.object.quaternion.copy(g.home.q);
        try { renderer.compile(g.object, camera, scene); } catch (e) {}   // programs now, not on the first frame it shows
        scene.add(g.object); g.object.updateMatrixWorld(true);
        g.prop = P.addProp({ object: g.object, name: GUNS[type].label, mass: GUNS[type].mass, friction: 0.6, restitution: 0.1,
          shapes: [{ kind: "cuboid", size: [Math.max(0.008, half.x * 0.9), Math.max(0.01, half.y * 0.85), Math.max(0.02, half.z * 0.95)], offset: [ctr.x, ctr.y, ctr.z] }] });
        S.guns.push(g); api.guns.push(g);
        play("pickup" + (1 + Math.floor(Math.random() * 3)), g.object.position, { gain: 0.6 });
        info(g.label + " is on the bench (" + g.rounds + "+1, " + CART[g.d.cart].label + "). Pick it up (E or grip).");
        return g;
      }).catch(function (e) { console.error(e); if (log) log.error("Could not load the " + GUNS[type].label + ": " + (e && e.message || e)); return null; });
    };
    api.clearGuns = function () {
      var n = api.guns.length;
      api.guns.slice().forEach(function (g) {
        if (desk && desk.held && desk.held.prop === g.prop) desk.dropAll();
        if (XR && XR.hands) XR.hands.forEach(function (h) { if (h.held && h.held.prop === g.prop) { h.held = null; } if (h.supporting === g) h.supporting = null; });
        P.removeProp(g.prop); var i = S.guns.indexOf(g); if (i >= 0) S.guns.splice(i, 1);
      });
      api.guns.length = 0; gen++; clearCases(); deskScopeOff(); return n;
    };
    function isHeld(g) {
      if (desk && desk.held && desk.held.prop === g.prop) return true;
      return !!(XR && XR.hands && g.inHand());
    }
    // back to its bench slot (not one in a hand): "put the guns back", or one that fell out of the world
    function sendHome(g) {
      homePose(g, g.home.slot, false);
      P.teleport(g.prop, g.home.p, g.home.q); g.prop.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    api.returnGuns = function () {
      var n = 0;
      for (var i = 0; i < api.guns.length; i++) { var g = api.guns[i]; if (isHeld(g)) continue; var sl = freeSlotFor(g); g.home.slot = sl; sendHome(g); n++; }
      return n;
    };
    function freeSlotFor(g) {   // its own slot, unless another gun now lies there
      var mine = g.home.slot, taken = false;
      for (var j = 0; j < api.guns.length; j++) { var o = api.guns[j]; if (o !== g && o.home.slot === mine) taken = true; }
      if (!taken) return mine;
      for (var i = 0; i < SLOTS; i++) { var used = false; for (j = 0; j < api.guns.length; j++) if (api.guns[j] !== g && api.guns[j].home.slot === i) used = true; if (!used) return i; }
      return mine;
    }
    var recoverT = 0;
    function recover(dt) {   // twice a second: a gun below the world (or far off it) goes back to the bench
      recoverT += dt; if (recoverT < 0.5) return; recoverT = 0;
      for (var i = 0; i < api.guns.length; i++) {
        var g = api.guns[i], t = g.prop.body.translation();
        if (isHeld(g)) continue;
        if (!(t.y > floorY(t.x) - 1.5) || t.y > 60 || Math.abs(t.z) > 250 || t.x < -450 || t.x > 60) { sendHome(g); info(g.label + " fell out of the world: it is back on the bench."); }
      }
    }

    // ---------- the bench and the lane ----------
    var wood = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.8 }), steelM = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.55, metalness: 0.7 });
    (function bench() {
      var top = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 1.8), wood); top.position.set(LANE.x, 0.925, LANE.z); root.add(top);
      [-0.8, 0.8].forEach(function (dz) { var leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.05), steelM); leg.position.set(LANE.x, 0.45, LANE.z + dz); root.add(leg); });
      if (P.addStatic) P.addStatic({ center: new V(LANE.x, 0.925, LANE.z), half: new V(0.31, 0.025, 0.9) });
      if (desk && desk.walk && desk.walk.blockers) desk.walk.blockers.push(new THREE.Box2(new THREE.Vector2(LANE.x - 0.31, LANE.z - 0.9), new THREE.Vector2(LANE.x + 0.31, LANE.z + 0.9)));
    })();
    var groundCollider = null;
    function rangeGround() { if (groundCollider || !P.addStatic) return; groundCollider = P.addStatic({ center: new V(-212, -0.57, 0), half: new V(206.5, 0.5, 200) }); }

    // ---------- targets ----------
    var targets = [];
    var paperMat = function (c) { var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }); };
    function standLegs(g, h) { [-0.17, 0.17].forEach(function (x) { var l = new THREE.Mesh(new THREE.BoxGeometry(0.038, h, 0.019), wood); l.position.set(x, h / 2, -0.01); g.add(l); }); var f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.3), steelM); f.position.y = 0.01; g.add(f); }
    function place(g, dist, dz) { var x = LANE.x - dist, z = LANE.z + (dz || 0); g.position.set(x, floorY(x), z); g.rotation.y = Math.PI / 2; root.add(g); if (x < -5.3) rangeGround(); if (dist > 180 && camera.far < 420) { camera.far = 420; camera.updateProjectionMatrix(); } }
    // a 40 cm bullseye: rings 1-10 every 2 cm, 7-10 black; holes go into the paper
    function paper(dist, dz, yc) {
      var c = document.createElement("canvas"); c.width = c.height = 512; var x = c.getContext("2d");
      function rings() { x.fillStyle = "#f3efe4"; x.fillRect(0, 0, 512, 512); for (var r = 10; r >= 1; r--) { var R = r * 25.6 * 0.95; x.beginPath(); x.arc(256, 256, R, 0, 7); x.fillStyle = r <= 4 ? "#141414" : "#f3efe4"; x.fill(); x.strokeStyle = r <= 4 ? "#eee" : "#222"; x.lineWidth = 1.5; x.stroke(); } }
      rings();
      var g = new THREE.Group(), mat = paperMat(c), m = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), mat); m.position.y = yc; g.add(m); standLegs(g, yc + 0.2);
      var t = { kind: "paper", dist: dist, group: g, hitMesh: m, holes: 0, reset: function () { rings(); mat.map.needsUpdate = true; t.holes = 0; } };
      m.userData.onBulletHit = function (h) {
        var lp = m.worldToLocal(_v3.copy(h.point)), px = 256 + lp.x / 0.4 * 512, py = 256 - lp.y / 0.4 * 512, r = Math.hypot(lp.x, lp.y), ring = Math.max(0, 10 - Math.floor(r / 0.019));
        x.beginPath(); x.arc(px, py, CART[h.gun.d.cart].d / 0.4 * 512 / 2, 0, 7); x.fillStyle = "#050505"; x.fill(); mat.map.needsUpdate = true;
        t.holes++; stats.hits++; stats.points += ring;
        stats.last = "paper " + dist + " m: " + (ring ? ring : "miss the rings") + " · " + Math.round(h.time * 1000) + " ms · " + Math.round(h.speed) + " m/s";
        logHit(h.gun, "paper", h, ring); stats.log[0].dx = lp.x; stats.log[0].dy = lp.y;
        play(thudBuf(), h.point, { gain: 0.25, rate: 2.2 });
        return true;
      };
      place(g, dist, dz); targets.push(t); return t;
    }
    // AR500 plate hung on chains from a crossbar: it swings with the round's momentum and rings, heard d / 343 s later
    function steel(dist, dz, diam, base) {
      diam = diam || (dist <= 25 ? 0.2 : dist <= 100 ? 0.3 : 0.5);
      var g = new THREE.Group(), H = base + diam / 2, paint = new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.7, metalness: 0.1 });
      [-0.4, 0.4].forEach(function (x) { var p = new THREE.Mesh(new THREE.BoxGeometry(0.05, H + 0.2, 0.05), steelM); p.position.set(x, (H + 0.2) / 2, 0); g.add(p); });
      var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.85, 10), steelM); bar.rotation.z = Math.PI / 2; bar.position.y = H + 0.18; g.add(bar);
      var pivot = new THREE.Group(); pivot.position.y = H + 0.18; g.add(pivot);
      var L = 0.18 + diam / 2;
      [-diam * 0.3, diam * 0.3].forEach(function (x) { var ch = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 5), steelM); ch.position.set(x, -0.09, 0); pivot.add(ch); });
      var plate = new THREE.Mesh(new THREE.CylinderGeometry(diam / 2, diam / 2, 0.01, 32), paint); plate.rotation.x = Math.PI / 2; plate.position.y = -L; pivot.add(plate);
      var t = { kind: "steel", dist: dist, group: g, hitMesh: plate, th: 0, w: 0, tw: 0, ww: 0, pivot: pivot, L: L, mass: Math.PI * diam * diam / 4 * 0.01 * 7850,
        reset: function () { t.th = t.w = t.tw = t.ww = 0; } };
      plate.userData.onBulletHit = function (h) {
        var imp = h.mass * h.speed * 1.2;   // the bullet splashes back off hard steel: a little more than its momentum
        t.w += imp / (t.mass * t.L) * Math.sign(-h.dir.x || 1); t.ww += (Math.random() - 0.5) * imp / t.mass * 3;
        stats.hits++; stats.steel++; stats.last = "steel " + dist + " m · " + Math.round(h.time * 1000) + " ms · " + Math.round(h.speed) + " m/s";
        logHit(h.gun, "steel", h, -1);
        camera.updateMatrixWorld(); var dd = _v3.setFromMatrixPosition(camera.matrixWorld).distanceTo(h.point);
        play(ringBuf(), h.point, { delay: dd / SOUND, rate: Math.pow(0.3 / diam, 0.8), gain: 1.2, ref: 4, lowpass: Math.max(2500, 16000 - dd * 45), verb: 0.4 });
        dust(h.point, h.normal);
        return true;
      };
      place(g, dist, dz); targets.push(t); return t;
    }
    function stepTargets(dt) {
      for (var i = 0; i < targets.length; i++) {
        var t = targets[i]; if (t.kind !== "steel") continue;
        t.w += (-9.81 / t.L * Math.sin(t.th) - 0.6 * t.w) * dt; t.th += t.w * dt;
        if (t.th > 1.3 || t.th < -1.3) { t.th = Math.max(-1.3, Math.min(1.3, t.th)); t.w *= -0.3; }   // the chains go slack: it drops back
        t.ww += (-30 * t.tw - 1.5 * t.ww) * dt; t.tw += t.ww * dt;
        t.pivot.rotation.set(t.th, t.tw, 0);   // the group faces the bench; local x is across the lane
      }
    }
    api.setup = function () {
      api.clearTargets();
      // laid out so that from the lane (eye 1.5-1.7 m, 20 cm either side of its line) no target hides another and every line
      // passes the open middle pane: near ones low, far ones spread across the field (checked offline, 6 cm margin)
      paper(5, 0.3, 0.9); steel(10, -0.6, 0.2, 0.5); paper(10, 0.6, 1.0); steel(25, -0.8, 0.2, 0.95);
      steel(50, -2, 0.3, 1.25); steel(100, 3, 0.3, 1.1); steel(200, 6, 0.5, 1.5); steel(300, 14, 0.5, 1.2);
      refreshShootables(); stats.ver++;
      info("Range: bullseyes at 5 and 10 m, steel at 10, 25, 50, 100, 200 and 300 m, down the lane through the open window pane.");
      return targets.length;
    };
    api.clearTargets = function () { targets.forEach(function (t) { root.remove(t.group); }); targets.length = 0; stats.ver++; return 0; };
    api.resetTargets = function () {
      targets.forEach(function (t) { t.reset(); }); stats.shots = stats.hits = stats.points = stats.steel = 0; stats.last = ""; stats.log.length = 0; stats.ver++;
      stats.since = performance.now(); HOLES.forEach(function (m) { m.visible = false; }); clearCases();
    };
    api.score = function () {
      var acc = stats.shots ? Math.round(100 * stats.hits / stats.shots) : 0, min = Math.floor((performance.now() - stats.since) / 60000);
      return "Shots " + stats.shots + ", hits " + stats.hits + " (" + acc + "%), paper points " + stats.points + ", " + min + " min" + (stats.last ? ". Last: " + stats.last : "") + ".";
    };
    api.stats = stats; api.targets = targets;
    api.cards = function () {
      var list = api.types.map(function (t) { return { name: "range " + t.id, label: t.label, group: "Range", info: t.cart, tint: "#3b3d42", act: function () { api.spawn(t.id); } }; });
      list.push({ name: "range setup", label: "Set up targets", group: "Range", info: "paper + steel, 5-300 m", tint: "#6b5a3a", act: api.setup });
      list.push({ name: "range reset", label: "Reset targets", group: "Range", info: api.score().slice(0, 40), tint: "#4a4f5a", act: api.resetTargets });
      list.push({ name: "range return", label: "Guns back on the bench", group: "Range", info: api.guns.length + " out", tint: "#4a4f5a", act: api.returnGuns });
      list.push({ name: "range clear", label: "Put the guns away", group: "Range", info: api.guns.length + " out", tint: "#7a2a2a", act: api.clearGuns });
      return list;
    };

    // ---------- the computer's scope view: aiming the AWM fills the screen with the scope (its own fov, reticle overlay) ----------
    var DS = { on: false, gun: null, fov0: 70, el: null, label: null };
    function deskScopeBuild() {
      if (DS.el) return;
      var el = document.createElement("div");
      el.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:30;display:none;background:radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0, rgba(0,0,0,0) calc(45vmin - 3px), rgba(0,0,0,0.55) calc(45vmin - 1px), #000 45vmin)";
      var r = [], i;   // mil-dot reticle: thin cross inside, heavy posts outside, a dot every mil (10 % of the radius)
      r.push('<line x1="-100" y1="0" x2="100" y2="0" stroke="#000" stroke-width="0.35"/><line x1="0" y1="-100" x2="0" y2="100" stroke="#000" stroke-width="0.35"/>');
      r.push('<g stroke="#000" stroke-width="2.2"><line x1="-100" y1="0" x2="-55" y2="0"/><line x1="55" y1="0" x2="100" y2="0"/><line x1="0" y1="55" x2="0" y2="100"/><line x1="0" y1="-100" x2="0" y2="-55"/></g>');
      for (i = -5; i <= 5; i++) if (i) r.push('<circle cx="' + i * 10 + '" cy="0" r="1.05" fill="#000"/><circle cx="0" cy="' + i * 10 + '" r="1.05" fill="#000"/>');
      el.innerHTML = '<svg viewBox="-100 -100 200 200" style="position:absolute;left:50%;top:50%;width:90vmin;height:90vmin;transform:translate(-50%,-50%)">' + r.join("") + '</svg>' +
        '<div style="position:absolute;left:50%;top:calc(50% + 39vmin);transform:translateX(-50%);font:600 13px system-ui,sans-serif;color:rgba(230,230,220,0.75);letter-spacing:0.08em"></div>';
      document.body.appendChild(el); DS.el = el; DS.label = el.lastChild;
    }
    function deskScopeLabel(mag) { if (DS.label) DS.label.textContent = mag.toFixed(1) + "×  ·  wheel zoom"; }
    function deskScopeOn(g) {
      deskScopeBuild(); DS.on = true; DS.gun = g; DS.fov0 = camera.fov; g.hidden = true;
      DS.el.style.display = "block"; deskScopeLabel(g.scope.mag);
      if (desk && desk.crosshair) desk.crosshair.style.visibility = "hidden";
    }
    function deskScopeOff() {
      if (!DS.on) return;
      DS.on = false; if (DS.gun) DS.gun.hidden = false; DS.gun = null;
      camera.fov = DS.fov0; camera.updateProjectionMatrix();
      if (DS.el) DS.el.style.display = "none";
      if (desk && desk.crosshair) desk.crosshair.style.visibility = "";
    }
    function deskScopeTick() {
      var g = desk && desk.heldGun && desk.heldGun();
      var want = !!(g && g.scope && desk.ads && desk.mode === "walk" && desk.enabled && !renderer.xr.isPresenting && inRoom());
      if (want && DS.gun !== g) { deskScopeOff(); deskScopeOn(g); } else if (!want && DS.on) deskScopeOff();
      if (!DS.on) return;
      var f = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(DS.fov0) / 2) / g.scope.mag);
      f = THREE.MathUtils.radToDeg(f); if (Math.abs(camera.fov - f) > 1e-4) { camera.fov = f; camera.updateProjectionMatrix(); }
    }
    // the mouse turns the view as much on screen as without the scope (the engine turns 0.0022 rad a pixel)
    addEventListener("mousemove", function (e) {
      if (!DS.on || !desk || document.pointerLockElement !== renderer.domElement) return;
      var k = 1 - 1 / DS.gun.scope.mag;
      desk.yaw += e.movementX * 0.0022 * k; desk.pitch = Math.max(-1.45, Math.min(1.45, desk.pitch + e.movementY * 0.0022 * k));
    });
    addEventListener("pagehide", deskScopeOff);
    if (renderer.xr.addEventListener) renderer.xr.addEventListener("sessionstart", deskScopeOff);

    // ---------- scoreboard: a canvas board left of the lane, ahead of the bench, redrawn only when a shot or hit changes it ----------
    var board = (function () {
      var c = document.createElement("canvas"); c.width = 640; c.height = 400;
      var tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      var g = new THREE.Group(); g.name = "range-scoreboard";
      var face = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      var back = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.54, 0.03), steelM); back.position.z = -0.017;
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.26, 0.04), steelM); post.position.set(0, -0.9, -0.02);
      var foot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.3), steelM); foot.position.set(0, -1.46, -0.02);
      g.add(face, back, post, foot);
      g.position.set(LANE.x - 0.6, 1.47, LANE.z + 1.1); g.rotation.y = 2.31;   // left of the lane ahead of the bench, turned to the shooter
      face.raycast = back.raycast = post.raycast = foot.raycast = function () {};
      root.add(g);
      var ver = -1;
      function draw() {
        var x = c.getContext("2d"), acc = stats.shots ? Math.round(100 * stats.hits / stats.shots) : 0;
        x.fillStyle = "#14171b"; x.fillRect(0, 0, 640, 400);
        x.fillStyle = "#e9e4d6"; x.font = "800 34px system-ui, sans-serif"; x.textBaseline = "top"; x.fillText("RANGE", 24, 16);
        x.font = "500 22px system-ui, sans-serif"; x.fillStyle = "#9aa3ad"; x.textAlign = "right";
        x.fillText(targets.length ? "paper 5, 10 m · steel 10 – 300 m" : "say: set up the range", 616, 24); x.textAlign = "left";
        var cols = [["SHOTS", stats.shots], ["HITS", stats.hits], ["ACC", acc + "%"], ["STEEL", stats.steel], ["POINTS", stats.points]];
        for (var i = 0; i < cols.length; i++) {
          var cx = 24 + i * 122; x.fillStyle = "#7c8590"; x.font = "700 18px system-ui, sans-serif"; x.fillText(cols[i][0], cx, 66);
          x.fillStyle = "#f1ede2"; x.font = "800 44px system-ui, sans-serif"; x.fillText(String(cols[i][1]), cx, 88);
        }
        x.fillStyle = "#2a2f36"; x.fillRect(24, 146, 592, 2);
        x.font = "700 18px system-ui, sans-serif"; x.fillStyle = "#7c8590"; x.fillText("LAST HITS", 24, 158);
        if (!stats.log.length) { x.fillStyle = "#59616b"; x.font = "500 24px system-ui, sans-serif"; x.fillText("No hits yet.", 24, 190); }
        for (i = 0; i < Math.min(5, stats.log.length); i++) {
          var L = stats.log[i], y = 186 + i * 42;
          x.font = "800 26px system-ui, sans-serif"; x.fillStyle = L.what === "steel" ? "#e8e6df" : "#f3d27a";
          x.fillText(L.what === "steel" ? "STEEL" : L.ring ? "RING " + L.ring : "PAPER", 24, y);
          x.font = "600 24px system-ui, sans-serif"; x.fillStyle = i ? "#a7afb8" : "#f1ede2";
          x.fillText(L.dist + " m", 160, y); x.fillText(L.gun, 250, y);
          x.textAlign = "right"; x.fillText(Math.round(L.tof * 1000) + " ms · " + Math.round(L.v) + " m/s", 616, y); x.textAlign = "left";
        }
        tex.needsUpdate = true;
      }
      return { group: g, tick: function () { if (ver !== stats.ver) { ver = stats.ver; draw(); } } };
    })();

    // a gun in the computer's hand follows the view; pointed at the bench or a wall it used to jam there until the engine
    // let go of it (hold error > 0.45 m). While held there it passes through the room (it still pushes props).
    var GROUPS_PROP = (2 << 16) | 3, GROUPS_HELD = (2 << 16) | 2;
    function ghost(g, on) {
      if (!!g.ghost === on || !g.prop) return;
      g.ghost = on; var b = g.prop.body;
      for (var i = 0; i < b.numColliders(); i++) b.collider(i).setCollisionGroups(on ? GROUPS_HELD : GROUPS_PROP);
    }
    // aiming a rifle moves its hold target 0.40-0.45 m (hip to cheek) in one frame, which read as "stuck" and dropped it;
    // a ghosted gun cannot be stuck on the room, so only a gun really lost (1.5 m) counts
    if (P.holdError) {
      var holdError0 = P.holdError.bind(P);
      P.holdError = function (prop) {
        var e = holdError0(prop);
        if (e > 0.4 && e < 1.5) for (var i = 0; i < api.guns.length; i++) if (api.guns[i].prop === prop && api.guns[i].ghost) return 0;
        return e;
      };
    }

    // ---------- per frame (rides in S.guns: runs while the room plays, after the physics step) ----------
    function inRoom() { var r = window.__rally; return !(r && r.mode && r.mode !== "room"); }
    S.guns.push({
      owns: function () { return false; },
      update: function (dt) {
        var show = inRoom(); root.visible = show;
        deskScopeTick();
        for (var i = 0; i < api.guns.length; i++) { var g = api.guns[i]; g.object.visible = show && !g.hidden; ghost(g, !!(desk && desk.held && desk.held.prop === g.prop) && !renderer.xr.isPresenting); }
        updateListener();
        stepBullets(dt); stepCases(dt); stepPuffs(dt); stepTargets(dt);
        recover(dt); board.tick();
      }
    });
    try { renderer.compile(root, camera, scene); } catch (e) {}   // bench, board, casings, holes, dust: compiled now

    // ---------- commands ----------
    var GUNWORD = { glock: "g17", "glock 17": "g17", pistol: "g17", "1911": "m1911", m1911: "m1911", colt: "m1911", akm: "akmn", ak: "akmn", ak47: "akmn", "ak-47": "akmn", kalashnikov: "akmn",
      m4: "m4a1s", m4a1: "m4a1s", "m4a1-s": "m4a1s", carbine: "m4a1s", awm: "awp", awp: "awp", sniper: "awp", "sniper rifle": "awp" };
    (function commands() {
      var C = window.__studioCommands;
      if (!C || !C.ready) { setTimeout(commands, 500); return; }
      C.handle("spawn_gun", function (a) { var t = GUNWORD[String(a.gun || "").trim()]; if (!t) return { error: "I know the Glock 17, M1911, AKM, M4A1-S and AWM." }; return { act: function () { api.spawn(t); }, vars: { gun: GUNS[t].label } }; });
      C.handle("range_setup", function () { return { act: function () { return { count: api.setup() }; } }; });
      C.handle("reset_targets", function () { return { act: function () { api.resetTargets(); } }; });
      C.handle("score", function () { return { act: function () { return { score: api.score() }; } }; });
      C.handle("clear_guns", function () { return { act: function () { return { count: api.clearGuns() }; } }; });
      C.handle("return_guns", function () { return { act: function () { return { count: api.returnGuns() }; } }; });
      api.commands = true;
    })();
    api.ready = true;
    info("Range ready: " + api.types.map(function (t) { return t.label; }).join(", ") + ". Props app > Range, or say: spawn the AKM, set up the range.");
  });
})();
