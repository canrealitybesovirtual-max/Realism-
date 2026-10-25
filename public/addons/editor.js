(function () {
  "use strict";
  var DEFAULT_CODE = [
    "// Game Editor: this script runs inside the live room.",
    "// Describe a change on the Ask Claude tab, or write code here and press Run (Ctrl+Enter).",
    "// In scope: THREE, scene, camera, renderer, add(obj), addThrowable(mesh, opts),",
    "//           onFrame((dt, time) => {}), find(name), refreshShadows(), log(msg)",
    ""
  ].join("\n");

  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        var os = s && s.ready && ((s.computer && s.computer.os) || (s.targets && s.targets.computer && s.targets.computer.os));
        if (os && s.THREE) resolve({ S: s, os: os });
        else setTimeout(check, 250);
      })();
    });
  }

  var samplePromise = null;
  function getSample() {
    if (!samplePromise) {
      samplePromise = (window.claude && typeof window.claude.use === "function")
        ? window.claude.use("sample").catch(function () { return null; })
        : Promise.resolve(null);
    }
    return samplePromise;
  }

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function iconBase(c, x, y, s, top, bottom) {
    c.save();
    c.shadowColor = "rgba(0,0,0,0.25)"; c.shadowBlur = 8; c.shadowOffsetY = 3;
    rr(c, x, y, s, s, s * 0.23);
    var g = c.createLinearGradient(0, y, 0, y + s);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fill();
    c.restore();
    rr(c, x, y, s, s, s * 0.23); c.clip();
  }
  function fmtTime(t) {
    if (!isFinite(t)) return "0:00";
    t = Math.max(0, Math.floor(t));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
  }
  function inRect(x, y, b) { return b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }

  waitForStudio().then(function (ctx) {
    var S = ctx.S, os = ctx.os, THREE = S.THREE;
    var notes = os.apps.get("notes");
    if (!notes) return;
    var NotesApp = notes.constructor;
    var Buf = notes.buf.constructor;
    var UI = os.fonts.ui, MONO = os.fonts.mono;

    // ---------- runtime for scripts ----------
    var added = new Set();
    var frameFns = new Set();
    var statusSink = function () {};

    function refreshShadows() { try { S.renderer.shadowMap.needsUpdate = true; } catch (e) {} }
    function removeProp(obj) {
      var P = S.physics;
      if (!P || !P.props) return;
      var p = P.props.find(function (q) { return q.desc && q.desc.object === obj; });
      if (!p) return;
      try { if (P.holds) P.holds.delete(p); } catch (e) {}
      try { if (P.world) P.world.removeRigidBody(p.body); } catch (e) {}
      var i = P.props.indexOf(p); if (i >= 0) P.props.splice(i, 1);
    }
    function cleanup() {
      frameFns.clear();
      added.forEach(function (o) {
        removeProp(o);
        if (o.parent) o.parent.remove(o);
      });
      added.clear();
      refreshShadows();
    }
    function add(obj) {
      S.scene.add(obj); added.add(obj);
      obj.traverse && obj.traverse(function (m) { if (m.isMesh) { if (m.castShadow === false) m.castShadow = true; m.receiveShadow = true; } });
      refreshShadows();
      return obj;
    }
    function addThrowable(mesh, opts) {
      opts = opts || {};
      add(mesh);
      var P = S.physics;
      if (!P || !P.world || !P.addProp) return mesh;
      mesh.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(mesh);
      var size = box.getSize(new THREE.Vector3());
      var center = box.getCenter(new THREE.Vector3());
      var pos = mesh.getWorldPosition(new THREE.Vector3());
      var off = [center.x - pos.x, center.y - pos.y, center.z - pos.z];
      var shape = opts.shape === "ball"
        ? { kind: "ball", size: [Math.max(size.x, size.y, size.z) / 2], offset: off }
        : { kind: "cuboid", size: [Math.max(size.x / 2, 0.01), Math.max(size.y / 2, 0.01), Math.max(size.z / 2, 0.01)], offset: off };
      try {
        P.addProp({ object: mesh, shapes: [shape], mass: opts.mass || 1, friction: opts.friction == null ? 0.6 : opts.friction, restitution: opts.restitution == null ? 0.2 : opts.restitution });
        if (!mesh.parent) S.scene.add(mesh);
      } catch (e) { statusSink("Physics: " + e.message, true); }
      return mesh;
    }
    function onFrame(fn) { frameFns.add(fn); return function () { frameFns.delete(fn); }; }
    function find(name) { return S.scene.getObjectByName(name); }

    function runCode(code) {
      cleanup();
      try {
        var f = new Function("THREE", "scene", "camera", "renderer", "studio", "add", "addThrowable", "onFrame", "find", "refreshShadows", "log", code);
        f(THREE, S.scene, S.camera, S.renderer, S, add, addThrowable, onFrame, find, refreshShadows, function (m) { statusSink(String(m), false); });
        refreshShadows();
        return null;
      } catch (e) {
        return e && e.message ? e.message : String(e);
      }
    }

    var last = performance.now();
    function loop(t) {
      requestAnimationFrame(loop);
      var dt = Math.min((t - last) / 1000, 0.05); last = t;
      frameFns.forEach(function (fn) {
        try { fn(dt, t / 1000); } catch (e) { frameFns.delete(fn); statusSink("An onFrame function stopped: " + e.message, true); }
      });
      if (video.el && !video.el.paused && !os.wm.byApp("video")) video.el.pause();
    }
    requestAnimationFrame(loop);

    function sceneSummary() {
      var lines = [], n = 0;
      function p(v) { return [v.x, v.y, v.z].map(function (a) { return Math.round(a * 100) / 100; }).join(", "); }
      (function walk(o, depth) {
        if (n > 160 || depth > 4) return;
        o.children.forEach(function (c) {
          if (n > 160 || added.has(c)) return;
          var mat = c.material && !Array.isArray(c.material) ? c.material : null;
          var label = c.name || (mat && mat.name ? "(material " + mat.name + ")" : "");
          if (label || depth < 2) {
            var wp = c.getWorldPosition(new THREE.Vector3());
            var extra = mat && mat.color ? " color #" + mat.color.getHexString() : "";
            lines.push("  ".repeat(depth) + (label || "(unnamed)") + " - " + c.type + " at " + p(wp) + extra);
            n++;
          }
          walk(c, depth + 1);
        });
      })(S.scene, 0);
      var dir = S.camera.getWorldDirection(new THREE.Vector3());
      lines.push("Camera at " + p(S.camera.getWorldPosition(new THREE.Vector3())) + " looking " + p(dir));
      return lines.join("\n");
    }

    // ---------- Game Editor app ----------
    class EditorApp extends NotesApp {
      id = "code"; title = "Game Editor";
      defaultRect = { x: 180, y: 80, w: 1220, h: 820 }; minSize = [700, 420];
      barH = 66; mode = "ask"; status = ""; statusErr = false; busy = false;
      keep = true; resetArmed = false; hits = {}; blink = -1;
      constructor(o) {
        super(o);
        this.bufs = {
          ask: new Buf(o.storage.get("editor.ask") || ""),
          code: new Buf(o.storage.get("editor.code") || DEFAULT_CODE)
        };
        this.keep = o.storage.get("editor.keep") !== "0";
        this.buf = this.bufs.ask;
        this.buf.move("docEnd");
        this.status = "Describe a change to the room, then press Make it.";
      }
      setStatus(t, err) { this.status = t; this.statusErr = !!err; this.os.invalidate(); }
      er(r) { return { x: r.x, y: r.y + this.barH, w: r.w, h: r.h - this.barH }; }
      setMode(m) {
        if (this.mode === m) return;
        this.save(); this.mode = m; this.buf = this.bufs[m]; this.scrollX = 0; this.scrollY = 0;
        this.setStatus(m === "ask" ? "Describe a change to the room, then press Make it." : "Edit the script, then press Run.", false);
      }
      layout(w) {
        var h = 42, y = 12, b = {};
        b.ask = { x: 16, y: y, w: 150, h: h };
        b.code = { x: 166, y: y, w: 104, h: h };
        var x = w - 16;
        b.primary = { x: x - 156, y: y, w: 156, h: h }; x -= 156 + 12;
        b.keep = { x: x - 196, y: y, w: 196, h: h }; x -= 196 + 12;
        b.reset = { x: x - 196, y: y, w: 196, h: h };
        if (b.reset.x < 290) b.reset = null;
        return b;
      }
      drawButton(c, ox, oy, b, label, kind, hover) {
        if (!b) return;
        rr(c, ox + b.x, oy + b.y, b.w, b.h, 10);
        if (kind === "primary") c.fillStyle = this.busy ? "#7aa7e8" : "#0a5bd8";
        else if (kind === "danger") c.fillStyle = "#ffe5e3";
        else c.fillStyle = "#ffffff";
        c.fill();
        if (kind !== "primary") { c.strokeStyle = "#cfcfd4"; c.lineWidth = 1; c.stroke(); }
        c.fillStyle = kind === "primary" ? "#ffffff" : kind === "danger" ? "#c4271c" : "#1d1d1f";
        c.font = "600 18px " + UI; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(label, ox + b.x + b.w / 2, oy + b.y + b.h / 2 + 1);
        c.textAlign = "left"; c.textBaseline = "alphabetic";
      }
      draw(c, r, focused, t) {
        var b = this.hits = this.layout(r.w);
        c.fillStyle = "#f4f4f6"; c.fillRect(r.x, r.y, r.w, this.barH);
        c.fillStyle = "#dadade"; c.fillRect(r.x, r.y + this.barH - 1, r.w, 1);
        // segmented tabs
        rr(c, r.x + 14, r.y + 10, 258, 46, 12); c.fillStyle = "#e3e3e8"; c.fill();
        ["ask", "code"].forEach(function (m) {
          var bb = b[m], on = this.mode === m;
          if (on) { rr(c, r.x + bb.x + 2, r.y + bb.y, bb.w - 4, bb.h, 10); c.fillStyle = "#ffffff"; c.fill(); }
          c.fillStyle = on ? "#1d1d1f" : "#6b6b70"; c.font = "600 18px " + UI; c.textAlign = "center"; c.textBaseline = "middle";
          c.fillText(m === "ask" ? "✦ Ask Claude" : "Code", r.x + bb.x + bb.w / 2, r.y + bb.y + bb.h / 2 + 1);
        }, this);
        c.textAlign = "left"; c.textBaseline = "alphabetic";
        var dots = ".".repeat(1 + Math.floor(t / 400) % 3);
        this.drawButton(c, r.x, r.y, b.primary, this.busy ? "Working" + dots : this.mode === "ask" ? "Make it" : "▶ Run", "primary");
        this.drawButton(c, r.x, r.y, b.keep, (this.keep ? "☑" : "☐") + " Keep on reload", "plain");
        this.drawButton(c, r.x, r.y, b.reset, this.resetArmed ? "Click again to reset" : "Reset room", "danger");

        var e = this.er(r);
        super.draw(c, e, focused, t);
        if (this.mode === "ask" && this.buf.text === "") {
          c.fillStyle = "#9a9aa0"; c.font = "400 23px " + MONO;
          var ex = e.x + this.pad.l, ey = e.y + this.pad.t + 25;
          ["Describe what to change, for example:", "", "make the walls dark green and add a red ball I can throw", "put a spinning neon sign that says STUDIO above the desk", "make the lamp flicker like a horror movie"]
            .forEach(function (s, i) { c.fillText(s, ex, ey + i * 34); });
        }
        // status bar (replaces the Notes one)
        var sy = r.y + r.h - 40;
        c.fillStyle = "#f3f3f3"; c.fillRect(r.x, sy, r.w, 40);
        c.fillStyle = "#dadada"; c.fillRect(r.x, sy, r.w, 1);
        c.font = "500 17px " + UI; c.textBaseline = "middle";
        c.fillStyle = this.statusErr ? "#c4271c" : "#555";
        var msg = this.status; var maxW = r.w - 260;
        while (msg.length > 4 && c.measureText(msg).width > maxW) msg = msg.slice(0, -2);
        if (msg !== this.status) msg += "…";
        c.fillText(msg, r.x + 18, sy + 20);
        c.textAlign = "right"; c.fillStyle = "#8a8a8e";
        c.fillText("Ctrl+Enter " + (this.mode === "ask" ? "to make it" : "to run"), r.x + r.w - 18, sy + 20);
        c.textAlign = "left"; c.textBaseline = "alphabetic";
      }
      animating(focused, t) {
        var ph = Math.floor(t / 400);
        if ((focused || this.busy) && ph !== this.blink) { this.blink = ph; return true; }
        return false;
      }
      cursor(x, y, r) {
        if (y < this.barH) { var b = this.layout(r.w); for (var k in b) if (inRect(x, y, b[k])) return "pointer"; return "arrow"; }
        if (y > r.h - 40) return "arrow";
        return super.cursor(x, y - this.barH, this.er(r));
      }
      pointerDown(x, y, r) {
        if (y < this.barH) {
          var b = this.layout(r.w);
          if (inRect(x, y, b.ask)) this.setMode("ask");
          else if (inRect(x, y, b.code)) this.setMode("code");
          else if (inRect(x, y, b.primary)) this.primary();
          else if (inRect(x, y, b.keep)) { this.keep = !this.keep; this.os.storage.set("editor.keep", this.keep ? "1" : "0"); this.setStatus(this.keep ? "Your changes will come back when the room reloads." : "Changes will be gone when the room reloads.", false); }
          else if (inRect(x, y, b.reset)) this.reset();
          if (!inRect(x, y, b.reset)) this.resetArmed = false;
          this.os.invalidate();
          return;
        }
        this.resetArmed = false;
        if (y > r.h - 40) return;
        super.pointerDown(x, y - this.barH, this.er(r));
      }
      pointerMove(x, y, r, d) { if (d) super.pointerMove(x, y - this.barH, this.er(r), d); }
      save() {
        this.os.storage.set("editor.ask", this.bufs.ask.text);
        this.os.storage.set("editor.code", this.bufs.code.text);
        this.saved = true; this.os.invalidate();
      }
      key(e) {
        var mod = e.ctrl || e.meta;
        if (mod && (e.code === "Enter" || e.code === "NumpadEnter")) { this.primary(); return true; }
        if (mod && e.code === "KeyV" && navigator.clipboard && navigator.clipboard.readText) {
          var self = this, buf = this.buf;
          navigator.clipboard.readText().then(function (txt) {
            if (txt) { buf.insert(txt.replace(/\r\n?/g, "\n").replace(/\t/g, "    ")); self.changed(); self.ensureCaretVisible(self.lastRect); self.os.invalidate(); }
          }).catch(function () { buf.paste(); self.changed(); self.os.invalidate(); });
          return true;
        }
        var handled = super.key(e);
        if (mod && (e.code === "KeyC" || e.code === "KeyX") && navigator.clipboard && navigator.clipboard.writeText) {
          try { navigator.clipboard.writeText(Buf.clipboard).catch(function () {}); } catch (err) {}
        }
        return handled;
      }
      primary() {
        if (this.busy) return;
        if (this.mode === "ask") this.ask(); else this.run();
      }
      run(silent) {
        this.save();
        var err = runCode(this.bufs.code.text);
        if (err) this.setStatus("Script error: " + err, true);
        else if (!silent) this.setStatus("Ran the script." + (this.keep ? " It will run again when the room reloads." : ""), false);
        return !err;
      }
      reset() {
        if (!this.resetArmed) { this.resetArmed = true; this.setStatus("This clears the script and reloads the room.", true); return; }
        this.os.storage.set("editor.code", DEFAULT_CODE);
        this.os.storage.set("editor.ask", "");
        location.reload();
      }
      async ask() {
        var req = this.bufs.ask.text.trim();
        if (!req) { this.setStatus("Type what you want to change first.", true); return; }
        this.save();
        var sample = await getSample();
        if (!sample) { this.setStatus("Claude isn’t available in this view. Open the room on claude.ai while signed in, or write code on the Code tab.", true); return; }
        this.busy = true; this.setStatus("Thinking…", false);
        var prompt = [
          "You are editing a live three.js (r186) first-person game: a small studio room with a desk, a computer, a desk lamp, a potted plant, a wall clock and a pistol. Write JavaScript that will be run with `new Function` inside the running game. Units are meters, y is up, the floor is near y = 0.",
          "",
          "In scope as plain variables:",
          "- THREE: the three.js r186 namespace",
          "- scene, camera, renderer",
          "- add(object): adds to the scene and tracks it. Always use this instead of scene.add so a re-run removes it.",
          "- addThrowable(mesh, {mass, shape: 'box'|'ball', friction, restitution}): adds a physics object the player can pick up, throw and shoot. Set mesh.position first.",
          "- onFrame((dt, time) => {}): runs every frame; dt and time are in seconds.",
          "- find(name): scene.getObjectByName(name)",
          "- refreshShadows(): shadow maps do not update on their own; call it after moving, adding or recoloring things (also inside onFrame when something that casts shadows moves, at most a few times per second).",
          "- log(message): shows a short message in the editor's status bar.",
          "",
          "Rules:",
          "- Return the COMPLETE script: everything in the current script that should stay, plus the new change. Before your script runs, everything from the previous run that went through add/addThrowable is removed and onFrame callbacks are cleared, but edits to existing objects (like material colors) are not undone, so make every change safe to run twice. If the request undoes an earlier change to an existing object, restore it explicitly.",
          "- Do not use scene.add directly, fetch, import, external URLs or image files. Make textures with CanvasTexture when needed.",
          "- Do not change renderer settings, move the camera, or delete the desk, computer, keyboard, mouse or walls unless asked.",
          "- Prefer MeshStandardMaterial. Keep it under about 150 lines.",
          "- Start with one comment line summarizing all changes in the script.",
          "- Reply with exactly one ```js code block and nothing else.",
          "",
          "Current script:",
          "```js",
          this.bufs.code.text,
          "```",
          "",
          "Scene (name - type - world position):",
          sceneSummary(),
          "",
          "Request: " + req
        ].join("\n");
        var self = this;
        try {
          var res = await sample(prompt, {
            modelTier: "default", cache: false,
            onText: function (o) { self.setStatus("Claude is writing the script… " + o.text.split("\n").length + " lines", false); }
          });
          var text = res.text || "";
          var m = /```(?:js|javascript)?\s*\n([\s\S]*?)```/.exec(text);
          var code = (m ? m[1] : text).replace(/\s+$/, "") + "\n";
          if (res.truncated) { this.busy = false; this.setStatus("The answer was cut off. Try a smaller change.", true); return; }
          this.bufs.code = new Buf(code);
          this.bufs.ask = new Buf("");
          this.buf = this.bufs.ask;
          this.save();
          var err = runCode(code);
          if (err) {
            this.mode = "code"; this.buf = this.bufs.code; this.scrollX = 0; this.scrollY = 0;
            this.setStatus("The new script hit an error: " + err + ". Fix it here, or ask Claude again.", true);
          } else {
            var first = code.split("\n")[0].replace(/^\/\/\s*/, "");
            this.setStatus("Done: " + req + (first && first !== req ? "  (" + first + ")" : ""), false);
          }
        } catch (e) {
          var code2 = e && e.code;
          var copy = code2 === "not_granted" ? "Claude wasn’t allowed for this room. Allow it to use Ask Claude, or write code on the Code tab."
            : code2 === "rate_limited" ? "Too many requests right now. Wait a minute and try again."
            : "Claude couldn’t finish: " + ((e && e.message) || "unknown error");
          this.setStatus(copy, true);
        } finally {
          this.busy = false; this.os.invalidate();
        }
      }
      drawIcon(c, x, y, s) {
        iconBase(c, x, y, s, "#2f3a52", "#141a28");
        c.fillStyle = "#7fd3ff"; c.font = "700 " + Math.round(s * 0.36) + "px " + MONO;
        c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText("</>", x + s / 2, y + s * 0.56);
        c.fillStyle = "#ffd36b"; c.font = "700 " + Math.round(s * 0.26) + "px " + UI;
        c.fillText("✦", x + s * 0.78, y + s * 0.24);
        c.textAlign = "left"; c.textBaseline = "alphabetic";
      }
    }

    // ---------- Video app ----------
    var video = { el: null, name: "" };
    var picker = document.createElement("input");
    picker.type = "file"; picker.accept = "video/*,audio/*"; picker.style.display = "none";
    document.body.appendChild(picker);

    class VideoApp {
      id = "video"; title = "Video";
      defaultRect = { x: 300, y: 90, w: 1280, h: 800 }; minSize = [560, 380];
      barH = 72; hits = {}; seeking = false; note = ""; lastFrame = -1;
      constructor(o) {
        this.os = o;
        var self = this;
        picker.addEventListener("change", function () {
          var f = picker.files && picker.files[0];
          if (!f) return;
          self.load(f);
          picker.value = "";
        });
      }
      load(f) {
        if (video.el) { video.el.pause(); URL.revokeObjectURL(video.el.src); }
        var v = document.createElement("video");
        v.playsInline = true; v.preload = "auto";
        v.src = URL.createObjectURL(f);
        var self = this;
        v.addEventListener("loadeddata", function () { self.os.invalidate(); });
        v.addEventListener("error", function () { self.note = "This file can’t be played in this browser. Try an MP4 or WebM."; self.os.invalidate(); });
        video.el = v; video.name = f.name; this.note = "";
        var w = this.os.wm.byApp("video"); if (w) w.title = f.name;
        v.play().catch(function () { self.note = "Click play to start."; self.os.invalidate(); });
        this.os.invalidate();
      }
      layout(r) {
        var y = r.h - this.barH, b = {};
        b.play = { x: 16, y: y + 12, w: 48, h: 48 };
        b.open = { x: r.w - 170, y: y + 15, w: 154, h: 42 };
        b.mute = { x: r.w - 230, y: y + 15, w: 48, h: 42 };
        b.track = { x: 200, y: y + 26, w: r.w - 200 - 250, h: 20 };
        b.choose = { x: r.w / 2 - 130, y: (r.h - this.barH) / 2 + 30, w: 260, h: 56 };
        return b;
      }
      draw(c, r, focused, t) {
        var b = this.hits = this.layout(r);
        var vh = r.h - this.barH, v = video.el;
        c.fillStyle = "#000"; c.fillRect(r.x, r.y, r.w, vh);
        if (v && v.readyState >= 2 && v.videoWidth) {
          var s = Math.min(r.w / v.videoWidth, vh / v.videoHeight);
          var w = v.videoWidth * s, h = v.videoHeight * s;
          c.drawImage(v, r.x + (r.w - w) / 2, r.y + (vh - h) / 2, w, h);
        } else if (v && v.readyState >= 1 && !v.videoWidth) {
          c.fillStyle = "#cfcfd4"; c.font = "600 26px " + UI; c.textAlign = "center";
          c.fillText("♪ " + video.name, r.x + r.w / 2, r.y + vh / 2); c.textAlign = "left";
        } else if (!v) {
          c.textAlign = "center"; c.fillStyle = "#f2f2f2"; c.font = "600 30px " + UI;
          c.fillText("Play a video from your device", r.x + r.w / 2, r.y + vh / 2 - 40);
          c.fillStyle = "#9a9aa0"; c.font = "400 19px " + UI;
          c.fillText("YouTube and other websites can’t load inside the room, but any video file you have will play here.", r.x + r.w / 2, r.y + vh / 2 - 2);
          var cb = b.choose;
          rr(c, r.x + cb.x, r.y + cb.y, cb.w, cb.h, 12); c.fillStyle = "#0a5bd8"; c.fill();
          c.fillStyle = "#fff"; c.font = "600 21px " + UI; c.textBaseline = "middle";
          c.fillText("Choose a video", r.x + cb.x + cb.w / 2, r.y + cb.y + cb.h / 2 + 1);
          c.textAlign = "left"; c.textBaseline = "alphabetic";
        }
        if (this.note) {
          c.font = "500 19px " + UI; var nw = c.measureText(this.note).width + 36;
          rr(c, r.x + (r.w - nw) / 2, r.y + 20, nw, 44, 10); c.fillStyle = "rgba(20,20,22,0.85)"; c.fill();
          c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
          c.fillText(this.note, r.x + r.w / 2, r.y + 43); c.textAlign = "left"; c.textBaseline = "alphabetic";
        }
        // control bar
        var y0 = r.y + vh;
        c.fillStyle = "#1c1c1e"; c.fillRect(r.x, y0, r.w, this.barH);
        var pb = b.play, playing = v && !v.paused;
        c.beginPath(); c.arc(r.x + pb.x + 24, r.y + pb.y + 24, 24, 0, Math.PI * 2); c.fillStyle = v ? "#f2f2f2" : "#555"; c.fill();
        c.fillStyle = "#1c1c1e";
        var cx = r.x + pb.x + 24, cy = r.y + pb.y + 24;
        if (playing) { c.fillRect(cx - 9, cy - 10, 6, 20); c.fillRect(cx + 3, cy - 10, 6, 20); }
        else { c.beginPath(); c.moveTo(cx - 7, cy - 12); c.lineTo(cx + 12, cy); c.lineTo(cx - 7, cy + 12); c.closePath(); c.fill(); }
        c.fillStyle = "#c4c4c8"; c.font = "500 18px " + UI; c.textBaseline = "middle";
        var cur = v ? v.currentTime : 0, dur = v ? v.duration : 0;
        c.fillText(fmtTime(cur) + " / " + fmtTime(dur), r.x + 78, y0 + this.barH / 2);
        var tr = b.track;
        rr(c, r.x + tr.x, r.y + tr.y + 7, tr.w, 6, 3); c.fillStyle = "#48484c"; c.fill();
        var frac = v && dur ? Math.min(1, cur / dur) : 0;
        if (frac > 0) { rr(c, r.x + tr.x, r.y + tr.y + 7, Math.max(6, tr.w * frac), 6, 3); c.fillStyle = "#6cc4ff"; c.fill(); }
        c.beginPath(); c.arc(r.x + tr.x + tr.w * frac, r.y + tr.y + 10, 9, 0, Math.PI * 2); c.fillStyle = "#fff"; c.fill();
        var mb = b.mute;
        rr(c, r.x + mb.x, r.y + mb.y, mb.w, mb.h, 10); c.fillStyle = "#2c2c2e"; c.fill();
        c.fillStyle = "#f2f2f2"; c.textAlign = "center"; c.font = "500 20px " + UI;
        c.fillText(v && v.muted ? "🔇" : "🔊", r.x + mb.x + mb.w / 2, r.y + mb.y + mb.h / 2 + 1);
        var ob = b.open;
        rr(c, r.x + ob.x, r.y + ob.y, ob.w, ob.h, 10); c.fillStyle = "#2c2c2e"; c.fill();
        c.fillStyle = "#f2f2f2"; c.font = "600 18px " + UI;
        c.fillText("Open file", r.x + ob.x + ob.w / 2, r.y + ob.y + ob.h / 2 + 1);
        c.textAlign = "left"; c.textBaseline = "alphabetic";
      }
      animating(focused, t) {
        var v = video.el;
        if (v && (!v.paused || this.seeking)) return true;
        if (v && v.readyState >= 2 && this.lastFrame !== v.currentTime) { this.lastFrame = v.currentTime; return true; }
        return false;
      }
      cursor(x, y, r) {
        var b = this.layout(r);
        if (inRect(x, y, b.play) || inRect(x, y, b.open) || inRect(x, y, b.mute) || inRect(x, y, { x: b.track.x - 10, y: b.track.y - 10, w: b.track.w + 20, h: b.track.h + 20 })) return "pointer";
        if (!video.el && inRect(x, y, b.choose)) return "pointer";
        return "arrow";
      }
      seekTo(x, r) {
        var v = video.el, tr = this.layout(r).track;
        if (!v || !v.duration) return;
        v.currentTime = Math.max(0, Math.min(1, (x - tr.x) / tr.w)) * v.duration;
        this.os.invalidate();
      }
      toggle() {
        var v = video.el, self = this;
        if (!v) { picker.click(); return; }
        if (v.paused) { this.note = ""; v.play().catch(function (e) { self.note = "Playback was blocked: " + e.message; self.os.invalidate(); }); }
        else v.pause();
        this.os.invalidate();
      }
      pointerDown(x, y, r) {
        var b = this.layout(r), v = video.el;
        if (inRect(x, y, b.open) || (!v && inRect(x, y, b.choose))) { picker.click(); return; }
        if (inRect(x, y, b.play)) { this.toggle(); return; }
        if (inRect(x, y, b.mute)) { if (v) v.muted = !v.muted; this.os.invalidate(); return; }
        if (inRect(x, y, { x: b.track.x - 10, y: b.track.y - 12, w: b.track.w + 20, h: b.track.h + 24 })) { this.seeking = true; this.seekTo(x, r); return; }
        if (v && y < r.h - this.barH) this.toggle();
      }
      pointerMove(x, y, r, d) { if (d && this.seeking) this.seekTo(x, r); }
      pointerUp() { this.seeking = false; }
      key(e) {
        var v = video.el;
        if (e.code === "Space" || e.code === "KeyK") { this.toggle(); return true; }
        if (e.code === "KeyO") { picker.click(); return true; }
        if (!v) return false;
        if (e.code === "ArrowLeft" || e.code === "KeyJ") { v.currentTime = Math.max(0, v.currentTime - (e.code === "KeyJ" ? 10 : 5)); return true; }
        if (e.code === "ArrowRight" || e.code === "KeyL") { v.currentTime = Math.min(v.duration || 0, v.currentTime + (e.code === "KeyL" ? 10 : 5)); return true; }
        if (e.code === "KeyM") { v.muted = !v.muted; return true; }
        if (e.code === "KeyF") return false;
        return false;
      }
      drawIcon(c, x, y, s) {
        iconBase(c, x, y, s, "#ff5a4f", "#c8231b");
        c.fillStyle = "#fff";
        c.beginPath(); c.moveTo(x + s * 0.4, y + s * 0.3); c.lineTo(x + s * 0.72, y + s * 0.5); c.lineTo(x + s * 0.4, y + s * 0.7); c.closePath(); c.fill();
      }
    }

    var editor = new EditorApp(os);
    var player = new VideoApp(os);
    statusSink = function (m, err) { editor.setStatus(m, err); };
    os.apps.set(editor.id, editor);
    os.apps.set(player.id, player);
    os.dockApps.splice(os.dockApps.indexOf("system"), 0, "code", "video");
    os.invalidate();

    if (editor.keep) {
      var code = editor.bufs.code.text;
      var meaningful = code.split("\n").some(function (l) { return l.trim() && !/^\s*\/\//.test(l); });
      if (meaningful) {
        var err = runCode(code);
        editor.setStatus(err ? "Your saved script hit an error on load: " + err : "Your saved changes were applied.", !!err);
      }
    }
    getSample();
  });
})();
