// Prop library and material presets (Phase 7, roadmap section 8 and Appendix B).
// Props are built from simple shapes, so they cost almost nothing to download. Their look comes from
// material presets that use real PBR maps (colour, normal, roughness/metal):
//   - the room's own scanned textures (oak, concrete, plaster, fabric, powder-coat grit, perforated mesh),
//     reused from the scene's materials so the GPU holds them once;
//   - textures drawn here once per session (crate planks, cardboard, painted drum with wear, traffic cone,
//     tyre tread, hay, book cloth and page edges, road sign, diamond plate, brushed steel, rubber...).
// Each generated texture is drawn with canvas tools on a 512 px (or smaller) canvas, the normal map comes
// from a height map, and textures and materials are shared by every copy of a prop.
// The engine spawns props through its own op ({op:"spawn", spec:{kind:"prop", prop:<name>}}), so they
// save, undo and come back after a reload; "mat" ops with key "preset" apply a material preset to any
// object. Spawned props are put away while you are in Rally and come back when you return.
// API: window.__studioPropLib (defined at once; builds need window.__studio.THREE).
(function () {
  "use strict";
  var T = function () { return window.__studio.THREE; };

  // ---------- small helpers ----------
  function rng(seed) { var a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function canvas(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h || w; return c; }
  // a tileable soft noise layer: random small canvas drawn up with smoothing
  function noiseLayer(ctx, w, h, cells, alpha, light, dark, seed) {
    var r = rng(seed), n = canvas(cells, cells), x = n.getContext("2d"), d = x.createImageData(cells, cells);
    for (var i = 0; i < cells * cells; i++) { var v = r(); var c = v > 0.5 ? light : dark; d.data[i * 4] = c[0]; d.data[i * 4 + 1] = c[1]; d.data[i * 4 + 2] = c[2]; d.data[i * 4 + 3] = Math.abs(v - 0.5) * 2 * 255; }
    x.putImageData(d, 0, 0);
    ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true; ctx.drawImage(n, 0, 0, w, h); ctx.restore();
  }
  // height canvas (grey) -> tangent-space normal map canvas (OpenGL, green up)
  function normalFrom(hc, strength) {
    var w = hc.width, h = hc.height, src = hc.getContext("2d").getImageData(0, 0, w, h).data, out = canvas(w, h), o = out.getContext("2d"), d = o.createImageData(w, h), D = d.data;
    function H(x, y) { x = (x + w) % w; y = (y + h) % h; return src[(y * w + x) * 4] / 255; }
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      var nx = -dx, ny = dy, nz = 1, l = Math.sqrt(nx * nx + ny * ny + nz * nz), i = (y * w + x) * 4;
      D[i] = (nx / l * 0.5 + 0.5) * 255; D[i + 1] = (ny / l * 0.5 + 0.5) * 255; D[i + 2] = (nz / l * 0.5 + 0.5) * 255; D[i + 3] = 255;
    }
    o.putImageData(d, 0, 0);
    return out;
  }
  // packed occlusion/roughness/metal like the room's *_orm maps: R=1, G=roughness, B=metalness
  function ormFrom(roughCanvas, metalCanvas) {
    var w = roughCanvas.width, h = roughCanvas.height, out = canvas(w, h), o = out.getContext("2d"), d = o.createImageData(w, h);
    var R = roughCanvas.getContext("2d").getImageData(0, 0, w, h).data, M = metalCanvas ? metalCanvas.getContext("2d").getImageData(0, 0, w, h).data : null;
    for (var i = 0; i < w * h * 4; i += 4) { d.data[i] = 255; d.data[i + 1] = R[i]; d.data[i + 2] = M ? M[i] : 0; d.data[i + 3] = 255; }
    o.putImageData(d, 0, 0);
    return out;
  }
  function tex(c, srgb, rx, ry) {
    var THREE = T(), t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (rx) t.repeat.set(rx, ry || rx);
    return t;
  }
  function grey(ctx, v) { var g = Math.round(v * 255); return "rgb(" + g + "," + g + "," + g + ")"; }

  // ---------- generated texture sets (cached) ----------
  var SETS = {};
  function set(name, make) { return SETS[name] || (SETS[name] = make()); }
  // every generator returns { map, normal, orm } canvases
  var GEN = {
    crate: function () {
      var S = 512, c = canvas(S), x = c.getContext("2d"), hc = canvas(S), h = hc.getContext("2d"), rc = canvas(S), r = rc.getContext("2d"), R = rng(7);
      x.fillStyle = "#8a6440"; x.fillRect(0, 0, S, S); h.fillStyle = grey(h, 0.15); h.fillRect(0, 0, S, S); r.fillStyle = grey(r, 0.8); r.fillRect(0, 0, S, S);
      var frame = 58, planks = 4, gap = 5, inner = S - frame * 2;
      function board(bx, by, bw, bhh, vertical, tone) {
        var base = ["#b98d5f", "#a87b4e", "#c19566", "#9e7348"][tone % 4];
        x.fillStyle = base; x.fillRect(bx, by, bw, bhh);
        for (var k = 0; k < 70; k++) { // grain
          var p = R() * (vertical ? bw : bhh), wv = 1 + R() * 2.5;
          x.strokeStyle = "rgba(70,45,22," + (0.08 + R() * 0.18) + ")"; x.lineWidth = wv; x.beginPath();
          for (var t = 0; t <= 1.001; t += 0.05) { var a = (vertical ? bhh : bw) * t, o = Math.sin(t * 7 + k) * 2 + Math.sin(t * 23 + k * 3) * 0.8; if (vertical) x.lineTo(bx + p + o, by + a); else x.lineTo(bx + a, by + p + o); }
          x.stroke();
        }
        if (R() < 0.6) { var kx = bx + R() * bw, ky = by + R() * bhh; x.fillStyle = "rgba(60,36,18,.55)"; x.beginPath(); x.ellipse(kx, ky, 5 + R() * 6, 3 + R() * 3, vertical ? Math.PI / 2 : 0, 0, 7); x.fill(); }
        h.fillStyle = grey(h, 0.75 + R() * 0.15); h.fillRect(bx + 2, by + 2, bw - 4, bhh - 4);
        r.fillStyle = grey(r, 0.68 + R() * 0.12); r.fillRect(bx, by, bw, bhh);
      }
      var ph = (inner - gap * (planks - 1)) / planks;
      for (var i = 0; i < planks; i++) board(frame, frame + i * (ph + gap), inner, ph, false, i);
      board(0, 0, S, frame - gap, false, 1); board(0, S - frame + gap, S, frame - gap, false, 2);
      board(0, frame - gap, frame - gap, S - (frame - gap) * 2, true, 3); board(S - frame + gap, frame - gap, frame - gap, S - (frame - gap) * 2, true, 0);
      x.fillStyle = "rgba(25,18,10,.85)"; // gaps read as dark shadow lines
      for (i = 1; i < planks; i++) x.fillRect(frame, frame + i * (ph + gap) - gap, inner, gap);
      x.fillStyle = "#3b3b3e"; [[29, 29], [S - 29, 29], [29, S - 29], [S - 29, S - 29], [S / 2, 29], [S / 2, S - 29]].forEach(function (p) { x.beginPath(); x.arc(p[0], p[1], 3.5, 0, 7); x.fill(); h.fillStyle = grey(h, 1); h.beginPath(); h.arc(p[0], p[1], 3, 0, 7); h.fill(); });
      noiseLayer(x, S, S, 64, 0.12, [40, 25, 10], [255, 230, 190], 3);
      return { map: c, normal: normalFrom(hc, 2.4), orm: ormFrom(rc) };
    },
    cardboard: function () {
      var S = 512, c = canvas(S), x = c.getContext("2d"), hc = canvas(S), h = hc.getContext("2d"), rc = canvas(S), r = rc.getContext("2d"), R = rng(11);
      x.fillStyle = "#b48d5d"; x.fillRect(0, 0, S, S); h.fillStyle = grey(h, 0.5); h.fillRect(0, 0, S, S); r.fillStyle = grey(r, 0.88); r.fillRect(0, 0, S, S);
      noiseLayer(x, S, S, 128, 0.25, [210, 175, 128], [120, 88, 52], 5);
      for (var i = 0; i < S; i += 7) { h.fillStyle = grey(h, 0.46 + (i / 7 % 2) * 0.06); h.fillRect(i, 0, 3, S); }
      for (i = 0; i < 400; i++) { x.fillStyle = "rgba(90,62,30," + R() * 0.15 + ")"; x.fillRect(R() * S, R() * S, 1 + R() * 3, 1); }
      x.fillStyle = "rgba(200,170,110,.92)"; x.fillRect(0, S / 2 - 34, S, 68); // packing tape
      r.fillStyle = grey(r, 0.32); r.fillRect(0, S / 2 - 34, S, 68); h.fillStyle = grey(h, 0.58); h.fillRect(0, S / 2 - 34, S, 68);
      x.strokeStyle = "rgba(255,255,255,.18)"; x.lineWidth = 2; x.beginPath(); x.moveTo(0, S / 2 - 30); x.lineTo(S, S / 2 - 28); x.stroke();
      x.fillStyle = "rgba(40,40,40,.55)"; x.font = "bold 34px sans-serif"; x.fillText("THIS SIDE UP  ↑↑", 30, 80);
      return { map: c, normal: normalFrom(hc, 1.2), orm: ormFrom(rc) };
    },
    drum: function () { // u around, v up; base paint is white, tinted by the material colour
      var W = 512, Hh = 512, c = canvas(W, Hh), x = c.getContext("2d"), hc = canvas(W, Hh), h = hc.getContext("2d"), rc = canvas(W, Hh), r = rc.getContext("2d"), mc = canvas(W, Hh), m = mc.getContext("2d"), R = rng(19);
      x.fillStyle = "#e9e9e9"; x.fillRect(0, 0, W, Hh); h.fillStyle = grey(h, 0.5); h.fillRect(0, 0, W, Hh); r.fillStyle = grey(r, 0.42); r.fillRect(0, 0, W, Hh); m.fillStyle = "#000"; m.fillRect(0, 0, W, Hh);
      noiseLayer(x, W, Hh, 48, 0.18, [255, 255, 255], [150, 150, 150], 2);
      [0.33, 0.66].forEach(function (v) { var y = Hh * (1 - v); var g = h.createLinearGradient(0, y - 10, 0, y + 10); g.addColorStop(0, grey(h, 0.5)); g.addColorStop(0.5, grey(h, 0.95)); g.addColorStop(1, grey(h, 0.5)); h.fillStyle = g; h.fillRect(0, y - 10, W, 20); });
      for (var i = 0; i < 90; i++) { // scratches through to bare steel
        var sx = R() * W, sy = R() * Hh, len = 6 + R() * 40, a = (R() - 0.5) * 0.6;
        x.strokeStyle = "rgba(170,172,176,.9)"; r.strokeStyle = grey(r, 0.3); m.strokeStyle = "#fff"; [x, r, m].forEach(function (q) { q.lineWidth = 1 + R(); q.beginPath(); q.moveTo(sx, sy); q.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); q.stroke(); });
      }
      for (i = 0; i < 26; i++) { // rust where the paint is gone, mostly near the rims and ribs
        var near = [0.03, 0.33, 0.66, 0.97][i % 4], ry = Hh * (1 - near) + (R() - 0.5) * 40, rx = R() * W, rs = 4 + R() * 16;
        var g2 = x.createRadialGradient(rx, ry, 0, rx, ry, rs); g2.addColorStop(0, "rgba(120,58,22,.9)"); g2.addColorStop(1, "rgba(120,58,22,0)"); x.fillStyle = g2; x.beginPath(); x.arc(rx, ry, rs, 0, 7); x.fill();
        r.fillStyle = grey(r, 0.92); r.beginPath(); r.arc(rx, ry, rs * 0.7, 0, 7); r.fill();
      }
      return { map: c, normal: normalFrom(hc, 3), orm: ormFrom(rc, mc) };
    },
    cone: function () { // u around, v up (1 = tip)
      var W = 256, Hh = 512, c = canvas(W, Hh), x = c.getContext("2d"), rc = canvas(W, Hh), r = rc.getContext("2d"), hc = canvas(W, Hh), h = hc.getContext("2d");
      var g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, "#ff6a26"); g.addColorStop(1, "#e2470f"); x.fillStyle = g; x.fillRect(0, 0, W, Hh);
      r.fillStyle = grey(r, 0.55); r.fillRect(0, 0, W, Hh); h.fillStyle = grey(h, 0.5); h.fillRect(0, 0, W, Hh);
      [[0.2, 0.32], [0.48, 0.56]].forEach(function (b) { var y0 = Hh * b[0], y1 = Hh * b[1]; x.fillStyle = "#e8ebec"; x.fillRect(0, y0, W, y1 - y0); r.fillStyle = grey(r, 0.3); r.fillRect(0, y0, W, y1 - y0);
        for (var k = 0; k < W; k += 4) for (var j = y0; j < y1; j += 4) { x.fillStyle = "rgba(255,255,255," + (((k + j) / 4) % 2 ? 0.25 : 0.05) + ")"; x.fillRect(k, j, 2, 2); } h.fillStyle = grey(h, 0.56); h.fillRect(0, y0, W, y1 - y0); });
      var d = x.createLinearGradient(0, Hh * 0.75, 0, Hh); d.addColorStop(0, "rgba(60,40,20,0)"); d.addColorStop(1, "rgba(60,40,20,.35)"); x.fillStyle = d; x.fillRect(0, Hh * 0.75, W, Hh * 0.25);
      noiseLayer(x, W, Hh, 32, 0.1, [255, 220, 200], [90, 40, 20], 9);
      return { map: c, normal: normalFrom(hc, 1.5), orm: ormFrom(rc) };
    },
    tread: function () { // torus: u along the ring, v around the tube (0.5 = outer tread)
      var W = 512, Hh = 256, c = canvas(W, Hh), x = c.getContext("2d"), hc = canvas(W, Hh), h = hc.getContext("2d"), rc = canvas(W, Hh), r = rc.getContext("2d");
      x.fillStyle = "#202022"; x.fillRect(0, 0, W, Hh); h.fillStyle = grey(h, 0.6); h.fillRect(0, 0, W, Hh); r.fillStyle = grey(r, 0.86); r.fillRect(0, 0, W, Hh);
      var y0 = Hh * 0.3, y1 = Hh * 0.7;
      for (var u = 0; u < W; u += 16) { // chevron blocks with grooves
        h.fillStyle = grey(h, 0.15); h.beginPath(); h.moveTo(u, y0); h.lineTo(u + 6, (y0 + y1) / 2); h.lineTo(u, y1); h.lineTo(u + 4, y1); h.lineTo(u + 10, (y0 + y1) / 2); h.lineTo(u + 4, y0); h.fill();
        x.fillStyle = "#151516"; x.beginPath(); x.moveTo(u, y0); x.lineTo(u + 6, (y0 + y1) / 2); x.lineTo(u, y1); x.lineTo(u + 4, y1); x.lineTo(u + 10, (y0 + y1) / 2); x.lineTo(u + 4, y0); x.fill();
      }
      h.fillStyle = grey(h, 0.2); h.fillRect(0, (y0 + y1) / 2 - 2, W, 4);
      noiseLayer(x, W, Hh, 64, 0.12, [80, 80, 80], [0, 0, 0], 4);
      return { map: c, normal: normalFrom(hc, 2.5), orm: ormFrom(rc) };
    },
    hay: function () {
      var S = 512, c = canvas(S), x = c.getContext("2d"), hc = canvas(S), h = hc.getContext("2d"), R = rng(23);
      x.fillStyle = "#b8973f"; x.fillRect(0, 0, S, S); h.fillStyle = grey(h, 0.4); h.fillRect(0, 0, S, S);
      var cols = ["#d9bb62", "#c9a64b", "#e6cd80", "#a8863a", "#8f7230", "#efdc9a"];
      for (var i = 0; i < 4200; i++) {
        var sx = R() * S, sy = R() * S, len = 10 + R() * 34, a = (R() - 0.5) * 0.9 + (R() < 0.15 ? Math.PI / 2 : 0);
        x.strokeStyle = cols[i % cols.length]; x.lineWidth = 0.8 + R() * 1.6; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); x.stroke();
        h.strokeStyle = grey(h, 0.4 + R() * 0.6); h.lineWidth = x.lineWidth; h.beginPath(); h.moveTo(sx, sy); h.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); h.stroke();
      }
      var rc = canvas(S); var r = rc.getContext("2d"); r.fillStyle = grey(r, 0.95); r.fillRect(0, 0, S, S);
      return { map: c, normal: normalFrom(hc, 3.5), orm: ormFrom(rc) };
    },
    pages: function () {
      var S = 256, c = canvas(S), x = c.getContext("2d"), hc = canvas(S), h = hc.getContext("2d");
      x.fillStyle = "#efe6d2"; x.fillRect(0, 0, S, S); h.fillStyle = grey(h, 0.5); h.fillRect(0, 0, S, S);
      for (var y = 0; y < S; y += 2) { x.fillStyle = "rgba(150,135,110," + (0.08 + (y * 37 % 11) / 60) + ")"; x.fillRect(0, y, S, 1); h.fillStyle = grey(h, y % 4 ? 0.45 : 0.55); h.fillRect(0, y, S, 1); }
      var rc = canvas(S); var r = rc.getContext("2d"); r.fillStyle = grey(r, 0.85); r.fillRect(0, 0, S, S);
      return { map: c, normal: normalFrom(hc, 1), orm: ormFrom(rc) };
    },
    spine: function () { // white base, tinted by the cover colour: bands and a title block
      var W = 128, Hh = 512, c = canvas(W, Hh), x = c.getContext("2d");
      x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, Hh);
      x.fillStyle = "rgba(255,215,120,.9)"; [40, 52, Hh - 60, Hh - 48].forEach(function (y) { x.fillRect(8, y, W - 16, 4); });
      x.fillStyle = "rgba(0,0,0,.18)"; x.fillRect(22, 120, W - 44, 220);
      x.fillStyle = "rgba(255,220,140,.85)"; for (var i = 0; i < 6; i++) x.fillRect(32, 140 + i * 30, W - 64 - (i % 3) * 10, 8);
      return { map: c };
    },
    sign: function () { // drawn upright inside a square that is mounted at 45 degrees
      var S = 512, c = canvas(S), x = c.getContext("2d"), rc = canvas(S), r = rc.getContext("2d");
      x.fillStyle = "#c7c9cb"; x.fillRect(0, 0, S, S);
      x.save(); x.translate(S / 2, S / 2); x.rotate(-Math.PI / 4); x.translate(-S / 2, -S / 2);
      x.fillStyle = "#121212"; x.fillRect(14, 14, S - 28, S - 28); x.fillStyle = "#f2c200"; x.fillRect(30, 30, S - 60, S - 60);
      x.restore();
      x.fillStyle = "#121212"; x.font = "bold 92px Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("SLOW", S / 2, S / 2 + 4);
      for (var i = 0; i < 2600; i++) { x.fillStyle = "rgba(255,255,255,.07)"; x.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
      r.fillStyle = grey(r, 0.35); r.fillRect(0, 0, S, S);
      return { map: c, orm: ormFrom(rc) };
    },
    checker: function () {
      var S = 256, c = canvas(S), x = c.getContext("2d"), n = 8;
      for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? "#111" : "#f2f2f2"; x.fillRect(i * S / n, j * S / n, S / n, S / n); }
      return { map: c };
    },
    pin: function () { // lathe: u around, v along the profile (0 base, 1 top)
      var W = 128, Hh = 512, c = canvas(W, Hh), x = c.getContext("2d");
      x.fillStyle = "#f4f2ec"; x.fillRect(0, 0, W, Hh);
      x.fillStyle = "#c4161c"; [0.27, 0.33].forEach(function (v) { x.fillRect(0, Hh * v, W, Hh * 0.035); });
      for (var i = 0; i < 40; i++) { x.fillStyle = "rgba(120,110,100,.12)"; x.fillRect(Math.random() * W, Hh * (0.6 + Math.random() * 0.4), 3 + Math.random() * 8, 1); }
      return { map: c };
    },
    diamondPlate: function () {
      var S = 256, hc = canvas(S), h = hc.getContext("2d"), c = canvas(S), x = c.getContext("2d");
      x.fillStyle = "#a9adb2"; x.fillRect(0, 0, S, S); h.fillStyle = grey(h, 0.3); h.fillRect(0, 0, S, S);
      noiseLayer(x, S, S, 64, 0.2, [220, 222, 226], [120, 122, 128], 6);
      for (var i = 0; i < 8; i++) for (var j = 0; j < 8; j++) {
        var cx = i * 32 + (j % 2) * 16 + 8, cy = j * 32 + 16, a = (i + j) % 2 ? Math.PI / 4 : -Math.PI / 4;
        h.save(); h.translate(cx, cy); h.rotate(a); h.fillStyle = grey(h, 0.9); h.fillRect(-11, -2.5, 22, 5); h.restore();
      }
      var rc = canvas(S); var r = rc.getContext("2d"); r.fillStyle = grey(r, 0.4); r.fillRect(0, 0, S, S);
      var mc = canvas(S); var m = mc.getContext("2d"); m.fillStyle = "#fff"; m.fillRect(0, 0, S, S);
      return { map: c, normal: normalFrom(hc, 3), orm: ormFrom(rc, mc) };
    },
    brushed: function () {
      var S = 256, hc = canvas(S), h = hc.getContext("2d"), rc = canvas(S), r = rc.getContext("2d"), R = rng(31);
      h.fillStyle = grey(h, 0.5); h.fillRect(0, 0, S, S); r.fillStyle = grey(r, 0.34); r.fillRect(0, 0, S, S);
      for (var y = 0; y < S; y++) { var v = 0.45 + R() * 0.1; h.fillStyle = grey(h, v); h.fillRect(0, y, S, 1); r.fillStyle = grey(r, 0.28 + R() * 0.12); r.fillRect(0, y, S, 1); }
      var mc = canvas(S); var m = mc.getContext("2d"); m.fillStyle = "#fff"; m.fillRect(0, 0, S, S);
      return { normal: normalFrom(hc, 0.8), orm: ormFrom(rc, mc) };
    },
    rubber: function () {
      var S = 256, hc = canvas(S), h = hc.getContext("2d");
      h.fillStyle = grey(h, 0.5); h.fillRect(0, 0, S, S); noiseLayer(h, S, S, 96, 0.5, [255, 255, 255], [0, 0, 0], 13);
      return { normal: normalFrom(hc, 1.2) };
    },
    weave: function () {
      var S = 256, hc = canvas(S), h = hc.getContext("2d"), c = canvas(S), x = c.getContext("2d");
      x.fillStyle = "#1c1c1e"; x.fillRect(0, 0, S, S);
      for (var i = 0; i < S; i += 4) for (var j = 0; j < S; j += 4) { var o = ((i + j) / 4) % 2; h.fillStyle = grey(h, o ? 0.65 : 0.4); h.fillRect(i, j, 4, 4); x.fillStyle = o ? "#1f1f22" : "#18181a"; x.fillRect(i, j, 4, 4); }
      return { map: c, normal: normalFrom(hc, 1.6) };
    },
    domino: function () { // front face: ivory with a centre line and pips (3 | 5)
      var W = 128, Hh = 256, c = canvas(W, Hh), x = c.getContext("2d");
      x.fillStyle = "#f3eee2"; x.fillRect(0, 0, W, Hh); x.fillStyle = "#1a1a1a"; x.fillRect(12, Hh / 2 - 2, W - 24, 4);
      function pip(px, py) { x.beginPath(); x.arc(px, py, 9, 0, 7); x.fill(); }
      [[0.25, 0.12], [0.5, 0.25], [0.75, 0.38]].forEach(function (p) { pip(W * p[0], Hh * p[1]); });
      [[0.25, 0.62], [0.75, 0.62], [0.5, 0.75], [0.25, 0.88], [0.75, 0.88]].forEach(function (p) { pip(W * p[0], Hh * p[1]); });
      return { map: c };
    }
  };

  // ---------- material presets ----------
  var MAT_CACHE = {};
  function sceneMaterial(name) { var found = null; window.__studio.scene.traverse(function (o) { if (!found && o.material) [].concat(o.material).forEach(function (m) { if (!found && m.name === name) found = m; }); }); return found; }
  function scan(name) { // the room's own textures, shared with the room
    var m = sceneMaterial(name); return m ? { map: m.map, normal: m.normalMap, orm: m.roughnessMap || m.metalnessMap, ns: m.normalScale && m.normalScale.x } : null;
  }
  function withRepeat(t, rx, ry) { if (!t) return null; var c = t.clone(); c.repeat.set(rx, ry || rx); c.needsUpdate = true; return c; }
  function fromSet(name, opts) {
    var s = set(name, GEN[name]); opts = opts || {};
    var p = { map: s.map ? tex(s.map, true) : null, normalMap: s.normal ? tex(s.normal, false) : null };
    if (s.orm) { var o = tex(s.orm, false); p.roughnessMap = o; if (opts.metalMap) p.metalnessMap = o; }
    return p;
  }
  // name -> builder(color) returning material parameters (textures shared)
  var PRESET = {
    "wood": function () { var s = scan("white-oak-oiled"); return { map: s && s.map, normalMap: s && s.normal, roughnessMap: s && s.orm, color: "#ffffff", roughness: 1, metalness: 0, normalScale: 0.5 }; },
    "dark wood": function () { var p = PRESET.wood(); p.color = "#6a4a32"; return p; },
    "crate wood": function () { var p = fromSet("crate"); p.roughness = 1; p.metalness = 0; return p; },
    "cardboard": function () { var p = fromSet("cardboard"); p.roughness = 1; p.metalness = 0; return p; },
    "painted metal": function (c) { var p = fromSet("drum", { metalMap: true }); p.color = c || "#2a5d9f"; p.roughness = 1; p.metalness = 1; p.normalScale = 0.6; return p; },
    "steel": function () { var p = fromSet("brushed", { metalMap: true }); p.color = "#c3c6ca"; p.roughness = 1; p.metalness = 1; p.normalScale = 0.3; return p; },
    "metal": function () { return PRESET.steel(); },
    "black metal": function () { var s = scan("black-powdercoat"); return { normalMap: s && s.normal, color: "#1d1e20", roughness: 0.55, metalness: 0.6, normalScale: 0.6 }; },
    "diamond plate": function () { var p = fromSet("diamondPlate", { metalMap: true }); p.roughness = 1; p.metalness = 1; p.normalScale = 1; return p; },
    "concrete": function () { var s = scan("polished-concrete"); return { map: s && s.map, normalMap: s && s.normal, roughnessMap: s && s.orm, color: "#d9d6d0", roughness: 1, metalness: 0, normalScale: 0.8 }; },
    "stone": function () { var p = PRESET.concrete(); p.color = "#8d8a84"; p.normalScale = 1.2; return p; },
    "plaster": function () { var s = scan("wall-paint"); return { normalMap: s && s.normal, roughnessMap: s && s.orm, color: "#ecebe6", roughness: 1, metalness: 0, normalScale: 0.4 }; },
    "fabric": function (c) { var s = scan("upholstery") || scan("felt-desk-pad"); var f = scan("felt-desk-pad"); return { map: s && s.map, normalMap: (f && f.normal) || (s && s.normal), color: c || "#7f8c99", roughness: 0.95, metalness: 0, normalScale: 0.8 }; },
    "rubber": function (c) { var p = fromSet("rubber"); p.color = c || "#1f1f21"; p.roughness = 0.9; p.metalness = 0; p.normalScale = 0.5; return p; },
    "plastic": function (c) { var p = fromSet("rubber"); p.color = c || "#d8d4cc"; p.roughness = 0.38; p.metalness = 0; p.normalScale = 0.08; return p; },
    "glass": function () { return { color: "#dfe9ec", roughness: 0.04, metalness: 0, opacity: 0.32, transparent: true }; },
    "ice": function () { var p = fromSet("rubber"); p.color = "#d6ecf5"; p.roughness = 0.08; p.metalness = 0; p.opacity = 0.78; p.transparent = true; p.normalScale = 0.25; return p; },
    "neon": function (c) { return { color: c || "#ff3fa4", emissive: c || "#ff3fa4", emissiveIntensity: 3, roughness: 0.4, metalness: 0 }; },
    "hay": function () { var p = fromSet("hay"); p.roughness = 1; p.metalness = 0; return p; },
    "tyre": function () { var p = fromSet("tread"); p.roughness = 1; p.metalness = 0; p.normalScale = 1; return p; },
    "cone plastic": function () { var p = fromSet("cone"); p.roughness = 1; p.metalness = 0; return p; },
    "pages": function () { var p = fromSet("pages"); p.roughness = 1; p.metalness = 0; return p; },
    "book cloth": function (c) { var s = scan("felt-desk-pad"); var p = fromSet("spine"); p.normalMap = s && s.normal; p.color = c || "#7a2a2a"; p.roughness = 0.85; p.metalness = 0; p.normalScale = 0.5; return p; },
    "road sign": function () { var p = fromSet("sign"); p.roughness = 1; p.metalness = 0; return p; },
    "galvanised": function () { var p = fromSet("brushed", { metalMap: true }); p.color = "#a7abae"; p.roughness = 1; p.metalness = 1; p.normalScale = 0.2; return p; },
    "checker cloth": function () { var s = scan("felt-desk-pad"); var p = fromSet("checker"); p.normalMap = s && s.normal; p.roughness = 0.9; p.metalness = 0; p.side = 2; return p; },
    "pin plastic": function () { var p = fromSet("pin"); p.roughness = 0.22; p.metalness = 0; return p; },
    "weave": function () { var p = fromSet("weave"); if (p.map) p.map.repeat.set(3, 3); if (p.normalMap) p.normalMap.repeat.set(3, 3); p.roughness = 0.85; p.metalness = 0; p.normalScale = 0.6; return p; },
    "domino": function () { var p = fromSet("domino"); p.roughness = 0.3; p.metalness = 0; return p; },
    "latex": function (c) { return { color: c || "#d0192b", roughness: 0.22, metalness: 0 }; },
    "glow": function (c) { return { color: c || "#ffe8c4", emissive: c || "#ffe2b0", emissiveIntensity: 2, roughness: 0.5, metalness: 0 }; },
    "zone": function () { return { color: "#33c3ff", opacity: 0.18, transparent: true, roughness: 1, metalness: 0, depthWrite: false }; }
  };
  // presets that "make it <material>" may apply to any object (shown in commands)
  var PUBLIC = ["wood", "dark wood", "crate wood", "cardboard", "painted metal", "steel", "metal", "black metal", "diamond plate", "concrete", "stone", "plaster", "fabric", "rubber", "plastic", "glass", "ice", "neon", "hay"];
  function material(name, color) {
    var key = name + "|" + (color || "");
    if (MAT_CACHE[key]) return MAT_CACHE[key];
    var THREE = T(), p = PRESET[name](color), ns = p.normalScale; delete p.normalScale;
    var side = p.side; delete p.side;
    for (var k in p) if (p[k] == null) delete p[k];
    var m = new THREE.MeshStandardMaterial(p);
    if (ns != null && m.normalMap) m.normalScale.set(ns, ns);
    if (side) m.side = side;
    m.name = "preset-" + name.replace(/\s+/g, "-");
    return (MAT_CACHE[key] = m);
  }

  // a cached variant of a preset material (e.g. double-sided), shared by every copy
  function variant(key, base, tweak) { if (MAT_CACHE[key]) return MAT_CACHE[key]; var m = base.clone(); tweak(m); m.name = base.name + "-" + key.split("|")[0]; return (MAT_CACHE[key] = m); }

  // ---------- geometry helpers ----------
  // rounded box: a subdivided box whose corners are pushed onto spheres; keeps per-face UVs
  function roundedBox(w, h, d, r, seg) {
    var THREE = T(), g = new THREE.BoxGeometry(w, h, d, seg || 4, seg || 4, seg || 4), p = g.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3();
    var hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      inner.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
      v.sub(inner); if (v.lengthSq() > 0) v.setLength(r);
      p.setXYZ(i, inner.x + v.x, inner.y + v.y, inner.z + v.z);
    }
    g.computeVertexNormals();
    return g;
  }
  // scale a box's per-face UVs to metres / tile so wood grain and concrete keep a real size
  function boxUV(g, w, h, d, tile) {
    var uv = g.attributes.uv, spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]], per = uv.count / 6;
    for (var i = 0; i < uv.count; i++) { var s = spans[Math.floor(i / per)]; uv.setXY(i, uv.getX(i) * s[0] / tile, uv.getY(i) * s[1] / tile); }
    uv.needsUpdate = true;
    return g;
  }
  function mesh(geo, mat, x, y, z) {
    var THREE = T(), m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function group() { return new (T().Group)(); }
  function box(w, h, d, tile) { return boxUV(new (T().BoxGeometry)(w, h, d), w, h, d, tile || 1); }
  function cyl(rt, rb, h, seg) { return new (T().CylinderGeometry)(rt, rb, h, seg || 24); }
  function cub(hx, hy, hz, ox, oy, oz) { return { kind: "cuboid", size: [hx, hy, hz], offset: [ox || 0, oy || 0, oz || 0] }; }
  function cyc(r, hh, ox, oy, oz) { return { kind: "cylinder", size: [r, hh], offset: [ox || 0, oy || 0, oz || 0] }; }
  // geometry is built standing on y = 0; centre() moves it so the object's origin is its middle,
  // which is what the engine's spawn placement expects
  function centre(g, shapes, h) { g.children.forEach(function (c) { c.position.y -= h / 2; }); shapes.forEach(function (s) { s.offset[1] -= h / 2; }); return { object: g, shapes: shapes }; }

  // ---------- the props ----------
  // size: [w, h, d] in metres; phys: Appendix B style starting values; dyn: dynamic by default
  var P = {};
  function prop(name, def) { def.name = name; P[name] = def; }
  var GEO = {}; function geo(key, make) { return GEO[key] || (GEO[key] = make()); }

  // Office
  prop("crate", { label: "Crate", group: "Office", size: [0.5, 0.5, 0.5], phys: { mass: 9, friction: 0.6, restitution: 0.12 }, preset: "Wood",
    build: function () { var g = group(); g.add(mesh(geo("crate", function () { return roundedBox(0.5, 0.5, 0.5, 0.008, 2); }), material("crate wood"), 0, 0.25, 0)); return centre(g, [cub(0.25, 0.25, 0.25, 0, 0.25, 0)], 0.5); } });
  prop("cardboard box", { label: "Cardboard box", group: "Office", size: [0.4, 0.3, 0.3], phys: { mass: 1.2, friction: 0.7, restitution: 0.08 }, preset: "Foam",
    build: function () { var g = group(); g.add(mesh(geo("cardboard", function () { return roundedBox(0.4, 0.3, 0.3, 0.004, 2); }), material("cardboard"), 0, 0.15, 0)); return centre(g, [cub(0.2, 0.15, 0.15, 0, 0.15, 0)], 0.3); } });
  prop("barrel", { label: "Steel drum", group: "Office", size: [0.58, 0.88, 0.58], phys: { mass: 18, friction: 0.55, restitution: 0.1 }, preset: "Heavy Metal",
    build: function (color) {
      var THREE = T(), g = group(), paint = material("painted metal", color), lid = material("galvanised");
      g.add(mesh(geo("drum", function () { return cyl(0.29, 0.29, 0.86, 40); }), [paint, lid, lid], 0, 0.44, 0));
      [0.02, 0.3, 0.58, 0.86].forEach(function (y) { var t = mesh(geo("drumRib", function () { var q = new THREE.TorusGeometry(0.29, 0.011, 8, 48); q.rotateX(Math.PI / 2); return q; }), y === 0.3 || y === 0.58 ? paint : lid, 0, y + 0.01, 0); g.add(t); });
      return centre(g, [cyc(0.3, 0.44, 0, 0.44, 0)], 0.88);
    } });
  prop("bin", { label: "Waste bin", group: "Office", size: [0.3, 0.32, 0.3], phys: { mass: 0.8, friction: 0.5, restitution: 0.15 }, preset: "Plastic",
    build: function () {
      var THREE = T(), g = group(), m = material("black metal"), m2 = variant("double|black metal", m, function (x) { x.side = THREE.DoubleSide; });
      var side = mesh(geo("binSide", function () { return new THREE.CylinderGeometry(0.15, 0.12, 0.32, 32, 1, true); }), m2, 0, 0.16, 0);
      g.add(side, mesh(geo("binBase", function () { return cyl(0.12, 0.12, 0.008, 32); }), m, 0, 0.004, 0));
      return centre(g, [cyc(0.14, 0.16, 0, 0.16, 0)], 0.32);
    } });
  prop("chair", { label: "Wooden chair", group: "Office", size: [0.44, 0.88, 0.42], phys: { mass: 5, friction: 0.6, restitution: 0.1 }, preset: "Wood",
    build: function () {
      var g = group(), w = material("wood"), legH = 0.43, s = 0.035;
      g.add(mesh(geo("chairSeat", function () { return boxUV(roundedBox(0.44, 0.035, 0.42, 0.006, 2), 0.44, 0.035, 0.42, 1); }), w, 0, legH + 0.0175, 0));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) { g.add(mesh(geo("chairLeg", function () { return box(s, legH, s, 1); }), w, c[0] * (0.22 - s / 2), legH / 2, c[1] * (0.21 - s / 2))); });
      [-1, 1].forEach(function (c) { g.add(mesh(geo("chairPost", function () { return box(s, 0.42, s, 1); }), w, c * (0.22 - s / 2), legH + 0.035 + 0.21, -0.21 + s / 2)); });
      [0.62, 0.8].forEach(function (y) { g.add(mesh(geo("chairRail", function () { return box(0.4, 0.06, 0.022, 1); }), w, 0, y, -0.21 + s / 2)); });
      return centre(g, [cub(0.22, 0.2325, 0.21, 0, 0.2325, 0), cub(0.22, 0.21, 0.02, 0, 0.675, -0.19)], 0.88);
    } });
  prop("table", { label: "Side table", group: "Office", size: [0.9, 0.75, 0.6], phys: { mass: 14, friction: 0.6, restitution: 0.05 }, preset: "Wood",
    build: function () {
      var g = group(), w = material("wood"), m = material("black metal"), legH = 0.715;
      g.add(mesh(geo("tableTop", function () { return boxUV(roundedBox(0.9, 0.035, 0.6, 0.006, 2), 0.9, 0.035, 0.6, 1); }), w, 0, legH + 0.0175, 0));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) { g.add(mesh(geo("tableLeg", function () { return box(0.04, legH, 0.04, 1); }), m, c[0] * 0.41, legH / 2, c[1] * 0.26)); });
      return centre(g, [cub(0.45, 0.0175, 0.3, 0, legH + 0.0175, 0), cub(0.43, 0.35, 0.28, 0, 0.35, 0)], 0.75);
    } });
  prop("shelf", { label: "Bookshelf", group: "Office", size: [0.8, 1.2, 0.3], phys: { mass: 20, friction: 0.6, restitution: 0.05 }, preset: "Wood",
    build: function () {
      var g = group(), w = material("wood"), back = material("dark wood");
      [-1, 1].forEach(function (c) { g.add(mesh(geo("shelfSide", function () { return box(0.02, 1.2, 0.3, 1); }), w, c * 0.39, 0.6, 0)); });
      [0.01, 0.4, 0.8, 1.19].forEach(function (y) { g.add(mesh(geo("shelfBoard", function () { return box(0.76, 0.02, 0.29, 1); }), w, 0, y, 0.005)); });
      g.add(mesh(geo("shelfBack", function () { return box(0.76, 1.18, 0.006, 1); }), back, 0, 0.6, -0.147));
      return centre(g, [cub(0.4, 0.6, 0.15, 0, 0.6, 0)], 1.2);
    } });
  prop("cushion", { label: "Cushion", group: "Office", size: [0.45, 0.13, 0.45], phys: { mass: 0.5, friction: 0.9, restitution: 0.25 }, preset: "Foam",
    build: function (color) { var g = group(); g.add(mesh(geo("cushion", function () { return roundedBox(0.45, 0.13, 0.45, 0.055, 6); }), material("fabric", color), 0, 0.065, 0)); return centre(g, [cub(0.22, 0.065, 0.22, 0, 0.065, 0)], 0.13); } });
  prop("books", { label: "Books", group: "Office", size: [0.17, 0.25, 0.17], phys: { mass: 2.4, friction: 0.6, restitution: 0.05 }, preset: "Wood",
    build: function () {
      var g = group(), pages = material("pages"), x = -0.075, cols = ["#6e2324", "#24405f", "#2d5a3d", "#7a6a4b"], hs = [0.24, 0.22, 0.25, 0.21], ts = [0.035, 0.042, 0.03, 0.045];
      for (var i = 0; i < 4; i++) {
        var cloth = material("book cloth", cols[i]), t = ts[i], h = hs[i];
        // BoxGeometry faces: +x, -x, +y, -y, +z (spine), -z
        g.add(mesh(geo("book" + i, function () { return new (T().BoxGeometry)(t, h, 0.17); }), [cloth, cloth, pages, pages, cloth, pages], x + t / 2, h / 2, 0));
        x += t + 0.002;
      }
      return centre(g, [cub(0.078, 0.125, 0.085, 0, 0.125, 0)], 0.25);
    } });
  // Driving
  prop("cone", { label: "Traffic cone", group: "Driving", size: [0.38, 0.7, 0.38], phys: { mass: 2.5, friction: 0.8, restitution: 0.2 }, preset: "Bouncy Rubber",
    build: function () {
      var g = group();
      g.add(mesh(geo("coneBase", function () { return roundedBox(0.38, 0.03, 0.38, 0.012, 2); }), material("rubber"), 0, 0.015, 0));
      g.add(mesh(geo("coneBody", function () { return new (T().CylinderGeometry)(0.025, 0.15, 0.66, 32, 1, false); }), material("cone plastic"), 0, 0.03 + 0.33, 0));
      return centre(g, [cub(0.19, 0.015, 0.19, 0, 0.015, 0), cyc(0.11, 0.33, 0, 0.36, 0)], 0.7);
    } });
  prop("barrier", { label: "Concrete barrier", group: "Driving", size: [0.6, 0.81, 1.2], phys: { mass: 600, friction: 0.8, restitution: 0.02 }, preset: "Stone",
    build: function () {
      var THREE = T(), g = group(), s = new THREE.Shape();
      [[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.13, 0.33], [0.1, 0.81], [-0.1, 0.81], [-0.13, 0.33], [-0.3, 0.08]].forEach(function (p, i) { if (i) s.lineTo(p[0], p[1]); else s.moveTo(p[0], p[1]); });
      var e = geo("barrier", function () { var q = new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1 }); q.translate(0, 0, -0.6); var uv = q.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.5, uv.getY(i) / 1.5); return q; });
      g.add(mesh(e, material("concrete")));
      return centre(g, [cub(0.3, 0.165, 0.6, 0, 0.165, 0), cub(0.12, 0.24, 0.6, 0, 0.57, 0)], 0.81);
    } });
  function tyreGeo() { var THREE = T(); return geo("tyre", function () { var q = new THREE.TorusGeometry(0.29, 0.105, 18, 48); q.rotateX(Math.PI / 2); return q; }); }
  prop("tire", { label: "Tyre", group: "Driving", size: [0.8, 0.21, 0.8], phys: { mass: 10, friction: 0.95, restitution: 0.5 }, preset: "Bouncy Rubber",
    build: function () { var g = group(); g.add(mesh(tyreGeo(), material("tyre"), 0, 0.105, 0)); return centre(g, [cyc(0.39, 0.105, 0, 0.105, 0)], 0.21); } });
  prop("tire stack", { label: "Tyre stack", group: "Driving", size: [0.8, 0.63, 0.8], phys: { mass: 30, friction: 0.95, restitution: 0.4 }, preset: "Bouncy Rubber",
    build: function () { var g = group(), m = material("tyre"); for (var i = 0; i < 3; i++) { var t = mesh(tyreGeo(), m, (i % 2) * 0.012, 0.105 + i * 0.21, 0); t.rotation.y = i * 0.7; g.add(t); } return centre(g, [cyc(0.39, 0.315, 0, 0.315, 0)], 0.63); } });
  prop("hay bale", { label: "Hay bale", group: "Driving", size: [0.9, 0.45, 0.45], phys: { mass: 22, friction: 0.95, restitution: 0.05 }, preset: "Foam",
    build: function () {
      var g = group(); g.add(mesh(geo("hay", function () { return roundedBox(0.9, 0.45, 0.45, 0.035, 4); }), material("hay"), 0, 0.225, 0));
      var twine = material("plastic", "#d8c79a"); [-0.25, 0.25].forEach(function (x) { g.add(mesh(geo("twine", function () { return box(0.012, 0.462, 0.462, 1); }), twine, x, 0.225, 0)); });
      return centre(g, [cub(0.45, 0.225, 0.225, 0, 0.225, 0)], 0.45);
    } });
  prop("sign", { label: "Road sign", group: "Driving", size: [0.5, 1.9, 0.5], phys: { mass: 12, friction: 0.8, restitution: 0.05 }, preset: "Heavy Metal",
    build: function () {
      var g = group(), steel = material("galvanised");
      g.add(mesh(geo("signBase", function () { return roundedBox(0.5, 0.08, 0.5, 0.02, 2); }), material("rubber"), 0, 0.04, 0));
      g.add(mesh(geo("signPost", function () { return cyl(0.025, 0.025, 1.45, 16); }), steel, 0, 0.08 + 0.725, 0));
      var plate = mesh(geo("signPlate", function () { return new (T().BoxGeometry)(0.55, 0.55, 0.008); }), [steel, steel, steel, steel, material("road sign"), steel], 0, 1.5, 0.02);
      plate.rotation.z = Math.PI / 4; g.add(plate);
      return centre(g, [cub(0.25, 0.04, 0.25, 0, 0.04, 0), cyc(0.03, 0.73, 0, 0.8, 0), cub(0.28, 0.28, 0.02, 0, 1.5, 0.02)], 1.9);
    } });
  prop("flag", { label: "Checkered flag", group: "Driving", size: [0.6, 1.5, 0.3], phys: { mass: 2, friction: 0.7, restitution: 0.05 }, preset: "Wood",
    build: function () {
      var THREE = T(), g = group();
      g.add(mesh(geo("flagBase", function () { return cyl(0.12, 0.14, 0.04, 24); }), material("rubber"), 0, 0.02, 0));
      g.add(mesh(geo("flagPole", function () { return cyl(0.012, 0.012, 1.46, 12); }), material("plastic", "#f2f2f2"), 0, 0.04 + 0.73, 0));
      var cloth = mesh(geo("flagCloth", function () { var q = new THREE.PlaneGeometry(0.5, 0.35, 16, 8), p = q.attributes.position; for (var i = 0; i < p.count; i++) { var x = p.getX(i) + 0.25; p.setZ(i, Math.sin(x * 11) * 0.025 * x * 2); } q.computeVertexNormals(); q.translate(0.25, 0, 0); return q; }), material("checker cloth"), 0.012, 1.3, 0);
      cloth.castShadow = true; g.add(cloth);
      return centre(g, [cyc(0.13, 0.02, 0, 0.02, 0), cyc(0.015, 0.73, 0, 0.77, 0)], 1.5);
    } });
  // Basic and building shapes (static by default)
  function slab(name, label, w, h, d, matName, tile, mass) {
    prop(name, { label: label, group: "Building", size: [w, h, d], phys: { mass: mass, friction: 0.7, restitution: 0.02 }, dyn: false, preset: "Static Lock",
      build: function () { var g = group(); g.add(mesh(geo(name, function () { return boxUV(roundedBox(w, h, d, 0.004, 1), w, h, d, tile); }), material(matName), 0, h / 2, 0)); return centre(g, [cub(w / 2, h / 2, d / 2, 0, h / 2, 0)], h); } });
  }
  slab("wall", "Wall", 2, 2.4, 0.12, "plaster", 1.5, 300);
  slab("platform", "Platform", 1.2, 0.1, 1.2, "concrete", 1.5, 140);
  slab("pillar", "Pillar", 0.3, 2.4, 0.3, "concrete", 1.5, 520);
  prop("beam", { label: "Wooden beam", group: "Building", size: [2, 0.15, 0.15], phys: { mass: 20, friction: 0.6, restitution: 0.05 }, preset: "Wood",
    build: function () { var g = group(); g.add(mesh(geo("beam", function () { return boxUV(roundedBox(2, 0.15, 0.15, 0.006, 1), 2, 0.15, 0.15, 1); }), material("wood"), 0, 0.075, 0)); return centre(g, [cub(1, 0.075, 0.075, 0, 0.075, 0)], 0.15); } });
  prop("stairs", { label: "Stairs", group: "Building", size: [0.9, 0.51, 0.84], phys: { mass: 400, friction: 0.8, restitution: 0.02 }, dyn: false, preset: "Static Lock",
    build: function () { var g = group(), m = material("concrete"), sh = []; for (var i = 0; i < 3; i++) { var h = 0.17 * (i + 1), d = 0.28; g.add(mesh(geo("step" + i, function () { return box(0.9, h, d, 1.5); }), m, 0, h / 2, -0.42 + 0.14 + i * d)); sh.push(cub(0.45, h / 2, 0.14, 0, h / 2, -0.28 + i * d)); } return centre(g, sh, 0.51); } });
  prop("arch", { label: "Arch", group: "Building", size: [1.5, 2.45, 0.25], phys: { mass: 600, friction: 0.7, restitution: 0.02 }, dyn: false, preset: "Static Lock",
    build: function () { var g = group(), m = material("plaster"); [-1, 1].forEach(function (c) { g.add(mesh(geo("archPier", function () { return box(0.25, 2.2, 0.25, 1.5); }), m, c * 0.625, 1.1, 0)); }); g.add(mesh(geo("archTop", function () { return box(1.5, 0.25, 0.25, 1.5); }), m, 0, 2.325, 0)); return centre(g, [cub(0.125, 1.1, 0.125, -0.625, 1.1, 0), cub(0.125, 1.1, 0.125, 0.625, 1.1, 0), cub(0.75, 0.125, 0.125, 0, 2.325, 0)], 2.45); } });
  // Interactive (wired to the engine's components when spawned by a command)
  prop("button", { label: "Push button", group: "Interactive", size: [0.1, 0.06, 0.1], phys: { mass: 0.3, friction: 0.8, restitution: 0.05 }, comp: ["Interactable", { prompt: "Press" }], preset: "Plastic",
    build: function () { var g = group(); g.add(mesh(geo("btnBase", function () { return cyl(0.05, 0.055, 0.035, 24); }), material("black metal"), 0, 0.0175, 0)); g.add(mesh(geo("btnCap", function () { return cyl(0.034, 0.034, 0.025, 24); }), material("plastic", "#d01c1f"), 0, 0.047, 0)); return centre(g, [cyc(0.055, 0.03, 0, 0.03, 0)], 0.06); } });
  prop("switch", { label: "Light switch", group: "Interactive", size: [0.09, 0.13, 0.03], phys: { mass: 0.2, friction: 0.6, restitution: 0.05 }, dyn: false, comp: ["Interactable", { prompt: "Switch" }], preset: "Static Lock",
    build: function () { var g = group(), m = material("plastic", "#f1efe9"); g.add(mesh(geo("swPlate", function () { return roundedBox(0.09, 0.13, 0.01, 0.004, 2); }), m, 0, 0.065, 0)); var t = mesh(geo("swToggle", function () { return roundedBox(0.022, 0.04, 0.016, 0.004, 2); }), m, 0, 0.065, 0.012); t.rotation.x = 0.25; g.add(t); return centre(g, [cub(0.045, 0.065, 0.015, 0, 0.065, 0)], 0.13); } });
  prop("lever", { label: "Lever", group: "Interactive", size: [0.14, 0.3, 0.1], phys: { mass: 3, friction: 0.7, restitution: 0.05 }, dyn: false, comp: ["Interactable", { prompt: "Pull" }], preset: "Static Lock",
    build: function () {
      var g = group(); g.add(mesh(geo("levBase", function () { return roundedBox(0.14, 0.05, 0.1, 0.01, 2); }), material("diamond plate"), 0, 0.025, 0));
      var arm = mesh(geo("levArm", function () { return cyl(0.01, 0.01, 0.22, 12); }), material("steel"), 0.03, 0.14, 0); arm.rotation.z = -0.35; g.add(arm);
      g.add(mesh(geo("levKnob", function () { return new (T().SphereGeometry)(0.025, 16, 12); }), material("plastic", "#141414"), 0.068, 0.245, 0));
      return centre(g, [cub(0.07, 0.025, 0.05, 0, 0.025, 0), cub(0.04, 0.12, 0.03, 0.03, 0.16, 0)], 0.3);
    } });
  prop("pressure plate", { label: "Pressure plate", group: "Interactive", size: [0.5, 0.02, 0.5], phys: { mass: 8, friction: 0.8, restitution: 0.02 }, dyn: false, comp: ["Trigger", { sizeX: 0.5, sizeY: 0.4, sizeZ: 0.5, once: false }], preset: "Static Lock",
    build: function () { var g = group(); g.add(mesh(geo("plate", function () { return boxUV(roundedBox(0.5, 0.02, 0.5, 0.006, 2), 0.5, 0.02, 0.5, 0.5); }), material("diamond plate"), 0, 0.01, 0)); return centre(g, [cub(0.25, 0.01, 0.25, 0, 0.01, 0)], 0.02); } });
  prop("trigger zone", { label: "Trigger zone", group: "Interactive", size: [1, 1, 1], phys: { mass: 1, friction: 0, restitution: 0 }, dyn: false, comp: ["Trigger", { sizeX: 1, sizeY: 1, sizeZ: 1, once: false }], editorOnlyLook: true,
    build: function () {
      var THREE = T(), g = group(), m = mesh(geo("zone", function () { return new THREE.BoxGeometry(1, 1, 1); }), material("zone"), 0, 0.5, 0);
      m.castShadow = false; m.receiveShadow = false; m.layers.set(30); m.userData.noBullet = true; // seen only in Editor mode, no collision
      var edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0x33c3ff })); edges.position.copy(m.position); edges.layers.set(30);
      g.add(m, edges); return centre(g, [], 1);
    } });
  prop("spawner", { label: "Spawner pad", group: "Interactive", size: [0.4, 0.05, 0.4], phys: { mass: 6, friction: 0.8, restitution: 0.02 }, dyn: false, comp: ["Spawner", { every: 3, max: 5 }], preset: "Static Lock",
    build: function () { var THREE = T(), g = group(); g.add(mesh(geo("spBase", function () { return cyl(0.2, 0.21, 0.04, 40); }), material("black metal"), 0, 0.02, 0)); var ring = mesh(geo("spRing", function () { var q = new THREE.TorusGeometry(0.15, 0.008, 8, 48); q.rotateX(Math.PI / 2); return q; }), material("glow", "#55d0ff"), 0, 0.042, 0); ring.castShadow = false; g.add(ring); return centre(g, [cyc(0.21, 0.025, 0, 0.025, 0)], 0.05); } });
  // Physics toys
  prop("domino", { label: "Domino", group: "Toys", size: [0.05, 0.1, 0.016], phys: { mass: 0.05, friction: 0.4, restitution: 0.05 }, preset: "Wood",
    build: function () { var g = group(), face = material("domino"), side = material("plastic", "#efe9dc"); g.add(mesh(geo("domino", function () { return new (T().BoxGeometry)(0.05, 0.1, 0.016); }), [side, side, side, side, face, face], 0, 0.05, 0)); return centre(g, [cub(0.025, 0.05, 0.008, 0, 0.05, 0)], 0.1); } });
  prop("bowling pin", { label: "Bowling pin", group: "Toys", size: [0.12, 0.38, 0.12], phys: { mass: 1.5, friction: 0.4, restitution: 0.3 }, preset: "Plastic",
    build: function () {
      var THREE = T(), g = group(), prof = [[0.026, 0], [0.04, 0.01], [0.058, 0.07], [0.06, 0.11], [0.05, 0.17], [0.026, 0.24], [0.022, 0.27], [0.03, 0.31], [0.031, 0.34], [0.024, 0.37], [0.0, 0.38]];
      g.add(mesh(geo("pin", function () { return new THREE.LatheGeometry(prof.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 28); }), material("pin plastic")));
      return centre(g, [cyc(0.05, 0.12, 0, 0.12, 0), cyc(0.028, 0.07, 0, 0.31, 0)], 0.38);
    } });
  prop("balloon", { label: "Balloon", group: "Toys", size: [0.28, 0.33, 0.28], phys: { mass: 0.05, friction: 0.4, restitution: 0.6 }, gravity: -0.1, preset: "Balloon",
    build: function (color) {
      var THREE = T(), g = group(), m = material("latex", color);
      var b = mesh(geo("balloon", function () { var q = new THREE.SphereGeometry(0.14, 32, 20); q.scale(1, 1.15, 1); return q; }), m, 0, 0.17, 0); g.add(b);
      g.add(mesh(geo("knot", function () { return cyl(0.004, 0.012, 0.018, 10); }), m, 0, 0.0, 0));
      var str = mesh(geo("string", function () { return cyl(0.0012, 0.0012, 0.5, 4); }), material("plastic", "#f2f2f2"), 0, -0.25, 0); str.castShadow = false; g.add(str);
      return centre(g, [{ kind: "ball", size: [0.14], offset: [0, 0.17, 0] }], 0.33);
    } });
  prop("trampoline pad", { label: "Trampoline pad", group: "Toys", size: [1.1, 0.18, 1.1], phys: { mass: 25, friction: 0.8, restitution: 1.2 }, dyn: false, preset: "Static Lock",
    build: function () {
      var THREE = T(), g = group();
      g.add(mesh(geo("trampMat", function () { var q = new THREE.CircleGeometry(0.5, 40); q.rotateX(-Math.PI / 2); return q; }), material("weave"), 0, 0.15, 0));
      g.add(mesh(geo("trampRing", function () { var q = new THREE.TorusGeometry(0.52, 0.035, 10, 48); q.rotateX(Math.PI / 2); return q; }), material("plastic", "#1f5fae"), 0, 0.15, 0));
      for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2; g.add(mesh(geo("trampLeg", function () { return cyl(0.015, 0.015, 0.15, 10); }), material("black metal"), Math.cos(a) * 0.5, 0.075, Math.sin(a) * 0.5)); }
      return centre(g, [cyc(0.55, 0.09, 0, 0.09, 0)], 0.18);
    } });
  prop("seesaw base", { label: "Seesaw base", group: "Toys", size: [0.3, 0.3, 0.4], phys: { mass: 40, friction: 0.9, restitution: 0.02 }, dyn: false, preset: "Static Lock",
    build: function () {
      var THREE = T(), g = group(), s = new THREE.Shape(); s.moveTo(-0.15, 0); s.lineTo(0.15, 0); s.lineTo(0.02, 0.3); s.lineTo(-0.02, 0.3); s.lineTo(-0.15, 0);
      g.add(mesh(geo("seeBase", function () { var q = new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: false }); q.translate(0, 0, -0.2); return q; }), material("painted metal", "#c7372f")));
      return centre(g, [cub(0.1, 0.15, 0.2, 0, 0.15, 0)], 0.3);
    } });
  prop("seesaw plank", { label: "Seesaw plank", group: "Toys", size: [2, 0.05, 0.28], phys: { mass: 10, friction: 0.7, restitution: 0.05 }, preset: "Wood",
    build: function () { var g = group(); g.add(mesh(geo("seePlank", function () { return boxUV(roundedBox(2, 0.05, 0.28, 0.008, 2), 2, 0.05, 0.28, 1); }), material("wood"), 0, 0.025, 0)); return centre(g, [cub(1, 0.025, 0.14, 0, 0.025, 0)], 0.05); } });
  // Lights (no shadows from spawned lights: cheap on Quest)
  function warmLight(THREE, intensity, dist) { var l = new THREE.PointLight(0xffc98f, intensity, dist, 2); l.castShadow = false; return l; }
  prop("lamp", { label: "Table lamp", group: "Lights", size: [0.28, 0.55, 0.28], phys: { mass: 1.6, friction: 0.6, restitution: 0.05 }, preset: "Wood",
    build: function () {
      var THREE = T(), g = group(), steel = material("steel");
      g.add(mesh(geo("lampBase", function () { return cyl(0.085, 0.09, 0.02, 32); }), steel, 0, 0.01, 0));
      g.add(mesh(geo("lampStem", function () { return cyl(0.007, 0.007, 0.36, 10); }), steel, 0, 0.2, 0));
      var shadeMat = variant("shade|fabric", material("fabric", "#efe6d4"), function (x) { x.side = THREE.DoubleSide; x.emissive = new THREE.Color("#ffd9a8"); x.emissiveIntensity = 0.35; });
      var shade = mesh(geo("lampShade", function () { return new THREE.CylinderGeometry(0.09, 0.14, 0.17, 32, 1, true); }), shadeMat, 0, 0.45, 0);
      g.add(shade);
      var l = warmLight(THREE, 4, 6); l.position.set(0, 0.42, 0); g.add(l);
      return centre(g, [cyc(0.09, 0.01, 0, 0.01, 0), cyc(0.14, 0.085, 0, 0.45, 0)], 0.55);
    } });
  prop("lantern", { label: "Lantern", group: "Lights", size: [0.16, 0.3, 0.16], phys: { mass: 1.2, friction: 0.6, restitution: 0.05 }, preset: "Heavy Metal",
    build: function () {
      var THREE = T(), g = group(), metal = material("black metal");
      g.add(mesh(geo("lanBase", function () { return cyl(0.075, 0.08, 0.03, 24); }), metal, 0, 0.015, 0));
      g.add(mesh(geo("lanGlass", function () { return cyl(0.06, 0.06, 0.17, 24); }), material("glass"), 0, 0.115, 0));
      g.add(mesh(geo("lanWick", function () { return cyl(0.006, 0.006, 0.05, 8); }), material("glow", "#ffb24a"), 0, 0.08, 0));
      g.add(mesh(geo("lanTop", function () { return cyl(0.03, 0.075, 0.04, 24); }), metal, 0, 0.22, 0));
      var hd = mesh(geo("lanHandle", function () { var q = new THREE.TorusGeometry(0.05, 0.004, 6, 24, Math.PI); return q; }), metal, 0, 0.24, 0); g.add(hd);
      var l = warmLight(THREE, 2, 4); l.position.set(0, 0.1, 0); g.add(l);
      return centre(g, [cyc(0.075, 0.13, 0, 0.13, 0)], 0.3);
    } });
  prop("spotlight", { label: "Spotlight", group: "Lights", size: [0.3, 0.4, 0.3], phys: { mass: 4, friction: 0.7, restitution: 0.05 }, preset: "Heavy Metal",
    build: function () {
      var THREE = T(), g = group(), metal = material("black metal");
      g.add(mesh(geo("spotBase", function () { return cyl(0.13, 0.15, 0.03, 24); }), metal, 0, 0.015, 0));
      g.add(mesh(geo("spotPost", function () { return cyl(0.012, 0.012, 0.2, 10); }), material("steel"), 0, 0.13, 0));
      var head = new THREE.Group(); head.position.set(0, 0.28, 0); head.rotation.x = -0.5;
      head.add(mesh(geo("spotCan", function () { var q = new THREE.CylinderGeometry(0.07, 0.06, 0.18, 24, 1, false); q.rotateX(Math.PI / 2); return q; }), metal));
      var lens = mesh(geo("spotLens", function () { var q = new THREE.CircleGeometry(0.062, 24); return q; }), material("glow", "#fff3dc"), 0, 0, 0.091); lens.castShadow = false; head.add(lens);
      var s = new THREE.SpotLight(0xfff0dc, 25, 8, 0.45, 0.45, 2); s.castShadow = false; s.position.set(0, 0, 0.1); var tgt = new THREE.Object3D(); tgt.position.set(0, 0, 1.1); head.add(s, tgt); s.target = tgt;
      g.add(head);
      return centre(g, [cyc(0.15, 0.015, 0, 0.015, 0), cub(0.07, 0.12, 0.09, 0, 0.26, 0.02)], 0.4);
    } });
  prop("neon strip", { label: "Neon strip", group: "Lights", size: [1, 0.03, 0.03], phys: { mass: 0.4, friction: 0.5, restitution: 0.05 }, preset: "Plastic",
    build: function (color) { var THREE = T(), g = group(), t = mesh(geo("neon", function () { var q = new THREE.CylinderGeometry(0.012, 0.012, 1, 12); q.rotateZ(Math.PI / 2); return q; }), material("neon", color), 0, 0.015, 0); t.castShadow = false; g.add(t); return centre(g, [cub(0.5, 0.015, 0.015, 0, 0.015, 0)], 0.03); } });

  // ---------- API ----------
  var MASS_LIMITS = function (v) { return Math.max(0.05, Math.min(5000, v)); };
  window.__studioPropLib = {
    list: function () { return Object.keys(P).map(function (k) { return P[k]; }); },
    has: function (name) { return !!P[name]; },
    def: function (name) { return P[name]; },
    label: function (name) { return P[name] ? P[name].label : name; },
    physics: function (name) { var p = P[name].phys; return { mass: MASS_LIMITS(p.mass), friction: p.friction, restitution: p.restitution }; },
    build: function (name, color) {
      var d = P[name]; if (!d) throw new Error("unknown prop " + name);
      var c = color && color !== "#d8d4cc" && color !== "#ffffff" ? color : undefined; // the engine's default spawn colour means "as designed"
      var r = d.build(c);
      r.object.name = name;
      return r;
    },
    materials: PUBLIC.slice(),
    hasMaterial: function (name) { return PUBLIC.indexOf(name) >= 0; },
    // a "mat" op with key "preset": applies a preset's maps and values to one material, undoable
    presetOp: function (target, name, object, label) {
      var THREE = T(), keys = ["map", "normalMap", "roughnessMap", "metalnessMap", "roughness", "metalness", "opacity", "transparent", "emissiveIntensity", "depthWrite"];
      var before = {}; keys.forEach(function (k) { before[k] = target[k]; });
      before.color = target.color ? target.color.getHex() : null; before.emissive = target.emissive ? target.emissive.getHex() : null; before.normalScale = target.normalScale ? target.normalScale.clone() : null;
      var size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()), span = Math.max(0.05, size.x, size.y, size.z);
      function apply() {
        var p = PRESET[name](target.color ? "#" + target.color.getHexString() : undefined), ns = p.normalScale;
        var tile = { "wood": 0.8, "dark wood": 0.8, "concrete": 1.5, "stone": 1.5, "plaster": 1.5, "fabric": 0.5, "hay": 0.9 }[name] || 0.6, rep = Math.max(0.25, span / tile);
        ["map", "normalMap", "roughnessMap", "metalnessMap"].forEach(function (k) { target[k] = p[k] ? withRepeat(p[k], rep) : null; });
        target.roughness = p.roughness != null ? p.roughness : 0.6; target.metalness = p.metalness != null ? p.metalness : 0;
        target.opacity = p.opacity != null ? p.opacity : 1; target.transparent = !!p.transparent;
        if (p.color && target.color && (name !== "painted metal" && name !== "fabric" && name !== "plastic" && name !== "rubber")) target.color.set(p.color);
        if (target.emissive) { target.emissive.set(p.emissive || "#000000"); target.emissiveIntensity = p.emissiveIntensity || 0; }
        if (target.normalScale && ns != null) target.normalScale.set(ns, ns);
        target.needsUpdate = true;
      }
      return { label: label, live: true,
        do: apply,
        undo: function () {
          keys.forEach(function (k) { target[k] = before[k]; });
          if (before.color != null) target.color.setHex(before.color);
          if (before.emissive != null) target.emissive.setHex(before.emissive);
          if (before.normalScale) target.normalScale.copy(before.normalScale);
          target.needsUpdate = true;
        } };
    },
    // a swatch for the Props app: { img, tint } from the prop's own texture (generated or the room's scan)
    swatch: function (name) {
      if (P[name] && P[name].swatch) return P[name].swatch();
      var gen = { crate: "crate", "cardboard box": "cardboard", "box stack": "cardboard", barrel: "drum", cone: "cone", tire: "tread", "tire stack": "tread", "hay bale": "hay", sign: "sign", flag: "checker", "bowling pin": "pin", "pressure plate": "diamondPlate", domino: "domino", books: "pages", lever: "diamondPlate", "trampoline pad": "weave" }[name];
      if (gen) return SETS[gen] && SETS[gen].map ? { img: SETS[gen].map, tint: name === "barrel" ? "#2a5d9f" : null } : null;
      var sc = { chair: "white-oak-oiled", table: "white-oak-oiled", shelf: "white-oak-oiled", beam: "white-oak-oiled", "seesaw plank": "white-oak-oiled",
        barrier: "polished-concrete", platform: "polished-concrete", pillar: "polished-concrete", stairs: "polished-concrete", cushion: "upholstery" }[name];
      var m = sc && window.__studio && sceneMaterial(sc), img = m && m.map && m.map.image;
      if (img && img.width) return { img: img, tint: name === "cushion" ? "#7f8c99" : null };
      return null;
    },
    warm: function (names) { (names || Object.keys(GEN)).forEach(function (n) { set(n, GEN[n]); }); },
    // props from other add-ons (vehicles.js): same definition shape as above
    register: function (name, def) { prop(name, def); }
  };

  // ---------- room exit: spawned props are put away while you are in Rally ----------
  (function watch() {
    var stored = null;
    setInterval(function () {
      var S = window.__studio, r = window.__rally; if (!S || !S.editor || !r) return;
      var away = r.mode && r.mode !== "room";
      if (away && !stored) {
        stored = S.editor.world.list.filter(function (e) { return !e.deleted && e.spawn && e.object.visible; });
        stored.forEach(function (e) { e.object.visible = false; if (e.prop) S.physics.setPropEnabled(e.prop, false); });
      } else if (!away && stored) {
        stored.forEach(function (e) { if (!e.deleted) { e.object.visible = true; if (e.prop) S.physics.setPropEnabled(e.prop, true); } });
        stored = null;
      }
    }, 300);
  })();

  // ---------- where new things appear: the concrete terrace outside the glazing ----------
  // Spawning in front of you could land a prop inside a wall or the desk. Everything the editor, the
  // command runner and Ask Claude add now appears on the terrace pad (the engine's inFront asks for it),
  // on a 3 x 4 grid of spots that steps on each spawn so things don't land on each other.
  (function spawnPad() {
    var box = null, k = 0;
    window.__spawnPad = function () {
      var st = window.__studio;
      if (!st || !st.ready || !st.scene || !st.THREE) return null;
      var THREE = st.THREE;
      if (!box) {
        var pad = st.scene.getObjectByName("terrace");
        if (!pad) return null;
        pad.updateWorldMatrix(true, false);
        box = new THREE.Box3().setFromObject(pad);
        if (box.isEmpty()) { box = null; return null; }
      }
      var cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
      var sx = Math.min(0.8, (box.max.x - box.min.x) / 4), sz = Math.min(1.1, (box.max.z - box.min.z) / 5);
      var i = k++ % 12, gx = i % 3 - 1, gz = Math.floor(i / 3) - 1.5;
      return new THREE.Vector3(cx + gx * sx, box.max.y + 0.6, cz + gz * sz);
    };
  })();

  // ---------- warm the generated textures in quiet moments, so the first spawn does not stall a frame ----------
  (function warmUp() {
    var names = Object.keys(GEN), i = 0;
    function next() {
      if (i >= names.length) return;
      if (!window.__studio || !window.__studio.ready) { setTimeout(next, 1000); return; }
      set(names[i], GEN[names[i]]); i++;
      (window.requestIdleCallback || function (f) { setTimeout(f, 400); })(next, { timeout: 2000 });
    }
    setTimeout(next, 4000);
  })();
})();
