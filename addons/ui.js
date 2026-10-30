// UI Settings, Editor mode, Console and Status bar (Phase 5A).
// - Settings: one store (storage key "ui.settings"), applied at once, remembered. Presets Minimal,
//   Comfort, Full, plus Reset. ?safe=1 forces Minimal without touching what is stored.
//   The page lives in the System app ("UI Settings" tab).
// - Editor mode: on while the Game Editor window is open (not minimised) in the office. Editing visuals
//   in the room (selection outlines, collider and bounds boxes) sit on an editor-only camera layer, and
//   the in-world move tool only works in Editor mode. Off in Rally and when the editor closes.
// - Console: a monitor app that lists the game's log (window.__studio.log).
// - Status bar: Editor mode, prop count and frame health, drawn in the computer's menu bar. It redraws
//   only when one of those values changes, so the monitor texture is not re-uploaded every frame.
(function () {
  "use strict";
  var EDITOR_LAYER = 30;

  var FEATURES = [
    { key: "console", group: "Tools", label: "Console", desc: "Messages and errors, as an app on the computer." },
    { key: "statusBar", group: "Tools", label: "Status bar", desc: "Mode, props and frame health in the menu bar." },
    { key: "undoButtons", group: "Tools", label: "Undo and Redo buttons", desc: "In the Game Editor. Each script run is one step." },
    { key: "playControls", group: "Tools", label: "Play, Pause and Stop", desc: "In the Game Editor. Stop puts the room back." },
    { key: "palette", group: "Tools", label: "Command palette", desc: "Ctrl+K on the computer: find and run any action." },
    { key: "pointerLabels", group: "Tools", label: "Pointer labels", desc: "A short label under the dot: what you will pick up or use." },
    { key: "savedLayout", group: "Tools", label: "Saved window layout", desc: "The computer's windows reopen where you left them." },
    { key: "editorHelpers", group: "Tools", label: "Editor helpers in the room", desc: "Outlines and collider boxes while the editor is open." },
    { key: "heldHandSize", group: "VR", type: "choice", label: "Hands on held objects", desc: "Normal size: scaling up what you hold leaves your hand hand-sized. Scale with object: your hand grows and shrinks with it.", def: "normal", options: [["normal", "Normal size"], ["grow", "Scale with object"]], noPreset: true },
    { key: "wristTablet", group: "VR", label: "Wrist tablet", desc: "Editor tools on your left wrist in VR, while the editor is open. Starts folded." },
    { key: "rotateStep", group: "Holding props", type: "choice", label: "Turn step", desc: "How far Q / R (desktop) or a stick flick (VR) turns what you hold. Free turns smoothly while held.", def: 45, options: [[0, "Free"], [15, "15\u00b0"], [45, "45\u00b0"], [90, "90\u00b0"]], noPreset: true },
    { key: "heldStick", group: "Holding props", type: "choice", label: "VR stick while holding", desc: "Turn it: that hand's stick turns the prop, stick pressed in rolls it, B / Y stands it upright. Walk: the stick walks as usual.", def: "rotate", options: [["rotate", "Turn it"], ["move", "Walk"]], noPreset: true },
    { key: "twoHandTurn", group: "Holding props", type: "choice", label: "Two-hand turning (VR)", desc: "Hold a prop, squeeze the other grip in the air and move that hand round it: the prop turns with your hands.", def: "on", options: [["on", "On"], ["off", "Off"]], noPreset: true },
    { key: "wheelMode", group: "Holding props", type: "choice", label: "Mouse wheel while holding", desc: "Push / pull: nearer or further (Alt + wheel turns it, Alt + Shift tips it). Rotate: the wheel turns it.", def: "push", options: [["push", "Push / pull"], ["rotate", "Rotate"]], noPreset: true },
    { key: "zoomScreen", group: "Display", label: "Zoom to the computer screen", desc: "Using the computer on a desktop moves the view up to the screen; leaving moves it back. Never in VR.", noPreset: true },
    { key: "uiScale", group: "Display", type: "choice", label: "UI scale", desc: "Size of everything on the computer screen.", def: 1, options: [[1, "100%"], [1.15, "115%"], [1.3, "130%"]], noPreset: true },
    { key: "autoRestore", group: "Saving", label: "Restore autosave on start", desc: "Scene edits come back after a reload. Off in safe start.", noPreset: true },
    { key: "propLimit", group: "Performance", label: "Prop limit", desc: "Stop new props at 100 to protect the frame rate.", noPreset: true },
    { key: "inspectorMode", group: "Inspector", type: "choice", label: "Inspector mode", desc: "Simple: the 10 most used. Advanced: every option, in groups.", def: "simple", options: [["simple", "Simple"], ["advanced", "Advanced"]], noPreset: true },
    { key: "advancedPhysics", group: "Inspector", label: "Advanced physics", desc: "Drag, locks, start velocity, forces and collision layers.", def: false },
    { key: "materialPreview", group: "Inspector", label: "Material preview", desc: "A small live sphere of the selected material." },
    { key: "perfBadges", group: "Inspector", label: "Performance badges", desc: "Triangles, materials and texture memory per object." },
    { key: "validation", group: "Inspector", label: "Validation warnings", desc: "Heavy models, missing textures, things below the floor." },
    { key: "sceneSettings", group: "Inspector", label: "Scene settings panel", desc: "Sun, fog, exposure, gravity and kill plane in the Inspector." }
  ];
  var PRESETS = {
    minimal: { wristTablet: false, console: true, statusBar: false, palette: false, pointerLabels: false, undoButtons: false, playControls: false, savedLayout: false, editorHelpers: false, advancedPhysics: false, materialPreview: false, perfBadges: false, validation: false, sceneSettings: false },
    comfort: { wristTablet: true, console: true, statusBar: true, palette: true, pointerLabels: true, undoButtons: true, playControls: true, savedLayout: true, editorHelpers: true, advancedPhysics: false, materialPreview: true, perfBadges: true, validation: true, sceneSettings: true },
    full: { wristTablet: true, console: true, statusBar: true, palette: true, pointerLabels: true, undoButtons: true, playControls: true, savedLayout: true, editorHelpers: true, advancedPhysics: true, materialPreview: true, perfBadges: true, validation: true, sceneSettings: true }
  };
  var DEFAULTS = { zoomScreen: true, wristTablet: true, palette: true, pointerLabels: true, autoRestore: true, console: true, statusBar: true, undoButtons: true, playControls: true, savedLayout: true, editorHelpers: true, propLimit: true, advancedPhysics: false, materialPreview: true, perfBadges: true, validation: true, sceneSettings: true };

  function waitForStudio() {
    return new Promise(function (resolve) {
      (function check() {
        var s = window.__studio;
        var os = s && s.ready && ((s.computer && s.computer.os) || (s.targets && s.targets.computer && s.targets.computer.os));
        if (os && s.THREE && os.apps.get("system")) resolve({ S: s, os: os });
        else setTimeout(check, 250);
      })();
    });
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function inRect(x, y, b) { return b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
  function fit(c, text, maxW) {
    if (c.measureText(text).width <= maxW) return text;
    var lo = 0, hi = text.length;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (c.measureText(text.slice(0, mid) + "…").width <= maxW) lo = mid; else hi = mid - 1; }
    return text.slice(0, lo) + "…";
  }

  waitForStudio().then(function (ctx) {
    var S = ctx.S, os = ctx.os;
    var UI = os.fonts.ui, MONO = os.fonts.mono;
    var safe = !!window.__studioSafe;

    // ---------- settings store ----------
    var stored = {};
    try { stored = JSON.parse(os.storage.get("ui.settings") || "{}") || {}; } catch (e) { stored = {}; }
    if (os.storage.get("perf.propLimit") === "off" && stored.propLimit === undefined) stored.propLimit = false; // Phase 4 key
    var listeners = [];
    function effective(key) {
      if (safe && key in PRESETS.minimal) return PRESETS.minimal[key];
      return key in stored ? !!stored[key] : !!DEFAULTS[key];
    }
    function save() { os.storage.set("ui.settings", JSON.stringify(stored)); }
    function changed() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); os.invalidate(); }
    var Settings = window.__studioUI = {
      safe: safe, features: FEATURES,
      get: effective,
      value: function (key) { var f = FEATURES.find(function (x) { return x.key === key; }); return key in stored ? stored[key] : f ? f.def : undefined; },
      setValue: function (key, v) { stored[key] = v; save(); changed(); },
      set: function (key, v) { if (safe && key in PRESETS.minimal) return; stored[key] = !!v; save(); changed(); },
      apply: function (name) {
        var p = PRESETS[name]; if (!p || safe) return;
        for (var k in p) stored[k] = p[k];
        save(); changed();
      },
      reset: function () { if (safe) return; var keep = stored.propLimit; stored = {}; if (keep !== undefined) stored.propLimit = keep; save(); changed(); },
      preset: function () {
        for (var name in PRESETS) {
          var p = PRESETS[name], ok = true;
          for (var k in p) if (effective(k) !== p[k]) ok = false;
          if (ok) return name;
        }
        return null;
      },
      on: function (fn) { listeners.push(fn); }
    };

    // ---------- Editor mode ----------
    var editor = S.editor, camera = S.camera, diag = S.diag;
    var editorMode = false;
    // The move tool asks editor.worldTool; outside Editor mode it reads false whatever Play/Edit says.
    if (editor && "worldTool" in editor) {
      var wantTool = editor.worldTool;
      Object.defineProperty(editor, "worldTool", {
        configurable: true,
        get: function () { return wantTool && editorMode; },
        set: function (v) { wantTool = !!v; }
      });
    }
    function toEditorLayer(o) { if (o && o.layers && !o.userData.__editorLayer) { o.layers.set(EDITOR_LAYER); o.userData.__editorLayer = true; } }
    function tagHelpers() {
      if (editor && editor.highlights) editor.highlights.forEach(toEditorLayer);
      if (diag) {
        if (diag.boundsGroup) diag.boundsGroup.traverse(function (o) { if (!o.userData.__editorLayer) { o.layers.set(EDITOR_LAYER); o.userData.__editorLayer = true; } });
        toEditorLayer(diag.colliderLines); toEditorLayer(diag.frustum);
      }
    }
    function inRoom() { var r = window.__rally; return !(r && r.mode && r.mode !== "room"); }
    function computeEditorMode() {
      var w = os.wm.byApp("code");
      return !!(w && !w.minimized) && inRoom();
    }
    function applyEditorMode() {
      // editing visuals are for editing: hidden while the game plays
      var show = editorMode && effective("editorHelpers") && !(S.runtime && S.runtime.mode === "play");
      if (show) camera.layers.enable(EDITOR_LAYER); else camera.layers.disable(EDITOR_LAYER);
      if (editor && editor.moving && !editorMode) { try { editor.endMove(false); } catch (e) {} }
    }
    window.__studioEditorMode = { get on() { return editorMode; } };
    Settings.on(applyEditorMode);
    setInterval(function () {
      tagHelpers();
      var m = computeEditorMode();
      if (m !== editorMode) {
        editorMode = m;
        if (S.log) S.log.info(m ? "Editor mode on" : "Editor mode off");
      }
      applyEditorMode();
      refreshStatus();
    }, 250);
    tagHelpers(); applyEditorMode();

    // ---------- Status bar (menu bar) ----------
    var statusSig = "";
    function frameHealth() {
      var h = S.profiler && S.profiler.history;
      if (!h || h.length < 10) return null;
      var n = Math.min(72, h.length), sum = 0;
      for (var i = h.length - n; i < h.length; i++) sum += (h[i].ms && h[i].ms.frame) || 0;
      var avg = sum / n;
      return avg <= 11 ? "smooth" : avg <= 13.9 ? "tight" : "over";
    }
    function statusParts() {
      var props = window.__studioProps ? window.__studioProps.count() : (S.physics && S.physics.props ? S.physics.props.length : 0);
      var rm = S.runtime ? S.runtime.mode : "play";
      return { editor: editorMode, run: rm === "edit" ? "Stopped" : rm === "paused" ? "Paused" : "Playing", props: props, frame: frameHealth() };
    }
    function refreshStatus() {
      if (!effective("statusBar")) { if (statusSig) { statusSig = ""; os.invalidate(); } return; }
      var p = statusParts(), sig = p.editor + "|" + p.run + "|" + p.props + "|" + p.frame;
      if (sig !== statusSig) { statusSig = sig; os.invalidate(); }
    }
    var drawMenuBar = os.drawMenuBar.bind(os);
    os.drawMenuBar = function (c, focused) {
      drawMenuBar(c, focused);
      if (!effective("statusBar")) return;
      var p = statusParts();
      var d = new Date();
      var clock = d.toLocaleDateString(void 0, { weekday: "short", day: "numeric", month: "short" }) + "   " + d.toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit" });
      c.save();
      c.font = "500 18px " + UI; c.textBaseline = "middle";
      var x = os.W - 22 - c.measureText(clock).width - 40;
      var items = [];
      if (p.frame) items.push({ dot: p.frame === "smooth" ? "#30a14e" : p.frame === "tight" ? "#d4a017" : "#d93025", text: p.frame === "smooth" ? "Frame smooth" : p.frame === "tight" ? "Frame tight" : "Frame over budget" });
      items.push({ text: p.props + (p.props === 1 ? " prop" : " props") });
      items.push({ text: p.run });
      if (p.editor) items.push({ dot: "#0a84ff", text: "Editor mode" });
      c.textAlign = "right";
      items.forEach(function (it) {
        c.fillStyle = "#3a3a3c"; c.fillText(it.text, x, 18);
        x -= c.measureText(it.text).width;
        if (it.dot) { c.fillStyle = it.dot; c.beginPath(); c.arc(x - 12, 18, 5, 0, Math.PI * 2); c.fill(); x -= 18; }
        x -= 30;
      });
      c.restore();
    };

    // ---------- Console app ----------
    var LOG = S.log;
    var LEVEL = { info: { dot: "#8e8e93", label: "Info" }, warn: { dot: "#d4a017", label: "Warning" }, error: { dot: "#d93025", label: "Error" } };
    class ConsoleApp {
      id = "console"; title = "Console";
      defaultRect = { x: 160, y: 120, w: 1200, h: 720 }; minSize = [640, 360];
      filter = "all"; scroll = 0; follow = true; hits = {}; rowH = 34; barH = 64; sig = ""; note = ""; noteT = 0;
      inputH = 52; input = ""; past = []; pastAt = -1; blink = -1; // command line (addons/commands.js)
      constructor(o) { this.os = o; }
      rows() {
        var f = this.filter, list = LOG ? LOG.entries : [];
        return f === "all" ? list : list.filter(function (e) { return e.level === f; });
      }
      layout(w) {
        var b = {}, x = 16, y = 12, h = 40;
        [["all", "All", 76], ["error", "Errors", 100], ["warn", "Warnings", 124], ["info", "Info", 76]].forEach(function (f) { b["f:" + f[0]] = { x: x, y: y, w: f[2], h: h, label: f[1] }; x += f[2]; });
        b.clear = { x: w - 16 - 96, y: y, w: 96, h: h, label: "Clear" };
        b.copy = { x: w - 16 - 96 - 12 - 96, y: y, w: 96, h: h, label: "Copy" };
        b.follow = { x: w - 16 - 96 - 12 - 96 - 12 - 132, y: y, w: 132, h: h, label: (this.follow ? "☑" : "☐") + " Follow" };
        return b;
      }
      maxScroll(r) { var vis = Math.floor((r.h - this.barH - this.inputH - 8) / this.rowH); return Math.max(0, this.rows().length - vis); }
      draw(c, r, focused, t) {
        var b = this.hits = this.layout(r.w), self = this;
        this.lastRect = r;
        c.fillStyle = "#1c1d21"; c.fillRect(r.x, r.y, r.w, r.h);
        c.fillStyle = "#26272c"; c.fillRect(r.x, r.y, r.w, this.barH);
        c.fillStyle = "#34353b"; c.fillRect(r.x, r.y + this.barH - 1, r.w, 1);
        rr(c, r.x + 14, r.y + 10, 380, 44, 11); c.fillStyle = "#34353b"; c.fill();
        c.font = "600 17px " + UI; c.textAlign = "center"; c.textBaseline = "middle";
        Object.keys(b).forEach(function (k) {
          var bb = b[k];
          if (k.indexOf("f:") === 0) {
            var on = self.filter === k.slice(2);
            if (on) { rr(c, r.x + bb.x + 2, r.y + bb.y, bb.w - 4, bb.h, 9); c.fillStyle = "#4a4b52"; c.fill(); }
            c.fillStyle = on ? "#ffffff" : "#a1a1a8";
          } else {
            rr(c, r.x + bb.x, r.y + bb.y, bb.w, bb.h, 9); c.fillStyle = "#34353b"; c.fill();
            c.fillStyle = "#e5e5ea";
          }
          c.fillText(bb.label, r.x + bb.x + bb.w / 2, r.y + bb.y + bb.h / 2 + 1);
        });
        c.textAlign = "left";
        var rows = this.rows(), max = this.maxScroll(r);
        if (this.follow) this.scroll = max;
        this.scroll = Math.max(0, Math.min(this.scroll, max));
        var y = r.y + this.barH + 6, end = r.y + r.h - this.inputH - 4;
        if (!rows.length) {
          c.fillStyle = "#8e8e93"; c.font = "400 18px " + UI;
          c.fillText(LOG ? "Nothing here yet." : "The game's log is not available.", r.x + 22, y + 24);
        }
        c.font = "400 17px " + MONO;
        for (var i = this.scroll; i < rows.length && y + this.rowH <= end; i++, y += this.rowH) {
          var e = rows[i], lv = LEVEL[e.level] || LEVEL.info;
          if (e.level === "error") { c.fillStyle = "rgba(217,48,37,0.10)"; c.fillRect(r.x, y, r.w, this.rowH); }
          var secs = Math.floor(e.t / 1000), stamp = String(Math.floor(secs / 60)).padStart(2, "0") + ":" + String(secs % 60).padStart(2, "0");
          c.fillStyle = "#6e6e75"; c.fillText(stamp, r.x + 18, y + this.rowH / 2 + 1);
          c.fillStyle = lv.dot; c.beginPath(); c.arc(r.x + 92, y + this.rowH / 2, 5, 0, Math.PI * 2); c.fill();
          var badge = e.count > 1 ? "×" + e.count : "";
          var bw = badge ? c.measureText(badge).width + 18 : 0;
          c.fillStyle = e.level === "error" ? "#ff8a80" : e.level === "warn" ? "#ffd36b" : "#e5e5ea";
          c.fillText(fit(c, String(e.msg), r.w - 130 - bw), r.x + 110, y + this.rowH / 2 + 1);
          if (badge) { c.fillStyle = "#8e8e93"; c.textAlign = "right"; c.fillText(badge, r.x + r.w - 16, y + this.rowH / 2 + 1); c.textAlign = "left"; }
        }
        // command line
        var iy = r.y + r.h - this.inputH;
        c.fillStyle = "#26272c"; c.fillRect(r.x, iy, r.w, this.inputH);
        c.fillStyle = "#34353b"; c.fillRect(r.x, iy, r.w, 1);
        c.font = "500 19px " + MONO; c.textBaseline = "middle";
        c.fillStyle = "#0a84ff"; c.fillText("›", r.x + 18, iy + this.inputH / 2);
        c.fillStyle = this.input ? "#ffffff" : "#6e6e75";
        var shownIn = this.input || "Type a command, or help";
        c.fillText(shownIn, r.x + 40, iy + this.inputH / 2);
        if (focused && Math.floor(t / 500) % 2 === 0) { var cw = this.input ? c.measureText(this.input).width : 0; c.fillStyle = "#0a84ff"; c.fillRect(r.x + 41 + cw, iy + 14, 2, this.inputH - 28); }
        c.textBaseline = "alphabetic";
        if (this.note && t - this.noteT < 2500) {
          c.font = "500 16px " + UI; var nw = c.measureText(this.note).width + 28;
          rr(c, r.x + r.w - nw - 16, r.y + r.h - 50, nw, 36, 9); c.fillStyle = "#3a3b42"; c.fill();
          c.fillStyle = "#ffffff"; c.fillText(this.note, r.x + r.w - nw - 2, r.y + r.h - 31);
        }
        c.textBaseline = "alphabetic";
        this.sig = (LOG ? LOG.version : 0) + "|" + this.filter + "|" + this.scroll;
      }
      animating(focused, t) {
        var sig = (LOG ? LOG.version : 0) + "|" + this.filter + "|" + this.scroll;
        var ph = Math.floor(t / 500); if (focused && ph !== this.blink) { this.blink = ph; return true; }
        return sig !== this.sig || (!!this.note && t - this.noteT < 2600);
      }
      cursor(x, y) { var b = this.hits; for (var k in b) if (inRect(x, y, b[k])) return "pointer"; return "arrow"; }
      pointerDown(x, y, r) {
        var b = this.hits;
        this.drag = null;
        for (var k in b) {
          if (!inRect(x, y, b[k])) continue;
          if (k.indexOf("f:") === 0) { this.filter = k.slice(2); this.follow = true; }
          else if (k === "clear") { if (LOG) { LOG.entries.length = 0; LOG.version++; } this.scroll = 0; }
          else if (k === "copy") this.copy();
          else if (k === "follow") this.follow = !this.follow;
          this.os.invalidate();
          return;
        }
        if (y > this.barH) this.drag = { y: y, scroll: this.scroll };
      }
      pointerMove(x, y, r, down) {
        if (!down || !this.drag) return;
        var d = Math.round((this.drag.y - y) / this.rowH);
        var s = Math.max(0, Math.min(this.drag.scroll + d, this.maxScroll(r)));
        if (s !== this.scroll) { this.scroll = s; this.follow = s >= this.maxScroll(r); this.os.invalidate(); }
      }
      pointerUp() { this.drag = null; }
      wheel(d) {
        var r = this.lastRect; if (!r) return;
        this.scroll = Math.max(0, Math.min(this.scroll + Math.sign(d) * 3, this.maxScroll(r)));
        this.follow = this.scroll >= this.maxScroll(r);
        this.os.invalidate();
      }
      key(e) {
        if (e.code === "Enter" || e.code === "NumpadEnter") { this.execute(); return true; }
        if (e.code === "Backspace") { this.input = this.input.slice(0, -1); this.os.invalidate(); return true; }
        if (e.code === "Escape") { this.input = ""; this.os.invalidate(); return true; }
        if (e.code === "ArrowUp" || e.code === "ArrowDown") {
          if (!this.past.length) return true;
          this.pastAt = Math.max(-1, Math.min(this.past.length - 1, this.pastAt + (e.code === "ArrowUp" ? 1 : -1)));
          this.input = this.pastAt < 0 ? "" : this.past[this.pastAt]; this.os.invalidate(); return true;
        }
        if (e.key && e.key.length === 1 && !e.ctrl && !e.meta && !e.alt) { this.input += e.key; this.os.invalidate(); return true; }
        if (!this.lastRect) return false;
        if (e.code === "End") { this.follow = true; this.os.invalidate(); return true; }
        if (e.code === "Home") { this.follow = false; this.scroll = 0; this.os.invalidate(); return true; }
        if (e.code === "PageUp" || e.code === "PageDown") { this.wheel(e.code === "PageUp" ? -1 : 1); this.wheel(e.code === "PageUp" ? -1 : 1); return true; }
        return false;
      }
      // Runs a typed command through the command runner. "help" prints the registry here (Console help).
      execute() {
        var text = this.input.trim(), C = window.__studioCommands;
        if (!text) return;
        this.past.unshift(text); this.past = this.past.slice(0, 30); this.pastAt = -1; this.input = ""; this.follow = true;
        if (!C || !C.ready) { if (LOG) LOG.warn("Commands are still loading."); this.os.invalidate(); return; }
        if (/^(help|list commands|commands|what can i say)$/i.test(text)) {
          var groups = {};
          C.registry.commands.forEach(function (c) { (groups[c.group] = groups[c.group] || []).push(c.status === "planned" ? c.example + " (later)" : c.example); });
          if (LOG) { LOG.info("Commands (registry version " + C.registry.version + "). Type one, or 'commands for physics'."); Object.keys(groups).forEach(function (g) { LOG.info(g + ": " + groups[g].join(" · ")); }); }
          this.filter = "all"; this.os.invalidate(); return;
        }
        var m = /^(?:commands for|help) (.+)$/i.exec(text);
        if (m) {
          var want = m[1].toLowerCase(), list = C.registry.commands.filter(function (c) { return c.group.toLowerCase().indexOf(want) >= 0; });
          if (LOG) { if (!list.length) LOG.warn("No group called " + m[1] + "."); list.forEach(function (c) { LOG.info(c.example + "  —  " + c.phrases[0] + (c.status === "planned" ? "  (" + c.planned + ")" : "")); }); }
          this.os.invalidate(); return;
        }
        var res = C.run(text);
        if (!res.ok && LOG) LOG.warn("› " + text + "  —  " + res.reply);
        this.os.invalidate();
      }
      copy() {
        var text = this.rows().map(function (e) { return "[" + e.level + "] " + e.msg + (e.count > 1 ? " (x" + e.count + ")" : ""); }).join("\n");
        var self = this;
        function done(ok) { self.note = ok ? "Copied " + self.rows().length + " lines" : "Copy is not allowed here"; self.noteT = performance.now(); self.os.invalidate(); }
        try { navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); }); } catch (e) { done(false); }
      }
      drawIcon(c, x, y, s) {
        c.save();
        c.shadowColor = "rgba(0,0,0,0.25)"; c.shadowBlur = 8; c.shadowOffsetY = 3;
        rr(c, x, y, s, s, s * 0.23);
        var g = c.createLinearGradient(0, y, 0, y + s); g.addColorStop(0, "#3a3c44"); g.addColorStop(1, "#15161a");
        c.fillStyle = g; c.fill(); c.restore();
        c.fillStyle = "#e5e5ea"; c.font = "700 " + Math.round(s * 0.3) + "px " + MONO; c.textBaseline = "middle";
        c.fillText(">_", x + s * 0.16, y + s * 0.36);
        [["#8e8e93", 0.58], ["#d4a017", 0.7], ["#d93025", 0.82]].forEach(function (l) { c.fillStyle = l[0]; c.fillRect(x + s * 0.16, y + s * l[1] - s * 0.03, s * (0.68 - l[1] * 0.3), s * 0.05); });
        c.textBaseline = "alphabetic";
      }
    }
    var consoleApp = new ConsoleApp(os);
    os.apps.set(consoleApp.id, consoleApp);
    function applyConsole() {
      var on = effective("console"), i = os.dockApps.indexOf("console");
      if (on && i < 0) os.dockApps.splice(Math.max(0, os.dockApps.indexOf("system")), 0, "console");
      if (!on && i >= 0) {
        os.dockApps.splice(i, 1);
        var w = os.wm.byApp("console"); if (w) os.wm.close(w.id);
      }
      os.invalidate();
    }
    Settings.on(applyConsole);
    applyConsole();

    // ---------- UI Settings page in the System app ----------
    var sys = os.apps.get("system");
    var TAB_H = 60;
    var sysDraw = sys.draw.bind(sys), sysUp = sys.pointerUp ? sys.pointerUp.bind(sys) : null, sysCursor = sys.cursor ? sys.cursor.bind(sys) : null;
    var sysAnimating = sys.animating ? sys.animating.bind(sys) : null;
    sys.defaultRect = { x: 1080, y: 120, w: 780, h: 800 }; sys.minSize = [640, 600];
    sys.page = "computer"; sys.uiHits = []; sys.uiScroll = 0; sys.uiMaxScroll = 0;
    var sysWheel = sys.wheel ? sys.wheel.bind(sys) : null;
    sys.wheel = function (d) {
      if (sys.page !== "ui") { if (sysWheel) sysWheel(d); return; }
      sys.uiScroll = Math.max(0, Math.min(sys.uiMaxScroll, sys.uiScroll + Math.sign(d) * 66));
      os.invalidate();
    };
    // The System window opens small at start-up; the settings page needs more room, so it grows once.
    function fitWindow() {
      var w = os.wm.byApp("system"), d = sys.defaultRect;
      if (!w || (w.w >= d.w && w.h >= d.h)) return;
      w.x = Math.min(w.x, os.W - d.w - 20); w.y = Math.max(50, Math.min(w.y, os.H - d.h - 130));
      w.w = Math.max(w.w, d.w); w.h = Math.max(w.h, d.h);
      if (os.wm.clamp) os.wm.clamp(w);
    }
    function shift(r) { return { x: r.x, y: r.y + TAB_H, w: r.w, h: r.h - TAB_H }; }
    function tabs(w) { return { computer: { x: 16, y: 10, w: 170, h: 40 }, ui: { x: 186, y: 10, w: 150, h: 40 } }; }
    sys.draw = function (c, r, focused, t) {
      c.fillStyle = "#f4f4f6"; c.fillRect(r.x, r.y, r.w, TAB_H);
      c.fillStyle = "#dadade"; c.fillRect(r.x, r.y + TAB_H - 1, r.w, 1);
      var tb = tabs(r.w);
      rr(c, r.x + 14, r.y + 8, 324, 44, 11); c.fillStyle = "#e3e3e8"; c.fill();
      c.font = "600 17px " + UI; c.textAlign = "center"; c.textBaseline = "middle";
      [["computer", "This computer"], ["ui", "UI Settings"]].forEach(function (p) {
        var b = tb[p[0]], on = sys.page === p[0];
        if (on) { rr(c, r.x + b.x + 2, r.y + b.y, b.w - 4, b.h, 9); c.fillStyle = "#ffffff"; c.fill(); }
        c.fillStyle = on ? "#1d1d1f" : "#6b6b70"; c.fillText(p[1], r.x + b.x + b.w / 2, r.y + b.y + b.h / 2 + 1);
      });
      c.textAlign = "left"; c.textBaseline = "alphabetic";
      if (sys.page === "computer") { sysDraw(c, shift(r), focused, t); return; }
      drawSettings(c, shift(r));
    };
    function drawSettings(c, r) {
      var hits = sys.uiHits = [];
      c.fillStyle = "#ffffff"; c.fillRect(r.x, r.y, r.w, r.h);
      var x = r.x + 28, y = r.y + 44;
      c.fillStyle = "#1d1d1f"; c.font = "700 24px " + UI; c.fillText("UI Settings", x, y);
      c.fillStyle = "#6b6b70"; c.font = "400 17px " + UI; c.fillText("Changes apply at once and are remembered.", x, y + 28);
      (function topReset() { // the same two-press reset as the STUDIO row at the bottom, where it is easy to find
        var RS = window.__studioReset; if (!RS) return;
        var armedT = RS.armed(), bw2 = armedT ? 236 : 170, bx2 = r.x + r.w - 28 - bw2, by2 = y - 30;
        rr(c, bx2, by2, bw2, 40, 10); c.fillStyle = RS.running ? "#9a9aa0" : armedT ? "#d70015" : "#ffe5e5"; c.fill();
        c.fillStyle = armedT || RS.running ? "#ffffff" : "#c62828"; c.font = "700 16px " + UI; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(RS.running ? "Resetting\u2026" : armedT ? "Yes, reset everything" : "Reset studio\u2026", bx2 + bw2 / 2, by2 + 21); c.textAlign = "left"; c.textBaseline = "alphabetic";
        hits.push({ x: bx2 - r.x, y: by2 - r.y, w: bw2, h: 40, action: "studioReset" });
      })();
      y += 56;
      if (safe) {
        rr(c, x, y, r.w - 56, 44, 10); c.fillStyle = "#fff4d6"; c.fill();
        c.fillStyle = "#7a5a00"; c.font = "500 16px " + UI; c.textBaseline = "middle";
        c.fillText(fit(c, "Safe start: Minimal is in use. Remove ?safe=1 from the address to use your settings.", r.w - 80), x + 14, y + 23);
        c.textBaseline = "alphabetic"; y += 60;
      }
      var current = Settings.preset(), bx = x;
      c.font = "600 17px " + UI; c.textAlign = "center"; c.textBaseline = "middle";
      [["minimal", "Minimal"], ["comfort", "Comfort"], ["full", "Full"], ["reset", "Reset"]].forEach(function (p) {
        var w = p[0] === "reset" ? 96 : 120, on = current === p[0] && p[0] !== "reset";
        rr(c, bx, y, w, 42, 10);
        c.fillStyle = on ? "#0a84ff" : safe ? "#f2f2f4" : "#ececef"; c.fill();
        c.fillStyle = on ? "#ffffff" : safe ? "#b0b0b5" : "#1d1d1f";
        c.fillText(p[1], bx + w / 2, y + 22);
        hits.push({ x: bx - r.x, y: y - r.y, w: w, h: 42, preset: p[0] });
        bx += w + 10;
      });
      c.textAlign = "left"; c.textBaseline = "alphabetic";
      y += 70;
      var group = null;
      var listTop = y;
      c.save(); c.beginPath(); c.rect(r.x, listTop - 4, r.w, r.y + r.h - listTop + 4); c.clip();
      if (sys.uiMaxScroll && sys.uiScroll > sys.uiMaxScroll) sys.uiScroll = sys.uiMaxScroll;   // clamp before drawing, not only after
      y -= sys.uiScroll;
      FEATURES.forEach(function (f) {
        if (f.group !== group) {
          if (group) y += 22;
          group = f.group;
          c.fillStyle = "#8a8a8e"; c.font = "700 14px " + UI; c.fillText(group.toUpperCase(), x, y + 12); y += 22;
        }
        var locked = safe && f.key in PRESETS.minimal, rowH = 66, visible = y + rowH > listTop && y < r.y + r.h;
        c.fillStyle = "#e5e5ea"; c.fillRect(x, y, r.w - 56, 1);
        c.fillStyle = locked ? "#9a9aa0" : "#1d1d1f"; c.font = "600 19px " + UI; c.fillText(f.label, x, y + 28);
        c.font = "600 16px " + UI;
        var chipW = f.type === "choice" ? f.options.map(function (o) { return Math.max(72, Math.ceil(c.measureText(o[1]).width) + 24); }) : null;
        var ctlW = chipW ? chipW.reduce(function (a, w) { return a + w + 4; }, 0) : 64;
        c.fillStyle = "#6b6b70"; c.font = "400 16px " + UI; c.fillText(fit(c, f.desc, r.w - 56 - ctlW - 24), x, y + 52);
        if (f.type === "choice") {
          var val = Settings.value(f.key), ox = r.x + r.w - 28 - ctlW;
          f.options.forEach(function (o, oi) {
            var on = o[0] === val, cw = chipW[oi];
            rr(c, ox, y + 15, cw, 36, 9); c.fillStyle = on ? "#0a84ff" : "#ececef"; c.fill();
            c.fillStyle = on ? "#ffffff" : "#1d1d1f"; c.font = "600 16px " + UI; c.textAlign = "center"; c.textBaseline = "middle";
            c.fillText(o[1], ox + cw / 2, y + 34); c.textAlign = "left"; c.textBaseline = "alphabetic";
            if (visible) hits.push({ x: ox - r.x, y: y + 15 - r.y, w: cw, h: 36, key: f.key, value: o[0] });
            ox += cw + 4;
          });
        } else {
          var on = effective(f.key), sx = r.x + r.w - 28 - 64, sy = y + 15;
          rr(c, sx, sy, 64, 36, 18); c.fillStyle = on ? (locked ? "#9cc9ff" : "#34c759") : "#d1d1d6"; c.fill();
          c.beginPath(); c.arc(on ? sx + 46 : sx + 18, sy + 18, 15, 0, Math.PI * 2); c.fillStyle = "#ffffff"; c.fill();
          if (visible) hits.push({ x: 0, y: Math.max(y, listTop) - r.y, w: r.w, h: Math.min(rowH, y + rowH - listTop), key: f.key, locked: locked });
        }
        y += rowH;
      });
      // ---------- the whole studio: reset (asks twice) ----------
      y += 22;
      c.fillStyle = "#8a8a8e"; c.font = "700 14px " + UI; c.fillText("STUDIO", x, y + 12); y += 22;
      c.fillStyle = "#e5e5ea"; c.fillRect(x, y, r.w - 56, 1);
      var RS = window.__studioReset, armed = !!(RS && RS.armed()), busyR = !!(RS && RS.running), bw = 236, bxr = r.x + r.w - 28 - bw;
      c.fillStyle = "#1d1d1f"; c.font = "600 19px " + UI; c.fillText("Reset the whole studio", x, y + 28);
      c.fillStyle = armed ? "#c62828" : "#6b6b70"; c.font = (armed ? "600" : "400") + " 16px " + UI;
      c.fillText(fit(c, armed ? "Sure? Press again to clear every edit, prop, script and setting." : "Back to the room as built: props, edits, scripts, layout, settings, imported models.", r.w - 56 - bw - 24), x, y + 52);
      rr(c, bxr, y + 13, bw, 40, 10); c.fillStyle = busyR ? "#9a9aa0" : armed ? "#d70015" : "#ffe5e5"; c.fill();
      c.fillStyle = armed || busyR ? "#ffffff" : "#c62828"; c.font = "700 16px " + UI; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(busyR ? "Resetting\u2026" : armed ? "Yes, reset everything" : "Reset studio\u2026", bxr + bw / 2, y + 34); c.textAlign = "left"; c.textBaseline = "alphabetic";
      if (y + 66 > listTop && y < r.y + r.h && RS) hits.push({ x: bxr - r.x, y: Math.max(y + 13, listTop) - r.y, w: bw, h: 40, action: "studioReset" });
      y += 66;
      c.fillStyle = "#9a9aa0"; c.font = "400 15px " + UI;
      c.fillText(fit(c, "Each switch takes effect at once. Safe start (?safe=1) uses Minimal for that visit only.", r.w - 56), x, y + 30);
      c.restore();
      sys.uiMaxScroll = Math.max(0, y + sys.uiScroll + 50 - (r.y + r.h));
      if (sys.uiScroll > sys.uiMaxScroll) sys.uiScroll = sys.uiMaxScroll;
    }
    sys.pointerUp = function (x, y, r) {
      if (y < TAB_H) {
        var tb = tabs(r.w);
        if (inRect(x, y, tb.computer)) sys.page = "computer";
        else if (inRect(x, y, tb.ui)) { sys.page = "ui"; fitWindow(); }
        os.invalidate(); return;
      }
      if (sys.page === "computer") { if (sysUp) sysUp(x, y - TAB_H, shift(r)); return; }
      var yy = y - TAB_H;
      for (var i = 0; i < sys.uiHits.length; i++) {
        var h = sys.uiHits[i];
        if (!inRect(x, yy, h)) continue;
        if (h.action === "studioReset") { if (window.__studioReset) window.__studioReset.press(); }
        else if (h.preset) { if (h.preset === "reset") Settings.reset(); else Settings.apply(h.preset); }
        else if (h.value !== undefined) Settings.setValue(h.key, h.value);
        else if (h.key && !h.locked) Settings.set(h.key, !effective(h.key));
        os.invalidate(); return;
      }
    };
    sys.cursor = function (x, y, r) {
      if (y < TAB_H) { var tb = tabs(r.w); return inRect(x, y, tb.computer) || inRect(x, y, tb.ui) ? "pointer" : "arrow"; }
      if (sys.page === "computer") return sysCursor ? sysCursor(x, y - TAB_H, shift(r)) : "arrow";
      var yy = y - TAB_H;
      return sys.uiHits.some(function (h) { return inRect(x, yy, h) && !h.locked && !(safe && h.preset); }) ? "pointer" : "arrow";
    };
    sys.animating = function (focused, t) { return sys.page === "computer" && sysAnimating ? sysAnimating(focused, t) : false; };

    // ---------- UI scale ----------
    // The computer lays out on os.W x os.H and draws onto a fixed 1920x1080 canvas. Scaling = a smaller
    // logical screen drawn with a transform, so text and buttons grow while the canvas, the monitor and
    // the pointer mapping (uvToPixel reads os.W/os.H) stay as they are.
    var BASE_W = os.W, BASE_H = os.H, scale = 1;
    var render = os.render.bind(os);
    os.render = function (t) {
      if (scale === 1) return render(t);
      var c = os.ctx; c.save(); c.setTransform(scale, 0, 0, scale, 0, 0);
      try { return render(t); } finally { c.restore(); }
    };
    function applyScale() {
      var s = Number(Settings.value("uiScale")) || 1;
      if (s === scale) return;
      scale = s;
      os.W = Math.round(BASE_W / s); os.H = Math.round(BASE_H / s);
      if (os.wm.desk) { os.wm.desk.w = os.W; os.wm.desk.h = os.H - os.wm.desk.y; }
      var studio = os.apps.get("studio");
      if (studio && studio.vp) { studio.vp.osW = os.W; studio.vp.osH = os.H; }
      os.wm.windows.forEach(function (w) {
        w.w = Math.min(w.w, os.W - 20); w.h = Math.min(w.h, os.H - 140);
        if (os.wm.clamp) os.wm.clamp(w);
      });
      os.cursor.x = Math.min(os.cursor.x, os.W - 1); os.cursor.y = Math.min(os.cursor.y, os.H - 1);
      os.dirty = true; os.invalidate();
    }
    Settings.on(applyScale);
    applyScale();
    // a newly opened window fits on the (possibly scaled) screen
    var openApp = os.openApp.bind(os);
    os.openApp = function (id) {
      var had = !!os.wm.byApp(id), r = openApp(id), w = os.wm.byApp(id);
      if (w && !had && os.wm.desk) {
        var d = os.wm.desk;
        w.w = Math.min(w.w, d.w); w.h = Math.min(w.h, d.h - 110);
        w.x = Math.max(d.x, Math.min(w.x, d.x + d.w - w.w));
        w.y = Math.max(d.y, Math.min(w.y, d.y + d.h - 110 - w.h));
      }
      return r;
    };

    // ---------- pointer labels (desktop) ----------
    // The engine already works out what the centre dot aims at every frame (desktop.pick) and turns the dot
    // blue; the label reuses that result, so it costs no extra ray.
    var desk = S.desktop, label = document.createElement("div");
    label.id = "pointer-label";
    label.style.cssText = "position:fixed;left:50%;top:calc(50% + 16px);transform:translateX(-50%);z-index:4;pointer-events:none;" +
      "font:500 13px system-ui,sans-serif;color:#fff;background:rgba(10,12,16,.55);padding:3px 9px;border-radius:999px;" +
      "opacity:0;transition:opacity .15s ease;white-space:nowrap";
    document.body.appendChild(label);
    var lastPick = null;
    window.__studioAim = function () { return lastPick; }; // what the desktop dot rests on (commands use it for "it")
    if (desk && typeof desk.pick === "function") {
      var pick = desk.pick.bind(desk);
      desk.pick = function () { var r = pick(); lastPick = r; return r; };
    }
    function pickText(p) {
      if (!p) return "";
      if (p.kind === "screen") return "Use the computer";
      if (p.kind === "prop") {
        var d = p.prop && p.prop.desc, e = d && S.editor && S.editor.world && S.editor.world.of && S.editor.world.of(d.object);
        var name = (e && e.name) || (d && d.name) || "";
        return "Pick up" + (name ? " " + name.replace(/[-_]/g, " ") : "");
      }
      return "";
    }
    var labelText = "";
    setInterval(function () {
      var on = effective("pointerLabels") && desk && desk.mode === "walk" && !desk.held && document.pointerLockElement && !(S.renderer.xr && S.renderer.xr.isPresenting);
      var t = on ? pickText(lastPick) : "";
      if (t !== labelText) { labelText = t; if (t) label.textContent = t; label.style.opacity = t ? "1" : "0"; }
    }, 100);

    // ---------- saved window layout ----------
    // Windows (app, place, size, minimised, stacking order) and the Game Editor's tab are stored on every
    // change and reopened at start-up, once the add-on apps exist. Nothing is saved before the restore
    // has run, so the start-up windows never overwrite a saved layout.
    var layoutReady = false, layoutSig = "";
    function layoutNow() {
      var ed = os.apps.get("code");
      return {
        windows: os.wm.windows.filter(function (w) { return w.app !== "palette"; }).map(function (w) { return { app: w.app, x: w.x, y: w.y, w: w.w, h: w.h, min: !!w.minimized }; }),
        editorTab: ed ? ed.mode : null
      };
    }
    function restoreLayout() {
      var saved = null;
      try { saved = JSON.parse(os.storage.get("ui.layout") || "null"); } catch (e) {}
      if (saved && saved.windows && effective("savedLayout")) {
        var known = saved.windows.filter(function (w) { return os.apps.get(w.app) && (w.app !== "console" || effective("console")); });
        if (known.length || saved.windows.length === 0) {
          os.wm.windows.slice().forEach(function (w) { os.wm.close(w.id); });
          known.forEach(function (w) {
            if (w.app === "code" && saved.editorTab) { var ed = os.apps.get("code"); if (ed && ed.setMode) ed.setMode(saved.editorTab); }
            var win = os.wm.open(w.app, os.apps.get(w.app).title, { x: w.x, y: w.y, w: w.w, h: w.h }, w.w, w.h);
            var m = os.apps.get(w.app).minSize; if (m) { win.minW = m[0]; win.minH = m[1]; }
            win.minimized = w.min;
            if (os.wm.clamp) os.wm.clamp(win); // keep it on screen
          });
          if (S.log) S.log.info("Window layout restored");
        }
      }
      layoutReady = true;
      layoutSig = JSON.stringify(layoutNow());
      os.invalidate();
    }
    (function waitApps(n) {
      if ((os.apps.get("code") && os.apps.get("door")) || n > 40) restoreLayout();
      else setTimeout(function () { waitApps(n + 1); }, 250);
    })(0);
    setInterval(function () {
      if (!layoutReady || !effective("savedLayout")) return;
      var sig = JSON.stringify(layoutNow());
      if (sig !== layoutSig) { layoutSig = sig; os.storage.set("ui.layout", sig); }
    }, 1000);

    if (safe && S.log) S.log.info("Safe start: Minimal UI preset in use");
    os.invalidate();
  });
})();
