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
//   Not built yet (gated off): magazines as separate props (VR mag change by hand), VR racking by grabbing the slide,
//           casings, clays and birds, the wall rack and the scoreboard board.
// API: window.__studioRange = { ready, types, spawn(type) -> Promise<gun>, clearGuns(), setup(), resetTargets(), score(), cards() }.
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
      targets.forEach(function (t) { shootables.push(t.hitMesh); });
      var EN = window.__studioEnemies;
      if (EN && EN.list) EN.list.forEach(function (e) { if (e.root.visible) e.proxies.forEach(function (m) { shootables.push(m); }); });
    }
    function fireBullet(gun, origin, dir) {
      var b = null; for (var i = 0; i < NB; i++) if (!BULLETS[i].on) { b = BULLETS[i]; break; }
      if (!b) b = BULLETS[0];
      b.on = true; b.c = CART[gun.d.cart]; b.gun = gun; b.t = 0; b.travelled = 0;
      b.p.copy(origin); b.v.copy(dir).multiplyScalar(b.c.v);
      stats.shots++;
    }
    function stepBullets(dt) {
      var any = false;
      refreshShootables();
      for (var i = 0; i < NB; i++) {
        var b = BULLETS[i]; if (!b.on) continue; any = true;
        b.p0.copy(b.p);
        for (var s = 0; s < 4; s++) {   // drag + gravity, 4 sub-steps a frame
          var h = dt / 4, sp = b.v.length(), k = dragK(b.c, sp) * sp;
          b.v.x -= k * b.v.x * h; b.v.y -= (k * b.v.y + 9.81) * h; b.v.z -= k * b.v.z * h;
          b.p.addScaledVector(b.v, h);
        }
        b.t += dt;
        _v.copy(b.p).sub(b.p0); var len = _v.length(); if (len < 1e-6) continue; _v.divideScalar(len);
        var hit = traceSegment(b, b.p0, _v, len);
        b.travelled += hit ? hit.d : len;
        if (hit || b.t > 3 || b.p.y < -3 || b.travelled > 900) b.on = false;
      }
      return any;
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
      hitInfo.point.copy(o).addScaledVector(dir, bestD); hitInfo.dir.copy(dir); hitInfo.speed = b.v.length(); hitInfo.mass = b.c.m;
      hitInfo.time = b.t; hitInfo.distance = b.travelled + bestD; hitInfo.gun = b.gun;
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
        var c = CART[d.cart], eye = hold(d, d.eye);
        if (d.scope) {   // AWM: the sight line is the scope axis (the rear cluster of its glass)
          var y0 = Infinity, y1 = -Infinity, zMax = -Infinity;
          parts.body.forEach(function (p) { if (p.name.indexOf("glass") !== 0) return; var A = p.g.attributes.position; for (var i = 0; i < A.count; i++) { var z = A.getZ(i); if (z > hold(d, [0, 0, -0.08]).z) { y0 = Math.min(y0, A.getY(i)); y1 = Math.max(y1, A.getY(i)); zMax = Math.max(zMax, z); } } });
          if (isFinite(zMax)) eye.set(0, (y0 + y1) / 2, zMax + 0.085);
        }
        var bore = hold(d, [0, 0, 0]);
        return { d: d, parts: parts, box: box, muzzle: hold(d, d.muzzle), eye: eye, eject: hold(d, d.eject), support: d.support ? hold(d, d.support) : null,
          bore: bore, zero: zeroAngle(c, eye.y - bore.y, d.zero) };
      }));
    }

    // ---------- the gun controller (the bundle's held-gun interface) ----------
    var stats = { shots: 0, hits: 0, points: 0, lastFlight: 0, lastSpeed: 0, last: "", since: performance.now() };
    function RangeGun(type, T) {
      var d = GUNS[type]; this.type = type; this.d = d; this.T = T; this.label = d.label; this.twoHanded = !!T.support;
      var obj = new THREE.Group(); obj.name = "range-gun-" + type;
      function meshes(list, parent) { list.forEach(function (p) { var m = new THREE.Mesh(p.g, p.m); m.castShadow = false; m.receiveShadow = true; parent.add(m); }); }
      meshes(T.parts.body, obj);
      this.slide = new THREE.Group(); meshes(T.parts.slide, this.slide); obj.add(this.slide);
      this.magG = new THREE.Group(); meshes(T.parts.mag, this.magG); obj.add(this.magG);
      this.flash = new THREE.Sprite(flashMat); this.flash.position.copy(T.muzzle).add(_v.set(0, 0, -0.03)); this.flash.visible = false; this.flash.raycast = function () {}; obj.add(this.flash);
      this.object = obj; this.rounds = d.cap; this.hasMag = true; this.chamber = true; this.locked = false; this.mode = d.modes ? d.modes[0] : "semi";
      this.slideOff = 0; this.cycleT = 1; this.task = null; this.trigger = 0; this.held = false; this.nextShot = 0; this.flashT = 0; this.needsCycle = false;
      this.rec = { z: 0, vz: 0, p: 0, vp: 0, y: 0, vy: 0 }; this.recM = new THREE.Matrix4();
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
        var d = this.d, now = performance.now();
        if (now < this.nextShot) return null;
        if (!this.chamber || this.locked || this.needsCycle || this.task) { play("dry" + (1 + Math.floor(Math.random() * 3)), this.world(this.T.bore, _v3), { gain: 0.5, verb: 0.05 }); return "click"; }
        this.object.updateMatrixWorld();
        var o = _v.copy(this.T.muzzle).applyMatrix4(this.object.matrixWorld), dir = _v2;
        if (aim && aim.dir) {
          // hip fire on a computer: from the muzzle toward the point under the crosshair, with a hand's worth of scatter
          var far = 40; try { var rr = P.world.castRay({ origin: aim.origin, dir: aim.dir }, 300, true, undefined, undefined, undefined, this.prop.body); if (rr) far = rr.timeOfImpact; } catch (e) {}
          dir.copy(aim.origin).addScaledVector(aim.dir, far).sub(o).normalize();
          dir.x += (Math.random() - 0.5) * 0.02; dir.y += (Math.random() - 0.5) * 0.02; dir.z += (Math.random() - 0.5) * 0.02; dir.normalize();
        } else dir.set(0, Math.sin(this.T.zero), -Math.cos(this.T.zero)).transformDirection(this.object.matrixWorld);
        fireBullet(this, o, dir);
        var c = CART[d.cart];
        // the next round: self-loaders feed from the magazine, the AWM leaves the case in the chamber for the bolt
        this.chamber = false;
        if (d.action === "bolt") this.needsCycle = true;
        else if (this.hasMag && this.rounds > 0) { this.rounds--; this.chamber = true; this.cycleT = 0; }
        else { this.cycleT = 0; if (d.action !== "recip") this.locked = true; }   // the AKM's bolt closes on an empty magazine
        this.nextShot = now + (d.rpm ? 60000 / d.rpm : 90);
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
          if (self.locked) setTimeout(function () { self.release(); }, 180);
          else if (!self.chamber && d.action !== "bolt") setTimeout(function () { self.cycle(); }, 200);
          else if (d.action === "bolt" && !self.chamber) setTimeout(function () { self.cycle(); }, 200);
        } };
      },
      status: function () {
        var m = this.hasMag ? this.rounds + (this.chamber ? "+1" : "") : "no magazine" + (this.chamber ? ", 1 chambered" : "");
        return this.label + " · " + CART[this.d.cart].label + ": " + m + (this.locked ? " · slide locked back" : this.needsCycle ? " · work the bolt" : "") + (this.d.modes ? " · " + this.mode : "") + "   ·   hits " + stats.hits + "/" + stats.shots;
      },
      zoom: null,
      eyePoint: function () { return this.T.eye.clone(); },
      forendPoint: function () { return this.T.support; },
      recoilMatrix: function (out) { out = out || new THREE.Matrix4(); var r = this.rec; return out.makeRotationFromEuler(_eul.set(r.p, r.y, 0)).setPosition(0, r.p * 0.02, r.z); },
      update: function (dt) {
        var r = this.rec, d = this.d;
        // the hand's spring back to the grip (critically damped), position and climb
        r.vz += (-420 * r.z - 40 * r.vz) * dt; r.z += r.vz * dt;
        r.vp += (-300 * r.p - 32 * r.vp) * dt; r.p += r.vp * dt;
        r.vy += (-300 * r.y - 32 * r.vy) * dt; r.y += r.vy * dt;
        if (this.kickBack > 0 && desk) { var k = Math.min(this.kickBack, this.kickBack * dt * 9); desk.pitch -= k; this.kickBack -= k; }
        if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
        if (this.task) { var t = this.task; t.t += dt; if (t.anim) t.anim(t.t / t.dur); if (t.t >= t.dur) { this.task = null; t.end(); } }
        else if (this.locked) this.slideOff = d.travel;
        else if (this.cycleT < 1) { this.cycleT = Math.min(1, this.cycleT + dt / 0.06); if (d.action !== "handle" && d.action !== "bolt") this.slideOff = d.travel * Math.sin(Math.PI * this.cycleT); }
        else if (!this.task) this.slideOff = 0;
        this.slide.position.z = this.slideOff;
        // full auto: keep firing while the trigger is held (VR trigger value, or the desktop button)
        var held = renderer.xr.isPresenting ? this.trigger > 0.55 : mouseDown && desk && desk.heldGun && desk.heldGun() === this;
        if (this.mode === "auto" && held && this.trigDown !== false && performance.now() >= this.nextShot && this.chamber) {
          var aim = !renderer.xr.isPresenting && !desk.ads ? { origin: camera.position.clone(), dir: new V(0, 0, -1).applyQuaternion(camera.quaternion) } : null;
          if (this.fire(aim) === "fired" && renderer.xr.isPresenting && XR) { var self = this; XR.hands.forEach(function (h) { if (h.held && h.held.prop === self.prop) XR.pulse(h, 0.9, 45); }); }
        }
      }
    };
    var _eul = new THREE.Euler();
    var mouseDown = false;
    renderer.domElement.addEventListener("mousedown", function (e) { if (e.button === 0) mouseDown = true; });
    addEventListener("mouseup", function (e) { if (e.button === 0) { mouseDown = false; var g = desk && desk.heldGun && desk.heldGun(); if (g && g.setTrigger) g.setTrigger(0); } });
    addEventListener("keydown", function (e) { if (e.code !== "KeyV" || e.repeat || !desk || desk.mode !== "walk") return; var g = desk.heldGun && desk.heldGun(); if (g instanceof RangeGun) g.accessory(); });
    // the HUD names this gun's keys, not the old desk pistol's
    if (desk && desk.updateHud) {
      var updateHud = desk.updateHud.bind(desk);
      desk.updateHud = function () {
        updateHud();
        var g = this.heldGun && this.heldGun();
        if (g instanceof RangeGun && this.hud) { var t = g.status() + "   ·   click fire · right mouse aim · R reload · F rack · V selector"; if (this.hud.textContent !== t) this.hud.textContent = t; }
      };
    }

    // ---------- spawning ----------
    var benchCount = 0;
    api.spawn = function (type) {
      if (!GUNS[type]) return Promise.reject(new Error("unknown gun " + type));
      if (window.__studioProps && window.__studioProps.full()) return Promise.resolve(null);
      info("Bringing out the " + GUNS[type].label + "…");
      preload(GUNS[type].snd.fam, GUNS[type].snd.shot);
      return loadType(type).then(function (T) {
        var g = new RangeGun(type, T), b = T.box, half = b.getSize(new V()).multiplyScalar(0.5), ctr = b.getCenter(new V());
        // on the bench line, lying on its right side
        var i = benchCount++ % 6;
        g.object.position.set(LANE.x + 0.05, 0.95 + half.x, LANE.z - 0.75 + i * 0.3);
        g.object.quaternion.setFromEuler(_eul.set(0, Math.PI / 2, -Math.PI / 2, "YXZ"));
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
      api.guns.length = 0; benchCount = 0; return n;
    };

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
    function paper(dist, dz) {
      var c = document.createElement("canvas"); c.width = c.height = 512; var x = c.getContext("2d");
      function rings() { x.fillStyle = "#f3efe4"; x.fillRect(0, 0, 512, 512); for (var r = 10; r >= 1; r--) { var R = r * 25.6 * 0.95; x.beginPath(); x.arc(256, 256, R, 0, 7); x.fillStyle = r <= 4 ? "#141414" : "#f3efe4"; x.fill(); x.strokeStyle = r <= 4 ? "#eee" : "#222"; x.lineWidth = 1.5; x.stroke(); } }
      rings();
      var g = new THREE.Group(), mat = paperMat(c), m = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), mat); m.position.y = 1.35; g.add(m); standLegs(g, 1.55);
      var t = { kind: "paper", dist: dist, group: g, hitMesh: m, holes: 0, reset: function () { rings(); mat.map.needsUpdate = true; t.holes = 0; } };
      m.userData.onBulletHit = function (h) {
        var lp = m.worldToLocal(_v3.copy(h.point)), px = 256 + lp.x / 0.4 * 512, py = 256 - lp.y / 0.4 * 512, r = Math.hypot(lp.x, lp.y), ring = Math.max(0, 10 - Math.floor(r / 0.019));
        x.beginPath(); x.arc(px, py, CART[h.gun.d.cart].d / 0.4 * 512 / 2, 0, 7); x.fillStyle = "#050505"; x.fill(); mat.map.needsUpdate = true;
        t.holes++; stats.hits++; stats.points += ring;
        stats.last = "paper " + dist + " m: " + (ring ? ring : "miss the rings") + " · " + Math.round(h.time * 1000) + " ms · " + Math.round(h.speed) + " m/s";
        play(thudBuf(), h.point, { gain: 0.25, rate: 2.2 });
        return true;
      };
      place(g, dist, dz); targets.push(t); return t;
    }
    // AR500 plate hung on chains from a crossbar: it swings with the round's momentum and rings, heard d / 343 s later
    function steel(dist, dz, diam) {
      diam = diam || (dist <= 25 ? 0.2 : dist <= 100 ? 0.3 : 0.5);
      var g = new THREE.Group(), H = 1.25 + diam / 2, paint = new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.7, metalness: 0.1 });
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
        stats.hits++; stats.last = "steel " + dist + " m · " + Math.round(h.time * 1000) + " ms · " + Math.round(h.speed) + " m/s";
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
        t.ww += (-30 * t.tw - 1.5 * t.ww) * dt; t.tw += t.ww * dt;
        t.pivot.rotation.set(t.th, t.tw, 0);   // the group faces the bench; local x is across the lane
      }
    }
    api.setup = function () {
      api.clearTargets();
      paper(5, 0); steel(10, -0.6); paper(10, 0.6); steel(25, 0); steel(50, -2); steel(100, 3); steel(200, -6); steel(300, 8);
      refreshShootables();
      info("Range: bullseyes at 5 and 10 m, steel at 10, 25, 50, 100, 200 and 300 m, down the lane through the open window pane.");
      return targets.length;
    };
    api.clearTargets = function () { targets.forEach(function (t) { root.remove(t.group); }); targets.length = 0; return 0; };
    api.resetTargets = function () { targets.forEach(function (t) { t.reset(); }); stats.shots = stats.hits = stats.points = 0; stats.last = ""; stats.since = performance.now(); HOLES.forEach(function (m) { m.visible = false; }); };
    api.score = function () {
      var acc = stats.shots ? Math.round(100 * stats.hits / stats.shots) : 0, min = Math.floor((performance.now() - stats.since) / 60000);
      return "Shots " + stats.shots + ", hits " + stats.hits + " (" + acc + "%), paper points " + stats.points + ", " + min + " min" + (stats.last ? ". Last: " + stats.last : "") + ".";
    };
    api.stats = stats;
    api.cards = function () {
      var list = api.types.map(function (t) { return { name: "range " + t.id, label: t.label, group: "Range", info: t.cart, tint: "#3b3d42", act: function () { api.spawn(t.id); } }; });
      list.push({ name: "range setup", label: "Set up targets", group: "Range", info: "paper + steel, 5-300 m", tint: "#6b5a3a", act: api.setup });
      list.push({ name: "range reset", label: "Reset targets", group: "Range", info: api.score().slice(0, 40), tint: "#4a4f5a", act: api.resetTargets });
      list.push({ name: "range clear", label: "Put the guns away", group: "Range", info: api.guns.length + " out", tint: "#7a2a2a", act: api.clearGuns });
      return list;
    };

    // ---------- per frame (rides in S.guns: runs while the room plays, after the physics step) ----------
    function inRoom() { var r = window.__rally; return !(r && r.mode && r.mode !== "room"); }
    S.guns.push({
      owns: function () { return false; },
      update: function (dt) {
        var show = inRoom(); root.visible = show;
        api.guns.forEach(function (g) { g.object.visible = show; });
        updateListener();
        stepBullets(dt); stepPuffs(dt); stepTargets(dt);
      }
    });

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
    })();
    api.ready = true;
    info("Range ready: " + api.types.map(function (t) { return t.label; }).join(", ") + ". Props app > Range, or say: spawn the AKM, set up the range.");
  });
})();
