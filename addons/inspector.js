// Inspector (Phase 8, roadmap section 9 and Appendix C, groups A to N).
// Replaces the Scene tab's inspector panel (studio.inspector) with the full option set: Simple and Advanced
// modes, a search box, sections that fold (remembered) with Reset / Copy / Paste, a Quest cost tag on every
// option (Low plain, Med amber, High red and asks once), a one-line tip for the option under the pointer,
// a material preview, performance badges and validation warnings.
// Every change is an engine op through editor.applyBatch, so it is validated, one Undo step and autosaved.
// Options the engine had no op for go through one generic op, {op:"set", id, path, value, mi?, li?},
// whose paths are whitelisted here (window.__studioSet). New Play-mode behaviours are engine components
// (Constant force, Start velocity, Pulse, Path mover). Editor view helpers (grid, names, colliders) live on
// the editor-only camera layer.
(function () {
  "use strict";
  var LAYER = 30;

  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        var os = s && s.ready && ((s.computer && s.computer.os) || (s.targets && s.targets.computer && s.targets.computer.os));
        if (os && s.editor && os.apps.get("studio") && window.__studioUI && window.__studioScene && window.__studioComponents) resolve({ S: s, os: os });
        else setTimeout(check, 250);
      })();
    });
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function v3(x, y, z) { return { x: x, y: y, z: z }; }

  // ---------- generic "set" op: the whitelist (defined at once so autosave replay can use it) ----------
  var SET = {};
  function def(path, spec) { spec.path = path; SET[path] = spec; }
  function S_() { return window.__studio; }
  function target(op, e) {
    var spec = SET[op.path], w = S_().editor.world;
    switch (spec.scope) {
      case "object": return e.object;
      case "mat": return w.materials(e)[op.mi];
      case "light": return w.lights(e)[op.li];
      case "body": return e.prop;
      case "meta": return e;
      case "scene": return S_();
    }
  }
  function okValue(spec, v) {
    switch (spec.type) {
      case "bool": return typeof v === "boolean";
      case "num": return typeof v === "number" && isFinite(v) && v >= spec.min && v <= spec.max;
      case "enum": return spec.options.indexOf(v) >= 0;
      case "vec2": return Array.isArray(v) && v.length === 2 && v.every(function (x) { return typeof x === "number" && isFinite(x) && x >= spec.min && x <= spec.max; });
      case "vec3b": return Array.isArray(v) && v.length === 3 && v.every(function (x) { return typeof x === "boolean"; });
      case "str": return typeof v === "string" && v.length <= spec.max;
      case "numOrNull": return v === null || typeof v === "number" && isFinite(v) && v >= spec.min && v <= spec.max;
    }
    return false;
  }
  window.__studioSet = {
    paths: SET,
    check: function (op, e) {
      var spec = SET[op.path];
      if (!spec) return "unknown setting " + op.path;
      if (spec.scope === "scene") { if (op.id !== "environment") return "scene settings use id environment"; }
      else if (!e) return "no such object";
      if (spec.scope === "body" && e && (e.locked || e.userLocked)) return e.name + " is locked";
      if (spec.scope === "meta" && spec.path === "meta.layer" && e && e.locked) return e.name + " is locked";
      if (!okValue(spec, op.value)) return "bad value for " + op.path;
      var t = target(op, e);
      if (!t) return spec.scope === "body" ? e.name + " has no physics body" : "nothing to set for " + op.path;
      if (spec.physicalOnly && !t.isMeshPhysicalMaterial) return "this material has no " + spec.label;
      if (spec.spotOnly && !t.isSpotLight) return "only spotlights have a cone";
      return null;
    },
    op: function (op, e) {
      if (!BASE.size) window.__studioMaterialBaseline();
      var spec = SET[op.path], t = target(op, e), prev = spec.get(t, e, op);
      if (Array.isArray(prev)) prev = prev.slice();
      return { label: (e ? e.name : "Scene") + ": " + spec.label, live: true,
        do: function () { spec.set(t, op.value, e, op); after(spec); },
        undo: function () { spec.set(t, prev, e, op); after(spec); } };
    }
  };
  function after(spec) { var s = S_(); if (spec.shadow) try { s.renderer.shadowMap.needsUpdate = true; } catch (x) {} if (s.computer) s.computer.os.invalidate(); }
  function meshes(o, fn) { o.traverse(function (m) { if (m.isMesh) fn(m); }); }
  function firstMesh(o) { var r = null; o.traverse(function (m) { if (!r && m.isMesh) r = m; }); return r; }
  // object
  def("obj.castShadow", { scope: "object", type: "bool", label: "cast shadows", shadow: true, get: function (o) { var m = firstMesh(o); return m ? m.castShadow : false; }, set: function (o, v) { meshes(o, function (m) { m.castShadow = v; }); } });
  def("obj.receiveShadow", { scope: "object", type: "bool", label: "receive shadows", shadow: true, get: function (o) { var m = firstMesh(o); return m ? m.receiveShadow : false; }, set: function (o, v) { meshes(o, function (m) { m.receiveShadow = v; m.material && [].concat(m.material).forEach(function (x) { x.needsUpdate = true; }); }); } });
  def("obj.renderOrder", { scope: "object", type: "num", min: -10, max: 10, label: "render order", get: function (o) { var m = firstMesh(o); return m ? m.renderOrder : 0; }, set: function (o, v) { meshes(o, function (m) { m.renderOrder = Math.round(v); }); } });
  // material
  function matDef(path, label, type, extra, prop) {
    def(path, Object.assign({ scope: "mat", type: type, label: label, get: function (m) { return m[prop]; }, set: function (m, v) { m[prop] = v; m.needsUpdate = true; } }, extra || {}));
  }
  def("mat.side", { scope: "mat", type: "enum", options: ["front", "back", "double"], label: "faces", get: function (m) { return ["front", "back", "double"][m.side] || "front"; }, set: function (m, v) { m.side = ["front", "back", "double"].indexOf(v); m.needsUpdate = true; } });
  matDef("mat.wireframe", "wireframe", "bool", null, "wireframe");
  matDef("mat.flatShading", "flat shading", "bool", null, "flatShading");
  matDef("mat.envMapIntensity", "sky reflection", "num", { min: 0, max: 3 }, "envMapIntensity");
  matDef("mat.aoMapIntensity", "contact shadow strength", "num", { min: 0, max: 2 }, "aoMapIntensity");
  matDef("mat.alphaTest", "cut-out threshold", "num", { min: 0, max: 1 }, "alphaTest");
  matDef("mat.fog", "affected by fog", "bool", null, "fog");
  matDef("mat.clearcoat", "clear coat", "num", { min: 0, max: 1, physicalOnly: true }, "clearcoat");
  matDef("mat.clearcoatRoughness", "clear coat roughness", "num", { min: 0, max: 1, physicalOnly: true }, "clearcoatRoughness");
  matDef("mat.transmission", "glass transmission", "num", { min: 0, max: 1, physicalOnly: true }, "transmission");
  def("mat.normalScale", { scope: "mat", type: "num", min: 0, max: 3, label: "bump strength", get: function (m) { return m.normalScale ? m.normalScale.x : 1; }, set: function (m, v) { if (m.normalScale) m.normalScale.set(v, v); } });
  def("mat.blend", { scope: "mat", type: "enum", options: ["opaque", "blended", "cutout"], label: "opacity mode",
    get: function (m) { return m.alphaTest > 0 ? "cutout" : m.transparent ? "blended" : "opaque"; },
    set: function (m, v) { m.transparent = v === "blended"; m.alphaTest = v === "cutout" ? (m.alphaTest || 0.5) : 0; m.depthWrite = v !== "blended" || m.opacity > 0.95; m.needsUpdate = true; } });
  var SLOTS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap"];
  // texture settings change this material's own copies of its textures (copies share the image on the GPU)
  function ownMaps(m) {
    if (m.userData.__ownMaps) return;
    SLOTS.forEach(function (k) { if (m[k]) { var c = m[k].clone(); if (c.image) c.needsUpdate = true; m[k] = c; } });
    m.userData.__ownMaps = true;
  }
  function maps(m) { return SLOTS.map(function (k) { return m[k]; }).filter(Boolean); }
  def("mat.repeat", { scope: "mat", type: "vec2", min: 0.05, max: 50, label: "tiling", get: function (m) { var t = maps(m)[0]; return t ? [t.repeat.x, t.repeat.y] : [1, 1]; }, set: function (m, v) { ownMaps(m); maps(m).forEach(function (t) { t.repeat.set(v[0], v[1]); }); } });
  def("mat.offset", { scope: "mat", type: "vec2", min: -5, max: 5, label: "offset", get: function (m) { var t = maps(m)[0]; return t ? [t.offset.x, t.offset.y] : [0, 0]; }, set: function (m, v) { ownMaps(m); maps(m).forEach(function (t) { t.offset.set(v[0], v[1]); }); } });
  def("mat.rotation", { scope: "mat", type: "num", min: -180, max: 180, label: "texture rotation", get: function (m) { var t = maps(m)[0]; return t ? t.rotation * 180 / Math.PI : 0; }, set: function (m, v) { ownMaps(m); maps(m).forEach(function (t) { t.rotation = v * Math.PI / 180; t.center.set(0.5, 0.5); }); } });
  def("mat.wrap", { scope: "mat", type: "enum", options: ["repeat", "mirror", "clamp"], label: "edge mode",
    get: function (m) { var t = maps(m)[0], T = S_().THREE; return !t ? "repeat" : t.wrapS === T.MirroredRepeatWrapping ? "mirror" : t.wrapS === T.ClampToEdgeWrapping ? "clamp" : "repeat"; },
    set: function (m, v) { ownMaps(m); var T = S_().THREE, w = v === "mirror" ? T.MirroredRepeatWrapping : v === "clamp" ? T.ClampToEdgeWrapping : T.RepeatWrapping; maps(m).forEach(function (t) { t.wrapS = t.wrapT = w; t.needsUpdate = true; }); } });
  def("mat.filter", { scope: "mat", type: "enum", options: ["smooth", "crisp"], label: "filtering",
    get: function (m) { var t = maps(m)[0]; return t && t.magFilter === S_().THREE.NearestFilter ? "crisp" : "smooth"; },
    set: function (m, v) { ownMaps(m); var T = S_().THREE; maps(m).forEach(function (t) { t.magFilter = v === "crisp" ? T.NearestFilter : T.LinearFilter; t.needsUpdate = true; }); } });
  def("mat.anisotropy", { scope: "mat", type: "enum", options: [1, 4, 8, 16], label: "sharpness at an angle", get: function (m) { var t = maps(m)[0]; return t ? t.anisotropy : 1; }, set: function (m, v) { ownMaps(m); maps(m).forEach(function (t) { t.anisotropy = v; t.needsUpdate = true; }); } });
  var PATTERNS = ["none", "checker", "stripes", "grid", "dots", "noise", "gradient"], PAT = {};
  function pattern(name) {
    if (PAT[name]) return PAT[name];
    var T = S_().THREE, c = document.createElement("canvas"); c.width = c.height = 256; var x = c.getContext("2d");
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, 256, 256); x.fillStyle = "#3a3a3a";
    if (name === "checker") for (var i = 0; i < 8; i++) for (var j = 0; j < 8; j++) { if ((i + j) % 2) x.fillRect(i * 32, j * 32, 32, 32); }
    if (name === "stripes") for (i = 0; i < 8; i++) x.fillRect(i * 32, 0, 16, 256);
    if (name === "grid") { for (i = 0; i <= 8; i++) { x.fillRect(i * 32 - 1, 0, 3, 256); x.fillRect(0, i * 32 - 1, 256, 3); } }
    if (name === "dots") for (i = 0; i < 8; i++) for (j = 0; j < 8; j++) { x.beginPath(); x.arc(i * 32 + 16, j * 32 + 16, 7, 0, 7); x.fill(); }
    if (name === "noise") { var d = x.getImageData(0, 0, 256, 256); for (i = 0; i < d.data.length; i += 4) { var v = 150 + Math.random() * 105; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; } x.putImageData(d, 0, 0); }
    if (name === "gradient") { var g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#555555"); x.fillStyle = g; x.fillRect(0, 0, 256, 256); }
    var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(2, 2); t.anisotropy = 4;
    return (PAT[name] = t);
  }
  def("mat.pattern", { scope: "mat", type: "enum", options: PATTERNS, label: "pattern",
    get: function (m) { return m.userData.__pattern || "none"; },
    set: function (m, v) {
      if (!("__baseMap" in m.userData)) m.userData.__baseMap = m.map || null;
      m.map = v === "none" ? m.userData.__baseMap : pattern(v); m.userData.__pattern = v; m.needsUpdate = true;
    } });
  // the look a material had when the page loaded (taken before the autosave is replayed)
  var BASE = new Map();
  window.__studioMaterialBaseline = function () {
    var w = S_().editor.world;
    w.list.forEach(function (e) { w.materials(e).forEach(function (m) { if (BASE.has(m)) return; var b = { maps: {} }; SLOTS.forEach(function (k) { b.maps[k] = m[k] || null; });
      ["roughness", "metalness", "opacity", "transparent", "emissiveIntensity", "envMapIntensity", "side", "wireframe", "flatShading", "alphaTest", "depthWrite"].forEach(function (k) { if (k in m) b[k] = m[k]; });
      if (m.color) b.color = m.color.getHex(); if (m.emissive) b.emissive = m.emissive.getHex(); if (m.normalScale) b.ns = m.normalScale.x; BASE.set(m, b); }); });
  };
  function snapshotMat(m) { var b = { maps: {} }; SLOTS.forEach(function (k) { b.maps[k] = m[k] || null; }); ["roughness", "metalness", "opacity", "transparent", "emissiveIntensity", "envMapIntensity", "side", "wireframe", "flatShading", "alphaTest", "depthWrite"].forEach(function (k) { if (k in m) b[k] = m[k]; }); if (m.color) b.color = m.color.getHex(); if (m.emissive) b.emissive = m.emissive.getHex(); if (m.normalScale) b.ns = m.normalScale.x; return b; }
  function restoreMat(m, b) { SLOTS.forEach(function (k) { if (k in b.maps) m[k] = b.maps[k]; }); for (var k in b) if (k !== "maps" && k !== "color" && k !== "emissive" && k !== "ns") m[k] = b[k]; if (b.color != null) m.color.setHex(b.color); if (b.emissive != null && m.emissive) m.emissive.setHex(b.emissive); if (b.ns != null && m.normalScale) m.normalScale.set(b.ns, b.ns); m.needsUpdate = true; }
  def("mat.reset", { scope: "mat", type: "bool", label: "original look", get: function (m) { return snapshotMat(m); }, set: function (m, v) { if (v === true) { var b = BASE.get(m); if (!b && m.name) BASE.forEach(function (v, k) { if (!b && k.name === m.name) b = v; }); if (b) restoreMat(m, b); } else if (v && v.maps) restoreMat(m, v); } });
  // light
  function lightDef(path, label, type, extra, prop) { def(path, Object.assign({ scope: "light", type: type, label: label, get: function (l) { return l[prop]; }, set: function (l, v) { l[prop] = v; } }, extra || {})); }
  lightDef("light.distance", "range", "num", { min: 0, max: 100 }, "distance");
  lightDef("light.penumbra", "edge softness", "num", { min: 0, max: 1, spotOnly: true }, "penumbra");
  lightDef("light.decay", "fall-off", "num", { min: 0, max: 3 }, "decay");
  def("light.angle", { scope: "light", type: "num", min: 1, max: 89, spotOnly: true, label: "cone angle", get: function (l) { return l.angle * 180 / Math.PI; }, set: function (l, v) { l.angle = v * Math.PI / 180; } });
  def("light.castShadow", { scope: "light", type: "bool", label: "shadows", shadow: true, get: function (l) { return l.castShadow; }, set: function (l, v) { l.castShadow = v; S_().scene.traverse(function (o) { if (o.material) [].concat(o.material).forEach(function (m) { m.needsUpdate = true; }); }); } });
  def("light.shadowSize", { scope: "light", type: "enum", options: [512, 1024, 2048], label: "shadow quality", shadow: true, get: function (l) { return l.shadow ? l.shadow.mapSize.x : 1024; }, set: function (l, v) { if (!l.shadow) return; l.shadow.mapSize.set(v, v); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } } });
  // physics body
  function rapier() { return window.__studio.physics && window.__studio.physics.world; }
  def("body.linearDamping", { scope: "body", type: "num", min: 0, max: 10, label: "drag", get: function (p) { return p.body.linearDamping(); }, set: function (p, v) { p.body.setLinearDamping(v); p.body.wakeUp(); } });
  def("body.angularDamping", { scope: "body", type: "num", min: 0, max: 10, label: "spin damping", get: function (p) { return p.body.angularDamping(); }, set: function (p, v) { p.body.setAngularDamping(v); p.body.wakeUp(); } });
  def("body.ccd", { scope: "body", type: "bool", label: "fast-object mode", get: function (p) { return p.body.isCcdEnabled(); }, set: function (p, v) { p.body.enableCcd(v); } });
  def("body.lockMove", { scope: "body", type: "vec3b", label: "move locks", get: function (p) { return (p.__lockMove || [false, false, false]).slice(); }, set: function (p, v) { p.__lockMove = v.slice(); p.body.setEnabledTranslations(!v[0], !v[1], !v[2], true); } });
  def("body.lockRotate", { scope: "body", type: "vec3b", label: "turn locks", get: function (p) { return (p.__lockRot || [false, false, false]).slice(); }, set: function (p, v) { p.__lockRot = v.slice(); p.body.setEnabledRotations(!v[0], !v[1], !v[2], true); } });
  def("body.layer", { scope: "body", type: "enum", options: ["everything", "nothing"], label: "collides with",
    get: function (p) { return p.__ghost ? "nothing" : "everything"; },
    set: function (p, v) {
      var n = p.body.numColliders();
      for (var i = 0; i < n; i++) { var c = p.body.collider(i); if (c.__groups === undefined) c.__groups = c.collisionGroups(); c.setCollisionGroups(v === "nothing" ? 0 : c.__groups); }
      p.__ghost = v === "nothing"; p.body.wakeUp();
    } });
  def("body.kinematic", { scope: "body", type: "bool", label: "moving platform",
    get: function (p) { return p.body.bodyType() === 2; },
    set: function (p, v) { if (v) { if (p.__typeBefore === undefined) p.__typeBefore = p.body.bodyType(); p.body.setBodyType(2, true); } else { p.body.setBodyType(p.__typeBefore != null && p.__typeBefore !== 2 ? p.__typeBefore : 0, true); } } });
  // identity
  function metaDef(path, label, type, extra) { var key = path.split(".")[1]; def(path, Object.assign({ scope: "meta", type: type, label: label, get: function (e) { return e.meta && e.meta[key] !== undefined ? e.meta[key] : (type === "bool" ? false : ""); }, set: function (e, v) { e.meta = e.meta || {}; e.meta[key] = v; } }, extra || {})); }
  metaDef("meta.tags", "tags", "str", { max: 120 });
  metaDef("meta.notes", "notes", "str", { max: 500 });
  metaDef("meta.favorite", "favourite", "bool");
  def("meta.layer", { scope: "meta", type: "enum", options: ["Props", "Furniture", "Lights", "Architecture", "Weapons", "Spawned", "Places"], label: "layer", get: function (e) { return e.layer; }, set: function (e, v) { e.layer = v; S_().editor.world.version++; } });
  // scene and world
  def("scene.fog", { scope: "scene", type: "enum", options: ["off", "light", "dense"], label: "fog",
    get: function (s) { return s.__fog || "off"; },
    set: function (s, v) { var T = s.THREE; s.__fog = v; s.scene.fog = v === "off" ? null : v === "light" ? new T.Fog(0xc9ccd1, 6, 70) : new T.FogExp2(0xbfc3c8, 0.05); } });
  def("scene.gravity", { scope: "scene", type: "num", min: -30, max: 0, label: "gravity", get: function (s) { var w = rapier(); return w ? w.gravity.y : -9.81; }, set: function (s, v) { var w = rapier(); if (w) w.gravity = { x: 0, y: v, z: 0 }; } });
  def("scene.killPlane", { scope: "scene", type: "numOrNull", min: -100, max: 0, label: "kill plane", get: function (s) { return s.__killY === undefined ? null : s.__killY; }, set: function (s, v) { s.__killY = v === null ? undefined : v; } });

  // ---------- new Play-mode behaviours (registered early, before the autosave is replayed) ----------
  (function registerComps() {
    var COMP = window.__studioComponents, THREE = window.__studio && window.__studio.THREE;
    if (!COMP || !THREE) { setTimeout(registerComps, 40); return; }
    COMP.register({ type: "ConstantForce", label: "Constant force", description: "Pushes the object in one direction while the game plays (a fan, an updraft).",
      fields: { x: { kind: "number", default: 0, min: -500, max: 500, label: "N" }, y: { kind: "number", default: 20, min: -500, max: 500, label: "N" }, z: { kind: "number", default: 0, min: -500, max: 500, label: "N" } },
      update: function (e, d, st, c) { if (e.prop && !e.prop.held) e.prop.body.applyImpulse(v3(d.x * c.dt, d.y * c.dt, d.z * c.dt), true); } });
    COMP.register({ type: "StartVelocity", label: "Start velocity", description: "Launches the object when Play starts.",
      fields: { vx: { kind: "number", default: 0, min: -50, max: 50, label: "m/s" }, vy: { kind: "number", default: 3, min: -50, max: 50, label: "m/s" }, vz: { kind: "number", default: 0, min: -50, max: 50, label: "m/s" }, spin: { kind: "number", default: 0, min: -2000, max: 2000, label: "deg/s" } },
      start: function (e, d) { if (!e.prop) return; e.prop.body.setLinvel(v3(d.vx, d.vy, d.vz), true); e.prop.body.setAngvel(v3(0, d.spin * Math.PI / 180, 0), true); } });
    COMP.register({ type: "Pulse", label: "Pulse", description: "Grows and shrinks gently while the game plays.",
      fields: { amount: { kind: "number", default: 0.1, min: 0, max: 1 }, period: { kind: "number", default: 1.5, min: 0.1, max: 60, label: "s" } },
      start: function (e, d, st) { st.s = e.object.scale.clone(); },
      update: function (e, d, st, c) { var k = 1 + Number(d.amount) * Math.sin(c.time * Math.PI * 2 / Number(d.period)); e.object.scale.copy(st.s).multiplyScalar(k); } });
    COMP.register({ type: "PathMover", label: "Path mover", description: "Moves along points (x,y,z; x,y,z) from where it stands, while the game plays.",
      fields: { points: { kind: "string", default: "" }, speed: { kind: "number", default: 0.5, min: 0.02, max: 20, label: "m/s" }, pingpong: { kind: "bool", default: true }, smooth: { kind: "bool", default: true } },
      start: function (e, d, st) {
        st.pts = [e.object.position.clone()];
        String(d.points).split(";").forEach(function (p) { var n = p.split(",").map(Number); if (n.length === 3 && n.every(isFinite)) st.pts.push(new THREE.Vector3(n[0], n[1], n[2])); });
        st.len = []; st.total = 0; for (var i = 1; i < st.pts.length; i++) { var l = st.pts[i].distanceTo(st.pts[i - 1]); st.len.push(l); st.total += l; }
        st.t = 0;
      },
      update: function (e, d, st, c) {
        if (st.pts.length < 2 || st.total <= 0) return;
        st.t += Number(d.speed) * c.dt;
        var span = d.pingpong ? st.total * 2 : st.total, s = st.t % span; if (s > st.total) s = span - s;
        var i = 0; while (i < st.len.length - 1 && s > st.len[i]) { s -= st.len[i]; i++; }
        var f = clamp(s / st.len[i], 0, 1); if (d.smooth) f = f * f * (3 - 2 * f);
        var p = st.pts[i].clone().lerp(st.pts[i + 1], f);
        e.object.position.copy(p);
        if (e.prop) { e.prop.body.setTranslation(v3(p.x, p.y, p.z), true); e.prop.body.setLinvel(v3(0, 0, 0), true); }
      } });

    window.__studioSet.compsReady = true;
  })();

  waitForStudio().then(function (ctx) {
    var S = ctx.S, os = ctx.os, ed = S.editor, world = ed.world, studio = os.apps.get("studio"), THREE = S.THREE, UI = window.__studioUI, SC = window.__studioScene;
    var FONT = os.fonts.ui, COMP = window.__studioComponents;
    var X = { bg: "#1d2026", panel: "#25292f", panel2: "#2c3138", line: "#3a4049", text: "#e8ebef", dim: "#9aa3ae", accent: "#3d8bfd", warn: "#ffb648", err: "#ff6b6b", ok: "#5ad08a", sel: "#2f4f7d" };
    if (!BASE.size) window.__studioMaterialBaseline();

    // ---------- per frame: moving platforms follow their object; kill plane ----------
    var lastKill = 0;
    var frameRender = S.renderer.render.bind(S.renderer);
    S.renderer.render = function (sc, cam) {
      if (sc === S.scene && cam === S.camera) {
        try {
          S.physics.props.forEach(function (p) {
            if (p.body.bodyType() !== 2) return;
            var o = p.desc.object; p.body.setNextKinematicTranslation(v3(o.position.x, o.position.y, o.position.z)); p.body.setNextKinematicRotation({ x: o.quaternion.x, y: o.quaternion.y, z: o.quaternion.z, w: o.quaternion.w });
          });
          var now = performance.now();
          if (S.__killY !== undefined && now - lastKill > 250) {
            lastKill = now;
            S.physics.props.forEach(function (p) {
              if (!p.body.isEnabled() || p.body.translation().y > S.__killY) return;
              var e = world.of(p.desc.object), st = e && S.runtime.editState.get(e.id), to = st ? st.p : new THREE.Vector3(p.desc.object.position.x, 1, p.desc.object.position.z);
              S.physics.teleport(p, to, st ? st.q : p.desc.object.quaternion); p.body.setLinvel(v3(0, 0, 0), true);
            });
          }
        } catch (x) {}
      }
      return frameRender(sc, cam);
    };

    // ---------- editor view helpers (grid, names, colliders): editor-only layer, remembered ----------
    var VIEW = { grid: false, names: false, colliders: false, cell: 0.5 };
    try { Object.assign(VIEW, JSON.parse(os.storage.get("editor.view") || "{}")); } catch (x) {}
    var grid = null, names = null;
    function onLayer(o) { o.traverse(function (x) { x.layers.set(LAYER); x.userData.noBullet = true; }); }
    function applyView() {
      os.storage.set("editor.view", JSON.stringify(VIEW));
      if (grid) { S.scene.remove(grid); grid.geometry.dispose(); grid = null; }
      if (VIEW.grid) { var n = Math.round(12 / VIEW.cell); grid = new THREE.GridHelper(12, n, 0x3d8bfd, 0x8a94a3); grid.position.y = 0.003; grid.material.transparent = true; grid.material.opacity = 0.35; grid.name = "editor-grid"; onLayer(grid); S.scene.add(grid); }
      if (names) { names.children.forEach(function (s) { s.material.map.dispose(); s.material.dispose(); }); S.scene.remove(names); names = null; }
      if (VIEW.names) { names = new THREE.Group(); names.name = "editor-names"; S.scene.add(names); refreshNames(); }
      if (S.diag && S.diag.setOverlay) S.diag.setOverlay("colliders", !!VIEW.colliders);
      os.invalidate();
    }
    function label(text) {
      var c = document.createElement("canvas"); c.width = 256; c.height = 48; var x = c.getContext("2d");
      x.font = "600 26px " + FONT; var w = Math.min(250, x.measureText(text).width + 24);
      x.fillStyle = "rgba(20,24,30,.78)"; x.beginPath(); x.roundRect((256 - w) / 2, 4, w, 40, 20); x.fill();
      x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, 128, 25);
      var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(0.42, 0.08, 1); s.renderOrder = 1000;
      return s;
    }
    function refreshNames() {
      if (!names) return;
      var list = world.list.filter(function (e) { return !e.deleted && e.object.visible && e.name !== "Room shell"; });
      while (names.children.length > list.length) { var s = names.children.pop(); s.material.map.dispose(); s.material.dispose(); }
      list.forEach(function (e, i) {
        var s = names.children[i];
        if (!s || s.userData.text !== e.name) { if (s) { names.remove(s); s.material.map.dispose(); s.material.dispose(); } s = label(e.name); s.userData.text = e.name; onLayer(s); names.add(s); }
        var b = new THREE.Box3().setFromObject(e.object); if (b.isEmpty()) return; var c = b.getCenter(new THREE.Vector3()); s.position.set(c.x, b.max.y + 0.08, c.z);
      });
    }
    setInterval(refreshNames, 600);
    applyView();
    window.__studioView = { get: function () { return Object.assign({}, VIEW); }, set: function (k, v) { VIEW[k] = v; applyView(); } };

    // ---------- UI Settings switches (UI Settings page, group Inspector) ----------
    // (defined in ui.js FEATURES: inspectorMode, advancedPhysics, materialPreview, perfBadges, validation, sceneSettings)
    function feat(k) { return UI.get(k); }

    // ---------- inspector state ----------
    var I = { search: "", collapsed: {}, clip: {}, highOk: {}, confirm: null, tip: null, lockRatio: true };
    try { I.collapsed = JSON.parse(os.storage.get("insp.collapsed") || "{}"); I.highOk = JSON.parse(os.storage.get("insp.highOk") || "{}"); } catch (x) {}
    function saveState() { os.storage.set("insp.collapsed", JSON.stringify(I.collapsed)); os.storage.set("insp.highOk", JSON.stringify(I.highOk)); }
    function apply(ops, label) { var r = ed.applyBatch(ops, label); if (!r.ok && S.log) S.log.warn(label + ": " + r.why); os.invalidate(); return r.ok; }
    function setOp(e, path, value, extra) { return Object.assign({ op: "set", id: e ? e.id : "environment", path: path, value: value }, extra || {}); }
    function run(text) { var r = window.__studioCommands && window.__studioCommands.run(text); if (r && !r.ok && S.log) S.log.warn(r.reply); os.invalidate(); }
    function trs(o) { var D = 180 / Math.PI; return { p: o.position.toArray(), r: [o.rotation.x * D, o.rotation.y * D, o.rotation.z * D], s: o.scale.toArray() }; }
    function comp(e, type) { return e.components.find(function (c) { return c.type === type; }); }
    function compDefaults(type) { var d = COMP.types.get(type), o = {}; if (d) for (var k in d.fields) o[k] = d.fields[k].default; return o; }
    function stats(e) {
      var tris = 0, mats = new Set(), texs = new Set();
      e.object.traverse(function (m) { if (!m.isMesh) return; var g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; [].concat(m.material).forEach(function (x) { mats.add(x); SLOTS.forEach(function (k) { if (x[k] && x[k].image) texs.add(x[k].source || x[k]); }); }); });
      var mb = 0; texs.forEach(function (s) { var im = s.data || s.image; if (im && im.width) mb += im.width * im.height * 4 * 1.33 / 1048576; });
      return { tris: Math.round(tris), mats: mats.size, mb: mb };
    }
    function warnings(e, st) {
      var w = [];
      if (st.tris > 60000) w.push("Heavy model: " + Math.round(st.tris / 1000) + "k triangles");
      if (st.mb > 24) w.push("Uses " + st.mb.toFixed(0) + " MB of textures");
      world.materials(e).forEach(function (m) { SLOTS.forEach(function (k) { var t = m[k]; if (t && !(t.image || (t.source && t.source.data))) w.push("Missing texture (" + k + ")"); if (t && t.image && t.image.width > 2048) w.push("Huge image " + t.image.width + " px (" + k + ")"); }); });
      if (window.__studioProps && window.__studioProps.count() > 80) w.push("Many physics bodies (" + window.__studioProps.count() + ")");
      var b = new THREE.Box3().setFromObject(e.object); if (!b.isEmpty() && b.max.y < -0.2) w.push("Below the floor");
      if (e.prop && e.prop.body.mass && e.prop.body.mass() < 0.02) w.push("Very light: it may jitter");
      return w.filter(function (x, i) { return w.indexOf(x) === i; }).slice(0, 4);
    }
    var COST = { Low: null, Med: X.warn, High: X.err };

    // ---------- drawing ----------
    studio.inspector = function (c, x0, y0, W, H) {
      var self = this, e = ed.selection.find(function (s) { return !s.deleted; });
      c.fillStyle = X.panel; c.fillRect(x0, y0, W, H); c.fillStyle = X.line; c.fillRect(x0, y0, 1, H);
      this.areas.insp = { x: x0, y: y0, w: W, h: H };
      var simple = UI.value("inspectorMode") !== "advanced", q = I.search.trim().toLowerCase(), hoverTip = null;
      var mouse = this.mouse || { x: -1, y: -1 };
      c.save(); c.beginPath(); c.rect(x0, y0, W, H); c.clip();
      c.textBaseline = "middle";
      // fixed top bar: search, mode
      var bar = 50;
      c.fillStyle = X.panel; c.fillRect(x0, y0, W, bar);
      this.textField(c, "insp-search", I.search || "", x0 + 12, y0 + 9, W - 160, 32, function (v) { I.search = v; self.inspScroll = 0; }, 15);
      if (!I.search) { c.fillStyle = X.dim; c.font = "400 15px " + FONT; c.fillText("Search options…", x0 + 22, y0 + 26); }
      this.button(c, simple ? "Simple" : "Advanced", x0 + W - 140, y0 + 9, 128, 32, function () { UI.setValue("inspectorMode", simple ? "advanced" : "simple"); self.inspScroll = 0; }, !simple);
      c.fillStyle = X.line; c.fillRect(x0, y0 + bar - 1, W, 1);
      c.beginPath(); c.rect(x0, y0 + bar, W, H - bar - 44); c.clip();
      var y = y0 + bar + 10 - this.inspScroll, L = x0 + 16, R = x0 + W - 16, CW = W - 32;
      function vis(hgt) { return y + hgt > y0 + bar && y < y0 + H - 44; }
      function tipZone(h, tip, cost) { if (tip && mouse.x >= x0 && mouse.x <= x0 + W && mouse.y >= y && mouse.y <= y + h) hoverTip = { text: tip, cost: cost }; }
      function text(s, xx, yy, font, col) { c.font = font; c.fillStyle = col; c.fillText(s, xx, yy); }
      function costTag(cost, xx, yy) { if (!COST[cost]) return; c.font = "700 11px " + FONT; var w = c.measureText(cost).width + 12; c.fillStyle = COST[cost]; c.beginPath(); c.roundRect(xx, yy - 9, w, 18, 9); c.fill(); c.fillStyle = "#1d2026"; c.fillText(cost, xx + 6, yy + 1); }
      function matches(label, tip) { return !q || (label + " " + (tip || "")).toLowerCase().indexOf(q) >= 0; }
      // a row: label on the left (with cost tag), control on the right
      function row(label, tip, cost, h, draw) {
        if (!matches(label, tip)) return;
        if (vis(h)) { text(label, L, y + 16, "500 15px " + FONT, X.text); if (cost && COST[cost]) costTag(cost, L + c.measureText(label).width + 8, y + 16); draw(y); }
        tipZone(h, tip, cost); y += h;
      }
      function later(label, note) { row(label, note || "Arrives later.", null, 30, function (yy) { text(note && note.length < 28 ? note : "later", L + 190, yy + 16, "italic 400 14px " + FONT, X.dim); }); }
      function info(label, value, tip) { row(label, tip, null, 30, function (yy) { var v = String(value); c.font = "400 14px " + FONT; while (v.length > 3 && c.measureText(v).width > CW - 180) v = v.slice(0, -2); text(v, L + 180, yy + 16, "400 14px " + FONT, X.dim); }); }
      function toggle(label, on, tip, cost, fn, enabled) {
        row(label, tip, cost, 40, function (yy) {
          var asking = I.confirm === label;
          self.button(c, asking ? "Tap again" : on ? "On" : "Off", R - 100, yy + 2, 100, 32, function () {
            if (enabled === false) return;
            if (cost === "High" && !on && !I.highOk[label] && !asking) { I.confirm = label; return; }
            if (cost === "High" && !on) { I.highOk[label] = true; saveState(); }
            I.confirm = null; fn(!on);
          }, on, enabled !== false);
        });
      }
      function chips(label, options, current, tip, cost, fn, labels) {
        if (!matches(label + " " + options.join(" "), tip)) return;
        var h = 0; c.font = "500 14px " + FONT;
        var lx = L, ly = 0, widths = options.map(function (o, i) { return c.measureText(String(labels ? labels[i] : o)).width + 22; });
        widths.forEach(function (w) { if (lx + w > R) { lx = L; ly += 36; } lx += w + 6; }); h = 28 + ly + 40;
        if (vis(h)) {
          text(label, L, y + 14, "500 15px " + FONT, X.text); if (cost && COST[cost]) costTag(cost, L + c.measureText(label).width + 8, y + 14);
          lx = L; ly = y + 28;
          options.forEach(function (o, i) { var w = widths[i]; if (lx + w > R) { lx = L; ly += 36; } self.button(c, String(labels ? labels[i] : o), lx, ly, w, 30, function () { fn(o); }, o === current); lx += w + 6; });
        }
        tipZone(h, tip, cost); y += h;
      }
      function num(label, value, step, tip, cost, fn, key, locked) { row(label, tip, cost, 40, function (yy) { self.numField(c, key || "n-" + label, value, R - 150, yy + 2, 150, 32, step, "none", !!locked, function (v, pre) { if (!pre) fn(v); }, function () {}); }); }
      function slider(label, value, min, max, tip, cost, live, commit) {
        if (!matches(label, tip)) return;
        // the engine's slider keeps 100 px for its label: longer labels and cost tags get a line of their own
        c.font = "500 15px " + FONT; var lw = c.measureText(label).width, two = lw > 92 || !!(cost && COST[cost]), h = two ? 58 : 40;
        if (vis(h)) {
          var start = null;
          if (two) { text(label, L, y + 12, "500 15px " + FONT, X.text); if (cost && COST[cost]) costTag(cost, L + lw + 8, y + 12); }
          self.slider(c, two ? "" : label, value, min, max, two ? L - 96 : L, y + (two ? 20 : 2), two ? CW + 96 : CW, function (v, pre) { v = clamp(v, min, max); if (pre) { if (start === null) start = value; if (live) live(v); } else { if (live && start !== null) live(start); commit(v); start = null; } }, function () {});
        }
        tipZone(h, tip, cost); y += h;
      }
      function textRow(label, value, tip, fn, key) { row(label, tip, null, 40, function (yy) { self.textField(c, key || "t-" + label, value, L + 120, yy + 2, CW - 120, 32, fn, 15); }); }
      function color(label, hex, tip, fn) {
        if (!matches(label, tip)) return;
        if (vis(84)) { text(label, L, y + 14, "500 15px " + FONT, X.text); self.swatches(c, L, y + 28, CW - 120, hex, fn); self.textField(c, "hex-" + label, hex, R - 110, y + 32, 110, 30, function (v) { var t = v[0] === "#" ? v : "#" + v; if (/^#[0-9a-f]{6}$/i.test(t)) fn(t.toLowerCase()); }, 14); }
        tipZone(84, tip); y += 84;
      }
      // a section header with fold, Reset, Copy, Paste
      function section(id, title, tools) {
        if (simple) return true;
        var open = q ? true : !I.collapsed[id];
        if (q && !sectionHasMatch[id]) return false;
        if (vis(40)) {
          c.fillStyle = X.panel2; c.fillRect(x0 + 1, y, W - 1, 36);
          text((open ? "▾ " : "▸ ") + title.toUpperCase(), L, y + 18, "700 14px " + FONT, X.dim);
          self.hits.push({ x: x0, y: y, w: W - 200, h: 36, cursor: "pointer", up: function () { I.collapsed[id] = open; saveState(); } });
          var bx = R;
          (tools || []).slice().reverse().forEach(function (t) { c.font = "600 13px " + FONT; var w = c.measureText(t[0]).width + 16; bx -= w; self.button(c, t[0], bx, y + 5, w, 26, t[1]); bx -= 6; });
        }
        y += 42;
        return open;
      }
      var sectionHasMatch = {};

      if (!e) {
        text("Select an object in the Outliner, in the viewport,", L, y + 14, "400 16px " + FONT, X.dim);
        text("or in the room with the World tool.", L, y + 40, "400 16px " + FONT, X.dim);
        y += 70;
        if (!simple && feat("sceneSettings")) { sceneSection(); }
        editorSection();
        finish(); return;
      }
      var st = stats(e), mats = world.materials(e), lights = world.lights(e);
      this.matIndex = Math.min(this.matIndex || 0, Math.max(0, mats.length - 1));
      var m = mats[this.matIndex], li = Math.min(I.li || 0, Math.max(0, lights.length - 1)), lt = lights[li];
      // header
      if (vis(80)) {
        this.textField(c, "name", e.name, L - 4, y, CW - 40, 36, function (v) { v = v.trim(); if (v) apply([{ op: "rename", id: e.id, name: v.slice(0, 60) }], "Rename"); }, 22);
        if (ed.selection.length > 1) text(ed.selection.length + " selected; editing the first", L, y + 50, "500 14px " + FONT, X.warn);
        else text(e.id + " · " + e.layer + (e.locked ? " · part of the room" : "") + (e.userLocked ? " · locked" : "") + (e.bakedStatic ? " · baked" : ""), L, y + 50, "400 14px " + FONT, X.dim);
        if (feat("perfBadges")) {
          var badge = st.tris > 60000 || st.mb > 24 ? X.err : st.tris > 15000 || st.mb > 8 ? X.warn : X.ok, bt = (st.tris < 1000 ? st.tris : Math.round(st.tris / 100) / 10 + "k") + " tris · " + st.mats + " mat · " + st.mb.toFixed(1) + " MB";
          c.font = "600 13px " + FONT; var bw = c.measureText(bt).width + 20; c.fillStyle = badge; c.beginPath(); c.roundRect(L, y + 64, bw, 22, 11); c.fill(); text(bt, L + 10, y + 75, "600 13px " + FONT, "#1d2026");
        }
      }
      y += feat("perfBadges") ? 96 : 70;
      if (feat("validation")) warnings(e, st).forEach(function (w) { if (vis(24)) text("⚠ " + w, L, y + 10, "500 14px " + FONT, X.warn); y += 24; });

      // ---------- Simple mode: the 10 most used ----------
      if (simple) {
        if (m && m.color) color("Colour", "#" + m.color.getHexString(), "The object's main colour.", function (hex) { run("color it " + hex); });
        chips("Material", ["wood", "steel", "concrete", "fabric", "plastic", "rubber", "glass", "painted metal"], null, "A complete look: colour, bumps and shine from real textures.", null, function (v) { run("make it " + v); });
        num("Size", e.object.scale.x, 0.01, "Scales the object evenly (1 = as made).", null, function (v) { var t = trs(e.object), k = clamp(v, 0.01, 100) / (t.s[0] || 1); t.s = t.s.map(function (s) { return clamp(s * k, 0.001, 100); }); apply([{ op: "trs", id: e.id, to: t, from: trs(e.object) }], "Size"); });
        if (e.prop) {
          num("Mass (kg)", e.prop.body.mass(), 0.05, "How heavy it is.", null, function (v) { apply([{ op: "phys", id: e.id, key: "mass", value: clamp(v, 0.01, 5000) }], "Mass"); });
          slider("Bounce", physVal(e, "restitution"), 0, 1, "0 = no bounce, 1 = springs right back.", null, null, function (v) { apply([{ op: "phys", id: e.id, key: "restitution", value: v }], "Bounce"); });
          slider("Friction", physVal(e, "friction"), 0, 1, "0 = ice, 1 = rubber.", null, null, function (v) { apply([{ op: "phys", id: e.id, key: "friction", value: v }], "Friction"); });
          slider("Gravity", e.prop.body.gravityScale(), -1, 2, "1 = normal, 0 = floats, below 0 = rises.", null, null, function (v) { apply([{ op: "phys", id: e.id, key: "gravity", value: v }], "Gravity"); });
        }
        later("Grabbable", "Every dynamic prop can be grabbed; a switch arrives later.");
        toggle("Visible", !SC.isHidden(e), "Hide or show without deleting.", null, function (v) { run((v ? "show " : "hide ") + "it"); });
        info("Name", e.name, "Change it at the top of this panel.");
        finish(); return;
      }

      // ---------- Advanced: groups A to N ----------
      // A Transform
      var A = trs(e.object);
      if (section("A", "A · Transform", [["Reset", function () { var t = trs(e.object); t.r = [0, 0, 0]; t.s = [1, 1, 1]; apply([{ op: "trs", id: e.id, to: t, from: trs(e.object) }], "Reset transform"); }], ["Copy", function () { I.clip.A = trs(e.object); }], ["Paste", function () { if (I.clip.A) apply([{ op: "trs", id: e.id, to: JSON.parse(JSON.stringify(I.clip.A)), from: trs(e.object) }], "Paste transform"); }]])) {
        [["Position", "p", 0.005, "Metres. Drag a field, or click it and type."], ["Rotation", "r", 0.5, "Degrees around each axis."], ["Scale", "s", 0.005, "1 = as made. With the ratio locked, all three change together."]].forEach(function (rw) {
          if (!matches(rw[0], rw[3])) return;
          if (vis(40)) { text(rw[0], L, y + 16, "500 15px " + FONT, X.text); for (var k = 0; k < 3; k++) (function (k) {
            self.numField(c, rw[1] + k, A[rw[1]][k], L + 92 + k * ((CW - 92) / 3), y + 2, (CW - 92) / 3 - 6, 32, rw[2], ["x", "y", "z"][k], !!(e.locked || e.userLocked), function (v, pre) {
              var t = trs(e.object);
              if (rw[1] === "s" && I.lockRatio) { var f = clamp(v, 0.001, 100) / (t.s[k] || 1); t.s = t.s.map(function (s) { return clamp(s * f, 0.001, 100); }); } else t[rw[1]][k] = rw[1] === "s" ? clamp(v, 0.001, 100) : v;
              if (pre) { self.preview(e, t); return; }
              apply([{ op: "trs", id: e.id, to: t, from: self._from || A }], "Move " + e.name); self._from = null;
            }, function () { self._from = trs(e.object); });
          })(k); }
          tipZone(40, rw[3]); y += 40;
        });
        toggle("Lock scale ratio", I.lockRatio, "Keep the proportions when you change one scale value.", null, function (v) { I.lockRatio = v; });
        chips("Quick turn", ["45", "90", "180", "reset"], null, "Turns around the vertical axis.", null, function (v) { if (v === "reset") { var t = trs(e.object); t.r = [0, 0, 0]; apply([{ op: "trs", id: e.id, to: t, from: trs(e.object) }], "Reset rotation"); } else run("rotate it " + v); }, ["45°", "90°", "180°", "Reset"]);
        chips("Snap", [0, 0.05, 0.1, 0.25], ed.snap.grid, "Grid step for moves (World tool and handles).", null, function (v) { ed.snap.grid = v; }, ["off", "5 cm", "10 cm", "25 cm"]);
        chips("Angle snap", [0, 5, 15, 45, 90], ed.snap.angle, "Angle step for turns.", null, function (v) { ed.snap.angle = v; }, ["free", "5°", "15°", "45°", "90°"]);
        chips("Align", ["floor", "grid", "centre"], null, "Put it on the floor, on the grid, or in the middle of the room.", null, function (v) { run(v === "floor" ? "put it on the floor" : v === "grid" ? "snap to grid" : "center it"); }, ["On floor", "To grid", "Room centre"]);
        chips("Array", [2, 3, 5, 10], null, "Copies in a line beside it, with the same physics.", "Low", function (v) { run("clone it " + v + " times"); }, ["2 copies", "3", "5", "10"]);
        later("Pivot", "Set the turning point: later.");
        later("Space", "World axes now; local axes later.");
        later("Parent", "Attach to another object: later.");
        later("Mirror", "Mirror on an axis: later.");
      }
      // B Shape and mesh
      if (section("B", "B · Shape and mesh")) {
        var prim = e.spawn && ["box", "sphere", "cylinder", "ramp"].indexOf(e.spawn.kind) >= 0;
        if (prim) {
          chips("Base shape", ["box", "sphere", "cylinder", "ramp"], e.spawn.kind, "Swap the shape and keep place, size and colour.", null, function (v) { run("make it a " + v); });
          var sz = e.spawn.size;
          [["Width", 0], ["Height", 1], ["Depth", 2]].forEach(function (d) {
            if ((e.spawn.kind === "sphere" && d[1] > 0) || (e.spawn.kind === "cylinder" && d[1] === 2)) return;
            num(e.spawn.kind === "sphere" ? "Diameter" : e.spawn.kind === "cylinder" && d[1] === 0 ? "Diameter" : d[0], sz[d[1]], 0.005, "Metres. Rebuilds the shape and its collider.", null, function (v) {
              var size = sz.slice(); size[d[1]] = clamp(v, 0.01, 50); if (e.spawn.kind === "sphere") size = [size[0], size[0], size[0]]; if (e.spawn.kind === "cylinder") size[2] = size[0];
              var col = mats[0] && mats[0].color ? "#" + mats[0].color.getHexString() : "#d8d4cc";
              apply([{ op: "delete", id: e.id }, { op: "spawn", id: e.id, spec: { kind: e.spawn.kind, dynamic: e.spawn.dynamic, size: size }, to: trs(e.object), color: col }], "Resize " + e.name);
              var ne = world.get(e.id); if (ne) ed.select(ne);
            });
          });
        } else info("Base shape", e.spawn ? (e.spawn.kind === "prop" ? "library prop" : e.spawn.kind) : "built into the room", "Shapes you add can change shape and size here.");
        later("Round corners, hollow, taper", "Shape settings: later.");
        later("Detail level", "Low / medium / high: later.");
        chips("Normals", ["smooth", "flat"], m && m.flatShading ? "flat" : "smooth", "Smooth or faceted shading for every material of this object.", null, function (v) { apply(mats.map(function (x, i) { return setOp(e, "mat.flatShading", v === "flat", { mi: i }); }), "Shading"); });
        info("Triangles", st.tris.toLocaleString(), "How much geometry the headset draws for this object.");
        info("Materials", String(st.mats), "Each material is at least one draw call.");
        info("Texture memory", st.mb.toFixed(1) + " MB", "Video memory used by this object's textures (shared ones counted once).");
      }
      // C Material
      if (m && section("C", "C · Material", [["Reset", function () { apply([setOp(e, "mat.reset", true, { mi: self.matIndex })], "Reset look"); }], ["Copy", function () { I.clip.C = { color: m.color && "#" + m.color.getHexString(), roughness: m.roughness, metalness: m.metalness, opacity: m.opacity, preset: m.name && m.name.indexOf("preset-") === 0 ? m.name.slice(7).replace(/-/g, " ") : null }; }], ["Paste", function () { var p = I.clip.C; if (!p) return; var ops = []; if (world.materialUsers(m) > 1) ops.push({ op: "unique", id: e.id, mi: self.matIndex }); if (p.preset && window.__studioPropLib && window.__studioPropLib.hasMaterial(p.preset)) ops.push({ op: "mat", id: e.id, mi: self.matIndex, key: "preset", value: p.preset }); if (p.color) ops.push({ op: "mat", id: e.id, mi: self.matIndex, key: "color", value: p.color }); ["roughness", "metalness", "opacity"].forEach(function (k) { if (typeof p[k] === "number") ops.push({ op: "mat", id: e.id, mi: self.matIndex, key: k, value: p[k] }); }); apply(ops, "Paste material"); }]])) {
        var users = world.materialUsers(m), mi = self.matIndex;
        function matOps(key, value) { var ops = []; if (world.materialUsers(m) > 1) ops.push({ op: "unique", id: e.id, mi: mi }); ops.push({ op: "mat", id: e.id, mi: mi, key: key, value: value }); return ops; }
        function matSet(path, value) { var ops = []; if (world.materialUsers(m) > 1) ops.push({ op: "unique", id: e.id, mi: mi }); ops.push(setOp(e, path, value, { mi: mi })); return ops; }
        if (vis(40)) {
          text((m.name || m.type) + "  (" + (mi + 1) + "/" + mats.length + ")", L, y + 16, "500 15px " + FONT, X.text);
          self.button(c, "◀", R - 96, y + 2, 44, 30, function () { self.matIndex = (mi + mats.length - 1) % mats.length; });
          self.button(c, "▶", R - 46, y + 2, 44, 30, function () { self.matIndex = (mi + 1) % mats.length; });
        }
        y += 40;
        if (users > 1 && vis(36)) { text("Shared by " + users + " meshes: edits apply to all", L, y + 14, "400 14px " + FONT, X.warn); self.button(c, "Make unique", R - 130, y, 130, 28, function () { apply([{ op: "unique", id: e.id, mi: mi }], "Make unique"); }); y += 36; }
        if (feat("materialPreview") && vis(110)) { drawPreview(c, L, y, 100, m); text("Live preview", L + 116, y + 50, "400 14px " + FONT, X.dim); }
        if (feat("materialPreview")) y += 110;
        var PRES = window.__studioPropLib ? window.__studioPropLib.materials : [];
        chips("Material preset", PRES, null, "A complete look from real textures: colour, bumps and shine.", null, function (v) { var ops = []; if (world.materialUsers(m) > 1) ops.push({ op: "unique", id: e.id, mi: mi }); ops.push({ op: "mat", id: e.id, mi: mi, key: "preset", value: v }); apply(ops, e.name + ": " + v); });
        if (m.color) color("Base colour", "#" + m.color.getHexString(), "Tints the whole surface.", function (hex) { apply(matOps("color", hex), "Colour"); });
        ["metalness", "roughness"].forEach(function (k) { if (typeof m[k] === "number") slider(k === "metalness" ? "Metalness" : "Roughness", m[k], 0, 1, k === "metalness" ? "0 = paint, wood, plastic. 1 = bare metal." : "0 = mirror. 1 = matte.", null, function (v) { m[k] = v; }, function (v) { apply(matOps(k, v), k); }); });
        slider("Opacity", m.opacity, 0, 1, "1 = solid. Lower is see-through (costs more on Quest when blended).", m.transparent ? "Med" : null, function (v) { m.opacity = v; m.transparent = v < 1; }, function (v) { apply(matOps("opacity", v), "Opacity"); });
        chips("Opacity mode", ["opaque", "blended", "cutout"], SET["mat.blend"].get(m), "Blended = glass-like. Cut-out = leaves and fences (sharp edges).", "Med", function (v) { apply(matSet("mat.blend", v), "Opacity mode"); }, ["Opaque", "Blended", "Cut-out"]);
        if (m.alphaTest > 0) slider("Cut-off", m.alphaTest, 0, 1, "Pixels below this opacity are cut away.", null, null, function (v) { apply(matSet("mat.alphaTest", v), "Cut-off"); });
        if (m.emissive) { color("Glow colour", "#" + m.emissive.getHexString(), "Light the surface gives off itself (no light is cast).", function (hex) { apply(matOps("emissive", hex), "Glow colour"); }); slider("Glow strength", Math.min(10, m.emissiveIntensity), 0, 10, "0 = no glow.", null, function (v) { m.emissiveIntensity = v; }, function (v) { apply(matOps("emissiveIntensity", v), "Glow"); }); }
        toggle("Double-sided", m.side === 2, "Draw both faces of thin shapes (leaves, cloth, paper).", null, function (v) { apply(matSet("mat.side", v ? "double" : "front"), "Faces"); });
        toggle("Wireframe", !!m.wireframe, "A debug look: edges only.", null, function (v) { apply(matSet("mat.wireframe", v), "Wireframe"); });
        toggle("Flat look", !!m.flatShading, "Faceted shading.", null, function (v) { apply(matSet("mat.flatShading", v), "Flat look"); });
        if ("envMapIntensity" in m) slider("Sky reflection", m.envMapIntensity, 0, 3, "How strongly the sky and room reflect in it.", null, function (v) { m.envMapIntensity = v; }, function (v) { apply(matSet("mat.envMapIntensity", v), "Reflection"); });
        if (m.isMeshPhysicalMaterial) {
          slider("Clear coat", m.clearcoat, 0, 1, "Glossy top layer, like car paint.", "Med", null, function (v) { apply(matSet("mat.clearcoat", v), "Clear coat"); });
          slider("Glass transmission", m.transmission, 0, 1, "Real refraction. Expensive on Quest: cheap see-through glass is the default.", "High", null, function (v) { if (v > 0 && !I.highOk.transmission) { I.highOk.transmission = true; saveState(); if (S.log) S.log.warn("Glass transmission costs frame time on Quest; set it again to apply."); return; } apply(matSet("mat.transmission", v), "Transmission"); });
        } else { info("Clear coat", "this material has none", "Only physical materials (the desk, the floor) have a clear coat."); info("Glass transmission", "High cost; physical materials only", "Use opacity for cheap glass."); }
        later("Fresnel rim", "Edge highlight: later. Selection outlines show in Editor mode.");
        later("Vertex colours", "Paint per corner: later.");
      }
      // D Textures
      if (m && section("D", "D · Textures")) {
        var mi2 = self.matIndex;
        function tSet(path, value) { var ops = []; if (world.materialUsers(m) > 1) ops.push({ op: "unique", id: e.id, mi: mi2 }); ops.push(setOp(e, path, value, { mi: mi2 })); return ops; }
        var have = SLOTS.filter(function (k) { return m[k]; });
        info("Maps", have.length ? have.map(function (k) { var im = m[k].image; return k.replace("Map", "").replace("map", "colour") + (im && im.width ? " " + im.width : ""); }).join(" · ") : "none", "Colour, bump (normal), roughness/metal, contact shadow (ao), glow and opacity maps.");
        if (have.length) {
          var rep = SET["mat.repeat"].get(m), off = SET["mat.offset"].get(m);
          [["Tiling", rep, "mat.repeat", 0.01, "How many times the image repeats across each face."], ["Offset", off, "mat.offset", 0.005, "Slides the image."]].forEach(function (rw) {
            if (!matches(rw[0], rw[4])) return;
            if (vis(40)) { text(rw[0], L, y + 16, "500 15px " + FONT, X.text); for (var k = 0; k < 2; k++) (function (k) { self.numField(c, rw[2] + k, rw[1][k], L + 120 + k * ((CW - 120) / 2), y + 2, (CW - 120) / 2 - 6, 32, rw[3], ["x", "y"][k], false, function (v, pre) { if (pre) return; var vv = rw[1].slice(); vv[k] = clamp(v, SET[rw[2]].min, SET[rw[2]].max); apply(tSet(rw[2], vv), rw[0]); }, function () {}); })(k); }
            tipZone(40, rw[4]); y += 40;
          });
          num("Rotation (°)", SET["mat.rotation"].get(m), 0.5, "Turns the image on the surface.", null, function (v) { apply(tSet("mat.rotation", clamp(v, -180, 180)), "Texture rotation"); });
          chips("Edges", ["repeat", "mirror", "clamp"], SET["mat.wrap"].get(m), "What happens past the image's edge.", null, function (v) { apply(tSet("mat.wrap", v), "Texture edges"); }, ["Repeat", "Mirror", "Clamp"]);
          chips("Filtering", ["smooth", "crisp"], SET["mat.filter"].get(m), "Crisp keeps hard pixels (pixel art).", null, function (v) { apply(tSet("mat.filter", v), "Filtering"); }, ["Smooth", "Crisp"]);
          chips("Sharp at an angle", [1, 4, 8, 16], SET["mat.anisotropy"].get(m), "Keeps floors sharp when seen at a slant (4 is a good Quest value).", "Med", function (v) { apply(tSet("mat.anisotropy", v), "Anisotropy"); }, ["1×", "4×", "8×", "16×"]);
        }
        if (m.normalMap) slider("Bump strength", m.normalScale ? m.normalScale.x : 1, 0, 3, "How deep the surface detail looks.", null, function (v) { m.normalScale.set(v, v); }, function (v) { apply(tSet("mat.normalScale", v), "Bump strength"); });
        if (m.aoMap) slider("Contact shadows", m.aoMapIntensity, 0, 2, "Strength of the baked ambient occlusion.", null, null, function (v) { apply(tSet("mat.aoMapIntensity", v), "Contact shadows"); });
        chips("Pattern", PATTERNS, SET["mat.pattern"].get(m), "A generated colour pattern: no image file needed.", null, function (v) { apply(tSet("mat.pattern", v), "Pattern"); });
        info("Colour space", m.map ? (m.map.colorSpace === THREE.SRGBColorSpace ? "colour image (sRGB)" : "data image") : "–", "Colour images are sRGB; bump and roughness maps are data.");
        info("Size cap", "props 1024 · big surfaces 2048", "Compressed textures (KTX2) arrive later to save memory.");
        later("Flip and invert", "Flip vertically, invert green: later.");
        later("Texture library and import", "Use the Assets app for models; image import arrives later.");
      }
      // E Physics
      if (section("E", "E · Physics", e.prop ? [["Reset", function () { apply([{ op: "static", id: e.id, value: false }, { op: "phys", id: e.id, key: "friction", value: 0.6 }, { op: "phys", id: e.id, key: "restitution", value: 0.15 }, { op: "phys", id: e.id, key: "gravity", value: 1 }, setOp(e, "body.linearDamping", 0.05), setOp(e, "body.angularDamping", 0.35), setOp(e, "body.lockMove", [false, false, false]), setOp(e, "body.lockRotate", [false, false, false])], "Reset physics"); }], ["Copy", function () { I.clip.E = { mass: e.prop.body.mass(), friction: physVal(e, "friction"), restitution: physVal(e, "restitution"), gravity: e.prop.body.gravityScale() }; }], ["Paste", function () { var p = I.clip.E; if (p) apply(["mass", "friction", "restitution", "gravity"].map(function (k) { return { op: "phys", id: e.id, key: k, value: p[k] }; }), "Paste physics"); }]] : null)) {
        if (!e.prop) info("Body", "none", "Shapes and props you add have a physics body; most room parts do not.");
        else {
          var body = e.prop.body, kin = body.bodyType() === 2, stat = !kin && body.bodyType() === 1;
          chips("Body type", ["static", "dynamic", "moving"], kin ? "moving" : stat ? "static" : "dynamic", "Static never moves. Dynamic falls and can be thrown. Moving follows its animation and pushes others.", null, function (v) {
            var ops = [];
            if (v === "moving") ops.push(setOp(e, "body.kinematic", true));
            else { if (kin) ops.push(setOp(e, "body.kinematic", false)); ops.push({ op: "static", id: e.id, value: v === "static" }); }
            apply(ops, "Body type");
          }, ["Static", "Dynamic", "Moving"]);
          info("Collider", e.prop.desc.shapes.map(function (s) { return s.kind; }).join(" + "), "The invisible shape used for collisions.");
          toggle("Show colliders", !!window.__studioView.get().colliders, "Draw every collider (Editor mode only).", null, function (v) { window.__studioView.set("colliders", v); });
          num("Mass (kg)", body.mass(), 0.05, "How heavy it is.", null, function (v) { apply([{ op: "phys", id: e.id, key: "mass", value: clamp(v, 0.01, 5000) }], "Mass"); });
          chips("Weight", ["light", "medium", "heavy"], null, "0.5, 2 or 10 kg.", null, function (v) { run("make it " + v); });
          slider("Friction", physVal(e, "friction"), 0, 1, "0 = ice, 1 = rubber.", null, null, function (v) { apply([{ op: "phys", id: e.id, key: "friction", value: v }], "Friction"); });
          slider("Bounce", physVal(e, "restitution"), 0, 1, "0 = dead, 1 = springs right back.", null, null, function (v) { apply([{ op: "phys", id: e.id, key: "restitution", value: v }], "Bounce"); });
          slider("Gravity scale", body.gravityScale(), -1, 2, "1 = normal, 0 = floats, below 0 = rises.", null, null, function (v) { apply([{ op: "phys", id: e.id, key: "gravity", value: v }], "Gravity"); });
          if (feat("advancedPhysics")) {
            slider("Drag", body.linearDamping(), 0, 5, "Slows movement through the air.", null, null, function (v) { apply([setOp(e, "body.linearDamping", v)], "Drag"); });
            slider("Spin damping", body.angularDamping(), 0, 5, "Slows spinning.", null, null, function (v) { apply([setOp(e, "body.angularDamping", v)], "Spin damping"); });
            var sv = comp(e, "StartVelocity");
            toggle("Start velocity", !!sv, "Launch it when Play starts.", null, function (v) { apply([{ op: "comp", id: e.id, ctype: "StartVelocity", data: v ? compDefaults("StartVelocity") : null }], "Start velocity"); });
            if (sv) compFields(e, sv, ["vx", "vy", "vz", "spin"]);
            var lm = SET["body.lockMove"].get(e.prop), lr = SET["body.lockRotate"].get(e.prop);
            chips("Lock movement", [0, 1, 2], null, "Stops sliding along an axis (tap to toggle).", null, function (k) { var v = lm.slice(); v[k] = !v[k]; apply([setOp(e, "body.lockMove", v)], "Move lock"); }, ["X" + (lm[0] ? " ✓" : ""), "Y" + (lm[1] ? " ✓" : ""), "Z" + (lm[2] ? " ✓" : "")]);
            chips("Lock turning", [0, 1, 2], null, "Stops turning around an axis (tap to toggle).", null, function (k) { var v = lr.slice(); v[k] = !v[k]; apply([setOp(e, "body.lockRotate", v)], "Turn lock"); }, ["X" + (lr[0] ? " ✓" : ""), "Y" + (lr[1] ? " ✓" : ""), "Z" + (lr[2] ? " ✓" : "")]);
            toggle("Fast-object mode", body.isCcdEnabled(), "Stops fast things passing through thin walls.", "Med", function (v) { apply([setOp(e, "body.ccd", v)], "Fast-object mode"); });
            info("Sleep when idle", "on", "Bodies at rest cost nothing until something touches them.");
            chips("Collides with", ["everything", "nothing"], SET["body.layer"].get(e.prop), "Nothing = a ghost that passes through everything (use with static or moving).", "Med", function (v) { apply([setOp(e, "body.layer", v)], "Collisions"); }, ["Everything", "Nothing"]);
            var cf = comp(e, "ConstantForce");
            toggle("Constant force", !!cf, "Pushes it in one direction while the game plays (fans, updrafts).", null, function (v) { apply([{ op: "comp", id: e.id, ctype: "ConstantForce", data: v ? compDefaults("ConstantForce") : null }], "Constant force"); });
            if (cf) compFields(e, cf, ["x", "y", "z"]);
          }
          toggle("Trigger zone", !!comp(e, "Trigger"), "Fires enter and exit when you walk into a box around it (during Play).", null, function (v) { apply([{ op: "comp", id: e.id, ctype: "Trigger", data: v ? compDefaults("Trigger") : null }], "Trigger"); });
          later("One-way platform", "Pass from below, stand on top: later.");
          later("Break strength", "Shatter on impact (High cost): later.");
          later("Joints", "Hinge, slider, spring (pendulums, doors): later.");
          later("Surface speed", "Conveyor belts: later.");
          chips("Physics preset", ["heavy metal", "bouncy rubber", "zero-g", "static lock", "ice", "wood", "stone", "foam", "glass", "balloon"], null, "Several traits in one tap (Appendix B values).", null, function (v) { run("preset " + v); });
        }
      }
      // F Interaction
      if (section("F", "F · Interaction")) {
        later("Grabbable", "Every dynamic prop can be picked up; a switch arrives later.");
        later("Distance grab", "Pull from afar with the pointer: later.");
        later("Snap points", "later");
        toggle("Hover labels", UI.get("pointerLabels"), "A short label when you aim at something (all objects).", null, function (v) { UI.set("pointerLabels", v); });
        later("Haptics", "Buzz strength: later.");
        var ia = comp(e, "Interactable");
        toggle("Use action", !!ia, "E on desktop, or the trigger in VR, fires 'used' (wire it in Logic).", null, function (v) { apply([{ op: "comp", id: e.id, ctype: "Interactable", data: v ? compDefaults("Interactable") : null }], "Use action"); });
        if (ia) textRow("Pointer text", String(ia.data.prompt || ""), "The word shown when you aim at it.", function (v) { apply([{ op: "comp", id: e.id, ctype: "Interactable", data: Object.assign({}, ia.data, { prompt: v.slice(0, 40) }) }], "Pointer text"); }, "prompt-" + e.id);
      }
      // G Events and logic
      if (section("G", "G · Events and logic")) {
        var attached = e.components.filter(function (x) { return x.type !== "Graph" && x.type !== "Script"; });
        if (!attached.length) info("Behaviours", "none", "Behaviours run while the game plays and stop on Stop.");
        attached.forEach(function (cpn) {
          var d = COMP.types.get(cpn.type);
          if (vis(40)) { text((d ? d.label : cpn.type), L, y + 16, "600 15px " + FONT, X.text); self.button(c, "Remove", R - 90, y + 4, 90, 28, function () { apply([{ op: "comp", id: e.id, ctype: cpn.type, data: null }], "Remove " + cpn.type); }); }
          tipZone(40, d && d.description); y += 40;
          compFields(e, cpn, Object.keys(d ? d.fields : {}));
        });
        var types = []; COMP.types.forEach(function (d, k) { if (k !== "Graph" && k !== "Script" && !comp(e, k)) types.push(k); });
        chips("Add behaviour", types, null, "Spin, bob, patrol, door, trigger, pickup, spawner, sound, pulse, path…", null, function (v) { apply([{ op: "comp", id: e.id, ctype: v, data: compDefaults(v) }], "Add " + v); }, types.map(function (k) { return COMP.types.get(k).label; }));
        var g = comp(e, "Graph"), sc = comp(e, "Script");
        row("Logic graph", "Connect triggers to actions as nodes in the Logic app.", null, 40, function (yy) { self.button(c, g ? "Edit in Logic" : "New graph", R - 150, yy + 4, 150, 30, function () { if (g && studio.openLogic) studio.openLogic(String(g.data.graph)); else if (studio.newGraphFor) studio.newGraphFor(e); }); });
        row("Script", "Run an object script on it (time-limited).", "Med", 40, function (yy) { self.button(c, sc ? "Edit script" : "New script", R - 150, yy + 4, 150, 30, function () { if (sc && studio.openCode) studio.openCode(String(sc.data.script)); else if (studio.newScriptFor) studio.newScriptFor(e); }); });
        later("Variables", "Per-object values: later.");
      }
      // H Animation
      if (section("H", "H · Animation")) {
        [["Spinner", "Spin", "Turns it continuously."], ["Bobber", "Bob", "Floats up and down."], ["Pulse", "Pulse", "Grows and shrinks gently."], ["PathMover", "Move along a path", "Points as x,y,z; x,y,z. Starts from where it stands."], ["Door", "Open and close", "A hinged door or lid."], ["Patrol", "Patrol", "Walks back and forth."]].forEach(function (a) {
          if (!COMP.types.get(a[0])) return;
          var cpn = comp(e, a[0]);
          toggle(a[1], !!cpn, a[2] + " Runs while the game plays.", null, function (v) { apply([{ op: "comp", id: e.id, ctype: a[0], data: v ? compDefaults(a[0]) : null }], a[1]); });
          if (cpn) compFields(e, cpn, Object.keys(COMP.types.get(a[0]).fields));
          if (cpn && a[0] === "PathMover") row("Add a point", "Adds the spot 1 m in front of you to the path.", null, 40, function (yy) { self.button(c, "Here", R - 100, yy + 4, 100, 30, function () { var p = studio.nearPlayer ? studio.nearPlayer() : studio.inFront ? studio.inFront() : new THREE.Vector3(); var pts = String(cpn.data.points || ""); pts = (pts ? pts + "; " : "") + [p.x, Math.max(0.1, e.object.position.y), p.z].map(function (n) { return n.toFixed(2); }).join(","); apply([{ op: "comp", id: e.id, ctype: "PathMover", data: Object.assign({}, cpn.data, { points: pts.slice(-120) }) }], "Path point"); }); });
        });
        later("Start rule", "On play, on trigger, always: later.");
        later("Record by hand", "Act it out with your hands: later.");
      }
      // I Lights
      if (lt && section("I", "I · Lights")) {
        if (lights.length > 1 && vis(40)) { text("Light " + (li + 1) + "/" + lights.length, L, y + 16, "500 15px " + FONT, X.text); self.button(c, "▶", R - 46, y + 2, 44, 30, function () { I.li = (li + 1) % lights.length; }); }
        if (lights.length > 1) y += 40;
        info("Type", lt.isSpotLight ? "spot" : lt.isDirectionalLight ? "directional (sun)" : lt.isRectAreaLight ? "area" : "point", "Point lights shine all round; spots in a cone.");
        color("Colour", "#" + lt.color.getHexString(), "The light's colour.", function (hex) { apply([{ op: "light", id: e.id, li: li, key: "color", value: hex }], "Light colour"); });
        num("Intensity", lt.intensity, 0.05, "Brightness.", null, function (v) { apply([{ op: "light", id: e.id, li: li, key: "intensity", value: clamp(v, 0, 1e5) }], "Intensity"); });
        if ("distance" in lt && !lt.isDirectionalLight) slider("Range (m)", lt.distance, 0, 30, "How far it reaches (0 = no limit).", null, function (v) { lt.distance = v; }, function (v) { apply([setOp(e, "light.distance", v, { li: li })], "Range"); });
        if (lt.isSpotLight) { slider("Cone angle", lt.angle * 180 / Math.PI, 1, 89, "Width of the beam.", "Med", null, function (v) { apply([setOp(e, "light.angle", v, { li: li })], "Cone"); }); slider("Edge softness", lt.penumbra, 0, 1, "Soft or hard beam edge.", null, null, function (v) { apply([setOp(e, "light.penumbra", v, { li: li })], "Softness"); }); }
        toggle("Shadows", lt.castShadow, "Real-time shadows from this light.", "High", function (v) { apply([setOp(e, "light.castShadow", v, { li: li })], "Light shadows"); });
        if (lt.castShadow) chips("Shadow quality", [512, 1024, 2048], lt.shadow.mapSize.x, "Sharper costs more memory and time.", "Med", function (v) { apply([setOp(e, "light.shadowSize", v, { li: li })], "Shadow quality"); });
        toggle("Flicker", !!comp(e, "LightPulse"), "Gentle variation while the game plays.", null, function (v) { apply([{ op: "comp", id: e.id, ctype: "LightPulse", data: v ? { rate: 7, depth: 0.55 } : null }], "Flicker"); });
        info("Static or dynamic", e.locked ? "built into the baked lighting" : "dynamic", "The room's own lights are baked and cannot change.");
      }
      // J Rendering and visibility
      if (section("J", "J · Rendering and visibility")) {
        toggle("Visible", !SC.isHidden(e), "Hide or show without deleting.", null, function (v) { run((v ? "show " : "hide ") + "it"); });
        var fm = firstMesh(e.object);
        if (fm) {
          toggle("Cast shadows", fm.castShadow, "Off for small props saves frame time.", "Med", function (v) { apply([setOp(e, "obj.castShadow", v)], "Cast shadows"); });
          toggle("Receive shadows", fm.receiveShadow, "Shadows from other things land on it.", null, function (v) { apply([setOp(e, "obj.receiveShadow", v)], "Receive shadows"); });
          num("Render order", fm.renderOrder, 0.05, "Draw this over that (for see-through overlaps).", null, function (v) { apply([setOp(e, "obj.renderOrder", Math.round(clamp(v, -10, 10)))], "Render order"); });
        }
        if (m) toggle("Affected by fog", m.fog !== false, "Whether fog covers this object.", null, function (v) { apply(mats.map(function (x, i) { return setOp(e, "mat.fog", v, { mi: i }); }), "Fog"); });
        later("Draw distance", "Hide when far away: later.");
        info("Outline", "shown on the selection in Editor mode", "Selection outlines never appear in Play, Rally or Interstate.");
      }
      // K Audio
      if (section("K", "K · Audio")) { later("Sound on hit", "The game has no audio engine yet."); later("Looping sound", "later"); later("3D positional", "later"); later("Volume and mute", "later"); }
      // L Identity
      if (section("L", "L · Identity", [["Copy", function () { I.clip.obj = { t: trs(e.object), mat: I.clip.C, phys: e.prop ? { mass: e.prop.body.mass(), friction: physVal(e, "friction"), restitution: physVal(e, "restitution"), gravity: e.prop.body.gravityScale() } : null }; }], ["Paste", function () { var p = I.clip.obj; if (!p) return; var ops = []; if (p.phys && e.prop) ["mass", "friction", "restitution", "gravity"].forEach(function (k) { ops.push({ op: "phys", id: e.id, key: k, value: p.phys[k] }); }); if (ops.length) apply(ops, "Paste object settings"); }]])) {
        textRow("Name", e.name, "Shown in the Outliner and in commands.", function (v) { v = v.trim(); if (v) apply([{ op: "rename", id: e.id, name: v.slice(0, 60) }], "Rename"); }, "name2");
        textRow("Tags", String((e.meta && e.meta.tags) || ""), "Words to find it by.", function (v) { apply([setOp(e, "meta.tags", v.slice(0, 120))], "Tags"); }, "tags-" + e.id);
        textRow("Notes", String((e.meta && e.meta.notes) || ""), "A note for yourself.", function (v) { apply([setOp(e, "meta.notes", v.slice(0, 500))], "Notes"); }, "notes-" + e.id);
        chips("Layer", SET["meta.layer"].options, e.layer, "Groups in the Outliner's filter.", null, function (v) { apply([setOp(e, "meta.layer", v)], "Layer"); });
        toggle("Lock", !!(e.locked || e.userLocked), e.locked ? "Part of the room: always locked." : "Stops accidental moves.", null, function (v) { run((v ? "lock" : "unlock") + " it"); }, !e.locked);
        toggle("Favourite", !!(e.meta && e.meta.favorite), "Pin it.", null, function (v) { apply([setOp(e, "meta.favorite", v)], "Favourite"); });
        later("Prefab", "Save as a reusable prop: later.");
      }
      if (feat("sceneSettings")) sceneSection();
      editorSection();
      finish(); return;

      // ---------- helpers that read the current state ----------
      function compFields(ent, cpn, keys) {
        var d = COMP.types.get(cpn.type); if (!d) return;
        keys.forEach(function (k) {
          var f = d.fields[k]; if (!f) return;
          var lab = "   " + k + (f.label ? " (" + f.label + ")" : "");
          if (f.kind === "number") num(lab, Number(cpn.data[k]), Math.max(0.01, (f.max - f.min) / 1000), d.description, null, function (v) { var nd = Object.assign({}, cpn.data); nd[k] = clamp(v, f.min, f.max); apply([{ op: "comp", id: ent.id, ctype: cpn.type, data: nd }], d.label); }, "c-" + ent.id + cpn.type + k);
          else if (f.kind === "bool") toggle(lab, !!cpn.data[k], d.description, null, function (v) { var nd = Object.assign({}, cpn.data); nd[k] = v; apply([{ op: "comp", id: ent.id, ctype: cpn.type, data: nd }], d.label); });
          else textRow(lab, String(cpn.data[k] == null ? "" : cpn.data[k]), d.description, function (v) { var nd = Object.assign({}, cpn.data); nd[k] = v.slice(0, 120); apply([{ op: "comp", id: ent.id, ctype: cpn.type, data: nd }], d.label); }, "c-" + ent.id + cpn.type + k);
        });
      }
      function sceneSection() {
        if (!section("M", "M · Scene and world")) return;
        var env = function (key, v, label) { apply([{ op: "env", id: "environment", key: key, value: v }], label); };
        slider("Exposure", S.renderer.toneMappingExposure, 0.2, 3, "Overall brightness of the picture.", null, null, function (v) { env("exposure", v, "Exposure"); });
        slider("Reflections", S.scene.environmentIntensity != null ? S.scene.environmentIntensity : 1, 0, 3, "Bounce light and reflections from the room.", null, null, function (v) { env("envIntensity", v, "Reflections"); });
        var sun = world.list.find(function (x) { return x.name === "Sun"; });
        if (sun) {
          var sl = world.lights(sun)[0];
          color("Sun colour", "#" + sl.color.getHexString(), "Warm for morning and evening, white for midday.", function (hex) { apply([{ op: "light", id: sun.id, li: 0, key: "color", value: hex }], "Sun colour"); });
          num("Sun strength", sl.intensity, 0.05, "Sunlight brightness.", null, function (v) { apply([{ op: "light", id: sun.id, li: 0, key: "intensity", value: clamp(v, 0, 1e5) }], "Sun strength"); });
          toggle("Sun shadows", sl.castShadow, "Real-time sun shadows (off saves frame time).", "High", function (v) { apply([setOp(sun, "light.castShadow", v, { li: 0 })], "Sun shadows"); });
          slider("Shadow softness", sl.shadow ? sl.shadow.radius : 0, 0, 8, "Soft or crisp shadow edges.", null, null, function (v) { env("shadowSoftness", v, "Shadow softness"); });
        }
        chips("Fog", ["off", "light", "dense"], SET["scene.fog"].get(S), "Haze over distance.", null, function (v) { apply([setOp(null, "scene.fog", v)], "Fog"); }, ["Off", "Light", "Dense"]);
        later("Ambient light", "The room's fill light is baked.");
        later("Bloom, ambient occlusion, motion blur, depth of field", "High cost: off on Quest; not part of any preset.");
        num("World gravity (m/s²)", SET["scene.gravity"].get(S), 0.05, "-9.81 is Earth. 0 floats everything.", null, function (v) { apply([setOp(null, "scene.gravity", clamp(v, -30, 0))], "World gravity"); });
        var ky = SET["scene.killPlane"].get(S);
        toggle("Kill plane", ky !== null, "Things that fall below it come back to where they started.", null, function (v) { apply([setOp(null, "scene.killPlane", v ? -5 : null)], "Kill plane"); });
        if (ky !== null) num("   below (m)", ky, 0.05, "Height of the kill plane.", null, function (v) { apply([setOp(null, "scene.killPlane", clamp(v, -100, 0))], "Kill plane"); });
        later("Time scale", "Slow motion: later.");
        later("Physics quality", "later");
        toggle("Show grid", !!window.__studioView.get().grid, "A floor grid (Editor mode only).", null, function (v) { window.__studioView.set("grid", v); });
        chips("Grid size", [0.25, 0.5, 1], window.__studioView.get().cell, "Metres per cell.", null, function (v) { window.__studioView.set("cell", v); }, ["25 cm", "50 cm", "1 m"]);
        info("Quality tier", /OculusBrowser|Quest/i.test(navigator.userAgent) ? "Quest" : "Desktop", "Quest uses the lighter sky and shadow settings.");
      }
      function editorSection() {
        if (simple || !section("N", "N · Editor tools")) return;
        var v = window.__studioView.get();
        toggle("Show names", !!v.names, "Name tags above objects (Editor mode only).", null, function (x) { window.__studioView.set("names", x); });
        toggle("Show colliders", !!v.colliders, "Collision shapes (Editor mode only).", null, function (x) { window.__studioView.set("colliders", x); });
        toggle("Show grid", !!v.grid, "Floor grid (Editor mode only).", null, function (x) { window.__studioView.set("grid", x); });
        info("Selection", ed.selection.length + " selected", "Click in the Outliner or the viewport; the World tool selects in the room.");
        later("Move handles (gizmos)", "Use the World tool to move things by hand; handles later.");
        // history panel
        var H = ed.history, done = H.done.slice(-8);
        if (matches("History", "Past actions")) {
          if (vis(28)) text("History", L, y + 14, "500 15px " + FONT, X.text);
          y += 28;
          if (!done.length && vis(26)) { text("Nothing yet.", L + 12, y + 12, "400 14px " + FONT, X.dim); y += 26; }
          done.slice().reverse().forEach(function (op, i) {
            if (vis(30)) {
              text((i === 0 ? "● " : "○ ") + String(op.label).slice(0, 44), L + 8, y + 15, "400 14px " + FONT, i === 0 ? X.text : X.dim);
              if (i > 0) self.button(c, "Undo to here", R - 120, y + 1, 120, 26, function () { for (var k = 0; k < i; k++) ed.undo(); });
            }
            tipZone(30, "Undo every step after this one."); y += 30;
          });
        }
        row("Assets", "Models and images you imported.", null, 40, function (yy) { self.button(c, "Open Assets", R - 140, yy + 4, 140, 30, function () { os.openApp("assets"); }); });
        later("Measure tool", "later"); later("Camera bookmarks", "later"); later("Input mapping", "later");
      }
      function finish() {
        var content = y + self.inspScroll - (y0 + bar + 10);
        self.inspMax = Math.max(0, content - (H - bar - 54));
        if (self.inspScroll > self.inspMax) self.inspScroll = self.inspMax;
        c.restore();
        // tip line at the bottom
        c.fillStyle = X.panel2; c.fillRect(x0 + 1, y0 + H - 44, W - 1, 44);
        c.textBaseline = "middle";
        var t = I.confirm ? "High cost on Quest: tap again to turn it on." : hoverTip ? hoverTip.text : simple ? "Simple mode: the 10 most used options. Advanced shows all." : "Point at an option for a tip.";
        c.font = "400 14px " + FONT; c.fillStyle = I.confirm ? X.err : hoverTip && hoverTip.cost === "High" ? X.err : X.dim;
        while (t.length > 4 && c.measureText(t).width > W - 32) t = t.slice(0, -2);
        c.fillText(t, x0 + 16, y0 + H - 22);
        c.textBaseline = "alphabetic";
      }
    };
    function physVal(e, key) { var p = e.prop; if (!p || !p.body.numColliders()) return 0; var c = p.body.collider(0); return key === "friction" ? c.friction() : c.restitution(); }
    // a 2D sphere that follows colour, roughness, metalness, glow and the colour map
    function drawPreview(c, x, y, s, m) {
      var r = s / 2, cx = x + r, cy = y + r, col = m.color ? m.color.clone() : new THREE.Color(1, 1, 1), rough = typeof m.roughness === "number" ? m.roughness : 0.5, metal = m.metalness || 0;
      c.save(); c.beginPath(); c.arc(cx, cy, r, 0, 7); c.clip();
      c.fillStyle = "#14171c"; c.fillRect(x, y, s, s);
      var img = m.map && m.map.image; if (img && img.width) { c.drawImage(img, 0, 0, img.width, img.height, x - r * 0.3, y, s * 1.3, s); c.globalCompositeOperation = "multiply"; }
      var base = "#" + col.getHexString();
      var g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.05);
      g.addColorStop(0, "#" + col.clone().lerp(new THREE.Color(1, 1, 1), 0.25 * (1 - metal)).getHexString()); g.addColorStop(0.7, base); g.addColorStop(1, "#" + col.clone().multiplyScalar(0.25).getHexString());
      c.fillStyle = g; c.fillRect(x, y, s, s); c.globalCompositeOperation = "source-over";
      if (m.emissive && m.emissiveIntensity > 0) { c.globalAlpha = Math.min(1, m.emissiveIntensity / 3); c.fillStyle = "#" + m.emissive.getHexString(); c.fillRect(x, y, s, s); c.globalAlpha = 1; }
      var hs = r * (0.12 + rough * 0.7), hl = c.createRadialGradient(cx - r * 0.35, cy - r * 0.4, 0, cx - r * 0.35, cy - r * 0.4, hs);
      var spec = metal > 0.5 ? "#" + col.clone().lerp(new THREE.Color(1, 1, 1), 0.5).getHexString() : "#ffffff";
      hl.addColorStop(0, spec); hl.addColorStop(1, "rgba(255,255,255,0)"); c.globalAlpha = 0.25 + (1 - rough) * 0.7; c.fillStyle = hl; c.fillRect(x, y, s, s); c.globalAlpha = 1;
      if (m.transparent && m.opacity < 1) { c.globalAlpha = 1 - m.opacity; c.fillStyle = "#14171c"; c.fillRect(x, y, s, s); c.globalAlpha = 1; }
      c.restore();
    }
    // wheel scroll respects the new content height
    var wheel = studio.wheel.bind(studio);
    studio.wheel = function (d) { wheel(d); if (this.inspMax !== undefined) this.inspScroll = clamp(this.inspScroll, 0, this.inspMax); };

    // ---------- commands that the Inspector work makes possible ----------
    var C = window.__studioCommands;
    (function hook() {
      if (!C || !C.ready || !C.handle) { C = window.__studioCommands; setTimeout(hook, 300); return; }
      function sel(a, fn) { return C.withTarget(a, fn); }
      C.handle("show_grid", function () { return { act: function () { window.__studioView.set("grid", true); } }; });
      C.handle("show_names", function () { return { act: function () { window.__studioView.set("names", true); } }; });
      C.handle("show_colliders", function () { return { act: function () { window.__studioView.set("colliders", true); } }; });
      C.handle("hide_helpers", function () { return { act: function () { ["grid", "names", "colliders"].forEach(function (k) { window.__studioView.set(k, false); }); } }; });
      C.handle("outline", function (a) { return sel(a, function (e) { return { act: function () { ed.select(e); }, vars: { target: e.name } }; }); });
      C.handle("reset_look", function (a) { return sel(a, function (e) { return { ops: world.materials(e).map(function (m, i) { return setOp(e, "mat.reset", true, { mi: i }); }), vars: { target: e.name } }; }); });
      C.handle("drag", function (a) { return sel(a, function (e) { return e.prop ? { ops: [setOp(e, "body.linearDamping", clamp(a.n, 0, 10))], vars: { target: e.name, n: a.n } } : { error: e.name + " has no physics body." }; }); });
      C.handle("lock_axis", function (a) { return sel(a, function (e) { if (!e.prop) return { error: e.name + " has no physics body." }; var k = "xyz".indexOf(a.axis[0]), v = SET["body.lockMove"].get(e.prop); v[k] = true; return { ops: [setOp(e, "body.lockMove", v)], vars: { target: e.name, axis: a.axis[0].toUpperCase() } }; }); });
      C.handle("ignore_collisions", function (a) { return sel(a, function (e) { return e.prop ? { ops: [setOp(e, "body.layer", "nothing")], vars: { target: e.name } } : { error: e.name + " has no physics body." }; }); });
      C.handle("shadows", function (a) { var sun = world.list.find(function (x) { return x.name === "Sun"; }); return sun ? { ops: [setOp(sun, "light.castShadow", a.onoff === "on", { li: 0 })], vars: { onoff: a.onoff } } : { error: "There is no sun." }; });
      C.handle("fog", function (a) { var lv = { none: "off", heavy: "dense", thick: "dense", thin: "light" }[a.fog] || a.fog; return { ops: [setOp(null, "scene.fog", lv)], vars: { fog: lv } }; });
      C.handle("look_at", function (a) {
        var f = C.find(a.object); if (f.error) return f;
        return { act: function () { var h = S.camera.getWorldPosition(new THREE.Vector3()), t = new THREE.Box3().setFromObject(f.e.object).getCenter(new THREE.Vector3());
          if (S.renderer.xr.isPresenting && S.xr && S.xr.rig) { var fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.camera.getWorldQuaternion(new THREE.Quaternion())); var turn = Math.atan2(-(t.x - h.x), -(t.z - h.z)) - Math.atan2(-fwd.x, -fwd.z); var rig = S.xr.rig; var off = rig.position.clone().sub(h).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn); rig.rotation.y += turn; rig.position.copy(h).add(off); }
          else if (S.desktop) { S.desktop.yaw = Math.atan2(-(t.x - h.x), -(t.z - h.z)); S.desktop.pitch = clamp(Math.atan2(t.y - h.y, Math.hypot(t.x - h.x, t.z - h.z)), -1.2, 1.2); } }, vars: { object: f.e.name } };
      });
      C.handle("teleport", function (a) {
        var f = C.find(a.object); if (f.error) return f;
        return { act: function () {
          var b = new THREE.Box3().setFromObject(f.e.object), c = b.getCenter(new THREE.Vector3()), h = S.camera.getWorldPosition(new THREE.Vector3());
          var dir = new THREE.Vector3(h.x - c.x, 0, h.z - c.z); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
          var dest = c.clone().addScaledVector(dir, Math.max(0.8, b.getSize(new THREE.Vector3()).length() / 2 + 0.5));
          var fade = document.createElement("div"); fade.style.cssText = "position:fixed;inset:0;background:#000;opacity:0;transition:opacity .12s;z-index:30;pointer-events:none"; document.body.appendChild(fade);
          requestAnimationFrame(function () { fade.style.opacity = "1"; });
          setTimeout(function () {
            if (S.renderer.xr.isPresenting && S.xr && S.xr.rig) { var rig = S.xr.rig; rig.position.x += dest.x - h.x; rig.position.z += dest.z - h.z; }
            else { var cam = S.camera; cam.position.x = dest.x; cam.position.z = dest.z; if (S.desktop) S.desktop.yaw = Math.atan2(-(c.x - dest.x), -(c.z - dest.z)); }
            fade.style.opacity = "0"; setTimeout(function () { fade.remove(); }, 200);
          }, 140);
        }, vars: { object: f.e.name } };
      });
    })();
    if (S.log) S.log.info("Inspector ready: groups A to N, " + Object.keys(SET).length + " settings");
  });
})();
