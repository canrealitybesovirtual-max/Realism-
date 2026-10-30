// Pistol attachments for the desk P38 (props in the library, group "Armory").
// Suppressor, laser module, weapon light (both on a barrel-clamp Picatinny mount), micro red dot on the slide,
// and a +3 magazine extension. Every part is modelled to scale from the pistol's own measurements (barrel
// 14.4 mm at the muzzle, bore axis 67 mm above the grip origin, slide top at 74.5 mm, grip base at -50 mm),
// with machined chamfers, knurling, Picatinny slots, screws, engraving and real materials.
// Fit one by letting go of it next to its place on the pistol (a blue ghost shows where it goes), or say
// "attach the suppressor". Each fit and removal is one Undo step; the fitted set is remembered.
// They work: the suppressor lowers the report and the flash, the laser puts a dot where it points, the light
// lights the room, the red dot shows a dot through its window only, the extension holds 11 rounds.
// L on the keyboard, or B / Y in VR, switches the laser and light.
(function () {
  "use strict";
  window.__studioArmoryPending = true;
  var BORE_Y = 0.067, MUZZLE_Z = -0.172, SLIDE_TOP = 0.0745, GRIP_BASE = -0.050, MAG_Z = 0.012;
  var RAIL_Y = 0.0506, RAIL_FACE = RAIL_Y - 0.0094, RAIL_Z0 = -0.104, RAIL_Z1 = -0.166;
  var KEYS = ["suppressor", "laser", "light", "reddot", "extmag"];
  var PROP_OF = { suppressor: "suppressor", laser: "pistol laser", light: "pistol light", reddot: "red dot sight", extmag: "extended magazine" };
  var KEY_OF = {}; for (var k in PROP_OF) KEY_OF[PROP_OF[k]] = k;
  var NAME = { suppressor: "suppressor", laser: "laser", light: "weapon light", reddot: "red dot sight", extmag: "magazine extension" };
  var ALIAS = { suppressor: "suppressor", silencer: "suppressor", laser: "laser", "laser sight": "laser", light: "light", flashlight: "light", "weapon light": "light",
    "red dot": "reddot", "red dot sight": "reddot", "reflex sight": "reddot", "extended magazine": "extmag", "extended mag": "extmag", magazine: "extmag" };
  var MOUNT = { suppressor: [0, BORE_Y, MUZZLE_Z - 0.08], laser: [0, 0.03, -0.15], light: [0, 0.02, -0.14], reddot: [0, 0.087, -0.052], extmag: [0, -0.062, MAG_Z] };

  var THREE, M = {}, TX = {};

  // ---------- textures (generated once, small, tiling) ----------
  function cnv(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h || w; return c; }
  function rng(seed) { var a = seed >>> 0; return function () { a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // height field (0..1 per pixel) -> tangent-space normal map
  function normalTex(size, height, strength, rep) {
    var c = cnv(size), x = c.getContext("2d"), img = x.createImageData(size, size), H = new Float32Array(size * size), i, j;
    for (j = 0; j < size; j++) for (i = 0; i < size; i++) H[j * size + i] = height(i, j);
    function h(i, j) { return H[((j + size) % size) * size + ((i + size) % size)]; }
    for (j = 0; j < size; j++) for (i = 0; i < size; i++) {
      var dx = (h(i + 1, j) - h(i - 1, j)) * strength, dy = (h(i, j + 1) - h(i, j - 1)) * strength, l = Math.sqrt(dx * dx + dy * dy + 1), o = (j * size + i) * 4;
      img.data[o] = (-dx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 4; return t;
  }
  function smoothNoise(size, cell, seed) {
    var r = rng(seed), n = Math.ceil(size / cell), g = []; for (var i = 0; i < n * n; i++) g.push(r());
    return function (x, y) {
      var fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      function G(a, b) { return g[((b + n) % n) * n + ((a + n) % n)]; }
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      return (G(x0, y0) * (1 - tx) + G(x0 + 1, y0) * tx) * (1 - ty) + (G(x0, y0 + 1) * (1 - tx) + G(x0 + 1, y0 + 1) * tx) * ty;
    };
  }
  function textures() {
    if (TX.ready) return TX;
    var r = rng(7), grain = smoothNoise(256, 2, 3), mott = smoothNoise(256, 32, 9);
    // cerakote / anodizing: fine grit with a slow mottle
    TX.coat = normalTex(256, function (x, y) { return grain(x, y) * 0.6 + mott(x, y) * 0.4; }, 2.2, [3, 3]);
    // diamond knurl, 24 lines per tile
    TX.knurl = normalTex(256, function (x, y) { var a = (x + y) / 256 * 24 * Math.PI, b = (x - y) / 256 * 24 * Math.PI; return Math.min(Math.abs(Math.sin(a)), Math.abs(Math.sin(b))); }, 5, [6, 1]);
    // polymer stipple
    var dots = []; for (var i = 0; i < 900; i++) dots.push([r() * 256, r() * 256, 1.2 + r() * 2.2]);
    var st = new Float32Array(256 * 256);
    dots.forEach(function (d) { for (var y = -4; y <= 4; y++) for (var x = -4; x <= 4; x++) { var px = Math.round(d[0] + x), py = Math.round(d[1] + y), q = Math.max(0, 1 - Math.sqrt(x * x + y * y) / d[2]); var o = ((py + 256) % 256) * 256 + (px + 256) % 256; st[o] = Math.max(st[o], q); } });
    TX.stipple = normalTex(256, function (x, y) { return st[y * 256 + x] * 0.8 + grain(x, y) * 0.2; }, 3, [2, 2]);
    // fine circumferential machining lines (lathe-turned faces)
    TX.turned = normalTex(256, function (x, y) { return 0.5 + 0.5 * Math.sin(y / 256 * 180 * Math.PI) * (0.6 + 0.4 * grain(x, y)); }, 1.2, [1, 1]);
    TX.ready = true; return TX;
  }
  // laser engraving on the suppressor tube: u = around, v = along (rear at v=0)
  function engraveTex() {
    var c = cnv(1024, 512), x = c.getContext("2d");
    x.fillStyle = "#1f2023"; x.fillRect(0, 0, 1024, 512);
    x.save(); x.translate(256 + 30, 256); x.rotate(-Math.PI / 2); // text runs along the tube
    x.fillStyle = "#6b6e73"; x.font = "600 30px Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("9mm  ·  1/2x28", 0, -22); x.font = "500 22px Arial, sans-serif"; x.fillText("SN 7C41-0193", 0, 18);
    x.restore();
    x.save(); x.translate(768 - 30, 256); x.rotate(-Math.PI / 2); x.fillStyle = "#6b6e73"; x.font = "700 34px Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("STUDIO ARMS · S9", 0, 0); x.restore();
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  function labelTex(lines, w, h, ink, bg) {
    var c = cnv(w, h), x = c.getContext("2d"); x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.fillStyle = ink; x.textAlign = "center"; x.textBaseline = "middle";
    lines.forEach(function (l, i) { x.font = l[1]; x.fillText(l[0], w / 2, h * (i + 1) / (lines.length + 1)); });
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }

  // ---------- materials ----------
  function mats() {
    if (M.ready) return M;
    var T = textures(), S = THREE.MeshStandardMaterial;
    function std(o, nm, ns) { var m = new S(o); if (nm) { m.normalMap = nm; m.normalScale = new THREE.Vector2(ns, ns); } m.name = o.name; return m; }
    M.cerakote = std({ name: "armory-cerakote", color: 0x1e1f22, roughness: 0.62, metalness: 0.3 }, T.coat, 0.35);
    M.cerakoteKnurl = std({ name: "armory-knurl", color: 0x1b1c1f, roughness: 0.55, metalness: 0.35 }, T.knurl, 0.9);
    M.anodized = std({ name: "armory-anodized", color: 0x161719, roughness: 0.4, metalness: 0.7 }, T.coat, 0.2);
    M.turned = std({ name: "armory-turned", color: 0x2a2b2e, roughness: 0.35, metalness: 0.8 }, T.turned, 0.4);
    M.polymer = std({ name: "armory-polymer", color: 0x222326, roughness: 0.74, metalness: 0.02 }, T.stipple, 0.55);
    M.rubber = std({ name: "armory-rubber", color: 0x121212, roughness: 0.92, metalness: 0 }, T.stipple, 0.3);
    M.steel = std({ name: "armory-screw", color: 0x8f9297, roughness: 0.32, metalness: 0.95 });
    M.blackSteel = std({ name: "armory-black-screw", color: 0x1a1a1b, roughness: 0.38, metalness: 0.9 });
    M.bore = new S({ name: "armory-bore", color: 0x040404, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    M.chrome = new S({ name: "armory-reflector", color: 0xdfe3e8, roughness: 0.06, metalness: 1 });
    M.glass = new S({ name: "armory-lens-glass", color: 0xbfd6e0, roughness: 0.03, metalness: 0.9, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 });
    M.coated = new S({ name: "armory-lens-coated", color: 0x6fd6c8, roughness: 0.02, metalness: 0.95, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.8 });
    M.laserLens = new S({ name: "armory-laser-lens", color: 0x2a0303, emissive: 0xff1608, emissiveIntensity: 0.25, roughness: 0.08, metalness: 0.4 });
    M.led = new S({ name: "armory-led", color: 0xfff6e2, emissive: 0xfff2d8, emissiveIntensity: 0, roughness: 0.3, metalness: 0 });
    M.tube = std({ name: "armory-tube", color: 0xffffff, roughness: 0.6, metalness: 0.3, map: engraveTex() }, T.coat, 0.3);
    M.ghost = new THREE.MeshBasicMaterial({ name: "armory-ghost", color: 0x5fb8ff, transparent: true, opacity: 0.32, depthWrite: false });
    M.ready = true; return M;
  }

  // ---------- geometry helpers ----------
  // lathe around the bore axis: pts = [[radius, forward distance]], returned along -z from z0
  function lathe(pts, seg, z0) {
    var g = new THREE.LatheGeometry(pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), seg || 64);
    g.rotateX(-Math.PI / 2); g.translate(0, 0, z0 || 0); return g;
  }
  function tube(r, len, seg, open) { var g = new THREE.CylinderGeometry(r, r, len, seg || 64, 1, open !== false); g.rotateX(-Math.PI / 2); return g; }
  function rrect(w, h, r) {
    var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  }
  // a block with rounded corners (in x-y) and chamfered/bevelled edges, depth along z, centred
  function block(w, h, d, r, bevel) {
    bevel = bevel === undefined ? Math.min(w, h, d) * 0.06 : bevel;
    var g = new THREE.ExtrudeGeometry(rrect(w - 2 * bevel, h - 2 * bevel, Math.max(0.0002, r - bevel)), { depth: d - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -(d - 2 * bevel) / 2); boxUV(g, 120); return g;
  }
  function boxUV(g, k) { // world-ish planar uv so tiling normal maps keep their scale
    g.computeVertexNormals(); var p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
    for (var i = 0; i < p.count; i++) { var ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), u, v;
      if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
      uv[i * 2] = u * k; uv[i * 2 + 1] = v * k; }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); return g;
  }
  // a profile in (x, y) extruded along -z from z0 to z1
  function prism(pts, z0, z1, bevel) {
    var s = new THREE.Shape(); pts.forEach(function (p, i) { if (i) s.lineTo(p[0], p[1]); else s.moveTo(p[0], p[1]); });
    var b = bevel || 0, g = new THREE.ExtrudeGeometry(s, { depth: Math.abs(z1 - z0) - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1 });
    g.translate(0, 0, Math.min(z0, z1) + b); boxUV(g, 120); return g;
  }
  function mesh(g, m, x, y, z) { var o = new THREE.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; o.receiveShadow = true; return o; }
  // a socket-head cap screw seen end-on: head facing +axis
  function capScrew(r, h, axis) {
    var g = new THREE.Group(), head = mesh(lathe([[0, 0], [r, 0], [r, h * 0.8], [r * 0.86, h], [r * 0.52, h], [r * 0.52, h * 0.55], [0, h * 0.55]], 24), mats().blackSteel);
    g.add(head);
    var hex = mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, h * 0.02, 6), mats().bore); hex.rotation.x = Math.PI / 2; hex.position.z = -h * 0.56; g.add(hex);
    if (axis === "x") g.rotation.y = -Math.PI / 2; else if (axis === "-x") g.rotation.y = Math.PI / 2; else if (axis === "y") g.rotation.x = Math.PI / 2; else if (axis === "-y") g.rotation.x = -Math.PI / 2;
    return g;
  }
  // a slotted adjustment screw
  function slotScrew(r, axis) {
    var g = new THREE.Group(); g.add(mesh(lathe([[0, 0], [r, 0], [r, 0.0006], [r * 0.85, 0.0009], [0, 0.0009]], 20), mats().steel));
    var slot = mesh(new THREE.BoxGeometry(r * 1.8, r * 0.28, 0.0004), mats().bore); slot.position.z = -0.0008; g.add(slot);
    if (axis === "x") g.rotation.y = -Math.PI / 2; else if (axis === "-y") g.rotation.x = -Math.PI / 2; else if (axis === "y") g.rotation.x = Math.PI / 2;
    return g;
  }

  // ---------- the parts (pistol coordinates: forward -z, up +y; metres) ----------
  function buildSuppressor() {
    var m = mats(), g = new THREE.Group(), z0 = MUZZLE_Z + 0.002; // the rear face sits just behind the muzzle crown
    // rear cap and booster housing: thread bore round the barrel, chamfers, a wrench groove
    g.add(mesh(lathe([[0.0076, 0], [0.0128, 0], [0.0148, 0.0018], [0.0154, 0.0042], [0.0154, 0.0102], [0.0149, 0.0108], [0.0149, 0.0118], [0.0157, 0.0124]], 64, z0), m.turned));
    // knurled grip ring
    var kn = tube(0.0158, 0.019, 72); kn.translate(0, 0, z0 - 0.0124 - 0.0095); g.add(mesh(kn, m.cerakoteKnurl));
    g.add(mesh(lathe([[0.0157, 0.0314], [0.0158, 0.0318], [0.0163, 0.0322], [0.0170, 0.0332]], 64, z0), m.turned));
    // main tube with engraving
    var tb = tube(0.0170, 0.117, 72); tb.translate(0, 0, z0 - 0.0332 - 0.0585); g.add(mesh(tb, m.tube));
    // front cap: groove line, chamfered shoulder, dished face, spanner holes, bore
    g.add(mesh(lathe([[0.0170, 0.1502], [0.0164, 0.1506], [0.0164, 0.1522], [0.0168, 0.1526], [0.0168, 0.1600], [0.0160, 0.1628], [0.0126, 0.1648], [0.0075, 0.1640], [0.0060, 0.1632], [0.0058, 0.1600]], 64, z0), m.turned));
    var bore = tube(0.0058, 0.15, 32); bore.translate(0, 0, z0 - 0.085); g.add(mesh(bore, m.bore));
    var rearBore = mesh(new THREE.RingGeometry(0.0072, 0.0077, 48), m.bore); rearBore.position.z = z0 + 0.0002; g.add(rearBore);
    [-1, 1].forEach(function (s) { var h = mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.0016, 16), m.bore); h.rotation.x = Math.PI / 2; h.position.set(s * 0.0098, 0, z0 - 0.1640); g.add(h); });
    g.traverse(function (o) { if (o.isMesh) o.position.y += BORE_Y; });
    return g;
  }
  // Picatinny barrel-clamp mount (shared by the laser and the light)
  function railProfile(slot) {
    var p = slot ? [[-0.0080, 0], [0.0080, 0], [0.0080, -0.0024], [0.0094, -0.0036], [0.0094, -0.0052], [-0.0094, -0.0052], [-0.0094, -0.0036], [-0.0080, -0.0024]]
      : [[-0.0080, 0], [0.0080, 0], [0.0080, -0.0024], [0.0106, -0.0046], [0.0106, -0.0062], [0.0088, -0.0080], [0.0088, -0.0094], [-0.0088, -0.0094], [-0.0088, -0.0080], [-0.0106, -0.0062], [-0.0106, -0.0046], [-0.0080, -0.0024]];
    return p;
  }
  function buildMount() {
    var m = mats(), g = new THREE.Group(), z, step = 0.01, slot = 0.0053;
    // rail: teeth and recoil slots
    for (z = RAIL_Z0; z > RAIL_Z1 + 0.001; z -= step) {
      var a = z, b = Math.max(RAIL_Z1, z - (step - slot));
      var tooth = mesh(prism(railProfile(false), a, b, 0.00035), m.anodized); tooth.position.y = RAIL_Y; g.add(tooth);
      if (b > RAIL_Z1 + 0.0005) { var sl = mesh(prism(railProfile(true), b, Math.max(RAIL_Z1, b - slot), 0), m.anodized); sl.position.y = RAIL_Y; g.add(sl); }
    }
    // spine joining rail to clamp
    g.add(mesh(block(0.0150, 0.0060, 0.050, 0.0015, 0.0005), m.anodized, 0, RAIL_Y + 0.0030, -0.135));
    // two-piece clamp round the barrel with cap screws each side
    [-0.118, -0.150].forEach(function (cz) {
      var ring = lathe([[0.0073, 0], [0.0112, 0], [0.0118, 0.0006], [0.0118, 0.0124], [0.0112, 0.013], [0.0073, 0.013]], 48, cz + 0.0065); ring.translate(0, BORE_Y, 0);
      g.add(mesh(ring, m.anodized));
      var lug = mesh(block(0.030, 0.0055, 0.013, 0.0012, 0.0004), m.anodized, 0, BORE_Y - 0.0060, cz); g.add(lug);
      var split = mesh(new THREE.BoxGeometry(0.031, 0.0004, 0.0132), m.bore); split.position.set(0, BORE_Y - 0.0035, cz); g.add(split);
      [-1, 1].forEach(function (s) { var sc = capScrew(0.0019, 0.0022); sc.position.set(s * 0.0118, BORE_Y - 0.0087, cz); sc.rotation.set(-Math.PI / 2, 0, 0); g.add(sc); });
    });
    return g;
  }
  function railJaws(z0, len, h) { // the accessory's rail clamp: jaws hugging the rail sides and a cross-bolt
    var m = mats(), g = new THREE.Group();
    [-1, 1].forEach(function (s) {
      var jaw = mesh(prism([[s * 0.0094, 0], [s * 0.0124, 0], [s * 0.0124, 0.0066], [s * 0.0112, 0.0072], [s * 0.0100, 0.0050], [s * 0.0094, 0.0050]], z0, z0 - len, 0.0002), m.polymer);
      jaw.position.y = RAIL_FACE; g.add(jaw);
    });
    var bolt = mesh(tube(0.0019, 0.027, 20, false), m.blackSteel); bolt.rotation.y = Math.PI / 2; bolt.position.set(0, RAIL_FACE + 0.0034, z0 - len / 2); g.add(bolt);
    var nut = mesh(new THREE.CylinderGeometry(0.0031, 0.0031, 0.0022, 6), m.blackSteel); nut.rotation.z = Math.PI / 2; nut.position.set(0.0136, RAIL_FACE + 0.0034, z0 - len / 2); g.add(nut);
    var knob = mesh(lathe([[0, 0], [0.0042, 0], [0.0046, 0.0008], [0.0046, 0.0026], [0.0040, 0.0032], [0, 0.0032]], 24), m.cerakoteKnurl); knob.rotation.y = Math.PI / 2; knob.position.set(-0.0128, RAIL_FACE + 0.0034, z0 - len / 2); g.add(knob);
    return g;
  }
  function buildLaser() {
    var m = mats(), g = new THREE.Group(), z0 = -0.128, len = 0.038, top = RAIL_FACE, hh = 0.019, cy = top - hh / 2, zc = z0 - len / 2;
    g.add(railJaws(z0 + 0.002, 0.016, 0));
    // polymer housing with a chamfered nose
    g.add(mesh(block(0.0250, hh, len, 0.0045, 0.0012), m.polymer, 0, cy, zc));
    g.add(mesh(block(0.0210, 0.0150, 0.006, 0.0040, 0.0012), m.polymer, 0, cy - 0.0004, z0 - len - 0.0024));
    // aluminium emitter bezel, lens and the beam window
    var ez = z0 - len - 0.0052;
    g.add(mesh(lathe([[0.0035, 0], [0.0052, 0], [0.0058, 0.0008], [0.0058, 0.0030], [0.0050, 0.0036], [0.0036, 0.0036], [0.0036, 0.0030]], 32, ez + 0.0004), m.turned, 0, cy + 0.002, 0));
    var lens = mesh(new THREE.CircleGeometry(0.0034, 32), m.laserLens); lens.position.set(0, cy + 0.002, ez - 0.0028); lens.rotation.y = Math.PI; g.add(lens);
    g.userData.emitter = new THREE.Vector3(0, cy + 0.002, ez - 0.0034);
    // ambidextrous rocker switches at the rear
    [-1, 1].forEach(function (s) { var sw = mesh(block(0.0034, 0.0080, 0.0110, 0.0016, 0.0006), m.rubber, s * 0.0136, cy - 0.0005, z0 - 0.0085); g.add(sw);
      var rib = mesh(new THREE.BoxGeometry(0.0006, 0.0060, 0.0008), m.rubber); rib.position.set(s * 0.0155, cy - 0.0005, z0 - 0.0085); g.add(rib); });
    // windage (right) and elevation (bottom) screws, battery cap underneath
    var w = slotScrew(0.0016, "x"); w.position.set(0.0126, cy + 0.003, z0 - 0.029); g.add(w);
    var el = slotScrew(0.0016, "-y"); el.position.set(0, top - hh - 0.0001, z0 - 0.031); g.add(el);
    var cap = mesh(lathe([[0, 0], [0.0055, 0], [0.0060, 0.0005], [0.0060, 0.0016], [0.0054, 0.0020], [0, 0.0020]], 32), m.cerakoteKnurl); cap.rotation.x = -Math.PI / 2; cap.position.set(0, top - hh, z0 - 0.016); g.add(cap);
    // printed warning label on the left side
    var lab = mesh(new THREE.PlaneGeometry(0.020, 0.0085), new THREE.MeshStandardMaterial({ map: labelTex([["LASER RADIATION", "700 20px Arial"], ["CLASS 3R  ·  650 nm  ·  <5 mW", "500 15px Arial"]], 256, 108, "#c9cbcf", "#232427"), roughness: 0.7 }));
    lab.position.set(-0.01254, cy, z0 - 0.022); lab.rotation.y = -Math.PI / 2; g.add(lab);
    return g;
  }
  function buildLight() {
    var m = mats(), g = new THREE.Group(), z0 = -0.104, cy = RAIL_FACE - 0.0050 - 0.0118;
    g.add(railJaws(z0 - 0.006, 0.024, 0));
    // body saddle between the jaws and the tube
    g.add(mesh(block(0.0240, 0.0080, 0.034, 0.0030, 0.0008), m.anodized, 0, RAIL_FACE - 0.0040, z0 - 0.024));
    // tube: rounded tail cap, grip grooves, flared head, crenellated bezel
    var tz = z0 - 0.002, p = [[0, 0], [0.0060, 0], [0.0095, 0.0012], [0.0110, 0.0040], [0.0115, 0.0068]];
    [0.012, 0.018, 0.024].forEach(function (z) { p.push([0.0115, z - 0.0016], [0.0108, z - 0.0010], [0.0108, z], [0.0115, z + 0.0006]); });
    p.push([0.0115, 0.040], [0.0122, 0.045], [0.0134, 0.052], [0.0136, 0.0615], [0.0128, 0.0625], [0.0120, 0.0622]);
    g.add(mesh(lathe(p, 64, tz), m.anodized, 0, cy, 0));
    for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2, n = mesh(new THREE.BoxGeometry(0.0034, 0.0012, 0.0022), m.bore); n.position.set(Math.cos(a) * 0.0130, cy + Math.sin(a) * 0.0130, tz - 0.0614); n.rotation.z = a + Math.PI / 2; g.add(n); }
    // TIR reflector, LED and the glass
    var fz = tz - 0.0618;
    var refl = lathe([[0.0026, 0], [0.0045, 0.0030], [0.0075, 0.0068], [0.0100, 0.0094], [0.0114, 0.0108]], 48, fz + 0.0108); refl.translate(0, cy, 0);
    var rm = mesh(refl, m.chrome); rm.material = m.chrome.clone(); rm.material.side = THREE.DoubleSide; rm.material.emissive = new THREE.Color(0xfff1d6); rm.material.emissiveIntensity = 0; g.add(rm);
    g.userData.reflector = rm.material;
    var led = mesh(new THREE.BoxGeometry(0.0032, 0.0032, 0.0008), m.led); led.position.set(0, cy, fz + 0.0104); g.add(led);
    var glass = mesh(new THREE.CircleGeometry(0.0117, 48), m.glass); glass.position.set(0, cy, fz - 0.0004); glass.rotation.y = Math.PI; glass.renderOrder = 2; g.add(glass);
    // rear paddle switches
    [-1, 1].forEach(function (s) { var pd = mesh(block(0.0040, 0.0090, 0.0140, 0.0018, 0.0006), m.polymer, s * 0.0130, RAIL_FACE - 0.0080, z0 - 0.006); pd.rotation.y = s * 0.12; g.add(pd);
      [0, 1, 2].forEach(function (k) { var r = mesh(new THREE.BoxGeometry(0.0006, 0.0070, 0.0007), m.polymer); r.position.set(s * 0.0151, RAIL_FACE - 0.0080, z0 - 0.0015 - k * 0.0035); r.rotation.y = s * 0.12; g.add(r); }); });
    g.userData.front = new THREE.Vector3(0, cy, fz - 0.002);
    g.userData.led = m.led;
    return g;
  }
  function buildRedDot() {
    var m = mats(), g = new THREE.Group(), base = SLIDE_TOP, zr = -0.030; // rear of the housing
    // adapter plate on the slide with two screws
    g.add(mesh(block(0.0230, 0.0026, 0.050, 0.0018, 0.0004), m.anodized, 0, base + 0.0013, zr - 0.024));
    [-0.006, -0.040].forEach(function (z) { var s = capScrew(0.0019, 0.0016); s.rotation.set(Math.PI / 2, 0, 0); s.position.set(0, base + 0.0026, zr + z + 0.0008); g.add(s); });
    // housing: side profile extruded across, with a sloped nose and the emitter tower
    var b0 = base + 0.0026, shape = [[0, 0], [0, 0.0110], [0.0045, 0.0118], [0.0120, 0.0090], [0.0300, 0.0070], [0.0410, 0.0060], [0.0460, 0.0035], [0.0462, 0]];
    var s = new THREE.Shape(); shape.forEach(function (p, i) { var x = -p[0], y = p[1]; if (i) s.lineTo(x, y); else s.moveTo(x, y); });
    var hg = new THREE.ExtrudeGeometry(s, { depth: 0.0236, bevelEnabled: true, bevelThickness: 0.0010, bevelSize: 0.0009, bevelSegments: 2 });
    hg.rotateY(-Math.PI / 2); hg.translate(0.0118, b0, zr); boxUV(hg, 120); g.add(mesh(hg, m.anodized));
    // the hood: a rounded window frame leaning back 8 degrees, with protective ears
    var frame = rrect(0.0260, 0.0205, 0.0050), hole = rrect(0.0196, 0.0140, 0.0030); frame.holes.push(hole);
    var fg = new THREE.ExtrudeGeometry(frame, { depth: 0.0040, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0007, bevelSegments: 2, curveSegments: 10 }); boxUV(fg, 120);
    var hood = mesh(fg, m.anodized); hood.position.set(0, b0 + 0.0060 + 0.0102, zr - 0.0300); hood.rotation.x = -0.14; g.add(hood);
    var lens = mesh(new THREE.PlaneGeometry(0.0198, 0.0142), m.coated); lens.position.set(0, b0 + 0.0060 + 0.0102, zr - 0.0290); lens.rotation.x = -0.14; lens.renderOrder = 2; g.add(lens);
    g.userData.lens = lens;
    // emitter window at the rear, brightness buttons on the left, adjustment screws
    var em = mesh(block(0.0060, 0.0030, 0.0030, 0.0008, 0.0003), m.bore, 0, b0 + 0.0112, zr - 0.0060); g.add(em);
    var dotLed = mesh(new THREE.CircleGeometry(0.0006, 12), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); dotLed.position.set(0, b0 + 0.0112, zr - 0.0076); dotLed.rotation.y = Math.PI; g.add(dotLed);
    [-0.010, -0.020].forEach(function (z) { var bt = mesh(lathe([[0, 0], [0.0016, 0], [0.0016, 0.0005], [0.0012, 0.0009], [0, 0.0009]], 16), m.rubber); bt.rotation.y = Math.PI / 2; bt.position.set(-0.0128, b0 + 0.0040, zr + z); g.add(bt); });
    var ws = slotScrew(0.0014, "x"); ws.position.set(0.0128, b0 + 0.0050, zr - 0.0080); g.add(ws);
    var es = slotScrew(0.0014, "y"); es.position.set(0.004, b0 + 0.0119, zr - 0.0030); g.add(es);
    return g;
  }
  function buildExtMag() {
    var m = mats(), g = new THREE.Group(), top = GRIP_BASE + 0.0004, h = 0.0230, zc = MAG_Z;
    // tapered body matching the mag tube, stippled, with a witness slot
    var body = new THREE.Shape(), w0 = 0.0118, w1 = 0.0128;
    body.moveTo(-w0, 0); body.lineTo(w0, 0); body.lineTo(w1, -h + 0.004); body.quadraticCurveTo(w1, -h, w1 - 0.003, -h); body.lineTo(-w1 + 0.003, -h); body.quadraticCurveTo(-w1, -h, -w1, -h + 0.004); body.lineTo(-w0, 0);
    var bg = new THREE.ExtrudeGeometry(body, { depth: 0.0340, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0010, bevelSegments: 2 }); bg.translate(0, top, zc - 0.017); boxUV(bg, 120);
    g.add(mesh(bg, m.polymer));
    var witness = mesh(new THREE.BoxGeometry(0.0004, 0.0110, 0.0040), m.bore); witness.position.set(0.0124, top - 0.010, zc + 0.006); g.add(witness);
    // aluminium floor plate with a front lip and "+3"
    g.add(mesh(block(0.0270, 0.0034, 0.0380, 0.0040, 0.0008), m.anodized, 0, top - h - 0.0016, zc - 0.0012));
    g.add(mesh(block(0.0230, 0.0030, 0.0040, 0.0012, 0.0006), m.anodized, 0, top - h - 0.0005, zc - 0.0205));
    var lab = mesh(new THREE.PlaneGeometry(0.010, 0.006), new THREE.MeshStandardMaterial({ map: labelTex([["+3", "800 64px Arial"]], 128, 80, "#8d9096", "#17181a"), roughness: 0.5, metalness: 0.6 }));
    lab.setRotationFromMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0))); // reads from below, front up
    lab.position.set(0, top - h - 0.0034, zc); g.add(lab);
    // grip grooves on both sides
    [-1, 1].forEach(function (sd) { [0.006, 0.011, 0.016].forEach(function (d) { var gr = mesh(new THREE.BoxGeometry(0.0008, 0.0012, 0.026), m.bore); gr.position.set(sd * (0.0118 + d / (h - 0.004) * 0.0010 + 0.0002), top - d, zc); g.add(gr); }); });
    return g;
  }
  var BUILD = { suppressor: buildSuppressor, laser: buildLaser, light: buildLight, reddot: buildRedDot, extmag: buildExtMag };

  // ---------- library props (the same models, loose, with physics) ----------
  var PHYS = { suppressor: { mass: 0.26, friction: 0.5, restitution: 0.1 }, laser: { mass: 0.06, friction: 0.6, restitution: 0.1 }, light: { mass: 0.11, friction: 0.6, restitution: 0.1 }, reddot: { mass: 0.07, friction: 0.6, restitution: 0.1 }, extmag: { mass: 0.03, friction: 0.7, restitution: 0.1 } };
  var LABEL = { suppressor: "Suppressor", laser: "Laser module", light: "Weapon light", reddot: "Red dot sight", extmag: "Mag extension +3" };
  function loose(key) {
    var g = BUILD[key]();
    if (key === "laser" || key === "light") g.add(buildMount()); // sold as a kit with the barrel-clamp rail
    var box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    g.children.forEach(function (ch) { ch.position.sub(c); });
    var root = new THREE.Group(); root.add(g);
    return { object: root, size: s, shapes: [{ kind: "cuboid", size: [Math.max(0.006, s.x / 2), Math.max(0.006, s.y / 2), Math.max(0.006, s.z / 2)], offset: [0, 0, 0] }] };
  }
  var THUMB = {}, ENV = null;
  function studioEnv(r) { // a soft photo-studio light box for reflections in the card renders
    if (ENV) return ENV;
    var sc = new THREE.Scene(), box = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x8c9099, side: THREE.BackSide })); sc.add(box);
    [[0, 4.9, 0, 6, 6, 1.6], [4.9, 1, 1, 4, 3, 1.0], [-4.9, 0.5, -1, 3, 4, 0.6]].forEach(function (b) { var m = new THREE.Mesh(new THREE.PlaneGeometry(b[3], b[4]), new THREE.MeshBasicMaterial({ color: new THREE.Color(b[5], b[5], b[5]), side: THREE.DoubleSide })); m.position.set(b[0], b[1], b[2]); m.lookAt(0, 0, 0); sc.add(m); });
    var pm = new THREE.PMREMGenerator(r); ENV = pm.fromScene(sc, 0.02).texture; pm.dispose(); return ENV;
  }
  function thumbnail(key) { // a small studio render for the Props app card, made once
    if (THUMB[key] !== undefined) return THUMB[key];
    THUMB[key] = null;
    setTimeout(function () {
      try {
        var S = window.__studio, r = S.renderer, w = 352, h = 208, rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
        var sc = new THREE.Scene(); sc.background = new THREE.Color(0xe9eaee).convertSRGBToLinear().multiplyScalar(0.62); sc.environment = studioEnv(r);
        var L = loose(key).object; sc.add(L);
        var k = new THREE.DirectionalLight(0xffffff, 3.4); k.position.set(1, 2, 1.5); var rim = new THREE.DirectionalLight(0xdfe8ff, 1.6); rim.position.set(-1.5, 0.6, -1.2); sc.add(k, rim, new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.2));
        var size = new THREE.Box3().setFromObject(L).getSize(new THREE.Vector3()), d = Math.max(size.x, size.y, size.z);
        var cam = new THREE.PerspectiveCamera(24, w / h, 0.005, 5); cam.position.set(d * 1.9, d * 1.1, d * 1.5); cam.lookAt(0, 0, 0);
        var xr = r.xr.enabled; r.xr.enabled = false; var prev = r.getRenderTarget(); r.setRenderTarget(rt); r.render(sc, cam); r.setRenderTarget(prev); r.xr.enabled = xr;
        var px = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, px); rt.dispose();
        var c = cnv(w, h), x = c.getContext("2d"), img = x.createImageData(w, h);
        var lut = new Uint8Array(256); for (var i = 0; i < 256; i++) { var v = i / 255 * 1.6; v = v / (1 + v * 0.35); lut[i] = Math.round(255 * Math.pow(Math.min(1, v), 1 / 2.2)); } // linear -> display
        for (var y = 0; y < h; y++) for (var xx = 0; xx < w; xx++) { var so = ((h - 1 - y) * w + xx) * 4, o = (y * w + xx) * 4; img.data[o] = lut[px[so]]; img.data[o + 1] = lut[px[so + 1]]; img.data[o + 2] = lut[px[so + 2]]; img.data[o + 3] = 255; }
        x.putImageData(img, 0, 0); THUMB[key] = c;
        if (S.computer) S.computer.os.invalidate();
      } catch (e) { THUMB[key] = null; }
    }, 50 + Object.keys(THUMB).length * 120);
    return null;
  }

  (function register() {
    var LIB = window.__studioPropLib, S = window.__studio;
    if (!LIB || !LIB.register || !S || !S.THREE) { setTimeout(register, 40); return; }
    THREE = S.THREE;
    KEYS.forEach(function (key) {
      var probe = loose(key);
      LIB.register(PROP_OF[key], { label: LABEL[key], group: "Armory", size: [probe.size.x, probe.size.y, probe.size.z].map(function (v) { return Math.max(0.012, v); }), phys: PHYS[key],
        build: function () { var l = loose(key); return { object: l.object, shapes: l.shapes }; },
        swatch: function () { var t = thumbnail(key); return t ? { img: t, tint: null } : null; } });
    });
    window.__studioArmoryReady = true;
  })();

  // ---------- on the pistol ----------
  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        if (s && s.ready && s.gun && s.gun.pistol && s.editor && window.__studioArmoryReady) resolve(s); else setTimeout(check, 250);
      })();
    });
  }
  waitForStudio().then(function (S) {
    var gun = S.gun, P = gun.pistol, ed = S.editor, os = S.computer && S.computer.os, log = S.log;
    var SPEC = window.__pistolSpec, CART = window.__cartridges && window.__cartridges["9mm"];
    var ON = {}, PARTS = {}, mountPart = null, acc = false;
    var store = function (k, v) { try { if (v === undefined) return os ? os.storage.get(k) : localStorage.getItem(k); if (os) os.storage.set(k, v); else localStorage.setItem(k, v); } catch (e) { return null; } };
    function save() { store("pistol.mods", JSON.stringify(KEYS.filter(function (k) { return ON[k]; }))); }
    function parentOf(key) { return key === "reddot" ? (P.slide || P.group) : P.group; }
    function shadows() { try { S.renderer.shadowMap.needsUpdate = true; } catch (e) {} }

    // the suppressor moves the muzzle (flash, smoke, bullet start) and softens the shot
    var muzzleWorld = P.muzzleWorld.bind(P), SUP_LEN = 0.163;
    P.muzzleWorld = function (e) { var v = muzzleWorld(e); if (ON.suppressor) { var f = new THREE.Vector3(0, 0, -SUP_LEN).transformDirection(P.group.matrixWorld); v.addScaledVector(f, SUP_LEN); } return v; };
    var SUP = CART ? Object.assign({}, CART, { volume: 0.32, flash: 0.12 }) : null;
    if (gun.effects && SUP) { var shot = gun.effects.shot.bind(gun.effects); gun.effects.shot = function () { var a = [].slice.call(arguments); if (ON.suppressor && a.length < 9) a[8] = SUP; return shot.apply(null, a); }; }

    // laser dot and weapon light
    var dot = null, beamLight = null;
    function makeDot() {
      var c = cnv(64), x = c.getContext("2d"), r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, "rgba(255,245,240,1)"); r.addColorStop(0.18, "rgba(255,40,24,0.95)"); r.addColorStop(0.5, "rgba(255,0,0,0.25)"); r.addColorStop(1, "rgba(255,0,0,0)");
      x.fillStyle = r; x.fillRect(0, 0, 64, 64);
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      s.name = "laser-dot"; s.userData.noBullet = true; s.visible = false; S.scene.add(s); return s;
    }
    function setAccessory(on) {
      acc = !!on;
      if (PARTS.light) { var L = PARTS.light; L.userData.led.emissiveIntensity = acc ? 8 : 0; L.userData.reflector.emissiveIntensity = acc ? 0.35 : 0; }
      if (beamLight) beamLight.intensity = acc && ON.light ? 260 : 0;
      if (PARTS.laser) mats().laserLens.emissiveIntensity = acc && ON.laser ? 3 : 0.25;
      if (os) os.invalidate();
    }
    function toggle() { if (!ON.laser && !ON.light) { if (log) log.info("No laser or light fitted. Say: attach the laser"); return false; } setAccessory(!acc); return acc; }
    gun.secondary = toggle; gun.accessory = toggle;

    // red dot: drawn only where the eye looks through the window, as far away as the target
    var reticle = null;
    function makeReticle() {
      var c = cnv(64), x = c.getContext("2d"), r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.12, "rgba(255,48,32,1)"); r.addColorStop(0.32, "rgba(255,20,10,0.35)"); r.addColorStop(1, "rgba(255,0,0,0)");
      x.fillStyle = r; x.fillRect(0, 0, 64, 64);
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false }));
      s.renderOrder = 999; s.name = "red-dot-reticle"; s.userData.noBullet = true; s.visible = false; s.layers.set(0); S.scene.add(s); return s;
    }

    function apply(key, on) {
      if (on && !PARTS[key]) { PARTS[key] = BUILD[key](); PARTS[key].name = "attachment-" + key; }
      if (on) parentOf(key).add(PARTS[key]); else if (PARTS[key] && PARTS[key].parent) PARTS[key].parent.remove(PARTS[key]);
      ON[key] = on;
      var needRail = ON.laser || ON.light;
      if (needRail && !mountPart) { mountPart = buildMount(); mountPart.name = "attachment-rail"; }
      if (mountPart) { if (needRail && !mountPart.parent) P.group.add(mountPart); if (!needRail && mountPart.parent) mountPart.parent.remove(mountPart); }
      if (key === "light") {
        if (on && !beamLight) { beamLight = new THREE.SpotLight(0xfff4e6, 0, 30, 0.36, 0.6, 2); beamLight.castShadow = false; beamLight.name = "weapon-light"; beamLight.userData.noBullet = true;
          var f = PARTS.light.userData.front; beamLight.position.copy(f); beamLight.target.position.set(f.x, f.y, f.z - 1); }
        if (on) P.group.add(beamLight, beamLight.target); else if (beamLight && beamLight.parent) { beamLight.parent.remove(beamLight); beamLight.parent && beamLight.parent.remove(beamLight.target); P.group.remove(beamLight.target); }
      }
      if (key === "laser" && on && !dot) dot = makeDot();
      if (key === "reddot" && on && !reticle) reticle = makeReticle();
      if (key === "extmag" && SPEC) {
        var full = P.ammo >= SPEC.capacity;
        SPEC.capacity = on ? 11 : 8;
        if (on && full) P.ammo = SPEC.capacity; if (!on) P.ammo = Math.min(P.ammo, SPEC.capacity);
      }
      setAccessory(acc && (ON.laser || ON.light));
      save(); shadows(); if (os) os.invalidate();
    }

    // undoable fit / remove (rail slot: the laser and the light share the one rail)
    function fitStep(key, on, label, extra) {
      var swap = on && (key === "laser" || key === "light") && ON[key === "laser" ? "light" : "laser"] ? (key === "laser" ? "light" : "laser") : null;
      var was = {}; KEYS.forEach(function (k) { was[k] = !!ON[k]; });
      var step = { label: label, live: true,
        do: function () { if (swap) apply(swap, false); apply(key, on); if (extra) extra.do(); },
        undo: function () { if (extra) extra.undo(); KEYS.forEach(function (k) { if (!!ON[k] !== was[k]) apply(k, was[k]); }); } };
      if (extra && extra.ops) step.ops = extra.ops;
      ed.history.run(step); ed.selectionVersion++;
      return swap;
    }
    function attach(key) {
      if (ON[key]) return { error: "The pistol already has the " + NAME[key] + "." };
      var swap = fitStep(key, true, "Fit " + NAME[key] + " to the pistol");
      return { swapped: swap ? NAME[swap] : null };
    }
    function detach(key, keepLoose) {
      if (!ON[key]) return { error: "The pistol has no " + NAME[key] + "." };
      fitStep(key, false, "Take the " + NAME[key] + " off the pistol");
      if (keepLoose !== false) { // put it on the desk next to the pistol, as a prop you can pick up again
        var p = new THREE.Vector3(0.09, 0.03, -0.06).applyMatrix4(P.group.matrixWorld), id = S.editor.world.spawnId(PROP_OF[key].replace(/\s+/g, "-"));
        var d = window.__studioPropLib.def(PROP_OF[key]);
        var r = ed.applyBatch([{ op: "spawn", id: id, spec: { kind: "prop", prop: PROP_OF[key], dynamic: true, size: d.size.slice() }, to: { p: [p.x, Math.max(p.y, d.size[1] / 2 + 0.01), p.z], r: [0, 0, 0], s: [1, 1, 1] }, color: "#d8d4cc" }], "Put the " + NAME[key] + " down");
        if (r.ok) merge(2, "Take the " + NAME[key] + " off the pistol");
      }
      return {};
    }
    function merge(n, label) { // fold the last n history steps into one
      var H = ed.history; if (H.done.length < n) return;
      var steps = H.done.splice(H.done.length - n, n), ops = [];
      steps.forEach(function (s) { if (s.ops) ops.push.apply(ops, s.ops); });
      var m = { label: label, live: true, do: function () { steps.forEach(function (s) { s.do(); }); }, undo: function () { steps.slice().reverse().forEach(function (s) { s.undo(); }); } };
      if (ops.length) m.ops = ops;
      H.done.push(m); H.onChange(m, "do");
    }
    // fitting a loose part: it disappears into the pistol (the prop is deleted in the same step)
    function snapFit(e, key) {
      var world = S.editor.world;
      var extra = { ops: [{ op: "delete", id: e.id }],
        do: function () { e.deleted = true; e.object.visible = false; if (e.prop) S.physics.setPropEnabled(e.prop, false); world.version++; },
        undo: function () { e.deleted = false; e.object.visible = true; world.version++; e.__noSnapUntil = performance.now() + 6000;
          if (e.prop) { S.physics.setPropEnabled(e.prop, true); var aside = new THREE.Vector3(0.10, 0.03, -0.04).applyMatrix4(P.group.matrixWorld); S.physics.teleport(e.prop, aside, e.object.quaternion); e.object.position.copy(aside); } } };
      if (ed.selection.indexOf(e) >= 0) ed.select(null);
      var swap = fitStep(key, true, "Fit " + NAME[key] + " to the pistol", extra);
      if (log) log.info("Fitted the " + NAME[key] + (swap ? " (the " + NAME[swap] + " came off: one rail)" : ""));
      try { gun.effects.play("mag_in", P.group.getWorldPosition(new THREE.Vector3()), 0.5); } catch (x) {}
    }

    // restore the fitted set (not part of Undo)
    try { (JSON.parse(store("pistol.mods") || "[]") || []).forEach(function (k) { if (BUILD[k]) apply(k, true); }); } catch (x) {}

    // ---------- every frame: laser dot, red dot, ghost preview, snapping ----------
    var ghosts = {}, lastSnap = 0, ray = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: -1 } };
    var v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q = new THREE.Quaternion(), plane = new THREE.Plane(), line = new THREE.Ray();
    function eye() { var c = S.renderer.xr.isPresenting ? S.renderer.xr.getCamera() : S.camera; return c.getWorldPosition(v3); }
    // where the dot appears for an eye: only through the window, as if at 25 m along the bore
    function sightPicture(e) {
      var lens = PARTS.reddot && PARTS.reddot.userData.lens; if (!lens) return null;
      P.group.updateMatrixWorld(true); lens.updateMatrixWorld(true);
      var lc = new THREE.Vector3().setFromMatrixPosition(lens.matrixWorld), fwd = new THREE.Vector3(0, 0, -1).transformDirection(P.group.matrixWorld);
      if (e.distanceTo(lc) > 0.9 || fwd.dot(lc.clone().sub(e)) <= 0) return null;
      var d = lc.clone().addScaledVector(fwd, 25).sub(e).normalize();
      lens.getWorldQuaternion(q); plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1).applyQuaternion(q), lc);
      line.set(e, d); var hitP = line.intersectPlane(plane, new THREE.Vector3()); if (!hitP) return null;
      var local = lens.worldToLocal(hitP);
      return Math.abs(local.x) < 0.0094 && Math.abs(local.y) < 0.0066 ? { from: e, dir: d } : null;
    }
    function frame() {
      var now = performance.now();
      P.group.updateMatrixWorld(true);
      // laser
      if (dot) {
        dot.visible = false;
        if (ON.laser && acc && P.group.visible && S.physics && S.physics.world) {
          var from = v1.copy(PARTS.laser.userData.emitter).applyMatrix4(P.group.matrixWorld), dir = v2.set(0, 0, -1).transformDirection(P.group.matrixWorld);
          ray.origin.x = from.x; ray.origin.y = from.y; ray.origin.z = from.z; ray.dir.x = dir.x; ray.dir.y = dir.y; ray.dir.z = dir.z;
          var hit = null; try { hit = S.physics.world.castRayAndGetNormal(ray, 60, true, undefined, undefined, undefined, gun.prop && gun.prop.body); } catch (x) { hit = null; }
          if (hit) {
            var t = hit.timeOfImpact != null ? hit.timeOfImpact : hit.toi, n = hit.normal;
            dot.position.copy(from).addScaledVector(dir, t).add(new THREE.Vector3(n.x, n.y, n.z).multiplyScalar(0.003));
            var sz = 0.006 + t * 0.0016; dot.scale.set(sz, sz, 1); dot.visible = true;
          }
        }
      }
      // red dot
      if (reticle) {
        var seen = ON.reddot && P.group.visible ? sightPicture(eye().clone()) : null;
        reticle.visible = !!seen;
        if (seen) { reticle.position.copy(seen.from).addScaledVector(seen.dir, 8); reticle.scale.setScalar(0.024); }
      }
      // loose parts near their place: a ghost while held, a fit when let go
      if (now - lastSnap > 120) {
        lastSnap = now;
        var near = {};
        S.editor.world.list.forEach(function (e) {
          if (e.deleted || !e.spawn || e.spawn.kind !== "prop" || !e.object.visible) return;
          var key = KEY_OF[e.spawn.prop]; if (!key || ON[key] || (e.__noSnapUntil && now < e.__noSnapUntil)) return;
          var target = v1.fromArray(MOUNT[key]).applyMatrix4(P.group.matrixWorld), dist = e.object.getWorldPosition(v2).distanceTo(target);
          if (dist < 0.09) { if (e.prop && e.prop.held) near[key] = true; else if (dist < 0.07) snapFit(e, key); }
        });
        KEYS.forEach(function (k) {
          if (near[k] && !ghosts[k]) { var g = BUILD[k](); if (k === "laser" || k === "light") g.add(buildMount()); g.traverse(function (o) { if (o.isMesh) { o.material = mats().ghost; o.castShadow = false; } }); ghosts[k] = g; parentOf(k).add(g); }
          if (!near[k] && ghosts[k]) { ghosts[k].parent && ghosts[k].parent.remove(ghosts[k]); ghosts[k] = null; }
        });
      }
    }
    var render = S.renderer.render.bind(S.renderer);
    S.renderer.render = function (sc, cam) { if (sc === S.scene && cam === S.camera) { try { frame(); } catch (x) {} } return render(sc, cam); };

    // ---------- commands ----------
    (function hook() {
      var C = window.__studioCommands;
      if (!C || !C.ready || !C.handle) { setTimeout(hook, 300); return; }
      C.handle("attach", function (a) { var k = ALIAS[a.attachment]; if (!k) return { error: "I don't know that attachment." };
        if (ON[k]) return { error: "The pistol already has the " + NAME[k] + "." };
        return { act: function () { var r = attach(k); return { attachment: NAME[k] + (r.swapped ? " (the " + r.swapped + " came off: there is one rail)" : "") }; }, vars: { attachment: NAME[k] } }; });
      C.handle("detach", function (a) { var k = ALIAS[a.attachment]; if (!k) return { error: "I don't know that attachment." }; if (!ON[k]) return { error: "The pistol has no " + NAME[k] + "." }; return { act: function () { detach(k); }, vars: { attachment: NAME[k] } }; });
      C.handle("strip_pistol", function () { var on = KEYS.filter(function (k) { return ON[k]; }); if (!on.length) return { error: "The pistol has no attachments." }; return { act: function () { on.forEach(function (k) { detach(k); }); merge(on.length, "Strip the pistol"); } }; });
      C.handle("pistol_accessory", function (a) { if (!ON.laser && !ON.light) return { error: "No laser or light on the pistol. Say: attach the laser" }; return { act: function () { setAccessory(a.onoff ? a.onoff === "on" : !acc); return { onoff: acc ? "on" : "off" }; } }; });
    })();

    window.__studioArmory = { fitted: function () { return KEYS.filter(function (k) { return ON[k]; }); }, attach: attach, detach: detach, toggle: toggle, setAccessory: setAccessory, sightPicture: sightPicture, parts: PARTS, build: BUILD, thumbnail: thumbnail };
    if (log) log.info("Armory ready: " + (KEYS.filter(function (k) { return ON[k]; }).join(", ") || "stock pistol"));
  });
})();
