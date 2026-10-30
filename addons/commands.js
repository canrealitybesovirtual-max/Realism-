// Command runner (Phase 6, roadmap section 7a). Reads the registry in commands.json, matches typed (or,
// later, spoken) text against its phrases, checks every blank (type and range), resolves "it" (the
// selection, or what you point at) and object names, then runs the command. Scene changes go through
// editor.applyBatch: each op is validated by the engine, a failing step rolls the whole command back, the
// command is one Undo step, and it is autosaved. Planned commands answer with what will bring them.
// API: window.__studioCommands = { registry, ready, match(text), suggest(text), run(text), recent(), favorites() }.
(function () {
  "use strict";

  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        var os = s && s.ready && ((s.computer && s.computer.os) || (s.targets && s.targets.computer && s.targets.computer.os));
        if (os && s.editor && os.apps.get("studio") && window.__studioUI && window.__studioScene) resolve({ S: s, os: os });
        else setTimeout(check, 250);
      })();
    });
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function byLength(a, b) { return b.length - a.length; }
  function cap(s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); }

  waitForStudio().then(function (ctx) {
    var S = ctx.S, os = ctx.os, ed = S.editor, world = ed.world, studio = os.apps.get("studio"), THREE = S.THREE;
    var UI = window.__studioUI, SC = window.__studioScene, log = S.log;
    var REG = null, MATCHERS = [], api;

    // ---------- registry and matchers ----------
    function normalize(text) {
      var w = REG.words;
      var t = " " + String(text).toLowerCase().replace(/[“”"!?,;:]+/g, " ").replace(/\.(?=\s|$)/g, " ").replace(/\s+/g, " ") + " ";
      return t.trim().split(" ").map(function (x) { return x in w.numbers ? String(w.numbers[x]) : x; })
        .filter(function (x) { return x && w.skip.indexOf(x) < 0; }).join(" ");
    }
    var NUM = "-?\\d+(?:\\.\\d+)?";
    function blankRegex(b) {
      switch (b.type) {
        case "prop": return "(" + Object.keys(REG.props).sort(byLength).map(esc).join("|") + ")";
        case "enum": return "(" + REG.enums[b.of].slice().sort(byLength).map(esc).join("|") + ")";
        case "color": return "(#[0-9a-f]{6}|" + Object.keys(REG.colors).sort(byLength).map(esc).join("|") + ")";
        case "int": case "number": case "ratio": return "(" + NUM + ")";
        case "length": return "(" + NUM + "(?:\\s*(?:cm|mm|m|meters?|metres?|centimeters?|centimetres?|inch(?:es)?))?)";
        case "angle": return "(" + NUM + "(?:\\s*(?:deg|degrees?|°))?)";
        case "factor": return "(" + NUM + "\\s*(?:x|times)?|x\\s*" + NUM + ")";
        case "percent": return "(" + NUM + "\\s*(?:%|percent)?)";
        case "mass": return "(" + NUM + "(?:\\s*(?:kg|kilos?|kilograms?|g|grams?))?)";
        case "object": return "(.+?)";
        default: return "(.+)";
      }
    }
    function build() {
      MATCHERS = [];
      REG.commands.forEach(function (cmd, ci) {
        cmd.phrases.forEach(function (ph) {
          var names = [], score = 0, parts = normalize(ph).split(" ").map(function (tok) {
            var m = /^\[(\w+)\]$/.exec(tok);
            if (!m) { score += 3; return esc(tok); }
            var b = cmd.blanks[m[1]] || { type: "name" };
            names.push(m[1]);
            score += b.type === "object" || b.type === "name" ? 0 : 2;
            return blankRegex(b);
          });
          MATCHERS.push({ cmd: cmd, order: ci, names: names, score: score, leadsWithBlank: /^\[/.test(ph.trim()), re: new RegExp("^" + parts.join("\\s+") + "$") });
        });
      });
    }
    function match(text) {
      var t = normalize(text), best = null;
      if (!t) return null;
      MATCHERS.forEach(function (m) {
        var r = m.re.exec(t);
        if (!r) return;
        if (!best || m.score > best.m.score) best = { m: m, r: r };
      });
      if (!best) return null;
      var args = {};
      best.m.names.forEach(function (n, i) { args[n] = best.r[i + 1]; });
      var d = best.m.cmd.defaults || {};
      for (var k in d) if (args[k] === undefined) args[k] = d[k];
      return { cmd: best.m.cmd, args: args, text: t, loose: best.m.leadsWithBlank };
    }
    function suggest(text) {
      var words = normalize(text).split(" ").filter(Boolean);
      if (!words.length) return [];
      return REG.commands.map(function (c) {
        var ex = normalize(c.example).split(" "), all = (c.phrases.join(" ") + " " + c.example).toLowerCase();
        var s = 0;
        words.forEach(function (w, i) { if (ex.indexOf(w) >= 0) s += 2; else if (all.indexOf(w) >= 0) s += 1; if (i === 0 && ex[0] === w) s += 2; });
        return { c: c, s: s };
      }).filter(function (x) { return x.s > 1; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 3).map(function (x) { return x.c.example; });
    }

    // ---------- blanks ----------
    function num(v) { var m = /-?\d+(?:\.\d+)?/.exec(String(v)); return m ? parseFloat(m[0]) : NaN; }
    function parseBlank(name, b, raw) {
      var v;
      switch (b.type) {
        case "int": v = Math.round(num(raw)); break;
        case "number": case "ratio": v = num(raw); break;
        case "length": v = num(raw); if (/\bmm\b/.test(raw)) v /= 1000; else if (/\b(m|meters?|metres?)\b/.test(raw)) v *= 1; else if (/inch/.test(raw)) v *= 0.0254; else v /= 100; break;
        case "angle": v = num(raw); break;
        case "factor": v = num(raw); break;
        case "percent": v = num(raw); break;
        case "mass": v = num(raw); if (/\b(g|grams?)\b/.test(raw)) v /= 1000; break;
        case "color": v = raw.charAt(0) === "#" ? raw : REG.colors[raw]; if (!v) return { error: "I do not know the colour " + raw + "." }; return { value: v, shown: raw };
        default: return { value: raw, shown: raw };
      }
      if (!isFinite(v)) return { error: "I need a number for " + name + "." };
      var lo = b.min, hi = b.max;
      if (b.type === "length") { if (v < lo || v > hi) return { error: "Distance must be between " + Math.round(lo * 100) + " cm and " + hi + " m." }; }
      else if (lo !== undefined && (v < lo || v > hi)) return { error: cap(name) + " must be between " + lo + " and " + hi + "." };
      return { value: v, shown: raw };
    }

    // ---------- objects ----------
    function aimed() {
      var p = null;
      var R = S.xr && S.xr.hands && S.xr.hands.find(function (h) { return h.source && h.source.handedness === "right"; });
      if (S.renderer.xr.isPresenting && R && R.pointing === "prop" && R.pointProp) p = R.pointProp;
      else if (window.__studioAim) { var a = window.__studioAim(); if (a && a.kind === "prop") p = a.prop; }
      return p && p.desc ? world.of(p.desc.object) : null;
    }
    function find(text) {
      var t = String(text || "").trim().toLowerCase();
      if (!t || REG.words.it.indexOf(t) >= 0) {
        var e = ed.selection.find(function (x) { return !x.deleted; }) || aimed();
        return e ? { e: e } : { error: "Select something first, or point at it." };
      }
      var list = world.list.filter(function (e) { return !e.deleted; });
      var sing = t.replace(/(es|s)$/, "");
      var tests = [
        function (e) { return e.name.toLowerCase() === t || e.id === t; },
        function (e) { return e.name.toLowerCase().split(/\s+/).indexOf(t) >= 0 || e.name.toLowerCase().split(/\s+/).indexOf(sing) >= 0; },
        function (e) { return e.name.toLowerCase().indexOf(t) >= 0; },
        function (e) { return sing.length > 2 && e.name.toLowerCase().indexOf(sing) >= 0; }
      ];
      for (var i = 0; i < tests.length; i++) { var hit = list.find(tests[i]); if (hit) return { e: hit }; }
      return { error: "I can't find " + text + ".", notFound: true };
    }
    function tr(e) {
      var o = e.object, D = 180 / Math.PI;
      return { p: o.position.toArray(), r: [o.rotation.x * D, o.rotation.y * D, o.rotation.z * D], s: o.scale.toArray() };
    }
    function trs(e, to) { return { op: "trs", id: e.id, to: to, from: tr(e) }; }
    function box(e) { e.object.updateMatrixWorld(true); return new THREE.Box3().setFromObject(e.object); }
    function basis() {
      var f = new THREE.Vector3(); S.camera.getWorldDirection(f); f.y = 0;
      if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize();
      return { f: f, r: new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize() };
    }
    function front() { return studio.inFront ? studio.inFront() : new THREE.Vector3(0, 0.6, 0); }
    var SKIP_MAT = /glass|bulb|lens|screen|lcd|led|emit|reflector/i;
    function matOps(e, key, value, all) {
      var ops = [], mats = world.materials(e);
      mats.forEach(function (m, mi) {
        if (!all && (SKIP_MAT.test(m.name || "") || m.transparent && key === "color")) return;
        if (world.materialUsers(m) > 1) ops.push({ op: "unique", id: e.id, mi: mi });
        ops.push({ op: "mat", id: e.id, mi: mi, key: key, value: value });
      });
      if (!ops.length) mats.forEach(function (m, mi) { ops.push({ op: "mat", id: e.id, mi: mi, key: key, value: value }); });
      return ops;
    }
    function needProp(e) { return e.prop ? null : e.name + " has no physics body."; }
    var DEFAULT_SIZE = { box: [0.25, 0.25, 0.25], sphere: [0.25, 0.25, 0.25], cylinder: [0.25, 0.25, 0.25], ramp: [0.6, 0.25, 0.8], light: [0.1, 0.1, 0.1] };
    var LIB = window.__studioPropLib;
    function sizeOf(kind) { return kind.indexOf("prop:") === 0 ? LIB.def(kind.slice(5)).size : DEFAULT_SIZE[kind]; }
    function spawnOp(kind, p, opts) {
      opts = opts || {};
      if (kind.indexOf("prop:") === 0) { // a library prop: built by addons/props.js through the engine's spawn op
        var name = kind.slice(5), d = LIB.def(name), sz = d.size.slice();
        return { op: "spawn", id: world.spawnId(name.replace(/\s+/g, "-")), spec: { kind: "prop", prop: name, dynamic: opts.dynamic !== undefined ? opts.dynamic : d.dyn !== false, size: sz },
          to: { p: [p.x, Math.max(p.y, sz[1] / 2 + 0.01), p.z], r: opts.r || [0, 0, 0], s: [1, 1, 1] }, color: opts.color || "#d8d4cc" };
      }
      var size = opts.size || DEFAULT_SIZE[kind];
      return { op: "spawn", id: world.spawnId(kind), spec: { kind: kind, dynamic: opts.dynamic !== undefined ? opts.dynamic : kind !== "ramp" && kind !== "light", size: size },
        to: { p: [p.x, Math.max(p.y, size[1] / 2 + 0.01), p.z], r: opts.r || [0, 0, 0], s: [1, 1, 1] }, color: opts.color || "#d8d4cc" };
    }
    // the behaviours a library prop comes with (a button is usable, a balloon floats), added in the same step
    function withPropExtras(ops) {
      var out = [];
      ops.forEach(function (o) {
        out.push(o);
        if (o.op !== "spawn" || !o.spec || o.spec.kind !== "prop") return;
        var d = LIB.def(o.spec.prop);
        if (d.comp) out.push({ op: "comp", id: o.id, ctype: d.comp[0], data: Object.assign({}, d.comp[1]) });
        if (d.gravity != null && o.spec.dynamic) out.push({ op: "phys", id: o.id, key: "gravity", value: d.gravity });
      });
      return out;
    }
    function propKind(word) {
      var k = REG.props[word];
      if (k === undefined) return { error: "I don't know the prop " + word + "." };
      if (k === null) return { error: (REG.propsLater && REG.propsLater[word]) || cap(word) + " is not available yet." };
      if (k.indexOf("alias:") === 0) return { alias: k.slice(6) };
      return { kind: k };
    }
    function propWord(kind) { if (kind.indexOf("prop:") === 0) return LIB.label(kind.slice(5)).toLowerCase(); return { box: "box", sphere: "ball", cylinder: "cylinder", ramp: "ramp", light: "light" }[kind] || kind; }
    // props made of several library pieces
    function aliasOps(name, p) {
      var b = basis(), ops = [];
      if (name === "box stack") {
        [[0, 0.15, 0], [0.03, 0.45, -0.02], [-0.02, 0.75, 0.01]].forEach(function (o, i) { var q = p.clone().addScaledVector(b.r, o[0]).setY(o[1]); q.addScaledVector(b.f, o[2]); ops.push(spawnOp("prop:cardboard box", q, { r: [0, (i - 1) * 7, 0] })); });
        return { ops: ops, word: "box stack" };
      }
      if (name === "seesaw") {
        var yaw = Math.atan2(b.r.x, b.r.z) * 180 / Math.PI;
        ops.push(spawnOp("prop:seesaw base", p.clone().setY(0.15), { r: [0, yaw - 90, 0] }));
        ops.push(spawnOp("prop:seesaw plank", p.clone().setY(0.33), { r: [0, yaw - 90, 0] }));
        return { ops: ops, word: "seesaw" };
      }
      return { error: "I don't know " + name + "." };
    }
    function plural(word, n) { return n === 1 ? word : /x$|s$/.test(word) ? word + "es" : word + "s"; }
    function propLimitOk(adding) {
      var P = window.__studioProps;
      if (!P || !UI.get("propLimit")) return null;
      return P.count() + adding > P.limit ? "That would pass the prop limit of " + P.limit + " (" + P.count() + " now)." : null;
    }
    function lightEntities(artificialOnly) {
      return world.list.filter(function (e) { return !e.deleted && world.lights(e).length && (!artificialOnly || (e.name !== "Sun" && e.name !== "Window skylight")); });
    }
    var BUILT = new Map(); // light -> [intensity, hex], as built
    var OFF = new Map();   // light -> intensity before "lights off"
    world.list.forEach(function (e) { world.lights(e).forEach(function (l) { BUILT.set(l, [l.intensity, "#" + l.color.getHexString()]); }); });
    var DAY = { exposure: S.renderer.toneMappingExposure, envIntensity: S.scene.environmentIntensity != null ? S.scene.environmentIntensity : 1 };
    function lightOps(fn, artificialOnly) {
      var ops = [];
      lightEntities(artificialOnly).forEach(function (e) { world.lights(e).forEach(function (l, li) { fn(e, l, li, ops); }); });
      return ops;
    }
    function blendHex(a, b, t) { var c = new THREE.Color(a).lerp(new THREE.Color(b), t); return "#" + c.getHexString(); }
    function envOp(key, value) { return { op: "env", id: "environment", key: key, value: value }; }

    // ---------- handlers ----------
    // Each returns { ops, label, vars } (applied as one Undo step), { act: fn, vars }, or { error }.
    var H = {};
    // "it" / "them" with several things selected applies to each of them (when the command is a scene change)
    function withTarget(a, fn) {
      var t = String(a.target || "").trim().toLowerCase(), sel = ed.selection.filter(function (x) { return !x.deleted; });
      if ((!t || REG.words.it.indexOf(t) >= 0) && sel.length > 1) {
        var all = sel.map(fn), bad = all.find(function (r) { return !r || r.error || !r.ops; });
        if (!bad) return { ops: [].concat.apply([], all.map(function (r) { return r.ops; })), vars: Object.assign({}, all[0].vars, { target: "all " + sel.length, __many: true }) };
        if (bad && bad.error) return bad;
      }
      var f = find(a.target); return f.error ? f : fn(f.e);
    }
    H.add = function (a) {
      var k = propKind(a.prop); if (k.error) return k;
      var p = front();
      if (k.alias) { var al = aliasOps(k.alias, p); return al.error ? al : { ops: al.ops, vars: { prop: al.word } }; }
      var sz = sizeOf(k.kind); if (sz[2] > 0.6 || sz[0] > 0.6) p.addScaledVector(basis().f, Math.max(sz[0], sz[2]) / 2); // big things a bit further away
      return { ops: [spawnOp(k.kind, p)], vars: { prop: propWord(k.kind) } };
    };
    H.spawn_many = function (a) { a.arrangement = "row"; return H.spawn_arranged(a); };
    H.spawn_hand = function (a) {
      var k = propKind(a.prop); if (k.error) return k;
      var p = new THREE.Vector3(), R = S.xr && S.xr.hands && S.xr.hands.find(function (h) { return h.source && h.source.handedness === "right"; });
      if (S.renderer.xr.isPresenting && R) R.grip.getWorldPosition(p).add(new THREE.Vector3(0, 0.12, 0));
      else { S.camera.getWorldPosition(p); var b = basis(); p.addScaledVector(b.f, 0.55).addScaledVector(b.r, 0.18); p.y -= 0.25; }
      if (k.alias) return { error: "That one is too big for your hand. Try: add a " + k.alias + "." };
      var small = k.kind.indexOf("prop:") === 0 || k.kind === "ramp" ? null : [0.12, 0.12, 0.12];
      return { ops: [spawnOp(k.kind, p, { size: small })], vars: { prop: propWord(k.kind) } };
    };
    H.spawn_arranged = function (a) {
      var k = propKind(a.prop); if (k.error) return k;
      if (k.alias) return { error: "Say add a " + k.alias + " for one; arrangements work with single props." };
      var n = a.n, lim = propLimitOk(n); if (lim) return { error: lim };
      var sz = sizeOf(k.kind), b = basis(), c = front(), d = Math.max(sz[0], sz[2]) + 0.02, hgt = sz[1] + 0.005, ops = [], pts = [], arr = a.arrangement;
      if (arr === "line") arr = "row"; if (arr === "ring") arr = "circle"; if (arr === "tower") arr = "stack";
      c.addScaledVector(b.f, 0.4);
      if (arr === "row") for (var i = 0; i < n; i++) pts.push(c.clone().addScaledVector(b.r, (i - (n - 1) / 2) * d));
      else if (arr === "grid") { var cols = Math.ceil(Math.sqrt(n)); for (i = 0; i < n; i++) pts.push(c.clone().addScaledVector(b.r, (i % cols - (cols - 1) / 2) * d).addScaledVector(b.f, Math.floor(i / cols) * d)); }
      else if (arr === "circle") { var rad = Math.max(0.35, n * d / (2 * Math.PI)); for (i = 0; i < n; i++) { var t = i / n * Math.PI * 2; pts.push(c.clone().addScaledVector(b.r, Math.cos(t) * rad).addScaledVector(b.f, Math.sin(t) * rad + rad)); } }
      else if (arr === "stack") for (i = 0; i < n; i++) pts.push(c.clone().setY(hgt / 2 + i * hgt));
      else { // pyramid: rows of k, k-1, ... 1
        var base = 1; while (base * (base + 1) / 2 < n) base++;
        var left = n, row = 0;
        while (left > 0) { var inRow = Math.min(base - row, left); for (i = 0; i < inRow; i++) pts.push(c.clone().addScaledVector(b.r, (i - (inRow - 1) / 2) * d).setY(hgt / 2 + row * hgt)); left -= inRow; row++; }
      }
      pts.forEach(function (p) { ops.push(spawnOp(k.kind, p)); });
      return { ops: ops, vars: { n: n, prop: plural(propWord(k.kind), n), arrangement: arr } };
    };
    function cloneOp(e, to) { return { op: "spawn", id: world.spawnId("copy"), spec: { kind: "clone", source: e.id, dynamic: !!e.prop, size: [1, 1, 1] }, to: to, color: "#ffffff" }; }
    H.duplicate = function (a) { return withTarget(a, function (e) { if (e.locked) return { error: e.name + " is part of the room and can't be copied." }; var t = tr(e); t.p = [t.p[0] + 0.15, t.p[1] + 0.05, t.p[2]]; return { ops: [cloneOp(e, t)], vars: { target: e.name } }; }); };
    H.clone_n = function (a) {
      return withTarget(a, function (e) {
        if (e.locked) return { error: e.name + " is part of the room and can't be copied." };
        var lim = propLimitOk(a.n); if (lim) return { error: lim };
        var b = basis(), bx = box(e), w = Math.max(0.1, bx.max.x - bx.min.x, bx.max.z - bx.min.z) + 0.03, ops = [];
        for (var i = 1; i <= a.n; i++) { var t = tr(e); t.p = [t.p[0] + b.r.x * w * i, t.p[1], t.p[2] + b.r.z * w * i]; ops.push(cloneOp(e, t)); }
        return { ops: ops, vars: { target: e.name, n: a.n } };
      });
    };
    H.replace = function (a) {
      return withTarget(a, function (e) {
        var k = propKind(a.prop); if (k.error) return k;
        if (!e.spawn) return { error: "Only things you added can be replaced; " + e.name + " is part of the room." };
        var t = tr(e), op = spawnOp(k.kind, new THREE.Vector3().fromArray(t.p), { size: e.spawn.kind === "clone" ? null : e.spawn.size });
        op.to.r = t.r; op.to.p = t.p;
        return { ops: [{ op: "delete", id: e.id }, op], vars: { target: e.name, prop: propWord(k.kind) } };
      });
    };
    H.delete = function (a) { return withTarget(a, function (e) { if (e.locked) return { error: e.name + " is part of the room and can't be deleted." }; return { ops: [{ op: "delete", id: e.id }], vars: { target: e.name } }; }); };
    function spawnedOfKind(word) {
      var k = REG.props[word];
      return world.list.filter(function (e) { return !e.deleted && e.spawn && (k ? e.spawn.kind === k : e.name.toLowerCase().indexOf(word.replace(/s$/, "")) >= 0); });
    }
    H.delete_all = function (a) { var list = spawnedOfKind(a.prop); if (!list.length) return { error: "There are no " + a.prop + " you added." }; return { ops: list.map(function (e) { return { op: "delete", id: e.id }; }), vars: { count: list.length, prop: a.prop } }; };
    H.clear_spawned = function () { var list = world.list.filter(function (e) { return !e.deleted && e.spawn; }); if (!list.length) return { error: "You haven't added anything yet." }; return { ops: list.map(function (e) { return { op: "delete", id: e.id }; }), vars: { count: list.length } }; };
    H.random_props = function (a) {
      var n = Math.round(num(a.n)) || 6; if (n < 1 || n > 40) return { error: "Pick between 1 and 40." };
      var lim = propLimitOk(n); if (lim) return { error: lim };
      var kinds = ["prop:crate", "prop:cardboard box", "prop:cone", "prop:tire", "prop:bowling pin", "prop:barrel", "prop:cushion", "sphere"], cols = ["#c0392b", "#2c6fbb", "#e8c547", "#2e8b57", "#d8d4cc", "#7a4e2d", "#e67e22"];
      var b = basis(), c = front().addScaledVector(b.f, 0.3), ops = [];
      for (var i = 0; i < n; i++) {
        var p = c.clone().addScaledVector(b.r, (Math.random() - 0.5) * 1.2).addScaledVector(b.f, Math.random() * 0.8).setY(0.3 + Math.random() * 0.6);
        var s = 0.12 + Math.random() * 0.18, kd = kinds[i % kinds.length];
        ops.push(kd.indexOf("prop:") === 0 ? spawnOp(kd, p) : spawnOp(kd, p, { size: [s, s, s], color: cols[(i * 3) % cols.length] }));
      }
      return { ops: ops, vars: { n: n } };
    };
    // move / rotate / scale
    var DIRS = { up: [0, 1, 0], down: [0, -1, 0] };
    H.move = function (a) {
      return withTarget(a, function (e) {
        var b = basis(), v = new THREE.Vector3(), d = a.direction;
        if (d === "up" || d === "down") v.fromArray(DIRS[d]);
        else if (d === "left") v.copy(b.r).negate(); else if (d === "right") v.copy(b.r);
        else if (/^(forward|forwards|ahead)$/.test(d)) v.copy(b.f); else v.copy(b.f).negate();
        var t = tr(e); t.p = [t.p[0] + v.x * a.distance, Math.max(0, t.p[1] + v.y * a.distance), t.p[2] + v.z * a.distance];
        return { ops: [trs(e, t)], vars: { target: e.name, direction: d, distance: a.distance >= 1 ? +a.distance.toFixed(2) + " m" : Math.round(a.distance * 100) + " cm" } };
      });
    };
    H.put_floor = function (a) { return withTarget(a, function (e) { var bx = box(e), t = tr(e); t.p[1] = t.p[1] - bx.min.y + 0.002; return { ops: [trs(e, t)], vars: { target: e.name } }; }); };
    H.put_on = function (a) {
      return withTarget(a, function (e) {
        var o = find(a.object); if (o.error) return o; if (o.e === e) return { error: "It can't go on itself." };
        var bx = box(e), bo = box(o.e), c = bo.getCenter(new THREE.Vector3()), t = tr(e), ec = bx.getCenter(new THREE.Vector3());
        t.p = [t.p[0] + (c.x - ec.x), t.p[1] + (bo.max.y - bx.min.y) + 0.002, t.p[2] + (c.z - ec.z)];
        return { ops: [trs(e, t)], vars: { target: e.name, object: o.e.name } };
      });
    };
    H.center = function (a) {
      return withTarget(a, function (e) {
        var room = world.list.find(function (x) { return x.name === "Room shell"; }); if (!room) return { error: "I can't find the room." };
        var rc = box(room).getCenter(new THREE.Vector3()), ec = box(e).getCenter(new THREE.Vector3()), t = tr(e);
        t.p = [t.p[0] + rc.x - ec.x, t.p[1], t.p[2] + rc.z - ec.z];
        return { ops: [trs(e, t)], vars: { target: e.name } };
      });
    };
    H.rotate = function (a) { return withTarget(a, function (e) { var t = tr(e); t.r[1] = ((t.r[1] + a.angle + 540) % 360) - 180; return { ops: [trs(e, t)], vars: { target: e.name, angle: a.angle + "°" } }; }); };
    H.face = function (a) {
      return withTarget(a, function (e) {
        var o = find(a.object); if (o.error) return o;
        var p = e.object.getWorldPosition(new THREE.Vector3()), q = box(o.e).getCenter(new THREE.Vector3()), t = tr(e);
        t.r[1] = Math.atan2(q.x - p.x, q.z - p.z) * 180 / Math.PI;
        return { ops: [trs(e, t)], vars: { target: e.name, object: o.e.name } };
      });
    };
    H.flip = function (a) { return withTarget(a, function (e) { var t = tr(e); t.r[0] = ((t.r[0] + 180 + 540) % 360) - 180; return { ops: [trs(e, t)], vars: { target: e.name } }; }); };
    H.upright = function (a) { return withTarget(a, function (e) { var t = tr(e); t.r[0] = 0; t.r[2] = 0; return { ops: [trs(e, t)], vars: { target: e.name } }; }); };
    function scaleBy(e, f) { var t = tr(e); t.s = t.s.map(function (v, i) { return Math.min(100, Math.max(0.001, v * (Array.isArray(f) ? f[i] : f))); }); return trs(e, t); }
    H.scale = function (a) { return withTarget(a, function (e) { return { ops: [scaleBy(e, a.factor)], vars: { target: e.name, factor: a.factor + "x" } }; }); };
    var DIM = { wider: [1.25, 1, 1], narrower: [0.8, 1, 1], taller: [1, 1.25, 1], shorter: [1, 0.8, 1], longer: [1, 1, 1.25], flatter: [1, 0.67, 1], thinner: [0.8, 1, 0.8] };
    H.resize = function (a) { return withTarget(a, function (e) { return { ops: [scaleBy(e, DIM[a.dimension])], vars: { target: e.name, dimension: a.dimension } }; }); };
    H.bigger = function (a) { return withTarget(a, function (e) { return { ops: [scaleBy(e, 1.25)], vars: { target: e.name } }; }); };
    H.smaller = function (a) { return withTarget(a, function (e) { return { ops: [scaleBy(e, 0.8)], vars: { target: e.name } }; }); };
    H.reset_size = function (a) { return withTarget(a, function (e) { var t = tr(e); t.s = [1, 1, 1]; return { ops: [trs(e, t)], vars: { target: e.name } }; }); };
    H.snap_grid = function (a) { return withTarget(a, function (e) { var g = ed.snap.grid || 0.1, t = tr(e); t.p = [Math.round(t.p[0] / g) * g, t.p[1], Math.round(t.p[2] / g) * g]; return { ops: [trs(e, t)], vars: { target: e.name, grid: Math.round(g * 100) + " cm" } }; }); };
    H.line_up = function (a) {
      return withTarget(a, function (e) {
        var o = find(a.object); if (o.error) return o;
        var p = box(e).getCenter(new THREE.Vector3()), q = box(o.e).getCenter(new THREE.Vector3()), t = tr(e);
        if (Math.abs(q.x - p.x) < Math.abs(q.z - p.z)) t.p[0] += q.x - p.x; else t.p[2] += q.z - p.z;
        return { ops: [trs(e, t)], vars: { target: e.name, object: o.e.name } };
      });
    };
    // shape
    var SHAPE = { box: "box", cube: "box", sphere: "sphere", ball: "sphere", cylinder: "cylinder", ramp: "ramp" };
    H.make_shape = function (a) {
      return withTarget(a, function (e) {
        var k = SHAPE[a.shape]; if (!k) return { error: cap(a.shape) + "s arrive with the prop library (Phase 7)." };
        if (!e.spawn || e.spawn.kind === "clone" || e.spawn.kind === "asset" || e.spawn.kind === "light") return { error: "Only shapes you added can change shape." };
        var col = world.materials(e)[0], op = spawnOp(k, new THREE.Vector3().fromArray(tr(e).p), { size: e.spawn.size, dynamic: e.spawn.dynamic, color: col && col.color ? "#" + col.color.getHexString() : undefined });
        op.id = e.id; op.to.p = tr(e).p; op.to.r = tr(e).r;
        return { ops: [{ op: "delete", id: e.id }, op], vars: { target: e.name, shape: a.shape } };
      });
    };
    // look
    var SURFACE = { wall: /wall-paint/, walls: /wall-paint/, floor: /polished-concrete/, ceiling: /ceiling-paint/ };
    H.paint_surface = function (a) {
      var room = world.list.find(function (x) { return x.name === "Room shell"; }); if (!room) return { error: "I can't find the room." };
      var ops = [];
      world.materials(room).forEach(function (m, mi) {
        if (!SURFACE[a.surface].test(m.name || "")) return;
        if (world.materialUsers(m) > 1 && a.surface !== "walls" && a.surface !== "wall") ops.push({ op: "unique", id: room.id, mi: mi });
        ops.push({ op: "mat", id: room.id, mi: mi, key: "color", value: a.color });
      });
      return ops.length ? { ops: ops, vars: { surface: a.surface, color: a.color_shown } } : { error: "I can't find the " + a.surface + "." };
    };
    H.color = function (a) { return withTarget(a, function (e) { return { ops: matOps(e, "color", a.color), vars: { target: e.name, color: a.color_shown } }; }); };
    var LOOK = { metal: { metalness: 1, roughness: 0.3 }, metallic: { metalness: 1, roughness: 0.3 }, wood: { metalness: 0, roughness: 0.7 }, wooden: { metalness: 0, roughness: 0.7 },
      stone: { metalness: 0, roughness: 0.92 }, glass: { metalness: 0, roughness: 0.05, opacity: 0.35 }, rubber: { metalness: 0, roughness: 0.95 }, plastic: { metalness: 0, roughness: 0.4 },
      ice: { metalness: 0, roughness: 0.1, opacity: 0.75, color: "#d6ecf5" }, neon: { emissiveIntensity: 3, roughness: 0.4 } };
    var MAT_ALIAS = { metallic: "metal", wooden: "wood" };
    H.material = function (a) {
      var name = MAT_ALIAS[a.material] || a.material;
      if (LIB && LIB.hasMaterial(name)) return withTarget(a, function (e) { // textured preset: maps + values, one op per material
        var ops = [];
        world.materials(e).forEach(function (m, mi) {
          if (SKIP_MAT.test(m.name || "") && name !== "glass") return;
          if (world.materialUsers(m) > 1) ops.push({ op: "unique", id: e.id, mi: mi });
          ops.push({ op: "mat", id: e.id, mi: mi, key: "preset", value: name });
        });
        return ops.length ? { ops: ops, vars: { target: e.name, material: name } } : { error: e.name + " has no surface to change." };
      });
      return withTarget(a, function (e) {
        var l = LOOK[a.material], ops = [];
        Object.keys(l).forEach(function (k) { matOps(e, k, l[k]).forEach(function (o) { if (o.op !== "unique" || !ops.some(function (x) { return x.op === "unique" && x.mi === o.mi; })) ops.push(o); }); });
        if (a.material === "neon") { var m = world.materials(e)[0]; if (m && m.color) matOps(e, "emissive", "#" + m.color.getHexString()).forEach(function (o) { if (o.op === "mat") ops.push(o); }); }
        return { ops: ops, vars: { target: e.name, material: a.material.replace(/en$|lic$/, "") } };
      });
    };
    H.shiny = function (a) { return withTarget(a, function (e) { return { ops: matOps(e, "roughness", 0.15), vars: { target: e.name } }; }); };
    H.matte = function (a) { return withTarget(a, function (e) { return { ops: matOps(e, "roughness", 0.9), vars: { target: e.name } }; }); };
    H.transparent = function (a) { return withTarget(a, function (e) { return { ops: matOps(e, "opacity", +(1 - a.percent / 100).toFixed(2), true), vars: { target: e.name, percent: Math.round(a.percent) + "%" } }; }); };
    H.opaque = function (a) { return withTarget(a, function (e) { return { ops: matOps(e, "opacity", 1, true), vars: { target: e.name } }; }); };
    H.glow = function (a) {
      return withTarget(a, function (e) {
        var ops = [];
        world.materials(e).forEach(function (m, mi) { if (world.materialUsers(m) > 1) ops.push({ op: "unique", id: e.id, mi: mi }); ops.push({ op: "mat", id: e.id, mi: mi, key: "emissive", value: m.color ? "#" + m.color.getHexString() : "#ffffff" }); ops.push({ op: "mat", id: e.id, mi: mi, key: "emissiveIntensity", value: 1.5 }); });
        return { ops: ops, vars: { target: e.name } };
      });
    };
    H.no_glow = function (a) { return withTarget(a, function (e) { return { ops: matOps(e, "emissiveIntensity", 0, true), vars: { target: e.name } }; }); };
    H.hide = function (a) { return withTarget(a, function (e) { if (SC.isHidden(e)) return { error: e.name + " is already hidden." }; return { act: function () { SC.step("Hide " + e.name, function () { SC.setHidden(e, true); }, function () { SC.setHidden(e, false); }); }, vars: { target: e.name } }; }); };
    H.show = function (a) { return withTarget(a, function (e) { if (!SC.isHidden(e)) return { error: e.name + " is not hidden." }; return { act: function () { SC.step("Show " + e.name, function () { SC.setHidden(e, false); }, function () { SC.setHidden(e, true); }); }, vars: { target: e.name } }; }); };
    // physics
    function phys(e, key, v) { return { op: "phys", id: e.id, key: key, value: v }; }
    function propsAll() { return world.list.filter(function (e) { return !e.deleted && e.prop && !e.locked && !e.userLocked; }); }
    H.gravity_all = function (a) { var l = propsAll(); if (!l.length) return { error: "There are no props." }; return { ops: l.map(function (e) { return phys(e, "gravity", a.onoff === "on" ? 1 : 0); }), vars: { onoff: a.onoff, count: l.length } }; };
    H.gravity = function (a) { return withTarget(a, function (e) { var n = needProp(e); return n ? { error: n } : { ops: [phys(e, "gravity", a.onoff === "on" ? 1 : 0)], vars: { onoff: a.onoff, target: e.name } }; }); };
    H.body = function (a) {
      return withTarget(a, function (e) {
        var n = needProp(e); if (n) return { error: n };
        var kin = e.prop.body.bodyType() === 2, ops = [];
        if (a.bodytype === "moving") ops.push({ op: "set", id: e.id, path: "body.kinematic", value: true });
        else { if (kin) ops.push({ op: "set", id: e.id, path: "body.kinematic", value: false }); ops.push({ op: "static", id: e.id, value: a.bodytype === "static" }); }
        return { ops: ops, vars: { target: e.name, bodytype: a.bodytype } };
      });
    };
    H.mass = function (a) { return withTarget(a, function (e) { var n = needProp(e); return n ? { error: n } : { ops: [phys(e, "mass", a.mass)], vars: { target: e.name, mass: a.mass + " kg" } }; }); };
    H.weight = function (a) { return withTarget(a, function (e) { var n = needProp(e); return n ? { error: n } : { ops: [phys(e, "mass", { light: 0.5, medium: 2, heavy: 10 }[a.weight])], vars: { target: e.name, weight: a.weight } }; }); };
    H.bounce = function (a) { return withTarget(a, function (e) { var n = needProp(e); return n ? { error: n } : { ops: [phys(e, "restitution", a.ratio)], vars: { target: e.name, ratio: a.ratio } }; }); };
    H.friction = function (a) { return withTarget(a, function (e) { var n = needProp(e); return n ? { error: n } : { ops: [phys(e, "friction", a.ratio)], vars: { target: e.name, ratio: a.ratio } }; }); };
    H.grip = function (a) { return withTarget(a, function (e) { var n = needProp(e); return n ? { error: n } : { ops: [phys(e, "friction", { slippery: 0.03, sticky: 1.4, grippy: 1 }[a.grip])], vars: { target: e.name, grip: a.grip } }; }); };
    function comp(e, type, data) { return { op: "comp", id: e.id, ctype: type, data: data }; }
    H.spin = function (a) { return withTarget(a, function (e) { return { ops: [comp(e, "Spinner", { speed: a.speed, axis: "y" })], vars: { target: e.name, speed: a.speed + "°/s" } }; }); };
    H.stop_spin = function (a) { return withTarget(a, function (e) { if (!e.components.some(function (c) { return c.type === "Spinner"; })) return { error: e.name + " is not spinning." }; return { ops: [comp(e, "Spinner", null)], vars: { target: e.name } }; }); };
    H.bob = function (a) { return withTarget(a, function (e) { return { ops: [comp(e, "Bobber", { height: 0.08, period: 2.5 })], vars: { target: e.name } }; }); };
    H.flicker = function (a) { return withTarget(a, function (e) { if (!world.lights(e).length) return { error: e.name + " has no light to flicker." }; return { ops: [comp(e, "LightPulse", { rate: 7, depth: 0.55 })], vars: { target: e.name } }; }); };
    H.trigger = function (a) { return withTarget(a, function (e) { var b = box(e).getSize(new THREE.Vector3()); return { ops: [comp(e, "Trigger", { sizeX: Math.max(0.05, b.x), sizeY: Math.max(0.05, b.y), sizeZ: Math.max(0.05, b.z), once: false })], vars: { target: e.name } }; }); };
    H.freeze = function (a) { return withTarget(a, function (e) { var n = needProp(e); return n ? { error: n } : { ops: [{ op: "static", id: e.id, value: true }], vars: { target: e.name } }; }); };
    H.unfreeze = function (a) { return withTarget(a, function (e) { var n = needProp(e); return n ? { error: n } : { ops: [{ op: "static", id: e.id, value: false }], vars: { target: e.name } }; }); };
    H.freeze_all = function () { var l = propsAll(); return l.length ? { ops: l.map(function (e) { return { op: "static", id: e.id, value: true }; }), vars: { count: l.length } } : { error: "There are no props." }; };
    H.unfreeze_all = function () { var l = propsAll(); return l.length ? { ops: l.map(function (e) { return { op: "static", id: e.id, value: false }; }), vars: { count: l.length } } : { error: "There are no props." }; };
    H.preset = function (a) {
      var name = a.preset === "zero g" || a.preset === "zero gravity" ? "zero-g" : a.preset, p = REG.presets[name];
      return withTarget(a, function (e) {
        var n = needProp(e); if (n) return { error: n };
        var ops = [];
        if (p.static) ops.push({ op: "static", id: e.id, value: true });
        else { ops.push({ op: "static", id: e.id, value: false }); ops.push(phys(e, "mass", +(2 * p.mass).toFixed(3))); ops.push(phys(e, "gravity", p.gravity)); }
        ops.push(phys(e, "friction", p.friction)); ops.push(phys(e, "restitution", p.bounce));
        return { ops: ops, vars: { target: e.name, preset: cap(name) } };
      });
    };
    // lights
    var BAKED = "The ceiling lights and the desk lamp are baked into the room's lighting, so they can't be switched. Lights you add can.";
    H.lights = function (a) {
      var ops = lightOps(function (e, l, li, o) {
        if (a.onoff === "off") { if (l.intensity > 0) OFF.set(l, l.intensity); o.push({ op: "light", id: e.id, li: li, key: "intensity", value: 0 }); }
        else if (l.intensity === 0) { var b = BUILT.get(l); o.push({ op: "light", id: e.id, li: li, key: "intensity", value: OFF.get(l) || (b && b[0]) || 5 }); }
      }, true);
      if (!ops.length && lightEntities(true).length) return { error: "The lights are already " + a.onoff + "." };
      return ops.length ? { ops: ops, vars: { onoff: a.onoff } } : { error: BAKED };
    };
    function scaleLights(f, label) {
      var ops = lightOps(function (e, l, li, o) { o.push({ op: "light", id: e.id, li: li, key: "intensity", value: Math.min(1e5, l.intensity * f) }); }, true);
      if (ops.length) return { ops: ops };
      return { ops: [envOp("exposure", Math.min(3, Math.max(0.2, S.renderer.toneMappingExposure * f)))] };
    }
    H.dim = function () { return scaleLights(0.7); };
    H.brighter = function () { return scaleLights(1.3); };
    function tint(hex) { return { ops: lightOps(function (e, l, li, o) { o.push({ op: "light", id: e.id, li: li, key: "color", value: blendHex("#" + l.color.getHexString(), hex, 0.35) }); }, false) }; }
    H.warmer = function () { return tint("#ffb070"); };
    H.cooler = function () { return tint("#a8c8ff"); };
    H.night = function () { return { ops: [envOp("exposure", Math.max(0.2, DAY.exposure * 0.45)), envOp("envIntensity", Math.max(0, DAY.envIntensity * 0.25))] }; };
    H.day = function () { return { ops: [envOp("exposure", DAY.exposure), envOp("envIntensity", DAY.envIntensity)] }; };
    var LIGHT_PROP = { lamp: "lamp", "table lamp": "lamp", spotlight: "spotlight", lantern: "lantern", "neon strip": "neon strip" };
    H.add_light = function (a) {
      var p = front();
      if (LIGHT_PROP[a.lighttype]) return { ops: [spawnOp("prop:" + LIGHT_PROP[a.lighttype], p)], vars: { lighttype: a.lighttype } };
      p.y = 1.6; // a bare point light, up at head height
      return { ops: [spawnOp("light", p, { color: "#ffe2b8" })], vars: { lighttype: a.lighttype } };
    };
    H.light_color = function (a) {
      var sel = ed.selection.find(function (e) { return !e.deleted && world.lights(e).length; });
      var ents = sel ? [sel] : lightEntities(true);
      if (!ents.length) return { error: "The ceiling lights and the desk lamp are baked into the room's lighting, so their colour can't change. Lights you add can (say: add a lamp)." };
      var ops = []; ents.forEach(function (e) { world.lights(e).forEach(function (l, li) { ops.push({ op: "light", id: e.id, li: li, key: "color", value: a.color }); }); });
      return { ops: ops, vars: { color: a.color_shown } };
    };
    // rooms and travel
    function rally() { return window.__rally; }
    function inMap() { var r = rally(); return r && r.mode && r.mode !== "room"; }
    H.go = function (a) {
      var r = rally(); if (!r) return { error: "Travel is not ready yet." };
      if (/studio|office/.test(a.room)) return H.back();
      if (/interstate|highway/.test(a.room)) return { act: function () { r.goInterstate(); }, vars: { room: "Interstate" } };
      if (/cqc|close|combat|loop|shoot/.test(a.room)) return { act: function () { r.goCQC(); }, vars: { room: "CQC Loop" } };
      return { act: function () { r.enterMap("rally"); }, vars: { room: "Snowy Mountain Rally" } };
    };
    H.back = function () { var r = rally(); if (!inMap()) return { error: "You are already in the studio." }; return { act: function () { r.leaveMap(); } }; };
    H.open_door = function () { var r = rally(); if (!r || r.dest === "none") return { error: "The door is shut. Say: set the door to rally." }; return r.dest === "interstate" ? { act: function () { r.goInterstate(); } } : r.dest === "cqc" ? { act: function () { r.goCQC(); } } : { act: function () { r.enterMap("rally"); } }; };
    H.close_door = function () { var r = rally(); if (!r) return { error: "The door is not ready yet." }; return { act: function () { r.setDest("none"); } }; };
    H.set_door = function (a) {
      var r = rally(); if (!r) return { error: "The door is not ready yet." };
      var id = /interstate|highway/.test(a.room) ? "interstate" : /cqc|close quarters|combat/.test(a.room) ? "cqc" : /studio|office/.test(a.room) ? null : "rally";
      if (!id) return { error: "The door leads out of the studio; pick rally, interstate or CQC Loop." };
      return { act: function () { r.setDest(id); }, vars: { room: id === "rally" ? "Snowy Mountain Rally" : id === "cqc" ? "CQC Loop" : "Interstate" } };
    };
    H.recenter = function () {
      if (S.renderer.xr.isPresenting && window.__studioTablet) return { act: function () { window.__studioTablet.recenter(); } };
      var d = S.desktop, scr = S.targets && S.targets.screen; if (!d || !scr) return { error: "Recenter is not available here." };
      return { act: function () { var h = S.camera.getWorldPosition(new THREE.Vector3()), t = scr.getWorldPosition(new THREE.Vector3()); d.yaw = Math.atan2(-(t.x - h.x), -(t.z - h.z)); d.pitch = 0; } };
    };
    // scene and project
    H.undo = function () { var h = ed.history; if (!h.canUndo) return { error: "Nothing to undo." }; var l = h.undoLabel; return { act: function () { ed.undo(); }, vars: { label: l } }; };
    H.redo = function () { var h = ed.history; if (!h.canRedo) return { error: "Nothing to redo." }; var l = h.redoLabel; return { act: function () { ed.redo(); }, vars: { label: l } }; };
    function slot(n) { return String(n).trim().replace(/[^\w -]/g, "").slice(0, 40) || "main"; }
    H.snapshot = function () { var n = "snapshot " + new Date().toTimeString().slice(0, 5); return { act: function () { ed.save(n); }, vars: { name: n } }; };
    H.save = function (a) { var n = slot(a.name); return { act: function () { ed.save(n); }, vars: { name: n } }; };
    H.load = function (a) {
      var n = slot(a.name);
      if (!ed.slots().some(function (s) { return s.slot === n; })) return { error: "There is no save called " + n + ". Saves: " + (ed.slots().map(function (s) { return s.slot; }).join(", ") || "none") + "." };
      return { act: function () { var r = ed.load(n); return { applied: r ? r.applied : 0 }; }, vars: { name: n } };
    };
    H.export = function () { var P = window.__studioProject; if (!P) return { error: "Export is not ready yet." }; return { act: function () { return { name: P.exportProject() || "nothing (see the Console)" }; } }; };
    H.import = function () { var P = window.__studioProject; if (!P) return { error: "Import is not ready yet." }; return { act: function () { P.importProject(); } }; };
    H.play = function () { return { act: function () { S.runtime.play(); } }; };
    H.pause = function () { if (S.runtime.mode !== "play") return { error: "The game is not playing." }; return { act: function () { S.runtime.pause(); } }; };
    H.stop = function () { if (S.runtime.mode === "edit") return { error: "Already stopped." }; return { act: function () { S.runtime.stop(); } }; };
    H.select = function (a) { var f = find(a.object); if (f.error) return f; return { act: function () { ed.select(f.e); }, vars: { object: f.e.name } }; };
    H.select_all = function (a) { var l = spawnedOfKind(a.prop); if (!l.length) return { error: "There are no " + a.prop + " you added." }; return { act: function () { ed.select(null); l.forEach(function (e) { ed.select(e, true); }); }, vars: { count: l.length, prop: a.prop } }; };
    H.deselect = function () { return { act: function () { ed.select(null); } }; };
    H.rename = function (a) { return withTarget(a, function (e) { var n = String(a.name).trim().slice(0, 60).replace(/\b\w/g, function (x) { return x.toUpperCase(); }); return { ops: [{ op: "rename", id: e.id, name: n }], vars: { old: e.name, name: n } }; }); };
    H.find = function (a) { var f = find(a.object); if (f.error) return f; return { act: function () { ed.select(f.e); os.openApp("studio"); if (studio.frameSelection) try { studio.frameSelection(); } catch (e) {} }, vars: { object: f.e.name } }; };
    H.lock = function (a) { return withTarget(a, function (e) { if (e.locked || e.userLocked) return { error: e.name + " is already locked." }; return { act: function () { SC.step("Lock " + e.name, function () { SC.setLocked(e, true); }, function () { SC.setLocked(e, false); }); }, vars: { target: e.name } }; }); };
    H.unlock = function (a) { return withTarget(a, function (e) { if (e.locked) return { error: e.name + " is part of the room and stays locked." }; if (!e.userLocked) return { error: e.name + " is not locked." }; return { act: function () { SC.step("Unlock " + e.name, function () { SC.setLocked(e, false); }, function () { SC.setLocked(e, true); }); }, vars: { target: e.name } }; }); };
    H.hide_all = function () {
      var l = world.list.filter(function (e) { return !e.deleted && e.spawn && !SC.isHidden(e); });
      if (!l.length) return { error: "Nothing you added is showing." };
      return { act: function () { SC.step("Hide " + l.length + " things", function () { l.forEach(function (e) { SC.setHidden(e, true); }); }, function () { l.forEach(function (e) { SC.setHidden(e, false); }); }); }, vars: { count: l.length } };
    };
    H.show_all = function () {
      var l = world.list.filter(function (e) { return !e.deleted && SC.isHidden(e); });
      if (!l.length) return { error: "Nothing is hidden." };
      return { act: function () { SC.step("Show " + l.length + " things", function () { l.forEach(function (e) { SC.setHidden(e, false); }); }, function () { l.forEach(function (e) { SC.setHidden(e, true); }); }); }, vars: { count: l.length } };
    };
    H.reset_room = function () { return { act: function () {} }; };
    H.reset_room_now = function () {
      var P = window.__studioProject; if (!P) return { error: "Reset is not ready yet." };
      return { act: function () { os.storage.set("project.backup", JSON.stringify(P.current())); ed.write("studio.autosave", []); os.storage.set("editor.outliner", "{}"); setTimeout(function () { location.reload(); }, 400); } };
    };
    // view and help
    H.frame_time = function () { return { act: function () { os.openApp("profiler"); } }; };
    function stepScale(d) {
      var f = UI.features.find(function (x) { return x.key === "uiScale"; }), vals = f.options.map(function (o) { return o[0]; });
      var i = Math.max(0, Math.min(vals.length - 1, vals.indexOf(UI.value("uiScale")) + d));
      return { act: function () { UI.setValue("uiScale", vals[i]); }, vars: { scale: Math.round(vals[i] * 100) + "%" } };
    }
    H.text_bigger = function () { return stepScale(1); };
    H.text_smaller = function () { return stepScale(-1); };
    H.list = function () { return { act: function () { if (window.__studioPalette) window.__studioPalette.open({ browse: true }); } }; };
    var CATS = { spawn: "Spawn and delete", move: "Move, rotate, scale", shape: "Shape", look: "Look and material", material: "Look and material", physics: "Physics", presets: "Presets", lights: "Lights", rooms: "Rooms and travel", travel: "Rooms and travel", scene: "Scene and project", project: "Scene and project", view: "View and reading", help: "Help", range: "Range", shooting: "Range" };
    H.list_group = function (a) { var g = CATS[a.category]; return { act: function () { if (window.__studioPalette) window.__studioPalette.open({ browse: g }); }, vars: { category: g } }; };
    H.favorite = function (a) {
      var m = match(a.command); if (!m) return { error: "That is not a command I know." };
      return { act: function () { var f = favorites().filter(function (x) { return x !== a.command; }); f.unshift(a.command); os.storage.set("commands.favorites", JSON.stringify(f.slice(0, 12))); }, vars: { command: a.command } };
    };
    H.recent = function () { return { act: function () { if (window.__studioPalette) window.__studioPalette.open({ browse: "recent" }); } }; };

    // ---------- running ----------
    function recent() { try { return JSON.parse(os.storage.get("commands.recent") || "[]"); } catch (e) { return []; } }
    function favorites() { try { return JSON.parse(os.storage.get("commands.favorites") || "[]"); } catch (e) { return []; } }
    function remember(text) { var r = recent().filter(function (x) { return x !== text; }); r.unshift(text); os.storage.set("commands.recent", JSON.stringify(r.slice(0, 20))); }
    function fill(tpl, vars) { return String(tpl || "Done.").replace(/\{(\w+)\}/g, function (_, k) { return vars[k] !== undefined ? vars[k] : k === "target" ? "it" : "{" + k + "}"; }); }
    // a command given by name with its blanks (Claude's tool calls): the same checks and runner as typed text
    function runCall(name, raw, opts) {
      if (!REG) return { ok: false, reply: "Commands are still loading." };
      var c = REG.commands.find(function (x) { return x.name === name; });
      if (!c) return { ok: false, reply: "Unknown command " + name + "." };
      var args = {}; raw = raw && typeof raw === "object" ? raw : {};
      for (var k in raw) if (!(k in c.blanks)) return { ok: false, reply: name + " has no blank called " + k + ".", cmd: c };
      for (k in c.blanks) {
        var v = raw[k] !== undefined && raw[k] !== null ? String(raw[k]).trim().toLowerCase().slice(0, 80) : c.defaults && c.defaults[k] !== undefined ? String(c.defaults[k]) : undefined;
        if (v === undefined || v === "") continue;
        var b = c.blanks[k];
        if (b.type === "enum" && (REG.enums[b.of] || []).indexOf(v) < 0) return { ok: false, reply: v + " is not a choice for " + k + ".", cmd: c };
        args[k] = v;
      }
      return run(null, Object.assign({}, opts, { matched: { cmd: c, args: args, loose: false }, label: opts && opts.label || cap(c.example) }));
    }
    function run(text, opts) {
      opts = opts || {};
      if (!REG) return { ok: false, reply: "Commands are still loading." };
      var m = opts.matched || match(text);
      if (opts.matched) text = opts.label;
      if (!m) {
        var s = suggest(text);
        return { ok: false, reply: s.length ? "Not sure what you mean. Did you mean: " + s.join(" · ") + "?" : "I don't know that command. Say: what can I say", suggestions: s };
      }
      var c = m.cmd;
      if (c.status === "planned") return { ok: false, reply: cap(c.example) + ": this " + c.planned + ".", cmd: c };
      if (c.editorOnly && !(window.__studioEditorMode && window.__studioEditorMode.on)) return { ok: false, reply: "Open the Game Editor first; this works in Editor mode.", cmd: c };
      var args = {};
      for (var k in c.blanks) {
        if (m.args[k] === undefined) continue;
        var b = c.blanks[k];
        if (b.type === "object" || b.type === "prop" || b.type === "enum" || b.type === "name") { args[k] = m.args[k]; continue; }
        var p = parseBlank(k, b, m.args[k]);
        if (p.error) return { ok: false, reply: p.error, cmd: c };
        args[k] = p.value; args[k + "_shown"] = p.shown;
      }
      var h = H[c.name];
      if (!h) return { ok: false, reply: "That command has no runner yet.", cmd: c };
      var res;
      try { res = h(args); } catch (e) { return { ok: false, reply: "That did not work: " + e.message, cmd: c }; }
      if (res && res.notFound && m.loose) { // e.g. "colr it red" read as an object called "colr it": suggest instead
        var sg = suggest(text);
        if (sg.length) return { ok: false, reply: "Not sure what you mean. Did you mean: " + sg.join(" · ") + "?", suggestions: sg };
      }
      if (!res || res.error) return { ok: false, reply: res ? res.error : "That did not work.", cmd: c };
      var vars = Object.assign({}, args, res.vars || {}), reply;
      if (res.ops) {
        var spawns = res.ops.filter(function (o) { return o.op === "spawn" && o.spec.dynamic; }).length, deletes = res.ops.filter(function (o) { return o.op === "delete"; }).length;
        var lim = spawns > deletes ? propLimitOk(spawns - deletes) : null;
        if (lim) return { ok: false, reply: lim, cmd: c };
        res.ops = withPropExtras(res.ops);
        var r = ed.applyBatch(res.ops, cap(String(text).trim()));
        if (!r.ok) return { ok: false, reply: "Could not do that: " + r.why + ".", cmd: c };
        // what was just added becomes "it"
        var added = res.ops.filter(function (o) { return o.op === "spawn"; }).map(function (o) { return world.get(o.id); }).filter(Boolean);
        if (added.length) { ed.select(null); added.forEach(function (e) { ed.select(e, true); }); }
        try { S.renderer.shadowMap.needsUpdate = true; } catch (e) {}
      } else if (res.act) {
        var extra = res.act();
        if (extra && typeof extra === "object") Object.assign(vars, extra);
      }
      reply = cap(fill(c.reply, vars));
      if (vars.__many) reply = reply.replace(/\b(is|weighs|bounces|spins|floats|glows|now looks)\b/, function (w) { return { is: "are", weighs: "weigh", bounces: "bounce", spins: "spin", floats: "float", glows: "glow", "now looks": "now look" }[w]; });
      if (c.undoable && (res.ops || res.act) && c.name !== "undo" && c.name !== "redo") reply += " Undo?";
      if (!opts.noRemember) remember(String(text).trim());
      if (log) log.info("Command: " + String(text).trim() + "  →  " + reply);
      os.invalidate();
      return { ok: true, reply: reply, cmd: c };
    }

    api = window.__studioCommands = {
      get registry() { return REG; }, ready: false,
      match: match, suggest: suggest, run: run, recent: recent, favorites: favorites, normalize: function (t) { return REG ? normalize(t) : t; },
      // for add-ons that bring new commands (the Inspector): add a runner, reuse target lookup
      runCall: runCall, handle: function (name, fn) { H[name] = fn; }, withTarget: function (a, fn) { return withTarget(a, fn); }, find: function (t) { return find(t); }
    };
    fetch("./commands.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (j) {
      if (j.format !== "studio-commands") throw new Error("not a command registry");
      REG = j; build(); api.ready = true;
      if (log) log.info("Commands: " + REG.commands.length + " in the registry (version " + REG.version + ")");
      // other add-ons (Inspector, Armory) add their runners once they are up: check for gaps after that
      setTimeout(function () {
        var missing = REG.commands.filter(function (c) { return c.status === "ready" && !H[c.name]; }).map(function (c) { return c.name; });
        if (missing.length && log) log.warn("Commands without a runner: " + missing.join(", "));
      }, 15000);
    }).catch(function (e) { if (log) log.error("Commands: could not load commands.json (" + e.message + ")"); });
  });
})();
