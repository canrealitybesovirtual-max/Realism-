// Training enemies: the CQC Loop's two characters (cqc/models/enemy-fsb.glb, enemy-soldier.glb) standing
// in the studio as shootable targets. Not the CQC AI: they stand in a relaxed pose, flinch when hit and
// fall over when "killed" (a scripted fall, not a physics ragdoll), then get back up after a few seconds
// (Props app switch "Get back up"). Bullets from the desk pistol hit invisible capsules on head / torso /
// legs (the skinned meshes themselves are never ray-tested, so a shot costs the same as before).
// Spawn: Props app > Enemies, the Commands palette, or the wrist tablet's "+ Enemy". Remove: Props app
// "Remove all enemies", Delete on the keyboard while the dot is on one, or point the right controller at
// one and press B. They are not saved: a reload (or Reset studio) starts without them. At most 6.
// API: window.__studioEnemies = { spawn(look, pos?, yaw?) -> Promise<enemy>, remove(e), clear(), list, count(),
//   hit(e, part, dir), getUp, setGetUp(bool) }.
(function () {
  "use strict";
  var MAX = 6, HEIGHT = 1.8, GET_UP_AFTER = 6;
  var LOOKS = {
    fsb: { label: "FSB operator", url: "cqc/models/enemy-fsb.glb" },
    soldier: { label: "Soldier", url: "cqc/models/enemy-soldier.glb" }
  };
  var LOADER_URL = "assets/GLTFLoader-d80uIKQK.js";
  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        if (s && s.ready && s.scene && s.THREE && s.camera) resolve(s);
        else setTimeout(check, 300);
      })();
    });
  }
  var api = window.__studioEnemies = { list: [], ready: false, getUp: true };
  waitForStudio().then(function (S) {
    var THREE = S.THREE, scene = S.scene, camera = S.camera, renderer = S.renderer, desk = S.desktop, XR = S.xr;
    var UP = new THREE.Vector3(0, 1, 0);
    try { api.getUp = localStorage.getItem("studio.enemies.getUp") !== "0"; } catch (e) {}

    // ---------- loading (once per look) ----------
    var loaderP = null, cache = {};
    function loader() {
      if (!loaderP) loaderP = import(new URL(LOADER_URL, document.baseURI).href).then(function (m) { return new m.t(); });
      return loaderP;
    }
    function load(look) {
      if (!cache[look]) cache[look] = loader().then(function (L) {
        return new Promise(function (res, rej) { L.load(new URL(LOOKS[look].url, document.baseURI).href, function (g) { res(prepare(g.scene)); }, undefined, rej); });
      });
      return cache[look];
    }
    // one standing, scaled template per look; spawns are skinned clones sharing geometry and materials
    function prepare(root) {
      root.updateMatrixWorld(true);
      root.traverse(function (o) {
        if (o.isMesh) {
          o.castShadow = false; o.receiveShadow = true; // the room's shadows are baked once; a moving man would need a redraw each frame
          o.raycast = function () {};                   // bullets and pointers test the capsules instead
          o.userData.noBullet = true;
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.transparent && m.opacity > 0.98) m.transparent = false; });
        }
      });
      relax(root);
      mergeSkinned(root);
      root.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(root, true), h = box.max.y - box.min.y || 1;
      var k = HEIGHT / h;
      var wrap = new THREE.Group(); wrap.add(root);
      root.scale.multiplyScalar(k);
      root.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
      wrap.updateMatrixWorld(true);
      return wrap;
    }
    // fewer draw calls: the skinned parts that share a material (and the one skeleton) become one mesh.
    // Each part is moved into the first part's bind space, so bindMatrix * p stays where it was.
    function mergeSkinned(root) {
      var groups = new Map();
      root.traverse(function (o) {
        if (!o.isSkinnedMesh || Array.isArray(o.material) || o.morphTargetInfluences || o.children.length) return;
        var g = o.geometry, key = o.material.uuid + "|" + Object.keys(g.attributes).sort().join(",") + "|" + !!g.index + "|" + o.skeleton.bones.length + "|" + (o.skeleton.bones[0] && o.skeleton.bones[0].uuid);
        if (!groups.has(key)) groups.set(key, []); groups.get(key).push(o);
      });
      groups.forEach(function (list) {
        if (list.length < 2) return;
        var base = list[0], invB = base.bindMatrix.clone().invert();
        var geos = list.map(function (m) { var g = m.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(invB, m.bindMatrix)); return g; });
        var names = Object.keys(geos[0].attributes), out = new THREE.BufferGeometry(), total = 0;
        geos.forEach(function (g) { total += g.attributes.position.count; });
        for (var ok = true, ni = 0; ni < names.length; ni++) {
          var a0 = geos[0].attributes[names[ni]];
          if (geos.some(function (g) { var a = g.attributes[names[ni]]; return !a || a.itemSize !== a0.itemSize || a.isInterleavedBufferAttribute || a.array.constructor !== a0.array.constructor; })) { ok = false; break; }
          var arr = new a0.array.constructor(total * a0.itemSize), off = 0;
          geos.forEach(function (g) { var a = g.attributes[names[ni]]; arr.set(a.array.subarray(0, a.count * a.itemSize), off); off += a.count * a.itemSize; });
          out.setAttribute(names[ni], new THREE.BufferAttribute(arr, a0.itemSize, a0.normalized));
        }
        if (!ok) return;
        if (geos[0].index) {
          var ic = 0; geos.forEach(function (g) { ic += g.index.count; });
          var idx = total > 65535 ? new Uint32Array(ic) : new Uint16Array(ic), io = 0, vo = 0;
          geos.forEach(function (g) { var s = g.index.array; for (var i = 0; i < g.index.count; i++) idx[io++] = s[i] + vo; vo += g.attributes.position.count; });
          out.setIndex(new THREE.BufferAttribute(idx, 1));
        }
        geos.forEach(function (g) { g.dispose(); });
        base.geometry = out;
        for (var i = 1; i < list.length; i++) if (list[i].parent) list[i].parent.remove(list[i]);
      });
    }
    // find a joint by name (GLTFLoader drops ':' from "mixamorig:LeftArm")
    function bone(root, re) { var f = null; root.traverse(function (o) { if (!f && o.isBone && re.test(o.name)) f = o; }); return f; }
    var BONES = {
      head: /(mixamorig)?Head(_\d+)?$|CC_Base_Head(_\d+)?$/,
      neck: /(mixamorig)?Neck(_\d+)?$|CC_Base_NeckTwist01(_\d+)?$/,
      hips: /(mixamorig)?Hips(_\d+)?$|CC_Base_Hip(_\d+)?$/,
      spine: /(mixamorig)?Spine1(_\d+)?$|CC_Base_Spine01(_\d+)?$/,
      lArm: /LeftArm(_\d+)?$|CC_Base_L_Upperarm(_\d+)?$/, lFore: /LeftForeArm(_\d+)?$|CC_Base_L_Forearm(_\d+)?$/, lHand: /LeftHand(_\d+)?$|CC_Base_L_Hand(_\d+)?$/,
      rArm: /RightArm(_\d+)?$|CC_Base_R_Upperarm(_\d+)?$/, rFore: /RightForeArm(_\d+)?$|CC_Base_R_Forearm(_\d+)?$/, rHand: /RightHand(_\d+)?$|CC_Base_R_Hand(_\d+)?$/,
      lFoot: /LeftFoot(_\d+)?$|CC_Base_L_Foot(_\d+)?$/, rFoot: /RightFoot(_\d+)?$|CC_Base_R_Foot(_\d+)?$/
    };
    // point a bone (its child joint) along a world direction
    function aim(b, child, dir) {
      if (!b || !child) return;
      b.updateMatrixWorld(true);
      var a = b.getWorldPosition(new THREE.Vector3()), c = child.getWorldPosition(new THREE.Vector3());
      var cur = c.sub(a).normalize(); if (cur.lengthSq() < 1e-8) return;
      var dq = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize());
      var wq = b.getWorldQuaternion(new THREE.Quaternion()), pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
      b.quaternion.copy(pq.invert().multiply(dq).multiply(wq));
      b.updateMatrixWorld(true);
    }
    // arms from the T / A bind pose down beside the body, elbows a little bent
    function relax(root) {
      var B = {}; for (var k in BONES) B[k] = bone(root, BONES[k]);
      if (!B.lArm || !B.rArm || !B.hips) return;
      root.updateMatrixWorld(true);
      var l = B.lArm.getWorldPosition(new THREE.Vector3()), r = B.rArm.getWorldPosition(new THREE.Vector3());
      var side = l.clone().sub(r); side.y = 0; side.normalize();            // toward the man's left
      var fwd = new THREE.Vector3().crossVectors(side, UP).normalize();      // his front
      var lf = B.lFoot && B.lFoot.getWorldPosition(new THREE.Vector3()), hp = B.hips.getWorldPosition(new THREE.Vector3());
      if (lf && hp.y < lf.y) UP.set(0, 1, 0);
      var down = new THREE.Vector3(0, -1, 0);
      aim(B.lArm, B.lFore, down.clone().addScaledVector(side, 0.16).addScaledVector(fwd, 0.08));
      aim(B.rArm, B.rFore, down.clone().addScaledVector(side, -0.16).addScaledVector(fwd, 0.08));
      aim(B.lFore, B.lHand, down.clone().addScaledVector(side, 0.05).addScaledVector(fwd, 0.35));
      aim(B.rFore, B.rHand, down.clone().addScaledVector(side, -0.05).addScaledVector(fwd, 0.35));
      root.userData.front = fwd.clone();
    }
    // SkeletonUtils.clone: copies the tree and rebinds each skinned mesh to the copied bones
    function cloneSkinned(src) {
      var clone = src.clone(true), map = new Map(), rev = new Map();
      (function walk(a, b) { map.set(a, b); rev.set(b, a); for (var i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]); })(src, clone);
      clone.traverse(function (o) {
        if (!o.isSkinnedMesh) return;
        var s = rev.get(o);
        o.skeleton = s.skeleton.clone();
        o.bindMatrix.copy(s.bindMatrix);
        o.skeleton.bones = s.skeleton.bones.map(function (b) { return map.get(b); });
        o.bind(o.skeleton, o.bindMatrix);
        o.raycast = function () {};
        o.frustumCulled = false; // bounds were measured in the bind pose; a fallen man would be culled
      });
      clone.traverse(function (o) { if (o.isMesh) { o.raycast = function () {}; o.userData.noBullet = true; } });
      return clone;
    }

    // ---------- hit capsules ----------
    var proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    function capsule(r, len) { return new THREE.CapsuleGeometry(r, Math.max(0.01, len), 4, 8); }
    function addProxies(e) {
      var root = e.model; root.updateMatrixWorld(true);
      var inv = e.body.matrixWorld.clone().invert();
      function loc(b, fb) { return b ? b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv) : fb; }
      var B = {}; for (var k in BONES) B[k] = bone(root, BONES[k]);
      var head = loc(B.head, new THREE.Vector3(0, 1.62, 0)), neck = loc(B.neck, new THREE.Vector3(0, 1.5, 0)), hips = loc(B.hips, new THREE.Vector3(0, 0.95, 0));
      head.y = Math.max(head.y, neck.y + 0.04);
      var parts = [
        { part: "head", geo: new THREE.SphereGeometry(0.13, 10, 8), at: head.clone().setY(head.y + 0.06) },
        { part: "torso", geo: capsule(0.19, Math.max(0.1, neck.y - hips.y - 0.2)), at: new THREE.Vector3((neck.x + hips.x) / 2, (neck.y + hips.y) / 2, (neck.z + hips.z) / 2) },
        { part: "legs", geo: capsule(0.17, Math.max(0.1, hips.y - 0.4)), at: new THREE.Vector3(hips.x, hips.y / 2 + 0.02, hips.z) }
      ];
      e.proxies = parts.map(function (p) {
        var m = new THREE.Mesh(p.geo, proxyMat); m.name = "enemy-hit-" + p.part; m.position.copy(p.at);
        m.userData.enemy = e; m.userData.part = p.part;
        m.userData.onBulletHit = function (info) { hit(e, p.part, info && info.dir, info && info.point); return true; };
        e.body.add(m); return m;
      });
      e.bones = B;
    }

    // ---------- spawning ----------
    function floorAt(x, z) {
      var rc = new THREE.Raycaster(new THREE.Vector3(x, 1.2, z), new THREE.Vector3(0, -1, 0), 0, 3); rc.camera = camera;
      var hits = [];
      try { // only the room and the terrace: the hands, sprites and controller models are not floors
        ["room", "terrace"].forEach(function (n) { var o = scene.getObjectByName(n); if (o) hits.push.apply(hits, rc.intersectObject(o, true)); });
        hits.sort(function (a, b) { return a.distance - b.distance; });
      } catch (err) { hits = []; }
      for (var i = 0; i < hits.length; i++) { var o = hits[i].object; if (!o.isMesh || o.userData.enemy || !o.visible) continue; var vis = true; for (var q = o; q; q = q.parent) if (!q.visible) vis = false; if (vis && hits[i].point.y < 0.6) return hits[i].point.y; }
      return 0;
    }
    function spotInFront() {
      camera.updateMatrixWorld(true);
      var head = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
      var f = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld); f.y = 0; if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize();
      var walk = desk && desk.walk, b = walk && walk.bounds, p = null;
      // the first clear spot ahead (not inside the desk, the sideboard, a wall or another man)
      var sideV = new THREE.Vector3(f.z, 0, -f.x);
      function clear(q) {
        if (api.list.some(function (o) { return Math.hypot(o.root.position.x - q.x, o.root.position.z - q.z) < 0.6; })) return false;
        try { return !walk || !walk.ok || walk.ok(q.x, q.z, 0.3); } catch (err) { return true; }
      }
      for (var dist = 2.2; dist >= 0.8 && !p; dist -= 0.2) {
        [0, 0.7, -0.7, 1.4, -1.4].forEach(function (sd) {
          if (p) return;
          var q = head.clone().addScaledVector(f, dist).addScaledVector(sideV, sd);
          if (b && b.min) { q.x = Math.min(b.max.x - 0.35, Math.max(b.min.x + 0.35, q.x)); q.z = Math.min(b.max.y - 0.35, Math.max(b.min.y + 0.35, q.z)); }
          if (clear(q)) p = q;
        });
      }
      if (!p) p = head.clone().addScaledVector(f, 1.2);
      p.y = floorAt(p.x, p.z);
      return { p: p, yaw: Math.atan2(head.x - p.x, head.z - p.z) };
    }
    var nextLook = 0;
    api.spawn = function (look, pos, yaw) {
      if (!look || !LOOKS[look]) look = ["fsb", "soldier"][nextLook++ % 2];
      if (api.list.length >= MAX) { if (S.log) S.log.warn("Enemy limit: " + MAX + " in the room. Remove some first."); return Promise.resolve(null); }
      if (S.log) S.log.info("Bringing in an enemy (" + LOOKS[look].label + ")…");
      return load(look).then(function (tpl) {
        if (api.list.length >= MAX) return null;
        var spot = pos ? { p: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y || 0, pos.z), yaw: yaw || 0 } : spotInFront();
        var root = new THREE.Group(); root.name = "studio-enemy";
        var body = new THREE.Group(); root.add(body);   // pivot at the heels for the fall
        var model = cloneSkinned(tpl); body.add(model);
        var front = (tpl.children[0] && tpl.children[0].userData.front) || new THREE.Vector3(0, 0, 1);
        model.rotation.y = -Math.atan2(front.x, front.z);       // face +Z in root space
        root.position.copy(spot.p); root.rotation.y = spot.yaw;
        scene.add(root); root.updateMatrixWorld(true);
        var e = { look: look, label: LOOKS[look].label, root: root, body: body, model: model, hp: 100, state: "up", t: 0, flinch: 0, flinchDir: new THREE.Vector3(), fallAxis: new THREE.Vector3(1, 0, 0), fallSign: 1, hits: 0 };
        addProxies(e);
        e.spineRest = e.bones.spine ? e.bones.spine.quaternion.clone() : null;
        e.headRest = e.bones.head ? e.bones.head.quaternion.clone() : null;
        api.list.push(e);
        if (S.log) S.log.info(e.label + " is in the room. Shoot him; Delete (dot on him) or B (pointing) removes him.");
        return e;
      }).catch(function (err) { console.error(err); if (S.log) S.log.error("Could not load the enemy model: " + (err && err.message || err)); return null; });
    };
    function disposeEnemy(e) {
      scene.remove(e.root);
      e.root.traverse(function (o) { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
      e.proxies.forEach(function (m) { m.geometry.dispose(); });
    }
    api.remove = function (e) { var i = api.list.indexOf(e); if (i < 0) return false; api.list.splice(i, 1); disposeEnemy(e); return true; };
    api.clear = function () { var n = api.list.length; api.list.slice().forEach(api.remove); if (S.log && n) S.log.info("Removed " + n + (n === 1 ? " enemy" : " enemies")); return n; };
    api.count = function () { return api.list.length; };
    api.setGetUp = function (v) { api.getUp = !!v; try { localStorage.setItem("studio.enemies.getUp", v ? "1" : "0"); } catch (e) {} };
    api.looks = LOOKS;

    // ---------- hits, flinch, fall, getting up ----------
    var DMG = { head: 100, torso: 40, legs: 25 };
    var puffs = [];
    var puffTex = (function () { var c = document.createElement("canvas"); c.width = c.height = 64; var x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(120,10,8,0.95)"); g.addColorStop(0.5, "rgba(90,6,6,0.6)"); g.addColorStop(1, "rgba(60,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    function puff(point) {
      if (!point) return;
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
      sp.position.copy(point); sp.scale.setScalar(0.06); sp.userData.noBullet = true; sp.raycast = function () {}; sp.name = "decal";
      scene.add(sp); puffs.push({ s: sp, t: 0 });
    }
    function hit(e, part, dir, point) {
      puff(point);
      if (e.state !== "up") return;
      e.hits++;
      var d = dir ? dir.clone() : new THREE.Vector3(0, 0, -1); d.y = 0; if (d.lengthSq() < 1e-6) d.set(0, 0, -1); d.normalize();
      e.hp -= DMG[part] || 30;
      if (e.hp <= 0) {
        e.state = "falling"; e.t = 0;
        // fall the way the round pushed him: rotate about the horizontal axis across that direction, at the heels
        var local = d.clone().applyQuaternion(e.root.quaternion.clone().invert());
        e.fallDir = local;
        e.fallAxis.crossVectors(UP, local).normalize();
        if (S.log) S.log.info(e.label + " down (" + part + ")");
      } else {
        e.flinch = 1; e.flinchDir.copy(d).applyQuaternion(e.root.quaternion.clone().invert());
      }
    }
    api.hit = function (e, part, dir) { hit(e, part || "torso", dir); };
    var _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
    function update(dt) {
      for (var i = puffs.length - 1; i >= 0; i--) {
        var p = puffs[i]; p.t += dt; p.s.scale.setScalar(0.06 + p.t * 0.5); p.s.material.opacity = Math.max(0, 1 - p.t / 0.45);
        if (p.t > 0.45) { scene.remove(p.s); p.s.material.dispose(); puffs.splice(i, 1); }
      }
      api.list.forEach(function (e) {
        var B = e.bones;
        // flinch: the chest snaps back from the hit and springs home
        if (e.flinch > 0 && B.spine && e.spineRest) {
          e.flinch = Math.max(0, e.flinch - dt * 3.2);
          var k = Math.sin(e.flinch * Math.PI) * 0.22;
          _ax.crossVectors(UP, e.flinchDir).normalize();
          B.spine.quaternion.copy(e.spineRest).premultiply(_q.setFromAxisAngle(_ax.applyQuaternion(B.spine.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(e.root.getWorldQuaternion(new THREE.Quaternion()))), k));
        } else if (e.spineRest && B.spine && e.state === "up") B.spine.quaternion.copy(e.spineRest);
        if (e.state === "falling") {
          e.t += dt;
          var T = 0.75, u = Math.min(1, e.t / T);
          var ang = (Math.PI / 2 - 0.06) * u * u;                          // accelerates like a toppling body
          if (u >= 1) { var b = Math.max(0, 1 - (e.t - T) / 0.25); ang -= Math.sin((1 - b) * Math.PI) * 0.06 * b; }
          e.body.quaternion.setFromAxisAngle(e.fallAxis, ang);
          e.body.position.copy(e.fallDir).multiplyScalar(-0.08 * u).setY(0.14 * u); // heels slide back, chest thickness off the floor
          if (B.head && e.headRest) B.head.quaternion.copy(e.headRest).premultiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.4 * u));
          if (e.t > T + 0.25) { e.state = "down"; e.t = 0; }
        } else if (e.state === "down") {
          e.t += dt;
          if (api.getUp && e.t > GET_UP_AFTER) { e.state = "rising"; e.t = 0; }
        } else if (e.state === "rising") {
          e.t += dt;
          var v = Math.max(0, 1 - e.t / 1.3), w = v * v * (3 - 2 * v);
          e.body.quaternion.setFromAxisAngle(e.fallAxis, (Math.PI / 2 - 0.06) * w);
          e.body.position.copy(e.fallDir).multiplyScalar(-0.08 * w).setY(0.14 * w);
          if (B.head && e.headRest) B.head.quaternion.copy(e.headRest).premultiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.4 * w));
          if (v <= 0) { e.state = "up"; e.hp = 100; e.body.quaternion.identity(); e.body.position.set(0, 0, 0); }
        }
      });
    }
    // hidden in Rally (the room is put away there)
    function inRoom() { var r = window.__rally; return !(r && r.mode && r.mode !== "room"); }
    var last = performance.now();
    var render = renderer.render.bind(renderer);
    renderer.render = function (sc, cam) {
      if (sc === scene && cam === camera) {
        var now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
        if (api.list.length || puffs.length) { try { update(dt); } catch (err) { console.error(err); } }
        var show = inRoom(); api.list.forEach(function (e) { e.root.visible = show; });
      }
      return render(sc, cam);
    };

    // ---------- removing one: Delete with the dot on him (desktop), B while pointing at him (VR) ----------
    var rc = new THREE.Raycaster(); rc.far = 30;
    function enemyOnRay(origin, dir) {
      if (!api.list.length) return null;
      rc.set(origin, dir);
      var objs = []; api.list.forEach(function (e) { objs.push.apply(objs, e.proxies); });
      var h = rc.intersectObjects(objs, false)[0];
      return h ? h.object.userData.enemy : null;
    }
    api.atDot = function () {
      camera.updateMatrixWorld(true);
      return enemyOnRay(new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld), new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld));
    };
    addEventListener("keydown", function (ev) {
      if (ev.code !== "Delete" && ev.code !== "Backspace") return;
      if (renderer.xr.isPresenting || document.pointerLockElement !== renderer.domElement) return;
      var e = api.atDot(); if (!e) return;
      api.remove(e); if (S.log) S.log.info("Removed " + e.label);
      ev.stopImmediatePropagation(); ev.preventDefault();
    }, true);
    var bPrev = false;
    setInterval(function () {
      if (!renderer.xr.isPresenting || !XR || !api.list.length) { bPrev = false; return; }
      var h = XR.hands.find(function (q) { return q.source && q.source.handedness === "right" && !q.source.hand; });
      var gp = h && h.source.gamepad, b = !!(gp && gp.buttons[5] && gp.buttons[5].pressed);
      if (b && !bPrev && !h.held && h.ray) {
        h.ray.updateMatrixWorld(true);
        var e = enemyOnRay(new THREE.Vector3().setFromMatrixPosition(h.ray.matrixWorld), new THREE.Vector3(0, 0, -1).transformDirection(h.ray.matrixWorld));
        if (e) { api.remove(e); if (XR.pulse) XR.pulse(h, 0.5, 30); if (S.log) S.log.info("Removed " + e.label); }
      }
      bPrev = b;
    }, 50);
    api.ready = true;
  });
})();
